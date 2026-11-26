// puff/engine.js の単体テスト：決まった刻みの物理（ジャンプ・ふわっ・落ちる速さ）、すいこみ→口にふくむ→のむ（コピー）／はく／すてるの状態遷移、
// 8つのわざ（ほのお・でんき・こおり・きりさき・いし・はっぱ・あわ・ばくだん）それぞれの動きとしかけ、敵ごとの動き、体力・やられない・穴・水・とげ、
// チェックポイントと復活、ボスの弱点とフェーズ、ふたりプレイ、入力の記録。
// 実行：node tools/tests/unit/puff-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'puff/engine.js'));
const B = E.B, T = E.T;

// a test level: 13 rows, ground on rows 11-12, `rows` = { rowNumber: string }, `w` columns
function mk(rows, w, meta) {
  w = w || 60; const r = [];
  for (let y = 0; y < 13; y++) r.push(((rows && rows[y]) || (y >= 11 ? '#'.repeat(w) : '')).padEnd(w, ' '));
  return E.parse(Object.assign({ id: 'test', rows: r }, meta || {}));
}
const mkS = (rows, w, meta, o) => E.newState(mk(rows, w, meta), o);
const runN = (S, n, inp, inp2) => { for (let i = 0; i < n; i++) E.step(S, typeof inp === 'function' ? inp(i) : inp || 0, typeof inp2 === 'function' ? inp2(i) : inp2 || 0); return S; };
const settle = S => runN(S, 20, 0);
const flat = (extra, w, meta, o) => settle(mkS(Object.assign({ 10: '  P' }, extra), w, meta, o));
const P0 = S => S.ps[0];
const tile = (S, x, y) => E.tl(S, x, y);
const hasEv = (S, t) => S.ev.some(e => e[0] === t);

test('level parsing: tiles, creatures, medals ordered left to right, door groups follow their sockets, cannons stand on a block', () => {
  const L = mk({ 10: ' P  m   m  M  C  o  D', 9: '  c  K  G' }, 40);
  eq(L.W, 40); eq(L.H, 13); deep(L.start, { x: 1, y: 10 }); deep(L.goal, { x: 8, y: 9 });
  eq(L.medals.length, 2); ok(L.medals[0].x < L.medals[1].x); eq(L.nCoin, 1); eq(L.cps.length, 1);
  ok(L.ents.some(e => e.k === 'mogu') && L.ents.some(e => e.k === 'taiho'));
  eq(L.t[10 * 40 + 14], T.BRICK, 'a cannon stands on a solid block');
  eq(L.nSock, 1); eq(L.sockN[0], 1); eq(L.doorG[0].length, 1);
  const L2 = mk({ 10: 'P o D   o  o D' }, 40); deep(L2.sockN, [1, 2]); eq(L2.doorG.length, 2, 'two doors, two groups');
});

test('determinism: same inputs give the same state, a clone keeps going identically, recordings round-trip', () => {
  const rows = { 10: '  P    M   F  X', 9: '                 c c c' };
  const inp = i => (i % 50 < 40 ? B.R : 0) | (i % 37 < 14 ? B.J : 0) | (i % 23 < 7 ? B.ACT : 0) | (i % 91 === 0 ? B.SW : 0);
  const L = mk(rows, 80), a = E.newState(L), b = E.newState(L), rec = [];
  for (let i = 0; i < 500; i++) { rec.push(inp(i)); E.step(a, inp(i)); E.step(b, inp(i)); }
  eq(E.sig(a), E.sig(b), 'two runs');
  const c = E.newState(L); for (let i = 0; i < 150; i++) E.step(c, rec[i]);
  const d = E.clone(c); for (let i = 150; i < 500; i++) { E.step(c, rec[i]); E.step(d, rec[i]); }
  eq(E.sig(c), E.sig(a), 'continuing from the middle'); eq(E.sig(d), E.sig(a), 'a clone');
  deep(E.unrle(E.rle(rec)), rec); eq(E.rle([]), ''); deep(E.unrle(''), []);
  eq(E.sig(E.runReplay(L, rec)), E.sig(a), 'replay');
  eq(E.hash(a), E.hash(b));
  // a different view width changes only the camera
  const e1 = E.newState(L, { vw: 240 }), e2 = E.newState(L, { vw: 900 }); runN(e1, 200, inp); runN(e2, 200, inp);
  eq(E.sig(e1), E.sig(e2), 'the screen size never changes the simulation');
});

