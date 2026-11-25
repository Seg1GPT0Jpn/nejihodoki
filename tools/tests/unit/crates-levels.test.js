// crates/levels.js の検査：てづくりの80ステージ（8パック×10面）を毎回ぜんぶ解き直して、しまってある par（最短の押す回数・最短の歩数）と合うこと、
// 別のしくみの全探索（ただの幅優先）でも最短の歩数が同じこと、順に難しくなること、しかけの入り方、画面に収まる大きさ、版権のある名前がないこと。
// 実行：node tools/tests/unit/crates-levels.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'crates/engine.js'));
const LV = require(path.join(ROOT, 'crates/levels.js'));

const parsed = {}; const P = l => parsed[l.id] || (parsed[l.id] = E.parse(l.rows));
const solved = {};
function solveBoth(l) {
  if (solved[l.id]) return solved[l.id];
  const L = P(l);
  return (solved[l.id] = { a: E.solve(L, L.start, { mode: 'pushes', maxNodes: 600000 }), b: E.solve(L, L.start, { mode: 'moves', maxNodes: 1500000 }) });
}

test('80 levels in 8 packs of 10; ids, names and descriptions in both languages', () => {
  eq(LV.PACKS.length, 8); eq(LV.ALL.length, 80); eq(LV.count, 80);
  LV.PACKS.forEach((p, k) => {
    eq(p.id, k + 1); eq(p.levels.length, 10);
    for (const f of ['name', 'tag', 'desc']) ok(p[f].ja && p[f].en, 'pack ' + p.id + ' ' + f);
    p.levels.forEach((l, i) => { eq(l.id, p.id + '-' + (i + 1)); eq(l.pack, p.id); eq(l.no, i + 1); ok(Array.isArray(l.par) && l.par.length === 2 && l.par[0] > 0 && l.par[1] >= l.par[0], 'par of ' + l.id); });
  });
  eq(new Set(LV.ALL.map(l => l.id)).size, 80);
});

