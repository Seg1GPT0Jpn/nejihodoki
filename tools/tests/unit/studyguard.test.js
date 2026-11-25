// common/studyguard.js の純粋な部分の単体テスト：時計つきの見張り（隠れているあいだは数えない・複数タブで二重に数えない）、
// まちがいで問題が増える・上限、お休みのしきい値と終わり、テスト期間（日付）、PIN のハッシュ、保存の読み込み（壊れた値は安全な初期値）、
// 「使いますか？」を聞くかどうか、platform.js のオプトイン（オフなら読み込まない）。
// 実行：node tools/tests/unit/studyguard.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run, readText } = require('./_kobo-env');
const C = require(path.join(ROOT, 'common/studyguard.js')).core;

const mkStore = (init) => { const m = new Map(Object.entries(init || {}).map(([k, v]) => [k, JSON.stringify(v)])); return { get: k => (m.has(k) ? JSON.parse(m.get(k)) : null), set: (k, v) => { m.set(k, JSON.stringify(v)); }, raw: k => m.get(k), m }; };
const T0 = Date.UTC(2026, 10, 25, 3, 0, 0); // 2026-11-25 12:00 JST
function mk(settings, opt) {
  opt = opt || {};
  const store = opt.store || mkStore({ 'kobo.sg': Object.assign({ v: 1, on: true }, settings || {}) });
  const clk = { t: opt.t0 || T0, active: true };
  const eng = C.createEngine({ store, now: () => clk.t, active: () => clk.active });
  return { store, clk, eng, step(n, ms) { let r; for (let i = 0; i < (n || 1); i++) { clk.t += ms || 1000; r = eng.tick(); } return r; } };
}

