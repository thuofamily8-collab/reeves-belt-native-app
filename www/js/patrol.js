/**
 * ============================================================
 * REEVES BELT APP - Patrol Module
 * QR scanning, checkpoint tracking, offline sync
 *
 * SPRINT 2 FIX:
 *   - submitPatrolScan() only calls the API when online
 *   - Offline → queue only, no error toast
 * ============================================================
 */

var checkpoints = [];
var scannedCheckpoints = [];
var qrStream = null;
var qrScanInterval = null;
var scanCanvas = document.createElement('canvas');
var scanCanvasContext = scanCanvas.getContext('2d');
var currentGPS = { lat: null, lng: null };
var lastDetectedCode = '';
var lastDetectedAt = 0;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    loadLocalScannedCheckpoints();
    loadCheckpoints();
    requestLocationSilently();
});

function requestLocationSilently() {
    if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Geolocation) {
        Capacitor.Plugins.Geolocation.getCurrentPosition()
            .then(function(pos) {
                currentGPS.lat = pos.coords.latitude;
                currentGPS.lng = pos.coords.longitude;
            })
            .catch(function() {});
    } else if (navigator.geolocation) {
        navigator.geolocation.getCurrentPosition(
            function(pos) {
                currentGPS.lat = pos.coords.latitude;
                currentGPS.lng = pos.coords.longitude;
            },
            function() {},
            { enableHighAccuracy: true, timeout: 8000 }
        );
    }
}

function loadCheckpoints() {
    showLoading('Loading checkpoints...');

    RBApi.getPatrolPoints().then(function(result) {
        hideLoading();
        checkpoints = (result && result.points) ? result.points : [];
        renderCheckpoints();
        renderManualSelect();
        updateProgress();
    }).catch(function(err) {
        hideLoading();
        showToast('Failed to load checkpoints: ' + (err.error || 'network'), 'error');
    });
}

// ============================================================
// LOCAL STORAGE (per day)
// ============================================================
function todayKey() {
    var d = new Date();
    return 'rb_patrol_scanned_' + d.getFullYear() + '-' +
           String(d.getMonth() + 1).padStart(2, '0') + '-' +
           String(d.getDate()).padStart(2, '0');
}

function loadLocalScannedCheckpoints() {
    try {
        var raw = localStorage.getItem(todayKey());
        scannedCheckpoints = raw ? JSON.parse(raw) : [];
    } catch (e) {
        scannedCheckpoints = [];
    }
}

function saveLocalScannedCheckpoints() {
    try {
        localStorage.setItem(todayKey(), JSON.stringify(scannedCheckpoints));
    } catch (e) {}
}

// ============================================================
// RENDER
// ============================================================
function renderCheckpoints() {
    var container = document.getElementById('checkpointsList');
    if (!container) return;

    if (checkpoints.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px;"><p>No checkpoints configured</p></div>';
        return;
    }

    var html = '<div class="checkpoint-list">';
    for (var i = 0; i < checkpoints.length; i++) {
        var cp = checkpoints[i];
        var isScanned = scannedCheckpoints.indexOf(cp.point_name) !== -1;

        html += '<div class="checkpoint-item ' + (isScanned ? 'completed' : '') + '">' +
            '<div class="checkpoint-icon">' + (isScanned ? '✓' : '○') + '</div>' +
            '<div class="checkpoint-info">' +
                '<div class="checkpoint-name">' + escapeHtml(cp.point_name) + '</div>' +
                '<div class="checkpoint-order">Checkpoint #' + (cp.sequence_order || i + 1) + '</div>' +
            '</div>' +
        '</div>';
    }
    html += '</div>';
    container.innerHTML = html;
}

function renderManualSelect() {
    var select = document.getElementById('manualCheckpoint');
    if (!select) return;

    select.innerHTML = '<option value="">-- Select Checkpoint --</option>';

    for (var i = 0; i < checkpoints.length; i++) {
        var cp = checkpoints[i];
        var isScanned = scannedCheckpoints.indexOf(cp.point_name) !== -1;
        var opt = document.createElement('option');
        opt.value = cp.point_name;
        opt.textContent = cp.point_name + (isScanned ? ' ✓ (Done)' : '');
        select.appendChild(opt);
    }
}

function updateProgress() {
    var total = checkpoints.length;
    var scanned = 0;

    for (var i = 0; i < checkpoints.length; i++) {
        if (scannedCheckpoints.indexOf(checkpoints[i].point_name) !== -1) {
            scanned++;
        }
    }

    var percent = total > 0 ? Math.round((scanned / total) * 100) : 0;

    var percentEl = document.getElementById('progressPercent');
    var scannedEl = document.getElementById('scannedCount');
    var totalEl = document.getElementById('totalCount');
    var remainingEl = document.getElementById('remainingCount');

    if (percentEl) percentEl.textContent = percent + '%';
    if (scannedEl) scannedEl.textContent = scanned;
    if (totalEl) totalEl.textContent = total;
    if (remainingEl) remainingEl.textContent = total - scanned;
}

