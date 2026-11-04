// あなぼこシティ: cities built from real map data (hole/cities/<id>.json, made by tools/osm-city.js).
// Map data © OpenStreetMap contributors (ODbL 1.0), elevation: 国土地理院 標高タイル.
// The page calls HoleRealFactory(E) once with its engine internals; the factory returns
//   load(C)            fetch + decode the city's data file (cached on C.D)
//   build(C, area)     ground / roads / buildings (merged chunk meshes) + edible objects inside `area`
//   gy(x, z)           ground height
//   fpWrite(o), fpShade(o, v), reset(), clear(), labels(on)
(function () {
'use strict';
window.HoleRealFactory = function (E) {
  const THREE = E.THREE, scene = E.scene;
  const CH = 160; // chunk size (m) of the merged meshes: frustum culling keeps the draw calls low while playing
  let cur = null; // the city built now

  // ---------------------------------------------------------------- data
  function load(C) {
    if (C.D) return Promise.resolve(C.D);
    if (C.loading) return C.loading;
    C.loading = fetch(C.data, { cache: 'force-cache' }).then(r => { if (!r.ok) throw new Error('city data ' + r.status); return r.json(); })
      .then(j => { C.D = decode(j); C.loading = null; return C.D; }, e => { C.loading = null; throw e; });
    return C.loading;
  }
  function pts(rec, i, q) {
    const n = rec[i], out = new Array(n); let x = 0, z = 0;
    for (let k = 0; k < n; k++) { x += rec[i + 1 + k * 2]; z += rec[i + 2 + k * 2]; out[k] = [x * q, z * q]; }
    return out;
  }
  function decode(j) {
    const q = j.q, D = { id: j.id, box: j.r, src: j.src, hg: j.hg, b: [], rd: [], rl: [], ar: [], wl: [], tr: [], lb: j.lb || [], pt: j.en || [] };
    for (const r of j.b) D.b.push({ kind: r[0], h: r[1] / 10, mh: r[2] / 10, fl: r[3], p: pts(r, 4, q) });
    for (const r of j.rd) D.rd.push({ c: r[0], w: r[1] / 10, l: r[2], p: pts(r, 3, q) });
    for (const r of j.rl) D.rl.push({ c: r[0] % 10, sv: r[0] >= 10, l: r[1], op: r[2], p: pts(r, 3, q) });
    for (const r of j.ar) D.ar.push({ c: r[0] % 100, l: (r[0] / 100) | 0, p: pts(r, 1, q) });
    for (const r of j.wl) D.wl.push({ w: r[0] / 10, p: pts(r, 1, q) });
    for (let i = 0; i < j.tr.length; i += 2) D.tr.push([j.tr[i] * q, j.tr[i + 1] * q]);
    // elevation grid (dm, delta coded along the rows)
    const g = j.hg, H = new Float32Array(g.nx * g.nz);
    for (let jz = 0; jz < g.nz; jz++) { let v = 0; for (let i = 0; i < g.nx; i++) { v += g.d[jz * g.nx + i]; H[jz * g.nx + i] = v / 10; } }
    D.H = H;
    // islands (class 19, from the coastline) are holes in the sea around them
    const isl = D.ar.filter(a => a.c === 19);
    if (isl.length) for (const a of D.ar) if (a.c === 5) a.holes = isl.filter(b => pointIn(a.p, b.p[0][0], b.p[0][1])).map(b => b.p);
    return D;
  }
  // bilinear ground height
  function gy(x, z) {
    if (!cur) return 0;
    const g = cur.D.hg, H = cur.D.H, fx = (x - g.x0) / g.s, fz = (z - g.z0) / g.s;
    const i = Math.max(0, Math.min(g.nx - 2, Math.floor(fx))), j = Math.max(0, Math.min(g.nz - 2, Math.floor(fz)));
    const u = Math.max(0, Math.min(1, fx - i)), v = Math.max(0, Math.min(1, fz - j)), k = j * g.nx + i;
    // the same two triangles per cell as the terrain mesh (diagonal from (i+1, j) to (i, j+1))
    if (u + v <= 1) return H[k] + (H[k + 1] - H[k]) * u + (H[k + g.nx] - H[k]) * v;
    const h11 = H[k + g.nx + 1];
    return h11 + (H[k + g.nx] - h11) * (1 - u) + (H[k + 1] - h11) * (1 - v);
  }

  // ---------------------------------------------------------------- materials
  // vertex colours + procedural windows (wv = along-wall metres, height above the base, window style)
  const shades = [];
  function cityMat(o) {
    o = o || {};
    const m = new THREE.MeshLambertMaterial(Object.assign({ vertexColors: true }, o.stencil ? E.STENCIL_TEST : {}, o.mat || {}));
    const U = { uShade: { value: 1 } }; m.userData.U = U;
    m.onBeforeCompile = sh => {
      sh.uniforms.uShade = U.uShade; sh.uniforms.uNight = E.NIGHT || { value: 0 };
      sh.vertexShader = sh.vertexShader.replace('#include <common>', '#include <common>\nattribute vec3 wv;\nvarying vec3 vWv;')
        .replace('#include <color_vertex>', '#include <color_vertex>\nvWv = wv;');
      sh.fragmentShader = sh.fragmentShader.replace('#include <common>', '#include <common>\nuniform float uShade;\nuniform float uNight;\nvarying vec3 vWv;')
        .replace('#include <emissivemap_fragment>', `#include <emissivemap_fragment>
  // night: some of the windows are lit
  if (uNight > 0.01 && cWin > 0.5) { float lit = step(0.42, fract(sin(dot(floor(vec2(vWv.x / 2.6, vWv.y / 3.2)), vec2(12.9898, 78.233))) * 43758.5453));
    totalEmissiveRadiance += vec3(1.0, 0.82, 0.52) * lit * uNight * 0.75; }`)
        .replace('#include <color_fragment>', `#include <color_fragment>
  float cWin = 0.0;
  {
    float t = vWv.z, u = vWv.x, y = vWv.y, k = 1.0;
    if (t > 0.5) {
      if (t < 1.5) { // house: small windows
        if (fract(u / 3.4) > 0.32 && fract(u / 3.4) < 0.62 && fract(y / 2.9) > 0.38 && fract(y / 2.9) < 0.72 && y > 0.8) k = 0.55;
      } else if (t < 2.5) { // apartments: window band + light balcony band
        float f = fract(y / 2.9);
        if (y > 1.0) { if (f < 0.14) k = 1.12; else if (f > 0.42 && f < 0.78 && fract(u / 2.6) > 0.12) k = 0.5; }
      } else if (t < 3.5) { // office: glass grid
        if (fract(y / 3.6) > 0.2 && fract(u / 1.7) > 0.1) k = 0.62; else k = 1.06;
      } else if (t < 4.5) { // shops: glass at the street, bands above
        if (y < 3.0) { if (y > 0.3 && fract(u / 4.0) > 0.08) k = 0.45; }
        else if (fract(y / 3.4) > 0.3 && fract(y / 3.4) < 0.8 && fract(u / 2.4) > 0.15) k = 0.6;
      } else { // station / hall: one tall glass band
        if (y > 1.2 && fract(y / 4.5) > 0.25 && fract(u / 3.0) > 0.06) k = 0.66;
      }
    }
    if (k < 0.7) cWin = 1.0;
    diffuseColor.rgb *= k * uShade;
  }`);
    };
    m.customProgramCacheKey = () => 'cityMat' + (o.stencil ? 's' : '');
    return m;
  }
  const bMat = cityMat();                                  // buildings, decks, viaducts
  const bMatFar = new THREE.MeshLambertMaterial({ vertexColors: true }); // the far versions of the building chunks (no window pattern)
  const gMat = cityMat({ stencil: true, mat: { side: THREE.DoubleSide, polygonOffset: true, polygonOffsetFactor: -2.5, polygonOffsetUnits: -6 } }); // roads, water, markings

  // ---------------------------------------------------------------- geometry buffers
  function Buf() { return { p: [], n: [], c: [], w: [] }; }
  function tri(B, a, b, c, col, nx, ny, nz, wa, wb, wc) {
    B.p.push(a[0], a[1], a[2], b[0], b[1], b[2], c[0], c[1], c[2]);
    for (let i = 0; i < 3; i++) { B.n.push(nx, ny, nz); B.c.push(col[0], col[1], col[2]); }
    B.w.push(...(wa || Z3), ...(wb || Z3), ...(wc || Z3));
  }
  const Z3 = [0, 0, 0];
  function triN(B, a, b, c, col, w) { // computes the face normal
    const ux = b[0] - a[0], uy = b[1] - a[1], uz = b[2] - a[2], vx = c[0] - a[0], vy = c[1] - a[1], vz = c[2] - a[2];
    let nx = uy * vz - uz * vy, ny = uz * vx - ux * vz, nz = ux * vy - uy * vx; const L = Math.hypot(nx, ny, nz) || 1;
    tri(B, a, b, c, col, nx / L, ny / L, nz / L, w, w, w);
  }
  function quad(B, a, b, c, d, col, w) { triN(B, a, b, c, col, w); triN(B, a, c, d, col, w); }
  function box(B, x, y0, z, sx, sy, sz, col, yaw) {
    const cs = Math.cos(yaw || 0), sn = Math.sin(yaw || 0), hx = sx / 2, hz = sz / 2, y1 = y0 + sy;
    const P = (dx, dz, y) => [x + dx * cs - dz * sn, y, z + dx * sn + dz * cs];
    const c = [P(-hx, -hz, 0), P(hx, -hz, 0), P(hx, hz, 0), P(-hx, hz, 0)];
    for (let i = 0; i < 4; i++) { const a = c[i], b = c[(i + 1) % 4]; quad(B, [a[0], y0, a[2]], [a[0], y1, a[2]], [b[0], y1, b[2]], [b[0], y0, b[2]], col); }
    quad(B, [c[0][0], y1, c[0][2]], [c[3][0], y1, c[3][2]], [c[2][0], y1, c[2][2]], [c[1][0], y1, c[1][2]], col);
  }
  function toGeo(B) {
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(B.p, 3));
    g.setAttribute('normal', new THREE.Float32BufferAttribute(B.n, 3));
    g.setAttribute('color', new THREE.Float32BufferAttribute(B.c, 3));
    g.setAttribute('wv', new THREE.Float32BufferAttribute(B.w, 3));
    g.computeBoundingSphere();
    return g;
  }
  const C3 = hex => { const c = new THREE.Color(hex); return [c.r, c.g, c.b]; };
  const mixc = (a, b, t) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t];
  // chunked buffers
  function Chunks() { const m = new Map(); return { get(x, z) { const k = Math.floor(x / CH) + ',' + Math.floor(z / CH); let b = m.get(k); if (!b) { b = Buf(); m.set(k, b); } return b; }, all: m }; }
  function hsh(i) { let h = (i + 1) * 2654435761 >>> 0; h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13; return (h >>> 0) / 4294967296; }
  const pickH = (a, r) => a[Math.floor(r * a.length) % a.length];

  // ---------------------------------------------------------------- polylines on the ground
  function subdiv(p, step) {
    const o = [p[0]];
    for (let i = 1; i < p.length; i++) {
      const a = p[i - 1], b = p[i], L = Math.hypot(b[0] - a[0], b[1] - a[1]), n = Math.max(1, Math.ceil(L / step));
      for (let k = 1; k <= n; k++) o.push([a[0] + (b[0] - a[0]) * k / n, a[1] + (b[1] - a[1]) * k / n]);
    }
    return o;
  }
  // a ribbon along a polyline (miter joins), y = ground + lift (or a fixed deck height above the ground)
  function ribbon(B, p, w, col, lift, o) {
    o = o || {};
    if (p.length < 2) return;
    const q = subdiv(p, o.step || 7), n = q.length, hw = w / 2, L = [], R = [];
    for (let i = 0; i < n; i++) {
      const a = q[Math.max(0, i - 1)], b = q[Math.min(n - 1, i + 1)];
      let dx = b[0] - a[0], dz = b[1] - a[1]; const l = Math.hypot(dx, dz) || 1; dx /= l; dz /= l;
      let mx = -dz, mz = dx, k = 1;
      if (i > 0 && i < n - 1) {
        const c = q[i], p0 = q[i - 1], d1x = c[0] - p0[0], d1z = c[1] - p0[1], l1 = Math.hypot(d1x, d1z) || 1;
        const cosh = (-d1z / l1) * mx + (d1x / l1) * mz; k = 1 / Math.max(0.5, cosh);
      }
      const x = q[i][0], z = q[i][1], lx = x + mx * hw * k, lz = z + mz * hw * k, rx = x - mx * hw * k, rz = z - mz * hw * k;
      if (o.fixed != null) { const y = o.fixed + lift; L.push([lx, y, lz]); R.push([rx, y, rz]); }
      else { L.push([lx, gy(lx, lz) + lift, lz]); R.push([rx, gy(rx, rz) + lift, rz]); } // each edge on the ground (cross slopes)
    }
    for (let i = 0; i < n - 1; i++) {
      if (o.dash && (i % 2)) continue;
      tri(B, L[i], R[i + 1], R[i], col, 0, 1, 0); tri(B, L[i], L[i + 1], R[i + 1], col, 0, 1, 0);
    }
    if (o.caps) for (const e of [0, n - 1]) disc(B, q[e][0], q[e][1], hw, col, (o.fixed != null ? o.fixed : gy(q[e][0], q[e][1])) + lift);
    if (o.side) { // railings / parapets on both edges
      for (const S of [L, R]) for (let i = 0; i < n - 1; i++) { const a = S[i], b = S[i + 1], a1 = [a[0], a[1] + o.side, a[2]], b1 = [b[0], b[1] + o.side, b[2]]; quad(B, a, a1, b1, b, o.sideCol || col); quad(B, b, b1, a1, a, o.sideCol || col); }
    }
    if (o.under) { // deck underside
      for (let i = 0; i < n - 1; i++) { const d = o.under; tri(B, [L[i][0], L[i][1] - d, L[i][2]], [R[i][0], R[i][1] - d, R[i][2]], [R[i + 1][0], R[i + 1][1] - d, R[i + 1][2]], o.underCol || col, 0, -1, 0); tri(B, [L[i][0], L[i][1] - d, L[i][2]], [R[i + 1][0], R[i + 1][1] - d, R[i + 1][2]], [L[i + 1][0], L[i + 1][1] - d, L[i + 1][2]], o.underCol || col, 0, -1, 0);
        quad(B, [L[i][0], L[i][1] - d, L[i][2]], L[i], L[i + 1], [L[i + 1][0], L[i + 1][1] - d, L[i + 1][2]], o.underCol || col); quad(B, [R[i + 1][0], R[i + 1][1] - d, R[i + 1][2]], R[i + 1], R[i], [R[i][0], R[i][1] - d, R[i][2]], o.underCol || col); }
    }
  }
  function disc(B, x, z, r, col, y) {
    const N = r > 3 ? 10 : 7;
    for (let i = 0; i < N; i++) { const a0 = i / N * 6.2832, a1 = (i + 1) / N * 6.2832; tri(B, [x, y, z], [x + Math.cos(a1) * r, y, z + Math.sin(a1) * r], [x + Math.cos(a0) * r, y, z + Math.sin(a0) * r], col, 0, 1, 0); }
  }
  function polyFill(B, p, y, col, flip, holes) {
    const v = p.map(q => new THREE.Vector2(q[0], q[1])), hv = (holes || []).map(h => h.map(q => new THREE.Vector2(q[0], q[1])));
    let f; try { f = THREE.ShapeUtils.triangulateShape(v, hv); } catch (e) { return; }
    if (holes && holes.length) p = p.concat(...holes);
    for (const t of f) { const a = p[t[0]], b = p[t[1]], c = p[t[2]]; const yy = typeof y === 'function' ? y : () => y;
      if (flip) tri(B, [a[0], yy(a), a[1]], [b[0], yy(b), b[1]], [c[0], yy(c), c[1]], col, 0, -1, 0);
      else tri(B, [a[0], yy(a), a[1]], [c[0], yy(c), c[1]], [b[0], yy(b), b[1]], col, 0, 1, 0); }
  }
  function slab(B, p, y0, y1, col, colTop) {
    const n = p.length;
    for (let i = 0; i < n; i++) { const a = p[i], b = p[(i + 1) % n]; quad(B, [a[0], y0, a[1]], [a[0], y1, a[1]], [b[0], y1, b[1]], [b[0], y0, b[1]], col); }
    polyFill(B, p, y1, colTop || col); polyFill(B, p, y0, col, true);
  }

  // ---------------------------------------------------------------- buildings
  const PAL = {
    1: { w: ['#f2ede3', '#ebe3d3', '#f6f3ec', '#e4d9c6', '#dcd4c7', '#f0e7da', '#e8eaec'], r: ['#5b5f68', '#6e4b3c', '#4d5b6b', '#7a6d60', '#41474f', '#8a5a46', '#5f6a5a'] },
    2: { w: ['#ece6da', '#e4ddd0', '#d8d2c6', '#efe9e0', '#d9cfc0', '#e8e4dc', '#d4d8dc'], r: ['#b9b6ae'] },
    3: { w: ['#e6e0d6', '#d5d9de', '#cfc6b8', '#e2d2c0', '#c7ccd3', '#dfd6c9', '#e9e4dc'], r: ['#aeb0b2'] },
    4: { w: ['#c2ccd6', '#b4c0cc', '#d0d6dc', '#a8b6c4', '#c8ccd0'], r: ['#9fa6ae'] },
    5: { w: ['#e8e4dc'], r: ['#c4c6c8'] }, 6: { w: ['#f2efe8', '#ece8de'], r: ['#b4b8bc'] }, 7: { w: ['#e4e2dc', '#dcdcd6', '#e8e2d4'], r: ['#b0b4b8'] },
    8: { w: ['#c8c4bc', '#b8bcc2', '#d0ccc2'], r: ['#9ea2a6'] }, 9: { w: ['#c9b391', '#d8c8a8'], r: ['#4a4a50'] }, 10: { w: ['#b8b2a8', '#a8aab0'], r: ['#8e9094'] },
    11: { w: ['#c8ccd0'], r: ['#c4c8cc'] },
  };
  // window style per kind (0 generic decides by height)
  const WIN = { 1: 1, 2: 2, 3: 4, 4: 3, 5: 5, 6: 2, 7: 5, 8: 0, 9: 0, 10: 0, 11: 0 };
  function obb(p) {
    let best = null;
    for (let i = 0; i < p.length; i++) {
      const a = p[i], b = p[(i + 1) % p.length], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.5) continue;
      const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L; let u0 = 1e9, u1 = -1e9, v0 = 1e9, v1 = -1e9;
      for (const q of p) { const u = q[0] * ux + q[1] * uz, v = -q[0] * uz + q[1] * ux; u0 = Math.min(u0, u); u1 = Math.max(u1, u); v0 = Math.min(v0, v); v1 = Math.max(v1, v); }
      const A = (u1 - u0) * (v1 - v0); if (!best || A < best.A) best = { A, ux, uz, u0, u1, v0, v1 };
    }
    return best;
  }
  function polyArea2(p) { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return s / 2; }
  function polyArea(p) { let s = 0; for (let i = 0, j = p.length - 1; i < p.length; j = i++) s += (p[j][0] + p[i][0]) * (p[j][1] - p[i][1]); return Math.abs(s / 2); }
  // emit one building into B; returns [x, z, base y, radius, height] (centroid)
  // lite: the far version (distance LOD): a plain prism (the outline squared to its box when it is nearly a rectangle),
  // flat roof at the middle of the pitched one, no roof equipment
  function emitBuilding(B, b, idx, lite) {
    let p = b.p, n = p.length; const r = hsh(idx), r2 = hsh(idx + 7777);
    let cx = 0, cz = 0, ymin = 1e9, ysum = 0;
    for (const q of p) { cx += q[0]; cz += q[1]; const y = gy(q[0], q[1]); ymin = Math.min(ymin, y); ysum += y; }
    cx /= n; cz /= n;
    const A = polyArea(p), ob = obb(p), rect = ob && A / ob.A > 0.82;
    if (lite && rect && n > 4) { const { ux, uz, u0, u1, v0, v1 } = ob; p = [[u0, v0], [u1, v0], [u1, v1], [u0, v1]].map(([u, v]) => [u * ux - v * uz, u * uz + v * ux]); if (polyArea2(p) < 0) p.reverse(); n = 4; }
    let kind = b.kind;
    const hy = b.h;
    if (kind === 0) kind = hy < 8.5 && A < 260 ? 1 : hy < 13 ? (r2 < 0.5 ? 2 : 3) : hy < 30 ? (r2 < 0.4 ? 2 : r2 < 0.75 ? 3 : 4) : 4;
    const pal = PAL[kind] || PAL[3], pnt = cur.paint && cur.paint.get(b); let wall = C3(pnt && pnt[0] || pickH(pal.w, r)), roofC = C3(pnt && pnt[1] || pickH(pal.r, r2));
    if (cur.D.pal && cur.D.pal.snow) roofC = mixc(roofC, [0.95, 0.97, 1], 0.82); // snow on the roofs
    const base = ymin - 0.25, y0 = base + b.mh, top = ysum / n + b.h;
    const win = WIN[kind] != null ? WIN[kind] : 0;
    if (b.fl & 8) { globe(B, cx, cz, Math.sqrt(A / Math.PI), base, b.h); return [cx, cz, base, Math.sqrt(A / Math.PI), b.h]; }
    if ((b.fl & 1) && lite) return [cx, cz, base, Math.sqrt(A) / 2, b.h];
    if (b.fl & 1) { // canopy roof on posts
      slab(B, p, top - 0.5, top, mixc(wall, [0.5, 0.52, 0.55], 0.25), roofC);
      for (let i = 0; i < n; i += Math.max(1, Math.floor(n / 6))) box(B, p[i][0], base, p[i][1], 0.35, top - 0.5 - base, 0.35, C3('#8a929a'));
      return [cx, cz, base, Math.sqrt(A) / 2, b.h];
    }
    const pitched0 = (kind === 1 || kind === 9) && rect && A < 400 && b.mh === 0, pitched = pitched0 && !lite;
    const rh = pitched0 ? Math.min(3.2, Math.max(1.4, (ob.v1 - ob.v0) * 0.3)) : 0;
    const eave = top - (pitched ? rh : rh * 0.5);
    // walls
    let u = 0;
    for (let i = 0; i < n; i++) {
      const a = p[i], c = p[(i + 1) % n], L = Math.hypot(c[0] - a[0], c[1] - a[1]);
      const nx = (c[1] - a[1]) / (L || 1), nz = -(c[0] - a[0]) / (L || 1);
      const A0 = [a[0], y0, a[1]], A1 = [a[0], eave, a[1]], B1 = [c[0], eave, c[1]], B0 = [c[0], y0, c[1]];
      const w0 = [u, y0 - base, win], w1 = [u, eave - base, win], w2 = [u + L, eave - base, win], w3 = [u + L, y0 - base, win];
      const sh = 0.94 + 0.06 * ((i * 7) % 3) / 2;
      const col = [wall[0] * sh, wall[1] * sh, wall[2] * sh];
      tri(B, A0, A1, B1, col, nx, 0, nz, w0, w1, w2); tri(B, A0, B1, B0, col, nx, 0, nz, w0, w2, w3);
      u += L;
    }
    if (pitched) {
      const o = 0.45, { ux, uz } = ob; let { u0, u1, v0, v1 } = ob; u0 -= o; u1 += o; v0 -= o; v1 += o;
      const P2 = (uu, vv, y) => [uu * ux - vv * uz, y, uu * uz + vv * ux];
      const c0 = P2(u0, v0, eave), c1 = P2(u1, v0, eave), c2 = P2(u1, v1, eave), c3 = P2(u0, v1, eave);
      const lu = u1 - u0, lv = v1 - v0, ry = eave + rh;
      if (lu >= lv) {
        const m = (v0 + v1) / 2, d = lv / 2, r0 = P2(u0 + d, m, ry), r1 = P2(u1 - d, m, ry);
        quad(B, c0, r0, r1, c1, roofC); quad(B, c2, r1, r0, c3, mixc(roofC, [0, 0, 0], 0.12)); triN(B, c1, r1, c2, roofC); triN(B, c3, r0, c0, roofC);
      } else {
        const m = (u0 + u1) / 2, d = lu / 2, r0 = P2(m, v0 + d, ry), r1 = P2(m, v1 - d, ry);
        quad(B, c3, r1, r0, c0, roofC); quad(B, c1, r0, r1, c2, mixc(roofC, [0, 0, 0], 0.12)); triN(B, c0, r0, c1, roofC); triN(B, c2, r1, c3, roofC);
      }
      // eave underside
      quad(B, c0, c1, c2, c3, mixc(wall, [0, 0, 0], 0.3));
    } else {
      polyFill(B, p, eave, roofC);
      if (b.mh > 0) polyFill(B, p, y0, mixc(wall, [0, 0, 0], 0.25), true);
      if (b.h > 9 && A > 120 && r2 < 0.6 && !lite) { // roof equipment
        const s = Math.min(6, Math.sqrt(A) * 0.25);
        box(B, cx + (r - 0.5) * s, top, cz + (r2 - 0.5) * s, s, 1.2 + r * 1.6, s * 0.8, C3('#d0d2d4'));
      }
    }
    return [cx, cz, base, Math.sqrt(A) / 2, top - base];
  }
  // the globe-like dome (planetarium): latitude / longitude panels
  function globe(B, cx, cz, R, base, h) {
    const yc = base + Math.max(R * 0.95, h - R), NS = 20, NR = 12;
    const ca = C3('#c9d6e2'), cb = C3('#9fb4c8'), line = C3('#f4f8fb');
    for (let j = 0; j < NR; j++) for (let i = 0; i < NS; i++) {
      const t0 = j / NR * Math.PI, t1 = (j + 1) / NR * Math.PI, p0 = i / NS * 6.2832, p1 = (i + 1) / NS * 6.2832;
      const P = (t, ph) => [cx + Math.sin(t) * Math.cos(ph) * R, yc + Math.cos(t) * R, cz + Math.sin(t) * Math.sin(ph) * R];
      const col = (i % 5 === 0 || j % 3 === 0) ? line : ((i + j) % 2 ? ca : cb);
      const a = P(t0, p0), b = P(t0, p1), c = P(t1, p1), d = P(t1, p0);
      const nn = q => { const x = (q[0] - cx) / R, y = (q[1] - yc) / R, z = (q[2] - cz) / R; return [x, y, z]; };
      const na = nn(a), nb = nn(b), nc = nn(c), nd = nn(d);
      B.p.push(...a, ...c, ...b, ...a, ...d, ...c); B.n.push(...na, ...nc, ...nb, ...na, ...nd, ...nc);
      for (let k = 0; k < 6; k++) { B.c.push(col[0], col[1], col[2]); B.w.push(0, 0, 0); }
    }
    // the pedestal
    box(B, cx, base, cz, R * 0.9, yc - R * 0.6 - base, R * 0.9, C3('#b8bcc2'));
  }

  // ---------------------------------------------------------------- ground canvas
  const AREA_COL = { 1: '#a9d18a', 2: '#9ccb7a', 3: '#b7d99a', 4: '#7fb36a', 5: '#6fb2dc', 6: '#ddd0ae', 7: '#b9babb', 8: '#b4aa9a', 9: '#dcd3c2', 10: '#cfc8ba',
    11: '#c4ccb4', 12: '#c9d79e', 13: '#d9d2c8', 14: '#d6d0c2', 15: '#cdc8be', 16: '#d4c6a8', 17: '#eadbb0', 18: '#80868e' };
  function paintGround(D, tb, N) {
    const c = document.createElement('canvas'); c.width = c.height = N;
    const g = c.getContext('2d'), k = N / (tb[2] - tb[0]), kz = N / (tb[3] - tb[1]); // (a box that is not square: other scale along z)
    g.setTransform(k, 0, 0, kz, -tb[0] * k, -tb[1] * kz);
    g.fillStyle = D.pal.ground || '#d8d2c4'; g.fillRect(tb[0], tb[1], tb[2] - tb[0], tb[3] - tb[1]);
    const path = (p, close) => { g.beginPath(); g.moveTo(p[0][0], p[0][1]); for (let i = 1; i < p.length; i++) g.lineTo(p[i][0], p[i][1]); if (close) g.closePath(); };
    // soft speckle so big plain areas do not look flat
    const rr = (() => { let s = 99; return () => (s = (s * 16807) % 2147483647) / 2147483647; })();
    for (let i = 0; i < 9000; i++) { g.fillStyle = rr() < 0.5 ? 'rgba(0,0,0,0.035)' : 'rgba(255,255,255,0.05)'; const x = tb[0] + rr() * (tb[2] - tb[0]), z = tb[1] + rr() * (tb[3] - tb[1]); g.fillRect(x, z, 1.5 + rr() * 3, 1.5 + rr() * 3); }
    for (const a of D.ar) {
      if (a.l === 1) continue; // decks are geometry
      let col = a.c === 19 ? D.pal.ground || '#d8d2c4' : a.c === 5 && D.pal.water ? D.pal.water : AREA_COL[a.c]; if (!col) continue;
      if (D.pal.snow && a.c !== 5) col = '#' + new THREE.Color(col).lerp(new THREE.Color('#f4f7fb'), 0.72).getHexString(); // under the snow
      g.fillStyle = col; path(a.p, true); g.fill();
      if (a.c === 6 || a.c === 1) { g.strokeStyle = a.c === 6 ? '#a6c088' : '#8fbf72'; g.lineWidth = 1.6; g.stroke(); }
      if (a.c === 7) { g.strokeStyle = 'rgba(255,255,255,0.5)'; g.lineWidth = 0.18; g.save(); path(a.p, true); g.clip(); const bb = bbox(a.p); for (let x = bb[0]; x < bb[2]; x += 2.5) { g.beginPath(); g.moveTo(x, bb[1]); g.lineTo(x, bb[3]); g.stroke(); } g.restore(); }
    }
    g.lineCap = 'round'; g.lineJoin = 'round';
    for (const w of D.wl) { g.strokeStyle = D.pal.water || '#6fb2dc'; g.lineWidth = w.w; path(w.p); g.stroke(); }
    // rail beds at ground level (the rails are geometry)
    for (const r of D.rl) { if (r.l !== 0) continue; g.strokeStyle = '#a49a8a'; g.lineWidth = 4.2; path(r.p); g.stroke(); }
    // roads (also drawn as geometry; the paint keeps the far distance clean)
    for (const r of D.rd) { if (r.l) continue; g.strokeStyle = r.c <= 3 ? '#c9c3b6' : '#bdb8ae'; g.lineWidth = r.w + (r.c <= 3 ? 5 : 1); path(r.p); g.stroke(); }
    for (const r of D.rd) { if (r.l || r.c >= 7) continue; g.strokeStyle = r.c <= 5 ? '#707680' : '#d4cbb8'; g.lineWidth = r.w; path(r.p); g.stroke(); }
    // building lots (a slightly darker plinth stays when the building is swallowed)
    g.fillStyle = 'rgba(70,62,52,0.22)';
    for (const b of D.b) { path(b.p, true); g.fill(); }
    return c;
  }
  function bbox(p) { let a = 1e9, b = 1e9, c = -1e9, d = -1e9; for (const q of p) { a = Math.min(a, q[0]); b = Math.min(b, q[1]); c = Math.max(c, q[0]); d = Math.max(d, q[1]); } return [a, b, c, d]; }

  // ---------------------------------------------------------------- the world
  const ROADC = { 1: '#4f545c', 2: '#52575e', 3: '#555a62', 4: '#5b6068', 5: '#646870', 6: '#c4bba9', 7: '#b9af9c', 8: '#aaa190' };
  function build(C, area, opt) {
    clear();
    opt = opt || {};
    const D = C.D; D.pal = C.pal;
    cur = { C, D, area, meshes: [], fp: [], fall: [], labels: [] };
    const box0 = D.box, M = 40, tb = [box0[0] - M, box0[1] - M, box0[2] + M, box0[3] + M];
    // ---- terrain mesh + painted texture: one texture, the grid cut into pieces of 16 x 16 cells (culled per piece)
    {
      const g = D.hg, nx = g.nx, nz = g.nz, full = new THREE.BufferGeometry(), P = new Float32Array(nx * nz * 3), I = [];
      for (let j = 0; j < nz; j++) for (let i = 0; i < nx; i++) {
        const k = j * nx + i; P[k * 3] = g.x0 + i * g.s; P[k * 3 + 1] = D.H[k]; P[k * 3 + 2] = g.z0 + j * g.s;
        if (i < nx - 1 && j < nz - 1) I.push(k, k + nx, k + 1, k + 1, k + nx, k + nx + 1);
      }
      full.setAttribute('position', new THREE.BufferAttribute(P, 3)); full.setIndex(I); full.computeVertexNormals();
      const N = full.attributes.normal.array;
      const cv = paintGround(D, tb, opt.groundN || 2048), tex = new THREE.CanvasTexture(cv);
      tex.anisotropy = Math.min(opt.view ? 4 : 2, E.renderer.capabilities.getMaxAnisotropy()); // (sampling cost: the play camera looks down steeply)
      const mat = new THREE.MeshLambertMaterial(Object.assign({ map: tex, color: 0xd8d8d8 }, E.STENCIL_TEST));
      const S = 16;
      for (let j0 = 0; j0 < nz - 1; j0 += S) for (let i0 = 0; i0 < nx - 1; i0 += S) {
        const i1 = Math.min(nx - 1, i0 + S), j1 = Math.min(nz - 1, j0 + S), w = i1 - i0 + 1, h = j1 - j0 + 1;
        const pp = new Float32Array(w * h * 3), nn = new Float32Array(w * h * 3), uv = new Float32Array(w * h * 2), ix = [];
        for (let j = 0; j < h; j++) for (let i = 0; i < w; i++) {
          const k = (j0 + j) * nx + i0 + i, q = j * w + i;
          for (let c = 0; c < 3; c++) { pp[q * 3 + c] = P[k * 3 + c]; nn[q * 3 + c] = N[k * 3 + c]; }
          uv[q * 2] = (pp[q * 3] - tb[0]) / (tb[2] - tb[0]); uv[q * 2 + 1] = 1 - (pp[q * 3 + 2] - tb[1]) / (tb[3] - tb[1]);
          if (i < w - 1 && j < h - 1) ix.push(q, q + w, q + 1, q + 1, q + w, q + w + 1);
        }
        const geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pp, 3)); geo.setAttribute('normal', new THREE.BufferAttribute(nn, 3)); geo.setAttribute('uv', new THREE.BufferAttribute(uv, 2));
        geo.setIndex(ix); geo.computeBoundingSphere();
        const m = new THREE.Mesh(geo, mat); m.renderOrder = -6; add(m);
      }
      full.dispose();
      cur.terrainMat = mat;
      let mn = 1e9; for (let i = 0; i < D.H.length; i++) mn = Math.min(mn, D.H[i]);
      cur.outerY = mn - 0.8; // the far ground stays under the whole terrain
    }
    // real.paint: [[x, z, wall, roof]] colours of the map buildings at those points (red brick, vermilion temple halls, …)
    cur.paint = new Map();
    for (const q of C.real && C.real.paint || []) for (const b of D.b) if (pointIn(b.p, q[0], q[1])) cur.paint.set(b, [q[2], q[3] || null]);
    // real.bridges: [[x, z, colour, r]] railings of the raised roads near there (a red bridge)
    const brCol = (p) => { for (const q of C.real && C.real.bridges || []) if (p.some(m => Math.hypot(m[0] - q[0], m[1] - q[1]) < (q[3] || 60))) return C3(q[2]); return null; };
    // ---- roads, rails, water, decks: ground layer (stencil) and raised layer (lit, no stencil)
    const GL = Chunks(), BL = Chunks(), BLF = Chunks(); // BLF: the far version of the raised layer (plain decks, no railings / posts)
    const mid = p => p[Math.floor(p.length / 2)];
    for (const r of D.rd) {
      const m = mid(r.p), col = C3(ROADC[r.c] || '#7a7f86');
      if (r.l >= 1) { // pedestrian deck / bridge
        const Bf = BL.get(m[0], m[1]), y = Math.max(gy(r.p[0][0], r.p[0][1]), gy(r.p[r.p.length - 1][0], r.p[r.p.length - 1][1]));
        const deck = r.c >= 6 || r.c === 8 ? 6.2 : 0.4;
        const isFoot = r.c >= 6;
        const bc = brCol(r.p);
        ribbon(Bf, r.p, Math.max(isFoot ? 3.4 : r.w, r.w), isFoot ? C3('#bfb9ae') : col, 0, { fixed: y + (isFoot ? deck : 0.4), side: isFoot ? 0 : bc ? 1.3 : 0.9, sideCol: bc || C3('#b8b4ac'), under: 0.6, underCol: bc ? mixc(bc, [0.4, 0.4, 0.4], 0.5) : C3('#b2aca2'), step: 12 });
        const q = subdiv(r.p, 14); if (isFoot) for (let i = 1; i < q.length - 1; i += 1) box(Bf, q[i][0], gy(q[i][0], q[i][1]), q[i][1], 0.7, y + deck - 0.6 - gy(q[i][0], q[i][1]), 0.7, C3('#b8b2a6'));
        ribbon(BLF.get(m[0], m[1]), r.p, Math.max(isFoot ? 3.4 : r.w, r.w), isFoot ? C3('#bfb9ae') : col, 0, { fixed: y + (isFoot ? deck : 0.4), step: 24 });
        continue;
      }
      const Bf = GL.get(m[0], m[1]);
      if (r.c <= 3) ribbon(Bf, r.p, r.w + 5, C3('#b9b3a6'), 0.06);
      ribbon(Bf, r.p, r.w, col, r.c <= 5 ? 0.1 : 0.08, { caps: r.c <= 6 });
      if (r.c <= 2 && r.w >= 7) ribbon(Bf, r.p, 0.22, C3('#f4f1e8'), 0.13, { dash: true, step: 3 });
      if (r.c <= 3 && r.w >= 6) for (const s of [-1, 1]) ribbon(Bf, E.offsetPts(r.p, s * (r.w / 2 - 0.35)), 0.15, C3('#e8e6e0'), 0.13);
    }
    // short raised bits of a track at grade are bridges over a lowered road: keep them on the ground (a real viaduct is a long chain)
    if (!D.viaOk) { D.viaOk = 1; const up = D.rl.filter(r => r.l >= 1); for (const ch of stitch(up.map(r => ({ p: r.p, l: 1, r })))) if (plen(ch.p) < 110) for (const r of up) if (ch.p.indexOf(r.p[0]) >= 0 || ch.p.some(q => q[0] === r.p[0][0] && q[1] === r.p[0][1])) r.l = 0; }
    for (const r of D.rl) {
      if (r.l < 0) continue;
      const m = mid(r.p);
      if (r.l >= 1) { // viaduct
        const Bf = BL.get(m[0], m[1]), y = gy(m[0], m[1]) + 7;
        const yy = p => Math.max(gy(p[0], p[1]) + 6.5, y - 0.0);
        ribbon(Bf, r.p, 5.2, C3('#a49c90'), 0, { fixed: y, side: 1.0, sideCol: C3('#c2bcb2'), under: 1.2, underCol: C3('#aaa49a'), step: 8 });
        for (const s of [-0.72, 0.72]) ribbon(Bf, E.offsetPts(r.p, s), 0.14, C3('#d8dce2'), 0.18, { fixed: y });
        const q = subdiv(r.p, 18); for (let i = 0; i < q.length; i++) { const g0 = gy(q[i][0], q[i][1]); box(Bf, q[i][0], g0, q[i][1], 1.6, y - 1.2 - g0, 1.6, C3('#b4aea4')); }
        ribbon(BLF.get(m[0], m[1]), r.p, 5.2, C3('#a49c90'), 0, { fixed: y, under: 1.2, underCol: C3('#aaa49a'), step: 16 });
        void yy;
        continue;
      }
      const Bf = GL.get(m[0], m[1]);
      ribbon(Bf, r.p, 3.4, C3('#8f8578'), 0.09);
      ribbon(Bf, r.p, 2.5, C3('#6f5d4a'), 0.11, { dash: true, step: 0.6 });
      for (const s of [-0.72, 0.72]) ribbon(Bf, E.offsetPts(r.p, s), 0.12, C3('#dfe3e8'), 0.15);
    }
    for (const w of D.wl) { const m = mid(w.p); ribbon(GL.get(m[0], m[1]), w.p, w.w, C3(D.pal.water || '#5ea6d4'), 0.05); }
    for (const a of D.ar) {
      const c = centroid(a.p);
      if (a.c === 5) { polyFill(GL.get(c[0], c[1]), a.p, q => gy(q[0], q[1]) + 0.04, C3(D.pal.water || '#5ea6d4'), false, a.holes); continue; }
      if (a.c === 10) { // platform: a raised slab (+ roof when covered); next to a viaduct it is up on the viaduct
        const Bf = BL.get(c[0], c[1]), up = nearRail(c, 1) < nearRail(c, 0) && nearRail(c, 1) < 9, y = up ? viaY(c) + 0.1 : minY(a.p);
        slab(Bf, a.p, y - 0.2, y + 1.1, C3('#aea79b'), C3('#c2bcb0')); polyFill(BLF.get(c[0], c[1]), a.p, a.l === 2 ? y + 4.5 : y + 1.1, a.l === 2 ? C3('#b4bec6') : C3('#c2bcb0'));
        if (a.l === 2) { slab(Bf, inset(a.p, 0.3), y + 4.2, y + 4.5, C3('#9aa4ae'), C3('#b4bec6')); const q = spine(a.p); for (const s of q) box(Bf, s[0], y + 1.1, s[1], 0.3, 3.1, 0.3, C3('#8a929a')); }
        continue;
      }
      if (a.l === 1 && (a.c === 9 || a.c === 18)) { // deck plaza
        const Bf = BL.get(c[0], c[1]), y = minY(a.p) + 6.2;
        slab(Bf, a.p, y - 0.6, y, C3('#aaa49a'), C3('#bdb7ac')); polyFill(BLF.get(c[0], c[1]), a.p, y, C3('#bdb7ac'));
        for (let i = 0; i < a.p.length; i++) { const p0 = a.p[i], p1 = a.p[(i + 1) % a.p.length], A0 = [p0[0], y, p0[1]], A1 = [p0[0], y + 1.1, p0[1]], B1 = [p1[0], y + 1.1, p1[1]], B0 = [p1[0], y, p1[1]], c = C3('#9fb0bf'); quad(Bf, A0, A1, B1, B0, c); quad(Bf, B0, B1, A1, A0, c); }
        for (const s of spine(a.p)) box(Bf, s[0], gy(s[0], s[1]), s[1], 0.8, y - 0.6 - gy(s[0], s[1]), 0.8, C3('#b8b2a6'));
      }
    }
    // zebra crossings
    for (const q of D.pt) {
      if (q[2] !== 5) continue;
      const [x, z, , ang, wd] = q, w = Math.min(16, (wd || 60) / 10), Bf = GL.get(x, z), ux = Math.cos(ang), uz = Math.sin(ang), y = gy(x, z) + 0.14, col = C3('#f2f0ea');
      for (let s = -w / 2 + 0.3; s < w / 2; s += 0.9) {
        const px = x - uz * s, pz = z + ux * s, hx = ux * 1.8, hz = uz * 1.8, wx = -uz * 0.22, wz = ux * 0.22;
        tri(Bf, [px - hx - wx, y, pz - hz - wz], [px + hx - wx, y, pz + hz - wz], [px + hx + wx, y, pz + hz + wz], col, 0, 1, 0);
        tri(Bf, [px - hx - wx, y, pz - hz - wz], [px + hx + wx, y, pz + hz + wz], [px - hx + wx, y, pz - hz + wz], col, 0, 1, 0);
      }
    }
    // the city's own ground / raised decorations (crossings, railings, …)
    if (C.real && C.real.deco) C.real.deco({ gy, D, C3, ribbon, box, quad, tri, slab, polyFill, disc, offset: E.offsetPts, GL: (x, z) => GL.get(x, z), BL: (x, z) => BL.get(x, z),
      zebra(x, z, ang, len, w, col) { // stripes across a road: len along the walking direction, w = crossing length
        const Bf = GL.get(x, z), ux = Math.cos(ang), uz = Math.sin(ang), y = gy(x, z) + 0.15, cc = C3(col || '#f2f0ea');
        for (let s = -w / 2 + 0.3; s < w / 2; s += 0.9) {
          const px = x + ux * s, pz = z + uz * s, hx = -uz * len / 2, hz = ux * len / 2, wx = ux * 0.22, wz = uz * 0.22;
          tri(Bf, [px - hx - wx, y, pz - hz - wz], [px + hx - wx, y, pz + hz - wz], [px + hx + wx, y, pz + hz + wz], cc, 0, 1, 0);
          tri(Bf, [px - hx - wx, y, pz - hz - wz], [px + hx + wx, y, pz + hz + wz], [px - hx + wx, y, pz - hz + wz], cc, 0, 1, 0);
        }
      } });
    cur.gl = [];
    for (const [k, b] of GL.all) if (b.p.length) { const m = new THREE.Mesh(toGeo(b), gMat); m.renderOrder = -5; add(m); const [i, j] = k.split(',').map(Number); cur.gl.push({ m, x: (i + 0.5) * CH, z: (j + 0.5) * CH }); }
    cur.bl = [];
    for (const [k, b] of BL.all) if (b.p.length) {
      const m = add(new THREE.Mesh(toGeo(b), bMat)), fb = BLF.all.get(k), [i, j] = k.split(',').map(Number);
      const mf = fb && fb.p.length ? add(new THREE.Mesh(toGeo(fb), bMatFar)) : null; if (mf) mf.visible = false;
      cur.bl.push({ m, mf, x: (i + 0.5) * CH, z: (j + 0.5) * CH, far: false });
    }
    // ---- buildings: edible ones (inside the play area) get their own vertex range in the chunk
    const BC = new Map(), list = [];
    const inA = (x, z) => area && x >= area[0] && x <= area[2] && z >= area[1] && z <= area[3];
    // (real.drop: points inside the buildings that the city replaces with its own hand-made models)
    const drop = C.real && C.real.drop || [];
    D.b.forEach((b, i) => {
      if (drop.length && drop.some(q => pointIn(b.p, q[0], q[1]))) return;
      const c = centroid(b.p), k = Math.floor(c[0] / CH) + ',' + Math.floor(c[1] / CH);
      // three versions per chunk (distance LOD): 0 full, 1 plain prisms, 2 prisms of the bigger buildings only
      let ch = BC.get(k); if (!ch) { const [ci, cj] = k.split(',').map(Number); ch = { bufs: [Buf(), Buf(), Buf()], list: [], x: (ci + 0.5) * CH, z: (cj + 0.5) * CH, lv: 0 }; BC.set(k, ch); }
      const r = [], at = j => ch.bufs[j].p.length / 3;
      let s0 = at(0); const info = emitBuilding(ch.bufs[0], b, i); r.push([s0, at(0) - s0]);
      s0 = at(1); emitBuilding(ch.bufs[1], b, i, true); r.push([s0, at(1) - s0]);
      s0 = at(2); if (b.h >= 9 || polyArea(b.p) >= 220) emitBuilding(ch.bufs[2], b, i, true); r.push([s0, at(2) - s0]);
      if (!opt.view && inA(info[0], info[1]) && !(b.fl & 1)) { const e = { b, i, ch, start: r[0][0], count: r[0][1], r, info }; ch.list.push(e); list.push(e); }
    });
    for (const [k, ch] of BC) {
      ch.L = ch.bufs.map((B, j) => { if (!B.p.length) tri(B, [ch.x, -500, ch.z], [ch.x, -500, ch.z], [ch.x, -500, ch.z], [0, 0, 0], 0, 1, 0); const geo = toGeo(B), m = new THREE.Mesh(geo, j ? (D.pal.night ? bMat : bMatFar) : bMat); m.visible = !j; add(m); return { m, orig: geo.attributes.position.array.slice(), lo: 1e12, hi: -1, dirty: false }; });
      ch.mesh = ch.L[0].m; ch.orig = ch.L[0].orig; ch.bufs = null;
    }
    cur.chunks = BC;
    // landmark names for edible buildings (the city lists them: [x, z, name])
    const lmAt = C.real && C.real.lm || [];
    for (const e of list) {
      const [x, z, base, rad, hgt] = e.info, A = polyArea(e.b.p), bb = obb(e.b.p);
      const s = Math.max(0.46 * Math.sqrt(A), bb ? 0.3 * Math.max(bb.u1 - bb.u0, bb.v1 - bb.v0) : 0);
      const T = { name: 'fp', fp: true, s: Math.max(1.2, s), h: hgt, val: Math.max(4, Math.round(2.7 * Math.sqrt(A * Math.max(2.5, e.b.h)))), rs: 0, sh: [1, 1], pal: ['#fff'], e };
      for (const L of lmAt) if (pointIn(e.b.p, L[0], L[1])) { T.lm = L[2]; T.val = Math.round(T.val * 1.5); }
      const o = E.addFp(T, x, z); o.fpBase = base; e.o = o;
    }
    cur.fp = list;
    // ---- edible small things: generated in the play area from the map (deterministic)
    if (area) props(C, D, area, opt);
    // ---- outer ground
    return { tb, outerY: cur.outerY };
  }
  function nearRail(c, layer) { // distance from a point to the nearest track of that level
    let best = 1e9;
    for (const r of cur.D.rl) { if ((r.l >= 1 ? 1 : r.l) !== layer) continue; const p = r.p; for (let i = 0; i < p.length - 1; i++) { const ax = p[i][0], az = p[i][1], dx = p[i + 1][0] - ax, dz = p[i + 1][1] - az, L2 = dx * dx + dz * dz || 1, t = Math.max(0, Math.min(1, ((c[0] - ax) * dx + (c[1] - az) * dz) / L2)); best = Math.min(best, Math.hypot(ax + dx * t - c[0], az + dz * t - c[1])); } }
    return best;
  }
  function viaY(c) { return gy(c[0], c[1]) + 7; }
  function minY(p) { let m = 1e9; for (const q of p) m = Math.min(m, gy(q[0], q[1])); return m; }
  function centroid(p) { let x = 0, z = 0; for (const q of p) { x += q[0]; z += q[1]; } return [x / p.length, z / p.length]; }
  function inset(p, d) { const c = centroid(p); return p.map(q => { const dx = q[0] - c[0], dz = q[1] - c[1], L = Math.hypot(dx, dz) || 1; return [q[0] - dx / L * d, q[1] - dz / L * d]; }); }
  function spine(p) { // support posts along the long axis of a polygon
    const b = obb(p); if (!b) return [];
    const out = [], vm = (b.v0 + b.v1) / 2, L = b.u1 - b.u0, n = Math.max(1, Math.round(L / 10));
    for (let i = 0; i <= n; i++) { const u = b.u0 + 1 + (L - 2) * i / n; out.push([u * b.ux - vm * b.uz, u * b.uz + vm * b.ux]); }
    return out;
  }
  function pointIn(p, x, z) { let c = false; for (let i = 0, j = p.length - 1; i < p.length; j = i++) { const a = p[i], b = p[j]; if ((a[1] > z) !== (b[1] > z) && x < (b[0] - a[0]) * (z - a[1]) / (b[1] - a[1]) + a[0]) c = !c; } return c; }
  function add(m) { m.matrixAutoUpdate = false; m.updateMatrix(); scene.add(m); cur.meshes.push(m); return m; }

  // ---------------------------------------------------------------- props (people, cars, trains, trees, lamps, …)
  function props(C, D, A, opt) {
    const rnd = E.rnd, pick = E.pick, R = C.real || {}, dens = (opt.dens || 1) * (R.dens || 1); // (real.dens: more things along the streets)
    const [ax0, az0, ax1, az1] = A;
    const inA = (x, z, m) => x >= ax0 + (m || 0) && x <= ax1 - (m || 0) && z >= az0 + (m || 0) && z <= az1 - (m || 0);
    // occupancy: building footprints on a 2 m grid (props stay off the buildings)
    const GS = 2, gx = Math.ceil((ax1 - ax0) / GS) + 1, gzN = Math.ceil((az1 - az0) / GS) + 1, occ = new Uint8Array(gx * gzN);
    for (const b of D.b) {
      const bb = bbox(b.p); if (bb[2] < ax0 || bb[0] > ax1 || bb[3] < az0 || bb[1] > az1) continue;
      for (let z = Math.max(az0, bb[1]); z <= Math.min(az1, bb[3]); z += GS) for (let x = Math.max(ax0, bb[0]); x <= Math.min(ax1, bb[2]); x += GS) if (pointIn(b.p, x, z)) occ[Math.floor((z - az0) / GS) * gx + Math.floor((x - ax0) / GS)] = 1;
    }
    const free = (x, z) => inA(x, z, 1) && !occ[Math.floor((z - az0) / GS) * gx + Math.floor((x - ax0) / GS)];
    const VIEWT = { tree: 1, kusu: 1, sakura: 1, pineK: 1, carJ: 1, taxi: 1, truck: 1, busJ: 1, staEntry: 1, busShelter: 1, soccerGoal: 1 }; // the view mode keeps only these
    const put = (tn, x, z, yaw) => { if (!E.TYPES[tn] || !free(x, z) || (opt.view && !VIEWT[tn])) return null; return E.addObj(tn, x, z, yaw || 0); };
    const along = (p, off, step, f) => {
      let acc = step * rnd();
      for (let i = 0; i < p.length - 1; i++) {
        const a = p[i], b = p[i + 1], L = Math.hypot(b[0] - a[0], b[1] - a[1]); if (L < 0.01) continue; const ux = (b[0] - a[0]) / L, uz = (b[1] - a[1]) / L;
        while (acc <= L) { f(a[0] + ux * acc - uz * off, a[1] + uz * acc + ux * off, Math.atan2(-uz, ux), ux, uz); acc += step; }
        acc -= L;
      }
    };
    const clipP = p => { const out = []; let cur2 = null; for (const q of p) { if (inA(q[0], q[1], 2)) { if (!cur2) { cur2 = []; out.push(cur2); } cur2.push(q); } else cur2 = null; } return out.filter(r => r.length >= 2); };
    const carT = R.cars || ['carJ', 'carJ', 'taxi', 'carJ', 'truck', 'carJ'];
    // streets: lamps, street trees, poles, cars
    for (const r of D.rd) {
      if (r.l) continue;
      for (const p of clipP(r.p)) {
        const L = plen(p);
        if (r.c <= 3) { for (const s of [-1, 1]) along(p, s * (r.w / 2 + 1.2), 26 / dens, (x, z, yaw) => put('slamp', x, z, yaw + (s > 0 ? Math.PI : 0))); }
        if (r.c <= 2) for (const s of [-1, 1]) along(p, s * (r.w / 2 + 1.9), 13, (x, z) => { if (rnd() < 0.55 * dens) put('tree', x, z, rnd() * 6); });
        if (r.c === 4 || r.c === 5) along(p, (r.w / 2 + 0.5), 32, (x, z, yaw) => { if (rnd() < 0.8 * dens) put('denchu', x, z, yaw); });
        if (r.c <= 4 && L > 25) {
          const per = { 1: 22, 2: 30, 3: 40, 4: 90 }[r.c] / dens, n = Math.floor(L / per + rnd());
          if (n > 0) E.B.cars(p, n, { types: r.c <= 2 && rnd() < 0.3 ? carT.concat(['busJ']) : carT, lane: Math.min(3.2, r.w / 4), spd: r.c <= 2 ? 8 : 5.5, two: r.w >= 5 });
        }
        if (r.c >= 3 && r.c <= 4 && L > 30 && !opt.view) { const n = Math.floor(L / 38 * dens * (R.walkers || 1) + rnd()); if (n) for (const sd of [-1, 1]) E.B.walk(E.offsetPts(p, sd * (r.w / 2 + 0.8)), Math.ceil(n / 2), { types: R.people || ['person', 'person', 'personW'], w: 0.8 }); }
        if (r.c <= 4) along(p, (rnd() < 0.5 ? -1 : 1) * (r.w / 2 + 0.9), 21 / dens, (x, z, yaw) => { const t = rnd(); put(t < 0.32 ? 'trash' : t < 0.62 ? 'cone' : t < 0.72 ? 'bike' : t < 0.86 ? 'post' : 'signA', x, z, yaw); });
        if (r.c >= 6 && r.c !== 8 && L > 12 && !opt.view) { const n = Math.floor(L / (r.c === 6 ? 9 : 16) * dens * (R.walkers || 1) + rnd()); if (n) E.B.walk(p, n, { types: R.people || ['person', 'person', 'personW'], w: Math.min(2.4, r.w * 0.7) }); }
      }
    }
    // trees from the map, cherry trees along the rivers
    for (const t of D.tr) if (inA(t[0], t[1])) put(R.treeT || 'tree', t[0], t[1], rnd() * 6);
    for (const w of D.wl) for (const p of clipP(w.p)) for (const s of [-1, 1]) along(p, s * (w.w / 2 + 2), 9, (x, z) => { if (rnd() < 0.8 * dens) put(R.riverTree || 'sakura', x, z, rnd() * 6); });
    // areas: parks (trees, benches), parking lots (parked cars), plazas (crowds), school grounds
    for (const a of D.ar) {
      const bb = bbox(a.p); if (bb[2] < ax0 || bb[0] > ax1 || bb[3] < az0 || bb[1] > az1 || a.l) continue;
      const inside = (x, z) => pointIn(a.p, x, z);
      const scatter = (step, f) => { for (let z = bb[1] + step / 2; z < bb[3]; z += step) for (let x = bb[0] + step / 2; x < bb[2]; x += step) { const px = x + (rnd() - 0.5) * step * 0.7, pz = z + (rnd() - 0.5) * step * 0.7; if (inside(px, pz)) f(px, pz); } };
      if (a.c === 1 || a.c === 4) scatter(a.c === 4 ? R.forest || 6 : 8, (x, z) => { const r = rnd(); if (r < 0.55 * dens) put(a.c === 4 ? pick(['tree', 'kusu', 'tree']) : pick(['tree', 'sakura', 'tree', 'kusu']), x, z, rnd() * 6); else if (r < 0.58) put('bench', x, z, rnd() * 6); else if (r < 0.6) put('playSlide', x, z, rnd() * 6); });
      else if (a.c === 3) scatter(12, (x, z) => { if (rnd() < 0.3 * dens) put('tree', x, z, rnd() * 6); });
      else if (a.c === 7) { const ob = obb(a.p); if (ob) for (let v = ob.v0 + 2.5; v < ob.v1 - 1.5; v += 5.5) for (let u = ob.u0 + 1.5; u < ob.u1 - 1; u += 2.6) { if (rnd() > 0.32 * dens) continue; const x = u * ob.ux - v * ob.uz, z = u * ob.uz + v * ob.ux; if (inside(x, z)) put(pick(['carJ', 'carJ', 'carJ', 'truck']), x, z, Math.atan2(ob.ux, -ob.uz)); } }
      else if (a.c === 9 && polyArea(a.p) > 60 && !opt.view) { const n = Math.min(60, Math.floor(polyArea(a.p) / 40 * dens)); for (let i = 0; i < n; i++) { const x = bb[0] + rnd() * (bb[2] - bb[0]), z = bb[1] + rnd() * (bb[3] - bb[1]); if (inside(x, z) && free(x, z)) E.addObj(pick(R.people || ['person', 'personW']), x, z, rnd() * 6, { k: 'wrect', x0: Math.max(bb[0], x - 8), z0: Math.max(bb[1], z - 8), x1: Math.min(bb[2], x + 8), z1: Math.min(bb[3], z + 8), tx: x, tz: z, spd: 0.9 + rnd() * 0.5 }); } }
      else if (a.c === 6) scatter(14, (x, z) => { if (rnd() < 0.18 * dens) put(pick(['tree', 'sakura', 'bench']), x, z, rnd() * 6); });
      else if (a.c === 2 && polyArea(a.p) > 1500) { const ob = obb(a.p); if (ob) { const vm = (ob.v0 + ob.v1) / 2; for (const u of [ob.u0 + 3, ob.u1 - 3]) { const x = u * ob.ux - vm * ob.uz, z = u * ob.uz + vm * ob.ux; put('soccerGoal', x, z, Math.atan2(-ob.uz, ob.ux) + Math.PI / 2 + (u > (ob.u0 + ob.u1) / 2 ? Math.PI : 0)); } } }
    }
    // points: bus stops, signals, subway entrances
    for (const q of D.pt) {
      const [x, z, k, ang] = q; if (!inA(x, z)) continue;
      if (k === 3) { const ox = -Math.sin(ang) * 4, oz = Math.cos(ang) * 4; put('busShelter', x + ox, z + oz, -ang + Math.PI); }
      else if (k === 4 && rnd() < 0.7) { const ox = -Math.sin(ang) * 5, oz = Math.cos(ang) * 5; put('signal', x + ox, z + oz, -ang); }
      else if (k === 1) { const o = E.addObj('staEntry', x, z, -ang); if (o) o.hx = x; }
    }
    // shop-front clutter: vending machines, bikes, signs next to buildings close to the station
    const sc = R.center || [0, 0];
    for (const b of D.b) {
      const c = centroid(b.p); if (!inA(c[0], c[1], 4)) continue;
      const d = Math.hypot(c[0] - sc[0], c[1] - sc[1]), pr = (d < 250 ? 0.5 : 0.16) * dens;
      if (rnd() > pr) continue;
      const i = Math.floor(rnd() * b.p.length), a = b.p[i], e = b.p[(i + 1) % b.p.length], L = Math.hypot(e[0] - a[0], e[1] - a[1]); if (L < 2) continue;
      const t = 0.2 + rnd() * 0.6, nx = (e[1] - a[1]) / L, nz = -(e[0] - a[0]) / L; // outward (ccw polygon, z south)
      const x = a[0] + (e[0] - a[0]) * t - nx * 1.1, z = a[1] + (e[1] - a[1]) * t - nz * 1.1, yaw = Math.atan2(nz, -nx);
      const tn = d < 250 ? pick(['vend', 'bike', 'bike', 'signA', 'trash', 'post', 'vend']) : pick(['vend', 'bike', 'hedge', 'post', 'bike']);
      put(tn, x, z, yaw);
    }
    // trains (stitched tracks per operator)
    const trainT = R.trains || {};
    const byOp = new Map(); for (const r of D.rl) { if (r.l < 0 || r.sv || (r.c === 3 && !trainT[r.op])) continue; if (!byOp.has(r.op)) byOp.set(r.op, []); byOp.get(r.op).push(r); }
    for (const [op, rs] of byOp) {
      const tt = trainT[op] || trainT[0]; if (!tt) continue;
      const lines = stitch(rs.map(r => ({ p: r.p, l: r.l }))).filter(s => plen(s.p) > 120).sort((a, b) => plen(b.p) - plen(a.p)).slice(0, tt.n || 2);
      lines.forEach((s, i) => {
        const p = s.p.filter(q => inA(q[0], q[1], -150)); if (p.length < 2) return;
        E.B.train(p, { type: tt.type, col: tt.col, cars: tt.cars || 4, spd: tt.spd || 10, gap: tt.gap, mode: tt.mode || 'wrap', p: i * 90, dir: i % 2 ? -1 : 1, y: s.l >= 1 ? 7.1 : 0.15 });
      });
    }
    // the city's own extras (hand-made landmarks, crowds)
    // lmk(type, [x, z], o): a hand-made landmark on the footprint of the map building at [x, z] (real.drop removes that one):
    // its centre, turned along the footprint (o.rot adds to that, o.yaw replaces it). Inside the play area it can be
    // swallowed; outside it is only scenery (it must not count in the city total).
    const lmk = (tn, at, o) => {
      o = o || {};
      const f = fpAt(at[0], at[1]);
      const x = o.x != null ? o.x : f ? f.c[0] : at[0], z = o.z != null ? o.z : f ? f.c[1] : at[1];
      const yaw = o.yaw != null ? o.yaw : (f ? f.yaw : 0) + (o.rot || 0);
      if (!E.TYPES[tn]) return null;
      if (inA(x, z) && !o.still) return E.B.o(tn, x, z, yaw);
      const m = E.staticObj(tn, x, gy(x, z) + (o.y || 0), z, yaw); if (m) cur.meshes.push(m);
      return null;
    };
    if (R.extra) R.extra(E.B, { gy, inA, put, free, D, along, rnd, pick, lmk, fpAt });
  }
  // the map building (also a dropped one) whose outline holds [x, z]: centre, long-axis yaw, size
  function fpAt(x, z) {
    let best = null;
    for (const b of cur.D.b) { if (!pointIn(b.p, x, z)) continue; const A = polyArea(b.p); if (!best || A < best.A) best = { b, A }; }
    if (!best) return null;
    const ob = obb(best.b.p), c = centroid(best.b.p);
    const along = ob.u1 - ob.u0 >= ob.v1 - ob.v0, ux = along ? ob.ux : -ob.uz, uz = along ? ob.uz : ob.ux;
    const cu = (ob.u0 + ob.u1) / 2, cv = (ob.v0 + ob.v1) / 2;
    return { c: [cu * ob.ux - cv * ob.uz, cu * ob.uz + cv * ob.ux], cen: c, yaw: Math.atan2(-uz, ux), L: Math.max(ob.u1 - ob.u0, ob.v1 - ob.v0), W: Math.min(ob.u1 - ob.u0, ob.v1 - ob.v0), A: best.A, h: best.b.h };
  }
  function plen(p) { let L = 0; for (let i = 1; i < p.length; i++) L += Math.hypot(p[i][0] - p[i - 1][0], p[i][1] - p[i - 1][1]); return L; }
  // join polylines that share end points into longer ones (straightest continuation)
  function stitch(list) {
    const K = q => Math.round(q[0] * 2) + ',' + Math.round(q[1] * 2), used = new Set(), ends = new Map();
    list.forEach((s, i) => { for (const q of [s.p[0], s.p[s.p.length - 1]]) { const k = K(q); if (!ends.has(k)) ends.set(k, []); ends.get(k).push(i); } });
    const out = [];
    const extend = (st) => {
      for (let guard = 0; guard < 300; guard++) {
        const p = st.p, end = p[p.length - 1], prev = p[p.length - 2], cand = (ends.get(K(end)) || []).filter(j => !used.has(j));
        let best = -1, bd = 0.5;
        for (const j of cand) { const q = list[j].p, nx = K(q[0]) === K(end) ? q[1] : q[q.length - 2], d1 = [end[0] - prev[0], end[1] - prev[1]], d2 = [nx[0] - end[0], nx[1] - end[1]];
          const c = (d1[0] * d2[0] + d1[1] * d2[1]) / ((Math.hypot(d1[0], d1[1]) * Math.hypot(d2[0], d2[1])) || 1); if (c > bd) { bd = c; best = j; } }
        if (best < 0) return;
        used.add(best); let q = list[best].p; if (K(q[0]) !== K(end)) q = q.slice().reverse();
        st.p = p.concat(q.slice(1)); st.l = Math.max(st.l, list[best].l);
      }
    };
    list.forEach((s, i) => {
      if (used.has(i)) return; used.add(i);
      const st = { p: s.p.slice(), l: s.l }; extend(st); st.p.reverse(); extend(st); out.push(st);
    });
    return out;
  }

  // ---------------------------------------------------------------- swallowing a building
  const fallMats = [];
  function fpWrite(o) {
    const e = o.T.e, ch = e.ch;
    const hide = o.st !== 0;
    if (hide !== !!e.hidden) {
      e.hidden = hide;
      // every distance version of the chunk
      ch.L.forEach((L, j) => {
        const a = L.m.geometry.attributes.position.array, s = e.r[j][0] * 3, n = e.r[j][1] * 3; if (!n) return;
        if (hide) { for (let i = 0; i < n; i += 3) { a[s + i] = e.info[0]; a[s + i + 1] = -500; a[s + i + 2] = e.info[1]; } }
        else for (let i = 0; i < n; i++) a[s + i] = L.orig[s + i];
        L.lo = Math.min(L.lo, s); L.hi = Math.max(L.hi, s + n); L.dirty = true;
      });
    }
    if (o.st === 1) {
      if (!e.fm && cur.fall.length >= 12) return; // many at once (a huge hole): the rest just drop out of sight
      if (!e.fm) {
        const g = new THREE.BufferGeometry(), src = ch.mesh.geometry.attributes, cx = e.info[0], cz = e.info[1], by = o.fpBase;
        const P = ch.orig.slice(e.start * 3, (e.start + e.count) * 3); for (let i = 0; i < P.length; i += 3) { P[i] -= cx; P[i + 1] -= by; P[i + 2] -= cz; }
        g.setAttribute('position', new THREE.BufferAttribute(P, 3));
        for (const k of ['normal', 'color', 'wv']) g.setAttribute(k, new THREE.BufferAttribute(src[k].array.slice(e.start * 3, (e.start + e.count) * 3), 3));
        const m = fallMats.pop() || cityMat(); m.userData.U.uShade.value = 1;
        e.fm = new THREE.Mesh(g, m); e.fm.frustumCulled = false; scene.add(e.fm); cur.fall.push(e);
      }
      const h = o.fall, base = h && h.gy != null ? h.gy : o.fpBase;
      E.objQuat(o, e.fm.quaternion); e.fm.position.set(o.x, base + o.y, o.z); e.fm.scale.setScalar(o.sc);
    } else if (e.fm) dropFaller(e);
  }
  function dropFaller(e) { scene.remove(e.fm); e.fm.geometry.dispose(); fallMats.push(e.fm.material); e.fm = null; const i = cur.fall.indexOf(e); if (i >= 0) cur.fall.splice(i, 1); }
  function fpShade(o, v) { const e = o.T.e; if (e.fm) e.fm.material.userData.U.uShade.value = v; }
  function flush() {
    if (!cur || !cur.chunks) return;
    for (const [k, ch] of cur.chunks) {
      for (const L of ch.L) if (L.dirty) { const at = L.m.geometry.attributes.position; at.updateRange.offset = L.lo; at.updateRange.count = L.hi - L.lo; at.needsUpdate = true; L.dirty = false; L.lo = 1e12; L.hi = -1; }
    }
  }
  function reset() { if (!cur) return; for (const e of cur.fall.slice()) dropFaller(e); }
  function clear() {
    if (!cur) return;
    reset();
    for (const m of cur.meshes) { scene.remove(m); m.geometry.dispose(); if (m.material !== bMat && m.material !== bMatFar && m.material !== gMat && m.material !== cur.terrainMat && !m.userData.keepMat) { if (m.material.map) m.material.map.dispose(); m.material.dispose(); } }
    if (cur.terrainMat) { cur.terrainMat.map.dispose(); cur.terrainMat.dispose(); }
    for (const s of cur.labels) { scene.remove(s); s.material.map.dispose(); s.material.dispose(); }
    cur = null;
  }
  // distance LOD: the road / rail / marking geometry of the ground layer is drawn only near the view centre (the painted
  // ground texture shows the same roads further away)
  // ground (cx, cz) = the hole (play) or the view centre; dist = the camera distance. The buildings of the chunks further
  // than that are drawn as plain prisms (the far version of the chunk, made with the chunk).
  function lod(cx, cz, dist) {
    if (!cur || !cur.gl) return;
    const r = Math.max(240, dist * 1.3) + CH * 0.71, r2 = r * r;
    for (const c of cur.gl) { const dx = c.x - cx, dz = c.z - cz, v = dx * dx + dz * dz < r2; if (c.m.visible !== v) c.m.visible = v; }
    const r1 = Math.max(200, dist * 0.35) + CH * 0.71, r2b = Math.max(450, dist * 0.8) + CH * 0.71;
    for (const [, ch] of cur.chunks) {
      const d = Math.hypot(ch.x - cx, ch.z - cz), lv = d > r2b ? 2 : d > r1 ? 1 : 0;
      if (lv !== ch.lv) { ch.lv = lv; ch.L.forEach((L, j) => { L.m.visible = j === lv; }); }
    }
    for (const c of cur.bl) { const far = Math.hypot(c.x - cx, c.z - cz) > r1; if (far !== c.far) { c.far = far; c.m.visible = !far; if (c.mf) c.mf.visible = far; } }
  }
  // name labels (view mode): stations, schools, rivers, public places
  function labels(on) {
    if (!cur) return;
    if (on && !cur.labels.length) {
      const want = { station: '#ffe27a', school: '#bfe8ff', river: '#bfe8ff', public: '#ffffff', park: '#c8f0b0', stationb: '#ffe27a', shrine: '#ffd0c0', bridge: '#e8e0ff', place: '#ffffff' };
      const seen = [];
      for (const L of (cur.C.real && cur.C.real.labels || []).concat(cur.D.lb)) {
        const col = want[L[3]]; if (!col) continue;
        if (seen.some(q => q[0] === L[0] && Math.hypot(q[1] - L[1], q[2] - L[2]) < 250)) continue; // the same name twice (map + city list)
        seen.push(L);
        const s = new THREE.Sprite(new THREE.SpriteMaterial({ map: E.labelTex(E.T(L[0]), col), depthTest: false, depthWrite: false, transparent: true }));
        s.position.set(L[1], gy(L[1], L[2]) + (L[3] === 'station' ? 30 : 18), L[2]); s.renderOrder = 19; s.userData.k = L[3]; scene.add(s); cur.labels.push(s);
      }
    }
    for (const s of cur.labels) s.visible = !!on;
  }
  function scaleLabels(dist) { if (cur) for (const s of cur.labels) if (s.visible) { const k = s.userData.k === 'station' ? 1.25 : s.userData.k === 'park' ? 0.8 : 1; s.scale.set(dist * 0.16 * k, dist * 0.04 * k, 1); } }

  // the nearest point that is not inside a building (start positions)
  // (wet(x, z): water, where a hole cannot stand)
  function freeSpot(x, z, wet) {
    if (!cur) return [x, z];
    const near = cur.D.b.filter(b => { const bb = bbox(b.p); return bb[0] < x + 80 && bb[2] > x - 80 && bb[1] < z + 80 && bb[3] > z - 80; });
    const ok = (px, pz) => !(wet && [[0, 0], [3, 0], [-3, 0], [0, 3], [0, -3]].some(d => wet(px + d[0], pz + d[1]))) && !near.some(b => pointIn(b.p, px, pz) || pointIn(b.p, px + 2, pz) || pointIn(b.p, px - 2, pz) || pointIn(b.p, px, pz + 2) || pointIn(b.p, px, pz - 2));
    for (let r = 0; r < 120; r += 3) for (let k = 0; k < Math.max(1, r * 2); k++) { const a = k / Math.max(1, r * 2) * 6.2832, px = x + Math.cos(a) * r, pz = z + Math.sin(a) * r; if (ok(px, pz)) return [px, pz]; }
    return [x, z];
  }
  return { load, build, gy, freeSpot, fpWrite, fpShade, flush, reset, clear, labels, scaleLabels, lod, get cur() { return cur; }, mats: [bMat, gMat] };
};
})();
