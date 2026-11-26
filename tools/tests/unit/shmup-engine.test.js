// shmup/engine.js (ペーパーウイング) の単体テスト：決まった結果（同じ種＋同じ入力＝同じ状態）、当たり判定・グレイズ・シールド・デスボム、
// 弾のパターン（狙い・輪・渦・カーテン・ホーミング・レーザー）、ボスのフェーズ、スコア（連鎖・エクステンド・上限）、アイテム、リプレイ、デイリー、登録簿の下書き。
// 実行：node tools/tests/unit/shmup-engine.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const { ROOT, test, eq, ok, deep, throws, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'shmup/engine.js'));
const D = require(path.join(ROOT, 'shmup/stages.js'));
const Bot = require(path.join(ROOT, 'shmup/bot.js'));
const IN = E.IN;

// a quiet arena: practice stage 1, no scripted spawns, the boss far away
function arena(o) {
  const S = E.newGame(Object.assign({ mode: 'practice', diff: 1, ship: 0, seed: 3, stage: 0 }, o || {}));
  S.script = []; S.sf = -100000; S.p.inv = 0; S.p.x = 100; S.p.y = 135;
  return S;
}
const idle = (S, n, inp) => { for (let i = 0; i < (n || 1); i++) E.step(S, inp || 0); };
const scripted = frames => { const r = E.mkRng(99); const out = []; let cur = 0; for (let i = 0; i < frames; i++) { if (i % 20 === 0) cur = (Math.floor(r() * 16) & 15) | (r() < 0.8 ? IN.SHOOT : 0) | (r() < 0.1 ? IN.FOCUS : 0) | (r() < 0.02 ? IN.BOMB : 0); out.push(cur); } return out; };
const nearly = (a, b, tol, msg) => ok(Math.abs(a - b) <= tol, (msg || '') + ' ' + a + ' vs ' + b);

test('own sin/cos: close to Math, exact on repeat, odd/even', () => {
  for (let a = -20; a <= 20; a += 0.37) { nearly(E.sin(a), Math.sin(a), 2e-5, 'sin ' + a); nearly(E.cos(a), Math.cos(a), 2e-5, 'cos ' + a); }
  eq(E.sin(0), 0); nearly(E.sin(Math.PI / 2), 1, 1e-6); nearly(E.sin(-1.3), -E.sin(1.3), 1e-12);
});

test('determinism: the same seed and inputs give the same state hash at every checkpoint for 3000 frames', () => {
  const inputs = scripted(3000);
  const hs = seed => { const S = E.newGame({ mode: 'arcade', diff: 1, ship: 0, seed }); const h = []; for (let i = 0; i < 3000; i++) { E.step(S, inputs[i]); S.ev.length = 0; if (i % 500 === 499) h.push(E.hash(S)); } return h; };
  deep(hs(7), hs(7)); ok(hs(7).join() !== hs(8).join(), 'a different seed differs');
  const S1 = E.newGame({ mode: 'arcade', diff: 1, ship: 1, seed: 7 }), S2 = E.newGame({ mode: 'arcade', diff: 1, ship: 1, seed: 7 });
  for (let i = 0; i < 3000; i++) { E.step(S1, inputs[i]); E.step(S2, i === 120 ? inputs[i] ^ IN.U : inputs[i]); }
  ok(E.hash(S1) !== E.hash(S2), 'one different input changes the future');
  // events never feed back into the sim
  const A = E.newGame({ mode: 'arcade', diff: 2, ship: 2, seed: 11 }), B = E.newGame({ mode: 'arcade', diff: 2, ship: 2, seed: 11 });
  for (let i = 0; i < 1200; i++) { E.step(A, inputs[i]); E.step(B, inputs[i]); B.ev.length = 0; }
  eq(E.hash(A), E.hash(B));
});

test('data: 7 stages, at least 20 enemy types, 7 bosses with 3+ phases, every script names real enemies and is sorted', () => {
  eq(D.STAGES.length, 7); ok(D.EN_IDS.length >= 20, 'enemy types ' + D.EN_IDS.length); eq(D.BOSS.length, 7); eq(D.SHIPS.length, 3); eq(D.DIFF.length, 4);
  deep(D.DIFF.map(d => d.ja), ['やさしい', 'ふつう', 'むずかしい', 'ゆうれい']);
  D.BOSS.forEach(b => { ok(b.ph.length >= 3 && b.ph.length === b.hp.length, b.id); b.ph.forEach(p => { ok(p.ja && p.en && p.atk.length, b.id); p.atk.forEach(a => ok(E.PAT[a.p], 'pattern ' + a.p)); }); });
  D.STAGES.forEach((st, i) => {
    ok(st.ja && st.en && D.BOSS[st.boss], 'stage ' + i);
    const sc = D.buildScript(i, E.mkRng(5), 1, false); ok(sc.length > 20, 'script length ' + i);
    for (let k = 0; k < sc.length; k++) { ok(D.EN[sc[k].type], 'enemy ' + sc[k].type); if (k) ok(sc[k].t >= sc[k - 1].t, 'sorted'); }
    deep(sc.map(s => s.t + s.type), D.buildScript(i, E.mkRng(5), 1, false).map(s => s.t + s.type));
  });
  const used = new Set(); D.STAGES.forEach((st, i) => D.buildScript(i, E.mkRng(5), 1, false).forEach(s => used.add(s.type)));
  ok(used.size >= 20, 'enemy types used across stages: ' + used.size);
  const ps = new Set(); D.EN_IDS.forEach(id => (D.EN[id].fire || []).forEach(f => ps.add(f.p))); D.BOSS.forEach(b => b.ph.forEach(p => p.atk.forEach(a => ps.add(a.p))));
  for (const k of ['aimed', 'ring', 'spiral', 'curtain', 'homing', 'laser']) ok(ps.has(k), 'pattern in use: ' + k);
  deep(D.buildScript(2, E.mkRng(5), 1, true), []);
});

