// はこはこ運送：絵（canvas で描く倉庫・箱・はこびやさん・ハブのアイコン）。ぜんぶ自作。DOM は使わない（node でも読み込める）。
// 床は倉庫のタイル、壁はレンガ、箱は木箱にバンド、ゴールは黄色の線の枠、すべる床は水色の氷、一方通行はベルトコンベア、ワープ台は渦の輪。
(function (root) {
  'use strict';
  const T = { VOID: 0, FLOOR: 1, GOAL: 2, ICE: 3, ONE: 4, PAD: 8 };
  const PADCOL = ['#a66bff', '#1fbfa5', '#ff7aa8', '#ffb23c'];
  const PAL = {
    light: { bg: '#e9dfcf', floorA: '#f2e8d6', floorB: '#ebdfc9', grout: '#d8c9ae', wallTop: '#8c93a6', wall: '#6b7287', wallDark: '#4a5063', brick: '#7c8398', goal: '#e0a100', goalFill: 'rgba(255, 200, 40, .28)',
      crate: '#c98b45', crateDark: '#9c6430', crateLight: '#e3ae6c', strap: '#6a4524', done: '#7bbf6a', doneDark: '#4f8a43', ice: '#cfeaf8', iceDark: '#9dcbe6', iceShine: '#ffffff', belt: '#6f7b86', beltDark: '#4d575f', beltArrow: '#ffd24a',
      body: '#ff8a3d', bodyDark: '#d4631d', cap: '#2f6fd0', capDark: '#1f4a95', skin: '#ffd9b3', shadow: 'rgba(40,30,10,.22)', warn: '#e53935', hint: '#1e88e5', path: 'rgba(30,136,229,.9)', ink: '#2b2418' },
    dark: { bg: '#1a1d26', floorA: '#2c313f', floorB: '#292e3b', grout: '#20242f', wallTop: '#5d6580', wall: '#454c63', wallDark: '#2d3244', brick: '#525a74', goal: '#ffc933', goalFill: 'rgba(255, 201, 51, .22)',
      crate: '#b8793a', crateDark: '#85522a', crateLight: '#d79b57', strap: '#4f3319', done: '#6bc060', doneDark: '#3e8438', ice: '#5d8fb0', iceDark: '#3f6c8c', iceShine: '#d7f1ff', belt: '#58626e', beltDark: '#3a424c', beltArrow: '#ffd24a',
      body: '#ff9a52', bodyDark: '#d4631d', cap: '#4b86e6', capDark: '#2a5ab0', skin: '#ffd9b3', shadow: 'rgba(0,0,0,.35)', warn: '#ff5a52', hint: '#5ab0ff', path: 'rgba(90,176,255,.95)', ink: '#f3ead8' },
  };
  const pal = dark => (dark ? PAL.dark : PAL.light);
  const DXY = [[0, -1], [1, 0], [0, 1], [-1, 0]];

  function rr(ctx, x, y, w, h, r) {
    ctx.beginPath(); ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath();
  }
  function floor(ctx, P, x, y, s, odd) { ctx.fillStyle = odd ? P.floorA : P.floorB; ctx.fillRect(x, y, s, s); ctx.strokeStyle = P.grout; ctx.lineWidth = Math.max(1, s / 40); ctx.strokeRect(x + .5, y + .5, s - 1, s - 1); }
  function wall(ctx, P, x, y, s, up) {
    ctx.fillStyle = P.wall; ctx.fillRect(x, y, s, s);
    ctx.fillStyle = P.brick; const h = s / 4;
    for (let r = 0; r < 4; r++) { const off = r % 2 ? s / 4 : 0; for (let c = -1; c < 3; c++) { const bx = x + off + c * s / 2; const x0 = Math.max(x, bx + 1), x1 = Math.min(x + s, bx + s / 2 - 1); if (x1 > x0) ctx.fillRect(x0, y + r * h + 1, x1 - x0, h - 2); } }
    if (!up) { ctx.fillStyle = P.wallTop; ctx.fillRect(x, y, s, Math.max(2, s * 0.1)); }
    ctx.strokeStyle = P.wallDark; ctx.lineWidth = Math.max(1, s / 36); ctx.strokeRect(x + .5, y + .5, s - 1, s - 1);
  }
  function goal(ctx, P, x, y, s, t) {
    const m = s * 0.2; ctx.fillStyle = P.goalFill; ctx.fillRect(x + m, y + m, s - 2 * m, s - 2 * m);
    ctx.strokeStyle = P.goal; ctx.lineWidth = Math.max(2, s * 0.07); ctx.setLineDash([s * 0.14, s * 0.1]); ctx.lineDashOffset = -(t || 0) * 0.01; ctx.strokeRect(x + m, y + m, s - 2 * m, s - 2 * m); ctx.setLineDash([]);
    ctx.fillStyle = P.goal; ctx.beginPath(); ctx.arc(x + s / 2, y + s / 2, s * 0.06, 0, 7); ctx.fill();
  }
  function ice(ctx, P, x, y, s) {
    ctx.fillStyle = P.ice; ctx.fillRect(x, y, s, s); ctx.strokeStyle = P.iceDark; ctx.lineWidth = Math.max(1, s / 30); ctx.strokeRect(x + .5, y + .5, s - 1, s - 1);
    ctx.strokeStyle = P.iceShine; ctx.lineWidth = Math.max(1.5, s / 16); ctx.lineCap = 'round'; ctx.globalAlpha = 0.85;
    ctx.beginPath(); ctx.moveTo(x + s * 0.2, y + s * 0.42); ctx.lineTo(x + s * 0.42, y + s * 0.2); ctx.moveTo(x + s * 0.5, y + s * 0.78); ctx.lineTo(x + s * 0.78, y + s * 0.5); ctx.stroke(); ctx.globalAlpha = 1; ctx.lineCap = 'butt';
  }
  function belt(ctx, P, x, y, s, dir, t) {
    ctx.fillStyle = P.belt; ctx.fillRect(x, y, s, s); ctx.strokeStyle = P.beltDark; ctx.lineWidth = Math.max(1, s / 30); ctx.strokeRect(x + .5, y + .5, s - 1, s - 1);
    ctx.save(); ctx.translate(x + s / 2, y + s / 2); ctx.rotate(dir * Math.PI / 2); // 上向きを基準
    const off = ((t || 0) * 0.02) % 1;
    ctx.fillStyle = P.beltDark; ctx.fillRect(-s * 0.46, -s * 0.46, s * 0.1, s * 0.92); ctx.fillRect(s * 0.36, -s * 0.46, s * 0.1, s * 0.92);
    ctx.strokeStyle = P.beltArrow; ctx.lineWidth = Math.max(2, s * 0.09); ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    for (let k = -1; k < 2; k++) { const yy = (k + off) * s * 0.34; ctx.globalAlpha = Math.max(0, 1 - Math.abs(yy) / (s * 0.5)); ctx.beginPath(); ctx.moveTo(-s * 0.2, yy + s * 0.08); ctx.lineTo(0, yy - s * 0.1); ctx.lineTo(s * 0.2, yy + s * 0.08); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.restore();
  }
  function pad(ctx, P, x, y, s, k, t) {
    const c = PADCOL[k % PADCOL.length], cx = x + s / 2, cy = y + s / 2;
    ctx.fillStyle = P.floorB; ctx.fillRect(x, y, s, s); ctx.strokeStyle = P.grout; ctx.lineWidth = Math.max(1, s / 40); ctx.strokeRect(x + .5, y + .5, s - 1, s - 1);
    ctx.lineWidth = Math.max(2, s * 0.07); ctx.strokeStyle = c;
    for (let r = 0; r < 3; r++) { ctx.globalAlpha = 1 - r * 0.28; ctx.beginPath(); ctx.arc(cx, cy, s * (0.38 - r * 0.11), (t || 0) * 0.004 * (r % 2 ? -1 : 1) + r, (t || 0) * 0.004 * (r % 2 ? -1 : 1) + r + 4.4); ctx.stroke(); }
    ctx.globalAlpha = 1; ctx.fillStyle = c; ctx.font = '800 ' + Math.round(s * 0.3) + 'px sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle'; ctx.fillText(String(k + 1), cx, cy + s * 0.02);
  }
  // 箱：on=ゴールの上、bad=行き止まり、pop=とんで出たときのふくらみ
  function crate(ctx, P, x, y, s, on, bad, pop, t) {
    const sc = pop ? 1 + 0.18 * Math.sin(Math.min(1, pop) * Math.PI) : 1, m = s * 0.09;
    ctx.save(); ctx.translate(x + s / 2, y + s / 2); ctx.scale(sc, sc); ctx.translate(-s / 2, -s / 2);
    ctx.fillStyle = P.shadow; rr(ctx, m + s * 0.02, m + s * 0.06, s - 2 * m, s - 2 * m, s * 0.1); ctx.fill();
    const body = on ? P.done : P.crate, dark = on ? P.doneDark : P.crateDark, light = on ? '#a6dd96' : P.crateLight;
    ctx.fillStyle = body; rr(ctx, m, m, s - 2 * m, s - 2 * m, s * 0.1); ctx.fill();
    ctx.strokeStyle = dark; ctx.lineWidth = Math.max(2, s * 0.06); ctx.stroke();
    ctx.strokeStyle = light; ctx.lineWidth = Math.max(1, s * 0.035); ctx.beginPath(); ctx.moveTo(m + s * 0.1, m + s * 0.2); ctx.lineTo(s - m - s * 0.1, m + s * 0.2); ctx.moveTo(m + s * 0.1, s - m - s * 0.2); ctx.lineTo(s - m - s * 0.1, s - m - s * 0.2); ctx.stroke();
    ctx.strokeStyle = on ? P.doneDark : P.strap; ctx.lineWidth = Math.max(2, s * 0.09); ctx.beginPath(); ctx.moveTo(s / 2, m + 1); ctx.lineTo(s / 2, s - m - 1); ctx.stroke();
    ctx.fillStyle = on ? P.doneDark : P.strap; ctx.beginPath(); ctx.arc(s / 2, s / 2, s * 0.09, 0, 7); ctx.fill();
    if (on) { ctx.strokeStyle = '#fff'; ctx.lineWidth = Math.max(2, s * 0.07); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.beginPath(); ctx.moveTo(s * 0.3, s * 0.52); ctx.lineTo(s * 0.44, s * 0.66); ctx.lineTo(s * 0.7, s * 0.34); ctx.stroke(); ctx.lineCap = 'butt'; }
    if (bad) { const k = 0.5 + 0.5 * Math.sin((t || 0) * 0.008); ctx.strokeStyle = P.warn; ctx.globalAlpha = 0.55 + 0.45 * k; ctx.lineWidth = Math.max(3, s * 0.08); rr(ctx, m - 2, m - 2, s - 2 * m + 4, s - 2 * m + 4, s * 0.12); ctx.stroke(); ctx.globalAlpha = 1; }
    ctx.restore();
  }
  // はこびやさん：まるい体・青いぼうし・向きで目の位置が変わる
  function courier(ctx, P, x, y, s, dir, step) {
    const cx = x + s / 2, cy = y + s / 2 + Math.sin((step || 0) * 6.28) * s * 0.025, r = s * 0.34;
    ctx.fillStyle = P.shadow; ctx.beginPath(); ctx.ellipse(cx, y + s * 0.86, r * 0.9, r * 0.28, 0, 0, 7); ctx.fill();
    ctx.fillStyle = P.body; ctx.beginPath(); ctx.arc(cx, cy + s * 0.04, r, 0, 7); ctx.fill(); ctx.strokeStyle = P.bodyDark; ctx.lineWidth = Math.max(2, s * 0.05); ctx.stroke();
    ctx.fillStyle = P.bodyDark; ctx.fillRect(cx - r * 0.9, cy + s * 0.1, r * 1.8, s * 0.05);
    const hx = cx + DXY[dir][0] * s * 0.05, hy = cy - s * 0.12 + DXY[dir][1] * s * 0.04;
    ctx.fillStyle = P.skin; ctx.beginPath(); ctx.arc(hx, hy, r * 0.62, 0, 7); ctx.fill();
    ctx.fillStyle = P.cap; ctx.beginPath(); ctx.arc(hx, hy - r * 0.08, r * 0.64, Math.PI * 1.02, Math.PI * 1.98); ctx.closePath(); ctx.fill();
    ctx.fillStyle = P.capDark; const bx = hx + DXY[dir][0] * r * 0.5, by = hy - r * 0.08 + (dir === 2 ? r * 0.2 : dir === 0 ? -r * 0.05 : 0);
    ctx.beginPath(); if (dir === 0) ctx.ellipse(hx, hy - r * 0.55, r * 0.5, r * 0.12, 0, 0, 7); else ctx.ellipse(bx, by, r * (dir === 2 ? 0.6 : 0.42), r * 0.14, 0, 0, 7); ctx.fill();
    if (dir !== 0) {
      ctx.fillStyle = P.ink; const ex = dir === 1 ? r * 0.18 : dir === 3 ? -r * 0.18 : 0, e = r * 0.09;
      if (dir === 2) { ctx.beginPath(); ctx.arc(hx - r * 0.2, hy + r * 0.12, e, 0, 7); ctx.arc(hx + r * 0.2, hy + r * 0.12, e, 0, 7); ctx.fill(); } else { ctx.beginPath(); ctx.arc(hx + ex + (dir === 1 ? r * 0.12 : -r * 0.12), hy + r * 0.1, e, 0, 7); ctx.fill(); }
    }
  }
  function arrow(ctx, x0, y0, x1, y1, s, col) {
    ctx.strokeStyle = col; ctx.fillStyle = col; ctx.lineWidth = Math.max(3, s * 0.09); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x0, y0); ctx.lineTo(x1, y1); ctx.stroke();
    const a = Math.atan2(y1 - y0, x1 - x0), h = s * 0.2; ctx.beginPath(); ctx.moveTo(x1, y1); ctx.lineTo(x1 - h * Math.cos(a - 0.5), y1 - h * Math.sin(a - 0.5)); ctx.lineTo(x1 - h * Math.cos(a + 0.5), y1 - h * Math.sin(a + 0.5)); ctx.closePath(); ctx.fill(); ctx.lineCap = 'butt';
  }

  // 盤をまるごと描く。o = { s（1マスの大きさ）, ox, oy, dark, t（ms）, pl:{x,y,dir,step}（マス単位の小数でもよい）, boxes:[{x,y,pop}]（なければ st.b）, dead:Set, hint:{box,to,path}, prev:{path:[マス],target}, cursor, pads:{マス→番号} }
  function draw(ctx, L, st, o) {
    const P = pal(o.dark), s = o.s, ox = o.ox || 0, oy = o.oy || 0, t = o.t || 0;
    const X = i => ox + ((i % L.w) - 1) * s, Y = i => oy + (Math.floor(i / L.w) - 1) * s;
    const padIdx = o.pads || {};
    ctx.fillStyle = P.wallDark; ctx.fillRect(ox, oy, L.W * s, L.H * s);
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) {
      const i = (y + 1) * L.w + x + 1, ty = L.t[i], px = ox + x * s, py = oy + y * s;
      if (ty === T.VOID) {
        // 壁：部屋に接している壁だけ描く
        let near = false; for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { const j = i + dx + dy * L.w; if (j >= 0 && j < L.n && L.t[j] !== T.VOID) { near = true; break; } }
        if (near) wall(ctx, P, px, py, s, y > 0 && L.t[i - L.w] === T.VOID && false);
        continue;
      }
      floor(ctx, P, px, py, s, (x + y) % 2 === 0);
      if (ty === T.GOAL) goal(ctx, P, px, py, s, t);
      else if (ty === T.ICE) ice(ctx, P, px, py, s);
      else if (ty >= 4 && ty <= 7) belt(ctx, P, px, py, s, ty - 4, t);
      else if (ty === T.PAD) pad(ctx, P, px, py, s, padIdx[i] || 0, t);
    }
    if (o.prev && o.prev.path && o.prev.path.length) {
      ctx.strokeStyle = P.path; ctx.lineWidth = Math.max(3, s * 0.12); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash([s * 0.02, s * 0.2]);
      ctx.beginPath(); o.prev.path.forEach((c, k) => { const cx = X(c) + s / 2, cy = Y(c) + s / 2; if (k) ctx.lineTo(cx, cy); else ctx.moveTo(cx, cy); }); ctx.stroke(); ctx.setLineDash([]); ctx.lineCap = 'butt';
      const e = o.prev.target; if (e != null) { ctx.fillStyle = P.path; ctx.globalAlpha = 0.35; ctx.fillRect(X(e), Y(e), s, s); ctx.globalAlpha = 1; }
    }
    if (o.hint) {
      const h = o.hint;
      if (h.path && h.path.length) { ctx.strokeStyle = P.hint; ctx.lineWidth = Math.max(2, s * 0.08); ctx.setLineDash([s * 0.12, s * 0.12]); ctx.beginPath(); h.path.forEach((c, k) => { const cx = X(c) + s / 2, cy = Y(c) + s / 2; if (k) ctx.lineTo(cx, cy); else ctx.moveTo(cx, cy); }); ctx.stroke(); ctx.setLineDash([]); }
      if (h.box != null) {
        const k = 0.5 + 0.5 * Math.sin(t * 0.008); ctx.strokeStyle = P.hint; ctx.globalAlpha = 0.6 + 0.4 * k; ctx.lineWidth = Math.max(3, s * 0.09); ctx.strokeRect(X(h.box) + 2, Y(h.box) + 2, s - 4, s - 4); ctx.globalAlpha = 1;
        if (h.dir != null) { const d = DXY[h.dir], cx = X(h.box) + s / 2, cy = Y(h.box) + s / 2; arrow(ctx, cx - d[0] * s * 0.05, cy - d[1] * s * 0.05, cx + d[0] * s * 0.62, cy + d[1] * s * 0.62, s, P.hint); }
      }
    }
    const dead = o.dead || null;
    const boxes = o.boxes || st.b.map(i => ({ x: (i % L.w) - 1, y: Math.floor(i / L.w) - 1, i }));
    for (const b of boxes) {
      const gx = Math.round(b.x), gy = Math.round(b.y), ci = (gy + 1) * L.w + gx + 1, on = L.t[ci] === T.GOAL && Math.abs(b.x - gx) < 0.01 && Math.abs(b.y - gy) < 0.01;
      crate(ctx, P, ox + b.x * s, oy + b.y * s, s, on, !!(dead && dead.has(ci)), b.pop, t);
    }
    const pl = o.pl || { x: (st.p % L.w) - 1, y: Math.floor(st.p / L.w) - 1, dir: 2 };
    courier(ctx, P, ox + pl.x * s, oy + pl.y * s, s, pl.dir == null ? 2 : pl.dir, pl.step || 0);
    if (o.cursor != null) { ctx.strokeStyle = P.hint; ctx.lineWidth = Math.max(2, s * 0.05); ctx.strokeRect(X(o.cursor) + 1, Y(o.cursor) + 1, s - 2, s - 2); }
  }

  // ハブのアイコン（registry の iconSvg と同じもの）
  const ICON = '<svg viewBox="0 0 72 72" aria-hidden="true"><rect width="72" height="72" fill="#e7d8bd"/><path d="M0 52h72v20H0z" fill="#8a93a8"/><path d="M0 52h72" stroke="#5a6278" stroke-width="3"/>' +
    '<g stroke="#8a93a8" stroke-width="1" opacity=".5"><path d="M0 62h72M18 52v20M36 52v20M54 52v20"/></g>' +
    '<rect x="8" y="30" width="24" height="24" rx="3" fill="#c98b45" stroke="#85522a" stroke-width="2.5"/><path d="M20 30v24M8 42h24" stroke="#6a4524" stroke-width="3"/>' +
    '<rect x="36" y="38" width="20" height="16" rx="3" fill="#7bbf6a" stroke="#3e8438" stroke-width="2.5"/><path d="M41 46l4 4 8-8" stroke="#fff" stroke-width="3" fill="none" stroke-linecap="round" stroke-linejoin="round"/>' +
    '<rect x="36" y="14" width="22" height="22" rx="3" fill="#d79b57" stroke="#85522a" stroke-width="2.5"/><path d="M47 14v22" stroke="#6a4524" stroke-width="3"/>' +
    '<circle cx="62" cy="26" r="7" fill="#ff8a3d" stroke="#d4631d" stroke-width="2"/><path d="M56 22a7 6 0 0 1 12 0z" fill="#2f6fd0"/>' +
    '<path d="M4 20h14" stroke="#e0a100" stroke-width="3" stroke-linecap="round" stroke-dasharray="3 4"/></svg>';
  const API = { pal, draw, crate, courier, ICON, PADCOL, DXY };
  root.CratesArt = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
