/**
 * Performance Profiling Middleware
 * Provides request timing, metrics collection, and slow query detection
 * ONLY active when PROFILE_MODE=true in environment
 */

const isProfilingEnabled = () => process.env.PROFILE_MODE === 'true';

// Request counters per route
const requestCounts = new Map();
const latencyTotals = new Map();
const latencyCounts = new Map();

// Summary interval (60 seconds)
let summaryInterval = null;

/**
 * Initialize profiling (call once at startup)
 */
function initProfiling() {
    if (!isProfilingEnabled()) {
        console.log('[PROFILE] Profiling disabled. Set PROFILE_MODE=true to enable.');
        return;
    }

    console.log('[PROFILE] ===== PROFILING ENABLED =====');
    console.log('[PROFILE] Request timing, Mongo query logging, memory monitoring active');

    // Print summary every 60s
    summaryInterval = setInterval(printRequestSummary, 60000);

    // Memory monitoring every 60s
    setInterval(logMemoryUsage, 60000);

    // Event loop lag detection
    monitorEventLoopLag();
}

/**
 * Request timing middleware
 * Logs method, route, status, duration
 */
function requestTimingMiddleware(req, res, next) {
    if (!isProfilingEnabled()) return next();

    const start = process.hrtime.bigint();
    const route = req.originalUrl || req.url;
    const method = req.method;

    res.on('finish', () => {
        const end = process.hrtime.bigint();
        const durationMs = Number(end - start) / 1_000_000;
        const status = res.statusCode;

        // Update counters
        const routeKey = `${method} ${route.split('?')[0]}`;
        requestCounts.set(routeKey, (requestCounts.get(routeKey) || 0) + 1);
        latencyTotals.set(routeKey, (latencyTotals.get(routeKey) || 0) + durationMs);
        latencyCounts.set(routeKey, (latencyCounts.get(routeKey) || 0) + 1);

        // Log with severity based on duration
        if (durationMs > 1500) {
            console.error(`[PROFILE][SLOW] ${method} ${route} - ${status} - ${durationMs.toFixed(2)}ms (CRITICAL)`);
        } else if (durationMs > 500) {
            console.warn(`[PROFILE][SLOW] ${method} ${route} - ${status} - ${durationMs.toFixed(2)}ms (WARNING)`);
        } else {
            console.log(`[PROFILE] ${method} ${route} - ${status} - ${durationMs.toFixed(2)}ms`);
        }
    });

    next();
}

/**
 * Print request summary (every 60s)
 */
function printRequestSummary() {
    if (!isProfilingEnabled() || requestCounts.size === 0) return;

    console.log('\n[PROFILE] ===== REQUEST SUMMARY (last 60s) =====');

    const sortedRoutes = [...requestCounts.entries()].sort((a, b) => b[1] - a[1]);

    for (const [route, count] of sortedRoutes) {
        const avgLatency = (latencyTotals.get(route) || 0) / (latencyCounts.get(route) || 1);
        console.log(`[PROFILE]   ${route}: ${count} requests, avg ${avgLatency.toFixed(2)}ms`);
    }

    console.log('[PROFILE] ========================================\n');

    // Reset counters for next period
    requestCounts.clear();
    latencyTotals.clear();
    latencyCounts.clear();
}

/**
 * Log memory usage
 */
function logMemoryUsage() {
    if (!isProfilingEnabled()) return;

    const used = process.memoryUsage();
    const heapUsedMB = (used.heapUsed / 1024 / 1024).toFixed(2);
    const heapTotalMB = (used.heapTotal / 1024 / 1024).toFixed(2);
    const rssMB = (used.rss / 1024 / 1024).toFixed(2);

    console.log(`[PROFILE][MEMORY] Heap: ${heapUsedMB}/${heapTotalMB} MB | RSS: ${rssMB} MB`);

    // Warn if heap usage > 200MB
    if (used.heapUsed > 200 * 1024 * 1024) {
        console.warn('[PROFILE][MEMORY] WARNING: High heap usage detected!');
    }
}

/**
 * Monitor event loop lag
 */
function monitorEventLoopLag() {
    if (!isProfilingEnabled()) return;

    let lastCheck = Date.now();

    setInterval(() => {
        const now = Date.now();
        const lag = now - lastCheck - 100; // Expected 100ms interval

        if (lag > 100) {
            console.warn(`[PROFILE][EVENT-LOOP] LAG DETECTED: ${lag}ms (threshold: 100ms)`);
        }

        lastCheck = now;
    }, 100);
}

/**
 * MongoDB query profiling hook
 * Call mongoose.set('debug', mongoQueryLogger) to enable
 */
function mongoQueryLogger(collectionName, methodName, ...args) {
    if (!isProfilingEnabled()) return;

    const start = Date.now();

    // Log query start
    console.log(`[PROFILE][MONGO] ${collectionName}.${methodName}() started`);

    // Note: This is a simplified logger. For actual timing,
    // you'd need to hook into Mongoose's query execution.
    // The actual slow query logging is below.
}

/**
 * Mongoose plugin for slow query detection
 * Usage: schema.plugin(slowQueryPlugin)
 */
function slowQueryPlugin(schema) {
    schema.pre(/^find|aggregate|count|distinct/, function () {
        this._profileStart = Date.now();
    });

    schema.post(/^find|aggregate|count|distinct/, function () {
        if (!isProfilingEnabled() || !this._profileStart) return;

        const duration = Date.now() - this._profileStart;
        const collectionName = this.mongooseCollection?.name || 'unknown';

        if (duration > 200) {
            console.warn(`[PROFILE][MONGO][SLOW] ${collectionName} query took ${duration}ms (threshold: 200ms)`);
        }
    });
}

/**
 * Cleanup profiling (call on shutdown)
 */
function cleanupProfiling() {
    if (summaryInterval) {
        clearInterval(summaryInterval);
    }
}

module.exports = {
    initProfiling,
    requestTimingMiddleware,
    mongoQueryLogger,
    slowQueryPlugin,
    cleanupProfiling,
    isProfilingEnabled
};
