// invade/engine.js (ほしぞら守備隊) の単体テスト：同じ種＋同じ入力＝同じ状態、行進のスピードアップの式、移動・撃つ・当たり判定、
// シールドの削れ方、スコア（連鎖・エクステンド・上限）、UFO とアイテム、ボス、セッション（交代・協力）、ウェーブの作り方
// 実行：node tools/tests/unit/invade-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'invade/engine.js'));
const LV = require(path.join(ROOT, 'invade/levels.js'));
const Bot = require(path.join(ROOT, 'invade/bot.js'));
const IN = E.IN;

// a quiet arena: classic wave 1, no enemy fire, no saucer, a small formation we place ourselves
function arena(o) {
  const S = E.newGame(Object.assign({ mode: 'classic', seed: 3 }, o || {}));
  S.phase = 'play'; S.pt = 0; S.spec.pat = []; S.spec.su = 0; S.su = 99999; S.spec.dv = 0; S.dvT = 99999;
  S.al.length = 0; S.ga = 0; S.gt = 1; S.eb.length = 0; S.fy = 60; S.mn = [{ x: 120, y: -90000, vx: 0, vy: 0, hp: 1, fl: 0, ph: 0 }];
  for (const p of S.pl) p.inv = 0;
  if (!(o && o.sh)) S.sh = [];
  return S;
}
const alien = (S, t, x, y, o) => { const a = Object.assign({ t, hp: LV.ENEMY[t].hp, mh: LV.ENEMY[t].hp, r: 0, c: 0, x, y, fl: 0, st: 1, alive: true, rv: 0, tm: 999, ph: 0, vx: 0, vy: 0 }, o || {}); a.st = (o && o.st != null) ? o.st : 3; S.al.push(a); S.ga++; S.gt = Math.max(S.gt, S.ga); return a; };
const idle = (S, n, m, x) => { for (let i = 0; i < (n || 1); i++) { E.step(S, m || 0, 0, x); } };
const nearly = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b);

test('own sin/cos: close to Math, exact on repeat', () => {
  for (let a = -20; a <= 20; a += 0.37) { nearly(E.sin(a), Math.sin(a), 2e-5, 'sin ' + a); nearly(E.cos(a), Math.cos(a), 2e-5, 'cos ' + a); }
});

test('determinism: the same seed and inputs give the same hash at every checkpoint; another seed differs', () => {
  const run1 = seed => { const S = E.newGame({ mode: 'classic', seed }); const bot = Bot.make(); const h = []; for (let i = 0; i < 3000; i++) { const a = bot(S, 0); E.step(S, a.m, 0); S.ev.length = 0; if (i % 500 === 499) h.push(E.hash(S)); } return h; };
  deep(run1(11), run1(11)); ok(JSON.stringify(run1(11)) !== JSON.stringify(run1(12)), 'another seed gives another game');
});

test('the march speed-up law: interval = floor(mi + (bi - mi) * alive / total), falling as aliens die, never below 1', () => {
  const sp = { bi: 36, mi: 3 };
  eq(E.interval(55, 55, sp), 36); eq(E.interval(1, 55, sp), 3); eq(E.interval(0, 55, sp), 3);
  let prev = 99; for (let n = 55; n >= 1; n--) { const v = E.interval(n, 55, sp); ok(v <= prev, 'monotone at ' + n); prev = v; }
  eq(E.interval(28, 55, sp), 3 + Math.floor(33 * 28 / 55));
  // and in the running game: the real gap between marches shrinks
  const S = arena(); S.spec.bi = 30; S.spec.mi = 2;
  for (let c = 0; c < 10; c++) alien(S, 0, 40 + c * 18, 60, { st: 0, c, r: 0 }); S.gt = 10; S.fx = 40; S.fy = 60; S.mt = 1;
  const gaps = (n) => { S.al.forEach((a, i) => { a.alive = i < n; }); S.ga = n; const f = []; let last = -1; for (let i = 0; i < 400; i++) { idle(S, 1, 0); for (const e of S.ev) if (e.t === 'march') { if (last >= 0) f.push(S.frame - last); last = S.frame; } S.ev.length = 0; } return f; };
  const g10 = gaps(10), g1 = gaps(1);
  ok(g10.length > 3 && g1.length > 20, 'marches happened'); ok(Math.min(...g10) >= 26, 'full formation is slow ' + g10[1]); ok(Math.max(...g1) <= 6, 'the last alien is fast ' + g1[1]);
});

