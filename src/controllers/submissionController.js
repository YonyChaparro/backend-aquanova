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
        const bodyObj = req.body || {};
        const { form_id, neighborhood_id, responses, location, referral_code, attachments = [], lot_id } = bodyObj;

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

        // 4. Abrir transacción para crear submission + referral + actualizar lote atómicamente
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 4a. Si hay lot_id, validar que existe y está disponible
            if (lot_id) {
                const [lots] = await connection.query(
                    'SELECT id, status FROM lots WHERE id = ? FOR UPDATE',
                    [lot_id]
                );
                if (lots.length === 0) {
                    await connection.rollback();
                    connection.release();
                    return res.status(400).json({ ok: false, message: 'El lote seleccionado no existe.' });
                }
                if (lots[0].status !== 'sin_informacion') {
                    await connection.rollback();
                    connection.release();
                    return res.status(400).json({ ok: false, message: 'El lote seleccionado ya ha sido censado.' });
                }
            }

            await connection.query(`
                INSERT INTO submissions
                (id, form_version_id, user_id, neighborhood_id, lot_id, responses, location_lat, location_lng, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
                submissionId,
                versionData.id,
                userId,
                neighborhood_id,
                lot_id || null,
                JSON.stringify(responses),
                location ? location.lat : null,
                location ? location.lng : null
            ]);

            // 4b. Actualizar el lote a 'censado' si se vinculó
            if (lot_id) {
                // Si la metadata viene con la respuesta exacta de estado, actualizamos
                let propertyState = null;
                if (responses) {
                    // Extraer de las respuestas, la llave podría llamarse de muchas maneras según tu frontend
                    // Verificamos posibles nombres: 'property_state', 'estado_predio', 'estadoPredio'
                    propertyState = responses['property_state'] || responses['estado_predio'] || responses['estadoPredio'] || null;
                }

                const updateQuery = propertyState 
                    ? 'UPDATE lots SET status = ?, property_state = ? WHERE id = ?'
                    : 'UPDATE lots SET status = ? WHERE id = ?';
                const updateParams = propertyState 
                    ? ['censado', propertyState, lot_id]
                    : ['censado', lot_id];

                await connection.query(updateQuery, updateParams);
            }

            // Guardar archivos multimedia (Cloudinary links) si se enviaron
            if (Array.isArray(attachments) && attachments.length > 0) {
                for (const att of attachments) {
                    if (att.field_key && Array.isArray(att.media_urls)) {
                        await connection.query(`
                            INSERT INTO attachments (id, submission_id, field_key, media_urls)
                            VALUES (?, ?, ?, ?)
                        `, [uuidv4(), submissionId, att.field_key, JSON.stringify(att.media_urls)]);
                    }
                }
            }

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
            requires_registration: userId === null,
            lot_updated: lot_id ? true : false
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
        const bodyObj = req.body || {};
        const {
            form_key, neighborhood_id, responses,
            referral_code, attachments = [],
            name, document_number, password, email, phone,
            location, lot_id
        } = bodyObj;

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

        // 7. Transacción atómica: usuario + submission + atribución de referido + actualizar lote
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // 7a. Si hay lot_id, validar que existe y está disponible
            if (lot_id) {
                const [lots] = await connection.query(
                    'SELECT id, status FROM lots WHERE id = ? FOR UPDATE',
                    [lot_id]
                );
                if (lots.length === 0) {
                    await connection.rollback();
                    connection.release();
                    return res.status(400).json({ ok: false, message: 'El lote seleccionado no existe.' });
                }
                if (lots[0].status !== 'sin_informacion') {
                    await connection.rollback();
                    connection.release();
                    return res.status(400).json({ ok: false, message: 'El lote seleccionado ya ha sido censado.' });
                }
            }

            // a. Crear usuario (rol 3 = "usuario")
            await connection.query(`
                INSERT INTO users (id, name, document_number, email, phone, password_hash, is_active, created_at)
                VALUES (?, ?, ?, ?, ?, ?, 1, NOW())
            `, [newUserId, name, document_number, email || null, phone || null, passwordHash]);

            await connection.query(
                'INSERT INTO user_roles (user_id, role_id, neighborhood_id) VALUES (?, 3, ?)',
                [newUserId, neighborhood_id || null]
            );

            // b. Crear submission ligado al nuevo usuario (con lot_id si aplica)
            await connection.query(`
                INSERT INTO submissions (id, form_version_id, user_id, neighborhood_id, lot_id, responses, location_lat, location_lng, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
                submissionId,
                versionData.id,
                newUserId,
                neighborhood_id,
                lot_id || null,
                JSON.stringify(responses),
                location ? location.lat : null,
                location ? location.lng : null
            ]);

            // 7b. Actualizar el lote a 'censado' si se vinculó
            if (lot_id) {
                await connection.query(
                    'UPDATE lots SET status = ? WHERE id = ?',
                    ['censado', lot_id]
                );
            }

            // Guardar archivos multimedia vinculados al formulario (Cloudinary links)
            if (Array.isArray(attachments) && attachments.length > 0) {
                for (const att of attachments) {
                    if (att.field_key && Array.isArray(att.media_urls)) {
                        await connection.query(`
                            INSERT INTO attachments (id, submission_id, field_key, media_urls)
                            VALUES (?, ?, ?, ?)
                        `, [uuidv4(), submissionId, att.field_key, JSON.stringify(att.media_urls)]);
                    }
                }
            }

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