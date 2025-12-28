// src/routes/userRoutes.js
const express = require('express');
const router = express.Router();
const { getUsers, createUser } = require('../controllers/userController');
const verifyToken = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/roleMiddleware');

// PROTECCIÓN TOTAL DEL ARCHIVO
// Todas las rutas de abajo requieren Token Y ser Admin (ID 1)
router.use(verifyToken);
router.use(authorize([1])); 

/**
 * @swagger
 * /users:
 *   get:
 *     summary: Listar todos los usuarios
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Lista de usuarios
 *       403:
 *         description: Requiere rol de administrador
 */
// GET /api/users - Listar
router.get('/', getUsers);

/**
 * @swagger
 * /users:
 *   post:
 *     summary: Crear un nuevo usuario
 *     tags: [Users]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required:
 *               - name
 *               - email
 *               - password
 *               - role_id
 *             properties:
 *               name:
 *                 type: string
 *               email:
 *                 type: string
 *               password:
 *                 type: string
 *               role_id:
 *                 type: integer
 *               neighborhood_id:
 *                 type: string
 *     responses:
 *       201:
 *         description: Usuario creado exitosamente
 */
// POST /api/users - Crear
router.post('/', createUser);

module.exports = router;