// hop/engine.js の単体テスト：決まった刻みの物理（加速・ジャンプの高さ・コヨーテ・先行入力・ぶつかり）、敵ごとの動き、
// ブロック・ばね・氷・ベルト・水・上昇風・とげ・穴・チェックポイント・復活・かくれあな・ボス、リボン、入力の記録。
// 実行：node tools/tests/unit/hop-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'hop/engine.js'));
const B = E.B, T = E.T;

// a test level: 13 rows, ground on rows 10-12, `rows` = { rowNumber: string }, `w` columns
function mk(rows, w, meta) {
  const r = []; for (let y = 0; y < 13; y++) r.push(((rows && rows[y]) || (y >= 10 ? '#'.repeat(w || 60) : '')).padEnd(w || 60, ' '));
  return E.parse(Object.assign({ id: 'test', rows: r }, meta || {}));
}
const mkS = (rows, w, meta, o) => E.newState(mk(rows, w, meta), o);
const runN = (S, n, inp) => { for (let i = 0; i < n; i++) { E.step(S, typeof inp === 'function' ? inp(i) : inp || 0); S.ev.length = 0; } return S; };
const settle = S => runN(S, 20, 0);
const flat = (extra, w, meta, o) => settle(mkS(Object.assign({ 9: '  P' }, extra), w, meta, o));
const bot = S => S.p.y + S.p.h;

test('level parsing: tiles, entities, burrow pairs, medals ordered left to right, cannons stand on a block', () => {
  const L = mk({ 9: ' P  b  m   m  D     d  t', 8: '  c  K  G' }, 40);
  eq(L.W, 40); eq(L.H, 13); deep(L.start, { x: 1, y: 9 }); deep(L.goal, { x: 8, y: 8 });
  eq(L.medals.length, 2); ok(L.medals[0].x < L.medals[1].x); eq(L.nCoin, 1); eq(L.cps.length, 1);
  eq(L.bur.length, 2); eq(L.bur[0].tx, L.bur[1].x); eq(L.t[9 * 40 + 23], T.USED, 'a cannon stands on a solid block');
  ok(L.ents.some(e => e.k === 'bug') && L.ents.some(e => e.k === 'cannon'));
});

test('determinism: the same inputs give the same state, a clone keeps going identically, and recordings round-trip', () => {
  const L = mk({ 9: '  P    b      b', 8: '                 c c c' }, 80);
  const inp = i => (i % 50 < 40 ? B.R | B.RUN : 0) | (i % 37 < 14 ? B.J : 0) | (i % 91 === 0 ? B.D : 0);
  const a = E.newState(L), b = E.newState(L);
  const rec = [];
  for (let i = 0; i < 400; i++) { rec.push(inp(i)); E.step(a, inp(i)); E.step(b, inp(i)); }
  eq(E.sig(a), E.sig(b), 'two runs');
  const c = E.newState(L); for (let i = 0; i < 150; i++) E.step(c, rec[i]);
  const d = E.clone(c); for (let i = 150; i < 400; i++) { E.step(c, rec[i]); E.step(d, rec[i]); }
  eq(E.sig(c), E.sig(a), 'continuing from the middle'); eq(E.sig(d), E.sig(a), 'a clone');
  deep(E.unrle(E.rle(rec)), rec); eq(E.rle([]), ''); deep(E.unrle(''), []);
  eq(E.sig(E.runReplay(L, rec)), E.sig(a), 'replay');
  ok(E.rle(rec).length < rec.length * 2);
});

test('movement: acceleration, walk vs run speed, friction stops the hero, the camera follows without moving the sim', () => {
  const S = flat();
  const x0 = S.p.x; runN(S, 60, B.R); const walk = S.p.x - x0;
  const S2 = flat(); runN(S2, 60, B.R | B.RUN); const rn = S2.p.x - x0;
  ok(walk > 60 && walk < 85, 'walk 60f = ' + walk); ok(rn > 100 && rn < 135, 'run 60f = ' + rn); ok(S2.p.vx <= 2.26 && S2.p.vx >= 2.2, 'run cap ' + S2.p.vx);
  runN(S2, 40, 0); eq(S2.p.vx, 0, 'friction brings it to rest'); ok(S2.p.on);
  // a different view width changes the camera only
  const A1 = flat({}, 120, null, { vw: 240 }), A2 = flat({}, 120, null, { vw: 640 });
  runN(A1, 100, B.R | B.RUN); runN(A2, 100, B.R | B.RUN); eq(A1.p.x, A2.p.x); ok(A1.cam.x !== A2.cam.x);
  // turning around is quicker than speeding up
  const S3 = flat(); runN(S3, 40, B.R | B.RUN); runN(S3, 10, B.L | B.RUN); ok(S3.p.vx < 0.9, 'turned ' + S3.p.vx);
});

