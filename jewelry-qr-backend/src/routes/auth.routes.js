const express = require('express');
const router = express.Router();
const { authController } = require('../controllers');
const { protect, validate, schemas } = require('../middleware');

// POST /api/auth/login
router.post('/login', validate(schemas.loginSchema), authController.login);

// POST /api/auth/logout (requires auth)
router.post('/logout', protect, authController.logout);

// GET /api/auth/me (requires auth)
router.get('/me', protect, authController.getMe);

module.exports = router;