test('collision: only the small core is hit; graze counts once per bullet; invulnerability, shield, deathbomb, game over, continue', () => {
  let S = arena(); S.p.x = 100; S.p.y = 100;
  E.addBullet(S, 100 + 9, 100, 0, 0, 0, 0); idle(S);            // outside core+radius (3+2.2) but inside the graze ring
  eq(S.p.dying, 0); eq(S.st.graze, 1, 'grazed');
  idle(S, 5); eq(S.st.graze, 1, 'the same bullet grazes only once');
  E.addBullet(S, 100 + 4, 100, 0, 0, 0, 0); idle(S);            // inside the core
  ok(S.p.dying > 0, 'hit starts the death-bomb window');
  idle(S, 9); eq(S.lives, 2); ok(S.p.inv > 100, 'respawn invulnerability');
  // invulnerable: a bullet on top does nothing
  E.addBullet(S, S.p.x, S.p.y, 0, 0, 0, 0); idle(S); eq(S.p.dying, 0); eq(S.lives, 2);
  // shield absorbs one hit
  S = arena(); S.shield = 1; E.addBullet(S, S.p.x, S.p.y, 0, 0, 0, 0); idle(S);
  eq(S.shield, 0); eq(S.lives, 3); ok(S.p.inv > 50, 'shield gives a moment of grace'); eq(S.p.dying, 0);
  // deathbomb: pressing bomb inside the window saves the life
  S = arena(); E.addBullet(S, S.p.x, S.p.y, 0, 0, 0, 0); idle(S); ok(S.p.dying > 0);
  idle(S, 3); E.step(S, IN.BOMB); eq(S.p.dying, 0); eq(S.bombs, 2); idle(S, 20); eq(S.lives, 3, 'saved');
  // assist auto-bomb
  S = arena({ assist: 2 }); E.addBullet(S, S.p.x, S.p.y, 0, 0, 0, 0); idle(S); eq(S.bombs, 2); eq(S.p.dying, 0); eq(S.lives, 3);
  // enemy body hurts too
  S = arena(); E.spawnEnemy(S, 'rivet', 135, {}); S.ene[0].x = S.p.x; S.ene[0].y = S.p.y; idle(S); ok(S.p.dying > 0 || S.lives < 3, 'body contact');
  // game over, then continue (score halves, limited by difficulty)
  S = arena({ diff: 1 }); S.lives = 1; S.score = 10000; E.addBullet(S, S.p.x, S.p.y, 0, 0, 0, 0); idle(S, 12);
  eq(S.phase, 'over'); ok(S.over); const f = S.frame; idle(S, 5); ok(S.frame > f);
  E.step(S, IN.CONT); eq(S.phase, 'play'); eq(S.conts, 1); eq(S.score, 5000); eq(S.lives, 3); ok(S.p.inv > 100);
  S = arena({ diff: 3 }); eq(S.maxConts, 0); S.lives = 1; E.addBullet(S, S.p.x, S.p.y, 0, 0, 0, 0); idle(S, 12); E.step(S, IN.CONT); eq(S.phase, 'over', 'ghost has no continues');
  eq(E.newGame({ diff: 0 }).maxConts, 5); eq(E.newGame({ diff: 2 }).maxConts, 1);
  // the hitbox is smaller with the tiny-core daily rule, bigger with big core
  ok(E.newGame({ mods: ['tiny'] }).hitr < E.newGame({}).hitr && E.newGame({ mods: ['big'] }).hitr > E.newGame({}).hitr);
});

