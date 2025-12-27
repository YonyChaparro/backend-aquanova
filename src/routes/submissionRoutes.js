// src/routes/submissionRoutes.js
const express = require('express');
const router = express.Router();
const { createSubmission, getSubmissionsByForm } = require('../controllers/submissionController');
const verifyToken = require('../middlewares/authMiddleware');

router.use(verifyToken);

// POST /api/submissions
router.post('/', createSubmission);
// GET /api/submissions/form/:formId
router.get('/:formId', getSubmissionsByForm);

module.exports = router;