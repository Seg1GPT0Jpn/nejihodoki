// minigolf/engine.js の単体テスト：sin/cos の精度、決まった結果（同じ打ち方→同じハッシュ）、保存から戻しても同じ続き、
// かべではね返ると遅くなる、インクの罰打、パイプ、歯車に押される、打つ値の丸め、打数の名前
// 実行：node tools/tests/unit/minigolf-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const MG = require(path.join(ROOT, 'minigolf/engine.js'));
const { HOLES } = require(path.join(ROOT, 'minigolf/holes.js'));
const SOL = require(path.join(ROOT, 'tools/tests/minigolf-solutions.js'));
const hole = id => HOLES.find(h => h.id === id);
const box = (o) => Object.assign({ id: 't', par: 3, poly: [[0, 0], [10, 0], [10, 10], [0, 10]], tee: [5, 8], cup: [5, 1] }, o);

test('dsin / dcos are polynomials close to Math.sin / cos', () => {
  let m = 0; for (let x = -40; x < 40; x += 0.0137) m = Math.max(m, Math.abs(MG.dsin(x) - Math.sin(x)), Math.abs(MG.dcos(x) - Math.cos(x)));
  ok(m < 1e-9, 'max error ' + m);
});
test('determinism: every stored solution twice, step by step the same', () => {
  for (const h of HOLES) {
    const a = MG.play(h, SOL[h.id]), b = MG.play(h, SOL[h.id]);
    eq(a.hash, b.hash, h.id); eq(a.ticks, b.ticks, h.id);
  }
  // and a long random sequence on a moving hole, compared tick by tick
  const h = hole('2-9'), A = MG.create(h), B = MG.create(h);
  let seed = 5; const rnd = () => (seed = (Math.imul(seed, 1103515245) + 12345) >>> 0) / 4294967296;
  for (let i = 0; i < 6000; i++) {
    if (A.canShoot() && i % 97 === 0) { const a = rnd() * 360 - 180, p = 0.2 + rnd() * 0.8; A.shoot(a, p); B.shoot(a, p); }
    A.step(); B.step();
    if (i % 500 === 0) eq(A.hash(), B.hash(), 'tick ' + i);
  }
  eq(A.hash(), B.hash());
});
test('a saved snapshot at rest continues exactly like the original game', () => {
  const h = hole('2-3'), sol = SOL[h.id];
  const G = MG.create(h);
  MG.settle(G); for (let k = 0; k < 37; k++) G.step();
  G.shoot(-100, 0.35); MG.settle(G);
  ok(G.st === 'rest', 'resting');
  const R = MG.restore(h, JSON.parse(JSON.stringify(G.snap())));
  for (let k = 0; k < sol[0][0]; k++) { G.step(); R.step(); }
  G.shoot(-80, 0.6); R.shoot(-80, 0.6);
  MG.settle(G); MG.settle(R);
  eq(R.hash(), G.hash());
});
test('play() replays waits: the same answer at another time misses or differs on a moving hole', () => {
  const h = hole('2-3'), sol = SOL[h.id];
  ok(MG.play(h, sol).sunk, 'stored answer sinks');
  const late = sol.map(s => [s[0] + 45, s[1], s[2]]);
  ok(MG.play(h, late).hash !== MG.play(h, sol).hash, 'timing matters');
});
test('walls: a ball never gains speed bouncing in a closed box and always comes to rest', () => {
  const G = MG.create(box({ cup: [-5, -5] }));
  G.shoot(-33, 1);
  let max = 0, n = 0;
  while (G.st === 'roll' && n < 60 * 30) { G.step(); n++; const v = Math.sqrt(G.vx * G.vx + G.vy * G.vy); if (n > 2) max = Math.max(max, v); }
  ok(max <= MG.VMAX + 1e-9, 'max speed ' + max);
  eq(G.st, 'rest'); ok(n < 60 * 20, 'stopped after ' + n + ' ticks');
  ok(G.x > 0 && G.x < 10 && G.y > 0 && G.y < 10, 'still inside');
});
test('sand stops the ball much sooner than felt', () => {
  const felt = MG.create(box({ cup: [-5, -5] })), sand = MG.create(box({ cup: [-5, -5], sand: [[[0, 0], [10, 0], [10, 10], [0, 10]]] }));
  felt.shoot(-90, 0.4); sand.shoot(-90, 0.4); MG.settle(felt); MG.settle(sand);
  ok(8 - sand.y < (8 - felt.y) / 2, 'sand ' + (8 - sand.y) + ' felt ' + (8 - felt.y));
});
test('slopes roll the ball downhill from rest', () => {
  const G = MG.create(box({ cup: [-5, -5], slopes: [{ p: [[0, 0], [10, 0], [10, 10], [0, 10]], g: [3, 0] }] }));
  G.shoot(-90, 0.05); MG.settle(G);
  ok(G.x > 9, 'rolled to the right wall: ' + G.x);
});
test('ink: one penalty stroke, back to where the shot started', () => {
  const G = MG.create(box({ ink: [[[3, 2], [7, 2], [7, 5], [3, 5]]] }));
  G.shoot(-90, 0.5); MG.settle(G);
  eq(G.strokes, 2); eq(G.pen, 1); eq(G.st, 'rest'); eq(G.x, 5); eq(G.y, 8);
  ok(G.events.some(e => e.k === 'ink'));
});
test('pipes carry the ball to the exit and send it out the exit way', () => {
  const G = MG.create(box({ cup: [-5, -5], pipes: [{ a: [5, 5], b: [2, 2], d: 0 }] }));
  G.shoot(-90, 0.45);
  let saw = false; for (let i = 0; i < 600 && !G.done(); i++) { G.step(); if (G.st === 'pipe') saw = true; if (saw && G.st === 'roll') break; }
  ok(saw, 'went into the pipe'); ok(G.x >= 2 && G.vx > 0 && Math.abs(G.vy) < 1e-9, 'out to the right: ' + G.x + ',' + G.vx);
});
test('the cup: slow enough sinks it, too fast skips over it', () => {
  const h = box({ tee: [5, 4], cup: [5, 2] });
  const a = MG.create(h); a.shoot(-90, 0.3); MG.settle(a); eq(a.st, 'sunk');
  const b = MG.create(h); b.shoot(-90, 1); for (let i = 0; i < 40; i++) b.step(); ok(b.events.some(e => e.k === 'lip') && b.st === 'roll', 'skipped over the cup: ' + b.st);
});
test('a turning gear pushes a ball that is resting in its way', () => {
  const G = MG.create(box({ cup: [-5, -5], tee: [6.5, 5], gears: [{ x: 5, y: 5, r: 2, arms: 2, w: 2, ph: 0 }] }));
  let moved = false; for (let i = 0; i < 240; i++) { G.step(); if (G.st === 'roll') moved = true; }
  ok(moved, 'pushed');
});
test('stroke limit is par + 4; a shot is quantized to 1/20° and 1/1000', () => {
  const G = MG.create(box({ cup: [-5, -5], par: 2 }));
  eq(G.limit, 6);
  G.shoot(-45.0123, 0.33333); eq(G.shots[0][1], -45); eq(G.shots[0][2], 0.333);
  for (let i = 0; i < 5; i++) { MG.settle(G); G.shoot(90, 0.05); }
  MG.settle(G); eq(G.st, 'over'); ok(!G.shoot(0, 0.5), 'no more shots');
});
test('scoreName', () => {
  eq(MG.scoreName(1, 3), 'ace'); eq(MG.scoreName(2, 4), 'eagle'); eq(MG.scoreName(2, 3), 'birdie'); eq(MG.scoreName(3, 3), 'par'); eq(MG.scoreName(4, 3), 'bogey'); eq(MG.scoreName(5, 3), 'double'); eq(MG.scoreName(7, 3), 'over');
});
run('minigolf-engine');
