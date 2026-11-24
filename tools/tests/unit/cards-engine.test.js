// cards/engine.js の単体テスト：決まった結果（同じ seed → 同じ展開）、役の判定、サイドポット、チップの保存、
// CPU 同士のたくさんの対局（行き詰まらない・反則の手を出さない）、強さの順（つよい ≧ ふつう ≧ よわい）。
// 実行：node tools/tests/unit/cards-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'cards/engine.js'));
const ART = require(path.join(ROOT, 'cards/art.js'));
const GAMES = Object.keys(E.games);
const same = E.sameJSON;

function playOut(id, o, hook) {
  const G = E.games[id], st = G.create(Object.assign({ humans: [] }, o));
  let k = 0;
  while (!G.done(st)) {
    if (++k > 20000) throw new Error('stuck: ' + id + ' ' + JSON.stringify(o) + ' phase=' + st.phase);
    const w = G.who(st), mv = w.sys || G.cpu(st);
    if (!G.legal(st).some(m => same(m, mv))) throw new Error('illegal move: ' + id + ' ' + JSON.stringify(o) + ' ' + JSON.stringify(mv));
    G.apply(st, mv);
    if (hook) hook(st);
  }
  return st;
}

test('six games are registered, each with the same interface', () => {
  eq(GAMES.join(), 'oldmaid,concentration,sevens,daifugo,poker,blackjack');
  for (const id of GAMES) for (const f of ['create', 'legal', 'apply', 'cpu', 'who', 'done', 'result']) ok(typeof E.games[id][f] === 'function', id + '.' + f);
});

test('deterministic: the same seed and the same moves give the same game (and it survives a JSON round trip)', () => {
  for (const id of GAMES) {
    const a = playOut(id, { seed: 4242, n: 3, level: 2 }), b = playOut(id, { seed: 4242, n: 3, level: 2 }), c = playOut(id, { seed: 4243, n: 3, level: 2 });
    ok(same(a, b), id + ' same seed');
    ok(!same(a, c), id + ' different seed');
    // stop in the middle, save as JSON, continue: the same end
    const G = E.games[id], st = G.create({ seed: 77, n: 4, level: 2, humans: [] });
    for (let i = 0; i < 25 && !G.done(st); i++) { const w = G.who(st); G.apply(st, w.sys || G.cpu(st)); }
    const copy = JSON.parse(JSON.stringify(st));
    const fin = s => { let k = 0; while (!G.done(s) && k++ < 20000) { const w = G.who(s); G.apply(s, w.sys || G.cpu(s)); } return s; };
    ok(same(fin(st), fin(copy)), id + ' resume from JSON');
  }
});

test('simulated games: 2-4 players × 3 strengths × many seeds never stall and never make an illegal move', () => {
  for (const id of GAMES) {
    let n = 0;
    const seeds = id === 'poker' || id === 'blackjack' ? 40 : 60;
    for (let seed = 1; seed <= seeds; seed++) for (const p of [2, 3, 4]) for (const level of [1, 2, 3]) { const st = playOut(id, { seed, n: p, level }); ok(st.over, id); n++; }
    ok(n > 100, id + ' ran ' + n);
  }
  // daifugo with every house rule on, and a sevens with no pass limit
  for (let seed = 1; seed <= 60; seed++) for (const p of [2, 3, 4]) playOut('daifugo', { seed, n: p, level: 2, rules: { rev: true, cut8: true, lock: true, jback: true, s3: true, seq: true, joker: true } });
  for (let seed = 1; seed <= 60; seed++) playOut('daifugo', { seed, n: 3, level: 2, rules: { rev: false, cut8: false, joker: false } });
  for (let seed = 1; seed <= 40; seed++) playOut('sevens', { seed, n: 4, level: 2, passes: 99 });
  for (const pairs of [10, 18, 26]) playOut('concentration', { seed: 5, n: 3, level: 3, pairs });
});

test('every game ends with a full ranking (each seat once, ranks 1..n)', () => {
  for (const id of GAMES) for (let seed = 1; seed <= 20; seed++) {
    const st = playOut(id, { seed, n: 4, level: 2 }), r = E.games[id].result(st);
    eq(r.order.slice().sort().join(), '0,1,2,3', id + ' order');
    ok(r.rank.every(x => x >= 1 && x <= 4) && r.rank.indexOf(1) >= 0, id + ' ranks');
  }
});

