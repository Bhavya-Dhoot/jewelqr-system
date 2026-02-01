const fs = require('fs').promises;
const path = require('path');
const sharp = require('sharp');

/**
 * Image Service
 * Handles image file operations: save, delete, convert to WebP
 */

// Base upload directory
const UPLOADS_DIR = path.join(__dirname, '../../uploads/items');

/**
 * Ensure upload directory exists for a given SKU
 * @param {string} sku - Item SKU
 * @returns {Promise<string>} Path to SKU directory
 */
async function ensureUploadDir(sku) {
    const dir = path.join(UPLOADS_DIR, sku);
    await fs.mkdir(dir, { recursive: true });
    return dir;
}

/**
 * Save image buffer to disk as WebP
 * @param {Buffer} buffer - Image buffer from multer
 * @param {string} sku - Item SKU
 * @param {string} filename - Filename (without extension)
 * @returns {Promise<string>} Relative path to saved image
 */
async function saveImage(buffer, sku, filename) {
    const dir = await ensureUploadDir(sku);
    const webpFilename = `${filename}.webp`;
    const fullPath = path.join(dir, webpFilename);

    // Convert to WebP using sharp
    await sharp(buffer)
        .webp({ quality: 85 })
        .resize(1200, 1200, {
            fit: 'inside',
            withoutEnlargement: true
        })
        .toFile(fullPath);

    // Return relative path for storage in DB
    return `/uploads/items/${sku}/${webpFilename}`;
}

/**
 * Delete an image file
 * @param {string} sku - Item SKU
 * @param {string} filename - Filename (with extension)
 * @returns {Promise<boolean>} True if deleted, false if not found
 */
async function deleteImage(sku, filename) {
    const filePath = path.join(UPLOADS_DIR, sku, filename);

    try {
        await fs.unlink(filePath);
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false; // File doesn't exist
        }
        throw error;
    }
}

/**
 * Delete all images for an item
 * @param {string} sku - Item SKU
 * @returns {Promise<boolean>} True if directory deleted
 */
async function deleteAllImages(sku) {
    const dir = path.join(UPLOADS_DIR, sku);

    try {
        await fs.rm(dir, { recursive: true, force: true });
        return true;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return false;
        }
        throw error;
    }
}

/**
 * Get next available gallery number
 * @param {string} sku - Item SKU
 * @returns {Promise<number>} Next available number (1-6)
 */
async function getNextGalleryNumber(sku) {
    const dir = path.join(UPLOADS_DIR, sku);

    try {
        const files = await fs.readdir(dir);
        const galleryFiles = files.filter(f => /^\d+\.webp$/.test(f));
        const numbers = galleryFiles.map(f => parseInt(f.split('.')[0]));

        // Find first available number from 1-6
        for (let i = 1; i <= 6; i++) {
            if (!numbers.includes(i)) {
                return i;
            }
        }
        return numbers.length + 1;
    } catch (error) {
        if (error.code === 'ENOENT') {
            return 1; // Directory doesn't exist, start at 1
        }
        throw error;
    }
}

/**
 * Check if SKU directory exists
 * @param {string} sku - Item SKU
 * @returns {Promise<boolean>}
 */
async function imagesDirExists(sku) {
    const dir = path.join(UPLOADS_DIR, sku);
    try {
        await fs.access(dir);
        return true;
    } catch {
        return false;
    }
}

module.exports = {
    ensureUploadDir,
    saveImage,
    deleteImage,
    deleteAllImages,
    getNextGalleryNumber,
    imagesDirExists,
    UPLOADS_DIR
};
