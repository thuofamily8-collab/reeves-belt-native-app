/**
 * ============================================================
 * REEVES BELT APP - SUPERVISOR ROLL CALL MODULE
 * ============================================================
 */

var RBRollCall = (function() {

    var currentLat = null;
    var currentLng = null;
    var guards = [];
    var selectedGuard = null;
    var pendingOverrideReason = '';
    var selfieStream = null;
    var capturedBlob = null;

    // ============================================================
    // INIT
    // ============================================================
    function init() {
        if (!RBAuth.requireLogin()) return;
        if (RBAuth.getRole() !== 'supervisor') {
            window.location.href = 'supervisor.html';
            return;
        }

        var user = RBAuth.getCurrentUser();
        document.getElementById('rcTenant').textContent = RBAuth.getTenantName() || 'Tenant';

        // Request GPS
        acquireGPS().then(function(ok) {
            if (!ok) {
                alert('GPS permission is required for Roll Call. Please enable location access in phone settings.');
                return;
            }
            refresh();
        });
    }

    function acquireGPS() {
        return new Promise(function(resolve) {
            if (!navigator.geolocation) { resolve(false); return; }
            navigator.geolocation.getCurrentPosition(
                function(pos) {
                    currentLat = pos.coords.latitude;
                    currentLng = pos.coords.longitude;
                    document.getElementById('rcCoords').textContent =
                        currentLat.toFixed(5) + ', ' + currentLng.toFixed(5);
                    resolve(true);
                },
                function(err) {
                    document.getElementById('rcCoords').textContent = 'Denied';
                    resolve(false);
                },
                { enableHighAccuracy: true, timeout: 15000, maximumAge: 0 }
            );
        });
    }

    // ============================================================
    // REFRESH
    // ============================================================
    function refresh() {
        var btn = document.getElementById('rcRefreshBtn');
        if (btn) btn.disabled = true;
        showLoading('Fetching guards...');

        acquireGPS().then(function(ok) {
            if (!ok) {
                hideLoading();
                if (btn) btn.disabled = false;
                return;
            }

            RBApi.getNearbyGuards(currentLat, currentLng).then(function(res) {
                hideLoading();
                if (btn) btn.disabled = false;
                guards = res.guards || [];
                renderGuards();
            }).catch(function(err) {
                hideLoading();
                if (btn) btn.disabled = false;
                showToast('Failed to load guards: ' + (err.error || 'network'));
            });
        });
    }

    function renderGuards() {
        var box = document.getElementById('guardsContainer');
        if (!guards.length) {
            box.innerHTML = '<div class="rc-empty">No guards found</div>';
            return;
        }

        var html = '';
        guards.forEach(function(g, idx) {
            var cardClass = 'guard-card';
            if (g.on_duty) cardClass += ' on-duty';
            if (g.distance_m !== null && g.distance_m <= 20) cardClass += ' nearby';

            var dotClass = g.on_duty ? 'guard-status-dot active' : 'guard-status-dot';
            var dutyText = g.on_duty ? 'On duty' : 'Off duty';
            var pingText = '';
            if (g.ping_age_seconds !== null) {
                pingText = ' · ' + formatAge(g.ping_age_seconds);
            } else {
                pingText = ' · no location';
            }
            var distText = g.distance_m !== null
                ? g.distance_m.toFixed(1) + ' m away'
                : 'distance unknown';

            html += '<div class="' + cardClass + '">' +
                '<div class="guard-info">' +
                    '<div class="guard-name"><span class="' + dotClass + '"></span>' + escapeHtml(g.full_name) + '</div>' +
                    '<div class="guard-meta">' + dutyText + pingText + '</div>' +
                    '<div class="guard-distance">📍 ' + distText + '</div>' +
                '</div>' +
                '<button class="btn-call" onclick="RBRollCall.startCall(' + idx + ')">CALL ROLL</button>' +
            '</div>';
        });
        box.innerHTML = html;
    }

    function formatAge(sec) {
        if (sec < 60) return 'just now';
        if (sec < 3600) return Math.floor(sec / 60) + 'm ago';
        if (sec < 86400) return Math.floor(sec / 3600) + 'h ago';
        return Math.floor(sec / 86400) + 'd ago';
    }

    // ============================================================
    // START ROLL CALL FLOW
    // ============================================================
    function startCall(idx) {
        selectedGuard = guards[idx];
        pendingOverrideReason = '';

        if (!selectedGuard) return;

        // Check GPS proximity
        var distance = selectedGuard.distance_m;
        var onDuty = selectedGuard.on_duty;
        var pingAge = selectedGuard.ping_age_seconds;

        var warnings = [];

        if (distance === null) {
            warnings.push('Guard has no location ping — cannot verify distance.');
        } else if (distance > 20) {
            warnings.push('Guard is ' + distance.toFixed(1) + 'm away (max 20m).');
        }

        if (!onDuty) {
            warnings.push('Guard is not on duty (no active shift).');
        }

        if (pingAge !== null && pingAge > 600) {
            warnings.push('Guard\'s last location ping is ' + Math.floor(pingAge / 60) + ' minutes old.');
        }

        if (warnings.length > 0) {
            showConfirm(
                '⚠️ Warnings',
                warnings.join('\n\n') + '\n\nProceed anyway? A reason will be required.',
                true
            );
        } else {
            openSelfie();
        }
    }

    // ============================================================
    // CONFIRM MODAL
    // ============================================================
    function showConfirm(title, message, requireReason) {
        document.getElementById('confirmTitle').textContent = title;
        document.getElementById('confirmMessage').textContent = message;
        document.getElementById('overrideField').style.display = requireReason ? 'block' : 'none';
        document.getElementById('overrideReason').value = '';
        document.getElementById('confirmBtn').textContent = requireReason ? 'Override & Continue' : 'Continue';
        document.getElementById('confirmModal').classList.add('show');
    }

    function closeConfirm() {
        document.getElementById('confirmModal').classList.remove('show');
    }

    function confirmProceed() {
        var reasonEl = document.getElementById('overrideReason');
        if (reasonEl && reasonEl.offsetParent !== null) {
            var reason = reasonEl.value.trim();
            if (!reason) {
                alert('Please enter a reason for the override.');
                return;
            }
            pendingOverrideReason = reason;
        }
        closeConfirm();
        openSelfie();
    }

    // ============================================================
    // SELFIE
    // ============================================================
    function openSelfie() {
        document.getElementById('selfieGuardName').textContent = selectedGuard.full_name;
        document.getElementById('selfieModal').classList.add('show');
        document.getElementById('selfieActions').style.display = 'flex';
        document.getElementById('selfieConfirmActions').style.display = 'none';
        document.getElementById('selfiePreview').style.display = 'none';
        document.getElementById('selfieVideo').style.display = 'block';

        // Start front camera
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            alert('Camera not supported on this device');
            closeSelfie();
            return;
        }

        navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
            audio: false
        }).then(function(stream) {
            selfieStream = stream;
            var v = document.getElementById('selfieVideo');
            v.srcObject = stream;
            v.play().catch(function() {});
        }).catch(function(err) {
            alert('Cannot access front camera: ' + err.message);
            closeSelfie();
        });
    }

    function captureSelfie() {
        var video = document.getElementById('selfieVideo');
        var canvas = document.createElement('canvas');
        canvas.width = video.videoWidth || 720;
        canvas.height = video.videoHeight || 720;
        canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);

        canvas.toBlob(function(blob) {
            capturedBlob = blob;
            var preview = document.getElementById('selfiePreview');
            preview.src = URL.createObjectURL(blob);
            preview.style.display = 'block';
            video.style.display = 'none';
            document.getElementById('selfieActions').style.display = 'none';
            document.getElementById('selfieConfirmActions').style.display = 'flex';

            if (selfieStream) {
                selfieStream.getTracks().forEach(function(t) { t.stop(); });
                selfieStream = null;
            }
        }, 'image/jpeg', 0.85);
    }

    function retakeSelfie() {
        capturedBlob = null;
        document.getElementById('selfiePreview').style.display = 'none';
        document.getElementById('selfieVideo').style.display = 'block';
        document.getElementById('selfieActions').style.display = 'flex';
        document.getElementById('selfieConfirmActions').style.display = 'none';
        openSelfieStreamAgain();
    }

    function openSelfieStreamAgain() {
        navigator.mediaDevices.getUserMedia({
            video: { facingMode: 'user', width: { ideal: 720 }, height: { ideal: 720 } },
            audio: false
        }).then(function(stream) {
            selfieStream = stream;
            var v = document.getElementById('selfieVideo');
            v.srcObject = stream;
            v.play().catch(function() {});
        }).catch(function(err) {
            alert('Cannot access camera: ' + err.message);
        });
    }

    function cancelSelfie() {
        closeSelfie();
    }

    function closeSelfie() {
        if (selfieStream) {
            selfieStream.getTracks().forEach(function(t) { t.stop(); });
            selfieStream = null;
        }
        document.getElementById('selfieModal').classList.remove('show');
        capturedBlob = null;
        selectedGuard = null;
        pendingOverrideReason = '';
    }

    // ============================================================
    // SUBMIT
    // ============================================================
    function submitRollCall() {
        if (!selectedGuard || !capturedBlob) return;

        showLoading('Submitting roll call...');

        // Use multipart/form-data to bypass WAF
        var fd = new FormData();
        fd.append('guard_id', selectedGuard.id);
        fd.append('latitude', currentLat);
        fd.append('longitude', currentLng);
        fd.append('selfie', capturedBlob, 'selfie.jpg');
        if (pendingOverrideReason) {
            fd.append('override_reason', pendingOverrideReason);
        }

        var token = RBApi.getToken();
        var xhr = new XMLHttpRequest();
        xhr.open('POST', RBApi.getBaseUrl() + '/supervisor/roll-call.php', true);
        xhr.setRequestHeader('Authorization', 'Bearer ' + token);
        xhr.setRequestHeader('X-Auth-Token', token);
        xhr.timeout = 30000;

        xhr.onreadystatechange = function() {
            if (xhr.readyState !== 4) return;
            hideLoading();

            if (xhr.status >= 200 && xhr.status < 300) {
                try {
                    var res = JSON.parse(xhr.responseText);
                    if (res.success) {
                        if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
                        alert('✅ Roll Call Confirmed\n\n' + res.guard_name +
                              '\nDistance: ' + (res.distance_m || 'unknown') + 'm' +
                              '\nTime: ' + new Date().toLocaleTimeString());
                        closeSelfie();
                        refresh();
                    } else {
                        alert('Failed: ' + (res.error || 'unknown'));
                    }
                } catch (e) {
                    alert('Invalid response: ' + xhr.responseText.substring(0, 200));
                }
            } else {
                alert('HTTP ' + xhr.status + ': ' + xhr.responseText.substring(0, 200));
            }
        };

        xhr.onerror = function() { hideLoading(); alert('Network error'); };
        xhr.ontimeout = function() { hideLoading(); alert('Request timed out'); };
        xhr.send(fd);
    }

    // ============================================================
    // HELPERS
    // ============================================================
    function escapeHtml(s) {
        if (!s) return '';
        var d = document.createElement('div');
        d.textContent = s;
        return d.innerHTML;
    }

    function showToast(msg) {
        if (typeof RBApp !== 'undefined' && RBApp.showToast) RBApp.showToast(msg, 'error');
        else alert(msg);
    }

    function showLoading(msg) {
        document.getElementById('loadingText').textContent = msg;
        document.getElementById('loadingOverlay').classList.add('show');
    }

    function hideLoading() {
        document.getElementById('loadingOverlay').classList.remove('show');
    }

    return {
        init: init,
        refresh: refresh,
        startCall: startCall,
        closeConfirm: closeConfirm,
        confirmProceed: confirmProceed,
        captureSelfie: captureSelfie,
        retakeSelfie: retakeSelfie,
        cancelSelfie: cancelSelfie,
        submitRollCall: submitRollCall
    };
})();
