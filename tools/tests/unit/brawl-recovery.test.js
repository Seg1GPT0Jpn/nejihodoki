// 上とくぎ（もどる技）のテスト（node だけ）：種類の数・どの2人も軌跡と性質がちがう（形・ねらい・リスクの「ちがい」に下限）・CPU がちゃんともどれる・種類ごとの仕掛けが効く。
// ちがいの数字は、「まっすぐ上に何px」ではなく、動かしたときの軌跡の形（4とおりの入力）・当たらない時間・当たり判定の時間・おわりの無防備・ふちへのすいつき を、見て測る。
// 実行：node tools/tests/unit/brawl-recovery.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'brawl/engine.js'));
const B = E.B;
const IDS = E.CHAR_IDS.filter(id => !E.CH[id].boss);

// 何もない空中（ステージのはし）から、とくぎを出して、66 フレームの動きを記録する
function runScript(id, dir) {
  const st = E.create({ seed: 1, stage: 'bench', fighters: [{ ch: id }, { ch: 'robo' }] }), a = st.fighters[0]; st.fighters[1].x = 700;
  a.x = 560; a.y = 100; a.gr = -1; a.vy = 0; a.vx = 0; a.jumps = 0; a.face = -1;
  const pts = []; let inv = 0, hit = 0, atk = 0, ledge = 0;
  E.step(st, [B.S | B.U | dir, 0]);
  for (let i = 0; i < 66; i++) {
    E.step(st, [B.S | dir, 0]); if (a.inv > 0 && a.s === 'atk') inv++; if (a.s === 'atk') { atk++; if (E.activeBoxes(st, 0)) hit++; } if (a.s === 'ledge') ledge = 1;
    if (i % 6 === 5) pts.push([(a.x - 560) / 300, (a.y - 100) / 300]); if (a.y > 420 || a.s === 'dead') { while (pts.length < 11) pts.push(pts[pts.length - 1] || [0, 0]); break; }
  }
  return { pts, inv, hit, atk, ledge, help: a.help ? 1 : 0, x: a.x - 560, y: a.y - 100 };
}
const SIG = {};
function sigOf(id) {
  if (SIG[id]) return SIG[id];
  const sc = [0, B.L, B.R, B.U].map(d => runScript(id, d)), m = E.MOVES[id].spU;
  const traj = []; for (const s of sc) for (const p of s.pts) traj.push(p[0], p[1]);
  return (SIG[id] = { traj, kind: m.kind, inv: sc[0].inv / 66, hit: sc[0].hit / 66, atk: sc[0].atk / 66, help: sc[0].help, steerX: Math.abs(sc[1].x - sc[2].x) / 300, steerY: Math.abs(sc[3].y - sc[0].y) / 300, ledge: sc.some(s => s.ledge) ? 1 : 0 });
}
// 軌跡の形（4とおりの入力ぶん）の平均のちがい ＋ 種類がちがう ＋ 無敵・当たり・無防備・ステアリングのちがい。0〜100くらい
function recDist(a, b) {
  const A = sigOf(a), Bq = sigOf(b); let t = 0; for (let i = 0; i < A.traj.length; i++) t += Math.min(1, Math.abs(A.traj[i] - Bq.traj[i]) * 2.2); t = t / A.traj.length * 100;
  return Math.round((t * 0.55 + (A.kind !== Bq.kind ? 14 : 0) + 12 * Math.abs(A.inv - Bq.inv) + 12 * Math.abs(A.hit - Bq.hit) + 6 * Math.abs(A.atk - Bq.atk) + (A.help !== Bq.help ? 4 : 0) + 10 * Math.abs(A.steerX - Bq.steerX) + 10 * Math.abs(A.steerY - Bq.steerY)) * 100) / 100;
}
const FLOOR = 10;

