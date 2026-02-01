/**
 * Configuration Module
 * Fetches settings from API with localStorage fallback
 * Provides diamond types, rates, categories, and other settings
 */

const CONFIG_KEY = 'jewelqr_config';
const CONFIG_CACHE_KEY = 'jewelqr_config_cache_time';
const CACHE_DURATION = 5 * 60 * 1000; // 5 minutes

// Dynamic diamond categories with per-category Real/CVD pricing
const DEFAULT_DIAMOND_PRICING = {
    solitaire: { label: 'Solitaire', realRate: 100000, cvdRate: 50000, isActive: true },
    rd: { label: 'RD', realRate: 50000, cvdRate: 25000, isActive: true },
    mq: { label: 'MQ', realRate: 45000, cvdRate: 22500, isActive: true },
    moti: { label: 'Moti', realRate: 40000, cvdRate: 20000, isActive: true },
    pear: { label: 'Pear', realRate: 42000, cvdRate: 21000, isActive: true },
    round: { label: 'Round', realRate: 38000, cvdRate: 19000, isActive: true }
};

// Aliases for legacy/variant diamond type IDs
const DEFAULT_DIAMOND_TYPE_ALIASES = {
    marquise: 'mq',
    markish: 'mq'
};

// Polki/Stone categories (Real only, no CVD)
const DEFAULT_POLKI_PRICING = {
    stone: { name: 'Stone', realRate: 15000 },
    polki: { name: 'Polki', realRate: 25000 }
};

// Diamond types array (derived from pricing for backward compatibility)
const DEFAULT_DIAMOND_TYPES = Object.keys(DEFAULT_DIAMOND_PRICING).map(id => ({
    id,
    name: DEFAULT_DIAMOND_PRICING[id].label || DEFAULT_DIAMOND_PRICING[id].name,
    rateMultiplier: 1.0
}));

// Jewelry categories with SKU prefixes
const DEFAULT_JEWELRY_CATEGORIES = [
    { id: 'chain', name: 'Chain', prefix: 'CHN' },
    { id: 'bangles', name: 'Bangles', prefix: 'BNG' },
    { id: 'earrings', name: 'Earrings', prefix: 'EAR' },
    { id: 'necklace', name: 'Necklace', prefix: 'NCK' },
    { id: 'pendant_set', name: 'Pendant Set', prefix: 'PND' },
    { id: 'others', name: 'Others', prefix: 'OTH' }
];

// Default rates
const DEFAULT_RATES = {
    goldRate: 6500,
    diamondRate: 50000,       // Legacy (use per-category pricing instead)
    cvdDiamondRate: 25000,    // Legacy (use per-category pricing instead)
    labourRate: 500,          // Per gram: Labour Cost = Rate × Gold Weight
    taxPercent: 3
};

// Default QR settings
const DEFAULT_QR_SETTINGS = {
    size: 256,
    color: '#1A2332',
    background: '#FFFFFF',
    errorLevel: 'H'
};

// Gold purity multipliers for price calculation
// Gold Value = Weight × Rate × Purity Factor
const GOLD_PURITY_FACTORS = {
    '24K': 1.00,
    '22K': 0.92,
    '18K': 0.76,
    '14K': 0.60
};

// In-memory cache
let configCache = null;

/**
 * Get default configuration
 * @returns {Object}
 */
function getDefaultConfig() {
    return {
        diamondPricing: { ...DEFAULT_DIAMOND_PRICING },
        diamondTypeAliases: { ...DEFAULT_DIAMOND_TYPE_ALIASES },
        polkiPricing: { ...DEFAULT_POLKI_PRICING },
        diamondTypes: [...DEFAULT_DIAMOND_TYPES],
        jewelryCategories: [...DEFAULT_JEWELRY_CATEGORIES],
        rates: { ...DEFAULT_RATES },
        qrSettings: { ...DEFAULT_QR_SETTINGS }
    };
}

/**
 * Check if cache is valid
 * @returns {boolean}
 */
