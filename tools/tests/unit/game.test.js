// common/game.js（KoboGame）の単体テスト。document / window は小さな偽物で代用する
// 実行：node tools/tests/unit/game.test.js
'use strict';
const { fresh, test, eq, ok, deep, throws, run, fixedNow, FakeStorage, FakeTarget } = require('./_kobo-env');

const H = 3600000;
const jst = (y, m, d, hh = 0, mm = 0) => Date.UTC(y, m - 1, d, hh, mm) - 9 * H;
function env(opts) {
  opts = opts || {};
  const doc = new FakeTarget(); doc.visibilityState = 'visible'; doc.hidden = false;
  const win = new FakeTarget();
  const st = opts.storage || new FakeStorage();
  const loaded = fresh({ storage: st, document: doc, window: win, location: { search: opts.search || '', reload() { loaded.reloaded = (loaded.reloaded || 0) + 1; } }, files: opts.files || ['games', 'platform', 'game'] });
  loaded.doc = doc; loaded.win = win; loaded.st = st;
  loaded.hide = () => { doc.visibilityState = 'hidden'; doc.hidden = true; doc.dispatch('visibilitychange'); };
  loaded.show = () => { doc.visibilityState = 'visible'; doc.hidden = false; doc.dispatch('visibilitychange'); };
  return loaded;
}
function hooks(id, extra) {
  const calls = [];
  const h = Object.assign({ id, pause: r => calls.push('pause:' + r), resume: r => calls.push('resume:' + r), dispose: () => calls.push('dispose'), save: r => calls.push('save:' + r) }, extra || {});
  return { h, calls };
}
const flush = () => new Promise(r => setTimeout(r, 5));

test('register requires an id and returns KoboGame', () => {
  const { game: G } = env();
  throws(() => G.register({})); throws(() => G.register(null));
  const { h } = hooks('drop');
  eq(G.register(h), G);
  eq(G.info().id, 'drop'); eq(G.info().def.title.ja, 'おちものタワー');
  eq(globalThis.KoboGame, G);
});

test('realtime game: hidden → pause once, visible → resume; pagehide/pageshow', () => {
  const e = env(); const G = e.game; const { h, calls } = hooks('drop');
  G.register(h);
  e.hide(); e.hide(); eq(G.paused(), true);
  e.show();
  deep(calls, ['pause:hidden', 'resume:visible'], 'pause is not repeated');
  e.win.dispatch('pagehide'); e.win.dispatch('pageshow', { persisted: false }); eq(G.paused(), true, 'non-bfcache pageshow ignored');
  e.win.dispatch('pageshow', { persisted: true }); eq(G.paused(), false);
  deep(calls.slice(2), ['pause:pagehide', 'resume:pageshow']);
});

test('menu pause is not undone by visibility changes', () => {
  const e = env(); const G = e.game; const { h, calls } = hooks('raft');
  G.register(h);
  G.menuOpened(); e.hide(); e.show();
  eq(G.paused(), true, 'still paused by the menu');
  G.menuClosed(); eq(G.paused(), false);
  deep(calls, ['pause:menu', 'resume:menu']);
  G.pause('versus'); e.hide(); e.show(); eq(G.paused(), true, 'versus overlay keeps it paused');
  G.resume(); eq(G.paused(), false, 'explicit resume always works');
});

test('turn-based game (flags.pause:false): hidden → save only, never pause/resume hooks', () => {
  const e = env(); const G = e.game; const { h, calls } = hooks('blocks');
  G.register(h);
  e.hide(); e.show(); e.win.dispatch('pagehide'); G.menuOpened();
  deep(calls, ['save:hidden', 'save:pagehide', 'save:menu']);
  eq(G.paused(), false);
});

test('hook errors never break the page', () => {
  const e = env(); const G = e.game;
  const warn = console.warn; console.warn = () => {};
  G.register({ id: 'gates', pause() { throw new Error('x'); }, resume() { throw new Error('y'); }, isIdle() { throw new Error('z'); } });
  e.hide(); e.show(); eq(G.isIdle(), true);
  console.warn = warn;
});

test('emit fills game/t/mode/durationMs/wallMs and feeds the platform (history, stats)', () => {
  const e = env(); const G = e.game, P = e.platform; G.register(hooks('drop').h);
  const t0 = jst(2026, 11, 4, 12); fixedNow(t0);
  const seen = []; G.on('play_end', p => seen.push(p));
  eq(G.isIdle(), true);
  const s = G.emit('play_start', { mode: 'bogus' });
  eq(s.game, 'drop'); eq(s.mode, 'normal'); eq(s.t, t0); eq(G.playing(), true); eq(G.isIdle(), false);
  fixedNow(t0 + 42000);
  const p = G.report('play_end', { score: '321' });
  eq(p.durationMs, 42000); eq(p.wallMs, 42000); eq(p.reason, 'over'); eq(p.score, 321); eq(p.mode, 'normal');
  eq(G.playing(), false); eq(seen.length, 1);
  deep(P.history.list()[0], { g: 'drop', t: t0, d: 42000, s: 321, m: 'normal' });
  eq(P.stats.get('drop').plays, 1);
  // durationMs given by the game is kept; wallMs still reported for plausibility checks (rank.js)
  G.emit('play_start', { mode: 'versus' }); fixedNow(t0 + 100000);
  const q = G.emit('play_end', { score: 1, durationMs: 1000, reason: 'quit' });
  eq(q.durationMs, 1000); eq(q.wallMs, 100000 - 42000); eq(q.mode, 'versus');
});

