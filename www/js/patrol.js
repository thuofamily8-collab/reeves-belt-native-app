/**
 * ============================================================
 * REEVES BELT APP - Patrol Module
 * QR scanning, checkpoint tracking, offline sync
 *
 * UPDATED:
 *  - Runtime camera permission request before scanner starts
 *  - Graceful fallback if permission denied
 * ============================================================
 */

var checkpoints = [];
var scannedCheckpoints = [];
var qrStream = null;
var qrScanInterval = null;
var scanCanvas = document.createElement('canvas');
var scanCanvasContext = scanCanvas.getContext('2d');
var currentGPS = { lat: null, lng: null };

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
// LOCAL STORAGE OF SCANNED CHECKPOINTS (per day)
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
// QR SCANNER
// ============================================================
function startScanner() {
    // Runtime permission check first
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

    navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
        audio: false
    })
    .then(function(stream) {
        qrStream = stream;
        video.srcObject = stream;
        video.style.display = 'block';
        placeholder.style.display = 'none';
        frame.style.display = 'block';
        startBtn.disabled = true;
        stopBtn.disabled = false;

        qrScanInterval = setInterval(scanQRFrame, 300);
    })
    .catch(function(err) {
        showToast('Camera error: ' + err.message, 'error');
    });
}

function scanQRFrame() {
    var video = document.getElementById('qrVideo');
    if (!video) return;
    if (video.readyState !== video.HAVE_ENOUGH_DATA) return;
    if (video.videoWidth === 0) return;

    scanCanvas.width = video.videoWidth;
    scanCanvas.height = video.videoHeight;
    scanCanvasContext.drawImage(video, 0, 0, scanCanvas.width, scanCanvas.height);

    try {
        var imageData = scanCanvasContext.getImageData(0, 0, scanCanvas.width, scanCanvas.height);
        var code = jsQR(imageData.data, imageData.width, imageData.height, {
            inversionAttempts: 'dontInvert'
        });

        if (code && code.data) {
            handleQRDetected(code.data);
        }
    } catch (e) {
        console.log('Scan error:', e);
    }
}

function handleQRDetected(qrData) {
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
        }, 500);
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
        if (cp.point_name === qrData ||
            cp.qr_code === qrData ||
            String(cp.id) === String(qrData)) {
            return cp;
        }
    }
    return null;
}

function stopScanner() {
    if (qrScanInterval) {
        clearInterval(qrScanInterval);
        qrScanInterval = null;
    }

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
// SUBMIT PATROL SCAN
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

    if (typeof OfflineSync !== 'undefined' && OfflineSync.queueRecord) {
        OfflineSync.queueRecord('patrol_scan', data);
    }

    RBApi.logPatrolScan(data).then(function(result) {
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

        showToast('✓ ' + checkpointName + ' logged', 'success');
    }).catch(function(err) {
        hideLoading();

        // Queue for offline sync
        if (typeof OfflineSync !== 'undefined' && OfflineSync.queueRecord) {
            if (scannedCheckpoints.indexOf(checkpointName) === -1) {
                scannedCheckpoints.push(checkpointName);
                saveLocalScannedCheckpoints();
            }
            renderCheckpoints();
            renderManualSelect();
            updateProgress();
            showToast('⚠ Saved locally - will sync', 'warning');
        } else {
            showToast('Failed: ' + (err.error || 'network error'), 'error');
        }
    });
}

function submitManualScan() {
    var select = document.getElementById('manualCheckpoint');
    if (!select) return;

    var checkpointName = select.value;
    if (!checkpointName) {
        showToast('Select a checkpoint', 'error');
        return;
    }

    // Find qr_code for this checkpoint
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