function isCacheValid() {
    const cacheTime = localStorage.getItem(CONFIG_CACHE_KEY);
    if (!cacheTime) return false;
    return (Date.now() - parseInt(cacheTime)) < CACHE_DURATION;
}

/**
 * Get configuration from localStorage
 * @returns {Object}
 */
function getLocalConfig() {
    const stored = localStorage.getItem(CONFIG_KEY);
    if (stored) {
        try {
            return JSON.parse(stored);
        } catch (e) {
            console.warn('Failed to parse config, using defaults');
        }
    }
    return getDefaultConfig();
}

/**
 * Save configuration to localStorage
 * @param {Object} config 
 */
function saveLocalConfig(config) {
    localStorage.setItem(CONFIG_KEY, JSON.stringify(config));
    localStorage.setItem(CONFIG_CACHE_KEY, Date.now().toString());
    configCache = config;
}

/**
 * Fetch settings from API and cache locally
 * @returns {Promise<Object>}
 */
async function fetchConfig() {
    if (typeof api === 'undefined') {
        return getLocalConfig();
    }

    try {
        const response = await api.getSettings();
        if (response.success && response.data) {
            const config = {
                diamondPricing: response.data.diamondPricing || DEFAULT_DIAMOND_PRICING,
                diamondTypeAliases: response.data.diamondTypeAliases || DEFAULT_DIAMOND_TYPE_ALIASES,
                polkiPricing: response.data.polkiPricing || DEFAULT_POLKI_PRICING,
                diamondTypes: response.data.diamondTypes || DEFAULT_DIAMOND_TYPES,
                jewelryCategories: response.data.jewelryCategories || DEFAULT_JEWELRY_CATEGORIES,
                rates: response.data.rates || DEFAULT_RATES,
                qrSettings: response.data.qrSettings || DEFAULT_QR_SETTINGS
            };
            saveLocalConfig(config);
            return config;
        }
    } catch (error) {
        console.warn('Failed to fetch config from API, using local:', error.message);
    }

    return getLocalConfig();
}

/**
 * Get full configuration (sync, uses cache)
 * @returns {Object}
 */
function getConfig() {
    if (configCache && isCacheValid()) {
        return configCache;
    }
    configCache = getLocalConfig();
    return configCache;
}

/**
 * Initialize config (call on page load)
 * @returns {Promise<Object>}
 */
async function initConfig() {
    if (isCacheValid()) {
        configCache = getLocalConfig();
        return configCache;
    }
    return await fetchConfig();
}

/**
 * Force refresh config from backend (bypasses cache)
 * @returns {Promise<Object>}
 */
async function refreshConfig() {
    // Invalidate cache
    localStorage.removeItem(CONFIG_CACHE_KEY);
    configCache = null;
    // Fetch fresh from backend
    return await fetchConfig();
}

/**
 * Get diamond types list
 * Derives from diamondPricing keys to ensure only priced types are shown
 * @returns {Array}
 */
function getDiamondTypes() {
    const cfg = getConfig();
    const pricing = cfg.diamondPricing || DEFAULT_DIAMOND_PRICING;

    // Derive types from pricing keys, filter by isActive (only shows active types)
    return Object.keys(pricing)
        .filter(id => pricing[id].isActive !== false) // Default to active if missing
        .map(id => ({
            id,
            name: pricing[id].label || pricing[id].name || id.charAt(0).toUpperCase() + id.slice(1),
            rateMultiplier: 1.0
        }));
}

/**
 * Get diamond type aliases for legacy type ID resolution
 * @returns {Object}
 */
function getDiamondTypeAliases() {
    const cfg = getConfig();
    return cfg.diamondTypeAliases || DEFAULT_DIAMOND_TYPE_ALIASES;
}

/**
 * Get diamond type by ID
 * @param {string} id 
 * @returns {Object|null}
 */
function getDiamondTypeById(id) {
    const types = getDiamondTypes();
    return types.find(t => t.id === id) || null;
}

/**
 * Add a new diamond type
 * @param {string} name 
 * @param {number} rateMultiplier 
 * @returns {Promise<Object>}
 */
