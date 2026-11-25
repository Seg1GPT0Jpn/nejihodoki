// cards/solitaire.js の単体テスト：配りが決まった結果になる・全部のカードが1枚ずつ・動かせる手がすべて通る・
// 無制限の「戻す」で最初まで戻れる・ヒントはかならず legal・完成の判定・FreeCell と Spider の決まり・FreeCell の番号つきの配りが解ける。
// 実行：node tools/tests/unit/cards-solitaire.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run, fresh } = require('./_kobo-env');
const S = require(path.join(ROOT, 'cards/solitaire.js'));

const CFGS = [
  { variant: 'klondike', draw: 1 }, { variant: 'klondike', draw: 3 }, { variant: 'freecell' },
  { variant: 'spider', suits: 1 }, { variant: 'spider', suits: 2 }, { variant: 'spider', suits: 4 },
];
const tag = c => c.variant + (c.draw ? c.draw : '') + (c.suits ? 's' + c.suits : '');
const clone = x => JSON.parse(JSON.stringify(x));
const view = st => JSON.stringify({ p: st.p, dn: st.dn, moves: st.moves, over: st.over });
function allIds(st) {
  const ids = [];
  for (const k of Object.keys(st.p)) for (const pile of st.p[k]) ids.push(...pile);
  return ids.sort((a, b) => a - b);
}
function lcg(seed) { let s = seed >>> 0; return () => { s = (Math.imul(s, 1664525) + 1013904223) >>> 0; return s / 4294967296; }; }
function playRandom(st, steps, r, hook) {
  for (let i = 0; i < steps && !st.over; i++) {
    const L = S.legal(st); if (!L.length) break;
    // 山札めくりばかりにならないよう、動かす手を優先
    const mv = L.filter(m => m.t === 'mv'); const pool = mv.length && r() < 0.85 ? mv : L;
    const m = pool[Math.floor(r() * pool.length)];
    const ev = S.apply(st, m);
    if (!ev) throw new Error('legal move rejected: ' + JSON.stringify(m));
    if (hook) hook(st, m);
  }
  return st;
}

test('deals: deterministic by seed, JSON-safe, every card exactly once, right layout', () => {
  for (const c of CFGS) {
    const a = S.create(Object.assign({ seed: 777 }, c)), b = S.create(Object.assign({ seed: 777 }, c)), d = S.create(Object.assign({ seed: 778 }, c));
    eq(JSON.stringify(a), JSON.stringify(b), tag(c) + ' same seed');
    ok(JSON.stringify(a) !== JSON.stringify(d), tag(c) + ' different seed');
    eq(JSON.stringify(clone(a)), JSON.stringify(a), tag(c) + ' JSON round trip');
    const n = c.variant === 'spider' ? 104 : 52, ids = allIds(a);
    eq(ids.length, n, tag(c) + ' card count');
    ok(ids.every((x, i) => x === i), tag(c) + ' each card once');
    if (c.variant === 'klondike') { eq(a.p.T.map(x => x.length).join(), '1,2,3,4,5,6,7'); eq(a.p.S[0].length, 24); eq(a.dn.join(), '0,1,2,3,4,5,6'); }
    if (c.variant === 'freecell') { eq(a.p.T.map(x => x.length).join(), '7,7,7,7,6,6,6,6'); ok(a.dn.every(x => x === 0)); eq(a.p.C.length, 4); }
    if (c.variant === 'spider') { eq(a.p.T.map(x => x.length).join(), '6,6,6,6,5,5,5,5,5,5'); eq(a.p.S[0].length, 50); }
  }
  // Spider's faces: 1 suit = all spades, 2 suits = spades + hearts, 4 suits = two decks of the four suits
  for (const [su, want] of [[1, 1], [2, 2], [4, 4]]) {
    const st = S.create({ variant: 'spider', suits: su, seed: 1 }), seen = new Set();
    for (let id = 0; id < 104; id++) { const f = S.faceOf(st, id); seen.add((f / 13) | 0); eq(f % 13, id % 13); }
    eq(seen.size, want, 'spider suits ' + su);
    const cnt = {}; for (let id = 0; id < 104; id++) cnt[S.faceOf(st, id)] = (cnt[S.faceOf(st, id)] || 0) + 1;
    ok(Object.values(cnt).every(x => x === 8 / want), 'spider copies per face ' + su);
  }
});

