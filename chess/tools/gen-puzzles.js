#!/usr/bin/env node
// チェスの「今日のパズル」の問題づくり：チェス工房の自分の探索（ai.js）で、でたらめに近い対局の途中の局面を調べて、
//   「答えが1つだけ」のものだけを集め、chess/puzzles.js を書く。やさしい順に 5 段、1段 24 問、全部で 120 問。
//   段 1 = 1手メイト／段 2 = 駒を取って得をする（やさしい）／段 3 = 2手メイト／段 4 = 駒を取って得をする（深い。静かな手・ぎせい）／段 5 = 3手メイト
//   メイトの問題の「答えが1つ」は、メイトまで読み切るソルバー（ai.js の moveMates）で、合法手の全部を確かめて決める
//   （短いメイトがあればその問題にしない）。得をする問題は、読みの深さを変えて全部の手を点にして、最善手と次点の差が大きいことと、
//   いちばん安い読みでは見つからないこと（段 4）を確かめる。
// 使い方：node chess/tools/gen-puzzles.js [--seed 20261126] [--per 24] [--out chess/puzzles.js] [--minutes 12]
//   同じ seed なら同じ問題集になる（公開したあとは作り直さない：毎日の問題の並びが変わってしまう）。
// 1問：{ f: FEN, k: 'm1'|'m2'|'m3'|'w', s: [答えの手順（UCI）], g: 得（cp。w のとき）, n: 合法手の数 }
'use strict';
const fs = require('fs');
const path = require('path');
const E = require(path.join(__dirname, '..', 'engine.js'));
const A = require(path.join(__dirname, '..', 'ai.js'));
const arg = (k, d) => { const i = process.argv.indexOf('--' + k); return i > 0 ? process.argv[i + 1] : d; };
const seed = (+arg('seed', 20261126) >>> 0) || 1;
const per = +arg('per', 24);
const out = path.resolve(arg('out', path.join(__dirname, '..', 'puzzles.js')));
const budget = +arg('minutes', 25) * 60000;
const t0 = Date.now();
const rnd = A.rng(A.hash32('chess-puzzles:' + seed));
const TIERS = [{ k: 'm1' }, { k: 'w', easy: true }, { k: 'm2' }, { k: 'w', easy: false }, { k: 'm3' }];
const got = TIERS.map(() => []), seen = new Set();
const full = () => got.every(g => g.length >= per);
const uci = E.uci;

function selfPlay(maxPly) {
  // 駒の動きにばらつきがある対局：強さ 1〜4 をまぜる。ときどき完全にでたらめ
  const g = new E.Game(), lv = [1 + Math.floor(rnd() * 4), 1 + Math.floor(rnd() * 4)], positions = [];
  const mix = 0.12 + rnd() * 0.3;
  while (!g.status().over && g.list.length < maxPly) {
    const lg = g.legal(); let m;
    if (rnd() < mix) m = lg[Math.floor(rnd() * lg.length)];
    else m = A.cpuMove(g, lv[g.pos.side], { seed: Math.floor(rnd() * 1e9), ms: 25, book: false }).move;
    g.play(m);
    if (g.list.length >= 8 && !g.status().over) positions.push(E.toFen(g.pos));
  }
  return positions;
}