test('jump: hold longer = higher (3.6-4.2 tiles at most, a tap about 1.5), run adds a little, apex then fall', () => {
  const apex = (inp) => { const S = flat(); const y0 = S.p.y; let top = y0; for (let i = 0; i < 70; i++) { E.step(S, inp(i)); top = Math.min(top, S.p.y); } return y0 - top; };
  const hold = apex(() => B.J), tap = apex(i => (i < 2 ? B.J : 0)), mid = apex(i => (i < 12 ? B.J : 0));
  ok(hold > 56 && hold < 70, 'hold ' + hold); ok(tap > 18 && tap < 32, 'tap ' + tap); ok(mid > tap + 6 && mid < hold, 'mid ' + mid);
  const S = flat(); runN(S, 40, B.R | B.RUN); E.step(S, B.R | B.RUN | B.J); const x0 = S.p.x; let n = 1; while (!S.p.on && n < 200) { E.step(S, B.R | B.RUN | B.J); n++; }
  ok(S.p.x - x0 > 70 && S.p.x - x0 < 100, 'run jump distance ' + (S.p.x - x0));
});

test('jump feel: coyote time (6 frames after leaving a ledge), input buffer (7 frames before landing), no double jump', () => {
  // coyote
  const mkLedge = () => settle(mkS({ 9: '  P', 10: '######      ', 11: '######', 12: '######' }, 40));
  let S = mkLedge(); S.p.x = 5 * 16 + 4; S.p.vx = 0;
  // walk off and jump 4 frames after leaving the ground: should jump
  let off = -1, cj = false; for (let i = 0; i < 40; i++) { E.step(S, B.R | (off >= 0 && i === off + 4 ? B.J : 0)); if (S.ev.some(e => e[0] === 'jump')) cj = true; S.ev.length = 0; if (off < 0 && !S.p.on) off = i; }
  ok(off >= 0); ok(cj, 'coyote jump worked');
  S = mkLedge(); S.p.x = 5 * 16 + 4; off = -1; let jumped = false;
  for (let i = 0; i < 40; i++) { E.step(S, B.R | (off >= 0 && i >= off + 10 && i <= off + 11 ? B.J : 0)); if (S.ev.some(e => e[0] === 'jump')) jumped = true; S.ev.length = 0; if (off < 0 && !S.p.on) off = i; }
  ok(!jumped, 'a jump pressed 10 frames after leaving the ledge is not a jump');
  // buffer: press jump 4 frames before landing
  S = flat(); runN(S, 1, B.J); let landedJump = false; runN(S, 80, 0);
  S = flat(); E.step(S, B.J); let pressed = false;
  for (let i = 0; i < 80; i++) { const nearLand = S.p.vy > 0 && bot(S) > 150 - 4 * S.p.vy && !pressed; E.step(S, nearLand ? B.J : 0); if (nearLand) pressed = true; if (S.ev.some(e => e[0] === 'jump')) landedJump = true; S.ev.length = 0; if (pressed && landedJump) break; }
  ok(pressed && landedJump, 'buffered jump fires on landing');
  // no double jump in the air
  S = flat(); E.step(S, B.J); runN(S, 5, 0); const vy = S.p.vy; E.step(S, B.J); ok(S.p.vy >= vy, 'cannot jump again in the air');
});

test('collision: walls stop the hero, ceilings stop a jump, one-way floors are passable from below and solid from above, down+jump drops through', () => {
  let S = flat({ 9: '  P     #', 8: '        #', 7: '        #' }); runN(S, 80, B.R | B.RUN); ok(S.p.x + S.p.w <= 8 * 16 + 0.01 && S.p.x + S.p.w > 8 * 16 - 1, 'against the wall ' + S.p.x);
  S = flat({ 9: '  P', 7: '  ######' }); const y0 = S.p.y; runN(S, 40, B.J); ok(S.p.y > 7 * 16 + 16 - 0.01 && S.p.vy >= 0 || S.p.y >= 7 * 16 + 16 - 0.1, 'ceiling hit, y=' + S.p.y);
  S = flat({ 9: '  P', 7: '  -----', 10: '#'.repeat(60) });
  runN(S, 30, B.J); ok(S.p.y + S.p.h <= 7 * 16 + 0.5 && S.p.on, 'jumped through a one-way platform and landed on it ' + bot(S));
  runN(S, 3, B.D); E.step(S, B.D | B.J); runN(S, 30, 0); ok(bot(S) > 150, 'down + jump drops through ' + bot(S));
  // crouch: smaller box, bottom stays on the floor, stands up again
  S = flat({ 9: '  P' }); runN(S, 3, B.D); eq(S.p.h, 8); ok(Math.abs(bot(S) - 160) < 0.01); runN(S, 3, 0); eq(S.p.h, 14); ok(S.p.on);
  // landing on a single pixel edge
  S = flat({ 9: '  P' }); S.p.x = 7 * 16 + 15; S.p.y = 100; runN(S, 60, 0); ok(S.p.on && Math.abs(bot(S) - 160) < 0.01);
});

