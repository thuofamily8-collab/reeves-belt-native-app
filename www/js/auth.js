/**
 * ============================================================
 * REEVES BELT SECURE 360 - AUTH HELPERS
 * ============================================================
 */

var RBAuth = (function() {

    function isLoggedIn() {
        return !!localStorage.getItem('rb_token');
    }

    function getCurrentUser() {
        var userJson = localStorage.getItem('rb_user');
        if (!userJson) return null;
        try {
            return JSON.parse(userJson);
        } catch (e) {
            return null;
        }
    }

    /**
     * NEW: Return the user's role (or empty string if not logged in)
     */
    function getRole() {
        var u = getCurrentUser();
        return u && u.role ? u.role : '';
    }

    /**
     * NEW: True if the current user has the supervisor role
     */
    function isSupervisor() {
        return getRole() === 'supervisor';
    }

    /**
     * NEW: Where to send the user after login (based on role)
     */
    function getDefaultLandingPage() {
        return isSupervisor() ? 'supervisor.html' : 'dashboard.html';
    }

    function getTenantName() {
        return localStorage.getItem('rb_tenant_name') || 'No Tenant';
    }

    function getPermissions() {
        try {
            return JSON.parse(localStorage.getItem('rb_permissions') || '[]');
        } catch (e) {
            return [];
        }
    }

    function hasPermission(permKey) {
        return getPermissions().indexOf(permKey) !== -1;
    }

    function saveSession(data) {
        localStorage.setItem('rb_token', data.token);
        localStorage.setItem('rb_user', JSON.stringify(data.user));
        localStorage.setItem('rb_tenant_id', data.user.tenant_id || '');
        localStorage.setItem('rb_tenant_name', data.tenant_name || '');
        localStorage.setItem('rb_permissions', JSON.stringify(data.permissions || []));
        localStorage.setItem('rb_expires_at', data.expires_at || '');

        // Also save to Capacitor Preferences for native persistence
        if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Preferences) {
            var P = Capacitor.Plugins.Preferences;
            P.set({ key: 'rb_token', value: data.token });
            P.set({ key: 'rb_user', value: JSON.stringify(data.user) });
            P.set({ key: 'rb_tenant_name', value: data.tenant_name || '' });
            P.set({ key: 'rb_permissions', value: JSON.stringify(data.permissions || []) });
        }
    }

    function clearSession() {
        localStorage.removeItem('rb_token');
        localStorage.removeItem('rb_user');
        localStorage.removeItem('rb_tenant_id');
        localStorage.removeItem('rb_tenant_name');
        localStorage.removeItem('rb_permissions');
        localStorage.removeItem('rb_expires_at');

        if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Preferences) {
            var P = Capacitor.Plugins.Preferences;
            P.remove({ key: 'rb_token' });
            P.remove({ key: 'rb_user' });
            P.remove({ key: 'rb_tenant_name' });
            P.remove({ key: 'rb_permissions' });
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
        // Try server-side logout, but always clear locally
        RBApi.logout().then(function() {
        }).catch(function() {
        }).then(function() {
            clearSession();
            window.location.href = 'login.html';
        });
    }

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
        logout: logout
    };
})();