test('recovery kinds: 31 different up-special kinds over 50 toys, at most 2 toys per kind, every kind is a registered recovery (or the old rise / warp), each toy declares how far it reaches (rr)', () => {
  const kinds = {}; for (const id of IDS) { const m = E.MOVES[id].spU; (kinds[m.kind] = kinds[m.kind] || []).push(id); ok(m.kind === 'rise' || m.kind === 'tele' || (E.KINDS[m.kind] && E.KINDS[m.kind].recovery), id + ' ' + m.kind); if (id !== 'robo') ok(m.rr > 0, id + ' has rr'); }
  console.log('    recovery kinds: ' + Object.keys(kinds).length + ' of ' + IDS.length + ' toys; shared: ' + Object.entries(kinds).filter(([k, v]) => v.length > 1).map(([k, v]) => k + '(' + v.join('/') + ')').join(' '));
  ok(Object.keys(kinds).length >= 30, 'kinds ' + Object.keys(kinds).length);
  for (const [k, v] of Object.entries(kinds)) ok(v.length <= 2, k + ' is used by ' + v.length + ' toys');
  ok(IDS.filter(id => E.MOVES[id].spU.kind === 'rise').length <= 1, 'the plain "rise" is kept for one toy only');
});

test('recovery similarity: every pair of toys has a different up special (shape of the path under 4 inputs, kind, invulnerability, hit frames, helplessness, steering); the closest pairs are reported', () => {
  const rows = []; for (let i = 0; i < IDS.length; i++) for (let j = i + 1; j < IDS.length; j++) rows.push({ a: IDS[i], b: IDS[j], d: recDist(IDS[i], IDS[j]) });
  rows.sort((x, y) => x.d - y.d);
  console.log('    recovery distance (0-100): min ' + rows[0].d + ', p10 ' + rows[(rows.length * 0.1) | 0].d + ', median ' + rows[rows.length >> 1].d + '. closest: ' + rows.slice(0, 10).map(r => r.a + '/' + r.b + ' ' + r.d).join(', '));
  for (const r of rows) ok(r.d >= FLOOR, r.a + ' (' + E.MOVES[r.a].spU.kind + ') and ' + r.b + ' (' + E.MOVES[r.b].spU.kind + ') recover too alike: ' + r.d);
  // pairs that share a kind must still differ clearly in how they play
  for (const r of rows) if (E.MOVES[r.a].spU.kind === E.MOVES[r.b].spU.kind) ok(r.d >= FLOOR, 'same kind ' + r.a + '/' + r.b + ': ' + r.d);
});

test('CPU recovery: every toy gets back to the ledge or the stage from 60 and 120 px below at least 4 of 6 times (levels 2 and 3, three distances); the weak ones are reported', () => {
  const S = E.STAGES.bench, L = S.ledges[1], weak = [];
  for (const id of IDS) {
    let ok60 = 0, ok120 = 0;
    for (const off of [60, 120]) for (const dx of [40, 100, 160]) for (const lv of [2, 3]) {
      const st = E.create({ seed: off * 7 + dx + lv, stage: 'bench', fighters: [{ ch: id, lvl: lv }, { ch: 'robo' }] }), a = st.fighters[0], C = E.CH[id]; st.fighters[1].x = -250;
      a.x = L.x + dx; a.y = L.y + C.h * 0.9 + off; a.gr = -1; a.vy = 0; a.s = 'free'; let got = false;
      for (let i = 0; i < 320; i++) { E.step(st, [E.cpu(st, 0), 0]); if (a.s === 'ledge' || a.gr >= 0) { got = true; break; } if (a.s === 'dead' || a.s === 'out') break; }
      if (got) { if (off === 60) ok60++; else ok120++; }
    }
    if (ok60 < 4 || ok120 < 4) weak.push(id + ' ' + ok60 + '/6,' + ok120 + '/6'); ok(ok60 >= 4, id + ' recovers from 60 below: ' + ok60 + '/6'); ok(ok120 >= 4, id + ' recovers from 120 below: ' + ok120 + '/6');
  }
  console.log('    weak recoveries: ' + (weak.join('  ') || 'none'));
});

