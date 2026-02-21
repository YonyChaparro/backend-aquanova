// src/routes/mapRoutes.js
const express = require('express');
const router = express.Router();
const mapController = require('../controllers/mapController');

// Ruta principal para traer todo el mapa
router.get('/digital-twin', mapController.getDigitalTwinData);

// Ruta para traer el mapa filtrado por un barrio específico
router.get('/digital-twin/:neighborhoodId', mapController.getDigitalTwinData);

// Ruta para actualizar un predio (medidor, estado, etc.)
router.patch('/predios/:lotId', mapController.updateLotStatus);

module.exports = router;