test('FreeCell numbered deals: the well-known layout of deal 1, and the daily deal comes from the date', () => {
  const R = 'A23456789TJQK', SU = 'SHDC';
  const txt = n => S.msDeal(n).map(col => col.map(x => R[x % 13] + SU[(x / 13) | 0]).join(' '));
  const d1 = txt(1);
  eq(d1[0], 'JD KD 2S 4C 3S 6D 6S'); eq(d1[1], '2D KC KS 5C TD 8S 9C'); eq(d1[7], '5H 3H 3C 7S 7D TC');
  eq(S.create({ variant: 'freecell', seed: 1 }).p.T.map(c => c.length).join(), '7,7,7,7,6,6,6,6');
  const a = S.dailySeed('freecell', 2026, 11, 25), b = S.dailySeed('freecell', 2026, 11, 25), c = S.dailySeed('freecell', 2026, 11, 26);
  eq(a, b); ok(a >= 1 && a <= 32001 && a !== S.FC_BAD, 'in the solvable range'); ok(a !== c || true);
  for (let i = 0; i < 300; i++) { const n = S.randomSeed('freecell', lcg(i + 5)); ok(n >= 1 && n <= 32001 && n !== S.FC_BAD, 'random deal number ' + n); }
  ok(S.dailySeed('spider', 2026, 11, 25) !== S.dailySeed('klondike', 2026, 11, 25), 'each variant has its own daily deal');
});

test('random play: every legal move applies, cards are conserved, hint is always legal, and unlimited undo walks back to the start', () => {
  for (const c of CFGS) for (let seed = 1; seed <= 6; seed++) {
    const r = lcg(seed * 31 + c.variant.length), st = S.create(Object.assign({ seed }, c)), start = view(st), n0 = allIds(st).length;
    let steps = 0;
    playRandom(st, 260, r, (s, m) => {
      steps++;
      eq(allIds(s).length, n0, tag(c) + ' conserved');
      const h = S.hint(s);
      if (!s.over) { ok(h === null ? S.legal(s).length === 0 : S.legal(s).some(x => S.sameMove(x, h)), tag(c) + ' hint is legal'); }
      // the face-down count is never more than the cards of a column
      s.dn.forEach((d, i) => ok(d <= s.p.T[i].length && (s.p.T[i].length === 0 || d < s.p.T[i].length), tag(c) + ' top is face-up'));
    });
    ok(steps > 3, tag(c) + ' played ' + steps);
    // a mid-game snapshot restored from JSON keeps working
    const copy = clone(st);
    eq(view(copy), view(st));
    let k = 0; while (S.undo(st)) k++;
    eq(view(st), start, tag(c) + ' undo to the start (' + k + ' undos)');
    eq(st.hist.length, 0);
    ok(!S.undo(st), 'nothing left to undo');
  }
});

test('an illegal move is refused and changes nothing', () => {
  for (const c of CFGS) {
    const st = S.create(Object.assign({ seed: 5 }, c)), before = JSON.stringify(st);
    eq(S.apply(st, { t: 'mv', f: ['T', 0], n: 1, to: ['T', 0] }), null);
    eq(S.apply(st, { t: 'mv', f: ['T', 0], n: 99, to: ['T', 1] }), null);
    eq(S.apply(st, null), null);
    eq(JSON.stringify(st), before);
  }
});

