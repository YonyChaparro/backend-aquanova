// src/models/mapModel.js
const db = require('../config/db'); // Ajusta a la ruta de tu conexión a MySQL
const { v4: uuidv4 } = require('uuid');

const getBlocksAndLots = async (neighborhoodId) => {
    let query = `
        SELECT 
            b.id AS block_id, b.code AS block_code, b.geom_path AS block_geom, b.label_position,
            l.id AS lot_id, l.number, l.number AS display_id, l.status, l.water_meter_code, l.cadastral_id,
            l.area_m2, l.svg_path, l.centroid, l.version,
            n.metadata AS neighborhood_metadata
        FROM blocks b
        INNER JOIN neighborhoods n ON b.neighborhood_id = n.id AND n.is_active = 1
        LEFT JOIN lots l ON b.id = l.block_id AND (l.status IS NULL OR l.status != 'inactive')
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

const updateBlock = async (blockId, updateData) => {
    const fields = [];
    const values = [];

    for (const [key, value] of Object.entries(updateData)) {
        fields.push(`${key} = ?`);
        values.push(value);
    }

    if (fields.length === 0) return null;

    const query = `UPDATE blocks SET ${fields.join(', ')} WHERE id = ?`;
    values.push(blockId);

    const [result] = await db.execute(query, values);
    return result;
};

// Traer solo los barrios activos
const getAllNeighborhoods = async () => {
    const [rows] = await db.execute('SELECT id, name, code FROM neighborhoods WHERE is_active = 1 ORDER BY name ASC');
    return rows;
};

const executeTopologyTransaction = async (action, deletedLots, newLots) => {
    const connection = await db.getConnection();
    try {
        await connection.beginTransaction();

        if (deletedLots && deletedLots.length > 0) {
            for (const lot of deletedLots) {
                // Soft delete & Optimistic Concurrency Control
                const query = `UPDATE lots SET status = 'inactive' WHERE id = ? AND version = ?`;
                const [result] = await connection.execute(query, [lot.id, lot.version]);
                
                if (result.affectedRows === 0) {
                    const conflictErr = new Error('Conflicto de concurrencia: El predio ha sido modificado por otro usuario.');
                    conflictErr.code = 409;
                    throw conflictErr;
                }
            }
        }

        const createdLots = [];
        if (newLots && newLots.length > 0) {
            const query = `
                INSERT INTO lots 
                (id, block_id, number, status, svg_path, centroid, area_m2, parent_ids, version) 
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
            `;
            const parentIdsJson = deletedLots ? JSON.stringify(deletedLots.map(l => l.id)) : null;
            
            for (const lot of newLots) {
                const newLotId = uuidv4();
                // Accepted always the one that's valid, path or svg_path (frontend sends both)
                const svgPathValue = lot.svg_path || lot.path || null;

                if (!svgPathValue) {
                    console.error('[executeTopologyTransaction] El lote no tiene svg_path ni path válido:', lot);
                    throw new Error('El predio nuevo no tiene una ruta SVG válida.');
                }

                const centroidJson = lot.centroid ? JSON.stringify(lot.centroid) : null;
                const lotNumber = lot.number || lot.display_id || `Lote-${Date.now()}`;

                const lotData = [
                    newLotId,
                    lot.block_id, 
                    lotNumber, 
                    'sin_informacion', 
                    svgPathValue, 
                    centroidJson, 
                    lot.area_m2 || 0,
                    parentIdsJson
                ];
                await connection.execute(query, lotData);
                
                createdLots.push({
                    id: newLotId,
                    block_id: lot.block_id,
                    number: lotNumber,
                    display_id: lot.display_id || lotNumber.replace('Lote-', ''),
                    status: 'sin_informacion',
                    svg_path: svgPathValue,
                    path: svgPathValue, // Retrocompatibilidad: MapEngine usa 'path'
                    centroid: lot.centroid,
                    area_m2: lot.area_m2 || 0,
                    version: 1
                });
            }
        }

        await connection.commit();
        return { success: true, createdLots };
    } catch (error) {
        await connection.rollback();
        throw error;
    } finally {
        connection.release();
    }
};

module.exports = { getBlocksAndLots, updateLot, updateBlock, getAllNeighborhoods, executeTopologyTransaction };