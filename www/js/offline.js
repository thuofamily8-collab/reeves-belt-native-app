/**
 * ============================================================
 * REEVES BELT SECURE 360 - OFFLINE SYNC ENGINE
 * Queues records when offline, auto-syncs when online
 *
 * SPRINT 1: RBOffline network bar + cached credentials
 * SPRINT 2: shift_start / shift_end queue support
 * STYLE:    concise network bar text
 * ============================================================
 */

var OfflineSync = (function() {

    var QUEUE_KEY = 'rb_offline_queue';
    var SYNC_INTERVAL = 30000;

    function getQueue() {
        try {
            return JSON.parse(localStorage.getItem(QUEUE_KEY) || '[]');
        } catch (e) {
            return [];
        }
    }

    function saveQueue(queue) {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    }

    function queueRecord(type, data) {
        var queue = getQueue();
        var record = {
            id: 'rec-' + Date.now() + '-' + Math.random().toString(36).substr(2, 6),
            type: type,
            data: data,
            created_at: new Date().toISOString(),
            retries: 0
        };
        queue.push(record);
        saveQueue(queue);
        console.log('[OfflineSync] Queued:', type, record.id);
        return record.id;
    }

    function getQueueCount() {
        return getQueue().length;
    }

    function getQueueCountByType(type) {
        var queue = getQueue();
        var count = 0;
        for (var i = 0; i < queue.length; i++) {
            if (queue[i].type === type) count++;
        }
        return count;
    }

    function hasPendingType(type) {
        return getQueueCountByType(type) > 0;
    }

    function syncNow() {
        return new Promise(function(resolve) {
            var queue = getQueue();

            if (queue.length === 0) {
                resolve({ synced: 0, failed: 0, message: 'Queue empty' });
                return;
            }

            if (!navigator.onLine) {
                resolve({ synced: 0, failed: 0, message: 'Offline' });
                return;
            }

            var synced = 0;
            var failed = 0;
            var processed = 0;
            var remainingQueue = [];

            function processNext() {
                if (processed >= queue.length) {
                    saveQueue(remainingQueue);
                    console.log('[OfflineSync] Done. Synced:', synced, 'Failed:', failed);

                    if (synced > 0 && typeof RBOffline !== 'undefined') {
                        RBOffline.setLastSync(Date.now());
                    }

                    resolve({ synced: synced, failed: failed });
                    return;
                }

                var record = queue[processed];
                processed++;

                sendToServer(record)
                    .then(function() {
                        synced++;
                        processNext();
                    })
                    .catch(function(err) {
                        console.log('[OfflineSync] Failed:', record.id, err.message);
                        record.retries = (record.retries || 0) + 1;
                        if (record.retries < 5) {
                            remainingQueue.push(record);
                        } else {
                            failed++;
                        }
                        processNext();
                    });
            }

            processNext();
        });
    }

    function sendToServer(record) {
        return new Promise(function(resolve, reject) {
            var endpoint = '';
            var payload = record.data;

            switch (record.type) {
                case 'shift_start':
                    endpoint = '/staff/shift-start.php';
                    break;
                case 'shift_end':
                    endpoint = '/staff/shift-end.php';
                    break;
                case 'vehicle_entry':
                    endpoint = '/camera/detect.php';
                    break;
                case 'vehicle_exit':
                    endpoint = '/vehicle/exit.php';
                    break;
                case 'visitor_checkin':
                    endpoint = '/visitor/checkin.php';
                    break;
                case 'visitor_checkout':
                    endpoint = '/visitor/checkout.php';
                    break;
                case 'patrol_scan':
                    endpoint = '/patrol/scan.php';
                    break;
                case 'staff_location':
                    endpoint = '/staff/location.php';
                    break;
                default:
                    reject(new Error('Unknown record type: ' + record.type));
                    return;
            }

            // Attach the record's original timestamp so the server
            // can store it as client_time / client_started_at etc.
            if (record.created_at && !payload.client_time) {
                payload = Object.assign({}, payload, { client_time: record.created_at });
            }

            var url = 'https://www.pajhub.co.ke/api/v1' + endpoint;
            var xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/json');

            var token = localStorage.getItem('rb_token');
            if (token) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + token);
                xhr.setRequestHeader('X-Auth-Token', token);
            }

            xhr.timeout = 20000;

            xhr.onreadystatechange = function() {
                if (xhr.readyState === 4) {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            var res = JSON.parse(xhr.responseText);
                            if (res.success) {
                                resolve(res);
                            } else {
                                reject(new Error(res.error || 'Server rejected'));
                            }
                        } catch (e) {
                            reject(new Error('Invalid server response'));
                        }
                    } else {
                        reject(new Error('HTTP ' + xhr.status));
                    }
                }
            };

            xhr.onerror = function() { reject(new Error('Network error')); };
            xhr.ontimeout = function() { reject(new Error('Timeout')); };

            xhr.send(JSON.stringify(payload));
        });
    }

    window.addEventListener('online', function() {
        console.log('[OfflineSync] Network restored - syncing...');
        syncNow().then(function(result) {
            if (result.synced > 0 && typeof RBApp !== 'undefined') {
                RBApp.showToast('✅ Synced ' + result.synced + ' record(s)', 'success');
            }
        });
    });

    setInterval(function() {
        if (navigator.onLine && getQueueCount() > 0) {
            syncNow();
        }
    }, SYNC_INTERVAL);

    return {
        queueRecord: queueRecord,
        getQueueCount: getQueueCount,
        getQueueCountByType: getQueueCountByType,
        hasPendingType: hasPendingType,
        syncNow: syncNow
    };
})();


