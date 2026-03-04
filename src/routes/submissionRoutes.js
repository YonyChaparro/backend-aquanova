// src/routes/submissionRoutes.js
const express = require('express');
const router = express.Router();
const { createSubmission, getSubmissionsByForm, createOnboarding } = require('../controllers/submissionController');
const verifyToken = require('../middlewares/authMiddleware');
const optionalAuth = require('../middlewares/optionalAuthMiddleware');

/**
 * @swagger
 * tags:
 *   name: Submissions
 *   description: Envío y consulta de respuestas de formularios
 */

/**
 * @swagger
 * /submissions:
 *   post:
 *     summary: Enviar respuesta a un formulario
 *     description: |
 *       Guarda las respuestas de un formulario. Soporta dos modos:
 *       - **Autenticado**: el `user_id` se toma del token JWT.
 *       - **Anónimo**: sin token. Requiere incluir `referral_code` si el usuario llegó por un referido.
 *         La respuesta incluirá `requires_registration: true` para indicar que el usuario debe registrarse
 *         y enviar el `submissionId` en `pending_submission_ids` durante el registro para activar los puntos.
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *       - {}
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - form_id
 *               - neighborhood_id
 *               - responses
 *             properties:
 *               form_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID del formulario a responder
 *                 example: "49d3db06-2f08-4a32-9c38-c7bd1200d674"
 *               neighborhood_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID del barrio donde se realiza el registro
 *                 example: "616a6cc8-17e2-44f4-af0f-7103b5a0755f"
 *               responses:
 *                 type: object
 *                 description: Objeto con las respuestas del formulario (clave = field key del schema)
 *                 example: { "nombre_jefe": "María López", "num_personas": 4 }
 *               referral_code:
 *                 type: string
 *                 description: Código de referido del usuario que compartió el formulario. Se ignora silenciosamente si es inválido.
 *                 example: "EAL34TM"
 *               location:
 *                 type: object
 *                 description: Coordenadas GPS opcionales del dispositivo
 *                 properties:
 *                   lat:
 *                     type: number
 *                     format: float
 *                     example: 4.7110
 *                   lng:
 *                     type: number
 *                     format: float
 *                     example: -74.0721
 *     responses:
 *       201:
 *         description: Respuestas guardadas exitosamente
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
 *                   example: "Respuestas guardadas exitosamente"
 *                 submissionId:
 *                   type: string
 *                   format: uuid
 *                   description: ID del submission creado. Guardar si el usuario es anónimo para enviarlo en el registro.
 *                   example: "79486606-19ec-4295-b903-ce8bc2e76582"
 *                 requires_registration:
 *                   type: boolean
 *                   description: true si el envío fue anónimo y el usuario aún no está registrado.
 *                   example: true
 *       400:
 *         description: Faltan campos obligatorios (form_id, neighborhood_id o responses)
 *       404:
 *         description: El formulario no existe o no tiene versión activa
 *       500:
 *         description: Error interno del servidor
 */
// POST /api/submissions  →  Auth opcional (permite anónimos con referral_code)
router.post('/', optionalAuth, createSubmission);

/**
 * @swagger
 * /submissions/{formId}:
 *   get:
 *     summary: Obtener respuestas de un formulario
 *     description: Retorna todas las respuestas enviadas a un formulario específico. Solo accesible por usuarios autenticados.
 *     tags: [Submissions]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: formId
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: ID del formulario padre
 *         example: "49d3db06-2f08-4a32-9c38-c7bd1200d674"
 *     responses:
 *       200:
 *         description: Lista de respuestas del formulario
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
 *                       responses:
 *                         type: object
 *                       location_lat:
 *                         type: number
 *                         nullable: true
 *                       location_lng:
 *                         type: number
 *                         nullable: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       status:
 *                         type: string
 *                         enum: [submitted, draft, failed]
 *                       collected_by:
 *                         type: string
 *                         nullable: true
 *                         description: Nombre del usuario que recopiló (null si fue anónimo)
 *                       neighborhood:
 *                         type: string
 *       401:
 *         description: Token JWT no proporcionado o inválido
 *       500:
 *         description: Error interno del servidor
 */
// GET /api/submissions/:formId  →  Requiere auth (solo personal autorizado)
router.get('/:formId', verifyToken, getSubmissionsByForm);

