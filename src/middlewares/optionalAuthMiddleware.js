// src/middlewares/optionalAuthMiddleware.js
const jwt = require('jsonwebtoken');

const parseCookies = (cookieHeader) => {
    const cookies = {};
    if (!cookieHeader) return cookies;
    cookieHeader.split(';').forEach(cookie => {
        const [name, ...rest] = cookie.split('=');
        cookies[name.trim()] = rest.join('=').trim();
    });
    return cookies;
};

/**
 * Middleware de autenticación opcional.
 * Si hay token válido, agrega req.user. Si no, req.user = null.
 * NO bloquea la request.
 */
const optionalAuth = (req, res, next) => {
    let token = null;
    
    // 1. Intentar desde cookie
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.auth_token) {
        token = cookies.auth_token;
    }

    // 2. Si no hay cookie, buscar en header
    if (!token) {
        const authHeader = req.headers['authorization'];
        if (authHeader && authHeader.startsWith('Bearer ')) {
            token = authHeader.split(' ')[1];
        }
    }

    if (!token) {
        req.user = null;
        return next();
    }

    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
    } catch {
        req.user = null;
    }
    next();
};

module.exports = optionalAuth;