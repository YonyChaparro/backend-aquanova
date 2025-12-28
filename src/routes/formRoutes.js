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
 *         description: Lista de formularios disponibles
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
 *     summary: Crear un nuevo formulario
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
 *               - description
 *               - schema
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               schema:
 *                 type: object
 *                 description: Estructura JSON del formulario
 *     responses:
 *       201:
 *         description: Formulario creado exitosamente
 */
// Crear (Solo Admin - Rol ID 1)
router.post('/', authorize([1]), createForm);

module.exports = router;