test('the formation edges: it drops one row and reverses at the wall, and marching is a fixed step', () => {
  const S = arena(); for (let c = 0; c < 3; c++) alien(S, 0, 0, 0, { st: 0, c, r: 0 }); S.fx = 200; S.fy = 60; S.dir = 1; S.mt = 1; S.spec.bi = 8; S.spec.mi = 8;
  const xs = []; let dropped = 0; for (let i = 0; i < 80; i++) { idle(S, 1, 0); for (const e of S.ev) if (e.t === 'drop') dropped++; S.ev.length = 0; xs.push(S.fx); }
  eq(dropped >= 1, true); eq(S.dir, -1); eq(S.fy, 68, 'one drop of 8 px'); ok(S.al.every(a => a.x >= 3 && a.x <= 237));
});

test('movement: keys move 2.3 px per frame and stop at the walls; a drag target moves up to 4.2 px per frame', () => {
  const S = arena(); const p = S.pl[0]; p.x = 120;
  idle(S, 10, IN.L); nearly(p.x, 120 - 23, 0.01); idle(S, 10, IN.R); nearly(p.x, 120, 0.01);
  idle(S, 200, IN.L); eq(p.x, 9); idle(S, 200, IN.R); eq(p.x, 231);
  p.x = 100; idle(S, 1, 0, 200); nearly(p.x, 104.2, 1e-9); idle(S, 40, 0, 200); eq(p.x, 200);
});

test('shooting: one bullet per press cycle, cooldown 12, at most 4 in flight; rapid fire is faster; spread fires three', () => {
  const S = arena(); const p = S.pl[0];
  idle(S, 1, IN.FIRE); eq(S.pb.length, 1); idle(S, 11, IN.FIRE); eq(S.pb.length, 1); idle(S, 1, IN.FIRE); eq(S.pb.length, 2);
  idle(S, 60, IN.FIRE); ok(S.pb.length <= 4, 'max 4 in flight'); ok(S.st.shots >= 3);
  const R = arena(); R.pl[0].rap = 600; idle(R, 24, IN.FIRE); ok(R.st.shots >= 4, 'rapid: ' + R.st.shots);
  const P = arena(); P.pl[0].spr = 600; idle(P, 1, IN.FIRE); eq(P.pb.length, 3); ok(P.pb[0].vx < 0 && P.pb[2].vx > 0);
  void p;
});

test('a bullet kills a Purun (+10), a Helm needs two hits, a Twin splits in two Tinies, a chain multiplies the points', () => {
  const S = arena(); const p = S.pl[0]; p.x = 100;
  alien(S, 0, 100, 200); idle(S, 1, IN.FIRE); idle(S, 40, 0);
  eq(S.score, 10); eq(S.st.kills, 1);
  const H = arena(); H.pl[0].x = 100; const h = alien(H, 2, 100, 200); idle(H, 1, IN.FIRE); idle(H, 40, 0);
  eq(h.alive, true); eq(h.hp, 1); idle(H, 12, 0); idle(H, 1, IN.FIRE); idle(H, 40, 0); eq(h.alive, false); eq(H.score, 30);
  const T = arena(); T.pl[0].x = 100; alien(T, 3, 100, 200); idle(T, 1, IN.FIRE); idle(T, 40, 0); eq(T.mn.length, 3, '2 Tinies + the test dummy'); eq(T.st.splits, 1);
  const C = arena(); for (let i = 0; i < 6; i++) alien(C, 0, 20 + i * 30, 100);
  for (let i = 0; i < 6; i++) { C.pl[0].x = 20 + i * 30; C.pl[0].cd = 0; idle(C, 1, IN.FIRE); idle(C, 12, 0); }
  idle(C, 30, 0);
  eq(C.st.kills, 6); eq(C.st.maxChain, 6); eq(C.score, 10 * 5 + 20, 'x2 from the 6th kill');
});

