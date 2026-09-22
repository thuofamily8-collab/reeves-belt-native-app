/**
 * ============================================================
 * REEVES BELT APP - APP LOGIC
 * ============================================================
 * SPRINT 1:
 *   startNetworkMonitor() now defers to RBOffline when available.
 *   Legacy inline behavior retained as fallback for pages that
 *   don't load offline.js.
 * ============================================================
 */

var RBApp = (function() {

    // ============================================================
    // TOAST NOTIFICATIONS
    // ============================================================
    function showToast(message, type) {
        type = type || 'info';
        var toast = document.createElement('div');
        toast.className = 'toast toast-' + type;
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(function() { toast.classList.add('toast-show'); }, 10);
        setTimeout(function() {
            toast.classList.remove('toast-show');
            setTimeout(function() {
                if (toast.parentNode) document.body.removeChild(toast);
            }, 300);
        }, 2500);
    }

    // ============================================================
    // LOGOUT CONFIRMATION
    // ============================================================
    function confirmLogout() {
        var onShift = (typeof RBShift !== 'undefined' && RBShift.isActive());
        var msg = onShift
            ? 'You are on duty. Logging out will keep your shift active.\n\nContinue?'
            : 'Log out of the app?';

        if (!confirm(msg)) return;

        if (typeof RBAuth !== 'undefined') {
            RBAuth.logout();
        } else {
            localStorage.clear();
            window.location.href = 'login.html';
        }
    }

    // ============================================================
    // DASHBOARD STATS
    // ============================================================
    function loadDashboardStats() {
        RBApi.getVehiclesInside().then(function(res) {
            var el = document.getElementById('statVehicles');
            if (el) el.textContent = res.count || 0;
        }).catch(function() {
            var el = document.getElementById('statVehicles');
            if (el) el.textContent = '--';
        });

        RBApi.getVisitorsInside().then(function(res) {
            var el = document.getElementById('statVisitors');
            if (el) el.textContent = res.count || 0;
        }).catch(function() {
            var el = document.getElementById('statVisitors');
            if (el) el.textContent = '--';
        });
    }

    // ============================================================
    // PENDING DETECTIONS
    // ============================================================
    function loadPendingDetections() {
        RBApi.getPendingDetections().then(function(res) {
            var list = document.getElementById('notificationsList');
            if (!list) return;
            var count = res.count || 0;
            var stat = document.getElementById('statDetections');
            if (stat) stat.textContent = count;

            if (count === 0) {
                list.innerHTML = '<div class="notification-empty">No pending alerts</div>';
                return;
            }

            var html = '';
            var detections = res.detections || [];
            for (var i = 0; i < detections.length; i++) {
                var d = detections[i];
                html += '<div class="notification-item" onclick="RBApp.openDetection(' + d.id + ')">' +
                    '<div class="notification-icon">🚛</div>' +
                    '<div class="notification-info">' +
                        '<div class="notification-plate">' + escapeHtml(d.plate_number) + '</div>' +
                        '<div class="notification-detail">' + escapeHtml(d.vehicle_type || 'Vehicle') + ' • ' + escapeHtml(d.vehicle_model || '') + '</div>' +
                        '<div class="notification-time">' + escapeHtml(d.time_ago || '') + '</div>' +
                    '</div>' +
                    '<div class="notification-arrow">›</div>' +
                '</div>';
            }
            list.innerHTML = html;
        }).catch(function(err) {
            var list = document.getElementById('notificationsList');
            if (!list) return;
            if (err.code === 'unauthorized') {
                list.innerHTML = '<div class="notification-empty">Session expired</div>';
            } else {
                list.innerHTML = '<div class="notification-empty">Offline mode</div>';
            }
        });
    }

    function openDetection(id) {
        localStorage.setItem('rb_detection_id', id);
        showToast('Detection #' + id + ' selected', 'success');
    }

    // ============================================================
    // UTILITY
    // ============================================================
    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function formatNumber(n) {
        if (!n && n !== 0) return '--';
        return parseFloat(n).toLocaleString('en-KE', {
            minimumFractionDigits: 0,
            maximumFractionDigits: 0
        });
    }

    // ============================================================
    // NETWORK MONITOR
    // ============================================================
    function startNetworkMonitor() {
        // Sprint 1: RBOffline now owns network state + the bar.
        // If offline.js loaded RBOffline, defer to it.
        if (typeof RBOffline !== 'undefined') {
            RBOffline.init();
            return;
        }

        // ---- Legacy fallback (for pages that don't load offline.js) ----
        var bar = document.getElementById('networkBar');
        if (!bar) return;

        function updateStatus(online) {
            if (online) {
                bar.className = 'network-bar online show';
                bar.textContent = '● ONLINE';
                setTimeout(function() { bar.classList.remove('show'); }, 2000);
            } else {
                bar.className = 'network-bar offline show';
                bar.textContent = '● OFFLINE — Data will sync later';
            }
        }

        updateStatus(navigator.onLine);
        window.addEventListener('online', function() { updateStatus(true); });
        window.addEventListener('offline', function() { updateStatus(false); });

        if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Network) {
            Capacitor.Plugins.Network.addListener('networkStatusChange', function(status) {
                updateStatus(status.connected);
            });
        }
    }

    function comingSoon(feature) {
        showToast(feature + ' - Coming in next update', 'warning');
        if (navigator.vibrate) navigator.vibrate(30);
    }

    return {
        showToast: showToast,
        confirmLogout: confirmLogout,
        loadDashboardStats: loadDashboardStats,
        loadPendingDetections: loadPendingDetections,
        openDetection: openDetection,
        escapeHtml: escapeHtml,
        formatNumber: formatNumber,
        startNetworkMonitor: startNetworkMonitor,
        comingSoon: comingSoon
    };
})();

function comingSoon(feature) {
    RBApp.comingSoon(feature);
}
