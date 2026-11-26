// ぽかぽか島スポーツの3Dの島（sports/world.js）：同じ種は同じ島／ランドマークは陸にある・離れている／飛行機は離陸してリングをくぐれる／撮影の目標
// 実行：node tools/tests/unit/sports-world.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const W = require(path.join(ROOT, 'sports/world.js'));
const C = require(path.join(ROOT, 'sports/core.js'));

test('world: same seed same island, different seed a different one; every landmark is on land and apart', () => {
  const a = W.generate('a'), b = W.generate('a'), c = W.generate('b'); deep(a.marks, b.marks); ok(Array.from(a.H).join() === Array.from(b.H).join()); ok(JSON.stringify(a.marks) !== JSON.stringify(c.marks));
  eq(a.marks.length, 16); for (const id of W.SPOT_IDS) ok(a.markOf(id), id);
  for (const m of a.marks) { ok(m.y >= 3, m.id + ' is on land: ' + m.y); } for (let i = 0; i < a.marks.length; i++) for (let j = i + 1; j < a.marks.length; j++) ok(Math.hypot(a.marks[i].x - a.marks[j].x, a.marks[i].z - a.marks[j].z) > 100, 'apart ' + a.marks[i].id + ' ' + a.marks[j].id);
  ok(a.heightAt(a.volc.x, a.volc.z) > 100, 'a volcano'); ok(a.heightAt(a.HALF - 5, a.HALF - 5) < 0, 'sea at the edge'); ok(a.trees.length > 100 && a.balloons.length === 24 && a.course.length === 12);
  for (const t of a.trees) ok(t.y > 7);
});
test('flight: take off from the airstrip, fly the course, balloons pop, relaxed mode never crashes, deterministic', () => {
  const w = W.generate('a'); const fly = (d, mode) => { const f = W.newFlight(w, d, { mode }); let k = 0; while (!f.done && k++ < 60 * 200) { let sx = 0, sy = 0; if (f.ground) sy = f.v > 26 ? -0.6 : 0; else if (f.next < w.course.length) { const t = w.course[f.next]; let da = Math.atan2(t.x - f.x, t.z - f.z) - f.yaw; while (da > Math.PI) da -= 2 * Math.PI; while (da < -Math.PI) da += 2 * Math.PI; sx = Math.max(-1, Math.min(1, da * 2)); let ty = t.y; for (const dd of [60, 120, 200, 300]) ty = Math.max(ty, w.heightAt(f.x + Math.sin(f.yaw) * dd, f.z + Math.cos(f.yaw) * dd) + 45); sy = Math.max(-1, Math.min(1, -(ty - f.y) / 80)); if (f.alt < 30) sy = Math.min(sy, -0.4); } W.stepFlight(f, 1 / 60, sx, sy, 1); f.ev.length = 0; } return f; };
  const a = fly(0, 'ring'), b = fly(0, 'ring'); eq(a.rings, b.rings); eq(a.t, b.t); ok(a.rings >= 6, 'rings ' + a.rings); ok(a.score >= 100);
  const free = W.newFlight(w, 1, { mode: 'free' }); for (let i = 0; i < 600; i++) { W.stepFlight(free, 1 / 60, 0, i > 120 ? 0.8 : -0.6, 1); } ok(!free.crashed, 'relaxed never crashes');
  const f = W.newFlight(w, 1); eq(f.ground, true); ok(W.onStrip(f)); const idle = W.newFlight(w, 1); for (let i = 0; i < 600; i++) W.stepFlight(idle, 1 / 60, 0, 0, 1); ok(idle.ground || idle.v > 20, 'rolls down the strip by itself');
  eq(W.fstars(1, 0), 0); eq(W.fstars(1, 300), 3);
  const air = W.newFlight(w, 1); air.ground = false; air.state = 'air'; const lm = w.markOf('town'); air.x = lm.x - 100; air.z = lm.z; air.y = lm.y + 60; air.yaw = Math.PI / 2; eq(W.photoTarget(air), 'town'); air.yaw = -Math.PI / 2; ok(W.photoTarget(air) !== 'town');
});
test('world.js never uses the clock or the built-in random', () => { const t = require('fs').readFileSync(path.join(ROOT, 'sports/world.js'), 'utf8'); ok(!/Math\.random|Date\.now|performance\.now/.test(t)); });
run('sports-world');
