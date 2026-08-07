// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const { getUsers, createUser } = require('../controllers/userController');
const { getMyReferralProfile, getReferralQR } = require('../controllers/giveawayController');
const verifyToken = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/roleMiddleware');

/**
 * @swagger
 * tags:
 *   name: Users
 *   description: Gestión de usuarios y perfil de referidos
 */

/**
 * @swagger
 * /users/me/referral-profile:
 *   get:
 *     summary: Obtener perfil de referido del usuario autenticado
 *     description: |
 *       Retorna el perfil de referido del usuario autenticado. Si el usuario no tiene
 *       perfil aún, lo crea automáticamente generando un código único (lazy loading).
 *       El `referral_code` se usa para construir el link de invitación:
 *       `{share_base_url}?ref={referral_code}`
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Perfil de referido obtenido (o creado) exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     referral_code:
 *                       type: string
 *                       description: Código único de 7 caracteres para compartir
 *                       example: "EAL34TM"
 *                     total_accumulated_points:
 *                       type: integer
 *                       description: Total de puntos acumulados por referidos exitosos
 *                       example: 30
 *                     share_base_url:
 *                       type: string
 *                       description: URL base del frontend para construir el link de invitación
 *                       example: "http://localhost:5173/formulario"
 *       401:
 *         description: Token JWT no proporcionado o inválido
 *       500:
 *         description: Error interno del servidor
 */
// GET /api/users/me/referral-profile  →  Cualquier usuario autenticado
// IMPORTANTE: rutas /me/* deben ir ANTES de /:id para que Express no interprete "me" como un ID
router.get('/me/referral-profile', verifyToken, getMyReferralProfile);

/**
 * @swagger
 * /users/me/referral-qr:
 *   get:
 *     summary: Obtener el código QR del link de referido del usuario autenticado
 *     description: |
 *       Genera un código QR que codifica el link de referido personal del usuario.
 *       El link apunta a `{FRONTEND_URL}{REFERRAL_FORM_PATH}?ref={referral_code}`.
 *
 *       **Formatos disponibles** (parámetro `format`):
 *       - `json` (default): devuelve JSON con el SVG y un data URL — para renderizar
 *         el QR directamente en la UI sin descarga.
 *       - `svg`: devuelve el SVG como imagen — para mostrar inline en HTML.
 *       - `png`: descarga el PNG a 512×512 px — para imprimir o compartir por WhatsApp.
 *
 *       **Parámetro `formId`** (opcional): si se pasa, el QR codifica
 *       `{FRONTEND_URL}{REFERRAL_FORM_PATH}/{formId}?ref={referral_code}`
 *       en lugar del path genérico. Útil para campañas de un formulario específico.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: format
 *         required: false
 *         schema:
 *           type: string
 *           enum: [json, svg, png]
 *           default: json
 *         description: Formato de salida del QR
 *       - in: query
 *         name: formId
 *         required: false
 *         schema:
 *           type: string
 *           format: uuid
 *         description: |
 *           ID de un formulario específico. Si se indica, el QR apunta a ese formulario.
 *           Si se omite, el QR apunta al formulario genérico configurado en REFERRAL_FORM_PATH.
 *     responses:
 *       200:
 *         description: |
 *           QR generado. El Content-Type varía según el `format` solicitado:
 *           `application/json` | `image/svg+xml` | `image/png`
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: object
 *                   properties:
 *                     referral_code:
 *                       type: string
 *                       example: "EAL34TM"
 *                     referral_url:
 *                       type: string
 *                       example: "https://aquavisor.co/formulario?ref=EAL34TM"
 *                     qr_svg:
 *                       type: string
 *                       description: SVG completo como string, listo para renderizar inline
 *                     qr_data_url:
 *                       type: string
 *                       description: "PNG en base64 — usar como src de <img>"
 *                       example: "data:image/png;base64,iVBORw0KGgo..."
 *           image/svg+xml:
 *             schema:
 *               type: string
 *               format: binary
 *           image/png:
 *             schema:
 *               type: string
 *               format: binary
 *       401:
 *         description: Token JWT no proporcionado o inválido
 *       503:
 *         description: FRONTEND_URL no configurada en el servidor
 *       500:
 *         description: Error generando el código QR
 */
