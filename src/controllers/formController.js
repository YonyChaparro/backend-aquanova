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
        const { title, description, schema } = req.body;
        const adminId = req.user.uid;

        // Validaciones
        if (!title || !schema) {
            return res.status(400).json({ 
                ok: false, 
                message: 'Faltan datos: title y schema (array de preguntas) son obligatorios' 
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
            adminId
        });

        res.status(201).json({
            ok: true,
            message: 'Formulario y Versión 1 creados exitosamente',
            data: { id: formId, key, title }
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

        if (!versionData) {
            return res.status(404).json({ ok: false, message: 'Este formulario no tiene versiones activas' });
        }

        res.json({
            ok: true,
            data: {
                ...form,
                version: versionData.version,
                schema: versionData.schema // ¡Aquí están las preguntas!
            }
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: 'Error al obtener el formulario' });
    }
};

// ¡No olvides agregarlo al exports!
module.exports = { createForm, getForms, getFormDetail };