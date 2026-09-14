/**
 * ============================================================
 * REEVES BELT SECURE 360 - API CLIENT
 * Handles all communication with the server
 * Supports offline mode with request queueing
 * ============================================================
 */

var RBApi = (function() {

    var BASE_URL = 'https://www.pajhub.co.ke/api/v1';

    // ============================================================
    // STORAGE HELPERS (Capacitor Preferences or localStorage)
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

    // ============================================================
    // CORE REQUEST FUNCTION
    // ============================================================
    function request(endpoint, method, data) {
        method = method || 'GET';

        return new Promise(function(resolve, reject) {
            var xhr = new XMLHttpRequest();
            xhr.open(method, BASE_URL + endpoint, true);
            xhr.setRequestHeader('Content-Type', 'application/json');
            xhr.setRequestHeader('Accept', 'application/json');

            var token = getToken();
            if (token) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + token);
            }

            xhr.timeout = 15000;

            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    var response;
                    try {
                        response = JSON.parse(xhr.responseText);
                    } catch (e) {
                        response = {
                            success: false,
                            error: 'Server returned invalid response',
                            raw: xhr.responseText ? xhr.responseText.substring(0, 200) : '(empty)'
                        };
                    }

                    if (xhr.status >= 200 && xhr.status < 300 && response.success) {
                        resolve(response);
                    } else if (xhr.status === 401) {
                        clearToken();
                        reject({ success: false, error: 'Session expired', code: 'unauthorized' });
                    } else {
                        reject(response);
                    }
                }
            };

            xhr.onerror = function() {
                reject({ success: false, error: 'Network error. Check your connection.', code: 'network_error' });
            };

            xhr.ontimeout = function() {
                reject({ success: false, error: 'Request timed out.', code: 'timeout' });
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

        // ===== AUTH =====
        login: function(username, password, deviceInfo) {
            return request('/auth/login.php', 'POST', {
                username: username,
                password: password,
                device_id: deviceInfo.device_id || 'android-device',
                device_name: deviceInfo.device_name || 'Guard Device',
                device_platform: deviceInfo.device_platform || 'android'
            });
        },

        verify: function() {
            return request('/auth/verify.php', 'GET');
        },

        logout: function() {
            return request('/auth/logout.php', 'POST');
        },

        // ===== DETECTIONS =====
        getPendingDetections: function() {
            return request('/detection/pending.php', 'GET');
        },

        // ===== CAMERA =====
        getCameraStatus: function() {
            return request('/camera/status.php', 'GET');
        },

        // ===== VEHICLE =====
        authorizeVehicle: function(data) {
            return request('/vehicle/authorize.php', 'POST', data);
        },

        processVehicleExit: function(logId, exitWeight) {
            return request('/vehicle/exit.php', 'POST', {
                log_id: logId,
                exit_weight: exitWeight
            });
        },

        getVehiclesInside: function() {
            return request('/vehicle/list-inside.php', 'GET');
        },

        // ===== VISITOR =====
        checkInVisitor: function(data) {
            return request('/visitor/checkin.php', 'POST', data);
        },

        checkOutVisitor: function(logId) {
            return request('/visitor/checkout.php', 'POST', { log_id: logId });
        },

        getVisitorsInside: function() {
            return request('/visitor/list-inside.php', 'GET');
        },

        // ===== PATROL =====
        getPatrolPoints: function() {
            return request('/patrol/points.php', 'GET');
        },

        logPatrolScan: function(data) {
            return request('/patrol/scan.php', 'POST', data);
        },

        // ===== DASHBOARD =====
        getDashboardStats: function() {
            return request('/dashboard/stats.php', 'GET');
        },

        // ===== DETECT (SIMULATE CAMERA) =====
        triggerDetection: function(type) {
            return request('/camera/detect.php', 'POST', {
                type: type || 'vehicle'
            });
        }
    };
})();