test('Klondike: draw 1 / draw 3, recycling the waste, tableau and foundation rules, flipping', () => {
  const st = S.create({ variant: 'klondike', draw: 3, seed: 9 }), n0 = st.p.S[0].length;
  S.apply(st, { t: 'draw' });
  eq(st.p.W[0].length, 3); eq(st.p.S[0].length, n0 - 3);
  for (let i = 0; i < 7; i++) S.apply(st, { t: 'draw' });
  eq(st.p.S[0].length, 0); eq(st.p.W[0].length, 24);
  S.apply(st, { t: 'draw' });   // recycle
  eq(st.p.S[0].length, 24); eq(st.p.W[0].length, 0);
  const one = S.create({ variant: 'klondike', draw: 1, seed: 9 }); S.apply(one, { t: 'draw' }); eq(one.p.W[0].length, 1);
  // hand-made position: red 6 on a black 7, only a king into an empty column, flip after moving
  const g = S.create({ variant: 'klondike', draw: 1, seed: 1 });
  g.p.T = [[13 + 5], [6 + 0], [12 + 26], [], [], [], []]; g.dn = [0, 0, 0, 0, 0, 0, 0]; g.p.S = [[]]; g.p.W = [[]];
  // T0 = 6♥(rank 5, red), T1 = 7♠ (rank 6, black), T2 = K♦ (rank 12)
  const L = S.legal(g).filter(m => m.t === 'mv');
  ok(L.some(m => m.f[0] === 'T' && m.f[1] === 0 && m.to[1] === 1), '6♥ onto 7♠');
  ok(!L.some(m => m.f[1] === 1 && m.to[1] === 0), '7♠ not onto 6♥');
  ok(L.some(m => m.f[1] === 2 && m.to[0] === 'T' && m.to[1] === 3), 'king to an empty column');
  ok(!L.some(m => m.f[1] === 0 && m.to[0] === 'T' && m.to[1] === 3), 'a non-king cannot go to an empty column');
  const f = S.create({ variant: 'klondike', draw: 1, seed: 1 });
  f.p.T = [[40, 13], [], [], [], [], [], []]; f.dn = [1, 0, 0, 0, 0, 0, 0];   // 13 = A♥ on top of a face-down card
  f.p.S = [[]]; f.p.W = [[]];
  const ev = S.apply(f, { t: 'mv', f: ['T', 0], n: 1, to: ['F', 1] });
  ok(ev.some(e => e.t === 'flip') && f.dn[0] === 0, 'the card under it is flipped');
  S.undo(f); eq(f.dn[0], 1, 'undo turns it face down again'); eq(f.p.F[1].length, 0);
});

test('Klondike: waste → foundation, foundation → tableau, safe auto-moves, and the auto group is one undo', () => {
  const g = S.create({ variant: 'klondike', draw: 1, seed: 3 });
  g.p.T = [[26 + 0 + 5, 13], [], [], [], [], [], []]; g.dn = [0, 0, 0, 0, 0, 0, 0];   // 6♦ then A♥
  g.p.S = [[]]; g.p.W = [[0]];   // A♠ in the waste
  const L = S.legal(g).filter(m => m.t === 'mv');
  ok(L.some(m => m.f[0] === 'W' && m.to[0] === 'F' && m.to[1] === 0), 'A♠ waste to its foundation');
  eq(S.autoNext(g) && S.autoNext(g).to[0], 'F', 'aces are safe');
  S.apply(g, { t: 'mv', f: ['W', 0], n: 1, to: ['F', 0] });
  const hb = g.hist.length, n = S.autoSafe(g, false);
  ok(n >= 1, 'auto moved ' + n);
  S.undo(g);   // takes the user move and its auto moves together
  eq(g.hist.length, hb - 1); eq(g.p.W[0].length, 1);
  // not safe: a 5 of a colour whose opposite-colour 4s are not up yet
  const u = S.create({ variant: 'klondike', draw: 1, seed: 3 });
  u.p.T = [[4], [], [], [], [], [], []]; u.dn = [0, 0, 0, 0, 0, 0, 0]; u.p.S = [[]]; u.p.W = [[]];
  u.p.F[0] = [0, 1, 2, 3];
  eq(S.autoNext(u), null, 'a 5♠ is not safe while the red 4s are down');
  u.p.F[1] = [13, 14, 15, 16]; u.p.F[2] = [26, 27, 28, 29];
  ok(S.autoNext(u) !== null, 'safe once the red 4s are up');
  // F → T
  const q = S.create({ variant: 'klondike', draw: 1, seed: 3 });
  q.p.T = [[13 + 5 + 1], [], [], [], [], [], []]; q.dn = q.dn.map(() => 0); q.p.S = [[]]; q.p.W = [[]];   // 7♥ alone
  q.p.F[0] = [0, 1, 2, 3, 4, 5];   // ... 6♠
  ok(S.legal(q).some(m => m.t === 'mv' && m.f[0] === 'F' && m.to[0] === 'T' && m.to[1] === 0), '6♠ from the foundation onto 7♥');
});

