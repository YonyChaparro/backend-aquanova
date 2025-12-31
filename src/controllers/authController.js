// src/controllers/authController.js
const UserModel = require('../models/userModel');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');

const login = async (req, res) => {
    try {
        const { document_number, password } = req.body;

        // 1. Validar que enviaron datos
        if (!document_number || !password) {
            return res.status(400).json({ 
                ok: false, 
                message: 'Por favor envíe número de documento y contraseña' 
            });
        }

        // 2. Buscar usuario en BD (SQL Directo)
        const user = await UserModel.findByDocumentWithRole(document_number);

        if (!user) {
            return res.status(401).json({ 
                ok: false, 
                message: 'Credenciales inválidas (Usuario no encontrado)' 
            });
        }

        // 3. Comparar contraseñas (La que llega vs el Hash en BD)
        const validPassword = await bcrypt.compare(password, user.password_hash);

        if (!validPassword) {
            return res.status(401).json({ 
                ok: false, 
                message: 'Credenciales inválidas (Contraseña incorrecta)' 
            });
        }

        // 4. Generar el Token (JWT)
        // Guardamos el ID y el ROL dentro del token para usarlo en el Frontend
        const token = jwt.sign(
            { 
                uid: user.id, 
                role: user.role_id,   // 1, 2 o 3
                role_name: user.role_name 
            }, 
            process.env.JWT_SECRET, 
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        // 5. Responder al cliente
        res.json({
            ok: true,
            message: 'Login exitoso',
            token: token,
            user: {
                id: user.id,
                name: user.name,
                document_number: user.document_number,
                email: user.email,
                role: user.role_name // 'administrador'
            }
        });

    } catch (error) {
        console.error('Error en login:', error);
        res.status(500).json({ 
            ok: false, 
            message: 'Error en el servidor, contacte al administrador' 
        });
    }
};

module.exports = { login };