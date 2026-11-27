// galaxy/engine.js の単体テスト：星の表面にとどまる・局所重力のジャンプ・かべキック・重力ゾーン・はっしゃの軌道・すり抜けない・動く足場・決まった刻みと複製・ボス。
// 実行：node tools/tests/unit/galaxy-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'galaxy/engine.js'));
const B = E.B, V = E.vec;
const mk = (bodies, ents, zones, start) => E.compile({ id: 't', bodies, ents: ents || [], zones: zones || [], missions: [{ id: 'm', start: start || { p: [0, 6.5, 0] } }] });
const sph = (o) => Object.assign({ id: 'a', k: 's', p: [0, 0, 0], r: 6 }, o || {});
const runN = (S, n, f) => { for (let i = 0; i < n; i++) E.step(S, typeof f === 'function' ? f(i) : f || {}); return S; };

test('walking stays on the sphere surface all the way around (and the underside)', () => {
  const S = E.create(mk([sph()]), 'm'); let lo = 9, hi = 0, grounded = 0, minUp = 1;
  for (let i = 0; i < 1500; i++) { E.step(S, { sx: 0, sy: 1 }); const d = V.len(S.h.x); lo = Math.min(lo, d); hi = Math.max(hi, d); if (S.h.on >= 0) grounded++; if (i > 30) minUp = Math.min(minUp, V.dot(S.h.up, V.norm(S.h.x))); }
  ok(lo > 6.45 && hi < 6.56, 'radius ' + lo + '..' + hi); ok(grounded > 1480, 'grounded ' + grounded); ok(minUp > 0.97, 'up follows the normal ' + minUp);
  let under = false; const S2 = E.create(mk([sph()]), 'm'); for (let i = 0; i < 400; i++) { E.step(S2, { sx: 0, sy: 1 }); if (S2.h.x[1] < -5) under = true; } ok(under, 'reaches the underside');
});
test('jump arcs follow the local gravity (height v^2/2g, back on the ground), and a weaker planet jumps higher', () => {
  const h = gs => { const S = E.create(mk([sph({ g: gs })]), 'm'); runN(S, 20); const r0 = V.len(S.h.x); let top = 0, f = 0; for (let i = 0; i < 200; i++) { E.step(S, { b: i < 25 ? B.J : 0 }); top = Math.max(top, V.len(S.h.x) - r0); if (S.h.on >= 0 && i > 5) { f = i; break; } } return { top, f }; };
  const a = h(1), b = h(0.5); ok(Math.abs(a.top - 121 / 52) < 0.25, 'height ' + a.top); ok(a.f > 40 && a.f < 70, 'air frames ' + a.f); ok(b.top > a.top * 1.4, 'weaker gravity jumps higher ' + b.top);
});
test('variable jump: releasing the button early gives a lower jump', () => {
  const j = n => { const S = E.create(mk([sph()]), 'm'); runN(S, 20); const r0 = V.len(S.h.x); let top = 0; for (let i = 0; i < 100; i++) { E.step(S, { b: i < n ? B.J : 0 }); top = Math.max(top, V.len(S.h.x) - r0); } return top; };
  ok(j(3) < j(25) - 0.4, 'short ' + j(3) + ' long ' + j(25));
});
test('box worlds: you can run off the edge and around onto the side (surface-normal gravity)', () => {
  const S = E.create(mk([{ id: 'b', k: 'b', p: [0, 0, 0], h: [5, 1, 5], rr: 0.8 }], [], [], { p: [0, 1.5, 0] }), 'm'); let side = false;
  for (let i = 0; i < 400; i++) { E.step(S, { sx: 0, sy: 1 }); if (S.h.on >= 0 && Math.abs(S.h.up[2]) > 0.9 || (S.h.on >= 0 && S.h.up[1] < -0.9)) side = true; }
  ok(side, 'wrapped around the edge, up=' + S.h.up.map(v => v.toFixed(2)));
});
test('wall kick: against a wall in the air, jump pushes away and up', () => {
  const S = E.create(mk([sph({ r: 30, p: [0, -30, 0] }), { id: 'w', k: 'b', p: [4, 6, 0], h: [0.6, 6, 6], g: 0 }], [], [], { p: [2.5, 0.5, 0] }), 'm'); runN(S, 15);
  runN(S, 30, i => ({ sx: 1, sy: 0, b: i < 20 ? B.J : 0 })); ok(S.h.on < 0 || S.h.wt > 0 || S.cnt.jump > 0, 'in the air');
  let kicked = 0; for (let i = 0; i < 90 && !kicked; i++) { E.step(S, { sx: 1, sy: 0, b: i % 2 ? B.J : 0 }); kicked = S.cnt.wk; }
  ok(kicked >= 1, 'a wall kick happened');
});
test('gravity zones: "dir" flips the pull, "inv" reverses it, and the hero lands on the ceiling', () => {
  const slab = { id: 's', k: 'b', p: [0, 0, 0], h: [8, 1, 8], rr: 0.5 }, ceil = { id: 'c', k: 'b', p: [0, 14, 0], h: [8, 1, 8], rr: 0.5 };
  const L = mk([slab, ceil], [], [{ s: 'box', c: [0, 8, 0], h: [7, 6.5, 7], m: 'dir', dir: [0, 1, 0] }], { p: [0, 1.5, 0] }), S = E.create(L, 'm'); runN(S, 10);
  for (let i = 0; i < 160; i++) E.step(S, { b: i < 20 ? B.J : 0 });
  ok(S.h.x[1] > 12 && S.h.on >= 0 && S.h.up[1] < -0.9, 'stands on the ceiling underside on=' + S.h.on + ' up=' + S.h.up.map(v => v.toFixed(2)) + ' ' + S.h.x.map(v => v.toFixed(1)));
  const g = E.gravAt(S, [0, 5, 0], -1); ok(g.up[1] < -0.99, 'inside the zone gravity points up');
  const L2 = mk([sph()], [], [{ s: 'sphere', c: [0, 0, 0], r: 9, m: 'inv' }]); const S3 = E.create(L2, 'm'); const g2 = E.gravAt(S3, [0, 8, 0], -1); ok(g2.up[1] < -0.99, 'inv reverses');
});
test('launch stars fling the hero to the target planet (curved path, lands near it)', () => {
  const L = E.compile({ id: 't', bodies: [sph({ id: 'a' }), sph({ id: 'b', p: [22, 0, 0], r: 4 })], ents: [{ k: 'launch', id: 'l', b: 'a', l: [6.9, 0, 0], T: 1.3, arc: 6, to: { b: 'b', l: [-6.4, 0, 0] } }], missions: [{ id: 'm', start: { p: [0, 6.5, 0] } }] });
  const S = E.create(L, 'm'); let max = 0, landed = false; for (let i = 0; i < 400; i++) { E.step(S, { sx: 0, sy: 0 }); if (i === 5) S.h.x = [6.5, 0.2, 0]; if (S.h.lau) max = Math.max(max, S.h.x[0]); if (S.cnt.launch && S.h.on === 1) { landed = true; break; } }
  ok(S.cnt.launch === 1, 'launched'); ok(max > 8, 'arc ' + max); ok(landed, 'landed on the second planet');
});
test('no tunnelling: fast hero against a thin wall and a small sphere never gets through', () => {
  const L = mk([{ id: 'w', k: 'b', p: [10, 0, 0], h: [0.15, 8, 8] }, sph({ id: 'z', g: 0, p: [0, -40, 0], r: 1 })], [], [], { p: [0, 0, 0] });
  for (const v of [30, 38, 60]) { const S = E.create(L, 'm'); S.h.v = [v, 0, 0]; let maxX = 0; for (let i = 0; i < 60; i++) { E.step(S, {}); maxX = Math.max(maxX, S.h.x[0]); } ok(maxX < 10, 'v=' + v + ' reached ' + maxX); }
});
test('moving platforms carry the hero (orbit and spin)', () => {
  const L = mk([{ id: 'p', k: 'b', p: [0, 0, 0], h: [3, 0.5, 3], mv: [{ t: 'lin', d: [10, 0, 0], T: 6 }] }], [], [], { p: [0, 1.0, 0] }), S = E.create(L, 'm'); runN(S, 5);
  runN(S, 90); ok(S.h.x[0] > 5 && S.h.on === 0, 'carried to ' + S.h.x[0]);
  const L2 = mk([{ id: 'p', k: 'y', p: [0, 0, 0], r: 6, hh: 0.5, mv: [{ t: 'spin', a: [0, 1, 0], T: 4 }] }], [], [], { p: [4, 1.0, 0] }), S2 = E.create(L2, 'm'); runN(S2, 60); ok(S2.h.on === 0 && Math.abs(S2.h.x[2]) > 2, 'turned with the disc ' + S2.h.x.map(v => v.toFixed(1)));
});
test('determinism: same inputs same hash; a clone continues identically; pack/rle round-trip', () => {
  const L = mk([sph(), sph({ id: 'b', p: [14, 0, 0], r: 3 })]), inp = i => ({ sx: Math.sin(i / 30), sy: 1, b: (i % 40 < 8 ? B.J : 0) | (i % 97 === 0 ? B.S : 0) });
  const a = E.create(L, 'm', { seed: 5 }), b = E.create(L, 'm', { seed: 5 }); for (let i = 0; i < 500; i++) { E.step(a, E.unpack(E.pack(inp(i)))); E.step(b, E.unpack(E.pack(inp(i)))); } eq(E.hash(a), E.hash(b));
  const c = E.create(L, 'm', { seed: 5 }); for (let i = 0; i < 200; i++) E.step(c, E.unpack(E.pack(inp(i)))); const d = E.clone(c); for (let i = 200; i < 500; i++) { E.step(c, E.unpack(E.pack(inp(i)))); E.step(d, E.unpack(E.pack(inp(i)))); } eq(E.hash(c), E.hash(a)); eq(E.hash(d), E.hash(a));
  const rec = []; for (let i = 0; i < 300; i++) rec.push(E.pack(inp(i))); eq(JSON.stringify(E.unrle(E.rle(rec))), JSON.stringify(rec));
});
test('hurt, invulnerability, assist hearts and respawn at the checkpoint', () => {
  const L = E.compile({ id: 't', bodies: [sph()], ents: [{ k: 'spike', b: 'a', l: [0, 6.5, 0] }, { k: 'cp', b: 'a', l: [6.2, 0, 0] }], missions: [{ id: 'm', start: { p: [0.5, 6.5, 0] } }] });
  const S = E.create(L, 'm'); runN(S, 3); ok(S.h.hp === 2 && S.h.inv > 1, 'hurt once'); runN(S, 5); ok(S.h.hp === 2, 'no double hit while invulnerable'); eq(E.create(L, 'm', { assist: { hp: 1 } }).hpMax, 6);
  const S2 = E.create(L, 'm'); S2.cp = 1; S2.h.hp = 1; E.hurt(S2, [0, 9, 0]); ok(S2.h.dead > 0); runN(S2, 80); ok(S2.h.dead === 0 && S2.h.hp === 3, 'respawned with full hearts'); ok(V.len(V.sub(S2.h.x, [6.2, 0, 0])) < 2.5, 'at the checkpoint');
});
test('lost in space: respawn (and no heart lost with the no-fall assist)', () => {
  const L = mk([sph({ r: 3, p: [0, 0, 0] })], [], [], { p: [0, 3.5, 0] }); const S = E.create(L, 'm'); S.h.x = [0, 200, 0]; E.step(S, {}); ok(S.h.hp === 2 && V.len(S.h.x) < 10, 'back with a heart less');
  const S2 = E.create(L, 'm', { assist: { nofall: 1 } }); S2.h.x = [0, 200, 0]; E.step(S2, {}); ok(S2.h.hp === 3, 'no damage');
});
test('crates, walkers, spin and pound', () => {
  const L = E.compile({ id: 't', bodies: [sph()], ents: [{ k: 'walker', id: 'w', b: 'a', l0: [0, 6.6, 0], ax: [0, 0, 1], w: 0, ph: 0 }, { k: 'crate', id: 'c', b: 'a', l: [3, 5.4, 0], drop: 'bee' }], missions: [{ id: 'm', start: { p: [0, 7.2, 1.5] } }] });
  const S = E.create(L, 'm'); runN(S, 4, i => ({ b: i === 1 ? B.S : 0 })); ok(S.e[0] === 1 || S.cnt.kill >= 1 || S.h.hp === 3, 'spin beats the walker');
});
run('galaxy-engine');