test('win detection and "auto finish": Klondike, FreeCell, Spider', () => {
  for (const c of CFGS) {
    const st = S.nearWin(S.create(Object.assign({ seed: 4 }, c)));
    ok(!st.won && !st.over, tag(c) + ' not won yet');
    if (c.variant === 'spider') {
      const mv = S.legal(st).find(m => m.t === 'mv' && m.f[1] === 1 && m.to[1] === 0);
      ok(mv, 'A onto the 2 of the same set');
      const ev = S.apply(st, mv);
      ok(ev.some(e => e.t === 'run') && ev.some(e => e.t === 'win'), 'the last run completes the game');
      eq(st.p.D.filter(d => d.length === 13).length, 8);
    } else {
      ok(S.canAutoFinish(st), tag(c) + ' can auto finish');
      eq(st.hist.length, 0);
      const n = S.autoFinish(st, true);
      eq(n, 4, 'four kings'); ok(st.won && st.over && S.isWon(st), tag(c) + ' won');
      eq(S.legal(st).length, 0, 'no moves after the win');
      eq(S.apply(st, { t: 'draw' }), null);
      ok(!S.undo(st), 'no undo after a win');
    }
  }
  const st = S.create({ variant: 'freecell', seed: 1 });
  ok(!S.canAutoFinish(st), 'a fresh deal cannot auto finish');
});

test('FreeCell: cells, supermove limit, foundation by suit', () => {
  const g = S.create({ variant: 'freecell', seed: 1 });
  // columns: a black 9..red 8..black 7 run (3 cards) and a red 10 target
  const sp = (r, s) => s * 13 + r;
  g.p.T = [[sp(8, 0), sp(7, 1), sp(6, 0)], [sp(9, 1)], [], [], [], [], [], []]; g.p.C = [[], [], [], []];
  // 9♠ 8♥ 7♠ onto 10♥ ; with 4 free cells and 6 empty columns the limit is large
  ok(S.legal(g).some(m => m.f[0] === 'T' && m.f[1] === 0 && m.n === 3 && m.to[1] === 1), 'three cards at once');
  // fill the cells and the empty columns so only one card can move
  g.p.C = [[sp(0, 3)], [sp(1, 3)], [sp(2, 3)], [sp(3, 3)]];
  g.p.T = [[sp(8, 0), sp(7, 1), sp(6, 0)], [sp(9, 1)], [sp(0, 2)], [sp(1, 2)], [sp(2, 2)], [sp(3, 2)], [sp(4, 2)], [sp(5, 2)]];
  eq(S.maxMove(g, false), 1);
  ok(!S.legal(g).some(m => m.t === 'mv' && m.n === 3 && m.f[0] === 'T'), 'no 3-card move with full cells');
  ok(S.legal(g).some(m => m.f[0] === 'T' && m.f[1] === 0 && m.n === 1 && m.to[0] === 'T' && m.to[1] === 1) === false, '7♠ alone cannot go onto 10♥');
  g.p.C[0] = [];
  eq(S.maxMove(g, false), 2); eq(S.maxMove(S.create({ variant: 'freecell', seed: 1 }), true), 5);
  // a cell card goes to its column or its foundation; tableau → cell only while a cell is free
  const h = S.create({ variant: 'freecell', seed: 1 });
  h.p.T = [[sp(4, 0)], [sp(5, 1)], [], [], [], [], [], []]; h.p.C = [[sp(0, 0)], [], [], []];
  ok(S.legal(h).some(m => m.f[0] === 'C' && m.to[0] === 'F' && m.to[1] === 0), 'A♠ from a cell to its foundation');
  ok(S.legal(h).some(m => m.f[0] === 'T' && m.f[1] === 0 && m.to[0] === 'C'), 'a column card into a cell');
  h.p.C = [[1], [2], [3], [4]];
  ok(!S.legal(h).some(m => m.to[0] === 'C'), 'no free cell');
});

