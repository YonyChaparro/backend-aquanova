// src/controllers/userController.js
const UserModel = require('../models/userModel');
const GiveawayModel = require('../models/giveawayModel');
const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

// LISTAR USUARIOS
const getUsers = async (req, res) => {
    try {
        const users = await UserModel.findAll();
        res.json({ ok: true, users });
    } catch (error) {
        res.status(500).json({ ok: false, message: 'Error al obtener usuarios' });
    }
};

// CREAR USUARIO
const createUser = async (req, res) => {
    try {
        const {
            name, document_number, email, password, role_id, neighborhood_id,
            pending_submission_ids   // Array de IDs de submissions hechos como anónimo
        } = req.body;

        // 1. Validaciones básicas
        if (!name || !document_number || !password || !role_id) {
            return res.status(400).json({
                ok: false,
                message: 'Faltan datos (name, document_number, password, role_id)'
            });
        }

        // 2. Verificar si ya existe el documento
        const existingUser = await UserModel.findByDocumentWithRole(document_number);
        if (existingUser) {
            return res.status(400).json({ ok: false, message: 'El número de documento ya está registrado' });
        }

        // 3. Preparar datos
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        const newId = uuidv4();

        // 4. Guardar en BD
        await UserModel.create({
            id: newId,
            name,
            document_number,
            email,
            password_hash: hash,
            role_id,
            neighborhood_id
        });

        // ─── CONCILIACIÓN DE REFERIDOS ─────────────────────────────────────────
        const reconciliationResults = [];
        if (Array.isArray(pending_submission_ids) && pending_submission_ids.length > 0) {
            for (const submissionId of pending_submission_ids) {
                try {
                    const result = await GiveawayModel.reconcileSubmission(newId, submissionId);
                    reconciliationResults.push({ submissionId, ...result });
                } catch (reconcileError) {
                    // Loguear pero NO fallar el registro por esto
                    console.error(`Error conciliando ${submissionId}:`, reconcileError.message);
                    reconciliationResults.push({ submissionId, reconciled: false, reason: 'error' });
                }
            }
        }
        // ───────────────────────────────────────────────────────────────────────

        res.status(201).json({
            ok: true,
            message: 'Usuario creado exitosamente',
            userId: newId,
            reconciliation: reconciliationResults
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: 'Error al crear usuario' });
    }
};

module.exports = { getUsers, createUser };