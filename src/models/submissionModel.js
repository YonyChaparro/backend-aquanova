// src/models/submissionModel.js
const pool = require('../config/db');

const SubmissionModel = {
    // Crear un envío
    async create(data) {
        const { id, form_version_id, user_id, neighborhood_id, responses, location } = data;

        const query = `
            INSERT INTO submissions 
            (id, form_version_id, user_id, neighborhood_id, responses, location_lat, location_lng, created_at)
            VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
        `;

        // responses es un objeto JS, lo convertimos a string para MySQL JSON
        const responsesJson = JSON.stringify(responses);
        const lat = location ? location.lat : null;
        const lng = location ? location.lng : null;

        await pool.query(query, [id, form_version_id, user_id, neighborhood_id, responsesJson, lat, lng]);
        return id;
    },

    // Obtener respuestas por ID de Formulario (Padre)
    async findByFormId(formId) {
        const query = `
            SELECT 
                s.id, 
                s.responses, 
                s.location_lat, 
                s.location_lng,
                s.created_at,
                s.status,             -- ¡NUEVO! Traemos el estado
                s.neighborhood_id,    -- ¡NUEVO! Traemos el ID por si acaso
                u.name as collected_by,
                n.name as neighborhood
            FROM submissions s
            JOIN form_versions fv ON s.form_version_id = fv.id
            LEFT JOIN users u ON s.user_id = u.id -- Usamos LEFT JOIN por si el user_id es NULL (anónimo)
            JOIN neighborhoods n ON s.neighborhood_id = n.id
            WHERE fv.form_id = ?
            ORDER BY s.created_at DESC
        `;
        const [rows] = await pool.query(query, [formId]);
        return rows;
    }
};

module.exports = SubmissionModel;