// からくり工房からの脱出：部屋5「屋根裏の天文台」（いちばんむずかしい部屋）
// なぞ：日食のスケッチ → 天体の模型（つながったレバー。3つとも右上）→ すける星図 → 町の地図に重ねる（★＝鐘の塔）→ メロディーの筒
//       山の絵 → 本だな（高さの順に入れかえ）→ ねじ巻き／望遠鏡の星座の星の数 → オルゴールのふた（4765）→ 筒・ねじ巻き・レバー → 床の扉の鍵
(function (root) {
  'use strict';
  const ER = root.EscapeRooms;
  if (root.KoboI18n) KoboI18n.add({ en: {
    '屋根裏の天文台': 'The Attic Observatory',
    '屋根裏の天文台。星をながめるのが好きだった親方の、とっておきの部屋。望遠鏡が丸い窓を向いている。': "The attic observatory, the Master's secret favourite: he loved watching the stars. A telescope points at the round window.",
    'オルゴールが鳴りだした。親方がいつも口ずさんでいた曲だ。床の扉を開けて階段を下りると、朝日の差す台所で、親方がお茶をいれて待っていた。\n「よくやった。今日からおまえは、一人前の職人だ」': 'The music box begins to play — the tune the Master always hummed. You open the floor hatch and go down the stairs. In the morning sun of the kitchen, the Master is waiting with a pot of tea.\n"Well done. From today, you are a true craftsperson."',
    'すける星図': 'See-through star chart', 'すき通った紙。四すみに＋、1か所に★': 'A transparent sheet with + in each corner and one ★',
    'メロディーの筒': 'Melody cylinder', 'ピンがたくさん付いた金属の筒': 'A metal cylinder covered in little pins',
    'ねじ巻き': 'Winding key', 'オルゴールを巻く、蝶の形のねじ': 'A butterfly-shaped key for winding a music box',
    '床の扉の鍵': 'Hatch key', '古い鉄の鍵': 'An old iron key',
    '天体の模型': 'The orrery', '町の地図': 'The town map', '本だな': 'The bookshelf', 'オルゴールのふた': 'The music box lid', 'オルゴールを鳴らす': 'Playing the music box', '床の扉': 'The floor hatch',
    '模型の上のスケッチ：太陽と3つの星が一直線': 'The sketch above the orrery: the sun and three planets in a straight line',
    'レバーを押すと、星が1つずつ進む。左のレバーは内側と真ん中、真ん中のレバーは真ん中と外側、右のレバーは外側だけを動かす': 'Each lever press moves planets one step. The left lever moves the inner and middle ones, the middle lever the middle and outer, the right lever only the outer',
    '3つとも右上に。左のレバー4回、真ん中3回、右7回': 'All three to the upper right: left lever 4 times, middle 3, right 7',
    'すける星図を、地図の上に重ねてみよう': 'Try laying the see-through star chart over the map',
    '星図の＋を地図の四すみの＋に合わせると、★が地図の1か所に重なる': 'Line up the + marks with the + in the map corners, and the ★ falls on one place',
    '星図を選んで地図をタップ。★の場所（上から2段目・右から2列目、鐘の塔）をタップ': 'Select the chart and tap the map. Then tap the ★ spot (2nd row from the top, 2nd column from the right: the bell tower)',
    '本の高さに注目。似た形の絵が部屋にある': 'Look at the heights of the books. A picture in the room has a similar shape',
    '地図の横の山の絵。山の高さの順に本を並べかえる。2冊を続けてタップで入れかえ': 'The mountain painting next to the map: order the books like the peaks. Tap two books in turn to swap them',
    '左から、高さの順位が 3・5・2・6・1・4（6がいちばん高い）': 'From the left, height ranks 3, 5, 2, 6, 1, 4 (6 is the tallest)',
    'ふたの4つの絵と同じ星座が、望遠鏡で見える': 'The four pictures on the lid are constellations you can see in the telescope',
    '望遠鏡で星座の星（線でつながった明るい星）を数える': 'Count the stars of each constellation in the telescope (the bright ones joined by lines)',
    '鳥4・やかん7・かなづち6・歯車5 → 4765': 'Bird 4, kettle 7, hammer 6, gear 5 → 4765',
    'オルゴールには筒とねじ巻きが要る': 'The music box needs a cylinder and a winding key', 'メロディーの筒は地図の中、ねじ巻きは本だなの奥': 'The cylinder is inside the map; the winding key is behind the books',
    '筒を選んで中の溝に、ねじ巻きを選んで右の穴に。それからレバー': 'Select the cylinder and tap the groove, select the key and tap the hole on the right, then pull the lever',
    '床の扉には鍵穴がある': 'The floor hatch has a keyhole', 'オルゴールの引き出しの鍵': 'The key from the music box drawer', '鍵を選んで床の扉をタップ': 'Select the key and tap the floor hatch',
    '丸い窓から星空が見える': 'Stars shine through the round window', '望遠鏡。のぞくと星座が見える': 'A telescope. Look through it to see constellations',
    '線でつながった星座が見える': 'A constellation joined by lines', '親方の町の地図。四すみに＋の印': "A map of the Master's town, with + in each corner",
    '星図を重ねた。★が鐘の塔に重なっている': 'You lay the chart on the map. The ★ falls on the bell tower', '地図の鐘の塔の所に、小さな扉が開いた！': 'A little door opens in the map at the bell tower!',
    '地図の中はからっぽ': 'Nothing more in the map', '6つの山の絵。高さがそれぞれちがう': 'A painting of six peaks, each a different height',
    '本だなの奥の板が開いた！': 'The back panel of the bookshelf slides open!', '本の奥はからっぽ': 'Nothing else behind the books',
    '星の模型。太陽のまわりに3つの星': 'An orrery: three planets around the sun', '模型の台の引き出しが開いた！': 'A drawer in the orrery base opens!',
    '台の引き出しはからっぽ': 'The drawer is empty', '日食のスケッチ。太陽と星が一列に並んでいる': 'An eclipse sketch: the sun and planets in one line',
    'ふたに4つの絵と、4けたの数字の錠': 'Four pictures on the lid and a 4-digit lock', 'ふたが開いた！': 'The lid opens!',
    '筒がはまった': 'The cylinder clicks in', 'ねじを巻いた': 'You wind it up', 'まだ鳴らない。筒とねじ巻きがいる': "It won't play yet. It needs the cylinder and winding",
    'オルゴールが鳴った…下の引き出しが開いた！': 'The music box plays… the drawer below opens!',
    '床の扉。鍵がかかっている': 'The floor hatch. It is locked', '筒をはめる溝': 'A groove for a cylinder', 'ねじを巻く穴': 'A hole for winding', '鳴らすレバー': 'The play lever',
    'こむぎが望遠鏡の下で眠っている': 'Komugi is asleep under the telescope', 'ろうそくの灯り': 'Candle light', '小さな窓': 'A small window',
  } });

  ER.defs[4] = (K, A, H) => {
    const T = K.T, { spot, circ } = H;
    const PAL = { wall: '#2f3156', wall2: '#fff3c4', pattern: 'stars', wains: '#4a3020', floor: '#5b3f2a', fy: 232, slope: '#5a3a22' };
    const end = c => A.vignette(c, 0.5);
    const meow = () => K.tone(760, 0.16, { type: 'triangle', vol: 0.06, slide: 520 });
    // --- constellations (shown in the telescope) ---
    const CONST = [
      { k: 'bird', st: [[-62, 12], [-22, -22], [24, -20], [64, 14]], ln: [[0, 1], [1, 2], [2, 3]] },
      { k: 'kettle', st: [[-50, 40], [50, 40], [55, -5], [0, -30], [-55, -5], [86, -34], [0, -58]], ln: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0], [2, 5], [3, 6]] },
      { k: 'hammer', st: [[-52, -52], [52, -52], [52, -18], [-52, -18], [0, -18], [0, 64]], ln: [[0, 1], [1, 2], [2, 3], [3, 0], [4, 5]] },
      { k: 'gear', st: [0, 1, 2, 3, 4].map(i => [Math.sin(i * 1.2566) * 58, -Math.cos(i * 1.2566) * 58]), ln: [[0, 1], [1, 2], [2, 3], [3, 4], [4, 0]] },
    ];
    const LID = ['bird', 'kettle', 'hammer', 'gear'], CODE = [4, 7, 6, 5];
    function sky(c, S, cx, cy, r, sec) {
      c.save(); A.circle(c, cx, cy, r, null); c.beginPath(); c.arc(cx, cy, r, 0, Math.PI * 2); c.clip();
      c.fillStyle = A.rg(c, cx, cy, 10, r, ['#1c2a5a', '#070b1e']); c.fillRect(cx - r, cy - r, r * 2, r * 2);
      const R = A.rnd(sec * 77 + 5); for (let i = 0; i < 90; i++) A.circle(c, cx + (R() - 0.5) * r * 2, cy + (R() - 0.5) * r * 2, 0.6 + R() * 0.6, A.rgba('#c8d0ff', 0.25 + R() * 0.2));
      const C = CONST[sec], k = r / 120;
      A.sym(c, C.k, cx, cy, r * 1.3, A.rgba('#8aa0ff', 0.1), { stroke: A.rgba('#8aa0ff', 0.18), lw: 2 });
      c.strokeStyle = A.rgba('#bfd0ff', 0.7); c.lineWidth = 1.6;
      for (const [a, b] of C.ln) { c.beginPath(); c.moveTo(cx + C.st[a][0] * k, cy + C.st[a][1] * k); c.lineTo(cx + C.st[b][0] * k, cy + C.st[b][1] * k); c.stroke(); }
      for (const [x, y] of C.st) { A.glow(c, cx + x * k, cy + y * k, 10 * k + 4, '#fff6d0', 0.6); A.sym(c, 'star', cx + x * k, cy + y * k, 10 * k + 5, '#fff6d0', { stroke: '#fff6d0', lw: 0.5 }); }
      c.restore();
      A.circle(c, cx, cy, r, null, '#1a120c', 10);
      A.circle(c, cx, cy + r - 18, 13, '#f3e6c8', A.INK, 1.2); A.sym(c, C.k, cx, cy + r - 18, 16, '#5a4a30', { lw: 1 });
    }
    // --- map ---
    const MX = 84, MY = 30, MC = 46;
    const MARKS = { '0,0': 'mill', '3,1': 'tower', '1,3': 'well', '2,2': 'bridge', '4,4': 'house', '0,4': 'tree', '4,0': 'tree', '1,1': 'house', '3,3': 'tree' };
    function landmark(c, k, x, y) {
      c.save(); c.translate(x, y); c.strokeStyle = '#4a3218'; c.lineWidth = 1.4; c.fillStyle = '#c8a070';
      if (k === 'tower') { c.fillRect(-7, -12, 14, 26); c.strokeRect(-7, -12, 14, 26); c.beginPath(); c.moveTo(-10, -12); c.lineTo(0, -22); c.lineTo(10, -12); c.closePath(); c.fill(); c.stroke(); A.circle(c, 0, -4, 3.5, '#e8b830', '#4a3218', 1); }
      else if (k === 'mill') { c.fillRect(-6, -4, 12, 16); c.strokeRect(-6, -4, 12, 16); for (let i = 0; i < 4; i++) { c.save(); c.translate(0, -6); c.rotate(i * Math.PI / 2 + 0.4); c.fillRect(0, -2, 14, 4); c.strokeRect(0, -2, 14, 4); c.restore(); } }
      else if (k === 'well') { c.beginPath(); c.ellipse(0, 4, 10, 5, 0, 0, Math.PI * 2); c.fill(); c.stroke(); c.beginPath(); c.moveTo(-8, 4); c.lineTo(-8, -10); c.lineTo(8, -10); c.lineTo(8, 4); c.stroke(); }
      else if (k === 'bridge') { c.beginPath(); c.arc(0, 8, 14, Math.PI, 0); c.stroke(); c.beginPath(); c.moveTo(-16, -2); c.lineTo(16, -2); c.stroke(); }
      else if (k === 'house') { c.fillRect(-8, -2, 16, 12); c.strokeRect(-8, -2, 16, 12); c.beginPath(); c.moveTo(-10, -2); c.lineTo(0, -11); c.lineTo(10, -2); c.closePath(); c.fillStyle = '#b05a3a'; c.fill(); c.stroke(); }
      else if (k === 'tree') { A.circle(c, 0, -4, 8, '#7a9a5a', '#4a3218', 1.2); c.fillStyle = '#6a4a2a'; c.fillRect(-1.5, 3, 3, 8); }
      c.restore();
    }
    function townMap(c, S, x, y, s) {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.fillStyle = A.lg(c, 0, MY - 16, 0, MY + 5 * MC + 16, ['#f0dcae', '#d8bf88']); A.rr(c, MX - 16, MY - 16, 5 * MC + 32, 5 * MC + 32, 6); c.fill(); c.strokeStyle = A.INK; c.lineWidth = 1.6; c.stroke();
      // river
      c.strokeStyle = A.rgba('#4a8ac8', 0.6); c.lineWidth = 9; c.lineCap = 'round'; c.beginPath(); c.moveTo(MX, MY + 2.5 * MC); c.bezierCurveTo(MX + 1.5 * MC, MY + 1.6 * MC, MX + 2.6 * MC, MY + 3.2 * MC, MX + 5 * MC, MY + 2.3 * MC); c.stroke();
      c.strokeStyle = A.rgba('#6a4a28', 0.25); c.lineWidth = 1; for (let i = 0; i <= 5; i++) { c.beginPath(); c.moveTo(MX + i * MC, MY); c.lineTo(MX + i * MC, MY + 5 * MC); c.stroke(); c.beginPath(); c.moveTo(MX, MY + i * MC); c.lineTo(MX + 5 * MC, MY + i * MC); c.stroke(); }
      for (const [key, k] of Object.entries(MARKS)) { const [cc, rr] = key.split(',').map(Number); landmark(c, k, MX + cc * MC + MC / 2, MY + rr * MC + MC / 2); }
      const plus = (px, py, col, lw) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(px - 8, py); c.lineTo(px + 8, py); c.moveTo(px, py - 8); c.lineTo(px, py + 8); c.stroke(); };
      for (const [px, py] of [[MX - 6, MY - 6], [MX + 5 * MC + 6, MY - 6], [MX - 6, MY + 5 * MC + 6], [MX + 5 * MC + 6, MY + 5 * MC + 6]]) plus(px, py, '#4a3218', 2);
      if (S.mapOpen) { const hx = MX + 3 * MC, hy = MY + MC; c.fillStyle = '#1a120c'; c.fillRect(hx + 4, hy + 4, MC - 8, MC - 8); if (!S.got.cyl) { c.save(); c.translate(hx + 4, hy + 6); cylIcon(c, MC - 8); c.restore(); } }
      if (S.sheet) {
        c.fillStyle = A.rgba('#c8e8ff', 0.28); A.rr(c, MX - 14, MY - 14, 5 * MC + 28, 5 * MC + 28, 4); c.fill(); c.strokeStyle = A.rgba('#6a9ac8', 0.8); c.lineWidth = 1.2; c.stroke();
        for (const [px, py] of [[MX - 6, MY - 6], [MX + 5 * MC + 6, MY - 6], [MX - 6, MY + 5 * MC + 6], [MX + 5 * MC + 6, MY + 5 * MC + 6]]) plus(px, py, '#2a6ac8', 1.4);
        if (!S.mapOpen) A.sym(c, 'star', MX + 3.5 * MC, MY + 1.5 * MC, 30, A.rgba('#ffd84a', 0.85), { stroke: '#c8402a', lw: 1.6 });
      }
      c.restore();
    }
    function sheetBig(c, x, y, w) {
      const k = w / (5 * MC + 28);
      c.save(); c.translate(x, y); c.scale(k, k);
      c.fillStyle = A.rgba('#c8e8ff', 0.4); A.rr(c, 0, 0, 5 * MC + 28, 5 * MC + 28, 4); c.fill(); c.strokeStyle = '#6a9ac8'; c.lineWidth = 2; c.stroke();
      c.strokeStyle = '#2a6ac8'; c.lineWidth = 2;
      for (const [px, py] of [[8, 8], [5 * MC + 20, 8], [8, 5 * MC + 20], [5 * MC + 20, 5 * MC + 20]]) { c.beginPath(); c.moveTo(px - 8, py); c.lineTo(px + 8, py); c.moveTo(px, py - 8); c.lineTo(px, py + 8); c.stroke(); }
      A.sym(c, 'star', 14 + 3.5 * MC, 14 + 1.5 * MC, 30, '#ffd84a', { stroke: '#c8402a', lw: 1.6 });
      c.restore();
    }
    function cylIcon(c, s) { A.rr(c, s * 0.1, s * 0.3, s * 0.8, s * 0.4, s * 0.18); c.fillStyle = A.lg(c, 0, s * 0.3, 0, s * 0.7, ['#e8eef2', '#a8b0b8', '#6d7680']); c.fill(); c.strokeStyle = '#2b3036'; c.lineWidth = 1.2; c.stroke(); for (let i = 0; i < 10; i++) A.circle(c, s * (0.18 + (i * 0.37 % 0.64)), s * (0.36 + (i % 3) * 0.12), Math.max(0.8, s * 0.025), '#2b3036'); }
    function wkeyIcon(c, s) { c.save(); c.translate(s / 2, s / 2); for (const d of [-1, 1]) { c.beginPath(); c.ellipse(d * s * 0.2, -s * 0.12, s * 0.17, s * 0.13, d * 0.4, 0, Math.PI * 2); c.fillStyle = A.lg(c, 0, -s * 0.3, 0, 0, ['#fff1b8', '#c8962e']); c.fill(); c.strokeStyle = '#5a3a0c'; c.lineWidth = 1.3; c.stroke(); } A.brass(c, -s * 0.05, -s * 0.12, s * 0.1, s * 0.42, 2); c.restore(); }
    function hkeyIcon(c, s) { c.save(); c.translate(s * 0.26, s / 2); A.circle(c, 0, 0, s * 0.17, '#5a5e66', '#1a1c20', 1.5); A.circle(c, 0, 0, s * 0.07, '#2a1d14'); c.fillStyle = '#5a5e66'; c.fillRect(s * 0.15, -s * 0.05, s * 0.56, s * 0.1); c.fillRect(s * 0.6, 0, s * 0.08, s * 0.18); c.fillRect(s * 0.46, 0, s * 0.07, s * 0.13); c.strokeStyle = '#1a1c20'; c.lineWidth = 1; c.strokeRect(s * 0.15, -s * 0.05, s * 0.56, s * 0.1); c.restore(); }
    const items = {
      sheet: { name: 'すける星図', desc: 'すき通った紙。四すみに＋、1か所に★', icon: (c, s) => sheetBig(c, s * 0.1, s * 0.1, s * 0.8), big: c => sheetBig(c, 80, 20, 240) },
      cyl: { name: 'メロディーの筒', desc: 'ピンがたくさん付いた金属の筒', icon: cylIcon },
      wkey: { name: 'ねじ巻き', desc: 'オルゴールを巻く、蝶の形のねじ', icon: wkeyIcon },
      hkey: { name: '床の扉の鍵', desc: '古い鉄の鍵', icon: hkeyIcon },
    };
    // --- books and the mountain painting ---
    const PEAKS = [3, 5, 2, 6, 1, 4];
    const BOOKCOL = { 1: '#7a3a3a', 2: '#3a5a7a', 3: '#5a7a3a', 4: '#8a6a2a', 5: '#5a3a6a', 6: '#2a6a6a' };
    function painting(c, x, y, w, h) {
      c.save(); c.beginPath(); c.rect(x, y, w, h); c.clip();
      c.fillStyle = A.lg(c, 0, y, 0, y + h, ['#f6d8a8', '#e8a878']); c.fillRect(x, y, w, h);
      const step = w / 6;
      c.beginPath(); c.moveTo(x, y + h);
      PEAKS.forEach((p, i) => { const px = x + step * (i + 0.5), py = y + h - h * (0.14 + p * 0.13); c.lineTo(px - step * 0.45, y + h - h * 0.12); c.lineTo(px, py); c.lineTo(px + step * 0.45, y + h - h * 0.12); });
      c.lineTo(x + w, y + h); c.closePath(); c.fillStyle = A.lg(c, 0, y, 0, y + h, ['#6a5a8a', '#3a3a5a']); c.fill(); c.strokeStyle = A.INK; c.lineWidth = 1.4; c.stroke();
      PEAKS.forEach((p, i) => { const px = x + step * (i + 0.5), py = y + h - h * (0.14 + p * 0.13); c.beginPath(); c.moveTo(px - step * 0.12, py + h * 0.06); c.lineTo(px, py); c.lineTo(px + step * 0.12, py + h * 0.06); c.closePath(); c.fillStyle = '#fff'; c.fill(); });
      c.restore();
    }
    // --- orrery ---
    const OC = [200, 132], ORB = [40, 72, 104], PCOL = ['#e8604a', '#4ac8b0', '#e8b830'];
    const LEVERS = [[0, 1], [1, 2], [2]];
    function orrery(c, S, cx, cy, s) {
      c.save(); c.translate(cx, cy); c.scale(s, s);
      ORB.forEach(r => { c.setLineDash([4, 5]); A.circle(c, 0, 0, r, null, A.rgba('#ffe8b0', 0.4), 1.4); c.setLineDash([]); });
      for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.strokeStyle = A.rgba('#ffe8b0', 0.2); c.lineWidth = 1; c.beginPath(); c.moveTo(Math.sin(a) * 30, -Math.cos(a) * 30); c.lineTo(Math.sin(a) * 114, -Math.cos(a) * 114); c.stroke(); }
      A.circle(c, 0, 0, 20, A.rg(c, -5, -5, 2, 22, ['#fff6c8', '#f0a030']), '#8a4a0c', 1.6); A.glow(c, 0, 0, 50, '#ffd070', 0.4);
      S.orb.forEach((p, i) => { const a = p * Math.PI / 4; c.strokeStyle = '#c8962e'; c.lineWidth = 2; c.beginPath(); c.moveTo(0, 0); c.lineTo(Math.sin(a) * ORB[i], -Math.cos(a) * ORB[i]); c.stroke(); A.circle(c, Math.sin(a) * ORB[i], -Math.cos(a) * ORB[i], 9 + i * 2, A.rg(c, Math.sin(a) * ORB[i] - 3, -Math.cos(a) * ORB[i] - 3, 1, 12 + i * 2, [A.shade(PCOL[i], 0.45), PCOL[i]]), A.INK, 1.4); });
      c.restore();
    }
    function eclipse(c, x, y, s) {
      c.save(); c.translate(x, y); c.scale(s, s);
      c.fillStyle = '#f3e6c8'; c.fillRect(0, 0, 200, 200);
      const cx = 100, cy = 100;
      [24, 46, 68].forEach(r => { c.setLineDash([3, 4]); A.circle(c, cx, cy, r, null, A.rgba('#3a2618', 0.4), 1); c.setLineDash([]); });
      c.setLineDash([6, 4]); c.strokeStyle = '#c8402a'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(cx, cy); c.lineTo(cx + 84, cy - 84); c.stroke(); c.setLineDash([]);
      A.sym(c, 'sun', cx, cy, 26, '#f0a030', { lw: 1.2 });
      [24, 46, 68].forEach((r, i) => A.circle(c, cx + r * 0.7071, cy - r * 0.7071, 6 + i * 1.5, PCOL[i], A.INK, 1.2));
      c.restore();
    }
    // --- music box ---
    const TUNE = [392, 523, 659, 784, 659, 523, 587, 698, 880, 784, 659, 523];
    function playTune() { TUNE.forEach((f, i) => { K.tone(f, 0.35, { type: 'sine', vol: 0.07, delay: i * 0.22 }); K.tone(f * 2, 0.2, { type: 'triangle', vol: 0.015, delay: i * 0.22 }); }); }
    function musicBox(c, S, t) {
      A.zoomBg(c, '#2f3156', { table: 250, tableCol: '#6a4a2e' });
      A.wood(c, 50, 30, 300, 222, '#8a4c24', { r: 12 });
      if (!S.lidOpen) {
        A.wood(c, 60, 40, 280, 200, '#9a5a2c', { r: 10 });
        LID.forEach((k, i) => { const x = 110 + i * 60; A.circle(c, x, 70, 20, '#f3e6c8', '#5a3a0c', 1.6); A.sym(c, k, x, 70, 26, '#5a4a30', { lw: 1.2 }); A.arrow(c, x, 112, 'U', 30); A.dial(c, x - 20, 134, 40, 48, S.code[i]); A.arrow(c, x, 206, 'D', 30); });
      } else {
        A.rr(c, 62, 42, 276, 196, 8); c.fillStyle = A.lg(c, 0, 42, 0, 238, ['#3a1a20', '#5a2a30']); c.fill();
        A.rr(c, 110, 100, 180, 56, 12); c.fillStyle = '#1a0a0c'; c.fill(); c.strokeStyle = '#c8962e'; c.lineWidth = 2; c.stroke();
        if (S.cyl) { c.save(); c.translate(116, 64); cylIcon(c, 168); c.restore(); }
        for (let i = 0; i < 12; i++) { c.fillStyle = '#d8dde2'; c.fillRect(120 + i * 14, 162, 8, 30); c.strokeStyle = '#2b3036'; c.lineWidth = 0.8; c.strokeRect(120 + i * 14, 162, 8, 30); }
        A.circle(c, 320, 200, 14, '#1a0a0c', '#c8962e', 2); if (S.wound) { c.save(); c.translate(300, 172); wkeyIcon(c, 40); c.restore(); }
        c.strokeStyle = '#d8dde2'; c.lineWidth = 5; c.lineCap = 'round'; c.beginPath(); c.moveTo(80, 210); c.lineTo(80 + (S.played ? 20 : 0), 178); c.stroke(); A.circle(c, 80 + (S.played ? 20 : 0), 176, 8, '#c8402a', A.INK, 1.4);
        if (K.tr.play && K.time() - K.tr.play < 3000) { const k = (K.time() - K.tr.play) / 3000; for (let i = 0; i < 4; i++) { const ph = (k * 3 + i * 0.25) % 1; A.text(c, '♪', 150 + i * 36, 90 - ph * 60, { size: 20, color: A.rgba('#ffe8b0', 1 - ph) }); } K.anim(60); }
      }
      // drawer
      A.wood(c, 120, 252, 160, 40, '#7a4220', { r: 4 });
      if (S.played) { A.wood(c, 114, 262, 172, 38, '#8a4c24', { r: 4 }); if (!S.got.hkey) { c.save(); c.translate(178, 250); hkeyIcon(c, 44); c.restore(); } }
      else A.brass(c, 186, 266, 28, 8, 3);
    }

    const views = {
      w0: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.nightWindow(c, 252, 30, 104, 104, { round: true });
          A.light(c, 304, 82, 120, '#c8d8ff', 0.15);
          // telescope
          c.strokeStyle = '#3a2a1e'; c.lineWidth = 4; c.lineCap = 'round';
          for (const [dx] of [[-40], [0], [36]]) { c.beginPath(); c.moveTo(200, 160); c.lineTo(200 + dx, 232); c.stroke(); }
          c.save(); c.translate(200, 150); c.rotate(-0.55);
          A.rr(c, -50, -13, 130, 26, 8); c.fillStyle = A.lg(c, 0, -13, 0, 13, ['#e6c070', '#a8741c', '#e6c070']); c.fill(); c.lineWidth = 1.5; c.strokeStyle = '#5a3a0c'; c.stroke();
          A.brass(c, 76, -17, 16, 34, 4); A.brass(c, -64, -8, 18, 16, 3);
          c.restore();
          A.circle(c, 200, 154, 7, '#5a3a0c');
          A.cat(c, 112, 238, 48, t, '#f0f0f0');
          end(c);
        },
        spots: S => [
          circ('window', 304, 82, 54, { say: '丸い窓から星空が見える' }),
          spot('cat', 82, 210, 60, 34, { tap: () => { meow(); K.say('こむぎが望遠鏡の下で眠っている'); } }),
          spot('scope', 140, 80, 140, 154, { go: 'scope5' }),
        ],
      },
      w1: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.wood(c, 30, 26, 206, 176, '#5a3a22', { r: 4 }); townMap(c, S, 30 + 8 - (MX - 16) * 0.66, 26 + 8 - (MY - 16) * 0.66, 0.66);
          A.frame(c, 258, 58, 112, 80, '#6b4423'); painting(c, 264, 64, 100, 68);
          end(c);
        },
        spots: S => [spot('map', 30, 26, 206, 176, { go: 'map5' }), spot('paint', 258, 58, 112, 80, { go: 'paint5' })],
      },
      w2: {
        draw(c, S, t) {
          A.room(c, PAL);
          A.nightWindow(c, 172, 26, 56, 56, { moon: false });
          A.wood(c, 110, 190, 10, 42, '#4a2e18'); A.wood(c, 280, 190, 10, 42, '#4a2e18'); A.wood(c, 96, 176, 208, 14, '#6a4a2e', { r: 2 });
          A.wood(c, 150, 128, 100, 48, '#8a4c24', { r: 6 }); A.wood(c, 146, 122, 108, 12, '#9a5a2c', { r: 4 });
          if (S.lidOpen) { c.save(); c.translate(200, 122); c.rotate(-0.25); A.wood(c, -54, -40, 108, 40, '#9a5a2c', { r: 4 }); c.restore(); }
          LID.forEach((k, i) => A.sym(c, k, 168 + i * 21, 152, 11, '#e8d8b0', { lw: 0.8 }));
          A.box(c, 266, 158, 10, 18, '#f6efe0', { r: 2 }); A.light(c, 271, 150, 70, '#ffcf7a', 0.4); c.fillStyle = '#ffd070'; c.beginPath(); c.ellipse(271, 152, 3, 6, 0, 0, Math.PI * 2); c.fill();
          end(c);
        },
        spots: S => [spot('candle', 258, 140, 26, 40, { say: 'ろうそくの灯り' }), spot('smallwin', 166, 20, 68, 68, { say: '小さな窓' }), spot('box', 140, 100, 120, 80, { go: 'box5' })],
      },
      w3: {
        draw(c, S, t) {
          A.room(c, PAL);
          // bookshelf
          A.wood(c, 22, 44, 150, 190, '#5a3a22', { r: 3 });
          for (const y of [118, 232]) A.wood(c, 26, y - 6, 142, 8, '#7a5038');
          for (let i = 0; i < 6; i++) { const r = S.books[i], h = 30 + r * 7; A.book(c, 32 + i * 22, 226 - h, 20, h, BOOKCOL[r]); }
          for (let i = 0; i < 5; i++) A.book(c, 34 + i * 26, 74 + (i % 2) * 6, 22, 38 - (i % 2) * 6, ['#6a4a5a', '#4a5a6a', '#7a6a3a', '#3a5a4a', '#6a3a2a'][i]);
          // sketch and orrery
          A.paper(c, 206, 28, 72, 62, 0.03); eclipse(c, 212, 32, 60 / 200);
          A.wood(c, 234, 190, 16, 42, '#4a2e18'); A.wood(c, 214, 224, 56, 10, '#4a2e18');
          orrery(c, S, 242, 152, 0.34);
          // floor hatch
          c.save(); c.beginPath(); c.moveTo(300, 244); c.lineTo(384, 244); c.lineTo(396, 292); c.lineTo(292, 292); c.closePath(); c.fillStyle = A.lg(c, 0, 244, 0, 292, ['#7a5236', '#4a2e1a']); c.fill(); c.strokeStyle = A.INK; c.lineWidth = 1.6; c.stroke();
          c.strokeStyle = A.rgba('#1a0d05', 0.5); c.beginPath(); c.moveTo(342, 244); c.lineTo(344, 292); c.stroke(); A.brass(c, 336, 262, 16, 12, 3); c.restore();
          end(c);
        },
        spots: S => [
          spot('books', 22, 120, 150, 112, { go: 'books5' }),
          spot('shelf', 22, 44, 150, 74, { say: '本だな' }),
          spot('ecl', 200, 24, 84, 72, { go: 'ecl5' }),
          spot('orr', 200, 104, 90, 130, { go: 'orr5' }),
          spot('hatch', 290, 240, 108, 56, { use: it => { if (it !== 'hkey') return false; K.take('hkey'); K.exit(); return true; }, tap: () => K.say('床の扉。鍵がかかっている') }),
        ],
      },
      scope5: {
        back: 'w0',
        draw(c, S) { c.fillStyle = '#05060c'; c.fillRect(0, 0, 400, 300); sky(c, S, 200, 150, 130, S.sky); A.arrow(c, 34, 150, 'L', 44); A.arrow(c, 366, 150, 'R', 44); for (let i = 0; i < 4; i++) A.circle(c, 176 + i * 16, 290, 4, i === S.sky ? '#ffe8b0' : '#4a4a5a'); },
        spots: S => [circ('sky', 200, 150, 130, { say: '線でつながった星座が見える' }), circ('skyL', 34, 150, 28, { tap: () => { S.sky = (S.sky + 3) % 4; K.sfx('move'); } }), circ('skyR', 366, 150, 28, { tap: () => { S.sky = (S.sky + 1) % 4; K.sfx('move'); } })],
      },
      map5: {
        back: 'w1',
        draw(c, S) { A.zoomBg(c, '#2f3156'); townMap(c, S, -5, 6, 1.06); A.zoomEnd(c); },
        spots: S => {
          const k = 1.06, ox = -5, oy = 6, l = [];
          const useSheet = it => { if (it !== 'sheet' || S.sheet) return false; S.sheet = 1; K.take('sheet'); K.ok(); K.say('星図を重ねた。★が鐘の塔に重なっている'); return true; };
          l.push(spot('mapAll', ox + (MX - 16) * k, oy + (MY - 16) * k, (5 * MC + 32) * k, (5 * MC + 32) * k, { use: useSheet, say: '親方の町の地図。四すみに＋の印' }));
          for (let cc = 0; cc < 5; cc++) for (let rr = 0; rr < 5; rr++) l.push(spot('cell' + cc + rr, ox + (MX + cc * MC) * k, oy + (MY + rr * MC) * k, MC * k, MC * k, { use: useSheet, tap: () => {
            if (S.sheet && cc === 3 && rr === 1) { if (!S.mapOpen) { S.mapOpen = 1; K.ok(); K.say('地図の鐘の塔の所に、小さな扉が開いた！'); } else if (!S.got.cyl) K.give('cyl'); else K.say('地図の中はからっぽ'); return; }
            K.say('親方の町の地図。四すみに＋の印');
          } }));
          return l;
        },
      },
      paint5: { back: 'w1', draw(c) { A.zoomBg(c, '#2f3156'); A.frame(c, 40, 50, 320, 200, '#6b4423'); painting(c, 48, 58, 304, 184); A.zoomEnd(c); }, spots: () => [spot('paint', 40, 50, 320, 200, { say: '6つの山の絵。高さがそれぞれちがう' })] },
      ecl5: { back: 'w3', draw(c) { A.zoomBg(c, '#2f3156'); A.paper(c, 90, 30, 220, 236, 0.02); eclipse(c, 100, 48, 1); A.zoomEnd(c); }, spots: () => [spot('sk', 90, 30, 220, 236, { say: '日食のスケッチ。太陽と星が一列に並んでいる' })] },
      books5: {
        back: 'w3',
        draw(c, S) {
          A.zoomBg(c, '#2f3156');
          A.wood(c, 30, 20, 340, 260, '#5a3a22', { r: 6 }); A.rr(c, 42, 32, 316, 220, 4); c.fillStyle = '#2a1a10'; c.fill(); A.wood(c, 36, 246, 328, 14, '#7a5038');
          if (S.booksOK) { A.rr(c, 250, 40, 96, 70, 4); c.fillStyle = '#120a06'; c.fill(); if (!S.got.wkey) { c.save(); c.translate(276, 50); wkeyIcon(c, 50); c.restore(); } }
          for (let i = 0; i < 6; i++) { const r = S.books[i], h = 50 + r * 26, x = 58 + i * 50; A.book(c, x, 246 - h, 42, h, BOOKCOL[r]); if (S.bsel === i) { A.rr(c, x - 3, 243 - h, 48, h + 6, 4); c.strokeStyle = '#ffd84a'; c.lineWidth = 3; c.stroke(); } }
          A.zoomEnd(c);
        },
        spots: S => {
          const l = [];
          for (let i = 0; i < 6; i++) l.push(spot('b' + i, 56 + i * 50, 40, 46, 208, { tap: () => {
            if (S.booksOK) { K.say(S.got.wkey ? '本の奥はからっぽ' : '本だなの奥の板が開いた！'); return; }
            if (S.bsel == null || S.bsel < 0) { S.bsel = i; K.sfx('select'); return; }
            const j = S.bsel; S.bsel = -1;
            if (j !== i) { const tmp = S.books[i]; S.books[i] = S.books[j]; S.books[j] = tmp; K.sfx('move'); }
            if (S.books.every((v, k) => v === PEAKS[k])) { S.booksOK = 1; K.ok(); K.say('本だなの奥の板が開いた！'); }
          } }));
          if (S.booksOK && !S.got.wkey) l.push(spot('wkey', 250, 40, 96, 70, { tap: () => K.give('wkey') }));
          return l;
        },
      },
      orr5: {
        back: 'w3',
        draw(c, S) {
          A.zoomBg(c, '#1e2040');
          orrery(c, S, OC[0], OC[1], 1);
          A.wood(c, 60, 236, 280, 60, '#5a3a22', { r: 6 });
          LEVERS.forEach((L, i) => { const x = 120 + i * 80; A.circle(c, x, 262, 22, A.rg(c, x - 6, 256, 2, 24, [A.shade(PCOL[i], 0.4), PCOL[i]]), A.INK, 2); c.strokeStyle = A.INK; c.lineWidth = 3; c.beginPath(); c.moveTo(x, 262); c.lineTo(x, 246); c.stroke(); });
          if (S.orrOK) { A.wood(c, 300, 200, 90, 40, '#7a5038', { r: 4 }); if (!S.got.sheet) { c.save(); c.translate(318, 184); sheetBig(c, 0, 0, 52); c.restore(); } }
          A.zoomEnd(c);
        },
        spots: S => {
          const l = [circ('model', OC[0], OC[1], 112, { say: '星の模型。太陽のまわりに3つの星' })];
          LEVERS.forEach((L, i) => l.push(circ('lv' + 'ABC'[i], 120 + i * 80, 262, 26, { tap: () => {
            if (S.orrOK) return;
            for (const k of L) S.orb[k] = (S.orb[k] + 1) % 8;
            K.sfx('tap');
            if (S.orb.every(p => p === 1)) { S.orrOK = 1; K.ok(); K.say('模型の台の引き出しが開いた！'); }
          } })));
          if (S.orrOK && !S.got.sheet) l.push(spot('sheet', 296, 176, 96, 70, { tap: () => K.give('sheet') }));
          return l;
        },
      },
      box5: {
        back: 'w2',
        draw(c, S, t) { musicBox(c, S, t); A.zoomEnd(c); },
        spots: S => {
          const l = [];
          if (!S.lidOpen) {
            l.push(spot('lid', 60, 40, 280, 70, { say: 'ふたに4つの絵と、4けたの数字の錠' }));
            for (let i = 0; i < 4; i++) {
              const x = 110 + i * 60, set = d => { S.code[i] = (S.code[i] + d + 10) % 10; K.sfx('tap'); if (S.code.every((v, j) => v === CODE[j])) { S.lidOpen = 1; K.ok(); K.say('ふたが開いた！'); } };
              l.push(circ('c' + i + 'u', x, 112, 22, { tap: () => set(1) }), circ('c' + i + 'd', x, 206, 22, { tap: () => set(-1) }));
            }
          } else {
            l.push(spot('slot', 110, 96, 180, 64, { use: it => { if (it !== 'cyl' || S.cyl) return false; S.cyl = 1; K.take('cyl'); K.sfx('drop'); K.say('筒がはまった'); return true; }, say: '筒をはめる溝' }));
            l.push(circ('wind', 320, 200, 26, { use: it => { if (it !== 'wkey' || S.wound) return false; S.wound = 1; K.take('wkey'); for (let i = 0; i < 4; i++) K.tone(1400, 0.03, { type: 'square', vol: 0.03, delay: i * 0.09 }); K.say('ねじを巻いた'); return true; }, say: 'ねじを巻く穴' }));
            l.push(circ('play', 84, 190, 28, { tap: () => {
              if (!(S.cyl && S.wound)) { K.say('まだ鳴らない。筒とねじ巻きがいる'); K.sfx('fail'); return; }
              K.tr.play = K.time(); K.anim(3000); playTune();
              if (!S.played) { S.played = 1; K.say('オルゴールが鳴った…下の引き出しが開いた！'); }
            } }));
          }
          if (S.played && !S.got.hkey) l.push(spot('hkey', 160, 240, 80, 56, { tap: () => K.give('hkey') }));
          return l;
        },
      },
    };
    const rep = (a, n) => Array(n).fill(a);
    return {
      id: 'r5', name: '屋根裏の天文台', par: 16 * 60000,
      intro: '屋根裏の天文台。星をながめるのが好きだった親方の、とっておきの部屋。望遠鏡が丸い窓を向いている。',
      outro: 'オルゴールが鳴りだした。親方がいつも口ずさんでいた曲だ。床の扉を開けて階段を下りると、朝日の差す台所で、親方がお茶をいれて待っていた。\n「よくやった。今日からおまえは、一人前の職人だ」',
      init: () => ({ got: {}, sky: 0, orb: [5, 2, 7], orrOK: 0, sheet: 0, mapOpen: 0, books: [6, 1, 4, 2, 5, 3], bsel: -1, booksOK: 0, code: [0, 0, 0, 0], lidOpen: 0, cyl: 0, wound: 0, played: 0 }),
      items, views, combos: [],
      puzzles: [
        { id: 'orr', name: '天体の模型', done: S => !!S.orrOK, hints: ['模型の上のスケッチ：太陽と3つの星が一直線', 'レバーを押すと、星が1つずつ進む。左のレバーは内側と真ん中、真ん中のレバーは真ん中と外側、右のレバーは外側だけを動かす', '3つとも右上に。左のレバー4回、真ん中3回、右7回'] },
        { id: 'map', name: '町の地図', avail: S => !!S.orrOK, done: S => !!S.got.cyl, hints: ['すける星図を、地図の上に重ねてみよう', '星図の＋を地図の四すみの＋に合わせると、★が地図の1か所に重なる', '星図を選んで地図をタップ。★の場所（上から2段目・右から2列目、鐘の塔）をタップ'] },
        { id: 'books', name: '本だな', done: S => !!S.booksOK, hints: ['本の高さに注目。似た形の絵が部屋にある', '地図の横の山の絵。山の高さの順に本を並べかえる。2冊を続けてタップで入れかえ', '左から、高さの順位が 3・5・2・6・1・4（6がいちばん高い）'] },
        { id: 'lid', name: 'オルゴールのふた', done: S => !!S.lidOpen, hints: ['ふたの4つの絵と同じ星座が、望遠鏡で見える', '望遠鏡で星座の星（線でつながった明るい星）を数える', '鳥4・やかん7・かなづち6・歯車5 → 4765'] },
        { id: 'box', name: 'オルゴールを鳴らす', avail: S => !!S.lidOpen, done: S => !!S.played, hints: ['オルゴールには筒とねじ巻きが要る', 'メロディーの筒は地図の中、ねじ巻きは本だなの奥', '筒を選んで中の溝に、ねじ巻きを選んで右の穴に。それからレバー'] },
        { id: 'hatch', name: '床の扉', avail: S => !!S.played, done: () => false, hints: ['床の扉には鍵穴がある', 'オルゴールの引き出しの鍵', '鍵を選んで床の扉をタップ'] },
      ],
      route: ['s:scope', 's:skyR', 's:skyR', 's:skyR', 'B', 'w:1', 's:paint', 'B', 'w:3', 's:ecl', 'B', 's:orr', ...rep('s:lvA', 4), ...rep('s:lvB', 3), ...rep('s:lvC', 7), 's:sheet', 'B',
        's:books', 's:b0', 's:b5', 's:b1', 's:b4', 's:b2', 's:b3', 's:b3', 's:b5', 's:wkey', 'B', 'w:1', 's:map', 'i:sheet', 's:cell31', 's:cell31', 's:cell31', 'B',
        'w:2', 's:box', ...rep('s:c0u', 4), ...rep('s:c1u', 7), ...rep('s:c2u', 6), ...rep('s:c3u', 5), 'i:cyl', 's:slot', 'i:wkey', 's:wind', 's:play', 's:hkey', 'B', 'w:3', 'i:hkey', 's:hatch'],
    };
  };
})(window);