test('old maid: 53 cards, pairs of one number are discarded, the Joker holder loses', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const st = E.games.oldmaid.create({ seed, n: 4, level: 2, humans: [] });
    eq(st.hands.reduce((a, h) => a + h.length, 0) + st.disc.length, 53);
    const fin = playOut('oldmaid', { seed, n: 4, level: 2 });
    eq(fin.hands.reduce((a, h) => a + h.length, 0), 1, 'one card left');
    eq(fin.hands[fin.loser].join(), '52', 'the Joker');
    eq(fin.out[fin.out.length - 1], fin.loser);
  }
});

test('concentration: a pair is the same number and the same color; matches keep the turn, misses pass it', () => {
  const G = E.games.concentration, st = G.create({ seed: 9, n: 2, level: 3, humans: [] });
  eq(st.cells.length, 36);
  const pid = i => G.pid(st, i);
  const mates = {}; st.cells.forEach((c, i) => { (mates[pid(i)] = mates[pid(i)] || []).push(i); });
  ok(Object.values(mates).every(a => a.length === 2), 'every cell has exactly one mate');
  const a = mates[Object.keys(mates)[0]];
  G.apply(st, { t: 'flip', i: a[0] }); G.apply(st, { t: 'flip', i: a[1] });
  eq(st.match, true); G.apply(st, { t: 'resolve' });
  eq(st.turn, 0, 'a match keeps the turn'); eq(st.score[0], 1);
  const other = Object.keys(mates)[1], third = Object.keys(mates)[2];
  G.apply(st, { t: 'flip', i: mates[other][0] }); G.apply(st, { t: 'flip', i: mates[third][0] });
  eq(st.match, false); G.apply(st, { t: 'resolve' });
  eq(st.turn, 1, 'a miss passes the turn'); eq(st.up.filter(x => x === 1).length, 0, 'cards are turned back');
});

test('sevens: only 7s or neighbours are playable; passing is allowed only when nothing can be played; too many passes drop you out', () => {
  const G = E.games.sevens;
  for (let seed = 1; seed <= 40; seed++) {
    playOut('sevens', { seed, n: 4, level: 1 }, st => {
      if (st.over) return;
      const L = G.legal(st), plays = L.filter(m => m.t === 'play');
      ok(plays.length === 0 ? L.length === 1 && L[0].t === 'pass' : L.every(m => m.t === 'play'), 'pass only when stuck');
    });
  }
  const st = G.create({ seed: 3, n: 2, level: 1, humans: [], passes: 0 });
  let bust = false; for (let i = 0; i < 400 && !st.over; i++) { G.apply(st, G.cpu(st)); if (st.busted.length) bust = true; }
  ok(bust || st.out.length, 'game ends');
});

