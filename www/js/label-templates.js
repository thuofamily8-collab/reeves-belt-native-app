/**
 * ============================================================
 * REEVES BELT APP - LABEL TEMPLATES
 * ============================================================
 * Ready-made ESC/POS byte builders for common print jobs.
 * Each function returns a Uint8Array ready to send to the printer.
 * ============================================================
 */

var RBLabels = (function () {

    /**
     * Sample label — code only + timestamp + witnesses.
     * NO plate, NO driver, NO product (anti-corruption).
     */
    function sampleLabel(data, paperWidthMm) {
        var b = new ESCPOSBuilder(paperWidthMm || 58);
        b.init()
         .alignCenter()
         .boldOn().doubleSize()
         .line('SAMPLE')
         .line('LABEL')
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
         .feed(3)
         .cut();
        return b.build();
    }

    /**
     * Pre-weighed truck slip (80mm — wider).
     */
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
         .feed(3)
         .cut();
        return b.build();
    }

    /**
     * Visitor pass.
     */
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
         .feed(3)
         .cut();
        return b.build();
    }

    /**
     * Vehicle receipt.
     */
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
         .feed(3)
         .cut();
        return b.build();
    }

    /**
     * Simple test page — no data needed.
     */
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
         .feed(4)
         .cut();
        return b.build();
    }

    return {
        sampleLabel:    sampleLabel,
        preweighedSlip: preweighedSlip,
        visitorPass:    visitorPass,
        vehicleReceipt: vehicleReceipt,
        testPage:       testPage
    };

})();
