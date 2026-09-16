/**
 * ============================================================
 * VISITOR MODULE LOGIC
 * ============================================================
 */

var visitorStream = null;
var capturedPhotoData = '';
var capturedTimestamp = '';
var currentTab = 'checkin';

// ============================================================
// TAB SWITCHING
// ============================================================
function switchTab(tab) {
    currentTab = tab;

    var tabCheckIn = document.getElementById('tabCheckIn');
    var tabCheckOut = document.getElementById('tabCheckOut');
    var checkinView = document.getElementById('checkinView');
    var checkoutView = document.getElementById('checkoutView');
    var checkinActions = document.getElementById('checkinActions');

    if (tab === 'checkin') {
        tabCheckIn.classList.add('active');
        tabCheckOut.classList.remove('active');
        checkinView.style.display = 'block';
        checkoutView.style.display = 'none';
        checkinActions.style.display = 'flex';
    } else {
        tabCheckIn.classList.remove('active');
        tabCheckOut.classList.add('active');
        checkinView.style.display = 'none';
        checkoutView.style.display = 'block';
        checkinActions.style.display = 'none';
        loadVisitorsInside();
    }

    if (navigator.vibrate) navigator.vibrate(20);
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
// VEHICLE TOGGLE
// ============================================================
function toggleVehicleFields() {
    var checkbox = document.getElementById('arrivedWithVehicle');
    var fields = document.getElementById('vehicleFields');
    fields.style.display = checkbox.checked ? 'block' : 'none';
}

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
        video: { facingMode: 'user', width: { ideal: 1280 } },
        audio: false
    })
    .then(function(stream) {
        visitorStream = stream;
        video.srcObject = stream;
        video.style.display = 'block';
        img.style.display = 'none';
        placeholder.style.display = 'none';
        overlay.style.display = 'block';
        startBtn.textContent = '⏹ Stop';
        captureBtn.disabled = false;
    })
    .catch(function(err) {
        showToast('Cannot access camera: ' + err.message, 'error');
    });
}

function useNativeCamera() {
    Capacitor.Plugins.Camera.getPhoto({
        quality: 85,
        allowEditing: false,
        resultType: 'dataUrl',
        source: 'CAMERA',
        direction: 'FRONT',
        width: 1024,
        height: 1024
    })
    .then(function(photo) {
        capturedPhotoData = photo.dataUrl;
        showCapturedPhoto(photo.dataUrl);
    })
    .catch(function(err) {
        showToast('Camera error: ' + err.message, 'error');
    });
}

