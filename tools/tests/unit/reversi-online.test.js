// reversi/online.js（オンライン対戦のアダプター）の単体テスト：形のおかしい手を断る・ほかの席の番では打てない・公開する状態が
// データベースのルール（database.rules.json の pub）の形に収まる・パスと終わりの出来事・画面側の view が盤の差から
// 「置かれた石・ひっくり返った石」を正しく作る・結果と、ホストがいなくなったときの順位。
// 実行：node tools/tests/unit/reversi-online.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'reversi/engine.js'));
global.ReversiEngine = E;
const O = require(path.join(ROOT, 'reversi/online.js'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const deq = (a, b, m) => ok(same(a, b), (m || 'deep equal') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
const H = O.host;

// database.rules.json の tr/$game/rooms/$room/pub の形（値の範囲・キーの名前）で確かめる
const RULES = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules.tr.$game.rooms.$room.pub;
function fitsRules(pub) {
  const bad = [];
  if (!(pub.v >= 1 && pub.v <= 1e7)) bad.push('v');
  if (!/^(play|over)$/.test(pub.ph)) bad.push('ph');
  if (!(pub.tn >= -1 && pub.tn <= 3)) bad.push('tn');
  if (!/^[pdaxc]{2,4}$/.test(pub.sl)) bad.push('sl');
  for (const [k, val] of Object.entries(pub.pd)) {
    if (!/^[a-z]{1,4}$/.test(k)) bad.push('pd key ' + k);
    const scalar = x => typeof x === 'boolean' || (typeof x === 'number' && x >= -1e6 && x <= 1e6) || (typeof x === 'string' && x.length <= 24);
    if (Array.isArray(val)) { val.forEach((x, i) => { if (!/^[0-9]{1,2}$/.test(String(i)) || !scalar(x)) bad.push('pd.' + k + '.' + i); }); }
    else if (!scalar(val)) bad.push('pd value ' + k);
  }
  (pub.ev || []).forEach(e => {
    if (!/^[a-z]{2}$/.test(e.t)) bad.push('ev t');
    for (const [k, val] of Object.entries(e)) {
      if (!['i', 't', 's', 'w', 'x', 'k', 'c', 'n', 'd'].includes(k)) bad.push('ev field ' + k);
      if (k === 's' && !(val >= -1 && val <= 3)) bad.push('ev s'); if (k === 'c' && !(val >= -1 && val <= 255)) bad.push('ev c'); if (k === 'n' && !(val >= 0 && val <= 100000)) bad.push('ev n');
    }
  });
  if ((pub.ev || []).length > 8) bad.push('ev count');
  if (pub.rs) { if (!pub.rs.r.every(x => x >= 1 && x <= 4) || !(pub.rs.w >= -1 && pub.rs.w <= 3) || !/^(w|hl|hg)$/.test(pub.rs.y)) bad.push('rs'); }
  return bad;
}

test('wire format: only whole squares 0..63 of a move are accepted', () => {
  eq(O.fromWire(O.toWire(19)), 19); eq(O.fromWire({ t: 'mv', c: 0 }), 0); eq(O.fromWire({ t: 'mv', c: 63 }), 63);
  for (const a of [null, undefined, {}, { t: 'mv' }, { t: 'mv', c: -1 }, { t: 'mv', c: 64 }, { t: 'mv', c: 1.5 }, { t: 'mv', c: '3' }, { t: 'draw' }, { t: 'pass', c: 3 }, 'mv', 7]) eq(O.fromWire(a), null, 'refused ' + JSON.stringify(a));
});

test('host.apply: the right seat, a legal move, nothing after the end; events are public and small', () => {
  const st = H.create({ seed: 5 });
  eq(H.turn(st), 0, 'black = seat 0 starts'); eq(H.isOver(st), false);
  eq(H.apply(st, 1, O.toWire(19)), null, 'the white seat cannot move on black\'s turn');
  eq(H.apply(st, 0, O.toWire(0)), null, 'an illegal square'); eq(H.apply(st, 0, { t: 'mv', c: 99 }), null); eq(H.apply(st, 0, { t: 'draw' }), null);
  const r = H.apply(st, 0, O.toWire(19));
  deq(r.ev, [{ t: 'mv', s: 0, c: 19, n: 1 }], 'event'); eq(H.turn(st), 1, 'white now');
  ok(!r.soft && !r.pv, 'a move ends the turn');
  eq(H.apply(st, 0, O.toWire(18)), null, 'black cannot move twice');
});

test('a pass keeps the turn with the same seat and is announced; the end is reported; nothing more can be played', () => {
  let sawPass = 0, sawEnd = 0;
  for (let seed = 1; seed <= 80 && !(sawPass >= 3 && sawEnd >= 3); seed++) {
    const st = H.create({ seed }), rnd = E.rng(seed * 7);
    while (!H.isOver(st)) {
      const seat = H.turn(st), mv = E.legal(st), c = mv[Math.floor(rnd() * mv.length)];
      const r = H.apply(st, seat, O.toWire(c));
      ok(r && r.ev.length >= 1, 'legal moves apply');
      const pa = r.ev.find(e => e.t === 'pa');
      if (pa) { sawPass++; eq(pa.s, 1 - seat, 'the passing seat'); eq(H.turn(st), seat, 'the mover plays again'); }
      if (H.isOver(st)) sawEnd++;
    }
    eq(H.turn(st), -1); eq(H.apply(st, 0, O.toWire(0)), null); eq(H.apply(st, 1, O.toWire(0)), null);
  }
  ok(sawPass >= 3 && sawEnd >= 3, 'passes ' + sawPass + ', ends ' + sawEnd);
});

test('the public state fits the database rules at every step of a CPU game, and holds nothing secret (only the board)', () => {
  const st = H.create({ seed: 11 });
  let ei = 0, evq = [], v = 0, n = 0;
  while (!H.isOver(st)) {
    const seat = H.turn(st), w = H.cpu(st, seat, 1 + (n % 3)), r = H.apply(st, seat, w);
    ok(r, 'the cpu move is accepted');
    for (const e of r.ev) { evq.push(Object.assign({ i: ++ei }, e)); } evq = evq.slice(-8);
    const over = H.isOver(st), rs = over ? H.result(st) : null;
    const pub = { v: ++v, g: 1, ph: over ? 'over' : 'play', tn: over ? -1 : H.turn(st), dl: 0, sl: 'pp', pu: [0, 1], pd: H.pub(st), ev: evq };
    if (rs) pub.rs = { r: rs.r, w: rs.w, y: 'w' };
    const bad = fitsRules(JSON.parse(JSON.stringify(pub)));
    deq(bad, [], 'fits the rules at move ' + n);
    deq(Object.keys(pub.pd).sort(), ['b', 'bk', 'lm', 'mc', 'wh'], 'only the public fields');
    eq(pub.pd.b.length, 64); eq(pub.pd.bk + pub.pd.wh, 4 + pub.pd.mc);
    deq(H.priv(st, 0), {}, 'nothing private');
    n++;
  }
  ok(n > 20);
  const c = E.counts(st); eq(H.pub(st).bk, c.b);
});

test('result and fallback: the larger side wins, a tie is shared, and the fallback (from the public counts only) agrees', () => {
  for (let seed = 1; seed <= 25; seed++) {
    const st = H.create({ seed }), rnd = E.rng(seed);
    while (!H.isOver(st)) { const mv = E.legal(st); H.apply(st, H.turn(st), O.toWire(mv[Math.floor(rnd() * mv.length)])); }
    const r = H.result(st), f = H.fallback(H.pub(st)), c = E.counts(st);
    deq(f, r, 'fallback = result at the end of game ' + seed);
    if (c.b === c.w) deq(r, { r: [1, 1], w: -1 }); else eq(r.w, c.b > c.w ? 0 : 1);
    ok(r.r.every(x => x === 1 || x === 2));
  }
  deq(H.fallback({ bk: 20, wh: 30 }), { r: [2, 1], w: 1 }); deq(H.fallback({ bk: 30, wh: 20 }), { r: [1, 2], w: 0 }); deq(H.fallback({ bk: 3, wh: 3 }), { r: [1, 1], w: -1 });
  deq(H.fallback({}), { r: [1, 1], w: -1 }, 'no information: a tie');
});

test('serialisation for the host\'s reload copy: the state survives JSON and goes on with the same moves', () => {
  const st = H.create({ seed: 3 });
  for (let i = 0; i < 12; i++) H.apply(st, H.turn(st), H.cpu(st, H.turn(st), 2));
  const copy = H.de(H.ser(st));
  deq(copy, st);
  eq(H.cpu(copy, H.turn(copy), 3).c, H.cpu(st, H.turn(st), 3).c, 'the same next move');
});

test('view: the board, whose turn, the new and flipped stones from the difference, a growing move list, and a fresh game resets', () => {
  const st = H.create({ seed: 2 }), ctx = O.newCtx();
  let ei = 0, v = 0, evq = [];
  const model = (r, over, fresh, gn) => {
    for (const e of r ? r.ev : []) evq.push(Object.assign({ i: ++ei }, e)); evq = evq.slice(-8);
    const newEv = r ? r.ev.map((e, k) => Object.assign({ i: ei - r.ev.length + k + 1 }, e)) : [];
    return { gn: gn || 1, v: ++v, ph: over ? 'over' : 'play', me: 1, n: 2, tn: over ? -1 : H.turn(st), pd: H.pub(st), ev: fresh ? [] : newEv, fresh: !!fresh, names: ['a', 'b'] };
  };
  let m = model(null, false, true), vw = O.view(m, ctx);
  eq(vw.me, 1); eq(vw.color, 2, 'seat 1 is white'); eq(vw.st.turn, 1); eq(vw.placed.length, 0); deq(vw.st.b, st.b);
  let moves = 0;
  while (!H.isOver(st) && moves < 60) {
    const before = st.b.slice(), seat = H.turn(st), w = H.cpu(st, seat, 2), r = H.apply(st, seat, w);
    moves++;
    vw = O.view(model(r, H.isOver(st), false), ctx);
    deq(vw.st.b, st.b, 'the view shows the host board');
    const placed = [], flipped = [];
    st.b.forEach((x, i) => { if (!before[i] && x) placed.push(i); else if (before[i] && before[i] !== x) flipped.push(i); });
    deq(vw.placed, placed, 'placed'); deq(vw.flipped, flipped, 'flipped');
    eq(vw.last, w.c, 'last move'); eq(vw.st.turn, H.isOver(st) ? 1 : H.turn(st) + 1);
    eq(vw.st.moves.filter(x => x[0] >= 0).length, moves, 'move list grows by one');
  }
  ok(moves > 20);
  vw = O.view(model(null, false, true, 2), ctx);
  eq(vw.st.moves.length, 0, 'a new game resets the list'); eq(vw.placed.length, 0);
  // a page that missed some updates still gets every changed stone from the difference
  const a = H.create({ seed: 8 }), c2 = O.newCtx();
  O.view({ gn: 1, v: 1, ph: 'play', me: 0, n: 2, tn: 0, pd: H.pub(a), ev: [], fresh: true }, c2);
  for (let i = 0; i < 3; i++) H.apply(a, H.turn(a), H.cpu(a, H.turn(a), 1));
  const lag = O.view({ gn: 1, v: 9, ph: 'play', me: 0, n: 2, tn: H.turn(a), pd: H.pub(a), ev: [], fresh: false }, c2);
  eq(lag.placed.length, 3, 'three new stones after missing three moves');
});

run();
