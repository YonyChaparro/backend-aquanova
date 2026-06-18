// generate-lot-mapping.js
// Lee el CSV y la BD, y genera lot-uuid-mapping.json con:
//   - Los predios ya resueltos (coincidencia directa o por external_id)
//   - Un template con null para los que aún necesitan mapeo manual
//
// Uso: node generate-lot-mapping.js
// Salida: lot-uuid-mapping.json

require('dotenv').config();
const mysql = require('mysql2/promise');
const fs = require('fs');
const path = require('path');

const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
    database: process.env.DB_NAME || 'app_aquanova_bd',
};

const CSV_PATH = path.resolve(__dirname, 'export_censo_estandarizado.csv');
const OUTPUT_PATH = path.resolve(__dirname, 'lot-uuid-mapping.json');

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
            result.push(current); current = '';
        } else { current += ch; }
    }
    result.push(current);
    return result;
}

function parseCSV(content) {
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

const main = async () => {
    let connection;
    try {
        connection = await mysql.createConnection(DB_CONFIG);
        console.log('🔌 Conectado a MySQL.');

        const csvContent = fs.readFileSync(CSV_PATH, 'utf-8');
        const rows = parseCSV(csvContent);

        // Recopilar todos los UUIDs únicos del CSV con su metadata
        const predioMeta = new Map(); // oldUUID → { manzana, direccion, primera_fecha }
        for (const row of rows) {
            const pid = row['Selecciona el predio'];
            if (!pid) continue;
            if (!predioMeta.has(pid)) {
                predioMeta.set(pid, {
                    manzana:   row['Manzana'] || null,
                    direccion: row['Dirección 1'] || null,
                    fecha:     row['Fecha Creación'] || null,
                    visitas:   0,
                });
            }
            predioMeta.get(pid).visitas++;
        }

        const oldUUIDs = [...predioMeta.keys()];
        console.log(`📊 UUIDs únicos en CSV: ${oldUUIDs.length}`);

        const placeholders = oldUUIDs.map(() => '?').join(',');

        // Coincidencias directas por id
        const [lotsById] = await connection.query(
            `SELECT id, number, external_id FROM lots WHERE id IN (${placeholders})`, oldUUIDs
        );
        const directMap = new Map(lotsById.map(l => [l.id, l]));

        // Coincidencias por external_id ya configurado
        const [lotsByExtId] = await connection.query(
            `SELECT id, number, external_id FROM lots WHERE external_id IN (${placeholders})`, oldUUIDs
        );
        const externalMap = new Map(lotsByExtId.map(l => [l.external_id, l]));

        // Todos los lotes disponibles en el barrio Las Mercedes (para el template)
        const [allLots] = await connection.query(`
            SELECT l.id, l.number, l.external_id
            FROM lots l
            JOIN blocks b ON b.id = l.block_id
            JOIN neighborhoods n ON n.id = b.neighborhood_id
            WHERE n.code = 'SMCN-001'
            ORDER BY l.number
        `);
        console.log(`🗺️  Lotes en Las Mercedes: ${allLots.length}`);

        // Construir el mapping
        const mapping = {};
        let resolved = 0;
        let pending = 0;

        for (const [oldUUID, meta] of predioMeta.entries()) {
            const byId  = directMap.get(oldUUID);
            const byExt = externalMap.get(oldUUID);
            const lot   = byId || byExt;

            mapping[oldUUID] = {
                // El nuevo lot_id que debe usarse — null = pendiente de mapeo manual
                new_lot_id: lot ? lot.id : null,
                // Cómo se resolvió
                match_type: byId ? 'direct_id' : (byExt ? 'external_id' : 'PENDIENTE'),
                // Ayuda para el mapeo manual
                csv_manzana:   meta.manzana,
                csv_direccion: meta.direccion,
                csv_visitas:   meta.visitas,
                // Número del lote en BD si ya está resuelto
                lot_number: lot ? lot.number : null,
            };

            if (lot) resolved++;
            else pending++;
        }

        fs.writeFileSync(OUTPUT_PATH, JSON.stringify({
            _instrucciones: [
                'Para cada entrada con match_type == "PENDIENTE" y new_lot_id == null:',
                '  1. Identifica el predio en el mapa SVG usando csv_manzana y csv_direccion.',
                '  2. Busca el lot_id correspondiente en la BD (ver lista_lotes_disponibles).',
                '  3. Pon ese UUID en new_lot_id y cambia match_type a "manual".',
                'Luego ejecuta: node apply-lot-mapping.js',
            ],
            _resumen: {
                total_predios_csv: oldUUIDs.length,
                ya_resueltos: resolved,
                pendientes_mapeo_manual: pending,
            },
            lista_lotes_disponibles: allLots.map(l => ({
                id: l.id,
                number: l.number,
                external_id: l.external_id,
            })),
            mapeo: mapping,
        }, null, 2));

        console.log('\n=============================================');
        console.log(`✅ Ya resueltos:              ${resolved}`);
        console.log(`⏳ Pendientes mapeo manual:  ${pending}`);
        console.log(`📄 Archivo generado:         lot-uuid-mapping.json`);
        console.log('=============================================\n');

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        if (connection) await connection.end();
        console.log('🔌 Conexión cerrada.');
    }
};

main();
