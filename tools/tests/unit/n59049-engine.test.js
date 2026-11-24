// n59049/engine.js の単体テスト：合体の決まり・いし・種つき乱数・12ステージ（探索で全部★3まで解ける）・ラッシュ・保存（kusoge.n59049.x）
// 実行：node tools/tests/unit/n59049-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'n59049/engine.js'));

const mk = (list, stones) => { const c = new Array(27).fill(null); list.forEach(([i, e], k) => { c[i] = { e, id: k + 1 }; }); return c; };
const exps = c => c.map(t => (t ? t.e : 0));

test('slide: three equal tiles in a line merge into one (+1) at the far end; others just slide', () => {
  const c = mk([[0, 1], [1, 1], [2, 1]]); // x line (0,0,0)-(2,0,0)
  const r = E.slide(c, '+X');
  ok(r.changed); eq(r.gained, 9); eq(r.merges.length, 1); eq(r.cells[2].e, 2); eq(r.cells.filter(Boolean).length, 1);
  const r2 = E.slide(mk([[0, 1], [1, 2]]), '+X'); deep(exps(r2.cells).slice(0, 3), [0, 1, 2]); eq(r2.gained, 0);
  eq(E.slide(mk([[0, 1], [1, 1], [2, 2]]), '+X').merges.length, 0, 'unequal: no merge');
  eq(E.slide(mk([[1, 1]]), '-X').cells[0].e, 1);
  ok(!E.slide(mk([[2, 1]]), '+X').changed, 'already at the end');
});

test('stones block tiles and break the line (no merge across or through a stone)', () => {
  const stones = new Array(27).fill(0); stones[1] = 1;
  const r = E.slide(mk([[0, 1], [2, 1]]), '+X', stones);
  eq(r.cells[0].e, 1); eq(r.cells[2].e, 1); eq(r.cells[1], null); ok(!r.changed, 'both are already at their ends of the segments');
  const r2 = E.slide(mk([[0, 1]]), '+X', stones); ok(!r2.changed); eq(r2.cells[0].e, 1);
  eq(E.slide(mk([[2, 1]]), '-X', stones).cells[2].e, 1, 'cannot pass the stone');
  const full = mk([[0, 1], [2, 1]]).concat([]); // a stone in the line means three never line up
  eq(E.slide(full, '+X', stones).merges.length, 0);
  const spawned = E.spawnPick(new Array(27).fill(null), stones, () => 0, 0.1); ok(spawned.i !== 1, 'a new number never lands on a stone');
});

test('seeded random: same seed same numbers; get/set rewinds', () => {
  const a = E.rng(5), b = E.rng(5);
  deep([a.next(), a.next(), a.next()], [b.next(), b.next(), b.next()]);
  const s = a.get(); const x = a.next(); a.set(s); eq(a.next(), x);
  const sim = E.newSim(E.STAGES[0]); const rs = sim.rng.get();
  const c = E.clone(sim); eq(c.rng.get(), rs);
});

test('12 stages: ids, worlds, goals, stones, par and start boards make sense', () => {
  eq(E.STAGE_N, 12); eq(E.PER_WORLD, 4); eq(E.WORLDS.length, 3);
  eq(new Set(E.STAGES.map(s => s.id)).size, 12);
  E.STAGES.forEach((s, i) => {
    eq(s.index, i); eq(s.world, (i / 4) | 0); ok(s.name, s.id + ' name'); ok(E.stageById(s.id) === s);
    eq(s.start.length, 27); ok(s.start.every(e => Number.isInteger(e) && e >= 0 && e <= 9), s.id + ' start');
    ok(s.stones.every(k => k >= 0 && k < 27 && s.start[k] === 0), s.id + ' no tile starts on a stone');
    ok(E.GOAL_KINDS.includes(s.goal.k) && s.goal.v > 0, s.id + ' goal');
    ok(s.par.length === 2 && s.par[0] < s.par[1] && s.par[1] < s.moves, s.id + ' par');
    ok(s.moves >= 10 && s.moves <= 200, s.id + ' moves');
    ok(!E.goalMet(s.goal, E.stat(E.newSim(s))), s.id + ' is not won at the start');
    if (s.world === 0) eq(s.stones.length, 0, s.id + ' world 1 has no stones'); else ok(s.stones.length >= 1, s.id + ' stones');
  });
  ok(E.STAGES[11].moves > E.STAGES[0].moves);
});

