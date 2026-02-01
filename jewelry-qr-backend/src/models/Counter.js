const mongoose = require('mongoose');

/**
 * Counter model for atomic sequence generation
 * Used for generating unique, sequential SKU numbers
 */
const counterSchema = new mongoose.Schema({
    _id: {
        type: String,
        required: true
    },
    seq: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

/**
 * Get next sequence number atomically
 * @param {string} name - Counter name (e.g., 'sku')
 * @returns {Promise<number>} Next sequence number
 */
counterSchema.statics.getNextSequence = async function (name) {
    const counter = await this.findByIdAndUpdate(
        name,
        { $inc: { seq: 1 } },
        { new: true, upsert: true }
    );
    return counter.seq;
};

module.exports = mongoose.model('Counter', counterSchema);
