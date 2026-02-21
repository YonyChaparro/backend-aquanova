// src/models/mapModel.js
const db = require('../config/db'); // Ajusta a la ruta de tu conexión a MySQL

const getBlocksAndLots = async (neighborhoodId) => {
    // Si pasamos un neighborhoodId, filtramos, si no, traemos todo (o el barrio por defecto)
    let query = `
        SELECT 
            b.id AS block_id, b.code AS block_code, b.geom_path AS block_geom, b.label_position,
            l.id AS lot_id, l.number, l.status, l.water_meter_code, l.cadastral_id,
            l.area_m2, l.svg_path, l.centroid
        FROM blocks b
        LEFT JOIN lots l ON b.id = l.block_id
    `;
    const params = [];

    if (neighborhoodId) {
        query += ` WHERE b.neighborhood_id = ?`;
        params.push(neighborhoodId);
    }

    const [rows] = await db.execute(query, params);
    return rows;
};

// Función para actualizar un lote (ej: cuando el encuestador registra el medidor)
const updateLot = async (lotId, updateData) => {
    const fields = [];
    const values = [];

    // Construcción dinámica del query de actualización
    for (const [key, value] of Object.entries(updateData)) {
        fields.push(`${key} = ?`);
        values.push(value);
    }

    if (fields.length === 0) return null;

    const query = `UPDATE lots SET ${fields.join(', ')} WHERE id = ?`;
    values.push(lotId);

    const [result] = await db.execute(query, values);
    return result;
};

module.exports = { getBlocksAndLots, updateLot };