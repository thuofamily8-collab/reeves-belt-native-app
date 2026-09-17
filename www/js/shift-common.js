/**
 * ============================================================
 * REEVES BELT APP - SHIFT COMMON HELPERS
 * Used by guards and supervisors for shared shift functionality
 * ============================================================
 */

var RBShift = (function() {

    var SHIFT_KEY = 'rb_shift_active';
    var SHIFT_START_KEY = 'rb_shift_started';
    var SHIFT_TENANT_KEY = 'rb_shift_tenant_id';
    var SHIFT_ROLE_KEY = 'rb_shift_role';
    var SHIFT_SESSION_ID = 'rb_shift_session_id';
    var EXIT_PIN = '2244';

    // ============================================================
    // STATE
    // ============================================================
    function isActive() {
        return localStorage.getItem(SHIFT_KEY) === '1';
    }

    function getStartedAt() {
        var t = localStorage.getItem(SHIFT_START_KEY);
        return t ? parseInt(t, 10) : 0;
    }

    function getRole() {
        return localStorage.getItem(SHIFT_ROLE_KEY) || '';
    }

    function getTenantId() {
        return localStorage.getItem(SHIFT_TENANT_KEY) || '';
    }

    function getSessionId() {
        var s = localStorage.getItem(SHIFT_SESSION_ID);
        return s ? parseInt(s, 10) : 0;
    }

    function getElapsedSeconds() {
        if (!isActive()) return 0;
        var start = getStartedAt();
        if (!start) return 0;
        return Math.floor((Date.now() - start) / 1000);
    }

    function formatElapsed(sec) {
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        var s = sec % 60;
        return pad(h) + ':' + pad(m) + ':' + pad(s);
    }

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    // ============================================================
    // START / END
    // ============================================================
    function start(role, tenantId, sessionId, startedAt) {
        localStorage.setItem(SHIFT_KEY, '1');
        localStorage.setItem(SHIFT_START_KEY, String(startedAt || Date.now()));
        localStorage.setItem(SHIFT_TENANT_KEY, String(tenantId || ''));
        localStorage.setItem(SHIFT_ROLE_KEY, role || '');
        localStorage.setItem(SHIFT_SESSION_ID, String(sessionId || ''));
    }

    function end() {
        localStorage.removeItem(SHIFT_KEY);
        localStorage.removeItem(SHIFT_START_KEY);
        localStorage.removeItem(SHIFT_TENANT_KEY);
        localStorage.removeItem(SHIFT_ROLE_KEY);
        localStorage.removeItem(SHIFT_SESSION_ID);
    }

    // ============================================================
    // SHIFT SCREEN URL
    // ============================================================
    function getShiftScreenUrl() {
        var role = getRole();
        if (role === 'supervisor') return 'supervisor-shift.html';
        if (role === 'guard') return 'guard-shift.html';
        if (typeof RBAuth !== 'undefined' && RBAuth.isSupervisor && RBAuth.isSupervisor()) {
            return 'supervisor-shift.html';
        }
        return 'guard-shift.html';
    }

    // ============================================================
    // BANNER — inject on any page with <div id="rbDutyBanner"></div>
    // ============================================================
    var bannerInterval = null;

    function injectBanner() {
        var host = document.getElementById('rbDutyBanner');
        if (!host) return;
        if (!isActive()) {
            host.style.display = 'none';
            return;
        }

        host.style.display = 'block';
        host.innerHTML =
            '<div style="display:flex;align-items:center;justify-content:space-between;' +
            'background:linear-gradient(135deg,#0a192f,#1a2f4a);border-left:4px solid #10b981;' +
            'padding:10px 14px;border-radius:10px;margin:8px 12px;box-shadow:0 4px 12px rgba(0,0,0,0.4);">' +
                '<div style="display:flex;align-items:center;gap:10px;">' +
                    '<span style="width:10px;height:10px;background:#10b981;border-radius:50%;' +
                    'box-shadow:0 0 8px #10b981;display:inline-block;"></span>' +
                    '<div>' +
                        '<div style="color:#10b981;font-size:10px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;">ON DUTY</div>' +
                        '<div id="rbDutyTimer" style="color:#d4af37;font-family:\'Courier New\',monospace;font-size:16px;font-weight:700;">00:00:00</div>' +
                    '</div>' +
                '</div>' +
                '<div style="display:flex;gap:8px;">' +
                    '<button onclick="RBShift.gotoShiftScreen()" style="background:#d4af37;color:#0a0e1a;border:none;padding:8px 14px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">VIEW</button>' +
                    '<button onclick="RBShift.requestEndFromBanner()" style="background:#ef4444;color:#fff;border:none;padding:8px 12px;border-radius:8px;font-size:11px;font-weight:700;cursor:pointer;">END</button>' +
                '</div>' +
            '</div>';

        if (bannerInterval) clearInterval(bannerInterval);
        bannerInterval = setInterval(updateBannerTimer, 1000);
        updateBannerTimer();
    }

    function updateBannerTimer() {
        var el = document.getElementById('rbDutyTimer');
        if (!el) return;
        if (!isActive()) { el.textContent = '00:00:00'; return; }
        el.textContent = formatElapsed(getElapsedSeconds());
    }

    function gotoShiftScreen() {
        window.location.href = getShiftScreenUrl();
    }

    function requestEndFromBanner() {
        var pin = prompt('Enter PIN to end shift:');
        if (pin === null) return;
        if (pin.trim() !== EXIT_PIN) {
            alert('Incorrect PIN');
            return;
        }
        confirmEndShift();
    }

    function confirmEndShift() {
        if (typeof RBApi !== 'undefined' && RBApi.endStaffShift) {
            RBApi.endStaffShift({ reason: 'banner-end' }).catch(function() {});
        }
        end();
        if (navigator.vibrate) navigator.vibrate(200);
        window.location.href = (typeof RBAuth !== 'undefined' && RBAuth.isSupervisor && RBAuth.isSupervisor())
            ? 'supervisor.html' : 'dashboard.html';
    }

    return {
        isActive: isActive,
        getStartedAt: getStartedAt,
        getRole: getRole,
        getTenantId: getTenantId,
        getSessionId: getSessionId,
        getElapsedSeconds: getElapsedSeconds,
        formatElapsed: formatElapsed,
        start: start,
        end: end,
        getShiftScreenUrl: getShiftScreenUrl,
        injectBanner: injectBanner,
        requestEndFromBanner: requestEndFromBanner,
        confirmEndShift: confirmEndShift
    };
})();
