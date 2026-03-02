// src/helpers/cloudinaryHelper.js
const cloudinary = require('../config/cloudinary');

/**
 * Sube una imagen a Cloudinary desde un buffer (multer memoryStorage).
 * @param {Buffer} fileBuffer - Buffer del archivo
 * @param {string} folder - Carpeta destino en Cloudinary (ej: 'aquanova/neighborhoods')
 * @param {string} [publicId] - ID público opcional para la imagen
 * @returns {Promise<{url: string, public_id: string}>} URL segura y public_id
 */
const uploadImage = (fileBuffer, folder = 'aquanova/neighborhoods', publicId = undefined) => {
    return new Promise((resolve, reject) => {
        const uploadOptions = {
            folder,
            resource_type: 'image',
            overwrite: true,
            transformation: [
                { quality: 'auto', fetch_format: 'auto' } // Optimización automática
            ]
        };

        if (publicId) {
            uploadOptions.public_id = publicId;
        }

        const stream = cloudinary.uploader.upload_stream(
            uploadOptions,
            (error, result) => {
                if (error) {
                    console.error('❌ Error subiendo imagen a Cloudinary:', error);
                    return reject(error);
                }
                resolve({
                    url: result.secure_url,
                    public_id: result.public_id
                });
            }
        );

        stream.end(fileBuffer);
    });
};

/**
 * Elimina una imagen de Cloudinary por su public_id.
 * @param {string} publicId - Public ID de la imagen en Cloudinary
 * @returns {Promise<object>} Resultado de la eliminación
 */
const deleteImage = async (publicId) => {
    try {
        const result = await cloudinary.uploader.destroy(publicId);
        return result;
    } catch (error) {
        console.error('❌ Error eliminando imagen de Cloudinary:', error);
        throw error;
    }
};

/**
 * Extrae el public_id de una URL de Cloudinary.
 * Ejemplo: https://res.cloudinary.com/dpnv9gx8m/image/upload/v1772333719/aquanova/neighborhoods/descarga_dq3qip.jpg
 * -> aquanova/neighborhoods/descarga_dq3qip
 * @param {string} cloudinaryUrl - URL completa de Cloudinary
 * @returns {string|null} Public ID o null si no se puede extraer
 */
const extractPublicId = (cloudinaryUrl) => {
    try {
        if (!cloudinaryUrl || !cloudinaryUrl.includes('res.cloudinary.com')) {
            return null;
        }
        // Patrón: .../upload/v{timestamp}/{public_id}.{ext}
        const match = cloudinaryUrl.match(/\/upload\/(?:v\d+\/)?(.+)\.\w+$/);
        return match ? match[1] : null;
    } catch (error) {
        return null;
    }
};

module.exports = { uploadImage, deleteImage, extractPublicId };
