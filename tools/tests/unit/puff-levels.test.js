// puff/levels.js・puff/bot.js・puff/proofs.js のテスト：25ステージの形（13行・始まり・ゴール・メダル3・敵の足元・ソケットととびらの組）、
// ステージの「しかけ」の網羅（8つのわざ全部が必要になる・ワールドごとに新しいしかけ・ボスの弱点の敵が部屋にいる）、
// 「ただ飛ぶだけでは通れない」（ふさぐしかけは本当にふさいでいる）、そして「すべてのステージが本当にクリアできる」証明：
// tools/puff-solve.js が見つけた入力の記録（puff/proofs.js）を同じエンジンで再生して、メダル3つ全部とゴールに着くことを毎回確かめる。
// 実行：node tools/tests/unit/puff-levels.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'puff/engine.js'));
const LV = require(path.join(ROOT, 'puff/levels.js'));
const PB = require(path.join(ROOT, 'puff/bot.js'));
const PROOFS = require(path.join(ROOT, 'puff/proofs.js'));
const T = E.T;
const IDS = LV.ids();
const popc = n => { let c = 0; while (n) { c += n & 1; n >>>= 1; } return c; };
const count = (def, ch) => def.rows.reduce((a, r) => a + r.split(ch).length - 1, 0);

test('stage list: 5 worlds x 5 stages (the 5th is the boss), names in both languages, a themed world each, own gimmick text', () => {
  eq(IDS.length, 25); eq(LV.WORLDS.length, 5);
  IDS.forEach((id, i) => {
    eq(id, (Math.floor(i / 5) + 1) + '-' + ((i % 5) + 1), 'order'); eq(LV.index(id), i); eq(LV.idOf(i), id);
    const d = LV.LEVELS[i]; ok(d.name.ja && d.name.en && d.gimmick.ja && d.gimmick.en, id + ' texts');
    eq(!!d.boss, i % 5 === 4, id + ' boss on the 5th stage'); eq(LV.WORLDS[Math.floor(i / 5)].theme, d.theme, id + ' theme');
    if (d.boss) eq(d.boss, LV.WORLDS[Math.floor(i / 5)].boss, id + ' the world boss');
  });
  eq(new Set(LV.LEVELS.map(l => l.name.ja)).size, 25, 'every stage has its own name'); eq(new Set(LV.LEVELS.map(l => l.name.en)).size, 25);
  eq(new Set(LV.WORLDS.map(w => w.boss)).size, 5, 'five different bosses'); ok(E.BOSSES.every(b => LV.WORLDS.some(w => w.boss === b)));
  eq(new Set(LV.WORLDS.map(w => w.theme)).size, 5);
});

test('shape: 13 equal rows, exactly one start and one goal, three medals, checkpoints in long stages, creatures stand on something', () => {
  for (const d of LV.LEVELS) {
    eq(d.rows.length, 13, d.id); const W = d.rows[0].length; ok(d.rows.every(r => r.length === W), d.id + ' width');
    eq(count(d, 'P'), 1, d.id + ' P'); eq(count(d, 'G'), 1, d.id + ' G'); eq(count(d, 'm'), 3, d.id + ' medals');
    ok(count(d, 'c') >= 12, d.id + ' has stars'); ok(W >= 70 && W <= 260, d.id + ' width ' + W);
    const L = E.parse(d);
    if (!d.boss) ok(L.cps.length >= 1, d.id + ' has a checkpoint');
    const solid = (x, y) => y >= L.H ? false : (E.SOLID[L.t[y * L.W + x]] === 1 || L.t[y * L.W + x] === T.ONEWAY);
    for (const e of L.ents) {
      if (e.k === 'boss') { ok(d.boss && d.arena, d.id + ' boss arena'); continue; } const df = E.DEF[e.k]; ok(df, e.k);
      eq(L.t[e.y * L.W + e.x] === T.AIR || e.k === 'taiho', true, d.id + ' ' + e.k + ' not inside a tile');
      if (!df.fly) ok(solid(e.x, e.y + 1) || e.k === 'taiho', d.id + ' ' + e.k + ' at ' + e.x + ',' + e.y + ' has no floor');
    }
    const st = L.start; ok(solid(st.x, st.y + 1), d.id + ' start has a floor'); ok(solid(L.goal.x, L.goal.y + 1), d.id + ' goal has a floor');
    ok(!L.ents.some(e => Math.abs(e.x - st.x) < 4 && e.k !== 'boss'), d.id + ' nothing right at the start');
    deep(L.sockN.length === L.doorG.length || L.nSock === 0, true, d.id + ' every door has its sockets');
    for (let g = 0; g < L.doorG.length; g++) ok(L.sockN[g] >= 1, d.id + ' door group ' + g + ' has a socket');
    eq(L.medals.length, 3);
    for (const m of L.medals) ok(m.x >= 0 && m.y >= 0 && m.y < 13);
  }
});

