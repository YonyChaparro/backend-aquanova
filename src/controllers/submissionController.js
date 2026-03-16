// src/controllers/submissionController.js
const SubmissionModel = require('../models/submissionModel');
const FormModel = require('../models/formModel');
const GiveawayModel = require('../models/giveawayModel');
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const createSubmission = async (req, res) => {
    try {
        const { form_id, neighborhood_id, responses, location, referral_code } = req.body;

        // user_id puede ser null si el usuario es anónimo
        const userId = req.user ? req.user.uid : null;

        // 1. Validar datos mínimos
        if (!form_id || !neighborhood_id || !responses) {
            return res.status(400).json({
                ok: false,
                message: 'Faltan datos: form_id, neighborhood_id o responses'
            });
        }

        // 2. Obtener la versión activa del formulario
        const versionData = await FormModel.findLatestVersionSchema(form_id);
        if (!versionData) {
            return res.status(404).json({
                ok: false,
                message: 'El formulario no tiene versiones activas.'
            });
        }

        const submissionId = uuidv4();

        // 3. Si hay referral_code, validar que el referente existe
        let referrerUserId = null;
        if (referral_code) {
            referrerUserId = await GiveawayModel.findUserByReferralCode(referral_code);
            // Si el código no existe, se ignora silenciosamente (no se bloquea el envío)
        }

        // 4. Abrir transacción para crear submission + referral atómicamente
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            await connection.query(`
                INSERT INTO submissions
                (id, form_version_id, user_id, neighborhood_id, responses, location_lat, location_lng, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
                submissionId,
                versionData.id,
                userId,
                neighborhood_id,
                JSON.stringify(responses),
                location ? location.lat : null,
                location ? location.lng : null
            ]);

            if (referrerUserId) {
                await GiveawayModel.createSubmissionReferral(connection, submissionId, referrerUserId);
            }

            await connection.commit();
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }

        res.status(201).json({
            ok: true,
            message: 'Respuestas guardadas exitosamente',
            submissionId,
            requires_registration: userId === null
        });

    } catch (error) {
        console.error('Error guardando respuestas:', error);
        res.status(500).json({ ok: false, message: 'Error interno al guardar respuestas' });
    }
};

// NUEVO: Listar respuestas
const getSubmissionsByForm = async (req, res) => {
    try {
        const { formId } = req.params;
        
        const submissions = await SubmissionModel.findByFormId(formId);
        
        res.json({
            ok: true,
            count: submissions.length,
            data: submissions
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: 'Error obteniendo respuestas' });
    }
};

// ONBOARDING: llenar formulario + registrar usuario en un solo paso (endpoint público)
const createOnboarding = async (req, res) => {
    try {
        const {
            form_key, neighborhood_id, responses,
            referral_code,
            name, document_number, password, email, phone,
            location
        } = req.body;

        // 1. Validar campos requeridos (password es opcional — campo NULL en la BD)
        if (!form_key || !neighborhood_id || !responses || !name || !document_number) {
            return res.status(400).json({
                ok: false,
                message: 'Faltan datos requeridos: form_key, neighborhood_id, responses, name y document_number son obligatorios'
            });
        }

        // 2. Buscar formulario por key
        const form = await FormModel.findByKey(form_key);
        if (!form) {
            return res.status(404).json({ ok: false, message: 'Formulario no encontrado o inactivo' });
        }

        // 3. Obtener versión activa del formulario
        const versionData = await FormModel.findLatestVersionSchema(form.id);
        if (!versionData) {
            return res.status(404).json({ ok: false, message: 'El formulario no tiene versiones activas' });
        }

        // 4. Hashear contraseña si fue proporcionada (password_hash es NULL en la BD)
        let passwordHash = null;
        if (password) {
            const salt = await bcrypt.genSalt(10);
            passwordHash = await bcrypt.hash(password, salt);
        }

        // 5. Validar referral_code si fue enviado
        let referrerUserId = null;
        if (referral_code) {
            referrerUserId = await GiveawayModel.findUserByReferralCode(referral_code);
            // Código inválido → se ignora silenciosamente, no bloquea el registro
        }

        // 6. Generar IDs
        const newUserId = uuidv4();
        const submissionId = uuidv4();

        // 7. Transacción atómica: usuario + submission + atribución de referido
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // a. Crear usuario (rol 3 = "usuario")
            await connection.query(`
                INSERT INTO users (id, name, document_number, email, phone, password_hash, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, NOW())
            `, [newUserId, name, document_number, email || null, phone || null, passwordHash]);

            await connection.query(
                'INSERT INTO user_roles (user_id, role_id, neighborhood_id) VALUES (?, 3, ?)',
                [newUserId, neighborhood_id || null]
            );

            // b. Crear submission ligado al nuevo usuario
            await connection.query(`
                INSERT INTO submissions (id, form_version_id, user_id, neighborhood_id, responses, location_lat, location_lng, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
                submissionId,
                versionData.id,
                newUserId,
                neighborhood_id,
                JSON.stringify(responses),
                location ? location.lat : null,
                location ? location.lng : null
            ]);

            // c. Atribuir referido si el código era válido
            if (referrerUserId) {
                await GiveawayModel.createSubmissionReferral(connection, submissionId, referrerUserId);
            }

            await connection.commit();
        } catch (err) {
            await connection.rollback();
            throw err;
        } finally {
            connection.release();
        }

        // 8. Post-commit: reconciliar puntos del referente (puede fallar sin romper el registro)
        let reconciliation = null;
        if (referrerUserId) {
            try {
                reconciliation = await GiveawayModel.reconcileSubmission(newUserId, submissionId);
            } catch (e) {
                console.warn('⚠️  Error reconciliando referido en onboarding:', e.message);
            }
        }

        // 9. Crear perfil de referido del nuevo usuario (genera su propio código)
        const referralProfile = await GiveawayModel.getOrCreateReferralProfile(newUserId);

        // 10. Construir share_link personalizado del nuevo usuario
        const baseFrontend = (process.env.FRONTEND_URL || 'http://localhost:5173').replace(/\/$/, '');
        const shareLink = `${baseFrontend}/formulario/${form.key}?ref=${referralProfile.referral_code}`;

        // 11. Firmar JWT
        const token = jwt.sign(
            { uid: newUserId, role: 3, role_name: 'usuario' },
            process.env.JWT_SECRET,
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        res.status(201).json({
            ok: true,
            message: 'Registro y envío de formulario exitosos',
            token,
            user: {
                id: newUserId,
                name,
                document_number,
                email: email || null,
                role: 'usuario'
            },
            submissionId,
            referral_code: referralProfile.referral_code,
            share_link: shareLink,
            reconciliation
        });

    } catch (error) {
        console.error('Error en onboarding:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(409).json({
                ok: false,
                message: 'Ya existe un usuario con ese número de documento o correo electrónico'
            });
        }
        res.status(500).json({ ok: false, message: 'Error interno en el proceso de registro' });
    }
};

module.exports = { createSubmission, getSubmissionsByForm, createOnboarding };