function tryMate(fen) {
  const pos = E.fromFen(fen), lg = E.legalMoves(pos);
  if (lg.length < 6 || pos.inCheck()) return;
  // 1 手メイト
  const m1 = A.matingMoves(pos, 1);
  if (m1.length === 1 && got[0].length < per) {
    const checks = lg.filter(m => { pos.make(m); const c = pos.inCheck(); pos.unmake(); return c; });
    if (checks.length >= 2) add(0, { f: fen, k: 'm1', s: [uci(m1[0])], n: lg.length });
    return;
  }
  if (m1.length) return;
  // 2 手・3 手：まず探索で見つかるかを見る（速い）
  const need2 = got[2].length < per, need3 = got[4].length < per;
  if (!need2 && !need3) return;
  const r = A.search(pos, { depth: 6, ms: 90, fresh: false });
  if (r.score < A.MATE_IN) return;
  const plies = A.MATE - r.score;             // メイトまでの半手
  if (plies === 3 && need2) {
    const ms = A.matingMoves(pos, 2);
    if (ms.length === 1 && !A.attackerMates(pos, 1)) { const line = A.mateLine(pos, 2); add(2, { f: fen, k: 'm2', s: line.map(uci), n: lg.length }); }
  } else if (plies === 5 && need3) {
    if (A.attackerMates(pos, 2)) return;
    const ms = A.matingMoves(pos, 3);
    if (ms.length === 1) { const line = A.mateLine(pos, 3); add(4, { f: fen, k: 'm3', s: line.map(uci), n: lg.length }); }
  }
}
function tryWin(fen) {
  const pos = E.fromFen(fen), lg = E.legalMoves(pos);
  if (lg.length < 8 || pos.inCheck()) return;
  const needEasy = got[1].length < per, needHard = got[3].length < per;
  if (!needEasy && !needHard) return;
  const base = A.materialOnly(pos);
  const FULL = 120000;                         // 読みは、時間ぎれにせず、その深さまで必ず読み切る（途中で切ると、深さがごまかされる）
  // 安い読み（2手）で、最善手と次点の差が大きい局面だけ詳しく読む
  const s2 = A.scoreMoves(pos, 2, { ms: FULL }); if (s2.length < 2) return;
  const quick = s2[0].score - s2[1].score >= 150;
  if (!quick && !needHard) return;
  const s3 = A.scoreMoves(pos, 3, { ms: FULL });
  const gap3 = s3[0].score - s3[1].score;
  let row = null;
  if (needEasy && quick && gap3 >= 200 && s3[0].move === s2[0].move && ((s3[0].move >> 16) & 1)) {
    // 段 2：深さ 3 と 5 で、同じ手が最善で、次点との差が 200 以上。駒を取る手
    const s5 = A.scoreMoves(pos, 5, { ms: FULL });
    if (s5[0].move === s3[0].move && s5[0].score - s5[1].score >= 200 && s5[0].score - base >= 200 && s5[0].score < A.MATE_IN) row = { t: 1, best: s5[0], gain: s5[0].score - base };
  } else if (needHard && gap3 < 200) {
    // 段 4：深さ 3 では見つからない。深さ 6 で差 250 以上、深さ 7 で同じ手が差 200 以上
    const s6 = A.scoreMoves(pos, 6, { ms: FULL });
    if (s6[0].score - s6[1].score >= 250 && s6[0].score - base >= 200 && s6[0].score < A.MATE_IN && s6[0].score > -A.MATE_IN) {
      const s7 = A.scoreMoves(pos, 7, { ms: FULL });
      if (s7[0].move === s6[0].move && s7[0].score - s7[1].score >= 200) row = { t: 3, best: s7[0], gain: s7[0].score - base };
    }
  }
  if (!row) return;
  const pv = A.search(pos, { depth: 7, ms: 800, analysis: true }).pv;
  const line = []; const tmp = pos.clone(); for (const m of pv.slice(0, 6)) { if (E.legalMoves(tmp).indexOf(m) < 0) break; line.push(uci(m)); tmp.make(m); }
  line[0] = uci(row.best.move); if (!line.length) return;
  add(row.t, { f: fen, k: 'w', s: line.slice(0, E.uci(row.best.move) === line[0] ? 6 : 1), g: row.gain, n: lg.length });
}
function add(t, row) {
  const key = row.f.split(' ').slice(0, 2).join(' ');
  if (seen.has(key) || got[t].length >= per) return; seen.add(key); got[t].push(row);
  process.stderr.write(`[${Math.round((Date.now() - t0) / 1000)}s] tier ${t + 1}: ${got[t].length}/${per}  (${row.k} ${row.s[0]})\n`);
}

let games = 0;
while (!full() && Date.now() - t0 < budget) {
  const ps = selfPlay(40 + Math.floor(rnd() * 70)); games++;
  // その対局から、いくつかの局面だけ詳しく見る
  for (let i = 0; i < ps.length && !full(); i++) {
    if (rnd() < 0.5) continue;
    try { tryMate(ps[i]); if (rnd() < 0.35) tryWin(ps[i]); } catch (e) { console.error('skip', e.message); }
  }
}
process.stderr.write(`games ${games}, counts ${got.map(g => g.length).join(',')}, ${Math.round((Date.now() - t0) / 1000)}s\n`);
// やさしい順：合法手の少ない順（メイト）、得の大きい順（w）
got.forEach((g, t) => { if (TIERS[t].k === 'w') g.sort((a, b) => b.g - a.g); else g.sort((a, b) => a.n - b.n); });
const list = [].concat(...got.map(g => g.slice(0, per)));
const head = `// チェスの「今日のパズル」の問題集（chess/tools/gen-puzzles.js が作る。手で直さない。seed ${seed}）。やさしい順に 5 段、1段 ${per} 問。
// 段 1 = 1手メイト／段 2 = 駒を取って得をする／段 3 = 2手メイト／段 4 = 駒を取って得をする（深い）／段 5 = 3手メイト
// 1問：{ f: FEN（手番のほうが解く）, k: 'm1'|'m2'|'m3'|'w', s: [答えの手順（UCI。最初が正解の手。メイトの問題は守る側の最善の粘りも入る）], g: 得（cp。k が w のとき）, n: 合法手の数 }
// 答えは1つだけ：メイトの問題は、合法手の全部を ai.js の moveMates で確かめ（短いメイトがないことも）、k が w の問題は、深さ 2〜7 の読みで最善手と次点の差が大きい。
// tools/tests/unit/chess-puzzles.test.js が、もう一度ぜんぶ確かめる。
`;
const body = list.map(p => JSON.stringify(p)).join(',\n');
fs.writeFileSync(out, `${head}(function (root) {\n  'use strict';\n  var BANK = { v: 1, seed: ${seed}, tiers: 5, list: [\n${body}\n  ] };\n  root.ChessPuzzles = BANK;\n  if (typeof module === 'object' && module && module.exports) module.exports = BANK;\n})(typeof globalThis !== 'undefined' ? globalThis : this);\n`);
console.log('wrote', out, list.length, 'puzzles');
if (!full()) { console.error('NOT FULL: ' + got.map(g => g.length).join(',')); process.exit(2); }
