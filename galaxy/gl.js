// ぐるぐる星わたり：小さな WebGL の描画器（自作。外部ライブラリなし）。window.GalaxyGL
// 星（球・箱・筒・カプセル）は、当たり判定と同じ「符号つき距離」の面にそって色つきの三角形にする。
// 星空（星雲・天の川・太陽のまぶしさ）は1枚の絵のシェーダー、遠くの星は視差つき、星のまわりの大気の輪、足あとの光る粒。
// 画質は自動でさがる（解像度のスケール・星雲の細かさ・大気・粒の数）。GL がなければ create() は null を返す。
(function (root) {
  'use strict';
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), TAU = Math.PI * 2;
  // ---------- 行列 ----------
  const M = {
    persp(f, a, n, fa) { const t = 1 / Math.tan(f / 2), r = new Float32Array(16); r[0] = t / a; r[5] = t; r[10] = (fa + n) / (n - fa); r[11] = -1; r[14] = 2 * fa * n / (n - fa); return r; },
    mul(a, b) { const o = new Float32Array(16); for (let i = 0; i < 4; i++) for (let j = 0; j < 4; j++) { let s = 0; for (let k = 0; k < 4; k++) s += a[k * 4 + j] * b[i * 4 + k]; o[i * 4 + j] = s; } return o; },
    ident() { const r = new Float32Array(16); r[0] = r[5] = r[10] = r[15] = 1; return r; },
    // 位置 p・向き fw・上 up・大きさ（数 or [x,y,z]）→ モデル行列（前は +z、上は +y）
    basis(p, fw, up, s) {
      s = s == null ? 1 : s; const sx = s[0] != null ? s[0] : s, sy = s[1] != null ? s[1] : s, sz = s[2] != null ? s[2] : s;
      let f = fw, u = up; const r = norm(cross(u, f)); f = norm(cross(r, u)); const m = new Float32Array(16);
      m[0] = r[0] * sx; m[1] = r[1] * sx; m[2] = r[2] * sx; m[4] = u[0] * sy; m[5] = u[1] * sy; m[6] = u[2] * sy; m[8] = f[0] * sz; m[9] = f[1] * sz; m[10] = f[2] * sz; m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; m[15] = 1; return m;
    },
    fromRP(R, p) { const m = new Float32Array(16); m[0] = R[0]; m[1] = R[3]; m[2] = R[6]; m[4] = R[1]; m[5] = R[4]; m[6] = R[7]; m[8] = R[2]; m[9] = R[5]; m[10] = R[8]; m[12] = p[0]; m[13] = p[1]; m[14] = p[2]; m[15] = 1; return m; },
    look(p, f, u) { const r = norm(cross(f, u)), uu = cross(r, f), v = new Float32Array(16), d = (a, c) => a[0] * c[0] + a[1] * c[1] + a[2] * c[2];
      v[0] = r[0]; v[4] = r[1]; v[8] = r[2]; v[12] = -d(r, p); v[1] = uu[0]; v[5] = uu[1]; v[9] = uu[2]; v[13] = -d(uu, p); v[2] = -f[0]; v[6] = -f[1]; v[10] = -f[2]; v[14] = d(f, p); v[15] = 1; return { v, r, u: uu }; },
  };
  function norm(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }
  function cross(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
  // ---------- メッシュ ----------
  function MB() { this.p = []; this.n = []; this.c = []; }
  MB.prototype.vtx = function (p, n, c) { this.p.push(p[0], p[1], p[2]); this.n.push(n[0], n[1], n[2]); this.c.push(c[0], c[1], c[2]); };
  MB.prototype.tri = function (a, b, c, col) {
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2]; let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const l = Math.hypot(nx, ny, nz) || 1; nx /= l; ny /= l; nz /= l;
    for (const q of [a, b, c]) this.vtx(q, [nx, ny, nz], col);
  };
  MB.prototype.quad = function (a, b, c, d, col) { this.tri(a, b, c, col); this.tri(a, c, d, col); };
  MB.prototype.box = function (x, y, z, w, h, d, col) { // 中心 (x,y,z)、大きさ w h d
    const X = w / 2, Y = h / 2, Z = d / 2, v = [[x - X, y - Y, z - Z], [x + X, y - Y, z - Z], [x + X, y + Y, z - Z], [x - X, y + Y, z - Z], [x - X, y - Y, z + Z], [x + X, y - Y, z + Z], [x + X, y + Y, z + Z], [x - X, y + Y, z + Z]];
    this.quad(v[4], v[5], v[6], v[7], col); this.quad(v[1], v[0], v[3], v[2], col); this.quad(v[0], v[4], v[7], v[3], col); this.quad(v[5], v[1], v[2], v[6], col); this.quad(v[3], v[7], v[6], v[2], col); this.quad(v[0], v[1], v[5], v[4], col);
  };
  // 楕円体（なめらかな法線）
  MB.prototype.ell = function (x, y, z, rx, ry, rz, col, la, lo) {
    la = la || 6; lo = lo || 10; const P = (i, j) => { const a = i / la * Math.PI, b = j / lo * TAU, nx = Math.sin(a) * Math.cos(b), ny = Math.cos(a), nz = Math.sin(a) * Math.sin(b); return { p: [x + nx * rx, y + ny * ry, z + nz * rz], n: [nx / rx, ny / ry, nz / rz] }; };
    for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) {
      const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1), nn = q => norm(q.n);
      if (i > 0) { this.vtx(a.p, nn(a), col); this.vtx(d.p, nn(d), col); this.vtx(c.p, nn(c), col); }
      if (i < la - 1) { this.vtx(a.p, nn(a), col); this.vtx(c.p, nn(c), col); this.vtx(b.p, nn(b), col); }
    }
  };
  MB.prototype.cone = function (x, y, z, r, h, col, seg, r2) { seg = seg || 8; r2 = r2 || 0; for (let i = 0; i < seg; i++) { const a0 = i / seg * TAU, a1 = (i + 1) / seg * TAU; const A = [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], Bq = [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], T0 = [x + Math.cos(a0) * r2, y + h, z + Math.sin(a0) * r2], T1 = [x + Math.cos(a1) * r2, y + h, z + Math.sin(a1) * r2];
    if (r2 > 0) { this.quad(Bq, A, T0, T1, col); this.tri([x, y + h, z], T0, T1, col); this.tri([x, y, z], Bq, A, col); } else { this.tri(Bq, A, [x, y + h, z], col); this.tri([x, y, z], A, Bq, col); } } };
  // 星形の板（5つの角、厚み t）
  MB.prototype.star = function (x, y, z, ro, ri, t, col, col2) {
    const pts = []; for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i / 10 * TAU, r = i % 2 ? ri : ro; pts.push([x + Math.cos(a) * r, y - Math.sin(a) * r]); }
    for (let i = 0; i < 10; i++) { const a = pts[i], b = pts[(i + 1) % 10]; const cc = i % 2 ? col2 || col : col;
      this.tri([x, y, z + t], [b[0], b[1], z], [a[0], a[1], z], cc); this.tri([x, y, z - t], [a[0], a[1], z], [b[0], b[1], z], cc); }
  };
  MB.prototype.ring = function (x, y, z, R, r, col, seg, tube) { // 軸 z のわっか（太さ r）
    seg = seg || 20; tube = tube || 6; const P = (i, j) => { const a = i / seg * TAU, b = j / tube * TAU, cx = Math.cos(a), sy = Math.sin(a), k = R + Math.cos(b) * r; return { p: [x + cx * k, y + sy * k, z + Math.sin(b) * r], n: [cx * Math.cos(b), sy * Math.cos(b), Math.sin(b)] }; };
    for (let i = 0; i < seg; i++) for (let j = 0; j < tube; j++) { const a = P(i, j), b = P(i + 1, j), c = P(i + 1, j + 1), d = P(i, j + 1); for (const q of [a, b, c, a, c, d]) this.vtx(q.p, q.n, col); }
  };
  const hex = h => [parseInt(h.slice(1, 3), 16) / 255, parseInt(h.slice(3, 5), 16) / 255, parseInt(h.slice(5, 7), 16) / 255];
  const mix = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  const hash3 = (x, y, z) => { let h = Math.imul(Math.floor(x) | 0, 374761393) ^ Math.imul(Math.floor(y) | 0, 668265263) ^ Math.imul(Math.floor(z) | 0, 1274126177); h = Math.imul(h ^ (h >>> 13), 1274126177); return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const vnoise = (x, y, z) => { const ix = Math.floor(x), iy = Math.floor(y), iz = Math.floor(z), fx = x - ix, fy = y - iy, fz = z - iz, s = t => t * t * (3 - 2 * t), u = s(fx), v = s(fy), w = s(fz), L = (a, b, t) => a + (b - a) * t, H = (a, b, c) => hash3(ix + a, iy + b, iz + c);
    return L(L(L(H(0, 0, 0), H(1, 0, 0), u), L(H(0, 1, 0), H(1, 1, 0), u), v), L(L(H(0, 0, 1), H(1, 0, 1), u), L(H(0, 1, 1), H(1, 1, 1), u), v), w); };
  // 星の表面の色（地面の種類ごと）。1 を超える値は「光る」
  const PAL = {
    grass: { a: '#62cf6c', b: '#3fa456', c: '#b4e870', d: '#ffe066', e: '#ff8fb8' }, moss: { a: '#4fbf92', b: '#2f9570', c: '#a6e8b0', d: '#fff0a0', e: '#ffb0d0' },
    ice: { a: '#cdeeff', b: '#94d2f6', c: '#ffffff', d: '#7fb8e8', e: '#ffffff' }, stone: { a: '#a4a4ba', b: '#80809c', c: '#cdcde0', d: '#6a6a86', e: '#e0e0f0' },
    lava: { a: '#3b1b1e', b: '#5b2424', c: '#7a3328', d: '#ff6a1a', e: '#ffc040' }, metal: { a: '#8f9bb8', b: '#6e7b9c', c: '#d3dcf2', d: '#4a5878', e: '#aee0ff' },
    dusk: { a: '#5a4a8a', b: '#3e3268', c: '#8a74c0', d: '#2a2048', e: '#c8b0ff' }, star: { a: '#f4e08a', b: '#e0b850', c: '#fff6c8', d: '#a8742a', e: '#ffffff' },
    crystal: { a: '#9a7ce0', b: '#6a5cc8', c: '#d8c8ff', d: '#4a3a90', e: '#7ff0ff' },
    water: { a: '#4fc3e8', b: '#2f93d0', c: '#bff4ff', d: '#ffffff', e: '#ff9a8a' }, ruin: { a: '#c9b48a', b: '#a8946a', c: '#e6d6a8', d: '#7a6848', e: '#ffd060' }, gear: { a: '#b89a5a', b: '#8c7340', c: '#e8c878', d: '#5a4828', e: '#ffe9a0' },
    sand: { a: '#f1d896', b: '#d9b974', c: '#fff0c0', d: '#c8a050', e: '#ffffff' }, candy: { a: '#ff9ad0', b: '#ffd1e8', c: '#fff4a0', d: '#8fe0ff', e: '#ffffff' },
  };
  function surfColor(surf, p, n, sz) {
    const P = PAL[surf] || PAL.grass, k = 1.4 / Math.max(3, sz) * 4, nx = p[0] * k, ny = p[1] * k, nz = p[2] * k, a = vnoise(nx, ny, nz), b = vnoise(nx * 2.6 + 9, ny * 2.6, nz * 2.6), j = hash3(p[0] * 9, p[1] * 9, p[2] * 9);
    let c = mix(hex(P.a), hex(P.b), clamp((a - 0.35) * 2.2, 0, 1)); c = mix(c, hex(P.c), clamp((b - 0.62) * 3, 0, 1) * 0.8);
    if (surf === 'lava') { const v = Math.abs(a - 0.5); if (v < 0.07) c = mix([2.4, 0.9, 0.2], [2.0, 1.4, 0.4], b); else if (v < 0.11) c = mix(c, hex(P.d), 0.6); }
    else if (surf === 'ice') { const v = Math.abs(vnoise(nx * 1.6 + 3, ny * 1.6, nz * 1.6) - 0.5); if (v < 0.025) c = hex(P.d); }
    else if (surf === 'metal') { const g = (Math.abs(((p[0] * 0.7) % 2 + 2) % 2 - 1) < 0.04) || (Math.abs(((p[1] * 0.7) % 2 + 2) % 2 - 1) < 0.04) ? 0.75 : 1; c = c.map(q => q * g); if (j > 0.985) c = [0.5, 1.6, 2.0]; }
    else if (surf === 'stone') { if (b > 0.7) c = mix(c, hex(P.d), 0.5); }
    else if (surf === 'grass' || surf === 'moss') { if (j > 0.972) c = hex(j > 0.986 ? P.d : P.e); }
    // くぼみ（クレーター）：石・氷・遺跡
    if (surf === 'stone' || surf === 'ice' || surf === 'ruin' || surf === 'gear') { const cs = 0.28 / Math.max(2, sz) * 4, cx = p[0] * cs, cy = p[1] * cs, cz = p[2] * cs, ix = Math.floor(cx), iy = Math.floor(cy), iz = Math.floor(cz);
      if (hash3(ix + 5, iy, iz) > 0.55) { const fx = cx - ix - (0.3 + hash3(ix, iy + 3, iz) * 0.4), fy = cy - iy - (0.3 + hash3(ix, iy, iz + 3) * 0.4), fz = cz - iz - (0.3 + hash3(ix + 7, iy, iz) * 0.4), d = Math.hypot(fx, fy, fz), r0 = 0.28; if (d < r0) c = c.map(q => q * 0.78); else if (d < r0 + 0.06) c = c.map(q => Math.min(1.2, q * 1.12)); } }
    if (surf === 'candy') { const w = Math.sin(p[1] * 1.6 + a * 6) > 0.35 ? 1 : 0; if (w) c = mix(c, hex('#ffffff'), 0.6); if (j > 0.975) c = [hex('#6fe3ff'), hex('#ffe066'), hex('#8aff9a')][Math.floor(j * 977) % 3]; }
    else if (surf === 'water') { const w = Math.abs(Math.sin(p[0] * 0.9 + p[2] * 0.7 + a * 5)); if (w > 0.93) c = hex(P.c); if (j > 0.985) c = hex(P.d); }
    else if (surf === 'ruin') { const g1 = Math.abs(((p[1] * 0.45) % 1 + 1) % 1 - 0.5) > 0.46, g2 = Math.abs((((p[0] + p[2]) * 0.45 + Math.floor(p[1] * 0.45) * 0.5) % 1 + 1) % 1 - 0.5) > 0.47; if (g1 || g2) c = hex(P.d); }
    const sh = 0.96 + j * 0.08; return [c[0] * sh, c[1] * sh, c[2] * sh];
  }
  function bodyMesh(E, b, L, lod) {
    lod = lod == null ? 1 : lod; const mb = new MB(), N = clamp(Math.round(b.sz * 2 * (lod ? 1 : 0.6)), lod ? 6 : 4, b.k === 's' ? (lod ? 13 : 9) : (lod ? 11 : 7)), ext = b.k === 's' ? [b.r, b.r, b.r] : b.k === 'b' ? b.h : b.k === 'y' ? [b.r, b.hh, b.r] : [b.r, b.hl + b.r, b.r];
    const grid = [], idx = (f, i, j) => f * (N + 1) * (N + 1) + i * (N + 1) + j;
    for (let f = 0; f < 6; f++) for (let i = 0; i <= N; i++) for (let j = 0; j <= N; j++) {
      const u = i / N * 2 - 1, v = j / N * 2 - 1; let q;
      switch (f) { case 0: q = [1, u, v]; break; case 1: q = [-1, u, v]; break; case 2: q = [u, 1, v]; break; case 3: q = [u, -1, v]; break; case 4: q = [u, v, 1]; break; default: q = [u, v, -1]; }
      const l = Math.hypot(q[0], q[1], q[2]); const w = b.k === 'b' ? q : [q[0] / l, q[1] / l, q[2] / l]; let p = [w[0] * ext[0] * 1.3, w[1] * ext[1] * 1.3, w[2] * ext[2] * 1.3], nn = [0, 1, 0];
      for (let it = 0; it < 6; it++) { const r = E.sdf(b, p); p = [p[0] - r[1] * r[0], p[1] - r[2] * r[0], p[2] - r[3] * r[0]]; nn = [r[1], r[2], r[3]]; }
      grid.push({ p, n: nn, c: surfColor(b.surf, p, nn, b.sz) });
    }
    for (let f = 0; f < 6; f++) for (let i = 0; i < N; i++) for (let j = 0; j < N; j++) {
      const a = grid[idx(f, i, j)], bb = grid[idx(f, i + 1, j)], c = grid[idx(f, i + 1, j + 1)], d = grid[idx(f, i, j + 1)];
      for (const t of [[a, bb, c], [a, c, d]]) { const ux = t[1].p[0] - t[0].p[0], uy = t[1].p[1] - t[0].p[1], uz = t[1].p[2] - t[0].p[2], vx = t[2].p[0] - t[0].p[0], vy = t[2].p[1] - t[0].p[1], vz = t[2].p[2] - t[0].p[2]; const cx = uy * vz - uz * vy, cy = uz * vx - ux * vz, cz = ux * vy - uy * vx;
        const o = (cx * t[0].n[0] + cy * t[0].n[1] + cz * t[0].n[2]) >= 0 ? t : [t[0], t[2], t[1]]; if (Math.hypot(cx, cy, cz) < 1e-9) continue; const cc = [(o[0].c[0] + o[1].c[0] + o[2].c[0]) / 3, (o[0].c[1] + o[1].c[1] + o[2].c[1]) / 3, (o[0].c[2] + o[1].c[2] + o[2].c[2]) / 3];
        for (const q of o) mb.vtx(q.p, q.n, b.surf === 'lava' || b.surf === 'metal' ? q.c : cc); }
    }
    if (b.k === 's') addProps(mb, b, L, lod); if (b.ring) addRing(mb, b);
    return mb;
  }
  // 小さな飾り（木・草・キャンディ・氷の結晶・サンゴ・遺跡の柱）をメッシュに焼きこむ。ものの近くには置かない
  function addTo(mb, fn, pos, u, seed) {
    const t = new MB(); fn(t); const a = norm(cross(u, Math.abs(u[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), c = cross(u, a), ang = seed * 6.283, ca = Math.cos(ang), sa = Math.sin(ang);
    const X = [a[0] * ca + c[0] * sa, a[1] * ca + c[1] * sa, a[2] * ca + c[2] * sa], Z = [c[0] * ca - a[0] * sa, c[1] * ca - a[1] * sa, c[2] * ca - a[2] * sa];
    const tf = (x, y, z) => [pos[0] + X[0] * x + u[0] * y + Z[0] * z, pos[1] + X[1] * x + u[1] * y + Z[1] * z, pos[2] + X[2] * x + u[2] * y + Z[2] * z], tn = (x, y, z) => [X[0] * x + u[0] * y + Z[0] * z, X[1] * x + u[1] * y + Z[1] * z, X[2] * x + u[2] * y + Z[2] * z];
    for (let i = 0; i < t.p.length; i += 3) { mb.p.push(...tf(t.p[i], t.p[i + 1], t.p[i + 2])); mb.n.push(...tn(t.n[i], t.n[i + 1], t.n[i + 2])); mb.c.push(t.c[i], t.c[i + 1], t.c[i + 2]); }
  }
  const PROPS = {
    grass: [t => { t.cone(0, 0, 0, 0.12, 0.7, hex('#7a4a24'), 5, 0.08); t.ell(0, 1.0, 0, 0.55, 0.5, 0.55, hex('#3fae52'), 4, 7); t.ell(0.15, 1.35, 0.05, 0.35, 0.32, 0.35, hex('#6fd068'), 3, 6); }, t => { for (let i = 0; i < 3; i++) t.cone((i - 1) * 0.12, 0, (i % 2) * 0.1, 0.07, 0.38 + i * 0.05, hex('#8fe070'), 4, 0); }, t => { t.cone(0, 0, 0, 0.03, 0.32, hex('#4a9a50'), 4, 0.03); t.ell(0, 0.36, 0, 0.12, 0.08, 0.12, hex('#ff9ab8'), 3, 6); }],
    moss: [t => { t.cone(0, 0, 0, 0.1, 0.6, hex('#6a4a30'), 5, 0.07); t.cone(0, 0.5, 0, 0.55, 0.9, hex('#2f9a6a'), 6, 0); }, t => { for (let i = 0; i < 3; i++) t.cone((i - 1) * 0.1, 0, 0, 0.06, 0.34, hex('#9be8b0'), 4, 0); }],
    candy: [t => { t.cone(0, 0, 0, 0.06, 1.0, hex('#ffffff'), 6, 0.06); t.ell(0, 1.15, 0, 0.38, 0.38, 0.1, hex('#ff5f9a'), 5, 10); t.ell(0, 1.15, 0, 0.2, 0.2, 0.12, hex('#ffe0ee'), 4, 8); }, t => { t.ell(0, 0.3, 0, 0.32, 0.38, 0.32, hex('#8fe0ff'), 4, 8); t.ell(0, 0.6, 0, 0.12, 0.1, 0.12, hex('#ffffff'), 3, 5); }, t => { t.cone(0, 0, 0, 0.1, 0.28, hex('#fff0c0'), 6, 0.08); t.ell(0, 0.4, 0, 0.45, 0.22, 0.45, hex('#ff8fc0'), 4, 8); }],
    ice: [t => { for (let i = 0; i < 4; i++) { const a = i * 1.6; t.cone(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2, 0.16, 0.7 + (i % 2) * 0.5, hex('#dff6ff'), 5, 0); } }, t => { t.cone(0, 0, 0, 0.3, 0.9, hex('#aee4ff'), 5, 0); }],
    stone: [t => { t.ell(0, 0.15, 0, 0.35, 0.22, 0.3, hex('#9a9ab2'), 3, 6); t.ell(0.3, 0.1, 0.1, 0.2, 0.14, 0.18, hex('#b8b8cc'), 3, 6); }],
    water: [t => { t.cone(0, 0, 0, 0.1, 0.5, hex('#ff8a7a'), 5, 0.06); for (let i = 0; i < 3; i++) t.ell((i - 1) * 0.18, 0.55 + (i % 2) * 0.1, 0, 0.14, 0.14, 0.14, hex('#ffb3a6'), 3, 6); }, t => { t.ell(0, 0.4, 0, 0.3, 0.3, 0.3, hex('#d8f8ff'), 4, 8); }, t => { t.cone(0, 0, 0, 0.12, 0.8, hex('#7fe8c0'), 5, 0.02); }],
    ruin: [t => { t.cone(0, 0, 0, 0.4, 1.8, hex('#d8c490'), 8, 0.34); t.cone(0, 1.8, 0, 0.5, 0.16, hex('#b8a478'), 8, 0.48); }, t => { t.cone(0, 0, 0, 0.36, 0.7, hex('#c8b480'), 8, 0.3); }, t => { t.box(0, 0.15, 0, 0.7, 0.3, 0.5, hex('#b4a070')); }],
    dusk: [t => { t.cone(0, 0, 0, 0.1, 0.9, hex('#3a2f58'), 5, 0.04); t.cone(0, 0.6, 0, 0.6, 0.5, hex('#4a3a70'), 6, 0.05); }, t => { t.ell(0, 0.25, 0, 0.3, 0.3, 0.3, hex('#c8b0ff'), 3, 6); }],
    star: [t => { t.star(0, 0.6, 0, 0.45, 0.2, 0.06, hex('#ffe066'), hex('#fff6c8')); t.cone(0, 0, 0, 0.05, 0.6, hex('#d8b050'), 4, 0.04); }],
    crystal: [t => { for (let i = 0; i < 3; i++) { const a = i * 2.1; t.cone(Math.cos(a) * 0.2, 0, Math.sin(a) * 0.2, 0.18, 0.8 + i * 0.35, hex(i % 2 ? '#7ff0ff' : '#c8a0ff'), 5, 0); } }, t => { t.cone(0, 0, 0, 0.3, 1.1, hex('#b8f0ff'), 6, 0); }],
    gear: [t => { t.cone(0, 0, 0, 0.12, 0.6, hex('#8c7340'), 6, 0.1); t.ell(0, 0.65, 0, 0.2, 0.2, 0.2, hex('#ffe9a0'), 3, 6); }],
    metal: [t => { t.cone(0, 0, 0, 0.05, 1.1, hex('#cfd8ee'), 5, 0.03); t.ell(0, 1.15, 0, 0.1, 0.1, 0.1, hex('#6fe3ff'), 3, 6); }],
    lava: [t => { t.cone(0, 0, 0, 0.3, 0.7, hex('#2a1214'), 6, 0.12); t.ell(0, 0.7, 0, 0.1, 0.08, 0.1, [2.2, 0.8, 0.2], 3, 6); }],
  };
  function addProps(mb, b, L, lod) {
    const set = PROPS[b.surf]; if (!set || b.g <= 0) return; const n = lod ? clamp(Math.round(b.r * b.r * 0.11), 3, 24) : clamp(Math.round(b.r * b.r * 0.07), 2, 12); const near = []; if (L) for (const e of L.ents) if (e.bi === b.i) { const l = e.l0 || e.l; near.push(l); }
    for (let i = 0; i < n; i++) {
      const h1 = hash3(b.i * 13 + i, 7, 1), h2 = hash3(b.i * 13 + i, 3, 9), h3 = hash3(b.i * 13 + i, 5, 5), y = h1 * 2 - 1, a = h2 * TAU, s = Math.sqrt(1 - y * y), d = [Math.cos(a) * s, y, Math.sin(a) * s], pos = [d[0] * b.r, d[1] * b.r, d[2] * b.r];
      if (near.some(l => Math.hypot(l[0] - pos[0], l[1] - pos[1], l[2] - pos[2]) < 2.2)) continue; if (b.surf !== 'ruin' && b.surf !== 'stone' && b.surf !== 'lava' && b.surf !== 'metal' && i % 3 === 0 && b.r > 5) continue;
      addTo(mb, set[Math.floor(h3 * set.length) % set.length], pos, d, h3 * 7 % 1);
    }
  }
  function addRing(mb, b) { const tilt = 0.45, ct = Math.cos(tilt), st2 = Math.sin(tilt), rc = mix(hex(PAL[b.surf] ? PAL[b.surf].c : '#ffffff'), [1, 1, 1], 0.4), rc2 = mix(rc, [0.4, 0.4, 0.5], 0.4);
    for (let i = 0; i < 48; i++) { const a0 = i / 48 * TAU, a1 = (i + 1) / 48 * TAU, P = (a, r) => [Math.cos(a) * r, Math.sin(a) * r * st2, Math.sin(a) * r * ct], ri = b.r * 1.5, ro = b.r * 2.1, cc = i % 3 ? rc : rc2; const q = [P(a0, ri), P(a1, ri), P(a1, ro), P(a0, ro)]; mb.quad(q[0], q[1], q[2], q[3], cc); mb.quad(q[0], q[3], q[2], q[1], cc); } }
  function planetMesh(col, ring) {
    const mb = new MB(), c = col, c2 = mix(col, [1, 1, 1], 0.35), c3 = mix(col, [0.1, 0.1, 0.2], 0.4); const la = 12, lo = 20;
    for (let i = 0; i < la; i++) { const band = 0.5 + 0.5 * Math.sin(i * 1.7), cc = mix(mix(c, c2, band), c3, i % 3 === 0 ? 0.3 : 0); mb.ell(0, 0, 0, 1, 1, 1, cc, la, lo); break; }
    const mb2 = new MB(); for (let i = 0; i < la; i++) for (let j = 0; j < lo; j++) { const a0 = i / la * Math.PI, a1 = (i + 1) / la * Math.PI, b0 = j / lo * TAU, b1 = (j + 1) / lo * TAU; const band = 0.5 + 0.5 * Math.sin(i * 1.9 + Math.sin(j * 0.7) * 0.4), cc = mix(mix(c, c2, band), c3, ((i + j) % 5 === 0) ? 0.25 : 0);
      const P = (a, b) => [Math.sin(a) * Math.cos(b), Math.cos(a), Math.sin(a) * Math.sin(b)]; const A = P(a0, b0), Bq = P(a0, b1), C = P(a1, b1), D = P(a1, b0); if (i > 0) { mb2.vtx(A, A, cc); mb2.vtx(D, D, cc); mb2.vtx(C, C, cc); mb2.vtx(A, A, cc); mb2.vtx(C, C, cc); mb2.vtx(Bq, Bq, cc); } else { mb2.vtx(A, A, cc); mb2.vtx(D, D, cc); mb2.vtx(C, C, cc); } }
    if (ring) { const rc = mix(c2, [1, 1, 1], 0.4); for (let i = 0; i < 40; i++) { const a = i / 40 * TAU, a2 = (i + 1) / 40 * TAU, ri = 1.45, ro = 2.15, cc = mix(rc, c3, (i % 3) * 0.2); mb2.quad([Math.cos(a) * ri, 0, Math.sin(a) * ri], [Math.cos(a2) * ri, 0, Math.sin(a2) * ri], [Math.cos(a2) * ro, 0, Math.sin(a2) * ro], [Math.cos(a) * ro, 0, Math.sin(a) * ro], cc); mb2.quad([Math.cos(a) * ri, 0, Math.sin(a) * ri], [Math.cos(a) * ro, 0, Math.sin(a) * ro], [Math.cos(a2) * ro, 0, Math.sin(a2) * ro], [Math.cos(a2) * ri, 0, Math.sin(a2) * ri], cc); } }
    return mb2;
  }

  // ---------- シェーダー ----------
  const VS = 'attribute vec3 aPos,aNor,aCol;uniform mat4 uVP,uModel;varying vec3 vN,vC,vW;void main(){vec4 w=uModel*vec4(aPos,1.0);vW=w.xyz;vN=mat3(uModel)*aNor;vC=aCol;gl_Position=uVP*w;}';
  const FS = 'precision mediump float;varying vec3 vN,vC,vW;uniform vec3 uSun,uSunC,uAmb,uCam,uFogC,uTint,uRim;uniform float uFogK,uEmis,uSpec;'
    + 'void main(){vec3 N=normalize(vN);vec3 V=normalize(uCam-vW);float nd=max(dot(N,uSun),0.0);float s=0.22+0.38*smoothstep(0.05,0.16,nd)+0.4*smoothstep(0.45,0.58,nd);float cl=max(dot(N,V),0.0);'
    + 'vec3 col=vC*uTint*(uAmb*0.8+uSunC*0.62*s+vec3(0.16)*cl)+vC*uEmis*0.8+uRim*pow(1.0-cl,3.0)*(0.25+0.75*smoothstep(-0.2,0.5,nd));float sdn=dot(N,uSun);col+=vec3(0.95,0.42,0.18)*0.1*exp(-sdn*sdn*14.0)*(0.3+0.7*cl);if(uSpec>0.1)col+=uSunC*uSpec*pow(max(dot(reflect(-uSun,N),V),0.0),36.0)*step(0.0,sdn);col=col/(1.0+0.22*col);float d=length(uCam-vW);float f=1.0-exp(-d*uFogK);col=mix(col,uFogC,clamp(f,0.0,0.85));gl_FragColor=vec4(col,1.0);}';
  const AVS = 'attribute vec3 aPos,aNor;uniform mat4 uVP,uModel;varying vec3 vN,vW;void main(){vec4 w=uModel*vec4(aPos,1.0);vW=w.xyz;vN=mat3(uModel)*aNor;gl_Position=uVP*w;}';
  const AFS = 'precision mediump float;varying vec3 vN,vW;uniform vec3 uCam,uCol,uSun;uniform float uA;void main(){vec3 N=normalize(vN);vec3 V=normalize(uCam-vW);float f=pow(1.0-max(dot(N,V),0.0),2.6);float lit=0.45+0.55*smoothstep(-0.3,0.4,dot(N,uSun));float tw=exp(-pow(dot(N,uSun)*2.6,2.0));vec3 ac=mix(uCol,vec3(1.0,0.5,0.28),tw*0.55);gl_FragColor=vec4(ac*f*lit*uA,f*lit*uA);}';
  const CFS = 'precision mediump float;varying vec3 vN,vW;uniform vec3 uCam,uSun;uniform float uT,uFd;float h31(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}'
    + 'void main(){vec3 N=normalize(vN);vec3 V=normalize(uCam-vW);vec3 q=N*3.2+vec3(uT*0.01,0.0,0.0);float c=vn(q)*0.6+vn(q*2.1+4.0)*0.4;float a=smoothstep(0.52,0.72,c);float lit=smoothstep(-0.25,0.35,dot(N,uSun));float e=0.55+0.45*max(dot(N,V),0.0);gl_FragColor=vec4(vec3(1.0,0.97,0.95)*(0.35+0.65*lit)*a*0.62*e*uFd,a*0.62*e*uFd);}';
  const SVS = 'attribute vec2 aP;varying vec2 vP;void main(){vP=aP;gl_Position=vec4(aP,0.9999,1.0);}';
  const SFS = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n'
    + 'varying vec2 vP;uniform vec3 uF,uR,uU,uSun,uN1,uN2,uBand,uSunC;uniform float uTan,uAsp,uT,uQ,uStar;uniform vec4 uB[3];uniform vec3 uAur;uniform vec4 uLens;uniform vec3 uBC[3];uniform float uBR[3];'
    + 'float h31(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}'
    + 'float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}'
    + 'float fbm(vec3 p){float a=0.5,s=0.0;for(int i=0;i<3;i++){if(i==2&&uQ<0.5)break;s+=a*vn(p);p=p*2.03+vec3(1.7,9.2,3.1);a*=0.5;}return s;}'
    + 'void main(){vec3 d=normalize(uF+uR*vP.x*uTan*uAsp+uU*vP.y*uTan);vec3 d0=d;float lensM=0.0,lensR=0.0;if(uLens.w>0.0){vec3 lc=uLens.xyz;float lr=uLens.w;float cb=clamp(dot(d,lc),-1.0,1.0);float ang=acos(cb);vec3 pp=d-lc*cb;float k=lr*lr/(dot(pp,pp)+0.004);d=normalize(d+pp*k*0.9);lensM=1.0-smoothstep(lr*0.30,lr*0.36,ang);lensR=exp(-pow((ang-lr*0.43)/(lr*0.07),2.0));}float band=exp(-abs(dot(d,uBand))*5.0);vec3 col=vec3(0.006,0.008,0.02)+uN1*0.07;'
    + 'float n=fbm(d*2.2+vec3(0.0,uT*0.003,0.0));float n2=fbm(d*4.6+7.0);col+=uN1*(0.55*n*n)+uN2*(0.55*band*(0.25+n2))+uN2*0.06*n2;'
    + 'col+=uN2*pow(max(dot(d,normalize(uBand.zxy+vec3(0.2))),0.0),30.0)*0.45;'
    + 'if(uQ>0.2){for(int k=0;k<2;k++){float sc=k==0?64.0:130.0;vec3 g=d*sc;vec3 id=floor(g);float h=h31(id+float(k)*7.0);vec3 f=fract(g)-0.5;vec3 o=vec3(h31(id+1.0),h31(id+2.0),h31(id+3.0))-0.5;float st=step(0.962-0.03*uStar,h)*smoothstep(0.38,0.0,length(f+o*0.55));'
    + 'col+=st*(0.55+0.45*sin(uT*2.5+h*60.0))*mix(vec3(0.7,0.82,1.0),vec3(1.0,0.86,0.7),h31(id+9.0))*(k==0?1.3:0.8);if(uQ<1.5)break;}}'
    + 'if(uQ>0.8){float k=floor(uT/5.0),ph=fract(uT/5.0);vec3 a=normalize(vec3(h31(vec3(k,1.0,2.0))-0.5,h31(vec3(k,3.0,4.0))-0.2,h31(vec3(k,5.0,6.0))-0.5));vec3 b2=normalize(cross(a,vec3(0.2,1.0,0.3)));for(int i=0;i<5;i++){float p=max(ph-0.01*float(i),0.0)*0.6;vec3 c=normalize(a*cos(p)+b2*sin(p));col+=vec3(1.0,0.95,0.85)*pow(max(dot(d,c),0.0),9000.0)*(1.0-float(i)*0.2)*(1.0-ph)*2.0;}}'
    + 'float lane=exp(-abs(dot(d,normalize(uBand.yzx+vec3(0.3,0.1,-0.2))))*9.0);col+=uN2*0.18*lane*(0.4+fbm(d*7.0+3.0));'
    + 'if(dot(uAur,uAur)>0.0){float az=atan(d.z,d.x);float cur=0.5+0.5*sin(az*6.0+uT*0.12+fbm(d*2.5)*5.0);cur*=cur;float hh=smoothstep(0.02,0.3,d.y)*(1.0-smoothstep(0.5,0.92,d.y));col+=uAur*cur*hh*(0.25+0.5*fbm(vec3(az*3.0,d.y*9.0,uT*0.05)))*0.9;}'
    + 'if(uLens.w>0.0){col=mix(col,vec3(0.0),lensM);col+=vec3(1.0,0.72,0.4)*lensR*1.4;}'
    + 'float sd=max(dot(d,uSun),0.0);col+=uSunC*(pow(sd,1200.0)*4.0+pow(sd,60.0)*0.5+pow(sd,7.0)*0.09+pow(sd,16.0)*0.07);gl_FragColor=vec4(col,1.0);}';
  const BRFS = 'precision mediump float;varying vec2 vP;uniform sampler2D uS;void main(){vec3 c=texture2D(uS,vP*0.5+0.5).rgb;float l=max(max(c.r,c.g),c.b);gl_FragColor=vec4(c*smoothstep(0.8,1.05,l),1.0);}';
  const BLFS = 'precision mediump float;varying vec2 vP;uniform sampler2D uS;uniform vec2 uD;void main(){vec2 u=vP*0.5+0.5;vec3 c=texture2D(uS,u).rgb*0.3+(texture2D(uS,u+uD).rgb+texture2D(uS,u-uD).rgb)*0.22+(texture2D(uS,u+uD*2.0).rgb+texture2D(uS,u-uD*2.0).rgb)*0.13;gl_FragColor=vec4(c,1.0);}';
  const COFS = 'precision mediump float;varying vec2 vP;uniform sampler2D uS,uBl;uniform float uBk,uBs;void main(){vec2 u=vP*0.5+0.5;vec3 c;if(uBs>0.002){vec2 dv=(u-0.5)*uBs*0.06;c=vec3(0.0);for(int i=0;i<6;i++)c+=texture2D(uS,u-dv*float(i)).rgb;c/=6.0;}else c=texture2D(uS,u).rgb;c+=texture2D(uBl,u).rgb*uBk;float v=length(vP)*0.5;c*=1.0-0.18*v*v;gl_FragColor=vec4(c,1.0);}';
  // 大きな天体：球・リング・昼夜の境目・大気のふち。天体ごとの小さな四角の中だけで走らせる（画面ぜんぶでは走らせない）
  const BVS = 'attribute vec2 aP;varying vec2 vP;uniform vec2 uCt,uSz;void main(){vec2 q=uCt+aP*uSz;vP=q;gl_Position=vec4(q,0.9999,1.0);}';
  const BFS = '#ifdef GL_FRAGMENT_PRECISION_HIGH\nprecision highp float;\n#else\nprecision mediump float;\n#endif\n'
    + 'varying vec2 vP;uniform vec3 uF,uR,uU,uSun,uSunC,uBC;uniform vec4 uB;uniform float uTan,uAsp,uQ,uBR;'
    + 'float h31(vec3 p){p=fract(p*0.3183099+0.1);p*=17.0;return fract(p.x*p.y*p.z*(p.x+p.y+p.z));}'
    + 'float vn(vec3 x){vec3 i=floor(x),f=fract(x);f=f*f*(3.0-2.0*f);return mix(mix(mix(h31(i),h31(i+vec3(1,0,0)),f.x),mix(h31(i+vec3(0,1,0)),h31(i+vec3(1,1,0)),f.x),f.y),mix(mix(h31(i+vec3(0,0,1)),h31(i+vec3(1,0,1)),f.x),mix(h31(i+vec3(0,1,1)),h31(i+vec3(1,1,1)),f.x),f.y),f.z);}'
    + 'void main(){vec3 d=normalize(uF+uR*vP.x*uTan*uAsp+uU*vP.y*uTan);vec3 c=uB.xyz;float s=uB.w;float b=dot(d,c);if(b<0.0){gl_FragColor=vec4(0.0);return;}float q2=1.0-b*b;'
    + 'vec3 rn=normalize(vec3(0.22,1.0,0.3));float dr=dot(d,rn);float tr=1e9;float ra=0.0;vec3 rc=vec3(0.0);'
    + 'if(uBR>0.5&&abs(dr)>0.001){float t=dot(c,rn)/dr;if(t>0.0){vec3 p=d*t-c;float rr=length(p)/s;if(rr>1.3&&rr<2.35){float bd=0.5+0.5*sin(rr*46.0)+0.35*vn(vec3(rr*30.0,1.0,2.0));float gap=smoothstep(1.75,1.8,rr)*(1.0-smoothstep(1.86,1.92,rr));ra=(0.28+0.3*bd)*(1.0-gap*0.9)*smoothstep(1.3,1.38,rr)*(1.0-smoothstep(2.25,2.35,rr));tr=t;rc=uBC*(0.55+0.35*bd)*uSunC;}}}'
    + 'float disc=s*s-q2;float ts=1e9;vec4 sp=vec4(0.0);'
    + 'if(disc>0.0){ts=b-sqrt(disc);vec3 n=(d*ts-c)/s;float nd=dot(n,uSun);float lit=smoothstep(-0.12,0.4,nd);float bands=uQ>0.5?vn(vec3(n.x*2.0,n.y*7.0,n.z*2.0)+uBC*5.0)*0.5+0.5*vn(n*5.0+uBC*9.0):0.5;'
    + 'vec3 sc=uBC*(0.55+0.6*bands);vec3 nightc=sc*vec3(0.13,0.15,0.26);vec3 body=mix(nightc,sc*(0.45+0.75*max(nd,0.0))*uSunC,lit);'
    + 'float rim=pow(1.0-clamp(dot(n,-d),0.0,1.0),3.0);body+=mix(vec3(0.3,0.45,0.9),uBC,0.4)*rim*(0.25+0.9*lit);float edge=smoothstep(0.0,0.03*s*s,disc);sp=vec4(body,edge);}'
    + 'vec3 col=vec3(0.0);float al=0.0;bool fr=tr<ts;'
    + 'if(!fr){col=rc*ra;al=ra;}col=sp.rgb*sp.a+col*(1.0-sp.a);al=sp.a+al*(1.0-sp.a);if(fr){col=rc*ra+col*(1.0-ra);al=ra+al*(1.0-ra);}'
    + 'float atm=exp(-max(q2-s*s,0.0)/(s*s*0.35))*0.16*step(0.0,-disc);col+=uBC*atm;gl_FragColor=vec4(col,al);}';
  const PVS = 'attribute vec3 aPos;attribute float aSize;attribute vec4 aCol;uniform mat4 uVP;uniform float uScale;varying vec4 vCol;void main(){vCol=aCol;vec4 p=uVP*vec4(aPos,1.0);gl_Position=p;gl_PointSize=clamp(aSize*uScale/max(p.w,0.5),1.0,uMax);}'.replace('uMax', '96.0');
  const PFS = 'precision mediump float;varying vec4 vCol;void main(){vec2 q=gl_PointCoord-0.5;float d=length(q)*2.0;float a=clamp(1.0-d,0.0,1.0);a*=a;gl_FragColor=vec4(vCol.rgb*a*vCol.a,a*vCol.a);}';

  // 画面にはいる星だけをえがく（ビュー射影行列から6つの面をとりだして、球で調べる）
  function frustum(m) { const r = i => [m[3] + (i < 3 ? m[i * 4 % 16 === 0 ? 0 : 0] : 0)]; const P = []; const row = k => [m[k], m[4 + k], m[8 + k], m[12 + k]]; const a = row(0), b = row(1), c = row(2), w = row(3);
    for (const [x, s] of [[a, 1], [a, -1], [b, 1], [b, -1], [c, 1], [c, -1]]) { const p = [w[0] + s * x[0], w[1] + s * x[1], w[2] + s * x[2], w[3] + s * x[3]], l = Math.hypot(p[0], p[1], p[2]) || 1; P.push([p[0] / l, p[1] / l, p[2] / l, p[3] / l]); } return P; }
  function inFrustum(P, c, r) { for (const p of P) if (p[0] * c[0] + p[1] * c[1] + p[2] * c[2] + p[3] < -r) return false; return true; }
  const LAZY_R = 160;
  function create(canvas, E, opt) {
    opt = opt || {}; let gl = null;
    try { gl = canvas.getContext('webgl', { antialias: false, alpha: false, powerPreference: 'high-performance', preserveDrawingBuffer: !!opt.preserve }) || canvas.getContext('experimental-webgl'); } catch (e) { gl = null; }
    if (!gl) return null;
    const sh = (t, s) => { const o = gl.createShader(t); gl.shaderSource(o, s); gl.compileShader(o); if (!gl.getShaderParameter(o, gl.COMPILE_STATUS)) throw new Error(gl.getShaderInfoLog(o)); return o; };
    const prog = (v, f) => { const p = gl.createProgram(); gl.attachShader(p, sh(gl.VERTEX_SHADER, v)); gl.attachShader(p, sh(gl.FRAGMENT_SHADER, f)); gl.linkProgram(p); if (!gl.getProgramParameter(p, gl.LINK_STATUS)) throw new Error(gl.getProgramInfoLog(p)); const u = {}; const n = gl.getProgramParameter(p, gl.ACTIVE_UNIFORMS); for (let i = 0; i < n; i++) { const a = gl.getActiveUniform(p, i); u[a.name] = gl.getUniformLocation(p, a.name); } return { p, u }; };
    let P, PA, PC, PS, PP, PBR = null, PBL = null, PCO = null, PBD = null; try { P = prog(VS, FS); PA = prog(AVS, AFS); PC = prog(AVS, CFS); try { PBD = prog(BVS, BFS); PBR = prog(SVS, BRFS); PBL = prog(SVS, BLFS); PCO = prog(SVS, COFS); } catch (e) { PBD = PBR = PBL = PCO = null; } PS = prog(SVS, SFS); PP = prog(PVS, PFS); } catch (e) { if (root.console) console.warn('GalaxyGL', e); return null; }
    P.a = { pos: gl.getAttribLocation(P.p, 'aPos'), nor: gl.getAttribLocation(P.p, 'aNor'), col: gl.getAttribLocation(P.p, 'aCol') };
    PA.a = { pos: gl.getAttribLocation(PA.p, 'aPos'), nor: gl.getAttribLocation(PA.p, 'aNor') }; PS.a = { p: gl.getAttribLocation(PS.p, 'aP') };
    PP.a = { pos: gl.getAttribLocation(PP.p, 'aPos'), size: gl.getAttribLocation(PP.p, 'aSize'), col: gl.getAttribLocation(PP.p, 'aCol') };
    const upload = mb => { const o = { n: mb.p.length / 3 }; const mk = a => { const b = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, b); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array(a), gl.STATIC_DRAW); return b; }; o.bp = mk(mb.p); o.bn = mk(mb.n); o.bc = mk(mb.c); return o; };
    const qb = gl.createBuffer(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 1, -1, 1, 1, -1, -1, 1, 1, -1, 1]), gl.STATIC_DRAW);
    const PMAX = 640, pbuf = gl.createBuffer(), parr = new Float32Array(PMAX * 8); gl.bindBuffer(gl.ARRAY_BUFFER, pbuf); gl.bufferData(gl.ARRAY_BUFFER, parr.byteLength, gl.DYNAMIC_DRAW);
    const meshes = {}, st = { w: 300, h: 200, cw: 300, ch: 200, scale: 1, q: opt.quality != null ? opt.quality : 2, fixed: !!opt.fixed, ema: 16, cool: 0, tris: 0, t: 0, vp: M.ident(), aspect: 1, ms: 0, atmo: true, draws: 0, post: false, blur: 0, glowMode: 0, pn: 0, pe: 0, pban: false, coarse: !!(root.matchMedia && root.matchMedia('(pointer: coarse)').matches) };
    let lastOn = null, builtLod = 1, lvl = null, bodyM = [], decoM = [], decoRing = null, L0 = null, snap = null;
    const applyQ = () => { st.scale = [0.55, 0.78, 1][st.q]; resize(st.cw, st.ch); };
    function resize(cw, ch) { st.cw = cw; st.ch = ch; const dpr = Math.min(root.devicePixelRatio || 1, st.q === 2 ? 1.75 : 1.25) * st.scale; st.w = Math.max(96, Math.round(cw * dpr)); st.h = Math.max(96, Math.round(ch * dpr)); if (canvas.width !== st.w || canvas.height !== st.h) { canvas.width = st.w; canvas.height = st.h; } gl.viewport(0, 0, st.w, st.h); st.aspect = st.w / st.h; }
    function setQuality(q, fixed) { st.q = clamp(q | 0, 0, 2); if (fixed != null) st.fixed = !!fixed; applyQ(); if (lvl && builtLod !== (st.q === 0 ? 0 : 1)) { const l = lvl; load(l, lastOn); } }
    function mesh(name, fn) { if (meshes[name]) return meshes[name]; const mb = new MB(); fn(mb); return (meshes[name] = upload(mb)); }
    function load(L, on) {
      free(); lvl = L; lastOn = on || null; builtLod = st.q === 0 ? 0 : 1; bodyM = L.bodies.map(() => null);
      decoM = (L.deco || []).map(d => ({ d, m: upload(planetMesh(d.col, d.ring)) }));
      if (!meshes._atm) { const mb = new MB(); mb.ell(0, 0, 0, 1, 1, 1, [1, 1, 1], 10, 16); meshes._atm = upload(mb); }
    }
    // 近くの星だけメッシュを作る（遠くなったら捨てる）。長いコースでも三角形が増えすぎない
    function ensureBodies(cam) {
      if (!lvl) return; for (let i = 0; i < lvl.bodies.length; i++) { if (lastOn && !lastOn[i]) continue; const b = lvl.bodies[i], p = (st.xfNow && st.xfNow[i] ? st.xfNow[i].p : b.p), d = Math.hypot(p[0] - cam.p[0], p[1] - cam.p[1], p[2] - cam.p[2]);
        if (!bodyM[i] && d < (st.wide ? 900 : LAZY_R)) { const o = upload(bodyMesh(E, b, lvl, builtLod)); o.atm = b.k === 's' && b.g > 0 ? { r: b.r * 1.13, col: atmCol(b.surf) } : null; bodyM[i] = o; }
        else if (bodyM[i] && !st.wide && d > LAZY_R * 1.6) { for (const k of ['bp', 'bn', 'bc']) gl.deleteBuffer(bodyM[i][k]); bodyM[i] = null; } } }
    const atmCol = s => (s === 'ice' ? [0.55, 0.85, 1] : s === 'lava' ? [1, 0.4, 0.15] : s === 'metal' ? [0.55, 0.65, 1] : s === 'stone' ? [0.75, 0.75, 1] : s === 'moss' ? [0.5, 1, 0.8] : [0.5, 0.9, 1]);
    function free() { const dl = m => { if (m) for (const k of ['bp', 'bn', 'bc']) gl.deleteBuffer(m[k]); }; bodyM.forEach(dl); decoM.forEach(d => dl(d.m)); bodyM = []; decoM = []; }
    const bindLit = m => { gl.bindBuffer(gl.ARRAY_BUFFER, m.bp); gl.vertexAttribPointer(P.a.pos, 3, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ARRAY_BUFFER, m.bn); gl.vertexAttribPointer(P.a.nor, 3, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ARRAY_BUFFER, m.bc); gl.vertexAttribPointer(P.a.col, 3, gl.FLOAT, false, 0, 0); };
    const ID = M.ident(), WHITE = [1, 1, 1], ZERO = [0, 0, 0];
    const drawLit = (m, model, tint, emis, rim) => { gl.uniformMatrix4fv(P.u.uModel, false, model || ID); gl.uniform3fv(P.u.uTint, tint || WHITE); gl.uniform1f(P.u.uEmis, emis || 0); gl.uniform3fv(P.u.uRim, rim || ZERO); bindLit(m); gl.drawArrays(gl.TRIANGLES, 0, m.n); st.tris += m.n / 3; };
    function litUniforms(vp, cam, sun, sunC, amb, fogC, fogK) { gl.useProgram(P.p); gl.uniformMatrix4fv(P.u.uVP, false, vp); gl.uniform3fv(P.u.uCam, cam); gl.uniform3fv(P.u.uSun, sun); gl.uniform3fv(P.u.uSunC, sunC); gl.uniform3fv(P.u.uAmb, amb); gl.uniform3fv(P.u.uFogC, fogC); gl.uniform1f(P.u.uFogK, fogK); gl.enableVertexAttribArray(P.a.pos); gl.enableVertexAttribArray(P.a.nor); gl.enableVertexAttribArray(P.a.col); }
    // 1フレーム：fr = { cam:{p,f,u,fov}, t, xf, objs:[{m,M,tint,emis,rim}], parts:{n}, flash, dt }
    function render(fr) {
      const t0 = root.performance ? performance.now() : 0, cam = fr.cam, sky = (lvl && lvl.sky) || {}; st.t = fr.t || 0; st.tris = 0; const post = !!(st.post && st.q === 2 && PCO && postBegin()); if (!post) { gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, st.w, st.h); }
      const fov = cam.fov || 1.05, vw = M.look(cam.p, cam.f, cam.u), proj = M.persp(fov, st.aspect, 0.15, 700); st.vp = M.mul(proj, vw.v); st.fov = fov; st.cam = cam;
      const sun = norm(sky.sun || [0.5, 0.6, -0.5]), sunC = sky.sunc || [1, 0.95, 0.85], n1 = sky.n1 || [0.1, 0.2, 0.5], n2 = sky.n2 || [0.5, 0.4, 0.7];
      gl.disable(gl.BLEND); gl.clearColor(0, 0, 0, 1); gl.clear(gl.COLOR_BUFFER_BIT | gl.DEPTH_BUFFER_BIT);
      // 星空
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.useProgram(PS.p); const u = PS.u;
      gl.uniform3fv(u.uF, cam.f); gl.uniform3fv(u.uR, vw.r); gl.uniform3fv(u.uU, vw.u); gl.uniform3fv(u.uSun, sun); gl.uniform3fv(u.uN1, n1); gl.uniform3fv(u.uN2, n2); gl.uniform3fv(u.uBand, norm(sky.band || [0.3, 0.9, 0.3])); gl.uniform3fv(u.uSunC, sunC.map(v => v * 0.9));
      gl.uniform1f(u.uTan, Math.tan(fov / 2)); gl.uniform1f(u.uAsp, st.aspect); gl.uniform1f(u.uT, st.t); gl.uniform1f(u.uQ, st.q === 0 ? 0.4 : st.q === 1 ? 1 : 2); gl.uniform1f(u.uStar, sky.stars == null ? 1 : sky.stars); gl.uniform3fv(u.uAur, sky.aur && st.q > 0 ? sky.aur : [0, 0, 0]); gl.uniform4fv(u.uLens, sky.lens && st.q > 0 ? [].concat(norm(sky.lens.slice(0, 3)), sky.lens[3]) : [0, 0, 1, 0]);
      gl.bindBuffer(gl.ARRAY_BUFFER, qb); gl.enableVertexAttribArray(PS.a.p); gl.vertexAttribPointer(PS.a.p, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.disableVertexAttribArray(PS.a.p);
      // 天体（空に固定）：画面に入るぶんだけ、まわりの四角にだけ描く
      if (PBD && lvl && lvl.deco && lvl.deco.length) {
        gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE_MINUS_SRC_ALPHA); gl.useProgram(PBD.p); const bu = PBD.u, tn = Math.tan(fov / 2), fvd = Math.atan(Math.hypot(tn, tn * st.aspect));
        gl.uniform3fv(bu.uF, cam.f); gl.uniform3fv(bu.uR, vw.r); gl.uniform3fv(bu.uU, vw.u); gl.uniform3fv(bu.uSun, sun); gl.uniform3fv(bu.uSunC, sunC); gl.uniform1f(bu.uTan, tn); gl.uniform1f(bu.uAsp, st.aspect); gl.uniform1f(bu.uQ, st.q === 0 ? 0.4 : st.q === 1 ? 1 : 2);
        gl.bindBuffer(gl.ARRAY_BUFFER, qb); const ba = gl.getAttribLocation(PBD.p, 'aP'); gl.enableVertexAttribArray(ba); gl.vertexAttribPointer(ba, 2, gl.FLOAT, false, 0, 0);
        for (let k = 0; k < 3 && k < lvl.deco.length; k++) {
          const d = lvl.deco[k], dr = norm(d.dir), D = 300, par = 0.012, pp = norm([dr[0] * D - cam.p[0] * par, dr[1] * D - cam.p[1] * par, dr[2] * D - cam.p[2] * par]), sn = Math.min(0.5, d.r * 1.6 / D), ang = Math.asin(sn), ext = ang * (d.ring ? 2.6 : 2.2);
          const x = pp[0] * vw.r[0] + pp[1] * vw.r[1] + pp[2] * vw.r[2], y = pp[0] * vw.u[0] + pp[1] * vw.u[1] + pp[2] * vw.u[2], z = pp[0] * cam.f[0] + pp[1] * cam.f[1] + pp[2] * cam.f[2], a0 = Math.acos(Math.max(-1, Math.min(1, z)));
          if (a0 > fvd + ext) continue;
          let cx = 0, cy = 0, sx = 1, sy = 1; if (z > 0.35) { const te = Math.tan(Math.min(1.45, ext)); cx = x / (z * tn * st.aspect); cy = y / (z * tn); sx = Math.min(4, (te / tn) / st.aspect * 1.15 + 0.02); sy = Math.min(4, (te / tn) * 1.15 + 0.02); }
          gl.uniform2f(bu.uCt, cx, cy); gl.uniform2f(bu.uSz, sx, sy); gl.uniform4f(bu.uB, pp[0], pp[1], pp[2], sn); gl.uniform3fv(bu.uBC, d.col); gl.uniform1f(bu.uBR, d.ring ? 1 : 0);
          gl.drawArrays(gl.TRIANGLES, 0, 6);
        }
        gl.disableVertexAttribArray(ba); gl.disable(gl.BLEND);
      }
      const amb = [0.3, 0.32, 0.4].map((v, i) => v + n1[i] * 0.25), fogC = n1.map(v => v * 0.25);
      gl.enable(gl.DEPTH_TEST); gl.enable(gl.CULL_FACE); gl.cullFace(gl.BACK); gl.frontFace(gl.CCW);
      gl.clear(gl.DEPTH_BUFFER_BIT);
      // 世界
      litUniforms(st.vp, cam.p, sun, sunC, sky.dark ? amb.map(v => v * 0.5) : amb, fogC, sky.dark ? 0.011 : 0.0016);
      const xf = fr.xf; st.xfNow = xf; ensureBodies(cam); const pl = frustum(st.vp); st.culled = 0; const vis = []; for (let i = 0; i < bodyM.length; i++) { if (!bodyM[i] || (fr.on && fr.on[i] === false)) { vis[i] = false; continue; } const bb = lvl.bodies[i]; if (!inFrustum(pl, xf[i].p, bb.br * (bb.ring ? 2.2 : 1.15))) { st.culled++; vis[i] = false; continue; } vis[i] = true; gl.uniform1f(P.u.uSpec, bb.surf === 'water' ? 0.9 : bb.surf === 'ice' ? 0.35 : 0); drawLit(bodyM[i], M.fromRP(xf[i].R, xf[i].p), WHITE, 0, [0.2, 0.28, 0.45]); }
      for (const o of fr.objs || []) { const m = meshes[o.m]; if (m) drawLit(m, o.M, o.tint, o.emis, o.rim); }
      gl.disableVertexAttribArray(P.a.pos); gl.disableVertexAttribArray(P.a.nor); gl.disableVertexAttribArray(P.a.col);
      // 大気の輪（足す）
      gl.enable(gl.BLEND); gl.blendFunc(gl.ONE, gl.ONE); gl.depthMask(false);
      if (st.q > 0 && meshes._atm) { /* bodyM[i] may be null (not in this mission) */
        gl.useProgram(PA.p); gl.uniformMatrix4fv(PA.u.uVP, false, st.vp); gl.uniform3fv(PA.u.uCam, cam.p); gl.uniform3fv(PA.u.uSun, sun); gl.enableVertexAttribArray(PA.a.pos); gl.enableVertexAttribArray(PA.a.nor); const am = meshes._atm;
        gl.bindBuffer(gl.ARRAY_BUFFER, am.bp); gl.vertexAttribPointer(PA.a.pos, 3, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ARRAY_BUFFER, am.bn); gl.vertexAttribPointer(PA.a.nor, 3, gl.FLOAT, false, 0, 0);
        for (let i = 0; i < bodyM.length; i++) { const a = bodyM[i] && bodyM[i].atm; if (!a || vis[i] === false) continue; const f = xf[i]; gl.uniformMatrix4fv(PA.u.uModel, false, M.basis(f.p, [0, 0, 1], [0, 1, 0], a.r)); gl.uniform3fv(PA.u.uCol, a.col); gl.uniform1f(PA.u.uA, 0.9); gl.drawArrays(gl.TRIANGLES, 0, am.n); }
        if (st.q > 0 && !st.lowFx) { gl.useProgram(PC.p); gl.uniformMatrix4fv(PC.u.uVP, false, st.vp); gl.uniform3fv(PC.u.uCam, cam.p); gl.uniform3fv(PC.u.uSun, sun); gl.uniform1f(PC.u.uT, st.t); const ca = gl.getAttribLocation(PC.p, 'aPos'), cn = gl.getAttribLocation(PC.p, 'aNor'); gl.enableVertexAttribArray(ca); gl.enableVertexAttribArray(cn); gl.bindBuffer(gl.ARRAY_BUFFER, am.bp); gl.vertexAttribPointer(ca, 3, gl.FLOAT, false, 0, 0); gl.bindBuffer(gl.ARRAY_BUFFER, am.bn); gl.vertexAttribPointer(cn, 3, gl.FLOAT, false, 0, 0);
          for (let i = 0; i < bodyM.length; i++) { const a = bodyM[i] && bodyM[i].atm, bb = lvl.bodies[i]; if (!a || vis[i] === false || bb.surf === 'lava' || bb.surf === 'metal' || bb.surf === 'stone') continue; { const cd = Math.hypot(cam.p[0] - xf[i].p[0], cam.p[1] - xf[i].p[1], cam.p[2] - xf[i].p[2]) - bb.r, fd = Math.max(0, Math.min(1, (cd - bb.r * 0.7) / (bb.r * 1.6))); if (fd <= 0) continue; gl.uniform1f(PC.u.uFd, fd); } gl.uniformMatrix4fv(PC.u.uModel, false, M.basis(xf[i].p, [0, 0, 1], [0, 1, 0], bb.r * 1.055)); gl.drawArrays(gl.TRIANGLES, 0, am.n); }
          gl.disableVertexAttribArray(ca); gl.disableVertexAttribArray(cn); }
        gl.disableVertexAttribArray(PA.a.pos); gl.disableVertexAttribArray(PA.a.nor);
      }
      // 光る粒
      const np = Math.min(fr.parts ? fr.parts.n : 0, PMAX);
      if (np > 0) { gl.useProgram(PP.p); gl.uniformMatrix4fv(PP.u.uVP, false, st.vp); gl.uniform1f(PP.u.uScale, st.h * 0.6); gl.bindBuffer(gl.ARRAY_BUFFER, pbuf); gl.bufferSubData(gl.ARRAY_BUFFER, 0, fr.parts.a.subarray(0, np * 8));
        gl.enableVertexAttribArray(PP.a.pos); gl.enableVertexAttribArray(PP.a.size); gl.enableVertexAttribArray(PP.a.col); gl.vertexAttribPointer(PP.a.pos, 3, gl.FLOAT, false, 32, 0); gl.vertexAttribPointer(PP.a.size, 1, gl.FLOAT, false, 32, 12); gl.vertexAttribPointer(PP.a.col, 4, gl.FLOAT, false, 32, 16);
        gl.drawArrays(gl.POINTS, 0, np); gl.disableVertexAttribArray(PP.a.pos); gl.disableVertexAttribArray(PP.a.size); gl.disableVertexAttribArray(PP.a.col); }
      gl.depthMask(true); gl.disable(gl.BLEND);
      if (post) postEnd();
      if (snap) { const cb = snap; snap = null; try { cb(canvas); } catch (e) { /* ignore */ } }
      st.ms = root.performance ? performance.now() - t0 : 0;
    }
    // 軽いブルーム（高画質のときだけ）：シーンを一度テクスチャに描き、明るいところを 1/4 の大きさでぼかして足す。レーン発射中は放射ブラーも。
    const PO = { fbo: null, tex: null, dep: null, w: 0, h: 0, bt: [null, null], bf: [null, null], bw: 0, bh: 0 };
    function mkTex(w, h) { const t = gl.createTexture(); gl.bindTexture(gl.TEXTURE_2D, t); gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, w, h, 0, gl.RGBA, gl.UNSIGNED_BYTE, null); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE); gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE); return t; }
    function postFree() { for (const k of ['fbo', 'tex', 'dep']) PO[k] = null; PO.w = 0; }
    function postBegin() {
      if (PO.w !== st.w || PO.h !== st.h || !PO.fbo) {
        const w = st.w, h = st.h, bw = Math.max(32, w >> 2), bh = Math.max(32, h >> 2);
        PO.tex = mkTex(w, h); PO.dep = gl.createRenderbuffer(); gl.bindRenderbuffer(gl.RENDERBUFFER, PO.dep); gl.renderbufferStorage(gl.RENDERBUFFER, gl.DEPTH_COMPONENT16, w, h);
        PO.fbo = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, PO.fbo); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, PO.tex, 0); gl.framebufferRenderbuffer(gl.FRAMEBUFFER, gl.DEPTH_ATTACHMENT, gl.RENDERBUFFER, PO.dep);
        for (let i = 0; i < 2; i++) { PO.bt[i] = mkTex(bw, bh); PO.bf[i] = gl.createFramebuffer(); gl.bindFramebuffer(gl.FRAMEBUFFER, PO.bf[i]); gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, PO.bt[i], 0); }
        PO.w = w; PO.h = h; PO.bw = bw; PO.bh = bh;
        if (gl.checkFramebufferStatus(gl.FRAMEBUFFER) !== gl.FRAMEBUFFER_COMPLETE) { st.post = false; gl.bindFramebuffer(gl.FRAMEBUFFER, null); return false; }
      }
      gl.bindFramebuffer(gl.FRAMEBUFFER, PO.fbo); gl.viewport(0, 0, st.w, st.h); return true;
    }
    function postEnd() {
      const pass = (P2, tex, o) => { gl.useProgram(P2.p); gl.activeTexture(gl.TEXTURE0); gl.bindTexture(gl.TEXTURE_2D, tex); gl.uniform1i(P2.u.uS, 0); if (o) o(); gl.bindBuffer(gl.ARRAY_BUFFER, qb); const a = gl.getAttribLocation(P2.p, 'aP'); gl.enableVertexAttribArray(a); gl.vertexAttribPointer(a, 2, gl.FLOAT, false, 0, 0); gl.drawArrays(gl.TRIANGLES, 0, 6); gl.disableVertexAttribArray(a); };
      gl.disable(gl.DEPTH_TEST); gl.disable(gl.CULL_FACE); gl.disable(gl.BLEND); gl.depthMask(false);
      gl.bindFramebuffer(gl.FRAMEBUFFER, PO.bf[0]); gl.viewport(0, 0, PO.bw, PO.bh); pass(PBR, PO.tex);
      gl.bindFramebuffer(gl.FRAMEBUFFER, PO.bf[1]); pass(PBL, PO.bt[0], () => gl.uniform2f(PBL.u.uD, 1.6 / PO.bw, 0));
      gl.bindFramebuffer(gl.FRAMEBUFFER, PO.bf[0]); pass(PBL, PO.bt[1], () => gl.uniform2f(PBL.u.uD, 0, 1.6 / PO.bh));
      gl.bindFramebuffer(gl.FRAMEBUFFER, null); gl.viewport(0, 0, st.w, st.h);
      pass(PCO, PO.tex, () => { gl.activeTexture(gl.TEXTURE1); gl.bindTexture(gl.TEXTURE_2D, PO.bt[0]); gl.uniform1i(PCO.u.uBl, 1); gl.uniform1f(PCO.u.uBk, 0.45); gl.uniform1f(PCO.u.uBs, st.blur || 0); gl.activeTexture(gl.TEXTURE0); });
      gl.depthMask(true); gl.enable(gl.DEPTH_TEST);
    }
    function setGlow(m) { st.glowMode = m | 0; st.post = st.glowMode === 1; if (st.glowMode === 0) { st.pn = 0; st.pe = 0; } }
    // 自動：はじめの数秒のフレーム時間が元気なときだけオン。オンにしたあとに遅くなったらそのセッションは二度とオンにしない
    function glowAuto(ms) {
      if (st.glowMode !== 0 || st.pban || st.q < 2) { if (st.glowMode === 0 && st.q < 2) st.post = false; return; }
      st.pn++; st.pe = st.pn === 1 ? ms : st.pe * 0.9 + ms * 0.1;
      if (!st.post) { if (st.pn >= (st.coarse ? 240 : 90) && st.pe < 18) { st.post = true; st.pn = 0; } }
      else if (st.pn > 90 && st.pe > 24) { st.post = false; st.pban = true; }
    }
    function adapt(frameMs) { glowAuto(frameMs); if (st.fixed) return; st.ema = st.ema * 0.93 + frameMs * 0.07; st.cool++; if (st.cool < 50) return; if (st.ema > 29 && st.q > 0) { st.q--; st.cool = 0; applyQ(); } else if (st.ema < 18 && st.q < 2 && st.cool > 300) { st.q++; st.cool = 0; applyQ(); } }
    function project(x, y, z) { const m = st.vp, w = m[3] * x + m[7] * y + m[11] * z + m[15]; if (w <= 0.1) return null; const nx = (m[0] * x + m[4] * y + m[8] * z + m[12]) / w, ny = (m[1] * x + m[5] * y + m[9] * z + m[13]) / w; return { x: (nx * 0.5 + 0.5) * st.cw, y: (1 - (ny * 0.5 + 0.5)) * st.ch, w, in: Math.abs(nx) < 1 && Math.abs(ny) < 1 }; }
    function dispose() { try { const e = gl.getExtension('WEBGL_lose_context'); if (e) e.loseContext(); } catch (x) { /* ignore */ } }
    applyQ();
    return { render, resize, load, mesh, setQuality, adapt, project, dispose, free, postFree, setGlow, state: st, gl, M, MB, hex, mix, canvas, snap(cb) { snap = cb; } };
  }
  const GalaxyGL = { create, M, MB, hex, mix, PAL, bodyMesh, frustum, inFrustum, LAZY_R };
  if (typeof module !== 'undefined' && module.exports) module.exports = GalaxyGL; else root.GalaxyGL = GalaxyGL;
})(typeof window !== 'undefined' ? window : globalThis);
