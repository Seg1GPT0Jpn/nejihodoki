// colorcards/engine.js の単体テスト：デッキ・決まった結果（同じ seed → 同じ展開）・特別札の効き方・ラスト！とつかまえた！・
// CPU 同士のたくさんの対局（行き詰まらない・反則の手を出さない）・10ラウンドマッチ・強さの順（つよい ＞ ふつう ＞ よわい）。
// 実行：node tools/tests/unit/colorcards-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'colorcards/engine.js'));
const same = E.sameJSON;
const deq = (a, b, m) => ok(same(a, b), (m || 'deep equal') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));

function playOut(o, hook) {
  const st = E.create(Object.assign({ humans: [] }, o));
  let k = 0;
  while (!st.over) {
    if (++k > 20000) throw new Error('stuck: ' + JSON.stringify(o));
    const mv = E.cpu(st);
    if (!E.legal(st).some(m => same(m, mv))) throw new Error('illegal move: ' + JSON.stringify(o) + ' ' + JSON.stringify(mv));
    E.apply(st, mv);
    if (hook) hook(st);
  }
  return st;
}
const all = st => [].concat(st.draw, st.disc, ...st.hands);

test('the deck: 104 cards, 80 numbers (0-9 twice per colour), 20 coloured specials, 4 re-dyes', () => {
  eq(E.NCARDS, 104);
  const kinds = {}; E.INFO.forEach(i => { kinds[i.kind] = (kinds[i.kind] || 0) + 1; });
  deq(kinds, { n: 80, swap: 4, peek: 4, tangle: 4, double: 4, shield: 4, dye: 4 });
  for (let col = 0; col < 4; col++) for (let num = 0; num <= 9; num++) eq(E.INFO.filter(i => i.kind === 'n' && i.color === col && i.num === num).length, 2, 'copies');
  for (const n of [2, 3, 4]) for (let seed = 1; seed <= 20; seed++) {
    const st = E.create({ seed, n, humans: [] });
    deq(all(st).slice().sort((a, b) => a - b), Array.from({ length: 104 }, (_, i) => i), 'every card exactly once');
    st.hands.forEach(h => eq(h.length, 7)); eq(E.topInfo(st).kind, 'n', 'first card is a number');
  }
});

test('deterministic and JSON-safe', () => {
  const a = playOut({ seed: 4242, n: 3, level: 2 }), b = playOut({ seed: 4242, n: 3, level: 2 }), c = playOut({ seed: 4243, n: 3, level: 2 });
  ok(same(a, b), 'same seed'); ok(!same(a, c), 'different seed');
  const st = E.create({ seed: 77, n: 4, level: 3, humans: [] });
  for (let i = 0; i < 30 && !st.over; i++) E.apply(st, E.cpu(st));
  const copy = JSON.parse(JSON.stringify(st));
  const fin = s => { let k = 0; while (!s.over && k++ < 20000) E.apply(s, E.cpu(s)); return s; };
  ok(same(fin(st), fin(copy)), 'resume from JSON');
});

function setup(o, f) { const st = E.create(Object.assign({ seed: 5, n: 3, humans: [], first: 0 }, o)); f(st); return st; }
// a number card of a colour
const num = (col, n) => col * 20 + n * 2, spec = (kind, col) => 80 + ['swap', 'peek', 'tangle', 'double', 'shield'].indexOf(kind) * 4 + col;
function put(st, seat, cards, top, color) {
  const rest = all(st).filter(c => cards.indexOf(c) < 0 && c !== top);
  st.hands.forEach(h => { h.length = 0; });
  st.hands[seat] = cards.slice(); st.disc = [top]; st.color = color === undefined ? E.INFO[top].color : color;
  st.draw = rest;
  let k = 0; for (let s = 0; s < st.n; s++) if (s !== seat) while (st.hands[s].length < 5) st.hands[s].push(st.draw.pop() + 0 * k++);
  st.turn = seat; st.phase = 'play'; st.dir = 1; st.called = st.called.map(() => false); st.uncalled = -1;
}

test('matching: colour, number, same kind; re-dye always; no draw while a play exists', () => {
  const st = setup({}, s => put(s, 0, [num(1, 4), num(2, 7), spec('swap', 3), 100], num(0, 4)));
  const plays = E.legal(st).filter(m => m.t === 'play').map(m => m.c);
  ok(plays.indexOf(num(1, 4)) >= 0, 'same number, other colour'); ok(plays.indexOf(num(2, 7)) < 0, 'different colour and number'); ok(plays.indexOf(100) >= 0, 're-dye');
  ok(plays.indexOf(spec('swap', 3)) < 0, 'special of another colour and kind');
  ok(!E.legal(st).some(m => m.t === 'draw'), 'cannot draw with a playable card');
  const s2 = setup({}, s => put(s, 0, [num(1, 5), num(2, 7)], num(0, 4)));
  ok(E.legal(s2).some(m => m.t === 'draw'), 'draw when nothing plays');
  const s3 = setup({}, s => put(s, 0, [spec('peek', 1), num(0, 2)], spec('peek', 2), 2));
  ok(E.legal(s3).some(m => m.t === 'play' && m.c === spec('peek', 1)), 'same kind of special matches');
});

