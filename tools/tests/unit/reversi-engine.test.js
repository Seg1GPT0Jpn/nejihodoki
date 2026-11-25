// reversi/engine.js の単体テスト：ひっくり返し・置ける場所（perft）・パス・おわり・CPU が反則の手を出さない・
// 毎回同じ結果になること・読み切り（solve）が、別のしくみの全探索と一致すること・毎日のパズル集の答えの証明。
// 実行：node tools/tests/unit/reversi-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'reversi/engine.js'));
const BANK = require(path.join(ROOT, 'reversi/puzzles.js'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const deq = (a, b, m) => ok(same(a, b), (m || 'deep equal') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));

// ---- 別のしくみ（わざと遅く、ふつうに書いた）規則：読み切りと置ける場所の照らし合わせ用
const D8 = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
function slowFlips(b, n, r, c, me) {
  if (b[r][c] !== 0) return [];
  const out = [];
  for (const [dr, dc] of D8) {
    const run = []; let rr = r + dr, cc = c + dc;
    while (rr >= 0 && rr < n && cc >= 0 && cc < n && b[rr][cc] === 3 - me) { run.push([rr, cc]); rr += dr; cc += dc; }
    if (run.length && rr >= 0 && rr < n && cc >= 0 && cc < n && b[rr][cc] === me) out.push(...run);
  }
  return out;
}
function slowMoves(b, n, me) { const o = []; for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) if (slowFlips(b, n, r, c, me).length) o.push([r, c]); return o; }
// 素の全探索（枝刈りなし）：手番の人から見た最後の石の差
function slowSolve(b, n, me, passed) {
  const mv = slowMoves(b, n, me);
  if (!mv.length) {
    if (passed) { let m = 0, y = 0; for (const row of b) for (const v of row) { if (v === me) m++; else if (v) y++; } const e = n * n - m - y; return m > y ? m - y + e : m < y ? m - y - e : 0; }
    return -slowSolve(b, n, 3 - me, true);
  }
  let best = -999;
  for (const [r, c] of mv) {
    const f = slowFlips(b, n, r, c, me), nb = b.map(row => row.slice());
    nb[r][c] = me; for (const [fr, fc] of f) nb[fr][fc] = me;
    best = Math.max(best, -slowSolve(nb, n, 3 - me, false));
  }
  return best;
}
const grid = st => { const g = []; for (let r = 0; r < st.n; r++) g.push(st.b.slice(r * st.n, r * st.n + st.n)); return g; };
function randomPos(seed, n, empties) {
  const rnd = E.rng(seed), st = E.create({ n });
  while (!st.over && E.counts(st).e > empties) { const mv = E.legal(st); E.play(st, mv[Math.floor(rnd() * mv.length)]); }
  return st;
}
function customState(n, rows, turn) {
  const b = []; for (const row of rows) for (const ch of row) b.push(ch === '.' ? 0 : ch === 'x' ? 1 : 2);
  return { v: 1, n, start: 'std', b, turn, moves: [], over: false, first: turn };
}
function playGame(o) {
  const st = E.create(o), lv = o.levels || { 1: 2, 2: 2 }, trace = [];
  let k = 0;
  while (!st.over) {
    if (++k > 200) throw new Error('stuck');
    const c = E.cpu(st, lv[st.turn]);
    if (!E.legal(st).includes(c)) throw new Error('illegal move ' + c + ' in ' + JSON.stringify(st));
    trace.push(c); E.play(st, c);
  }
  return { st, trace };
}

test('the board and the opening: 8x8 and 6x6, both starts, black moves first', () => {
  for (const n of [6, 8]) for (const start of ['std', 'par']) {
    const st = E.create({ n, start });
    eq(st.b.length, n * n); eq(st.turn, 1); const c = E.counts(st); eq(c.b, 2); eq(c.w, 2); eq(c.e, n * n - 4);
    ok(E.legal(st).length === 4, n + start + ': 4 opening moves');
  }
  deq(E.legal(E.create({})).map(c => E.name(c)), ['d3', 'c4', 'f5', 'e6'], 'standard opening moves for black');
  deq(E.legal(E.create({ start: 'par' })).map(c => E.name(c)), ['c6', 'd6', 'e6', 'f6'], 'parallel start: black plays on the 6th rank')
  eq(E.create({ n: 7 }).n, 8, 'unknown sizes become 8');
});

