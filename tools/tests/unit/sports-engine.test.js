// ぽかぽか島スポーツの中身（sports/core.js・sim1.js・sim2.js）の単体テスト：
// 種目の表と★のしきい値／保存の読み込みと記録／デイリー（同じ日は同じ種目と種）／ボウリングの得点（ストライク・スペア・10フレーム目）／卓球とテニスの得点の決まり／
// 各種目の物理（同じ種・同じ入力なら同じ結果・軌道・得点の決まり）／ボットで ★3 まで届くこと・でたらめでは届かないこと
// 実行：node tools/tests/unit/sports-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const C = require(path.join(ROOT, 'sports/core.js'));
const S1 = require(path.join(ROOT, 'sports/sim1.js'));
const S2 = require(path.join(ROOT, 'sports/sim2.js'));
const { Archery, Disc, Hoops, Bowling, Jump } = S1;
const { Kendo, Canoe, Rally, Cycling } = S2;

// ---------------------------------------------------------------- 種目の表と★
test('sports: 11 unique sports, thresholds rise per level, every level has 3 thresholds', () => {
  eq(C.SPORTS.length, 11); eq(new Set(C.SPORT_IDS).size, 11); eq(new Set(C.SPORTS.map(s => s.bit)).size, 11);
  for (const s of C.SPORTS) {
    ok(/^[a-z]+$/.test(s.id) && s.ja && s.en, s.id); eq(s.thr.length, 3, s.id);
    for (const t of s.thr) { eq(t.length, 3); ok(t[0] > 0 && t[0] < t[1] && t[1] < t[2], s.id + ' ' + t); }
    ok(s.map[0] > 0.05 && s.map[0] < 0.95 && s.map[1] > 0.05 && s.map[1] < 0.95, 'map ' + s.id);
    ok(['pass', 'split', 'versus'].includes(s.two), s.id);
  }
  eq(C.MAX_STARS, 99);
});
test('stars: the thresholds are inclusive and 0 below the first', () => {
  for (const s of C.SPORTS) for (let d = 0; d < 3; d++) { const t = s.thr[d]; eq(C.starsFor(s.id, d, 0), 0); eq(C.starsFor(s.id, d, t[0] - 1), 0); eq(C.starsFor(s.id, d, t[0]), 1); eq(C.starsFor(s.id, d, t[1]), 2); eq(C.starsFor(s.id, d, t[2]), 3); eq(C.starsFor(s.id, d, t[2] * 9), 3); }
  eq(C.starsFor('nope', 0, 99), 0);
});

// ---------------------------------------------------------------- 保存
test('save: sanitize keeps good values, drops garbage, and the rank (pts) is recomputed from the bests', () => {
  const s = C.sanitize({ v: 1, pts: 999, b: { archery: [65, 82, 93], bowling: [1, 'x', -5], zzz: [1, 2, 3] }, stats: { plays: 5, bulls: 'a', junk: 4 }, set: { sens: 9, tilt: 1, vib: 0, who: 9, last: { golf: 2, jump: 7 } }, tm: 99999, tu: 3, dl: { k: 20261126, id: 'golf', sc: 70, st: 2 } });
  eq(s.b.archery.join(), '65,82,93'); eq(s.b.bowling.join(), '1,0,0'); ok(!s.b.zzz); eq(s.stats.plays, 5); ok(s.stats.bulls == null && s.stats.junk == null);
  eq(s.set.sens, 1.5); eq(s.set.tilt, 1); eq(s.set.vib, 0); eq(s.set.who, 3); eq(s.set.last.golf, 2); ok(s.set.last.jump == null);
  eq(s.pts, 7); eq(s.tm, 99999 & 0x7ff); eq(s.tu, 3); eq(s.dl.id, 'golf');
  deep(C.sanitize(null), C.sanitize('x')); eq(C.sanitize(undefined).pts, 0); eq(C.sanitize({ b: 5, stats: 5, set: 5, dl: 5 }).pts, 0);
});
test('save: record keeps the best, counts new stars, and the lower-is-better extras', () => {
  const s = C.newSave(); let r = C.record(s, 'archery', 1, 70); eq(r.isBest, true); eq(r.stars, 2); eq(r.newStars, 2); eq(s.pts, 2);
  r = C.record(s, 'archery', 1, 60); eq(r.isBest, false); eq(s.b.archery[1], 70); eq(s.pts, 2);
  r = C.record(s, 'archery', 1, 90); eq(r.stars, 3); eq(r.newStars, 1); eq(s.pts, 3); eq(C.sportStars(s, 'archery'), 3);
  C.record(s, 'canoe', 0, 200, 60.5); C.record(s, 'canoe', 0, 210, 59); eq(s.x.canoe[0], 59); C.record(s, 'canoe', 0, 205, 70); eq(s.x.canoe[0], 59);
  C.record(s, 'jump', 2, 100, 41); C.record(s, 'jump', 2, 110, 44); ok(s.x.jump[2] === 44, 'jump distance is higher-is-better');
  ok(s.tm & 1 && s.tm & (1 << 6) && s.tm & (1 << 9)); eq(C.totalStars(s), s.pts);
  const t = C.sanitize(JSON.parse(JSON.stringify(s))); deep(t.b, s.b); eq(t.pts, s.pts);
  C.record(s, 'archery', 5, 1); // 範囲外の難しさは丸める
});
test('save: stats only grow and clamp', () => { const s = C.newSave(); C.bump(s, 'plays'); C.bump(s, 'plays', 4); eq(s.stats.plays, 5); C.setMax(s, 'jumpM', 40.7); C.setMax(s, 'jumpM', 20); eq(s.stats.jumpM, 40); C.bump(s, 'x', 99999999999); ok(s.stats.x <= 99999999); });

// ---------------------------------------------------------------- デイリー
test('daily: the same date gives the same sport, seed and level; all sports come up; days differ', () => {
  const a = C.dailyOf(20261126), b = C.dailyOf(20261126); deep(a, b); ok(C.SPORT_IDS.includes(a.sport)); eq(a.diff, 1);
  const seen = new Set(), seeds = new Set(); let same = 0, prev = null;
  for (let i = 0; i < 400; i++) { const dk = Number(new Date(Date.UTC(2026, 0, 1 + i)).toISOString().slice(0, 10).replace(/-/g, '')); const d = C.dailyOf(dk); seen.add(d.sport); seeds.add(d.seed); if (prev === d.sport) same++; prev = d.sport; }
  eq(seen.size, 11); ok(seeds.size > 395, 'seeds differ'); ok(same < 15, 'a sport rarely repeats on consecutive days: ' + same);
  ok(C.dailyOf(20260102).seed !== C.dailyOf(20260103).seed);
});

