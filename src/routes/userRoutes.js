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

// GET /api/users - Listar
router.get('/', getUsers);

// POST /api/users - Crear
router.post('/', createUser);

module.exports = router;