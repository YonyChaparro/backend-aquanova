// src/legacy/procesar_plano.js
const fs = require('fs');
const path = require('path');
const mysql = require('mysql2/promise');
const crypto = require('crypto');
const { parseInteractiveLotsFromSvgFile } = require('../helpers/svgMapParser');

// Cargar variables de entorno desde el archivo .env en la raíz del proyecto
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// ==========================================
// 1. CONFIGURACIÓN
// ==========================================
const SVG_FILE_PATH = path.resolve(__dirname, './Mapa Barrio Las Mercedes.svg');
const MAP_DATA_OUTPUT_PATH = path.resolve(__dirname, '../../map-data-seed.json');

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD ?? '',
    database: process.env.DB_NAME || 'app_aquanova_bd'
};

// ==========================================
// 3. FUNCIÓN PRINCIPAL (PROCESAMIENTO Y BD)
// ==========================================
async function main() {
    let connection;

    try {
        console.log("Conectando a la base de datos con el usuario:", dbConfig.user);
        connection = await mysql.createConnection(dbConfig);
        console.log("¡Conectado exitosamente!\n");

        console.log(`Leyendo archivo SVG: ${SVG_FILE_PATH}`);
        
        if (!fs.existsSync(SVG_FILE_PATH)) {
            throw new Error(`No se encontró el archivo SVG en la ruta: ${SVG_FILE_PATH}`);
        }

        const mapData = parseInteractiveLotsFromSvgFile(SVG_FILE_PATH);
        const svgViewBox = mapData.viewBox;
        const mapLots = mapData.lots;

        console.log(`📐 viewBox detectado: ${svgViewBox}`);
        console.log(`Se encontraron ${mapLots.length} lotes interactivos en el SVG.\n`);

        // Mantiene actualizado el archivo de respaldo consumido por seed.js cuando no está disponible el SVG.
        fs.writeFileSync(MAP_DATA_OUTPUT_PATH, JSON.stringify(mapData, null, 2));
        console.log(`💾 map-data-seed.json actualizado en: ${MAP_DATA_OUTPUT_PATH}`);

        // -------------------------------------------------------
        // PASO A: Buscar o crear el SECTOR padre
        // -------------------------------------------------------
        const sectorName = 'San Miguel de la Cañada';
        const sectorCode = 'SMC-001';

        const [existingSectors] = await connection.execute(
            `SELECT id FROM neighborhoods WHERE code = ?`, [sectorCode]
        );

        let sectorId;
        if (existingSectors.length > 0) {
            sectorId = existingSectors[0].id;
            console.log(`✅ Sector encontrado: ${sectorName} (ID: ${sectorId})`);
        } else {
            sectorId = crypto.randomUUID();
            await connection.execute(
                `INSERT INTO neighborhoods (id, name, code) VALUES (?, ?, ?)`,
                [sectorId, sectorName, sectorCode]
            );
            console.log(`✅ Sector creado: ${sectorName} (ID: ${sectorId})`);
        }

        // -------------------------------------------------------
        // PASO B: Buscar o crear el BARRIO hijo (el que tiene el plano)
        // -------------------------------------------------------
        const neighborhoodName = 'Barrio Las Mercedes';
        const neighborhoodCode = 'SMCN-001';
        const neighborhoodMetadata = JSON.stringify({ viewBox: svgViewBox });

        const [existingNeighborhoods] = await connection.execute(
            `SELECT id FROM neighborhoods WHERE code = ?`, [neighborhoodCode]
        );

        let neighborhoodId;
        if (existingNeighborhoods.length > 0) {
            neighborhoodId = existingNeighborhoods[0].id;
            // Actualizar nombre, parent_id y metadata con los valores actuales
            await connection.execute(
                `UPDATE neighborhoods SET name = ?, parent_id = ?, metadata = ? WHERE id = ?`,
                [neighborhoodName, sectorId, neighborhoodMetadata, neighborhoodId]
            );
            console.log(`✅ Barrio encontrado y actualizado: ${neighborhoodName} (ID: ${neighborhoodId})`);
        } else {
            neighborhoodId = crypto.randomUUID();
            await connection.execute(
                `INSERT INTO neighborhoods (id, name, code, parent_id, metadata) VALUES (?, ?, ?, ?, ?)`,
                [neighborhoodId, neighborhoodName, neighborhoodCode, sectorId, neighborhoodMetadata]
            );
            console.log(`✅ Barrio creado: ${neighborhoodName} → hijo de: ${sectorName}`);
        }

        // 2. Verificar si la manzana ya existe
        const blockCode = 'M-01';
        const [existingBlocks] = await connection.execute(
            `SELECT id FROM blocks WHERE neighborhood_id = ? AND code = ?`, [neighborhoodId, blockCode]
        );

        let blockId;
        if (existingBlocks.length > 0) {
            blockId = existingBlocks[0].id;
            console.log(`✅ Manzana encontrada (ID: ${blockId})`);
        } else {
            blockId = crypto.randomUUID();
            await connection.execute(
                `INSERT INTO blocks (id, code, neighborhood_id, geom_path) VALUES (?, ?, ?, ?)`,
                [blockId, blockCode, neighborhoodId, 'M0,0 Z']
            );
            console.log(`✅ Manzana creada`);
        }

        // Limpiamos los lotes existentes de ESA manzana para actualizarlos
        await connection.execute(`DELETE FROM lots WHERE block_id = ?`, [blockId]);

        let count = 0;

        for (const lot of mapLots) {
            const lotId = crypto.randomUUID();
            const lotNumber = lot.number;
            const initialStatus = lot.status || 'sin_informacion';
            const waterMeter = null;

            await connection.execute(
                `INSERT INTO lots (
                    id, block_id, number, status, water_meter_code, 
                    area_m2, svg_path, centroid
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    lotId, blockId, lotNumber, initialStatus, waterMeter, 
                    lot.area_m2 || 0,
                    lot.svg_path,
                    JSON.stringify(lot.centroid || null)
                ]
            );
            count += 1;
        }

        console.log(`\n🚀 ¡Proceso finalizado! Se registraron ${count} predios en ${neighborhoodName}.`);

    } catch (error) {
        console.error("❌ Ocurrió un error:", error.message);
    } finally {
        if (connection) await connection.end();
    }
}

main();