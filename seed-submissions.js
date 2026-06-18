// seed-submissions.js
// Inyecta las respuestas del formulario "Censo de Usuarios" (export_censo_estandarizado.csv) en la BD.
require('dotenv').config();
const mysql = require('mysql2/promise');
const { v4: uuidv4 } = require('uuid');
const fs = require('fs');
const path = require('path');

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'app_aquanova_bd',
};

const CSV_PATH = path.resolve(__dirname, 'export_censo_estandarizado.csv');
const FORM_KEY = 'censo-masivo-catastro-v2';
const NEIGHBORHOOD_CODE = 'SMCN-001'; // Barrio Las Mercedes

// Parser CSV propio que maneja campos con comillas y comas internas
function parseCSVLine(line) {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
        const ch = line[i];
        if (ch === '"') {
            if (inQuotes && line[i + 1] === '"') { current += '"'; i++; }
            else inQuotes = !inQuotes;
        } else if (ch === ',' && !inQuotes) {
            result.push(current);
            current = '';
        } else {
            current += ch;
        }
    }
    result.push(current);
    return result;
}

function parseCSV(content) {
    // Normalizar saltos de línea y filtrar líneas vacías
    const lines = content.replace(/\r\n/g, '\n').replace(/\r/g, '\n').split('\n');
    const headers = parseCSVLine(lines[0]);
    const rows = [];
    for (let i = 1; i < lines.length; i++) {
        const line = lines[i].trim();
        if (!line) continue;
        const values = parseCSVLine(line);
        const obj = {};
        headers.forEach((h, idx) => { obj[h.trim()] = (values[idx] || '').trim(); });
        rows.push(obj);
    }
    return rows;
}

const orNull = (v) => (v === '' || v == null) ? null : v;
const orNullNum = (v) => {
    if (v === '' || v == null) return null;
    const n = Number(v);
    return isNaN(n) ? null : n;
};

