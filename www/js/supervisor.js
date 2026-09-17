/**
 * ============================================================
 * REEVES BELT APP - SUPERVISOR MODULE
 * Shift management + GPS tracking + tenant switching
 * ============================================================
 */

var RBSupervisor = (function() {

    var SHIFT_KEY = 'rb_shift_active';
    var SHIFT_START_KEY = 'rb_shift_started';
    var SHIFT_TENANT_KEY = 'rb_shift_tenant_id';
    var SUPER_TENANT_KEY = 'rb_supervisor_tenant_id';
    var EXIT_PIN = '2244';

    var gpsInterval = null;
    var timerInterval = null;
    var pingCount = 0;
    var lastLocation = null;

    // ============================================================
    // TENANT MANAGEMENT
    // ============================================================
    function getSupervisorTenants() {
        try {
            return JSON.parse(localStorage.getItem('rb_supervisor_tenants') || '[]');
        } catch (e) {
            return [];
        }
    }

    function getCurrentTenantId() {
        return localStorage.getItem(SUPER_TENANT_KEY) || localStorage.getItem('rb_tenant_id') || '';
    }

    function changeTenant(tenantId) {
        if (!tenantId) return;
        localStorage.setItem(SUPER_TENANT_KEY, tenantId);
        window.location.reload();
    }

    // ============================================================
    // INIT — DASHBOARD
    // ============================================================
    function init() {
        if (!RBAuth.requireLogin()) return;

        var user = RBAuth.getCurrentUser();
        if (!user) { window.location.href = 'login.html'; return; }

        if (user.role !== 'supervisor') {
            window.location.href = 'dashboard.html';
            return;
        }

        document.getElementById('supGreeting').textContent =
            'Welcome back, ' + (user.full_name || 'Supervisor');

        loadSupervisorTenants();
        updateShiftButton();

        setInterval(loadDashboardData, 30000);
        setTimeout(loadDashboardData, 500);
    }

    function loadSupervisorTenants() {
        RBApi.getSupervisorDashboard().then(function(res) {
            var tenants = (res && res.tenants) ? res.tenants : [];
            localStorage.setItem('rb_supervisor_tenants', JSON.stringify(tenants));

            var select = document.getElementById('tenantSwitcher');
            if (!select) return;

            var currentId = getCurrentTenantId();
            if (!currentId && tenants.length > 0) {
                currentId = tenants[0].id;
                localStorage.setItem(SUPER_TENANT_KEY, currentId);
            }

            select.innerHTML = '';
            tenants.forEach(function(t) {
                var opt = document.createElement('option');
                opt.value = t.id;
                opt.textContent = t.site_name;
                if (String(t.id) === String(currentId)) opt.selected = true;
                select.appendChild(opt);
            });
        }).catch(function(err) {
            console.log('Failed to load tenants:', err);
        });
    }

    function loadDashboardData() {
        var tenantId = getCurrentTenantId();

        RBApi.getSupervisorDashboard(tenantId).then(function(res) {
            renderGuards(res.guards || []);
            renderPatrols(res.patrols_12h || []);
            updateStats(res.counts || {});
        }).catch(function(err) {
            console.log('Dashboard load failed:', err);
            var guardsList = document.getElementById('guardsList');
            if (guardsList) {
                guardsList.innerHTML = '<div class="empty-state-sup">Failed to load. Check connection.</div>';
            }
        });
    }

    function renderGuards(guards) {
        var list = document.getElementById('guardsList');
        if (!list) return;

        if (guards.length === 0) {
            list.innerHTML = '<div class="empty-state-sup">No guards at this tenant</div>';
            return;
        }

        var html = '';
        guards.forEach(function(g) {
            var last = g.last_patrol_12h;
            var statusClass = 'offline';
            var statusText = 'Offline';
            if (last) {
                var minutes = (Date.now() - new Date(last).getTime()) / 60000;
                if (minutes < 60) { statusClass = 'active'; statusText = 'Active'; }
                else { statusClass = 'idle'; statusText = 'Idle'; }
            }
            html +=
                '<div class="guard-item ' + statusClass + '">' +
                    '<div>' +
                        '<div class="guard-info-name">' + escapeHtml(g.full_name) + '</div>' +
                        '<div class="guard-info-sub">' + (last ? relTime(last) : 'No activity') + '</div>' +
                    '</div>' +
                    '<div class="guard-status-badge ' + statusClass + '">' + statusText + '</div>' +
                '</div>';
        });
        list.innerHTML = html;
    }

    function renderPatrols(patrols) {
        var list = document.getElementById('patrolsList');
        if (!list) return;

        if (patrols.length === 0) {
            list.innerHTML = '<div class="empty-state-sup">No patrol scans in last 12h</div>';
            return;
        }

        var html = '';
        patrols.slice(0, 20).forEach(function(p) {
            html +=
                '<div class="patrol-item">' +
                    '<div class="patrol-checkpoint">' + escapeHtml(p.checkpoint_name) + '</div>' +
                    '<div class="patrol-meta">' + escapeHtml(p.guard_name || '—') + ' • ' + relTime(p.scanned_at) + '</div>' +
                '</div>';
        });
        list.innerHTML = html;
    }

    function updateStats(counts) {
        var el1 = document.getElementById('statGuards');
        var el2 = document.getElementById('statScans');
        if (el1) el1.textContent = counts.guards || 0;
        if (el2) el2.textContent = counts.patrols_12h || 0;
    }

    // ============================================================
    // SHIFT MANAGEMENT
    // ============================================================
    function isShiftActive() {
        return localStorage.getItem(SHIFT_KEY) === '1';
    }

    function getShiftStartedAt() {
        var t = localStorage.getItem(SHIFT_START_KEY);
        return t ? parseInt(t, 10) : 0;
    }

    function updateShiftButton() {
        var btn = document.getElementById('shiftToggleBtn');
        if (!btn) return;
        if (isShiftActive()) {
            btn.textContent = '👁️ VIEW ACTIVE SHIFT';
            btn.classList.add('on-shift');
        } else {
            btn.textContent = '🚀 START SHIFT';
            btn.classList.remove('on-shift');
        }
    }

    function toggleShift() {
        console.log('[Supervisor] toggleShift tapped. Active:', isShiftActive());
        try {
            if (isShiftActive()) {
                window.location.href = 'supervisor-shift.html';
            } else {
                startShift();
            }
        } catch (e) {
            console.error('[Supervisor] toggleShift error:', e);
            alert('Error: ' + e.message);
        }
    }

    function startShift() {
        var permissionPromise;

        if (typeof RBPermissions !== 'undefined' && typeof RBPermissions.requestLocation === 'function') {
            console.log('[Supervisor] Using RBPermissions helper');
            permissionPromise = RBPermissions.requestLocation();
        } else {
            console.log('[Supervisor] RBPermissions not loaded — falling back to navigator.geolocation');
            permissionPromise = new Promise(function(resolve) {
                if (!navigator.geolocation) {
                    resolve(false);
                    return;
                }
                navigator.geolocation.getCurrentPosition(
                    function() { resolve(true); },
                    function() { resolve(false); },
                    { enableHighAccuracy: true, timeout: 10000 }
                );
            });
        }

        permissionPromise.then(function(granted) {
            if (!granted) {
                alert('GPS permission required to start a shift. Enable location access in phone settings.');
                return;
            }

            var now = Date.now();
            localStorage.setItem(SHIFT_KEY, '1');
            localStorage.setItem(SHIFT_START_KEY, String(now));
            localStorage.setItem(SHIFT_TENANT_KEY, getCurrentTenantId());

            RBApi.startSupervisorShift().catch(function(err) {
                console.log('Server shift-start log failed:', err);
            });

            if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

            window.location.href = 'supervisor-shift.html';
        }).catch(function(err) {
            console.error('[Supervisor] Permission error:', err);
            alert('Could not start shift: ' + err.message);
        });
    }

    // ============================================================
    // SHIFT SCREEN
    // ============================================================
    function initShiftScreen() {
        if (!RBAuth.requireLogin()) return;

        if (!isShiftActive()) {
            window.location.href = 'supervisor.html';
            return;
        }

        // Load tenant name — try cache first, then fetch
        resolveTenantName();

        startTimer();
        startGPSPings();
        startBatteryMonitor();
    }

    function resolveTenantName() {
        var activeTenantId = localStorage.getItem(SHIFT_TENANT_KEY) || getCurrentTenantId();

        // Try local cache
        var tenants = getSupervisorTenants();
        var tenantName = null;
        tenants.forEach(function(t) {
            if (String(t.id) === String(activeTenantId)) tenantName = t.site_name;
        });

        if (tenantName) {
            setTenantName(tenantName);
            return;
        }

        // Fetch from server
        RBApi.getSupervisorDashboard(activeTenantId).then(function(res) {
            var fetchedTenants = (res && res.tenants) ? res.tenants : [];
            localStorage.setItem('rb_supervisor_tenants', JSON.stringify(fetchedTenants));

            var found = null;
            fetchedTenants.forEach(function(t) {
                if (String(t.id) === String(activeTenantId)) found = t.site_name;
            });

            setTenantName(found || 'Unknown Tenant');
        }).catch(function(err) {
            console.log('Tenant fetch failed:', err);
            setTenantName('Unknown Tenant');
        });
    }

    function setTenantName(name) {
        var el = document.getElementById('shiftTenant');
        if (el) el.textContent = name;
    }

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        updateTimerDisplay();
        timerInterval = setInterval(updateTimerDisplay, 1000);
    }

    function updateTimerDisplay() {
        var el = document.getElementById('shiftTimer');
        if (!el) return;
        var start = getShiftStartedAt();
        if (!start) { el.textContent = '00:00:00'; return; }

        var elapsed = Math.floor((Date.now() - start) / 1000);
        var h = Math.floor(elapsed / 3600);
        var m = Math.floor((elapsed % 3600) / 60);
        var s = elapsed % 60;
        el.textContent = pad(h) + ':' + pad(m) + ':' + pad(s);
    }

    function pad(n) { return n < 10 ? '0' + n : String(n); }

    function startGPSPings() {
        sendLocationPing();
        if (gpsInterval) clearInterval(gpsInterval);
        gpsInterval = setInterval(sendLocationPing, 60000);
    }

    function sendLocationPing() {
        if (!navigator.geolocation) {
            setGPSStatus('red', '● Unavailable');
            return;
        }

        navigator.geolocation.getCurrentPosition(function(pos) {
            setGPSStatus('green', '● Active');

            var payload = {
                latitude: pos.coords.latitude,
                longitude: pos.coords.longitude,
                accuracy_m: pos.coords.accuracy,
                speed_kmh: pos.coords.speed !== null && pos.coords.speed !== undefined ? pos.coords.speed * 3.6 : null,
                heading_deg: pos.coords.heading,
                battery_pct: getBatteryPct()
            };

            lastLocation = payload;

            RBApi.sendSupervisorLocation(payload).then(function() {
                pingCount++;
                var el = document.getElementById('pingCount');
                if (el) el.textContent = pingCount;
                var lp = document.getElementById('lastPing');
                if (lp) lp.textContent = formatNow();
            }).catch(function(err) {
                console.log('Ping failed:', err);
                setGPSStatus('yellow', '● Offline');
            });
        }, function(err) {
            setGPSStatus('red', '● ' + (err.message || 'Denied'));
        }, {
            enableHighAccuracy: true,
            timeout: 20000,
            maximumAge: 0
        });
    }

    function setGPSStatus(color, text) {
        var el = document.getElementById('gpsStatus');
        if (!el) return;
        el.className = 'shift-info-value ' + (color === 'green' ? 'green' : color === 'yellow' ? 'yellow' : 'red');
        el.textContent = text;
    }

    function getBatteryPct() {
        return parseInt(localStorage.getItem('rb_battery_pct') || '0', 10) || null;
    }

    function startBatteryMonitor() {
        if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Device) {
            Capacitor.Plugins.Device.getBatteryInfo().then(function(info) {
                var pct = Math.round(info.batteryLevel * 100);
                localStorage.setItem('rb_battery_pct', String(pct));
                var el = document.getElementById('batteryLevel');
                if (el) el.textContent = pct + '%';
            }).catch(function() {});
        }
    }

    // ============================================================
    // END SHIFT
    // ============================================================
    function requestEndShift() {
        var modal = document.getElementById('pinModal');
        var input = document.getElementById('pinInput');
        var errEl = document.getElementById('pinError');
        if (modal) modal.classList.add('show');
        if (input) { input.value = ''; input.focus(); }
        if (errEl) errEl.style.display = 'none';
    }

    function cancelEndShift() {
        var modal = document.getElementById('pinModal');
        if (modal) modal.classList.remove('show');
    }

    function confirmEndShift() {
        var input = document.getElementById('pinInput');
        var errEl = document.getElementById('pinError');
        var pin = input ? input.value.trim() : '';

        if (pin !== EXIT_PIN) {
            if (errEl) {
                errEl.textContent = 'Incorrect PIN';
                errEl.style.display = 'block';
            }
            if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
            return;
        }

        endShift();
    }

    function endShift() {
        localStorage.removeItem(SHIFT_KEY);
        localStorage.removeItem(SHIFT_START_KEY);
        localStorage.removeItem(SHIFT_TENANT_KEY);
        if (gpsInterval) { clearInterval(gpsInterval); gpsInterval = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

        RBApi.endSupervisorShift().catch(function() {});

        if (navigator.vibrate) navigator.vibrate(200);

        window.location.href = 'supervisor.html';
    }

    // ============================================================
    // LOGOUT OPTIONS
    // ============================================================
    function openLogoutOptions() {
        var modal = document.getElementById('logoutModal');
        if (modal) modal.classList.add('show');
    }

    function closeLogoutOptions() {
        var modal = document.getElementById('logoutModal');
        if (modal) modal.classList.remove('show');
    }

    /**
     * Ends the current user's session (clears their login token),
     * but keeps the shift active on the device.
     * Use case: supervisor A starts shift → hands phone to supervisor B mid-shift.
     */
    function logoutKeepShift() {
        if (!confirm('Switch user? The active shift will continue running.')) return;

        // Clear only the user session, not the shift
        RBAuth.clearSession();

        // Stop pings temporarily — new user will restart them
        if (gpsInterval) { clearInterval(gpsInterval); gpsInterval = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

        window.location.href = 'login.html';
    }

    /**
     * Ends the shift AND logs out.
     * Use case: end of the day, supervisor goes home.
     */
    function logoutEndShift() {
        if (!confirm('End shift AND logout? You will need to log in again.')) return;

        // Clear the shift entirely
        localStorage.removeItem(SHIFT_KEY);
        localStorage.removeItem(SHIFT_START_KEY);
        localStorage.removeItem(SHIFT_TENANT_KEY);
        localStorage.removeItem(SUPER_TENANT_KEY);

        if (gpsInterval) { clearInterval(gpsInterval); gpsInterval = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }

        // Notify server
        RBApi.endSupervisorShift().catch(function() {});

        // Logout
        RBApi.logout().then(function() {
        }).catch(function() {
        }).then(function() {
            RBAuth.clearSession();
            window.location.href = 'login.html';
        });
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function relTime(dateStr) {
        try {
            var diff = Math.floor((Date.now() - new Date(dateStr).getTime()) / 1000);
            if (diff < 60) return 'just now';
            if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
            if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
            return Math.floor(diff / 86400) + 'd ago';
        } catch (e) { return '—'; }
    }

    function formatNow() {
        var d = new Date();
        return pad(d.getHours()) + ':' + pad(d.getMinutes()) + ':' + pad(d.getSeconds());
    }

    return {
        init: init,
        initShiftScreen: initShiftScreen,
        changeTenant: changeTenant,
        toggleShift: toggleShift,
        requestEndShift: requestEndShift,
        cancelEndShift: cancelEndShift,
        confirmEndShift: confirmEndShift,
        openLogoutOptions: openLogoutOptions,
        closeLogoutOptions: closeLogoutOptions,
        logoutKeepShift: logoutKeepShift,
        logoutEndShift: logoutEndShift
    };
})();
