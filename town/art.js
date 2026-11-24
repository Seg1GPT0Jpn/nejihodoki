// ひまつぶしタウンの絵（すべて Canvas 2D で描く自作の絵。写真や他のゲームの絵は使わない）。
// 町は斜め上から見たマス目（2.5D）。1マスは幅 tw・高さ tw/2 のひし形で、(cx, cy) はその中心。u = tw/64 が絵の単位。
// どの関数も時間 t（秒）を受け取り、風車・煙・働く人・波は t だけで動く。夜（ダークテーマ）は窓の明かりを足す。
(function (root) {
  'use strict';

  const TAU = Math.PI * 2;
  const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
  const toHex = a => '#' + a.map(v => Math.max(0, Math.min(255, Math.round(v))).toString(16).padStart(2, '0')).join('');
  const shade = (h, k) => { const a = hex(h); return k >= 0 ? toHex(a.map(v => v + (255 - v) * k)) : toHex(a.map(v => v * (1 + k))); };
  const mix = (a, b, k) => { const x = hex(a), y = hex(b); return toHex(x.map((v, i) => v + (y[i] - v) * k)); };

  function poly(c, pts, fill, stroke, lw) {
    c.beginPath(); c.moveTo(pts[0][0], pts[0][1]);
    for (let i = 1; i < pts.length; i++) c.lineTo(pts[i][0], pts[i][1]);
    c.closePath();
    if (fill) { c.fillStyle = fill; c.fill(); }
    if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.lineJoin = 'round'; c.stroke(); }
  }
  // a floor diamond of half sizes fw, fh at height z above the tile centre
  const dia = (cx, cy, fw, fh, z) => [[cx, cy - z - fh], [cx + fw, cy - z], [cx, cy - z + fh], [cx - fw, cy - z]];
  // a box standing on the tile: footprint half sizes fw, fh, height h
  function box(c, cx, cy, fw, fh, h, col, o) {
    o = o || {};
    const ink = o.ink || 'rgba(60,40,20,.45)';
    poly(c, [[cx - fw, cy - h], [cx, cy - h + fh], [cx, cy + fh], [cx - fw, cy]], col.left, ink, 0.8);
    poly(c, [[cx, cy - h + fh], [cx + fw, cy - h], [cx + fw, cy], [cx, cy + fh]], col.right, ink, 0.8);
    poly(c, dia(cx, cy, fw, fh, h), col.top, ink, 0.8);
  }
  const wallCol = (base) => ({ top: shade(base, 0.25), left: base, right: shade(base, -0.14) });
  // a hip roof (a four-sided pyramid with a little overhang)
  function roof(c, cx, cy, fw, fh, z, rh, col, o) {
    o = o || {};
    const ox = fw * 1.12, oy = fh * 1.12, apex = [cx, cy - z - rh];
    const ink = o.ink || 'rgba(60,30,20,.5)';
    poly(c, [[cx - ox, cy - z], [cx, cy - z + oy], apex], col.left, ink, 0.8);
    poly(c, [[cx, cy - z + oy], [cx + ox, cy - z], apex], col.right, ink, 0.8);
  }
  const roofCol = base => ({ left: base, right: shade(base, -0.2) });
  const ROOFS = ['#d9644a', '#3f9aa8', '#9a5fb0', '#d9a43a', '#4f8f4f', '#c4506f', '#5f7fd0', '#e08a3c'];

  function ellipse(c, x, y, rx, ry, fill, rot) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); c.fillStyle = fill; c.fill(); }
  function rrect(c, x, y, w, h, r, fill, stroke) {
    c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, r); else c.rect(x, y, w, h);
    if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = 1; c.stroke(); }
  }

  // ---------------------------------------------------------------- ground
  // grass tile (owned land): a thick slab with soil sides
  function ground(c, cx, cy, tw, k, edge) {
    const fw = tw / 2, fh = tw / 4, d = tw * 0.1;
    if (edge) {
      poly(c, [[cx - fw, cy], [cx, cy + fh], [cx, cy + fh + d], [cx - fw, cy + d]], '#8a6038');
      poly(c, [[cx, cy + fh], [cx + fw, cy], [cx + fw, cy + d], [cx, cy + fh + d]], '#6e4a2a');
    }
    poly(c, dia(cx, cy, fw, fh, 0), k.grass, null);
  }
  function grassTexture(c, cx, cy, tw, h1, h2) {
    // a few blades and flowers (looks only)
    const u = tw / 64;
    if (h1 < 0.3) { c.strokeStyle = 'rgba(40,110,40,.45)'; c.lineWidth = Math.max(0.6, u * 0.9); c.beginPath(); c.moveTo(cx - 9 * u, cy + 2 * u); c.lineTo(cx - 10 * u, cy - 2 * u); c.moveTo(cx - 6 * u, cy + 3 * u); c.lineTo(cx - 5 * u, cy - 1 * u); c.stroke(); }
    if (h2 < 0.14) { const f = ['#ffe27a', '#ffb4c8', '#ffffff'][Math.floor(h1 * 10) % 3]; ellipse(c, cx + 8 * u, cy - 1 * u, 1.8 * u, 1.3 * u, f); ellipse(c, cx + 8 * u, cy - 1 * u, 0.7 * u, 0.5 * u, '#f0a020'); }
  }
  function water(c, cx, cy, tw, t, k, seed) {
    const fw = tw / 2, fh = tw / 4, u = tw / 64;
    poly(c, dia(cx, cy, fw, fh, 0), k.water, null);
    c.strokeStyle = k.waterLine; c.lineWidth = Math.max(0.7, u);
    for (let i = 0; i < 2; i++) {
      const ph = t * 0.7 + seed + i * 2.1, w = (0.5 + 0.5 * Math.sin(ph)) * 7 * u + 3 * u;
      c.beginPath(); c.ellipse(cx + (i ? 7 : -7) * u, cy + (i ? 2 : -2) * u, w, w * 0.5, 0, 0, TAU); c.globalAlpha = 0.5 * (1 - (w - 3 * u) / (7 * u)) + 0.15; c.stroke(); c.globalAlpha = 1;
    }
  }
  // outside land: bushes and little trees, drawn behind the island
  function tree(c, cx, cy, tw, seed, t, k) {
    const u = tw / 64, sway = Math.sin(t * 1.3 + seed * 6) * 1.2 * u, s = 0.8 + (seed % 0.5) * 0.5;
    ellipse(c, cx, cy + 2 * u, 9 * u * s, 4 * u * s, 'rgba(0,0,0,.18)');
    rrect(c, cx - 1.8 * u, cy - 9 * u * s, 3.6 * u, 11 * u * s, 1, '#7a5230');
    ellipse(c, cx + sway, cy - 17 * u * s, 10 * u * s, 9 * u * s, k.leaf2);
    ellipse(c, cx - 3 * u * s + sway, cy - 19 * u * s, 7 * u * s, 6 * u * s, k.leaf1);
    ellipse(c, cx + 4 * u * s + sway, cy - 15 * u * s, 6 * u * s, 5 * u * s, k.leaf1);
  }
  function rock(c, cx, cy, tw) { const u = tw / 64; ellipse(c, cx, cy + 1 * u, 8 * u, 4 * u, 'rgba(0,0,0,.18)'); poly(c, [[cx - 7 * u, cy], [cx - 4 * u, cy - 7 * u], [cx + 3 * u, cy - 8 * u], [cx + 8 * u, cy - 1 * u], [cx + 3 * u, cy + 2 * u]], '#a8a49a', 'rgba(60,50,40,.4)', 0.8); poly(c, [[cx - 4 * u, cy - 7 * u], [cx + 3 * u, cy - 8 * u], [cx + 1 * u, cy - 3 * u]], '#c8c4ba'); }

  // ---------------------------------------------------------------- little people
  function person(c, x, y, u, o) {
    // x,y = feet. o: { body, hat, skin, t, dir, tool: 'axe'|'hoe'|'book'|'none', ph }
    const t = o.t || 0, ph = o.ph || 0, bob = Math.abs(Math.sin(t * 6 + ph)) * 1.2 * u * (o.walk ? 1 : 0.25);
    const top = y - bob;
    ellipse(c, x, y + 0.5 * u, 3.4 * u, 1.3 * u, 'rgba(0,0,0,.22)');
    rrect(c, x - 2.2 * u, top - 7 * u, 4.4 * u, 6 * u, 1.6 * u, o.body || '#4a7bd0');
    ellipse(c, x, top - 9.2 * u, 2.5 * u, 2.5 * u, o.skin || '#f3c9a2');
    if (o.hat) { c.fillStyle = o.hat; c.beginPath(); c.ellipse(x, top - 10.4 * u, 3.2 * u, 1.4 * u, 0, 0, TAU); c.fill(); c.beginPath(); c.arc(x, top - 10.6 * u, 2.3 * u, Math.PI, 0); c.fill(); }
    const sw = Math.sin(t * (o.tool === 'axe' ? 7 : 5) + ph);
    if (o.tool === 'axe') { c.strokeStyle = '#7a5230'; c.lineWidth = 0.9 * u; const a = -0.9 + (sw > 0 ? sw : sw * 0.3) * 1.4; c.beginPath(); c.moveTo(x + 2 * u, top - 5 * u); c.lineTo(x + 2 * u + Math.cos(a) * 6 * u, top - 5 * u + Math.sin(a) * 6 * u); c.stroke(); ellipse(c, x + 2 * u + Math.cos(a) * 6.2 * u, top - 5 * u + Math.sin(a) * 6.2 * u, 1.6 * u, 1.1 * u, '#b8c0c8'); }
    else if (o.tool === 'hoe') { c.strokeStyle = '#7a5230'; c.lineWidth = 0.9 * u; const a = -1.0 + sw * 0.7; c.beginPath(); c.moveTo(x + 2 * u, top - 5 * u); c.lineTo(x + 2 * u + Math.cos(a) * 6 * u, top - 5 * u + Math.sin(a) * 6 * u); c.stroke(); }
    else if (o.tool === 'book') { rrect(c, x - 2 * u, top - 5.5 * u, 4 * u, 2.6 * u, 0.6 * u, '#f4efe0', 'rgba(60,40,20,.5)'); }
    else if (o.tool === 'box') { rrect(c, x - 2.6 * u, top - 6.5 * u + (sw > 0.5 ? 0.6 * u : 0), 5.2 * u, 3.4 * u, 0.6 * u, '#c89a58', 'rgba(60,40,20,.5)'); }
    else { c.strokeStyle = o.body || '#4a7bd0'; c.lineWidth = 1.2 * u; c.beginPath(); c.moveTo(x + 2 * u, top - 6 * u); c.lineTo(x + 3.2 * u, top - 3.8 * u + sw * 0.6 * u); c.stroke(); }
  }
  // a visitor drifting over the town (the thing you tap): kind 0 balloon, 1 striped balloon, 2 bird with a parcel, 3 kite. (x, y) is the middle; u = size unit
  function visitor(c, x, y, u, kind, t, left) {
    const sw = Math.sin(t * 2.2), fx = left ? -1 : 1;
    c.save(); c.translate(x, y);
    if (kind === 0 || kind === 1) {
      const col = kind ? ['#3fa08a', '#f6f0e0'] : ['#e0564a', '#ffd860'];
      c.rotate(sw * 0.05);
      ellipse(c, 0, 17 * u, 9 * u, 2 * u, 'rgba(0,0,0,0)');
      // envelope
      c.beginPath(); c.ellipse(0, -8 * u, 12 * u, 14 * u, 0, 0, TAU); c.fillStyle = col[0]; c.fill();
      c.save(); c.clip();
      c.fillStyle = col[1]; for (let i = -2; i <= 2; i += 2) c.fillRect(i * 3 * u - 1.5 * u, -24 * u, 3 * u, 32 * u);
      c.restore();
      c.beginPath(); c.ellipse(0, -8 * u, 12 * u, 14 * u, 0, 0, TAU); c.strokeStyle = 'rgba(60,30,20,.55)'; c.lineWidth = 1; c.stroke();
      ellipse(c, -4 * u, -14 * u, 3 * u, 5 * u, 'rgba(255,255,255,.28)', -0.5);
      c.strokeStyle = 'rgba(70,50,30,.8)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(-8 * u, 4 * u); c.lineTo(-4 * u, 12 * u); c.moveTo(8 * u, 4 * u); c.lineTo(4 * u, 12 * u); c.stroke();
      rrect(c, -5 * u, 11 * u, 10 * u, 7 * u, 1.5 * u, '#b8864e', 'rgba(60,40,20,.6)');
      ellipse(c, 0, 10.4 * u, 2.8 * u, 2.8 * u, '#f3c9a2');
      c.fillStyle = col[1]; c.beginPath(); c.arc(0, 9.6 * u, 3 * u, Math.PI, 0); c.fill();
      c.strokeStyle = '#f3c9a2'; c.lineWidth = 1.4 * u; c.lineCap = 'round'; c.beginPath(); c.moveTo(3 * u, 12 * u); c.lineTo(7 * u, 8 * u + sw * 1.4 * u); c.stroke();
    } else if (kind === 2) {
      const fl = Math.sin(t * 9);
      c.scale(fx, 1);
      ellipse(c, 0, 0, 9 * u, 5.6 * u, '#7a8ad0');
      ellipse(c, 6 * u, -3 * u, 4 * u, 3.6 * u, '#7a8ad0'); poly(c, [[9 * u, -3 * u], [13 * u, -2 * u], [9 * u, -0.8 * u]], '#f0b030'); ellipse(c, 7 * u, -4 * u, 0.9 * u, 0.9 * u, '#2a2a3a');
      poly(c, [[-8 * u, 0], [-15 * u, -2 * u], [-14 * u, 3 * u]], '#5a68b0');
      c.save(); c.translate(-1 * u, -2 * u); c.rotate(-0.5 - fl * 0.5); poly(c, [[0, 0], [-4 * u, -10 * u], [5 * u, -9 * u], [7 * u, -1 * u]], '#9aa8e8', 'rgba(40,40,90,.5)', 0.7); c.restore();
      c.strokeStyle = '#8a6a3a'; c.lineWidth = 0.9; c.beginPath(); c.moveTo(0, 5 * u); c.lineTo(0, 9 * u); c.stroke();
      rrect(c, -5 * u, 8 * u, 10 * u, 8 * u, 1.4 * u, '#f0d8a0', 'rgba(70,50,20,.6)'); c.strokeStyle = '#e0564a'; c.lineWidth = 1; c.beginPath(); c.moveTo(-5 * u, 12 * u); c.lineTo(5 * u, 12 * u); c.moveTo(0, 8 * u); c.lineTo(0, 16 * u); c.stroke();
    } else {
      c.rotate(sw * 0.12);
      poly(c, [[0, -15 * u], [10 * u, -3 * u], [0, 11 * u], [-10 * u, -3 * u]], '#f0a030', 'rgba(80,40,10,.55)', 0.9);
      poly(c, [[0, -15 * u], [10 * u, -3 * u], [0, -3 * u]], '#ffd860'); poly(c, [[0, -3 * u], [-10 * u, -3 * u], [0, 11 * u]], '#e0564a');
      c.strokeStyle = 'rgba(70,40,20,.7)'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(0, -15 * u); c.lineTo(0, 11 * u); c.moveTo(-10 * u, -3 * u); c.lineTo(10 * u, -3 * u); c.stroke();
      c.strokeStyle = '#8a5a3a'; c.lineWidth = 1; c.beginPath(); c.moveTo(0, 11 * u); for (let i = 1; i <= 5; i++) c.lineTo(Math.sin(t * 4 - i) * 3 * u, 11 * u + i * 4 * u); c.stroke();
      for (let i = 1; i <= 4; i++) poly(c, [[Math.sin(t * 4 - i) * 3 * u - 2.4 * u, 11 * u + i * 4.6 * u], [Math.sin(t * 4 - i) * 3 * u + 2.4 * u, 11 * u + i * 4.6 * u - 1 * u], [Math.sin(t * 4 - i) * 3 * u, 11 * u + i * 4.6 * u + 2 * u]], i % 2 ? '#3fa08a' : '#e08aa8');
    }
    c.restore();
  }

  // ---------------------------------------------------------------- buildings
  // o: { lv, t (s), night, glows: [], seed, water: [dx,dy] (harbor) }
  const DRAW = {};
  DRAW.plaza = function (c, cx, cy, tw, o, k) {
    const u = tw / 64, t = o.t;
    poly(c, dia(cx, cy, tw * 0.46, tw * 0.23, 0), '#d8cfb8', 'rgba(80,60,40,.35)', 0.8);
    poly(c, dia(cx, cy, tw * 0.34, tw * 0.17, 0), '#e9e1cc', 'rgba(80,60,40,.25)', 0.8);
    // fountain
    ellipse(c, cx, cy - 1 * u, 13 * u, 6.5 * u, '#9ec9d9'); ellipse(c, cx, cy - 2 * u, 10 * u, 5 * u, '#c4e4f0');
    rrect(c, cx - 2 * u, cy - 14 * u, 4 * u, 12 * u, 1.5 * u, '#cfc6b0');
    ellipse(c, cx, cy - 15 * u, 6 * u, 2.6 * u, '#cfc6b0'); ellipse(c, cx, cy - 15.6 * u, 4.6 * u, 1.8 * u, '#b8e0ee');
    c.strokeStyle = 'rgba(255,255,255,.85)'; c.lineWidth = Math.max(0.8, 1.2 * u); c.lineCap = 'round';
    for (let i = 0; i < 5; i++) { const a = (i / 5) * TAU + t * 0.4, ph = (t * 1.6 + i * 0.37) % 1; const r = 7 * u * Math.sin(ph * Math.PI); c.globalAlpha = 1 - ph * 0.5; c.beginPath(); c.moveTo(cx, cy - 16 * u); c.quadraticCurveTo(cx + Math.cos(a) * r * 0.7, cy - (24 - 8 * ph) * u, cx + Math.cos(a) * r * 1.3, cy - (14 - 6 * ph) * u + Math.sin(a) * r * 0.2); c.stroke(); }
    c.globalAlpha = 1;
    // lamp posts and little flags
    for (const s of [-1, 1]) { rrect(c, cx + s * 22 * u - 0.7 * u, cy - 14 * u, 1.4 * u, 14 * u, 0.6, '#5a4a3a'); ellipse(c, cx + s * 22 * u, cy - 15 * u, 2.4 * u, 2.4 * u, o.night ? '#ffe49a' : '#f4e2a8'); if (o.night) o.glows.push([cx + s * 22 * u, cy - 15 * u, 12 * u, '255,220,140']); }
    person(c, cx - 14 * u, cy + 8 * u, u, { body: '#d9a43a', hat: '#8a5a30', t, ph: 1, walk: false });
  };
  DRAW.house = function (c, cx, cy, tw, o, k) {
    const u = tw / 64, lv = o.lv, fw = tw * 0.27, fh = tw * 0.135;
    const h = (17 + Math.min(lv, 8) * 1.8) * u, base = ['#f6e4c1', '#f2dcc0', '#efe0d0', '#f0e8c8'][(o.seed * 4 | 0) % 4];
    ellipse(c, cx, cy + fh * 0.2, fw * 1.55, fh * 1.5, 'rgba(0,0,0,.16)');
    box(c, cx, cy, fw, fh, h, wallCol(base));
    const rc = roofCol(ROOFS[(lv - 1) % ROOFS.length]);
    roof(c, cx, cy, fw, fh, h, (13 + Math.min(lv, 8) * 0.8) * u, rc);
    // door and windows
    rrect(c, cx + fw * 0.2, cy + fh * 0.55 - 8 * u, 4 * u, 8 * u, 1.4 * u, '#7a4f2e');
    const win = o.night ? '#ffe49a' : '#9ed0e8';
    poly(c, [[cx - fw * 0.75, cy - h * 0.75 + fh * 0.2], [cx - fw * 0.25, cy - h * 0.75 + fh * 0.7], [cx - fw * 0.25, cy - h * 0.3 + fh * 0.7], [cx - fw * 0.75, cy - h * 0.3 + fh * 0.2]], win, 'rgba(80,50,30,.6)', 0.8);
    if (o.night) o.glows.push([cx - fw * 0.5, cy - h * 0.5 + fh * 0.45, 9 * u, '255,210,120']);
    // chimney and smoke (bigger houses)
    if (lv >= 2) { rrect(c, cx + fw * 0.35, cy - h - 12 * u, 3.4 * u, 8 * u, 0.6, '#9a7a62'); for (let i = 0; i < 3; i++) { const ph = (o.t * 0.5 + i / 3) % 1; ellipse(c, cx + fw * 0.35 + 1.7 * u + Math.sin(ph * 5 + i) * 2 * u, cy - h - 13 * u - ph * 14 * u, (1.6 + ph * 2.2) * u, (1.4 + ph * 1.8) * u, `rgba(240,240,240,${0.55 * (1 - ph)})`); } }
    if (lv >= 4) { rrect(c, cx - fw * 0.1 - 0.5 * u, cy - h - 20 * u, 1 * u, 8 * u, 0.4, '#8a6a4a'); poly(c, [[cx - fw * 0.1 + 0.5 * u, cy - h - 20 * u], [cx - fw * 0.1 + 6 * u, cy - h - 18 * u + Math.sin(o.t * 4) * 0.8 * u], [cx - fw * 0.1 + 0.5 * u, cy - h - 16 * u]], '#e04a4a'); }
  };
  DRAW.farm = function (c, cx, cy, tw, o, k) {
    const u = tw / 64, t = o.t, lv = o.lv;
    poly(c, dia(cx, cy, tw * 0.44, tw * 0.22, 0), '#a8774a', 'rgba(70,40,20,.45)', 0.8);
    poly(c, dia(cx, cy, tw * 0.4, tw * 0.2, 0), '#8e6038');
    // crop rows (they sway and get taller with the level)
    const rows = 4;
    for (let r = 0; r < rows; r++) {
      const f = (r + 0.5) / rows, x0 = cx - tw * 0.3 * (1 - f * 0.0), len = 5;
      for (let i = 0; i < len; i++) {
        const g = (i + 0.5) / len, px = cx + (g - 0.5) * tw * 0.52 + (f - 0.5) * tw * 0.0 - (f - 0.5) * tw * 0.26 * 1.0, py = cy + (f - 0.5) * tw * 0.26 + (g - 0.5) * tw * 0.0 + (g - 0.5) * tw * 0.26 * 0;
        const sx = cx + (g - f) * tw * 0.27, sy = cy + (g + f - 1) * tw * 0.135;
        void x0; void px; void py;
        const sway = Math.sin(t * 1.8 + r + i * 0.7) * 1.1 * u, hh = (6 + lv * 0.9) * u;
        c.strokeStyle = '#4f9a3a'; c.lineWidth = Math.max(0.8, 1.3 * u); c.lineCap = 'round';
        c.beginPath(); c.moveTo(sx, sy); c.quadraticCurveTo(sx + sway * 0.5, sy - hh * 0.6, sx + sway, sy - hh); c.stroke();
        ellipse(c, sx + sway, sy - hh, 1.6 * u, 1.1 * u, (r + i) % 3 === 0 ? '#f0c040' : '#7fc060');
      }
    }
    // a small barn and a scarecrow
    const bx = cx - tw * 0.2, by = cy - tw * 0.12;
    box(c, bx, by, tw * 0.12, tw * 0.06, 10 * u, wallCol('#c8503c'));
    roof(c, bx, by, tw * 0.12, tw * 0.06, 10 * u, 7 * u, roofCol('#8a4a3a'));
    person(c, cx + tw * 0.12, cy + tw * 0.04, u, { body: '#6aa84a', hat: '#e0c060', t, ph: o.seed * 9, tool: 'hoe', walk: false });
  };
  DRAW.lumber = function (c, cx, cy, tw, o, k) {
    const u = tw / 64, t = o.t, lv = o.lv;
    ellipse(c, cx, cy, tw * 0.4, tw * 0.19, 'rgba(0,0,0,.14)');
    const fw = tw * 0.2, fh = tw * 0.1, h = (12 + lv * 1.2) * u;
    box(c, cx - tw * 0.1, cy - tw * 0.04, fw, fh, h, wallCol('#b07a48'));
    roof(c, cx - tw * 0.1, cy - tw * 0.04, fw, fh, h, 9 * u, roofCol('#5f8a4a'));
    rrect(c, cx - tw * 0.1 + fw * 0.2, cy - tw * 0.04 + fh * 0.5 - 7 * u, 3.6 * u, 7 * u, 1, '#5a3a22');
    // log pile
    for (let i = 0; i < 3; i++) for (let j = 0; j <= i; j++) { const lx = cx + tw * 0.2 + (j - i / 2) * 5 * u, ly = cy + tw * 0.06 - i * 4 * u; ellipse(c, lx, ly, 3.2 * u, 2.2 * u, '#a06a3a'); ellipse(c, lx + 1.6 * u, ly, 1.1 * u, 1.8 * u, '#e8c898'); }
    // stump and chips
    ellipse(c, cx + tw * 0.02, cy + tw * 0.1, 5 * u, 2.6 * u, '#7a5230'); ellipse(c, cx + tw * 0.02, cy + tw * 0.1 - 1.4 * u, 4.4 * u, 2.1 * u, '#d8b078');
    person(c, cx - tw * 0.02, cy + tw * 0.14, u, { body: '#c04a3a', hat: '#e0b040', t, ph: o.seed * 7, tool: 'axe', walk: false });
    if (Math.sin(t * 7 + o.seed * 7) > 0.97) { for (let i = 0; i < 3; i++) ellipse(c, cx + tw * 0.04 + i * 2 * u, cy + tw * 0.08 - i * 2 * u, 0.9 * u, 0.6 * u, '#e8c898'); }
  };
  DRAW.park = function (c, cx, cy, tw, o, k) {
    const u = tw / 64, t = o.t;
    poly(c, dia(cx, cy, tw * 0.46, tw * 0.23, 0), '#7fc468', 'rgba(40,100,40,.35)', 0.8);
    poly(c, [[cx - tw * 0.4, cy], [cx, cy - tw * 0.04], [cx + tw * 0.4, cy], [cx, cy + tw * 0.04]], '#e8d8b0');
    poly(c, [[cx - tw * 0.04, cy - tw * 0.2], [cx + tw * 0.04, cy - tw * 0.2], [cx + tw * 0.04, cy + tw * 0.2], [cx - tw * 0.04, cy + tw * 0.2]].map(p => [p[0], p[1] * 0.5 + cy * 0.5]), '#e8d8b0');
    ellipse(c, cx + tw * 0.2, cy + tw * 0.07, 6 * u, 3 * u, '#9ed8ee'); ellipse(c, cx + tw * 0.2, cy + tw * 0.065, 4.4 * u, 2 * u, '#c4ecf8');
    tree(c, cx - tw * 0.22, cy - tw * 0.06, tw, 0.3, t, k); tree(c, cx + tw * 0.02, cy - tw * 0.14, tw, 0.7, t, k);
    for (let i = 0; i < 5; i++) { const fx = cx - tw * 0.3 + i * 4.5 * u, fy = cy + tw * 0.1 + (i % 2) * 2 * u; ellipse(c, fx, fy, 1.7 * u, 1.2 * u, ['#ff8aa8', '#ffe27a', '#ffffff', '#c8a0ff', '#ff8a5a'][i]); }
    rrect(c, cx - tw * 0.04, cy + tw * 0.1, 9 * u, 2.2 * u, 0.6, '#9a6a3a'); rrect(c, cx - tw * 0.04, cy + tw * 0.1 - 3 * u, 9 * u, 1.6 * u, 0.6, '#b07a48');
    if (o.lv >= 2) { const bx = cx + tw * 0.12 + Math.sin(t * 0.8) * 4 * u, by = cy - tw * 0.12; ellipse(c, bx, by - 12 * u, 2.6 * u, 3.4 * u, '#ff7a8a'); c.strokeStyle = 'rgba(80,60,40,.6)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(bx, by - 8.6 * u); c.lineTo(bx - 1 * u, by - 3 * u); c.stroke(); }
    person(c, cx - tw * 0.06, cy + tw * 0.2, u, { body: '#e08aa8', hat: null, t, ph: 2, walk: true });
  };
  DRAW.mill = function (c, cx, cy, tw, o, k) {
    const u = tw / 64, t = o.t, lv = o.lv;
    ellipse(c, cx, cy + 1 * u, tw * 0.3, tw * 0.15, 'rgba(0,0,0,.16)');
    const bw = tw * 0.2, h = (28 + lv * 1.6) * u, tw2 = tw * 0.12;
    // a tapering tower (two faces)
    poly(c, [[cx - bw, cy - 1 * u], [cx, cy + bw * 0.5 - 1 * u], [cx, cy + tw2 * 0.5 - h], [cx - tw2, cy - h]], '#f0e6d2', 'rgba(70,50,30,.45)', 0.8);
    poly(c, [[cx, cy + bw * 0.5 - 1 * u], [cx + bw, cy - 1 * u], [cx + tw2, cy - h], [cx, cy + tw2 * 0.5 - h]], '#d8ccb4', 'rgba(70,50,30,.45)', 0.8);
    poly(c, [[cx - tw2 * 1.15, cy - h], [cx, cy - h - tw2 * 0.6], [cx + tw2 * 1.15, cy - h], [cx, cy - h + tw2 * 0.6]], '#a85a3a', 'rgba(60,30,20,.5)', 0.8);
    poly(c, [[cx - tw2 * 1.1, cy - h], [cx, cy - h + tw2 * 0.6], [cx, cy - h - 11 * u], []].slice(0, 3), '#c4684a');
    poly(c, [[cx, cy - h + tw2 * 0.6], [cx + tw2 * 1.1, cy - h], [cx, cy - h - 11 * u]], '#a85a3a');
    rrect(c, cx + bw * 0.2, cy - 9 * u + bw * 0.2, 4 * u, 8 * u, 1.4 * u, '#7a4f2e');
    // sails
    const hx = cx + 1 * u, hy = cy - h * 0.82, a0 = t * 0.9 + o.seed * 6, L = tw * 0.36;
    c.save(); c.translate(hx, hy); c.scale(1, 0.92);
    for (let i = 0; i < 4; i++) {
      c.save(); c.rotate(a0 + i * Math.PI / 2);
      c.strokeStyle = '#6a4a2e'; c.lineWidth = Math.max(1, 1.5 * u); c.beginPath(); c.moveTo(0, 0); c.lineTo(L, 0); c.stroke();
      poly(c, [[L * 0.2, 0.6 * u], [L * 0.96, 0.6 * u], [L * 0.96, 7 * u], [L * 0.2, 6 * u]], '#f8f2e4', 'rgba(70,50,30,.5)', 0.6);
      c.restore();
    }
    c.restore();
    ellipse(c, hx, hy, 2.4 * u, 2.4 * u, '#8a5a3a');
    // grain sacks
    ellipse(c, cx - bw * 1.05, cy + 4 * u, 3.4 * u, 2.4 * u, '#e8d49a'); ellipse(c, cx - bw * 0.8, cy + 7 * u, 3.4 * u, 2.4 * u, '#e0c888');
    person(c, cx + bw * 1.1, cy + 6 * u, u, { body: '#d9a43a', hat: '#c8c0b0', t, ph: 3, tool: 'box', walk: false });
  };
  DRAW.workshop = function (c, cx, cy, tw, o, k) {
    const u = tw / 64, t = o.t, lv = o.lv;
    ellipse(c, cx, cy, tw * 0.4, tw * 0.19, 'rgba(0,0,0,.15)');
    const fw = tw * 0.3, fh = tw * 0.15, h = (16 + lv * 1.4) * u;
    box(c, cx, cy, fw, fh, h, wallCol('#c89a68'));
    // saw-tooth roof
    for (let i = 0; i < 3; i++) { const x0 = cx - fw + (i / 3) * fw * 2, x1 = cx - fw + ((i + 1) / 3) * fw * 2; const y0 = cy - h - (x0 - cx) * 0 + (1 - Math.abs((x0 + x1) / 2 - cx) / fw) * fh * 0; void x0; void x1; }
    poly(c, dia(cx, cy, fw * 1.06, fh * 1.06, h), '#8d98a8', 'rgba(40,50,70,.5)', 0.8);
    for (let i = -1; i <= 1; i++) poly(c, [[cx + i * fw * 0.5 - fw * 0.22, cy - h - fh * 0.1 + i * fh * 0.5 * 0], [cx + i * fw * 0.5 + fw * 0.22, cy - h - fh * 0.5], [cx + i * fw * 0.5 + fw * 0.22, cy - h - fh * 0.5 - 6 * u], [cx + i * fw * 0.5 - fw * 0.22, cy - h - fh * 0.1 - 6 * u]].map((p, j) => [p[0], p[1] + (i * fh * 0.5)]), i % 2 ? '#a8b2c0' : '#7e8898', 'rgba(40,50,70,.4)', 0.6);
    // chimney and smoke
    rrect(c, cx + fw * 0.45, cy - h - 16 * u, 4 * u, 12 * u, 0.6, '#7a6a62');
    for (let i = 0; i < 4; i++) { const ph = (t * 0.6 + i / 4) % 1; ellipse(c, cx + fw * 0.45 + 2 * u + Math.sin(ph * 4 + i) * 3 * u, cy - h - 17 * u - ph * 20 * u, (1.8 + ph * 3) * u, (1.5 + ph * 2.4) * u, `rgba(230,230,230,${0.6 * (1 - ph)})`); }
    rrect(c, cx + fw * 0.05, cy + fh * 0.55 - 8 * u, 6 * u, 8 * u, 1.4 * u, '#5a3a22');
    // anvil and hammer sparks
    poly(c, [[cx - fw * 0.65, cy + fh * 0.9], [cx - fw * 0.3, cy + fh * 0.9], [cx - fw * 0.34, cy + fh * 0.9 - 4 * u], [cx - fw * 0.7, cy + fh * 0.9 - 4 * u]], '#5a6068');
    const hit = (t * 2.2 + o.seed * 5) % 1;
    if (hit < 0.35) for (let i = 0; i < 4; i++) { const a = -1.2 + i * 0.5, r = hit * 22 * u; ellipse(c, cx - fw * 0.5 + Math.cos(a) * r, cy + fh * 0.9 - 5 * u + Math.sin(a) * r, 0.9 * u, 0.9 * u, '#ffd860'); }
    person(c, cx - fw * 0.5, cy + fh * 1.15, u, { body: '#4a7bd0', hat: '#6a5a4a', t, ph: o.seed * 11, tool: 'axe', walk: false });
  };
  DRAW.market = function (c, cx, cy, tw, o, k) {
    const u = tw / 64, t = o.t, lv = o.lv;
    poly(c, dia(cx, cy, tw * 0.46, tw * 0.23, 0), '#e8d6ac', 'rgba(80,60,40,.35)', 0.8);
    // two stalls with striped awnings
    for (let s = 0; s < 2; s++) {
      const sx = cx + (s ? tw * 0.16 : -tw * 0.16), sy = cy + (s ? tw * 0.05 : -tw * 0.05), fw = tw * 0.15, fh = tw * 0.075, h = (14 + lv * 0.8) * u;
      box(c, sx, sy, fw, fh, h * 0.5, wallCol('#c89a68'));
      for (const [px, py] of [[sx - fw, sy], [sx + fw, sy], [sx, sy + fh]]) rrect(c, px - 0.7 * u, py - h, 1.4 * u, h, 0.5, '#7a5230');
      const cols = s ? ['#3f9aa8', '#f6f0e0'] : ['#d9544a', '#f6f0e0'];
      const ax = fw * 1.2, ay = fh * 1.2;
      for (let i = 0; i < 6; i++) { const f0 = i / 6, f1 = (i + 1) / 6; poly(c, [[sx - ax + 2 * ax * f0, sy - h - ay * 0.0 + Math.abs(f0 - 0.5) * ay * 0 + ay * (f0)], [sx - ax + 2 * ax * f1, sy - h + ay * f1], [sx - ax + 2 * ax * f1, sy - h + ay * f1 + 4 * u], [sx - ax + 2 * ax * f0, sy - h + ay * f0 + 4 * u]].map(p => [p[0], p[1] - ay * 0.6]), i % 2 ? cols[1] : cols[0], 'rgba(60,30,20,.3)', 0.5); }
      // goods
      for (let i = 0; i < 3; i++) ellipse(c, sx - fw * 0.5 + i * 4.2 * u, sy + fh * 0.1 - h * 0.5 - 1.6 * u, 1.9 * u, 1.9 * u, ['#e04a4a', '#f0c040', '#7fc060'][(i + s) % 3]);
    }
    person(c, cx + tw * 0.02, cy + tw * 0.15, u, { body: '#e0884a', hat: '#f4e4b8', t, ph: o.seed * 4, walk: false, tool: 'box' });
    person(c, cx - tw * 0.22, cy + tw * 0.14, u, { body: '#7a4fb0', hat: null, t, ph: o.seed * 4 + 2, walk: true });
  };
  DRAW.harbor = function (c, cx, cy, tw, o, k) {
    const u = tw / 64, t = o.t, lv = o.lv, wd = o.water || [0, 1];
    poly(c, dia(cx, cy, tw * 0.46, tw * 0.23, 0), '#b8884e', 'rgba(70,40,20,.5)', 0.8);
    c.strokeStyle = 'rgba(70,40,20,.35)'; c.lineWidth = Math.max(0.6, u * 0.8); for (let i = -3; i <= 3; i++) { c.beginPath(); c.moveTo(cx + i * 5 * u - 12 * u, cy + i * 2.5 * u * 0 + 4 * u - 10 * u + i * 0); c.lineTo(cx + i * 5 * u + 8 * u, cy - 3 * u + 10 * u * 0 + 4 * u); c.stroke(); }
    // the boat sits on the water side
    const bx = cx + (wd[0] - wd[1]) * tw * 0.26, by = cy + (wd[0] + wd[1]) * tw * 0.13 + Math.sin(t * 1.4 + o.seed * 5) * 1.6 * u;
    ellipse(c, bx, by + 2 * u, 15 * u, 5.5 * u, 'rgba(0,0,0,.2)');
    poly(c, [[bx - 14 * u, by - 4 * u], [bx + 14 * u, by - 4 * u], [bx + 9 * u, by + 3 * u], [bx - 9 * u, by + 3 * u]], '#a8522f', 'rgba(60,30,20,.55)', 0.8);
    poly(c, [[bx - 14 * u, by - 4 * u], [bx + 14 * u, by - 4 * u], [bx + 13 * u, by - 2.4 * u], [bx - 13 * u, by - 2.4 * u]], '#f0e0c0');
    rrect(c, bx - 0.7 * u, by - 26 * u, 1.4 * u, 22 * u, 0.5, '#6a4a2e');
    poly(c, [[bx + 1 * u, by - 25 * u], [bx + 12 * u + Math.sin(t * 2) * 1.2 * u, by - 12 * u], [bx + 1 * u, by - 8 * u]], '#f8f4e8', 'rgba(60,40,30,.4)', 0.6);
    poly(c, [[bx - 1 * u, by - 22 * u], [bx - 9 * u, by - 10 * u], [bx - 1 * u, by - 8 * u]], '#e8dcc0', 'rgba(60,40,30,.4)', 0.6);
    for (const [px, py] of [[cx - tw * 0.3, cy + tw * 0.02], [cx + tw * 0.3, cy + tw * 0.02]]) rrect(c, px - 1.4 * u, py - 8 * u, 2.8 * u, 9 * u, 1, '#6a4a2e');
    // crates and a little hut
    box(c, cx - tw * 0.1, cy - tw * 0.1, tw * 0.07, tw * 0.035, 7 * u, wallCol('#c89a58'));
    box(c, cx - tw * 0.1 + 6 * u, cy - tw * 0.1 + 4 * u, tw * 0.05, tw * 0.025, 5 * u, wallCol('#b88848'));
    person(c, cx + (1 - wd[0] * 0) * tw * 0.04, cy + tw * 0.02 + 3 * u, u, { body: '#3f7ac8', hat: '#f4f0e0', t, ph: 5, walk: false, tool: 'box' });
    if (lv >= 3) { rrect(c, cx - tw * 0.3 - 0.6 * u, cy - 17 * u, 1.2 * u, 14 * u, 0.4, '#6a4a2e'); ellipse(c, cx - tw * 0.3, cy - 19 * u, 2.6 * u, 2.6 * u, o.night ? '#ffe49a' : '#f4e2a8'); if (o.night) o.glows.push([cx - tw * 0.3, cy - 19 * u, 12 * u, '255,220,140']); }
  };
  DRAW.library = function (c, cx, cy, tw, o, k) {
    const u = tw / 64, t = o.t, lv = o.lv;
    ellipse(c, cx, cy, tw * 0.36, tw * 0.17, 'rgba(0,0,0,.16)');
    const fw = tw * 0.3, fh = tw * 0.15, h = (24 + lv * 1.6) * u;
    box(c, cx, cy, fw, fh, h, wallCol('#e4e8f2'));
    // pillars on the front faces
    for (let i = 0; i < 3; i++) { const f = (i + 0.5) / 3; rrect(c, cx + fw * f - 1.2 * u, cy - h * 0.9 + fh * (1 - f) + fh * 0.1, 2.4 * u, h * 0.85 - fh * 0.1, 1, '#f6f8ff'); }
    // arched glowing windows on the left face
    for (let i = 0; i < 2; i++) { const f = (i + 0.6) / 2.2, wx = cx - fw * f, wy = cy - h * 0.55 + fh * (1 - f) * 0.0 + (fh * (1 - f)); ellipse(c, wx, wy - 3 * u, 3 * u, 4.4 * u, o.night ? '#ffe49a' : '#8fc4e0'); if (o.night) o.glows.push([wx, wy - 3 * u, 11 * u, '255,220,140']); }
    // copper dome
    ellipse(c, cx, cy - h - 1 * u, fw * 0.66, fh * 0.66, '#5fa89a');
    c.beginPath(); c.ellipse(cx, cy - h - 1 * u, fw * 0.62, fw * 0.5, 0, Math.PI, 0); c.fillStyle = '#7fc8b4'; c.fill(); c.strokeStyle = 'rgba(30,70,60,.5)'; c.lineWidth = 0.8; c.stroke();
    rrect(c, cx - 0.7 * u, cy - h - fw * 0.5 - 8 * u, 1.4 * u, 8 * u, 0.5, '#6a5a3a');
    poly(c, [[cx + 0.7 * u, cy - h - fw * 0.5 - 8 * u], [cx + 7 * u, cy - h - fw * 0.5 - 6 * u + Math.sin(t * 3) * 0.8 * u], [cx + 0.7 * u, cy - h - fw * 0.5 - 4 * u]], '#e0a43a');
    rrect(c, cx + fw * 0.25, cy + fh * 0.5 - 8 * u, 5 * u, 8 * u, 1.6 * u, '#7a4f2e');
    // sparks drift up from the books
    for (let i = 0; i < 3; i++) { const ph = (t * 0.45 + i / 3 + o.seed) % 1; ellipse(c, cx + Math.sin(ph * 6 + i * 2) * fw * 0.5, cy - h - 12 * u - ph * 22 * u, 1.3 * u, 1.3 * u, `rgba(120,230,255,${1 - ph})`); }
    person(c, cx - fw * 0.1, cy + fh * 1.2, u, { body: '#7a4fb0', hat: null, t, ph: 7, walk: false, tool: 'book' });
  };
  DRAW.tower = function (c, cx, cy, tw, o, k) {
    const u = tw / 64, t = o.t, lv = o.lv;
    ellipse(c, cx, cy, tw * 0.3, tw * 0.15, 'rgba(0,0,0,.18)');
    const fw = tw * 0.17, fh = tw * 0.085, h = (46 + lv * 2) * u;
    box(c, cx, cy, fw, fh, h, wallCol('#b8bcc8'));
    // stone lines and slit windows
    c.strokeStyle = 'rgba(60,70,90,.3)'; c.lineWidth = 0.6; for (let i = 1; i < 6; i++) { const z = h * i / 6; c.beginPath(); c.moveTo(cx - fw, cy - z); c.lineTo(cx, cy - z + fh); c.lineTo(cx + fw, cy - z); c.stroke(); }
    rrect(c, cx - fw * 0.55, cy - h * 0.6 + fh * 0.4, 2 * u, 7 * u, 1, o.night ? '#ffe49a' : '#506078'); rrect(c, cx + fw * 0.3, cy - h * 0.45 + fh * 0.7, 2 * u, 7 * u, 1, o.night ? '#ffe49a' : '#506078');
    // balcony and crenellations
    poly(c, dia(cx, cy, fw * 1.35, fh * 1.35, h), '#8a90a0', 'rgba(40,50,70,.5)', 0.8);
    for (let i = 0; i < 4; i++) { const a = i / 4 * TAU + Math.PI / 4; rrect(c, cx + Math.cos(a) * fw * 1.15 - 1.6 * u, cy - h + Math.sin(a) * fh * 1.15 - 4.4 * u, 3.2 * u, 4.4 * u, 0.5, '#a8aebe'); }
    // the light
    const fl = 0.7 + 0.3 * Math.sin(t * 5);
    ellipse(c, cx, cy - h - 5 * u, 3.4 * u, 3.4 * u, `rgba(255,220,120,${fl})`);
    o.glows.push([cx, cy - h - 5 * u, 22 * u * fl, '255,225,140', true]);
    roof(c, cx, cy, fw * 0.8, fh * 0.8, h + 4 * u, 12 * u, roofCol('#c4506f'));
    rrect(c, cx - 0.6 * u, cy - h - 34 * u, 1.2 * u, 12 * u, 0.4, '#6a5a4a');
    poly(c, [[cx + 0.6 * u, cy - h - 34 * u], [cx + 9 * u, cy - h - 31 * u + Math.sin(t * 4) * 1.2 * u], [cx + 0.6 * u, cy - h - 28 * u]], '#e04a4a');
    person(c, cx + fw * 1.3, cy + fh * 1.3, u, { body: '#4a7bd0', hat: '#9a6a3a', t, ph: 1, walk: false });
  };
  DRAW.well = function (c, cx, cy, tw, o, k) {
    const u = tw / 64, t = o.t, lv = o.lv;
    ellipse(c, cx, cy + 1 * u, tw * 0.24, tw * 0.12, 'rgba(0,0,0,.2)');
    ellipse(c, cx, cy - 2 * u, 13 * u, 6.5 * u, '#a8a49a'); ellipse(c, cx, cy - 7 * u, 13 * u, 6.5 * u, '#c4c0b4');
    ellipse(c, cx, cy - 7 * u, 9.6 * u, 4.6 * u, '#5a7ab0'); ellipse(c, cx, cy - 7.6 * u, 6.6 * u, 3 * u, '#9ae0f8');
    for (const s of [-1, 1]) rrect(c, cx + s * 12 * u - 0.9 * u, cy - 27 * u, 1.8 * u, 22 * u, 0.6, '#7a5230');
    poly(c, [[cx - 16 * u, cy - 26 * u], [cx, cy - 36 * u], [cx + 16 * u, cy - 26 * u], [cx, cy - 23 * u]], '#6aa8c8', 'rgba(30,50,70,.5)', 0.8);
    poly(c, [[cx - 16 * u, cy - 26 * u], [cx, cy - 23 * u], [cx, cy - 36 * u]], '#8ac8e0');
    // wishes rising
    for (let i = 0; i < 5; i++) { const ph = (t * 0.5 + i / 5 + o.seed) % 1, x = cx + Math.sin(ph * 5 + i * 1.7) * 9 * u, y = cy - 8 * u - ph * 26 * u; poly(c, [[x, y - 2.4 * u], [x + 1 * u, y - 0.6 * u], [x + 2.4 * u, y], [x + 1 * u, y + 0.6 * u], [x, y + 2.4 * u], [x - 1 * u, y + 0.6 * u], [x - 2.4 * u, y], [x - 1 * u, y - 0.6 * u]], `rgba(130,235,255,${1 - ph})`); }
    o.glows.push([cx, cy - 9 * u, 16 * u, '130,230,255']);
    void lv;
  };
  // the stars that tell the level (a row of gold pips under the building)
  function pips(c, cx, cy, tw, lv, max) {
    const u = tw / 64, n = Math.min(lv, max || 12), w = 4.2 * u;
    const x0 = cx - (n - 1) * w / 2, y = cy + tw * 0.27;
    for (let i = 0; i < n; i++) { ellipse(c, x0 + i * w, y, 1.7 * u, 1.7 * u, i < 5 ? '#ffd860' : '#ff9a5a'); c.strokeStyle = 'rgba(90,50,10,.55)'; c.lineWidth = 0.6; c.stroke(); }
  }
  function building(c, type, cx, cy, tw, o, k) {
    const f = DRAW[type]; if (!f) return;
    f(c, cx, cy, tw, o, k);
    if (o.lv > 1 && type !== 'plaza' && tw >= 30) pips(c, cx, cy, tw, o.lv - 1);
  }

  // ---------------------------------------------------------------- small things for the interface
  function coinIcon(c, x, y, r) { ellipse(c, x, y, r, r, '#d9a420'); ellipse(c, x, y, r * 0.8, r * 0.8, '#ffd860'); c.fillStyle = '#b8860b'; c.font = '800 ' + Math.round(r * 1.3) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText('¢', x, y + r * 0.05); }
  function woodIcon(c, x, y, r) { rrect(c, x - r, y - r * 0.6, r * 2, r * 1.2, r * 0.5, '#a06a3a'); ellipse(c, x + r * 0.85, y, r * 0.35, r * 0.55, '#e8c898'); }
  function foodIcon(c, x, y, r) { ellipse(c, x, y + r * 0.1, r * 0.9, r * 0.8, '#e8584a'); c.fillStyle = '#4f9a3a'; c.beginPath(); c.ellipse(x + r * 0.2, y - r * 0.8, r * 0.5, r * 0.25, -0.5, 0, TAU); c.fill(); }
  function sparkIcon(c, x, y, r) { poly(c, [[x, y - r], [x + r * 0.3, y - r * 0.3], [x + r, y], [x + r * 0.3, y + r * 0.3], [x, y + r], [x - r * 0.3, y + r * 0.3], [x - r, y], [x - r * 0.3, y - r * 0.3]], '#7fe4ff', 'rgba(20,90,120,.6)', 0.8); }
  function popIcon(c, x, y, r) { ellipse(c, x, y - r * 0.5, r * 0.45, r * 0.45, '#f3c9a2'); rrect(c, x - r * 0.6, y - r * 0.05, r * 1.2, r * 0.95, r * 0.4, '#4a7bd0'); }
  const ICON = { coin: coinIcon, wood: woodIcon, food: foodIcon, spark: sparkIcon, pop: popIcon };

  // sky and clouds (behind the town)
  function sky(c, W, H, t, k, night) {
    const g = c.createLinearGradient(0, 0, 0, H); g.addColorStop(0, k.sky1); g.addColorStop(1, k.sky2);
    c.fillStyle = g; c.fillRect(0, 0, W, H);
    if (night) {
      for (let i = 0; i < 26; i++) { const x = (T_hash(i, 1) * W), y = T_hash(i, 2) * H * 0.55, r = 0.5 + T_hash(i, 3) * 1.1, tw = 0.5 + 0.5 * Math.sin(t * 1.5 + i); c.fillStyle = `rgba(255,255,240,${0.35 + 0.5 * tw})`; c.beginPath(); c.arc(x, y, r, 0, TAU); c.fill(); }
      ellipse(c, W * 0.84, H * 0.14, 11, 11, '#f4f0d8'); ellipse(c, W * 0.84 + 4, H * 0.14 - 2, 10, 10, k.sky1);
    } else {
      ellipse(c, W * 0.84, H * 0.13, 15, 15, 'rgba(255,240,170,.95)'); ellipse(c, W * 0.84, H * 0.13, 24, 24, 'rgba(255,240,170,.25)');
    }
    for (let i = 0; i < 4; i++) {
      const sp = 7 + i * 2.4, x = ((t * sp + i * W * 0.37) % (W + 140)) - 70, y = H * (0.1 + 0.11 * i) + Math.sin(i * 2.2) * 8, s = 0.8 + 0.2 * i;
      c.fillStyle = k.cloud;
      c.beginPath(); c.ellipse(x, y, 30 * s, 9 * s, 0, 0, TAU); c.ellipse(x - 14 * s, y + 2 * s, 18 * s, 7 * s, 0, 0, TAU); c.ellipse(x + 16 * s, y + 3 * s, 20 * s, 7 * s, 0, 0, TAU); c.fill();
    }
  }
  function T_hash(i, k) { let h = (Math.imul(i + 1, 374761393) ^ Math.imul(k + 3, 668265263)) >>> 0; h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; }

  root.TownArt = { shade, mix, poly, ellipse, rrect, ground, grassTexture, water, tree, rock, person, visitor, building, pips, sky, ICON, ROOFS, DRAW };
})(typeof window !== 'undefined' ? window : globalThis);
