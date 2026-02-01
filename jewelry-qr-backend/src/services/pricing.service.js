const { RateTable, PricingRule, Settings } = require('../models');

/**
 * Pricing Service
 * Handles price calculations with support for both legacy and modular modes
 */

// Purity factors for gold value calculation
const DEFAULT_PURITY_FACTORS = {
    '14K': 0.583,
    '18K': 0.75,
    '22K': 0.9167,
    '24K': 0.999
};

// Diamond type normalization map (handles aliases)
const DIAMOND_TYPE_MAP = {
    'marquise': 'mq',
    'markish': 'mq',
    'solitare': 'solitaire',
    'sol': 'solitaire'
};

/**
 * Main calculation function - auto-detects legacy vs modular
 */
async function calculatePrice(item, options = {}) {
    if (item.itemMasterId) {
        return calculateModularPrice(item, options);
    }
    return calculateLegacyPrice(item, options);
}

/**
 * Legacy calculation (v1.3.2 compatible)
 * Used for items without itemMasterId
 */
async function calculateLegacyPrice(item, options = {}) {
    // Get rates from settings or provided options
    let rates;
    if (options.rates) {
        rates = options.rates;
    } else {
        const settings = await Settings.getSettings();
        rates = {
            goldRate: settings.rates.goldRate,
            labourRate: settings.rates.labourRate,
            taxPercent: settings.rates.taxPercent,
            diamondPricing: settings.diamondPricing,
            polkiPricing: settings.polkiPricing
        };
    }

    const breakdown = {
        gold: { weight: 0, purity: '', purityFactor: 0, rate: 0, value: 0 },
        stones: [],
        labour: { weight: 0, rate: 0, value: 0 },
        subtotal: 0,
        tax: { percent: 0, value: 0 },
        total: 0
    };

    // Gold calculation with purity factor
    if (item.gold) {
        const purityFactor = DEFAULT_PURITY_FACTORS[item.gold.purity] || 0.75;
        const goldWeight = item.gold.weight_g || 0;
        const goldValue = goldWeight * rates.goldRate * purityFactor;

        breakdown.gold = {
            weight: goldWeight,
            purity: item.gold.purity,
            purityFactor: purityFactor,
            rate: rates.goldRate,
            value: Math.round(goldValue)
        };
    }

    // Diamond calculation
    if (item.articleType === 'diamond' && item.diamonds && item.diamonds.length > 0) {
        for (const diamond of item.diamonds) {
            const normalizedType = normalizeDiamondType(diamond.type_id);
            const pricing = rates.diamondPricing[normalizedType];

            if (pricing) {
                const rate = diamond.source === 'cvd' ? pricing.cvdRate : pricing.realRate;
                const value = diamond.weight_ct * rate;

                breakdown.stones.push({
                    type: diamond.type_id,
                    typeName: diamond.type_name || normalizedType,
                    source: diamond.source,
                    weight: diamond.weight_ct,
                    rate: rate,
                    value: Math.round(value)
                });
            }
        }
    }

    // Polki/Stone calculation
    if (item.articleType === 'polki' && item.polkiStones && item.polkiStones.length > 0) {
        for (const stone of item.polkiStones) {
            const pricing = rates.polkiPricing[stone.type_id];

            if (pricing) {
                const value = stone.weight_ct * pricing.realRate;

                breakdown.stones.push({
                    type: stone.type_id,
                    typeName: stone.type_name || stone.type_id,
                    source: 'real',
                    weight: stone.weight_ct,
                    rate: pricing.realRate,
                    value: Math.round(value)
                });
            }
        }
    }

    // Labour calculation (rate × weight)
    if (item.gold && item.gold.weight_g) {
        const labourValue = item.gold.weight_g * rates.labourRate;
        breakdown.labour = {
            weight: item.gold.weight_g,
            rate: rates.labourRate,
            value: Math.round(labourValue)
        };
    }

    // Calculate subtotal
    const stonesTotal = breakdown.stones.reduce((sum, s) => sum + s.value, 0);
    breakdown.subtotal = breakdown.gold.value + stonesTotal + breakdown.labour.value;

    // Tax calculation
    breakdown.tax = {
        percent: rates.taxPercent,
        value: Math.round(breakdown.subtotal * rates.taxPercent / 100)
    };

    // Total
    breakdown.total = breakdown.subtotal + breakdown.tax.value;

    return {
        breakdown,
        calculatedAt: new Date(),
        mode: 'legacy',
        version: '1.3.2'
    };
}

/**
 * Modular calculation (v1.4.0+)
 * Used for items with itemMasterId
 */
async function calculateModularPrice(item, options = {}) {
    // Get pricing rule and rate table
    let pricingRule, rateTable;

    if (options.pricingRule && options.rateTable) {
        pricingRule = options.pricingRule;
        rateTable = options.rateTable;
    } else {
        // Load from references
        pricingRule = await PricingRule.findById(item.pricing?.pricingRuleId)
            .populate('rateTableRef');
        rateTable = pricingRule?.rateTableRef;

        // Fallback to active rule
        if (!pricingRule) {
            pricingRule = await PricingRule.getActiveByType(item.articleType);
            rateTable = pricingRule?.rateTableRef;
        }
    }

    if (!pricingRule || !rateTable) {
        // Fallback to legacy if no modular config
        return calculateLegacyPrice(item, options);
    }

    // Use v1 compatible logic
    if (pricingRule.logicType === 'jewelqr_v1_compat') {
        const rates = {
            goldRate: rateTable.rates.goldRate,
            labourRate: rateTable.rates.labourRate,
            taxPercent: rateTable.rates.taxPercent,
            diamondPricing: rateTable.diamondPricing,
            polkiPricing: rateTable.polkiPricing
        };

        const result = await calculateLegacyPrice(item, { rates });

        return {
            ...result,
            mode: 'modular',
            version: '1.4.0',
            pricingRuleId: pricingRule._id,
            pricingRuleVersion: pricingRule.version,
            rateTableId: rateTable._id,
            rateTableVersion: rateTable.version
        };
    }

    // Future: custom logic types
    throw new Error(`Unknown pricing logic type: ${pricingRule.logicType}`);
}

/**
 * Normalize diamond type ID (handle aliases)
 */
function normalizeDiamondType(typeId) {
    if (!typeId) return 'round';
    const normalized = typeId.toLowerCase().trim();
    return DIAMOND_TYPE_MAP[normalized] || normalized;
}

/**
 * Get current rates for display
 */
async function getCurrentRates() {
    // Try modular first
    const rateTable = await RateTable.getActive();
    if (rateTable) {
        return {
            source: 'modular',
            tableId: rateTable._id,
            version: rateTable.version,
            ...rateTable.rates,
            diamondPricing: rateTable.diamondPricing,
            polkiPricing: rateTable.polkiPricing
        };
    }

    // Fallback to legacy settings
    const settings = await Settings.getSettings();
    return {
        source: 'legacy',
        ...settings.rates,
        diamondPricing: settings.diamondPricing,
        polkiPricing: settings.polkiPricing
    };
}

module.exports = {
    calculatePrice,
    calculateLegacyPrice,
    calculateModularPrice,
    normalizeDiamondType,
    getCurrentRates,
    DEFAULT_PURITY_FACTORS,
    DIAMOND_TYPE_MAP
};
