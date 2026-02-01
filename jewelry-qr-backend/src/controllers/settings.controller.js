const Settings = require('../models/Settings');
const Item = require('../models/Item');
const { cache, CACHE_KEYS, TTL } = require('../services/cache.service');

// Precomputed conversion helper
const mapToObject = (map) => {
    if (!(map instanceof Map)) return map || {};
    const obj = {};
    map.forEach((value, key) => { obj[key] = value; });
    return obj;
};

/**
 * Get global settings
 * GET /api/settings
 * OPTIMIZED: Uses caching (5 min TTL)
 */
exports.getSettings = async (req, res, next) => {
    try {
        // Check cache first
        const cached = cache.get(CACHE_KEYS.SETTINGS);
        if (cached) {
            return res.status(200).json({
                success: true,
                data: cached,
                cached: true
            });
        }

        const settings = await Settings.getSettings();

        // Convert Maps to plain objects (single pass)
        const data = {
            diamondPricing: mapToObject(settings.diamondPricing),
            diamondTypeAliases: mapToObject(settings.diamondTypeAliases),
            diamondTypes: settings.diamondTypes,
            jewelryCategories: settings.jewelryCategories,
            rates: settings.rates,
            qrSettings: settings.qrSettings
        };

        // Cache for 5 minutes
        cache.set(CACHE_KEYS.SETTINGS, data, TTL.SETTINGS);

        res.status(200).json({
            success: true,
            data
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update settings atomically
 * PUT /api/settings
 * OPTIMIZED: Invalidates cache on update
 */
exports.updateSettings = async (req, res, next) => {
    try {
        const updateOps = {};

        // Build atomic update operations (single loop each)
        if (req.body.rates) {
            for (const key in req.body.rates) {
                updateOps[`rates.${key}`] = req.body.rates[key];
            }
        }

        if (req.body.qrSettings) {
            for (const key in req.body.qrSettings) {
                updateOps[`qrSettings.${key}`] = req.body.qrSettings[key];
            }
        }

        updateOps.updatedBy = req.user._id;
        updateOps.updatedAt = new Date();

        const settings = await Settings.findByIdAndUpdate(
            'global_settings',
            { $set: updateOps },
            { new: true, runValidators: true, lean: true }
        );

        if (!settings) {
            return res.status(404).json({
                success: false,
                message: 'Settings not found'
            });
        }

        // Invalidate settings cache
        cache.delete(CACHE_KEYS.SETTINGS);

        res.status(200).json({
            success: true,
            message: 'Settings updated successfully',
            data: settings
        });
    } catch (error) {
        next(error);
    }
};

// ============ DIAMOND TYPES CRUD ============

/**
 * Add diamond type with pricing
 * POST /api/settings/diamond-types
 */
exports.addDiamondType = async (req, res, next) => {
    try {
        const { id, label, realRate = 50000, cvdRate = 25000, rateMultiplier = 1.0 } = req.body;

        if (!id && !label) {
            return res.status(400).json({
                success: false,
                message: 'ID or label is required'
            });
        }

        const typeId = id || label.toLowerCase().replace(/\s+/g, '_');
        const typeName = label || id;
        const parsedRealRate = parseFloat(realRate) || 50000;
        const parsedCvdRate = parseFloat(cvdRate) || 25000;

        const settings = await Settings.getSettings();

        if (settings.diamondPricing?.get(typeId)) {
            return res.status(400).json({
                success: false,
                message: `Diamond type '${typeId}' already exists`
            });
        }

        await Settings.findByIdAndUpdate(
            'global_settings',
            {
                $set: {
                    [`diamondPricing.${typeId}`]: {
                        label: typeName,
                        realRate: parsedRealRate,
                        cvdRate: parsedCvdRate,
                        isActive: true
                    },
                    updatedBy: req.user._id
                },
                $addToSet: {
                    diamondTypes: { id: typeId, name: typeName, rateMultiplier }
                }
            },
            { new: true }
        );

        cache.delete(CACHE_KEYS.SETTINGS);

        res.status(201).json({
            success: true,
            message: 'Diamond type added successfully',
            data: {
                id: typeId,
                label: typeName,
                realRate: parsedRealRate,
                cvdRate: parsedCvdRate,
                isActive: true
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update diamond type
 * PUT /api/settings/diamond-types/:id
 */
exports.updateDiamondType = async (req, res, next) => {
    try {
        const typeId = req.params.id;
        const { label, realRate, cvdRate, isActive } = req.body;

        const settings = await Settings.getSettings();
        const existing = settings.diamondPricing?.get(typeId);

        if (!existing) {
            return res.status(404).json({
                success: false,
                message: `Diamond type '${typeId}' not found`
            });
        }

        const updateData = {
            label: label ?? existing.label,
            realRate: realRate !== undefined ? parseFloat(realRate) : existing.realRate,
            cvdRate: cvdRate !== undefined ? parseFloat(cvdRate) : existing.cvdRate,
            isActive: isActive !== undefined ? isActive : existing.isActive
        };

        await Settings.findByIdAndUpdate(
            'global_settings',
            {
                $set: {
                    [`diamondPricing.${typeId}`]: updateData,
                    updatedBy: req.user._id
                }
            },
            { new: true }
        );

        cache.delete(CACHE_KEYS.SETTINGS);

        res.status(200).json({
            success: true,
            message: 'Diamond type updated successfully',
            data: { id: typeId, ...updateData }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Check diamond type usage
 * GET /api/settings/diamond-types/:id/usage
 */
exports.checkDiamondTypeUsage = async (req, res, next) => {
    try {
        const typeId = req.params.id;

        const itemCount = await Item.countDocuments({
            'diamonds.type_id': typeId,
            deletedAt: null
        });

        res.status(200).json({
            success: true,
            data: {
                typeId,
                itemCount,
                inUse: itemCount > 0
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Remove diamond type
 * DELETE /api/settings/diamond-types/:id
 */
exports.removeDiamondType = async (req, res, next) => {
    try {
        const typeId = req.params.id;

        const itemsUsingType = await Item.countDocuments({
            'diamonds.type_id': typeId,
            deletedAt: null
        });

        if (itemsUsingType > 0) {
            return res.status(400).json({
                success: false,
                message: `Cannot delete: ${itemsUsingType} item(s) are using this diamond type.`,
                itemCount: itemsUsingType
            });
        }

        const result = await Settings.findByIdAndUpdate(
            'global_settings',
            {
                $unset: { [`diamondPricing.${typeId}`]: 1 },
                $pull: { diamondTypes: { id: typeId } },
                $set: { updatedBy: req.user._id }
            },
            { new: true }
        );

        if (!result) {
            return res.status(404).json({
                success: false,
                message: 'Settings not found'
            });
        }

        cache.delete(CACHE_KEYS.SETTINGS);

        res.status(200).json({
            success: true,
            message: 'Diamond type removed successfully'
        });
    } catch (error) {
        next(error);
    }
};

// ============ JEWELRY CATEGORIES CRUD ============
// Mirrors diamond types exactly: add/update/delete/usage-check with isActive toggle

/**
 * Add jewelry category
 * POST /api/settings/categories
 */
exports.addCategory = async (req, res, next) => {
    try {
        const { name, prefix } = req.body;

        if (!name || !prefix) {
            return res.status(400).json({
                success: false,
                message: 'Name and prefix are required'
            });
        }

        // Prevent reserved DEL- prefix
        if (name.toUpperCase().startsWith('DEL-') || prefix.toUpperCase().startsWith('DEL')) {
            return res.status(400).json({
                success: false,
                message: 'Category name and prefix cannot start with "DEL-" (reserved for deleted items)'
            });
        }

        const id = name.toLowerCase().replace(/\s+/g, '_');
        const normalizedPrefix = prefix.toUpperCase().substring(0, 3);

        const settings = await Settings.getSettings();
        const categories = settings.jewelryCategories || [];

        // Check for duplicates (only among active categories, ignore DEL- prefixed)
        for (const c of categories) {
            // Skip soft-deleted categories
            if (c.id.startsWith('DEL-')) continue;

            if (c.id === id) {
                return res.status(400).json({
                    success: false,
                    message: 'Category with this name already exists'
                });
            }
            if (c.prefix === normalizedPrefix) {
                return res.status(400).json({
                    success: false,
                    message: `Prefix "${normalizedPrefix}" is already used by "${c.name}"`
                });
            }
        }

        const newCategory = { id, name, prefix: normalizedPrefix, isActive: true };

        await Settings.findByIdAndUpdate(
            'global_settings',
            {
                $push: { jewelryCategories: newCategory },
                $set: { updatedBy: req.user._id }
            },
            { new: true }
        );

        cache.delete(CACHE_KEYS.SETTINGS);

        res.status(201).json({
            success: true,
            message: 'Category added successfully',
            data: newCategory
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update jewelry category
 * PUT /api/settings/categories/:id
 */
exports.updateCategory = async (req, res, next) => {
    try {
        const categoryId = req.params.id;
        const { name, prefix, isActive } = req.body;

        const settings = await Settings.getSettings();
        const categories = settings.jewelryCategories || [];
        const existingIndex = categories.findIndex(c => c.id === categoryId);

        if (existingIndex === -1) {
            return res.status(404).json({
                success: false,
                message: `Category '${categoryId}' not found`
            });
        }

        const existing = categories[existingIndex];

        // Check for prefix conflict if changing prefix
        if (prefix && prefix !== existing.prefix) {
            const normalizedPrefix = prefix.toUpperCase().substring(0, 3);
            const conflict = categories.find(c => c.id !== categoryId && c.prefix === normalizedPrefix);
            if (conflict) {
                return res.status(400).json({
                    success: false,
                    message: `Prefix "${normalizedPrefix}" is already used by "${conflict.name}"`
                });
            }
        }

        const updatedCategory = {
            id: categoryId,
            name: name ?? existing.name,
            prefix: prefix ? prefix.toUpperCase().substring(0, 3) : existing.prefix,
            isActive: isActive !== undefined ? isActive : (existing.isActive ?? true)
        };

        // Update using positional operator
        await Settings.findOneAndUpdate(
            { _id: 'global_settings', 'jewelryCategories.id': categoryId },
            {
                $set: {
                    'jewelryCategories.$': updatedCategory,
                    updatedBy: req.user._id
                }
            },
            { new: true }
        );

        cache.delete(CACHE_KEYS.SETTINGS);

        res.status(200).json({
            success: true,
            message: 'Category updated successfully',
            data: updatedCategory
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Check category usage
 * GET /api/settings/categories/:id/usage
 */
exports.checkCategoryUsage = async (req, res, next) => {
    try {
        const categoryId = req.params.id;

        const itemCount = await Item.countDocuments({
            'category.id': categoryId,
            deletedAt: null
        });

        res.status(200).json({
            success: true,
            data: {
                categoryId,
                itemCount,
                inUse: itemCount > 0
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Soft-delete category via renaming (mirrors items.deletedAt pattern)
 * DELETE /api/settings/categories/:id
 * 
 * SAFE SOFT DELETE:
 * - Does NOT remove document from DB
 * - Renames id and name with "DEL-" prefix
 * - Sets isActive = false
 * - Existing item references remain valid (they keep old category.id)
 * - Allows reuse of old category names for new categories
 */
exports.removeCategory = async (req, res, next) => {
    try {
        const categoryId = req.params.id;

        // Prevent double-delete
        if (categoryId.startsWith('DEL-')) {
            return res.status(400).json({
                success: false,
                message: 'Category is already deleted'
            });
        }

        const settings = await Settings.getSettings();
        const categories = settings.jewelryCategories || [];
        const existingIndex = categories.findIndex(c => c.id === categoryId);

        if (existingIndex === -1) {
            return res.status(404).json({
                success: false,
                message: `Category '${categoryId}' not found`
            });
        }

        const existing = categories[existingIndex];

        // Create soft-deleted version with DEL- prefix
        const deletedCategory = {
            id: `DEL-${categoryId}`,
            name: `DEL-${existing.name}`,
            prefix: existing.prefix, // Keep prefix for historical reference
            isActive: false,
            deletedAt: new Date().toISOString()
        };

        // Update using positional operator to replace in-place
        await Settings.findOneAndUpdate(
            { _id: 'global_settings', 'jewelryCategories.id': categoryId },
            {
                $set: {
                    'jewelryCategories.$': deletedCategory,
                    updatedBy: req.user._id
                }
            },
            { new: true }
        );

        cache.delete(CACHE_KEYS.SETTINGS);

        res.status(200).json({
            success: true,
            message: 'Category removed successfully'
        });
    } catch (error) {
        next(error);
    }
};
