/**
 * Patrol Scan — reads checkpoints from guard_posts, logs to patrol_scans.
 * Guard checkout flow: guard taps his name + PIN → all his scans tagged.
 */

var RBPatrolScan = (function() {

    var _terminalId = null;
    var _points     = [];
    var _holder     = null;    // current patrol guard

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
            console.log('[patrol]', type, msg);
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

    // ---- Init ----
    function init() {
        if (!RBAuth.requireLogin()) return;

        var tid = parseInt(localStorage.getItem('rb_terminal_id') || '0', 10);
        if (!tid) {
            showToast('This phone is not bound to a terminal', 'warning');
            setTimeout(function() { window.location.href = 'terminal-bind.html'; }, 600);
            return;
        }
        _terminalId = tid;

        loadHolder();
        loadPoints();

        setInterval(function() {
            if (!document.hidden) {
                loadHolder();
                loadPoints(true);
            }
        }, 20000);
    }

    // ---- Holder ----
    function loadHolder() {
        return RBApi.getPatrolHolder(_terminalId)
            .then(function(res) {
                var data = (res && res.data) ? res.data : res;
                _holder = data.current_guard || null;
                renderHolder();
            })
            .catch(function() { /* silent */ });
    }

    function renderHolder() {
        var nameEl = $('patrolHolderName');
        if (!nameEl) return;
        if (_holder) {
            nameEl.textContent = _holder.full_name + ' · since ' + fmtTime(_holder.since);
            nameEl.style.color = '#10b981';
        } else {
            nameEl.textContent = 'No one — tap CHANGE to start a round';
            nameEl.style.color = '#f59e0b';
        }
    }

    function openHolderPicker() {
        // Simplest UX: prompt-based for now, upgrade to a modal later.
        RBApi.getGuardRoster(_terminalId)
            .then(function(res) {
                var data = (res && res.data) ? res.data : res;
                var guards = (data && data.guards) || [];

                var names = guards.map(function(g, i) {
                    return (i + 1) + '. ' + g.full_name + ' (' + g.employee_code + ')';
                }).join('\n');

                var choice = prompt(
                    'Who is taking the patrol phone?\n\n' + names +
                    '\n\nEnter number (1-' + guards.length + '):'
                );
                if (!choice) return;

                var idx = parseInt(choice, 10) - 1;
                if (idx < 0 || idx >= guards.length) return;
                var g = guards[idx];

                var pin = prompt('Enter ' + g.full_name + '\'s PIN:');
                if (!pin) return;

                showLoading('Checking out...');
                RBApi.patrolCheckout({
                    terminal_id: _terminalId,
                    guard_id:    g.guard_id,
                    pin:         pin
                })
                .then(function() {
                    hideLoading();
                    showToast('✅ ' + g.full_name + ' on patrol', 'success');
                    loadHolder();
                })
                .catch(function(err) {
                    hideLoading();
                    showToast((err && err.error) || 'Checkout failed', 'error');
                });
            });
    }

    // ---- Points ----
    function loadPoints(silent) {
        return RBApi.getPatrolPoints()
            .then(function(res) {
                var data = (res && res.data) ? res.data : res;
                _points = (data && data.points) || [];
                renderPoints();
            })
            .catch(function(err) {
                if (!silent) showToast('Failed to load checkpoints', 'error');
            });
    }

    function renderPoints() {
        // Update progress
        var scanned = _points.filter(function(p) { return p.scans_today > 0; }).length;
        var total   = _points.length;
        var pct     = total ? Math.round(100 * scanned / total) : 0;

        var pctEl = $('patrolProgress');
        if (pctEl) pctEl.textContent = pct + '%';
        var barEl = $('patrolProgressBar');
        if (barEl) barEl.style.width = pct + '%';
        var scannedEl = $('patrolScanned');
        if (scannedEl) scannedEl.textContent = scanned;
        var totalEl = $('patrolTotal');
        if (totalEl) totalEl.textContent = total;
        var remainEl = $('patrolRemaining');
        if (remainEl) remainEl.textContent = total - scanned;

        // Update list
        var listEl = $('patrolCheckpointList');
        if (!listEl) return;

        var html = '';
        _points.forEach(function(p) {
            var done = p.scans_today > 0;
            html +=
                '<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;margin-bottom:8px;background:linear-gradient(145deg,#1f1f33,#141424);border-left:4px solid ' + (done ? '#10b981' : '#4b5563') + ';border-radius:10px;' + (done ? '' : 'opacity:0.9;') + '">' +
                  '<div style="font-size:22px;">' + (done ? '✅' : '⚪') + '</div>' +
                  '<div style="flex:1;min-width:0;">' +
                    '<div style="font-size:14px;font-weight:700;color:#fff;">' + esc(p.name) + '</div>' +
                    '<div style="font-size:11px;color:#8892b0;margin-top:2px;">' +
                      esc(p.code) +
                      (done ? ' · last scan ' + fmtTime(p.last_scan_at) : '') +
                    '</div>' +
                  '</div>' +
                '</div>';
        });
        listEl.innerHTML = html;
    }

    // ---- Scan a post ----
    function logScan(postCode, notes) {
        if (!_holder) {
            if (!confirm('No one has checked out the patrol phone. Log scan anyway?')) return;
        }

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
            if (navigator.vibrate) navigator.vibrate(100);
            showToast('✅ ' + data.post_name + ' scanned', 'success');
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
                function(pos) { resolve({ lat: pos.coords.latitude, lng: pos.coords.longitude }); },
                function() { resolve(null); },
                { timeout: 5000 }
            );
        });
    }

    // ---- QR scan entry (called by your existing camera/QR scanner) ----
    function onQRScanned(qrText) {
        // QR format: RB-POST:<post_code>  or  just <post_code>
        var code = String(qrText || '').trim();
        if (code.indexOf('RB-POST:') === 0) code = code.substring(8);

        if (!code) return;
        logScan(code);
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

    return {
        init:             init,
        loadPoints:       loadPoints,
        logScan:          logScan,
        onQRScanned:      onQRScanned,
        openHolderPicker: openHolderPicker
    };
})();
