// src/controllers/giveawayController.js
const GiveawayModel = require('../models/giveawayModel');
const QRCode = require('qrcode');

// ─── Helper: construye la URL de referido ──────────────────────────────────
// Usa FRONTEND_URL y REFERRAL_FORM_PATH del entorno.
// Si el frontend cambia su ruta de formulario, solo hay que ajustar la variable.

function buildReferralUrl(code, formKey = null) {
    const base = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
    const path = (process.env.REFERRAL_FORM_PATH || '/formulario').replace(/\/$/, '');
    // Sin formKey no hay link válido: la ruta pública exige el slug
    if (!formKey) return null;
    return `${base}${path}/${encodeURIComponent(formKey)}?ref=${encodeURIComponent(code)}`;
}

// ─── Perfil del usuario autenticado ────────────────────────────────────────

const getMyReferralProfile = async (req, res) => {
    try {
        const userId = req.user.uid;
        const profile = await GiveawayModel.getOrCreateReferralProfile(userId);
        const campaigns = await GiveawayModel.getCampaignsForUser(userId);

        const campaignsWithUrls = campaigns.map(c => ({
            form_id: c.form_id,
            form_key: c.form_key,
            form_title: c.form_title,
            is_active: Boolean(c.is_active),
            points_per_referral: Number(c.points_per_referral),
            points_in_campaign: Number(c.points_in_campaign),
            referrals_in_campaign: Number(c.referrals_in_campaign),
            successful_in_campaign: Number(c.successful_in_campaign),
            position: null, // posición por campaña omitida por rendimiento
            referral_url: buildReferralUrl(profile.referral_code, c.form_key)
        }));

        res.json({
            ok: true,
            data: {
                referral_code: profile.referral_code,
                total_accumulated_points: profile.total_accumulated_points,
                is_aggregate: true,
                campaigns: campaignsWithUrls,
                // Backward compat
                share_base_url: (process.env.FRONTEND_URL || '').replace(/\/$/, '')
                    + (process.env.REFERRAL_FORM_PATH || '/formulario')
            }
        });
    } catch (err) {
        console.error('Error obteniendo perfil de referido:', err);
        res.status(500).json({ ok: false, message: 'Error interno' });
    }
};

// ─── QR del link de referido ────────────────────────────────────────────────

const getReferralQR = async (req, res) => {
    try {
        const userId = req.user.uid;
        const { format = 'json', formId } = req.query;

        if (!formId) {
            return res.status(400).json({
                ok: false,
                message: 'Se requiere el parámetro formId para generar el QR de referido.'
            });
        }

        if (!process.env.FRONTEND_URL) {
            return res.status(503).json({
                ok: false,
                message: 'FRONTEND_URL no está configurada en el servidor. Define esta variable de entorno para generar QR de referido.'
            });
        }

        // Resolver el slug del formulario
        const formData = await GiveawayModel.resolveFormKey(formId);
        if (!formData || !formData.key) {
            return res.status(404).json({
                ok: false,
                message: 'Formulario no encontrado o sin slug publicado.'
            });
        }

        const profile = await GiveawayModel.getOrCreateReferralProfile(userId);
        const referralUrl = buildReferralUrl(profile.referral_code, formData.key);

        if (!referralUrl) {
            return res.status(400).json({
                ok: false,
                message: 'No se pudo construir el link de referido.'
            });
        }

        const qrOptions = {
            errorCorrectionLevel: 'M',
            margin: 2,
            color: {
                dark:  '#0c4a6e',
                light: '#ffffff'
            }
        };

        if (format === 'svg') {
            const svg = await QRCode.toString(referralUrl, { ...qrOptions, type: 'svg' });
            res.setHeader('Content-Type', 'image/svg+xml');
            res.setHeader('Content-Disposition',
                `inline; filename="qr-referido-${profile.referral_code}.svg"`);
            return res.send(svg);
        }

        if (format === 'png') {
            const buffer = await QRCode.toBuffer(referralUrl, {
                ...qrOptions,
                type: 'png',
                width: 512
            });
            res.setHeader('Content-Type', 'image/png');
            res.setHeader('Content-Disposition',
                `attachment; filename="qr-referido-${profile.referral_code}.png"`);
            return res.send(buffer);
        }

        // Default JSON: retorna SVG inline + data URL para uso directo en <img>
        const [svgString, dataUrl] = await Promise.all([
            QRCode.toString(referralUrl, { ...qrOptions, type: 'svg' }),
            QRCode.toDataURL(referralUrl, { ...qrOptions, width: 300 })
        ]);

        res.json({
            ok: true,
            data: {
                referral_code: profile.referral_code,
                referral_url: referralUrl,
                qr_svg: svgString,
                qr_data_url: dataUrl
            }
        });

    } catch (err) {
        console.error('Error generando QR de referido:', err);
        res.status(500).json({ ok: false, message: 'Error generando el código QR.' });
    }
};

// ─── Leaderboard público por formulario ────────────────────────────────────

