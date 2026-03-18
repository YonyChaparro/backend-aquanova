// src/controllers/uploadController.js
const { uploadImage, uploadVideo } = require('../helpers/cloudinaryHelper');

/**
 * Controlador para subir una imagen a Cloudinary.
 * Endpoint público (no requiere autenticación).
 */
const uploadImageToCloudinary = async (req, res) => {
    try {
        // Validar que se haya subido un archivo
        if (!req.file) {
            return res.status(400).json({
                ok: false,
                message: 'No se ha proporcionado ninguna imagen'
            });
        }

        // Obtener carpeta del body (default: 'submissions')
        const folder = req.body.folder || 'aquanova/submissions';

        // Subir imagen a Cloudinary
        const result = await uploadImage(req.file.buffer, folder);

        res.status(200).json({
            ok: true,
            message: 'Imagen subida exitosamente',
            url: result.url,
            secure_url: result.url,
            public_id: result.public_id,
            resource_type: 'image'
        });

    } catch (error) {
        console.error('Error en uploadImageToCloudinary:', error);
        res.status(500).json({
            ok: false,
            message: 'Error al subir la imagen a Cloudinary'
        });
    }
};

/**
 * Controlador para subir un video a Cloudinary.
 * Endpoint público (no requiere autenticación).
 */
const uploadVideoToCloudinary = async (req, res) => {
    try {
        // Validar que se haya subido un archivo
        if (!req.file) {
            return res.status(400).json({
                ok: false,
                message: 'No se ha proporcionado ningún video'
            });
        }

        // Obtener carpeta del body (default: 'submissions')
        const folder = req.body.folder || 'aquanova/submissions';

        // Subir video a Cloudinary
        const result = await uploadVideo(req.file.buffer, folder);

        res.status(200).json({
            ok: true,
            message: 'Video subido exitosamente',
            url: result.url,
            secure_url: result.url,
            public_id: result.public_id,
            resource_type: 'video'
        });

    } catch (error) {
        console.error('Error en uploadVideoToCloudinary:', error);
        res.status(500).json({
            ok: false,
            message: 'Error al subir el video a Cloudinary'
        });
    }
};

module.exports = { uploadImageToCloudinary, uploadVideoToCloudinary };