// ============================================================
// SHIFT CHECK HELPER
// ============================================================
function requireShiftOrPrompt(action) {
    if (typeof RBShift === 'undefined') return true;
    if (typeof RBAuth === 'undefined') return true;

    var role = RBAuth.getRole ? RBAuth.getRole() : '';

    if (role === 'supervisor') return true;

    if (role === 'guard' && !RBShift.isActive()) {
        if (confirm('You must START DUTY before ' + action + '.\n\nStart shift now?')) {
            if (typeof RBGuardShift !== 'undefined' && RBGuardShift.startShift) {
                RBGuardShift.startShift();
            } else {
                window.location.href = 'dashboard.html';
            }
        }
        return false;
    }

    return true;
}

// ============================================================
// QR SCANNER (unchanged)
// ============================================================
function startScanner() {
    if (!requireShiftOrPrompt('scanning checkpoints')) return;

    if (typeof RBPermissions !== 'undefined') {
        RBPermissions.requestCamera().then(function(granted) {
            if (!granted) {
                showToast('Camera permission denied. Enable it in Settings → Apps → Reeves Belt App → Permissions.', 'error');
                return;
            }
            actuallyStartScanner();
        });
    } else {
        actuallyStartScanner();
    }
}

function actuallyStartScanner() {
    var video = document.getElementById('qrVideo');
    var placeholder = document.getElementById('scannerPlaceholder');
    var frame = document.getElementById('scannerFrame');
    var startBtn = document.getElementById('startScanBtn');
    var stopBtn = document.getElementById('stopScanBtn');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Camera not supported on this device', 'error');
        return;
    }

    if (typeof jsQR === 'undefined') {
        showToast('QR library not loaded', 'error');
        return;
    }

    var constraints = {
        audio: false,
        video: {
            facingMode: { ideal: 'environment' },
            width:  { ideal: 1920, min: 640 },
            height: { ideal: 1080, min: 480 },
            focusMode: 'continuous'
        }
    };

    navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream) {
        qrStream = stream;
        video.srcObject = stream;
        video.style.display = 'block';
        video.setAttribute('playsinline', 'true');
        video.setAttribute('autoplay', 'true');
        video.setAttribute('muted', 'true');

        placeholder.style.display = 'none';
        frame.style.display = 'block';
        startBtn.disabled = true;
        stopBtn.disabled = false;

        try {
            var track = stream.getVideoTracks()[0];
            var capabilities = track.getCapabilities ? track.getCapabilities() : {};
            var advanced = [];
            if (capabilities.focusMode && capabilities.focusMode.indexOf('continuous') >= 0) {
                advanced.push({ focusMode: 'continuous' });
            }
            if (advanced.length > 0) track.applyConstraints({ advanced: advanced });
        } catch (e) { console.log('Autofocus hint failed:', e); }

        video.onloadedmetadata = function() {
            video.play().catch(function() {});
            setTimeout(function() {
                qrScanInterval = setInterval(scanQRFrame, 100);
            }, 400);
        };
    })
    .catch(function(err) {
        showToast('Camera error: ' + err.message, 'error');
    });
}

function scanQRFrame() {
    var video = document.getElementById('qrVideo');
    if (!video) return;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
    if (video.videoWidth === 0 || video.videoHeight === 0) return;

    scanCanvas.width = video.videoWidth;
    scanCanvas.height = video.videoHeight;
    scanCanvasContext.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);

    var code = null;

    try {
        var cropW = Math.floor(scanCanvas.width * 0.7);
        var cropH = Math.floor(scanCanvas.height * 0.7);
        var cropX = Math.floor((scanCanvas.width - cropW) / 2);
        var cropY = Math.floor((scanCanvas.height - cropH) / 2);
        var imageData = scanCanvasContext.getImageData(cropX, cropY, cropW, cropH);
        code = jsQR(imageData.data, imageData.width, imageData.height, { inversionAttempts: 'dontInvert' });
    } catch (e) { console.log('Pass 1 error:', e); }

    if (!code) {
        try {
            var fullData = scanCanvasContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
            code = jsQR(fullData.data, fullData.width, fullData.height, { inversionAttempts: 'dontInvert' });
        } catch (e) { console.log('Pass 2 error:', e); }
    }

    if (!code) {
        try {
            var cropW2 = Math.floor(scanCanvas.width * 0.7);
            var cropH2 = Math.floor(scanCanvas.height * 0.7);
            var cropX2 = Math.floor((scanCanvas.width - cropW2) / 2);
            var cropY2 = Math.floor((scanCanvas.height - cropH2) / 2);
            var imageData2 = scanCanvasContext.getImageData(cropX2, cropY2, cropW2, cropH2);
            code = jsQR(imageData2.data, imageData2.width, imageData2.height, { inversionAttempts: 'attemptBoth' });
        } catch (e) { console.log('Pass 3 error:', e); }
    }

    if (code && code.data) handleQRDetected(code.data);
}

