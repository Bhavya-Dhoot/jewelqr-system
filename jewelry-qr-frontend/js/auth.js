/**
 * Authentication Module
 * Uses JWT-based authentication with backend API
 * Falls back to mock auth if API unavailable (for development)
 * RBAC v1.4.0: Added role-based protection and force logout
 */

const AUTH_KEY = 'jewelqr_auth';
const USER_KEY = 'jewelqr_user';

// Demo users fallback (when API unavailable)
const DEMO_USERS = {
    'admin': { password: 'admin123', name: 'Admin User', role: 'admin' },
    'staff': { password: 'staff123', name: 'Staff Member', role: 'staff' }
};

/**
 * Check if user is authenticated
 * @returns {boolean}
 */
function isAuthenticated() {
    // Check for JWT token first (API mode)
    if (typeof api !== 'undefined' && api.hasToken()) {
        return true;
    }
    // Fallback to localStorage (mock mode)
    return localStorage.getItem(AUTH_KEY) === 'true';
}

/**
 * Get current user info
 * @returns {Object|null}
 */
function getCurrentUser() {
    const userJson = localStorage.getItem(USER_KEY);
    if (userJson) {
        try {
            return JSON.parse(userJson);
        } catch (e) {
            return null;
        }
    }
    return null;
}

/**
 * Check if current user is admin
 * @returns {boolean}
 */
function isAdmin() {
    const user = getCurrentUser();
    return user && user.role === 'admin';
}

/**
 * Store user info locally
 * @param {Object} user 
 */
function storeUser(user) {
    localStorage.setItem(AUTH_KEY, 'true');
    localStorage.setItem(USER_KEY, JSON.stringify(user));
}

/**
 * Attempt login with username and password
 * @param {string} username 
 * @param {string} password 
 * @returns {Promise<Object>} { success: boolean, message: string, user?: Object }
 */
async function login(username, password) {
    // Try API login first
    if (typeof api !== 'undefined') {
        try {
            const response = await api.login(username, password);
            if (response.success) {
                storeUser(response.user);
                return {
                    success: true,
                    message: 'Login successful',
                    user: response.user
                };
            }
            return { success: false, message: response.message || 'Login failed' };
        } catch (error) {
            console.warn('API login failed, trying fallback:', error.message);
            // Fall through to mock login
        }
    }

    // Fallback to mock login (for development without backend)
    return mockLogin(username, password);
}

/**
 * Mock login (fallback when API unavailable)
 * @param {string} username 
 * @param {string} password 
 * @returns {Object}
 */
function mockLogin(username, password) {
    const user = DEMO_USERS[username.toLowerCase()];

    if (!user) {
        return { success: false, message: 'User not found' };
    }

    if (user.password !== password) {
        return { success: false, message: 'Invalid password' };
    }

    const userData = {
        username: username.toLowerCase(),
        name: user.name,
        role: user.role
    };

    storeUser(userData);

    return {
        success: true,
        message: 'Login successful (offline mode)',
        user: userData
    };
}

/**
 * Logout current user
 */
async function logout() {
    // Try API logout
    if (typeof api !== 'undefined') {
        try {
            await api.logout();
        } catch (error) {
            console.warn('API logout failed:', error.message);
        }
    }

    // Clear local storage
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(USER_KEY);

    // Redirect to login
    window.location.href = 'login.html';
}

/**
 * Force logout with message (RBAC v1.4.0)
 * Used when session is invalidated by admin
 * @param {string} message - Message to show on login page
 */
function forceLogout(message) {
    // Clear local storage
    localStorage.removeItem(AUTH_KEY);
    localStorage.removeItem(USER_KEY);
    if (typeof api !== 'undefined') {
        api.removeToken();
    }

    // Store message for login page to display
    if (message) {
        sessionStorage.setItem('auth_message', message);
    }

    // Redirect to login
    if (!window.location.pathname.includes('login.html')) {
        window.location.href = 'login.html?reason=force_logout';
    }
}