test('player: speed levels, focus is slower, borders, no-focus rule, small hitbox radius', () => {
  const mv = (o, inp, n) => { const S = arena(o); const x0 = S.p.x; idle(S, n || 10, inp); return S.p.x - x0; };
  const a = mv({}, IN.R), f = mv({}, IN.R | IN.FOCUS); ok(f < a * 0.5 && f > 0, 'focus slower'); nearly(a, 10 * 2.68, 0.01);
  const S = arena(); S.spd = 3; const x0 = S.p.x; idle(S, 10, IN.R); ok(S.p.x - x0 > a * 1.2, 'speed level');
  const d = mv({}, IN.R | IN.U), dd = 10 * 2.68 * 0.7071; nearly(d, dd, 0.01, 'diagonals are normalised');
  const T = arena(); idle(T, 400, IN.L | IN.U); eq(T.p.x, 10); eq(T.p.y, 10);
  const nf = arena({ mods: ['nofocus'] }); const xn = nf.p.x; idle(nf, 10, IN.R | IN.FOCUS); nearly(nf.p.x - xn, 26.8, 0.01, 'focus disabled');
  ok(E.newGame({}).hitr <= 2.5, 'the core is tiny');
});

test('weapons: levels add shots, options fire, each ship differs, the stork charge shot, bombs clear bullets and use stock', () => {
  const shots = (ship, lv) => { const S = arena({ ship }); S.power = lv; E.step(S, IN.SHOOT); return S.sht.filter(s => s.a).length; };
  deep([0, 1, 2, 3, 4].map(l => shots(0, l)), [1, 2, 3, 4, 5]); deep([0, 1, 2, 3, 4].map(l => shots(1, l)), [1, 2, 3, 4, 4].map((x, i) => [1, 2, 3, 4, 4][i])); ok(shots(2, 4) > shots(2, 0));
  let S = arena({ ship: 0 }); S.opt = 2; idle(S, 30, IN.SHOOT); ok(S.sht.some(s => s.a && s.hm), 'homing missiles from options');
  S = arena({ ship: 1 }); idle(S, 60, IN.SHOOT); const before = S.st.kills; E.step(S, 0); ok(S.sht.some(s => s.a && s.k === 4 && s.dmg >= 80), 'full charge on release');
  S = arena({ ship: 1 }); idle(S, 40, IN.SHOOT); E.step(S, 0); ok(S.sht.some(s => s.a && s.k === 4 && s.dmg >= 30 && s.dmg < 80), 'half charge'); S = arena({ ship: 1 }); idle(S, 10, IN.SHOOT); E.step(S, 0); ok(!S.sht.some(s => s.a && s.k === 4), 'tap = no charge');
  // damage: a rivet (2hp) dies to one shot and gives score
  S = arena(); E.spawnEnemy(S, 'rivet', 135, {}); const e = S.ene[0]; e.x = 160; e.y = 135; idle(S, 30, IN.SHOOT); ok(!e.a && S.st.kills === 1 && S.score > 0, 'killed');
  // bombs
  for (const ship of [0, 1, 2]) {
    S = arena({ ship }); for (let i = 0; i < 40; i++) E.addBullet(S, S.p.x + 20 + i, S.p.y + (ship === 1 ? 0 : 10), 0, 0, 0, 0);
    idle(S, 1, IN.BOMB); eq(S.bombs, 2, 'bomb stock ' + ship); idle(S, 60);
    eq(E.count(S.bul), 0, 'bomb cleared bullets (ship ' + ship + ')'); ok(S.p.inv > 0, 'bomb protects');
  }
  S = arena(); S.bombs = 0; E.step(S, IN.BOMB); eq(S.bomb.t, 0, 'no stock, no bomb'); S = arena(); idle(S, 1, IN.BOMB); idle(S, 1, IN.BOMB); eq(S.bombs, 2, 'holding does not re-fire');
  // bomb damages enemies but only 35% on a boss
  S = arena(); E.spawnEnemy(S, 'crab', 135, {}); S.ene[0].x = 200; S.ene[0].y = 135; const hp0 = S.ene[0].hp; idle(S, 1, IN.BOMB); idle(S, 70); ok(S.ene[0].hp < hp0 || !S.ene[0].a, 'bomb hurts enemies');
});