test('names: a1 is the top-left, h8 the bottom-right, round trip', () => {
  eq(E.name(0), 'a1'); eq(E.name(63), 'h8'); eq(E.name(19), 'd3'); eq(E.name(35, 6), 'f6'); eq(E.name(-1), 'pass');
  for (let c = 0; c < 64; c++) eq(E.parse(E.name(c)), c);
  for (let c = 0; c < 36; c++) eq(E.parse(E.name(c, 6), 6), c);
  eq(E.parse('i9'), -1); eq(E.parse('g1', 6), -1);
});

test('legal moves (perft) match the well-known counts: 4, 12, 56, 244, 1396, 8200, 55092', () => {
  const perft = (st, d) => { if (!d || st.over) return 1; let t = 0; for (const c of E.legal(st)) { const s = E.clone(st); E.play(s, c); t += perft(s, d - 1); } return t; };
  const want = [4, 12, 56, 244, 1396, 8200, 55092];
  want.forEach((w, i) => eq(perft(E.create({}), i + 1), w, 'perft ' + (i + 1)));
});

test('legal moves and flips agree with a slow, separately written rule on thousands of positions (8x8 and 6x6, both starts)', () => {
  let checked = 0;
  for (const [n, start] of [[8, 'std'], [8, 'par'], [6, 'std'], [6, 'par']]) for (let seed = 1; seed <= 30; seed++) {
    const rnd = E.rng(seed * 31 + n), st = E.create({ n, start });
    while (!st.over) {
      const b = grid(st), mine = E.legal(st), slow = slowMoves(b, n, st.turn).map(([r, c]) => r * n + c);
      deq(mine, slow.slice().sort((a, c) => a - c), 'legal ' + n + start + seed);
      for (const c of mine) { const f = slowFlips(b, n, Math.floor(c / n), c % n, st.turn).map(([r, cc]) => r * n + cc).sort((a, d) => a - d); deq(E.flipsOf(st, c).slice().sort((a, d) => a - d), f, 'flips'); checked++; }
      E.play(st, mine[Math.floor(rnd() * mine.length)]);
    }
  }
  ok(checked > 3000, 'checked ' + checked);
});

test('flips in several directions at once, and stones that are not between two of yours stay', () => {
  // x plays the centre: flips the o's to the left, up and on the diagonal; the lone o on the right (no x behind it) stays
  const st = customState(6, [
    'x.....',
    '.o..o.',
    'xo.o..',
    '.....x',
    '......',
    '......'], 1);
  // x at (2,2)? neighbours: left (2,1)=o then (2,0)=x ✓; up (1,2)='.'; up-left (1,1)=o then (0,0)=x ✓; right (2,3)=o then (2,4)='.' ✗
  const f = E.flipsOf(st, 2 * 6 + 2).sort((a, b) => a - b);
  deq(f, [1 * 6 + 1, 2 * 6 + 1], 'two directions flip, the right side does not');
  const ev = E.play(st, 2 * 6 + 2);
  eq(ev[0].t, 'mv'); deq(ev[0].fl.slice().sort((a, b) => a - b), [7, 13]); eq(st.b[2 * 6 + 3], 2, 'the o on the right stayed');
  eq(E.play(st, 2 * 6 + 2), null, 'an occupied square is refused');
});

test('illegal moves are refused and change nothing', () => {
  const st = E.create({}), before = JSON.stringify(st);
  for (const c of [0, 27, 28, 63, -1, 64, 1.5, NaN, undefined, 'a1']) eq(E.play(st, c), null, 'refused ' + c);
  eq(JSON.stringify(st), before, 'unchanged');
});

