const express = require('express');
const router = express.Router();
const { dashboardController } = require('../controllers');
const { protect } = require('../middleware');

// GET /api/dashboard/stats - Get statistics (protected)
router.get('/stats', protect, dashboardController.getStats);

// GET /api/dashboard/recent - Get recent items (protected)
router.get('/recent', protect, dashboardController.getRecentItems);

module.exports = router;
