/**
 * ============================================================
 * REEVES BELT APP - PRINTER REGISTRY CLIENT
 * ============================================================
 * Manages the printer registry, picks the right printer for a
 * module, and dispatches ESC/POS bytes to the printer over BT /
 * USB / network via the @devlas/capacitor-thermal-printer plugin.
 *
 * If the plugin isn't installed, all calls fail gracefully with
 * a clear error the app can display.
 * ============================================================
 */

var RBPrinters = (function () {

    var _cache = null;
    var _cacheAt = 0;
    var CACHE_TTL_MS = 30000;

    // ----------------------------------------------------------
    // Native plugin access
    // ----------------------------------------------------------
    function _plugin() {
        try {
            if (window.Capacitor && window.Capacitor.Plugins &&
                window.Capacitor.Plugins.ThermalPrinter) {
                return window.Capacitor.Plugins.ThermalPrinter;
            }
        } catch (e) { /* ignore */ }
        return null;
    }

    function _bytesToBase64(bytes) {
        var bin = '';
        for (var i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
        return btoa(bin);
    }

    // ----------------------------------------------------------
    // Fetch printers from server
    // ----------------------------------------------------------
    function loadPrinters(force) {
        if (!force && _cache && (Date.now() - _cacheAt) < CACHE_TTL_MS) {
            return Promise.resolve(_cache);
        }
        return RBApi.request('/printers/list.php', { method: 'GET' })
            .then(function (res) {
                if (!res.ok) throw new Error(res.message || 'Failed to load printers');
                var data = (res.data && res.data.data) ? res.data.data : res.data;
                _cache = data.printers || [];
                _cacheAt = Date.now();
                return _cache;
            });
    }

    function clearCache() {
        _cache = null;
        _cacheAt = 0;
    }

    // ----------------------------------------------------------
    // Find the printer that handles a given module
    // ----------------------------------------------------------
    function findPrinterForModule(moduleKey, tenantId) {
        return loadPrinters().then(function (printers) {
            var candidates = [];
            for (var i = 0; i < printers.length; i++) {
                var p = printers[i];
                if (!p.is_active) continue;
                if (tenantId && p.tenant_id !== tenantId) continue;

                for (var j = 0; j < (p.modules || []).length; j++) {
                    var m = p.modules[j];
                    if (m.module_key === moduleKey && m.is_enabled) {
                        candidates.push({ printer: p, priority: m.priority || 10 });
                        break;
                    }
                }
            }

            if (candidates.length === 0) return null;

            // Sort by priority (lower = higher priority)
            candidates.sort(function (a, b) { return a.priority - b.priority; });
            return candidates[0].printer;
        });
    }

    // ----------------------------------------------------------
    // Dispatch ESC/POS bytes to a printer record
    // ----------------------------------------------------------
    function print(printerRecord, bytes) {
        if (!printerRecord) {
            return Promise.reject(new Error('No printer configured for this module'));
        }

        var plugin = _plugin();
        if (!plugin) {
            return Promise.reject(new Error('Printer plugin not available (build missing)'));
        }

        var base64 = _bytesToBase64(bytes);

        if (printerRecord.connection === 'bluetooth') {
            if (!printerRecord.bt_address) {
                return Promise.reject(new Error('No Bluetooth address set for ' + printerRecord.printer_name));
            }
            return plugin.print({
                transport: 'bluetooth',
                address: printerRecord.bt_address,
                data: base64
            });
        }

        if (printerRecord.connection === 'usb') {
            return plugin.print({
                transport: 'usb',
                data: base64
            });
        }

        if (printerRecord.connection === 'network' || printerRecord.connection === 'wifi') {
            if (!printerRecord.ip_address) {
                return Promise.reject(new Error('No IP address set for ' + printerRecord.printer_name));
            }
            return plugin.print({
                transport: 'tcp',
                host: printerRecord.ip_address,
                port: printerRecord.port || 9100,
                data: base64
            });
        }

        return Promise.reject(new Error('Unsupported connection: ' + printerRecord.connection));
    }

    // ----------------------------------------------------------
    // High-level helper: print by module
    // ----------------------------------------------------------
    function printByModule(moduleKey, bytes, tenantId) {
        return findPrinterForModule(moduleKey, tenantId).then(function (printer) {
            if (!printer) {
                return Promise.reject(new Error('No printer assigned to module "' + moduleKey + '"'));
            }
            return print(printer, bytes).then(function () {
                return { ok: true, printer: printer };
            });
        });
    }

    return {
        loadPrinters: loadPrinters,
        clearCache: clearCache,
        findPrinterForModule: findPrinterForModule,
        print: print,
        printByModule: printByModule
    };

})();
