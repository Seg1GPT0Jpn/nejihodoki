// ころがし工房ゴルフ：22のコース × 9ホール（5つの段）。1〜3は手で作ったホール、4から先は minigolf/holes-gen.js。座標は「マス」（y は下向き）。形の決まりは minigolf/engine.js の先頭。
//   poly      フェルトの外わく（閉じた多角形。まわりは木の壁）
//   blocks    中の木のブロック（閉じた多角形） / walls  中の板（折れ線）
//   posts     インクびん・くい [x, y, 半径]（はね返りは弱い） / bumpers  ばね [x, y, 半径]（強くはじく）
//   sand      おがくず（よく止まる） / ink  インクだまり（入ると罰打1、打つ前の場所へ） / slopes  坂 { p: 多角形, g: [gx, gy]（マス/秒²） }
//   gears     回る歯車 { x, y, r（腕の長さ）, arms, w（回る速さ rad/秒。マイナスは逆回り）, ph }
//   rulers    すべる定規 { a, b（中心が行き来する両端）, len, ang（向き。度）, per（往復の秒数）, ph（0〜1） }
//   pipes     パイプ { a（入り口）, b（出口）, d（出る向き。度） }
//   doors     扉（閉じた多角形。スイッチで開くまでかべ） / switches  スイッチ [x, y, 半径, 開く扉のビット（なし＝ぜんぶ）]
//   gates     はね戸 { a, b, d（通れる向き。度） }
//   tee, cup, par, tip（最初に出る一言）
// 全ホールの確かめた答えは tools/tests/minigolf-solutions.js（tools/tests/minigolf-levels.js がパー以内に入ることを確かめる）。
(function (root) {
  'use strict';
  var R = function (x0, y0, x1, y1) { return [[x0, y0], [x1, y0], [x1, y1], [x0, y1]]; };
  var OCT = [[2, 1], [7, 1], [8.5, 2.5], [8.5, 12.5], [7, 14], [2, 14], [0.5, 12.5], [0.5, 2.5]];

  var COURSES = [
    { id: 'c1', n: ['定規の作業台', 'Ruler Bench'], d: ['まっすぐ・曲がり角・坂・ばね・おがくず。まずはここから', 'Straights, corners, slopes, springs and sawdust. Start here'] },
    { id: 'c2', n: ['歯車の機械室', 'Gear Room'], d: ['回る歯車とすべる定規。タイミングと、ひとっとびのパイプ', 'Spinning gears and sliding rulers. Timing, and pipes that whisk you away'] },
    { id: 'c3', n: ['インク工房', 'Ink Studio'], d: ['インクだまりに落ちると罰打1。坂とパイプもからむ', 'Fall in the ink and it costs a stroke. Slopes and pipes too'] },
    // ここから下は tools/minigolf-gen.js が部品を組み合わせて作ったホール（minigolf/holes-gen.js）。id はずっと同じ。新しいコースは後ろに足す
    { id: 'c4', n: ['せまい戸口', 'Narrow Doors'], d: ['仕切りのすきまを、かべに当ててくぐる', 'Bank through the gaps in the partitions'] },
    { id: 'c5', n: ['スイッチの扉', 'Switch Doors'], d: ['赤いスイッチの上を通ると、扉が開く', 'Roll over the red switch to open the door'] },
    { id: 'c6', n: ['はね戸の坂', 'Flap Gates'], d: ['はね戸は矢印の向きにしか通れない', 'Flap gates only open the way the arrows point'] },
    { id: 'c7', n: ['インクの川', 'Ink Rivers'], d: ['細い橋をわたって、インクの川をこえる', 'Cross the ink rivers on narrow bridges'] },
    { id: 'c8', n: ['歯車の回廊', 'Gear Corridor'], d: ['回る腕のすきまを、続けてくぐる', 'Slip through spinning arms, one after another'] },
    { id: 'c9', n: ['定規の関所', 'Ruler Checkpoints'], d: ['すべる定規が戸口をふさぐ。打つ時を読む', 'Sliding rulers block the doors. Time your shot'] },
    { id: 'c10', n: ['パイプの迷路', 'Pipe Maze'], d: ['どのパイプがどこへ出るか', 'Which pipe comes out where?'] },
    { id: 'c11', n: ['インクへの坂', 'Slopes to the Ink'], d: ['坂がインクへ引っぱる。強さが命', 'Slopes drag you to the ink. Power is everything'] },
    { id: 'c12', n: ['ばねの部屋', 'Spring Rooms'], d: ['ばねにはじかれて、インクのそばを通る', 'Springs fling you past the ink'] },
    { id: 'c13', n: ['からくり部屋', 'Contraption Room'], d: ['スイッチ・はね戸・歯車がいっしょに', 'Switches, flaps and gears together'] },
    { id: 'c14', n: ['夜の作業台', 'Night Bench'], d: ['せまい橋と、ばねと、はね戸', 'Narrow bridges, springs and flap gates'] },
    { id: 'c15', n: ['銅管の森', 'Copper Woods'], d: ['パイプと坂の組み合わせ', 'Pipes meet slopes'] },
    { id: 'c16', n: ['墨流し', 'Marbled Ink'], d: ['インクのあいだを、何度も曲がる', 'Weave between the ink, again and again'] },
    { id: 'c17', n: ['名工の試験', "Master's Exam"], d: ['ここまでのすべて', 'Everything so far'] },
    { id: 'c18', n: ['針の穴', 'Eye of the Needle'], d: ['球ひとつぶんの戸口', 'Doors barely wider than the ball'] },
    { id: 'c19', n: ['大時計', 'Great Clock'], d: ['歯車と定規のタイミング', 'Gears and rulers, timing is all'] },
    { id: 'c20', n: ['インクの海', 'Sea of Ink'], d: ['陸地はほんの少し', 'Hardly any dry felt'] },
    { id: 'c21', n: ['親方の迷宮', "Master's Labyrinth"], d: ['スイッチとパイプの長い道', 'A long road of switches and pipes'] },
    { id: 'c22', n: ['工房の頂', 'Workshop Summit'], d: ['最後の9ホール', 'The final nine'] },
  ];
  // 段（tier）：コースのまとまり。先の段ほどむずかしい（tools/tests/minigolf-levels.js が人のまねで確かめる）
  var TIERS = [
    { n: ['見習い', 'Apprentice'], from: 0, to: 2 },
    { n: ['職人', 'Journeyman'], from: 3, to: 6 },
    { n: ['熟練', 'Craftsman'], from: 7, to: 11 },
    { n: ['名工', 'Master'], from: 12, to: 16 },
    { n: ['親方', 'Grandmaster'], from: 17, to: 21 },
  ];
  COURSES.forEach(function (c, k) { for (var t = 0; t < TIERS.length; t++) if (k >= TIERS[t].from && k <= TIERS[t].to) c.tier = t + 1; });

  var H = [
    // ===== コース1：定規の作業台 =====
    { id: '1-1', n: ['まっすぐ定規', 'Straight Edge'], par: 2, poly: R(2, 1, 7, 14), tee: [4.5, 12.2], cup: [4.5, 3],
      tip: ['まっすぐ打って、カップへ', 'Straight down the ruler to the cup'] },
    { id: '1-2', n: ['三角定規', 'Set Square'], par: 3, poly: [[1, 1], [8, 1], [8, 4.5], [4.5, 4.5], [4.5, 14], [1, 14]], tee: [2.75, 12.5], cup: [6.6, 2.75],
      tip: ['かべに当てて、角を曲がろう', 'Bank it off the wall to turn the corner'] },
    { id: '1-3', n: ['ゆるい坂', 'Gentle Slope'], par: 3, poly: R(2, 1, 7, 14), tee: [4.5, 12.5], cup: [4.5, 3], blocks: [R(3.85, 3.7, 5.15, 4)],
      slopes: [{ p: R(2, 5.5, 7, 9), g: [0, 2.6] }], posts: [[3.6, 7.2, 0.32]],
      tip: ['のぼり坂。少し強めに', 'Uphill — hit it a bit harder'] },
    { id: '1-4', n: ['ばねの林', 'Spring Grove'], par: 3, poly: R(1, 1, 8, 14), tee: [4.5, 12.5], cup: [4.5, 2.6], blocks: [R(3.85, 3.3, 5.15, 3.6)],
      bumpers: [[3, 9, 0.45], [6, 9, 0.45], [4.5, 6.5, 0.45], [2.6, 4.5, 0.4], [6.4, 4.5, 0.4]],
      tip: ['ばねに当たると、強くはね返る', 'Springs bounce the ball back hard'] },
    { id: '1-5', n: ['おがくずの道', 'Sawdust Path'], par: 3, poly: R(1, 1, 8, 14), tee: [2.5, 12.5], cup: [6.5, 2.5],
      blocks: [R(1, 9, 5.5, 9.6), R(3.5, 5, 8, 5.6)], sand: [R(1, 1, 3.5, 3.5), R(5.5, 6.6, 8, 8.2)],
      tip: ['おがくずの上では、球がすぐ止まる', 'Sawdust stops the ball quickly'] },
    { id: '1-6', n: ['すべる定規', 'Sliding Ruler'], par: 3, poly: R(2, 1, 7, 14), tee: [4.5, 12.5], cup: [4.5, 3], blocks: [R(3.85, 3.7, 5.15, 4)],
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
    { id: '2-2', n: ['パイプ', 'Pipe Ride'], par: 3, poly: R(1, 1, 8, 14), tee: [4.5, 12.5], cup: [6, 3],
      blocks: [R(1, 7, 8, 8)], pipes: [{ a: [6.5, 9.4], b: [2.2, 5.6], d: -40 }],
      tip: ['パイプに入ると、向こうの口から出てくる', 'Roll into the pipe and it pops out the other end'] },
    { id: '2-3', n: ['ふたつの歯車', 'Twin Gears'], par: 3, poly: R(1, 1, 8, 15), tee: [4.5, 13.5], cup: [4.5, 2.5], blocks: [R(3.85, 3.2, 5.15, 3.5)],
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
    { id: '2-8', n: ['定規の門', 'Ruler Gates'], par: 3, poly: R(1.5, 1, 7.5, 15), tee: [4.5, 13.5], cup: [4.5, 2.5], blocks: [R(3.85, 3.2, 5.15, 3.5)],
      rulers: [{ a: [3.2, 10], b: [5.8, 10], len: 2.4, ang: 0, per: 2.4, ph: 0 }, { a: [5.8, 6], b: [3.2, 6], len: 2.4, ang: 0, per: 3, ph: 0.25 }],
      posts: [[3, 3.6, 0.3], [6, 3.6, 0.3]],
      tip: ['2本の定規が、ちがう速さで動く', 'Two rulers slide at different speeds'] },
    { id: '2-9', n: ['大歯車', 'Great Gear'], par: 4, poly: R(0.5, 1, 8.5, 15), tee: [4.5, 13.8], cup: [3, 2.6],
      gears: [{ x: 4.5, y: 8, r: 3.2, arms: 6, w: 0.9, ph: 0 }], pipes: [{ a: [1.4, 13.8], b: [7.6, 3.6], d: 180 }], bumpers: [[6.8, 2.2, 0.4]],
      tip: ['歯車をくぐるか、すみのパイプか', 'Through the great gear, or the pipe in the corner'] },

    // ===== コース3：インク工房 =====
    { id: '3-1', n: ['インクだまり', 'Ink Puddle'], par: 3, poly: R(1, 1, 8, 14), tee: [4.5, 12.5], cup: [4.5, 2.8], blocks: [R(3.85, 3.5, 5.15, 3.8)],
      ink: [[[3.2, 6], [5.8, 6], [6.5, 7], [6.5, 8.5], [5.8, 9.5], [3.2, 9.5], [2.5, 8.5], [2.5, 7]]], posts: [[6.9, 5.4, 0.35]],
      tip: ['インクに入ると罰打1。まわりこもう', 'The ink costs a stroke. Go around it'] },
    { id: '3-2', n: ['インクの橋', 'Ink Bridge'], par: 3, poly: R(1, 1, 8, 15), tee: [4.5, 13.5], cup: [4.5, 2.5],
      ink: [R(1, 5, 3.7, 11), R(5.3, 5, 8, 11)], slopes: [{ p: R(3.7, 7, 5.3, 9), g: [1.2, 0] }],
      tip: ['細い橋は、少し右にかたむいている', 'The narrow bridge leans a little to the right'] },
    { id: '3-3', n: ['インクへの坂', 'Slope to the Ink'], par: 3, poly: R(1, 1, 8, 14), tee: [3, 12.5], cup: [3.5, 2.5], blocks: [R(2.85, 3.2, 4.15, 3.5)],
      slopes: [{ p: R(1, 4.5, 8, 10), g: [1.9, 0] }], ink: [R(6.6, 4.5, 8, 10)],
      tip: ['坂が右のインクへ引っぱる。左をねらおう', 'The slope pulls toward the ink. Aim left'] },
    { id: '3-4', n: ['パイプでひとっとび', 'Pipe Hop'], par: 3, poly: R(1, 1, 8, 15), tee: [4.5, 13.5], cup: [6, 2.6],
      ink: [R(1, 6, 8, 10)], pipes: [{ a: [6.5, 11.6], b: [2, 5.3], d: -45 }], posts: [[4.5, 3.6, 0.3]],
      tip: ['インクの向こうへは、パイプで', 'Only the pipe crosses the ink'] },
    { id: '3-5', n: ['ばねとインク', 'Springs and Ink'], par: 3, poly: OCT, tee: [4.5, 12.8], cup: [4.5, 2.6], blocks: [R(3.85, 3.3, 5.15, 3.6)],
      ink: [R(3.6, 7, 5.4, 8.6)], bumpers: [[2.6, 7.8, 0.45], [6.4, 7.8, 0.45], [4.5, 5.2, 0.45]],
      tip: ['ばねではね返って、インクに落ちないように', 'Don\'t let a spring bounce you into the ink'] },
    { id: '3-6', n: ['歯車とインク', 'Gear over Ink'], par: 3, poly: R(1.5, 1, 7.5, 14), tee: [4.5, 12.5], cup: [4.5, 2.5],
      gears: [{ x: 4.5, y: 6.5, r: 2.2, arms: 3, w: 1.4, ph: 0 }], ink: [R(1.5, 4.6, 2.3, 8.4), R(6.7, 4.6, 7.5, 8.4)],
      tip: ['わきはインク。歯車の中を通そう', 'Ink on both sides. Thread the gear'] },
    { id: '3-7', n: ['定規の橋', 'Ruler Bridge'], par: 3, poly: R(1, 1, 8, 15), tee: [4.5, 13.5], cup: [4.5, 3],
      ink: [R(1, 7, 3.8, 9), R(5.2, 7, 8, 9)], rulers: [{ a: [3, 10.4], b: [6, 10.4], len: 1.8, ang: 0, per: 2.6, ph: 0 }],
      bumpers: [[2.5, 4.5, 0.4], [6.5, 4.5, 0.4]],
      tip: ['定規にはじかれると、インクへまっさかさま', 'A ruler bump can send you into the ink'] },
    { id: '3-8', n: ['インクの迷路', 'Ink Maze'], par: 5, poly: R(1, 1, 8, 15), tee: [2.5, 13.5], cup: [2.5, 2.2],
      blocks: [R(1, 11, 5.6, 11.6), R(3.4, 7.2, 8, 7.8), R(1, 3.6, 5.6, 4.2)], ink: [R(5.8, 8.4, 8, 9.4), R(1, 4.2, 2, 5.2)], sand: [R(6.4, 1, 8, 2.6)],
      tip: ['3回曲がる迷路。インクとおがくずに注意', 'A maze with three turns. Mind the ink and sawdust'] },
    { id: '3-9', n: ['親方の机', "Master's Desk"], par: 4, poly: R(0.5, 1, 8.5, 15.5), tee: [4.5, 14.2], cup: [5.5, 2.5],
      gears: [{ x: 4.5, y: 8.6, r: 1.8, arms: 4, w: 1.2, ph: 0 }], ink: [R(0.5, 7.2, 2.2, 10.2), R(6.8, 7.2, 8.5, 10.2)],
      rulers: [{ a: [3, 12], b: [6, 12], len: 1.6, ang: 0, per: 2.2, ph: 0 }], pipes: [{ a: [1.4, 14.4], b: [7.6, 5.2], d: -150 }],
      bumpers: [[2.2, 3, 0.4]], slopes: [{ p: R(0.5, 3.6, 8.5, 5.8), g: [0, 1.4] }],
      tip: ['最後のホール。ぜんぶ使って', 'The final hole. Everything at once'] },
  ];
  // 作ったホール（holes-gen.js。ブラウザでは先に読みこむ）
  var GEN = typeof module !== 'undefined' && module.exports && typeof require === 'function' ? require('./holes-gen.js') : root.MinigolfGenHoles || [];
  H = H.concat(GEN);
  // コースとホールの番号は id（<コース>-<番号>）から。9ホールそろったコースだけ遊べる（まだのコースは「準備中」）
  H.forEach(function (h, i) { var p = h.id.split('-'); h.index = i; h.course = Number(p[0]) - 1; h.no = Number(p[1]); });
  COURSES.forEach(function (c, k) { c.ready = H.filter(function (h) { return h.course === k; }).length === 9; });
  H.forEach(function (h) { if (!h.tip) h.tip = COURSES[h.course].d; });

  var api = { COURSES: COURSES, HOLES: H, TIERS: TIERS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MinigolfHoles = H; root.MinigolfCourses = COURSES; root.MinigolfTiers = TIERS;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
