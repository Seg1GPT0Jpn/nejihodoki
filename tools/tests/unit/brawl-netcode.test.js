// brawl のオンライン対戦の土台のテスト（node だけ。ブラウザも Firebase も使わない）。
//  1. engine.js が、ブラウザやパソコン・スマホがちがっても同じ結果になること：結果が変わりうる関数（sin / cos / pow / hypot / random / Date …）を使っていない・
//     決まった入力の台本を流した状態の指紋（hash）がずっと同じ（保存した「正解の指紋」tools/tests/fixtures/brawl-golden-hashes.json と比べる）・
//     スナップショット→もどして撃ち直しが、通しで進めた結果と同じ・clone と hash の性質。
//  2. brawl/netcode.js（ロックステップ＋ロールバック）を、仮想の回線でつないだボットが最後まで対戦：遅れ・ゆれ・取りこぼし・順番ちがい・重複・回線の切れ・
//     時計のずれ・4人・切断（不戦勝）・ずれ（desync）の検出。どれも「両方の最後の状態の指紋が同じ ＝ ロールバックなしの通しの結果と同じ」。
// 実行：node tools/tests/unit/brawl-netcode.test.js          （正解の指紋を作り直す：BRAWL_RECORD=1 node tools/tests/unit/brawl-netcode.test.js）
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, test: test0, eq, ok, run } = require('./_kobo-env');
const VERBOSE = !!process.env.BRAWL_VERBOSE;
const test = (name, fn) => test0(name, async () => { const t = Date.now(); try { await fn(); } finally { if (VERBOSE) console.log('  · ' + (Date.now() - t) + ' ms  ' + name.slice(0, 90)); } });
const { simulate, straightThrough, rng, E, NET } = require('./brawl-netsim');
const GOLDEN = path.join(ROOT, 'tools/tests/fixtures/brawl-golden-hashes.json');
const RECORD = !!process.env.BRAWL_RECORD;

// ---------------------------------------------------------------- 台本（種つき。状態は見ない）
function script(seed, n, frames) {
  const r = rng(seed * 7919 + 13), B = E.B, rows = [];
  const cur = new Array(n).fill(0), left = new Array(n).fill(0);
  for (let f = 0; f < frames; f++) {
    const row = [];
    for (let p = 0; p < n; p++) {
      if (--left[p] <= 0) {
        left[p] = 3 + Math.floor(r() * 36); let b = 0;
        const d = r(); if (d < 0.32) b |= B.L; else if (d < 0.64) b |= B.R;
        if (r() < 0.12) b |= B.U; if (r() < 0.12) b |= B.D; if (r() < 0.14) b |= B.J; if (r() < 0.2) b |= B.A; if (r() < 0.1) b |= B.S;
        if (r() < 0.07) b |= B.H; if (r() < 0.05) b |= B.G; if (r() < 0.04) b |= B.M; if (b & (B.L | B.R) && r() < 0.35) b |= B.F; if (r() < 0.03) b |= (B.CL << Math.floor(r() * 4)); if (r() < 0.01) b |= B.T;
        cur[p] = b;
      }
      row.push(cur[p]);
    }
    rows.push(row);
  }
  return rows;
}
// 台本の一覧：18人 × 5ステージを組み合わせて、4人の試合も入れる（ぜんぶ決まった種）
function scenarios() {
  const ids = E.K.LEGACY.concat(['junk']), out = []; // the first 18 + the boss stay pinned: their hashes must never change when the roster grows
  for (let i = 0; i < 20; i++) {
    const n = i % 7 === 6 ? 4 : i % 5 === 4 ? 3 : 2;
    const chars = []; for (let k = 0; k < n; k++) chars.push(ids[(i * 5 + k * 3) % ids.length]);
    out.push({ name: 'm' + i, seed: 100 + i * 17, stage: E.STAGE_IDS[i % 5], chars, mode: i % 6 === 5 ? 'time' : 'stock', stocks: 1 + (i % 3), frames: 2400 });
  }
  // the newer toys (every special kind and projectile): their own scripted matches, 2 to 4 players
  const nw = E.CHAR_IDS.filter(id => E.K.LEGACY.indexOf(id) < 0);
  for (let i = 0; i < nw.length; i++) {
    const n = i % 4 === 3 ? 4 : i % 3 === 2 ? 3 : 2, chars = []; for (let k = 0; k < n; k++) chars.push(nw[(i + k * 5) % nw.length]);
    if (i % 5 === 0) chars[n - 1] = E.K.LEGACY[(i * 3) % 18];
    out.push({ name: 'n' + i, seed: 900 + i * 31, stage: E.STAGE_IDS[(i + 2) % 5], chars, mode: 'stock', stocks: 1 + (i % 3), frames: 2400 });
  }
  return out;
}
function runScript(sc, hooks) {
  const st = E.create({ seed: sc.seed, stage: sc.stage, fighters: sc.chars.map(ch => ({ ch, lvl: 0 })), mode: sc.mode, stocks: sc.stocks, time: 25 });
  const rows = script(sc.seed, sc.chars.length, sc.frames), marks = {};
  for (let f = 1; f <= sc.frames; f++) {
    if (hooks && hooks.before) hooks.before(st, f);
    E.step(st, rows[f - 1]);
    if (f === 300 || f === 900 || f === 1800 || f === sc.frames || st.over) marks[st.f] = E.hashStr(st);
    if (hooks && hooks.after) hooks.after(st, f);
    if (st.over) break;
  }
  return { st, marks, rows };
}

