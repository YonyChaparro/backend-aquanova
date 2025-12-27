// src/middlewares/authMiddleware.js
const jwt = require('jsonwebtoken');

const verifyToken = (req, res, next) => {
    // 1. Buscar el token en las cabeceras
    // El formato estándar es: "Bearer eyJhbGciOi..."
    const authHeader = req.headers['authorization'];
    
    if (!authHeader) {
        return res.status(403).json({ ok: false, message: 'Acceso denegado: No se envió token' });
    }

    // 2. Limpiar el prefijo 'Bearer ' si existe
    const token = authHeader.split(' ')[1]; 

    if (!token) {
        return res.status(403).json({ ok: false, message: 'Acceso denegado: Token malformado' });
    }

    try {
        // 3. Verificar la firma del token con tu CLAVE SECRETA
        const decoded = jwt.verify(token, process.env.JWT_SECRET);

        // 4. ¡Token válido! Guardamos los datos del usuario en la petición (req)
        // Esto nos permite saber quién es en las siguientes funciones (Controladores)
        req.user = decoded; 

        next(); // Dejamos pasar al siguiente eslabón
    } catch (error) {
        return res.status(401).json({ ok: false, message: 'Token inválido o expirado' });
    }
};

module.exports = verifyToken;