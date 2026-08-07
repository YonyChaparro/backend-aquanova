// src/routes/mapBuilderRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const verifyToken = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/roleMiddleware');
const mapBuilderController = require('../controllers/mapBuilderController');

// Multer en memoria para SVG uploads
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 10 * 1024 * 1024 }, // 10 MB máximo para SVGs
    fileFilter: (req, file, cb) => {
        if (file.mimetype === 'image/svg+xml' || file.originalname.endsWith('.svg')) {
            cb(null, true);
        } else {
            cb(new Error('Solo se permiten archivos SVG.'), false);
        }
    }
});

// Todas las rutas requieren autenticación + rol admin (role_id = 1)

/**
 * @swagger
 * /map-builder/save:
 *   post:
 *     summary: Guardar mapa completo
 *     tags: [Map Builder]
 *     description: |
 *       Valida la geometría de todos los bloques y lotes, luego guarda el mapa completo
 *       en una transacción. Elimina el borrador si existe.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - neighborhoodId
 *               - viewBox
 *               - blocks
 *             properties:
 *               neighborhoodId:
 *                 type: string
 *                 format: uuid
 *               viewBox:
 *                 type: string
 *                 example: "0 0 1103 667"
 *               blocks:
 *                 type: array
 *                 items:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       nullable: true
 *                     code:
 *                       type: string
 *                     geom_path:
 *                       type: string
 *                     label_position:
 *                       type: object
 *                     lots:
 *                       type: array
 *                       items:
 *                         type: object
 *               deletedBlockIds:
 *                 type: array
 *                 items:
 *                   type: string
 *               deletedLotIds:
 *                 type: array
 *                 items:
 *                   type: string
 *     responses:
 *       200:
 *         description: Mapa guardado exitosamente
 *       400:
 *         description: Errores de validación
 *       500:
 *         description: Error interno
 */
router.post('/save', verifyToken, authorize([1]), mapBuilderController.saveMap);

/**
 * @swagger
 * /map-builder/validate:
 *   post:
 *     summary: Validar geometría sin guardar
 *     tags: [Map Builder]
 *     description: Ejecuta validaciones geométricas sobre los bloques y lotes sin persistir cambios.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - blocks
 *             properties:
 *               blocks:
 *                 type: array
 *                 items:
 *                   type: object
 *     responses:
 *       200:
 *         description: Resultado de validación
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
 *                     valid:
 *                       type: boolean
 *                     errors:
 *                       type: array
 *                       items:
 *                         type: string
 *       500:
 *         description: Error interno
 */
router.post('/validate', verifyToken, authorize([1]), mapBuilderController.validateMap);

/**
 * @swagger
 * /map-builder/import-svg:
 *   post:
 *     summary: Importar archivo SVG
 *     tags: [Map Builder]
 *     description: |
 *       Parsea un archivo SVG, extrae los paths cerrados como candidatos a lotes/bloques.
 *       Calcula área (Shoelace) y centroide para cada path.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               file:
 *                 type: string
 *                 format: binary
 *                 description: Archivo SVG del plano
 *     responses:
 *       200:
 *         description: SVG procesado exitosamente
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
 *                     totalPaths:
 *                       type: integer
 *                     closedPaths:
 *                       type: integer
 *                     openPaths:
 *                       type: integer
 *                     paths:
 *                       type: array
 *                       items:
 *                         type: object
 *                         properties:
 *                           index:
 *                             type: integer
 *                           id:
 *                             type: string
 *                             nullable: true
 *                           d:
 *                             type: string
 *                           isClosed:
 *                             type: boolean
 *                           vertexCount:
 *                             type: integer
 *                           area:
 *                             type: number
 *                           centroid:
 *                             type: object
 *       400:
 *         description: No se recibió archivo
 *       500:
 *         description: Error interno
 */
router.post('/import-svg', verifyToken, authorize([1]), upload.single('file'), mapBuilderController.importSvg);

/**
 * @swagger
 * /map-builder/draft:
 *   post:
 *     summary: Guardar borrador (auto-save)
 *     tags: [Map Builder]
 *     description: Guarda o actualiza el borrador del estado del canvas para un barrio.
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - neighborhoodId
 *               - canvasState
 *             properties:
 *               neighborhoodId:
 *                 type: string
 *                 format: uuid
 *               canvasState:
 *                 type: object
 *                 description: Estado completo del canvas (viewBox, blocks, lots, etc.)
 *     responses:
 *       200:
 *         description: Borrador guardado
 *       400:
 *         description: Datos requeridos faltantes
 *       500:
 *         description: Error interno
 */
router.post('/draft', verifyToken, authorize([1]), mapBuilderController.saveDraft);

/**
 * @swagger
 * /map-builder/draft/{neighborhoodId}:
 *   get:
 *     summary: Recuperar borrador
 *     tags: [Map Builder]
 *     description: Obtiene el borrador guardado para un barrio específico.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: neighborhoodId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Borrador encontrado
 *       404:
 *         description: No hay borrador para este barrio
 *       500:
 *         description: Error interno
 */
router.get('/draft/:neighborhoodId', verifyToken, authorize([1]), mapBuilderController.getDraft);

/**
 * @swagger
 * /map-builder/draft/{neighborhoodId}:
 *   delete:
 *     summary: Eliminar borrador
 *     tags: [Map Builder]
 *     description: Elimina el borrador de un barrio.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: neighborhoodId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Borrador eliminado
 *       404:
 *         description: No se encontró borrador
 *       500:
 *         description: Error interno
 */
router.delete('/draft/:neighborhoodId', verifyToken, authorize([1]), mapBuilderController.deleteDraft);

/**
 * @swagger
 * /map-builder/{neighborhoodId}:
 *   get:
 *     summary: Cargar mapa existente para edición
 *     tags: [Map Builder]
 *     description: Retorna todos los bloques y lotes de un barrio con la información completa para el editor.
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - name: neighborhoodId
 *         in: path
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Mapa cargado exitosamente
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
 *         description: Error interno
 */
router.get('/:neighborhoodId', verifyToken, authorize([1]), mapBuilderController.loadMap);

module.exports = router;
