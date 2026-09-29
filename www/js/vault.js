/**
 * ============================================================
 * REEVES BELT APP — MULTI-PROFILE TOKEN VAULT
 * ============================================================
 * Stores one token slot per guard. Multiple guards can be
 * "logged in" to the same phone simultaneously.
 *
 *   rb_profiles          → { "2": {...}, "5": {...} }
 *   rb_active_profile_id → which guard is currently the UI user
 *
 * Separately, the SERVER tracks who holds the physical phone
 * (is_device_holder on staff_sessions). That's independent of
 * which guard's token is "active" in this vault.
 */

var RBVault = (function () {

    var STORAGE_KEY = 'rb_profiles';
    var ACTIVE_KEY  = 'rb_active_profile_id';

    function _read() {
        try {
            return JSON.parse(localStorage.getItem(STORAGE_KEY) || '{}');
        } catch (e) {
            return {};
        }
    }

    function _write(obj) {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(obj));
    }

    function addProfile(profile) {
        if (!profile || !profile.user_id) return;
        var v = _read();
        v[String(profile.user_id)] = {
            user_id:        profile.user_id,
            username:       profile.username || '',
            full_name:      profile.full_name || '',
            role:           profile.role || 'guard',
            tenant_id:      profile.tenant_id || null,
            token:          profile.token || '',
            token_set_at:   profile.token_set_at || Math.floor(Date.now() / 1000),
            shift_session_id: profile.shift_session_id || null,
            post_code:      profile.post_code || null,
            on_duty:        profile.on_duty === true
        };
        _write(v);
    }

    function getProfile(userId) {
        if (userId === null || userId === undefined) return null;
        return _read()[String(userId)] || null;
    }

    function getAllProfiles() {
        var v = _read();
        var list = [];
        for (var k in v) {
            if (v.hasOwnProperty(k)) list.push(v[k]);
        }
        return list;
    }

    function updateProfile(userId, patch) {
        var p = getProfile(userId);
        if (!p) return null;
        for (var k in patch) {
            if (patch.hasOwnProperty(k)) p[k] = patch[k];
        }
        addProfile(p);
        return p;
    }

    function removeProfile(userId) {
        if (userId === null || userId === undefined) return;
        var v = _read();
        delete v[String(userId)];
        _write(v);
        if (getActiveId() === String(userId)) setActiveId(null);
    }

    function setActiveId(userId) {
        if (userId === null || userId === undefined) {
            localStorage.removeItem(ACTIVE_KEY);
        } else {
            localStorage.setItem(ACTIVE_KEY, String(userId));
        }
    }

    function getActiveId() {
        return localStorage.getItem(ACTIVE_KEY);
    }

    function getActiveProfile() {
        var id = getActiveId();
        return id ? getProfile(id) : null;
    }

    function clearAll() {
        localStorage.removeItem(STORAGE_KEY);
        localStorage.removeItem(ACTIVE_KEY);
    }

    return {
        addProfile:       addProfile,
        getProfile:       getProfile,
        getAllProfiles:    getAllProfiles,
        updateProfile:    updateProfile,
        removeProfile:    removeProfile,
        setActiveId:      setActiveId,
        getActiveId:      getActiveId,
        getActiveProfile: getActiveProfile,
        clearAll:         clearAll
    };

})();
