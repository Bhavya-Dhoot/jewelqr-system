/**
 * In-Memory Cache Service
 * Lightweight caching for frequently accessed data
 * TTL-based expiration, no external dependencies
 */

class CacheService {
    constructor() {
        this.cache = new Map();
        this.stats = {
            hits: 0,
            misses: 0
        };
    }

    /**
     * Get cached value
     * @param {string} key 
     * @returns {any|null}
     */
    get(key) {
        const entry = this.cache.get(key);

        if (!entry) {
            this.stats.misses++;
            return null;
        }

        // Check TTL expiration
        if (entry.expiresAt && Date.now() > entry.expiresAt) {
            this.cache.delete(key);
            this.stats.misses++;
            return null;
        }

        this.stats.hits++;
        return entry.value;
    }

    /**
     * Set cached value with optional TTL
     * @param {string} key 
     * @param {any} value 
     * @param {number} ttlMs - Time to live in milliseconds (default: 60s)
     */
    set(key, value, ttlMs = 60000) {
        this.cache.set(key, {
            value,
            expiresAt: ttlMs > 0 ? Date.now() + ttlMs : null,
            createdAt: Date.now()
        });
    }

    /**
     * Delete cached value
     * @param {string} key 
     */
    delete(key) {
        this.cache.delete(key);
    }

    /**
     * Clear all cache
     */
    clear() {
        this.cache.clear();
    }

    /**
     * Delete entries matching a pattern
     * @param {string} pattern - Prefix to match
     */
    deletePattern(pattern) {
        for (const key of this.cache.keys()) {
            if (key.startsWith(pattern)) {
                this.cache.delete(key);
            }
        }
    }

    /**
     * Get cache stats
     */
    getStats() {
        const hitRate = this.stats.hits + this.stats.misses > 0
            ? (this.stats.hits / (this.stats.hits + this.stats.misses) * 100).toFixed(1)
            : 0;

        return {
            size: this.cache.size,
            hits: this.stats.hits,
            misses: this.stats.misses,
            hitRate: `${hitRate}%`
        };
    }

    /**
     * Cleanup expired entries (call periodically)
     */
    cleanup() {
        const now = Date.now();
        let cleaned = 0;

        for (const [key, entry] of this.cache.entries()) {
            if (entry.expiresAt && now > entry.expiresAt) {
                this.cache.delete(key);
                cleaned++;
            }
        }

        return cleaned;
    }
}

// Singleton instance
const cache = new CacheService();

// Cleanup expired entries every 5 minutes
setInterval(() => cache.cleanup(), 5 * 60 * 1000);

// Cache keys
const CACHE_KEYS = {
    SETTINGS: 'settings:global',
    DASHBOARD_STATS: 'dashboard:stats',
    RECENT_ITEMS: 'dashboard:recent'
};

// TTL values
const TTL = {
    SETTINGS: 5 * 60 * 1000,      // 5 minutes
    DASHBOARD_STATS: 30 * 1000,   // 30 seconds
    RECENT_ITEMS: 15 * 1000       // 15 seconds
};

module.exports = {
    cache,
    CACHE_KEYS,
    TTL
};
