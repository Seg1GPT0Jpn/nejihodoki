// chess/online.js（オンライン対戦のアダプター）の単体テスト：形のおかしい手・番でない席・昇格の駒がない手を断る・公開する状態が
// データベースのルール（pd のキーは英小文字1〜4字・配列の添字は99まで・文字列は24文字まで・数は±1000000。act は t が英小文字2〜8字で c・k・w・x だけ）の形に収まる・
// 手の列の文字列の往復（790手まで）・投了／引き分けの申しこみと受け／「待った」・時計（増分・時間切れの届け・メイトできない駒だけなら引き分け）・
// CPU の席と、切れた席の代わり（2手まで打って、そのあとは投了）・保存して読み戻せる・ホストがいなくなったときの順位・画面側の view が盤・最後の手・時計を作る。
// common/turnroom.js の中の通信は rules/turnroom-bots.js が見る（chess を足したあと）。実行：node tools/tests/unit/chess-online.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'chess/engine.js'));
global.ChessEngine = E;
global.ChessAI = require(path.join(ROOT, 'chess/ai.js'));
const O = require(path.join(ROOT, 'chess/online.js'));
const H = O.host;
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const json = v => JSON.parse(JSON.stringify(v));
const RULES = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules.tr.$game.rooms.$room;

let T0 = 1000000; O.setNow(() => T0);
const mk = (o) => { O.setCfg({ tc: (o && o.tc) != null ? o.tc : 2 }); return H.create({ g: 1, n: 2, seed: 1, cp: 2, humans: (o && o.humans) || [0, 1], first: 0 }); };
const mv = (st, seat, uci) => { const lg = st.game.legal(), m = lg.find(x => E.uci(x) === uci); if (m == null) throw new Error('not legal ' + uci); return H.apply(st, seat, O.toWire(m & 63, (m >> 6) & 63, (m >> 12) & 15)); };

function fitsRules(pub) {
  const bad = [];
  const scalar = x => typeof x === 'boolean' || (typeof x === 'number' && x >= -1e6 && x <= 1e6) || (typeof x === 'string' && x.length <= 24);
  for (const [k, val] of Object.entries(pub.pd)) {
    if (!/^[a-z]{1,4}$/.test(k)) bad.push('pd key ' + k);
    if (Array.isArray(val)) { if (val.length > 100) bad.push('pd.' + k + ' too long'); val.forEach((x, i) => { if (!scalar(x)) bad.push('pd.' + k + '.' + i); }); }
    else if (!scalar(val)) bad.push('pd value ' + k);
  }
  (pub.ev || []).forEach(e => {
    if (!/^[a-z]{2}$/.test(e.t)) bad.push('ev t ' + e.t);
    for (const [k, val] of Object.entries(e)) {
      if (!['i', 't', 's', 'w', 'x', 'k', 'c', 'n', 'd'].includes(k)) bad.push('ev field ' + k);
      if (k === 'c' && !(val >= -1 && val <= 255)) bad.push('ev c'); if (k === 'n' && !(val >= 0 && val <= 100000)) bad.push('ev n'); if (['s', 'w', 'x', 'k'].includes(k) && !(val >= -1 && val <= 3)) bad.push('ev ' + k);
    }
  });
  return bad;
}
const actFits = a => /^[a-z]{2,8}$/.test(a.t) && Object.keys(a).every(k => ['t', 'c', 'k', 'w', 'x'].includes(k)) && (a.c == null || (a.c >= -1 && a.c <= 255)) && ['k', 'w', 'x'].every(k => a[k] == null || (a[k] >= -1 && a[k] <= 3));
const pubOf = (st, evs) => ({ v: 1, g: 1, ph: H.isOver(st) ? 'over' : 'play', tn: H.turn(st), pd: json(H.pub(st)), ev: evs || [] });

