const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');

/**
 * Generate JWT token with tokenVersion for immediate invalidation support
 */
const generateToken = (userId, tokenVersion) => {
    return jwt.sign(
        { id: userId, tokenVersion: tokenVersion || 0 },
        config.jwtSecret,
        { expiresIn: config.jwtExpiresIn }
    );
};

/**
 * Login user
 * POST /api/auth/login
 */
exports.login = async (req, res, next) => {
    try {
        const { username, password } = req.body;

        // Find user with password
        const user = await User.findOne({ username: username.toLowerCase() }).select('+password');

        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        // RBAC v1.4.0: Check if account is active
        if (user.isActive === false) {
            return res.status(403).json({
                success: false,
                message: 'Account is disabled. Contact administrator.',
                code: 'ACCOUNT_DISABLED'
            });
        }

        // Check password
        const isMatch = await user.comparePassword(password);
        if (!isMatch) {
            return res.status(401).json({
                success: false,
                message: 'Invalid username or password'
            });
        }

        // Generate token with tokenVersion
        const token = generateToken(user._id, user.tokenVersion);

        res.status(200).json({
            success: true,
            message: 'Login successful',
            token,
            user: {
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
 * Get current user
 * GET /api/auth/me
 */
exports.getMe = async (req, res) => {
    res.status(200).json({
        success: true,
        user: {
            id: req.user._id,
            username: req.user.username,
            name: req.user.name,
            role: req.user.role,
            isActive: req.user.isActive
        }
    });
};

/**
 * Logout user (client-side token removal)
 * POST /api/auth/logout
 */
exports.logout = async (req, res) => {
    // JWT is stateless, so logout is handled client-side
    // Token invalidation for security events uses tokenVersion
    res.status(200).json({
        success: true,
        message: 'Logged out successfully'
    });
};
