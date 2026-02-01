const Item = require('../models/Item');
const { generateSKU } = require('../services/sku.service');
const { cache, CACHE_KEYS } = require('../services/cache.service');

/**
 * Create new item
 * POST /api/items
 * SKU is generated server-side to prevent race conditions
 */
exports.createItem = async (req, res, next) => {
    try {
        // Generate SKU server-side (ignore any client-provided SKU)
        const prefix = req.body.category?.prefix || 'OTH';
        const sku = await generateSKU(prefix);

        const itemData = {
            ...req.body,
            sku, // Server-generated SKU (overrides any client SKU)
            createdBy: req.user._id
        };

        const item = await Item.create(itemData);

        // Invalidate dashboard cache on create
        cache.deletePattern('dashboard:');

        res.status(201).json({
            success: true,
            message: 'Item created successfully',
            data: item
        });
    } catch (error) {
        if (error.code === 11000) {
            return res.status(409).json({
                success: false,
                message: 'SKU collision - please try again'
            });
        }
        next(error);
    }
};

/**
 * Get all items (paginated)
 * GET /api/items
 * OPTIMIZED: Uses lean() for faster read
 */
exports.getItems = async (req, res, next) => {
    try {
        const page = parseInt(req.query.page) || 1;
        const limit = Math.min(parseInt(req.query.limit) || 20, 100); // Max 100
        const skip = (page - 1) * limit;

        const query = {};

        // Filter by category
        if (req.query.category) {
            query['category.id'] = req.query.category;
        }

        // Search by SKU or name (sanitize regex)
        if (req.query.search) {
            const searchTerm = req.query.search.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
            query.$or = [
                { sku: { $regex: searchTerm, $options: 'i' } },
                { name: { $regex: searchTerm, $options: 'i' } }
            ];
        }

        // OPTIMIZED: Parallel queries with lean()
        const [items, total] = await Promise.all([
            Item.find(query)
                .sort({ createdAt: -1 })
                .skip(skip)
                .limit(limit)
                .select('sku name category gold diamonds polkiStones articleType createdAt deletedAt images')
                .lean(),
            Item.countDocuments(query)
        ]);

        res.status(200).json({
            success: true,
            data: items,
            pagination: {
                page,
                limit,
                total,
                pages: Math.ceil(total / limit)
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get single item by SKU
 * GET /api/items/:sku
 * OPTIMIZED: Uses lean() for read
 */
exports.getItemBySku = async (req, res, next) => {
    try {
        const sku = req.params.sku.toUpperCase();

        // OPTIMIZED: lean() for faster read
        const item = await Item.findOne({ sku })
            .select('-__v -qrData')
            .lean();

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found'
            });
        }

        res.status(200).json({
            success: true,
            data: item
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Update item (with ownership validation)
 * PUT /api/items/:sku
 */
exports.updateItem = async (req, res, next) => {
    try {
        // First find the item to check ownership
        const item = await Item.findOne({ sku: req.params.sku.toUpperCase() });

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found'
            });
        }

        // Check ownership: only owner or admin can update
        if (item.createdBy.toString() !== req.user._id.toString() && req.user.role !== 'admin') {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to edit this item'
            });
        }

        // Update fields
        Object.assign(item, req.body);
        item.updatedBy = req.user._id;

        // Save triggers pre-save hook for qrData sync
        await item.save();

        // Invalidate dashboard cache on update
        cache.deletePattern('dashboard:');

        res.status(200).json({
            success: true,
            message: 'Item updated successfully',
            data: item
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Soft delete item (admin only)
 * DELETE /api/items/:sku
 * Also renames uploads folder to DEL-{sku}
 */
exports.deleteItem = async (req, res, next) => {
    try {
        const sku = req.params.sku.toUpperCase();
        const item = await Item.findOne({ sku });

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found'
            });
        }

        // Soft delete: set deletedAt and deletedBy
        item.deletedAt = new Date();
        item.deletedBy = req.user._id;
        await item.save();

        // Rename uploads folder to DEL-{sku}
        const fs = require('fs');
        const path = require('path');
        const uploadsDir = path.join(__dirname, '../../uploads/items');
        const oldPath = path.join(uploadsDir, sku);
        const newPath = path.join(uploadsDir, `DEL-${sku}`);

        if (fs.existsSync(oldPath)) {
            try {
                fs.renameSync(oldPath, newPath);
                console.log(`Renamed folder: ${sku} -> DEL-${sku}`);
            } catch (renameErr) {
                console.error(`Failed to rename folder ${sku}:`, renameErr.message);
                // Continue even if folder rename fails - item is still soft-deleted
            }
        }

        // Invalidate dashboard cache on delete
        cache.deletePattern('dashboard:');

        res.status(200).json({
            success: true,
            message: 'Item deleted successfully (can be restored)'
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Restore soft-deleted item (admin only)
 * POST /api/items/:sku/restore
 * Also renames uploads folder back from DEL-{sku} to {sku}
 */
exports.restoreItem = async (req, res, next) => {
    try {
        const sku = req.params.sku.toUpperCase();

        // Query including deleted items
        const item = await Item.findOne({
            sku,
            deletedAt: { $ne: null }
        });

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Deleted item not found'
            });
        }

        // Restore: clear deletion fields
        item.deletedAt = null;
        item.deletedBy = null;
        item.updatedBy = req.user._id;
        await item.save();

        // Rename uploads folder back from DEL-{sku} to {sku}
        const fs = require('fs');
        const path = require('path');
        const uploadsDir = path.join(__dirname, '../../uploads/items');
        const deletedPath = path.join(uploadsDir, `DEL-${sku}`);
        const restoredPath = path.join(uploadsDir, sku);

        if (fs.existsSync(deletedPath)) {
            try {
                fs.renameSync(deletedPath, restoredPath);
                console.log(`Restored folder: DEL-${sku} -> ${sku}`);
            } catch (renameErr) {
                console.error(`Failed to restore folder ${sku}:`, renameErr.message);
                // Continue even if folder rename fails - item is still restored in DB
            }
        }

        // Invalidate dashboard cache on restore
        cache.deletePattern('dashboard:');

        res.status(200).json({
            success: true,
            message: 'Item restored successfully',
            data: item
        });
    } catch (error) {
        next(error);
    }
};
