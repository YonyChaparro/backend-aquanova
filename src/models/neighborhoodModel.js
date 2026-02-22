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
                n.id, 
                n.name, 
                n.code, 
                n.parent_id,
                p.name AS parent_name,
                n.is_active,
                n.metadata,
                n.created_at
            FROM neighborhoods n
            LEFT JOIN neighborhoods p ON n.parent_id = p.id
            ORDER BY p.name ASC, n.name ASC
        `;
        const [rows] = await pool.query(query);
        return rows;
    },

    // 3. Obtener Barrio por ID
    async findById(id) {
        const query = `
            SELECT 
                n.id, 
                n.name, 
                n.code, 
                n.parent_id,
                p.name AS parent_name,
                n.is_active,
                n.metadata,
                n.created_at
            FROM neighborhoods n
            LEFT JOIN neighborhoods p ON n.parent_id = p.id
            WHERE n.id = ?
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
                n.id, 
                n.name, 
                n.code, 
                n.parent_id,
                p.name AS parent_name,
                n.is_active,
                n.metadata,
                n.created_at
            FROM neighborhoods n
            LEFT JOIN neighborhoods p ON n.parent_id = p.id
            WHERE n.name LIKE ? OR n.code LIKE ?
            ORDER BY n.name ASC
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
    },

    // 8. Actualizar Barrio
    async update(id, updateData) {
        const { name, code, parent_id, metadata } = updateData;
        const query = `
            UPDATE neighborhoods 
            SET name = ?, code = ?, parent_id = ?, metadata = ?, updated_at = NOW()
            WHERE id = ?
        `;
        await pool.query(query, [
            name,
            code,
            parent_id || null,
            metadata ? JSON.stringify(metadata) : null,
            id
        ]);
        return true;
    },

    // 9. Eliminar Barrio
    async delete(id) {
        const query = `DELETE FROM neighborhoods WHERE id = ?`;
        await pool.query(query, [id]);
        return true;
    },

    // 10. Verificar si un barrio tiene hijos
    async hasChildren(parentId) {
        const query = `SELECT id FROM neighborhoods WHERE parent_id = ? LIMIT 1`;
        const [rows] = await pool.query(query, [parentId]);
        return rows.length > 0;
    },

    // 11. Verificar si un código existe excluyendo un ID específico
    async findByCodeExcluding(code, excludeId) {
        const query = `SELECT id FROM neighborhoods WHERE code = ? AND id != ?`;
        const [rows] = await pool.query(query, [code, excludeId]);
        return rows.length > 0;
    }

};

module.exports = NeighborhoodModel;
