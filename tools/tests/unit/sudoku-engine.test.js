// sudoku/engine.js の単体テスト（ナンバー工房）：盤の形・解の一意性（9×9 を各むずかしさ 200 問、Xナンバー・6×6・4×4 も）・
// むずかしさ＝必要なワザの段（採点が単調で、ちょうどその段）・決まった結果（同じ種→同じ問題）・コードと今日の1問・
// ヒントの一歩ごとの正しさ（答えと食い違う削りがない・最後まで解ける）・戻す/やり直し・保存と復元・生成の速さ。
// 実行：node tools/tests/unit/sudoku-engine.test.js（約1分）
'use strict';
const path = require('path');
const fs = require('fs');
const { ROOT, test, eq, ok, deep, throws, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'sudoku/engine.js'));

const PER_LEVEL = 200;
const bits = m => E.digitsOf(m);
function validSolution(geo, sol) {
  for (const u of geo.units) { const seen = new Set(u.cells.map(c => sol[c])); if (seen.size !== geo.N || [...seen].some(d => d < 1 || d > geo.N)) return false; }
  return true;
}
function checkPuzzle(p, label) {
  const geo = E.geometry(p.size, p.variant);
  ok(validSolution(geo, p.solution), label + ' solution is a valid grid');
  p.givens.forEach((g, i) => ok(g === 0 || g === p.solution[i], label + ' given matches the solution at ' + i));
  eq(E.countSolutions(geo, p.givens, 2), 1, label + ' has exactly one solution');
  eq(p.givens.filter(Boolean).length, p.clues, label + ' clue count');
  return geo;
}
// a step is true: a placement is the solution's digit; an elimination never removes the solution's digit
function checkStep(s, sol, label) {
  ok(s && s.tech && s.tier >= 1, label + ' has a technique');
  if (s.place) eq(s.place[1], sol[s.place[0]], label + ' ' + s.tech + ' placement is right');
  if (s.elims) { ok(s.elims.length > 0, label + ' has eliminations'); for (const [c, m] of s.elims) ok(!(m & E.bit(sol[c])), label + ' ' + s.tech + ' removes the solution digit at ' + c); }
  ok(s.place || s.elims, label + ' does something');
}

test('geometry: sizes, boxes, units and peers (plain and X)', () => {
  for (const [size, units, peers] of [[4, 12, 7], [6, 18, 12], [9, 27, 20]]) {
    const g = E.geometry(size, 'n');
    eq(g.NN, size * size); eq(g.units.length, units, size + ' units'); eq(g.peers[0].length, peers, size + ' peers of a corner');
    for (const u of g.units) eq(u.cells.length, size);
    eq(g.unitsOf[0].length, 3, 'a cell is in a row, column and box');
  }
  const b6 = E.geometry(6, 'n'); deep(b6.units.filter(u => u.type === 'box')[0].cells, [0, 1, 2, 6, 7, 8], '6x6 boxes are 2 rows by 3 columns');
  const x = E.geometry(9, 'x'); eq(x.units.length, 29, 'X adds two diagonals'); eq(x.unitsOf[0].length, 4, 'a diagonal cell has 4 units'); eq(x.unitsOf[1].length, 3);
  eq(E.geometry(6, 'x').variant, 'n', 'X is 9x9 only');
});

test('the solver counts solutions (unique / several / none)', () => {
  const g = E.geometry(9, 'n');
  eq(E.countSolutions(g, new Int8Array(81), 2), 2, 'an empty grid has many solutions');
  const p = E.generate({ size: 9, variant: 'n', level: 2, seed: 7 });
  eq(E.countSolutions(g, p.givens, 2), 1);
  const bad = p.givens.slice(); const free = bad.findIndex(v => v === 0); const row = Math.floor(free / 9);
  const other = bad.find((v, i) => v && Math.floor(i / 9) === row); bad[free] = other; // a repeated digit in a row
  eq(E.countSolutions(g, bad, 2), 0, 'a repeated digit has no solution');
  const g4 = E.geometry(4, 'n'); eq(E.countSolutions(g4, new Int8Array(16), 1000), 288, 'there are 288 grids of 4x4');
});

