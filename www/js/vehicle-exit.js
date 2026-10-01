/**
 * ============================================================
 * VEHICLE EXIT LOGIC
 * ============================================================
 * Computes cargo weight, renders direction badge, and shows
 * a "Recently Exited" section for verification.
 */

var currentVehicle = null;

// ============================================================
// LOAD VEHICLES INSIDE + RECENTLY EXITED
// ============================================================
function loadVehiclesInside() {
    var container = document.getElementById('vehiclesList');
    if (!container) return;

    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🚛</div><p>Loading vehicles...</p></div>';

    RBApi.getVehiclesInside()
        .then(function(res) {
            var data = (res && res.data) ? res.data : res;
            var inside = data.inside || data.vehicles || [];
            var recent = data.recent_exited || [];
            renderVehicles(inside);
            renderRecentlyExited(recent);
        })
        .catch(function(err) {
            console.log('API error, trying offline queue...', err);
            var offlineVehicles = getOfflineQueuedVehicles();
            renderVehicles(offlineVehicles);
            renderRecentlyExited([]);
            if (offlineVehicles.length === 0) {
                container.innerHTML =
                    '<div class="empty-state">' +
                        '<div class="empty-state-icon">📡</div>' +
                        '<p>Cannot load vehicles</p>' +
                        '<p style="font-size:12px; margin-top:10px; color:#6b7280;">' + (err.error || 'Network error') + '</p>' +
                    '</div>';
            }
        });
}

function getOfflineQueuedVehicles() {
    try {
        var queue = JSON.parse(localStorage.getItem('rb_offline_queue') || '[]');
        return queue
            .filter(function(r) { return r.type === 'vehicle_entry'; })
            .map(function(r) {
                return {
                    id: r.id,
                    plate_number: r.data.plate_number,
                    driver_name: r.data.driver_name,
                    purpose: r.data.purpose,
                    entry_weight_kg: r.data.entry_weight_kg,
                    entry_time: r.created_at,
                    offline: true
                };
            });
    } catch (e) {
        return [];
    }
}

// ============================================================
// DIRECTION BADGE (hint from purpose while inside)
// ============================================================
function directionBadge(v) {
    var dir = (v.direction || '').toLowerCase();
    var purpose = (v.purpose || '').toLowerCase();

    // If we already have a real direction (from an exited row)
    if (dir === 'inbound')  return '<span style="background:#00c6ff; color:#fff; font-size:10px; font-weight:800; letter-spacing:1px; padding:3px 9px; border-radius:10px;">⬇ INBOUND</span>';
    if (dir === 'outbound') return '<span style="background:#f59e0b; color:#fff; font-size:10px; font-weight:800; letter-spacing:1px; padding:3px 9px; border-radius:10px;">⬆ OUTBOUND</span>';

    // Hint from purpose while still inside
    if (/deliver|supplier|receiving|intake|offload|inbound/.test(purpose))
        return '<span style="background:rgba(0,198,255,0.2); color:#00c6ff; border:1px solid #00c6ff; font-size:10px; font-weight:800; letter-spacing:1px; padding:3px 9px; border-radius:10px;">⬇ EXPECTED INBOUND</span>';

    if (/pick ?up|dispatch|loading|collection|outbound|distributor/.test(purpose))
        return '<span style="background:rgba(245,158,11,0.2); color:#f59e0b; border:1px solid #f59e0b; font-size:10px; font-weight:800; letter-spacing:1px; padding:3px 9px; border-radius:10px;">⬆ EXPECTED OUTBOUND</span>';

    return '';
}

