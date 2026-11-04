// あなぼこシティ：まちめぐり（実在の街をモチーフにした 10 ステージ）と、最初から選べる神奈川の4つの街（free）のデータ。
// まちめぐりの10都市の地図は手づくりのデフォルメ（縮尺・位置は正確ではありません）。神奈川の4つの街は OpenStreetMap の実データ（© OpenStreetMap contributors）。看板や建物に実在の会社名・ロゴは使いません。
// 座標: x = 東, z = 南（画面の上が北）, 1 = 1m。 部品: [形, 色, 色づけ(0/1), x, y, z, 幅, 高さ, 奥行, rx, ry, rz, 光(0/1/2/3)]
//   光: 1 = いつも光る看板, 2 = 夜に灯る窓, 3 = 点滅するネオン
(function () {
'use strict';
const R90 = Math.PI / 2, PI = Math.PI;
function P(g, c, x, y, z, sx, sy, sz, o) { o = o || {}; return [g, c, o.t ? 1 : 0, x, y, z, sx, sy, sz, o.rx || 0, o.ry || 0, o.rz || 0, o.g || 0]; }
// box / cylinder with the bottom at y0
const bx = (c, x, y0, z, w, h, d, o) => P('box', c, x, y0 + h / 2, z, w, h, d, o);
const cy = (c, x, y0, z, r, h, o, geo) => P(geo || 'cyl', c, x, y0 + h / 2, z, r * 2, h, r * 2, o);
const T1 = { t: 1 };
// a thin box from point a to point b (lattice members, legs, cables)
function seg(c, ax, ay, az, bx_, by, bz, th, o) {
  const dx = bx_ - ax, dy = by - ay, dz = bz - az, L = Math.hypot(dx, dy, dz);
  return P('box', c, (ax + bx_) / 2, (ay + by) / 2, (az + bz) / 2, th, L, th, Object.assign({}, o, { rx: Math.atan2(dz / L, dy / L), rz: -Math.asin(dx / L) }));
}
function bands(w, h, d, every, col, y0, g, x, z) {
  const p = [];
  for (let y = (y0 || 0) + every * 0.8; y < h - 1.2; y += every) p.push(P('box', col, x || 0, y, z || 0, w + 0.08, every * 0.42, d + 0.08, { g: g == null ? 2 : g }));
  return p;
}
// generic block with window bands (front = +z)
function block(w, h, d, o) {
  o = o || {};
  const p = [P('box', o.body || '#ffffff', 0, h / 2, 0, w, h, d, { t: o.body ? 0 : 1 })];
  p.push(...bands(w, h, d, o.every || 3.4, o.win || '#34465e', 0, o.wg));
  p.push(bx(o.roof || '#9aa3ad', 0, h, 0, w * 0.72, 0.6, d * 0.72));
  p.push(bx('#d6d9de', w * 0.2, h + 0.6, d * 0.15, w * 0.18, 1, d * 0.2));
  p.push(bx('#3a3f48', 0, 0, d / 2 + 0.03, Math.min(3, w * 0.3), 2.6, 0.08));
  return p;
}
// hipped temple roof: wide flat pyramid + a ridge prism
function roofH(c, x, y, z, w, d, h, ridge) {
  return [P('pyr', c, x, y + h / 2, z, w, h, d), P('tri', c, x, y + h * 0.55, z, (w - d) * 0.6 + (ridge || 1), h * 0.7, d * 0.42)];
}
function pagodaParts(body, roof, levels, base, lh, gold) {
  const p = [bx('#8a8478', 0, 0, 0, base * 1.15, 1.2, base * 1.15)];
  let y = 1.2;
  for (let i = 0; i < levels; i++) {
    const w = base * (1 - i * 0.085);
    p.push(bx(body, 0, y, 0, w * 0.62, lh * 0.72, w * 0.62));
    p.push(bx('#f0e6d0', 0, y + lh * 0.25, 0, w * 0.64, lh * 0.18, w * 0.64));
    p.push(P('pyr', roof, 0, y + lh * 0.72 + 0.45, 0, w * 1.18, 0.9, w * 1.18));
    p.push(bx(roof, 0, y + lh * 0.72, 0, w * 1.05, 0.25, w * 1.05));
    y += lh;
  }
  p.push(cy(gold || '#c9a43a', 0, y, 0, 0.35, lh * 2.2));
  for (let k = 0; k < 5; k++) p.push(cy(gold || '#c9a43a', 0, y + 0.6 + k * lh * 0.3, 0, 0.75 - k * 0.07, 0.18));
  return p;
}
function torii(c, w, h, th) {
  return [cy(c, -w * 0.38, 0, 0, th, h * 0.92), cy(c, w * 0.38, 0, 0, th, h * 0.92), bx('#2a2626', 0, h * 0.9, 0, w, h * 0.08, th * 2.4),
    bx(c, 0, h * 0.84, 0, w * 0.94, h * 0.07, th * 2.0), bx(c, 0, h * 0.68, 0, w * 0.86, h * 0.06, th * 1.4), bx(c, 0, h * 0.7, 0, th * 0.9, h * 0.16, th * 1.2)];
}
// four-legged lattice tower section (square, tapering)
function lattice(c, h0, h1, r0, r1, n, th, o) {
  const p = [], L = y => r0 + (r1 - r0) * (y - h0) / (h1 - h0);
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(seg(c, sx * r0, h0, sz * r0, sx * r1, h1, sz * r1, th * 1.6, o));
  let py = h0, pr = r0;
  for (let i = 1; i <= n; i++) {
    const y = h0 + (h1 - h0) * i / n, r = L(y);
    p.push(P('box', c, 0, y, r, 2 * r, th, th, o), P('box', c, 0, y, -r, 2 * r, th, th, o), P('box', c, r, y, 0, th, th, 2 * r, o), P('box', c, -r, y, 0, th, th, 2 * r, o));
    p.push(seg(c, -pr, py, pr, r, y, r, th * 0.8, o), seg(c, pr, py, -pr, -r, y, -r, th * 0.8, o), seg(c, pr, py, pr, r, y, -r, th * 0.8, o), seg(c, -pr, py, -pr, -r, y, r, th * 0.8, o));
    py = y; pr = r;
  }
  return p;
}
const TY = {};
const def = (n, o) => { TY[n] = o; return o; };

// ================================================================ generic city things
def('taxi', { s: 2.05, h: 1.8, val: 15, rs: 1, sh: [4.6, 2.3], pal: ['#2b2d36', '#f2c12e', '#2f8a5a', '#e8e8ea', '#30508f'], parts: [
  bx('#ffffff', 0, 0.26, 0, 4.0, 0.72, 1.8, T1), bx('#d8f0ff', -0.2, 0.98, 0, 2.2, 0.56, 1.62, { g: 2 }), bx('#ffffff', -0.2, 1.5, 0, 2.0, 0.08, 1.5, T1),
  bx('#fff2b0', -0.2, 1.58, 0, 0.5, 0.26, 0.3, { g: 1 }), P('cyl', '#222', 1.25, 0.36, 0, 0.72, 1.9, 0.72, { rx: R90 }), P('cyl', '#222', -1.25, 0.36, 0, 0.72, 1.9, 0.72, { rx: R90 }),
  bx('#fff6c8', 2.0, 0.6, 0, 0.04, 0.22, 1.4, { g: 2 })] });
def('carJ', { s: 2.05, h: 1.6, val: 15, rs: 1, sh: [4.6, 2.3], pal: ['#ff5d5d', '#4d9bff', '#f4f4f4', '#3fc28a', '#555c66', '#ffd84d', '#1e2a44'], parts: [
  bx('#ffffff', 0, 0.26, 0, 4.0, 0.72, 1.8, T1), bx('#d8f0ff', -0.25, 0.98, 0, 2.2, 0.6, 1.62, { g: 2 }), bx('#ffffff', -0.25, 1.5, 0, 2.0, 0.08, 1.5, T1),
  P('cyl', '#222', 1.25, 0.36, 0, 0.72, 1.9, 0.72, { rx: R90 }), P('cyl', '#222', -1.25, 0.36, 0, 0.72, 1.9, 0.72, { rx: R90 }), bx('#fff6c8', 2.0, 0.6, 0, 0.04, 0.22, 1.4, { g: 2 }),
  bx('#ff4040', -2.0, 0.6, 0, 0.04, 0.2, 1.4, { g: 1 })] });
def('truck', { s: 2.7, h: 3.2, val: 24, rs: 1, sh: [6.8, 2.6], pal: ['#f4f4f4', '#3f8fe0', '#ffb340', '#3fa36a'], parts: [
  bx('#ffffff', -0.9, 0.5, 0, 4.6, 2.6, 2.3, T1), bx('#e8eef4', 2.3, 0.5, 0, 1.8, 2.0, 2.2), bx('#cfefff', 3.1, 1.5, 0, 0.1, 0.8, 1.9, { g: 2 }),
  P('cyl', '#222', 2.2, 0.42, 0, 0.84, 2.3, 0.84, { rx: R90 }), P('cyl', '#222', -2.2, 0.42, 0, 0.84, 2.3, 0.84, { rx: R90 })] });
def('trainCar', { s: 4.6, h: 3.8, val: 50, rs: 1, sh: [11.4, 3.4], pal: ['#80c241'], parts: [
  bx('#d9dde3', 0, 0.5, 0, 10.6, 3.1, 3.0), bx('#ffffff', 0, 0.9, 0, 10.65, 0.8, 3.05, T1), bx('#ffffff', 0, 3.1, 0, 10.65, 0.3, 3.05, T1), bx('#2c3a4e', 0, 2.0, 0, 9.8, 0.85, 3.05, { g: 2 }),
  bx('#9aa1ab', 0, 3.6, 0, 9.6, 0.2, 2.4), bx('#3a3f48', 3.6, 0, 0, 2.2, 0.55, 2.2), bx('#3a3f48', -3.6, 0, 0, 2.2, 0.55, 2.2),
  bx('#2c3a4e', 5.32, 1.9, 0, 0.06, 1.2, 2.2, { g: 2 })] });
def('tram', { s: 3.8, h: 3.6, val: 36, rs: 1, sh: [9.2, 3], pal: ['#3f9a5a', '#d9573f'], parts: [
  bx('#f0efe6', 0, 0.4, 0, 8.4, 2.9, 2.5), bx('#ffffff', 0, 0.4, 0, 8.45, 1.0, 2.55, T1), bx('#2c3a4e', 0, 1.7, 0, 7.8, 0.9, 2.56, { g: 2 }),
  bx('#555', 0, 3.3, 0, 1.6, 0.25, 1.0), seg('#333', 0, 3.4, 0, 0.8, 4.4, 0, 0.08)] });
def('boat', { s: 2.0, h: 1.8, val: 14, rs: 1, sh: [4.8, 2.0], pal: ['#ffffff', '#ffd84d', '#4dc3ff', '#ff6b6b'], parts: [
  bx('#ffffff', 0, 0.0, 0, 3.6, 0.8, 1.8, T1), P('pyr', '#ffffff', 2.0, 0.4, 0, 0.9, 0.8, 1.2, { t: 1, rz: -R90 }), bx('#f4f6fa', -0.4, 0.8, 0, 1.6, 0.8, 1.3), bx('#cfefff', 0.42, 0.95, 0, 0.06, 0.5, 1.1, { g: 2 })] });
def('tourBoat', { s: 3.8, h: 2.8, val: 40, rs: 1, sh: [10.5, 3.2], pal: ['#ffffff', '#ffe27a', '#8fd0ff'], parts: [
  bx('#ffffff', 0, 0, 0, 9.4, 0.9, 3.0, T1), P('pyr', '#ffffff', 5.0, 0.45, 0, 1.2, 0.9, 2.1, { t: 1, rz: -R90 }), bx('#cfefff', -0.4, 0.9, 0, 7.4, 1.2, 2.6, { g: 2 }), bx('#3a4a5e', -0.4, 2.1, 0, 7.8, 0.25, 2.9)] });
def('yakata', { s: 3.8, h: 3.2, val: 42, rs: 1, sh: [10.5, 3.4], pal: ['#7a4c2e'], parts: [
  bx('#ffffff', 0, 0, 0, 9.4, 1.0, 3.0, T1), bx('#f4ead2', 0, 1.0, 0, 7.6, 1.3, 2.6, { g: 2 }), P('tri', '#3e3a38', 0, 2.75, 0, 8.2, 0.9, 3.2),
  ...[-3, -1.5, 0, 1.5, 3].map(x => P('sph', '#ff4a3a', x, 2.1, 1.45, 0.45, 0.6, 0.45, { g: 1 }))] });
def('ship', { s: 7.2, h: 11, val: 160, rs: 0, sh: [26, 7], pal: ['#ffffff'], parts: [
  bx('#1f2f4a', 0, 0, 0, 24, 2.6, 6.2), P('pyr', '#1f2f4a', 12.8, 1.3, 0, 2.2, 2.6, 4.4, { rz: -R90 }), bx('#ffffff', 0, 2.6, 0, 24.4, 0.6, 6.3, T1),
  bx('#f4f6fa', -1.5, 3.2, 0, 17, 2.4, 5.6), ...bands(17, 2.4, 5.6, 1.3, '#34465e', 3.2, 2, -1.5), bx('#f4f6fa', -2.5, 5.6, 0, 11, 2.2, 5.0), bx('#cfe3f2', 2.6, 7.8, 0, 2.6, 1.0, 4.0, { g: 2 }),
  cy('#e8413a', -4, 7.8, 0, 1.1, 2.8), cy('#1e2a44', -4, 10.4, 0, 1.15, 0.6)] });
def('yatai', { s: 1.7, h: 2.8, val: 12, rs: 1, sh: [3.6, 2.6], pal: ['#c43a2f', '#2f4f8f', '#d9a03f'], parts: [
  bx('#8a5a3b', 0, 0.3, 0, 2.8, 1.0, 1.6), bx('#e6d6b0', 0, 1.3, 0.2, 3.0, 0.1, 2.0), bx('#6b4a30', -1.35, 1.3, 0.9, 0.1, 1.3, 0.1), bx('#6b4a30', 1.35, 1.3, 0.9, 0.1, 1.3, 0.1),
  bx('#ffffff', 0, 2.55, 0.2, 3.2, 0.2, 2.4, T1), bx('#ffffff', 0, 1.95, 1.2, 3.0, 0.6, 0.04, T1), P('sph', '#ff5a3a', 1.1, 2.2, 1.3, 0.45, 0.6, 0.45, { g: 1 }),
  P('cyl', '#222', -1.1, 0.3, 0.85, 0.6, 0.1, 0.6, { rx: R90 }), P('cyl', '#222', 1.1, 0.3, 0.85, 0.6, 0.1, 0.6, { rx: R90 }),
  cy('#c98a4b', 0.6, 0, 1.6, 0.2, 0.6), cy('#c98a4b', -0.6, 0, 1.6, 0.2, 0.6), bx('#fff3c0', 0, 1.6, 0.2, 2.4, 0.3, 1.4, { g: 2 })] });
def('stall', { s: 1.6, h: 2.8, val: 10, rs: 1, sh: [3.2, 2.4], pal: ['#e94b4b', '#3f8fe0', '#2fb37b', '#ff9f43', '#b46bff'], parts: [
  bx('#fbf6ec', 0, 0, 0, 2.6, 1.1, 1.6), bx('#ffffff', 0, 2.2, 0.2, 3.0, 0.3, 2.2, T1), bx('#ffffff', 0, 1.8, 1.25, 3.0, 0.4, 0.1, T1),
  bx('#7a5235', -1.25, 1.1, 0, 0.1, 1.2, 0.1), bx('#7a5235', 1.25, 1.1, 0, 0.1, 1.2, 0.1), bx('#ffe27a', 0, 2.5, 0, 1.6, 0.5, 0.16, { g: 1 }), bx('#d9a03f', 0, 1.1, 0.3, 2.0, 0.12, 0.8)] });
def('chochin', { s: 0.42, h: 2.7, val: 2, rs: 1, sh: [0.7, 0.7], pal: ['#ff4a3a', '#ffffff', '#ffd84d'], parts: [
  cy('#5a4a40', 0, 0, 0, 0.07, 2.0), P('sph', '#ffffff', 0, 2.2, 0, 0.55, 0.75, 0.55, { t: 1, g: 1 }), bx('#2a2a2a', 0, 2.55, 0, 0.3, 0.08, 0.3), bx('#2a2a2a', 0, 1.8, 0, 0.3, 0.08, 0.3)] });
def('slamp', { s: 0.42, h: 4.3, val: 2, rs: 1, sh: [0.7, 0.7], pal: ['#ffffff'], parts: [
  cy('#5a6170', 0, 0, 0, 0.16, 0.24, null, 'cyl6'), cy('#5a6170', 0, 0, 0, 0.065, 4.1, null, 'cyl6'), bx('#5a6170', 0.35, 4.0, 0, 0.8, 0.08, 0.1), P('ico', '#fff3b0', 0.72, 3.95, 0, 0.4, 0.22, 0.4, { g: 2 })] });
def('sakura', { s: 1.1, h: 3.8, val: 5, rs: 0, sh: [2.6, 2.6], pal: ['#ffb7d0', '#ffc8dc', '#ff9fc2'], parts: [
  cy('#7a4f3b', 0, 0, 0, 0.17, 1.8), P('ico', '#ffffff', 0, 2.5, 0, 2.4, 1.8, 2.4, T1), P('ico', '#ffffff', 0.4, 3.2, 0.2, 1.4, 1.2, 1.4, T1)] });
def('maple', { s: 1.1, h: 3.6, val: 5, rs: 0, sh: [2.6, 2.6], pal: ['#e8503a', '#f08a2a', '#d23a3a', '#f2b23a'], parts: [
  cy('#6a4630', 0, 0, 0, 0.16, 1.7), P('ico', '#ffffff', 0, 2.4, 0, 2.3, 1.7, 2.3, T1), P('ico', '#ffffff', -0.35, 3.1, 0.15, 1.3, 1.1, 1.3, T1)] });
def('palm', { s: 1.2, h: 5.5, val: 6, rs: 0, sh: [2.8, 2.8], pal: ['#3fae5a', '#5fbf4a'], parts: [
  seg('#9a7350', 0, 0, 0, 0.5, 5, 0, 0.35), ...[0, 1.26, 2.5, 3.8, 5.0].map(a => P('box', '#ffffff', 0.5 + Math.cos(a) * 1.1, 5.0, Math.sin(a) * 1.1, 2.4, 0.12, 0.7, { t: 1, ry: -a, rz: -0.35 }))] });
def('snowPine', { s: 1.4, h: 5.2, val: 8, rs: 0, sh: [3, 3], pal: ['#2f6f5a', '#3a7a4e'], parts: [
  cy('#6a4630', 0, 0, 0, 0.18, 1.2), P('cone', '#ffffff', 0, 2.0, 0, 2.8, 2.2, 2.8, T1), P('cone', '#f4f8ff', 0, 2.5, 0, 2.2, 1.0, 2.2), P('cone', '#ffffff', 0, 3.3, 0, 2.1, 1.9, 2.1, T1),
  P('cone', '#f4f8ff', 0, 3.8, 0, 1.6, 0.9, 1.6), P('cone', '#ffffff', 0, 4.5, 0, 1.3, 1.5, 1.3, T1), P('cone', '#f4f8ff', 0, 4.95, 0, 0.8, 0.6, 0.8)] });
def('snowman', { s: 0.6, h: 1.9, val: 3, rs: 0, sh: [1.2, 1.2], pal: ['#e8413a', '#3f8fe0', '#2fb37b'], parts: [
  P('sph', '#f6f9ff', 0, 0.45, 0, 1.0, 0.9, 1.0), P('sph', '#f6f9ff', 0, 1.2, 0, 0.7, 0.7, 0.7), bx('#ffffff', 0, 0.86, 0, 0.75, 0.14, 0.75, T1),
  cy('#2b2b2b', 0, 1.5, 0, 0.22, 0.38), P('cone', '#ff8a2a', 0, 1.22, 0.38, 0.12, 0.3, 0.12, { rx: R90 }), P('ico', '#222', -0.12, 1.32, 0.3, 0.08, 0.08, 0.08), P('ico', '#222', 0.12, 1.32, 0.3, 0.08, 0.08, 0.08)] });
def('snowArt', { s: 3.3, h: 4.8, val: 40, rs: 0, sh: [6.5, 6.5], pal: ['#eaf4ff', '#f6fbff'], parts: [
  bx('#dfeaf5', 0, 0, 0, 5.6, 1.0, 5.6), P('sph', '#ffffff', 0, 2.4, 0, 3.6, 3.0, 3.0, T1), P('sph', '#ffffff', 1.6, 3.8, 0, 1.9, 1.8, 1.8, T1), P('sph', '#ffffff', 1.9, 4.6, -0.6, 0.6, 0.9, 0.5, T1), P('sph', '#ffffff', 1.9, 4.6, 0.6, 0.6, 0.9, 0.5, T1),
  P('ico', '#2b2b2b', 2.45, 3.95, -0.4, 0.2, 0.2, 0.2), P('ico', '#2b2b2b', 2.45, 3.95, 0.4, 0.2, 0.2, 0.2), P('sph', '#ffffff', -1.9, 2.0, 0, 1.0, 0.8, 1.0, T1)] });
def('kimono', { s: 0.35, h: 1.6, val: 2, rs: 1, sh: [0.8, 0.8], pal: ['#e85a7a', '#6b7fd8', '#f0a040', '#8a5ad9', '#3fa36a', '#d94a4a'], parts: [
  P('cyl6', '#ffffff', 0, 0.55, 0, 0.5, 1.1, 0.42, T1), bx('#ffd84d', 0, 0.9, 0, 0.52, 0.18, 0.44), P('ico', '#ffd6ad', 0, 1.38, 0, 0.38, 0.38, 0.38), P('ico', '#1e1a18', 0, 1.5, -0.03, 0.42, 0.26, 0.42)] });
def('personW', { s: 0.36, h: 1.7, val: 2, rs: 1, sh: [0.8, 0.8], pal: ['#e8413a', '#3f8fe0', '#2fb37b', '#ffb340', '#8a5ad9', '#f4f4f4'], parts: [
  P('cyl6', '#2a3346', 0, 0.42, 0, 0.36, 0.84, 0.3), P('cyl6', '#ffffff', 0, 1.1, 0, 0.56, 0.7, 0.44, T1), P('ico', '#ffd6ad', 0, 1.55, 0, 0.38, 0.38, 0.38), P('cone', '#ffffff', 0, 1.78, 0, 0.42, 0.34, 0.42, T1), bx('#e8e8e8', 0, 1.3, 0, 0.5, 0.12, 0.46)] });
def('rickshaw', { s: 0.95, h: 1.8, val: 6, rs: 1, sh: [2.4, 1.4], pal: ['#c43a2f', '#2b2b2b'], parts: [
  P('cyl', '#2a2a2a', -0.2, 0.6, 0, 1.2, 0.12, 1.2, { rx: R90 }), bx('#ffffff', -0.3, 0.8, 0, 0.9, 0.7, 1.1, T1), bx('#ffffff', -0.55, 1.3, 0, 0.3, 0.8, 1.1, T1), P('dome', '#2b2b2b', -0.4, 1.7, 0, 1.0, 0.6, 1.1),
  bx('#7a5235', 0.8, 0.75, 0.45, 1.6, 0.06, 0.06), bx('#7a5235', 0.8, 0.75, -0.45, 1.6, 0.06, 0.06), P('cyl6', '#2a3346', 1.5, 0.45, 0, 0.3, 0.9, 0.3), P('cyl6', '#2a2a2a', 1.5, 1.15, 0, 0.42, 0.6, 0.36), P('ico', '#ffd6ad', 1.5, 1.6, 0, 0.36, 0.36, 0.36)] });
def('stoneL', { s: 0.5, h: 1.7, val: 2, rs: 0, sh: [0.9, 0.9], pal: ['#9a958a'], parts: [
  bx('#9a958a', 0, 0, 0, 0.7, 0.25, 0.7), cy('#9a958a', 0, 0.25, 0, 0.13, 0.7), bx('#a8a398', 0, 0.95, 0, 0.55, 0.4, 0.55), bx('#fff1b0', 0, 1.05, 0, 0.3, 0.2, 0.56, { g: 2 }), P('pyr', '#8e897e', 0, 1.55, 0, 0.9, 0.35, 0.9)] });
def('toriiS', { s: 1.05, h: 3.2, val: 4, rs: 0, sh: [2.2, 0.8], pal: ['#e8452c'], parts: torii('#e8452c', 2.6, 3.2, 0.12) });
def('umbrella', { s: 0.9, h: 2.4, val: 3, rs: 0, sh: [2, 2], pal: ['#ff6b6b', '#4dc3ff', '#ffd84d', '#7be08a'], parts: [
  cy('#eeeeee', 0, 0, 0, 0.05, 2.2), P('cone', '#ffffff', 0, 2.25, 0, 2.2, 0.5, 2.2, T1), bx('#5b84b8', 0.9, 0, 0, 1.6, 0.06, 0.8)] });
def('flower', { s: 0.6, h: 0.8, val: 1, rs: 0, sh: [1.3, 1.3], pal: ['#ff6b8f', '#ffd84d', '#b98bff', '#ff9f43'], parts: [
  bx('#a0866a', 0, 0, 0, 1.2, 0.4, 1.2), P('ico', '#ffffff', 0, 0.55, 0, 1.0, 0.4, 1.0, T1), P('ico', '#5fae4a', 0.2, 0.48, 0.1, 0.6, 0.3, 0.6)] });
def('signA', { s: 0.4, h: 1.2, val: 1, rs: 1, sh: [0.8, 0.6], pal: ['#ffffff', '#ffd84d', '#ff6b6b'], parts: [
  bx('#ffffff', 0, 0, 0.12, 0.7, 1.1, 0.06, { t: 1, rx: -0.2, g: 1 }), bx('#ffffff', 0, 0, -0.12, 0.7, 1.1, 0.06, { t: 1, rx: 0.2 })] });
// raised railway deck (trains run on top at y = 6.1)
def('viaduct', { s: 4.4, h: 6.2, val: 36, rs: 0, sh: [10.5, 7], pal: ['#b8b2a6'], parts: [
  bx('#b8b2a6', 0, 5.0, 0, 10.4, 1.1, 7.2), bx('#8f8a80', 0, 5.0, 3.55, 10.4, 1.6, 0.2), bx('#8f8a80', 0, 5.0, -3.55, 10.4, 1.6, 0.2),
  bx('#a8a296', -3.8, 0, 0, 1.4, 5.0, 6.0), bx('#a8a296', 3.8, 0, 0, 1.4, 5.0, 6.0), bx('#6b5440', 0, 6.1, 1.6, 10.4, 0.06, 2.4), bx('#6b5440', 0, 6.1, -1.6, 10.4, 0.06, 2.4)] });
// shops & buildings
def('shop', { s: 2.5, h: 6.2, val: 24, rs: 0, sh: [5, 4.6], pal: ['#e94b4b', '#3f8fe0', '#2fb37b', '#ff9f43', '#8a5ad9', '#e0952f'], parts: [
  bx('#f6efe2', 0, 0, 0, 4.2, 5.6, 4), bx('#cfefff', 0, 0.2, 2.02, 3.4, 2.0, 0.04, { g: 2 }), bx('#ffffff', 0, 2.5, 2.25, 4.3, 0.35, 0.6, T1), bx('#ffffff', 0, 3.0, 2.04, 3.6, 0.8, 0.06, { t: 1, g: 1 }),
  bx('#34465e', 0, 4.2, 2.02, 3.4, 0.8, 0.04, { g: 2 }), bx('#9aa3ad', 0, 5.6, 0, 3.6, 0.4, 3.4)] });
def('shopN', { s: 2.6, h: 8.5, val: 30, rs: 0, sh: [5, 4.6], pal: ['#ff4fa0', '#4dfff0', '#ffd84d', '#ff6b3a', '#b46bff', '#5fe0b5'], parts: [
  bx('#3a3f52', 0, 0, 0, 4.2, 7.6, 4), bx('#cfefff', 0, 0.2, 2.02, 3.4, 2.2, 0.04, { g: 2 }), ...bands(4.2, 7.6, 4, 1.9, '#2c3a4e', 2.2),
  bx('#ffffff', 1.6, 2.6, 2.4, 0.7, 5.6, 0.25, { t: 1, g: 3 }), bx('#ffffff', -0.5, 2.6, 2.06, 2.4, 0.7, 0.05, { t: 1, g: 1 }), bx('#ffe27a', -0.6, 5.0, 2.06, 2.2, 0.6, 0.05, { g: 1 })] });
def('houseJ', { s: 3.0, h: 5.6, val: 30, rs: 0, sh: [6.2, 5.6], pal: ['#5a5f6a', '#6b4a3a', '#3e5a7a', '#7a6a5a'], parts: [
  bx('#f2ebdc', 0, 0, 0, 5.2, 3.4, 4.6), P('pyr', '#ffffff', 0, 4.3, 0, 6.2, 1.9, 5.6, T1), bx('#7a4c2e', 1.2, 0, 2.31, 0.9, 1.9, 0.05), bx('#bfe3ff', -1.2, 1.4, 2.31, 1.3, 0.9, 0.05, { g: 2 }), bx('#bfe3ff', 2.61, 1.6, 0, 0.05, 0.8, 1.2, { g: 2 })] });
def('houseS', { s: 3.0, h: 6.0, val: 30, rs: 0, sh: [6.2, 5.6], pal: ['#c4503a', '#3e5a7a', '#5a7a4a', '#7a6a5a'], parts: [
  bx('#f2ebdc', 0, 0, 0, 5.2, 3.4, 4.6), P('tri', '#ffffff', 0, 4.2, 0, 5.8, 1.8, 5.4, T1), P('tri', '#ffffff', 0, 4.45, 0, 5.9, 1.5, 5.0), bx('#bfe3ff', -1.2, 1.4, 2.31, 1.3, 0.9, 0.05, { g: 2 }), bx('#7a4c2e', 1.2, 0, 2.31, 0.9, 1.9, 0.05)] });
def('machiya', { s: 2.8, h: 5.4, val: 26, rs: 0, sh: [5.6, 5.2], pal: ['#5a3a26', '#4a2f20', '#6a4630'], parts: [
  bx('#ffffff', 0, 0, 0, 4.6, 2.6, 4.8, T1), bx('#e8dcc4', 0, 2.6, 0, 4.6, 1.6, 4.8), P('tri', '#4a4a50', 0, 4.65, 0, 5.2, 1.1, 5.2), bx('#4a4a50', 0, 2.4, 2.6, 5.2, 0.2, 0.9),
  ...[-1.8, -1.2, -0.6, 0, 0.6, 1.2, 1.8].map(x => bx('#3a2618', x, 0.2, 2.42, 0.12, 2.2, 0.06)), bx('#fff1c8', 0.9, 0.3, 2.41, 1.4, 1.6, 0.03, { g: 2 }), bx('#2a3a6a', -0.9, 1.4, 2.45, 1.2, 0.7, 0.04), bx('#3a2618', 0, 3.0, 2.42, 3.2, 0.7, 0.06)] });
def('nakamise', { s: 2.2, h: 4.4, val: 16, rs: 0, sh: [4.4, 4.2], pal: ['#e04030', '#d83a2a'], parts: [
  bx('#f4ead6', 0, 0, 0, 4, 2.8, 3.6), P('pyr', '#5a5458', 0, 3.4, 0, 4.6, 1.2, 4.4), bx('#ffffff', 0, 2.5, 1.85, 4.0, 0.5, 0.1, { t: 1 }), bx('#fff1c0', 0, 0.3, 1.82, 3.4, 1.9, 0.04, { g: 2 }),
  P('sph', '#ff4a3a', 1.6, 2.2, 2.0, 0.45, 0.6, 0.45, { g: 1 }), P('sph', '#ff4a3a', -1.6, 2.2, 2.0, 0.45, 0.6, 0.45, { g: 1 })] });
def('chukaShop', { s: 2.7, h: 8, val: 32, rs: 0, sh: [5.2, 4.8], pal: ['#d8322a', '#c42a24', '#e0402a'], parts: [
  bx('#ffffff', 0, 0, 0, 4.4, 6.8, 4.2, T1), bx('#ffe08a', 0, 0.2, 2.12, 3.6, 2.2, 0.04, { g: 2 }), bx('#2f7a4a', 0, 6.8, 0, 4.9, 0.5, 4.7), P('pyr', '#2f7a4a', 0, 7.5, 0, 4.4, 0.9, 4.2),
  bx('#ffd84d', 0, 3.0, 2.15, 3.2, 0.9, 0.06, { g: 1 }), bx('#ffd84d', 1.8, 3.8, 2.2, 0.5, 2.6, 0.2, { g: 3 }), P('sph', '#ff3a2a', -1.6, 2.6, 2.3, 0.5, 0.7, 0.5, { g: 1 })] });
def('apt', { s: 4.4, h: 13, val: 64, rs: 0, sh: [8.4, 7.4], pal: ['#e8e2d2', '#d9c9b0', '#c8d6e0', '#e6d0c0'], parts: [
  ...block(7.4, 12.4, 6.4, { every: 2.8 }), ...[2.2, 5, 7.8, 10.6].map(y => bx('#c9c3b6', 0, y, 3.3, 7.4, 0.15, 0.7))] });
def('office', { s: 5.2, h: 18, val: 90, rs: 0, sh: [10, 10], pal: ['#f0c9a6', '#a9c7e8', '#e8e2d2', '#c4e0b8', '#e6b8c8', '#d0d4da'], parts: block(8, 18, 8, { every: 3.5 }) });
def('officeT', { s: 6.4, h: 26, val: 140, rs: 0, sh: [12.4, 12.4], pal: ['#dfe6ee', '#f1d7b0', '#b9d3f0', '#c8ccd2'], parts: block(10.4, 26, 10.4, { every: 3.4 }) });
def('glassT', { s: 8.4, h: 40, val: 220, rs: 0, sh: [16, 16], pal: ['#7fa8d0', '#8fb8c8', '#9aa8c8', '#6f98b8'], parts: [
  ...block(13.4, 40, 13.4, { every: 2.6, win: '#2c3a52' }), ...[-6.7, 6.7].map(x => bx('#e8eef4', x, 0, 6.7, 0.4, 40, 0.4)), ...[-6.7, 6.7].map(x => bx('#e8eef4', x, 0, -6.7, 0.4, 40, 0.4))] });
def('neonB', { s: 4.6, h: 15, val: 80, rs: 0, sh: [9, 8.4], pal: ['#ff4fa0', '#4dfff0', '#ffd84d', '#ff6b3a', '#b46bff'], parts: [
  ...block(7.4, 14.4, 7, { body: '#4a4f62', every: 2.8, win: '#232c3c' }), bx('#ffffff', 2.6, 3, 3.75, 1.2, 10.5, 0.4, { t: 1, g: 3 }), bx('#ffffff', -1.2, 7.5, 3.56, 4.2, 2.4, 0.12, { t: 1, g: 1 }),
  bx('#ffe27a', -1.2, 3.6, 3.56, 4.2, 1.4, 0.12, { g: 3 }), bx('#4dfff0', -2.4, 11, 3.56, 2.4, 1.6, 0.12, { g: 1 })] });
def('screenB', { s: 5.0, h: 19, val: 95, rs: 0, sh: [9.6, 9], pal: ['#9aa8bc', '#b0b8c4', '#c4c0b8'], parts: [
  ...block(8, 18.4, 7.6, { every: 3, win: '#2c3a52' }), bx('#1a2030', 0, 8, 3.84, 7.0, 7.4, 0.16), bx('#6cc6ff', 0, 8.4, 3.94, 6.4, 6.6, 0.06, { g: 3 }), bx('#ff6bb0', -1.5, 10.0, 3.98, 2.6, 2.6, 0.04, { g: 1 })] });
def('templeS', { s: 4.0, h: 7, val: 60, rs: 0, sh: [8.4, 7.4], pal: ['#c43a2f'], parts: [
  bx('#8a8478', 0, 0, 0, 7.4, 0.8, 6.4), bx('#ffffff', 0, 0.8, 0, 5.6, 3.2, 4.6, T1), ...roofH('#4a4a50', 0, 4.0, 0, 8.6, 7.2, 2.8)] });
def('kura', { s: 3.2, h: 6.4, val: 34, rs: 0, sh: [6, 5], pal: ['#f4f0e6'], parts: [
  bx('#ffffff', 0, 0, 0, 5.2, 4.4, 4.2, T1), bx('#3a3a3a', 0, 0, 0, 5.25, 1.2, 4.25), P('tri', '#3a3a40', 0, 5.1, 0, 5.8, 1.6, 4.8), bx('#3a3a3a', 0, 2.4, 2.12, 1.0, 1.0, 0.06)] });
def('busJ', { s: 4.8, h: 3.4, val: 45, rs: 1, sh: [10.8, 3], pal: ['#3fa36a', '#4d9bff', '#ffb340', '#e8e8e8'], parts: [
  bx('#f4f4f4', 0, 0.35, 0, 10, 2.8, 2.5), bx('#ffffff', 0, 0.6, 0, 10.05, 0.9, 2.55, T1), bx('#2f3d52', 0.2, 1.9, 0, 9.4, 0.85, 2.54, { g: 2 }), bx('#f2f2f2', 0, 3.15, 0, 9.2, 0.14, 2.2),
  P('cyl', '#222', 3.3, 0.45, 0, 0.9, 2.6, 0.9, { rx: R90 }), P('cyl', '#222', -3.3, 0.45, 0, 0.9, 2.6, 0.9, { rx: R90 }), bx('#2f3d52', 5.01, 1.2, 0, 0.04, 1.4, 2.2, { g: 2 }), bx('#ffe27a', 5.03, 2.75, 0, 0.04, 0.4, 1.6, { g: 1 })] });

// ---------------------------------------------------------------- shared helpers for the maps
function shift(parts, dx, dy, dz, k) {
  k = k || 1;
  return parts.map(p => { const q = p.slice(); q[3] = p[3] * k + dx; q[4] = p[4] * k + dy; q[5] = p[5] * k + dz; q[6] *= k; q[7] *= k; q[8] *= k; return q; });
}
function offs(pts, d) {
  return pts.map((p, i) => {
    const a = pts[Math.max(0, i - 1)], b = pts[Math.min(pts.length - 1, i + 1)];
    const dx = b[0] - a[0], dz = b[1] - a[1], L = Math.hypot(dx, dz) || 1;
    return [p[0] + dz / L * d, p[1] - dx / L * d];
  });
}
// a street: road paint + lamps / trees / vending machines on the sidewalks + pedestrians + traffic
function street(B, pts, w, o) {
  o = o || {};
  B.road(pts, w, o);
  const e = w / 2 + (o.side == null ? 2 : o.side) - 0.7;
  if (o.lamp !== false) { B.along(pts, e, o.lampStep || 15, [o.lampT || 'slamp'], { need: 'any', start: 4 }); B.along(pts, -e, o.lampStep || 15, [o.lampT || 'slamp'], { need: 'any', start: 11 }); }
  if (o.trees) { B.along(pts, e - 0.4, o.treeStep || 11, o.trees, { need: 'any', start: 8 }); B.along(pts, -e + 0.4, o.treeStep || 11, o.trees, { need: 'any', start: 2 }); }
  if (o.stuff) { B.along(pts, e, o.stuffStep || 13, o.stuff, { need: 'any', start: 6, p: 0.8 }); B.along(pts, -e, o.stuffStep || 13, o.stuff, { need: 'any', start: 9, p: 0.8 }); }
  if (o.ppl) { B.walk(offs(pts, w / 2 + 1), Math.ceil(o.ppl / 2), { types: o.pplT, w: 1.2 }); B.walk(offs(pts, -w / 2 - 1), Math.floor(o.ppl / 2), { types: o.pplT, w: 1.2 }); }
  if (o.cars) B.cars(pts, o.cars, { types: o.carT, two: o.two, spd: o.spd, lane: o.lane || Math.min(3.2, w / 4), close: o.close });
}
const CAR_T = ['carJ', 'carJ', 'carJ', 'taxi', 'taxi', 'truck', 'carJ'];
const CITY_CAR = ['carJ', 'carJ', 'taxi', 'taxi', 'taxi', 'carJ', 'busJ', 'truck'];
const STUFF = ['vend', 'bike', 'trash', 'signA', 'vend', 'bike', 'cone', 'post'];

// ================================================================ 1. 渋谷
def('dogStatue', { s: 0.75, h: 2.4, val: 6, rs: 0, sh: [1.6, 1.6], pal: ['#7a6a50'], parts: [
  bx('#9a958a', 0, 0, 0, 1.3, 1.1, 1.0), bx('#8a8478', 0, 0, 0, 1.5, 0.25, 1.2),
  P('sph', '#6f6048', -0.1, 1.55, 0, 0.9, 0.75, 0.55), P('sph', '#6f6048', 0.35, 2.05, 0, 0.5, 0.5, 0.45), P('box', '#6f6048', 0.58, 1.95, 0, 0.32, 0.2, 0.26),
  P('cone', '#6f6048', 0.32, 2.36, 0.14, 0.12, 0.22, 0.1), P('cone', '#6f6048', 0.32, 2.36, -0.14, 0.12, 0.22, 0.1),
  bx('#6f6048', 0.3, 1.1, 0.16, 0.14, 0.5, 0.14), bx('#6f6048', 0.3, 1.1, -0.16, 0.14, 0.5, 0.14), P('sph', '#6f6048', -0.45, 1.25, 0, 0.6, 0.35, 0.5)] });
def('shibSta', { s: 9.2, h: 16, val: 260, rs: 0, sh: [30, 15], pal: ['#cfc8ba'], lm: '駅ビル', parts: [
  bx('#cfc8ba', 0, 0, 0, 30, 12.5, 14), ...bands(30, 12.5, 14, 3.2, '#3a4a60', 2), bx('#3a4a60', 0, 0, 7.05, 22, 3.6, 0.1, { g: 2 }),
  bx('#e8e4da', 0, 12.5, 0, 31, 0.8, 15), bx('#3f7fd0', -8, 8.6, 7.12, 6, 1.4, 0.1, { g: 1 }), bx('#bdb6a8', 9, 12.5, 0, 9, 4, 10), bx('#80c241', 0, 4.2, 7.1, 30, 0.35, 0.1, { g: 1 })] });
def('scrSq', { s: 12.4, h: 104, val: 640, rs: 0, sh: [22, 22], pal: ['#7f95b0'], lm: '駅の上の高層タワー', parts: [
  bx('#c8ccd2', 0, 0, 0, 22, 16, 22), ...bands(22, 16, 22, 3.2, '#3a4a60', 0),
  bx('#7f95b0', 0, 16, 0, 16.5, 76, 16.5), ...bands(16.5, 92, 16.5, 2.4, '#2c3a52', 16),
  ...[-6, -3, 0, 3, 6].map(x => bx('#e8eef4', x, 16, 8.3, 0.35, 76, 0.3)), ...[-6, -3, 0, 3, 6].map(z => bx('#e8eef4', 8.3, 16, z, 0.3, 76, 0.35)),
  ...[-6, -3, 0, 3, 6].map(x => bx('#e8eef4', x, 16, -8.3, 0.35, 76, 0.3)), ...[-6, -3, 0, 3, 6].map(z => bx('#e8eef4', -8.3, 16, z, 0.3, 76, 0.35)),
  bx('#9fb2c8', 0, 92, 0, 15, 6, 15), bx('#d8dde4', 0, 98, 0, 14, 0.8, 14), ...[-6.6, 6.6].map(x => bx('#d8dde4', x, 98.8, 0, 0.4, 3.2, 13.6)), ...[-6.6, 6.6].map(z => bx('#d8dde4', 0, 98.8, z, 13.6, 3.2, 0.4)),
  bx('#e8413a', 5, 101.5, 5, 0.5, 2.5, 0.5, { g: 3 })] });
def('hikarie', { s: 10.6, h: 84, val: 480, rs: 0, sh: [20, 18], pal: ['#e2e4e8'], lm: '白い高層ビル', parts: [
  bx('#cfd3d8', 0, 0, 0, 18.5, 12, 16.5), bx('#e6e8ec', 0, 12, 0, 19.5, 18, 17), ...bands(19.5, 30, 17, 3, '#3a4a60', 12), bx('#2c3a52', 0, 30, 0, 14, 6, 13, { g: 2 }),
  bx('#e2e4e8', 0, 36, 0, 16, 44, 14), ...bands(16, 80, 14, 2.6, '#3a4a60', 36), ...[-5, 0, 5].map(x => bx('#c0c6ce', x, 36, 7.05, 0.6, 44, 0.12)),
  bx('#d0d4da', 0, 80, 0, 13, 3.4, 11), bx('#e8413a', 0, 83.4, 0, 0.5, 1.4, 0.5, { g: 3 })] });
def('maru109', { s: 5.8, h: 28, val: 160, rs: 0, sh: [12, 12], pal: ['#d8dce2'], lm: 'まるいファッションビル', parts: [
  bx('#c4c8ce', 0, 0, -4.5, 8, 24, 9), cy('#d8dce2', 0, 0, 0.5, 5.2, 25.5, null, 'cyl16'), ...[4, 8, 12, 16, 20].map(y => cy('#9aa6b4', 0, y, 0.5, 5.25, 1.3, { g: 2 }, 'cyl16')),
  bx('#ffffff', 0, 3, 5.7, 2.2, 21, 0.4, { g: 1 }), bx('#e8413a', 0, 19, 5.95, 1.6, 4.4, 0.1, { g: 3 }), cy('#b8bec6', 0, 25.5, 0.5, 4.2, 1.6, null, 'cyl16'), bx('#2c3a52', 0, 0, 5.65, 5, 3, 0.1, { g: 2 })] });
def('qfront', { s: 6.4, h: 25, val: 150, rs: 0, sh: [13, 11], pal: ['#6f8fae'], lm: '大画面のビル', parts: [
  bx('#6f8fae', 0, 0, 0, 12, 24, 10), ...bands(12, 24, 10, 2.2, '#2c3a52', 0), bx('#1a2030', 0, 7.5, 5.05, 11, 10.5, 0.2), bx('#6cc6ff', 0, 8, 5.2, 10, 9.4, 0.06, { g: 3 }),
  bx('#ff6bb0', -2.5, 10.5, 5.25, 3.2, 3.4, 0.04, { g: 1 }), bx('#ffe27a', 2.5, 9.5, 5.25, 2.6, 1.2, 0.04, { g: 1 }), bx('#fff1c8', 0, 0, 5.06, 10, 3, 0.05, { g: 2 })] });

const shibuya = {
  id: 'shibuya', name: '渋谷', sub: 'スクランブル交差点と駅前の犬の像', desc: '斜めにも渡れる大きな交差点。駅前広場の犬の像から のみこみスタート！',
  ext: [-80, -62, 92, 60], start: [6, 18], time: 150, rivals: 0, diff: 0.3, stars: [18, 32, 50],
  pal: { sky: '#bfe2ff', hemi: ['#ffffff', '#8796a8', 0.66], sun: ['#fff1dc', 0.5, -0.5, 1, 0.35], ground: '#cfc8bb', outer: '#b9b2a4' },
  icon(g, w, h) {
    g.fillStyle = '#5c6472'; g.fillRect(0, 0, w, h); g.fillStyle = '#f4f1e8';
    for (let i = 0; i < 12; i++) { g.fillRect(w * 0.1 + i * w * 0.07, h * 0.1, w * 0.035, h * 0.18); g.fillRect(w * 0.1 + i * w * 0.07, h * 0.72, w * 0.035, h * 0.18); }
    g.save(); g.translate(w / 2, h / 2); g.rotate(0.6); for (let i = -6; i <= 6; i++) g.fillRect(i * w * 0.06, -h * 0.07, w * 0.03, h * 0.14); g.rotate(-1.2); for (let i = -6; i <= 6; i++) g.fillRect(i * w * 0.06, -h * 0.07, w * 0.03, h * 0.14); g.restore();
    g.fillStyle = '#ffd84d'; for (let i = 0; i < 14; i++) { g.beginPath(); g.arc(w * (0.15 + ((i * 37) % 70) / 100), h * (0.2 + ((i * 53) % 60) / 100), w * 0.018, 0, 7); g.fill(); }
  },
  build(B) {
    B.ground('#cfc8bb'); B.speck(-94, -76, 106, 74, 900, ['#c6bfb1', '#d6d0c4'], 0.8);
    // elevated railway bed (N-S) and the station plaza
    B.rect(26, -76, 38, 74, '#a8a296', 'r');
    B.rect(-4, 8, 22, 30, '#d9d0bf', 'r'); B.tiles(-4, 8, 22, 30, 1.5, '#cdbfa8', 0.08);
    const X = [-14, 4];
    const roadN = [[-14, 4], [-12, -30], [-8, -76]], roadS = [[-14, 4], [-14, 74]], roadE = [[-14, 4], [8, -2], [40, -4], [106, -6]];
    const roadW = [[-14, 4], [-38, 6]], dogen = [[-38, 6], [-60, 22], [-94, 36]], bunka = [[-38, 6], [-62, -2], [-94, -6]];
    const meiji = [[64, -76], [64, 74]], r246 = [[-14, 42], [106, 42]];
    street(B, meiji, 12, { cars: 10, trees: ['tree'], ppl: 10, stuff: STUFF, carT: CITY_CAR });
    street(B, r246, 14, { cars: 12, ppl: 10, carT: CITY_CAR });
    street(B, roadS, 12, { cars: 8, ppl: 14, stuff: STUFF, carT: CITY_CAR });
    street(B, roadN, 10, { cars: 8, ppl: 14, stuff: STUFF, carT: CITY_CAR });
    street(B, roadE, 10, { cars: 8, ppl: 12, stuff: STUFF, carT: CITY_CAR });
    street(B, roadW.concat(dogen.slice(1)), 10, { cars: 8, ppl: 14, stuff: STUFF, carT: CITY_CAR });
    street(B, bunka, 8, { cars: 6, ppl: 10, stuff: STUFF, carT: CITY_CAR });
    street(B, [[-12, -30], [-40, -36], [-94, -44]], 7, { cars: 4, ppl: 8, stuff: STUFF });
    street(B, [[-14, 24], [-50, 40], [-94, 52]], 7, { cars: 4, ppl: 8, stuff: STUFF });
    street(B, [[8, -2], [14, -40], [18, -76]], 7, { cars: 4, ppl: 8, stuff: STUFF });
    street(B, [[64, 14], [106, 14]], 7, { cars: 4, ppl: 6, stuff: STUFF });
    street(B, [[38, 56], [38, 74]], 6, { cars: 0, ppl: 4 });
    // Center-gai: a narrow pedestrian street lined with neon shops
    const cg = [[-22, -6], [-44, -18], [-94, -26]];
    B.road(cg, 6, { col: '#b9ae9c', side: 0, mid: false }); B.line(cg, 0.3, '#e9dcc0', null, { dash: [1, 1.5] });
    B.along(cg, 6.2, 5.6, ['shopN', 'shopN', 'shop', 'neonB'], { need: 'build' }); B.along(cg, -6.2, 5.6, ['shopN', 'shop', 'shopN', 'neonB'], { need: 'build' });
    B.along(cg, 2.4, 7, ['signA', 'chochin', 'vend', 'bike'], { need: 'any' }); B.along(cg, -2.4, 8, ['signA', 'vend', 'bike'], { need: 'any' });
    B.walk(cg, 34, { w: 4.5 });
    // the scramble crossing: one big square, four zebras around it and two diagonals
    B.rect(-27, -9, -1, 17, '#59606d', 'r');
    B.zebra(-21, -8.2, -7, -8.2, 3.6); B.zebra(-21, 16.2, -7, 16.2, 3.6); B.zebra(-26.2, -3, -26.2, 11, 3.6); B.zebra(-1.8, -3, -1.8, 11, 3.6);
    B.zebra(-24, -6, -4, 14, 3.4); B.zebra(-4, -6, -24, 14, 3.4);
    B.line([[-27, -9], [-1, -9], [-1, 17], [-27, 17]], 0.25, '#f4f1e8', null, { close: true, cap: 'butt' });
    B.crowd(-26, -8, -2, 16, 46); B.walk([[-24, -6], [-4, 14]], 14, { w: 3 }); B.walk([[-4, -6], [-24, 14]], 14, { w: 3 });
    // landmarks
    B.o('dogStatue', 2, 13, 0);
    B.o('shibSta', 33, 14, 0);
    B.o('scrSq', 36, -18, 0);
    B.o('hikarie', 80, -12, 0);
    B.o('maru109', -48, 7, R90);
    B.o('qfront', -27, -17, Math.PI / 4);
    B.o('screenB', -2, -16, -Math.PI / 4); B.o('screenB', -30, 23, 3 * Math.PI / 4);
    const green = B.o('trainCar', 13, 25.5, 0); green.col = '#5f9a4f';
    // plaza: trees, benches, crowds
    for (const [x, z] of [[-2, 26], [6, 27], [18, 11], [20, 27], [-3, 10]]) B.o('tree', x, z, 0);
    B.o('bench', 8, 11, 0); B.o('bench', 15, 15, R90); B.o('kiosk', -1, 20, R90); B.o('vend', 20, 19, -R90); B.o('vend', 20, 21, -R90);
    B.crowd(-3, 9, 21, 29, 30);
    // viaduct + trains on top (y = 6.1), two tracks
    for (let z = -70; z <= 70; z += 10.4) { if ((z > -30 && z < -6) || (z > 5 && z < 23)) continue; B.o('viaduct', 32, z, R90); }
    B.train([[30.4, 82], [30.4, -82]], { y: 6.15, cars: 5, col: '#80c241', spd: 11 });
    B.train([[33.6, -82], [33.6, 82]], { y: 6.15, cars: 5, col: '#80c241', spd: 11, p: 60 });
    // the rest of the town
    B.fill(-94, -76, 106, 74, ['office', 'neonB', 'shopN', 'officeT', 'shop', 'screenB', 'apt', 'shopN'], { step: 9.5, alt: ['shop', 'shopN'] });
    B.fill(-94, -76, 106, 74, ['shop', 'shopN', 'vend', 'tree'], { step: 5, p: 0.5 });
  },
};

// ================================================================ 2. 浅草
const VER = '#c8322a', ROOF = '#3e3e44';
def('kaminari', { s: 5.2, h: 12, val: 140, rs: 0, sh: [13, 6], pal: [VER], lm: '大ちょうちんの門', parts: [
  bx('#8a8478', 0, 0, 0, 12.6, 0.5, 5.6), ...[-4.9, 4.9].map(x => bx(VER, x, 0.5, 0, 2.8, 6.8, 4.2)), ...[-3.3, 3.3].map(x => cy(VER, x, 0.5, 2.1, 0.32, 6.8)), ...[-3.3, 3.3].map(x => cy(VER, x, 0.5, -2.1, 0.32, 6.8)),
  bx(VER, 0, 6.6, 0, 12.4, 0.9, 4.6), bx('#2a2a2e', 0, 7.5, 0, 14.4, 0.4, 7.4), ...roofH(ROOF, 0, 7.6, 0, 14, 7, 3.6, 2),
  P('cyl12', '#d42a1e', 0, 4.25, 0, 3.4, 3.7, 3.4, { g: 2 }), bx('#1e1e1e', 0, 2.25, 0, 2.8, 0.35, 2.8), bx('#1e1e1e', 0, 6.05, 0, 2.8, 0.35, 2.8), bx('#1e1e1e', 0, 3.4, 1.66, 1.1, 1.8, 0.05), bx('#1e1e1e', 0, 3.4, -1.66, 1.1, 1.8, 0.05)] });
def('hozomon', { s: 6.4, h: 21, val: 220, rs: 0, sh: [16, 8], pal: [VER], lm: '二階建ての門', parts: [
  bx('#8a8478', 0, 0, 0, 15, 0.6, 7.6), ...[-6, -2, 2, 6].map(x => cy(VER, x, 0.6, 2.8, 0.38, 7)), ...[-6, -2, 2, 6].map(x => cy(VER, x, 0.6, -2.8, 0.38, 7)),
  ...[-6.2, 6.2].map(x => bx(VER, x, 0.6, 0, 2.6, 7, 4.6)), bx(VER, 0, 7.4, 0, 15, 0.8, 6.6), ...roofH(ROOF, 0, 8.0, 0, 17, 9, 2.0, 2),
  bx(VER, 0, 10.0, 0, 12, 4.4, 5.4), ...[-4, 0, 4].map(x => bx('#f0e6d0', x, 11.0, 2.72, 2.4, 2.2, 0.05)), ...roofH(ROOF, 0, 14.4, 0, 16, 8.6, 5, 3),
  P('cyl12', '#d42a1e', 0, 4.4, 0, 2.6, 3.0, 2.6, { g: 2 }), bx('#1e1e1e', 0, 2.8, 0, 2.2, 0.3, 2.2), bx('#1e1e1e', 0, 5.8, 0, 2.2, 0.3, 2.2)] });
def('hondo', { s: 10.6, h: 26, val: 440, rs: 0, sh: [24, 21], pal: [VER], lm: '本堂', parts: [
  bx('#8a8478', 0, 0, 0, 24, 1.6, 20), bx('#9a958a', 0, 0, 11, 8, 1.0, 3), bx(VER, 0, 1.6, 0, 19, 9, 15), ...[-7.5, -4.5, -1.5, 1.5, 4.5, 7.5].map(x => cy(VER, x, 1.6, 8.2, 0.42, 8)),
  bx('#f4ead6', 0, 7.5, 7.6, 18, 2.4, 0.1), bx('#2a2a2e', 0, 10.4, 0, 25, 0.5, 21), ...roofH(ROOF, 0, 10.6, 0, 27, 22, 9, 6), P('tri', ROOF, 0, 15.5, 7.6, 7, 5, 6, { ry: R90 }),
  bx('#c9a43a', 0, 19.6, 0, 9, 0.6, 0.8), P('cyl12', '#d42a1e', 0, 4.6, 8.6, 2.2, 2.8, 2.2, { g: 2 })] });
def('pagodaA', { s: 6.6, h: 38, val: 280, rs: 0, sh: [12, 12], pal: [VER], lm: '五重塔', parts: pagodaParts(VER, ROOF, 5, 9.4, 6.0, '#c9a43a') });
def('skytree', { s: 13.0, h: 150, val: 1000, rs: 0, sh: [17, 17], pal: ['#e6eef6'], lm: 'とても高い電波塔', parts: (() => {
  const c = '#e3ebf4', p = [];
  for (let a = 0; a < 3; a++) {
    const t = a * 2.094 + 0.5;
    p.push(seg(c, Math.cos(t) * 8, 0, Math.sin(t) * 8, Math.cos(t) * 3.6, 46, Math.sin(t) * 3.6, 1.5));
    p.push(seg(c, Math.cos(t) * 8, 0, Math.sin(t) * 8, Math.cos(t + 2.094) * 3.6, 46, Math.sin(t + 2.094) * 3.6, 0.6));
    p.push(seg(c, Math.cos(t) * 8, 0, Math.sin(t) * 8, Math.cos(t - 2.094) * 3.6, 46, Math.sin(t - 2.094) * 3.6, 0.6));
  }
  p.push(P('frus', '#dbe5f0', 0, 40, 0, 9, 80, 9), cy(c, 0, 80, 0, 2.9, 30, null, 'cyl12'));
  for (let y = 8; y < 108; y += 9) { const r = y < 80 ? 4.5 - y / 80 * 1.8 + 0.2 : 3.1; p.push(P('ring', '#b8c8dc', 0, y, 0, r * 2.1, r * 2.1, 6, { rx: R90 })); }
  p.push(cy('#3a4a60', 0, 82, 0, 5.4, 5.5, { g: 2 }, 'cyl16'), cy('#f4f6fa', 0, 87.5, 0, 5.6, 0.7, null, 'cyl16'), cy('#f4f6fa', 0, 81.5, 0, 5.2, 0.6, null, 'cyl16'));
  p.push(cy(c, 0, 88, 0, 2.6, 18, null, 'cyl12'), cy('#3a4a60', 0, 106, 0, 3.8, 3.4, { g: 2 }, 'cyl16'), cy('#f4f6fa', 0, 109.4, 0, 3.9, 0.5, null, 'cyl16'));
  p.push(cy('#eef2f6', 0, 109.9, 0, 1.4, 26, null, 'cyl12'), cy('#d8dce2', 0, 136, 0, 0.6, 13), P('ico', '#ff4040', 0, 149.5, 0, 0.8, 0.8, 0.8, { g: 3 }));
  p.push(...[30, 55, 70].map(y => cy('#9fd0ff', 0, y, 0, 4.5 - y / 80 * 1.8 + 0.35, 1.2, { g: 1 }, 'cyl12')));
  return p;
})() });
def('goldFlame', { s: 6.0, h: 24, val: 160, rs: 0, sh: [12, 10], pal: ['#2a2a30'], lm: '金色オブジェのビル', parts: [
  bx('#2a2a30', 0, 0, 0, 11, 3, 9), P('box', '#2a2a30', 0, 7.5, 0, 9, 9, 8), P('pyr', '#2a2a30', 0, 13, 0, 9, 2, 8),
  P('sph', '#e8b830', 1.5, 16.5, 0, 9, 4.2, 4.2, { rz: 0.5, g: 1 }), P('sph', '#e8b830', 4.8, 18.8, 0, 3.6, 2.4, 2.4, { rz: 0.9, g: 1 })] });
def('goldTower', { s: 6.6, h: 32, val: 180, rs: 0, sh: [12, 11], pal: ['#d8a830'], parts: [
  bx('#d8a830', 0, 0, 0, 11, 27, 10), ...bands(11, 27, 10, 2.4, '#8a6a20', 0, 2), bx('#f8f8f4', 0, 27, 0, 11.4, 4.4, 10.4), P('sph', '#f8f8f4', 2, 31, 0, 6, 2, 6)] });
def('solamachi', { s: 7.4, h: 16, val: 200, rs: 0, sh: [34, 12], pal: ['#b8c4d0'], parts: [
  bx('#b8c4d0', 0, 0, 0, 32, 14, 11), ...bands(32, 14, 11, 3, '#2c3a52', 0), bx('#e8eef4', 0, 14, 0, 30, 1.2, 9)] });
def('redRail', { s: 0.7, h: 1.4, val: 2, rs: 0, sh: [2.4, 0.5], pal: [VER], parts: [bx(VER, 0, 0, 0, 2.4, 0.18, 0.18), bx(VER, 0, 1.0, 0, 2.4, 0.18, 0.18), bx(VER, -1.1, 0, 0, 0.2, 1.2, 0.2)] });
def('redArch', { s: 3.8, h: 7, val: 40, rs: 0, sh: [14, 3], pal: [VER], parts: (() => {
  const p = [];
  for (let i = 0; i < 8; i++) { const a0 = i / 8 * PI, a1 = (i + 1) / 8 * PI; p.push(seg(VER, -Math.cos(a0) * 7, Math.sin(a0) * 6, 0, -Math.cos(a1) * 7, Math.sin(a1) * 6, 0, 0.6)); }
  for (const x of [-4.5, -2, 0.5, 3]) p.push(bx(VER, x + 0.75, 0, 0, 0.15, 6 * Math.sqrt(Math.max(0, 1 - ((x + 0.75) / 7) ** 2)), 0.15));
  return p;
})() });
def('jokoro', { s: 1.0, h: 2.4, val: 6, rs: 0, sh: [2, 2], pal: ['#3a3630'], parts: [
  cy('#3a3630', 0, 0, 0, 0.9, 1.0, null, 'cyl12'), cy('#3a3630', 0, 1.0, 0, 0.4, 0.6), P('pyr', '#3a3630', 0, 1.9, 0, 1.6, 0.6, 1.6), P('sph', '#e8e8f0', 0.3, 2.2, 0.2, 0.6, 0.5, 0.6)] });

const asakusa = {
  id: 'asakusa', name: '浅草', sub: '大ちょうちんの門・五重塔・川向こうの電波塔', desc: '赤い門の大ちょうちんから、おみやげ通りを まっすぐお寺へ。川の向こうには とても高い電波塔がそびえる。',
  ext: [-80, -72, 124, 92], start: [-10, 82], time: 150, rivals: 1, diff: 0.32, stars: [16, 28, 42],
  pal: { sky: '#c4e4ff', hemi: ['#ffffff', '#8a90a0', 0.64], sun: ['#fff0d8', 0.52, -0.4, 1, 0.45], ground: '#d6cdb9', outer: '#c4bba6' },
  icon(g, w, h) {
    g.fillStyle = '#c4e4ff'; g.fillRect(0, 0, w, h); g.fillStyle = '#e3ebf4'; g.fillRect(w * 0.8, h * 0.05, w * 0.05, h * 0.95); g.fillRect(w * 0.77, h * 0.35, w * 0.11, h * 0.07);
    g.fillStyle = '#3e3e44'; g.beginPath(); g.moveTo(w * 0.1, h * 0.42); g.lineTo(w * 0.6, h * 0.42); g.lineTo(w * 0.52, h * 0.26); g.lineTo(w * 0.18, h * 0.26); g.fill();
    g.fillStyle = '#c8322a'; g.fillRect(w * 0.14, h * 0.42, w * 0.09, h * 0.5); g.fillRect(w * 0.47, h * 0.42, w * 0.09, h * 0.5);
    g.fillStyle = '#d42a1e'; g.beginPath(); g.ellipse(w * 0.35, h * 0.62, w * 0.1, h * 0.18, 0, 0, 7); g.fill(); g.fillStyle = '#1e1e1e'; g.fillRect(w * 0.27, h * 0.45, w * 0.16, h * 0.04); g.fillRect(w * 0.27, h * 0.77, w * 0.16, h * 0.04);
  },
  build(B) {
    B.ground('#d6cdb9'); B.speck(-94, -86, 138, 106, 700, ['#cdc3ae', '#ddd5c3'], 0.8);
    // the Sumida river with a park on the west bank
    B.poly([[30, -90], [58, -90], [62, 0], [60, 110], [26, 110], [28, 0]], '#5a9ec8', 'w');
    B.speck(30, -86, 58, 106, 250, ['#7ab8e0', '#4a8eb8'], 1.2);
    B.poly([[16, -90], [30, -90], [28, 0], [26, 110], [18, 110]], '#9ccf78', 'r'); B.line([[30, -90], [28, 0], [26, 110]], 0.8, '#b8b0a0'); B.line([[58, -90], [62, 0], [60, 110]], 0.8, '#b8b0a0');
    // the temple grounds (gravel) and the shopping street to it
    B.rect(-50, -64, 10, 12, '#e6dcc4', 'r'); B.tiles(-50, -64, 10, 12, 3, '#d8ccb0', 0.06);
    B.rect(-14, 12, -6, 70, '#c9b89a', 'r'); B.tiles(-14, 12, -6, 70, 1.2, '#b8a888', 0.06);
    // streets
    const kaminariDori = [[-94, 76], [136, 76]];
    street(B, kaminariDori, 11, { cars: 14, ppl: 18, stuff: ['chochin', 'vend', 'bike', 'signA'], carT: CAR_T });
    street(B, [[14, -86], [14, 106]], 10, { cars: 10, ppl: 12, trees: ['tree'], stuff: STUFF, carT: CAR_T });
    street(B, [[-94, -70], [136, -70]], 10, { cars: 10, ppl: 10, carT: CAR_T });
    street(B, [[-60, -86], [-60, 106]], 8, { cars: 6, ppl: 10, stuff: STUFF });
    street(B, [[-94, 40], [-14, 40]], 6, { col: '#bfb39c', side: 0, mid: false, lamp: false, ppl: 16, stuff: ['chochin', 'signA', 'vend'] });
    street(B, [[-94, 20], [-60, 20]], 6, { cars: 2, ppl: 6 });
    street(B, [[66, -86], [66, 106]], 8, { cars: 6, ppl: 8, stuff: STUFF });
    street(B, [[66, -10], [136, -10]], 10, { cars: 8, ppl: 10, trees: ['tree'] });
    street(B, [[118, -86], [118, 106]], 9, { cars: 6, ppl: 6 });
    street(B, [[66, 30], [136, 30]], 7, { cars: 4, ppl: 6, stuff: STUFF });
    // the red bridge across the river: red rails and arches
    for (let x = 30; x < 60; x += 2.5) { B.o('redRail', x, 69.6, 0); B.o('redRail', x, 82.4, 0); }
    B.line([[26, 70], [62, 70]], 0.6, VER); B.line([[26, 82], [62, 82]], 0.6, VER);
    for (const x of [36, 49]) { B.o('redArch', x, 70.4, 0); B.o('redArch', x, 81.6, 0); }
    B.road([[24, -40], [64, -40]], 9, { col: '#6a7480' }); B.cars([[14, -40], [66, -40]], 4, { types: CAR_T });
    // landmarks
    B.o('kaminari', -10, 68, 0);
    B.o('hozomon', -10, 6, 0);
    B.o('hondo', -10, -36, 0);
    B.o('pagodaA', -36, -12, 0);
    B.o('jokoro', -10, -16, 0);
    B.o('templeS', -38, -52, 0); B.o('templeS', 2, -54, 0);
    B.o('skytree', 98, -38, 0); B.o('solamachi', 98, -18, 0);
    B.o('goldFlame', 78, 60, 0); B.o('goldTower', 94, 60, 0);
    // Nakamise: two rows of little red shops facing the street, crowded
    B.along([[-10, 64], [-10, 14]], 6.4, 4.6, ['nakamise'], { need: 'build' }); B.along([[-10, 64], [-10, 14]], -6.4, 4.6, ['nakamise'], { need: 'build' });
    B.walk([[-10, 64], [-10, 12]], 40, { w: 5, types: ['person', 'person', 'kimono'] });
    B.crowd(-48, -62, 8, 10, 40, { types: ['person', 'kimono', 'person'] });
    for (const [x, z] of [[-40, -30], [-46, 0], [2, -20], [4, 0], [-28, -60], [6, -60], [-46, -40]]) B.o('pine', x, z, 0);
    for (let z = -28; z < 8; z += 7) { B.o('stoneL', -15.5, z, 0); B.o('stoneL', -4.5, z, 0); }
    B.walk([[-30, 76], [24, 76], [66, 76]], 6, { types: ['rickshaw'], w: 3, spd: 1.8 });
    // river park and boats (boats: only from the bank or the bridge)
    B.along([[22, -86], [21, 0], [21, 104]], 0, 7, ['sakura', 'sakura', 'tree', 'bench'], { need: 'any' });
    B.walk([[23, -86], [22, 104]], 14, { w: 2 });
    B.boats([[44, -100], [45, 0], [43, 120]], 3, { types: ['yakata', 'tourBoat'], mode: 'wrap', spd: 2.6 });
    // town
    B.fill(-94, -86, 26, 106, ['houseJ', 'shop', 'houseJ', 'apt', 'machiya', 'shop', 'office'], { step: 8, alt: ['shop', 'houseJ'] });
    B.fill(62, -86, 138, 106, ['apt', 'office', 'houseJ', 'shop', 'officeT', 'houseJ'], { step: 9, alt: ['shop', 'houseJ'] });
    B.fill(-94, -86, 138, 106, ['tree', 'vend', 'bike', 'shop'], { step: 5, p: 0.45 });
  },
};

// ================================================================ 3. 新宿
def('tocho', { s: 12.8, h: 106, val: 720, rs: 0, sh: [36, 22], pal: ['#bfc3ca'], lm: 'ツインタワーの庁舎', parts: (() => {
  const g = '#bfc3ca', d = '#3a4658', p = [bx(g, 0, 0, 0, 34, 42, 20), ...bands(34, 42, 20, 2.4, d, 0)];
  for (const x of [-8.6, 8.6]) {
    p.push(bx(g, x, 42, 0, 13, 44, 15), ...bands(13, 86, 15, 2.4, d, 42, 2, x), bx(g, x, 86, 0, 11, 12, 12.5), ...bands(11, 98, 12.5, 2.4, d, 86, 2, x));
    p.push(P('box', '#a8adb6', x, 101, 0, 8.6, 6, 8.6, { ry: PI / 4 }), bx('#d8dce2', x, 104, 0, 3, 2, 3));
    for (const z of [-7.55, 7.55]) for (const k of [-3.5, 0, 3.5]) p.push(bx('#9aa0aa', x + k, 42, z, 0.5, 44, 0.12));
  }
  p.push(bx('#d8dce2', 0, 38, 10.05, 30, 0.6, 0.1), bx('#2c3a52', 0, 0, 10.05, 10, 4, 0.1, { g: 2 }));
  return p;
})() });
def('cocoon', { s: 8.2, h: 78, val: 360, rs: 0, sh: [16, 16], pal: ['#3a5a80'], lm: 'まゆ型のビル', parts: (() => {
  const p = [];
  for (let i = 0; i < 14; i++) { const y = i * 5.4, t = (y + 2.7 - 34) / 38, r = Math.max(2.2, 7.8 * Math.sqrt(Math.max(0, 1 - t * t))); p.push(cy(i % 2 ? '#3a5a80' : '#41648c', 0, y, 0, r, 5.4, { g: i % 2 ? 2 : 0 }, 'cyl16')); }
  for (let k = 0; k < 6; k++) { const a = k / 6 * 2 * PI; p.push(seg('#eef2f8', Math.cos(a) * 6.5, 6, Math.sin(a) * 6.5, Math.cos(a + 1.4) * 5.6, 66, Math.sin(a + 1.4) * 5.6, 0.45)); p.push(seg('#eef2f8', Math.cos(a) * 6.5, 6, Math.sin(a) * 6.5, Math.cos(a - 1.4) * 5.6, 66, Math.sin(a - 1.4) * 5.6, 0.45)); }
  p.push(cy('#2c3a52', 0, 75.6, 0, 1.6, 2.4));
  return p;
})() });
def('docomo', { s: 10.0, h: 100, val: 480, rs: 0, sh: [18, 16], pal: ['#bdb4a6'], lm: '時計塔のビル', parts: [
  bx('#bdb4a6', 0, 0, 0, 17, 58, 15), ...bands(17, 58, 15, 2.6, '#3a4658', 0), bx('#b2a99a', 0, 58, 0, 12.5, 14, 11.5), ...bands(12.5, 72, 11.5, 2.6, '#3a4658', 58),
  bx('#a89f90', 0, 72, 0, 8.5, 10, 8.5), ...[[0, 4.3, 1], [4.3, 0, 0], [0, -4.3, 1], [-4.3, 0, 0]].map(([x, z, f]) => P('cyl12', '#f4f4ee', x, 77, z, 5, 0.3, 5, f ? { rx: R90, g: 2 } : { rz: R90, g: 2 })),
  ...[[0, 4.46], [0, -4.46]].map(([x, z]) => bx('#2a2a2a', x, 77, z, 0.25, 2.0, 0.1)), P('pyr', '#9a917f', 0, 85, 0, 7, 6, 7), cy('#d8dce2', 0, 88, 0, 0.35, 12), P('ico', '#ff4040', 0, 100, 0, 0.7, 0.7, 0.7, { g: 3 })] });
def('triTower', { s: 9.2, h: 72, val: 340, rs: 0, sh: [18, 18], pal: ['#c4c8cc'], lm: '三角のビル', parts: [
  P('cyl3', '#c4c8cc', 0, 35, 0, 19, 70, 19), ...[...Array(26)].map((_, i) => P('cyl3', '#3a4658', 0, 2.5 + i * 2.6, 0, 19.15, 1.0, 19.15, { g: 2 })), P('cyl3', '#9aa0a8', 0, 70.5, 0, 14, 1.4, 14)] });
def('keioP', { s: 9.0, h: 66, val: 320, rs: 0, sh: [22, 9], pal: ['#ecebe6'], parts: [
  bx('#ecebe6', 0, 0, 0, 21, 64, 8), ...[-9, -6, -3, 0, 3, 6, 9].map(x => bx('#5a6474', x, 1, 4.02, 1.1, 62, 0.06, { g: 2 })), bx('#c8ccd0', 0, 64, 0, 18, 1.6, 6)] });
def('shinjukuSta', { s: 9.6, h: 14, val: 290, rs: 0, sh: [34, 18], pal: ['#d0cabe'], lm: '駅ビル', parts: [
  bx('#d0cabe', 0, 0, 0, 34, 11, 17), ...bands(34, 11, 17, 3, '#3a4a60', 0), bx('#e4ded2', 0, 11, 0, 30, 3, 13), bx('#3f7fd0', -10, 7.5, 8.6, 7, 1.3, 0.1, { g: 1 }), bx('#e85a2a', 10, 7.5, 8.6, 7, 1.3, 0.1, { g: 1 })] });
def('kabukiGate', { s: 3.2, h: 8.4, val: 40, rs: 0, sh: [10, 1.6], pal: ['#e8302a'], lm: '赤い看板の門', parts: [
  cy('#5a5f6a', -4.4, 0, 0, 0.25, 6.6), cy('#5a5f6a', 4.4, 0, 0, 0.25, 6.6), bx('#e8302a', 0, 5.6, 0, 9.4, 2.4, 0.5, { g: 3 }), bx('#fff2c0', 0, 6.2, 0.27, 7.4, 1.0, 0.04, { g: 1 }), bx('#e8302a', 0, 5.4, 0, 9.6, 0.2, 0.6)] });

const shinjuku = {
  id: 'shinjuku', name: '新宿', sub: 'ツインタワーの庁舎・線路だらけの駅・ネオン街', desc: '西は超高層ビルの林、東はネオンの路地。たくさんの線路が 街のまん中を南北につらぬく。',
  ext: [-116, -88, 116, 88], start: [26, 4], time: 140, rivals: 2, diff: 0.42, stars: [15, 26, 40],
  pal: { sky: '#c0dcf4', hemi: ['#ffffff', '#8a92a2', 0.62], sun: ['#fff4e4', 0.5, -0.6, 1, 0.3], ground: '#ccc6ba', outer: '#bcb6aa' },
  icon(g, w, h) {
    g.fillStyle = '#c0dcf4'; g.fillRect(0, 0, w, h); g.fillStyle = '#9aa0aa';
    g.fillRect(w * 0.18, h * 0.3, w * 0.64, h * 0.7); g.fillStyle = '#bfc3ca'; g.fillRect(w * 0.2, h * 0.12, w * 0.24, h * 0.88); g.fillRect(w * 0.56, h * 0.12, w * 0.24, h * 0.88);
    g.fillStyle = '#a8adb6'; for (const x of [0.32, 0.68]) { g.save(); g.translate(w * x, h * 0.12); g.rotate(PI / 4); g.fillRect(-w * 0.06, -w * 0.06, w * 0.12, w * 0.12); g.restore(); }
    g.fillStyle = '#3a4658'; for (let y = 0.2; y < 1; y += 0.07) { g.fillRect(w * 0.2, h * y, w * 0.24, h * 0.025); g.fillRect(w * 0.56, h * y, w * 0.24, h * 0.025); }
  },
  build(B) {
    B.ground('#ccc6ba'); B.speck(-130, -102, 130, 102, 900, ['#c4beb2', '#d6d0c4'], 0.8);
    // many railway lines through the middle
    B.rect(-15, -102, 15, 102, '#8c8478', 'r');
    for (const x of [-11, -6.6, -2.2, 2.2, 6.6, 11]) B.rail([[x, -102], [x, 102]], { w: 3.6, flag: null });
    // west: skyscraper district
    for (const x of [-22, -52, -90]) street(B, [[x, -102], [x, 102]], 10, { cars: 8, ppl: 8, trees: ['tree'], carT: CITY_CAR });
    for (const z of [-60, -25, 15, 55]) street(B, [[-130, z], [-15, z]], 10, { cars: 8, ppl: 8, trees: ['tree'], carT: CITY_CAR });
    B.rect(-116, -20, -95, 50, '#8fc46a', 'r'); B.speck(-116, -20, -95, 50, 120, ['#7fb85a', '#9fd07a'], 1);
    // east: department stores, neon alleys
    street(B, [[15, -30], [130, -30]], 12, { cars: 12, ppl: 16, stuff: STUFF, carT: CITY_CAR });
    street(B, [[15, 10], [130, 10]], 12, { cars: 12, ppl: 18, stuff: STUFF, carT: CITY_CAR });
    street(B, [[62, -102], [62, 102]], 12, { cars: 10, ppl: 12, trees: ['tree'], carT: CITY_CAR });
    street(B, [[-130, 40], [130, 40]], 14, { cars: 14, ppl: 14, carT: CITY_CAR });
    street(B, [[20, -102], [20, 40]], 8, { cars: 6, ppl: 12, stuff: STUFF });
    street(B, [[94, -102], [94, 10]], 8, { cars: 4, ppl: 8 });
    // Kabukicho: a dense grid of narrow neon alleys north of the big street
    for (const x of [32, 46, 76, 86]) { B.road([[x, -90], [x, -34]], 4, { col: '#6a6470', side: 0.6, mid: false }); B.walk([[x, -88], [x, -34]], 6, { w: 2 }); B.along([[x, -88], [x, -34]], 1.7, 9, ['chochin', 'signA'], { need: 'any' }); }
    for (const z of [-48, -64, -78]) { B.road([[24, z], [92, z]], 4, { col: '#6a6470', side: 0.6, mid: false }); B.walk([[24, z], [92, z]], 6, { w: 2 }); }
    B.o('kabukiGate', 40, -37, 0);
    B.fill(24, -88, 92, -36, ['shopN', 'shopN', 'shopN', 'neonB'], { step: 5.2, jit: 0.3, alt: ['shopN', 'stall'] });
    // a lantern alley just north-west of the station
    B.road([[-19, -54], [-19, -28]], 3, { col: '#7a6a5a', side: 0, mid: false });
    B.along([[-19, -54], [-19, -28]], 2.2, 3, ['yatai', 'chochin', 'stall'], { need: 'any' }); B.walk([[-19, -54], [-19, -28]], 10, { w: 1.6 });
    // landmarks
    B.o('shinjukuSta', 0, 18, 0);
    B.o('tocho', -71, -5, 0);
    B.o('cocoon', -36, 28, 0);
    B.o('triTower', -36, -42, 0);
    B.o('keioP', -36, -6, 0);
    B.o('docomo', 44, 64, 0);
    B.o('glassT', -71, 34, 0); B.o('glassT', -71, -42, 0); B.o('officeT', -71, 72, 0); B.o('glassT', -36, 72, 0); B.o('glassT', -71, -78, 0);
    B.o('screenB', 28, -6, -R90 / 2);
    // trains on six tracks
    const cols = ['#80c241', '#f08a24', '#f6c018', '#e0402a', '#3f9a5a', '#2f80d0'];
    [-11, -6.6, -2.2, 2.2, 6.6, 11].forEach((x, k) => B.train([[x, k % 2 ? 110 : -110], [x, k % 2 ? -110 : 110]], { cars: 5, col: cols[k], spd: 9 + k * 0.6, p: k * 37 }));
    // a big park in the south-east with ponds and trees
    B.rect(70, 48, 116, 88, '#8fc46a', 'r'); B.speck(70, 48, 116, 88, 200, ['#7fb85a', '#9fd07a'], 1);
    B.ell(92, 66, 12, 6, 0.3, '#5a9ec8', 'w'); B.ell(104, 80, 7, 4, -0.2, '#5a9ec8', 'w');
    B.fill(70, 48, 116, 88, ['tree', 'sakura', 'pine', 'tree'], { step: 5, need: 'any', jit: 2.5 });
    B.crowd(70, 48, 116, 88, 18); B.crowd(-116, -20, -95, 50, 14);
    B.fill(-116, -20, -95, 50, ['tree', 'tree', 'pine', 'bench'], { step: 5.5, need: 'any', jit: 2.5 });
    B.crowd(16, -28, 60, 8, 40);
    // fill the rest
    B.fill(-130, -102, -15, 102, ['officeT', 'office', 'glassT', 'office'], { step: 13, alt: ['office', 'shop'] });
    B.fill(15, -102, 130, 102, ['office', 'officeT', 'shopN', 'neonB', 'apt', 'shop', 'screenB'], { step: 9.5, alt: ['shop', 'shopN'] });
    B.fill(-130, -102, 130, 102, ['tree', 'vend', 'bike', 'shop'], { step: 5, p: 0.4 });
  },
};

// ================================================================ 4. 横浜みなとみらい
def('lmTower', { s: 13.2, h: 124, val: 960, rs: 0, sh: [24, 24], pal: ['#cfc6b6'], lm: 'そびえる超高層タワー', parts: (() => {
  const p = [bx('#c4b8a4', 0, 0, 0, 25, 14, 25), ...bands(25, 14, 25, 3.4, '#3a4a60', 0)];
  for (let i = 0; i < 10; i++) {
    const w = 19.5 - i * 0.55, y = 14 + i * 10;
    p.push(bx('#d2c9b8', 0, y, 0, w, 10, w), ...bands(w, 10, w, 2.5, '#3a4658', y, 2));
    for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(bx('#6a7282', sx * (w / 2 - 0.5), y, sz * (w / 2 - 0.5), 1.4, 10, 1.4));
  }
  p.push(bx('#c4b8a4', 0, 114, 0, 13.2, 7, 13.2), bx('#2c3a52', 0, 115.2, 0, 13.4, 3.2, 5, { g: 2 }), bx('#2c3a52', 0, 115.2, 0, 5, 3.2, 13.4, { g: 2 }), bx('#b8ac98', 0, 121, 0, 9, 1.6, 9), P('ico', '#ff4040', 0, 123.2, 0, 0.8, 0.8, 0.8, { g: 3 }));
  return p;
})() });
def('cosmoWheel', { s: 10.2, h: 56, val: 460, rs: 0, sh: [12, 18], pal: ['#e8eef4'], lm: '時計の大観覧車', parts: (() => {
  const c = '#e8eef4', R = 24, Y = 30, p = [];
  p.push(P('ring', c, 0, Y, 0, R * 2, R * 2, 40), P('ring', '#c8d4e0', 0, Y, 0, R * 1.84, R * 1.84, 30), P('ring', '#7fd0ff', 0, Y, 0.8, R * 1.95, R * 1.95, 12, { g: 3 }));
  for (let k = 0; k < 16; k++) { const a = k / 16 * 2 * PI; p.push(seg(c, 0, Y, 0, Math.cos(a) * R, Y + Math.sin(a) * R, 0, 0.3)); }
  const gc = ['#ff6b6b', '#4dc3ff', '#ffd84d', '#7be08a', '#b98bff', '#ff9f43'];
  for (let k = 0; k < 30; k++) { const a = k / 30 * 2 * PI; p.push(bx(gc[k % 6], Math.cos(a) * (R + 0.6), Y + Math.sin(a) * (R + 0.6) - 1.8, 0, 1.4, 1.6, 1.6, { g: 2 })); }
  p.push(P('cyl12', '#ffffff', 0, Y, 0, 9, 2.6, 9, { rx: R90 }), P('cyl12', '#f8f8f2', 0, Y, 1.45, 8.4, 0.2, 8.4, { rx: R90, g: 1 }), P('cyl12', '#2a3a5a', 0, Y, 1.5, 7.6, 0.1, 7.6, { rx: R90, g: 1 }));
  p.push(bx('#ffffff', 0, Y + 1.4, 1.62, 0.5, 3.2, 0.08, { g: 1 }), P('box', '#ffffff', 1.0, Y - 0.5, 1.62, 0.4, 2.4, 0.08, { rz: 1.1, g: 1 }));
  for (const sz of [-3.5, 3.5]) { p.push(seg('#b8c4d0', -10, 0, sz, 0, Y, sz * 0.3, 1.0), seg('#b8c4d0', 10, 0, sz, 0, Y, sz * 0.3, 1.0)); }
  p.push(bx('#d8dce2', 0, 0, 0, 16, 3.5, 9));
  return p;
})() });
def('sailHotel', { s: 9.6, h: 48, val: 380, rs: 0, sh: [26, 12], pal: ['#f4f6f8'], lm: '帆の形のホテル', parts: (() => {
  const p = [bx('#d8dce2', 0, 0, 2, 28, 5, 12)];
  for (let i = -4; i <= 4; i++) {
    const a = i * 0.14, H = 44 * Math.sqrt(Math.max(0.05, 1 - (i / 4.7) ** 2));
    const x = Math.sin(a) * 18, z = -14 + Math.cos(a) * 18;
    p.push(P('box', '#f4f6f8', x, 5 + H / 2, z, 3.3, H, 4.2, { ry: -a }));
    for (let y = 7; y < 5 + H - 1; y += 2.6) p.push(P('box', '#3a4a60', x, y, z + 0.1, 3.35, 0.9, 4.3, { ry: -a, g: 2 }));
  }
  return p;
})() });
def('redBrick', { s: 7.0, h: 13, val: 220, rs: 0, sh: [30, 10], pal: ['#b5543a'], lm: '赤レンガ倉庫', parts: (() => {
  const p = [bx('#b5543a', 0, 0, 0, 29, 10, 9), bx('#5a5a60', 0, 10, 0, 29.4, 0.8, 9.4), P('tri', '#5a5a60', 0, 11.4, 0, 28, 2, 8.4)];
  for (let x = -13; x <= 13; x += 2.6) for (const y of [1.2, 4.6, 7.6]) { p.push(bx('#f0e6d8', x, y, 4.52, 1.3, 1.9, 0.06), bx('#3a4a60', x, y + 0.2, 4.55, 0.9, 1.4, 0.05, { g: 2 })); }
  for (const x of [-14, 14]) p.push(bx('#a84a32', x, 0, 0, 1.4, 11, 9.6));
  p.push(bx('#e8d8b0', 0, 0, 5.2, 4, 3, 1.6));
  return p;
})() });
def('nipponMaru', { s: 7.4, h: 32, val: 260, rs: 0, sh: [30, 8], pal: ['#ffffff'], lm: '白い帆船', parts: (() => {
  const p = [bx('#5a6470', 0, 0, 0, 28, 1.5, 7), bx('#ffffff', 0, 1.5, 0, 26, 3.6, 6), P('pyr', '#ffffff', 13.6, 3.3, 0, 3, 3.6, 4.2, { rz: -R90 }), bx('#2a6fb0', 0, 1.8, 0, 26.1, 0.5, 6.1), bx('#c9a47a', 0, 5.1, 0, 25, 0.3, 5.6)];
  for (const [x, h] of [[-9, 22], [-2, 26], [5, 26], [11, 20]]) {
    p.push(cy('#d8c8a8', x, 5, 0, 0.3, h));
    for (let k = 0; k < 4; k++) { const y = 9 + k * (h - 6) / 4, w = 9 - k * 1.6; p.push(bx('#d8c8a8', x, y + 3, 0, 0.25, 0.25, w), bx('#fbfbf6', x + 0.3, y, 0, 0.12, 2.8, w * 0.92)); }
  }
  p.push(seg('#d8c8a8', 14, 5, 0, 22, 9, 0, 0.3));
  return p;
})() });
def('liner', { s: 9.0, h: 18, val: 300, rs: 0, sh: [46, 10], pal: ['#ffffff'], lm: '大きな客船', parts: [
  bx('#1e2a44', 0, 0, 0, 44, 4, 9), P('pyr', '#1e2a44', 23.4, 2, 0, 3, 4, 6, { rz: -R90 }), bx('#ffffff', 0, 4, 0, 44.4, 0.6, 9.1), bx('#f4f6fa', -2, 4.6, 0, 36, 7, 8.4),
  ...bands(36, 7, 8.4, 1.6, '#34465e', 4.6, 2, -2), bx('#f4f6fa', -4, 11.6, 0, 24, 3, 7), bx('#cfe3f2', 12, 11.6, 0, 4, 2, 6, { g: 2 }), cy('#d8322a', -10, 14.6, 0, 1.6, 3.4), cy('#1e2a44', -10, 18, 0, 1.65, 0.6)] });
def('chukaGate', { s: 4.4, h: 13, val: 90, rs: 0, sh: [12, 4], pal: ['#d8322a'], lm: '中華街の門', parts: [
  ...[-5, -1.8, 1.8, 5].map(x => cy('#d8322a', x, 0, 0, 0.35, 9.5)), bx('#d8322a', 0, 6.2, 0, 11, 0.5, 0.6), bx('#d8322a', 0, 8.6, 0, 11.4, 0.6, 0.7),
  bx('#e8c040', 0, 6.8, 0, 3, 1.6, 0.5, { g: 1 }), bx('#2f8a5a', 0, 9.2, 0, 12.6, 0.4, 2.0), P('pyr', '#2f8a5a', 0, 9.9, 0, 12, 1.0, 2.2), bx('#2f8a5a', 0, 10.9, 0, 6.6, 0.4, 1.8), P('pyr', '#2f8a5a', 0, 11.6, 0, 6.4, 1.0, 2.0),
  bx('#e8c040', 0, 12.1, 0, 0.6, 0.8, 0.6), ...[-3.4, 3.4].map(x => P('pyr', '#2f8a5a', x, 7.6, 0, 3.6, 0.8, 1.6))] });
def('ropeTower', { s: 2.6, h: 17, val: 30, rs: 0, sh: [4, 4], pal: ['#e8eef4'], parts: [
  seg('#e8eef4', -1.6, 0, 0, -0.4, 16, 0, 0.8), seg('#e8eef4', 1.6, 0, 0, 0.4, 16, 0, 0.8), bx('#e8eef4', 0, 15.6, 0, 1.6, 0.8, 5), bx('#d8dce2', 0, 0, 0, 5, 0.6, 3)] });
def('ropeCabin', { s: 1.3, h: 3, val: 8, rs: 0, sh: [2, 2], pal: ['#ffffff', '#ffd84d', '#7fd0ff'], parts: [
  bx('#ffffff', 0, -2.6, 0, 1.8, 1.8, 1.8, T1), bx('#2c3a52', 0, -2.1, 0, 1.85, 0.8, 1.85, { g: 2 }), cy('#9aa3ad', 0, -0.8, 0, 0.06, 0.8), bx('#9aa3ad', 0, -0.1, 0, 1.0, 0.25, 0.25)] });

const yokohama = {
  id: 'yokohama', name: '横浜みなとみらい', sub: '超高層タワー・時計の観覧車・赤レンガ・港', desc: '海に面した港町。帆の形のホテル、赤レンガ倉庫、運河をこえるロープウェイ。はしっこには中華街の門も。',
  ext: [-96, -74, 126, 98], start: [-48, 82], time: 140, rivals: 2, diff: 0.44, stars: [11, 20, 32],
  pal: { sky: '#b6dcff', hemi: ['#ffffff', '#7f96aa', 0.64], sun: ['#fff4e0', 0.5, -0.4, 1, 0.5], ground: '#3f8fc4', outer: '#3f8fc4' },
  icon(g, w, h) {
    g.fillStyle = '#b6dcff'; g.fillRect(0, 0, w, h); g.fillStyle = '#3f8fc4'; g.fillRect(0, h * 0.8, w, h * 0.2);
    g.fillStyle = '#d2c9b8'; g.beginPath(); g.moveTo(w * 0.1, h * 0.85); g.lineTo(w * 0.14, h * 0.06); g.lineTo(w * 0.28, h * 0.06); g.lineTo(w * 0.32, h * 0.85); g.fill();
    g.strokeStyle = '#e8eef4'; g.lineWidth = w * 0.025; g.beginPath(); g.arc(w * 0.62, h * 0.46, h * 0.32, 0, 7); g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(w * 0.62, h * 0.46, h * 0.09, 0, 7); g.fill();
    g.fillStyle = '#f4f6f8'; g.beginPath(); g.moveTo(w * 0.8, h * 0.85); g.quadraticCurveTo(w * 0.86, h * 0.2, w * 0.94, h * 0.85); g.fill();
  },
  build(B) {
    B.ground('#3f8fc4'); B.rect(-110, -88, 140, 112, null, 'w'); B.speck(-110, -88, 140, 112, 500, ['#5aa4d4', '#3484bc'], 1.4);
    const land = '#d8d3c6';
    B.poly([[-110, -58], [-30, -58], [-12, -64], [8, -56], [10, 50], [-110, 50]], land, 'f');        // Minato Mirai
    B.rect(-110, 50, 22, 112, land, 'f');                                                             // Sakuragicho
    B.poly([[22, -42], [74, -42], [82, -20], [80, 50], [22, 50]], land, 'f');                          // Shinko island
    B.rect(22, 62, 140, 112, land, 'f'); B.rect(84, 44, 140, 62, land, 'f');                            // Kannai + Yamashita
    B.rect(94, -12, 104, 44, '#b8946a', 'f'); B.tiles(94, -12, 104, 44, 1.2, '#a8845a', 0.08);           // the pier
    B.line([[-110, -58], [-30, -58], [-12, -64], [8, -56], [10, 50]], 0.8, '#9aa3ad'); B.line([[22, 50], [22, -42], [74, -42], [82, -20], [80, 50]], 0.8, '#9aa3ad');
    B.rect(-40, 32, -10, 48, '#7a8a98', 'f'); B.rect(-38, 34, -12, 46, '#5a8ab0', null);               // dock of the sailing ship
    // green waterfront parks
    B.poly([[-24, -56], [-12, -62], [6, -54], [6, -36], [-24, -36]], '#9ccf78', 'r');
    B.rect(22, 36, 80, 50, '#d8c8a8', 'r'); B.rect(108, 44, 140, 62, '#9ccf78', 'r');
    // streets and bridges
    for (const x of [-80, -45]) street(B, [[x, -58], [x, 112]], 10, { cars: 8, ppl: 8, trees: ['tree'], carT: CAR_T });
    street(B, [[-14, -40], [-14, 112]], 9, { cars: 6, ppl: 8, trees: ['tree'], carT: CAR_T });
    for (const z of [-30, 6, 60]) street(B, [[-110, z], [10, z]], 10, { cars: 8, ppl: 8, trees: ['tree'], carT: CAR_T });
    street(B, [[-14, -20], [34, -20], [86, -20]], 9, { cars: 6, ppl: 8, carT: CAR_T });
    street(B, [[50, -42], [50, 70], [50, 112]], 8, { cars: 6, ppl: 8, carT: CAR_T });
    street(B, [[-110, 76], [140, 76]], 11, { cars: 12, ppl: 12, carT: CAR_T });
    street(B, [[100, 62], [100, 112]], 8, { cars: 4, ppl: 6 });
    B.road([[-14, 30], [34, 30]], 6, { col: '#b8a888', side: 0, mid: false }); B.walk([[-14, 30], [34, 30]], 10, { w: 3 });
    // Chinatown at the south-east edge
    B.road([[34, 92], [124, 92]], 7, { col: '#b89a7a', side: 0, mid: false });
    B.o('chukaGate', 40, 92, R90);
    B.along([[44, 92], [124, 92]], 6.6, 5.4, ['chukaShop'], { need: 'build' }); B.along([[44, 92], [124, 92]], -6.6, 5.4, ['chukaShop'], { need: 'build' });
    B.along([[44, 92], [124, 92]], 2.6, 6, ['chochin', 'stall', 'signA'], { need: 'any' }); B.walk([[40, 92], [124, 92]], 30, { w: 4 });
    // landmarks
    B.o('lmTower', -60, 30, 0);
    B.o('cosmoWheel', 34, 10, 0);
    B.o('sailHotel', -6, -44, 0);
    B.o('redBrick', 40, 26, 0); B.o('redBrick', 64, 6, R90);
    B.o('nipponMaru', -25, 40, 0);
    B.o('liner', 112, 16, R90);
    B.o('glassT', -40, 16, 0); B.o('officeT', -24, 16, 0); B.o('glassT', -62, -12, 0); B.o('officeT', -28, -14, 0); B.o('glassT', -96, -44, 0);
    // ropeway over the canal: towers and cabins (cabins hang 14m up)
    const rA = [-18, 70], rB = [30, 40];
    B.o('ropeTower', rA[0], rA[1], Math.atan2(rB[0] - rA[0], rB[1] - rA[1])); B.o('ropeTower', rB[0], rB[1], Math.atan2(rB[0] - rA[0], rB[1] - rA[1]));
    B.train([[rA[0] - 1.2, rA[1] - 1.6], [rB[0] - 1.2, rB[1] - 1.6], [rB[0] + 1.2, rB[1] + 1.6], [rA[0] + 1.2, rA[1] + 1.6]], { close: true, type: 'ropeCabin', cars: 1, trains: 8, y: 15.5, spd: 2.6 });
    // boats in the canals and the bay
    B.boats([[16, -70], [16, 56], [60, 56], [82, 56]], 3, { types: ['tourBoat', 'boat'], spd: 2.4 });
    B.boats([[-100, -68], [60, -60], [89, -40], [89, 40]], 3, { types: ['boat', 'tourBoat', 'boat'], mode: 'wrap', spd: 3 });
    B.boats([[-110, -84], [140, -80]], 2, { types: ['ship'], mode: 'wrap', spd: 2.2, off: 0 });
    // parks, crowds, town
    B.fill(-24, -56, 6, -36, ['tree', 'pine', 'bench'], { step: 5, need: 'any', jit: 2 });
    B.fill(108, 44, 140, 62, ['tree', 'flower', 'bench'], { step: 5, need: 'any', jit: 2 });
    B.along([[24, 48], [78, 48]], 0, 5, ['stall', 'umbrella', 'bench'], { need: 'any' });
    B.crowd(22, 36, 80, 50, 26); B.crowd(-24, -50, 6, -36, 16); B.crowd(94, -10, 104, 42, 16); B.crowd(108, 44, 138, 60, 10);
    B.fill(-110, -60, 10, 112, ['office', 'officeT', 'apt', 'shop', 'glassT', 'office'], { step: 12, alt: ['shop', 'office'] });
    B.fill(22, -42, 82, 50, ['shop', 'office', 'apt'], { step: 11, alt: ['shop'] });
    B.fill(22, 62, 140, 112, ['shop', 'apt', 'office', 'houseJ', 'shop'], { step: 8.5, alt: ['shop'] });
    B.fill(-110, -88, 140, 112, ['tree', 'vend', 'bike', 'shop'], { step: 5, p: 0.4 });
  },
};

// ================================================================ 5. 大阪・道頓堀（夜）
// sign buildings: the facade faces +z (south). Blinking parts (g: 3) make the signs feel animated.
function signBase(w, h, d, body) { return [bx(body || '#3a3346', 0, 0, 0, w, h, d), ...bands(w, h, d, 2.6, '#241f30', 0, 2), bx('#fff1c8', 0, 0, d / 2 + 0.02, w * 0.8, 2.6, 0.05, { g: 2 })]; }
def('crabB', { s: 5.4, h: 17, val: 130, rs: 0, sh: [10, 9], pal: ['#e8452c'], lm: 'カニ看板のビル', parts: (() => {
  const p = signBase(9, 15, 8), z = 4.6, c = '#e8452c';
  p.push(P('sph', c, 0, 10.5, z + 0.6, 6.4, 2.8, 2.4, { g: 1 }));
  for (const s of [-1, 1]) for (let k = 0; k < 3; k++) { const y = 9.6 - k * 0.9; p.push(seg(c, s * 2.4, y, z + 0.6, s * 4.6, y + 0.8, z + 1.0, 0.45, { g: 3 }), seg(c, s * 4.6, y + 0.8, z + 1.0, s * 5.4, y - 1.6, z + 1.0, 0.4, { g: 3 })); }
  for (const s of [-1, 1]) { p.push(seg(c, s * 2.2, 11.4, z + 0.8, s * 3.6, 13.6, z + 1.2, 0.6, { g: 1 }), P('sph', c, s * 3.9, 14.3, z + 1.2, 1.8, 1.3, 1.0, { g: 3 }), P('sph', '#ffffff', s * 0.7, 12.2, z + 1.4, 0.5, 0.5, 0.5, { g: 1 })); }
  p.push(bx('#ffe27a', 0, 4.2, z - 0.4, 8, 1.8, 0.2, { g: 3 }));
  return p;
})() });
def('octoB', { s: 5.2, h: 16, val: 120, rs: 0, sh: [10, 9], pal: ['#e8602c'], lm: 'タコ看板のビル', parts: (() => {
  const p = signBase(9, 14, 8, '#2f3a4a'), z = 4.6, c = '#ff6a3a';
  p.push(P('sph', c, 0, 11.2, z + 0.8, 4.4, 4.6, 3.0, { g: 1 }), bx('#ffffff', 0, 10.6, z + 2.0, 4.6, 0.6, 0.6, { g: 1 }), P('sph', '#ffffff', -0.8, 11.8, z + 2.2, 0.7, 0.8, 0.4, { g: 1 }), P('sph', '#ffffff', 0.8, 11.8, z + 2.2, 0.7, 0.8, 0.4, { g: 1 }));
  for (let k = 0; k < 6; k++) { const x = -2.6 + k * 1.04; p.push(seg(c, x * 0.6, 9.2, z + 1, x, 6.6, z + 1.4, 0.6, { g: 3 }), seg(c, x, 6.6, z + 1.4, x * 1.3 + (k % 2 ? 0.6 : -0.6), 5.6, z + 1.6, 0.45, { g: 3 })); }
  p.push(bx('#ffe27a', 0, 3.6, z - 0.4, 8, 1.6, 0.2, { g: 3 }));
  return p;
})() });
def('runnerB', { s: 5.8, h: 24, val: 150, rs: 0, sh: [11, 7], pal: ['#2a6fd8'], lm: 'ランナーの看板', parts: (() => {
  const p = signBase(10, 10, 6, '#2a2a36'), z = 3.3, w = '#ffffff';
  p.push(bx('#1a2a4a', 0, 8, z - 0.3, 10.4, 15, 0.6), bx('#2a6fd8', 0, 8.5, z, 9.6, 14, 0.12, { g: 1 }));
  for (let k = 0; k < 14; k++) { p.push(P('ico', '#ffd84d', -4.8 + k * 0.74, 8.4, z + 0.12, 0.3, 0.3, 0.3, { g: 3 }), P('ico', '#ffd84d', -4.8 + k * 0.74, 22.5, z + 0.12, 0.3, 0.3, 0.3, { g: 3 })); }
  p.push(P('cyl12', w, 0.6, 19.4, z + 0.14, 1.6, 0.1, 1.6, { rx: R90, g: 1 }), seg(w, 0.4, 18.4, z + 0.15, -0.2, 14.8, z + 0.15, 0.7, { g: 1 }));
  p.push(seg(w, 0.3, 17.8, z + 0.15, -1.8, 20.6, z + 0.15, 0.4, { g: 1 }), seg(w, 0.3, 17.8, z + 0.15, 2.4, 20.4, z + 0.15, 0.4, { g: 1 }));
  p.push(seg(w, -0.2, 14.8, z + 0.15, 1.8, 12.4, z + 0.15, 0.45, { g: 1 }), seg(w, -0.2, 14.8, z + 0.15, -2.6, 13.6, z + 0.15, 0.45, { g: 1 }), seg(w, -2.6, 13.6, z + 0.15, -2.8, 11.4, z + 0.15, 0.4, { g: 1 }));
  p.push(bx('#ff5a4f', 0, 10.4, z + 0.15, 8, 0.4, 0.04, { g: 3 }));
  return p;
})() });
def('fuguB', { s: 5.0, h: 15, val: 110, rs: 0, sh: [9.4, 9], pal: ['#f4f0e0'], lm: 'フグ提灯のビル', parts: (() => {
  const p = signBase(8.4, 12, 8, '#3a2f2f'), z = 5.6;
  p.push(P('sph', '#f6f2e4', 0, 9.4, z, 5.4, 5, 4.4, { g: 1 }), P('sph', '#3a3a3a', 0.8, 10.6, z + 2.1, 0.8, 0.8, 0.4), P('sph', '#e84a3a', 2.4, 8.6, z + 1.6, 1.2, 0.8, 0.6, { g: 3 }));
  for (let k = 0; k < 10; k++) { const a = k / 10 * 2 * PI; p.push(P('cone', '#e8c86a', Math.cos(a) * 2.7, 9.4 + Math.sin(a) * 2.5, z, 0.4, 0.9, 0.4, { rz: a - R90, g: 1 })); }
  p.push(P('cone', '#e8c86a', -3.3, 9.4, z, 1.6, 1.8, 1.0, { rz: R90, g: 1 }), bx('#e84a3a', 0, 3.4, z - 1.5, 7.4, 1.4, 0.2, { g: 3 }));
  return p;
})() });
def('dragonB', { s: 4.8, h: 15, val: 105, rs: 0, sh: [9, 8.6], pal: ['#3fae5a'], lm: '竜の看板', parts: (() => {
  const p = signBase(8, 12, 7.6, '#2f2f3a'), z = 4.4, c = '#3fae5a';
  for (let k = 0; k < 9; k++) { const x = -3.6 + k * 0.9, y = 9 + Math.sin(k * 0.9) * 1.5; p.push(P('sph', k % 2 ? c : '#5fce6a', x, y, z + 0.6, 1.4, 1.3, 1.2, { g: k % 3 ? 1 : 3 })); }
  p.push(P('sph', c, 4.6, 10.4, z + 0.9, 2.2, 1.6, 1.6, { g: 1 }), P('cone', '#ffd84d', 4.4, 11.8, z + 0.8, 0.3, 1.2, 0.3, { g: 1 }), P('sph', '#ff3a2a', 5.0, 10.8, z + 1.7, 0.4, 0.4, 0.3, { g: 3 }));
  p.push(bx('#ffffff', 0, 3.6, z - 0.4, 7, 1.4, 0.2, { g: 3 }));
  return p;
})() });
def('tsutenkaku', { s: 12.6, h: 74, val: 780, rs: 0, sh: [18, 18], pal: ['#c8ccd2'], lm: '光る塔', parts: (() => {
  const c = '#c4c8ce', p = [];
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) p.push(seg(c, sx * 9, 0, sz * 9, sx * 3.8, 16, sz * 3.8, 1.2));
  for (const s of [-1, 1]) { p.push(bx(c, 0, 13, s * 6.4, 13, 0.9, 0.9), bx(c, s * 6.4, 13, 0, 0.9, 0.9, 13)); }
  p.push(bx('#d8dce2', 0, 16, 0, 10, 4.6, 10), ...bands(10, 20.6, 10, 2.2, '#2c3a52', 16, 2));
  p.push(...lattice(c, 20.6, 50, 4.2, 3.2, 6, 0.4));
  p.push(bx('#e8e8ee', 0, 50, 0, 9.4, 9, 9.4), ...bands(9.4, 59, 9.4, 2.2, '#2c3a52', 50, 2), bx('#4dc3ff', 0, 52, 4.75, 7.6, 2.2, 0.1, { g: 1 }));
  p.push(cy('#ffffff', 0, 59, 0, 3.2, 1.6, { g: 3 }, 'cyl16'), cy('#ff4fa0', 0, 60.6, 0, 3.0, 1.4, { g: 1 }, 'cyl16'), cy('#ffd84d', 0, 62, 0, 2.8, 1.4, { g: 3 }, 'cyl16'), cy('#4dfff0', 0, 63.4, 0, 2.6, 1.2, { g: 1 }, 'cyl16'));
  p.push(P('dome', '#d8dce2', 0, 64.6, 0, 5, 2.4, 5), cy('#d8dce2', 0, 65.6, 0, 0.3, 8), P('ico', '#ff4040', 0, 73.6, 0, 0.6, 0.6, 0.6, { g: 3 }));
  return p;
})() });

const dotonbori = {
  id: 'dotonbori', name: '大阪・道頓堀', sub: '運河ぞいの巨大看板・橋の人ごみ・光る塔', desc: '夜の運河に 巨大なカニやタコの看板が光る。橋の上は 人でいっぱい。南東のはしには てっぺんが光る塔。',
  ext: [-96, -62, 104, 100], start: [0, 6], time: 112, rivals: 4, diff: 0.64, stars: [10, 18, 30],
  pal: { sky: '#0d1430', fog: '#141a36', hemi: ['#8a94c8', '#2a2438', 0.55], sun: ['#b8c0ff', 0.22, -0.3, 1, 0.6], night: 1, ground: '#3a3640', outer: '#2a2832' },
  icon(g, w, h) {
    g.fillStyle = '#0d1430'; g.fillRect(0, 0, w, h); g.fillStyle = '#1c3a5a'; g.fillRect(0, h * 0.72, w, h * 0.28);
    g.fillStyle = '#2a6fd8'; g.fillRect(w * 0.06, h * 0.12, w * 0.3, h * 0.5); g.strokeStyle = '#fff'; g.lineWidth = w * 0.025;
    g.beginPath(); g.arc(w * 0.22, h * 0.24, w * 0.03, 0, 7); g.moveTo(w * 0.21, h * 0.3); g.lineTo(w * 0.2, h * 0.46); g.moveTo(w * 0.21, h * 0.32); g.lineTo(w * 0.12, h * 0.2); g.moveTo(w * 0.21, h * 0.32); g.lineTo(w * 0.31, h * 0.2); g.moveTo(w * 0.2, h * 0.46); g.lineTo(w * 0.28, h * 0.56); g.moveTo(w * 0.2, h * 0.46); g.lineTo(w * 0.12, h * 0.52); g.stroke();
    g.fillStyle = '#e8452c'; g.beginPath(); g.ellipse(w * 0.66, h * 0.42, w * 0.18, h * 0.12, 0, 0, 7); g.fill(); g.strokeStyle = '#e8452c';
    for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(w * 0.52, h * (0.45 + k * 0.05)); g.lineTo(w * 0.42, h * (0.62 + k * 0.03)); g.moveTo(w * 0.8, h * (0.45 + k * 0.05)); g.lineTo(w * 0.9, h * (0.62 + k * 0.03)); g.stroke(); }
    g.fillStyle = '#ffd84d'; for (let i = 0; i < 9; i++) g.fillRect(w * (0.05 + i * 0.1), h * 0.8, w * 0.05, h * 0.03);
  },
  build(B) {
    B.ground('#3a3640'); B.speck(-110, -76, 118, 114, 900, ['#423e4a', '#34303a'], 0.8);
    // the canal (E-W) with promenades on both banks
    B.rect(-110, -2, 118, 12, '#1c3a5a', 'w'); B.speck(-110, -1, 118, 11, 380, ['#ffd84d', '#ff6bb0', '#4dc3ff', '#2a5a80'], 0.22);
    B.rect(-110, -7, 118, -2, '#4a4452', 'r'); B.rect(-110, 12, 118, 17, '#4a4452', 'r'); B.line([[-110, -2], [118, -2]], 0.4, '#8a8090'); B.line([[-110, 12], [118, 12]], 0.4, '#8a8090');
    const RD = { col: '#2a2c34', sideCol: '#4a4452', mid: '#8a8478' };
    // bridges + big streets
    street(B, [[-56, -76], [-56, 114]], 16, Object.assign({ cars: 14, ppl: 14, trees: ['tree'], carT: CITY_CAR }, RD));
    street(B, [[62, -76], [62, 114]], 12, Object.assign({ cars: 10, ppl: 10, carT: CITY_CAR }, RD));
    B.rect(-7, -7, 7, 17, '#5a5060', 'r'); B.tiles(-7, -7, 7, 17, 1.4, '#6a6070', 0.08);                       // the crowded bridge
    B.crowd(-6, -6, 6, 16, 44);
    B.rect(26, -7, 32, 17, '#5a5060', 'r'); B.walk([[29, -8], [29, 18]], 8, { w: 2 });
    // the shopping arcade north and the food street south of the canal
    B.road([[0, -76], [0, -7]], 8, { col: '#5a5060', side: 0, mid: false }); B.walk([[0, -74], [0, -8]], 40, { w: 6 });
    B.along([[0, -74], [0, -10]], 6.6, 5.4, ['shopN', 'shopN', 'shop'], { need: 'build' }); B.along([[0, -74], [0, -10]], -6.6, 5.4, ['shopN', 'shop', 'shopN'], { need: 'build' });
    B.road([[-110, 30], [62, 30]], 8, { col: '#4e4656', side: 0, mid: false }); B.walk([[-50, 30], [60, 30]], 50, { w: 6 });
    B.along([[-48, 30], [60, 30]], 2.8, 6, ['stall', 'stall', 'chochin', 'signA'], { need: 'any' }); B.along([[-48, 30], [60, 30]], -2.8, 7.5, ['chochin', 'signA', 'stall'], { need: 'any' });
    street(B, [[-110, -30], [118, -30]], 7, Object.assign({ cars: 6, ppl: 14, stuff: ['chochin', 'signA', 'vend'] }, RD));
    street(B, [[-110, 52], [118, 52]], 8, Object.assign({ cars: 8, ppl: 10, stuff: STUFF }, RD));
    street(B, [[30, 52], [30, 114]], 7, Object.assign({ cars: 4, ppl: 8 }, RD));
    // the signboards: north bank faces the canal, the food street row faces the street
    B.o('runnerB', 12, -12, 0); B.o('screenB', -16, -12, 0); B.o('neonB', 22, -12, 0); B.o('neonB', -26, -12, 0);
    B.o('crabB', -22, 22.5, 0); B.o('octoB', 14, 22.5, 0); B.o('fuguB', 40, 22.5, 0); B.o('dragonB', -40, 22.5, 0);
    B.along([[-110, 22], [118, 22]], 0, 9, ['neonB', 'shopN', 'neonB'], { need: 'build' });
    B.along([[-110, -12], [118, -12]], 0, 9, ['neonB', 'shopN', 'screenB'], { need: 'build' });
    B.boats([[-120, 5], [128, 5]], 4, { types: ['tourBoat', 'tourBoat', 'boat'], mode: 'wrap', spd: 2.2, off: 0 });
    B.along([[-110, -4.5], [118, -4.5]], 0, 9, ['slamp', 'bench', 'chochin'], { need: 'any' }); B.along([[-110, 14.5], [118, 14.5]], 0, 9, ['slamp', 'chochin', 'bench'], { need: 'any' });
    B.walk([[-100, -4.5], [110, -4.5]], 14, { w: 2 }); B.walk([[-100, 14.5], [110, 14.5]], 14, { w: 2 });
    // Shinsekai at the south-east edge: the glowing tower straddles the crossing
    street(B, [[74, 52], [74, 114]], 8, Object.assign({ cars: 2, ppl: 12, stuff: ['chochin', 'stall', 'signA'] }, RD));
    street(B, [[30, 80], [118, 80]], 8, Object.assign({ cars: 2, ppl: 12, stuff: ['chochin', 'stall', 'signA'] }, RD));
    B.o('tsutenkaku', 74, 80, 0);
    B.crowd(64, 70, 84, 90, 16);
    B.fill(30, 54, 118, 114, ['shopN', 'shopN', 'neonB', 'shop'], { step: 6.5, alt: ['shopN', 'stall'] });
    // the rest
    B.fill(-110, -76, 118, 114, ['neonB', 'shopN', 'office', 'shopN', 'apt', 'screenB', 'shop'], { step: 8.5, alt: ['shopN', 'shop'] });
    B.fill(-110, -76, 118, 114, ['stall', 'vend', 'bike', 'chochin', 'shopN'], { step: 5, p: 0.4 });
  },
};