const getLeaderboard = async (req, res) => {
    try {
        const { formId } = req.params;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const ranking = await GiveawayModel.getLeaderboard(formId, limit);
        res.json({ ok: true, count: ranking.length, data: ranking });
    } catch (err) {
        console.error('Error obteniendo leaderboard:', err);
        res.status(500).json({ ok: false, message: 'Error interno' });
    }
};

// ─── Ranking administrativo por campaña ────────────────────────────────────

const getCampaignRanking = async (req, res) => {
    try {
        const { formId } = req.params;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const data = await GiveawayModel.getCampaignRanking(formId, limit);
        res.json({ ok: true, count: data.length, data });
    } catch (err) {
        console.error('Error en campaign ranking:', err);
        res.status(500).json({ ok: false, message: 'Error interno' });
    }
};

// ─── Métricas del sistema de referidos (requieren auth) ────────────────────

/**
 * GET /api/giveaways/metrics/overview
 * Resumen global: totales, tasas de conversión y actividad.
 */
const getMetricsOverview = async (req, res) => {
    try {
        const stats = await GiveawayModel.getOverviewStats();
        res.json({ ok: true, data: { ...stats, is_aggregate: true } });
    } catch (err) {
        console.error('Error en metrics/overview:', err);
        res.status(500).json({ ok: false, message: 'Error interno' });
    }
};

/**
 * GET /api/giveaways/metrics/per-form
 * Estadísticas de referidos desglosadas por cada formulario/sorteo.
 */
const getMetricsPerForm = async (req, res) => {
    try {
        const data = await GiveawayModel.getStatsPerForm();
        res.json({ ok: true, count: data.length, data });
    } catch (err) {
        console.error('Error en metrics/per-form:', err);
        res.status(500).json({ ok: false, message: 'Error interno' });
    }
};

/**
 * GET /api/giveaways/campaigns
 * Listado de campañas con sorteo, stats completas, form_key y conversion_rate.
 */
const getCampaigns = async (req, res) => {
    try {
        const data = await GiveawayModel.getCampaignsWithStats();
        res.json({ ok: true, count: data.length, data });
    } catch (err) {
        console.error('Error en campaigns:', err);
        res.status(500).json({ ok: false, message: 'Error interno' });
    }
};

/**
 * GET /api/giveaways/metrics/ranking?limit=50
 * Ranking global de referidores por puntos totales acumulados (todos los sorteos).
 */
const getGlobalRanking = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);
        const data = await GiveawayModel.getGlobalRanking(limit);
        res.json({ ok: true, count: data.length, data });
    } catch (err) {
        console.error('Error en metrics/ranking:', err);
        res.status(500).json({ ok: false, message: 'Error interno' });
    }
};

/**
 * GET /api/giveaways/metrics/activity?limit=30
 * Feed de actividad reciente: últimos N eventos de referido con detalle.
 */
const getRecentActivity = async (req, res) => {
    try {
        const limit = Math.min(parseInt(req.query.limit) || 30, 100);
        const data = await GiveawayModel.getRecentActivity(limit);
        res.json({ ok: true, count: data.length, data });
    } catch (err) {
        console.error('Error en metrics/activity:', err);
        res.status(500).json({ ok: false, message: 'Error interno' });
    }
};

/**
 * GET /api/giveaways/:formId/activity?limit=30
 * Feed de actividad reciente filtrado por campaña.
 */
const getCampaignActivity = async (req, res) => {
    try {
        const { formId } = req.params;
        const limit = Math.min(parseInt(req.query.limit) || 30, 100);
        const data = await GiveawayModel.getRecentActivity(limit, formId);
        res.json({ ok: true, count: data.length, data });
    } catch (err) {
        console.error('Error en campaign activity:', err);
        res.status(500).json({ ok: false, message: 'Error interno' });
    }
};

/**
 * GET /api/giveaways/metrics/user/:userId
 * Detalle completo de un usuario: perfil, desglose por sorteo y actividad reciente.
 * Solo accesible por administradores.
 * Acepta ?formId= opcional para filtrar por campaña.
 */
const getUserReferralDetail = async (req, res) => {
    try {
        const { userId } = req.params;
        const { formId } = req.query;
        const data = await GiveawayModel.getUserReferralDetail(userId, formId || null);
        if (!data) {
            return res.status(404).json({ ok: false, message: 'Usuario no encontrado o sin perfil de referido.' });
        }
        res.json({ ok: true, data });
    } catch (err) {
        console.error('Error en metrics/user:', err);
        res.status(500).json({ ok: false, message: 'Error interno' });
    }
};

/**
 * GET /api/giveaways/:formId/metrics
 * Métricas detalladas de un sorteo específico: config, timeline 30 días y top 10.
 */
const getFormMetrics = async (req, res) => {
    try {
        const { formId } = req.params;
        const data = await GiveawayModel.getFormMetrics(formId);
        if (!data) {
            return res.status(404).json({ ok: false, message: 'Formulario o sorteo no encontrado.' });
        }
        res.json({ ok: true, data });
    } catch (err) {
        console.error('Error en formId/metrics:', err);
        res.status(500).json({ ok: false, message: 'Error interno' });
    }
};

module.exports = {
    getMyReferralProfile,
    getReferralQR,
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
};