test('pattern generators: aimed, ring, spiral, curtain, homing, laser, rain; density and speed follow the difficulty', () => {
  const mk = (diff, ship) => { const S = arena({ diff }); S.p.x = 100; S.p.y = 200; const e = { x: 400, y: 100, ra: 0, sa: 0, boss: 0 }; return [S, e]; };
  const bl = S => S.bul.filter(b => b.a);
  let [S, e] = mk(1); E.PAT.aimed(S, e, { n: 1, sp: 2 });
  let b = bl(S)[0]; const l = Math.hypot(b.vx, b.vy); nearly(l, 2, 1e-6); ok(b.vx < 0 && b.vy > 0, 'toward the player'); nearly(b.vy / b.vx, (200 - 100) / (100 - 400), 1e-6, 'exact aim');
  [S, e] = mk(1); E.PAT.aimed(S, e, { n: 3, sp: 2, sprd: 0.2 }); eq(bl(S).length, 3); const ys = bl(S).map(x => Math.atan2(x.vy, x.vx)); nearly(ys[1] - ys[0], 0.2, 1e-5); nearly(ys[2] - ys[1], 0.2, 1e-5);
  [S, e] = mk(1); E.PAT.ring(S, e, { n: 12, sp: 1.5 }); eq(bl(S).length, 12); const as = bl(S).map(x => Math.atan2(x.vy, x.vx)).sort((p, q) => p - q); for (let i = 1; i < 12; i++) nearly(as[i] - as[i - 1], Math.PI * 2 / 12, 1e-5);
  nearly(Math.hypot(bl(S)[0].vx, bl(S)[0].vy), 1.5, 1e-6);
  [S, e] = mk(1); E.PAT.ring(S, e, { n: 4, sp: 1, rot: 0.3 }); E.PAT.ring(S, e, { n: 4, sp: 1, rot: 0.3 }); nearly(e.ra, 0.6, 1e-9, 'ring rotates between volleys');
  [S, e] = mk(1); E.PAT.spiral(S, e, { arms: 3, sp: 1.5, step: 0.2 }); eq(bl(S).length, 3); E.PAT.spiral(S, e, { arms: 3, sp: 1.5, step: 0.2 }); nearly(e.sa, 0.4, 1e-9); eq(bl(S).length, 6);
  [S, e] = mk(1); S.p.y = 100; E.PAT.curtain(S, e, { gap: 20, sp: 1.5, hole: 3 }); const cb = bl(S); ok(cb.length >= 8 && cb.length <= 13, 'curtain size ' + cb.length);
  ok(cb.every(x => Math.abs(x.y - 100) > 20 || true) && !cb.some(x => Math.abs(x.y - 100) < 14), 'a gap opens around the player'); ok(cb.every(x => x.vx < 0 && x.vy === 0));
  [S, e] = mk(1); E.PAT.homing(S, e, { n: 2, sp: 1.5, turn: 0.05, life: 100 }); const hb = bl(S)[0]; ok(hb.tr > 0 && hb.life === 100);
  const d0 = Math.hypot(hb.x - S.p.x, hb.y - S.p.y); idle(S, 60); const d1 = Math.hypot(hb.x - S.p.x, hb.y - S.p.y); ok(!hb.a || d1 < d0, 'homing closes in');
  // laser: telegraph is harmless, then it hurts, then it ends
  S = arena(); E.spawnEnemy(S, 'rivet', 135, {}); const own = S.ene[0]; own.x = 300; own.y = 135; own.d = { mv: { k: 'stat', vx: 0 }, sc: 0 }; S.p.x = 100; S.p.y = 135;
  E.PAT.laser(S, own, { tele: 30, dur: 20, w: 8 }); const lz = S.las.find(x => x.a); ok(lz && lz.tele >= 30);
  idle(S, 20); eq(S.p.dying, 0, 'telegraph does not hurt'); idle(S, 30); ok(S.p.dying > 0 || S.lives < 3, 'the beam hits'); idle(S, 40); ok(!lz.a, 'the beam ends');
  [S, e] = mk(1); e.boss = 1; E.PAT.rain(S, e, { n: 3, sp: 2 }); ok(bl(S).length === 3 && bl(S).every(x => x.y < 0 && x.vy > 0));
  // difficulty: easy has fewer and slower bullets than ghost for the same spec
  const cnt = d => { const [T, f] = mk(d); E.PAT.ring(T, f, { n: 20, sp: 2 }); return [bl(T).length, Math.hypot(bl(T)[0].vx, bl(T)[0].vy)]; };
  const ea = cnt(0), no = cnt(1), gh = cnt(3); ok(ea[0] < no[0] && no[0] < gh[0], 'density ' + [ea[0], no[0], gh[0]]); ok(ea[1] < no[1] && no[1] < gh[1], 'speed');
});

