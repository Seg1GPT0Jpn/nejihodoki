// gomoku/online.js（オンライン対戦のアダプター）の単体テスト：形のおかしい手を断る・ほかの席の番では打てない・公開する状態が
// データベースのルール（database.rules.json の pub。配列の添字は99まで・文字列は24文字まで）の形に収まる・盤と手の文字列の往復・
// 終わりの出来事・画面側の view が盤の差から「置かれた石」を作る・結果と、ホストがいなくなったときの順位。
// 実行：node tools/tests/unit/gomoku-online.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'gomoku/engine.js'));
global.GomokuEngine = E;
const O = require(path.join(ROOT, 'gomoku/online.js'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const deq = (a, b, m) => ok(same(a, b), (m || 'deep equal') + ': ' + JSON.stringify(a).slice(0, 200) + ' vs ' + JSON.stringify(b).slice(0, 200));
const H = O.host;
const DB = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8')).rules.tr.$game;
const RULES = DB.rooms.$room.pub;

function fitsRules(pub) {
  const bad = [];
  if (!(pub.v >= 1 && pub.v <= 1e7)) bad.push('v');
  if (!/^(play|over)$/.test(pub.ph)) bad.push('ph');
  if (!/^[pdaxc]{2,4}$/.test(pub.sl)) bad.push('sl');
  const scalar = x => typeof x === 'boolean' || (typeof x === 'number' && x >= -1e6 && x <= 1e6) || (typeof x === 'string' && x.length <= 24);
  for (const [k, val] of Object.entries(pub.pd)) {
    if (!/^[a-z]{1,4}$/.test(k)) bad.push('pd key ' + k);
    if (Array.isArray(val)) val.forEach((x, i) => { if (!/^[0-9]{1,2}$/.test(String(i)) || !scalar(x)) bad.push('pd.' + k + '.' + i); });
    else if (!scalar(val)) bad.push('pd value ' + k);
  }
  (pub.ev || []).forEach(e => {
    if (!/^[a-z]{2}$/.test(e.t)) bad.push('ev t');
    for (const [k, val] of Object.entries(e)) {
      if (!['i', 't', 's', 'w', 'x', 'k', 'c', 'n', 'd'].includes(k)) bad.push('ev field ' + k);
      if (k === 'c' && !(val >= -1 && val <= 255)) bad.push('ev c'); if (k === 'n' && !(val >= 0 && val <= 100000)) bad.push('ev n');
    }
  });
  return bad;
}

test('the database rules allow gomoku in every place colorcards and reversi are allowed', () => {
  const txt = fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8');
  ok(!/\(colorcards\|reversi\)/.test(txt), 'no list that stops at reversi');
  eq((txt.match(/colorcards\|reversi\|gomoku/g) || []).length, 19);
  ok(DB.queue['.read'].includes('gomoku'));
});

test('wire format: only whole crossings 0..224 of a move are accepted; a crossing outside a smaller board is refused by apply', () => {
  eq(O.fromWire(O.toWire(112)), 112); eq(O.fromWire({ t: 'mv', c: 0 }), 0); eq(O.fromWire({ t: 'mv', c: 224 }), 224);
  for (const a of [null, undefined, {}, { t: 'mv' }, { t: 'mv', c: -1 }, { t: 'mv', c: 225 }, { t: 'mv', c: 1.5 }, { t: 'mv', c: '3' }, { t: 'draw' }, 'mv', 7]) eq(O.fromWire(a), null, 'refused ' + JSON.stringify(a));
  O.setCfg({ n: 9, rule: 'free' }); const st = H.create({ seed: 1 }); eq(st.n, 9); eq(H.apply(st, 0, O.toWire(100)), null, 'outside a 9x9 board'); ok(H.apply(st, 0, O.toWire(40))); O.setCfg({ n: 15, rule: 'free' });
  eq(O.setCfg({ n: 7, rule: 'zzz' }).n, 15, 'a size that does not exist is ignored');
});

test('host.apply: the right seat, a legal crossing (renju: not forbidden), nothing after the end; events are public and small', () => {
  const st = H.create({ seed: 5 });
  eq(H.turn(st), 0); eq(H.isOver(st), false);
  eq(H.apply(st, 1, O.toWire(112)), null, 'the white seat cannot move on black\'s turn');
  const r = H.apply(st, 0, O.toWire(112)); deq(r.ev, [{ t: 'mv', s: 0, c: 112, n: 1 }]); eq(H.turn(st), 1);
  eq(H.apply(st, 1, O.toWire(112)), null, 'a crossing that has a stone'); eq(H.apply(st, 0, O.toWire(113)), null, 'black cannot move twice');
  O.setCfg({ n: 15, rule: 'renju' });
  const rj = H.create({ seed: 1 }); rj.b = E.fromRows([ '.'.repeat(15), '.'.repeat(15) ].concat([]).length ? Array.from({ length: 15 }, (x, r) => r === 7 ? '.....xx........' : r === 5 || r === 6 ? '.......x.......' : '.'.repeat(15)) : [], 1).b;
  eq(H.apply(rj, 0, O.toWire(7 * 15 + 7)), null, 'a forbidden double three is refused online too');
  O.setCfg({ n: 15, rule: 'free' });
});

test('a whole CPU game: the public state fits the database rules at every step (225-crossing board as 15 row strings), holds nothing secret, and ends with a result', () => {
  for (const [n, rule] of [[15, 'free'], [13, 'std'], [9, 'renju']]) {
    O.setCfg({ n, rule });
    const st = H.create({ seed: 11 });
    let ei = 0, evq = [], v = 0, k = 0;
    while (!H.isOver(st)) {
      const seat = H.turn(st), w = H.cpu(st, seat, 1 + (k % 3)), r = H.apply(st, seat, w);
      ok(r, 'the cpu move is accepted');
      for (const e of r.ev) evq.push(Object.assign({ i: ++ei }, e)); evq = evq.slice(-8);
      const over = H.isOver(st), rs = over ? H.result(st) : null;
      const pub = { v: ++v, g: 1, ph: over ? 'over' : 'play', tn: over ? -1 : H.turn(st), dl: 0, sl: 'pp', pu: [0, 1], pd: H.pub(st), ev: evq };
      if (rs) pub.rs = { r: rs.r, w: rs.w, y: 'w' };
      deq(fitsRules(JSON.parse(JSON.stringify(pub))), [], `fits the rules at move ${k} (${n} ${rule})`);
      deq(Object.keys(pub.pd).sort(), ['b', 'lm', 'mc', 'n', 'o', 'ru'], 'only the public fields');
      eq(pub.pd.b.length, n); ok(pub.pd.b.every(s => s.length === n)); ok(pub.pd.o.length <= 19);
      deq(H.priv(st, 0), {}, 'nothing private');
      k++;
    }
    ok(k >= 9); const rs = H.result(st); ok(rs.r.every(x => x === 1 || x === 2)); if (st.winner) eq(rs.w, st.winner - 1);
  }
  O.setCfg({ n: 15, rule: 'free' });
});

test('board and move strings: round trip for every size; moves keep their order and colours', () => {
  for (const n of [9, 13, 15]) {
    const st = E.create({ n, seed: 2 }); for (let i = 0; i < 40 && !st.over; i++) E.play(st, E.cpu(st, 1));
    deq(O.decRows(O.encRows(st.b, n), n), st.b); deq(O.decMoves(O.encMoves(st.moves, n), n), st.moves);
    ok(O.encMoves(st.moves, n).every(s => s.length <= 24));
  }
  const long = []; for (let i = 0; i < 225; i++) long.push([i, i % 2 ? 2 : 1]); ok(O.encMoves(long, 15).length <= 19, 'a full 15x15 game fits 19 strings');
  deq(O.decRows({ 0: '120', 1: '000' }, 3).length, 9, 'objects as RTDB returns them');
});

test('result and fallback: the winner wins, a full board is shared, and the fallback (from the public state only) agrees at the end', () => {
  for (let seed = 1; seed <= 8; seed++) {
    O.setCfg({ n: 9, rule: 'free' });
    const st = H.create({ seed }), rnd = E.rng(seed);
    while (!H.isOver(st)) { const lg = E.legal(st); H.apply(st, H.turn(st), O.toWire(lg[Math.floor(rnd() * lg.length)])); }
    const r = H.result(st), f = H.fallback(H.pub(st));
    deq(f, r, 'fallback = result at the end of game ' + seed);
  }
  O.setCfg({ n: 15, rule: 'free' });
  deq(H.fallback({}), { r: [1, 1], w: -1 }, 'no information: a tie');
  const mid = H.create({ seed: 1 }); H.apply(mid, 0, O.toWire(112)); deq(H.fallback(H.pub(mid)), { r: [1, 1], w: -1 }, 'no five yet: a tie');
});

test('serialisation for the host\'s reload copy: the state survives JSON and goes on with the same moves', () => {
  const st = H.create({ seed: 3 });
  for (let i = 0; i < 12; i++) H.apply(st, H.turn(st), H.cpu(st, H.turn(st), 2));
  const copy = H.de(H.ser(st)); deq(copy, st);
  eq(E.cpu(copy, 2), E.cpu(st, 2), 'the same next move');
});

test('view: the board, whose turn, the new stones from the difference, a growing move list, the winning line, and a fresh game resets', () => {
  const st = H.create({ seed: 2 }), ctx = O.newCtx();
  let ei = 0, v = 0, evq = [];
  const model = (r, over, fresh, gn) => {
    for (const e of r ? r.ev : []) evq.push(Object.assign({ i: ++ei }, e)); evq = evq.slice(-8);
    return { gn: gn || 1, v: ++v, ph: over ? 'over' : 'play', me: 1, n: 2, tn: over ? -1 : H.turn(st), pd: H.pub(st), ev: fresh ? [] : evq.slice(-1), fresh: !!fresh, names: ['a', 'b'] };
  };
  let vw = O.view(model(null, false, true), ctx);
  eq(vw.me, 1); eq(vw.color, 2); eq(vw.st.turn, 1); eq(vw.placed.length, 0); eq(vw.st.n, 15);
  let moves = 0, last;
  while (!H.isOver(st) && moves < 80) {
    const before = st.b.slice(), seat = H.turn(st), w = H.cpu(st, seat, 2), r = H.apply(st, seat, w);
    moves++;
    vw = O.view(model(r, H.isOver(st), false), ctx); last = vw;
    deq(vw.st.b, st.b, 'the view shows the host board');
    deq(vw.placed, st.b.map((x, i) => (!before[i] && x ? i : -1)).filter(i => i >= 0), 'placed');
    eq(vw.last, w.c); eq(vw.st.moves.length, moves);
  }
  ok(moves > 8);
  if (st.winner) { ok(last.st.over); eq(last.st.winner, st.winner); deq(last.st.line, st.line, 'the winning line is rebuilt from the board'); }
  vw = O.view(model(null, false, true, 2), ctx); eq(vw.placed.length, 0);
  const a = H.create({ seed: 8 }), c2 = O.newCtx();
  O.view({ gn: 1, v: 1, ph: 'play', me: 0, n: 2, tn: 0, pd: H.pub(a), ev: [], fresh: true }, c2);
  for (let i = 0; i < 3; i++) H.apply(a, H.turn(a), H.cpu(a, H.turn(a), 1));
  eq(O.view({ gn: 1, v: 9, ph: 'play', me: 0, n: 2, tn: H.turn(a), pd: H.pub(a), ev: [], fresh: false }, c2).placed.length, 3, 'three new stones after missing three moves');
});

run();
