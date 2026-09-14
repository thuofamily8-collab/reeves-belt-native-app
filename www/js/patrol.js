/**
 * ============================================================
 * PATROL MODULE LOGIC
 * QR scanning + GPS capture
 * ============================================================
 */

var qrStream = null;
var qrScanInterval = null;
var scanCanvas = null;
var scanCanvasContext = null;
var checkpoints = [];
var scannedCheckpoints = [];
var currentGPS = { lat: null, lng: null };

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    if (!RBAuth.requireLogin()) return;

    scanCanvas = document.createElement('canvas');
    scanCanvasContext = scanCanvas.getContext('2d');

    // Get GPS location immediately
    getGPSLocation();

    // Load checkpoints
    loadCheckpoints();

    // Load scanned count from local storage
    loadLocalScannedCheckpoints();
});

// ============================================================
// GPS LOCATION
// ============================================================
function getGPSLocation() {
    if (!navigator.geolocation) {
        console.log('GPS not supported');
        return;
    }

    navigator.geolocation.getCurrentPosition(
        function(position) {
            currentGPS.lat = position.coords.latitude.toFixed(7);
            currentGPS.lng = position.coords.longitude.toFixed(7);
            console.log('GPS:', currentGPS);
        },
        function(error) {
            console.log('GPS error:', error.message);
        },
        { enableHighAccuracy: true, timeout: 10000, maximumAge: 60000 }
    );
}

// ============================================================
// LOAD CHECKPOINTS
// ============================================================
function loadCheckpoints() {
    RBApi.getPatrolPoints()
        .then(function(res) {
            checkpoints = res.points || res.checkpoints || [];
            renderCheckpoints();
            renderManualSelect();
            updateProgress();
        })
        .catch(function(err) {
            // Fallback: use local defaults
            checkpoints = getDefaultCheckpoints();
            renderCheckpoints();
            renderManualSelect();
            updateProgress();

            if (err.error) {
                showToast('⚠️ ' + err.error, 'warning');
            }
        });
}

function getDefaultCheckpoints() {
    // Fallback if API unavailable
    return [
        { id: 1, point_name: 'Main Gate', sequence_order: 1 },
        { id: 2, point_name: 'Warehouse A', sequence_order: 2 },
        { id: 3, point_name: 'Warehouse B', sequence_order: 3 },
        { id: 4, point_name: 'Perimeter Fence', sequence_order: 4 },
        { id: 5, point_name: 'Production Area', sequence_order: 5 }
    ];
}

function loadLocalScannedCheckpoints() {
    try {
        var saved = localStorage.getItem('rb_patrol_scanned_' + todayKey());
        if (saved) {
            scannedCheckpoints = JSON.parse(saved);
        }
    } catch (e) {
        scannedCheckpoints = [];
    }
}

function saveLocalScannedCheckpoints() {
    localStorage.setItem('rb_patrol_scanned_' + todayKey(), JSON.stringify(scannedCheckpoints));
}

function todayKey() {
    var d = new Date();
    return d.getFullYear() + '-' +
        String(d.getMonth() + 1).padStart(2, '0') + '-' +
        String(d.getDate()).padStart(2, '0');
}