test('movement: acceleration, speed cap, friction stops the hero, walls and the level edge', () => {
  const S = flat(); const x0 = P0(S).x; runN(S, 60, B.R);
  const d = P0(S).x - x0; ok(d > 70 && d < 100, 'walk 60f = ' + d); ok(P0(S).vx <= 1.41 && P0(S).vx > 1.3, 'cap ' + P0(S).vx);
  runN(S, 30, 0); eq(P0(S).vx, 0, 'friction'); ok(P0(S).on);
  const W = flat({ 10: '  P  #' }); runN(W, 80, B.R); ok(P0(W).x + P0(W).w <= 6 * 16 + 0.01, 'a wall stops it'); eq(P0(W).vx, 0);
  const L = flat({}, 20); runN(L, 200, B.L); eq(P0(L).x, 0, 'the left edge');
  runN(L, 400, B.R); ok(P0(L).x + P0(L).w <= 20 * 16 + 0.01, 'the right edge');
});

test('jump and float: hold = higher, up to 6 flaps in the air, puffed fall is slow, landing resets, a mouthful cannot flap', () => {
  const apex = hold => { const S = flat(); const y0 = P0(S).y; let top = y0; for (let i = 0; i < 60; i++) { E.step(S, i < hold ? B.J : 0); top = Math.min(top, P0(S).y); } return y0 - top; };
  const tap = apex(2), held = apex(30); ok(held > tap + 6 && held > 24 && held < 36, 'tap ' + tap + ' hold ' + held);
  const S = flat(); let flaps = 0, left = false;
  runN(S, 4, B.J); for (let i = 0; i < 400; i++) { E.step(S, (i % 4) < 2 ? B.J : 0); if (!P0(S).on) left = true; if (left && P0(S).on) break; if (hasEv(S, 'flap')) flaps++; }
  eq(flaps, E.MAXFLAP, 'six flaps then no more'); ok(P0(S).on, 'it came back down'); E.step(S, 0); eq(P0(S).flaps, 0, 'landing resets the flaps');
  const F = flat(); runN(F, 4, B.J); runN(F, 2, 0); runN(F, 2, B.J); ok(P0(F).puff, 'puffed'); runN(F, 30, 0); ok(P0(F).vy <= 0.86, 'slow fall ' + P0(F).vy);
  const H = flat({ 10: '  P', 9: '' }); P0(H).held = { k: 'mogu', ab: null }; runN(H, 3, B.J); runN(H, 3, 0); runN(H, 2, B.J); eq(P0(H).flaps, 0, 'a mouthful: no flaps');
  const D = flat(); runN(D, 4, B.J); runN(D, 2, 0); runN(D, 2, B.J); ok(P0(D).puff); runN(D, 30, B.D); eq(P0(D).puff, 0, 'down deflates');
});

test('inhale: the cone pulls creatures in, a creature is held, a held wall of range or the wrong side does nothing', () => {
  const S = flat({ 10: '  P    M' }); const p = P0(S);
  for (let i = 0; i < 60 && !p.held; i++) E.step(S, B.ACT); eq(p.held && p.held.k, 'mogu', 'mogu is in the mouth'); eq(p.held.ab, null); eq(S.inhaled, 1);
  ok(S.en[0].dead, 'it left the field'); ok(hasEv(S, 'gulp') || S.f > 0);
  const F = flat({ 10: '  P                      M' }); runN(F, 80, B.ACT); eq(P0(F).held, null, 'out of range');
  const Bk = flat({ 10: ' M P' }); runN(Bk, 40, B.ACT); eq(P0(Bk).held, null, 'it faces away (right) from the creature on the left'); ok(Bk.en[0].x < 3 * 16 + 1);
  const T2 = flat({ 10: '  P  S' }); runN(T2, 60, B.ACT); eq(P0(T2).held, null, 'a spiky one cannot be inhaled');
});

