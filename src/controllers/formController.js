// src/controllers/formController.js
const FormModel = require('../models/formModel');
const { v4: uuidv4 } = require('uuid');
const { uploadImage, deleteImage, extractPublicId } = require('../helpers/cloudinaryHelper');

// Helper para parsear metadata (llega como string en multipart/form-data)
const parseMetadata = (metadata) => {
    if (!metadata) return null;
    if (typeof metadata === 'string') {
        try { return JSON.parse(metadata); } catch (e) { return null; }
    }
    return metadata;
};

// Helper para convertir "Hola Mundo" -> "hola-mundo"
const generateSlug = (text) => {
    return text
        .toString()
        .toLowerCase()
        .trim()
        .replace(/\s+/g, '-')     // Espacios por guiones
        .replace(/[^\w\-]+/g, '') // Eliminar caracteres raros
        + '-' + Date.now().toString().slice(-4); // Agregamos numeros al final para que sea único
};

// CREAR FORMULARIO (ADMIN)
const createForm = async (req, res) => {
    try {
        const { title, description, neighborhood_id } = req.body;
        // schema puede llegar como string JSON (multipart) u objeto (application/json)
        const rawSchema = req.body.schema;
        const schema = typeof rawSchema === 'string' ? JSON.parse(rawSchema) : rawSchema;
        let metadata = parseMetadata(req.body.metadata);
        const adminId = req.user.uid;

        // Validaciones
        if (!title || !schema || !neighborhood_id) {
            return res.status(400).json({ 
                ok: false, 
                message: 'Faltan datos: title, schema (array de preguntas) y neighborhood_id son obligatorios' 
            });
        }

        // Verificar que el barrio existe
        const neighborhoodExists = await FormModel.checkNeighborhoodExists(neighborhood_id);
        if (!neighborhoodExists) {
            return res.status(404).json({ 
                ok: false, 
                message: 'El barrio especificado no existe' 
            });
        }

        // --- SUBIDA DE IMAGEN A CLOUDINARY (opcional) ---
        if (req.file) {
            const result = await uploadImage(req.file.buffer, 'aquanova/forms');
            metadata = metadata || {};
            metadata.imagen = result.url;
            metadata.imagen_public_id = result.public_id;
            console.log(`☁️  Imagen subida a Cloudinary: ${result.url}`);
        }

        // Preparamos los datos para el Modelo
        const formId = uuidv4();
        const versionId = uuidv4();
        const key = generateSlug(title);

        await FormModel.createWithVersion({
            formId,
            versionId,
            key,
            title,
            description,
            schema,
            adminId,
            neighborhood_id,
            metadata
        });

        res.status(201).json({
            ok: true,
            message: 'Formulario y Versión 1 creados exitosamente',
            data: { id: formId, key, title, neighborhood_id, metadata }
        });

    } catch (error) {
        console.error('Error creando form:', error);
        if (error.code === 'ER_DUP_ENTRY') {
             return res.status(400).json({ ok: false, message: 'Ya existe un formulario con ese título/clave.' });
        }
        res.status(500).json({ ok: false, message: 'Error interno al crear formulario' });
    }
};

// LISTAR FORMULARIOS
const getForms = async (req, res) => {
    try {
        const rows = await FormModel.findAll();
        const forms = rows.map(f => ({
            ...f,
            is_active: Boolean(f.is_active),
            metadata: typeof f.metadata === 'string' ? JSON.parse(f.metadata) : (f.metadata || null),
            neighborhoods: typeof f.neighborhoods === 'string'
                ? JSON.parse(f.neighborhoods)
                : (f.neighborhoods || [])
        }));
        res.json({ ok: true, forms });
    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: 'Error al listar formularios' });
    }
};


