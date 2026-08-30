// src/controllers/neighborhoodController.js
const NeighborhoodModel = require('../models/neighborhoodModel');
const { v4: uuidv4 } = require('uuid');
const { uploadImage, deleteImage, extractPublicId } = require('../helpers/cloudinaryHelper');

/**
 * Parsea el campo metadata del body.
 * En multipart/form-data, metadata llega como string JSON.
 * En application/json, llega como objeto.
 *
 * Devuelve `undefined` cuando el campo no viene (o no es JSON válido) para
 * distinguirlo de un objeto vacío: en el update, tratar "no enviado" como
 * "vaciar" borraba campos que el cliente nunca envía, como el `viewBox` del
 * mapa del barrio o la referencia a la imagen en Cloudinary.
 */
const parseMetadata = (metadata) => {
    if (metadata === undefined || metadata === null || metadata === '') return undefined;
    if (typeof metadata === 'string') {
        try {
            return JSON.parse(metadata);
        } catch (e) {
            return undefined;
        }
    }
    return metadata;
};

// CREAR BARRIO (ADMIN) — Con soporte para imagen (Cloudinary)
const createNeighborhood = async (req, res) => {
    try {
        const { name, code, parent_id } = req.body;
        let metadata = parseMetadata(req.body.metadata);

        // Validaciones
        if (!name || !code) {
            return res.status(400).json({
                ok: false,
                message: 'Faltan datos: name y code son obligatorios'
            });
        }

        // Verificar si el código ya existe
        const codeExists = await NeighborhoodModel.findByCode(code);
        if (codeExists) {
            return res.status(400).json({
                ok: false,
                message: 'Ya existe un barrio con ese código'
            });
        }

        // Si hay parent_id, verificar que existe
        if (parent_id) {
            const parentExists = await NeighborhoodModel.checkParentExists(parent_id);
            if (!parentExists) {
                return res.status(404).json({
                    ok: false,
                    message: 'El barrio padre especificado no existe'
                });
            }
        }

        // --- SUBIDA DE IMAGEN A CLOUDINARY ---
        if (req.file) {
            const result = await uploadImage(
                req.file.buffer,
                'aquanova/neighborhoods'
            );
            // Inyectar la URL de Cloudinary en metadata
            metadata = metadata || {};
            metadata.imagen = result.url;
            metadata.imagen_public_id = result.public_id;
            console.log(`☁️  Imagen subida a Cloudinary: ${result.url}`);
        }

        // Crear barrio
        const neighborhoodId = uuidv4();
        await NeighborhoodModel.create({
            id: neighborhoodId,
            name,
            code,
            parent_id: parent_id || null,
            metadata: metadata || null
        });

        res.status(201).json({
            ok: true,
            message: 'Barrio creado exitosamente',
            data: {
                id: neighborhoodId,
                name,
                code,
                parent_id: parent_id || null,
                metadata: metadata || null
            }
        });

    } catch (error) {
        console.error('Error creando barrio:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                ok: false,
                message: 'Ya existe un barrio con ese código'
            });
        }
        res.status(500).json({
            ok: false,
            message: 'Error interno al crear barrio'
        });
    }
};

// LISTAR BARRIOS
const getNeighborhoods = async (req, res) => {
    try {
        const neighborhoods = await NeighborhoodModel.findAll();
        res.json({
            ok: true,
            neighborhoods
        });
    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            message: 'Error al listar barrios'
        });
    }
};