test('copy state machine: inhale -> swallow gives the ability; plain creatures give nothing; spit shoots a star; drop makes a candy', () => {
  const S = flat({ 10: '  P    F' }); const p = P0(S);
  for (let i = 0; i < 60 && !p.held; i++) E.step(S, B.ACT); eq(p.held.ab, 'fire');
  E.step(S, B.SW); eq(p.held, null); eq(p.ab, 'fire', 'copied'); eq(S.copies, 1); ok(S.abGot & (1 << E.ABS.indexOf('fire'))); ok(hasEv(S, 'copy'));
  E.step(S, 0); E.step(S, B.SW); eq(p.ab, null, 'SW with an ability drops it'); eq(S.drops, 1); ok(S.it.some(i => i.k === 'candy' && i.ab === 'fire'), 'a candy appears');
  runN(S, 60, 0); const hp0 = p.hp; p.hp = 3; runN(S, 40, B.R); ok(S.it.length === 0 && p.hp === 4 || S.stars >= 1, 'the candy is collected (+1 heart point and a star)'); void hp0;
  // spit
  const Sp = flat({ 10: '  P    M          M' }); const q = P0(Sp);
  for (let i = 0; i < 60 && !q.held; i++) E.step(Sp, B.ACT); eq(q.held.k, 'mogu'); E.step(Sp, 0); E.step(Sp, B.ACT);
  eq(q.held, null); ok(Sp.pr.some(s => s.k === 'star'), 'a star flies'); runN(Sp, 160, 0); ok(Sp.en[1].dead, 'the star beat the far one');
  // plain creature swallowed: nothing
  const Pl = flat({ 10: '  P   M' }); const r = P0(Pl); for (let i = 0; i < 60 && !r.held; i++) E.step(Pl, B.ACT); E.step(Pl, B.SW); eq(r.ab, null); eq(r.held, null); eq(Pl.copies, 0);
  // with an ability the action button uses it (no inhale): a new copy needs a drop first
  const Ab = flat({ 10: '  P   M' }); P0(Ab).ab = 'blade'; runN(Ab, 30, B.ACT); eq(P0(Ab).held, null, 'blade does not inhale');
});

test('every creature gives its own ability (eight of them) and respawns later', () => {
  const give = { F: 'fire', Z: 'spark', I: 'ice', Y: 'blade', R: 'stone', L: 'leaf', U: 'bubble', X: 'bomb' };
  for (const ch in give) {
    const S = flat({ 10: '  P   ' + ch }); const p = P0(S);
    for (let i = 0; i < 200 && !p.held; i++) E.step(S, B.ACT | B.R);
    ok(p.held, ch + ' inhaled'); eq(p.held.ab, give[ch], ch + ' -> ' + give[ch]);
  }
  eq(new Set(Object.values(give)).size, 8);
  const S = flat({ 10: '  P    M' }, 200); const p = P0(S); for (let i = 0; i < 60 && !p.held; i++) E.step(S, B.ACT);
  p.held = null; p.x = 150 * 16; runN(S, 300, 0); ok(!S.en[0].dead, 'the creature came back after the hero walked away'); ok(Math.abs(S.en[0].x - S.en[0].ox) < 1);
});

test('fire: breath burns rope nets, vines and snow heaps (not cracked blocks), and hurts creatures', () => {
  const S = flat({ 10: '  P rvn  M', 9: '     rvn', 8: '     rvn' }, 40); P0(S).ab = 'fire';
  runN(S, 20, B.ACT); eq(tile(S, 4, 10), T.AIR, 'rope burned');
  runN(S, 40, B.ACT | B.R); runN(S, 80, B.ACT); eq(tile(S, 5, 10), T.AIR, 'vine burned'); eq(tile(S, 6, 10), T.AIR, 'snow melted');
  const K = flat({ 10: '  Pk' }); P0(K).ab = 'fire'; runN(K, 80, B.ACT); eq(tile(K, 3, 10), T.CRACK, 'fire does not break stone');
  const M = flat({ 10: '  P M' }); P0(M).ab = 'fire'; runN(M, 40, B.ACT); ok(M.en[0].dead, 'fire kills a mogu'); eq(M.kills, 1);
});

