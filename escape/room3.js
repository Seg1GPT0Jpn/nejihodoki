// からくり工房からの脱出：部屋3「灯りの部屋」（光と色）
// なぞ：額の絵の道すじ（上・右・下・右）→ 戸棚（電球）→ 光の台（鏡3枚で光を水晶へ）→ 色ガラスの板
//       → ステンドグラス（押すと上下左右も変わる。スケッチの形＝四すみとまん中）→ 3つの宝石の色 → 扉のレンズ（ポスターの光の混ぜ方）
(function (root) {
  'use strict';
  const ER = root.EscapeRooms;
  if (root.KoboI18n) KoboI18n.add({ en: {
    '灯りの部屋': 'The Lantern Room',
    '灯りの部屋。色ガラスやレンズがならぶ、親方のお気に入りの部屋だ。窓から夜の青い光が差しこんでいる。': "The lantern room: colored glass and lenses everywhere — the Master's favourite. Blue night light falls through the window.",
    '3つのレンズが黄・水色・赤紫に光ると、扉が静かにひらいた。奥から、木と油のにおいがする。': 'When the three lenses glow yellow, cyan and magenta, the door swings quietly open. It smells of wood and oil beyond.',
    '窓のからくり\n\n光る窓が、扉の色を教えてくれる。': 'The window gadget\n\nA glowing window tells you the colors of the door.',
    '電球': 'Light bulb', '小さな電球。どこかのランプに合いそうだ': 'A small bulb. It should fit a lamp somewhere',
    '色ガラスの板': 'Colored glass pane', 'ステンドグラスの1枚。四角い': 'One square pane of stained glass',
    '戸棚の矢印の錠': 'The arrow lock on the cupboard', '光の台': 'The light table', 'ステンドグラスの窓': 'The stained-glass window', '扉の3つのレンズ': 'The three lenses on the door',
    '矢印を4つ入れる錠。どこかに道すじの絵がある': 'A lock that takes 4 arrows. A picture of a path is somewhere', '机の上の額の絵：●から★まで、線をたどる': 'The framed picture above the desk: follow the line from ● to ★',
    '上→右→下→右': 'Up → right → down → right',
    '台の左のランプには電球がない': 'The lamp on the left of the table has no bulb', '電球を入れたら、鏡をタップして向きを変え、光を水晶へ': 'With a bulb in, tap mirrors to turn them and send the light to the crystal',
    '光が最初に当たる鏡を＼、2番目を／、3番目を／にする（ほかの鏡は関係ない）': 'Set the first mirror the light hits to ＼, the second to ／ and the third to ／ (the others do not matter)',
    '窓のガラスが1枚欠けている。光の台の引き出しに？': 'One pane of the window is missing. Maybe in the light table drawer?', 'ガラスを押すと、そのガラスと上下左右がまとめて光ったり消えたりする。机の上のスケッチの形にする': 'Pressing a pane switches it and the panes above, below, left and right. Make the shape on the sketch on the desk',
    '四すみとまん中だけを光らせる。上のまん中・左下・右下の3枚を1回ずつ押す': 'Only the four corners and the centre should glow. Press top-middle, bottom-left and bottom-right once each',
    '扉のレンズは、赤・緑・青の光を混ぜて色を作る': 'The lenses on the door mix red, green and blue light', '窓の宝石の色（左から 黄・水色・赤紫）を、壁のポスターの混ぜ方で作る': 'Make the colors of the window gems (yellow, cyan, magenta from the left) using the mixing poster',
    '左：赤＋緑、まん中：緑＋青、右：赤＋青': 'Left: red + green, middle: green + blue, right: red + blue',
    '扉の上に3つのレンズ。今は暗い': 'Three lenses on the door. They are dark now', '錠がはずれた！扉が開く': 'The lock clicks open! The door opens',
    'ステンドグラスの窓。1枚欠けている': 'A stained-glass window with one pane missing', '1枚欠けていて、からくりが動かない': 'With a pane missing, the gadget will not move',
    'ぴったりはまった': 'It fits perfectly', '窓がかがやき、下に3つの宝石が光った！': 'The window shines, and three gems light up below it!',
    '机の上にスケッチ': 'A sketch on the desk', '夜の蛾の絵。点と線が描いてある': 'A drawing of a night moth with dots and a line',
    '矢印の錠。4つ入れると開きそうだ': 'An arrow lock. It should open after 4 arrows', '戸棚が開いた！': 'The cupboard opens!', 'ガチャ。開かない…順番がちがうようだ': 'Clunk. Still shut… wrong order',
    '光の台。鏡と水晶が並んでいる': 'The light table: mirrors and a crystal', '電球が光った！': 'The bulb lights up!', '電球のないランプ': 'A lamp with no bulb',
    '水晶が光り、台の引き出しが開いた！': 'The crystal glows and the table drawer opens!', '木の箱。光を止める': 'A wooden block. It stops the light',
    '光の混ぜ方のポスター': 'A poster on mixing light', '戸棚の中はからっぽ': 'The cupboard is empty', 'ランプが静かに光っている': 'The lamp glows softly',
    'こむぎが棚の上で眠っている': 'Komugi is asleep on the shelf', '鏡': 'Mirror',
  } });

  ER.defs[2] = (K, A, H) => {
    const T = K.T, { spot, circ } = H;
    const PAL = { wall: '#3d4a6b', wall2: '#e8e0ff', pattern: 'stars', wains: '#4a3326', floor: '#4e3628', fy: 232 };
    const end = c => A.vignette(c, 0.5);
    const meow = () => K.tone(760, 0.16, { type: 'triangle', vol: 0.06, slide: 520 });
    const MIX = bits => { const [r, g, b] = bits; if (!r && !g && !b) return '#1e2436'; return 'rgb(' + (r ? 255 : 30) + ',' + (g ? (r && !b ? 226 : 230) : 40) + ',' + (b ? 240 : 40) + ')'; };
    const GOAL = [[1, 1, 0], [0, 1, 1], [1, 0, 1]];
    const GEMS = [MIX([1, 1, 0]), MIX([0, 1, 1]), MIX([1, 0, 1])];
    // --- light table ---
    const GX = 74, GY = 58, CS = 42, COLS = 6, ROWS = 4;
    const MIRRORS = [[3, 0], [3, 2], [1, 2], [5, 1], [4, 3]];
    const BLOCKS = [[0, 2], [5, 3], [2, 1]];
    const CRYSTAL = [1, 3];
    const cellC = (cx, cy) => [GX + cx * CS + CS / 2, GY + cy * CS + CS / 2];
    function trace(S) { // → { pts, hit }
      let x = -1, y = 0, dx = 1, dy = 0; const pts = [[GX - 8, GY + CS / 2]];
      for (let n = 0; n < 40; n++) {
        x += dx; y += dy;
        if (x < 0 || y < 0 || x >= COLS || y >= ROWS) { pts.push([GX + (x + 0.5 - dx * 0.5) * CS + (dx ? 0 : 0), GY + (y + 0.5 - dy * 0.5) * CS]); return { pts, hit: false }; }
        const c = cellC(x, y);
        if (x === CRYSTAL[0] && y === CRYSTAL[1]) { pts.push(c); return { pts, hit: true }; }
        if (BLOCKS.some(b => b[0] === x && b[1] === y)) { pts.push([c[0] - dx * CS * 0.3, c[1] - dy * CS * 0.3]); return { pts, hit: false }; }
        const mi = MIRRORS.findIndex(m => m[0] === x && m[1] === y);
        if (mi >= 0) { pts.push(c); const slash = S.mir[mi] === 0; const ndx = slash ? -dy : dy, ndy = slash ? -dx : dx; dx = ndx; dy = ndy; }
      }
      return { pts, hit: false };
    }
    // --- stained glass ---
    const PX = 122, PY = 26, PS = 50, PG = 4;
    const paneXY = i => [PX + (i % 3) * (PS + PG), PY + Math.floor(i / 3) * (PS + PG)];
    const PANECOL = ['#f0a840', '#4ac8c0', '#e86a8a', '#7ab84a', '#ffd84a', '#5a8ae8', '#e8784a', '#b07ae0', '#4ab8e8'];
    const TARGET = [1, 0, 1, 0, 1, 0, 1, 0, 1];
    function press(S, i) { const r = Math.floor(i / 3), c = i % 3; for (const [dr, dc] of [[0, 0], [1, 0], [-1, 0], [0, 1], [0, -1]]) { const rr = r + dr, cc = c + dc; if (rr >= 0 && rr < 3 && cc >= 0 && cc < 3) S.lit[rr * 3 + cc] ^= 1; } }
    function glassWindow(c, S, x, y, s) {
      c.save(); c.translate(x, y); c.scale(s, s);
      A.wood(c, PX - 14, PY - 14, 3 * PS + 2 * PG + 28, 3 * PS + 2 * PG + 28 + 50, '#5a3a22', { r: 6 });
      c.fillStyle = '#141826'; c.fillRect(PX - 4, PY - 4, 3 * PS + 2 * PG + 8, 3 * PS + 2 * PG + 8);
      for (let i = 0; i < 9; i++) {
        const [px, py] = paneXY(i);
        if (i === 8 && !S.tileIn) { c.fillStyle = '#0a0c14'; c.fillRect(px, py, PS, PS); c.strokeStyle = A.rgba('#ffffff', 0.15); c.setLineDash([3, 3]); c.strokeRect(px + 3, py + 3, PS - 6, PS - 6); c.setLineDash([]); continue; }
        const on = S.lit[i];
        c.fillStyle = on ? A.lg(c, px, py, px + PS, py + PS, [A.shade(PANECOL[i], 0.45), PANECOL[i]]) : A.lg(c, px, py, px + PS, py + PS, ['#2e3650', '#1c2236']);
        c.fillRect(px, py, PS, PS);
        c.strokeStyle = A.rgba(on ? '#ffffff' : '#8890b0', on ? 0.5 : 0.2); c.lineWidth = 1.2; c.beginPath(); c.moveTo(px + 6, py + 6); c.lineTo(px + PS - 6, py + PS - 6); c.moveTo(px + PS - 6, py + 6); c.lineTo(px + 6, py + PS - 6); c.stroke();
        if (on) A.glow(c, px + PS / 2, py + PS / 2, PS * 0.8, PANECOL[i], 0.25);
        c.strokeStyle = '#2a1a10'; c.lineWidth = 2; c.strokeRect(px, py, PS, PS);
      }
      // the gems under the window
      GEMS.forEach((g, i) => {
        const gx = PX + 25 + i * 54, gy = PY + 3 * PS + 2 * PG + 26;
        c.beginPath(); c.moveTo(gx, gy - 12); c.lineTo(gx + 12, gy - 3); c.lineTo(gx + 7, gy + 12); c.lineTo(gx - 7, gy + 12); c.lineTo(gx - 12, gy - 3); c.closePath();
        c.fillStyle = S.glassOK ? g : '#2a2e3e'; c.fill(); c.strokeStyle = A.INK; c.lineWidth = 1.4; c.stroke();
        if (S.glassOK) { A.glow(c, gx, gy, 26, '#ffffff', 0.3); c.strokeStyle = A.rgba('#ffffff', 0.7); c.beginPath(); c.moveTo(gx - 5, gy - 4); c.lineTo(gx, gy - 9); c.stroke(); }
      });
      c.restore();
    }
    function bulbIcon(c, s) { const x = s / 2, y = s * 0.42; A.circle(c, x, y, s * 0.24, A.rg(c, x - 3, y - 3, 1, s * 0.26, ['#fffbe8', '#ffe8a0']), A.INK, 1.4); A.brass(c, x - s * 0.12, y + s * 0.2, s * 0.24, s * 0.2, 2); c.strokeStyle = '#c8962e'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 3, y + 2); c.lineTo(x, y - 4); c.lineTo(x + 3, y + 2); c.stroke(); }
    function tileIcon(c, s) { c.fillStyle = A.lg(c, s * 0.2, s * 0.2, s * 0.8, s * 0.8, ['#9ad8f0', '#4ab8e8']); c.fillRect(s * 0.2, s * 0.2, s * 0.6, s * 0.6); c.strokeStyle = '#2a1a10'; c.lineWidth = 2; c.strokeRect(s * 0.2, s * 0.2, s * 0.6, s * 0.6); c.strokeStyle = A.rgba('#ffffff', 0.6); c.lineWidth = 1.2; c.beginPath(); c.moveTo(s * 0.28, s * 0.28); c.lineTo(s * 0.72, s * 0.72); c.moveTo(s * 0.72, s * 0.28); c.lineTo(s * 0.28, s * 0.72); c.stroke(); }
    const items = {
      bulb: { name: '電球', desc: '小さな電球。どこかのランプに合いそうだ', icon: bulbIcon },
      tile: { name: '色ガラスの板', desc: 'ステンドグラスの1枚。四角い', icon: tileIcon },
    };
    // the moth picture: a 4×4 grid of dots and a path from ● to ★
    const PATH = [[0, 3], [0, 1], [2, 1], [2, 2], [3, 2]];
    function mothPic(c, x, y, s) {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.fillStyle = '#f3e6c8'; c.fillRect(0, 0, 200, 200);
      const p = (i, j) => [34 + i * 44, 34 + j * 44];
      for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) A.circle(c, ...p(i, j), 3.5, '#9a8a70');
      c.strokeStyle = '#3a2618'; c.lineWidth = 4; c.lineCap = 'round'; c.lineJoin = 'round';
      c.beginPath(); PATH.forEach((q, k) => { const [px, py] = p(...q); if (k) c.lineTo(px, py); else c.moveTo(px, py); }); c.stroke();
      for (let k = 1; k < PATH.length; k++) { const [ax, ay] = p(...PATH[k - 1]), [bx, by] = p(...PATH[k]); const mx = (ax + bx) / 2, my = (ay + by) / 2, a = Math.atan2(by - ay, bx - ax); c.save(); c.translate(mx, my); c.rotate(a); c.beginPath(); c.moveTo(9, 0); c.lineTo(-6, -8); c.lineTo(-6, 8); c.closePath(); c.fillStyle = '#c8402a'; c.fill(); c.restore(); }
      const [sx, sy] = p(...PATH[0]); A.circle(c, sx, sy, 9, '#3a2618');
      const [ex, ey] = p(...PATH[PATH.length - 1]); A.sym(c, 'star', ex, ey, 26, '#ffd84a', { lw: 1.6 });
      // a moth near the start
      c.save(); c.translate(sx + 22, sy - 14); c.fillStyle = '#b8a888'; c.strokeStyle = '#3a2618'; c.lineWidth = 1.2;
      for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * 7, 0, 8, 5, d * 0.5, 0, Math.PI * 2); c.fill(); c.stroke(); }
      c.fillStyle = '#5a4a30'; c.fillRect(-1.5, -6, 3, 12); c.restore();
      c.restore();
    }
    function sketchPic(c, x, y, s) {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.beginPath(); c.moveTo(20, 50); c.quadraticCurveTo(80, -10, 140, 50); c.strokeStyle = '#3a2618'; c.lineWidth = 2; c.stroke();
      for (let i = 0; i < 9; i++) { const px = 26 + (i % 3) * 38, py = 52 + Math.floor(i / 3) * 38; c.fillStyle = TARGET[i] ? '#f0a840' : '#f8f0dc'; c.fillRect(px, py, 34, 34); c.strokeStyle = '#3a2618'; c.lineWidth = 1.6; c.strokeRect(px, py, 34, 34); if (TARGET[i]) for (let k = 0; k < 4; k++) { c.beginPath(); c.moveTo(px + 4 + k * 8, py + 30); c.lineTo(px + 10 + k * 8, py + 4); c.strokeStyle = A.rgba('#3a2618', 0.4); c.lineWidth = 1; c.stroke(); } }
      c.restore();
    }
    function poster(c, x, y, s) {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.fillStyle = '#10121c'; c.fillRect(0, 0, 240, 220);
      c.save(); c.globalCompositeOperation = 'lighter';
      A.circle(c, 92, 74, 44, '#ff2828'); A.circle(c, 148, 74, 44, '#28ff28'); A.circle(c, 120, 122, 44, '#2828ff');
      c.restore();
      c.restore();
      c.save(); c.translate(x, y); c.scale(s, s);
      const r2 = (xx, yy, a, b, r) => { A.circle(c, xx, yy, 7, a, '#fff', 1); A.text(c, '+', xx + 13, yy, { size: 12, color: '#fff' }); A.circle(c, xx + 26, yy, 7, b, '#fff', 1); A.text(c, '=', xx + 39, yy, { size: 12, color: '#fff' }); A.circle(c, xx + 52, yy, 7, r, '#fff', 1); };
      c.fillStyle = '#10121c'; c.fillRect(0, 168, 240, 52);
      r2(14, 194, '#ff2828', '#28ff28', MIX([1, 1, 0])); r2(94, 194, '#28ff28', '#2828ff', MIX([0, 1, 1])); r2(174, 194, '#ff2828', '#2828ff', MIX([1, 0, 1]));
      c.restore();
    }
    function lensDoor(c, S, x, y, s) { // three small lenses
      for (let i = 0; i < 3; i++) { const lx = x + (i - 1) * 22 * s, col = MIX(S.lens[i]); A.circle(c, lx, y, 9 * s, A.rg(c, lx - 3, y - 3, 1, 10 * s, [A.shade(col === '#1e2436' ? '#3a4260' : col, 0.4), col]), '#5a3a0c', 1.6); if (col !== '#1e2436') A.glow(c, lx, y, 22 * s, col, 0.35); }
    }

    const views = {
      w0: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.door(c, 64, 52, 96, 180, '#6a4a3a', { open: S.lensOK });
          if (!S.lensOK) { A.brass(c, 76, 72, 72, 26, 6); lensDoor(c, S, 112, 85, 1); }
          glassWindow(c, S, 140, -2, 0.64);
          A.light(c, 252, 70, 120, S.glassOK ? '#fff0c0' : '#8aa0ff', S.glassOK ? 0.25 : 0.12);
          A.plant(c, 360, 228, 0.9);
          end(c);
        },
        spots: S => [
          spot('window', 210, 6, 136, 170, { go: 'glass3' }),
          spot('door', 60, 50, 104, 184, { tap: () => { if (S.lensOK) K.exit(); else K.go('lens3'); } }),
        ],
      },
      w1: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.frame(c, 84, 30, 92, 92, '#6b4423'); mothPic(c, 89, 35, 82 / 200);
          A.wood(c, 50, 150, 300, 14, '#7a4a2a', { r: 2 }); A.wood(c, 60, 164, 10, 68, '#5a3a22'); A.wood(c, 330, 164, 10, 68, '#5a3a22');
          c.save(); c.translate(214, 136); c.rotate(0.05); c.fillStyle = '#f6efe0'; c.fillRect(0, 0, 62, 16); c.strokeStyle = A.INK; c.lineWidth = 1; c.strokeRect(0, 0, 62, 16); for (let i = 0; i < 3; i++) { c.fillStyle = i % 2 ? '#f8f0dc' : '#f0a840'; c.fillRect(6 + i * 9, 4, 8, 8); } c.restore();
          A.light(c, 300, 116, 110, '#ffcf7a', 0.35);
          c.strokeStyle = A.INK; c.lineWidth = 3; c.beginPath(); c.moveTo(300, 150); c.lineTo(300, 116); c.stroke();
          c.beginPath(); c.moveTo(282, 118); c.lineTo(318, 118); c.lineTo(310, 98); c.lineTo(290, 98); c.closePath(); c.fillStyle = '#e8c870'; c.fill(); c.lineWidth = 1.4; c.stroke();
          end(c);
        },
        spots: S => [
          spot('lamp', 278, 94, 46, 58, { say: 'ランプが静かに光っている' }),
          spot('moth', 80, 26, 100, 100, { go: 'moth3' }),
          spot('sketch', 204, 126, 84, 36, { go: 'sketch3' }),
        ],
      },
      w2: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.hangLamp(c, 120, 40); A.hangLamp(c, 280, 52);
          A.wood(c, 70, 200, 12, 32, '#5a3a22'); A.wood(c, 318, 200, 12, 32, '#5a3a22');
          A.wood(c, 56, 128, 288, 74, '#6a4a2e', { r: 4 });
          c.save(); c.translate(56, 128); c.scale(288 / 400, 74 / 300); drawTable(c, S, true); c.restore();
          end(c);
        },
        spots: S => [spot('table', 56, 120, 288, 90, { go: 'beam3' })],
      },
      w3: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.wood(c, 50, 80, 124, 152, '#7a5038', { r: 4 });
          if (S.cupOpen) { A.rr(c, 58, 88, 108, 136, 3); c.fillStyle = '#1a120c'; c.fill(); if (!S.got.bulb) { c.save(); c.translate(92, 134); bulbIcon(c, 40); c.restore(); } }
          else { A.wood(c, 58, 88, 52, 136, '#8a5a3e', { r: 2 }); A.wood(c, 114, 88, 52, 136, '#8a5a3e', { r: 2 }); A.brass(c, 100, 140, 24, 20, 3); A.arrow(c, 112, 150, 'U', 12); }
          A.cat(c, 112, 78, 46, t, '#4a4038');
          A.frame(c, 214, 36, 134, 124, '#5a3a22', '#10121c'); poster(c, 220, 42, 122 / 240);
          end(c);
        },
        spots: S => [
          spot('cat', 84, 46, 60, 36, { tap: () => { meow(); K.say('こむぎが棚の上で眠っている'); } }),
          spot('cupboard', 50, 84, 124, 148, { go: 'cup3' }),
          spot('poster', 214, 36, 134, 124, { go: 'poster3' }),
        ],
      },
      moth3: { back: 'w1', draw(c) { A.zoomBg(c, '#3d4a6b'); A.frame(c, 90, 30, 220, 240, '#6b4423'); mothPic(c, 100, 50, 1); A.zoomEnd(c); }, spots: () => [spot('pic', 90, 30, 220, 240, { say: '夜の蛾の絵。点と線が描いてある' })] },
      sketch3: {
        back: 'w1',
        draw(c) { A.zoomBg(c, '#3d4a6b', { table: 250, tableCol: '#7a4a2a' }); A.paper(c, 60, 16, 280, 264, -0.02); sketchPic(c, 84, 40, 1.05); A.fitWrap(c, T('窓のからくり\n\n光る窓が、扉の色を教えてくれる。'), 236, 60, 92, 200, { size: 13 }); A.zoomEnd(c); },
        spots: () => [],
      },
      poster3: { back: 'w3', draw(c) { A.zoomBg(c, '#3d4a6b'); A.frame(c, 74, 20, 252, 260, '#5a3a22', '#10121c'); poster(c, 80, 26, 1); A.zoomEnd(c); }, spots: () => [spot('poster', 74, 20, 252, 260, { say: '光の混ぜ方のポスター' })] },
      cup3: {
        back: 'w3',
        draw(c, S) {
          A.zoomBg(c, '#3d4a6b');
          if (S.cupOpen) {
            A.wood(c, 60, 10, 280, 290, '#7a5038', { r: 6 }); A.rr(c, 76, 26, 248, 250, 4); c.fillStyle = '#1a120c'; c.fill();
            for (const yy of [110, 200]) A.wood(c, 76, yy, 248, 8, '#5a3a22');
            if (!S.got.bulb) { c.save(); c.translate(170, 40); bulbIcon(c, 70); c.restore(); }
          } else {
            A.wood(c, 60, 10, 280, 290, '#8a5a3e', { r: 6 });
            A.brass(c, 100, 36, 200, 252, 12);
            for (let i = 0; i < 4; i++) { const x = 128 + i * 48; A.rr(c, x - 18, 52, 36, 36, 6); c.fillStyle = '#2a1d14'; c.fill(); if (S.dir[i]) A.arrow(c, x, 70, S.dir[i], 28, true); }
            A.arrow(c, 200, 140, 'U', 44); A.arrow(c, 252, 192, 'R', 44); A.arrow(c, 200, 244, 'D', 44); A.arrow(c, 148, 192, 'L', 44);
            A.circle(c, 200, 192, 12, '#5a3a0c');
          }
          A.zoomEnd(c);
        },
        spots: S => {
          if (S.cupOpen) return [spot('inside', 76, 26, 248, 250, { say: '戸棚の中はからっぽ' }), ...(!S.got.bulb ? [spot('bulb', 160, 30, 90, 90, { tap: () => K.give('bulb') })] : [])];
          const push = d => { S.dir.push(d); K.sfx('tap'); if (S.dir.length === 4) { if (S.dir.join('') === 'URDR') { S.cupOpen = 1; K.ok(); K.say('戸棚が開いた！'); } else { S.dir = []; K.bad(); K.say('ガチャ。開かない…順番がちがうようだ'); } } };
          return [spot('lock', 100, 36, 200, 252, { say: '矢印の錠。4つ入れると開きそうだ' }),
            circ('aU', 200, 140, 26, { tap: () => push('U') }), circ('aR', 252, 192, 26, { tap: () => push('R') }), circ('aD', 200, 244, 26, { tap: () => push('D') }), circ('aL', 148, 192, 26, { tap: () => push('L') })];
        },
      },
      beam3: {
        back: 'w2',
        draw(c, S, t) { drawTable(c, S, false, t); A.zoomEnd(c); },
        spots: S => {
          const l = [spot('board', 0, 0, 400, 300, { say: '光の台。鏡と水晶が並んでいる' })];
          BLOCKS.forEach((b, i) => { const [x, y] = cellC(...b); l.push(spot('block' + i, x - 18, y - 18, 36, 36, { say: '木の箱。光を止める' })); });
          l.push(spot('lamp', 14, GY - 10, 60, 60, { use: it => { if (it !== 'bulb' || S.lampOn) return false; S.lampOn = 1; K.take('bulb'); K.ok(); K.say('電球が光った！'); check(S); return true; }, tap: () => K.say(S.lampOn ? 'ランプが静かに光っている' : '電球のないランプ') }));
          MIRRORS.forEach((m, i) => { const [x, y] = cellC(...m); l.push(circ('m' + i, x, y, 21, { tap: () => { S.mir[i] ^= 1; K.sfx('select'); check(S); } })); });
          if (S.beamOK && !S.got.tile) l.push(spot('tile', 300, 232, 80, 60, { tap: () => K.give('tile') }));
          return l;
        },
      },
      glass3: {
        back: 'w0',
        draw(c, S) { A.zoomBg(c, '#3d4a6b'); glassWindow(c, S, -20, 30, 1.08); A.zoomEnd(c); },
        spots: S => {
          const k = 1.08, ox = -20, oy = 30;
          const l = [spot('frameAll', ox + (PX - 14) * k, oy + (PY - 14) * k, (3 * PS + 2 * PG + 28) * k, (3 * PS + 2 * PG + 78) * k, { say: S.tileIn ? 'ステンドグラスの窓' : 'ステンドグラスの窓。1枚欠けている', use: it => (it === 'tile' ? placeTile(S) : false) })];
          for (let i = 0; i < 9; i++) {
            const [px, py] = paneXY(i);
            const r = [ox + px * k, oy + py * k, PS * k, PS * k];
            if (i === 8 && !S.tileIn) { l.push(spot('frame', ...r, { use: it => (it === 'tile' ? placeTile(S) : false), tap: () => K.say('1枚欠けていて、からくりが動かない') })); continue; }
            l.push(spot('g' + i, ...r, { tap: () => {
              if (!S.tileIn) { K.say('1枚欠けていて、からくりが動かない'); K.sfx('fail'); return; }
              if (S.glassOK) return;
              press(S, i); K.sfx('select');
              if (S.lit.every((v, j) => v === TARGET[j])) { S.glassOK = 1; K.ok(); K.anim(600); K.say('窓がかがやき、下に3つの宝石が光った！'); }
            } }));
          }
          return l;
        },
      },
      lens3: {
        back: 'w0',
        draw(c, S) {
          A.zoomBg(c, '#6a4a3a');
          A.wood(c, 30, 10, 340, 290, '#6a4a3a', { r: 8, vert: true });
          A.brass(c, 50, 24, 300, 112, 14);
          for (let i = 0; i < 3; i++) {
            const lx = 110 + i * 90, col = MIX(S.lens[i]);
            A.circle(c, lx, 80, 40, A.rg(c, lx - 12, 68, 4, 44, [col === '#1e2436' ? '#4a5272' : A.shade(col, 0.5), col]), '#5a3a0c', 3);
            if (col !== '#1e2436') A.glow(c, lx, 80, 70, col, 0.35);
            ['#e8402a', '#3ab84a', '#3a6ee8'].forEach((bc, j) => {
              const on = S.lens[i][j], by = 162 + j * 44;
              A.rr(c, lx - 34, by - 18, 68, 36, 10); c.fillStyle = on ? bc : '#2a1d14'; c.fill(); c.lineWidth = 2; c.strokeStyle = on ? '#fff' : bc; c.stroke();
              A.text(c, 'RGB'[j], lx, by + 1, { size: 16, color: on ? '#fff' : bc });
            });
          }
          if (S.lensOK) A.text(c, '✓', 200, 290, { size: 18, color: '#8fd68a' });
          A.zoomEnd(c);
        },
        spots: S => {
          const l = [spot('plate', 30, 10, 340, 130, { say: '扉の上に3つのレンズ。今は暗い' })];
          for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) {
            const lx = 110 + i * 90, by = 162 + j * 44;
            l.push(spot('l' + i + 'rgb'[j], lx - 38, by - 21, 76, 42, { tap: () => {
              if (S.lensOK) return;
              S.lens[i][j] ^= 1; K.sfx('tap');
              if (S.lens.every((L, a) => L.every((v, b) => v === GOAL[a][b]))) { S.lensOK = 1; K.ok(); K.say('錠がはずれた！扉が開く'); }
            } }));
          }
          if (S.lensOK) l.push(spot('exit', 0, 0, 400, 300, { tap: () => K.exit() }));
          return l;
        },
      },
    };
    function placeTile(S) { if (S.tileIn) return false; S.tileIn = 1; S.lit[8] = 0; K.take('tile'); K.ok(); K.say('ぴったりはまった'); return true; }
    function check(S) {
      if (S.beamOK || !S.lampOn) return;
      if (trace(S).hit) { S.beamOK = 1; K.ok(); K.anim(800); K.say('水晶が光り、台の引き出しが開いた！'); }
    }
    function drawTable(c, S, small, t) {
      A.zoomBg(c, '#3d4a6b');
      A.wood(c, 10, 30, 380, 210, '#6a4a2e', { r: 10 });
      c.fillStyle = '#1e2232'; A.rr(c, GX - 4, GY - 4, COLS * CS + 8, ROWS * CS + 8, 6); c.fill();
      for (let x = 0; x < COLS; x++) for (let y = 0; y < ROWS; y++) { c.strokeStyle = A.rgba('#8890b0', 0.25); c.lineWidth = 1; c.strokeRect(GX + x * CS, GY + y * CS, CS, CS); }
      // lamp
      A.box(c, 20, GY + 2, 46, 38, '#5d6a74', { r: 6 });
      A.circle(c, 58, GY + CS / 2, 11, S.lampOn ? '#fff6c8' : '#2a2e3e', A.INK, 1.5);
      if (S.lampOn) A.glow(c, 58, GY + CS / 2, 40, '#fff0a0', 0.5);
      BLOCKS.forEach(b => { const [x, y] = cellC(...b); A.wood(c, x - 16, y - 16, 32, 32, '#8a5a30', { r: 3 }); });
      // crystal
      const [kx, ky] = cellC(...CRYSTAL);
      c.beginPath(); c.moveTo(kx, ky - 17); c.lineTo(kx + 11, ky - 4); c.lineTo(kx + 7, ky + 15); c.lineTo(kx - 7, ky + 15); c.lineTo(kx - 11, ky - 4); c.closePath();
      c.fillStyle = S.beamOK ? A.lg(c, kx, ky - 17, kx, ky + 15, ['#ffffff', '#9ae0ff']) : A.lg(c, kx, ky - 17, kx, ky + 15, ['#a8c8e0', '#5a7a9a']); c.fill(); c.strokeStyle = A.INK; c.lineWidth = 1.4; c.stroke();
      if (S.beamOK) A.glow(c, kx, ky, 60, '#bfefff', 0.55);
      // beam
      if (S.lampOn) {
        const { pts } = trace(S);
        c.save(); c.globalCompositeOperation = 'lighter'; c.lineCap = 'round'; c.lineJoin = 'round';
        for (const [w, a] of [[10, 0.18], [5, 0.4], [2, 0.9]]) { c.strokeStyle = 'rgba(255,240,170,' + a + ')'; c.lineWidth = w; c.beginPath(); pts.forEach(([x, y], i) => (i ? c.lineTo(x, y) : c.moveTo(x, y))); c.stroke(); }
        c.restore();
      }
      // mirrors
      MIRRORS.forEach((m, i) => {
        const [x, y] = cellC(...m);
        A.circle(c, x, y, 17, A.rg(c, x - 4, y - 4, 1, 18, ['#8a8f9c', '#4a4e5a']), A.INK, 1.4);
        c.save(); c.translate(x, y); c.rotate(S.mir[i] === 0 ? -Math.PI / 4 : Math.PI / 4);
        c.fillStyle = A.lg(c, -14, 0, 14, 0, ['#d8f0ff', '#ffffff', '#a8c8e0']); c.fillRect(-15, -2.5, 30, 5); c.strokeStyle = A.INK; c.lineWidth = 1.2; c.strokeRect(-15, -2.5, 30, 5); c.restore();
      });
      // drawer
      A.wood(c, 300, 240, 80, 40, '#7a5038', { r: 4 });
      if (S.beamOK) { A.wood(c, 296, 250, 88, 44, '#8a5a3e', { r: 4 }); if (!S.got.tile) { c.save(); c.translate(320, 250); tileIcon(c, 40); c.restore(); } }
      else A.brass(c, 330, 256, 20, 8, 3);
    }

    return {
      id: 'r3', name: '灯りの部屋', par: 12 * 60000,
      intro: '灯りの部屋。色ガラスやレンズがならぶ、親方のお気に入りの部屋だ。窓から夜の青い光が差しこんでいる。',
      outro: '3つのレンズが黄・水色・赤紫に光ると、扉が静かにひらいた。奥から、木と油のにおいがする。',
      init: () => ({ got: {}, dir: [], cupOpen: 0, lampOn: 0, mir: [0, 1, 1, 0, 1], beamOK: 0, tileIn: 0, lit: [0, 1, 0, 1, 0, 1, 0, 0, 0], glassOK: 0, lens: [[0, 0, 0], [0, 0, 0], [0, 0, 0]], lensOK: 0 }),
      items, views, combos: [],
      puzzles: [
        { id: 'cup', name: '戸棚の矢印の錠', done: S => !!S.cupOpen, hints: ['矢印を4つ入れる錠。どこかに道すじの絵がある', '机の上の額の絵：●から★まで、線をたどる', '上→右→下→右'] },
        { id: 'beam', name: '光の台', done: S => !!S.beamOK, hints: ['台の左のランプには電球がない', '電球を入れたら、鏡をタップして向きを変え、光を水晶へ', '光が最初に当たる鏡を＼、2番目を／、3番目を／にする（ほかの鏡は関係ない）'] },
        { id: 'glass', name: 'ステンドグラスの窓', done: S => !!S.glassOK, hints: ['窓のガラスが1枚欠けている。光の台の引き出しに？', 'ガラスを押すと、そのガラスと上下左右がまとめて光ったり消えたりする。机の上のスケッチの形にする', '四すみとまん中だけを光らせる。上のまん中・左下・右下の3枚を1回ずつ押す'] },
        { id: 'lens', name: '扉の3つのレンズ', done: S => !!S.lensOK, hints: ['扉のレンズは、赤・緑・青の光を混ぜて色を作る', '窓の宝石の色（左から 黄・水色・赤紫）を、壁のポスターの混ぜ方で作る', '左：赤＋緑、まん中：緑＋青、右：赤＋青'] },
      ],
      route: ['w:1', 's:moth', 'B', 'w:3', 's:cupboard', 's:aU', 's:aR', 's:aD', 's:aR', 's:bulb', 'B', 'w:2', 's:table', 'i:bulb', 's:lamp', 's:m0', 's:m1', 's:m2', 's:tile', 'B',
        'w:1', 's:sketch', 'B', 'w:0', 's:window', 'i:tile', 's:frame', 's:g1', 's:g6', 's:g8', 'B', 'w:3', 's:poster', 'B',
        'w:0', 's:door', 's:l0r', 's:l0g', 's:l1g', 's:l1b', 's:l2r', 's:l2b', 's:exit'],
    };
  };
})(window);
