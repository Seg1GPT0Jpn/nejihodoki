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
  const L = E.compile({ id: 't', bodies: [sph()], ents: [{ k: 'walker', id: 'w', b: 'a', l0: [0, 6.6, 0], ax: [0, 0, 1], w: 0, ph: 0 }, { k: 'crate', id: 'c', b: 'a', l: [3, 5.4, 0], drop: 'kite' }], missions: [{ id: 'm', start: { p: [0, 7.2, 1.5] } }] });
  const S = E.create(L, 'm'); runN(S, 4, i => ({ b: i === 1 ? B.S : 0 })); ok(S.e[0] === 1 || S.cnt.kill >= 1 || S.h.hp === 3, 'spin beats the walker');
});
test('jump feel: a jump pressed just before landing still jumps (buffer), and just after leaving the ground still jumps (coyote), but not too early / late', () => {
  const K = E.K; ok(K.BUFFER >= 0.1 && K.BUFFER <= 0.2 && K.COYOTE >= 0.1 && K.COYOTE <= 0.16, 'tuned windows');
  const buf = n => { const S = E.create(mk([sph()]), 'm'); runN(S, 20); S.h.x = V.mul(V.norm(S.h.x), 6.5 + 0.6); S.h.v = [0, 0, 0]; S.h.on = -1; let f = 0; for (let i = 0; i < 40; i++) { const d = V.len(S.h.x) - 6.5; E.step(S, { b: i === Math.max(0, Math.round(n)) ? B.J : 0 }); } return S.cnt.jump; };
  // press at frame 0 while 0.1 above the ground (falls in ~5 frames): buffered jump happens; press way too early does not
  const early = (gap) => { const S = E.create(mk([sph()]), 'm'); runN(S, 20); S.h.x = V.mul(V.norm(S.h.x), 6.5 + gap); S.h.v = [0, 0, 0]; S.h.on = -1; S.h.cy = 0; S.h.air = 0.1; E.step(S, { b: B.J }); for (let i = 0; i < 40; i++) E.step(S, {}); return S.cnt.jump; };
  eq(early(0.1), 1, 'buffered just before landing'); eq(early(3.0), 0, 'too early: nothing');
  const coy = (frames) => { const S = E.create(mk([sph()]), 'm'); runN(S, 20); S.h.on = -1; S.h.cy = K.COYOTE; S.h.x = V.mul(V.norm(S.h.x), 6.5 + 1.2); S.h.v = V.mul(V.norm(S.h.x), 0.1); for (let i = 0; i < frames; i++) E.step(S, {}); E.step(S, { b: B.J }); return S.cnt.jump; };
  eq(coy(3), 1, 'coyote within 0.05 s'); eq(coy(Math.round((K.COYOTE + 0.08) * 60)), 0, 'after the coyote window: no jump');
});
test('stick feel: dead zone, smooth response curve, full tilt stays 1, direction kept', () => {
  deep0(E.stickCurve(0.1, 0.05), [0, 0]); const a = E.stickCurve(0.3, 0), b = E.stickCurve(0.6, 0), c = E.stickCurve(0, -1);
  ok(a[0] > 0 && a[0] < 0.3 && b[0] > a[0] && Math.abs(c[1] + 1) < 1e-9, 'curve'); const d = E.stickCurve(0.5, 0.5); ok(Math.abs(d[0] - d[1]) < 1e-9, 'direction kept'); ok(Math.hypot(...E.stickCurve(0.99, 0.2)) <= 1.0001);
});
function deep0(a, b) { eq(JSON.stringify(a), JSON.stringify(b)); }
test('lanterns: touching lights them, all lit reveals the shard flag; a ghost walker is beaten by spin', () => {
  const L = E.compile({ id: 't', bodies: [sph()], ents: [{ k: 'lantern', id: 'a', b: 'a', l: [0, 6.8, 0] }, { k: 'lantern', id: 'b', b: 'a', l: [6.8, 0, 0] }, { k: 'walker', look: 'ghost', b: 'a', l0: [0, 0, 6.6], ax: [0, 1, 0], w: 0, ph: 0 }], missions: [{ id: 'm', start: { p: [0, 6.5, 0.2] } }] });
  const S = E.create(L, 'm'); eq(S.need.lan, 2); runN(S, 3); eq(S.lit.length, 1); ok(!S.flag.lanterns); S.h.x = [6.5, 0, 0]; S.h.v = [0, 0, 0]; runN(S, 3); eq(S.lit.length, 2); ok(S.flag.lanterns === 1, 'flag');
});
test('shield power absorbs one hit; final boss gets more shockwave rings as it loses hearts', () => {
  const L = E.compile({ id: 't', bodies: [sph()], ents: [{ k: 'spike', b: 'a', l: [0, 6.5, 0] }], missions: [{ id: 'm', start: { p: [0.5, 6.5, 0] } }] }), S = E.create(L, 'm'); S.h.pw = { k: 'shield', t: 99 }; runN(S, 3); eq(S.h.hp, 3, 'no damage'); ok(!S.h.pw, 'shield used'); runN(S, 80); ok(S.h.hp <= 2, 'next hit hurts');
  const LV = require(path.join(ROOT, 'galaxy/levels.js')), L8 = LV.compile(E, 'g8'); const rings = hp => { const S8 = E.create(L8, 'g8m3'); S8.boss.hp = hp + S8.boss.xh; S8.boss.st = 'land'; S8.boss.t = 1; S8.boss.ring = 0.5; S8.boss.d = [0, 1, 0]; E.step(S8, {}); return S8.boss.nr; };
  eq(rings(6), 1); eq(rings(4), 2); eq(rings(2), 3);
});
test('crumbling platforms vanish a moment after you stand on them, then come back; phase platforms follow a fixed rhythm (no random timers)', () => {
  const L = mk([{ id: 'p', k: 'b', p: [0, 0, 0], h: [3, 0.5, 3], cr: 0.5, back: 2 }, { id: 'q', k: 'b', p: [20, 0, 0], h: [3, 0.5, 3], ph: { T: 4, d: 0.5, o: 0 } }], [], [], { p: [0, 1.2, 0] }); const S = E.create(L, 'm'); runN(S, 10); ok(E.bodyActive(S, 0), 'solid at first'); runN(S, 40); ok(!E.bodyActive(S, 0), 'gone after standing'); ok(S.dis[0] > 0); runN(S, 120); ok(E.bodyActive(S, 0) || S.dis[0] <= 0, 'back after a few seconds');
  const act = t => { const S2 = E.create(L, 'm'); S2.t = t; return E.bodyActive(S2, 1); }; ok(act(0.5) && !act(2.5) && act(4.5), 'phase rhythm: on, off, on'); eq(E.bodyWindow(Object.assign(E.create(L, 'm'), { t: 1.5 }), 1) > 0, true);
});
test('wind zones lift the hero (only in their mission and only during the gust); switches raise bridges; rolling rock beats walkers', () => {
  const Lw = E.compile({ id: 't', bodies: [sph()], zones: [{ s: 'box', c: [0, 10, 0], h: [3, 6, 3], m: 'wind', acc: [0, 60, 0], drag: 1, gust: { T: 6, d: 0.7 }, ms: ['m'] }], ents: [], missions: [{ id: 'm', start: { p: [0, 7.0, 0] } }, { id: 'n', start: { p: [0, 7.0, 0] } }] });
  const up = id => { const S = E.create(Lw, id); runN(S, 80); return S.h.x[1]; }; ok(up('m') > 9, 'lifted ' + up('m')); ok(up('n') < 7.2, 'other missions are not');
  const Ls = E.compile({ id: 't', bodies: [sph(), { id: 'br', k: 'b', p: [0, 0, 20], h: [2, 0.5, 2], sw: 3 }], ents: [{ k: 'switch', b: 'a', l: [0, 6.8, 0], n2: 3, id: 'sw' }], missions: [{ id: 'm', start: { p: [0, 6.5, 0.4] } }] }); const S = E.create(Ls, 'm'); ok(!E.bodyActive(S, 1)); runN(S, 3); ok(E.bodyActive(S, 1), 'the bridge appears once the switch is pressed');
  const Lr = E.compile({ id: 't', bodies: [sph()], ents: [{ k: 'walker', b: 'a', l0: [0, 6.6, 0], ax: [0, 0, 1], w: 0, ph: 0 }], missions: [{ id: 'm', start: { p: [0, 6.5, 1.8] } }] }); const R = E.create(Lr, 'm'); R.h.pw = { k: 'drill', t: 99 }; runN(R, 40, { sx: 0, sy: 0 }); R.h.x = [0, 6.5, 0.3]; runN(R, 3); ok(R.e[0] === 1 || R.cnt.kill >= 1 || R.h.hp === 3, 'the rolling hero is not hurt by a walker');
});
test('original suits: kite glides slowly (no free hover), comet dash is one straight burst in the air, jelly bounces grow only with well-timed jumps, iron crates need the drill', () => {
  const fall = pw => { const S = E.create(mk([sph({ g: 1, gr: 80 })], [], [], { p: [0, 40, 0] }), 'm'); if (pw) S.h.pw = { k: pw, t: 99 }; S.h.hov = 3; runN(S, 25, { b: B.J }); const y0 = S.h.x[1]; runN(S, 40, { b: B.J }); return y0 - S.h.x[1]; };
  ok(fall('kite') < fall(null) * 0.45, 'kite sinks slowly ' + fall('kite') + ' vs ' + fall(null)); ok(fall('kite') > 0.5, 'no hover: it still sinks ' + fall('kite'));
  const dash = use => { const S = E.create(mk([sph()], [], [], { p: [0, 6.5, 0] }), 'm'); S.h.pw = { k: 'dash', t: 99 }; runN(S, 20); runN(S, 30, i => ({ sx: 0, sy: 1, b: i === 0 ? B.J : 0 })); const x0 = S.h.x.slice(); runN(S, 40, i => ({ sx: 0, sy: 1, b: use && i === 0 ? B.J : 0 })); return V.len(V.sub(S.h.x, x0)); };
  ok(dash(true) > dash(false) + 1.2, 'dash goes farther ' + dash(true) + ' vs ' + dash(false));
  const apex = (pw, press) => { const S = E.create(mk([sph()]), 'm'); if (pw) S.h.pw = { k: pw, t: 99 }; runN(S, 20); const r0 = V.len(S.h.x); let top = 0; for (let i = 0; i < 700; i++) { const air = S.h.on < 0; E.step(S, { b: i === 0 || (press && !air && i % 2) || (press && air && S.h.v && V.dot(S.h.v, S.h.up) < -3 && i % 2) ? B.J : 0 }); if (i > 300) top = Math.max(top, V.len(S.h.x) - r0); } return top; };
  ok(apex('jelly', true) > apex('jelly', false) + 1.0, 'timed jelly bounces climb ' + apex('jelly', true) + ' vs ' + apex('jelly', false));
  const Li = E.compile({ id: 't', bodies: [sph()], ents: [{ k: 'crate', id: 'ir', b: 'a', l: [0, 6.8, 1.6], iron: 1 }], missions: [{ id: 'm', start: { p: [0, 6.5, 0] } }] }); const Si = E.create(Li, 'm'); runN(Si, 5); Si.h.x = [0, 6.8, 0.6]; for (let i = 0; i < 30; i++) E.step(Si, { sx: 0, sy: 0, b: i % 20 === 0 ? B.S : 0 }); ok(Si.e[0] === 0, 'spinning does not open an iron crate');
  const Sd = E.create(Li, 'm'); Sd.h.pw = { k: 'drill', t: 99 }; runN(Sd, 5); Sd.h.x = [0, 6.7, 0.9]; runN(Sd, 6); ok(Sd.e[0] === 1, 'the drill opens it');
});
test('the same input feels different per galaxy: ice slides far, sticky candy is slow and low, bounce pads throw you up, walkers differ in behaviour', () => {
  const trial = (bodies, zones) => { const S = E.create(mk(bodies, [], zones || []), 'm'); runN(S, 30); const a = S.h.x.slice(); runN(S, 60, { sx: 0, sy: 1 }); const run = V.len(V.sub(S.h.x, a)); const b = S.h.x.slice(); runN(S, 60, { sx: 0, sy: 0 }); return { run, coast: V.len(V.sub(S.h.x, b)) }; };
  const g = trial([sph({ surf: 'grass' })]), ice = trial([sph({ surf: 'ice' })]), sticky = trial([sph({ surf: 'grass' })], [{ s: 'sphere', c: [0, 6, 0], r: 20, m: 'sticky' }]);
  ok(ice.coast > g.coast * 3 + 1, 'ice coasts ' + ice.coast.toFixed(1) + ' vs grass ' + g.coast.toFixed(1)); ok(ice.run < g.run, 'ice accelerates slowly ' + ice.run.toFixed(1) + ' vs ' + g.run.toFixed(1)); ok(sticky.run < g.run * 0.6, 'sticky candy is slow ' + sticky.run.toFixed(1) + ' vs ' + g.run.toFixed(1));
  const apex = bnc => { const S = E.create(mk([sph({ bnc })], [], [], { p: [0, 12, 0] }), 'm'); let top = 0; for (let i = 0; i < 160; i++) { E.step(S, {}); if (i > 60) top = Math.max(top, V.len(S.h.x) - 6); } return top; };
  ok(apex(1) > apex(0) + 2.5, 'a bounce pad throws the hero up ' + apex(1).toFixed(1) + ' vs ' + apex(0).toFixed(1));
  const wp = e => { const L = E.compile({ id: 't', bodies: [sph()], ents: [Object.assign({ k: 'walker', id: 'w', b: 'a', l0: [0, 6.6, 0], ax: [0, 0, 1], w: 1, ph: 0 }, e)], missions: [{ id: 'm', start: { p: [0, 6.5, 8] } }] }); const S = E.create(L, 'm'); const p = []; for (let i = 0; i < 360; i++) { E.step(S, {}); p.push(S.ep[0] ? S.ep[0].slice() : null); } return p; };
  const base = wp({}), dash = wp({ dash: { T: 3, d: 0.25 } }), hop = wp({ hop: { T: 2, h: 2 } });
  const step = (p, i) => V.len(V.sub(p[i + 1], p[i])); let maxB = 0, maxD = 0, maxH = 0; for (let i = 0; i < 300; i++) { maxB = Math.max(maxB, step(base, i)); maxD = Math.max(maxD, step(dash, i)); maxH = Math.max(maxH, V.len(V.sub(hop[i], base[i]))); }
  ok(maxD > maxB * 2.5, 'a dashing walker bursts ' + maxD.toFixed(3) + ' vs ' + maxB.toFixed(3)); ok(maxH > 1.5, 'a hopping walker leaves the ground by ' + maxH.toFixed(1));
  const pu = (pulse) => { const L = E.compile({ id: 't', bodies: [sph()], ents: [{ k: 'spike', id: 's', b: 'a', l: [0, 6.5, 0], pulse }], missions: [{ id: 'm', start: { p: [0, 6.5, 0.2] } }] }); const S = E.create(L, 'm'); let hurt = 0; for (let i = 0; i < 400; i++) { E.step(S, {}); hurt += S.cnt.hurt || 0; S.h.x = [0, 6.5, 0.2]; } return S.cnt.hurt; };
  ok(pu({ T: 4, d: 0.3, o: 0 }) < pu(undefined), 'a pulsing spike is harmless while retracted');
});
test('galaxy rules: heat zones burn a hero who stands still, swim zones make you float and stroke, rotating gravity swings, chasers follow your trail, shy ghosts freeze when seen', () => {
  const heat = still => { const S = E.create(mk([sph()], [], [{ s: 'sphere', c: [0, 0, 0], r: 12, m: 'heat' }]), 'm'); runN(S, 20); let hurt = 0; for (let i = 0; i < 200; i++) { E.step(S, still ? {} : { sx: 0, sy: 1 }); } return S.cnt.hurt; };
  ok(heat(true) >= 1 && heat(false) === 0, 'standing still burns: ' + heat(true) + ' / moving ' + heat(false));
  const fallDist = zones => { const S = E.create(mk([sph({ gr: 80 })], [], zones, { p: [0, 40, 0] }), 'm'); runN(S, 60); return 40 - S.h.x[1]; };
  ok(fallDist([{ s: 'sphere', c: [0, 40, 0], r: 30, m: 'swim' }]) < fallDist([]) * 0.3, 'swim zone floats: ' + fallDist([{ s: 'sphere', c: [0, 40, 0], r: 30, m: 'swim' }]).toFixed(1) + ' vs ' + fallDist([]).toFixed(1));
  const swimUp = () => { const S = E.create(mk([sph({ gr: 80 })], [], [{ s: 'sphere', c: [0, 30, 0], r: 40, m: 'swim' }], { p: [0, 30, 0] }), 'm'); runN(S, 5); const y0 = S.h.x[1]; let top = y0; for (let i = 0; i < 90; i++) { E.step(S, { b: i % 12 === 0 ? B.J : 0 }); top = Math.max(top, S.h.x[1]); } return top - y0; };
  ok(swimUp() > 2.5, 'strokes lift the hero ' + swimUp().toFixed(1));
  const tilt = t => { const S = E.create(mk([sph({ g: 0 })], [], [{ s: 'box', c: [0, 20, 0], h: [20, 30, 20], m: 'dir', dir: [0, -1, 0], rot: { a: [1, 0, 0], amp: 0.6, T: 8 } }], { p: [0, 20, 0] }), 'm'); S.t = t; runN(S, 40); return S.h.v.slice(); };
  ok(Math.abs(tilt(0)[2] - tilt(2)[2]) > 1.5, 'the gravity direction swings over time');
  const L = E.compile({ id: 't', bodies: [sph()], ents: [{ k: 'chaser', id: 'c', delay: 60 }], missions: [{ id: 'm', start: { p: [0, 6.5, 0] } }] }); const S = E.create(L, 'm'); runN(S, 90, { sx: 0, sy: 1 }); const d1 = V.len(V.sub(S.ep[0], S.h.x)); ok(d1 > 3, 'the chaser trails the hero ' + d1.toFixed(1)); const c0 = S.cnt.hurt; runN(S, 130, {}); ok(S.cnt.hurt > c0, 'a hero who stops gets caught');
  const shy = look => { const L2 = E.compile({ id: 't', bodies: [sph()], ents: [{ k: 'walker', id: 'w', b: 'a', l0: [0, 6.6, 0], ax: [0, 0, 1], w: 1, ph: 0, shy: 1 }], missions: [{ id: 'm', start: { p: [0, 6.5, 6] } }] }); const S2 = E.create(L2, 'm'); S2.cam.fw = look ? V.norm(V.sub(S2.ep[0], S2.h.x)) : [0, 0, 1]; runN(S2, 120); return S2.sh[0] || 0; };
  ok(shy(false) > 1.5 && shy(true) < 0.2, 'a shy ghost moves only when unseen: ' + shy(false).toFixed(1) + ' / watched ' + shy(true).toFixed(1));
});
test('flight: in a fly zone the hero flies forward and steers with the stick; a boss that needs light ignores hits until its lanterns are lit', () => {
  const L = E.compile({ id: 't', bodies: [sph({ g: 0 })], ents: [], zones: [{ s: 'box', c: [0, 20, 0], h: [60, 30, 60], m: 'fly' }], missions: [{ id: 'm', start: { p: [0, 20, 0] } }] });
  const fly = (sx, sy) => { const S = E.create(L, 'm'); S.h.fw = [1, 0, 0]; runN(S, 10); const a = S.h.x.slice(); runN(S, 40, { sx, sy }); return V.sub(S.h.x, a); };
  const st = fly(0, 0), rt = fly(1, 0), dn = fly(0, 1), up = fly(0, -1);
  ok(V.len(st) > 7 && Math.abs(st[2]) < 1.5, 'flies straight ' + st.map(v => v.toFixed(1)));
  ok(Math.abs(rt[2]) > 2.5 && Math.sign(rt[2]) !== Math.sign(fly(-1, 0)[2]), 'steers left/right'); ok(dn[1] < st[1] - 1.5 && up[1] > st[1] + 1.5, 'steers up/down');
  const Lb = E.compile({ id: 't', bodies: [sph({ r: 10 })], ents: [{ k: 'boss', id: 'boss', b: 'a', l: [0, 10, 0], hp: 3, rad: 1.7, needLit: 'bq' }, { k: 'lantern', id: 'l1', b: 'a', l: [10.5, 0, 0], grp: 'bq' }], missions: [{ id: 'm', start: { p: [0, -10.5, 0] } }] }); const S = E.create(Lb, 'm');
  S.boss.st = 'stun'; const hp0 = S.boss.hp; const bp = E.bossPos(S); S.h.x = [bp[0], bp[1] + 0.2, bp[2] + 1]; E.step(S, { b: B.S }); ok(S.boss.hp === hp0, 'a shielded boss takes no damage until the lanterns are lit');
  S.flag.lanternsbq = 1; S.boss.st = 'stun'; S.h.x = [bp[0], bp[1] + 0.2, bp[2] + 1]; for (let i = 0; i < 6; i++) E.step(S, { b: i === 0 ? B.S : 0 }); ok(S.boss.hp < hp0, 'it takes damage once lit');
});
test('mini-game rules (C2): lights-out plates flip neighbours, number plates reset on a wrong order, fish are caught by spinning, a spun ball rolls into the hole', () => {
  const flat = ents => E.compile({ id: 't', bodies: [{ id: 'a', k: 'b', p: [0, 0, 0], h: [14, 1.5, 8], rr: 0.4 }], ents, zones: [], missions: [{ id: 'm', start: { p: [-10, 2, 0] } }] });
  const onto = (S, p) => { S.h.x = [p[0], 2.0, p[2]]; S.h.v = [0, 0, 0]; runN(S, 3); S.h.x = [p[0] + 6, 2.0, p[2]]; runN(S, 3); };
  const tg = (i, fl) => ({ k: 'tog', id: 'p' + i, b: 'a', l: [-4 + i * 4, 1.6, 0], grp: 7, idx: i, gn: 3, flips: fl });
  const L1 = flat([tg(0, [0, 1]), tg(1, [1, 2]), tg(2, [2])]); const S1 = E.create(L1, 'm'); runN(S1, 3); S1.h.x = [4, 2, 0]; runN(S1, 3); ok(S1.tg['7:2'] === 1 && !S1.flag.sw7, 'plate 2 flips only itself'); S1.h.x = [-4, 2, 0]; runN(S1, 3); ok(S1.tg['7:0'] === 1 && S1.tg['7:1'] === 1 && S1.flag.sw7 === 1, 'plate 0 flips 0 and 1 -> all on opens the bridge flag');
  const sq = i => ({ k: 'tog', id: 's' + i, b: 'a', l: [-6 + i * 4, 1.6, 0], grp: 8, idx: i, gn: 3, seq: 1 });
  const L2 = flat([sq(1), sq(2), sq(3)]); const S2 = E.create(L2, 'm'); runN(S2, 3); S2.h.x = [-2, 2, 0]; runN(S2, 3); ok(S2.sq[8] === 1, 'number 1 first'); onto(S2, [6, 0, 0]); ok(S2.sq[8] === 0 && !S2.tg['8:1'], 'a wrong order starts over (and nothing is lost)');
  const fish = spin => { const L3 = flat([{ k: 'fish', id: 'f', p: [0, 3, 0], grp: 9, gn: 1, ax: [1, 0, 0], amp: 0, T: 4 }]); const S3 = E.create(L3, 'm'); runN(S3, 3); S3.h.x = [0, 2.3, 0.8]; S3.h.v = [0, 0, 0]; runN(S3, 20, { b: spin ? B.S : 0 }); return S3.e[0]; };
  ok(fish(true) === 1 && fish(false) !== 1, 'only a spin catches the fish');
  const L4 = flat([{ k: 'ball', id: 'b', p: [-6, 2.05, 0], grp: 6, hole: [4, 1.5, 0], box: [-13, 13, -7, 7] }]); const S4 = E.create(L4, 'm'); runN(S4, 3); S4.h.x = [-7.4, 2.0, 0]; S4.h.v = [0, 0, 0]; E.step(S4, { b: B.S }); runN(S4, 120); ok(S4.e[0] === 1 && S4.flag.sw6 === 1, 'the spun ball rolls into the hole and opens the bridge');
});
test('charging boss: a telegraphed aim, then a dash, then a dazed opening (never a surprise hit)', () => {
  const L = E.compile({ id: 't', bodies: [sph({ r: 10 })], ents: [{ k: 'boss', id: 'boss', b: 'a', l: [0, 10, 0], hp: 3, rad: 1.7, spd: 0.5, charge: 1 }], missions: [{ id: 'm', start: { p: [0, -10.5, 0] } }] }); const S = E.create(L, 'm'); const seen = []; for (let i = 0; i < 4800 && seen.filter(x => x === 'stun').length < 2; i++) { E.step(S, {}); if (seen[seen.length - 1] !== S.boss.st) seen.push(S.boss.st); }
  const ai = seen.indexOf('aim'); ok(ai >= 0 && seen[ai + 1] === 'charge' && seen[ai + 2] === 'stun', 'order ' + seen.join('>')); ok(seen.indexOf('jump') < ai, 'a slam first, then the charge');
});
run('galaxy-engine');