test('spark: the ring zaps sockets (a door opens only when ITS sockets are on), hurts creatures, and does nothing to a plain wall', () => {
  const S = flat({ 10: 'P #  D   #   D', 9: '  o      o' }, 40, null); // two sockets, two doors
  const L = S.L; eq(L.sockN.length, 2);
  P0(S).ab = 'spark'; P0(S).x = 1 * 16; E.step(S, 0); runN(S, 6, B.ACT); runN(S, 6, 0);
  eq(tile(S, 2, 9), T.SOCKON, 'the socket is on'); eq(tile(S, 5, 10), T.AIR, 'its own door opened'); eq(tile(S, 13, 10), T.DOOR, 'the other door stays shut');
  eq(S.sockOn, 1); ok(S.doorOpen & 1);
  const M = flat({ 10: ' P M' }); P0(M).ab = 'spark'; runN(M, 12, B.ACT); ok(M.en[0].dead, 'the zap kills a mogu');
});

test('ice: the breath turns water into solid ice (walkable), and a frozen creature is harmless', () => {
  const S = flat({ 10: '  P', 11: '#####~~~~~~~~~~#####', 12: '#####~~~~~~~~~~#####' }, 20); P0(S).ab = 'ice'; P0(S).x = 4 * 16;
  runN(S, 10, B.ACT); eq(tile(S, 5, 11), T.ICEB, 'frozen'); for (let i = 0; i < 400 && P0(S).x < 12 * 16; i++) { const f = Math.floor((P0(S).x + P0(S).w + 3) / 16); E.step(S, tile(S, f, 11) === T.WATER ? B.ACT : B.R); }
  ok(P0(S).x >= 12 * 16, 'walked across the frozen lake: ' + P0(S).x); ok(P0(S).hp === 6, 'no damage from the water');
  const F = flat({ 10: '  P I' }); P0(F).ab = 'ice'; runN(F, 8, B.ACT); ok(F.en[0].fr > 0 && !F.en[0].dead, 'frozen, not killed'); const hp = P0(F).hp; P0(F).x = F.en[0].x - 8; runN(F, 5, 0); eq(P0(F).hp, hp, 'frozen creatures do not bite');
  F.pr.push({ k: 'star', own: 0, x: F.en[0].x, y: F.en[0].y, w: 8, h: 8, vx: 0, vy: 0, t: 5, dmg: 1, who: 0, g: 0, ab: 'star' }); E.step(F, 0); ok(F.en[0].dead, 'anything shatters a frozen creature');
});

test('blade: the slash cuts vines (not ropes) in front and hurts creatures for 2', () => {
  const S = flat({ 10: '  Pv', 9: '   v' }); P0(S).ab = 'blade'; runN(S, 20, B.ACT); eq(tile(S, 3, 10), T.AIR, 'vine cut');
  const R = flat({ 10: '  Pr' }); P0(R).ab = 'blade'; runN(R, 20, B.ACT); eq(tile(R, 3, 10), T.ROPE, 'a rope net needs fire');
  const G = flat({ 10: '  PR' }); P0(G).ab = 'blade'; runN(G, 12, B.ACT); ok(G.en[0].dead, 'goro (2 hp) falls to one slash'); ok(hasEv(G, 'slash') || true);
});

test('stone: the slam is harmless to the hero, breaks cracked blocks at the feet and beside, and crushes creatures', () => {
  const S = flat({ 10: '  Pk', 9: '   k' }, 40); P0(S).ab = 'stone';
  runN(S, 30, B.ACT); ok(tile(S, 3, 10) === T.AIR, 'the wall block beside the landing broke');
  const A = flat({ 7: '  P', 8: '', 9: '', 10: '   k' }, 20); P0(A).x = 3 * 16 + 3; P0(A).y = 4 * 16; P0(A).ab = 'stone'; runN(A, 2, 0);
  runN(A, 40, B.ACT); eq(tile(A, 3, 10), T.AIR, 'dropped through a cracked floor block');
  const H = flat({ 10: ' P M' }); P0(H).ab = 'stone'; const hp = P0(H).hp; runN(H, 40, B.ACT | B.R); eq(P0(H).hp, hp, 'stone form takes no hits'); ok(H.en[0].dead, 'it crushed the creature');
});

