// src/middlewares/uploadMiddleware.js
const multer = require('multer');

// Almacenamiento en memoria (buffer) para luego subir a Cloudinary
const storage = multer.memoryStorage();

// Filtro: solo imágenes
const imageFilter = (req, file, cb) => {
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

// Filtro: solo videos
const videoFilter = (req, file, cb) => {
    const allowedMimeTypes = [
        'video/mp4',
        'video/quicktime',  // MOV
        'video/x-msvideo',  // AVI
        'video/webm',
        'video/mpeg',
        'video/3gpp',
        'video/x-matroska'  // MKV
    ];

    if (allowedMimeTypes.includes(file.mimetype)) {
        cb(null, true);
    } else {
        cb(new Error(`Tipo de archivo no permitido: ${file.mimetype}. Solo se permiten videos (MP4, MOV, AVI, WebM, MPEG, MKV).`), false);
    }
};

// Configuración para imágenes (10MB máx)
const upload = multer({
    storage,
    fileFilter: imageFilter,
    limits: {
        fileSize: 10 * 1024 * 1024 // 10 MB máximo por imagen
    }
});

// Configuración para videos (100MB máx)
const uploadVideo = multer({
    storage,
    fileFilter: videoFilter,
    limits: {
        fileSize: 100 * 1024 * 1024 // 100 MB máximo por video
    }
});

module.exports = upload;
module.exports.uploadVideo = uploadVideo;