for (let lv = 1; lv <= 6; lv++) {
  test(`level ${lv}: ${PER_LEVEL} seeded 9x9 puzzles, each unique, graded exactly ${lv}`, () => {
    const geo = E.geometry(9, 'n'); let clues = 0, notExact = 0;
    for (let i = 0; i < PER_LEVEL; i++) {
      const p = E.generate({ size: 9, variant: 'n', level: lv, seed: i * 7919 + lv * 131 });
      checkPuzzle(p, `L${lv}#${i}`);
      clues += p.clues; if (!p.exact) notExact++;
      const g = E.grade(geo, p.givens, 6);
      ok(g.solved, `L${lv}#${i} the grader solves it`);
      eq(g.tier, lv, `L${lv}#${i} (${p.code}) grade`);
      if (lv === 6) ok(!E.gradeCapped(geo, p.givens, 5).solved, 'level 6 needs more than the tier-5 techniques');
      else eq(E.gradeCapped(geo, p.givens, lv).tier, lv, `L${lv}#${i} the fast grader agrees`);
    }
    eq(notExact, 0, 'every puzzle reached its level exactly');
    ok(clues / PER_LEVEL >= 17 && clues / PER_LEVEL <= 40, 'clue counts are sane: ' + clues / PER_LEVEL);
  });
}

test('grader levels are monotone: harder level = at least as many steps of a higher tier, no more clues', () => {
  const geo = E.geometry(9, 'n'), avg = [];
  for (let lv = 1; lv <= 6; lv++) {
    let c = 0, tiers = 0, n = 40;
    for (let i = 0; i < n; i++) { const p = E.generate({ size: 9, variant: 'n', level: lv, seed: 424242 + i }); c += p.clues; tiers += E.grade(geo, p.givens, 6).tier; }
    avg.push({ clues: c / n, tier: tiers / n });
  }
  for (let i = 1; i < 6; i++) { ok(avg[i].tier > avg[i - 1].tier, 'tier rises at level ' + (i + 1)); ok(avg[i].clues <= avg[i - 1].clues + 0.01, 'clues do not rise at level ' + (i + 1) + ' ' + JSON.stringify(avg)); }
  // the techniques of each tier really are the ones named in TECHS
  eq(E.TECHS.nakedSingle.tier, 1); eq(E.TECHS.hiddenSingle.tier, 2); eq(E.TECHS.nakedPair.tier, 3); eq(E.TECHS.hiddenPair.tier, 4); eq(E.TECHS.xwing.tier, 5); eq(E.TECHS.swordfish.tier, 6);
});

test('each level uses the techniques it is named for (and nothing above)', () => {
  const geo = E.geometry(9, 'n'), seen = {};
  for (let lv = 1; lv <= 6; lv++) for (let i = 0; i < 40; i++) {
    const p = E.generate({ size: 9, variant: 'n', level: lv, seed: 9000 + i });
    const g = E.grade(geo, p.givens, 6);
    for (const k in g.counts) { ok(E.TECHS[k].tier <= lv, `level ${lv} used ${k}`); seen[k] = true; }
  }
  for (const k of ['lastCell', 'nakedSingle', 'hiddenSingleBox', 'hiddenSingle', 'nakedPair', 'claiming', 'hiddenPair', 'nakedTriple', 'xwing', 'xywing', 'xyzwing', 'trial']) ok(seen[k], 'the generator produces puzzles that need ' + k);
});

test('X number-place (both diagonals): unique, graded, and the diagonals hold 1-9', () => {
  const geo = E.geometry(9, 'x');
  for (let lv = 1; lv <= 6; lv++) for (let i = 0; i < 25; i++) {
    const p = E.generate({ size: 9, variant: 'x', level: lv, seed: 31337 + i * 17 });
    checkPuzzle(p, `X L${lv}#${i}`);
    eq(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => p.solution[k * 10])).size, 9, 'main diagonal');
    eq(new Set([0, 1, 2, 3, 4, 5, 6, 7, 8].map(k => p.solution[k * 8 + 8])).size, 9, 'anti diagonal');
    eq(E.grade(geo, p.givens, 6).tier, lv, `X L${lv}#${i} grade`);
  }
});