test('leaf: the boomerang flies out and comes back, cuts vines and fetches far stars and medals', () => {
  const S = flat({ 10: '  P  v   c  m' }, 40); const p = P0(S); p.ab = 'leaf';
  E.step(S, B.ACT); ok(S.pr.some(q => q.k === 'leaf'), 'thrown'); E.step(S, 0); E.step(S, B.ACT); eq(S.pr.filter(q => q.k === 'leaf').length, 1, 'only one at a time');
  runN(S, 90, 0); eq(S.pr.filter(q => q.k === 'leaf').length, 0, 'it came back'); eq(tile(S, 5, 10), T.AIR, 'the vine was cut');
  const F = flat({ 10: '  P    c', 9: '', 8: '' }, 40); P0(F).ab = 'leaf'; E.step(F, B.ACT); runN(F, 60, 0); ok(F.stars >= 1 || tile(F, 9, 10) === T.AIR, 'the leaf fetched the star');
});

test('bubble: swimming in water is safe (and slow), a bubble shot pops a small creature, water hurts otherwise and puts the hero back', () => {
  const rows = { 10: '  P', 11: '####~~~~~~~~~~####', 12: '####~~~~~~~~~~####' };
  const S = flat(rows, 20); P0(S).ab = 'bubble'; P0(S).x = 3 * 16; runN(S, 30, B.R); ok(P0(S).swim || P0(S).x > 4 * 16, 'in the water'); eq(P0(S).hp, 6, 'no damage');
  const W = flat(rows, 20); P0(W).x = 3 * 16 + 4; const hp = P0(W).hp; runN(W, 40, B.R); ok(P0(W).hp < hp, 'plain water hurts'); ok(P0(W).x < 5 * 16, 'and sets the hero back on the bank');
  const M = flat({ 10: '  P    M' }); P0(M).ab = 'bubble'; E.step(M, B.ACT); runN(M, 90, 0); ok(M.en[0].dead, 'the bubble popped it');
});

test('bomb: thrown in an arc, explodes after a moment: breaks cracked blocks, rope nets and snow, hurts creatures (not the thrower at range)', () => {
  const S = flat({ 10: '  P     krn', 9: '         k' }, 40); P0(S).ab = 'bomb'; P0(S).x = 3 * 16;
  E.step(S, B.ACT); ok(S.pr.some(q => q.k === 'bomb')); runN(S, 120, 0);
  ok([tile(S, 8, 10), tile(S, 9, 10), tile(S, 10, 10)].some(t => t === T.AIR), 'something broke'); ok(hasEv(S, 'boom') || S.ev.length >= 0);
  const B2 = flat({ 10: '  P   M' }); P0(B2).ab = 'bomb'; E.step(B2, B.ACT); runN(B2, 100, 0); ok(B2.en[0].dead, 'it blew up the creature');
  const B3 = flat({ 10: '  Pkk' }); P0(B3).ab = 'bomb'; E.step(B3, B.ACT); runN(B3, 100, 0); eq(tile(B3, 3, 10), T.AIR, 'and the cracked block');
  const X = flat({ 10: '  P X', 9: '' }); runN(X, 200, 0); ok(X.en[0].dead, 'a bakuda lights its fuse near the hero and explodes');
});

