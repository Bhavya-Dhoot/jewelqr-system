/**
 * Utility Functions
 * Shared helper functions across the application
 */

/**
 * Format currency with Indian Rupee symbol
 * @param {number} value - The numeric value to format
 * @param {string} currency - Currency symbol (default ₹)
 * @returns {string} Formatted currency string
 */
function formatCurrency(value, currency = '₹') {
    return `${currency} ${value.toLocaleString('en-IN', {
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    })}`;
}

/**
 * Debounce function calls
 * @param {Function} func - Function to debounce
 * @param {number} wait - Wait time in milliseconds
 * @returns {Function} Debounced function
 */
function debounce(func, wait) {
    let timeout;
    return function executedFunction(...args) {
        const later = () => {
            clearTimeout(timeout);
            func(...args);
        };
        clearTimeout(timeout);
        timeout = setTimeout(later, wait);
    };
}

/**
 * Format timestamp
 * @param {Date} date
 * @returns {string} Formatted timestamp
 */
function formatTimestamp(date = new Date()) {
    return date.toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    });
}

/**
 * PERF: Cached DOM element lookup
 * Avoids repeated querySelector calls for same elements
 */
const domCache = new Map();
function $(selector) {
    if (!domCache.has(selector)) {
        domCache.set(selector, document.querySelector(selector));
    }
    return domCache.get(selector);
}

function $id(id) {
    if (!domCache.has(id)) {
        domCache.set(id, document.getElementById(id));
    }
    return domCache.get(id);
}

// Clear cache on navigation (SPA support)
window.addEventListener('beforeunload', () => domCache.clear());

/**
 * Throttle function calls (rate limit)
 * @param {Function} func - Function to throttle
 * @param {number} limit - Minimum ms between calls
 * @returns {Function} Throttled function
 */
function throttle(func, limit) {
    let lastCall = 0;
    return function (...args) {
        const now = Date.now();
        if (now - lastCall >= limit) {
            lastCall = now;
            return func.apply(this, args);
        }
    };
}

/**
 * Escape HTML to prevent XSS
 * @param {string} str
 * @returns {string}
 */
function escapeHtml(str) {
    if (!str) return '';
    const div = document.createElement('div');
    div.textContent = str;
    return div.innerHTML;
}

// NOTE: API helpers are in js/api.js
// NOTE: Toast helper is in js/components.js (window.showToast)
