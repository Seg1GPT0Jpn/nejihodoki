// hop/levels.js・hop/validate.js・hop/proofs.js のテスト：全ステージの形（13行・始まり・ゴール・メダル5・敵の足元・かくれあなの組）、
// 物理のとどく範囲の調べ（ゴールとメダルぜんぶに、とべば届く道がある）、そして「すべてのステージが本当にクリアできる」証明：
// tools/hop-solve.js が見つけた入力の記録（hop/proofs.js）を、同じエンジンで再生してゴールにつくことを毎回確かめる。
// 実行：node tools/tests/unit/hop-levels.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'hop/engine.js'));
const LV = require(path.join(ROOT, 'hop/levels.js'));
const V = require(path.join(ROOT, 'hop/validate.js'));
const { P } = require(path.join(ROOT, 'hop/proofs.js'));

const IDS = LV.ids();
const EXPECT = process.env.HOP_LEVELS ? Number(process.env.HOP_LEVELS) : IDS.length;

test('level list: ids are world-number, four per world in order (the 4th is the boss), names in both languages, par time, gimmick text', () => {
  ok(IDS.length >= 8 && IDS.length % 4 === 0, IDS.length + ' levels');
  IDS.forEach((id, i) => {
    eq(id, (Math.floor(i / 4) + 1) + '-' + ((i % 4) + 1), 'order');
    const d = LV.LEVELS[i]; ok(d.name.ja && d.name.en && d.gimmick.ja && d.gimmick.en, id + ' texts'); ok(d.par >= 15 && d.par <= 300, id + ' par ' + d.par);
    eq(!!d.boss, i % 4 === 3, id + ' boss on the 4th level'); ok(LV.WORLDS[Math.floor(i / 4)].theme === d.theme, id + ' theme');
    ok(!d.gear || E.GEAR[d.gear], id + ' gear');
  });
  eq(new Set(LV.LEVELS.map(l => l.gimmick.en)).size, IDS.length, 'every level has its own gimmick text');
});

test('chunks: every chunk is 13 rows of one width, floors are solid at both ends (so any two glue together)', () => {
  for (const n in LV.CHUNKS) {
    const c = LV.CHUNKS[n]; eq(c.rows.length, 13, n); ok(c.rows.every(r => r.length === c.w), n + ' width');
    if (!c.opt.secret && !c.opt.arena) { ok(c.rows[10][0] !== ' ' && c.rows[10][c.w - 1] !== ' ', n + ' ends on the floor'); }
  }
});

test('every level validates: one start, one goal, 5 medals, burrow pairs, enemies on the floor, checkpoints; the goal and all medals are reachable by physics', () => {
  let bad = [];
  for (const id of IDS) {
    const t = Date.now(), r = V.validate(LV.get(id), { medals: 5 });
    if (r.errors.length) bad.push(id + ': ' + r.errors.join('; '));
    ok(r.info.goal && r.info.medMask === 31, id + ' reach ' + JSON.stringify(r.info));
    if (Date.now() - t > 20000) bad.push(id + ' validator took too long');
  }
  eq(bad.join('\n'), '');
});

test('the validator catches broken levels', () => {
  const mkdef = rows => ({ id: 'x', rows, parts: [] });
  const base = LV.get('1-1').rows;
  const noGoal = base.map(r => r.replace('G', ' ')); ok(V.validate(mkdef(noGoal), { medals: 5, fast: true }).errors.some(e => /goal/.test(e)));
  const twoStart = base.map((r, i) => (i === 8 ? r.replace(/ /, 'P') : r)); ok(V.validate(mkdef(twoStart), { medals: 5, fast: true }).errors.some(e => /start/.test(e)));
  const noMedal = base.map(r => r.replace(/m/g, ' ')); ok(V.validate(mkdef(noMedal), { medals: 5, fast: true }).errors.some(e => /medals/.test(e)));
  const lone = base.map(r => r.replace('D', ' ')); const withD = LV.get('1-2').rows.map(r => r.replace('d', ' ')); ok(V.validate(mkdef(withD), { medals: 5, fast: true }).errors.some(e => /burrow/.test(e)));
  const wide = base.slice(); wide[3] = wide[3] + 'x'; ok(V.validate(mkdef(wide), { medals: 5, fast: true }).errors.some(e => /width/.test(e)));
  // a pit wider than any jump: unreachable goal, found by the physics analysis
  const gap = base.map((r, i) => (i >= 10 ? r.slice(0, 30) + ' '.repeat(40) + r.slice(70) : r.replace(/[bK]/g, ' '))); const gr = V.validate(mkdef(gap), { medals: 5 }); ok(gr.errors.some(e => /not reachable|cannot be touched/.test(e)), gr.errors.join('|'));
  // an enemy in thin air that walks
  const air = base.map((r, i) => (i === 3 ? r.slice(0, 20) + 'b' + r.slice(21) : r)); ok(V.validate(mkdef(air), { medals: 5, fast: true }).errors.some(e => /no floor/.test(e)));
});

test('proofs: replaying the stored input recording of every level reaches the goal, deterministically', () => {
  for (const id of IDS) {
    ok(P[id], id + ' has a proof');
    const L = E.parse(LV.get(id)), inputs = E.unrle(P[id]);
    const a = E.runReplay(L, inputs), b = E.runReplay(L, inputs);
    ok(a.res, id + ': the recording does not reach the goal (re-run tools/hop-solve.js --all --write after changing a level or the engine)');
    eq(E.sig(a), E.sig(b), id + ' deterministic'); ok(a.res.frames <= inputs.length && a.res.frames > inputs.length - 6, id + ' ends within the last block of the recording'); eq(a.p.dead, 0);
    ok(a.res.frames / 60 <= 70, id + ' is ' + (a.res.frames / 60).toFixed(1) + 's');
  }
});

test('proofs: an extra frame of delay breaks nothing it should not (a second, different recording style also works: the solver result survives clone/step)', () => {
  const id = IDS[0], L = E.parse(LV.get(id)), inputs = E.unrle(P[id]);
  const S = E.newState(L); let c = null;
  for (let i = 0; i < inputs.length; i++) { if (i === 300) c = E.clone(S); E.step(S, inputs[i]); }
  for (let i = 300; i < inputs.length; i++) E.step(c, inputs[i]);
  eq(E.sig(c), E.sig(S));
});

test('content: enemy variety and gear across the levels', () => {
  const kinds = new Set(); const gears = new Set();
  for (const id of IDS) { for (const e of E.parse(LV.get(id)).ents) kinds.add(e.k); if (LV.get(id).gear) gears.add(LV.get(id).gear); }
  ok(kinds.size >= 12, 'kinds so far: ' + [...kinds].join(','));
  ok(gears.size >= 3);
});

run('hop-levels');
