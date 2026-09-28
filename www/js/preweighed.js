/**
 * ============================================================
 * REEVES BELT APP - PRE-WEIGHED TRUCKS UI
 * ============================================================
 * Supports both sampled and non-sampled trucks.
 * Handles flat and nested response shapes.
 */

var RBPreweighed = (function () {

    // ----------------------------------------------------------
    // LIST PAGE
    // ----------------------------------------------------------
    function initListPage() {
        if (!RBAuth.requireLogin()) return;

        var user = RBAuth.getCurrentUser();
        var isSuper = user && user.is_super_admin;
        var role = user ? user.role : '';
        var canAdd = ['guard', 'supervisor'].indexOf(role) !== -1 || isSuper;

        var addBtn = document.getElementById('pwAddBtn');
        if (addBtn && !canAdd) addBtn.style.display = 'none';

        loadList();

        setInterval(function () {
            if (!document.hidden && typeof RBOffline !== 'undefined' && RBOffline.isOnline()) {
                loadList(true);
            }
        }, 30000);
    }

    function loadList(silent) {
        if (!silent) showLoading('Loading trucks...');

        var params = {};
        var dateEl = document.getElementById('pwFilterDate');
        if (dateEl && dateEl.value) params.date = dateEl.value;
        var statusEl = document.getElementById('pwFilterStatus');
        if (statusEl && statusEl.value) params.status = statusEl.value;
        var plateEl = document.getElementById('pwFilterPlate');
        if (plateEl && plateEl.value) params.plate = plateEl.value;

        RBApi.preweighedList(params).then(function (res) {
            hideLoading();
            var trucks = (res && res.trucks) || (res.data && res.data.trucks) || [];
            renderList(trucks);
        }).catch(function (err) {
            hideLoading();
            showToast('Failed to load: ' + (err.error || 'network error'), 'error');
        });
    }

    function renderList(trucks) {
        var container = document.getElementById('pwList');
        if (!container) return;

        if (!trucks || trucks.length === 0) {
            container.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">🚛</div>' +
                    '<p>No trucks found</p>' +
                    '<p style="font-size:12px; color:#6b7280; margin-top:10px;">Tap "+ Add Truck" to record one</p>' +
                '</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < trucks.length; i++) {
            var t = trucks[i];
            var statusColor = statusToColor(t.status);
            var statusLabel = statusToLabel(t.status);
            var samplingBadge = t.requires_sampling
                ? '<div style="display:inline-block; margin-top:8px; padding:3px 8px; background:rgba(245,158,11,0.2); border:1px solid #f59e0b; border-radius:6px; font-size:10px; color:#f59e0b; font-weight:700; letter-spacing:1px;">🧪 SAMPLE REQUIRED</div>'
                : '<div style="display:inline-block; margin-top:8px; padding:3px 8px; background:rgba(16,185,129,0.2); border:1px solid #10b981; border-radius:6px; font-size:10px; color:#10b981; font-weight:700; letter-spacing:1px;">⚡ DIRECT CALL-IN</div>';

            html +=
                '<div class="vehicle-info-card" onclick="RBPreweighed.openDetail(' + t.id + ')" style="cursor:pointer;">' +
                    '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">' +
                        '<div class="vehicle-info-plate" style="font-size:18px;">' + escapeHtml(t.vehicle_plate) + '</div>' +
                        '<div style="background:' + statusColor + '; color:#fff; font-size:10px; font-weight:800; letter-spacing:1px; padding:4px 8px; border-radius:6px; text-transform:uppercase;">' +
                            statusLabel +
                        '</div>' +
                    '</div>' +
                    '<div style="display:flex; align-items:center; gap:8px; margin-top:10px; padding:8px 10px; background:rgba(212,175,55,0.15); border-radius:8px;">' +
                        '<span style="font-size:10px; color:#d4af37; font-weight:700; letter-spacing:1px;">CODE</span>' +
                        '<span style="font-family:\'Courier New\',monospace; font-size:20px; font-weight:900; color:#f0d060; letter-spacing:3px;">' + escapeHtml(t.unique_code) + '</span>' +
                    '</div>' +
                    '<div class="vehicle-info-detail" style="margin-top:10px;">👤 ' + escapeHtml(t.driver_name || '—') + '</div>' +
                    '<div class="vehicle-info-detail">📦 ' + escapeHtml(t.product_type || '—') + '</div>' +
                    '<div class="vehicle-info-detail">🕐 ' + escapeHtml(formatTime(t.arrival_at || t.created_at)) + '</div>' +
                    samplingBadge +
                '</div>';
        }
        container.innerHTML = html;
    }

    function statusToColor(s) {
        switch (s) {
            case 'parked':    return '#3b82f6';
            case 'sampled':   return '#f59e0b';
            case 'called_in': return '#10b981';
            case 'weighed':   return '#7c3aed';
            case 'departed':  return '#6b7280';
            case 'cancelled': return '#ef4444';
            default:          return '#6b7280';
        }
    }

    function statusToLabel(s) {
        switch (s) {
            case 'parked':    return 'PARKED';
            case 'sampled':   return 'SAMPLED';
            case 'called_in': return 'CALLED IN';
            case 'weighed':   return 'WEIGHED';
            case 'departed':  return 'DEPARTED';
            case 'cancelled': return 'CANCELLED';
            default:          return String(s).toUpperCase();
        }
    }

    // ----------------------------------------------------------
    // ADD PAGE
    // ----------------------------------------------------------
    function initAddPage() {
        if (!RBAuth.requireLogin()) return;
    }

    function submitAdd() {
        var plate = (document.getElementById('pwPlate').value || '').trim().toUpperCase();
        if (!plate) { showToast('Enter vehicle plate', 'error'); return; }

        var samplingEl = document.getElementById('pwRequiresSampling');

        var payload = {
            vehicle_plate:       plate,
            driver_name:         (document.getElementById('pwDriverName').value || '').trim() || null,
            driver_phone:        (document.getElementById('pwDriverPhone').value || '').trim() || null,
            transporter_company: (document.getElementById('pwCompany').value || '').trim() || null,
            product_type:        document.getElementById('pwProduct').value || null,
            requires_sampling:   samplingEl ? !!samplingEl.checked : true,
            declared_weight_kg:  parseFloat(document.getElementById('pwWeight').value) || null,
            notes:               (document.getElementById('pwNotes').value || '').trim() || null
        };

        showLoading('Saving truck...');

        RBApi.preweighedCreate(payload).then(function (res) {
            hideLoading();
            var code = res.unique_code || (res.data && res.data.unique_code) || '—';
            if (navigator.vibrate) navigator.vibrate(150);
            showToast('✅ Recorded. Code: ' + code, 'success');
            setTimeout(function () {
                window.location.href = 'preweighed-list.html';
            }, 1200);
        }).catch(function (err) {
            hideLoading();
            var msg = err && (err.error || err.message) ? (err.error || err.message) : 'network error';
            showToast('Failed: ' + msg, 'error');
        });
    }

    // ----------------------------------------------------------
    // DETAIL PAGE
    // ----------------------------------------------------------
    var _currentTruckId = null;

    function openDetail(truckId) {
        window.location.href = 'preweighed-detail.html?id=' + truckId;
    }

    function initDetailPage() {
        if (!RBAuth.requireLogin()) return;

        var params = new URLSearchParams(window.location.search);
        var truckId = parseInt(params.get('id'), 10);
        if (!truckId) {
            showToast('Missing truck id', 'error');
            setTimeout(function () { window.location.href = 'preweighed-list.html'; }, 800);
            return;
        }
        _currentTruckId = truckId;

        showLoading('Loading truck...');
        RBApi.preweighedList({ date: 'all', limit: 500 }).then(function (res) {
            hideLoading();
            var trucks = (res && res.trucks) || (res.data && res.data.trucks) || [];
            var truck = null;
            for (var i = 0; i < trucks.length; i++) {
                if (trucks[i].id === truckId) { truck = trucks[i]; break; }
            }
            if (!truck) {
                showToast('Truck not found', 'error');
                setTimeout(function () { window.location.href = 'preweighed-list.html'; }, 800);
                return;
            }
            renderDetail(truck);
        }).catch(function (err) {
            hideLoading();
            showToast('Failed: ' + (err.error || 'network error'), 'error');
        });
    }

    function renderDetail(t) {
        setText('pwDetailPlate', t.vehicle_plate);
        setText('pwDetailCode', t.unique_code);
        setText('pwDetailStatus', statusToLabel(t.status));
        setText('pwDetailDriver', t.driver_name || '—');
        setText('pwDetailPhone', t.driver_phone || '—');
        setText('pwDetailCompany', t.transporter_company || '—');
        setText('pwDetailProduct', t.product_type || '—');
        setText('pwDetailWeight', t.declared_weight_kg ? t.declared_weight_kg + ' kg' : '—');
        setText('pwDetailArrival', formatTime(t.arrival_at || t.created_at));
        setText('pwDetailNotes', t.notes || '—');

        var statusEl = document.getElementById('pwDetailStatus');
        if (statusEl) statusEl.style.background = statusToColor(t.status);

        // Sampling status display
        var samplingEl = document.getElementById('pwDetailSampling');
        if (samplingEl) {
            if (t.requires_sampling) {
                samplingEl.textContent = '✓ Yes — sample required';
                samplingEl.style.color = '#f59e0b';
            } else {
                samplingEl.textContent = '✗ No — call in directly';
                samplingEl.style.color = '#10b981';
            }
        }

        // Sample button gating
        var sampleBtn = document.getElementById('pwSampleBtn');
        if (sampleBtn) {
            if (!t.requires_sampling) {
                sampleBtn.style.display = 'none';
            } else if (t.status !== 'parked') {
                sampleBtn.style.display = 'block';
                sampleBtn.disabled = true;
                sampleBtn.style.opacity = '0.5';
                sampleBtn.textContent = '✓ Sample already taken';
            } else {
                sampleBtn.style.display = 'block';
                sampleBtn.disabled = false;
                sampleBtn.style.opacity = '1';
                sampleBtn.textContent = '🧪 Take Sample';
            }
        }

        window._pwCurrentTruck = t;
    }

    function goToSample() {
        if (!_currentTruckId) return;
        window.location.href = 'preweighed-sample.html?id=' + _currentTruckId;
    }

    function revealCode() {
        var code = (document.getElementById('pwRevealInput').value || '').trim().toUpperCase();
        if (!code) { showToast('Enter a code', 'error'); return; }

        showLoading('Looking up...');
        RBApi.preweighedReveal(code).then(function (res) {
            hideLoading();
            var truck = res.truck || (res.data && res.data.truck) || null;
            var sample = res.sample || (res.data && res.data.sample) || null;
            if (!truck) {
                showToast('Code not found', 'error');
                return;
            }
            renderReveal({ truck: truck, sample: sample });
        }).catch(function (err) {
            hideLoading();
            showToast('Not found: ' + (err.error || 'invalid code'), 'error');
        });
    }

    function renderReveal(data) {
        var t = data.truck;
        var box = document.getElementById('pwRevealResult');
        if (!box) return;

        var sampleHtml = '';
        if (data.sample) {
            sampleHtml =
                '<div style="margin-top:14px; padding-top:14px; border-top:1px dashed #2a3155;">' +
                    '<div style="font-size:11px; color:#8892b0; letter-spacing:1px; margin-bottom:6px;">SAMPLE INFO</div>' +
                    '<div style="font-size:12px; color:#ccd6f6; margin-bottom:4px;">Taken: ' + escapeHtml(formatTime(data.sample.sample_taken_at)) + '</div>' +
                    '<div style="font-size:12px; color:#ccd6f6;">Witnesses: ' + escapeHtml(data.sample.witness1_name || '—') + ' / ' + escapeHtml(data.sample.witness2_name || '—') + '</div>' +
                '</div>';
        }

        // Contextual sampling note
        var samplingNote = '';
        if (t.requires_sampling === false) {
            // Registered as non-sampled (construction materials, machinery, etc.)
            samplingNote = '<div style="margin-top:10px; padding:8px 12px; background:rgba(16,185,129,0.15); border-left:3px solid #10b981; border-radius:6px; font-size:11px; color:#a7f3d0;">⚡ This truck was registered as non-sampled — call in directly.</div>';
        } else if (t.requires_sampling === true && data.sample) {
            // Sampled — sample is on file
            samplingNote = '<div style="margin-top:10px; padding:8px 12px; background:rgba(16,185,129,0.15); border-left:3px solid #10b981; border-radius:6px; font-size:11px; color:#a7f3d0;">✓ Sample already on file — safe to call in.</div>';
        } else if (t.requires_sampling === true && !data.sample) {
            // Sampled type but no sample yet — warn
            samplingNote = '<div style="margin-top:10px; padding:8px 12px; background:rgba(245,158,11,0.15); border-left:3px solid #f59e0b; border-radius:6px; font-size:11px; color:#fde68a;">⚠️ Sample required before calling in — take a sample first.</div>';
        }

        box.innerHTML =
            '<div style="background:#0a192f; border:2px solid #10b981; border-radius:12px; padding:16px; margin-top:14px;">' +
                '<div style="font-size:11px; color:#10b981; letter-spacing:2px; font-weight:800; margin-bottom:10px;">✓ TRUCK FOUND</div>' +
                '<div style="font-size:24px; font-weight:900; color:#f0d060; font-family:\'Courier New\',monospace; letter-spacing:2px; margin-bottom:12px;">' + escapeHtml(t.vehicle_plate) + '</div>' +
                '<div style="font-size:13px; color:#ccd6f6; margin-bottom:4px;">👤 ' + escapeHtml(t.driver_name || '—') + '</div>' +
                '<div style="font-size:13px; color:#ccd6f6; margin-bottom:4px;">📞 ' + escapeHtml(t.driver_phone || '—') + '</div>' +
                '<div style="font-size:13px; color:#ccd6f6; margin-bottom:4px;">📦 ' + escapeHtml(t.product_type || '—') + '</div>' +
                '<div style="font-size:13px; color:#ccd6f6; margin-bottom:4px;">🏢 ' + escapeHtml(t.transporter_company || '—') + '</div>' +
                sampleHtml +
                samplingNote +
                '<button onclick="RBPreweighed.callIn(' + t.id + ')" style="width:100%; margin-top:16px; padding:14px; background:linear-gradient(135deg,#10b981,#059669); color:#fff; border:none; border-radius:10px; font-size:14px; font-weight:800; letter-spacing:1px; cursor:pointer; text-transform:uppercase; box-shadow:0 4px 0 #047857;">🚪 Call In Truck</button>' +
            '</div>';
        box.style.display = 'block';
    }

    // ----------------------------------------------------------
    // CALL IN (creates pending vehicle entry)
    // ----------------------------------------------------------
    function callIn(truckId) {
        if (!confirm('Call this truck in to the weighbridge?')) return;
        showLoading('Calling in truck...');
        RBApi.preweighedCallIn(truckId).then(function (res) {
            hideLoading();
            if (navigator.vibrate) navigator.vibrate(150);
            var pendingId = res.pending_entry_id || (res.data && res.data.pending_entry_id);
            var requiresSampling = res.requires_sampling !== undefined
                ? res.requires_sampling
                : (res.data && res.data.requires_sampling);

            if (requiresSampling === false) {
                showToast('⚡ Non-sampled truck called in', 'success');
            } else {
                showToast('✅ Truck called in — awaiting capture', 'success');
            }

            if (pendingId) {
                setTimeout(function () {
                    window.location.href = 'vehicle-entry.html?pending=' + pendingId;
                }, 900);
            } else {
                setTimeout(function () {
                    window.location.href = 'preweighed-list.html';
                }, 900);
            }
        }).catch(function (err) {
            hideLoading();
            var msg = err && (err.error || err.message) ? (err.error || err.message) : 'network error';
            showToast('Failed: ' + msg, 'error');
        });
    }

    // ----------------------------------------------------------
    // SAMPLE PAGE
    // ----------------------------------------------------------
    var _sampleTruck = null;

    function initSamplePage() {
        if (!RBAuth.requireLogin()) return;

        var params = new URLSearchParams(window.location.search);
        var truckId = parseInt(params.get('id'), 10);
        if (!truckId) {
            showToast('Missing truck id', 'error');
            setTimeout(function () { window.location.href = 'preweighed-list.html'; }, 800);
            return;
        }
        _currentTruckId = truckId;

        showLoading('Loading...');
        RBApi.preweighedList({ date: 'all', limit: 500 }).then(function (res) {
            hideLoading();
            var trucks = (res && res.trucks) || (res.data && res.data.trucks) || [];
            var truck = null;
            for (var i = 0; i < trucks.length; i++) {
                if (trucks[i].id === truckId) { truck = trucks[i]; break; }
            }
            if (truck) {
                _sampleTruck = truck;
                setText('pwSamplePlate', truck.vehicle_plate);
                setText('pwSampleCode', truck.unique_code);
                setText('pwSampleProduct', truck.product_type || '—');
            }
        }).catch(function () {
            hideLoading();
        });
    }

    function submitSample() {
        if (!_currentTruckId) { showToast('No truck loaded', 'error'); return; }

        var w1Name = (document.getElementById('pwW1Name').value || '').trim();
        var w1Id   = (document.getElementById('pwW1Id').value || '').trim();
        var w2Name = (document.getElementById('pwW2Name').value || '').trim();
        var w2Id   = (document.getElementById('pwW2Id').value || '').trim();
        var notes  = (document.getElementById('pwSampleNotes').value || '').trim();

        if (!w1Name || !w1Id) { showToast('Witness 1 name and ID required', 'error'); return; }
        if (!w2Name || !w2Id) { showToast('Witness 2 name and ID required', 'error'); return; }

        showLoading('Recording sample...');

        RBApi.preweighedSampleTaken({
            truck_id: _currentTruckId,
            witness1_name: w1Name,
            witness1_id_no: w1Id,
            witness2_name: w2Name,
            witness2_id_no: w2Id,
            notes: notes || null
        }).then(function (res) {
            hideLoading();
            var labelData = res.label_data
                         || (res.data && res.data.label_data)
                         || {
                             code: res.unique_code || '',
                             sample_taken_at: res.sample_taken_at || '',
                             witness1_name: w1Name,
                             witness2_name: w2Name
                         };
            if (navigator.vibrate) navigator.vibrate(150);
            showLabel({ label_data: labelData });
        }).catch(function (err) {
            hideLoading();
            var msg = err && (err.error || err.message) ? (err.error || err.message) : 'network error';
            showToast('Failed: ' + msg, 'error');
        });
    }

    function showLabel(data) {
        var overlay = document.getElementById('pwLabelOverlay');
        var label   = document.getElementById('pwLabelContent');
        if (!overlay || !label) {
            showToast('✅ Sample recorded', 'success');
            setTimeout(function () { window.location.href = 'preweighed-list.html'; }, 800);
            return;
        }

        var lbl = data.label_data || {};
        label.innerHTML =
            '<div style="text-align:center; padding:24px 16px;">' +
                '<div style="font-size:12px; letter-spacing:3px; color:#8892b0; font-weight:800; margin-bottom:6px;">SAMPLE LABEL</div>' +
                '<div style="font-size:48px; font-weight:900; color:#f0d060; font-family:\'Courier New\',monospace; letter-spacing:6px; margin:14px 0;">' +
                    escapeHtml(lbl.code || '----') +
                '</div>' +
                '<div style="font-size:12px; color:#ccd6f6; margin-bottom:4px;">Taken: ' + escapeHtml(formatTime(lbl.sample_taken_at)) + '</div>' +
                '<div style="font-size:12px; color:#ccd6f6;">W1: ' + escapeHtml(lbl.witness1_name || '') + '</div>' +
                '<div style="font-size:12px; color:#ccd6f6;">W2: ' + escapeHtml(lbl.witness2_name || '') + '</div>' +
            '</div>';

        overlay.style.display = 'flex';

        if (typeof RBPrinters !== 'undefined' && typeof RBLabels !== 'undefined') {
            try {
                var bytes = RBLabels.sampleLabel({
                    code: lbl.code,
                    sample_taken_at: lbl.sample_taken_at,
                    security_name: (RBAuth.getCurrentUser() || {}).full_name || '',
                    witness1_name: lbl.witness1_name,
                    witness2_name: lbl.witness2_name
                }, 58);

                RBPrinters.printByModule('sample_label', bytes).then(function (r) {
                    console.log('[preweighed] label printed on', r.printer.printer_name);
                    showToast('🖨️ Label sent to printer', 'success');
                }).catch(function (err) {
                    console.warn('[preweighed] print skipped:', err.message);
                });
            } catch (e) {
                console.warn('[preweighed] print error', e);
            }
        }
    }

    function closeLabel() {
        var overlay = document.getElementById('pwLabelOverlay');
        if (overlay) overlay.style.display = 'none';
        setTimeout(function () { window.location.href = 'preweighed-list.html'; }, 300);
    }

    // ----------------------------------------------------------
    // REVEAL PAGE
    // ----------------------------------------------------------
    function initRevealPage() {
        if (!RBAuth.requireLogin()) return;
        var input = document.getElementById('pwRevealInput');
        if (input) input.focus();
    }

    // ----------------------------------------------------------
    // HELPERS
    // ----------------------------------------------------------
    function setText(id, value) {
        var el = document.getElementById(id);
        if (el) el.textContent = value;
    }

    function formatTime(ts) {
        if (!ts) return '—';
        try {
            var d = new Date(ts.replace(' ', 'T'));
            if (isNaN(d.getTime())) return ts;
            return d.getFullYear() + '-' +
                   String(d.getMonth() + 1).padStart(2, '0') + '-' +
                   String(d.getDate()).padStart(2, '0') + ' ' +
                   String(d.getHours()).padStart(2, '0') + ':' +
                   String(d.getMinutes()).padStart(2, '0');
        } catch (e) { return ts; }
    }

    function escapeHtml(text) {
        if (!text) return '';
        var div = document.createElement('div');
        div.textContent = text;
        return div.innerHTML;
    }

    function showLoading(text) {
        var el = document.getElementById('loadingText');
        var overlay = document.getElementById('loadingOverlay');
        if (el) el.textContent = text;
        if (overlay) overlay.classList.add('show');
    }

    function hideLoading() {
        var overlay = document.getElementById('loadingOverlay');
        if (overlay) overlay.classList.remove('show');
    }

    function showToast(message, type) {
        if (typeof RBApp !== 'undefined' && RBApp.showToast) {
            RBApp.showToast(message, type);
        } else {
            alert(message);
        }
    }

    return {
        initListPage:   initListPage,
        initAddPage:    initAddPage,
        initDetailPage: initDetailPage,
        initSamplePage: initSamplePage,
        initRevealPage: initRevealPage,
        submitAdd:      submitAdd,
        goToSample:     goToSample,
        submitSample:   submitSample,
        revealCode:     revealCode,
        callIn:         callIn,
        closeLabel:     closeLabel,
        openDetail:     openDetail
    };

})();
