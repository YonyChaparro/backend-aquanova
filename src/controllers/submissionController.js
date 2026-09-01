// src/controllers/submissionController.js
const SubmissionModel = require('../models/submissionModel');
const FormModel = require('../models/formModel');
const GiveawayModel = require('../models/giveawayModel');
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

// ─────────────────────────────────────────────────────────────────────────────
// Helpers de sincronización offline
//
// Contexto: los inspectores capturan encuestas sin conexión y las encolan en el
// dispositivo. Al sincronizar, un mismo envío puede llegar varias veces (una
// respuesta perdida en la red basta). Estos helpers permiten que un reintento
// sea inocuo. Ver specs/offline-encuestas.md, sección 3.6.1.
// ─────────────────────────────────────────────────────────────────────────────

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const isUuid = (v) => typeof v === 'string' && UUID_RE.test(v);

/**
 * El cliente propone el id de la submission (`client_id`). Como es el PK de la
 * tabla, la unicidad la garantiza la propia base de datos: reenviar el mismo
 * id no puede duplicar la fila.
 */
const resolveSubmissionId = (clientId) => (isUuid(clientId) ? clientId : uuidv4());

/**
 * Convierte un ISO string a DATETIME de MySQL.
 * Devuelve null si la fecha no es usable, para caer en el DEFAULT de la columna.
 */
const toMysqlDateTime = (iso) => {
    if (!iso) return null;
    const d = new Date(iso);
    if (Number.isNaN(d.getTime())) return null;
    // Se descartan fechas absurdas: los relojes de los dispositivos de campo
    // no son de fiar y una fecha basura contamina los reportes del censo.
    const year = d.getUTCFullYear();
    if (year < 2020 || year > 2100) return null;
    return d.toISOString().slice(0, 19).replace('T', ' ');
};

/**
 * Metadatos de captura del dispositivo. Se guardan en `submissions.device_info`
 * (columna que ya existía en el esquema y estaba sin usar).
 */
const buildDeviceInfo = (body, extra = {}) => {
    const incoming = body.device_info && typeof body.device_info === 'object' ? body.device_info : {};
    const info = { ...incoming, ...extra, serverReceivedAt: new Date().toISOString() };
    return JSON.stringify(info);
};

/**
 * Resuelve contra qué versión del formulario se guarda la submission.
 *
 * Si el cliente fija la versión en el momento de la captura (`form_version_id`)
 * y sigue siendo válida, se respeta: una encuesta capturada el lunes contra la
 * v1 no debe atribuirse a la v2 que el admin publicó el martes.
 *
 * Nunca se rechaza una submission por traer una versión antigua o desconocida:
 * rechazar un dato de campo es perderlo. Se cae al fallback y se deja rastro.
 */
async function resolveFormVersion(formId, requestedVersionId) {
    if (isUuid(requestedVersionId)) {
        const [rows] = await pool.query(
            'SELECT id, version FROM form_versions WHERE id = ? AND form_id = ?',
            [requestedVersionId, formId]
        );
        if (rows.length) return { version: rows[0], fallback: false };
    }
    const latest = await FormModel.findLatestVersionSchema(formId);
    return { version: latest, fallback: Boolean(requestedVersionId) };
}

/** Firma el JWT de sesión con la misma forma que authController. */
const signToken = (uid, role, roleName) =>
    jwt.sign({ uid, role, role_name: roleName }, process.env.JWT_SECRET, {
        expiresIn: process.env.JWT_EXPIRES_IN || '8h',
    });

/**
 * Paso 1 del flujo idempotente: ¿esta submission ya existe?
 * Resuelve el caso más común con diferencia — el POST llegó, se guardó, y la
 * respuesta se perdió antes de volver al dispositivo.
 */
async function findExistingSubmission(submissionId) {
    const [rows] = await pool.query(
        `SELECT s.id, s.user_id, u.name, u.document_number, u.email
           FROM submissions s
           LEFT JOIN users u ON u.id = s.user_id
          WHERE s.id = ?`,
        [submissionId]
    );
    return rows[0] || null;
}

/**
 * Rechaza la petición si trae credenciales rotas.
 *
 * `optionalAuth` no bloquea, así que sin esta comprobación un token expirado se
 * trataba igual que "sin token": la encuesta se guardaba como anónima y el
 * servidor respondía 201. El inspector perdía la atribución de su jornada sin
 * enterarse. Ver specs/offline-encuestas.md, DEF-01.
 *
 * @returns {boolean} true si ya se respondió y el controlador debe cortar
 */
