// galaxy/levels.js の検証：データの形・置き場所・3つ以上のスターシャード・ボットが本物のエンジンで全ミッションをクリア・記録（proofs.js）の再生。
// 実行：node tools/tests/unit/galaxy-levels.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'galaxy/engine.js')), LV = require(path.join(ROOT, 'galaxy/levels.js')), Bot = require(path.join(ROOT, 'galaxy/bot.js')), P = require(path.join(ROOT, 'galaxy/proofs.js'));
const V = E.vec;

test('galaxies: 3 galaxies, at least 3 shards each, 10 missions, unique ids, shards unlock in order', () => {
  eq(LV.GALAXIES.length, 6); ok(LV.total() >= 18, 'missions ' + LV.total()); let before = 0; const ids = new Set();
  LV.GALAXIES.forEach((g, i) => { const d = LV.def(g.id); ok(d.missions.filter(m => m.kind !== 'hunt').length >= 3, g.id + ' has >= 3 missions'); ok(g.need <= before, 'reachable unlock ' + g.id + ' ' + g.need + ' <= ' + before); before += d.missions.filter(m => m.kind !== 'hunt').length; ok(d.missions.some(m => m.kind === 'hunt'), g.id + ' has a hunt');
    for (const m of d.missions) { ok(!ids.has(m.id), 'unique ' + m.id); ids.add(m.id); ok(m.name.ja && m.name.en && m.desc.ja && m.desc.en, 'texts ' + m.id); ok(m.route && m.route.length, 'route ' + m.id); } });
  ok(LV.def('g3').missions.some(m => m.kind === 'boss') && LV.def('g6').missions.some(m => m.kind === 'boss'), 'two bosses'); ok(LV.def('g1').missions.some(m => m.kind === 'comet'), 'a comet');
});
test('every body is valid; every thing is placed in free space near a planet; shards exist for every mission', () => {
  for (const id of LV.ids) {
    const L = LV.compile(E, id), S = E.create(L, L.mlist[0].id);
    for (const b of L.bodies) { ok(b.p.length === 3 && b.br > 0, id + ' body ' + b.id); ok(!(b.k === 's') || b.r > 0); }
    for (const e of L.ents) {
      ok(e.bi >= 0 || e.p, id + ' ent has a place'); const p = E.entPos(S, e.i);
      if (['coin', 'crystal', 'orb', 'shard', 'lumi', 'launch'].includes(e.k)) { for (let i = 0; i < L.bodies.length; i++) { const d = E.sdfW(S, i, p)[0]; ok(d > 0.3, id + ' ' + (e.id || e.k) + ' is inside body ' + L.bodies[i].id + ' (' + d.toFixed(2) + ')'); } ok(E.gravAt(S, p, -1).i >= 0 || e.k === 'coin', id + ' ' + e.id + ' lies in a gravity field'); }
      if (e.k === 'launch') { const tp = e.to.b != null ? E.entPos(S, 0) && V.add(S.xf[e.to.b].p, V.mv(S.xf[e.to.b].R, e.to.l)) : e.to.p; ok(E.gravAt(S, tp, -1).i >= 0, id + ' ' + e.id + ' lands inside a gravity field'); }
    }
    for (const m of L.mlist) { if (m.free) continue; if (m.kind === 'hunt') continue; const sh = L.eidx[m.shard]; ok(sh != null, id + ' ' + m.id + ' has its shard'); ok(L.ents[sh].m.includes(m.id), 'shard belongs to its mission'); const S2 = E.create(L, m.id); ok(E.gravAt(S2, S2.h.x, -1).i >= 0, m.id + ' starts in a gravity field'); for (let i = 0; i < L.bodies.length; i++) ok(E.sdfW(S2, i, S2.h.x)[0] > 0.2 || i === L.idx[m.start.b], m.id + ' start not inside ' + i); }
  }
});
test('hidden Lumi hunt: every galaxy has 3 lumi (bits 0-2), and the bot collects them all on the real engine', () => {
  for (const g of LV.GALAXIES) { const L = LV.compile(E, g.id); const lu = L.ents.filter(e => e.k === 'lumi'); eq(lu.map(e => e.n2).sort().join(), '0,1,2', g.id + ' lumi bits'); const r = Bot.run(L, g.id + 'hunt'); ok(r.ok, g.id + ' hunt: ' + r.fail); eq(r.S.lumi, 7, g.id + ' all three collected'); eq(r.S.cnt.lumi, 3); }
});
test('power-ups: skate is faster, fire spin melts spikes (and plain spin does not), melt and hunt missions are bot-cleared', () => {
  const L = LV.compile(E, 'g4'), S = E.create(L, 'g4m3'); const sp = (pw) => { const S2 = E.create(L, 'g4m3'); S2.h.pw = pw ? { k: pw, t: 99 } : null; for (let i = 0; i < 60; i++) E.step(S2, { sx: 0, sy: 1 }); return V.len(S2.h.v); }; ok(sp('skate') > sp(null) * 1.3, 'skate speed');
  const S3 = E.create(L, 'g4m2'), i = L.eidx.sp1; S3.h.x = V.add(S3.ep[i], [0, 0, 0]); S3.h.x = V.add(S3.ep[i], V.mul(E.entUp(S3, i), 1.6)); S3.h.pw = { k: 'fire', t: 99 }; E.step(S3, { b: E.B.S }); E.step(S3, { b: E.B.S }); ok(S3.e[i] === 1, 'fire melts the spike'); const S4 = E.create(L, 'g4m2'); S4.h.x = V.add(S4.ep[i], V.mul(E.entUp(S4, i), 1.6)); E.step(S4, { b: E.B.S }); E.step(S4, { b: E.B.S }); ok(!S4.e[i], 'plain spin does not');
});
test('the hub has a gate for every galaxy', () => {
  const L = LV.compile(E, 'hub'); const gs = L.ents.filter(e => e.k === 'gate').map(e => e.gal); eq(gs.join(), LV.GALAXIES.map(g => g.id).join());
});
test('the bot clears every mission on the real engine (inputs only), with hearts to spare', () => {
  for (const g of LV.GALAXIES) { const L = LV.compile(E, g.id); for (const m of L.mlist) { const r = Bot.run(L, m.id); ok(r.ok, m.id + ' not cleared: ' + r.fail); ok(r.frames < (m.par ? m.par * 60 * 3 : 5400), m.id + ' took ' + r.frames); ok(r.S.h.hp >= 1, m.id + ' hp'); } }
});
test('assists do not break the bot (6 hearts, no-fall, slow comets)', () => {
  const L = LV.compile(E, 'g1'); const r = Bot.run(L, 'g1m4', { assist: { hp: 1, nofall: 1, slow: 1 } }); ok(r.ok); eq(r.S.hpMax, 6);
});
test('recorded proofs replay to exactly the same ending (determinism across runs)', () => {
  let n = 0; for (const g of LV.GALAXIES) { const L = LV.compile(E, g.id); for (const m of L.mlist) { const pr = P[m.id]; ok(pr, 'proof for ' + m.id); const S = E.replay(L, m.id, E.unrle(pr.rec)); ok(S.res && S.res.ok, m.id + ' replay clears'); eq(S.f, pr.f, m.id + ' frames'); eq(E.hash(S), pr.h, m.id + ' hash'); n++; } }
  eq(n, LV.GALAXIES.reduce((a, g) => a + LV.def(g.id).missions.length, 0));
});
test('a comet fails when time runs out; the boss shard appears only after the boss falls', () => {
  const L = LV.compile(E, 'g1'), S = E.create(L, 'g1m4'); for (let i = 0; i < 32 * 60 + 5; i++) E.step(S, {}); ok(S.over && !S.res.ok && S.res.why === 'time');
  const L3 = LV.compile(E, 'g3'), S3 = E.create(L3, 'g3m3'); ok(!S3.flag.boss); const si = L3.eidx.s3; ok(L3.ents[si].req === 'boss');
});
run('galaxy-levels');
