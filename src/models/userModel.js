// src/models/userModel.js
const pool = require('../config/db');

const UserModel = {
    // 1. Buscar para Login (Por Documento)
    async findByDocumentWithRole(document_number) {
        const query = `
            SELECT u.id, u.name, u.email, u.document_number, u.password_hash, u.is_active, ur.role_id, r.name as role_name
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            WHERE u.document_number = ? AND u.is_active = 1
        `;
        const [rows] = await pool.query(query, [document_number]);
        return rows[0];
    },

    // 2. Listar TODOS los usuarios (Para el panel de Admin)
    async findAll() {
        const query = `
            SELECT 
                u.id, 
                u.name, 
                u.document_number,
                u.email, 
                u.phone, 
                u.is_active, 
                u.metadata,
                u.created_at,
                u.updated_at,
                r.name as role, 
                r.description as role_description,
                n.id as neighborhood_id,
                n.name as neighborhood_name,
                n.code as neighborhood_code
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            LEFT JOIN neighborhoods n ON ur.neighborhood_id = n.id
            ORDER BY u.created_at DESC
        `;
        const [rows] = await pool.query(query);
        return rows;
    },

    // 3. Crear Usuario (¡Usa Transacción!)
    async create(userData) {
        const { id, name, document_number, email, password_hash, role_id, neighborhood_id } = userData;
        
        const connection = await pool.getConnection(); // Obtener conexión exclusiva
        try {
            await connection.beginTransaction(); // Iniciar transacción

            // A. Insertar Usuario
            const queryUser = `
                INSERT INTO users (id, name, document_number, email, password_hash, is_active, created_at) 
                VALUES (?, ?, ?, ?, ?, 1, NOW())
            `;
            await connection.query(queryUser, [id, name, document_number, email, password_hash]);

            // B. Asignar Rol y Barrio (si aplica)
            const queryRole = `
                INSERT INTO user_roles (user_id, role_id, neighborhood_id) 
                VALUES (?, ?, ?)
            `;
            // Si neighborhood_id es undefined o null, se guardará como NULL en la BD
            await connection.query(queryRole, [id, role_id, neighborhood_id || null]);

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
    },

    // 5. Obtener token_version de un usuario
    async getTokenVersion(userId) {
        const query = 'SELECT token_version FROM users WHERE id = ?';
        const [rows] = await pool.query(query, [userId]);
        return rows[0]?.token_version || 1;
    },

    // 6. Incrementar token_version (invalida tokens anteriores)
    async incrementTokenVersion(userId) {
        const query = 'UPDATE users SET token_version = token_version + 1 WHERE id = ?';
        const [result] = await pool.query(query, [userId]);
        return result.affectedRows > 0;
    }
};

module.exports = UserModel;