// src/routes/giveawayRoutes.js
const express = require('express');
const router = express.Router();
const {
    getLeaderboard,
    getCampaignRanking,
    getCampaignActivity,
    getCampaigns,
    getMetricsOverview,
    getMetricsPerForm,
    getGlobalRanking,
    getRecentActivity,
    getUserReferralDetail,
    getFormMetrics
} = require('../controllers/giveawayController');
const verifyToken = require('../middlewares/authMiddleware');
const authorize   = require('../middlewares/roleMiddleware');

// Roles: 1 = administrador, 2 = operador
const adminOrOp = authorize([1, 2]);
const adminOnly = authorize([1]);

/**
 * @swagger
 * tags:
 *   name: Giveaways
 *   description: Sistema de referidos, sorteos y métricas de recolección
 */

// ──────────────────────────────────────────────────────────────────────────────
//  IMPORTANTE: Orden de rutas
//  1. /metrics/* — literales, deben ir primero
//  2. /campaigns — literal, antes de /:formId
//  3. /:formId/* — paramétricos, al final
//  Esto evita que Express interprete "metrics" o "campaigns" como un formId.
// ──────────────────────────────────────────────────────────────────────────────

// ═══════════════════════════════════════════════════════════════════════════════
//  MÉTRICAS GLOBALES (requieren auth + adminOrOp)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /giveaways/metrics/overview:
 *   get:
 *     summary: Resumen global del sistema de referidos
 *     description: |
 *       Devuelve los KPIs principales del sistema de referidos en todos los sorteos:
 *       totales, tasas de conversión y participación.
 *       Incluye `is_aggregate: true` y `campaigns_count` para indicar que es dato agregado.
 *       Requiere rol **administrador** u **operador**.
 *     tags: [Giveaways]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Estadísticas globales
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
 *                     total_referrals:
 *                       type: integer
 *                     processed_referrals:
 *                       type: integer
 *                     pending_referrals:
 *                       type: integer
 *                     total_points_distributed:
 *                       type: number
 *                     active_referrers:
 *                       type: integer
 *                     users_with_profile:
 *                       type: integer
 *                     active_giveaways:
 *                       type: integer
 *                     campaigns_count:
 *                       type: integer
 *                       description: Total de campañas (activas + inactivas) sumadas en este agregado
 *                     total_submissions:
 *                       type: integer
 *                     submissions_via_referral:
 *                       type: integer
 *                     conversion_rate:
 *                       type: number
 *                       example: 66.7
 *                     referral_share:
 *                       type: number
 *                       example: 42.1
 *                     is_aggregate:
 *                       type: boolean
 *                       example: true
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: Requiere rol administrador u operador
 */
router.get('/metrics/overview', verifyToken, adminOrOp, getMetricsOverview);

/**
 * @swagger
 * /giveaways/metrics/per-form:
 *   get:
 *     summary: Métricas de referidos desglosadas por formulario
 *     description: |
 *       Lista todos los formularios con sorteo configurado y sus estadísticas
 *       de referidos: totales, procesados, pendientes y puntos distribuidos.
 *     tags: [Giveaways]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Métricas por formulario
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: Requiere rol administrador u operador
 */
router.get('/metrics/per-form', verifyToken, adminOrOp, getMetricsPerForm);

/**
 * @swagger
 * /giveaways/metrics/ranking:
 *   get:
 *     summary: Ranking global de referidores (todos los sorteos)
 *     description: |
 *       Devuelve el ranking de usuarios ordenado por puntos totales acumulados
 *       en **todos** los sorteos.
 *     tags: [Giveaways]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Ranking global
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: Requiere rol administrador u operador
 */
router.get('/metrics/ranking', verifyToken, adminOrOp, getGlobalRanking);

/**
 * @swagger
 * /giveaways/metrics/activity:
 *   get:
 *     summary: Feed de actividad reciente de referidos (global)
 *     description: |
 *       Lista los últimos N eventos de referido en orden cronológico descendente.
 *       Muestra quién refirió a quién, en qué formulario, si se procesó y cuántos
 *       puntos se otorgaron.
 *     tags: [Giveaways]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Actividad reciente
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: Requiere rol administrador u operador
 */
router.get('/metrics/activity', verifyToken, adminOrOp, getRecentActivity);

/**
 * @swagger
 * /giveaways/metrics/user/{userId}:
 *   get:
 *     summary: Detalle de referidos de un usuario específico
 *     description: |
 *       Retorna el perfil completo de referido de un usuario: estadísticas globales,
 *       desglose de puntos por sorteo y las últimas 20 actividades.
 *       Acepta `?formId=` opcional para filtrar por campaña.
 *       Solo accesible por **administradores**.
 *     tags: [Giveaways]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: userId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: formId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: Si se proporciona, filtra by_giveaway y recent_referrals a esa campaña
 *     responses:
 *       200:
 *         description: Detalle de referidos del usuario
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: Solo administradores
 *       404:
 *         description: Usuario no encontrado o sin perfil de referido
 */
