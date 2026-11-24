// planet/sim.js（わくせいシミュレーターの星のモデル）の単体テスト。node だけ。
// 実行：node tools/tests/unit/planet-sim.test.js   （8つのシナリオを2回ずつ最後まで流すので 1 分ほど）
// - どのシナリオも、何もしないと負け、sim.js の plan（ふつうの遊び方）で勝てる（＝クリアできることの証明）
// - 同じ手なら同じ結果（決まった結果：serialize が1文字まで同じ）
// - 彫刻（ops の列 → 地形。共有コードで同じ地形）・見つけるもの（marks・生き物・ヒント）・時代・街と「ひらめき」・ふしぎな星
// - 古い保存（2026-11 の作り直しの前・彫刻の前）の読み込み
'use strict';
const path = require('path');
const crypto = require('crypto');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const S = require(path.join(ROOT, 'planet/sim.js'));
const hash = st => crypto.createHash('sha256').update(JSON.stringify(S.serialize(st))).digest('hex');

test('8 scenarios, the ids the saves use', () => {
  eq(S.SC_IDS.join(), 'cradle,snow,green,gate,goe,sun,warm,dawn');
  for (const d of S.SCEN) ok(typeof d.plan === 'function' && typeof d.check === 'function' && d.limit > 0, d.id);
});

test('every scenario: doing nothing fails, the plan wins (score 600–1000, within the budget)', () => {
  S.SCEN.forEach((d, i) => {
    const a = S.scPlay(i, false);
    ok(a.ended && !a.win && a.score === 0, d.id + ' nothing: ' + a.why);
    const b = S.scPlay(i, true);
    ok(b.ended && b.win, d.id + ' plan wins (' + b.why + ')');
    ok(b.score >= 600 && b.score <= 1000 && b.stars >= 1, d.id + ' score ' + b.score);
    if (d.budget != null) ok(b.actions <= d.budget, d.id + ' budget ' + b.actions + '/' + d.budget);
  });
});

test('the snowball needs a chain now: scattered volcanoes or comets alone stay frozen', () => {
  const i = S.SC_IDS.indexOf('snow');
  const tryIt = f => { const sc = S.scStart(i), A = S.scApi(sc); f(A); S.scRun(sc, sc.def.limit); return sc.win; };
  ok(!tryIt(A => { for (let k = 0; k < 6; k++) A.tool('volcano', 0, k * 60); }), 'six scattered volcanoes are not enough');
  ok(!tryIt(A => { for (let k = 0; k < 6; k++) A.tool('asteroid', 0, k * 60); }), 'six comets are not enough');
  ok(!tryIt(A => { for (let k = 0; k < 3; k++) A.tool('volcano', 0, k * 3); }), 'a great eruption alone is not enough');
  ok(tryIt(A => { for (let k = 0; k < 3; k++) A.tool('volcano', 0, k * 3); A.tool('asteroid', 30, 90); }), 'a great eruption and a comet on the ice');
});

test('deterministic: the same plan gives exactly the same planet', () => {
  for (const id of ['cradle', 'green', 'warm']) {
    const i = S.SC_IDS.indexOf(id), a = S.scPlay(i, true), b = S.scPlay(i, true);
    eq(hash(a.st), hash(b.st), id); eq(a.score, b.score, id + ' score');
  }
  const f = () => { const w = S.create({ t: 0, p: { seed: 4242 } }); w.surp = true; w.noCiv = true; S.advance(w, 1.5e8, { coarse: 5e4 }); for (let k = 0; k < 6; k++) S.tools.raise(w, 10, k * 3, { cont: k > 0 }); S.tools.seed(w, 0, 0); S.advance(w, 1.2e9, { coarse: 5e4 }); return w; };
  eq(hash(f()), hash(f()), 'free planet with sculpting and surprises');
});

test('the budget counts strokes: a brush stroke goes on for free, tools stop when used up, locked tools never work', () => {
  const sc = S.scStart(S.SC_IDS.indexOf('gate'));
  eq(S.scTool(sc, 'sink', 48, 0), 'ok');
  for (let k = 0; k < 14; k++) eq(S.scTool(sc, 'sink', 48, k, { cont: true }), 'ok');
  eq(S.scTool(sc, 'sink', 48, 20, { cont: true }), 'no', 'a stroke has at most 14 more dabs'); eq(sc.actions, 1);
  for (let k = 1; k < sc.def.budget; k++) eq(S.scTool(sc, 'raise', 0, k * 30), 'ok');
  eq(S.scTool(sc, 'raise', 0, 0), 'empty'); eq(S.scLeft(sc), 0);
  eq(S.scTool(sc, 'volcano', 0, 0, { cont: true }), 'no', 'only brushes continue');
  eq(S.scTool(S.scStart(S.SC_IDS.indexOf('snow')), 'sink', 0, 0), 'locked');
});