// ============================================================
// RENDER CHECKPOINTS LIST
// ============================================================
function renderCheckpoints() {
    var container = document.getElementById('checkpointsList');

    if (checkpoints.length === 0) {
        container.innerHTML = '<div class="empty-state" style="padding: 20px;"><p>No checkpoints configured</p></div>';
        return;
    }

    var html = '<div class="checkpoint-list">';
    for (var i = 0; i < checkpoints.length; i++) {
        var cp = checkpoints[i];
        var isScanned = scannedCheckpoints.indexOf(cp.point_name) !== -1;

        html += '<div class="checkpoint-item ' + (isScanned ? 'completed' : '') + '">' +
            '<div class="checkpoint-icon">' + (isScanned ? '✅' : '📍') + '</div>' +
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

// ============================================================
// PROGRESS
// ============================================================
function updateProgress() {
    var total = checkpoints.length;
    var scanned = 0;

    for (var i = 0; i < checkpoints.length; i++) {
        if (scannedCheckpoints.indexOf(checkpoints[i].point_name) !== -1) {
            scanned++;
        }
    }

    var percent = total > 0 ? Math.round((scanned / total) * 100) : 0;

    document.getElementById('progressPercent').textContent = percent + '%';
    document.getElementById('scannedCount').textContent = scanned;
    document.getElementById('totalCount').textContent = total;
    document.getElementById('remainingCount').textContent = total - scanned;
}

// ============================================================
// QR SCANNER
// ============================================================
function startScanner() {
    var video = document.getElementById('qrVideo');
    var placeholder = document.getElementById('scannerPlaceholder');
    var frame = document.getElementById('scannerFrame');
    var startBtn = document.getElementById('startScanBtn');
    var stopBtn = document.getElementById('stopScanBtn');

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Camera not supported', 'error');
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

        // Start scanning every 300ms
        qrScanInterval = setInterval(scanQRFrame, 300);
    })
    .catch(function(err) {
        showToast('Camera error: ' + err.message, 'error');
    });
}

function scanQRFrame() {
    var video = document.getElementById('qrVideo');

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
    // Stop scanning to prevent multiple triggers
    stopScanner();

    // Vibrate + beep to confirm
    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    playBeep();

    // Match QR data to a checkpoint
    var matchedCheckpoint = matchCheckpoint(qrData);

    // Show result
    document.getElementById('scanResult').style.display = 'block';

    if (matchedCheckpoint) {
        document.getElementById('scanSuccessText').textContent = 
            '✅ ' + matchedCheckpoint.point_name + ' — Logging...';
        
        // Auto-submit
        setTimeout(function() {
            submitPatrolScan(matchedCheckpoint.point_name, qrData);
        }, 500);
    } else {
        document.getElementById('scanSuccessText').textContent = 
            '⚠️ QR not recognized: ' + qrData;
        document.getElementById('scanSuccess').style.background = 
            'rgba(245, 158, 11, 0.2)';
        
        showToast('QR code not recognized', 'warning');
    }
}

function matchCheckpoint(qrData) {
    // Match by point_name, qr_code, or id
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

    video.style.display = 'none';
    placeholder.style.display = 'block';
    frame.style.display = 'none';
    startBtn.disabled = false;
    stopBtn.disabled = true;
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

    OfflineSync.queueRecord('patrol_scan', data);

    OfflineSync.syncNow().then(function(result) {
        hideLoading();

        // Mark as scanned locally
        if (scannedCheckpoints.indexOf(checkpointName) === -1) {
            scannedCheckpoints.push(checkpointName);
            saveLocalScannedCheckpoints();
        }

        renderCheckpoints();
        renderManualSelect();
        updateProgress();

        // Hide result after 3 sec
        setTimeout(function() {
            document.getElementById('scanResult').style.display = 'none';
        }, 3000);

        if (result.synced > 0) {
            showToast('✅ ' + checkpointName + ' logged', 'success');
        } else {
            showToast('💾 Saved locally — will sync', 'warning');
        }
    });
}

function submitManualScan() {
    var select = document.getElementById('manualCheckpoint');
    var checkpointName = select.value;

    if (!checkpointName) {
        showToast('Select a checkpoint', 'error');
        return;
    }

    submitPatrolScan(checkpointName, checkpointName);
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
    document.getElementById('loadingText').textContent = text;
    document.getElementById('loadingOverlay').classList.add('show');
}

function hideLoading() {
    document.getElementById('loadingOverlay').classList.remove('show');
}

function showToast(message, type) {
    if (typeof RBApp !== 'undefined' && RBApp.showToast) {
        RBApp.showToast(message, type);
    } else {
        alert(message);
    }
}
