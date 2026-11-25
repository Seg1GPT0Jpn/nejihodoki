// おもちゃ大乱闘（brawl）の絵：おもちゃたち・ステージ・エフェクト・カメラ・画面の数字。ぜんぶ Canvas 2D のベクター描き（自作）。
// 中身（engine.js）は絵のことを知らない。ここは状態を読むだけ。window.BrawlArt
(function (root) {
  'use strict';
  const TAU = Math.PI * 2, INK = '#2a1d17';
  let E = null, CFG = { reduced: false, dark: false, T: s => s, en: false };
  const PCOL = ['#ff5a5a', '#4aa3ff', '#4fcf6a', '#ffd23f'];
  const PSHAPE = ['tri', 'circle', 'square', 'diamond']; // 色だけに頼らない：スロットごとの形のしるし
  // 色ちがい（見た目だけ）：R.pal[スロット] が brawl/kits.js の palettes(おもちゃ) の何番か
  function palOf(ch, idx) {
    const C = E.CH[ch], K = root.BrawlKits;
    if (!K || !C) return { col: C ? C.color : '#888', col2: C ? C.color2 : '#fff' };
    const P = K.palettes(C); return P[((idx | 0) % P.length + P.length) % P.length] || P[0];
  }
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;

  // ------------------------------------------------------------------ 道具
  function rr(c, x, y, w, h, r) {
    r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.lineTo(x + w - r, y); c.quadraticCurveTo(x + w, y, x + w, y + r); c.lineTo(x + w, y + h - r);
    c.quadraticCurveTo(x + w, y + h, x + w - r, y + h); c.lineTo(x + r, y + h); c.quadraticCurveTo(x, y + h, x, y + h - r); c.lineTo(x, y + r); c.quadraticCurveTo(x, y, x + r, y); c.closePath();
  }
  function fs(c, fill, lw) { if (fill) { c.fillStyle = fill; c.fill(); } if (lw !== 0) { c.lineWidth = lw || 2.4; c.strokeStyle = INK; c.lineJoin = 'round'; c.lineCap = 'round'; c.stroke(); } }
  function box(c, x, y, w, h, r, fill, lw) { rr(c, x, y, w, h, r); fs(c, fill, lw); }
  function circ(c, x, y, r, fill, lw) { c.beginPath(); c.arc(x, y, Math.max(0.1, r), 0, TAU); fs(c, fill, lw); }
  function ell(c, x, y, rx, ry, fill, lw, rot) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), rot || 0, 0, TAU); fs(c, fill, lw); }
  function limb(c, x0, y0, x1, y1, w, fill) {
    c.lineCap = 'round'; c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1);
    c.strokeStyle = INK; c.lineWidth = w + 4.4; c.stroke(); c.strokeStyle = fill; c.lineWidth = w; c.stroke();
  }
  function poly(c, pts, fill, lw) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 2) c.lineTo(pts[i], pts[i + 1]); c.closePath(); fs(c, fill, lw); }
  function shade(hex, k) { // k>0 明るく、k<0 暗く
    const n = parseInt(hex.slice(1), 16), r = n >> 16 & 255, g = n >> 8 & 255, b = n & 255;
    const f = v => Math.round(clamp(k > 0 ? v + (255 - v) * k : v * (1 + k), 0, 255));
    return 'rgb(' + f(r) + ',' + f(g) + ',' + f(b) + ')';
  }
  function eye(c, x, y, r, look, col) { circ(c, x, y, r, '#fff', 1.6); circ(c, x + (look || 0) * r * 0.35, y + r * 0.08, r * 0.55, col || INK, 0); circ(c, x + (look || 0) * r * 0.35 - r * 0.15, y - r * 0.15, r * 0.18, '#fff', 0); }
  function spring(c, x0, y0, x1, y1, w, n, col) { // ばね
    const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy) || 1, nx = -dy / L, ny = dx / L;
    c.beginPath(); c.moveTo(x0, y0);
    for (let i = 1; i <= n * 2; i++) { const t = i / (n * 2), s = (i % 2 ? 1 : -1) * w; c.lineTo(x0 + dx * t + nx * s * (i === n * 2 ? 0 : 1), y0 + dy * t + ny * s * (i === n * 2 ? 0 : 1)); }
    c.lineJoin = 'round'; c.lineCap = 'round'; c.strokeStyle = INK; c.lineWidth = 5.6; c.stroke(); c.strokeStyle = col; c.lineWidth = 2.6; c.stroke();
  }
  function star(c, x, y, r, n, fill, lw, rot) {
    c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = (rot || 0) + i * Math.PI / n, rad = i % 2 ? r * 0.45 : r; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } c.closePath(); fs(c, fill, lw);
  }

  // ------------------------------------------------------------------ おもちゃ
  // ローカル座標：足元が (0,0)、右向き、上が -y。P = { t, ph, a（攻撃の進み 0〜1・なければ -1）, tx, ty（攻撃の先）, fx, run, air, crouch, spin }
  const DRAW = {};
  function armPair(c, P, sx, sy, restX, restY, w, col, hand) {
    // 前の腕：攻撃中は先へ。うしろの腕：ふる
    const sw = Math.sin(P.ph) * (P.run ? 9 : 2);
    let fx = restX + sw * 0.5, fy = restY - Math.abs(sw) * 0.3;
    if (P.a >= 0 && P.tx != null) { fx = P.tx; fy = P.ty; }
    else if (P.air) { fy = restY - 8; }
    limb(c, -sx, sy, -restX * 0.6 - sw * 0.5, restY, w, shade(col, -0.15));
    limb(c, sx, sy, fx, fy, w, col);
    if (hand) hand(c, fx, fy);
  }
  DRAW.robo = (c, P, f) => {
    const col = f.col, key = (P.t * 0.12);
    // うしろ：ぜんまい
    c.save(); c.translate(-14, -32); c.rotate(P.buff ? P.t * 0.4 : key);
    limb(c, 0, 0, -8, 0, 2.6, '#c9c9c9'); ell(c, -10, -5, 6, 4.4, '#f3b441', 2); ell(c, -10, 5, 6, 4.4, '#f3b441', 2); c.restore();
    const lk = Math.sin(P.ph) * (P.run ? 6 : 0) + (P.air ? -3 : 0);
    box(c, -9 + lk * 0.5, -13, 8, 13, 3, '#8a8f98'); box(c, 1 - lk * 0.5, -13, 8, 13, 3, '#a0a5ae');
    box(c, -12 + lk * 0.5, -3, 12, 5, 2, '#444'); box(c, -1 - lk * 0.5, -3, 12, 5, 2, '#555');
    box(c, -13, -39, 26, 28, 5, col);
    box(c, -8, -35, 16, 12, 3, shade(col, 0.28), 1.6);
    circ(c, 0, -29, 4.4, '#f3b441', 1.8); for (let i = 0; i < 6; i++) { const a = i * TAU / 6 + P.t * 0.05; c.beginPath(); c.moveTo(0, -29); c.lineTo(Math.cos(a) * 6.5, -29 + Math.sin(a) * 6.5); c.strokeStyle = INK; c.lineWidth = 1.6; c.stroke(); }
    circ(c, -10, -37, 1.2, '#fff', 0); circ(c, 10, -37, 1.2, '#fff', 0); circ(c, -10, -14, 1.2, '#fff', 0); circ(c, 10, -14, 1.2, '#fff', 0);
    box(c, -10, -58, 20, 18, 5, shade(col, 0.18));
    c.beginPath(); c.moveTo(4, -58); c.lineTo(7, -66); c.strokeStyle = INK; c.lineWidth = 2.2; c.stroke(); circ(c, 7, -67, 2.6, '#f3b441', 1.6);
    eye(c, -3, -50, 4.4, 1, '#3a2a10'); eye(c, 6, -50, 3.8, 1, '#3a2a10'); box(c, -4, -43, 9, 2.4, 1, '#333', 0);
    armPair(c, P, 11, -33, 16, -22, 6.6, '#b9bdc6', (c2, x, y) => circ(c2, x, y, 6.5, '#d2d5dc', 2.2));
  };
  DRAW.duck = (c, P, f) => {
    const col = f.col, wob = Math.sin(P.ph) * (P.run ? 2 : 0);
    // 盾（うしろの手）と剣（前の手）
    const lk = Math.sin(P.ph) * (P.run ? 5 : 0) + (P.air ? -3 : 0);
    limb(c, -4 + lk * 0.5, -10, -4 + lk * 0.5, -1, 5, '#f09a2d'); limb(c, 6 - lk * 0.5, -10, 6 - lk * 0.5, -1, 5, '#f09a2d');
    ell(c, -3 + lk * 0.5, -1, 6.5, 3, '#f09a2d', 2); ell(c, 8 - lk * 0.5, -1, 6.5, 3, '#f09a2d', 2);
    ell(c, 0, -26 + wob * 0.2, 16, 18, col); ell(c, -2, -22, 9, 11, shade(col, 0.4), 0);
    // しっぽ
    poly(c, [-14, -26, -22, -34, -17, -20], col, 2);
    // 頭と帽子
    circ(c, 4, -45, 12, col);
    poly(c, [10, -47, 24, -44, 12, -38], '#f09a2d', 2.2); ell(c, 17, -43, 6, 2.4, '#e07a1d', 0);
    eye(c, 6, -48, 3.6, 1); 
    // かぶと
    c.beginPath(); c.arc(3, -50, 12.5, Math.PI, TAU); c.closePath(); fs(c, '#8da0c9', 2.4); box(c, -9, -52, 24, 4, 1.5, '#6c7fae', 1.8);
    poly(c, [-2, -62, 4, -76, 8, -62], '#e0453f', 2); 
    // 盾
    const shx = -10, shy = -28;
    c.save(); c.translate(shx, shy); poly(c, [-8, -9, 8, -9, 8, 5, 0, 13, -8, 5], '#5b7fc9', 2.4); box(c, -1.4, -7, 2.8, 15, 1, '#f2d13c', 0); box(c, -6, -2, 12, 2.8, 1, '#f2d13c', 0); c.restore();
    // 剣
    let hx = 14, hy = -28, ang = -0.8 + wob * 0.05;
    if (P.a >= 0 && P.tx != null) { hx = Math.max(6, P.tx * 0.55); hy = P.ty * 0.8; ang = Math.atan2(P.ty - hy, P.tx - hx); }
    else if (P.air) ang = -1.2;
    limb(c, 8, -30, hx, hy, 5.4, shade(col, -0.1));
    c.save(); c.translate(hx, hy); c.rotate(ang);
    box(c, -3, -2.6, 6, 5.2, 1.5, '#8a5a2b', 1.8); box(c, 2, -6, 3.6, 12, 1.2, '#d8b45a', 1.6);
    const len = P.a >= 0 && P.tx != null ? Math.max(24, Math.hypot(P.tx - hx, P.ty - hy) + 14) : 34;
    poly(c, [5, -2.6, 5 + len, -1.6, 5 + len + 6, 0, 5 + len, 1.6, 5, 2.6], '#dfe6ee', 2); c.restore();
  };
  DRAW.tin = (c, P, f) => {
    const col = f.col, lk = Math.sin(P.ph) * (P.run ? 6 : 0) + (P.air ? -3 : 0);
    box(c, -8 + lk * 0.4, -19, 7, 19, 2.5, '#f2f2f2'); box(c, 1 - lk * 0.4, -19, 7, 19, 2.5, '#fafafa');
    box(c, -10 + lk * 0.4, -4, 10, 5, 2, '#222'); box(c, 0 - lk * 0.4, -4, 10, 5, 2, '#2a2a2a');
    box(c, -11, -42, 22, 26, 5, col);
    box(c, -11, -29, 22, 3.6, 0, '#d0453f', 1.4);
    for (let i = 0; i < 3; i++) circ(c, 0, -39 + i * 5.6, 1.5, '#e8b73a', 1.1);
    box(c, -3, -43, 6, 26, 0, '#f2f2f2', 1.4); 
    circ(c, 0, -49, 9.4, '#f4c9a0');
    eye(c, 3, -50, 2.6, 1); c.beginPath(); c.moveTo(1, -45); c.lineTo(8, -45); c.strokeStyle = '#4a2a14'; c.lineWidth = 2.2; c.stroke();
    // 帽子（くまの毛の兵隊帽）
    box(c, -8, -70, 16, 18, 3, '#262626'); box(c, -9.4, -57, 19, 4, 1.5, '#e8b73a', 1.8); circ(c, 0, -63, 2.4, '#e8b73a', 1.2);
    // 銃（前の手）
    const sw = Math.sin(P.ph) * (P.run ? 3 : 0);
    limb(c, -7, -38, -11 - sw, -26, 5.4, shade(col, -0.2));
    let hx = 12, hy = -33;
    if (P.a >= 0 && P.tx != null) { hx = P.tx; hy = P.ty; } else if (P.air) hy = -38;
    limb(c, 8, -38, hx * 0.8, hy * 0.9 + -4, 5.4, col);
    c.save(); c.translate(hx * 0.8 - 4, hy * 0.9 - 4); c.rotate(Math.atan2(hy - -36, Math.max(4, hx)) * 0.6);
    box(c, -8, -2.6, 32, 5.2, 1.5, '#7a4a22', 1.8); box(c, 20, -3.6, 12, 7.2, 1, '#aab0b8', 1.6); poly(c, [32, -1.2, 40, 0, 32, 1.2], '#cfd4da', 1.4); c.restore();
    circ(c, hx * 0.8, hy * 0.9 - 4, 3.6, '#f4c9a0', 1.8);
  };
  DRAW.bear = (c, P, f) => {
    const col = f.col, c2 = f.col2, lk = Math.sin(P.ph) * (P.run ? 5 : 0) + (P.air ? -3 : 0), bob = Math.sin(P.t * 0.08) * 0.8;
    ell(c, -9 + lk * 0.4, -7, 8.5, 8.5, shade(col, -0.08)); ell(c, 10 - lk * 0.4, -7, 8.5, 8.5, col);
    ell(c, -9 + lk * 0.4, -3, 5.2, 3.2, c2, 1.4); ell(c, 10 - lk * 0.4, -3, 5.2, 3.2, c2, 1.4);
    ell(c, 0, -29 + bob, 20, 21, col); ell(c, 1, -24 + bob, 12.5, 13, c2, 1.8);
    // ステッチ
    c.save(); c.setLineDash([2, 2.4]); c.beginPath(); c.moveTo(1, -36 + bob); c.lineTo(1, -12 + bob); c.strokeStyle = '#7a4a22'; c.lineWidth = 1.4; c.stroke(); c.restore();
    // 頭
    circ(c, -9, -64 + bob, 8, shade(col, -0.05)); circ(c, 11, -64 + bob, 8, col); circ(c, -9, -64 + bob, 4.4, c2, 0); circ(c, 11, -64 + bob, 4.4, c2, 0);
    ell(c, 1, -52 + bob, 17, 15.5, col);
    ell(c, 5, -48 + bob, 9, 7, c2, 1.8); circ(c, 8, -50 + bob, 2.8, '#4a2a14', 1.2);
    circ(c, -3, -56 + bob, 2.8, '#2a1a10', 0); circ(c, 11, -56 + bob, 2.8, '#2a1a10', 0); circ(c, -2.2, -57 + bob, 0.9, '#fff', 0); circ(c, 11.8, -57 + bob, 0.9, '#fff', 0);
    c.beginPath(); c.arc(5, -46 + bob, 3, 0.1, Math.PI - 0.1); c.strokeStyle = '#4a2a14'; c.lineWidth = 1.4; c.stroke();
    // リボン
    poly(c, [2, -37 + bob, -6, -41 + bob, -6, -33 + bob], '#d6455d', 1.8); poly(c, [2, -37 + bob, 10, -41 + bob, 10, -33 + bob], '#d6455d', 1.8); circ(c, 2, -37 + bob, 2.4, '#b8334a', 1.4);
    armPair(c, P, 17, -34, 22, -22, 11, col, (c2_, x, y) => { circ(c2_, x, y, 9, col, 2.4); circ(c2_, x + 1, y + 1.5, 4, c2, 1.2); });
  };
  DRAW.top = (c, P, f) => {
    const col = f.col, c2 = f.col2, sp = P.spin ? P.t * 0.9 : P.t * 0.12;
    // 心棒の先
    poly(c, [-5, -12, 5, -12, 0, 1], '#cfcfcf', 2); 
    c.save(); c.translate(0, -26); c.rotate(P.run ? 0.1 : 0);
    // 円盤（しましま：回って見える）
    ell(c, 0, 4, 17, 8, shade(col, -0.2));
    c.save(); c.beginPath(); c.ellipse(0, 2, 17, 9, 0, 0, TAU); c.clip();
    for (let i = -4; i < 6; i++) { const x0 = ((i * 8 + sp * 3) % 40) - 17; c.fillStyle = i % 2 ? c2 : col; c.fillRect(x0, -8, 4.6, 22); }
    c.restore(); c.beginPath(); c.ellipse(0, 2, 17, 9, 0, 0, TAU); c.lineWidth = 2.4; c.strokeStyle = INK; c.stroke();
    // 上のドーム＝顔
    c.beginPath(); c.moveTo(-13, -1); c.quadraticCurveTo(-13, -20, 0, -20); c.quadraticCurveTo(13, -20, 13, -1); c.closePath(); fs(c, shade(col, 0.2), 2.4);
    eye(c, -3.4, -9, 3.6, 1); eye(c, 5.4, -9, 3.6, 1); c.beginPath(); c.arc(1, -4, 3, 0.2, Math.PI - 0.2); c.strokeStyle = INK; c.lineWidth = 1.6; c.stroke();
    box(c, -1.8, -26, 3.6, 8, 1.4, '#e8b73a', 1.6); circ(c, 0, -27, 3.2, '#e8b73a', 1.6);
    c.restore();
    // ひも
    if (P.a < 0) { c.beginPath(); c.moveTo(15, -29); c.quadraticCurveTo(24, -26 + Math.sin(P.t * 0.2) * 3, 26, -16); c.strokeStyle = '#e8d9a8'; c.lineWidth = 2.2; c.stroke(); }
    // スピンのかげ
    if (P.spin) { c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 2.2; for (let i = 0; i < 3; i++) { c.beginPath(); c.ellipse(0, -22 + i * 3, 22 + i * 4, 6 + i, 0, 0.3 + sp * 0.2 + i, 2.2 + sp * 0.2 + i); c.stroke(); } }
  };
  DRAW.jack = (c, P, f) => {
    const col = f.col, c2 = f.col2, ext = P.a >= 0 && P.tx != null ? clamp(Math.hypot(P.tx, P.ty + 40) / 60, 0, 1) : 0;
    // はこ
    box(c, -14, -22, 28, 22, 3, c2); box(c, -14, -22, 28, 6, 2, shade(c2, 0.2), 1.8);
    for (let i = 0; i < 3; i++) circ(c, -8 + i * 8, -9, 2, '#f2d13c', 1.4);
    // ばね（のびる）
    const lift = (P.air ? 6 : 0) + (P.crouch ? -8 : 0) + Math.sin(P.t * 0.14) * 1.2 + ext * 6;
    const hy = -46 - lift;
    spring(c, 0, -22, 2, hy + 8, 7, 5, '#d8d8d8');
    // 頭
    circ(c, 2, hy - 2, 13, '#f7dfc4');
    // ぼうし（二色・先に鈴）
    poly(c, [-10, hy - 8, 14, hy - 8, 24, hy - 24, 14, hy - 38, 0, hy - 22], col, 2.2);
    poly(c, [0, hy - 22, 14, hy - 38, 24, hy - 24, 14, hy - 8], shade(col, -0.22), 2.2);
    circ(c, 14, hy - 38, 3.2, '#f2d13c', 1.6); circ(c, -11, hy - 8, 2.6, '#f2d13c', 1.4);
    eye(c, -1, hy - 3, 3.2, 1); eye(c, 8, hy - 3, 3.2, 1); circ(c, 3.6, hy + 2, 2.3, '#e0453f', 1.4);
    c.beginPath(); c.arc(3, hy + 4, 5.4, 0.2, Math.PI - 0.2); c.strokeStyle = '#8a1e1e'; c.lineWidth = 2; c.stroke();
    // 手（ばねでのびる）
    const sw = Math.sin(P.ph) * (P.run ? 3 : 0);
    spring(c, -8, hy + 18, -16 - sw, hy + 34, 3.4, 3, '#cfcfcf'); circ(c, -17 - sw, hy + 36, 5.2, '#fff', 2);
    let tx = 18, ty = hy + 30; if (P.a >= 0 && P.tx != null) { tx = P.tx; ty = P.ty; } else if (P.air) ty = hy + 20;
    spring(c, 8, hy + 18, tx, ty, 4 + ext * 2, Math.max(3, Math.round(Math.hypot(tx - 8, ty - hy - 18) / 11)), '#cfcfcf'); circ(c, tx, ty, 6.4, '#fff', 2.2);
  };
  DRAW.junk = (c, P, f) => {
    const col = f.col, c2 = f.col2, lk = Math.sin(P.ph) * (P.run ? 6 : 0);
    box(c, -30 + lk * 0.4, -24, 26, 24, 4, '#6d5a48'); box(c, 4 - lk * 0.4, -24, 26, 24, 4, '#7d6853'); // 箱の足
    box(c, -26, -62, 52, 42, 5, col);    // 胴＝木箱
    c.beginPath(); c.moveTo(-26, -62); c.lineTo(26, -20); c.moveTo(26, -62); c.lineTo(-26, -20); c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    circ(c, 0, -41, 8, c2, 2.2); for (let i = 0; i < 8; i++) { const a = i * TAU / 8 + P.t * 0.04; c.beginPath(); c.moveTo(0, -41); c.lineTo(Math.cos(a) * 11, -41 + Math.sin(a) * 11); c.strokeStyle = INK; c.lineWidth = 2; c.stroke(); }
    box(c, -22, -78, 44, 18, 4, '#8a6f55'); box(c, -14, -92, 14, 14, 3, '#a89279'); box(c, 2, -88, 12, 10, 3, '#6d5a48');
    circ(c, -12, -70, 5.6, '#fff', 2); circ(c, -11, -70, 2.4, '#b00', 0); circ(c, 11, -70, 4, '#fff', 2); circ(c, 11.6, -70, 1.8, '#222', 0);
    box(c, -11, -62, 24, 3, 1, '#222', 0);
    poly(c, [-18, -92, -14, -108, -7, -97, 0, -112, 7, -97, 14, -108, 18, -92], c2, 2.4);
    armPair(c, P, 26, -52, 36, -34, 12, '#8f8f8f', (c2_, x, y) => { circ(c2_, x, y, 12, '#9a8a78', 2.6); });
  };
  // ---- ここから、あとから増えたおもちゃ（12人）。ぜんぶ自作のベクター絵
  DRAW.ninja = (c, P, f) => {
    const col = f.col, c2 = f.col2, lk = Math.sin(P.ph) * (P.run ? 6 : 0) + (P.air ? -3 : 0), fl = Math.sin(P.t * 0.3) * 4 + (P.run ? 5 : 0);
    box(c, -8 + lk * 0.5, -18, 7, 18, 2, shade(col, -0.3)); box(c, 1 - lk * 0.5, -18, 7, 18, 2, shade(col, -0.15));
    box(c, -10 + lk * 0.5, -3, 10, 4, 2, '#2a2a2a'); box(c, 0 - lk * 0.5, -3, 10, 4, 2, '#2a2a2a');
    poly(c, [-8, -44, -22, -42 + fl, -34, -36 + fl * 1.5, -24, -34, -8, -38], c2, 2); // 紙のおりひも（はちまきの尾）
    poly(c, [-11, -42, 11, -42, 13, -16, -13, -16], col, 2.4); poly(c, [0, -42, 13, -16, 0, -16], shade(col, -0.22), 0); // おり目
    c.beginPath(); c.moveTo(-11, -42); c.lineTo(13, -16); c.moveTo(11, -42); c.lineTo(-13, -16); c.strokeStyle = 'rgba(255,255,255,.45)'; c.lineWidth = 1.2; c.stroke();
    box(c, -12, -30, 24, 4, 1, '#2a2a2a', 1.4); circ(c, 0, -28, 2.2, '#f2d13c', 1.2);
    box(c, -11, -58, 22, 18, 4, c2); box(c, -11, -52, 22, 7, 1, col, 1.8); eye(c, -3, -48.5, 2.6, 1); eye(c, 6, -48.5, 2.6, 1);
    poly(c, [-11, -58, 0, -66, 11, -58], shade(c2, -0.12), 2);
    armPair(c, P, 10, -36, 14, -24, 5.4, shade(col, -0.1), (c2_, x, y) => { c2_.save(); c2_.translate(x, y); c2_.rotate(R.t * 0.4); star(c2_, 0, 0, 7, 4, '#d8dde3', 1.6, 0); c2_.restore(); });
  };
  DRAW.wiz = (c, P, f) => {
    const col = f.col, c2 = f.col2, bob = Math.sin(P.t * 0.07) * 1.2, lk = Math.sin(P.ph) * (P.run ? 4 : 0);
    // あやつり糸
    c.save(); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1; for (const [a, b] of [[-8, -64], [2, -70], [10, -60]]) { c.beginPath(); c.moveTo(a, b + bob); c.lineTo(a * 1.6, -150); c.stroke(); } c.restore();
    box(c, -7 + lk * 0.4, -10, 6, 10, 2, '#3b2a14'); box(c, 2 - lk * 0.4, -10, 6, 10, 2, '#3b2a14');
    poly(c, [-14, -8, 14, -8, 9, -42 + bob, -9, -42 + bob], col, 2.4); poly(c, [-14, -8, 14, -8, 12, -14, -12, -14], c2, 1.8); star(c, 0, -26 + bob, 4.6, 5, c2, 1.4, 0);
    circ(c, 1, -50 + bob, 9.6, '#f4d9bb'); poly(c, [-8, -46 + bob, 10, -46 + bob, 3, -34 + bob], '#eee', 1.8); // ひげ
    eye(c, -1.5, -52 + bob, 2.8, 1); eye(c, 6.5, -52 + bob, 2.8, 1);
    poly(c, [-13, -56 + bob, 15, -56 + bob, 6, -86 + bob, 0, -78 + bob], shade(col, -0.1), 2.4); box(c, -14, -58 + bob, 30, 4.4, 2, c2, 1.8); star(c, 4, -70 + bob, 3.4, 5, c2, 1.2, 0);
    // つえ
    let hx = 16, hy = -34; if (P.a >= 0 && P.tx != null) { hx = Math.max(10, P.tx * 0.8); hy = P.ty * 0.85; }
    limb(c, 8, -38 + bob, hx, hy, 5, shade(col, 0.1)); limb(c, hx - 4, hy + 18, hx + 4, hy - 26, 3.2, '#8a5a2b'); circ(c, hx + 5, hy - 29, 5.4, c2, 2); circ(c, hx + 5, hy - 29, 2.4, '#fff', 0);
    limb(c, -8, -38 + bob, -14 - lk, -26, 5, shade(col, -0.2));
  };
  DRAW.cat = (c, P, f) => {
    const col = f.col, c2 = f.col2, lk = Math.sin(P.ph) * (P.run ? 7 : 0) + (P.air ? -3 : 0), tw = Math.sin(P.t * 0.15) * 4;
    // しっぽ
    c.beginPath(); c.moveTo(-12, -14); c.quadraticCurveTo(-30, -16 + tw, -26, -36 + tw); c.strokeStyle = INK; c.lineWidth = 8.4; c.lineCap = 'round'; c.stroke(); c.strokeStyle = col; c.lineWidth = 5; c.stroke();
    box(c, -11 + lk * 0.5, -10, 7, 10, 3, shade(col, -0.2)); box(c, 4 - lk * 0.5, -10, 7, 10, 3, shade(col, -0.1));
    ell(c, 0, -20, 16, 11, col); ell(c, 2, -17, 9, 6, c2, 0);
    // ぜんまい
    c.save(); c.translate(-6, -30); c.rotate(P.t * 0.12 * (P.run ? 3 : 1)); limb(c, 0, 0, 0, -6, 2.2, '#c9c9c9'); ell(c, -3.4, -8, 3.6, 2.4, '#f3b441', 1.6); ell(c, 3.4, -8, 3.6, 2.4, '#f3b441', 1.6); c.restore();
    circ(c, 8, -34, 12, col); poly(c, [-1, -42, 1, -56, 9, -45], col, 2.2); poly(c, [9, -45, 17, -56, 19, -41], col, 2.2); poly(c, [1.4, -45, 2, -52, 6, -46], '#f4a6a6', 0);
    eye(c, 6, -36, 3.4, 1, '#3a6a20'); eye(c, 14, -35, 3, 1, '#3a6a20'); poly(c, [11, -31, 14, -31, 12.5, -28.6], '#e07a8a', 1); c.beginPath(); c.moveTo(18, -30); c.lineTo(28, -32); c.moveTo(18, -28.5); c.lineTo(28, -27); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
    armPair(c, P, 8, -22, 13, -14, 5.6, col, (c2_, x, y) => { circ(c2_, x, y, 5, c2, 2); for (let i = -1; i <= 1; i++) limb(c2_, x + 2, y + i * 3, x + 7, y + i * 3.4, 1.6, '#fff'); });
  };
  DRAW.tank = (c, P, f) => {
    const col = f.col, c2 = f.col2, rec = P.a >= 0 && P.tx != null ? clamp(P.a, 0, 1) : 0, bob = Math.sin(P.t * 0.5) * (P.run ? 0.8 : 0);
    // キャタピラ
    box(c, -26, -14 + bob, 52, 14, 7, '#3a3a3a'); for (let i = 0; i < 5; i++) circ(c, -18 + i * 9, -7 + bob, 4, '#8a8a8a', 1.4); for (let i = 0; i < 9; i++) { const x = -24 + i * 6 + (P.run ? (P.t * 1.2 % 6) : 0); if (x > -25 && x < 24) box(c, x, -15 + bob, 2.4, 3, 0.6, '#222', 0); }
    box(c, -22, -30 + bob, 44, 18, 4, col); box(c, -22, -22 + bob, 44, 4, 0, shade(col, -0.2), 0); star(c, -10, -22 + bob, 4.4, 5, c2, 1.4, 0);
    // ほうとう
    box(c, -10, -44 + bob, 26, 16, 6, shade(col, 0.1)); circ(c, 3, -37 + bob, 3, c2, 1.4);
    let L = 26 - rec * 8; limb(c, 14, -37 + bob, 14 + L, -39 + bob - (P.air ? 3 : 0), 7, '#6b6f60'); box(c, 14 + L - 2, -43 + bob, 6, 8, 2, '#4a4e44', 1.8);
    box(c, -3, -53 + bob, 8, 10, 3, '#4a4e44', 1.8); eye(c, 4, -37 + bob, 0.1, 0); // ハッチ
    circ(c, 1, -55 + bob, 6, '#f4c9a0'); eye(c, 3, -56 + bob, 2.6, 1); box(c, -5, -64 + bob, 12, 6, 3, shade(col, -0.2), 1.8);
  };
  DRAW.giraffe = (c, P, f) => {
    const col = f.col, c2 = f.col2, lk = Math.sin(P.ph) * (P.run ? 4 : 0) + (P.air ? -3 : 0);
    // 足（積み木）
    box(c, -10 + lk * 0.4, -22, 8, 22, 1.6, '#e4584a'); box(c, 4 - lk * 0.4, -22, 8, 22, 1.6, '#4a8fd6');
    box(c, -16, -44, 32, 24, 3, col); box(c, -16, -44, 32, 5, 1, shade(col, 0.2), 1.6); for (const [x, y] of [[-8, -34], [4, -30], [-2, -38]]) box(c, x, y, 7, 7, 1.4, c2, 0);
    // 首（積み木をつなぐ）：攻撃のときはのびる
    let hx = 14, hy = -88; if (P.a >= 0 && P.tx != null) { hx = Math.max(8, P.tx); hy = P.ty - 8; }
    const nx0 = 8, ny0 = -44, n = 5;
    for (let i = 0; i < n; i++) { const t = (i + 0.5) / n, x = nx0 + (hx - nx0) * t, y = ny0 + (hy - ny0) * t; box(c, x - 6, y - 6, 12, 12, 2, i % 2 ? '#f0c24a' : '#e4a23a', 2); }
    box(c, hx - 10, hy - 11, 24, 16, 5, col); poly(c, [hx + 14, hy - 4, hx + 22, hy - 2, hx + 22, hy + 3, hx + 14, hy + 3], shade(col, -0.1), 2); eye(c, hx + 4, hy - 4, 3.2, 1);
    box(c, hx - 4, hy - 19, 3.6, 9, 1.4, c2, 1.6); circ(c, hx - 2.4, hy - 20, 2.4, '#e4584a', 1.2); box(c, hx + 5, hy - 19, 3.6, 8, 1.4, c2, 1.6); circ(c, hx + 6.8, hy - 20, 2.4, '#e4584a', 1.2);
    limb(c, -14, -40, -20 - lk, -26, 4, shade(col, -0.2));
  };
  DRAW.ball = (c, P, f) => {
    const col = f.col, c2 = f.col2, sq = P.crouch ? 0.82 : 1, rot = P.spin ? P.t * 0.5 : Math.sin(P.ph) * 0.06;
    box(c, -9 + Math.sin(P.ph) * (P.run ? 4 : 0), -6, 9, 6, 3, '#e0453f'); box(c, 1 - Math.sin(P.ph) * (P.run ? 4 : 0), -6, 9, 6, 3, '#e0453f');
    c.save(); c.translate(0, -22 * sq); c.scale(1, sq); c.rotate(rot);
    circ(c, 0, 0, 19, col); c.save(); c.beginPath(); c.arc(0, 0, 19, 0, TAU); c.clip(); c.fillStyle = c2; c.fillRect(-30, -4, 60, 8); c.fillStyle = shade(col, -0.2); c.fillRect(-30, 8, 60, 3); c.restore(); c.beginPath(); c.arc(0, 0, 19, 0, TAU); c.lineWidth = 2.4; c.strokeStyle = INK; c.stroke();
    circ(c, -7, -9, 4, 'rgba(255,255,255,.45)', 0); c.restore();
    if (!P.spin) { eye(c, 3, -26 * sq, 3.8, 1); eye(c, 12, -25 * sq, 3.4, 1); c.beginPath(); c.arc(8, -19 * sq, 4, 0.2, Math.PI - 0.2); c.strokeStyle = INK; c.lineWidth = 1.8; c.stroke(); }
    if (P.a >= 0 && P.tx != null) { limb(c, 12, -22, P.tx, P.ty, 5, col); circ(c, P.tx, P.ty, 5.4, '#fff', 2); }
  };
  DRAW.crab = (c, P, f) => {
    const col = f.col, c2 = f.col2, lk = Math.sin(P.ph) * (P.run ? 5 : 0);
    for (let i = 0; i < 3; i++) { limb(c, -14 + i * 4, -12, -22 + i * 3 + (i % 2 ? lk : -lk) * 0.5, -1, 3, shade(col, -0.2)); limb(c, 14 - i * 4, -12, 22 - i * 3 - (i % 2 ? lk : -lk) * 0.5, -1, 3, col); }
    ell(c, 0, -20, 20, 13, col); ell(c, 0, -16, 13, 7, c2, 0); for (let i = -2; i <= 2; i++) circ(c, i * 5, -14, 1.4, '#e8b73a', 1);
    limb(c, -5, -30, -7, -40, 2.4, '#c9c9c9'); limb(c, 7, -30, 9, -40, 2.4, '#c9c9c9'); eye(c, -7, -42, 4.6, 1); eye(c, 9, -42, 4.6, 1);
    // ハサミ
    let hx = 24, hy = -26; if (P.a >= 0 && P.tx != null) { hx = P.tx; hy = P.ty; } else if (P.air) hy = -34;
    limb(c, -14, -26, -24, -34 + Math.sin(P.t * 0.1) * 2, 6, shade(col, -0.15)); claw(c, -26, -36, -1, shade(col, -0.15));
    limb(c, 12, -26, hx, hy, 6.4, col); claw(c, hx, hy, 1, col);
  };
  function claw(c, x, y, d, col) { c.save(); c.translate(x, y); c.scale(d, 1); ell(c, 2, 0, 9, 7.4, col, 2.4); poly(c, [4, -2, 15, -4, 11, 0, 15, 4, 4, 3], shade(col, 0.15), 2); c.restore(); }
  DRAW.snail = (c, P, f) => {
    const col = f.col, c2 = f.col2, bob = Math.sin(P.t * 0.05) * 0.8, crl = P.crouch ? 1 : 0;
    // からだ
    c.beginPath(); c.moveTo(-26, 0); c.quadraticCurveTo(-26, -12, -12, -12); c.lineTo(14, -14); c.quadraticCurveTo(26, -18, 25, -32 + bob); c.quadraticCurveTo(24, -36, 20, -34); c.quadraticCurveTo(14, -24, 8, -4); c.lineTo(8, 0); c.closePath(); fs(c, col, 2.4);
    limb(c, 16, -33 + bob, 14, -46 + bob, 2.6, shade(col, 0.1)); limb(c, 23, -34 + bob, 28, -45 + bob, 2.6, shade(col, 0.1)); eye(c, 14, -48 + bob, 3.6, 1); eye(c, 28, -47 + bob, 3.6, 1);
    c.beginPath(); c.arc(21, -28 + bob, 3.6, 0.2, Math.PI - 0.2); c.strokeStyle = INK; c.lineWidth = 1.6; c.stroke();
    // オルゴールのから
    c.save(); c.translate(-6, -26); ell(c, 0, 0, 22, 22, c2); c.beginPath(); for (let a = 0; a < 14; a += 0.3) { const r = 1.4 + a * 1.35; c.lineTo(Math.cos(a) * r, Math.sin(a) * r); } c.strokeStyle = INK; c.lineWidth = 2; c.stroke();
    c.restore(); box(c, -16, -50, 4, 10, 1.4, '#c9c9c9', 1.4); circ(c, -14, -52, 3, '#f3b441', 1.4);
    if (Math.floor(P.t / 14) % 2 && !P.crouch) { c.fillStyle = '#fff'; c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.arc(-30, -50 - (P.t % 14), 2.4, 0, TAU); c.fill(); c.stroke(); }
    if (P.a >= 0 && P.tx != null) { limb(c, 20, -22, P.tx, P.ty, 5, col); circ(c, P.tx, P.ty, 5.6, c2, 2); }
  };
  DRAW.kaiju = (c, P, f) => {
    const col = f.col, c2 = f.col2, lk = Math.sin(P.ph) * (P.run ? 6 : 0) + (P.air ? -3 : 0), tl = Math.sin(P.t * 0.1) * 3;
    // しっぽ
    poly(c, [-14, -22, -40 - tl, -14, -48 - tl, -26, -36, -34, -14, -40], shade(col, -0.1), 2.4); for (let i = 0; i < 3; i++) poly(c, [-20 - i * 8, -34 + i * 4, -24 - i * 8, -42 + i * 4, -16 - i * 8, -38 + i * 4], c2, 1.6);
    box(c, -14 + lk * 0.5, -20, 12, 20, 4, shade(col, -0.2)); box(c, 3 - lk * 0.5, -20, 12, 20, 4, col); box(c, -17 + lk * 0.5, -5, 17, 6, 3, '#f3e9d0'); box(c, 1 - lk * 0.5, -5, 17, 6, 3, '#f3e9d0');
    ell(c, 0, -42, 20, 26, col); ell(c, 4, -36, 12, 18, shade(c2, 0.3), 0);
    for (let i = 0; i < 4; i++) poly(c, [-17 + i * 3, -58 + i * 9, -28 + i * 2, -62 + i * 9, -17 + i * 3, -50 + i * 9], c2, 1.8); // せなかのとげ
    // あたま
    ell(c, 8, -68, 16, 12, col); box(c, 10, -66, 18, 10, 4, shade(col, 0.1)); for (let i = 0; i < 4; i++) poly(c, [13 + i * 4.4, -64, 15 + i * 4.4, -59, 11 + i * 4.4, -59], '#fff', 1);
    eye(c, 8, -74, 3.8, 1, '#a02020'); poly(c, [2, -80, 8, -86, 12, -79], c2, 1.8);
    armPair(c, P, 16, -46, 20, -34, 8, col, (c2_, x, y) => { circ(c2_, x, y, 6.4, shade(col, 0.1), 2.2); for (let i = 0; i < 3; i++) poly(c2_, [x + 3, y - 4 + i * 3, x + 9, y - 3 + i * 3, x + 3, y - 2 + i * 3], '#fff', 1); });
  };
  DRAW.samurai = (c, P, f) => {
    const col = f.col, c2 = f.col2, wob = Math.sin(P.ph) * (P.run ? 2 : 0), lk = Math.sin(P.ph) * (P.run ? 5 : 0) + (P.air ? -3 : 0);
    box(c, -9 + lk * 0.5, -6, 8, 6, 2, '#6b4a2a'); box(c, 1 - lk * 0.5, -6, 8, 6, 2, '#6b4a2a');
    // こけしのからだ：はかま
    poly(c, [-12, -4, 12, -4, 9, -38 + wob * 0.3, -9, -38 + wob * 0.3], col, 2.4); box(c, -10, -34, 20, 5, 1, '#e8c07a', 1.6);
    poly(c, [-4, -38, 4, -38, 0, -22], c2, 1.4);
    // あたま
    circ(c, 0, -52 + wob * 0.3, 13, '#f6e2c4'); circ(c, 0, -62 + wob * 0.3, 9, '#1c1c1c'); circ(c, 0, -73 + wob * 0.3, 4.4, '#1c1c1c', 2); // まげ
    poly(c, [-13, -54, 13, -54, 13, -62, -13, -62], '#1c1c1c', 0);
    eye(c, 2, -50, 2.4, 1); eye(c, 9, -50, 2.2, 1); circ(c, 7, -44, 2, '#e07a8a', 0); box(c, -13, -57, 26, 3, 1, '#d8423b', 1.4);
    // かたな
    let hx = 14, hy = -30, ang = -0.9 + wob * 0.05;
    if (P.a >= 0 && P.tx != null) { hx = Math.max(6, P.tx * 0.55); hy = P.ty * 0.8; ang = Math.atan2(P.ty - hy, P.tx - hx); } else if (P.air) ang = -1.3;
    limb(c, 8, -32, hx, hy, 5, col); c.save(); c.translate(hx, hy); c.rotate(ang); box(c, -3, -2.4, 6, 4.8, 1.5, '#2a1d17', 1.6); box(c, 2, -5, 3, 10, 1, '#e8b73a', 1.4);
    const len = P.a >= 0 && P.tx != null ? Math.max(30, Math.hypot(P.tx - hx, P.ty - hy) + 16) : 38; poly(c, [5, -2, 5 + len, -1.4, 5 + len + 5, 0, 5 + len, 1.2, 5, 2], '#e6edf3', 1.8); c.restore();
    limb(c, -8, -32, -12 - lk, -22, 4.6, shade(col, -0.2));
  };
  DRAW.balloon = (c, P, f) => {
    const col = f.col, c2 = f.col2, fl = Math.sin(P.t * 0.06) * 2 + (P.air ? -3 : 0), lk = Math.sin(P.ph) * (P.run ? 4 : 0);
    // ひも
    c.beginPath(); c.moveTo(-2, -12); c.quadraticCurveTo(-14 + Math.sin(P.t * 0.1) * 4, -6, -10, 0); c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1.6; c.stroke();
    box(c, -8 + lk * 0.4, -8, 7, 8, 3.4, col); box(c, 3 - lk * 0.4, -8, 7, 8, 3.4, col);
    ell(c, 0, -24 + fl * 0.3, 15, 16, col); ell(c, -4, -29 + fl * 0.3, 5, 7, 'rgba(255,255,255,.4)', 0); ell(c, 2, -18, 8, 8, c2, 0);
    // みみ（ふうせん）
    ell(c, -8, -62 + fl, 5.6, 15, shade(col, 0.1), 2.2, -0.2); ell(c, 8, -62 + fl, 5.6, 15, col, 2.2, 0.2); ell(c, -8, -62 + fl, 2.6, 9, '#ffd6e4', 0, -0.2); ell(c, 8, -62 + fl, 2.6, 9, '#ffd6e4', 0, 0.2);
    circ(c, 1, -46 + fl, 12.4, col); eye(c, -2, -48 + fl, 3, 1); eye(c, 8, -48 + fl, 3, 1); circ(c, 5, -43 + fl, 1.8, '#e0455f', 1); c.beginPath(); c.moveTo(5, -41 + fl); c.lineTo(5, -39 + fl); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke();
    armPair(c, P, 11, -26, 15, -17, 5, col, (c2_, x, y) => circ(c2_, x, y, 5, c2, 2));
  };
  DRAW.penguin = (c, P, f) => {
    const col = f.col, c2 = f.col2, lk = Math.sin(P.ph) * (P.run ? 5 : 0), bob = Math.sin(P.t * 0.09) * 0.8;
    box(c, -9 + lk * 0.5, -6, 10, 6, 3, '#f3a63a'); box(c, 2 - lk * 0.5, -6, 10, 6, 3, '#f3a63a');
    ell(c, 0, -28 + bob, 18, 24, col); ell(c, 3, -24 + bob, 11.4, 18, c2, 0);
    ell(c, 0, -54 + bob, 13, 12, col); poly(c, [8, -53 + bob, 21, -50 + bob, 8, -47 + bob], '#f3a63a', 2); eye(c, 2, -56 + bob, 3.2, 1); eye(c, 10, -56 + bob, 2.8, 1);
    // たいこ
    c.save(); c.translate(10, -22 + bob); ell(c, 0, 0, 12, 7, '#e4584a', 2.4); box(c, -12, 0, 24, 11, 3, '#e8c07a', 2.2); for (let i = 0; i < 4; i++) { c.beginPath(); c.moveTo(-12 + i * 8, 0); c.lineTo(-8 + i * 8, 11); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke(); } c.restore();
    let hx = 14, hy = -34 + Math.sin(P.t * 0.3) * (P.run ? 1 : 3); if (P.a >= 0 && P.tx != null) { hx = P.tx; hy = P.ty; }
    limb(c, 12, -40 + bob, hx, hy, 6, shade(col, 0.08)); limb(c, hx, hy, hx + 8, hy - 9, 2.8, '#d8b45a'); circ(c, hx + 9, hy - 10, 3, '#f2e4cf', 1.4);
    limb(c, -14, -38 + bob, -20 - lk, -26, 6, shade(col, -0.1));
  };
  const FX_LINES = { slash: 1, kick: 1, punch: 1, spin: 1, spring: 1, hug: 1, drill: 1, ring: 1, shield: 1, lid: 1, prop: 1, horn: 1 };

  // ------------------------------------------------------------------ 状態
  const R = { pal: [], safeT: 0, safeB: 0, parts: [], cam: { x: 0, y: -80, z: 1, tx: 0, ty: -80, tz: 1 }, shake: 0, flash: 0, fl: [], t: 0, pops: [], W: 800, H: 450, dpr: 1, banner: null, slow: 0 };
  function reset(st) {
    R.parts.length = 0; R.pops.length = 0; R.shake = 0; R.flash = 0; R.t = 0; R.banner = null; R.slow = 0;
    R.fl = st.fighters.map(f => ({ ph: 0, land: 0, hit: 0, sq: 0, tumble: 0, face: f.face, trail: [], blink: 0, show: 0, flashT: 0, jx: 0 }));
    const S = E.STAGES[st.stage]; R.cam.x = R.cam.tx = 0; R.cam.y = R.cam.ty = (S.blast.t + S.blast.b) / 2 - 140; R.cam.z = R.cam.tz = 0.8;
    camTarget(st, true);
  }
  function addPart(p) { if (R.parts.length > 240) R.parts.shift(); R.parts.push(p); return p; }
  function burst(x, y, n, col, sp, life, size, o) {
    if (CFG.reduced) n = Math.ceil(n * 0.4);
    for (let i = 0; i < n; i++) {
      const a = Math.random() * TAU, v = sp * (0.4 + Math.random() * 0.8);
      addPart(Object.assign({ k: 'dot', x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v, g: 0.15, life: life * (0.6 + Math.random() * 0.6), max: life, size: size * (0.6 + Math.random() * 0.8), col }, o || {}));
    }
  }
  function event(e, st) {
    const fl = R.fl;
    switch (e.t) {
      case 'hit': {
        const big = Math.min(1, e.p / 14);
        addPart({ k: 'spark', x: e.x, y: e.y, life: 9 + big * 8, max: 9 + big * 8, size: 16 + big * 26, rot: Math.random() * TAU, col: e.p > 9 ? '#fff3b0' : '#ffffff' });
        burst(e.x, e.y, 6 + Math.floor(big * 10), e.p > 9 ? '#ffd23f' : '#ffffff', 3 + big * 5, 16, 3);
        R.shake = Math.max(R.shake, 2 + big * 9); if (fl[e.d]) { fl[e.d].hit = 10; fl[e.d].flashT = 6; }
        if (e.p > 10) R.slow = 0;
        break;
      }
      case 'block': addPart({ k: 'ring', x: e.x, y: e.y, life: 10, max: 10, size: 14, col: '#7fd8ff' }); burst(e.x, e.y, 5, '#7fd8ff', 3, 14, 2.4); R.shake = Math.max(R.shake, 2); break;
      case 'shbreak': burst(e.x, e.y, 18, '#7fd8ff', 6, 28, 4); R.shake = Math.max(R.shake, 8); break;
      case 'counter': addPart({ k: 'ring', x: e.x, y: e.y, life: 14, max: 14, size: 34, col: '#ffd23f' }); R.shake = Math.max(R.shake, 5); break;
      case 'land': if (fl[e.i]) { fl[e.i].land = 8; } burst(e.x, e.y, 4, 'rgba(255,255,255,.8)', 2.2, 14, 3, { g: 0 }); break;
      case 'slam': burst(e.x, e.y, 14, '#d8c9b0', 5, 22, 4, { g: 0.05 }); addPart({ k: 'ring', x: e.x, y: e.y, life: 14, max: 14, size: 60, col: '#fff' }); R.shake = Math.max(R.shake, 8); break;
      case 'jump': if (fl[e.i]) fl[e.i].sq = e.big ? -6 : -3; addPart({ k: 'ring', x: e.x, y: e.y, life: 10, max: 10, size: e.big ? 16 : 10, col: 'rgba(255,255,255,.9)' }); break;
      case 'bounce': burst(e.x, e.y, 6, '#fff', 3, 12, 3); R.shake = Math.max(R.shake, 3); break;
      case 'ko': {
        const c = E.CH[st.fighters[e.i].ch];
        const a = Math.atan2(e.vy, e.vx);
        for (let i = 0; i < 5; i++) addPart({ k: 'star', x: e.x, y: e.y, vx: Math.cos(a + (i - 2) * 0.35) * 5, vy: Math.sin(a + (i - 2) * 0.35) * 5, g: 0, life: 40, max: 40, size: 14 + i % 2 * 8, col: i % 2 ? c.color : '#fff', rot: i });
        addPart({ k: 'ring', x: e.x, y: e.y, life: 28, max: 28, size: 120, col: palOf(c.id, R.pal[e.i]).col });
        addPart({ k: 'ray', x: e.x, y: e.y, life: 22, max: 22, size: 260, rot: Math.atan2(e.vy, e.vx), col: '#fff' });
        R.shake = Math.max(R.shake, 12); R.flash = 0.55; R.slow = 28;
        if (e.star) { for (let i = 0; i < 9; i++) addPart({ k: 'star', x: e.x, y: e.y, vx: Math.cos(i * TAU / 9) * 6, vy: Math.sin(i * TAU / 9) * 6, g: 0, life: 50, max: 50, size: 12 + i % 3 * 6, col: i % 2 ? '#ffd23f' : '#fff', rot: i }); R.slow = 40; R.flash = 0.8; }
        break;
      }
      case 'respawn': burst(e.x, e.y, 10, '#ffd23f', 4, 24, 3.4, { g: -0.02 }); break;
      case 'ledge': burst(e.x, e.y - 20, 4, '#fff', 2, 10, 2.6); break;
      case 'move': {
        const m = E.MOVES[st.fighters[e.i].ch][e.k]; if (m && m.sm) addPart({ k: 'ring', x: e.x, y: e.y, life: 6, max: 6, size: 10, col: 'rgba(255,255,255,.7)' }); break;
      }
      case 'charge': break;
      case 'shoot': burst(e.x, e.y, 3, '#fff', 2, 8, 2.4); break;
      case 'pop': burst(e.x, e.y, 6, '#fff', 3, 12, 3); break;
      case 'grab': addPart({ k: 'ring', x: e.x, y: e.y, life: 8, max: 8, size: 20, col: '#fff' }); break;
      case 'throw': R.shake = Math.max(R.shake, 4); break;
      case 'dodge': burst(e.x, e.y, 6, 'rgba(255,255,255,.8)', 2, 14, 3, { g: 0 }); break;
      case 'buff': burst(e.x, e.y, 10, '#ffd23f', 3, 24, 3, { g: -0.04 }); break;
      case 'warp': burst(e.x, e.y, 9, '#fff', 3, 18, 3, { g: 0 }); addPart({ k: 'ring', x: e.x, y: e.y, life: 12, max: 12, size: 24, col: '#fff' }); addPart({ k: 'ring', x: e.x2, y: e.y2, life: 14, max: 14, size: 30, col: '#c8a8ff' }); break;
      case 'pshield': addPart({ k: 'ring', x: e.x, y: e.y, life: 14, max: 14, size: 40, col: '#fff' }); addPart({ k: 'star', x: e.x, y: e.y, vx: 0, vy: 0, g: 0, life: 14, max: 14, size: 26, col: '#7fd8ff', rot: 0 }); R.shake = Math.max(R.shake, 3); break;
      case 'tech': addPart({ k: 'ring', x: e.x, y: e.y, life: 12, max: 12, size: 34, col: '#fff' }); burst(e.x, e.y, 5, '#fff', 3, 14, 2.6, { g: 0 }); break;
      case 'dash': case 'dd': burst(e.x - (e.d || 1) * 10, e.y - 2, 4, 'rgba(255,255,255,.8)', 2, 12, 3, { g: -0.01 }); break;
      case 'pivot': burst(e.x, e.y - 2, 5, 'rgba(255,255,255,.8)', 2.4, 12, 3, { g: -0.01 }); break;
      case 'reflect': addPart({ k: 'ring', x: e.x, y: e.y, life: 12, max: 12, size: 30, col: '#ffd23f' }); break;
      case 'taunt': for (let i = 0; i < 3; i++) addPart({ k: 'star', x: e.x + (i - 1) * 14, y: e.y, vx: (i - 1) * 0.6, vy: -1.4, g: 0, life: 36, max: 36, size: 9, col: '#ffd23f', rot: i }); break;
      case 'mcancel': burst(e.x, e.y, 6, '#fff', 3, 14, 3, { g: 0 }); break;
      case 'sudden': R.banner = { text: CFG.T('サドンデス！'), t: 120 }; break;
    }
  }
  // 1フレームぶんの更新（試合の1ステップごとに呼ぶ）
  function tick(st) {
    R.t++;
    for (let i = R.parts.length - 1; i >= 0; i--) {
      const p = R.parts[i]; p.life--; if (p.life <= 0) { R.parts.splice(i, 1); continue; }
      if (p.vx != null) { p.x += p.vx; p.y += p.vy; p.vy += p.g || 0; p.vx *= 0.97; }
    }
    if (R.shake > 0) R.shake = Math.max(0, R.shake - 0.9);
    if (R.flash > 0) R.flash = Math.max(0, R.flash - 0.04);
    if (R.slow > 0) R.slow--;
    if (R.banner && --R.banner.t <= 0) R.banner = null;
    for (const f of st.fighters) {
      const a = R.fl[f.i]; if (!a) continue;
      const C = E.CH[f.ch];
      if (f.gr >= 0 && Math.abs(f.vx) > 0.3 && (f.s === 'free')) a.ph += Math.abs(f.vx) * 0.2; else if (f.s === 'free') a.ph *= 0.9;
      if (a.land > 0) a.land--; if (a.hit > 0) a.hit--; if (a.flashT > 0) a.flashT--;
      a.sq *= 0.82;
      a.face += (f.face - a.face) * 0.5;
      if (f.s === 'hurt' && f.hs > 3) a.tumble += (f.vx >= 0 ? 1 : -1) * Math.min(0.5, Math.hypot(f.vx, f.vy) * 0.03); else if (f.s === 'down') a.tumble = (f.vx >= 0 ? 1 : -1) * 1.45; else a.tumble *= 0.5;
      // 走るときのほこり
      if (f.s === 'free' && f.gr >= 0 && Math.abs(f.vx) > C.run * 0.8 && R.t % 6 === 0) addPart({ k: 'dot', x: f.x - f.face * 8, y: f.y - 1, vx: -f.face * 0.6, vy: -0.5, g: -0.01, life: 12, max: 12, size: 3, col: 'rgba(255,255,255,.7)' });
      // 吹っ飛びの尾
      if (f.s === 'hurt' && Math.hypot(f.vx, f.vy) > 7 && R.t % 2 === 0) addPart({ k: 'dot', x: f.x, y: f.y - C.h / 2, vx: 0, vy: 0, g: 0, life: 14, max: 14, size: 6 + Math.hypot(f.vx, f.vy) * 0.3, col: 'rgba(255,255,255,.55)' });
      if (f.s === 'atk' && f.buff > 0 && R.t % 8 === 0) addPart({ k: 'dot', x: f.x, y: f.y - C.h / 2, vx: 0, vy: -1, g: 0, life: 14, max: 14, size: 4, col: '#ffd23f' });
    }
    camTarget(st, false);
  }
  // カメラ：生きているみんなが画面に入るように、はなれたら引いて、近づいたら寄る。速く飛んでいる子は、行く先を少し先取りする。
  // HUD（上か下の帯）とヘッダーにかくれないように、使える帯の中に全員を入れる（R.safeT / R.safeB）。小さい画面ほど、寄りぎみ（読めるように）。
  function camTarget(st, snap) {
    const S = E.STAGES[st.stage], cam = R.cam, bl = S.blast;
    let x0 = 1e9, x1 = -1e9, y0 = 1e9, y1 = -1e9, n = 0;
    for (const f of st.fighters) {
      if (f.s === 'out' || f.s === 'dead') continue;
      const C = E.CH[f.ch], cy = f.y - C.h / 2; n++;
      const look = f.s === 'hurt' ? 4 : 9; // 飛ばされているときは先を見すぎない
      const px = clamp(f.x + clamp(f.vx * look, -110, 110), bl.l + 60, bl.r - 60), py = clamp(cy + clamp(f.vy * look * 0.5, -60, 60), bl.t + 40, bl.b - 40);
      x0 = Math.min(x0, px); x1 = Math.max(x1, px); y0 = Math.min(y0, py); y1 = Math.max(y1, py);
    }
    if (!n) { x0 = x1 = 0; y0 = y1 = -80; }
    const sT = R.safeT || 0, sB = R.safeB || 0, bandH = Math.max(80, R.H - sT - sB);
    const asp = R.W / bandH, padX = 230, padY = 170;
    const minW = R.W >= 700 ? 780 : 780 - (700 - Math.max(360, R.W)) * 0.55; // せまい画面では、すこし寄って、おもちゃを読みやすく
    let w = Math.max(x1 - x0 + padX * 2, minW), h = Math.max(y1 - y0 + padY * 2, minW / asp);
    if (w / h > asp) h = w / asp; else w = h * asp;
    w = Math.min(w, (bl.r - bl.l) + 300); h = w / asp;
    const z = R.W / w, vh = R.H / z; // 画面ぜんぶの高さ（ワールド）
    let cx = (x0 + x1) / 2, cy = (y0 + y1) / 2 - 20 + h * 0.07;
    cx = clamp(cx, bl.l + 80 + w / 2 - 300, bl.r - 80 - w / 2 + 300); cy = clamp(cy, bl.t + h / 2 - 260, bl.b + 120 - h / 2);
    if (w >= (bl.r - bl.l) + 300 - 1) cx = (bl.l + bl.r) / 2;
    cy -= (sT - sB) / (2 * z); // 使える帯の真ん中に、みんなの真ん中がくる
    cam.tx = cx; cam.ty = cy; cam.tz = z;
    if (snap) { cam.x = cx; cam.y = cy; cam.z = cam.tz; return; }
    const k = 0.1;
    cam.x += (cam.tx - cam.x) * k; cam.y += (cam.ty - cam.y) * k; cam.z += (cam.tz - cam.z) * (cam.tz < cam.z ? 0.14 : 0.07);
  }

  // ------------------------------------------------------------------ ステージ
  const TH = {
    bench: { sky: ['#e9cf9f', '#c9a06a'], wall: '#b88a55', top: '#e2b673', side: '#9a6a38', line: 'rgba(90,50,10,.28)', thin: '#f2d36b', thinSide: '#c79a2c', dark: ['#2a2036', '#3b2a2f'] },
    box: { sky: ['#a9cdf2', '#d7e8fb'], wall: '#8fb4e0', top: '#e08a5c', side: '#b8623a', line: 'rgba(80,30,10,.25)', thin: '#7ed0a1', thinSide: '#4a9c73', dark: ['#1a2440', '#2a3358'] },
    shelf: { sky: ['#5b4636', '#8a6b4e'], wall: '#6a503c', top: '#9a6a3c', side: '#6b4426', line: 'rgba(30,10,0,.35)', thin: '#d8a95a', thinSide: '#9a7230', dark: ['#171018', '#241a1a'] },
    track: { sky: ['#9fd0f0', '#e8f4ff'], wall: '#7bb0d0', top: '#8a7a68', side: '#5e5143', line: 'rgba(30,20,10,.3)', thin: '#e0453f', thinSide: '#a02d29', dark: ['#101a36', '#25305a'] },
    house: { sky: ['#f4d3d9', '#f9eadf'], wall: '#eab5bd', top: '#7bc4a0', side: '#4a9a78', line: 'rgba(30,60,40,.28)', thin: '#f4e1a0', thinSide: '#c9a85a', dark: ['#2a1a32', '#3b2438'] },
  };
  function drawBack(c, st, view) {
    const S = E.STAGES[st.stage], th = TH[S.theme], bl = S.blast, cam = R.cam;
    const g = c.createLinearGradient(0, bl.t, 0, bl.b); const pal = CFG.dark ? th.dark : th.sky; g.addColorStop(0, pal[0]); g.addColorStop(1, pal[1]);
    c.fillStyle = g; c.fillRect(bl.l - 400, bl.t - 400, bl.r - bl.l + 800, bl.b - bl.t + 800);
    c.save(); c.globalAlpha = CFG.dark ? 0.5 : 0.8;
    const px = cam.x * 0.35;
    switch (S.theme) {
      case 'bench': // ペグボード
        c.fillStyle = 'rgba(255,255,255,.18)'; for (let x = bl.l - 200; x < bl.r + 200; x += 36) for (let y = bl.t - 100; y < 60; y += 36) { c.beginPath(); c.arc(x + px * 0.2, y, 2.6, 0, TAU); c.fill(); }
        c.strokeStyle = 'rgba(60,30,10,.45)'; c.lineWidth = 6; c.lineCap = 'round';
        c.beginPath(); c.moveTo(-520 + px * 0.2, -200); c.lineTo(-460 + px * 0.2, -330); c.moveTo(-500 + px * 0.2, -270); c.lineTo(-430 + px * 0.2, -240); c.stroke(); // ハンマーの影
        c.beginPath(); c.arc(480 + px * 0.2, -280, 38, 0, TAU); c.stroke(); c.beginPath(); c.moveTo(480 + px * 0.2, -242); c.lineTo(480 + px * 0.2, -150); c.stroke(); // のこぎり？
        break;
      case 'box': // 壁紙の星
        c.fillStyle = 'rgba(255,255,255,.5)'; for (let i = 0; i < 26; i++) { const x = bl.l + 40 + i * 63 + px * 0.2, y = bl.t + 60 + ((i * 97) % 520); star(c, x, y, 9 + (i % 3) * 3, 5, 'rgba(255,255,255,.55)', 0); }
        break;
      case 'shelf': // 本の背
        for (let i = 0; i < 40; i++) { const x = bl.l - 150 + i * 44 + px * 0.25, h = 120 + (i * 53) % 90; c.fillStyle = ['#7b3b3b', '#3b5b7b', '#4b7b4b', '#8b6b2b', '#6b3b7b'][i % 5]; c.fillRect(x, 20 - h + 120, 36, h); c.fillStyle = 'rgba(255,255,255,.2)'; c.fillRect(x + 4, 20 - h + 140, 28, 3); }
        c.fillStyle = 'rgba(0,0,0,.25)'; c.fillRect(bl.l - 200, 130, 2000, 16);
        break;
      case 'track': // 山とまど
        c.fillStyle = 'rgba(80,120,90,.55)'; c.beginPath(); c.moveTo(bl.l - 100, 60); for (let i = 0; i <= 12; i++) c.lineTo(bl.l - 100 + i * 150 + px * 0.2, i % 2 ? -80 : -170); c.lineTo(bl.r + 300, 60); c.closePath(); c.fill();
        c.fillStyle = 'rgba(255,255,255,.55)'; for (let i = 0; i < 6; i++) { const x = bl.l + i * 300 + px * 0.5 + (R.t * 0.1 % 300), y = -380 + (i % 3) * 60; ell(c, x, y, 70, 22, 'rgba(255,255,255,.55)', 0); ell(c, x + 30, y - 16, 44, 18, 'rgba(255,255,255,.55)', 0); }
        break;
      case 'house': // 壁紙のしましま・まど
        c.fillStyle = 'rgba(255,255,255,.28)'; for (let x = bl.l - 200; x < bl.r + 200; x += 60) c.fillRect(x + px * 0.2, bl.t - 100, 26, 900);
        c.fillStyle = 'rgba(255,255,255,.5)'; box(c, 130, -330, 120, 130, 6, 'rgba(160,210,240,.6)', 4); c.strokeStyle = INK; c.beginPath(); c.moveTo(190, -330); c.lineTo(190, -200); c.moveTo(130, -265); c.lineTo(250, -265); c.stroke();
        break;
    }
    c.restore();
  }
  function drawSolid(c, s, th, S) {
    const w = s.x2 - s.x1, h = Math.min(s.y2 - s.y1, 700);
    c.save();
    // 側面
    c.fillStyle = th.side; c.fillRect(s.x1, s.y1, w, h);
    c.strokeStyle = th.line; c.lineWidth = 2; for (let y = s.y1 + 18; y < s.y1 + h; y += 22) { c.beginPath(); c.moveTo(s.x1, y); c.lineTo(s.x2, y); c.stroke(); }
    // 上の面
    const ty = 16; c.fillStyle = th.top; c.fillRect(s.x1, s.y1, w, ty);
    c.fillStyle = 'rgba(255,255,255,.28)'; c.fillRect(s.x1, s.y1, w, 4);
    c.lineWidth = 3; c.strokeStyle = INK; c.strokeRect(s.x1, s.y1, w, h);
    c.beginPath(); c.moveTo(s.x1, s.y1 + ty); c.lineTo(s.x2, s.y1 + ty); c.lineWidth = 2; c.stroke();
    if (S.theme === 'shelf') { c.fillStyle = 'rgba(0,0,0,.18)'; for (let i = 0; i < 5; i++) c.fillRect(s.x1 + 8 + i * 66, s.y1 + 28, 58, h - 40); c.fillStyle = '#c14b4b'; c.fillRect(s.x1 + 8, s.y1 + 28, 20, h - 40); }
    if (S.theme === 'box') { c.fillStyle = 'rgba(255,255,255,.7)'; c.font = 'bold 40px sans-serif'; c.textAlign = 'center'; c.fillText(w < 120 ? 'A' : 'B', (s.x1 + s.x2) / 2, s.y1 + 66); }
    if (S.theme === 'track') { c.fillStyle = '#3d3025'; for (let x = s.x1 + 14; x < s.x2; x += 36) c.fillRect(x, s.y1 + 20, 16, 30); c.fillStyle = '#9aa2aa'; c.fillRect(s.x1, s.y1 - 6, w, 7); c.strokeStyle = INK; c.lineWidth = 1.6; c.strokeRect(s.x1, s.y1 - 6, w, 7); }
    if (S.theme === 'bench') { c.fillStyle = 'rgba(0,0,0,.16)'; c.fillRect(s.x1 + 20, s.y1 + 36, 18, h - 36); c.fillRect(s.x2 - 38, s.y1 + 36, 18, h - 36); }
    c.restore();
  }
  function drawThin(c, t, th, S, i) {
    const w = t.x2 - t.x1, y = t.y;
    c.save();
    if (S.theme === 'track' && (S.thins[i] || {}).wrap) { // おもちゃ電車
      const dir = S.thins[i].wrap.sp > 0 ? 1 : -1, col = i === 1 ? '#e0453f' : '#3f7fd0', cx = (t.x1 + t.x2) / 2;
      box(c, t.x1, y - 6, w, 8, 2, '#3a3a3a');
      box(c, t.x1 + 4, y - 40, w - 8, 36, 6, col); box(c, t.x1 + 4, y - 40, w - 8, 9, 4, shade(col, 0.25), 1.8);
      for (let k = 0; k < 3; k++) box(c, t.x1 + 16 + k * ((w - 48) / 3 + 4), y - 32, (w - 48) / 3 - 4, 14, 3, '#cfeeff', 1.8);
      box(c, dir > 0 ? t.x2 - 30 : t.x1 + 4, y - 56, 26, 18, 4, shade(col, -0.2));
      for (let k = 0; k < 4; k++) circ(c, t.x1 + 22 + k * ((w - 44) / 3), y + 2, 8.5, '#555', 2.2);
      c.restore(); return;
    }
    const thick = 11;
    c.fillStyle = th.thin; c.fillRect(t.x1, y, w, thick); c.fillStyle = th.thinSide; c.fillRect(t.x1, y + thick - 4, w, 4);
    c.fillStyle = 'rgba(255,255,255,.35)'; c.fillRect(t.x1, y, w, 3);
    c.lineWidth = 2.6; c.strokeStyle = INK; c.strokeRect(t.x1, y, w, thick);
    if (S.theme === 'bench') { c.strokeStyle = 'rgba(0,0,0,.45)'; c.lineWidth = 1.6; for (let x = t.x1 + 8; x < t.x2; x += 12) { c.beginPath(); c.moveTo(x, y); c.lineTo(x, y + (((x - t.x1) / 12 | 0) % 3 ? 5 : 8)); c.stroke(); } }
    if (S.thins[i] && S.thins[i].mv) { c.strokeStyle = 'rgba(0,0,0,.4)'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(t.x1 + 10, y + thick); c.lineTo(t.x1 + 4, y + 26); c.moveTo(t.x2 - 10, y + thick); c.lineTo(t.x2 - 4, y + 26); c.stroke(); }
    c.restore();
  }

  // ------------------------------------------------------------------ キャラクター
  function poseOf(f, st) {
    const C = E.CH[f.ch], a = R.fl[f.i] || {};
    const P = { t: R.t + f.i * 7, ph: a.ph || 0, a: -1, tx: null, ty: null, run: f.s === 'free' && f.gr >= 0 && Math.abs(f.vx) > 0.6, air: f.gr < 0 && f.s !== 'ledge' && f.s !== 'getup', crouch: false, spin: false, buff: f.buff > 0 };
    let rot = 0, sx = 1, sy = 1, ox = 0, oy = 0, alpha = 1;
    switch (f.s) {
      case 'jsq': P.crouch = true; sy = 0.78; sx = 1.14; break;
      case 'lag': P.crouch = true; sy = 0.9; sx = 1.08; break;
      case 'free': if (f.gr < 0) { const k = clamp(f.vy / 12, -1, 1); sy = 1 + (k < 0 ? -k * 0.12 : k * 0.08); sx = 1 / sy; } break;
      case 'atk': {
        const m = E.MOVES[f.ch][f.mv];
        if (m) {
          const act = m.kind === 'counter' ? m.cf + m.cs : m.s;
          const fr = f.mf, bx = m.hb && m.hb[0] ? m.hb[0] : null;
          P.fx = m.fx; P.spin = m.fx === 'spin' && fr >= m.s && fr < m.s + m.a + 4;
          if (m.kind === 'tele' && fr >= 2 && fr < m.s) alpha = 0.12; // ワープ中は、ほとんど見えない
          if (m.kind === 'reflect' && fr >= m.s && fr < m.s + m.a) { sx = 1.06; }
          if (m.kind === 'spin') P.spin = true;
          if (bx) {
            const tt = m.a > 1 ? clamp((fr - m.s) / (m.a - 1), 0, 1) : 0;
            let hx = bx[0] + (bx[2] - bx[0]) * tt, hy = bx[1] + (bx[3] - bx[1]) * tt;
            if (m.kind === 'pound') { hx = 0; hy = 8; }
            if (fr < m.s) { P.a = fr / Math.max(1, m.s); const k = P.a; P.tx = lerp(-8, hx * 0.3, k * k); P.ty = lerp(bx[1] * 0.7, bx[1], k); sx = 1 + 0.05 * Math.sin(k * Math.PI); P.crouch = true; }
            else if (fr < m.s + m.a) { P.a = 0.5; P.tx = hx; P.ty = hy; sx = 1.1; sy = 0.96; }
            else { const k = clamp((fr - m.s - m.a) / Math.max(1, m.t - m.s - m.a), 0, 1); P.a = 0.8 + k * 0.2; P.tx = lerp(hx, 12, k); P.ty = lerp(hy, -C.h * 0.55, k); }
            if (m.bkb === undefined || !bx) P.a = P.a;
          } else if (m.kind === 'proj' || m.kind === 'buff' || m.kind === 'mine') {
            const k = clamp(fr / Math.max(1, m.t), 0, 1); P.a = k; P.tx = lerp(4, 30, Math.sin(k * Math.PI)); P.ty = -C.h * 0.55;
          }
          if (f.chg > 0 && fr === 3) { sx = 1.06; sy = 0.9; ox = Math.sin(R.t * 1.6) * 1.2; }
          if (m.kind === 'rise') { sy = 1.14; sx = 0.9; }
          if (m.kind === 'pound' && f.pf) { sy = 1.2; sx = 0.85; rot = 0; }
        }
        break;
      }
      case 'taunt': sy = 1 + 0.07 * Math.sin(f.sf * 0.5); sx = 1 / sy; rot = Math.sin(f.sf * 0.35) * 0.1; ox = Math.sin(f.sf * 0.5) * 1.5; break;
      case 'tech': alpha = 0.75; sy = 1.06; sx = 0.94; break;
      case 'hurt': rot = a.tumble || 0; sx = 1 + 0.04 * Math.sin(R.t); break;
      case 'down': rot = a.tumble || 1.45; oy = -2; break;
      case 'roll': rot = (f.thr > 0 ? 1 : -1) * f.sf * 0.45; oy = -C.h * 0.3; break;
      case 'spot': alpha = 0.45; break;
      case 'adodge': rot = (f.dvx >= 0 ? 1 : -1) * f.sf * 0.3; alpha = 0.8; oy = 0; break;
      case 'shield': P.crouch = true; sy = 0.9; sx = 1.06; break;
      case 'grab': P.a = 0.5; P.tx = 22; P.ty = -C.h * 0.55; break;
      case 'stun': rot = Math.sin(R.t * 0.4) * 0.25; sy = 0.9; break;
      case 'held': ox = Math.sin(R.t * 1.4) * 2; rot = 0.1; break;
      case 'ledge': P.air = false; rot = 0; break;
      case 'getup': P.air = false; break;
      case 'rez': break;
      default: break;
    }
    if (f.s === 'free' && f.gr >= 0 && !P.run) sy *= 1 + Math.sin(R.t * 0.08 + f.i) * 0.018;
    if (a.land > 0 && f.s !== 'hurt') { const k = a.land / 8; sy *= 1 - 0.2 * k; sx *= 1 + 0.18 * k; }
    sy *= 1 + (a.sq || 0) * -0.02; sx *= 1 - (a.sq || 0) * -0.016;
    P.rot = rot; P.sx = sx; P.sy = sy; P.ox = ox; P.oy = oy; P.alpha = alpha;
    return P;
  }
  function drawFighter(c, st, f, opt) {
    if (f.s === 'dead' || f.s === 'out') return;
    const C = E.CH[f.ch], P = poseOf(f, st), a = R.fl[f.i] || {};
    const face = Math.abs(a.face) < 0.15 ? (f.face || 1) : (a.face >= 0 ? 1 : -1);
    // 影
    const fb = E.floorBelow(st, f.x, f.y);
    if (fb != null && f.y - fb > -400 && f.s !== 'ledge') {
      const d = Math.max(0, fb - f.y), sc = clamp(1 - d / 360, 0.3, 1);
      c.fillStyle = 'rgba(0,0,0,' + (0.22 * sc) + ')'; c.beginPath(); c.ellipse(f.x, fb + 1, C.w * 0.6 * sc, 4 * sc, 0, 0, TAU); c.fill();
    }
    // 復活の台
    if (f.s === 'rez') {
      c.save(); c.translate(f.x, f.y); box(c, -44, 2, 88, 10, 4, '#ffd23f', 2.4); box(c, -40, 12, 80, 5, 2, '#d8a82a', 1.6); c.restore();
    }
    c.save();
    if (f.inv > 0 && f.inv % 4 < 2 && f.s !== 'dodge' && f.s !== 'roll' && f.s !== 'spot' && f.s !== 'adodge' && f.s !== 'ledge' && f.s !== 'getup') c.globalAlpha = 0.55;
    c.globalAlpha *= P.alpha;
    c.translate(f.x + P.ox, f.y + P.oy);
    if (f.s === 'hurt' || f.s === 'down' || f.s === 'roll' || f.s === 'adodge') { c.translate(0, -C.h * 0.45); c.rotate(P.rot); c.translate(0, C.h * 0.45); }
    else if (P.rot) c.rotate(P.rot);
    if (f.s === 'free' && f.gr >= 0 && Math.abs(f.vx) > 0.6) c.rotate(face * Math.min(0.12, Math.abs(f.vx) * 0.025));
    if (f.s === 'ledge') { c.translate(0, 0); }
    c.scale(face * P.sx, P.sy);
    const pl = palOf(f.ch, R.pal[f.i]);
    DRAW[f.ch](c, P, { col: pl.col, col2: pl.col2 });
    if (a.flashT > 0) { c.globalAlpha = 0.55 * a.flashT / 6; c.fillStyle = '#fff'; c.beginPath(); c.ellipse(0, -C.h * 0.5, C.w * 0.75, C.h * 0.55, 0, 0, TAU); c.fill(); c.globalAlpha = 1; }
    c.restore();
    // 攻撃エフェクト（軌跡）
    if (f.s === 'atk') drawSwoosh(c, st, f, C);
    // まもり
    if (f.s === 'atk' && E.MOVES[f.ch][f.mv] && E.MOVES[f.ch][f.mv].kind === 'reflect' && f.rfl) { c.save(); c.globalAlpha = 0.45; c.fillStyle = '#ffd23f'; c.beginPath(); c.ellipse(f.x + f.face * 30, f.y - C.h * 0.5, 22, C.h * 0.55, 0, 0, TAU); c.fill(); c.globalAlpha = 0.9; c.lineWidth = 2.4; c.strokeStyle = '#fff'; c.stroke(); c.restore(); }
    if (f.s === 'shield') {
      const r = (C.h * 0.55) * (0.55 + 0.45 * Math.max(0, f.shd) / 100);
      c.save(); c.globalAlpha = f.pst > 0 ? 0.8 : 0.5; c.fillStyle = f.pst > 0 ? '#ffffff' : '#7fd8ff'; c.beginPath(); c.arc(f.x, f.y - C.h * 0.5, r, 0, TAU); c.fill(); c.globalAlpha = 0.9; c.lineWidth = 2.4; c.strokeStyle = '#fff'; c.stroke(); c.restore();
    }
    if (f.s === 'stun') { for (let i = 0; i < 3; i++) { const an = R.t * 0.2 + i * TAU / 3; star(c, f.x + Math.cos(an) * 16, f.y - C.h - 8 + Math.sin(an) * 4, 6, 5, '#ffd23f', 1.4, an); } }
    if (f.s === 'ledge') { /* 縁につかまっている手 */ const S = E.STAGES[st.stage], L = S.ledges[f.lg]; if (L) circ(c, L.x - L.dir * 4, L.y + 3, 5, '#fff', 2); }
    if (f.buff > 0) { c.save(); c.globalAlpha = 0.35 + 0.15 * Math.sin(R.t * 0.3); c.strokeStyle = '#ffd23f'; c.lineWidth = 3; c.beginPath(); c.ellipse(f.x, f.y - C.h * 0.5, C.w * 0.8, C.h * 0.62, 0, 0, TAU); c.stroke(); c.restore(); }
    if (f.chg > 0 && f.s === 'atk' && f.mf === 3) { const k = f.chg / 45; c.save(); c.strokeStyle = 'rgba(255,255,255,' + (0.4 + 0.5 * k) + ')'; c.lineWidth = 2 + 3 * k; c.beginPath(); c.arc(f.x, f.y - C.h * 0.5, C.h * 0.5 + k * 16 + Math.sin(R.t * 0.8) * 2, 0, TAU); c.stroke(); c.restore(); }
  }
  function drawSwoosh(c, st, f, C) {
    const m = E.MOVES[f.ch][f.mv]; if (!m || !m.hb || !m.hb.length || m.kind === 'proj') return;
    const fr = f.mf; if (fr < m.s - 1 || fr > m.s + m.a + 3) return;
    const arr = m.kind === 'pound' ? (f.pf ? m.hb : m.land ? m.land.hb : m.hb) : m.hb;
    const k = clamp((fr - m.s + 1) / (m.a + 3), 0, 1);
    c.save(); c.globalAlpha = (1 - k) * 0.85; c.lineCap = 'round';
    for (const h of arr) {
      const x0 = f.x + f.face * h[0], y0 = f.y + h[1], x1 = f.x + f.face * h[2], y1 = f.y + h[3], r = h[4];
      if (m.fx === 'ring' || m.fx === 'spin' || m.fx === 'lid' || m.fx === 'body') { c.strokeStyle = '#fff'; c.lineWidth = 3; c.beginPath(); c.arc(x1, y1, r * (0.8 + k * 0.4), 0, TAU); c.stroke(); }
      else {
        // 三日月の軌跡
        const dx = x1 - x0, dy = y1 - y0, L = Math.hypot(dx, dy);
        c.strokeStyle = '#fff'; c.lineWidth = Math.max(4, r * 0.7);
        c.beginPath(); c.moveTo(x0 - dx * 0.4 - f.face * 6, y0 - dy * 0.4 + 8 * (1 - k)); c.quadraticCurveTo((x0 + x1) / 2, (y0 + y1) / 2 - r * 0.9, x1 + dx * 0.2 + f.face * r * 0.7, y1 + dy * 0.2); c.stroke();
        if (L < 1) { c.beginPath(); c.arc(x1, y1, r * 0.7, 0, TAU); c.stroke(); }
      }
    }
    c.restore();
  }
  function drawProj(c, p) {
    c.save(); c.translate(p.x, p.y);
    switch (p.k) {
      case 'gear': { c.rotate(R.t * 0.3); for (let i = 0; i < 8; i++) { c.rotate(TAU / 8); box(c, -2.4, -p.r - 3, 4.8, 6, 1, '#f3b441', 1.4); } circ(c, 0, 0, p.r, '#f3b441', 2.2); circ(c, 0, 0, p.r * 0.38, '#c9812a', 1.6); break; }
      case 'fist': { const d = p.vx >= 0 ? 1 : -1; c.scale(d, 1); limb(c, -p.r - 12, 0, -p.r, 0, 5, '#b9bdc6'); circ(c, 0, 0, p.r, '#d2d5dc', 2.6); for (let i = 0; i < 3; i++) limb(c, p.r * 0.3, -5 + i * 5, p.r * 0.8, -5 + i * 5, 2.6, '#bfc3cb'); break; }
      case 'cork': { const d = p.vx >= 0 ? 1 : -1; c.scale(d, 1); box(c, -9, -5, 18, 10, 4, '#d9a066', 2); box(c, -9, -5, 6, 10, 2, '#b88048', 1.4); limb(c, -24, 0, -10, 0, 1.6, 'rgba(255,255,255,.7)'); break; }
      case 'ball': { c.rotate(R.t * 0.2); circ(c, 0, 0, p.r, '#e0453f', 2.4); c.fillStyle = '#fff'; c.beginPath(); c.arc(0, 0, p.r, 0, Math.PI * 0.5); c.lineTo(0, 0); c.fill(); circ(c, -3, -3, 3, 'rgba(255,255,255,.6)', 0); break; }
      case 'mine': { const armed = p.t >= p.arm; ell(c, 0, 4, p.r, p.r * 0.55, '#4a4a4a', 2.4); ell(c, 0, 0, p.r * 0.8, p.r * 0.5, armed ? '#d0453f' : '#8a8a8a', 2); if (armed && Math.floor(R.t / 8) % 2) circ(c, 0, -2, 3, '#fff', 0); break; }
      case 'shuriken': { c.rotate(R.t * 0.6); star(c, 0, 0, p.r + 3, 4, '#d8dde3', 1.8, 0); circ(c, 0, 0, 2, '#444', 0); break; }
      case 'orb': { const g = c.createRadialGradient(0, 0, 1, 0, 0, p.r + 4); g.addColorStop(0, '#fff'); g.addColorStop(0.5, '#c8a8ff'); g.addColorStop(1, 'rgba(140,90,230,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, p.r + 4, 0, TAU); c.fill(); circ(c, 0, 0, p.r * 0.55, '#fff', 0); break; }
      case 'fire': { const d = p.vx >= 0 ? 1 : -1; c.scale(d, 1); poly(c, [-p.r * 1.7, 0, -p.r * 0.4, -p.r * 0.9, -p.r * 0.2, -p.r * 0.3], '#ff9a2a', 0); circ(c, 0, 0, p.r, '#ff7a2a', 2.4); circ(c, 2, -1, p.r * 0.6, '#ffd23f', 0); circ(c, 3, -1, p.r * 0.28, '#fff', 0); break; }
      case 'shell': { c.rotate(Math.atan2(p.vy, p.vx)); ell(c, 0, 0, p.r + 3, p.r * 0.7, '#6b6f60', 2.4); poly(c, [p.r + 2, -4, p.r + 10, 0, p.r + 2, 4], '#c9b27a', 1.8); box(c, -p.r, -3, 5, 6, 1, '#c9b27a', 1.2); break; }
      case 'note': { c.rotate(Math.sin(R.t * 0.2) * 0.3); ell(c, 0, 4, p.r * 0.7, p.r * 0.52, '#7fb069', 2.2, -0.4); limb(c, p.r * 0.55, 2, p.r * 0.55, -p.r * 1.3, 2.4, '#2a1d17'); poly(c, [p.r * 0.55, -p.r * 1.3, p.r * 1.3, -p.r * 0.8, p.r * 0.55, -p.r * 0.5], '#e8c07a', 1.6); break; }
      case 'flame': { const d = p.vx >= 0 ? 1 : -1, k = 1 - p.life / 22; c.scale(d, 1); for (let i = 0; i < 3; i++) { const r = p.r * (1.1 - i * 0.28) * (0.8 + 0.4 * Math.sin(R.t * 0.8 + i)); circ(c, -i * 4, 0, r, ['#e8452a', '#ff9a2a', '#ffe08a'][i], i === 0 ? 2 : 0); } break; }
      case 'dart': { const d = p.vx >= 0 ? 1 : -1; c.scale(d, 1); poly(c, [-10, -3, 4, -1.5, 9, 0, 4, 1.5, -10, 3], '#f4efe2', 1.8); poly(c, [-10, 0, -15, -5, -13, 0, -15, 5], '#f48fb1', 1.4); break; }
      case 'wave': { const d = p.vx >= 0 ? 1 : -1, k = p.t % 12 / 12; c.scale(d, 1); c.lineWidth = 3.4; for (let i = 0; i < 3; i++) { c.strokeStyle = 'rgba(255,255,255,' + (0.9 - i * 0.25) + ')'; c.beginPath(); c.arc(-i * 9, 0, p.r * (0.7 + i * 0.22), -1.1, 1.1); c.stroke(); } c.strokeStyle = INK; c.lineWidth = 1.2; c.beginPath(); c.arc(0, 0, p.r * 0.7, -1.1, 1.1); c.stroke(); break; }
      default: circ(c, 0, 0, p.r, '#fff', 2);
    }
    c.restore();
  }
  function drawParts(c) {
    for (const p of R.parts) {
      const k = p.life / p.max;
      c.save(); c.globalAlpha = clamp(k * 1.4, 0, 1);
      switch (p.k) {
        case 'dot': c.fillStyle = p.col; c.beginPath(); c.arc(p.x, p.y, p.size * (0.5 + 0.5 * k), 0, TAU); c.fill(); break;
        case 'ring': c.strokeStyle = p.col; c.lineWidth = 4 * k + 1; c.beginPath(); c.arc(p.x, p.y, p.size * (1.6 - k * 0.8), 0, TAU); c.stroke(); break;
        case 'spark': { c.translate(p.x, p.y); c.rotate(p.rot); const s = p.size * (0.4 + 0.6 * Math.sin(Math.min(1, (1 - k) * 2) * 1.57)); star(c, 0, 0, s, 4, p.col, 2, 0); break; }
        case 'star': star(c, p.x, p.y, p.size * (0.5 + k * 0.5), 5, p.col, 2, R.t * 0.2 + p.rot); break;
        case 'ray': c.translate(p.x, p.y); c.rotate(p.rot); { const L = p.size * (1 - k * 0.3); const g = c.createLinearGradient(0, 0, L, 0); g.addColorStop(0, 'rgba(255,255,255,.9)'); g.addColorStop(1, 'rgba(255,255,255,0)'); c.fillStyle = g; c.beginPath(); c.moveTo(0, -10 * k); c.lineTo(L, 0); c.lineTo(0, 10 * k); c.closePath(); c.fill(); } break;
      }
      c.restore();
    }
  }

  // ------------------------------------------------------------------ 画面
  function labelOf(f, st, opt) {
    if (opt.labels && opt.labels[f.i]) return opt.labels[f.i];
    return f.lvl ? 'CPU' : 'P' + (f.i + 1);
  }
  function frame(c, st, view, opt) {
    opt = opt || {};
    const W = view.W, H = view.H, dpr = view.dpr; R.W = W; R.H = H; R.dpr = dpr;
    { // HUD とヘッダーがおおう帯（カメラは、この帯の外に出ないように、みんなを入れる）
      const M = hudMetrics(view, st.fighters.length, opt), hd = opt.headerH || 0;
      if (opt.nohud) { R.safeT = hd; R.safeB = 0; } else if (M.top) { R.safeT = Math.max(hd, M.y + M.ph + 4); R.safeB = 0; } else { R.safeT = hd; R.safeB = Math.max(0, H - M.y + 4); }
    }
    const S = E.STAGES[st.stage], th = TH[S.theme], cam = R.cam;
    c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, W, H);
    const z = cam.z;
    let shx = 0, shy = 0; if (R.shake > 0.3 && !CFG.reduced) { shx = (Math.random() - 0.5) * R.shake * 2; shy = (Math.random() - 0.5) * R.shake * 2; }
    c.save();
    c.setTransform(dpr * z, 0, 0, dpr * z, (W / 2 - cam.x * z + shx) * dpr, (H / 2 - cam.y * z + shy) * dpr);
    // 背景
    const vx0 = cam.x - W / 2 / z - 40, vx1 = cam.x + W / 2 / z + 40, vy0 = cam.y - H / 2 / z - 40, vy1 = cam.y + H / 2 / z + 40;
    drawBack(c, st, view);
    // ブラストゾーンのふち
    const bl = S.blast;
    c.save(); c.strokeStyle = 'rgba(255,80,80,.35)'; c.lineWidth = 3; c.setLineDash([14, 12]); c.strokeRect(bl.l, bl.t, bl.r - bl.l, bl.b - bl.t); c.restore();
    for (const s of S.solids) drawSolid(c, s, th, S);
    for (let i = 0; i < st.th.length; i++) drawThin(c, st.th[i], th, S, i);
    for (const f of st.fighters) if (f.s !== 'atk' || true) drawFighter(c, st, f, opt);
    for (const p of st.pr) drawProj(c, p);
    drawParts(c);
    if (opt.boxes) {
      c.save(); c.lineWidth = 1.6;
      for (const f of st.fighters) { const C = E.CH[f.ch]; c.strokeStyle = 'rgba(80,160,255,.9)'; c.strokeRect(f.x - C.w / 2, f.y - C.h, C.w, C.h); const b = E.activeBoxes(st, f.i); if (b) { c.strokeStyle = 'rgba(255,60,60,.95)'; c.fillStyle = 'rgba(255,60,60,.25)'; for (const bx of b.boxes) { c.beginPath(); c.arc(bx.x, bx.y, bx.r, 0, TAU); c.fill(); c.stroke(); } } }
      c.restore();
    }
    c.restore();
    drawTags(c, st, view, opt, shx, shy);
    if (R.flash > 0) { c.setTransform(dpr, 0, 0, dpr, 0, 0); c.fillStyle = 'rgba(255,255,255,' + R.flash * 0.5 + ')'; c.fillRect(0, 0, W, H); }
    if (CFG.dark) { c.setTransform(dpr, 0, 0, dpr, 0, 0); }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (!opt.nohud) drawHud(c, st, view, opt);
    if (R.banner) { c.save(); c.font = '800 ' + Math.round(clamp(W / 14, 20, 48)) + 'px "Dela Gothic One",system-ui,sans-serif'; c.textAlign = 'center'; c.lineWidth = 6; c.strokeStyle = INK; c.strokeText(R.banner.text, W / 2, H * 0.3); c.fillStyle = '#ffd23f'; c.fillText(R.banner.text, W / 2, H * 0.3); c.restore(); }
  }
  function pctColor(p) { // 白 → きいろ → 赤 → こい赤
    const k = clamp(p / 220, 0, 1);
    if (k < 0.5) { const t = k / 0.5; return 'rgb(255,' + Math.round(255 - 40 * t) + ',' + Math.round(255 - 180 * t) + ')'; }
    const t = (k - 0.5) / 0.5; return 'rgb(255,' + Math.round(215 - 170 * t) + ',' + Math.round(75 - 40 * t) + ')';
  }
  // ---- 同じ画面で2〜4人：スロットごとの色＋形のしるし・名前・ダメージ%・残機。HUD は下の帯（タッチの横向きでは上の帯）。
  function glyph(c, kind, x, y, r, fill) {
    c.beginPath();
    if (kind === 'circle') c.arc(x, y, r, 0, TAU);
    else if (kind === 'square') { c.rect(x - r * 0.85, y - r * 0.85, r * 1.7, r * 1.7); }
    else if (kind === 'diamond') { c.moveTo(x, y - r * 1.15); c.lineTo(x + r * 1.05, y); c.lineTo(x, y + r * 1.15); c.lineTo(x - r * 1.05, y); c.closePath(); }
    else { c.moveTo(x, y - r * 1.05); c.lineTo(x + r * 1.1, y + r * 0.85); c.lineTo(x - r * 1.1, y + r * 0.85); c.closePath(); }
    c.fillStyle = fill; c.fill(); c.lineWidth = 1.6; c.lineJoin = 'round'; c.strokeStyle = INK; c.stroke();
  }
  function fitText(c, s, maxW) { if (c.measureText(s).width <= maxW) return s; while (s.length > 1 && c.measureText(s + '…').width > maxW) s = s.slice(0, -1); return s + '…'; }
  function pctText(c, f, x, y, px, align, scale) { // 数字だけ大きく、% は小さく。ふちどりで、どんな背景でも読める
    const n = String(Math.floor(f.pct)), big = px, sm = Math.round(px * 0.55);
    c.save(); c.translate(x, y); c.scale(scale, scale); c.textBaseline = 'alphabetic'; c.lineJoin = 'round';
    c.font = '800 ' + big + 'px "Dela Gothic One",system-ui,sans-serif'; const wn = c.measureText(n).width;
    c.font = '800 ' + sm + 'px "Dela Gothic One",system-ui,sans-serif'; const wp = c.measureText('%').width;
    const x0 = align === 'right' ? -(wn + wp) : 0;
    c.lineWidth = Math.max(3, px * 0.16); c.strokeStyle = INK; c.fillStyle = pctColor(f.pct);
    c.font = '800 ' + big + 'px "Dela Gothic One",system-ui,sans-serif'; c.textAlign = 'left'; c.strokeText(n, x0, 0); c.fillText(n, x0, 0);
    c.font = '800 ' + sm + 'px "Dela Gothic One",system-ui,sans-serif'; c.strokeText('%', x0 + wn + 1, 0); c.fillText('%', x0 + wn + 1, 0);
    c.restore();
  }
  function hudMetrics(view, n, opt) {
    const W = view.W, H = view.H, gap = 6;
    const iL = opt.hudInsetL != null ? opt.hudInsetL : (opt.hudInset || 0), iR = opt.hudInsetR != null ? opt.hudInsetR : (opt.hudInset || 0);
    const avail = W - iL - iR - 12;
    const pw = clamp((avail - gap * (n - 1)) / n, 56, 156);
    const small = pw < 104 || H < 430, ph = small ? 44 : 58, total = pw * n + gap * (n - 1);
    const top = opt.hudTop != null && opt.hudTop >= 0;
    return { pw, ph, small, gap, x0: iL + 6 + Math.max(0, (avail - total) / 2), y: top ? opt.hudTop : H - ph - (opt.hudBottom != null ? opt.hudBottom : 8), top, n };
  }
  function drawHud(c, st, view, opt) {
    const n = st.fighters.length, M = hudMetrics(view, n, opt), { pw, ph, small } = M;
    const fs0 = small ? 10 : 11.5;
    for (let i = 0; i < n; i++) {
      const f = st.fighters[i], C = E.CH[f.ch], x = M.x0 + i * (pw + M.gap), y = M.y, a = R.fl[i] || { hit: 0 };
      const pc = PCOL[i % 4], out = f.s === 'out', pl = palOf(f.ch, R.pal[i]), name = labelOf(f, st, opt);
      c.save(); c.globalAlpha = out ? 0.42 : 1;
      c.fillStyle = 'rgba(20,14,10,.72)'; rr(c, x, y, pw, ph, 11); c.fill(); c.lineWidth = 2.4; c.strokeStyle = pc; c.stroke();
      c.fillStyle = pc; c.globalAlpha = (out ? 0.42 : 1) * 0.9; rr(c, x + 3, y + 3, pw - 6, 4, 2); c.fill(); c.globalAlpha = out ? 0.42 : 1; // 上の細い帯＝スロットの色
      // 顔（おもちゃの色ちがい）
      const r = small ? 10.5 : 14, fx = x + 7 + r, fy = y + ph / 2 + 2;
      c.fillStyle = pl.col; c.beginPath(); c.arc(fx, fy, r, 0, TAU); c.fill(); c.lineWidth = 2; c.strokeStyle = INK; c.stroke();
      c.fillStyle = pl.col2; c.beginPath(); c.arc(fx, fy + r * 0.2, r * 0.5, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.font = '800 ' + (small ? 11 : 13) + 'px system-ui,sans-serif'; c.textAlign = 'center'; c.lineWidth = 3; c.strokeStyle = INK; const ini = C.short[CFG.en ? 'en' : 'ja'].slice(0, 1); c.strokeText(ini, fx, fy + r * 0.2 + 4.5); c.fillText(ini, fx, fy + r * 0.2 + 4.5);
      const tx = x + 7 + r * 2 + 6, tw = x + pw - 6 - tx;
      // 名前の行：形のしるし＋ラベル（＋おもちゃの名前）
      glyph(c, PSHAPE[i % 4], tx + 5, y + 16, 4.6, pc);
      c.font = '800 ' + fs0 + 'px system-ui,sans-serif'; c.textAlign = 'left'; c.fillStyle = '#fff';
      const nm = small ? name : name + ' · ' + C.short[CFG.en ? 'en' : 'ja'];
      c.fillText(fitText(c, nm, tw - 14 - (st.mode === 'time' && !st.sudden ? 26 : st.training ? 0 : small ? 24 : 0)), tx + 14, y + 19.5);
      // 残機（または時間制のスコア）
      if (st.mode === 'time' && !st.sudden) { c.fillStyle = '#fff'; c.font = '800 ' + fs0 + 'px system-ui,sans-serif'; c.textAlign = 'right'; c.fillText((st.sc[i] >= 0 ? '+' : '') + st.sc[i], x + pw - 7, y + 19.5); }
      else if (!st.training) {
        if (small) { // せまいカード：● の右に数字（残機）
          c.fillStyle = pl.col; c.beginPath(); c.arc(x + pw - 21, y + 15.5, 4, 0, TAU); c.fill(); c.lineWidth = 1.3; c.strokeStyle = INK; c.stroke();
          c.fillStyle = '#fff'; c.font = '800 ' + fs0 + 'px system-ui,sans-serif'; c.textAlign = 'left'; c.fillText('×' + f.stk, x + pw - 15, y + 19.5);
        } else {
          const mx = Math.min(f.stk, 5), pr = 3.4, py = y + ph - 9;
          for (let k = 0; k < mx; k++) { c.fillStyle = pl.col; c.beginPath(); c.arc(tx + 4 + k * (pr * 2 + 3), py, pr, 0, TAU); c.fill(); c.lineWidth = 1.2; c.strokeStyle = INK; c.stroke(); }
          if (f.stk > mx) { c.fillStyle = '#fff'; c.font = '700 10px system-ui'; c.textAlign = 'left'; c.fillText('+' + (f.stk - mx), tx + 4 + mx * (pr * 2 + 3) - 2, py + 3.5); }
        }
      }
      // ダメージ%（右下、大きく）
      if (out) { c.fillStyle = '#fff'; c.font = '800 ' + (small ? 14 : 18) + 'px system-ui,sans-serif'; c.textAlign = 'right'; c.fillText('OUT', x + pw - 8, y + ph - 9); }
      else pctText(c, f, x + pw - 7, y + ph - (small ? 8 : 9), small ? 20 : 27, 'right', 1 + a.hit * 0.03);
      c.restore();
    }
  }
  // 名前のしるし（頭の上。画面の大きさで描く＝ひいても小さくならない）と、画面の外にいる子の矢印
  function drawTags(c, st, view, opt, shx, shy) {
    const W = view.W, H = view.H, cam = R.cam, z = cam.z, n = st.fighters.length;
    const toX = x => W / 2 + (x - cam.x) * z + shx, toY = y => H / 2 + (y - cam.y) * z + shy;
    const sT = R.safeT || 0, sB = R.safeB || 0, m = 20, showPct = n >= 3 || W < 520;
    c.save(); c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0); c.lineJoin = 'round'; c.textAlign = 'center';
    for (const f of st.fighters) {
      if (f.s === 'dead' || f.s === 'out') continue;
      const C = E.CH[f.ch], pc = PCOL[f.i % 4], lb = labelOf(f, st, opt);
      const hx = toX(f.x), hy = toY(f.y - C.h - (C.tagY || 0)) - 6 - Math.max(0, (z - 0.7)) * 6;
      const inside = hx > -4 && hx < W + 4 && toY(f.y) > -4 && toY(f.y - C.h) < H + 4;
      if (inside) {
        c.font = '800 11px system-ui,sans-serif'; const tw = c.measureText(lb).width + 22, ty = Math.max(sT + 4, hy - (showPct ? 30 : 18));
        c.globalAlpha = 0.92; c.fillStyle = 'rgba(20,14,10,.7)'; rr(c, hx - tw / 2, ty, tw, 16, 8); c.fill(); c.lineWidth = 1.6; c.strokeStyle = pc; c.stroke(); c.globalAlpha = 1;
        glyph(c, PSHAPE[f.i % 4], hx - tw / 2 + 9, ty + 8, 4, pc);
        c.fillStyle = '#fff'; c.textAlign = 'left'; c.fillText(lb, hx - tw / 2 + 17, ty + 12); c.textAlign = 'center';
        if (showPct) { c.save(); c.translate(hx, ty + 30); c.font = '800 14px "Dela Gothic One",system-ui,sans-serif'; const t = Math.floor(f.pct) + '%'; c.lineWidth = 4; c.strokeStyle = INK; c.strokeText(t, 0, 0); c.fillStyle = pctColor(f.pct); c.fillText(t, 0, 0); c.restore(); }
        else { c.fillStyle = pc; c.beginPath(); c.moveTo(hx - 5, ty + 17); c.lineTo(hx + 5, ty + 17); c.lineTo(hx, ty + 23); c.closePath(); c.fill(); c.lineWidth = 1.4; c.strokeStyle = INK; c.stroke(); }
      } else {
        // 画面の外：ふちに丸い矢印（色・形・ダメージ）
        const sx = toX(f.x), sy = toY(f.y - C.h / 2), cx0 = W / 2, cy0 = (sT + (H - sB)) / 2;
        const dx = sx - cx0, dy = sy - cy0, ex = W / 2 - m, ey = (H - sT - sB) / 2 - m;
        const k = Math.min(Math.abs(dx) > 1e-3 ? ex / Math.abs(dx) : 1e9, Math.abs(dy) > 1e-3 ? ey / Math.abs(dy) : 1e9, 1);
        const bx = cx0 + dx * k, by = cy0 + dy * k, ang = Math.atan2(dy, dx);
        c.save(); c.translate(bx, by);
        c.fillStyle = pc; c.beginPath(); c.moveTo(Math.cos(ang) * 22, Math.sin(ang) * 22); c.lineTo(Math.cos(ang + 2.5) * 14, Math.sin(ang + 2.5) * 14); c.lineTo(Math.cos(ang - 2.5) * 14, Math.sin(ang - 2.5) * 14); c.closePath(); c.fill(); c.lineWidth = 1.8; c.strokeStyle = INK; c.stroke();
        c.fillStyle = 'rgba(20,14,10,.82)'; c.beginPath(); c.arc(0, 0, 14, 0, TAU); c.fill(); c.lineWidth = 2; c.strokeStyle = pc; c.stroke();
        glyph(c, PSHAPE[f.i % 4], 0, -2, 4.5, pc);
        c.font = '800 10px system-ui,sans-serif'; c.lineWidth = 3; c.strokeStyle = INK; c.fillStyle = pctColor(f.pct); const t = Math.floor(f.pct) + '%'; c.strokeText(t, 0, 10); c.fillText(t, 0, 10);
        c.restore();
      }
    }
    c.restore();
  }
  // 選ぶ画面の小さな絵（canvas にキャラを描く）
  function portrait(cv, ch, opt) {
    opt = opt || {}; const size = opt.size || 64, dpr = Math.min(2, root.devicePixelRatio || 1);
    cv.width = Math.round(size * dpr); cv.height = Math.round(size * dpr);
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0); c.clearRect(0, 0, size, size);
    const C = E.CH[ch]; if (!C) return;
    if (opt.locked) { c.fillStyle = 'rgba(120,120,120,.5)'; c.beginPath(); c.arc(size / 2, size / 2, size * 0.46, 0, TAU); c.fill(); c.fillStyle = '#fff'; c.font = '800 ' + size * 0.5 + 'px system-ui'; c.textAlign = 'center'; c.fillText('?', size / 2, size * 0.67); return; }
    const sc = size / (C.h + 24) * (opt.zoom || 1);
    c.save(); c.translate(size / 2, size * 0.94 - (opt.lift || 0)); c.scale(sc, sc);
    const pl = palOf(ch, opt.pal | 0);
    DRAW[ch](c, { t: opt.t || 0, ph: 0, a: -1, tx: null, ty: null, run: false, air: false, crouch: false, spin: false, buff: false }, { col: pl.col, col2: pl.col2 });
    c.restore();
  }
  // ステージの小さな絵
  function stagePreview(cv, id, opt) {
    opt = opt || {}; const w = opt.w || 140, h = opt.h || 80, dpr = Math.min(2, root.devicePixelRatio || 1);
    cv.width = Math.round(w * dpr); cv.height = Math.round(h * dpr);
    const c = cv.getContext('2d'); c.setTransform(dpr, 0, 0, dpr, 0, 0);
    if (id === 'random') { c.fillStyle = '#665'; c.fillRect(0, 0, w, h); c.fillStyle = '#fff'; c.font = '800 ' + h * 0.6 + 'px system-ui'; c.textAlign = 'center'; c.fillText('?', w / 2, h * 0.72); return; }
    const S = E.STAGES[id]; if (!S) return;
    const bl = S.blast, sc = Math.min(w / (bl.r - bl.l + 200), h / (bl.b - bl.t + 100)) ;
    const th = TH[S.theme], g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]); c.fillStyle = g; c.fillRect(0, 0, w, h);
    c.save(); c.translate(w / 2, h * 0.62); c.scale(sc, sc);
    const stt = { stage: id, th: [] }; for (let i = 0; i < S.thins.length; i++) { const p = E.thinAt(S.thins[i], 0); stt.th.push({ x1: p.x1, x2: p.x2, y: p.y }); }
    for (const s of S.solids) drawSolid(c, s, th, S); for (let i = 0; i < stt.th.length; i++) drawThin(c, stt.th[i], th, S, i);
    c.restore();
  }
  function setCfg(o) { Object.assign(CFG, o); }
  const API = {
    init(o) { E = o.E; CFG = Object.assign(CFG, o.cfg || {}); }, setCfg, reset, event, tick, frame, portrait, stagePreview, PCOL, R, DRAW,
    resize(W, H) { R.W = W; R.H = H; },
    setPal(arr) { R.pal = (arr || []).slice(); }, palOf, hudMetrics, PSHAPE, glyph,
    get cam() { return R.cam; },
    get shake() { return R.shake; }, get slow() { return R.slow; },
    busy() { return R.parts.length > 0 || R.shake > 0.3 || R.flash > 0; },
    drawPortraitMini: portrait,
  };
  root.BrawlArt = API;
})(typeof window !== 'undefined' ? window : globalThis);
