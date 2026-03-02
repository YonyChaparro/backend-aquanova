// upload-images-cloudinary.js
// Script para subir imágenes de barrios y localidades a Cloudinary
// y actualizar la metadata en la base de datos.
// Uso: node upload-images-cloudinary.js

require('dotenv').config();
const mysql = require('mysql2/promise');
const cloudinary = require('cloudinary').v2;

// ─── Configuración de Cloudinary ───────────────────────────────────
// Se configura automáticamente con CLOUDINARY_URL del .env
cloudinary.config();

console.log('☁️  Cloudinary configurado para cloud:', cloudinary.config().cloud_name);

// ─── Configuración de BD ───────────────────────────────────────────
const DB_CONFIG = {
    host: process.env.DB_HOST || 'localhost',
    user: process.env.DB_USER || 'root',
    password: process.env.DB_PASSWORD || '',
};
const DB_NAME = process.env.DB_NAME || 'app_aquanova_bd';

// ─── Función para subir imagen desde URL a Cloudinary ──────────────
async function uploadToCloudinary(imageUrl, folder, publicId) {
    try {
        const result = await cloudinary.uploader.upload(imageUrl, {
            folder: `aquanova/${folder}`,
            public_id: publicId,
            overwrite: true,
            resource_type: 'image',
            transformation: [
                { width: 800, height: 600, crop: 'fill', quality: 'auto', format: 'webp' }
            ]
        });
        return result.secure_url;
    } catch (error) {
        console.error(`   ❌ Error subiendo ${publicId}: ${error.message}`);
        return null;
    }
}

// ─── Función principal ─────────────────────────────────────────────
async function uploadAllImages() {
    let connection;

    try {
        connection = await mysql.createConnection({
            ...DB_CONFIG,
            database: DB_NAME
        });
        console.log('🔌 Conectado a la base de datos.\n');

        // 1. Obtener todas las localidades (sin parent_id)
        const [localidades] = await connection.query(
            `SELECT id, name, code, metadata FROM neighborhoods WHERE parent_id IS NULL AND code LIKE 'LOC-%' ORDER BY code`
        );

        console.log(`📍 Encontradas ${localidades.length} localidades.\n`);

        let totalUploaded = 0;
        let totalFailed = 0;
        let totalSkipped = 0;

        for (const localidad of localidades) {
            let locMetadata = {};
            try {
                locMetadata = JSON.parse(localidad.metadata || '{}');
            } catch (e) {
                locMetadata = {};
            }

            console.log(`\n🏙️  Procesando localidad: ${localidad.name} (${localidad.code})`);

            // ── Subir imagen de la localidad ──
            if (locMetadata.imagen) {
                // Verificar si ya es una URL de Cloudinary
                if (locMetadata.imagen.includes('res.cloudinary.com')) {
                    console.log(`   ⏭️  Localidad ${localidad.name}: ya tiene imagen en Cloudinary.`);
                    totalSkipped++;
                } else {
                    console.log(`   ⬆️  Subiendo imagen de localidad ${localidad.name}...`);
                    const cloudUrl = await uploadToCloudinary(
                        locMetadata.imagen,
                        'localidades',
                        localidad.code.toLowerCase()
                    );

                    if (cloudUrl) {
                        locMetadata.imagen = cloudUrl;
                        await connection.query(
                            'UPDATE neighborhoods SET metadata = ? WHERE id = ?',
                            [JSON.stringify(locMetadata), localidad.id]
                        );
                        console.log(`   ✅ Localidad ${localidad.name}: ${cloudUrl}`);
                        totalUploaded++;
                    } else {
                        totalFailed++;
                    }
                }
            }

            // 2. Obtener barrios de esta localidad
            const [barrios] = await connection.query(
                `SELECT id, name, code, metadata FROM neighborhoods WHERE parent_id = ? ORDER BY code`,
                [localidad.id]
            );

            for (const barrio of barrios) {
                let barMetadata = {};
                try {
                    barMetadata = JSON.parse(barrio.metadata || '{}');
                } catch (e) {
                    barMetadata = {};
                }

                if (barMetadata.imagen) {
                    // Verificar si ya es una URL de Cloudinary
                    if (barMetadata.imagen.includes('res.cloudinary.com')) {
                        console.log(`   ⏭️  ${barrio.name}: ya tiene imagen en Cloudinary.`);
                        totalSkipped++;
                        continue;
                    }

                    console.log(`   ⬆️  Subiendo imagen de ${barrio.name} (${barrio.code})...`);
                    const cloudUrl = await uploadToCloudinary(
                        barMetadata.imagen,
                        'barrios',
                        barrio.code.toLowerCase()
                    );

                    if (cloudUrl) {
                        barMetadata.imagen = cloudUrl;
                        await connection.query(
                            'UPDATE neighborhoods SET metadata = ? WHERE id = ?',
                            [JSON.stringify(barMetadata), barrio.id]
                        );
                        console.log(`   ✅ ${barrio.name}: ${cloudUrl}`);
                        totalUploaded++;
                    } else {
                        totalFailed++;
                    }
                } else {
                    console.log(`   ⚠️  ${barrio.name}: no tiene imagen de origen.`);
                }
            }
        }

        // ─── Resumen ───
        console.log('\n=============================================');
        console.log('☁️  RESUMEN DE SUBIDA A CLOUDINARY');
        console.log('=============================================');
        console.log(`✅ Imágenes subidas:    ${totalUploaded}`);
        console.log(`⏭️  Ya en Cloudinary:    ${totalSkipped}`);
        console.log(`❌ Errores:             ${totalFailed}`);
        console.log(`📊 Total procesadas:    ${totalUploaded + totalSkipped + totalFailed}`);
        console.log('=============================================\n');

    } catch (error) {
        console.error('💥 Error fatal:', error.message);
        process.exit(1);
    } finally {
        if (connection) {
            await connection.end();
            console.log('🔌 Conexión cerrada.');
        }
    }
}

// ─── Ejecutar ──────────────────────────────────────────────────────
uploadAllImages();
