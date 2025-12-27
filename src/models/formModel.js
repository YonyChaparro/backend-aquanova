// src/models/formModel.js
const pool = require('../config/db');

const FormModel = {

    // 1. Crear Formulario + Versión 1 (Transacción)
    async createWithVersion(formData) {
        const { 
            formId, versionId, key, title, description, schema, adminId 
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

            await connection.commit();
            return true;

        } catch (error) {
            await connection.rollback();
            throw error;
        } finally {
            connection.release();
        }
    },

    // 2. Listar Formularios (Mostrando la última versión activa)
    async findAll() {
        // Hacemos un JOIN para traer datos de la tabla forms
        const query = `
            SELECT f.id, f.key, f.title, f.description, f.created_at, u.name as created_by
            FROM forms f
            JOIN users u ON f.created_by = u.id
            WHERE f.is_active = 1
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
    }
    
};

module.exports = FormModel;