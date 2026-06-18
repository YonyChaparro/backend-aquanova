// apply-lot-mapping.js
// Lee lot-uuid-mapping.json y actualiza lots.external_id en la BD.
// Después de ejecutar este script, corre seed-submissions.js para
// que las submissions queden vinculadas a los lotes correctos.
//
// Uso: node apply-lot-mapping.js [--dry-run]

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

const MAPPING_PATH = path.resolve(__dirname, 'lot-uuid-mapping.json');
const DRY_RUN = process.argv.includes('--dry-run');

const main = async () => {
    let connection;
    try {
        if (!fs.existsSync(MAPPING_PATH)) {
            throw new Error('lot-uuid-mapping.json no encontrado. Ejecuta generate-lot-mapping.js primero.');
        }

        const mappingFile = JSON.parse(fs.readFileSync(MAPPING_PATH, 'utf-8'));
        const mapeo = mappingFile.mapeo;

        connection = await mysql.createConnection(DB_CONFIG);
        console.log('🔌 Conectado a MySQL.');
        if (DRY_RUN) console.log('🔍 Modo dry-run: no se harán cambios en BD.\n');

        let applied = 0;
        let skipped = 0;
        let errors = 0;
        const conflicts = [];

        for (const [oldUUID, entry] of Object.entries(mapeo)) {
            if (!entry.new_lot_id) {
                skipped++;
                continue;
            }

            // Verificar que el lote destino existe
            const [lotCheck] = await connection.query(
                'SELECT id, number, external_id FROM lots WHERE id = ?', [entry.new_lot_id]
            );
            if (!lotCheck.length) {
                console.error(`❌ Lote ${entry.new_lot_id} (${entry.lot_number}) no existe en BD. Saltando.`);
                errors++;
                continue;
            }

            const lot = lotCheck[0];

            // Detectar conflicto: el lote ya tiene un external_id diferente
            if (lot.external_id && lot.external_id !== oldUUID) {
                conflicts.push({
                    lot_id: lot.id,
                    lot_number: lot.number,
                    external_id_actual: lot.external_id,
                    external_id_nuevo: oldUUID,
                });
                console.warn(`⚠️  Conflicto en ${lot.number}: external_id ya es "${lot.external_id}", se intenta asignar "${oldUUID}". Saltando.`);
                skipped++;
                continue;
            }

            // Si ya coincide, no hacer nada
            if (lot.external_id === oldUUID) {
                skipped++;
                continue;
            }

            if (!DRY_RUN) {
                await connection.query(
                    'UPDATE lots SET external_id = ?, updated_at = NOW() WHERE id = ?',
                    [oldUUID, entry.new_lot_id]
                );
            }
            console.log(`${DRY_RUN ? '[dry]' : '✅'} ${lot.number} → external_id = ${oldUUID} (${entry.csv_direccion || 'MZ ' + entry.csv_manzana})`);
            applied++;
        }

        // También actualizar lot_id en submissions donde aún es NULL pero el predio ya resolvió
        if (!DRY_RUN && applied > 0) {
            console.log('\n🔄 Actualizando submissions.lot_id donde se resolvió el predio...');
            const [updateResult] = await connection.query(`
                UPDATE submissions s
                JOIN lots l ON l.external_id = JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.predio_id'))
                SET s.lot_id = l.id, s.updated_at = NOW()
                WHERE s.lot_id IS NULL
                  AND JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.predio_id')) IS NOT NULL
            `);
            console.log(`✅ ${updateResult.affectedRows} submissions actualizadas con lot_id resuelto.`);
        }

        console.log('\n=============================================');
        console.log(`✅ external_id aplicados:    ${applied}`);
        console.log(`⏭️  Saltados/sin cambio:     ${skipped}`);
        console.log(`❌ Errores:                  ${errors}`);
        if (conflicts.length) {
            console.log(`⚠️  Conflictos detectados:   ${conflicts.length}`);
        }
        if (!DRY_RUN && applied > 0) {
            console.log('\n👉 Ahora ejecuta: node seed-submissions.js');
            console.log('   (para vincular las submissions a los lotes correctos vía el nuevo external_id)');
        }
        console.log('=============================================\n');

    } catch (err) {
        console.error('❌ Error:', err.message);
    } finally {
        if (connection) await connection.end();
        console.log('🔌 Conexión cerrada.');
    }
};

main();
