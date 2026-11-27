// ぽかぽか島スポーツの空のイベント（sports/air.js）：グライダー／フォーメーション降下／風船バトル。ボットでむずかしさ・★を確かめる
// 実行：node tools/tests/unit/sports-air.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const W = require(path.join(ROOT, 'sports/world.js'));
const A = require(path.join(ROOT, 'sports/air.js'));
const C = require(path.join(ROOT, 'sports/core.js'));
const w = W.generate('sunny-isle-1');
const play = (s, step, bot, max) => { let n = 0; while (!s.done && n++ < max) { const i = bot(s); step(s, 0.05, i[0], i[1]); } return s; };
const idle = () => [0, 0];

test('air: every kind has a variant record and ★ thresholds that rise', () => {
  for (const k of A.KINDS) { const key = A.VKEYS[k], v = C.VARIANTS[key]; ok(v, key); for (const t of v.thr) ok(t[0] < t[1] && t[1] < t[2]); eq(A.stars(1, key, 0), 0); eq(A.stars(1, key, 9999), 3); }
});
test('glider: deterministic, thermals lift, idle flight earns no star, a bot can collect gates and land', () => {
  const a = play(A.newGlider(w, 0, 1), A.stepGlider, A.botGlider, 8000), b = play(A.newGlider(w, 0, 1), A.stepGlider, A.botGlider, 8000); eq(a.score, b.score); eq(a.t, b.t);
  const g = A.newGlider(w, 0, 1); const th = g.therm[0]; ok(A.liftAt(g, th.x, th.z) > 3 && A.liftAt(g, 9999, 9999) === 0, 'lift only inside a thermal');
  for (let d = 0; d < 3; d++) { const i = play(A.newGlider(w, d, 1), A.stepGlider, idle, 8000); eq(A.stars(d, 'airGlider', i.score), 0, 'idle d' + d); ok(i.done); }
  for (let d = 0; d < 3; d++) { let best = 0, gates = 0; for (let s = 1; s <= 5; s++) { const r = play(A.newGlider(w, d, s), A.stepGlider, A.botGlider, 8000); best = Math.max(best, A.stars(d, 'airGlider', r.score)); gates = Math.max(gates, r.gates.filter(x => x.got).length); } ok(best >= 1 && gates >= 2, 'bot d' + d + ' stars ' + best + ' gates ' + gates); }
});
test('formation: the bot links every shape and lands; idle gets almost nothing; shapes keep five slots', () => {
  for (const s of A.SHAPES) eq(s.length, 5);
  for (let d = 0; d < 3; d++) { const r = play(A.newFormation(w, d, 3), A.stepFormation, A.botFormation, 12000); ok(r.done && r.links >= 4, 'links ' + r.links); eq(A.stars(d, 'airFormation', r.score), 3, 'bot ★3 d' + d); const i = play(A.newFormation(w, d, 3), A.stepFormation, idle, 12000); eq(A.stars(d, 'airFormation', i.score), 0); }
  const a = play(A.newFormation(w, 1, 5), A.stepFormation, A.botFormation, 12000), b = play(A.newFormation(w, 1, 5), A.stepFormation, A.botFormation, 12000); eq(a.score, b.score);
});
test('duel: balloons pop for both sides, idle never wins, a bot wins sometimes, easy CPU is easier than hard', () => {
  let wins = [0, 0, 0]; for (let d = 0; d < 3; d++) { for (let s = 1; s <= 6; s++) { const r = play(A.newDuel(w, d, s), A.stepDuel, p => A.botDuel(p, { noise: 0.25 }), 3000); if (r.won) wins[d]++; ok(r.done && r.p.lives >= 0 && r.e.lives >= 0); } const i = play(A.newDuel(w, d, 1), A.stepDuel, idle, 3000); ok(!i.won, 'idle does not win d' + d); eq(A.stars(d, 'airDuel', i.score), 0); }
  ok(wins[0] >= 1 && wins[0] >= wins[2], 'wins ' + wins);
  const a = play(A.newDuel(w, 1, 2), A.stepDuel, p => A.botDuel(p), 3000), b = play(A.newDuel(w, 1, 2), A.stepDuel, p => A.botDuel(p), 3000); eq(a.score, b.score); deep(a.ev.length, b.ev.length);
});
test('air.js never uses the clock or the built-in random', () => { const t = require('fs').readFileSync(path.join(ROOT, 'sports/air.js'), 'utf8'); ok(!/Math\.random|Date\.now|performance\.now/.test(t)); });
run('sports-air');