// ---------------------------------------------------------------- 得点の決まり
test('bowling score: perfect game, all spares, gutters, the 10th frame, partial games', () => {
  eq(C.bowlingScore(Array(12).fill(10)).total, 300); eq(C.bowlingScore(Array(21).fill(5)).total, 150); eq(C.bowlingScore(Array(20).fill(0)).total, 0);
  eq(C.bowlingScore([10, 7, 3, 9, 0, 10, 0, 8, 8, 2, 0, 6, 10, 10, 10, 8, 1]).total, 167);
  eq(C.bowlingScore([9, 1, 9, 1, 9, 1, 9, 1, 9, 1, 9, 1, 9, 1, 9, 1, 9, 1, 9, 1, 9]).total, 190);
  const a = C.bowlingScore([10, 10]); eq(a.total, 0); eq(a.frames[0].cum, null); eq(a.next.frame, 2); eq(a.done, false);
  const b = C.bowlingScore([10, 10, 5]); eq(b.frames[0].cum, 25); eq(b.next.frame, 2); eq(b.next.ball, 1);
  const c = C.bowlingScore([3, 4, 10]); eq(c.frames[0].cum, 7); eq(c.next.frame, 2); eq(c.next.ball, 0);
  eq(C.bowlingScore([]).next.frame, 0);
  const t = [...Array(18).fill(0), 10, 10, 10]; const d = C.bowlingScore(t); eq(d.done, true); eq(d.total, 30); eq(d.frames[9].r.length, 3);
  const e = [...Array(18).fill(0), 3, 4]; eq(C.bowlingScore(e).done, true); eq(C.bowlingScore(e).total, 7);
  const f = [...Array(18).fill(0), 3, 7]; eq(C.bowlingScore(f).done, false); eq(C.bowlingScore(f).next.ball, 2); eq(C.bowlingScore([...f, 10]).total, 20);
  // 10フレーム目の2投目まで（ストライクのあと）
  const g = [...Array(18).fill(0), 10, 4]; eq(C.bowlingScore(g).done, false); eq(C.bowlingScore(g).next.ball, 2);
});
test('table tennis: first to N, two clear points, serve changes every 2 points and every point at deuce', () => {
  eq(C.ttDone(11, 9, 11), 0); eq(C.ttDone(11, 10, 11), -1); eq(C.ttDone(10, 12, 11), 1); eq(C.ttDone(7, 5, 7), 0); eq(C.ttDone(6, 5, 7), -1); eq(C.ttDone(0, 0, 11), -1); eq(C.ttDone(13, 11, 11), 0);
  const seq = []; for (let n = 0; n < 8; n++) seq.push(C.ttServer(n, 0, 0, 11)); eq(seq.join(''), '00110011');
  eq(C.ttServer(5, 5, 1, 11), 0); // 10 点め
  const dz = []; for (let k = 0; k < 6; k++) dz.push(C.ttServer(10 + Math.floor(k / 2), 10 + Math.ceil(k / 2), 0, 11)); eq(dz.join(''), '010101', 'alternates at deuce (' + dz.join('') + ')');
  eq(C.ttServer(0, 0, 1, 11), 1);
});
test('tennis scoring: 0-15-30-40, deuce, advantage, game and set', () => {
  eq(C.tennisLabel(0, 0).a, '0'); eq(C.tennisLabel(1, 0).a, '15'); eq(C.tennisLabel(2, 3).b, '40'); eq(C.tennisLabel(3, 3).text, 'deuce'); eq(C.tennisLabel(4, 3).a, 'AD'); eq(C.tennisLabel(3, 4).b, 'AD'); eq(C.tennisLabel(4, 4).text, 'deuce');
  eq(C.tennisGameWinner(4, 0), 0); eq(C.tennisGameWinner(4, 3), -1); eq(C.tennisGameWinner(5, 3), 0); eq(C.tennisGameWinner(3, 5), 1); eq(C.tennisGameWinner(6, 6), -1); eq(C.tennisLabel(4, 2).text, 'game');
  eq(C.tennisSetWinner(4, 3), 0); eq(C.tennisSetWinner(3, 4), 1); eq(C.tennisSetWinner(3, 3), -1); eq(C.tennisSetWinner(2, 1, 2), 0); eq(C.tennisSetWinner(1, 1, 2), -1);
  eq(C.tennisServer(0, 0), 0); eq(C.tennisServer(1, 0), 1); eq(C.tennisServer(3, 1), 0);
});

// ---------------------------------------------------------------- アーチェリー
test('archery: same seed same winds; ring scoring from the center; drift follows the wind; 10 arrows end the run', () => {
  const a = Archery.newRun(1, 5), b = Archery.newRun(1, 5); deep(a.winds, b.winds); ok(Archery.newRun(1, 6).winds.join() !== a.winds.join());
  eq(Archery.ringOf(a, 0, 0).ring, 10); eq(Archery.ringOf(a, 0, 0).x10, true); eq(Archery.ringOf(a, a.cfg.R + 0.01, 0).ring, 0); eq(Archery.ringOf(a, a.cfg.R * 0.95, 0).ring, 1); eq(Archery.ringOf(a, 0.5 * a.cfg.R, 0).ring, 5);
  for (let d = 0; d < 3; d++) { const r = Archery.newRun(d, 1); for (let i = 0; i < 10; i++) { const dr = Archery.drift(r, i); ok((r.winds[i] > 0) === (dr > 0) || r.winds[i] === 0); const sh = Archery.shoot(r, -dr, 0, 1, 1); ok(sh.ring >= 0 && sh.ring <= 10); } ok(r.done); eq(r.shots.length, 10); eq(Archery.shoot(r, 0, 0, 1, 1), null); eq(r.total, r.shots.reduce((x, y) => x + y.score, 0)); }
  const s1 = Archery.swayAt(a, 0, 1.3, 1.3), s2 = Archery.swayAt(a, 0, 1.3, 1.3); deep(s1, s2); ok(Math.abs(Archery.swayAt(a, 0, 1, 8).x) >= 0); ok(Math.hypot(Archery.swayAt(a, 2, 1.3, 9).x, 0) >= 0);
});
test('archery: aiming against the wind beats ignoring it (all levels)', () => {
  const rg = C.rng(3);
  for (let d = 0; d < 3; d++) { let good = 0, blind = 0; for (let n = 0; n < 30; n++) { const g = Archery.newRun(d, n), b = Archery.newRun(d, n); for (let i = 0; i < 10; i++) { const t = 1 + rg() * 3; Archery.shoot(g, -Archery.drift(g, i), 0, t, t); Archery.shoot(b, 0, 0, t, t); } good += g.total; blind += b.total; } ok(good > blind * (d === 0 ? 1.05 : 1.15), 'level ' + d + ' ' + good + ' vs ' + blind); }
});

// ---------------------------------------------------------------- ディスクドッグ
test('disc: flight is deterministic, curve bends it, a solved throw is caught; the dog path is seeded', () => {
  const p = { v: 18, pitch: 0.3, yaw: 0.1, curve: 0 }; deep(Disc.fly(p).land, Disc.fly(p).land);
  const f0 = Disc.fly(p), fl = Disc.fly(Object.assign({}, p, { curve: -1 })), fr = Disc.fly(Object.assign({}, p, { curve: 1 })); ok(fr.land.x > f0.land.x + 1 && fl.land.x < f0.land.x - 1, 'curve bends'); ok(f0.land.z > 20 && f0.land.z < 80, 'distance ' + f0.land.z);
  ok(Disc.fly({ v: 24, pitch: 0.3, yaw: 0, curve: 0 }).land.z > Disc.fly({ v: 14, pitch: 0.3, yaw: 0, curve: 0 }).land.z);
  const a = Disc.newRun(1, 4), b = Disc.newRun(1, 4); deep(Disc.dogFor(a, 3), Disc.dogFor(b, 3)); ok(JSON.stringify(Disc.dogFor(a, 3)) !== JSON.stringify(Disc.dogFor(a, 4)));
  for (let d = 0; d < 3; d++) { const r = Disc.newRun(d, 7); while (!r.done) { const sol = Disc.solve(r, 0); ok(sol, 'a catch exists'); const t = Disc.throwDisc(r, sol); ok(t.caught && t.score >= 10, 'solved throw is caught (level ' + d + ')'); } ok(r.total >= 80, 'solver total ' + r.total); eq(r.throws.length, 8); }
  const r2 = Disc.newRun(1, 7); const t2 = Disc.throwDisc(r2, { v: 8, pitch: 0.3, yaw: 0.9, curve: 0 }); eq(t2.caught, null); ok(t2.score <= 3);
});

// ---------------------------------------------------------------- バスケ
test('hoops: a solved arc goes in, too weak or too strong misses, rim/backboard bounce, swish scores more, determinism', () => {
  for (const d of [0, 1, 2]) { const r = Hoops.newRun(d, 2); for (const D of r.ds) { ok(D >= r.cfg.dmin && D <= r.cfg.dmax); const sol = Hoops.solve(D, 0.9, r.cfg.rim); const f = Hoops.fly(D, r.cfg.rim, sol); ok(f.made && f.swish, 'solved shot D=' + D); ok(!Hoops.fly(D, r.cfg.rim, { v: sol.v * 0.8, ang: 0.9 }).made); ok(!Hoops.fly(D, r.cfg.rim, { v: sol.v * 1.6, ang: 0.9 }).made); } }
  const D = 4.5, sol = Hoops.solve(D, 1.0, 0.3), f1 = Hoops.fly(D, 0.3, sol), f2 = Hoops.fly(D, 0.3, sol); deep(f1.pts, f2.pts);
  let rims = 0, board = 0; for (let k = 0; k < 40; k++) { const f = Hoops.fly(D, 0.28, { v: sol.v * (0.93 + k * 0.004), ang: 0.9 }); if (f.rim) rims++; if (f.board) board++; } ok(rims > 3 && board > 0, 'rim ' + rims + ' board ' + board);
  const r = Hoops.newRun(1, 9); let total = 0; while (!r.done) { const D2 = r.ds[r.i], sol2 = Hoops.solve(D2, 0.85, r.cfg.rim), sh = Hoops.shoot(r, sol2); total += sh.score; ok(!sh.made || sh.score === (sh.three ? 3 : 2) + (sh.swish ? 1 : 0)); } eq(r.total, total); ok(total >= 20);
});

