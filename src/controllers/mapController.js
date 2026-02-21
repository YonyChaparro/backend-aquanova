// src/controllers/mapController.js
const MapModel = require('../models/mapModel');

const getDigitalTwinData = async (req, res) => {
    try {
        const { neighborhoodId } = req.params;
        
        // 1. Obtener datos planos de la BD
        const rows = await MapModel.getBlocksAndLots(neighborhoodId);
        
        // 2. Agrupar los lotes dentro de sus respectivas manzanas
        const blocksMap = new Map();

        for (const row of rows) {
            // Si la manzana no existe en el mapa, la creamos
            if (!blocksMap.has(row.block_id)) {
                blocksMap.set(row.block_id, {
                    id: row.block_id,
                    code: row.block_code,
                    geom_path: row.block_geom,
                    // Parseamos el JSON si viene como string desde MySQL
                    label_position: typeof row.label_position === 'string' ? JSON.parse(row.label_position) : row.label_position,
                    lots: []
                });
            }

            // Si hay un lote asociado a esta manzana, lo insertamos en su array
            if (row.lot_id) {
                blocksMap.get(row.block_id).lots.push({
                    id: row.lot_id,
                    number: row.number,
                    status: row.status, // 'sin_informacion', 'censado', 'registrado'
                    water_meter_code: row.water_meter_code,
                    cadastral_id: row.cadastral_id,
                    area_m2: parseFloat(row.area_m2),
                    path: row.svg_path,
                    centroid: typeof row.centroid === 'string' ? JSON.parse(row.centroid) : row.centroid
                });
            }
        }

        // 3. Formatear la respuesta final esperada por el Frontend
        const response = {
            viewBox: "0 0 1200 800", // Modifica esto si tu SVG original tiene otro viewBox
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
        // Agregamos 'number' (que usaremos como dirección) a los campos permitidos
        const { status, water_meter_code, cadastral_id, number } = req.body;

        // Limpiar keys indefinidas para actualizar solo lo que se envía
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

module.exports = { getDigitalTwinData, updateLotStatus };