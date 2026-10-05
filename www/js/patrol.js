/**
 * Patrol Scan — DIAGNOSTIC VERSION
 * Displays errors on-screen for debugging without DevTools.
 */

var RBPatrolScan = (function() {

    var _terminalId = null;
    var _points     = [];

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

    function debugOnScreen(title, detail) {
        var listEl = $('patrolCheckpointList');
        if (listEl) {
            listEl.innerHTML =
                '<div style="padding:20px;color:#ef4444;font-size:13px;line-height:1.6;font-family:monospace;word-break:break-word;">' +
                '<strong>⚠ DEBUG:</strong><br>' + esc(title) + '<br><br>' +
                '<span style="color:#fbbf24;">' + esc(detail) + '</span>' +
                '</div>';
        }
    }

    function init() {
        // ---- Debug: log what we have ----
        var step = 'init-start';
        try {
            if (!RBAuth || !RBAuth.requireLogin) {
                debugOnScreen('Auth module missing', 'RBAuth.requireLogin is not a function');
                return;
            }
            if (!RBAuth.requireLogin()) {
                debugOnScreen('Not logged in', 'Auth.requireLogin() returned false');
                return;
            }
            step = 'after-auth';

            var tidRaw = localStorage.getItem('rb_terminal_id');
            var tid = parseInt(tidRaw || '0', 10);
            if (!tid) {
                debugOnScreen('Terminal not bound',
                    'localStorage.rb_terminal_id = ' + JSON.stringify(tidRaw) +
                    '\n\nGo back and re-bind this phone.');
                return;
            }
            _terminalId = tid;
            step = 'terminal-ok:' + _terminalId;

            // Check RBApi method exists
            if (!RBApi || typeof RBApi.getPatrolPoints !== 'function') {
                debugOnScreen('RBApi.getPatrolPoints MISSING',
                    'This APK has an old api.js that does not include getPatrolPoints.\n\n' +
                    'Rebuild the APK from a repo that has the updated api.js.');
                return;
            }
            step = 'rbapi-ok';

            // Show we got this far
            var listEl = $('patrolCheckpointList');
            if (listEl) {
                listEl.innerHTML =
                    '<div style="padding:16px;color:#fbbf24;font-size:12px;font-family:monospace;">' +
                    'Reached step: ' + esc(step) + '<br>' +
                    'Terminal: ' + esc(_terminalId) + '<br>' +
                    'Calling getPatrolPoints()...' +
                    '</div>';
            }

            // Actually load
            loadPoints();

            setInterval(function() {
                if (!document.hidden) loadPoints(true);
            }, 20000);

        } catch (e) {
            debugOnScreen('Init crashed at: ' + step,
                (e && (e.message || e.toString())) || 'unknown error');
        }
    }

    function loadPoints(silent) {
        var listEl = $('patrolCheckpointList');

        return RBApi.getPatrolPoints()
            .then(function(res) {
                // Log the raw response on screen
                var raw = JSON.stringify(res).substring(0, 400);

                var data = (res && res.data) ? res.data : res;
                if (data && data.data) data = data.data;
                _points = (data && data.points) || [];

                if (_points.length === 0) {
                    if (listEl) {
                        listEl.innerHTML =
                            '<div style="padding:20px;color:#fbbf24;font-size:12px;font-family:monospace;word-break:break-word;">' +
                            '<strong>API responded but 0 points found</strong><br><br>' +
                            'Response starts with:<br>' + esc(raw) +
                            '</div>';
                    }
                    return;
                }

                renderPoints();
            })
            .catch(function(err) {
                var errMsg = '';
                try {
                    errMsg = JSON.stringify(err, null, 2).substring(0, 500);
                } catch (e) {
                    errMsg = String(err);
                }
                if (listEl) {
                    listEl.innerHTML =
                        '<div style="padding:20px;color:#ef4444;font-size:12px;font-family:monospace;word-break:break-word;">' +
                        '<strong>⚠ API call FAILED</strong><br><br>' +
                        'Error:<br>' + esc(errMsg) +
                        '</div>';
                }
            });
    }

    function renderPoints() {
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
        if (remainEl) remainEl.textContent = Math.max(0, total - scanned);

        var listEl = $('patrolCheckpointList');
        if (listEl) {
            var html = '';
            _points.forEach(function(p) {
                var done = p.scans_today > 0;
                html +=
                    '<div style="display:flex;align-items:center;gap:12px;padding:12px 14px;margin-bottom:8px;background:linear-gradient(145deg,#1f1f33,#141424);border-left:4px solid ' + (done ? '#10b981' : '#4b5563') + ';border-radius:10px;">' +
                      '<div style="font-size:22px;">' + (done ? '✅' : '⚪') + '</div>' +
                      '<div style="flex:1;min-width:0;">' +
                        '<div style="font-size:14px;font-weight:700;color:#fff;">' + esc(p.name) + '</div>' +
                        '<div style="font-size:11px;color:#8892b0;margin-top:2px;">' + esc(p.code) + '</div>' +
                      '</div>' +
                    '</div>';
            });
            listEl.innerHTML = html;
        }

        var sel = $('manualCheckpoint');
        if (sel) {
            var opts = ['<option value="">-- Select Checkpoint --</option>'];
            _points.forEach(function(p) {
                opts.push('<option value="' + esc(p.code) + '">' + esc(p.code + ' — ' + p.name) + '</option>');
            });
            sel.innerHTML = opts.join('');
        }
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

    function onQRScanned(qrText) {
        var code = String(qrText || '').trim();
        if (code.indexOf('RB-POST:') === 0) code = code.substring(8);
        if (!code) return;
        var listEl = $('patrolCheckpointList');
        if (listEl) {
            listEl.innerHTML = '<div style="padding:20px;color:#10b981;font-size:14px;">✅ Scanned: ' + esc(code) + '</div>';
        }
    }

    function submitManualScan() {
        var sel = $('manualCheckpoint');
        if (!sel || !sel.value) {
            showToast('Select a checkpoint first', 'warning');
            return;
        }
        var listEl = $('patrolCheckpointList');
        if (listEl) {
            listEl.innerHTML = '<div style="padding:20px;color:#10b981;font-size:14px;">✅ Manual: ' + esc(sel.value) + '</div>';
        }
    }

    return {
        init:             init,
        loadPoints:       loadPoints,
        onQRScanned:      onQRScanned,
        submitManualScan: submitManualScan
    };
})();
