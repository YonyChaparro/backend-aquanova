const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/roleMiddleware');
const { createForm, getForms, getFormDetail } = require('../controllers/formController');

router.use(verifyToken);

/**
 * @swagger
 * /forms:
 *   get:
 *     summary: Listar todos los formularios
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de formularios disponibles con estado de activación y barrios relacionados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 forms:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       key:
 *                         type: string
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       is_active:
 *                         type: boolean
 *                         description: Indica si el formulario está activo o inactivo
 *                       created_by:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       neighborhoods:
 *                         type: array
 *                         description: Barrios donde está publicado el formulario
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             name:
 *                               type: string
 */
// Listar (Todos los roles)
router.get('/', getForms);

/**
 * @swagger
 * /forms/{id}:
 *   get:
 *     summary: Obtener detalle de un formulario
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del formulario
 *     responses:
 *       200:
 *         description: Detalle del formulario y su esquema
 *       404:
 *         description: Formulario no encontrado
 */
router.get('/:id', getFormDetail);

/**
 * @swagger
 * /forms:
 *   post:
 *     summary: Crear un nuevo formulario ligado a un barrio
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - schema
 *               - neighborhood_id
 *             properties:
 *               title:
 *                 type: string
 *                 description: Título del formulario
 *               description:
 *                 type: string
 *                 description: Descripción del formulario (opcional)
 *               neighborhood_id:
 *                 type: string
 *                 description: ID del barrio donde se publicará el formulario (requerido)
 *               schema:
 *                 type: array
 *                 description: Estructura JSON del formulario con las preguntas
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Formulario creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     key:
 *                       type: string
 *                     title:
 *                       type: string
 *                     neighborhood_id:
 *                       type: string
 *       400:
 *         description: Faltan datos requeridos o el barrio no existe
 *       404:
 *         description: El barrio especificado no existe
 */
// Crear (Solo Admin - Rol ID 1)
router.post('/', authorize([1]), createForm);

module.exports = router;