const express = require('express');
const router = express.Router();
const modularController = require('../controllers/modular.controller');
const { protect, authorize } = require('../middleware');

/**
 * Modular Settings Routes
 * /api/modular
 */

// ============ ATTRIBUTE SCHEMAS ============

// GET /api/modular/schemas - List all schemas (protected)
router.get('/schemas', protect, modularController.getSchemas);

// GET /api/modular/schemas/:id - Get single schema (protected)
router.get('/schemas/:id', protect, modularController.getSchemaById);

// POST /api/modular/schemas - Create new version (admin)
router.post('/schemas', protect, authorize('admin'), modularController.createSchema);

// ============ PRICING RULES ============

// GET /api/modular/pricing-rules - List all rules (protected)
router.get('/pricing-rules', protect, modularController.getPricingRules);

// GET /api/modular/pricing-rules/:id - Get single rule (protected)
router.get('/pricing-rules/:id', protect, modularController.getPricingRuleById);

// POST /api/modular/pricing-rules - Create new version (admin)
router.post('/pricing-rules', protect, authorize('admin'), modularController.createPricingRule);

// ============ RATE TABLES ============

// GET /api/modular/rate-tables - List all tables (protected)
router.get('/rate-tables', protect, modularController.getRateTables);

// GET /api/modular/rate-tables/active - Get active table (protected)
router.get('/rate-tables/active', protect, modularController.getActiveRateTable);

// GET /api/modular/rate-tables/:id - Get single table (protected)
router.get('/rate-tables/:id', protect, modularController.getRateTableById);

// POST /api/modular/rate-tables - Create new version (admin)
router.post('/rate-tables', protect, authorize('admin'), modularController.createRateTable);

module.exports = router;