// ================================================================ 6. 大阪城
function keep(o) {
  // a castle keep on a stone base. o: { wall, roof, gold, base, tiers, w, d, th, top }
  const p = [], st = '#8f8a80';
  p.push(bx(st, 0, 0, 0, o.w + 8, o.base * 0.4, o.d + 8), bx('#9a958a', 0, o.base * 0.4, 0, o.w + 6, o.base * 0.35, o.d + 6), bx('#a39e92', 0, o.base * 0.75, 0, o.w + 4.4, o.base * 0.25, o.d + 4.4));
  for (let x = -(o.w + 8) / 2; x < (o.w + 8) / 2; x += 2.2) p.push(bx('#7f7a70', x, 0, (o.d + 8) / 2 + 0.02, 0.12, o.base * 0.4, 0.04));
  let y = o.base;
  for (let i = 0; i < o.tiers; i++) {
    const k = 1 - i * (0.62 / o.tiers), w = o.w * k, d = o.d * k, th = o.th, top = i === o.tiers - 1;
    p.push(bx(top && o.top ? o.top : o.wall, 0, y, 0, w, th, d));
    p.push(...[-0.3, 0, 0.3].map(f => bx('#3a3a3a', f * w, y + th * 0.35, d / 2 + 0.03, w * 0.08, th * 0.3, 0.05, { g: 2 })));
    if (o.gold && i >= o.tiers - 2) p.push(bx(o.gold, 0, y + th - 0.9, 0, w + 0.1, 0.5, d + 0.1, { g: 1 }));
    p.push(bx(o.roof, 0, y + th, 0, w + 3.4, 0.5, d + 3.4), P('pyr', o.roof, 0, y + th + 1.2, 0, w + 3, 2.2, d + 3));
    if (i % 2 === 0 || top) p.push(P('tri', o.roof, 0, y + th + 1.2, d / 2 + 0.6, w * 0.38, 2.6, 1.8, { ry: R90 }), P('tri', o.roof, 0, y + th + 1.2, -d / 2 - 0.6, w * 0.38, 2.6, 1.8, { ry: R90 }));
    if (i % 2 === 1 && !top) p.push(P('tri', o.roof, d / 2 + 0.6, y + th + 1.2, 0, w * 0.32, 2.6, 1.8), P('tri', o.roof, -(d / 2 + 0.6), y + th + 1.2, 0, w * 0.32, 2.6, 1.8));
    y += th + 1.6;
  }
  p.push(P('tri', o.roof, 0, y + 0.6, 0, o.w * 0.34, 2.6, o.d * 0.3));
  for (const s of [-1, 1]) p.push(P('sph', '#e8c040', s * o.w * 0.17, y + 2.4, 0, o.shachi, o.shachi * 1.1, o.shachi * 0.6, { g: 1 }), P('cone', '#e8c040', s * o.w * 0.17 * 0.8, y + 2.4 + o.shachi * 0.9, 0, o.shachi * 0.6, o.shachi, o.shachi * 0.3, { rz: -s * 0.5, g: 1 }));
  return p;
}
def('osakaCastle', { s: 13.4, h: 58, val: 840, rs: 0, sh: [30, 26], pal: ['#f4f2ec'], lm: '天守閣', parts: keep({ wall: '#f4f2ec', roof: '#3f8f8a', gold: '#d8b440', top: '#2a3a40', base: 13, tiers: 5, w: 22, d: 19, th: 5.6, shachi: 1.2 }) });
def('yagura', { s: 4.4, h: 13, val: 80, rs: 0, sh: [10, 8], pal: ['#f4f2ec'], lm: 'やぐら', parts: [
  bx('#8f8a80', 0, 0, 0, 10, 4, 8), bx('#f4f2ec', 0, 4, 0, 8, 3.2, 6), P('pyr', '#3f8f8a', 0, 8, 0, 10, 1.8, 8), bx('#f4f2ec', 0, 8.6, 0, 5.4, 2.4, 4), P('pyr', '#3f8f8a', 0, 11.6, 0, 7, 1.8, 5.4), P('tri', '#3f8f8a', 0, 11.9, 0, 3.4, 1.4, 2.8)] });