test('a pass: the other side has no move, so the same side plays again (and it is recorded)', () => {
  let passes = 0, recorded = 0;
  for (let seed = 1; seed <= 300; seed++) {
    const rnd = E.rng(seed), s = E.create({ n: seed % 2 ? 6 : 8, start: seed % 5 ? 'std' : 'par' });
    while (!s.over) {
      const mv = E.legal(s), who = s.turn, c = mv[Math.floor(rnd() * mv.length)], ev = E.play(s, c);
      const pa = ev.find(e => e.t === 'pa');
      if (pa) {
        passes++; eq(pa.k, 3 - who, 'the one who passed is the other side'); eq(s.turn, who, 'the mover plays again');
        eq(E.legalFor(s, 3 - who).length, 0, 'the passer really had no move'); ok(E.legal(s).length > 0, 'and the mover has one');
        deq(s.moves[s.moves.length - 1], [-1, 3 - who], 'the pass is recorded in the move list'); recorded++;
      } else if (!s.over) ok(E.legal(s).length > 0 && s.turn === 3 - who, 'no pass: the other side moves');
    }
  }
  ok(passes >= 20 && recorded === passes, 'passes happen in random games: ' + passes);
});

test('the game ends when neither side can move: full board, or empties left (a wipe-out)', () => {
  const st = customState(6, [
    'ox....',
    '......',
    '......',
    '......',
    '......',
    '......'], 2);
  ok(E.legal(st).includes(2), 'white flanks the x with c1');
  const ev = E.play(st, 2);
  ok(ev.some(e => e.t === 'end') && st.over, 'wipe-out: black has no stones, nobody can move');
  const r = E.result(st); eq(r.winner, 2); eq(r.b, 0); eq(r.w, 3);
  eq(E.play(st, 5), null, 'no moves after the end'); eq(E.legal(st).length, 0);
  // full boards: all CPU games end with b+w+e = n*n and the result agrees
  for (let seed = 1; seed <= 20; seed++) {
    const { st: g } = playGame({ n: seed % 2 ? 6 : 8, start: seed % 3 ? 'std' : 'par', levels: { 1: 1, 2: 2 } });
    const c = E.counts(g); eq(c.b + c.w + c.e, g.n * g.n);
    const rs = E.result(g); eq(rs.winner, rs.b > rs.w ? 1 : rs.b < rs.w ? 2 : 0);
    eq(g.moves.filter(m => m[0] >= 0).length, c.b + c.w - 4, 'one stone per real move');
  }
  const draw = customState(6, ['xxxooo', '......', '......', '......', '......', '......'], 1); draw.over = true;
  eq(E.result(draw).winner, 0, 'a draw');
});

test('every CPU level only plays legal moves, in whole games on every board (never stuck)', () => {
  let games = 0;
  for (const n of [6, 8]) for (const start of ['std', 'par']) for (let a = 1; a <= 3; a++) for (let b = 1; b <= 3; b++) { playGame({ n, start, levels: { 1: a, 2: b } }); games++; }
  for (const n of [6, 8]) { playGame({ n, seed: 3, levels: { 1: 4, 2: 1 } }); playGame({ n, seed: 4, levels: { 1: 2, 2: 4 } }); games += 2; }
  ok(games >= 40, 'games ' + games);
  eq(E.cpu(E.create({}), 4) >= 0, true);
  const over = E.create({}); over.over = true; eq(E.cpu(over, 4), null, 'no move after the end');
});

test('deterministic: the same position and level give the same move; the same game twice is the same game; the state is JSON-safe', () => {
  for (const lv of [1, 2, 3, 4]) {
    const a = playGame({ n: 6, seed: 9, levels: { 1: lv, 2: lv === 4 ? 3 : lv } }), b = playGame({ n: 6, seed: 9, levels: { 1: lv, 2: lv === 4 ? 3 : lv } });
    deq(a.trace, b.trace, 'level ' + lv + ' twice');
    deq(JSON.parse(JSON.stringify(a.st)), a.st, 'JSON round trip');
  }
  const st = randomPos(5, 8, 30);
  for (const lv of [1, 2, 3, 4]) { const m = E.cpu(st, lv); for (let i = 0; i < 3; i++) eq(E.cpu(E.clone(st), lv), m, 'level ' + lv); }
  ok(!same(playGame({ n: 8, levels: { 1: 1, 2: 1 } }).trace, playGame({ n: 8, levels: { 1: 2, 2: 2 } }).trace), 'different levels play differently');
});