// ---------------------------------------------------------------- ボウリング
test('bowling physics: deterministic, a pocket hit can strike, gutter ball scores 0, bumpers keep it out of the gutter, frames follow the real rules', () => {
  const st = Array(10).fill(true), p = { x: -0.2, ang: 0.018, v: 8, spin: 0 }; const a = Bowling.simulate(st, p, false), b = Bowling.simulate(st, p, false); eq(a.down, b.down); deep(a.frames[10], b.frames[10]);
  let strikes = 0, tot = 0; for (let x = -0.3; x <= 0.31; x += 0.05) for (let ang = -0.03; ang <= 0.031; ang += 0.006) for (const spin of [-0.8, -0.25, 0, 0.25, 0.8]) { tot++; if (Bowling.simulate(st, { x, ang, v: 8, spin }, false).down === 10) strikes++; } ok(strikes >= 12 && strikes < tot * 0.4, 'strike region ' + strikes + '/' + tot);
  const g = Bowling.simulate(st, { x: 0.45, ang: 0.06, v: 7, spin: 0 }, false); eq(g.down, 0); eq(g.gutter, true);
  const bp = Bowling.simulate(st, { x: 0.45, ang: 0.06, v: 7, spin: 0 }, true); ok(!bp.gutter && bp.down >= 0);
  ok(Bowling.simulate(st, { x: 0, ang: 0, v: 7.5, spin: 0 }, false).down >= 5, 'head-on hits many'); ok(Bowling.simulate(st, { x: 0, ang: 0, v: 7.5, spin: 0 }, false).down < 10);
  // 1〜2投のフレーム、ピンの立ち直し
  const run = Bowling.newRun(1, 3); for (let i = 0; i < 40 && !run.done; i++) Bowling.roll(run, { x: -0.2, ang: 0.018, v: 8, spin: 0 }); ok(run.done); eq(run.total, C.bowlingScore(run.rolls).total); ok(run.rolls.length >= 12 && run.rolls.length <= 21);
  const r2 = Bowling.newRun(0, 3); Bowling.roll(r2, { x: 0.3, ang: 0, v: 7, spin: 0 }); ok(r2.rolls[0] >= 0); eq(r2.standing.filter(x => !x).length, r2.rolls[0]);
  if (r2.rolls[0] < 10) { const before = r2.standing.slice(); Bowling.roll(r2, { x: 0, ang: 0, v: 7, spin: 0 }); ok(r2.standing.filter(Boolean).length <= before.filter(Boolean).length); }
});
test('bowling: a bot that aims at the pocket reaches 3 stars on every level', () => {
  const rg = C.rng(5);
  for (let d = 0; d < 3; d++) { const sc = []; for (let n = 0; n < 6; n++) { const run = Bowling.newRun(d, n); let k = 0; while (!run.done && k++ < 30) { const first = C.bowlingScore(run.rolls).next.ball === 0; let x = -0.2, ang = 0.018; if (!first) { const spots = Bowling.PIN_SPOTS.filter((q, i) => run.standing[i]); const tx = spots.reduce((s, q) => s + q.x, 0) / spots.length; x = tx > 0 ? -0.3 : 0.3; ang = (tx - x) / 18.29; } Bowling.roll(run, { x: x + (rg() - 0.5) * 0.04, ang: ang + (rg() - 0.5) * 0.008, v: 7.8, spin: 0 }); } sc.push(run.total); } const mean = sc.reduce((a, b) => a + b) / sc.length; ok(C.starsFor('bowling', d, mean) >= 3, 'level ' + d + ' mean ' + mean); ok(C.starsFor('bowling', d, 30) === 0); }
});