def('stoneWall', { s: 3.4, h: 6, val: 30, rs: 0, sh: [10, 3.4], pal: ['#9a958a'], parts: [
  bx('#9a958a', 0, 0, 0, 10.4, 5.6, 3.2), bx('#8a8478', 0, 5.6, 0, 10.4, 0.4, 2.8), ...[1.2, 2.6, 4].map(y => bx('#7f7a70', 0, y, 1.62, 10.4, 0.1, 0.04)), ...[-3.6, -1, 1.6, 4.2].map(x => bx('#7f7a70', x, 0, 1.62, 0.1, 5.6, 0.04))] });
def('castleGate', { s: 5.0, h: 10, val: 90, rs: 0, sh: [13, 6], pal: ['#2a2a2e'], lm: '大きな門', parts: [
  bx('#8f8a80', -5, 0, 0, 3, 5, 6), bx('#8f8a80', 5, 0, 0, 3, 5, 6), bx('#3a3030', 0, 0, 0, 6.4, 5.4, 0.8), bx('#c9a43a', 0, 2.6, 0.42, 6, 0.2, 0.05),
  bx('#f4f2ec', 0, 5, 0, 13, 2.6, 5.4), bx('#2a2a2e', 0, 5, 0, 13.1, 1.0, 5.5), P('pyr', '#3e3e44', 0, 8.6, 0, 15, 2.2, 7), P('tri', '#3e3e44', 0, 9.2, 0, 8, 1.6, 4)] });
