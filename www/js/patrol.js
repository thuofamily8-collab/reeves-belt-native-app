/**
 * ============================================================
 * REEVES BELT APP - Patrol Module
 * QR scanning, checkpoint tracking, offline sync
 *
 * SPRINT 2D:
 *   - Fullscreen scanner overlay
 *   - Native BarcodeDetector when available (10x faster)
 *   - jsQR fallback with full-frame scan
 *   - Auto-restart after successful scan
 *   - Instant success flash + beep + vibrate
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

// Native BarcodeDetector (available on Chrome 83+)
var _barcodeDetector = null;
var _useNative = false;

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    loadLocalScannedCheckpoints();
    loadCheckpoints();
    requestLocationSilently();

    // Detect native BarcodeDetector support
    if (typeof BarcodeDetector !== 'undefined') {
        try {
            if (typeof BarcodeDetector.getSupportedFormats === 'function') {
                BarcodeDetector.getSupportedFormats().then(function(formats) {
                    if (formats.indexOf('qr_code') !== -1) {
                        _barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
                        _useNative = true;
                        console.log('[patrol] BarcodeDetector native support enabled');
                    } else {
                        console.log('[patrol] qr_code not supported by BarcodeDetector — using jsQR');
                    }
                }).catch(function() {
                    console.log('[patrol] BarcodeDetector format check failed — using jsQR');
                });
            } else {
                _barcodeDetector = new BarcodeDetector({ formats: ['qr_code'] });
                _useNative = true;
                console.log('[patrol] BarcodeDetector enabled');
            }
        } catch (e) {
            console.log('[patrol] BarcodeDetector init failed — using jsQR', e);
        }
    } else {
        console.log('[patrol] No BarcodeDetector — using jsQR');
    }
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
    var fillEl = document.getElementById('progressFill');

    if (percentEl) percentEl.textContent = percent + '%';
    if (scannedEl) scannedEl.textContent = scanned;
    if (totalEl) totalEl.textContent = total;
    if (remainingEl) remainingEl.textContent = total - scanned;
    if (fillEl) fillEl.style.width = percent + '%';
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
// FULLSCREEN SCANNER
// ============================================================
function startScanner() {
    if (!requireShiftOrPrompt('scanning checkpoints')) return;

    if (typeof RBPermissions !== 'undefined') {
        RBPermissions.requestCamera().then(function(granted) {
            if (!granted) {
                showToast('Camera permission denied. Enable it in Settings → Apps → Reeves Belt App → Permissions.', 'error');
                return;
            }
            openFullscreenScanner();
        });
    } else {
        openFullscreenScanner();
    }
}

function openFullscreenScanner() {
    var overlay = document.getElementById('rbScannerOverlay');
    if (!overlay) {
        showToast('Scanner UI not available', 'error');
        return;
    }

    overlay.classList.add('show');

    // Hide success flash on entry
    var flash = document.getElementById('rbScannerFlash');
    if (flash) flash.classList.remove('show');

    actuallyStartScanner();
}

function actuallyStartScanner() {
    var video = document.getElementById('rbScannerVideo');
    if (!video) return;

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Camera not supported on this device', 'error');
        return;
    }

    // jsQR must be present for the fallback path
    if (!_useNative && typeof jsQR === 'undefined') {
        showToast('QR library not loaded', 'error');
        return;
    }

    // Full HD is fine here — with native detector it's instant,
    // with jsQR we down-sample by cropping the center.
    var constraints = {
        audio: false,
        video: {
            facingMode: { ideal: 'environment' },
            width:  { ideal: 1280 },
            height: { ideal: 720 },
            focusMode: 'continuous'
        }
    };

    navigator.mediaDevices.getUserMedia(constraints)
    .then(function(stream) {
        qrStream = stream;
        video.srcObject = stream;
        video.setAttribute('playsinline', 'true');
        video.setAttribute('autoplay', 'true');
        video.setAttribute('muted', 'true');

        try {
            var track = stream.getVideoTracks()[0];
            var capabilities = track.getCapabilities ? track.getCapabilities() : {};
            var advanced = [];
            if (capabilities.focusMode && capabilities.focusMode.indexOf('continuous') >= 0) {
                advanced.push({ focusMode: 'continuous' });
            }
            if (advanced.length > 0) track.applyConstraints({ advanced: advanced });
        } catch (e) { /* ignore */ }

        video.onloadedmetadata = function() {
            video.play().catch(function() {});

            // Two scan loops: native uses frames from the video element,
            // jsQR uses a canvas at 60ms intervals
            if (_useNative && _barcodeDetector) {
                startNativeScanLoop(video);
            } else {
                startJsQrScanLoop(video);
            }
        };
    })
    .catch(function(err) {
        showToast('Camera error: ' + err.message, 'error');
        stopScanner();
    });
}

