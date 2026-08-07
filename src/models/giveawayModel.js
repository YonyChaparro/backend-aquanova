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
     * Resuelve el slug (forms.key) de un formulario por su UUID.
     * Usado para construir URLs de referido válidas.
     */
    async resolveFormKey(formId) {
        const [[row]] = await pool.query(
            'SELECT f.`key`, f.title, f.is_active FROM forms f WHERE f.id = ?',
            [formId]
        );
        return row || null;
    },

    /**
     * Obtiene todas las campañas activas con los puntos del usuario en cada una.
     * Incluye campañas donde el usuario no ha participado (DA-5: todas las activas).
     */
    async getCampaignsForUser(userId) {
        const [rows] = await pool.query(`
            SELECT
                f.id                                   AS form_id,
                f.\`key\`                              AS form_key,
                f.title                                AS form_title,
                gc.is_active,
                gc.points_per_referral,
                COALESCE(mine.points, 0)               AS points_in_campaign,
                COALESCE(mine.referrals, 0)            AS referrals_in_campaign,
                COALESCE(mine.referrals, 0)            AS successful_in_campaign
            FROM giveaway_configs gc
            JOIN forms f ON gc.form_id = f.id
            LEFT JOIN (
                SELECT giveaway_id,
                       SUM(points_earned) AS points,
                       COUNT(id)          AS referrals
                FROM giveaway_points_ledger
                WHERE user_id = ?
                GROUP BY giveaway_id
            ) mine ON mine.giveaway_id = gc.id
            WHERE gc.is_active = TRUE AND f.is_active = TRUE
            ORDER BY f.created_at DESC
        `, [userId]);
        return rows;
    },

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

            // Verificar límite máximo de puntos POR CAMPAÑA si está configurado
            if (max_points_per_user) {
                const [[{ points_in_campaign }]] = await connection.query(`
                    SELECT COALESCE(SUM(points_earned), 0) AS points_in_campaign
                    FROM giveaway_points_ledger
                    WHERE user_id = ? AND giveaway_id = ?
                `, [referral.referrer_user_id, giveaway_id]);

                if (points_in_campaign >= max_points_per_user) {
                    await connection.query(
                        'UPDATE submission_referrals SET is_processed = TRUE WHERE id = ?',
                        [referral.id]
                    );
                    await connection.commit();
                    return { reconciled: true, points_awarded: 0, reason: 'max_points_reached_in_campaign' };
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
                ROW_NUMBER() OVER (ORDER BY SUM(gpl.points_earned) DESC) AS position,
                gpl.user_id,
                u.name,
                SUM(gpl.points_earned) AS total_points,
                COUNT(gpl.id)          AS referrals_count
            FROM giveaway_points_ledger gpl
            JOIN giveaway_configs gc ON gpl.giveaway_id = gc.id
            JOIN users u ON gpl.user_id = u.id
            WHERE gc.form_id = ?
            GROUP BY gpl.user_id, u.name
            ORDER BY total_points DESC
            LIMIT ?
        `, [formId, limit]);
        return rows;
    },

    /**
     * Ranking administrativo por campaña con columnas completas.
     * Desempate RN-06: puntos → convertidos → actividad más antigua → user_id.
     */
    async getCampaignRanking(formId, limit = 50) {
        const [rows] = await pool.query(`
            SELECT
                ROW_NUMBER() OVER (
                    ORDER BY SUM(gpl.points_earned) DESC,
                             COUNT(DISTINCT CASE WHEN sr.is_processed = 1 THEN sr.id END) DESC,
                             MAX(gpl.created_at) ASC,
                             u.id ASC
                )                                AS position,
                u.id                             AS user_id,
                u.name,
                urp.referral_code,
                SUM(gpl.points_earned)           AS total_points,
                COUNT(DISTINCT gpl.id)           AS total_referrals,
                COUNT(DISTINCT CASE WHEN sr.is_processed = 1 THEN sr.id END) AS successful_referrals,
                MAX(gpl.created_at)              AS last_activity
            FROM giveaway_points_ledger gpl
            JOIN giveaway_configs gc ON gpl.giveaway_id = gc.id
            JOIN users u             ON gpl.user_id     = u.id
            LEFT JOIN user_referral_profiles urp ON urp.user_id = u.id
            LEFT JOIN submission_referrals sr    ON sr.id = gpl.submission_referral_id
            WHERE gc.form_id = ?
            GROUP BY u.id, u.name, urp.referral_code
            ORDER BY total_points DESC, successful_referrals DESC, last_activity ASC, u.id ASC
            LIMIT ?
        `, [formId, limit]);
        return rows;
    },

    // ─── MÉTRICAS DEL SISTEMA DE REFERIDOS ─────────────────────────────────────

    /**
     * Resumen global del sistema de referidos (todos los sorteos y formularios).
     */
    async getOverviewStats() {
        const [[stats]] = await pool.query(`
            SELECT
                (SELECT COUNT(*)                       FROM submission_referrals)              AS total_referrals,
                (SELECT COUNT(*)                       FROM submission_referrals WHERE is_processed = 1) AS processed_referrals,
                (SELECT COUNT(*)                       FROM submission_referrals WHERE is_processed = 0) AS pending_referrals,
                (SELECT COALESCE(SUM(points_earned),0) FROM giveaway_points_ledger)            AS total_points_distributed,
                (SELECT COUNT(DISTINCT user_id)        FROM giveaway_points_ledger)            AS active_referrers,
                (SELECT COUNT(*)                       FROM user_referral_profiles)            AS users_with_profile,
                (SELECT COUNT(*)                       FROM giveaway_configs WHERE is_active = 1) AS active_giveaways,
                (SELECT COUNT(*)                       FROM giveaway_configs)                  AS campaigns_count,
                (SELECT COUNT(*)                       FROM submissions)                       AS total_submissions,
                (SELECT COUNT(DISTINCT submission_id)  FROM submission_referrals)              AS submissions_via_referral
        `);
        const totalRef = Number(stats.total_referrals);
        const totalSub = Number(stats.total_submissions);
        return {
            ...stats,
            conversion_rate: totalRef > 0
                ? Number(((Number(stats.processed_referrals) / totalRef) * 100).toFixed(1))
                : 0,
            referral_share: totalSub > 0
                ? Number(((Number(stats.submissions_via_referral) / totalSub) * 100).toFixed(1))
                : 0
        };
    },

    /**
     * Métricas desglosadas por formulario / sorteo.
     */
    async getStatsPerForm() {
        const [rows] = await pool.query(`
            SELECT
                f.id                            AS form_id,
                f.title                         AS form_title,
                gc.id                           AS giveaway_id,
                gc.points_per_referral,
                gc.max_points_per_user,
                gc.is_active,
                COALESCE(rs.total_referrals,     0) AS total_referrals,
                COALESCE(rs.processed_referrals, 0) AS processed_referrals,
                COALESCE(rs.pending_referrals,   0) AS pending_referrals,
                COALESCE(ps.total_points,        0) AS total_points_distributed,
                COALESCE(ps.unique_referrers,    0) AS active_referrers
            FROM giveaway_configs gc
            JOIN forms f ON gc.form_id = f.id
            LEFT JOIN (
                SELECT
                    fv.form_id,
                    COUNT(sr.id)             AS total_referrals,
                    SUM(sr.is_processed = 1) AS processed_referrals,
                    SUM(sr.is_processed = 0) AS pending_referrals
                FROM submission_referrals sr
                JOIN submissions s    ON sr.submission_id   = s.id
                JOIN form_versions fv ON s.form_version_id  = fv.id
                GROUP BY fv.form_id
            ) rs ON rs.form_id = gc.form_id
            LEFT JOIN (
                SELECT
                    giveaway_id,
                    SUM(points_earned)      AS total_points,
                    COUNT(DISTINCT user_id) AS unique_referrers
                FROM giveaway_points_ledger
                GROUP BY giveaway_id
            ) ps ON ps.giveaway_id = gc.id
            ORDER BY total_referrals DESC, f.title ASC
        `);
        return rows;
    },

    /**
     * Listado de campañas con stats completas incluyendo form_key y conversion_rate.
     * Orden RN-07: activas primero, por actividad, luego inactivas.
     */
    async getCampaignsWithStats() {
        const [rows] = await pool.query(`
            SELECT
                f.id                            AS form_id,
                f.\`key\`                       AS form_key,
                f.title                         AS form_title,
                gc.id                           AS giveaway_id,
                gc.points_per_referral,
                gc.max_points_per_user,
                gc.is_active,
                COALESCE(rs.total_referrals,     0) AS total_referrals,
                COALESCE(rs.processed_referrals, 0) AS processed_referrals,
                COALESCE(rs.pending_referrals,   0) AS pending_referrals,
                COALESCE(ps.total_points,        0) AS total_points_distributed,
                COALESCE(ps.unique_referrers,    0) AS active_referrers,
                ROUND(
                    COALESCE(rs.processed_referrals, 0) * 100.0
                    / NULLIF(COALESCE(rs.total_referrals, 0), 0),
                    1
                ) AS conversion_rate
            FROM giveaway_configs gc
            JOIN forms f ON gc.form_id = f.id
            LEFT JOIN (
                SELECT
                    fv.form_id,
                    COUNT(sr.id)             AS total_referrals,
                    SUM(sr.is_processed = 1) AS processed_referrals,
                    SUM(sr.is_processed = 0) AS pending_referrals
                FROM submission_referrals sr
                JOIN submissions s    ON sr.submission_id   = s.id
                JOIN form_versions fv ON s.form_version_id  = fv.id
                GROUP BY fv.form_id
            ) rs ON rs.form_id = gc.form_id
            LEFT JOIN (
                SELECT
                    giveaway_id,
                    SUM(points_earned)      AS total_points,
                    COUNT(DISTINCT user_id) AS unique_referrers
                FROM giveaway_points_ledger
                GROUP BY giveaway_id
            ) ps ON ps.giveaway_id = gc.id
            ORDER BY gc.is_active DESC, total_referrals DESC, f.title ASC
        `);
        return rows;
    },

    /**
     * Ranking global de referidores por puntos totales acumulados (todos los sorteos).
     */
    async getGlobalRanking(limit = 50) {
        const [rows] = await pool.query(`
            SELECT
                ROW_NUMBER() OVER (ORDER BY urp.total_accumulated_points DESC, u.name ASC) AS position,
                u.id                               AS user_id,
                u.name,
                urp.referral_code,
                urp.total_accumulated_points       AS total_points,
                COALESCE(COUNT(DISTINCT sr.id), 0)                                             AS total_referrals,
                COALESCE(COUNT(DISTINCT CASE WHEN sr.is_processed = 1 THEN sr.id END), 0)     AS successful_referrals,
                MAX(gpl.created_at)                AS last_activity
            FROM user_referral_profiles urp
            JOIN users u ON urp.user_id = u.id
            LEFT JOIN submission_referrals sr    ON sr.referrer_user_id = urp.user_id
            LEFT JOIN giveaway_points_ledger gpl ON gpl.user_id         = urp.user_id
            GROUP BY u.id, u.name, urp.referral_code, urp.total_accumulated_points
            ORDER BY total_points DESC, u.name ASC
            LIMIT ?
        `, [limit]);
        return rows;
    },

    /**
     * Últimos N eventos de referido con detalle de quién refirió a quién.
     * Si se pasa formId, filtra solo por esa campaña.
     */
    async getRecentActivity(limit = 30, formId = null) {
        const whereClause = formId ? 'WHERE f.id = ?' : '';
        const params = formId ? [formId, limit] : [limit];
        const [rows] = await pool.query(`
            SELECT
                sr.id                          AS referral_id,
                sr.created_at,
                sr.is_processed,
                u_ref.id                       AS referrer_id,
                u_ref.name                     AS referrer_name,
                urp.referral_code,
                u_referred.id                  AS referred_id,
                u_referred.name                AS referred_name,
                f.id                           AS form_id,
                f.title                        AS form_title,
                COALESCE(gpl.points_earned, 0) AS points_awarded
            FROM submission_referrals sr
            JOIN users u_ref ON sr.referrer_user_id = u_ref.id
            JOIN user_referral_profiles urp ON urp.user_id = u_ref.id
            LEFT JOIN users u_referred ON sr.referred_user_id = u_referred.id
            JOIN submissions s    ON sr.submission_id   = s.id
            JOIN form_versions fv ON s.form_version_id  = fv.id
            JOIN forms f          ON fv.form_id          = f.id
            LEFT JOIN giveaway_points_ledger gpl ON gpl.submission_referral_id = sr.id
            ${whereClause}
            ORDER BY sr.created_at DESC
            LIMIT ?
        `, params);
        return rows;
    },

    /**
     * Detalle completo de referidos de un usuario específico.
     * Retorna: perfil, desglose por sorteo y últimas 20 actividades.
     * Si se pasa formId, filtra by_giveaway y recent_referrals a esa campaña.
     */
    async getUserReferralDetail(userId, formId = null) {
        const [[profile]] = await pool.query(`
            SELECT
                u.id, u.name, u.email, u.phone,
                urp.referral_code,
                urp.total_accumulated_points,
                COALESCE(COUNT(DISTINCT sr.id), 0)                                             AS total_referrals,
                COALESCE(COUNT(DISTINCT CASE WHEN sr.is_processed = 1 THEN sr.id END), 0)     AS successful_referrals,
                COALESCE(COUNT(DISTINCT CASE WHEN sr.is_processed = 0 THEN sr.id END), 0)     AS pending_referrals,
                MAX(gpl.created_at)                                                            AS last_activity
            FROM users u
            JOIN user_referral_profiles urp ON urp.user_id = u.id
            LEFT JOIN submission_referrals sr    ON sr.referrer_user_id = u.id
            LEFT JOIN giveaway_points_ledger gpl ON gpl.user_id         = u.id
            WHERE u.id = ?
            GROUP BY u.id, u.name, u.email, u.phone, urp.referral_code, urp.total_accumulated_points
        `, [userId]);

        if (!profile) return null;

        // by_giveaway: filtrar por formId si se proporciona
        const byGiveawayWhere = formId ? 'AND gc.form_id = ?' : '';
        const byGiveawayParams = formId ? [userId, formId] : [userId];
        const [byGiveaway] = await pool.query(`
            SELECT
                f.id    AS form_id,
                f.title AS form_title,
                SUM(gpl.points_earned) AS points_earned,
                COUNT(gpl.id)          AS referrals_in_giveaway
            FROM giveaway_points_ledger gpl
            JOIN giveaway_configs gc ON gpl.giveaway_id = gc.id
            JOIN forms f             ON gc.form_id      = f.id
            WHERE gpl.user_id = ? ${byGiveawayWhere}
            GROUP BY f.id, f.title
            ORDER BY points_earned DESC
        `, byGiveawayParams);

        // recent_referrals: filtrar por formId si se proporciona (por f.id, no por título)
        const recentWhere = formId ? 'AND fv.form_id = ?' : '';
        const recentParams = formId ? [userId, formId] : [userId];
        const [recentReferrals] = await pool.query(`
            SELECT
                sr.id AS referral_id,
                sr.created_at,
                sr.is_processed,
                u_referred.name        AS referred_name,
                f.title                AS form_title,
                COALESCE(gpl.points_earned, 0) AS points_earned
            FROM submission_referrals sr
            LEFT JOIN users u_referred ON sr.referred_user_id = u_referred.id
            JOIN submissions s    ON sr.submission_id   = s.id
            JOIN form_versions fv ON s.form_version_id  = fv.id
            JOIN forms f          ON fv.form_id          = f.id
            LEFT JOIN giveaway_points_ledger gpl ON gpl.submission_referral_id = sr.id
            WHERE sr.referrer_user_id = ? ${recentWhere}
            ORDER BY sr.created_at DESC
            LIMIT 20
        `, recentParams);

        return { profile, by_giveaway: byGiveaway, recent_referrals: recentReferrals };
    },

    /**
     * Métricas detalladas de un formulario/sorteo específico, incluyendo
     * actividad diaria de los últimos 30 días y top del leaderboard.
     */
    async getFormMetrics(formId) {
        const [[config]] = await pool.query(`
            SELECT
                f.id    AS form_id,
                f.title AS form_title,
                f.\`key\` AS form_key,
                gc.id   AS giveaway_id,
                gc.points_per_referral,
                gc.max_points_per_user,
                gc.is_active,
                (
                    SELECT COUNT(*) FROM submissions s2
                    JOIN form_versions fv2 ON s2.form_version_id = fv2.id
                    WHERE fv2.form_id = f.id
                )                                AS total_submissions,
                COALESCE(rs.total_referrals,     0) AS total_referrals,
                COALESCE(rs.processed_referrals, 0) AS processed_referrals,
                COALESCE(rs.pending_referrals,   0) AS pending_referrals,
                COALESCE(ps.total_points,        0) AS total_points_distributed,
                COALESCE(ps.unique_referrers,    0) AS active_referrers
            FROM giveaway_configs gc
            JOIN forms f ON gc.form_id = f.id
            LEFT JOIN (
                SELECT
                    fv.form_id,
                    COUNT(sr.id)             AS total_referrals,
                    SUM(sr.is_processed = 1) AS processed_referrals,
                    SUM(sr.is_processed = 0) AS pending_referrals
                FROM submission_referrals sr
                JOIN submissions s    ON sr.submission_id   = s.id
                JOIN form_versions fv ON s.form_version_id  = fv.id
                GROUP BY fv.form_id
            ) rs ON rs.form_id = f.id
            LEFT JOIN (
                SELECT
                    giveaway_id,
                    SUM(points_earned)      AS total_points,
                    COUNT(DISTINCT user_id) AS unique_referrers
                FROM giveaway_points_ledger
                GROUP BY giveaway_id
            ) ps ON ps.giveaway_id = gc.id
            WHERE f.id = ?
        `, [formId]);

        if (!config) return null;

        const [timeline] = await pool.query(`
            SELECT
                DATE(sr.created_at)              AS date,
                COUNT(*)                         AS referrals_created,
                SUM(sr.is_processed = 1)         AS referrals_converted,
                COALESCE(SUM(gpl.points_earned), 0) AS points_awarded
            FROM submission_referrals sr
            JOIN submissions s    ON sr.submission_id   = s.id
            JOIN form_versions fv ON s.form_version_id  = fv.id
            LEFT JOIN giveaway_points_ledger gpl ON gpl.submission_referral_id = sr.id
            WHERE fv.form_id = ?
              AND sr.created_at >= DATE_SUB(NOW(), INTERVAL 30 DAY)
            GROUP BY DATE(sr.created_at)
            ORDER BY date ASC
        `, [formId]);

        const top10 = await this.getLeaderboard(formId, 10);

        const totalRef = Number(config.total_referrals);
        config.conversion_rate = totalRef > 0
            ? Number(((Number(config.processed_referrals) / totalRef) * 100).toFixed(1))
            : 0;

        return { config, timeline, top10 };
    }
};

module.exports = GiveawayModel;