test('replay and rewind (undo): the moves list rebuilds the same position, passes included', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const { st } = playGame({ n: seed % 2 ? 6 : 8, start: seed % 4 ? 'std' : 'par', levels: { 1: 2, 2: 1 } });
    const re = E.replay(st.n, st.start, st.moves);
    deq(re, st, 'replay of the whole game');
    const half = Math.floor(st.moves.length / 2), part = E.rewind(st, half);
    eq(part.moves.length <= half + 1, true);
    deq(E.replay(st.n, st.start, part.moves), part, 'rewound state rebuilds itself');
    ok(!part.over || half >= st.moves.length - 1);
  }
  eq(E.replay(8, 'std', [[0, 1]]), null, 'an illegal list is refused');
});

test('the exact solver agrees with a plain full search written separately (8x8 and 6x6, with passes)', () => {
  let n8 = 0, n6 = 0;
  for (let seed = 1; seed <= 40; seed++) {
    for (const [n, emp] of [[8, 5 + (seed % 3)], [6, 7 + (seed % 3)]]) {
      const st = randomPos(seed * 13 + n, n, emp);
      if (st.over) continue;
      const so = E.solve(st);
      eq(so.value, slowSolve(grid(st), n, st.turn, false) || 0, 'value ' + n + ' seed ' + seed);
      for (const c of E.legal(st)) {
        const b = grid(st), f = slowFlips(b, n, Math.floor(c / n), c % n, st.turn), nb = b.map(r => r.slice());
        nb[Math.floor(c / n)][c % n] = st.turn; f.forEach(([r, cc]) => { nb[r][cc] = st.turn; });
        eq(so.values[c], (-slowSolve(nb, n, 3 - st.turn, false)) || 0, 'move value ' + E.name(c, n));
      }
      deq(so.best, E.legal(st).filter(c => so.values[c] === so.value), 'best set');
      if (n === 8) n8++; else n6++;
    }
  }
  ok(n8 > 30 && n6 > 30, 'positions ' + n8 + '/' + n6);
});

test('solver on hand-made endgames', () => {
  // one empty square: the value is exactly the final disc difference after the only move
  const one = customState(6, [
    'xxxxxx', 'xxxxxx', 'xxxxxx', 'xxxxxx', 'xxxxxx', 'xxxxx.'], 1);
  eq(E.legal(one).length, 0, 'x cannot move here'); one.turn = 2;
  eq(E.legal(one).length, 0);
  eq(E.finalDiff(E.geo(6), Int8Array.from(one.b), 1), 35 + 1, 'x wins 35 discs; the empty goes to the winner');
  // the last move flips three and ends the game with one empty square left: the empty square goes to the winner (35 + 1)
  const flip = customState(6, [
    'xxxxxx', 'xxxxxx', 'xxxxxx', 'xxxxxx', 'xxxxxx', 'xooo..'], 1);
  deq(E.legal(flip), [34], 'x plays e6');
  const sf = E.solve(flip); eq(sf.value, 36); deq(sf.best, [34]);
  const ev = E.play(flip, 34); ok(ev.some(e => e.t === 'end') && flip.over, 'no one can move: over'); eq(E.result(flip).b, 35);
  const sw = customState(6, [
    'oooooo', 'oooooo', 'oooooo', 'oooooo', 'oooooo', 'oooox.'], 2);
  deq(E.legal(sw), [35], 'o plays the corner, flipping x');
  const so = E.solve(sw); eq(so.value, 36, 'o takes all 36'); deq(so.best, [35]);
  // a position where the better move loses the corner fight: values are all exact integers with the right parity (n*n even → differences even)
  for (let seed = 1; seed <= 20; seed++) { const st = randomPos(seed + 900, 8, 9), r = E.solve(st); for (const c of E.legal(st)) eq(Math.abs(r.values[c]) % 2, 0, 'even differences'); }
});

test('the level-4 CPU plays the exact best move once the end can be read out, and the hint says so', () => {
  let seen = 0;
  for (let seed = 1; seed <= 12; seed++) {
    const st = randomPos(seed * 7, 8, E.SOLVE_AT[8] - (seed % 3));
    if (st.over) continue;
    const so = E.solve(st), c = E.cpu(st, 4), h = E.best(st, 4);
    ok(so.best.includes(c), 'cpu move is a best move: ' + E.name(c) + ' in ' + so.best.map(x => E.name(x)).join());
    ok(h.exact && so.best.includes(h.cell) && h.v === so.value, 'hint is exact');
    seen++;
  }
  ok(seen >= 10);
  const early = E.create({}), hint = E.best(early, 4);
  ok(!hint.exact && E.legal(early).includes(hint.cell), 'an opening hint is a legal move and not claimed to be proven');
  eq(E.best(Object.assign(E.create({}), { over: true }), 4), null);
});