// -------- Native BarcodeDetector loop --------
function startNativeScanLoop(video) {
    var busy = false;

    function tick() {
        if (!qrStream) return;

        if (!busy && video.readyState === video.HAVE_ENOUGH_DATA) {
            busy = true;

            _barcodeDetector.detect(video)
                .then(function(codes) {
                    busy = false;
                    if (codes && codes.length > 0) {
                        var text = codes[0].rawValue;
                        if (text) handleQRDetected(text);
                    }
                })
                .catch(function() {
                    busy = false;
                });
        }

        qrScanInterval = setTimeout(tick, 80);
    }

    tick();
}

// -------- jsQR fallback loop --------
function startJsQrScanLoop(video) {
    function tick() {
        if (!qrStream) return;

        if (video.readyState === video.HAVE_ENOUGH_DATA &&
            video.videoWidth > 0 && video.videoHeight > 0) {

            // Downsample: 480 wide is plenty for QR detection and fast
            var targetW = 480;
            var scale = targetW / video.videoWidth;
            var targetH = Math.floor(video.videoHeight * scale);

            scanCanvas.width = targetW;
            scanCanvas.height = targetH;
            scanCanvasContext.drawImage(video, 0, 0, targetW, targetH);

            var imageData = scanCanvasContext.getImageData(0, 0, targetW, targetH);
            var code = jsQR(imageData.data, imageData.width, imageData.height, {
                inversionAttempts: 'dontInvert'
            });

            if (code && code.data) {
                handleQRDetected(code.data);
                return;
            }
        }

        qrScanInterval = setTimeout(tick, 60);
    }

    tick();
}

function handleQRDetected(qrData) {
    var now = Date.now();
    if (qrData === lastDetectedCode && (now - lastDetectedAt) < 2500) return;
    lastDetectedCode = qrData;
    lastDetectedAt = now;

    // Freeze the video to prevent duplicate reads
    if (qrScanInterval) {
        clearInterval(qrScanInterval);
        clearTimeout(qrScanInterval);
        qrScanInterval = null;
    }

    if (navigator.vibrate) navigator.vibrate([100, 50, 100]);
    playBeep();

    var matched = matchCheckpoint(qrData);

    if (matched) {
        // Show big green success flash
        showFlash(matched.point_name);

        setTimeout(function() {
            submitPatrolScan(matched.point_name, qrData);
        }, 600);
    } else {
        // Unrecognized QR — show a toast and restart scanning
        showToast('QR not recognized: ' + qrData, 'warning');
        setTimeout(restartScanning, 1200);
    }
}

function showFlash(checkpointName) {
    var flash = document.getElementById('rbScannerFlash');
    var nameEl = document.getElementById('rbFlashCheckpoint');
    if (nameEl) nameEl.textContent = checkpointName || '';
    if (flash) flash.classList.add('show');
}

function hideFlash() {
    var flash = document.getElementById('rbScannerFlash');
    if (flash) flash.classList.remove('show');
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

function restartScanning() {
    hideFlash();
    if (!qrStream) return;

    var video = document.getElementById('rbScannerVideo');
    if (!video) return;

    if (_useNative && _barcodeDetector) {
        startNativeScanLoop(video);
    } else {
        startJsQrScanLoop(video);
    }
}

function stopScanner() {
    if (qrScanInterval) {
        clearInterval(qrScanInterval);
        clearTimeout(qrScanInterval);
        qrScanInterval = null;
    }

    if (qrStream) {
        qrStream.getTracks().forEach(function(t) { t.stop(); });
        qrStream = null;
    }

    hideFlash();

    var overlay = document.getElementById('rbScannerOverlay');
    if (overlay) overlay.classList.remove('show');

    var video = document.getElementById('rbScannerVideo');
    if (video) video.srcObject = null;
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
    }

    if (online) {
        RBApi.logPatrolScan(data).then(function() {
            markLocalSuccess();
            showToast('✓ ' + checkpointName + ' logged', 'success');
            // Auto-restart after a short delay
            setTimeout(restartScanning, 800);
        }).catch(function(err) {
            OfflineSync.queueRecord('patrol_scan', data);
            markLocalSuccess();
            showToast('💾 Saved locally — will sync', 'warning');
            setTimeout(restartScanning, 800);
        });
    } else {
        OfflineSync.queueRecord('patrol_scan', data);
        markLocalSuccess();
        showToast('💾 Saved locally — will sync', 'warning');
        setTimeout(restartScanning, 800);
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
        osc.frequency.value = 1400;
        gain.gain.value = 0.25;
        osc.start();
        osc.stop(ctx.currentTime + 0.18);
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
        console.log('[patrol]', message);
    }
}
