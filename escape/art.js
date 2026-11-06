// からくり工房からの脱出：絵の道具（Canvas 2D だけで描く。外の画像は使わない）
// EscapeRooms.art = { rr, room, light, vignette, shadow, wood, brass, text, wrap, sym, gear, cat, plant, frame, paper, nightWindow, door,
//                     zoomBg, inspectBg, caption, arrow, dial, jar, crest, lens … }
// 論理座標は 400×300（index.html が画面に合わせて拡大する）。
(function (root) {
  'use strict';
  const ER = root.EscapeRooms = root.EscapeRooms || {};
  const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", "Segoe UI", sans-serif';
  const INK = '#3a2618';
  const TAU = Math.PI * 2;
  const A = {};
  A.FONT = FONT; A.INK = INK;

  // small seeded random (the same grain every frame)
  A.rnd = seed => { let s = (seed >>> 0) || 1; return () => { s = (s * 1664525 + 1013904223) >>> 0; return s / 4294967296; }; };
  A.rr = (c, x, y, w, h, r) => {
    r = Math.max(0, Math.min(r || 0, w / 2, h / 2));
    c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.arcTo(x + w, y, x + w, y + r, r); c.lineTo(x + w, y + h - r);
    c.arcTo(x + w, y + h, x + w - r, y + h, r); c.lineTo(x + r, y + h); c.arcTo(x, y + h, x, y + h - r, r); c.lineTo(x, y + r); c.arcTo(x, y, x + r, y, r); c.closePath();
  };
  A.lg = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach((s, i) => g.addColorStop(Array.isArray(s) ? s[0] : i / (stops.length - 1), Array.isArray(s) ? s[1] : s)); return g; };
  A.rg = (c, x, y, r0, r1, stops) => { const g = c.createRadialGradient(x, y, r0, x, y, r1); stops.forEach((s, i) => g.addColorStop(Array.isArray(s) ? s[0] : i / (stops.length - 1), Array.isArray(s) ? s[1] : s)); return g; };
  // colour helpers
  function hex(h) { h = h.replace('#', ''); if (h.length === 3) h = h.split('').map(x => x + x).join(''); const n = parseInt(h, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  A.shade = (h, k) => { const [r, g, b] = hex(h); const f = v => Math.round(Math.max(0, Math.min(255, k >= 0 ? v + (255 - v) * k : v * (1 + k)))); return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')'; };
  A.rgba = (h, a) => { const [r, g, b] = hex(h); return 'rgba(' + r + ',' + g + ',' + b + ',' + a + ')'; };

  A.box = (c, x, y, w, h, col, o) => {
    o = o || {};
    A.rr(c, x, y, w, h, o.r == null ? 3 : o.r);
    c.fillStyle = o.flat ? col : A.lg(c, x, y, x, y + h, [A.shade(col, 0.14), col, A.shade(col, -0.18)]); c.fill();
    if (o.line !== false) { c.lineWidth = o.lw || 1.6; c.strokeStyle = o.stroke || INK; c.stroke(); }
  };
  // a plank or wooden part with a little grain
  A.wood = (c, x, y, w, h, col, o) => {
    o = o || {};
    A.box(c, x, y, w, h, col, o);
    c.save(); A.rr(c, x, y, w, h, o.r == null ? 3 : o.r); c.clip();
    const R = A.rnd(Math.round(x * 7 + y * 13 + w));
    c.strokeStyle = A.rgba('#2a160a', 0.16); c.lineWidth = 0.8;
    const vert = o.vert || h > w * 1.6;
    const n = Math.max(2, Math.floor((vert ? w : h) / 5));
    for (let i = 0; i < n; i++) {
      c.beginPath();
      if (vert) { const xx = x + (i + 0.5) * w / n + R() * 2; c.moveTo(xx, y); c.bezierCurveTo(xx + R() * 3 - 1.5, y + h * 0.3, xx - R() * 3 + 1.5, y + h * 0.7, xx + R() * 2 - 1, y + h); }
      else { const yy = y + (i + 0.5) * h / n + R() * 2; c.moveTo(x, yy); c.bezierCurveTo(x + w * 0.3, yy + R() * 3 - 1.5, x + w * 0.7, yy - R() * 3 + 1.5, x + w, yy + R() * 2 - 1); }
      c.stroke();
    }
    c.restore();
  };
  A.brass = (c, x, y, w, h, r) => { A.rr(c, x, y, w, h, r == null ? 3 : r); c.fillStyle = A.lg(c, x, y, x, y + h, ['#fff1b8', '#e6b84e', '#a8741c', '#d9a640']); c.fill(); c.lineWidth = 1.4; c.strokeStyle = '#5a3a0c'; c.stroke(); };
  A.circle = (c, x, y, r, fill, stroke, lw) => { c.beginPath(); c.arc(x, y, r, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.lineWidth = lw || 1.5; c.strokeStyle = stroke; c.stroke(); } };
  A.shadow = (c, x, y, rx, ry, a) => { c.save(); c.translate(x, y); c.scale(1, ry / rx); A.circle(c, 0, 0, rx, A.rg(c, 0, 0, 0, rx, [A.rgba('#140a04', a == null ? 0.35 : a), A.rgba('#140a04', 0)])); c.restore(); };
  A.glow = (c, x, y, r, col, a) => { c.save(); c.globalCompositeOperation = 'lighter'; A.circle(c, x, y, r, A.rg(c, x, y, 0, r, [A.rgba(col, a == null ? 0.35 : a), A.rgba(col, 0)])); c.restore(); };

  // ---------- text ----------
  A.text = (c, s, x, y, o) => {
    o = o || {};
    c.font = (o.weight || 800) + ' ' + (o.size || 14) + 'px ' + FONT; c.textAlign = o.align || 'center'; c.textBaseline = o.base || 'middle';
    if (o.stroke) { c.lineWidth = o.lw || 3; c.strokeStyle = o.stroke; c.lineJoin = 'round'; c.strokeText(s, x, y); }
    c.fillStyle = o.color || INK; c.fillText(s, x, y);
  };
  // wrap: CJK breaks anywhere, latin breaks at spaces; returns the height used
  A.wrap = (c, s, x, y, w, o) => {
    o = o || {};
    const size = o.size || 13, lh = o.lh || size * 1.45;
    c.font = (o.weight || 500) + ' ' + size + 'px ' + FONT; c.textAlign = o.align || 'left'; c.textBaseline = 'top'; c.fillStyle = o.color || INK;
    const lines = [];
    for (const para of String(s).split('\n')) {
      const toks = para.match(/[　-ヿ㐀-鿿＀-￯]|[^\s　-ヿ㐀-鿿＀-￯]+\s*|\s+/g) || [''];
      let line = '';
      for (const t of toks) {
        if (/^[、。」）！？,.!?)]$/.test(t) && !line.trim() && lines.length) { lines[lines.length - 1] += t; continue; }
        const tryL = line + t;
        if (c.measureText(tryL.trimEnd()).width > w && line) { lines.push(line.trimEnd()); line = /^[、。」）]$/.test(t) ? (lines[lines.length - 1] += t, '') : t.trimStart(); }
        else line = tryL;
      }
      lines.push(line.trimEnd());
    }
    const ax = o.align === 'center' ? x + w / 2 : x;
    lines.forEach((l, i) => c.fillText(l, ax, y + i * lh));
    return lines.length * lh;
  };
  // shrink the font until the text fits in h
  A.fitWrap = (c, s, x, y, w, h, o) => {
    o = Object.assign({}, o);
    let size = o.size || 13;
    for (; size > 8; size -= 0.5) {
      c.font = (o.weight || 500) + ' ' + size + 'px ' + FONT;
      const lh = size * 1.45, toks = String(s).split('\n');
      let n = 0;
      for (const p of toks) { const words = p.match(/[　-ヿ㐀-鿿＀-￯]|[^\s　-ヿ㐀-鿿＀-￯]+\s*|\s+/g) || ['']; let line = ''; n++; for (const t of words) { if (c.measureText((line + t).trimEnd()).width > w && line) { n++; line = t.trimStart(); } else line += t; } }
      if (n * lh <= h) break;
    }
    o.size = size; return A.wrap(c, s, x, y, w, o);
  };

  // ---------- symbols (shape language shared by the clues) ----------
  A.sym = (c, k, x, y, s, col, o) => {
    o = o || {};
    c.save(); c.translate(x, y);
    c.fillStyle = col || INK; c.strokeStyle = o.stroke || INK; c.lineWidth = o.lw || Math.max(1.2, s * 0.07); c.lineJoin = 'round'; c.lineCap = 'round';
    const r = s / 2;
    c.beginPath();
    switch (k) {
      case 'star': for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rr = i % 2 ? r * 0.45 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); c.stroke(); break;
      case 'sun': c.arc(0, 0, r * 0.5, 0, TAU); c.fill(); c.stroke(); for (let i = 0; i < 8; i++) { const a = i * Math.PI / 4; c.beginPath(); c.moveTo(Math.cos(a) * r * 0.66, Math.sin(a) * r * 0.66); c.lineTo(Math.cos(a) * r, Math.sin(a) * r); c.lineWidth = Math.max(1.6, s * 0.1); c.strokeStyle = col; c.stroke(); } break;
      case 'moon': c.arc(0, 0, r * 0.85, Math.PI * 0.3, Math.PI * 1.7); c.arc(r * 0.3, 0, r * 0.62, Math.PI * 1.55, Math.PI * 0.45, true); c.closePath(); c.fill(); c.stroke(); break;
      case 'cloud': c.arc(-r * 0.4, r * 0.1, r * 0.4, Math.PI * 0.5, Math.PI * 1.5); c.arc(0, -r * 0.2, r * 0.48, Math.PI * 1.05, Math.PI * 1.95); c.arc(r * 0.45, r * 0.1, r * 0.4, Math.PI * 1.5, Math.PI * 0.5); c.closePath(); c.fill(); c.stroke(); break;
      case 'circle': c.arc(0, 0, r * 0.8, 0, TAU); c.fill(); c.stroke(); break;
      case 'tri': c.moveTo(0, -r * 0.88); c.lineTo(r * 0.88, r * 0.7); c.lineTo(-r * 0.88, r * 0.7); c.closePath(); c.fill(); c.stroke(); break;
      case 'square': c.rect(-r * 0.72, -r * 0.72, r * 1.44, r * 1.44); c.fill(); c.stroke(); break;
      case 'diamond': c.moveTo(0, -r); c.lineTo(r * 0.8, 0); c.lineTo(0, r); c.lineTo(-r * 0.8, 0); c.closePath(); c.fill(); c.stroke(); break;
      case 'hammer': c.rect(-r * 0.12, -r * 0.4, r * 0.24, r * 1.3); c.fill(); c.stroke(); c.beginPath(); c.rect(-r * 0.7, -r * 0.8, r * 1.4, r * 0.45); c.fill(); c.stroke(); break;
      case 'bird': c.moveTo(-r, -r * 0.1); c.quadraticCurveTo(-r * 0.4, -r * 0.7, 0, -r * 0.05); c.quadraticCurveTo(r * 0.4, -r * 0.7, r, -r * 0.1); c.quadraticCurveTo(r * 0.4, -r * 0.3, 0, r * 0.35); c.quadraticCurveTo(-r * 0.4, -r * 0.3, -r, -r * 0.1); c.closePath(); c.fill(); c.stroke(); break;
      case 'kettle': c.moveTo(-r * 0.7, r * 0.7); c.lineTo(r * 0.7, r * 0.7); c.quadraticCurveTo(r * 0.8, -r * 0.2, 0, -r * 0.3); c.quadraticCurveTo(-r * 0.8, -r * 0.2, -r * 0.7, r * 0.7); c.closePath(); c.fill(); c.stroke();
        c.beginPath(); c.moveTo(r * 0.55, r * 0.1); c.lineTo(r, -r * 0.35); c.stroke(); c.beginPath(); c.arc(0, -r * 0.35, r * 0.45, Math.PI * 1.1, Math.PI * 1.9); c.stroke(); break;
      case 'gear': for (let i = 0; i < 16; i++) { const a = i * TAU / 16, rr = i % 2 ? r * 0.72 : r; c.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); } c.closePath(); c.fill(); c.stroke(); c.beginPath(); c.arc(0, 0, r * 0.3, 0, TAU); c.fillStyle = o.hole || '#00000055'; c.fill(); break;
      case 'camera': c.rect(-r * 0.9, -r * 0.45, r * 1.8, r * 1.15); c.fill(); c.stroke(); c.beginPath(); c.rect(-r * 0.35, -r * 0.7, r * 0.7, r * 0.28); c.fill(); c.stroke(); c.beginPath(); c.arc(0, r * 0.12, r * 0.38, 0, TAU); c.fillStyle = o.hole || '#fff8'; c.fill(); c.stroke(); break;
      case 'crate': c.rect(-r * 0.8, -r * 0.8, r * 1.6, r * 1.6); c.fill(); c.stroke(); c.beginPath(); c.moveTo(-r * 0.8, -r * 0.8); c.lineTo(r * 0.8, r * 0.8); c.stroke(); break;
      default: c.arc(0, 0, r * 0.6, 0, TAU); c.fill();
    }
    c.restore();
  };
  A.gear = (c, x, y, r, teeth, rot, col, o) => {
    o = o || {};
    c.save(); c.translate(x, y); c.rotate(rot || 0);
    c.beginPath();
    const n = teeth * 2, ro = r, ri = r - Math.max(3, r * 0.16);
    for (let i = 0; i <= n * 2; i++) { const a = i * TAU / (n * 2); const k = (i % 4 < 2) ? ro : ri; c.lineTo(Math.cos(a) * k, Math.sin(a) * k); }
    c.closePath();
    c.fillStyle = A.rg(c, -r * 0.3, -r * 0.3, r * 0.1, r * 1.2, [A.shade(col, 0.35), col, A.shade(col, -0.35)]); c.fill();
    c.lineWidth = 1.4; c.strokeStyle = o.stroke || '#3b2408'; c.stroke();
    A.circle(c, 0, 0, ri * 0.62, null, A.rgba('#3b2408', 0.5), 1.2);
    for (let i = 0; i < 4; i++) { c.save(); c.rotate(i * Math.PI / 2 + 0.4); A.rr(c, ri * 0.2, -ri * 0.1, ri * 0.32, ri * 0.2, 2); c.fillStyle = A.rgba('#3b2408', 0.35); c.fill(); c.restore(); }
    A.circle(c, 0, 0, Math.max(2.5, r * 0.16), '#3b2408');
    c.restore();
  };

  // ---------- the room shell ----------
  // p = { wall, wall2, pattern: 'stripe'|'dots'|'diamond'|'plank'|'stars', wains, floor, fy, light:[x,y], slope }
  A.room = (c, p, t) => {
    const fy = p.fy || 232;
    c.fillStyle = A.lg(c, 0, 0, 0, fy, [A.shade(p.wall, 0.12), p.wall, A.shade(p.wall, -0.2)]); c.fillRect(0, 0, 400, fy);
    c.save(); c.beginPath(); c.rect(0, 0, 400, fy); c.clip();
    const pat = p.pattern;
    if (pat === 'stripe') { c.fillStyle = A.rgba(p.wall2 || '#000000', 0.5); for (let x = 0; x < 400; x += 24) c.fillRect(x, 0, 10, fy); c.fillStyle = A.rgba('#ffffff', 0.05); for (let x = 12; x < 400; x += 24) c.fillRect(x, 0, 2, fy); }
    else if (pat === 'dots' || pat === 'diamond') { c.fillStyle = A.rgba(p.wall2 || '#000000', 0.55); for (let y = 10, j = 0; y < fy; y += 22, j++) for (let x = (j % 2) * 15; x < 410; x += 30) { if (pat === 'dots') A.circle(c, x, y, 2.4, c.fillStyle); else { c.beginPath(); c.moveTo(x, y - 6); c.lineTo(x + 4, y); c.lineTo(x, y + 6); c.lineTo(x - 4, y); c.fill(); } } }
    else if (pat === 'plank') { for (let x = 0, i = 0; x < 400; x += 34, i++) { c.fillStyle = A.rgba(i % 2 ? '#000000' : '#ffffff', i % 2 ? 0.08 : 0.04); c.fillRect(x, 0, 34, fy); c.fillStyle = A.rgba('#1a0d05', 0.45); c.fillRect(x, 0, 1.5, fy); const R = A.rnd(i * 31 + 7); for (let k = 0; k < 2; k++) { A.circle(c, x + 6 + R() * 22, 20 + R() * (fy - 40), 1.6, A.rgba('#1a0d05', 0.4)); } } }
    else if (pat === 'stars') { const R = A.rnd(99); for (let i = 0; i < 70; i++) { const x = R() * 400, y = R() * fy, s = 1 + R() * 2.2; A.sym(c, 'star', x, y, s * 2, A.rgba(p.wall2 || '#ffffff', 0.35), { stroke: 'transparent', lw: 0.1 }); } }
    c.restore();
    if (p.wains) { // wainscot
      const wy = p.wy || fy - 58;
      A.wood(c, -4, wy, 408, fy - wy + 2, p.wains, { r: 0, lw: 1.2 });
      c.strokeStyle = A.rgba('#1a0d05', 0.35); c.lineWidth = 1.2;
      for (let x = 10; x < 400; x += 64) { A.rr(c, x, wy + 10, 52, fy - wy - 20, 3); c.stroke(); }
      A.wood(c, -4, wy - 6, 408, 8, A.shade(p.wains, 0.15), { r: 0, lw: 1.2 });
    }
    if (p.slope) { // attic roof beams
      c.fillStyle = A.lg(c, 0, 0, 0, 90, [A.shade(p.slope, -0.25), p.slope]);
      c.beginPath(); c.moveTo(0, 0); c.lineTo(110, 0); c.lineTo(0, 90); c.closePath(); c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke();
      c.beginPath(); c.moveTo(400, 0); c.lineTo(290, 0); c.lineTo(400, 90); c.closePath(); c.fill(); c.stroke();
      A.wood(c, 0, 0, 400, 12, A.shade(p.slope, 0.1), { r: 0 });
    }
    // floor
    c.fillStyle = A.lg(c, 0, fy, 0, 300, [A.shade(p.floor, 0.05), A.shade(p.floor, -0.35)]); c.fillRect(0, fy, 400, 300 - fy);
    c.strokeStyle = A.rgba('#140a04', 0.35); c.lineWidth = 1;
    for (let i = 1; i < 6; i++) { const y = fy + (300 - fy) * Math.pow(i / 6, 1.35); c.beginPath(); c.moveTo(0, y); c.lineTo(400, y); c.stroke(); }
    for (let i = -6; i <= 6; i++) { c.beginPath(); c.moveTo(200 + i * 40, fy); c.lineTo(200 + i * 95, 300); c.stroke(); }
    A.wood(c, -4, fy - 5, 408, 9, A.shade(p.wains || p.floor, -0.1), { r: 0, lw: 1.2 });
  };
  A.light = (c, x, y, r, col, a) => A.glow(c, x, y, r, col || '#ffd08a', a == null ? 0.28 : a);
  A.vignette = (c, a) => { c.fillStyle = A.rg(c, 200, 140, 120, 290, [A.rgba('#000000', 0), A.rgba('#0c0603', a == null ? 0.45 : a)]); c.fillRect(0, 0, 400, 300); };

  // ---------- furniture and small things ----------
  A.frame = (c, x, y, w, h, col, inner) => {
    A.shadow(c, x + w / 2, y + h + 2, w * 0.5, 4, 0.25);
    A.wood(c, x, y, w, h, col || '#7a4a22', { r: 2 });
    A.rr(c, x + 5, y + 5, w - 10, h - 10, 1); c.fillStyle = inner || '#f3e6c8'; c.fill(); c.lineWidth = 1; c.strokeStyle = INK; c.stroke();
  };
  A.paper = (c, x, y, w, h, rot, col) => {
    c.save(); c.translate(x + w / 2, y + h / 2); c.rotate(rot || 0);
    c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(-w / 2 + 2, -h / 2 + 3, w, h);
    c.fillStyle = A.lg(c, 0, -h / 2, 0, h / 2, [col || '#fbf3df', A.shade(col || '#fbf3df', -0.08)]); c.fillRect(-w / 2, -h / 2, w, h);
    c.lineWidth = 1; c.strokeStyle = A.rgba(INK, 0.6); c.strokeRect(-w / 2, -h / 2, w, h);
    A.circle(c, 0, -h / 2 + 4, 2.6, '#c8402a', INK, 1);
    c.restore();
  };
  A.lines = (c, x, y, w, n, gap) => { c.strokeStyle = A.rgba(INK, 0.35); c.lineWidth = 1.2; for (let i = 0; i < n; i++) { c.beginPath(); c.moveTo(x, y + i * gap); c.lineTo(x + w * (i === n - 1 ? 0.6 : 1), y + i * gap); c.stroke(); } };
  A.nightWindow = (c, x, y, w, h, o) => {
    o = o || {};
    A.wood(c, x - 6, y - 6, w + 12, h + 12, o.frame || '#6b4423', { r: 3 });
    c.save(); A.rr(c, x, y, w, h, o.round ? w / 2 : 2); c.clip();
    c.fillStyle = A.lg(c, 0, y, 0, y + h, o.sky || ['#0f1838', '#283a6e', '#4a4f7a']); c.fillRect(x, y, w, h);
    const R = A.rnd(Math.round(x + y));
    for (let i = 0; i < w * h / 160; i++) A.circle(c, x + R() * w, y + R() * h, 0.5 + R() * 1.1, A.rgba('#fff7d8', 0.4 + R() * 0.6));
    if (o.moon !== false) { A.circle(c, x + w * 0.72, y + h * 0.3, Math.min(w, h) * 0.13, '#fff3c4'); A.glow(c, x + w * 0.72, y + h * 0.3, Math.min(w, h) * 0.4, '#fff3c4', 0.25); }
    if (o.hills !== false) { c.fillStyle = '#141a33'; c.beginPath(); c.moveTo(x, y + h); c.lineTo(x, y + h * 0.82); c.quadraticCurveTo(x + w * 0.3, y + h * 0.7, x + w * 0.55, y + h * 0.84); c.quadraticCurveTo(x + w * 0.8, y + h * 0.72, x + w, y + h * 0.8); c.lineTo(x + w, y + h); c.fill(); }
    c.restore();
    if (!o.round) { c.strokeStyle = o.frame ? A.shade(o.frame, -0.2) : '#4a2c14'; c.lineWidth = 4; c.beginPath(); c.moveTo(x + w / 2, y); c.lineTo(x + w / 2, y + h); c.moveTo(x, y + h / 2); c.lineTo(x + w, y + h / 2); c.stroke(); }
    A.rr(c, x, y, w, h, o.round ? w / 2 : 2); c.lineWidth = 1.6; c.strokeStyle = INK; c.stroke();
  };
  A.door = (c, x, y, w, h, col, o) => {
    o = o || {};
    A.shadow(c, x + w / 2, y + h, w * 0.6, 5, 0.3);
    A.wood(c, x - 6, y - 6, w + 12, h + 6, A.shade(col, -0.25), { r: 2 });
    if (o.open) { c.fillStyle = A.lg(c, x, y, x, y + h, ['#1a120c', '#3a2a1a']); c.fillRect(x, y, w, h); A.glow(c, x + w / 2, y + h * 0.6, w, '#ffd08a', 0.3); return; }
    A.wood(c, x, y, w, h, col, { r: 2, vert: true });
    c.strokeStyle = A.rgba('#1a0d05', 0.45); c.lineWidth = 1.4;
    A.rr(c, x + 9, y + 10, w - 18, h * 0.38, 3); c.stroke(); A.rr(c, x + 9, y + h * 0.52, w - 18, h * 0.42, 3); c.stroke();
    const kx = o.knobX != null ? o.knobX : x + w - 14, ky = y + h * 0.53;
    A.circle(c, kx, ky, 5.5, A.rg(c, kx - 2, ky - 2, 1, 6, ['#fff1b8', '#c8962e']), INK, 1.3);
    A.brass(c, kx - 4, ky + 9, 8, 13, 2); c.fillStyle = '#2a1606'; c.beginPath(); c.arc(kx, ky + 14, 1.8, 0, TAU); c.fill(); c.fillRect(kx - 0.8, ky + 14, 1.6, 5);
  };
  A.plant = (c, x, y, s) => {
    s = s || 1;
    A.shadow(c, x, y + 2, 18 * s, 4 * s, 0.3);
    c.save(); c.translate(x, y); c.scale(s, s);
    const leaf = (a, l) => { c.save(); c.rotate(a); c.beginPath(); c.moveTo(0, 0); c.quadraticCurveTo(8, -l * 0.5, 0, -l); c.quadraticCurveTo(-8, -l * 0.5, 0, 0); c.fillStyle = A.lg(c, 0, 0, 0, -l, ['#3f7a3a', '#7cbf5a']); c.fill(); c.lineWidth = 1.1; c.strokeStyle = '#1f3d1a'; c.stroke(); c.restore(); };
    [-0.9, -0.5, -0.15, 0.2, 0.55, 0.9].forEach((a, i) => leaf(a, 24 + (i % 3) * 6));
    c.beginPath(); c.moveTo(-14, -6); c.lineTo(14, -6); c.lineTo(10, 14); c.lineTo(-10, 14); c.closePath(); c.fillStyle = A.lg(c, 0, -6, 0, 14, ['#d9784a', '#a64e2a']); c.fill(); c.lineWidth = 1.4; c.strokeStyle = INK; c.stroke();
    c.fillStyle = '#c9683c'; c.fillRect(-15, -8, 30, 5); c.strokeRect(-15, -8, 30, 5);
    c.restore();
  };
  // Komugi, the workshop cat, asleep (s = width)
  A.cat = (c, x, y, s, t, col) => {
    const k = s / 60; col = col || '#e8a95a';
    A.shadow(c, x, y + 4 * k, 32 * k, 6 * k, 0.35);
    c.save(); c.translate(x, y); c.scale(k, k);
    const breathe = 1 + Math.sin((t || 0) / 700) * 0.02;
    c.save(); c.scale(1, breathe);
    c.beginPath(); c.ellipse(0, -12, 30, 16, 0, 0, TAU); c.fillStyle = A.lg(c, 0, -28, 0, 4, [A.shade(col, 0.25), col, A.shade(col, -0.2)]); c.fill(); c.lineWidth = 1.6; c.strokeStyle = INK; c.stroke();
    c.strokeStyle = 'rgba(110,55,15,.4)'; c.lineWidth = 2;
    for (const sx of [-12, -3, 6]) { c.beginPath(); c.moveTo(sx, -27); c.quadraticCurveTo(sx + 3, -20, sx, -14); c.stroke(); }
    c.restore();
    c.beginPath(); c.moveTo(26, -4); c.quadraticCurveTo(40, -2, 34, -16); c.lineWidth = 6; c.lineCap = 'round'; c.strokeStyle = INK; c.stroke(); c.lineWidth = 4; c.strokeStyle = col; c.stroke();
    c.beginPath(); c.ellipse(-24, -10, 13, 11, 0, 0, TAU); c.fillStyle = A.shade(col, 0.1); c.fill(); c.lineWidth = 1.6; c.strokeStyle = INK; c.stroke();
    for (const ex of [-33, -18]) { c.beginPath(); c.moveTo(ex - 4, -17); c.lineTo(ex, -27); c.lineTo(ex + 5, -18); c.closePath(); c.fillStyle = A.shade(col, 0.1); c.fill(); c.stroke(); }
    c.lineWidth = 1.3; c.strokeStyle = INK;
    for (const ex of [-29, -20]) { c.beginPath(); c.arc(ex, -11, 2.6, 0.2, Math.PI - 0.2); c.stroke(); }
    A.circle(c, -24.5, -6.5, 1.3, '#d0606a');
    c.restore();
    A.text(c, 'z', x - 12 * k, y - 38 * k - Math.sin((t || 0) / 600) * 2, { size: 9 * k + 3, color: A.rgba('#fff4d6', 0.8) });
    A.text(c, 'z', x - 4 * k, y - 46 * k - Math.sin((t || 0) / 600 + 1) * 2, { size: 7 * k + 3, color: A.rgba('#fff4d6', 0.6) });
  };
  A.cushion = (c, x, y, w, col) => { A.shadow(c, x, y + 6, w * 0.55, 6, 0.3); c.beginPath(); c.ellipse(x, y, w / 2, w * 0.14, 0, 0, TAU); c.fillStyle = A.lg(c, 0, y - 8, 0, y + 8, [A.shade(col, 0.2), A.shade(col, -0.2)]); c.fill(); c.lineWidth = 1.5; c.strokeStyle = INK; c.stroke(); };
  A.sconce = (c, x, y, t) => {
    A.light(c, x, y + 6, 90, '#ffcf7a', 0.3);
    A.brass(c, x - 3, y + 6, 6, 18, 2);
    c.beginPath(); c.moveTo(x - 12, y + 6); c.lineTo(x + 12, y + 6); c.lineTo(x + 8, y - 12); c.lineTo(x - 8, y - 12); c.closePath();
    c.fillStyle = A.lg(c, 0, y - 12, 0, y + 6, ['#fff4c8', '#f2b860']); c.fill(); c.lineWidth = 1.4; c.strokeStyle = INK; c.stroke();
  };
  A.hangLamp = (c, x, y, len, col) => {
    c.strokeStyle = INK; c.lineWidth = 1.4; c.beginPath(); c.moveTo(x, 0); c.lineTo(x, y); c.stroke();
    A.light(c, x, y + 12, 110, col || '#ffcf7a', 0.32);
    c.beginPath(); c.moveTo(x - 20, y + 14); c.quadraticCurveTo(x, y - 8, x + 20, y + 14); c.closePath(); c.fillStyle = A.lg(c, 0, y - 4, 0, y + 14, ['#5a7a5a', '#2f4a32']); c.fill(); c.stroke();
    A.circle(c, x, y + 15, 5, '#fff4c8');
  };
  A.book = (c, x, y, w, h, col) => { A.box(c, x, y, w, h, col, { r: 1.5, lw: 1.2 }); c.fillStyle = A.rgba('#fff3c8', 0.6); c.fillRect(x + 2, y + h * 0.2, w - 4, 2); c.fillRect(x + 2, y + h * 0.75, w - 4, 2); };
  A.jar = (c, x, y, w, h, lid, tint) => {
    A.shadow(c, x + w / 2, y + h, w * 0.6, 4, 0.3);
    A.rr(c, x, y + 6, w, h - 6, 8); c.fillStyle = A.rgba(tint || '#cfe8f0', 0.35); c.fill(); c.lineWidth = 1.6; c.strokeStyle = INK; c.stroke();
    c.fillStyle = A.rgba('#ffffff', 0.35); c.fillRect(x + 5, y + 12, 4, h - 22);
    A.box(c, x - 2, y, w + 4, 9, lid, { r: 2, lw: 1.4 });
  };
  A.screw = (c, x, y, a, s) => {
    s = s || 1; c.save(); c.translate(x, y); c.rotate(a); c.scale(s, s);
    c.fillStyle = A.lg(c, -2, 0, 2, 0, ['#9aa3ad', '#e8eef2', '#7d8690']); c.fillRect(-1.6, -2, 3.2, 12); c.strokeStyle = '#2b3036'; c.lineWidth = 0.8; c.strokeRect(-1.6, -2, 3.2, 12);
    for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-1.6, i * 2.6); c.lineTo(1.6, i * 2.6 + 1.2); c.stroke(); }
    c.beginPath(); c.ellipse(0, -2.5, 4.2, 2, 0, 0, TAU); c.fillStyle = '#c5ccd3'; c.fill(); c.stroke();
    c.restore();
  };
  A.screwHead = (c, x, y, r) => { A.circle(c, x, y, r, A.rg(c, x - r / 3, y - r / 3, 0.5, r, ['#f2f4f6', '#8a9198']), '#2b3036', 1); c.strokeStyle = '#2b3036'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(x - r * 0.7, y); c.lineTo(x + r * 0.7, y); c.stroke(); };

  // ---------- close-ups ----------
  A.zoomBg = (c, col, o) => {
    o = o || {};
    c.fillStyle = A.lg(c, 0, 0, 0, 300, [A.shade(col, 0.1), col, A.shade(col, -0.35)]); c.fillRect(0, 0, 400, 300);
    if (o.table) { c.fillStyle = A.lg(c, 0, o.table, 0, 300, [A.shade(o.tableCol || '#7a4a22', 0.1), A.shade(o.tableCol || '#7a4a22', -0.3)]); c.fillRect(0, o.table, 400, 300 - o.table); c.strokeStyle = INK; c.lineWidth = 1.5; c.beginPath(); c.moveTo(0, o.table); c.lineTo(400, o.table); c.stroke(); }
    A.light(c, o.lx || 200, o.ly || 90, 260, '#ffd8a0', 0.14);
  };
  A.zoomEnd = c => A.vignette(c, 0.4);
  A.inspectBg = c => {
    c.fillStyle = A.rg(c, 200, 140, 20, 260, ['#5a4232', '#2a1d14']); c.fillRect(0, 0, 400, 300);
    c.strokeStyle = A.rgba('#ffe8c0', 0.05); c.lineWidth = 1; for (let i = -300; i < 400; i += 9) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i + 300, 300); c.stroke(); }
  };
  A.caption = (c, s) => { A.text(c, s, 200, 284, { size: 13, color: '#fff2d8', stroke: 'rgba(20,12,6,.8)', lw: 4 }); };
  A.arrow = (c, x, y, dir, s, on) => {
    s = s || 34;
    A.rr(c, x - s / 2, y - s / 2, s, s, 8); c.fillStyle = A.lg(c, 0, y - s / 2, 0, y + s / 2, on ? ['#ffe2a0', '#e8a640'] : ['#f6ead2', '#cdb894']); c.fill(); c.lineWidth = 1.5; c.strokeStyle = INK; c.stroke();
    c.save(); c.translate(x, y); c.rotate({ U: 0, R: Math.PI / 2, D: Math.PI, L: -Math.PI / 2 }[dir]);
    c.beginPath(); c.moveTo(0, -s * 0.28); c.lineTo(s * 0.26, s * 0.06); c.lineTo(s * 0.1, s * 0.06); c.lineTo(s * 0.1, s * 0.26); c.lineTo(-s * 0.1, s * 0.26); c.lineTo(-s * 0.1, s * 0.06); c.lineTo(-s * 0.26, s * 0.06); c.closePath();
    c.fillStyle = INK; c.fill(); c.restore();
  };
  A.dial = (c, x, y, w, h, d) => {
    A.rr(c, x, y, w, h, 6); c.fillStyle = A.lg(c, 0, y, 0, y + h, ['#6c6c6c', '#f4f0e6', '#f4f0e6', '#6c6c6c']); c.fill(); c.lineWidth = 1.6; c.strokeStyle = INK; c.stroke();
    A.text(c, String(d), x + w / 2, y + h / 2 + 1, { size: h * 0.56, color: '#2a1a10' });
  };
  // the workshop crest: a gear with a star inside a ribbon (room 4's sliding picture)
  A.crest = (c, x, y, s) => {
    c.save(); c.translate(x, y); c.scale(s / 150, s / 150);
    c.fillStyle = A.lg(c, 0, 0, 0, 150, ['#2d4f6e', '#1b3046']); c.fillRect(0, 0, 150, 150);
    c.strokeStyle = A.rgba('#ffffff', 0.08); c.lineWidth = 1; for (let i = 0; i < 150; i += 10) { c.beginPath(); c.moveTo(i, 0); c.lineTo(i, 150); c.stroke(); }
    A.circle(c, 75, 68, 58, A.rg(c, 75, 68, 4, 58, ['#ffe9a8', '#c9a14a']), '#5a3a0c', 2);
    A.gear(c, 75, 66, 44, 12, 0.1, '#b77a34');
    A.sym(c, 'star', 75, 66, 40, '#ffd84a', { stroke: '#5a3a0c', lw: 2 });
    c.beginPath(); c.moveTo(14, 112); c.lineTo(136, 112); c.lineTo(126, 124); c.lineTo(136, 136); c.lineTo(14, 136); c.lineTo(24, 124); c.closePath();
    c.fillStyle = A.lg(c, 0, 112, 0, 136, ['#e0604a', '#a83a2a']); c.fill(); c.lineWidth = 2; c.strokeStyle = '#4a120a'; c.stroke();
    for (let i = 0; i < 5; i++) A.circle(c, 42 + i * 16.5, 124, 3.2, '#ffe9a8', '#4a120a', 1);
    A.sym(c, 'moon', 20, 18, 16, '#fff3c4', { stroke: '#5a3a0c', lw: 1.2 }); A.sym(c, 'sun', 130, 18, 18, '#ffd84a', { stroke: '#5a3a0c', lw: 1.2 });
    c.restore();
  };
  ER.art = A;
  // rooms register themselves (room1.js … room5.js): ER.defs[i] = (K, A, H) => room
  ER.defs = ER.defs || [];
  ER.H = {
    spot: (id, x, y, w, h, o) => Object.assign({ id, x, y, w, h }, o || {}),
    circ: (id, cx, cy, r, o) => Object.assign({ id, cx, cy, r }, o || {}),
  };
  ER.build = K => ER.defs.filter(Boolean).map(f => f(K, A, ER.H));
})(window);