test('enemies: formations spawn from the right, movement kinds behave, hover enemies stop and leave, kamikaze locks on, rockets blow up, mines burst', () => {
  let S = arena(); E.spawnEnemy(S, 'gull', 100, {}); const g = S.ene[0]; idle(S, 60); ok(g.x < 480 && Math.abs(g.y - 100) > 1, 'sine path');
  S = arena(); E.spawnEnemy(S, 'gear', 100, { tx: 350 }); const gear = S.ene[0]; idle(S, 200); nearly(gear.x, 350, 2, 'hover stops at tx'); idle(S, 400); ok(gear.x < 350, 'then leaves');
  S = arena(); E.spawnEnemy(S, 'wasp', 50, {}); const w = S.ene[0]; S.p.x = 100; S.p.y = 220; idle(S, 120); ok(w.a === 0 || w.y > 100, 'dash goes to the player');
  S = arena(); E.spawnEnemy(S, 'rocket', 100, {}); S.ene[0].x = 400; idle(S, 70); ok(S.bul.filter(b => b.a).length >= 6 && !S.ene[0].a, 'rocket explodes into a ring'); eq(S.st.kills, 0, 'no kill credit for a fuse');
  S = arena(); E.spawnEnemy(S, 'mine', 100, {}); S.ene[0].x = 300; S.ene[0].hp = 1; E.step(S, 0); S.sht[0].a = 1; S.sht[0].x = 300; S.sht[0].y = 100; S.sht[0].vx = 0; S.sht[0].vy = 0; S.sht[0].dmg = 5; S.sht[0].r = 3; S.sht[0].pi = 0; S.sht[0].life = 5; S.sht[0].hm = 0; S.sht[0].k = 0; S.sht[0].h0 = 0; S.sht[0].h1 = 0; idle(S, 1);
  ok(S.bul.filter(b => b.a).length >= 6, 'mine bursts when destroyed'); eq(S.st.kills, 1);
  S = arena(); E.spawnEnemy(S, 'icicle', 0, { fx: 300 }); const ic = S.ene[0]; idle(S, 20); ok(ic.inv, 'icicle telegraphs first'); idle(S, 40); ok(ic.y > 0 && !ic.inv, 'then falls');
  S = arena(); E.spawnEnemy(S, 'pod', 100, {}); const pod = S.ene[0]; ok(pod.drop); pod.x = 300; pod.hp = 1; pod.d = pod.d; S.sht[0].a = 1; S.sht[0].x = 300; S.sht[0].y = 100; S.sht[0].dmg = 9; S.sht[0].r = 3; S.sht[0].life = 5; S.sht[0].pi = 0; S.sht[0].vx = 0; S.sht[0].vy = 0; S.sht[0].hm = 0; S.sht[0].h0 = 0; S.sht[0].h1 = 0; idle(S, 1); ok(S.itm.some(i => i.a), 'carrier drops an item');
  // enemies off screen cannot be shot or hurt the ship
  S = arena(); E.spawnEnemy(S, 'rivet', 135, {}); S.ene[0].x = 700; S.sht[0].a = 1; S.sht[0].x = 700; S.sht[0].y = 135; S.sht[0].dmg = 9; S.sht[0].r = 3; S.sht[0].life = 5; S.sht[0].pi = 0; S.sht[0].vx = 0; S.sht[0].vy = 0; S.sht[0].hm = 0; S.sht[0].h0 = 0; S.sht[0].h1 = 0; idle(S, 1); ok(S.ene[0].a, 'untouchable off screen');
});

test('boss: enters invulnerable, 3+ phases with a cancel and a grace window at each change, the last phase ends the stage', () => {
  for (let st = 0; st < 7; st++) {
    const S = E.newGame({ mode: 'practice', stage: st, diff: 1, seed: 4 }); S.script = []; S.sf = D.STAGES[st].len + 1; idle(S, 2);
    const b = S.boss; ok(b && b.inv, 'boss ' + st + ' enters invulnerable'); const n = D.BOSS[st].ph.length;
    for (let i = 0; i < 400 && b.en !== 1; i++) E.step(S, 0); ok(b.en === 1 && !b.inv, 'then is hittable'); const hp0 = b.hp;
    // shoot it a little: only hp of the current phase drops
    S.p.inv = 1e9; S.p.y = b.y; S.p.x = 80; idle(S, 120, IN.SHOOT); ok(b.hp < hp0, 'damaged');
    for (let ph = 0; ph < n - 1; ph++) {
      E.addBullet(S, 200, 100, 0, 0, 0, 0); b.hp = 0.5; S.p.y = b.y; let g = 0; while (b.bp === ph && g++ < 400) E.step(S, IN.SHOOT);
      eq(b.bp, ph + 1, 'phase advanced'); ok(b.inv && b.ti > 0, 'grace window'); eq(E.count(S.bul), 0, 'bullets cancelled at the phase change');
      let guard = 0; while (b.ti > 0 && guard++ < 200) E.step(S, 0); ok(!b.inv, 'hittable again');
    }
    eq(b.bp, n - 1); b.hp = 0.5; let g2 = 0; while (S.boss && g2++ < 400) { S.p.y = b.y; E.step(S, IN.SHOOT); }
    ok(!S.boss && S.phase === 'clear', 'boss ' + st + ' defeated'); ok(S.st.bosses & (1 << st)); ok(S.lastClear && S.lastClear.stage === st, 'bonus event');
    idle(S, 260); eq(S.phase, 'done', 'practice ends after the stage'); ok(S.cleared);
  }
});

