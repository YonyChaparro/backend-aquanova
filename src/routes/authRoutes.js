// src/routes/authRoutes.js
const express = require('express');
const router = express.Router();
const { login } = require('../controllers/authController');

// Definir el endpoint POST /login
router.post('/login', login);

module.exports = router;