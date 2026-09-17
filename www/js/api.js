/**
 * ============================================================
 * REEVES BELT APP - API CLIENT
 * Handles all communication with the server
 * Supports offline mode with request queueing
 *
 * UPDATED:
 *  - Sends both Authorization and X-Auth-Token headers
 *  - Detailed console logging
 *  - Improved error handling with HTTP status
 *  - Unified staff shift endpoints (guards + supervisors)
 *  - Roll call endpoints
 * ============================================================
 */

var RBApi = (function() {

    var BASE_URL = 'https://www.pajhub.co.ke/api/v1';
    var DEBUG = true;

    // ============================================================
    // STORAGE HELPERS
    // ============================================================
    function storageGet(key) {
        return new Promise(function(resolve) {
            if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Preferences) {
                Capacitor.Plugins.Preferences.get({ key: key })
                    .then(function(result) { resolve(result.value); })
                    .catch(function() { resolve(localStorage.getItem(key)); });
            } else {
                resolve(localStorage.getItem(key));
            }
        });
    }

    function storageSet(key, value) {
        return new Promise(function(resolve) {
            if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Preferences) {
                Capacitor.Plugins.Preferences.set({ key: key, value: value })
                    .then(resolve)
                    .catch(function() {
                        localStorage.setItem(key, value);
                        resolve();
                    });
            } else {
                localStorage.setItem(key, value);
                resolve();
            }
        });
    }

    function storageRemove(key) {
        return new Promise(function(resolve) {
            if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Preferences) {
                Capacitor.Plugins.Preferences.remove({ key: key })
                    .then(resolve)
                    .catch(function() {
                        localStorage.removeItem(key);
                        resolve();
                    });
            } else {
                localStorage.removeItem(key);
                resolve();
            }
        });
    }

    // ============================================================
    // TOKEN MANAGEMENT
    // ============================================================
    function getToken() {
        return localStorage.getItem('rb_token') || '';
    }

    function setToken(token) {
        localStorage.setItem('rb_token', token);
        storageSet('rb_token', token);
    }

    function clearToken() {
        localStorage.removeItem('rb_token');
        storageRemove('rb_token');
    }

    function log() {
        if (!DEBUG) return;
        var args = Array.prototype.slice.call(arguments);
        args.unshift('[RBApi]');
        try { console.log.apply(console, args); } catch (e) {}
    }

    // ============================================================
    // CORE REQUEST
    // ============================================================
    function request(endpoint, method, data) {
        method = method || 'GET';

        return new Promise(function(resolve, reject) {
            var url = BASE_URL + endpoint;
            var xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('Accept', 'application/json');

            var token = getToken();
            var hasAuth = false;
            if (token) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + token);
                xhr.setRequestHeader('X-Auth-Token', token);
                hasAuth = true;
            }

            log(method + ' ' + url + ' | auth=' + hasAuth + (data ? ' | body=' + JSON.stringify(data).substring(0, 120) : ''));

            xhr.timeout = 20000;

            xhr.onreadystatechange = function() {
                if (xhr.readyState !== 4) return;

                log('RESPONSE ' + method + ' ' + url + ' | status=' + xhr.status + ' | len=' + (xhr.responseText ? xhr.responseText.length : 0));

                if (xhr.status === 0) {
                    reject({
                        success: false,
                        error: 'Cannot reach server. Check internet or server may be down.',
                        code: 'no_response',
                        httpStatus: 0
                    });
                    return;
                }

                var response;
                try {
                    response = JSON.parse(xhr.responseText);
                } catch (e) {
                    response = {
                        success: false,
                        error: 'HTTP ' + xhr.status + ' — ' + (xhr.responseText ? xhr.responseText.substring(0, 200) : '(empty response)'),
                        raw: xhr.responseText ? xhr.responseText.substring(0, 500) : '(empty)',
                        httpStatus: xhr.status
                    };
                }

                if (xhr.status >= 200 && xhr.status < 300 && response.success) {
                    resolve(response);
                } else if (xhr.status === 401) {
                    clearToken();
                    reject({
                        success: false,
                        error: 'Session expired',
                        code: 'unauthorized',
                        httpStatus: 401
                    });
                } else {
                    if (response && !response.httpStatus) response.httpStatus = xhr.status;
                    reject(response);
                }
            };

            xhr.onerror = function() {
                log('XHR ERROR for ' + url);
                reject({
                    success: false,
                    error: 'Network error. Check your connection.',
                    code: 'network_error'
                });
            };

            xhr.ontimeout = function() {
                log('XHR TIMEOUT for ' + url);
                reject({
                    success: false,
                    error: 'Request timed out.',
                    code: 'timeout'
                });
            };

            if (data) {
                xhr.send(JSON.stringify(data));
            } else {
                xhr.send();
            }
        });
    }

    // ============================================================
    // PUBLIC API
    // ============================================================
    return {
        // Storage
        getToken: getToken,
        setToken: setToken,
        clearToken: clearToken,
        getBaseUrl: function() { return BASE_URL; },

        // ===== AUTH =====
        login: function(username, password, deviceInfo) {
            deviceInfo = deviceInfo || {};
            return request('/auth/login.php', 'POST', {
                username: username,
                password: password,
                device_id: deviceInfo.device_id || 'android-device',
                device_name: deviceInfo.device_name || 'Guard Device',
                device_platform: deviceInfo.device_platform || 'android'
            });
        },
        verify: function() { return request('/auth/verify.php', 'GET'); },
        logout: function() { return request('/auth/logout.php', 'POST'); },

        // ===== DETECTIONS =====
        getPendingDetections: function() { return request('/detection/pending.php', 'GET'); },

        // ===== CAMERA =====
        getCameraStatus: function() { return request('/camera/status.php', 'GET'); },

        // ===== VEHICLE =====
        authorizeVehicle: function(data) { return request('/vehicle/authorize.php', 'POST', data); },
        processVehicleExit: function(logId, exitWeight, exitComment) {
            return request('/vehicle/exit.php', 'POST', {
                log_id: logId,
                exit_weight: exitWeight,
                exit_comment: exitComment || ''
            });
        },
        getVehiclesInside: function() { return request('/vehicle/list-inside.php', 'GET'); },

        // ===== VISITOR =====
        checkInVisitor: function(data) { return request('/visitor/checkin.php', 'POST', data); },
        checkOutVisitor: function(logId) { return request('/visitor/checkout.php', 'POST', { log_id: logId }); },
        getVisitorsInside: function() { return request('/visitor/list-inside.php', 'GET'); },

        // ===== PATROL =====
        getPatrolPoints: function() { return request('/patrol/points.php', 'GET'); },
        logPatrolScan: function(data) { return request('/patrol/scan.php', 'POST', data); },

        // ===== STAFF SHIFT (unified guard + supervisor) =====
        startStaffShift: function(data) { return request('/staff/shift-start.php', 'POST', data || {}); },
        endStaffShift: function(data) { return request('/staff/shift-end.php', 'POST', data || {}); },
        sendStaffLocation: function(data) { return request('/staff/location.php', 'POST', data); },
        getStaffActive: function() { return request('/staff/active.php', 'GET'); },
        getStaffOnDuty: function(tenantId) {
            var endpoint = '/staff/on-duty-list.php';
            if (tenantId) endpoint += '?tenant_id=' + encodeURIComponent(tenantId);
            return request(endpoint, 'GET');
        },

        // ===== SUPERVISOR =====
        getSupervisorDashboard: function(tenantId) {
            var endpoint = '/supervisor/dashboard-12hr.php';
            if (tenantId) endpoint += '?tenant_id=' + encodeURIComponent(tenantId);
            return request(endpoint, 'GET');
        },

        // ===== ROLL CALL =====
        getNearbyGuards: function(lat, lng, tenantId) {
            var endpoint = '/supervisor/nearby-guards.php?lat=' + encodeURIComponent(lat) + '&lng=' + encodeURIComponent(lng);
            if (tenantId) endpoint += '&tenant_id=' + encodeURIComponent(tenantId);
            return request(endpoint, 'GET');
        },
        getRollCallsList: function(params) {
            params = params || {};
            var qs = [];
            if (params.tenant_id) qs.push('tenant_id=' + encodeURIComponent(params.tenant_id));
            if (params.guard_id) qs.push('guard_id=' + encodeURIComponent(params.guard_id));
            if (params.supervisor_id) qs.push('supervisor_id=' + encodeURIComponent(params.supervisor_id));
            if (params.limit) qs.push('limit=' + encodeURIComponent(params.limit));
            var endpoint = '/supervisor/roll-calls-list.php';
            if (qs.length) endpoint += '?' + qs.join('&');
            return request(endpoint, 'GET');
        },
        getPendingRollCalls: function() {
            return request('/staff/pending-roll-calls.php', 'GET');
        },
        acknowledgeRollCall: function(rollCallId) {
            return request('/staff/acknowledge-roll-call.php', 'POST', { roll_call_id: rollCallId });
        },

        // ===== DASHBOARD =====
        getDashboardStats: function() { return request('/dashboard/stats.php', 'GET'); },

        // ===== DETECT (SIMULATE CAMERA) =====
        triggerDetection: function(type) {
            return request('/camera/detect.php', 'POST', { type: type || 'vehicle' });
        }
    };
})();