test('a piercing shot passes through aliens and a plain shot does not; bullets cancel enemy bullets', () => {
  const S = arena(); S.pl[0].x = 100; S.pl[0].prc = 600; alien(S, 0, 100, 200); alien(S, 0, 100, 150); alien(S, 0, 100, 100);
  idle(S, 1, IN.FIRE); idle(S, 60, 0); eq(S.st.kills, 3);
  const N = arena(); N.pl[0].x = 100; alien(N, 0, 100, 200); alien(N, 0, 100, 150); idle(N, 1, IN.FIRE); idle(N, 60, 0); eq(N.st.kills, 1);
  const B = arena(); B.pl[0].x = 100; E.eshot(B, 100, 150, 0, 0, 0); idle(B, 1, IN.FIRE); idle(B, 30, 0); eq(B.eb.length, 0);
});

test('being hit: a life is lost, the chain resets, the base is invincible after respawning; a barrier absorbs one hit; invasion costs a life', () => {
  const S = arena(); const p = S.pl[0]; p.x = 100; S.chain = 7; S.ct = 50;
  E.eshot(S, 100, 290, 0, 0, 1); idle(S, 2, 0);
  eq(S.lives, 2); eq(S.chain, 0); ok(p.dead > 0);
  idle(S, 120, 0); eq(p.dead, 0); ok(p.inv > 0, 'respawn invincibility'); E.eshot(S, p.x, 292, 0, 0, 1); idle(S, 2, 0); eq(S.lives, 2, 'invincible');
  const B = arena(); B.pl[0].x = 100; B.pl[0].sh = 600; E.eshot(B, 100, 290, 0, 0, 1); idle(B, 2, 0); eq(B.lives, 3); eq(B.pl[0].sh, 0);
  const V = arena(); alien(V, 0, 100, 258, { st: 0, c: 0, r: 0 }); V.fx = 100; V.fy = 258; V.mt = 1; idle(V, 2, 0); eq(V.lives, 2, 'invaded');
  const G = arena({ mode: 'survival' }); eq(G.lives, 1); G.pl[0].sh = 0; E.eshot(G, G.pl[0].x, 290, 0, 0, 1); idle(G, 2, IN.L); eq(G.phase, 'over'); ok(G.over);
});

test('shields: an enemy shot erodes a few cells, a bomb many; a player shot removes two; repair restores', () => {
  const S = arena({ sh: 1 }); const sh = S.sh[0], n0 = sh.n;
  E.eshot(S, sh.x + 12, sh.y - 6, 0, 0, 2); idle(S, 12, 0);
  ok(sh.n < n0 && sh.n >= n0 - 12, 'zap ' + (n0 - sh.n)); const n1 = sh.n;
  E.eshot(S, sh.x + 12, sh.y + 2 - 6, 3, 0, 1.5); idle(S, 15, 0);
  ok(sh.n < n1 - 8, 'bomb ' + (n1 - sh.n));
  const P = arena({ sh: 1 }); const s2 = P.sh[1]; P.pl[0].x = s2.x + 3; const m0 = s2.n; idle(P, 1, IN.FIRE); idle(P, 30, 0);
  eq(s2.n, m0 - 2, 'player shot: two cells');
  ok(E.shieldRatio(S) < 1); E.repairShields(S); eq(E.shieldRatio(S), 1);
  const D = arena({ sh: 1 }); const s4 = D.sh[2]; alien(D, 0, s4.x + 12, s4.y + 4, { st: 0, c: 0, r: 0 }); D.fx = s4.x + 12; D.fy = s4.y + 4; D.mt = 99; idle(D, 2, 0); ok(s4.n < E.SHN, 'an alien in the shield eats it');
});