function rejectIfBadCredentials(req, res) {
    if (!req.authError) return false;
    res.status(401).json({
        ok: false,
        code: req.authError === 'expired' ? 'TOKEN_EXPIRED' : 'TOKEN_INVALID',
        message: req.authError === 'expired'
            ? 'Tu sesión venció. Vuelve a iniciar sesión para sincronizar.'
            : 'Sesión inválida. Vuelve a iniciar sesión.',
    });
    return true;
}

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/submissions  (flujo autenticado del panel)
// ─────────────────────────────────────────────────────────────────────────────
const createSubmission = async (req, res) => {
    try {
        if (rejectIfBadCredentials(req, res)) return;

        const {
            form_id, neighborhood_id, responses, location, referral_code, lot_id,
            client_id, captured_at, form_version_id,
        } = req.body;

        const userId = req.user ? req.user.uid : null;
        const submissionId = resolveSubmissionId(client_id);

        // 1. Fast path idempotente: si ya existe, no se toca nada.
        const existing = await findExistingSubmission(submissionId);
        if (existing) {
            return res.status(200).json({
                ok: true,
                idempotent: true,
                submissionId,
                message: 'Esta encuesta ya había sido registrada',
                requires_registration: existing.user_id === null,
            });
        }

        // 2. Validar datos mínimos
        if (!form_id || !neighborhood_id || !responses) {
            return res.status(400).json({
                ok: false,
                message: 'Faltan datos: form_id, neighborhood_id o responses'
            });
        }

        // 3. Resolver la versión del formulario (la fijada en captura si es válida)
        const { version: versionData, fallback } = await resolveFormVersion(form_id, form_version_id);
        if (!versionData) {
            return res.status(404).json({
                ok: false,
                message: 'El formulario no tiene versiones activas.'
            });
        }

        // 4. Validar lot_id si fue enviado
        if (lot_id) {
            const [lotCheck] = await pool.query('SELECT id FROM lots WHERE id = ?', [lot_id]);
            if (!lotCheck.length) {
                return res.status(400).json({ ok: false, message: 'El predio seleccionado no existe' });
            }
        }

        // 5. Si hay referral_code, validar que el referente existe
        let referrerUserId = null;
        if (referral_code) {
            referrerUserId = await GiveawayModel.findUserByReferralCode(referral_code);
            // Si el código no existe, se ignora silenciosamente (no se bloquea el envío)
        }

        const capturedAt = toMysqlDateTime(captured_at);
        const deviceInfo = buildDeviceInfo(req.body, fallback ? { version_fallback: true } : {});

        // 6. Transacción: submission + referral atómicamente
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            await connection.query(`
                INSERT INTO submissions
                (id, form_version_id, user_id, neighborhood_id, lot_id, responses,
                 location_lat, location_lng, captured_at, device_info, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
                submissionId,
                versionData.id,
                userId,
                neighborhood_id,
                lot_id || null,
                JSON.stringify(responses),
                location ? location.lat : null,
                location ? location.lng : null,
                capturedAt,
                deviceInfo
            ]);

            if (lot_id) {
                await connection.query(
                    `UPDATE lots SET status = 'censado', updated_at = NOW() WHERE id = ? AND status = 'sin_informacion'`,
                    [lot_id]
                );
            }

            if (referrerUserId) {
                await GiveawayModel.createSubmissionReferral(connection, submissionId, referrerUserId);
            }

            await connection.commit();
        } catch (err) {
            await connection.rollback();
            // Carrera entre dos reintentos simultáneos del mismo item: el otro ganó.
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(200).json({
                    ok: true, idempotent: true, submissionId,
                    message: 'Esta encuesta ya había sido registrada'
                });
            }
            throw err;
        } finally {
            connection.release();
        }

        res.status(201).json({
            ok: true,
            idempotent: false,
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

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/submissions/exists
// Reconciliación de la cola offline: el dispositivo pregunta cuáles de sus
// items ya llegaron, para no reintentar los que en realidad sí se guardaron.
// ─────────────────────────────────────────────────────────────────────────────
const checkExistingSubmissions = async (req, res) => {
    try {
        const { ids } = req.body;
        if (!Array.isArray(ids) || ids.length === 0) {
            return res.status(400).json({ ok: false, message: 'Se requiere un array `ids` no vacío' });
        }
        if (ids.length > 500) {
            return res.status(400).json({ ok: false, message: 'Máximo 500 ids por consulta' });
        }

        const valid = ids.filter(isUuid);
        if (valid.length === 0) return res.json({ ok: true, existing: [] });

        const placeholders = valid.map(() => '?').join(',');
        const [rows] = await pool.query(
            `SELECT id FROM submissions WHERE id IN (${placeholders})`,
            valid
        );

        res.json({ ok: true, existing: rows.map((r) => r.id) });
    } catch (error) {
        console.error('Error verificando submissions existentes:', error);
        res.status(500).json({ ok: false, message: 'Error interno al verificar envíos' });
    }
};

// ─────────────────────────────────────────────────────────────────────────────
// POST /api/submissions/onboarding
// Llenar formulario + registrar usuario en un solo paso (endpoint público).
//
// Reordenado para que un reintento de la cola offline sea seguro. Ver
// specs/offline-encuestas.md, sección 3.6.1. Este endpoint ya NO devuelve 409:
// un documento repetido reutiliza el usuario y un email repetido se degrada a
// warning. Un 409 dejaba el item envenenado en la cola para siempre.
// ─────────────────────────────────────────────────────────────────────────────
const createOnboarding = async (req, res) => {
    try {
        const {
            form_key, neighborhood_id, responses,
            referral_code, lot_id,
            name, document_number, password, email, phone,
            location,
            client_id, captured_at, form_version_id
        } = req.body;

        const submissionId = resolveSubmissionId(client_id);
        const warnings = [];

        // ── PASO 1: Fast path idempotente ────────────────────────────────────
        // El caso frecuente: el POST llegó y se guardó, pero la respuesta se
        // perdió y el dispositivo reintentó.
        const existing = await findExistingSubmission(submissionId);
        if (existing) {
            let referralCode = null;
            let token = null;
            if (existing.user_id) {
                try {
                    const profile = await GiveawayModel.getOrCreateReferralProfile(existing.user_id);
                    referralCode = profile?.referral_code || null;
                } catch (e) {
                    console.warn('⚠️  No se pudo recuperar el perfil de referido:', e.message);
                }
                token = signToken(existing.user_id, 3, 'usuario');
            }
            const baseFrontend = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
            return res.status(200).json({
                ok: true,
                idempotent: true,
                message: 'Esta encuesta ya había sido registrada',
                submissionId,
                token,
                user: existing.user_id ? {
                    id: existing.user_id,
                    name: existing.name,
                    document_number: existing.document_number,
                    email: existing.email,
                    role: 'usuario'
                } : null,
                referral_code: referralCode,
                share_link: referralCode && form_key
                    ? `${baseFrontend}/formulario/${form_key}?ref=${referralCode}`
                    : null,
            });
        }

        // ── PASO 2: Validaciones y resolución del formulario ─────────────────
        if (!form_key || !neighborhood_id || !responses || !name || !document_number) {
            return res.status(400).json({
                ok: false,
                message: 'Faltan datos requeridos: form_key, neighborhood_id, responses, name y document_number son obligatorios'
            });
        }

        const form = await FormModel.findByKey(form_key);
        if (!form) {
            return res.status(404).json({ ok: false, message: 'Formulario no encontrado o inactivo' });
        }

        const { version: versionData, fallback } = await resolveFormVersion(form.id, form_version_id);
        if (!versionData) {
            return res.status(404).json({ ok: false, message: 'El formulario no tiene versiones activas' });
        }

        if (lot_id) {
            const [lotCheck] = await pool.query('SELECT id FROM lots WHERE id = ?', [lot_id]);
            if (!lotCheck.length) {
                return res.status(400).json({ ok: false, message: 'El predio seleccionado no existe' });
            }
        }

        let referrerUserId = null;
        if (referral_code) {
            referrerUserId = await GiveawayModel.findUserByReferralCode(referral_code);
            // Código inválido → se ignora silenciosamente, no bloquea el registro
        }

        // ── PASO 3: Resolver el usuario FUERA de la transacción ──────────────
        // Un ciudadano puede tener dos predios, o haber participado en una
        // campaña anterior. Antes, el INSERT reventaba por document_number
        // UNIQUE y devolvía un 409 permanente: sencillamente no se le podía
        // volver a censar. Ahora se reutiliza el usuario existente.
        const [userRows] = await pool.query(
            'SELECT id, email, phone FROM users WHERE document_number = ? LIMIT 1',
            [document_number]
        );
        const reusingUser = userRows.length > 0;
        const userId = reusingUser ? userRows[0].id : uuidv4();
        if (reusingUser) warnings.push('usuario_existente_reutilizado');

        // Email: si ya pertenece a OTRA persona, no se asigna. Se conserva en
        // `responses` (lo envía el cliente) y se avisa, en lugar de fallar.
        let emailToUse = email || null;
        if (emailToUse) {
            const [emailRows] = await pool.query(
                'SELECT id FROM users WHERE email = ? LIMIT 1',
                [emailToUse]
            );
            if (emailRows.length && emailRows[0].id !== userId) {
                emailToUse = null;
                warnings.push('email_duplicado_no_asignado');
            }
        }

        let passwordHash = null;
        if (password && !reusingUser) {
            const salt = await bcrypt.genSalt(10);
            passwordHash = await bcrypt.hash(password, salt);
        }

        const capturedAt = toMysqlDateTime(captured_at);
        const deviceInfo = buildDeviceInfo(req.body, fallback ? { version_fallback: true } : {});

        // ── PASO 4: Transacción ──────────────────────────────────────────────
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            if (reusingUser) {
                // No se pisan `name` ni `password_hash` de un usuario que ya
                // existe: solo se rellenan contacto vacíos.
                await connection.query(
                    `UPDATE users
                        SET email = COALESCE(email, ?), phone = COALESCE(phone, ?)
                      WHERE id = ?`,
                    [emailToUse, phone || null, userId]
                );
                await connection.query(
                    'INSERT IGNORE INTO user_roles (user_id, role_id, neighborhood_id) VALUES (?, 3, ?)',
                    [userId, neighborhood_id || null]
                );
            } else {
                await connection.query(`
                    INSERT INTO users (id, name, document_number, email, phone, password_hash, is_active, created_at)
                    VALUES (?, ?, ?, ?, ?, ?, 1, NOW())
                `, [userId, name, document_number, emailToUse, phone || null, passwordHash]);

                await connection.query(
                    'INSERT INTO user_roles (user_id, role_id, neighborhood_id) VALUES (?, 3, ?)',
                    [userId, neighborhood_id || null]
                );
            }

            await connection.query(`
                INSERT INTO submissions
                (id, form_version_id, user_id, neighborhood_id, lot_id, responses,
                 location_lat, location_lng, captured_at, device_info, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, NOW())
            `, [
                submissionId,
                versionData.id,
                userId,
                neighborhood_id,
                lot_id || null,
                JSON.stringify(responses),
                location ? location.lat : null,
                location ? location.lng : null,
                capturedAt,
                deviceInfo
            ]);

            // Marcar el predio como censado si fue seleccionado en el mapa.
            // El guard del WHERE lo hace repetible.
            if (lot_id) {
                await connection.query(
                    `UPDATE lots SET status = 'censado', updated_at = NOW() WHERE id = ? AND status = 'sin_informacion'`,
                    [lot_id]
                );
            }

            if (referrerUserId) {
                await GiveawayModel.createSubmissionReferral(connection, submissionId, referrerUserId);
            }

            await connection.commit();
        } catch (err) {
            await connection.rollback();
            // Carrera entre dos reintentos simultáneos del mismo item.
            if (err.code === 'ER_DUP_ENTRY') {
                return res.status(200).json({
                    ok: true, idempotent: true, submissionId,
                    message: 'Esta encuesta ya había sido registrada'
                });
            }
            throw err;
        } finally {
            connection.release();
        }

        // ── PASO 5: Post-commit, todo protegido ──────────────────────────────
        // Nada de lo que sigue puede tumbar una submission ya guardada. Antes,
        // un fallo aquí devolvía 500 con la fila ya commiteada: el dispositivo
        // reintentaba y el item quedaba atascado para siempre.
        let reconciliation = null;
        let referralCode = null;
        let shareLink = null;
        let token = null;

        try {
            if (referrerUserId) {
                reconciliation = await GiveawayModel.reconcileSubmission(userId, submissionId);
            }
            const referralProfile = await GiveawayModel.getOrCreateReferralProfile(userId);
            referralCode = referralProfile?.referral_code || null;
            if (referralCode) {
                const baseFrontend = (process.env.FRONTEND_URL || '').replace(/\/$/, '');
                shareLink = `${baseFrontend}/formulario/${form.key}?ref=${referralCode}`;
            }
            token = signToken(userId, 3, 'usuario');
        } catch (e) {
            console.warn('⚠️  Post-commit del onboarding falló (la submission SÍ se guardó):', e.message);
            warnings.push('perfil_referido_no_generado');
        }

        res.status(201).json({
            ok: true,
            idempotent: false,
            message: 'Registro y envío de formulario exitosos',
            token,
            user: {
                id: userId,
                name,
                document_number,
                email: emailToUse,
                role: 'usuario'
            },
            submissionId,
            referral_code: referralCode,
            share_link: shareLink,
            reconciliation,
            warnings: warnings.length ? warnings : undefined
        });

    } catch (error) {
        console.error('Error en onboarding:', error);
        res.status(500).json({ ok: false, message: 'Error interno en el proceso de registro' });
    }
};

module.exports = {
    createSubmission,
    getSubmissionsByForm,
    createOnboarding,
    checkExistingSubmissions,
};