test('daifugo: strength order, revolution, 8-cut, the joker, and the rule toggles', () => {
  const G = E.games.daifugo, pos = c => G.posOf(c);
  ok(pos(2) < pos(3 * 13 + 3) && pos(12 + 0) < pos(1) && pos(1) < pos(52), '3 < K < 2 < Joker'); // c=2 is a 3; 12 is K; 1 is a 2
  const mk = (hands, rules, field) => { const st = G.create({ seed: 1, n: 3, level: 2, humans: [], rules: Object.assign({ joker: true }, rules) }); st.hands = hands; st.turn = 0; if (field) { st.field = field; st.owner = 2; } return st; };
  // 8-cut: playing an 8 clears the field and keeps the lead
  let st = mk([[7, 20, 30], [0, 1, 14], [15, 16, 17]], {});
  let mv = G.legal(st).find(m => m.t === 'play' && m.cards.join() === '7'); // 8♠
  const ev = G.apply(st, mv);
  ok(ev.some(e => e.t === 'cut') && st.field === null && st.turn === 0, '8-cut keeps the lead');
  st = mk([[7, 20, 30], [0, 1, 14], [15, 16, 17]], { cut8: false });
  G.apply(st, G.legal(st).find(m => m.t === 'play' && m.cards.join() === '7'));
  ok(st.field && st.turn === 1, 'no cut when off');
  // revolution: four of a kind flips the order, and a lower card then beats a higher one
  st = mk([[4, 17, 30, 43, 5], [3, 1, 14], [15, 16, 12]], {});
  G.apply(st, G.legal(st).find(m => m.t === 'play' && m.n === 4));
  eq(st.rev, true, 'revolution');
  st = mk([[2, 5], [3], [4]], {}, { cards: [8], n: 1, kind: 'set', pos: G.posOf(8), mask: 1, joker: false, seat: 2 });
  st.rev = true;
  ok(G.legal(st).some(m => m.t === 'play' && m.cards.join() === '2'), 'under revolution a 3 beats a 10');
  ok(G.legal(st).some(m => m.t === 'play' && m.cards.join() === '5'), 'and a 6 beats it too (everything lower wins when flipped)');
  // joker: beats a single 2; a lone 3 of spades beats it only with the spade-3 rule
  st = mk([[52, 2], [3], [4]], { s3: true }, { cards: [1], n: 1, kind: 'set', pos: 12, mask: 1, joker: false, seat: 2 });
  ok(G.legal(st).some(m => m.t === 'play' && m.cards[0] === 52), 'joker beats a 2');
  st = mk([[2, 5], [3], [4]], { s3: true }, { cards: [52], n: 1, kind: 'set', pos: 13, mask: 0, joker: true, seat: 2 });
  eq(G.legal(st).filter(m => m.t === 'play').map(m => m.cards.join()).join(), '2', 'only the spade 3 beats a lone joker');
  st = mk([[2, 5], [3], [4]], { s3: false }, { cards: [52], n: 1, kind: 'set', pos: 13, mask: 0, joker: true, seat: 2 });
  eq(G.legal(st).filter(m => m.t === 'play').length, 0, 'nothing beats the joker without the rule');
  // sequences only with the rule
  st = mk([[2, 3, 4, 20], [0], [1]], { seq: true });
  ok(G.legal(st).some(m => m.t === 'play' && m.kind === 'seq' && m.n === 3), 'sequence of 3');
  st = mk([[2, 3, 4, 20], [0], [1]], { seq: false });
  ok(!G.legal(st).some(m => m.kind === 'seq'), 'no sequence by default');
});

test('poker: hand ranks, kickers, ace-low straights', () => {
  const c = (s, r) => s * 13 + r;   // r: 0=A … 12=K
  const hand = (...a) => E.games.poker.eval5(a);
  eq(hand(c(0, 0), c(0, 12), c(0, 11), c(0, 10), c(0, 9)).cat, 9, 'royal flush');
  eq(hand(c(1, 4), c(1, 5), c(1, 6), c(1, 7), c(1, 8)).cat, 8, 'straight flush');
  eq(hand(c(0, 3), c(1, 3), c(2, 3), c(3, 3), c(0, 8)).cat, 7, 'four');
  eq(hand(c(0, 3), c(1, 3), c(2, 3), c(3, 8), c(0, 8)).cat, 6, 'full house');
  eq(hand(c(2, 0), c(2, 3), c(2, 5), c(2, 8), c(2, 11)).cat, 5, 'flush');
  eq(hand(c(0, 0), c(1, 1), c(2, 2), c(3, 3), c(0, 4)).cat, 4, 'wheel straight');
  eq(hand(c(0, 9), c(1, 10), c(2, 11), c(3, 12), c(0, 0)).cat, 4, 'broadway');
  eq(hand(c(0, 3), c(1, 3), c(2, 3), c(3, 8), c(0, 9)).cat, 3, 'trips');
  eq(hand(c(0, 3), c(1, 3), c(2, 8), c(3, 8), c(0, 9)).cat, 2, 'two pair');
  eq(hand(c(0, 3), c(1, 3), c(2, 8), c(3, 5), c(0, 9)).cat, 1, 'pair');
  eq(hand(c(0, 3), c(1, 4), c(2, 8), c(3, 5), c(0, 11)).cat, 0, 'high card');
  ok(hand(c(0, 0), c(1, 0), c(2, 5), c(3, 6), c(0, 7)).val > hand(c(0, 12), c(1, 12), c(2, 5), c(3, 6), c(0, 7)).val, 'aces beat kings');
  ok(hand(c(0, 3), c(1, 3), c(2, 8), c(3, 5), c(0, 11)).val > hand(c(0, 3), c(1, 3), c(2, 8), c(3, 5), c(0, 10)).val, 'kicker');
  ok(hand(c(0, 1), c(1, 2), c(2, 3), c(3, 4), c(0, 5)).val > hand(c(0, 0), c(1, 1), c(2, 2), c(3, 3), c(0, 4)).val, '6-high straight beats the wheel');
});

