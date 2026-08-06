// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');
const UserModel = require('../models/userModel');

const parseCookies = (cookieHeader) => {
    const cookies = {};
    if (!cookieHeader) return cookies;
    cookieHeader.split(';').forEach(cookie => {
        const [name, ...rest] = cookie.split('=');
        cookies[name.trim()] = rest.join('=').trim();
    });
    return cookies;
};

const verifyToken = async (req, res, next) => {
    let token = null;

    // 1. Intentar leer desde cookie (prioridad)
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.auth_token) {
        token = cookies.auth_token;
    }

    // 2. Si no hay cookie, buscar en header Authorization (backward compatibility)
    if (!token) {
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
    }

    if (!token) {
        return res.status(403).json({ ok: false, message: 'Acceso denegado: No se envió token' });
    }

    try {
        // 3. Verificar la firma del token
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 4. Verificar token_version para revocación
        if (decoded.uid) {
            const currentVersion = await UserModel.getTokenVersion(decoded.uid);
            if (currentVersion !== decoded.token_version) {
                return res.status(401).json({ 
                    ok: false, 
                    message: 'Sesión invalidada. Inicia sesión nuevamente.' 
                });
            }
        }

        // 5. Token válido
        req.user = decoded;
        next();
    } catch (error) {
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({ ok: false, message: 'Token expirado' });
        }
        return res.status(401).json({ ok: false, message: 'Token inválido' });
    }
};

module.exports = verifyToken;