test('the planner solves every stage and reaches 3 stars (the spawns are seeded, so the plan is exact)', () => {
  for (const s of E.STAGES) {
    const p = E.solveStage(s, { width: 40 });
    ok(p.won, s.id + ' solved');
    const sim = E.newSim(s); p.path.forEach(d => ok(E.step(sim, d), s.id + ' every planned move moves'));
    ok(sim.won && E.starsFor(s, true, sim.left) === 3, s.id + ' 3 stars, left ' + sim.left);
  }
});

test('the bot plays whole stages and the rush; a different seed changes a rush but not a stage', () => {
  const b = E.botPlay(E.STAGES[3]); ok(b.won);
  const r1 = E.botPlay(E.RUSH, { seed: 1 }), r2 = E.botPlay(E.RUSH, { seed: 2 });
  eq(r1.moves, 60); ok(r1.over && r1.score > 100); ok(r1.score !== r2.score || exps(r1.cells).join() !== exps(r2.cells).join());
  const a = E.botPlay(E.STAGES[0]), c = E.botPlay(E.STAGES[0]); eq(a.score, c.score); eq(a.left, c.left);
});

test('goals, progress and stars', () => {
  const st = (o) => Object.assign({ score: 0, merges: 0, maxE: 0, cnt: 0, top2: 0 }, o);
  ok(E.goalMet({ k: 'tile', v: 3 }, st({ maxE: 3 })) && !E.goalMet({ k: 'tile', v: 3 }, st({ maxE: 2 })));
  ok(E.goalMet({ k: 'score', v: 100 }, st({ score: 100 })) && E.goalMet({ k: 'merges', v: 2 }, st({ merges: 2 })));
  ok(E.goalMet({ k: 'two', v: 3 }, st({ cnt: 2, top2: 3 })) && !E.goalMet({ k: 'two', v: 3 }, st({ cnt: 2, top2: 2 })));
  const sim = E.newSim(E.STAGES[0]); const p0 = E.progress(E.STAGES[0].goal, sim); ok(p0 > 0 && p0 < 1);
  const s = E.STAGES[0];
  eq(E.starsFor(s, false, 99), 0); eq(E.starsFor(s, true, 0), 1); eq(E.starsFor(s, true, s.par[0]), 2); eq(E.starsFor(s, true, s.par[1]), 3);
});

test('x save: a broken or odd file loads as much as it can; records only improve; stages unlock in order', () => {
  eq(E.totalStars(E.loadX('{broken')), 0); eq(E.totalStars(E.loadX(null)), 0);
  const x = E.loadX(JSON.stringify({ v: 1, s: [3, 2, 'x', 9, -1, 1], r: 'oops', c: 99 }));
  deep(x.s.slice(0, 6), [3, 2, 0, 0, 0, 1]); eq(x.r, 0); eq(x.c, 0); eq(x.s.length, 12);
  ok(E.unlocked(x, 0) && E.unlocked(x, 1) && E.unlocked(x, 2) && !E.unlocked(x, 3) && E.unlocked(x, 6) && !E.unlocked(x, 7));
  ok(E.recordStage(x, 2, 1) && x.s[2] === 1 && !E.recordStage(x, 2, 1) && !E.recordStage(x, 0, 2) && x.s[0] === 3);
  ok(E.recordRush(x, 400) && !E.recordRush(x, 300) && x.r === 400);
  const y = E.loadX(E.writeX(x)); deep(y.s, x.s); eq(y.r, 400);
  eq(E.loadX({ v: 1, s: [], r: 12.7 }).r, 12);
});

run();
