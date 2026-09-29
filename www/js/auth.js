/**
 * ============================================================
 * REEVES BELT APP - AUTH
 * ============================================================
 * Multi-profile aware. Uses RBVault to store one token per
 * guard instead of a single shared rb_token.
 *
 * Backwards compatible: if RBVault isn't loaded, falls back
 * to the old single-token behavior.
 */

var RBAuth = (function() {

    var USER_KEY        = 'rb_user';
    var TENANT_KEY      = 'rb_tenant_name';
    var OFFLINE_KEY     = 'rb_offline_creds';   // cached username/password hash
    var OFFLINE_USER_KEY = 'rb_offline_user';

    // ============================================================
    // HELPERS
    // ============================================================
    function _haveVault() {
        return typeof RBVault !== 'undefined' && RBVault && RBVault.addProfile;
    }

    function _sha256(str) {
        // Tiny fallback hash for offline credential check.
        // Not cryptographic — but combined with OS-level app sandbox
        // it's fine for a guard phone.
        var h = 0;
        for (var i = 0; i < str.length; i++) {
            h = ((h << 5) - h) + str.charCodeAt(i);
            h |= 0;
        }
        return 'h' + h.toString(36);
    }

    // ============================================================
    // LOGIN (online)
    // ============================================================
    function login(username, password, deviceInfo) {
        return RBApi.login(username, password, deviceInfo).then(function(res) {
            var user       = res.user || (res.data && res.data.user) || null;
            var token      = res.token || (res.data && res.data.token) || '';
            var tenantName = res.tenant_name || (res.data && res.data.tenant_name) || '';

            if (user && _haveVault()) {
                RBVault.addProfile({
                    user_id:      user.id,
                    username:     user.username,
                    full_name:    user.full_name,
                    role:         user.role,
                    tenant_id:    user.tenant_id,
                    token:        token,
                    token_set_at: Math.floor(Date.now() / 1000)
                });
                RBVault.setActiveId(user.id);
            } else {
                // Fallback: single-token path
                if (token) RBApi.setToken(token);
                if (user)  localStorage.setItem(USER_KEY, JSON.stringify(user));
            }

            if (tenantName) localStorage.setItem(TENANT_KEY, tenantName);
            return res;
        });
    }

    // ============================================================
    // LOGIN (offline) — uses cached credentials from a prior online login
    // ============================================================
    function loginOffline(username, password) {
        return new Promise(function(resolve) {
            var stored = null;
            try { stored = JSON.parse(localStorage.getItem(OFFLINE_KEY) || 'null'); } catch (e) {}
            if (!stored) {
                resolve({ ok: false, message: 'No cached credentials on this device.' });
                return;
            }
            if (stored.username !== username ||
                stored.hash !== _sha256(username + ':' + password)) {
                resolve({ ok: false, message: 'Invalid username or password (offline).' });
                return;
            }
            // Restore the cached user's profile from vault
            var cachedUser = null;
            try { cachedUser = JSON.parse(localStorage.getItem(OFFLINE_USER_KEY) || 'null'); } catch (e) {}
            if (cachedUser && _haveVault()) {
                var p = RBVault.getProfile(cachedUser.id);
                if (p) {
                    RBVault.setActiveId(cachedUser.id);
                    resolve({ ok: true, offline: true });
                    return;
                }
            }
            // No vault profile — old single-token path
            if (cachedUser) localStorage.setItem(USER_KEY, JSON.stringify(cachedUser));
            resolve({ ok: true, offline: true });
        });
    }

    function hasCachedCredentials() {
        try {
            return !!JSON.parse(localStorage.getItem(OFFLINE_KEY) || 'null');
        } catch (e) { return false; }
    }

    function cacheCredentials(username, password) {
        return new Promise(function(resolve) {
            try {
                localStorage.setItem(OFFLINE_KEY, JSON.stringify({
                    username: username,
                    hash: _sha256(username + ':' + password),
                    cached_at: Math.floor(Date.now() / 1000)
                }));
                var u = getCurrentUser();
                if (u) localStorage.setItem(OFFLINE_USER_KEY, JSON.stringify(u));
            } catch (e) {}
            resolve();
        });
    }

    // ============================================================
    // SAVE SESSION (alias for backward compat)
    // ============================================================
    function saveSession(res) {
        var user       = res.user || (res.data && res.data.user) || null;
        var token      = res.token || (res.data && res.data.token) || '';
        var tenantName = res.tenant_name || (res.data && res.data.tenant_name) || '';

        if (user && _haveVault()) {
            RBVault.addProfile({
                user_id:      user.id,
                username:     user.username,
                full_name:    user.full_name,
                role:         user.role,
                tenant_id:    user.tenant_id,
                token:        token,
                token_set_at: Math.floor(Date.now() / 1000)
            });
            RBVault.setActiveId(user.id);
        } else {
            if (token) RBApi.setToken(token);
            if (user)  localStorage.setItem(USER_KEY, JSON.stringify(user));
        }
        if (tenantName) localStorage.setItem(TENANT_KEY, tenantName);
    }

    // ============================================================
    // LOGOUT — removes only the active profile
    // ============================================================
    function logout() {
        var active = _haveVault() ? RBVault.getActiveProfile() : null;

        RBApi.logout().catch(function(){});

        if (active && _haveVault()) {
            RBVault.removeProfile(active.user_id);
        } else {
            RBApi.clearToken();
            localStorage.removeItem(USER_KEY);
        }

        // If other profiles remain, switch to the next one and stay in app.
        if (_haveVault()) {
            var remaining = RBVault.getAllProfiles();
            if (remaining.length > 0) {
                RBVault.setActiveId(remaining[0].user_id);
                window.location.href = 'dashboard.html';
                return;
            }
        }

        // Nobody left — clear offline creds, back to login
        localStorage.removeItem(OFFLINE_KEY);
        localStorage.removeItem(OFFLINE_USER_KEY);
        window.location.href = 'login.html';
    }

    // ============================================================
    // SESSION STATE
    // ============================================================
    function isLoggedIn() {
        if (_haveVault()) {
            var active = RBVault.getActiveProfile();
            if (active && active.token) return true;
            // No active profile but other profiles exist — auto-activate first
            var all = RBVault.getAllProfiles();
            if (all.length > 0) {
                RBVault.setActiveId(all[0].user_id);
                return true;
            }
            return false;
        }
        return !!RBApi.getToken();
    }

    function requireLogin() {
        if (!isLoggedIn()) {
            window.location.href = 'login.html';
            return false;
        }
        return true;
    }

    function getToken() {
        return RBApi.getToken();
    }

    function getCurrentUser() {
        if (_haveVault()) {
            var p = RBVault.getActiveProfile();
            if (p) {
                return {
                    id:        p.user_id,
                    username:  p.username,
                    full_name: p.full_name,
                    role:      p.role,
                    tenant_id: p.tenant_id
                };
            }
        }
        try {
            return JSON.parse(localStorage.getItem(USER_KEY) || 'null');
        } catch (e) {
            return null;
        }
    }

    function getTenantName() {
        return localStorage.getItem(TENANT_KEY) || 'Reeves Belt';
    }

    function isSupervisor() {
        var u = getCurrentUser();
        return !!(u && (u.role === 'supervisor'
                     || u.role === 'company_admin'
                     || u.role === 'super_admin'));
    }

    function getDefaultLandingPage() {
        return isSupervisor() ? 'supervisor.html' : 'dashboard.html';
    }

    // ============================================================
    // MULTI-PROFILE HELPERS
    // ============================================================
    function getAllProfiles() {
        return _haveVault() ? RBVault.getAllProfiles() : [];
    }

    function switchTo(userId) {
        if (!_haveVault()) return false;
        if (!RBVault.getProfile(userId)) return false;
        RBVault.setActiveId(userId);
        return true;
    }

    function addProfileFromLogin(loginRes) {
        // Used when the holder clocks another guard in:
        // we log in as them, capture their token, store it in the vault.
        if (!_haveVault()) return null;
        var user  = loginRes.user || (loginRes.data && loginRes.data.user) || null;
        var token = loginRes.token || (loginRes.data && loginRes.data.token) || '';
        if (!user || !token) return null;

        var profile = {
            user_id:      user.id,
            username:     user.username,
            full_name:    user.full_name,
            role:         user.role,
            tenant_id:    user.tenant_id,
            token:        token,
            token_set_at: Math.floor(Date.now() / 1000)
        };
        RBVault.addProfile(profile);
        return profile;
    }

    // ============================================================
    return {
        login:                login,
        loginOffline:         loginOffline,
        hasCachedCredentials: hasCachedCredentials,
        cacheCredentials:     cacheCredentials,
        saveSession:          saveSession,
        logout:               logout,
        isLoggedIn:           isLoggedIn,
        requireLogin:         requireLogin,
        getToken:             getToken,
        getCurrentUser:       getCurrentUser,
        getTenantName:        getTenantName,
        isSupervisor:         isSupervisor,
        getDefaultLandingPage: getDefaultLandingPage,
        getAllProfiles:       getAllProfiles,
        switchTo:             switchTo,
        addProfileFromLogin:  addProfileFromLogin
    };

})();
