// src/middlewares/roleMiddleware.js

/**
 * @param {Array} allowedRoles - Array de IDs permitidos. Ej: [1, 2]
 */
const authorize = (allowedRoles) => {
    return (req, res, next) => {
        // req.user viene del middleware anterior (verifyToken)
        const userRole = req.user.role; 

        // Si el rol del usuario está incluido en los permitidos, pasa.
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