test('defaults: off, 5 minutes, 2 questions, +1 per miss, 5 misses in 30 min, 15 min rest, no PIN, no date', () => {
  const d = C.defaults(); eq(d.on, false); eq(d.min, 5); eq(d.q, 2); eq(d.ex, 1); eq(d.thr, 5); eq(d.win, 30); eq(d.lock, 15); eq(d.until, 0); eq(d.pin, null); deep(d.lv, ['JH', 'HS']); deep(d.sub, []);
  eq(C.normSettings(undefined).on, false);
});
test('migration: broken / old / hostile saved values give safe defaults and never turn it on by accident', () => {
  for (const bad of [null, 'x', 5, [], { on: 'true' }, { on: 1 }, { v: 99, on: 'yes' }, { min: 7, q: 99, ex: 9, thr: 4, win: 1, lock: 1, until: 'abc', lv: ['XX'], sub: ['zz'], pin: { s: 1, h: 2 } }]) {
    const s = C.normSettings(bad);
    eq(s.on, false); eq(s.min, 5); eq(s.q, 2); eq(s.ex, 1); eq(s.thr, 5); eq(s.win, 30); eq(s.lock, 15); eq(s.until, 0); eq(s.pin, null); deep(s.lv, ['JH', 'HS']); deep(s.sub, []);
  }
  const s = C.normSettings({ on: true, min: 30, q: 5, lv: ['HS'], sub: ['math', 'english'], ex: 3, thr: 0, win: 60, lock: 60, until: 20261231 });
  eq(s.on, true); eq(s.min, 30); eq(s.q, 5); deep(s.lv, ['HS']); deep(s.sub, ['english', 'math']); eq(s.ex, 3); eq(s.thr, 0); eq(s.win, 60); eq(s.lock, 60); eq(s.until, 20261231);
  eq(C.normSettings({ sub: C.SUBJECTS.slice() }).sub.length, 0, 'every subject = all');
  eq(C.normSettings({ until: 20261332 }).until, 0, 'impossible date is dropped');
  const r = C.normRun({ acc: -5, last: 'x', lockUntil: 1e15, misses: [1, 'a', null, 5], retryAt: 'q' }); eq(r.acc, 0); eq(r.last, 0); deep(r.misses, [1, 5]);
  // store that holds garbage: the engine still works
  const store = { get: () => '###', set() {} }; const e = C.createEngine({ store, now: () => T0 }); eq(e.settings().on, false); eq(e.tick().on, false);
  // choices are exactly the owner's
  deep(C.MIN_CHOICES, [3, 5, 10, 15, 30]); deep(C.LOCK_CHOICES, [5, 15, 30, 60]);
});
test('scheduler: a quiz is due after N minutes of active play, not before', () => {
  const g = mk({ min: 5 });
  g.eng.tick(); let r = g.step(299); eq(r.due, false); eq(r.acc, 299000);
  r = g.step(1); eq(r.due, true); eq(r.acc, 300000);
  const g3 = mk({ min: 3 }); g3.eng.tick(); eq(g3.step(179).due, false); eq(g3.step(1).due, true);
});
test('scheduler: hidden tab (or no input) is not counted', () => {
  const g = mk({ min: 5 }); g.eng.tick();
  g.step(60); g.clk.active = false; g.step(600); g.clk.active = true; const r = g.step(1);
  eq(r.acc, 61000, 'only the 61 active seconds');
  eq(r.due, false);
});
test('scheduler: a gap longer than 10 s (page closed, device asleep, frozen tab) is not counted', () => {
  const g = mk({ min: 5 }); g.eng.tick(); g.step(10);
  g.clk.t += 3600000; let r = g.eng.tick(); eq(r.credited, 0); eq(r.acc, 10000);
  r = g.step(1); eq(r.acc, 11000);
  g.clk.t -= 50000; r = g.eng.tick(); eq(r.credited, 0, 'clock going backwards counts nothing');
});
test('scheduler: two visible tabs share one total (no double count) and it carries across pages', () => {
  const store = mkStore({ 'kobo.sg': { v: 1, on: true, min: 5 } });
  const a = mk(null, { store }), b = mk(null, { store }); a.clk.t = b.clk.t = T0; a.eng.tick();
  for (let i = 0; i < 100; i++) { a.clk.t += 500; b.clk.t = a.clk.t; a.eng.tick(); a.clk.t += 500; b.clk.t = a.clk.t; b.eng.tick(); }
  eq(store.get('kobo.sg.run').acc, 100000, '100 s of wall time counted once');
});
test('scheduler: off means nothing runs and nothing is written', () => {
  const store = mkStore({}); const g = mk(null, { store }); eq(g.eng.tick().on, false); eq(store.m.has('kobo.sg.run'), false);
  const g2 = mk({ on: false }); g2.step(100); eq(g2.store.m.has('kobo.sg.run'), false);
});
test('quiz session: a miss adds extra questions (+ex per miss, up to 10) until the required number are right', () => {
  const s = C.createSession({ q: 2, ex: 1 });
  eq(s.required(), 2); eq(s.record(true), false); eq(s.remaining(), 1);
  eq(s.record(false), false); eq(s.required(), 3, '1 miss adds 1'); eq(s.remaining(), 2); eq(s.extra(), 1);
  eq(s.record(true), false); eq(s.record(true), true, 'done when 3 are right'); eq(s.st.asked, 4); eq(s.st.misses, 1);
  const t = C.createSession({ q: 1, ex: 3 }); t.record(false); eq(t.required(), 4); t.record(false); eq(t.required(), 7);
});
test('quiz session: extra is capped at 10, and a hard limit ends a hopeless session', () => {
  const s = C.createSession({ q: 5, ex: 3 });
  for (let i = 0; i < 4; i++) s.record(false);
  eq(s.extra(), 10, '4 misses x3 = 12, capped at 10'); eq(s.required(), 15);
  const t = C.createSession({ q: 2, ex: 1 }); let n = 0; while (!t.record(false)) n++;
  eq(t.st.misses, C.HARD_MISS); eq(t.gaveUp(), true); eq(t.extra(), 10); eq(n, C.HARD_MISS - 1);
});
test('lock: reaching the threshold inside the window locks for the chosen time; the counter restarts', () => {
  const g = mk({ thr: 5, win: 30, lock: 15 }); g.eng.tick();
  let m; for (let i = 0; i < 4; i++) { g.clk.t += 60000; m = g.eng.recordMiss(); eq(m.locked, false); }
  g.clk.t += 60000; m = g.eng.recordMiss(); eq(m.locked, true); eq(m.lockUntil, g.clk.t + 15 * 60000);
  eq(g.eng.lockLeft(), 15 * 60000); eq(g.eng.run().misses.length, 0); eq(g.eng.run().acc, 0);
  // play time does not count while locked
  const r = g.step(5); eq(r.locked, true); eq(r.credited, 0); eq(g.eng.run().acc, 0);
});
test('lock: misses older than the window are forgotten', () => {
  const g = mk({ thr: 5, win: 30 }); g.eng.tick();
  for (let i = 0; i < 4; i++) { g.clk.t += 1000; g.eng.recordMiss(); }
  g.clk.t += 31 * 60000; const m = g.eng.recordMiss(); eq(m.locked, false); eq(m.count, 1);
});
test('lock: threshold off (0) never locks; 3 locks at 3', () => {
  const g = mk({ thr: 0 }); for (let i = 0; i < 20; i++) { g.clk.t += 1000; eq(g.eng.recordMiss().locked, false); }
  const h = mk({ thr: 3, lock: 5 }); h.eng.recordMiss(); h.eng.recordMiss(); eq(h.eng.recordMiss().locked, true); eq(h.eng.lockLeft(), 300000);
});
test('lock: expires on time, then counting restarts from zero', () => {
  const g = mk({ thr: 3, lock: 5 }); g.eng.tick(); for (let i = 0; i < 3; i++) g.eng.recordMiss();
  g.clk.t += 299000; let r = g.eng.tick(); eq(r.locked, true); ok(g.eng.lockLeft() > 0);
  g.clk.t += 2000; eq(g.eng.lockLeft(), 0); r = g.eng.tick(); eq(r.locked, false); eq(r.acc, 0); eq(g.eng.run().lockUntil, 0);
  r = g.step(10); eq(r.acc, 10000);
});
test('lock: switching the guard off ends the lock on every page (lockLeft is 0)', () => {
  const g = mk({ thr: 3 }); for (let i = 0; i < 3; i++) g.eng.recordMiss(); ok(g.eng.lockLeft() > 0);
  g.eng.patch({ on: false }); eq(g.eng.lockLeft(), 0);
});
test('finishQuiz resets the counter; a failed load retries later without punishing', () => {
  const g = mk({ min: 3 }); g.eng.tick(); eq(g.step(180).due, true);
  g.eng.retryLater(60000); eq(g.eng.tick().due, false, 'waiting'); g.clk.t += 61000; eq(g.eng.tick().due, true);
  g.eng.finishQuiz(); eq(g.eng.run().acc, 0); eq(g.eng.tick().due, false);
});
test('until-date: on through the date (JST), turns itself off the next day, keeps everything else', () => {
  eq(C.jstDateKey(Date.UTC(2026, 10, 25, 14, 59, 59)), 20261125); eq(C.jstDateKey(Date.UTC(2026, 10, 25, 15, 0, 0)), 20261126, 'JST midnight');
  const g = mk({ until: 20261126, min: 10, q: 3 }); g.eng.tick();
  eq(g.step(5).on, true);
  g.clk.t = Date.UTC(2026, 10, 26, 14, 59, 59); eq(g.eng.tick().on, true, 'still on at 23:59 JST on the date');
  g.clk.t = Date.UTC(2026, 10, 26, 15, 0, 1); const r = g.eng.tick(); eq(r.on, false); eq(r.expired, true);
  const s = g.eng.settings(); eq(s.on, false); eq(s.note, 'until'); eq(s.q, 3); eq(s.until, 20261126);
  eq(g.eng.tick().on, false);
  deep(C.untilLabel(20261203), { m: 12, d: 3 }); eq(C.untilLabel(0), null);
});
test('PIN: 4 digits only, stored salted and hashed (never the digits), checks right and wrong', () => {
  eq(C.validPin('1234'), true); eq(C.validPin('123'), false); eq(C.validPin('12a4'), false); eq(C.validPin(1234), true); eq(C.validPin('12345'), false);
  const p = C.makePin('4821', () => 0.5), q = C.makePin('4821'); const s = C.normSettings({ pin: p });
  eq(typeof p.s, 'string'); eq(p.h.length, 64); eq(JSON.stringify(p).includes('4821'), false);
  eq(C.checkPin(s, '4821'), true); eq(C.checkPin(s, '4822'), false); eq(C.checkPin(s, ''), false); eq(C.checkPin({ pin: null }, '4821'), false); eq(C.checkPin(s, 'abcd'), false);
  ok(p.h !== q.h || p.s !== q.s, 'random salt'); eq(C.hashPin('4821', p.s), p.h, 'deterministic with the salt');
  eq(C.normSettings({ pin: { s: 'zz', h: 'nope' } }).pin, null);
  const g = mk({ pin: p }); const store = g.store; eq(JSON.stringify(store.m.get('kobo.sg')).includes('4821'), false);
});
test('sha256 matches the standard vectors', () => {
  eq(C.sha256(''), 'e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855');
  eq(C.sha256('abc'), 'ba7816bf8f01cfea414140de5dae2223b00361a396177a9cb410ff61f20015ad');
  eq(C.sha256('abcdbcdecdefdefgefghfghighijhijkijkljklmklmnlmnomnopnopq'), '248d6a61d20638b8e5c026930c3e6039a33ce45964ff2167f6ecedd419db06c1');
  eq(C.sha256('あ'), require('crypto').createHash('sha256').update('あ', 'utf8').digest('hex'));
});
test('ask: the one-time notice is for people who never answered; Later comes back once after 7 days; Yes/No never again', () => {
  const D = 86400000, s = C.defaults();
  eq(C.shouldAsk(s, T0), true);
  eq(C.shouldAsk(Object.assign(C.defaults(), { ask: { s: 'no', n: 0, t: T0 } }), T0 + 400 * D), false);
  eq(C.shouldAsk(Object.assign(C.defaults(), { ask: { s: 'yes', n: 0, t: T0 } }), T0 + 400 * D), false);
  const later = n => Object.assign(C.defaults(), { ask: { s: 'later', n, t: T0 } });
  eq(C.shouldAsk(later(1), T0 + 6 * D), false); eq(C.shouldAsk(later(1), T0 + 8 * D), true); eq(C.shouldAsk(later(2), T0 + 30 * D), false);
  eq(C.shouldAsk(Object.assign(C.defaults(), { on: true }), T0), false);
});
test('platform.js: loads the guard only when it is on or the hub still has to ask; open() loads on demand (no cost when off)', () => {
  const src = readText('common/platform.js');
  ok(/kobo\.sg/.test(src) && /studyguard\.js/.test(src), 'loader present');
  ok(/if \(\(sgv && sgv\.on === true\) \|\| sgNeedAsk\) sgLoad\(\)/.test(src), 'only loads when on or ask is due');
  ok(/sgHub && \(!sgAsk/.test(src), 'asking happens on the hub only');
  const sw = readText('common/studyguard.js'); ok(!/localStorage\.(set|remove)Item\(['"]kobo\.(?!sg)/.test(sw), 'writes only kobo.sg* keys');
});
run('studyguard');