test('scoring: x1..x5 by chain, the chain times out, extra lives at 20,000 and 60,000, the score is capped', () => {
  const S = arena(); const expected = []; for (let i = 0; i < 26; i++) { const before = S.score; alien(S, 0, 10 + i * 8, 100); const a = S.al[S.al.length - 1]; E.hurtAlien(S, a, 1); expected.push(S.score - before); }
  eq(expected[0], 10); eq(expected[4], 10); eq(expected[5], 20); eq(expected[10], 30); eq(expected[15], 40); eq(expected[20], 50); eq(expected[25], 50);
  idle(S, 120, 0); eq(S.chain, 0, 'timed out');
  const L = arena(); L.score = 19990; L.lives = 3; alien(L, 0, 100, 100); E.hurtAlien(L, L.al[0], 1); eq(L.lives, 4, '+1 at 20k'); L.score = 59990; alien(L, 0, 100, 100); E.hurtAlien(L, L.al[1], 1); eq(L.lives, 5, '+1 at 60k');
  const C = arena(); C.score = E.SCORE_CAP - 5; alien(C, 0, 100, 100); E.hurtAlien(C, C.al[0], 1); eq(C.score, E.SCORE_CAP);
});

test('the Moon Bus: shooting it scores 50-300 and drops a capsule; capsules do what they say (spread, rapid, pierce, barrier, slow, bomb, repair)', () => {
  const S = arena(); S.pl[0].x = 100; S.sau = { x: 100, y: 26, vx: 0, v: 150 }; idle(S, 1, IN.FIRE); idle(S, 60, 0);
  eq(S.st.saucers, 1); ok(S.score >= 150); eq(S.caps.length, 1);
  const kinds = []; for (let k = 0; k < 7; k++) { const T = arena({ sh: 1 }); const p = T.pl[0]; p.x = 100; T.sh[0].g.fill(0); T.sh[0].n = 0; E.dropCap(T, 100, 285, k); idle(T, 3, 0); kinds.push([p.spr > 0, p.rap > 0, p.prc > 0, p.sh > 0, T.slow > 0, p.bb === 2, T.sh[0].n === E.SHN][k]); eq(T.st.caps, 1); }
  deep(kinds, [true, true, true, true, true, true, true]);
  const B = arena(); B.mn.length = 0; B.pl[0].x = 100; alien(B, 0, 90, 150, { st: 0, c: 0, r: 0 }); alien(B, 4, 120, 120, { st: 0, c: 1, r: 0 }); E.eshot(B, 100, 200, 0, 0, 0);
  B.fx = 90; B.fy = 150; B.mt = 99; idle(B, 1, IN.BOMB); eq(B.eb.length, 0, 'bomb clears bullets'); eq(B.st.kills, 2); eq(B.pl[0].bb, 0);
});

test('the capsule bag: all seven kinds appear in every seven drops', () => {
  const S = arena(); const got = []; for (let i = 0; i < 14; i++) { E.dropCap(S, 10, 10); got.push(S.caps[S.caps.length - 1].k); }
  deep(got.slice(0, 7).slice().sort(), [0, 1, 2, 3, 4, 5, 6]); deep(got.slice(7).slice().sort(), [0, 1, 2, 3, 4, 5, 6]);
});

