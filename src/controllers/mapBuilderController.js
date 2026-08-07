// src/controllers/mapBuilderController.js
const cheerio = require('cheerio');
const MapBuilderModel = require('../models/mapBuilderModel');

/**
 * POST /api/map-builder/save
 * Valida geometría + guarda mapa completo + elimina draft si existe.
 */
const saveMap = async (req, res) => {
    try {
        const { neighborhoodId, viewBox, blocks, deletedBlockIds, deletedLotIds } = req.body;

        if (!neighborhoodId) {
            return res.status(400).json({ ok: false, message: 'neighborhoodId es requerido.' });
        }
        if (!viewBox) {
            return res.status(400).json({ ok: false, message: 'viewBox es requerido.' });
        }
        if (!blocks || !Array.isArray(blocks)) {
            return res.status(400).json({ ok: false, message: 'blocks debe ser un array.' });
        }

        // Validar geometría antes de guardar
        const validation = MapBuilderModel.validateGeometry(blocks);
        if (!validation.valid) {
            return res.status(400).json({
                ok: false,
                message: 'Errores de validación geométrica.',
                errors: validation.errors
            });
        }

        // Guardar mapa completo en transacción
        const summary = await MapBuilderModel.saveMap(
            neighborhoodId,
            viewBox,
            blocks,
            deletedBlockIds || [],
            deletedLotIds || []
        );

        // Eliminar borrador si existe (ya se guardó el mapa real)
        await MapBuilderModel.deleteDraft(neighborhoodId);

        res.json({
            ok: true,
            message: 'Mapa guardado exitosamente.',
            data: summary
        });
    } catch (error) {
        console.error('Error guardando mapa:', error);
        res.status(500).json({ ok: false, message: 'Error interno al guardar el mapa.' });
    }
};

/**
 * GET /api/map-builder/:neighborhoodId
 * Carga mapa existente con todos los bloques y lotes para edición.
 */
const loadMap = async (req, res) => {
    try {
        const { neighborhoodId } = req.params;

        const rows = await MapBuilderModel.getMapByNeighborhood(neighborhoodId);

        // Extraer viewBox desde metadata del barrio
        let viewBox = '0 0 1103 667';
        if (rows.length > 0 && rows[0].neighborhood_metadata) {
            const meta = typeof rows[0].neighborhood_metadata === 'string'
                ? JSON.parse(rows[0].neighborhood_metadata)
                : rows[0].neighborhood_metadata;
            if (meta && meta.viewBox) viewBox = meta.viewBox;
        }

        // Agrupar bloques y lotes
        const blocksMap = new Map();

        for (const row of rows) {
            if (!blocksMap.has(row.block_id)) {
                blocksMap.set(row.block_id, {
                    id: row.block_id,
                    code: row.block_code,
                    geom_path: row.block_geom,
                    label_position: typeof row.label_position === 'string'
                        ? JSON.parse(row.label_position)
                        : row.label_position,
                    lots: []
                });
            }

            if (row.lot_id) {
                blocksMap.get(row.block_id).lots.push({
                    id: row.lot_id,
                    number: row.number,
                    status: row.status,
                    water_meter_code: row.water_meter_code,
                    cadastral_id: row.cadastral_id,
                    external_id: row.external_id || null,
                    area_m2: row.area_m2 ? parseFloat(row.area_m2) : null,
                    svg_path: row.svg_path,
                    centroid: typeof row.centroid === 'string'
                        ? JSON.parse(row.centroid)
                        : row.centroid
                });
            }
        }

        res.json({
            ok: true,
            data: {
                viewBox,
                blocks: Array.from(blocksMap.values())
            }
        });
    } catch (error) {
        console.error('Error cargando mapa:', error);
        res.status(500).json({ ok: false, message: 'Error interno al cargar el mapa.' });
    }
};

/**
 * POST /api/map-builder/validate
 * Valida geometría sin guardar. Útil para validación en tiempo real.
 */
const validateMap = async (req, res) => {
    try {
        const { blocks } = req.body;

        if (!blocks || !Array.isArray(blocks)) {
            return res.status(400).json({ ok: false, message: 'blocks debe ser un array.' });
        }

        const validation = MapBuilderModel.validateGeometry(blocks);

        res.json({
            ok: true,
            data: validation
        });
    } catch (error) {
        console.error('Error validando mapa:', error);
        res.status(500).json({ ok: false, message: 'Error interno al validar el mapa.' });
    }
};

/**
 * POST /api/map-builder/import-svg
 * Parsea un archivo SVG subido, extrae paths y calcula geometrías.
 * Usa cheerio para parsear el SVG.
 */
