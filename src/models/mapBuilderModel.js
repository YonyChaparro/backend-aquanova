// src/models/mapBuilderModel.js
const db = require('../config/db');
const { v4: uuidv4 } = require('uuid');

/**
 * Obtener bloques y lotes de un barrio para edición en el Map Builder.
 * Incluye toda la información necesaria para reconstruir el canvas.
 */
const getMapByNeighborhood = async (neighborhoodId) => {
    const query = `
        SELECT
            b.id AS block_id, b.code AS block_code, b.geom_path AS block_geom, b.label_position,
            l.id AS lot_id, l.number, l.status, l.water_meter_code, l.cadastral_id,
            l.external_id, l.area_m2, l.svg_path, l.centroid,
            n.metadata AS neighborhood_metadata
        FROM blocks b
        INNER JOIN neighborhoods n ON b.neighborhood_id = n.id
        LEFT JOIN lots l ON b.id = l.block_id
        WHERE b.neighborhood_id = ?
    `;
    const [rows] = await db.execute(query, [neighborhoodId]);
    return rows;
};

/**
 * Guardar mapa completo en una transacción.
 * Maneja creación, actualización y eliminación de bloques y lotes.
 */
const saveMap = async (neighborhoodId, viewBox, blocks, deletedBlockIds, deletedLotIds) => {
    const conn = await db.getConnection();
    await conn.beginTransaction();

    const summary = {
        blocksCreated: 0,
        blocksUpdated: 0,
        blocksDeleted: 0,
        lotsCreated: 0,
        lotsUpdated: 0,
        lotsDeleted: 0
    };

    try {
        // 1. Actualizar metadata.viewBox del neighborhood
        const [neighRows] = await conn.execute(
            'SELECT metadata FROM neighborhoods WHERE id = ?',
            [neighborhoodId]
        );

        let metadata = {};
        if (neighRows.length > 0 && neighRows[0].metadata) {
            metadata = typeof neighRows[0].metadata === 'string'
                ? JSON.parse(neighRows[0].metadata)
                : neighRows[0].metadata;
        }
        metadata.viewBox = viewBox;

        await conn.execute(
            'UPDATE neighborhoods SET metadata = ? WHERE id = ?',
            [JSON.stringify(metadata), neighborhoodId]
        );

        // 2. Eliminar lots de deletedLotIds
        if (deletedLotIds && deletedLotIds.length > 0) {
            const lotPlaceholders = deletedLotIds.map(() => '?').join(',');
            await conn.execute(
                `DELETE FROM lots WHERE id IN (${lotPlaceholders})`,
                deletedLotIds
            );
            summary.lotsDeleted = deletedLotIds.length;
        }

        // 3. Eliminar blocks de deletedBlockIds
        if (deletedBlockIds && deletedBlockIds.length > 0) {
            const blockPlaceholders = deletedBlockIds.map(() => '?').join(',');
            await conn.execute(
                `DELETE FROM lots WHERE block_id IN (${blockPlaceholders})`,
                deletedBlockIds
            );
            await conn.execute(
                `DELETE FROM blocks WHERE id IN (${blockPlaceholders})`,
                deletedBlockIds
            );
            summary.blocksDeleted = deletedBlockIds.length;
        }

        // 4. Para cada block: INSERT o UPDATE
        if (blocks && blocks.length > 0) {
            // Obtener IDs de bloques existentes para este barrio
            const [existingBlocks] = await conn.execute(
                'SELECT id FROM blocks WHERE neighborhood_id = ?',
                [neighborhoodId]
            );
            const existingBlockIds = new Set(existingBlocks.map(b => b.id));

            for (const block of blocks) {
                const blockId = block.id && existingBlockIds.has(block.id) ? block.id : null;
                const labelPosition = block.label_position
                    ? JSON.stringify(block.label_position)
                    : null;

                if (blockId) {
                    // UPDATE block existente
                    await conn.execute(
                        `UPDATE blocks SET code = ?, geom_path = ?, label_position = ? WHERE id = ?`,
                        [block.code, block.geom_path, labelPosition, blockId]
                    );
                    summary.blocksUpdated++;

                    // 5. Procesar lots del block
                    if (block.lots && block.lots.length > 0) {
                        const [existingLots] = await conn.execute(
                            'SELECT id FROM lots WHERE block_id = ?',
                            [blockId]
                        );
                        const existingLotIds = new Set(existingLots.map(l => l.id));

                        for (const lot of block.lots) {
                            const lotId = lot.id && existingLotIds.has(lot.id) ? lot.id : null;
                            const centroid = lot.centroid ? JSON.stringify(lot.centroid) : null;

                            if (lotId) {
                                // UPDATE lot existente
                                await conn.execute(
                                    `UPDATE lots SET number = ?, svg_path = ?, centroid = ?, area_m2 = ? WHERE id = ?`,
                                    [lot.number, lot.svg_path, centroid, lot.area_m2 || null, lotId]
                                );
                                summary.lotsUpdated++;
                            } else {
                                // INSERT nuevo lot
                                const newLotId = lot.id || uuidv4();
                                await conn.execute(
                                    `INSERT INTO lots (id, block_id, number, status, svg_path, centroid, area_m2)
                                     VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                    [
                                        newLotId,
                                        blockId,
                                        lot.number,
                                        lot.status || 'sin_informacion',
                                        lot.svg_path,
                                        centroid,
                                        lot.area_m2 || null
                                    ]
                                );
                                summary.lotsCreated++;
                            }
                        }
                    }
                } else {
                    // INSERT nuevo block
                    const newBlockId = block.id || uuidv4();
                    await conn.execute(
                        `INSERT INTO blocks (id, code, neighborhood_id, geom_path, label_position)
                         VALUES (?, ?, ?, ?, ?)`,
                        [newBlockId, block.code, neighborhoodId, block.geom_path, labelPosition]
                    );
                    summary.blocksCreated++;

                    // INSERT lots del nuevo block
                    if (block.lots && block.lots.length > 0) {
                        for (const lot of block.lots) {
                            const newLotId = lot.id || uuidv4();
                            const centroid = lot.centroid ? JSON.stringify(lot.centroid) : null;
                            await conn.execute(
                                `INSERT INTO lots (id, block_id, number, status, svg_path, centroid, area_m2)
                                 VALUES (?, ?, ?, ?, ?, ?, ?)`,
                                [
                                    newLotId,
                                    newBlockId,
                                    lot.number,
                                    lot.status || 'sin_informacion',
                                    lot.svg_path,
                                    centroid,
                                    lot.area_m2 || null
                                ]
                            );
                            summary.lotsCreated++;
                        }
                    }
                }
            }
        }

        await conn.commit();
        return summary;
    } catch (error) {
        await conn.rollback();
        throw error;
    } finally {
        conn.release();
    }
};

/**
 * Validar geometría de bloques y lotes (server-side).
 * Verifica:
 * - Polígonos cerrados (terminan en Z o primer punto = último punto)
 * - Mínimo 3 vértices por polígono
 * Retorna { valid: boolean, errors: [] }
 */
const validateGeometry = (blocks) => {
    const errors = [];

    if (!blocks || !Array.isArray(blocks)) {
        return { valid: false, errors: ['blocks debe ser un array'] };
    }

    for (let i = 0; i < blocks.length; i++) {
        const block = blocks[i];

        if (!block.code) {
            errors.push(`Block[${i}]: falta código de manzana`);
        }

        if (!block.geom_path) {
            errors.push(`Block[${i}] (${block.code || 'sin código'}): falta geom_path`);
        } else {
            const pathErrors = validatePath(block.geom_path, `Block[${i}] (${block.code || 'sin código'})`);
            errors.push(...pathErrors);
        }

        if (block.lots && Array.isArray(block.lots)) {
            for (let j = 0; j < block.lots.length; j++) {
                const lot = block.lots[j];

                if (!lot.number) {
                    errors.push(`Block[${i}].Lot[${j}]: falta número de lote`);
                }

                if (!lot.svg_path) {
                    errors.push(`Block[${i}].Lot[${j}] (${lot.number || 'sin número'}): falta svg_path`);
                } else {
                    const lotPathErrors = validatePath(
                        lot.svg_path,
                        `Block[${i}].Lot[${j}] (${lot.number || 'sin número'})`
                    );
                    errors.push(...lotPathErrors);
                }
            }
        }
    }

    return { valid: errors.length === 0, errors };
};

/**
 * Validar un path SVG individual.
 * Verifica que esté cerrado y tenga al menos 3 vértices.
 */
function validatePath(dPath, label) {
    const errors = [];

    // Extraer coordenadas numéricas
    const coords = dPath.match(/-?\d+\.?\d*/g);
    if (!coords || coords.length < 6) {
        errors.push(`${label}: polígono con menos de 3 vértices (se encontraron ${coords ? Math.floor(coords.length / 2) : 0})`);
        return errors;
    }

    // Verificar que esté cerrado (termina en Z o primer punto ≈ último punto)
    const trimmed = dPath.trim().toUpperCase();
    const endsWithZ = trimmed.endsWith('Z');

    if (!endsWithZ) {
        // Verificar si primer punto = último punto
        const numCoords = coords.map(Number);
        const firstX = numCoords[0];
        const firstY = numCoords[1];
        const lastX = numCoords[numCoords.length - 2];
        const lastY = numCoords[numCoords.length - 1];

        const tolerance = 0.01;
        if (Math.abs(firstX - lastX) > tolerance || Math.abs(firstY - lastY) > tolerance) {
            errors.push(`${label}: polígono no está cerrado (no termina en Z y primer punto ≠ último punto)`);
        }
    }

    return errors;
}

/**
 * UPSERT borrador del Map Builder.
 * Solo se permite un borrador por barrio (UNIQUE KEY).
 */
const saveDraft = async (neighborhoodId, userId, canvasState) => {
    const id = uuidv4();
    const query = `
        INSERT INTO map_builder_drafts (id, neighborhood_id, user_id, canvas_state)
        VALUES (?, ?, ?, ?)
        ON DUPLICATE KEY UPDATE
            canvas_state = VALUES(canvas_state),
            user_id = VALUES(user_id),
            updated_at = CURRENT_TIMESTAMP
    `;
    const [result] = await db.execute(query, [
        id,
        neighborhoodId,
        userId,
        JSON.stringify(canvasState)
    ]);
    return result;
};

/**
 * Obtener borrador de un barrio.
 */
const getDraft = async (neighborhoodId) => {
    const [rows] = await db.execute(
        'SELECT * FROM map_builder_drafts WHERE neighborhood_id = ?',
        [neighborhoodId]
    );
    return rows.length > 0 ? rows[0] : null;
};

/**
 * Eliminar borrador de un barrio.
 */
const deleteDraft = async (neighborhoodId) => {
    const [result] = await db.execute(
        'DELETE FROM map_builder_drafts WHERE neighborhood_id = ?',
        [neighborhoodId]
    );
    return result;
};

module.exports = {
    getMapByNeighborhood,
    saveMap,
    validateGeometry,
    saveDraft,
    getDraft,
    deleteDraft
};
