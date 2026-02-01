/**
 * JewelQR Backend - Production Hardened Application
 * v1.7.0 - Security Hardening Release
 */

const express = require('express');
const path = require('path');
const cors = require('cors');
const compression = require('compression');
const cookieParser = require('cookie-parser');
const connectDB = require('./config/database');
const config = require('./config/env');
const { initProfiling, requestTimingMiddleware } = require('./middleware/profiling.middleware');
const {
    helmetConfig,
    mongoSanitizeConfig,
    hppConfig,
    rateLimiters,
    cookieOptions
} = require('./middleware/security.middleware');
const { logger, requestLogger, errorLogger } = require('./services/logger.service');
const {
    authRoutes,
    itemsRoutes,
    settingsRoutes,
    dashboardRoutes,
    itemMastersRoutes,
    modularRoutes,
    publicRoutes,
    adminRoutes
} = require('./routes');

// Initialize Express
const app = express();

// =============================================================================
// SECURITY CONFIGURATION
// =============================================================================

// Trust proxy for accurate IP detection behind reverse proxy
app.set('trust proxy', 1);

// Disable x-powered-by header
app.disable('x-powered-by');

// =============================================================================
// CORE MIDDLEWARE (ORDER MATTERS)
// =============================================================================

// 1. Helmet security headers (FIRST)
app.use(helmetConfig);

// 2. Request logging
if (config.nodeEnv === 'production') {
    app.use(requestLogger);
}

// 3. GZIP compression
app.use(compression({
    level: 6,
    threshold: 1024,
    filter: (req, res) => {
        if (req.headers['x-no-compression']) return false;
        return compression.filter(req, res);
    }
}));

// 4. Cookie parser with secret
app.use(cookieParser(process.env.COOKIE_SECRET || config.jwtSecret));

// 5. Body parsers with size limits
app.use(express.json({
    limit: '10kb',
    strict: true
}));
app.use(express.urlencoded({
    extended: true,
    limit: '10kb'
}));

// 6. MongoDB query injection sanitization
app.use(mongoSanitizeConfig);

// 7. HTTP Parameter Pollution prevention
app.use(hppConfig);

// =============================================================================
// CORS CONFIGURATION
// =============================================================================

const allowedOrigins = [
    'http://localhost:8000',
    'http://localhost:8080',
    'http://127.0.0.1:8000',
    config.corsOrigin
].filter(Boolean);

// Production: strict CORS
const corsOptions = {
    origin: function (origin, callback) {
        // Allow requests with no origin (mobile apps, curl, etc.)
        if (!origin) {
            return callback(null, true);
        }

        if (config.nodeEnv === 'production') {
            // Strict origin check in production
            if (allowedOrigins.includes(origin)) {
                callback(null, true);
            } else {
                logger.warn({ origin }, 'CORS blocked request');
                callback(new Error('Not allowed by CORS'));
            }
        } else {
            // Allow all in development
            callback(null, true);
        }
    },
    credentials: true,
    methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'],
    allowedHeaders: ['Content-Type', 'Authorization', 'X-Request-ID'],
    exposedHeaders: ['X-Request-ID'],
    maxAge: 86400 // 24 hours
};

app.use(cors(corsOptions));

// =============================================================================
// DATABASE CONNECTION
// =============================================================================

connectDB();

// =============================================================================
// PROFILING (Development only)
// =============================================================================

initProfiling();
app.use(requestTimingMiddleware);

// =============================================================================
// STATIC FILE SERVING
// =============================================================================

app.use('/uploads', express.static(path.join(__dirname, '../uploads'), {
    maxAge: '1d',
    etag: true,
    lastModified: true,
    index: false,
    dotfiles: 'deny'
}));

// =============================================================================
// RATE LIMITING
// =============================================================================

// Login: Strictest (5 per 15 min)
app.use('/api/auth/login', rateLimiters.login);

// Auth: Medium (20 per 5 min)
app.use('/api/auth', rateLimiters.auth);

// General API: Standard (100 per min)
app.use('/api', rateLimiters.api);

