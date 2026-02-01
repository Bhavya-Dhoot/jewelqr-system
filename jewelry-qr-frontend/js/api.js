/**
 * API Service Module
 * Handles all HTTP requests to the backend API
 * Manages JWT token storage and automatic auth headers
 */

// Detect if running in development (different ports) or production (same origin)
const isDev = window.location.port === '8000' || window.location.port === '8080';
const API_BASE = isDev ? 'http://localhost:3000/api' : '/api';
const TOKEN_KEY = 'jewelqr_jwt';

// PERF: Request deduplication - prevents concurrent identical GET requests
const pendingRequests = new Map();
const REQUEST_DEDUP_TTL = 100; // ms to keep deduped request

/**
 * Get stored JWT token
 * @returns {string|null}
 */
function getToken() {
    return localStorage.getItem(TOKEN_KEY);
}

/**
 * Store JWT token
 * @param {string} token 
 */
function setToken(token) {
    localStorage.setItem(TOKEN_KEY, token);
}

/**
 * Remove JWT token
 */
function removeToken() {
    localStorage.removeItem(TOKEN_KEY);
}

/**
 * Check if token exists
 * @returns {boolean}
 */
function hasToken() {
    return !!getToken();
}

/**
 * Make API request with automatic auth header
 * @param {string} endpoint - API endpoint (without /api prefix)
 * @param {Object} options - Fetch options
 * @returns {Promise<Object>}
 */
async function apiRequest(endpoint, options = {}) {
    const method = (options.method || 'GET').toUpperCase();
    const url = `${API_BASE}${endpoint}`;

    // PERF: Deduplicate concurrent identical GET requests
    if (method === 'GET') {
        const cacheKey = url;
        const pending = pendingRequests.get(cacheKey);
        if (pending) {
            return pending; // Return existing promise
        }

        const requestPromise = performRequest(url, options);
        pendingRequests.set(cacheKey, requestPromise);

        // Clear from pending after completion + TTL
        requestPromise.finally(() => {
            setTimeout(() => pendingRequests.delete(cacheKey), REQUEST_DEDUP_TTL);
        });

        return requestPromise;
    }

    return performRequest(url, options);
}

/**
 * Actually perform the fetch request
 * @private
 */
async function performRequest(url, options = {}) {
    const token = getToken();

    const headers = {
        'Content-Type': 'application/json',
        ...(token && { 'Authorization': `Bearer ${token}` }),
        ...options.headers
    };

    try {
        const response = await fetch(url, {
            ...options,
            headers
        });

        // Defensive: try to parse JSON, handle non-JSON responses
        let data;
        try {
            const text = await response.text();
            data = text ? JSON.parse(text) : {};
        } catch (parseError) {
            console.error('Failed to parse response:', parseError);
            data = { success: false, message: 'Invalid response from server' };
        }

        // Validate response structure
        if (typeof data !== 'object' || data === null) {
            data = { success: false, message: 'Malformed response from server' };
        }

        if (!response.ok) {
            // RBAC v1.4.0: Handle specific auth/permission errors
            if (response.status === 401) {
                const code = data.code || '';
                // Clear ALL auth state to prevent redirect loops
                removeToken();
                localStorage.removeItem('jewelqr_auth');
                localStorage.removeItem('jewelqr_user');

                if (code === 'SESSION_INVALIDATED' || code === 'TOKEN_EXPIRED' || code === 'INVALID_TOKEN') {
                    // Dispatch custom event for force logout with message
                    window.dispatchEvent(new CustomEvent('auth:forceLogout', {
                        detail: { message: data.message || 'Session expired. Please login again.' }
                    }));
                    if (!window.location.pathname.includes('login.html')) {
                        window.location.href = 'login.html?reason=session_expired';
                    }
                } else {
                    if (!window.location.pathname.includes('login.html')) {
                        window.location.href = 'login.html';
                    }
                }
                throw new Error(data.message || 'Authentication required');
            }
            // Handle 403 - Forbidden (account disabled or insufficient permissions)
            if (response.status === 403) {
                const code = data.code || '';
                if (code === 'ACCOUNT_DISABLED') {
                    // Clear ALL auth state to prevent redirect loops
                    removeToken();
                    localStorage.removeItem('jewelqr_auth');
                    localStorage.removeItem('jewelqr_user');
                    window.dispatchEvent(new CustomEvent('auth:forceLogout', {
                        detail: { message: 'Your account has been disabled.' }
                    }));
                    if (!window.location.pathname.includes('login.html')) {
                        window.location.href = 'login.html?reason=account_disabled';
                    }
                } else if (code === 'INSUFFICIENT_PERMISSIONS') {
                    // Redirect to restricted page for permission errors
                    if (!window.location.pathname.includes('restricted.html')) {
                        window.location.href = 'restricted.html';
                    }
                }
                throw new Error(data.message || 'Access denied');
            }
            // Handle 429 - Rate limited
            if (response.status === 429) {
                throw new Error(data.message || 'Too many requests. Please wait and try again.');
            }
            // Handle validation errors with details
            if (response.status === 400 && data.errors && Array.isArray(data.errors)) {
                const errorDetails = data.errors.map(e => `${e.field}: ${e.message}`).join('; ');
                console.error('Validation errors:', data.errors);
                throw new Error(`${data.message}: ${errorDetails}`);
            }
            throw new Error(data.message || `HTTP Error: ${response.status}`);
        }

        return data;
    } catch (error) {
        console.error(`API Error [${endpoint}]:`, error);
        throw error;
    }
}