// OBTENER DETALLE DE UN BARRIO
const getNeighborhoodDetail = async (req, res) => {
    try {
        const { id } = req.params;

        // Recuperar jerarquía (Barrio actual -> Padre -> Abuelo ...)
        const hierarchy = await NeighborhoodModel.findHierarchy(id);

        if (!hierarchy || hierarchy.length === 0) {
            return res.status(404).json({
                ok: false,
                message: 'Barrio no encontrado'
            });
        }

        // El primer elemento es el barrio solicitado
        const neighborhood = hierarchy[0];
        
        // Calcular el tipo basado en la profundidad de ancestros (hierarchy.length - 1)
        // 0 padres -> Ciudad
        // 1 padre -> Localidad
        // 2+ padres -> Barrio
        const parentsCount = hierarchy.length - 1;
        let type = 'Otro';
        if (parentsCount === 0) type = 'Ciudad';
        else if (parentsCount === 1) type = 'Localidad';
        else if (parentsCount >= 2) type = 'Barrio';

        neighborhood.type = type;

        // Construir la estructura anidada del parent
        let currentLevel = neighborhood;
        for (let i = 1; i < hierarchy.length; i++) {
            const parent = hierarchy[i];
            
            let parentType = 'Otro';
            if (i === hierarchy.length - 1) parentType = 'Ciudad';
            else if (i === hierarchy.length - 2) parentType = 'Localidad';
            
            parent.type = parentType;

            currentLevel.parent = parent;
            currentLevel = parent;
        }

        res.json({
            ok: true,
            data: neighborhood
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({
            ok: false,
            message: 'Error al obtener barrio'
        });
    }
};

// BUSCAR BARRIOS
const searchNeighborhoods = async (req, res) => {
    try {
        const { query } = req.query; // ?query=termino
        if (!query) {
             return res.status(400).json({ ok: false, message: 'Debe enviar un parámetro de búsqueda "query"' });
        }
        
        const neighborhoods = await NeighborhoodModel.search(query);
        res.json({ ok: true, neighborhoods });
    } catch (error) {
        console.error('Error en búsqueda de barrios:', error);
        res.status(500).json({ ok: false, message: 'Error al buscar barrios' });
    }
};

// EDITAR BARRIO (ADMIN) — Con soporte para imagen (Cloudinary)
const updateNeighborhood = async (req, res) => {
    try {
        const { id } = req.params;
        const { name, code, parent_id } = req.body;
        let metadata = parseMetadata(req.body.metadata);

        // Verificar que el barrio existe
        const existingNeighborhood = await NeighborhoodModel.findById(id);
        if (!existingNeighborhood) {
            return res.status(404).json({
                ok: false,
                message: 'Barrio no encontrado'
            });
        }

        // Parsear metadata existente (puede venir como string de la DB)
        let existingMetadata = existingNeighborhood.metadata;
        if (typeof existingMetadata === 'string') {
            try { existingMetadata = JSON.parse(existingMetadata); } catch (e) { existingMetadata = null; }
        }

        // Merge, nunca reemplazo: el cliente envía solo los campos que edita
        // (p. ej. `descripcion` desde GeoLevelCreation). Reemplazar el JSON entero
        // borraba `viewBox` —el encuadre del mapa del barrio, que escribe el Map
        // Builder— y dejaba el Gemelo Digital cayendo a un viewBox por defecto.
        const baseMetadata = (existingMetadata && typeof existingMetadata === 'object')
            ? existingMetadata
            : {};
        const mergedMetadata = metadata !== undefined
            ? { ...baseMetadata, ...metadata }
            : { ...baseMetadata };

        // Validar que al menos un campo venga para actualizar (incluyendo archivo)
        if (!name && !code && parent_id === undefined && metadata === undefined && !req.file) {
            return res.status(400).json({
                ok: false,
                message: 'Debe enviar al menos un campo para actualizar (name, code, parent_id, metadata o imagen)'
            });
        }

        // Si se intenta actualizar el código, verificar que no exista otro con ese código
        if (code && code !== existingNeighborhood.code) {
            const codeExists = await NeighborhoodModel.findByCodeExcluding(code, id);
            if (codeExists) {
                return res.status(400).json({
                    ok: false,
                    message: 'Ya existe otro barrio con ese código'
                });
            }
        }

        // Si hay parent_id, verificar que existe y que no sea el mismo barrio
        if (parent_id) {
            if (parent_id === id) {
                return res.status(400).json({
                    ok: false,
                    message: 'Un barrio no puede ser su propio padre'
                });
            }
            const parentExists = await NeighborhoodModel.checkParentExists(parent_id);
            if (!parentExists) {
                return res.status(404).json({
                    ok: false,
                    message: 'El barrio padre especificado no existe'
                });
            }
        }

        // --- SUBIDA DE NUEVA IMAGEN A CLOUDINARY ---
        if (req.file) {
            // Eliminar imagen anterior de Cloudinary si existe
            if (existingMetadata && existingMetadata.imagen_public_id) {
                try {
                    await deleteImage(existingMetadata.imagen_public_id);
                    console.log(`🗑️  Imagen anterior eliminada de Cloudinary: ${existingMetadata.imagen_public_id}`);
                } catch (e) {
                    console.warn('⚠️  No se pudo eliminar la imagen anterior de Cloudinary:', e.message);
                }
            } else if (existingMetadata && existingMetadata.imagen) {
                // Intentar extraer public_id de la URL
                const publicId = extractPublicId(existingMetadata.imagen);
                if (publicId) {
                    try {
                        await deleteImage(publicId);
                        console.log(`🗑️  Imagen anterior eliminada de Cloudinary: ${publicId}`);
                    } catch (e) {
                        console.warn('⚠️  No se pudo eliminar la imagen anterior de Cloudinary:', e.message);
                    }
                }
            }

            // Subir nueva imagen
            const result = await uploadImage(
                req.file.buffer,
                'aquanova/neighborhoods'
            );

            // Actualizar metadata con la nueva imagen
            mergedMetadata.imagen = result.url;
            mergedMetadata.imagen_public_id = result.public_id;
            console.log(`☁️  Nueva imagen subida a Cloudinary: ${result.url}`);
        }

        // Construir objeto con datos a actualizar
        const updateData = {
            name: name || existingNeighborhood.name,
            code: code || existingNeighborhood.code,
            parent_id: parent_id !== undefined ? (parent_id || null) : existingNeighborhood.parent_id,
            metadata: Object.keys(mergedMetadata).length > 0 ? mergedMetadata : null
        };

        await NeighborhoodModel.update(id, updateData);

        res.json({
            ok: true,
            message: 'Barrio actualizado exitosamente',
            data: {
                id,
                ...updateData
            }
        });

    } catch (error) {
        console.error('Error actualizando barrio:', error);
        if (error.code === 'ER_DUP_ENTRY') {
            return res.status(400).json({
                ok: false,
                message: 'Ya existe un barrio con ese código'
            });
        }
        res.status(500).json({
            ok: false,
            message: 'Error interno al actualizar barrio'
        });
    }
};

// ELIMINAR BARRIO (ADMIN) — Con limpieza de imagen en Cloudinary
const deleteNeighborhood = async (req, res) => {
    try {
        const { id } = req.params;

        // Verificar que el barrio existe
        const existingNeighborhood = await NeighborhoodModel.findById(id);
        if (!existingNeighborhood) {
            return res.status(404).json({
                ok: false,
                message: 'Barrio no encontrado'
            });
        }

        // Verificar que el barrio no tenga hijos (sub-barrios)
        const hasChildren = await NeighborhoodModel.hasChildren(id);
        if (hasChildren) {
            return res.status(400).json({
                ok: false,
                message: 'No se puede eliminar el barrio porque tiene sub-barrios asociados. Elimine primero los sub-barrios.'
            });
        }

        // --- ELIMINAR IMAGEN DE CLOUDINARY ---
        let neighborhoodMetadata = existingNeighborhood.metadata;
        if (typeof neighborhoodMetadata === 'string') {
            try { neighborhoodMetadata = JSON.parse(neighborhoodMetadata); } catch (e) { neighborhoodMetadata = null; }
        }

        if (neighborhoodMetadata) {
            const publicId = neighborhoodMetadata.imagen_public_id || extractPublicId(neighborhoodMetadata.imagen);
            if (publicId) {
                try {
                    await deleteImage(publicId);
                    console.log(`🗑️  Imagen eliminada de Cloudinary: ${publicId}`);
                } catch (e) {
                    console.warn('⚠️  No se pudo eliminar la imagen de Cloudinary:', e.message);
                }
            }
        }

        await NeighborhoodModel.delete(id);

        res.json({
            ok: true,
            message: 'Barrio eliminado exitosamente',
            data: {
                id,
                name: existingNeighborhood.name,
                code: existingNeighborhood.code
            }
        });

    } catch (error) {
        console.error('Error eliminando barrio:', error);
        // Verificar si hay restricciones de clave foránea (barrio usado en otras tablas)
        if (error.code === 'ER_ROW_IS_REFERENCED_2') {
            return res.status(400).json({
                ok: false,
                message: 'No se puede eliminar el barrio porque está siendo utilizado en otros registros'
            });
        }
        res.status(500).json({
            ok: false,
            message: 'Error interno al eliminar barrio'
        });
    }
};

module.exports = { createNeighborhood, getNeighborhoods, getNeighborhoodDetail, searchNeighborhoods, updateNeighborhood, deleteNeighborhood };
