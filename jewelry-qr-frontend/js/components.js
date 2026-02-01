/**
 * Reusable UI Components
 * Shared component functions
 */

// This file can be expanded with reusable component factories
// For now, it serves as a placeholder for future component abstractions

/**
 * Create toast notification (can be called from any page)
 * This is already implemented in each page, but could be centralized here
 */
window.showToast = function (message, type = 'info') {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const icons = {
        success: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2"/><path d="M6 10l3 3 5-6" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        error: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2"/><path d="M10 6v4m0 4h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        warning: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><path d="M10 2L2 17h16L10 2z" stroke="currentColor" stroke-width="2"/><path d="M10 8v4m0 2h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>',
        info: '<svg width="20" height="20" viewBox="0 0 20 20" fill="none"><circle cx="10" cy="10" r="9" stroke="currentColor" stroke-width="2"/><path d="M10 10v4m0-6h.01" stroke="currentColor" stroke-width="2" stroke-linecap="round"/></svg>'
    };

    const toast = document.createElement('div');
    toast.className = `toast toast-${type}`;
    toast.innerHTML = `
    <div class="toast-icon">${icons[type]}</div>
    <div class="toast-content">
      <div class="toast-message">${message}</div>
    </div>
    <button class="toast-close" aria-label="Close">
      <svg width="16" height="16" viewBox="0 0 16 16" fill="none">
        <path d="M12 4L4 12M4 4l8 8" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
      </svg>
    </button>
  `;

    container.appendChild(toast);

    toast.querySelector('.toast-close').addEventListener('click', () => toast.remove());
    setTimeout(() => toast.parentElement && toast.remove(), 5000);
};
