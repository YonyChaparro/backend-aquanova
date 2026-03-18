// src/routes/uploadRoutes.js
const express = require('express');
const router = express.Router();
const { uploadImageToCloudinary, uploadVideoToCloudinary } = require('../controllers/uploadController');
const upload = require('../middlewares/uploadMiddleware');
const { uploadVideo } = require('../middlewares/uploadMiddleware');

/**
 * @swagger
 * tags:
 *   name: Upload
 *   description: Subida de archivos a Cloudinary
 */

/**
 * @swagger
 * /upload/image:
 *   post:
 *     summary: Subir una imagen a Cloudinary (público)
 *     description: |
 *       Endpoint público para subir una imagen a Cloudinary.
 *       No requiere autenticación y es usado por el formulario público.
 *     tags: [Upload]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - image
 *             properties:
 *               image:
 *                 type: string
 *                 format: binary
 *                 description: Archivo de imagen a subir (JPEG, PNG, WebP, AVIF, GIF, SVG)
 *               folder:
 *                 type: string
 *                 description: Carpeta destino en Cloudinary (default aquanova/submissions)
 *                 example: "aquanova/submissions"
 *     responses:
 *       200:
 *         description: Imagen subida exitosamente
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
 *                   example: "Imagen subida exitosamente"
 *                 url:
 *                   type: string
 *                   description: URL segura de la imagen en Cloudinary
 *                   example: "https://res.cloudinary.com/xxx/image/upload/v123/aquanova/submissions/abc123.jpg"
 *                 secure_url:
 *                   type: string
 *                   description: URL segura (alias de url)
 *                   example: "https://res.cloudinary.com/xxx/image/upload/v123/aquanova/submissions/abc123.jpg"
 *                 public_id:
 *                   type: string
 *                   description: ID público de Cloudinary
 *                   example: "aquanova/submissions/abc123"
 *       400:
 *         description: No se proporcionó ninguna imagen o el tipo de archivo no es válido
 *       500:
 *         description: Error al subir la imagen a Cloudinary
 */
router.post('/image', upload.single('image'), uploadImageToCloudinary);

/**
 * @swagger
 * /upload/video:
 *   post:
 *     summary: Subir un video a Cloudinary (público)
 *     description: |
 *       Endpoint público para subir un video a Cloudinary.
 *       No requiere autenticación y es usado por el formulario público.
 *       Tamaño máximo: 100MB
 *     tags: [Upload]
 *     requestBody:
 *       required: true
 *       content:
 *         multipart/form-data:
 *           schema:
 *             type: object
 *             required:
 *               - video
 *             properties:
 *               video:
 *                 type: string
 *                 format: binary
 *                 description: Archivo de video a subir (MP4, MOV, AVI, WebM, MPEG, MKV)
 *               folder:
 *                 type: string
 *                 description: Carpeta destino en Cloudinary (default aquanova/submissions)
 *                 example: "aquanova/submissions"
 *     responses:
 *       200:
 *         description: Video subido exitosamente
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
 *                   example: "Video subido exitosamente"
 *                 url:
 *                   type: string
 *                   description: URL segura del video en Cloudinary
 *                   example: "https://res.cloudinary.com/xxx/video/upload/v123/aquanova/submissions/abc123.mp4"
 *                 secure_url:
 *                   type: string
 *                   description: URL segura (alias de url)
 *                 public_id:
 *                   type: string
 *                   description: ID público de Cloudinary
 *                 resource_type:
 *                   type: string
 *                   example: "video"
 *       400:
 *         description: No se proporcionó ningún video o el tipo de archivo no es válido
 *       500:
 *         description: Error al subir el video a Cloudinary
 */
router.post('/video', uploadVideo.single('video'), uploadVideoToCloudinary);

module.exports = router;
