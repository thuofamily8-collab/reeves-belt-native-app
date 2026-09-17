/**
 * ============================================================
 * REEVES BELT APP - GUARD SHIFT MODULE
 * Start/end shift + GPS pings + roll call polling
 * ============================================================
 */

var RBGuardShift = (function() {

    var gpsInterval = null;
    var timerInterval = null;
    var rollCallInterval = null;
    var pingCount = 0;
    var lastSeenRollCallId = 0;

    function init() {
        if (!RBAuth.requireLogin()) return;

        if (RBShift.isActive()) {
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
                alert('Location permission required. Enable it in Settings.');
                return;
            }

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

        var el = document.getElementById('shiftTenant');
        if (el) el.textContent = RBAuth.getTenantName();

        startTimer();
        startGPSPings();
        startBatteryMonitor();
        startRollCallPolling();
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
    // ROLL CALL POLLING
    // ============================================================
    function startRollCallPolling() {
        setTimeout(checkPendingRollCalls, 5000);
        if (rollCallInterval) clearInterval(rollCallInterval);
        rollCallInterval = setInterval(checkPendingRollCalls, 30000);
    }

    function checkPendingRollCalls() {
        RBApi.getPendingRollCalls().then(function(res) {
            if (res.count > 0) {
                var rc = res.roll_calls[0];
                if (rc.id !== lastSeenRollCallId) {
                    lastSeenRollCallId = rc.id;
                    showRollCallModal(rc);
                }
            }
        }).catch(function(err) {
            console.log('Roll call poll failed:', err);
        });
    }

    function showRollCallModal(rc) {
        if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);

        var overlay = document.getElementById('rollCallOverlay');
        if (!overlay) {
            overlay = document.createElement('div');
            overlay.id = 'rollCallOverlay';
            overlay.style.cssText = 'position:fixed;inset:0;background:rgba(0,0,0,0.9);display:flex;align-items:center;justify-content:center;z-index:9999;padding:20px;';
            document.body.appendChild(overlay);
        }

        overlay.innerHTML =
            '<div style="background:#14192e;border-radius:16px;padding:24px;width:100%;max-width:340px;border:2px solid #d4af37;text-align:center;">' +
                '<div style="font-size:48px;margin-bottom:12px;">📢</div>' +
                '<div style="color:#d4af37;font-size:16px;font-weight:700;margin-bottom:12px;">ROLL CALL</div>' +
                '<div style="color:#fff;font-size:15px;font-weight:600;margin-bottom:6px;">' + escapeHtml(rc.supervisor_name) + '</div>' +
                '<div style="color:#8892b0;font-size:12px;margin-bottom:4px;">Called at ' + formatTime(rc.rolled_at) + '</div>' +
                '<div style="color:#8892b0;font-size:12px;margin-bottom:20px;">' + (rc.distance_m ? rc.distance_m + ' m away' : '') + '</div>' +
                '<button onclick="RBGuardShift.ackRollCall(' + rc.id + ')" style="width:100%;padding:14px;background:linear-gradient(135deg,#10b981,#059669);color:#fff;border:none;border-radius:10px;font-size:14px;font-weight:700;text-transform:uppercase;letter-spacing:1px;cursor:pointer;box-shadow:0 4px 0 #047857;">✓ ACKNOWLEDGE</button>' +
            '</div>';

        overlay.style.display = 'flex';
    }

    function ackRollCall(rollCallId) {
        RBApi.acknowledgeRollCall(rollCallId).then(function() {
            if (navigator.vibrate) navigator.vibrate(100);
            var overlay = document.getElementById('rollCallOverlay');
            if (overlay) overlay.style.display = 'none';
        }).catch(function(err) {
            alert('Failed to acknowledge: ' + (err.error || 'network error'));
        });
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
            if (rollCallInterval) { clearInterval(rollCallInterval); rollCallInterval = null; }
            if (navigator.vibrate) navigator.vibrate(200);
            window.location.href = 'dashboard.html';
        }).catch(function() {
            RBShift.end();
            window.location.href = 'dashboard.html';
        });
    }

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
        if (rollCallInterval) { clearInterval(rollCallInterval); rollCallInterval = null; }
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

    function formatTime(isoStr) {
        try {
            var d = new Date(isoStr.replace(' ', 'T'));
            return String(d.getHours()).padStart(2, '0') + ':' +
                   String(d.getMinutes()).padStart(2, '0') + ':' +
                   String(d.getSeconds()).padStart(2, '0');
        } catch (e) { return isoStr; }
    }

    function escapeHtml(s) {
        if (!s) return '';
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
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
        logoutEndShift: logoutEndShift,
        ackRollCall: ackRollCall
    };
})();
