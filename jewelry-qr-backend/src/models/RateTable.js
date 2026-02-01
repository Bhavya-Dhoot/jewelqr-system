const mongoose = require('mongoose');

/**
 * RateTable Model
 * Stores versioned rate configurations for pricing calculations
 * Immutable versions - create new version instead of mutating
 */

const rateTableSchema = new mongoose.Schema({
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
    // Core rates
    rates: {
        goldRate: { type: Number, default: 6500 },
        labourRate: { type: Number, default: 500 },
        taxPercent: { type: Number, default: 3 }
    },
    // Diamond pricing by category
    diamondPricing: {
        solitaire: {
            name: { type: String, default: 'Solitaire' },
            realRate: { type: Number, default: 100000 },
            cvdRate: { type: Number, default: 50000 }
        },
        rd: {
            name: { type: String, default: 'RD' },
            realRate: { type: Number, default: 50000 },
            cvdRate: { type: Number, default: 25000 }
        },
        mq: {
            name: { type: String, default: 'MQ' },
            realRate: { type: Number, default: 45000 },
            cvdRate: { type: Number, default: 22500 }
        },
        moti: {
            name: { type: String, default: 'Moti' },
            realRate: { type: Number, default: 40000 },
            cvdRate: { type: Number, default: 20000 }
        },
        pear: {
            name: { type: String, default: 'Pear' },
            realRate: { type: Number, default: 42000 },
            cvdRate: { type: Number, default: 21000 }
        },
        round: {
            name: { type: String, default: 'Round' },
            realRate: { type: Number, default: 38000 },
            cvdRate: { type: Number, default: 19000 }
        }
    },
    // Polki/Stone pricing
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
rateTableSchema.index({ name: 1, version: 1 }, { unique: true });
rateTableSchema.index({ isActive: 1 });

// Static: Get active rate table
rateTableSchema.statics.getActive = async function () {
    return this.findOne({ isActive: true }).sort({ version: -1 });
};

// Static: Create new version (immutable pattern)
rateTableSchema.statics.createNewVersion = async function (baseData, userId) {
    // Find latest version of same name
    const latest = await this.findOne({ name: baseData.name }).sort({ version: -1 });
    const newVersion = latest ? latest.version + 1 : 1;

    // Deactivate previous active tables
    await this.updateMany({ isActive: true }, { isActive: false });

    return this.create({
        ...baseData,
        version: newVersion,
        isActive: true,
        createdBy: userId
    });
};

module.exports = mongoose.model('RateTable', rateTableSchema);
