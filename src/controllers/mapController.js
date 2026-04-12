// src/controllers/mapController.js
const MapModel = require('../models/mapModel');

const getDigitalTwinData = async (req, res) => {
    try {
        const { neighborhoodId } = req.params;
        const rows = await MapModel.getBlocksAndLots(neighborhoodId);
        
        // Extraer viewBox desde metadata del barrio (guardado por procesar_plano.js)
        // Fallback al viewBox real del Mapa.svg de San Miguel de la Cañada
        let viewBox = '0 0 1103 667';
        if (rows.length > 0 && rows[0].neighborhood_metadata) {
            const meta = typeof rows[0].neighborhood_metadata === 'string'
                ? JSON.parse(rows[0].neighborhood_metadata)
                : rows[0].neighborhood_metadata;
            if (meta && meta.viewBox) viewBox = meta.viewBox;
        }

        const blocksMap = new Map();

        for (const row of rows) {
            if (!blocksMap.has(row.block_id)) {
                blocksMap.set(row.block_id, {
                    id: row.block_id,
                    code: row.block_code,
                    geom_path: row.block_geom,
                    label_position: typeof row.label_position === 'string' ? JSON.parse(row.label_position) : row.label_position,
                    lots: []
                });
            }

            if (row.lot_id) {
                blocksMap.get(row.block_id).lots.push({
                    id: row.lot_id,
                    block_id: row.block_id,
                    number: row.number,
                    status: row.status, 
                    property_state: row.property_state,
                    water_meter_code: row.water_meter_code,
                    cadastral_id: row.cadastral_id,
                    area_m2: parseFloat(row.area_m2),
                    path: row.svg_path,
                    centroid: typeof row.centroid === 'string' ? JSON.parse(row.centroid) : row.centroid,
                    version: typeof row.version !== 'undefined' ? row.version : 1
                });
            }
        }

        const response = {
            viewBox,
            blocks: Array.from(blocksMap.values())
        };

        res.json({ ok: true, data: response });

    } catch (error) {
        console.error('Error obteniendo Gemelo Digital:', error);
        res.status(500).json({ ok: false, message: 'Error obteniendo los datos del mapa.' });
    }
};

const updateLotStatus = async (req, res) => {
    try {
        const { lotId } = req.params;
        const { status, water_meter_code, cadastral_id, number } = req.body;

        const updateData = Object.fromEntries(
            Object.entries({ status, water_meter_code, cadastral_id, number }).filter(([_, v]) => v !== undefined)
        );

        if (Object.keys(updateData).length === 0) {
            return res.status(400).json({ ok: false, message: 'No hay datos para actualizar.' });
        }

        await MapModel.updateLot(lotId, updateData);

        res.json({ ok: true, message: 'Predio actualizado exitosamente.' });
    } catch (error) {
        console.error('Error actualizando predio:', error);
        res.status(500).json({ ok: false, message: 'Error interno al actualizar predio.' });
    }
};

// CORRECCIÓN: Llamamos al modelo en lugar de usar db directo
const getNeighborhoods = async (req, res) => {
    try {
        const rows = await MapModel.getAllNeighborhoods();
        res.json({ ok: true, data: rows });
    } catch (error) {
        console.error('Error obteniendo barrios:', error);
        res.status(500).json({ ok: false, message: 'Error interno al obtener los sectores.' });
    }
};

/**
 * Obtiene los lotes disponibles (sin_informacion) de un barrio para el selector de lotes
 * Este endpoint es público (usado en formularios públicos)
 */
const getAvailableLots = async (req, res) => {
    try {
        const { neighborhoodId } = req.params;

        if (!neighborhoodId) {
            return res.status(400).json({ ok: false, message: 'Se requiere el ID del barrio.' });
        }

        const rows = await MapModel.getBlocksAndLots(neighborhoodId);

        // Extraer viewBox desde metadata del barrio
        let viewBox = '0 0 1103 667';
        if (rows.length > 0 && rows[0].neighborhood_metadata) {
            const meta = typeof rows[0].neighborhood_metadata === 'string'
                ? JSON.parse(rows[0].neighborhood_metadata)
                : rows[0].neighborhood_metadata;
            if (meta && meta.viewBox) viewBox = meta.viewBox;
        }

        const blocksMap = new Map();

        for (const row of rows) {
            if (!blocksMap.has(row.block_id)) {
                blocksMap.set(row.block_id, {
                    id: row.block_id,
                    code: row.block_code,
                    lots: []
                });
            }

            // Incluir TODOS los lotes pero marcar cuáles están disponibles
            if (row.lot_id) {
                blocksMap.get(row.block_id).lots.push({
                    id: row.lot_id,
                    number: row.number,
                    status: row.status,
                    property_state: row.property_state,
                    path: row.svg_path,
                    centroid: typeof row.centroid === 'string' ? JSON.parse(row.centroid) : row.centroid,
                    available: row.status === 'sin_informacion'
                });
            }
        }

        const response = {
            viewBox,
            blocks: Array.from(blocksMap.values())
        };

        res.json({ ok: true, data: response });

    } catch (error) {
        console.error('Error obteniendo lotes disponibles:', error);
        res.status(500).json({ ok: false, message: 'Error obteniendo los lotes disponibles.' });
    }
};

const updateTopology = async (req, res) => {
    try {
        const { action, deletedLots, newLots } = req.body;

        if (!action || !deletedLots || !newLots) {
            return res.status(400).json({ ok: false, message: 'Faltan parámetros obligatorios.' });
        }

        const result = await MapModel.executeTopologyTransaction(action, deletedLots, newLots);

        res.json({ 
            ok: true, 
            message: `Operación ${action} ejecutada exitosamente.`,
            newData: result.createdLots 
        });
    } catch (error) {
        if (error.code === 409) {
            return res.status(409).json({ ok: false, message: error.message });
        }
        console.error(`Error en transacción topológica (${req.body.action}):`, error);
        res.status(500).json({ ok: false, message: 'Error interno al actualizar topología catastral.' });
    }
};

const updateBlock = async (req, res) => {
    try {
        const { blockId } = req.params;
        const { code } = req.body;

        if (!code || !String(code).trim()) {
            return res.status(400).json({ ok: false, message: 'El código de manzana no puede estar vacío.' });
        }

        await MapModel.updateBlock(blockId, { code: String(code).trim() });
        res.json({ ok: true, message: 'Manzana actualizada exitosamente.', code: String(code).trim() });
    } catch (error) {
        console.error('Error actualizando manzana:', error);
        res.status(500).json({ ok: false, message: 'Error interno al actualizar la manzana.' });
    }
};

module.exports = { getDigitalTwinData, updateLotStatus, getNeighborhoods, getAvailableLots, updateTopology, updateBlock };