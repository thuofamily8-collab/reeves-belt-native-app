/**
 * ============================================================
 * SHIFT HANDOVER — Controller
 * ============================================================
 * Loads posts, on-duty staff, and current device holder.
 * Allows guards to:
 *   - Clock in with a post
 *   - Clock out
 *   - Take the device
 *   - Release the device
 */

var RBShiftHandover = (function () {

    var _posts = [];
    var _onDuty = [];
    var _allStaff = [];
    var _deviceHolder = null;
    var _currentUser = null;

    // Pending action for the PIN modal
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

        // Refresh every 30s while page is open
        setInterval(function () {
            if (!document.hidden) loadData();
        }, 30000);
    }

    function loadData(silent) {
        if (!silent) showLoading('Loading shift data...');

        RBApi.getChangeoverData()
            .then(function (res) {
                hideLoading();
                var data = (res && res.data && res.data) ? res.data : res;
                _posts = data.posts || [];
                _onDuty = data.on_duty || [];
                _allStaff = data.all_staff || [];
                _deviceHolder = data.device_holder || null;
                render();
            })
            .catch(function (err) {
                hideLoading();
                showToast('Failed to load: ' + (err.error || 'network error'), 'error');
            });
    }

    // ----------------------------------------------------------
    // Render
    // ----------------------------------------------------------
    function render() {
        // Device holder banner
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

        // Main content
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

        // ---- CLOCK IN (staff not on duty) ----
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

        // ---- DEVICE ACTION ----
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
    function openPinModal(actionType, targetUserId, targetName, sessionId) {
        _pendingAction = {
            type: actionType,
            userId: targetUserId,
            name: targetName,
            sessionId: sessionId
        };

        var titleEl = document.getElementById('shPinTitle');
        var targetEl = document.getElementById('shPinTarget');
        var inputEl = document.getElementById('shPinInput');
        var errEl = document.getElementById('shPinError');

        if (titleEl) {
            if (actionType === 'clock_in') titleEl.textContent = 'Enter PIN to Start Shift';
            else if (actionType === 'device_take') titleEl.textContent = 'Enter PIN to Take Device';
            else if (actionType === 'device_release') titleEl.textContent = 'Enter PIN to Release';
            else titleEl.textContent = 'Enter PIN';
        }
        if (targetEl) targetEl.textContent = targetName || '';
        if (inputEl) { inputEl.value = ''; setTimeout(function () { inputEl.focus(); }, 200); }
        if (errEl) { errEl.textContent = ''; errEl.style.display = 'none'; }

        document.getElementById('shPinModal').classList.add('show');
    }

    function closePinModal() {
        document.getElementById('shPinModal').classList.remove('show');
        _pendingAction = null;
    }

    function confirmPin() {
        if (!_pendingAction) return;

        var pin = (document.getElementById('shPinInput').value || '').trim();
        if (!pin) {
            showPinError('Enter your PIN');
            return;
        }

        // We log in as this user with the PIN (password) — verify via auth
        var targetUsername = null;
        for (var i = 0; i < _allStaff.length; i++) {
            if (_allStaff[i].id === _pendingAction.userId) {
                targetUsername = _allStaff[i].username;
                break;
            }
        }
        if (!targetUsername) {
            showPinError('User not found');
            return;
        }

        showLoading('Verifying...');

        // Step 1: log in as the target user (this also gets us their token)
        RBApi.login(targetUsername, pin, {})
            .then(function (loginRes) {
                // Step 2: perform the pending action using their token
                var newToken = loginRes.token;
                if (!newToken) throw new Error('No token returned');

                var doAction;
                if (_pendingAction.type === 'clock_in') {
                    doAction = RBApi.shiftClockIn.applyPost(_pendingAction.post_code);
                }

                // Simpler: call the specific endpoint with a custom token
                return performAction(newToken, _pendingAction);
            })
            .then(function () {
                hideLoading();
                closePinModal();
                if (navigator.vibrate) navigator.vibrate(100);
                showToast('✅ ' + successMessage(_pendingAction.type), 'success');
                setTimeout(function () { loadData(); }, 500);
            })
            .catch(function (err) {
                hideLoading();
                showPinError(err && (err.error || err.message) ? (err.error || err.message) : 'Invalid PIN');
            });
    }

    function performAction(token, action) {
        var headers = {
            'Content-Type': 'application/json',
            'Authorization': 'Bearer ' + token,
            'X-Auth-Token': token
        };

        var url = RBApi.getBaseUrl();
        var promise;

        if (action.type === 'clock_in') {
            promise = fetchJSON(url + '/staff/shift-clock-in.php', 'POST', {
                post_code: action.post_code
            }, headers);
        } else if (action.type === 'device_take') {
            promise = fetchJSON(url + '/staff/device-take.php', 'POST', {}, headers);
        } else if (action.type === 'device_release') {
            promise = fetchJSON(url + '/staff/device-release.php', 'POST', {}, headers);
        } else if (action.type === 'clock_out') {
            promise = fetchJSON(url + '/staff/shift-clock-out.php', 'POST', {
                session_id: action.sessionId,
                reason: 'shift_handover'
            }, headers);
        } else {
            return Promise.reject(new Error('Unknown action'));
        }

        return promise.then(function (res) {
            if (!res.success) throw res;
            return res;
        });
    }

    function fetchJSON(url, method, body, headers) {
        return fetch(url, {
            method: method,
            headers: headers,
            body: JSON.stringify(body)
        }).then(function (r) { return r.json(); });
    }

    function successMessage(type) {
        if (type === 'clock_in') return 'Shift started';
        if (type === 'clock_out') return 'Shift ended';
        if (type === 'device_take') return 'Device taken';
        if (type === 'device_release') return 'Device released';
        return 'Done';
    }

    function showPinError(msg) {
        var errEl = document.getElementById('shPinError');
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    }

    // ----------------------------------------------------------
    // PUBLIC ACTIONS
    // ----------------------------------------------------------
    function openClockIn(userId) {
        // Find their full name
        var name = '';
        for (var i = 0; i < _allStaff.length; i++) {
            if (_allStaff[i].id === userId) { name = _allStaff[i].full_name; break; }
        }
        // Show a post picker first
        showPostPicker(userId, name);
    }

    function showPostPicker(userId, name) {
        if (!_posts.length) {
            showToast('No posts configured', 'error');
            return;
        }

        var postNames = _posts.map(function (p, i) { return (i + 1) + '. ' + p.post_name; }).join('\n');
        var choice = prompt('Select post for ' + name + ':\n\n' + postNames + '\n\nEnter number (1-' + _posts.length + '):');
        if (choice === null) return;
        var idx = parseInt(choice, 10) - 1;
        if (idx < 0 || idx >= _posts.length) {
            showToast('Invalid selection', 'error');
            return;
        }

        var selectedPost = _posts[idx];
        _pendingAction = {
            type: 'clock_in',
            userId: userId,
            name: name,
            post_code: selectedPost.post_code
        };
        openPinModalWithExistingAction();
    }

    function openPinModalWithExistingAction() {
        var titleEl = document.getElementById('shPinTitle');
        var targetEl = document.getElementById('shPinTarget');
        var inputEl = document.getElementById('shPinInput');
        var errEl = document.getElementById('shPinError');

        titleEl.textContent = 'Enter PIN to Start Shift';
        targetEl.textContent = _pendingAction.name + ' · ' + _pendingAction.post_code;
        inputEl.value = '';
        errEl.textContent = '';
        errEl.style.display = 'none';

        document.getElementById('shPinModal').classList.add('show');
        setTimeout(function () { inputEl.focus(); }, 200);
    }

    function clockOut(sessionId) {
        if (!confirm('End your shift?')) return;
        if (navigator.vibrate) navigator.vibrate(100);

        showLoading('Ending shift...');
        RBApi.shiftClockOut(sessionId, 'shift_handover')
            .then(function () {
                hideLoading();
                showToast('✅ Shift ended', 'success');
                setTimeout(function () { loadData(); }, 500);
            })
            .catch(function (err) {
                hideLoading();
                showToast('Failed: ' + (err.error || 'network error'), 'error');
            });
    }

    function requestDeviceTake() {
        _pendingAction = {
            type: 'device_take',
            userId: _currentUser.id,
            name: _currentUser.full_name
        };
        openPinModalWithExistingActionCustom('Enter PIN to Take Device');
    }

    function requestDeviceRelease() {
        if (!confirm('Release the device? Another guard can pick it up.')) return;
        _pendingAction = {
            type: 'device_release',
            userId: _currentUser.id,
            name: _currentUser.full_name
        };
        openPinModalWithExistingActionCustom('Enter PIN to Release');
    }

    function openPinModalWithExistingActionCustom(title) {
        var titleEl = document.getElementById('shPinTitle');
        var targetEl = document.getElementById('shPinTarget');
        var inputEl = document.getElementById('shPinInput');
        var errEl = document.getElementById('shPinError');

        titleEl.textContent = title;
        targetEl.textContent = _pendingAction.name;
        inputEl.value = '';
        errEl.textContent = '';
        errEl.style.display = 'none';

        document.getElementById('shPinModal').classList.add('show');
        setTimeout(function () { inputEl.focus(); }, 200);
    }

    // ----------------------------------------------------------
    // PUBLIC API
    // ----------------------------------------------------------
    return {
        init: init,
        loadData: loadData,
        openClockIn: openClockIn,
        clockOut: clockOut,
        requestDeviceTake: requestDeviceTake,
        requestDeviceRelease: requestDeviceRelease,
        closePinModal: closePinModal,
        confirmPin: confirmPin
    };

})();
