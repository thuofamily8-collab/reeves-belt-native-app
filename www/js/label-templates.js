/**
 * ============================================================
 * REEVES BELT APP - LABEL TEMPLATES
 * ============================================================
 * Ready-made ESC/POS byte builders for common print jobs.
 * Each function returns a Uint8Array ready to send to the printer.
 * ============================================================
 */

var RBLabels = (function () {

    function fmtNum(n) {
        if (n === null || n === undefined || n === '') return '--';
        var num = parseFloat(n);
        if (isNaN(num)) return '--';
        return num.toLocaleString('en-KE', { maximumFractionDigits: 2 });
    }

    function fmtTime(ts) {
        if (!ts) return '--';
        try {
            var d = new Date(ts.replace(' ', 'T'));
            return d.toLocaleString('en-GB', {
                day: '2-digit', month: 'short', year: 'numeric',
                hour: '2-digit', minute: '2-digit', second: '2-digit'
            });
        } catch (e) {
            return ts;
        }
    }

    // ============================================================
    // GATE ENTRY PASS
    // ============================================================
    function gateEntryPass(data, paperWidthMm) {
        var b = new ESCPOSBuilder(paperWidthMm || 58);
        var tenant = data.tenant_name || 'Reeves Belt';

        b.init().alignCenter();

        // Title block
        b.boldOn().line(tenant).boldOff();
        b.line('Reeves Belt Security');
        b.hr('=');

        // Big banner
        b.boldOn().doubleSize().line('GATE ENTRY PASS').normalSize().boldOff();

        // Pass number
        b.boldOn().line(data.pass_no || '----').boldOff();
        b.hr('=');

        // Vehicle details
        b.alignLeft();
        b.boldOn().line('[ VEHICLE DETAILS ]').boldOff();
        b.hr('-');
        b.alignCenter();
        b.boldOn().doubleSize().line(data.plate_number || '----').normalSize().boldOff();
        b.alignLeft();
        b.row('TYPE:', data.vehicle_type || '--');
        b.row('MODEL:', data.vehicle_model || '--');
        b.row('COLOR:', data.vehicle_color || '--');
        b.hr('-');

        // Driver details
        b.boldOn().line('[ DRIVER DETAILS ]').boldOff();
        b.hr('-');
        b.row('NAME:', data.driver_name || '--');
        b.row('ID NO:', data.driver_id_number || '--');
        b.row('PHONE:', data.driver_phone || '--');
        b.hr('-');

        // Purpose
        b.boldOn().line('[ PURPOSE OF VISIT ]').boldOff();
        b.hr('-');
        b.row('PURPOSE:', data.purpose || '--');
        b.row('ENTRY TIME:', fmtTime(data.entry_time));
        b.row('WEIGHT IN:', fmtNum(data.entry_weight_kg) + ' KG');
        if (data.preweighed_code) {
            b.row('PRE-WEIGHED:', data.preweighed_code);
        }
        b.hr('-');

        // Approval
        b.boldOn().line('[ APPROVAL & VERIFICATION ]').boldOff();
        b.feed();
        b.line('RECEIVED BY (STORE KEEPER)');
        b.line('_______________________________');
        b.feed();
        b.line('OFFICIAL STAMP');
        b.line('_______________________________');
        b.feed();
        b.row('DATE:', '___________________');
        b.row('TIME OUT:', '______________');
        b.feed();

        // QR placeholder — actually a short text code since
        // ESCPOSBuilder doesn't yet support image QR codes.
        // The app can still render a QR on screen.
        b.alignCenter();
        b.line('[' + (data.pass_no || '') + ']');
        b.feed();

        // Footer
        b.boldOn().line('NOT VALID WITHOUT SIGNATURE').boldOff();
        b.hr('=');
        b.wrap('This pass is property of Reeves Belt Security Co. and must be surrendered at the gate upon exit.', 32)
            .forEach(function (l) { b.line(l); });
        b.feed();
        b.line('Reeves Belt Secure 360');
        b.line('Powered by Lexans Services');
        b.line('+254 720 273 088');
        b.feed(3).cut();

        return b.build();
    }

    // ============================================================
    // GATE EXIT PASS (same pass_no as entry, enriched)
    // ============================================================
    function gateExitPass(data, paperWidthMm) {
        var b = new ESCPOSBuilder(paperWidthMm || 58);
        var tenant = data.tenant_name || 'Reeves Belt';

        b.init().alignCenter();

        // Title block
        b.boldOn().line(tenant).boldOff();
        b.line('Reeves Belt Security');
        b.hr('=');

        // Big banner + EXIT marker
        b.boldOn().doubleSize().line('GATE EXIT PASS').normalSize().boldOff();

        // Same pass number as entry
        b.boldOn().line(data.pass_no || '----').boldOff();

        // Direction badge
        var dir = (data.direction || '').toLowerCase();
        if (dir === 'inbound')       b.boldOn().line('<< INBOUND >>').boldOff();
        else if (dir === 'outbound') b.boldOn().line('>> OUTBOUND <<').boldOff();
        b.hr('=');

        // Vehicle summary
        b.alignLeft();
        b.boldOn().line('[ VEHICLE ]').boldOff();
        b.hr('-');
        b.alignCenter();
        b.boldOn().doubleSize().line(data.plate_number || '----').normalSize().boldOff();
        b.alignLeft();
        b.row('DRIVER:', data.driver_name || '--');
        b.hr('-');

        // Weights table
        b.boldOn().line('[ WEIGHTS ]').boldOff();
        b.hr('-');
        b.row('ENTRY (empty):', fmtNum(data.entry_weight_kg) + ' KG');
        b.row('EXIT (loaded):', fmtNum(data.exit_weight_kg) + ' KG');
        b.boldOn();
        b.row('CARGO:', fmtNum(data.net_weight_kg) + ' KG');
        b.boldOff();
        b.hr('-');

        // Times
        b.boldOn().line('[ TIMES ]').boldOff();
        b.hr('-');
        b.row('ENTERED:', fmtTime(data.entry_time));
        b.row('EXITED:', fmtTime(data.exit_time));
        b.hr('-');

        // Approval
        b.boldOn().line('[ APPROVAL & VERIFICATION ]').boldOff();
        b.feed();
        b.line('EXIT GUARD');
        b.line('_______________________________');
        b.feed();
        b.line('OFFICIAL STAMP');
        b.line('_______________________________');
        b.feed();

        // Pass id for verification
        b.alignCenter();
        b.line('[' + (data.pass_no || '') + ']');
        b.feed();

        // Footer
        b.boldOn().line('NOT VALID WITHOUT SIGNATURE').boldOff();
        b.hr('=');
        b.wrap('This pass is property of Reeves Belt Security Co. This copy is the FINAL exit record.', 32)
            .forEach(function (l) { b.line(l); });
        b.feed();
        b.line('Reeves Belt Secure 360');
        b.line('Powered by Lexans Services');
        b.line('+254 720 273 088');
        b.feed(3).cut();

        return b.build();
    }

    // ============================================================
    // (existing templates preserved below)
    // ============================================================

    function sampleLabel(data, paperWidthMm) {
        var b = new ESCPOSBuilder(paperWidthMm || 58);
        b.init()
         .alignCenter()
         .boldOn().doubleSize()
         .line('SAMPLE').line('LABEL')
         .normalSize().boldOff()
         .feed()
         .boldOn().tripleSize()
         .line(data.code || '----')
         .normalSize().boldOff()
         .feed()
         .alignLeft()
         .hr('=')
         .line('Taken: ' + (data.sample_taken_at || '--'))
         .line('Security: ' + (data.security_name || '--'))
         .line('W1: ' + (data.witness1_name || '--'))
         .line('W2: ' + (data.witness2_name || '--'))
         .hr('=')
         .alignCenter()
         .text('Reeves Belt Secure 360')
         .feed(3).cut();
        return b.build();
    }

    function preweighedSlip(truck, paperWidthMm) {
        var b = new ESCPOSBuilder(paperWidthMm || 80);
        b.init()
         .alignCenter()
         .boldOn().doubleSize()
         .line('PRE-WEIGHED')
         .normalSize().boldOff()
         .feed()
         .alignLeft()
         .hr('=')
         .row('Code:', truck.unique_code || '')
         .row('Plate:', truck.vehicle_plate || '')
         .row('Driver:', truck.driver_name || '')
         .row('Product:', truck.product_type || '')
         .hr('-')
         .line('Arrived: ' + (truck.arrival_at || '--'))
         .feed(3).cut();
        return b.build();
    }

    function visitorPass(data, paperWidthMm) {
        var b = new ESCPOSBuilder(paperWidthMm || 58);
        b.init()
         .alignCenter()
         .boldOn().doubleSize()
         .line('VISITOR')
         .normalSize().boldOff()
         .feed()
         .alignLeft()
         .hr('=')
         .row('Name:', data.visitor_name || '')
         .row('Host:', data.host_name || '')
         .row('In:', data.check_in_time || '')
         .hr('-')
         .line('Purpose: ' + (data.purpose || ''))
         .feed(3).cut();
        return b.build();
    }

    function vehicleReceipt(data, paperWidthMm) {
        var b = new ESCPOSBuilder(paperWidthMm || 80);
        b.init()
         .alignCenter()
         .boldOn().doubleSize()
         .line('VEHICLE')
         .normalSize().boldOff()
         .feed()
         .alignLeft()
         .hr('=')
         .row('Plate:', data.plate_number || '')
         .row('Type:', data.vehicle_type || '')
         .row('Driver:', data.driver_name || '')
         .row('In:', data.entry_time || '')
         .row('Weight:', data.entry_weight_kg || '')
         .hr('-')
         .line('Purpose: ' + (data.purpose || ''))
         .feed(3).cut();
        return b.build();
    }

    function testPage(printerName, paperWidthMm) {
        var b = new ESCPOSBuilder(paperWidthMm || 58);
        b.init()
         .alignCenter()
         .boldOn().doubleSize()
         .line('REEVES BELT')
         .line('SECURE 360')
         .normalSize().boldOff()
         .feed()
         .line('Printer Test')
         .feed()
         .alignLeft()
         .hr('=')
         .line('Printer: ' + (printerName || '--'))
         .line('Width: ' + (paperWidthMm || 58) + 'mm')
         .line('Time: ' + new Date().toLocaleString())
         .hr('=')
         .alignCenter()
         .feed()
         .text('If you can read this,')
         .feed()
         .text('the printer is working.')
         .feed(4).cut();
        return b.build();
    }

    return {
        gateEntryPass:  gateEntryPass,
        gateExitPass:   gateExitPass,
        sampleLabel:    sampleLabel,
        preweighedSlip: preweighedSlip,
        visitorPass:    visitorPass,
        vehicleReceipt: vehicleReceipt,
        testPage:       testPage
    };

})();
