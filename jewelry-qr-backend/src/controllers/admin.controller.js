const User = require('../models/User');
const bcrypt = require('bcryptjs');

/**
 * GET /api/admin/users
 * List all users (admin only)
 */
exports.getUsers = async (req, res, next) => {
    try {
        const users = await User.find().select('-password').sort({ createdAt: -1 });

        res.status(200).json({
            success: true,
            data: users.map(user => ({
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role,
                isActive: user.isActive !== false, // Default to true
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }))
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/admin/users
 * Create new user (admin only)
 */
exports.createUser = async (req, res, next) => {
    try {
        const { username, password, name, role } = req.body;

        // Validate required fields
        if (!username || !password || !name) {
            return res.status(400).json({
                success: false,
                message: 'Username, password, and name are required'
            });
        }

        // Check if username already exists
        const existingUser = await User.findOne({ username: username.toLowerCase() });
        if (existingUser) {
            return res.status(400).json({
                success: false,
                message: 'Username already exists'
            });
        }

        // Create user
        const user = await User.create({
            username: username.toLowerCase(),
            password,
            name,
            role: role || 'staff',
            isActive: true,
            tokenVersion: 0
        });

        res.status(201).json({
            success: true,
            message: 'User created successfully',
            data: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role,
                isActive: user.isActive
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * PUT /api/admin/users/:id
 * Update user (name, role, isActive) - admin only
 */
exports.updateUser = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { name, role, isActive } = req.body;
        const currentUserId = req.user._id.toString();

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Prevent disabling last admin
        if (isActive === false && user.role === 'admin') {
            const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
            if (adminCount <= 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot disable the last active admin',
                    code: 'LAST_ADMIN_PROTECTION'
                });
            }
        }

        // Prevent demoting last admin to staff
        if (role === 'staff' && user.role === 'admin') {
            const adminCount = await User.countDocuments({ role: 'admin', isActive: true });
            if (adminCount <= 1) {
                return res.status(400).json({
                    success: false,
                    message: 'Cannot demote the last admin to staff',
                    code: 'LAST_ADMIN_PROTECTION'
                });
            }
        }

        // Track if we need to invalidate tokens
        let shouldInvalidateToken = false;

        // Update fields
        if (name !== undefined) user.name = name;

        if (role !== undefined && role !== user.role) {
            user.role = role;
            shouldInvalidateToken = true; // Role change = invalidate token
        }

        if (isActive !== undefined && isActive !== user.isActive) {
            user.isActive = isActive;
            if (isActive === false) {
                shouldInvalidateToken = true; // Disable = invalidate token
            }
        }

        // Increment tokenVersion if needed (immediate invalidation)
        if (shouldInvalidateToken) {
            user.tokenVersion = (user.tokenVersion || 0) + 1;
        }

        await user.save();

        res.status(200).json({
            success: true,
            message: 'User updated successfully',
            data: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role,
                isActive: user.isActive,
                tokenInvalidated: shouldInvalidateToken
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * POST /api/admin/users/:id/reset-password
 * Reset user password (admin only)
 */
exports.resetPassword = async (req, res, next) => {
    try {
        const { id } = req.params;
        const { newPassword } = req.body;

        if (!newPassword || newPassword.length < 6) {
            return res.status(400).json({
                success: false,
                message: 'New password must be at least 6 characters'
            });
        }

        const user = await User.findById(id);
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        // Set new password (will be hashed by pre-save hook)
        user.password = newPassword;

        // Increment tokenVersion to invalidate all existing sessions
        user.tokenVersion = (user.tokenVersion || 0) + 1;

        await user.save();

        res.status(200).json({
            success: true,
            message: 'Password reset successfully. User must login again.',
            data: {
                id: user._id,
                username: user.username
            }
        });
    } catch (error) {
        next(error);
    }
};

/**
 * GET /api/admin/users/:id
 * Get single user details (admin only)
 */
exports.getUser = async (req, res, next) => {
    try {
        const { id } = req.params;

        const user = await User.findById(id).select('-password');
        if (!user) {
            return res.status(404).json({
                success: false,
                message: 'User not found'
            });
        }

        res.status(200).json({
            success: true,
            data: {
                id: user._id,
                username: user.username,
                name: user.name,
                role: user.role,
                isActive: user.isActive !== false,
                createdAt: user.createdAt,
                updatedAt: user.updatedAt
            }
        });
    } catch (error) {
        next(error);
    }
};
