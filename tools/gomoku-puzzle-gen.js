#!/usr/bin/env node
// 五目ならべの「今日のパズル」の問題づくり：自己対戦（石の形の点＋でたらめ）でできた局面から、
//   「黒番で、四（あと1つで五になる形）だけをつないで勝てる（連続四＝VCF）」ものを、gomoku/engine.js の vcfShortest で最短の手数まで調べ、
//   「最短がちょうど ○ 手・その最初の手が1つだけ・はじめに黒は五をつくれず、白に四（五をつくれる形）がない・黒の四の手がほかにも3つ以上ある（まぎらわしい）」ものだけを集めて、gomoku/puzzles.js を書く。
// 使い方：node tools/gomoku-puzzle-gen.js [--seed 20261125] [--per 24] [--out gomoku/puzzles.js]
//   同じ seed なら同じ問題集になる（公開したあとは作り直さない：毎日の問題の並びが変わってしまう）。
// 1問：{ b: 盤（225文字。0 なし・1 黒・2 白）, n: 15, m: 手数（黒が置く手の数。最後の五を含む）, s: ひとつの手順（黒・白・黒…のマス。最後は黒の五）, d: まぎらわしい四の手の数 }
'use strict';
const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', 'gomoku/engine.js'));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const seed = (+arg('seed', 20261125) >>> 0) || 1;
const per = +arg('per', 24);
const out = path.resolve(arg('out', path.join(__dirname, '..', 'gomoku/puzzles.js')));
const TIERS = [2, 3, 4, 5, 6];            // 段ごとの手数
const rnd = E.rng(E.hash32('gomoku-puzzles:' + seed));
const got = TIERS.map(() => []), seen = new Set();
const full = () => got.every(g => g.length >= per);

function consider(st) {
  const P = E.mkPos(st);
  if (E.completions(P, 1).length || E.completions(P, 2).length) return;
  const r = E.vcfShortest(st, 1, TIERS[TIERS.length - 1] + 1, 400000);
  if (!r || r.first.length !== 1) return;
  const ti = TIERS.indexOf(r.moves);
  if (ti < 0 || got[ti].length >= per) return;
  const key = st.b.join('');
  if (seen.has(key)) return; 
  // まぎらわしい四：黒が置くと四になる手のうち、答えではないもの
  let d = 0;
  for (const c of E.fourCells(P, 1)) {
    if (c === r.first[0]) continue;
    E.put(P, c, 1); if (E.completions(P, 1).length) d++; E.take(P, c);
  }
  if (d < 3) return;
  const bc = st.b.filter(v => v === 1).length;
  if (bc < 6) return;
  seen.add(key);
  got[ti].push({ b: st.b.join(''), n: 15, m: r.moves, s: r.line, d });
}
function selfplay() {
  const st = E.create({ n: 15 });
  let used = false;
  while (!st.over && st.moves.length < 44) {
    let c;
    if (!st.moves.length) c = 112;
    else {
      const P = E.mkPos(st), rk = E.rankMoves(P, st.turn, 5, 14);
      if (!rk.length) return;
      const w = [6, 3, 2, 1, 1]; let tot = 0; const ws = rk.map((r, i) => (tot += w[i] || 1));
      let x = rnd() * tot, i = 0; while (x > ws[i]) i++;
      c = rk[Math.min(i, rk.length - 1)].c;
    }
    E.play(st, c);
    if (st.over) return;
    if (!used && st.turn === 1 && st.moves.length >= 12) {
      const before = got.map(g => g.length).join();
      consider(st);
      if (got.map(g => g.length).join() !== before) used = true;      // 1ゲームから1問まで
    }
  }
}
let games = 0; const t0 = Date.now();
while (!full() && games < 400000) { selfplay(); games++; if (games % 2000 === 0) console.error(`games ${games}: ${got.map(g => g.length).join('/')} (${Math.round((Date.now() - t0) / 1000)}s)`); }
if (!full()) { console.error('not enough puzzles: ' + got.map(g => g.length).join('/')); process.exit(1); }
const list = [].concat(...got);
const body = list.map(p => JSON.stringify(p)).join(',\n');
const src = `// 五目ならべの「今日のパズル」の問題集（tools/gomoku-puzzle-gen.js が作る。手で直さない。seed ${seed}）。やさしい順に ${TIERS.length} 段（${TIERS.join('・')} 手）、1段 ${per} 問。
// 1問：{ b: 盤（225文字。0 なし・1 黒・2 白）, n: 15, m: 手数（黒が置く手の数。最後の五を含む）, s: ひとつの手順（黒・白・黒…のマス）, d: まぎらわしい四の手の数 }
// 「黒番。四だけをつないで、m 手で五をつくれ」：最短がちょうど m 手で、その最初の手は1つだけ（すべて gomoku/engine.js の vcfShortest で確かめてある。
// tools/tests/unit/gomoku-engine.test.js が、もう一度調べ直して、別のしくみの全探索とも照らし合わせる）。
(function (root) {
  'use strict';
  var BANK = { v: 1, seed: ${seed}, tiers: ${TIERS.length}, moves: ${JSON.stringify(TIERS)}, list: [
${body}
  ] };
  root.GomokuPuzzles = BANK;
  if (typeof module === 'object' && module && module.exports) module.exports = BANK;
})(typeof globalThis !== 'undefined' ? globalThis : this);
`;
fs.writeFileSync(out, src);
console.error('wrote ' + path.relative(process.cwd(), out) + ' (' + list.length + ' puzzles, ' + src.length + ' bytes, ' + games + ' games, ' + Math.round((Date.now() - t0) / 1000) + 's)');