// ---------------------------------------------------------------- 1. engine
test('engine.js uses no function whose result can differ between browsers (sin cos pow exp log hypot random Date performance Map Set locale ...)', () => {
  let src = fs.readFileSync(path.join(ROOT, 'brawl/engine.js'), 'utf8');
  src = src.replace(/\/\*[\s\S]*?\*\//g, '').split('\n').map(l => l.replace(/(^|[^:'"`])\/\/.*$/, '$1')).join('\n');
  const banned = [/Math\.(sin|cos|tan|asin|acos|atan2?|sinh|cosh|tanh|asinh|acosh|atanh|pow|exp|expm1|log|log1p|log2|log10|hypot|cbrt|random)\b/, /\*\*/, /\bDate\b/, /\bperformance\b/, /\bnew (Map|Set|WeakMap|WeakSet)\b/, /\bIntl\b/, /toLocale|localeCompare|toFixed|toPrecision/, /\bsetTimeout|setInterval|requestAnimationFrame\b/, /\bparseFloat\b/, /Number\([^)]*['"`]/];
  for (const re of banned) { const m = re.exec(src); ok(!m, 'engine.js contains ' + (m && m[0]) + ' (' + re + ')'); }
  // 使ってよい Math の関数だけ（IEEE で正確に決まるもの）
  const used = new Set((src.match(/Math\.[A-Za-z0-9]+/g) || []).map(s => s.slice(5)));
  for (const f of used) ok(['abs', 'floor', 'round', 'min', 'max', 'sign', 'sqrt', 'imul', 'ceil', 'trunc', 'fround'].includes(f), 'Math.' + f + ' is not allowed in the simulation');
});
test('the angle table V() equals rd(cos), rd(-sin) of every whole degree (and negative / over 360 wrap), and every move angle is a whole degree', () => {
  const rd = v => Math.round(v * 1000) / 1000;
  for (let d = -360; d <= 720; d++) { const a = E.V(d), c = rd(Math.cos(d * Math.PI / 180)), s = rd(-Math.sin(d * Math.PI / 180)); ok(Math.abs(a[0] - c) < 1e-9 && Math.abs(a[1] - s) < 1e-9, 'V(' + d + ')'); }
  eq(Object.is(E.V(0)[1], -0), true, 'V(0)[1] keeps the -0 the old formula gave');
  const angs = new Set();
  for (const id of E.CHAR_IDS.concat(['junk'])) {
    const m = E.MOVES[id];
    const walk = o => { if (!o || typeof o !== 'object') return; if (Array.isArray(o)) return o.forEach(walk); if (typeof o.ang === 'number') angs.add(o.ang); if (o.proj && typeof o.proj.ang === 'number') angs.add(o.proj.ang); Object.values(o).forEach(walk); };
    walk(m);
  }
  for (const t of Object.values(E.THROWS || {})) walk2(t);
  function walk2(t) { if (t && typeof t.ang === 'number') angs.add(t.ang); else if (t && typeof t === 'object') Object.values(t).forEach(walk2); }
  angs.add(142);
  for (const a of angs) ok(Number.isInteger(a), 'angle ' + a + ' is not a whole degree: the table would round it');
});
test('hash(): same state → same value; key order, -0 and the event list do not matter; a tiny change does; clone keeps the hash', () => {
  const st = E.create({ seed: 3, stage: 'box', fighters: [{ ch: 'robo' }, { ch: 'tin' }] });
  const rows = script(3, 2, 400); for (let f = 0; f < 400; f++) E.step(st, rows[f]);
  const h = E.hashStr(st); eq(E.hashStr(E.clone(st)), h);
  const re = {}; for (const k of Object.keys(st).reverse()) re[k] = st[k]; eq(E.hashStr(re), h, 'key order');
  const c1 = E.clone(st); c1.ev = [{ t: 'x' }]; eq(E.hashStr(c1), h, 'ev is not part of the hash');
  const c2 = E.clone(st); c2.fighters[0].x = c2.fighters[0].x + 1e-9; ok(E.hashStr(c2) !== h, 'a 1e-9 change must show');
  const c3 = E.clone(st); c3.fighters[1].pct = 0; c3.fighters[1].vx = -0; const c4 = E.clone(c3); c4.fighters[1].vx = 0; eq(E.hashStr(c3), E.hashStr(c4), '-0 == 0');
  const c5 = E.clone(st); c5.f += 1; ok(E.hashStr(c5) !== h);
  const c6 = E.clone(st); c6.fighters[0].used = Object.assign({}, c6.fighters[0].used, { zz: 1 }); ok(E.hashStr(c6) !== h, 'a new key shows');
  ok(E.hashStr(E.create({ seed: 3, stage: 'box', fighters: [{ ch: 'robo' }, { ch: 'tin' }] })) !== h);
});
test('clone(): a deep copy that the simulation cannot reach back into; plain data only (finite numbers, no undefined / functions / NaN)', () => {
  const st = E.create({ seed: 9, stage: 'house', fighters: [{ ch: 'duck' }, { ch: 'bear' }, { ch: 'tin' }] });
  const rows = script(9, 3, 900);
  for (let f = 0; f < 600; f++) E.step(st, rows[f]);
  const snap = E.clone(st), h0 = E.hashStr(snap);
  for (let f = 600; f < 900; f++) E.step(st, rows[f]);
  eq(E.hashStr(snap), h0, 'running the live state does not change the snapshot');
  const bad = [];
  (function walk(v, p) {
    if (v === null) return;
    if (typeof v === 'number') { if (!Number.isFinite(v)) bad.push(p + '=' + v); return; }
    if (typeof v === 'string' || typeof v === 'boolean') return;
    if (typeof v === 'object') { for (const k of Object.keys(v)) walk(v[k], p + '.' + k); return; }
    bad.push(p + ':' + typeof v);
  })(st, 'st');
  eq(bad.join(','), '', 'non-plain values in the state');
  eq(E.hashStr(JSON.parse(JSON.stringify(st))), E.hashStr(st), 'a JSON round trip does not change the hash');
});
test('the constant tables (characters, moves, stages) are not changed by playing', () => {
  const sig = () => E.hash32(JSON.stringify([E.CH, E.MOVES, E.STAGES, E.GRAB, E.THROWS]));
  const a = sig();
  for (const sc of scenarios().slice(0, 8)) runScript(sc);
  eq(sig(), a);
});
test('golden hashes: a recorded input script gives exactly the recorded state fingerprints (20 matches: all toys, all stages, 2-4 players, stock and time)', () => {
  const got = {}; for (const sc of scenarios()) got[sc.name] = runScript(sc).marks;
  if (RECORD) { fs.mkdirSync(path.dirname(GOLDEN), { recursive: true }); fs.writeFileSync(GOLDEN, JSON.stringify({ netv: E.NETV, note: 'tools/tests/unit/brawl-netcode.test.js: state hash at frames 300 / 900 / 1800 / end of 20 scripted matches. Recreate with BRAWL_RECORD=1.', hashes: got }, null, 1) + '\n'); console.log('  recorded ' + GOLDEN); return; }
  const g = JSON.parse(fs.readFileSync(GOLDEN, 'utf8'));
  eq(g.netv, E.NETV, 'NETV changed: record new golden hashes on purpose (BRAWL_RECORD=1)');
  for (const name of Object.keys(g.hashes)) eq(JSON.stringify(got[name]), JSON.stringify(g.hashes[name]), name);
  eq(Object.keys(got).length, Object.keys(g.hashes).length);
  ok(Object.values(got).some(m => Object.keys(m).length >= 3), 'some matches last past frame 900');
});
test('the golden run twice in a row (and with the matches interleaved) is identical: no hidden state outside st', () => {
  const sc = scenarios();
  const a = sc.map(s => runScript(s).marks), b = []; for (let i = sc.length - 1; i >= 0; i--) b[i] = runScript(sc[i]).marks;
  eq(JSON.stringify(a), JSON.stringify(b));
});
test('snapshot / restore: restoring at any frame and replaying gives the straight-through state (every 37 frames, 10 matches)', () => {
  for (const sc of scenarios().slice(0, 10)) {
    const ref = runScript(sc), snaps = {};
    runScript(sc, { after: (st, f) => { if (f % 37 === 0) snaps[f] = E.clone(st); } });
    for (const f of Object.keys(snaps).map(Number)) {
      const st = E.clone(snaps[f]);
      for (let k = f + 1; k <= ref.st.f; k++) E.step(st, ref.rows[k - 1]);
      eq(E.hashStr(st), E.hashStr(ref.st), sc.name + ' from ' + f);
      eq(JSON.stringify(st.fighters), JSON.stringify(ref.st.fighters), sc.name + ' fighters from ' + f);
    }
  }
});
test('restoring the same snapshot twice and replaying two different futures does not leak between them', () => {
  const sc = scenarios()[0], base = runScript(sc, { after: () => {} });
  const st0 = E.create({ seed: sc.seed, stage: sc.stage, fighters: sc.chars.map(ch => ({ ch, lvl: 0 })), mode: sc.mode, stocks: sc.stocks, time: 25 });
  for (let f = 1; f <= 200; f++) E.step(st0, base.rows[f - 1]);
  const snap = E.clone(st0), h = E.hashStr(snap);
  const a = E.clone(snap), b = E.clone(snap);
  for (let f = 201; f <= 400; f++) { E.step(a, base.rows[f - 1]); E.step(b, base.rows[f - 1].map(x => x ^ E.B.R)); }
  eq(E.hashStr(snap), h); ok(E.hashStr(a) !== E.hashStr(b));
  const c = E.clone(snap); for (let f = 201; f <= 400; f++) E.step(c, base.rows[f - 1]); eq(E.hashStr(c), E.hashStr(a));
});
test('clone + hash cost (measured, reported): a snapshot every frame is cheap', () => {
  const st = E.create({ seed: 5, stage: 'bench', fighters: [{ ch: 'robo' }, { ch: 'duck' }] });
  const rows = script(5, 2, 1200); for (let f = 0; f < 600; f++) E.step(st, rows[f]);
  let t = process.hrtime.bigint(); const N = 4000; for (let i = 0; i < N; i++) E.clone(st); const cl = Number(process.hrtime.bigint() - t) / N / 1000;
  t = process.hrtime.bigint(); for (let i = 0; i < 400; i++) E.hash(st); const hs = Number(process.hrtime.bigint() - t) / 400 / 1000;
  const s2 = E.clone(st); t = process.hrtime.bigint(); for (let f = 600; f < 1200; f++) E.step(s2, rows[f]); const sp = Number(process.hrtime.bigint() - t) / 600 / 1000;
  console.log('    [cost] clone ' + cl.toFixed(1) + ' us, hash ' + hs.toFixed(1) + ' us, step ' + sp.toFixed(1) + ' us  (a 12-frame rollback = 12 x (step + clone) = ' + (12 * (sp + cl) / 1000).toFixed(2) + ' ms)');
  ok(cl < 500 && hs < 3000);
});

// ---------------------------------------------------------------- 2. netcode（仮想の回線）
function checkPair(r, label, opt) {
  opt = opt || {};
  const bots = r.bots;
  for (const b of bots) eq(b.sess.done, opt.done || 'over', label + ': bot ' + b.p + ' finished');
  const h0 = E.hashStr(bots[0].sess.st);
  for (const b of bots) eq(E.hashStr(b.sess.st), h0, label + ': final states are identical');
  for (const b of bots) eq(b.sess.st.win, bots[0].sess.st.win, label + ': same winner');
  // ふつうに通しで進めた結果（ロールバックなし。記録した本物の入力で）と同じ
  const s0 = straightThrough(r.create, bots[0]); eq(E.hashStr(s0), h0, label + ': equals the straight-through run');
  // 途中の指紋（60フレームごと）も、席どうしで同じ
  const m = new Map(); for (const b of bots) for (const h of b.hashes) { const k = h.f + ''; if (m.has(k)) { eq(m.get(k), h.a + ':' + h.b, label + ': checkpoint ' + k); } else m.set(k, h.a + ':' + h.b); }
  ok(bots[0].hashes.length >= 2 || bots[0].sess.st.f < 120, label + ': checkpoints were exchanged');
  const worst = Math.max(...bots.map(b => b.sess.stats.maxRb));
  ok(worst <= NET.MAX_PRED, label + ': rollback never deeper than MAX_PRED, was ' + worst);
  return worst;
}
const report = (label, r) => { const s = r.bots[0].sess.stats; console.log('    [' + label + '] frames ' + r.bots[0].sess.st.f + '  rollbacks ' + s.rollbacks + ' (' + (100 * s.rollbacks / Math.max(1, s.steps)).toFixed(0) + '% of frames)  deepest ' + Math.max(...r.bots.map(b => b.sess.stats.maxRb)) + '  resim frames ' + s.resim + '  waits ' + s.stalls + '  skips ' + s.skips + '  rtt ' + Math.round(r.bots[0].sess.rtt) + 'ms  delay ' + r.bots[0].sess.delay); };

test('netcode: 2 bots, no delay at all: no rollback, identical to the straight run', () => {
  const r = simulate({ n: 2, seed: 41, stocks: 2, lat: 0 }); checkPair(r, 'lat0'); report('0ms', r);
  eq(r.bots[0].sess.stats.rollbacks, 0);
});
for (const sc of [
  { name: '40ms one way (rtt 80), jitter 10', lat: 40, jit: 10, seed: 42 },
  { name: '80ms one way (rtt 160), jitter 20, 2% loss', lat: 80, jit: 20, loss: 0.02, seed: 43 },
  { name: '150ms one way (rtt 300), jitter 40, 5% loss', lat: 150, jit: 40, loss: 0.05, seed: 44 },
  { name: 'packets reordered and duplicated: 60ms, jitter 40, 8% loss, 20% reorder, 20% dup', lat: 60, jit: 40, loss: 0.08, reorder: 0.2, dup: 0.2, seed: 45 },
  { name: 'a very bad line: 120ms, jitter 60, 20% loss', lat: 120, jit: 60, loss: 0.2, seed: 46 },
]) {
  test('netcode: 2 bots, ' + sc.name + ': both finish, same final hash, equal to the straight run, never deeper than ' + NET.MAX_PRED, () => {
    const r = simulate(Object.assign({ n: 2, stocks: 2, frames: 4000 }, sc)); checkPair(r, sc.name); report(sc.name, r);
    ok(r.bots[0].sess.stats.rollbacks > 0 || sc.lat === 0, 'rollbacks happened');
  });
}
test('netcode: 10 different matches at 80ms+jitter+5% loss: always identical (stress)', () => {
  const chars = E.CHAR_IDS; let rb = 0, ends = 0;
  for (let i = 0; i < 10; i++) {
    const r = simulate({ n: 2, seed: 500 + i, stage: E.STAGE_IDS[i % 5], chars: [chars[(i * 3) % 18], chars[(i * 5 + 1) % 18]], stocks: 1, lat: 80, jit: 25, loss: 0.05, reorder: 0.05, delay: 2 + (i % 4), cap: 40, hook: null });
    checkPair(r, 'match ' + i); rb += r.bots[0].sess.stats.rollbacks; if (r.bots[0].sess.st.why === 'ko') ends++;
  }
  console.log('    [stress] rollbacks ' + rb + ', ended by KO ' + ends + ' of 10');
});
test('netcode: 8 long matches over a bad line (90ms, jitter 30, 5% loss) mostly end by KO: the end is only final once every input is known, and always the same on both sides', () => {
  const ch = E.CHAR_IDS; let ko = 0;
  for (let i = 0; i < 8; i++) {
    const r = simulate({ n: 2, seed: 900 + i, stage: E.STAGE_IDS[i % 5], chars: [ch[(i * 3) % 18], ch[(i * 5 + 1) % 18]], stocks: 1, lat: 90, jit: 30, loss: 0.05, cap: 150, delay: 2 + (i % 4) });
    checkPair(r, 'long ' + i); if (r.bots[0].sess.st.why === 'ko') ko++;
  }
  ok(ko >= 3, 'KO endings: ' + ko);
});
test('netcode: 4 players (free for all) over a bad line: identical states, same winner', () => {
  const r = simulate({ n: 4, seed: 61, stocks: 1, chars: ['robo', 'duck', 'bear', 'tin'], lat: 70, jit: 25, loss: 0.04, cap: 50 }); checkPair(r, '4p'); report('4 players', r);
});
test('netcode: 3 players with different lines (one side is much worse)', () => {
  const r = simulate({ n: 3, seed: 62, stocks: 1, cap: 40, lat: 30, links: { '0>2': { lat: 140, jit: 30 }, '2>0': { lat: 140, jit: 30 }, '1>2': { lat: 100, loss: 0.1 } } }); checkPair(r, '3p'); report('3 players', r);
});
test('netcode: the other player starts 300 ms late and runs 3% slow: the faster side waits / skips frames to keep close, no desync', () => {
  const r = simulate({ n: 2, seed: 63, stocks: 2, lat: 40, jit: 8, skew: [0, 300], drift: [1, 0.97], cap: 40 });
  checkPair(r, 'skew'); report('skew+drift', r);
  ok(r.bots[0].sess.stats.skips + r.bots[0].sess.stats.stalls > 0, 'the fast side held back');
});
test('netcode: the line is down for 2.5 seconds in the middle (both ways): the game waits (never more than 12 frames of guessing), then goes on from the ack, no desync, no forfeit', () => {
  const r = simulate({ n: 2, seed: 64, stocks: 2, lat: 40, jit: 5, cap: 40, links: { '0>1': { down: [3000, 5500] }, '1>0': { down: [3000, 5500] } } });
  checkPair(r, 'outage'); report('outage', r);
  ok(r.bots[0].sess.stats.stalls > 20, 'waited while the line was down, waits ' + r.bots[0].sess.stats.stalls);
  ok(r.bots[0].sess.stats.maxPredNow <= NET.MAX_PRED + 1);
});
test('netcode: a player who stops sending for 5 seconds forfeits: the other wins by forfeit, and the match ends', () => {
  const r = simulate({ n: 2, seed: 65, stocks: 3, lat: 40, cap: 120, hook: (b, i) => { if (b.p === 1 && i === 400) b.dead = true; }, maxMs: 60000 });
  const a = r.bots[0].sess; eq(a.done, 'forfeit'); eq(a.result.win, 0); eq(a.result.why, 'forfeit'); eq(a.result.loser, 1);
  ok(a.st.f >= 400 && a.st.f < 400 + 6 * 60 + 80, 'ended about 5 s after the last input, frame ' + a.st.f);
});
test('netcode: with 3 or more players, one leaving ends the match with no result (the survivors would not agree on the leaver\'s last frame yet)', () => {
  const r = simulate({ n: 3, seed: 66, stocks: 1, lat: 40, cap: 40, hook: (b, i) => { if (b.p === 2 && i === 300) b.dead = true; }, maxMs: 90000 });
  for (const p of [0, 1]) { const s = r.bots[p].sess; ok(s.forfeited[2], 'seat ' + p + ' saw the leaver'); eq(s.done, 'abort', 'seat ' + p); eq(s.result.win, -1); }
});
test('netcode: a state that drifts (a bug on one side) is caught at the next checkpoint: both sides end as desync with no winner', () => {
  const r = simulate({ n: 2, seed: 67, stocks: 3, lat: 40, jit: 5, cap: 120, hook: (b, i) => { if (b.p === 1 && i === 500) { const s = b.sess; s.st.fighters[0].x += 3; for (const sn of s.snap) if (sn && sn.f >= s.st.f - 31) sn.st.fighters[0].x += 3; } }, maxMs: 60000 });
  for (const b of r.bots) { eq(b.sess.done, 'desync', 'bot ' + b.p); eq(b.sess.result.win, -1); ok(b.sess.st.f < 500 + 200, 'found within 3 checkpoints, frame ' + b.sess.st.f); }
});
test('netcode: input delay can change in the middle of a match (2 ↔ 5): still identical', () => {
  const r = simulate({ n: 2, seed: 68, stocks: 2, lat: 60, jit: 15, cap: 40, hook: (b, i) => { if (b.p === 0 && i % 240 === 0) b.sess.setDelay(2 + ((i / 240) * 3) % 4); if (b.p === 1 && i % 300 === 0) b.sess.setDelay(5 - ((i / 300) % 4)); } });
  checkPair(r, 'delaychange'); ok(r.bots[0].sess.stats.delayChanges > 3);
});
test('netcode: delayFor(rtt) gives 2 for a good line (rtt up to ~100 ms), 4 at 160 ms, 5 from ~200 ms; and the measured rtt is close to the real one', () => {
  eq(NET.Session.delayFor(0), 2); eq(NET.Session.delayFor(60), 2); eq(NET.Session.delayFor(100), 2); eq(NET.Session.delayFor(160), 4); eq(NET.Session.delayFor(200), 5); eq(NET.Session.delayFor(400), 5);
  const r = simulate({ n: 2, seed: 69, stocks: 1, lat: 50, jit: 0, cap: 20 }); const m = r.bots[0].sess.rtt; ok(m > 90 && m < 140, 'rtt ' + m);
});
test('netcode: bad or old messages are ignored (wrong shape, wrong length, from myself, from a seat that does not exist)', () => {
  const s = new NET.Session({ E, create: { seed: 1, stage: 'bench', fighters: [{ ch: 'robo' }, { ch: 'duck' }] }, me: 0, g: 1 });
  for (const m of [null, 5, 'x', {}, { b: 0, s: 5, d: 'AAAAAAAAAAAAAAA' }, { b: 7, s: 8, d: 'AAA' }, { b: 7, s: 8, d: 'AA!AA!' }, { b: 7, s: 1e9, d: '' }]) s.receive(1, m, 10);
  s.receive(0, { b: 7, s: 7, d: 'AAA' }, 10); s.receive(5, { b: 7, s: 7, d: 'AAA' }, 10); s.receive(-1, { b: 7, s: 7, d: 'AAA' }, 10);
  eq(s.cf[1], NET.START_FRAMES); eq(s.inp[1][7], -1);
  s.receive(1, { b: 7, s: 7, d: 'AAA', f: 3, a: '6,6' }, 11); eq(s.inp[1][7], 0); eq(s.cf[1], 7);
});
test('netcode: input wire format: 16-bit inputs round-trip through 3 characters, and one message is small', () => {
  for (const v of [0, 1, 4095, 4096, 32768, 65535, 0x1234]) eq(NET.dec3(NET.enc3(v), 0), v);
  const r = simulate({ n: 2, seed: 70, stocks: 1, lat: 40, cap: 10 });
  const m = r.bots[0].sess.pollSend(1e9, true); ok(JSON.stringify(m).length < 140, 'a message is ' + JSON.stringify(m).length + ' bytes: ' + JSON.stringify(m));
});
test('netcode: cost of a tick with a deep rollback (measured, reported)', () => {
  const create = { seed: 71, stage: 'bench', fighters: [{ ch: 'robo' }, { ch: 'ninja' }], mode: 'stock', stocks: 3, time: 20, cap: 60, training: true };   // training：やられても試合が終わらない
  const s = new NET.Session({ E, create, me: 0, g: 1, delay: 3 }); let now = 1000; const rows = script(71, 2, 4000);
  const times = [];
  // 相手の入力が 10 フレームぶん遅れてまとめて届く → 毎回 10 フレーム撃ち直す、という最悪の形を 150 回
  for (let k = 0; k < 150; k++) {
    let adv = 0; while (adv < 10 && !s.st.over) { const o = s.tick(() => rows[s.lf % 4000][0], now += 16.7); if (o.advanced) adv++; }
    const b = s.cf[1] + 1, cnt = s.st.f - b + 2; let d = ''; for (let q = 0; q < cnt; q++) d += NET.enc3(rows[(b + q) % 4000][1] & 0xffff);
    s.receive(1, { g: 1, f: s.st.f, s: b + cnt - 1, b, d, a: '0,0', t: 1, e: -1, w: 0 }, now);
    const t0 = process.hrtime.bigint(); const o = s.tick(() => rows[s.lf % 4000][0], now += 16.7); const dt = Number(process.hrtime.bigint() - t0) / 1e6; times.push(dt);
    ok(o.resim <= NET.MAX_PRED + 1, 'resim ' + o.resim);
  }
  times.sort((a, b) => a - b); console.log('    [cost] tick with a ~10 frame rollback: median ' + times[75].toFixed(2) + ' ms, 95% ' + times[142].toFixed(2) + ' ms, worst ' + times[149].toFixed(2) + ' ms (node, no drawing)');
  ok(times[142] < 8);
});

run('brawl-netcode (オンライン対戦の土台)');