test('stage flow: arcade chains the seven stages; rush starts at the boss; daily plays three; stage clear bonus and no-miss bonus', () => {
  const S = E.newGame({ mode: 'arcade', diff: 1, seed: 5 }); eq(S.list.length, 7); eq(S.stage, 0);
  S.script = []; S.sf = D.STAGES[0].len + 1; idle(S, 2); for (let i = 0; i < 300 && S.boss.en !== 1; i++) E.step(S, 0);
  S.p.inv = 1e9; S.boss.bp = 2; S.boss.hp = 0.5; S.p.y = S.boss.y; let g = 0; while (S.boss && g++ < 300) { S.p.y = S.boss.y; E.step(S, IN.SHOOT); }
  eq(S.phase, 'clear'); const sc0 = S.score; ok(S.lastClear.nomiss, 'no-miss'); ok(S.lastClear.bonus >= 120000, 'bonus ' + S.lastClear.bonus); idle(S, 230); eq(S.stage, 1); eq(S.phase, 'play'); eq(S.st.stages, 1); eq(S.st.nomiss, 1);
  const R = E.newGame({ mode: 'rush', diff: 1, seed: 5 }); eq(R.script.length, 0); idle(R, 60); ok(R.boss, 'rush: the boss comes right away'); ok(R.power >= 3 && R.opt >= 2, 'rush loadout');
  const Dl = E.dailyFor(20261126); const DG = E.newGame({ mode: 'daily', diff: 1, ship: Dl.ship, seed: Dl.seed, mods: Dl.mods, list: Dl.list, dkey: Dl.dkey }); eq(DG.list.length, 3); eq(DG.maxConts >= 0, true);
  const P = E.newGame({ mode: 'practice', stage: 5 }); deep(P.list, [5]); eq(P.stage, 5);
});

test('scoring: chain multiplier, graze points, difficulty multiplier, extends, cap, items', () => {
  const kill = (S, type) => { E.spawnEnemy(S, type, 100, {}); const e = S.ene.find(x => x.a); e.x = 300; e.hp = 0.1; const s = S.sht.find(x => !x.a); s.a = 1; s.x = 300; s.y = 100; s.dmg = 99; s.r = 3; s.life = 3; s.pi = 0; s.vx = 0; s.vy = 0; s.hm = 0; s.h0 = 0; s.h1 = 0; E.step(S, 0); };
  let S = arena(); kill(S, 'rivet'); eq(S.score, 104, '100 x1.04'); eq(S.chain, 1); kill(S, 'rivet'); eq(S.score, 104 + 108); kill(S, 'rivet'); eq(S.chain, 3);
  for (let i = 0; i < 200; i++) kill(S, 'rivet'); const before = S.score; kill(S, 'rivet'); eq(S.score - before, 500, 'multiplier tops out at x5');
  S = arena(); kill(S, 'rivet'); idle(S, 148); eq(S.chain, 1); idle(S, 2); eq(S.chain, 0, 'the chain times out');
  S = arena(); kill(S, 'rivet'); const gb = S.chainT; E.addBullet(S, S.p.x + 9, S.p.y, 0, 0, 0, 0); E.step(S, 0); ok(S.chainT >= gb - 1, 'graze keeps the chain alive'); eq(S.st.graze, 1);
  S = arena(); S.p.inv = 0; kill(S, 'rivet'); eq(S.chain, 1); E.addBullet(S, S.p.x, S.p.y, 0, 0, 0, 0); idle(S, 12); eq(S.chain, 0, 'a miss breaks the chain');
  const sc = d => { const T = arena({ diff: d }); kill(T, 'rivet'); return T.score; }; deep([0, 1, 2, 3].map(sc), [62, 104, 145, 187]);
  S = arena({ mods: ['fast'] }); ok(S.sm > E.newGame({}).sm * 1.1 - 1e-9);
  S = arena(); S.score = 199990; kill(S, 'gear'); eq(S.lives, 4, 'extend at 200,000'); eq(S.ex, 1);
  S = arena(); S.score = E.SCORE_CAP - 5; kill(S, 'gear'); eq(S.score, E.SCORE_CAP, 'the score never passes the cap'); eq(E.SCORE_CAP, 99999999);
  // items
  const pk = (S, k) => { const it = S.itm.find(x => !x.a); it.a = 1; it.x = S.p.x; it.y = S.p.y; it.k = k; it.t = 0; E.step(S, 0); };
  S = arena(); S.power = 0; S.opt = 0; S.spd = 0; S.shield = 0; pk(S, 0); pk(S, 1); pk(S, 2); pk(S, 3); eq([S.power, S.spd, S.opt, S.shield].join(), '1,1,1,1'); pk(S, 4); eq(S.bombs, 4);
  S.power = 4; S.opt = 3; S.spd = 3; S.shield = 2; S.bombs = 6; const s0 = S.score; pk(S, 0); pk(S, 1); pk(S, 2); pk(S, 3); pk(S, 4); eq([S.power, S.spd, S.opt, S.shield, S.bombs].join(), '4,3,3,2,6'); ok(S.score > s0 + 10000, 'maxed items turn into points');
  S = arena({ assist: 4 }); const it = S.itm[0]; it.a = 1; it.x = S.p.x + 60; it.y = S.p.y; it.k = 0; it.t = 0; idle(S, 40); ok(!it.a && S.power >= 3, 'assist pulls items in');
  S = arena(); const it2 = S.itm[0]; it2.a = 1; it2.x = S.p.x + 60; it2.y = S.p.y; it2.k = 0; it2.t = 0; const x0 = it2.x; idle(S, 10); ok(it2.x > x0 - 10, 'no pull without the assist');
  // the drop sequence skips what is already maxed
  S = arena(); S.power = 4; S.opt = 3; S.spd = 3; S.shield = 2; E.spawnEnemy(S, 'pod', 100, {}); const pod = S.ene[0]; pod.x = 300; pod.hp = 0.1; const s = S.sht[0]; s.a = 1; s.x = 300; s.y = 100; s.dmg = 99; s.r = 3; s.life = 3; s.pi = 0; s.vx = 0; s.vy = 0; s.hm = 0; s.h0 = 0; s.h1 = 0; E.step(S, 0); eq(S.itm.find(i => i.a).k, 4, 'only bombs are left to drop');
});

