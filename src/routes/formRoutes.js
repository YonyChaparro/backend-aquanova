const express = require('express');
const router = express.Router();
const verifyToken = require('../middlewares/authMiddleware');
const authorize = require('../middlewares/roleMiddleware');
const { createForm, getForms, getFormDetail } = require('../controllers/formController');

router.use(verifyToken);

// Listar (Todos los roles)
router.get('/', getForms);

router.get('/:id', getFormDetail);

// Crear (Solo Admin - Rol ID 1)
router.post('/', authorize([1]), createForm);

module.exports = router;