test('wire format: every move of every square pair round trips and fits the database rules for a move (t, c, k, w, x); odd shapes are refused', () => {
  for (let f = 0; f < 64; f++) for (let t = 0; t < 64; t++) { const w = O.toWire(f, t, 0); ok(actFits(w), JSON.stringify(w)); const d = O.fromWire(w); eq(d.from, f); eq(d.to, t); eq(d.promo, 0); }
  for (const p of [2, 3, 4, 5]) { const w = O.toWire(52, 60, p); ok(actFits(w), JSON.stringify(w)); eq(w.t.length, 2); const d = O.fromWire(w); eq(d.promo, p); eq(d.to, 60); }
  for (const t of O.SIMPLE) { const w = O.simpleWire(t); ok(actFits(w)); eq(O.fromWire(w), null, t + ' is not a move'); }
  for (const a of [null, undefined, {}, { t: 'mv' }, { t: 'mv', c: -1, k: 0, w: 0, x: 0 }, { t: 'mv', c: 64, k: 0, w: 0, x: 0 }, { t: 'mv', c: 1, k: 4, w: 0, x: 0 }, { t: 'mv', c: 1.5, k: 0, w: 0, x: 0 }, { t: 'mv', c: '1', k: 0, w: 0, x: 0 }, { t: 'pk', c: 1, k: 0, w: 0, x: 0 }, 'mv', 7, { t: 5 }]) eq(O.fromWire(a), null, JSON.stringify(a));
});
test('the database rules: chess is allowed wherever gomoku is (the integrator\'s edit); until then this reports what is missing', () => {
  const txt = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
  const n = (txt.match(/colorcards\|reversi\|gomoku\|chess/g) || []).length, old = (txt.match(/colorcards\|reversi\|gomoku\)/g) || []).length;
  if (n === 0) { console.log('  NOTE  database.rules.json does not list chess yet: add |chess to the ' + old + ' places that say (colorcards|reversi|gomoku) (see chess/assets/shared-edits.txt)'); return; }
  eq(old, 0, 'no list that stops at gomoku'); ok(n >= 19, 'chess listed in ' + n + ' places');
});
test('the move list string: 790 plies fit in 100 strings of 24 characters, round trip exactly, and the garbage tail of a damaged string is cut off', () => {
  const list = []; let seed = 3; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let i = 0; i < O.MAXPLY; i++) list.push(E.mk(Math.floor(rnd() * 64), Math.floor(rnd() * 64), [0, 2, 3, 4, 5][Math.floor(rnd() * 5)], 0));
  const enc = O.encMoves(list); ok(enc.length <= 100 && enc.every(s => s.length <= 24 && s.length % 3 === 0), 'strings: ' + enc.length);
  const dec = O.decMoves(enc); eq(dec.length, list.length); dec.forEach((d, i) => { eq(d.from, list[i] & 63); eq(d.to, (list[i] >> 6) & 63); eq(d.promo, (list[i] >> 12) & 15); });
  eq(O.decMoves(['AB-AB-A']).length, 2); eq(O.decMoves({ 0: 'AB-', 1: 'CD-' }).length, 2, 'an object with numeric keys is read like an array (the database can return one)'); eq(O.decMoves(['A?-', 'CD-']).length, 0, 'stops at the first bad character'); eq(O.decMoves(undefined).length, 0);
});
test('apply: wrong seat, illegal move, a promotion without its piece, a promotion piece on a normal move, nonsense: all refused; a legal move is accepted and changes the turn', () => {
  const st = mk(); ok(!H.isOver(st)); eq(H.turn(st), 0);
  eq(H.apply(st, 1, O.toWire(52, 36, 0)), null, 'black moving on white\'s turn');
  eq(H.apply(st, 0, O.toWire(52, 20, 0)), null, 'e2-e3-e3? the pawn to e3 is fine; this is e2 to e3 (20)'.length > 0 ? H.apply(st, 0, O.toWire(8, 8, 0)) : null);
  eq(H.apply(st, 0, O.toWire(12, 36 + 8, 0)), null, 'a pawn three squares'); eq(H.apply(st, 0, O.toWire(0, 8, 0)), null, 'a rook into its own pawn');
  eq(H.apply(st, 0, { t: 'zz' }), null); eq(H.apply(st, 0, null), null); eq(H.apply(st, 0, { t: 'mv', c: 99, k: 0, w: 0, x: 0 }), null);
  eq(H.apply(st, 0, O.toWire(12, 28, 5)), null, 'a queen promotion on e2-e4');
  const r = H.apply(st, 0, O.toWire(12, 28, 0)); ok(r && r.ev.length === 1 && r.ev[0].t === 'mv' && r.ev[0].s === 0 && r.ev[0].c === 12, JSON.stringify(r)); eq(H.turn(st), 1);
  eq(H.apply(st, 0, O.toWire(8, 16, 0)), null, 'white again');
  const pr = H.create({ g: 1, n: 2, seed: 1, cp: 2, humans: [0, 1] }); pr.game = new E.Game('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
  eq(H.apply(pr, 0, O.toWire(49, 57, 0)), null, 'promotion without a piece'); const ok2 = H.apply(pr, 0, O.toWire(49, 57, 4)); ok(ok2); eq(pr.game.sans[0], 'b8=R+'); const n = ok2.ev[0].n; eq(n & 63, 57); ok(n & 128, 'check flag'); eq(n >> 11, 4);
});
test('a whole game through the adapter (CPU vs CPU seats): every published state fits the rules, the view on a "guest" page equals the host\'s game, events carry the flags, the result matches', () => {
  O.setCfg({ tc: 0 });
  let checked = 0; const caps = { cap: 0, chk: 0, castle: 0, mate: 0 };
  for (let seed = 1; seed <= 6; seed++) {
    O.setCfg({ tc: seed % 2 ? 0 : 3 });
    const st = H.create({ g: 1, n: 2, seed, cp: 1 + (seed % 3), humans: [], first: 0 }); const ctx = O.newCtx(); let ei = 0, guard = 0, first = true; let last = null;
    while (!H.isOver(st) && guard++ < 260) {
      const k = H.turn(st), a = H.cpu(st, k, 1 + (guard % 3)); ok(actFits(a), 'a CPU move fits the act rules ' + JSON.stringify(a));
      T0 += 1500;
      const r = H.apply(st, k, a); if (!r) throw new Error('adapter refused a CPU move ' + JSON.stringify(a));
      const evs = r.ev.map(e => Object.assign({ i: ++ei }, e)); const pub = pubOf(st, evs), bad = fitsRules(pub); eq(bad.length, 0, 'fits the rules: ' + bad.join(','));
      for (const e of evs) if (e.t === 'mv') { if (e.n & 64) caps.cap++; if (e.n & 128) caps.chk++; if (e.n & 512) caps.castle++; if (e.n & 256) caps.mate++; }
      const me = k, m = { gn: 1, v: guard, ph: H.isOver(st) ? 'over' : 'play', me, n: 2, tn: H.turn(st), pd: pub.pd, ev: evs, fresh: first }; first = false;
      const v = O.view(m, ctx); eq(v.game.fen(), st.game.fen(), 'guest view equals host at ply ' + guard); eq(v.game.list.length, st.game.list.length); eq(v.added, 1);
      eq(v.turn, H.turn(st)); eq(!!v.over, H.isOver(st)); last = v; checked++;
    }
    ok(H.isOver(st) || guard >= 260); const res = H.result(st); ok(res.r.length === 2 && (res.w === -1 ? same(res.r, [1, 1]) : res.r[res.w] === 1 && res.r[1 - res.w] === 2), JSON.stringify(res));
    if (H.isOver(st)) { const pd = json(H.pub(st)); ok(pd.rz.length > 0 && [-1, 0, 1].includes(pd.rw)); const fb = H.fallback(pd); eq(fb.w, res.w, 'the fallback of a finished game is its result'); }
    ok(last.clock.on === (seed % 2 === 0));
  }
  ok(checked > 200 && caps.cap > 20 && caps.chk > 3, 'steps ' + checked + ' ' + JSON.stringify(caps));
});
test('resign and draw offers: resign is allowed for either seat at any time; an offer is soft (no turn change); the other seat accepts or declines; offering twice or accepting nothing is refused; moving clears an offer', () => {
  let st = mk(); let r = H.apply(st, 1, O.simpleWire('rs')); ok(r && r.ev[0].t === 'rs'); ok(H.isOver(st)); eq(H.result(st).w, 0, 'black resigned: white won'); eq(json(H.pub(st)).rz, 'resign'); eq(H.apply(st, 0, O.toWire(12, 28, 0)), null, 'no moves after the end');
  st = mk(); H.apply(st, 0, O.toWire(12, 28, 0)); r = H.apply(st, 0, O.simpleWire('rs')); ok(r); eq(H.result(st).w, 1, 'white resigned out of turn');
  st = mk(); r = H.apply(st, 0, O.simpleWire('dr')); ok(r && r.soft === true); eq(H.pub(st).of, 1); eq(H.turn(st), 0, 'still white to move'); eq(H.apply(st, 0, O.simpleWire('dr')), null, 'offering again'); eq(H.apply(st, 0, O.simpleWire('da')), null, 'accepting your own offer');
  r = H.apply(st, 1, O.simpleWire('dn')); ok(r && r.soft); eq(H.pub(st).of, 0);
  H.apply(st, 1, O.simpleWire('dr')); eq(H.pub(st).of, 2); mv(st, 0, 'e2e4'); eq(H.pub(st).of, 0, 'a move clears the offer');
  H.apply(st, 1, O.simpleWire('dr')); r = H.apply(st, 0, O.simpleWire('da')); ok(r); ok(H.isOver(st)); eq(H.result(st).w, -1); eq(json(H.pub(st)).rz, 'agreed'); ok(same(H.result(st).r, [1, 1]));
  st = mk(); H.apply(st, 0, O.simpleWire('dr')); r = H.apply(st, 1, O.simpleWire('dr')); ok(r && H.isOver(st), 'offering a draw while one is pending accepts it');
  eq(H.apply(mk(), 0, O.simpleWire('da')), null); eq(H.apply(mk(), 0, O.simpleWire('dn')), null); eq(H.apply(mk(), 0, O.simpleWire('ta')), null);
});
test('takeback: asked by either seat, accepted by the other; takes the asker\'s last move back (1 ply if it was the last move, 2 if the opponent answered); not on an empty game; declining clears it', () => {
  let st = mk(); eq(H.apply(st, 0, O.simpleWire('tb')), null, 'nothing to take back'); mv(st, 0, 'e2e4');
  let r = H.apply(st, 0, O.simpleWire('tb')); eq(H.pub(st).of, 3); ok(r.soft); eq(H.apply(st, 1, O.simpleWire('tb')), null, 'only one offer at a time');
  r = H.apply(st, 1, O.simpleWire('ta')); ok(r && r.ev[0].t === 'tk' && r.ev[0].n === 1); eq(st.game.list.length, 0); eq(H.turn(st), 0); eq(H.pub(st).of, 0);
  mv(st, 0, 'e2e4'); mv(st, 1, 'e7e5'); H.apply(st, 0, O.simpleWire('tb')); r = H.apply(st, 1, O.simpleWire('ta')); eq(r.ev[0].n, 2); eq(st.game.list.length, 0); eq(H.turn(st), 0);
  mv(st, 0, 'd2d4'); mv(st, 1, 'd7d5'); H.apply(st, 1, O.simpleWire('tb')); eq(H.pub(st).of, 4); r = H.apply(st, 0, O.simpleWire('ta')); eq(r.ev[0].n, 1, 'black asks when it is white\'s turn: only black\'s move goes'); eq(st.game.sans.join(' '), 'd4'); eq(H.turn(st), 1);
  eq(H.apply(st, 1, O.simpleWire('tb')), null, 'black to move with a single white move on the board: two plies cannot be taken back'); H.apply(st, 0, O.simpleWire('tb')); eq(H.pub(st).of, 3); ok(H.apply(st, 1, O.simpleWire('dn'))); eq(H.pub(st).of, 0, 'declined');
  const g0 = mk(); eq(H.apply(g0, 1, O.simpleWire('tb')), null, 'black has no move to take back yet'); mv(g0, 0, 'a2a3'); eq(H.apply(g0, 0, O.simpleWire('tb')) !== null, true);
});
test('the clock: the host\'s time runs for the side to move; the increment is added; a flag claim from anyone is believed only when the host\'s clock says so; a move after time is up loses; out of time with no mating material is a draw', () => {
  T0 = 5000000; let st = mk({ tc: 1 }); const pd0 = H.pub(st); eq(pd0.tb, 180); eq(pd0.ti, 2); ok(same(pd0.ck, [1800, 1800]));
  T0 += 10000; mv(st, 0, 'e2e4'); T0 += 4000; let pd = H.pub(st); eq(pd.ck[0], 1800 - 100 + 20, '180 s - 10 s + 2 s = 1720 s: in tenths'.length ? Math.round((180 - 10 + 2) * 10) : 0); eq(pd.ck[1], Math.round((180 - 4) * 10), 'black has been thinking for 4 s');
  eq(H.apply(st, 0, O.simpleWire('fl')), null, 'a claim while the clock is fine'); eq(H.apply(st, 1, O.simpleWire('fl')), null);
  T0 += 200000; let r = H.apply(st, 0, O.simpleWire('fl')); ok(r && r.ev[0].t === 'fl' && r.ev[0].s === 1, 'black\'s time is up, claimed by white'); ok(H.isOver(st)); eq(H.result(st).w, 0); eq(H.pub(st).rz, 'time');
  T0 += 1000; st = mk({ tc: 1 }); T0 += 181000; const r2 = mv(st, 0, 'e2e4'); ok(r2 && r2.ev[0].t === 'fl' && r2.ev[0].s === 0, 'white moved after the time was up: white loses'); eq(st.game.list.length, 0, 'the move was not played'); eq(H.result(st).w, 1);
  st = mk({ tc: 2 }); st.game = new E.Game('4k3/8/8/8/8/8/8/R3K3 b - - 0 1'.replace('R3K3', '4K2N')); st.clock = new E.Clock(2, T0); st.clock.start(1, T0); T0 += 301000;
  const rr = H.apply(st, 0, O.simpleWire('fl')); ok(rr && H.isOver(st)); eq(H.result(st).w, -1, 'black ran out of time but white has only a knight: a draw'); eq(H.pub(st).rz, 'time');
  const nc = mk({ tc: 0 }); ok(same(H.pub(nc).ck, [0, 0])); eq(H.pub(nc).tb, 0); T0 += 1e7; eq(H.apply(nc, 0, O.simpleWire('fl')), null, 'no clock, no flag'); ok(mv(nc, 0, 'e2e4'));
  for (const tcId of [1, 2, 3, 4]) { const s = mk({ tc: tcId }); const pd1 = H.pub(s); ok(pd1.ck.every(x => x > 0 && x <= 1e6) && fitsRules({ pd: pd1 }).length === 0, 'preset ' + tcId + ' fits the rules'); }
});
test('CPU seats and the replacement of a seat that left: a CPU seat plays at its level; a human seat that has to be played for makes 2 moves and then resigns; a real move resets the count', () => {
  O.setCfg({ tc: 0 });
  const st = H.create({ g: 1, n: 2, seed: 1, cp: 1, humans: [0], first: 0 });
  const a = H.cpu(st, 0, 1); ok(actFits(a)); ok(H.apply(st, 0, a), 'move 1 for a seat that is away'); const b = H.cpu(st, 1, 1); ok(H.apply(st, 1, b), 'the CPU seat plays');
  ok(H.apply(st, 0, H.cpu(st, 0, 1)), 'move 2 for the absent human'); ok(H.apply(st, 1, H.cpu(st, 1, 1)));
  const c = H.cpu(st, 0, 1); eq(c.t, 'rs', 'the third time: resign'); ok(H.apply(st, 0, c)); ok(H.isOver(st)); eq(H.result(st).w, 1); eq(H.pub(st).rz, 'resign');
  const s2 = H.create({ g: 1, n: 2, seed: 1, cp: 2, humans: [0], first: 0 }); ok(H.apply(s2, 0, H.cpu(s2, 0, 2))); ok(H.apply(s2, 1, H.cpu(s2, 1, 2))); ok(H.apply(s2, 0, H.cpu(s2, 0, 2))); ok(H.apply(s2, 1, H.cpu(s2, 1, 2)));
  const hum = O.toWire(8, 16, 0); ok(H.apply(s2, 0, hum), 'the human comes back and moves'); ok(H.apply(s2, 1, H.cpu(s2, 1, 2))); ok(H.cpu(s2, 0, 2).t !== 'rs', 'the count started again');
  eq(H.auto(st, 0).t, 'rs', 'a turn that timed out (the per-move limit) is a resignation');
  const lv = O.CPU_LV; eq(lv[1], 3); eq(lv[2], 5); eq(lv[3], 6);
  const t0 = Date.now(); const s3 = H.create({ g: 1, n: 2, seed: 1, cp: 3, humans: [1], first: 0 }); H.cpu(s3, 0, 3); ok(Date.now() - t0 < 700, 'the strongest CPU seat moves within its budget');
});
test('save and load of the host state (a page reload): same game, clock, offers and away counters; the clock resumes', () => {
  T0 = 9000000; let st = mk({ tc: 3 }); T0 += 3000; mv(st, 0, 'e2e4'); T0 += 2000; mv(st, 1, 'e7e5'); H.apply(st, 0, O.simpleWire('dr')); st.away[1] = 1;
  const s = H.ser(st), back = H.de(s); eq(back.game.fen(), st.game.fen()); eq(back.offer, st.offer); eq(back.tc, st.tc); ok(same(back.away, st.away)); ok(same(back.humans, st.humans)); eq(back.clock.run, st.clock.run);
  ok(same(H.pub(back).m, H.pub(st).m)); ok(Math.abs(H.pub(back).ck[0] - H.pub(st).ck[0]) <= 1);
  ok(H.apply(back, 1, O.simpleWire('dn')), 'the restored state is playable'); eq(back.game.ucis.join(' '), 'e2e4 e7e5'); ok(typeof s === 'string' && s.length < 3000);
});
test('fallback (the host is gone): a finished game keeps its result; otherwise material decides (3 points or more), else a draw', () => {
  const fb = fen => { const g = new E.Game(fen); return H.fallback({ m: O.encMoves(g.list), rz: '', rw: -2 }); };
  eq(fb(E.START).w, -1); ok(same(fb(E.START).r, [1, 1]));
  const pdOf = (moves, extra) => Object.assign({ m: O.encMoves(moves.map(u => { const m = u; return m; })), mc: moves.length, rz: '', rw: -2 }, extra || {});
  const play = list => { const g = new E.Game(); for (const x of list) g.play(x); return g.list; };
  const mate = play(['f3', 'e5', 'g4', 'Qh4#']); const f1 = H.fallback(pdOf(mate)); eq(f1.w, 1, 'black mated white'); ok(same(f1.r, [2, 1]));
  const up = play(['e4', 'e5', 'Nf3', 'd6', 'Bc4', 'h6', 'Nxe5', 'dxe5', 'Qh5', 'g6', 'Qxe5+', 'Qe7', 'Qxh8']); const f2 = H.fallback(pdOf(up)); eq(f2.w, 0, 'white took a rook and more: ahead by 3+'); const down = play(['e4', 'e5', 'Qh5', 'Nc6', 'Qxe5+', 'Nxe5']); eq(H.fallback(pdOf(down)).w, 1, 'white lost a queen for a pawn');
  const small = play(['e4', 'e5', 'Nf3', 'Nc6', 'Nxe5', 'Nxe5']); eq(H.fallback(pdOf(small)).w, -1, 'a knight for a pawn is only 2 points: a draw');
  eq(H.fallback({ m: [], rz: 'resign', rw: 1 }).w, 1, 'a recorded resignation stands'); eq(H.fallback({ m: [], rz: 'agreed', rw: -1 }).w, -1); eq(H.fallback({}).w, -1); eq(H.fallback(undefined).w, -1);
});
test('view: builds the game, the last move, the turn, the result and the clock numbers from the database copy; follows takebacks and new games; works with arrays that came back as objects', () => {
  O.setCfg({ tc: 4 }); T0 = 7000000; const st = mk({ tc: 4 }); const ctx = O.newCtx();
  mv(st, 0, 'e2e4'); mv(st, 1, 'e7e5'); mv(st, 0, 'g1f3');
  let m = { gn: 1, v: 3, ph: 'play', me: 1, n: 2, tn: 1, pd: json(H.pub(st)), ev: [], fresh: true }; let v = O.view(m, ctx);
  eq(v.game.sans.join(' '), 'e4 e5 Nf3'); eq(E.uci(v.last.m), 'g1f3'); eq(v.last.from, E.parseSq('g1')); eq(v.last.to, E.parseSq('f3')); eq(v.color, 1); eq(v.turn, 1); eq(v.over, false); eq(v.res, null); eq(v.offer, 0);
  ok(v.clock.on && v.clock.base === 900 && v.clock.inc === 10 && v.clock.running === 1 && v.clock.left[0] >= 900000 && v.clock.left[0] <= 925000, JSON.stringify(v.clock));
  const asObj = json(H.pub(st)); asObj.m = Object.assign({}, asObj.m); asObj.ck = Object.assign({}, asObj.ck); v = O.view(Object.assign({}, m, { pd: asObj, fresh: false, v: 4 }), ctx); eq(v.game.sans.join(' '), 'e4 e5 Nf3'); eq(v.added, 0);
  mv(st, 1, 'b8c6'); v = O.view(Object.assign({}, m, { pd: json(H.pub(st)), v: 5, tn: 0, fresh: false }), ctx); eq(v.added, 1); eq(v.game.list.length, 4); eq(v.takeback, false);
  H.apply(st, 1, O.simpleWire('tb')); H.apply(st, 0, O.simpleWire('ta')); v = O.view(Object.assign({}, m, { pd: json(H.pub(st)), v: 6, tn: 1, fresh: false }), ctx); eq(v.takeback, true); eq(v.game.list.length, 3); eq(v.game.sans.join(' '), 'e4 e5 Nf3', 'black asked: only black\'s last move (Nc6) goes');
  v = O.view(Object.assign({}, m, { pd: json(H.pub(mk({ tc: 0 }))), v: 1, gn: 2, tn: 0, me: 0, fresh: true }), ctx); eq(v.game.list.length, 0); eq(v.color, 0); eq(v.clock.on, false);
  const fin = mk(); H.apply(fin, 1, O.simpleWire('rs')); v = O.view({ gn: 1, v: 9, ph: 'over', me: 0, n: 2, tn: -1, pd: json(H.pub(fin)), ev: [], fresh: true }, O.newCtx()); eq(v.over, true); eq(v.res.reason, 'resign'); eq(v.res.winner, 0);
  const mated = mk(); for (const u of ['f2f3', 'e7e5', 'g2g4', 'd8h4']) mv(mated, mated.game.pos.side, u); v = O.view({ gn: 1, v: 9, ph: 'over', me: 1, n: 2, tn: -1, pd: json(H.pub(mated)), ev: [], fresh: true }, O.newCtx()); eq(v.res.reason, 'mate'); eq(v.res.winner, 1);
  // a damaged pd (an illegal move in the middle) stops where it is, without throwing
  const bad = json(H.pub(st)); bad.m = ['AB-AB-']; v = O.view(Object.assign({}, m, { pd: bad, fresh: true }), O.newCtx()); ok(v.game.list.length <= 1);
});
test('the adapter shape is what common/turnroom.js expects (create / turn / isOver / apply / cpu / auto / pub / priv / result / fallback / ser / de) and the private part is empty', () => {
  for (const k of ['create', 'turn', 'isOver', 'apply', 'cpu', 'auto', 'pub', 'priv', 'result', 'fallback', 'ser', 'de']) eq(typeof H[k], 'function', k);
  const st = mk(); eq(Object.keys(H.priv(st, 0)).length, 0); eq(Object.keys(H.priv(st, 1)).length, 0); eq(H.turn(st), 0);
  for (const k of ['host', 'view', 'newCtx', 'toWire', 'fromWire']) ok(O[k], k);
  const pd = H.pub(st); eq(fitsRules({ pd }).length, 0); ok(Object.keys(pd).every(k => /^[a-z]{1,4}$/.test(k)), Object.keys(pd).join());
  ok(RULES.pub && RULES.act, 'the rules file has the room structure');
});

run();
