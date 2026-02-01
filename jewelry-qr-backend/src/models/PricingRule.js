const mongoose = require('mongoose');

/**
 * PricingRule Model
 * Defines pricing calculation rules with versioning
 * Supports different logic types for extensibility
 */

const pricingRuleSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 100
    },
    version: {
        type: Number,
        required: true,
        default: 1
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500
    },
    articleType: {
        type: String,
        enum: ['diamond', 'polki', 'both'],
        default: 'both'
    },
    // Logic type determines calculation engine
    logicType: {
        type: String,
        enum: ['jewelqr_v1_compat', 'custom'],
        default: 'jewelqr_v1_compat'
    },
    // Configuration for the pricing logic
    config: {
        // Purity factors for gold value calculation
        purityFactors: {
            type: Map,
            of: Number,
            default: {
                '14K': 0.583,
                '18K': 0.75,
                '22K': 0.9167,
                '24K': 0.999
            }
        },
        // Diamond type normalization mapping
        diamondTypeMapping: {
            type: Map,
            of: String,
            default: {
                'marquise': 'mq',
                'markish': 'mq',
                'solitare': 'solitaire',
                'sol': 'solitaire'
            }
        },
        // Labour calculation formula
        labourFormula: {
            type: String,
            enum: ['rate_x_weight', 'fixed', 'percentage'],
            default: 'rate_x_weight'
        },
        // Additional multipliers
        multipliers: {
            gold: { type: Number, default: 1.0 },
            diamond: { type: Number, default: 1.0 },
            labour: { type: Number, default: 1.0 }
        }
    },
    // Reference to rate table
    rateTableRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'RateTable'
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    }
}, {
    timestamps: true
});

// Compound index for unique version per name
pricingRuleSchema.index({ name: 1, version: 1 }, { unique: true });
pricingRuleSchema.index({ articleType: 1, isActive: 1 });

// Static: Get active rule by article type
pricingRuleSchema.statics.getActiveByType = async function (articleType) {
    return this.findOne({
        articleType: { $in: [articleType, 'both'] },
        isActive: true
    }).sort({ version: -1 }).populate('rateTableRef');
};

// Static: Create new version
pricingRuleSchema.statics.createNewVersion = async function (baseData, userId) {
    const latest = await this.findOne({ name: baseData.name }).sort({ version: -1 });
    const newVersion = latest ? latest.version + 1 : 1;

    return this.create({
        ...baseData,
        version: newVersion,
        isActive: true,
        createdBy: userId
    });
};

module.exports = mongoose.model('PricingRule', pricingRuleSchema);
