// src/routes/neighborhoodRoutes.js
const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/roleMiddleware');
const { createNeighborhood, getNeighborhoods, getNeighborhoodDetail, searchNeighborhoods, updateNeighborhood, deleteNeighborhood } = require('../controllers/neighborhoodController');

router.use(verifyToken);

/**
 * @swagger
 * /neighborhoods:
 *   get:
 *     summary: Listar todos los barrios y localidades
 *     description: Retorna todos los registros de la tabla neighborhoods ordenados por localidad y luego por nombre. Incluye el nombre del padre (localidad) y el estado activo/inactivo de cada registro.
 *     tags: [Neighborhoods]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de barrios/localidades disponibles
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 neighborhoods:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       code:
 *                         type: string
 *                       parent_id:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                         description: ID de la localidad o nodo padre al que pertenece
 *                       parent_name:
 *                         type: string
 *                         nullable: true
 *                         description: Nombre del nodo padre (localidad). Null si es raíz.
 *                       is_active:
 *                         type: boolean
 *                         description: Indica si el barrio/localidad está activo en el sistema
 *                       metadata:
 *                         type: object
 *                         nullable: true
 *                         description: Datos adicionales del barrio. Los barrios incluyen imagen y descripción genérica.
 *                         properties:
 *                           imagen:
 *                             type: string
 *                             format: uri
 *                             description: URL de imagen representativa del barrio
 *                           descripcion:
 *                             type: string
 *                             description: Descripción genérica del barrio
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *             examples:
 *               default:
 *                 value:
 *                   ok: true
 *                   neighborhoods:
 *                     - id: "uuid-localidad-1"
 *                       name: "Kennedy"
 *                       code: "LOC-08"
 *                       parent_id: null
 *                       parent_name: null
 *                       is_active: true
 *                       metadata: null
 *                       created_at: "2026-02-22T10:00:00.000Z"
 *                     - id: "uuid-barrio-1"
 *                       name: "Américas"
 *                       code: "BAR-0802"
 *                       parent_id: "uuid-localidad-1"
 *                       parent_name: "Kennedy"
 *                       is_active: true
 *                       metadata:
 *                         imagen: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80"
 *                         descripcion: "Barrio residencial con amplia oferta de servicios comunitarios, parques y vías pavimentadas."
 *                       created_at: "2026-02-22T10:00:00.000Z"
 *       500:
 *         description: Error al listar barrios
 */
router.get('/', getNeighborhoods);

/**
 * @swagger
 * /neighborhoods/search:
 *   get:
 *     summary: Buscar barrios por nombre o código
 *     description: Búsqueda por coincidencia parcial en nombre o código. Los resultados incluyen el nombre del padre y el estado activo/inactivo.
 *     tags: [Neighborhoods]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Término de búsqueda (nombre o código del barrio/localidad)
 *     responses:
 *       200:
 *         description: Lista de barrios encontrados
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 neighborhoods:
 *                   type: array
 *                   items:
 *                     type: object
 *                     properties:
 *                       id:
 *                         type: string
 *                         format: uuid
 *                       name:
 *                         type: string
 *                       code:
 *                         type: string
 *                       parent_id:
 *                         type: string
 *                         format: uuid
 *                         nullable: true
 *                       parent_name:
 *                         type: string
 *                         nullable: true
 *                         description: Nombre del nodo padre. Null si es raíz.
 *                       is_active:
 *                         type: boolean
 *                         description: Indica si el barrio/localidad está activo
 *                       metadata:
 *                         type: object
 *                         nullable: true
 *                         description: Datos adicionales del barrio. Los barrios incluyen imagen y descripción genérica.
 *                         properties:
 *                           imagen:
 *                             type: string
 *                             format: uri
 *                             description: URL de imagen representativa del barrio
 *                           descripcion:
 *                             type: string
 *                             description: Descripción genérica del barrio
 *                       created_at:
 *                         type: string
 *                         format: date-time
 *             examples:
 *               default:
 *                 value:
 *                   ok: true
 *                   neighborhoods:
 *                     - id: "uuid-barrio-0105"
 *                       name: "Cedritos"
 *                       code: "BAR-0105"
 *                       parent_id: "uuid-localidad-01"
 *                       parent_name: "Usaquén"
 *                       is_active: true
 *                       metadata:
 *                         imagen: "https://images.unsplash.com/photo-1564769662533-4f00a87b4056?auto=format&fit=crop&w=600&q=80"
 *                         descripcion: "Zona residencial de estrato medio con calles arboladas, plazoletas y una activa vida comercial en su eje principal."
 *                       created_at: "2026-02-22T10:00:00.000Z"
 *       400:
 *         description: Falta parámetro query
 *       500:
 *         description: Error en el servidor
 */
router.get('/search', searchNeighborhoods);

/**
 * @swagger
 * components:
 *   schemas:
 *     NeighborhoodNode:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         name:
 *           type: string
 *         code:
 *           type: string
 *         type:
 *           type: string
 *           description: "Tipo calculado: 'Ciudad', 'Localidad', 'Barrio' u 'Otro'"
 *         parent_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         parent_name:
 *           type: string
 *           nullable: true
 *           description: Nombre del nodo padre. Null si es raíz.
 *         is_active:
 *           type: boolean
 *           description: Indica si el barrio/localidad está activo en el sistema
 *         metadata:
 *           type: object
 *           nullable: true
 *           description: Datos adicionales. Los barrios contienen imagen y descripción genérica.
 *           properties:
 *             imagen:
 *               type: string
 *               format: uri
 *               description: URL de imagen representativa del barrio
 *             descripcion:
 *               type: string
 *               description: Descripción genérica del barrio
 *         parent:
 *           $ref: '#/components/schemas/NeighborhoodNode'
 *           description: "Objeto padre (recursivo)"
 */

