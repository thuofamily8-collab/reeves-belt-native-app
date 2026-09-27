/**
 * ============================================================
 * REEVES BELT APP - UNIVERSAL ESC/POS ENCODER
 * ============================================================
 * Builds raw ESC/POS byte sequences for any compliant thermal
 * printer (58mm or 80mm). Does not depend on printer brand.
 *
 * Usage:
 *   var b = new ESCPOSBuilder(58);
 *   b.init().alignCenter().doubleSize()
 *    .text('HELLO').feed()
 *    .alignLeft().text('line 1').feed()
 *    .cut();
 *   var bytes = b.build(); // Uint8Array
 * ============================================================
 */

var ESCPOSBuilder = (function () {

    // ESC/POS command bytes
    var CMD = {
        INIT:          [0x1B, 0x40],
        FEED:          [0x0A],
        FEED_N:        [0x1B, 0x64],       // followed by n
        ALIGN_LEFT:    [0x1B, 0x61, 0x00],
        ALIGN_CENTER:  [0x1B, 0x61, 0x01],
        ALIGN_RIGHT:   [0x1B, 0x61, 0x02],
        BOLD_ON:       [0x1B, 0x45, 0x01],
        BOLD_OFF:      [0x1B, 0x45, 0x00],
        UNDERLINE_ON:  [0x1B, 0x2D, 0x01],
        UNDERLINE_OFF: [0x1B, 0x2D, 0x00],
        DOUBLE_SIZE:   [0x1D, 0x21, 0x11],
        TRIPLE_SIZE:   [0x1D, 0x21, 0x22],
        NORMAL_SIZE:   [0x1D, 0x21, 0x00],
        CUT_PARTIAL:   [0x1D, 0x56, 0x01],
        CUT_FULL:      [0x1D, 0x56, 0x00],
        OPEN_DRAWER:   [0x1B, 0x70, 0x00, 0x19, 0xFA]
    };

    function ESCPOSBuilder(paperWidthMm) {
        this.paperWidthMm = paperWidthMm || 58;
        // 58mm printers typically support 32 characters per line at font A
        // 80mm printers typically support 42-48 characters per line
        this.charsPerLine = this.paperWidthMm >= 80 ? 48 : 32;
        this.bytes = [];
    }

    // ---------- Low-level writes ----------
    ESCPOSBuilder.prototype._push = function (arr) {
        for (var i = 0; i < arr.length; i++) this.bytes.push(arr[i] & 0xFF);
        return this;
    };

    ESCPOSBuilder.prototype._pushText = function (str) {
        // Encode to Latin-1 (byte values 0x00-0xFF)
        if (!str) return this;
        for (var i = 0; i < str.length; i++) {
            var code = str.charCodeAt(i);
            this.bytes.push(code > 0xFF ? 0x3F : code);  // '?' for unsupported
        }
        return this;
    };

    // ---------- Public API ----------
    ESCPOSBuilder.prototype.init = function () {
        return this._push(CMD.INIT);
    };

    ESCPOSBuilder.prototype.text = function (str) {
        return this._pushText(str || '');
    };

    ESCPOSBuilder.prototype.line = function (str) {
        this._pushText(str || '');
        return this._push(CMD.FEED);
    };

    ESCPOSBuilder.prototype.feed = function (n) {
        n = n || 1;
        for (var i = 0; i < n; i++) this._push(CMD.FEED);
        return this;
    };

    ESCPOSBuilder.prototype.alignLeft = function () { return this._push(CMD.ALIGN_LEFT); };
    ESCPOSBuilder.prototype.alignCenter = function () { return this._push(CMD.ALIGN_CENTER); };
    ESCPOSBuilder.prototype.alignRight = function () { return this._push(CMD.ALIGN_RIGHT); };

    ESCPOSBuilder.prototype.boldOn = function () { return this._push(CMD.BOLD_ON); };
    ESCPOSBuilder.prototype.boldOff = function () { return this._push(CMD.BOLD_OFF); };

    ESCPOSBuilder.prototype.underlineOn = function () { return this._push(CMD.UNDERLINE_ON); };
    ESCPOSBuilder.prototype.underlineOff = function () { return this._push(CMD.UNDERLINE_OFF); };

    ESCPOSBuilder.prototype.doubleSize = function () { return this._push(CMD.DOUBLE_SIZE); };
    ESCPOSBuilder.prototype.tripleSize = function () { return this._push(CMD.TRIPLE_SIZE); };
    ESCPOSBuilder.prototype.normalSize = function () { return this._push(CMD.NORMAL_SIZE); };

    ESCPOSBuilder.prototype.cut = function () { return this._push(CMD.CUT_PARTIAL); };
    ESCPOSBuilder.prototype.cutFull = function () { return this._push(CMD.CUT_FULL); };
    ESCPOSBuilder.prototype.openDrawer = function () { return this._push(CMD.OPEN_DRAWER); };

    // ---------- Helpers ----------
    ESCPOSBuilder.prototype.hr = function (char) {
        char = char || '-';
        var line = '';
        for (var i = 0; i < this.charsPerLine; i++) line += char;
        return this.line(line);
    };

    ESCPOSBuilder.prototype.row = function (left, right) {
        left = String(left || '');
        right = String(right || '');
        var space = this.charsPerLine - left.length - right.length;
        if (space < 1) space = 1;
        var padded = left + new Array(space + 1).join(' ') + right;
        return this.line(padded);
    };

    ESCPOSBuilder.prototype.centered = function (str) {
        str = String(str || '');
        var padding = Math.floor((this.charsPerLine - str.length) / 2);
        if (padding < 0) padding = 0;
        return this.line(new Array(padding + 1).join(' ') + str);
    };

    /**
     * Wrap text to lines of at most charsPerLine.
     */
    ESCPOSBuilder.prototype.wrap = function (str, width) {
        width = width || this.charsPerLine;
        str = String(str || '');
        var words = str.split(' ');
        var lines = [];
        var cur = '';
        for (var i = 0; i < words.length; i++) {
            var w = words[i];
            if ((cur + ' ' + w).trim().length <= width) {
                cur = (cur ? cur + ' ' : '') + w;
            } else {
                if (cur) lines.push(cur);
                cur = w;
            }
        }
        if (cur) lines.push(cur);
        return lines;
    };

    // ---------- Output ----------
    ESCPOSBuilder.prototype.build = function () {
        return new Uint8Array(this.bytes);
    };

    ESCPOSBuilder.prototype.buildBase64 = function () {
        var u8 = this.build();
        var bin = '';
        for (var i = 0; i < u8.length; i++) bin += String.fromCharCode(u8[i]);
        return btoa(bin);
    };

    return ESCPOSBuilder;
})();
