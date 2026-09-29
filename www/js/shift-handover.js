/**
 * ============================================================
 * SHIFT HANDOVER — Controller (Sprint 4)
 * ============================================================
 * Fingerprint-locked holder flow.
 *
 * Rules:
 *   - Only one guard holds the phone at a time.
 *   - To take the phone: fingerprint prompt.
 *   - To clock a guard in/out: that guard types their own PIN.
 *   - To end your own shift: your own PIN.
 */

var RBShiftHandover = (function () {

    var _posts = [];
    var _onDuty = [];
    var _allStaff = [];
    var _deviceHolder = null;
    var _currentUser = null;
    var _pendingAction = null;

    // ----------------------------------------------------------
    // Helpers
    // ----------------------------------------------------------
    function getCurrentUser() {
        return (typeof RBAuth !== 'undefined' && RBAuth.getCurrentUser)
            ? RBAuth.getCurrentUser()
            : null;
    }

    function escapeHtml(t) {
        if (!t) return '';
        var d = document.createElement('div');
        d.textContent = t;
        return d.innerHTML;
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
