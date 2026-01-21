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
 *     summary: Listar todos los barrios
 *     tags: [Neighborhoods]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de barrios disponibles
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
 *                       name:
 *                         type: string
 *                       code:
 *                         type: string
 *                       parent_id:
 *                         type: string
 *                         nullable: true
 *                       metadata:
 *                         type: object
 *                         nullable: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
	*             examples:
	*               default:
	*                 value:
	*                   ok: true
	*                   neighborhoods:
	*                     - id: "uuid-barrio-1"
	*                       name: "Barrio Centro"
	*                       code: "CENTRO-001"
	*                       parent_id: null
	*                       metadata: { poblacion: 12000 }
	*                       created_at: "2026-01-10T10:00:00.000Z"
	*                     - id: "uuid-barrio-2"
	*                       name: "Barrio Norte"
	*                       code: "NORTE-002"
	*                       parent_id: "uuid-barrio-1"
	*                       metadata: null
	*                       created_at: "2026-01-10T11:00:00.000Z"
	*       500:
	*         description: Error al listar barrios
 */
router.get('/', getNeighborhoods);

/**
 * @swagger
 * /neighborhoods/search:
 *   get:
 *     summary: Buscar barrios por nombre o código
 *     tags: [Neighborhoods]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: query
 *         required: true
 *         schema:
 *           type: string
 *         description: Término de búsqueda (nombre o código)
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
 *                       name:
 *                         type: string
 *                       code:
 *                         type: string
 *                       parent_id:
 *                         type: string
 *                         nullable: true
 *                       metadata:
 *                         type: object
 *                         nullable: true
 *                       created_at:
 *                         type: string
 *                         format: date-time
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
 *         name:
 *           type: string
 *         code:
 *           type: string
 *         type:
 *           type: string
 *           description: "Tipo calculado: 'Ciudad', 'Localidad', 'Barrio' u 'Otro'"
 *         parent_id:
 *           type: string
 *           nullable: true
 *         metadata:
 *           type: object
 *           nullable: true
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
 *                     metadata: null
 *                     parent:
 *                       id: "uuid-localidad"
 *                       name: "Localidad Norte"
 *                       code: "LOC-N"
 *                       type: "Localidad"
 *                       parent_id: "uuid-ciudad"
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