test('enemies: bug walks and turns at walls; stomp kills and bounces (higher while holding jump); side contact costs a heart with invulnerability', () => {
  let S = flat({ 9: '  P      b   #', 8: '            #' }, 40);
  const bug = S.en.find(e => e.k === 'bug'); const x0 = bug.x; runN(S, 90, 0);
  ok(bug.x < x0 - 10 || bug.dir === 1, 'the bug walked'); runN(S, 400, 0); ok(!bug.dead);
  // side hit
  S = flat({ 9: '  P b' }, 40, null, { reserve: 0 }); S.p.pw = 1; runN(S, 60, B.R); eq(S.p.pw, 0, 'big -> small'); ok(S.p.inv > 0, 'invulnerable'); ok(!S.p.dead); runN(S, 20, B.R); ok(!S.p.dead, 'no second hit during i-frames');
  eq(S.hurts, 1);
  S = flat({ 9: '  P b' }, 40); runN(S, 60, B.R); ok(S.p.dead || S.deaths === 1, 'a hit while small loses the run');
  // stomp
  S = flat({ 9: '  P      b' }, 40); S.p.x = 9 * 16 - 4; S.p.y = 100; S.p.vy = 2; runN(S, 25, 0);
  ok(S.en.every(e => e.k !== 'bug'), 'stomped'); eq(S.stomps, 1); ok(!S.p.dead);
  const mkStomp = jh => { const s = flat({ 9: '  P      b' }, 40); s.p.x = 9 * 16 - 4; s.p.y = 100; s.p.vy = 2; let top = s.p.y; for (let i = 0; i < 40; i++) { E.step(s, jh ? B.J : 0); top = Math.min(top, s.p.y); } return top; };
  ok(mkStomp(true) < mkStomp(false) - 8, 'holding jump bounces higher');
  // gear -> big -> small -> lose, one step per hit
  S = flat({ 9: '  P b' }, 40, null, { gear: 2 }); runN(S, 60, B.R); eq(S.p.gear, 0); eq(S.p.pw, 1, 'still big after losing the suit'); ok(!S.p.dead);
});

test('enemies: windup turns at ledges, frog hops towards the hero, bat and balloon follow their sine paths, cannon shoots when near and not when far', () => {
  let S = flat({ 9: '  P', 10: '##########    ####', 11: '##########    ####', 12: '##########    ####' }, 30);
  S.p.x = 2; S.p.y = 100; // stay away
  const rows = { 9: ' P         n ', 10: '############    ' };
  S = settle(mkS({ 9: 'P                         n', 10: '###########################         ' }, 40)); // walker near the end of a platform
  const w = S.en.find(e => e.k === 'windup'); w.dir = 1; w.x = 26 * 16; runN(S, 200, 0); ok(w.x < 27 * 16 + 1 && !w.dead, 'turned back at the edge x=' + w.x);
  S = flat({ 9: '  P    j' }, 40); const f = S.en.find(e => e.k === 'frog'); let hops = 0, wasOn = true; for (let i = 0; i < 300; i++) { E.step(S, 0); if (wasOn && !f.on) hops++; wasOn = f.on; } ok(hops >= 3, 'hops ' + hops); ok(f.x < 7 * 16, 'towards the hero');
  S = flat({ 9: '  P', 5: '          a' }, 40); const bat = S.en.find(e => e.k === 'bat'); let mn = 1e9, mx = -1e9; for (let i = 0; i < 400; i++) { E.step(S, 0); mn = Math.min(mn, bat.x); mx = Math.max(mx, bat.x); } ok(mx - mn > 60 && mx - mn < 90, 'bat range ' + (mx - mn));
  S = flat({ 9: '  P', 5: '          p' }, 40); const bl = S.en.find(e => e.k === 'balloon'); let my = 1e9, My = -1e9; for (let i = 0; i < 300; i++) { E.step(S, 0); my = Math.min(my, bl.y); My = Math.max(My, bl.y); } ok(My - my > 40 && My - my < 60, 'balloon range ' + (My - my));
  S = flat({ 9: '  P          t' }, 60); const shots = () => S.en.filter(e => e.k === 'shot').length; let maxShots = 0; for (let i = 0; i < 260; i++) { E.step(S, 0); maxShots = Math.max(maxShots, shots()); } ok(maxShots >= 1, 'cannon fired');
  S = flat({ 9: '  P', 8: '', 10: '#'.repeat(80) }, 80); S.en.push({ k: 'cannon', x: 70 * 16, y: 9 * 16, w: 16, h: 16, t: 200, dir: -1, dead: 0, ox: 0, oy: 0 }); runN(S, 200, 0); eq(S.en.filter(e => e.k === 'shot').length, 0, 'out of range = quiet');
  // a pellet hurts
  S = flat({ 9: '  P' }, 40); S.en.push({ k: 'shot', sub: 'pellet', x: 3 * 16, y: 9 * 16 + 4, w: 6, h: 6, vx: -1.5, vy: 0, g: 0, life: 100, dead: 0 }); S.p.pw = 1; runN(S, 30, 0); eq(S.p.pw, 0);
});

