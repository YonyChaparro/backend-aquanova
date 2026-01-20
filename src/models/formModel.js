// src/models/formModel.js
const pool = require('../config/db');

const FormModel = {

    // 1. Crear Formulario + Versión 1 (Transacción)
    async createWithVersion(formData) {
        const { 
            formId, versionId, key, title, description, schema, adminId, neighborhood_id
        } = formData;

        const connection = await pool.getConnection();
        
        try {
            await connection.beginTransaction();

            // A. Insertar la cabecera (Tabla forms)
            const queryForm = `
                INSERT INTO forms (id, \`key\`, title, description, created_by, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, 1, NOW())
            `;
            await connection.query(queryForm, [formId, key, title, description, adminId]);

            // B. Insertar la primera versión (Tabla form_versions)
            // Nota: JSON.stringify(schema) convierte el array de preguntas a texto para MySQL
            const queryVersion = `
                INSERT INTO form_versions (id, form_id, version, \`schema\`, created_by, status, created_at)
                VALUES (?, ?, 1, ?, ?, 'draft', NOW())
            `;
            await connection.query(queryVersion, [versionId, formId, JSON.stringify(schema), adminId]);

            // C. Insertar la publicación en el barrio especificado (Tabla form_publications)
            const publicationId = require('uuid').v4();
            const queryPublication = `
                INSERT INTO form_publications (id, form_version_id, neighborhood_id, start_at, is_active)
                VALUES (?, ?, ?, NOW(), 1)
            `;
            await connection.query(queryPublication, [publicationId, versionId, neighborhood_id]);

            await connection.commit();
            return true;

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },

    // Validar que un barrio existe
    async checkNeighborhoodExists(neighborhoodId) {
        const query = `SELECT id FROM neighborhoods WHERE id = ?`;
        const [rows] = await pool.query(query, [neighborhoodId]);
        return rows.length > 0;
    },

    // Buscar formularios por título, descripción o barrio asociado
    async search(searchTerm) {
        const query = `
            SELECT 
                f.id, 
                f.key, 
                f.title, 
                f.description, 
                f.is_active, 
                f.created_at, 
                u.name as created_by,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id', n.id, 
                        'name', n.name,
                        'code', n.code,
                        'parent_id', n.parent_id,
                        'metadata', n.metadata,
                        'created_at', n.created_at
                    )
                ) as neighborhoods
            FROM forms f
            JOIN users u ON f.created_by = u.id
            LEFT JOIN form_versions fv ON f.id = fv.form_id
            LEFT JOIN form_publications fp ON fv.id = fp.form_version_id
            LEFT JOIN neighborhoods n ON fp.neighborhood_id = n.id
            WHERE 
                (f.title LIKE ? OR f.description LIKE ? OR n.name LIKE ?)
            GROUP BY f.id
            ORDER BY f.created_at DESC
        `;
        const wild = `%${searchTerm}%`;
        const [rows] = await pool.query(query, [wild, wild, wild]);
        return rows;
    },

    // 2. Listar Formularios (Mostrando la última versión activa)
    async findAll() {
        // Hacemos un JOIN para traer datos de la tabla forms y sus barrios publicados
        const query = `
            SELECT 
                f.id, 
                f.key, 
                f.title, 
                f.description, 
                f.is_active, 
                f.created_at, 
                u.name as created_by,
                JSON_ARRAYAGG(
                    JSON_OBJECT(
                        'id', n.id, 
                        'name', n.name,
                        'code', n.code,
                        'parent_id', n.parent_id,
                        'metadata', n.metadata,
                        'created_at', n.created_at
                    )
                ) as neighborhoods
            FROM forms f
            JOIN users u ON f.created_by = u.id
            LEFT JOIN form_publications fp ON f.id = (
                SELECT form_id FROM form_versions WHERE id = fp.form_version_id
            )
            LEFT JOIN neighborhoods n ON fp.neighborhood_id = n.id
            GROUP BY f.id
            ORDER BY f.created_at DESC
        `;
        const [rows] = await pool.query(query);
        return rows;
    },
    
    // 3. Obtener el esquema (preguntas) de la última versión de un formulario
    // Esto servirá para que la App sepa qué preguntas pintar
    async findLatestVersionSchema(formId) {
        // En src/models/formModel.js -> findLatestVersionSchema
const query = `
    SELECT fv.id, fv.schema, fv.version
    FROM form_versions fv
    WHERE fv.form_id = ?
    ORDER BY fv.version DESC
    LIMIT 1
`;
        const [rows] = await pool.query(query, [formId]);
        return rows[0];
    },

    // Buscar formulario por ID
    async findById(id) {
        const query = `
            SELECT f.id, f.title, f.description, f.key, f.created_at
            FROM forms f
            WHERE f.id = ? AND f.is_active = 1
        `;
        const [rows] = await pool.query(query, [id]);
        return rows[0];
    },

    // Buscar formulario por ID (incluye inactivos)
    async findByIdAny(id) {
        const query = `
            SELECT f.id, f.title, f.description, f.key, f.created_at, f.is_active
            FROM forms f
            WHERE f.id = ?
        `;
        const [rows] = await pool.query(query, [id]);
        return rows[0];
    },

    // Actualizar datos básicos del formulario
    async updateForm(id, data) {
        const fields = [];
        const params = [];

        if (data.title !== undefined) {
            fields.push('title = ?');
            params.push(data.title);
        }
        if (data.description !== undefined) {
            fields.push('description = ?');
            params.push(data.description);
        }
        if (data.is_active !== undefined) {
            fields.push('is_active = ?');
            params.push(data.is_active ? 1 : 0);
        }

        if (!fields.length) {
            return false;
        }

        const query = `
            UPDATE forms
            SET ${fields.join(', ')}, updated_at = NOW()
            WHERE id = ?
        `;
        params.push(id);
        await pool.query(query, params);
        return true;
    },

    // Desactivar (soft delete) formulario y sus publicaciones
    async deactivateForm(id) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            await connection.query(`
                UPDATE forms SET is_active = 0, updated_at = NOW() WHERE id = ?
            `, [id]);

            await connection.query(`
                UPDATE form_publications fp
                JOIN form_versions fv ON fp.form_version_id = fv.id
                SET fp.is_active = 0
                WHERE fv.form_id = ?
            `, [id]);

            await connection.commit();
            return true;
        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    }
    
};

module.exports = FormModel;