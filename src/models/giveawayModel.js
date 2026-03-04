// src/models/giveawayModel.js
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

function generateReferralCode(length = 7) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin ambiguos (0,O,1,I)
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}

const GiveawayModel = {

    // ─── GIVEAWAY CONFIG ───────────────────────────────────────────────────────

    /**
     * Crea automáticamente la config del sorteo cuando se crea un formulario.
     * Llamado dentro de la transacción de FormModel.createWithVersion()
     */
    async createConfig(connection, formId) {
        const id = uuidv4();
        await connection.query(`
            INSERT INTO giveaway_configs
            (id, form_id, points_per_referral, is_active)
            VALUES (?, ?, 10, TRUE)
        `, [id, formId]);
        return id;
    },

    /**
     * Obtiene la config del sorteo de un formulario por form_id
     */
    async findConfigByFormId(formId) {
        const [rows] = await pool.query(
            'SELECT * FROM giveaway_configs WHERE form_id = ?',
            [formId]
        );
        return rows[0] || null;
    },

    // ─── REFERRAL PROFILES ─────────────────────────────────────────────────────

    /**
     * Obtiene el perfil de referido de un usuario.
     * Si no existe, lo crea (Lazy Loading) con un código único.
     */
    async getOrCreateReferralProfile(userId) {
        const [existing] = await pool.query(
            'SELECT * FROM user_referral_profiles WHERE user_id = ?',
            [userId]
        );
        if (existing.length > 0) return existing[0];

        // Generar código único (con reintentos por si hay colisión)
        let code;
        for (let attempt = 0; attempt < 5; attempt++) {
            const candidate = generateReferralCode();
            const [conflict] = await pool.query(
                'SELECT user_id FROM user_referral_profiles WHERE referral_code = ?',
                [candidate]
            );
            if (conflict.length === 0) { code = candidate; break; }
        }
        if (!code) throw new Error('No se pudo generar un código único de referido');

        await pool.query(`
            INSERT INTO user_referral_profiles (user_id, referral_code, total_accumulated_points)
            VALUES (?, ?, 0)
        `, [userId, code]);

        return { user_id: userId, referral_code: code, total_accumulated_points: 0 };
    },

    /**
     * Busca el user_id dueño de un referral_code.
     * Retorna null si el código no existe.
     */
    async findUserByReferralCode(referralCode) {
        const [rows] = await pool.query(
            'SELECT user_id FROM user_referral_profiles WHERE referral_code = ?',
            [referralCode]
        );
        return rows[0] ? rows[0].user_id : null;
    },

    // ─── SUBMISSION REFERRALS ──────────────────────────────────────────────────

    /**
     * Crea el registro de atribución cuando un anónimo envía un formulario
     * con código de referido. Se llama dentro de la transacción de submissions.
     */
    async createSubmissionReferral(connection, submissionId, referrerUserId) {
        const id = uuidv4();
        await connection.query(`
            INSERT INTO submission_referrals
            (id, submission_id, referrer_user_id, referred_user_id, is_processed, created_at)
            VALUES (?, ?, ?, NULL, FALSE, NOW())
        `, [id, submissionId, referrerUserId]);
        return id;
    },

    // ─── PROCESO DE CONCILIACIÓN (TRANSACCIÓN ACID) ────────────────────────────

    /**
     * Ejecuta la conciliación completa en una transacción ACID.
     * Llamado durante el registro de un nuevo usuario que tiene pending_submission_ids.
     *
     * @param {string} newUserId - ID del usuario recién registrado
     * @param {string} submissionId - ID del submission hecho como anónimo
     */
    async reconcileSubmission(newUserId, submissionId) {
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // PASO 1: Vincular el submission al nuevo usuario
            await connection.query(
                'UPDATE submissions SET user_id = ? WHERE id = ? AND user_id IS NULL',
                [newUserId, submissionId]
            );

            // PASO 2 y 3: Buscar la referencia pendiente y vincular el referido
            const [referrals] = await connection.query(`
                SELECT * FROM submission_referrals
                WHERE submission_id = ? AND is_processed = FALSE
                FOR UPDATE
            `, [submissionId]);

            // Si no hay referral pendiente, hacer commit y salir (submission sin código ref)
            if (referrals.length === 0) {
                await connection.commit();
                return { reconciled: false, reason: 'no_referral' };
            }

            const referral = referrals[0];

            // SEGURIDAD: Prevenir auto-referencia
            if (referral.referrer_user_id === newUserId) {
                await connection.rollback();
                return { reconciled: false, reason: 'self_referral' };
            }

            // Vincular el referred_user_id
            await connection.query(
                'UPDATE submission_referrals SET referred_user_id = ? WHERE id = ?',
                [newUserId, referral.id]
            );

            // PASO 4: Consultar las reglas del sorteo via JOIN
            const [rules] = await connection.query(`
                SELECT gc.id AS giveaway_id, gc.points_per_referral, gc.max_points_per_user, gc.is_active
                FROM submissions s
                JOIN form_versions fv ON s.form_version_id = fv.id
                JOIN giveaway_configs gc ON gc.form_id = fv.form_id
                WHERE s.id = ? AND gc.is_active = TRUE
            `, [submissionId]);

            if (rules.length === 0) {
                // El formulario no tiene sorteo activo: solo vinculamos, no damos puntos
                await connection.query(
                    'UPDATE submission_referrals SET is_processed = TRUE WHERE id = ?',
                    [referral.id]
                );
                await connection.commit();
                return { reconciled: true, points_awarded: 0, reason: 'no_active_giveaway' };
            }

            const { giveaway_id, points_per_referral, max_points_per_user } = rules[0];

            // Verificar límite máximo de puntos si está configurado
            if (max_points_per_user) {
                const [currentPoints] = await connection.query(
                    'SELECT total_accumulated_points FROM user_referral_profiles WHERE user_id = ?',
                    [referral.referrer_user_id]
                );
                const current = currentPoints[0] ? currentPoints[0].total_accumulated_points : 0;
                if (current >= max_points_per_user) {
                    await connection.query(
                        'UPDATE submission_referrals SET is_processed = TRUE WHERE id = ?',
                        [referral.id]
                    );
                    await connection.commit();
                    return { reconciled: true, points_awarded: 0, reason: 'max_points_reached' };
                }
            }

            // PASO 5: Escribir en el Ledger (registro inmutable)
            await connection.query(`
                INSERT INTO giveaway_points_ledger
                (user_id, giveaway_id, submission_referral_id, points_earned, created_at)
                VALUES (?, ?, ?, ?, NOW())
            `, [referral.referrer_user_id, giveaway_id, referral.id, points_per_referral]);

            // PASO 6: Actualizar el total global del referente
            await connection.query(`
                INSERT INTO user_referral_profiles (user_id, referral_code, total_accumulated_points)
                VALUES (?, '', ?)
                ON DUPLICATE KEY UPDATE
                    total_accumulated_points = total_accumulated_points + ?
            `, [referral.referrer_user_id, points_per_referral, points_per_referral]);

            // PASO 7: Sellar la operación (candado anti-fraude)
            await connection.query(
                'UPDATE submission_referrals SET is_processed = TRUE WHERE id = ?',
                [referral.id]
            );

            // PASO 8: Commit
            await connection.commit();
            return { reconciled: true, points_awarded: points_per_referral };

        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }
    },

    // ─── LEADERBOARD ───────────────────────────────────────────────────────────

    /**
     * Ranking de los top 50 usuarios por puntos en un sorteo específico.
     * Se busca por form_id (que es la llave pública expuesta al frontend).
     */
    async getLeaderboard(formId, limit = 50) {
        const [rows] = await pool.query(`
            SELECT
                gpl.user_id,
                u.name,
                SUM(gpl.points_earned) AS total_points,
                COUNT(gpl.id) AS referrals_count
            FROM giveaway_points_ledger gpl
            JOIN giveaway_configs gc ON gpl.giveaway_id = gc.id
            JOIN users u ON gpl.user_id = u.id
            WHERE gc.form_id = ?
            GROUP BY gpl.user_id, u.name
            ORDER BY total_points DESC
            LIMIT ?
        `, [formId, limit]);
        return rows;
    }
};

module.exports = GiveawayModel;
