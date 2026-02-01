/**
 * Frontend Performance Profiler
 * Provides API call timing, duplicate detection, page load metrics,
 * DOM query counting, event listener tracking, and memory cleanup warnings.
 * 
 * ONLY ACTIVE WHEN: localStorage.PROFILE_MODE === "true"
 */

(function () {
    'use strict';

    // ===== PROFILING STATE =====
    const isProfilingEnabled = () => localStorage.getItem('PROFILE_MODE') === 'true';

    // Request tracking for duplicate detection
    const recentRequests = new Map(); // endpoint -> { timestamp, count }
    const REQUEST_DEDUP_WINDOW = 2000; // 2 seconds

    // Config.initConfig call counter
    let configInitCallCount = 0;

    // DOM query counter
    let domQueryCount = 0;
    const DOM_QUERY_THRESHOLD = 100; // warn if > 100 queries per page

    // Event listener tracking
    const eventListenerCounts = new Map(); // element+event -> count

    // Cleanup tracking
    const activeIntervals = new Set();
    const activeTimeouts = new Set();

    // Page load timing
    let pageLoadStart = performance.now();

    // ===== CONSOLE WRAPPER =====
    const profileLog = (level, ...args) => {
        if (!isProfilingEnabled()) return;
        const prefix = `[PROFILE][${new Date().toISOString().slice(11, 23)}]`;
        console[level](prefix, ...args);
    };

    // ===== 1. API FETCH WRAPPER =====
    function wrapApiFetch() {
        if (typeof window.api === 'undefined') {
            setTimeout(wrapApiFetch, 100); // Retry if api not loaded yet
            return;
        }

        // Store original fetch method reference
        const originalApiRequest = window.api._originalRequest || window.apiRequest;

        if (!originalApiRequest && window.api.getItems) {
            // Wrap individual API methods
            wrapApiMethod('getItems');
            wrapApiMethod('getItemBySku');
            wrapApiMethod('createItem');
            wrapApiMethod('updateItem');
            wrapApiMethod('deleteItem');
            wrapApiMethod('getDashboardStats');
            wrapApiMethod('getRecentItems');
            wrapApiMethod('getSettings');
            wrapApiMethod('login');
            profileLog('log', 'API methods wrapped for timing');
        }
    }

    function wrapApiMethod(methodName) {
        if (!window.api || !window.api[methodName]) return;

        const original = window.api[methodName];
        window.api[methodName] = async function (...args) {
            if (!isProfilingEnabled()) {
                return original.apply(this, args);
            }

            const start = performance.now();
            const endpoint = methodName;

            // Duplicate detection
            const now = Date.now();
            const existing = recentRequests.get(endpoint);
            if (existing && (now - existing.timestamp) < REQUEST_DEDUP_WINDOW) {
                existing.count++;
                profileLog('warn', `DUPLICATE CALL: ${endpoint} (${existing.count}x in ${REQUEST_DEDUP_WINDOW}ms)`);
            } else {
                recentRequests.set(endpoint, { timestamp: now, count: 1 });
            }

            try {
                const result = await original.apply(this, args);
                const duration = performance.now() - start;

                if (duration > 500) {
                    profileLog('warn', `SLOW API: ${endpoint} took ${duration.toFixed(2)}ms`);
                } else {
                    profileLog('log', `API: ${endpoint} - ${duration.toFixed(2)}ms`);
                }

                return result;
            } catch (error) {
                const duration = performance.now() - start;
                profileLog('error', `API ERROR: ${endpoint} - ${duration.toFixed(2)}ms - ${error.message}`);
                throw error;
            }
        };
    }

    // ===== 2. PAGE LOAD TIMING =====
    function measurePageLoad() {
        if (!isProfilingEnabled()) return;

        window.addEventListener('load', () => {
            const loadTime = performance.now() - pageLoadStart;
            profileLog('log', `PAGE LOAD: ${loadTime.toFixed(2)}ms`);

            // Performance API metrics
            if (performance.timing) {
                const timing = performance.timing;
                const domReady = timing.domContentLoadedEventEnd - timing.navigationStart;
                const fullLoad = timing.loadEventEnd - timing.navigationStart;
                profileLog('log', `DOM Ready: ${domReady}ms | Full Load: ${fullLoad}ms`);
            }
        });
    }

    // ===== 3. CONFIG.INITCONFIG TRACKING =====
    function wrapConfigInit() {
        if (typeof window.config === 'undefined') {
            setTimeout(wrapConfigInit, 100);
            return;
        }

        if (window.config.initConfig && !window.config._originalInitConfig) {
            window.config._originalInitConfig = window.config.initConfig;
            window.config.initConfig = async function (...args) {
                configInitCallCount++;

                if (isProfilingEnabled()) {
                    if (configInitCallCount > 1) {
                        profileLog('warn', `REPEATED config.initConfig() call #${configInitCallCount}`);
                    } else {
                        profileLog('log', `config.initConfig() called`);
                    }
                }

                return window.config._originalInitConfig.apply(this, args);
            };
            profileLog('log', 'config.initConfig wrapped for tracking');
        }
    }

    // ===== 4. DOM QUERY COUNTING =====
    function wrapDomQueries() {
        if (!isProfilingEnabled()) return;

        const originalById = document.getElementById.bind(document);
        document.getElementById = function (id) {
            domQueryCount++;
            return originalById(id);
        };

        const originalQuerySelector = document.querySelector.bind(document);
        document.querySelector = function (selector) {
            domQueryCount++;
            return originalQuerySelector(selector);
        };

        const originalQuerySelectorAll = document.querySelectorAll.bind(document);
        document.querySelectorAll = function (selector) {
            domQueryCount++;
            return originalQuerySelectorAll(selector);
        };

        // Log warning if excessive queries
        setInterval(() => {
            if (domQueryCount > DOM_QUERY_THRESHOLD) {
                profileLog('warn', `EXCESSIVE DOM QUERIES: ${domQueryCount} queries (threshold: ${DOM_QUERY_THRESHOLD})`);
            }
            // Reset counter every 10 seconds
            domQueryCount = 0;
        }, 10000);
    }

    // ===== 5. EVENT LISTENER TRACKING =====
    function wrapEventListeners() {
        if (!isProfilingEnabled()) return;

        const originalAddEventListener = EventTarget.prototype.addEventListener;
        EventTarget.prototype.addEventListener = function (type, listener, options) {
            const key = `${this.constructor.name}:${type}`;
            const count = (eventListenerCounts.get(key) || 0) + 1;
            eventListenerCounts.set(key, count);

            if (count > 3) {
                profileLog('warn', `MULTIPLE LISTENERS: ${key} added ${count} times`);
            }

            return originalAddEventListener.call(this, type, listener, options);
        };
    }

    // ===== 6. INTERVAL/TIMEOUT TRACKING =====
    function wrapTimers() {
        if (!isProfilingEnabled()) return;

        const originalSetInterval = window.setInterval;
        window.setInterval = function (callback, delay, ...args) {
            const id = originalSetInterval(callback, delay, ...args);
            activeIntervals.add(id);
            profileLog('log', `INTERVAL SET: id=${id}, delay=${delay}ms (active: ${activeIntervals.size})`);
            return id;
        };

        const originalClearInterval = window.clearInterval;
        window.clearInterval = function (id) {
            activeIntervals.delete(id);
            profileLog('log', `INTERVAL CLEARED: id=${id} (active: ${activeIntervals.size})`);
            return originalClearInterval(id);
        };

        const originalSetTimeout = window.setTimeout;
        window.setTimeout = function (callback, delay, ...args) {
            const id = originalSetTimeout(() => {
                activeTimeouts.delete(id);
                callback(...args);
            }, delay);
            activeTimeouts.add(id);
            return id;
        };

        const originalClearTimeout = window.clearTimeout;
        window.clearTimeout = function (id) {
            activeTimeouts.delete(id);
            return originalClearTimeout(id);
        };

        // Warn on page unload if timers not cleaned up
        window.addEventListener('beforeunload', () => {
            if (activeIntervals.size > 0) {
                profileLog('warn', `CLEANUP WARNING: ${activeIntervals.size} intervals not cleared`);
            }
        });
    }

    // ===== 7. SCANNER CLEANUP CHECK =====
    function checkScannerCleanup() {
        if (!isProfilingEnabled()) return;

        window.addEventListener('beforeunload', () => {
            if (typeof html5QrCode !== 'undefined' && html5QrCode && html5QrCode.isScanning) {
                profileLog('warn', 'CLEANUP WARNING: QR scanner still active on page unload');
            }
        });
    }

    // ===== 8. LOCALSTORAGE USAGE =====
    function checkLocalStorageUsage() {
        if (!isProfilingEnabled()) return;

        let totalSize = 0;
        for (let key in localStorage) {
            if (localStorage.hasOwnProperty(key)) {
                totalSize += localStorage.getItem(key).length * 2; // UTF-16
            }
        }
        const sizeMB = (totalSize / 1024 / 1024).toFixed(2);
        profileLog('log', `LOCALSTORAGE: ${sizeMB}MB used`);

        if (totalSize > 4 * 1024 * 1024) { // 4MB warning
            profileLog('warn', `LOCALSTORAGE WARNING: ${sizeMB}MB used (approaching 5MB limit)`);
        }
    }

    // ===== 9. SUMMARY REPORT =====
    function printProfileSummary() {
        if (!isProfilingEnabled()) return;

        console.log('\n[PROFILE] ===== FRONTEND SUMMARY =====');
        console.log(`[PROFILE] config.initConfig calls: ${configInitCallCount}`);
        console.log(`[PROFILE] Active intervals: ${activeIntervals.size}`);
        console.log(`[PROFILE] Active timeouts: ${activeTimeouts.size}`);

        if (eventListenerCounts.size > 0) {
            console.log('[PROFILE] Event listeners:');
            eventListenerCounts.forEach((count, key) => {
                if (count > 1) {
                    console.log(`[PROFILE]   ${key}: ${count}x`);
                }
            });
        }

        checkLocalStorageUsage();
        console.log('[PROFILE] ==============================\n');
    }

    // ===== INITIALIZATION =====
    function initProfiler() {
        if (!isProfilingEnabled()) {
            console.log('[PROFILE] Frontend profiling disabled. Set localStorage.PROFILE_MODE = "true" to enable.');
            return;
        }

        console.log('[PROFILE] ===== FRONTEND PROFILING ENABLED =====');

        wrapApiFetch();
        measurePageLoad();
        wrapConfigInit();
        wrapDomQueries();
        wrapEventListeners();
        wrapTimers();
        checkScannerCleanup();

        // Print summary every 30 seconds
        setInterval(printProfileSummary, 30000);

        // Print summary on page unload
        window.addEventListener('beforeunload', printProfileSummary);

        console.log('[PROFILE] All instrumentation active');
    }

    // Auto-initialize when DOM ready
    if (document.readyState === 'loading') {
        document.addEventListener('DOMContentLoaded', initProfiler);
    } else {
        initProfiler();
    }

    // Export for manual access
    window.Profiler = {
        enable: () => { localStorage.setItem('PROFILE_MODE', 'true'); location.reload(); },
        disable: () => { localStorage.removeItem('PROFILE_MODE'); location.reload(); },
        summary: printProfileSummary,
        isEnabled: isProfilingEnabled
    };

})();
