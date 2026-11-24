// からくり工房からの脱出：部屋6「親方の蔵」（おまけの部屋。5部屋を出ると開く。点数は5部屋の合計には入らない）
// なぞ：荷運びの床（箱を押して印に乗せる）→ 戸棚の金のピン ／ びんを数える（帳簿の絵の順 月・歯車・星 → 2・3・5）→ 箱（ハンドル）
//       → ハンドル＋ピン＝クランク → 巻き上げ機で かごを下ろす → 蔵の鍵 → 扉
// 中身の計算（箱を押す・解けるかの探索・びんの数）は escape/engine.js。
(function (root) {
  'use strict';
  const ER = root.EscapeRooms;
  const E = root.EscapeEngine;
  if (root.KoboI18n) KoboI18n.add({ en: {
    '親方の蔵': "The Master's Cellar",
    '親方の手紙には続きがあった。「台所の床下に、わしの蔵がある。おまえに渡したいものを置いてきた」。床の扉の下は、ひんやりした石の蔵だった。': "The Master's letter had a postscript: \"Under the kitchen floor is my cellar. I left something there for you.\" Below the floor hatch lies a cool stone cellar.",
    '蔵のいちばん奥の棚に、小さな包みがあった。開けると、親方が長年使いこんだ小さなドライバーと、メモが1枚。\n「見習い卒業祝い。これでおまえも、からくり屋の仲間入りだ」': 'On the very last shelf sits a small bundle. Inside: the Master\'s well-worn little screwdriver and a note.\n"A graduation gift. Now you are one of the gadget-makers."',
    '金のピン': 'Gold pin', '先がとがった、金色の短いピン': 'A short golden pin with a pointed tip',
    'ハンドル': 'Handle', '木の持ち手。片方に穴が空いている': 'A wooden grip with a hole in one end',
    'クランク': 'Crank', 'ハンドルにピンを通した、巻き上げ用のクランク': 'A winding crank: the pin goes through the handle',
    '蔵の鍵': 'Cellar key', '黒ずんだ大きな鍵': 'A big darkened key',
    '蔵の扉': 'The cellar door', '荷運びの床': 'The cart floor', '戸棚': 'The cupboard', '棚のびん': 'The jars on the shelf', '帳簿': 'The ledger', '箱': 'The chest',
    '箱の錠（3けた）': 'The chest lock (3 digits)', 'ふたつの部品': 'Two parts', '巻き上げ機': 'The winch', 'かごの鍵': 'The key in the basket',
    '蔵の扉には鍵がかかっている。大きな鍵穴がある': 'The cellar door is locked. It has a big keyhole',
    '蔵の扉が、ゆっくり開いた。': 'The cellar door slowly opens.',
    'こむぎが樽のそばで眠っている': 'Komugi is sleeping by the barrels', '樽がならんでいる': 'Barrels stand in a row', 'ランプの灯り': 'Lamplight',
    '戸棚には鍵穴はなく、床の絵と同じ印がついている': 'The cupboard has no keyhole, just the same marks as the floor',
    '戸棚の戸が開いた！': 'The cupboard door swings open!', '戸棚の中はからっぽ': 'The cupboard is empty now',
    '箱を押して、全部の印に乗せる。引くことはできない。まちがえたら「もどす」か「やり直し」（U と R のキーでも）': 'Push the crates onto every mark. You cannot pull them. If you slip, use Undo or Start over (the U and R keys too)',
    '箱が全部、印に乗ると、戸棚が開く': 'When every crate is on a mark, the cupboard opens', '戸棚をタップして、金のピンを取る': 'Tap the cupboard and take the gold pin',
    '床の板に、荷箱と印の絵がある': 'The floor boards show crates and marks',
    '荷運びの床。箱を押して、印の上に乗せよう（引くことはできない）': 'The cart floor. Push the crates onto the marks (you cannot pull them)',
    '箱が全部、印に乗った！ 戸棚の方から、カチッと音がした': 'Every crate is on a mark! Something clicks over by the cupboard',
    '動けない（壁か、ほかの箱がある）': "Can't move there (a wall or another crate is in the way)",
    '1手もどした': 'Undid one move', 'はじめからやり直した': 'Started over', 'もどす手がない': 'Nothing to undo',
    '箱を押す音': 'Pushing a crate', '手数 {n}': 'Moves {n}', '印に {a} / {b}': 'On marks {a} / {b}',
    '棚にびんがならんでいる。絵がちがう': 'Jars stand on the shelf, each row with a different picture',
    '絵ごとにびんの数がちがう': 'Each picture has a different number of jars', '帳簿に3つの絵が順番に書いてある': 'The ledger lists three pictures in order',
    '帳簿には3つの絵が、順番に書いてある': 'The ledger lists three pictures, in order',
    '棚の上の絵': 'The picture on the shelf', 'この絵のびん': 'Jars with this picture',
    '3けたの錠が付いた箱': 'A chest with a 3-digit lock', '箱が開いた！': 'The chest opens!', '箱の中はからっぽ': 'The chest is empty now',
    '棚は絵ごとに1段。びんを数えよう': 'The shelf has one row per picture. Count the jars',
    '帳簿の絵の順番に、その絵のびんの数を並べる': "Line up the jar counts in the order of the ledger's pictures",
    '月は2つ、歯車は3つ、星は5つ → 235': 'Moon 2, gear 3, star 5 → 235',
    '箱の中に木の持ち手と、小さな穴': 'Something inside the chest: a wooden grip with a small hole',
    '持ち物どうしを組み合わせられる': 'Items can be combined', 'ハンドルの穴に、金のピンが通りそうだ': 'The gold pin looks like it fits the handle hole',
    'ハンドルを選んで、金のピンをタップ': 'Select the handle, then tap the gold pin',
    '壁の高い所にかごが吊ってある。中に何かある': 'A basket hangs high on the wall. There is something inside',
    '巻き上げ機の横に、クランクを差す穴がある': 'The winch has a socket for a crank', 'クランクを選んで、巻き上げ機の穴をタップ。かごが下りたら鍵を取る': 'Select the crank and tap the socket. When the basket comes down, take the key',
    '鍵が手に入ったら、どこで使う？': 'Once you have the key, where does it go?', '蔵の扉には鍵穴がある': 'The cellar door has a keyhole', '黒い鍵を選んで扉をタップ': 'Select the key and tap the door',
    'クランクを差す穴': 'A socket for a crank', 'かごが下りてきた！ 中に鍵がある': 'The basket comes down! There is a key inside', 'かごはからっぽ': 'The basket is empty now',
    '高い所にかごが吊ってある': 'A basket hangs up high', '巻き上げ機。横に穴がある': 'A winch with a socket on its side',
    'ここに使えるものがない': 'Nothing to use here', '↑ ↓ ← → で動く。U でもどす。R でやり直し': 'Arrows to move, U to undo, R to start over',
    'おまけ': 'Bonus', '床の絵と同じ印': 'The same marks as the floor',
  } });

  const SOL = E.sokoSolve(E.YARD).split('').map(d => ({ U: '↑', D: '↓', L: '←', R: '→' }[d])).join('');
  if (root.KoboI18n) KoboI18n.add({ en: { ['手順（↑↓←→）：' + SOL]: 'Moves (↑↓←→): ' + SOL } });

  ER.defs[5] = (K, A, H) => {
    const T = K.T, { spot, circ } = H;
    const PAL = { wall: '#46423f', wall2: '#000000', pattern: null, wains: null, floor: '#4a3a2c', fy: 232 };
    const meow = () => K.tone(760, 0.16, { type: 'triangle', vol: 0.06, slide: 520 });
    const bricks = (c, x0, y0, x1, y1) => {
      c.save(); c.beginPath(); c.rect(x0, y0, x1 - x0, y1 - y0); c.clip();
      const R = A.rnd(41);
      for (let y = y0, j = 0; y < y1; y += 22, j++) for (let x = x0 - (j % 2) * 24; x < x1; x += 48) {
        c.fillStyle = A.rgba(R() < 0.5 ? '#ffffff' : '#000000', 0.03 + R() * 0.05); c.fillRect(x + 1, y + 1, 46, 20);
        c.strokeStyle = A.rgba('#14100e', 0.55); c.lineWidth = 1.2; c.strokeRect(x + 0.5, y + 0.5, 48, 22);
      }
      c.restore();
    };
    const room = c => { A.room(c, PAL); bricks(c, 0, 0, 400, 232); A.wood(c, -4, 227, 408, 9, '#3a2a1e', { r: 0, lw: 1.2 }); };
    const end = c => A.vignette(c, 0.55);

    // --- items ---
    function pinIcon(c, s) { c.save(); c.translate(s / 2, s / 2); c.rotate(-0.6); A.rr(c, -s * 0.38, -s * 0.05, s * 0.76, s * 0.1, s * 0.05); c.fillStyle = A.lg(c, 0, -s * 0.05, 0, s * 0.05, ['#fff1b8', '#c8962e']); c.fill(); c.lineWidth = 1.2; c.strokeStyle = '#5a3a0c'; c.stroke(); A.circle(c, -s * 0.4, 0, s * 0.09, '#e6b84e', '#5a3a0c', 1.2); c.restore(); }
    function handleIcon(c, s) { c.save(); c.translate(s / 2, s / 2); c.rotate(-0.3); A.wood(c, -s * 0.36, -s * 0.12, s * 0.72, s * 0.24, '#9a6436', { r: s * 0.1, lw: 1.3 }); A.circle(c, s * 0.24, 0, s * 0.05, '#1a0d05'); c.restore(); }
    function crankIcon(c, s) { c.save(); c.translate(s / 2, s / 2); c.strokeStyle = '#2b3036'; c.lineWidth = s * 0.12; c.lineCap = 'round'; c.beginPath(); c.moveTo(-s * 0.3, s * 0.28); c.lineTo(-s * 0.3, -s * 0.2); c.lineTo(s * 0.26, -s * 0.2); c.stroke(); c.strokeStyle = '#9aa3ad'; c.lineWidth = s * 0.07; c.stroke(); A.wood(c, s * 0.1, -s * 0.34, s * 0.3, s * 0.2, '#9a6436', { r: s * 0.06, lw: 1.1 }); A.circle(c, -s * 0.3, s * 0.28, s * 0.07, '#e6b84e', '#5a3a0c', 1.2); c.restore(); }
    function keyIcon(c, s) { c.save(); c.translate(s * 0.26, s / 2); A.circle(c, 0, 0, s * 0.17, '#5a4a40', '#1a1210', 1.5); A.circle(c, 0, 0, s * 0.07, '#2a1d14'); c.fillStyle = '#5a4a40'; c.fillRect(s * 0.15, -s * 0.05, s * 0.56, s * 0.1); c.fillRect(s * 0.5, s * 0.05, s * 0.08, s * 0.14); c.fillRect(s * 0.62, s * 0.05, s * 0.08, s * 0.1); c.strokeStyle = '#1a1210'; c.lineWidth = 1.2; c.strokeRect(s * 0.15, -s * 0.05, s * 0.56, s * 0.1); c.restore(); }
    const items = {
      pin: { name: '金のピン', desc: '先がとがった、金色の短いピン', icon: pinIcon },
      handle: { name: 'ハンドル', desc: '木の持ち手。片方に穴が空いている', icon: handleIcon },
      crank: { name: 'クランク', desc: 'ハンドルにピンを通した、巻き上げ用のクランク', icon: crankIcon },
      key: { name: '蔵の鍵', desc: '黒ずんだ大きな鍵', icon: keyIcon },
    };

    // --- the cart floor (box pushing) ---
    const L = E.YARD, CS = 30, OX = 8, OY = 14;
    const fresh = () => ({ p: L.start.p.slice(), c: L.start.c.map(q => q.slice()), n: 0, hist: [] });
    const placed = S => S.yard.c.filter(q => L.goals.some(g => g[0] === q[0] && g[1] === q[1])).length;
    function yardMove(S, d) {
      if (S.yardOK) return false;
      const t = E.sokoMove(L, S.yard, d);
      if (!t) { K.sfx('fail'); K.say('動けない（壁か、ほかの箱がある）'); return false; }
      S.yard.hist.push({ p: S.yard.p, c: S.yard.c }); if (S.yard.hist.length > 80) S.yard.hist.shift();
      S.yard.p = t.p; S.yard.c = t.c; S.yard.n++;
      if (t.pushed) K.sfx('drop'); else K.sfx('tap');
      if (E.sokoSolved(L, S.yard)) { S.yardOK = 1; K.ok(); K.say('箱が全部、印に乗った！ 戸棚の方から、カチッと音がした'); }
      return true;
    }
    function yardUndo(S) {
      if (S.yardOK) return false;
      const h = S.yard.hist.pop(); if (!h) { K.sfx('fail'); K.say('もどす手がない'); return false; }
      S.yard.p = h.p; S.yard.c = h.c; S.yard.n = Math.max(0, S.yard.n - 1); K.sfx('move'); K.say('1手もどした'); return true;
    }
    function yardReset(S) { if (S.yardOK) return false; S.yard = fresh(); K.sfx('move'); K.say('はじめからやり直した'); return true; }
    const KEYS = { ArrowUp: 'U', ArrowDown: 'D', ArrowLeft: 'L', ArrowRight: 'R', w: 'U', s: 'D', a: 'L', d: 'R', W: 'U', S: 'D', A: 'L', D: 'R' };
    function yardKey(k, S) {
      if (KEYS[k]) { yardMove(S, KEYS[k]); return true; }
      if (k === 'u' || k === 'U' || k === 'z' || k === 'Z') { yardUndo(S); return true; }
      if (k === 'r' || k === 'R') { yardReset(S); return true; }
      return false;
    }
    function crate(c, x, y, s, on) {
      A.wood(c, x + 2, y + 2, s - 4, s - 4, on ? '#b0803c' : '#8a5a2c', { r: 3, lw: 1.3 });
      c.strokeStyle = A.rgba('#2a160a', 0.7); c.lineWidth = 1.2; c.beginPath(); c.moveTo(x + 4, y + 4); c.lineTo(x + s - 4, y + s - 4); c.moveTo(x + s - 4, y + 4); c.lineTo(x + 4, y + s - 4); c.stroke();
      if (on) { c.strokeStyle = '#8fd68a'; c.lineWidth = 2.4; A.rr(c, x + 1, y + 1, s - 2, s - 2, 4); c.stroke(); }
    }
    function mark(c, x, y, s) { c.strokeStyle = A.rgba('#e0604a', 0.95); c.lineWidth = 2.6; c.beginPath(); c.moveTo(x + 8, y + 8); c.lineTo(x + s - 8, y + s - 8); c.moveTo(x + s - 8, y + 8); c.lineTo(x + 8, y + s - 8); c.stroke(); A.circle(c, x + s / 2, y + s / 2, s * 0.3, null, A.rgba('#e0604a', 0.9), 2); }
    function worker(c, x, y, s, t) {
      const bob = Math.sin((t || 0) / 260) * 0.8;
      A.shadow(c, x + s / 2, y + s - 3, s * 0.34, 4, 0.35);
      c.save(); c.translate(x + s / 2, y + s / 2 + bob);
      A.rr(c, -8, -2, 16, 15, 5); c.fillStyle = '#4f7ab0'; c.fill(); c.lineWidth = 1.3; c.strokeStyle = A.INK; c.stroke();
      A.rr(c, -6, 2, 12, 11, 3); c.fillStyle = '#f3e6c8'; c.fill(); c.stroke();
      A.circle(c, 0, -8, 8, '#f2c9a0', A.INK, 1.3);
      c.beginPath(); c.arc(0, -10, 8.4, Math.PI, 0); c.fillStyle = '#6a3a1a'; c.fill(); c.stroke();
      A.circle(c, -2.8, -7.5, 1.1, A.INK); A.circle(c, 2.8, -7.5, 1.1, A.INK);
      c.restore();
    }
    function yardGrid(c, S, t, ox, oy, cs) {
      for (let y = 0; y < L.h; y++) for (let x = 0; x < L.w; x++) {
        const px = ox + x * cs, py = oy + y * cs;
        if (L.walls[y][x]) { A.box(c, px, py, cs, cs, '#5c5650', { r: 2, lw: 1.1 }); c.strokeStyle = A.rgba('#000', 0.25); c.beginPath(); c.moveTo(px, py + cs / 2); c.lineTo(px + cs, py + cs / 2); c.stroke(); }
        else { c.fillStyle = (x + y) % 2 ? '#7a5c3c' : '#86663f'; c.fillRect(px, py, cs, cs); c.strokeStyle = A.rgba('#1a0d05', 0.3); c.lineWidth = 1; c.strokeRect(px + 0.5, py + 0.5, cs - 1, cs - 1); }
      }
      for (const g of L.goals) mark(c, ox + g[0] * cs, oy + g[1] * cs, cs);
      for (const q of S.yard.c) crate(c, ox + q[0] * cs, oy + q[1] * cs, cs, L.goals.some(g => g[0] === q[0] && g[1] === q[1]));
      worker(c, ox + S.yard.p[0] * cs, oy + S.yard.p[1] * cs, cs, t);
    }
    function yardView(c, S, t) {
      A.zoomBg(c, '#2a2623');
      A.wood(c, OX - 6, OY - 6, L.w * CS + 12, L.h * CS + 12, '#3a2a1e', { r: 4 });
      yardGrid(c, S, t, OX, OY, CS);
      A.text(c, T('手数 {n}', { n: S.yard.n }), 342, 40, { size: 12, color: '#fff2d8', stroke: 'rgba(20,12,6,.8)', lw: 3 });
      A.text(c, T('印に {a} / {b}', { a: placed(S), b: L.goals.length }), 342, 22, { size: 12, color: S.yardOK ? '#8fd68a' : '#fff2d8', stroke: 'rgba(20,12,6,.8)', lw: 3 });
      A.arrow(c, 342, 86, 'U', 40); A.arrow(c, 342, 166, 'D', 40); A.arrow(c, 310, 126, 'L', 40); A.arrow(c, 374, 126, 'R', 40);
      // undo / reset
      for (const [x, k] of [[310, '↶'], [374, '⟲']]) { A.circle(c, x, 236, 20, A.rg(c, x - 5, 230, 2, 22, ['#f6ead2', '#cdb894']), A.INK, 1.5); A.text(c, k, x, 236, { size: 20, color: A.INK }); }
      A.zoomEnd(c);
    }

    // --- shelf, ledger, chest ---
    function jar(c, x, y, w, h) { A.rr(c, x, y + 4, w, h - 4, 6); c.fillStyle = A.rgba('#cfe8f0', 0.35); c.fill(); c.lineWidth = 1.3; c.strokeStyle = A.INK; c.stroke(); c.fillStyle = A.rgba('#fff', 0.35); c.fillRect(x + 3, y + 8, 3, h - 14); A.box(c, x - 1, y, w + 2, 6, '#8a5a30', { r: 2, lw: 1.1 }); }
    function shelfFull(c) {
      A.zoomBg(c, '#2a2623');
      A.wood(c, 14, 14, 372, 272, '#4a2e18', { r: 6 });
      E.JARS.forEach(([k, n], i) => {
        const y = 22 + i * 52;
        A.wood(c, 20, y + 40, 360, 8, '#7a5038', { r: 2 });
        A.circle(c, 46, y + 22, 20, '#f3e6c8', '#5a3a0c', 1.6); A.sym(c, k, 46, y + 22, 26, k === 'sun' ? '#f0a030' : k === 'star' ? '#ffd84a' : k === 'moon' ? '#fff3c4' : '#8a96a2', { lw: 1.2 });
        for (let j = 0; j < n; j++) { jar(c, 84 + j * 56, y + 4, 40, 38); A.sym(c, k, 104 + j * 56, y + 26, 18, A.rgba('#3a2618', 0.55), { stroke: 'transparent', lw: 0.1 }); }
      });
      A.zoomEnd(c);
    }
    function ledger(c) {
      A.zoomBg(c, '#2a2623');
      A.paper(c, 90, 24, 220, 252, 0.01, '#f1e4c0');
      E.LEDGER.forEach((k, i) => {
        const y = 62 + i * 64;
        A.circle(c, 140, y + 12, 24, '#f3e6c8', '#5a3a0c', 1.6); A.sym(c, k, 140, y + 12, 30, k === 'sun' ? '#f0a030' : k === 'star' ? '#ffd84a' : k === 'moon' ? '#fff3c4' : '#8a96a2', { lw: 1.2 });
        c.strokeStyle = A.rgba('#3a2618', 0.7); c.lineWidth = 2; c.beginPath(); c.moveTo(180, y + 12); c.lineTo(260, y + 12); c.stroke(); c.beginPath(); c.moveTo(252, y + 6); c.lineTo(262, y + 12); c.lineTo(252, y + 18); c.stroke();
        A.rr(c, 266, y - 2, 28, 28, 4); c.strokeStyle = A.INK; c.lineWidth = 1.5; c.stroke();
      });
      A.zoomEnd(c);
    }
    function chestFull(c, S) {
      A.zoomBg(c, '#2a2623', { table: 250, tableCol: '#4a3a2c' });
      A.wood(c, 50, 70, 300, 176, '#7a4a22', { r: 10 });
      c.strokeStyle = '#2a2a30'; c.lineWidth = 8; c.beginPath(); c.moveTo(110, 70); c.lineTo(110, 246); c.moveTo(290, 70); c.lineTo(290, 246); c.stroke();
      if (!S.chestOpen) {
        A.brass(c, 176, 110, 48, 40, 6);
        [0, 1, 2].forEach(i => { const x = 118 + i * 60; A.arrow(c, x, 60, 'U', 30); A.dial(c, x - 20, 76, 40, 52, S.code[i]); A.arrow(c, x, 144, 'D', 30); });
        A.rr(c, 70, 158, 260, 70, 8); c.fillStyle = A.rgba('#000', 0.18); c.fill();
      } else {
        A.rr(c, 62, 82, 276, 150, 8); c.fillStyle = A.lg(c, 0, 82, 0, 232, ['#1a100a', '#34210f']); c.fill();
        if (!S.got.handle) { c.save(); c.translate(160, 110); handleIcon(c, 80); c.restore(); }
      }
      A.zoomEnd(c);
    }

    // --- winch ---
    function winchFull(c, S, t) {
      A.zoomBg(c, '#2a2623');
      bricks(c, 0, 0, 400, 300);
      const low = S.cranked ? Math.min(1, (K.time() - (K.tr.cr || -9999)) / 1400) : 0;
      const by = 40 + low * 150;
      // rope and basket
      c.strokeStyle = '#a8895a'; c.lineWidth = 4; c.beginPath(); c.moveTo(300, 30); c.lineTo(300, by); c.stroke();
      A.circle(c, 300, 30, 12, '#6d7680', A.INK, 1.5);
      A.wood(c, 268, by, 64, 40, '#8a5a30', { r: 6 });
      c.strokeStyle = A.rgba('#2a160a', 0.6); c.lineWidth = 1.2; for (let i = 1; i < 4; i++) { c.beginPath(); c.moveTo(268 + i * 16, by + 2); c.lineTo(268 + i * 16, by + 38); c.stroke(); }
      if (S.cranked && !S.got.key) { c.save(); c.translate(284, by - 14); keyIcon(c, 40); c.restore(); }
      // winch
      A.wood(c, 60, 70, 20, 170, '#5a3a22'); A.wood(c, 150, 70, 20, 170, '#5a3a22');
      A.wood(c, 60, 236, 110, 14, '#6a4a2e', { r: 2 });
      const rot = S.cranked ? low * 12 : 0;
      c.save(); c.translate(115, 150); c.rotate(rot);
      A.rr(c, -50, -26, 100, 52, 10); c.fillStyle = A.lg(c, 0, -26, 0, 26, ['#c89a5a', '#8a5a30']); c.fill(); c.lineWidth = 1.6; c.strokeStyle = A.INK; c.stroke();
      c.strokeStyle = A.rgba('#2a160a', 0.5); c.lineWidth = 1.2; for (let i = -40; i <= 40; i += 12) { c.beginPath(); c.moveTo(i, -26); c.lineTo(i, 26); c.stroke(); }
      c.restore();
      A.circle(c, 172, 150, 14, '#2a1d14', '#c8962e', 2.5);
      if (S.cranked) { c.save(); c.translate(172, 150); c.rotate(rot); c.translate(-172, -150); c.save(); c.translate(152, 130); crankIcon(c, 60); c.restore(); c.restore(); }
      if (S.cranked && low < 1) K.anim(60);
      A.zoomEnd(c);
    }

    const views = {
      w0: {
        draw(c, S, t) {
          room(c);
          A.hangLamp(c, 70, 52, 52);
          for (const [x, w] of [[16, 40], [48, 34]]) { A.wood(c, x, 150, w, 82, '#6a4a2e', { r: 8 }); c.strokeStyle = '#2a2a30'; c.lineWidth = 3; for (const y of [166, 214]) { c.beginPath(); c.moveTo(x, y); c.lineTo(x + w, y); c.stroke(); } }
          A.door(c, 150, 46, 100, 188, S.doorOpen ? '#3a2a1e' : '#5a4636', { open: !!S.doorOpen });
          A.cushion(c, 330, 250, 78, '#6a4a5a'); A.cat(c, 330, 246, 56, t, '#e8e0d0');
          end(c);
        },
        spots: S => [
          spot('door', 150, 46, 100, 188, { use: it => { if (it !== 'key') return false; K.take('key'); K.say('蔵の扉が、ゆっくり開いた。'); K.exit(); return true; }, tap: () => K.say('蔵の扉には鍵がかかっている。大きな鍵穴がある') }),
          spot('cat', 292, 214, 78, 42, { tap: () => { meow(); K.say('こむぎが樽のそばで眠っている'); } }),
          spot('barrels', 10, 146, 80, 90, { say: '樽がならんでいる' }),
          spot('lamp', 40, 30, 60, 60, { say: 'ランプの灯り' }),
        ],
      },
      w1: {
        draw(c, S, t) {
          room(c);
          A.wood(c, 40, 36, 150, 196, '#5a3a22', { r: 4 });
          const open = !!S.yardOK;
          for (const [i, x] of [[0, 48], [1, 118]]) {
            if (open) { A.rr(c, x, 44, 66, 180, 3); c.fillStyle = '#120a06'; c.fill(); }
            else { A.wood(c, x, 44, 66, 180, '#7a4a26', { r: 3 }); mark(c, x + 8, 120, 50); }
          }
          if (open && !S.got.pin) { c.save(); c.translate(126, 106); pinIcon(c, 50); c.restore(); }
          // the cart floor panel
          c.save(); c.beginPath(); c.moveTo(236, 238); c.lineTo(384, 238); c.lineTo(396, 292); c.lineTo(224, 292); c.closePath(); c.fillStyle = A.lg(c, 0, 238, 0, 292, ['#6a4a2e', '#43301e']); c.fill(); c.strokeStyle = A.INK; c.lineWidth = 1.6; c.stroke(); c.clip();
          for (let i = 0; i < 3; i++) { crate(c, 250 + i * 40, 254, 32, !!S.yardOK); mark(c, 250 + i * 40 + 20, 262, 28); } c.restore();
          A.hangLamp(c, 330, 50, 40);
          end(c);
        },
        spots: S => [
          spot('cup', 40, 36, 150, 196, { tap: () => { if (!S.yardOK) { K.say('戸棚には鍵穴はなく、床の絵と同じ印がついている'); return; } if (!S.got.pin) K.give('pin'); else K.say('戸棚の中はからっぽ'); } }),
          spot('yard', 224, 236, 172, 60, { go: 'yard6', tap: () => K.say('↑ ↓ ← → で動く。U でもどす。R でやり直し') }),
        ],
      },
      w2: {
        draw(c, S, t) {
          room(c);
          // shelf
          A.wood(c, 16, 30, 150, 200, '#4a2e18', { r: 4 });
          E.JARS.forEach(([k, n], i) => { const y = 38 + i * 38; A.wood(c, 20, y + 30, 142, 5, '#7a5038', { r: 1 }); for (let j = 0; j < n; j++) { jar(c, 26 + j * 27, y + 4, 22, 28); A.sym(c, k, 37 + j * 27, y + 20, 11, A.rgba('#3a2618', 0.55), { stroke: 'transparent', lw: 0.1 }); } });
          // ledger on the wall
          A.paper(c, 196, 46, 68, 86, 0.04, '#f1e4c0');
          E.LEDGER.forEach((k, i) => A.sym(c, k, 218, 66 + i * 26, 18, k === 'star' ? '#ffd84a' : k === 'moon' ? '#fff3c4' : '#8a96a2', { lw: 0.9 }));
          // chest
          A.shadow(c, 328, 236, 60, 8, 0.4);
          A.wood(c, 270, 160, 116, 72, '#7a4a22', { r: 8 }); A.wood(c, 264, 146, 128, 22, '#8a5a2c', { r: 8 });
          A.brass(c, 316, 160, 24, 22, 4);
          end(c);
        },
        spots: S => [
          spot('shelf', 16, 30, 150, 200, { go: 'shelf6' }),
          spot('ledger', 196, 46, 68, 86, { go: 'ledger6' }),
          spot('chest', 264, 146, 128, 90, { go: 'chest6' }),
        ],
      },
      w3: {
        draw(c, S, t) {
          room(c);
          A.hangLamp(c, 200, 40, 60);
          A.wood(c, 60, 90, 14, 142, '#5a3a22'); A.wood(c, 142, 90, 14, 142, '#5a3a22');
          A.rr(c, 74, 116, 68, 36, 8); c.fillStyle = A.lg(c, 0, 116, 0, 152, ['#c89a5a', '#8a5a30']); c.fill(); c.lineWidth = 1.5; c.strokeStyle = A.INK; c.stroke();
          A.circle(c, 156, 134, 10, '#2a1d14', '#c8962e', 2);
          const by = S.cranked ? 190 : 60;
          c.strokeStyle = '#a8895a'; c.lineWidth = 3; c.beginPath(); c.moveTo(300, 20); c.lineTo(300, by); c.stroke();
          A.wood(c, 276, by, 48, 30, '#8a5a30', { r: 5 });
          if (!S.got.key) { c.save(); c.translate(288, by - 10); keyIcon(c, 28); c.restore(); }
          end(c);
        },
        spots: S => [
          spot('winch', 56, 86, 110, 150, { go: 'winch6' }),
          spot('basket', 270, 36, 60, 180, { say: '高い所にかごが吊ってある' }),
        ],
      },
      yard6: {
        back: 'w1', draw: yardView, key: yardKey,
        spots: S => [
          circ('mvU', 342, 86, 24, { tap: () => yardMove(S, 'U') }), circ('mvD', 342, 166, 24, { tap: () => yardMove(S, 'D') }),
          circ('mvL', 310, 126, 22, { tap: () => yardMove(S, 'L') }), circ('mvR', 374, 126, 22, { tap: () => yardMove(S, 'R') }),
          circ('undo', 310, 236, 22, { tap: () => yardUndo(S) }), circ('reset', 374, 236, 22, { tap: () => yardReset(S) }),
        ],
      },
      shelf6: { back: 'w2', draw: shelfFull, spots: () => [spot('shelfAll', 14, 14, 372, 272, { say: '棚にびんがならんでいる。絵がちがう' })] },
      ledger6: { back: 'w2', draw: ledger, spots: () => [spot('ledgerAll', 90, 24, 220, 252, { say: '帳簿には3つの絵が、順番に書いてある' })] },
      chest6: {
        back: 'w2',
        draw(c, S) { chestFull(c, S); },
        spots: S => {
          const l = [];
          if (!S.chestOpen) {
            l.push(spot('lock', 70, 100, 260, 120, { say: '3けたの錠が付いた箱' }));
            for (let i = 0; i < 3; i++) {
              const x = 118 + i * 60, set = d => { S.code[i] = (S.code[i] + d + 10) % 10; K.sfx('tap'); if (S.code.every((v, j) => v === E.codeOf()[j])) { S.chestOpen = 1; K.ok(); K.say('箱が開いた！'); } };
              l.push(circ('c' + i + 'u', x, 60, 22, { tap: () => set(1) }), circ('c' + i + 'd', x, 144, 22, { tap: () => set(-1) }));
            }
          } else {
            l.push(spot('inside', 62, 82, 276, 150, { say: '箱の中はからっぽ' }));
            if (!S.got.handle) l.push(spot('handle', 150, 100, 100, 70, { tap: () => K.give('handle') }));
          }
          return l;
        },
      },
      winch6: {
        back: 'w3',
        draw(c, S, t) { winchFull(c, S, t); },
        spots: S => {
          const l = [spot('drum', 60, 70, 110, 180, { say: '巻き上げ機。横に穴がある' })];
          l.push(circ('socket', 172, 150, 30, { use: it => { if (it !== 'crank' || S.cranked) return false; S.cranked = 1; K.tr.cr = K.time(); K.take('crank'); for (let i = 0; i < 6; i++) K.tone(300 + i * 40, 0.08, { type: 'square', vol: 0.03, delay: i * 0.12 }); K.anim(1500); K.say('かごが下りてきた！ 中に鍵がある'); return true; }, say: 'クランクを差す穴' }));
          if (S.cranked && !S.got.key) l.push(spot('key', 262, 100, 76, 120, { tap: () => K.give('key') }));
          if (S.cranked && S.got.key) l.push(spot('basket', 262, 100, 76, 120, { say: 'かごはからっぽ' }));
          return l;
        },
      },
    };

    const rep = (a, n) => Array(n).fill(a);
    const code = E.codeOf();
    return {
      id: 'r6', name: '親方の蔵', par: 10 * 60000, bonus: true,
      intro: '親方の手紙には続きがあった。「台所の床下に、わしの蔵がある。おまえに渡したいものを置いてきた」。床の扉の下は、ひんやりした石の蔵だった。',
      outro: '蔵のいちばん奥の棚に、小さな包みがあった。開けると、親方が長年使いこんだ小さなドライバーと、メモが1枚。\n「見習い卒業祝い。これでおまえも、からくり屋の仲間入りだ」',
      init: () => ({ got: {}, yard: fresh(), yardOK: 0, code: [0, 0, 0], chestOpen: 0, cranked: 0 }),
      items, views,
      combos: [{ a: 'handle', b: 'pin', out: 'crank' }],
      puzzles: [
        { id: 'yard', name: '荷運びの床', done: S => !!S.yardOK, hints: ['床の板に、荷箱と印の絵がある', '箱を押して、全部の印に乗せる。引くことはできない。まちがえたら「もどす」か「やり直し」（U と R のキーでも）', '手順（↑↓←→）：' + SOL] },
        { id: 'cup', name: '戸棚', avail: S => !!S.yardOK, done: S => !!S.got.pin, hints: ['戸棚には鍵穴はなく、床の絵と同じ印がついている', '箱が全部、印に乗ると、戸棚が開く', '戸棚をタップして、金のピンを取る'] },
        { id: 'chest', name: '箱の錠（3けた）', done: S => !!S.chestOpen, hints: ['棚は絵ごとに1段。びんを数えよう', '帳簿の絵の順番に、その絵のびんの数を並べる', '月は2つ、歯車は3つ、星は5つ → 235'] },
        { id: 'crank', name: 'ふたつの部品', avail: S => !!(S.got.handle && S.got.pin), done: S => !!(S.got.crank || S.cranked), hints: ['持ち物どうしを組み合わせられる', 'ハンドルの穴に、金のピンが通りそうだ', 'ハンドルを選んで、金のピンをタップ'] },
        { id: 'winch', name: '巻き上げ機', avail: S => !!(S.got.crank || S.cranked), done: S => !!S.got.key, hints: ['壁の高い所にかごが吊ってある。中に何かある', '巻き上げ機の横に、クランクを差す穴がある', 'クランクを選んで、巻き上げ機の穴をタップ。かごが下りたら鍵を取る'] },
        { id: 'door', name: '蔵の扉', avail: S => !!S.got.key, done: () => false, hints: ['鍵が手に入ったら、どこで使う？', '蔵の扉には鍵穴がある', '黒い鍵を選んで扉をタップ'] },
      ],
      route: ['w:1', 's:yard', ...E.sokoSolve(E.YARD).split('').map(d => 's:mv' + d), 'B', 's:cup',
        'w:2', 's:ledger', 'B', 's:shelf', 'B', 's:chest', ...rep('s:c0u', code[0]), ...rep('s:c1u', code[1]), ...rep('s:c2u', code[2]), 's:handle', 'B',
        'i:handle', 'i:pin', 'w:3', 's:winch', 's:socket', 's:key', 'B', 'w:0', 'i:key', 's:door'],
    };
  };
})(window);
