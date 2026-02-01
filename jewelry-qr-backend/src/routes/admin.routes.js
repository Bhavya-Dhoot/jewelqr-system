const express = require('express');
const router = express.Router();
const adminController = require('../controllers/admin.controller');
const { protect, authorize } = require('../middleware');

// All admin routes require authentication + admin role
router.use(protect);
router.use(authorize('admin'));

// GET /api/admin/users - List all users
router.get('/users', adminController.getUsers);

// POST /api/admin/users - Create new user
router.post('/users', adminController.createUser);

// GET /api/admin/users/:id - Get single user
router.get('/users/:id', adminController.getUser);

// PUT /api/admin/users/:id - Update user (name, role, isActive)
router.put('/users/:id', adminController.updateUser);

// POST /api/admin/users/:id/reset-password - Reset user password
router.post('/users/:id/reset-password', adminController.resetPassword);

module.exports = router;
