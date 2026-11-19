// src/middlewares/roleMiddleware.js

/**
 * @param {Array} allowedRoles - Array de IDs permitidos. Ej: [1, 2]
 */
const authorize = (allowedRoles) => {
    return (req, res, next) => {
        if (!req.user || !req.user.role) {
            return res.status(401).json({ 
                ok: false, 
                message: 'No autenticado' 
            });
        }

        const userRole = req.user.role; 

        if (allowedRoles.includes(userRole)) {
            next();
        } else {
            return res.status(403).json({ 
                ok: false, 
                message: 'Acceso denegado: No tienes permisos suficientes.' 
            });
        }
    };
};

module.exports = authorize;