// ============ Auth API ============

/**
 * Login user
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<Object>}
 */
async function login(username, password) {
    const response = await apiRequest('/auth/login', {
        method: 'POST',
        body: JSON.stringify({ username, password })
    });

    if (response.success && response.token) {
        setToken(response.token);
    }

    return response;
}

/**
 * Logout user
 * @returns {Promise<void>}
 */
async function logout() {
    try {
        await apiRequest('/auth/logout', { method: 'POST' });
    } catch (error) {
        // Ignore logout errors
    } finally {
        removeToken();
    }
}

/**
 * Get current user info
 * @returns {Promise<Object>}
 */
async function getCurrentUser() {
    return apiRequest('/auth/me');
}

// ============ Items API ============

/**
 * Create new item
 * @param {Object} itemData 
 * @returns {Promise<Object>}
 */
async function createItem(itemData) {
    return apiRequest('/items', {
        method: 'POST',
        body: JSON.stringify(itemData)
    });
}

/**
 * Get all items (paginated)
 * @param {Object} params - Query parameters
 * @returns {Promise<Object>}
 */
async function getItems(params = {}) {
    const query = new URLSearchParams(params).toString();
    return apiRequest(`/items${query ? '?' + query : ''}`);
}

/**
 * Get item by SKU
 * @param {string} sku 
 * @returns {Promise<Object>}
 */
async function getItemBySku(sku) {
    return apiRequest(`/items/${encodeURIComponent(sku)}`);
}

/**
 * Update item
 * @param {string} sku 
 * @param {Object} updateData 
 * @returns {Promise<Object>}
 */
async function updateItem(sku, updateData) {
    return apiRequest(`/items/${encodeURIComponent(sku)}`, {
        method: 'PUT',
        body: JSON.stringify(updateData)
    });
}

/**
 * Delete item
 * @param {string} sku 
 * @returns {Promise<Object>}
 */
async function deleteItem(sku) {
    return apiRequest(`/items/${encodeURIComponent(sku)}`, {
        method: 'DELETE'
    });
}

/**
 * Restore soft-deleted item
 * @param {string} sku 
 * @returns {Promise<Object>}
 */
async function restoreItem(sku) {
    return apiRequest(`/items/${encodeURIComponent(sku)}/restore`, {
        method: 'POST'
    });
}

// ============ Settings API ============

/**
 * Get global settings
 * @returns {Promise<Object>}
 */
async function getSettings() {
    return apiRequest('/settings');
}

