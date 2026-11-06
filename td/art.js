// 工房まもり — drawing. Everything is procedural: the boards, the windup toys, the towers and the effects.
// Sprites are drawn once per board size into small canvases and stamped with drawImage; particles live in a fixed pool,
// so a frame with 200+ toys and shots allocates nothing.
(function (root) {
  'use strict';
  let TD = null, T = s => s, L = o => (o ? o.ja : ''), reduced = () => false;
  const TAU = Math.PI * 2;
  let V = { ts: 30, dpr: 1, ox: 0, oy: 0, tr: false, W: 360, H: 560 };
  const stat = document.createElement('canvas'), sctx = stat.getContext('2d');
  const SPR = {};       // enemy sprites: SPR[k] = [frame0, frame1, flash]
  const TWR = {};       // tower sprites: TWR[type + lv + br] = { base, head }
  let UMB = null, SHADOW = null;
  const ICONS = {};

  // ------------------------------------------------------------------ helpers
  function mk(w, h, fn, dpr) {
    const c = document.createElement('canvas'); dpr = dpr || V.dpr;
    c.width = Math.max(2, Math.ceil(w * dpr)); c.height = Math.max(2, Math.ceil(h * dpr));
    const g = c.getContext('2d'); g.setTransform(dpr, 0, 0, dpr, w / 2 * dpr, h / 2 * dpr);
    fn(g); c.cw = w; c.ch = h; return c;
  }
  function circ(g, x, y, r, fill, stroke, lw) { g.beginPath(); g.arc(x, y, r, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.lineWidth = lw || 1; g.strokeStyle = stroke; g.stroke(); } }
  function rr(g, x, y, w, h, r, fill, stroke, lw) {
    g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath();
    if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.lineWidth = lw || 1; g.strokeStyle = stroke; g.stroke(); }
  }
  function ell(g, x, y, rx, ry, fill) { g.beginPath(); g.ellipse(x, y, rx, ry, 0, 0, TAU); g.fillStyle = fill; g.fill(); }
  function gear(g, x, y, r, teeth, fill, hole) {
    g.beginPath();
    for (let i = 0; i < teeth * 2; i++) { const a = i * Math.PI / teeth, rr2 = i % 2 ? r * 0.78 : r; g.lineTo(x + Math.cos(a) * rr2, y + Math.sin(a) * rr2); }
    g.closePath(); g.fillStyle = fill; g.fill();
    if (hole) circ(g, x, y, r * 0.32, hole);
  }
  function key(g, x, y, s, rot) { // a windup key
    g.save(); g.translate(x, y); g.rotate(rot || 0);
    g.fillStyle = '#e8c25a'; g.strokeStyle = '#7a5a12'; g.lineWidth = Math.max(0.8, s * 0.12);
    g.fillRect(-s * 0.1, -s * 0.15, s * 0.2, s * 0.6);
    g.beginPath(); g.ellipse(-s * 0.32, -s * 0.3, s * 0.28, s * 0.2, 0, 0, TAU); g.ellipse(s * 0.32, -s * 0.3, s * 0.28, s * 0.2, 0, 0, TAU); g.fill(); g.stroke();
    g.restore();
  }
  function flashOf(c) {
    const f = document.createElement('canvas'); f.width = c.width; f.height = c.height; f.cw = c.cw; f.ch = c.ch;
    const g = f.getContext('2d'); g.drawImage(c, 0, 0); g.globalCompositeOperation = 'source-atop'; g.fillStyle = 'rgba(255,255,255,.85)'; g.fillRect(0, 0, f.width, f.height);
    return f;
  }
  function eyes(g, x, y, s, col) { circ(g, x - s, y, s * 0.55, col || '#2a1a10'); circ(g, x + s, y, s * 0.55, col || '#2a1a10'); }

  // ------------------------------------------------------------------ toys (radius r, frame f)
  const TOY = {
    b(g, r, f) { // windup soldier
      const lg = f ? 0.18 : -0.18;
      g.fillStyle = '#2a2a3a'; g.fillRect(-r * 0.42 + lg * r, r * 0.45, r * 0.32, r * 0.5); g.fillRect(r * 0.1 - lg * r, r * 0.45, r * 0.32, r * 0.5);
      rr(g, -r * 0.62, -r * 0.2, r * 1.24, r * 0.78, r * 0.25, '#d9483b', '#5a1410', r * 0.08);
      g.fillStyle = '#f2d16b'; g.fillRect(-r * 0.62, r * 0.18, r * 1.24, r * 0.12);
      circ(g, 0, -r * 0.42, r * 0.38, '#f6d6ae', '#6a4020', r * 0.07);
      rr(g, -r * 0.34, -r * 1.08, r * 0.68, r * 0.5, r * 0.08, '#262634');
      circ(g, 0, -r * 0.82, r * 0.11, '#f2d16b');
      eyes(g, 0, -r * 0.4, r * 0.13);
      key(g, r * 0.7, -r * 0.05, r * 0.55, Math.PI / 2);
    },
    f(g, r, f) { // spring bunny
      const sq = f ? 0.15 : -0.05;
      g.strokeStyle = '#8a8f99'; g.lineWidth = r * 0.12;
      g.beginPath(); for (let i = 0; i < 4; i++) { const y = r * (0.35 + i * (0.17 + sq * 0.3)); g.moveTo(-r * 0.3, y); g.lineTo(r * 0.3, y + r * 0.08); } g.stroke();
      ell(g, 0, r * 0.05, r * 0.6, r * 0.5, '#fbeff4');
      g.strokeStyle = '#c87a96'; g.lineWidth = r * 0.07; g.beginPath(); g.ellipse(0, r * 0.05, r * 0.6, r * 0.5, 0, 0, TAU); g.stroke();
      for (const s of [-1, 1]) { g.save(); g.translate(s * r * 0.25, -r * 0.4); g.rotate(s * 0.25); ell(g, 0, -r * 0.35, r * 0.15, r * 0.45, '#fbeff4'); ell(g, 0, -r * 0.33, r * 0.07, r * 0.32, '#f2a4be'); g.restore(); }
      eyes(g, 0, -r * 0.02, r * 0.12, '#c23a5a');
      circ(g, 0, r * 0.14, r * 0.07, '#e06a8a');
    },
    t(g, r, f) { // tin turtle
      const lg = f ? 0.1 : -0.1;
      for (const [x, y] of [[-0.55, 0.45], [0.55, 0.45], [-0.55, -0.25], [0.55, -0.25]]) ell(g, (x + lg * Math.sign(y)) * r, y * r, r * 0.18, r * 0.14, '#6a8a5a');
      ell(g, r * 0.78, 0, r * 0.24, r * 0.2, '#7a9a6a'); circ(g, r * 0.86, -r * 0.05, r * 0.05, '#1a1a1a');
      ell(g, 0, 0.05 * r, r * 0.72, r * 0.6, '#5e6a76');
      ell(g, 0, 0, r * 0.66, r * 0.54, '#a7b2bd');
      g.strokeStyle = '#5e6a76'; g.lineWidth = r * 0.06; g.beginPath(); g.moveTo(-r * 0.6, 0); g.lineTo(r * 0.6, 0); g.moveTo(0, -r * 0.5); g.lineTo(0, r * 0.5); g.stroke();
      for (const [x, y] of [[-0.3, -0.25], [0.3, -0.25], [-0.3, 0.25], [0.3, 0.25]]) circ(g, x * r, y * r, r * 0.06, '#e8eef4');
    },
    h(g, r, f) { // oil can
      circ(g, -r * 0.35, r * 0.6, r * 0.16, '#3a3a3a'); circ(g, r * 0.35, r * 0.6, r * 0.16, '#3a3a3a');
      g.beginPath(); g.moveTo(-r * 0.55, r * 0.5); g.lineTo(r * 0.55, r * 0.5); g.lineTo(r * 0.35, -r * 0.3); g.lineTo(-r * 0.35, -r * 0.3); g.closePath(); g.fillStyle = '#e8b83c'; g.fill(); g.strokeStyle = '#7a5a12'; g.lineWidth = r * 0.07; g.stroke();
      g.strokeStyle = '#c99a2a'; g.lineWidth = r * 0.12; g.beginPath(); g.moveTo(r * 0.25, -r * 0.2); g.lineTo(r * 0.9, -r * 0.75 + (f ? 0.06 : 0) * r); g.stroke();
      circ(g, 0, -r * 0.42, r * 0.16, '#c99a2a');
      g.fillStyle = '#3fae5a'; g.fillRect(-r * 0.08, -r * 0.05, r * 0.16, r * 0.42); g.fillRect(-r * 0.21, r * 0.08, r * 0.42, r * 0.16);
    },
    s(g, r, f) { // nesting doll
      ell(g, 0, r * 0.2, r * 0.66, r * 0.72, '#c8342e'); ell(g, 0, -r * 0.45, r * 0.5, r * 0.46, '#c8342e');
      g.strokeStyle = '#5a120e'; g.lineWidth = r * 0.06; g.beginPath(); g.ellipse(0, r * 0.2, r * 0.66, r * 0.72, 0, 0, TAU); g.stroke();
      ell(g, 0, -r * 0.45, r * 0.32, r * 0.3, '#f6dcbc');
      eyes(g, 0, -r * 0.47, r * 0.09); circ(g, -r * 0.18, -r * 0.33, r * 0.06, '#f08a8a'); circ(g, r * 0.18, -r * 0.33, r * 0.06, '#f08a8a');
      ell(g, 0, r * 0.32, r * 0.36, r * 0.34, '#f6e2a8');
      for (let i = 0; i < 5; i++) { const a = i * TAU / 5 + (f ? 0.3 : 0); circ(g, Math.cos(a) * r * 0.18, r * 0.32 + Math.sin(a) * r * 0.16, r * 0.07, '#e0543e'); }
      circ(g, 0, r * 0.32, r * 0.07, '#3a8a4a');
    },
    m(g, r, f) { // inner doll
      ell(g, 0, r * 0.15, r * 0.66, r * 0.75, '#3a6ac8'); ell(g, 0, -r * 0.48, r * 0.5, r * 0.46, '#3a6ac8');
      ell(g, 0, -r * 0.48, r * 0.33, r * 0.3, '#f6dcbc'); eyes(g, 0, -r * 0.5, r * 0.1);
      ell(g, 0, r * 0.3, r * 0.34, r * 0.32, '#f2f2f2'); circ(g, 0, r * 0.3, r * 0.14, f ? '#e8c25a' : '#f0a84a');
    },
    a(g, r, f) { // balloon bear (the shadow is drawn on the ground separately)
      g.strokeStyle = '#eee'; g.lineWidth = r * 0.06; g.beginPath(); g.moveTo(0, -r * 0.1); g.quadraticCurveTo(r * (f ? 0.15 : -0.15), r * 0.1, 0, r * 0.3); g.stroke();
      circ(g, 0, -r * 0.55, r * 0.55, '#e84a5a', '#8a1a2a', r * 0.06); ell(g, -r * 0.18, -r * 0.75, r * 0.12, r * 0.18, 'rgba(255,255,255,.55)');
      circ(g, -r * 0.3, r * 0.4, r * 0.13, '#a0683a'); circ(g, r * 0.3, r * 0.4, r * 0.13, '#a0683a');
      circ(g, 0, r * 0.6, r * 0.34, '#b8784a', '#5a3418', r * 0.06);
      ell(g, 0, r * 0.7, r * 0.15, r * 0.11, '#f0d0a8'); eyes(g, 0, r * 0.55, r * 0.09); circ(g, 0, r * 0.68, r * 0.05, '#2a1a10');
    },
    u(g, r, f) { // umbrella kid (the umbrella itself is an overlay that fades with the shield)
      const lg = f ? 0.15 : -0.15;
      g.fillStyle = '#2a3a2a'; g.fillRect(-r * 0.35 + lg * r, r * 0.4, r * 0.25, r * 0.45); g.fillRect(r * 0.1 - lg * r, r * 0.4, r * 0.25, r * 0.45);
      rr(g, -r * 0.5, -r * 0.2, r, r * 0.72, r * 0.3, '#4aa860', '#1a4a20', r * 0.07);
      circ(g, 0, -r * 0.35, r * 0.32, '#f6d6ae', '#6a4020', r * 0.06); eyes(g, 0, -r * 0.33, r * 0.1);
      g.strokeStyle = '#5a3a1a'; g.lineWidth = r * 0.09; g.beginPath(); g.moveTo(r * 0.45, 0); g.lineTo(r * 0.45, -r * 0.9); g.stroke();
    },
    k(g, r, f) { // tin engine
      for (const x of [-0.5, 0, 0.5]) { circ(g, x * r, r * 0.55, r * 0.22, '#2a2a2a'); circ(g, x * r, r * 0.55, r * 0.09, f ? '#c8c8c8' : '#8a8a8a'); }
      rr(g, -r * 0.8, -r * 0.2, r * 1.3, r * 0.65, r * 0.12, '#3a6ab0', '#122a52', r * 0.07);
      rr(g, -r * 0.8, -r * 0.62, r * 0.55, r * 0.5, r * 0.08, '#2c5290', '#122a52', r * 0.07);
      g.fillStyle = '#ffe08a'; g.fillRect(-r * 0.7, -r * 0.52, r * 0.32, r * 0.22);
      g.fillStyle = '#222'; g.fillRect(r * 0.2, -r * 0.65, r * 0.22, r * 0.48);
      g.fillStyle = '#c8342e'; g.fillRect(r * 0.5, -r * 0.05, r * 0.25, r * 0.4);
      g.fillStyle = '#f2d16b'; g.fillRect(-r * 0.8, r * 0.1, r * 1.3, r * 0.08);
      key(g, -r * 0.2, -r * 0.6, r * 0.45, 0);
    },
    K(g, r, f) { // clockwork king
      ell(g, 0, r * 0.25, r * 0.85, r * 0.7, '#6a3aa8'); g.strokeStyle = '#2a0a52'; g.lineWidth = r * 0.06; g.beginPath(); g.ellipse(0, r * 0.25, r * 0.85, r * 0.7, 0, 0, TAU); g.stroke();
      g.fillStyle = '#f2f2f2'; g.fillRect(-r * 0.1, -r * 0.2, r * 0.2, r * 1.0);
      for (let i = 0; i < 3; i++) circ(g, 0, r * (0.05 + i * 0.25), r * 0.06, '#e8c25a');
      circ(g, 0, -r * 0.35, r * 0.4, '#f6d6ae', '#6a4020', r * 0.05); eyes(g, 0, -r * 0.35, r * 0.11);
      g.strokeStyle = '#7a4020'; g.lineWidth = r * 0.06; g.beginPath(); g.moveTo(-r * 0.2, -r * 0.18); g.quadraticCurveTo(0, -r * 0.08, r * 0.2, -r * 0.18); g.stroke();
      gear(g, 0, -r * 0.85, r * 0.42, 8, '#e8c25a', '#6a3aa8');
      for (const s of [-1, 1]) circ(g, s * r * 0.3, -r * 0.92, r * 0.07, s > 0 ? '#e84a5a' : '#4ac8e8');
      key(g, r * 0.88, -r * 0.2, r * 0.6, Math.PI / 2 + (f ? 0.4 : 0));
    },
  };
  // the umbrella over an umbrella kid
  function drawUmb(g, r) {
    g.beginPath(); g.moveTo(-r * 1.0, -r * 0.55); g.quadraticCurveTo(0, -r * 1.75, r * 1.0, -r * 0.55);
    for (let i = 4; i >= 0; i--) { const x = -r + i * r * 0.5; g.quadraticCurveTo(x + r * 0.25, -r * 0.75, x, -r * 0.55); }
    g.closePath(); g.fillStyle = '#5ab4f0'; g.fill(); g.strokeStyle = '#1a4a7a'; g.lineWidth = r * 0.07; g.stroke();
    g.strokeStyle = 'rgba(255,255,255,.5)'; g.beginPath(); g.moveTo(0, -r * 1.15); g.lineTo(0, -r * 0.6); g.stroke();
  }

  // ------------------------------------------------------------------ towers (pointing +x)
  const RIM = ['#8a5a32', '#c8962e', '#c8d0d8', '#ffd24a'];
  function towerBase(g, r, type, lv, br) {
    const D = TD.TOWERS[type];
    ell(g, 0, r * 0.12, r * 0.95, r * 0.9, 'rgba(0,0,0,.35)');
    circ(g, 0, 0, r * 0.88, RIM[lv - 1], '#2a1a0a', r * 0.07);
    circ(g, 0, 0, r * 0.7, lv >= 4 ? (br === 'b' ? '#4a3a6a' : '#6a3a2a') : '#5a4030');
    circ(g, 0, 0, r * 0.62, D.color);
    g.strokeStyle = 'rgba(0,0,0,.18)'; g.lineWidth = r * 0.05;
    for (let i = 0; i < 6; i++) { const a = i * TAU / 6; g.beginPath(); g.moveTo(Math.cos(a) * r * 0.62, Math.sin(a) * r * 0.62); g.lineTo(Math.cos(a) * r * 0.72, Math.sin(a) * r * 0.72); g.stroke(); }
    if (type === 'coil') { // copper coil, not rotating
      for (let i = 0; i < 4; i++) { g.strokeStyle = i % 2 ? '#b8622a' : '#e08a4a'; g.lineWidth = r * 0.1; g.beginPath(); g.arc(0, 0, r * (0.18 + i * 0.1), 0, TAU); g.stroke(); }
      circ(g, 0, 0, r * 0.16, '#cfe8ff', '#2a4a7a', r * 0.05);
      if (lv >= 4) for (let i = 0; i < 4; i++) { const a = i * TAU / 4 + 0.8; circ(g, Math.cos(a) * r * 0.55, Math.sin(a) * r * 0.55, r * 0.08, br === 'b' ? '#ffe04a' : '#9ad8ff'); }
    }
    if (type === 'toolbox') {
      rr(g, -r * 0.5, -r * 0.28, r, r * 0.6, r * 0.08, '#c8342e', '#5a120e', r * 0.06);
      g.strokeStyle = '#3a3a3a'; g.lineWidth = r * 0.09; g.beginPath(); g.moveTo(-r * 0.22, -r * 0.28); g.lineTo(-r * 0.22, -r * 0.45); g.lineTo(r * 0.22, -r * 0.45); g.lineTo(r * 0.22, -r * 0.28); g.stroke();
      g.fillStyle = '#f2d16b'; g.fillRect(-r * 0.1, -r * 0.05, r * 0.2, r * 0.14);
      if (lv >= 4 && br === 'a') { g.fillStyle = '#9aa8b8'; g.fillRect(-r * 0.4, r * 0.38, r * 0.8, r * 0.16); }
      if (lv >= 4 && br === 'b') { ell(g, r * 0.35, r * 0.42, r * 0.22, r * 0.17, '#f2a4be'); circ(g, r * 0.42, r * 0.36, r * 0.03, '#2a1a10'); }
    }
    if (type === 'copter') { circ(g, 0, 0, r * 0.32, '#c99a5a', '#5a3a12', r * 0.05); }
    if (type === 'spring') { for (let i = 0; i < 3; i++) { g.strokeStyle = '#8a8f99'; g.lineWidth = r * 0.08; g.beginPath(); g.arc(0, 0, r * (0.3 + i * 0.09), 0, TAU); g.stroke(); } }
  }
  function towerHead(g, r, type, lv, br) {
    if (type === 'nail') {
      const long = lv >= 4 && br === 'b', dbl = lv >= 4 && br === 'a';
      const len = long ? 1.15 : 0.75 + lv * 0.04;
      const ys = dbl ? [-0.16, 0.16] : [0];
      for (const y of ys) { rr(g, -r * 0.1, (y - 0.11) * r, r * len, r * 0.22, r * 0.06, '#9aa3ad', '#2a2f36', r * 0.05); g.fillStyle = '#d8dde2'; g.fillRect(r * (len - 0.12), (y - 0.06) * r, r * 0.12, r * 0.12); }
      circ(g, 0, 0, r * 0.32, '#5a6470', '#1a1f26', r * 0.05); circ(g, 0, 0, r * 0.12, lv >= 3 ? '#ffd24a' : '#c8962e');
    } else if (type === 'spring') {
      const big = lv >= 4 && br === 'a';
      rr(g, -r * 0.1, -r * (big ? 0.3 : 0.24), r * (big ? 0.8 : 0.66), r * (big ? 0.6 : 0.48), r * 0.18, '#d9634a', '#5a1a0e', r * 0.06);
      circ(g, r * (big ? 0.62 : 0.5), 0, r * (big ? 0.24 : 0.18), '#3a1a0e');
      circ(g, 0, 0, r * 0.26, br === 'b' && lv >= 4 ? '#ffe04a' : '#f0a88a', '#5a1a0e', r * 0.05);
    } else if (type === 'glue') {
      rr(g, -r * 0.4, -r * 0.24, r * 0.75, r * 0.48, r * 0.2, '#f4f4ec', '#4a5a4a', r * 0.06);
      g.fillStyle = lv >= 4 ? (br === 'b' ? '#3a8a6a' : '#7fc8a8') : '#5ab48a'; g.fillRect(-r * 0.4, -r * 0.24, r * 0.2, r * 0.48);
      g.beginPath(); g.moveTo(r * 0.35, -r * 0.14); g.lineTo(r * 0.7, -r * 0.05); g.lineTo(r * 0.7, r * 0.05); g.lineTo(r * 0.35, r * 0.14); g.closePath(); g.fillStyle = '#e8c25a'; g.fill();
      circ(g, r * 0.74, 0, r * 0.06, '#7fe8b0');
    } else if (type === 'copter') { // the blades (spun by the renderer)
      const n = lv >= 4 && br === 'a' ? 3 : 2, len = lv >= 4 && br === 'b' ? 0.95 : 0.78;
      for (let i = 0; i < n; i++) { g.save(); g.rotate(i * TAU / n); ell(g, r * len * 0.5, 0, r * len * 0.5, r * 0.13, '#e8c25a'); g.strokeStyle = '#8a6a1a'; g.lineWidth = r * 0.04; g.beginPath(); g.ellipse(r * len * 0.5, 0, r * len * 0.5, r * 0.13, 0, 0, TAU); g.stroke(); g.restore(); }
      circ(g, 0, 0, r * 0.14, '#8a5a2a');
    }
  }

  // ------------------------------------------------------------------ build sprites for the current tile size
  function resize(view) {
    V = view;
    const ts = V.ts;
    for (const k of TD.ENEMY_KEYS) {
      const E = TD.ENEMIES[k], r = E.size * ts, S = r * 3.2;
      const fr = [0, 1].map(f => mk(S, S, g => TOY[k](g, r, f)));
      SPR[k] = [fr[0], fr[1], flashOf(fr[0])];
    }
    const ur = TD.ENEMIES.u.size * ts;
    UMB = mk(ur * 3, ur * 3.4, g => drawUmb(g, ur));
    SHADOW = mk(ts, ts * 0.5, g => ell(g, 0, 0, ts * 0.3, ts * 0.12, 'rgba(0,0,0,.28)'));
    for (const k in TWR) delete TWR[k];
  }
  function tw(type, lv, br) {
    const id = type + lv + (br || '');
    if (TWR[id]) return TWR[id];
    const r = V.ts * 0.5, S = V.ts * 1.3;
    const o = { base: mk(S, S, g => towerBase(g, r, type, lv, br)), head: (type === 'nail' || type === 'spring' || type === 'glue' || type === 'copter') ? mk(S * 1.5, S * 1.5, g => towerHead(g, r, type, lv, br)) : null };
    return (TWR[id] = o);
  }
  function enemyIcon(k) {
    if (ICONS['e' + k]) return ICONS['e' + k];
    const E = TD.ENEMIES[k], r = 64 * 0.3 * (E.boss ? 0.9 : 1) / Math.max(0.3, E.size) * E.size;
    const c = mk(64, 64, g => { g.translate(0, k === 'a' ? 6 : 4); if (k === 'u') { TOY.u(g, r, 0); drawUmb(g, r); } else TOY[k](g, r, 0); }, 1);
    return (ICONS['e' + k] = c.toDataURL());
  }
  function towerIcon(type, lv, br) {
    const id = 't' + type + lv + (br || '');
    if (ICONS[id]) return ICONS[id];
    const r = 26;
    const c = mk(64, 64, g => { towerBase(g, r, type, lv || 1, br); g.rotate(-Math.PI / 4); towerHead(g, r, type, lv || 1, br); }, 1);
    return (ICONS[id] = c.toDataURL());
  }

  // ------------------------------------------------------------------ the board (static layer)
  function hashXY(x, y, s) { let h = (x * 73856093) ^ (y * 19349663) ^ (s * 83492791); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }
  function shade(hex, f) { const n = parseInt(hex.slice(1), 16); let r = n >> 16, g = (n >> 8) & 255, b = n & 255; r = Math.max(0, Math.min(255, Math.round(r * f))); g = Math.max(0, Math.min(255, Math.round(g * f))); b = Math.max(0, Math.min(255, Math.round(b * f))); return 'rgb(' + r + ',' + g + ',' + b + ')'; }
  // g is already transformed to tile units (x right, y down; transposed boards swap the axes in the matrix)
  function drawBoard(g, I, o) {
    const M = I.M, C = TD.COLS, R = TD.ROWS, seed = M.tone + 1;
    o = o || {};
    // ground: a craft mat with a faint grid
    g.fillStyle = M.ground; g.fillRect(-1, -1, C + 2, R + 2);
    for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) { const v = hashXY(x, y, seed); g.fillStyle = v < 0.5 ? 'rgba(255,255,255,' + (0.025 + v * 0.03) + ')' : 'rgba(0,0,0,' + (0.02 + (v - 0.5) * 0.05) + ')'; g.fillRect(x, y, 1, 1); }
    g.strokeStyle = 'rgba(255,255,255,.07)'; g.lineWidth = 0.03;
    g.beginPath(); for (let x = 1; x < C; x++) { g.moveTo(x, 0); g.lineTo(x, R); } for (let y = 1; y < R; y++) { g.moveTo(0, y); g.lineTo(C, y); } g.stroke();
    // little things lying around (never on the path or a pad)
    if (!o.noDecor) {
      const slotSet = new Set(I.slots.map(s => s.y * C + s.x));
      for (let y = 0; y < R; y++) for (let x = 0; x < C; x++) {
        if (I.path[y * C + x] || slotSet.has(y * C + x)) continue;
        const v = hashXY(x, y, seed + 7); if (v > 0.3) continue;
        const cx = x + 0.3 + hashXY(x, y, 3) * 0.4, cy = y + 0.3 + hashXY(x, y, 5) * 0.4, kind = Math.floor(hashXY(x, y, 11) * 5);
        g.save(); g.translate(cx, cy); g.rotate(hashXY(x, y, 13) * TAU);
        if (kind === 0) { circ(g, 0, 0, 0.12, '#b8bec6', '#5a6068', 0.02); g.strokeStyle = '#5a6068'; g.lineWidth = 0.03; g.beginPath(); g.moveTo(-0.08, 0); g.lineTo(0.08, 0); g.stroke(); }
        else if (kind === 1) { circ(g, 0, 0, 0.13, ['#e85a5a', '#5ab4e8', '#f2c84a'][Math.floor(v * 10) % 3]); for (const [a, b] of [[-0.04, -0.04], [0.04, -0.04], [-0.04, 0.04], [0.04, 0.04]]) circ(g, a, b, 0.02, 'rgba(0,0,0,.35)'); }
        else if (kind === 2) { rr(g, -0.12, -0.16, 0.24, 0.32, 0.04, '#d8b888'); g.fillStyle = ['#c8342e', '#3a6ac8', '#4aa860'][Math.floor(v * 10) % 3]; g.fillRect(-0.12, -0.1, 0.24, 0.2); }
        else if (kind === 3) { g.fillStyle = '#f2c84a'; g.fillRect(-0.3, -0.04, 0.5, 0.08); g.fillStyle = '#f4d6ae'; g.beginPath(); g.moveTo(0.2, -0.04); g.lineTo(0.3, 0); g.lineTo(0.2, 0.04); g.fill(); g.fillStyle = '#e88a9a'; g.fillRect(-0.34, -0.04, 0.05, 0.08); }
        else gear(g, 0, 0, 0.14, 7, 'rgba(200,200,190,.75)', M.ground);
        g.restore();
      }
    }
    // flyers' lanes
    g.save(); g.setLineDash([0.2, 0.22]); g.lineWidth = 0.08; g.strokeStyle = 'rgba(200,230,255,.22)'; g.lineCap = 'round';
    for (const A of I.air) { g.beginPath(); A.P.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); }
    g.restore();
    // the path: a felt strip with stitched edges
    const strokeAll = (w, col, dash) => {
      g.lineWidth = w; g.strokeStyle = col; g.setLineDash(dash || []);
      for (const Rt of I.routes) { g.beginPath(); Rt.P.forEach((p, i) => (i ? g.lineTo(p.x, p.y) : g.moveTo(p.x, p.y))); g.stroke(); }
    };
    g.lineJoin = 'round'; g.lineCap = 'round';
    strokeAll(1.02, 'rgba(0,0,0,.28)');
    strokeAll(0.9, '#8a6a48');
    strokeAll(0.8, '#d8bf98');
    strokeAll(0.62, '#e6d2ae');
    g.lineCap = 'butt'; strokeAll(0.035, 'rgba(120,80,40,.55)', [0.12, 0.1]);
    g.setLineDash([]); g.lineCap = 'round';
    // entrances (mouse holes) and the workbench
    const seen = new Set();
    for (const Rt of I.routes) {
      const p = Rt.P[0], k = Math.round(p.x * 10) + ':' + Math.round(p.y * 10); if (seen.has(k)) continue; seen.add(k);
      const ex = Math.max(0.15, Math.min(C - 0.15, p.x)), ey = Math.max(0.15, Math.min(R - 0.15, p.y));
      circ(g, ex, ey, 0.5, '#2a1a10', '#5a3a1a', 0.08); circ(g, ex, ey, 0.32, '#120a06');
    }
    const gl = I.goal;
    g.save(); g.translate(gl.x, Math.min(R - 0.55, gl.y));
    rr(g, -0.9, -0.45, 1.8, 0.95, 0.12, '#7a4a22', '#2a160a', 0.06);
    rr(g, -0.8, -0.38, 1.6, 0.4, 0.06, '#a8703a');
    gear(g, -0.42, 0.18, 0.18, 8, '#e8c25a', '#7a4a22'); gear(g, 0.02, 0.2, 0.13, 7, '#c8d0d8', '#7a4a22'); circ(g, 0.42, 0.18, 0.12, '#b8bec6', '#5a6068', 0.03);
    g.restore();
    // build pads (cork coasters)
    if (!o.noPads) for (const s of I.slots) {
      circ(g, s.cx, s.cy + 0.05, 0.38, 'rgba(0,0,0,.25)');
      circ(g, s.cx, s.cy, 0.37, '#c99a62', '#7a5a32', 0.05);
      circ(g, s.cx, s.cy, 0.26, '#d8ae76');
      for (let i = 0; i < 5; i++) { const a = hashXY(s.x, s.y, i) * TAU, d = hashXY(s.y, s.x, i) * 0.26; circ(g, s.cx + Math.cos(a) * d, s.cy + Math.sin(a) * d, 0.025, '#9a7240'); }
    }
  }
  function boardMatrix(view, dpr) {
    const k = view.ts * dpr;
    return view.tr ? [0, k, k, 0, view.ox * dpr, view.oy * dpr] : [k, 0, 0, k, view.ox * dpr, view.oy * dpr];
  }
  let staticFor = null;
  function buildStatic(I, view) {
    V = view;
    stat.width = Math.round(view.W * view.dpr); stat.height = Math.round(view.H * view.dpr);
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    sctx.fillStyle = shade(I.M.ground, 0.55); sctx.fillRect(0, 0, stat.width, stat.height);
    sctx.setTransform.apply(sctx, boardMatrix(view, view.dpr));
    sctx.save(); sctx.beginPath(); sctx.rect(0, 0, TD.COLS, TD.ROWS); sctx.clip();
    drawBoard(sctx, I, {});
    sctx.restore();
    sctx.setTransform(1, 0, 0, 1, 0, 0);
    staticFor = I;
  }
  function mapThumb(c, mi, big) {
    const I = TD.mapInfo(mi), g = c.getContext('2d');
    const view = { tr: true, ts: Math.min(c.width / TD.ROWS, c.height / TD.COLS) };
    view.ox = (c.width - TD.ROWS * view.ts) / 2; view.oy = (c.height - TD.COLS * view.ts) / 2;
    g.setTransform(1, 0, 0, 1, 0, 0); g.fillStyle = shade(I.M.ground, 0.55); g.fillRect(0, 0, c.width, c.height);
    g.setTransform.apply(g, boardMatrix(view, 1));
    drawBoard(g, I, { noDecor: !big });
    g.setTransform(1, 0, 0, 1, 0, 0);
  }

  // ------------------------------------------------------------------ particles (fixed pool, screen px)
  const NP = 900;
  const P = [];
  for (let i = 0; i < NP; i++) P.push({ on: false, k: 0, x: 0, y: 0, vx: 0, vy: 0, t: 0, T: 1, s: 1, c: '#fff', r: 0, vr: 0, txt: '', pts: new Float32Array(12) });
  let pi = 0, live = 0;
  function part() { for (let n = 0; n < NP; n++) { const p = P[pi]; pi = (pi + 1) % NP; if (!p.on) { p.on = true; live++; return p; } } return null; }
  const scrX = (x, y) => (V.tr ? V.ox + y * V.ts : V.ox + x * V.ts);
  const scrY = (x, y) => (V.tr ? V.oy + x * V.ts : V.oy + y * V.ts);
  const DEBRIS = { b: ['#d9483b', '#f2d16b', '#262634'], f: ['#fbeff4', '#f2a4be', '#8a8f99'], t: ['#a7b2bd', '#6a8a5a', '#5e6a76'], h: ['#e8b83c', '#3fae5a', '#3a3a3a'], s: ['#c8342e', '#f6e2a8', '#f6dcbc'], m: ['#3a6ac8', '#f2f2f2'], a: ['#e84a5a', '#b8784a', '#ffffff'], u: ['#4aa860', '#5ab4f0', '#f6d6ae'], k: ['#3a6ab0', '#2a2a2a', '#f2d16b'], K: ['#6a3aa8', '#e8c25a', '#f2f2f2'] };
  function burst(x, y, cols, n, spd, size, life) {
    const red = reduced(); if (red) n = Math.ceil(n / 3);
    for (let i = 0; i < n; i++) {
      const p = part(); if (!p) return;
      const a = Math.random() * TAU, v = spd * (0.4 + Math.random() * 0.8);
      p.k = 0; p.x = x; p.y = y; p.vx = Math.cos(a) * v; p.vy = Math.sin(a) * v - spd * 0.4; p.t = 0; p.T = life * (0.7 + Math.random() * 0.6);
      p.s = size * (0.6 + Math.random() * 0.7); p.c = cols[i % cols.length]; p.r = Math.random() * TAU; p.vr = (Math.random() - 0.5) * 12;
    }
  }
  function ring(x, y, r0, r1, col, life, w) { const p = part(); if (!p) return; p.k = 2; p.x = x; p.y = y; p.s = r0; p.vx = r1; p.c = col; p.t = 0; p.T = life; p.vr = w || 2; }
  function text(x, y, s, col, size) { const p = part(); if (!p) return; p.k = 3; p.x = x; p.y = y; p.txt = s; p.c = col; p.t = 0; p.T = 0.9; p.s = size || 12; p.vy = -28; }
  function zap(x1, y1, x2, y2, col) {
    const p = part(); if (!p) return;
    p.k = 4; p.t = 0; p.T = 0.16; p.c = col; p.x = x1; p.y = y1;
    const a = p.pts, dx = x2 - x1, dy = y2 - y1, len = Math.hypot(dx, dy) || 1, nx = -dy / len, ny = dx / len;
    for (let i = 0; i < 6; i++) { const f = i / 5, j = i === 0 || i === 5 ? 0 : (Math.random() - 0.5) * Math.min(14, len * 0.3); a[i * 2] = x1 + dx * f + nx * j; a[i * 2 + 1] = y1 + dy * f + ny * j; }
  }
  function puff(x, y, col, r, life) { const p = part(); if (!p) return; p.k = 1; p.x = x; p.y = y; p.s = r; p.c = col; p.t = 0; p.T = life; p.vx = 0; p.vy = -6; }
  let shake = 0, banner = null, leakFlash = 0, SHX = 0, SHY = 0;
  const FONTS = {};
  const fontOf = px => FONTS[px] || (FONTS[px] = '800 ' + px + 'px "M PLUS Rounded 1c", sans-serif');
  function event(e, G) {
    const ts = V.ts, x = scrX(e.x, e.y), y = scrY(e.x, e.y);
    switch (e.k) {
      case 10: burst(x, y, ['#d8bf98', '#a77a4c', '#ffffff'], 10, ts * 2.2, ts * 0.12, 0.45); ring(x, y, ts * 0.2, ts * 0.7, 'rgba(255,240,200,.9)', 0.35, 3); break;
      case 11: burst(x, y, ['#ffd24a', '#fff3c0', '#f2b33d'], 16, ts * 2.8, ts * 0.1, 0.6); ring(x, y, ts * 0.3, ts * 0.9, 'rgba(255,210,74,.95)', 0.45, 3); break;
      case 12: burst(x, y, ['#ffd36b', '#c8962e'], 10, ts * 2.4, ts * 0.12, 0.5); text(x, y - ts * 0.3, '+' + e.b, '#ffd36b', Math.max(12, ts * 0.42)); break;
      case 20: { const w = e.a, gr = G.groups(w), boss = gr.some(g2 => TD.ENEMIES[g2.k].boss), air = gr.some(g2 => TD.ENEMIES[g2.k].air);
        banner = { t: 0, T: 1.7, a: T('波 {n}', { n: w + 1 }), b: boss ? T('ボス') : air ? T('空から来る！') : '' }; break; }
      case 21: text(V.W / 2, V.H * 0.32, T('+{n} ボーナス', { n: e.a }), '#ffd36b', 16); break;
      case 22: if (e.b) text(scrX(G.I.goal.x, G.I.goal.y), scrY(G.I.goal.x, G.I.goal.y) - ts, '+' + e.b, '#ffe08a', 14); break;
      case 30: { const k = TD.ENEMY_KEYS[e.a], E = TD.ENEMIES[k], big = E.boss ? 3 : E.size > 0.4 ? 1.6 : 1;
        burst(x, y, DEBRIS[k] || ['#fff'], Math.round(9 * big), ts * 2.6 * big, ts * 0.11 * Math.min(2, big), 0.55);
        burst(x, y, ['#c8d0d8', '#e8c25a'], Math.round(3 * big), ts * 1.6, ts * 0.14, 0.7);
        puff(x, y, 'rgba(255,255,255,.5)', ts * 0.35 * big, 0.3);
        text(x, y - ts * 0.2, '+' + e.b, '#ffd36b', Math.max(10, ts * 0.34));
        if (E.boss) { shake = reduced() ? 0 : 0.5; ring(x, y, ts * 0.3, ts * 2.5, 'rgba(255,220,120,.9)', 0.7, 5); }
        break; }
      case 31: leakFlash = 0.5; shake = Math.max(shake, reduced() ? 0 : 0.18); burst(x, y, ['#ff7a6b', '#ffd36b'], 8, ts * 2, ts * 0.1, 0.5); break;
      case 32: burst(x, y - ts * 0.3, ['#5ab4f0', '#cfe8ff', '#ffffff'], 12, ts * 2.4, ts * 0.12, 0.5); break;
      case 33: puff(x, y, 'rgba(255,240,220,.6)', ts * 0.5, 0.35); break;
      case 34: ring(x, y, ts * 0.2, ts * 1.5, 'rgba(120,230,140,.8)', 0.6, 2); break;
      case 35: puff(x, y, 'rgba(200,170,255,.6)', ts * 0.6, 0.4); break;
      case 40: { const x2 = scrX(e.x2, e.y2), y2 = scrY(e.x2, e.y2); zap(x, y, x2, y2, e.a === 0 ? '#cfe8ff' : '#9ad8ff'); burst(x2, y2, ['#cfe8ff', '#ffffff'], 3, ts * 1.6, ts * 0.06, 0.25); break; }
      case 41: { const r = e.a / 100 * ts; ring(x, y, r * 0.2, r, 'rgba(255,190,120,.95)', 0.32, 4); burst(x, y, ['#d9634a', '#f2a24a', '#5a4030', '#fff0c0'], 12, ts * 2.6, ts * 0.11, 0.45); puff(x, y, 'rgba(255,220,180,.55)', r * 0.7, 0.3); break; }
      case 42: burst(x, y, e.a === 4 ? ['#e8c25a', '#ffffff'] : ['#ffffff', '#c8d0d8', '#ffe08a'], 4, ts * 2.2, ts * 0.07, 0.22); break;
      case 43: burst(x, y, ['#7fe8b0', '#5ab48a', '#e8fff0'], 6, ts * 1.6, ts * 0.1, 0.4); break;
    }
  }
  function busy() { return live > 0 || !!banner || leakFlash > 0 || shake > 0 || confN > 0; }

  // ------------------------------------------------------------------ one frame
  let lastFt = 0;
  function frame(g, G, view, t, o) {
    V = view;
    const dpr = view.dpr, ts = view.ts, tr = view.tr;
    const fdt = Math.min(0.05, Math.max(0, t - lastFt)); lastFt = t;
    g.setTransform(1, 0, 0, 1, 0, 0);
    let shx = 0, shy = 0;
    if (shake > 0) { shake -= fdt; shx = (Math.random() - 0.5) * 8 * shake * dpr; shy = (Math.random() - 0.5) * 8 * shake * dpr; }
    SHX = shx; SHY = shy;
    g.drawImage(stat, shx, shy);
    g.setTransform(dpr, 0, 0, dpr, shx, shy);
    const X = scrX, Y = scrY;
    // highlights
    if (o.tut >= 0 && G.I.slots[o.tut]) { const s = G.I.slots[o.tut], pulse = 0.5 + 0.5 * Math.sin(t * 6); g.lineWidth = 3; g.strokeStyle = 'rgba(255,214,90,' + (0.55 + pulse * 0.45) + ')'; g.beginPath(); g.arc(X(s.cx, s.cy), Y(s.cx, s.cy), ts * (0.48 + pulse * 0.12), 0, TAU); g.stroke(); }
    if (o.sel && o.sel.kind === 'slot') {
      const s = G.I.slots[o.sel.slot], cx = X(s.cx, s.cy), cy = Y(s.cx, s.cy);
      if (o.pickType) { const D = TD.TOWERS[o.pickType]; rangeCircle(g, cx, cy, D.lv[0].range * ts, D.color); }
      g.lineWidth = 2.5; g.strokeStyle = '#fff3c0'; g.beginPath(); g.arc(cx, cy, ts * 0.45, 0, TAU); g.stroke();
    }
    if (o.sel && o.sel.kind === 'tower' && G.tw.indexOf(o.sel.t) >= 0) {
      const tw2 = o.sel.t, D = TD.TOWERS[tw2.type];
      rangeCircle(g, X(tw2.x, tw2.y), Y(tw2.x, tw2.y), tw2.range * ts, D.color);
      if (tw2.type === 'toolbox') for (const q of G.tw) if (q !== tw2 && q.type !== 'toolbox' && (q.x - tw2.x) ** 2 + (q.y - tw2.y) ** 2 <= tw2.range * tw2.range) { g.strokeStyle = 'rgba(200,150,255,.8)'; g.lineWidth = 2; g.setLineDash([4, 4]); g.beginPath(); g.moveTo(X(tw2.x, tw2.y), Y(tw2.x, tw2.y)); g.lineTo(X(q.x, q.y), Y(q.x, q.y)); g.stroke(); g.setLineDash([]); }
    }
    // towers
    for (let i = 0; i < G.tw.length; i++) {
      const q = G.tw[i], sp = tw(q.type, q.lv, q.br), cx = X(q.x, q.y), cy = Y(q.x, q.y);
      g.drawImage(sp.base, cx - sp.base.cw / 2, cy - sp.base.ch / 2, sp.base.cw, sp.base.ch);
      if (sp.head) {
        let a = q.type === 'copter' ? t * (q.fire > 0 ? 18 : 7) + q.id : (tr ? Math.PI / 2 - q.aim : q.aim);
        const kick = q.fire > 0 && q.type !== 'copter' ? -q.fire * ts * 0.6 : 0;
        const c = Math.cos(a), s2 = Math.sin(a);
        g.setTransform(dpr * c, dpr * s2, -dpr * s2, dpr * c, (cx + c * kick) * dpr + shx, (cy + s2 * kick) * dpr + shy);
        g.drawImage(sp.head, -sp.head.cw / 2, -sp.head.ch / 2, sp.head.cw, sp.head.ch);
        g.setTransform(dpr, 0, 0, dpr, shx, shy);
      }
      if (q.type === 'coil' && q.fire > 0) { g.globalAlpha = q.fire * 6; circ(g, cx, cy, ts * 0.3, 'rgba(180,220,255,.6)'); g.globalAlpha = 1; }
      if (q.bd > 0) { g.fillStyle = '#c89aff'; g.beginPath(); g.arc(cx + ts * 0.32, cy - ts * 0.32, Math.max(2.5, ts * 0.08), 0, TAU); g.fill(); }
      // level pips
      g.fillStyle = q.lv >= 4 ? '#ffd24a' : '#fff3e0';
      const n = Math.min(3, q.lv), pw = Math.max(2, ts * 0.09);
      for (let k = 0; k < n; k++) g.fillRect(cx - (n * pw * 1.6) / 2 + k * pw * 1.6, cy + ts * 0.36, pw, pw);
      if (q.lv >= 4) { g.fillStyle = q.br === 'a' ? '#ff9a5a' : '#9ad8ff'; g.fillRect(cx - pw * 2.4, cy + ts * 0.36 + pw * 1.4, pw * 4.8, pw * 0.8); }
    }
    // toys on the ground
    drawEnemies(g, G, X, Y, t, false);
    // shots
    for (let i = 0; i < G.ns; i++) {
      const s = G.sh[i], cx = X(s.x, s.y), cy = Y(s.x, s.y);
      if (s.kind === 1) { const dx = tr ? s.vy : s.vx, dy = tr ? s.vx : s.vy; g.strokeStyle = '#eef2f6'; g.lineWidth = Math.max(1.5, ts * 0.06); g.beginPath(); g.moveTo(cx - dx * ts * 0.3, cy - dy * ts * 0.3); g.lineTo(cx, cy); g.stroke(); g.fillStyle = '#9aa3ad'; g.fillRect(cx - 1.5, cy - 1.5, 3, 3); }
      else if (s.kind === 2) { const f = Math.min(1, s.t / s.T), h = Math.sin(f * Math.PI) * ts * 0.9; g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(cx, cy, ts * 0.13, ts * 0.06, 0, 0, TAU); g.fill(); circ(g, cx, cy - h, ts * (0.12 + f * 0.02), '#d9634a', '#5a1a0e', 1.2); }
      else if (s.kind === 3) { circ(g, cx, cy, ts * 0.11, '#7fe8b0', '#2a7a5a', 1); }
    }
    // flyers above everything on the ground, then the copters
    drawEnemies(g, G, X, Y, t, true);
    for (let i = 0; i < G.ns; i++) {
      const s = G.sh[i]; if (s.kind !== 4) continue;
      const cx = X(s.x, s.y), cy = Y(s.x, s.y), a = t * 30 + i, r = ts * 0.2;
      g.strokeStyle = '#e8c25a'; g.lineWidth = Math.max(2, ts * 0.07); g.beginPath(); g.moveTo(cx - Math.cos(a) * r, cy - Math.sin(a) * r); g.lineTo(cx + Math.cos(a) * r, cy + Math.sin(a) * r); g.stroke();
      circ(g, cx, cy, ts * 0.05, '#8a5a2a');
    }
    // particles
    drawParticles(g, fdt);
    // banner & leak flash
    if (banner) {
      banner.t += fdt; const f = banner.t / banner.T; if (f >= 1) banner = null;
      else {
        const a = f < 0.15 ? f / 0.15 : f > 0.75 ? (1 - f) / 0.25 : 1, sc = f < 0.15 ? 0.7 + 0.3 * (f / 0.15) : 1;
        g.globalAlpha = a; g.textAlign = 'center'; g.textBaseline = 'middle';
        const fs = Math.round(Math.min(34, view.W * 0.09) * sc);
        g.font = fs + 'px "Dela Gothic One", sans-serif'; g.lineWidth = 5; g.strokeStyle = 'rgba(30,18,8,.85)'; g.fillStyle = '#ffe08a';
        g.strokeText(banner.a, view.W / 2, view.H * 0.4); g.fillText(banner.a, view.W / 2, view.H * 0.4);
        if (banner.b) { g.font = Math.round(fs * 0.55) + 'px "Dela Gothic One", sans-serif'; g.fillStyle = '#ff9a7a'; g.strokeText(banner.b, view.W / 2, view.H * 0.4 + fs * 0.85); g.fillText(banner.b, view.W / 2, view.H * 0.4 + fs * 0.85); }
        g.globalAlpha = 1;
      }
    }
    if (leakFlash > 0) {
      leakFlash -= fdt; const gx = X(G.I.goal.x, G.I.goal.y), gy = Y(G.I.goal.x, G.I.goal.y);
      const grd = g.createRadialGradient(gx, gy, 0, gx, gy, ts * 3); grd.addColorStop(0, 'rgba(255,70,50,' + (leakFlash * 0.9) + ')'); grd.addColorStop(1, 'rgba(255,70,50,0)');
      g.fillStyle = grd; g.fillRect(gx - ts * 3, gy - ts * 3, ts * 6, ts * 6);
    }
    if (confN > 0) drawConfetti(fdt);
  }
  function rangeCircle(g, x, y, r, col) {
    g.fillStyle = 'rgba(255,255,255,.12)'; g.beginPath(); g.arc(x, y, r, 0, TAU); g.fill();
    g.lineWidth = 2; g.strokeStyle = col; g.setLineDash([6, 5]); g.stroke(); g.setLineDash([]);
  }
  function drawEnemies(g, G, X, Y, t, air) {
    const ts = V.ts, tr = V.tr, dpr = V.dpr;
    for (let i = 0; i < G.ne; i++) {
      const e = G.en[i]; if (e.air !== air) continue;
      const fr = SPR[e.k]; if (!fr) continue;
      let cx = X(e.x, e.y), cy = Y(e.x, e.y);
      const r = e.E.size * ts;
      if (air) { g.drawImage(SHADOW, cx - SHADOW.cw / 2, cy + r * 0.9 - SHADOW.ch / 2, SHADOW.cw, SHADOW.ch); cy -= r * 0.8 + Math.sin(t * 3 + e.uid) * 2; }
      else if (e.stun <= 0) cy -= Math.abs(Math.sin(t * 9 + e.uid)) * Math.max(1, ts * 0.05);
      if (e.slowT > 0 && !air) { g.fillStyle = 'rgba(127,232,176,.35)'; g.beginPath(); g.ellipse(cx, cy + r * 0.7, r * 0.9, r * 0.35, 0, 0, TAU); g.fill(); }
      const spr = e.flash > 0 ? fr[2] : fr[((t * 5 + e.uid * 0.37) | 0) & 1];
      const dx = tr ? e.dy : e.dx;
      if (dx < -0.2) { g.setTransform(-dpr, 0, 0, dpr, cx * dpr + SHX, cy * dpr + SHY); g.drawImage(spr, -spr.cw / 2, -spr.ch / 2, spr.cw, spr.ch); g.setTransform(dpr, 0, 0, dpr, SHX, SHY); }
      else g.drawImage(spr, cx - spr.cw / 2, cy - spr.ch / 2, spr.cw, spr.ch);
      if (e.k === 'u' && e.shield > 0) { g.globalAlpha = 0.35 + 0.65 * e.shield / e.maxShield; g.drawImage(UMB, cx - UMB.cw / 2, cy - UMB.ch / 2 + r * 0.1, UMB.cw, UMB.ch); g.globalAlpha = 1; }
      else if (e.shield > 0) { g.strokeStyle = 'rgba(120,200,255,' + (0.3 + 0.6 * e.shield / e.maxShield) + ')'; g.lineWidth = 2.5; g.beginPath(); g.arc(cx, cy, r * 1.25, 0, TAU); g.stroke(); }
      if (e.stun > 0) { for (let k = 0; k < 3; k++) { const a = t * 6 + k * TAU / 3; circ(g, cx + Math.cos(a) * r * 0.7, cy - r * 1.1 + Math.sin(a) * r * 0.25, Math.max(1.5, r * 0.12), '#ffe04a'); } }
      if (e.hp < e.maxhp || (e.maxShield > 0 && e.shield < e.maxShield)) {
        const w = Math.max(16, r * 2), bx = cx - w / 2, by = cy - r * 1.35 - (e.k === 'u' ? r * 0.6 : 0);
        g.fillStyle = 'rgba(0,0,0,.55)'; g.fillRect(bx - 1, by - 1, w + 2, 5);
        const f = Math.max(0, e.hp / e.maxhp);
        g.fillStyle = f > 0.5 ? '#7fe06a' : f > 0.25 ? '#f2c84a' : '#ff6a5a'; g.fillRect(bx, by, w * f, 3);
        if (e.maxShield > 0 && e.shield > 0) { g.fillStyle = '#7fc8ff'; g.fillRect(bx, by - 3, w * e.shield / e.maxShield, 2); }
      }
      if (e.E.boss) { g.strokeStyle = 'rgba(255,214,90,.6)'; g.lineWidth = 2; g.beginPath(); g.arc(cx, cy, r * 1.4 + Math.sin(t * 4) * 2, 0, TAU); g.stroke(); }
    }
  }
  function drawParticles(g, dt) {
    if (!live) return;
    for (let i = 0; i < NP; i++) {
      const p = P[i]; if (!p.on) continue;
      p.t += dt; if (p.t >= p.T) { p.on = false; live--; continue; }
      const f = p.t / p.T;
      if (p.k === 0) { p.vy += 380 * dt * (V.ts / 30); p.vx *= 0.97; p.x += p.vx * dt; p.y += p.vy * dt; p.r += p.vr * dt; g.globalAlpha = 1 - f * f; g.fillStyle = p.c; const s = p.s; g.save(); g.translate(p.x, p.y); g.rotate(p.r); g.fillRect(-s / 2, -s / 2, s, s * 0.7); g.restore(); }
      else if (p.k === 1) { g.globalAlpha = (1 - f) * 0.8; g.fillStyle = p.c; g.beginPath(); g.arc(p.x, p.y + p.vy * p.t, p.s * (0.6 + f), 0, TAU); g.fill(); }
      else if (p.k === 2) { g.globalAlpha = 1 - f; g.strokeStyle = p.c; g.lineWidth = p.vr * (1 - f) + 0.5; g.beginPath(); g.arc(p.x, p.y, p.s + (p.vx - p.s) * (1 - (1 - f) * (1 - f)), 0, TAU); g.stroke(); }
      else if (p.k === 3) { g.globalAlpha = f < 0.7 ? 1 : (1 - f) / 0.3; g.font = fontOf(Math.round(p.s)); g.textAlign = 'center'; g.textBaseline = 'middle'; g.lineWidth = 3; g.strokeStyle = 'rgba(30,18,8,.8)'; const yy = p.y + p.vy * p.t; g.strokeText(p.txt, p.x, yy); g.fillStyle = p.c; g.fillText(p.txt, p.x, yy); }
      else if (p.k === 4) { const a = p.pts; g.globalAlpha = 1 - f; g.strokeStyle = p.c; g.lineWidth = 2.5; g.beginPath(); g.moveTo(a[0], a[1]); for (let k = 1; k < 6; k++) g.lineTo(a[k * 2], a[k * 2 + 1]); g.stroke(); g.strokeStyle = '#ffffff'; g.lineWidth = 1; g.stroke(); }
    }
    g.globalAlpha = 1;
  }

  // ------------------------------------------------------------------ confetti over the result card
  let fx = null, fctx = null, confN = 0;
  const CONF = [];
  for (let i = 0; i < 90; i++) CONF.push({ x: 0, y: 0, vx: 0, vy: 0, r: 0, vr: 0, c: '#fff', s: 6, t: 0 });
  function confetti() {
    if (reduced()) return;
    if (!fx) { fx = document.createElement('canvas'); fx.setAttribute('aria-hidden', 'true'); fx.style.cssText = 'position:fixed;inset:0;width:100%;height:100%;pointer-events:none;z-index:45'; document.body.appendChild(fx); fctx = fx.getContext('2d'); }
    const d = Math.min(2, root.devicePixelRatio || 1), W = innerWidth, H = innerHeight;
    fx.width = Math.round(W * d); fx.height = Math.round(H * d); fctx.setTransform(d, 0, 0, d, 0, 0);
    const cols = ['#f2b33d', '#ffd36b', '#94d98a', '#7fc8f8', '#e07a4a', '#c89aff'];
    CONF.forEach((p, i) => Object.assign(p, { x: W / 2 + (Math.random() - 0.5) * 80, y: H * 0.36, vx: (Math.random() - 0.5) * 9, vy: -4 - Math.random() * 8, r: Math.random() * 3, vr: (Math.random() - 0.5) * 0.4, c: cols[i % cols.length], s: 5 + Math.random() * 5, t: 0 }));
    confN = CONF.length;
    const step = () => { drawConfetti(1 / 60); if (confN > 0) requestAnimationFrame(step); };
    requestAnimationFrame(step);
  }
  let confLast = 0;
  function drawConfetti() {
    if (!fctx) { confN = 0; return; }
    const tnow = performance.now(); if (tnow - confLast < 12) return; confLast = tnow;
    fctx.clearRect(0, 0, innerWidth, innerHeight);
    confN = 0;
    for (const p of CONF) {
      if (p.t > 120) continue;
      p.t++; confN++;
      p.vy += 0.28; p.vx *= 0.99; p.x += p.vx; p.y += p.vy; p.r += p.vr;
      fctx.save(); fctx.globalAlpha = Math.min(1, (120 - p.t) / 30); fctx.translate(p.x, p.y); fctx.rotate(p.r); fctx.fillStyle = p.c; fctx.fillRect(-p.s / 2, -p.s / 4, p.s, p.s / 2); fctx.restore();
    }
    if (!confN) fctx.clearRect(0, 0, innerWidth, innerHeight);
  }

  root.TDArt = {
    init(o) { TD = o.TD; T = o.T; L = o.L; reduced = o.reduced; },
    resize, buildStatic, frame, event, busy, enemyIcon, towerIcon, mapThumb, confetti,
    get particles() { return live; },
  };
})(window);
