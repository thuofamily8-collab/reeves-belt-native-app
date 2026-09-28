/**
 * ============================================================
 * REEVES BELT APP - ALCOHOL + EMPLOYEES UI
 * ============================================================
 */

var RBAlcohol = (function () {

    // ----------------------------------------------------------
    // SHARED STATE
    // ----------------------------------------------------------
    var _settings = null;
    var _employeesCache = null;
    var _employeesAt = 0;

    // ----------------------------------------------------------
    // HELPERS
    // ----------------------------------------------------------
    function escapeHtml(t) {
        if (!t) return '';
        var d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
    }

    function formatTime(ts) {
        if (!ts) return '—';
        try {
            var d = new Date(ts.replace(' ', 'T'));
            if (isNaN(d.getTime())) return ts;
            var now = new Date();
            var diff = Math.floor((now - d) / 1000);
            if (diff < 60) return 'Just now';
            if (diff < 3600) return Math.floor(diff / 60) + 'm ago';
            if (diff < 86400) return Math.floor(diff / 3600) + 'h ago';
            return d.getFullYear() + '-' +
                String(d.getMonth() + 1).padStart(2, '0') + '-' +
                String(d.getDate()).padStart(2, '0') + ' ' +
                String(d.getHours()).padStart(2, '0') + ':' +
                String(d.getMinutes()).padStart(2, '0');
        } catch (e) { return ts; }
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

    function getCurrentTenantId() {
        var u = RBAuth.getCurrentUser();
        if (!u) return 1;
        if (u.is_super_admin && u.tenant_id === null) return 1;
        return u.tenant_id || 1;
    }

    // ----------------------------------------------------------
    // LOAD SETTINGS (cached)
    // ----------------------------------------------------------
    function loadSettings(force) {
        if (_settings && !force) return Promise.resolve(_settings);
        var tid = getCurrentTenantId();
        return RBApi.alcoholSettingsGet(tid).then(function (res) {
            var s = res.settings || (res.data && res.data.settings);
            _settings = s;
            return s;
        });
    }

    // ----------------------------------------------------------
    // EMPLOYEES CACHE (10s)
    // ----------------------------------------------------------
    function loadEmployees(force) {
        if (_employeesCache && !force && (Date.now() - _employeesAt) < 10000) {
            return Promise.resolve(_employeesCache);
        }
        var tid = getCurrentTenantId();
        return RBApi.employeesList({ tenant_id: tid, limit: 500, status: 'active' })
            .then(function (res) {
                var emps = (res && res.employees) || (res.data && res.data.employees) || [];
                _employeesCache = emps;
                _employeesAt = Date.now();
                return emps;
            });
    }

    // ==========================================================
    // TEST FORM
    // ==========================================================
    function initTestForm() {
        if (!RBAuth.requireLogin()) return;

        showLoading('Loading employees...');

        Promise.all([loadSettings(), loadEmployees()]).then(function (arr) {
            hideLoading();
            var settings = arr[0];
            var employees = arr[1];

            // Populate employee dropdown
            var sel = document.getElementById('alEmployee');
            if (sel) {
                var opts = ['<option value="">-- Select Employee --</option>'];
                for (var i = 0; i < employees.length; i++) {
                    var e = employees[i];
                    opts.push('<option value="' + e.id + '">' +
                        escapeHtml(e.full_name) + ' (' + escapeHtml(e.employee_code) + ')' +
                        (e.department ? ' · ' + escapeHtml(e.department) : '') +
                        '</option>');
                }
                sel.innerHTML = opts.join('');
                sel.addEventListener('change', onEmployeeChange);
            }

            // Show threshold hint
            var hint = document.getElementById('alThresholdHint');
            if (hint) {
                hint.textContent = 'Pass ≤ ' + settings.pass_threshold_mg.toFixed(3) +
                    ' · Warn ' + settings.warn_threshold_mg.toFixed(3) + '–' + settings.fail_threshold_mg.toFixed(3) +
                    ' · Fail ≥ ' + settings.fail_threshold_mg.toFixed(3) + ' mg/100mL';
            }

            // Wire reading input
            var readingInput = document.getElementById('alReading');
            if (readingInput) {
                readingInput.addEventListener('input', updatePreview);
            }

            updatePreview();
        }).catch(function (err) {
            hideLoading();
            showToast('Failed: ' + (err.error || 'network error'), 'error');
        });
    }

    function onEmployeeChange() {
        // Auto-fill vehicle plate field if the employee happens to be a driver? skip for now
    }

    function updatePreview() {
        var readingEl = document.getElementById('alReading');
        var previewEl = document.getElementById('alPreview');
        if (!readingEl || !previewEl) return;

        var val = parseFloat(readingEl.value);
        if (isNaN(val) || val < 0) {
            previewEl.style.display = 'none';
            return;
        }

        var s = _settings || { pass_threshold_mg: 0, warn_threshold_mg: 0.05, fail_threshold_mg: 0.08 };
        var result, color, label;

        if (val >= s.fail_threshold_mg) {
            result = 'fail'; color = '#ef4444'; label = 'FAIL';
        } else if (val >= s.warn_threshold_mg) {
            result = 'warn'; color = '#f59e0b'; label = 'WARN';
        } else {
            result = 'pass'; color = '#10b981'; label = 'PASS';
        }

        previewEl.style.display = 'block';
        previewEl.innerHTML =
            '<div style="display:flex; align-items:center; gap:12px; padding:14px 16px; background:rgba(' + (result === 'fail' ? '239,68,68' : result === 'warn' ? '245,158,11' : '16,185,129') + ',0.15); border:2px solid ' + color + '; border-radius:10px;">' +
                '<div style="width:14px; height:14px; background:' + color + '; border-radius:50%; box-shadow:0 0 12px ' + color + ';"></div>' +
                '<div style="flex:1;">' +
                    '<div style="font-size:12px; letter-spacing:2px; font-weight:800; color:' + color + '; text-transform:uppercase;">' + label + '</div>' +
                    '<div style="font-size:12px; color:#ccd6f6; margin-top:2px;">Reading: ' + val.toFixed(3) + ' mg/100mL</div>' +
                '</div>' +
            '</div>';
    }

    function submitTest() {
        if (!RBAuth.requireLogin()) return;

        var employeeId = parseInt(document.getElementById('alEmployee').value, 10);
        var readingRaw = document.getElementById('alReading').value.trim();
        var witnessName = document.getElementById('alWitness').value.trim();
        var witnessId = document.getElementById('alWitnessId').value.trim();
        var vehiclePlate = (document.getElementById('alVehiclePlate').value || '').trim().toUpperCase();
        var notes = (document.getElementById('alNotes').value || '').trim();

        if (!employeeId) { showToast('Select an employee', 'error'); return; }
        if (readingRaw === '') { showToast('Enter the reading', 'error'); return; }

        var reading = parseFloat(readingRaw);
        if (isNaN(reading) || reading < 0) { showToast('Invalid reading value', 'error'); return; }

        if (!witnessName) { showToast('Witness name is required', 'error'); return; }

        showLoading('Recording test...');

        RBApi.alcoholTestCreate({
            tenant_id: getCurrentTenantId(),
            employee_id: employeeId,
            reading_mg: reading,
            witness_name: witnessName,
            witness_id_no: witnessId || null,
            vehicle_plate: vehiclePlate || null,
            notes: notes || null
        }).then(function (res) {
            hideLoading();
            if (navigator.vibrate) navigator.vibrate(150);

            var data = res || {};
            var result = data.result || (data.data && data.data.result) || 'pass';

            if (result === 'fail') {
                showToast('⚠️ FAIL — Employee is over the limit', 'error');
                if (navigator.vibrate) navigator.vibrate([200, 100, 200, 100, 200]);
            } else if (result === 'warn') {
                showToast('⚠️ WARN — Reading above pass threshold', 'warning');
            } else {
                showToast('✅ Test recorded — PASS', 'success');
            }

            setTimeout(function () {
                window.location.href = 'alcohol-list.html';
            }, 1500);

        }).catch(function (err) {
            hideLoading();
            var msg = err && (err.error || err.message) ? (err.error || err.message) : 'network error';
            showToast('Failed: ' + msg, 'error');
        });
    }

    // ==========================================================
    // TEST LIST
    // ==========================================================
    function initTestList() {
        if (!RBAuth.requireLogin()) return;

        // Default date = today
        var dateEl = document.getElementById('alFilterDate');
        if (dateEl && !dateEl.value) {
            var now = new Date();
            dateEl.value = now.getFullYear() + '-' +
                String(now.getMonth() + 1).padStart(2, '0') + '-' +
                String(now.getDate()).padStart(2, '0');
        }

        loadTestList();
    }

    function loadTestList() {
        showLoading('Loading tests...');

        var dateEl = document.getElementById('alFilterDate');
        var resultEl = document.getElementById('alFilterResult');
        var searchEl = document.getElementById('alFilterSearch');

        var params = {
            date_start: dateEl ? dateEl.value : 'all',
            date_end:   dateEl ? dateEl.value : 'all',
            tenant_id:  getCurrentTenantId()
        };
        if (resultEl && resultEl.value) params.result = resultEl.value;
        if (searchEl && searchEl.value) params.search = searchEl.value;

        RBApi.alcoholTestList(params).then(function (res) {
            hideLoading();
            var tests = (res && res.tests) || (res.data && res.data.tests) || [];
            var breakdown = (res && res.breakdown) || (res.data && res.data.breakdown) || {};
            var total = (res && res.total) || 0;

            var totalEl = document.getElementById('alTotal');
            if (totalEl) totalEl.textContent = total;

            var passEl = document.getElementById('alPass');
            if (passEl) passEl.textContent = breakdown.pass || 0;

            var warnEl = document.getElementById('alWarn');
            if (warnEl) warnEl.textContent = breakdown.warn || 0;

            var failEl = document.getElementById('alFail');
            if (failEl) failEl.textContent = breakdown.fail || 0;

            renderTestList(tests);
        }).catch(function (err) {
            hideLoading();
            showToast('Failed: ' + (err.error || 'network error'), 'error');
        });
    }

    function renderTestList(tests) {
        var container = document.getElementById('alList');
        if (!container) return;

        if (!tests || tests.length === 0) {
            container.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">🍷</div>' +
                    '<p>No tests found for this filter</p>' +
                '</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < tests.length; i++) {
            var t = tests[i];
            var color = t.result === 'fail' ? '#ef4444' : t.result === 'warn' ? '#f59e0b' : '#10b981';

            html +=
                '<div class="vehicle-info-card">' +
                    '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">' +
                        '<div style="flex:1; min-width:0;">' +
                            '<div style="font-size:16px; font-weight:800; color:#fff; margin-bottom:2px;">' + escapeHtml(t.person_name) + '</div>' +
                            '<div style="font-size:12px; color:#8892b0;">' + escapeHtml(t.person_id_no || '') + (t.department ? ' · ' + escapeHtml(t.department) : '') + '</div>' +
                        '</div>' +
                        '<div style="background:' + color + '; color:#fff; font-size:11px; font-weight:800; letter-spacing:1px; padding:5px 10px; border-radius:6px; text-transform:uppercase;">' +
                            escapeHtml(t.result) +
                        '</div>' +
                    '</div>' +
                    '<div style="display:flex; align-items:center; gap:12px; padding:10px 12px; background:rgba(' + (t.result === 'fail' ? '239,68,68' : t.result === 'warn' ? '245,158,11' : '16,185,129') + ',0.12); border-radius:8px; margin-top:6px;">' +
                        '<span style="font-size:10px; color:' + color + '; font-weight:800; letter-spacing:1px;">READING</span>' +
                        '<span style="font-family:\'Courier New\',monospace; font-size:18px; font-weight:900; color:' + color + ';">' +
                            parseFloat(t.reading_mg).toFixed(3) + ' mg/100mL' +
                        '</span>' +
                    '</div>' +
                    '<div class="vehicle-info-detail" style="margin-top:8px;">🕐 ' + escapeHtml(formatTime(t.tested_at)) + '</div>' +
                    '<div class="vehicle-info-detail">👤 By: ' + escapeHtml(t.tested_by_name || '—') + '</div>' +
                    (t.witness_name ? '<div class="vehicle-info-detail">👥 Witness: ' + escapeHtml(t.witness_name) + '</div>' : '') +
                    (t.vehicle_plate ? '<div class="vehicle-info-detail">🚗 Plate: ' + escapeHtml(t.vehicle_plate) + '</div>' : '') +
                    (t.blocked ? '<div style="margin-top:8px; padding:6px 10px; background:rgba(239,68,68,0.15); border-left:3px solid #ef4444; border-radius:4px; font-size:11px; color:#fecaca; font-weight:700;">🚫 BLOCKED ENTRY</div>' : '') +
                '</div>';
        }
        container.innerHTML = html;
    }

    // ==========================================================
    // EMPLOYEES LIST
    // ==========================================================
    var _empOffset = 0;
    var _empLimit = 100;
    var _empTotal = 0;

    function initEmployeesList() {
        if (!RBAuth.requireLogin()) return;
        loadEmployeesPage(0);
    }

    function loadEmployeesPage(offset) {
        _empOffset = offset || 0;
        showLoading('Loading employees...');

        var searchEl = document.getElementById('empSearch');
        var statusEl = document.getElementById('empStatus');
        var deptEl = document.getElementById('empDept');

        var params = {
            limit: _empLimit,
            offset: _empOffset,
            tenant_id: getCurrentTenantId()
        };
        if (searchEl && searchEl.value) params.search = searchEl.value;
        if (statusEl && statusEl.value) params.status = statusEl.value;
        if (deptEl && deptEl.value) params.department = deptEl.value;

        RBApi.employeesList(params).then(function (res) {
            hideLoading();
            var emps = (res && res.employees) || (res.data && res.data.employees) || [];
            _empTotal = (res && res.total) || emps.length;
            _employeesCache = emps;
            _employeesAt = Date.now();
            renderEmployeesList(emps);
            renderPagination();
        }).catch(function (err) {
            hideLoading();
            showToast('Failed: ' + (err.error || 'network error'), 'error');
        });
    }

    function renderEmployeesList(emps) {
        var container = document.getElementById('empList');
        if (!container) return;

        if (!emps || emps.length === 0) {
            container.innerHTML =
                '<div class="empty-state">' +
                    '<div class="empty-state-icon">👥</div>' +
                    '<p>No employees found</p>' +
                    '<p style="font-size:12px; color:#6b7280; margin-top:8px;">Tap "+ Add Employee" to create one</p>' +
                '</div>';
            return;
        }

        var html = '';
        for (var i = 0; i < emps.length; i++) {
            var e = emps[i];
            var statusColor = e.status === 'active' ? '#10b981' : e.status === 'suspended' ? '#ef4444' : '#6b7280';

            html +=
                '<div class="vehicle-info-card" onclick="RBAlcohol.openEmployee(' + e.id + ')" style="cursor:pointer;">' +
                    '<div style="display:flex; justify-content:space-between; align-items:flex-start; margin-bottom:8px;">' +
                        '<div style="flex:1; min-width:0;">' +
                            '<div style="font-size:16px; font-weight:800; color:#fff; margin-bottom:2px;">' + escapeHtml(e.full_name) + '</div>' +
                            '<div style="font-size:11px; color:#8892b0; font-family:\'Courier New\',monospace;">' + escapeHtml(e.employee_code) + '</div>' +
                        '</div>' +
                        '<div style="background:' + statusColor + '; color:#fff; font-size:10px; font-weight:800; letter-spacing:1px; padding:4px 8px; border-radius:6px; text-transform:uppercase;">' +
                            escapeHtml(e.status) +
                        '</div>' +
                    '</div>' +
                    '<div class="vehicle-info-detail">🆔 ' + escapeHtml(e.id_number) + '</div>' +
                    (e.phone ? '<div class="vehicle-info-detail">📞 ' + escapeHtml(e.phone) + '</div>' : '') +
                    (e.department ? '<div class="vehicle-info-detail">🏢 ' + escapeHtml(e.department) + (e.position ? ' · ' + escapeHtml(e.position) : '') + '</div>' : '') +
                '</div>';
        }
        container.innerHTML = html;
    }

    function renderPagination() {
        var el = document.getElementById('empPagination');
        if (!el) return;

        if (_empTotal <= _empLimit) {
            el.innerHTML = '<div style="text-align:center; color:#6b7280; font-size:12px;">' + _empTotal + ' employees</div>';
            return;
        }

        var totalPages = Math.ceil(_empTotal / _empLimit);
        var currentPage = Math.floor(_empOffset / _empLimit) + 1;

        el.innerHTML =
            '<div style="display:flex; justify-content:center; align-items:center; gap:12px; padding:12px;">' +
                (_empOffset > 0
                    ? '<button class="action-btn blue" style="padding:8px 16px; font-size:12px;" onclick="RBAlcohol.prevPage()">← Prev</button>'
                    : '') +
                '<div style="color:#8892b0; font-size:12px;">Page ' + currentPage + ' of ' + totalPages + '</div>' +
                (_empOffset + _empLimit < _empTotal
                    ? '<button class="action-btn blue" style="padding:8px 16px; font-size:12px;" onclick="RBAlcohol.nextPage()">Next →</button>'
                    : '') +
            '</div>';
    }

    function nextPage() {
        loadEmployeesPage(_empOffset + _empLimit);
    }
    function prevPage() {
        loadEmployeesPage(Math.max(0, _empOffset - _empLimit));
    }

    // ----------------------------------------------------------
    // ADD/EDIT EMPLOYEE
    // ----------------------------------------------------------
    function initEmployeeAdd() {
        if (!RBAuth.requireLogin()) return;

        var params = new URLSearchParams(window.location.search);
        var empId = parseInt(params.get('id'), 10);

        if (empId) {
            // Edit mode — load employee
            document.querySelector('.form-header-title').textContent = '✏️ Edit Employee';
            showLoading('Loading...');
            RBApi.employeesList({ tenant_id: getCurrentTenantId(), limit: 500 })
                .then(function (res) {
                    hideLoading();
                    var emps = (res && res.employees) || (res.data && res.data.employees) || [];
                    for (var i = 0; i < emps.length; i++) {
                        if (emps[i].id === empId) { fillEmployeeForm(emps[i]); return; }
                    }
                    showToast('Employee not found', 'error');
                    setTimeout(function () { window.location.href = 'employees-list.html'; }, 800);
                }).catch(function () { hideLoading(); });
        } else {
            // Add mode — pull next auto code (just informational)
            var codeEl = document.getElementById('empCode');
            if (codeEl) codeEl.placeholder = 'Auto-generated if blank';
        }
    }

    function fillEmployeeForm(e) {
        setVal('empCode', e.employee_code);
        setVal('empFullName', e.full_name);
        setVal('empIdNumber', e.id_number);
        setVal('empPhone', e.phone);
        setVal('empDepartment', e.department);
        setVal('empPosition', e.position);
        setVal('empShift', e.shift);
        setVal('empEmail', e.email);
        setVal('empStatus', e.status);
        setVal('empNotes', e.notes);

        // Store the id on the form
        var form = document.getElementById('employeeForm');
        if (form) form.dataset.employeeId = e.id;
    }

    function setVal(id, value) {
        var el = document.getElementById(id);
        if (el) el.value = value || '';
    }

    function submitEmployee() {
        var form = document.getElementById('employeeForm');
        var empId = form ? parseInt(form.dataset.employeeId || '0', 10) : 0;

        var payload = {
            tenant_id: getCurrentTenantId(),
            employee_code: (document.getElementById('empCode').value || '').trim(),
            full_name: (document.getElementById('empFullName').value || '').trim(),
            id_number: (document.getElementById('empIdNumber').value || '').trim(),
            phone: (document.getElementById('empPhone').value || '').trim(),
            department: (document.getElementById('empDepartment').value || '').trim(),
            position: (document.getElementById('empPosition').value || '').trim(),
            shift: (document.getElementById('empShift').value || '').trim(),
            email: (document.getElementById('empEmail').value || '').trim(),
            status: document.getElementById('empStatus').value || 'active',
            notes: (document.getElementById('empNotes').value || '').trim()
        };

        if (!payload.full_name) { showToast('Full name is required', 'error'); return; }
        if (!payload.id_number) { showToast('ID number is required', 'error'); return; }

        showLoading(empId ? 'Updating employee...' : 'Creating employee...');

        var promise = empId
            ? RBApi.employeeUpdate(Object.assign({}, payload, { employee_id: empId }))
            : RBApi.employeeCreate(payload);

        promise.then(function (res) {
            hideLoading();
            if (navigator.vibrate) navigator.vibrate(100);
            showToast(empId ? '✅ Employee updated' : '✅ Employee created', 'success');
            setTimeout(function () {
                window.location.href = 'employees-list.html';
            }, 1000);
        }).catch(function (err) {
            hideLoading();
            var msg = err && (err.error || err.message) ? (err.error || err.message) : 'network error';
            showToast('Failed: ' + msg, 'error');
        });
    }

    function openEmployee(empId) {
        window.location.href = 'employee-add.html?id=' + empId;
    }

    function deleteEmployee(empId) {
        if (!confirm('Deactivate this employee?')) return;
        showLoading('Deactivating...');
        RBApi.employeeDelete(empId).then(function () {
            hideLoading();
            showToast('✅ Employee deactivated', 'success');
            setTimeout(function () { window.location.href = 'employees-list.html'; }, 800);
        }).catch(function (err) {
            hideLoading();
            showToast('Failed: ' + (err.error || 'network error'), 'error');
        });
    }

    // ==========================================================
    // SETTINGS
    // ==========================================================
    function initSettings() {
        if (!RBAuth.requireLogin()) return;

        var user = RBAuth.getCurrentUser();
        var role = user ? user.role : '';
        var isSuper = user && user.is_super_admin;
        var isCompanyAdmin = role === 'company_admin' || role === 'client_admin';

        if (!isSuper && !isCompanyAdmin) {
            showToast('Access denied — admins only', 'error');
            setTimeout(function () { window.location.href = 'dashboard.html'; }, 800);
            return;
        }

        showLoading('Loading settings...');
        RBApi.alcoholSettingsGet(getCurrentTenantId()).then(function (res) {
            hideLoading();
            var s = res.settings || (res.data && res.data.settings) || {};
            setVal('setPass', s.pass_threshold_mg);
            setVal('setWarn', s.warn_threshold_mg);
            setVal('setFail', s.fail_threshold_mg);
            setVal('setRetest', s.retest_window_seconds);
            setVal('setBlockOnFail', s.block_on_fail ? 1 : 0);
            setVal('setDeviceModel', s.device_model);
            setVal('setDeviceSerial', s.device_serial);
            setVal('setNotes', s.notes);
        }).catch(function (err) {
            hideLoading();
            showToast('Failed: ' + (err.error || 'network error'), 'error');
        });
    }

    function saveSettings() {
        var payload = {
            tenant_id: getCurrentTenantId(),
            pass_threshold_mg: parseFloat(document.getElementById('setPass').value) || 0,
            warn_threshold_mg: parseFloat(document.getElementById('setWarn').value) || 0,
            fail_threshold_mg: parseFloat(document.getElementById('setFail').value) || 0,
            retest_window_seconds: parseInt(document.getElementById('setRetest').value, 10) || 300,
            block_on_fail: document.getElementById('setBlockOnFail').value === '1',
            device_model: (document.getElementById('setDeviceModel').value || '').trim(),
            device_serial: (document.getElementById('setDeviceSerial').value || '').trim(),
            notes: (document.getElementById('setNotes').value || '').trim()
        };

        if (payload.pass_threshold_mg >= payload.fail_threshold_mg) {
            showToast('Pass threshold must be less than fail threshold', 'error');
            return;
        }
        if (payload.warn_threshold_mg > payload.fail_threshold_mg) {
            showToast('Warn threshold must be ≤ fail threshold', 'error');
            return;
        }

        showLoading('Saving...');
        RBApi.alcoholSettingsSave(payload).then(function () {
            hideLoading();
            if (navigator.vibrate) navigator.vibrate(100);
            showToast('✅ Settings saved', 'success');
            _settings = null;  // invalidate cache
        }).catch(function (err) {
            hideLoading();
            showToast('Failed: ' + (err.error || 'network error'), 'error');
        });
    }

    // ==========================================================
    // PUBLIC API
    // ==========================================================
    return {
        initTestForm:        initTestForm,
        submitTest:          submitTest,
        initTestList:        initTestList,
        loadTestList:        loadTestList,
        initEmployeesList:   initEmployeesList,
        loadEmployeesPage:   loadEmployeesPage,
        nextPage:            nextPage,
        prevPage:            prevPage,
        initEmployeeAdd:     initEmployeeAdd,
        submitEmployee:      submitEmployee,
        openEmployee:        openEmployee,
        deleteEmployee:      deleteEmployee,
        initSettings:        initSettings,
        saveSettings:        saveSettings
    };

})();