test('sculpting: raising and digging change the land and the sea; the op list rebuilds the same terrain', () => {
  const w = S.create({ t: 2e8, p: { seed: 5 } }); w.noCiv = true; S.advance(w, 1e4);
  const k = 64 * S.HX + 128, e0 = w.elev[k];
  const [lat, lon] = S.latLonOf(S.PX[k], S.PY[k], S.PZ[k]);
  for (let q = 0; q < 6; q++) S.tools.raise(w, lat, lon, { cont: q > 0 });
  ok(w.elev[k] > e0 + 2.5, 'a mountain rose ' + e0.toFixed(2) + ' → ' + w.elev[k].toFixed(2));
  for (let q = 0; q < 12; q++) S.tools.sink(w, lat, lon + 40, { cont: q > 0 });
  const kd = S.cellOf(lat, lon + 40); ok(w.lf[kd] < 0.5, 'a deep pit fills with sea ' + w.lf[kd]);
  const code = S.opsCode(w.ops), ops = S.opsRead(code);
  eq(JSON.stringify(ops), JSON.stringify(w.ops), 'ops survive the 4-character code');
  ok(code.length === w.ops.length * 4 && /^[A-Za-z0-9_-]*$/.test(code), 'URL-safe and compact (' + code.length + ' chars for ' + w.ops.length + ' ops)');
  const v = S.create({ t: 2e8, p: { seed: 5 } }); v.noCiv = true; S.advance(v, 1e4); S.applyOps(v, ops);
  let md = 0; for (let q = 0; q < S.HN; q++) md = Math.max(md, Math.abs(v.sculpt[q] - w.sculpt[q]));
  ok(md < 1e-5, 'the same sculpted field from the code (max diff ' + md + ')');
  ok(S.opsRead('!!!!' + code.slice(0, 8)).length === 2, 'bad characters are skipped');
});

test('things to find: comets leave crystals, life leaves a vent, creatures have names in both languages; the explorer finds them nearby', () => {
  const w = S.create({ t: 3e8, p: { seed: 11 } }); w.noCiv = true; S.advance(w, 2e5);
  S.tools.seed(w, 0, 0); S.tools.asteroid(w, 30, 60);
  const ks = S.sites(w).map(s => s.k);
  ok(ks.includes('vent') && ks.includes('cry'), 'vent and crystals ' + ks);
  const cry = S.sites(w).find(s => s.k === 'cry');
  eq(S.explore(w, cry.lat + 20, cry.lon).length, 0, 'too far: nothing');
  const h = S.hint(w, cry.lat - 15, cry.lon); ok(h && h.site.id === cry.id && h.dir === 'n', 'the hint points north ' + JSON.stringify(h && [h.site.id, h.dir]));
  const got = S.explore(w, cry.lat + 2, cry.lon);
  ok(got.length === 1 && got[0].id === cry.id && got[0].spark > 0, 'found with sparks'); ok(w.found.includes(cry.id), 'remembered');
  eq(S.explore(w, cry.lat, cry.lon).length, 0, 'not twice');
  const L = S.create({ t: 4.5e9, p: { seed: 7, co2: 300 } }); L.noCiv = true; L.wl = 1; S.seaLevel(L); L.life.st = 6; L.life.euk = 1; L.o2 = 1; L.life.div = 60; S.settle(L, 1e5, 330);
  const sp = S.sites(L).filter(s => s.k === 'sp');
  ok(sp.length >= 3, 'land creatures ' + sp.length);
  for (const s of sp) { ok(/^[゠-ヿ]+$/.test(s.sp.name.ja) && /^[A-Za-z ]+$/.test(s.sp.name.en), 'names ' + s.sp.name.ja + ' / ' + s.sp.name.en); ok(L.lf[S.cellOf(s.lat, s.lon)] > 0.3, 'lives on land'); }
  eq(JSON.stringify(S.species(L, 3, false)), JSON.stringify(S.species(L, 3, false)), 'the same creature every time');
});

test('eras follow the milestones, from molten to space', () => {
  const w = S.create({ t: 0, p: { seed: 99 } }); w.noCiv = true;
  eq(S.ERAS[S.era(w)], 'molten'); S.advance(w, 5e7, { coarse: 5e4 }); eq(S.ERAS[S.era(w)], 'rain');
  S.advance(w, 1e8, { coarse: 5e4 }); eq(S.ERAS[S.era(w)], 'ocean');
  S.tools.seed(w, 0, 0); S.advance(w, 1e4); eq(S.ERAS[S.era(w)], 'life');
  w.ms.forest = w.t; eq(S.ERAS[S.era(w)], 'forest'); w.ms.space = w.t; eq(S.ERAS[S.era(w)], 'space');
});

