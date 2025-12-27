// src/controllers/submissionController.js
const SubmissionModel = require('../models/submissionModel');
const FormModel = require('../models/formModel'); // Reutilizamos para buscar versiones
const { v4: uuidv4 } = require('uuid');

const createSubmission = async (req, res) => {
    try {
        const { form_id, neighborhood_id, responses, location } = req.body;
        const userId = req.user.uid; // Del token

        // 1. Validar datos mínimos
        if (!form_id || !neighborhood_id || !responses) {
            return res.status(400).json({ ok: false, message: 'Faltan datos: form_id, neighborhood_id o responses' });
        }

        // 2. Obtener la VERSIÓN actual del formulario
        // (No podemos guardar en 'submissions' sin el form_version_id correcto)
        const versionData = await FormModel.findLatestVersionSchema(form_id);
        
        if (!versionData) {
            return res.status(404).json({ ok: false, message: 'El formulario no tiene versiones activas.' });
        }

        // 3. Crear ID y Guardar
        const submissionId = uuidv4();
        
        await SubmissionModel.create({
            id: submissionId,
            form_version_id: versionData.id, // <--- OJO: Necesitamos el ID de la versión, no del form
            user_id: userId,
            neighborhood_id,
            responses,
            location
        });

        res.status(201).json({
            ok: true,
            message: 'Respuestas guardadas exitosamente',
            submissionId
        });

    } catch (error) {
        console.error('Error guardando respuestas:', error);
        res.status(500).json({ ok: false, message: 'Error interno al guardar respuestas' });
    }
};

// NUEVO: Listar respuestas
const getSubmissionsByForm = async (req, res) => {
    try {
        const { formId } = req.params;
        
        const submissions = await SubmissionModel.findByFormId(formId);
        
        res.json({
            ok: true,
            count: submissions.length,
            data: submissions
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: 'Error obteniendo respuestas' });
    }
};

module.exports = { createSubmission, getSubmissionsByForm };