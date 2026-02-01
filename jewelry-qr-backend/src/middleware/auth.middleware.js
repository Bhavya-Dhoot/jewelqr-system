const jwt = require('jsonwebtoken');
const config = require('../config/env');
const User = require('../models/User');

/**
 * Middleware to protect routes - requires valid JWT
 * RBAC v1.4.0: Also checks isActive and tokenVersion for immediate invalidation
 */
const protect = async (req, res, next) => {
    try {
        let token;

        // Check for Bearer token in header
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (!token) {
            return res.status(401).json({
                success: false,
                message: 'Access denied. No token provided.',
                code: 'NO_TOKEN'
            });
        }

        // Verify token
        const decoded = jwt.verify(token, config.jwtSecret);

        // Find user and attach to request
        const user = await User.findById(decoded.id);
        if (!user) {
            return res.status(401).json({
                success: false,
                message: 'User not found.',
                code: 'USER_NOT_FOUND'
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

        // RBAC v1.4.0: Check token version for immediate invalidation
        const tokenVersion = decoded.tokenVersion || 0;
        const userTokenVersion = user.tokenVersion || 0;
        if (tokenVersion !== userTokenVersion) {
            return res.status(401).json({
                success: false,
                message: 'Session invalidated. Please login again.',
                code: 'SESSION_INVALIDATED'
            });
        }

        req.user = user;
        next();
    } catch (error) {
        if (error.name === 'JsonWebTokenError') {
            return res.status(401).json({
                success: false,
                message: 'Invalid token.',
                code: 'INVALID_TOKEN'
            });
        }
        if (error.name === 'TokenExpiredError') {
            return res.status(401).json({
                success: false,
                message: 'Token expired.',
                code: 'TOKEN_EXPIRED'
            });
        }
        next(error);
    }
};

/**
 * Middleware to restrict to specific roles
 */
const authorize = (...roles) => {
    return (req, res, next) => {
        if (!roles.includes(req.user.role)) {
            return res.status(403).json({
                success: false,
                message: 'Not authorized to access this resource.',
                code: 'INSUFFICIENT_PERMISSIONS'
            });
        }
        next();
    };
};

/**
 * Optional auth - attaches user if token exists but doesn't require it
 */
const optionalAuth = async (req, res, next) => {
    try {
        let token;
        if (req.headers.authorization && req.headers.authorization.startsWith('Bearer')) {
            token = req.headers.authorization.split(' ')[1];
        }

        if (token) {
            const decoded = jwt.verify(token, config.jwtSecret);
            const user = await User.findById(decoded.id);
            if (user && user.isActive !== false) {
                // Also check tokenVersion for optional auth
                const tokenVersion = decoded.tokenVersion || 0;
                const userTokenVersion = user.tokenVersion || 0;
                if (tokenVersion === userTokenVersion) {
                    req.user = user;
                }
            }
        }
        next();
    } catch (error) {
        // Token invalid but that's okay for optional auth
        next();
    }
};

module.exports = { protect, authorize, optionalAuth };