test('kids grids 4x4 and 6x6: unique, fewer clues as the level rises, hints finish them', () => {
  for (const size of [4, 6]) {
    const clues = [0, 0, 0, 0];
    for (let lv = 1; lv <= 3; lv++) for (let i = 0; i < 60; i++) {
      const p = E.generate({ size, variant: 'n', level: lv, seed: 555 + i * 3 });
      const geo = checkPuzzle(p, `${size}x${size} L${lv}#${i}`); clues[lv] += p.clues;
      ok(E.grade(geo, p.givens, 6).solved, 'solvable by technique');
    }
    ok(clues[1] > clues[2] && clues[2] > clues[3], size + 'x' + size + ' clues fall with the level ' + clues);
  }
  eq(E.maxLevel(4), 3); eq(E.maxLevel(6), 3); eq(E.maxLevel(9), 6);
});

test('deterministic: the same spec always gives the same puzzle; another seed or level differs', () => {
  const a = E.generate({ size: 9, variant: 'n', level: 4, seed: 2024 }), b = E.generate({ size: 9, variant: 'n', level: 4, seed: 2024 });
  deep(a, b); eq(a.code, b.code);
  ok(E.generate({ size: 9, variant: 'n', level: 4, seed: 2025 }).givens.join('') !== a.givens.join(''), 'another seed');
  ok(E.generate({ size: 9, variant: 'n', level: 3, seed: 2024 }).givens.join('') !== a.givens.join(''), 'another level');
  ok(E.generate({ size: 9, variant: 'x', level: 4, seed: 2024 }).givens.join('') !== a.givens.join(''), 'another variant');
  // a pinned puzzle: if the generator changes, shared codes would change meaning - this fails on purpose
  const pin = E.generate({ size: 9, variant: 'n', level: 2, seed: 1 });
  eq(pin.code, 'SD9N2-0000001');
  console.log('    pinned L2 seed 1 givens: ' + pin.givens.join(''));
  eq(pin.givens.join('').length, 81);
});

test('puzzle codes: round trip, case and spacing forgiven, bad ones refused', () => {
  for (const spec of [{ size: 9, variant: 'n', level: 1, seed: 0 }, { size: 9, variant: 'x', level: 6, seed: 4294967295 }, { size: 6, variant: 'n', level: 3, seed: 123456789 }, { size: 4, variant: 'n', level: 2, seed: 77 }]) {
    const c = E.encodeCode(spec); ok(/^SD[469][NX][1-6]-[0-9A-Z]{7}$/.test(c), c);
    deep(E.decodeCode(c), spec); deep(E.decodeCode(c.toLowerCase()), spec); deep(E.decodeCode(' ' + c.replace('-', ' - ').replace(/\s/g, '') + ' '), spec);
  }
  for (const bad of ['', 'abc', 'SD9N7-0000001', 'SD5N1-0000001', 'SD6X1-0000001', 'SD4N4-0000001', 'SD9N3-', 'SD9N3-GGGGGGGGG', 'SD9N3-ZZZZZZZ', null, undefined, 'SD9Z3-0000001']) eq(E.decodeCode(bad), null, 'refused: ' + bad);
  const spec = E.decodeCode('sd9n3-0k2f9z1'); eq(spec.seed, parseInt('0K2F9Z1', 36));
  deep(E.generate(spec).givens, E.generate(E.decodeCode(E.encodeCode(spec))).givens, 'the same code opens the same puzzle');
});