/**
 * Protect a page - redirect to login if not authenticated
 * @param {boolean} requireAuth - If true, redirects unauthenticated users to login
 * @returns {boolean}
 */
function protectPage(requireAuth = true) {
    if (requireAuth && !isAuthenticated()) {
        sessionStorage.setItem('redirect_after_login', window.location.href);
        window.location.href = 'login.html';
        return false;
    }
    return true;
}

/**
 * Protect admin-only pages (RBAC v1.4.0)
 * Redirects staff to restricted.html, unauthenticated to login
 * @returns {boolean}
 */
function protectPageAdmin() {
    if (!isAuthenticated()) {
        sessionStorage.setItem('redirect_after_login', window.location.href);
        window.location.href = 'login.html';
        return false;
    }

    const user = getCurrentUser();
    if (!user || user.role !== 'admin') {
        window.location.href = 'restricted.html';
        return false;
    }

    return true;
}

/**
 * Get redirect URL after successful login
 * @returns {string}
 */
function getRedirectUrl() {
    const redirect = sessionStorage.getItem('redirect_after_login');
    sessionStorage.removeItem('redirect_after_login');

    // Staff can access dashboard and create pages
    // Only settings/users are admin-only
    return redirect || 'dashboard.html';
}

/**
 * Get auth message (set by force logout)
 * @returns {string|null}
 */
function getAuthMessage() {
    const message = sessionStorage.getItem('auth_message');
    sessionStorage.removeItem('auth_message');
    return message;
}

/**
 * Verify token with API (async validation)
 * @returns {Promise<boolean>}
 */
async function verifyAuth() {
    if (typeof api !== 'undefined' && api.hasToken()) {
        try {
            const response = await api.getCurrentUser();
            if (response.success && response.user) {
                storeUser(response.user);
                return true;
            }
        } catch (error) {
            console.warn('Token verification failed:', error.message);
            // Token invalid, clear it
            if (typeof api !== 'undefined') {
                api.removeToken();
            }
            localStorage.removeItem(AUTH_KEY);
            localStorage.removeItem(USER_KEY);
        }
    }
    return isAuthenticated();
}

/**
 * Update navigation UI based on auth state (RBAC v1.4.0)
 * Hides admin links for staff users
 */
function updateNavAuth() {
    const authBtn = document.getElementById('authBtn');
    const userDisplay = document.getElementById('userDisplay');
    const user = getCurrentUser();

    if (isAuthenticated()) {
        if (authBtn) {
            authBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M14 6a4 4 0 11-8 0 4 4 0 018 0zM4 16a8 8 0 0116 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Logout
      `;
            authBtn.onclick = logout;
        }

        if (userDisplay && user) {
            userDisplay.textContent = user.name;
            userDisplay.classList.remove('hidden');
        }

        // RBAC v1.4.0: Hide admin-only nav links for staff
        if (user && user.role === 'staff') {
            document.querySelectorAll('.nav-link-admin').forEach(el => {
                el.style.display = 'none';
            });
        }
    } else {
        if (authBtn) {
            authBtn.innerHTML = `
        <svg width="20" height="20" viewBox="0 0 20 20" fill="none" aria-hidden="true">
          <path d="M14 6a4 4 0 11-8 0 4 4 0 018 0zM4 16a8 8 0 0116 0" stroke="currentColor" stroke-width="2" stroke-linecap="round"/>
        </svg>
        Login
      `;
            authBtn.onclick = () => window.location.href = 'login.html';
        }

        if (userDisplay) {
            userDisplay.classList.add('hidden');
        }
    }
}

// RBAC v1.4.0: Listen for force logout events from api.js
window.addEventListener('auth:forceLogout', (event) => {
    const message = event.detail?.message || 'Session expired';
    forceLogout(message);
});

// Export for use in other modules
window.auth = {
    isAuthenticated,
    getCurrentUser,
    isAdmin,
    login,
    logout,
    forceLogout,
    protectPage,
    protectPageAdmin,
    getRedirectUrl,
    getAuthMessage,
    updateNavAuth,
    verifyAuth
};
