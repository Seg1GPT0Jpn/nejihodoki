// からくり工房からの脱出：部屋1「作業場」（チュートリアルをかねた、いちばんやさしい部屋）
// なぞ：エプロンのポケット → 窓の下の板（ドライバー）→ 色のカード＋びんのネジの数（引き出し 5・7・2）→ 万力 → 鍵を組み合わせる → ドア
(function (root) {
  'use strict';
  const ER = root.EscapeRooms;
  if (root.KoboI18n) KoboI18n.add({ en: {
    '作業場': 'The Workbench Room',
    '親方の工房に住みこんで3年。ある朝目をさますと、工房のドアというドアに鍵がかかり、親方の姿がない。作業場のドアに、手紙がピンで留めてある…': 'Three years as the Master\'s live-in apprentice. One morning you wake to find every door in the workshop locked and the Master gone. A letter is pinned to the workroom door…',
    '真ちゅうの鍵で、作業場のドアが開いた。廊下の先から、チクタクと時計の音が聞こえてくる。': 'The brass key opens the workroom door. Down the hall you hear the tick-tock of clocks.',
    '見習いへ\n\nわしはしばらく旅に出る。この工房の5つの部屋には、それぞれからくりの鍵をかけておいた。全部ほどいて屋根裏まで来られたら、一人前の職人と認めよう。\n\n――親方': 'To my apprentice,\n\nI am off travelling for a while. Each of the five rooms of this workshop is shut with one of my gadgets. Undo them all and reach the attic, and I will call you a true craftsperson.\n\n— The Master',
    'ドライバー': 'Screwdriver', 'ネジを回せるマイナスドライバー': 'A flat screwdriver for turning screws',
    '色のカード': 'Color card', '3つの色の丸が並んだカード。上に小さなびんの絵': 'A card with three colored dots in a row, each with a little jar drawn above',
    '鍵の持ち手': 'Key bow', '真ちゅうの鍵の、輪になった持ち手。先がない': 'The ring-shaped handle of a brass key. The blade is missing',
    '鍵の先': 'Key blade', 'ギザギザの付いた鍵の先。持ち手がない': 'A toothed key blade with no handle',
    '真ちゅうの鍵': 'Brass key', '持ち手と先がくっついて、1本の鍵になった': 'Bow and blade fit together into one key',
    'ドアの横のエプロン': 'The apron by the door', '窓の下の金属の板': 'The metal plate under the window', '作業台の引き出しの錠（3けた）': 'The workbench drawer lock (3 digits)',
    '万力': 'The vise', 'ふたつの部品': 'Two parts', '作業場のドア': 'The workroom door',
    'ドアの横に何か掛かっている': 'Something hangs beside the door', 'エプロンにはポケットがある': 'The apron has a pocket',
    'エプロンをタップして近づき、ポケットをタップするとドライバーが手に入る': 'Tap the apron to look closer, then tap the pocket to get a screwdriver',
    '窓の下の板は、4本のネジで留めてある': 'The plate under the window is held by 4 screws', 'ネジを回す道具がどこかにある（ドアの横を見てみよう）': 'A tool for screws is somewhere (look beside the door)',
    'ドライバーを選んでから、窓の下の板をタップ': 'Select the screwdriver, then tap the plate under the window',
    '3けたの数字は、部屋のどこかで数えられる': 'The 3 digits can be counted somewhere in the room',
    '棚のびんの中のネジを数えよう。色のカード（窓の下の板の中）の並びが順番': 'Count the screws in the jars on the shelf. The color card (inside the plate under the window) gives the order',
    'カードは 青→赤→黄。ネジは青5・赤7・黄2。答えは 5・7・2': 'The card says blue → red → yellow. Blue has 5, red 7, yellow 2. The answer is 5-7-2',
    '作業台の左の万力に、何かはさまっている': 'Something is clamped in the vise on the left of the workbench', '万力のハンドルを回すと口が開く': 'Turning the vise handle opens its jaws',
    '万力をタップして近づき、ハンドルをタップ': 'Tap the vise to look closer, then tap the handle',
    '持ち物どうしを組み合わせられる': 'Items can be combined', '鍵の持ち手と鍵の先は、1本の鍵になりそうだ': 'The key bow and the key blade look like one key',
    '持ち手を選んでから、鍵の先をタップ': 'Select the bow, then tap the blade',
    '鍵ができたら、どこに使う？': 'Now you have a key — where does it go?', '作業場のドアには鍵穴がある': 'The workroom door has a keyhole', '鍵を選んでドアをタップ': 'Select the key and tap the door',
    'ドアには鍵がかかっている。取っ手の下に鍵穴がある': 'The door is locked. There is a keyhole under the knob',
    '親方の若いころの図面だ。歯車がていねいに描いてある': "One of the Master's old blueprints. The gears are drawn with care",
    'こむぎ（工房のねこ）がまるくなって眠っている': 'Komugi, the workshop cat, is curled up asleep', 'にゃあ…（こむぎが寝言を言った）': 'Mew… (Komugi talks in her sleep)',
    '道具がきちんと掛けてある。ドライバーの場所だけ空いている': 'Tools hang neatly. Only the screwdriver spot is empty',
    '作業灯があたたかく光っている': 'The work lamp glows warmly', '引き出しに、3つの数字の錠がついている': 'The drawer has a lock with 3 number dials',
    'カチッ！引き出しが開いた': 'Click! The drawer opens', '引き出しの中はからっぽ': 'The drawer is empty',
    '万力に、ギザギザの金具がはさまっている': 'A toothed piece of metal is clamped in the vise', 'ハンドルを回すと、万力の口が開いた': 'You turn the handle and the jaws open',
    'もう何もはさまっていない': 'Nothing is clamped any more',
    '色のちがうネジのびんが3つ': 'Three jars of screws with different colored lids', 'びんの中にネジが入っている。数えられそうだ': 'Screws inside the jar. You could count them',
    '古い本が並んでいる': 'A row of old books', '小さなすわり台': 'A small stool',
    '夜空に月が出ている': 'The moon is out in the night sky', 'ネジ4本で留めた金属の板': 'A metal plate held by 4 screws',
    'ネジを外すと、板が開いた': 'You remove the screws and the plate comes off', '板の中はからっぽ': 'Nothing more inside',
    'ポケットはからっぽ': 'The pocket is empty', '元気な鉢植え': 'A healthy potted plant', 'ちりとりとほうき': 'A broom and dustpan',
  } });

  ER.defs[0] = (K, A, H) => {
    const T = K.T, { spot, circ } = H;
    const PAL = { wall: '#d9a46a', wall2: '#c48a4e', pattern: 'stripe', wains: '#8b5a33', floor: '#7a4b2a', fy: 232 };
    const meow = () => { K.tone(760, 0.16, { type: 'triangle', vol: 0.06, slide: 520 }); K.tone(620, 0.2, { type: 'triangle', vol: 0.05, slide: 840, delay: 0.18 }); };
    const end = (c, t) => { A.vignette(c, 0.42); };
    const SCREWS = { red: 7, yellow: 2, blue: 5 };
    const JARS = [{ k: 'red', lid: '#c8402a', tint: '#f6c0b0' }, { k: 'yellow', lid: '#e8b830', tint: '#f6e6a8' }, { k: 'blue', lid: '#3a6ec8', tint: '#b8d0f2' }];
    // deterministic, non-overlapping screw spots inside a jar
    function screwsIn(c, x, y, w, h, n, s) {
      const cols = 3, R = A.rnd(n * 17 + 3);
      for (let i = 0; i < n; i++) { const cx = x + w * (0.22 + (i % cols) * 0.28) + (R() - 0.5) * w * 0.06, cy = y + h - h * 0.18 - Math.floor(i / cols) * h * 0.22; A.screw(c, cx, cy - 6 * s, (R() - 0.5) * 1.4 + Math.PI / 2 * (i % 2 ? 1 : -1) * 0.5, s); }
    }
    function drawDriver(c, x, y, s, a) {
      c.save(); c.translate(x, y); c.rotate(a || 0); c.scale(s, s);
      c.fillStyle = A.lg(c, 0, -3, 0, 3, ['#e6ecf0', '#8f969c']); c.fillRect(0, -2.2, 34, 4.4); c.strokeStyle = '#2b3036'; c.lineWidth = 1; c.strokeRect(0, -2.2, 34, 4.4);
      c.fillRect(34, -1, 5, 2);
      A.rr(c, -30, -6, 32, 12, 5); c.fillStyle = A.lg(c, 0, -6, 0, 6, ['#ef7a5e', '#c23a22', '#8a2414']); c.fill(); c.lineWidth = 1.3; c.strokeStyle = A.INK; c.stroke();
      c.strokeStyle = A.rgba('#ffffff', 0.35); c.beginPath(); c.moveTo(-26, -3); c.lineTo(-4, -3); c.stroke();
      c.restore();
    }
    function drawBow(c, x, y, s) { c.save(); c.translate(x, y); c.scale(s, s); A.circle(c, 0, 0, 13, A.rg(c, -4, -4, 1, 14, ['#fff1b8', '#d9a640', '#8a5e12']), '#5a3a0c', 1.6); A.circle(c, 0, 0, 6, '#2a1d14', '#5a3a0c', 1.4); A.brass(c, 11, -4, 12, 8, 2); c.restore(); }
    function drawBlade(c, x, y, s) { c.save(); c.translate(x, y); c.scale(s, s); c.beginPath(); c.moveTo(0, -4); c.lineTo(34, -4); c.lineTo(34, 1); c.lineTo(30, 1); c.lineTo(30, 6); c.lineTo(26, 6); c.lineTo(26, 1); c.lineTo(20, 1); c.lineTo(20, 8); c.lineTo(15, 8); c.lineTo(15, 1); c.lineTo(10, 1); c.lineTo(10, 5); c.lineTo(6, 5); c.lineTo(6, 4); c.lineTo(0, 4); c.closePath(); c.fillStyle = A.lg(c, 0, -4, 0, 8, ['#fff1b8', '#d9a640', '#8a5e12']); c.fill(); c.lineWidth = 1.3; c.strokeStyle = '#5a3a0c'; c.stroke(); c.restore(); }
    function drawCard(c, x, y, w, h) {
      c.save(); c.translate(x, y);
      c.fillStyle = 'rgba(0,0,0,.3)'; A.rr(c, 4, 5, w, h, 8); c.fill();
      A.rr(c, 0, 0, w, h, 8); c.fillStyle = A.lg(c, 0, 0, 0, h, ['#fffaf0', '#efe2c4']); c.fill(); c.lineWidth = 1.6; c.strokeStyle = A.INK; c.stroke();
      const cols = ['#3a6ec8', '#c8402a', '#e8b830'];
      cols.forEach((col, i) => {
        const cx = w * (0.2 + i * 0.3), cy = h * 0.62, r = Math.min(w, h) * 0.13;
        A.jar(c, cx - r * 0.55, cy - r * 3.1, r * 1.1, r * 1.3, '#9a8a70', '#e8e0cc');
        A.circle(c, cx, cy, r, A.rg(c, cx - r / 3, cy - r / 3, 1, r * 1.2, [A.shade(col, 0.35), col]), A.INK, 1.6);
        if (i < 2) { const ax = cx + r + w * 0.03, bx = cx + w * 0.3 - r - w * 0.03; c.strokeStyle = A.INK; c.lineWidth = 2; c.beginPath(); c.moveTo(ax, cy); c.lineTo(bx, cy); c.stroke(); c.beginPath(); c.moveTo(bx, cy); c.lineTo(bx - 5, cy - 4); c.lineTo(bx - 5, cy + 4); c.closePath(); c.fillStyle = A.INK; c.fill(); }
      });
      c.restore();
    }
    function drawKey(c, x, y, s) { drawBlade(c, x + 20 * s, y, s); drawBow(c, x, y, s); }

    const items = {
      driver: { name: 'ドライバー', desc: 'ネジを回せるマイナスドライバー', icon: (c, s) => drawDriver(c, s * 0.42, s * 0.5, s / 50, -0.6) },
      card: { name: '色のカード', desc: '3つの色の丸が並んだカード。上に小さなびんの絵', icon: (c, s) => drawCard(c, s * 0.08, s * 0.2, s * 0.84, s * 0.6), big: c => drawCard(c, 50, 50, 300, 190) },
      bow: { name: '鍵の持ち手', desc: '真ちゅうの鍵の、輪になった持ち手。先がない', icon: (c, s) => drawBow(c, s * 0.38, s * 0.5, s / 40) },
      blade: { name: '鍵の先', desc: 'ギザギザの付いた鍵の先。持ち手がない', icon: (c, s) => drawBlade(c, s * 0.1, s * 0.45, s / 42) },
      key: { name: '真ちゅうの鍵', desc: '持ち手と先がくっついて、1本の鍵になった', icon: (c, s) => drawKey(c, s * 0.2, s * 0.5, s / 64) },
    };

    const views = {
      w0: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.sconce(c, 336, 64, t);
          A.door(c, 160, 52, 90, 180, '#9a5e32');
          A.paper(c, 182, 70, 46, 38, -0.05); A.lines(c, 188, 82, 32, 3, 7);
          // coat rack and apron
          A.wood(c, 56, 62, 92, 9, '#6b4423');
          for (const px of [78, 126]) A.circle(c, px, 74, 4, '#c8962e', A.INK, 1.2);
          c.strokeStyle = A.INK; c.lineWidth = 1.5; c.beginPath(); c.moveTo(78, 74); c.lineTo(90, 90); c.moveTo(78, 74); c.lineTo(114, 90); c.stroke();
          c.beginPath(); c.moveTo(88, 88); c.lineTo(116, 88); c.lineTo(126, 112); c.lineTo(132, 172); c.lineTo(72, 172); c.lineTo(78, 112); c.closePath();
          c.fillStyle = A.lg(c, 70, 88, 132, 172, ['#6f93bd', '#46688f']); c.fill(); c.stroke();
          A.rr(c, 88, 128, 30, 24, 3); c.fillStyle = '#3d5c80'; c.fill(); c.stroke();
          if (!S.got.driver) { c.fillStyle = '#c23a22'; A.rr(c, 104, 120, 6, 12, 2); c.fill(); c.stroke(); }
          A.frame(c, 284, 96, 66, 52, '#6b4423', '#cfe0f2');
          A.gear(c, 306, 122, 13, 8, 0.2, '#7fa6cf', { stroke: '#2a4a7a' }); A.gear(c, 328, 116, 9, 7, 0.5, '#7fa6cf', { stroke: '#2a4a7a' });
          A.cushion(c, 330, 250, 78, '#b0485a'); A.cat(c, 330, 246, 56, t);
          end(c, t);
        },
        spots: S => [
          spot('frame', 284, 96, 66, 52, { say: '親方の若いころの図面だ。歯車がていねいに描いてある' }),
          spot('cat', 292, 214, 78, 42, { tap: () => { meow(); K.say('こむぎ（工房のねこ）がまるくなって眠っている'); } }),
          spot('door', 158, 50, 94, 184, { use: it => { if (it !== 'key') return false; K.take('key'); K.exit(); return true; }, tap: () => K.say('ドアには鍵がかかっている。取っ手の下に鍵穴がある') }),
          spot('letter', 178, 66, 54, 46, { go: 'letter1' }),
          spot('apron', 68, 72, 68, 104, { go: 'apron' }),
        ],
      },
      w1: {
        draw(c, S, t) {
          A.room(c, PAL);
          // pegboard
          A.box(c, 70, 34, 260, 86, '#cfa878', { r: 4 });
          c.fillStyle = A.rgba('#5a3a1a', 0.45); for (let y = 42; y < 116; y += 10) for (let x = 78; x < 326; x += 10) c.fillRect(x, y, 2, 2);
          c.save(); c.fillStyle = '#4a3a30'; c.strokeStyle = A.INK; c.lineWidth = 1.2;
          A.sym(c, 'hammer', 104, 74, 40, '#6a5040'); c.restore();
          c.save(); c.translate(150, 52); c.fillStyle = '#9aa3ad'; c.beginPath(); c.moveTo(0, 0); c.lineTo(46, 0); c.lineTo(46, 12); c.lineTo(0, 22); c.closePath(); c.fill(); c.strokeStyle = A.INK; c.lineWidth = 1.2; c.stroke(); A.rr(c, -14, -2, 16, 24, 4); c.fillStyle = '#8a5a30'; c.fill(); c.stroke(); c.restore();
          c.save(); c.translate(224, 56); c.rotate(0.5); A.rr(c, -3, 0, 7, 46, 3); c.fillStyle = '#9aa3ad'; c.fill(); c.strokeStyle = A.INK; c.stroke(); A.circle(c, 0, -2, 8, '#9aa3ad', A.INK, 1.2); A.circle(c, 0, -6, 4, '#cfa878'); c.restore();
          c.save(); c.setLineDash([4, 3]); c.strokeStyle = A.rgba('#3a2618', 0.75); c.lineWidth = 1.5; c.translate(286, 50); A.rr(c, -6, 0, 12, 30, 4); c.stroke(); c.beginPath(); c.rect(-2, 30, 4, 32); c.stroke(); c.restore();
          // bench
          A.wood(c, 44, 164, 14, 70, '#6b4423'); A.wood(c, 342, 164, 14, 70, '#6b4423');
          A.wood(c, 34, 148, 332, 16, '#9a6436', { r: 2 }); A.wood(c, 40, 164, 320, 9, '#7a4a26', { r: 0 });
          A.wood(c, 166, 175, 78, 28, '#8a5a30', { r: 3 }); A.brass(c, 194, 186, 22, 6, 3);
          A.rr(c, 188, 177, 34, 8, 2); c.fillStyle = '#2a1d14'; c.fill();
          // vise
          A.box(c, 62, 134, 58, 14, '#6d7a84', { r: 2 }); A.box(c, 66, 114, 16, 22, '#7d8a94', { r: 2 }); A.box(c, 98, 114, 16, 22, '#7d8a94', { r: 2 });
          c.strokeStyle = A.INK; c.lineWidth = 3; c.beginPath(); c.moveTo(114, 126); c.lineTo(134, 126); c.stroke(); c.beginPath(); c.moveTo(134, 116); c.lineTo(134, 138); c.stroke();
          if (!S.viseOpen) { c.save(); c.translate(90, 112); c.rotate(-Math.PI / 2); drawBlade(c, 0, 0, 0.55); c.restore(); }
          // lamp and mug
          A.light(c, 312, 122, 90, '#ffd08a', 0.3);
          c.strokeStyle = A.INK; c.lineWidth = 3; c.beginPath(); c.moveTo(300, 148); c.lineTo(300, 110); c.lineTo(318, 96); c.stroke();
          c.beginPath(); c.moveTo(306, 92); c.lineTo(330, 92); c.lineTo(326, 108); c.lineTo(310, 108); c.closePath(); c.fillStyle = '#4f7a52'; c.fill(); c.lineWidth = 1.4; c.stroke();
          A.box(c, 262, 130, 16, 18, '#e8e0cc', { r: 3 }); c.strokeStyle = A.INK; c.lineWidth = 1.4; c.beginPath(); c.arc(279, 139, 5, -1.2, 1.2); c.stroke();
          end(c, t);
        },
        spots: S => [
          spot('pegboard', 70, 34, 260, 86, { say: '道具がきちんと掛けてある。ドライバーの場所だけ空いている' }),
          spot('lamp', 290, 88, 50, 60, { say: '作業灯があたたかく光っている' }),
          spot('vise', 56, 100, 84, 50, { go: 'vise1' }),
          spot('drawer', 160, 170, 90, 36, { go: 'drawer1' }),
        ],
      },
      w2: {
        draw(c, S, t) {
          A.room(c, PAL);
          for (const sy of [92, 152]) { A.wood(c, 56, sy, 288, 9, '#8a5a30', { r: 1 }); for (const bx of [76, 316]) { c.fillStyle = '#5a3a1a'; c.beginPath(); c.moveTo(bx, sy + 9); c.lineTo(bx + 8, sy + 9); c.lineTo(bx, sy + 24); c.closePath(); c.fill(); } }
          const bc = ['#7a3a3a', '#3a5a7a', '#5a7a3a', '#8a6a2a', '#5a3a6a'];
          bc.forEach((col, i) => A.book(c, 76 + i * 15, 46 + (i % 2) * 6, 14, 46 - (i % 2) * 6, col));
          c.save(); c.translate(160, 92); c.rotate(-0.25); A.book(c, 0, -40, 14, 40, '#7a5a3a'); c.restore();
          A.plant(c, 300, 84, 0.8);
          A.circle(c, 240, 72, 16, '#f6efe0', A.INK, 1.6); c.strokeStyle = A.INK; c.lineWidth = 1.5; c.beginPath(); c.moveTo(240, 72); c.lineTo(240, 62); c.moveTo(240, 72); c.lineTo(247, 76); c.stroke(); A.box(c, 228, 86, 24, 6, '#8a5a30', { r: 1 });
          JARS.forEach((j, i) => { const x = 92 + i * 84; A.jar(c, x, 104, 46, 48, j.lid, j.tint); screwsIn(c, x + 4, 112, 38, 38, SCREWS[j.k], 0.55); });
          A.wood(c, 182, 196, 40, 8, '#9a6436', { r: 2 }); A.wood(c, 186, 204, 6, 28, '#6b4423'); A.wood(c, 212, 204, 6, 28, '#6b4423');
          end(c, t);
        },
        spots: S => [
          spot('books', 70, 40, 110, 52, { say: '古い本が並んでいる' }),
          spot('stool', 178, 192, 48, 42, { say: '小さなすわり台' }),
          spot('jars', 84, 100, 236, 54, { go: 'jars' }),
        ],
      },
      w3: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.nightWindow(c, 144, 34, 112, 94);
          A.wood(c, 136, 132, 128, 8, '#8a5a30', { r: 2 });
          // vent plate
          A.box(c, 164, 168, 72, 46, '#5a5a5e', { r: 3 });
          if (!S.ventOpen) {
            A.box(c, 166, 170, 68, 42, '#a9b0b6', { r: 3 });
            c.strokeStyle = '#4a5056'; c.lineWidth = 2; for (let y = 180; y < 206; y += 6) { c.beginPath(); c.moveTo(178, y); c.lineTo(222, y); c.stroke(); }
            for (const [x, y] of [[171, 175], [229, 175], [171, 207], [229, 207]]) A.screwHead(c, x, y, 3.2);
          } else {
            A.rr(c, 168, 172, 64, 38, 2); c.fillStyle = '#1a120c'; c.fill();
            if (!S.got.card) { c.fillStyle = '#efe2c4'; c.fillRect(186, 184, 28, 20); c.strokeStyle = A.INK; c.lineWidth = 1; c.strokeRect(186, 184, 28, 20); A.circle(c, 192, 196, 2.6, '#3a6ec8'); A.circle(c, 200, 196, 2.6, '#c8402a'); A.circle(c, 208, 196, 2.6, '#e8b830'); }
            c.save(); c.translate(236, 214); c.rotate(0.2); A.box(c, 0, -6, 66, 8, '#a9b0b6', { r: 2 }); c.restore();
          }
          A.plant(c, 92, 228, 1.1);
          c.save(); c.translate(338, 232); c.rotate(-0.18); A.wood(c, -3, -130, 6, 120, '#b07a40'); c.beginPath(); c.moveTo(-14, -12); c.lineTo(14, -12); c.lineTo(20, 4); c.lineTo(-20, 4); c.closePath(); c.fillStyle = '#d8b060'; c.fill(); c.strokeStyle = A.INK; c.stroke(); c.restore();
          end(c, t);
        },
        spots: S => [
          spot('window', 140, 30, 120, 102, { say: '夜空に月が出ている' }),
          spot('plant', 68, 186, 50, 46, { say: '元気な鉢植え' }),
          spot('broom', 312, 100, 46, 136, { say: 'ちりとりとほうき' }),
          spot('vent', 158, 162, 84, 58, {
            use: it => { if (it !== 'driver' || S.ventOpen) return false; S.ventOpen = 1; K.take('driver'); K.ok(); K.say('ネジを外すと、板が開いた'); K.go('vent1'); return true; },
            tap: () => { if (S.ventOpen) K.go('vent1'); else K.say('ネジ4本で留めた金属の板'); },
          }),
        ],
      },
      letter1: {
        back: 'w0',
        draw(c, S) {
          A.zoomBg(c, '#9a5e32');
          A.paper(c, 50, 18, 300, 262, -0.01);
          A.fitWrap(c, T('見習いへ\n\nわしはしばらく旅に出る。この工房の5つの部屋には、それぞれからくりの鍵をかけておいた。全部ほどいて屋根裏まで来られたら、一人前の職人と認めよう。\n\n――親方'), 74, 42, 252, 226, { size: 14, color: '#3a2618' });
          A.zoomEnd(c);
        },
        spots: () => [],
      },
      apron: {
        back: 'w0',
        draw(c, S) {
          A.zoomBg(c, '#c48a4e');
          c.beginPath(); c.moveTo(130, 10); c.lineTo(270, 10); c.lineTo(296, 90); c.lineTo(310, 300); c.lineTo(90, 300); c.lineTo(104, 90); c.closePath();
          c.fillStyle = A.lg(c, 90, 10, 310, 300, ['#7aa0c8', '#46688f']); c.fill(); c.lineWidth = 2; c.strokeStyle = A.INK; c.stroke();
          c.setLineDash([5, 4]); c.strokeStyle = A.rgba('#ffffff', 0.4); c.beginPath(); c.moveTo(112, 96); c.lineTo(288, 96); c.stroke(); c.setLineDash([]);
          if (!S.got.driver) { c.save(); c.translate(214, 168); c.rotate(-1.35); drawDriver(c, 0, 0, 1.7, 0); c.restore(); }
          A.rr(c, 140, 150, 120, 84, 8); c.fillStyle = A.lg(c, 0, 150, 0, 234, ['#4e7098', '#36557a']); c.fill(); c.lineWidth = 2; c.strokeStyle = A.INK; c.stroke();
          c.setLineDash([4, 4]); c.strokeStyle = A.rgba('#ffffff', 0.5); A.rr(c, 146, 156, 108, 72, 6); c.stroke(); c.setLineDash([]);
          A.zoomEnd(c);
        },
        spots: S => [spot('pocket', 132, 110, 136, 130, { tap: () => { if (!S.got.driver) K.give('driver'); else K.say('ポケットはからっぽ'); } })],
      },
      drawer1: {
        back: 'w1',
        draw(c, S) {
          A.zoomBg(c, '#7a4a26');
          if (!S.drawerOpen) {
            A.wood(c, 40, 50, 320, 210, '#8a5a30', { r: 8 });
            A.brass(c, 108, 72, 184, 156, 10);
            S.dial.forEach((d, i) => { const x = 150 + i * 50; A.arrow(c, x, 98, 'U', 34); A.dial(c, x - 20, 120, 40, 52, d); A.arrow(c, x, 196, 'D', 34); });
            A.brass(c, 172, 236, 56, 12, 6);
          } else {
            A.wood(c, 40, 110, 320, 150, '#7a4a26', { r: 6 });
            c.fillStyle = A.lg(c, 0, 120, 0, 240, ['#3a2416', '#5a3a22']); c.fillRect(56, 122, 288, 124);
            A.wood(c, 30, 230, 340, 46, '#8a5a30', { r: 6 }); A.brass(c, 172, 248, 56, 12, 6);
            if (!S.got.bow) drawBow(c, 190, 186, 2.2);
            else A.text(c, '', 200, 180);
          }
          A.zoomEnd(c);
        },
        spots: S => {
          if (S.drawerOpen) return [spot('inside', 56, 122, 288, 108, { tap: () => { if (!S.got.bow) K.give('bow'); else K.say('引き出しの中はからっぽ'); } }), spot('bow', 150, 150, 100, 72, { tap: () => { if (!S.got.bow) K.give('bow'); else K.say('引き出しの中はからっぽ'); } })];
          const l = [];
          [0, 1, 2].forEach(i => {
            const x = 150 + i * 50, set = d => { S.dial[i] = (S.dial[i] + d + 10) % 10; K.sfx('tap'); if (S.dial.join('') === '572') { S.drawerOpen = 1; K.ok(); K.say('カチッ！引き出しが開いた'); } };
            l.push(circ('d' + i + 'u', x, 98, 22, { tap: () => set(1) }), circ('d' + i + 'd', x, 196, 22, { tap: () => set(-1) }));
          });
          l.unshift(spot('plate', 40, 50, 320, 210, { say: '引き出しに、3つの数字の錠がついている' }));
          return l;
        },
      },
      vise1: {
        back: 'w1',
        draw(c, S, t) {
          A.zoomBg(c, '#7a4a26', { table: 200, tableCol: '#9a6436' });
          const open = S.viseOpen ? 40 : 0;
          A.box(c, 70, 170, 200, 34, '#5d6a74', { r: 4 });
          A.box(c, 90, 70, 60, 104, '#7d8a94', { r: 4 });
          A.box(c, 156 + open, 70, 60, 104, '#7d8a94', { r: 4 });
          c.fillStyle = A.rgba('#000000', 0.25); for (let y = 76; y < 96; y += 4) { c.fillRect(140, y, 10, 2); c.fillRect(156 + open, y, 10, 2); }
          if (!S.viseOpen) { c.save(); c.translate(153, 64); c.rotate(-Math.PI / 2); drawBlade(c, -40, 0, 1.3); c.restore(); }
          else if (!S.got.blade) drawBlade(c, 120, 230, 2);
          c.fillStyle = A.lg(c, 0, 116, 0, 128, ['#d8dde2', '#7d868e']); c.fillRect(216 + open, 116, 90 - open, 12); c.strokeStyle = A.INK; c.lineWidth = 1.4; c.strokeRect(216 + open, 116, 90 - open, 12);
          c.save(); c.translate(306, 122); c.rotate(S.viseOpen ? 1.2 : 0);
          c.fillStyle = A.lg(c, -5, 0, 5, 0, ['#d8dde2', '#7d868e']); c.fillRect(-5, -60, 10, 120); c.strokeRect(-5, -60, 10, 120);
          A.circle(c, 0, -62, 9, '#c8402a', A.INK, 1.4); A.circle(c, 0, 62, 9, '#c8402a', A.INK, 1.4); c.restore();
          A.zoomEnd(c);
        },
        spots: S => {
          const l = [spot('jaws', 90, 60, 130, 116, { tap: () => K.say(S.viseOpen ? 'もう何もはさまっていない' : '万力に、ギザギザの金具がはさまっている') }),
            spot('handle', 266, 50, 80, 150, { tap: () => { if (!S.viseOpen) { S.viseOpen = 1; K.sfx('drop'); K.anim(300); K.say('ハンドルを回すと、万力の口が開いた'); } else K.say('もう何もはさまっていない'); } })];
          if (S.viseOpen && !S.got.blade) l.push(spot('blade', 110, 210, 100, 50, { tap: () => K.give('blade') }));
          return l;
        },
      },
      jars: {
        back: 'w2',
        draw(c, S) {
          A.zoomBg(c, '#c48a4e', { table: 236, tableCol: '#8a5a30' });
          JARS.forEach((j, i) => { const x = 36 + i * 116; A.jar(c, x, 56, 98, 180, j.lid, j.tint); screwsIn(c, x + 8, 70, 82, 160, SCREWS[j.k], 1.35); });
          A.zoomEnd(c);
        },
        spots: () => JARS.map((j, i) => spot('jar_' + j.k, 36 + i * 116, 56, 98, 180, { say: 'びんの中にネジが入っている。数えられそうだ' })),
      },
      vent1: {
        back: 'w3',
        draw(c, S) {
          A.zoomBg(c, '#c48a4e');
          A.box(c, 60, 40, 280, 220, '#5a5a5e', { r: 8 });
          c.fillStyle = A.rg(c, 200, 150, 20, 200, ['#3a2a1e', '#120c08']); A.rr(c, 76, 56, 248, 188, 4); c.fill();
          if (!S.got.card) { c.save(); c.translate(130, 100); c.rotate(-0.06); drawCard(c, 0, 0, 140, 92); c.restore(); }
          A.zoomEnd(c);
        },
        spots: S => [spot('box', 60, 40, 280, 220, { say: '板の中はからっぽ' }), ...(!S.got.card ? [spot('card', 120, 90, 160, 112, { tap: () => K.give('card') })] : [])],
      },
    };

    return {
      id: 'r1', name: '作業場', par: 6 * 60000,
      intro: '親方の工房に住みこんで3年。ある朝目をさますと、工房のドアというドアに鍵がかかり、親方の姿がない。作業場のドアに、手紙がピンで留めてある…',
      outro: '真ちゅうの鍵で、作業場のドアが開いた。廊下の先から、チクタクと時計の音が聞こえてくる。',
      init: () => ({ got: {}, dial: [0, 0, 0], ventOpen: 0, drawerOpen: 0, viseOpen: 0 }),
      items, views,
      combos: [{ a: 'bow', b: 'blade', out: 'key' }],
      puzzles: [
        { id: 'apron', name: 'ドアの横のエプロン', done: S => !!S.got.driver, hints: ['ドアの横に何か掛かっている', 'エプロンにはポケットがある', 'エプロンをタップして近づき、ポケットをタップするとドライバーが手に入る'] },
        { id: 'vent', name: '窓の下の金属の板', done: S => !!S.ventOpen, hints: ['窓の下の板は、4本のネジで留めてある', 'ネジを回す道具がどこかにある（ドアの横を見てみよう）', 'ドライバーを選んでから、窓の下の板をタップ'] },
        { id: 'drawer', name: '作業台の引き出しの錠（3けた）', done: S => !!S.drawerOpen, hints: ['3けたの数字は、部屋のどこかで数えられる', '棚のびんの中のネジを数えよう。色のカード（窓の下の板の中）の並びが順番', 'カードは 青→赤→黄。ネジは青5・赤7・黄2。答えは 5・7・2'] },
        { id: 'vise', name: '万力', done: S => !!S.got.blade, hints: ['作業台の左の万力に、何かはさまっている', '万力のハンドルを回すと口が開く', '万力をタップして近づき、ハンドルをタップ'] },
        { id: 'key', name: 'ふたつの部品', avail: S => !!(S.got.bow && S.got.blade), done: S => !!S.got.key, hints: ['持ち物どうしを組み合わせられる', '鍵の持ち手と鍵の先は、1本の鍵になりそうだ', '持ち手を選んでから、鍵の先をタップ'] },
        { id: 'door', name: '作業場のドア', avail: S => !!S.got.key, done: () => false, hints: ['鍵ができたら、どこに使う？', '作業場のドアには鍵穴がある', '鍵を選んでドアをタップ'] },
      ],
      // the intended solution (also played with real clicks by tools/tests/escape-play.js)
      route: ['R', 'L', 's:letter', 'B', 's:apron', 's:pocket', 'B', 'w:3', 'i:driver', 's:vent', 's:card', 'i:card', 'i:card', 'B', 'B',
        'w:2', 's:jars', 'B', 'w:1', 's:drawer', 's:d0u', 's:d0u', 's:d0u', 's:d0u', 's:d0u', 's:d1d', 's:d1d', 's:d1d', 's:d2u', 's:d2u', 's:bow', 'B',
        's:vise', 's:handle', 's:blade', 'B', 'i:bow', 'i:blade', 'w:0', 's:door'],
    };
  };
})(window);
