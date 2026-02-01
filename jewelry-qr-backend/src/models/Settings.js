const mongoose = require('mongoose');

const settingsSchema = new mongoose.Schema({
    _id: {
        type: String,
        default: 'global_settings'
    },
    // Dynamic diamond categories with per-category Real/CVD pricing
    // Now a Map to allow adding new types via Settings UI
    diamondPricing: {
        type: Map,
        of: new mongoose.Schema({
            label: { type: String, required: true },
            realRate: { type: Number, default: 50000 },
            cvdRate: { type: Number, default: 25000 },
            isActive: { type: Boolean, default: true }
        }, { _id: false })
    },
    // Aliases for legacy/variant type IDs (e.g., 'marquise' -> 'mq')
    diamondTypeAliases: {
        type: Map,
        of: String,
        default: new Map([
            ['marquise', 'mq'],
            ['markish', 'mq']
        ])
    },
    // Polki/Stone categories (Real pricing only, no CVD)
    polkiPricing: {
        stone: {
            name: { type: String, default: 'Stone' },
            realRate: { type: Number, default: 15000 }
        },
        polki: {
            name: { type: String, default: 'Polki' },
            realRate: { type: Number, default: 25000 }
        }
    },
    // Keep diamondTypes for backward compatibility (deprecated)
    diamondTypes: [{
        id: { type: String, required: true },
        name: { type: String, required: true },
        rateMultiplier: { type: Number, default: 1.0 }
    }],
    // Jewelry categories - soft delete via renaming (DEL- prefix)
    jewelryCategories: [{
        id: { type: String, required: true },
        name: { type: String, required: true },
        prefix: { type: String, required: true },
        isActive: { type: Boolean, default: true },
        deletedAt: { type: String, default: null } // ISO timestamp when soft-deleted
    }],
    rates: {
        goldRate: { type: Number, default: 6500 },
        // Legacy rates (kept for backward compat, use diamondPricing instead)
        diamondRate: { type: Number, default: 50000 },
        cvdDiamondRate: { type: Number, default: 25000 },
        labourRate: { type: Number, default: 500 },  // Per gram: Labour = Rate × Weight
        taxPercent: { type: Number, default: 3 }
    },
    qrSettings: {
        size: { type: Number, default: 256 },
        color: { type: String, default: '#1A2332' },
        background: { type: String, default: '#FFFFFF' },
        errorLevel: { type: String, default: 'H' }
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Get or create settings (singleton pattern) - ATOMIC with default merging
settingsSchema.statics.getSettings = async function () {
    const defaultDiamondPricing = {
        solitaire: { label: 'Solitaire', realRate: 100000, cvdRate: 50000, isActive: true },
        rd: { label: 'RD', realRate: 50000, cvdRate: 25000, isActive: true },
        mq: { label: 'MQ', realRate: 45000, cvdRate: 22500, isActive: true },
        moti: { label: 'Moti', realRate: 40000, cvdRate: 20000, isActive: true },
        pear: { label: 'Pear', realRate: 42000, cvdRate: 21000, isActive: true },
        round: { label: 'Round', realRate: 38000, cvdRate: 19000, isActive: true }
    };

    const defaultCategories = [
        { id: 'chain', name: 'Chain', prefix: 'CHN', isActive: true },
        { id: 'bangles', name: 'Bangles', prefix: 'BNG', isActive: true },
        { id: 'earrings', name: 'Earrings', prefix: 'EAR', isActive: true },
        { id: 'necklace', name: 'Necklace', prefix: 'NCK', isActive: true },
        { id: 'pendant_set', name: 'Pendant Set', prefix: 'PND', isActive: true },
        { id: 'others', name: 'Others', prefix: 'OTH', isActive: true }
    ];

    const defaults = {
        diamondPricing: defaultDiamondPricing,
        diamondTypeAliases: {
            marquise: 'mq',
            markish: 'mq'
        },
        polkiPricing: {
            stone: { name: 'Stone', realRate: 15000 },
            polki: { name: 'Polki', realRate: 25000 }
        },
        diamondTypes: [
            { id: 'solitaire', name: 'Solitaire', rateMultiplier: 1.0 },
            { id: 'rd', name: 'RD', rateMultiplier: 1.0 },
            { id: 'mq', name: 'MQ', rateMultiplier: 1.0 },
            { id: 'moti', name: 'Moti', rateMultiplier: 1.0 },
            { id: 'pear', name: 'Pear', rateMultiplier: 1.0 },
            { id: 'round', name: 'Round', rateMultiplier: 1.0 }
        ],
        jewelryCategories: defaultCategories
    };

    // First, try to get existing settings
    let settings = await this.findById('global_settings');

    if (!settings) {
        // Create new settings with all defaults
        settings = await this.create({ _id: 'global_settings', ...defaults });
    } else {
        // Check which default diamond types are missing and add them
        const existingPricing = settings.diamondPricing instanceof Map
            ? Object.fromEntries(settings.diamondPricing)
            : (settings.diamondPricing || {});

        const missingTypes = {};
        for (const [typeId, pricing] of Object.entries(defaultDiamondPricing)) {
            if (!existingPricing[typeId]) {
                missingTypes[`diamondPricing.${typeId}`] = pricing;
            }
        }

        // Check for missing default categories and add isActive field to existing ones
        const existingCats = settings.jewelryCategories || [];
        const existingCatIds = new Set(existingCats.map(c => c.id));
        const catsToAdd = defaultCategories.filter(c => !existingCatIds.has(c.id));

        // Migrate existing categories to include isActive if missing
        let needsCatMigration = false;
        for (const cat of existingCats) {
            if (cat.isActive === undefined) {
                needsCatMigration = true;
                break;
            }
        }

        // Build update operations
        const updateOps = {};
        if (Object.keys(missingTypes).length > 0) {
            Object.assign(updateOps, { $set: missingTypes });
        }
        if (catsToAdd.length > 0) {
            updateOps.$push = { jewelryCategories: { $each: catsToAdd } };
        }

        // Apply updates if needed
        if (Object.keys(updateOps).length > 0) {
            settings = await this.findByIdAndUpdate(
                'global_settings',
                updateOps,
                { new: true }
            );
        }

        // Migrate isActive field for categories if needed
        if (needsCatMigration) {
            const migratedCats = existingCats.map(c => ({
                ...c.toObject ? c.toObject() : c,
                isActive: c.isActive ?? true
            }));
            settings = await this.findByIdAndUpdate(
                'global_settings',
                { $set: { jewelryCategories: migratedCats } },
                { new: true }
            );
        }
    }

    return settings;
};


module.exports = mongoose.model('Settings', settingsSchema);
