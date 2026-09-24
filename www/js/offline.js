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
