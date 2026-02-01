const { ItemMaster, AttributeSchema, PricingRule } = require('../models');

/**
 * ItemMasters Controller
 * CRUD operations for item master templates
 */

/**
 * Get all active item masters
 * GET /api/item-masters
 */
exports.getItemMasters = async (req, res, next) => {
    try {
        const { articleType, category } = req.query;

        const query = { isActive: true };
        if (articleType) query.articleType = articleType;
        if (category) query['category.id'] = category;

        const masters = await ItemMaster.find(query)
            .populate('schemaRef')
            .populate('pricingRuleRef')
            .sort({ sortOrder: 1, name: 1 });

        res.status(200).json({
            success: true,
            count: masters.length,
            data: masters
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get single item master by ID
 * GET /api/item-masters/:id
 */
exports.getItemMasterById = async (req, res, next) => {
    try {
        const master = await ItemMaster.findById(req.params.id)
            .populate('schemaRef')
            .populate('pricingRuleRef');

        if (!master) {
            return res.status(404).json({
                success: false,
                message: 'Item master not found'
            });
        }

        res.status(200).json({
            success: true,
            data: master
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Create new item master
 * POST /api/item-masters (admin only)
 */
exports.createItemMaster = async (req, res, next) => {
    try {
        const {
            name,
            description,
            category,
            articleType,
            schemaRef,
            pricingRuleRef,
            defaults,
            sortOrder
        } = req.body;

        // Validate required fields
        if (!name || !category || !articleType) {
            return res.status(400).json({
                success: false,
                message: 'Name, category, and articleType are required'
            });
        }

        // Validate references if provided
        if (schemaRef) {
            const schema = await AttributeSchema.findById(schemaRef);
            if (!schema) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid schemaRef - AttributeSchema not found'
                });
            }
        }

        if (pricingRuleRef) {
            const rule = await PricingRule.findById(pricingRuleRef);
            if (!rule) {
                return res.status(400).json({
                    success: false,
                    message: 'Invalid pricingRuleRef - PricingRule not found'
                });
            }
        }

        const master = await ItemMaster.create({
            name,
            description,
            category,
            articleType,
            schemaRef,
            pricingRuleRef,
            defaults: defaults || {},
            sortOrder: sortOrder || 0,
            isActive: true,
            createdBy: req.user._id
        });

        // Populate refs for response
        await master.populate('schemaRef');
        await master.populate('pricingRuleRef');

        res.status(201).json({
            success: true,
            message: 'Item master created successfully',
            data: master
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update item master
 * PUT /api/item-masters/:id (admin only)
 */
exports.updateItemMaster = async (req, res, next) => {
    try {
        const { id } = req.params;
        const updates = req.body;

        const master = await ItemMaster.findById(id);
        if (!master) {
            return res.status(404).json({
                success: false,
                message: 'Item master not found'
            });
        }

        // Apply updates
        const allowedFields = [
            'name', 'description', 'category', 'articleType',
            'schemaRef', 'pricingRuleRef', 'defaults', 'sortOrder', 'isActive'
        ];

        for (const field of allowedFields) {
            if (updates[field] !== undefined) {
                master[field] = updates[field];
            }
        }

        master.updatedBy = req.user._id;
        await master.save();

        await master.populate('schemaRef');
        await master.populate('pricingRuleRef');

        res.status(200).json({
            success: true,
            message: 'Item master updated successfully',
            data: master
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete item master (soft delete)
 * DELETE /api/item-masters/:id (admin only)
 */
exports.deleteItemMaster = async (req, res, next) => {
    try {
        const { id } = req.params;

        const master = await ItemMaster.findById(id);
        if (!master) {
            return res.status(404).json({
                success: false,
                message: 'Item master not found'
            });
        }

        // Soft delete
        master.deletedAt = new Date();
        master.isActive = false;
        await master.save();

        res.status(200).json({
            success: true,
            message: 'Item master deleted successfully'
        });
    } catch (error) {
        next(error);
    }
};