/**
 * Update settings
 * @param {Object} settings 
 * @returns {Promise<Object>}
 */
async function updateSettings(settings) {
    return apiRequest('/settings', {
        method: 'PUT',
        body: JSON.stringify(settings)
    });
}

/**
 * Add diamond type with pricing
 * @param {string} id - Type ID (e.g., "emerald")
 * @param {string} label - Display label (e.g., "Emerald Cut")
 * @param {number} realRate - Real diamond rate per carat
 * @param {number} cvdRate - CVD diamond rate per carat
 * @returns {Promise<Object>}
 */
async function addDiamondType(id, label, realRate = 50000, cvdRate = 25000) {
    return apiRequest('/settings/diamond-types', {
        method: 'POST',
        body: JSON.stringify({ id, label, realRate, cvdRate })
    });
}

/**
 * Check diamond type usage (how many items use this type)
 * @param {string} id 
 * @returns {Promise<Object>}
 */
async function checkDiamondTypeUsage(id) {
    return apiRequest(`/settings/diamond-types/${encodeURIComponent(id)}/usage`);
}

/**
 * Remove diamond type
 * @param {string} id 
 * @param {boolean} force - Force delete even if items are using it
 * @returns {Promise<Object>}
 */
async function removeDiamondType(id, force = false) {
    const query = force ? '?force=true' : '';
    return apiRequest(`/settings/diamond-types/${encodeURIComponent(id)}${query}`, {
        method: 'DELETE'
    });
}

/**
 * Add jewelry category
 * @param {string} name - Category name (e.g., "Bracelet")
 * @param {string} prefix - 3-letter SKU prefix (e.g., "BRC")
 * @returns {Promise<Object>}
 */
async function addCategory(name, prefix) {
    return apiRequest('/settings/categories', {
        method: 'POST',
        body: JSON.stringify({ name, prefix })
    });
}

/**
 * Update jewelry category
 * @param {string} id - Category ID
 * @param {Object} data - { name?, prefix?, isActive? }
 * @returns {Promise<Object>}
 */
