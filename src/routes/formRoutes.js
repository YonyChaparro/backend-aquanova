const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/roleMiddleware');
const upload = require('../middlewares/uploadMiddleware');
const { createForm, getForms, getFormDetail, updateForm, deleteForm, searchForms, getFormPublic } = require('../controllers/formController');

/**
 * @swagger
 * /forms/public/{key}:
 *   get:
 *     summary: Cargar formulario por su key (endpoint público para links de invitación)
 *     description: |
 *       Retorna el formulario identificado por su slug `key` sin requerir autenticación.
 *       Es el endpoint que el frontend llama cuando el usuario abre un link de invitación
 *       del tipo `http://localhost:5173/formulario/{key}?ref=XXXXXXX`.
 *
 *       Incluye:
 *       - El **schema de preguntas** del formulario (última versión activa)
 *       - El **objeto `giveaway`** con los puntos que se otorgarán al referente
 *       - El **objeto `registration_fields`** con los campos mínimos que el frontend debe mostrar
 *         para que el usuario se registre al mismo tiempo que llena el formulario.
 *         Estos campos son derivados de los requerimientos mínimos de la tabla `users` en la BD.
 *     tags: [Forms]
 *     parameters:
 *       - in: path
 *         name: key
 *         required: true
 *         schema:
 *           type: string
 *         description: Slug único del formulario (campo `key`)
 *         example: "censo-demografico-2026"
 *     responses:
 *       200:
 *         description: Formulario cargado exitosamente
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
 *                     id:
 *                       type: string
 *                       format: uuid
 *                     key:
 *                       type: string
 *                       example: "censo-demografico-2026"
 *                     title:
 *                       type: string
 *                       example: "Censo Demográfico 2026"
 *                     description:
 *                       type: string
 *                       nullable: true
 *                     metadata:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         imagen:
 *                           type: string
 *                     neighborhood_id:
 *                       type: string
 *                       format: uuid
 *                       nullable: true
 *                     version:
 *                       type: integer
 *                       example: 1
 *                     schema:
 *                       type: array
 *                       description: Preguntas del formulario a renderizar
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                           label:
 *                             type: string
 *                           name:
 *                             type: string
 *                     giveaway:
 *                       type: object
 *                       description: Configuración del sorteo asociado al formulario
 *                       properties:
 *                         points_per_referral:
 *                           type: integer
 *                           description: Puntos que recibirá el referente cuando el nuevo usuario complete el onboarding
 *                           example: 10
 *                         is_active:
 *                           type: boolean
 *                           example: true
 *                     registration_fields:
 *                       type: object
 *                       description: |
 *                         Campos de registro del nuevo usuario. Solo `name` y `document_number`
 *                         son obligatorios (restricción NOT NULL / UNIQUE en la tabla `users`).
 *                         Los demás (`password`, `email`, `phone`) son opcionales — el frontend
 *                         los renderiza según el valor de la propiedad `required` de cada campo.
 *                       properties:
 *                         name:
 *                           type: object
 *                           properties:
 *                             required: { type: boolean, example: true }
 *                             type: { type: string, example: "text" }
 *                             label: { type: string, example: "Nombre completo" }
 *                         document_number:
 *                           type: object
 *                           properties:
 *                             required: { type: boolean, example: true }
 *                             type: { type: string, example: "text" }
 *                             label: { type: string, example: "Número de documento" }
 *                         password:
 *                           type: object
 *                           properties:
 *                             required: { type: boolean, example: false }
 *                             type: { type: string, example: "password" }
 *                             label: { type: string, example: "Crear contraseña" }
 *                         email:
 *                           type: object
 *                           properties:
 *                             required: { type: boolean, example: false }
 *                             type: { type: string, example: "email" }
 *                             label: { type: string, example: "Correo electrónico" }
 *                         phone:
 *                           type: object
 *                           properties:
 *                             required: { type: boolean, example: false }
 *                             type: { type: string, example: "tel" }
 *                             label: { type: string, example: "Teléfono" }
 *       404:
 *         description: Formulario no encontrado o inactivo
 *       500:
 *         description: Error interno del servidor
 */
