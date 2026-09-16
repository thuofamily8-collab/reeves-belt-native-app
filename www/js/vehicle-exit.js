/**
 * ============================================================
 * VEHICLE EXIT LOGIC
 * ============================================================
 */

var currentVehicle = null;

// ============================================================
// LOAD VEHICLES INSIDE
// ============================================================
function loadVehiclesInside() {
    var container = document.getElementById('vehiclesList');
    container.innerHTML = '<div class="empty-state"><div class="empty-state-icon">🚛</div><p>Loading vehicles...</p></div>';

    RBApi.getVehiclesInside()
        .then(function(res) {
            var vehicles = res.vehicles || res.data || [];
            renderVehicles(vehicles);
        })
        .catch(function(err) {
            console.log('API error, trying offline queue...', err);
            var offlineVehicles = getOfflineQueuedVehicles();
            renderVehicles(offlineVehicles);
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

function renderVehicles(vehicles) {
    var container = document.getElementById('vehiclesList');

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

        html +=
            '<div class="vehicle-info-card" onclick="openExitModal(' + JSON.stringify(JSON.stringify(v)).replace(/"/g, '&quot;') + ')">' +
                '<div class="vehicle-info-plate">' + escapeHtml(v.plate_number) + offlineBadge + '</div>' +
                '<div class="vehicle-info-detail">👤 ' + escapeHtml(v.driver_name || '—') + '</div>' +
                '<div class="vehicle-info-detail">📋 ' + escapeHtml(v.purpose || '—') + '</div>' +
                '<div class="vehicle-info-detail">🕐 Entry: ' + entryTime + '</div>' +
                '<div class="vehicle-info-weight">⚖️ ' + formatNumber(v.entry_weight_kg) + ' KG</div>' +
            '</div>';
    }

    container.innerHTML = html;
}

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
    if (!n && n !== 0) return '—';
    return parseFloat(n).toLocaleString('en-KE', { maximumFractionDigits: 0 });
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
    el.innerHTML = '<div class="comparison-placeholder">Enter exit weight to compare</div>';
}

// ============================================================
// LIVE WEIGHT COMPARISON
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

        if (