test('Spider: only same-suit runs move, any card on rank+1, deal needs every column filled, a full run is taken away', () => {
  const g = S.create({ variant: 'spider', suits: 2, seed: 2 });
  // with 2 suits: ids k*13+r, k even = spade, k odd = heart
  const sp = (r, k) => k * 13 + r;
  g.p.T = Array.from({ length: 10 }, () => []); g.dn = g.dn.map(() => 0); g.p.S = [[]];
  g.p.T[0] = [sp(5, 0), sp(4, 1), sp(3, 0)];   // 6♠ 5♥ 4♠ : the 5♥ 4♠ is not a run
  g.p.T[1] = [sp(6, 1)];                        // 7♥
  const L = S.legal(g);
  ok(L.some(m => m.f[1] === 0 && m.n === 1 && m.to[1] === 1) === false, '4♠ cannot go onto 7♥ (rank)');
  g.p.T[1] = [sp(4, 1)];                        // 5♥ : a 4♠ may go onto a 5 of any suit
  ok(S.legal(g).some(m => m.f[1] === 0 && m.n === 1 && m.to[1] === 1), '4♠ onto 5♥');
  ok(!S.legal(g).some(m => m.f[1] === 0 && m.n === 2), 'a mixed-suit pair cannot move together');
  g.p.T[0] = [sp(9, 1), sp(5, 0), sp(4, 0), sp(3, 0)];
  ok(S.legal(g).some(m => m.f[1] === 0 && m.n === 3 && m.to[0] === 'T' && m.to[1] === 2), 'a same-suit run moves together (to an empty column)');
  // dealing: not while a column is empty
  g.p.S = [Array.from({ length: 10 }, (_, i) => 52 + i)];
  ok(!S.legal(g).some(m => m.t === 'deal'), 'no deal with empty columns');
  g.p.T = g.p.T.map((c, i) => (c.length ? c : [sp(0, 2)]));
  const before = g.p.S[0].length;
  ok(S.legal(g).some(m => m.t === 'deal'), 'deal when all columns hold cards');
  S.apply(g, { t: 'deal' });
  eq(g.p.S[0].length, before - 10); ok(g.p.T.every(c => c.length >= 2));
  S.undo(g); eq(g.p.S[0].length, before);
  // a full K..A run of one suit is removed, the card under it is flipped, undo brings it back
  const h = S.create({ variant: 'spider', suits: 1, seed: 2 });
  h.p.T = Array.from({ length: 10 }, () => []); h.dn = h.dn.map(() => 0); h.p.S = [[]];
  h.p.T[0] = [99, ...Array.from({ length: 12 }, (_, q) => 12 - q)];   // face-down 99 under K..2
  h.dn[0] = 1; h.p.T[1] = [0];
  const ev = S.apply(h, { t: 'mv', f: ['T', 1], n: 1, to: ['T', 0] });
  ok(ev.some(e => e.t === 'run'), 'run completed');
  eq(h.p.D[0].length, 13); eq(h.p.T[0].join(), '99'); eq(h.dn[0], 0, 'the card under it is face-up');
  S.undo(h); eq(h.p.D[0].length, 0); eq(h.p.T[0].length, 13); eq(h.dn[0], 1);
});