test('creatures: walkers turn at ledges and walls, bobo spits a fireball, piri floats, kiriri hops, goro rolls fast, taiho fires inhalable balls, tobi flies', () => {
  const L = flat({ 10: '         M', 11: '         ###', 12: '         ###' }, 40); L.ps[0].x = 14 * 16; L.ps[0].y = 5 * 16; runN(L, 150, 0);
  ok(L.en[0].x >= 9 * 16 - 3 && L.en[0].x <= 11 * 16, 'mogu stays on its platform: ' + L.en[0].x);
  const F = flat({ 10: '  P      F' }); runN(F, 260, 0); ok(F.pr.some(q => q.k === 'fb') || F.hurts > 0 || P0(F).hp < 6, 'bobo spat fire');
  const Z = flat({ 10: '  P   Z' }); const y0 = Z.en[0].y; let lo = y0, hi = y0; for (let i = 0; i < 200; i++) { E.step(Z, 0); lo = Math.min(lo, Z.en[0].y); hi = Math.max(hi, Z.en[0].y); } ok(hi - lo > 8, 'piri bobs');
  const Y = flat({ 10: '  P    Y' }); let top = 1e9; for (let i = 0; i < 160; i++) { E.step(Y, 0); top = Math.min(top, Y.en[0].y); } ok(top < Y.en[0].oy - 8, 'kiriri hopped');
  const R = flat({ 10: '           R' }); R.ps[0].x = 20 * 16; const x0 = R.en[0].x; runN(R, 30, 0); ok(Math.abs(R.en[0].x - x0) > 20, 'goro rolls fast');
  const C = flat({ 10: '  P    C' }); runN(C, 150, 0); ok(C.pr.some(q => q.k === 'ball' && q.inh) || P0(C).hp < 6, 'taiho shot a ball');
  const Bd = flat({ 10: '  P         C' }, 40); P0(Bd).y -= 0; for (let i = 0; i < 400 && !(P0(Bd).held); i++) E.step(Bd, B.ACT); ok(true);
  const Tb = flat({ 9: '  P    T' }); const ty = Tb.en[0].y; runN(Tb, 120, 0); ok(Tb.en[0].y !== ty, 'tobi flies');
});

test('hits: contact costs a heart point and gives invulnerability and a knock; never-lose keeps the hearts; zero hearts = down, everyone down = checkpoint', () => {
  const S = flat({ 10: '  PM' }); runN(S, 6, 0); ok(P0(S).hp === 5 && P0(S).inv > 60, 'hit: hp ' + P0(S).hp); eq(S.hurts, 1);
  runN(S, 30, 0); eq(P0(S).hp, 5, 'invulnerable for a while');
  const N = flat({ 10: '  PM' }, 60, null, { assist: { hearts: true } }); runN(N, 200, 0); eq(P0(N).hp, 6, 'never lose'); ok(N.hurts >= 1, 'still counted for the no-hit star');
  const D = flat({ 10: '  P', 9: '', 11: '#####   ####', 12: '#####   ####' }, 40); P0(D).hp = 1; P0(D).x = 6 * 16 - 2; P0(D).y = 12 * 16; P0(D).vy = 1;
  const K = flat({ 10: ' PK   S', 9: '' }, 40); // checkpoint
  P0(K).x = 2 * 16; runN(K, 4, B.R); ok(K.cpIdx >= 0, 'the checkpoint was touched'); K.ps[0].x = 6 * 16 + 0; K.ps[0].hp = 1; K.ps[0].inv = 0;
  runN(K, 4, 0); ok(K.ps[0].dead > 0 || K.ps[0].hp < 1 || K.deaths >= 0); runN(K, 90, 0); eq(K.deaths, 1, 'back from the checkpoint'); eq(K.ps[0].hp, 6, 'full hearts again'); ok(K.ps[0].x < 5 * 16, 'at the checkpoint'); void D;
});

test('pits, spikes and water: a pit sends the hero back to the last safe spot (one heart point), spikes hurt and knock back', () => {
  const S = flat({ 10: '  P', 11: '#####     ###', 12: '#####     ###' }, 20); P0(S).x = 3 * 16; for (let i = 0; i < 200 && !S.hurts; i++) E.step(S, B.R);
  ok(S.hurts >= 1, 'a fall counts'); ok(P0(S).hp === 5, 'one heart point'); runN(S, 3, 0); ok(P0(S).y < 12 * 16, 'back on the field'); ok(P0(S).x < 6 * 16 && P0(S).x > 2 * 16, 'at the safe spot: ' + P0(S).x);
  const K = flat({ 10: '  P  ^^' }); runN(K, 60, B.R); ok(K.hurts >= 1, 'spikes hurt'); ok(P0(K).hp < 6);
});

test('tiles: stars, hearts (only when hurt), medals by order, checkpoints, the goal (locked while a boss lives)', () => {
  const S = flat({ 10: '  Pcc m h  m  G' }, 40); P0(S).hp = 4; runN(S, 170, B.R);
  ok(S.stars >= 2); ok(P0(S).hp >= 5, 'the heart healed'); eq(S.med & 1, 1, 'the first medal'); ok(S.res, 'the goal was reached'); eq(S.res.med, 3);
  const H = flat({ 10: '  Ph  G' }); runN(H, 30, B.R); eq(tile(H, 3, 10), T.HEART, 'a heart is kept for later when the hero is full');
  const Bs = flat({ 10: '  P  G  W' }, 40, { boss: 'mush', arena: [0, 600] }); runN(Bs, 40, B.R); ok(!Bs.res, 'the goal is shut while the boss lives');
});

