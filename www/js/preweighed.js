/**
 * ============================================================
 * REEVES BELT APP - PRE-WEIGHED TRUCKS UI
 * ============================================================
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

        // Everyone with a role can add; only guards/supervisors/admin
        var canAdd = ['guard', 'supervisor'].indexOf(role) !== -1 || isSuper;

        var addBtn = document.getElementById('pwAddBtn');
        if (addBtn && !canAdd) addBtn.style.display = 'none';

        loadList();

        // Refresh every 30s while online
        setInterval(function () {
            if (!document.hidden && typeof RBOffline !== 'undefined' && RBOffline.isOnline()) {
                loadList(true);
            }
        }, 30000);
    }

    function loadList(silent) {
        if (!silent) showLoading('Loading trucks...');
        else hideLoading();

        var params = {};

        var dateEl = document.getElementById('pwFilterDate');
        if (dateEl && dateEl.value) params.date = dateEl.value;

        var statusEl = document.getElementById('pwFilterStatus');
        if (statusEl && statusEl.value) params.status = statusEl.value;

        var plateEl = document.getElementById('pwFilterPlate');
        if (plateEl && plateEl.value) params.plate = plateEl.value;

        RBApi.preweighedList(params).then(function (res) {
            hideLoading();
            var payload = (res.data && res.data.data) ? res.data.data : res.data;
            var trucks = (payload && payload.trucks) || [];
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
        // Nothing special to init; the form handles submission
    }

    function submitAdd() {
        var plate = (document.getElementById('pwPlate').value || '').trim().toUpperCase();
        if (!plate) { showToast('Enter vehicle plate', 'error'); return; }

        var payload = {
            vehicle_plate:       plate,
            driver_name:         (document.getElementById('pwDriverName').value || '').trim() || null,
            driver_phone:        (document.getElementById('pwDriverPhone').value || '').trim() || null,
            transporter_company: (document.getElementById('pwCompany').value || '').trim() || null,
            product_type:        document.getElementById('pwProduct').value || null,
            declared_weight_kg:  parseFloat(document.getElementById('pwWeight').value) || null,
            notes:               (document.getElementById('pwNotes').value || '').trim() || null
        };

        showLoading('Saving truck...');

        RBApi.preweighedCreate(payload).then(function (res) {
            hideLoading();
            var data = (res.data && res.data.data) ? res.data.data : res.data;
            if (navigator.vibrate) navigator.vibrate(150);
            showToast('✅ Recorded. Code: ' + data.unique_code, 'success');
            setTimeout(function () {
                window.location.href = 'preweighed-list.html';
            }, 1000);
        }).catch(function (err) {
            hideLoading();
            showToast('Failed: ' + (err.error || 'network error'), 'error');
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
            var payload = (res.data && res.data.data) ? res.data.data : res.data;
            var trucks = (payload && payload.trucks) || [];
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

        // Disable sample button if already sampled
        var sampleBtn = document.getElementById('pwSampleBtn');
        if (sampleBtn) {
            if (t.status !== 'parked') {
                sampleBtn.disabled = true;
                sampleBtn.style.opacity = '0.5';
                sampleBtn.textContent = '✓ Sample already taken';
            }
        }

        // Store for reveal
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
            var data = (res.data && res.data.data) ? res.data.data : res.data;
            if (!data || !data.truck) {
                showToast('Code not found', 'error');
                return;
            }
            renderReveal(data);
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
                    '<div style="font-size:12px; color:#ccd6f6;">Witnesses: ' + escapeHtml(data.sample.witness1_name || '—') + ' / ' + escapeHtml(data
