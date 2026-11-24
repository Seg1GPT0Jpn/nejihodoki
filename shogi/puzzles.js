// 将棋：詰将棋の問題（攻め方に玉なし・玉方は残りの駒をすべて持ち駒）。
// 全部エンジンの solveMate で確かめてある（ちょうど n 手・それより短い詰みなし・初手は1つだけ）。
// t1〜t8 は手作業で探したもの、t9〜 は tools/shogi-puzzle-gen.js がつくったもの。
// 単体テスト tools/tests/unit/shogi-engine.test.js が毎回ぜんぶ解き直す。id は保存（mate.s）に残るので変えない・並べ替えても意味は変わらない。
(function (root) {
'use strict';
const PROBLEMS = [
  { id: 't1', n: 1, sfen: '3k5/9/3G5/9/9/9/9/9/9 b S2r2b3g3s4n4l18p 1', first: 'S*6b' },
  { id: 't2', n: 1, sfen: '6lpk/9/5P2P/9/9/9/9/9/9 b G2r2b3g4s4n3l15p 1', first: 'G*1b' },
  { id: 't3', n: 3, sfen: '6B2/8k/9/9/9/9/9/9/9 b 2G2rb2g4s4n4l18p 1', first: 'G*1c' },
  { id: 't4', n: 3, sfen: 'k8/9/P8/9/9/9/9/9/9 b RSr2b4g3s4n4l17p 1', first: 'R*9b' },
  { id: 't5', n: 3, sfen: 'k8/2lS5/G1s6/9/9/9/9/9/9 b N2r2b3g2s3n3l18p 1', first: 'N*8c' },
  { id: 't6', n: 5, sfen: 'p1k6/9/1R7/9/9/9/9/9/9 b Gr2b3g4s4n4l17p 1', first: '8c7c+' },
  { id: 't7', n: 5, sfen: '9/6nkB/8r/8n/9/5NG2/9/9/9 b RGb2g4sn4l18p 1', first: 'R*2a' },
  { id: 't8', n: 5, sfen: '1k7/9/4R4/9/2P1R4/9/9/9/9 b SG2b3g3s4n4l17p 1', first: '5c8c+' },
  { id: 't9', n: 1, sfen: '6k2/4g4/7+P1/9/9/9/9/9/9 b G2r2b2g4s4n4l17p 1', first: 'G*3b' },
  { id: 't10', n: 1, sfen: '9/8S/8k/8l/9/9/9/9/9 b G2r2b3g3s4n3l18p 1', first: 'G*2c' },
  { id: 't11', n: 1, sfen: '8k/9/9/9/5B3/9/9/9/9 b G2rb3g4s4n4l18p 1', first: 'G*1b' },
  { id: 't12', n: 3, sfen: 'R8/sk7/9/R8/N8/9/9/9/9 b 2b4g3s3n4l18p 1', first: '9a9b+' },
  { id: 't13', n: 3, sfen: '4g3R/5k3/4R4/1+P7/9/9/9/9/9 b 2b3g4s4n4l17p 1', first: '1a5a+' },
  { id: 't14', n: 3, sfen: 'k3S4/9/G8/9/2R6/9/9/9/9 b r2b3g3s4n4l18p 1', first: '7e7a+' },
  { id: 't15', n: 3, sfen: '1k7/2g6/2G6/B8/9/9/9/9/9 b 2rb2g4s4n4l18p 1', first: '9d7b+' },
  { id: 't16', n: 3, sfen: '9/8k/9/8S/8R/9/9/9/9 b Gr2b3g3s4n4l18p 1', first: '1d1c+' },
  { id: 't17', n: 3, sfen: 'k8/9/S8/B8/9/9/9/9/9 b Rrb4g3s4n4l18p 1', first: 'R*9b' },
  { id: 't18', n: 3, sfen: '6k1s/8R/8R/9/9/9/9/9/9 b 2b4g3s4n4l18p 1', first: '1c3c+' },
  { id: 't19', n: 5, sfen: '3k2S2/1g5R1/3n5/4R4/9/9/9/9/9 b 2b3g3s3n4l18p 1', first: '5d5b+' },
  { id: 't20', n: 5, sfen: '6R2/8k/9/6R2/9/9/9/9/9 b S2b4g3s4n4l18p 1', first: '3a3b+' },
  { id: 't21', n: 5, sfen: '9/8k/8B/9/6P2/9/9/9/9 b RGrb3g4s4n4l17p 1', first: 'R*1a' },
  { id: 't22', n: 5, sfen: '8k/4N4/7gs/8R/8R/9/9/9/9 b P2b3g3s3n4l17p 1', first: '1d1c+' },
  { id: 't23', n: 5, sfen: '2R6/k8/1p1R5/9/9/9/9/9/9 b SN2b4g3s3n4l17p 1', first: '7a7b+' },
  { id: 't24', n: 5, sfen: '9/kB7/9/3R5/9/9/9/9/9 b GPrb3g4s4n4l17p 1', first: 'G*9c' },
  { id: 't25', n: 5, sfen: '7k1/9/8B/9/5+P3/9/9/9/9 b RNrb4g4s3n4l17p 1', first: 'R*2b' },
  { id: 't26', n: 5, sfen: '9/9/7k1/6R2/9/9/8P/9/9 b R2b4g4s4n4l17p 1', first: 'R*2d' },
  { id: 't27', n: 7, sfen: '7k1/3R4p/9/5+P3/3R5/9/9/9/9 b 2b4g4s4n4l16p 1', first: '6e2e' },
  { id: 't28', n: 7, sfen: '9/9/k1s6/9/9/2R6/2S6/9/9 b R2b4g2s4n4l18p 1', first: '7f7c+' },
  { id: 't29', n: 7, sfen: '6R2/3kp4/1B1l5/9/9/4R4/9/9/9 b 2Sb4g2s4n3l17p 1', first: '3a6a+' },
  { id: 't30', n: 7, sfen: '9/1k7/2n6/S8/9/L2R5/9/9/9 b Nr2b4g3s2n3l18p 1', first: '6f6b+' },
  { id: 't31', n: 7, sfen: '6k1B/8p/8R/3L5/3N5/9/9/9/9 b Br4g4s3n3l17p 1', first: '1c3c+' },
  { id: 't32', n: 7, sfen: '5k2B/4g4/3s1+P3/9/7B1/9/9/9/9 b Rr3g3s4n4l17p 1', first: 'R*6a' },
];
root.ShogiPuzzles = PROBLEMS;
if (typeof module === 'object' && module && module.exports) module.exports = PROBLEMS;
})(typeof globalThis !== 'undefined' ? globalThis : this);
