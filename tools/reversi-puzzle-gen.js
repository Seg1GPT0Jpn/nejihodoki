#!/usr/bin/env node
// リバーシの「今日のパズル」の問題づくり：でたらめに打った局面（空きマス 8〜12）を reversi/engine.js の solve で最後まで読み切り、
//   「最善手が1つだけ・2番目との差がしきい値以上・やさしい順に5段」のものだけを集めて、reversi/puzzles.js を書く。
// 使い方：node tools/reversi-puzzle-gen.js [--seed 20261125] [--per 24] [--out reversi/puzzles.js]
//   同じ seed なら同じ問題集になる（公開したあとは作り直さない：毎日の問題の並びが変わってしまう）。
// 1問：{ b: 盤（64文字。0 なし・1 黒・2 白）, k: 手番, e: 空きマス, m: [[マス, 最後の石の差（手番の人から見て）]…] }
'use strict';
const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', 'reversi/engine.js'));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const seed = (+arg('seed', 20261125) >>> 0) || 1;
const per = +arg('per', 24);
const out = path.resolve(arg('out', path.join(__dirname, '..', 'reversi/puzzles.js')));
// 段ごとの条件：空きマス・最善と2番目の差の下限・「いちばん多く返す手」「場所の点がいちばん高い手」が答えではない
const TIERS = [
  { e: 8, gap: 6, notGreedy: false, notWeight: false },
  { e: 9, gap: 4, notGreedy: false, notWeight: false },
  { e: 10, gap: 4, notGreedy: true, notWeight: false },
  { e: 11, gap: 2, notGreedy: true, notWeight: true },
  { e: 12, gap: 2, notGreedy: true, notWeight: true },
];
const g = E.geo(8);

function candidate(rnd, empties) {
  const st = E.create({ n: 8 });
  while (!st.over && 64 - (st.moves.filter(m => m[0] >= 0).length + 4) > empties) {
    const mv = E.legal(st);
    E.play(st, mv[Math.floor(rnd() * mv.length)]);
  }
  if (st.over) return null;
  const c = E.counts(st);
  return c.e === empties ? st : null;
}

const list = [], seen = new Set();
TIERS.forEach((T, ti) => {
  const rnd = E.rng(E.hash32('reversi-puzzles:' + seed + ':' + ti));
  let tries = 0, got = 0;
  while (got < per && tries < 200000) {
    tries++;
    const st = candidate(rnd, T.e);
    if (!st) continue;
    const key = st.b.join('') + st.turn;
    if (seen.has(key)) continue;
    const mv = E.legal(st);
    if (mv.length < 3) continue;
    const so = E.solve(st);
    const vals = mv.map(c => so.values[c]).sort((a, b) => b - a);
    if (so.best.length !== 1 || vals[0] - vals[1] < T.gap) continue;
    const bestCell = so.best[0];
    if (T.notGreedy) {
      let top = -1, gset = []; for (const c of mv) { const f = E.flipsOf(st, c).length; if (f > top) { top = f; gset = [c]; } else if (f === top) gset.push(c); }
      if (gset.indexOf(bestCell) >= 0) continue;
    }
    if (T.notWeight) {
      let top = -1e9; for (const c of mv) if (g.W[c] > top) top = g.W[c];
      if (g.W[bestCell] === top) continue;
    }
    seen.add(key); got++;
    list.push({ b: st.b.join(''), k: st.turn, e: T.e, m: mv.map(c => [c, so.values[c]]) });
  }
  console.error(`tier ${ti + 1}: ${got} puzzles (${tries} tries)`);
});
const body = list.map(p => JSON.stringify(p)).join(',\n');
const src = `// リバーシの「今日のパズル」の問題集（tools/reversi-puzzle-gen.js が作る。手で直さない。seed ${seed}）。やさしい順に ${TIERS.length} 段、1段 ${per} 問。
// 1問：{ b: 盤（64文字。0 なし・1 黒・2 白）, k: 手番, e: 空きマス, m: [[マス, 最後の石の差（手番の人から見て。空きマスは勝ったほうのもの）]…] }
// 最善手は1つだけで、すべて reversi/engine.js の solve（最後まで読み切り）で確かめてある（tools/tests/unit/reversi-engine.test.js が、
// もう一度読み切って、別のしくみの全探索とも照らし合わせる）。
(function (root) {
  'use strict';
  var BANK = { v: 1, seed: ${seed}, tiers: ${TIERS.length}, list: [
${body}
  ] };
  root.ReversiPuzzles = BANK;
  if (typeof module === 'object' && module && module.exports) module.exports = BANK;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
fs.writeFileSync(out, src);
console.error('wrote ' + path.relative(process.cwd(), out) + ' (' + list.length + ' puzzles, ' + src.length + ' bytes)');
