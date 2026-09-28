/**
 * ============================================================
 * VEHICLE ENTRY LOGIC
 * ============================================================
 * Supports ?pending=N to pre-fill from a called-in pre-weighed truck.
 */

var vehicleStream = null;
var capturedPhotoData = '';
var capturedTimestamp = '';
var pendingEntryId = null;

// ============================================================
// PREFILL FROM PENDING CAPTURE
// ============================================================
document.addEventListener('DOMContentLoaded', function () {
    var params = new URLSearchParams(window.location.search);
    var pending = parseInt(params.get('pending'), 10);
    if (!pending) return;

    pendingEntryId = pending;

    var badge = document.getElementById('prefillBadge');
    if (badge) badge.style.display = 'block';

    RBApi.getPendingCaptureDetail(pending).then(function (res) {
        var entry = res.entry || (res.data && res.data.entry);
        var preweighed = res.preweighed || (res.data && res.data.preweighed);
        if (!entry) return;

        setValue('plateNumber', entry.vehicle_plate);
        setValue('driverName', entry.driver_name);
        setValue('driverPhone', entry.driver_phone);
        setValue('vehicleModel', entry.vehicle_model || '');
        setValue('vehicleColor', entry.vehicle_color || '');
        setValue('entryWeight', entry.entry_weight_kg || '');
        setValue('entryComment', entry.entry_comment || '');

        if (entry.vehicle_type) {
            var typeEl = document.getElementById('vehicleType');
            if (typeEl) {
                for (var i = 0; i < typeEl.options.length; i++) {
                    if (typeEl.options[i].value === entry.vehicle_type) {
                        typeEl.selectedIndex = i;
                        break;
                    }
                }
            }
        }

        if (entry.purpose) {
            var purposeEl = document.getElementById('purpose');
            if (purposeEl) {
                for (var j = 0; j < purposeEl.options.length; j++) {
                    if (purposeEl.options[j].value === entry.purpose) {
                        purposeEl.selectedIndex = j;
                        break;
                    }
                }
            }
        }

        var codeEl = document.getElementById('prefillCode');
        if (codeEl && entry.preweighed_code) {
            codeEl.textContent = entry.preweighed_code;
        } else if (codeEl && preweighed && preweighed.unique_code) {
            codeEl.textContent = preweighed.unique_code;
        }
    }).catch(function (err) {
        console.warn('[vehicle-entry] Could not load pending capture:', err);
        if (typeof RBApp !== 'undefined') {
            RBApp.showToast('Could not load pending details — enter manually', 'warning');
        }
    });
});

function setValue(id, val) {
    var el = document.getElementById(id);
    if (el && val !== null && val !== undefined) el.value = val;
}

// ============================================================
// LIVE TIMESTAMP
// ============================================================
function updateLiveTime() {
    var now = new Date();
    var timeStr = String(now.getHours()).padStart(2, '0') + ':' +
                  String(now.getMinutes()).padStart(2, '0') + ':' +
                  String(now.getSeconds()).padStart(2, '0');
    var el = document.getElementById('timeDisplay');
    if (el) el.textContent = timeStr;
}
setInterval(updateLiveTime, 1000);
updateLiveTime();

// ============================================================
// CAMERA
// ============================================================
function startCamera() {
    var video = document.getElementById('cameraVideo');
    var placeholder = document.getElementById('cameraPlaceholder');
    var overlay = document.getElementById('timestampOverlay');
    var startBtn = document.getElementById('startCamBtn');
    var captureBtn = document.getElementById('captureBtn');
    var img = document.getElementById('cameraImage');

    if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Camera) {
        useNativeCamera();
        return;
    }

    if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
        showToast('Camera not supported', 'error');
        return;
    }

    navigator.mediaDevices.getUserMedia({
        video: { facingMode: 'environment', width: { ideal: 1280 } },
        audio: false
    })
    .then(function (stream) {
        vehicleStream = stream;
        video.srcObject = stream;
        video.style.display = 'block';
        img.style.display = 'none';
        placeholder.style.display = 'none';
        overlay.style.display = 'block';
        startBtn.textContent = '⏹ Stop';
        captureBtn.disabled = false;
    })
    .catch(function (err) {
        showToast('Cannot access camera: ' + err.message, 'error');
    });
}

function useNativeCamera() {
    Capacitor.Plugins.Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: 'dataUrl',
        source: 'CAMERA',
        direction: 'REAR',
        width: 1024,
        height: 1024
    })
    .then(function (photo) {
        capturedPhotoData = photo.dataUrl;
        showCapturedPhoto(photo.dataUrl);
    })
    .catch(function (err) {
        showToast('Camera error: ' + err.message, 'error');
    });
}