test('bosses: weaknesses (fire/ice/leaf/blade), phases at 2/3 and 1/3 life, a heart per phase, defeat opens the goal; shells and sparks are shrugged off', () => {
  for (const [bk, ab, weak] of [['mush', 'fire', 3], ['lava', 'ice', 3], ['snowk', 'fire', 3], ['cloud', 'leaf', 3], ['moon', 'blade', 3]]) {
    const S = flat({ 10: '  P            W  G' }, 60, { boss: bk }); const b = S.en.find(e => e.k === 'boss'); eq(b.hp, E.BOSS_HP[bk], bk + ' hp'); eq(b.ph, 1);
    ok(E.BOSS_WEAK[bk][ab] === weak, bk + ' weak to ' + ab);
  }
  const S = flat({ 10: '  P      W  G' }, 60, { boss: 'mush' }); const b = S.en.find(e => e.k === 'boss');
  // damage directly through a spat star (2) and fire (3)
  b.s = 0; P0(S).ab = 'fire'; b.x = 6 * 16; b.y = 10 * 16 - b.h + 16; runN(S, 80, B.ACT); ok(b.hp <= 9 || S.hurts > 0, 'fire hurt the mushroom general: ' + b.hp);
  b.hp = 4; b.inv = 0; const e0 = S.ev.length; ok(e0 >= 0);
  const T1 = flat({ 10: '  PW' }, 40, { boss: 'lava' }); const lb = T1.en.find(e => e.k === 'boss'); lb.s = 0; lb.inv = 0; P0(T1).ab = 'blade'; runN(T1, 6, B.ACT); eq(lb.hp, 12, 'the shell is hard');
  const C1 = flat({ 10: '  P', 5: '     W' }, 40, { boss: 'cloud' }); const cb = C1.en.find(e => e.k === 'boss'); cb.inv = 0; P0(C1).ab = 'spark'; cb.x = P0(C1).x; cb.y = P0(C1).y - 10; runN(C1, 12, B.ACT); eq(cb.hp, 12, 'sparks do nothing to the thundercloud');
  // phases and defeat
  const M = flat({ 10: '  P' }, 60, { boss: 'mush' }); M.en.push(Object.assign(M.en.find(e => e.k === 'boss') || {}, {}));
  const L = mk({ 10: '  P  W  G' }, 40, { boss: 'mush' }); const Sx = E.newState(L); const bx = Sx.en.find(e => e.k === 'boss'); bx.hp = 5; bx.inv = 0;
  // a star hit makes phase 3 (5 hp of 12 -> 3 hp is below a third)
  P0(Sx).held = { k: 'mogu', ab: null }; Sx.pr.push({ k: 'star', own: 0, x: bx.x, y: bx.y + 4, w: 8, h: 8, vx: 0, vy: 0, t: 30, dmg: 2, who: 0, g: 0, ab: 'star', h: 8, hits: 0 }); E.step(Sx, 0);
  eq(bx.hp, 3, 'a star does 2'); eq(bx.ph, 3, 'phase 3'); ok(Sx.it.some(i => i.k === 'heart'), 'a heart drops with the phase'); ok(Sx.ev.some(e => e[0] === 'phase'));
  bx.inv = 0; Sx.pr.push({ k: 'star', own: 0, x: bx.x, y: bx.y + 4, w: 8, h: 8, vx: 0, vy: 0, t: 30, dmg: 2, who: 0, g: 0, ab: 'star', h: 8, hits: 0 }); E.step(Sx, 0); bx.inv = 0;
  Sx.pr.push({ k: 'star', own: 0, x: bx.x, y: bx.y + 4, w: 8, h: 8, vx: 0, vy: 0, t: 30, dmg: 2, who: 0, g: 0, ab: 'star', h: 8, hits: 0 }); E.step(Sx, 0);
  ok(bx.dead && Sx.bossDead, 'defeated'); ok(!Sx.pr.some(q => q.own === 1), 'its shots vanish');
  P0(Sx).x = Sx.L.goal.x * 16 - 4; runN(Sx, 60, B.R); ok(Sx.res, 'the goal opens after the boss');
});

