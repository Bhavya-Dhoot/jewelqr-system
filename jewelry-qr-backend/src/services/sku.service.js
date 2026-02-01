/**
 * SKU Generation Service
 * Uses atomic MongoDB counter for guaranteed unique SKUs
 */

const Counter = require('../models/Counter');

/**
 * Convert number to base36 alphanumeric string
 * @param {number} num - Number to convert
 * @param {number} length - Desired length (padded with zeros)
 * @returns {string} Base36 string
 */
function toBase36(num, length = 6) {
    return num.toString(36).toUpperCase().padStart(length, '0');
}

/**
 * Generate unique SKU atomically
 * Uses MongoDB counter with $inc for guaranteed uniqueness
 * 
 * @param {string} prefix - Category prefix (e.g., 'CHN', 'BNG')
 * @returns {Promise<string>} Full SKU (e.g., 'CHN-A00001')
 */
async function generateSKU(prefix = 'OTH') {
    // Get next sequence number atomically
    const seq = await Counter.getNextSequence('sku');

    // Convert to base36 for shorter representation
    const uniqueId = toBase36(seq, 6);

    return `${prefix.toUpperCase()}-${uniqueId}`;
}

/**
 * Generate SKU synchronously (fallback, NOT RECOMMENDED)
 * Only use if async is not possible
 * WARNING: Race condition possible!
 */
function generateSKUSync(prefix = 'OTH') {
    const timestamp = Date.now();
    const random = Math.random().toString(36).substring(2, 8).toUpperCase();
    return `${prefix.toUpperCase()}-${random}`;
}

module.exports = {
    generateSKU,
    generateSKUSync,
    toBase36
};

