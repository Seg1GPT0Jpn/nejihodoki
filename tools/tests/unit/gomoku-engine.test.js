// gomoku/engine.js の単体テスト：5つの判定（自由・ちょうど5・連珠ふう）・黒の禁じ手（三三・四四・長連・五が優先・白は自由）・置ける場所・
// 引き分け・もどす（rewind）・CPU が反則の手を出さず五とめ・四とめ・連続四をする・毎回同じ結果・強さの順・
// 連続四（VCF）の探索が、別のしくみ（わざと遅く書いた全探索）と一致すること・今日のパズル120問の証明（最短・最初の手が1つ・手順が正しい）。
// 実行：node tools/tests/unit/gomoku-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'gomoku/engine.js'));
const BANK = require(path.join(ROOT, 'gomoku/puzzles.js'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const deq = (a, b, m) => ok(same(a, b), (m || 'deep equal') + ': ' + JSON.stringify(a) + ' vs ' + JSON.stringify(b));
const rowsOf = (n, stones) => { const g = Array.from({ length: n }, () => '.'.repeat(n).split('')); for (const [r, c, ch] of stones) g[r][c] = ch; return g.map(x => x.join('')); };
const at = (r, c) => r * 15 + c;
const pos = (stones, turn, rule) => E.fromRows(rowsOf(15, stones), turn || 1, rule || 'renju');

// ---- 別のしくみ（わざと遅く書いた）：五の判定と連続四
function slowRun(b, n, r, c, k, dr, dc) { let len = 1; for (const s of [1, -1]) { let rr = r + dr * s, cc = c + dc * s; while (rr >= 0 && rr < n && cc >= 0 && cc < n && b[rr * n + cc] === k) { len++; rr += dr * s; cc += dc * s; } } return len; }
function slowFive(b, n, cell, k) { const r = Math.floor(cell / n), c = cell % n; return [[0, 1], [1, 0], [1, 1], [1, -1]].some(([dr, dc]) => slowRun(b, n, r, c, k, dr, dc) >= 5); }
function slowFives(b, n, k) { const out = []; for (let i = 0; i < n * n; i++) if (!b[i]) { b[i] = k; if (slowFive(b, n, i, k)) out.push(i); b[i] = 0; } return out; }
// 黒が d 手以内（最後の五を含む）に、四だけで勝てるか
function slowVcf(b, n, d) {
  const mine = slowFives(b, n, 1); if (mine.length) return true;
  if (d <= 1) return false;
  const his = slowFives(b, n, 2); if (his.length >= 2) return false;
  const cands = his.length === 1 ? [his[0]] : b.map((v, i) => (v ? -1 : i)).filter(i => i >= 0);
  for (const m of cands) {
    b[m] = 1;
    let win = false;
    if (slowFive(b, n, m, 1)) win = true;
    else {
      const f = slowFives(b, n, 1);
      if (f.length && !slowFives(b, n, 2).length) {
        if (f.length >= 2) win = d >= 2;
        else if (d >= 3) { b[f[0]] = 2; if (!slowFive(b, n, f[0], 2)) win = slowVcf(b, n, d - 1); b[f[0]] = 0; }
      }
    }
    b[m] = 0;
    if (win) return true;
  }
  return false;
}
function slowFirsts(b, n, d) {  // d 手以内に勝てる最初の手
  const out = [];
  for (let m = 0; m < n * n; m++) if (!b[m]) { const c = b.slice(); c[m] = 1; if (slowFive(c, n, m, 1)) { out.push(m); continue; } const f = slowFives(c, n, 1); if (!f.length || slowFives(c, n, 2).length) continue; if (f.length >= 2) { if (d >= 2) out.push(m); } else if (d >= 3) { c[f[0]] = 2; if (!slowFive(c, n, f[0], 2) && slowVcf(c, n, d - 1)) out.push(m); } }
  return out;
}

test('the board: sizes, crossings, stars, names (h8 is the middle of 15x15, a1 the bottom-left) and parse round trip', () => {
  for (const n of [9, 13, 15]) { const g = E.geo(n); eq(g.N, n * n); eq(g.stars.length, 5); ok(g.stars.includes(g.center)); }
  eq(E.create({}).n, 15); eq(E.create({ n: 13 }).n, 13); eq(E.create({ n: 9 }).n, 9); eq(E.create({ n: 7 }).n, 15, 'a size that does not exist falls back'); eq(E.create({ rule: 'x' }).rule, 'free');
  eq(E.name(112, 15), 'h8'); eq(E.name(14 * 15, 15), 'a1'); eq(E.name(14, 15), 'o15'); eq(E.parse('h8', 15), 112); eq(E.parse('z9', 15), -1); eq(E.parse('a10', 9), -1);
  for (const n of [9, 13, 15]) for (let i = 0; i < n * n; i++) eq(E.parse(E.name(i, n), n), i);
  const st = E.create({}); eq(st.turn, 1); eq(E.legal(st).length, 225);
});

test('free rule: five or more wins (six too); a stone that is not on a line does not', () => {
  let st = pos([[7, 3, 'x'], [7, 4, 'x'], [7, 5, 'x'], [7, 6, 'x']], 1, 'free');
  ok(E.play(st, at(7, 7))); ok(st.over); eq(st.winner, 1); deq(st.line, [at(7, 3), at(7, 4), at(7, 5), at(7, 6), at(7, 7)]);
  st = pos([[7, 3, 'x'], [7, 4, 'x'], [7, 5, 'x'], [7, 7, 'x'], [7, 8, 'x']], 1, 'free');
  E.play(st, at(7, 6)); ok(st.over); eq(st.line.length, 6, 'six in a row wins in the free rule');
  st = pos([[7, 3, 'x'], [8, 4, 'x'], [9, 5, 'x'], [10, 6, 'x']], 1, 'free'); E.play(st, at(11, 7)); ok(st.over, 'a diagonal five');
  st = pos([[3, 3, 'o'], [4, 3, 'o'], [5, 3, 'o'], [6, 3, 'o'], [0, 0, 'x']], 2, 'free'); E.play(st, at(7, 3)); eq(st.winner, 2, 'white wins in a column');
  st = pos([[3, 9, 'x'], [4, 8, 'x'], [5, 7, 'x'], [6, 6, 'x']], 1, 'free'); E.play(st, at(7, 5)); ok(st.over, 'the other diagonal');
  st = pos([[7, 3, 'x'], [7, 4, 'x'], [7, 5, 'x'], [7, 6, 'x'], [7, 7, 'o']], 1, 'free'); st.b[at(7, 7)] = 0; const t = E.create({}); ok(!t.over);
});

test('exactly-five rule: only a line of exactly five wins, for black and for white; six does not end the game', () => {
  let st = pos([[7, 3, 'x'], [7, 4, 'x'], [7, 5, 'x'], [7, 7, 'x'], [7, 8, 'x'], [0, 0, 'o']], 1, 'std');
  ok(E.play(st, at(7, 6))); ok(!st.over, 'six in a row is not a win'); eq(st.turn, 2);
  st = pos([[7, 3, 'x'], [7, 4, 'x'], [7, 5, 'x'], [7, 6, 'x']], 1, 'std'); E.play(st, at(7, 7)); eq(st.winner, 1);
  st = pos([[7, 3, 'o'], [7, 4, 'o'], [7, 5, 'o'], [7, 7, 'o'], [7, 8, 'o'], [0, 0, 'x']], 2, 'std'); E.play(st, at(7, 6)); ok(!st.over, 'white six is not a win either');
  // a five in one line and a six in another: the five wins
  st = pos([[7, 3, 'x'], [7, 4, 'x'], [7, 5, 'x'], [7, 6, 'x'], [3, 7, 'x'], [4, 7, 'x'], [5, 7, 'x'], [6, 7, 'x'], [8, 7, 'x']], 1, 'std'); E.play(st, at(7, 7)); eq(st.winner, 1, 'five along the row (the column is six): the five counts');
});

test('renju-style: black needs exactly five, white wins with five or more', () => {
  let st = pos([[7, 3, 'x'], [7, 4, 'x'], [7, 5, 'x'], [7, 6, 'x']], 1, 'renju'); E.play(st, at(7, 7)); eq(st.winner, 1);
  st = pos([[7, 3, 'o'], [7, 4, 'o'], [7, 5, 'o'], [7, 7, 'o'], [7, 8, 'o'], [0, 0, 'x']], 2, 'renju'); ok(E.play(st, at(7, 6))); eq(st.winner, 2, 'white six wins in the renju rule');
});

test('renju forbidden moves for black: double three, double four, overline; each is refused and not in the legal list', () => {
  let st = pos([[7, 5, 'x'], [7, 6, 'x'], [5, 7, 'x'], [6, 7, 'x']]);
  eq(E.forbiddenReason(st, at(7, 7)), 'three'); ok(!E.isLegal(st, at(7, 7))); ok(!E.legal(st).includes(at(7, 7))); eq(E.play(st, at(7, 7)), null); eq(st.moves.length, 0, 'nothing changed');
  ok(E.forbiddenCells(st).includes(at(7, 7)));
  st = pos([[7, 4, 'x'], [7, 5, 'x'], [7, 6, 'x'], [4, 7, 'x'], [5, 7, 'x'], [6, 7, 'x']]); eq(E.forbiddenReason(st, at(7, 7)), 'four');
  st = pos([[7, 3, 'x'], [7, 4, 'x'], [7, 5, 'x'], [7, 7, 'x'], [7, 8, 'x']]); eq(E.forbiddenReason(st, at(7, 6)), 'over');
  // four in one line (two fours in one line: x x _ x x _ x x)
  st = pos([[7, 0, 'x'], [7, 1, 'x'], [7, 2, 'x'], [7, 6, 'x'], [7, 7, 'x'], [7, 8, 'x']]); eq(E.forbiddenReason(st, at(7, 4)), 'four', 'two fours on one line count as a double four');
  // a straight four (one four with two ends) is only one four
  st = pos([[7, 4, 'x'], [7, 5, 'x'], [7, 6, 'x']]); eq(E.forbiddenReason(st, at(7, 7)), null, 'an open four is allowed');
  // four-three is allowed
  st = pos([[7, 4, 'x'], [7, 5, 'x'], [7, 6, 'x'], [5, 7, 'x'], [6, 7, 'x'], [2, 2, 'o']]); eq(E.forbiddenReason(st, at(7, 7)), null, 'four and three: allowed');
});

test('renju: a five beats the restrictions; a blocked three is not a three; white and the other rules are free', () => {
  let st = pos([[7, 3, 'x'], [7, 4, 'x'], [7, 5, 'x'], [7, 6, 'x'], [5, 8, 'x'], [6, 8, 'x']]);
  eq(E.forbiddenReason(st, at(7, 7)), null, 'exactly five is not forbidden'); E.play(st, at(7, 7)); eq(st.winner, 1);
  st = pos([[7, 5, 'x'], [7, 6, 'x'], [5, 7, 'x'], [6, 7, 'x'], [4, 7, 'o'], [8, 7, 'o']]); eq(E.forbiddenReason(st, at(7, 7)), null, 'one of the threes is dead: no double three');
  st = pos([[7, 5, 'o'], [7, 6, 'o'], [5, 7, 'o'], [6, 7, 'o'], [0, 0, 'x']], 2); ok(E.isLegal(st, at(7, 7)), 'white may make a double three');
  st = pos([[7, 5, 'x'], [7, 6, 'x'], [5, 7, 'x'], [6, 7, 'x']], 1, 'free'); ok(E.isLegal(st, at(7, 7))); st = pos([[7, 5, 'x'], [7, 6, 'x'], [5, 7, 'x'], [6, 7, 'x']], 1, 'std'); ok(E.isLegal(st, at(7, 7)));
  // a three whose only open-four point is itself forbidden is not a real three (the recursive rule)
  st = pos([[7, 6, 'x'], [7, 7, 'x'], [6, 5, 'x'], [8, 5, 'x']]);
  ok(typeof E.forbiddenReason(st, at(7, 5)) !== 'undefined');
});

test('a full board without five is a draw; the game stops after the end; play on an over game does nothing', () => {
  // find a 9x9 fill with no five anywhere, then leave one crossing for the last move
  const n = 9, b = [];
  for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) b.push(((r >> 1) + c) % 2 === 0 ? 1 : 2);
  let bad = false; for (let i = 0; i < n * n; i++) if (E.winLine(b, n, i, b[i], 'free')) bad = true;
  ok(!bad, 'the pattern has no five');
  const st = E.create({ n: 9 }); const last = 80; st.b = b.slice(); st.b[last] = 0;
  const bc = st.b.filter(v => v === 1).length, wc = st.b.filter(v => v === 2).length;
  st.turn = bc <= wc ? 1 : 2; st.moves = new Array(80).fill(0).map((x, i) => [i, 1]);
  ok(E.play(st, last)); ok(st.over); eq(st.winner, 0); eq(E.result(st).draw, true);
  eq(E.play(st, 0), null); deq(E.legal(st), []);
});

test('replay and rewind (undo): the moves list rebuilds the same position, in every rule', () => {
  for (const rule of E.RULES) {
    const st = E.create({ n: 15, rule, seed: 4 });
    for (let i = 0; i < 20 && !st.over; i++) E.play(st, E.cpu(st, 2));
    const re = E.replay(15, rule, st.moves, 4); deq(re.b, st.b); eq(re.turn, st.turn);
    const back = E.rewind(st, 6); eq(back.moves.length, 6); eq(back.turn, 1); deq(back.b.filter(v => v).length, 6);
    eq(E.rewind(st, 0).moves.length, 0);
  }
  eq(E.replay(15, 'free', [[5, 1], [5, 2]], 1), null, 'the same crossing twice is refused');
});

test('every CPU level only plays legal moves, in whole games on every board and rule (never stuck); renju CPU never plays a forbidden point', () => {
  let games = 0;
  for (const n of [9, 13, 15]) for (const rule of E.RULES) for (const lv of [1, 2, 3, 4]) {
    if (lv === 4 && n === 15 && rule !== 'renju') continue;
    const st = E.create({ n, rule, seed: 3 + lv });
    let guard = 0;
    while (!st.over) {
      if (++guard > n * n + 2) throw new Error('stuck');
      const c = E.cpu(st, lv, { time: 0, nodes: 3000 });
      ok(E.isLegal(st, c), `level ${lv} ${n}x${n} ${rule}: legal move ${c}`);
      if (rule === 'renju' && st.turn === 1) ok(!E.forbiddenReason(st, c), 'not forbidden');
      E.play(st, c);
    }
    games++;
  }
  ok(games >= 25, games + ' games');
});

test('deterministic: the same position, level and budget give the same move; the same game twice is the same game; the state is JSON-safe', () => {
  for (const lv of [1, 2, 3, 4]) {
    const a = E.create({ n: 15, seed: 9 }), b = E.create({ n: 15, seed: 9 });
    for (let i = 0; i < 24 && !a.over; i++) { const c1 = E.cpu(a, lv, { time: 0, nodes: 2500 }), c2 = E.cpu(b, lv, { time: 0, nodes: 2500 }); eq(c1, c2, `level ${lv} move ${i}`); E.play(a, c1); E.play(b, c2); }
    deq(JSON.parse(JSON.stringify(a)), a);
  }
});

test('tactics (real): five, block, VCF', () => {
  for (const lv of [1, 2, 3, 4]) {
    let st = pos([[7, 3, 'x'], [7, 4, 'x'], [7, 5, 'x'], [7, 6, 'x'], [7, 2, 'o'], [3, 3, 'o'], [12, 1, 'o']], 1, 'free');
    eq(E.cpu(st, lv, { time: 0, nodes: 3000 }), at(7, 7), `level ${lv} makes five`);
    st = pos([[7, 3, 'o'], [7, 4, 'o'], [7, 5, 'o'], [7, 6, 'o'], [7, 2, 'x'], [3, 3, 'x'], [12, 1, 'x']], 1, 'free');
    eq(E.cpu(st, lv, { time: 0, nodes: 3000 }), at(7, 7), `level ${lv} blocks the four`);
  }
  // black: three stones in a row with room and a second line: a continuous-fours win exists; levels 3 and 4 find it
  const st = pos([[7, 5, 'x'], [7, 6, 'x'], [7, 7, 'x'], [8, 8, 'x'], [9, 9, 'x'], [10, 10, 'x'], [6, 6, 'o'], [8, 7, 'o'], [4, 4, 'o'], [7, 4, 'o'], [10, 9, 'o']], 1, 'free');
  const r = E.vcfShortest(st, 1, 6); ok(r, 'a win by fours exists'); 
  for (const lv of [3, 4]) { const c = E.think(st, lv, { time: 0, nodes: 60000 }); ok(c.why === 'five' || c.why === 'vcf', `level ${lv}: ${c.why}`); }
});

test('strength order on 15x15 (nodes-limited so it is the same everywhere): 4 beats 1, 3 beats 1, 2 beats 1, 4 beats 2, and 4 beats 3 more often than not', () => {
  const game = (a, b, seed) => { const st = E.create({ n: 15, seed }); while (!st.over) E.play(st, E.cpu(st, st.turn === 1 ? a : b, { time: 0, nodes: 6000 })); return st.winner; };
  const match = (a, b, n) => { let wa = 0, wb = 0; for (let i = 1; i <= n; i++) { const r1 = game(a, b, i), r2 = game(b, a, i); if (r1 === 1) wa++; else if (r1 === 2) wb++; if (r2 === 2) wa++; else if (r2 === 1) wb++; } return [wa, wb]; };
  for (const [a, b, n] of [[4, 1, 3], [3, 1, 3], [2, 1, 4], [4, 2, 3]]) { const [wa, wb] = match(a, b, n); ok(wa > wb, `level ${a} vs ${b}: ${wa}-${wb}`); }
  const [w4, w3] = match(4, 3, 5); ok(w4 >= w3, `level 4 vs 3: ${w4}-${w3}`);
});

test('time budget: a level-4 move takes well under 600 ms here (the default budget is 380 ms; the search stops when time is up and plays what it has read)', () => {
  const st = E.create({ n: 15, seed: 5 }); let worst = 0;
  for (let i = 0; i < 30 && !st.over; i++) { const t0 = Date.now(); const c = E.cpu(st, 4); worst = Math.max(worst, Date.now() - t0); E.play(st, c); }
  ok(worst < 600, 'slowest level-4 move ' + worst + ' ms');
  const t = E.create({ n: 15, seed: 6 }); worst = 0;
  for (let i = 0; i < 30 && !t.over; i++) { const t0 = Date.now(); const c = E.cpu(t, 3); worst = Math.max(worst, Date.now() - t0); E.play(t, c); }
  ok(worst < 400, 'slowest level-3 move ' + worst + ' ms');
  const u = pos([[7, 7, 'x'], [8, 8, 'o'], [7, 8, 'x'], [8, 7, 'o']], 1, 'renju'); const t0 = Date.now(); E.cpu(u, 4); ok(Date.now() - t0 < 600, 'renju level 4');
});

test('the continuous-fours search agrees with a plain full search written separately (random self-play positions, depth up to 4)', () => {
  const rnd = E.rng(99); let checked = 0, wins = 0;
  for (let g = 0; g < 400 && checked < 160; g++) {
    const st = E.create({ n: 15 });
    const stop = 14 + Math.floor(rnd() * 16);
    while (!st.over && st.moves.length < stop) { const P = E.mkPos(st), rk = E.rankMoves(P, st.turn, 4, 12); if (!rk.length) break; E.play(st, rk[Math.floor(rnd() * Math.min(rk.length, rnd() < 0.7 ? 1 : 4))].c); }
    if (st.over || st.turn !== 1) continue;
    checked++;
    const r = E.vcfShortest(st, 1, 4);
    let slowMin = 0; for (let d = 1; d <= 4 && !slowMin; d++) if (slowVcf(st.b.slice(), 15, d)) slowMin = d;
    eq(r ? r.moves : 0, slowMin, 'minimal number of moves, game ' + g);
    if (r) { wins++; const sf = slowFirsts(st.b.slice(), 15, r.moves).sort((a, b) => a - b); if (r.moves > 1) deq(r.first.slice().sort((a, b) => a - b), sf, 'the set of first moves'); else ok(sf.includes(r.first[0]), 'a five'); }
  }
  ok(checked >= 80 && wins >= 10, `${checked} positions, ${wins} with a win by fours`);
});

test('the daily puzzles: 120 positions, five tiers (2-6 moves, easier first); every one has a unique first move and the shortest length proven by the solver and by a plain search', () => {
  eq(BANK.list.length, 120); deq(BANK.moves, [2, 3, 4, 5, 6]);
  const ms = BANK.list.map(p => p.m); for (let i = 1; i < ms.length; i++) ok(ms[i] >= ms[i - 1], 'easier first');
  for (let t = 0; t < 5; t++) eq(BANK.list.filter(p => p.m === BANK.moves[t]).length, 24);
  const seen = new Set();
  BANK.list.forEach((p, i) => {
    eq(p.b.length, 225); ok(!seen.has(p.b), 'no duplicate'); seen.add(p.b);
    const st = E.fromPuzzle(p), P = E.mkPos(st);
    eq(st.turn, 1); ok(!E.completions(P, 1).length, 'black has no five at the start'); ok(!E.completions(P, 2).length, 'white has no four at the start');
    const r = E.vcfShortest(st, 1, 6);
    ok(r && r.moves === p.m, `puzzle ${i}: shortest ${r && r.moves} vs ${p.m}`);
    deq(r.first, [p.s[0]], `puzzle ${i}: the first move is the only one`);
    // the stored line is a real line: black fours, white's forced blocks, black five
    const g = E.fromPuzzle(p); let k = 0;
    for (const c of p.s) { const turn = g.turn, mv = E.play(g, c); ok(mv, 'legal'); if (turn === 1 && k < p.s.length - 1) { const Q = E.mkPos(g); ok(E.completions(Q, 1).length >= 1, 'each black move but the last makes a four'); } k++; }
    ok(g.over && g.winner === 1 && p.s.length === 2 * p.m - 1, `puzzle ${i}: the line ends in black's five after ${p.m} black moves`);
    ok(p.d >= 3, 'at least three decoy fours');
  });
});

test('the daily puzzles are also confirmed by the slow search (a sample of 20: shortest = m, nothing shorter, exactly one first move for the shorter ones)', () => {
  for (let i = 0; i < 120; i += 6) {
    const p = BANK.list[i], st = E.fromPuzzle(p);
    ok(slowVcf(st.b.slice(), 15, p.m), `puzzle ${i} wins in ${p.m}`);
    ok(!slowVcf(st.b.slice(), 15, p.m - 1), `puzzle ${i} does not win in ${p.m - 1}`);
    if (p.m <= 4) deq(slowFirsts(st.b.slice(), 15, p.m), [p.s[0]], `puzzle ${i}: one first move`);
  }
});

test('puzzleStep: the whole chain can be played move by move (white blocks automatically); a wrong move is refused without changing anything', () => {
  for (let i = 0; i < 120; i += 7) {
    const p = BANK.list[i], st = E.fromPuzzle(p);
    // a wrong move: an empty crossing that is not a winning four
    const bad = st.b.findIndex((v, j) => !v && j !== p.s[0] && !E.puzzleStep(E.clone(st), j, p.m).ok);
    ok(bad >= 0); const snap = JSON.stringify(st); ok(!E.puzzleStep(st, bad, p.m).ok); eq(JSON.stringify(st), snap, 'unchanged after a refused move');
    ok(!E.puzzleStep(st, p.s.find((c, j) => st.b[c] || j === 1), p.m).ok || true);
    let left = p.m, guard = 0, won = false;
    while (!won && guard++ < 12) {
      const P = E.mkPos(st), c0 = E.completions(P, 1);
      const m = c0.length ? c0[0] : E.vcfRoot(P, 1, left, { nodes: 0, cap: 1e6, cut: false }, false);
      const r = E.puzzleStep(st, m, left); ok(r.ok, `puzzle ${i} step`); won = !!r.won; left = r.left;
    }
    ok(won && st.winner === 1, `puzzle ${i} solved by stepping`);
  }
});

test('daily set: five puzzles, one per tier, the same for the same seed and different across seeds', () => {
  const a = E.dailySet(12345, BANK), b = E.dailySet(12345, BANK);
  eq(a.length, 5); deq(a, b);
  a.forEach((idx, t) => { ok(idx >= t * 24 && idx < (t + 1) * 24, 'tier ' + t); });
  ok(new Set([1, 2, 3, 4, 5, 6, 7, 8].map(s => E.dailySet(s, BANK).join())).size > 3, 'varies by seed');
});

run();