test('divers break formation and come back; a Medi heals a damaged Helm and revives a fallen friend once', () => {
  const S = arena(); S.spec.dv = 10; alien(S, 4, 100, 100, { st: 0, c: 3, r: 0 }); alien(S, 0, 118, 100, { st: 0, c: 4, r: 0 }); S.gt = 2; S.fx = 100 - 54; S.fy = 100; S.dvT = 1; S.mt = 99999; S.spec.mi = S.spec.bi = 99999;
  S.pl[0].inv = 99999; let dived = false, back = false; for (let i = 0; i < 700; i++) { idle(S, 1, 0); if (S.al[0].st === 1) dived = true; if (dived && S.al[0].st === 0) { back = true; break; } S.spec.dv = 0; }
  ok(dived && back, 'dived and returned');
  const M = arena(); const h = alien(M, 5, 100, 100, { st: 0, c: 3, r: 0, tm: 3, rv: 1 }); const s = alien(M, 2, 118, 100, { st: 0, c: 4, r: 0 }); s.hp = 1;
  const d = alien(M, 0, 82, 100, { st: 0, c: 2, r: 0 }); d.alive = false; M.ga--; M.fx = 100 - 54; M.fy = 100; M.mt = 99999;
  idle(M, 6, 0); eq(s.hp, 2, 'healed'); h.tm = 3; idle(M, 6, 0); eq(d.alive, true, 'revived'); eq(h.rv, 0); h.tm = 3; d.alive = false; M.ga--; idle(M, 6, 0); eq(d.alive, false, 'only once');
});

test('a wave ends when the last alien dies: bonus, perfect bonus, then the next wave arrives with a new formation', () => {
  const S = arena(); S.mn.length = 0; S.pl[0].x = 100; alien(S, 0, 100, 200); idle(S, 1, IN.FIRE); idle(S, 40, 0);
  eq(S.phase, 'clear'); ok(S.cb.perfect); ok(S.score > 1500); const wave = S.wave; idle(S, E.CLEAR + 2, 0); eq(S.wave, wave + 1); eq(S.phase, 'intro'); ok(S.al.length > 0);
  idle(S, E.INTRO + 5, 0); eq(S.phase, 'play');
});

test('bosses: HP, three phases, defeat clears the wave and drops capsules', () => {
  const S = E.newGame({ mode: 'classic', seed: 5 }); E.startWave(S, 5); ok(S.boss, 'wave 5 is a boss'); eq(S.spec.kind, 'boss');
  idle(S, E.INTRO + 5, 0); eq(S.phase, 'play'); S.pl[0].inv = 99999; S.spec.su = 0; S.su = 99999;
  const mh = S.boss.mh; let fired = 0; const phases = [];
  for (const f of [0.9, 0.6, 0.3]) { S.boss.hp = Math.floor(mh * f); E.hurtBoss(S, 0); phases.push(S.boss.ph); for (let i = 0; i < 300; i++) { idle(S, 1, 0); fired += S.ev.filter(e => e.t === 'bfire').length; S.ev.length = 0; S.pl[0].inv = 99999; } }
  deep(phases, [0, 1, 2]); ok(fired >= 5, 'the boss fires');
  S.boss.hp = 1; S.boss.y = 58; for (let i = 0; i < 400 && !S.boss.dead; i++) { S.pl[0].x = S.boss.x; idle(S, 1, IN.FIRE); }
  eq(S.boss.dead, true); eq(S.phase, 'clear'); ok(S.caps.length >= 2); eq(S.st.bosses, 1); ok(S.score >= 3000);
});

test('every boss pattern produces bullets or hazards (fan, ring, rain, line, bomb, sum, beam)', () => {
  const seen = {};
  for (let k = 0; k < 9; k++) {
    const S = E.newGame({ mode: 'classic', seed: 9 }); E.startWave(S, 5 * (k + 1)); idle(S, E.INTRO + 2, 0); S.pl[0].inv = 99999;
    ok(S.boss.k === k, 'boss ' + k);
    for (let i = 0; i < 2600; i++) { S.boss.hp = Math.floor(S.boss.mh * (i < 900 ? 0.9 : i < 1800 ? 0.5 : 0.2)); if (i % 900 === 0) E.hurtBoss(S, 0); idle(S, 1, 0); for (const e of S.ev) if (e.t === 'bfire') seen[e.a] = 1; S.ev.length = 0; S.pl[0].inv = 99999; }
  }
  deep(Object.keys(seen).sort(), ['beam', 'bomb', 'fan', 'line', 'rain', 'ring', 'sum']);
});