test('isIdle uses the hook when given', () => {
  const e = env(); const G = e.game; let busy = true;
  G.register({ id: 'hole', isIdle: () => !busy });
  eq(G.isIdle(), false); busy = false; eq(G.isIdle(), true);
});

test('?daily=YYYYMMDD calls daily.start({ seed, dateKey }) for daily games only', async () => {
  fixedNow(jst(2026, 11, 4, 8));
  let e = env({ search: '?daily=20261104' }); let got = null;
  e.game.register({ id: 'neji', daily: { start: x => { got = x; } } });
  await flush();
  deep(got, { seed: e.platform.hash32('kobo:neji:20261104'), dateKey: 20261104 });
  // daily play_start picks up the dateKey from the URL
  const s = e.game.emit('play_start', { mode: 'daily', seed: got.seed }); eq(s.dateKey, 20261104);
  // not a daily game → not called
  e = env({ search: '?daily=20261104' }); got = null;
  e.game.register({ id: 'blocks', daily: { start: x => { got = x; } } });
  await flush(); eq(got, null);
});

test('watchGL: context lost → preventDefault + pause; restored → restore hook, else save + reload', () => {
  const e = env(); const G = e.game; const cv = new FakeTarget(); const { h, calls } = hooks('gates', { restore: () => calls.push('restore') });
  G.register(h);
  let lost = 0; G.watchGL(cv, { onLost: () => lost++ });
  const ev = cv.dispatch('webglcontextlost'); ok(ev.defaultPrevented, 'preventDefault'); eq(lost, 1); eq(G.paused(), true);
  cv.dispatch('webglcontextrestored');
  deep(calls, ['pause:gl-lost', 'restore']);
  const e2 = env(); const cv2 = new FakeTarget(); const k = hooks('raft');
  e2.game.register(k.h); e2.game.watchGL(cv2);
  cv2.dispatch('webglcontextlost'); cv2.dispatch('webglcontextrestored');
  eq(e2.reloaded, 1, 'reloads'); ok(k.calls.includes('save:gl-restored'));
  eq(typeof G.watchGL(null), 'function');
});

test('dispose: calls the hook once and removes every listener', () => {
  const e = env(); const G = e.game; const { h, calls } = hooks('drop');
  G.register(h);
  ok(e.doc.count('visibilitychange') === 1 && e.win.count('pagehide') === 1);
  G.dispose(); G.dispose();
  deep(calls, ['dispose']);
  eq(e.doc.count('visibilitychange'), 0); eq(e.win.count('pagehide'), 0); eq(e.win.count('pageshow'), 0);
  e.hide(); eq(calls.length, 1, 'no pause after dispose'); eq(G.pause(), false); eq(G.isIdle(), true);
});

test('register twice replaces listeners (no duplicates)', () => {
  const e = env(); const G = e.game;
  const warn = console.warn; console.warn = () => {};
  G.register(hooks('drop').h); G.register(hooks('raft').h);
  console.warn = warn;
  eq(e.doc.count('visibilitychange'), 1); eq(G.info().id, 'raft');
});

test('runs pending migrations on register', () => {
  const e = env(); let n = 0;
  e.platform.migrations.add({ id: 'test-1', v: 1, run() { n++; } });
  e.game.register(hooks('drop').h); eq(n, 1); ok(e.platform.migrations.done('test-1'));
});

test('works without platform.js and games.js: local bus, pause plumbing', () => {
  const e = env({ files: ['game'] }); const G = e.game; const { h, calls } = hooks('drop');
  const warn = console.warn; console.warn = () => {};
  G.register(h);
  console.warn = warn;
  const got = []; G.on('play_end', p => got.push(p.score)); G.on('*', (p, t) => got.push(t));
  G.emit('play_start', {}); G.emit('play_end', { score: 7 });
  deep(got, ['play_start', 7, 'play_end']);
  e.hide(); deep(calls, ['pause:hidden'], 'unknown flags → treated as realtime');
});

test('emit before register warns and does not reach the platform', () => {
  const e = env(); let n = 0; e.platform.on('play_start', () => n++);
  const warn = console.warn; console.warn = () => {};
  e.game.emit('play_start', {});
  console.warn = warn;
  eq(n, 0);
});

test('?debug exposes window.__kb for the test suites', () => {
  const e = env({ search: '?debug' }); e.game.register(hooks('drop').h);
  ok(globalThis.__kb && globalThis.__kb.game === 'drop' && typeof globalThis.__kb.pause === 'function');
  e.game.emit('best', { score: 3 }); eq(globalThis.__kb.events.slice(-1)[0].type, 'best');
  const e2 = env(); e2.game.register(hooks('drop').h); eq(globalThis.__kb, undefined);
});

run('game');
