// src/routes/authRoutes.js

// ... imports ...

/**
 * @swagger
 * /auth/login:
 *   post:
 *     summary: Iniciar sesión
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - document_number
 *               - password
 *             properties:
 *               document_number:
 *                 type: string
 *                 example: "1000000000"
 *               password:
 *                 type: string
 *                 example: admin123
 *     responses:
 *       200:
 *         description: Login exitoso, devuelve el token
 *       401:
 *         description: Credenciales incorrectas
 */

const express = require('express');
const router = express.Router();
const { login, logout } = require('../controllers/authController');
const authorize = require('../middlewares/roleMiddleware');
const verifyToken = require('../middlewares/authMiddleware');
const loginLimiter = require('../middlewares/rateLimiter');

router.post('/login', loginLimiter, login);

router.post('/logout', verifyToken, logout);

/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Obtener información del usuario actual
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Información del usuario
 *       401:
 *         description: No autorizado
 */
// 3. Definir endpoint de prueba (PROTEGIDO)
// Esta ruta solo funcionará si envías el Token en la cabecera
router.get('/me', verifyToken, (req, res) => {
    res.json({
        ok: true,
        message: '¡Acceso autorizado! Token válido.',
        my_data: req.user // Aquí verás tu ID y ROL desencriptados del token
    });
});


/**
 * @swagger
 * /auth/admin-zona:
 *   get:
 *     summary: Zona exclusiva para administradores
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Acceso permitido
 *       403:
 *         description: Prohibido (No es admin)
 */
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