test('strength order: level 4 beats 1, 3 beats 1, 2 beats 1 (colours swapped); 4 beats 3 more often than not', () => {
  const wins = (hi, lo, n, games) => { let w = 0, d = 0; for (let i = 0; i < games; i++) { const hiBlack = i % 2 === 0, start = i % 4 < 2 ? 'std' : 'par'; const { st } = playGame({ n, start, seed: i + 1, levels: hiBlack ? { 1: hi, 2: lo } : { 1: lo, 2: hi } }); const r = E.result(st); if (r.winner === (hiBlack ? 1 : 2)) w++; else if (!r.winner) d++; } return w + d / 2; };
  ok(wins(4, 1, 8, 6) >= 5, 'level 4 vs 1 (8x8)');
  ok(wins(3, 1, 8, 8) >= 7, 'level 3 vs 1 (8x8)');
  ok(wins(2, 1, 8, 16) >= 10, 'level 2 vs 1 (8x8)');
  ok(wins(4, 1, 6, 4) >= 3, 'level 4 vs 1 (6x6)');
  ok(wins(4, 3, 8, 4) >= 3, 'level 4 vs 3 (8x8)');
});

test('the daily puzzles: 120 positions, five tiers (easier first); every best move is proven by the exact solver and by a plain search', () => {
  const L = BANK.list;
  eq(L.length, 120); eq(BANK.tiers, 5);
  let slowChecked = 0;
  L.forEach((p, i) => {
    eq(p.b.length, 64); ok([1, 2].includes(p.k));
    const st = E.fromPuzzle(p);
    eq(E.counts(st).e, p.e, 'empties of puzzle ' + i);
    eq(p.e, 8 + Math.floor(i / 24), 'tier by empties');
    const moves = E.legal(st); deq(moves, p.m.map(x => x[0]).sort((a, b) => a - b), 'the stored moves are the legal moves');
    ok(moves.length >= 3, 'three or more moves');
    const so = E.solve(st);
    for (const [c, v] of p.m) eq(so.values[c], v, 'puzzle ' + i + ' ' + E.name(c));
    eq(so.best.length, 1, 'exactly one best move in puzzle ' + i);
    const vs = p.m.map(x => x[1]).sort((a, b) => b - a); ok(vs[0] - vs[1] >= 2, 'the best move is better than the others by 2 or more');
    // the plain search (no pruning) for the easiest tier (8 empties)
    if (p.e <= 8) { for (const [c, v] of p.m) { const b = grid(st), f = slowFlips(b, 8, Math.floor(c / 8), c % 8, p.k), nb = b.map(r => r.slice()); nb[Math.floor(c / 8)][c % 8] = p.k; f.forEach(([r, cc]) => { nb[r][cc] = p.k; }); eq((-slowSolve(nb, 8, 3 - p.k, false)) || 0, v, 'plain search ' + i); } slowChecked++; }
  });
  ok(slowChecked === 24, 'plain search ran on ' + slowChecked);
  eq(new Set(L.map(p => p.b + p.k)).size, 120, 'no duplicates');
});

test('daily set: five puzzles, one per tier, the same for the same seed', () => {
  const a = E.dailySet(12345, BANK), b = E.dailySet(12345, BANK), c = E.dailySet(54321, BANK);
  eq(a.length, 5); deq(a, b); ok(!same(a, c), 'another day, other puzzles');
  a.forEach((i, t) => eq(Math.floor(i / 24), t, 'tier ' + t));
  eq(E.dailySet(1, { list: [] }).length, 0);
  eq(E.puzzlePoints(10, 10), 200); eq(E.puzzlePoints(10, 8), 130); eq(E.puzzlePoints(10, -20), 0);
  const days = new Set(); for (let s = 0; s < 40; s++) days.add(E.dailySet(s * 977, BANK).join()); ok(days.size > 30, 'many different days');
});

run();
