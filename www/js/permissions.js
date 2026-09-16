/**
 * Runtime permission helper for Capacitor Android.
 * Ensures camera + location permissions are granted before use.
 */
var RBPermissions = (function() {

    function requestCamera() {
        return new Promise(function(resolve) {
            // If Capacitor Camera plugin is installed, use it (handles runtime prompt)
            if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Camera) {
                Capacitor.Plugins.Camera.requestPermissions({ permissions: ['camera'] })
                    .then(function(result) {
                        resolve(result.camera === 'granted');
                    })
                    .catch(function() {
                        // Fall back to direct getUserMedia
                        tryDirectGetUserMedia(resolve);
                    });
            } else {
                tryDirectGetUserMedia(resolve);
            }
        });
    }

    function tryDirectGetUserMedia(resolve) {
        if (!navigator.mediaDevices || !navigator.mediaDevices.getUserMedia) {
            resolve(false);
            return;
        }
        navigator.mediaDevices.getUserMedia({ video: true })
            .then(function(stream) {
                stream.getTracks().forEach(function(t) { t.stop(); });
                resolve(true);
            })
            .catch(function() {
                resolve(false);
            });
    }

    function requestLocation() {
        return new Promise(function(resolve) {
            if (window.Capacitor && Capacitor.Plugins && Capacitor.Plugins.Geolocation) {
                Capacitor.Plugins.Geolocation.requestPermissions()
                    .then(function() { resolve(true); })
                    .catch(function() { resolve(false); });
            } else {
                resolve(true);
            }
        });
    }

    return {
        requestCamera: requestCamera,
        requestLocation: requestLocation
    };
})();