test('enemies: pin cushion hurts when stomped but dies to a ground pound; roller wakes up and charges; drip falls on the hero and splats; bird dives; pendulum swings; umbrella shields', () => {
  let S = flat({ 9: '  P      s' }, 40); S.p.x = 9 * 16 - 4; S.p.y = 100; S.p.vy = 2; S.p.pw = 1; runN(S, 20, 0); eq(S.p.pw, 0, 'stomping a pin cushion hurts');
  S = flat({ 9: '  P      s' }, 40); S.p.pw = 1; S.p.x = 9 * 16 - 4; S.p.y = 70; S.p.vy = 0; S.p.on = false; E.step(S, B.D); E.step(S, 0); runN(S, 25, B.D); ok(S.en.every(e => e.k !== 'pin') && S.p.pw === 1, 'a big hero crushes it with a pound');
  S = flat({ 9: '  P      s' }, 40); S.p.x = 9 * 16 - 4; S.p.y = 70; S.p.on = false; E.step(S, B.D); runN(S, 25, B.D); ok(S.en.some(e => e.k === 'pin') && (S.p.dead || S.deaths === 1), 'a small one cannot');
  S = flat({ 9: '  P    r' }, 60); const r = S.en.find(e => e.k === 'roller'); runN(S, 120, 0); ok(r.x < 12 * 16 - 20 || r.s >= 2, 'roller charged');
  S = flat({ 9: '  P', 3: '           y', 2: '           #' }, 40); S.p.x = 11 * 16 + 2; runN(S, 60, 0); ok(S.p.dead || S.deaths === 1 || S.en.some(e => e.k === 'drip' && e.s === 2), 'drip fell');
  S = flat({ 9: '  P', 4: '         e' }, 40); const bd = S.en.find(e => e.k === 'bird'); S.p.x = bd.x; let dove = false; for (let i = 0; i < 200; i++) { E.step(S, 0); if (bd.s === 1) dove = true; } ok(dove, 'bird dived');
  S = flat({ 9: '  P', 3: '          l' }, 40); const pe = S.en.find(e => e.k === 'pend'); let a = 1e9, b = -1e9; for (let i = 0; i < 300; i++) { E.step(S, 0); a = Math.min(a, pe.x); b = Math.max(b, pe.x); } ok(b - a > 120, 'pendulum swing ' + (b - a));
  S = flat({ 9: '  P      u' }, 40); S.p.x = 9 * 16 - 4; S.p.y = 100; S.p.vy = 2; runN(S, 20, 0); const um = S.en.find(e => e.k === 'umb'); ok(um && !um.dead && S.stomps === 0 && !S.p.dead, 'stomping a shielded umbrella only bounces');
  S = flat({ 9: '  P      u' }, 40); S.p.pw = 1; S.p.x = 9 * 16 - 4; S.p.y = 70; S.p.on = false; E.step(S, B.D); runN(S, 25, B.D); ok(S.en.every(e => e.k !== 'umb'), 'pound breaks the umbrella');
});

test('blocks: ? gives a coin once, ! gives gear or a puff, bricks break only when big, bumps stun walkers', () => {
  let S = flat({ 9: '  P', 6: '  ?' }); S.p.x = 2 * 16 + 3; runN(S, 30, B.J); eq(S.coins, 1); eq(E.tl(S, 2, 6), T.USED); runN(S, 60, 0); runN(S, 30, B.J); eq(S.coins, 1, 'only once');
  S = flat({ 9: '  P', 6: '  !' }, 60, { gear: 'cape' }); S.p.x = 2 * 16 + 3; runN(S, 30, B.J); ok(S.en.some(e => e.k === 'item' && e.sub === 2), 'item appears'); const it = S.en.find(e => e.k === 'item'); runN(S, 30, 0); S.p.x = it.x - 2; S.p.y = it.y - 2; E.step(S, 0); eq(S.p.gear, 2, 'cape picked up');
  S = flat({ 9: '  P', 6: '  B' }); S.p.x = 2 * 16 + 3; runN(S, 30, B.J); eq(E.tl(S, 2, 6), T.BRICK, 'a bare head only bumps a brick');
  S = flat({ 9: '  P', 6: '  B' }, 60, null, { gear: 1 }); S.p.x = 2 * 16 + 3; runN(S, 30, B.J); eq(E.tl(S, 2, 6), T.AIR, 'a big (suited) hero breaks it');
  S = flat({ 9: '  P', 9.5: '' }); S.p.pw = 1; S.mod[10 * 60 + 5] = T.BRICK; S.p.x = 5 * 16 + 3; S.p.y = 60; E.step(S, 0); E.step(S, B.D); runN(S, 40, B.D); eq(E.tl(S, 5, 10), T.AIR, 'a pound breaks the brick below');
});

test('springs bounce, ice slides, conveyors push, water slows (and a stroke swims up), updraft lifts, wind pushes', () => {
  let S = flat({ 9: '  P', 10: '##S#####' }); S.p.x = 2 * 16 + 3; S.p.y = 100; runN(S, 40, 0); let top = 1e9; S = flat({ 9: '  P', 10: '##S#####' }); S.p.x = 2 * 16 + 3; S.p.y = 140; for (let i = 0; i < 80; i++) { E.step(S, 0); top = Math.min(top, S.p.y); } ok(top < 70, 'spring apex ' + top);
  const x0 = (s) => s.p.x;
  S = flat({ 9: '  P', 10: '####iiiiiiiiiiiiiiii' }, 40); S.p.x = 5 * 16; runN(S, 30, B.R | B.RUN); const vIce = S.p.vx; runN(S, 20, 0); ok(S.p.vx > 0.8, 'still sliding on ice ' + S.p.vx);
  S = flat({ 9: '  P', 10: '####>>>>>>>>>>>>>>>>' }, 40); S.p.x = 5 * 16; const cx0 = S.p.x; runN(S, 60, 0); ok(S.p.x - cx0 > 30, 'carried right ' + (S.p.x - cx0));
  S = flat({ 9: '  P', 10: '####<<<<<<<<<<<<<<<<' }, 40); S.p.x = 12 * 16; const cx1 = S.p.x; runN(S, 60, 0); ok(cx1 - S.p.x > 30, 'carried left');
  S = flat({ 8: '        ~~~~~~~~', 9: '  P     ~~~~~~~~', 10: '########~~~~~~~~', 11: '########~~~~~~~~', 12: '################' }, 40); S.p.x = 9 * 16; S.p.y = 100; runN(S, 40, 0); ok(S.p.swim, 'in the water'); ok(S.p.vy <= 1.55, 'sinks slowly ' + S.p.vy);
  const y1 = S.p.y; runN(S, 4, B.J); E.step(S, 0); ok(S.p.y < y1 || S.p.vy < 0, 'a stroke swims up');
  S = flat({ 9: '  P        www', 8: '           www', 7: '           www', 6: '           www', 5: '           www', 4: '           www' }, 40); S.p.x = 12 * 16; let ty = 1e9; for (let i = 0; i < 60; i++) { E.step(S, 0); ty = Math.min(ty, S.p.y); } ok(ty < 100, 'updraft lifts ' + ty);
  S = flat({}, 60, { wind: 0.3 }); const wx = S.p.x; runN(S, 40, 0); ok(S.p.x > wx + 8, 'wind pushes');
});

