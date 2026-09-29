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

    var USER_KEY = 'rb_user';
    var TENANT_KEY = 'rb_tenant_name';

    function _haveVault() {
        return typeof RBVault !== 'undefined' && RBVault && RBVault.addProfile;
    }

    // ============================================================
    // LOGIN
    // ============================================================
    function login(username, password, deviceInfo) {
        return RBApi.login(username, password, deviceInfo).then(function(res) {
            // res shape expected: { success, token, user: {...}, tenant_name? }
            var user = res.user || res.data && res.data.user || null;
            var token = res.token || res.data && res.data.token || '';
            var tenantName = res.tenant_name || (res.data && res.data.tenant_name) || '';

            if (user && _haveVault()) {
                RBVault.addProfile({
                    user_id: user.id,
                    username: user.username,
                    full_name: user.full_name,
                    role: user.role,
                    tenant_id: user.tenant_id,
                    token: token,
                    token_set_at: Math.floor(Date.now() / 1000)
                });
                RBVault.setActiveId(user.id);
            } else {
                // Fallback: old single-token path
                if (token) RBApi.setToken(token);
                if (user) localStorage.setItem(USER_KEY, JSON.stringify(user));
            }

            if (tenantName) localStorage.setItem(TENANT_KEY, tenantName);
            return res;
        });
    }

    // ============================================================
    // LOGOUT (removes just the active profile)
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

        // If any profiles remain, switch to the next one.
        if (_haveVault()) {
            var remaining = RBVault.getAllProfiles();
            if (remaining.length > 0) {
                RBVault.setActiveId(remaining[0].user_id);
                window.location.href = 'dashboard.html';
                return;
            }
        }

        window.location.href = 'login.html';
    }

    // ============================================================
    // SESSION STATE
    // ============================================================
    function isLoggedIn() {
        if (_haveVault()) {
            var active = RBVault.getActiveProfile();
            return !!(active && active.token);
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
            if (!p) return null;
            return {
                id: p.user_id,
                username: p.username,
                full_name: p.full_name,
                role: p.role,
                tenant_id: p.tenant_id
            };
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
        return !!(u && (u.role === 'supervisor' || u.role === 'company_admin' || u.role === 'super_admin'));
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
        // we log in as them, capture their token, then switch back.
        if (!_haveVault()) return null;
        var user = loginRes.user || (loginRes.data && loginRes.data.user) || null;
        var token = loginRes.token || (loginRes.data && loginRes.data.token) || '';
        if (!user || !token) return null;

        var profile = {
            user_id: user.id,
            username: user.username,
            full_name: user.full_name,
            role: user.role,
            tenant_id: user.tenant_id,
            token: token,
            token_set_at: Math.floor(Date.now() / 1000)
        };
        RBVault.addProfile(profile);
        return profile;
    }

    // ============================================================
    return {
        login:             login,
        logout:            logout,
        isLoggedIn:        isLoggedIn,
        requireLogin:      requireLogin,
        getToken:          getToken,
        getCurrentUser:    getCurrentUser,
        getTenantName:     getTenantName,
        isSupervisor:      isSupervisor,
        getAllProfiles:    getAllProfiles,
        switchTo:          switchTo,
        addProfileFromLogin: addProfileFromLogin
    };

})();