// GET /api/forms/public/:key  →  Público (no requiere auth) — debe ir ANTES de router.use(verifyToken)
router.get('/public/:key', getFormPublic);

router.use(verifyToken);

/**
 * @swagger
 * /forms:
 *   get:
 *     summary: Listar todos los formularios
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de formularios disponibles con estado de activación, imagen de portada y barrios relacionados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 forms:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       key:
 *                         type: string
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       metadata:
 *                         type: object
 *                         nullable: true
 *                         description: Datos extra del formulario (imagen de portada alojada en Cloudinary, etc.)
 *                         properties:
 *                           imagen:
 *                             type: string
 *                             description: URL pública de la imagen de portada en Cloudinary
 *                           imagen_public_id:
 *                             type: string
 *                             description: ID interno de Cloudinary usado para gestionar la imagen
 *                       is_active:
 *                         type: boolean
 *                         description: Indica si el formulario está activo o inactivo
 *                       created_by:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       neighborhoods:
 *                         type: array
 *                         description: Barrios con publicación activa donde está publicado el formulario. Retorna [] si no tiene barrio asociado.
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             name:
 *                               type: string
 *                             code:
 *                               type: string
 *                             parent_id:
 *                               type: string
 *                               nullable: true
 *                       share_link:
 *                         type: string
 *                         description: Link de invitación listo para compartir. Incluye el código de referido del usuario autenticado. El destinatario que llene el formulario y luego se registre otorgará puntos al remitente.
 *                         example: "http://localhost:5173/formulario/censo-demografico-2026?ref=EAL34TM"
 *             examples:
 *               ConImagenYBarrio:
 *                 summary: Formulario activo con imagen de portada y barrio asociado
 *                 value:
 *                   ok: true
 *                   forms:
 *                     - id: "uuid-form-1"
 *                       key: "censo-barrial-8392"
 *                       title: "Censo Barrial"
 *                       description: "Encuesta de barrio"
 *                       metadata:
 *                         imagen: "https://res.cloudinary.com/dpnv9gx8m/image/upload/v172.../aquanova/forms/abc123.jpg"
 *                         imagen_public_id: "aquanova/forms/abc123"
 *                       is_active: true
 *                       created_by: "Admin User"
 *                       created_at: "2026-01-10T10:00:00.000Z"
 *                       neighborhoods:
 *                         - id: "uuid-nei-1"
 *                           name: "Barrio Centro"
 *                           code: "CEN-01"
 *                           parent_id: null
 *                       share_link: "http://localhost:5173/formulario/censo-barrial-8392?ref=EAL34TM"
 *               SinImagen:
 *                 summary: Formulario sin imagen de portada
 *                 value:
 *                   ok: true
 *                   forms:
 *                     - id: "uuid-form-2"
 *                       key: "encuesta-agua-1234"
 *                       title: "Encuesta Agua"
 *                       description: "Sin imagen ni publicaciones activas"
 *                       metadata: null
 *                       is_active: false
 *                       created_by: "Admin User"
 *                       created_at: "2026-01-05T08:00:00.000Z"
 *                       neighborhoods: []
 *                       share_link: "http://localhost:5173/formulario/encuesta-agua-1234?ref=EAL34TM"
 *       500:
 *         description: Error al listar formularios
 */
// Listar (Todos los roles)
router.get('/', getForms);