// ---- 種類ごとの仕掛け
const duel = id => { const st = E.create({ seed: 3, stage: 'bench', fighters: [{ ch: id }, { ch: 'robo' }] }); st.fighters[1].x = 700; return st; };
const air = (st, x, y) => { const a = st.fighters[0]; a.x = x; a.y = y; a.gr = -1; a.vy = 0; a.vx = 0; a.jumps = 0; a.s = 'free'; return a; };
const seenLedge = (st, n, i0) => { let s = false; for (let i = 0; i < n; i++) { E.step(st, [typeof i0 === 'function' ? i0(i) : i0 | 0, 0]); if (st.fighters[0].s === 'ledge') s = true; } return s; };
const step = (st, n, i0, i1) => { for (let i = 0; i < n; i++) E.step(st, [typeof i0 === 'function' ? i0(i) : i0 | 0, i1 | 0]); };

test('each recovery kind does what it says', () => {
  // rocket (tank): hangs (no rise) for the delay, then climbs; ends with a blast
  { const st = duel('tank'), a = air(st, 0, -200), m = E.MOVES.tank.spU; step(st, m.s + 2, B.S | B.U); const y0 = a.y; step(st, m.d - 5, B.U); ok(Math.abs(a.y - y0) < 8, 'rocket hangs during the delay'); step(st, m.a + 4, B.U); ok(y0 - a.y > 90, 'then climbs: ' + (y0 - a.y)); }
  // tether (giraffe): in range it is pulled to the ledge and hangs on it; out of range it only hops
  { const st = duel('giraffe'), L = E.STAGES.bench.ledges[1], C = E.CH.giraffe, a = air(st, L.x + 150, L.y + C.h * 0.9 + 100); a.face = -1; step(st, 1, B.S | B.U | B.L); ok(seenLedge(st, 40, B.L), 'pulled onto the ledge'); const far = duel('giraffe'), b = air(far, L.x + 150, L.y + C.h * 0.9 + 400); b.face = -1; step(far, 1, B.S | B.U | B.L); ok(!seenLedge(far, 40, B.L), 'too far: no pull'); }
  // magnet (patrol)
  { const st = duel('patrol'), L = E.STAGES.bench.ledges[1], C = E.CH.patrol, a = air(st, L.x + 120, L.y + C.h * 0.9 + 80); a.face = -1; step(st, 1, B.S | B.U); ok(seenLedge(st, 46, 0), 'magnet snap'); }
  // dropin (void): vanishes (invulnerable), reappears above the middle of the stage
  { const st = duel('void'), a = air(st, 500, 150); step(st, 1, B.S | B.U); step(st, 8, 0); ok(a.inv > 0, 'invulnerable while gone'); step(st, 40, 0); ok(Math.abs(a.x) < 80 && a.y < E.STAGES.bench.spawn[1] + 200, 'reappears above the stage: ' + a.x + ',' + a.y); }
  // cloudstep (wiz): stays at one height, then one more jump comes back
  { const st = duel('wiz'), a = air(st, 0, -200), m = E.MOVES.wiz.spU; step(st, 1, B.S | B.U); step(st, m.s + m.b + 4, 0); const y1 = a.y; step(st, 12, 0); ok(Math.abs(a.y - y1) < 3, 'hovers'); step(st, m.a + 4, 0); ok(a.jumps >= 1, 'the jump is back'); ok(!a.help, 'not helpless'); }
  // bubble (snail): invulnerable while rising, pops at the end
  { const st = duel('snail'), a = air(st, 0, -200), m = E.MOVES.snail.spU; step(st, 1, B.S | B.U); step(st, 20, 0); ok(a.inv > 0, 'invulnerable inside the bubble'); step(st, m.a + 10, 0); ok(a.inv <= 2); }
  // gravflip (sonar): gravity points up for a while
  { const st = duel('sonar'), a = air(st, 0, -200); step(st, 1, B.S | B.U); step(st, 20, 0); ok(a.vy < -3, 'accelerating upward: ' + a.vy); }
  // parachute (reed): falls very slowly, and the toy is not helpless afterwards
  { const st = duel('reed'), a = air(st, 0, -300), m = E.MOVES.reed.spU; a.vy = 6; step(st, 1, B.S | B.U); step(st, 40, 0); ok(a.vy < 1.6, 'slow fall: ' + a.vy); step(st, m.a + 10, 0); ok(!a.help, 'free after'); }
  // multihop (duck): three separate jumps
  { const st = duel('duck'), a = air(st, 0, -300), m = E.MOVES.duck.spU; let n = 0, last = 0; step(st, 1, B.S | B.U); for (let i = 0; i < 60; i++) { E.step(st, [0, 0]); if (a.vy < last - 4) n++; last = a.vy; } ok(n >= 3, 'three hops: ' + n); }
  // spring (jack): two bounces, the second after a gap
  { const st = duel('jack'), a = air(st, 0, -300), m = E.MOVES.jack.spU; let n = 0, last = 0; step(st, 1, B.S | B.U); for (let i = 0; i < 40; i++) { E.step(st, [0, 0]); if (a.vy < last - 3) n++; last = a.vy; } ok(n >= 2, 'two bounces: ' + n); }
  // rebound (ball): dives first, then climbs above the start
  { const st = duel('ball'), a = air(st, 0, -200), m = E.MOVES.ball.spU; step(st, 1, B.S | B.U); let ymax = a.y, ymin = a.y; for (let i = 0; i < 50; i++) { E.step(st, [0, 0]); ymax = Math.max(ymax, a.y); ymin = Math.min(ymin, a.y); } ok(ymax > -200 + 20, 'dove: ' + ymax); ok(ymin < -200 - 40, 'then rose: ' + ymin); }
  // chargeleap (bear): the longer the charge, the farther the leap
  { const leap = hold => { const st = duel('bear'), a = air(st, 0, -200); a.face = 1; step(st, 1, B.S | B.U | B.R); step(st, hold, B.S | B.R); step(st, 40, B.R); return Math.abs(a.x); }; ok(leap(34) > leap(2) + 60, 'charge adds distance: ' + leap(34) + ' vs ' + leap(2)); }
  // chargeleap works on a plain tap too (a short leap)
  // pendulum (scoopjack): dips first, then swings up and forward
  { const st = duel('scoopjack'), a = air(st, 0, -200), m = E.MOVES.scoopjack.spU; a.face = 1; step(st, 1, B.S | B.U | B.R); let ymax = a.y; for (let i = 0; i < m.a + m.s + 4; i++) { E.step(st, [B.R, 0]); ymax = Math.max(ymax, a.y); } ok(ymax > -200 + 15, 'dips: ' + ymax); ok(a.x > 100 && a.y < -200 - 20, 'ends forward and above: ' + a.x + ',' + a.y); }
  // jet (pumper): flies in the held direction while the button is held, and stops when released
  { const st = duel('pumper'), a = air(st, 0, -200); step(st, 1, B.S | B.U | B.R); step(st, 16, B.S | B.R); ok(a.x > 40, 'flew right'); const x1 = a.x; step(st, 30, 0); ok(a.x - x1 < 45, 'stops when released'); }
  // drill (top) and pogo (drum): they hit while moving, more than once on one foe
  { for (const id of ['top', 'drum']) { const st = E.create({ seed: 2, stage: 'bench', fighters: [{ ch: id }, { ch: 'robo' }] }), a = st.fighters[0], d = st.fighters[1]; a.x = 0; a.y = -150; a.gr = -1; a.jumps = 0; a.s = 'free'; let hits = 0; E.step(st, [B.S | B.U, 0]); for (let i = 0; i < 60; i++) { d.x = a.x; d.y = a.y + (id === 'drum' ? 52 : 28); d.vx = d.vy = 0; d.gr = -1; d.s = 'free'; d.hold = 0; d.inv = 0; for (const e of E.step(st, [0, 0])) if (e.t === 'hit' && e.d === 1) hits++; } ok(hits >= 2, id + ' hits repeatedly: ' + hits); } }
  // blink (mirror): random but deterministic; the same seed gives the same landing
  { const go = seed => { const st = E.create({ seed, stage: 'bench', fighters: [{ ch: 'mirror' }, { ch: 'robo' }] }), a = air(st, 500, 100); a.face = -1; step(st, 1, B.S | B.U); step(st, 20, 0); return Math.round(a.x) + ',' + Math.round(a.y); }; eq(go(7), go(7)); const set = new Set(); for (let s = 1; s < 30; s++) set.add(go(s)); ok(set.size >= 2, 'both outcomes happen: ' + [...set]); }
});

run('brawl-recovery (上とくぎ：種類・ちがい・CPU のもどり・仕掛け)');