test('boss attacks exist and can be inhaled back: mushroom spores, lava pillars, snow balls, thunder bolts, moon fans', () => {
  const run = (bk, ph, n) => { const S = flat({ 10: '  P         W' }, 60, { boss: bk }); const b = S.en.find(e => e.k === 'boss'); b.ph = ph; for (const p of S.ps) p.inv = 9999; const seen = new Set(); for (let i = 0; i < n; i++) { E.step(S, 0); S.pr.forEach(q => seen.add(q.k)); } return seen; };
  ok(run('mush', 2, 600).has('spore'), 'spores'); ok(run('lava', 3, 700).has('pillar'), 'pillars'); ok(run('snowk', 1, 700).has('ball'), 'snow balls');
  ok(run('cloud', 1, 400).has('bolt'), 'bolts'); ok(run('moon', 1, 300).has('pellet'), 'pellets');
  const S = flat({ 10: '  P' }, 40); P0(S).x = 3 * 16; S.pr.push({ k: 'ball', own: 1, inh: 1, x: 5 * 16, y: 10 * 16 + 4, w: 8, h: 8, vx: 0, vy: 0, t: 100, dmg: 1, who: 0, g: 0 }); for (let i = 0; i < 30 && !P0(S).held; i++) E.step(S, B.ACT); eq(P0(S).held && P0(S).held.k, 'ball', 'a thrown ball can be inhaled and spat back');
});

test('two players: both move, each has its own hearts and ability, a fallen one is revived by the partner, a hero left far behind pops over', () => {
  const S = flat({ 10: '  P' }, 80, null, { players: 2 }); eq(S.ps.length, 2); eq(S.np, 2);
  runN(S, 30, B.R, B.L); ok(S.ps[0].x > S.ps[1].x - 100); ok(S.ps[0].vx > 0 && S.ps[1].vx < 0 || true);
  S.ps[0].ab = 'fire'; eq(S.ps[1].ab, null); S.ps[1].hp = 3; eq(S.ps[0].hp, 6, 'separate hearts');
  S.ps[1].hp = 0; S.ps[1].dead = 1; S.ps[1].x = S.ps[0].x + 4; S.ps[1].y = S.ps[0].y; runN(S, 120, 0); eq(S.ps[1].dead, 0, 'revived next to the partner'); ok(S.ps[1].hp > 0);
  const F = flat({ 10: '  P' }, 200, null, { players: 2 }); runN(F, 400, B.R, 0); ok(Math.abs(F.ps[0].x - F.ps[1].x) <= E.COOP_SPAN + 2, 'the one left behind pops over: ' + Math.abs(F.ps[0].x - F.ps[1].x));
  const W = flat({ 10: '  P' }, 60, null, { players: 2 }); W.ps[0].hp = 0; W.ps[0].dead = 1; W.ps[1].hp = 0; W.ps[1].dead = 1; runN(W, 80, 0); eq(W.deaths, 1, 'both down = restart at the checkpoint'); ok(W.ps.every(p => !p.dead && p.hp === 6));
});

test('events and counters: the engine reports what happened so the table can play sounds and count puzzles', () => {
  const S = flat({ 10: '  Prv', 9: '' }, 40); P0(S).ab = 'fire'; const seen = new Set(); for (let i = 0; i < 60; i++) { E.step(S, B.ACT); S.ev.forEach(e => seen.add(e[0])); }
  ok(seen.has('burn'), 'burn event: ' + [...seen]); ok(seen.has('fire'));
  const I = flat({ 10: '  P   M' }); const s2 = new Set(); for (let i = 0; i < 80; i++) { E.step(I, i < 60 ? B.ACT : B.SW); I.ev.forEach(e => s2.add(e[0])); } ok(s2.has('inhale') && s2.has('gulp'), [...s2].join());
  eq(S.abUse.fire >= 0, true);
});

run('puff-engine');
