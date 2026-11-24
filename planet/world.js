// わくせいシミュレーターの「星の見た目」：PSim の星を、歩ける小さな世界として three.js r128 で描く。
// 地形は細かく割った正二十面体の球（高さは sim の標高＋細かい起伏）、色は気候と生き物から（海底・浜・草原・森・砂漠・雪と氷・溶岩）、
// 水の球（浅瀬と波打ちぎわ）、大気のふち（宇宙から）と空（地上から）、雲、昼と夜（街の灯）、木と岩と生き物（インスタンス）、見つけるものの目印。
// groundAt(dir) は描いた三角形そのものの高さを返すので、探検家の足は地面にぴったり乗る。
const PWorld = (() => {
'use strict';
const S = window.PSim;
const D2R = Math.PI / 180;
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
const VS_LAND = 0.0105, VS_SEA = 0.0065, SEA_MIN = -0.05; // km → fraction of the radius (exaggerated: a little planet)
function hv(h) { return h >= 0 ? VS_LAND * h : Math.max(SEA_MIN, VS_SEA * h); }
function radiusOf(st) { return clamp(0.55 + 0.45 * st.p.size, 0.62, 1.4); }

// ---------- icosphere ----------
function icosphere(level) {
  const t = (1 + Math.sqrt(5)) / 2, V = [], F = [];
  const add = (x, y, z) => { const l = Math.hypot(x, y, z); V.push(x / l, y / l, z / l); return V.length / 3 - 1; };
  [[-1, t, 0], [1, t, 0], [-1, -t, 0], [1, -t, 0], [0, -1, t], [0, 1, t], [0, -1, -t], [0, 1, -t], [t, 0, -1], [t, 0, 1], [-t, 0, -1], [-t, 0, 1]].forEach(p => add(...p));
  let faces = [[0, 11, 5], [0, 5, 1], [0, 1, 7], [0, 7, 10], [0, 10, 11], [1, 5, 9], [5, 11, 4], [11, 10, 2], [10, 7, 6], [7, 1, 8], [3, 9, 4], [3, 4, 2], [3, 2, 6], [3, 6, 8], [3, 8, 9], [4, 9, 5], [2, 4, 11], [6, 2, 10], [8, 6, 7], [9, 8, 1]];
  for (let l = 0; l < level; l++) {
    const cache = new Map(), nf = [];
    const mid = (a, b) => { const k = a < b ? a * 1e6 + b : b * 1e6 + a; let m = cache.get(k); if (m == null) { m = add((V[a * 3] + V[b * 3]) / 2, (V[a * 3 + 1] + V[b * 3 + 1]) / 2, (V[a * 3 + 2] + V[b * 3 + 2]) / 2); cache.set(k, m); } return m; };
    for (const [a, b, c] of faces) { const ab = mid(a, b), bc = mid(b, c), ca = mid(c, a); nf.push([a, ab, ca], [b, bc, ab], [c, ca, bc], [ab, bc, ca]); }
    faces = nf;
  }
  for (const f of faces) F.push(f[0], f[1], f[2]);
  return { dir: new Float32Array(V), idx: F.length > 65535 ? new Uint32Array(F) : new Uint16Array(F), nv: V.length / 3, nf: faces.length };
}
const ICO = {}; const ico = l => ICO[l] || (ICO[l] = icosphere(l));

// ---------- sampling the model ----------
const HX = S.HX, HY = S.HY, NX = S.NX, NY = S.NY;
function llOf(x, y, z) { return [Math.asin(clamp(y, -1, 1)) / D2R, Math.atan2(-z, x) / D2R]; }
function sampleHi(A, lat, lon) { // bilinear on the 256×128 grid
  const fj = clamp((90 - lat) / 180 * HY - 0.5, 0, HY - 1.001), fi = (lon + 180) / 360 * HX - 0.5;
  const j0 = Math.floor(fj), tj = fj - j0, i0f = Math.floor(fi), ti = fi - i0f, i0 = (i0f % HX + HX) % HX, i1 = (i0 + 1) % HX;
  const a = A[j0 * HX + i0], b = A[j0 * HX + i1], c = A[(j0 + 1) * HX + i0], d = A[(j0 + 1) * HX + i1];
  return (a * (1 - ti) + b * ti) * (1 - tj) + (c * (1 - ti) + d * ti) * tj;
}
function sampleCell(A, lat, lon) { // bilinear on the 64×32 cells
  const fj = clamp((90 - lat) / 180 * NY - 0.5, 0, NY - 1.001), fi = (lon + 180) / 360 * NX - 0.5;
  const j0 = Math.floor(fj), tj = fj - j0, i0f = Math.floor(fi), ti = fi - i0f, i0 = (i0f % NX + NX) % NX, i1 = (i0 + 1) % NX;
  const a = A[j0 * NX + i0], b = A[j0 * NX + i1], c = A[(j0 + 1) * NX + i0], d = A[(j0 + 1) * NX + i1];
  return (a * (1 - ti) + b * ti) * (1 - tj) + (c * (1 - ti) + d * ti) * tj;
}
function rowT(st, lat) { const f = clamp((90 - lat) / 180 * NY - 0.5, 0, NY - 1.001), j = Math.floor(f), t = f - j; return st.T[j] * (1 - t) + st.T[j + 1] * t; }
function detail(x, y, z) { return S.fbm(x * 7 + 3.1, y * 7 + 1.7, z * 7 + 5.3, 911, 3) - 0.5; }
// the level of the "fluid" (sea, lava lake) the terrain is measured from, and what the fluid is
function fluidOf(st) {
  const hot = st.t < 3.2e7 || st.wonder === 'lava';
  if (hot) return { kind: 'lava', datum: pct(st, 0.42) };
  if (st.wl > 0.02) return { kind: 'water', datum: st.sea };
  return { kind: 'none', datum: pct(st, 0.35) };
}
function pct(st, q) { // a percentile of the elevation (cached per terrain version)
  if (st._pctV === st.geoV && st._pctQ === q) return st._pct;
  const a = []; for (let k = 0; k < S.HN; k += 7) a.push(st.elev[k]); a.sort((x, y) => x - y);
  st._pctV = st.geoV; st._pctQ = q; st._pct = a[Math.floor(a.length * q)]; return st._pct;
}

// ---------- colours ----------
const C = hex => [((hex >> 16) & 255) / 255, ((hex >> 8) & 255) / 255, (hex & 255) / 255];
const COL = { // muted, satellite-photo colours
  deep: C(0x203a4c), shelf: C(0x5d8a7e), sand: C(0xddc89c), wetsand: C(0xb9a57c), rock: C(0x7c6f62), rockD: C(0x524840), young: C(0x7e5440), basalt: C(0x2a2524), crust: C(0x33292a),
  desert: C(0xcba66e), redsand: C(0xb87a4c), savanna: C(0xa59c5c), grass: C(0x6e9140), meadow: C(0x82a84d), forest: C(0x2f612b), jungle: C(0x245a2a), boreal: C(0x2d503b),
  tundra: C(0x8d8773), snow: C(0xeef2f7), ice: C(0xd4e3f0), moon: C(0xa7a2a0), moonD: C(0x6d6967), bloom: C(0x6fb85a), pink: C(0xf0a0c4),
  mat: C(0x5c8c6a), // microbial mats on the coasts
};
function mix3(o, a, b, t) { o[0] = a[0] + (b[0] - a[0]) * t; o[1] = a[1] + (b[1] - a[1]) * t; o[2] = a[2] + (b[2] - a[2]) * t; return o; }
const tmp = [0, 0, 0], tmp2 = [0, 0, 0];
// the colour of the ground at one vertex. h = km above the fluid level
let lastIce = 0;
function groundColor(st, out, h, lat, lon, x, y, z, slope, dn, ctx) {
  lastIce = 0;
  const n = detail(y * 1.7, z * 1.7, x * 1.7) + 0.5; // 0..1 variation
  if (st.wonder === 'moon') { mix3(out, COL.moonD, COL.moon, clamp(0.35 + h * 0.25 + n * 0.5, 0, 1)); return 0; }
  if (ctx.lava) { // a molten world: black crust, glowing low ground
    mix3(out, COL.basalt, COL.crust, n);
    const g = sstep(0.7, -0.4, h) * (0.5 + 0.5 * sstep(0.35, 0.65, n)); return g;
  }
  if (h < 0) { // sea floor (seen through shallow water)
    mix3(out, COL.shelf, COL.deep, sstep(-0.2, -3.5, h)); if (h > -0.35) mix3(out, out, COL.wetsand, 0.6); return 0;
  }
  const T = rowT(st, lat) - 6.5 * h * 0.8 + ctx.season * Math.sign(lat) * sstep(15, 65, Math.abs(lat)), veg = ctx.plants ? sampleCell(st.veg, lat, lon) : 0, iceL = sampleCell(st.iceL, lat, lon), wet = ctx.wet ? sampleCell(st.moist, lat, lon) : 0.3;
  // bare rock: reddish when young, grey-brown later
  mix3(out, ctx.young ? COL.young : COL.rock, COL.rockD, n * 0.6 + slope * 0.6);
  if (!ctx.plants && st.life.st >= 1 && h < 0.4 && ctx.water) mix3(out, out, COL.mat, 0.35 * sstep(0.4, 0.05, h));
  if (ctx.plants) {
    let g;
    if (veg < 0.12) g = T > 16 ? (wet < 0.22 ? COL.redsand : COL.desert) : T < 0 ? COL.tundra : COL.savanna;
    else if (veg < 0.3) g = T > 22 ? COL.savanna : T < 2 ? COL.tundra : COL.grass;
    else if (veg < 0.5) g = T < 4 ? COL.boreal : COL.meadow;
    else g = T > 22 ? COL.jungle : T < 6 ? COL.boreal : COL.forest;
    const cover = sstep(0.0, 0.25, veg + 0.15) * (1 - sstep(0.45, 0.9, slope));
    mix3(tmp, g, veg > 0.3 && g !== COL.boreal ? COL.forest : g, veg > 0.3 ? 0.25 * n : 0);
    mix3(out, out, tmp, cover);
    if (st.wonder === 'bloom' && veg > 0.3 && n > 0.62) mix3(out, out, COL.pink, 0.55);
  }
  // beaches
  if (ctx.water && h < 0.22 && T > 0) mix3(out, out, COL.sand, sstep(0.22, 0.05, h) * (1 - slope));
  // snow and ice
  const sn = Math.max(sstep(0.25, 0.7, iceL), sstep(-6, -14, T)) * (1 - 0.5 * sstep(0.6, 1, slope));
  if (sn > 0) mix3(out, out, iceL > 0.8 ? COL.ice : COL.snow, sn); lastIce = sn;
  // night lights of cities
  // cities gather by the sea and along wet valleys (rivers): their lights follow
  return ctx.civ ? sampleCell(st.pop, lat, lon) * clamp(0.3 + sampleCell(st.moist, lat, lon) * 1.2, 0, 1) * (h < 1.2 ? 1 : 0.3) * sstep(0.5, 0.78, n) : 0; // towns in clusters
}

// ---------- tiny geometry helpers (merge parts with colours, for instancing) ----------
function part(THREE, geo, color, m) {
  const g = geo.index ? geo.toNonIndexed() : geo; if (m) g.applyMatrix4(m);
  const n = g.attributes.position.count, c = new Float32Array(n * 3), col = new THREE.Color(color);
  for (let i = 0; i < n; i++) { c[i * 3] = col.r; c[i * 3 + 1] = col.g; c[i * 3 + 2] = col.b; }
  g.setAttribute('color', new THREE.BufferAttribute(c, 3)); return g;
}
function merge(THREE, parts) {
  let n = 0; for (const p of parts) n += p.attributes.position.count;
  const P = new Float32Array(n * 3), Nn = new Float32Array(n * 3), Cc = new Float32Array(n * 3); let o = 0;
  for (const p of parts) { P.set(p.attributes.position.array, o * 3); Nn.set(p.attributes.normal.array, o * 3); Cc.set(p.attributes.color.array, o * 3); o += p.attributes.position.count; }
  const g = new THREE.BufferGeometry(); g.setAttribute('position', new THREE.BufferAttribute(P, 3)); g.setAttribute('normal', new THREE.BufferAttribute(Nn, 3)); g.setAttribute('color', new THREE.BufferAttribute(Cc, 3));
  g.computeBoundingSphere(); return g;
}
const M4 = (THREE, x, y, z, sx, sy, sz, rx, rz) => { const m = new THREE.Matrix4(); m.compose(new THREE.Vector3(x, y, z), new THREE.Quaternion().setFromEuler(new THREE.Euler(rx || 0, 0, rz || 0)), new THREE.Vector3(sx, sy == null ? sx : sy, sz == null ? sx : sz)); return m; };
function jitterColors(g, amt, seed) { // leafy variation: each vertex a little lighter or darker
  const c = g.attributes.color.array, p = g.attributes.position.array, r = S.rng(seed);
  for (let i = 0; i < c.length; i += 9) { const k = 1 + (r() - 0.5) * amt * 2, y = p[i + 1]; for (let q = 0; q < 9; q += 3) { const up = 0.92 + 0.12 * Math.min(1, Math.max(0, p[i + q + 1] - 0.6)); c[i + q] *= k * up; c[i + q + 1] *= k * up; c[i + q + 2] *= k * up; } }
  return g;
}
function treeGeos(THREE) {
  const pine = jitterColors(merge(THREE, [part(THREE, new THREE.CylinderGeometry(0.06, 0.1, 0.6, 6), 0x5e4330, M4(THREE, 0, 0.3, 0, 1)), part(THREE, new THREE.ConeGeometry(0.48, 0.7, 8), 0x2a5a3c, M4(THREE, 0, 0.62, 0, 1)), part(THREE, new THREE.ConeGeometry(0.38, 0.62, 8), 0x2f6642, M4(THREE, 0, 0.95, 0, 1)), part(THREE, new THREE.ConeGeometry(0.26, 0.55, 8), 0x377349, M4(THREE, 0, 1.28, 0, 1))]), 0.12, 3);
  const oak = jitterColors(merge(THREE, [part(THREE, new THREE.CylinderGeometry(0.06, 0.1, 0.7, 6), 0x6b4a30, M4(THREE, 0, 0.35, 0, 1)), part(THREE, new THREE.IcosahedronGeometry(0.4, 1), 0x3f7e33, M4(THREE, 0, 0.92, 0, 1, 0.85, 1)), part(THREE, new THREE.IcosahedronGeometry(0.3, 1), 0x4a8a3a, M4(THREE, 0.22, 1.02, 0.08, 1)), part(THREE, new THREE.IcosahedronGeometry(0.28, 1), 0x467f36, M4(THREE, -0.2, 1.0, -0.1, 1)), part(THREE, new THREE.IcosahedronGeometry(0.26, 1), 0x529443, M4(THREE, 0.02, 1.2, 0.05, 1))]), 0.14, 5);
  const palm = merge(THREE, [part(THREE, new THREE.CylinderGeometry(0.045, 0.075, 1.15, 6), 0x8a6a46, M4(THREE, 0.06, 0.57, 0, 1, 1, 1, 0, -0.12)), ...[0, 1, 2, 3, 4, 5].map(i => part(THREE, new THREE.ConeGeometry(0.11, 0.75, 3), i % 2 ? 0x3a8c44 : 0x2f7a3a, (() => { const m = new THREE.Matrix4(); m.makeRotationY(i * 1.047); m.multiply(M4(THREE, 0.32, 1.06, 0, 1, 1, 0.3, 0, -1.3)); return m; })())), part(THREE, new THREE.SphereGeometry(0.06, 5, 4), 0x6b4a2a, M4(THREE, 0.12, 1.1, 0, 1))]);
  const bloom = merge(THREE, [part(THREE, new THREE.CylinderGeometry(0.06, 0.08, 1.2, 6), 0x4f9b3e, M4(THREE, 0, 0.6, 0, 1)), part(THREE, new THREE.SphereGeometry(0.38, 10, 5, 0, Math.PI * 2, 0, 1.2), 0xf6a6cf, M4(THREE, 0, 1.15, 0, 1, 0.6, 1)), part(THREE, new THREE.SphereGeometry(0.12, 8, 5), 0xffe37a, M4(THREE, 0, 1.3, 0, 1))]);
  const bush = jitterColors(merge(THREE, [part(THREE, new THREE.IcosahedronGeometry(0.3, 1), 0x45793a, M4(THREE, 0, 0.18, 0, 1, 0.7, 1)), part(THREE, new THREE.IcosahedronGeometry(0.22, 1), 0x4f8740, M4(THREE, 0.22, 0.14, 0.05, 1, 0.75, 1)), part(THREE, new THREE.IcosahedronGeometry(0.2, 1), 0x3f7034, M4(THREE, -0.18, 0.12, -0.08, 1, 0.75, 1))]), 0.15, 7);
  const rock = jitterColors(merge(THREE, [part(THREE, new THREE.DodecahedronGeometry(0.4, 1), 0x8a8279, M4(THREE, 0, 0.12, 0, 1, 0.62, 0.9)), part(THREE, new THREE.DodecahedronGeometry(0.22, 0), 0x7d756c, M4(THREE, 0.34, 0.05, 0.1, 1, 0.7, 1))]), 0.1, 9);
  // far versions (seen from orbit): a handful of triangles each
  const far = {
    pine: merge(THREE, [part(THREE, new THREE.ConeGeometry(0.42, 1.4, 5, 1, true), 0x33744e, M4(THREE, 0, 0.75, 0, 1))]),
    oak: merge(THREE, [part(THREE, new THREE.OctahedronGeometry(0.48, 0), 0x56a142, M4(THREE, 0, 0.8, 0, 1, 0.9, 1))]),
    palm: merge(THREE, [part(THREE, new THREE.ConeGeometry(0.4, 0.5, 4, 1, true), 0x3c9a48, M4(THREE, 0, 1.0, 0, 1, 1, 1, Math.PI, 0))]),
    bloom: merge(THREE, [part(THREE, new THREE.OctahedronGeometry(0.42, 0), 0xf6a6cf, M4(THREE, 0, 1.1, 0, 1, 0.6, 1))]),
    rock: merge(THREE, [part(THREE, new THREE.TetrahedronGeometry(0.4, 0), 0x8a8279, M4(THREE, 0, 0.1, 0, 1, 0.6, 0.9))]),
    bush: merge(THREE, [part(THREE, new THREE.OctahedronGeometry(0.3, 0), 0x45793a, M4(THREE, 0, 0.15, 0, 1, 0.6, 1))]),
  };
  return { pine, oak, palm, bloom, rock, bush, far };
}

// ---------- shaders ----------
const NOISE = `
float hh(vec3 p) { return fract(sin(dot(p, vec3(12.9898, 78.233, 37.719))) * 43758.5453); }
float nn(vec3 p) { vec3 i = floor(p), f = fract(p); f = f * f * (3.0 - 2.0 * f);
  return mix(mix(mix(hh(i), hh(i + vec3(1,0,0)), f.x), mix(hh(i + vec3(0,1,0)), hh(i + vec3(1,1,0)), f.x), f.y), mix(mix(hh(i + vec3(0,0,1)), hh(i + vec3(1,0,1)), f.x), mix(hh(i + vec3(0,1,1)), hh(i + vec3(1,1,1)), f.x), f.y), f.z); }
vec2 sphUv(vec3 p) { p = normalize(p); float u = atan(p.z, -p.x) / 6.2831853; return vec2(fract(u), 1.0 - acos(clamp(p.y, -1.0, 1.0)) / 3.1415927); }
// winds by latitude (trade winds west, westerlies east, polar easterlies west); smooth, so the bands never tear
float windAt(float lat) { return -0.004 * (1.0 - smoothstep(20.0, 35.0, lat)) + 0.006 * smoothstep(25.0, 40.0, lat) * (1.0 - smoothstep(55.0, 70.0, lat)) - 0.002 * smoothstep(60.0, 75.0, lat); }
// clouds drift in two crossfaded phases, so the shear between bands stays small however long you watch
float cloudA(sampler2D m, vec2 uv, float time) { float w = windAt(abs(uv.y - 0.5) * 180.0) * 14.0; float a = fract(time / 14.0), b = fract(time / 14.0 + 0.5);
  float ta = texture2D(m, vec2(uv.x + w * a + 0.31, uv.y)).a, tb = texture2D(m, vec2(uv.x + w * b, uv.y)).a; return mix(ta, tb, abs(2.0 * a - 1.0)); }
`;
const TERRAIN_VS = `
attribute vec3 col; attribute float glow; attribute vec2 mat;
varying vec3 vCol; varying float vGlow; varying vec2 vMat; varying vec3 vN; varying vec3 vW;
void main() { vCol = col; vGlow = glow; vMat = mat; vN = normalize(mat3(modelMatrix) * normal); vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const TERRAIN_FS = `
uniform vec3 sun; uniform vec3 skyCol; uniform vec3 hazeCol; uniform float fogK; uniform float lava; uniform float time; uniform float dim; uniform float lights;
uniform sampler2D cloudMap; uniform float cloudAmt; uniform float hq; uniform float R;
varying vec3 vCol; varying float vGlow; varying vec2 vMat; varying vec3 vN; varying vec3 vW;
` + NOISE + `
void main() {
  vec3 n = normalize(vN); vec3 up = normalize(vW); vec3 v = normalize(cameraPosition - vW);
  float land = smoothstep(0.998, 1.003, length(vW) / R);
  vec3 ccol = vCol;
#ifdef HQ
  float macro = nn(vW / R * 13.0);
  { // per-pixel detail: two octaves of bumps, patchy colour, fine grain
    vec3 q = vW / R * 120.0; float e = 0.3; float b0 = nn(q), bx = nn(q + vec3(e, 0.0, 0.0)), by = nn(q + vec3(0.0, e, 0.0)), bz = nn(q + vec3(0.0, 0.0, e));
    vec3 g = vec3(bx - b0, by - b0, bz - b0); vec3 q2 = q * 4.1; float c0 = nn(q2); g += 0.5 * vec3(nn(q2 + vec3(e, 0.0, 0.0)) - c0, nn(q2 + vec3(0.0, e, 0.0)) - c0, nn(q2 + vec3(0.0, 0.0, e)) - c0);
    g -= up * dot(g, up);
    n = normalize(n - g * 2.4 * land * (1.0 - 0.6 * vMat.x));
    ccol *= (0.8 + 0.4 * macro) * (0.88 + 0.24 * c0 * land);
  }
#endif
  float d = dot(n, sun); float day = smoothstep(-0.15, 0.25, dot(up, sun));
  float diff = max(d, 0.0) * 1.08 + 0.12 * max(dot(n, up), 0.0) * day;
  // soft shadows of the clouds on the ground (sampled a little toward the sun)
  float cs = 0.0;
#ifdef HQ
  if (cloudAmt > 0.0) cs = cloudA(cloudMap, sphUv(vW + sun * R * 0.05), time) * cloudAmt * 0.5;
#endif
  vec3 c = ccol * (diff * dim * (1.0 - cs) + 0.1 + 0.12 * skyCol * day + vec3(0.04, 0.06, 0.12) * fogK * (1.0 - day));
  // ice and snow shine in the sun; fresh lava crust is cracked and glowing
  c += vec3(1.0, 0.97, 0.9) * pow(max(dot(reflect(-sun, n), v), 0.0), 30.0) * vMat.x * 0.45 * day * dim;
  float pulse = 0.75 + 0.25 * sin(time * 1.7 + vW.x * 30.0 + vW.z * 20.0);
  c += vec3(1.0, 0.36, 0.08) * vGlow * lava * pulse * 1.3;
  if (vMat.y > 0.0) { float cr = 1.0 - smoothstep(0.015, 0.06, abs(nn(vW / R * 36.0 + nn(vW / R * 90.0) * 0.6) - 0.5)); c += vec3(1.0, 0.42, 0.1) * cr * vMat.y * pulse * 1.4; }
  c += vec3(1.0, 0.8, 0.42) * sqrt(vGlow) * lights * (1.0 - day) * (1.0 - day) * 1.8;
  float dist = length(vW - cameraPosition);
  c = mix(c, hazeCol * (0.25 + 0.75 * day), 1.0 - exp(-dist * fogK));
  gl_FragColor = vec4(c, 1.0);
}`;
const WATER_VS = `
attribute float dep; attribute float ice;
varying float vDep; varying float vIce; varying vec3 vW;
void main() { vDep = dep; vIce = ice; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const WATER_FS = `
uniform vec3 sun; uniform float time; uniform float lava; uniform vec3 hazeCol; uniform float fogK; uniform float dim;
varying float vDep; varying float vIce; varying vec3 vW;
` + NOISE + `
void main() {
  vec3 up = normalize(vW); vec3 v = normalize(cameraPosition - vW);
  float day = smoothstep(-0.15, 0.25, dot(up, sun));
  float near = fogK > 0.0 ? 1.0 : 0.0;
  // waves: bigger and sharper seen from the shore
  float s1 = mix(60.0, 260.0, near), s2 = mix(140.0, 620.0, near);
  float w1 = nn(vW * s1 + vec3(time * 0.6, 0.0, time * 0.4)), w2 = nn(vW * s2 - vec3(0.0, time * 0.9, time * 0.5));
  vec3 n = normalize(up + mix(0.06, 0.16, near) * vec3(w1 - 0.5, w2 - 0.5, w1 - w2));
  if (lava > 0.5) {
    vec3 q = vW * 7.0; float wq = nn(q * 2.3 + vec3(time * 0.03)); float nn0 = nn(q + wq * 1.8);
    float river = 1.0 - smoothstep(0.015, 0.09, abs(nn0 - 0.5)); float pool = smoothstep(0.62, 0.8, nn(q * 0.6 + 4.0));
    float hot = max(river, pool) * (0.85 + 0.15 * sin(time * 2.0 + wq * 9.0));
    vec3 crust = vec3(0.09, 0.06, 0.055) + vec3(0.25, 0.06, 0.0) * smoothstep(0.3, 0.0, abs(nn0 - 0.5));
    gl_FragColor = vec4(mix(crust, vec3(1.0, 0.5, 0.12) * 1.3, hot), 1.0); return;
  }
  float deep = smoothstep(0.0, 2.6, vDep);
  vec3 c = mix(vec3(0.2, 0.78, 0.74), mix(vec3(0.05, 0.36, 0.6), vec3(0.02, 0.13, 0.34), smoothstep(0.8, 3.5, vDep)), smoothstep(0.0, 0.9, vDep));
  float diff = max(dot(n, sun), 0.0);
  c *= 0.25 + 0.9 * diff * dim;
  float fr = pow(1.0 - max(dot(n, v), 0.0), 4.0);
  c += vec3(0.55, 0.72, 0.95) * fr * 0.4 * day;
  vec3 r = reflect(-sun, n); float sp = max(dot(r, v), 0.0); c += vec3(1.0, 0.95, 0.82) * (pow(sp, 180.0) * 1.4 + pow(sp, 16.0) * 0.12) * dim;
  // the foam line where the waves meet the shore
  float foam = (1.0 - smoothstep(0.0, mix(0.1, 0.06, near), vDep)) * (0.55 + 0.45 * sin(vDep * 30.0 - time * 1.8 + w1 * 5.0));
  foam = clamp(foam + (1.0 - smoothstep(0.0, 0.025, vDep)) * 0.6, 0.0, 1.0);
  c = mix(c, vec3(0.97) * (0.35 + 0.65 * diff * dim), foam * 0.85);
  if (vIce > 0.0) { // sea ice: white plates with blue cracks and a sheen
    float pl = nn(vW * 80.0), crk = 1.0 - smoothstep(0.01, 0.05, abs(nn(vW * 140.0 + pl) - 0.5));
    vec3 ic = mix(vec3(0.86, 0.92, 0.98), vec3(0.55, 0.72, 0.88), crk * 0.8) * (0.9 + 0.15 * pl);
    vec3 nI = normalize(up + 0.04 * vec3(w1 - 0.5, w2 - 0.5, 0.0));
    ic = ic * (0.28 + 0.72 * max(dot(nI, sun), 0.0) * dim) + vec3(1.0) * pow(max(dot(reflect(-sun, nI), v), 0.0), 40.0) * 0.35 * dim;
    c = mix(c, ic, vIce); }
  float a = mix(mix(0.5, 0.96, deep), 1.0, max(vIce, foam * 0.7));
  float dist = length(vW - cameraPosition);
  c = mix(c, hazeCol * (0.25 + 0.75 * day), 1.0 - exp(-dist * fogK));
  gl_FragColor = vec4(c, a);
}`;
const ATMO_VS = `varying vec3 vW; void main() { vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const ATMO_FS = `
uniform vec3 sun; uniform vec3 col; uniform vec3 zen; uniform float R; uniform float inside; uniform float strength; uniform float night;
varying vec3 vW;
void main() {
  vec3 v = normalize(vW - cameraPosition);
  if (inside > 0.5) { // the sky, seen from the ground
    vec3 up = normalize(cameraPosition); float e = dot(v, up); float day = smoothstep(-0.2, 0.25, dot(up, sun));
    vec3 hor = mix(col, vec3(0.9, 0.94, 1.0), 0.32); vec3 c = mix(hor, zen, pow(smoothstep(-0.02, 0.9, e), 0.6));
    float s = max(dot(v, sun), 0.0); c += vec3(1.0, 0.9, 0.7) * (pow(s, 600.0) * 3.0 + pow(s, 12.0) * 0.35);
    float dusk = (1.0 - abs(dot(up, sun)) * 2.5); c += vec3(0.9, 0.4, 0.2) * clamp(dusk, 0.0, 1.0) * smoothstep(0.3, -0.1, e) * 0.5;
    gl_FragColor = vec4(c * strength, clamp(day * 1.05 * strength + 0.02, 0.0, 1.0) * (1.0 - night * 0.0)); return;
  }
  // the rim of air around the planet, seen from space
  vec3 p = cameraPosition; float b = dot(p, v); float c2 = dot(p, p) - R * R * 1.0; float disc = b * b - c2;
  float t = -b; vec3 q = p + v * t; float hgt = (length(q) - R) / (R * 0.12);
  float glow = exp(-max(hgt, 0.0) * 3.0) * (hgt < 0.0 ? 0.0 : 1.0);
  float sd = dot(normalize(q), sun); float lit = smoothstep(-0.35, 0.4, sd);
  // sunlight that grazes through a long path of air loses its blue: the limb near the day–night line glows red
  vec3 rc = mix(vec3(1.0, 0.42, 0.18), col, smoothstep(-0.05, 0.45, sd));
  gl_FragColor = vec4(rc * glow * lit * strength * 1.3, glow * lit * strength);
}`;
const CLOUD_FS = `
uniform sampler2D map; uniform vec3 sun; uniform float amt; uniform float fogK; uniform vec3 tint; uniform float time;
varying vec2 vUv; varying vec3 vW;
` + NOISE + `
void main() {
  float a = cloudA(map, vUv, time);
  float day = smoothstep(-0.2, 0.3, dot(normalize(vW), sun));
  gl_FragColor = vec4(tint * (0.08 + 1.0 * day), a * amt * (fogK > 0.0 ? 0.75 : 1.0));
}`;
const CLOUD_VS = `varying vec2 vUv; varying vec3 vW; void main() { vUv = uv; vec4 w = modelMatrix * vec4(position, 1.0); vW = w.xyz; gl_Position = projectionMatrix * viewMatrix * w; }`;
const BEAM_FS = `uniform vec3 col; uniform float time; varying vec2 vUv; void main() { float a = (1.0 - vUv.y) * (0.55 + 0.45 * sin(time * 3.0 + vUv.y * 8.0)); float edge = 1.0 - abs(vUv.x - 0.5) * 2.0; gl_FragColor = vec4(col, a * 0.75 * edge); }`;
const BEAM_VS = `varying vec2 vUv; void main() { vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;
const AUR_FS = `uniform float time; uniform float amt; uniform vec3 sun; varying vec2 vUv; varying vec3 vW;
void main() { float night = smoothstep(0.1, -0.3, dot(normalize(vW), sun)); float w = 0.5 + 0.5 * sin(vUv.x * 60.0 + time * 1.3) * sin(vUv.x * 23.0 - time * 0.7);
  float a = smoothstep(0.0, 0.25, vUv.y) * (1.0 - vUv.y) * w * amt * night; gl_FragColor = vec4(mix(vec3(0.2, 1.0, 0.6), vec3(0.7, 0.35, 1.0), vUv.y), a); }`;

// ======================================================================================
function create(THREE, scene, opt) {
  opt = opt || {};
  const W = { THREE, scene, st: null, R: 1, level: opt.level || 6, geoV: -1, colT: 0, fluid: { kind: 'water', datum: 0 }, time: 0, sun: new THREE.Vector3(0.6, 0.35, 0.72).normalize(), surface: 0, quality: opt.quality || 1 };
  const root = new THREE.Group(); scene.add(root); W.root = root;
  // lights for the ordinary (lambert) things: trees, creatures, markers, the explorer
  const sunL = new THREE.DirectionalLight(0xfff3e0, 1.05); scene.add(sunL); scene.add(sunL.target); W.sunL = sunL;
  const hemi = new THREE.HemisphereLight(0xbfd8ff, 0x3a3026, 0.42); scene.add(hemi); W.hemi = hemi;
  // terrain
  const cCv = document.createElement('canvas'); cCv.width = 512; cCv.height = 256; const cTex = new THREE.CanvasTexture(cCv); cTex.wrapS = THREE.RepeatWrapping;
  const tU = { cloudMap: { value: cTex }, cloudAmt: { value: 0 }, hq: { value: W.quality >= 1 ? 1 : 0 }, R: { value: 1 }, sun: { value: W.sun }, skyCol: { value: new THREE.Color(0.55, 0.7, 1) }, hazeCol: { value: new THREE.Color(0.6, 0.75, 0.95) }, fogK: { value: 0 }, lava: { value: 0 }, time: { value: 0 }, dim: { value: 1 }, lights: { value: 0 } };
  const tMat = new THREE.ShaderMaterial({ uniforms: tU, vertexShader: TERRAIN_VS, fragmentShader: TERRAIN_FS, defines: W.quality >= 1 ? { HQ: 1 } : {} });
  const tGeo = new THREE.BufferGeometry(); const terrain = new THREE.Mesh(tGeo, tMat); terrain.frustumCulled = false; root.add(terrain);
  // water / lava
  const wU = { sun: { value: W.sun }, time: { value: 0 }, lava: { value: 0 }, hazeCol: tU.hazeCol, fogK: tU.fogK, dim: tU.dim };
  const wMat = new THREE.ShaderMaterial({ uniforms: wU, vertexShader: WATER_VS, fragmentShader: WATER_FS, transparent: true, depthWrite: false });
  const wGeo = new THREE.BufferGeometry(); const water = new THREE.Mesh(wGeo, wMat); water.frustumCulled = false; water.renderOrder = 2; root.add(water);
  // air
  const aU = { sun: { value: W.sun }, col: { value: new THREE.Color(0.35, 0.6, 1.0) }, zen: { value: new THREE.Color(0.18, 0.38, 0.85) }, R: { value: 1 }, inside: { value: 0 }, strength: { value: 1 }, night: { value: 0 } };
  const atmo = new THREE.Mesh(new THREE.SphereGeometry(1.12, 48, 32), new THREE.ShaderMaterial({ uniforms: aU, vertexShader: ATMO_VS, fragmentShader: ATMO_FS, transparent: true, depthWrite: false, side: THREE.BackSide, blending: THREE.NormalBlending }));
  atmo.renderOrder = 1; root.add(atmo);
  // clouds (a painted texture on a shell)
  const cU = { map: { value: cTex }, sun: { value: W.sun }, amt: { value: 1 }, fogK: tU.fogK, tint: { value: new THREE.Color(1, 1, 1) }, time: { value: 0 } };
  const clouds = new THREE.Mesh(new THREE.SphereGeometry(1.06, 48, 24), new THREE.ShaderMaterial({ uniforms: cU, vertexShader: CLOUD_VS, fragmentShader: CLOUD_FS, transparent: true, depthWrite: false }));
  clouds.renderOrder = 3; root.add(clouds);
  // stars
  // stars: half of them crowd into a tilted band (the Milky Way), with a faint glow behind
  const NS = 3200, sp = new Float32Array(NS * 3), sc = new Float32Array(NS * 3), tilt = new THREE.Matrix4().makeRotationX(1.05).multiply(new THREE.Matrix4().makeRotationZ(0.4));
  { const r = S.rng(77), v = new THREE.Vector3(), col = new THREE.Color(); for (let i = 0; i < NS; i++) { let z = r() * 2 - 1; if (i % 2) z = (r() - 0.5) * 0.22 * (r() + 0.2); const a = r() * 6.283, s = Math.sqrt(1 - z * z), d = 45; v.set(s * Math.cos(a) * d, z * d, s * Math.sin(a) * d); if (i % 2) v.applyMatrix4(tilt);
    sp[i * 3] = v.x; sp[i * 3 + 1] = v.y; sp[i * 3 + 2] = v.z; col.setHSL(0.55 + (r() - 0.5) * 0.25, 0.4 * r(), 0.55 + 0.45 * r() * r()); sc[i * 3] = col.r; sc[i * 3 + 1] = col.g; sc[i * 3 + 2] = col.b; } }
  const sg = new THREE.BufferGeometry(); sg.setAttribute('position', new THREE.BufferAttribute(sp, 3)); sg.setAttribute('color', new THREE.BufferAttribute(sc, 3));
  const stars = new THREE.Points(sg, new THREE.PointsMaterial({ size: 1.7, sizeAttenuation: false, vertexColors: true, transparent: true, opacity: 0.9, depthWrite: false })); scene.add(stars); W.stars = stars;
  const mwU = { op: { value: 1 } };
  // the Milky Way: painted once into a texture (cheap to draw)
  const mwCv = document.createElement('canvas'); mwCv.width = 512; mwCv.height = 256;
  { const x = mwCv.getContext('2d'), img = x.createImageData(512, 256), d = img.data;
    for (let j = 0; j < 256; j++) { const la = (0.5 - (j + 0.5) / 256) * Math.PI, y = Math.sin(la), b = Math.exp(-((y * 5) ** 2));
      for (let i = 0; i < 512; i++) { const lo = i / 512 * 6.283, px = Math.cos(la) * Math.cos(lo), pz = Math.cos(la) * Math.sin(lo);
        const k = S.fbm(px * 3 + 9, y * 3, pz * 3, 31, 4), dust = sstep(0.52, 0.66, S.fbm(px * 6, y * 6 + 4, pz * 6, 37, 3)) * Math.exp(-((y * 14) ** 2));
        const a = b * (0.35 + 0.9 * k) * (1 - dust * 0.85), o = (j * 512 + i) * 4; d[o] = 150 + 90 * k; d[o + 1] = 140 + 70 * k; d[o + 2] = 175 - 20 * k; d[o + 3] = Math.round(clamp(a * 0.5, 0, 1) * 255); } }
    x.putImageData(img, 0, 0); }
  const milky = new THREE.Mesh(new THREE.SphereGeometry(48, 32, 16), new THREE.MeshBasicMaterial({ map: new THREE.CanvasTexture(mwCv), side: THREE.BackSide, transparent: true, depthWrite: false }));
  mwU.op = { set value(v) { milky.material.opacity = v; }, get value() { return milky.material.opacity; } };
  milky.rotation.setFromRotationMatrix(tilt); milky.visible = W.quality >= 1; scene.add(milky); W.milky = milky; W.mwU = mwU;
  const moon = new THREE.Mesh(new THREE.IcosahedronGeometry(1, 3), new THREE.MeshLambertMaterial({ color: 0xbdb8b0 })); scene.add(moon); W.moon = moon; W.plumes = [];
  W.plume = (lat, lon, secs) => { W.plumes.push({ lat, lon, left: secs || 10, acc: 0 }); if (W.plumes.length > 6) W.plumes.shift(); };
  const sunDisc = new THREE.Mesh(new THREE.SphereGeometry(1.6, 16, 12), new THREE.MeshBasicMaterial({ color: 0xfff6dc })); scene.add(sunDisc); W.sunDisc = sunDisc;
  { const gc = document.createElement('canvas'); gc.width = gc.height = 128; const x = gc.getContext('2d'), gr = x.createRadialGradient(64, 64, 4, 64, 64, 64); gr.addColorStop(0, 'rgba(255,245,215,1)'); gr.addColorStop(0.2, 'rgba(255,220,160,0.55)'); gr.addColorStop(1, 'rgba(255,180,90,0)'); x.fillStyle = gr; x.fillRect(0, 0, 128, 128);
    const halo = new THREE.Sprite(new THREE.SpriteMaterial({ map: new THREE.CanvasTexture(gc), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true })); halo.scale.set(16, 16, 1); sunDisc.add(halo); halo.scale.set(10, 10, 1); }
  // rings (the ring world)
  const ringU = { time: { value: 0 } };
  const ring = new THREE.Mesh(new THREE.RingGeometry(1.45, 2.25, 96, 1), new THREE.ShaderMaterial({ uniforms: ringU, transparent: true, depthWrite: false, side: THREE.DoubleSide,
    vertexShader: 'varying vec3 vP; void main(){ vP = position; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }',
    fragmentShader: 'varying vec3 vP; void main(){ float r = length(vP.xy); float b = 0.5 + 0.5 * sin(r * 40.0) * sin(r * 13.0); float a = smoothstep(1.45, 1.55, r) * smoothstep(2.25, 2.1, r) * (0.35 + 0.5 * b); gl_FragColor = vec4(mix(vec3(0.85,0.8,0.7), vec3(0.7,0.85,1.0), b), a * 0.8); }' }));
  ring.rotation.x = Math.PI / 2 - 0.12; ring.visible = false; root.add(ring);
  // aurora ribbons
  const aurU = { time: { value: 0 }, amt: { value: 0 }, sun: { value: W.sun } };
  const aurMat = new THREE.ShaderMaterial({ uniforms: aurU, vertexShader: CLOUD_VS, fragmentShader: AUR_FS, transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.AdditiveBlending });
  const auroras = [1, -1].map(s => { const m = new THREE.Mesh(new THREE.CylinderGeometry(0.36, 0.36, 0.09, 64, 1, true), aurMat); m.position.y = s * 0.96; root.add(m); return m; });
  // instanced plants and rocks
  const TG = treeGeos(THREE), lam = new THREE.MeshLambertMaterial({ vertexColors: true });
  // on the ground, plants right in front of the camera dissolve (so the walker is never hidden behind a tree)
  W.camCut = { value: 0 };
  lam.onBeforeCompile = sh => { sway(sh, '0.035'); sh.uniforms.camCut = W.camCut;
    sh.vertexShader = 'varying float vCamD;\n' + sh.vertexShader.replace('#include <project_vertex>', '#include <project_vertex>\n vCamD = -mvPosition.z;');
    sh.fragmentShader = 'uniform float camCut; varying float vCamD;\n' + sh.fragmentShader.replace('void main() {', 'void main() {\n if (vCamD < camCut) discard;'); };
  const MAXT = Math.round(1400 * W.quality);
  const inst = {}; for (const k of ['pine', 'oak', 'palm', 'bloom', 'bush', 'rock']) { const m = new THREE.InstancedMesh(TG[k], lam, k === 'rock' ? 400 : MAXT); m.setColorAt(0, new THREE.Color(1, 1, 1)); m.count = 0; m.frustumCulled = false; root.add(m); inst[k] = m; }
  // ground cover (grass tufts and flowers: crossed cards with a painted texture) and soft shadow blobs, only around the walker
  const cardTex = (() => { const c = document.createElement('canvas'); c.width = 128; c.height = 64; const x = c.getContext('2d'), r = S.rng(4);
    for (let i = 0; i < 70; i++) { const bx = 2 + r() * 60, h = 28 + r() * 34, lean = (r() - 0.5) * 16; x.strokeStyle = 'hsl(' + (80 + r() * 30) + ',' + (30 + r() * 22) + '%,' + (24 + r() * 20) + '%)'; x.lineWidth = 1.2 + r() * 1.3; x.beginPath(); x.moveTo(bx, 64); x.quadraticCurveTo(bx + lean * 0.3, 64 - h * 0.6, bx + lean, 64 - h); x.stroke(); }
    for (let i = 0; i < 26; i++) { const bx = 66 + r() * 58, h = 20 + r() * 30; x.strokeStyle = 'hsl(100,40%,35%)'; x.lineWidth = 1.5; x.beginPath(); x.moveTo(bx, 64); x.lineTo(bx + (r() - 0.5) * 6, 64 - h); x.stroke();
      if (i % 2 === 0) { x.fillStyle = ['#ffe36b', '#ffffff', '#f49ac0', '#b9a2ff', '#ff8a5c'][i % 5]; x.beginPath(); x.arc(bx + (r() - 0.5) * 6, 64 - h, 3 + r() * 2.5, 0, 6.3); x.fill(); } }
    const t = new THREE.CanvasTexture(c); return t; })();
  const cardGeo = (u0) => { const g = new THREE.BufferGeometry(), P = [], U = [], N = [];
    for (const a of [0, Math.PI / 2]) { const cx = Math.cos(a) * 0.5, cz = Math.sin(a) * 0.5; P.push(-cx, 0, -cz, cx, 0, cz, cx, 1, cz, -cx, 0, -cz, cx, 1, cz, -cx, 1, -cz); U.push(u0, 0, u0 + 0.5, 0, u0 + 0.5, 1, u0, 0, u0 + 0.5, 1, u0, 1); for (let k = 0; k < 6; k++) N.push(0, 1, 0); }
    g.setAttribute('position', new THREE.Float32BufferAttribute(P, 3)); g.setAttribute('uv', new THREE.Float32BufferAttribute(U, 2)); g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3)); return g; };
  W.windT = { value: 0 };
  const sway = (sh, amp) => { sh.uniforms.windT = W.windT; sh.vertexShader = 'uniform float windT;\n' + sh.vertexShader.replace('#include <begin_vertex>', '#include <begin_vertex>\n#ifdef USE_INSTANCING\n float sw = sin(windT * 1.7 + instanceMatrix[3].x * 90.0 + instanceMatrix[3].z * 70.0) + 0.5 * sin(windT * 3.1 + instanceMatrix[3].y * 120.0);\n transformed.x += sw * ' + amp + ' * max(transformed.y - 0.3, 0.0); transformed.z += sw * ' + amp + ' * 0.5 * max(transformed.y - 0.3, 0.0);\n#endif'); };
  const cardMat = new THREE.MeshLambertMaterial({ map: cardTex, alphaTest: 0.45, side: THREE.DoubleSide });
  // light both faces of a card the same (lambert would darken the back faces)
  cardMat.onBeforeCompile = sh => { sway(sh, '0.12'); sh.vertexShader = sh.vertexShader.replace('#include <lights_lambert_vertex>', '#include <lights_lambert_vertex>\n#ifdef DOUBLE_SIDED\n vLightBack = vLightFront;\n#ifdef USE_LIGHTMAP\n#endif\n#endif'); };
  const NG = W.quality >= 1 ? 2600 : 300;
  const grass = new THREE.InstancedMesh(cardGeo(0), cardMat, NG), flowers = new THREE.InstancedMesh(cardGeo(0.5), cardMat, Math.round(NG / 3));
  for (const m of [grass, flowers]) { m.setColorAt(0, new THREE.Color(1, 1, 1)); m.count = 0; m.frustumCulled = false; root.add(m); }
  const blobTex = (() => { const c = document.createElement('canvas'); c.width = c.height = 64; const x = c.getContext('2d'), g = x.createRadialGradient(32, 32, 2, 32, 32, 31); g.addColorStop(0, 'rgba(0,0,0,0.55)'); g.addColorStop(0.6, 'rgba(0,0,0,0.25)'); g.addColorStop(1, 'rgba(0,0,0,0)'); x.fillStyle = g; x.fillRect(0, 0, 64, 64); return new THREE.CanvasTexture(c); })();
  const blobs = new THREE.InstancedMesh(new THREE.PlaneGeometry(1, 1).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ map: blobTex, transparent: true, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 }), 900);
  blobs.count = 0; blobs.frustumCulled = false; blobs.renderOrder = 1; root.add(blobs);
  // buildings
  const bGeo = merge(THREE, [part(THREE, new THREE.BoxGeometry(0.5, 1, 0.5), 0xe8e2d6, M4(THREE, 0, 0.5, 0, 1)), part(THREE, new THREE.BoxGeometry(0.56, 0.08, 0.56), 0x8fa3b8, M4(THREE, 0, 1.0, 0, 1))]);
  const builds = new THREE.InstancedMesh(bGeo, lam, 420); builds.setColorAt(0, new THREE.Color(1, 1, 1)); builds.count = 0; builds.frustumCulled = false; root.add(builds);
  // creatures and markers
  const creatures = new THREE.Group(); root.add(creatures); const marks = new THREE.Group(); root.add(marks);
  const beamU = { col: { value: new THREE.Color(1, 0.92, 0.55) }, time: { value: 0 } };
  const beamMat = new THREE.ShaderMaterial({ uniforms: beamU, vertexShader: BEAM_VS, fragmentShader: BEAM_FS, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, side: THREE.DoubleSide });
  // brush cursor
  const cursor = new THREE.Mesh(new THREE.RingGeometry(0.85, 1, 40), new THREE.MeshBasicMaterial({ color: 0xffffff, transparent: true, opacity: 0.8, depthTest: false, side: THREE.DoubleSide }));
  cursor.visible = false; cursor.renderOrder = 9; root.add(cursor);
  // fx particles
  const FXN = 400, fxPos = new Float32Array(FXN * 3), fxCol = new Float32Array(FXN * 3), fxGeo = new THREE.BufferGeometry();
  fxGeo.setAttribute('position', new THREE.BufferAttribute(fxPos, 3)); fxGeo.setAttribute('color', new THREE.BufferAttribute(fxCol, 3));
  const fxPts = new THREE.Points(fxGeo, new THREE.PointsMaterial({ size: 5, sizeAttenuation: false, vertexColors: true, transparent: true, depthWrite: false, blending: THREE.AdditiveBlending }));
  fxPts.frustumCulled = false; root.add(fxPts); const fx = [];
  Object.assign(W, { terrain, water, atmo, clouds, ring, auroras, inst, builds, creatures, marks, cursor, tU, wU, aU, cU, ringU, aurU, beamU, beamMat, cCv, cTex, lam, fxPts, fx, fxPos, fxCol });

  // ---------- terrain build ----------
  let I = null, pos = null, colA = null, glowA = null, matA = null, det = null, hk = null, wI = null, wPos = null, wDep = null, wIce = null, wh = null, bucket = null, vf = null;
  function setLevel(l) {
    W.level = l; I = ico(l); pos = new Float32Array(I.nv * 3); colA = new Float32Array(I.nv * 3); glowA = new Float32Array(I.nv); hk = new Float32Array(I.nv);
    det = new Float32Array(I.nv); for (let v = 0; v < I.nv; v++) det[v] = detail(I.dir[v * 3], I.dir[v * 3 + 1], I.dir[v * 3 + 2]);
    tGeo.setIndex(new THREE.BufferAttribute(I.idx, 1)); tGeo.setAttribute('position', new THREE.BufferAttribute(pos, 3)); tGeo.setAttribute('col', new THREE.BufferAttribute(colA, 3)); tGeo.setAttribute('glow', new THREE.BufferAttribute(glowA, 1)); matA = new Float32Array(I.nv * 2); tGeo.setAttribute('mat', new THREE.BufferAttribute(matA, 2));
    tGeo.setAttribute('normal', new THREE.BufferAttribute(new Float32Array(I.nv * 3), 3));
    // buckets (lat/lon) of vertices, and the faces around each vertex: for groundAt()
    bucket = Array.from({ length: 72 * 36 }, () => []);
    for (let v = 0; v < I.nv; v++) { const [a, o] = llOf(I.dir[v * 3], I.dir[v * 3 + 1], I.dir[v * 3 + 2]); bucket[bk(a, o)].push(v); }
    vf = Array.from({ length: I.nv }, () => []); for (let f = 0; f < I.nf; f++) for (let q = 0; q < 3; q++) vf[I.idx[f * 3 + q]].push(f);
    wI = ico(Math.max(4, l - 1)); wPos = new Float32Array(wI.nv * 3); wDep = new Float32Array(wI.nv); wIce = new Float32Array(wI.nv); wh = new Float32Array(wI.nv);
    wGeo.setAttribute('position', new THREE.BufferAttribute(wPos, 3)); wGeo.setAttribute('dep', new THREE.BufferAttribute(wDep, 1)); wGeo.setAttribute('ice', new THREE.BufferAttribute(wIce, 1));
    W.geoV = -1;
  }
  const bk = (a, o) => clamp(Math.floor((90 - a) / 5), 0, 35) * 72 + (((Math.floor((o + 180) / 5)) % 72) + 72) % 72;
  W.setQuality = qy => { W.quality = qy; W.tU.hq.value = qy >= 1 ? 1 : 0; W.terrain.material.defines = qy >= 1 ? { HQ: 1 } : {}; W.terrain.material.needsUpdate = true; W.milky.visible = qy >= 1; };
  W.setLevel = l => { if (l !== W.level || !I) { setLevel(l); if (W.st) rebuild(true); } };
  function heightKm(st, x, y, z, d) { const [a, o] = llOf(x, y, z), e = sampleHi(st.elev, a, o) - W.fluid.datum; return e + (e > 0 ? 0.55 : 0.25) * d * (st.wonder === 'moon' ? 1.6 : 1); }
  W.heightKm = (x, y, z) => heightKm(W.st, x, y, z, detail(x, y, z));
  function rebuild(force) {
    const st = W.st; if (!st) return;
    W.R = radiusOf(st); const R = W.R; W.fluid = fluidOf(st);
    for (let v = 0; v < I.nv; v++) {
      const x = I.dir[v * 3], y = I.dir[v * 3 + 1], z = I.dir[v * 3 + 2], h = heightKm(st, x, y, z, det[v]);
      hk[v] = h; const r = R * (1 + hv(h)); pos[v * 3] = x * r; pos[v * 3 + 1] = y * r; pos[v * 3 + 2] = z * r;
    }
    tGeo.attributes.position.needsUpdate = true; tGeo.computeVertexNormals(); tGeo.computeBoundingSphere();
    // the fluid shell: only where it covers or nearly covers the ground
    const fl = W.fluid.kind !== 'none', wr = R; const ix = [];
    for (let v = 0; v < wI.nv; v++) { const x = wI.dir[v * 3], y = wI.dir[v * 3 + 1], z = wI.dir[v * 3 + 2]; wh[v] = heightKm(st, x, y, z, detail(x, y, z)); wDep[v] = -wh[v]; wPos[v * 3] = x * wr; wPos[v * 3 + 1] = y * wr; wPos[v * 3 + 2] = z * wr; }
    if (fl) for (let f = 0; f < wI.nf; f++) { const a = wI.idx[f * 3], b = wI.idx[f * 3 + 1], c = wI.idx[f * 3 + 2]; if (Math.min(wh[a], wh[b], wh[c]) < 0.25) ix.push(a, b, c); }
    wGeo.setIndex(ix); wGeo.attributes.position.needsUpdate = true; wGeo.attributes.dep.needsUpdate = true;
    water.visible = fl && ix.length > 0;
    W.geoV = st.geoV; recolor(); placeFlora(); placeMarks();
  }
  function recolor(list) {
    const st = W.st; if (!st) return;
    const ctx = { season: W.seasonK || 0, lava: W.fluid.kind === 'lava', water: W.fluid.kind === 'water', plants: st.life.st >= 5, young: st.t < 1.2e9 && st.life.st < 5, wet: true, civ: !!(st.civ && st.civ.on) };
    const out = [0, 0, 0];
    const nL = list ? list.length : I.nv;
    for (let li = 0; li < nL; li++) {
      const v = list ? list[li] : li;
      const x = I.dir[v * 3], y = I.dir[v * 3 + 1], z = I.dir[v * 3 + 2], [a, o] = llOf(x, y, z);
      const nx = tGeo.attributes.normal.array[v * 3], ny = tGeo.attributes.normal.array[v * 3 + 1], nz = tGeo.attributes.normal.array[v * 3 + 2];
      const slope = clamp((1 - (nx * x + ny * y + nz * z)) * 9, 0, 1);
      glowA[v] = groundColor(st, out, hk[v], a, o, x, y, z, slope, 0, ctx); matA[v * 2] = lastIce; matA[v * 2 + 1] = ctx.lava && hk[v] > -0.2 ? 1 - sstep(0.6, 2.5, hk[v]) : 0;
      colA[v * 3] = out[0]; colA[v * 3 + 1] = out[1]; colA[v * 3 + 2] = out[2];
    }
    tGeo.attributes.col.needsUpdate = true; tGeo.attributes.glow.needsUpdate = true; tGeo.attributes.mat.needsUpdate = true;
    if (list) return;
    // sea ice
    if (W.fluid.kind === 'water') { for (let v = 0; v < wI.nv; v++) { const [a, o] = llOf(wI.dir[v * 3], wI.dir[v * 3 + 1], wI.dir[v * 3 + 2]); wIce[v] = sstep(0.35, 0.8, sampleCell(st.iceO, a, o)); } wGeo.attributes.ice.needsUpdate = true; }
    W.colT = st.t;
  }
  W.recolor = recolor;
  // a brush dab: rebuild only the ground around it now (fast at any terrain level); the whole planet a moment later
  W.dab = (lat, lon, rDeg) => {
    const st = W.st; if (!st || !I) return;
    const c = S.dirOf(lat, lon), cmin = Math.cos(rDeg * 2.9 * D2R), R = W.R, list = [];
    for (let v = 0; v < I.nv; v++) if (I.dir[v * 3] * c[0] + I.dir[v * 3 + 1] * c[1] + I.dir[v * 3 + 2] * c[2] > cmin) list.push(v);
    for (const v of list) { const x = I.dir[v * 3], y = I.dir[v * 3 + 1], z = I.dir[v * 3 + 2], h = heightKm(st, x, y, z, det[v]); hk[v] = h; const r = R * (1 + hv(h)); pos[v * 3] = x * r; pos[v * 3 + 1] = y * r; pos[v * 3 + 2] = z * r; }
    const N = tGeo.attributes.normal.array, ix = I.idx;
    for (const v of list) { let nx = 0, ny = 0, nz = 0; for (const f of vf[v]) { const A = ix[f * 3] * 3, B = ix[f * 3 + 1] * 3, Cc = ix[f * 3 + 2] * 3;
        const ux = pos[B] - pos[A], uy = pos[B + 1] - pos[A + 1], uz = pos[B + 2] - pos[A + 2], wx = pos[Cc] - pos[A], wy = pos[Cc + 1] - pos[A + 1], wz = pos[Cc + 2] - pos[A + 2];
        nx += uy * wz - uz * wy; ny += uz * wx - ux * wz; nz += ux * wy - uy * wx; }
      const l = Math.hypot(nx, ny, nz) || 1; N[v * 3] = nx / l; N[v * 3 + 1] = ny / l; N[v * 3 + 2] = nz / l; }
    tGeo.attributes.position.needsUpdate = true; tGeo.attributes.normal.needsUpdate = true;
    recolor(list);
    W.geoV = st.geoV; W.fullDue = 1.2;
  };

  // the exact height of the drawn ground under a direction (ray against the triangles around the nearest vertex)
  const e1 = [0, 0, 0], e2 = [0, 0, 0];
  function groundAt(dx, dy, dz) {
    if (!I) return W.R;
    const [a, o] = llOf(dx, dy, dz); let best = -1, bd = -2;
    const bj = clamp(Math.floor((90 - a) / 5), 0, 35), bi = Math.floor((o + 180) / 5);
    for (let dj = -1; dj <= 1; dj++) { const j = bj + dj; if (j < 0 || j > 35) continue; for (let di = -1; di <= 1; di++) { const L = bucket[j * 72 + (((bi + di) % 72) + 72) % 72]; for (let q = 0; q < L.length; q++) { const v = L[q], d = I.dir[v * 3] * dx + I.dir[v * 3 + 1] * dy + I.dir[v * 3 + 2] * dz; if (d > bd) { bd = d; best = v; } } } }
    if (Math.abs(a) > 84) { // near the poles: widen the search
      for (const j of a > 0 ? [0, 1] : [34, 35]) for (let i = 0; i < 72; i++) for (const v of bucket[j * 72 + i]) { const d = I.dir[v * 3] * dx + I.dir[v * 3 + 1] * dy + I.dir[v * 3 + 2] * dz; if (d > bd) { bd = d; best = v; } }
    }
    for (const f of vf[best]) { // Möller–Trumbore from the centre
      const A = I.idx[f * 3] * 3, B = I.idx[f * 3 + 1] * 3, Cc = I.idx[f * 3 + 2] * 3;
      e1[0] = pos[B] - pos[A]; e1[1] = pos[B + 1] - pos[A + 1]; e1[2] = pos[B + 2] - pos[A + 2]; e2[0] = pos[Cc] - pos[A]; e2[1] = pos[Cc + 1] - pos[A + 1]; e2[2] = pos[Cc + 2] - pos[A + 2];
      const px = dy * e2[2] - dz * e2[1], py = dz * e2[0] - dx * e2[2], pz = dx * e2[1] - dy * e2[0], det0 = e1[0] * px + e1[1] * py + e1[2] * pz;
      if (Math.abs(det0) < 1e-12) continue;
      const inv = 1 / det0, tx = -pos[A], ty = -pos[A + 1], tz = -pos[A + 2], u = (tx * px + ty * py + tz * pz) * inv; if (u < -1e-4 || u > 1 + 1e-4) continue;
      const qx = ty * e1[2] - tz * e1[1], qy = tz * e1[0] - tx * e1[2], qz = tx * e1[1] - ty * e1[0], w = (dx * qx + dy * qy + dz * qz) * inv; if (w < -1e-4 || u + w > 1 + 1e-4) continue;
      return (e2[0] * qx + e2[1] * qy + e2[2] * qz) * inv;
    }
    return Math.hypot(pos[best * 3], pos[best * 3 + 1], pos[best * 3 + 2]);
  }
  W.groundAt = groundAt;
  W.fluidR = () => (W.fluid.kind === 'none' ? 0 : W.R);
  W.hasFluid = () => W.fluid.kind !== 'none' && water.visible;

  // ---------- plants, rocks, buildings ----------
  const m4 = new THREE.Matrix4(), q4 = new THREE.Quaternion(), v3 = new THREE.Vector3(), s3 = new THREE.Vector3(), upY = new THREE.Vector3(0, 1, 0), col3 = new THREE.Color();
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]], norm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  function placeAt(mesh, i, x, y, z, r, scale, spin) {
    v3.set(x, y, z); q4.setFromUnitVectors(upY, v3); if (spin) { const qs = new THREE.Quaternion().setFromAxisAngle(upY, spin); q4.multiply(qs); }
    s3.set(scale, scale, scale); m4.compose(v3.multiplyScalar(r), q4, s3); mesh.setMatrixAt(i, m4);
  }
  function hash(i, s) { let h = Math.imul(i ^ 0x9e3779b9, 0x85ebca6b) ^ Math.imul(s, 0xc2b2ae35); h ^= h >>> 13; h = Math.imul(h, 0x27d4eb2f); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
  function placeFlora() {
    const st = W.st, R = W.R; const cnt = { pine: 0, oak: 0, palm: 0, bloom: 0, bush: 0, rock: 0 };
    const plants = st.life.st >= 5 && W.fluid.kind !== 'lava', max = inst.pine.instanceMatrix.count;
    const F = W.focus, fcos = 0.45, lvl = Math.min(1, Math.pow(4, 6 - W.level)), dens = (F ? 1.3 : 1) * lvl; // on the ground: only what is around the walker, but thicker
    for (const k in inst) inst[k].geometry = F ? TG[k] : TG.far[k];
    const tScale = R * (F ? 0.017 : 0.022);
    let nbl = 0;
    const blob = (dx, dy, dz, r, sc) => { if (!F || nbl >= 900 || W.quality < 1) return; v3.set(dx, dy, dz); q4.setFromUnitVectors(upY, v3); s3.set(sc, 1, sc); m4.compose(v3.multiplyScalar(r + R * 0.0006), q4, s3); blobs.setMatrixAt(nbl++, m4); };
    for (let v = 0; v < I.nv; v++) {
      const hsh = hash(v, 7), h = hk[v]; if (h < 0.06) continue;
      const x = I.dir[v * 3], y = I.dir[v * 3 + 1], z = I.dir[v * 3 + 2];
      if (F && x * F[0] + y * F[1] + z * F[2] < fcos) continue;
      // jitter inside the neighbourhood, then sit exactly on the ground
      const jj = 0.012 * Math.sqrt(lvl), jx = x + (hash(v, 11) - 0.5) * jj, jy = y + (hash(v, 12) - 0.5) * jj, jz = z + (hash(v, 13) - 0.5) * jj, l = Math.hypot(jx, jy, jz), dx = jx / l, dy = jy / l, dz = jz / l;
      if (plants) {
        const [a, o] = llOf(x, y, z), veg = sampleCell(st.veg, a, o), T = rowT(st, a) - 6.5 * h * 0.8, ice = sampleCell(st.iceL, a, o);
        if (ice < 0.4 && hsh < veg * 0.55 * W.quality * dens * (F || W.quality >= 1 ? 1 : 0.45)) {
          // species by climate: conifers in the cold, palms by warm shores, bushes in dry or open land, broadleaf elsewhere
          const k = st.wonder === 'bloom' && hash(v, 3) < 0.45 ? 'bloom' : veg < 0.32 && hash(v, 14) < 0.7 ? 'bush' : T < 5 ? 'pine' : T > 22 && h < 0.7 ? (hash(v, 15) < 0.6 ? 'palm' : 'oak') : hash(v, 5) < 0.3 && T < 12 ? 'pine' : hash(v, 16) < 0.18 ? 'bush' : 'oak';
          if (cnt[k] < max) { const g = groundAt(dx, dy, dz), sc = tScale * (0.7 + hash(v, 9) * 0.7) * (k === 'bush' ? 0.9 : 1);
            placeAt(inst[k], cnt[k], dx, dy, dz, g - R * 0.002, sc, hash(v, 4) * 6.28);
            col3.setRGB(0.82 + hash(v, 6) * 0.3, 0.84 + hash(v, 17) * 0.28, 0.78 + hash(v, 18) * 0.25); if (T < 10 && k === 'oak' && hash(v, 19) < 0.3) col3.setRGB(1.25, 0.9, 0.55); // a few autumn crowns
            inst[k].setColorAt(cnt[k], col3); cnt[k]++; blob(dx, dy, dz, g, sc * (k === 'bush' ? 0.9 : 1.1)); }
          continue;
        }
      }
      if (cnt.rock < 400 && hsh > 1 - (0.015 + (st.wonder === 'moon' ? 0.02 : 0) + (F ? 0.02 : 0)) * lvl) { const g = groundAt(dx, dy, dz), sc = R * 0.012 * (0.5 + hash(v, 8)); placeAt(inst.rock, cnt.rock, dx, dy, dz, g - R * 0.002, sc, hash(v, 2) * 6.28); col3.setHSL(0.08, 0.1, (W.fluid.kind === 'lava' ? 0.2 : 0.45) + hash(v, 1) * 0.25); inst.rock.setColorAt(cnt.rock, col3); cnt.rock++; blob(dx, dy, dz, g, sc * 1.2); }
    }
    for (const k in inst) { inst[k].count = cnt[k]; inst[k].instanceMatrix.needsUpdate = true; if (inst[k].instanceColor) inst[k].instanceColor.needsUpdate = true; }
    // grass and flowers, scattered around the walker
    let ng = 0, nf = 0;
    if (F && plants) {
      const r = S.rng(((F[0] * 1e4) ^ (F[2] * 3e4)) >>> 0), ax = Math.abs(F[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0];
      const e1 = norm(cross(ax, F)), e2 = cross(F, e1);
      const gMax = W.quality >= 1 ? grass.instanceMatrix.count : 140, fMax = W.quality >= 1 ? flowers.instanceMatrix.count : 40;
      for (let i = 0; i < gMax * 1.6 && (ng < gMax || nf < fMax); i++) {
        const ang = r() * 6.283, rad = Math.sqrt(r()) * 0.24, c = Math.cos(rad), sn = Math.sin(rad);
        const dx = F[0] * c + (e1[0] * Math.cos(ang) + e2[0] * Math.sin(ang)) * sn, dy = F[1] * c + (e1[1] * Math.cos(ang) + e2[1] * Math.sin(ang)) * sn, dz = F[2] * c + (e1[2] * Math.cos(ang) + e2[2] * Math.sin(ang)) * sn;
        const [a, o] = llOf(dx, dy, dz), veg = sampleCell(st.veg, a, o), ice = sampleCell(st.iceL, a, o); if (veg < 0.08 || ice > 0.35 || r() > veg * 1.6) continue;
        const g = groundAt(dx, dy, dz); if (g < R * 1.0008) continue;
        const fl = r() < 0.22 + (st.wonder === 'bloom' ? 0.3 : 0), m = fl ? flowers : grass, n = fl ? nf : ng; if (n >= (fl ? fMax : gMax)) continue;
        placeAt(m, n, dx, dy, dz, g - R * 0.0006, R * (fl ? 0.0042 : 0.0048) * (0.7 + r() * 0.6), r() * 6.28);
        const T = rowT(st, a); col3.setRGB(0.85 + r() * 0.2 + (T > 20 ? 0.15 : 0), 0.9 + r() * 0.15, 0.75 + r() * 0.15 - (T > 20 ? 0.15 : 0)); m.setColorAt(n, col3);
        if (fl) nf++; else ng++;
      }
    }
    grass.count = ng; flowers.count = nf; for (const m of [grass, flowers]) { m.instanceMatrix.needsUpdate = true; if (m.instanceColor) m.instanceColor.needsUpdate = true; }
    blobs.count = nbl; blobs.instanceMatrix.needsUpdate = true;
    // buildings around the cities
    let nb = 0;
    if (st.civ && st.civ.on) {
      const cs = S.cities(st);
      cs.forEach((c, ci) => { const n = Math.round(8 + 40 * c.pop); for (let i = 0; i < n && nb < 420; i++) {
        const a = c.lat + (hash(ci * 97 + i, 21) - 0.5) * 9 * Math.sqrt(hash(ci * 97 + i, 23)), o = c.lon + (hash(ci * 97 + i, 22) - 0.5) * 9 * Math.sqrt(hash(ci * 97 + i, 24)) / Math.max(0.3, Math.cos(a * D2R));
        const d = S.dirOf(a, o), g = groundAt(d[0], d[1], d[2]); if (g < W.R * 1.0005) continue;
        const ht = 0.6 + hash(nb, 25) * 2.2 * (0.4 + c.pop) * (1 + st.civ.tech / 60);
        v3.set(d[0], d[1], d[2]); q4.setFromUnitVectors(upY, v3); s3.set(R * 0.011, R * 0.008 * ht, R * 0.011); m4.compose(v3.multiplyScalar(g - R * 0.001), q4, s3); builds.setMatrixAt(nb, m4);
        col3.setHSL(0.1 + hash(nb, 26) * 0.5, c.clean ? 0.35 : 0.08, c.clean ? 0.82 : 0.75); builds.setColorAt(nb, col3); nb++; } });
    }
    builds.count = nb; builds.instanceMatrix.needsUpdate = true; if (builds.instanceColor) builds.instanceColor.needsUpdate = true;
  }
  W.placeFlora = placeFlora;

  // ---------- creatures (built from parts, a herd per species) ----------
  const spCache = new Map();
  function creatureGeo(sp) {
    const key = sp.i + (sp.sea ? 's' : 'l'); if (spCache.has(key)) return spCache.get(key);
    const c1 = new THREE.Color().setHSL(sp.hue, 0.55, 0.55).getHex(), c2 = new THREE.Color().setHSL(sp.hue2, 0.6, 0.72).getHex(), dark = 0x221a18;
    const ps = [];
    if (sp.sea) { // a fish-like swimmer that leaps
      ps.push(part(THREE, new THREE.SphereGeometry(0.4, 8, 6), c1, M4(THREE, 0, 0, 0, 1, 0.55, 0.38)), part(THREE, new THREE.ConeGeometry(0.22, 0.4, 4), c2, M4(THREE, -0.48, 0, 0, 1, 1, 0.3, 0, Math.PI / 2)), part(THREE, new THREE.SphereGeometry(0.05, 5, 4), dark, M4(THREE, 0.3, 0.07, 0.12, 1)), part(THREE, new THREE.SphereGeometry(0.05, 5, 4), dark, M4(THREE, 0.3, 0.07, -0.12, 1)));
    } else {
      const bl = [1, 1.35, 0.85][sp.body], bh = [0.8, 0.6, 1.0][sp.body], legH = sp.legs ? 0.35 : 0.05, by = legH + 0.25 * bh;
      ps.push(part(THREE, new THREE.SphereGeometry(0.38, 9, 7), c1, M4(THREE, 0, by, 0, bl, bh, 0.8)));
      const hx = 0.34 * bl + 0.12, hy = by + 0.18 + sp.neck * 0.25;
      if (sp.neck > 1) ps.push(part(THREE, new THREE.CylinderGeometry(0.08, 0.11, sp.neck * 0.4, 6), c1, M4(THREE, hx - 0.08, by + sp.neck * 0.18, 0, 1, 1, 1, 0, -0.5)));
      ps.push(part(THREE, new THREE.SphereGeometry(0.2, 8, 6), c2, M4(THREE, hx + (sp.neck > 1 ? 0.12 : 0), hy, 0, 1)));
      ps.push(part(THREE, new THREE.SphereGeometry(0.05, 5, 4), dark, M4(THREE, hx + 0.17, hy + 0.06, 0.09, 1)), part(THREE, new THREE.SphereGeometry(0.05, 5, 4), dark, M4(THREE, hx + 0.17, hy + 0.06, -0.09, 1)));
      if (sp.horn) for (let k = 0; k < sp.horn; k++) ps.push(part(THREE, new THREE.ConeGeometry(0.05, 0.22, 5), 0xf2e8d0, M4(THREE, hx + 0.05, hy + 0.2, (k - (sp.horn - 1) / 2) * 0.12, 1, 1, 1, 0, -0.3)));
      const legs = sp.legs || 0;
      for (let k = 0; k < legs; k++) { const fx = legs === 2 ? 0 : ((k >> 1) / (legs / 2 - 1 || 1) - 0.5) * 0.5 * bl, fz = (k % 2 ? 1 : -1) * 0.18; ps.push(part(THREE, new THREE.CylinderGeometry(0.05, 0.06, legH + 0.1, 5), c2, M4(THREE, fx, legH / 2, fz, 1))); }
      if (sp.wing) for (const s of [1, -1]) ps.push(part(THREE, new THREE.BoxGeometry(0.42, 0.03, 0.3), c2, M4(THREE, -0.05, by + 0.15, s * 0.36, 1, 1, 1, s * 0.5, 0)));
      if (sp.spines) for (let k = 0; k < 4; k++) ps.push(part(THREE, new THREE.ConeGeometry(0.05, 0.18, 4), c2, M4(THREE, (k / 3 - 0.5) * 0.5 * bl, by + 0.32 * bh, 0, 1)));
      if (sp.stripes) for (let k = 0; k < 3; k++) ps.push(part(THREE, new THREE.TorusGeometry(0.3, 0.03, 4, 10), c2, M4(THREE, (k / 2 - 0.5) * 0.4 * bl, by, 0, 1, bh * 1.3, 1, 0, Math.PI / 2)));
      ps.push(part(THREE, new THREE.ConeGeometry(0.08, 0.3 + sp.tail * 0.3, 5), c1, M4(THREE, -0.4 * bl - 0.12, by + 0.05, 0, 1, 1, 1, 0, Math.PI / 2 + 0.4)));
      if (sp.glow) ps.push(part(THREE, new THREE.SphereGeometry(0.07, 6, 4), 0xfff6a0, M4(THREE, hx + 0.1, hy + 0.28, 0, 1)));
    }
    const g = merge(THREE, ps); spCache.set(key, g); return g;
  }
  W.creatureGeo = creatureGeo;
  let herds = []; const herdMat = new THREE.MeshLambertMaterial({ vertexColors: true });
  function placeCreatures() {
    for (const h of herds) { creatures.remove(h.mesh); h.mesh.dispose && h.mesh.dispose(); }
    herds = [];
    if (!W.st) return;
    for (const s of S.sites(W.st)) {
      if (s.k !== 'sp' && s.k !== 'sea') continue;
      const n = s.sp.herd, mesh = new THREE.InstancedMesh(creatureGeo(s.sp), herdMat, n); mesh.frustumCulled = false; creatures.add(mesh);
      herds.push({ s, mesh, n, ph: hash(s.sp.i, 3) * 10 });
    }
    W.herds = herds; creatures.visible = !!W.focus;
  }
  W.placeCreatures = placeCreatures;
  const vA = new THREE.Vector3(), vB = new THREE.Vector3();
  function animCreatures(t) {
    const R = W.R;
    for (const h of herds) {
      const c = S.dirOf(h.s.lat, h.s.lon);
      for (let i = 0; i < h.n; i++) {
        const ph = h.ph + i * 2.1, wan = 1.6 + i * 0.7;
        const a = h.s.lat + Math.sin(t * 0.13 + ph) * wan + (i - h.n / 2) * 0.8, o = h.s.lon + Math.cos(t * 0.11 + ph * 1.3) * wan / Math.max(0.3, Math.cos(h.s.lat * D2R));
        const d = S.dirOf(a, o); let r;
        if (h.s.sp.sea) { const leap = Math.max(0, Math.sin(t * 1.4 + ph * 3)); r = R * (1 + 0.01 * leap * leap - 0.004); }
        else { const g = groundAt(d[0], d[1], d[2]); if (W.fluid.kind === 'water' && g < W.R) { r = W.R; } else r = g + R * 0.0035 * Math.abs(Math.sin(t * 5 + ph)); }
        // face along the wander direction
        const d2 = S.dirOf(a + Math.cos(t * 0.13 + ph) * 0.13, o - Math.sin(t * 0.11 + ph * 1.3) * 0.11);
        vA.set(d[0], d[1], d[2]); vB.set(d2[0] - d[0], d2[1] - d[1], d2[2] - d[2]); vB.addScaledVector(vA, -vB.dot(vA)).normalize();
        const m = new THREE.Matrix4(); const zA = new THREE.Vector3().crossVectors(vB, vA).normalize(); m.makeBasis(vB, vA, zA);
        const sc = R * 0.012 * h.s.sp.size; m.scale(new THREE.Vector3(sc, sc, sc)); m.setPosition(vA.x * r, vA.y * r, vA.z * r);
        h.mesh.setMatrixAt(i, m);
      }
      h.mesh.instanceMatrix.needsUpdate = true;
    }
  }

  // ---------- markers: what is there to find ----------
  const MK = {};
  const mat = (c, e) => new THREE.MeshLambertMaterial({ color: c, emissive: e || 0x000000 });
  function markObj(s) {
    const g = new THREE.Group(), k = s.k, add = (geo, m, x, y, z, sx, sy, sz, rx, rz) => { const o = new THREE.Mesh(geo, m); o.position.set(x || 0, y || 0, z || 0); o.scale.set(sx || 1, sy == null ? sx || 1 : sy, sz == null ? sx || 1 : sz); o.rotation.set(rx || 0, 0, rz || 0); g.add(o); return o; };
    if (k === 'cry' || k === 'ice') { const m = k === 'ice' ? mat(0xcfefff, 0x2a5070) : mat(0x9ff3ff, 0x2a7fa0); for (let i = 0; i < 5; i++) add(new THREE.OctahedronGeometry(0.25, 0), m, Math.cos(i * 1.3) * 0.25 * (i > 0), 0.3 + (i === 0) * 0.15, Math.sin(i * 1.3) * 0.25 * (i > 0), 1, i === 0 ? 2.6 : 1.6, 1, 0, (i - 2) * 0.25); }
    else if (k === 'fos') { const m = mat(0xeadfc8); add(new THREE.TorusGeometry(0.4, 0.09, 6, 14, Math.PI * 1.6), m, 0, 0.45, 0, 1, 1, 1, 0, 0.3); add(new THREE.TorusGeometry(0.2, 0.06, 6, 10, Math.PI * 1.7), m, 0.12, 0.45, 0, 1); add(new THREE.BoxGeometry(0.9, 0.12, 0.5), mat(0x9a8c78), 0, 0.03, 0); }
    else if (k === 'ruin' || k === 'lib') { const m = mat(k === 'lib' ? 0xd9cfa8 : 0xb7ad9c); for (let i = 0; i < 5; i++) { const a = i * 1.256; add(new THREE.CylinderGeometry(0.07, 0.08, 0.5 + (i % 3) * 0.25, 6), m, Math.cos(a) * 0.4, 0.3, Math.sin(a) * 0.4); } add(new THREE.CylinderGeometry(0.55, 0.6, 0.1, 10), m, 0, 0.03, 0); if (k === 'lib') add(new THREE.SphereGeometry(0.45, 10, 6, 0, Math.PI * 2, 0, Math.PI / 2), mat(0xe2c46a, 0x4a3a00), 0, 0.9, 0); }
    else if (k === 'vent') { const m = mat(0x5a4a44, 0x401000); add(new THREE.ConeGeometry(0.25, 0.7, 7), m, 0, 0.35, 0); add(new THREE.ConeGeometry(0.18, 0.5, 7), m, 0.28, 0.25, 0.1); }
    else if (k === 'tree') { add(new THREE.CylinderGeometry(0.12, 0.2, 1.4, 7), mat(0x6e4b2e), 0, 0.7, 0); add(new THREE.IcosahedronGeometry(0.75, 1), mat(0x3f9a3e), 0, 1.6, 0, 1, 0.8, 1); }
    else if (k === 'city') { for (let i = 0; i < 4; i++) add(new THREE.BoxGeometry(0.22, 0.5 + i * 0.25, 0.22), mat(0xf2ead8, 0x302010), (i % 2 - 0.5) * 0.3, (0.5 + i * 0.25) / 2, ((i >> 1) - 0.5) * 0.3); }
    else if (k === 'rocket') { add(new THREE.CylinderGeometry(0.12, 0.14, 1.1, 8), mat(0xf4f4f4), 0, 0.6, 0); add(new THREE.ConeGeometry(0.13, 0.35, 8), mat(0xe2493a), 0, 1.32, 0); }
    else if (k === 'aur') { add(new THREE.TorusGeometry(0.4, 0.05, 6, 20), mat(0x8fffd0, 0x2aa070), 0, 0.15, 0, 1, 1, 1, Math.PI / 2); add(new THREE.OctahedronGeometry(0.2, 0), mat(0xc7a2ff, 0x5030a0), 0, 0.5, 0); }
    else if (k === 'geyser') { add(new THREE.CylinderGeometry(0.3, 0.45, 0.15, 10), mat(0xa8c8d8), 0, 0.05, 0); const j = add(new THREE.CylinderGeometry(0.06, 0.16, 1.8, 8, 1, true), new THREE.MeshBasicMaterial({ color: 0xe8f8ff, transparent: true, opacity: 0.6 }), 0, 0.9, 0); j.userData.jet = 1; }
    else if (k === 'lava') { add(new THREE.CylinderGeometry(0.4, 0.5, 0.1, 10), new THREE.MeshBasicMaterial({ color: 0xff6a1a }), 0, 0.04, 0); add(new THREE.ConeGeometry(0.35, 0.7, 7), mat(0x2b2220, 0x3a0a00), 0.5, 0.35, 0); }
    else if (k === 'arch') { add(new THREE.TorusGeometry(0.6, 0.15, 6, 14, Math.PI), mat(0xb59b7c), 0, 0, 0); }
    else if (k === 'shell') { add(new THREE.ConeGeometry(0.3, 0.8, 9), mat(0xf6d6c0, 0x302018), 0, 0.3, 0, 1, 1, 1, 0, 1.2); add(new THREE.TorusGeometry(0.22, 0.08, 6, 12), mat(0xf0c4b0), -0.25, 0.25, 0, 1, 1, 1, 0, 0.4); }
    else if (k === 'flag') { add(new THREE.CylinderGeometry(0.03, 0.03, 1.0, 5), mat(0xdddddd), 0, 0.5, 0); add(new THREE.BoxGeometry(0.4, 0.25, 0.02), mat(0xff5a4a), 0.2, 0.88, 0); add(new THREE.BoxGeometry(0.5, 0.25, 0.5), mat(0xc9c9c9), 0.45, 0.12, 0.2); }
    else if (k === 'bloom') { add(new THREE.CylinderGeometry(0.08, 0.1, 1.6, 6), mat(0x4f9b3e), 0, 0.8, 0); for (let i = 0; i < 6; i++) { const a = i * 1.047; add(new THREE.SphereGeometry(0.28, 7, 5), mat(0xff8fc6, 0x401030), Math.cos(a) * 0.32, 1.65, Math.sin(a) * 0.32, 1, 0.35, 1); } add(new THREE.SphereGeometry(0.18, 8, 6), mat(0xffe36b, 0x403000), 0, 1.72, 0); }
    else add(new THREE.OctahedronGeometry(0.3, 0), mat(0xffffff, 0x404040), 0, 0.4, 0);
    return g;
  }
  function placeMarks() {
    while (marks.children.length) marks.remove(marks.children[0]);
    if (!W.st) return;
    const R = W.R;
    for (const s of S.sites(W.st)) {
      if (s.k === 'sp' || s.k === 'sea') { if (!s.found) { const b = beam(R); setOn(b, s, R, s.k === 'sea' ? Math.max(W.R, 0) : null); b.userData.site = s.id; marks.add(b); } continue; }
      const g = markObj(s), d = S.dirOf(s.lat, s.lon); let r = groundAt(d[0], d[1], d[2]);
      if (s.k === 'vent' && W.fluid.kind === 'water') r = Math.min(r, W.R);
      const big = s.k === 'tree' || s.k === 'bloom' ? 1.6 : s.k === 'arch' ? 1.8 : 1;
      g.scale.setScalar(R * 0.02 * big); orient(g, d, r - R * 0.001); g.userData.site = s.id; marks.add(g);
      if (!s.found) { const b = beam(R); setOn(b, s, R); b.userData.site = s.id; b.userData.beam = 1; marks.add(b); }
    }
  }
  W.placeMarks = placeMarks;
  function beam(R) { const m = new THREE.Mesh(new THREE.CylinderGeometry(R * 0.006, R * 0.012, R * 0.22, 8, 1, true), W.beamMat); m.userData.beam = 1; m.renderOrder = 4; return m; }
  function setOn(o, s, R, rr) { const d = S.dirOf(s.lat, s.lon); const r = rr || groundAt(d[0], d[1], d[2]); orient(o, d, r + R * 0.11); }
  function orient(o, d, r) { v3.set(d[0], d[1], d[2]); o.quaternion.setFromUnitVectors(upY, v3); o.position.copy(v3.multiplyScalar(r)); }
  W.markWorld = id => { for (const o of marks.children) if (o.userData.site === id && !o.userData.beam) return o; return null; };

  // ---------- clouds ----------
  function paintClouds(st, shift) {
    const ctx = W.cCv.getContext('2d'), w = 512, h = 256, img = ctx.createImageData(w, h), d = img.data;
    const wet = st.wl > 0.05, amt = st.wonder === 'moon' || st.wonder === 'lava' ? 0 : wet ? 1 : 0.25, dark = st.dust > 20 ? 1 : 0;
    for (let j = 0; j < h; j++) { const lat = 90 - (j + 0.5) * 180 / h, band = 0.35 + 0.45 * Math.exp(-((lat / 12) ** 2)) + 0.4 * Math.exp(-(((Math.abs(lat) - 55) / 14) ** 2)) - 0.2 * Math.exp(-(((Math.abs(lat) - 25) / 9) ** 2));
      for (let i = 0; i < w; i++) { const lo = (i / w) * 6.283, x = Math.cos(lo) * Math.cos(lat * D2R), y = Math.sin(lat * D2R), z = Math.sin(lo) * Math.cos(lat * D2R);
        const n = S.fbm(x * 3 + shift, y * 3, z * 3 + shift * 0.3, 5, 4), a = clamp((n - 0.62 + band * 0.22) * 4, 0, 1) * amt; const k = (j * w + i) * 4; d[k] = d[k + 1] = d[k + 2] = 255; d[k + 3] = Math.round(a * 230); } }
    ctx.putImageData(img, 0, 0); W.cTex.needsUpdate = true;
    W.cU.tint.value.setRGB(dark ? 0.55 : 1, dark ? 0.52 : 1, dark ? 0.5 : 1);
  }

  // ---------- fx ----------
  W.burst = (lat, lon, kind) => {
    const d = S.dirOf(lat, lon), g = groundAt(d[0], d[1], d[2]), R = W.R;
    const col = { smoke: [0.42, 0.4, 0.38], volcano: [1, 0.45, 0.1], raise: [0.85, 0.75, 0.55], sink: [0.4, 0.75, 1], asteroid: [1, 0.9, 0.6], seed: [0.4, 1, 0.6], rain: [0.6, 0.8, 1], cool: [1, 1, 1], idea: [1, 0.9, 0.3], find: [1, 0.95, 0.5] }[kind] || [1, 1, 1];
    const n = kind === 'asteroid' ? 90 : kind === 'smoke' ? 3 : 40, rr = S.rng((Math.floor(W.time * 1000) ^ 0x51) >>> 0);
    for (let i = 0; i < n; i++) {
      const up = kind === 'rain' ? -0.5 : 1, sp = R * (kind === 'asteroid' ? 0.5 : kind === 'volcano' ? 0.35 : kind === 'smoke' ? 0.08 : 0.18), spr = kind === 'smoke' ? 0.3 : 0.9;
      const v = [d[0] * up + (rr() - 0.5) * spr, d[1] * up + (rr() - 0.5) * spr, d[2] * up + (rr() - 0.5) * spr];
      const p0 = kind === 'rain' ? [d[0] * g * 1.06 + (rr() - 0.5) * 0.08 * R, d[1] * g * 1.06 + (rr() - 0.5) * 0.08 * R, d[2] * g * 1.06 + (rr() - 0.5) * 0.08 * R] : [d[0] * g, d[1] * g, d[2] * g];
      fx.push({ p: p0, v: v.map(q => q * sp * (0.4 + rr())), life: kind === 'smoke' ? 3 : 1.2 + rr() * 0.8, age: 0, c: col });
    }
    if (fx.length > FXN) fx.splice(0, fx.length - FXN);
  };
  function stepFx(dt) {
    let n = 0;
    for (let i = fx.length - 1; i >= 0; i--) { const f = fx[i]; f.age += dt; if (f.age > f.life) { fx.splice(i, 1); continue; } }
    for (const f of fx) { const k = 1 - f.age / f.life; f.p[0] += f.v[0] * dt; f.p[1] += f.v[1] * dt; f.p[2] += f.v[2] * dt; f.v[0] *= 0.97; f.v[1] *= 0.97; f.v[2] *= 0.97;
      fxPos[n * 3] = f.p[0]; fxPos[n * 3 + 1] = f.p[1]; fxPos[n * 3 + 2] = f.p[2]; fxCol[n * 3] = f.c[0] * k; fxCol[n * 3 + 1] = f.c[1] * k; fxCol[n * 3 + 2] = f.c[2] * k; n++; }
    fxGeo.setDrawRange(0, n); fxGeo.attributes.position.needsUpdate = true; fxGeo.attributes.color.needsUpdate = true; fxPts.visible = n > 0;
    return n > 0;
  }

  // ---------- the public face ----------
  W.setPlanet = (st, force) => { const changed = W.st !== st; W.st = st; if (!I) setLevel(W.level); rebuild(true); placeCreatures(); paintClouds(st, 0); W.cloudShift = 0; W.colT = st.t; return changed; };
  // call often: rebuilds what changed in the model
  W.sync = (o) => {
    const st = W.st; if (!st) return;
    if (st.geoV !== W.geoV) { rebuild(); placeCreatures(); }
    else if (o && o.recolor) { recolor(); if (o.flora) placeFlora(); }
    if (o && o.marks) { placeMarks(); placeCreatures(); }
    if (o && o.clouds) paintClouds(st, (W.cloudShift = (W.cloudShift || 0) + 0.15));
  };
  // look of the sky and air from the state (heat haze, impact winter, no air)
  W.look = () => {
    const st = W.st; if (!st) return;
    const d = st.d || {}, T = d.Tg == null ? 15 : d.Tg, hot = sstep(30, 55, T), dark = sstep(5, 60, st.dust || 0) + sstep(0.05, 0.2, st.ash || 0) * 0.3, noAir = st.wonder === 'moon' || st.p.n2 < 0.05;
    const molten = W.fluid.kind === 'lava';
    const c = new THREE.Color(0.32, 0.58, 1.0).lerp(new THREE.Color(1.0, 0.55, 0.25), Math.max(hot, molten ? 0.8 : 0)).lerp(new THREE.Color(0.5, 0.48, 0.45), clamp(dark, 0, 0.85));
    if (st.wonder === 'ice') c.setRGB(0.4, 0.62, 1.0); if (st.wonder === 'bloom') c.setRGB(0.45, 0.75, 1.0);
    if (st.life.st >= 2 && st.o2 < 0.01 && !molten && st.wonder !== 'ice') c.lerp(new THREE.Color(0.95, 0.65, 0.4), 0.45); // a hazy methane sky before oxygen
    W.aU.col.value.copy(c); W.aU.zen.value.copy(c).multiplyScalar(0.55).lerp(new THREE.Color(0.1, 0.2, 0.55), 0.4);
    if (molten) { W.aU.col.value.setRGB(0.95, 0.38, 0.14); W.aU.zen.value.setRGB(0.12, 0.03, 0.04); } // smoke and glow over a young world
    W.aU.strength.value = noAir ? 0.0 : 1;
    W.tU.hazeCol.value.copy(c).lerp(new THREE.Color(1, 1, 1), 0.3).multiplyScalar(st.wonder === 'ice' ? 0.8 : 1);
    W.tU.dim.value = 1 - 0.55 * clamp(dark, 0, 1);
    W.tU.lava.value = molten || st.wonder === 'lava' ? 1 : 0; W.wU.lava.value = molten ? 1 : 0;
    W.tU.lights.value = st.civ && st.civ.on ? 1 : 0;
    W.ring.visible = !!st.rings;
    const aur = st.wonder === 'ice' ? 1 : clamp((st.aur || 0) + (S.sites(st).some(s => s.k === 'aur') ? 0.6 : 0), 0, 1);
    W.aurU.amt.value = aur; for (const a of W.auroras) { a.visible = aur > 0.02; a.scale.setScalar(W.R); a.position.y = Math.sign(a.position.y) * W.R * 0.955; }
    W.atmo.scale.setScalar(W.R); W.aU.R.value = W.R; W.clouds.scale.setScalar(W.R); W.ring.scale.setScalar(W.R);
    W.clouds.visible = st.wonder !== 'moon' && W.fluid.kind !== 'lava';
    W.tU.cloudAmt.value = W.clouds.visible && W.quality >= 1 ? 1 : 0; W.tU.R.value = W.R;
    W.moon.visible = st.wonder !== 'moon';
  };
  // a brush cursor on the ground (orbit view)
  W.showCursor = (lat, lon, rDeg, color) => {
    if (lat == null) { W.cursor.visible = false; return; }
    const d = S.dirOf(lat, lon), g = groundAt(d[0], d[1], d[2]); orient(W.cursor, d, g + W.R * 0.004);
    W.cursor.rotateX(Math.PI / 2); W.cursor.scale.setScalar(W.R * Math.sin(rDeg * D2R) * 1.2); W.cursor.material.color.set(color || 0xffffff); W.cursor.visible = true;
  };
  W.tick = (dt, t, cam) => {
    W.time = t;
    W.tU.time.value = t; W.wU.time.value = t; W.beamU.time.value = t; W.aurU.time.value = t; W.ringU.time.value = t;
    W.cU.time.value = t; W.windT.value = t;
    if (W.fullDue > 0 && (W.fullDue -= dt) <= 0) { rebuild(); placeCreatures(); }
    // the moon goes round
    W.moon.position.set(Math.cos(t * 0.03) * 7 * W.R, Math.sin(t * 0.03) * 1.2 * W.R, Math.sin(t * 0.03) * 7 * W.R); W.moon.scale.setScalar(W.R * 0.27);
    for (let i = W.plumes.length - 1; i >= 0; i--) { const p = W.plumes[i]; p.left -= dt; if (p.left <= 0) { W.plumes.splice(i, 1); continue; } p.acc += dt; if (p.acc > 0.12) { p.acc = 0; W.burst(p.lat, p.lon, 'smoke'); } }
    W.sunL.position.copy(W.sun).multiplyScalar(10); W.sunL.target.position.set(0, 0, 0);
    W.sunDisc.position.copy(W.sun).multiplyScalar(48);
    const inside = cam && cam.position.length() < W.R * 1.11;
    W.aU.inside.value = inside ? 1 : 0;
    if (inside) { // stars fade by day
      const day = sstep(-0.2, 0.3, cam.position.clone().normalize().dot(W.sun)); W.stars.material.opacity = 0.9 * (1 - day); W.mwU.op.value = 1 - day; W.sunDisc.visible = day > 0.05;
    } else { W.stars.material.opacity = 0.9; W.mwU.op.value = 1; W.sunDisc.visible = true; }
    for (const o of W.marks.children) if (o.userData.beam) o.visible = W.surface > 0.5 || true;
    for (const o of W.marks.children) for (const c of o.children) if (c.userData.jet) { c.scale.y = 0.6 + 0.4 * Math.abs(Math.sin(t * 2.2 + o.id)); c.position.y = 0.9 * c.scale.y; }
    if (herds.length) animCreatures(t);
    return stepFx(dt);
  };
  // the sun: the planet turns (day and night) and its tilted axis gives seasons (declination ±23.4°)
  W.setSunAngles = (hour, season) => { const dec = 23.4 * D2R * Math.sin(season); W.sun.set(Math.cos(dec) * Math.cos(hour), Math.sin(dec), Math.cos(dec) * Math.sin(hour)).normalize(); W.seasonK = 7 * Math.sin(season); W.decl = dec / D2R; };
  W.setFocus = d => { W.focus = d ? [d.x, d.y, d.z] : null; placeFlora(); creatures.visible = !!d; };
  W.setSurface = s => { W.surface = s; W.tU.fogK.value = s * 1.1; W.camCut.value = s > 0.5 ? W.R * 0.075 : 0; };
  W.counts = () => ({ verts: I ? I.nv : 0, trees: inst.pine.count + inst.oak.count + inst.palm.count + inst.bloom.count + inst.bush.count, grass: grass.count + flowers.count, rocks: inst.rock.count, builds: builds.count, herds: herds.length, marks: marks.children.length, water: water.visible ? (wGeo.index ? wGeo.index.count / 3 : 0) : 0 });
  setLevel(W.level);
  return W;
}


// ---------- a small hand-rolled bloom (高画質): bright parts (sun, lava, city lights, glints) glow softly ----------
function createPost(THREE, renderer) {
  const P = { on: true, strength: 0.7, thr: 0.86 };
  const isW2 = renderer.capabilities.isWebGL2;
  const mk = (w, h, ms) => { const o = { minFilter: THREE.LinearFilter, magFilter: THREE.LinearFilter, format: THREE.RGBAFormat }; const rt = ms && isW2 && THREE.WebGLMultisampleRenderTarget ? new THREE.WebGLMultisampleRenderTarget(w, h, o) : new THREE.WebGLRenderTarget(w, h, o); return rt; };
  let main = null, a = null, b = null, W0 = 0, H0 = 0;
  const cam = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1), scene = new THREE.Scene(), quad = new THREE.Mesh(new THREE.PlaneGeometry(2, 2)); scene.add(quad);
  const VS = 'varying vec2 vUv; void main(){ vUv = uv; gl_Position = vec4(position.xy, 0.0, 1.0); }';
  const bright = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, thr: { value: P.thr } }, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: 'uniform sampler2D t; uniform float thr; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb; float l = max(c.r, max(c.g, c.b)); gl_FragColor = vec4(c * smoothstep(thr, thr + 0.25, l), 1.0); }' });
  const blur = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, d: { value: new THREE.Vector2() } }, vertexShader: VS, depthTest: false, depthWrite: false,
    fragmentShader: 'uniform sampler2D t; uniform vec2 d; varying vec2 vUv; void main(){ vec3 c = texture2D(t, vUv).rgb * 0.227; c += (texture2D(t, vUv + d * 1.38).rgb + texture2D(t, vUv - d * 1.38).rgb) * 0.316; c += (texture2D(t, vUv + d * 3.23).rgb + texture2D(t, vUv - d * 3.23).rgb) * 0.07; gl_FragColor = vec4(c, 1.0); }' });
  const comp = new THREE.ShaderMaterial({ uniforms: { t: { value: null }, bl: { value: null }, k: { value: P.strength }, ex: { value: 1.55 } }, vertexShader: VS, depthTest: false, depthWrite: false,
    // ACES filmic tone curve (on approximately linear light), then back to display gamma; a soft vignette
    fragmentShader: 'uniform sampler2D t; uniform sampler2D bl; uniform float k; uniform float ex; varying vec2 vUv; vec3 aces(vec3 x){ return clamp((x * (2.51 * x + 0.03)) / (x * (2.43 * x + 0.59) + 0.14), 0.0, 1.0); } void main(){ vec3 c = texture2D(t, vUv).rgb + texture2D(bl, vUv).rgb * k; c = pow(aces(pow(c, vec3(2.2)) * ex), vec3(1.0 / 2.2)); vec2 q = vUv - 0.5; c *= 1.0 - dot(q, q) * 0.35; gl_FragColor = vec4(c, 1.0); }' });
  function size() { const v = renderer.getDrawingBufferSize(new THREE.Vector2()); if (v.x === W0 && v.y === H0 && main) return; W0 = v.x; H0 = v.y; [main, a, b].forEach(r => r && r.dispose()); main = mk(W0, H0, true); a = mk(Math.max(1, W0 >> 2), Math.max(1, H0 >> 2)); b = mk(Math.max(1, W0 >> 2), Math.max(1, H0 >> 2)); }
  const pass = (m, target) => { quad.material = m; renderer.setRenderTarget(target); renderer.render(scene, cam); };
  P.render = (sc, cm) => {
    if (!P.on) { renderer.setRenderTarget(null); renderer.render(sc, cm); return; }
    size();
    renderer.setRenderTarget(main); renderer.render(sc, cm);
    bright.uniforms.t.value = main.texture; pass(bright, a);
    for (let i = 0; i < 2; i++) { blur.uniforms.t.value = a.texture; blur.uniforms.d.value.set(1.6 / a.width, 0); pass(blur, b); blur.uniforms.t.value = b.texture; blur.uniforms.d.value.set(0, 1.6 / a.height); pass(blur, a); }
    comp.uniforms.t.value = main.texture; comp.uniforms.bl.value = a.texture; comp.uniforms.k.value = P.strength; comp.uniforms.ex.value = P.exposure || 1.55; pass(comp, null);
  };
  P.dispose = () => [main, a, b].forEach(r => r && r.dispose());
  return P;
}

return { create, createPost, icosphere, hv, radiusOf, fluidOf, sampleHi, sampleCell, llOf, detail };
})();
if (typeof window !== 'undefined') window.PWorld = PWorld;