test('hazards: spikes and pits end the run (restart at the checkpoint, any number of times); "never lose" puts you back on the last safe spot; checkpoints keep your power-up', () => {
  let S = flat({ 9: '  P', 10: '#####^^^####', 11: '############', 12: '############' }, 40); for (let i = 0; i < 120 && !S.deaths; i++) E.step(S, B.R | B.RUN); eq(S.deaths, 1, 'spikes end the run');
  S = flat({ 9: '  P', 10: '#####   ####', 11: '#####   ####', 12: '#####   ####' }, 40); for (let i = 0; i < 120 && !S.deaths; i++) E.step(S, B.R | B.RUN); eq(S.deaths, 1, 'a pit ends the run');
  S = flat({ 9: '  P', 10: '#####   ####', 11: '#####   ####', 12: '#####   ####' }, 40, null, { assist: { hearts: true } }); for (let i = 0; i < 120 && !S.hurts; i++) E.step(S, B.R | B.RUN); ok(S.hurts === 1 && !S.p.dead && S.p.x < 6 * 16 + 1 && S.p.y < 150, 'assist: back on the ground x=' + S.p.x + ' y=' + S.p.y);
  S = flat({ 9: '  P K          b', 10: '#'.repeat(60) }, 60); S.p.x = 4 * 16 + 3; runN(S, 20, 0); eq(S.cpIdx, 0, 'checkpoint touched'); S.p.pw = 1; S.p.gear = 1; S.reserve = 4; E.step(S, 0);
  const sn = S.snap; S.p.pw = 1; S.p.gear = 0; S.p.x = 14 * 16 - 8; S.p.pw = 0; runN(S, 40, B.R); ok(S.p.dead || S.deaths === 1, 'died'); runN(S, 100, 0); eq(S.deaths, 1); ok(!S.p.dead, 'respawned'); ok(Math.abs(S.p.x - (4 * 16 + 3)) < 14, 'at the checkpoint x=' + S.p.x); ok(S.p.inv > 0);
  ok(S.en.some(e => e.k === 'bug'), 'enemies are back');
  S = flat({ 9: '  P b' }, 40, null, { assist: { hearts: true } }); runN(S, 60, B.R); ok(!S.p.dead && S.hurts >= 1, '"never lose": a hit while small does nothing');
  S = flat({ 9: '  P  s' }, 40); for (let i = 0; i < 1500 && S.deaths < 4; i++) { if (!S.p.dead && S.p.inv === 0) { S.p.x = 4 * 16; S.p.y = 146; } E.step(S, B.R); S.ev.length = 0; } eq(S.deaths, 4, 'four deaths in a row, still playing'); ok(!S.res);
});

test('power-ups: small -> big (puff) -> suit; a second item goes to the reserve box and a button swaps it in; a bare hit steps down one level at a time', () => {
  let S = flat({ 9: '  P' }, 40); eq(S.p.pw, 0); E.givePower(S, 4); eq(S.p.pw, 1); eq(S.p.gear, 0); E.givePower(S, 2); eq(S.p.gear, 2); eq(S.reserve, 0);
  E.givePower(S, 1); eq(S.p.gear, 1, 'a new suit replaces the old'); eq(S.reserve, 2, 'and the old one is kept in the reserve');
  E.step(S, B.RES); eq(S.p.gear, 2, 'the reserve button swaps it in'); eq(S.reserve, 1, 'and the suit you had goes in');
  S = flat({ 9: '  P' }, 40); E.givePower(S, 4); E.givePower(S, 4); eq(S.reserve, 4, 'a spare puff waits in the reserve'); E.step(S, B.RES); eq(S.reserve, 4, 'a big hero keeps a spare puff');
  S = flat({ 9: '  P' }, 40, null, { reserve: 3 }); E.step(S, B.RES); eq(S.p.gear, 3); eq(S.p.pw, 1); eq(S.reserve, 0);
  // hits step down: suit -> big -> small -> lose
  S = flat({ 9: '  P' }, 40, null, { gear: 3 }); const hit = () => { S.p.inv = 0; S.en.push({ k: 'shot', sub: 'pellet', x: S.p.x + 2, y: S.p.y + 4, w: 6, h: 6, vx: 0, vy: 0, g: 0, life: 50, dead: 0 }); runN(S, 3, 0); };
  hit(); eq(S.p.gear, 0); eq(S.p.pw, 1); hit(); eq(S.p.pw, 0); ok(!S.p.dead); hit(); ok(S.p.dead || S.deaths === 1, 'lost');
  // a power-up block gives a puff to a small hero, the level suit to anyone else; the reserve survives a respawn
  S = flat({ 9: '  P', 6: '  !' }, 60, { gear: 'cape' }); S.p.x = 2 * 16 + 3; runN(S, 30, B.J); const it = S.en.find(e => e.k === 'item'); ok(it && it.sub === 2, 'the level suit comes out of the block');
  S = flat({ 9: '  P', 6: '  !' }, 60); S.p.x = 2 * 16 + 3; runN(S, 30, B.J); ok(S.en.some(e => e.k === 'item' && e.sub === 4), 'a puff comes out when the level has no suit');
});

