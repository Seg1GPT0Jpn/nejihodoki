// physics/engine.js の単体テスト：sin/cos の精度、決まった結果（同じ入力→同じハッシュ）、エネルギーが増えない、積み木が立ったまま眠る、ロープ、置ける場所
// 実行：node tools/tests/unit/physics-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const PE = require(path.join(ROOT, 'physics/engine.js'));
const { LEVELS } = require(path.join(ROOT, 'physics/levels.js'));

test('dsin / dcos are polynomials close to Math.sin / cos', () => {
  let m = 0; for (let x = -30; x < 30; x += 0.0173) m = Math.max(m, Math.abs(PE.dsin(x) - Math.sin(x)), Math.abs(PE.dcos(x) - Math.cos(x)));
  ok(m < 1e-9, 'max error ' + m);
});
function pile(noBalls) {
  const W = new PE.World();
  W.add({ x: 6, y: -0.5, wd: 14, ht: 1 });
  const boxes = []; for (let i = 0; i < 8; i++) boxes.push(W.add({ x: 6 + (i % 2 ? 0.03 : -0.03), y: 0.5 + i, wd: 1, ht: 1, dyn: true }));
  const balls = []; if (!noBalls) for (let i = 0; i < 6; i++) balls.push(W.add({ x: 2 + i * 0.37, y: 3 + i * 0.9, r: 0.3, dyn: true, re: 0.4 }));
  W.add({ x: 3, y: 1.6, wd: 3, ht: 0.2, a: -0.4 });
  return { W, boxes, balls };
}
test('determinism: the same scene twice gives the same state, step by step', () => {
  const a = pile(), b = pile();
  for (let s = 0; s < 600; s++) { a.W.step(); b.W.step(); if (s % 50 === 0) eq(a.W.hash(), b.W.hash(), 'step ' + s); }
  eq(a.W.hash(), b.W.hash());
});
test('determinism: every level with its solution and without parts, run twice', () => {
  const SOL = require(path.join(ROOT, 'tools/tests/physics-solutions.js'));
  for (const L of LEVELS.slice(0, 12)) {
    const parts = (SOL[L.id] || []).map(q => ({ t: q[0], x: q[1], y: q[2], a: q[3] }));
    eq(PE.run(L, parts).hash, PE.run(L, parts).hash, L.id);
  }
});
test('stacking: 8 boxes stay standing and fall asleep', () => {
  const { W, boxes } = pile(true);
  for (let s = 0; s < 600; s++) W.step();
  boxes.forEach((b, i) => { ok(Math.abs(b.y - (0.5 + i)) < 0.06, 'box ' + i + ' y ' + b.y); ok(Math.abs(b.x - 6) < 0.25, 'box ' + i + ' x ' + b.x); ok(Math.abs(b.a) < 0.05, 'box ' + i + ' angle'); });
  ok(boxes.every(b => !b.awake), 'the pile sleeps');
});
test('energy: a bouncing ball and a swinging rope never gain energy', () => {
  let W = new PE.World(); W.add({ x: 6, y: -0.5, wd: 14, ht: 1 });
  const ball = W.add({ x: 6, y: 5, r: 0.3, dyn: true, re: 0.6, ld: 0, ad: 0 });
  let E0 = W.energy(), worst = -1e9, peak = 0;
  for (let s = 0; s < 600; s++) { W.step(); worst = Math.max(worst, W.energy() - E0); if (s > 60) peak = Math.max(peak, ball.y); }
  ok(worst < 0.01 * Math.abs(E0), 'bounce gained ' + worst);
  ok(peak < 5, 'never bounces higher than the drop');
  W = new PE.World();
  const bob = W.add({ x: 9, y: 6, r: 0.3, dyn: true, ld: 0, ad: 0 });
  W.rope(bob, [0, 0], null, [6, 6], 3);
  E0 = W.energy(); worst = -1e9;
  for (let s = 0; s < 900; s++) { W.step(); worst = Math.max(worst, W.energy() - E0); }
  ok(worst < 0.02 * Math.abs(E0), 'pendulum gained ' + worst);
  const d = Math.sqrt((bob.x - 6) ** 2 + (bob.y - 6) ** 2);
  ok(Math.abs(d - 3) < 0.05, 'rope length kept: ' + d);
});
test('a ball rolls down a ramp and rolls (spins) instead of sliding', () => {
  const W = new PE.World(); W.add({ x: 6, y: 4, wd: 8, ht: 0.24, a: -0.3 });
  const b = W.add({ x: 3, y: 5.5, r: 0.3, dyn: true, fr: 0.7, ad: 0 });
  for (let s = 0; s < 90; s++) W.step();
  ok(b.x > 4 && b.vx > 1, 'moved right ' + b.x);
  ok(Math.abs(b.w * 0.3 + Math.sqrt(b.vx * b.vx + b.vy * b.vy)) < 0.3 * Math.sqrt(b.vx * b.vx + b.vy * b.vy), 'rolling: v ≈ ωr');
});
test('placing parts: off the board, on glass, overlapping are refused; a free spot is fine', () => {
  const L = LEVELS.find(l => l.glass && l.glass.length);
  const z = L.glass[0];
  eq(PE.placeProblem(L, [], -1, { t: 'short', x: z[0] + z[2] / 2, y: z[1] + z[3] / 2, a: 0 }), 'overlap', 'glass');
  eq(PE.placeProblem(L, [], -1, { t: 'plank', x: 0.5, y: 6, a: 0 }), 'edge', 'edge');
  eq(PE.validate(L, [{ t: 'magnet', x: 6, y: 6, a: 0 }]).slice(0, 8), 'too many', 'tray');
  const p = { t: Object.keys(L.parts)[0], x: 6, y: 11, a: 0 };
  const two = [p, Object.assign({}, p)];
  ok(/overlap/.test(PE.validate(Object.assign({}, L, { parts: { [p.t]: 2 } }), two)), 'two parts on the same spot');
});
run('physics-engine');
