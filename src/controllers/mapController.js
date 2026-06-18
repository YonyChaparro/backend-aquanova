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
                    number: row.number,
                    display_id: `${row.block_code}-${row.number}`,
                    status: row.status,
                    water_meter_code: row.water_meter_code,
                    cadastral_id: row.cadastral_id,
                    external_id: row.external_id || null,
                    area_m2: parseFloat(row.area_m2),
                    path: row.svg_path,
                    centroid: typeof row.centroid === 'string' ? JSON.parse(row.centroid) : row.centroid
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

const getCensusData = async (req, res) => {
    try {
        const { neighborhoodId } = req.params;
        const rows = await MapModel.getCensusByNeighborhood(neighborhoodId);
        res.json({ ok: true, count: rows.length, data: rows });
    } catch (error) {
        console.error('Error obteniendo datos del censo:', error);
        res.status(500).json({ ok: false, message: 'Error al obtener datos del censo.' });
    }
};

module.exports = { getDigitalTwinData, updateLotStatus, getNeighborhoods, getCensusData };