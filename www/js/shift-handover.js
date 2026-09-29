/**
 * ============================================================
 * SHIFT HANDOVER — Controller (Sprint 4)
 * ============================================================
 * Fingerprint-locked holder flow.
 *
 * Rules:
 *   - Only one guard holds the phone at a time.
 *   - To take the phone: fingerprint prompt.
 *   - To clock a guard in/out: that guard types their own PIN.
 *   - To end your own shift: your own PIN.
 */

var RBShiftHandover = (function () {

    var _posts = [];
    var _onDuty = [];
    var _allStaff = [];
    var _deviceHolder = null;
    var _currentUser = null;
    var _pendingAction = null;

    // ----------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------
    function getCurrentUser() {
        return (typeof RBAuth !== 'undefined' && RBAuth.getCurrentUser)
            ? RBAuth.getCurrentUser()
            : null;
    }

    function escapeHtml(t) {
        if (!t) return '';
        var d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }

    function showLoading(text) {
        var el = document.getElementById('loadingText');
        var o = document.getElementById('loadingOverlay');
        if (el) el.textContent = text || 'Loading...';
        if (o) o.classList.add('show');
    }

    function hideLoading() {
        var o = document.getElementById('loadingOverlay');
        if (o) o.classList.remove('show');
    }

    function showToast(msg, type) {
        if (typeof RBApp !== 'undefined' && RBApp.showToast) {
            RBApp.showToast(msg, type);
        } else {
            alert(msg);
        }
    }

    function formatElapsed(seconds) {
        if (!seconds && seconds !== 0) return '—';
        var h = Math.floor(seconds / 3600);
        var m = Math.floor((seconds % 3600) / 60);
        return h + 'h ' + m + 'm';
    }

    // ----------------------------------------------------------
    // Load
    // ----------------------------------------------------------
    function init() {
        if (!RBAuth.requireLogin()) return;
        _currentUser = getCurrentUser();
        loadData();

        setInterval(function () {
            if (!document.hidden) loadData(true);
        }, 30000);
    }

    function loadData(silent) {
        if (!silent) showLoading('Loading shift data...');

        RBApi.getChangeoverData()
            .then(function (res) {
                hideLoading();
                var data = (res && res.data) ? res.data : res;
                _posts = data.posts || [];
                _onDuty = data.on_duty || [];
                _allStaff = data.all_staff || [];
                _deviceHolder = data.device_holder || null;
                render();
            })
            .catch(function (err) {
                hideLoading();
                showToast('Failed to load: ' + ((err && err.error) || 'network error'), 'error');
            });
    }

    // ----------------------------------------------------------
    // Render
    // ----------------------------------------------------------
    function render() {
        // Device banner
        var banner = document.getElementById('shDeviceBanner');
        var holderEl = document.getElementById('shDeviceHolder');
        if (banner && holderEl) {
            if (_deviceHolder) {
                banner.className = 'sh-device-banner';
                holderEl.style.color = '#10b981';
                holderEl.textContent = _deviceHolder.full_name +
                    (_deviceHolder.post ? ' · ' + _deviceHolder.post : '');
            } else {
                banner.className = 'sh-device-banner no-holder';
                holderEl.style.color = '#f59e0b';
                holderEl.textContent = 'No one holds the device';
            }
        }

        var container = document.getElementById('shContent');
        if (!container) return;

        var html = '';

        // ---- ON DUTY ----
        html += '<div class="sh-section-label">On Duty (' + _onDuty.length + ')</div>';
        if (_onDuty.length === 0) {
            html += '<div class="sh-empty">No one is currently on duty</div>';
        } else {
            for (var i = 0; i < _onDuty.length; i++) {
                var g = _onDuty[i];
                var isMe = _currentUser && (_currentUser.id === g.user_id);
                var postLabel = g.post ? escapeHtml(g.post) : '—';
                var heldBadge = g.is_device_holder
                    ? ' <span style="color:#10b981;font-weight:800;font-size:11px;">📱 HOLDING</span>'
                    : '';
                var meBadge = isMe
                    ? ' <span style="color:#d4af37;font-weight:800;font-size:11px;">· YOU</span>'
                    : '';

                html +=
                    '<div class="sh-guard-card">' +
                        '<div class="sh-avatar">' + escapeHtml((g.full_name || 'G').charAt(0).toUpperCase()) + '</div>' +
                        '<div class="sh-guard-info">' +
                            '<div class="sh-guard-name">' + escapeHtml(g.full_name) + meBadge + heldBadge + '</div>' +
                            '<div class="sh-guard-meta">' +
                                '<span class="sh-post-badge">' + postLabel + '</span>' +
                                ' · ' + formatElapsed(g.elapsed_seconds) +
                            '</div>' +
                        '</div>' +
                        (isMe
                            ? '<button class="sh-btn sh-btn-end" onclick="RBShiftHandover.clockOut(' + g.session_id + ')">End</button>'
                            : '') +
                    '</div>';
            }
        }

        // ---- CLOCK IN ----
        var onDutyIds = {};
        for (var k = 0; k < _onDuty.length; k++) onDutyIds[_onDuty[k].user_id] = true;
        var notClockedIn = _allStaff.filter(function (s) { return !onDutyIds[s.id]; });

        html += '<div class="sh-section-label">Clock In (' + notClockedIn.length + ')</div>';
        if (notClockedIn.length === 0) {
            html += '<div class="sh-empty">All staff have clocked in</div>';
        } else {
            for (var j = 0; j < notClockedIn.length; j++) {
                var s = notClockedIn[j];
                html +=
                    '<div class="sh-guard-card off">' +
                        '<div class="sh-avatar" style="background: linear-gradient(145deg,#3a3a4e,#232336);">' + escapeHtml((s.full_name || 'G').charAt(0).toUpperCase()) + '</div>' +
                        '<div class="sh-guard-info">' +
                            '<div class="sh-guard-name">' + escapeHtml(s.full_name) + '</div>' +
                            '<div class="sh-guard-meta">Off duty</div>' +
                        '</div>' +
                        '<button class="sh-btn sh-btn-holder" onclick="RBShiftHandover.openClockIn(' + s.id + ')">Start</button>' +
                    '</div>';
            }
        }

        // ---- DEVICE ----
        var iAmHolder = _deviceHolder && _currentUser && (_deviceHolder.user_id === _currentUser.id);
        var iAmOnDuty = _currentUser && onDutyIds[_currentUser.id];

        html += '<div class="sh-section-label">Device</div>';
        if (iAmOnDuty && !iAmHolder) {
            html +=
                '<button class="btn-3d btn-blue btn-full" style="width:100%; padding:16px; font-size:14px;" onclick="RBShiftHandover.requestDeviceTake()">' +
                    '📱 I\'m Taking the Phone Now' +
                '</button>';
        } else if (iAmHolder) {
            html +=
                '<div style="text-align:center; padding:14px; background:rgba(16,185,129,0.15); border:2px solid #10b981; border-radius:12px; margin-bottom:10px; color:#10b981; font-weight:800; letter-spacing:1px; font-size:13px;">' +
                    '📱 YOU ARE HOLDING THE DEVICE' +
                '</div>' +
                '<button class="btn-3d btn-red btn-full" style="width:100%; padding:14px; font-size:13px;" onclick="RBShiftHandover.requestDeviceRelease()">' +
                    '⏏️ Release the Device' +
                '</button>';
        } else {
            html +=
                '<div style="text-align:center; padding:14px; background:rgba(107,114,128,0.15); border:1px solid #4b5563; border-radius:12px; color:#8892b0; font-size:12px;">' +
                    'You must be on duty to take or release the device' +
                '</div>';
        }

        container.innerHTML = html;
    }

    // ----------------------------------------------------------
    // PIN MODAL
    // ----------------------------------------------------------
    function showPinModal(title, target) {
        var titleEl = document.getElementById('shPinTitle');
        var targetEl = document.getElementById('shPinTarget');
        var inputEl = document.getElementById('shPinInput');
        var errEl = document.getElementById('shPinError');

        if (titleEl) titleEl.textContent = title;
        if (targetEl) targetEl.textContent = target || '';
        if (inputEl) { inputEl.value = ''; setTimeout(function () { inputEl.focus(); }, 200); }
        if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }

        document.getElementById('shPinModal').classList.add('show');
    }

    function closePinModal() {
        var m = document.getElementById('shPinModal');
        if (m) m.classList.remove('show');
        _pendingAction = null;
    }

    function showPinError(msg) {
        var el = document.getElementById('shPinError');
        if (el) { el.textContent = msg; el.style.display = 'block'; }
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    }

    function confirmPin() {
        if (!_pendingAction) return;

        var pin = (document.getElementById('shPinInput').value || '').trim();
        if (!pin) { showPinError('Enter PIN'); return; }

        var action = _pendingAction;
        var targetUsername = null;
        for (var i = 0; i < _allStaff.length; i++) {
            if (_allStaff[i].id === action.userId) {
                targetUsername = _allStaff[i].username;
                break;
            }
        }
        if (!targetUsername) { showPinError('User not found'); return; }

        showLoading('Verifying...');

        // Step 1: log in as the target user to validate their PIN
        RBApi.login(targetUsername, pin, {})
            .then(function (loginRes) {
                // Step 2: capture the target's token in the vault, but keep
                // the current holder as the ACTIVE profile.
                var previousActiveId = (typeof RBVault !== 'undefined') ? RBVault.getActiveId() : null;

                if (typeof RBAuth !== 'undefined' && RBAuth.addProfileFromLogin) {
                    RBAuth.addProfileFromLogin(loginRes);
                }
                // Restore the holder's active profile so subsequent calls
                // use the holder's token (the server checks acting_as_user_id).
                if (previousActiveId && typeof RBVault !== 'undefined') {
                    RBVault.setActiveId(previousActiveId);
                }

                // Step 3: perform the pending action using the holder's token
                if (action.type === 'clock_in') {
                    return RBApi.shiftClockInAs(action.userId, action.post_code);
                } else if (action.type === 'clock_out') {
                    return RBApi.shiftClockOutAs(action.userId, action.sessionId, 'holder_action');
                } else {
                    throw { error: 'Unknown action', code: 'unknown_action' };
                }
            })
            .then(function () {
                hideLoading();
                closePinModal();
                if (navigator.vibrate) navigator.vibrate(100);
                var doneMsg = (action.type === 'clock_in') ? '✅ Shift started' : '✅ Shift ended';
                showToast(doneMsg, 'success');
                setTimeout(function () { loadData(true); }, 400);
            })
            .catch(function (err) {
                hideLoading();
                var msg = (err && err.error) ? err.error : 'Invalid PIN';
                if (err && err.code === 'unauthorized') msg = 'Invalid PIN';
                showPinError(msg);
            });
    }

    // ----------------------------------------------------------
    // PUBLIC ACTIONS
    // ----------------------------------------------------------
    function openClockIn(userId) {
        var name = '';
        for (var i = 0; i < _allStaff.length; i++) {
            if (_allStaff[i].id === userId) { name = _allStaff[i].full_name; break; }
        }
        if (!_posts.length) { showToast('No posts configured', 'error'); return; }

        // Post picker (simple prompt for now)
        var postNames = _posts.map(function (p, i) { return (i + 1) + '. ' + p.post_name; }).join('\n');
        var choice = prompt('Select post for ' + name + ':\n\n' + postNames + '\n\nEnter number (1-' + _posts.length + '):');
        if (choice === null) return;
        var idx = parseInt(choice, 10) - 1;
        if (idx < 0 || idx >= _posts.length) { showToast('Invalid selection', 'error'); return; }

        _pendingAction = {
            type: 'clock_in',
            userId: userId,
            name: name,
            post_code: _posts[idx].post_code
        };
        showPinModal(
            'Enter ' + name + '\'s PIN to Start Shift',
            name + ' · ' + _posts[idx].post_name
        );
    }

    function clockOut(sessionId) {
        // Self clock-out: enter own PIN
        if (!_currentUser) return;
        if (!confirm('End your shift?')) return;

        _pendingAction = {
            type: 'clock_out',
            userId: _currentUser.id,
            sessionId: sessionId,
            name: _currentUser.full_name
        };
        showPinModal('Enter your PIN to End Shift', _currentUser.full_name);
    }

    function requestDeviceTake() {
        if (!confirm('Take the device now? You will be asked to authenticate.')) return;

        showLoading('Authenticating...');

        RBBiometric.verify('Authenticate to take the device')
            .then(function () {
                // Fingerprint OK — call server
                return RBApi.holderTake(_currentUser.id);
            })
            .then(function () {
                hideLoading();
                showToast('✅ Device taken', 'success');
                if (navigator.vibrate) navigator.vibrate(100);
                setTimeout(function () { loadData(true); }, 400);
            })
            .catch(function (err) {
                hideLoading();
                var msg = 'Action failed';
                if (err) {
                    if (err.code === 'userCancel')           msg = 'Cancelled';
                    else if (err.code === 'biometryNotEnrolled') msg = 'No fingerprint enrolled. Set up fingerprint in phone Settings.';
                    else if (err.code === 'biometryNotAvailable') msg = 'Fingerprint not available on this device';
                    else if (err.code === 'passcodeNotSet')  msg = 'Set up device PIN first';
                    else if (err.error)                      msg = err.error;
                    else if (err.message)                    msg = err.message;
                }
                showToast('❌ ' + msg, 'error');
            });
    }

    function requestDeviceRelease() {
        if (!confirm('Release the device? Another guard can then take it.')) return;

        showLoading('Releasing device...');
        RBApi.holderRelease()
            .then(function () {
                hideLoading();
                showToast('✅ Device released', 'success');
                setTimeout(function () { loadData(true); }, 400);
            })
            .catch(function (err) {
                hideLoading();
                showToast('❌ ' + ((err && err.error) || 'network error'), 'error');
            });
    }

    // ----------------------------------------------------------
    return {
        init:                 init,
        loadData:             loadData,
        openClockIn:          openClockIn,
        clockOut:             clockOut,
        requestDeviceTake:    requestDeviceTake,
        requestDeviceRelease: requestDeviceRelease,
        closePinModal:        closePinModal,
        confirmPin:           confirmPin
    };

})();
