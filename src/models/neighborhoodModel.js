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
    },

    // 6. Buscar Barrios
    async search(searchTerm) {
        const query = `
            SELECT 
                id, 
                name, 
                code, 
                parent_id, 
                metadata,
                created_at
            FROM neighborhoods
            WHERE name LIKE ? OR code LIKE ?
            ORDER BY name ASC
        `;
        const wild = `%${searchTerm}%`;
        const [rows] = await pool.query(query, [wild, wild]);
        return rows;
    },

    // 7. Obtener jerarquía recursiva (Barrio -> Padre -> Abuelo...)
    async findHierarchy(id) {
        // CTE Recursiva para traer ancestros
        const query = `
            WITH RECURSIVE genealogy AS (
                SELECT id, name, code, parent_id, metadata, created_at, 0 AS depth
                FROM neighborhoods
                WHERE id = ?
                UNION ALL
                SELECT n.id, n.name, n.code, n.parent_id, n.metadata, n.created_at, g.depth + 1
                FROM neighborhoods n
                INNER JOIN genealogy g ON n.id = g.parent_id
            )
            SELECT * FROM genealogy ORDER BY depth ASC;
        `;
        const [rows] = await pool.query(query, [id]);
        return rows;
    }

};

module.exports = NeighborhoodModel;