async function addDiamondType(name, rateMultiplier = 1.0) {
    // Try API first
    if (typeof api !== 'undefined') {
        try {
            const response = await api.addDiamondType(name, rateMultiplier);
            if (response.success) {
                await fetchConfig(); // Refresh cache
                return response.data;
            }
            throw new Error(response.message);
        } catch (error) {
            console.warn('API add diamond type failed, using local:', error.message);
        }
    }

    // Fallback to local
    const config = getConfig();
    const id = name.toLowerCase().replace(/\s+/g, '_');

    if (config.diamondTypes.some(t => t.id === id)) {
        throw new Error('Diamond type already exists');
    }

    const newType = { id, name, rateMultiplier };
    config.diamondTypes.push(newType);
    saveLocalConfig(config);
    return newType;
}

/**
 * Remove a diamond type
 * @param {string} id 
 * @returns {Promise<boolean>}
 */
async function removeDiamondType(id) {
    // Try API first
    if (typeof api !== 'undefined') {
        try {
            const response = await api.removeDiamondType(id);
            if (response.success) {
                await fetchConfig(); // Refresh cache
                return true;
            }
        } catch (error) {
            console.warn('API remove diamond type failed, using local:', error.message);
        }
    }

    // Fallback to local
    const config = getConfig();
    const index = config.diamondTypes.findIndex(t => t.id === id);
    if (index === -1) return false;

    config.diamondTypes.splice(index, 1);
    saveLocalConfig(config);
    return true;
}

/**
 * Get default rates
 * @returns {Object}
 */
function getDefaultRates() {
    const config = getConfig();
    return config.rates || DEFAULT_RATES;
}

/**
 * Update default rates
 * @param {Object} rates 
 * @returns {Promise<void>}
 */
async function updateRates(rates) {
    // Try API first
    if (typeof api !== 'undefined') {
        try {
            const response = await api.updateSettings({ rates });
            if (response.success) {
                await fetchConfig(); // Refresh cache
                return;
            }
        } catch (error) {
            console.warn('API update rates failed, using local:', error.message);
        }
    }

    // Fallback to local
    const config = getConfig();
    config.rates = { ...config.rates, ...rates };
    saveLocalConfig(config);
}

/**
 * Get diamond pricing (per-category Real/CVD rates)
 * @returns {Object}
 */
function getDiamondPricing() {
    const config = getConfig();
    return config.diamondPricing || DEFAULT_DIAMOND_PRICING;
}

/**
 * Update diamond pricing
 * @param {Object} pricing 
 * @returns {Promise<void>}
 */
async function updateDiamondPricing(pricing) {
    // Try API first
    if (typeof api !== 'undefined') {
        try {
            const response = await api.updateSettings({ diamondPricing: pricing });
            if (response.success) {
                await fetchConfig(); // Refresh cache
                return;
            }
        } catch (error) {
            console.warn('API update diamond pricing failed, using local:', error.message);
        }
    }

    // Fallback to local
    const config = getConfig();
    config.diamondPricing = { ...config.diamondPricing, ...pricing };
    saveLocalConfig(config);
}

/**
 * Get polki pricing (per-category Real rates)
 * @returns {Object}
 */
function getPolkiPricing() {
    const config = getConfig();
    return config.polkiPricing || DEFAULT_POLKI_PRICING;
}

/**
 * Update polki pricing
 * @param {Object} pricing 
 * @returns {Promise<void>}
 */
async function updatePolkiPricing(pricing) {
    // Try API first
    if (typeof api !== 'undefined') {
        try {
            const response = await api.updateSettings({ polkiPricing: pricing });
            if (response.success) {
                await fetchConfig(); // Refresh cache
                return;
            }
        } catch (error) {
            console.warn('API update polki pricing failed, using local:', error.message);
        }
    }

    // Fallback to local
    const config = getConfig();
    config.polkiPricing = { ...config.polkiPricing, ...pricing };
    saveLocalConfig(config);
}

