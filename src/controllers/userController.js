// src/controllers/userController.js
const UserModel = require('../models/userModel');
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
        const { name, email, password, role_id, neighborhood_id } = req.body;

        // 1. Validaciones básicas
        if (!name || !email || !password || !role_id) {
            return res.status(400).json({ 
                ok: false, 
                message: 'Faltan datos (name, email, password, role_id)' 
            });
        }

        // 2. Verificar si ya existe el email
        const existingUser = await UserModel.findByEmailWithRole(email);
        if (existingUser) {
            return res.status(400).json({ ok: false, message: 'El email ya está registrado' });
        }

        // 3. Preparar datos
        const salt = await bcrypt.genSalt(10);
        const hash = await bcrypt.hash(password, salt);
        const newId = uuidv4();

        // 4. Guardar en BD
        await UserModel.create({
            id: newId,
            name,
            email,
            password_hash: hash,
            role_id,
            neighborhood_id // <--- Pasamos el barrio (puede ser null)
        });

        res.status(201).json({ 
            ok: true, 
            message: 'Usuario creado exitosamente',
            userId: newId 
        });

    } catch (error) {
        console.error(error);
        res.status(500).json({ ok: false, message: 'Error al crear usuario' });
    }
};

module.exports = { getUsers, createUser };