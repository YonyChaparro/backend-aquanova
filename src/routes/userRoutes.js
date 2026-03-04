// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const { getUsers, createUser } = require('../controllers/userController');
const { getMyReferralProfile } = require('../controllers/giveawayController');
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
// IMPORTANTE: debe ir ANTES de cualquier ruta /:id para que Express no interprete "me" como un ID
router.get('/me/referral-profile', verifyToken, getMyReferralProfile);

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
