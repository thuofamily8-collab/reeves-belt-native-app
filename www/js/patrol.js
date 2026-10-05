/**
 * ============================================================
 * Patrol Scan — Controller
 * Reads checkpoints from guard_posts (via /patrol/points.php),
 * logs scans to patrol_scans (via /patrol/scan.php).
 *
 * Works with patrol-scan.html
 * ============================================================
 */

var RBPatrolScan = (function() {

    var _terminalId = null;
    var _points     = [];
    var _holder     = null;

    function $(id) { return document.getElementById(id); }

    function esc(t) {
        if (!t) return '';
        var d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }

    function showToast(msg, type) {
        if (typeof RBApp !== 'undefined' && RBApp.showToast) {
            RBApp.showToast(msg, type);
        } else {
            console.log('[patrol]', type || 'info', msg);
        }
    }

    function showLoading(t) {
        var l = $('loadingText'), o = $('loadingOverlay');
        if (l) l.textContent = t || 'Loading...';
        if (o) o.classList.add('show');
    }

    function hideLoading() {
        var o = $('loadingOverlay');
        if (o) o.classList.remove('show');
    }

    // ------------------------------------------------------------
    // Init
    // ------------------------------------------------------------
    function init() {
        if (!RBAuth.requireLogin()) return;

        var tid = parseInt(localStorage.getItem('rb_terminal_id') || '0', 10);
        if (!tid) {
            showToast('This phone is not bound to a terminal', 'warning');
            setTimeout(function() { window.location.href = 'terminal-bind.html'; }, 800);
            return;
        }
        _terminalId = tid;

        loadHolder();
        loadPoints();

        // Refresh every 20s while page is visible
        setInterval(function() {
            if (!document.hidden) {
                loadHolder();
                loadPoints(true);
            }
        }, 20000);
    }

    // ------------------------------------------------------------
    // Holder (which guard is on patrol)
    // ------------------------------------------------------------
    function loadHolder() {
        if (typeof RBApi.getPatrolHolder !== 'function') {
            return Promise.resolve(null);
        }
        return RBApi.getPatrolHolder(_terminalId)
            .then(function(res) {
                var data = (res && res.data) ? res.data : res;
                if (data && data.data) data = data.data;
                _holder = data.current_guard || null;
                renderHolder();
            })
            .catch(function() { /* silent */ });
    }

    function renderHolder() {
        var nameEl = $('patrolHolderName');
        if (!nameEl) return;
        if (_holder) {
            nameEl.textContent = _holder.full_name + ' • since ' + fmtTime(_holder.since);
            nameEl.style.color = '#10b981';
        } else {
            nameEl.textContent = 'No one — tap CHANGE to start a round';
            nameEl.style.color = '#f59e0b';
        }
    }

    // ------------------------------------------------------------
    // Checkpoints
    // ------------------------------------------------------------
    function loadPoints(silent) {
        return RBApi.getPatrolPoints()
            .then(function(res) {
                // Handle flat or wrapped response
                var data = (res && res.data) ? res.data : res;
                if (data && data.data) data = data.data;
                _points = (data && data.points) || [];
                renderPoints();
            })
            .catch(function(err) {
                if (!silent) {
                    showToast('Failed to load checkpoints: ' +
                        ((err && (err.error || err.message)) || 'network error'), 'error');
                }
                var listEl = $('patrolCheckpointList');
                if (listEl) {
                    listEl.innerHTML =
                        '<div style="padding:20px;color:#ef4444;font-size:13px;line-height:1.6;">' +
                        '⚠ Could not load checkpoints.<br>' +
                        'Error: ' + esc((err && (err.error || err.message)) || 'unknown') + '<br><br>' +
                        'Try pulling down to refresh, or close and reopen the app.' +
                        '</div>';
                }
            });
    }

    function renderPoints() {
        var scanned = _points.filter(function(p) { return p.scans_today > 0; }).length;
        var total   = _points.length;
        var pct     = total ? Math.round(100 * scanned / total) : 0;

        // ---- Progress (element IDs match patrol-scan.html) ----
        var pctEl = $('patrolProgress');
        if (pctEl) pctEl.textContent = pct + '%';
        var barEl = $('patrolProgressBar');
        if (barEl) barEl.style.width = pct + '%';
        var scannedEl = $('patrolScanned');
        if (scannedEl) scannedEl.textContent = scanned;
        var totalEl = $('patrolTotal');
        if (totalEl) totalEl.textContent = total;
        var remainEl = $('patrolRemaining');
        if (remainEl) remainEl.textContent = Math.max(0, total - scanned);

        // ---- Checkpoint list ----
        var listEl = $('patrolCheckpointList');
        if (listEl) {
            if (_points.length === 0) {
                listEl.innerHTML = '<div style="padding:20px;color:#a0a8c0;font-size:13px;text-align:center;">No checkpoints configured for this site yet.</div>';
            } else {
                var html = '';
                _points.forEach(function(p) {
                    var done = p.scans_today > 0;
                    html +=
                        '<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;margin-bottom:8px;background:linear-gradient(145deg,#1f1f33,#141424);border-left:4px solid ' + (done ? '#10b981' : '#4b5563') + ';border-radius:10px;' + (done ? '' : 'opacity:0.92;') + '">' +
                          '<div style="font-size:22px;">' + (done ? '✅' : '⚪') + '</div>' +
                          '<div style="flex:1;min-width:0;">' +
                            '<div style="font-size:14px;font-weight:700;color:#fff;">' + esc(p.name) + '</div>' +
                            '<div style="font-size:11px;color:#8892b0;margin-top:2px;">' +
                              esc(p.code) +
                              (done ? ' • last scan ' + fmtTime(p.last_scan_at) : '') +
                            '</div>' +
                          '</div>' +
                        '</div>';
                });
                listEl.innerHTML = html;
            }
        }

        // ---- Manual dropdown ----
        var sel = $('manualCheckpoint');
        if (sel) {
            var current = sel.value;
            var opts = ['<option value="">-- Select Checkpoint --</option>'];
            _points.forEach(function(p) {
                var done = p.scans_today > 0;
                opts.push('<option value="' + esc(p.code) + '">' +
                    esc(p.code + ' — ' + p.name) +
                    (done ? ' ✓' : '') +
                    '</option>');
            });
            sel.innerHTML = opts.join('');
            if (current) sel.value = current;
        }
    }

    // ------------------------------------------------------------
    // Log a scan
    // ------------------------------------------------------------
    function logScan(postCode, notes) {
        if (!postCode) return;

        showLoading('Logging scan...');
        getGPS().then(function(coords) {
            return RBApi.patrolScan({
                post_code:   postCode,
                terminal_id: _terminalId,
                gps_lat:     coords ? coords.lat : null,
                gps_lng:     coords ? coords.lng : null,
                notes:       notes || ''
            });
        })
        .then(function(res) {
            hideLoading();
            var data = (res && res.data) ? res.data : res;
            if (data && data.data) data = data.data;
            if (navigator.vibrate) navigator.vibrate(100);
            showToast('✅ ' + (data.post_name || postCode) + ' scanned', 'success');
            loadPoints(true);
        })
        .catch(function(err) {
            hideLoading();
            showToast((err && err.error) || 'Scan failed', 'error');
        });
    }

    function getGPS() {
        return new Promise(function(resolve) {
            if (!navigator.geolocation) return resolve(null);
            navigator.geolocation.getCurrentPosition(
                function(pos) {
                    resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude });
                },
                function() { resolve(null); },
                { timeout: 5000 }
            );
        });
    }

    // Called by the QR scanner in patrol-scan.html
    function onQRScanned(qrText) {
        var code = String(qrText || '').trim();
        if (code.indexOf('RB-POST:') === 0) code = code.substring(8);
        if (!code) return;
        logScan(code, 'QR scan');
    }

    // Called by the "Log Checkpoint" button
    function submitManualScan() {
        var sel = $('manualCheckpoint');
        if (!sel) return;
        var code = sel.value;
        if (!code) {
            showToast('Select a checkpoint first', 'warning');
            return;
        }
        logScan(code, 'Manual entry');
    }

    function fmtTime(iso) {
        if (!iso) return '—';
        var t = new Date(iso.replace(' ', 'T')).getTime();
        if (isNaN(t)) return '—';
        var diff = Math.floor((Date.now() - t) / 1000);
        if (diff < 60) return diff + 's ago';
        if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
        return Math.floor(diff / 3600) + 'h ago';
    }

    // ------------------------------------------------------------
    // Public API
    // ------------------------------------------------------------
    return {
        init:             init,
        loadPoints:       loadPoints,
        logScan:          logScan,
        onQRScanned:      onQRScanned,
        submitManualScan: submitManualScan
    };
})();
