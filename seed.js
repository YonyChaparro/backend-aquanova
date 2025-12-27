require('dotenv').config();
const mysql = require('mysql2/promise');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

const seedDatabase = async () => {
    const connection = await mysql.createConnection({
        host: process.env.DB_HOST || 'localhost',
        user: process.env.DB_USER || 'root',
        password: process.env.DB_PASSWORD || '',
        database: process.env.DB_NAME || 'app_aquanova_bd'
    });

    console.log('🔌 Conectado a la base de datos.');

    try {
        // ---------------------------------------------------------
        // 1. SEED BARRIOS
        // ---------------------------------------------------------
        console.log('\n🏗️  Procesando Barrios...');
        let neighborhoodId;
        
        // Verificar si existe por código para no duplicar
        const [existingNeighborhoods] = await connection.query(
            'SELECT id FROM neighborhoods WHERE code = ?', 
            ['B-001']
        );

        if (existingNeighborhoods.length > 0) {
            neighborhoodId = existingNeighborhoods[0].id;
            console.log(`⚠️  El barrio B-001 ya existe. ID: ${neighborhoodId}`);
        } else {
            neighborhoodId = uuidv4();
            const queryNeighborhood = `
                INSERT INTO neighborhoods (id, name, code, created_at) 
                VALUES (?, 'Barrio Central', 'B-001', NOW())
            `;
            await connection.query(queryNeighborhood, [neighborhoodId]);
            console.log(`✅ Barrio creado exitosamente. ID: ${neighborhoodId}`);
        }

        // ---------------------------------------------------------
        // 2. SEED ADMINISTRADOR
        // ---------------------------------------------------------
        console.log('\n👤 Procesando Administrador...');
        const adminData = {
            email: 'admin@aquanova.com',
            password: 'admin123', // ¡Cámbiala por una segura!
            name: 'Super Administrador'
        };

        const [existingUser] = await connection.query(
            'SELECT id FROM users WHERE email = ?', 
            [adminData.email]
        );

        if (existingUser.length > 0) {
            console.log(`⚠️  El usuario ${adminData.email} ya existe. No se realizaron cambios.`);
        } else {
            // Iniciar transacción para el usuario
            await connection.beginTransaction();
            try {
                const salt = await bcrypt.genSalt(10);
                const passwordHash = await bcrypt.hash(adminData.password, salt);
                const userId = uuidv4();

                // Insertar Usuario
                const userQuery = `
                    INSERT INTO users (id, name, email, password_hash, is_active, created_at) 
                    VALUES (?, ?, ?, ?, 1, NOW())
                `;
                await connection.query(userQuery, [userId, adminData.name, adminData.email, passwordHash]);

                // Asignar Rol de Administrador (ID 1, sin barrio específico)
                const roleQuery = `
                    INSERT INTO user_roles (user_id, role_id, neighborhood_id) 
                    VALUES (?, 1, NULL)
                `;
                await connection.query(roleQuery, [userId]);

                await connection.commit();
                console.log(`✅ Administrador creado correctamente.`);
                console.log(`   Email: ${adminData.email}`);
                console.log(`   Pass:  ${adminData.password}`);
                console.log(`   UUID:  ${userId}`);
            } catch (err) {
                await connection.rollback();
                console.error('❌ Error creando admin, revirtiendo cambios...', err);
                throw err;
            }
        }

        console.log('\n✨ Proceso de seed completado.');

    } catch (error) {
        console.error('❌ Error general en el seed:', error);
    } finally {
        await connection.end();
        console.log('🔌 Conexión cerrada.');
    }
};

seedDatabase();
