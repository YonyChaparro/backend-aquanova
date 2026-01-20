const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/roleMiddleware');
const { createForm, getForms, getFormDetail, updateForm, deleteForm, searchForms } = require('../controllers/formController');

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
 *         description: Lista de formularios disponibles con estado de activación y barrios relacionados
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
 *                         description: Barrios donde está publicado el formulario
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
 *         examples:
 *           default:
 *             value:
 *               ok: true
 *               forms:
 *                 - id: "uuid-form-1"
 *                   key: "censo-barrial-8392"
 *                   title: "Censo Barrial"
 *                   description: "Encuesta de barrio"
 *                   is_active: true
 *                   created_by: "Admin User"
 *                   created_at: "2026-01-10T10:00:00.000Z"
 *                   neighborhoods:
 *                     - id: "uuid-nei-1"
 *                       name: "Barrio Centro"
 *                       code: "CEN-01"
 *                       parent_id: null
 *                       metadata: null
 *                       created_at: "2026-01-10T10:00:00.000Z"
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
 *         description: Lista de formularios que coinciden con la búsqueda
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
 *             examples:
 *               default:
 *                 value:
 *                   ok: true
 *                   forms:
 *                     - id: "uuid-form-example"
 *                       key: "censo-2026-5555"
 *                       title: "Censo 2026"
 *                       description: "Formulario para recolección de datos demográficos"
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
 *         description: Detalle del formulario y su esquema
 *       404:
 *         description: Formulario no encontrado
 */
router.get('/:id', getFormDetail);

/**
 * @swagger
 * /forms/{id}:
 *   put:
 *     summary: Actualizar un formulario (datos básicos o esquema de preguntas)
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
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               title:
 *                 type: string
 *                 description: Nuevo título del formulario
 *               description:
 *                 type: string
 *               is_active:
 *                 type: boolean
 *                 description: Cambia el estado activo/inactivo del formulario
 *               schema:
 *                 type: array
 *                 description: Si se envía, crea una nueva versión con estas preguntas
 *                 items:
 *                   type: object
 *           examples:
 *             DatosBasicos:
 *               summary: Editar Título, Descripción y Estado
 *               value:
 *                 title: "Censo Barrial 2026 - Corregido"
 *                 description: "Actualización de la descripción: Encuesta enfocada en servicios públicos."
 *                 is_active: true
 *             SoloDescripcion:
 *               summary: Editar solo la descripción
 *               value:
 *                 description: "Nueva descripción detallada para el formulario."
 *             NuevasPreguntas:
 *               summary: Actualizar esquema de preguntas (Genera Versión)
 *               value:
 *                 schema:
 *                   - type: "text"
 *                     label: "¿Nombre del encuestado?"
 *                     name: "nombre_encuestado"
 *                   - type: "number"
 *                     label: "¿Cuántas personas viven aquí?"
 *                     name: "num_habitantes"
 *             TodoJunto:
 *               summary: Actualizar Todo (Datos + Preguntas)
 *               value:
 *                 title: "Encuesta Completa V2"
 *                 description: "Revisión total del formulario."
 *                 is_active: true
 *                 schema:
 *                   - type: "text"
 *                     label: "¿Observaciones?"
 *                     name: "obs"
 *     responses:
 *       200:
 *         description: Formulario actualizado (y nueva versión creada si se envió schema)
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
 *                     version:
 *                       type: integer
 *                       description: Número de la nueva versión (si se actualizó esquema)
 *       400:
 *         description: Datos inválidos o faltan campos
 *       404:
 *         description: Formulario no encontrado
 *       500:
 *         description: Error interno
 */
router.put('/:id', authorize([1]), updateForm);

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
 *     tags: [Forms]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - title
 *               - schema
 *               - neighborhood_id
 *             properties:
 *               title:
 *                 type: string
 *                 description: Título del formulario
 *               description:
 *                 type: string
 *                 description: Descripción del formulario (opcional)
 *               neighborhood_id:
 *                 type: string
 *                 description: ID del barrio donde se publicará el formulario (requerido)
 *               schema:
 *                 type: array
 *                 description: Estructura JSON del formulario con las preguntas
 *                 items:
 *                   type: object
 *     responses:
 *       201:
 *         description: Formulario creado exitosamente
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
 *       400:
 *         description: Faltan datos requeridos o el barrio no existe
 *       404:
 *         description: El barrio especificado no existe
 */
// Crear (Solo Admin - Rol ID 1)
router.post('/', authorize([1]), createForm);

module.exports = router;