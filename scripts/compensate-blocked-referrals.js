/**
 * Script de compensación para referidos bloqueados injustamente.
 *
 * El bug del tope global (R-1) causó que referidos legítimos se marcaran
 * como is_processed = TRUE sin generar asiento en el ledger, porque el
 * referente había alcanzado el tope de OTRA campaña.
 *
 * Este script:
 * 1. Identifica los submission_referrals afectados (processed, sin ledger, con referred_user_id)
 * 2. Para cada uno, verifica si el referente tiene margen en la campaña correspondiente
 * 3. Si es elegible, inserta el asiento en el ledger y actualiza total_accumulated_points
 *
 * Uso:
 *   node scripts/compensate-blocked-referrals.js              # modo dry-run (solo reporta)
 *   node scripts/compensate-blocked-referrals.js --execute    # ejecuta la compensación
 */

require('dotenv').config();
const pool = require('../src/config/db');

const EXECUTE_MODE = process.argv.includes('--execute');

async function findAffectedReferrals() {
    const [rows] = await pool.query(`
        SELECT
            sr.id                  AS referral_id,
            sr.referrer_user_id,
            sr.referred_user_id,
            sr.submission_id,
            sr.created_at,
            f.id                   AS form_id,
            f.title                AS form_title,
            gc.id                  AS giveaway_id,
            gc.points_per_referral,
            gc.max_points_per_user,
            gc.is_active           AS giveaway_active
        FROM submission_referrals sr
        JOIN submissions s         ON sr.submission_id   = s.id
        JOIN form_versions fv      ON s.form_version_id  = fv.id
        JOIN forms f               ON fv.form_id         = f.id
        LEFT JOIN giveaway_configs gc ON gc.form_id      = f.id
        LEFT JOIN giveaway_points_ledger gpl ON gpl.submission_referral_id = sr.id
        WHERE sr.is_processed = TRUE
          AND sr.referred_user_id IS NOT NULL
          AND gpl.id IS NULL
        ORDER BY sr.created_at ASC
    `);
    return rows;
}

async function getPointsInCampaign(connection, userId, giveawayId) {
    const [[{ points }]] = await connection.query(`
        SELECT COALESCE(SUM(points_earned), 0) AS points
        FROM giveaway_points_ledger
        WHERE user_id = ? AND giveaway_id = ?
    `, [userId, giveawayId]);
    return Number(points);
}

async function compensateReferral(referral) {
    const connection = await pool.getConnection();
    try {
        await connection.beginTransaction();

        // Verificar que no haya sido compensado ya (idempotencia)
        const [[existing]] = await connection.query(
            'SELECT id FROM giveaway_points_ledger WHERE submission_referral_id = ?',
            [referral.referral_id]
        );
        if (existing) {
            await connection.rollback();
            return { status: 'already_compensated', referral_id: referral.referral_id };
        }

        // Si no hay giveaway configurado, no se puede compensar
        if (!referral.giveaway_id) {
            await connection.rollback();
            return { status: 'no_giveaway', referral_id: referral.referral_id };
        }

        // Verificar tope POR CAMPAÑA
        const currentPoints = await getPointsInCampaign(
            connection,
            referral.referrer_user_id,
            referral.giveaway_id
        );

        if (referral.max_points_per_user && currentPoints >= referral.max_points_per_user) {
            await connection.rollback();
            return {
                status: 'at_campaign_limit',
                referral_id: referral.referral_id,
                current_points: currentPoints,
                max: referral.max_points_per_user
            };
        }

        const pointsToAward = referral.points_per_referral || 10;

        // Insertar en el ledger
        await connection.query(`
            INSERT INTO giveaway_points_ledger
            (user_id, giveaway_id, submission_referral_id, points_earned, created_at)
            VALUES (?, ?, ?, ?, NOW())
        `, [referral.referrer_user_id, referral.giveaway_id, referral.referral_id, pointsToAward]);

        // Actualizar total acumulado
        await connection.query(`
            UPDATE user_referral_profiles
            SET total_accumulated_points = total_accumulated_points + ?
            WHERE user_id = ?
        `, [pointsToAward, referral.referrer_user_id]);

        await connection.commit();
        return {
            status: 'compensated',
            referral_id: referral.referral_id,
            referrer_user_id: referral.referrer_user_id,
            form_title: referral.form_title,
            points_awarded: pointsToAward
        };
    } catch (err) {
        await connection.rollback();
        return {
            status: 'error',
            referral_id: referral.referral_id,
            error: err.message
        };
    } finally {
        connection.release();
    }
}