test('cities and ideas: a city that takes up clean energy cuts the warming', () => {
  const i = S.SC_IDS.indexOf('warm'), a = S.scStart(i), b = S.scStart(i);
  const cs = S.cities(b.st); ok(cs.length >= 4, 'cities to tap ' + cs.length);
  for (let k = 0; k < 4; k++) { const c = S.cities(b.st).filter(x => !x.clean)[0]; eq(S.scTool(b, 'idea', c.lat, c.lon), 'ok'); }
  ok(S.cleanShare(b.st) > 0.4, 'clean share ' + S.cleanShare(b.st));
  eq(S.scTool(b, 'idea', -89, 0), 'no', 'no city near the pole');
  S.scRun(a, 150, { chunk: 25 }); S.scRun(b, 150, { chunk: 25 });
  ok(b.st.civ.cum < a.st.civ.cum * 0.8, 'less fuel burnt ' + Math.round(a.st.civ.cum) + ' → ' + Math.round(b.st.civ.cum));
});

test('wonder planets: five strange worlds, each with its own things to find, standing still in time', () => {
  eq(S.WONDERS.join(), 'ring,ice,lava,moon,bloom');
  const want = { ring: 'arch', ice: 'geyser', lava: 'lava', moon: 'cry', bloom: 'bloom' };
  for (const id of S.WONDERS) {
    const w = S.wonder(id);
    ok(w.frozen && w.wonder === id, id + ' frozen');
    ok(S.sites(w).some(s => s.k === want[id]), id + ' has ' + want[id]);
    eq(hash(w), hash(S.wonder(id)), id + ' the same every time');
  }
  ok(S.wonder('moon').p.size < 0.5, 'the moon is small (low gravity)');
  ok(S.wonder('ring').rings, 'the ring world has rings');
});

test('milestones come in order on a free planet, and it all survives a save (sculpting, marks, finds)', () => {
  const w = S.create({ t: 0, p: { seed: 99 } }); w.surp = true; w.noCiv = true;
  S.advance(w, 2.2e8, { coarse: 5e4 }); ok(w.ms.ocean != null, 'ocean');
  for (let q = 0; q < 5; q++) S.tools.raise(w, 20, 20 + q, { cont: q > 0 });
  S.tools.seed(w, 0, 0); S.tools.asteroid(w, -20, 100); S.advance(w, 2.4e9, { coarse: 5e4 });
  ok(w.ms.life != null && w.ms.life > w.ms.ocean, 'life after the ocean');
  const cry = S.sites(w).find(s => s.k === 'cry'); S.discover(w, cry.id);
  const o = JSON.parse(JSON.stringify(S.serialize(w))), w2 = S.deserialize(o);
  eq(JSON.stringify(w2.ms), JSON.stringify(w.ms), 'milestones saved'); ok(w2.reachOn && Math.abs(S.seaLife(w2) - S.seaLife(w)) < 0.05, 'life map saved');
  eq(JSON.stringify(w2.ops), JSON.stringify(w.ops), 'sculpting saved'); ok(Math.abs(w2.elev[9000] - w.elev[9000]) < 0.05, 'same terrain');
  eq(w2.marks.length, w.marks.length, 'marks saved'); ok(w2.found.includes(cry.id), 'finds saved');
  ok(JSON.stringify(o).length < 40000, 'compact ' + JSON.stringify(o).length);
});

test('old saves load: before the redesign (life everywhere, milestones rebuilt quietly) and before sculpting (old drift, nothing to find yet)', () => {
  const old = { v: 1, t: 2400000000, p: { dist: 1, size: 1, water: 1, n2: 0.78, co2: 300000, seed: 4242 }, A: 25000, O: 150000, ch4: 300, o2: 0.004, wl: 1, lost: 0,
    life: { st: 2, prog: 0.2, pre: 1, div: 6, nudge: null, euk: 0, seedT: -1 }, civ: null, ev: [{ t: 600000000, k: 'life' }], flags: { goe: 1 } };
  const w = S.deserialize(old);
  ok(w && !w.reachOn && w.life.st === 2, 'loaded'); ok(w.ms.life != null && w.ms.sky != null, 'milestones rebuilt ' + JSON.stringify(w.ms));
  ok(!(w.news || []).some(e => e.k === 'ms'), 'no fanfare for old milestones');
  eq(w.ops.length, 0); eq(w.marks.length, 0); eq(w.drift, 1, 'old planets keep their drift');
  S.advance(w, 1e6); ok(isFinite(w.d.Tg), 'runs');
  const mid = Object.assign({}, old, { reach: 'A'.repeat(2048), reachOn: 1, combos: ['vent'], ms: { ocean: 8e7, life: 1.3e8 }, civ: { on: true, y: 3, pop: 1, tech: 20, fos: 4000, res: 90, stab: 70, pol: { en: 1, rs: 0, env: 0 }, T0: 14, lu: 0.1 } });
  const m = S.deserialize(mid); ok(m && m.combos.includes('vent') && Array.isArray(m.civ.clean), 'a save from the first redesign (civ without ideas)');
  S.advance(m, 4); ok(isFinite(m.d.Tg) && m.civ.cs != null, 'its civilization runs');
  eq(S.deserialize({ v: 2 }), null, 'unknown version');
});

