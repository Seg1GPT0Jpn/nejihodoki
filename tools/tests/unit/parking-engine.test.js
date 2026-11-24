// parking/engine.js の単体テスト（駐車場が前と同じこと・ルール・ミッション12・ラッシュ・kusoge.parking.x の読み込みと記録）
// 実行：node tools/tests/unit/parking-engine.test.js   （数秒）
'use strict';
const path = require('path'), crypto = require('crypto');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'parking/engine.js'));

const lotJ = lv => JSON.stringify([lv.W, lv.H, Array.from(lv.grid), lv.cars, lv.barrier, lv.cat, lv.par]);
const digest = f => { const h = crypto.createHash('sha256'); f(h); return h.digest('hex'); };
// stages 1–200 and the online-battle lots are the lots everybody already has (the stage number is the seed). Do not change them.
const GOLDEN_1_200 = '273f5679b1faaaf9f07bc8d8cd34fe7c31b26f3baa13c27809dd636f62fd77af';
const GOLDEN_VS = '32df70a841ac5671753260e05258c0b9010d24fc53252b7e2a0f84c614ce989c';   // salt 123456789, levels 8, 14, … 68
const GOLDEN_MISSIONS = '621da735ad06bcbd745196df9b10654b736514365356165de9156b4a0f6fb550';   // the 12 missions' lots and limits

// play a lot with the solver's moves (the same moves the game's hint and the test bot use); returns the number of moves used
function play(lv, cap) {
  const st = E.makeState(lv), sol = E.solve(lv, st, cap || 60000);
  ok(sol, 'solvable');
  let moves = 0;
  const s = Int8Array.from(st);
  for (const mv of sol.moves) {
    const o = E.buildOcc(lv, s), left = lv.lens.length - E.aliveCount(s);
    if (mv.rot) { const rt = E.rotTarget(lv, s, o, mv.i); ok(rt && rt.ok, 'rotation is legal'); s[mv.i * 3] = rt.x; s[mv.i * 3 + 1] = rt.y; s[mv.i * 3 + 2] = rt.d; }
    else {
      const r = E.slide(lv, s, o, mv.i, mv.m, left);
      if (r.exit) s[mv.i * 3] = -1; else { ok(r.k > 0, 'a partial slide moves'); s[mv.i * 3] += E.DX[mv.m] * r.k; s[mv.i * 3 + 1] += E.DY[mv.m] * r.k; }
    }
    moves++;
  }
  eq(E.aliveCount(s), 0, 'all cars out');
  return moves;
}

test('stages 1–200 are the same lots as before', () => {
  eq(digest(h => { for (let n = 1; n <= 200; n++) h.update(lotJ(E.generate(n))); }), GOLDEN_1_200);
});
test('online-battle lots (salted) are the same as before', () => {
  eq(digest(h => { for (let n = 8; n <= 69; n += 6) h.update(lotJ(E.generate(n, 123456789))); }), GOLDEN_VS);
});
test('every lot 1–60 is solved by its own solution and par = the solver taps', () => {
  for (let n = 1; n <= 60; n++) { const lv = E.generate(n); eq(play(lv), lv.par, 'stage ' + n); }
});
test('rules: cars only go forward, cones block, the gate holds until enough cars left', () => {
  const lv = E.generate(30, 204), s = E.makeState(lv);
  ok(lv.barrier, 'a gate lot');
  for (let i = 0; i < lv.cars.length; i++) {
    const d = lv.cars[i].d, o = E.buildOcc(lv, s);
    const r = E.slide(lv, s, o, i, d, 0);
    if (r.exit) ok(!lv.barrier || lv.barrier.side !== d, 'a car cannot leave through the closed gate');
  }
  const o = E.buildOcc(lv, s);
  for (let i = 0; i < lv.cars.length; i++) { const r = E.slide(lv, s, o, i, lv.cars[i].d, lv.barrier.need); if (r.hit === 'barrier') ok(false, 'the gate is open when enough cars left'); }
  const t = E.generate(1), st = E.makeState(t);
  ok(E.closure(t, st) >= 1 && E.aliveCount(st) < t.cars.length, 'free cars drive out in waves');
});
test('the daily lots are deterministic and solvable; points and stars', () => {
  const a = E.dailyLot(20260101, 0), b = E.dailyLot(20260101, 0), c = E.dailyLot(20260102, 0);
  eq(lotJ(a), lotJ(b)); ok(lotJ(a) !== lotJ(c), 'another day, another lot');
  for (let i = 0; i < 3; i++) ok(E.solve(E.dailyLot(77, i), E.makeState(E.dailyLot(77, i)), 60000));
  eq(E.lotPoints(10, 10), 150); eq(E.lotPoints(12, 10), 130); eq(E.lotPoints(99, 10), 100);
  eq(E.starsFor(10, 10), 3); eq(E.starsFor(11, 10), 2); eq(E.starsFor(40, 10), 1);
});

