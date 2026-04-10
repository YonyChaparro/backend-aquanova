// src/controllers/giveawayController.js
const GiveawayModel = require('../models/giveawayModel');

/**
 * GET /api/users/me/referral-profile
 * Obtiene (o crea) el perfil de referido del usuario autenticado.
 */
const getMyReferralProfile = async (req, res) => {
    try {
        const userId = req.user.uid;
        const profile = await GiveawayModel.getOrCreateReferralProfile(userId);

        res.json({
            ok: true,
            data: {
                referral_code: profile.referral_code,
                total_accumulated_points: profile.total_accumulated_points,
                share_base_url: `${(process.env.FRONTEND_URL || '').replace(/\/$/, '')}/formulario`
            }
        });
    } catch (error) {
        console.error('Error obteniendo perfil de referido:', error);
        res.status(500).json({ ok: false, message: 'Error interno' });
    }
};

/**
 * GET /api/giveaways/:formId/leaderboard
 * Retorna el top 50 del ranking de un sorteo.
 * Es público (no requiere auth) para que se pueda mostrar en formularios.
 */
const getLeaderboard = async (req, res) => {
    try {
        const { formId } = req.params;
        const limit = Math.min(parseInt(req.query.limit) || 50, 100);

        const ranking = await GiveawayModel.getLeaderboard(formId, limit);

        res.json({
            ok: true,
            count: ranking.length,
            data: ranking
        });
    } catch (error) {
        console.error('Error obteniendo leaderboard:', error);
        res.status(500).json({ ok: false, message: 'Error interno' });
    }
};

module.exports = { getMyReferralProfile, getLeaderboard };