def('jHall', { s: 9.0, h: 16, val: 300, rs: 0, sh: [22, 22], pal: ['#e8eaee'], lm: 'ドームホール', parts: [
  cy('#e8eaee', 0, 0, 0, 10.6, 7, null, 'cyl16'), cy('#3a4a60', 0, 2.2, 0, 10.65, 1.4, { g: 2 }, 'cyl16'), P('dome', '#f4f6f8', 0, 7, 0, 21, 16, 21), cy('#d8dce2', 0, 14.6, 0, 2.4, 1, null, 'cyl16')] });
def('obpTwin', { s: 11.0, h: 82, val: 520, rs: 0, sh: [26, 14], pal: ['#7f9ab8'], lm: 'ふたごの高層ビル', parts: [
  bx('#c8ccd2', 0, 0, 0, 26, 8, 13), ...[-6.5, 6.5].flatMap(x => [bx('#7f9ab8', x, 8, 0, 11, 72, 11), ...bands(11, 80, 11, 2.4, '#2c3a52', 8, 2, x), bx('#c8ccd2', x, 80, 0, 8, 2, 8)])] });

const osakajo = {
  id: 'osakajo', name: '大阪城', sub: '石垣とお堀の上の天守閣・公園・ビル街', desc: '二重のお堀と石垣に守られた 天守閣。広い公園のむこう、川をこえると 高層ビルのビジネス街。',
  ext: [-90, -100, 142, 88], start: [-76, 64], time: 130, rivals: 3, diff: 0.56, stars: [9, 16, 26],
  pal: { sky: '#aee0ff', hemi: ['#ffffff', '#7f9a7a', 0.64], sun: ['#fff4d8', 0.55, -0.5, 1, 0.3], ground: '#8fc46a', outer: '#86b864' },
  icon(g, w, h) {
    g.fillStyle = '#aee0ff'; g.fillRect(0, 0, w, h); g.fillStyle = '#4a8ec0'; g.fillRect(0, h * 0.84, w, h * 0.16);
    g.fillStyle = '#9a958a'; g.beginPath(); g.moveTo(w * 0.2, h * 0.84); g.lineTo(w * 0.28, h * 0.62); g.lineTo(w * 0.72, h * 0.62); g.lineTo(w * 0.8, h * 0.84); g.fill();
    for (let i = 0; i < 4; i++) { const k = 1 - i * 0.18, y = h * (0.62 - i * 0.13); g.fillStyle = '#f4f2ec'; g.fillRect(w * (0.5 - 0.17 * k), y - h * 0.1, w * 0.34 * k, h * 0.1); g.fillStyle = '#3f8f8a'; g.beginPath(); g.moveTo(w * (0.5 - 0.24 * k), y - h * 0.09); g.lineTo(w * (0.5 + 0.24 * k), y - h * 0.09); g.lineTo(w * 0.5, y - h * 0.16); g.fill(); }
    g.fillStyle = '#e8c040'; g.fillRect(w * 0.43, h * 0.07, w * 0.04, h * 0.05); g.fillRect(w * 0.53, h * 0.07, w * 0.04, h * 0.05);
  },
  build(B) {
    B.ground('#8fc46a'); B.speck(-104, -100, 156, 102, 900, ['#7fb85a', '#9fd07a', '#86bc62'], 1);
    const WAT = '#4a8ec0', STONE = '#9a958a';
    // outer moat, the second bailey (park), inner moat, the main bailey
    B.rect(-66, -66, 66, 66, WAT, 'w'); B.rect(-54, -54, 54, 54, '#9ccf78', 'f'); B.speck(-54, -54, 54, 54, 200, ['#8cc06a', '#a8d888'], 1);
    B.line([[-44, 30], [-44, -30], [-10, -44], [44, -10], [10, 44], [-44, 30]], 3, '#d8c8a8', 'r'); B.line([[-104, 29], [-67, 29]], 5, '#d8c8a8', 'r'); B.line([[0, 39], [0, 70]], 5, '#d8c8a8', 'r');
    B.rect(-38, -38, 38, 38, WAT, 'w'); B.rect(-28, -28, 28, 28, '#dcd2bc', 'r'); B.tiles(-28, -28, 28, 28, 4, '#cfc4aa', 0.06);
    for (const r of [66, 54, 38, 28]) B.line([[-r, -r], [r, -r], [r, r], [-r, r]], 1.2, STONE, null, { close: true, cap: 'butt' });
    B.speck(-66, -66, 66, 66, 160, ['#6aa8d8', '#3a7eb0'], 1.4);
    // bridges (earth causeways) through the moats
    B.rect(-67, 24, -53, 34, '#c8bca4', 'b'); B.rect(-4, 27, 4, 39, '#c8bca4', 'b'); B.rect(16, -67, 26, -53, '#c8bca4', 'b'); B.rect(53, -14, 67, -4, '#c8bca4', 'b'); B.rect(-4, -39, 4, -27, '#c8bca4', 'b');
    // the river on the east, the business park beyond it
    B.rect(92, -100, 108, 102, WAT, 'w'); B.speck(92, -100, 108, 102, 120, ['#6aa8d8', '#3a7eb0'], 1.4);
    B.rect(108, -100, 156, 102, '#cfc9bc', 'f');
    street(B, [[-104, 76], [156, 76]], 12, { cars: 14, ppl: 10, trees: ['tree'], carT: CAR_T });
    street(B, [[-80, -100], [-80, 102]], 10, { cars: 8, ppl: 8, trees: ['tree'], carT: CAR_T });
    street(B, [[124, -100], [124, 102]], 10, { cars: 8, ppl: 8, carT: CAR_T });
    street(B, [[108, -40], [156, -40]], 9, { cars: 6, ppl: 8 }); street(B, [[108, 20], [156, 20]], 9, { cars: 6, ppl: 8 });
    street(B, [[60, 76], [86, 50], [86, -114]], 8, { cars: 6, ppl: 6 });
    // a jogging loop around the outer moat and paths in the park
    const loop = [[-71, -71], [71, -71], [71, 71], [-71, 71]];
    B.line(loop, 4, '#d8c8a8', 'r', { close: true }); B.walk(loop, 26, { close: true, w: 2, spd: 2.2 });
    // landmarks
    B.o('osakaCastle', 0, -8, 0);
    B.o('castleGate', -48, 29, -R90); B.o('castleGate', 0, 43, 0);
    B.o('yagura', -46, -46, 0); B.o('yagura', 46, -46, 0); B.o('yagura', -46, 46, 0); B.o('yagura', 46, 46, 0);
    for (let t = -22; t <= 22; t += 11) { B.o('stoneWall', t, -30, 0); B.o('stoneWall', t, 30, 0); B.o('stoneWall', -30, t, R90); B.o('stoneWall', 30, t, R90); }
    B.o('jHall', 46, -86, 0);
    B.o('obpTwin', 136, -66, 0); B.o('glassT', 136, -10, 0); B.o('glassT', 136, 50, 0); B.o('officeT', 116, 48, 0); B.o('glassT', 116, -66, 0); B.o('officeT', 116, -10, 0);
    // trees: cherry and plum groves, pines on the bailey
    B.fill(-104, -100, 92, 102, ['sakura', 'tree', 'pine', 'sakura', 'tree'], { step: 6, need: 'build', jit: 2.4, p: 0.75 });
    B.fill(-52, -52, 52, 52, ['pine', 'sakura', 'tree', 'bench'], { step: 7, need: 'build', jit: 2, p: 0.6 });
    B.fill(-104, -100, 92, 102, ['bench', 'kiosk', 'flower', 'trash', 'lamp'], { step: 9, need: 'build', p: 0.35 });
    B.crowd(-27, -27, 27, 27, 40); B.crowd(-52, -52, 52, 52, 50); B.crowd(-104, -100, 90, 100, 110, { types: ['person', 'person', 'kimono'] });
    B.along(loop.concat([loop[0]]), 3.2, 6, ['bench', 'trash', 'vend', 'bike', 'stall', 'flower', 'signA', 'cone'], { need: 'any' });
    B.along(loop.concat([loop[0]]), -3.2, 7, ['flower', 'bike', 'bench', 'stall', 'trash'], { need: 'any' });
    B.fill(-104, -100, 92, 102, ['flower', 'bench', 'trash', 'bike', 'stall', 'cone', 'umbrella'], { step: 4.5, need: 'build', p: 0.35 });
    B.boats([[100, -110], [100, 110]], 3, { types: ['tourBoat', 'boat'], mode: 'wrap', off: 0 });
    B.fill(108, -100, 156, 102, ['office', 'officeT', 'glassT'], { step: 13, alt: ['office'] });
    B.fill(-104, -100, 156, 102, ['houseJ', 'shop', 'apt', 'office'], { step: 9, p: 0.5 });
  },
};