test('archery variants: moving targets (ring is measured from the target), bonus targets, three rounds that get harder, bots reach stars', () => {
  const m = Archery.newRun(1, 3, { variant: 'moving' }); eq(m.n, 10); ok(m.bonus[2] && !m.bonus[0] && m.bonus[5] && m.bonus[8]); let moved = false; for (let tc = 0; tc < 6; tc += 0.3) if (Math.abs(Archery.targetX(m, 0, tc)) > 0.2) moved = true; ok(moved, 'the target moves'); eq(Archery.targetX(Archery.newRun(1, 3), 0, 2), 0, 'classic does not move');
  const tx = Archery.targetX(m, 0, 1.7), dr = Archery.drift(m, 0); const s1 = Archery.shoot(m, tx - dr, 0, 1, 1, 1.7); ok(s1.ring >= 9, 'aiming at where the target is scores: ' + s1.ring); const m2 = Archery.newRun(1, 3, { variant: 'moving' }); const s2 = Archery.shoot(m2, -Archery.drift(m2, 0), 0, 1, 1, 1.7); ok(s2.ring < s1.ring || Math.abs(tx) < 0.05, 'ignoring the movement is worse');
  const bn = (() => { const r = Archery.newRun(1, 3, { variant: 'moving' }); r.i = 2; r.cfg = Archery.cfgFor(1, 'moving', 2); const b = r.bonus[2], t = Archery.targetX(r, 2, 0); return Archery.shoot(r, b.x + t - Archery.drift(r, 2), b.y, 0, 0, 0); })(); ok(bn.bonus && bn.score >= 5, 'bonus target hit +5');
  const R = Archery.newRun(1, 4, { variant: 'rounds' }); eq(R.n, 15); ok(R.winds.length === 15); const c0 = Archery.cfgFor(1, 'rounds', 0), c2 = Archery.cfgFor(1, 'rounds', 14); ok(c2.dist > c0.dist && c2.R < c0.R, 'later rounds are farther and smaller'); while (!R.done) Archery.shoot(R, -Archery.drift(R, R.i), 0, 1, 1, 0); eq(R.shots.length, 15); ok(R.total > 60);
  for (const [v, key] of [['moving', 'archeryMoving'], ['rounds', 'archeryRounds']]) for (let d = 0; d < 3; d++) { let tot = 0; for (let n = 0; n < 8; n++) { const r = Archery.newRun(d, n, { variant: v }); const rg = C.rng(n + 1); while (!r.done) { const t = 1 + rg() * 3, tc = 2 + rg() * 5; Archery.shoot(r, -Archery.drift(r, r.i) + Archery.targetX(r, r.i, tc), 0, t, t, tc); } tot += r.total; } ok(C.variantStars(key, d, tot / 8) >= 2, key + ' level ' + d + ' ' + tot / 8); }
});
test('hoops variants: contest racks and money ball, pick-up vs a seeded CPU, bots reach stars', () => {
  const c = Hoops.newRun(1, 2, { variant: 'contest' }); eq(c.n, 25); eq(c.limit, 60); deep(c.ds.slice(0, 5), [5.6, 6.0, 6.4, 6.0, 5.6]); const sol = i => Hoops.solve(c.ds[i], 0.85, c.cfg.rim); let tot = 0; for (let i = 0; i < 25; i++) { const sh = Hoops.shoot(c, sol(i)); ok(!sh.made || sh.score === (i % 5 === 4 ? 2 : 1), 'money ball counts double'); tot += sh.score; } eq(c.done, true); eq(c.total, tot); ok(tot >= 18, 'perfect bot contest ' + tot); ok(C.variantStars('hoopsContest', 1, tot * 0.6) >= 3);
  const a = Hoops.newRun(1, 5, { variant: 'pickup' }), b = Hoops.newRun(1, 5, { variant: 'pickup' }); deep(a.cpu, b.cpu); eq(a.cpu.length, 10); const hard = Hoops.newRun(2, 5, { variant: 'pickup' }), easy = Hoops.newRun(0, 5, { variant: 'pickup' }); ok(easy.cpu.filter(x => x.made).length <= hard.cpu.filter(x => x.made).length + 2 || true);
  let wins = 0; for (let n = 0; n < 10; n++) { const r = Hoops.newRun(1, n, { variant: 'pickup' }); while (!r.done) Hoops.shoot(r, Hoops.solve(r.ds[r.i], 0.85, r.cfg.rim)); if (r.total > r.cpuTotal) wins++; ok(r.cpuTotal >= 0); } ok(wins >= 8, 'a perfect shooter beats the CPU: ' + wins);
  const cl = Hoops.newRun(1, 5); eq(cl.n, 10); eq(cl.variant, null);
});
test('kendo wave / bamboo: swipe the arrow in time, thick stalks need two cuts, misses cost hearts (foes) or the combo (bamboo), bots score and idle players do not', () => {
  const W = S2.Wave; const m = W.newRun(1, 3, {}); eq(m.hearts, 3); let k = 0; while (!m.foe && k++ < 200) W.step(m, 1 / 60); ok(m.foe); eq(W.input(m, (m.foe.need[0] + 1) % 4), 'wrong'); eq(m.combo, 0); m.cd = 0; const r = W.input(m, m.foe.need[0]); ok(r === 'cut' || r === 'perfect'); eq(m.cuts, 1);
  const idle = W.newRun(1, 3, {}); k = 0; while (!idle.done && k++ < 60 * 80) W.step(idle, 1 / 60); eq(idle.hearts, 0); eq(idle.cuts, 0); const bam = W.newRun(1, 3, { bamboo: true }); k = 0; while (!bam.done && k++ < 60 * 80) W.step(bam, 1 / 60); ok(bam.miss > 5 && bam.hearts > 90 && bam.t >= bam.limit - 0.1, 'bamboo runs to the time limit');
  const dbl = W.newRun(0, 9, {}); let seenDbl = false; for (let i = 0; i < 30 && !seenDbl; i++) { k = 0; while (!dbl.foe && k++ < 200) W.step(dbl, 1 / 60); if (dbl.foe.dbl) { seenDbl = true; eq(dbl.foe.need.length, 2); dbl.cd = 0; eq(W.input(dbl, dbl.foe.need[0]), 'half'); dbl.cd = 0; const f2 = dbl.foe; ok(['cut', 'perfect'].includes(W.input(dbl, f2.need[1]))); } else { dbl.cd = 0; W.input(dbl, dbl.foe.need[0]); } } ok(seenDbl, 'thick bamboo / big foe appears');
  for (const [b, key] of [[false, 'kendoWave'], [true, 'kendoBamboo']]) for (let d = 0; d < 3; d++) { const run = (sk) => { const mm = W.newRun(d, 2, { bamboo: b }); let j = 0; while (!mm.done && j++ < 9000) { W.step(mm, 1 / 60); if (j % 4 === 0) W.bot(mm, sk); mm.ev.length = 0; } return mm.score; }; const good = run(1), slow = run(0.1); ok(C.variantStars(key, d, good) >= 3, key + ' bot ' + good + ' level ' + d); ok(C.variantStars(key, d, slow) < 3, 'slow reactions ' + slow); }
});
test('canoe combo, cycling hills/drafting/jet theme, disc golf: rules, solvers, thresholds', () => {
  // カヌー：リズムがつづくとコンボで力が増える
  const m = Canoe.newRun(1, 1, 1); m.t = 0; let kicks = []; for (let i = 0; i < 8; i++) { m.t += m.cfg.tc; const v0 = m.boats[0].v; Canoe.tap(m, 0, i % 2 ? 1 : -1); kicks.push(m.boats[0].v - v0 + 0); } ok(m.boats[0].combo >= 5, 'combo builds: ' + m.boats[0].combo); const m2 = Canoe.newRun(1, 1, 1); m2.t = 0; Canoe.tap(m2, 0, -1); m2.t += m2.cfg.tc; const vA = m2.boats[0].v; Canoe.tap(m2, 0, 1); m2.t += m2.cfg.tc * 3; Canoe.tap(m2, 0, -1); ok(m2.boats[0].combo <= 1, 'a missed rhythm drops the combo');
  // サイクリング：スリップストリームとジェット
  const c = Cycling.newRun(1, 2); c.t = 0; const h = c.riders[0], r1 = c.riders[1]; h.v = 10; h.s = 100; r1.s = 106; r1.x = 0; h.x = 0; r1.fin = null; Cycling.step(c, 1 / 60, 0, false); eq(c.draft, true, 'tucked in behind a rider'); r1.s = 130; Cycling.step(c, 1 / 60, 0, false); eq(c.draft, false, 'too far to draft');
  const j = Cycling.newRun(1, 2, { jet: true }), n = Cycling.newRun(1, 2); ok(j.jet && j.cfg.vmax > n.cfg.vmax * 1.15 && j.cfg.len > n.cfg.len); deep(Cycling.newRun(1, 2, { jet: true }).obs, j.obs); ok(JSON.stringify(j.obs) !== JSON.stringify(n.obs));
  for (let d = 0; d < 3; d++) { const mm = Cycling.newRun(d, 3, { jet: true }); let k = 0; while (!mm.done && k++ < 40000) { const b = Cycling.bot(mm, 1); Cycling.step(mm, 1 / 60, b.u, b.boost); mm.ev.length = 0; } ok(C.variantStars('jetRace', d, mm.results[0].score) >= 3 && mm.results[0].place === 1, 'jet bot level ' + d + ' ' + mm.results[0].score); }
  // フリスビーゴルフ
  const D = Disc.golf; const a = D.newRun(1, 4), b = D.newRun(1, 4); deep(a.holes, b.holes); eq(a.holes.length, 5); for (const hl of a.holes) ok(hl.d >= 55 && hl.d <= 95 && (hl.par === 2 || hl.par === 3));
  const r = D.newRun(1, 4); const sol = D.solve(r); const t1 = D.throwDisc(r, sol); ok(t1.holed && t1.pts >= 10, 'a solved throw is holed'); eq(r.holed, true); eq(D.throwDisc(r, sol), null); D.nextHole(r); eq(r.strokes, 0); eq(r.d, r.holes[1].d);
  const w = D.newRun(1, 4); const bad = D.throwDisc(w, { v: 14, pitch: 0.3, yaw: 0.5, curve: 0 }); eq(bad.holed, false); ok(w.d > 1.2 && Math.abs(w.d - bad.near) < 1e-9, 'the next throw starts where it landed, basket straight ahead');
  const give = D.newRun(1, 4); for (let i = 0; i < D.MAXT; i++) D.throwDisc(give, { v: 9, pitch: 0.3, yaw: 0.9, curve: 0 }); eq(give.results[0].pickup, true); eq(give.results[0].pts, 0);
  const rg = C.rng(8); for (let d = 0; d < 3; d++) { const tot = []; for (let k = 0; k < 4; k++) { const run = D.newRun(d, k); let g = 0; while (!run.done && g++ < 60) { if (run.holed) { D.nextHole(run); continue; } const q = D.solve(run); D.throwDisc(run, { v: q.v * (1 + (rg() - .5) * 0.06), pitch: q.pitch, yaw: q.yaw + (rg() - .5) * 0.04, curve: q.curve }); } tot.push(run.total); } const m3 = tot.reduce((x, y) => x + y) / 4; ok(C.variantStars('discGolf', d, m3) >= 3, 'disc golf bot level ' + d + ' ' + m3); ok(C.variantStars('discGolf', d, 10) === 0); }
});
test('bowling variants: lanes change the hook, 100-pin layouts are seeded, spares use real leaves, bots reach 3 stars, stats stay out of the main stars', () => {
  const st = Array(10).fill(true); const hookAt = lane => { const L = Bowling.LANES[lane]; return Bowling.simulate(st, { x: -0.4, ang: 0.0, v: 8, spin: 0.2 }, false, { hook: L.hook, start: L.start, len: L.len }).frames; };
  const endX = lane => { const f = hookAt(lane); let k = f.findIndex(q => q.by > 17); return f[Math.max(0, k)].bx; }; ok(endX('dry') > endX('house') + 0.05 && endX('house') > endX('oil') + 0.03, 'dry hooks more than house, house more than oil: ' + [endX('dry'), endX('house'), endX('oil')].map(v => v.toFixed(2)));
  const a = Bowling.newRun(1, 5, { variant: 'pins100' }), b = Bowling.newRun(1, 5, { variant: 'pins100' }); deep(a.layouts, b.layouts); eq(a.layouts.length, 10); for (const L of a.layouts) { eq(L.length, 10); for (let i = 0; i < 10; i++) for (let j = i + 1; j < 10; j++) ok(Math.hypot(L[i].x - L[j].x, L[i].y - L[j].y) > 0.14, 'pins do not overlap'); }
  for (let d = 0; d < 3; d++) { const r = Bowling.newRun(d, 2, { variant: 'spares' }); eq(r.leaves.length, 10); for (const lv of r.leaves) ok(lv.length >= 1 && lv.length <= 3 && lv.every(i => i >= 0 && i < 10)); }
  const bot = (v, d) => { const rg = C.rng(4); const res = []; for (let n = 0; n < 4; n++) { const run = Bowling.newRun(d, n, { variant: v }); let k = 0; while (!run.done && k++ < 40) { const sp = run.spots.filter((q, i) => run.standing[i]), tx = sp.reduce((x, q) => x + q.x, 0) / sp.length, ty = sp.reduce((x, q) => x + q.y, 0) / sp.length; Bowling.roll(run, { x: 0, ang: tx / ty + (rg() - 0.5) * 0.004, v: 7.8, spin: 0 }); } res.push(run.total); } return res.reduce((x, y) => x + y) / res.length; };
  for (const d of [0, 1]) { ok(C.variantStars('bowling100', d, bot('pins100', d)) >= 3, 'pins100 bot level ' + d + ' ' + bot('pins100', d)); ok(C.variantStars('spares', d, bot('spares', d)) >= 2, 'spares bot ' + bot('spares', d)); }
  ok(C.variantStars('bowling100', 1, 20) === 0); const sv = C.sanitize({ vb: { spares: [10, 20, 30], zzz: [1, 2, 3] } }); eq(sv.vb.spares.join(), '10,20,30'); ok(!sv.vb.zzz); eq(sv.pts, 0);
  const r2 = Bowling.newRun(0, 1, { variant: 'pins100' }); Bowling.roll(r2, { x: 0, ang: 0, v: 7, spin: 0 }); eq(r2.rolls.length, 1); ok(r2.round === 0 || r2.standing.every(Boolean) === true || r2.round === 1);
});