test('puzzles: all eight abilities are needed somewhere, every puzzle kind appears, each world brings new ones, gates always have their provider just before them', () => {
  const need = new Set(), kinds = new Set(), perWorld = [new Set(), new Set(), new Set(), new Set(), new Set()];
  const PROV = { fire: 'F', spark: 'Z', ice: 'I', blade: 'Y', stone: 'R', leaf: 'L', bubble: 'U', bomb: 'X' };
  for (const d of LV.LEVELS) {
    const w = Math.floor(LV.index(d.id) / 5); let lastGet = null;
    d.route.forEach((it, k) => {
      if (it.t === 'get') { ok(E.ABS.indexOf(it.ab) >= 0, d.id + ' ability ' + it.ab); need.add(it.ab); perWorld[w].add(it.ab); lastGet = it.ab; ok(count(d, PROV[it.ab]) >= 1, d.id + ' has a ' + it.ab + ' creature'); }
      if (it.t === 'use') { kinds.add(it.kind); ok(it.ab.indexOf(lastGet) >= 0, d.id + ' gate ' + it.kind + ' is opened by the ability fetched just before (' + lastGet + ')'); ok(count(d, it.kind) >= 1, d.id + ' gate tile ' + it.kind); }
      if (it.t === 'water') { kinds.add('~'); ok(it.ab.indexOf(lastGet) >= 0, d.id + ' water needs ice or bubble: ' + lastGet); }
      if (it.t === 'sock') { kinds.add('o'); eq(lastGet, 'spark', d.id + ' sockets need spark'); }
    });
  }
  eq(need.size, 8, 'abilities needed: ' + [...need]);
  deep([...kinds].sort(), ['k', 'n', 'o', 'r', 'v', '~'].sort(), 'every kind of puzzle');
  perWorld.forEach((s, i) => ok(s.size >= 3, 'world ' + (i + 1) + ' uses ' + [...s]));
  ok(new Set([...perWorld[0], ...perWorld[1]]).size >= 6, 'the first two worlds teach most abilities'); ok(perWorld[4].size >= 5, 'world 5 mixes them all');
  ok([...perWorld[1]].some(a => !perWorld[0].has(a)), 'world 2 brings new abilities');
});

test('bosses: the arena holds creatures that give the weak ability, the boss is the world boss, hearts for the fight, goal beyond', () => {
  const PROV = { fire: 'F', spark: 'Z', ice: 'I', blade: 'Y', stone: 'R', leaf: 'L', bubble: 'U', bomb: 'X' };
  for (const d of LV.LEVELS.filter(l => l.boss)) {
    const weak = Object.keys(E.BOSS_WEAK[d.boss]); const L = E.parse(d); const bx = L.ents.find(e => e.k === 'boss').x;
    const arena = d.rows.map(r => r.slice(d.arena[0] / 16, d.arena[1] / 16 + 2)).join('\n');
    ok(weak.some(a => arena.indexOf(PROV[a]) >= 0), d.id + ' has a provider of a weakness: ' + weak);
    ok(d.route.some(r => r.t === 'boss' && weak.indexOf(r.ab[0]) >= 0), d.id + ' route fights with a weak ability');
    ok(count(d, 'h') >= 1, d.id + ' has a heart'); ok(L.goal.x > bx, 'goal behind the boss'); ok(L.goal.x * 16 < d.arena[1], 'goal inside the arena');
    eq(E.BOSS_HP[d.boss] >= 12, true);
  }
});

test('gates are real: a hero that only flies (no abilities) cannot pass any stage, and is stopped in the first half', () => {
  for (const d of LV.LEVELS.filter(l => !l.boss)) {
    const def = Object.assign({}, d, { route: [{ t: 'go', x: d.rows[0].length - 8, alt: 'mid' }] });
    const L = E.parse(def), S = E.newState(L), bot = PB.create(def);
    for (let f = 0; f < 7000 && !S.res; f++) E.step(S, bot.step(S));
    ok(!S.res, d.id + ' was passed without any ability');
    ok(S.ps[0].x < L.W * 16 * 0.55, d.id + ' got to ' + Math.round(S.ps[0].x / 16) + ' of ' + L.W);
  }
});

test('proofs: every stage is beaten, with all three medals, by replaying its stored input recording on the real engine', () => {
  for (const id of IDS) {
    ok(typeof PROOFS[id] === 'string', id + ' has a proof');
    const inputs = E.unrle(PROOFS[id]); ok(inputs.length > 300 && inputs.length < 20000, id + ' length ' + inputs.length);
    const S = E.runReplay(E.parse(LV.get(id)), inputs);
    ok(S.res, id + ' reached the goal'); eq(popc(S.res.med), 3, id + ' all three medals'); eq(S.res.frames, inputs.length, id + ' ends exactly at the goal');
    ok(S.res.deaths <= 2, id + ' deaths ' + S.res.deaths);
  }
});

test('proofs are current: the route bot reproduces exactly the stored recordings (rerun tools/puff-solve.js --all --write when the engine or a stage changes)', () => {
  for (const id of IDS) {
    const def = LV.get(id), L = E.parse(def), S = E.newState(L), bot = PB.create(def), inp = [];
    while (!S.res && inp.length < 30000 && !bot.fail) { const m = bot.step(S); inp.push(m); E.step(S, m); }
    ok(S.res, id + ' the bot finishes: ' + bot.fail); eq(E.rle(inp), PROOFS[id], id + ' recording unchanged');
  }
});

test('never-lose and two players do not break the stages: the same recordings still finish with hearts never dropping / a helper along', () => {
  for (const id of ['1-1', '2-3', '4-2']) {
    const inputs = E.unrle(PROOFS[id]);
    const S = E.runReplay(E.parse(LV.get(id)), inputs, { assist: { hearts: true } }); ok(S.res, id + ' with never-lose'); eq(S.ps[0].hp, 6);
    const S2 = E.newState(E.parse(LV.get(id)), { players: 2 }); for (let i = 0; i < inputs.length + 600 && !S2.res; i++) E.step(S2, i < inputs.length ? inputs[i] : 0, 0);
    ok(S2.ps.length === 2 && S2.f > 100, id + ' two players run');
  }
});

run('puff-levels');
