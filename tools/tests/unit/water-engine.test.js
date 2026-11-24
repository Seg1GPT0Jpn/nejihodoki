// water/engine.js の単体テスト（生成が前と同じこと、ルール、リプレイの検証、デイリー）と、water.save のマージ
// 実行：node tools/tests/unit/water-engine.test.js   （全 300 ステージを作るので 10 秒ほどかかる）
'use strict';
const path = require('path'), crypto = require('crypto');
const { ROOT, fresh, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'water/engine.js'));

// the original engine (water/index.html before P2-water) produced exactly these stages. Changing them changes everybody's stages.
const GOLDEN_1_300 = '206a50acc0f8de3071e6990c73ba9e4bba7611798b3477ad10b2cd97198a8cd0';
const GOLDEN_VS = '164e37b3925045cce81c230fb3a9d15305c1ec506d8866380680c0c12116dfc0'; // salt 123456789, levels 8, 11, … 80 (online battle)

test('levels 1–300 are the same puzzles as before the split', () => {
  const h = crypto.createHash('sha256');
  for (let L = 1; L <= 300; L++) { const p = E.generate(L); h.update(JSON.stringify([p.L, p.tubes, p.caps, p.locks, p.hid, p.moves, p.sol, p.trap])); }
  eq(h.digest('hex'), GOLDEN_1_300);
});
test('online-battle puzzles (salted) are the same as before', () => {
  const h = crypto.createHash('sha256');
  for (let L = 8; L <= 80; L += 3) { const p = E.generate(L, 123456789); h.update(JSON.stringify([p.L, p.tubes, p.caps, p.locks, p.hid, p.moves, p.sol])); }
  eq(h.digest('hex'), GOLDEN_VS);
});
test('every stage 1–300 is solved by its own solution (replay)', () => {
  for (let L = 1; L <= 300; L++) {
    const pz = E.generate(L), g = E.newGame(pz);
    for (const m of pz.sol) ok(E.pour(g, m[0], m[1]), 'L' + L + ' move ' + m);
    ok(E.won(g), 'L' + L + ' solved');
    const r = E.replay(pz, g.log);
    ok(r.ok && r.won && r.g.moves === pz.moves, 'L' + L + ' replay');
  }
});
test('rules: illegal pours, undo, extra tube, hints', () => {
  const pz = E.generate(30), g = E.newGame(pz);
  const before = JSON.stringify(g.tubes);
  eq(E.pour(g, 0, 0), null, 'same tube');
  eq(E.pour(g, 99, 0), null, 'out of range');
  const lockI = pz.locks.findIndex(n => n > 0);
  if (lockI >= 0) eq(E.canPour(g, lockI, pz.tubes.length - 1), 0, 'a locked tube cannot pour');
  const m = pz.sol[0];
  ok(E.pour(g, m[0], m[1]));
  ok(E.undo(g)); eq(JSON.stringify(g.tubes), before, 'undo restores');
  eq(g.undos, 1); eq(g.moves, 1); eq(g.history.length, 0);
  ok(E.addTube(g)); ok(!E.addTube(g), 'only one extra tube');
  ok(E.useHint(g) && E.useHint(g) && E.useHint(g)); ok(!E.useHint(g), 'three hints');
  eq(g.log, E.replay(pz, g.log).g.log);
  ok(!E.replay(pz, g.log + 'XX').ok, 'a second extra tube is rejected');
  ok(!E.replay(pz, 'zz').ok, 'nonsense is rejected');
});
test('hidden layers are revealed when they reach the top, also in a replay', () => {
  const pz = E.generate(12); ok(pz.hid.some(h => h.some(Boolean)), 'level 12 has ？');
  const g = E.newGame(pz);
  let revealed = 0;
  for (const m of pz.sol) {
    revealed += E.pour(g, m[0], m[1]).revealed.length;
    ok(g.tubes.every((t, i) => !t.length || !g.hid[i][t.length - 1]), 'the top layer is never hidden');
  }
  ok(revealed > 0, 'some layers were revealed');
  deep(E.replay(pz, g.log).g.hid, g.hid, 'a replay reveals the same layers');
});
test('daily: deterministic, three solvable puzzles, verify catches tampering', () => {
  const seed = 0x5eed1234 | 0;
  deep(E.daily(seed), E.daily(seed));
  const pzs = E.dailyPuzzles(seed);
  eq(pzs.length, 3); deep(pzs.map(p => p.L), E.DAILY_LEVELS);
  ok(E.daily(seed + 1).some((d, i) => d.salt !== E.daily(seed)[i].salt), 'another day, other puzzles');
  const logs = pzs.map(pz => { const g = E.newGame(pz); E.useHint(g); for (const m of pz.sol) E.pour(g, m[0], m[1]); return g.log; });
  const rep = E.encodeReplay({ seed, ms: 61500, logs });
  const v = E.verify(rep);
  const pours = pzs.reduce((a, p) => a + p.moves, 0);
  ok(v.ok, JSON.stringify(v)); eq(v.pours, pours); eq(v.hints, 3);
  eq(v.score, 100000 - (pours + 15) * 100 - 61);
  eq(v.score, E.dailyScore({ pours, hints: 3, extra: 0, ms: 61500 }));
  ok(!E.verify(rep.replace('|61500|', '|-1|')).ok, 'negative time');
  ok(!E.verify(['w1', seed, 1000, logs[0], logs[1]].join('|')).ok, 'a missing puzzle');
  ok(!E.verify(['w1', seed + 1, 1000].concat(logs).join('|')).ok, 'logs for another day');
  ok(!E.verify(['w1', seed, 1000, logs[0], logs[1], logs[2].slice(0, -2)].join('|')).ok, 'last puzzle not solved');
  eq(E.dailyScore({ pours: 5000, ms: 0 }), 1, 'never below 1');
});
test('undo keeps net moves for the daily score (restart = undo all)', () => {
  const pz = E.dailyPuzzles(7)[0], g = E.newGame(pz);
  E.pour(g, pz.sol[0][0], pz.sol[0][1]); E.undo(g);
  for (const m of pz.sol) E.pour(g, m[0], m[1]);
  eq(g.history.length, pz.moves); eq(g.moves, pz.moves + 1);
});
test('registry merge for kusoge.water.save never rolls progress back (R4)', () => {
  const { platform: P, games: R } = fresh();
  const rule = R.byId('water').sync['kusoge.water.save'];
  const m = P.merge.make(rule);
  const a = JSON.stringify({ level: 5, best: 9, stars: { 1: 3, 2: 1 } }), b = JSON.stringify({ level: 3, best: 7, stars: { 2: 3, 3: 2 } });
  const r1 = JSON.parse(m(a, b, { localT: 1000, remoteT: 2000 })), r2 = JSON.parse(m(b, a, { localT: 2000, remoteT: 1000 }));
  deep(r1, r2, 'same result on both devices');
  eq(r1.best, 9); eq(r1.level, 3, 'level = the newer device'); deep(r1.stars, { 1: 3, 2: 3, 3: 2 });
});

