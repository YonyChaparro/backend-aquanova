// src/models/userModel.js
const pool = require('../config/db');

const UserModel = {
    // 1. Buscar para Login (Ya lo tenías)
    async findByEmailWithRole(email) {
        const query = `
            SELECT u.id, u.name, u.email, u.password_hash, u.is_active, ur.role_id, r.name as role_name
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            WHERE u.email = ? AND u.is_active = 1
        `;
        const [rows] = await pool.query(query, [email]);
        return rows[0];
    },

    // 2. Listar TODOS los usuarios (Para el panel de Admin)
    async findAll() {
        const query = `
            SELECT u.id, u.name, u.email, u.is_active, r.name as role, u.created_at
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            ORDER BY u.created_at DESC
        `;
        const [rows] = await pool.query(query);
        return rows;
    },

    // 3. Crear Usuario (¡Usa Transacción!)
    async create(userData) {
        const { id, name, email, password_hash, role_id } = userData;
        
        const connection = await pool.getConnection(); // Obtener conexión exclusiva
        try {
            await connection.beginTransaction(); // Iniciar transacción

            // A. Insertar Usuario
            const queryUser = `
                INSERT INTO users (id, name, email, password_hash, is_active, created_at) 
                VALUES (?, ?, ?, ?, 1, NOW())
            `;
            await connection.query(queryUser, [id, name, email, password_hash]);

            // B. Asignar Rol
            const queryRole = `
                INSERT INTO user_roles (user_id, role_id) 
                VALUES (?, ?)
            `;
            await connection.query(queryRole, [id, role_id]);

            await connection.commit(); // Confirmar cambios
            return true;
        } catch (error) {
            await connection.rollback(); // Deshacer si falla
            throw error;
        } finally {
            connection.release(); // Liberar conexión
        }
    },

    // 4. Desactivar Usuario (Soft Delete)
    async toggleActive(id, status) {
        const query = 'UPDATE users SET is_active = ? WHERE id = ?';
        const [result] = await pool.query(query, [status, id]);
        return result.affectedRows > 0;
    }
};

module.exports = UserModel;