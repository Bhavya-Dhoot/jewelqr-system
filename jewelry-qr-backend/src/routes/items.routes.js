const express = require('express');
const router = express.Router();
const { itemsController } = require('../controllers');
const imagesController = require('../controllers/images.controller');
const { protect, authorize, optionalAuth, validate, schemas } = require('../middleware');
const { uploadMultiple, uploadSingle } = require('../middleware/upload.middleware');

// POST /api/items - Create item (any authenticated user - admin or staff)
router.post('/', protect, validate(schemas.createItemSchema), itemsController.createItem);

// GET /api/items - List all items (protected - any authenticated user)
router.get('/', protect, itemsController.getItems);

// GET /api/items/:sku - Get single item (public for QR scan)
router.get('/:sku', optionalAuth, itemsController.getItemBySku);

// PUT /api/items/:sku - Update item (any authenticated user)
router.put('/:sku', protect, validate(schemas.updateItemSchema), itemsController.updateItem);

// DELETE /api/items/:sku - Delete item (admin only for safety)
router.delete('/:sku', protect, authorize('admin'), itemsController.deleteItem);

// POST /api/items/:sku/restore - Restore deleted item (admin only)
router.post('/:sku/restore', protect, authorize('admin'), itemsController.restoreItem);

// ============ Image Routes ============

// POST /api/items/:sku/images - Upload images (any authenticated user)
router.post('/:sku/images', protect, uploadMultiple, imagesController.uploadImages);

// GET /api/items/:sku/images - Get images for item (public for scan)
router.get('/:sku/images', optionalAuth, imagesController.getImages);

// DELETE /api/items/:sku/images/:filename - Delete specific image (admin only)
router.delete('/:sku/images/:filename', protect, authorize('admin'), imagesController.deleteImage);

// PUT /api/items/:sku/images/primary - Replace primary image (any authenticated user)
router.put('/:sku/images/primary', protect, uploadSingle, imagesController.replacePrimary);

module.exports = router;