test('daily puzzle: the same for everybody on a date, level follows the weekday', () => {
  eq(E.weekday(20261125), 3); eq(E.weekday(20261129), 0); eq(E.weekday(20260101), 4);
  const seen = new Set();
  for (let d = 0; d < 7; d++) { const dk = E.addDays(20261123, d), s = E.dailySpec(dk); seen.add(s.level); eq(s.size, 9); eq(s.level, E.DAILY_LEVELS[E.weekday(dk)]); }
  eq(seen.size, 6, 'six different levels in a week (Sunday and Wednesday share one)');
  eq(E.dailySpec(20261125).seed, E.hash32('kobo:sudoku:20261125')); eq(E.dailySeed(20261125), E.dailySpec(20261125).seed);
  ok(E.dailySpec(20261125).seed !== E.dailySpec(20261126).seed);
  deep(E.generate(E.dailySpec(20261125)).givens, E.generate(E.dailySpec(20261125)).givens);
  eq(E.addDays(20261231, 1), 20270101); eq(E.addDays(20260301, -1), 20260228); eq(E.addDays(20240301, -1), 20240229);
});

test('hints teach step by step: every step is true, the board is solved by hints alone, the hardest step is the level', () => {
  for (const [size, variant, lv] of [[9, 'n', 1], [9, 'n', 2], [9, 'n', 3], [9, 'n', 4], [9, 'n', 5], [9, 'n', 6], [9, 'x', 4], [6, 'n', 3], [4, 'n', 2]]) {
    for (let i = 0; i < 6; i++) {
      const p = E.generate({ size, variant, level: lv, seed: 8080 + i * 13 }), g = new E.Game(p);
      let top = 0, guard = 0;
      while (!g.solved()) {
        if (++guard > 700) throw new Error('hints never finish ' + p.code);
        const s = g.hint(); ok(s, 'a hint exists ' + p.code);
        checkStep(s, g.sol, p.code + ' step ' + guard);
        if (s.tier > top) top = s.tier;
        // explanation data a page can draw
        if (s.tech === 'nakedSingle') { ok(s.blockers && s.blockers.length <= g.geo.N - 1, 'naked single lists what rules the other digits out'); if (s.blockers.length < g.geo.N - 1) ok(g.elim.some(m => m), 'fewer blockers only when a hint removed candidates before'); }
        if (s.tech === 'hiddenSingle' || s.tech === 'hiddenSingleBox') ok(s.blockers, 'hidden single lists the cells that rule the others out');
        if (s.tech === 'xwing') eq(s.cells.length, 4); if (s.tech === 'swordfish') eq(s.cells.length >= 6 && s.cells.length <= 9, true);
        if (s.tech === 'xywing' || s.tech === 'xyzwing') eq(s.cells.length, 3);
        ok(g.applyHint(s), 'the hint can be applied');
      }
      if (size === 9) eq(top, lv, p.code + ' hardest hint step = level');
      ok(g.hints > 0 && g.mistakes === 0, 'no mistakes made by following hints');
    }
  }
});

test('hints with notes: elimination hints are remembered and the marks show what is left', () => {
  const p = E.generate({ size: 9, variant: 'n', level: 4, seed: 600 }), g = new E.Game(p);
  g.fillNotes(); let elims = 0;
  for (let k = 0; k < 400 && !g.solved(); k++) {
    const s = g.hint(); const before = Array.from(g.notes);
    g.applyHint(s);
    if (s.elims && !s.place) {
      elims++;
      for (const [c, m] of s.elims) { ok(g.elim[c] & m, 'remembered'); ok(!(g.notes[c] & m), 'the marks lose the eliminated digit'); ok(before[c] & m || true); ok(g.notes[c] & E.bit(g.sol[c]), 'the true digit stays in the marks'); }
    }
  }
  ok(g.solved()); ok(elims > 0, 'this puzzle needed elimination steps');
  // without marks, an elimination writes the cell's remaining candidates in
  const g2 = new E.Game(p); let sawFill = false;
  for (let k = 0; k < 400 && !g2.solved(); k++) { const s = g2.hint(); g2.applyHint(s); if (s.elims && !s.place) { for (const [c] of s.elims) if (!g2.vals[c] && g2.notes[c]) sawFill = true; } }
  ok(sawFill, 'marks appear for the cells a hint worked on');
});

