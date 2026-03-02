// src/routes/neighborhoodRoutes.js
const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/roleMiddleware');
const upload = require('../middlewares/uploadMiddleware');
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
 *                         description: Datos adicionales. Tanto localidades como barrios incluyen imagen (Cloudinary) y descripción específica del lugar.
 *                         properties:
 *                           imagen:
 *                             type: string
 *                             format: uri
 *                             description: URL de imagen almacenada en Cloudinary (res.cloudinary.com)
 *                           descripcion:
 *                             type: string
 *                             description: Descripción específica y contextualizada del barrio o localidad
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
 *                       metadata:
 *                         imagen: "https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772338453/Avenida_de_Las_Americas_mavlpn.jpg"
 *                         descripcion: "La localidad más poblada de Bogotá, fundada con apoyo del presidente estadounidense John F. Kennedy."
 *                       created_at: "2026-02-22T10:00:00.000Z"
 *                     - id: "uuid-barrio-1"
 *                       name: "Américas"
 *                       code: "BAR-0802"
 *                       parent_id: "uuid-localidad-1"
 *                       parent_name: "Kennedy"
 *                       is_active: true
 *                       metadata:
 *                         imagen: "https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772338587/Americas_bogota_qwi3ts.jpg"
 *                         descripcion: "Sector residencial y comercial sobre la Avenida de las Américas. Zona de centros comerciales y restaurantes."
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
 *                         description: Datos adicionales. Tanto localidades como barrios incluyen imagen (Cloudinary) y descripción específica del lugar.
 *                         properties:
 *                           imagen:
 *                             type: string
 *                             format: uri
 *                             description: URL de imagen almacenada en Cloudinary (res.cloudinary.com)
 *                           descripcion:
 *                             type: string
 *                             description: Descripción específica y contextualizada del barrio o localidad
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
 *                         imagen: "https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772334412/bogota-cedritos-hero_ukrcgl.png"
 *                         descripcion: "Barrio residencial de clase media-alta con alta densidad de apartamentos modernos. Conocido por su activa vida nocturna en la zona de bares y restaurantes sobre la calle 140."
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
 *           description: Datos adicionales. Tanto localidades como barrios contienen imagen (Cloudinary) y descripción específica del lugar.
 *           properties:
 *             imagen:
 *               type: string
 *               format: uri
 *               description: URL de imagen almacenada en Cloudinary (res.cloudinary.com)
 *             descripcion:
 *               type: string
 *               description: Descripción específica y contextualizada del barrio o localidad
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
 *                       imagen: "https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772345067/hospital-sjdd_dbdjg6.jpg"
 *                       descripcion: "Corregimiento rural en el corazón del páramo de Sumapaz. Comunidad campesina dedicada a la agricultura."
 *                     parent:
 *                       id: "uuid-localidad"
 *                       name: "Usaquén"
 *                       code: "LOC-01"
 *                       type: "Localidad"
 *                       parent_id: "uuid-ciudad"
 *                       is_active: true
 *                       metadata:
 *                         imagen: "https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772333719/descarga_dq3qip.jpg"
 *                         descripcion: "Localidad del norte de Bogotá con ambiente histórico y colonial."
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
 *     summary: Crear un nuevo barrio (con imagen opcional via Cloudinary)
 *     description: |
 *       Crea un nuevo barrio/localidad/ciudad. Acepta `multipart/form-data` para subir imagen
 *       directamente a Cloudinary, o `application/json` para enviar solo datos de texto.
 *
 *       **Con imagen**: Enviar como `multipart/form-data`:
 *       - `name` (text) — Nombre del barrio (requerido)
 *       - `code` (text) — Código único (requerido)
 *       - `parent_id` (text) — ID del padre (opcional)
 *       - `metadata` (text) — JSON string con datos adicionales (opcional, ej: `{"descripcion": "..."}`)
 *       - `imagen` (file) — Archivo de imagen (JPEG, PNG, WebP, AVIF, GIF, SVG; máx. 10MB)
 *
 *       **Sin imagen**: Enviar como `application/json` con los campos name, code, parent_id y metadata.
 *       En este caso, metadata.imagen puede contener una URL directa.
 *     tags: [Neighborhoods]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - code
 *             properties:
 *               name:
 *                 type: string
 *                 description: Nombre del barrio (requerido)
 *                 example: "Cedritos"
 *               code:
 *                 type: string
 *                 description: Código único del barrio, catastral o interno (requerido)
 *                 example: "BAR-0105"
 *               parent_id:
 *                 type: string
 *                 description: ID del barrio padre (opcional, para jerarquías)
 *                 example: "uuid-localidad-01"
 *               metadata:
 *                 type: string
 *                 description: JSON string con datos adicionales como descripción, estrato, etc.
 *                 example: '{"descripcion": "Barrio residencial de clase media-alta"}'
 *               imagen:
 *                 type: string
 *                 format: binary
 *                 description: Archivo de imagen para el barrio (JPEG, PNG, WebP, AVIF, GIF, SVG - máx. 10MB). Se sube automáticamente a Cloudinary.
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
 *                 description: Código único del barrio (requerido)
 *               parent_id:
 *                 type: string
 *                 description: ID del barrio padre (opcional)
 *               metadata:
 *                 type: object
 *                 description: Datos adicionales como población estimada, estrato, imagen URL, etc.
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
 *                       properties:
 *                         imagen:
 *                           type: string
 *                           format: uri
 *                           description: URL de la imagen en Cloudinary
 *                         imagen_public_id:
 *                           type: string
 *                           description: Public ID de la imagen en Cloudinary (para gestión interna)
 *                         descripcion:
 *                           type: string
 *             examples:
 *               conImagen:
 *                 summary: Barrio creado con imagen subida a Cloudinary
 *                 value:
 *                   ok: true
 *                   message: "Barrio creado exitosamente"
 *                   data:
 *                     id: "uuid-barrio-nuevo"
 *                     name: "Cedritos"
 *                     code: "BAR-0105"
 *                     parent_id: "uuid-localidad-01"
 *                     metadata:
 *                       descripcion: "Barrio residencial de clase media-alta"
 *                       imagen: "https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772334412/aquanova/neighborhoods/cedritos_abc123.png"
 *                       imagen_public_id: "aquanova/neighborhoods/cedritos_abc123"
 *               sinImagen:
 *                 summary: Barrio creado sin imagen
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
router.post('/', authorize([1]), upload.single('imagen'), createNeighborhood);