const main = async () => {
    let connection;
    try {
        connection = await mysql.createConnection(DB_CONFIG);
        console.log('🔌 Conectado a MySQL.');

        // 1. Buscar form_version_id del "Censo de Usuarios"
        const [fvRows] = await connection.query(`
            SELECT fv.id AS version_id
            FROM form_versions fv
            JOIN forms f ON f.id = fv.form_id
            WHERE f.\`key\` = ? AND fv.status = 'published'
            ORDER BY fv.version DESC LIMIT 1
        `, [FORM_KEY]);

        if (!fvRows.length) {
            throw new Error(`Formulario "${FORM_KEY}" no encontrado o no publicado. Ejecuta seed.js primero.`);
        }
        const formVersionId = fvRows[0].version_id;
        console.log(`📝 form_version_id: ${formVersionId}`);

        // 2. Buscar neighborhood_id de "Barrio Las Mercedes"
        const [nRows] = await connection.query(
            'SELECT id FROM neighborhoods WHERE code = ?', [NEIGHBORHOOD_CODE]
        );
        if (!nRows.length) {
            throw new Error(`Barrio "${NEIGHBORHOOD_CODE}" no encontrado. Ejecuta seed.js primero.`);
        }
        const neighborhoodId = nRows[0].id;
        console.log(`🏘️  neighborhood_id: ${neighborhoodId}`);

        // 3. Parsear CSV
        const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
        const rows = parseCSV(csvContent);
        console.log(`📊 Filas en CSV: ${rows.length}`);

        // 4. Validar qué lot UUIDs del CSV existen en la BD
        const lotUUIDs = [...new Set(rows.map(r => r['Selecciona el predio']).filter(Boolean))];
        const validLotIds = new Set();
        if (lotUUIDs.length) {
            const placeholders = lotUUIDs.map(() => '?').join(',');
            const [existingLots] = await connection.query(
                `SELECT id FROM lots WHERE id IN (${placeholders})`, lotUUIDs
            );
            existingLots.forEach(l => validLotIds.add(l.id));
        }
        console.log(`🗺️  Lotes válidos en BD: ${validLotIds.size} de ${lotUUIDs.length} UUIDs del CSV`);
        if (validLotIds.size === 0) {
            console.log('   ⚠️  Los UUIDs de lotes del CSV no coinciden con los actuales en BD.');
            console.log('   ℹ️  Se importarán las submissions con lot_id = NULL y el UUID original quedará en responses.predio_id');
        }

        // 5. Procesar cada fila
        let inserted = 0, skipped = 0, errors = 0;

        for (const row of rows) {
            const submissionId = row['ID Respuesta'];
            if (!submissionId) continue;

            // Idempotencia: saltar si ya existe
            const [existing] = await connection.query(
                'SELECT id FROM submissions WHERE id = ?', [submissionId]
            );
            if (existing.length > 0) { skipped++; continue; }

            const lotIdRaw = row['Selecciona el predio'];
            const lotId = validLotIds.has(lotIdRaw) ? lotIdRaw : null;
            const lat = orNullNum(row['Latitud']);
            const lng = orNullNum(row['Longitud']);
            const createdAt = row['Fecha Creación'] || null;

            // Construir JSON de respuestas mapeando columnas CSV a claves del schema del formulario
            const responses = {
                // Campos extra del CSV (metadatos de campo)
                recolectado_por:              orNull(row['Recolectado Por']),
                persona_encuestada:           orNull(row['¿La persona encuestada es?']),
                predio_id:                    orNull(row['Selecciona el predio']), // UUID original (aunque no exista FK)

                // Sección: Información General y Ubicación
                fecha:                        orNull(row['Fecha']),
                municipio:                    orNull(row['Municipio']),
                zona:                         orNullNum(row['Zona']),
                manzana:                      orNullNum(row['Manzana']),
                direccion:                    orNull(row['Dirección 1']),
                direccion_2:                  orNull(row['Dirección 2']),
                plano:                        orNull(row['Plano']),

                // Sección: Identificación del Servicio
                id_usuario:                   orNullNum(row['ID Usuario']),
                cuenta_contrato:              orNull(row['Cuenta Contrato']),

                // Sección: Datos del Propietario o Poseedor
                telefono:                     orNull(row['Teléfono']),
                email:                        orNull(row['Email']),

                // Sección: Persona que Atendió la Visita
                nombre_atiende:               orNull(row['Atendió Visita - Nombre']),
                rol_atiende:                  orNull(row['Atendió Visita - Rol']),

                // Sección: Información del Medidor
                marca_medidor:                orNull(row['Marca']),
                tipo_medidor:                 orNull(row['Tipo de medidor']),
                no_serie_medidor:             orNull(row['No de serie']),
                lectura_medidor:              orNullNum(row['Lectura']),
                diametro_medidor:             orNull(row['Diámetro']),

                // Sección: Clasificación del Servicio
                tipo_punto:                   orNull(row['Tipo de Punto']),
                clase_uso:                    orNull(row['Clase de Uso']),

                // Sección: Información del Predio y Ocupación
                estado_predio:                orNull(row['Estado del Predio']),
                unidades_habitacionales:      orNullNum(row['Unidades Habitacionales']),
                unidades_no_habitacionales:   orNullNum(row['Unidades No Habitacionales']),
                numero_familias:              orNullNum(row['Número de Familias']),
                numero_habitantes:            orNullNum(row['Número de Habitantes']),
                numero_banos:                 orNullNum(row['Número de Baños']),
                numero_cocinas:               orNullNum(row['Número de cocinas del predio']),
                tiene_agua:                   orNull(row['¿Tiene agua?']),
                horas_agua:                   orNullNum(row['¿Cuántas horas del día le llega agua?']),
                tipo_actividad:               orNull(row['Tipo de Actividad']),
                tanque_reserva:               orNull(row['Tanque de Reserva']),
                capacidad_tanque_reserva:     orNull(row['Capacidad del tanque de reserva']),
                disponibilidad_cajilla:       orNull(row['Disponibilidad Cajilla']),

                // Sección: Observaciones
                observaciones:                orNull(row['Observaciones']),

                // Sección: Autorización y Tratamiento de Datos
                autorizacion_datos:           orNull(row['Autorización Datos Personales']),

                // Sección: Uso Interno - Funcionario
                nombre_inspector:             orNull(row['Nombre del inspector o funcionario que censó']),
                cc_inspector:                 orNull(row['No. C.C. (Cédula de Ciudadanía del Inspector)']),
                registro_inspector:           orNull(row['Registro']),
            };

            try {
                await connection.beginTransaction();

                // Insertar submission
                await connection.query(
                    `INSERT INTO submissions
                     (id, form_version_id, user_id, neighborhood_id, lot_id, responses, status, location_lat, location_lng, created_at, updated_at)
                     VALUES (?, ?, NULL, ?, ?, ?, 'submitted', ?, ?, ?, ?)`,
                    [
                        submissionId, formVersionId, neighborhoodId, lotId,
                        JSON.stringify(responses), lat, lng, createdAt, createdAt,
                    ]
                );

                // Insertar attachments: Fotos de fachada (pueden ser múltiples URLs separadas por "; ")
                const photoRaw = row['Foto de la fachada del predio'];
                if (photoRaw) {
                    const photoUrls = photoRaw.split(';').map(u => u.trim()).filter(Boolean);
                    for (const url of photoUrls) {
                        const filename = url.split('/').pop() || 'foto_fachada.jpg';
                        await connection.query(
                            `INSERT INTO attachments (id, submission_id, field_key, storage_path, filename, mime_type)
                             VALUES (?, ?, 'foto_fachada', ?, ?, 'image/jpeg')`,
                            [uuidv4(), submissionId, url, filename]
                        );
                    }
                }

                // Insertar attachment: Firma Digital
                const firmaUrl = (row['Firma Digital'] || '').trim();
                if (firmaUrl) {
                    const firmaFilename = firmaUrl.split('/').pop() || 'firma_digital.jpg';
                    await connection.query(
                        `INSERT INTO attachments (id, submission_id, field_key, storage_path, filename, mime_type)
                         VALUES (?, ?, 'firma_digital', ?, ?, 'image/jpeg')`,
                        [uuidv4(), submissionId, firmaUrl, firmaFilename]
                    );
                }

                // Insertar data_consent si autorizó
                if (row['Autorización Datos Personales'] === 'Sí') {
                    await connection.query(
                        `INSERT INTO data_consents (id, user_id, submission_id, policy_version, accepted, accepted_at)
                         VALUES (?, NULL, ?, 'v2024.1', TRUE, ?)`,
                        [uuidv4(), submissionId, createdAt]
                    );
                }

                // Actualizar estado del lote a 'censado' si la submission está vinculada
                if (lotId) {
                    await connection.query(
                        `UPDATE lots SET status = 'censado', updated_at = NOW()
                         WHERE id = ? AND status = 'sin_informacion'`,
                        [lotId]
                    );
                }

                await connection.commit();
                inserted++;
            } catch (e) {
                await connection.rollback();
                console.error(`❌ Error en submission ${submissionId}:`, e.message);
                errors++;
            }
        }

        console.log('\n=============================================');
        console.log(`✅ Submissions insertadas: ${inserted}`);
        console.log(`⏭️  Ya existían (skipped): ${skipped}`);
        console.log(`❌ Errores: ${errors}`);
        console.log('=============================================\n');

        if (inserted > 0) {
            // Resumen rápido de lotes actualizados
            const [censadosCount] = await connection.query(
                "SELECT COUNT(*) AS c FROM lots WHERE status = 'censado'"
            );
            console.log(`🗺️  Total de lotes con status 'censado' en BD: ${censadosCount[0].c}`);
        }

    } catch (err) {
        console.error('❌ Error crítico:', err.message);
    } finally {
        if (connection) await connection.end();
        console.log('🔌 Conexión cerrada.');
    }
};

main();
