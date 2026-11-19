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
 * NO bloquea la request: deja que el controlador decida.
 *
 * Distingue tres situaciones, porque no significan lo mismo:
 *   - Sin header Authorization  → req.user = null, req.authError = null
 *     Anónimo legítimo (formulario público). Se acepta.
 *   - Header presente pero token expirado → req.authError = 'expired'
 *   - Header presente pero token inválido → req.authError = 'invalid'
 *
 * Por qué importa: antes, cualquier fallo de verify se traducía en
 * `req.user = null` y el controlador respondía 201 creando una submission
 * ANÓNIMA. Como el JWT dura 8h y una jornada de censo dura más, un inspector
 * con el token vencido sincronizaba su cola y el servidor guardaba todas sus
 * encuestas con user_id NULL respondiendo "OK" — pérdida silenciosa de la
 * atribución. Ver spec `specs/offline-encuestas.md`, DEF-01.
 */
const optionalAuth = (req, res, next) => {
    req.user = null;
    req.authError = null;

    let token = null;

    // 1. Intentar desde cookie
    const cookies = parseCookies(req.headers.cookie);
    if (cookies.auth_token) {
        token = cookies.auth_token;
    }

    // 2. Si no hay cookie, buscar en header Authorization
    if (!token) {
        const authHeader = req.headers['authorization'];
        if (authHeader) {
            const parts = authHeader.split(' ');
            if (parts.length === 2 && parts[0] === 'Bearer' && parts[1]) {
                token = parts[1];
            } else {
                req.authError = 'invalid';
                return next();
            }
        }
    }

    if (!token) {
        return next();
    }

    try {
        req.user = jwt.verify(token, process.env.JWT_SECRET);
    } catch (err) {
        req.authError = err.name === 'TokenExpiredError' ? 'expired' : 'invalid';
    }
    next();
};

module.exports = optionalAuth;