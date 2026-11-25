// orchestra/joycon.js: the Joy-Con / Pro Controller report parser, the output reports, the WebHID link (with a fake HID device) and the IMU -> beat path
// 実行：node tools/tests/unit/orchestra-joycon.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const J = require(path.join(ROOT, 'orchestra/joycon.js')), E = require(path.join(ROOT, 'orchestra/engine.js'));
const near = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, (msg || '') + ' expected ' + b + ' +-' + tol + ', got ' + a);

test('parseInputReport: buttons, sticks, battery and the 3 IMU samples of a report 0x30 (nominal scales)', () => {
  const b = J.encodeReport30({ timer: 9, buttons: { A: true, B: true, ZR: true, PLUS: true, L: true, UP: true }, samples: [[J.lsb(9.80665), J.lsb(-2), J.lsb(0.5), 1000, -2000, 0], [4096, 0, 0], [0, 0, -4096]] });
  const r = J.parseInputReport(0x30, b);
  ok(r.buttons.A && r.buttons.B && r.buttons.ZR && r.buttons.PLUS && r.buttons.L && r.buttons.UP, 'pressed');
  ok(!r.buttons.X && !r.buttons.Y && !r.buttons.MINUS && !r.buttons.ZL && !r.buttons.DOWN, 'not pressed'); eq(r.timer, 9); eq(r.battery.level, 9);
  eq(r.imu.length, 3); near(r.imu[0].ax, 9.80665, 0.003, 'ax'); near(r.imu[0].ay, -2, 0.003, 'ay'); near(r.imu[0].az, 0.5, 0.003, 'az'); near(r.imu[0].gx, 61.03, 0.05, 'gx deg/s'); near(r.imu[0].gy, -122.06, 0.1, 'gy');
  near(r.imu[1].ax, 9.80665, 1e-9, '1 g = 4096 LSB'); near(r.imu[2].az, -9.80665, 1e-9);
  eq(J.parseInputReport(0x21, b), null, 'other report ids are ignored'); eq(J.parseInputReport(0x30, b.subarray(0, 20)), null, 'a short report is ignored');
  const withId = new Uint8Array(49); withId[0] = 0x30; withId.set(b, 1); eq(J.parseInputReportWithId(withId).imu[1].ax.toFixed(2), '9.81', 'a buffer that starts with the id');
  const st = new Uint8Array(48); st[5] = 0x34; st[6] = 0xa2; st[7] = 0x12; const s = J.parseInputReport(0x30, st).sticks.l; eq(s.x, 0x234, 'stick x is 12 bit'); eq(s.y, 0x12a, 'stick y is 12 bit');
});
test('output reports: the subcommand frame (counter, neutral rumble, subcommand, args) and the init sequence (IMU on, full mode)', () => {
  const r = J.buildSubcommand(0x1b, 0x40, [1]); eq(r.reportId, 1); eq(Array.from(r.data).join(','), '11,0,1,64,64,0,1,64,64,64,1', 'the counter wraps to 4 bits');
  eq(J.INIT_SEQUENCE.map(c => c.sub).join(), '64,3'); eq(J.INIT_SEQUENCE[1].args[0], 0x30);
});
test('the WebHID link: asks for Nintendo devices from a click, opens, enables the IMU and full mode, streams samples and button edges, survives unplug / replug, reports unsupported', async () => {
  const mk = () => { const d = { vendorId: 0x057e, productId: 0x2007, productName: 'Joy-Con (R)', opened: false, sent: [], ls: [], async open() { d.opened = true; }, async close() { d.opened = false; }, async sendReport(id, data) { d.sent.push([id, Array.from(data)]); },
    addEventListener(t, f) { d.ls.push([t, f]); }, removeEventListener(t, f) { d.ls = d.ls.filter(x => x[1] !== f); }, emit(bytes) { d.ls.filter(x => x[0] === 'inputreport').forEach(x => x[1]({ reportId: 0x30, data: new DataView(bytes.buffer) })); } }; return d; };
  const dev = mk(); let req = null, hls = []; const hid = { async requestDevice(o) { req = o; return [dev]; }, async getDevices() { return [dev]; }, addEventListener(t, f) { hls.push([t, f]); } };
  const got = [], btn = [], states = []; const link = J.connect(hid, { onSamples: (s, t) => got.push(s), onButtons: (down, fresh) => btn.push(fresh.join()), onState: (s) => states.push(s) });
  ok(await link.pick(), 'connected'); ok(req.filters.every(f => f.vendorId === 0x057e) && req.filters.map(f => f.productId).join() === '8198,8199,8201', 'Joy-Con L/R and Pro only'); ok(dev.opened);
  eq(dev.sent.map(x => x[1][9]).join(), '64,3', 'subcommands 0x40 then 0x03'); eq(dev.sent[0][0], 1); eq(states.join(), 'opening,connected');
  dev.emit(J.encodeReport30({ samples: [[0, 0, 4096], [0, 0, 4096], [0, 0, 4096]] })); eq(got.length, 1); eq(got[0].length, 3); near(got[0][2].az, 9.80665, 1e-6); ok(got[0][2].t > got[0][0].t, 'sample times ascend');
  dev.emit(J.encodeReport30({ buttons: { A: true } })); dev.emit(J.encodeReport30({ buttons: { A: true } })); dev.emit(J.encodeReport30({ buttons: {} })); dev.emit(J.encodeReport30({ buttons: { B: true } })); eq(btn.join('|'), 'A|B', 'only the press edges are reported');
  hls.filter(x => x[0] === 'disconnect').forEach(x => x[1]({ device: dev })); eq(link.state, 'lost', 'unplugged'); hls.filter(x => x[0] === 'connect').forEach(x => x[1]({ device: dev })); await new Promise(r => setTimeout(r, 300)); eq(link.state, 'connected', 'replugged: connected again without a new dialog');
  const none = J.connect(null, { onState: s => states.push(s) }); eq(none.state, 'unsupported'); eq(await none.pick(), false);
  const bad = J.connect({ async requestDevice() { throw new Error('NotAllowedError'); }, async getDevices() { return []; }, addEventListener() {} }, { onState: s => states.push(s) }); eq(await bad.pick(), false); eq(bad.state, 'error');
});
test('Joy-Con IMU swings feed the same beat detector: a swung controller (gravity in the reading, any orientation, 200 Hz samples in 3-sample reports) gives one beat per swing', () => {
  const sim = (bpm, peak, g) => { const det = new E.MotionDetector(), ev = [], T = 60 / bpm, w = 2 * Math.PI / T, gm = Math.hypot(...g), u = g.map(v => v / gm); let rep = 0;
    for (let t = 0; t < 10; t += 0.005 * 3) { const samples = []; for (let n = 0; n < 3; n++) { const tt = t + n * 0.005, a = -peak * Math.cos(w * tt); samples.push([J.lsb(g[0] + u[0] * a), J.lsb(g[1] + u[1] * a), J.lsb(g[2] + u[2] * a)]); }
      const r = J.parseInputReport(0x30, J.encodeReport30({ timer: rep++ & 255, samples })); r.imu.forEach((s, n) => det.push(s.ax, s.ay, s.az, t + n * 0.005).forEach(e => ev.push(e))); } return { ev, T }; };
  for (const bpm of [60, 100, 140]) for (const g of [[0, 0, 9.8], [9.8, 0, 0], [0, -6.9, 6.9]]) { const { ev, T } = sim(bpm, 15, g), expect = Math.floor(9.7 / T); ok(ev.length >= expect - 2 && ev.length <= expect + 1, `${bpm} bpm g=${g}: ${ev.length} beats, expected ~${expect}`); ev.slice(3).forEach(e => { const ph = ((e.t % T) + T) % T; ok(Math.abs(ph - T / 2) < Math.max(0.05, 0.1 * T), 'phase ' + ph.toFixed(3)); }); }
});

run('orchestra-joycon');