// ================================================================ 7. 京都（夕方）
def('kiyomizu', { s: 12.6, h: 32, val: 760, rs: 0, sh: [30, 28], pal: ['#7a5a3a'], lm: '崖の上の舞台', parts: (() => {
  const wood = '#8a6440', p = [];
  p.push(bx('#5f8a48', 0, 0, -7, 32, 12, 16), P('pyr', '#6a9a50', 0, 14, -9, 34, 5, 18), bx('#557f42', 0, 0, 3, 32, 4, 6));
  for (let x = -10; x <= 10; x += 3.33) for (let z = 1; z <= 10; z += 3) p.push(cy('#6a4a30', x, 0, z, 0.38, 12));
  for (const y of [4, 8]) { for (let z = 1; z <= 10; z += 3) p.push(bx('#6a4a30', 0, y, z, 21, 0.4, 0.4)); for (let x = -10; x <= 10; x += 3.33) p.push(bx('#6a4a30', x, y, 5.5, 0.4, 0.4, 9.4)); }
  p.push(bx(wood, 0, 12, 5, 24, 0.9, 11), bx('#7a5434', 0, 12.9, 10.4, 24, 0.9, 0.3));
  p.push(bx('#a8794a', 0, 12, -5, 22, 7, 11), bx('#f0e6d0', 0, 16, 0.55, 20, 1.6, 0.1), ...roofH('#5a4a3e', 0, 19, -4, 28, 18, 8, 6));
  p.push(...shift(pagodaParts('#d8452c', '#4a4040', 3, 6, 4.4, '#c9a43a'), 13, 12, -10, 0.9));
  p.push(...shift([bx('#d8452c', 0, 0, 0, 6, 4, 3), ...roofH('#4a4040', 0, 4, 0, 7.4, 4.4, 2)], -12, 12, -12, 1));
  return p;
})() });
def('kyotoTower', { s: 11.6, h: 76, val: 660, rs: 0, sh: [26, 16], pal: ['#f4f2ec'], lm: '白いタワー', parts: [
  bx('#e8e4da', 0, 0, 0, 26, 15, 15), ...bands(26, 15, 15, 2.6, '#3a4a60', 0), bx('#d8d2c4', 0, 15, 0, 24, 1, 13),
  P('frus', '#f8f8f4', 0, 16 + 19, 0, 10, 38, 10), cy('#f8f8f4', 0, 54, 0, 4.4, 1.2, null, 'cyl16'), cy('#3a4a60', 0, 55.2, 0, 4.8, 3.4, { g: 2 }, 'cyl16'), cy('#e8413a', 0, 58.6, 0, 4.8, 0.8, null, 'cyl16'),
  cy('#f8f8f4', 0, 59.4, 0, 3.2, 3, null, 'cyl16'), P('cone', '#f8f8f4', 0, 64.4, 0, 4.6, 3, 4.6), cy('#e8413a', 0, 65.9, 0, 0.5, 3), cy('#f8f8f4', 0, 68.9, 0, 0.45, 3), cy('#e8413a', 0, 71.9, 0, 0.4, 3), P('ico', '#ff4040', 0, 75.2, 0, 0.6, 0.6, 0.6, { g: 3 })] });
