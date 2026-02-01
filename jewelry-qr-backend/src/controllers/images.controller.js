const Item = require('../models/Item');
const imageService = require('../services/image.service');

/**
 * Images Controller
 * Handles image upload, delete, and replace operations
 */

/**
 * Upload images for an item
 * POST /api/items/:sku/images
 */
exports.uploadImages = async (req, res, next) => {
    try {
        const { sku } = req.params;

        // Find item first
        const item = await Item.findOne({ sku: sku.toUpperCase() });
        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found'
            });
        }

        // Initialize images if not exists
        if (!item.images) {
            item.images = { primary: null, gallery: [] };
        }

        const uploadedPaths = { primary: null, gallery: [] };

        // Handle primary image
        if (req.files && req.files.primary && req.files.primary[0]) {
            const primaryBuffer = req.files.primary[0].buffer;
            const primaryPath = await imageService.saveImage(primaryBuffer, sku, 'primary');
            item.images.primary = primaryPath;
            uploadedPaths.primary = primaryPath;
        }

        // Handle gallery images
        if (req.files && req.files.gallery) {
            for (const file of req.files.gallery) {
                const nextNum = await imageService.getNextGalleryNumber(sku);
                if (nextNum > 6) break; // Max 6 gallery images

                const galleryPath = await imageService.saveImage(file.buffer, sku, nextNum.toString());
                item.images.gallery.push(galleryPath);
                uploadedPaths.gallery.push(galleryPath);
            }
        }

        await item.save();

        res.status(200).json({
            success: true,
            message: 'Images uploaded successfully',
            data: {
                images: item.images,
                uploaded: uploadedPaths
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Delete a specific image
 * DELETE /api/items/:sku/images/:filename
 */
exports.deleteImage = async (req, res, next) => {
    try {
        const { sku, filename } = req.params;

        // Find item
        const item = await Item.findOne({ sku: sku.toUpperCase() });
        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found'
            });
        }

        // Delete file from disk
        const deleted = await imageService.deleteImage(sku, filename);

        if (!deleted) {
            return res.status(404).json({
                success: false,
                message: 'Image file not found'
            });
        }

        // Update database
        const relativePath = `/uploads/items/${sku}/${filename}`;

        if (item.images.primary === relativePath) {
            item.images.primary = null;
        } else {
            item.images.gallery = item.images.gallery.filter(p => p !== relativePath);
        }

        await item.save();

        res.status(200).json({
            success: true,
            message: 'Image deleted successfully',
            data: { images: item.images }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Replace primary image
 * PUT /api/items/:sku/images/primary
 */
exports.replacePrimary = async (req, res, next) => {
    try {
        const { sku } = req.params;

        // Find item
        const item = await Item.findOne({ sku: sku.toUpperCase() });
        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found'
            });
        }

        if (!req.file) {
            return res.status(400).json({
                success: false,
                message: 'No image file provided'
            });
        }

        // Initialize images if not exists
        if (!item.images) {
            item.images = { primary: null, gallery: [] };
        }

        // Delete old primary if exists
        if (item.images.primary) {
            await imageService.deleteImage(sku, 'primary.webp');
        }

        // Save new primary
        const primaryPath = await imageService.saveImage(req.file.buffer, sku, 'primary');
        item.images.primary = primaryPath;

        await item.save();

        res.status(200).json({
            success: true,
            message: 'Primary image replaced successfully',
            data: { images: item.images }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * Get images for an item
 * GET /api/items/:sku/images
 */
exports.getImages = async (req, res, next) => {
    try {
        const { sku } = req.params;

        const item = await Item.findOne({ sku: sku.toUpperCase() });
        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                images: item.images || { primary: null, gallery: [] }
            }
        });
    } catch (error) {
        next(error);
    }
};
