/**
 * ============================================================
 * REEVES BELT APP - GATE PASS PRINTING
 * ============================================================
 * Wires the gate entry and exit pass templates to the printer
 * registry, handles success/failure toasts, and tracks print
 * timestamps back to the server.
 */

var RBGatePasses = (function () {

    var MODULE_ENTRY = 'gate_entry';
    var MODULE_EXIT  = 'gate_exit';

    function getPaperWidth() {
        // Default 58mm; could be read from tenant settings later.
        return 58;
    }

    function printEntryPass(log) {
        if (!log) return Promise.reject(new Error('No log data'));

        var bytes = RBLabels.gateEntryPass(log, getPaperWidth());

        return RBPrinters.printByModule(MODULE_ENTRY, bytes, log.tenant_id)
            .then(function () {
                // Mark printed on server (best-effort)
                return RBApi.request('/vehicle/pass-printed.php', {
                    method: 'POST',
                    body: { log_id: log.id, side: 'entry' }
                }).catch(function () { /* non-fatal */ });
            });
    }

    function printExitPass(log) {
        if (!log) return Promise.reject(new Error('No log data'));

        var bytes = RBLabels.gateExitPass(log, getPaperWidth());

        return RBPrinters.printByModule(MODULE_EXIT, bytes, log.tenant_id)
            .then(function () {
                return RBApi.request('/vehicle/pass-printed.php', {
                    method: 'POST',
                    body: { log_id: log.id, side: 'exit' }
                }).catch(function () { /* non-fatal */ });
            });
    }

    return {
        printEntryPass: printEntryPass,
        printExitPass:  printExitPass
    };

})();
