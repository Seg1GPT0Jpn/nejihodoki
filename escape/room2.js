// からくり工房からの脱出：部屋2「時計の間」
// なぞ：机の引き出し（小さな歯車）・じゅうたん（大きな歯車）・鳩時計の戸棚（文字盤の記号を12時から時計回り）→ 中くらいの歯車と時計の鍵
//       → 歯車の板（となりとかみ合う大きさ：大・小・中）→ 写真（8時15分）→ 柱時計の針 → 振り子の扉 → 扉の鍵
(function (root) {
  'use strict';
  const ER = root.EscapeRooms;
  if (root.KoboI18n) KoboI18n.add({ en: {
    '時計の間': 'The Clock Room',
    '時計の間。壁ぎわの大きな柱時計は止まったまま。親方は、時計のからくりが何より得意だった。': 'The clock room. The tall clock by the wall has stopped. Clockwork was always the Master\'s favourite craft.',
    '時計が8時15分を指すと、振り子の扉がひらいた。親方が弟子入りした朝の時刻だ。扉の鍵で、次の部屋へ。': 'When the clock shows 8:15 the pendulum door swings open — the morning the Master became an apprentice. The door key leads on to the next room.',
    '親方の日記\n\nこの柱時計は、わしが弟子入りした朝の時刻で止めてある。あの朝の写真は、歯車のからくりの中にしまっておいた。\n\n歯車は、となりとぴったりかみ合う大きさでないと回らない。': 'The Master\'s diary\n\nI stopped this tall clock at the time of the morning I became an apprentice. I keep the photo of that morning inside the gear machine.\n\nA gear only turns when it meshes exactly with its neighbours.',
    '小さな歯車': 'Small gear', '中くらいの歯車': 'Medium gear', '大きな歯車': 'Large gear', '真ちゅうの歯車。大きさがちがうものが3つある': 'A brass gear. There are three of different sizes',
    '時計の鍵': 'Clock key', '小さな鍵。時計の部品のような形': 'A small key shaped like a clock part',
    '古い写真': 'Old photo', '若い親方が、柱時計の横で笑っている': 'The young Master smiling beside the tall clock',
    '扉の鍵': 'Door key', '時計の間の扉の鍵': 'The key to the clock room door',
    '机の引き出し': 'The desk drawer', '床のじゅうたん': 'The rug', '鳩時計の戸棚のボタン': 'The buttons of the cuckoo cabinet', '歯車の板': 'The gear board', '柱時計の針': 'The tall clock\'s hands', '時計の間の扉': 'The clock room door',
    '机の上と引き出しを調べよう': 'Look at the desk top and its drawer', '引き出しは取っ手をタップすると開く': 'Tap the handle to open the drawer', '机に近づき、引き出しをタップ。中に小さな歯車': 'Go closer to the desk and tap the drawer. A small gear is inside',
    '机の前のじゅうたんの角がめくれている': 'A corner of the rug in front of the desk is turned up', 'めくれた角の下に何かある': 'Something is under that corner', '机の壁で、じゅうたんの右の角をタップ': 'On the desk wall, tap the right corner of the rug',
    '戸棚の上の札には、時計と矢印の絵': 'The plate on the cabinet shows a clock and an arrow', '柱時計の文字盤の、12・3・6・9の位置に記号がある': 'The tall clock\'s face has symbols at 12, 3, 6 and 9',
    '12時から時計回り：星→太陽→雲→月の順に押す': 'Clockwise from 12: press star → sun → cloud → moon',
    '3本の軸に、3つの歯車をはめる': 'Put the three gears on the three pegs', 'となりの歯車とぴったりかみ合う大きさを選ぶ。重なると赤、すき間があるとうすく光る': 'Pick sizes that mesh exactly with their neighbours. Overlaps turn red, gaps glow faintly',
    'ハンドルのとなりに大、まん中に小、オルゴールのとなりに中。はめたらハンドルを回す': 'Large next to the crank, small in the middle, medium next to the music drum. Then turn the crank',
    '文字盤のガラスには鍵穴がある。合わせる時刻は、日記と写真に': 'The glass over the face has a keyhole. The time to set is in the diary and the photo',
    '時計の鍵でガラスを開けて、写真の時刻に合わせる': 'Open the glass with the clock key and set the time in the photo',
    '写真の時計は8時15分。長い針のつまみ（左）で15分、短い針のつまみ（右）で8時に': 'The clock in the photo shows 8:15. Use the long-hand knob (left) for :15 and the short-hand knob (right) for 8',
    '鍵ができたら、どこに使う？': 'Now you have a key — where does it go?', '扉の鍵を選んで、扉をタップ': 'Select the door key and tap the door', '扉の鍵は、振り子の扉の中': 'The door key is behind the pendulum door',
    '扉には鍵がかかっている': 'The door is locked', '止まった柱時計。文字盤に記号が4つ': 'A stopped tall clock. The face has four symbols',
    '振り子の扉は固く閉まっている。写真機の絵が彫られた札がある': 'The pendulum door is shut tight. A plate on it shows a camera',
    '文字盤はガラスでおおわれている。下に小さな鍵穴': 'The face is behind glass. There is a small keyhole below', 'ガラスのふたが開いた': 'The glass cover opens',
    'カチッ…下の方で音がした': 'Click… something moved down below', '振り子が静かにゆれている': 'The pendulum swings quietly',
    '歯車をはめる軸だ': 'A peg for a gear', 'ガタッ…歯車がうまくかみ合っていない': 'Clunk… the gears don\'t mesh', 'ハンドル。回すとオルゴールが鳴りそうだ': 'A crank. Turning it should play the music drum',
    '歯車が回り、オルゴールが鳴った！ 小さな扉が開いた': 'The gears turn and the music drum plays! A little hatch opens',
    'からっぽの小箱': 'An empty little box', '戸棚の扉が開いた！': 'The cabinet doors open!', 'カタン。何も起きない…押す順番がちがうようだ': 'Clack. Nothing happens… the order seems wrong',
    '机の上に、日記が開いてある': 'A diary lies open on the desk', 'じゅうたんの下には何もない': 'Nothing else under the rug',
    'ランプの光があたたかい': 'The lamp gives a warm light', '小さな絵。星空の下の工房': 'A small painting: the workshop under the stars',
    '外はしずかな夜': 'A quiet night outside', 'こむぎが椅子の上で眠っている': 'Komugi is asleep on the chair',
  } });

  ER.defs[1] = (K, A, H) => {
    const T = K.T, { spot, circ } = H;
    const PAL = { wall: '#4f6b4a', wall2: '#3c5538', pattern: 'diamond', wains: '#5a3a22', floor: '#6b4226', fy: 232 };
    const end = c => A.vignette(c, 0.45);
    const meow = () => { K.tone(760, 0.16, { type: 'triangle', vol: 0.06, slide: 520 }); };
    const FACE = { 0: 'star', 3: 'sun', 6: 'cloud', 9: 'moon' }; // symbol at 12, 3, 6, 9 o'clock
    const SYMCOL = { star: '#ffd84a', sun: '#f0903a', cloud: '#e8eef6', moon: '#f6e6a0' };
    function clockFace(c, x, y, r, h, m, o) {
      o = o || {};
      A.circle(c, x, y, r + r * 0.12, A.lg(c, 0, y - r, 0, y + r, ['#e6c070', '#9a6a20']), A.INK, 1.5);
      A.circle(c, x, y, r, A.rg(c, x - r * 0.3, y - r * 0.3, 2, r * 1.2, ['#fffaf0', '#e8dcc0']), A.INK, 1.4);
      for (let i = 0; i < 60; i++) { const a = i * Math.PI / 30, l = i % 5 ? 0.05 : 0.1; c.strokeStyle = A.INK; c.lineWidth = i % 5 ? 0.7 : 1.6; c.beginPath(); c.moveTo(x + Math.sin(a) * r * 0.92, y - Math.cos(a) * r * 0.92); c.lineTo(x + Math.sin(a) * r * (0.92 - l), y - Math.cos(a) * r * (0.92 - l)); c.stroke(); }
      for (const [hh, k] of Object.entries(FACE)) { const a = hh * Math.PI / 6; A.sym(c, k, x + Math.sin(a) * r * 0.66, y - Math.cos(a) * r * 0.66, r * 0.3, SYMCOL[k], { lw: Math.max(0.8, r * 0.025) }); }
      const ha = ((h % 12) + m / 60) * Math.PI / 6, ma = m * Math.PI / 30;
      c.lineCap = 'round'; c.strokeStyle = '#2a1a10';
      c.lineWidth = Math.max(2, r * 0.07); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sin(ha) * r * 0.45, y - Math.cos(ha) * r * 0.45); c.stroke();
      c.lineWidth = Math.max(1.4, r * 0.045); c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.sin(ma) * r * 0.8, y - Math.cos(ma) * r * 0.8); c.stroke();
      A.circle(c, x, y, Math.max(2, r * 0.06), '#2a1a10');
      if (o.glass) { c.save(); c.globalAlpha = 0.35; c.fillStyle = A.lg(c, x - r, y - r, x + r, y + r, ['#ffffff', 'rgba(255,255,255,0)', 'rgba(255,255,255,.4)', 'rgba(255,255,255,0)']); A.circle(c, x, y, r, c.fillStyle); c.restore(); }
    }
    function tallClock(c, x, y, s, S, t) { // x = centre, y = top
      c.save(); c.translate(x, y); c.scale(s, s);
      A.shadow(c, 0, 214, 52, 6, 0.4);
      A.wood(c, -44, 0, 88, 100, '#7a4220', { r: 10 });
      c.beginPath(); c.moveTo(-50, 6); c.quadraticCurveTo(0, -24, 50, 6); c.lineTo(50, 12); c.lineTo(-50, 12); c.closePath(); c.fillStyle = '#5a2e14'; c.fill(); c.strokeStyle = A.INK; c.lineWidth = 1.5; c.stroke();
      clockFace(c, 0, 52, 32, S.h, S.m, { glass: !S.glass });
      A.wood(c, -34, 98, 68, 104, '#8a4c24', { r: 4 });
      A.rr(c, -22, 108, 44, 84, 22); c.fillStyle = A.lg(c, 0, 108, 0, 192, ['#2a1a10', '#4a2e18']); c.fill(); c.strokeStyle = A.INK; c.stroke();
      const sw = S.pendOpen ? Math.sin((t || 0) / 380) * 0.18 : 0;
      c.save(); c.translate(0, 112); c.rotate(sw); c.strokeStyle = '#c8962e'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 60); c.stroke(); A.circle(c, 0, 66, 9, A.rg(c, -3, 63, 1, 10, ['#fff1b8', '#b8801e']), '#5a3a0c', 1.3); c.restore();
      if (!S.pendOpen) { c.fillStyle = A.rgba('#c8e0f0', 0.18); A.rr(c, -22, 108, 44, 84, 22); c.fill(); A.brass(c, -10, 176, 20, 12, 2); A.sym(c, 'camera', 0, 182, 9, '#5a3a0c', { lw: 0.8 }); }
      A.wood(c, -46, 202, 92, 14, '#5a2e14', { r: 2 });
      c.restore();
    }
    // --- gear board geometry (gear units; the board scales them by GK) ---
    const R = { S: 14, M: 20, L: 28 }, RC = 18, RD = 16;
    const P = { C: [0, 0], A: [46, 0], B: [67, -36.373], E: [101, -36.373], D: [124.141, -8.795] };
    const GK = 1.6, GX = 60, GY = 190;
    const gp = k => [GX + P[k][0] * GK, GY + P[k][1] * GK];
    const CHAIN = ['C', 'A', 'B', 'E', 'D'];
    const radiusOf = (S, k) => (k === 'C' ? RC : k === 'D' ? RD : S.peg[k] ? R[{ gearS: 'S', gearM: 'M', gearL: 'L' }[S.peg[k]]] : 0);
    function pairState(S, a, b) {
      const ra = radiusOf(S, a), rb = radiusOf(S, b); if (!ra || !rb) return 'none';
      const d = Math.hypot(P[a][0] - P[b][0], P[a][1] - P[b][1]), s = ra + rb;
      return Math.abs(d - s) <= 1 ? 'ok' : d < s ? 'overlap' : 'gap';
    }
    const allMesh = S => CHAIN.slice(1).every((k, i) => pairState(S, CHAIN[i], k) === 'ok');
    const GEARCOL = { gearS: '#d9a640', gearM: '#c88a34', gearL: '#b77a28' };
    function gearIcon(c, s, r, col) { A.gear(c, s / 2, s / 2, s * r, Math.round(6 + r * 10), 0.2, col); }
    function photo(c, x, y, w, h) {
      c.save(); c.translate(x, y);
      c.fillStyle = 'rgba(0,0,0,.35)'; c.fillRect(4, 5, w, h);
      c.fillStyle = '#f6eedc'; c.fillRect(0, 0, w, h); c.strokeStyle = A.INK; c.lineWidth = 1.4; c.strokeRect(0, 0, w, h);
      const ix = w * 0.07, iy = h * 0.07, iw = w * 0.86, ih = h * 0.78;
      c.fillStyle = A.lg(c, 0, iy, 0, iy + ih, ['#b89a70', '#7a5e40']); c.fillRect(ix, iy, iw, ih);
      c.save(); c.beginPath(); c.rect(ix, iy, iw, ih); c.clip();
      // the clock on the right of the photo, at 8:15
      const k = ih / 230;
      c.save(); c.translate(ix + iw * 0.68, iy + ih * 0.06); c.scale(k, k);
      A.wood(c, -44, 0, 88, 100, '#6a4a2e', { r: 10 }); clockFace(c, 0, 52, 32, 8, 15); A.wood(c, -34, 98, 68, 130, '#6a4a2e', { r: 4 });
      c.restore();
      // the young Master
      const mx = ix + iw * 0.3, my = iy + ih;
      c.fillStyle = '#4a3a2a'; c.beginPath(); c.moveTo(mx - ih * 0.2, my); c.quadraticCurveTo(mx - ih * 0.2, my - ih * 0.5, mx, my - ih * 0.52); c.quadraticCurveTo(mx + ih * 0.2, my - ih * 0.5, mx + ih * 0.2, my); c.fill();
      c.fillStyle = '#8a7a64'; c.fillRect(mx - ih * 0.1, my - ih * 0.42, ih * 0.2, ih * 0.42);
      A.circle(c, mx, my - ih * 0.64, ih * 0.13, '#e8c8a0', '#3a2618', 1.2);
      c.fillStyle = '#3a2a1a'; c.beginPath(); c.arc(mx, my - ih * 0.7, ih * 0.13, Math.PI, 0); c.fill();
      c.strokeStyle = '#3a2618'; c.lineWidth = 1.2; c.beginPath(); c.arc(mx, my - ih * 0.62, ih * 0.05, 0.3, Math.PI - 0.3); c.stroke();
      c.fillStyle = 'rgba(80,50,20,.25)'; c.fillRect(ix, iy, iw, ih);
      c.restore();
      c.restore();
    }

    const items = {
      gearS: { name: '小さな歯車', desc: '真ちゅうの歯車。大きさがちがうものが3つある', icon: (c, s) => gearIcon(c, s, 0.26, GEARCOL.gearS) },
      gearM: { name: '中くらいの歯車', desc: '真ちゅうの歯車。大きさがちがうものが3つある', icon: (c, s) => gearIcon(c, s, 0.36, GEARCOL.gearM) },
      gearL: { name: '大きな歯車', desc: '真ちゅうの歯車。大きさがちがうものが3つある', icon: (c, s) => gearIcon(c, s, 0.46, GEARCOL.gearL) },
      clockKey: { name: '時計の鍵', desc: '小さな鍵。時計の部品のような形', icon: (c, s) => { c.save(); c.translate(s / 2, s / 2); c.rotate(-0.7); A.brass(c, -2, -s * 0.05, s * 0.4, s * 0.1, 2); A.circle(c, -s * 0.12, 0, s * 0.16, A.rg(c, -s * 0.15, -3, 1, s * 0.2, ['#fff1b8', '#b8801e']), '#5a3a0c', 1.4); A.circle(c, -s * 0.12, 0, s * 0.06, '#2a1d14'); A.brass(c, s * 0.3, -s * 0.05, s * 0.08, s * 0.2, 1); c.restore(); } },
      photo: { name: '古い写真', desc: '若い親方が、柱時計の横で笑っている', icon: (c, s) => photo(c, s * 0.08, s * 0.18, s * 0.84, s * 0.64), big: c => photo(c, 70, 30, 260, 220) },
      doorKey: { name: '扉の鍵', desc: '時計の間の扉の鍵', icon: (c, s) => { c.save(); c.translate(s * 0.25, s / 2); A.circle(c, 0, 0, s * 0.17, A.rg(c, -3, -3, 1, s * 0.2, ['#e8eef2', '#7d868e']), '#2b3036', 1.4); A.circle(c, 0, 0, s * 0.07, '#2a1d14'); c.fillStyle = '#a9b0b6'; c.fillRect(s * 0.15, -s * 0.05, s * 0.55, s * 0.1); c.fillRect(s * 0.55, 0, s * 0.08, s * 0.16); c.fillRect(s * 0.42, 0, s * 0.07, s * 0.12); c.strokeStyle = '#2b3036'; c.lineWidth = 1; c.strokeRect(s * 0.15, -s * 0.05, s * 0.55, s * 0.1); c.restore(); } },
    };
    const PLAY = [523, 659, 784, 659, 698, 587, 523];
    function tune() { PLAY.forEach((f, i) => K.tone(f, 0.22, { type: 'sine', vol: 0.08, delay: i * 0.16 })); }

    const views = {
      w0: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.frame(c, 290, 70, 56, 44, '#6b4423', '#1b2a4a'); for (let i = 0; i < 9; i++) A.circle(c, 300 + (i * 37) % 38, 80 + (i * 13) % 24, 1, '#fff3c4'); c.fillStyle = '#c8962e'; c.fillRect(306, 96, 22, 10);
          A.wood(c, 62, 170, 60, 8, '#7a4220'); A.wood(c, 70, 178, 6, 54, '#5a2e14'); A.wood(c, 108, 178, 6, 54, '#5a2e14');
          A.light(c, 92, 140, 80, '#ffcf7a', 0.35); A.box(c, 86, 150, 12, 20, '#c8962e', { r: 2 }); c.beginPath(); c.moveTo(74, 150); c.lineTo(110, 150); c.lineTo(102, 128); c.lineTo(82, 128); c.closePath(); c.fillStyle = '#f2d8a0'; c.fill(); c.strokeStyle = A.INK; c.lineWidth = 1.4; c.stroke();
          tallClock(c, 200, 16, 1, S, t);
          end(c);
        },
        spots: S => [
          spot('lamp', 66, 124, 54, 50, { say: 'ランプの光があたたかい' }),
          spot('picture', 288, 68, 60, 48, { say: '小さな絵。星空の下の工房' }),
          spot('clockbody', 150, 14, 100, 220, { say: '止まった柱時計。文字盤に記号が4つ' }),
          circ('clock', 200, 68, 40, { go: 'face2' }),
          spot('pend', 168, 116, 64, 104, { go: 'pend2' }),
        ],
      },
      w1: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.door(c, 48, 52, 92, 180, '#7a4220');
          A.wood(c, 186, 46, 180, 150, '#7a5a3a', { r: 6 });
          A.rr(c, 194, 54, 164, 134, 4); c.fillStyle = '#3a2a1e'; c.fill();
          c.save(); c.translate(194, 54); c.scale(164 / 400, 134 / 300); drawBoard(c, S, t, true); c.restore();
          end(c);
        },
        spots: S => [
          spot('door', 46, 50, 96, 184, { use: it => { if (it !== 'doorKey') return false; K.take('doorKey'); K.exit(); return true; }, tap: () => K.say('扉には鍵がかかっている') }),
          spot('board', 186, 46, 180, 150, { go: 'gears2' }),
        ],
      },
      w2: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.nightWindow(c, 160, 30, 80, 70, { moon: true });
          // rug
          c.save(); c.beginPath(); c.moveTo(100, 246); c.lineTo(300, 246); c.lineTo(330, 292); c.lineTo(70, 292); c.closePath(); c.fillStyle = A.lg(c, 0, 246, 0, 292, ['#a8484a', '#7a2a30']); c.fill(); c.strokeStyle = A.INK; c.lineWidth = 1.5; c.stroke();
          c.strokeStyle = '#e8c070'; c.lineWidth = 2; c.beginPath(); c.moveTo(112, 252); c.lineTo(288, 252); c.lineTo(310, 286); c.lineTo(90, 286); c.closePath(); c.stroke(); c.restore();
          if (!S.rug) { c.beginPath(); c.moveTo(300, 246); c.lineTo(278, 246); c.lineTo(312, 268); c.closePath(); c.fillStyle = '#d8b090'; c.fill(); c.strokeStyle = A.INK; c.lineWidth = 1.3; c.stroke(); }
          else { c.beginPath(); c.moveTo(300, 246); c.lineTo(250, 246); c.lineTo(330, 292); c.closePath(); c.fillStyle = '#d8b090'; c.fill(); c.strokeStyle = A.INK; c.stroke(); }
          // desk
          A.wood(c, 96, 166, 12, 66, '#5a2e14'); A.wood(c, 292, 166, 12, 66, '#5a2e14');
          A.wood(c, 88, 150, 224, 16, '#7a4220', { r: 3 }); A.wood(c, 150, 166, 100, 26, '#6a3a1c', { r: 3 }); A.brass(c, 188, 176, 24, 6, 3);
          c.save(); c.translate(130, 142); c.rotate(-0.06); c.fillStyle = '#efe2c4'; c.fillRect(0, 0, 46, 10); c.strokeStyle = A.INK; c.lineWidth = 1; c.strokeRect(0, 0, 46, 10); c.beginPath(); c.moveTo(23, 0); c.lineTo(23, 10); c.stroke(); c.restore();
          A.box(c, 262, 132, 10, 18, '#c8962e', { r: 2 }); c.strokeStyle = A.INK; c.beginPath(); c.moveTo(267, 132); c.lineTo(274, 118); c.stroke(); A.circle(c, 276, 116, 3, '#f6e6a0');
          end(c);
        },
        spots: S => [
          spot('window', 156, 26, 88, 78, { say: '外はしずかな夜' }),
          spot('desk', 88, 128, 224, 66, { go: 'desk2' }),
          spot('rug', 70, 246, 260, 46, { tap: () => { if (!S.got.gearL) { S.rug = 1; K.give('gearL'); } else K.say('じゅうたんの下には何もない'); } }),
        ],
      },
      w3: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.nightWindow(c, 300, 50, 66, 80);
          // cuckoo cabinet
          A.shadow(c, 200, 206, 60, 6, 0.35);
          c.beginPath(); c.moveTo(140, 64); c.lineTo(200, 26); c.lineTo(260, 64); c.closePath(); c.fillStyle = '#5a2e14'; c.fill(); c.strokeStyle = A.INK; c.lineWidth = 1.6; c.stroke();
          A.wood(c, 148, 60, 104, 142, '#8a4c24', { r: 4 });
          A.brass(c, 186, 70, 28, 18, 3); clockIcon(c, 200, 79, 6);
          if (S.cabOpen) { A.rr(c, 156, 96, 88, 66, 3); c.fillStyle = '#2a1a10'; c.fill(); if (!S.got.gearM) A.gear(c, 184, 132, 14, 9, 0, GEARCOL.gearM); if (!S.got.clockKey) A.brass(c, 210, 128, 22, 6, 2); }
          else { A.wood(c, 156, 96, 42, 66, '#9a5a2c', { r: 2 }); A.wood(c, 202, 96, 42, 66, '#9a5a2c', { r: 2 }); }
          ['moon', 'star', 'cloud', 'sun'].forEach((k, i) => { A.circle(c, 167 + i * 22, 180, 8, '#e8dcc0', A.INK, 1.2); A.sym(c, k, 167 + i * 22, 180, 10, SYMCOL[k], { lw: 0.8 }); });
          // chair with Komugi
          A.wood(c, 56, 150, 8, 82, '#6a3a1c'); A.wood(c, 56, 188, 66, 10, '#7a4220', { r: 2 }); A.wood(c, 112, 198, 7, 34, '#6a3a1c'); A.wood(c, 60, 198, 7, 34, '#6a3a1c');
          A.cat(c, 92, 186, 50, t, '#c8c0b0');
          end(c);
        },
        spots: S => [
          spot('window', 296, 46, 74, 88, { say: '外はしずかな夜' }),
          spot('cat', 54, 150, 70, 46, { tap: () => { meow(); K.say('こむぎが椅子の上で眠っている'); } }),
          spot('cab', 140, 26, 120, 176, { go: 'cab2' }),
        ],
      },
      face2: {
        back: 'w0',
        draw(c, S) {
          A.zoomBg(c, '#7a4220');
          clockFace(c, 200, 140, 108, S.h, S.m, { glass: !S.glass });
          if (!S.glass) { A.brass(c, 188, 258, 24, 22, 4); c.fillStyle = '#2a1606'; c.beginPath(); c.arc(200, 266, 3, 0, Math.PI * 2); c.fill(); c.fillRect(198.6, 266, 2.8, 8); }
          else {
            // knobs: long hand on the left, short hand on the right
            for (const [x, long] of [[44, true], [356, false]]) {
              A.circle(c, x, 236, 28, A.rg(c, x - 8, 228, 2, 30, ['#fff1b8', '#b8801e']), '#5a3a0c', 1.6);
              c.strokeStyle = '#2a1a10'; c.lineCap = 'round'; c.lineWidth = long ? 3 : 5; c.beginPath(); c.moveTo(x, 248); c.lineTo(x, long ? 216 : 226); c.stroke();
              c.lineWidth = 2; c.beginPath(); c.arc(x, 236, 34, -0.6, 0.6); c.stroke(); c.beginPath(); c.moveTo(x + 34 * Math.cos(0.6), 236 + 34 * Math.sin(0.6)); c.lineTo(x + 34 * Math.cos(0.6) - 7, 236 + 34 * Math.sin(0.6) - 1); c.stroke();
            }
          }
          A.zoomEnd(c);
        },
        spots: S => {
          const check = () => { if (S.h === 8 && S.m === 15 && !S.pendOpen) { S.pendOpen = 1; K.ok(); K.say('カチッ…下の方で音がした'); } else K.tone(1200, 0.03, { type: 'square', vol: 0.03 }); };
          const l = [circ('face', 200, 140, 112, {
            useOnly: false,
            use: it => { if (it !== 'clockKey' || S.glass) return false; S.glass = 1; K.take('clockKey'); K.ok(); K.say('ガラスのふたが開いた'); return true; },
            tap: () => K.say(S.glass ? '止まった柱時計。文字盤に記号が4つ' : '文字盤はガラスでおおわれている。下に小さな鍵穴'),
          })];
          if (!S.glass) l.push(spot('glass', 176, 250, 48, 40, { use: it => { if (it !== 'clockKey') return false; S.glass = 1; K.take('clockKey'); K.ok(); K.say('ガラスのふたが開いた'); return true; }, tap: () => K.say('文字盤はガラスでおおわれている。下に小さな鍵穴') }));
          else l.push(
            circ('mn', 44, 236, 34, { tap: () => { S.m += 5; if (S.m >= 60) { S.m = 0; S.h = S.h % 12 + 1; } check(); } }),
            circ('hr', 356, 236, 34, { tap: () => { S.h = S.h % 12 + 1; check(); } }));
          return l;
        },
      },
      pend2: {
        back: 'w0',
        draw(c, S, t) {
          A.zoomBg(c, '#7a4220');
          A.wood(c, 90, 0, 220, 300, '#8a4c24', { r: 6 });
          A.rr(c, 120, 20, 160, 260, 70); c.fillStyle = A.lg(c, 0, 20, 0, 280, ['#2a1a10', '#4a2e18']); c.fill(); c.strokeStyle = A.INK; c.lineWidth = 1.6; c.stroke();
          const sw = S.pendOpen ? Math.sin(t / 380) * 0.14 : 0;
          c.save(); c.translate(200, 24); c.rotate(sw); c.strokeStyle = '#c8962e'; c.lineWidth = 5; c.beginPath(); c.moveTo(0, 0); c.lineTo(0, 190); c.stroke(); A.circle(c, 0, 206, 26, A.rg(c, -8, 198, 2, 28, ['#fff1b8', '#b8801e']), '#5a3a0c', 2); c.restore();
          if (S.pendOpen) { if (!S.got.doorKey) { c.strokeStyle = '#c8962e'; c.lineWidth = 2; c.beginPath(); c.moveTo(250, 60); c.lineTo(250, 76); c.stroke(); c.save(); c.translate(236, 88); items.doorKey.icon(c, 40); c.restore(); } K.anim(400); }
          else { c.fillStyle = A.rgba('#c8e0f0', 0.2); A.rr(c, 120, 20, 160, 260, 70); c.fill(); A.brass(c, 170, 220, 60, 40, 4); A.sym(c, 'camera', 200, 241, 30, '#5a3a0c', { lw: 1.6 }); }
          A.zoomEnd(c);
        },
        spots: S => S.pendOpen && !S.got.doorKey ? [spot('case', 120, 20, 160, 260, { say: '振り子が静かにゆれている' }), spot('dkey', 226, 56, 60, 72, { tap: () => K.give('doorKey') })]
          : [spot('case', 120, 20, 160, 260, { say: S.pendOpen ? '振り子が静かにゆれている' : '振り子の扉は固く閉まっている。写真機の絵が彫られた札がある' })],
      },
      gears2: {
        back: 'w1',
        draw(c, S, t) { drawBoard(c, S, t, false); A.zoomEnd(c); },
        spots: S => {
          const l = [spot('boardbg', 0, 0, 400, 300, { say: '歯車をはめる軸だ' })];
          for (const k of ['A', 'B', 'E']) {
            const [x, y] = gp(k);
            l.push(circ('peg' + k, x, y, 24, {
              use: it => { if (!/^gear[SML]$/.test(it) || S.peg[k] || S.gearsDone) return false; S.peg[k] = it; K.take(it); K.sfx('drop'); return true; },
              tap: () => { if (S.gearsDone) return; if (S.peg[k]) { const g = S.peg[k]; S.peg[k] = null; K.give(g); } else K.say('歯車をはめる軸だ'); },
            }));
          }
          const [cx, cy] = gp('C');
          l.push(circ('crank', cx - 6, cy + 20, 34, { tap: () => {
            if (S.gearsDone) { tune(); K.tr.spin = K.time(); K.anim(1800); return; }
            if (allMesh(S)) { S.gearsDone = 1; K.tr.spin = K.time(); K.anim(2000); tune(); K.ok(); K.say('歯車が回り、オルゴールが鳴った！ 小さな扉が開いた'); }
            else { K.tr.jig = K.time(); K.anim(300); K.bad(); K.say('ガタッ…歯車がうまくかみ合っていない'); }
          } }));
          if (S.gearsDone) l.push(spot('hatch', 290, 36, 84, 76, { tap: () => { if (!S.got.photo) K.give('photo'); else K.say('からっぽの小箱'); } }));
          return l;
        },
      },
      desk2: {
        back: 'w2',
        draw(c, S) {
          A.zoomBg(c, '#4f6b4a', { table: 120, tableCol: '#7a4220' });
          // diary
          c.save(); c.translate(70, 136); c.rotate(-0.04);
          c.fillStyle = 'rgba(0,0,0,.3)'; c.fillRect(4, 6, 170, 96);
          c.fillStyle = '#f4ead2'; c.fillRect(0, 0, 170, 96); c.strokeStyle = A.INK; c.lineWidth = 1.4; c.strokeRect(0, 0, 170, 96); c.beginPath(); c.moveTo(85, 0); c.lineTo(85, 96); c.stroke();
          A.lines(c, 10, 18, 66, 6, 12); A.lines(c, 94, 18, 66, 3, 12); A.gear(c, 128, 70, 16, 8, 0, '#b0a080', { stroke: '#6a5a40' });
          c.restore();
          // drawer
          A.wood(c, 250, 176, 120, 70, '#6a3a1c', { r: 4 });
          if (S.deskOpen) { A.rr(c, 240, 230, 140, 54, 4); c.fillStyle = '#2a1a10'; c.fill(); A.wood(c, 236, 270, 148, 26, '#7a4a26', { r: 3 }); if (!S.got.gearS) A.gear(c, 310, 252, 15, 8, 0.2, GEARCOL.gearS); }
          A.brass(c, 292, 205, 36, 10, 5);
          A.zoomEnd(c);
        },
        spots: S => {
          const l = [spot('diary', 64, 128, 186, 112, { go: 'diary2' }), spot('drawer', 236, 170, 148, 100, { tap: () => { if (!S.deskOpen) { S.deskOpen = 1; K.sfx('drop'); } else if (!S.got.gearS) K.give('gearS'); } })];
          if (S.deskOpen && !S.got.gearS) l.push(spot('gearS', 286, 228, 50, 50, { tap: () => K.give('gearS') }));
          return l;
        },
      },
      diary2: {
        back: 'desk2',
        draw(c) {
          A.zoomBg(c, '#4f6b4a');
          A.paper(c, 40, 16, 320, 266, 0.01, '#f4ead2');
          A.fitWrap(c, T('親方の日記\n\nこの柱時計は、わしが弟子入りした朝の時刻で止めてある。あの朝の写真は、歯車のからくりの中にしまっておいた。\n\n歯車は、となりとぴったりかみ合う大きさでないと回らない。'), 62, 40, 276, 230, { size: 14 });
          A.zoomEnd(c);
        },
        spots: () => [],
      },
      cab2: {
        back: 'w3',
        draw(c, S) {
          A.zoomBg(c, '#4f6b4a');
          A.wood(c, 40, 10, 320, 290, '#8a4c24', { r: 10 });
          A.brass(c, 150, 22, 100, 56, 6); clockIcon(c, 200, 50, 20);
          if (S.cabOpen) {
            A.rr(c, 70, 92, 260, 112, 6); c.fillStyle = '#2a1a10'; c.fill();
            if (!S.got.gearM) A.gear(c, 150, 148, 31, 12, 0.1, GEARCOL.gearM);
            if (!S.got.clockKey) { c.save(); c.translate(220, 128); items.clockKey.icon(c, 56); c.restore(); }
          } else { A.wood(c, 70, 92, 128, 112, '#9a5a2c', { r: 4 }); A.wood(c, 202, 92, 128, 112, '#9a5a2c', { r: 4 }); A.circle(c, 188, 148, 5, '#c8962e', A.INK, 1); A.circle(c, 212, 148, 5, '#c8962e', A.INK, 1); }
          BTN.forEach((k, i) => {
            const x = 110 + i * 60, on = S.seq.includes(k);
            A.circle(c, x, 248, 26, A.rg(c, x - 8, 240, 2, 28, on ? ['#fff4c8', '#e8b860'] : ['#f6efe0', '#c8b896']), A.INK, 1.8);
            A.sym(c, k, x, 248, 30, SYMCOL[k], { lw: 1.4 });
          });
          for (let i = 0; i < 4; i++) A.circle(c, 170 + i * 20, 286, 5, i < S.seq.length ? '#ffd84a' : '#3a2416', A.INK, 1);
          A.zoomEnd(c);
        },
        spots: S => {
          const l = [spot('front', 40, 10, 320, 210, { say: '戸棚の上の札には、時計と矢印の絵' })];
          if (S.cabOpen) {
            if (!S.got.gearM) l.push(circ('gearM', 150, 148, 36, { tap: () => K.give('gearM') }));
            if (!S.got.clockKey) l.push(spot('ckey', 214, 120, 72, 64, { tap: () => K.give('clockKey') }));
          } else BTN.forEach((k, i) => l.push(circ('b_' + k, 110 + i * 60, 248, 28, { tap: () => {
            S.seq.push(k); K.sfx('tap');
            if (S.seq.length === 4) {
              if (S.seq.join() === 'star,sun,cloud,moon') { S.cabOpen = 1; K.ok(); K.say('戸棚の扉が開いた！'); }
              else { S.seq = []; K.bad(); K.say('カタン。何も起きない…押す順番がちがうようだ'); }
            }
          } })));
          return l;
        },
      },
    };
    const BTN = ['moon', 'star', 'cloud', 'sun'];
    function clockIcon(c, x, y, r) { // a clock with a clockwise arrow that starts at 12
      A.circle(c, x, y, r, '#fffaf0', A.INK, Math.max(1, r * 0.08));
      c.strokeStyle = A.INK; c.lineWidth = Math.max(1, r * 0.1); c.lineCap = 'round';
      c.beginPath(); c.moveTo(x, y); c.lineTo(x, y - r * 0.7); c.stroke();
      c.strokeStyle = '#c8402a'; c.beginPath(); c.arc(x, y, r * 0.55, -Math.PI / 2, Math.PI * 1.1); c.stroke();
      const a = Math.PI * 1.1, ax = x + Math.cos(a) * r * 0.55, ay = y + Math.sin(a) * r * 0.55;
      c.fillStyle = '#c8402a'; c.beginPath(); c.moveTo(ax + r * 0.18, ay - r * 0.1); c.lineTo(ax - r * 0.22, ay - r * 0.12); c.lineTo(ax, ay + r * 0.25); c.closePath(); c.fill();
      A.circle(c, x, y - r * 0.82, r * 0.1, '#c8402a');
    }
    function drawBoard(c, S, t, small) {
      A.zoomBg(c, '#5a4632');
      c.fillStyle = A.lg(c, 0, 20, 0, 280, ['#3a2e24', '#2a2018']); A.rr(c, 20, 20, 360, 260, 12); c.fill(); c.strokeStyle = '#c8962e'; c.lineWidth = 3; c.stroke();
      // hatch
      A.wood(c, 290, 36, 84, 76, '#6a4a2e', { r: 4 });
      if (S.gearsDone) { A.rr(c, 296, 42, 72, 64, 3); c.fillStyle = '#1a120c'; c.fill(); if (!S.got.photo) { c.save(); c.translate(306, 52); c.rotate(-0.08); photo(c, 0, 0, 52, 42); c.restore(); } }
      else { A.brass(c, 324, 70, 16, 8, 2); }
      // music drum next to D
      const [dx, dy] = gp('D');
      A.box(c, dx + 18, dy - 22, 76, 44, '#c8962e', { r: 8 });
      for (let i = 0; i < 14; i++) A.circle(c, dx + 24 + (i * 23) % 66, dy - 16 + (i * 7) % 32, 1.8, '#5a3a0c');
      for (let i = 0; i < 6; i++) { c.fillStyle = '#d8dde2'; c.fillRect(dx + 26 + i * 10, dy + 24, 6, 14); }
      const spin = K.tr.spin ? Math.min(1, (K.time() - K.tr.spin) / 1800) : (S.gearsDone ? 1 : 0);
      const base = spin * 6 * (K.tr.spin ? 1 : 0);
      const jig = K.tr.jig && K.time() - K.tr.jig < 300 ? Math.sin((K.time() - K.tr.jig) / 20) * 0.08 : 0;
      CHAIN.forEach((k, i) => {
        const [x, y] = gp(k);
        const r = radiusOf(S, k);
        A.circle(c, x, y, 6, '#8a8a8a', A.INK, 1.2);
        if (!r) { A.circle(c, x, y, 24, null, A.rgba('#ffe8b0', 0.35), 1.5); c.setLineDash([3, 4]); A.circle(c, x, y, 18, null, A.rgba('#ffe8b0', 0.5), 1.2); c.setLineDash([]); return; }
        const dir = i % 2 ? -1 : 1, rot = dir * (base + jig) * (RC / r) + (i % 2 ? Math.PI / (r * 0.6) : 0);
        const col = k === 'C' ? '#9aa3ad' : k === 'D' ? '#9aa3ad' : GEARCOL[S.peg[k]];
        A.gear(c, x, y, r * GK, Math.round(r * 0.6), rot, col);
      });
      // mesh marks between neighbours
      CHAIN.slice(1).forEach((k, i) => {
        const st = pairState(S, CHAIN[i], k); if (st === 'none' || st === 'ok') return;
        const [ax, ay] = gp(CHAIN[i]), [bx, by] = gp(k), ra = radiusOf(S, CHAIN[i]) * GK, d = Math.hypot(bx - ax, by - ay);
        const mx = ax + (bx - ax) * (ra / d), my = ay + (by - ay) * (ra / d);
        if (st === 'overlap') { A.circle(c, mx, my, 9, A.rgba('#ff4a2a', 0.75), '#fff', 1.5); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.moveTo(mx - 4, my - 4); c.lineTo(mx + 4, my + 4); c.moveTo(mx + 4, my - 4); c.lineTo(mx - 4, my + 4); c.stroke(); }
        else { A.glow(c, mx, my, 12, '#9fd6ff', 0.6); }
      });
      // crank handle on C
      const [cx, cy] = gp('C');
      const ca = (base + jig) * 1;
      c.save(); c.translate(cx, cy); c.rotate(ca); c.strokeStyle = '#d8dde2'; c.lineWidth = 6; c.lineCap = 'round'; c.beginPath(); c.moveTo(0, 0); c.lineTo(-6, 30); c.stroke(); A.circle(c, -6, 32, 7, '#c8402a', A.INK, 1.4); c.restore();
      if (K.tr.spin && K.time() - K.tr.spin < 2000) K.anim(60);
    }

    return {
      id: 'r2', name: '時計の間', par: 9 * 60000,
      intro: '時計の間。壁ぎわの大きな柱時計は止まったまま。親方は、時計のからくりが何より得意だった。',
      outro: '時計が8時15分を指すと、振り子の扉がひらいた。親方が弟子入りした朝の時刻だ。扉の鍵で、次の部屋へ。',
      init: () => ({ got: {}, h: 3, m: 40, glass: 0, pendOpen: 0, peg: { A: null, B: null, E: null }, gearsDone: 0, seq: [], cabOpen: 0, deskOpen: 0, rug: 0 }),
      items, views, combos: [],
      puzzles: [
        { id: 'desk', name: '机の引き出し', done: S => !!S.got.gearS, hints: ['机の上と引き出しを調べよう', '引き出しは取っ手をタップすると開く', '机に近づき、引き出しをタップ。中に小さな歯車'] },
        { id: 'rug', name: '床のじゅうたん', done: S => !!S.got.gearL, hints: ['机の前のじゅうたんの角がめくれている', 'めくれた角の下に何かある', '机の壁で、じゅうたんの右の角をタップ'] },
        { id: 'cab', name: '鳩時計の戸棚のボタン', done: S => !!S.cabOpen, hints: ['戸棚の上の札には、時計と矢印の絵', '柱時計の文字盤の、12・3・6・9の位置に記号がある', '12時から時計回り：星→太陽→雲→月の順に押す'] },
        { id: 'gears', name: '歯車の板', done: S => !!S.gearsDone, hints: ['3本の軸に、3つの歯車をはめる', 'となりの歯車とぴったりかみ合う大きさを選ぶ。重なると赤、すき間があるとうすく光る', 'ハンドルのとなりに大、まん中に小、オルゴールのとなりに中。はめたらハンドルを回す'] },
        { id: 'clock', name: '柱時計の針', avail: S => !!(S.got.photo || S.glass || S.got.clockKey), done: S => !!S.pendOpen, hints: ['文字盤のガラスには鍵穴がある。合わせる時刻は、日記と写真に', '時計の鍵でガラスを開けて、写真の時刻に合わせる', '写真の時計は8時15分。長い針のつまみ（左）で15分、短い針のつまみ（右）で8時に'] },
        { id: 'door', name: '時計の間の扉', avail: S => !!S.pendOpen, done: () => false, hints: ['扉の鍵は、振り子の扉の中', '鍵ができたら、どこに使う？', '扉の鍵を選んで、扉をタップ'] },
      ],
      route: ['w:2', 's:desk', 's:drawer', 's:gearS', 's:diary', 'B', 'B', 's:rug', 'w:3', 's:cab', 's:b_star', 's:b_sun', 's:b_cloud', 's:b_moon', 's:gearM', 's:ckey', 'B',
        'w:1', 's:board', 'i:gearL', 's:pegA', 'i:gearS', 's:pegB', 'i:gearM', 's:pegE', 's:crank', 's:hatch', 'i:photo', 'i:photo', 'B', 'B',
        'w:0', 's:clock', 'i:clockKey', 's:glass', 's:mn', 's:mn', 's:mn', 's:mn', 's:mn', 's:mn', 's:mn', 's:hr', 's:hr', 's:hr', 's:hr', 'B',
        's:pend', 's:dkey', 'B', 'w:1', 'i:doorKey', 's:door'],
    };
  };
})(window);
