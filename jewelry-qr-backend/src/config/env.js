/**
 * Environment Configuration with Validation
 * Production-ready with secure defaults
 */

require('dotenv').config();

// Validate required environment variables in production
const validateEnv = () => {
    const required = ['JWT_SECRET'];
    const nodeEnv = process.env.NODE_ENV || 'development';

    if (nodeEnv === 'production') {
        const missing = required.filter(key => !process.env[key]);
        if (missing.length > 0) {
            throw new Error(`Missing required environment variables: ${missing.join(', ')}`);
        }

        // Validate JWT secret strength
        if (process.env.JWT_SECRET && process.env.JWT_SECRET.length < 32) {
            throw new Error('JWT_SECRET must be at least 32 characters for production');
        }
    }
};

validateEnv();

module.exports = {
    // Database
    mongoUri: process.env.MONGO_URI || 'mongodb://localhost:27017/jewelqr',

    // JWT
    jwtSecret: process.env.JWT_SECRET || 'default_secret_change_me_in_production',
    jwtExpiresIn: process.env.JWT_EXPIRES_IN || '7d',
    jwtRefreshExpiresIn: process.env.JWT_REFRESH_EXPIRES_IN || '30d',

    // Server
    port: parseInt(process.env.PORT, 10) || 3000,
    nodeEnv: process.env.NODE_ENV || 'development',

    // CORS
    corsOrigin: process.env.CORS_ORIGIN || 'http://localhost:8000',

    // Rate Limiting
    rateLimitWindowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS, 10) || 60000,
    rateLimitMaxRequests: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS, 10) || 100,
    loginRateLimitWindowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS, 10) || 900000,
    loginRateLimitMaxRequests: parseInt(process.env.LOGIN_RATE_LIMIT_MAX_REQUESTS, 10) || 5,

    // Logging
    logLevel: process.env.LOG_LEVEL || 'info',

    // Security
    cookieSecret: process.env.COOKIE_SECRET || process.env.JWT_SECRET,
    cookieSecure: process.env.COOKIE_SECURE === 'true',
    cookieSameSite: process.env.COOKIE_SAME_SITE || 'lax'
};
