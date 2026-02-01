/**
 * JewelQR Production Logger Service
 * Structured JSON logging with request tracking
 */

const pino = require('pino');
const config = require('../config/env');

// Create base logger
const logger = pino({
    level: process.env.LOG_LEVEL || (config.nodeEnv === 'production' ? 'info' : 'debug'),
    formatters: {
        level: (label) => ({ level: label }),
        bindings: () => ({})
    },
    timestamp: pino.stdTimeFunctions.isoTime,
    ...(config.nodeEnv === 'development' && {
        transport: {
            target: 'pino-pretty',
            options: {
                colorize: true,
                translateTime: 'SYS:standard',
                ignore: 'pid,hostname'
            }
        }
    })
});

// Request logger middleware
const requestLogger = (req, res, next) => {
    const start = Date.now();
    const requestId = req.headers['x-request-id'] || `req_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;

    // Attach request ID
    req.requestId = requestId;
    res.setHeader('X-Request-ID', requestId);

    // Log on response finish
    res.on('finish', () => {
        const duration = Date.now() - start;
        const logData = {
            requestId,
            method: req.method,
            url: req.originalUrl,
            status: res.statusCode,
            duration: `${duration}ms`,
            ip: req.ip || req.headers['x-forwarded-for'] || req.connection.remoteAddress,
            userAgent: req.headers['user-agent']
        };

        // Add user ID if authenticated
        if (req.user) {
            logData.userId = req.user._id;
        }

        // Log level based on status and duration
        if (res.statusCode >= 500) {
            logger.error(logData, 'Request error');
        } else if (res.statusCode >= 400) {
            logger.warn(logData, 'Request warning');
        } else if (duration > 1000) {
            logger.warn({ ...logData, slow: true }, 'Slow request');
        } else {
            logger.info(logData, 'Request completed');
        }
    });

    next();
};

// Error logger
const errorLogger = (err, req, res, next) => {
    logger.error({
        requestId: req.requestId,
        error: {
            message: err.message,
            stack: config.nodeEnv === 'development' ? err.stack : undefined,
            code: err.code,
            statusCode: err.statusCode
        },
        method: req.method,
        url: req.originalUrl,
        body: config.nodeEnv === 'development' ? req.body : undefined
    }, 'Unhandled error');

    next(err);
};

module.exports = {
    logger,
    requestLogger,
    errorLogger
};
