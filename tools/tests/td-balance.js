#!/usr/bin/env node
// 工房まもりのバランス（ブラウザなし。td/engine.js の決まった時間刻みのシミュレーションを、自動プレイ TD.bot で遊ぶ）
//   node tools/tests/td-balance.js          … 約20秒
// 1. ふつうの作戦（台をまぜる・空には竹とんぼ・のりで足止め・道具箱・あとで強化）で、全マップに勝てる（乱数3通り）。平均で★2以上
// 2. 1種類の台だけ（6種類 × Lv3 の後の2つの道 × 乱数2通り）では、どのマップでも★3にならない。マップ4からはすべて負ける
// 3. エンドレス：ふつうの作戦で、どのマップもキャンペーンの波の数 +10 以上生き残る。デイリー（10日分）は15波以上
// 4. 同じ入力なら同じ結果（決定的）。波のあいだの保存から戻しても、そのまま続けた場合と同じになる
'use strict';
const path = require('path');
const TD = require(path.join(__dirname, '..', '..', 'td', 'engine.js'));
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${info ? '  ' + info : ''}`); };
const t0 = Date.now();

console.log('1. a reasonable mixed strategy wins every map');
const table = [];
for (let m = 0; m < TD.MAPS.length; m++) {
  const runs = [1, 2, 3].map(seed => TD.simulate({ map: m, seed }));
  const stars = runs.map(r => r.stars), mean = stars.reduce((a, b) => a + b, 0) / stars.length;
  table.push({ map: TD.MAPS[m].id, lives: runs.map(r => (r.won ? r.lives : 'L' + r.wave)).join('/') });
  check(`${TD.MAPS[m].id} won with every seed (mean ★${mean.toFixed(1)})`, runs.every(r => r.won) && mean >= 2, 'lives ' + runs.map(r => (r.won ? r.lives : 'lost at wave ' + r.wave)).join(', ') + ' · ' + runs[0].towers.join(' '));
}

console.log('2. one tower type alone is not enough');
for (let m = 0; m < TD.MAPS.length; m++) {
  const wins = [];
  for (const only of TD.TOWER_IDS) for (const br of ['a', 'b']) for (const seed of [1, 2]) {
    const r = TD.simulate({ map: m, seed, plan: { only, br } });
    if (r.won) wins.push(`${only}/${br}:${r.lives}`);
    if (r.stars === 3) { check(`${TD.MAPS[m].id}: ${only} (${br}) spam gets ★3`, false, 'lives ' + r.lives); }
  }
  const any3 = results.some(x => !x.ok && x.name.startsWith(TD.MAPS[m].id + ':'));
  if (!any3) check(`${TD.MAPS[m].id}: no single-type spam reaches ★3`, true, wins.length ? 'wins: ' + [...new Set(wins)].join(' ') : 'all lose');
  if (m >= 3) check(`${TD.MAPS[m].id}: every single-type spam loses`, wins.length === 0, wins.join(' '));
}

console.log('3. endless and daily last');
for (let m = 0; m < TD.MAPS.length; m++) {
  const r = TD.simulate({ map: m, mode: 'endless', maxSeconds: 9000 });
  check(`${TD.MAPS[m].id} endless: ${r.cleared} waves, ${r.score} pts`, r.cleared >= TD.MAPS[m].waves.length + 10 && r.score > 0);
}
const dailies = [];
for (let d = 0; d < 10; d++) {
  const seed = TD.hash32('kobo:td:' + (20261101 + d));
  const D = TD.dailySetup(seed);
  const r = TD.simulate({ map: D.map, mode: 'daily', mods: D.mods, seed, maxSeconds: 9000 });
  dailies.push(r.cleared);
  check(`daily ${20261101 + d}: ${TD.MAPS[D.map].id} ${Object.keys(D.mods).map(k => k === 'ban' ? 'ban ' + D.mods.ban : k).join('+')} → ${r.cleared} waves, ${r.score} pts`, r.cleared >= 15);
}

console.log('4. determinism and save/restore');
{
  const a = TD.simulate({ map: 4, seed: 7 }), b = TD.simulate({ map: 4, seed: 7 });
  check('the same game twice gives the same result', JSON.stringify(a) === JSON.stringify(b));
  const G = TD.create({ map: 2, seed: 9 }), B = TD.bot(G, {});
  let n = 0;
  while (!(G.wave >= 4 && G.quiet()) && n < 1e6) { if (n % 3 === 0) B.think(); G.step(); n++; }
  const snap = JSON.parse(JSON.stringify(G.snapshot()));
  const H = TD.create({ snap });
  // both continue with the same plain inputs: call each wave as soon as possible, no building
  const cont = X => { for (let i = 0; i < 200 / TD.DT && !X.over; i++) { if (X.cd < 0 && X.canCall()) X.callWave(); X.step(); } return [X.wave, X.lives, X.gold, X.stats.kills, X.over, X.won].join(); };
  G.cd = -1; // a restored game waits for the player; make the live one do the same
  const ra = cont(G), rb = cont(H);
  check('a game restored from its between-waves save plays on exactly like the original', ra === rb, ra + ' vs ' + rb);
}
console.log('\n' + table.map(r => r.map + ' ' + r.lives).join(' | '));
const fail = results.filter(r => !r.ok).length;
console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)`);
process.exit(fail ? 1 : 0);
