/**
 * ============================================================
 * REEVES BELT APP - API CLIENT
 * ============================================================
 */

var RBApi = (function() {

    var BASE_URL = 'https://www.pajhub.co.ke/api/v1';
    var DEBUG = true;

    // ============================================================
    // STORAGE
    // ============================================================
    function storageGet(key) {
        return new Promise(function(resolve) {
            if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Preferences) {
                Capacitor.Plugins.Preferences.get({ key: key })
                    .then(function(r) { resolve(r.value); })
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
                    .catch(function() { localStorage.setItem(key, value); resolve(); });
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
                    .catch(function() { localStorage.removeItem(key); resolve(); });
            } else {
                localStorage.removeItem(key);
                resolve();
            }
        });
    }

    // ============================================================
    // TOKEN
    // ============================================================
    function getToken() { return localStorage.getItem('rb_token') || ''; }
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
            if (token) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + token);
                xhr.setRequestHeader('X-Auth-Token', token);
            }

            log(method + ' ' + url);
            xhr.timeout = 20000;

            xhr.onreadystatechange = function() {
                if (xhr.readyState !== 4) return;

                if (xhr.status === 0) {
                    reject({ success: false, error: 'Cannot reach server.', code: 'no_response', httpStatus: 0 });
                    return;
                }

                var response;
                try {
                    response = JSON.parse(xhr.responseText);
                } catch (e) {
                    response = {
                        success: false,
                        error: 'HTTP ' + xhr.status + ' — invalid response',
                        httpStatus: xhr.status
                    };
                }

                if (xhr.status >= 200 && xhr.status < 300 && response.success) {
                    resolve(response);
                } else if (xhr.status === 401) {
                    clearToken();
                    reject({ success: false, error: 'Session expired', code: 'unauthorized', httpStatus: 401 });
                } else {
                    if (response && !response.httpStatus) response.httpStatus = xhr.status;
                    reject(response);
                }
            };

            xhr.onerror = function() {
                reject({ success: false, error: 'Network error.', code: 'network_error' });
            };
            xhr.ontimeout = function() {
                reject({ success: false, error: 'Request timed out.', code: 'timeout' });
            };

            if (data) xhr.send(JSON.stringify(data));
            else xhr.send();
        });
    }

    // ============================================================
    // PUBLIC API
    // ============================================================
    return {
        getToken: getToken, setToken: setToken, clearToken: clearToken,
        getBaseUrl: function() { return BASE_URL; },

        // ===== AUTH =====
        login: function(username, password, deviceInfo) {
            deviceInfo = deviceInfo || {};
            return request('/auth/login.php', 'POST', {
                username: username, password: password,
                device_id: deviceInfo.device_id || 'android-device',
                device_name: deviceInfo.device_name || 'Guard Device',
                device_platform: deviceInfo.device_platform || 'android'
            });
        },
        verify: function() { return request('/auth/verify.php', 'GET'); },
        logout: function() { return request('/auth/logout.php', 'POST'); },

        // ===== DETECTIONS =====
        getPendingDetections: function() { return request('/detection/pending.php', 'GET'); },
        getCameraStatus: function() { return request('/camera/status.php', 'GET'); },

        // ===== VEHICLE =====
        authorizeVehicle: function(data) { return request('/vehicle/authorize.php', 'POST', data); },
        processVehicleExit: function(logId, exitWeight, exitComment) {
            return request('/vehicle/exit.php', 'POST', { log_id: logId, exit_weight: exitWeight, exit_comment: exitComment || '' });
        },
        getVehiclesInside: function() { return request('/vehicle/list-inside.php', 'GET'); },

        // ===== PENDING CAPTURES =====
        getPendingCaptures: function() { return request('/vehicle/pending-list.php', 'GET'); },
        getPendingCaptureDetail: function(id) { return request('/vehicle/pending-detail.php?id=' + encodeURIComponent(id), 'GET'); },
        completeVehicleEntry: function(data) { return request('/vehicle/entry-complete.php', 'POST', data); },

        // ===== VISITOR =====
        checkInVisitor: function(data) { return request('/visitor/checkin.php', 'POST', data); },
        checkOutVisitor: function(logId) { return request('/visitor/checkout.php', 'POST', { log_id: logId }); },
        getVisitorsInside: function() { return request('/visitor/list-inside.php', 'GET'); },

        // ===== PATROL =====
        getPatrolPoints: function() { return request('/patrol/points.php', 'GET'); },
        logPatrolScan: function(data) { return request('/patrol/scan.php', 'POST', data); },

        // ===== STAFF SHIFT =====
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
        getPendingRollCalls: function() { return request('/staff/pending-roll-calls.php', 'GET'); },
        acknowledgeRollCall: function(rollCallId) {
            return request('/staff/acknowledge-roll-call.php', 'POST', { roll_call_id: rollCallId });
        },

        // ===== DASHBOARD =====
        getDashboardStats: function() { return request('/dashboard/stats.php', 'GET'); },

        // ===== PRE-WEIGHED TRUCKS =====
        preweighedCreate: function(data) { return request('/preweighed/create.php', 'POST', data); },
        preweighedList: function(params) {
            params = params || {};
            var qs = [];
            if (params.date) qs.push('date=' + encodeURIComponent(params.date));
            if (params.status) qs.push('status=' + encodeURIComponent(params.status));
            if (params.plate) qs.push('plate=' + encodeURIComponent(params.plate));
            if (params.active_only !== undefined) qs.push('active_only=' + (params.active_only ? 1 : 0));
            if (params.limit) qs.push('limit=' + encodeURIComponent(params.limit));
            if (params.tenant_id) qs.push('tenant_id=' + encodeURIComponent(params.tenant_id));
            var endpoint = '/preweighed/list.php';
            if (qs.length) endpoint += '?' + qs.join('&');
            return request(endpoint, 'GET');
        },
        preweighedReveal: function(code, tenantId) {
            var body = { code: code };
            if (tenantId) body.tenant_id = tenantId;
            return request('/preweighed/reveal.php', 'POST', body);
        },
        preweighedUpdateStatus: function(truckId, status, notes) {
            return request('/preweighed/update-status.php', 'POST', { truck_id: truckId, status: status, notes: notes || null });
        },
        preweighedSampleTaken: function(data) { return request('/preweighed/sample-taken.php', 'POST', data); },
        preweighedSampleLabel: function(sampleId) {
            return request('/preweighed/sample-label-pdf.php?sample_id=' + encodeURIComponent(sampleId), 'GET');
        },
        preweighedCallIn: function(truckId) {
            return request('/preweighed/call-in.php', 'POST', { truck_id: truckId });
        },

        // ===== EMPLOYEES =====
        employeesList: function(params) {
            params = params || {};
            var qs = [];
            if (params.search) qs.push('search=' + encodeURIComponent(params.search));
            if (params.status) qs.push('status=' + encodeURIComponent(params.status));
            if (params.department) qs.push('department=' + encodeURIComponent(params.department));
            if (params.limit) qs.push('limit=' + encodeURIComponent(params.limit));
            if (params.offset) qs.push('offset=' + encodeURIComponent(params.offset));
            if (params.tenant_id) qs.push('tenant_id=' + encodeURIComponent(params.tenant_id));
            var endpoint = '/alcohol/employees-list.php';
            if (qs.length) endpoint += '?' + qs.join('&');
            return request(endpoint, 'GET');
        },
        employeeCreate: function(data) { return request('/alcohol/employee-create.php', 'POST', data); },
        employeeUpdate: function(data) { return request('/alcohol/employee-update.php', 'POST', data); },
        employeeDelete: function(employeeId) { return request('/alcohol/employee-delete.php', 'POST', { employee_id: employeeId }); },

        // ===== ALCOHOL SETTINGS =====
        alcoholSettingsGet: function(tenantId) {
            var endpoint = '/alcohol/settings-get.php';
            if (tenantId) endpoint += '?tenant_id=' + encodeURIComponent(tenantId);
            return request(endpoint, 'GET');
        },
        alcoholSettingsSave: function(data) { return request('/alcohol/settings-save.php', 'POST', data); },

        // ===== ALCOHOL TESTS =====
        alcoholTestCreate: function(data) { return request('/alcohol/test-create.php', 'POST', data); },
        alcoholTestList: function(params) {
            params = params || {};
            var qs = [];
            if (params.date_start) qs.push('date_start=' + encodeURIComponent(params.date_start));
            if (params.date_end) qs.push('date_end=' + encodeURIComponent(params.date_end));
            if (params.result) qs.push('result=' + encodeURIComponent(params.result));
            if (params.search) qs.push('search=' + encodeURIComponent(params.search));
            if (params.limit) qs.push('limit=' + encodeURIComponent(params.limit));
            if (params.offset) qs.push('offset=' + encodeURIComponent(params.offset));
            if (params.tenant_id) qs.push('tenant_id=' + encodeURIComponent(params.tenant_id));
            var endpoint = '/alcohol/test-list.php';
            if (qs.length) endpoint += '?' + qs.join('&');
            return request(endpoint, 'GET');
        },

        // ===== DETECT (SIMULATE) =====
        triggerDetection: function(type) { return request('/camera/detect.php', 'POST', { type: type || 'vehicle' }); }
    };
})();
