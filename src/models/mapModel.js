// src/models/mapModel.js
const db = require('../config/db'); // Ajusta a la ruta de tu conexión a MySQL

const getBlocksAndLots = async (neighborhoodId) => {
    let query = `
        SELECT 
            b.id AS block_id, b.code AS block_code, b.geom_path AS block_geom, b.label_position,
            l.id AS lot_id, l.number, l.status, l.water_meter_code, l.cadastral_id,
            l.area_m2, l.svg_path, l.centroid,
            n.metadata AS neighborhood_metadata
        FROM blocks b
        INNER JOIN neighborhoods n ON b.neighborhood_id = n.id AND n.is_active = 1
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

const updateLot = async (lotId, updateData) => {
    const fields = [];
    const values = [];

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

// Traer solo los barrios activos
const getAllNeighborhoods = async () => {
    const [rows] = await db.execute('SELECT id, name, code FROM neighborhoods WHERE is_active = 1 ORDER BY name ASC');
    return rows;
};

module.exports = { getBlocksAndLots, updateLot, getAllNeighborhoods };