test('alternating two players swap after each lost life; co-op shares the lives and the score', () => {
  const se = E.newSession({ mode: 'classic', seed: 4, mp: 'alt' }); eq(se.g.length, 2); eq(se.cur, 0);
  const g0 = se.g[0]; g0.phase = 'play'; g0.spec.pat = []; g0.pl[0].inv = 0; E.eshot(g0, g0.pl[0].x, 290, 0, 0, 1);
  for (let i = 0; i < 160 && se.cur === 0; i++) E.sessionStep(se, 0, 0); eq(se.cur, 1, 'player 2 is up'); eq(g0.lives, 2);
  const g1 = se.g[1]; g1.phase = 'play'; g1.spec.pat = []; g1.pl[0].inv = 0; E.eshot(g1, g1.pl[0].x, 290, 0, 0, 1); for (let i = 0; i < 160 && se.cur === 1; i++) E.sessionStep(se, 0, 0); eq(se.cur, 0, 'back to player 1'); ok(!g0.hold);
  const co = E.newSession({ mode: 'classic', seed: 4, mp: 'coop' }); const C = co.g[0]; eq(C.np, 2); eq(C.pl.length, 2); eq(C.lives, 4);
  C.phase = 'play'; C.spec.pat = []; C.al.length = 0; C.ga = 0; C.mn = [{ x: 1, y: -9e4, vx: 0, vy: 0, hp: 1, fl: 0, ph: 0 }]; C.pl.forEach(q => { q.inv = 0; }); C.sh = []; E.eshot(C, C.pl[1].x, 290, 0, 0, 1); idle(C, 3, 0); eq(C.lives, 3); eq(C.pl[0].dead, 0); ok(C.pl[1].dead > 0);
  idle(C, 150, 0); eq(C.pl[1].dead, 0, 'the partner is back');
});

test('wave generation is deterministic; a boss every 5th wave, a bonus every 5th + 3; pressure only grows', () => {
  for (let w = 1; w <= 60; w++) { deep(LV.gen(w, { mode: 'classic' }), LV.gen(w, { mode: 'classic' }), 'wave ' + w); eq(LV.gen(w).kind, w % 5 === 0 ? 'boss' : w % 5 === 3 ? 'bonus' : 'wave', 'kind ' + w); }
  let prev = 0, prevFi = 999; for (let w = 1; w <= 40; w++) { const s = LV.gen(w, { mode: 'classic' }); if (s.kind !== 'wave') continue; ok(s.bv >= prev - 1e-9, 'bullet speed grows'); prev = s.bv; ok(s.fi <= prevFi, 'fire interval shrinks'); prevFi = s.fi; }
  const h = []; for (let w = 1; w <= 12; w++) { const S = E.newGame({ mode: 'classic', seed: 21 }); E.startWave(S, w); h.push(E.hash(S)); } const h2 = []; for (let w = 1; w <= 12; w++) { const S = E.newGame({ mode: 'classic', seed: 21 }); E.startWave(S, w); h2.push(E.hash(S)); } deep(h, h2);
  ok(new Set(LV.gen(40, {}).mask.join('')).size > 2, 'later waves are mixed');
});

