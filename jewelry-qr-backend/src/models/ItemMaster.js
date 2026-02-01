const mongoose = require('mongoose');

/**
 * ItemMaster Model
 * Reusable templates/configurations for creating items
 * References attribute schemas and pricing rules
 */

const itemMasterSchema = new mongoose.Schema({
    name: {
        type: String,
        required: true,
        trim: true,
        maxlength: 200
    },
    description: {
        type: String,
        trim: true,
        maxlength: 500
    },
    // Category configuration (same shape as Item)
    category: {
        id: {
            type: String,
            required: true
        },
        name: {
            type: String,
            required: true
        },
        prefix: {
            type: String,
            required: true,
            maxlength: 4
        }
    },
    articleType: {
        type: String,
        enum: ['diamond', 'polki'],
        required: true
    },
    // Reference to attribute schema
    schemaRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'AttributeSchema'
    },
    // Reference to pricing rule
    pricingRuleRef: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'PricingRule'
    },
    // Default values for quick item creation
    defaults: {
        gold: {
            purity: {
                type: String,
                enum: ['14K', '18K', '22K', '24K'],
                default: '18K'
            },
            weight_g: {
                type: Number,
                default: null
            }
        },
        diamonds: [{
            type_id: String,
            type_name: String,
            source: {
                type: String,
                enum: ['real', 'cvd']
            },
            source_name: String,
            weight_ct: Number
        }],
        polkiStones: [{
            type_id: {
                type: String,
                enum: ['stone', 'polki']
            },
            type_name: String,
            weight_ct: Number
        }]
    },
    // Display order for UI
    sortOrder: {
        type: Number,
        default: 0
    },
    isActive: {
        type: Boolean,
        default: true
    },
    createdBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    updatedBy: {
        type: mongoose.Schema.Types.ObjectId,
        ref: 'User'
    },
    deletedAt: {
        type: Date,
        default: null
    }
}, {
    timestamps: true
});

// Indexes
itemMasterSchema.index({ articleType: 1, isActive: 1 });
itemMasterSchema.index({ 'category.id': 1 });
itemMasterSchema.index({ sortOrder: 1 });

// Exclude soft-deleted by default
itemMasterSchema.pre(/^find/, function (next) {
    if (this.getQuery().deletedAt !== undefined) {
        return next();
    }
    this.where({ deletedAt: null });
    next();
});

// Static: Get active masters
itemMasterSchema.statics.getActive = async function (articleType = null) {
    const query = { isActive: true };
    if (articleType) {
        query.articleType = articleType;
    }
    return this.find(query)
        .populate('schemaRef')
        .populate('pricingRuleRef')
        .sort({ sortOrder: 1, name: 1 });
};

// Static: Get by ID with populated refs
itemMasterSchema.statics.getById = async function (id) {
    return this.findById(id)
        .populate('schemaRef')
        .populate('pricingRuleRef');
};

module.exports = mongoose.model('ItemMaster', itemMasterSchema);
