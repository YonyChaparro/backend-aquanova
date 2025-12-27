// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { login } = require('../controllers/authController');
const authorize = require('../middlewares/roleMiddleware'); // <--- NUEVO IMPORT

// 1. IMPORTAR EL MIDDLEWARE (El "Portero")
// Asegúrate de haber creado el archivo en src/middlewares/authMiddleware.js
const verifyToken = require('../middlewares/authMiddleware');

// 2. Definir el endpoint POST /login (PÚBLICO)
router.post('/login', login);

// 3. Definir endpoint de prueba (PROTEGIDO)
// Esta ruta solo funcionará si envías el Token en la cabecera
router.get('/me', verifyToken, (req, res) => {
    res.json({
        ok: true,
        message: '¡Acceso autorizado! Token válido.',
        my_data: req.user // Aquí verás tu ID y ROL desencriptados del token
    });
});


// --- RUTA SOLO PARA ADMINS ---
// 1. Verifica Token -> 2. Verifica si el rol es 1 (Admin) -> 3. Responde
router.get('/admin-zona', verifyToken, authorize([1]), (req, res) => {
    res.json({
        ok: true,
        message: '¡Hola Jefe! Solo tú puedes ver esto.',
        admin_info: req.user
    });
});

module.exports = router;


