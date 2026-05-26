const express = require('express');
const router = express.Router();
const { chat } = require('../controllers/chatController');
const verifyToken = require('../middlewares/authMiddleware');

router.post('/', verifyToken, chat);

module.exports = router;
