const express = require('express');
const router = express.Router();
const { settingsController } = require('../controllers');
const { protect, authorize, validate, schemas } = require('../middleware');

// GET /api/settings - Get global settings (public)
router.get('/', settingsController.getSettings);

// PUT /api/settings - Update settings (admin only)
router.put('/', protect, authorize('admin'), settingsController.updateSettings);

// ============ DIAMOND TYPES ============

// POST /api/settings/diamond-types - Add diamond type (admin only)
router.post('/diamond-types',
    protect,
    authorize('admin'),
    validate(schemas.addDiamondTypeSchema),
    settingsController.addDiamondType
);

// PUT /api/settings/diamond-types/:id - Update diamond type (admin only)
router.put('/diamond-types/:id', protect, authorize('admin'), settingsController.updateDiamondType);

// GET /api/settings/diamond-types/:id/usage - Check usage count (admin only)
router.get('/diamond-types/:id/usage', protect, authorize('admin'), settingsController.checkDiamondTypeUsage);

// DELETE /api/settings/diamond-types/:id - Remove diamond type (admin only)
router.delete('/diamond-types/:id', protect, authorize('admin'), settingsController.removeDiamondType);

// ============ JEWELRY CATEGORIES ============
// Categories mirror diamond types exactly: add/update/delete/usage-check with isActive toggle

// POST /api/settings/categories - Add category (admin only)
router.post('/categories', protect, authorize('admin'), settingsController.addCategory);

// PUT /api/settings/categories/:id - Update category (admin only)
router.put('/categories/:id', protect, authorize('admin'), settingsController.updateCategory);

// GET /api/settings/categories/:id/usage - Check usage count (admin only)
router.get('/categories/:id/usage', protect, authorize('admin'), settingsController.checkCategoryUsage);

// DELETE /api/settings/categories/:id - Remove category (admin only)
router.delete('/categories/:id', protect, authorize('admin'), settingsController.removeCategory);

module.exports = router;
