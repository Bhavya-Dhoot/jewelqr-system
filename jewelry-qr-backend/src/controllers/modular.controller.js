const { AttributeSchema, PricingRule, RateTable } = require('../models');

/**
 * Modular Settings Controller
 * Manages versioned schemas, pricing rules, and rate tables
 */

// ============ ATTRIBUTE SCHEMAS ============

/**
 * Get all attribute schemas
 * GET /api/modular/schemas
 */
exports.getSchemas = async (req, res, next) => {
    try {
        const { articleType, activeOnly } = req.query;

        const query = {};
        if (articleType) {
            query.articleType = { $in: [articleType, 'both'] };
        }
        if (activeOnly === 'true') {
            query.isActive = true;
        }

        const schemas = await AttributeSchema.find(query)
            .sort({ name: 1, version: -1 });

        res.status(200).json({
            success: true,
            count: schemas.length,
            data: schemas
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get single schema by ID
 * GET /api/modular/schemas/:id
 */
exports.getSchemaById = async (req, res, next) => {
    try {
        const schema = await AttributeSchema.findById(req.params.id);

        if (!schema) {
            return res.status(404).json({
                success: false,
                message: 'Schema not found'
            });
        }

        res.status(200).json({
            success: true,
            data: schema
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create new schema version
 * POST /api/modular/schemas (admin only)
 */
exports.createSchema = async (req, res, next) => {
    try {
        const { name, description, articleType, fields } = req.body;

        if (!name || !fields || !Array.isArray(fields)) {
            return res.status(400).json({
                success: false,
                message: 'Name and fields array are required'
            });
        }

        const schema = await AttributeSchema.createNewVersion({
            name,
            description,
            articleType: articleType || 'both',
            fields
        }, req.user._id);

        res.status(201).json({
            success: true,
            message: `Schema created: ${schema.name} v${schema.version}`,
            data: schema
        });
    } catch (error) {
        next(error);
    }
};

// ============ PRICING RULES ============

/**
 * Get all pricing rules
 * GET /api/modular/pricing-rules
 */
exports.getPricingRules = async (req, res, next) => {
    try {
        const { articleType, activeOnly } = req.query;

        const query = {};
        if (articleType) {
            query.articleType = { $in: [articleType, 'both'] };
        }
        if (activeOnly === 'true') {
            query.isActive = true;
        }

        const rules = await PricingRule.find(query)
            .populate('rateTableRef')
            .sort({ name: 1, version: -1 });

        res.status(200).json({
            success: true,
            count: rules.length,
            data: rules
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get single pricing rule by ID
 * GET /api/modular/pricing-rules/:id
 */
exports.getPricingRuleById = async (req, res, next) => {
    try {
        const rule = await PricingRule.findById(req.params.id)
            .populate('rateTableRef');

        if (!rule) {
            return res.status(404).json({
                success: false,
                message: 'Pricing rule not found'
            });
        }

        res.status(200).json({
            success: true,
            data: rule
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create new pricing rule version
 * POST /api/modular/pricing-rules (admin only)
 */
exports.createPricingRule = async (req, res, next) => {
    try {
        const { name, description, articleType, logicType, config, rateTableRef } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Name is required'
            });
        }

        // Validate rateTableRef if provided
        if (rateTableRef) {
            const table = await RateTable.findById(rateTableRef);
            if (!table) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid rateTableRef - RateTable not found'
                });
            }
        }

        const rule = await PricingRule.createNewVersion({
            name,
            description,
            articleType: articleType || 'both',
            logicType: logicType || 'jewelqr_v1_compat',
            config: config || {},
            rateTableRef
        }, req.user._id);

        await rule.populate('rateTableRef');

        res.status(201).json({
            success: true,
            message: `Pricing rule created: ${rule.name} v${rule.version}`,
            data: rule
        });
    } catch (error) {
        next(error);
    }
};

// ============ RATE TABLES ============

/**
 * Get all rate tables
 * GET /api/modular/rate-tables
 */
exports.getRateTables = async (req, res, next) => {
    try {
        const { activeOnly } = req.query;

        const query = {};
        if (activeOnly === 'true') {
            query.isActive = true;
        }

        const tables = await RateTable.find(query)
            .sort({ name: 1, version: -1 });

        res.status(200).json({
            success: true,
            count: tables.length,
            data: tables
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get single rate table by ID
 * GET /api/modular/rate-tables/:id
 */
exports.getRateTableById = async (req, res, next) => {
    try {
        const table = await RateTable.findById(req.params.id);

        if (!table) {
            return res.status(404).json({
                success: false,
                message: 'Rate table not found'
            });
        }

        res.status(200).json({
            success: true,
            data: table
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get active rate table
 * GET /api/modular/rate-tables/active
 */
exports.getActiveRateTable = async (req, res, next) => {
    try {
        const table = await RateTable.getActive();

        if (!table) {
            return res.status(404).json({
                success: false,
                message: 'No active rate table found'
            });
        }

        res.status(200).json({
            success: true,
            data: table
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create new rate table version
 * POST /api/modular/rate-tables (admin only)
 */
exports.createRateTable = async (req, res, next) => {
    try {
        const { name, rates, diamondPricing, polkiPricing } = req.body;

        if (!name) {
            return res.status(400).json({
                success: false,
                message: 'Name is required'
            });
        }

        const table = await RateTable.createNewVersion({
            name,
            rates: rates || {},
            diamondPricing: diamondPricing || {},
            polkiPricing: polkiPricing || {}
        }, req.user._id);

        res.status(201).json({
            success: true,
            message: `Rate table created: ${table.name} v${table.version}`,
            data: table
        });
    } catch (error) {
        next(error);
    }
};
