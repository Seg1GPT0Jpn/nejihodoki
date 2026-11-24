// planet/sim.js（わくせいシミュレーターの星のモデル）の単体テスト。node だけ。
// 実行：node tools/tests/unit/planet-sim.test.js   （8つのシナリオを2回ずつ最後まで流すので 1 分ほど）
// - どのシナリオも、何もしないと負け、sim.js の plan（ふつうの遊び方）で勝てる（＝クリアできることの証明）
// - 同じ手なら同じ結果（決まった結果：serialize が1文字まで同じ）
// - 道具・コンボ・いのちの広がり・危険の知らせ・節目・古い保存の読み込み
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

test('every scenario: doing nothing fails, the plan wins (score 600–1000, within the tool budget)', () => {
  S.SCEN.forEach((d, i) => {
    const a = S.scPlay(i, false);
    ok(a.ended && !a.win && a.score === 0, d.id + ' nothing: ' + a.why);
    const b = S.scPlay(i, true);
    ok(b.ended && b.win, d.id + ' plan wins (' + b.why + ')');
    ok(b.score >= 600 && b.score <= 1000 && b.stars >= 1, d.id + ' score ' + b.score);
    if (d.budget != null) ok(b.actions <= d.budget, d.id + ' budget ' + b.actions + '/' + d.budget);
  });
});

test('deterministic: the same plan gives exactly the same planet', () => {
  for (const id of ['cradle', 'goe', 'warm']) {
    const i = S.SC_IDS.indexOf(id), a = S.scPlay(i, true), b = S.scPlay(i, true);
    eq(hash(a.st), hash(b.st), id); eq(a.score, b.score, id + ' score');
  }
  const f = () => { const w = S.create({ t: 0, p: { seed: 4242 } }); w.surp = true; w.noCiv = true; S.advance(w, 1.2e9, { coarse: 5e4 }); return w; };
  eq(hash(f()), hash(f()), 'free planet with surprises');
});

test('the budget: tools stop when it is used up, locked tools never work', () => {
  const sc = S.scStart(S.SC_IDS.indexOf('snow'));
  for (let k = 0; k < sc.def.budget; k++) eq(S.scTool(sc, 'volcano', 0, k * 30), 'ok');
  eq(S.scTool(sc, 'volcano', 0, 0), 'empty'); eq(S.scLeft(sc), 0);
  eq(S.scTool(S.scStart(S.SC_IDS.indexOf('snow')), 'sink', 0, 0), 'locked');
});

test('the cradle tells the story: it slides into a snowball unless volcanoes warm it, and the danger warning comes first', () => {
  const sc = S.scStart(0); let warned = false;
  while (!sc.ended) { S.scRun(sc, 2.5e5); const d = S.danger(sc.st); if (d.k === 'snow' && d.lv >= 0.3 && !sc.st.flags.snow) warned = true; }
  ok(!sc.win && sc.why === 'snow', 'freezes: ' + sc.why); ok(warned, 'warned before the snowball');
  ok(S.scUsed(sc) > 1.5e6, 'the slide takes a while (' + S.scUsed(sc) + ' years)');
});

test('life spreads from where it is sown, faster next to a volcano (combo)', () => {
  const mk = () => { const w = S.create({ t: 3e8, p: { seed: 11 } }); w.noCiv = true; S.advance(w, 2e5); return w; };
  const a = mk(), b = mk();
  ok(S.tools.seed(a, 0, 0), 'seeded'); ok(a.reachOn && a.life.st === 1, 'life');
  ok(S.seaLife(a) < 0.05, 'starts small ' + S.seaLife(a));
  S.tools.volcano(b, 0, 10); ok(S.tools.seed(b, 0, 0), 'seeded b'); ok(b.combos.includes('vent'), 'vent combo');
  S.advance(a, 5e6); S.advance(b, 5e6);
  ok(S.seaLife(b) > S.seaLife(a) * 1.5, 'combo spreads faster ' + S.seaLife(a).toFixed(2) + ' < ' + S.seaLife(b).toFixed(2));
  S.advance(a, 6e7); ok(S.seaLife(a) > 0.8, 'fills the sea in time ' + S.seaLife(a));
  ok(!S.tools.seed(S.create({ t: 1e7, p: { seed: 3 } }), 0, 0), 'no ocean yet: no life');
});

test('the other combos', () => {
  const w = S.create({ t: 3e8, p: { seed: 5 } }); w.noCiv = true; S.advance(w, 1e5);
  for (let k = 0; k < 3; k++) S.tools.volcano(w, 20, 40 + k * 3); ok(w.combos.includes('super'), 'three volcanoes: flood eruption');
  const s = S.scStart(S.SC_IDS.indexOf('snow')); S.tools.asteroid(s.st, 0, 0); ok(s.st.combos.includes('melt'), 'comet on ice');
  const g = S.scStart(S.SC_IDS.indexOf('gate')); S.tools.sink(g.st, 48, 0); ok(g.st.combos.includes('current'), 'seaway at 48°N');
  // a mountain on a coast
  const r = S.create({ t: 4.5e9, p: { seed: 7, co2: 300 } }); r.noCiv = true; r.wl = 1; S.seaLevel(r); S.advance(r, 1e4);
  let done = false; for (let c = 0; c < S.N && !done; c++) { const [lat, lon] = S.cellLL(c); if (r.lf[c] > 0.6) { S.tools.raise(r, lat, lon); done = r.combos.includes('rain'); } }
  ok(done, 'mountain by the sea');
});

test('milestones come in order on a free planet, surprises happen, and it all survives a save', () => {
  const w = S.create({ t: 0, p: { seed: 99 } }); w.surp = true; w.noCiv = true;
  S.advance(w, 2.2e8, { coarse: 5e4 }); ok(w.ms.ocean != null, 'ocean');
  S.tools.seed(w, 0, 0); S.advance(w, 2.4e9, { coarse: 5e4 });
  ok(w.ms.life != null && w.ms.life > w.ms.ocean, 'life after the ocean');
  ok(w.ev.some(e => e.k === 'surprise') || w.nextSurp > 0, 'surprises are scheduled');
  const o = JSON.parse(JSON.stringify(S.serialize(w))), w2 = S.deserialize(o);
  eq(JSON.stringify(w2.ms), JSON.stringify(w.ms), 'milestones saved'); ok(w2.reachOn && Math.abs(S.seaLife(w2) - S.seaLife(w)) < 0.05, 'life map saved');
});

test('an old save (before the redesign) loads: life everywhere, milestones rebuilt quietly', () => {
  const old = { v: 1, t: 2400000000, p: { dist: 1, size: 1, water: 1, n2: 0.78, co2: 300000, seed: 4242 }, A: 25000, O: 150000, ch4: 300, o2: 0.004, wl: 1, lost: 0,
    life: { st: 2, prog: 0.2, pre: 1, div: 6, nudge: null, euk: 0, seedT: -1 }, civ: null, ev: [{ t: 600000000, k: 'life' }], flags: { goe: 1 } };
  const w = S.deserialize(old);
  ok(w && !w.reachOn && w.life.st === 2, 'loaded'); ok(w.ms.life != null && w.ms.sky != null, 'milestones rebuilt ' + JSON.stringify(w.ms));
  ok(!(w.news || []).some(e => e.k === 'ms'), 'no fanfare for old milestones');
  S.advance(w, 1e6); ok(isFinite(w.d.Tg), 'runs');
  eq(S.deserialize({ v: 2 }), null, 'unknown version');
});

run('planet-sim');