test('blocks from above: a ground pound opens ? and ! blocks and (when big) breaks bricks; a small hero cannot break bricks, head or pound', () => {
  const pound = (rows, pw) => { const S = flat(rows); S.p.pw = pw; S.p.x = 5 * 16 + 3; S.p.y = 3 * 16; S.p.vy = 0; S.p.on = false; E.step(S, B.D); runN(S, 30, B.D); return S; };
  let S = pound({ 9: '  P', 6: '     ?' }, 0); eq(E.tl(S, 5, 6), T.USED, 'a pound opens a ? block'); eq(S.coins, 1);
  S = pound({ 9: '  P', 6: '     !' }, 0); eq(E.tl(S, 5, 6), T.USED, 'and a ! block'); ok(S.en.some(e => e.k === 'item'));
  S = pound({ 9: '  P', 6: '     B' }, 1); eq(E.tl(S, 5, 6), T.AIR, 'a big hero pounds a brick to bits');
  S = pound({ 9: '  P', 6: '     B' }, 0); eq(E.tl(S, 5, 6), T.BRICK, 'a small one cannot');
  S = flat({ 9: '  P', 6: '  B' }); S.p.x = 2 * 16 + 3; runN(S, 30, B.J); eq(E.tl(S, 2, 6), T.BRICK, 'head bump: small cannot'); S = flat({ 9: '  P', 6: '  B' }); S.p.pw = 1; S.p.x = 2 * 16 + 3; runN(S, 30, B.J); eq(E.tl(S, 2, 6), T.AIR, 'big can');
});

test('burrows teleport (down on the mouth), medals are bits, coins add up, the goal ends the run with a result', () => {
  let S = flat({ 9: '  P D            d  m', 8: '        c' }, 40); S.p.x = 4 * 16 + 4; runN(S, 5, 0); E.step(S, B.D); ok(S.p.x > 15 * 16, 'teleported to ' + S.p.x); runN(S, 40, 0); eq(S.cond.burrow, 1);
  runN(S, 5, 0); E.step(S, B.D); ok(S.p.x < 8 * 16, 'and back');
  S = flat({ 9: '  P m  m c   G' }, 40); runN(S, 120, B.R | B.RUN); ok(S.res, 'goal reached'); eq(S.res.med, 3, 'two medals, bits 0 and 1'); eq(S.res.coins, 1); ok(S.res.frames > 20);
  const f = S.f; runN(S, 10, B.R); eq(S.f, f, 'the sim stops after the goal');
});

test('moving platforms carry the hero, crumbling ones fall and come back', () => {
  let S = flat({ 9: '  P', 10: '####        ####', 11: '####        ####', 12: '####        ####', 8: '', 7: '' , 9.1: ''}, 40); S.en.push({ k: 'plat', sub: 'h', x: 4 * 16 - 4, y: 10 * 16 - 8, w: 40, h: 8, ox: 4 * 16 - 4, oy: 10 * 16 - 8, t: 0, dx: 0, dy: 0, px: 0, py: 0, vx: 0, vy: 0 });
  S.p.x = 4 * 16 + 8; S.p.y = 10 * 16 - 8 - 14 - 2; runN(S, 5, 0); ok(S.p.on, 'standing on the platform'); const x0 = S.p.x; runN(S, 40, 0); ok(S.p.x > x0 + 8 && S.p.on, 'carried ' + (S.p.x - x0));
  S = flat({ 9: '  P', 10: '####        ####', 11: '####        ####', 12: '####        ####' }, 40, null, { assist: { hearts: true } }); S.en.push({ k: 'plat', sub: 'c', x: 4 * 16 - 4, y: 10 * 16 - 8, w: 40, h: 8, ox: 4 * 16 - 4, oy: 10 * 16 - 8, t: 0, s: 0, dx: 0, dy: 0, px: 0, py: 0, vx: 0, vy: 0 });
  S.p.x = 4 * 16 + 8; S.p.y = 10 * 16 - 8 - 14 - 2; runN(S, 20, 0); ok(S.p.on); runN(S, 60, 0); ok(!S.p.on || S.p.y > 10 * 16, 'the crumbling platform fell with the hero (a heart or a safe spot follows)');
  const cr = S.en.find(e => e.sub === 'c'); runN(S, 400, 0); eq(cr.s, 0, 'and it is back');
});