function capturePhoto() {
    var video = document.getElementById('cameraVideo');
    if (!video.videoWidth) { showToast('Camera not ready', 'error'); return; }

    var canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext('2d').drawImage(video, 0, 0);

    var now = new Date();
    var ts = now.getFullYear() + '-' +
        String(now.getMonth() + 1).padStart(2, '0') + '-' +
        String(now.getDate()).padStart(2, '0') + ' ' +
        String(now.getHours()).padStart(2, '0') + ':' +
        String(now.getMinutes()).padStart(2, '0') + ':' +
        String(now.getSeconds()).padStart(2, '0');
    capturedTimestamp = ts;

    burnTimestamp(canvas, ts, 'VEHICLE ENTRY');
    capturedPhotoData = canvas.toDataURL('image/jpeg', 0.85);

    if (vehicleStream) {
        vehicleStream.getTracks().forEach(function (t) { t.stop(); });
        vehicleStream = null;
    }

    showCapturedPhoto(capturedPhotoData);
    showToast('✅ Photo captured', 'success');
}

function showCapturedPhoto(dataUrl) {
    var video = document.getElementById('cameraVideo');
    var img = document.getElementById('cameraImage');
    var overlay = document.getElementById('timestampOverlay');
    var startBtn = document.getElementById('startCamBtn');
    var captureBtn = document.getElementById('captureBtn');

    video.style.display = 'none';
    img.src = dataUrl;
    img.style.display = 'block';
    overlay.style.display = 'none';
    startBtn.textContent = '📷 Retake';
    startBtn.onclick = resetCamera;
    captureBtn.disabled = true;
}

function resetCamera() {
    var video = document.getElementById('cameraVideo');
    var img = document.getElementById('cameraImage');
    var placeholder = document.getElementById('cameraPlaceholder');
    var startBtn = document.getElementById('startCamBtn');
    var captureBtn = document.getElementById('captureBtn');

    capturedPhotoData = '';
    capturedTimestamp = '';
    video.style.display = 'none';
    img.style.display = 'none';
    placeholder.style.display = 'block';
    startBtn.textContent = '📷 Start Camera';
    startBtn.onclick = startCamera;
    captureBtn.disabled = true;
}

function burnTimestamp(canvas, timestamp, label) {
    var ctx = canvas.getContext('2d');
    var w = canvas.width, h = canvas.height;
    var boxW = Math.min(380, w * 0.55), boxH = 80;
    var boxX = w - boxW - 15, boxY = h - boxH - 15;

    ctx.fillStyle = 'rgba(0, 0, 0, 0.85)';
    ctx.fillRect(boxX, boxY, boxW, boxH);
    ctx.strokeStyle = '#00ff00';
    ctx.lineWidth = 3;
    ctx.strokeRect(boxX, boxY, boxW, boxH);

    ctx.fillStyle = '#00c6ff';
    ctx.font = 'bold 14px Arial';
    ctx.fillText('● ' + label, boxX + 12, boxY + 22);

    ctx.fillStyle = '#00ff00';
    ctx.font = 'bold 18px "Courier New", monospace';
    ctx.fillText(timestamp.substring(0, 10), boxX + 12, boxY + 45);

    ctx.font = 'bold 22px "Courier New", monospace';
    ctx.fillText(timestamp.substring(11, 19), boxX + 12, boxY + 70);
}

// ============================================================
// SUBMIT
// ============================================================
function submitEntry() {
    var plate = document.getElementById('plateNumber').value.trim().toUpperCase();
    var vehicleType = document.getElementById('vehicleType').value;
    var driverName = document.getElementById('driverName').value.trim();
    var driverId = document.getElementById('driverId').value.trim();
    var driverPhone = document.getElementById('driverPhone').value.trim();
    var purpose = document.getElementById('purpose').value;
    var entryWeight = parseFloat(document.getElementById('entryWeight').value);
    var entryComment = document.getElementById('entryComment') ? document.getElementById('entryComment').value.trim() : '';

    if (!plate) { showToast('Enter plate number', 'error'); return; }
    if (!vehicleType) { showToast('Select vehicle type', 'error'); return; }
    if (!driverName) { showToast('Enter driver name', 'error'); return; }
    if (!driverId) { showToast('Enter driver ID', 'error'); return; }
    if (!driverPhone) { showToast('Enter driver phone', 'error'); return; }
    if (!purpose) { showToast('Select purpose', 'error'); return; }
    if (!entryWeight || entryWeight <= 0) { showToast('Enter valid weight', 'error'); return; }

    showLoading('Recording entry...');

    var data = {
        plate_number: plate,
        vehicle_type: vehicleType,
       