test('replay: RLE and text code round-trip, replaying the inputs reproduces the run exactly, continues and bad codes', () => {
  const inputs = scripted(2500), opts = { mode: 'arcade', diff: 2, ship: 1, seed: 1234, assist: 6, mods: [], dkey: 0, stage: 0 };
  deep(E.replay.unrle(E.replay.rle(inputs)), inputs);
  const S = E.newGame(opts); for (const i of inputs) { E.step(S, i); S.ev.length = 0; }
  const rec = E.replay.make(opts, inputs, { score: S.score, t: 1 }), code = E.replay.encode(rec); ok(code.startsWith('PW1.')); ok(code.length < inputs.length, 'compact: ' + code.length);
  const back = E.replay.decode(code); eq(back.frames, 2500); eq(back.seed, 1234); eq(back.assist, 6); eq(back.score, S.score); deep(E.replay.unrle(back.runs), inputs);
  eq(E.hash(E.replay.run(back)), E.hash(S), 'replay reproduces the final state'); eq(E.hash(E.replay.run(back, 1000)), (() => { const T = E.newGame(opts); for (let i = 0; i < 1000; i++) { E.step(T, inputs[i]); T.ev.length = 0; } return E.hash(T); })(), 'and any frame');
  eq(E.replay.decode(E.replay.encode(E.replay.make({ mode: 'daily', diff: 1, ship: 2, seed: 9, mods: ['fast', 'big'], dkey: 20261126, list: [0, 3, 5] }, [1, 1, 2, 255, 0], {}))).mods.join(), 'fast,big');
  throws(() => E.replay.decode('nope')); throws(() => E.replay.decode('PW1.!!!')); throws(() => E.replay.decode('PW1.' + code.slice(4, 30))); throws(() => E.replay.validate({ v: 2 })); throws(() => E.replay.validate({ v: 1, mode: 'x', diff: 1, ship: 1, runs: [] })); throws(() => E.replay.validate({ v: 1, mode: 'arcade', diff: 1, ship: 1, runs: [[1, 0]] }));
  // a continue is part of the input log
  const o2 = { mode: 'practice', stage: 0, diff: 1, ship: 0, seed: 2 }, T = E.newGame(o2); T.script = []; const log = [];
  const go = i => { E.step(T, i); log.push(i); T.ev.length = 0; }; for (let i = 0; i < 5; i++) go(0);
  T.lives = 1; T.p.inv = 0; E.addBullet(T, T.p.x, T.p.y, 0, 0, 0, 0); for (let i = 0; i < 20; i++) go(0); eq(T.phase, 'over'); go(IN.CONT); eq(T.conts, 1);
  const R2 = E.newGame(o2); R2.script = []; // (scripts are rebuilt from the seed in a real replay; here we only prove CONT is an ordinary input bit)
  ok(E.replay.rle(log).some(r => r[0] === IN.CONT));
});

test('daily challenge: same date = same setup for everyone, different dates differ, always two distinct rules and three ascending stages', () => {
  deep(E.dailyFor(20261126), E.dailyFor(20261126)); const seen = new Set();
  for (let d = 20261101; d <= 20261130; d++) { const x = E.dailyFor(d); seen.add(JSON.stringify([x.mods, x.list, x.ship])); eq(x.mods.length, 2); ok(x.mods[0] !== x.mods[1]); x.mods.forEach(m => ok(D.MODS[m], m)); ok(x.list[0] < x.list[1] && x.list[1] < x.list[2] && x.list[2] <= 6 && x.list[0] >= 0, 'stages ' + x.list); ok(x.ship >= 0 && x.ship <= 2); ok(x.seed > 0); }
  ok(seen.size >= 20, 'days differ: ' + seen.size);
  // the rules really change the sim
  const base = E.newGame({}), dense = E.newGame({ mods: ['dense'] }), glass = E.newGame({ mods: ['glass'] }), rich = E.newGame({ mods: ['rich'] }), lucky = E.newGame({ mods: ['lucky'] });
  ok(dense.dens > base.dens); eq(glass.lives, 1); eq(glass.maxConts, 0); ok(rich.power === 3 && rich.opt === 2 && rich.spd === 2); eq(lucky.shield, 2); ok(E.newGame({ mods: ['tough'] }).ehp > base.ehp);
  ok(E.dailyFor(20261126).mods.every(m => D.MODS[m]));
});

