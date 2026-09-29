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
                if (err && err.code === 'unauthorized') {
                    showToast('Session expired — please log out and log back in', 'error');
                } else {
                    showToast('Failed to load: ' + ((err && err.error) || 'network error'), 'error');
                }
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
    function openPinModalWithExistingActionCustom(title) {
        var titleEl = document.getElementById('shPinTitle');
        var targetEl = document.getElementById('shPinTarget');
        var inputEl = document.getElementById('shPinInput');
        var errEl = document.getElementById('shPinError');

        titleEl.textContent = title;
        targetEl.textContent = _pendingAction.name || '';
        inputEl.value = '';
        errEl.textContent = '';
        errEl.style.display = 'none';

        document.getElementById('shPinModal').classList.add('show');
        setTimeout(function () { inputEl.focus(); }, 200);
    }

    function openPinModalWithExistingAction() {
        var titleEl = document.getElementById('shPinTitle');
        var targetEl = document.getElementById('shPinTarget');
        var inputEl = document.getElementById('shPinInput');
        var errEl = document.getElementById('shPinError');

        titleEl.textContent = 'Enter PIN to Start Shift';
        targetEl.textContent = _pendingAction.name + ' · ' + (_pendingAction.post_code || '');
        inputEl.value = '';
        errEl.textContent = '';
        errEl.style.display = 'none';

        document.getElementById('shPinModal').classList.add('show');
        setTimeout(function () { inputEl.focus(); }, 200);
    }

    function closePinModal() {
        document.getElementById('shPinModal').classList.remove('show');
        _pendingAction = null;
    }

    function showPinError(msg) {
        var errEl = document.getElementById('shPinError');
        if (errEl) { errEl.textContent = msg; errEl.style.display = 'block'; }
        if (navigator.vibrate) navigator.vibrate([50, 50, 50]);
    }

    // ----------------------------------------------------------
    // CONFIRM PIN — main action router
    // ----------------------------------------------------------
    function confirmPin() {
        if (!_pendingAction) return;

        var pin = (document.getElementById('shPinInput').value || '').trim();

        // ---- SELF-ACTION SHORTCUT ----
        // If the target is the CURRENT user and it's not a clock-in,
        // we already have a valid token. Skip re-login entirely.
        var isSelf = _currentUser && (_pendingAction.userId === _currentUser.id);
        if (isSelf && _pendingAction.type !== 'clock_in') {
            closePinModal();
            showLoading('Working...');
            performAction(RBApi.getToken(), _pendingAction)
                .then(function () {
                    hideLoading();
                    if (navigator.vibrate) navigator.vibrate(100);
                    showToast('✅ ' + successMessage(_pendingAction ? _pendingAction.type : ''), 'success');
                    setTimeout(function () { loadData(true); }, 400);
                })
                .catch(function (err) {
                    hideLoading();
                    var msg = 'Action failed';
                    if (err) {
                        if (err.code === 'unauthorized' || err.httpStatus === 401) {
                            msg = 'Your session expired. Please log out and log back in.';
                        } else {
                            msg = err.error || err.message || msg;
                        }
                    }
                    showToast('❌ ' + msg, 'error');
                });
            return;
        }

        // ---- OTHER-USER ACTION: needs PIN validation ----
        if (!pin) {
            showPinError('Enter your PIN');
            return;
        }

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
        var action = _pendingAction; // capture before async

        RBApi.login(targetUsername, pin, {})
            .then(function (loginRes) {
                if (!loginRes || !loginRes.token) {
                    throw { error: 'Login failed', code: 'no_token', httpStatus: 401 };
                }
                return performAction(loginRes.token, action);
            })
            .then(function () {
                hideLoading();
                closePinModal();
                if (navigator.vibrate) navigator.vibrate(100);
                showToast('✅ ' + successMessage(action.type), 'success');
                setTimeout(function () { loadData(true); }, 400);
            })
            .catch(function (err) {
                hideLoading();
                var msg = 'Action failed';
                if (err) {
                    if (err.code === 'unauthorized' || err.httpStatus === 401) {
                        msg = 'Invalid PIN';
                    } else {
                        msg = err.error || err.message || msg;
                    }
                }
                showPinError(msg);
            });
    }

    // ----------------------------------------------------------
    // PERFORM ACTION — raw fetch with custom token
    // ----------------------------------------------------------
    function performAction(token, action) {
        var headers = {
            'Content-Type': 'application/json',
            'Accept': 'application/json',
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
            return Promise.reject({ error: 'Unknown action', code: 'unknown_action' });
        }

        return promise;
    }

    function fetchJSON(url, method, body, headers) {
        return fetch(url, {
            method: method,
            headers: headers,
            body: JSON.stringify(body)
        }).then(function (r) {
            return r.json().then(function (data) {
                if (r.status === 401) {
                    throw {
                        success: false,
                        error: data.error || 'Session expired',
                        code: data.code || 'unauthorized',
                        httpStatus: 401
                    };
                }
                if (!r.ok || !data.success) {
                    throw {
                        success: false,
                        error: data.error || ('HTTP ' + r.status),
                        code: data.code || 'http_error',
                        httpStatus: r.status
                    };
                }
                return data;
            }).catch(function (parseErr) {
                // If JSON parse failed, wrap in structured error
                if (parseErr && parseErr.code) throw parseErr;
                throw { success: false, error: 'HTTP ' + r.status + ' — invalid response', code: 'bad_response', httpStatus: r.status };
            });
        }).catch(function (netErr) {
            if (netErr && netErr.code) throw netErr;
            throw { success: false, error: 'Network error', code: 'network_error' };
        });
    }

    function successMessage(type) {
        if (type === 'clock_in') return 'Shift started';
        if (type === 'clock_out') return 'Shift ended';
        if (type === 'device_take') return 'Device taken';
        if (type === 'device_release') return 'Device released';
        return 'Done';
    }

    // ----------------------------------------------------------
    // PUBLIC ACTIONS
    // ----------------------------------------------------------
    function openClockIn(userId) {
        var name = '';
        for (var i = 0; i < _allStaff.length; i++) {
            if (_allStaff[i].id === userId) { name = _allStaff[i].full_name; break; }
        }
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

    function clockOut(sessionId) {
        if (!confirm('End your shift?')) return;
        if (navigator.vibrate) navigator.vibrate(100);

        showLoading('Ending shift...');
        RBApi.shiftClockOut(sessionId, 'shift_handover')
            .then(function () {
                hideLoading();
                showToast('✅ Shift ended', 'success');
                setTimeout(function () { loadData(true); }, 400);
            })
            .catch(function (err) {
                hideLoading();
                var msg = (err && err.error) ? err.error : 'network error';
                if (err && err.code === 'unauthorized') msg = 'Session expired — log out and log back in';
                showToast('Failed: ' + msg, 'error');
            });
    }

    function requestDeviceTake() {
        // SELF action — no PIN needed, uses existing session token
        _pendingAction = {
            type: 'device_take',
            userId: _currentUser.id,
            name: _currentUser.full_name
        };
        // Confirm with the user, then act
        if (!confirm('Take the device now?')) {
            _pendingAction = null;
            return;
        }
        if (navigator.vibrate) navigator.vibrate(80);

        showLoading('Taking device...');
        performAction(RBApi.getToken(), _pendingAction)
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
                    if (err.code === 'unauthorized' || err.httpStatus === 401) {
                        msg = 'Your session expired. Please log out and log back in.';
                    } else {
                        msg = err.error || err.message || msg;
                    }
                }
                showToast('❌ ' + msg, 'error');
            });
    }

    function requestDeviceRelease() {
        if (!confirm('Release the device? Another guard can pick it up.')) return;
        if (navigator.vibrate) navigator.vibrate(80);

        _pendingAction = {
            type: 'device_release',
            userId: _currentUser.id,
            name: _currentUser.full_name
        };

        showLoading('Releasing device...');
        performAction(RBApi.getToken(), _pendingAction)
            .then(function () {
                hideLoading();
                showToast('✅ Device released', 'success');
                setTimeout(function () { loadData(true); }, 400);
            })
            .catch(function (err) {
                hideLoading();
                var msg = 'Action failed';
                if (err) {
                    if (err.code === 'unauthorized' || err.httpStatus === 401) {
                        msg = 'Your session expired. Please log out and log back in.';
                    } else {
                        msg = err.error || err.message || msg;
                    }
                }
                showToast('❌ ' + msg, 'error');
            });
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