test('poker: chips are conserved every move, side pots pay the right people, the match ends', () => {
  for (let seed = 1; seed <= 60; seed++) for (const n of [2, 3, 4]) {
    const st0 = E.games.poker.create({ seed, n, level: 2, humans: [], stack: [500, 1000, 2000][seed % 3], hands: 10 });
    const total = st0.stacks.reduce((a, b) => a + b, 0) + st0.pot;
    playOut('poker', { seed, n, level: 2, stack: [500, 1000, 2000][seed % 3], hands: 10 }, st => {
      eq(st.stacks.reduce((a, b) => a + b, 0) + st.pot, total, 'chips conserved');
      ok(st.stacks.every(x => x >= 0));
    });
  }
  // a short stack wins the main pot only
  const G = E.games.poker, st = G.create({ seed: 1, n: 3, level: 2, humans: [] });
  const c = (s, r) => s * 13 + r;
  st.hands = [[c(0, 0), c(1, 0), c(2, 0), c(3, 5), c(0, 7)], [c(0, 12), c(1, 12), c(2, 5), c(3, 6), c(0, 3)], [c(1, 3), c(2, 3), c(3, 3), c(0, 5), c(0, 9)]];
  st.folded = [false, false, false]; st.tot = [100, 300, 300]; st.pot = 700; st.stacks = [0, 0, 0]; st.dealer = 2;
  G.finish(st, [0, 1, 2], { 0: G.eval5(st.hands[0]), 1: G.eval5(st.hands[1]), 2: G.eval5(st.hands[2]) });
  eq(st.stacks.join(), '300,0,400', 'seat 0 (trip aces) takes the main pot of 300; seat 2 (trip 4s) beats the kings for the side pot');
});

test('blackjack: totals, soft hands, blackjack pays 3:2, dealer stands on 17, chips never go negative', () => {
  const B = E.games.blackjack, c = r => r;  // ranks of spades: 0=A … 9=10
  eq(B.total([c(0), c(5)]).n, 17); eq(B.total([c(0), c(5)]).soft, true);
  eq(B.total([c(0), c(5), c(9)]).n, 17); eq(B.total([c(0), c(0), c(8)]).n, 21);
  eq(B.isBJ([c(0), c(12)]), true); eq(B.isBJ([c(5), c(6), c(7)]), false);
  for (let seed = 1; seed <= 60; seed++) for (const n of [2, 4]) {
    playOut('blackjack', { seed, n, level: 3, hands: 10 }, st => { ok(st.stacks.every(x => x >= 0), 'no negative chips'); if (st.phase === 'result') ok(B.total(st.dealer).n >= 17 || st.hh.every((hs, s) => !st.in[s] || hs.every(h => B.total(h.cards).n > 21 || B.isBJ(h.cards))), 'dealer drew to 17'); });
  }
});

test('CPU strength: Hard and Normal beat Easy; Hard is at least as good as Normal', () => {
  const rate = (id, A, Bv, T, n) => { let rk = 0; for (let seed = 1; seed <= T; seed++) { const me = seed % n, lv = new Array(n).fill(Bv); lv[me] = A; const G = E.games[id], st = G.create({ seed: seed * 7919, n, level: 2, levels: lv, humans: [] }); while (!G.done(st)) { const w = G.who(st); G.apply(st, w.sys || G.cpu(st)); } rk += G.result(st).rank[me]; } return rk / T; };
  for (const id of ['concentration', 'sevens', 'daifugo', 'poker']) {
    const avg = 2.5;
    const T = id === 'daifugo' ? 160 : 200;
    const hard = rate(id, 3, 1, T, 4), normal = rate(id, 2, 1, T, 4);
    ok(hard < avg - 0.1, id + ' hard vs easy rank ' + hard.toFixed(2));
    ok(normal < avg - 0.05, id + ' normal vs easy rank ' + normal.toFixed(2));
  }
  const hvn = rate('daifugo', 3, 2, 200, 4);
  ok(hvn < 2.5, 'daifugo hard vs normal ' + hvn.toFixed(2));
});

test('art: every card (and the joker) has a face', () => {
  for (let c = 0; c <= 52; c++) { const h = ART.faceHTML(c); ok(h.length > 100 && !/undefined/.test(h), 'card ' + c); }
  ok(/svg/.test(ART.backSVG()), 'back');
});

run('cards-engine');