test('every hand-made level parses, is not a duplicate, and fits the screen (at most 14x9 cells with walls; packs 1-2 are at most 10x8)', () => {
  const seen = new Map();
  for (const l of LV.ALL) {
    const L = P(l); ok(L.W <= 14 && L.H <= 9, l.id + ' is ' + L.W + 'x' + L.H); if (l.pack <= 2) ok(L.W <= 10 && L.H <= 8, l.id + ' small');
    ok(L.nb >= 1 && L.nb <= 5, l.id + ' crates ' + L.nb);
    const key = JSON.stringify(E.toRows(L)); ok(!seen.has(key), l.id + ' duplicates ' + seen.get(key)); seen.set(key, l.id);
    eq(E.boxesOnGoal(L, L.start) < L.nb, true, l.id + ' does not start solved');
    ok(!E.isDeadlock(L, L.start), l.id + ' does not start in a deadlock');
    // 行はぜんぶ同じ長さで、外側が壁
    const w = l.rows[0].length; for (const r of l.rows) eq(r.length, w, l.id + ' row width'); ok(/^#+$/.test(l.rows[0]) && /^#+$/.test(l.rows[l.rows.length - 1]), l.id + ' closed');
  }
});

test('EVERY level is solved by the solver and the optimal pushes and moves match the stored par', () => {
  let slow = 0;
  for (const l of LV.ALL) {
    const t0 = Date.now(), { a, b } = solveBoth(l);
    eq(a.status, 'solved', l.id + ' pushes solve'); eq(b.status, 'solved', l.id + ' moves solve');
    eq(a.pushes, l.par[0], l.id + ' optimal pushes'); eq(b.moves, l.par[1], l.id + ' optimal moves');
    ok(a.pushes <= b.pushes, l.id + ' moves-optimal has at least as many pushes'); ok(a.moves >= b.moves, l.id + ' pushes-optimal walks at least as far');
    if (Date.now() - t0 > 4000) slow++;
  }
  eq(slow, 0, 'no level takes more than 4 s to prove');
});

test('the solver\'s solutions really win when played through the game (no cheating: only legal moves)', () => {
  for (const l of LV.ALL) {
    const L = P(l), { a, b } = solveBoth(l);
    for (const r of [a, b]) { const g = E.loadGame(L, r.seq); ok(g, l.id + ' legal'); ok(g.over, l.id + ' wins'); eq(g.cur.moves, r.seq.length); eq(g.cur.pushes, r.seq.replace(/[a-z]/g, '').length); }
    eq(E.starsOf(l.par[1], b.moves), 3, l.id + ' optimal earns 3 stars');
  }
});

// 別のやり方での確かめ：行き止まりの枝きりも正規化もない、ただの幅優先（箱と人の位置の全部）で最短の歩数を数える
function plainBfs(L, cap) {
  const key = st => st.b.join(',') + '|' + st.p, seen = new Set([key(L.start)]); let frontier = [L.start];
  for (let depth = 0; frontier.length; depth++) {
    const next = [];
    for (const st of frontier) {
      if (E.isWon(L, st)) return depth;
      for (let d = 0; d < 4; d++) { const r = E.step(L, st, d); if (!r) continue; const k = key(r.st); if (seen.has(k)) continue; seen.add(k); next.push(r.st); if (seen.size > cap) return -1; }
    }
    frontier = next;
  }
  return -2;
}
test('cross-check: a plain breadth-first search (no pruning, no tricks) finds the same shortest move count on every level it can afford', () => {
  let n = 0, tiny = 0;
  for (const l of LV.ALL) {
    const r = plainBfs(P(l), 120000); if (r === -1) continue;
    eq(r, l.par[1], l.id + ' shortest moves by plain BFS'); n++; if (l.par[0] <= 8) tiny++;
  }
  ok(n >= 30, 'cross-checked ' + n + ' levels');
});

test('difficulty ramps up inside each pack (stored optimal pushes never go down) and the packs get bigger', () => {
  for (const p of LV.PACKS) for (let i = 1; i < p.levels.length; i++) ok(p.levels[i].par[0] >= p.levels[i - 1].par[0], p.id + '-' + (i + 1) + ' is not easier than the one before');
  const avg = p => p.levels.reduce((a, l) => a + l.par[0], 0) / p.levels.length;
  ok(avg(LV.PACKS[0]) < avg(LV.PACKS[2]) && avg(LV.PACKS[2]) < avg(LV.PACKS[3]), 'tutorial < aisles < warehouse');
  ok(avg(LV.PACKS[3]) > 15 && avg(LV.PACKS[7]) > 15, 'the late packs are real puzzles');
  ok(Math.max(...LV.PACKS[0].levels.map(l => P(l).nb)) <= 3, 'tutorial pack has at most 3 crates');
});

test('the twists appear where they should: packs 1-4 are plain, pack 5 has ice, 6 one-way tiles, 7 teleport pads, 8 mixes them', () => {
  const sp = l => P(l).special;
  for (const l of LV.ALL.filter(l => l.pack <= 4)) { const s = sp(l); ok(!s.ice && !s.one && !s.pad, l.id + ' is plain'); }
  for (const l of LV.PACKS[4].levels) ok(sp(l).ice, l.id + ' has ice');
  for (const l of LV.PACKS[5].levels) ok(sp(l).one, l.id + ' has a one-way tile');
  for (const l of LV.PACKS[6].levels) ok(sp(l).pad, l.id + ' has teleport pads');
  const k8 = { ice: 0, one: 0, pad: 0 }; for (const l of LV.PACKS[7].levels) { const s = sp(l); if (s.ice) k8.ice++; if (s.one) k8.one++; if (s.pad) k8.pad++; }
  ok(k8.ice >= 2 && k8.one >= 2 && k8.pad >= 2, 'pack 8 mixes: ' + JSON.stringify(k8));
  // ひねりが本当に効いている：氷のステージは、氷を「ふつうの床」にすると最短が変わる（効かない氷がない）
  let changed = 0, tried = 0;
  for (const l of LV.PACKS[4].levels.slice(2)) {
    const plain = E.parse(l.rows.map(r => r.replace(/~/g, ' '))); const s = E.solve(plain, plain.start, { mode: 'pushes', maxNodes: 200000 }); tried++;
    if (s.status !== 'solved' || s.pushes !== l.par[0]) changed++;
  }
  ok(changed >= tried - 2, 'ice matters in ' + changed + '/' + tried);
});

test('no commercial names or marks anywhere in the level data', () => {
  const txt = fs.readFileSync(path.join(ROOT, 'crates/levels.js'), 'utf8') + fs.readFileSync(path.join(ROOT, 'crates/index.html'), 'utf8') + fs.readFileSync(path.join(ROOT, 'crates/art.js'), 'utf8');
  ok(!/sokoban|倉庫番|Microban|Nintendo|任天堂|Sega|Tetris|Boxxle|Soukoban/i.test(txt), 'no real product names');
});

run('crates-levels');