test('online battle: the same seed gives the same planet and the same score, whatever the frame rate; a different seed gives another planet', () => {
  const run = (seed, plan) => { const w = S.vsWorld(seed); for (let i = 0; i < 40; i++) { if (plan && i === 8) { S.tools.raise(w, 10, 20); for (let q = 0; q < 6; q++) S.tools.raise(w, 10 + q * 0.7, 20 + q, { cont: true }); S.tools.rain(w, 10, 22); S.tools.seed(w, -20, 100); } S.vsStep(w); } return w; };
  const a = run(31337, true), b = run(31337, true), c = run(4242, true);
  eq(hash(a), hash(b), 'same seed, same moves, same planet');
  eq(JSON.stringify(S.vsScore(a)), JSON.stringify(S.vsScore(b)), 'same score');
  ok(hash(a) !== hash(c), 'another seed is another planet');
  const w0 = S.vsWorld(777), w1 = S.vsWorld(777); eq(hash(w0), hash(w1), 'the start is the same too');
  eq(w0.life.st, 4, 'starts in the age of sea life'); ok(w0.noCiv && !w0.surp, 'no civilization, no surprises'); eq(w0.found.length, 0);
  eq(w0.marks.filter(m => m.k === 'cry').length, 3, 'three crystals to find'); ok(S.sites(w0).length >= 4, 'something to find from the start');
  ok(w0.marks.filter(m => m.k === 'cry').every(m => w0.lf[S.cellOf(m.lat, m.lon)] >= 0.5), 'crystals sit on land');
});

test('online battle: the score formula (variety x4, green % x3, finds x80, evolution 120 a stage, climate up to 150)', () => {
  const w = S.vsWorld(99);
  const f = st => { const L = st.life, d = st.d; return Math.round(L.div) * 4 + Math.round(S.landVeg(st) * 100) * 3 + st.found.length * 80 + Math.max(0, Math.min(L.st, 6) - 4) * 120 + (st.flags.snow ? 0 : Math.round(150 * S.clamp(1 - Math.abs(d.Tg - 15) / 25, 0, 1))); };
  const sc = S.vsScore(w); eq(sc.total, f(w), 'total = the parts'); eq(sc.total, sc.div + sc.green + sc.finds + sc.evolve + sc.climate);
  const before = sc.total, cry = S.sites(w).find(x => x.k === 'cry'); S.discover(w, cry.id);
  eq(S.vsScore(w).total - before, 80, 'a find is worth 80'); eq(S.vsScore(w).finds, 80);
  w.life.st = 6; eq(S.vsScore(w).evolve, 240, 'animals: 2 stages above the sea life'); w.life.st = 7; eq(S.vsScore(w).evolve, 240, 'capped at animals');
  w.life.st = 4; eq(S.vsScore(w).evolve, 0);
  w.d.Tg = 15; eq(S.vsScore(w).climate, 150, '15 degrees is best'); w.d.Tg = -10; eq(S.vsScore(w).climate, 0, 'frozen'); w.d.Tg = 55; eq(S.vsScore(w).climate, 0, 'boiling');
  w.d.Tg = 15; w.flags.snow = 1; eq(S.vsScore(w).climate, 0, 'a snowball planet');
});

test('online battle: left alone for the whole match, every seed grows life onto land and scores 600–1100; the match clock is VS_RATE years a second', () => {
  eq(S.VS_RATE * 180, 5.4e8, '3 minutes = 540 million years'); eq(180 / S.VS_CH, 720);
  for (const seed of [1, 2, 3, 777, 424242, 4294967295]) {
    const w = S.vsWorld(seed), t0 = w.t, s0 = S.vsScore(w).total;
    for (let i = 0; i < 720; i++) S.vsStep(w);
    ok(Math.abs(w.t - t0 - 5.4e8) < 1, 'the planet is 540 million years older: ' + (w.t - t0));
    const sc = S.vsScore(w); ok(w.life.st >= 5 && sc.total >= 600 && sc.total <= 1100 && sc.total > s0 + 300, seed + ' ' + JSON.stringify(sc));
    ok(isFinite(w.d.Tg) && w.d.Tg > 0 && w.d.Tg < 40, seed + ' climate ' + w.d.Tg);
  }
});

run('planet-sim');
