/**
 * ============================================================
 * REEVES BELT APP - GUARD SHIFT MODULE
 * Start/end shift + GPS pings
 * ============================================================
 */

var RBGuardShift = (function() {

    var gpsInterval = null;
    var timerInterval = null;
    var pingCount = 0;

    function init() {
        if (!RBAuth.requireLogin()) return;

        if (RBShift.isActive()) {
            // Redirect to shift screen if already on shift
            window.location.href = 'guard-shift.html';
            return;
        }

        var user = RBAuth.getCurrentUser();
        if (!user) { window.location.href = 'login.html'; return; }

        if (user.role !== 'guard') {
            window.location.href = 'dashboard.html';
            return;
        }

        var el = document.getElementById('guardGreeting');
        if (el) el.textContent = 'Welcome, ' + (user.full_name || 'Guard');

        var tenantEl = document.getElementById('guardTenant');
        if (tenantEl) tenantEl.textContent = RBAuth.getTenantName();
    }

    function startShift() {
        if (!confirm('Start your shift?\n\nYour attendance and location will be logged.')) return;

        requestLocationPermission().then(function(granted) {
            if (!granted) {
                showToast('Location permission required. Enable it in Settings.');
                return;
            }

            // Get initial position
            navigator.geolocation.getCurrentPosition(function(pos) {
                var payload = {
                    latitude: pos.coords.latitude,
                    longitude: pos.coords.longitude,
                    device_info: navigator.userAgent.substring(0, 200)
                };

                RBApi.startStaffShift(payload).then(function(res) {
                    RBShift.start('guard', res.tenant_id, res.session_id, Date.now());

                    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);

                    window.location.href = 'guard-shift.html';
                }).catch(function(err) {
                    alert('Failed to start shift: ' + (err.error || 'network error'));
                });
            }, function() {
                // Start anyway without coords
                RBApi.startStaffShift({ device_info: navigator.userAgent.substring(0, 200) })
                    .then(function(res) {
                        RBShift.start('guard', res.tenant_id, res.session_id, Date.now());
                        window.location.href = 'guard-shift.html';
                    })
                    .catch(function(err) {
                        alert('Failed: ' + (err.error || 'network error'));
                    });
            }, { enableHighAccuracy: true, timeout: 10000 });
        });
    }

    function requestLocationPermission() {
        if (typeof RBPermissions !== 'undefined' && RBPermissions.requestLocation) {
            return RBPermissions.requestLocation();
        }
        return new Promise(function(resolve) {
            if (!navigator.geolocation) { resolve(false); return; }
            navigator.geolocation.getCurrentPosition(
                function() { resolve(true); },
                function() { resolve(false); },
                { enableHighAccuracy: true, timeout: 8000 }
            );
        });
    }

    // ============================================================
    // SHIFT SCREEN
    // ============================================================
    function initShiftScreen() {
        if (!RBAuth.requireLogin()) return;

        if (!RBShift.isActive()) {
            window.location.href = 'dashboard.html';
            return;
        }

        // Tenant name
        var el = document.getElementById('shiftTenant');
        if (el) el.textContent = RBAuth.getTenantName();

        startTimer();
        startGPSPings();
        startBatteryMonitor();
    }

    function startTimer() {
        if (timerInterval) clearInterval(timerInterval);
        updateTimerDisplay();
        timerInterval = setInterval(updateTimerDisplay, 1000);
    }

    function updateTimerDisplay() {
        var el = document.getElementById('shiftTimer');
        if (!el) return;
        el.textContent = RBShift.formatElapsed(RBShift.getElapsedSeconds());
    }

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

            RBApi.sendStaffLocation(payload).then(function() {
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
        }, { enableHighAccuracy: true, timeout: 20000, maximumAge: 0 });
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

        if (pin !== '2244') {
            if (errEl) { errEl.textContent = 'Incorrect PIN'; errEl.style.display = 'block'; }
            if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
            return;
        }

        RBApi.endStaffShift({ reason: 'manual' }).then(function() {
            RBShift.end();
            if (gpsInterval) { clearInterval(gpsInterval); gpsInterval = null; }
            if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
            if (navigator.vibrate) navigator.vibrate(200);
            window.location.href = 'dashboard.html';
        }).catch(function() {
            // Clear locally anyway
            RBShift.end();
            window.location.href = 'dashboard.html';
        });
    }

    // ============================================================
    // LOGOUT OPTIONS (mirrors supervisor)
    // ============================================================
    function openLogoutOptions() {
        var modal = document.getElementById('logoutModal');
        if (modal) modal.classList.add('show');
    }

    function closeLogoutOptions() {
        var modal = document.getElementById('logoutModal');
        if (modal) modal.classList.remove('show');
    }

    function logoutKeepShift() {
        if (!confirm('Switch user? The shift continues running.')) return;
        RBAuth.clearSession();
        if (gpsInterval) { clearInterval(gpsInterval); gpsInterval = null; }
        if (timerInterval) { clearInterval(timerInterval); timerInterval = null; }
        window.location.href = 'login.html';
    }

    function logoutEndShift() {
        if (!confirm('End shift and logout?')) return;
        RBApi.endStaffShift({ reason: 'logout' }).catch(function() {});
        RBShift.end();
        RBApi.logout().then(function() {}).catch(function() {}).then(function() {
            RBAuth.clearSession();
            window.location.href = 'login.html';
        });
    }

    function formatNow() {
        var d = new Date();
        return String(d.getHours()).padStart(2, '0') + ':' +
               String(d.getMinutes()).padStart(2, '0') + ':' +
               String(d.getSeconds()).padStart(2, '0');
    }

    function showToast(msg) {
        if (typeof RBApp !== 'undefined' && RBApp.showToast) RBApp.showToast(msg, 'warning');
        else alert(msg);
    }

    return {
        init: init,
        startShift: startShift,
        initShiftScreen: initShiftScreen,
        requestEndShift: requestEndShift,
        cancelEndShift: cancelEndShift,
        confirmEndShift: confirmEndShift,
        openLogoutOptions: openLogoutOptions,
        closeLogoutOptions: closeLogoutOptions,
        logoutKeepShift: logoutKeepShift,
        logoutEndShift: logoutEndShift
    };
})();