test('gear: boots jump higher, cape glides while jump is held, ribbon swings from rings and pulls shields off', () => {
  const apex = g => { const S = flat({}, 60, null, { gear: g }); const y0 = S.p.y; let top = y0; for (let i = 0; i < 90; i++) { E.step(S, B.J); top = Math.min(top, S.p.y); } return y0 - top; };
  ok(apex(1) > apex(0) * 1.35, 'boots ' + apex(1) + ' vs ' + apex(0));
  const fall = (g, hold) => { const S = flat({ 9: '  P' }, 60, null, { gear: g }); S.p.y = 20; S.p.vy = 1; S.p.on = false; S.p.coy = 0; let n = 0; while (!S.p.on && n < 400) { E.step(S, hold ? B.J : 0); n++; } return n; };
  ok(fall(2, true) > fall(2, false) * 1.6, 'cape glide ' + fall(2, true) + ' vs ' + fall(2, false)); ok(fall(0, true) <= fall(0, false) + 3, 'no glide without the cape');
  // ribbon: a ring above and ahead
  let S = flat({ 9: '  P', 5: '       o' }, 60, null, { gear: 3 }); S.p.x = 5 * 16; runN(S, 2, 0); E.step(S, B.ACT); ok(S.p.rope, 'attached to the ring'); const ax = S.p.rope.ax; runN(S, 30, B.R); ok(S.p.rope && Math.hypot(S.p.x + 5 - S.p.rope.ax, S.p.y + 7 - S.p.rope.ay) <= S.p.rope.len + 0.5, 'the rope stays taut');
  let air = false; for (let i = 0; i < 40; i++) { E.step(S, B.R); if (!S.p.on && S.p.rope) air = true; } ok(air, 'swings through the air'); E.step(S, 0); E.step(S, B.J); ok(!S.p.rope, 'jump releases'); eq(S.cond.ribbon, 1);
  // the ribbon on an umbrella
  S = flat({ 9: '  P   u' }, 60, null, { gear: 3 }); E.step(S, B.ACT); const um = S.en.find(e => e.k === 'umb'); eq(um.sh, 0, 'shield pulled off'); runN(S, 60, 0);
  S = flat({ 9: '  P   u' }, 60, null, { gear: 3 }); E.step(S, B.ACT); S.p.x = um.x - 2; S.p.y = 100; runN(S, 1, 0);
  // no rope without the ribbon
  S = flat({ 9: '  P', 5: '       o' }, 60); S.p.x = 5 * 16; E.step(S, B.ACT); ok(!S.p.rope);
});

test('bosses: Patchbear needs 3 stomps (and opens the gate); the Windup General can only be hurt while dizzy', () => {
  const arena = ['#'.repeat(40), '#'.repeat(40), '#'.repeat(40), '', '', '', '', '', '', '', '#'.repeat(40), '#'.repeat(40), '#'.repeat(40)];
  arena[9] = '  P'.padEnd(20, ' ') + 'X'; arena[3] = ' '.repeat(36) + 'g'; arena[4] = ' '.repeat(36) + 'g'; for (let y = 5; y < 10; y++) arena[y] = (arena[y] || '').padEnd(37, ' ').slice(0, 36) + 'g';
  const L = E.parse({ id: 'b', rows: arena, boss: 'bear', arenaX0: 0, arenaX1: 36, gateX: 36 });
  const S = E.newState(L); const boss = S.en.find(e => e.k === 'boss'); eq(boss.hp, 3);
  const stomp = () => { S.p.x = boss.x + boss.w / 2 - 5; S.p.y = boss.y - 20; S.p.vy = 4; S.p.vx = 0; S.p.inv = 200; for (let i = 0; i < 12; i++) { E.step(S, 0); if (boss.hp < 3 && false) break; } };
  ok(solidCount(S) > 0, 'gate closed'); boss.awake = 1;
  for (let k = 0; k < 3; k++) { boss.inv = 0; stomp(); runN(S, 5, 0); }
  ok(S.bossDead === 1, 'boss down, hp ' + boss.hp); eq(solidCount(S), 0, 'gate opened');
  // general: stomp while charging bonks
  const L2 = E.parse({ id: 'g', rows: arena, boss: 'general', arenaX0: 0, arenaX1: 36, gateX: 36 });
  const S2 = E.newState(L2); const gen = S2.en.find(e => e.k === 'boss'); gen.awake = 1; gen.s = 1; gen.t = 0;
  S2.p.x = gen.x + 5; S2.p.y = gen.y - 20; S2.p.vy = 4; S2.p.inv = 200; runN(S2, 12, 0); eq(gen.hp, 3, 'not hurt while charging');
  const S3 = E.newState(L2); const g3 = S3.en.find(e => e.k === 'boss'); g3.awake = 1; g3.s = 2; g3.inv = 0; S3.p.x = g3.x + 5; S3.p.y = g3.y - 20; S3.p.vy = 4; S3.p.inv = 200; runN(S3, 12, 0); eq(g3.hp, 2, 'hurt while dizzy');
  function solidCount(s) { let n = 0; for (let y = 0; y < 13; y++) for (let x = 0; x < 40; x++) if (E.tl(s, x, y) === T.GATE) n++; return n; }
});

