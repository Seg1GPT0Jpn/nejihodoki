// ころがし工房ゴルフ：3つのコース × 9ホール。座標は「マス」（y は下向き）。形の決まりは minigolf/engine.js の先頭。
//   poly      フェルトの外わく（閉じた多角形。まわりは木の壁）
//   blocks    中の木のブロック（閉じた多角形） / walls  中の板（折れ線）
//   posts     インクびん・くい [x, y, 半径]（はね返りは弱い） / bumpers  ばね [x, y, 半径]（強くはじく）
//   sand      おがくず（よく止まる） / ink  インクだまり（入ると罰打1、打つ前の場所へ） / slopes  坂 { p: 多角形, g: [gx, gy]（マス/秒²） }
//   gears     回る歯車 { x, y, r（腕の長さ）, arms, w（回る速さ rad/秒。マイナスは逆回り）, ph }
//   rulers    すべる定規 { a, b（中心が行き来する両端）, len, ang（向き。度）, per（往復の秒数）, ph（0〜1） }
//   pipes     パイプ { a（入り口）, b（出口）, d（出る向き。度） }
//   tee, cup, par, tip（最初に出る一言）
// 全ホールの確かめた答えは tools/tests/minigolf-solutions.js（tools/tests/minigolf-levels.js がパー以内に入ることを確かめる）。
(function (root) {
  'use strict';
  var R = function (x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; };
  var OCT = [[2, 1], [7, 1], [8.5, 2.5], [8.5, 12.5], [7, 14], [2, 14], [0.5, 12.5], [0.5, 2.5]];

  var COURSES = [
    { id: 'c1', n: ['定規の作業台', 'Ruler Bench'], d: ['まっすぐ・曲がり角・坂・ばね・おがくず。まずはここから', 'Straights, corners, slopes, springs and sawdust. Start here'] },
    { id: 'c2', n: ['歯車の機械室', 'Gear Room'], d: ['回る歯車とすべる定規。タイミングと、ひとっとびのパイプ', 'Spinning gears and sliding rulers. Timing, and pipes that whisk you away'] },
    { id: 'c3', n: ['インク工房', 'Ink Studio'], d: ['インクだまりに落ちると罰打1。坂とパイプもからむ上級コース', 'Fall in the ink and it costs a stroke. Slopes and pipes too — for experts'] },
  ];

  var H = [
    // ===== コース1：定規の作業台 =====
    { id: '1-1', n: ['まっすぐ定規', 'Straight Edge'], par: 2, poly: R(2, 1, 7, 14), tee: [4.5, 12.2], cup: [4.5, 3],
      tip: ['まっすぐ打って、カップへ', 'Straight down the ruler to the cup'] },
    { id: '1-2', n: ['三角定規', 'Set Square'], par: 3, poly: [[1, 1], [8, 1], [8, 4.5], [4.5, 4.5], [4.5, 14], [1, 14]], tee: [2.75, 12.5], cup: [6.6, 2.75],
      tip: ['かべに当てて、角を曲がろう', 'Bank it off the wall to turn the corner'] },
    { id: '1-3', n: ['ゆるい坂', 'Gentle Slope'], par: 2, poly: R(2, 1, 7, 14), tee: [4.5, 12.5], cup: [4.5, 3],
      slopes: [{ p: R(2, 5.5, 7, 9), g: [0, 2.6] }], posts: [[3.6, 7.2, 0.32]],
      tip: ['のぼり坂。少し強めに', 'Uphill — hit it a bit harder'] },
    { id: '1-4', n: ['ばねの林', 'Spring Grove'], par: 3, poly: R(1, 1, 8, 14), tee: [4.5, 12.5], cup: [4.5, 2.6],
      bumpers: [[3, 9, 0.45], [6, 9, 0.45], [4.5, 6.5, 0.45], [2.6, 4.5, 0.4], [6.4, 4.5, 0.4]],
      tip: ['ばねに当たると、強くはね返る', 'Springs bounce the ball back hard'] },
    { id: '1-5', n: ['おがくずの道', 'Sawdust Path'], par: 3, poly: R(1, 1, 8, 14), tee: [2.5, 12.5], cup: [6.5, 2.5],
      blocks: [R(1, 9, 5.5, 9.6), R(3.5, 5, 8, 5.6)], sand: [R(1, 1, 3.5, 3.5), R(5.5, 6.6, 8, 8.2)],
      tip: ['おがくずの上では、球がすぐ止まる', 'Sawdust stops the ball quickly'] },
    { id: '1-6', n: ['すべる定規', 'Sliding Ruler'], par: 2, poly: R(2, 1, 7, 14), tee: [4.5, 12.5], cup: [4.5, 3],
      rulers: [{ a: [3.8, 7.5], b: [5.2, 7.5], len: 2.4, ang: 0, per: 3, ph: 0 }],
      tip: ['定規が動いている。すきまを見て打とう', 'The ruler slides — wait for the gap'] },
    { id: '1-7', n: ['クランク', 'Crank'], par: 3, poly: [[1, 1], [8, 1], [8, 5], [4, 5], [4, 10], [8, 10], [8, 14], [1, 14]], tee: [6.5, 12.5], cup: [6.5, 2.6],
      posts: [[2.5, 7.5, 0.3]],
      tip: ['2回曲がる。かべを使おう', 'Two turns. Use the walls'] },
    { id: '1-8', n: ['てっぺんのカップ', 'Hilltop'], par: 3, poly: R(1, 1, 8, 14), tee: [4.5, 12.5], cup: [4.5, 4.5],
      slopes: [{ p: R(2.5, 2.5, 6.5, 3.8), g: [0, -2.4] }, { p: R(2.5, 5.2, 6.5, 6.5), g: [0, 2.4] }, { p: R(2.5, 3.8, 3.8, 5.2), g: [-2.4, 0] }, { p: R(5.2, 3.8, 6.5, 5.2), g: [2.4, 0] }],
      tip: ['カップは丘のてっぺん。強すぎると転がり落ちる', 'The cup sits on a hill. Too hard and it rolls off'] },
    { id: '1-9', n: ['定規の大通り', 'Ruler Avenue'], par: 4, poly: R(1, 1, 8, 15), tee: [4.5, 13.8], cup: [4.5, 2.2],
      rulers: [{ a: [3, 9], b: [6, 9], len: 2.2, ang: 0, per: 2.8, ph: 0 }], slopes: [{ p: R(1, 10, 8, 12), g: [0, 2] }],
      bumpers: [[2.3, 5.5, 0.4], [6.7, 5.5, 0.4], [4.5, 4.4, 0.4]], sand: [R(1, 1, 2.8, 3), R(6.2, 1, 8, 3)],
      tip: ['坂・定規・ばね。ここまでの総まとめ', 'Slope, ruler and springs — everything so far'] },

    // ===== コース2：歯車の機械室 =====
    { id: '2-1', n: ['はじめての歯車', 'First Gear'], par: 3, poly: R(1.5, 1, 7.5, 14), tee: [4.5, 12.5], cup: [4.5, 2.8],
      gears: [{ x: 4.5, y: 7.5, r: 2.4, arms: 4, w: 1.2, ph: 0.3 }],
      tip: ['歯車の腕が回っている。すきまを通そう', 'The gear arms spin. Slip through a gap'] },
    { id: '2-2', n: ['パイプ', 'Pipe Ride'], par: 2, poly: R(1, 1, 8, 14), tee: [4.5, 12.5], cup: [6, 3],
      blocks: [R(1, 7, 8, 8)], pipes: [{ a: [6.5, 9.4], b: [2.2, 5.6], d: -40 }],
      tip: ['パイプに入ると、向こうの口から出てくる', 'Roll into the pipe and it pops out the other end'] },
    { id: '2-3', n: ['ふたつの歯車', 'Twin Gears'], par: 3, poly: R(1, 1, 8, 15), tee: [4.5, 13.5], cup: [4.5, 2.5],
      gears: [{ x: 3.2, y: 10, r: 1.5, arms: 3, w: 1.6, ph: 0 }, { x: 5.8, y: 5.5, r: 1.5, arms: 3, w: -1.4, ph: 0.5 }],
      tip: ['ふたつの歯車は、反対向きに回る', 'The two gears turn opposite ways'] },
    { id: '2-4', n: ['ばねのピンボール', 'Spring Pinball'], par: 3, poly: OCT, tee: [4.5, 12.8], cup: [4.5, 2.4],
      bumpers: [[2.5, 4, 0.45], [6.5, 4, 0.45], [4.5, 6, 0.5], [2.5, 8.5, 0.45], [6.5, 8.5, 0.45], [4.5, 10.5, 0.4]],
      tip: ['ばねだらけ。弱めに打つと読みやすい', 'Springs everywhere. Softer shots are easier to read'] },
    { id: '2-5', n: ['坂の上の歯車', 'Gear on the Hill'], par: 3, poly: R(1.5, 1, 7.5, 14), tee: [4.5, 12.5], cup: [4.5, 2.2],
      slopes: [{ p: R(1.5, 7.5, 7.5, 11), g: [0, 2.2] }], gears: [{ x: 4.5, y: 5, r: 1.9, arms: 2, w: 1.3, ph: 0 }],
      tip: ['坂をのぼって、回る板をよけよう', 'Climb the slope and dodge the spinning bar'] },
    { id: '2-6', n: ['ふたつのパイプ', 'Two Pipes'], par: 3, poly: R(1, 1, 8, 15), tee: [4.5, 13.5], cup: [4.5, 2.5],
      blocks: [R(1, 7.5, 8, 8.3)], posts: [[4.5, 10.5, 0.35]], sand: [R(5.5, 4.6, 8, 7.5)],
      pipes: [{ a: [2.5, 9.6], b: [6.8, 6.9], d: -90 }, { a: [6.5, 9.6], b: [1.6, 3], d: 0 }],
      tip: ['どちらのパイプが近道？', 'Which pipe is the shortcut?'] },
    { id: '2-7', n: ['歯車のすきま', 'Gear Gap'], par: 3, poly: R(1, 1, 8, 14), tee: [4.5, 12.5], cup: [4.5, 2.4],
      blocks: [R(1, 6.5, 3.5, 7.2), R(5.5, 6.5, 8, 7.2)], gears: [{ x: 4.5, y: 4.9, r: 1.2, arms: 4, w: 1.8, ph: 0.4 }],
      tip: ['せまい門のすぐ先に歯車', 'A gear waits just past the narrow gate'] },
    { id: '2-8', n: ['定規の門', 'Ruler Gates'], par: 3, poly: R(1.5, 1, 7.5, 15), tee: [4.5, 13.5], cup: [4.5, 2.5],
      rulers: [{ a: [3.2, 10], b: [5.8, 10], len: 2.4, ang: 0, per: 2.4, ph: 0 }, { a: [5.8, 6], b: [3.2, 6], len: 2.4, ang: 0, per: 3, ph: 0.25 }],
      posts: [[3, 3.6, 0.3], [6, 3.6, 0.3]],
      tip: ['2本の定規が、ちがう速さで動く', 'Two rulers slide at different speeds'] },
    { id: '2-9', n: ['大歯車', 'Great Gear'], par: 4, poly: R(0.5, 1, 8.5, 15), tee: [4.5, 13.8], cup: [3, 2.6],
      gears: [{ x: 4.5, y: 8, r: 3.2, arms: 6, w: 0.9, ph: 0 }], pipes: [{ a: [1.4, 13.8], b: [7.6, 3.6], d: 180 }], bumpers: [[6.8, 2.2, 0.4]],
      tip: ['歯車をくぐるか、すみのパイプか', 'Through the great gear, or the pipe in the corner'] },

    // ===== コース3：インク工房 =====
    { id: '3-1', n: ['インクだまり', 'Ink Puddle'], par: 3, poly: R(1, 1, 8, 14), tee: [4.5, 12.5], cup: [4.5, 2.8],
      ink: [[[3.2, 6], [5.8, 6], [6.5, 7], [6.5, 8.5], [5.8, 9.5], [3.2, 9.5], [2.5, 8.5], [2.5, 7]]], posts: [[6.9, 5.4, 0.35]],
      tip: ['インクに入ると罰打1。まわりこもう', 'The ink costs a stroke. Go around it'] },
    { id: '3-2', n: ['インクの橋', 'Ink Bridge'], par: 3, poly: R(1, 1, 8, 15), tee: [4.5, 13.5], cup: [4.5, 2.5],
      ink: [R(1, 5, 3.7, 11), R(5.3, 5, 8, 11)], slopes: [{ p: R(3.7, 7, 5.3, 9), g: [1.2, 0] }],
      tip: ['細い橋は、少し右にかたむいている', 'The narrow bridge leans a little to the right'] },
    { id: '3-3', n: ['インクへの坂', 'Slope to the Ink'], par: 3, poly: R(1, 1, 8, 14), tee: [3, 12.5], cup: [3.5, 2.5],
      slopes: [{ p: R(1, 4.5, 8, 10), g: [1.9, 0] }], ink: [R(6.6, 4.5, 8, 10)],
      tip: ['坂が右のインクへ引っぱる。左をねらおう', 'The slope pulls toward the ink. Aim left'] },
    { id: '3-4', n: ['パイプでひとっとび', 'Pipe Hop'], par: 2, poly: R(1, 1, 8, 15), tee: [4.5, 13.5], cup: [6, 2.6],
      ink: [R(1, 6, 8, 10)], pipes: [{ a: [6.5, 11.6], b: [2, 5.3], d: -45 }], posts: [[4.5, 3.6, 0.3]],
      tip: ['インクの向こうへは、パイプで', 'Only the pipe crosses the ink'] },
    { id: '3-5', n: ['ばねとインク', 'Springs and Ink'], par: 3, poly: OCT, tee: [4.5, 12.8], cup: [4.5, 2.6],
      ink: [R(3.6, 7, 5.4, 8.6)], bumpers: [[2.6, 7.8, 0.45], [6.4, 7.8, 0.45], [4.5, 5.2, 0.45]],
      tip: ['ばねではね返って、インクに落ちないように', 'Don\'t let a spring bounce you into the ink'] },
    { id: '3-6', n: ['歯車とインク', 'Gear over Ink'], par: 3, poly: R(1.5, 1, 7.5, 14), tee: [4.5, 12.5], cup: [4.5, 2.5],
      gears: [{ x: 4.5, y: 6.5, r: 2.2, arms: 3, w: 1.4, ph: 0 }], ink: [R(1.5, 4.6, 2.3, 8.4), R(6.7, 4.6, 7.5, 8.4)],
      tip: ['わきはインク。歯車の中を通そう', 'Ink on both sides. Thread the gear'] },
    { id: '3-7', n: ['定規の橋', 'Ruler Bridge'], par: 3, poly: R(1, 1, 8, 15), tee: [4.5, 13.5], cup: [4.5, 3],
      ink: [R(1, 7, 3.8, 9), R(5.2, 7, 8, 9)], rulers: [{ a: [3, 10.4], b: [6, 10.4], len: 1.8, ang: 0, per: 2.6, ph: 0 }],
      bumpers: [[2.5, 4.5, 0.4], [6.5, 4.5, 0.4]],
      tip: ['定規にはじかれると、インクへまっさかさま', 'A ruler bump can send you into the ink'] },
    { id: '3-8', n: ['インクの迷路', 'Ink Maze'], par: 4, poly: R(1, 1, 8, 15), tee: [2.5, 13.5], cup: [2.5, 2.2],
      blocks: [R(1, 11, 5.6, 11.6), R(3.4, 7.2, 8, 7.8), R(1, 3.6, 5.6, 4.2)], ink: [R(5.8, 8.4, 8, 9.4), R(1, 4.2, 2, 5.2)], sand: [R(6.4, 1, 8, 2.6)],
      tip: ['3回曲がる迷路。インクとおがくずに注意', 'A maze with three turns. Mind the ink and sawdust'] },
    { id: '3-9', n: ['親方の机', "Master's Desk"], par: 4, poly: R(0.5, 1, 8.5, 15.5), tee: [4.5, 14.2], cup: [5.5, 2.5],
      gears: [{ x: 4.5, y: 8.6, r: 1.8, arms: 4, w: 1.2, ph: 0 }], ink: [R(0.5, 7.2, 2.2, 10.2), R(6.8, 7.2, 8.5, 10.2)],
      rulers: [{ a: [3, 12], b: [6, 12], len: 1.6, ang: 0, per: 2.2, ph: 0 }], pipes: [{ a: [1.4, 14.4], b: [7.6, 5.2], d: -150 }],
      bumpers: [[2.2, 3, 0.4]], slopes: [{ p: R(0.5, 3.6, 8.5, 5.8), g: [0, 1.4] }],
      tip: ['最後のホール。ぜんぶ使って', 'The final hole. Everything at once'] },
  ];
  H.forEach(function (h, i) { h.index = i; h.course = Math.floor(i / 9); h.no = i % 9 + 1; });

  var api = { COURSES: COURSES, HOLES: H };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MinigolfHoles = H; root.MinigolfCourses = COURSES;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