test('missions: 12 lots in 3 worlds of 4, the same on every device', () => {
  eq(E.MISSION_N, 12); eq(E.WORLD_SIZE, 4);
  eq(digest(h => { for (let i = 0; i < 12; i++) { const m = E.missionInfo(i); h.update(lotJ(m.lot) + [m.limit, m.star3, m.star2]); } }), GOLDEN_MISSIONS);
  ok(E.missionInfo(12) === null && E.missionInfo(-1) === null, 'no mission 13');
  let prev = 0;
  for (let i = 0; i < 12; i++) { const m = E.missionInfo(i); ok(m.n >= prev, 'levels rise'); prev = m.n; eq(m.world, Math.floor(i / 4)); }
});
test('missions: the world features are really there', () => {
  eq(E.missionInfo(4).lot.barrier !== null, true, 'mission 5 has a gate');
  ok(E.missionInfo(6).lot.grid.includes(E.T_TURN) && E.missionInfo(6).lot.sol.moves.some(m => m.rot), 'mission 7 needs its turntable');
  for (const i of [8, 9, 10, 11]) ok(E.missionInfo(i).lot.cat, 'mission ' + (i + 1) + ' has a cat');
  eq(['none', 'noHint', 'none', 'noUndo', 'none', 'noHint', 'none', 'noUndo', 'none', 'noHint', 'noUndo', 'noTools'].join(), E.MISSION_DEFS.map(d => d.rule).join());
});
test('missions: par is reachable (solver), 3 stars at the star-3 line, limit and stars are ordered', () => {
  for (let i = 0; i < 12; i++) {
    const m = E.missionInfo(i);
    eq(play(m.lot), m.par, 'mission ' + (i + 1));
    ok(m.par <= m.star3 && m.star3 <= m.star2 && m.star2 < m.limit, 'order ' + (i + 1));
    eq(E.missionStars(i, m.par), 3); eq(E.missionStars(i, m.star3), 3); eq(E.missionStars(i, m.star3 + 1), 2); eq(E.missionStars(i, m.star2), 2);
    eq(E.missionStars(i, m.star2 + 1), 1); eq(E.missionStars(i, m.limit), 1); eq(E.missionStars(i, m.limit + 1), 0); eq(E.missionStars(i, -1), 0);
  }
  ok(E.missionInfo(11).limit - E.missionInfo(11).par < E.missionInfo(0).limit - E.missionInfo(0).par + 4, 'later worlds are not looser by much');
});
test('missions: they open one after another by a star', () => {
  const x = E.readX(null);
  ok(E.missionOpen(x, 0) && !E.missionOpen(x, 1));
  E.recordMission(x, 0, 1); ok(E.missionOpen(x, 1) && !E.missionOpen(x, 2));
  ok(!E.missionOpen(x, 12) && !E.missionOpen(x, -1));
});

test('rush: lots rise from level 5 by 3, stay below the cat, are the same for a seed and solvable', () => {
  eq(E.rushLevel(0), 5); eq(E.rushLevel(1), 8); eq(E.rushLevel(10), 35); eq(E.rushLevel(99), 60);
  const a = E.rushLot(4242, 2), b = E.rushLot(4242, 2), c = E.rushLot(4243, 2);
  eq(lotJ(a), lotJ(b)); ok(lotJ(a) !== lotJ(c), 'another seed');
  for (let k = 0; k < 20; k++) { const lv = E.rushLot(99, k); ok(!lv.cat, 'no cat'); eq(play(lv), lv.par, 'lot ' + k); }
  eq(E.rushSalt(0) !== 0, true);
});
test('rush: time bonus (more at par) with a cap', () => {
  eq(E.rushTime(30, 10, 10), 30 + E.RUSH.BONUS + E.RUSH.PAR_BONUS);
  eq(E.rushTime(30, 11, 10), 30 + E.RUSH.BONUS);
  eq(E.rushTime(E.RUSH.MAX - 1, 5, 5), E.RUSH.MAX);
  eq(E.rushTime(-5, 9, 5), E.RUSH.BONUS);
});

test('kusoge.parking.x: reads good data, ignores garbage', () => {
  deep(E.readX(null), { v: 1, s: new Array(12).fill(0), r: 0 });
  deep(E.readX('{broken'), { v: 1, s: new Array(12).fill(0), r: 0 });
  deep(E.readX('[1,2]'), { v: 1, s: new Array(12).fill(0), r: 0 });
  deep(E.readX({ v: 1, s: [3, 2, 1], r: 450 }).s.slice(0, 4), [3, 2, 1, 0]);
  const x = E.readX(JSON.stringify({ v: 1, s: [3, 2, 'x', 9, -1, 1.7], r: 'oops', extra: 1 }));
  eq(x.s.slice(0, 6).join(), '3,2,0,0,0,1'); eq(x.r, 0); ok(!('extra' in x));
  eq(E.readX({ s: [], r: 1e12 }).r, 1e6, 'capped');
  eq(E.readX({ s: new Array(40).fill(3) }).s.length, 12, 'extra entries are dropped');
});
test('kusoge.parking.x: records only improvements', () => {
  const x = E.readX(null);
  ok(E.recordMission(x, 2, 2)); ok(!E.recordMission(x, 2, 1)); ok(!E.recordMission(x, 2, 2)); ok(E.recordMission(x, 2, 3)); eq(x.s[2], 3);
  ok(!E.recordMission(x, 12, 3) && !E.recordMission(x, 0, 0) && !E.recordMission(x, -1, 2));
  ok(E.recordRush(x, 300)); ok(!E.recordRush(x, 300)); ok(!E.recordRush(x, 120)); ok(E.recordRush(x, 301)); eq(x.r, 301);
  ok(!E.recordRush(x, 0) && !E.recordRush(x, NaN) && !E.recordRush(x, -5));
});

run();