/**
 * @swagger
 * /forms/search:
 *   get:
 *     summary: Buscar formularios por título, descripción o barrio (query param)
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Término de búsqueda (búsqueda parcial en título, descripción o nombre del barrio)
 *     responses:
 *       200:
 *         description: Lista de formularios que coinciden con la búsqueda, incluyendo imagen de portada (Cloudinary)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 forms:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                       key:
 *                         type: string
 *                       title:
 *                         type: string
 *                       description:
 *                         type: string
 *                       metadata:
 *                         type: object
 *                         nullable: true
 *                         description: Datos extra del formulario. Incluye imagen de portada alojada en Cloudinary.
 *                         properties:
 *                           imagen:
 *                             type: string
 *                             description: URL pública de la imagen de portada en Cloudinary
 *                           imagen_public_id:
 *                             type: string
 *                             description: ID interno de Cloudinary
 *                       is_active:
 *                         type: boolean
 *                       created_by:
 *                         type: string
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *                       neighborhoods:
 *                         type: array
 *                         description: Barrios asociados al formulario
 *                         items:
 *                           type: object
 *                           properties:
 *                             id:
 *                               type: string
 *                             name:
 *                               type: string
 *                             code:
 *                               type: string
 *                             parent_id:
 *                               type: string
 *                               nullable: true
 *                             metadata:
 *                               type: object
 *                               nullable: true
 *                             created_at:
 *                               type: string
 *                               format: date-time
 *                       share_link:
 *                         type: string
 *                         description: Link de invitación listo para compartir con el código de referido del usuario autenticado.
 *                         example: "http://localhost:5173/formulario/censo-2026-5555?ref=EAL34TM"
 *             examples:
 *               default:
 *                 value:
 *                   ok: true
 *                   forms:
 *                     - id: "uuid-form-example"
 *                       key: "censo-2026-5555"
 *                       title: "Censo 2026"
 *                       description: "Formulario para recolección de datos demográficos"
 *                       metadata:
 *                         imagen: "https://res.cloudinary.com/dpnv9gx8m/image/upload/v172.../aquanova/forms/xyz.jpg"
 *                         imagen_public_id: "aquanova/forms/xyz"
 *                       is_active: true
 *                       created_by: "Admin User"
 *                       created_at: "2026-01-14T12:00:00.000Z"
 *                       neighborhoods:
 *                         - id: "uuid-nei-1"
 *                           name: "Barrio Los Pinos"
 *                           code: "LPN-01"
 *                           parent_id: null
 *                           metadata: null
 *                           created_at: "2026-01-10T10:00:00.000Z"
 *                       share_link: "http://localhost:5173/formulario/censo-2026-5555?ref=EAL34TM"
 *       400:
 *         description: No se envió el parámetro de búsqueda (query)
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
 *                   example: 'Debe enviar un parámetro de búsqueda "query"'
 *       500:
 *         description: Error interno del servidor
 */
router.get('/search', searchForms);

/**
 * @swagger
 * /forms/{id}:
 *   get:
 *     summary: Obtener detalle de un formulario
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del formulario
 *     responses:
 *       200:
 *         description: Detalle completo del formulario incluyendo imagen de portada (Cloudinary) y esquema de preguntas de la última versión
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     key:
 *                       type: string
 *                     is_active:
 *                       type: boolean
 *                     created_at:
 *                       type: string
 *                       format: date-time
 *                     neighborhood_id:
 *                       type: string
 *                       nullable: true
 *                     metadata:
 *                       type: object
 *                       nullable: true
 *                       description: Datos extra del formulario. Incluye imagen de portada alojada en Cloudinary.
 *                       properties:
 *                         imagen:
 *                           type: string
 *                           description: URL pública de la imagen de portada en Cloudinary
 *                         imagen_public_id:
 *                           type: string
 *                           description: ID interno de Cloudinary (usado para reemplazar o eliminar la imagen)
 *                     version:
 *                       type: integer
 *                       description: Número de la versión activa del esquema
 *                     schema:
 *                       type: array
 *                       description: Definición de preguntas del formulario (última versión)
 *                       items:
 *                         type: object
 *                         properties:
 *                           type:
 *                             type: string
 *                             description: Tipo de campo (text, number, select, etc.)
 *                           label:
 *                             type: string
 *                           name:
 *                             type: string
 *                     share_link:
 *                       type: string
 *                       description: Link de invitación listo para compartir. Incluye el código de referido del usuario autenticado. El destinatario que llene el formulario y luego se registre otorgará puntos al remitente.
 *                       example: "http://localhost:5173/formulario/censo-barrial-2026-8392?ref=EAL34TM"
 *             examples:
 *               default:
 *                 value:
 *                   ok: true
 *                   data:
 *                     id: "uuid-form-1"
 *                     title: "Censo Barrial 2026"
 *                     description: "Formulario para registro de habitantes"
 *                     key: "censo-barrial-2026-8392"
 *                     is_active: true
 *                     created_at: "2026-01-10T10:00:00.000Z"
 *                     neighborhood_id: "uuid-nei-1"
 *                     metadata:
 *                       imagen: "https://res.cloudinary.com/dpnv9gx8m/image/upload/v172.../aquanova/forms/abc.jpg"
 *                       imagen_public_id: "aquanova/forms/abc"
 *                     version: 2
 *                     schema:
 *                       - type: "text"
 *                         label: "Nombre del encuestado"
 *                         name: "nombre"
 *                       - type: "number"
 *                         label: "Número de habitantes"
 *                         name: "habitantes"
 *                     share_link: "http://localhost:5173/formulario/censo-barrial-2026-8392?ref=EAL34TM"
 *       404:
 *         description: Formulario no encontrado
 *       500:
 *         description: Error interno del servidor
 */
