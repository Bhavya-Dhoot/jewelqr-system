const express = require('express');
const router = express.Router();
const Item = require('../models/Item');
const Settings = require('../models/Settings');

/**
 * GET /api/public/items/:sku
 * Public endpoint for scan page - returns minimal item data needed for pricing
 * Supports both diamond and legacy polki items
 */
router.get('/items/:sku', async (req, res, next) => {
    try {
        const { sku } = req.params;

        // Find item by SKU (case-insensitive, exclude soft-deleted)
        const item = await Item.findOne({
            sku: sku.toUpperCase(),
            deletedAt: null
        }).select('sku name articleType category gold diamonds polkiStones createdAt');

        if (!item) {
            return res.status(404).json({
                success: false,
                message: 'Item not found'
            });
        }

        // Return minimal data for scan pricing
        res.status(200).json({
            success: true,
            data: {
                sku: item.sku,
                name: item.name,
                articleType: item.articleType || 'diamond',
                category: item.category,
                gold: item.gold,
                diamonds: item.diamonds || [],
                polkiStones: item.polkiStones || [], // Legacy support
                createdAt: item.createdAt
            }
        });
    } catch (error) {
        next(error);
    }
});

/**
 * GET /api/public/settings
 * Public endpoint for scan page - returns only pricing data needed for calculation
 */
router.get('/settings', async (req, res, next) => {
    try {
        const settings = await Settings.findOne({ _id: 'global_settings' });

        if (!settings) {
            // Return default pricing if no settings exist
            return res.status(200).json({
                success: true,
                data: {
                    diamondPricing: {
                        solitaire: { label: 'Solitaire', realRate: 100000, cvdRate: 50000 },
                        rd: { label: 'RD', realRate: 50000, cvdRate: 25000 },
                        mq: { label: 'MQ', realRate: 45000, cvdRate: 22500 },
                        round: { label: 'Round', realRate: 38000, cvdRate: 19000 }
                    },
                    polkiPricing: {
                        polki: { name: 'Polki', realRate: 15000 },
                        stone: { name: 'Stone', realRate: 10000 }
                    },
                    rates: {
                        goldRate: 6500,
                        labourRate: 500,
                        taxPercent: 3
                    }
                }
            });
        }

        // Return only pricing-related fields (no admin config)
        res.status(200).json({
            success: true,
            data: {
                diamondPricing: settings.diamondPricing || {},
                polkiPricing: settings.polkiPricing || {},
                rates: {
                    goldRate: settings.rates?.goldRate || 6500,
                    labourRate: settings.rates?.labourRate || 500,
                    taxPercent: settings.rates?.taxPercent || 3
                }
            }
        });
    } catch (error) {
        next(error);
    }
});

module.exports = router;