// ---- challenge stages and sprint (2026-11) ----
test('challenge: 12 stages in 3 shelves, each with a par, a limit and ★ thresholds in order', () => {
  eq(E.STAGE_N, 12); eq(E.STAGE_DEFS.length, 12); eq(E.WORLD_SIZE, 4);
  const seen = new Set();
  for (let i = 0; i < 12; i++) {
    const s = E.stageInfo(i), key = s.L + ':' + s.salt;
    ok(!seen.has(key), 'distinct puzzles'); seen.add(key);
    eq(s.world, Math.floor(i / 4)); eq(s.par, s.pz.moves); ok(s.pz.inBand, 'stage ' + (i + 1) + ' is in the target band');
    ok(s.par < s.star3 && s.star3 < s.star2 && s.star2 < s.limit, 'stage ' + (i + 1) + ' thresholds are ordered: ' + [s.par, s.star3, s.star2, s.limit]);
    ok(['none', 'noHint', 'noExtra', 'noTools'].includes(s.rule));
  }
  eq(E.stageInfo(12), null);
  ok(E.stageInfo(0).par < E.stageInfo(11).par, 'later shelves are longer');
  ok(E.stageInfo(8).pz.K === 5 && E.stageInfo(0).pz.K === 4, 'the third shelf uses 5-layer tubes');
  ok(E.stageInfo(4).pz.hid.some(h => h.some(Boolean)), 'stage 5 has ？ layers');
  ok(E.stageInfo(5).pz.locks.some(Boolean), 'stage 6 has a lock');
  ok(E.stageInfo(6).pz.caps.some(c => c > E.stageInfo(6).pz.K), 'stage 7 has a tall tube');
  eq(E.STAGE_DEFS.filter(d => d.rule !== 'none').length, 7);
});
test('challenge: the solver solution of every stage solves it in par moves = 3 stars', () => {
  for (let i = 0; i < 12; i++) {
    const s = E.stageInfo(i), g = E.newGame(s.pz);
    for (const m of s.pz.sol) ok(E.pour(g, m[0], m[1]), 'stage ' + (i + 1));
    ok(E.won(g)); eq(g.history.length, s.par); eq(E.stageStars(i, g.history.length), 3);
  }
});
test('challenge: stageStars by net moves (undo gives moves back), 0 beyond the limit', () => {
  const s = E.stageInfo(3);
  eq(E.stageStars(3, s.star3), 3); eq(E.stageStars(3, s.star3 + 1), 2); eq(E.stageStars(3, s.star2), 2);
  eq(E.stageStars(3, s.star2 + 1), 1); eq(E.stageStars(3, s.limit), 1); eq(E.stageStars(3, s.limit + 1), 0);
  eq(E.stageStars(3, -1), 0); eq(E.stageStars(99, 5), 0);
  const pz = s.pz, g = E.newGame(pz);
  E.pour(g, pz.sol[0][0], pz.sol[0][1]); E.undo(g);
  for (const m of pz.sol) E.pour(g, m[0], m[1]);
  eq(g.moves, pz.moves + 1); eq(g.history.length, pz.moves); eq(E.stageStars(3, g.history.length), 3);
});
test('challenge: stages open one by one (a star on the previous stage)', () => {
  const x = E.readX(null);
  ok(E.stageOpen(x, 0)); ok(!E.stageOpen(x, 1)); ok(!E.stageOpen(x, 12)); ok(!E.stageOpen(x, -1));
  ok(E.recordStage(x, 0, 1)); ok(E.stageOpen(x, 1)); ok(!E.stageOpen(x, 2));
  ok(!E.recordStage(x, 0, 1), 'not better'); ok(E.recordStage(x, 0, 3)); ok(!E.recordStage(x, 0, 2), 'never lowers');
  eq(x.s[0], 3);
  ok(!E.recordStage(x, 12, 3)); ok(!E.recordStage(x, 1, 0)); ok(E.recordStage(x, 1, 9)); eq(x.s[1], 3, 'clamped to 3');
});
test('sprint: 5 solvable puzzles, hint +10 s and extra tube +15 s, best = the smallest time', () => {
  eq(E.SPRINT_DEFS.length, 5);
  E.SPRINT_DEFS.forEach((d, i) => {
    const pz = E.sprintPuzzle(i), g = E.newGame(pz);
    for (const m of pz.sol) ok(E.pour(g, m[0], m[1]));
    ok(E.won(g), 'sprint puzzle ' + (i + 1)); eq(pz.L, d.L);
  });
  eq(E.sprintPuzzle(5), null);
  ok(E.sprintPuzzle(0).moves < E.sprintPuzzle(4).moves, 'it gets harder');
  eq(E.sprintMs(60000, 0, 0), 60000); eq(E.sprintMs(60000, 2, 1), 60000 + 20000 + 15000); eq(E.sprintMs(-5, -1, -1), 0);
  const x = E.readX(null);
  ok(E.recordSprint(x, 90000)); ok(!E.recordSprint(x, 95000)); ok(!E.recordSprint(x, 90000)); ok(E.recordSprint(x, 80001)); eq(x.sp, 80001);
  ok(!E.recordSprint(x, 0)); ok(!E.recordSprint(x, NaN)); eq(x.sp, 80001);
});
test('kusoge.water.x: reads old, partial and broken saves; nothing outside the known shape survives', () => {
  deep(E.readX(null), { v: 1, s: new Array(12).fill(0), sp: 0 });
  deep(E.readX('{broken'), E.readX(null)); deep(E.readX('[1,2]'), E.readX(null)); deep(E.readX(7), E.readX(null));
  const y = E.readX(JSON.stringify({ v: 1, s: [3, 2, 'x', 9, -1, 1.7], sp: '65000', extra: 1 }));
  deep(y.s.slice(0, 7), [3, 2, 0, 0, 0, 1, 0]); eq(y.sp, 65000); ok(!('extra' in y));
  eq(E.readX({ s: 'abc', sp: -5 }).sp, 0);
  eq(E.readX({ s: new Array(40).fill(3) }).s.length, 12);
});
test('the stage and sprint puzzles do not touch the old stages: the regular stage 1–300 hash is unchanged by asking for them', () => {
  const before = JSON.stringify(E.generate(14));
  for (let i = 0; i < 12; i++) E.stageInfo(i);
  eq(JSON.stringify(E.generate(14)), before);
  ok(E.stageInfo(3).pz !== E.generate(14), 'a salted puzzle is a different puzzle from the regular stage with the same level number');
});
run('water-engine');
