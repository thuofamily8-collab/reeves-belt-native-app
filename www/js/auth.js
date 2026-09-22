/**
 * ============================================================
 * REEVES BELT SECURE 360 - AUTH HELPERS
 * ============================================================
 * SPRINT 1:
 *   - Offline login using cached credentials
 *   - 14-day offline validity window
 *   - Password hashed with SHA-256 + random salt
 * ============================================================
 */

var RBAuth = (function() {

    // ---------- Config ----------
    var OFFLINE_DAYS = 14;
    var OFFLINE_MS   = OFFLINE_DAYS * 24 * 60 * 60 * 1000;

    // ---------- Session keys ----------
    var K_TOKEN        = 'rb_token';
    var K_USER         = 'rb_user';
    var K_TENANT_ID    = 'rb_tenant_id';
    var K_TENANT_NAME  = 'rb_tenant_name';
    var K_PERMISSIONS  = 'rb_permissions';
    var K_EXPIRES_AT   = 'rb_expires_at';

    // ---------- Offline credential keys ----------
    var K_SALT       = 'rb_cred_salt';
    var K_HASH       = 'rb_cred_hash';
    var K_CRED_USER  = 'rb_cred_user';
    var K_LAST_LOGIN = 'rb_last_online_login';

    // ============================================================
    // SESSION
    // ============================================================

    function isLoggedIn() {
        return !!localStorage.getItem(K_TOKEN);
    }

    function getCurrentUser() {
        var userJson = localStorage.getItem(K_USER);
        if (!userJson) return null;
        try {
            return JSON.parse(userJson);
        } catch (e) {
            return null;
        }
    }

    function getRole() {
        var u = getCurrentUser();
        return u && u.role ? u.role : '';
    }

    function isSupervisor() {
        return getRole() === 'supervisor';
    }

    function getDefaultLandingPage() {
        return isSupervisor() ? 'supervisor.html' : 'dashboard.html';
    }

    function getTenantName() {
        return localStorage.getItem(K_TENANT_NAME) || 'No Tenant';
    }

    function getPermissions() {
        try {
            return JSON.parse(localStorage.getItem(K_PERMISSIONS) || '[]');
        } catch (e) {
            return [];
        }
    }

    function hasPermission(permKey) {
        return getPermissions().indexOf(permKey) !== -1;
    }

    function saveSession(data) {
        localStorage.setItem(K_TOKEN, data.token);
        localStorage.setItem(K_USER, JSON.stringify(data.user));
        localStorage.setItem(K_TENANT_ID, data.user.tenant_id || '');
        localStorage.setItem(K_TENANT_NAME, data.tenant_name || '');
        localStorage.setItem(K_PERMISSIONS, JSON.stringify(data.permissions || []));
        localStorage.setItem(K_EXPIRES_AT, data.expires_at || '');
        localStorage.setItem(K_LAST_LOGIN, String(Date.now()));

        if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Preferences) {
            var P = Capacitor.Plugins.Preferences;
            P.set({ key: K_TOKEN, value: data.token });
            P.set({ key: K_USER, value: JSON.stringify(data.user) });
            P.set({ key: K_TENANT_NAME, value: data.tenant_name || '' });
            P.set({ key: K_PERMISSIONS, value: JSON.stringify(data.permissions || []) });
        }
    }

    function clearSession() {
        localStorage.removeItem(K_TOKEN);
        localStorage.removeItem(K_USER);
        localStorage.removeItem(K_TENANT_ID);
        localStorage.removeItem(K_TENANT_NAME);
        localStorage.removeItem(K_PERMISSIONS);
        localStorage.removeItem(K_EXPIRES_AT);

        if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Preferences) {
            var P = Capacitor.Plugins.Preferences;
            P.remove({ key: K_TOKEN });
            P.remove({ key: K_USER });
            P.remove({ key: K_TENANT_NAME });
            P.remove({ key: K_PERMISSIONS });
        }
    }

    function requireLogin() {
        if (!isLoggedIn()) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

    function logout() {
        RBApi.logout().then(function() {
        }).catch(function() {
        }).then(function() {
            clearSession();
            window.location.href = 'login.html';
        });
    }

    // ============================================================
    // OFFLINE CREDENTIALS (SPRINT 1)
    // ============================================================

    function randomSalt() {
        var arr = new Uint8Array(16);
        if (window.crypto && window.crypto.getRandomValues) {
            window.crypto.getRandomValues(arr);
        } else {
            for (var i = 0; i < arr.length; i++) arr[i] = Math.floor(Math.random() * 256);
        }
        var hex = '';
        for (var j = 0; j < arr.length; j++) {
            hex += ('0' + arr[j].toString(16)).slice(-2);
        }
        return hex;
    }

    function sha256Hex(str) {
        if (window.crypto && window.crypto.subtle && window.TextEncoder) {
            var enc = new TextEncoder();
            return window.crypto.subtle.digest('SHA-256', enc.encode(str)).then(function (buf) {
                var bytes = new Uint8Array(buf);
                var hex = '';
                for (var i = 0; i < bytes.length; i++) {
                    hex += ('0' + bytes[i].toString(16)).slice(-2);
                }
                return hex;
            });
        }
        // Fallback for ancient WebViews (should never hit on Android 7+)
        return Promise.resolve('plain:' + str);
    }

    function hashPassword(password, salt) {
        return sha256Hex(salt + '|' + password);
    }

    /**
     * Cache credentials after a successful ONLINE login.
     * Enables offline login later.
     */
    function cacheCredentials(username, password) {
        var salt = randomSalt();
        return hashPassword(password, salt).then(function (hash) {
            try {
                localStorage.setItem(K_SALT, salt);
                localStorage.setItem(K_HASH, hash);
                localStorage.setItem(K_CRED_USER, username);
            } catch (e) { /* ignore */ }
            return true;
        });
    }

    function hasCachedCredentials() {
        return !!(localStorage.getItem(K_SALT) && localStorage.getItem(K_HASH));
    }

    function clearCachedCredentials() {
        localStorage.removeItem(K_SALT);
        localStorage.removeItem(K_HASH);
        localStorage.removeItem(K_CRED_USER);
    }

    /**
     * Try to log in offline using cached credentials.
     * Returns a Promise resolving to { ok, message? }
     */
    function loginOffline(username, password) {
        var storedSalt = localStorage.getItem(K_SALT);
        var storedHash = localStorage.getItem(K_HASH);
        var storedUser = localStorage.getItem(K_CRED_USER);

        if (!storedSalt || !storedHash || !storedUser) {
            return Promise.resolve({
                ok: false,
                message: 'No offline credentials cached. Please connect and log in once.'
            });
        }

        var lastLogin = parseInt(localStorage.getItem(K_LAST_LOGIN) || '0', 10);
        if (lastLogin && (Date.now() - lastLogin) > OFFLINE_MS) {
            return Promise.resolve({
                ok: false,
                message: 'Offline session expired (' + OFFLINE_DAYS + ' days). Connect to log in again.'
            });
        }

        if (username.toLowerCase() !== storedUser.toLowerCase()) {
            return Promise.resolve({ ok: false, message: 'Invalid credentials.' });
        }

        return hashPassword(password, storedSalt).then(function (attempt) {
            if (attempt === storedHash) {
                return { ok: true };
            }
            return { ok: false, message: 'Invalid credentials.' };
        });
    }

    // ============================================================
    // PUBLIC API
    // ============================================================
    return {
        isLoggedIn: isLoggedIn,
        getCurrentUser: getCurrentUser,
        getRole: getRole,
        isSupervisor: isSupervisor,
        getDefaultLandingPage: getDefaultLandingPage,
        getTenantName: getTenantName,
        getPermissions: getPermissions,
        hasPermission: hasPermission,
        saveSession: saveSession,
        clearSession: clearSession,
        requireLogin: requireLogin,
        logout: logout,

        // Sprint 1 — offline
        cacheCredentials:       cacheCredentials,
        loginOffline:           loginOffline,
        hasCachedCredentials:   hasCachedCredentials,
        clearCachedCredentials: clearCachedCredentials
    };
})();