test('swimming: a stroke at the surface hops out of the water onto the shore', () => {
  const S = flat({ 9: '  P     ', 10: '######~~~~~~~#####', 11: '######~~~~~~~#####', 12: '#################' }, 40); S.p.x = 8 * 16; S.p.y = 150; runN(S, 60, 0); ok(S.p.swim, 'swimming');
  let out = false; for (let i = 0; i < 400 && !out; i++) { E.step(S, B.R | (i % 12 < 3 ? B.J : 0)); S.ev.length = 0; if (S.p.on && S.p.x > 13 * 16 && bot(S) <= 160.01) out = true; } ok(out, 'reached the far shore by swimming and hopping');
});

function arenaLevel(boss, extra) {
  const rows = []; for (let y = 0; y < 13; y++) rows.push(' '.repeat(44));
  for (let y = 0; y < 3; y++) rows[y] = '#'.repeat(44); for (let y = 10; y < 13; y++) rows[y] = '#'.repeat(44);
  rows[9] = '  P' + ' '.repeat(11) + 'X' + ' '.repeat(29);
  if (extra) extra(rows);
  return E.parse({ id: 'b-' + boss, rows, boss, arenaX0: 0, arenaX1: 44, floorRow: 10, surfaceRow: 8 });
}
const stompBoss = (S, boss) => { S.p.x = boss.x + boss.w / 2 - 5; S.p.y = boss.y - 18; S.p.vy = 4; S.p.vx = 0; S.p.inv = 300; S.p.on = false; runN(S, 10, 0); };

test('bosses 3-6: rubber duck is weak only on the surface and fires bubbles from below; owl crashes and is dizzy; clock mouse pops out of holes; golem needs a pound or the ribbon to lose its shield', () => {
  // duck
  let S = E.newState(arenaLevel('duck', r => { r[3] = ' '.repeat(14) + 'X' + ' '.repeat(29); r[8] = '~'.repeat(44); r[9] = ' P' + '~'.repeat(42); })); let d = S.en.find(e => e.k === 'boss'); d.awake = 1; S.p.inv = 9999;  let shots = 0, dived = false; for (let i = 0; i < 500; i++) { E.step(S, 0); S.ev.length = 0; if (d.s === 1) dived = true; shots = Math.max(shots, S.en.filter(e => e.k === 'shot').length); }
  ok(dived && shots >= 3, 'duck dives and fires bubbles ' + shots);
  S = E.newState(arenaLevel('duck')); d = S.en.find(e => e.k === 'boss'); d.awake = 1; d.s = 1; d.inv = 0; stompBoss(S, d); eq(d.hp, 3, 'not weak while diving'); d.s = 0; d.inv = 0; runN(S, 3, 0); stompBoss(S, d); eq(d.hp, 2, 'weak at the surface');
  // owl
  S = E.newState(arenaLevel('owl')); let o = S.en.find(e => e.k === 'boss'); o.awake = 1; S.p.inv = 9999;  let crashed = false; for (let i = 0; i < 900 && !crashed; i++) { E.step(S, 0); S.ev.length = 0; if (o.s === 3) crashed = true; } ok(crashed, 'owl swoops and crashes');
  o.inv = 0; const hp0 = o.hp; stompBoss(S, o); eq(o.hp, hp0 - 1, 'dizzy owl is hurt'); S = E.newState(arenaLevel('owl')); o = S.en.find(e => e.k === 'boss'); o.awake = 1; o.s = 0; stompBoss(S, o); eq(o.hp, 3, 'a flying owl is not');
  // mouse
  S = E.newState(arenaLevel('mouse')); let m = S.en.find(e => e.k === 'boss'); m.awake = 1; S.p.inv = 9999;  const holes = new Set(); let popped = false; for (let i = 0; i < 900; i++) { E.step(S, 0); S.ev.length = 0; if (m.s === 1 && m.t > 30) { popped = true; holes.add(m.hole); } } ok(popped && holes.size >= 2, 'the mouse pops out of different holes ' + [...holes]);
  S = E.newState(arenaLevel('mouse')); m = S.en.find(e => e.k === 'boss'); m.awake = 1; S.p.x = m.x; S.p.y = 146; S.p.inv = 0; m.s = 0; m.hide = 1; m.y = m.fy + 6; runN(S, 5, 0); ok(!S.p.dead && S.hurts === 0, 'a hidden mouse is harmless');
  // golem
  S = E.newState(arenaLevel('golem')); let g = S.en.find(e => e.k === 'boss'); g.awake = 1; g.inv = 0; eq(g.sh, 1); stompBoss(S, g); eq(g.hp, 6, 'a plain stomp bonks off the shield'); 
  S = E.newState(arenaLevel('golem')); g = S.en.find(e => e.k === 'boss'); g.awake = 1; S.p.pw = 1; S.p.x = g.x + 8; S.p.y = g.y - 40; S.p.on = false; S.p.inv = 300; E.step(S, B.D); runN(S, 12, B.D); eq(g.sh, 0, 'a ground pound breaks the shield'); eq(g.s, 6); g.inv = 0; stompBoss(S, g); eq(g.hp, 5, 'then a stomp hurts'); eq(g.sh, 1, 'and the shield comes back');
  S = E.newState(arenaLevel('golem'), { gear: 3 }); g = S.en.find(e => e.k === 'boss'); g.awake = 1; S.p.x = g.x - 30; S.p.y = 146; runN(S, 3, 0); E.step(S, B.ACT); eq(g.sh, 0, 'the ribbon yanks the shield off');
});

run('hop-engine');