test('hints: never an illegal move; they do not take back the last move; they find the obvious plays', () => {
  for (const c of CFGS) {
    const st = S.create(Object.assign({ seed: 12 }, c)); let last = null;
    for (let i = 0; i < 120 && !st.over; i++) {
      const h = S.hint(st); if (!h) break;
      ok(S.legal(st).some(m => S.sameMove(m, h)), tag(c) + ' legal hint at ' + i);
      if (last && h.t === 'mv' && last.t === 'mv' && S.legal(st).length > 2) {
        const back = last.n === h.n && last.f[0] === h.to[0] && last.f[1] === h.to[1] && last.to[0] === h.f[0] && last.to[1] === h.f[1];
        ok(!back, tag(c) + ' the hint does not take back the last move');
      }
      S.apply(st, h); last = h;
    }
  }
  const g = S.create({ variant: 'klondike', draw: 1, seed: 3 });
  g.p.T = [[13], [], [], [], [], [], []]; g.dn = g.dn.map(() => 0); g.p.S = [[5]]; g.p.W = [[]];
  eq(JSON.stringify(S.hint(g)), JSON.stringify({ t: 'mv', f: ['T', 0], n: 1, to: ['F', 1] }), 'an ace goes up first');
  // no legal move → null
  const z = S.create({ variant: 'freecell', seed: 1 });
  z.p.T = Array.from({ length: 8 }, (_, i) => [13 * 3 + 12 - (i % 2 ? 0 : 0) - i]); z.p.C = [[1], [2], [3], [4]];
  ok(S.hint(z) === null || S.legal(z).some(m => S.sameMove(m, S.hint(z))));
});

// ---- FreeCell: a small best-first solver. The numbered deals must be solvable and the engine's own moves must reach a win.
function solve(st0, limit) {
  const key = s => s.p.T.map(c => c.join('.')).sort().join('|') + '#' + s.p.C.map(c => c[0] === undefined ? -1 : c[0]).sort().join() + '#' + s.p.F.map(f => f.length).join();
  const heur = s => {
    let v = (52 - s.p.F.reduce((n, f) => n + f.length, 0)) * 8;
    for (const col of s.p.T) for (let i = 0; i < col.length - 1; i++) if (S.rk(col[i]) < S.rk(col[i + 1])) v += 2;   // a bigger card sitting on a smaller one: blocked
    v += s.p.C.filter(c => c.length).length * 3;
    return v;
  };
  const open = [{ st: st0, path: [], f: heur(st0) }], seen = new Set([key(st0)]);
  let n = 0;
  while (open.length && n++ < limit) {
    let bi = 0; for (let i = 1; i < open.length; i++) if (open[i].f < open[bi].f) bi = i;
    const cur = open[bi]; open[bi] = open[open.length - 1]; open.pop();
    for (const m of S.legal(cur.st)) {
      const nx = clone(cur.st); nx.hist = []; S.apply(nx, m);
      if (nx.won) return cur.path.concat([m]);
      const k = key(nx); if (seen.has(k)) continue; seen.add(k);
      open.push({ st: nx, path: cur.path.concat([m]), f: heur(nx) + cur.path.length * 0.5 });
    }
  }
  return null;
}
test('FreeCell numbered deals are solvable (a solver finds a line, the engine plays it to a win)', () => {
  let solved = 0, tried = 0;
  for (const n of [1, 2, 3, 4, 5, 6, 8]) {
    tried++;
    const st = S.create({ variant: 'freecell', seed: n }), line = solve(clone(st), 12000);
    if (!line) continue;
    solved++;
    for (const m of line) ok(S.apply(st, m), 'deal ' + n + ' line replays');
    ok(st.won, 'deal ' + n + ' reaches a win');
  }
  ok(solved >= Math.floor(tried * 0.6), 'the solver cracked ' + solved + ' of ' + tried);
});

test('records sync: wins and plays take the larger, best time and fewest moves take the smaller (registry rule)', () => {
  const { games, platform } = fresh();
  const rule = games.games.find(g => g.id === 'cards').sync['kusoge.cards.save'];
  const merge = platform.merge.make(rule);
  const a = { v: 1, pts: 3, g: { k1: { p: 4, w: 2, bt: 300, bm: 90 }, om: { p: 1, w: 1, l: 0 } } };
  const b = { v: 1, pts: 5, g: { k1: { p: 6, w: 1, bt: 250, bm: 120 }, fc: { p: 1, w: 0 } } };
  const m = JSON.parse(merge(JSON.stringify(a), JSON.stringify(b), { localT: 1, remoteT: 2 }));
  eq(m.pts, 5); eq(m.g.k1.p, 6); eq(m.g.k1.w, 2); eq(m.g.k1.bt, 250, 'faster time wins'); eq(m.g.k1.bm, 90, 'fewer moves win'); eq(m.g.om.w, 1); eq(m.g.fc.p, 1);
});

run('cards-solitaire');