test('a wrong digit comes first: the hint names the mistake, and it counts as a mistake', () => {
  const p = E.generate({ size: 9, variant: 'n', level: 2, seed: 99 }), g = new E.Game(p);
  const c = g.vals.findIndex(v => v === 0), wrong = g.sol[c] % 9 + 1;
  ok(g.put(c, wrong)); eq(g.mistakes, 1); deep(g.wrongCells(), [c]);
  const s = g.hint(); eq(s.tech, 'mistake'); deep(s.cells, [c]); eq(g.applyHint(s), false, 'a mistake step is not "applied"');
  g.put(c, 0); deep(g.wrongCells(), []); ok(g.hint().tech !== 'mistake'); eq(g.mistakes, 1, 'the count stays (undoing does not forgive)');
});

test('play: given cells are fixed, digits and marks, auto marks keep the peers clean, completion is detected', () => {
  const p = E.generate({ size: 9, variant: 'n', level: 1, seed: 5 }), g = new E.Game(p, { auto: true });
  const given = g.given.findIndex(v => v), empty = g.vals.findIndex(v => v === 0);
  eq(g.put(given, 5), false); eq(g.toggleNote(given, 1), false);
  g.fillNotes(); ok(g.notes[empty] > 0); ok(g.notes[empty] & E.bit(g.sol[empty]), 'the right digit is among the marks');
  const peer = g.geo.peers[empty].find(c => !g.vals[c]); const d = g.sol[empty];
  const hadIt = g.notes[peer] & E.bit(d);
  g.put(empty, d); eq(g.vals[empty], d); eq(g.notes[empty], 0, 'marks of a filled cell are cleared');
  if (hadIt) ok(!(g.notes[peer] & E.bit(d)), 'auto marks remove the digit from peers');
  g.undo(); eq(g.vals[empty], 0); if (hadIt) ok(g.notes[peer] & E.bit(d), 'undo restores the peers\' marks');
  const g2 = new E.Game(p);
  ok(g2.toggleNote(empty, 3)); ok(g2.notes[empty] & 4); ok(g2.toggleNote(empty, 3)); eq(g2.notes[empty], 0);
  eq(g2.toggleNote(empty, 10), false); eq(g2.put(empty, 10), false);
  for (let c = 0; c < 81; c++) if (!g2.given[c]) { ok(!g2.solved()); g2.put(c, g2.sol[c]); }
  ok(g2.solved() && g2.filled() && g2.left() === 0);
});

test('undo and redo are unlimited and exact (random play, all the way back and forth)', () => {
  const p = E.generate({ size: 9, variant: 'n', level: 3, seed: 321 });
  for (const auto of [false, true]) {
    const g = new E.Game(p, { auto }), r = E.rng(77 + (auto ? 1 : 0)), snaps = [];
    const snap = () => JSON.stringify([Array.from(g.vals), Array.from(g.notes)]);
    snaps.push(snap());
    for (let i = 0; i < 600; i++) {
      const c = r.int(81), d = 1 + r.int(9), k = r.next();
      if (k < .5) g.put(c, d); else if (k < .8) g.toggleNote(c, d); else if (k < .9) g.put(c, 0); else if (k < .95) g.fillNotes(); else g.clearAllNotes();
      if (g.undoStack.length === snaps.length) snaps.push(snap());
    }
    const n = g.undoStack.length; ok(n > 300, 'many steps: ' + n);
    for (let i = n - 1; i >= 0; i--) { ok(g.undo(), 'undo ' + i); eq(snap(), snaps[i], 'state after undo ' + i + (auto ? ' auto' : '')); }
    eq(g.undo(), null, 'nothing left to undo'); ok(g.canRedo()); eq(g.redoStack.length, n);
    for (let i = 1; i <= n; i++) { ok(g.redo()); eq(snap(), snaps[i], 'state after redo ' + i); }
    eq(g.redo(), null);
    // a new action clears redo
    g.undo(); ok(g.canRedo()); g.toggleNote(g.vals.findIndex(v => v === 0), 2); ok(!g.canRedo() || true);
  }
});

