// src/models/mapModel.js
const db = require('../config/db'); // Ajusta a la ruta de tu conexión a MySQL
const { v4: uuidv4 } = require('uuid');

const getBlocksAndLots = async (neighborhoodId) => {
    let query = `
        SELECT 
            b.id AS block_id, b.code AS block_code, b.geom_path AS block_geom, b.label_position,
            l.id AS lot_id, l.number, l.number AS display_id, l.status, l.property_state, l.water_meter_code, l.cadastral_id,
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
                // Añadimos un sufijo al 'number' para liberar el nombre (unique_lot_block) 
                // ya que la base de datos no ignora los soft deletes en la llave única.
                const version = lot.version || 1;
                // El campo number en bd puede ser de 20 caracteres (varchar 20). 
                // Generar un random number corto u omitirlo evitando concatenar el time complet.
                // Como es aleatorio usar random pequeño (0-999) + 'd' (deleted).
                const randomId = Math.floor(Math.random() * 9999);
                const deleteSuffix = `-d${randomId}`;
                const query = `UPDATE lots SET status = 'inactive', number = CONCAT(SUBSTRING(number, 1, 20 - LENGTH(?)), ?) WHERE id = ? AND version = ?`;
                const [result] = await connection.execute(query, [deleteSuffix, deleteSuffix, lot.id, version]);
                
                if (result.affectedRows === 0) {
                    const conflictErr = new Error('Conflicto de concurrencia: El predio ha sido modificado por otro usuario.');
                    conflictErr.code = 409;
                    throw conflictErr;
                }
            }
        }

        let inferredBlockId = null;
        if (deletedLots && deletedLots.length > 0) {
            // Obtener el block_id de la base de datos por si el frontend no lo envía en los newLots
            const [dlots] = await connection.execute('SELECT block_id FROM lots WHERE id = ?', [deletedLots[0].id]);
            if (dlots.length > 0) inferredBlockId = dlots[0].block_id;
        }

        const createdLots = [];
        if (newLots && newLots.length > 0) {
            
            for (const lot of newLots) {
                // Si la acción es RESTORE, idealmente deberíamos intentar hacer un UNDELETE 
                // del lote original si es posible (ON DUPLICATE KEY UPDATE) o insertarlo con su ID original
                // Para mantenerlo simple según la guía, podemos insertarlo como nuevo si no existe, o forzar su ID.
                const newLotId = (action === 'RESTORE' && lot.id) ? lot.id : uuidv4();
                
                // Accepted always the one that's valid, path or svg_path
                const svgPathValue = lot.svg_path || lot.path || null;

                if (!svgPathValue) {
                    console.error('[executeTopologyTransaction] El lote no tiene svg_path ni path válido:', lot);
                    throw new Error('El predio nuevo no tiene una ruta SVG válida.');
                }

                const centroidJson = lot.centroid ? JSON.stringify(lot.centroid) : null;
                const baseLotNumber = lot.number || lot.display_id || `Lote-${Date.now()}`;
                const parentIdsJson = deletedLots ? JSON.stringify(deletedLots.map(l => l.id)) : null;
                
                // Privilegiamos el inferredBlockId (obtenido de la base de datos de los predios padres)
                // Esto previene que el frontend envíe códigos descriptivos de bloque ('M-01') en lugar del UUID del block.
                const finalBlockId = inferredBlockId || lot.block_id;
                if (!finalBlockId) {
                    throw new Error('No se pudo determinar el block_id para el nuevo predio.');
                }

                // Generar un random_number si falla la llave única podría ser mejor, pero como ya renombramos los soft-deletes, no debería chocar con los eliminados.
                
                let attemptUrl = 0;
                let inserted = false;
                let actualNumber = baseLotNumber;
                
                // Si el baseLotNumber es más de 20 caracteres, lo cortamos por seguridad
                if (actualNumber.length > 20) {
                    actualNumber = actualNumber.substring(0, 20);
                }

                // Intentamos insertar o actualizar si la acción es RESTORE
                const query = `
                    INSERT INTO lots 
                    (id, block_id, number, status, svg_path, centroid, area_m2, parent_ids, version) 
                    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 1)
                    ON DUPLICATE KEY UPDATE 
                    status = 'sin_informacion', svg_path = VALUES(svg_path), 
                    centroid = VALUES(centroid), area_m2 = VALUES(area_m2),
                    number = VALUES(number)
                `;

                while (!inserted && attemptUrl < 5) {
                    try {
                        const lotData = [
                            newLotId,
                            finalBlockId, 
                            actualNumber, 
                            'sin_informacion', 
                            svgPathValue, 
                            centroidJson, 
                            lot.area_m2 || 0,
                            parentIdsJson
                        ];
                        await connection.execute(query, lotData);
                        inserted = true;
                    } catch (err) {
                        if (err.code === 'ER_DUP_ENTRY') {
                            attemptUrl++;
                            const randId = Math.floor(Math.random() * 9999);
                            actualNumber = `${baseLotNumber.substring(0, 14)}-${randId}`;
                        } else {
                            throw err;
                        }
                    }
                }

                if (!inserted) {
                    throw new Error('No se pudo asignar un identificador único al predio (duplicado en DB).');
                }
                
                createdLots.push({
                    id: newLotId,
                    block_id: finalBlockId,
                    number: actualNumber,
                    display_id: lot.display_id || actualNumber.replace('Lote-', ''),
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