test('performance: 900 live bullets step quickly (object pools, no allocation in the hot loop)', () => {
  const S = arena(); for (let i = 0; i < 900; i++) E.addBullet(S, 120 + (i % 30) * 11, 10 + Math.floor(i / 30) * 8, -0.4, 0.05, i % 3, i % 4);
  eq(E.count(S.bul), 900); const t0 = process.hrtime.bigint(); for (let i = 0; i < 120; i++) { for (const b of S.bul) if (!b.a) { b.a = 1; b.x = 470; b.y = 100; b.vx = -0.5; b.vy = 0; b.k = 0; b.c = 0; b.g = 0; b.r = 3; b.tr = 0; } E.step(S, IN.SHOOT); S.ev.length = 0; }
  const ms = Number(process.hrtime.bigint() - t0) / 1e6 / 120; console.log('    ~' + ms.toFixed(3) + ' ms per frame with ~900 bullets'); ok(ms < 4, 'frame cost ' + ms);
});

test('registry and achievement drafts are valid and match the documented shapes', () => {
  const A = path.join(ROOT, 'shmup/assets');
  const reg = eval('[' + fs.readFileSync(path.join(A, 'registry-entry.txt'), 'utf8') + ']')[0];
  const ach = eval('({' + fs.readFileSync(path.join(A, 'achievements-entry.txt'), 'utf8') + '})').shmup;
  eq(reg.id, 'shmup'); eq(reg.path, 'shmup/'); eq(reg.icon, 'img/icons/shmup.svg'); eq(reg.thumb, 'img/thumbs/shmup.webp'); eq(reg.thumb2x, 'img/thumbs/shmup@2x.webp'); eq(reg.tech, '2d'); eq(reg.versus, null);
  for (const f of ['title', 'short', 'desc', 'label']) ok(reg[f].ja && reg[f].en, f);
  eq(typeof reg.flags.ranking, 'boolean'); ok(reg.flags.pause && reg.flags.daily && reg.flags.stages && !reg.flags.versus);
  ok(['desc', 'asc'].includes(reg.score.order) && reg.score.cap === E.SCORE_CAP, 'cap equals the engine cap');
  ok(reg.genres.every(g => ['puzzle', 'falling', 'survival', 'action', 'cooking', 'simulation', 'board', 'study', 'music'].includes(g)));
  const gs = fs.readFileSync(path.join(ROOT, 'common/games.js'), 'utf8'); const used = new Set(); for (const m of gs.matchAll(/tags: \[([^\]]*)\]/g)) m[1].split(',').forEach(t => used.add(t.trim().replace(/'/g, '')));
  ok(reg.tags.every(t => used.has(t)), 'every tag already exists in the hub: ' + reg.tags.filter(t => !used.has(t)));
  ok(reg.rankSource.key in reg.keys && reg.record.key in reg.keys); for (const k of Object.keys(reg.sync)) ok(k in reg.keys, k);
  const m = /<rect width="72" height="72" fill="(#[0-9a-f]+)"/.exec(reg.iconSvg); ok(m, 'iconSvg starts with the background rect'); ok(reg.iconSvg.startsWith('<svg viewBox="0 0 72 72"'));
  ok(fs.readFileSync(path.join(ROOT, 'shmup/icon.svg'), 'utf8').includes('fill="' + m[1] + '"'), 'icon.svg matches');
  ok(ach.length >= 15 && ach.length <= 20, 'achievements ' + ach.length); const ids = new Set();
  for (const a of ach) { ok(a.id.startsWith('shmup.') && !ids.has(a.id), a.id); ids.add(a.id); ok([1, 2, 3, 4].includes(a.tier)); ok(['check', 'star', 'trophy', 'play', 'restart', 'globe'].includes(a.icon)); ok(a.title.ja && a.title.en && a.desc.ja && a.desc.en); ok(a.when.rec.key === 'kusoge.shmup.save' && typeof a.when.gte === 'number'); }
  // the keys the achievements read exist in the documented save
  const doc = reg.keys['kusoge.shmup.save']; for (const a of ach) { const pp = a.when.rec.path.split('.'), last = pp[0] === 'stats' ? pp[1] : pp[0]; ok(doc.includes(last), a.id + ' reads ' + a.when.rec.path); }
  // the fixture save matches the shapes the page reads
  const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/tests/fixtures/saves/shmup-save.json'), 'utf8')); eq(fx.page, 'shmup'); ok(fx.storage['kusoge.shmup.save']);
  const sv = JSON.parse(fx.storage['kusoge.shmup.save']); ok(sv.rank <= reg.score.cap && sv.rank >= 1);
});

run('shmup-engine');
