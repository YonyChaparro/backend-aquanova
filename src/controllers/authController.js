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

        // 3. Comparar contraseñas (La que llega vs el Hash en BD)
        const validPassword = await bcrypt.compare(password, user?.password_hash || '');

        if (!user || !validPassword) {
            console.warn(`[AUTH] Login fallido - documento: ${document_number} - IP: ${req.ip || req.connection.remoteAddress} - hora: ${new Date().toISOString()}`);
            return res.status(401).json({ 
                ok: false, 
                message: 'Credenciales inválidas' 
            });
        }

        // 4. Generar el Token (JWT) con token_version para revocación
        const tokenVersion = await UserModel.getTokenVersion(user.id);
        const token = jwt.sign(
            { 
                uid: user.id, 
                role: user.role_id,   // 1, 2 o 3
                role_name: user.role_name,
                token_version: tokenVersion
            }, 
            process.env.JWT_SECRET, 
            { expiresIn: process.env.JWT_EXPIRES_IN || '8h' }
        );

        // 5. Configurar cookie HttpOnly
        const cookieOptions = {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict',
            maxAge: 8 * 60 * 60 * 1000 // 8 horas en ms
        };
        res.cookie('auth_token', token, cookieOptions);

        // 6. Responder al cliente
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
        console.error('❌ Error en login:', error.message);
        console.error('Stack:', error.stack);
        // En producción NO exponemos detalles internos al cliente
        res.status(500).json({ 
            ok: false, 
            message: 'Error en el servidor, contacte al administrador',
            // Solo en dev mostramos el detalle:
            ...(process.env.NODE_ENV !== 'production' && { detail: error.message })
        });
    }
};

const logout = async (req, res) => {
    try {
        const userId = req.user?.uid;
        
        if (userId) {
            await UserModel.incrementTokenVersion(userId);
        }

        res.clearCookie('auth_token', {
            httpOnly: true,
            secure: process.env.NODE_ENV === 'production',
            sameSite: 'strict'
        });

        res.json({ ok: true, message: 'Sesión cerrada correctamente' });
    } catch (error) {
        console.error('Error en logout:', error.message);
        res.status(500).json({ ok: false, message: 'Error al cerrar sesión' });
    }
};

module.exports = { login, logout };