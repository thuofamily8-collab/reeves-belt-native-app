/**
 * ============================================================
 * SHIFT HANDOVER / GUARD CLOCK-IN — Controller
 * ============================================================
 * Wired to the new /guards/* endpoints:
 *   - /guards/roster.php       — the 20-guard roster
 *   - /guards/clockin.php      — record attendance
 *   - /guards/clockout.php     — close attendance
 *   - /guards/set-pin.php      — set a guard's PIN (supervisor only)
 *
 * Concepts:
 *   - The phone is bound to one terminal (guard_terminals row)
 *   - The supervisor unlocks the phone (device holder)
 *   - Guards identify themselves via PIN (face/biometric later)
 *   - On-duty status is driven by hr_attendance, not the device holder
 */

var RBShiftHandover = (function () {

    // ---- State ----
    var _terminalId   = null;
    var _terminalInfo = null;   // { post_id, post_name, client_tenant_id, client_name }
    var _roster       = [];     // array of guards from /guards/roster.php
    var _currentTab   = 'clockin';
    var _pending      = null;   // { type, guard_id, guard_name }
    var _currentUser  = null;

    // ---- Helpers ----
    function $(id) { return document.getElementById(id); }

    function esc(t) {
        if (!t) return '';
        var d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }

    function showLoading(text) {
        var el = $('loadingText'), o = $('loadingOverlay');
        if (el) el.textContent = text || 'Loading...';
        if (o) o.classList.add('show');
    }

    function hideLoading() {
        var o = $('loadingOverlay');
        if (o) o.classList.remove('show');
    }

    function showToast(msg, type) {
        if (typeof RBApp !== 'undefined' && RBApp.showToast) {
            RBApp.showToast(msg, type);
        } else {
            console.log('[toast]', type || 'info', msg);
        }
    }

    function fmtElapsed(sec) {
        if (sec == null) return '—';
        var h = Math.floor(sec / 3600);
        var m = Math.floor((sec % 3600) / 60);
        return h + 'h ' + m + 'm';
    }

    function currentUser() {
        if (_currentUser) return _currentUser;
        _currentUser = (typeof RBAuth !== 'undefined' && RBAuth.getCurrentUser)
            ? RBAuth.getCurrentUser()
            : null;
        return _currentUser;
    }

    // ---- Terminal resolution ----
    function resolveTerminal() {
        // Read from localStorage (set at terminal-bind.html)
        var id   = parseInt(localStorage.getItem('rb_terminal_id') || '0', 10);
        var name = localStorage.getItem('rb_terminal_name') || '';
        var postId   = parseInt(localStorage.getItem('rb_terminal_post_id') || '0', 10);
        var postName = localStorage.getItem('rb_terminal_post_name') || '';
        var clientId   = parseInt(localStorage.getItem('rb_terminal_client_id') || '0', 10);
        var clientName = localStorage.getItem('rb_terminal_client_name') || '';

        if (!id) return null;

        return {
            id: id,
            name: name,
            post_id: postId,
            post_name: postName,
            client_tenant_id: clientId,
            client_name: clientName
        };
    }

    function redirectToBind() {
        showToast('This phone is not bound yet', 'warning');
        setTimeout(function() {
            window.location.href = 'terminal-bind.html';
        }, 600);
    }

    // ---- Init ----
    function init() {
        if (!RBAuth.requireLogin()) return;

        _terminalInfo = resolveTerminal();
        if (!_terminalInfo) {
            redirectToBind();
            return;
        }
        _terminalId = _terminalInfo.id;

        // Header
        var titleEl = $('shHeaderTitle');
        if (titleEl) titleEl.textContent = _terminalInfo.post_name || 'Guard Clock-In';
        var siteEl = $('shHeaderSite');
        if (siteEl) siteEl.textContent = _terminalInfo.client_name || '';

        switchTab('clockin');
        loadRoster();

        // Poll every 15s while visible
        setInterval(function() {
            if (!document.hidden) loadRoster(true);
        }, 15000);
    }

    // ---- Data load ----
    function loadRoster(silent) {
        if (!silent) showLoading('Loading roster...');

        return RBApi.getGuardRoster(_terminalId)
            .then(function(res) {
                if (!silent) hideLoading();
                var data = (res && res.data) ? res.data : res;
                _roster = (data && data.guards) || [];
                render();
            })
            .catch(function(err) {
                if (!silent) hideLoading();
                showToast('Failed to load roster: ' + ((err && err.error) || 'network error'), 'error');
            });
    }

    // ---- Tabs ----
    function switchTab(tab) {
        _currentTab = tab;
        ['clockin', 'onduty', 'device'].forEach(function(t) {
            var el = $('tab' + t.charAt(0).toUpperCase() + t.slice(1));
            if (el) el.classList.toggle('active', t === tab);
        });
        render();
    }

    // ---- Render ----
    function render() {
        var container = $('shContent');
        if (!container) return;

        var onDuty  = _roster.filter(function(g) { return g.live_status === 'on_duty'; });
        var pending = _roster.filter(function(g) { return g.live_status === 'pending'; });

        // Device banner — holder is the current supervisor (device holder
        // concept is separate from on-duty guards; on the shared terminal
        // the phone itself is bound to the post and always "held" by
        // whoever is logged in).
        var u = currentUser();
        var bannerEl = $('shBanner');
        var bannerNameEl = $('shBannerName');
        if (bannerEl && bannerNameEl) {
            if (u) {
                bannerEl.className = 'sh-device-banner';
                bannerNameEl.textContent = u.full_name || u.username || 'Supervisor';
                bannerNameEl.style.color = '#10b981';
            } else {
                bannerEl.className = 'sh-device-banner no-holder';
                bannerNameEl.textContent = 'Not signed in';
                bannerNameEl.style.color = '#f59e0b';
            }
        }

        var html = '';

        if (_currentTab === 'clockin') {
            html += '<div class="sh-section-label">Roster — ' + _roster.length + ' guards</div>';

            // Pending first (guards not yet clocked in)
            var notYet = _roster.filter(function(g) { return g.live_status === 'pending'; });
            var already = _roster.filter(function(g) { return g.live_status === 'on_duty' || g.live_status === 'clocked_out'; });

            if (notYet.length === 0) {
                html += '<div class="sh-empty">✅ All ' + _roster.length + ' guards have clocked in</div>';
            } else {
                notYet.forEach(function(g) { html += renderGuardCard(g, 'clockin'); });
            }

            if (already.length > 0) {
                html += '<div class="sh-section-label" style="margin-top:20px;">Already On Duty (' + already.length + ')</div>';
                already.forEach(function(g) { html += renderGuardCard(g, 'clockin'); });
            }

            // Set-PIN prompt if any guard has no PIN
            var noPin = _roster.filter(function(g) { return !g.has_pin; });
            if (noPin.length > 0) {
                html += '<div class="sh-setpin-prompt">' +
                    '⚠️ <strong>' + noPin.length + ' guard' + (noPin.length > 1 ? 's' : '') + '</strong> ' +
                    'have no PIN set yet. Tap their name and choose "Set PIN" first.' +
                    '</div>';
            }

        } else if (_currentTab === 'onduty') {
            if (onDuty.length === 0) {
                html += '<div class="sh-empty">No guards on duty yet</div>';
            } else {
                html += '<div class="sh-section-label">On Duty — ' + onDuty.length + '</div>';
                onDuty.forEach(function(g) { html += renderGuardCard(g, 'onduty'); });
            }

        } else if (_currentTab === 'device') {
            html += '<div class="sh-section-label">Terminal</div>';
            html += '<div class="sh-guard-card" style="border-left-color:#00c6ff;">' +
                '<div class="sh-avatar" style="background:linear-gradient(145deg,#00c6ff,#0072ff);">📱</div>' +
                '<div class="sh-guard-info">' +
                    '<div class="sh-guard-name">' + esc(_terminalInfo.name) + '</div>' +
                    '<div class="sh-guard-meta">' + esc(_terminalInfo.post_name) + ' · ' + esc(_terminalInfo.client_name) + '</div>' +
                '</div>' +
            '</div>';

            html += '<div class="sh-section-label" style="margin-top:20px;">Supervisor</div>';
            if (u) {
                html += '<div class="sh-guard-card">' +
                    '<div class="sh-avatar">' + esc((u.full_name || 'S').charAt(0).toUpperCase()) + '</div>' +
                    '<div class="sh-guard-info">' +
                        '<div class="sh-guard-name">' + esc(u.full_name || u.username) + '</div>' +
                        '<div class="sh-guard-meta">' + esc(u.role_display || u.role || '') + '</div>' +
                    '</div>' +
                '</div>';
            }

            html += '<div class="sh-section-label" style="margin-top:20px;">Actions</div>';
            html += '<button class="action-btn blue" onclick="RBShiftHandover.showSupervisorMenu()" style="width:100%; margin-bottom:10px;">☰ Supervisor Menu</button>';
            html += '<button class="action-btn" style="width:100%; background:rgba(239,68,68,0.15); color:#ef4444; border:1px solid #ef4444; box-shadow:none;" onclick="RBShiftHandover.unbindTerminal()">Unbind This Phone</button>';
        }

        container.innerHTML = html;
    }

    function renderGuardCard(g, mode) {
        var initial = (g.full_name || 'G').charAt(0).toUpperCase();
        var postLabel = g.post_name ? esc(g.post_name) : '—';
        var live = g.live_status === 'on_duty';

        var statusBadge = '';
        var metaLine = '';
        var actionBtn = '';

        if (mode === 'clockin' || mode === 'onduty') {
            if (live) {
                statusBadge = '<span class="sh-status-badge live">● On Duty</span>';
                metaLine = '<span class="sh-post-badge">' + postLabel + '</span> ' +
                           statusBadge + ' · ' + esc(g.first_in_at || '');
                actionBtn = '<button class="sh-btn sh-btn-end" onclick="RBShiftHandover.openClockOut(' +
                    g.guard_id + ')">End</button>';
            } else {
                statusBadge = '<span class="sh-status-badge pending">○ Pending</span>';
                metaLine = '<span class="sh-post-badge">' + postLabel + '</span> ' + statusBadge;
                if (g.has_pin) {
                    actionBtn = '<button class="sh-btn sh-btn-start" onclick="RBShiftHandover.openClockIn(' +
                        g.guard_id + ')">Start</button>';
                } else {
                    actionBtn = '<button class="sh-btn sh-btn-start" style="background:linear-gradient(145deg,#f59e0b,#d97706);box-shadow:0 3px 0 #b45309;" onclick="RBShiftHandover.openSetPin(' +
                        g.guard_id + ')">Set PIN</button>';
                }
            }
        }

        return '<div class="sh-guard-card' + (live ? '' : ' off') + '">' +
            '<div class="sh-avatar">' + initial + '</div>' +
            '<div class="sh-guard-info">' +
                '<div class="sh-guard-name">' + esc(g.full_name) + '</div>' +
                '<div class="sh-guard-meta">' + metaLine + '</div>' +
            '</div>' +
            actionBtn +
        '</div>';
    }

    // ---- PIN MODAL ----
    function showPinModal(title, target) {
        var t = $('shPinTitle'), g = $('shPinTarget'),
            i = $('shPinInput'), e = $('shPinError');

        if (t) t.textContent = title;
        if (g) g.textContent = target || '';
        if (i) { i.value = ''; setTimeout(function() { i.focus(); }, 250); }
        if (e) { e.textContent = ''; e.style.display = 'none'; }

        $('shPinModal').classList.add('show');
    }

    function closePinModal() {
        var m = $('shPinModal');
        if (m) m.classList.remove('show');
        _pending = null;
    }

    function showPinError(msg) {
        var el = $('shPinError');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    }

    function confirmPin() {
        if (!_pending) return;

        var pinEl = $('shPinInput');
        var pin = (pinEl ? pinEl.value : '').trim();
        if (!pin) { showPinError('Enter PIN'); return; }

        var p = _pending;

        showLoading(p.type === 'set_pin' ? 'Setting PIN...' : 'Processing...');

        if (p.type === 'clock_in') {
            RBApi.guardClockIn({
                terminal_id: _terminalId,
                guard_id:    p.guard_id,
                method:      'pin',
                pin:         pin
            })
            .then(function(res) {
                hideLoading();
                closePinModal();
                if (navigator.vibrate) navigator.vibrate(100);
                showToast('✅ ' + p.guard_name + ' clocked in', 'success');
                setTimeout(function() { loadRoster(true); },
