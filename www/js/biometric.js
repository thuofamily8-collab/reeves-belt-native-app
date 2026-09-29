/**
 * ============================================================
 * REEVES BELT APP — BIOMETRIC WRAPPER
 * ============================================================
 * Wraps @aparajita/capacitor-biometric-auth.
 *
 * Supports:
 *   - Fingerprint / Face / Iris on modern Android
 *   - Fallback to device PIN/pattern/password
 *     (via allowDeviceCredential)
 *
 * Works on Android 6 through Android 16.
 * No manual IV generation (avoids StrongBox/TEE crashes).
 */

var RBBiometric = (function () {

    var _lastCheck = null;

    function _plugin() {
        if (typeof Capacitor === 'undefined' ||
            !Capacitor.Plugins ||
            !Capacitor.Plugins.BiometricAuth) {
            return null;
        }
        return Capacitor.Plugins.BiometricAuth;
    }

    /**
     * Check availability.
     * Resolves: { available: bool, reason: string, code: string }
     */
    function isAvailable() {
        var plugin = _plugin();
        if (!plugin) {
            return Promise.resolve({
                available: false,
                reason: 'plugin_missing',
                code: 'plugin_missing'
            });
        }

        return plugin.checkBiometry()
            .then(function (res) {
                _lastCheck = res;
                return {
                    available: !!(res && res.isAvailable),
                    reason:    (res && res.reason)    || '',
                    code:      (res && res.code)      || '',
                    biometryType: (res && res.biometryType) || 0
                };
            })
            .catch(function (err) {
                _lastCheck = null;
                return {
                    available: false,
                    reason: (err && err.message) || 'check_failed',
                    code:   (err && err.code)    || 'check_failed'
                };
            });
    }

    /**
     * Prompt for biometric authentication.
     * Resolves: { ok: true }
     * Rejects:  { code, message }
     *
     * Common error codes:
     *   userCancel
     *   biometryNotEnrolled
     *   biometryLockout
     *   biometryNotAvailable
     *   passcodeNotSet
     *   userFallback
     */
    function verify(reason) {
        var plugin = _plugin();
        if (!plugin) {
            return Promise.reject({
                code: 'plugin_missing',
                message: 'Biometric plugin not available on this device'
            });
        }

        var opts = {
            reason:                       reason || 'Verify your identity to continue',
            cancelTitle:                  'Cancel',
            allowDeviceCredential:        true,
            iosFallbackTitle:             'Use device passcode',
            androidTitle:                 'Reeves Belt Security',
            androidSubtitle:              'Authenticate to continue',
            androidConfirmationRequired:  false,
            androidBiometryStrength:      'weak' // accept any strength
        };

        return plugin.authenticate(opts)
            .then(function () {
                return { ok: true };
            })
            .catch(function (err) {
                return Promise.reject({
                    code:    (err && err.code)    || 'unknown',
                    message: (err && err.message) || 'Authentication failed'
                });
            });
    }

    return {
        isAvailable: isAvailable,
        verify:      verify
    };

})();