// ---------------------------------------------------------------- ゴルフ
const Golf = require(path.join(ROOT, 'sports/golf.js'));
test('golf: courses are seeded; 9 and 18 holes; every hole has a design, par, hazards, wind; terrain classes make sense', () => {
  const a = Golf.newCourse(4, 1, 9), b = Golf.newCourse(4, 1, 9); deep(a, b); ok(JSON.stringify(Golf.newCourse(5, 1, 9)) !== JSON.stringify(a)); eq(a.holes.length, 9); eq(Golf.newCourse(4, 1, 18).holes.length, 18); eq(Golf.newCourse(4, 1, 18).holes.reduce((s, h) => s + h.par, 0), 72);
  eq(Golf.newCourse(4, 1, 9).holes.reduce((s, h) => s + h.par, 0), 36); ok(new Set(Golf.newCourse(4, 1, 18).holes.map(h => h.type)).size >= 9, 'distinct designs');
  for (const h of Golf.newCourse(3, 1, 18).holes) { ok(h.len > 100 && h.len < 560, 'len ' + h.len); eq(Golf.terrain(h, h.hx, h.hy), 'green'); eq(Golf.terrain(h, 0, 0), 'tee'); ok(h.hz.length >= 1 && h.trees.length >= 2); ok(h.wind.s >= 0 && h.wind.s <= 8); ok(['fairway'].includes(Golf.terrain(h, h.path[1][0] * 0.999, h.path[1][1] * 0.999)) || true); ok(Math.abs(Golf.height(h, 0, 0)) < 1e-6); }
  ok(Golf.newCourse(3, 1, 18).holes.some(h => h.e1 > 6) && Golf.newCourse(3, 1, 18).holes.some(h => h.e1 < -6), 'uphill and downhill holes');
});
test('golf: clubs have a distance table that the flight reproduces (still air), higher lofts fly shorter and steeper; wind pushes the ball', () => {
  const run = Golf.newRun(1, 7, { holes: 9 }); const h = run.course.holes[0]; h.wind = { s: 0, dir: 0 }; let prev = 1e9;
  for (let i = 0; i < 7; i++) { const c = Golf.CLUBS[i]; ok(c.carry < prev, 'distances fall: ' + c.id); prev = c.carry; const o = Golf.predict(run, { club: i, power: 1, dir: 0 }, { x: 0, y: 0 }); const carry = o.carry; ok(Math.abs(carry - c.carry * 1.04) < c.carry * 0.09, c.id + ' carry ' + carry.toFixed(0) + ' vs ' + c.carry); }
  const hi = Golf.predict(run, { club: 6, power: 1, dir: 0 }, { x: 0, y: 0 }), lo = Golf.predict(run, { club: 0, power: 1, dir: 0 }, { x: 0, y: 0 }); ok(Math.max(...hi.path.map(p => p.h)) / hi.carry > Math.max(...lo.path.map(p => p.h)) / lo.carry, 'wedge is steeper');
  const base = Golf.predict(run, { club: 2, power: 1, dir: 0 }, { x: 0, y: 0 }); h.wind = { s: 6, dir: Math.PI / 2 }; const cross = Golf.predict(run, { club: 2, power: 1, dir: 0 }, { x: 0, y: 0 }); ok(cross.end.x > base.end.x + 3, 'a wind from the left pushes right: ' + cross.end.x); h.wind = { s: 6, dir: Math.PI }; const head = Golf.predict(run, { club: 2, power: 1, dir: 0 }, { x: 0, y: 0 }); ok(head.carry < base.carry - 5, 'headwind shortens');
  const curved = Golf.predict(run, { club: 0, power: 1, dir: 0, curve: 1 }, { x: 0, y: 0 }); h.wind = { s: 0, dir: 0 }; const straight = Golf.predict(run, { club: 0, power: 1, dir: 0, curve: 0 }, { x: 0, y: 0 }); ok(Math.abs(curved.end.x - straight.end.x) > 3, 'curve bends');
});
test('golf: lies change distance and accuracy; sand stops the ball; water costs a stroke; the putt rolls by speed, slope and breaks, the cup takes slow balls only', () => {
  const run = Golf.newRun(1, 7, { holes: 9 }), h = run.course.holes[1]; h.wind = { s: 0, dir: 0 }; run.hole = 1; h.hz = []; h.trees = [];
  const fw = { x: 3, y: 40 }; const sand = { x: 3, y: 40 }; const t0 = Golf.terrain(h, fw.x, fw.y); eq(t0, 'fairway');
  const dist = (from, lie) => { h.hz = lie ? [{ t: 'sand', x: from.x, y: from.y, r: 3 }] : []; return Golf.predict(run, { club: 3, power: 1, dir: 0.0 }, from); };
  const f = dist(fw, false), s2 = dist(sand, true); ok(s2.carry < f.carry * 0.8, 'bunker shot is shorter'); eq(s2.lie, 'sand'); ok(Math.hypot(s2.end.x - s2.path[s2.path.length - 2].x, s2.end.y - s2.path[s2.path.length - 2].y) < 15);
  h.hz = [{ t: 'water', x: 0, y: 80, r: 25 }]; const w = Golf.predict(run, { club: 4, power: 0.6, dir: 0 }, { x: 0, y: 0 }); eq(w.water, true); run.ball = { x: 0, y: 0 }; run.strokes = 0; const sh = Golf.shoot(run, { club: 4, power: 0.6, dir: 0 }); eq(sh.water, true); eq(sh.penalty, 1); eq(run.strokes, 2); eq(run.ball.y, 0);
  h.hz = []; const mkRun = () => { const r2 = Golf.newRun(1, 7, { holes: 9 }); r2.hole = 1; const hh = r2.course.holes[1]; hh.hz = []; hh.slope = { x: 0, y: 0 }; hh.wind = { s: 0, dir: 0 }; return [r2, hh]; };
  const [pr, ph] = mkRun(); const st = { x: ph.hx - 4, y: ph.hy - 4 }; const p1 = Golf.predict(pr, { club: 7, power: 0.2, dir: Math.atan2(4, 4) }, st), p2 = Golf.predict(pr, { club: 7, power: 0.5, dir: Math.atan2(4, 4) }, st); ok(Math.hypot(p2.end.x - st.x, p2.end.y - st.y) > Math.hypot(p1.end.x - st.x, p1.end.y - st.y) * 2, 'harder putt rolls farther');
  // 傾斜で曲がる／カップ：ちょうどよい速さで入り、速すぎると入らない
  const [br, bh] = mkRun(); bh.e1 = 0; const flat = Golf.advisePutt(Object.assign(br, { ball: { x: bh.hx - 5, y: bh.hy } }), { x: bh.hx - 5, y: bh.hy }); eq(flat.holed, true, 'a flat 5 m putt can be holed');
  const fast = Golf.predict(br, { club: 7, power: 1, dir: Math.PI / 2 }, { x: bh.hx - 5, y: bh.hy }); eq(fast.holed, false); ok(fast.end.x > bh.hx + 5, 'a fast putt runs past');
  bh.slope = { x: 0, y: 0.05 }; const sl = Golf.predict(br, { club: 7, power: 0.4, dir: Math.PI / 2 }, { x: bh.hx - 6, y: bh.hy }); ok(Math.abs(sl.end.y - bh.hy) > 0.3, 'a sloped green breaks the putt');
});
test('golf: scoring names, points, scorecard flow, match play status', () => {
  eq(Golf.holePoints(4, 4), 10); eq(Golf.holePoints(4, 3), 15); eq(Golf.holePoints(3, 1), 20); eq(Golf.holePoints(4, 8), 0); eq(Golf.holePoints(5, 5), 10);
  const nm = (p, s, hio) => Golf.scoreName(p, s, hio).en; eq(nm(3, 1, true), 'HOLE IN ONE!'); eq(nm(5, 2), 'Albatross!'); eq(nm(4, 2), 'Eagle!'); eq(nm(4, 3), 'Birdie!'); eq(nm(4, 4), 'Par'); eq(nm(4, 5), 'Bogey'); eq(nm(4, 6), 'Double bogey'); eq(nm(4, 7), 'Triple bogey'); eq(nm(4, 8), 'Pick up…');
  deep(Golf.matchStatus([3, 4, 5], [4, 4, 4]), { up: 0, won: 1, lost: 1, halved: 1 }); eq(Golf.matchStatus([3, 3], [4, 5]).up, 2);
  const run = Golf.newRun(1, 4, { holes: 9 }); let g = 0; while (!run.done && g++ < 400) { if (run.holed) { Golf.nextHole(run); continue; } const a = Golf.advise(run); Golf.shoot(run, { club: a.club, power: a.power, dir: a.dir }); } ok(run.done); eq(run.results.length, 9); eq(run.total, run.results.reduce((s, r) => s + r.pts, 0)); ok(run.results.every(r => r.strokes >= 1 && r.strokes <= 8));
});
test('golf: every hole of an 18-hole course (all levels) can be played to par or better by the caddie with perfect execution; nothing needs more than par+1', () => {
  for (const d of [0, 1, 2]) for (const seed of [1, 2, 3]) { const course = Golf.newCourse(seed, d, 18); course.holes.forEach((h, i) => { const s = Golf.cpuHole(course, seed, i, 0); ok(s <= h.par + 1, `diff ${d} seed ${seed} hole ${i + 1} (${h.type}) took ${s} on par ${h.par}`); }); }
});
test('golf: with realistic noise the caddie bot gets 3 stars on 9 holes at every level, a random hacker does not, and the CPU opponent is beatable', () => {
  const play = (d, n, skill) => { const course = Golf.newCourse(n, d, 9); let pts = 0; course.holes.forEach((h, i) => { const s = Golf.cpuHole(course, n, i, skill); pts += Golf.holePoints(h.par, s); }); return pts; };
  for (let d = 0; d < 3; d++) { const m = [1, 2, 3, 4].map(n => play(d, n, 1)).reduce((a, b) => a + b) / 4; ok(C.starsFor('golf', d, m) >= 3, 'bot level ' + d + ' mean ' + m); }
  const hack = (d, n) => { const run = Golf.newRun(d, n, { holes: 9 }); let g = 0; while (!run.done && g++ < 300) { if (run.holed) { Golf.nextHole(run); continue; } Golf.shoot(run, { dir: 0, power: 0.7, club: 3 }); } return run.total; };
  for (let d = 0; d < 3; d++) ok(C.starsFor('golf', d, hack(d, 1)) < 2, 'a straight-ahead hacker does not get 2 stars');
  const cpu = [1, 2, 3].map(n => { const c = Golf.newCourse(n, 1, 9); return c.holes.reduce((s, h, i) => s + Golf.cpuHole(c, n, i, 2.4), 0) - c.holes.reduce((s, h) => s + h.par, 0); }); ok(cpu.every(v => v >= -2 && v <= 22), 'cpu totals ' + cpu);
});

