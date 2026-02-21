// src/routes/mapRoutes.js
const express = require('express');
const router = express.Router();
const mapController = require('../controllers/mapController');

/**
 * @swagger
 * /map/digital-twin:
 *   get:
 *     summary: Obtener datos del gemelo digital (todos los bloques y predios)
 *     tags: [Map]
 *     description: Retorna la estructura completa del mapa con todos los bloques y predios sin filtros
 *     responses:
 *       200:
 *         description: Datos del gemelo digital obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     viewBox:
 *                       type: string
 *                       description: Dimensiones del SVG viewBox
 *                     blocks:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           id:
 *                             type: string
 *                           code:
 *                             type: string
 *                           geom_path:
 *                             type: string
 *                             description: SVG path para la geometría del bloque
 *                           label_position:
 *                             type: object
 *                             properties:
 *                               x:
 *                                 type: number
 *                               y:
 *                                 type: number
 *                           lots:
 *                             type: array
 *                             items:
 *                               type: object
 *                               properties:
 *                                 id:
 *                                   type: string
 *                                 number:
 *                                   type: string
 *                                 status:
 *                                   type: string
 *                                 water_meter_code:
 *                                   type: string
 *                                 cadastral_id:
 *                                   type: string
 *                                 area_m2:
 *                                   type: number
 *                                 path:
 *                                   type: string
 *                                   description: SVG path para la geometría del predio
 *                                 centroid:
 *                                   type: object
 *                                   properties:
 *                                     x:
 *                                       type: number
 *                                     y:
 *                                       type: number
 *       500:
 *         description: Error al obtener datos del mapa
 */
router.get('/digital-twin', mapController.getDigitalTwinData);

/**
 * @swagger
 * /map/digital-twin/{neighborhoodId}:
 *   get:
 *     summary: Obtener datos del gemelo digital filtrado por barrio
 *     tags: [Map]
 *     description: Retorna la estructura del mapa con bloques y predios de un barrio específico
 *     parameters:
 *       - name: neighborhoodId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID único del barrio
 *     responses:
 *       200:
 *         description: Datos del gemelo digital del barrio obtenidos exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     viewBox:
 *                       type: string
 *                     blocks:
 *                       type: array
 *                       items:
 *                         type: object
 *       500:
 *         description: Error al obtener datos del mapa
 */
router.get('/digital-twin/:neighborhoodId', mapController.getDigitalTwinData);

/**
 * @swagger
 * /map/predios/{lotId}:
 *   patch:
 *     summary: Actualizar información de un predio
 *     tags: [Map]
 *     description: Actualiza el estado, código de medidor, ID catastral o número de un predio
 *     parameters:
 *       - name: lotId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *         description: ID único del predio a actualizar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               status:
 *                 type: string
 *                 description: Estado del predio (ej. disponible, ocupado, etc.)
 *               water_meter_code:
 *                 type: string
 *                 description: Código del medidor de agua
 *               cadastral_id:
 *                 type: string
 *                 description: ID catastral del predio
 *               number:
 *                 type: string
 *                 description: Número del predio
 *           example:
 *             status: "ocupado"
 *             water_meter_code: "MED-2026-001"
 *             cadastral_id: "CAD-ABC-123"
 *             number: "5A"
 *     responses:
 *       200:
 *         description: Predio actualizado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 message:
 *                   type: string
 *       400:
 *         description: No hay datos para actualizar
 *       500:
 *         description: Error interno al actualizar predio
 */
router.patch('/predios/:lotId', mapController.updateLotStatus);

/**
 * @swagger
 * /map/neighborhoods:
 *   get:
 *     summary: Obtener lista de todos los barrios disponibles
 *     tags: [Map]
 *     description: Retorna una lista completa de barrios ordenados alfabéticamente
 *     responses:
 *       200:
 *         description: Lista de barrios obtenida exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       name:
 *                         type: string
 *                       code:
 *                         type: string
 *           example:
 *             ok: true
 *             data:
 *               - id: "uuid-nei-1"
 *                 name: "Barrio Centro"
 *                 code: "CEN-01"
 *               - id: "uuid-nei-2"
 *                 name: "Barrio Norte"
 *                 code: "NOR-01"
 *       500:
 *         description: Error interno al obtener los sectores
 */
router.get('/neighborhoods', mapController.getNeighborhoods);

module.exports = router;