def('kyotoSta', { s: 10.4, h: 20, val: 380, rs: 0, sh: [48, 16], pal: ['#a8b0bc'], lm: '駅ビル', parts: [
  bx('#a8b0bc', 0, 0, 0, 48, 16, 15), ...bands(48, 16, 15, 2.2, '#2c3a52', 0), ...[-20, -12, -4, 4, 12, 20].map(x => bx('#d8dce2', x, 0, 7.55, 0.4, 16, 0.1)),
  bx('#c8ccd2', 0, 16, 0, 46, 1.2, 13), bx('#2c3a52', 0, 2, 7.6, 14, 10, 0.1, { g: 2 })] });
def('pagodaK', { s: 6.6, h: 38, val: 280, rs: 0, sh: [12, 12], pal: ['#5a3a26'], lm: '五重塔', parts: pagodaParts('#5a3a26', '#3e3a38', 5, 9.2, 6.0, '#b89a40') });
def('toriiB', { s: 5.0, h: 13, val: 80, rs: 0, sh: [12, 3], pal: ['#e8452c'], lm: '大鳥居', parts: torii('#e8452c', 13, 13, 0.6) });
def('romon', { s: 5.6, h: 13, val: 120, rs: 0, sh: [13, 7], pal: ['#e8452c'], lm: '朱色の楼門', parts: [
  bx('#8a8478', 0, 0, 0, 12.6, 0.6, 6.6), ...[-5, -1.7, 1.7, 5].map(x => cy('#e8452c', x, 0.6, 2.4, 0.34, 5.4)), ...[-5, -1.7, 1.7, 5].map(x => cy('#e8452c', x, 0.6, -2.4, 0.34, 5.4)),
  bx('#e8452c', 0, 6, 0, 12, 0.8, 6), bx('#f4f0e6', 0, 6.8, 0, 9.6, 2.6, 4.6), ...roofH('#4a4040', 0, 9.4, 0, 14, 8, 3.4, 3)] });
def('kame', { s: 0.8, h: 0.6, val: 2, rs: 0, sh: [1.8, 1.4], pal: ['#9a958a'], parts: [P('sph', '#9a958a', 0, 0.2, 0, 1.6, 0.6, 1.2), P('sph', '#8a8478', 0.95, 0.2, 0, 0.5, 0.4, 0.45)] });

const kyoto = {
  id: 'kyoto', name: '京都', sub: '五重塔・崖の上の舞台・鳥居のトンネル・町家', desc: '夕日にそまる 碁盤の目の町。川には 飛び石。東の山には 崖の上の舞台、南東には 朱色の鳥居がつづく。',
  ext: [-92, -90, 132, 106], start: [10, -12], time: 115, rivals: 3, diff: 0.68, stars: [8, 15, 24],
  pal: { sky: '#f3b183', fog: '#e8a07a', hemi: ['#ffe2c8', '#7a6a70', 0.62], sun: ['#ffb070', 0.62, -1, 0.55, 0.2], night: 0.45, ground: '#d6c4a2', outer: '#b8a888' },
  icon(g, w, h) {
    const gr = g.createLinearGradient(0, 0, 0, h); gr.addColorStop(0, '#f3a070'); gr.addColorStop(1, '#ffd8a8'); g.fillStyle = gr; g.fillRect(0, 0, w, h);
    g.fillStyle = '#e8452c'; for (let i = 0; i < 5; i++) { const x = w * (0.08 + i * 0.09), s = 1 - i * 0.12; g.fillRect(x, h * (0.5 + i * 0.03), w * 0.025, h * 0.45 * s); g.fillRect(x + w * 0.11 * s, h * (0.5 + i * 0.03), w * 0.025, h * 0.45 * s); g.fillRect(x - w * 0.02, h * (0.5 + i * 0.03), w * 0.17 * s, h * 0.04); }
    g.fillStyle = '#3e3a38'; for (let i = 0; i < 5; i++) { const y = h * (0.82 - i * 0.15), k = 1 - i * 0.1; g.beginPath(); g.moveTo(w * (0.75 - 0.16 * k), y); g.lineTo(w * (0.75 + 0.16 * k), y); g.lineTo(w * 0.75, y - h * 0.07); g.fill(); g.fillStyle = '#5a3a26'; g.fillRect(w * (0.75 - 0.06 * k), y, w * 0.12 * k, h * 0.08); g.fillStyle = '#3e3a38'; }
    g.fillStyle = '#b89a40'; g.fillRect(w * 0.745, h * 0.03, w * 0.012, h * 0.1);
  },
  build(B) {
    B.ground('#d6c4a2'); B.speck(-106, -104, 146, 120, 900, ['#ccb894', '#dccbab'], 0.8);
    const RD = { col: '#6a6460', sideCol: '#c8b89a', mid: '#e8dcc0' };
    // the hills in the east and the south-east
    B.poly([[96, -104], [146, -104], [146, 120], [112, 120], [104, 70], [98, 20]], '#7f9a5a', 'f'); B.speck(96, -100, 146, 120, 300, ['#6f8a4a', '#8faa6a'], 1.2);
    B.poly([[60, 78], [112, 72], [146, 76], [146, 120], [56, 120]], '#6f8a4a', 'f'); B.speck(56, 76, 146, 120, 200, ['#5f7a3a', '#7f9a5a'], 1.2);
    // the river with green banks
    B.rect(24, -104, 52, 120, '#a8c888', 'r'); B.rect(29, -104, 47, 120, '#6aa8c8', 'w'); B.speck(29, -104, 47, 120, 160, ['#8ac0d8', '#5a98b8'], 1.2);
    for (let x = 29.6; x < 47; x += 2.5) B.circ(x, -86, 1.55, '#a8a296', 'b');
    // the grid streets
    const xs = [-82, -56, -30, -4, 62, 90], zs = [-70, -40, -5, 35, 58, 86];
    for (const x of xs) street(B, [[x, -104], [x, 120]], x === -4 ? 10 : 7, Object.assign({ cars: x === -4 ? 8 : 4, ppl: 8, lampT: 'chochin', lampStep: 12, carT: CAR_T }, RD));
    for (const z of zs) street(B, [[-106, z], [z === -5 ? 106 : z > 70 ? 56 : 96, z]], z === -5 ? 12 : z === 86 ? 12 : 8, Object.assign({ cars: z === -5 || z === 86 ? 10 : 5, ppl: 10, lampT: 'chochin', lampStep: 12, carT: CAR_T, stuff: ['vend', 'bike', 'signA', 'stoneL'] }, RD));
    // a covered market lane, a stone-paved slope street towards the hill
    B.road([[-82, -22], [-4, -22]], 4.5, { col: '#c8a878', side: 0, mid: false }); B.walk([[-82, -22], [-4, -22]], 24, { w: 3, types: ['person', 'kimono'] });
    B.along([[-80, -22], [-6, -22]], 1.9, 4, ['stall', 'chochin', 'stall'], { need: 'any' });
    const slope = [[62, 20], [80, 26], [92, 40], [100, 52], [106, 46]];
    B.road(slope, 5, { col: '#b8aa94', side: 0, mid: false }); B.walk(slope, 24, { w: 3, types: ['kimono', 'person', 'kimono'] });
    B.along(slope, 4.6, 5, ['machiya'], { need: 'build' }); B.along(slope, -4.6, 5, ['machiya'], { need: 'build' }); B.along(slope, 2, 7, ['chochin', 'stall'], { need: 'any' });
    // the vermilion torii tunnel up the hill
    const tun = [[66, 104], [80, 98], [92, 102], [104, 94], [116, 98], [126, 88]];
    B.line(tun, 4, '#c8b48a', 'r'); B.o('toriiB', 60, 102, R90);
    B.along(tun, 0, 1.25, ['toriiS'], { need: 'any', yaw: R90 }); B.walk(tun, 12, { w: 1, types: ['person', 'kimono'] });
    // landmarks
    B.o('kiyomizu', 118, 46, 0);
    B.o('pagodaK', 98, 30, 0);
    B.o('romon', 102, -5, -R90);
    B.o('kyotoTower', -34, 72, 0);
    B.o('kyotoSta', -30, 100, 0);
    B.o('templeS', -60, -56, 0); B.o('templeS', -70, 50, 0); B.o('templeS', 80, -56, 0);
    // river banks: couples sitting evenly spaced, willows and cherry trees
    B.along([[26, -100], [26, 118]], 0, 9, ['sakura', 'tree', 'sakura'], { need: 'any' }); B.along([[50, -100], [50, 118]], 0, 9, ['tree', 'sakura'], { need: 'any' });
    for (let z = -60; z < 110; z += 4.5) if (z < -44 || z > -36) B.o(z % 9 ? 'kimono' : 'person', 27.6, z, -R90);
    B.walk([[51, -100], [51, 118]], 10, { w: 1.4 });
    for (let k = 0; k < 6; k++) B.o('kame', 30 + k * 3, -89 + (k % 2) * 6, k);
    B.crowd(52, -40, 96, -5, 30, { types: ['kimono', 'person'] });
    B.walk([[56, -5], [100, -5]], 6, { types: ['rickshaw'], spd: 1.6 });
    // machiya everywhere, temples and kura storehouses in between
    B.fill(52, -104, 100, 80, ['machiya', 'machiya', 'kura', 'machiya', 'houseJ'], { step: 5.6, alt: ['machiya'] });
    B.fill(-106, -104, 24, 120, ['machiya', 'machiya', 'houseJ', 'kura', 'shop', 'machiya', 'apt'], { step: 5.8, alt: ['machiya', 'houseJ'] });
    B.fill(-106, -104, 100, 120, ['machiya', 'machiya', 'kura'], { step: 4.8, jit: 0.2, p: 0.75, alt: ['stall'] });
    B.fill(98, -104, 146, 76, ['maple', 'pine', 'maple', 'sakura'], { step: 5, need: 'build', jit: 2.4, p: 0.8 });
    B.fill(56, 76, 146, 120, ['maple', 'pine', 'maple'], { step: 5, need: 'build', jit: 2.4, p: 0.8 });
    B.fill(-106, -104, 146, 120, ['maple', 'vend', 'bike', 'stoneL'], { step: 5, p: 0.3 });
  },
};

// ================================================================ 8. 名古屋
def('nagoyaCastle', { s: 13.6, h: 58, val: 860, rs: 0, sh: [30, 27], pal: ['#f6f4ee'], lm: '金のしゃちほこの城', parts: keep({ wall: '#f6f4ee', roof: '#6f9f8e', base: 14, tiers: 5, w: 23, d: 20, th: 5.4, shachi: 2.2 }) });
def('nagoyaTV', { s: 11.2, h: 84, val: 640, rs: 0, sh: [20, 20], pal: ['#b8c0c8'], lm: 'テレビ塔', parts: (() => {
  const c = '#aab4be', p = [];
  p.push(...lattice(c, 0, 44, 9.5, 4.0, 7, 0.55));
  p.push(bx('#d8dce2', 0, 42, 0, 12.5, 6, 12.5), ...bands(12.5, 48, 12.5, 2, '#2c3a52', 42, 2), bx('#9aa4ae', 0, 48, 0, 13, 0.6, 13));
  p.push(...lattice(c, 48.6, 64, 3.6, 2.2, 3, 0.4), bx('#d8dce2', 0, 63, 0, 6, 3, 6), bx('#2c3a52', 0, 63.8, 0, 6.1, 1.4, 6.1, { g: 2 }));
  p.push(cy('#e8eaee', 0, 66, 0, 0.7, 12), cy('#e8413a', 0, 72, 0, 0.75, 1.2), P('ico', '#ff4040', 0, 78.6, 0, 0.7, 0.7, 0.7, { g: 3 }));
  p.push(bx('#ffffff', 0, 31, 4.2, 5, 2.2, 0.2, { g: 1 }));
  return p;
})() });
def('oasis21', { s: 9.4, h: 16, val: 320, rs: 0, sh: [30, 22], pal: ['#bfe4f4'], lm: '空中の水の屋根', parts: [
  ...[[-9, -5], [9, -5], [-9, 5], [9, 5], [0, -8], [0, 8]].map(([x, z]) => seg('#e8eef4', x * 0.6, 0, z * 0.5, x, 13.2, z, 0.7)),
  P('cyl16', '#bfe4f4', 0, 13.6, 0, 30, 1.0, 22), P('cyl16', '#7fd0ff', 0, 14.2, 0, 26, 0.3, 18, { g: 1 }), P('ring', '#9fe8ff', 0, 14.0, 0, 30, 22, 30, { rx: R90, g: 3 }),
  P('cyl16', '#6a9a7a', 0, 0.05, 0, 26, 0.1, 18)] });
def('nagoyaSta', { s: 12.4, h: 102, val: 720, rs: 0, sh: [34, 22], pal: ['#b8c4d0'], lm: '駅のツインタワー', parts: [
  bx('#c8ccd2', 0, 0, 0, 34, 18, 22), ...bands(34, 18, 22, 3, '#2c3a52', 0),
  cy('#b8c4d0', -7.5, 18, 0, 7, 80, null, 'cyl16'), ...[...Array(30)].map((_, i) => cy('#3a4a60', -7.5, 20 + i * 2.6, 0, 7.05, 0.9, { g: 2 }, 'cyl16')), cy('#d8dce2', -7.5, 98, 0, 5, 2.4, null, 'cyl16'),
  bx('#a8b8c8', 8.5, 18, 0, 12, 70, 12), ...bands(12, 88, 12, 2.6, '#3a4a60', 18, 2, 8.5), cy('#a8b8c8', 8.5, 18, 6, 6, 70, null, 'cyl16'), bx('#d8dce2', 8.5, 88, 0, 9, 3, 9)] });
def('midland', { s: 10.2, h: 96, val: 500, rs: 0, sh: [19, 17], pal: ['#7f9ab8'], parts: [
  bx('#c8ccd2', 0, 0, 0, 20, 12, 17), bx('#7f9ab8', 0, 12, 0, 16, 78, 14), ...bands(16, 90, 14, 2.4, '#2c3a52', 12, 2), ...[-8, 8].map(x => bx('#e8eef4', x, 12, 0, 0.6, 78, 14.2)),
  P('dome', '#9fb2c8', 0, 90, 0, 16, 10, 14)] });

const nagoya = {
  id: 'nagoya', name: '名古屋', sub: '金のしゃちほこの城・テレビ塔・駅のツインタワー', desc: 'まっすぐで広い大通り。細長い公園のまん中に テレビ塔、北西には 金のしゃちほこが光る お城。',
  ext: [-122, -102, 114, 96], start: [10, 44], time: 125, rivals: 4, diff: 0.68, stars: [7, 13, 22],
  pal: { sky: '#b4dcff', hemi: ['#ffffff', '#8a92a0', 0.64], sun: ['#fff4e0', 0.52, -0.5, 1, 0.4], ground: '#d0cabe', outer: '#bfb9ad' },
  icon(g, w, h) {
    g.fillStyle = '#b4dcff'; g.fillRect(0, 0, w, h); g.fillStyle = '#7fbf6a'; g.fillRect(0, h * 0.86, w, h * 0.14);
    g.strokeStyle = '#8a96a2'; g.lineWidth = w * 0.02; g.beginPath(); g.moveTo(w * 0.52, h * 0.86); g.lineTo(w * 0.64, h * 0.3); g.lineTo(w * 0.76, h * 0.86); g.moveTo(w * 0.56, h * 0.65); g.lineTo(w * 0.72, h * 0.65); g.moveTo(w * 0.6, h * 0.45); g.lineTo(w * 0.68, h * 0.45); g.stroke();
    g.fillStyle = '#d8dce2'; g.fillRect(w * 0.57, h * 0.38, w * 0.14, h * 0.08); g.fillStyle = '#e8eaee'; g.fillRect(w * 0.635, h * 0.06, w * 0.012, h * 0.24);
    g.fillStyle = '#f6f4ee'; g.fillRect(w * 0.12, h * 0.5, w * 0.28, h * 0.36); g.fillStyle = '#6f9f8e'; g.beginPath(); g.moveTo(w * 0.06, h * 0.52); g.lineTo(w * 0.46, h * 0.52); g.lineTo(w * 0.26, h * 0.32); g.fill();
    g.fillStyle = '#e8c040'; g.beginPath(); g.arc(w * 0.18, h * 0.32, w * 0.03, 0, 7); g.arc(w * 0.34, h * 0.32, w * 0.03, 0, 7); g.fill();
  },
  build(B) {
    B.ground('#d0cabe'); B.speck(-136, -116, 128, 110, 900, ['#c8c2b6', '#d8d2c6'], 0.8);
    // castle with its square moat in the north-west
    B.rect(-102, -98, -36, -34, '#4a8ec0', 'w'); B.rect(-92, -88, -46, -44, '#9ccf78', 'f'); B.rect(-86, -82, -52, -50, '#d8cfb8', 'r');
    B.line([[-102, -98], [-36, -98], [-36, -34], [-102, -34]], 1, '#9a958a', null, { close: true, cap: 'butt' }); B.line([[-92, -88], [-46, -88], [-46, -44], [-92, -44]], 1, '#9a958a', null, { close: true, cap: 'butt' });
    B.rect(-73, -45, -65, -33, '#c8bca4', 'b');
    // the long central park strip with the TV tower
    B.rect(30, -116, 54, 110, '#8fc46a', 'r'); B.speck(30, -116, 54, 110, 200, ['#7fb85a', '#9fd07a'], 1);
    B.line([[42, -116], [42, 110]], 2.4, '#d8c8a8');
    // wide boulevards
    street(B, [[-136, -8], [128, -8]], 18, { cars: 20, ppl: 16, trees: ['tree'], carT: CITY_CAR });
    street(B, [[-136, 40], [128, 40]], 14, { cars: 16, ppl: 14, trees: ['tree'], carT: CITY_CAR });
    B.rect(-136, 74, 128, 98, '#5c6472', 'r'); B.rect(-136, 83, 128, 89, '#8fc46a', 'r'); street(B, [[-136, 78], [128, 78]], 8, { cars: 10, side: 0, lamp: false, carT: CITY_CAR, two: false, lane: 0 }); street(B, [[128, 94], [-136, 94]], 8, { cars: 10, side: 0, lamp: false, carT: CITY_CAR, two: false, lane: 0 });
    street(B, [[26, -116], [26, 110]], 8, { cars: 8, ppl: 8, carT: CITY_CAR }); street(B, [[58, -116], [58, 110]], 8, { cars: 8, ppl: 8, carT: CITY_CAR });
    street(B, [[-20, -116], [-20, 110]], 12, { cars: 12, ppl: 10, trees: ['tree'], carT: CITY_CAR });
    street(B, [[92, -116], [92, 110]], 12, { cars: 12, ppl: 10, trees: ['tree'], carT: CITY_CAR });
    street(B, [[-60, -30], [-60, 110]], 10, { cars: 8, ppl: 8, carT: CITY_CAR });
    street(B, [[-136, -50], [-104, -50]], 8, { cars: 4 }); street(B, [[-34, -60], [128, -60]], 10, { cars: 8, ppl: 8, carT: CITY_CAR });
    // railway on the west edge (bullet train + commuter lines)
    B.rect(-122, -116, -106, 110, '#8c8478', 'r');
    for (const x of [-119, -115, -111]) B.rail([[x, -116], [x, 110]], { w: 3.6, flag: null });
    B.train([[-119, 120], [-119, -120]], { cars: 6, col: '#2a5ab0', spd: 13 }); B.train([[-115, -120], [-115, 120]], { cars: 5, col: '#f08a24', spd: 10, p: 40 }); B.train([[-111, 120], [-111, -120]], { cars: 5, col: '#f08a24', spd: 10, p: 90 });
    // landmarks
    B.o('nagoyaCastle', -69, -70, 0);
    B.o('templeS', -56, -58, 0);
    B.o('nagoyaTV', 42, -30, 0);
    B.o('oasis21', 75, -32, 0);
    B.o('nagoyaSta', -86, 56, 0);
    B.o('midland', -86, 18, 0); B.o('glassT', -86, -18, 0); B.o('glassT', -40, 18, 0);
    // park: trees, fountains, flowers
    B.fill(30, -116, 54, 110, ['tree', 'tree', 'sakura', 'flower', 'bench'], { step: 5, need: 'any', jit: 1.6, p: 0.8 });
    for (const z of [-90, 10, 60]) B.o('fountain', 42, z, 0);
    B.crowd(31, -100, 53, 100, 50);
    B.fill(-90, -86, -48, -46, ['pine', 'tree', 'sakura'], { step: 6, need: 'build', jit: 2 });
    B.crowd(-86, -82, -52, -50, 12);
    // town
    B.fill(-106, -116, 128, 110, ['office', 'officeT', 'glassT', 'office', 'apt', 'shop', 'officeT'], { step: 11, alt: ['office', 'shop'] });
    B.fill(-106, -116, 128, 110, ['shop', 'vend', 'bike', 'tree'], { step: 5, p: 0.45 });
  },
};