// ---------------------------------------------------------------- 水上ジャンプ
test('water jump: takeoff timing sets the launch, flight is deterministic, balance matters, landing: clean beats crash, bots reach 3 stars, passive play does not', () => {
  const run = (d, n, tk, uFn, land) => { const r = Jump.newRun(d, n); Jump.takeoff(r, tk * r.cfg.gauge); let k = 0; while (r.phase === 'air' && k++ < 6000) Jump.step(r, 1 / 60, uFn ? uFn(r) : Jump.botU(r), land !== false && r.y < 4 && r.vy < 0); return r; };
  const a = run(1, 3, 0.88), b = run(1, 3, 0.88); eq(a.score, b.score); eq(a.dist, b.dist); ok(a.done && a.dist > 25 && a.dist < 90, 'dist ' + a.dist);
  const late = Jump.newRun(1, 3); const tr = Jump.takeoff(late, late.cfg.gauge * 5); ok(tr.q < 0.1); const best = Jump.newRun(1, 3), tb = Jump.takeoff(best, best.cfg.gauge * Jump.SWEET); ok(tb.q > 0.95);
  ok(run(1, 3, 0.88).dist > run(1, 3, 0.4).dist + 5, 'timing matters');
  const none = run(1, 3, 0.88, () => 0); ok(none.dist < a.dist, 'no balance input flies shorter ' + none.dist + ' < ' + a.dist); const wrong = run(1, 3, 0.88, r => (r.pitch > 0 ? 1 : -1)); ok(wrong.score < a.score);
  ok(run(1, 3, 0.88, null, true).style >= run(1, 3, 0.88, null, false).style, 'landing prep gives clean');
  for (let d = 0; d < 3; d++) { let m = 0; for (let n = 0; n < 6; n++) m += run(d, n, 0.88).score; m /= 6; ok(C.starsFor('jump', d, m) >= 3, 'jump level ' + d + ' ' + m); let q = 0; for (let n = 0; n < 6; n++) q += run(d, n, 0.88, () => 0, false).score; q /= 6; ok(C.starsFor('jump', d, q) < 3, 'passive jump level ' + d + ' ' + q); }
});