const importSvg = async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ ok: false, message: 'No se recibió ningún archivo SVG.' });
        }

        const svgContent = req.file.buffer.toString('utf-8');
        const $ = cheerio.load(svgContent, { xmlMode: true });

        // Extraer viewBox del SVG
        const svgEl = $('svg').first();
        const viewBox = svgEl.attr('viewBox') ||
            `0 0 ${svgEl.attr('width') || 1000} ${svgEl.attr('height') || 1000}`;

        // Extraer todos los <path>
        const paths = $('path');
        const extractedPaths = [];

        paths.each((index, el) => {
            const d = $(el).attr('d');
            if (!d) return;

            const id = $(el).attr('id') || null;
            const className = $(el).attr('class') || null;

            // Determinar si está cerrado
            const trimmed = d.trim();
            const isClosed = trimmed.toUpperCase().endsWith('Z');

            // Extraer coordenadas para calcular área y centroide
            const geometry = calculatePathGeometry(d);

            extractedPaths.push({
                index,
                id,
                className,
                d,
                isClosed,
                vertexCount: geometry ? geometry.vertexCount : 0,
                area: geometry ? geometry.area : 0,
                centroid: geometry ? geometry.centroid : null
            });
        });

        // Separar paths cerrados (candidatos a lotes/bloques) de paths abiertos (decoración)
        const closedPaths = extractedPaths.filter(p => p.isClosed && p.vertexCount >= 3);
        const openPaths = extractedPaths.filter(p => !p.isClosed || p.vertexCount < 3);

        res.json({
            ok: true,
            data: {
                viewBox,
                totalPaths: extractedPaths.length,
                closedPaths: closedPaths.length,
                openPaths: openPaths.length,
                paths: closedPaths,
                decorativePaths: openPaths
            }
        });
    } catch (error) {
        console.error('Error importando SVG:', error);
        res.status(500).json({ ok: false, message: 'Error interno al procesar el archivo SVG.' });
    }
};

/**
 * Calcula área (Shoelace) y centroide de un path SVG.
 * Extrae coordenadas numéricas del atributo 'd'.
 */
function calculatePathGeometry(dPath) {
    const coords = dPath.match(/-?\d+\.?\d*/g);
    if (!coords || coords.length < 6) return null;

    const points = [];
    for (let i = 0; i < coords.length; i += 2) {
        if (i + 1 < coords.length) {
            points.push({
                x: parseFloat(coords[i]),
                y: parseFloat(coords[i + 1])
            });
        }
    }

    if (points.length < 3) return null;

    // Fórmula del Shoelace para calcular área
    let area = 0;
    let cx = 0;
    let cy = 0;
    const n = points.length;

    for (let i = 0; i < n; i++) {
        const j = (i + 1) % n;
        const cross = points[i].x * points[j].y - points[j].x * points[i].y;
        area += cross;
        cx += (points[i].x + points[j].x) * cross;
        cy += (points[i].y + points[j].y) * cross;
    }

    area = Math.abs(area) / 2;

    // Centroide (centro de masa del polígono)
    const factor = area > 0 ? (1 / (6 * area)) : 0;
    const centroid = {
        x: area > 0 ? Number(Math.abs(cx * factor).toFixed(2)) : Number(((Math.min(...points.map(p => p.x)) + Math.max(...points.map(p => p.x))) / 2).toFixed(2)),
        y: area > 0 ? Number(Math.abs(cy * factor).toFixed(2)) : Number(((Math.min(...points.map(p => p.y)) + Math.max(...points.map(p => p.y))) / 2).toFixed(2))
    };

    return {
        vertexCount: points.length,
        area: Number(area.toFixed(2)),
        centroid
    };
}

/**
 * POST /api/map-builder/draft
 * Auto-save borrador del estado del canvas.
 */
const saveDraft = async (req, res) => {
    try {
        const { neighborhoodId, canvasState } = req.body;
        const userId = req.user.id;

        if (!neighborhoodId) {
            return res.status(400).json({ ok: false, message: 'neighborhoodId es requerido.' });
        }
        if (!canvasState) {
            return res.status(400).json({ ok: false, message: 'canvasState es requerido.' });
        }

        await MapBuilderModel.saveDraft(neighborhoodId, userId, canvasState);

        res.json({ ok: true, message: 'Borrador guardado exitosamente.' });
    } catch (error) {
        console.error('Error guardando borrador:', error);
        res.status(500).json({ ok: false, message: 'Error interno al guardar el borrador.' });
    }
};

/**
 * GET /api/map-builder/draft/:neighborhoodId
 * Recuperar borrador de un barrio.
 */
const getDraft = async (req, res) => {
    try {
        const { neighborhoodId } = req.params;

        const draft = await MapBuilderModel.getDraft(neighborhoodId);

        if (!draft) {
            return res.status(404).json({ ok: false, message: 'No se encontró borrador para este barrio.' });
        }

        // Parsear canvas_state si es string
        const canvasState = typeof draft.canvas_state === 'string'
            ? JSON.parse(draft.canvas_state)
            : draft.canvas_state;

        res.json({
            ok: true,
            data: {
                id: draft.id,
                neighborhoodId: draft.neighborhood_id,
                userId: draft.user_id,
                canvasState,
                createdAt: draft.created_at,
                updatedAt: draft.updated_at
            }
        });
    } catch (error) {
        console.error('Error obteniendo borrador:', error);
        res.status(500).json({ ok: false, message: 'Error interno al obtener el borrador.' });
    }
};

/**
 * DELETE /api/map-builder/draft/:neighborhoodId
 * Eliminar borrador de un barrio.
 */
const deleteDraft = async (req, res) => {
    try {
        const { neighborhoodId } = req.params;

        const result = await MapBuilderModel.deleteDraft(neighborhoodId);

        if (result.affectedRows === 0) {
            return res.status(404).json({ ok: false, message: 'No se encontró borrador para eliminar.' });
        }

        res.json({ ok: true, message: 'Borrador eliminado exitosamente.' });
    } catch (error) {
        console.error('Error eliminando borrador:', error);
        res.status(500).json({ ok: false, message: 'Error interno al eliminar el borrador.' });
    }
};

module.exports = { saveMap, loadMap, validateMap, importSvg, saveDraft, getDraft, deleteDraft };