router.get('/metrics/user/:userId', verifyToken, adminOnly, getUserReferralDetail);

// ═══════════════════════════════════════════════════════════════════════════════
//  CAMPAÑAS — listado (requiere auth + adminOrOp)
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /giveaways/campaigns:
 *   get:
 *     summary: Listado de campañas con sorteo y estadísticas
 *     description: |
 *       Devuelve todas las campañas (formularios con sorteo) con sus stats completas,
 *       incluyendo `form_key` (slug) y `conversion_rate` calculado.
 *       Orden RN-07: activas primero, luego por total_referrals DESC, título ASC.
 *       Incluye campañas activas e inactivas.
 *     tags: [Giveaways]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Listado de campañas
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       form_id:
 *                         type: string
 *                         format: uuid
 *                       form_key:
 *                         type: string
 *                         example: "censo-las-mercedes-2026"
 *                       form_title:
 *                         type: string
 *                       is_active:
 *                         type: boolean
 *                       points_per_referral:
 *                         type: integer
 *                       max_points_per_user:
 *                         type: integer
 *                         nullable: true
 *                       total_referrals:
 *                         type: integer
 *                       processed_referrals:
 *                         type: integer
 *                       pending_referrals:
 *                         type: integer
 *                       total_points_distributed:
 *                         type: number
 *                       active_referrers:
 *                         type: integer
 *                       conversion_rate:
 *                         type: number
 *                         nullable: true
 *                         example: 75.0
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: Requiere rol administrador u operador
 */
router.get('/campaigns', verifyToken, adminOrOp, getCampaigns);

// ═══════════════════════════════════════════════════════════════════════════════
//  POR CAMPAÑA — rutas paramétricasCON /:formId
// ═══════════════════════════════════════════════════════════════════════════════

/**
 * @swagger
 * /giveaways/{formId}/ranking:
 *   get:
 *     summary: Ranking administrativo de una campaña
 *     description: |
 *       Ranking completo por campaña con columnas extendidas (referral_code,
 *       successful_referrals, last_activity). Desempate RN-06: puntos → convertidos
 *       → actividad más antigua → user_id.
 *       Requiere rol **administrador** u **operador**.
 *     tags: [Giveaways]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Ranking de la campaña (vacío si no hay actividad, nunca 404)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 count:
 *                   type: integer
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       position:
 *                         type: integer
 *                       user_id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       referral_code:
 *                         type: string
 *                       total_points:
 *                         type: number
 *                       total_referrals:
 *                         type: integer
 *                       successful_referrals:
 *                         type: integer
 *                       last_activity:
 *                         type: string
 *                         format: date-time
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: Requiere rol administrador u operador
 */
router.get('/:formId/ranking', verifyToken, adminOrOp, getCampaignRanking);

/**
 * @swagger
 * /giveaways/{formId}/activity:
 *   get:
 *     summary: Feed de actividad reciente filtrado por campaña
 *     description: |
 *       Lista los últimos N eventos de referido de una campaña específica.
 *       Mismo formato que `/metrics/activity` pero acotado a un formulario.
 *       Campaña sin actividad responde 200 con data vacía.
 *     tags: [Giveaways]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 30
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Actividad de la campaña
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: Requiere rol administrador u operador
 */
router.get('/:formId/activity', verifyToken, adminOrOp, getCampaignActivity);

/**
 * @swagger
 * /giveaways/{formId}/metrics:
 *   get:
 *     summary: Métricas detalladas de un sorteo específico
 *     description: |
 *       Devuelve la configuración del sorteo, estadísticas de referidos, timeline
 *       de actividad de los últimos 30 días (día a día) y el top 10 del leaderboard.
 *     tags: [Giveaways]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Métricas del sorteo
 *       401:
 *         description: Token no proporcionado o inválido
 *       403:
 *         description: Requiere rol administrador u operador
 *       404:
 *         description: Formulario o sorteo no encontrado
 */
router.get('/:formId/metrics', verifyToken, adminOrOp, getFormMetrics);

/**
 * @swagger
 * /giveaways/{formId}/leaderboard:
 *   get:
 *     summary: Ranking público del sorteo de un formulario
 *     description: |
 *       Retorna el ranking de usuarios con más puntos en el sorteo de un formulario.
 *       **Endpoint público**, sin autenticación — diseñado para mostrarse en la
 *       pantalla del formulario compartido.
 *     tags: [Giveaways]
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *       - in: query
 *         name: limit
 *         schema:
 *           type: integer
 *           default: 50
 *           maximum: 100
 *     responses:
 *       200:
 *         description: Ranking del sorteo
 *       500:
 *         description: Error interno del servidor
 */
router.get('/:formId/leaderboard', getLeaderboard);

module.exports = router;