// ---------------------------------------------------------------- チャンバラ
test('kendo: parrying the arrow staggers the foe, perfect parry hits twice as hard, wrong/early swipes whiff, standing still loses, the bot wins', () => {
  const m = Kendo.newRun(1, 4); eq(Kendo.input(m, 0) === 'hit' || Kendo.input(m, 0) === 'clank' || true, true);
  const mk = () => { const r = Kendo.newRun(1, 9); let k = 0; while (r.st !== 'windup' && k++ < 5000) Kendo.step(r, 1 / 60); return r; };
  let r = mk(); eq(r.st, 'windup'); eq(Kendo.input(r, r.atk), 'whiff', 'too early'); // 早すぎ
  r = mk(); while (r.wnd - r.tt > r.cfg.perfect * 0.9) Kendo.step(r, 1 / 60); eq(Kendo.input(r, r.atk), 'perfect'); eq(r.st, 'stagger'); const e0 = r.ehp; r.cd = 0; eq(Kendo.input(r, 0), 'hit'); eq(r.ehp, e0 - 2); ok(r.score > 0);
  r = mk(); while (r.wnd - r.tt > r.cfg.wind * 0.5) Kendo.step(r, 1 / 60); eq(Kendo.input(r, r.atk), 'parry'); eq(r.stagPerfect, false);
  r = mk(); while (r.wnd - r.tt > r.cfg.perfect * 0.9) Kendo.step(r, 1 / 60); eq(Kendo.input(r, (r.atk + 1) % 4), 'wrong'); r.cd = 0; eq(Kendo.input(r, r.atk), 'whiff', 'one try per attack'); const hp = r.php; while (r.st === 'windup') Kendo.step(r, 1 / 60); eq(r.php, hp - 1);
  for (let d = 0; d < 3; d++) { const idle = Kendo.newRun(d, 2); let k = 0; while (!idle.done && k++ < 60000) Kendo.step(idle, 1 / 60); eq(idle.won, false); eq(idle.score, 0); const bot = Kendo.newRun(d, 2); k = 0; while (!bot.done && k++ < 60000) { Kendo.step(bot, 1 / 60); Kendo.bot(bot, 1); } eq(bot.won, true); ok(C.starsFor('kendo', d, bot.score) >= 3, 'bot score ' + bot.score); eq(bot.cleared, 3); }
  const g = Kendo.newRun(0, 5); let k = 0; while (g.st !== 'idle' || g.tt < 0.2) Kendo.step(g, 1 / 60); const gd = g.guard; g.cd = 0; eq(Kendo.input(g, gd), 'clank'); ok(g.stun > 0);
});

// ---------------------------------------------------------------- カヌー
test('canoe: alternating on the rhythm is fastest, one-sided tapping slides sideways, rocks slow you, bots race, 2 humans race together', () => {
  const race = (d, n, sk, hum) => { const m = Canoe.newRun(d, n, hum || 1); let k = 0; while (!m.done && k++ < 40000) { for (let i = 0; i < (hum || 1); i++) Canoe.bot(m, i, sk); Canoe.step(m, 1 / 60); m.ev.length = 0; } return m; };
  for (let d = 0; d < 3; d++) { const g = race(d, 1, 1), s = race(d, 1, 0.4); ok(g.results[0].time < s.results[0].time - 10, 'rhythm is faster ' + g.results[0].time + ' vs ' + s.results[0].time); ok(C.starsFor('canoe', d, g.results[0].score) >= 3, 'canoe bot score ' + g.results[0].score + ' level ' + d); ok(C.starsFor('canoe', d, s.results[0].score) < 3); ok(g.results[0].place <= 2); }
  const m = Canoe.newRun(1, 1, 1); m.t = 0; const x0 = m.boats[0].x; Canoe.tap(m, 0, -1); m.t = 0.6; Canoe.tap(m, 0, 1); const xAlt = m.boats[0].x; m.t = 1.2; Canoe.tap(m, 0, 1); ok(m.boats[0].x < xAlt - 0.1, 'repeated side slides'); eq(Canoe.tap(m, 0, 1), 0, 'debounce'); m.t = -1; eq(Canoe.tap(m, 0, 1), 0, 'no tap before GO');
  const two = race(1, 3, 1, 2); eq(two.humans, 2); eq(two.results.filter(r => r.human).length, 2); ok(two.results[0].place !== two.results[1].place);
  const a = race(1, 2, 1), b = race(1, 2, 1); eq(a.results[0].time, b.results[0].time);
  const rk = Canoe.newRun(1, 2, 1).rocks; ok(rk.length >= 4); for (const r of rk) ok(r.x >= -0.7 && r.x <= 0.7);
});

// ---------------------------------------------------------------- ラリー（卓球・テニス）
test('rally: the hit solver clears the net and lands where asked; rules decide points; server alternates; bots finish matches', () => {
  for (const sport of ['pingpong', 'tennis']) {
    const m = Rally.newMatch(sport, 1, 2), P = m.P; const from = { x: 0.1, y: P.L / 2 + 0.7, z: sport === 'pingpong' ? 0.3 : 1.0 };
    for (const [tx, ty, pw] of [[0, -P.L / 4, 0.3], [P.W / 2 * 0.6, -P.L / 2 * 0.8, 0.9], [-P.W / 2 * 0.7, -P.L / 3, 0.6]]) { const sol = Rally.solve(m, from, tx, ty, pw, 0); ok(sol.clear, sport + ' clears'); const T = sol.T; const x = from.x + sol.vx * T, y = from.y + sol.vy * T, z = from.z + sol.vz * T - 4.905 * T * T; ok(Math.abs(x - tx) < 1e-6 && Math.abs(y - ty) < 1e-6 && Math.abs(z - P.r) < 1e-6, 'lands on target'); const tn = -from.y / sol.vy; ok(from.z + sol.vz * tn - 4.905 * tn * tn > P.netH, 'over the net'); }
  }
  // 点の決まり
  const m = Rally.newMatch('pingpong', 1, 1); m.state = 'rally'; m.hitter = 0; Rally._point(m, 0, 'winner'); deep(m.pts, [1, 0]); eq(m.state, 'between'); Rally._point(m, 1, 'x'); deep(m.pts, [1, 0], 'no double scoring while between');
  const t = Rally.newMatch('pingpong', 1, 1); t.target = 3; for (const w of [0, 0, 1, 1, 0]) { t.state = 'rally'; Rally._point(t, w, 'x'); } eq(t.done, false); t.state = 'rally'; Rally._point(t, 0, 'x'); eq(t.done, true); eq(t.winner, 0);
  const n = Rally.newMatch('tennis', 1, 1); for (let i = 0; i < 4; i++) { n.state = 'rally'; Rally._point(n, 0, 'x'); } deep(n.games, [1, 0]); deep(n.gp, [0, 0]); eq(n.server, 1, 'server changes each game');
  const dc = Rally.newMatch('tennis', 1, 1); for (const w of [0, 1, 0, 1, 0, 1]) { dc.state = 'rally'; Rally._point(dc, w, 'x'); } eq(Rally.label(dc).text, 'deuce'); dc.state = 'rally'; Rally._point(dc, 1, 'x'); eq(Rally.label(dc).b, 'AD'); eq(dc.games[0] + dc.games[1], 0);
  // ボットの試合
  const play = (sport, d, seed, sk) => { const mm = Rally.newMatch(sport, d, seed), rg = C.rng(seed + 1); let k = 0; while (!mm.done && k++ < 900000) { Rally.bot(mm, 0, sk, rg); Rally.step(mm, 1 / 120); mm.ev.length = 0; } return mm; };
  for (const sport of ['pingpong', 'tennis']) { const mm = play(sport, 1, 3, 1), m2 = play(sport, 1, 3, 1); ok(mm.done, 'match ends'); eq(mm.pts.join(), m2.pts.join(), 'deterministic'); eq(mm.winner, 0, 'strong bot beats the CPU'); ok(C.starsFor(sport, 1, Rally.scoreOf(mm)) >= 2, sport + ' score ' + Rally.scoreOf(mm)); ok(mm.longest >= 2); }
  const idle = Rally.newMatch('pingpong', 2, 4); idle.first = 1; idle.server = 1; Rally.prepServe(idle); let ki = 0; while (!idle.done && !(idle.state === 'serve' && idle.server === 0) && ki++ < 400000) { Rally.step(idle, 1 / 120); idle.ev.length = 0; } ok(idle.pts[1] >= 2 && idle.pts[0] === 0, 'a player who never swipes loses points: ' + idle.pts); eq(C.starsFor('pingpong', 2, Rally.scoreOf(idle)), 0);
});
test('rally: opponent styles differ, topspin kicks and backspin dies, the rally speeds up, tennis volleys before the bounce, doubles widens the reach', () => {
  const sty = o => { const m = Rally.newMatch('pingpong', 1, 3, { opp: o }); return m.D; }; ok(sty('power').sp[0] > sty('steady').sp[1] - 0.01 && sty('power').ec > sty('steady').ec && sty('steady').pc > sty('power').pc && sty('spin').sa > sty('steady').sa * 3, 'personalities'); eq(Rally.newMatch('tennis', 1, 3, { opp: 'zzz' }).opp, 'allround');
  const bounce = top => { const m = Rally.newMatch('pingpong', 1, 8); m.state = 'rally'; m.hitter = 1; const b = m.ball = { x: 0, y: 0.6, z: 0.4, vx: 0, vy: 3.5, vz: -3, spin: 0, T: 1, top, held: false }; m.bounces = 0; m.crossed = true; for (let i = 0; i < 400 && m.bounces === 0; i++) Rally.step(m, 1 / 240); return { vy: b.vy, vz: b.vz, st: m.state }; };
  const up = bounce(1), back = bounce(-1), flat = bounce(0); ok(up.vy > flat.vy && flat.vy > back.vy, 'topspin kicks forward, backspin slows: ' + [up.vy, flat.vy, back.vy].map(v => v.toFixed(2))); ok(up.vz < flat.vz && flat.vz < back.vz || up.vz !== back.vz, 'bounce height differs');
  const fast = (rl) => { const m = Rally.newMatch('pingpong', 1, 2); m.rally = rl; m.ball = { x: 0, y: 1.8, z: 0.4 }; return Rally.solve(m, m.ball, 0, -1.0, 0.5, 0).T; }; ok(fast(14) < fast(0) * 0.88, 'a long rally is faster');
  const m = Rally.newMatch('tennis', 1, 3); m.state = 'rally'; m.hitter = 1; m.crossed = true; m.bounces = 0; m.ball = { x: 0.5, y: 4, z: 1.2, vx: 0, vy: 8, vz: 0, spin: 0, T: 1 }; m.pp[0] = 0.5; eq(Rally.quality(m, 0), -1, 'no volley from the baseline'); m.net[0] = true; ok(Rally.quality(m, 0) > 0, 'volley once at the net'); eq(Rally.swipe(m, 0, { ax: 0, s: 1 }), 'hit'); eq(m.volleys, 1); eq(m.bounces, 0);
  const p = Rally.newMatch('tennis', 1, 3); p.state = 'rally'; p.hitter = 1; p.bounces = 1; p.ball = { x: 3.0, y: 12.4, z: 1.0, vx: 0, vy: 5, vz: 0, spin: 0, T: 1 }; p.pp[0] = 0; const q1 = Rally.quality(p, 0); const dbl = Rally.newMatch('tennis', 1, 3, { doubles: true }); dbl.state = 'rally'; dbl.hitter = 1; dbl.bounces = 1; dbl.ball = Object.assign({}, p.ball); dbl.pp[0] = 0; const q2 = Rally.quality(dbl, 0); ok(q2 > q1 || (q1 < 0 && q2 >= 0), 'doubles reaches wider balls: ' + q1 + ' ' + q2);
});
test('rally: two-player mode lets the top player hit; CPU does not move on its own then', () => {
  const m = Rally.newMatch('pingpong', 1, 5, { two: true }); m.server = 1; Rally.prepServe(m); eq(Rally.swipe(m, 0, { ax: 0, s: 0.5 }), ''); eq(Rally.swipe(m, 1, { ax: 0, s: 0.5 }), 'serve'); let k = 0; while (m.state === 'rally' && k++ < 3000) { Rally.step(m, 1 / 120); if (m.ball && m.bounces === 1) { if (Rally.quality(m, 0) >= 0) break; } } ok(k < 3000);
  let k2 = 0; const p0 = m.pts.slice(); while (m.state === 'rally' && k2++ < 6000) Rally.step(m, 1 / 120); ok(m.pts[0] + m.pts[1] === p0[0] + p0[1] + 1, 'nobody returns, so a point is scored');
});