function capturePhoto() {
    var video = document.getElementById('cameraVideo');
    if (!video.videoWidth) {
        showToast('Camera not ready', 'error');
        return;
    }

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

    burnTimestamp(canvas, ts, 'VISITOR');
    capturedPhotoData = canvas.toDataURL('image/jpeg', 0.85);

    if (visitorStream) {
        visitorStream.getTracks().forEach(function(t) { t.stop(); });
        visitorStream = null;
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
// SUBMIT VISITOR CHECK-IN
// ============================================================
function submitVisitor() {
    var visitorName = document.getElementById('visitorName').value.trim();
    var visitorId = document.getElementById('visitorId').value.trim();
    var visitorPhone = document.getElementById('visitorPhone').value.trim();
    var visitorCompany = document.getElementById('visitorCompany').value.trim();
    var hostName = document.getElementById('hostName').value.trim();
    var purpose = document.getElementById('visitorPurpose').value;
    var arrivedWithVehicle = document.getElementById('arrivedWithVehicle').checked;
    var visitCommentEl = document.getElementById('visitComment');
    var visitComment = visitCommentEl ? visitCommentEl.value.trim() : '';

    if (!visitorName) { showToast('Enter visitor name', 'error'); return; }
    if (!visitorId) { showToast('Enter ID number', 'error'); return; }
    if (!visitorPhone) { showToast('Enter phone', 'error'); return; }
    if (!hostName) { showToast('Enter host name', 'error'); return; }
    if (!purpose) { showToast('Select purpose', 'error'); return; }

    var vehiclePlate = '';
    var vehicleType = '';
    var vehicleModel = '';

    if (arrivedWithVehicle) {
        vehiclePlate = document.getElementById('visitorVehiclePlate').value.trim().toUpperCase();
        vehicleType = document.getElementById('visitorVehicleType').value;
        vehicleModel = document.getElementById('visitorVehicleModel').value.trim();
        if (!vehiclePlate) {
            showToast('Enter vehicle plate', 'error');
            return;
        }
    }

    showLoading('Checking in visitor...');

    var data = {
        visitor_name: visitorName,
        visitor_id: visitorId,
        visitor_phone: visitorPhone,
        visitor_company: visitorCompany,
        host_name: hostName,
        purpose: purpose,
        visit_comment: visitComment,
        arrived_with_vehicle: arrivedWithVehicle,
        vehicle_plate: vehiclePlate,
        vehicle_type: vehicleType,
        vehicle_model: vehicleModel,
        visitor_photo_data: capturedPhotoData,
        photo_captured_at: capturedTimestamp,
        sync_hash: 'visitor-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
    };

    OfflineSync.queueRecord('visitor_checkin', data);

    OfflineSync.syncNow().then(function(result) {
        hideLoading();
        if (result.synced > 0) {
            showToast('✅ Visitor checked in', 'success');
        } else {
            showToast('💾 Saved locally - will sync when online', 'warning');
        }

        if (navigator.vibrate) navigator.vibrate(200);

        setTimeout(function() {
            window.location.href = 'dashboard.html';
        }, 1200);
    });
}

function voidVisitor() {
    if (confirm('Void this check-in? All entered data will be lost.')) {
        window.location.href = 'dashboard.html';
    }
}

// ============================================================
// LOAD VISITORS INSIDE (For Check-out Tab)
// ============================================================
function loadVisitorsInside() {
    var container = document.getElementById('visitorsList');
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">👥</div><p>Loading visitors...</p></div>';

    RBApi.getVisitorsInside()
        .then(function(res) {
            var visitors = res.visitors || res.data || [];
            renderVisitors(visitors);
        })
        .catch(function(err) {
            container.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">📡</div>' +
                    '<p>Cannot load visitors</p>' +
                    '<p style="font-size:12px; margin-top:10px; color:#6b7280;">' + (err.error || 'Network error') + '</p>' +
                '</div>';
        });
}

function renderVisitors(visitors) {
    var container = document.getElementById('visitorsList');

    if (!visitors || visitors.length === 0) {
        container.innerHTML =
            '<div class="empty-state">' +
                '<div class="empty-state-icon">👥</div>' +
                '<p>No visitors currently inside</p>' +
            '</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < visitors.length; i++) {
        var v = visitors[i];
        var checkInTime = v.check_in_time ? formatTime(v.check_in_time) : 'Just now';

        html +=
            '<div class="vehicle-info-card" onclick="checkOutVisitor(' + v.id + ', &quot;' + escapeHtml(v.visitor_name) + '&quot;)">' +
                '<div class="vehicle-info-plate">' + escapeHtml(v.visitor_name) + '</div>' +
                '<div class="vehicle-info-detail">📞 ' + escapeHtml(v.visitor_phone || '—') + '</div>' +
                '<div class="vehicle-info-detail">🏢 ' + escapeHtml(v.company || 'Walk-in') + '</div>' +
                '<div class="vehicle-info-detail">👤 Host: ' + escapeHtml(v.host_name || '—') + '</div>' +
                '<div class="vehicle-info-detail">🕐 In: ' + checkInTime + '</div>' +
            '</div>';
    }

    container.innerHTML = html;
}

function checkOutVisitor(logId, visitorName) {
    if (!confirm('Check out ' + visitorName + '?')) return;

    showLoading('Processing check-out...');

    var data = {
        log_id: logId,
        sync_hash: 'checkout-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
    };

    OfflineSync.queueRecord('visitor_checkout', data);

    OfflineSync.syncNow().then(function(result) {
        hideLoading();
        if (result.synced > 0) {
            showToast('✅ ' + visitorName + ' checked out', 'success');
        } else {
            showToast('💾 Saved locally - will sync when online', 'warning');
        }

        if (navigator.vibrate) navigator.vibrate(150);

        setTimeout(function() {
            loadVisitorsInside();
        }, 800);
    });
}

// ============================================================
// HELPERS
// ============================================================
function formatTime(dateStr) {
    try {
        var d = new Date(dateStr);
        var now = new Date();
        var diff = Math.floor((now - d) / 1000);
        if (diff < 60) return 'Just now';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return d.getHours().toString().padStart(2, '0') + ':' +
               d.getMinutes().toString().padStart(2, '0');
    } catch (e) {
        return '—';
    }
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

// ============================================================
// INIT
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    if (!RBAuth.requireLogin()) return;
});
