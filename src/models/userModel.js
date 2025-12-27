// src/models/userModel.js
const pool = require('../config/db');

const UserModel = {
    // Buscar usuario por email y traer su ROL
    async findByEmailWithRole(email) {
        // Hacemos un JOIN para saber si es Admin(1), Operador(2) o Usuario(3)
        const query = `
            SELECT 
                u.id, 
                u.name, 
                u.email, 
                u.password_hash, 
                u.is_active,
                ur.role_id,
                r.name as role_name
            FROM users u
            LEFT JOIN user_roles ur ON u.id = ur.user_id
            LEFT JOIN roles r ON ur.role_id = r.id
            WHERE u.email = ? AND u.is_active = 1
        `;

        const [rows] = await pool.query(query, [email]);
        return rows[0]; // Devuelve el usuario o undefined
    }
};

module.exports = UserModel;