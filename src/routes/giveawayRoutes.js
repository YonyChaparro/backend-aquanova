// src/routes/giveawayRoutes.js
const express = require('express');
const router = express.Router();
const { getLeaderboard } = require('../controllers/giveawayController');

/**
 * @swagger
 * tags:
 *   name: Giveaways
 *   description: Sistema de referidos y sorteos por formulario
 */

/**
 * @swagger
 * /giveaways/{formId}/leaderboard:
 *   get:
 *     summary: Obtener ranking del sorteo de un formulario
 *     description: |
 *       Retorna el ranking de usuarios con más puntos acumulados en el sorteo
 *       asociado a un formulario. **Endpoint público**, no requiere autenticación,
 *       diseñado para mostrarse en la pantalla del formulario compartido.
 *
 *       Los puntos se generan cuando un usuario que llegó por un referido
 *       se registra en la plataforma y concilia sus submissions anónimos.
 *     tags: [Giveaways]
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del formulario cuyo sorteo se quiere consultar
 *         example: "49d3db06-2f08-4a32-9c38-c7bd1200d674"
 *       - in: query
 *         name: limit
 *         required: false
 *         schema:
 *           type: integer
 *           minimum: 1
 *           maximum: 100
 *           default: 50
 *         description: Máximo número de participantes a retornar (máx. 100)
 *         example: 10
 *     responses:
 *       200:
 *         description: Ranking del sorteo obtenido exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 count:
 *                   type: integer
 *                   description: Número de participantes en el ranking
 *                   example: 1
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       user_id:
 *                         type: string
 *                         format: uuid
 *                         description: ID del usuario referente
 *                       name:
 *                         type: string
 *                         description: Nombre del usuario referente
 *                         example: "Super Administrador"
 *                       total_points:
 *                         type: string
 *                         description: Total de puntos acumulados en este sorteo
 *                         example: "10"
 *                       referrals_count:
 *                         type: integer
 *                         description: Cantidad de referidos exitosos realizados
 *                         example: 1
 *       500:
 *         description: Error interno del servidor
 */
// GET /api/giveaways/:formId/leaderboard  (público)
router.get('/:formId/leaderboard', getLeaderboard);

module.exports = router;

