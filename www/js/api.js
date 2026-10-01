/**
 * ============================================================
 * REEVES BELT APP - API CLIENT
 * ============================================================
 */

var RBApi = (function() {

    var BASE_URL = 'https://www.pajhub.co.ke/api/v1';
    var DEBUG = true;

    // ============================================================
    // STORAGE (Capacitor Preferences when available, else localStorage)
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
    // TOKEN — reads from vault's active profile
    // ============================================================
    function getToken() {
        var profile = (typeof RBVault !== 'undefined') ? RBVault.getActiveProfile() : null;
        return (profile && profile.token) ? profile.token : '';
    }

    function setToken(token) {
        var id = (typeof RBVault !== 'undefined') ? RBVault.getActiveId() : null;
        if (id) RBVault.updateProfile(id, { token: token });
    }

    function clearToken() {
        var id = (typeof RBVault !== 'undefined') ? RBVault.getActiveId() : null;
        if (id) RBVault.removeProfile(id);
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
    function request(endpoint, method, data, overrideToken) {
        method = method || 'GET';

        return new Promise(function(resolve, reject) {
            var url = BASE_URL + endpoint;
            var xhr = new XMLHttpRequest();
            xhr.open(method, url, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('Accept', 'application/json');

            var token = overrideToken || getToken();
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
                    var errMsg  = (response && response.error) ? response.error : 'Session expired';
                    var errCode = (response && response.code)  ? response.code  : 'unauthorized';
                    var isLogin = endpoint.indexOf('/auth/login.php') !== -1;
                    if (token && !isLogin) clearToken();
                    reject({ success: false, error: errMsg, code: errCode, httpStatus: 401 });
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
            return request('/vehicle/exit.php', 'POST', {
                log_id: logId,
                exit_weight: exitWeight,
                exit_comment: exitComment || ''
            });
        },
        getVehiclesInside: function() { return request('/vehicle/list-inside.php?include_recent=1', 'GET'); },

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

        // ===== SHIFT HANDOVER + DEVICE HOLDER =====
        getPosts: function(includeInactive) {
            var endpoint = '/staff/posts-list.php';
            if (includeInactive) endpoint += '?include_inactive=1';
            return request(endpoint, 'GET');
        },
        shiftClockIn: function(postCode, lat, lng, deviceInfo) {
            return request('/staff/shift-clock-in.php', 'POST', {
                post_code:   postCode,
                latitude:    (typeof lat === 'number') ? lat : null,
                longitude:   (typeof lng === 'number') ? lng : null,
                device_info: deviceInfo || (navigator.userAgent || '').substring(0, 200)
            });
        },
        shiftClockOut: function(sessionId, reason) {
            return request('/staff/shift-clock-out.php', 'POST', {
                session_id: sessionId || null,
                reason:     reason || 'manual'
            });
        },
        deviceTake: function(deviceInfo, notes) {
            return request('/staff/device-take.php', 'POST', {
                device_info: deviceInfo || (navigator.userAgent || '').substring(0, 200),
                notes:       notes || null
            });
        },
        deviceRelease: function() {
            return request('/staff/device-release.php', 'POST', {});
        },
        getChangeoverData: function() {
            return request('/staff/shift-changeover.php', 'GET');
        },

        // ===== HOLDER MANAGEMENT =====
        holderTake: function(targetUserId, deviceInfo) {
            return request('/staff/holder-take.php', 'POST', {
                target_user_id: targetUserId,
                device_info: deviceInfo || (navigator.userAgent || '').substring(0, 200)
            });
        },
        holderRelease: function() {
            return request('/staff/holder-release.php', 'POST', {});
        },
        holderStatus: function() {
            return request('/staff/holder-status.php', 'GET');
        },
        shiftClockInAs: function(actingUserId, postCode) {
            return request('/staff/shift-clock-in.php', 'POST', {
                post_code: postCode,
                acting_as_user_id: actingUserId
            });
        },
        shiftClockOutAs: function(actingUserId, sessionId, reason) {
            return request('/staff/shift-clock-out.php', 'POST', {
                session_id: sessionId || null,
                acting_as_user_id: actingUserId,
                reason: reason || 'holder_action'
            });
        },

        // ===== POSTS ADMIN =====
        postCreate: function(data) { return request('/staff/post-create.php', 'POST', data); },
        postUpdate: function(data) { return request('/staff/post-update.php', 'POST', data); },
        postDelete: function(postId) { return request('/staff/post-delete.php', 'POST', { post_id: postId }); },

        // ===== HR — DEPARTMENTS =====
        hrDepartmentsList: function(includeInactive) {
            var endpoint = '/hr/departments-list.php';
            if (includeInactive) endpoint += '?include_inactive=1';
            return request(endpoint, 'GET');
        },
        hrDepartmentCreate: function(data) { return request('/hr/department-create.php', 'POST', data); },
        hrDepartmentUpdate: function(data) { return request('/hr/department-update.php', 'POST', data); },
        hrDepartmentDelete: function(id) { return request('/hr/department-delete.php', 'POST', { id: id }); },

        // ===== HR — ROLES =====
        hrRolesList: function(includeInactive) {
            var endpoint = '/hr/roles-list.php';
            if (includeInactive) endpoint += '?include_inactive=1';
            return request(endpoint, 'GET');
        },
        hrRoleCreate: function(data) { return request('/hr/role-create.php', 'POST', data); },
        hrRoleUpdate: function(data) { return request('/hr/role-update.php', 'POST', data); },
        hrRoleDelete: function(id) { return request('/hr/role-delete.php', 'POST', { id: id }); },

        // ===== HR — TEMPLATES =====
        hrTemplateApply: function(templateCode, tenantId, reset) {
            var body = { template_code: templateCode };
            if (tenantId) body.tenant_id = tenantId;
            if (reset) body.reset = 1;
            return request('/hr/template-apply.php', 'POST', body);
        },

        // ===== HR — EMPLOYEES =====
        hrEmployeeList: function(params) {
            params = params || {};
            var qs = [];
            if (params.search)          qs.push('search=' + encodeURIComponent(params.search));
            if (params.status)          qs.push('status=' + encodeURIComponent(params.status));
            if (params.department)      qs.push('department=' + encodeURIComponent(params.department));
            if (params.dept_id)         qs.push('dept_id=' + encodeURIComponent(params.dept_id));
            if (params.role_id)         qs.push('role_id=' + encodeURIComponent(params.role_id));
            if (params.attendance_mode) qs.push('attendance_mode=' + encodeURIComponent(params.attendance_mode));
            if (params.shift_id)        qs.push('shift_id=' + encodeURIComponent(params.shift_id));
            if (params.limit)           qs.push('limit=' + encodeURIComponent(params.limit));
            if (params.offset)          qs.push('offset=' + encodeURIComponent(params.offset));
            if (params.tenant_id)       qs.push('tenant_id=' + encodeURIComponent(params.tenant_id));
            var endpoint = '/hr/employee-list.php';
            if (qs.length) endpoint += '?' + qs.join('&');
            return request(endpoint, 'GET');
        },
        hrEmployeeCreate: function(data) { return request('/hr/employee-create.php', 'POST', data); },
        hrEmployeeUpdate: function(data) { return request('/hr/employee-update.php', 'POST', data); },
        hrEmployeeDelete: function(id) { return request('/hr/employee-delete.php', 'POST', { id: id }); },

        // ===== HR — EVENTS =====
        hrGateEvent: function(data) { return request('/hr/gate-event.php', 'POST', data); },
        hrOfficeEvent: function(data) { return request('/hr/office-event.php', 'POST', data); },
        hrRecentEvents: function(since, limit) {
            var endpoint = '/hr/recent-events.php?since=' + encodeURIComponent(since || 0);
            if (limit) endpoint += '&limit=' + encodeURIComponent(limit);
            return request(endpoint, 'GET');
        },
        hrTodayEvents: function(date, search, direction) {
            var qs = [];
            if (date)      qs.push('date=' + encodeURIComponent(date));
            if (search)    qs.push('search=' + encodeURIComponent(search));
            if (direction) qs.push('direction=' + encodeURIComponent(direction));
            var endpoint = '/hr/today-events.php';
            if (qs.length) endpoint += '?' + qs.join('&');
            return request(endpoint, 'GET');
        },

        // ===== HR — REPORTS =====
        hrAttendanceReport: function(params) {
            params = params || {};
            var qs = [];
            if (params.date_start)      qs.push('date_start=' + encodeURIComponent(params.date_start));
            if (params.date_end)        qs.push('date_end=' + encodeURIComponent(params.date_end));
            if (params.employee_id)     qs.push('employee_id=' + encodeURIComponent(params.employee_id));
            if (params.dept_id)         qs.push('dept_id=' + encodeURIComponent(params.dept_id));
            if (params.role_id)         qs.push('role_id=' + encodeURIComponent(params.role_id));
            if (params.attendance_mode) qs.push('attendance_mode=' + encodeURIComponent(params.attendance_mode));
            if (params.source)          qs.push('source=' + encodeURIComponent(params.source));
            if (params.status)          qs.push('status=' + encodeURIComponent(params.status));
            if (params.overtime_only)   qs.push('overtime_only=1');
            if (params.search)          qs.push('search=' + encodeURIComponent(params.search));
            if (params.limit)           qs.push('limit=' + encodeURIComponent(params.limit));
            if (params.offset)          qs.push('offset=' + encodeURIComponent(params.offset));
            if (params.tenant_id)       qs.push('tenant_id=' + encodeURIComponent(params.tenant_id));
            var endpoint = '/hr/attendance-report.php';
            if (qs.length) endpoint += '?' + qs.join('&');
            return request(endpoint, 'GET');
        },
        hrAttendanceSummary: function(date, tenantId) {
            var qs = [];
            if (date)     qs.push('date=' + encodeURIComponent(date));
            if (tenantId) qs.push('tenant_id=' + encodeURIComponent(tenantId));
            var endpoint = '/hr/attendance-summary.php';
            if (qs.length) endpoint += '?' + qs.join('&');
            return request(endpoint, 'GET');
        },
        hrAttendanceRollup: function(data) {
            return request('/hr/attendance-rollup.php', 'POST', data || {});
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
            if (params.tenant_id)     qs.push('tenant_id=' + encodeURIComponent(params.tenant_id));
            if (params.guard_id)      qs.push('guard_id=' + encodeURIComponent(params.guard_id));
            if (params.supervisor_id) qs.push('supervisor_id=' + encodeURIComponent(params.supervisor_id));
            if (params.limit)         qs.push('limit=' + encodeURIComponent(params.limit));
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
            if (params.date)                     qs.push('date=' + encodeURIComponent(params.date));
            if (params.status)                   qs.push('status=' + encodeURIComponent(params.status));
            if (params.plate)                    qs.push('plate=' + encodeURIComponent(params.plate));
            if (params.active_only !== undefined) qs.push('active_only=' + (params.active_only ? 1 : 0));
            if (params.limit)                    qs.push('limit=' + encodeURIComponent(params.limit));
            if (params.tenant_id)                qs.push('tenant_id=' + encodeURIComponent(params.tenant_id));
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

        // ===== EMPLOYEES (AlcoBlow — legacy) =====
        employeesList: function(params) {
            params = params || {};
            var qs = [];
            if (params.search)     qs.push('search=' + encodeURIComponent(params.search));
            if (params.status)     qs.push('status=' + encodeURIComponent(params.status));
            if (params.department) qs.push('department=' + encodeURIComponent(params.department));
            if (params.limit)      qs.push('limit=' + encodeURIComponent(params.limit));
            if (params.offset)     qs.push('offset=' + encodeURIComponent(params.offset));
            if (params.tenant_id)  qs.push('tenant_id=' + encodeURIComponent(params.tenant_id));
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
            if (params.date_end)   qs.push('date_end=' + encodeURIComponent(params.date_end));
            if (params.result)     qs.push('result=' + encodeURIComponent(params.result));
            if (params.search)     qs.push('search=' + encodeURIComponent(params.search));
            if (params.limit)      qs.push('limit=' + encodeURIComponent(params.limit));
            if (params.offset)     qs.push('offset=' + encodeURIComponent(params.offset));
            if (params.tenant_id)  qs.push('tenant_id=' + encodeURIComponent(params.tenant_id));
            var endpoint = '/alcohol/test-list.php';
            if (qs.length) endpoint += '?' + qs.join('&');
            return request(endpoint, 'GET');
        },

        // ===== DETECT (SIMULATE) =====
        triggerDetection: function(type) { return request('/camera/detect.php', 'POST', { type: type || 'vehicle' }); }
    };
})();