async function updateCategory(id, data) {
    return apiRequest(`/settings/categories/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
}

/**
 * Check category usage (how many items use this category)
 * @param {string} id 
 * @returns {Promise<Object>}
 */
async function checkCategoryUsage(id) {
    return apiRequest(`/settings/categories/${encodeURIComponent(id)}/usage`);
}

/**
 * Remove jewelry category
 * @param {string} id 
 * @returns {Promise<Object>}
 */
async function removeCategory(id) {
    return apiRequest(`/settings/categories/${encodeURIComponent(id)}`, {
        method: 'DELETE'
    });
}

/**
 * Update diamond type
 * @param {string} id - Type ID
 * @param {Object} data - { label?, realRate?, cvdRate?, isActive? }
 * @returns {Promise<Object>}
 */
async function updateDiamondType(id, data) {
    return apiRequest(`/settings/diamond-types/${encodeURIComponent(id)}`, {
        method: 'PUT',
        body: JSON.stringify(data)
    });
}

// ============ Dashboard API ============

/**
 * Get dashboard statistics
 * @returns {Promise<Object>}
 */
async function getDashboardStats() {
    return apiRequest('/dashboard/stats');
}

/**
 * Get recent items
 * @param {number} limit 
 * @returns {Promise<Object>}
 */
async function getRecentItems(limit = 10) {
    return apiRequest(`/dashboard/recent?limit=${limit}`);
}

// ============ Health Check ============

/**
 * Check API health
 * @returns {Promise<boolean>}
 */
async function checkHealth() {
    try {
        const response = await apiRequest('/health');
        return response.success;
    } catch {
        return false;
    }
}

// ============ Image API ============

/**
 * Upload images for an item
 * @param {string} sku 
 * @param {FormData} formData - Contains 'primary' and/or 'gallery' files
 * @returns {Promise<Object>}
 */
async function uploadItemImages(sku, formData) {
    const token = getToken();
    const url = `${API_BASE}/items/${encodeURIComponent(sku)}/images`;

    try {
        const response = await fetch(url, {
            method: 'POST',
            headers: {
                ...(token && { 'Authorization': `Bearer ${token}` })
                // Don't set Content-Type - let browser set it with boundary
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to upload images');
        }

        return data;
    } catch (error) {
        console.error('Upload images error:', error);
        throw error;
    }
}

/**
 * Delete an item image
 * @param {string} sku 
 * @param {string} filename 
 * @returns {Promise<Object>}
 */
async function deleteItemImage(sku, filename) {
    return apiRequest(`/items/${encodeURIComponent(sku)}/images/${encodeURIComponent(filename)}`, {
        method: 'DELETE'
    });
}

/**
 * Replace primary image
 * @param {string} sku 
 * @param {FormData} formData - Contains 'image' file
 * @returns {Promise<Object>}
 */
async function replacePrimaryImage(sku, formData) {
    const token = getToken();
    const url = `${API_BASE}/items/${encodeURIComponent(sku)}/images/primary`;

    try {
        const response = await fetch(url, {
            method: 'PUT',
            headers: {
                ...(token && { 'Authorization': `Bearer ${token}` })
            },
            body: formData
        });

        const data = await response.json();

        if (!response.ok) {
            throw new Error(data.message || 'Failed to replace image');
        }

        return data;
    } catch (error) {
        console.error('Replace primary image error:', error);
        throw error;
    }
}

/**
 * Get images for an item
 * @param {string} sku 
 * @returns {Promise<Object>}
 */
async function getItemImages(sku) {
    return apiRequest(`/items/${encodeURIComponent(sku)}/images`);
}

// Export API module
window.api = {
    // Token management
    getToken,
    setToken,
    removeToken,
    hasToken,

    // Auth
    login,
    logout,
    getCurrentUser,

    // Items
    createItem,
    getItems,
    getItemBySku,
    updateItem,
    deleteItem,
    restoreItem,

    // Images
    uploadItemImages,
    deleteItemImage,
    replacePrimaryImage,
    getItemImages,

    // Settings
    getSettings,
    updateSettings,
    addDiamondType,
    updateDiamondType,
    checkDiamondTypeUsage,
    removeDiamondType,
    addCategory,
    updateCategory,
    checkCategoryUsage,
    removeCategory,

    // Dashboard
    getDashboardStats,
    getRecentItems,

    // Health
    checkHealth,

    // Item Masters (v1.4.0)
    getItemMasters: () => apiRequest('/item-masters'),
    getItemMasterById: (id) => apiRequest(`/item-masters/${id}`),

    // Modular Settings (v1.4.0)
    getModularSchemas: () => apiRequest('/modular/schemas'),
    getModularPricingRules: () => apiRequest('/modular/pricing-rules'),
    getModularRateTables: () => apiRequest('/modular/rate-tables'),
    getActiveRateTable: () => apiRequest('/modular/rate-tables/active'),

    // RBAC v1.4.0: Public endpoints (no auth required)
    getPublicItemBySku: async (sku) => {
        const url = `${API_BASE}/public/items/${encodeURIComponent(sku)}`;
        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Item not found');
        return data;
    },
    getPublicSettings: async () => {
        const url = `${API_BASE}/public/settings`;
        const response = await fetch(url);
        const data = await response.json();
        if (!response.ok) throw new Error(data.message || 'Failed to get settings');
        return data;
    },

    // RBAC v1.4.0: Admin user management
    getUsers: () => apiRequest('/admin/users'),
    getUser: (id) => apiRequest(`/admin/users/${id}`),
    createUser: (userData) => apiRequest('/admin/users', {
        method: 'POST',
        body: JSON.stringify(userData)
    }),
    updateUser: (id, userData) => apiRequest(`/admin/users/${id}`, {
        method: 'PUT',
        body: JSON.stringify(userData)
    }),
    resetUserPassword: (id, newPassword) => apiRequest(`/admin/users/${id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ newPassword })
    })
};