// ================================================================ 9. 札幌（雪）
def('sapporoTV', { s: 12.8, h: 92, val: 780, rs: 0, sh: [22, 22], pal: ['#d8502a'], lm: '公園のはしのテレビ塔', parts: (() => {
  const c = '#d8582a', p = [bx('#e8e4dc', 0, 0, 0, 16, 9, 16), ...bands(16, 9, 16, 2.6, '#3a4a60', 0)];
  p.push(...lattice(c, 0, 58, 11, 3.6, 9, 0.6));
  p.push(bx('#1a2030', 0, 34, 7.4, 9, 4.4, 0.4), ...[-3, -1.2, 1.2, 3].map(x => bx('#4dff8a', x, 34.6, 7.65, 1.2, 3.2, 0.06, { g: 1 })), P('ico', '#4dff8a', 0, 36.2, 7.66, 0.3, 0.3, 0.1, { g: 3 }));
  p.push(bx('#d8dce2', 0, 56, 0, 9, 5, 9), ...bands(9, 61, 9, 1.7, '#2c3a52', 56, 2), bx(c, 0, 61, 0, 9.4, 0.6, 9.4));
  p.push(...lattice(c, 61.6, 76, 3.2, 1.6, 3, 0.4), cy('#eeeeee', 0, 76, 0, 0.6, 14), P('ico', '#ff4040', 0, 90.4, 0, 0.7, 0.7, 0.7, { g: 3 }));
  return p;
})() });
def('clockTower', { s: 5.6, h: 18, val: 170, rs: 0, sh: [12, 10], pal: ['#f8f6f0'], lm: '時計台', parts: [
  bx('#f8f6f0', 0, 0, 0, 11, 6.6, 8), ...[-4, -2, 0, 2, 4].map(x => bx('#3a4a60', x, 1.2, 4.02, 0.9, 1.6, 0.05, { g: 2 })), ...[-4, -2, 2, 4].map(x => bx('#3a4a60', x, 4.2, 4.02, 0.9, 1.4, 0.05, { g: 2 })),
  P('tri', '#c8402a', 0, 7.6, 0, 11.6, 2.2, 8.6), P('tri', '#f4f8ff', 0, 7.75, 0, 11.4, 1.95, 7.4),
  bx('#f8f6f0', 0, 6.6, 2.2, 4, 6.6, 4), ...[[0, 4.22, 1], [2.02, 2.2, 0], [-2.02, 2.2, 0]].map(([x, z, f]) => P('cyl12', '#ffffff', x, 10.8, z, 3, 0.15, 3, f ? { rx: R90, g: 2 } : { rz: R90, g: 2 })),
  bx('#2a2a2a', 0, 10.8, 4.32, 0.18, 1.2, 0.04), P('pyr', '#c8402a', 0, 14.2, 2.2, 5, 1.6, 5), bx('#f8f6f0', 0, 15, 2.2, 1.6, 1.6, 1.6), P('pyr', '#c8402a', 0, 16.6, 2.2, 2.2, 1.2, 2.2), cy('#8a8a8a', 0, 17.2, 2.2, 0.08, 1.2)] });
def('akarenga', { s: 9.6, h: 24, val: 400, rs: 0, sh: [28, 15], pal: ['#b4523a'], lm: '赤れんがの庁舎', parts: [
  bx('#b4523a', 0, 0, 0, 27, 12, 13), ...[2, 6.4, 10].flatMap(y => [...Array(12)].map((_, i) => bx('#f0ece4', -12 + i * 2.18, y - 0.5, 6.52, 1.0, 1.9, 0.06, { g: 2 }))),
  bx('#5a6a78', 0, 12, 0, 27.4, 1.4, 13.4), P('pyr', '#5a6a78', 0, 14, 0, 26, 2.4, 12), bx('#a84a32', 0, 0, 7, 6, 8, 2), P('tri', '#5a6a78', 0, 8.8, 7.3, 6.4, 1.6, 2.4, { ry: R90 }),
  cy('#b4523a', 0, 14, 0, 2.8, 5), cy('#f0ece4', 0, 16, 0, 2.85, 1.0, { g: 2 }), P('dome', '#4a6a7a', 0, 19, 0, 6.2, 5, 6.2), cy('#4a6a7a', 0, 21.4, 0, 0.6, 2.4), P('cone', '#4a6a7a', 0, 24.2, 0, 0.8, 1.2, 0.8),
  P('tri', '#f4f8ff', 0, 14.3, 0, 25.6, 1.9, 10)] });
def('beerHall', { s: 8.8, h: 30, val: 340, rs: 0, sh: [24, 16], pal: ['#a8482e'], lm: 'れんがのビアホール', parts: [
  bx('#a8482e', 0, 0, 0, 22, 11, 13), ...[2.5, 7].flatMap(y => [...Array(8)].map((_, i) => bx('#3a3030', -8.8 + i * 2.5, y - 1, 6.52, 1.3, 2.4, 0.06, { g: 2 }))), P('tri', '#5a4a40', 0, 12, 0, 22.6, 2.4, 13.6), P('tri', '#f4f8ff', 0, 12.2, 0, 22.4, 2.0, 12),
  cy('#9a4028', 9, 0, -4, 1.6, 28), cy('#3a3030', 9, 27.6, -4, 1.7, 0.6), bx('#ffd84d', -2, 8.6, 6.6, 8, 1.4, 0.1, { g: 1 }), bx('#8a3a24', -2, 0, 7.2, 5, 4, 1.4)] });
def('jrTowerS', { s: 11.2, h: 98, val: 560, rs: 0, sh: [36, 18], pal: ['#9aa8b8'], lm: '駅の高いタワー', parts: [
  bx('#c8ccd2', 0, 0, 0, 36, 16, 17), ...bands(36, 16, 17, 3, '#2c3a52', 0), bx('#9aa8b8', 4, 16, 0, 13, 76, 11), ...bands(13, 92, 11, 2.4, '#2c3a52', 16, 2, 4), bx('#c8ccd2', 4, 92, 0, 11, 4, 9), bx('#3f7fd0', -10, 11, 8.6, 9, 1.6, 0.1, { g: 1 })] });
def('snowBig', { s: 6.6, h: 15, val: 190, rs: 0, sh: [16, 12], pal: ['#f6fbff'], lm: '大きな雪の像', parts: [
  bx('#e8f0f8', 0, 0, 0, 15, 4, 11), bx('#f6fbff', 0, 4, -1, 11, 5, 7), ...[-5.6, 5.6].map(x => cy('#f6fbff', x, 4, -1, 1.8, 8, null, 'cyl12')), ...[-5.6, 5.6].map(x => P('cone', '#e8f0ff', x, 13.6, -1, 4.4, 3.4, 4.4)),
  cy('#f6fbff', 0, 9, -1, 2.4, 3, null, 'cyl12'), P('cone', '#e8f0ff', 0, 13.5, -1, 5.6, 3.2, 5.6), bx('#cfe0f0', 0, 4, 2.6, 3, 3.6, 0.2, { g: 2 }), ...[-3, 3].map(x => P('sph', '#ffffff', x, 5.6, 4.4, 2.2, 2.6, 2.2))] });
def('snowPile', { s: 0.9, h: 0.9, val: 2, rs: 0, sh: [2, 1.6], pal: ['#f4f8ff'], parts: [P('sph', '#f4f8ff', 0, 0.2, 0, 2.0, 1.2, 1.5), P('sph', '#ffffff', 0.3, 0.5, 0, 1.0, 0.6, 0.9)] });

const sapporo = {
  id: 'sapporo', name: '札幌', sub: '雪の大通公園とテレビ塔・時計台・赤れんが', desc: '雪にうもれた 碁盤の目の街。長い公園には 雪の像がならび、そのはしに テレビ塔。時計台や 赤れんがの建物も。',
  ext: [-116, -100, 116, 100], start: [-86, 2], time: 105, rivals: 4, diff: 0.8, stars: [6, 11, 19],
  pal: { sky: '#d4e4f0', fog: '#e4ecf4', hemi: ['#ffffff', '#b8c4d4', 0.7], sun: ['#ffffff', 0.42, -0.4, 1, 0.5], ground: '#eef3f8', outer: '#e8eef4' },
  icon(g, w, h) {
    g.fillStyle = '#d4e4f0'; g.fillRect(0, 0, w, h); g.fillStyle = '#f6fbff'; g.fillRect(0, h * 0.8, w, h * 0.2);
    g.strokeStyle = '#d8582a'; g.lineWidth = w * 0.022; g.beginPath(); g.moveTo(w * 0.58, h * 0.82); g.lineTo(w * 0.7, h * 0.2); g.lineTo(w * 0.82, h * 0.82); g.moveTo(w * 0.62, h * 0.62); g.lineTo(w * 0.78, h * 0.62); g.moveTo(w * 0.66, h * 0.42); g.lineTo(w * 0.74, h * 0.42); g.stroke();
    g.fillStyle = '#1a2030'; g.fillRect(w * 0.63, h * 0.5, w * 0.14, h * 0.07); g.fillStyle = '#4dff8a'; g.fillRect(w * 0.645, h * 0.515, w * 0.11, h * 0.04);
    g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w * 0.22, h * 0.7, h * 0.12, 0, 7); g.arc(w * 0.22, h * 0.5, h * 0.08, 0, 7); g.fill();
    g.fillStyle = '#fff'; for (let i = 0; i < 26; i++) { g.beginPath(); g.arc(w * ((i * 37 % 100) / 100), h * ((i * 61 % 80) / 100), w * 0.01, 0, 7); g.fill(); }
  },
  build(B) {
    B.ground('#eef3f8'); B.speck(-130, -114, 130, 114, 900, ['#ffffff', '#e2eaf2', '#dfe8f2'], 1);
    const RD = { col: '#a8b0ba', sideCol: '#dfe6ee', mid: '#e8eef4' };
    // the long park strip (E-W) ending at the TV tower
    B.rect(-130, -10, 64, 10, '#f8fbff', 'r'); B.line([[-130, 0], [64, 0]], 2, '#e0e8f0');
    for (const z of [-14, 14]) street(B, [[-130, z], [130, z]], 7, Object.assign({ cars: 10, ppl: 10, carT: CAR_T, lampStep: 13 }, RD));
    const xs = [-104, -74, -44, -14, 16, 46, 96];
    for (const x of xs) street(B, [[x, -114], [x, 114]], x === -14 ? 12 : 8, Object.assign({ cars: x === -14 ? 10 : 5, ppl: 8, carT: CAR_T }, RD));
    for (const z of [-44, -74, 44, 74]) street(B, [[-130, z], [130, z]], 8, Object.assign({ cars: 6, ppl: 8, carT: CAR_T, stuff: ['snowPile', 'vend', 'snowman'] }, RD));
    B.rect(-130, -100, 130, -92, '#8c8478', 'r'); for (const z of [-97, -94.5]) B.rail([[-130, z], [130, z]], { w: 2.4, flag: null, bed: '#a8a8a8' });
    B.train([[-140, -97], [140, -97]], { cars: 5, col: '#3fa36a', spd: 10 }); B.train([[140, -94.5], [-140, -94.5]], { cars: 5, col: '#3fa36a', spd: 10, p: 80 });
    // a streetcar loop through the south
    const tramLoop = [[-44, 59], [46, 59], [46, 92], [-44, 92]];
    B.line(tramLoop, 3.4, '#8a929c', 'r', { close: true }); B.line(tramLoop, 0.2, '#e0e4ea', null, { close: true });
    B.train(tramLoop, { close: true, type: 'tram', cars: 1, trains: 3, spd: 5.5, gap: 9.6 });
    // landmarks
    B.o('sapporoTV', 78, 0, 0);
    B.o('clockTower', 30, -30, 0);
    B.o('akarenga', -58, -60, 0);
    B.o('beerHall', 108, -60, 0);
    B.o('jrTowerS', -14, -82, 0);
    for (const x of [-112, -60, -26, 30]) B.o('snowBig', x, 0, 0);
    // the park: snow statues, snowmen, trees
    B.fill(-128, -9, 62, 9, ['snowArt', 'snowman', 'snowPine', 'snowman', 'snowArt', 'snowPine'], { step: 6, need: 'any', jit: 1.5, p: 0.7 });
    B.crowd(-128, -9, 62, 9, 60, { types: ['personW'] });
    B.fill(-66, -68, -50, -50, ['snowPine', 'snowman'], { step: 4, need: 'any', jit: 1 });
    // a neon crossing in the south
    B.fill(-14, 46, 46, 100, ['neonB', 'shopN', 'neonB', 'screenB'], { step: 8, alt: ['shopN'] });
    B.crowd(-10, 60, 40, 72, 20, { types: ['personW'] });
    // the rest of the town, snow on roofs
    B.fill(-130, -114, 130, 114, ['houseS', 'apt', 'office', 'houseS', 'officeT', 'shop', 'apt'], { step: 9, alt: ['houseS', 'shop'] });
    B.fill(-130, -114, 130, 114, ['snowman', 'snowPile', 'snowPine', 'vend'], { step: 5, p: 0.45 });
  },
};

// ================================================================ 10. 福岡（夜）
def('fukuokaTower', { s: 14.0, h: 124, val: 1050, rs: 0, sh: [16, 14], pal: ['#6f9fd8'], lm: '海辺のタワー', parts: [
  bx('#d8dce2', 0, 0, 0, 18, 6, 16), bx('#2c3a52', 0, 1, 8.02, 12, 3, 0.1, { g: 2 }),
  P('cyl3', '#6f9fd8', 0, 6 + 52, 0, 13, 104, 13), ...[...Array(14)].map((_, i) => P('cyl3', ['#ff6bb0', '#4dc3ff', '#ffd84d', '#7be08a'][i % 4], 0, 10 + i * 6.4, 0, 13.3, 0.9, 13.3, { g: 3 })),
  P('cyl3', '#2c3a52', 0, 104, 0, 13.4, 4.4, 13.4, { g: 2 }), P('cyl3', '#d8dce2', 0, 110.5, 0, 10, 1.4, 10), cy('#d8dce2', 0, 111, 0, 0.6, 12), P('ico', '#ff4040', 0, 123.4, 0, 0.8, 0.8, 0.8, { g: 3 })] });
def('dome', { s: 13.2, h: 34, val: 820, rs: 0, sh: [32, 32], pal: ['#c8ccd4'], lm: 'ドーム球場', parts: [
  cy('#d8dce2', 0, 0, 0, 16.5, 11, null, 'cyl16'), cy('#2c3a52', 0, 3, 0, 16.6, 2, { g: 2 }, 'cyl16'), P('dome', '#c8ccd4', 0, 11, 0, 33, 22, 33),
  ...[0, 0.785, 1.57, 2.36].map(a => P('ring', '#a8b0bc', 0, 11, 0, 33, 22, 30, { ry: a })), cy('#e8eaee', 0, 21.6, 0, 3, 0.6, null, 'cyl16'), bx('#ffd84d', 0, 7, 16.4, 8, 1.6, 0.2, { g: 1 })] });
def('seaHawk', { s: 9.2, h: 64, val: 340, rs: 0, sh: [22, 12], pal: ['#e8eaee'], parts: [
  bx('#d8dce2', 0, 0, 0, 24, 8, 12), cy('#e8eaee', 0, 8, 0, 9, 52, null, 'cyl16'), ...[...Array(19)].map((_, i) => cy('#3a4a60', 0, 10 + i * 2.6, 0, 9.05, 0.9, { g: 2 }, 'cyl16')), P('dome', '#9fb2c8', 0, 60, 0, 14, 6, 14)] });
def('canalCity', { s: 10.4, h: 22, val: 420, rs: 0, sh: [32, 24], pal: ['#c8502a'], lm: '曲線のショッピングモール', parts: (() => {
  const p = [], cols = ['#c8502a', '#2a5a8a', '#e8b040', '#7a3a6a', '#3a8a6a', '#d8743a', '#4a4a8a', '#c8a030'];
  for (let i = 0; i < 8; i++) {
    const a = -1.1 + i * 0.31, x = Math.sin(a) * 14, z = -8 + Math.cos(a) * 14 - 8, H = 12 + (i % 3) * 4;
    p.push(P('box', cols[i], x, H / 2, z, 5.2, H, 6, { ry: a }), P('box', '#fff1c8', x + Math.sin(a) * 3.05, 3, z + Math.cos(a) * 3.05, 4.4, 2, 0.1, { ry: a, g: 2 }), P('box', '#ffffff', x + Math.sin(a) * 3.1, H - 2, z + Math.cos(a) * 3.1, 3.4, 1.2, 0.1, { ry: a, g: 3 }));
  }
  for (let i = 0; i < 7; i++) { const a = -0.95 + i * 0.31; p.push(P('box', '#5ab0e8', Math.sin(a) * 19, 0.15, -16 + Math.cos(a) * 19, 6, 0.3, 2.4, { ry: a, g: 1 })); }
  p.push(bx('#b8b0a4', 0, 0, -10, 30, 6, 8));
  return p;
})() });
def('hakataSta', { s: 10.6, h: 24, val: 400, rs: 0, sh: [16, 40], pal: ['#b8c0c8'], lm: '駅ビル', parts: [
  bx('#b8c0c8', 0, 0, 0, 15, 18, 38), ...bands(15, 18, 38, 2.6, '#2c3a52', 0), bx('#2c3a52', -7.55, 2, 0, 0.1, 12, 16, { g: 2 }), bx('#3f9a5a', 0, 18, 0, 13, 1, 34),
  ...[-12, -4, 4, 12].map(z => P('tri', '#3f9a5a', 0, 19.4, z, 12, 1.8, 4, { ry: R90 })), P('cyl12', '#ffffff', -7.6, 15, 0, 3, 0.2, 3, { rz: R90, g: 1 }), bx('#3f7fd0', -7.62, 11, 10, 0.1, 1.4, 8, { g: 1 })] });

const fukuoka = {
  id: 'fukuoka', name: '福岡', sub: '海辺のタワー・ドーム球場・川ぞいの屋台', desc: '夜の福岡。海辺に 光るタワーとドーム。川にはさまれた中洲には 屋台の あかりがならぶ。',
  ext: [-122, -78, 146, 82], start: [64, 22], time: 110, rivals: 5, diff: 0.85, stars: [5, 10, 17],
  pal: { sky: '#0c1430', fog: '#121a36', hemi: ['#8a94c8', '#2a2438', 0.55], sun: ['#b8c0ff', 0.24, -0.3, 1, 0.6], night: 1, ground: '#3a3842', outer: '#1a2a44' },
  icon(g, w, h) {
    g.fillStyle = '#0c1430'; g.fillRect(0, 0, w, h); g.fillStyle = '#1a2a44'; g.fillRect(0, h * 0.78, w, h * 0.22);
    g.fillStyle = '#6f9fd8'; g.beginPath(); g.moveTo(w * 0.2, h * 0.82); g.lineTo(w * 0.25, h * 0.05); g.lineTo(w * 0.3, h * 0.82); g.fill();
    ['#ff6bb0', '#4dc3ff', '#ffd84d'].forEach((c, i) => { g.fillStyle = c; g.fillRect(w * 0.215, h * (0.3 + i * 0.15), w * 0.07, h * 0.03); });
    g.fillStyle = '#c8ccd4'; g.beginPath(); g.ellipse(w * 0.62, h * 0.8, w * 0.26, h * 0.3, 0, PI, 0); g.fill();
    for (let i = 0; i < 6; i++) { g.fillStyle = '#ff5a3a'; g.beginPath(); g.arc(w * (0.1 + i * 0.16), h * 0.92, w * 0.025, 0, 7); g.fill(); }
  },
  build(B) {
    B.ground('#3a3842'); B.speck(-136, -92, 160, 96, 900, ['#42404a', '#34323c'], 0.8);
    const RD = { col: '#2a2c34', sideCol: '#4a4652', mid: '#8a8478' }, WAT = '#1f4f80';
    // the bay in the north, a sandy beach, two river branches with the island between them
    B.rect(-136, -92, 160, -54, WAT, 'w'); B.speck(-136, -92, 160, -54, 400, ['#2a5a80', '#ffd84d', '#4dc3ff'], 0.3);
    B.rect(-122, -54, -30, -42, '#9a8f74', 'r'); B.speck(-122, -54, -30, -42, 200, ['#a89c80', '#8a8068'], 0.6);
    B.rect(44, -54, 56, 96, WAT, 'w'); B.rect(72, -54, 80, 96, WAT, 'w'); B.speck(44, -54, 80, 96, 260, ['#ffd84d', '#ff6bb0', '#2a4a70'], 0.22);
    B.rect(56, -54, 72, 96, '#45404c', 'f');
    B.line([[56, -54], [56, 96]], 0.4, '#8a8090'); B.line([[44, -54], [44, 96]], 0.4, '#8a8090'); B.line([[72, -54], [72, 96]], 0.4, '#8a8090'); B.line([[80, -54], [80, 96]], 0.4, '#8a8090');
    // streets (they become bridges over the rivers)
    for (const z of [-30, 4, 40, 70]) street(B, [[-136, z], [160, z]], z === 4 ? 14 : 9, Object.assign({ cars: z === 4 ? 16 : 10, ppl: 12, carT: CITY_CAR }, RD));
    for (const x of [-100, -60, -10, 24, 100, 120]) street(B, [[x, -50], [x, 96]], 8, Object.assign({ cars: 5, ppl: 8, carT: CITY_CAR }, RD));
    street(B, [[-136, -46], [40, -46]], 8, Object.assign({ cars: 6, ppl: 8, carT: CITY_CAR }, RD));
    street(B, [[64, -50], [64, 96]], 6, Object.assign({ cars: 2, ppl: 14, stuff: ['chochin', 'signA'] }, RD));
    // the tracks by the station
    B.rect(134, -92, 146, 96, '#5a5450', 'r'); for (const x of [137, 141]) B.rail([[x, -92], [x, 96]], { w: 3.4, flag: null, bed: '#5a5450' });
    B.train([[137, 110], [137, -110]], { cars: 6, col: '#2a5ab0', spd: 13 }); B.train([[141, -110], [141, 110]], { cars: 5, col: '#e8413a', spd: 10, p: 60 });
    // landmarks
    B.o('fukuokaTower', -88, -26, 0);
    B.o('dome', -40, -14, 0); B.o('seaHawk', -12, -28, R90 * 0.2);
    B.o('canalCity', 96, 56, 0);
    B.o('hakataSta', 126, 18, 0);
    // food stalls along the island's riverbank and in the business district
    B.rect(56, -50, 60, 94, '#5a5260', 'r');
    B.along([[58, -26], [58, 0]], 0, 3.6, ['yatai'], { need: 'any', yaw: -R90 }); B.along([[58, 8], [58, 36]], 0, 3.6, ['yatai'], { need: 'any', yaw: -R90 }); B.along([[58, 44], [58, 66]], 0, 3.6, ['yatai'], { need: 'any', yaw: -R90 });
    B.along([[60.5, -26], [60.5, 66]], 0, 4, ['chochin'], { need: 'any' });
    B.walk([[57.4, -50], [57.4, 94]], 30, { w: 1.4 }); B.crowd(-8, 6, 22, 38, 24);
    B.along([[0, 10], [20, 10]], 0, 4, ['yatai'], { need: 'any' });
    B.fill(60, -50, 72, 96, ['neonB', 'shopN', 'neonB', 'screenB'], { step: 7, alt: ['shopN'] });
    // beach: parasols, palms, people; boats on the rivers and the bay
    B.fill(-122, -54, -30, -42, ['umbrella', 'palm', 'umbrella', 'bench'], { step: 5, need: 'any', jit: 2 });
    B.crowd(-120, -53, -32, -43, 30);
    B.boats([[50, -70], [50, 100]], 3, { types: ['yakata', 'boat', 'tourBoat'], off: 0 });
    B.boats([[-136, -74], [160, -70]], 3, { types: ['ship', 'boat', 'tourBoat'], mode: 'wrap', off: 0, spd: 2.6 });
    // town
    B.fill(-136, -92, 160, 96, ['neonB', 'office', 'officeT', 'shopN', 'apt', 'glassT', 'shop', 'office'], { step: 9, alt: ['shopN', 'shop'] });
    B.fill(-136, -92, 160, 96, ['shopN', 'shop', 'neonB', 'apt'], { step: 5.5, alt: ['stall'] });
    B.fill(-136, -92, 160, 96, ['shopN', 'vend', 'bike', 'tree', 'stall'], { step: 5, p: 0.4 });
  },
};

// ================================================================ 11〜14. 神奈川の街（最初から自由に選べる：free）
// 藤沢・湘南台・上大岡・湘南高校付近：OpenStreetMap の地図データ（hole/cities/*.json、tools/osm-city.js で作成）から作る実寸の街。
// 建物の形・道・線路・川・高さ（国土地理院の標高）は地図どおり。駅や学校など公共の名前は使ってよいが、お店の名前・ロゴは書かない。
// ---- shared things of the four maps
const SH_O = '#f08a24', SH_G = '#2f8a4a';
const KCAR = ['carJ', 'carJ', 'taxi', 'carJ', 'busJ', 'taxi'], KSTUFF = ['vend', 'bike', 'trash', 'bike', 'vend'];
// commuter train with the orange + green stripes of the coast line
def('shonanCar', { s: 4.6, h: 3.8, val: 50, rs: 1, sh: [11.4, 3.4], pal: ['#e8eaee'], parts: [
  bx('#dfe3e8', 0, 0.5, 0, 10.6, 3.1, 3.0), bx(SH_G, 0, 0.72, 0, 10.65, 0.5, 3.05), bx(SH_O, 0, 1.22, 0, 10.65, 0.42, 3.05), bx('#2c3a4e', 0, 1.9, 0, 9.8, 0.9, 3.05, { g: 2 }),
  bx('#9aa1ab', 0, 3.6, 0, 9.6, 0.2, 2.4), bx('#3a3f48', 3.6, 0, 0, 2.2, 0.55, 2.2), bx('#3a3f48', -3.6, 0, 0, 2.2, 0.55, 2.2), bx('#2c3a4e', 5.32, 1.9, 0, 0.06, 1.2, 2.2, { g: 2 }),
  bx(SH_O, 5.33, 0.7, 0, 0.06, 0.9, 2.6)] });
// red commuter train with a white window band
def('redCar', { s: 4.6, h: 3.8, val: 50, rs: 1, sh: [11.4, 3.4], pal: ['#d8282a'], parts: [
  bx('#d8282a', 0, 0.5, 0, 10.6, 3.1, 3.0), bx('#f4f2ec', 0, 1.7, 0, 10.65, 1.3, 3.05), bx('#2c3a4e', 0, 1.95, 0, 9.8, 0.85, 3.08, { g: 2 }),
  bx('#9aa1ab', 0, 3.6, 0, 9.6, 0.2, 2.4), bx('#3a3f48', 3.6, 0, 0, 2.2, 0.55, 2.2), bx('#3a3f48', -3.6, 0, 0, 2.2, 0.55, 2.2), bx('#2c3a4e', 5.32, 1.9, 0, 0.06, 1.2, 2.2, { g: 2 })] });