test('0 reverses the direction; tangle gives 2; double plays again; shield blocks once; re-dye picks the colour', () => {
  let st = setup({}, s => put(s, 0, [num(0, 0), num(0, 1), num(0, 2)], num(0, 5)));
  E.apply(st, { t: 'play', c: num(0, 0) }); eq(st.dir, -1); eq(st.turn, 2, 'turn goes the other way');
  st = setup({}, s => put(s, 0, [spec('tangle', 0), num(0, 1), num(0, 2)], num(0, 5)));
  const n1 = st.hands[1].length; E.apply(st, { t: 'play', c: spec('tangle', 0) }); eq(st.hands[1].length, n1 + 2); eq(st.turn, 1);
  st = setup({}, s => put(s, 0, [spec('double', 0), num(0, 1), num(0, 2)], num(0, 5)));
  E.apply(st, { t: 'play', c: spec('double', 0) }); eq(st.turn, 0, 'the same player again');
  st = setup({}, s => { put(s, 0, [spec('tangle', 0), num(0, 1), num(0, 2)], num(0, 5)); s.ward[1] = true; });
  const n2 = st.hands[1].length; const ev = E.apply(st, { t: 'play', c: spec('tangle', 0) });
  eq(st.hands[1].length, n2); eq(st.ward[1], false, 'ward used up'); ok(ev.some(e => e.t === 'block'), 'block event'); eq(st.stat.block[1], 1);
  st = setup({}, s => put(s, 0, [100, num(3, 1), num(3, 2)], num(0, 5)));
  E.apply(st, { t: 'play', c: 100, color: 3 }); eq(st.color, 3);
  st = setup({}, s => put(s, 0, [spec('shield', 0), num(0, 1), num(0, 2)], num(0, 5)));
  E.apply(st, { t: 'play', c: spec('shield', 0) }); eq(st.ward[0], true);
});

test('swap and peek (and being shielded)', () => {
  let st = setup({}, s => put(s, 0, [spec('swap', 0), num(0, 1)], num(0, 5)));
  st.hands[1] = [num(1, 1)]; const mine = st.hands[0].filter(c => c !== spec('swap', 0));
  E.apply(st, { t: 'play', c: spec('swap', 0), with: 1 });
  deq(st.hands[0], [num(1, 1)]); deq(st.hands[1].slice().sort(), mine.slice().sort());
  st = setup({}, s => { put(s, 0, [spec('swap', 0), num(0, 1)], num(0, 5)); s.ward[1] = true; });
  const h1 = st.hands[1].slice(); E.apply(st, { t: 'play', c: spec('swap', 0), with: 1 }); deq(st.hands[1], h1, 'shield stopped the swap');
  st = setup({}, s => put(s, 0, [spec('peek', 0), num(0, 1)], num(0, 5)));
  const ev = E.apply(st, { t: 'play', c: spec('peek', 0), target: 2 });
  deq(ev.find(e => e.t === 'peek').cards, st.hands[2]); deq(st.seen[0][2], st.hands[2]);
});

test('Last! and Caught!: forgetting to call at one card lets the next player make you draw 2', () => {
  let st = setup({}, s => put(s, 0, [num(0, 1), num(0, 2)], num(0, 5)));
  ok(E.legal(st).some(m => m.t === 'call'), 'can call with 2 cards');
  E.apply(st, { t: 'play', c: num(0, 1) }); eq(st.uncalled, 0); ok(E.legal(st).some(m => m.t === 'catch'), 'next player may catch');
  E.apply(st, { t: 'catch' }); eq(st.hands[0].length, 3); eq(st.stat.catches[1], 1); eq(st.uncalled, -1);
  st = setup({}, s => put(s, 0, [num(0, 1), num(0, 2)], num(0, 5)));
  E.apply(st, { t: 'call' }); E.apply(st, { t: 'play', c: num(0, 1) }); eq(st.uncalled, -1, 'called in time');
  ok(!E.legal(st).some(m => m.t === 'catch'), 'nothing to catch');
  st = setup({}, s => put(s, 0, [num(0, 1), num(0, 2)], num(0, 5)));
  E.apply(st, { t: 'play', c: num(0, 1) }); E.apply(st, { t: 'draw' }); eq(st.uncalled, -1, 'the chance passes with the next move');
});