// =============================================================================
// API ROUTES
// =============================================================================

// Public routes (no auth)
app.use('/api/public', publicRoutes);

// Auth routes
app.use('/api/auth', authRoutes);

// Protected routes
app.use('/api/items', itemsRoutes);
app.use('/api/settings', settingsRoutes);
app.use('/api/dashboard', dashboardRoutes);

// Admin routes
app.use('/api/admin', adminRoutes);

// Modular architecture routes
app.use('/api/item-masters', itemMastersRoutes);
app.use('/api/modular', modularRoutes);

// =============================================================================
// HEALTH CHECK
// =============================================================================

app.get('/api/health', (req, res) => {
    const { cache } = require('./services/cache.service');
    res.status(200).json({
        success: true,
        message: 'JewelQR API is running',
        environment: config.nodeEnv,
        timestamp: new Date().toISOString(),
        cache: cache.getStats(),
        uptime: process.uptime()
    });
});

// =============================================================================
// ERROR HANDLING
// =============================================================================

// 404 handler
app.use((req, res) => {
    res.status(404).json({
        success: false,
        message: `Route ${req.originalUrl} not found`
    });
});

// Error logger
app.use(errorLogger);

// Global error handler
app.use((err, req, res, next) => {
    // CORS error
    if (err.message === 'Not allowed by CORS') {
        return res.status(403).json({
            success: false,
            message: 'Cross-origin request blocked'
        });
    }

    // Mongoose validation error
    if (err.name === 'ValidationError') {
        const errors = Object.values(err.errors).map(e => e.message);
        return res.status(400).json({
            success: false,
            message: 'Validation Error',
            errors
        });
    }

    // JWT errors
    if (err.name === 'JsonWebTokenError') {
        return res.status(401).json({
            success: false,
            message: 'Invalid token'
        });
    }

    if (err.name === 'TokenExpiredError') {
        return res.status(401).json({
            success: false,
            message: 'Token expired'
        });
    }

    // Rate limit error
    if (err.status === 429) {
        return res.status(429).json({
            success: false,
            message: 'Too many requests'
        });
    }

    // Log error in production
    if (config.nodeEnv === 'production') {
        logger.error({ err }, 'Unhandled error');
    } else {
        console.error('Error:', err);
    }

    // Default error response
    res.status(err.statusCode || 500).json({
        success: false,
        message: config.nodeEnv === 'production'
            ? 'Internal Server Error'
            : err.message || 'Internal Server Error'
    });
});

// =============================================================================
// SERVER START
// =============================================================================

const PORT = config.port;
const server = app.listen(PORT, () => {
    console.log(`🚀 Server running on port ${PORT} in ${config.nodeEnv} mode`);
    if (config.nodeEnv === 'production') {
        logger.info({ port: PORT, env: config.nodeEnv }, 'Server started');
    }
});

// Socket optimization
server.keepAliveTimeout = 65000;
server.headersTimeout = 66000;

// =============================================================================
// GRACEFUL SHUTDOWN
// =============================================================================

const gracefulShutdown = (signal) => {
    console.log(`\n${signal} received. Shutting down gracefully...`);

    server.close(() => {
        console.log('HTTP server closed');

        // Close database connection
        require('mongoose').connection.close(false, () => {
            console.log('MongoDB connection closed');
            process.exit(0);
        });
    });

    // Force exit after 10 seconds
    setTimeout(() => {
        console.error('Forced shutdown after timeout');
        process.exit(1);
    }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Unhandled rejections
process.on('unhandledRejection', (err) => {
    console.error('Unhandled Rejection:', err);
    if (config.nodeEnv === 'production') {
        logger.fatal({ err }, 'Unhandled rejection - shutting down');
        gracefulShutdown('UNHANDLED_REJECTION');
    }
});

// Uncaught exceptions
process.on('uncaughtException', (err) => {
    console.error('Uncaught Exception:', err);
    if (config.nodeEnv === 'production') {
        logger.fatal({ err }, 'Uncaught exception - shutting down');
    }
    process.exit(1);
});

module.exports = app;
