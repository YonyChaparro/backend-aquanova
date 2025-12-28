// src/routes/submissionRoutes.js
const express = require('express');
const router = express.Router();
const { createSubmission, getSubmissionsByForm } = require('../controllers/submissionController');
const verifyToken = require('../middlewares/authMiddleware');

router.use(verifyToken);

/**
 * @swagger
 * /submissions:
 *   post:
 *     summary: Enviar respuesta a un formulario
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - form_id
 *               - neighborhood_id
 *               - responses
 *             properties:
 *               form_id:
 *                 type: string
 *               neighborhood_id:
 *                 type: string
 *               responses:
 *                 type: object
 *                 description: Objeto con las respuestas del formulario
 *               location:
 *                 type: object
 *                 properties:
 *                   lat:
 *                     type: number
 *                   lng:
 *                     type: number
 *     responses:
 *       201:
 *         description: Respuestas guardadas exitosamente
 */
// POST /api/submissions
router.post('/', createSubmission);

/**
 * @swagger
 * /submissions/{formId}:
 *   get:
 *     summary: Obtener respuestas de un formulario
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del formulario
 *     responses:
 *       200:
 *         description: Lista de respuestas recibidas
 */
// GET /api/submissions/form/:formId
router.get('/:formId', getSubmissionsByForm);

module.exports = router;