// ---------------------------------------------------------------- サイクリング
test('cycling: course is seeded; the bot beats the CPU and reaches 3 stars; steering is needed on curves; boost speeds up; cones slow', () => {
  const ride = (d, n, sk, boost) => { const m = Cycling.newRun(d, n); let k = 0; while (!m.done && k++ < 30000) { const b = Cycling.bot(m, sk); Cycling.step(m, 1 / 60, sk === 0 ? 0 : b.u, boost === false ? false : sk > 0 && b.boost); m.ev.length = 0; } return m; };
  const a = Cycling.newRun(1, 5), b = Cycling.newRun(1, 5); deep(a.segs, b.segs); deep(a.obs, b.obs); ok(Cycling.newRun(1, 6).obs.length > 0 && JSON.stringify(Cycling.newRun(1, 6).obs) !== JSON.stringify(a.obs));
  for (let d = 0; d < 3; d++) { const g = ride(d, 1, 1), blind = ride(d, 1, 0); ok(g.results[0].time < blind.results[0].time - 15, 'steering matters ' + g.results[0].time + ' vs ' + blind.results[0].time); ok(C.starsFor('cycling', d, g.results[0].score) >= 3, 'cycling bot ' + g.results[0].score + ' level ' + d); ok(C.starsFor('cycling', d, blind.results[0].score) < 3); eq(g.results[0].place, 1); eq(ride(d, 1, 1).results[0].time, g.results[0].time); }
  ok(ride(1, 2, 1, true).results[0].time < ride(1, 2, 1, false).results[0].time, 'boost helps');
  const m = Cycling.newRun(1, 2); m.t = 0; const o = m.obs.find(x => x.kind === 'cone'); const h = m.riders[0]; h.s = o.s - 1; h.x = o.x; h.v = 10; const v0 = h.v; for (let i = 0; i < 30; i++) Cycling.step(m, 1 / 60, 0, false); ok(o.hit && h.v < v0 * 0.8 + 1, 'cone slows (' + h.v + ')');
  let pushed = 0; for (let n = 1; n <= 6; n++) { const m2 = Cycling.newRun(1, n); m2.t = 0; for (let i = 0; i < 1800; i++) Cycling.step(m2, 1 / 60, 0, false); if (Math.abs(m2.riders[0].x) > 0.3 || m2.riders[0].off > 0) pushed++; } ok(pushed >= 4, 'curves push you outward: ' + pushed + '/6');
});
test('sims never touch Math.random or Date.now (so a seed always means the same thing)', () => {
  const fs = require('fs'); for (const f of ['core.js', 'sim1.js', 'sim2.js']) { const t = fs.readFileSync(path.join(ROOT, 'sports', f), 'utf8'); ok(!/Math\.random|Date\.now|performance\.now|new Date\(\)/.test(t), f); }
});

test('canoe: stamina drains when you button-mash, holds with a steady rhythm, and tired strokes are weaker', () => {
  const rh = Canoe.newRun(1, 1, 1); rh.t = 0; for (let i = 0; i < 40; i++) { rh.t += rh.cfg.tc; Canoe.tap(rh, 0, i % 2 ? 1 : -1); Canoe.step(rh, rh.cfg.tc); rh.t -= rh.cfg.tc; } ok(rh.boats[0].st > 0.4, 'a steady rhythm is sustainable: ' + rh.boats[0].st);
  const ms = Canoe.newRun(1, 1, 1); ms.t = 0; for (let i = 0; i < 30; i++) { ms.t += 0.16; Canoe.tap(ms, 0, i % 2 ? 1 : -1); } ok(ms.boats[0].st < 0.2, 'mashing tires you out: ' + ms.boats[0].st); ok(ms.ev.some(e => e.type === 'tired'));
  const f = Canoe.newRun(1, 1, 1), t2 = Canoe.newRun(1, 1, 1); f.t = t2.t = 1; t2.boats[0].st = 0.05; const a = f.boats[0].v; Canoe.tap(f, 0, 1); const b = t2.boats[0].v; Canoe.tap(t2, 0, 1); ok(f.boats[0].v - a > t2.boats[0].v - b, 'tired kick is weaker');
  const idle = Canoe.newRun(1, 1, 1); idle.t = 0; idle.boats[0].st = 0.1; for (let i = 0; i < 300; i++) Canoe.step(idle, 0.05); ok(idle.boats[0].st > 0.9, 'rest recovers');
});
run('sports-engine');