test('winning: emptying the hand ends the round and scores the others\' cards', () => {
  const st = setup({}, s => put(s, 0, [num(0, 1)], num(0, 5)));
  E.apply(st, { t: 'play', c: num(0, 1) }); ok(st.over); eq(st.winner, 0);
  eq(st.roundGain, E.handPoints(st.hands[1]) + E.handPoints(st.hands[2]));
  eq(E.result(st).rank[0], 1);
});

test('10-round match: rounds follow each other, scores add up, a winner is decided', () => {
  const st = E.create({ seed: 9, n: 3, level: 2, humans: [], match: 10 });
  let k = 0, rounds = 0;
  while (!st.over) { if (++k > 40000) throw new Error('stuck'); const mv = E.cpu(st); if (mv.t === 'next') rounds++; E.apply(st, mv); }
  eq(st.round, 10); eq(rounds, 9); eq(st.gains.length, 10);
  eq(st.scores.reduce((a, b) => a + b, 0), st.gains.reduce((a, g) => a + g.g, 0));
  const r = E.result(st); eq(r.order.length, 3); eq(new Set(r.rank).size, 3, 'unique ranks');
  ok(r.scores[r.order[0]] >= r.scores[r.order[2]]);
});

test('simulated games: 2-4 players × 3 strengths × many seeds never stall, never an illegal move, never hit the safety valve', () => {
  let n = 0, turns = 0, tmo = 0, rev = 0, swaps = 0, tangles = 0, catches = 0;
  for (let seed = 1; seed <= 120; seed++) for (const p of [2, 3, 4]) for (const level of [1, 2, 3]) {
    const st = playOut({ seed, n: p, level }); ok(st.over && st.winner >= 0, 'finished'); n++; turns += st.step; if (st.timeout) tmo++;
    rev += st.stat.zero.reduce((a, b) => a + b, 0); swaps += st.stat.swap.reduce((a, b) => a + b, 0); tangles += st.stat.tangle.reduce((a, b) => a + b, 0); catches += st.stat.catches.reduce((a, b) => a + b, 0);
    eq(all(st).length, 104, 'no card lost');
  }
  eq(tmo, 0, 'no game needed the safety valve'); ok(n === 1080); ok(turns / n < 120, 'games are short: ' + turns / n);
  ok(rev > 100 && swaps > 50 && tangles > 100 && catches > 5, `all mechanics happen (${rev} reverses, ${swaps} swaps, ${tangles} tangles, ${catches} catches)`);
});

test('strength order: Hard beats Easy, Normal beats Easy, Hard is at least as good as Normal', () => {
  function rate(a, b, n, N) { let w = 0; for (let s = 1; s <= N; s++) { const levels = new Array(n).fill(b); const seat = s % n; levels[seat] = a; if (playOut({ seed: s, n, level: 2, levels }).winner === seat) w++; } return w / N; }
  const he = rate(3, 1, 2, 900), ne = rate(2, 1, 2, 900), hn = rate(3, 2, 2, 900);
  ok(he > 0.6, 'hard vs easy ' + he); ok(ne > 0.53, 'normal vs easy ' + ne); ok(he > ne, 'hard > normal against easy'); ok(hn > 0.5, 'hard vs normal ' + hn);
  const h4 = rate(3, 1, 4, 800); ok(h4 > 0.3, 'hard in a 4-player table vs three easy: ' + h4 + ' (fair share is 0.25)');
});

test('CPU behaviour: holds back re-dye, attacks a nearly-out neighbour, calls in time (Hard)', () => {
  // two plays are possible: a plain card or the re-dye: Hard keeps the re-dye
  let st = setup({ level: 3 }, s => put(s, 0, [num(0, 3), 100, num(0, 7), num(1, 7), num(2, 8)], num(0, 5)));
  ok(E.cpu(st).c !== 100, 'does not waste the re-dye');
  // next player has 1 card: prefer tangle
  st = setup({ level: 3 }, s => { put(s, 0, [spec('tangle', 0), num(0, 3), num(0, 4), num(1, 3), num(2, 8)], num(0, 5)); s.hands[1] = [num(3, 3)]; });
  eq(E.cpu(st).c, spec('tangle', 0), 'tangles the nearly-out neighbour');
  // with two cards, a Hard CPU always calls first
  st = setup({ level: 3 }, s => put(s, 0, [num(0, 3), num(0, 4)], num(0, 5)));
  deq(E.cpu(st), { t: 'call' });
  // a Hard CPU catches a forgetful player almost always
  let c = 0; for (let i = 0; i < 100; i++) { const s2 = setup({ level: 3, seed: 100 + i }, s => put(s, 0, [num(0, 3), num(0, 4)], num(0, 5))); E.apply(s2, { t: 'play', c: num(0, 3) }); if (E.cpu(s2).t === 'catch') c++; }
  ok(c > 85, 'catches ' + c + '/100');
});

run('colorcards-engine');