/**
 * @swagger
 * /neighborhoods/{id}:
 *   get:
 *     summary: Obtener detalle de un barrio (con jerarquía recursiva)
 *     tags: [Neighborhoods]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del barrio
 *     responses:
 *       200:
 *         description: Detalle del barrio incluyendo su jerarquía completa
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 ok:
 *                   type: boolean
 *                 data:
 *                   $ref: '#/components/schemas/NeighborhoodNode'
 *             examples:
 *               JerarquiaCompleta:
 *                 value:
 *                   ok: true
 *                   data:
 *                     id: "uuid-barrio"
 *                     name: "Barrio San Juan"
 *                     code: "BSJ-01"
 *                     type: "Barrio"
 *                     parent_id: "uuid-localidad"
 *                     is_active: true
 *                     metadata:
 *                       imagen: "https://images.unsplash.com/photo-1558618666-fcd25c85cd64?auto=format&fit=crop&w=600&q=80"
 *                       descripcion: "Barrio tradicional bogotano con historia y cultura propias."
 *                     parent:
 *                       id: "uuid-localidad"
 *                       name: "Localidad Norte"
 *                       code: "LOC-N"
 *                       type: "Localidad"
 *                       parent_id: "uuid-ciudad"
 *                       is_active: true
 *                       metadata: null
 *                       parent:
 *                         id: "uuid-ciudad"
 *                         name: "Ciudad Capital"
 *                         code: "CAP-01"
 *                         type: "Ciudad"
 *                         parent_id: null
 *                         parent: null
 *       404:
 *         description: Barrio no encontrado
 */
router.get('/:id', getNeighborhoodDetail);

/**
 * @swagger
 * /neighborhoods:
 *   post:
 *     summary: Crear un nuevo barrio
 *     tags: [Neighborhoods]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - code
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nombre del barrio (requerido)
 *               code:
 *                 type: string
 *                 description: Código único del barrio, catastral o interno (requerido)
 *               parent_id:
 *                 type: string
 *                 description: ID del barrio padre (opcional, para jerarquías)
 *               metadata:
 *                 type: object
 *                 description: Datos adicionales como población estimada, estrato, etc. (opcional)
 *     responses:
 *       201:
 *         description: Barrio creado exitosamente
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
 *                     name:
 *                       type: string
 *                     code:
 *                       type: string
 *                     parent_id:
 *                       type: string
 *                     metadata:
 *                       type: object
	*             examples:
	*               default:
	*                 value:
	*                   ok: true
	*                   message: "Barrio creado exitosamente"
	*                   data:
	*                     id: "uuid-barrio-3"
	*                     name: "Barrio Sur"
	*                     code: "SUR-003"
	*                     parent_id: null
	*                     metadata: { estrato: 3 }
 *       400:
 *         description: Faltan datos requeridos o el código ya existe
 *       404:
 *         description: El barrio padre especificado no existe
	*       500:
	*         description: Error interno al crear barrio
 */
router.post('/', authorize([1]), createNeighborhood);

/**
 * @swagger
 * /neighborhoods/{id}:
 *   put:
 *     summary: Actualizar un barrio existente
 *     tags: [Neighborhoods]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del barrio a actualizar
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nuevo nombre del barrio
 *               code:
 *                 type: string
 *                 description: Nuevo código único del barrio
 *               parent_id:
 *                 type: string
 *                 nullable: true
 *                 description: Nuevo ID del barrio padre (null para quitar padre)
 *               metadata:
 *                 type: object
 *                 nullable: true
 *                 description: Nuevos datos adicionales
 *     responses:
 *       200:
 *         description: Barrio actualizado exitosamente
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
 *                     name:
 *                       type: string
 *                     code:
 *                       type: string
 *                     parent_id:
 *                       type: string
 *                       nullable: true
 *                     metadata:
 *                       type: object
 *                       nullable: true
 *             examples:
 *               default:
 *                 value:
 *                   ok: true
 *                   message: "Barrio actualizado exitosamente"
 *                   data:
 *                     id: "uuid-barrio-1"
 *                     name: "Barrio Centro Actualizado"
 *                     code: "CENTRO-001"
 *                     parent_id: null
 *                     metadata: { poblacion: 15000 }
 *       400:
 *         description: Datos inválidos o código duplicado
 *       404:
 *         description: Barrio no encontrado o padre no existe
 *       500:
 *         description: Error interno al actualizar barrio
 */
router.put('/:id', authorize([1]), updateNeighborhood);

/**
 * @swagger
 * /neighborhoods/{id}:
 *   delete:
 *     summary: Eliminar un barrio
 *     tags: [Neighborhoods]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *         description: ID del barrio a eliminar
 *     responses:
 *       200:
 *         description: Barrio eliminado exitosamente
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
 *                     name:
 *                       type: string
 *                     code:
 *                       type: string
 *             examples:
 *               default:
 *                 value:
 *                   ok: true
 *                   message: "Barrio eliminado exitosamente"
 *                   data:
 *                     id: "uuid-barrio-1"
 *                     name: "Barrio Centro"
 *                     code: "CENTRO-001"
 *       400:
 *         description: No se puede eliminar porque tiene sub-barrios o está siendo utilizado
 *       404:
 *         description: Barrio no encontrado
 *       500:
 *         description: Error interno al eliminar barrio
 */
router.delete('/:id', authorize([1]), deleteNeighborhood);

module.exports = router;
