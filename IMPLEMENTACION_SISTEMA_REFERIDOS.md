# Guía de Implementación: Sistema de Referidos Multicampaña

**Estado actual de la base de datos:** ✅ Tablas creadas en `seed.js`
**Patrón:** Atribución Diferida — el usuario llena el formulario como anónimo, se registra después, y el sistema concilia automáticamente los puntos.

---

## Índice

1. [Flujo completo del sistema](#1-flujo-completo-del-sistema)
2. [Estructura de los links de referido](#2-estructura-de-los-links-de-referido)
3. [Archivos nuevos a crear](#3-archivos-nuevos-a-crear)
4. [Modificaciones a archivos existentes](#4-modificaciones-a-archivos-existentes)
5. [Registro en server.js](#5-registro-en-serverjs)
6. [Diagrama de secuencia completo](#6-diagrama-de-secuencia-completo)
7. [Reglas anti-fraude](#7-reglas-anti-fraude)
8. [Checklist de implementación](#8-checklist-de-implementación)

---

## 1. Flujo completo del sistema

```
[Admin crea formulario]
        │
        ▼
[Se crea automáticamente giveaway_configs para ese form]
        │
        ▼
[Usuario registrado solicita GET /api/users/me/referral-profile]
        │
        ├── Si NO tiene perfil → Se genera referral_code único (lazy) y se guarda
        └── Si SÍ tiene perfil → Se retorna el código existente
        │
        ▼
[Frontend construye el link:  https://tuapp.com/f/{form_key}?ref={referral_code}]
        │
        ▼
[Usuario anónimo (Usuario B) abre el link]
        │
        ▼
[Frontend extrae ?ref=XYZ y lo guarda en memoria/sessionStorage]
        │
        ▼
[Usuario B llena el formulario → POST /api/submissions/anonymous]
        │  Body: { form_id, neighborhood_id, responses, referral_code: "XYZ" }
        ▼
[Backend crea el submission con user_id = NULL]
[Si hay referral_code válido → inserta en submission_referrals con is_processed = false]
[Respuesta: { submissionId: "uuid-xxx" }]
        │
        ▼
[Frontend guarda submissionId en localStorage]
        │
        ▼
[Usuario B se registra → POST /api/auth/register]
        │  Body: { name, document_number, password, ..., pending_submission_ids: ["uuid-xxx"] }
        ▼
[Backend ejecuta transacción ACID de conciliación y otorga puntos]
        │
        ▼
[Usuario A (referente) acumula puntos en user_referral_profiles]
[Entrada inmutable en giveaway_points_ledger]
```

---

## 2. Estructura de los links de referido

### Formato del link
```
https://tuapp.com/formulario/{form_key}?ref={referral_code}
```

**Ejemplo real:**
```
https://tuapp.com/formulario/censo-demografico-2026?ref=A7K2PQ
```

### Reglas del `referral_code`
- **Longitud:** 6-8 caracteres alfanuméricos en mayúsculas.
- **Unicidad:** Garantizada por `UNIQUE INDEX` en la tabla `user_referral_profiles`.
- **Generación:** Lazy-loading — se crea solo cuando el usuario lo solicita por primera vez.
- **Algoritmo:** `nanoid` o combinación de `Math.random` con `toString(36).toUpperCase()`.

### Función de generación sugerida
```javascript
// En giveawayModel.js
function generateReferralCode(length = 7) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // Sin ambiguos (0,O,1,I)
    let code = '';
    for (let i = 0; i < length; i++) {
        code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    return code;
}
```

---

## 3. Archivos nuevos a crear

### 3.1 `src/models/giveawayModel.js`

```javascript
// src/models/giveawayModel.js
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

function generateReferralCode(length = 7) {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
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
            (id, form_id, points_per_referral, is_active, created_at)
            VALUES (?, ?, 10, TRUE, NOW())
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
```

---

### 3.2 `src/controllers/giveawayController.js`

```javascript
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
                // El frontend construye el link con esta información
                share_base_url: process.env.FRONTEND_URL || 'https://tuapp.com/formulario'
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
```

---

### 3.3 `src/routes/giveawayRoutes.js`

```javascript
// src/routes/giveawayRoutes.js
const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/authMiddleware');
const { getLeaderboard } = require('../controllers/giveawayController');

// GET /api/giveaways/:formId/leaderboard  (público)
router.get('/:formId/leaderboard', getLeaderboard);

module.exports = router;
```

> **Nota:** La ruta `GET /api/users/me/referral-profile` se registra en `userRoutes.js` (ver sección 4.4).

---

## 4. Modificaciones a archivos existentes

### 4.1 `src/models/formModel.js` — Auto-crear `giveaway_configs`

Dentro del método `createWithVersion`, después de crear la `form_publication`, agregar la creación del sorteo **dentro de la misma transacción**:

```javascript
// src/models/formModel.js
// AGREGAR al inicio del archivo:
const GiveawayModel = require('./giveawayModel');

// DENTRO de createWithVersion(), después del INSERT de form_publications:

// C. Crear la configuración del sorteo automáticamente
await GiveawayModel.createConfig(connection, formId);

// Luego viene el commit y return existentes...
await connection.commit();
```

**Contexto del bloque a modificar en `formModel.js`:**

```javascript
// Buscar la sección que hace commit dentro de createWithVersion
// y agregar ANTES del commit:

            // D. Crear configuración del sorteo (auto-vinculado al formulario)
            await GiveawayModel.createConfig(connection, formId);

            await connection.commit();
```

---

### 4.2 `src/middlewares/authMiddleware.js` — Soporte para requests opcionales

El endpoint de submissions anónimos necesita un middleware que **no rechace** si no hay token, pero que sí decodifique si existe:

```javascript
// src/middlewares/optionalAuthMiddleware.js  (ARCHIVO NUEVO)
const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación opcional.
 * Si hay token válido, agrega req.user. Si no, req.user = null.
 * NO bloquea la request.
 */
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        req.user = null;
        return next();
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
    } catch {
        req.user = null;
    }
    next();
};

module.exports = optionalAuth;
```

---

### 4.3 `src/controllers/submissionController.js` — Aceptar `referral_code` y usuarios anónimos

**Cambios requeridos:**
1. Permitir `user_id = null` (usuarios anónimos).
2. Si llega `referral_code`, buscar el referente y crear `submission_referral`.
3. Devolver `submissionId` siempre para que el frontend lo guarde.

```javascript
// src/controllers/submissionController.js
// REEMPLAZAR el import y la función createSubmission completa:

const SubmissionModel = require('../models/submissionModel');
const FormModel = require('../models/formModel');
const GiveawayModel = require('../models/giveawayModel');
const pool = require('../config/db');
const { v4: uuidv4 } = require('uuid');

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
            // Si el código no existe, ignoramos silenciosamente (no bloqueamos el envío)
        }

        // 4. Abrir transacción para crear submission + referral atómicamente
        const connection = await pool.getConnection();
        try {
            await connection.beginTransaction();

            // Insertar el submission
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

            // Insertar el referral si aplica
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
            // Informar al frontend si debe solicitar registro
            requires_registration: userId === null
        });

    } catch (error) {
        console.error('Error guardando respuestas:', error);
        res.status(500).json({ ok: false, message: 'Error interno al guardar respuestas' });
    }
};
```

---

### 4.4 `src/routes/submissionRoutes.js` — Usar middleware opcional

```javascript
// src/routes/submissionRoutes.js
// MODIFICAR las primeras líneas:

const express = require('express');
const router = express.Router();
const { createSubmission, getSubmissionsByForm } = require('../controllers/submissionController');
const verifyToken = require('../middlewares/authMiddleware');
const optionalAuth = require('../middlewares/optionalAuthMiddleware'); // NUEVO

// POST /api/submissions  →  Usa auth opcional (permite anónimos)
router.post('/', optionalAuth, createSubmission);

// GET /api/submissions/:formId  →  Requiere auth (solo personal autorizado)
router.get('/:formId', verifyToken, getSubmissionsByForm);

module.exports = router;
```

---

### 4.5 `src/controllers/userController.js` — Conciliación en el registro

Modificar `createUser` para aceptar `pending_submission_ids` y ejecutar la conciliación:

```javascript
// src/controllers/userController.js
// AGREGAR import:
const GiveawayModel = require('../models/giveawayModel');

// MODIFICAR la función createUser:
const createUser = async (req, res) => {
    try {
        const { 
            name, document_number, email, password, role_id, 
            neighborhood_id,
            pending_submission_ids   // NUEVO: array de IDs de submissions anónimos
        } = req.body;

        // ... (validaciones existentes sin cambio) ...

        const newId = uuidv4();
        await UserModel.create({ id: newId, name, document_number, email, password_hash: hash, role_id, neighborhood_id });

        // ─── CONCILIACIÓN DE REFERIDOS ─────────────────────────────────────────
        const reconciliationResults = [];
        if (Array.isArray(pending_submission_ids) && pending_submission_ids.length > 0) {
            for (const submissionId of pending_submission_ids) {
                try {
                    const result = await GiveawayModel.reconcileSubmission(newId, submissionId);
                    reconciliationResults.push({ submissionId, ...result });
                } catch (reconcileError) {
                    // Loguear pero NO fallar el registro por esto
                    console.error(`⚠️  Error conciliando ${submissionId}:`, reconcileError.message);
                    reconciliationResults.push({ submissionId, reconciled: false, reason: 'error' });
                }
            }
        }
        // ───────────────────────────────────────────────────────────────────────

        res.status(201).json({
            ok: true,
            message: 'Usuario creado exitosamente',
            userId: newId,
            reconciliation: reconciliationResults   // Info para debugging del frontend
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: 'Error al crear usuario' });
    }
};
```

---

### 4.6 `src/routes/userRoutes.js` — Agregar ruta del perfil de referido

```javascript
// src/routes/userRoutes.js
// AGREGAR imports:
const verifyToken = require('../middlewares/authMiddleware');
const { getMyReferralProfile } = require('../controllers/giveawayController');

// AGREGAR la ruta ANTES de module.exports:

// GET /api/users/me/referral-profile  (autenticado)
router.get('/me/referral-profile', verifyToken, getMyReferralProfile);

// POST /api/users  (ya existente)
router.post('/', createUser);

module.exports = router;
```

> ⚠️ La ruta `/me/referral-profile` debe ir **antes** que cualquier ruta `/:id` para que Express no la interprete como un ID con valor `"me"`.

---

## 5. Registro en `server.js`

```javascript
// server.js — AGREGAR la nueva ruta de giveaways

const giveawayRoutes = require('./src/routes/giveawayRoutes'); // NUEVO

// ... rutas existentes ...
app.use('/api/auth', authRoutes);
app.use('/api/users', userRoutes);
app.use('/api/forms', formRoutes);
app.use('/api/submissions', submissionRoutes);
app.use('/api/neighborhoods', neighborhoodRoutes);
app.use('/api/map', mapRoutes);
app.use('/api/giveaways', giveawayRoutes);  // NUEVO
```

---

## 6. Diagrama de secuencia completo

```
Frontend (Usuario A)          Backend                    Base de Datos
      │                          │                              │
      │── GET /users/me/         │                              │
      │   referral-profile ─────►│── SELECT user_referral ─────►│
      │                          │◄── [] (no existe) ───────────│
      │                          │── INSERT user_referral ─────►│
      │◄── { referral_code:      │                              │
      │      "A7K2PQ" } ─────────│                              │
      │                          │                              │
   [Comparte link: /f/censo?ref=A7K2PQ]
      │                          │                              │
Frontend (Usuario B - Anónimo)  │                              │
      │                          │                              │
      │── POST /submissions ────►│                              │
      │   { form_id,             │── BEGIN TRANSACTION ────────►│
      │     referral_code:       │── INSERT submissions ───────►│
      │     "A7K2PQ" }           │── INSERT submission_referrals►│
      │                          │── COMMIT ───────────────────►│
      │◄── { submissionId:       │                              │
      │      "uuid-yyy",         │                              │
      │      requires_           │                              │
      │      registration: true}─│                              │
      │                          │                              │
   [Frontend guarda submissionId en localStorage]
      │                          │                              │
      │── POST /users ──────────►│                              │
      │  { name, password,       │── INSERT users ─────────────►│
      │    pending_submission_   │                              │
      │    ids: ["uuid-yyy"] }   │── reconcileSubmission() ─────│
      │                          │   BEGIN TRANSACTION          │
      │                          │── UPDATE submissions ───────►│
      │                          │── SELECT submission_referrals►│
      │                          │── UPDATE referrals ─────────►│
      │                          │── SELECT giveaway_configs ──►│
      │                          │── INSERT points_ledger ─────►│
      │                          │── UPDATE user_referral ─────►│
      │                          │── UPDATE is_processed=TRUE ─►│
      │                          │   COMMIT                     │
      │◄── { ok: true,           │                              │
      │      reconciliation: [   │                              │
      │       { reconciled:true, │                              │
      │         points: 10 }     │                              │
      │      ]}──────────────────│                              │
```

---

## 7. Reglas anti-fraude

| Regla | Implementación |
|---|---|
| **Idempotencia** | `is_processed = TRUE` actúa como candado. Se usa `FOR UPDATE` en el SELECT para bloquear la fila durante la transacción. |
| **Auto-referencia** | Validación explícita: si `referrer_user_id === newUserId` → rollback inmediato. |
| **Código inválido** | Si el `referral_code` no existe en `user_referral_profiles`, se ignora (no se bloquea el envío del formulario). |
| **Límite de puntos** | Si `giveaway_configs.max_points_per_user` está definido, se verifica antes de insertar en el ledger. |
| **Doble envío** | El UNIQUE INDEX en `submission_referrals.submission_id` previene crear dos referrals por el mismo envío. |
| **Sorteo inactivo** | Si `giveaway_configs.is_active = FALSE`, se vincula el usuario pero no se otorgan puntos. |
| **Fechas de sorteo** | Se puede agregar validación de `start_date` y `end_date` en el paso 4 de la conciliación. |

---

## 8. Checklist de implementación

### Archivos a crear
- [ ] `src/models/giveawayModel.js`
- [ ] `src/controllers/giveawayController.js`
- [ ] `src/routes/giveawayRoutes.js`
- [ ] `src/middlewares/optionalAuthMiddleware.js`

### Archivos a modificar
- [ ] `src/models/formModel.js` → Agregar `createConfig(connection, formId)` dentro de la transacción de `createWithVersion`
- [ ] `src/controllers/submissionController.js` → Aceptar `referral_code`, soportar `user_id = null`
- [ ] `src/routes/submissionRoutes.js` → Usar `optionalAuth` en POST
- [ ] `src/controllers/userController.js` → Aceptar `pending_submission_ids` y ejecutar conciliación
- [ ] `src/routes/userRoutes.js` → Agregar `GET /me/referral-profile`
- [ ] `server.js` → Registrar `giveawayRoutes`

### Variables de entorno a agregar en `.env`
```env
FRONTEND_URL=https://tuapp.com/formulario
```

### Orden recomendado de implementación
1. Crear `optionalAuthMiddleware.js`
2. Crear `giveawayModel.js`
3. Modificar `formModel.js` (auto-crear giveaway)
4. Modificar `submissionController.js` y su ruta
5. Crear `giveawayController.js` y `giveawayRoutes.js`
6. Modificar `userController.js` y `userRoutes.js`
7. Registrar en `server.js`
8. Ejecutar `node seed.js` para recrear la BD con las nuevas tablas
9. Probar el flujo completo con Postman/Thunder Client

---

## Resumen de endpoints del módulo

| Método | Endpoint | Auth | Descripción |
|--------|----------|------|-------------|
| `POST` | `/api/submissions` | Opcional | Crear envío (acepta `referral_code`) |
| `GET` | `/api/users/me/referral-profile` | ✅ JWT | Obtener/crear link de referido propio |
| `POST` | `/api/users` | — | Registro con `pending_submission_ids` |
| `GET` | `/api/giveaways/:formId/leaderboard` | ❌ Público | Ranking del sorteo de un formulario |
