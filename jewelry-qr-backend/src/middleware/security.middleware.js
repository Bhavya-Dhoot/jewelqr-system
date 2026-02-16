/**
 * Security Middleware Module
 * Helmet, sanitization, rate limiting, parameter pollution prevention
 */

const helmet = require('helmet');
const mongoSanitize = require('express-mongo-sanitize');
const hpp = require('hpp');
const rateLimit = require('express-rate-limit');
const config = require('../config/env');

/**
 * Helmet security headers configuration
 */
const helmetConfig = helmet({
    contentSecurityPolicy: {
        directives: {
            defaultSrc: ["'self'"],
            scriptSrc: ["'self'", "'unsafe-inline'", "'unsafe-eval'", "https://cdn.jsdelivr.net"],
            styleSrc: ["'self'", "'unsafe-inline'", "https://fonts.googleapis.com"],
            fontSrc: ["'self'", "https://fonts.gstatic.com"],
            imgSrc: ["'self'", "data:", "blob:"],
            connectSrc: ["'self'"],
            frameSrc: ["'none'"],
            objectSrc: ["'none'"],
            upgradeInsecureRequests: config.nodeEnv === 'production' ? [] : null
        }
    },
    crossOriginEmbedderPolicy: false,
    crossOriginResourcePolicy: { policy: "cross-origin" },
    dnsPrefetchControl: { allow: false },
    frameguard: { action: 'sameorigin' },
    hidePoweredBy: true,
    hsts: {
        maxAge: 31536000,
        includeSubDomains: true,
        preload: true
    },
    ieNoOpen: true,
    noSniff: true,
    originAgentCluster: true,
    permittedCrossDomainPolicies: { permittedPolicies: 'none' },
    referrerPolicy: { policy: 'strict-origin-when-cross-origin' },
    xssFilter: true
});

/**
 * MongoDB query injection sanitization
 */
const mongoSanitizeConfig = mongoSanitize({
    replaceWith: '_',
    onSanitize: ({ req, key }) => {
        console.warn(`Sanitized potentially malicious key: ${key} from ${req.ip}`);
    }
});

/**
 * HTTP Parameter Pollution prevention
 */
const hppConfig = hpp({
    whitelist: ['sort', 'fields', 'page', 'limit', 'filter']
});

/**
 * Rate limiters with configurable limits
 */
const createRateLimiter = (options) => {
    return rateLimit({
        windowMs: options.windowMs || 60 * 1000,
        max: options.max || 100,
        message: {
            success: false,
            message: options.message || 'Too many requests, please try again later.'
        },
        standardHeaders: true,
        legacyHeaders: false
    });
};


// Pre-configured rate limiters
const rateLimiters = {
    // Strict: Login attempts (5 per 15 min)
    login: createRateLimiter({
        windowMs: parseInt(process.env.LOGIN_RATE_LIMIT_WINDOW_MS) || 15 * 60 * 1000,
        max: parseInt(process.env.LOGIN_RATE_LIMIT_MAX_REQUESTS) || 5,
        message: 'Too many login attempts, please try again in 15 minutes.'
    }),

    // Medium: Auth endpoints (20 per 5 min)
    auth: createRateLimiter({
        windowMs: parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS) || 5 * 60 * 1000,
        max: parseInt(process.env.AUTH_RATE_LIMIT_MAX_REQUESTS) || 20,
        message: 'Too many authentication requests, please try again later.'
    }),

    // General: API endpoints (100 per min)
    api: createRateLimiter({
        windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60 * 1000,
        max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
        message: 'Too many requests, please try again later.'
    }),

    // Uploads: File uploads (10 per min)
    uploads: createRateLimiter({
        windowMs: 60 * 1000,
        max: 10,
        message: 'Too many upload requests, please try again later.'
    })
};

/**
 * Cookie security options
 */
const cookieOptions = {
    httpOnly: true,
    secure: config.nodeEnv === 'production',
    sameSite: config.nodeEnv === 'production' ? 'strict' : 'lax',
    maxAge: 7 * 24 * 60 * 60 * 1000 // 7 days
};

module.exports = {
    helmetConfig,
    mongoSanitizeConfig,
    hppConfig,
    rateLimiters,
    cookieOptions,
    createRateLimiter
};