async function main() {
    console.log('╔══════════════════════════════════════════════════════════════╗');
    console.log('║  Script de compensación — Referidos bloqueados por tope global  ║');
    console.log(`║  Modo: ${EXECUTE_MODE ? '⚡ EJECUTAR' : '👁  DRY-RUN (solo reporta)'}                              ║`);
    console.log('╚══════════════════════════════════════════════════════════════╝\n');

    const affected = await findAffectedReferrals();

    console.log(`📊 Referidos afectados encontrados: ${affected.length}\n`);

    if (affected.length === 0) {
        console.log('✅ No hay referidos que compensar. El sistema está limpio.');
        process.exit(0);
    }

    // Reporte detallado
    console.log('┌──────────────────────────────────────────────────────────────┐');
    console.log('│  Detalle de referidos afectados                              │');
    console.log('├──────────────────────────────────────────────────────────────┤');
    for (const r of affected) {
        console.log(`│ ID: ${r.referral_id.substring(0, 8)}…`);
        console.log(`│   Referente: ${r.referrer_user_id.substring(0, 8)}…`);
        console.log(`│   Campaña: ${r.form_title} (${r.giveaway_active ? 'activa' : 'inactiva'})`);
        console.log(`│   Puntos/referido: ${r.points_per_referral || 'N/A'}`);
        console.log(`│   Tope campaña: ${r.max_points_per_user || 'Sin tope'}`);
        console.log(`│   Fecha: ${r.created_at}`);
        console.log('│');
    }
    console.log('└──────────────────────────────────────────────────────────────┘\n');

    if (!EXECUTE_MODE) {
        console.log('ℹ️  Modo DRY-RUN: no se realizaron cambios.');
        console.log('   Para ejecutar la compensación, use: node scripts/compensate-blocked-referrals.js --execute');
        process.exit(0);
    }

    // Ejecutar compensaciones
    console.log('⚡ Ejecutando compensaciones...\n');

    const results = {
        compensated: 0,
        at_campaign_limit: 0,
        no_giveaway: 0,
        already_compensated: 0,
        errors: 0
    };

    for (const referral of affected) {
        const result = await compensateReferral(referral);

        switch (result.status) {
            case 'compensated':
                results.compensated++;
                console.log(`  ✅ ${result.referral_id.substring(0, 8)}… → +${result.points_awarded} pts a ${result.referrer_user_id.substring(0, 8)}… (${result.form_title})`);
                break;
            case 'at_campaign_limit':
                results.at_campaign_limit++;
                console.log(`  ⏭  ${result.referral_id.substring(0, 8)}… → referente ya en tope de campaña (${result.current_points}/${result.max})`);
                break;
            case 'no_giveaway':
                results.no_giveaway++;
                console.log(`  ⚠️  ${result.referral_id.substring(0, 8)}… → sin sorteo configurado`);
                break;
            case 'already_compensated':
                results.already_compensated++;
                console.log(`  ↩️  ${result.referral_id.substring(0, 8)}… → ya compensado anteriormente`);
                break;
            case 'error':
                results.errors++;
                console.log(`  ❌ ${result.referral_id.substring(0, 8)}… → ERROR: ${result.error}`);
                break;
        }
    }

    console.log('\n╔══════════════════════════════════════════════════╗');
    console.log('║  Resumen de compensación                         ║');
    console.log('╠══════════════════════════════════════════════════╣');
    console.log(`║  Compensados:         ${results.compensated}`);
    console.log(`║  En tope de campaña:  ${results.at_campaign_limit}`);
    console.log(`║  Sin sorteo:          ${results.no_giveaway}`);
    console.log(`║  Ya compensados:      ${results.already_compensated}`);
    console.log(`║  Errores:             ${results.errors}`);
    console.log('╚══════════════════════════════════════════════════╝');

    process.exit(results.errors > 0 ? 1 : 0);
}

main().catch(err => {
    console.error('❌ Error fatal:', err);
    process.exit(1);
});
