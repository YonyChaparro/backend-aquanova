// src/middlewares/uploadMiddleware.js
const multer = require('multer');

// Almacenamiento en memoria (buffer) para luego subir a Cloudinary
const storage = multer.memoryStorage();

// Filtro: solo imágenes
const fileFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'image/jpeg',
        'image/png',
        'image/webp',
        'image/avif',
        'image/gif',
        'image/svg+xml'
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}. Solo se permiten imágenes (JPEG, PNG, WebP, AVIF, GIF, SVG).`), false);
    }
};

const upload = multer({
    storage,
    fileFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10 MB máximo por imagen
    }
});

module.exports = upload;