/**
 * Get jewelry categories
 * @returns {Array}
 */
function getJewelryCategories() {
    const config = getConfig();
    return config.jewelryCategories || DEFAULT_JEWELRY_CATEGORIES;
}

/**
 * Get jewelry category by ID
 * @param {string} id 
 * @returns {Object|null}
 */
function getJewelryCategoryById(id) {
    const categories = getJewelryCategories();
    return categories.find(c => c.id === id) || null;
}

/**
 * Reset configuration to defaults
 */
function resetConfig() {
    localStorage.removeItem(CONFIG_KEY);
    localStorage.removeItem(CONFIG_CACHE_KEY);
    configCache = null;
}

/**
 * Save all settings in one API call (instant update, no race conditions)
 * @param {Object} settings - Object containing rates, diamondPricing, polkiPricing
 * @returns {Promise<boolean>} - Success status
 */
async function saveAllSettings(settings) {
    const { rates, diamondPricing, polkiPricing } = settings;

    // Build update payload
    const updatePayload = {};
    if (rates) updatePayload.rates = rates;
    if (diamondPricing) updatePayload.diamondPricing = diamondPricing;
    if (polkiPricing) updatePayload.polkiPricing = polkiPricing;

    // Try API first
    if (typeof api !== 'undefined') {
        try {
            const response = await api.updateSettings(updatePayload);
            if (response.success) {
                // Immediately update BOTH local storage AND in-memory cache
                const config = getConfig();
                if (rates) config.rates = { ...config.rates, ...rates };
                if (diamondPricing) config.diamondPricing = { ...config.diamondPricing, ...diamondPricing };
                if (polkiPricing) config.polkiPricing = { ...config.polkiPricing, ...polkiPricing };
                saveLocalConfig(config);
                configCache = config; // CRITICAL: Update in-memory cache too!
                return true;
            }
            throw new Error(response.message || 'API update failed');
        } catch (error) {
            console.error('API saveAllSettings failed:', error.message);
            // Fall through to local save
        }
    }

    // Fallback to local only
    const config = getConfig();
    if (rates) config.rates = { ...config.rates, ...rates };
    if (diamondPricing) config.diamondPricing = { ...config.diamondPricing, ...diamondPricing };
    if (polkiPricing) config.polkiPricing = { ...config.polkiPricing, ...polkiPricing };
    saveLocalConfig(config);
    configCache = config; // CRITICAL: Update in-memory cache too!
    return true;
}

/**
 * Force invalidate cache (call this to ensure next page load fetches fresh data)
 */
function invalidateCache() {
    localStorage.removeItem(CONFIG_CACHE_KEY);
    configCache = null;
}

/**
 * Get gold purity factor for price calculation
 * @param {string} purity - Gold purity (e.g., '22K', '18K')
 * @returns {number} - Multiplier factor (default 1.0 for unknown)
 */
function getPurityFactor(purity) {
    return GOLD_PURITY_FACTORS[purity] || 1.0;
}

// Export for use in other modules
window.config = {
    initConfig,
    getConfig,
    getDefaultConfig,
    fetchConfig,
    refreshConfig,       // Force refresh from backend
    getDiamondTypes,
    getDiamondTypeAliases,
    addDiamondType,
    removeDiamondType,
    getDiamondPricing,
    updateDiamondPricing,
    getPolkiPricing,
    updatePolkiPricing,
    getDefaultRates,
    updateRates,
    getDiamondTypeById,
    resetConfig,
    getJewelryCategories,
    getJewelryCategoryById,
    getPurityFactor,
    saveAllSettings,
    invalidateCache: refreshConfig,  // Alias for backwards compat
    GOLD_PURITY_FACTORS,
    DEFAULT_DIAMOND_PRICING,
    DEFAULT_DIAMOND_TYPE_ALIASES,
    DEFAULT_POLKI_PRICING,
    DEFAULT_DIAMOND_TYPES,
    DEFAULT_JEWELRY_CATEGORIES,
    DEFAULT_RATES
};