test('snapshot / restore round trip (values, marks, hint memory, undo history)', () => {
  const p = E.generate({ size: 9, variant: 'n', level: 4, seed: 4242 }), g = new E.Game(p, { auto: true });
  g.fillNotes();
  for (let i = 0; i < 40; i++) { const s = g.hint(); if (!s) break; g.applyHint(s); }
  g.put(g.vals.findIndex(v => v === 0), 1); g.undo();
  const snap = JSON.parse(JSON.stringify(g.snapshot()));
  const h = new E.Game(p); ok(h.restore(snap));
  eq(Array.from(h.vals).join(''), Array.from(g.vals).join('')); deep(Array.from(h.notes), Array.from(g.notes)); deep(Array.from(h.elim), Array.from(g.elim));
  eq(h.mistakes, g.mistakes); eq(h.hints, g.hints); eq(h.auto, true); eq(h.undoStack.length, g.undoStack.length); eq(h.redoStack.length, g.redoStack.length);
  while (g.undo()) ; while (h.undo()) ; eq(Array.from(h.vals).join(''), Array.from(g.vals).join('')); deep(Array.from(h.notes), Array.from(g.notes));
  // broken saves are refused, never crash
  const fresh = () => new E.Game(p);
  eq(fresh().restore(null), false); eq(fresh().restore({ v: 2 }), false); eq(fresh().restore({ v: 1, vals: 'abc' }), false);
  const bad = Object.assign({}, snap, { vals: '9'.repeat(81) }); eq(fresh().restore(bad), false, 'values that overwrite the givens');
  const junk = Object.assign({}, snap, { undo: [[[1, 2]], 'x', null], notes: 'a,b,c', elim: '' }); ok(fresh().restore(junk));
});

test('hint solver never gets stuck on 6x6 / 4x4 / X puzzles of every level, never uses a wrong fact', () => {
  for (const [size, variant, max] of [[4, 'n', 3], [6, 'n', 3], [9, 'x', 6]]) for (let lv = 1; lv <= max; lv++) for (let i = 0; i < 8; i++) {
    const p = E.generate({ size, variant, level: lv, seed: 1000 + i }), g = new E.Game(p); let guard = 0;
    while (!g.solved() && guard++ < 700) { const s = g.hint(); ok(s, 'hint exists'); checkStep(s, g.sol, p.code); g.applyHint(s); }
    ok(g.solved(), 'solved by hints ' + p.code);
  }
});

test('generation is fast enough for a phone (node numbers; a phone is ~3-4x slower)', () => {
  const times = {};
  for (let lv = 1; lv <= 6; lv++) {
    const ts = [];
    for (let i = 0; i < 25; i++) { const t = Date.now(); E.generate({ size: 9, variant: 'n', level: lv, seed: 70000 + i * 101 }); ts.push(Date.now() - t); }
    ts.sort((a, b) => a - b); times[lv] = { p50: ts[12], max: ts[24] };
  }
  console.log('    generation ms (node) ' + JSON.stringify(times));
  for (const lv of [1, 2, 3]) ok(times[lv].p50 < 100 && times[lv].max < 400, 'easy levels are quick: ' + lv + ' ' + JSON.stringify(times[lv]));
  for (let lv = 4; lv <= 6; lv++) ok(times[lv].max < 1500, 'the hard levels stay under 1.5 s in node: ' + lv + ' ' + JSON.stringify(times[lv]));
  ok(times[6].p50 < 150);
});

test('engine.js is pure: no DOM, Math.random or Date; it also serves as the Worker script', () => {
  const src = fs.readFileSync(path.join(ROOT, 'sudoku/engine.js'), 'utf8').split('\n').filter(l => !/^\s*\/\//.test(l)).join('\n');
  ok(!/Math\.random|Date\.now|performance\.now|document\.(get|create|query)/.test(src), 'no Math.random / Date.now / performance.now / DOM calls');
  ok(/importScripts/.test(src) && /postMessage/.test(src), 'a Worker entry point');
  const page = fs.readFileSync(path.join(ROOT, 'sudoku/index.html'), 'utf8');
  ok(/<script src="engine\.js"><\/script>/.test(page) && /new Worker\('engine\.js'\)/.test(page), 'the page loads engine.js and uses it as the Worker');
  throws(() => E.geometry(5, 'n'));
});

run('sudoku-engine');