router.get('/:id', getFormDetail);

/**
 * @swagger
 * /forms/{id}:
 *   put:
 *     summary: Actualizar un formulario (datos básicos, imagen de portada o esquema de preguntas)
 *     description: |
 *       Acepta `multipart/form-data` para permitir la subida de imagen de portada a Cloudinary.
 *       Los campos de texto (`title`, `description`, `is_active`, `schema`, `neighborhood_id`, `metadata`)
 *       se envían como campos de texto dentro del mismo form-data.
 *       Si se envía un archivo en el campo `imagen`, la imagen anterior es eliminada de Cloudinary
 *       y reemplazada por la nueva. Se puede actualizar cualquier combinación de campos.
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del formulario a actualizar
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             properties:
 *               imagen:
 *                 type: string
 *                 format: binary
 *                 description: Imagen de portada del formulario (JPEG, PNG, WebP, AVIF, GIF, SVG — máx. 10 MB). Reemplaza la imagen anterior en Cloudinary.
 *               title:
 *                 type: string
 *                 description: Nuevo título del formulario
 *               description:
 *                 type: string
 *                 description: Nueva descripción del formulario
 *               is_active:
 *                 type: boolean
 *                 description: Cambia el estado activo/inactivo del formulario
 *               schema:
 *                 type: string
 *                 description: JSON stringificado del array de preguntas. Si se envía, crea una nueva versión del formulario.
 *                 example: '[{"type":"text","label":"Nombre","name":"nombre"}]'
 *               neighborhood_id:
 *                 type: string
 *                 description: ID del nuevo barrio al que se reasignarán las publicaciones activas
 *               metadata:
 *                 type: string
 *                 description: JSON stringificado con datos extra (se fusiona con la imagen si se sube archivo)
 *                 example: '{"descripcion":"Formulario de censo 2026"}'
 *     responses:
 *       200:
 *         description: Formulario actualizado (nueva versión creada si se envió schema)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     title:
 *                       type: string
 *                     description:
 *                       type: string
 *                     metadata:
 *                       type: object
 *                       nullable: true
 *                       properties:
 *                         imagen:
 *                           type: string
 *                           description: URL nueva de la imagen en Cloudinary (si se subió)
 *                         imagen_public_id:
 *                           type: string
 *                     version:
 *                       type: integer
 *                       description: Número de la nueva versión (si se actualizó schema)
 *                     neighborhood_id:
 *                       type: string
 *                       description: ID del nuevo barrio (si se actualizó)
 *                     publications_updated:
 *                       type: integer
 *                       description: Publicaciones actualizadas con el nuevo barrio
 *             examples:
 *               SoloImagen:
 *                 summary: Reemplazar solo la imagen de portada
 *                 value:
 *                   ok: true
 *                   message: "Formulario actualizado exitosamente"
 *                   data:
 *                     id: "uuid-form-1"
 *                     metadata:
 *                       imagen: "https://res.cloudinary.com/dpnv9gx8m/image/upload/v172.../aquanova/forms/nuevaimagen.jpg"
 *                       imagen_public_id: "aquanova/forms/nuevaimagen"
 *               DatosYEsquema:
 *                 summary: Actualizar título, descripción y esquema (genera versión)
 *                 value:
 *                   ok: true
 *                   message: "Formulario actualizado exitosamente y nueva versión 3 creada"
 *                   data:
 *                     id: "uuid-form-1"
 *                     title: "Censo Barrial 2026 V3"
 *                     version: 3
 *       400:
 *         description: No se envió ningún campo o datos inválidos
 *       404:
 *         description: Formulario o barrio no encontrado
 *       500:
 *         description: Error interno
 */
