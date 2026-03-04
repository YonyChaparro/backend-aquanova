// src/middlewares/optionalAuthMiddleware.js
const jwt = require('jsonwebtoken');

/**
 * Middleware de autenticación opcional.
 * Si hay token válido, agrega req.user. Si no, req.user = null.
 * NO bloquea la request.
 */
const optionalAuth = (req, res, next) => {
    const authHeader = req.headers['authorization'];
    if (!authHeader) {
        req.user = null;
        return next();
    }
    const token = authHeader.split(' ')[1];
    try {
        const decoded = jwt.verify(token, process.env.JWT_SECRET);
        req.user = decoded;
    } catch {
        req.user = null;
    }
    next();
};

module.exports = optionalAuth;
