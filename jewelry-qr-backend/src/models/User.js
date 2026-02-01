const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema({
    username: {
        type: String,
        required: [true, 'Username is required'],
        unique: true,
        lowercase: true,
        trim: true,
        minlength: [3, 'Username must be at least 3 characters']
    },
    password: {
        type: String,
        required: [true, 'Password is required'],
        minlength: [6, 'Password must be at least 6 characters'],
        select: false
    },
    name: {
        type: String,
        required: [true, 'Name is required'],
        trim: true
    },
    role: {
        type: String,
        enum: ['admin', 'staff'],
        default: 'staff'
    },
    // RBAC v1.4.0: Account status
    isActive: {
        type: Boolean,
        default: true
    },
    // RBAC v1.4.0: Token version for immediate invalidation
    // Increment to invalidate all existing tokens for this user
    tokenVersion: {
        type: Number,
        default: 0
    }
}, {
    timestamps: true
});

// PERF: Index for role-based queries (username index already created by unique:true)
userSchema.index({ isActive: 1, role: 1 });

// Hash password before saving
userSchema.pre('save', async function (next) {
    if (!this.isModified('password')) return next();
    this.password = await bcrypt.hash(this.password, 12);
    next();
});

// Compare password method
userSchema.methods.comparePassword = async function (candidatePassword) {
    return await bcrypt.compare(candidatePassword, this.password);
};

// Increment token version to invalidate all existing tokens
userSchema.methods.incrementTokenVersion = async function () {
    this.tokenVersion = (this.tokenVersion || 0) + 1;
    await this.save();
    return this.tokenVersion;
};

// Remove password from JSON output
userSchema.methods.toJSON = function () {
    const obj = this.toObject();
    delete obj.password;
    return obj;
};

module.exports = mongoose.model('User', userSchema);