// ============================================================
// RENDER — VEHICLES INSIDE
// ============================================================
function renderVehicles(vehicles) {
    var container = document.getElementById('vehiclesList');
    if (!container) return;

    if (!vehicles || vehicles.length === 0) {
        container.innerHTML =
            '<div class="empty-state">' +
                '<div class="empty-state-icon">🅿️</div>' +
                '<p>No vehicles currently inside</p>' +
            '</div>';
        return;
    }

    var html = '';
    for (var i = 0; i < vehicles.length; i++) {
        var v = vehicles[i];
        var entryTime = v.entry_time ? formatTime(v.entry_time) : 'Just now';
        var offlineBadge = v.offline
            ? '<span style="background:#f59e0b; color:#fff; padding:2px 6px; border-radius:8px; font-size:9px; margin-left:5px;">LOCAL</span>'
            : '';

        var preweighedBadge = v.preweighed_code
            ? '<div style="display:inline-block; margin-top:8px; padding:3px 8px; background:rgba(212,175,55,0.15); border:1px solid rgba(212,175,55,0.4); border-radius:6px; font-size:10px; color:#f0d060; font-weight:700; letter-spacing:1px;">📥 PRE-WEIGHED • ' + escapeHtml(v.preweighed_code) + '</div>'
            : '';

        html +=
            '<div class="vehicle-info-card" onclick="openExitModal(' + JSON.stringify(JSON.stringify(v)).replace(/"/g, '&quot;') + ')">' +
                '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">' +
                    '<div class="vehicle-info-plate">' + escapeHtml(v.plate_number) + offlineBadge + '</div>' +
                    directionBadge(v) +
                '</div>' +
                '<div class="vehicle-info-detail">👤 ' + escapeHtml(v.driver_name || '—') + '</div>' +
                '<div class="vehicle-info-detail">📋 ' + escapeHtml(v.purpose || '—') + '</div>' +
                '<div class="vehicle-info-detail">🕐 Entry: ' + entryTime + '</div>' +
                '<div class="vehicle-info-weight">⚖️ Entry: ' + formatNumber(v.entry_weight_kg) + ' KG</div>' +
                preweighedBadge +
            '</div>';
    }

    container.innerHTML = html;
}

// ============================================================
// RENDER — RECENTLY EXITED
// ============================================================
function renderRecentlyExited(vehicles) {
    var section = document.getElementById('recentExitedSection');
    var container = document.getElementById('recentExitedList');
    if (!section || !container) return;

    if (!vehicles || vehicles.length === 0) {
        section.style.display = 'none';
        return;
    }

    section.style.display = 'block';
    var html = '';

    for (var i = 0; i < vehicles.length; i++) {
        var v = vehicles[i];
        var exitTime = v.exit_time ? formatTime(v.exit_time) : '—';
        var direction = (v.direction || '').toLowerCase();

        var dirBadge;
        if (direction === 'inbound')
            dirBadge = '<span style="background:#00c6ff; color:#fff; font-size:10px; font-weight:800; letter-spacing:1px; padding:3px 9px; border-radius:10px;">⬇ INBOUND</span>';
        else if (direction === 'outbound')
            dirBadge = '<span style="background:#f59e0b; color:#fff; font-size:10px; font-weight:800; letter-spacing:1px; padding:3px 9px; border-radius:10px;">⬆ OUTBOUND</span>';
        else
            dirBadge = '<span style="background:#6b7280; color:#fff; font-size:10px; font-weight:800; letter-spacing:1px; padding:3px 9px; border-radius:10px;">—</span>';

        html +=
            '<div class="vehicle-info-card" style="opacity:0.85; border-left-color:#10b981;">' +
                '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">' +
                    '<div class="vehicle-info-plate">' + escapeHtml(v.plate_number) + '</div>' +
                    dirBadge +
                '</div>' +
                '<div class="vehicle-info-detail">👤 ' + escapeHtml(v.driver_name || '—') + '</div>' +
                '<div class="vehicle-info-detail">🕐 Exit: ' + exitTime + '</div>' +
                '<div style="display:grid; grid-template-columns:1fr 1fr 1fr; gap:8px; margin-top:10px; padding:10px; background:rgba(16,185,129,0.08); border-radius:8px;">' +
                    '<div>' +
                        '<div style="font-size:9px; color:#8892b0; letter-spacing:1px; text-transform:uppercase;">Entry</div>' +
                        '<div style="font-size:13px; color:#00c6ff; font-weight:700; font-family:\'Courier New\',monospace;">' + formatNumber(v.entry_weight_kg) + '</div>' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-size:9px; color:#8892b0; letter-spacing:1px; text-transform:uppercase;">Exit</div>' +
                        '<div style="font-size:13px; color:#00c6ff; font-weight:700; font-family:\'Courier New\',monospace;">' + formatNumber(v.exit_weight_kg) + '</div>' +
                    '</div>' +
                    '<div>' +
                        '<div style="font-size:9px; color:#8892b0; letter-spacing:1px; text-transform:uppercase;">Cargo</div>' +
                        '<div style="font-size:13px; color:#f0d060; font-weight:800; font-family:\'Courier New\',monospace;">' + formatNumber(v.net_weight_kg) + '</div>' +
                    '</div>' +
                '</div>' +
            '</div>';
    }

    container.innerHTML = html;
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

function formatNumber(n) {
    if (n === null || n === undefined || n === '') return '—';
    var num = parseFloat(n);
    if (isNaN(num)) return '—';
    return num.toLocaleString('en-KE', { maximumFractionDigits: 0 });
}

function escapeHtml(text) {
    if (!text) return '';
    var div = document.createElement('div');
    div.textContent = text;
    return div.innerHTML;
}

// ============================================================
// EXIT MODAL
// ============================================================
function openExitModal(vehicleJson) {
    var v;
    try {
        v = JSON.parse(vehicleJson);
    } catch (e) {
        v = vehicleJson;
    }

    currentVehicle = v;

    document.getElementById('modalPlate').textContent = v.plate_number || '—';
    document.getElementById('modalDriver').textContent = '👤 ' + (v.driver_name || '—');
    document.getElementById('modalPurpose').textContent = '📋 ' + (v.purpose || '—');
    document.getElementById('modalEntryWeight').value = formatNumber(v.entry_weight_kg) + ' KG';
    document.getElementById('modalExitWeight').value = '';

    var exitCommentEl = document.getElementById('modalExitComment');
    if (exitCommentEl) exitCommentEl.value = '';

    document.getElementById('modalNotes').value = '';

    resetComparison();

    document.getElementById('exitModal').classList.add('active');
}

function closeExitModal() {
    document.getElementById('exitModal').classList.remove('active');
    currentVehicle = null;
}

function resetComparison() {
    var el = document.getElementById('weightComparison');
    el.className = 'weight-comparison';
    el.innerHTML = '<div class="comparison-placeholder">Enter loaded weight to compute cargo weight</div>';
}

// ============================================================
// LIVE CARGO WEIGHT COMPUTATION (neutral, no alerts)
// ============================================================
document.addEventListener('DOMContentLoaded', function() {
    var exitInput = document.getElementById('modalExitWeight');
    if (!exitInput) return;

    exitInput.addEventListener('input', function() {
        var entryWeight = parseFloat(
            document.getElementById('modalEntryWeight').value.replace(/[^0-9.-]/g, '')
        );
        var exitWeight = parseFloat(this.value);

        if (!currentVehicle) return;

        if (isNaN(exitWeight) || exitWeight <= 0) {
            resetComparison();
            return;
        }

        var cargoWeight = Math.abs(exitWeight - entryWeight);
        var direction = 'other';
        if (exitWeight > entryWeight)      direction = 'outbound';
        else if (exitWeight < entryWeight) direction = 'inbound';

        var dirText = direction === 'inbound'  ? 'INBOUND (truck unloaded)'
                    : direction === 'outbound' ? 'OUTBOUND (truck loaded)'
                    : 'NO CARGO CHANGE';

        var el = document.getElementById('weightComparison');
        el.className = 'weight-comparison';
        el.innerHTML =
            '<div style="text-align:center; padding:14px; background:rgba(212,175,55,0.12); border:2px solid #d4af37; border-radius:10px;">' +
                '<div style="font-size:11px; color:#d4af37; letter-spacing:2px; font-weight:800; text-transform:uppercase; margin-bottom:6px;">Cargo Weight</div>' +
                '<div style="font-size:26px; color:#f0d060; font-family:\'Courier New\',monospace; font-weight:900; letter-spacing:2px;">' +
                    formatNumber(cargoWeight) + ' KG' +
                '</div>' +
                '<div style="font-size:11px; color:#8892b0; margin-top:6px;">' + dirText + '</div>' +
            '</div>';
    });
});

// ============================================================
// SUBMIT EXIT — direct POST when online, queue only when offline
// ============================================================
function submitExit(shouldFlag) {
    if (!currentVehicle) {
        showToast('No vehicle selected', 'error');
        return;
    }

    var exitWeight = parseFloat(document.getElementById('modalExitWeight').value);
    var notes = document.getElementById('modalNotes').value.trim();
    var exitCommentEl = document.getElementById('modalExitComment');
    var exitComment = exitCommentEl ? exitCommentEl.value.trim() : '';

    if (!exitWeight || exitWeight <= 0) {
        showToast('Enter valid loaded weight', 'error');
        return;
    }

    if (shouldFlag && !notes) {
        showToast('Please add notes before flagging', 'error');
        return;
    }

    var confirmMsg = shouldFlag
        ? 'Flag this vehicle for inspection?'
        : 'Authorize this exit?';

    if (!confirm(confirmMsg)) return;

    showLoading(shouldFlag ? 'Flagging vehicle...' : 'Recording exit...');

    var exitData = {
        log_id: currentVehicle.id,
        exit_weight: exitWeight,
        exit_comment: exitComment,
        notes: notes,
        action: shouldFlag ? 'flag' : 'authorize',
        sync_hash: 'exit-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9)
    };

    // Decide: direct POST or queue?
    var online = (typeof RBOffline !== 'undefined')
        ? RBOffline.isOnline()
        : navigator.onLine;

    if (online) {
        // Direct POST — guaranteed to hit the server
        RBApi.processVehicleExit(
            exitData.log_id,
            exitData.exit_weight,
            exitData.exit_comment
        )
        .then(function () {
            hideLoading();
            showToast(shouldFlag ? '⚠️ Vehicle flagged' : '✅ Exit authorized',
                      shouldFlag ? 'warning' : 'success');
            if (navigator.vibrate) navigator.vibrate(shouldFlag ? [100, 50, 100] : 200);
            closeExitModal();
            setTimeout(loadVehiclesInside, 400);
        })
        .catch(function (err) {
            hideLoading();
            // Network error? Fall back to queue
            var isNetErr = !err
                        || err.code === 'network_error'
                        || err.code === 'timeout'
                        || err.code === 'no_response'
                        || err.httpStatus === 0;
            if (isNetErr) {
                OfflineSync.queueRecord('vehicle_exit', exitData);
                showToast('💾 Saved locally - will sync when online', 'warning');
                closeExitModal();
                setTimeout(loadVehiclesInside, 400);
            } else {
                showToast('❌ ' + (err.error || 'Exit failed'), 'error');
            }
        });
    } else {
        // Truly offline — queue
        OfflineSync.queueRecord('vehicle_exit', exitData);
        hideLoading();
        showToast('💾 Saved locally - will sync when online', 'warning');
        closeExitModal();
        setTimeout(loadVehiclesInside, 400);
    }
}

// ============================================================
// HELPERS
// ============================================================
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

    loadVehiclesInside();

    // Auto-refresh every 30 seconds
    setInterval(function() {
        if (!document.hidden && !document.getElementById('exitModal').classList.contains('active')) {
            loadVehiclesInside();
        }
    }, 30000);
});
