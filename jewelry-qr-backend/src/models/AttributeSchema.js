const mongoose = require('mongoose');

/**
 * AttributeSchema Model
 * Defines dynamic field schemas for item attributes
 * Used by ItemMaster to specify what fields an item should have
 */

const fieldDefinitionSchema = new mongoose.Schema({
    key: {
        type: String,
        required: true,
        trim: true
    },
    label: {
        type: String,
        required: true,
        trim: true
    },
    type: {
        type: String,
        enum: ['number', 'text', 'enum', 'boolean'],
        required: true
    },
    required: {
        type: Boolean,
        default: false
    },
    // For number type
    min: Number,
    max: Number,
    step: Number,
    // For enum type
    enumOptions: [String],
    enumSource: String, // Reference to settings list (e.g., "diamondTypes")
    // Pricing engine role
    pricingRole: {
        type: String,
        enum: [
            'goldWeight',
            'goldPurity',
            'diamondWeight',
            'diamondType',
            'diamondSource',
            'polkiWeight',
            'polkiType',
            'labourWeight',
            null
        ],
        default: null
    },
    // Default value
    defaultValue: mongoose.Schema.Types.Mixed
}, { _id: false });

const attributeSchemaSchema = new mongoose.Schema({
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
    fields: [fieldDefinitionSchema],
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
attributeSchemaSchema.index({ name: 1, version: 1 }, { unique: true });
attributeSchemaSchema.index({ articleType: 1, isActive: 1 });

// Static: Get active schema by article type
attributeSchemaSchema.statics.getActiveByType = async function (articleType) {
    return this.findOne({
        articleType: { $in: [articleType, 'both'] },
        isActive: true
    }).sort({ version: -1 });
};

// Static: Create new version
attributeSchemaSchema.statics.createNewVersion = async function (baseData, userId) {
    const latest = await this.findOne({ name: baseData.name }).sort({ version: -1 });
    const newVersion = latest ? latest.version + 1 : 1;

    return this.create({
        ...baseData,
        version: newVersion,
        isActive: true,
        createdBy: userId
    });
};

module.exports = mongoose.model('AttributeSchema', attributeSchemaSchema);