router.put('/:id', authorize([1]), upload.single('imagen'), updateForm);

/**
 * @swagger
 * /forms/{id}:
 *   delete:
 *     summary: Desactivar (soft delete) un formulario
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del formulario a desactivar
 *     responses:
 *       200:
 *         description: Formulario desactivado exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 message:
 *                   type: string
 *             examples:
 *               default:
 *                 value:
 *                   ok: true
 *                   message: "Formulario desactivado exitosamente"
 *       404:
 *         description: Formulario no encontrado
 *       500:
 *         description: Error interno al desactivar formulario
 */
router.delete('/:id', authorize([1]), deleteForm);

/**
 * @swagger
 * /forms:
 *   post:
 *     summary: Crear un nuevo formulario ligado a un barrio
 *     description: |
 *       Acepta `multipart/form-data` para permitir la subida de imagen de portada a Cloudinary en el momento de la creación.
 *       Los campos de texto (`title`, `description`, `schema`, `neighborhood_id`, `metadata`) se envían
 *       como campos de texto dentro del mismo form-data. `schema` debe ser un JSON stringificado.
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - schema
 *               - neighborhood_id
 *             properties:
 *               imagen:
 *                 type: string
 *                 format: binary
 *                 description: Imagen de portada del formulario (JPEG, PNG, WebP, AVIF, GIF, SVG — máx. 10 MB). Opcional.
 *               title:
 *                 type: string
 *                 description: Título del formulario (requerido)
 *               description:
 *                 type: string
 *                 description: Descripción del formulario (opcional)
 *               neighborhood_id:
 *                 type: string
 *                 description: ID del barrio donde se publicará el formulario (requerido)
 *               schema:
 *                 type: string
 *                 description: JSON stringificado del array de preguntas (requerido)
 *                 example: '[{"type":"text","label":"Nombre del encuestado","name":"nombre"},{"type":"number","label":"Número de habitantes","name":"habitantes"}]'
 *               metadata:
 *                 type: string
 *                 description: JSON stringificado con datos extra del formulario (opcional)
 *                 example: '{"descripcion":"Formulario oficial 2026"}'
 *     responses:
 *       201:
 *         description: Formulario y Versión 1 creados exitosamente
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 message:
 *                   type: string
 *                 data:
 *                   type: object
 *                   properties:
 *                     id:
 *                       type: string
 *                     key:
 *                       type: string
 *                     title:
 *                       type: string
 *                     neighborhood_id:
 *                       type: string
 *             examples:
 *               SinImagen:
 *                 summary: Formulario creado sin imagen
 *                 value:
 *                   ok: true
 *                   message: "Formulario y Versión 1 creados exitosamente"
 *                   data:
 *                     id: "uuid-form-nuevo"
 *                     key: "censo-barrial-2026-4523"
 *                     title: "Censo Barrial 2026"
 *                     neighborhood_id: "uuid-nei-1"
 *               ConImagen:
 *                 summary: Formulario creado con imagen de portada subida a Cloudinary
 *                 value:
 *                   ok: true
 *                   message: "Formulario y Versión 1 creados exitosamente"
 *                   data:
 *                     id: "uuid-form-nuevo"
 *                     key: "encuesta-servicios-7891"
 *                     title: "Encuesta Servicios 2026"
 *                     neighborhood_id: "uuid-nei-2"
 *       400:
 *         description: Faltan campos requeridos (title, schema o neighborhood_id) o el barrio no existe
 *       404:
 *         description: El barrio especificado no existe
 *       500:
 *         description: Error interno al crear formulario
 */
// Crear (Solo Admin - Rol ID 1)
router.post('/', authorize([1]), upload.single('imagen'), createForm);

module.exports = router;