// OBTENER DETALLE DEL FORMULARIO (Y SUS PREGUNTAS)
const getFormDetail = async (req, res) => {
    try {
        const { id } = req.params;

        // 1. Buscamos la info básica
        // Nota: Reutilizamos findAll pero filtramos en memoria o creamos un findById en el modelo.
        // Para hacerlo rápido, usaremos una consulta directa aquí o agregamos al modelo.
        // Vamos a agregarlo limpio al modelo primero (ver paso abajo).
        
        const form = await FormModel.findById(id);
        
        if (!form) {
            return res.status(404).json({ ok: false, message: 'Formulario no encontrado' });
        }

        // 2. Buscamos el esquema (preguntas) de la última versión
        const versionData = await FormModel.findLatestVersionSchema(id);

        res.json({
            ok: true,
            data: {
                ...form,
                metadata: typeof form.metadata === 'string' ? JSON.parse(form.metadata) : (form.metadata || null),
                is_active: Boolean(form.is_active),
                version: versionData ? versionData.version : 1,
                schema: versionData ? versionData.schema : [] 
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: 'Error al obtener el formulario' });
    }
};

// ACTUALIZAR FORMULARIO (ADMIN)
const updateForm = async (req, res) => {
    try {
        const { id } = req.params;
        const { title, description, is_active, schema, neighborhood_id } = req.body;
        // Solo parseamos metadata si fue enviado explícitamente; de lo contrario queda undefined
        // para evitar que sobreescriba (y borre) la imagen existente en la BD
        const metadataExplicit = req.body.metadata !== undefined;
        let metadata = metadataExplicit ? parseMetadata(req.body.metadata) : undefined;
        const adminId = req.user.uid;

        if (title === undefined && description === undefined && is_active === undefined && schema === undefined && neighborhood_id === undefined && metadata === undefined && !req.file) {
             return res.status(400).json({
                ok: false,
                message: 'Debe enviar al menos un campo a actualizar (title, description, is_active, schema, neighborhood_id, metadata o imagen)'
            });
        }

        const existing = await FormModel.findByIdAny(id);
        if (!existing) {
            return res.status(404).json({ ok: false, message: 'Formulario no encontrado' });
        }

        let message = 'Formulario actualizado exitosamente';
        const responseData = { id };

        // 1. Actualizar datos básicos (incluye imagen/metadata)
        if (title !== undefined || description !== undefined || is_active !== undefined || metadata !== undefined || req.file) {
            // is_active puede llegar como string "true"/"false" desde multipart
            let isActiveParsed = is_active;
            if (typeof is_active === 'string') {
                isActiveParsed = is_active === 'true';
            }
            if (is_active !== undefined && typeof isActiveParsed !== 'boolean') {
                return res.status(400).json({ ok: false, message: 'is_active debe ser boolean' });
            }

            // --- SUBIDA DE NUEVA IMAGEN A CLOUDINARY ---
            if (req.file) {
                const existingMetadata = parseMetadata(existing.metadata);
                if (existingMetadata && existingMetadata.imagen_public_id) {
                    try {
                        await deleteImage(existingMetadata.imagen_public_id);
                        console.log(`🗑️  Imagen anterior eliminada de Cloudinary: ${existingMetadata.imagen_public_id}`);
                    } catch (e) {
                        console.warn('⚠️  No se pudo eliminar la imagen anterior de Cloudinary:', e.message);
                    }
                } else if (existingMetadata && existingMetadata.imagen) {
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

                const result = await uploadImage(req.file.buffer, 'aquanova/forms');
                metadata = metadata || parseMetadata(existing.metadata) || {};
                metadata.imagen = result.url;
                metadata.imagen_public_id = result.public_id;
                console.log(`☁️  Nueva imagen subida a Cloudinary: ${result.url}`);
            }

            await FormModel.updateForm(id, { title, description, is_active: isActiveParsed, metadata });
            
            const updated = await FormModel.findByIdAny(id);
            Object.assign(responseData, {
                ...updated,
                metadata: typeof updated.metadata === 'string' ? JSON.parse(updated.metadata) : (updated.metadata || null),
                is_active: Boolean(updated.is_active)
            });
        }

        // 2. Actualizar esquema (Genera nueva versión)
        if (schema !== undefined) {
            // schema puede llegar como string JSON desde multipart
            const schemaParsed = typeof schema === 'string' ? JSON.parse(schema) : schema;
            if (!Array.isArray(schemaParsed)) {
                return res.status(400).json({ ok: false, message: 'schema debe ser un array de preguntas' });
            }
            const result = await FormModel.updateSchema(id, schemaParsed, adminId);
            responseData.version = result.version;
            responseData.versionId = result.versionId;
            message += ` y nueva versión ${result.version} creada`;
        }

        // 3. Actualizar barrio asociado
        if (neighborhood_id !== undefined) {
            const neighborhoodExists = await FormModel.checkNeighborhoodExists(neighborhood_id);
            if (!neighborhoodExists) {
                return res.status(404).json({ ok: false, message: 'El barrio especificado no existe' });
            }
            const affected = await FormModel.updateNeighborhood(id, neighborhood_id);
            responseData.neighborhood_id = neighborhood_id;
            responseData.publications_updated = affected;
            message += `, barrio actualizado en ${affected} publicación(es)`;
        }

        res.json({
            ok: true,
            message,
            data: responseData
        });

    } catch (error) {
        console.error('Error actualizando form:', error);
        res.status(500).json({ ok: false, message: 'Error interno al actualizar formulario' });
    }
};

// ELIMINAR (DESACTIVAR) FORMULARIO (ADMIN)
const deleteForm = async (req, res) => {
    try {
        const { id } = req.params;

        const existing = await FormModel.findByIdAny(id);
        if (!existing) {
            return res.status(404).json({ ok: false, message: 'Formulario no encontrado' });
        }

        await FormModel.deactivateForm(id);
        res.json({ ok: true, message: 'Formulario desactivado exitosamente' });

    } catch (error) {
        console.error('Error desactivando form:', error);
        res.status(500).json({ ok: false, message: 'Error interno al desactivar formulario' });
    }
};

// BUSCAR FORMULARIOS
const searchForms = async (req, res) => {
    try {
        const { query } = req.query; // ?query=termino
        if (!query) {
             return res.status(400).json({ ok: false, message: 'Debe enviar un parámetro de búsqueda "query"' });
        }
        
        const forms = await FormModel.search(query);
        const parsed = forms.map(f => ({
            ...f,
            is_active: Boolean(f.is_active),
            metadata: typeof f.metadata === 'string' ? JSON.parse(f.metadata) : (f.metadata || null),
            neighborhoods: typeof f.neighborhoods === 'string' ? JSON.parse(f.neighborhoods) : (f.neighborhoods || [])
        }));
        res.json({ ok: true, forms: parsed });
    } catch (error) {
        console.error('Error en búsqueda de formularios:', error);
        res.status(500).json({ ok: false, message: 'Error al buscar formularios' });
    }
};

// ¡No olvides agregarlo al exports!
module.exports = { createForm, getForms, getFormDetail, updateForm, deleteForm, searchForms };