/**
 * @swagger
 * /submissions/onboarding:
 *   post:
 *     summary: Registrar usuario y enviar formulario en un solo paso (onboarding)
 *     description: |
 *       Endpoint público pensado para el flujo de links de invitación.
 *       Cuando un usuario nuevo abre un link de formulario compartido, llena el formulario
 *       **y se registra** en la misma petición.
 *
 *       El proceso es atómico:
 *       1. Se crea el usuario (rol `usuario`, id=3).
 *       2. Se crea el submission ligado al nuevo usuario.
 *       3. Si `referral_code` es válido, se atribuye el referido.
 *
 *       Tras el commit:
 *       - Se reconcilian los puntos del referente (si aplica).
 *       - Se genera el perfil de referido del nuevo usuario (su propio código).
 *
 *       La respuesta incluye un **JWT token** listo para usar y el **share_link**
 *       personalizado del nuevo usuario para que pueda comenzar a referir a otros.
 *     tags: [Submissions]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - form_key
 *               - neighborhood_id
 *               - responses
 *               - name
 *               - document_number
 *             properties:
 *               form_key:
 *                 type: string
 *                 description: Slug único del formulario (campo `key` del formulario). Viene en la URL del link compartido.
 *                 example: "censo-demografico-2026"
 *               neighborhood_id:
 *                 type: string
 *                 format: uuid
 *                 description: ID del barrio donde se realiza el registro
 *                 example: "616a6cc8-17e2-44f4-af0f-7103b5a0755f"
 *               responses:
 *                 type: object
 *                 description: Respuestas del formulario (clave = field name del schema)
 *                 example: { "nombre_jefe": "Carlos Pérez", "num_personas": 3 }
 *               referral_code:
 *                 type: string
 *                 description: Código de referido del usuario que compartió el link. Viene como `?ref=XXXXXXX` en la URL. Se ignora silenciosamente si es inválido.
 *                 example: "EAL34TM"
 *               name:
 *                 type: string
 *                 description: Nombre completo del nuevo usuario (requerido)
 *                 example: "Carlos Pérez"
 *               document_number:
 *                 type: string
 *                 description: Número de documento del nuevo usuario. Debe ser único en el sistema.
 *                 example: "1098765432"
 *               password:
 *                 type: string
 *                 description: Contraseña del nuevo usuario (opcional — `password_hash` es NULL en la BD). Si no se envía, el usuario podrá establecerla después.
 *                 example: "miClave2026"
 *               email:
 *                 type: string
 *                 format: email
 *                 description: Correo electrónico (opcional, debe ser único si se envía)
 *                 example: "carlos@example.com"
 *               phone:
 *                 type: string
 *                 description: Teléfono de contacto (opcional)
 *                 example: "3001234567"
 *               location:
 *                 type: object
 *                 description: Coordenadas GPS del dispositivo (opcional)
 *                 properties:
 *                   lat:
 *                     type: number
 *                     format: float
 *                     example: 4.7110
 *                   lng:
 *                     type: number
 *                     format: float
 *                     example: -74.0721
 *     responses:
 *       201:
 *         description: Registro y envío exitosos. El token ya está listo para usar.
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
 *                   example: "Registro y envío de formulario exitosos"
 *                 token:
 *                   type: string
 *                   description: JWT firmado para autenticar al nuevo usuario en futuras peticiones
 *                   example: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                 user:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     name:
 *                       type: string
 *                       example: "Carlos Pérez"
 *                     document_number:
 *                       type: string
 *                       example: "1098765432"
 *                     email:
 *                       type: string
 *                       nullable: true
 *                       example: "carlos@example.com"
 *                     role:
 *                       type: string
 *                       example: "usuario"
 *                 submissionId:
 *                   type: string
 *                   format: uuid
 *                   description: ID del submission creado
 *                   example: "79486606-19ec-4295-b903-ce8bc2e76582"
 *                 referral_code:
 *                   type: string
 *                   description: Código de referido propio del nuevo usuario (para futuros links a compartir)
 *                   example: "KPZ91XW"
 *                 share_link:
 *                   type: string
 *                   description: Link personalizado del nuevo usuario listo para compartir
 *                   example: "http://localhost:5173/formulario/censo-demografico-2026?ref=KPZ91XW"
 *                 reconciliation:
 *                   type: object
 *                   nullable: true
 *                   description: Resultado de la asignación de puntos al referente (null si no hubo referido válido)
 *                   properties:
 *                     reconciled:
 *                       type: boolean
 *                       description: true si se otorgaron puntos al referente
 *                       example: true
 *                     points_awarded:
 *                       type: integer
 *                       description: Puntos otorgados al referente
 *                       example: 10
 *                     reason:
 *                       type: string
 *                       description: Razón si no se otorgaron puntos
 *                       enum: [no_referral, self_referral, max_points_reached, no_active_giveaway, error]
 *                       nullable: true
 *             examples:
 *               ConReferido:
 *                 summary: Onboarding exitoso con referido válido
 *                 value:
 *                   ok: true
 *                   message: "Registro y envío de formulario exitosos"
 *                   token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                   user:
 *                     id: "uuid-new-user"
 *                     name: "Carlos Pérez"
 *                     document_number: "1098765432"
 *                     email: "carlos@example.com"
 *                     role: "usuario"
 *                   submissionId: "uuid-submission"
 *                   referral_code: "KPZ91XW"
 *                   share_link: "http://localhost:5173/formulario/censo-demografico-2026?ref=KPZ91XW"
 *                   reconciliation:
 *                     reconciled: true
 *                     points_awarded: 10
 *                     reason: null
 *               SinReferido:
 *                 summary: Onboarding exitoso sin referido
 *                 value:
 *                   ok: true
 *                   message: "Registro y envío de formulario exitosos"
 *                   token: "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9..."
 *                   user:
 *                     id: "uuid-new-user-2"
 *                     name: "Ana Torres"
 *                     document_number: "9876543210"
 *                     email: null
 *                     role: "usuario"
 *                   submissionId: "uuid-submission-2"
 *                   referral_code: "MNQ47BR"
 *                   share_link: "http://localhost:5173/formulario/censo-demografico-2026?ref=MNQ47BR"
 *                   reconciliation: null
 *       400:
 *         description: Faltan datos requeridos (form_key, neighborhood_id, responses, name o document_number)
 *       404:
 *         description: Formulario no encontrado, inactivo, o sin versión activa
 *       409:
 *         description: Ya existe un usuario con ese número de documento o correo electrónico
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                   example: false
 *                 message:
 *                   type: string
 *                   example: "Ya existe un usuario con ese número de documento o correo electrónico"
 *       500:
 *         description: Error interno del servidor
 */
// POST /api/submissions/onboarding  →  Público (registrar + llenar formulario en un paso)
router.post('/onboarding', createOnboarding);

module.exports = router;