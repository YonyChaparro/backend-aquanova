// src/routes/uploadRoutes.js
const express = require('express');
const router = express.Router();
const multer = require('multer');
const cloudinary = require('../config/cloudinary');

// Multer en memoria — sin filtro de tipo para aceptar imagen y video
const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 20 * 1024 * 1024 }, // 20 MB
});

/**
 * Sube un buffer a Cloudinary y devuelve { url, public_id, resource_type }.
 */
const uploadToCloudinary = (buffer, options) => {
    return new Promise((resolve, reject) => {
        const stream = cloudinary.uploader.upload_stream(options, (error, result) => {
            if (error) return reject(error);
            resolve(result);
        });
        stream.end(buffer);
    });
};

/**
 * POST /api/upload/image
 * Campo multipart: "image" (File)
 * Campo form:      "folder" (string, opcional)
 */
router.post('/image', upload.single('image'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ ok: false, message: 'No se recibió ningún archivo.' });
        }

        const folder = req.body.folder || 'aquanova/submissions';

        const result = await uploadToCloudinary(req.file.buffer, {
            folder,
            resource_type: 'image',
            transformation: [{ quality: 'auto', fetch_format: 'auto' }],
        });

        res.json({
            ok: true,
            url: result.secure_url,
            public_id: result.public_id,
            resource_type: 'image',
        });
    } catch (error) {
        console.error('Error subiendo imagen a Cloudinary:', error);
        res.status(500).json({ ok: false, message: 'No se pudo subir la imagen.' });
    }
});

/**
 * POST /api/upload/video
 * Campo multipart: "video" (File)
 * Campo form:      "folder" (string, opcional)
 */
router.post('/video', upload.single('video'), async (req, res) => {
    try {
        if (!req.file) {
            return res.status(400).json({ ok: false, message: 'No se recibió ningún archivo.' });
        }

        const folder = req.body.folder || 'aquanova/submissions';

        const result = await uploadToCloudinary(req.file.buffer, {
            folder,
            resource_type: 'video',
        });

        res.json({
            ok: true,
            url: result.secure_url,
            public_id: result.public_id,
            resource_type: 'video',
        });
    } catch (error) {
        console.error('Error subiendo video a Cloudinary:', error);
        res.status(500).json({ ok: false, message: 'No se pudo subir el video.' });
    }
});

module.exports = router;