test('the daily challenge: same day, same setup; two different rules; six waves ending with a boss; applying the rules', () => {
  const a = E.dailyFor(20261127), b = E.dailyFor(20261127), c = E.dailyFor(20261128); deep(a, b); ok(a.seed !== c.seed);
  for (let d = 20260101; d < 20260140; d++) { const x = E.dailyFor(d); ok(x.mods[0] !== x.mods[1]); ok(x.mods.every(m => LV.MODS.some(q => q.id === m))); }
  const S = E.newGame({ mode: 'daily', seed: a.seed, mods: ['nosh', 'fast'], rot: a.rot }); eq(S.spec.sh, 0); eq(S.sh.length, 0); eq(S.lives, 4);
  const w6 = E.newGame({ mode: 'daily', seed: 1, mods: [] }); E.startWave(w6, 6); eq(w6.spec.kind, 'boss'); w6.phase = 'clear'; w6.pt = E.CLEAR; E.step(w6, 0, 0); eq(w6.phase, 'done'); eq(w6.won, true);
  const G = E.newGame({ mode: 'daily', seed: 1, mods: ['gold'] }); eq(G.lives, 2); const Z = E.newGame({ mode: 'daily', seed: 1, mods: ['zig'] }); ok(!Z.al.some(x => x.t === 0));
});

test('campaign: stars (1 clear, 2 no life lost, 3 no life lost and the shields hold), the stage ends with "done"', () => {
  const S = E.newGame({ mode: 'campaign', level: 0, seed: 2 }); S.phase = 'play'; S.spec.pat = []; S.spec.su = 0; S.su = 99999; for (const a of S.al) { a.alive = false; } S.ga = 0; idle(S, 2, 0);
  eq(S.stars, 3, 'untouched = 3 stars'); idle(S, E.CLEAR + 2, 0); eq(S.phase, 'done'); eq(S.won, true);
  const T = E.newGame({ mode: 'campaign', level: 0, seed: 2 }); T.phase = 'play'; T.spec.pat = []; T.st.lost = 1; for (const a of T.al) a.alive = false; T.ga = 0; idle(T, 2, 0); eq(T.stars, 1);
  const U = E.newGame({ mode: 'campaign', level: 0, seed: 2 }); U.phase = 'play'; U.spec.pat = []; U.sh.forEach(s => { s.g.fill(0); s.n = 0; }); for (const a of U.al) a.alive = false; U.ga = 0; idle(U, 2, 0); eq(U.stars, 3 - 1 + 0 === 2 ? 2 : U.stars, 'eroded shields: 2 stars');
});

test('bonus waves have gems that never shoot and end by the clock; the endless mode never loses a life', () => {
  const S = E.newGame({ mode: 'classic', seed: 3 }); E.startWave(S, 3); eq(S.spec.kind, 'bonus'); ok(S.al.every(a => a.t === 8)); idle(S, E.INTRO + 2, 0); for (let i = 0; i < 600; i++) { idle(S, 1, 0); S.pl[0].x = 100 + (i % 50); } eq(S.eb.length, 0);
  S.bt = 1; idle(S, 3, 0); eq(S.phase, 'clear');
  const N = arena({ mode: 'endless' }); E.eshot(N, N.pl[0].x, 290, 0, 0, 1); idle(N, 2, 0); eq(N.lives, 3); ok(N.pl[0].dead > 0); idle(N, 80, 0); eq(N.pl[0].dead, 0);
});

test('slow time halves the enemy world (bullets fall at half speed on average)', () => {
  const S = arena(); S.slow = 600; E.eshot(S, 100, 100, 0, 0, 1.2); idle(S, 60, 0); nearly(S.eb[0].y, 100 + 60 * 0.6, 1.5);
});

test('assist: the slow assist makes the march slower and the shots gentler', () => {
  const a = E.newGame({ mode: 'classic', seed: 3 }), b = E.newGame({ mode: 'classic', seed: 3, assist: 1 });
  ok(b.spec.bi > a.spec.bi); ok(b.spec.bv < a.spec.bv); ok(b.spec.fi > a.spec.fi);
});

run('invade-engine');
