const fs = require('fs');
const path = require('path');
const cheerio = require('cheerio');
const mysql = require('mysql2/promise');
const crypto = require('crypto');

// Cargar variables de entorno desde el archivo .env en la raíz del proyecto
require('dotenv').config({ path: path.resolve(__dirname, '../../.env') });

// ==========================================
// 1. CONFIGURACIÓN
// ==========================================
const SVG_FILE_PATH = path.resolve('./Mapa.svg'); 

const dbConfig = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'aquanova',
    password: process.env.DB_PASSWORD || '1234',
    database: process.env.DB_NAME || 'app_aquanova_bd'
};

const SCALE_FACTOR = 0.8; 

// ==========================================
// 2. FUNCIÓN PARA EXTRAER DATOS (SIN MODIFICAR EL TRAZO)
// ==========================================
function extractGeometryData(dPath) {
    // 1. Extraemos las coordenadas para calcular área y centroide
    const coords = dPath.match(/-?\d+\.?\d*/g);
    if (!coords || coords.length < 4) return null;

    let xs = [], ys = [];
    for (let i = 0; i < coords.length; i += 2) {
        xs.push(parseFloat(coords[i]));
        ys.push(parseFloat(coords[i + 1]));
    }

    // 2. Encontrar la "Caja Delimitadora" (Bounding Box)
    const minX = Math.min(...xs);
    const maxX = Math.max(...xs);
    const minY = Math.min(...ys);
    const maxY = Math.max(...ys);

    // 3. Calculamos el centro para poner la etiqueta/tooltip
    const centroid = {
        x: Number(((minX + maxX) / 2).toFixed(2)),
        y: Number(((minY + maxY) / 2).toFixed(2))
    };
    
    // 4. Área aproximada en base a la caja delimitadora
    const area_m2 = Number(((maxX - minX) * (maxY - minY) * SCALE_FACTOR).toFixed(2));

    // RETORNAMOS EL TRAZO ORIGINAL EXACTO (dPath) EN LUGAR DEL RECTÁNGULO
    return { originalPath: dPath, centroid, area_m2 };
}

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

        const svgData = fs.readFileSync(SVG_FILE_PATH, 'utf-8');
        const $ = cheerio.load(svgData, { xmlMode: true });

        const paths = $('path');
        console.log(`Se encontraron ${paths.length} trazos en el SVG.\n`);

        const neighborhoodId = crypto.randomUUID();
        const blockId = crypto.randomUUID();

        // Crear barrio y manzana por defecto
        await connection.execute(
            `INSERT INTO neighborhoods (id, name, code) VALUES (?, ?, ?) 
             ON DUPLICATE KEY UPDATE id=id`,
            [neighborhoodId, 'Barrio Acueducto', 'B-001']
        );

        await connection.execute(
            `INSERT INTO blocks (id, code, neighborhood_id, geom_path) VALUES (?, ?, ?, ?)
             ON DUPLICATE KEY UPDATE id=id`,
            [blockId, 'Manzana Única', neighborhoodId, 'M0,0 Z']
        );

        // Primero limpiamos los lotes existentes para no tener duplicados por pruebas anteriores
        await connection.execute(`DELETE FROM lots WHERE block_id = ?`, [blockId]);

        let count = 1;

        for (let i = 0; i < paths.length; i++) {
            const rawPath = $(paths[i]).attr('d');
            
            // Usamos la nueva función que respeta el trazo original
            const geometry = extractGeometryData(rawPath);
            if (!geometry) continue;

            // Extraemos el originalPath en lugar del perfectPath
            const { originalPath, centroid, area_m2 } = geometry;

            const lotId = crypto.randomUUID();
            const lotNumber = `Lote-${count.toString().padStart(3, '0')}`;
            
            // ESTABLECEMOS LOS DATOS REALES POR DEFECTO
            const initialStatus = 'sin_informacion';
            const waterMeter = null;

            await connection.execute(
                `INSERT INTO lots (
                    id, block_id, number, status, water_meter_code, 
                    area_m2, svg_path, centroid
                ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
                [
                    lotId, 
                    blockId, 
                    lotNumber, 
                    initialStatus, 
                    waterMeter, 
                    area_m2, 
                    originalPath, // <--- GUARDAMOS EL TRAZO DE INKSCAPE INTACTO
                    JSON.stringify(centroid)
                ]
            );

            console.log(`✅ ${lotNumber} insertado. Área: ${area_m2}m² - Estado: ${initialStatus}`);
            count++;
        }

        console.log("\n🚀 ¡Proceso finalizado! Todos los predios han sido registrados con su trazo original.");

    } catch (error) {
        console.error("❌ Ocurrió un error:", error.message);
    } finally {
        if (connection) await connection.end();
    }
}

main();