/* ============================================================
   RBOffline — network bar + last-sync tracking
   Reuses existing #networkBar element
   ============================================================ */

var RBOffline = (function () {

    var _online = true;
    var _listeners = [];
    var _hideTimer = null;

    var KEY_LAST_SYNC    = 'rb_last_sync';
    var KEY_FORCE_ONLINE = 'rb_force_online';

    function init() {
        _online = (navigator.onLine !== false);
        updateNetworkBar();

        window.addEventListener('online',  function () { setOnline(true);  });
        window.addEventListener('offline', function () { setOnline(false); });

        if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Network) {
            try {
                Capacitor.Plugins.Network.addListener('networkStatusChange', function (status) {
                    setOnline(!!status.connected);
                });
                Capacitor.Plugins.Network.getStatus().then(function (status) {
                    setOnline(!!status.connected);
                }).catch(function () { /* ignore */ });
            } catch (e) { /* ignore */ }
        }
    }

    function isOnline()  { return _online; }
    function isOffline() { return !_online; }

    function setOnline(v) {
        if (_online === v) return;
        _online = v;
        emit({ type: v ? 'online' : 'offline' });
        updateNetworkBar();
    }

    function setForceOnline(v) {
        try {
            if (v) localStorage.setItem(KEY_FORCE_ONLINE, '1');
            else   localStorage.removeItem(KEY_FORCE_ONLINE);
        } catch (e) { /* ignore */ }
        setOnline(!!v);
    }

    function isForceOnline() {
        try { return localStorage.getItem(KEY_FORCE_ONLINE) === '1'; }
        catch (e) { return false; }
    }

    function getLastSync() {
        try {
            var v = localStorage.getItem(KEY_LAST_SYNC);
            return v ? parseInt(v, 10) : 0;
        } catch (e) { return 0; }
    }

    function setLastSync(ts) {
        try {
            localStorage.setItem(KEY_LAST_SYNC, String(ts || Date.now()));
        } catch (e) { /* ignore */ }
        updateNetworkBar();
    }

    function humanLastSync() {
        var ts = getLastSync();
        if (!ts) return 'never';
        var diff = Math.floor((Date.now() - ts) / 1000);
        if (diff < 10)    return 'just now';
        if (diff < 60)    return diff + 's ago';
        if (diff < 3600)  return Math.floor(diff / 60) + 'm ago';
        if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
        return Math.floor(diff / 86400) + 'd ago';
    }

    function on(fn) { _listeners.push(fn); }

    function emit(evt) {
        for (var i = 0; i < _listeners.length; i++) {
            try { _listeners[i](evt); } catch (e) { /* ignore */ }
        }
    }

    function getBar() {
        var bar = document.getElementById('networkBar');
        if (!bar) bar = document.getElementById('network-bar');
        return bar;
    }

    function updateNetworkBar() {
        var bar = getBar();
        if (!bar) return;

        var pending = 0;
        if (typeof OfflineSync !== 'undefined') {
            try { pending = OfflineSync.getQueueCount(); } catch (e) { pending = 0; }
        }

        if (_hideTimer) {
            clearTimeout(_hideTimer);
            _hideTimer = null;
        }

        if (_online) {
            bar.className = 'network-bar online show';
            bar.textContent = '● Online' +
                (pending > 0 ? ' — ' + pending + ' pending' : '');
            _hideTimer = setTimeout(function () {
                var b = getBar();
                if (b && _online) b.classList.remove('show');
            }, 3000);
        } else {
            bar.className = 'network-bar offline show';
            bar.textContent = '⚠ Working Offline' +
                (pending > 0 ? ' — ' + pending + ' queued' : '');
        }
    }

    return {
        init:             init,
        isOnline:         isOnline,
        isOffline:        isOffline,
        setOnline:        setOnline,
        setForceOnline:   setForceOnline,
        isForceOnline:    isForceOnline,
        getLastSync:      getLastSync,
        setLastSync:      setLastSync,
        humanLastSync:    humanLastSync,
        on:               on,
        updateNetworkBar: updateNetworkBar
    };

})();
