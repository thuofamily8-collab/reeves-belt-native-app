/**
 * ============================================================
 * REEVES BELT SECURE 360 - OFFLINE SYNC ENGINE
 * Queues records when offline, auto-syncs when online
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

            switch (record.type) {
                case 'vehicle_entry': endpoint = '/camera/detect.php'; break;
                case 'visitor_checkin': endpoint = '/visitor/checkin.php'; break;
                case 'patrol_scan': endpoint = '/patrol/scan.php'; break;
                default: reject(new Error('Unknown record type: ' + record.type)); return;
            }

            var url = 'https://www.pajhub.co.ke/api/v1' + endpoint;
            var xhr = new XMLHttpRequest();
            xhr.open('POST', url, true);
            xhr.setRequestHeader('Content-Type', 'application/json');

            var token = localStorage.getItem('rb_token');
            if (token) {
                xhr.setRequestHeader('Authorization', 'Bearer ' + token);
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

            xhr.send(JSON.stringify(record.data));
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
        syncNow: syncNow
    };
})();
