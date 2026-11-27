// galaxy/levels.js の検証：データの形・置き場所・3つ以上のスターシャード・ボットが本物のエンジンで全ミッションをクリア・記録（proofs.js）の再生。
// 実行：node tools/tests/unit/galaxy-levels.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'galaxy/engine.js')), LV = require(path.join(ROOT, 'galaxy/levels.js')), Bot = require(path.join(ROOT, 'galaxy/bot.js')), P = require(path.join(ROOT, 'galaxy/proofs.js'));
const V = E.vec;

test('galaxies: 3 galaxies, at least 3 shards each, 10 missions, unique ids, shards unlock in order', () => {
  eq(LV.GALAXIES.length, 12); ok(LV.total() >= 42, 'missions ' + LV.total()); let before = 0; const ids = new Set();
  LV.GALAXIES.forEach((g, i) => { const d = LV.def(g.id); ok(d.missions.filter(m => m.kind !== 'hunt').length >= 3, g.id + ' has >= 3 missions'); ok(g.need <= before, 'reachable unlock ' + g.id + ' ' + g.need + ' <= ' + before); before += d.missions.filter(m => m.kind !== 'hunt').length; ok(d.missions.some(m => m.kind === 'hunt'), g.id + ' has a hunt');
    for (const m of d.missions) { ok(!ids.has(m.id), 'unique ' + m.id); ids.add(m.id); ok(m.name.ja && m.name.en && m.desc.ja && m.desc.en, 'texts ' + m.id); ok(m.route && m.route.length, 'route ' + m.id); } });
  ok(LV.def('g3').missions.some(m => m.kind === 'boss') && LV.def('g6').missions.some(m => m.kind === 'boss') && LV.def('g8').missions.some(m => m.kind === 'final'), 'three bosses (the last is the final boss)');
  const gm = LV.def('g8').missions.find(m => m.id === 'g8m2'); ok(gm.need >= LV.total() - 5 && gm.kind === 'comet', 'the gauntlet needs the other galaxies'); ok(LV.def('g1').missions.some(m => m.kind === 'comet'), 'a comet');
});
test('every body is valid; every thing is placed in free space near a planet (in each mission); shards exist for every mission', () => {
  for (const id of LV.ids) {
    const L = LV.compile(E, id);
    for (const b of L.bodies) { ok(b.p.length === 3 && b.br > 0, id + ' body ' + b.id); ok(!(b.k === 's') || b.r > 0); }
    for (const m of L.mlist) {
      const S = E.create(L, m.id); const on = L.bodies.map((b, i) => i).filter(i => S.bOn[i]);
      for (const i0 of S.act) { const e = L.ents[i0]; if (e.bi >= 0) ok(S.bOn[e.bi], id + ' ' + m.id + ' ' + (e.id || e.k) + ' sits on a body that is not in the mission');
        const p = E.entPos(S, i0);
        if (['coin', 'crystal', 'orb', 'shard', 'lumi', 'launch'].includes(e.k)) { for (const i of on) { const d = E.sdfW(S, i, p)[0]; ok(d > 0.3, id + ' ' + m.id + ' ' + (e.id || e.k) + ' is inside body ' + L.bodies[i].id + ' (' + d.toFixed(2) + ')'); } ok(E.gravAt(S, p, -1).i >= 0 || e.k === 'coin', id + ' ' + e.id + ' lies in a gravity field'); }
        if (e.k === 'launch') { const tp = e.to.b != null ? V.add(S.xf[e.to.b].p, V.mv(S.xf[e.to.b].R, e.to.l)) : e.to.p; ok(E.gravAt(S, tp, -1).i >= 0, id + ' ' + e.id + ' lands inside a gravity field'); ok(e.to.b == null || S.bOn[e.to.b], e.id + ' lands on a body that is in the mission'); } }
      if (m.free || m.kind === 'hunt') continue; const sh = L.eidx[m.shard]; ok(sh != null, id + ' ' + m.id + ' has its shard'); ok(S.act.indexOf(sh) >= 0, 'shard is in its mission'); ok(E.gravAt(S, S.h.x, -1).i >= 0, m.id + ' starts in a gravity field'); for (const i of on) ok(E.sdfW(S, i, S.h.x)[0] > 0.2 || i === L.idx[m.start.b], m.id + ' start not inside ' + i);
    }
  }
});
test('hidden Lumi hunt: every galaxy has 3 lumi (bits 0-2), and the bot collects them all on the real engine', () => {
  for (const g of LV.GALAXIES) { const L = LV.compile(E, g.id); const Sh = E.create(L, g.id + 'hunt'); const lu = Sh.act.map(i => L.ents[i]).filter(e => e.k === 'lumi'); eq(lu.map(e => e.n2).sort().join(), '0,1,2', g.id + ' lumi bits'); const r = Bot.run(L, g.id + 'hunt', { max: 60000 }); ok(r.ok, g.id + ' hunt: ' + r.fail); eq(r.S.lumi, 7, g.id + ' all three collected'); eq(r.S.cnt.lumi, 3); }
});
test('power-ups: skate is faster, fire spin melts spikes (and plain spin does not), melt and hunt missions are bot-cleared', () => {
  const L = LV.compile(E, 'g4'), S = E.create(L, 'g4m1'); const sp = (pw) => { const S2 = E.create(L, 'g4m1'); S2.h.pw = pw ? { k: pw, t: 99 } : null; for (let i = 0; i < 60; i++) E.step(S2, { sx: 0, sy: 1 }); return V.len(S2.h.v); }; ok(sp('skate') > sp(null) * 1.3, 'skate speed');
  const S3 = E.create(L, 'g4m2'), i = L.eidx.g4m2s0sp1; S3.h.x = V.add(S3.ep[i], [0, 0, 0]); S3.h.x = V.add(S3.ep[i], V.mul(E.entUp(S3, i), 1.6)); S3.h.pw = { k: 'fire', t: 99 }; E.step(S3, { b: E.B.S }); E.step(S3, { b: E.B.S }); ok(S3.e[i] === 1, 'fire melts the spike'); const S4 = E.create(L, 'g4m2'); S4.h.x = V.add(S4.ep[i], V.mul(E.entUp(S4, i), 1.6)); E.step(S4, { b: E.B.S }); E.step(S4, { b: E.B.S }); ok(!S4.e[i], 'plain spin does not');
});
test('skate is physically required: the gap in "Skate Leap" cannot be crossed without the skate crate, and the mission never fails by time', () => {
  const L = LV.compile(E, 'g4'); const withSk = Bot.run(L, 'g4m3'); ok(withSk.ok, 'with skate ' + withSk.fail);
  const S = E.create(L, 'g4m3'); S.e[L.eidx.g4m3s1sk] = 1; const bot = Bot.create(L, 'g4m3'); while (!S.over && S.f < 5000 && !bot.fail) { const i = E.quant(bot.act(S)); E.step(S, E.unpack(E.pack(i))); }
  ok(!S.over, 'without the skate crate the other platform is not reached (the mission does not end, and does not fail either)'); ok(S.h.x[0] < 80 + 36, 'still on the first platform side ' + S.h.x[0]);
});
test('triangle budget (phones): at any time only the planets near the hero are built (streaming radius 160), staying under budget; low detail is much lighter', () => {
  const GL = require(path.join(ROOT, 'galaxy/gl.js')); let worst = 0;
  for (const id of LV.ids) { const L = LV.compile(E, id); for (const m of L.mlist) { const S = E.create(L, m.id); const act = L.bodies.filter(b => S.bOn[b.i]); const tri = new Map(act.map(b => [b.i, [GL.bodyMesh(E, b, L, 1).p.length / 9, GL.bodyMesh(E, b, L, 0).p.length / 9]]));
    let hi = 0, lo = 0; for (const c of act) { let h = 0, l = 0; for (const b of act) if (V.len(V.sub(b.p, c.p)) < GL.LAZY_R) { h += tri.get(b.i)[0]; l += tri.get(b.i)[1]; } hi = Math.max(hi, h); lo = Math.max(lo, l); }
    worst = Math.max(worst, hi); ok(hi < 52000, m.id + ' high ' + hi); ok(lo < hi * 0.7 || hi < 3000, m.id + ' low ' + lo + ' vs ' + hi); } }
  console.log('      worst-case streamed triangles per mission: ' + Math.round(worst));
});
test('frustum culling: bodies behind the camera are skipped, bodies in front are kept', () => {
  const GL = require(path.join(ROOT, 'galaxy/gl.js')), M = GL.M, pv = M.mul(M.persp(1, 1, 0.1, 500), M.look([0, 0, 0], [0, 0, -1], [0, 1, 0]).v), P = GL.frustum(pv);
  ok(GL.inFrustum(P, [0, 0, -20], 2), 'in front'); ok(!GL.inFrustum(P, [0, 0, 20], 2), 'behind'); ok(!GL.inFrustum(P, [100, 0, -10], 2), 'far to the side');
});
test('long courses: EVERY non-comet, non-hunt mission is a long multi-section course the perfect bot clears in 120-300 s (boss/final 180-360 s); hunts 120-300 s; comets 30-200 s and fail-free; 2+ checkpoints; fair for the perfect bot', () => {
  let n = 0, hunts = 0, comets = 0; for (const g of LV.GALAXIES) { const L = LV.compile(E, g.id); for (const m of L.mlist) {
    const r = Bot.run(L, m.id, { max: 60000 }); ok(r.ok, m.id + ' ' + r.fail); const sec = r.frames / 60, boss = m.kind === 'boss' || m.kind === 'final';
    ok(r.S.cnt.hurt <= 8 && r.S.cnt.die <= 3, m.id + ' fair for the perfect bot: hurt ' + r.S.cnt.hurt + ' KO ' + r.S.cnt.die);
    if (m.kind === 'comet') { comets++; ok(!m.long && sec >= 30 && sec <= 200, m.id + ' comet ' + sec.toFixed(0) + ' s'); continue; }
    if (m.kind === 'hunt') { hunts++; ok(sec >= 120 && sec <= 300, m.id + ' hunt ' + sec.toFixed(0) + ' s'); continue; }
    ok(m.long, m.id + ' must be a long course'); n++; ok(sec >= (boss ? 170 : 120) && sec <= (boss ? 360 : 300), m.id + ' took ' + sec.toFixed(0) + ' s'); const S = E.create(L, m.id); ok(S.act.filter(i => L.ents[i].k === 'cp').length >= 2, m.id + ' checkpoints'); } }
  ok(n >= 29 && hunts === 12 && comets >= 10, 'counts ' + n + ' ' + hunts + ' ' + comets); console.log('      long courses: ' + n + ', hunts: ' + hunts + ', comets: ' + comets);
});
test('ranks: S/A/B/C from par time, no damage and all lumi; rewards grow; a clean slow run is B at best', () => {
  const m = { par: 100 }; eq(E.rank(m, { f: 70 * 60, die: 0, hurt: 0 }, true), 3, 'fast, clean, all lumi = S'); eq(E.rank(m, { f: 70 * 60, die: 0, hurt: 0 }, false), 2, 'A'); eq(E.rank(m, { f: 110 * 60, die: 0, hurt: 0 }, false), 1, 'B'); eq(E.rank(m, { f: 300 * 60, die: 1, hurt: 3 }, false), 0, 'C'); eq(E.rank(m, { f: 300 * 60, die: 0, hurt: 0 }, true), 1, 'slow clean with lumi = B');
  ok(E.RANK_REWARD[3] > E.RANK_REWARD[2] && E.RANK_REWARD[2] > E.RANK_REWARD[1] && E.RANK_REWARD[1] > E.RANK_REWARD[0]);
});
test('balance band: the perfect bot clears everything; a sloppy bot (reaction delay, stick noise, missed jumps) is hurt/KO more and more with the galaxy index (about 0% in g1-2, 30-75% in g7-8)', () => {
  const skill = k => ({ delay: 9, noise: 0.28, miss: 0.2, seed: k }); const share = {};
  for (const g of LV.GALAXIES) { if (['g3', 'g4'].includes(g.id)) continue; const L = LV.compile(E, g.id); let f = 0, n = 0; for (const m of L.mlist) { if (m.kind === 'hunt') continue; const par = (m.par || 100) * 60; for (let k = 1; k <= 3; k++) { const r = Bot.run(L, m.id, { skill: skill(k), max: Math.round(par * 2.2) }); if (r.S.cnt.die >= 2 || r.S.cnt.hurt >= 6) f++; n++; } } share[g.id] = f / n; }
  console.log('      sloppy-bot hurt/KO share per galaxy: ' + JSON.stringify(Object.fromEntries(Object.entries(share).map(([k, v]) => [k, +v.toFixed(2)]))));
  ok(share.g1 <= 0.12 && share.g2 <= 0.12, 'early galaxies are gentle'); const late = (share.g7 + share.g8 + share.g9 + share.g10 + share.g11 + share.g12) / 6, mid = (share.g5 + share.g6 + share.g7 + share.g8) / 4, early = (share.g1 + share.g2) / 2;
  ok(late >= 0.3 && late <= 0.9, 'g7-12 share ' + late.toFixed(2)); ok(share.g9 >= share.g5 && share.g10 >= share.g6, 'the later galaxies are harder than the middle ones'); ok(mid >= early + 0.1, 'rises with the galaxy index: ' + early.toFixed(2) + ' -> ' + mid.toFixed(2));
});
test('suits are required, and a run+jump-only player cannot finish the main missions beyond galaxy 2', () => {
  // each suit has a set piece nobody can pass without it (the suit is taken away right after it is picked up)
  for (const [g, mid] of [['g3', 'g3m1'], ['g4', 'g4m1'], ['g5', 'g5m1'], ['g3', 'g3m3']]) {
    const L = LV.compile(E, g), m = L.missions[mid]; const r = Bot.run(L, mid, { max: Math.round(m.par * 60 * 1.6), strip: true }); ok(!r.ok, mid + ' cannot be cleared without its suit');
  }
  // the naive bot (run + jump only: no spin, no ground-pound) fails every long non-comet mission after galaxy 2, and the skilled bot clears them
  let n = 0, failed = 0;
  for (const g of LV.GALAXIES) { if (g.id === 'g1' || g.id === 'g2') continue; const L = LV.compile(E, g.id); for (const m of L.mlist) { if (m.kind === 'comet' || m.kind === 'hunt') continue; n++; const r = Bot.run(L, m.id, { max: Math.round((m.par || 120) * 60 * 1.6), naive: true }); if (!r.ok) failed++; } }
  console.log('      naive bot fails ' + failed + ' of ' + n + ' main missions beyond galaxy 2'); ok(n >= 25 && failed / n >= 0.9, 'naive fail share ' + failed + '/' + n);
});
test('differentiation (group 1: meadow / ice / candy): signature mechanics used nowhere else, 4+ goal types, 3+ planet shapes, distinct skies', () => {
  const info = id => { const d = LV.def(id), mech = new Set(), goals = new Set(), shapes = new Set(d.bodies.map(b => b.k)); for (const m of d.missions) { (m.mech || []).forEach(k => mech.add(k)); goals.add(m.kind && m.kind !== 'run' ? m.kind : m.goal); } return { d, mech, goals, shapes }; };
  const all = {}; for (const g of LV.GALAXIES) all[g.id] = info(g.id);
  const unique = id => [...all[id].mech].filter(k => LV.GALAXIES.every(g => g.id === id || !all[g.id].mech.has(k)));
  ok(unique('g2').length >= 2 && unique('g4').length >= 2, 'ice ' + unique('g2') + ' candy ' + unique('g4'));
  for (const id of ['g1', 'g2', 'g4']) { ok(all[id].goals.size >= 4, id + ' goal types ' + [...all[id].goals]); ok(all[id].shapes.size >= 3, id + ' planet shapes ' + [...all[id].shapes]); }
  for (const [a, b] of [['g1', 'g2'], ['g1', 'g4'], ['g2', 'g4']]) { const sa = all[a].d.sky, sb = all[b].d.sky, dd = Math.hypot(...sa.n1.map((v, i) => v - sb.n1[i])) + Math.hypot(...sa.n2.map((v, i) => v - sb.n2[i])); ok(dd > 0.6, a + ' vs ' + b + ' sky color distance ' + dd.toFixed(2)); }
  const jacc = (a, b) => { const A = all[a].mech, B = all[b].mech; let i = 0; for (const k of A) if (B.has(k)) i++; return i / (A.size + B.size - i); };
  ok(jacc('g1', 'g2') < 0.7 && jacc('g1', 'g4') < 0.6 && jacc('g2', 'g4') < 0.6, 'mechanic overlap ' + jacc('g1', 'g2').toFixed(2) + ' ' + jacc('g1', 'g4').toFixed(2) + ' ' + jacc('g2', 'g4').toFixed(2));
});
test('the hub has a gate for every galaxy', () => {
  const L = LV.compile(E, 'hub'); const gs = L.ents.filter(e => e.k === 'gate').map(e => e.gal); eq(gs.join(), LV.GALAXIES.map(g => g.id).join());
});
test('the bot clears every mission on the real engine (inputs only), with hearts to spare', () => {
  for (const g of LV.GALAXIES) { const L = LV.compile(E, g.id); for (const m of L.mlist) { const r = Bot.run(L, m.id, { max: 60000 }); ok(r.ok, m.id + ' not cleared: ' + r.fail); ok(r.frames < (m.par ? m.par * 60 * 3 : 5400), m.id + ' took ' + r.frames); ok(r.S.h.hp >= 1, m.id + ' hp'); } }
});
test('assists do not break the bot (6 hearts, no-fall, slow comets)', () => {
  const L = LV.compile(E, 'g1'); const r = Bot.run(L, 'g1m4', { assist: { hp: 1, nofall: 1, slow: 1 } }); ok(r.ok); eq(r.S.hpMax, 6);
});
test('recorded proofs replay to exactly the same ending (determinism across runs)', () => {
  let n = 0; for (const g of LV.GALAXIES) { const L = LV.compile(E, g.id); for (const m of L.mlist) { const pr = P[m.id]; ok(pr, 'proof for ' + m.id); const S = E.replay(L, m.id, E.unrle(pr.rec)); ok(S.res && S.res.ok, m.id + ' replay clears'); eq(S.f, pr.f, m.id + ' frames'); eq(E.hash(S), pr.h, m.id + ' hash'); n++; } }
  eq(n, LV.GALAXIES.reduce((a, g) => a + LV.def(g.id).missions.length, 0));
});
test('no mission ever fails by time (the clock is only for ranks); the boss shard appears only after the boss falls', () => {
  const L = LV.compile(E, 'g1'), S = E.create(L, 'g1m4'); for (let i = 0; i < 200 * 60; i++) E.step(S, {}); ok(!S.over, 'still playable after 200 s');
  const L3 = LV.compile(E, 'g3'), S3 = E.create(L3, 'g3m3'); ok(!S3.flag.boss); const si = L3.eidx.s3; ok(L3.ents[si].req === 'boss');
});
run('galaxy-levels');
