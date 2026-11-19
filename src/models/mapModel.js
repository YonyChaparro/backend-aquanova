// src/models/mapModel.js
const db = require('../config/db'); // Ajusta a la ruta de tu conexión a MySQL
const { v4: uuidv4 } = require('uuid');

const getBlocksAndLots = async (neighborhoodId) => {
    let query = `
        SELECT
            b.id AS block_id, b.code AS block_code, b.geom_path AS block_geom, b.label_position,
            l.id AS lot_id, l.number, l.number AS display_id, l.status, l.property_state, l.water_meter_code, l.cadastral_id,
            l.external_id, l.area_m2, l.svg_path, l.centroid, l.version,
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

// Datos del censo por barrio para el gemelo digital
const getCensusByNeighborhood = async (neighborhoodId) => {
    const [rows] = await db.execute(`
        SELECT
            s.id                                                                AS id_respuesta,
            -- lot_id resuelto: FK directa > external_id mapping > UUID legado del formulario
            COALESCE(
                s.lot_id,
                lot_ext.id,
                JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.predio_id'))
            )                                                                   AS lot_id,
            s.lot_id                                                            AS lot_id_directo,
            lot_ext.id                                                          AS lot_id_via_external,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.predio_id'))              AS predio_id_legado,
            s.created_at                                                        AS fecha_creacion,
            n.name                                                              AS barrio,
            JSON_EXTRACT(s.responses, '$.manzana')                             AS manzana,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.direccion'))              AS direccion,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.tipo_punto'))             AS tipo_punto,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.clase_uso'))              AS clase_uso,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.estado_predio'))          AS estado_predio,
            JSON_EXTRACT(s.responses, '$.unidades_habitacionales')             AS unidades_habitacionales,
            JSON_EXTRACT(s.responses, '$.numero_habitantes')                   AS numero_habitantes,
            JSON_EXTRACT(s.responses, '$.numero_familias')                     AS numero_familias,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.tiene_agua'))             AS tiene_agua,
            JSON_EXTRACT(s.responses, '$.horas_agua')                          AS horas_agua,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.registro_inspector'))     AS registro,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.plano'))                  AS plano,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.observaciones'))          AS observaciones,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.nombre_inspector'))       AS inspector_nombre,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.nombre_atiende'))         AS atendio_nombre,
            JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.rol_atiende'))            AS atendio_rol,
            (SELECT a.storage_path
             FROM attachments a
             WHERE a.submission_id = s.id AND a.field_key = 'foto_fachada'
             LIMIT 1)                                                           AS foto_fachada,
            (SELECT a.storage_path
             FROM attachments a
             WHERE a.submission_id = s.id AND a.field_key = 'firma_digital'
             LIMIT 1)                                                           AS firma_digital
        FROM submissions s
        JOIN form_versions fv ON fv.id = s.form_version_id
        JOIN forms f          ON f.id  = fv.form_id
        JOIN neighborhoods n  ON n.id  = s.neighborhood_id
        -- Intenta resolver el predio por external_id cuando no hay FK directa
        LEFT JOIN lots lot_ext ON lot_ext.external_id = JSON_UNQUOTE(JSON_EXTRACT(s.responses, '$.predio_id'))
        WHERE s.neighborhood_id = ?
          AND f.key = 'censo-masivo-catastro-v2'
        ORDER BY s.created_at DESC
    `, [neighborhoodId]);

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
            const [dlots] = await connection.execute('SELECT block_id FROM lots WHERE id = ?', [deletedLots[0].id]);
            if (dlots.length > 0) inferredBlockId = dlots[0].block_id;
        }

        const createdLots = [];
        if (newLots && newLots.length > 0) {
            for (const lot of newLots) {
                const newLotId = (action === 'RESTORE' && lot.id) ? lot.id : uuidv4();
                const svgPathValue = lot.svg_path || lot.path || null;

                if (!svgPathValue) {
                    console.error('[executeTopologyTransaction] El lote no tiene svg_path ni path válido:', lot);
                    throw new Error('El predio nuevo no tiene una ruta SVG válida.');
                }

                const centroidJson = lot.centroid ? JSON.stringify(lot.centroid) : null;
                const baseLotNumber = lot.number || lot.display_id || `Lote-${Date.now()}`;
                const parentIdsJson = deletedLots ? JSON.stringify(deletedLots.map(l => l.id)) : null;

                const finalBlockId = inferredBlockId || lot.block_id;
                if (!finalBlockId) {
                    throw new Error('No se pudo determinar el block_id para el nuevo predio.');
                }

                let attemptUrl = 0;
                let inserted = false;
                let actualNumber = baseLotNumber;

                if (actualNumber.length > 20) {
                    actualNumber = actualNumber.substring(0, 20);
                }

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
                    path: svgPathValue,
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

module.exports = {
    getBlocksAndLots,
    updateLot,
    updateBlock,
    getAllNeighborhoods,
    getCensusByNeighborhood,
    executeTopologyTransaction
};