router.get('/me/referral-qr', verifyToken, getReferralQR);

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Listar todos los usuarios
 *     description: Retorna todos los usuarios registrados con sus roles y barrios asignados. Solo accesible por administradores.
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuarios
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 data:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       document_number:
 *                         type: string
 *                       email:
 *                         type: string
 *                       role_name:
 *                         type: string
 *                         example: "usuario"
 *                       neighborhood_name:
 *                         type: string
 *                         nullable: true
 *       401:
 *         description: Token JWT no proporcionado o inválido
 *       403:
 *         description: Requiere rol de administrador
 */
// GET /api/users  →  Solo admin
router.get('/', verifyToken, authorize([1]), getUsers);

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Crear / registrar un nuevo usuario
 *     description: |
 *       Crea un nuevo usuario en el sistema. **Endpoint público** (no requiere autenticación).
 *
 *       Si el usuario llenó formularios de forma anónima antes de registrarse (flujo de referidos),
 *       debe incluir los IDs de esos submissions en `pending_submission_ids`.
 *       El backend ejecutará automáticamente la **conciliación ACID** para:
 *       - Vincular cada submission al nuevo usuario
 *       - Verificar si hay un referido pendiente (`submission_referrals`)
 *       - Otorgar puntos al referente en el ledger inmutable
 *       - Actualizar el acumulado de puntos del referente
 *     tags: [Users]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - document_number
 *               - password
 *               - role_id
 *             properties:
 *               name:
 *                 type: string
 *                 example: "Juan Pérez"
 *               document_number:
 *                 type: string
 *                 example: "1234567890"
 *               email:
 *                 type: string
 *                 format: email
 *                 example: "juan@correo.com"
 *               password:
 *                 type: string
 *                 format: password
 *                 example: "miContraseña123"
 *               role_id:
 *                 type: integer
 *                 description: "1=administrador, 2=operador, 3=usuario"
 *                 example: 3
 *               neighborhood_id:
 *                 type: string
 *                 format: uuid
 *                 description: Barrio de asignación del usuario (opcional)
 *                 example: "616a6cc8-17e2-44f4-af0f-7103b5a0755f"
 *               pending_submission_ids:
 *                 type: array
 *                 description: IDs de submissions hechos como anónimo para conciliar y otorgar puntos al referente.
 *                 items:
 *                   type: string
 *                   format: uuid
 *                 example: ["79486606-19ec-4295-b903-ce8bc2e76582"]
 *     responses:
 *       201:
 *         description: Usuario creado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: true
 *                 message:
 *                   type: string
 *                   example: "Usuario creado exitosamente"
 *                 userId:
 *                   type: string
 *                   format: uuid
 *                   example: "2e373e79-4ad7-4d48-8d53-c5afa046d178"
 *                 reconciliation:
 *                   type: array
 *                   description: Resultado de la conciliación por cada submission enviado
 *                   items:
 *                     type: object
 *                     properties:
 *                       submissionId:
 *                         type: string
 *                         format: uuid
 *                       reconciled:
 *                         type: boolean
 *                       points_awarded:
 *                         type: integer
 *                         nullable: true
 *                       reason:
 *                         type: string
 *                         nullable: true
 *                         enum: [no_referral, self_referral, max_points_reached, no_active_giveaway, error]
 *                         description: Solo presente cuando no se otorgaron puntos
 *       400:
 *         description: Faltan campos obligatorios o el documento ya está registrado
 *       500:
 *         description: Error interno del servidor
 */
// POST /api/users  →  Público (auto-registro con reconciliación de referidos)
router.post('/', createUser);

module.exports = router;
