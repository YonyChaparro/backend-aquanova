// src/controllers/formController.js
const FormModel = require('../models/formModel');
const { v4: uuidv4 } = require('uuid');

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
        const { title, description, schema, neighborhood_id } = req.body;
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

        // Preparamos los datos para el Modelo
        const formId = uuidv4();
        const versionId = uuidv4();
        const key = generateSlug(title); // Ej: censo-barrial-8392

        await FormModel.createWithVersion({
            formId,
            versionId,
            key,
            title,
            description,
            schema, // Aquí viene el JSON de las preguntas
            adminId,
            neighborhood_id
        });

        res.status(201).json({
            ok: true,
            message: 'Formulario y Versión 1 creados exitosamente',
            data: { id: formId, key, title, neighborhood_id }
        });

    } catch (error) {
        console.error('Error creando form:', error);
        // Manejo del error de llave duplicada
        if (error.code === 'ER_DUP_ENTRY') {
             return res.status(400).json({ ok: false, message: 'Ya existe un formulario con ese título/clave.' });
        }
        res.status(500).json({ ok: false, message: 'Error interno al crear formulario' });
    }
};

// LISTAR FORMULARIOS
const getForms = async (req, res) => {
    try {
        const forms = await FormModel.findAll();
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
                ...form, // ¡Aquí ya viajan automáticamente is_active y neighborhood_id!
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
        const adminId = req.user.uid;

        if (title === undefined && description === undefined && is_active === undefined && schema === undefined && neighborhood_id === undefined) {
             return res.status(400).json({
                ok: false,
                message: 'Debe enviar al menos un campo a actualizar (title, description, is_active, schema, neighborhood_id)'
            });
        }

        const existing = await FormModel.findByIdAny(id);
        if (!existing) {
            return res.status(404).json({ ok: false, message: 'Formulario no encontrado' });
        }

        let message = 'Formulario actualizado exitosamente';
        const responseData = { id };

        // 1. Actualizar datos básicos
        if (title !== undefined || description !== undefined || is_active !== undefined) {
            if (is_active !== undefined && typeof is_active !== 'boolean') {
                return res.status(400).json({ ok: false, message: 'is_active debe ser boolean' });
            }
            await FormModel.updateForm(id, { title, description, is_active });
            
            const updated = await FormModel.findByIdAny(id);
            Object.assign(responseData, updated);
        }

        // 2. Actualizar esquema (Genera nueva versión)
        if (schema) {
            if (!Array.isArray(schema)) {
                return res.status(400).json({ ok: false, message: 'schema debe ser un array de preguntas' });
            }
            const result = await FormModel.updateSchema(id, schema, adminId);
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
        res.json({ ok: true, forms });
    } catch (error) {
        console.error('Error en búsqueda de formularios:', error);
        res.status(500).json({ ok: false, message: 'Error al buscar formularios' });
    }
};

// ¡No olvides agregarlo al exports!
module.exports = { createForm, getForms, getFormDetail, updateForm, deleteForm, searchForms };