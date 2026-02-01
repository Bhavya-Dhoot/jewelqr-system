const express = require('express');
const router = express.Router();
const itemMastersController = require('../controllers/itemMasters.controller');
const { protect, authorize } = require('../middleware');

/**
 * Item Masters Routes
 * /api/item-masters
 */

// GET /api/item-masters - List all active masters (protected)
router.get('/', protect, itemMastersController.getItemMasters);

// GET /api/item-masters/:id - Get single master (protected)
router.get('/:id', protect, itemMastersController.getItemMasterById);

// POST /api/item-masters - Create master (admin only)
router.post('/', protect, authorize('admin'), itemMastersController.createItemMaster);

// PUT /api/item-masters/:id - Update master (admin only)
router.put('/:id', protect, authorize('admin'), itemMastersController.updateItemMaster);

// DELETE /api/item-masters/:id - Delete master (admin only)
router.delete('/:id', protect, authorize('admin'), itemMastersController.deleteItemMaster);

module.exports = router;