/**
 * @swagger
 * /neighborhoods/{id}:
 *   put:
 *     summary: Actualizar un barrio existente (con imagen opcional via Cloudinary)
 *     description: |
 *       Actualiza un barrio existente. Acepta `multipart/form-data` para subir/reemplazar imagen
 *       en Cloudinary, o `application/json` para actualizar solo datos de texto.
 *
 *       Si se sube una nueva imagen, la imagen anterior se elimina automáticamente de Cloudinary.
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
 *         multipart/form-data:
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
 *                 type: string
 *                 description: JSON string con nuevos datos adicionales
 *               imagen:
 *                 type: string
 *                 format: binary
 *                 description: Nueva imagen para el barrio. La anterior se elimina de Cloudinary automáticamente.
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
 *                       properties:
 *                         imagen:
 *                           type: string
 *                           format: uri
 *                         imagen_public_id:
 *                           type: string
 *                         descripcion:
 *                           type: string
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
 *                     metadata:
 *                       imagen: "https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772334412/aquanova/neighborhoods/centro_xyz789.jpg"
 *                       imagen_public_id: "aquanova/neighborhoods/centro_xyz789"
 *                       descripcion: "Barrio céntrico renovado"
 *       400:
 *         description: Datos inválidos o código duplicado
 *       404:
 *         description: Barrio no encontrado o padre no existe
 *       500:
 *         description: Error interno al actualizar barrio
 */
router.put('/:id', authorize([1]), upload.single('imagen'), updateNeighborhood);

/**
 * @swagger
 * /neighborhoods/{id}:
 *   delete:
 *     summary: Eliminar un barrio (elimina imagen de Cloudinary)
 *     description: |
 *       Elimina un barrio y su imagen asociada de Cloudinary. No se puede eliminar un barrio
 *       que tenga sub-barrios asociados.
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