// a little two-car tram (green and cream), one object: it runs back and forth on its single track
def('miniTram', { s: 3.6, h: 3.9, val: 44, rs: 1, sh: [16.4, 2.8], pal: ['#2f7a4a'], parts: [
  ...[-4.05, 4.05].flatMap(x => [bx('#ffffff', x, 0.35, 0, 7.9, 1.45, 2.4, T1), bx('#f2ead2', x, 1.8, 0, 7.9, 1.35, 2.4), bx('#2c3a4e', x, 2.0, 0, 7.3, 0.8, 2.44, { g: 2 }),
    bx('#ffffff', x, 3.15, 0, 7.7, 0.3, 2.2, T1), bx('#3a3f48', x, 0, 0, 5.6, 0.4, 1.8)]),
  bx('#2c3a4e', 8.02, 1.9, 0, 0.06, 1.0, 1.8, { g: 2 }), bx('#2c3a4e', -8.02, 1.9, 0, 0.06, 1.0, 1.8, { g: 2 }), bx('#fff6c8', 8.03, 0.9, 0, 0.05, 0.3, 0.5, { g: 2 }),
  bx('#555', 2, 3.45, 0, 1.4, 0.2, 0.9), seg('#333', 2, 3.5, 0, 2.8, 3.9, 0, 0.07)] });
// Japanese black pine of the coast (leaning trunk, flat cloud foliage)
def('pineK', { s: 1.4, h: 6.6, val: 8, rs: 0, sh: [3.2, 3.2], pal: ['#24573a', '#2c6040', '#1f4f34'], parts: [
  seg('#5a4030', 0, 0, 0, 0.5, 3.6, 0.1, 0.42), seg('#5a4030', 0.5, 3.6, 0.1, -0.2, 5.6, 0, 0.3),
  P('ico', '#ffffff', 0.9, 3.7, 0.3, 3.4, 1.1, 2.9, T1), P('ico', '#ffffff', -0.9, 4.5, -0.4, 2.6, 1.0, 2.4, T1), P('ico', '#ffffff', 0.2, 5.4, 0.1, 3.0, 1.0, 2.6, T1),
  P('ico', '#ffffff', -0.1, 6.2, 0, 1.8, 0.8, 1.6, T1)] });
def('hedge', { s: 1.0, h: 1.3, val: 2, rs: 0, sh: [3.2, 1.0], pal: ['#4f9a52', '#5aa65a', '#3f8a4e'], parts: [
  bx('#ffffff', 0, 0, 0, 3.0, 1.0, 0.8, T1), P('ico', '#ffffff', -0.8, 1.0, 0, 1.4, 0.6, 0.9, T1), P('ico', '#ffffff', 0.7, 1.0, 0, 1.5, 0.6, 0.9, T1)] });
// pedestrian deck: a slab on posts at 5 m (people walk on top)
def('busShelter', { s: 1.9, h: 2.8, val: 10, rs: 0, sh: [4.4, 1.8], pal: ['#c8d4e0'], parts: [
  bx('#c8d4e0', 0, 2.5, 0, 4.4, 0.18, 1.8), ...[-2, 2].map(x => cy('#7a8896', x, 0, -0.7, 0.07, 2.5)), bx('#cfefff', 0, 0.4, -0.8, 3.8, 2.0, 0.05), bx('#8a6a4a', 0, 0.45, -0.45, 3.0, 0.1, 0.5),
  bx('#ffffff', 2.2, 0.8, 0.6, 0.12, 1.6, 0.5, { g: 1 })] });
def('kusu', { s: 2.0, h: 8.4, val: 14, rs: 0, sh: [5.6, 5.6], pal: ['#3f7f45', '#4a8a4a'], parts: [
  cy('#6a4a34', 0, 0, 0, 0.5, 3.2), P('ico', '#ffffff', 0, 4.6, 0, 5.4, 3.6, 5.4, T1), P('ico', '#ffffff', 0.8, 6.6, 0.4, 3.4, 2.6, 3.4, T1), P('ico', '#ffffff', -1.4, 5.8, -0.6, 2.6, 2.0, 2.6, T1)] });
def('staEntry', { s: 1.9, h: 3.2, val: 12, rs: 0, sh: [4.4, 3.4], pal: ['#cfe6f6'], parts: [
  bx('#8a96a2', 0, 0, 0, 4.2, 1.0, 3.2), bx('#3a3f48', 0, 0.05, 0.9, 3.2, 0.9, 1.4), bx('#cfe6f6', 0, 1.0, -0.3, 4.2, 2.0, 2.6, { g: 2 }), P('tri', '#6a8aa8', 0, 3.25, -0.3, 4.4, 0.5, 2.8),
  bx('#2a6fd0', 1.6, 2.2, 1.05, 0.9, 0.5, 0.05, { g: 1 })] });
def('playSlide', { s: 1.5, h: 2.6, val: 6, rs: 0, sh: [3.4, 1.6], pal: ['#ff6b6b', '#ffd84d', '#4dc3ff'], parts: [
  bx('#ffffff', -1.0, 1.6, 0, 1.2, 0.2, 1.2, T1), ...[-1.5, -0.5].flatMap(x => [cy('#9aa6b4', x, 0, -0.5, 0.06, 2.4), cy('#9aa6b4', x, 0, 0.5, 0.06, 2.4)]),
  P('box', '#ffffff', 0.7, 0.9, 0, 2.6, 0.12, 0.9, { t: 1, rz: -0.6 }), seg('#9aa6b4', -1.6, 0, 0, -1.6, 1.6, 0, 0.1)] });
def('soccerGoal', { s: 3.0, h: 2.5, val: 8, rs: 0, sh: [7.6, 2.2], pal: ['#ffffff'], parts: [
  ...[-3.66, 3.66].map(x => bx('#ffffff', x, 0, 0, 0.14, 2.44, 0.14)), bx('#ffffff', 0, 2.38, 0, 7.46, 0.14, 0.14), bx('#e8ecef', 0, 0.02, -1.6, 7.3, 2.3, 0.05),
  P('box', '#e8ecef', 0, 1.2, -0.8, 7.3, 0.05, 2.6, { rx: 0.9 })] });
def('backNet', { s: 4.0, h: 8.4, val: 30, rs: 0, sh: [10, 3], pal: ['#3f7a4a'], parts: [
  ...[-4.6, -1.6, 1.6, 4.6].map(x => cy('#6a7682', x, 0, 0, 0.12, 8.2)), bx('#5a8a6a', 0, 1, 0, 9.4, 7, 0.06), P('box', '#5a8a6a', 0, 7.6, 1.0, 9.4, 0.06, 2.2, { rx: -0.6 }), bx('#3a4a5a', 0, 0, 0, 9.4, 1, 0.12)] });
def('fenceG', { s: 2.4, h: 2.2, val: 6, rs: 0, sh: [6.2, 0.6], pal: ['#3f7a4a'], parts: [
  ...[-3, 0, 3].map(x => cy('#5a6a5a', x, 0, 0, 0.06, 2.1)), bx('#5a8a6a', 0, 0.1, 0, 6, 1.9, 0.04), bx('#5a6a5a', 0, 2.0, 0, 6, 0.08, 0.08)] });
def('student', { s: 0.36, h: 1.7, val: 2, rs: 1, sh: [0.8, 0.8], pal: ['#1e2a44', '#24304a', '#2a2a36'], parts: [
  P('cyl6', '#2a3040', 0, 0.42, 0, 0.36, 0.84, 0.3), P('cyl6', '#ffffff', 0, 1.1, 0, 0.56, 0.72, 0.44, T1), bx('#f4f4f0', 0, 1.36, 0.16, 0.18, 0.2, 0.1), P('ico', '#ffd6ad', 0, 1.56, 0, 0.38, 0.38, 0.38),
  P('ico', '#2a221c', 0, 1.67, -0.02, 0.4, 0.22, 0.4), bx('#3a3a40', 0.32, 0.8, 0, 0.12, 0.5, 0.5)] });
// utility pole (電柱) with a transformer and wires stubs; traffic signal; concrete block wall
def('denchu', { s: 0.5, h: 10.5, val: 4, rs: 0, sh: [0.8, 0.8], pal: ['#b8b4ac'], parts: [
  cy('#b8b4ac', 0, 0, 0, 0.16, 10.2, null, 'cyl6'), bx('#8a8a86', 0, 8.6, 0, 1.6, 0.12, 0.12), bx('#8a8a86', 0, 9.6, 0, 1.2, 0.12, 0.12),
  cy('#9a9c9e', 0.32, 6.8, 0, 0.26, 0.9), bx('#e8e8e4', 0, 2.6, 0.17, 0.3, 0.8, 0.03)] });
def('signal', { s: 0.6, h: 5.6, val: 4, rs: 0, sh: [0.8, 0.8], pal: ['#9aa0a6'], parts: [
  cy('#9aa0a6', 0, 0, 0, 0.1, 5.4, null, 'cyl6'), bx('#9aa0a6', 1.4, 5.1, 0, 2.8, 0.12, 0.12), bx('#3a3e44', 2.6, 4.6, 0, 1.3, 0.42, 0.3),
  P('cyl', '#3fd07a', 2.15, 4.81, 0.16, 0.26, 0.05, 0.26, { rx: R90, g: 1 }), P('cyl', '#f0b030', 2.6, 4.81, 0.16, 0.26, 0.05, 0.26, { rx: R90 }), P('cyl', '#e8413a', 3.05, 4.81, 0.16, 0.26, 0.05, 0.26, { rx: R90 }),
  bx('#3a3e44', 0.2, 2.2, 0, 0.3, 0.8, 0.25), bx('#4dc3ff', 0.2, 2.6, 0.13, 0.18, 0.2, 0.02, { g: 1 })] });
def('blockWall', { s: 1.6, h: 1.6, val: 4, rs: 0, sh: [4.0, 0.4], pal: ['#c4c0b6', '#b8b4aa', '#cfcac0'], parts: [
  bx('#ffffff', 0, 0, 0, 3.9, 1.5, 0.15, T1), ...[0.4, 0.8, 1.2].map(y => bx('#a8a49a', 0, y, 0.08, 3.9, 0.03, 0.01)), bx('#a8a49a', 0, 1.5, 0, 4.0, 0.08, 0.2)] });
// Odakyu-like commuter car (silver with a blue band)
def('silverCar', { s: 4.6, h: 3.8, val: 50, rs: 1, sh: [11.4, 3.4], pal: ['#2a6fd0'], parts: [
  bx('#dfe3e8', 0, 0.5, 0, 10.6, 3.1, 3.0), bx('#ffffff', 0, 1.28, 0, 10.65, 0.36, 3.05, T1), bx('#2c3a4e', 0, 1.9, 0, 9.8, 0.9, 3.05, { g: 2 }),
  bx('#9aa1ab', 0, 3.6, 0, 9.6, 0.2, 2.4), bx('#3a3f48', 3.6, 0, 0, 2.2, 0.55, 2.2), bx('#3a3f48', -3.6, 0, 0, 2.2, 0.55, 2.2), bx('#2c3a4e', 5.32, 1.9, 0, 0.06, 1.2, 2.2, { g: 2 })] });

// ---- English for the Kanagawa cities (city texts and the landmark names)
if (window.KoboI18n) KoboI18n.add({ en: {
  '藤沢': 'Fujisawa', '湘南台': 'Shonandai', '上大岡': 'Kami-Ooka', '湘南高校付近': 'Near Shonan High School',
  '藤沢駅・南北のデッキ・江ノ電の高架': 'Fujisawa Station, the north and south decks, the Enoden viaduct',
  '藤沢駅を中心に 半径およそ1kmの実寸の街。JR・小田急・江ノ電の駅と、北口・南口の空中デッキ。地図データどおりの道と建物を のみこもう。': 'A life-size map of about 1 km around Fujisawa Station: the JR, Odakyu and Enoden stations and the raised decks of the north and south exits. Every street and building comes from the map.',
  '地下の駅の入口・地球儀のドーム・広い大通り': 'Underground station entrances, the globe dome, wide avenues',
  '湘南台駅を中心に 半径およそ1kmの実寸の街。電車は地下を走り、地上には駅の入口。東には 地球儀のようなドームの 湘南台文化センター。': 'A life-size map of about 1 km around Shonandai Station. The trains run underground; above ground are the station entrances. To the east stands the Shonandai Culture Center with its globe-shaped dome.',
  '京急の高架・駅前の高層タワー・大岡川・坂の街': 'The Keikyu viaduct, the tower by the station, the Ooka River, hillside streets',
  '上大岡駅を中心に 半径およそ1.2kmの実寸の街。谷あいの駅を 京急の高架が南北に走り、大岡川ぞいには桜。まわりの丘は 標高データどおりの坂の住宅街。': 'A life-size map of about 1.2 km around Kami-Ooka Station. The Keikyu viaduct runs north to south through the valley, cherry trees line the Ooka River, and the hills around are real elevation data.',
  '湘南高校・藤沢本町駅・せまい通学路': 'Shonan High School, Fujisawa-Hommachi Station, the narrow school path',
  '湘南高校から 藤沢本町駅までの 実寸の街。生徒が歩く 日本一せまいと言われる 細い通学路も 地図どおり。': 'A life-size map from Shonan High School to Fujisawa-Hommachi Station, including the very narrow path the students walk, said to be the narrowest school route in Japan.',
  '藤沢駅': 'Fujisawa Station', '江ノ電が入る駅ビル': 'the station building of the Enoden', '北口の駅前ビル': 'the big building at the north exit', '藤沢市役所': 'Fujisawa City Hall',
  '湘南台駅': 'Shonandai Station', '地球儀のドーム': 'the globe dome', '湘南台文化センター': 'Shonandai Culture Center',
  '上大岡駅': 'Kami-Ooka Station', '駅前の高層タワー': 'the tower by the station', '駅ビルのデパート': 'the department store of the station', '大岡川': 'Ooka River',
  '藤沢本町駅': 'Fujisawa-Hommachi Station', '湘南高校の校舎': 'a Shonan High School building', '湘南高校の体育館': 'the Shonan High School gym', '日本一せまい通学路': 'the narrowest school path in Japan',
  '© OpenStreetMap contributors': '© OpenStreetMap contributors',
} });

// ---- the four maps: data from hole/cities/<id>.json (decoded and built by hole/realcity.js)
// real.areas: the part of the map that can be eaten (camp = まちめぐり / ひとりで, battle = CPU・オンライン対戦; view = the whole map)
// real.lm: [x, z, name] buildings with a name (the toast when swallowed), real.labels: extra name tags in the view mode
const KCARS = ['carJ', 'carJ', 'taxi', 'carJ', 'truck', 'carJ', 'carJ'];
const fujisawa = {
  id: 'fujisawa', name: '藤沢', free: 1, v: 1, data: 'cities/fujisawa.json', sub: '藤沢駅・南北のデッキ・江ノ電の高架',
  desc: '藤沢駅を中心に 半径およそ1kmの実寸の街。JR・小田急・江ノ電の駅と、北口・南口の空中デッキ。地図データどおりの道と建物を のみこもう。',
  ext: [-1000, -1000, 1000, 1000], time: 180, rivals: 2, diff: 0.48, stars: [3, 5, 8],
  pal: { sky: '#bfe2ff', hemi: ['#ffffff', '#8796a8', 0.7], sun: ['#fff1dc', 0.55, -0.5, 1, 0.4], ground: '#d6d0c3', outer: '#c9c3b6' },
  real: {
    center: [0, 0], areas: { camp: [-340, -330, 360, 370], battle: [-220, -210, 230, 240] }, start: { camp: [26, -70], battle: [26, -70] },
    lm: [[-21, -17, '藤沢駅'], [-120, -2, '藤沢駅'], [9, 121, '江ノ電が入る駅ビル'], [-57, -129, '北口の駅前ビル'], [323, -20, '藤沢市役所']],
    trains: { 1: { type: 'shonanCar', cars: 5, spd: 11, n: 2 }, 2: { type: 'silverCar', cars: 4, spd: 9, n: 2 }, 3: { type: 'miniTram', cars: 1, spd: 4.5, n: 1, mode: 'pong' } },
    cars: KCARS, people: ['person', 'person', 'personW', 'student'],
  },
  icon(g, w, h) {
    g.fillStyle = '#bfe2ff'; g.fillRect(0, 0, w, h); g.fillStyle = '#3f8fc4'; g.fillRect(0, h * 0.84, w, h * 0.16);
    g.fillStyle = '#8c8478'; g.fillRect(0, h * 0.62, w, h * 0.1);
    g.fillStyle = '#d8d4cc'; g.fillRect(w * 0.3, h * 0.3, w * 0.4, h * 0.3); g.fillStyle = SH_G; g.fillRect(w * 0.3, h * 0.42, w * 0.4, h * 0.04); g.fillStyle = SH_O; g.fillRect(w * 0.3, h * 0.46, w * 0.4, h * 0.04);
    g.fillStyle = '#c4bfb4'; g.fillRect(0, h * 0.5, w * 0.3, h * 0.05); g.fillRect(w * 0.7, h * 0.5, w * 0.3, h * 0.05);
    g.fillStyle = '#2f7a4a'; g.fillRect(w * 0.1, h * 0.74, w * 0.22, h * 0.07); g.fillStyle = '#f2ead2'; g.fillRect(w * 0.1, h * 0.7, w * 0.22, h * 0.05);
  }
};
const shonandai = {
  id: 'shonandai', name: '湘南台', free: 1, v: 1, data: 'cities/shonandai.json', sub: '地下の駅の入口・地球儀のドーム・広い大通り',
  desc: '湘南台駅を中心に 半径およそ1kmの実寸の街。電車は地下を走り、地上には駅の入口。東には 地球儀のようなドームの 湘南台文化センター。',
  ext: [-1000, -1000, 1000, 1000], time: 180, rivals: 2, diff: 0.5, stars: [3, 6, 9],
  pal: { sky: '#b8dcff', hemi: ['#ffffff', '#8a96a0', 0.7], sun: ['#fff4e0', 0.55, -0.6, 1, 0.3], ground: '#d4cfc3', outer: '#c4c0b2' },
  real: {
    center: [0, 0], areas: { camp: [-310, -380, 400, 330], battle: [-160, -290, 320, 180] }, start: { camp: [40, 30], battle: [60, -40] },
    lm: [[244, -186, '地球儀のドーム'], [267, -121, '湘南台文化センター']],
    trains: {}, cars: KCARS, people: ['person', 'person', 'personW', 'student'],
  },
  icon(g, w, h) {
    g.fillStyle = '#b8dcff'; g.fillRect(0, 0, w, h); g.fillStyle = '#8fc46a'; g.fillRect(0, h * 0.8, w, h * 0.2);
    g.fillStyle = '#d8d4cc'; g.fillRect(w * 0.1, h * 0.62, w * 0.6, h * 0.2);
    g.fillStyle = '#c8d4e0'; g.beginPath(); g.arc(w * 0.34, h * 0.42, h * 0.3, 0, 7); g.fill();
    g.strokeStyle = '#5a7a9a'; g.lineWidth = w * 0.012; g.beginPath(); g.arc(w * 0.34, h * 0.42, h * 0.3, 0, 7); g.moveTo(w * 0.34 - h * 0.3, h * 0.42); g.lineTo(w * 0.34 + h * 0.3, h * 0.42); g.stroke();
    g.beginPath(); g.ellipse(w * 0.34, h * 0.42, h * 0.12, h * 0.3, 0, 0, 7); g.stroke();
    g.fillStyle = '#d8e0e8'; g.beginPath(); g.arc(w * 0.62, h * 0.62, h * 0.14, PI, 0); g.fill();
    g.fillStyle = '#5c6472'; g.fillRect(w * 0.78, 0, w * 0.1, h); g.fillStyle = '#6fb85a'; g.fillRect(w * 0.82, 0, w * 0.02, h);
  }
};
const kamiooka = {
  id: 'kamiooka', name: '上大岡', free: 1, v: 1, data: 'cities/kamiooka.json', sub: '京急の高架・駅前の高層タワー・大岡川・坂の街',
  desc: '上大岡駅を中心に 半径およそ1.2kmの実寸の街。谷あいの駅を 京急の高架が南北に走り、大岡川ぞいには桜。まわりの丘は 標高データどおりの坂の住宅街。',
  ext: [-1200, -1200, 1200, 1200], time: 180, rivals: 2, diff: 0.52, stars: [2, 4, 7],
  pal: { sky: '#bcdcf8', hemi: ['#ffffff', '#8a96a0', 0.7], sun: ['#fff2dc', 0.55, -0.5, 1, 0.45], ground: '#d2ccbf', outer: '#a9b88f' },
  real: {
    center: [-20, -20], areas: { camp: [-370, -370, 330, 330], battle: [-240, -240, 220, 220] }, start: { camp: [-60, -70], battle: [-60, -70] },
    lm: [[8, 76, '駅前の高層タワー'], [19, -25, '駅ビルのデパート']],
    trains: { 4: { type: 'redCar', cars: 6, spd: 11, n: 2 } }, cars: KCARS, people: ['person', 'person', 'personW'],
  },
  icon(g, w, h) {
    g.fillStyle = '#bcdcf8'; g.fillRect(0, 0, w, h);
    g.fillStyle = '#8fb470'; g.beginPath(); g.moveTo(0, h * 0.4); g.lineTo(w * 0.25, h * 0.7); g.lineTo(w * 0.75, h * 0.7); g.lineTo(w, h * 0.35); g.lineTo(w, h); g.lineTo(0, h); g.fill();
    for (const [x, y] of [[0.05, 0.42], [0.14, 0.52], [0.82, 0.4], [0.9, 0.34]]) { g.fillStyle = '#f2ebdc'; g.fillRect(w * x, h * y, w * 0.07, h * 0.08); g.fillStyle = '#6b4a3a'; g.fillRect(w * x - w * 0.01, h * y - h * 0.04, w * 0.09, h * 0.04); }
    g.fillStyle = '#9fb2c8'; g.fillRect(w * 0.52, h * 0.06, w * 0.12, h * 0.66); g.fillStyle = '#e2d8c8'; g.fillRect(w * 0.3, h * 0.42, w * 0.22, h * 0.3);
    g.fillStyle = '#b8b2a6'; g.fillRect(0, h * 0.7, w, h * 0.06); g.fillStyle = '#d8282a'; g.fillRect(w * 0.06, h * 0.62, w * 0.24, h * 0.08); g.fillStyle = '#f4f2ec'; g.fillRect(w * 0.06, h * 0.64, w * 0.24, h * 0.03);
    g.fillStyle = '#ffb7d0'; for (let i = 0; i < 6; i++) { g.beginPath(); g.arc(w * (0.1 + i * 0.16), h * 0.88, w * 0.04, 0, 7); g.fill(); }
  }
};
// the narrow path from 旧東海道 down to the street in front of the school (OSM way 80804792, 2.4 m wide), in metres from the centre
const NARROW = [[96, -102], [98, -95], [105, -76], [106, -72], [105, -67], [102, -63], [98, -56], [93, -44], [68, 0], [64, 12], [57, 26], [52, 36], [49, 42], [44, 48], [37, 54], [27, 62],
  [18, 69], [14, 75], [9, 85], [8, 89], [8, 93], [8, 98], [6, 103], [-3, 117], [-11, 130], [-17, 142], [-21, 149], [-25, 153], [-30, 157]];
const shonanHs = {
  id: 'shonanhs', name: '湘南高校付近', free: 1, v: 1, data: 'cities/shonanhs.json', sub: '湘南高校・藤沢本町駅・せまい通学路',
  desc: '湘南高校から 藤沢本町駅までの 実寸の街。生徒が歩く 日本一せまいと言われる 細い通学路も 地図どおり。',
  ext: [-650, -700, 650, 600], time: 170, rivals: 1, diff: 0.4, stars: [4, 8, 12],
  pal: { sky: '#c0e2ff', hemi: ['#ffffff', '#8a9a88', 0.7], sun: ['#fff2dc', 0.55, -0.4, 1, 0.5], ground: '#d3cdbd', outer: '#bdb6a4' },
  real: {
    center: [60, -60], areas: { camp: [-330, -330, 310, 380], battle: [-240, -260, 220, 280] }, start: { camp: [108, -186], battle: [40, -40] },
    lm: [[126, -209, '藤沢本町駅']],
    labels: [['日本一せまい通学路', 50, 30, 'school']],
    trains: { 2: { type: 'silverCar', cars: 4, spd: 9, n: 2 } }, cars: KCARS, people: ['student', 'student', 'person', 'personW'], walkers: 1.3,
    extra(B, h) {
      // the narrow path: block walls on both sides, students walking it in a stream from the station to the school
      for (const s of [-1, 1]) h.along(NARROW, s * 1.45, 4.1, (x, z, yaw) => { if (h.free(x, z)) B.o('blockWall', x, z, yaw); });
      h.along(NARROW, 1.6, 31, (x, z, yaw) => { if (h.free(x, z)) B.o('denchu', x, z, yaw); });
      const route = [[116, -226], [128, -200], [140, -172], [148, -140], [141, -118], [120, -110]].concat(NARROW, [[-52, 130], [-66, 114]]);
      B.walk(route, 46, { types: ['student'], w: 1.0, spd: 1.2 });
      B.walk([[96, -102], [61, -89], [38, -81], [8, -73], [-30, -68], [-63, -30], [-87, 4], [-100, 24], [-128, 64]], 18, { types: ['student'], w: 1.4 });
    },
  },
  icon(g, w, h) {
    g.fillStyle = '#c0e2ff'; g.fillRect(0, 0, w, h); g.fillStyle = '#c8a878'; g.fillRect(0, h * 0.7, w, h * 0.3);
    g.strokeStyle = '#ffffff'; g.lineWidth = w * 0.012; g.beginPath(); g.ellipse(w * 0.5, h * 0.86, w * 0.4, h * 0.1, 0, 0, 7); g.stroke();
    g.fillStyle = '#f2efe8'; g.fillRect(w * 0.12, h * 0.3, w * 0.76, h * 0.4); g.fillStyle = '#34465e'; for (let i = 0; i < 3; i++) g.fillRect(w * 0.12, h * (0.36 + i * 0.11), w * 0.76, h * 0.04);
    g.fillStyle = '#f2efe8'; g.fillRect(w * 0.44, h * 0.18, w * 0.12, h * 0.14); g.fillStyle = '#ffffff'; g.beginPath(); g.arc(w * 0.5, h * 0.24, h * 0.05, 0, 7); g.fill();
    g.fillStyle = '#2f6a3e'; g.beginPath(); g.ellipse(w * 0.92, h * 0.36, w * 0.1, h * 0.07, 0, 0, 7); g.fill(); g.fillStyle = '#6a4a34'; g.fillRect(w * 0.91, h * 0.4, w * 0.02, h * 0.3);
  }
};

const CITIES = [shibuya, asakusa, shinjuku, yokohama, dotonbori, osakajo, kyoto, nagoya, sapporo, fukuoka,
  fujisawa, shonandai, kamiooka, shonanHs];
window.HOLE_CITIES = { types: TY, cities: CITIES };
})();
