// orchestra/joycon.js - Nintendo Switch Joy-Con / Pro Controller over WebHID (Chrome / Edge on a computer; needs https or localhost and a click).
// Written for this game from the facts in the public protocol notes (dekuNukem/Nintendo_Switch_Reverse_Engineering, which documents the report layout and the IMU scales);
// no code was copied. UMD: window.OrchJoycon in the browser, module.exports in Node (tools/tests/unit/orchestra-joycon.test.js).
//   parseInputReport(reportId, bytes)  report 0x30 ("standard full mode") -> { buttons, sticks, battery, imu: [{ ax, ay, az (m/s^2), gx, gy, gz (deg/s) } x3] }
//   `bytes` is the payload WITHOUT the report id (that is what WebHID gives in event.data); parseInputReportWithId handles a buffer that starts with the id.
//   buildSubcommand(counter, sub, args) -> { reportId: 0x01, data } ; INIT_SEQUENCE enables the IMU (0x40) and standard full mode (0x30 via subcommand 0x03).
//   connect(hid, handlers) -> a link that opens a granted/chosen device, initialises it, streams IMU samples to handlers.onSamples(samples, tMs) and button edges
//   to handlers.onButtons(pressedNames), and reconnects a device the user already allowed after it came back.
// Honest limits: accelerometer / gyroscope use the nominal scales (1/4096 g per LSB at +-8 G; 0.06103 deg/s per LSB at +-2000 dps), not the per-unit calibration from the controller's SPI flash.
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OrchJoycon = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const VENDOR = 0x057e, PRODUCTS = { 0x2006: 'Joy-Con (L)', 0x2007: 'Joy-Con (R)', 0x2009: 'Pro Controller' };
  const ACC_SCALE = 9.80665 / 4096, GYRO_SCALE = 0.06103;
  const NEUTRAL_RUMBLE = [0x00, 0x01, 0x40, 0x40, 0x00, 0x01, 0x40, 0x40];
  const s16 = (b, i) => { const v = b[i] | (b[i + 1] << 8); return v > 32767 ? v - 65536 : v; };
  const BTN_R = { Y: 0x01, X: 0x02, B: 0x04, A: 0x08, SR: 0x10, SL: 0x20, R: 0x40, ZR: 0x80 };
  const BTN_S = { MINUS: 0x01, PLUS: 0x02, RSTICK: 0x04, LSTICK: 0x08, HOME: 0x10, CAPTURE: 0x20 };
  const BTN_L = { DOWN: 0x01, UP: 0x02, RIGHT: 0x04, LEFT: 0x08, SR_L: 0x10, SL_L: 0x20, L: 0x40, ZL: 0x80 };
  function stick(b, i) { return { x: b[i] | ((b[i + 1] & 0x0f) << 8), y: (b[i + 1] >> 4) | (b[i + 2] << 4) }; }
  function parseInputReport(reportId, bytes) {
    if (reportId !== 0x30 || !bytes || bytes.length < 12 + 36) return null;
    const b = bytes, buttons = {}; [[b[2], BTN_R], [b[3], BTN_S], [b[4], BTN_L]].forEach(([v, map]) => { for (const k in map) buttons[k] = !!(v & map[k]); });
    const imu = []; for (let n = 0; n < 3; n++) { const o = 12 + n * 12; imu.push({ ax: s16(b, o) * ACC_SCALE, ay: s16(b, o + 2) * ACC_SCALE, az: s16(b, o + 4) * ACC_SCALE, gx: s16(b, o + 6) * GYRO_SCALE, gy: s16(b, o + 8) * GYRO_SCALE, gz: s16(b, o + 10) * GYRO_SCALE }); }
    return { id: 0x30, timer: b[0], battery: { level: b[1] >> 4, charging: !!(b[1] & 0x10) }, buttons, sticks: { l: stick(b, 5), r: stick(b, 8) }, imu };
  }
  const parseInputReportWithId = bytes => parseInputReport(bytes[0], bytes.subarray ? bytes.subarray(1) : bytes.slice(1));
  // the output report 0x01: [packet counter, 8 bytes of neutral rumble, subcommand, arguments...] (the report id is sent separately by WebHID)
  function buildSubcommand(counter, sub, args) { return { reportId: 0x01, data: Uint8Array.from([counter & 0x0f, ...NEUTRAL_RUMBLE, sub, ...(args || [])]) }; }
  const INIT_SEQUENCE = [{ sub: 0x40, args: [0x01], note: 'enable the IMU' }, { sub: 0x03, args: [0x30], note: 'standard full mode: report 0x30 every ~15 ms' }];
  // test helper (also documents the layout): the payload of a report 0x30 with 3 IMU samples given in raw LSB
  function encodeReport30(o) {
    o = o || {}; const b = new Uint8Array(48), put = (i, v) => { v = Math.max(-32768, Math.min(32767, Math.round(v))); b[i] = v & 0xff; b[i + 1] = (v >> 8) & 0xff; };
    b[0] = o.timer || 0; b[1] = 0x90; let r = 0, s = 0, l = 0; Object.keys(o.buttons || {}).forEach(k => { if (!o.buttons[k]) return; if (BTN_R[k]) r |= BTN_R[k]; else if (BTN_S[k]) s |= BTN_S[k]; else if (BTN_L[k]) l |= BTN_L[k]; });
    b[2] = r; b[3] = s; b[4] = l; (o.samples || []).slice(0, 3).forEach((x, n) => { const i = 12 + n * 12; put(i, x[0]); put(i + 2, x[1]); put(i + 4, x[2]); put(i + 6, x[3] || 0); put(i + 8, x[4] || 0); put(i + 10, x[5] || 0); });
    return b;
  }
  const lsb = ms2 => ms2 / ACC_SCALE; // raw LSB for an acceleration in m/s^2

  // ---- the WebHID link ------------------------------------------------------------------------------------------------------------------------
  // handlers: onSamples(samples[{ax,ay,az}], tMs of the last sample), onButtons(set of pressed names, just pressed names), onState(state, text)
  function connect(hid, handlers) {
    const link = { device: null, counter: 0, state: 'idle', sent: [], prev: {} };
    const setState = (st, txt) => { link.state = st; handlers.onState && handlers.onState(st, txt || ''); };
    const sleep = ms => new Promise(r => setTimeout(r, ms));
    async function init(dev) {
      for (const c of INIT_SEQUENCE) { const r = buildSubcommand(link.counter++, c.sub, c.args); link.sent.push({ sub: c.sub, args: c.args }); await dev.sendReport(r.reportId, r.data); await sleep(60); }
    }
    function onReport(e) {
      const bytes = new Uint8Array(e.data.buffer, e.data.byteOffset, e.data.byteLength), rep = parseInputReport(e.reportId, bytes); if (!rep) return;
      const now = (typeof performance !== 'undefined' ? performance.now() : Date.now());
      const samples = rep.imu.map((s, i) => ({ ax: s.ax, ay: s.ay, az: s.az, gx: s.gx, gy: s.gy, gz: s.gz, t: now - (2 - i) * 5 })); // 3 samples per report, about 5 ms apart
      handlers.onSamples && handlers.onSamples(samples, now);
      const down = Object.keys(rep.buttons).filter(k => rep.buttons[k]), fresh = down.filter(k => !link.prev[k]); link.prev = Object.fromEntries(down.map(k => [k, 1]));
      if (fresh.length && handlers.onButtons) handlers.onButtons(down, fresh);
    }
    async function open(dev) {
      link.device = dev; setState('opening', PRODUCTS[dev.productId] || dev.productName || '');
      try { if (!dev.opened) await dev.open(); dev.addEventListener('inputreport', onReport); await init(dev); setState('connected', PRODUCTS[dev.productId] || dev.productName || 'controller'); }
      catch (err) { setState('error', String(err && err.message || err)); }
    }
    link.pick = async () => { // must be called from a click
      if (!hid) { setState('unsupported'); return false; }
      let devs; try { devs = await hid.requestDevice({ filters: Object.keys(PRODUCTS).map(p => ({ vendorId: VENDOR, productId: +p })) }); } catch (err) { setState('error', String(err && err.message || err)); return false; }
      if (!devs || !devs.length) { setState('idle'); return false; } await open(devs[0]); return link.state === 'connected';
    };
    link.close = async () => { try { if (link.device) { link.device.removeEventListener('inputreport', onReport); await link.device.close(); } } catch (e) {} link.device = null; setState('idle'); };
    if (hid && hid.addEventListener) {
      hid.addEventListener('disconnect', e => { if (link.device && e.device === link.device) { setState('lost'); } });
      hid.addEventListener('connect', async e => { if (e.device && e.device.vendorId === VENDOR && PRODUCTS[e.device.productId] && (link.state === 'lost' || link.state === 'idle')) await open(e.device); });
    }
    link.reuse = async () => { try { const devs = hid && await hid.getDevices(); const d = devs && devs.find(x => x.vendorId === VENDOR && PRODUCTS[x.productId]); if (d) { await open(d); return true; } } catch (e) {} return false; };
    if (!hid) setState('unsupported');
    return link;
  }
  return { VENDOR, PRODUCTS, ACC_SCALE, GYRO_SCALE, parseInputReport, parseInputReportWithId, buildSubcommand, INIT_SEQUENCE, encodeReport30, lsb, connect, BTN_R, BTN_S, BTN_L };
});
