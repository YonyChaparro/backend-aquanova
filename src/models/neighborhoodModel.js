// src/models/neighborhoodModel.js
const pool = require('../config/db');

const NeighborhoodModel = {

    // 1. Crear Barrio
    async create(neighborhoodData) {
        const { id, name, code, parent_id, metadata } = neighborhoodData;

        const query = `
            INSERT INTO neighborhoods (id, name, code, parent_id, metadata, created_at)
            VALUES (?, ?, ?, ?, ?, NOW())
        `;
        await pool.query(query, [
            id,
            name,
            code,
            parent_id || null,
            metadata ? JSON.stringify(metadata) : null
        ]);
        return true;
    },

    // 2. Listar Barrios
    async findAll() {
        const query = `
            SELECT 
                id, 
                name, 
                code, 
                parent_id, 
                metadata,
                created_at
            FROM neighborhoods
            ORDER BY name ASC
        `;
        const [rows] = await pool.query(query);
        return rows;
    },

    // 3. Obtener Barrio por ID
    async findById(id) {
        const query = `
            SELECT 
                id, 
                name, 
                code, 
                parent_id, 
                metadata,
                created_at
            FROM neighborhoods
            WHERE id = ?
        `;
        const [rows] = await pool.query(query, [id]);
        return rows[0];
    },

    // 4. Verificar si un código ya existe
    async findByCode(code) {
        const query = `SELECT id FROM neighborhoods WHERE code = ?`;
        const [rows] = await pool.query(query, [code]);
        return rows.length > 0;
    },

    // 5. Verificar si parent_id existe
    async checkParentExists(parentId) {
        const query = `SELECT id FROM neighborhoods WHERE id = ?`;
        const [rows] = await pool.query(query, [parentId]);
        return rows.length > 0;
    }

};

module.exports = NeighborhoodModel;