function handleQRDetected(qrData) {
    var now = Date.now();
    if (qrData === lastDetectedCode && (now - lastDetectedAt) < 2000) return;
    lastDetectedCode = qrData;
    lastDetectedAt = now;

    stopScanner();
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    playBeep();

    var matchedCheckpoint = matchCheckpoint(qrData);
    var resultBox = document.getElementById('scanResult');
    if (resultBox) resultBox.style.display = 'block';

    if (matchedCheckpoint) {
        var successText = document.getElementById('scanSuccessText');
        if (successText) successText.textContent = '✓ ' + matchedCheckpoint.point_name + ' - Logging...';
        setTimeout(function() {
            submitPatrolScan(matchedCheckpoint.point_name, qrData);
        }, 300);
    } else {
        var successText2 = document.getElementById('scanSuccessText');
        if (successText2) successText2.textContent = '⚠ QR not recognized: ' + qrData;
        var successBox = document.getElementById('scanSuccess');
        if (successBox) successBox.style.background = 'rgba(245, 158, 11, 0.2)';
        showToast('QR code not recognized', 'warning');
    }
}

function matchCheckpoint(qrData) {
    for (var i = 0; i < checkpoints.length; i++) {
        var cp = checkpoints[i];
        if (cp.point_name === qrData || cp.qr_code === qrData || String(cp.id) === String(qrData)) {
            return cp;
        }
    }
    return null;
}

function stopScanner() {
    if (qrScanInterval) { clearInterval(qrScanInterval); qrScanInterval = null; }
    if (qrStream) {
        qrStream.getTracks().forEach(function(t) { t.stop(); });
        qrStream = null;
    }
    var video = document.getElementById('qrVideo');
    var placeholder = document.getElementById('scannerPlaceholder');
    var frame = document.getElementById('scannerFrame');
    var startBtn = document.getElementById('startScanBtn');
    var stopBtn = document.getElementById('stopScanBtn');
    if (video) video.style.display = 'none';
    if (placeholder) placeholder.style.display = 'block';
    if (frame) frame.style.display = 'none';
    if (startBtn) startBtn.disabled = false;
    if (stopBtn) stopBtn.disabled = true;
}

// ============================================================
// SUBMIT PATROL SCAN (fixed)
// ============================================================
function submitPatrolScan(checkpointName, qrData) {
    showLoading('Logging checkpoint...');

    var data = {
        checkpoint_name: checkpointName,
        qr_data: qrData || checkpointName,
        method: 'QR',
        latitude: currentGPS.lat,
        longitude: currentGPS.lng,
        sync_hash: 'patrol-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
    };

    var online = !(typeof RBOffline !== 'undefined' && RBOffline.isOffline());

    function markLocalSuccess() {
        hideLoading();
        if (scannedCheckpoints.indexOf(checkpointName) === -1) {
            scannedCheckpoints.push(checkpointName);
            saveLocalScannedCheckpoints();
        }
        renderCheckpoints();
        renderManualSelect();
        updateProgress();
        setTimeout(function() {
            var box = document.getElementById('scanResult');
            if (box) box.style.display = 'none';
        }, 3000);
    }

    if (online) {
        RBApi.logPatrolScan(data).then(function() {
            markLocalSuccess();
            showToast('✓ ' + checkpointName + ' logged', 'success');
        }).catch(function(err) {
            // Network failed mid-flight → queue
            OfflineSync.queueRecord('patrol_scan', data);
            markLocalSuccess();
            showToast('💾 Saved locally — will sync', 'warning');
        });
    } else {
        OfflineSync.queueRecord('patrol_scan', data);
        markLocalSuccess();
        showToast('💾 Saved locally — will sync', 'warning');
    }
}

function submitManualScan() {
    if (!requireShiftOrPrompt('logging checkpoints')) return;

    var select = document.getElementById('manualCheckpoint');
    if (!select) return;

    var checkpointName = select.value;
    if (!checkpointName) { showToast('Select a checkpoint', 'error'); return; }

    var qrData = checkpointName;
    for (var i = 0; i < checkpoints.length; i++) {
        if (checkpoints[i].point_name === checkpointName) {
            qrData = checkpoints[i].qr_code || checkpointName;
            break;
        }
    }

    submitPatrolScan(checkpointName, qrData);
}

// ============================================================
// HELPERS
// ============================================================
function playBeep() {
    try {
        var ctx = new (window.AudioContext || window.webkitAudioContext)();
        var osc = ctx.createOscillator();
        var gain = ctx.createGain();
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.frequency.value = 1200;
        gain.gain.value = 0.2;
        osc.start();
        osc.stop(ctx.currentTime + 0.15);
    } catch (e) {}
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

function showLoading(text) {
    var el = document.getElementById('loadingText');
    var overlay = document.getElementById('loadingOverlay');
    if (el) el.textContent = text;
    if (overlay) overlay.classList.add('show');
}

function hideLoading() {
    var overlay = document.getElementById('loadingOverlay');
    if (overlay) overlay.classList.remove('show');
}

function showToast(message, type) {
    if (typeof RBApp !== 'undefined' && RBApp.showToast) {
        RBApp.showToast(message, type);
    } else {
        alert(message);
    }
}
