// わくせいシミュレーターの星のモデル（DOM なし。node でも動く）。時間の単位は年。
// 気候（緯度帯のエネルギー収支）・炭素と酸素の箱モデル・プレート・生命（広がる「いのち」）・文明・道具とコンボ・危険・シナリオ。
const PSim = (() => {
'use strict';
const NX = 64, NY = 32, N = NX * NY;          // simulation cells (5.6°)
const HX = 256, HY = 128, HN = HX * HY;       // elevation / land mask (1.4°)
const BX = HX / NX;                           // hi-res pixels per cell side (4)
const D2R = Math.PI / 180, SEC = 3.156e7;
const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
const sstep = (a, b, x) => { const t = clamp((x - a) / (b - a), 0, 1); return t * t * (3 - 2 * t); };
const lerp = (a, b, t) => a + (b - a) * t;
// ---- constants (see the しくみ panel) ----
const K = {
  S0: 1361,            // W/m² at 1 AU today
  A: 213.9, B: 2.0,      // OLR = A + B·T(°C) − greenhouse forcing  (B includes the water-vapour feedback)
  LIM: 292,            // Simpson–Nakajima limit of a wet atmosphere (W/m²) → runaway greenhouse
  Datm: 0.28, Doc: 0.34, // heat transport (W/m²/K): air + open ocean currents
  K_OC: 6,             // ocean holds 6× the atmosphere's CO2 at equilibrium (buffered)
  TAU_EX: 100,         // atmosphere–ocean exchange (years)
  V0: 0.047,           // volcanic CO2 today (ppm of atmosphere per year)
  PAL_RATE: 2.7e-7,    // O2 made by today's burial, PAL per year
};
// present-day Earth reference values of the integrals (calibration)
const REF = { w: 0.17, veg: 0.11, po: 0.556, pm: 0.598, hab: 0.62 };
// rows (row 0 = north)
const latC = new Float64Array(NY), xC = new Float64Array(NY), xE = new Float64Array(NY + 1), dX = new Float64Array(NY), wRow = new Float64Array(NY), sIns = new Float64Array(NY);
for (let j = 0; j <= NY; j++) xE[j] = Math.sin((90 - j * 180 / NY) * D2R);
for (let j = 0; j < NY; j++) {
  latC[j] = 90 - (j + 0.5) * 180 / NY; xC[j] = Math.sin(latC[j] * D2R); dX[j] = xE[j] - xE[j + 1]; wRow[j] = dX[j] / 2;
  sIns[j] = 1 - 0.482 * (3 * xC[j] * xC[j] - 1) / 2;
}
const cellA = j => wRow[j] / NX;
// hi-res pixel directions and area weights
const PX = new Float32Array(HN), PY = new Float32Array(HN), PZ = new Float32Array(HN), PW = new Float32Array(HN);
{ let s = 0; for (let j = 0; j < HY; j++) { const la = (90 - (j + 0.5) * 180 / HY) * D2R, cl = Math.cos(la), sl = Math.sin(la);
  for (let i = 0; i < HX; i++) { const lo = (-180 + (i + 0.5) * 360 / HX) * D2R, k = j * HX + i; PX[k] = cl * Math.cos(lo); PY[k] = sl; PZ[k] = -cl * Math.sin(lo); PW[k] = cl; s += cl; } }
  for (let k = 0; k < HN; k++) PW[k] /= s; }
function dirOf(lat, lon) { const la = lat * D2R, lo = lon * D2R, c = Math.cos(la); return [c * Math.cos(lo), Math.sin(la), -c * Math.sin(lo)]; }
function latLonOf(x, y, z) { return [Math.asin(clamp(y, -1, 1)) / D2R, Math.atan2(-z, x) / D2R]; }

// ---- deterministic noise ----
function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
function h3(i, j, k, s) { let h = (Math.imul(i, 374761393) + Math.imul(j, 668265263) + Math.imul(k, 1440662683) + Math.imul(s, 951274213)) | 0; h = Math.imul(h ^ (h >>> 13), 1274126177); h ^= h >>> 16; return (h >>> 0) / 4294967296; }
function vn(x, y, z, s) {
  const xi = Math.floor(x), yi = Math.floor(y), zi = Math.floor(z), xf = x - xi, yf = y - yi, zf = z - zi;
  const u = xf * xf * (3 - 2 * xf), v = yf * yf * (3 - 2 * yf), w = zf * zf * (3 - 2 * zf);
  const a = lerp(lerp(h3(xi, yi, zi, s), h3(xi + 1, yi, zi, s), u), lerp(h3(xi, yi + 1, zi, s), h3(xi + 1, yi + 1, zi, s), u), v);
  const b = lerp(lerp(h3(xi, yi, zi + 1, s), h3(xi + 1, yi, zi + 1, s), u), lerp(h3(xi, yi + 1, zi + 1, s), h3(xi + 1, yi + 1, zi + 1, s), u), v);
  return lerp(a, b, w);
}
function fbm(x, y, z, s, oct) { let f = 0, a = 0.5, n = 0; for (let o = 0; o < (oct || 4); o++) { f += a * vn(x, y, z, s + o * 17); n += a; x *= 2.03; y *= 2.03; z *= 2.03; a *= 0.5; } return f / n; }
// static ocean-floor roughness and fine detail (world-fixed)
const FLOOR = new Float32Array(HN);
for (let k = 0; k < HN; k++) FLOOR[k] = fbm(PX[k] * 3 + 9, PY[k] * 3 + 9, PZ[k] * 3 + 9, 5, 3) - 0.5;

// ---- 3×3 rotations (row-major) ----
function rotM(ax, ang) { const [x, y, z] = ax, c = Math.cos(ang), s = Math.sin(ang), t = 1 - c;
  return [t * x * x + c, t * x * y - s * z, t * x * z + s * y, t * x * y + s * z, t * y * y + c, t * y * z - s * x, t * x * z - s * y, t * y * z + s * x, t * z * z + c]; }
function mul(a, b) { const o = new Array(9); for (let r = 0; r < 3; r++) for (let c = 0; c < 3; c++) o[r * 3 + c] = a[r * 3] * b[c] + a[r * 3 + 1] * b[3 + c] + a[r * 3 + 2] * b[6 + c]; return o; }
function ortho(m) { // re-orthonormalise (drift over many products)
  let a = [m[0], m[3], m[6]], b = [m[1], m[4], m[7]];
  const n = v => { const l = Math.hypot(v[0], v[1], v[2]) || 1; return v.map(q => q / l); };
  a = n(a); const d = a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; b = n([b[0] - d * a[0], b[1] - d * a[1], b[2] - d * a[2]]);
  const c = [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  return [a[0], b[0], c[0], a[1], b[1], c[1], a[2], b[2], c[2]];
}
function randAxis(r) { const z = r() * 2 - 1, a = r() * Math.PI * 2, s = Math.sqrt(1 - z * z); return [s * Math.cos(a), z, s * Math.sin(a)]; }

// ---- plates: continents ride on rigid caps that turn about Euler poles ----
const PM = 40, PEXT = 1.45;
function plateMap(seed) {
  const r = rng(seed), amp = [], ph = [];
  for (let k = 2; k <= 6; k++) { amp.push((0.5 + r()) / k); ph.push(r() * 6.283); }
  const ridgeA = r() * 6.283, ridgeR = 0.35 + r() * 0.35, ridgeW = 0.6 + r() * 1.2, hBase = 0.15 + r() * 0.25;
  const m = new Float32Array(PM * PM);
  for (let b = 0; b < PM; b++) for (let a = 0; a < PM; a++) {
    const u = (a / (PM - 1) * 2 - 1) * PEXT, v = (b / (PM - 1) * 2 - 1) * PEXT, d = Math.hypot(u, v), th = Math.atan2(v, u);
    let rho = 1; for (let k = 0; k < amp.length; k++) rho += 0.2 * amp[k] * Math.sin((k + 2) * th + ph[k]);
    const n = fbm(u * 1.7 + seed % 97, v * 1.7, seed % 31, seed & 255, 4);
    const mm = (rho - d) / rho + 0.32 * (n - 0.5);
    let h;
    if (mm > 0) {
      h = hBase + 0.55 * sstep(0, 0.3, mm) + 1.1 * (fbm(u * 3.1, v * 3.1, 7.7, (seed + 3) & 255, 4) - 0.45);
      // an old mountain belt along an arc
      let dd = Math.abs(th - ridgeA); dd = Math.min(dd, 6.283 - dd);
      if (dd < ridgeW) h += 1.6 * Math.exp(-(((d - ridgeR) / 0.09) ** 2)) * (1 - dd / ridgeW) * (0.6 + n);
      h = Math.max(h, 0.04);
    } else h = -0.12 - 4.0 * sstep(0, 0.22, -mm);
    m[b * PM + a] = h;
  }
  return m;
}
const mapCache = new Map();
function pmap(seed) { let m = mapCache.get(seed); if (!m) { m = plateMap(seed); mapCache.set(seed, m); } return m; }

function makePlates(seed, n, sizeScale) {
  const r = rng(seed ^ 0x51ab), out = [];
  for (let i = 0; i < n; i++) {
    const c = randAxis(r);
    // rotation that takes local +z to c
    const z = [0, 0, 1], ax = [z[1] * c[2] - z[2] * c[1], z[2] * c[0] - z[0] * c[2], z[0] * c[1] - z[1] * c[0]], s = Math.hypot(ax[0], ax[1], ax[2]);
    let M = s < 1e-6 ? [1, 0, 0, 0, 1, 0, 0, 0, 1] : rotM(ax.map(q => q / s), Math.acos(clamp(c[2], -1, 1)));
    M = mul(M, rotM([0, 0, 1], r() * 6.283));
    out.push({ M, ax: randAxis(r), w: (0.25 + r() * 0.55) * D2R, r: (0.30 + r() * 0.24) * (sizeScale || 1), seed: (seed * 31 + i * 977) >>> 0, next: 2.5e8 + r() * 2e8, ep: 0 });
  }
  return out;
}
function growth(t) { return 0.5 + 0.5 * sstep(1e8, 2.8e9, t); } // continental crust grows through the Archean

// ---- world ----
function create(o) {
  o = o || {};
  const p = Object.assign({ dist: 1, size: 1, water: 1, n2: 0.78, co2: 3e5, seed: 1 }, o.p || {});
  const st = {
    v: 1, t: o.t || 0, p, seed: p.seed >>> 0,
    T: new Float64Array(NY).fill(20), A: p.co2, O: p.co2 * K.K_OC, ch4: 0.3, o2: 1e-6,
    wl: o.t > 8e7 ? p.water : 0, // water that has condensed into oceans (×Earth)
    lost: 0,                     // water lost to space (×Earth)
    elev: new Float32Array(HN), sea: 0, land: new Uint8Array(HN),
    lf: new Float32Array(N), el: new Float32Array(N), iceL: new Float32Array(N), iceO: new Float32Array(N), veg: new Float32Array(N), moist: new Float32Array(N), pop: new Float32Array(N),
    Tc: new Float32Array(N),
    reach: new Float32Array(N), reachOn: false, // where life has spread to (0..1 per cell). reachOn=false: an old or prepared world, life is everywhere
    combos: [], ms: {}, boost: 0, aur: 0, surp: false, nextSurp: 0,
    plates: makePlates(p.seed, 8, 1), bumps: [], craters: [],
    // 2026-11 world: the maker's sculpting (a world-fixed height field built from a list of brush strokes), rain painted on the land,
    // things to discover (marks), what has been found here, and how fast the plates drift (slow, so what you build stays put)
    base: new Float32Array(HN), sculpt: new Float32Array(HN), ops: [], wet: new Float32Array(N), marks: [], found: [], drift: 0.15,
    uplift: 0, dust: 0, ash: 0, pulses: [],
    life: { st: 0, prog: 0, pre: 0, div: 0, nudge: null, euk: 0, seedT: -1 },
    civ: null, civRest: 0,
    ev: [], flags: {}, geoT: -1, geoDirty: true,
    // diagnostics
    d: {},
  };
  st.iceO.fill(0); st.iceL.fill(0);
  geology(st, true);
  for (let j = 0; j < NY; j++) st.T[j] = 25 - 30 * xC[j] * xC[j];
  return st;
}

// rebuild elevation, sea level, land mask and the cell averages
function geology(st, force) {
  if (st.geoT >= 0 && st.t > st.geoT) { const k = Math.exp(-(st.t - st.geoT) / 3e8); for (let c = 0; c < N; c++) st.wet[c] *= k; }
  const g = growth(st.t), pl = st.plates, E = st.elev;
  const prep = pl.map(P => { const rr = P.r * g; return { M: P.M, m: pmap(P.seed), cz: Math.cos(Math.min(1.5, rr * PEXT * 1.05)), it: 1 / Math.tan(rr) }; });
  const bumps = st.bumps.map(b => { let q = b.lp; if (b.pl >= 0 && pl[b.pl]) { const M = pl[b.pl].M; q = [M[0] * q[0] + M[1] * q[1] + M[2] * q[2], M[3] * q[0] + M[4] * q[1] + M[5] * q[2], M[6] * q[0] + M[7] * q[1] + M[8] * q[2]]; } return { x: q[0], y: q[1], z: q[2], k: 2 / (b.r * b.r), h: b.h, c: 1 - 4.5 * b.r * b.r / 2 }; });
  for (let k = 0; k < HN; k++) {
    const x = PX[k], y = PY[k], z = PZ[k];
    let h1 = -4.1 + 0.9 * FLOOR[k], h2 = -9;
    for (let i = 0; i < prep.length; i++) {
      const P = prep[i], M = P.M;
      const qz = M[2] * x + M[5] * y + M[8] * z; if (qz < P.cz) continue;
      const qx = M[0] * x + M[3] * y + M[6] * z, qy = M[1] * x + M[4] * y + M[7] * z;
      const u = qx / qz * P.it, v = qy / qz * P.it;
      const fa = (u / PEXT + 1) * 0.5 * (PM - 1), fb = (v / PEXT + 1) * 0.5 * (PM - 1);
      if (fa < 0 || fb < 0 || fa >= PM - 1 || fb >= PM - 1) continue;
      const a0 = fa | 0, b0 = fb | 0, ta = fa - a0, tb = fb - b0, m = P.m, q = b0 * PM + a0;
      const h = (m[q] * (1 - ta) + m[q + 1] * ta) * (1 - tb) + (m[q + PM] * (1 - ta) + m[q + PM + 1] * ta) * tb;
      if (h > h1) { h2 = h1; h1 = h; } else if (h > h2) h2 = h;
    }
    // two continents pushed together: a collision belt (mountains)
    if (h2 > 0.05) h1 += 1.4 * Math.min(h2, 1.2) + 0.6;
    for (let i = 0; i < bumps.length; i++) { const b = bumps[i], d = x * b.x + y * b.y + z * b.z; if (d > b.c) h1 += b.h * Math.exp(-(1 - d) * b.k); }
    st.base[k] = h1; E[k] = h1 + st.sculpt[k];
  }
  seaLevel(st);
  st.geoT = st.t; st.geoDirty = false;
}
function seaLevel(st) {
  st.geoV = (st.geoV || 0) + 1; // the renderer rebuilds the terrain when this changes
  const E = st.elev, NB = 720, lo = -9, bw = 18 / NB, hist = new Float64Array(NB);
  for (let k = 0; k < HN; k++) { const b = clamp(((E[k] - lo) / bw) | 0, 0, NB - 1); hist[b] += PW[k]; }
  const target = Math.max(0, st.wl) * 2.69;
  const vol = s => { let v = 0; for (let b = 0; b < NB; b++) { const h = lo + (b + 0.5) * bw; if (h >= s) break; v += hist[b] * (s - h); } return v; };
  let a = -9, c = 9;
  if (target <= 0) st.sea = -12; else { for (let i = 0; i < 32; i++) { const m = (a + c) / 2; if (vol(m) < target) a = m; else c = m; } st.sea = (a + c) / 2; }
  const sea = st.sea, L = st.land;
  for (let k = 0; k < HN; k++) L[k] = E[k] > sea ? 1 : 0;
  // cells
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    let n = 0, e = 0;
    for (let b = 0; b < BX; b++) for (let a = 0; a < BX; a++) { const k = (j * BX + b) * HX + i * BX + a; if (L[k]) { n++; e += E[k] - sea; } }
    const c = j * NX + i; st.lf[c] = n / (BX * BX); st.el[c] = n ? e / n : 0;
  }
  moisture(st);
}
// rain: the latitude belts (ITCZ, dry subtropics, stormy mid-latitudes) and how far a cell is from the sea
const MLAT = new Float32Array(NY);
for (let j = 0; j < NY; j++) { const a = Math.abs(latC[j]); MLAT[j] = clamp(0.32 + 0.75 * Math.exp(-((a / 13) ** 2)) + 0.55 * Math.exp(-(((a - 52) / 15) ** 2)) - 0.25 * Math.exp(-(((a - 26) / 8) ** 2)), 0.05, 1.1); }
function moisture(st) {
  const dist = new Float32Array(N).fill(99), q = [];
  for (let c = 0; c < N; c++) if (st.lf[c] < 0.5) { dist[c] = 0; q.push(c); }
  for (let h = 0; h < q.length; h++) {
    const c = q[h], j = (c / NX) | 0, i = c % NX, nd = dist[c] + 1;
    const nb = [j * NX + (i + 1) % NX, j * NX + (i + NX - 1) % NX, j > 0 ? c - NX : -1, j < NY - 1 ? c + NX : -1];
    for (const e of nb) if (e >= 0 && dist[e] > nd) { dist[e] = nd; q.push(e); }
  }
  for (let c = 0; c < N; c++) st.moist[c] = Math.min(1.2, MLAT[(c / NX) | 0] * Math.exp(-Math.max(0, dist[c] - 1) / 4.5) + st.wet[c]);
}

// ---- radiative forcing ----
function forcing(st) {
  const A = st.A, co2bar = A * 1e-6;
  const fC = 5.35 * Math.log(Math.max(A, 1) / 280) + 12 * Math.log((1 + A / 3e4) / (1 + 280 / 3e4));
  const fM = 6 * Math.log(1 + st.ch4 / 50) - 6 * Math.log(1 + 0.7 / 50);
  const P = st.p.n2 + co2bar + 0.21 * Math.min(st.o2, 2);
  const fP = 3.5 * Math.log(Math.max(P, 0.05));
  const haze = -6 * sstep(0.1, 0.3, st.ch4 / Math.max(A, 1));
  const fCiv = (st.civ && st.civ.on ? -st.civ.aer : 0) - (st.cloud || 0);
  const dust = st.dust * (st.dtAvg > 1.5 ? 1.5 / st.dtAvg * (1 - Math.exp(-st.dtAvg / 1.5)) : 1); // dust settles within a few years: average it over a long step
  return { co2: fC, ch4: fM, p: fP, haze, dust: -dust, civ: fCiv, total: fC + fM + fP + haze - dust + fCiv, P, co2bar };
}
function lum(t) { return 1 / (1 + 0.4 * (1 - t / 4.57e9)); }
function volc(st) { // outgassing relative to today's Earth
  const s = st.p.size, t = st.t;
  let v = s * (0.55 + 1.7 * Math.exp(-t / (2.2e9 * s))) / 0.763;
  if (s < 0.65 && t > 2e9 * s) v *= 0.15; // a small planet cools: plate tectonics stops (stagnant lid)
  return v;
}

// ---- one time step ----
function step(st, dt) {
  st.dtAvg = dt;
  const p = st.p, f = forcing(st), d = st.d;
  const ocean = st.wl > 0.02;
  d.f = f;
  const L = lum(st.t) * K.S0 / (p.dist * p.dist) * (st.ramp ? 1 + Math.max(0, st.t - st.ramp[0]) * st.ramp[1] : 1); // ramp: a star that brightens fast (a scenario)
  const lim = (ocean ? K.LIM * Math.pow(p.size, 0.12) : 1e9);
  const ray = 0.25 * (1 - Math.exp(-f.co2bar / 5));
  // row albedo, ocean fraction, heat capacity
  const alb = new Float64Array(NY), ofr = new Float64Array(NY), oo = new Float64Array(NY), C = new Float64Array(NY);
  for (let j = 0; j < NY; j++) {
    const x2 = xC[j] * xC[j], ac = 0.42 + 0.12 * x2;
    let sa = 0, so = 0, sop = 0;
    for (let i = 0; i < NX; i++) {
      const c = j * NX + i, lf = st.lf[c], io = st.iceO[c], il = st.iceL[c], v = st.veg[c];
      const aO = (0.06 + 0.08 * x2) * (1 - io) + (0.64 - st.ash) * io;
      const aL = (0.32 - 0.19 * v) * (1 - il) + (0.75 - st.ash) * il;
      const as = lf * aL + (1 - lf) * (ocean ? aO : aL);
      sa += 0.5 * ac + 0.5 * as;
      so += ocean ? 1 - lf : 0; sop += ocean ? (1 - lf) * (1 - 0.6 * io) : 0; // currents still move some heat under sea ice
    }
    alb[j] = clamp(sa / NX + ray, 0, 0.95); ofr[j] = so / NX; oo[j] = sop / NX;
    C[j] = (5e7 + 8e8 * ofr[j]);
  }
  // implicit EBM (linearised OLR, two passes)
  const Pfac = Math.sqrt(Math.max(f.P, 0.02)), Dk = new Float64Array(NY + 1);
  for (let j = 1; j < NY; j++) {
    const D = (K.Datm * Pfac + K.Doc * Math.sqrt(Math.min(1, 2.5 * Math.min(oo[j - 1], oo[j])))) / (p.size * p.size); // currents need an open seaway
    Dk[j] = D * (1 - xE[j] * xE[j]) / (xC[j - 1] - xC[j]);
  }
  const T0 = st.T, Tn = Float64Array.from(T0), dts = dt * SEC;
  const a = new Float64Array(NY), b = new Float64Array(NY), c = new Float64Array(NY), r = new Float64Array(NY);
  let absG = 0, olrG = 0;
  for (let it = 0; it < 2; it++) {
    for (let j = 0; j < NY; j++) {
      const x0 = Math.max(20, K.A + K.B * Tn[j] - f.total);
      const olr = Math.pow(Math.pow(x0, -8) + Math.pow(lim, -8), -1 / 8), dol = K.B * Math.pow(olr / x0, 9);
      const Q = L / 4 * sIns[j] * (1 - alb[j]);
      const kj = Dk[j], kj1 = Dk[j + 1];
      a[j] = -kj / dX[j]; c[j] = -kj1 / dX[j];
      b[j] = C[j] / dts + dol + (kj + kj1) / dX[j];
      r[j] = C[j] / dts * T0[j] + Q - olr + dol * Tn[j];
    }
    // Thomas
    for (let j = 1; j < NY; j++) { const m = a[j] / b[j - 1]; b[j] -= m * c[j - 1]; r[j] -= m * r[j - 1]; }
    Tn[NY - 1] = r[NY - 1] / b[NY - 1];
    for (let j = NY - 2; j >= 0; j--) Tn[j] = (r[j] - c[j] * Tn[j + 1]) / b[j];
    for (let j = 0; j < NY; j++) Tn[j] = clamp(Tn[j], -150, 1200);
  }
  let Tg = 0;
  for (let j = 0; j < NY; j++) {
    st.T[j] = Tn[j]; Tg += wRow[j] * Tn[j];
    const x0 = Math.max(20, K.A + K.B * Tn[j] - f.total), olr = Math.pow(Math.pow(x0, -8) + Math.pow(lim, -8), -1 / 8);
    absG += wRow[j] * L / 4 * sIns[j] * (1 - alb[j]); olrG += wRow[j] * olr;
  }
  d.Tg = Tg; d.abs = absG; d.olr = olrG; d.inS = L / 4; d.alb = 1 - absG / (L / 4); d.lim = lim;
  // ---- cells: temperature, ice, vegetation ----
  const life = st.life, plants = life.st >= 5, co2f = sstep(6, 60, st.A); // plants starve below ~10 ppm CO2
  const eS = 1 - Math.exp(-dt / 8), eSm = 1 - Math.exp(-dt / 3), eL = 1 - Math.exp(-dt / 4000), eLm = 1 - Math.exp(-dt / 1500), eV = 1 - Math.exp(-dt / 150);
  const hum = clamp(1 + 0.035 * (Tg - 15), 0.25, 1.6) * (ocean ? 1 : 0.05);
  let iceA = 0, landA = 0, wSum = 0, vegA = 0, prodO = 0, prodM = 0, hab = 0, oceanA = 0, covO = 0, covM = 0, liqA = 0;
  for (let j = 0; j < NY; j++) {
    const ca = cellA(j);
    for (let i = 0; i < NX; i++) {
      const k = j * NX + i, lf = st.lf[k];
      const Tl = Tn[j] - 6.5 * st.el[k], To = Tn[j];
      st.Tc[k] = lf > 0.5 ? Tl : To;
      const ieO = ocean ? clamp((-1.5 - To) / 6, 0, 1) : 0;
      const ieL = clamp((-5 - Tl) / 6, 0, 1) * (ocean ? 1 : 0.3);
      st.iceO[k] += (ieO - st.iceO[k]) * (ieO > st.iceO[k] ? eS : eSm);
      st.iceL[k] += (ieL - st.iceL[k]) * (ieL > st.iceL[k] ? eL : eLm);
      const il = st.iceL[k], io = st.iceO[k];
      let ve = 0;
      if (plants && lf > 0) ve = co2f * clamp(st.moist[k] * hum * 1.25, 0, 1) * sstep(-9, 6, Tl) * (1 - sstep(32, 44, Tl)) * (1 - il) * (st.reachOn ? st.reach[k] : 1);
      if (st.civ && st.civ.on) ve *= 1 - st.civ.lu * st.pop[k];
      st.veg[k] += (ve - st.veg[k]) * eV;
      iceA += ca * (lf * il + (ocean ? (1 - lf) * io : lf * 0 + (1 - lf) * il));
      landA += ca * lf;
      if (lf > 0) {
        const run = Math.max(0, 1 + 0.038 * (Tl - 15));
        wSum += ca * lf * (1 - il) * st.moist[k] * hum * Math.exp(0.06 * (Tl - 15)) * run;
        vegA += ca * lf * st.veg[k];
      }
      if (ocean) {
        const ow = ca * (1 - lf) * (1 - io);
        oceanA += ca * (1 - lf); liqA += ow;
        const po = ow * sstep(-2, 12, To) * (1 - sstep(30, 42, To)), pm = ow * sstep(-2, 4, To) * (1 - sstep(70, 95, To)), rc = st.reachOn ? st.reach[k] : 1;
        prodO += po; prodM += pm; covO += po * rc; covM += pm * rc;
        hab += ow * sstep(-2, 6, To) * (1 - sstep(35, 50, To)) + ca * lf * st.veg[k] * 0.3;
      }
    }
  }
  d.cover = prodM > 1e-6 ? covM / prodM : 0; d.coverO = prodO > 1e-6 ? covO / prodO : 0;
  d.liq = liqA; d.ice = iceA; d.land = landA; d.vegA = vegA; d.prodO = prodO / REF.po; d.prodM = prodM / REF.pm; d.wSum = wSum; d.prodOr = prodO; d.prodMr = prodM; d.hab = hab; d.oceanA = oceanA;
  // ---- carbon cycle (box model: atmosphere + ocean; volcanoes in, rock weathering and burial out) ----
  const vf = volc(st), V = K.V0 * vf * (1 + st.uplift * 0.3);
  let pulse = 0; st.pulses = st.pulses.filter(q => { const e = Math.min(dt, q.left); pulse += q.rate * e / dt; q.left -= dt; return q.left > 0; });
  const bioF = 0.25 + 0.75 * clamp(vegA / REF.veg, 0, 1);        // roots and soils speed up weathering
  const wl = ocean ? K.V0 * 0.8 * (wSum / REF.w) * bioF * (1 + st.uplift) : 0; // × √(CO2/280) below
  const Wsf = ocean ? K.V0 * 0.08 * Math.pow(st.A / 280, 0.25) * vf : 0;     // seafloor weathering (weak)
  const Pox = oxProd(st);                                                    // O2-making photosynthesis (today ≈ 1.15)
  const Bur = K.V0 * 0.2 * Pox / 1.15;                                       // organic carbon buried in mud
  let E = 0, cdr = 0; if (st.civ && st.civ.on) { E = st.civ.em / 2.13; cdr = st.civ.cdr / 2.13; }
  const Vp = V + pulse + E - Wsf - Bur - cdr - (st.drain || 0); // drain: a scenario's extra sink (fresh basalt soaking up CO2)
  const tot0 = st.A + st.O, kk = K.K_OC * (ocean ? 1 : 0.02);
  // implicit in the weathering: tot·x² + dt·Wa·x − (tot + dt·Vp) = 0,  x = √(tot_new / tot)
  const Wa = wl * Math.sqrt(st.A / 280);
  const qa = tot0, qb = dt * Wa, qc = Math.max(tot0 * 0.02, tot0 + dt * Vp);
  const x = (-qb + Math.sqrt(qb * qb + 4 * qa * qc)) / (2 * qa);
  const tot = Math.max(tot0 * x * x, 1 + kk), W = Wa * x;
  const S = (tot - tot0) / dt;                                               // net flux actually applied
  d.V = V + pulse; d.W = W + Wsf; d.Wl = W; d.Bur = Bur; d.E = E; d.cdr = cdr; d.S = S;
  // the atmosphere and ocean share CO2: fast exchange, slow under a frozen-over sea
  const tauEx = Math.min(4000, K.TAU_EX / Math.pow(Math.max(0.01, 1 - Math.min(0.995, iceFracOcean(st))), 2));
  const lam = (1 + 1 / kk) / tauEx, ex = Math.exp(-lam * dt);
  const dEq = S * tauEx * kk * kk / ((1 + kk) * (1 + kk));
  let dev = st.A - tot0 / (1 + kk);
  dev = dEq + (dev - dEq) * ex;
  st.A = clamp(tot / (1 + kk) + dev, 1, 2e7); st.O = Math.max(0, tot - st.A);
  // ---- oxygen (implicit) and methane ----
  const R = 4 * Math.exp(-st.t / 8e8) * vf;
  const rr = K.PAL_RATE * dt, cc = st.o2 + rr * (Pox - R), bb = rr * 1.05;
  const s = (-bb + Math.sqrt(bb * bb + 4 * Math.max(cc, 0))) / 2;
  st.o2 = clamp(Math.max(s * s, 1e-6), 1e-6, 2.2);
  d.Pox = Pox; d.R = R;
  const micro = life.st >= 1 ? d.prodM * (st.reachOn ? d.cover : 1) : 0;
  const ch4eq = 0.3 * vf + 900 * micro / (1 + 500 * st.o2) + (st.civ && st.civ.on ? st.civ.ch4 : 0);
  st.ch4 += (ch4eq - st.ch4) * (1 - Math.exp(-dt / 10));
  // ---- slow things ----
  st.uplift *= Math.exp(-dt / 2.5e7);
  if (st.drain) st.drain *= Math.exp(-dt / 1.2e7);
  st.dust *= Math.exp(-dt / 1.5);
  if (st.cloud) { st.cloud *= Math.exp(-dt / (st.civ && st.civ.on ? 40 : 4e7)); if (st.cloud < 0.05) st.cloud = 0; }
  st.ash *= Math.exp(-dt / 3e5);
  st.t += dt;
  return d;
}
function iceFracOcean(st) { let a = 0, o = 0; for (let j = 0; j < NY; j++) { const ca = cellA(j); for (let i = 0; i < NX; i++) { const k = j * NX + i, w = ca * (1 - st.lf[k]); o += w; a += w * st.iceO[k]; } } return o > 0 ? a / o : 0; }
function oxProd(st) {
  const L = st.life, d = st.d;
  let P = 0;
  if (L.st >= 2) P += (d.prodO || 0) * (st.reachOn ? d.coverO || 0 : 1) * (0.35 + 0.35 * L.euk) * (L.nudge === 'photo' ? 1.6 : 1) * (1 + 0.35 * Math.min(st.uplift, 4));
  if (L.st >= 5) P += 0.45 * clamp((d.vegA || 0) / REF.veg, 0, 1.3);
  return P;
}

// ================= the layer above the physics: plates, life, civilisation, events, tools =================
const STAGES = 8; // 0 none, 1 microbes, 2 cyanobacteria, 3 eukaryotes, 4 multicellular (sea), 5 land plants, 6 land animals, 7 intelligent life
// base rate (per Myr) to the next stage, and what it needs
const EVO = [
  null,
  { rate: 1 / 1000, nudge: 'photo' },                 // 1 → 2 oxygen-making photosynthesis
  { rate: 1 / 450, o2: 0.003, nudge: 'multi' },       // 2 → 3 cells with a nucleus (need some oxygen)
  { rate: 1 / 500, o2: 0.08, nudge: 'multi' },        // 3 → 4 many-celled life (need much more oxygen)
  { rate: 1 / 120, o2: 0.15, land: true, nudge: 'land' }, // 4 → 5 plants on land (ozone shield)
  { rate: 1 / 60, o2: 0.2, nudge: 'land' },           // 5 → 6 animals on land
  { rate: 1 / 450, o2: 0.25, nudge: 'mind' },         // 6 → 7 intelligence
];
const DIVK = [0, 4, 6, 10, 25, 55, 80, 100];
function movePlates(st, dt) {
  const my = dt / 1e6;
  for (let i = 0; i < st.plates.length; i++) {
    const P = st.plates[i];
    P.M = mul(rotM(P.ax, P.w * my * (st.drift == null ? 1 : st.drift)), P.M);
    if ((st.pk = (st.pk || 0) + 1) % 64 === 0) P.M = ortho(P.M);
    if (st.t >= P.next) { const r = rng((st.seed ^ P.seed) + (++P.ep) * 7919); P.ax = randAxis(r); P.w = (0.2 + r() * 0.6) * D2R; P.next = st.t + 2.5e8 + r() * 2e8; }
  }
  let dirty = false;
  for (const b of st.bumps) if (!b.fix) { const h0 = b.h; b.h *= Math.exp(-dt / (b.tau || 8e7)); if (Math.abs(h0 - b.h) > 0.02) dirty = true; }
  const nb = st.bumps.length; st.bumps = st.bumps.filter(b => b.fix || Math.abs(b.h) > 0.06); if (st.bumps.length !== nb) dirty = true;
  st.craters = st.craters.filter(c => st.t - c.t < 3e8);
  if (dirty) st.geoDirty = true;
}
function event(st, k, x) { const e = Object.assign({ t: st.t, k }, x || {}); st.ev.push(e); if (st.ev.length > 60) st.ev.splice(0, st.ev.length - 60); (st.news = st.news || []).push(e); onEvent(st, e); return e; }
function lifeStep(st, dt) {
  const L = st.life, d = st.d, my = dt / 1e6, F = st.flags;
  const ocean = st.wl > 0.05 && st.t > 8e7;
  if (L.st === 0) {
    if (ocean && !F.dead && d.prodM > 0.03) { L.pre += my / 450 * Math.min(1, d.prodM * 2); if (L.pre >= 1) startLife(st, birthCell(st), false); }
  } else if (L.st < 7) {
    const e = EVO[L.st];
    let ok = true;
    if (e.o2 && st.o2 < e.o2) ok = false;
    if (e.land && d.land < 0.03) ok = false;
    const hab = L.st >= 4 ? clamp(d.hab / REF.hab, 0, 1.2) : Math.min(1, d.prodM * 1.5);
    if (ok) {
      const boost = L.nudge && L.nudge === e.nudge ? 4 : 1;
      L.prog += my * e.rate * hab * boost * (F.snow ? 0.1 : 1);
      if (L.prog >= 1) { L.st++; L.prog = 0; event(st, 'stage', { st: L.st }); }
    }
  }
  if (L.st >= 3) L.euk = Math.min(1, L.euk + my / 800);
  spread(st, dt);
  // diversity: the variety of life the planet can hold right now
  const rate = Math.abs(d.Tg - (st.tRef == null ? d.Tg : st.tRef)); // °C away from the last ~50 kyr
  st.tRef = st.tRef == null ? d.Tg : st.tRef + (d.Tg - st.tRef) * (1 - Math.exp(-dt / 5e4));
  const stress = 1 / (1 + (rate / 4) ** 2);
  let Kd = DIVK[L.st] * clamp(d.hab / REF.hab, 0, 1.15) * stress * (F.snow ? 0.3 : 1);
  if (st.civ && st.civ.on) Kd *= 1 - 0.5 * st.civ.lu;
  const tauUp = 2e7, tauDn = 3e5;
  L.div += (Kd - L.div) * (1 - Math.exp(-dt / (Kd > L.div ? tauUp : tauDn)));
  // mass extinction: the variety drops by half within a few million years
  L.peak = Math.max(L.div, (L.peak || 0) * Math.exp(-dt / 3e6));
  if (L.st >= 4 && L.div < 0.5 * L.peak && L.peak > 20 && !(F.extT > st.t - 5e6)) {
    F.extT = st.t; F.ext = (F.ext || 0) + 1;
    event(st, 'extinct', { why: whyHarsh(st, rate) });
  }
  // complex life cannot survive a long, harsh spell
  const harsh = F.snow || d.Tg > 48 || d.Tg < -14 || st.o2 < 0.04 || !ocean;
  F.harsh = harsh && L.st >= 4 ? (F.harsh || 0) + dt : Math.max(0, (F.harsh || 0) - dt * 2);
  if (L.st >= 4 && F.harsh > 3e6) {
    const why = whyHarsh(st, rate);
    L.st = 3; L.prog = 0; L.div = Math.min(L.div, 8); F.harsh = 0;
    if (st.civ && st.civ.on) endCiv(st, 'climate');
    event(st, 'wipe', { why });
  }
  // only boiling oceans end microbial life
  if (L.st > 0 && !ocean && st.t > 1e8) { L.st = 0; L.prog = 0; L.pre = 0; L.div = 0; F.dead = 1; st.reach.fill(0); event(st, 'dead'); }
}
// ---- life spreads from where it began (a toy abstraction: a front that crawls through the sea, then over the land) ----
function cellOf(lat, lon) { const j = clamp(Math.floor((90 - lat) / 180 * NY), 0, NY - 1), i = ((Math.floor((lon + 180) / 360 * NX) % NX) + NX) % NX; return j * NX + i; }
function cellLL(c) { const j = (c / NX) | 0, i = c % NX; return [latC[j], -180 + (i + 0.5) * 360 / NX]; }
function angDeg(a1, o1, a2, o2) { const p = dirOf(a1, o1), q = dirOf(a2, o2); return Math.acos(clamp(p[0] * q[0] + p[1] * q[1] + p[2] * q[2], -1, 1)) / D2R; }
function nearSea(st, c, rad) { // the closest ocean cell within rad cells (or -1)
  if (st.lf[c] < 0.5) return c;
  const j0 = (c / NX) | 0, i0 = c % NX; let best = -1, bd = 1e9;
  for (let dj = -rad; dj <= rad; dj++) for (let di = -rad; di <= rad; di++) { const j = j0 + dj; if (j < 0 || j >= NY) continue; const k = j * NX + ((i0 + di + NX) % NX), dd = dj * dj + di * di; if (st.lf[k] < 0.5 && dd < bd) { bd = dd; best = k; } }
  return best;
}
function habitable(st, c) {
  const L = st.life, land = st.lf[c] >= 0.5, T = st.Tc[c];
  if (land) return L.st >= 5 && st.iceL[c] < 0.6 && T > -12 && T < 46;
  return st.wl > 0.05 && st.iceO[c] < 0.92 && T > -4 && T < 62;
}
function birthCell(st) {
  const v = (st.volcs || []).filter(x => st.t - x.t < 5e7).slice(-1)[0];
  if (v) { const c = nearSea(st, cellOf(v.lat, v.lon), 4); if (c >= 0) return c; }
  const r = rng((st.seed ^ 0xbe11) >>> 0), cand = [];
  for (let c = 0; c < N; c++) if (st.lf[c] < 0.5 && habitable(st, c)) cand.push(c);
  if (!cand.length) for (let c = 0; c < N; c++) if (st.lf[c] < 0.5) cand.push(c);
  return cand.length ? cand[Math.floor(r() * cand.length)] : 0;
}
function plant(st, c, v) {
  const j = (c / NX) | 0, i = c % NX;
  st.reach[c] = Math.max(st.reach[c], v);
  for (const [dj, di] of [[0, 1], [0, -1], [1, 0], [-1, 0]]) { const jj = j + dj; if (jj < 0 || jj >= NY) continue; const k = jj * NX + ((i + di + NX) % NX); st.reach[k] = Math.max(st.reach[k], v * 0.4); }
}
function startLife(st, c, seeded) {
  const L = st.life; L.st = 1; L.prog = 0; L.pre = 1; if (seeded) L.seedT = st.t;
  st.reachOn = true; st.reach.fill(0); plant(st, c, 1);
  const [lat, lon] = cellLL(c);
  event(st, 'life', { seeded: !!seeded, lat, lon });
  ventCombo(st, lat, lon);
}
function ventCombo(st, lat, lon) { // life next to a fresh volcano: warm, mineral-rich water
  const v = (st.volcs || []).find(x => st.t - x.t < 2e7 && angDeg(lat, lon, x.lat, x.lon) < 28);
  if (!v) return false;
  st.boost = st.t + 3e7; if (st.life.st < 7) st.life.prog = Math.min(0.95, st.life.prog + 0.15);
  combo(st, 'vent', lat, lon); return true;
}
function combo(st, id, lat, lon) { if (!st.combos.includes(id)) st.combos.push(id); event(st, 'combo', { id, lat, lon }); }
const SPREAD = 5.5e-7; // per year: the front crosses half the globe in roughly 30 million years
const nbuf = new Float32Array(N);
function spread(st, dt) {
  const L = st.life; if (!st.reachOn || L.st === 0) return;
  const r = st.reach, k = SPREAD * (st.t < st.boost ? 3 : 1) * dt;
  nbuf.set(r);
  for (let j = 0; j < NY; j++) for (let i = 0; i < NX; i++) {
    const c = j * NX + i, a = nbuf[c];
    let nb = Math.max(nbuf[j * NX + (i + 1) % NX], nbuf[j * NX + (i + NX - 1) % NX]);
    if (j > 0) nb = Math.max(nb, nbuf[c - NX]); if (j < NY - 1) nb = Math.max(nb, nbuf[c + NX]);
    if (habitable(st, c)) r[c] = Math.min(1, a + Math.min(0.5, k * (nb + 3 * a)) * (1 - a));
    else if (a > 0) r[c] = Math.max(0.02, a * Math.exp(-dt / 2e6));
  }
}
function whyHarsh(st, rate) {
  const d = st.d, F = st.flags;
  if (st.lastImpact && st.t - st.lastImpact < 2e6) return 'impact';
  if (F.snow) return 'snow';
  if (d.Tg > 40) return 'hot';
  if (d.Tg < -5) return 'cold';
  if (st.o2 < 0.05) return 'anoxia';
  if (rate > 3) return 'rapid';
  if (st.civ && st.civ.on && st.civ.lu > 0.4) return 'civ';
  return 'rapid';
}
function checks(st, dt) {
  const d = st.d, F = st.flags;
  // snowball
  if (!F.snow && d.ice > 0.8 && st.wl > 0.05) { F.snow = 1; F.snowT = st.t; event(st, 'snow', { co2: st.A, why: snowWhy(st) }); }
  else if (F.snow && d.ice < 0.45) { F.snow = 0; F.snowEsc = (F.snowEsc || 0) + 1; event(st, 'thaw', { dur: st.t - F.snowT, co2: st.A }); }
  // great oxidation
  if (!F.goe && st.o2 > 0.002) { F.goe = 1; event(st, 'goe'); }
  // too hot: the oceans boil away and the hydrogen escapes to space
  if (st.wl > 0.01 && d.Tg > 65) {
    if (!F.boil) { F.boil = 1; event(st, 'boil', { why: boilWhy(st) }); }
    const loss = st.wl * (1 - Math.exp(-dt / 3e7)) * sstep(65, 110, d.Tg);
    st.wl -= loss; st.lost += loss; st.wlDirty = (st.wlDirty || 0) + loss;
    if (st.wl < 0.05) { st.lost += st.wl; st.wl = 0; st.wlDirty = 1; if (!F.dry) { F.dry = 1; event(st, 'dry'); } }
  } else if (F.boil && d.Tg < 55) F.boil = 0;
  // the young planet: steam rains out into the first ocean
  if (st.t < 1.2e8) { const tgt = Math.max(0, st.p.water - st.lost) * sstep(3e7, 9e7, st.t); if (Math.abs(tgt - st.wl) > 0.01) { st.wl = tgt; st.wlDirty = 1; } }
  if (st.wlDirty && Math.abs(st.wlDirty) > 0.01) { st.wlDirty = 0; seaLevel(st); }
}
function snowWhy(st) {
  const d = st.d;
  if (st.lastCh4 && st.lastCh4 > st.ch4 * 4) return 'ch4';
  if (lum(st.t) / (st.p.dist * st.p.dist) < 0.8) return 'sun';
  if (st.A < 200) return 'co2';
  return 'co2';
}
function boilWhy(st) { const s = lum(st.t) / (st.p.dist * st.p.dist); return s > 1.05 ? 'sun' : 'co2'; }

// ---- civilisation (years) ----
function startCiv(st) {
  st.civ = { on: true, y: 0, pop: 0.7, tech: 8, fos: 5000, res: 100, stab: 75, pol: { en: 0, rs: 1, env: 1 }, T0: st.d.Tg, cum: 0, em: 0, cdr: 0, aer: 0, ch4: 0, lu: 0.05, food: 1, short: 0, why: null, space: false, clean: [], trees: 0, cs: 0 };
  event(st, 'civ');
}
function endCiv(st, why) { const c = st.civ; if (!c || !c.on) return; c.on = false; c.why = why; c.endY = c.y; st.civRest = st.t + 5e4; st.flags.collapse = (st.flags.collapse || 0) + 1; event(st, 'collapse', { why }); }
function civStep(st, dt) {
  const c = st.civ, d = st.d;
  if (!c || !c.on) {
    if (st.life.st >= 7 && !st.noCiv && !(st.t < st.civRest) && d.Tg > -5 && d.Tg < 35 && !st.flags.snow) startCiv(st);
    return;
  }
  c.y += dt;
  const dT = d.Tg - c.T0, p = c.pol;
  c.food = clamp(1 - 0.1 * Math.pow(Math.max(0, dT - 1), 1.4) - 0.15 * Math.pow(Math.max(0, -dT - 1), 1.4), 0.05, 1) * clamp(d.hab / REF.hab, 0.2, 1.1);
  const renCap = clamp((c.tech - 12) / 55, 0, 0.95);
  if ((st.civT = (st.civT || 0) + dt) >= 10 || c.cs == null) { st.civT = 0; c.cs = cleanShare(st); } // cities that got an idea run on sun and wind
  const r = Math.max(renCap * [0.25, 0.65, 1][p.en], c.cs * 0.92);
  let f = Math.min(1 - r, [1, 0.8, 0.45][p.en]); if (c.fos <= 0) f = 0;
  const supply = Math.min(1, r + f); c.short = 1 - supply;
  const demand = c.pop * (0.35 + 0.02 * c.tech);
  const fosE = demand * f * 0.62;
  c.fos = Math.max(0, c.fos - fosE * dt); c.cum += fosE * dt;
  const lu = [0.9, 0.3, -0.5][p.env] * Math.min(1, c.pop / 8) * (c.tech < 90 ? 1 : 0.5);
  c.cdr = (p.env === 2 ? clamp((c.tech - 45) / 40, 0, 1) * 4 : 0) + Math.min(2.4, 0.4 * (c.trees || 0)); // planted forests soak up CO2
  c.em = fosE + lu; c.aer = 0.1 * demand * f * [1, 0.8, 0.6][p.en];
  c.ch4 = 0.12 * c.pop * [1, 0.8, 0.6][p.env];
  const luT = [0.55, 0.35, 0.18][p.env] * Math.min(1, c.pop / 8); c.lu += (luT - c.lu) * (1 - Math.exp(-dt / 30));
  c.res = Math.max(0, c.res - dt * demand * [0.07, 0.04, 0.015][p.rs] * (1 - c.tech / 250));
  const stabF = clamp(c.stab / 60, 0.2, 1.1);
  const econ = supply * (c.res < 30 ? 0.4 + 0.6 * c.res / 30 : 1) * stabF * (c.tech < 40 ? [1, 0.92, 0.8][p.en] : 1) * [1.05, 0.95, 0.88][p.rs] * [1.05, 1, 0.9][p.env] * (p.env === 2 && c.cdr > 0 ? 0.95 : 1);
  c.econ = econ;
  c.tech = Math.min(100, c.tech + dt * 0.24 * econ * (0.6 + c.tech / 100));
  const Kp = (1.2 + 10.5 * Math.min(1, c.tech / 60)) * c.food;
  c.pop = Math.max(0.05, c.pop + dt * 0.03 * c.pop * (1 - c.pop / Kp) * (econ > 0.5 ? 1 : 0.5));
  const terms = { heat: 14 * Math.max(0, dT - 1.5), cold: 10 * Math.max(0, -dT - 1), energy: 60 * c.short, res: c.res < 25 ? (25 - c.res) * 2.2 : 0, food: c.food < 0.85 ? (0.85 - c.food) * 120 : 0, nature: st.life.div < 40 ? (40 - st.life.div) * 0.6 : 0 };
  let worst = 'heat', wv = -1, sum = 0; for (const k in terms) { sum += terms[k]; if (terms[k] > wv) { wv = terms[k]; worst = k; } }
  c.worst = wv > 3 ? worst : null;
  const target = clamp(85 - sum + 5 * (econ - 0.8), 0, 100);
  c.stab += (target - c.stab) * (1 - Math.exp(-dt / 12));
  // farms and cities take the wild land; a hotter world loses species too
  const L = st.life, loss = 0.12 * Math.max(0, c.lu - 0.3) / 0.25 + 0.04 * Math.max(0, dT - 2);
  L.div = Math.max(0, L.div - dt * loss + (loss === 0 ? dt * 0.01 : 0));
  if (c.tech >= 100 && !c.space) { c.space = true; event(st, 'space'); }
  if (c.stab < 8) endCiv(st, worst);
}
// where people live (for the night lights): mild, wet, low land near the sea
function popMap(st) {
  const c = st.civ, on = c && c.on;
  for (let k = 0; k < N; k++) {
    if (!on || st.lf[k] < 0.3) { st.pop[k] = 0; continue; }
    const T = st.Tc[k], m = st.moist[k];
    st.pop[k] = clamp(sstep(-2, 10, T) * (1 - sstep(28, 38, T)) * clamp(m * 1.4, 0, 1) * (1 - st.iceL[k]) * Math.exp(-st.el[k] / 1.5) * Math.min(1, 0.3 + c.pop / 8), 0, 1);
  }
}

// ---- the main clock ----
function advance(st, years, o) {
  o = o || {};
  let left = years, n = 0;
  while (left > 1e-9) {
    const civOn = st.civ && st.civ.on;
    const maxDt = civOn ? 2 : (o.coarse || (st.t < 1e8 ? 2e4 : 1e4));
    const dt = Math.min(left, maxDt);
    movePlates(st, dt);
    if (st.geoDirty || st.t - st.geoT > (o.geoEvery || (st.drift < 0.5 ? 1e7 : 2e6))) geology(st);
    if (st.civ && st.civ.on) popMap(st);
    st.lastCh4 = st.lastCh4 == null ? st.ch4 : st.lastCh4 + (st.ch4 - st.lastCh4) * (1 - Math.exp(-dt / 2e6));
    step(st, dt);
    checks(st, dt);
    lifeStep(st, dt);
    civStep(st, dt);
    msCheck(st); surprise(st);
    st.aur *= Math.exp(-dt / (st.civ && st.civ.on ? 30 : 2e7));
    left -= dt; n++;
    if (o.maxSteps && n >= o.maxSteps) break;
  }
  return n;
}

// ---- tools ----
function plateAt(st, v) { // which plate carries this point (the one whose map is highest there)
  let best = -1, bh = -1e9;
  st.plates.forEach((P, i) => { const M = P.M, qz = M[2] * v[0] + M[5] * v[1] + M[8] * v[2], rr = P.r * growth(st.t); if (qz > Math.cos(rr * 1.2) && qz > bh) { bh = qz; best = i; } });
  return best;
}
function toLocal(st, pl, v) { if (pl < 0) return v.slice(); const M = st.plates[pl].M; return [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]]; }
function bump(st, lat, lon, h, rDeg, o) {
  const v = dirOf(lat, lon), pl = o && o.fixed ? -1 : plateAt(st, v);
  st.bumps.push({ pl, lp: toLocal(st, pl, v), r: rDeg * D2R, h, fix: !!(o && o.fixed), tau: o && o.tau });
  if (st.bumps.length > 48) st.bumps.splice(0, st.bumps.length - 48);
  st.geoDirty = true;
}
function coastal(st, c) { const j = (c / NX) | 0, i = c % NX; let land = 0, sea = 0; for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) { const jj = j + dj; if (jj < 0 || jj >= NY) continue; const k = jj * NX + ((i + di + NX) % NX); if (st.lf[k] >= 0.5) land++; else sea++; } return land > 0 && sea > 0; }
// the player's verbs. Each returns true when it did something (scenarios count those against the budget)
const tools = {
  volcano(st, lat, lon, nat) {
    st.pulses.push({ rate: (9000 + 0.3 * Math.min(st.A, 2e6)) / 1e5, left: 1e5 }); // a caricature: an eruption always matters, even under a thick sky
    st.dust += 4; st.ash = Math.min(0.2, st.ash + 0.05);
    bump(st, lat, lon, 1.6, 2.6, { tau: 4e7 });
    const near = (st.volcs || []).filter(v => st.t - v.t < 1e6 && angDeg(lat, lon, v.lat, v.lon) < 22).length;
    (st.volcs = st.volcs || []).push({ lat, lon, t: st.t }); if (st.volcs.length > 12) st.volcs.shift();
    event(st, 'volcano', { lat, lon });
    if (near >= 2 && !nat) { // three vents in one place: a flood-basalt eruption
      st.pulses.push({ rate: 30000 / 2e5, left: 2e5 }); st.dust += 25; st.ash = Math.min(0.25, st.ash + 0.06);
      combo(st, 'super', lat, lon);
    }
    if (!nat && st.life.st > 0 && st.reachOn && st.reach[cellOf(lat, lon)] > 0.05) ventCombo(st, lat, lon);
    return true;
  },
  // the sculpting brush: one dab raises (or digs) a smooth hill of the given radius. o.cont = the same stroke goes on (quieter news)
  raise(st, lat, lon, o) {
    const c = cellOf(lat, lon), coast = st.wl > 0.05 && coastal(st, c);
    sculpt(st, lat, lon, (o && o.amt) || 0.75, (o && o.rad) || 6);
    st.uplift = Math.min(4, st.uplift + 0.3);
    if (!(o && o.cont)) event(st, 'raise', { lat, lon });
    if (coast && !(o && o.cont)) { st.uplift = Math.min(4, st.uplift + 0.35); combo(st, 'rain', lat, lon); } // wet winds hit fresh rock: fast weathering, rich runoff
    return true;
  },
  sink(st, lat, lon, o) {
    const c = cellOf(lat, lon), gate = Math.abs(lat) >= 38 && st.lf[c] >= 0.5 && st.wl > 0.05;
    sculpt(st, lat, lon, -((o && o.amt) || 1.25), (o && o.rad) || 6);
    st.uplift = Math.max(0, st.uplift - 0.2);
    if (!(o && o.cont)) event(st, 'sink', { lat, lon });
    if (gate && !(o && o.cont)) combo(st, 'current', lat, lon); // a high-latitude seaway lets warm water reach the pole
    return true;
  },
  // rain: wet the land under the brush (forests can grow in a desert); on a planet without seas, it brings water back
  rain(st, lat, lon) {
    if (st.wl < 0.05) { st.p.water = Math.min(3, st.p.water + 0.04); st.wl += 0.04; st.lost = Math.max(0, st.lost - 0.04); st.wlDirty = 1; if (st.flags.dry && st.wl > 0.1) st.flags.dry = 0; if (st.flags.dead && st.wl > 0.1) st.flags.dead = 0; }
    const v = dirOf(lat, lon);
    for (let c = 0; c < N; c++) { const [a, o] = cellLL(c), q = dirOf(a, o), d = v[0] * q[0] + v[1] * q[1] + v[2] * q[2]; if (d > 0.97) st.wet[c] = Math.min(0.9, st.wet[c] + 0.5 * sstep(0.97, 0.995, d)); }
    moisture(st); event(st, 'rain', { lat, lon });
    return true;
  },
  // bright clouds: reflect sunlight for a while (a fix for a planet that is too hot)
  cool(st, lat, lon) { st.cloud = Math.min(30, (st.cloud || 0) + 6); event(st, 'cool', { lat, lon }); return true; },
  // an idea for a city: it switches to clean energy (only where people live)
  idea(st, lat, lon) {
    const c = st.civ; if (!c || !c.on) return false;
    const cs = cities(st); let best = null, bd = 12;
    for (const x of cs) { const d = angDeg(lat, lon, x.lat, x.lon); if (d < bd) { bd = d; best = x; } }
    if (!best) return false;
    c.clean = c.clean || []; if (c.clean.includes(best.c)) return false;
    c.clean.push(best.c); event(st, 'idea', { lat: best.lat, lon: best.lon });
    return true;
  },
  asteroid(st, lat, lon, nat) {
    const c = cellOf(lat, lon), icy = Math.max(st.iceL[c] * (st.lf[c] >= 0.5 ? 1 : 0), st.iceO[c] * (st.lf[c] < 0.5 ? 1 : 0)) > 0.5;
    const melt = icy && !nat;
    st.dust += melt ? 25 : 90; st.lastImpact = st.t; st.ash = Math.min(melt ? 0.32 : 0.2, st.ash + (melt ? 0.14 : 0.06));
    st.pulses.push({ rate: 400 / 1e3, left: 1e3 });
    if (st.life.st >= 4) st.life.div *= 0.45; else st.life.div *= 0.85;
    st.craters.push({ lat, lon, r: 5, t: st.t }); if (st.craters.length > 24) st.craters.shift();
    if (st.t < 1.2e9 || st.wl < 0.05) { st.p.water = Math.min(3, st.p.water + 0.08); st.wl += 0.08; st.lost = Math.max(0, st.lost - 0.08); st.wlDirty = 1; if (st.wl > 0.1) { st.flags.dry = 0; st.flags.dead = 0; } } // icy comets bring water (a dry planet can be saved)
    if (!nat || st.t > 1.5e8) addMark(st, 'cry', lat, lon);
    if (st.civ && st.civ.on) { st.civ.stab -= 70; st.civ.pop *= 0.6; }
    event(st, 'impact', { lat, lon });
    if (melt) combo(st, 'melt', lat, lon);
    return true;
  },
  seed(st, lat, lon) { // start life here, or carry it to a new place
    const L = st.life;
    if (st.flags.dead) return false;
    if (L.st > 0) {
      if (lat == null || !st.reachOn) return false;
      let c = cellOf(lat, lon); if (st.lf[c] >= 0.5 && L.st < 5) c = nearSea(st, c, 2);
      if (c < 0 || !habitable(st, c)) return false;
      plant(st, c, 0.8); event(st, 'sow', { lat, lon }); ventCombo(st, lat, lon);
      if (st.civ && st.civ.on && st.lf[c] >= 0.5) st.civ.trees = (st.civ.trees || 0) + 1;
      return true;
    }
    if (!(st.wl > 0.05 && st.t > 8e7 && st.d.prodM > 0.02)) return false;
    let c = lat == null ? birthCell(st) : nearSea(st, cellOf(lat, lon), 3);
    if (c < 0) return false;
    startLife(st, c, true); return true;
  },
};
// what is about to go wrong (the HUD turns this into a warning with a suggested tool)
function danger(st) {
  const d = st.d, F = st.flags, ocean = st.wl > 0.05;
  let k = null, lv = 0;
  if (F.snow && ocean) return { k: 'frozen', lv: 1 };
  if (ocean) { const a = sstep(0.35, 0.75, d.ice || 0); if (a > lv) { lv = a; k = 'snow'; } const b = sstep(36, 65, d.Tg); if (b > lv) { lv = b; k = 'boil'; } }
  if (st.civ && st.civ.on) { const c = sstep(50, 12, st.civ.stab); if (c > lv) { lv = c; k = 'civ'; } }
  return { k, lv };
}
// the journey of a planet: the milestones a free-mode player chases
const MS = ['ocean', 'life', 'sky', 'forest', 'animals', 'civ', 'space'];
function msCheck(st) {
  const m = st.ms, L = st.life, d = st.d;
  const hit = k => { if (m[k] == null) { m[k] = st.t; event(st, 'ms', { m: k }); } };
  if (st.wl > 0.3 && st.t > 8e7 && (d.liq || 0) > 0.2) hit('ocean');
  if (L.st >= 1) hit('life');
  if (st.o2 > 0.002) hit('sky');
  if (L.st >= 5 && landVeg(st) > 0.12) hit('forest');
  if (L.st >= 6) hit('animals');
  if (st.civ) hit('civ');
  if (st.civ && st.civ.space) hit('space');
}
// surprises in free mode: now and then the universe does something on its own
function surprise(st) {
  if (!st.surp || st.t < 1.5e8 || (st.civ && st.civ.on)) return;
  if (!st.nextSurp) { st.nextSurp = st.t + 2e8 + rng((st.seed ^ 0x5eed) >>> 0)() * 3e8; return; }
  if (st.t < st.nextSurp) return;
  const r = rng(((st.seed ^ 0xace) + Math.floor(st.t / 1e6)) >>> 0), x = r(), lat = (r() * 2 - 1) * 55, lon = r() * 360 - 180;
  if (x < 0.4) { tools.asteroid(st, lat, lon, true); event(st, 'surprise', { s: 'meteor', lat, lon }); }
  else if (x < 0.7) { st.aur = 1; event(st, 'surprise', { s: 'flare' }); }
  else { for (let i = 0; i < 3; i++) tools.volcano(st, lat + i * 3, lon + i * 4, true); st.pulses.push({ rate: 20000 / 2e5, left: 2e5 }); event(st, 'surprise', { s: 'trap', lat, lon }); }
  st.nextSurp = st.t + 2.5e8 + r() * 3.5e8;
}
function setParam(st, k, v) {
  const p = st.p;
  if (k === 'co2') { st.A = v; st.O = v * K.K_OC; return; }
  if (k === 'water') { const dw = v - p.water; p.water = v; if (st.t >= 1.2e8) { st.wl = Math.max(0, st.wl + dw); } st.wlDirty = 1; seaLevel(st); return; }
  p[k] = v;
}

// ================= the 2026-11 world: sculpting, marks to discover, species, eras, cities =================
// Sculpting: a list of brush dabs (ops) builds a world-fixed height field that is added to the plates' terrain.
// Each op is [lat°, lon°, km (×0.25), big] so the same list always rebuilds exactly the same terrain (saves and share URLs keep the list).
const OPS_MAX = 600;
function stamp(F, lat, lon, a, big) {
  const rD = big ? 10 : 6, r = rD * D2R, k2 = 2 / (r * r), v = dirOf(lat, lon), cmin = Math.cos(r * 2.6);
  const j0 = clamp(Math.floor((90 - lat - rD * 2.7) / 180 * HY), 0, HY - 1), j1 = clamp(Math.ceil((90 - lat + rD * 2.7) / 180 * HY), 0, HY - 1);
  for (let j = j0; j <= j1; j++) for (let i = 0; i < HX; i++) {
    const k = j * HX + i, d = PX[k] * v[0] + PY[k] * v[1] + PZ[k] * v[2];
    if (d > cmin) F[k] += a * Math.exp(-(1 - d) * k2);
  }
}
function rebuildSculpt(st) { st.sculpt.fill(0); for (const o of st.ops) stamp(st.sculpt, o[0], o[1], o[2], o[3]); }
function refreshElev(st) { const E = st.elev, B = st.base, F = st.sculpt; for (let k = 0; k < HN; k++) E[k] = B[k] + clamp(F[k], -9, 9); seaLevel(st); }
function sculpt(st, lat, lon, amt, rad) {
  const la = clamp(Math.round(lat), -89, 89), lo = ((Math.round(lon) + 180) % 360 + 360) % 360 - 180, big = rad > 8 ? 1 : 0, sg = Math.sign(amt);
  let op = null;
  for (let i = st.ops.length - 1; i >= Math.max(0, st.ops.length - 32); i--) { const q = st.ops[i]; if (q[3] === big && Math.sign(q[2]) === sg && angDeg(q[0], q[1], la, lo) < 2.5) { op = q; break; } }
  if (!op && st.ops.length >= OPS_MAX) { let bd = 9; for (const q of st.ops) { const d = angDeg(q[0], q[1], la, lo); if (Math.sign(q[2]) === sg && d < bd) { bd = d; op = q; } } if (!op) return false; }
  if (!op) { op = [la, lo, 0, big]; st.ops.push(op); }
  const a0 = op[2], a1 = clamp(Math.round((a0 + amt) * 4) / 4, -8, 7.75);
  op[2] = a1; if (a1 !== a0) stamp(st.sculpt, op[0], op[1], a1 - a0, op[3]);
  if (a1 === 0) st.ops.splice(st.ops.indexOf(op), 1);
  refreshElev(st);
  return true;
}
// ops ⇄ 4 characters each (lat 8 bits, lon 9 bits, km/4 signed 6 bits, big 1 bit) — the share URL carries the sculpting this way
function opsCode(ops) {
  let o = '';
  for (const q of ops) { const n = ((q[0] + 90) & 255) | ((((q[1] + 180) % 360 + 360) % 360) << 8) | ((Math.round(q[2] * 4) + 32 & 63) << 17) | ((q[3] ? 1 : 0) << 23); o += B64[n & 63] + B64[(n >> 6) & 63] + B64[(n >> 12) & 63] + B64[(n >> 18) & 63]; }
  return o;
}
function opsRead(str) {
  const out = []; if (typeof str !== 'string') return out;
  for (let i = 0; i + 3 < str.length && out.length < OPS_MAX; i += 4) {
    let n = 0, bad = false; for (let k = 0; k < 4; k++) { const q = B64.indexOf(str[i + k]); if (q < 0) bad = true; n |= q << (6 * k); }
    if (bad) continue;
    const la = (n & 255) - 90, lo = ((n >> 8) & 511) - 180, a = (((n >> 17) & 63) - 32) / 4, big = (n >> 23) & 1;
    if (la < -89 || la > 89 || lo < -180 || lo > 179 || !a) continue;
    out.push([la, lo, a, big]);
  }
  return out;
}
function applyOps(st, ops) { st.ops = ops.map(q => q.slice()); rebuildSculpt(st); refreshElev(st); }

// ---- marks: things that something left behind, for the explorer to find ----
const MARK_MAX = 48;
const SPARK = { sp: 3, sea: 2, cry: 2, fos: 2, ruin: 4, aur: 3, vent: 3, tree: 3, city: 3, rocket: 5, lib: 4, geyser: 3, lava: 3, arch: 4, shell: 2, ice: 3, flag: 4, bloom: 3 };
function landCell(st, r, cond) {
  const c0 = Math.floor(r() * N);
  for (let s = 0; s < N; s++) { const c = (c0 + s * 769) % N; if (st.lf[c] >= 0.6 && (!cond || cond(c))) return c; }
  for (let s = 0; s < N; s++) { const c = (c0 + s * 769) % N; if (st.lf[c] >= 0.5) return c; }
  return c0;
}
function addMark(st, k, lat, lon, x) {
  st.markN = (st.markN || 0) + 1;
  const m = Object.assign({ id: k + st.markN, k, lat: Math.round(lat * 10) / 10, lon: Math.round(lon * 10) / 10, t: Math.round(st.t) }, x || {});
  st.marks.push(m);
  if (st.marks.length > MARK_MAX) { const i = st.marks.findIndex(q => st.found.includes(q.id)); st.marks.splice(i >= 0 ? i : 0, 1); }
  st.sitesAt = -1;
  return m;
}
function markAtCell(st, k, c, x) { const [a, o] = cellLL(c), r = rng((st.seed ^ (st.markN || 0) * 2654435761) >>> 0); return addMark(st, k, a + (r() - 0.5) * 4, o + (r() - 0.5) * 4, x); }
function topCell(st, f) { let b = -1, bv = -1e9; for (let c = 0; c < N; c++) { if (st.lf[c] < 0.5) continue; const v = f(c); if (v > bv) { bv = v; b = c; } } return b; }
function onEvent(st, e) { // what each happening leaves behind
  if (st.noMarks) return;
  const r = rng((st.seed ^ Math.floor(st.t / 1e3) ^ (st.markN || 0) * 40503) >>> 0);
  if (e.k === 'life') addMark(st, 'vent', e.lat, e.lon);
  else if (e.k === 'stage' && (e.st === 5 || e.st === 6)) markAtCell(st, 'fos', landCell(st, r), { era: e.st - 1 });
  else if (e.k === 'extinct') markAtCell(st, 'fos', landCell(st, r), { era: st.life.st });
  else if (e.k === 'collapse') { const c = topCell(st, q => st.pop[q]); if (c >= 0) markAtCell(st, 'ruin', c); }
  else if (e.k === 'ms' && e.m === 'forest') { const c = topCell(st, q => st.veg[q]); if (c >= 0) markAtCell(st, 'tree', c); }
  else if (e.k === 'ms' && e.m === 'sky') { const lo = r() * 360 - 180; addMark(st, 'aur', 71 + r() * 6, lo); addMark(st, 'aur', -(71 + r() * 6), lo + 120 - 360 * (lo + 120 > 180)); }
  else if (e.k === 'ms' && e.m === 'civ') { const c = topCell(st, q => cityScore(st, q)); if (c >= 0) markAtCell(st, 'city', c); }
  else if (e.k === 'ms' && e.m === 'space') { const cs = cities(st); if (cs.length) addMark(st, 'rocket', cs[0].lat + 1.5, cs[0].lon + 1.5); }
}
function cityScore(st, c) { const T = st.Tc[c]; return sstep(-2, 10, T) * (1 - sstep(28, 38, T)) * clamp(st.moist[c] * 1.4, 0, 1) * (1 - st.iceL[c]) * Math.exp(-st.el[c] / 1.5); }

// ---- species: little creatures assembled from parts, with names made from syllables (the same in both languages) ----
const SP_FEAT = [['ツノ', 'Horned'], ['ナガクビ', 'Longneck'], ['マル', 'Round'], ['トゲ', 'Spiny'], ['ハネ', 'Winged'], ['シマ', 'Striped'], ['オオ', 'Great'], ['ヒカリ', 'Glowing']];
const SP_SYL = [['モ', 'mo'], ['フ', 'fu'], ['ポ', 'po'], ['ル', 'ru'], ['ピ', 'pi'], ['ノ', 'no'], ['ク', 'ku'], ['ミ', 'mi'], ['タ', 'ta'], ['ロ', 'ro'], ['ナ', 'na'], ['キ', 'ki']];
const SP_END = [['ドン', 'don'], ['リン', 'rin'], ['ポン', 'pon'], ['ザウル', 'saur'], ['モ', 'mo'], ['キュー', 'kyu'], ['ペン', 'pen'], ['ゴロ', 'goro']];
const HABS = ['forest', 'grass', 'desert', 'snow', 'grass', 'forest'];
function species(st, i, sea) {
  const r = rng(((st.seed >>> 0) * 7919 + i * 104729 + (sea ? 77 : 0)) ^ 0x5bec1e5);
  const f = Math.floor(r() * SP_FEAT.length), a = Math.floor(r() * SP_SYL.length), b = Math.floor(r() * SP_SYL.length), e = Math.floor(r() * SP_END.length);
  const sp = {
    i, sea: !!sea, hab: sea ? 'sea' : HABS[(i + Math.floor(r() * 3)) % HABS.length],
    name: { ja: SP_FEAT[f][0] + SP_SYL[a][0] + SP_SYL[b][0] + SP_END[e][0], en: SP_FEAT[f][1] + ' ' + (SP_SYL[a][1] + SP_SYL[b][1] + SP_END[e][1]).replace(/^./, c => c.toUpperCase()) },
    feat: f, hue: r(), hue2: r(), size: 0.7 + r() * 0.8, legs: sea ? 0 : [2, 4, 4, 6][Math.floor(r() * 4)], neck: f === 1 ? 1.6 : 0.4 + r() * 0.5,
    horn: f === 0 ? 2 : r() < 0.25 ? 1 : 0, wing: f === 4, spines: f === 3, stripes: f === 5, glow: f === 7, body: Math.floor(r() * 3), tail: r(), herd: 2 + Math.floor(r() * 3),
  };
  if (f === 6) sp.size *= 1.6;
  return sp;
}
function habOk(st, c, h) {
  if (h === 'sea') return st.lf[c] < 0.5 && st.iceO[c] < 0.5 && coastal(st, c);
  if (st.lf[c] < 0.6) return false;
  const v = st.veg[c], T = st.Tc[c];
  if (h === 'forest') return v > 0.42;
  if (h === 'grass') return v > 0.12 && v <= 0.5;
  if (h === 'desert') return v < 0.15 && T > 8 && st.iceL[c] < 0.3;
  if (h === 'snow') return st.iceL[c] > 0.25 || T < -3;
  return true;
}
function anchor(st, sp) {
  const r = rng((st.seed ^ (sp.i * 92821 + (sp.sea ? 13 : 0))) >>> 0), c0 = Math.floor(r() * N), [a0, o0] = cellLL(c0);
  let best = -1, bd = 1e9;
  for (let c = 0; c < N; c++) { if (!habOk(st, c, sp.hab)) continue; const [a, o] = cellLL(c), d = angDeg(a0, o0, a, o); if (d < bd) { bd = d; best = c; } }
  if (best < 0 && !sp.sea) for (let c = 0; c < N; c++) { if (st.lf[c] < 0.6) continue; const [a, o] = cellLL(c), d = angDeg(a0, o0, a, o); if (d < bd) { bd = d; best = c; } }
  return best;
}
function speciesCount(st) { const L = st.life; return { land: L.st >= 6 ? clamp(Math.floor(2 + L.div / 12), 2, 9) : 0, sea: L.st >= 4 ? clamp(Math.floor(1 + L.div / 25), 1, 4) : 0 }; }
// everything there is to find on this planet right now (cached; it is recomputed when the planet has changed)
function sites(st) {
  const key = Math.floor(st.t / 2e6) + ':' + st.marks.length + ':' + st.life.st + ':' + Math.floor(st.life.div / 12) + ':' + st.ops.length + ':' + st.found.length;
  if (st._sites && st._sitesKey === key && st.sitesAt !== -1) return st._sites;
  const out = st.marks.map(m => Object.assign({ found: st.found.includes(m.id) }, m));
  const n = speciesCount(st);
  for (let i = 0; i < n.sea + n.land; i++) {
    const sea = i < n.sea, sp = species(st, sea ? 100 + i : i - n.sea, sea), c = anchor(st, sp);
    if (c < 0) continue;
    const [a, o] = cellLL(c), r = rng((st.seed ^ (sp.i * 31 + 7)) >>> 0), id = (sea ? 'sea' : 'sp') + sp.i;
    out.push({ id, k: sea ? 'sea' : 'sp', lat: Math.round((a + (r() - 0.5) * 3) * 10) / 10, lon: Math.round((o + (r() - 0.5) * 3) * 10) / 10, sp, found: st.found.includes(id) });
  }
  st._sites = out; st._sitesKey = key; st.sitesAt = 0;
  return out;
}
const FIND_DEG = 6.5; // how close the explorer must come (degrees of arc)
// the explorer reached (lat, lon): what is found there? Returns the new finds.
function explore(st, lat, lon) {
  const got = [];
  for (const s of sites(st)) if (!s.found && angDeg(lat, lon, s.lat, s.lon) < FIND_DEG) { const g = discover(st, s.id); if (g) got.push(g); }
  return got;
}
function discover(st, id) {
  if (st.found.includes(id)) return null;
  const s = sites(st).find(x => x.id === id); if (!s) return null;
  st.found.push(id); if (st.found.length > 200) st.found.splice(0, st.found.length - 200);
  st.sitesAt = -1;
  if (s.k === 'lib' && st.civ && st.civ.on) st.civ.tech = Math.min(100, st.civ.tech + 12);
  event(st, 'find', { id, k: s.k, lat: s.lat, lon: s.lon });
  return Object.assign({}, s, { found: true, spark: SPARK[s.k] || 2 });
}
// a hint for the explorer: the nearest thing not yet found (compass direction from here)
const DIRS = ['n', 'ne', 'e', 'se', 's', 'sw', 'w', 'nw'];
function hint(st, lat, lon) {
  let best = null, bd = 1e9;
  for (const s of sites(st)) { if (s.found) continue; const d = angDeg(lat, lon, s.lat, s.lon); if (d < bd) { bd = d; best = s; } }
  if (!best) return null;
  const p = dirOf(lat, lon), q = dirOf(best.lat, best.lon), north = [0, 1, 0];
  const e = norm3(cross3(north, p)), n = cross3(p, e), dq = [q[0] - p[0], q[1] - p[1], q[2] - p[2]];
  const ang = Math.atan2(dot3(dq, e), dot3(dq, n)), dir = DIRS[((Math.round(ang / (Math.PI / 4)) % 8) + 8) % 8];
  return { site: best, deg: bd, dir: Math.abs(lat) > 86 ? (lat > 0 ? 's' : 'n') : dir };
}
function cross3(a, b) { return [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]]; }
function dot3(a, b) { return a[0] * b[0] + a[1] * b[1] + a[2] * b[2]; }
function norm3(a) { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; }

// ---- the eras of a planet's story ----
const ERAS = ['molten', 'rain', 'ocean', 'life', 'forest', 'beasts', 'civ', 'space'];
function era(st) {
  const m = st.ms || {};
  if (m.space != null) return 7; if (m.civ != null) return 6; if (m.animals != null) return 5; if (m.forest != null) return 4;
  if (m.life != null) return 3; if (m.ocean != null) return 2; return st.t >= 4e7 ? 1 : 0;
}

// ---- cities: where people gather (for the night lights and the "idea" verb) ----
function cities(st) {
  const c = st.civ; if (!c || !c.on) return [];
  const P = st.pop, out = [];
  for (let k = 0; k < N; k++) {
    if (P[k] < 0.2) continue;
    const j = (k / NX) | 0, i = k % NX; let top = true;
    for (let dj = -1; dj <= 1 && top; dj++) for (let di = -1; di <= 1; di++) { const jj = j + dj; if (jj < 0 || jj >= NY || (!dj && !di)) continue; const q = jj * NX + ((i + di + NX) % NX); if (P[q] > P[k] || (P[q] === P[k] && q < k)) { top = false; break; } }
    if (top) { const [a, o] = cellLL(k); out.push({ c: k, lat: a, lon: o, pop: P[k], clean: !!(c.clean && c.clean.some(q => angDeg(a, o, ...cellLL(q)) < 16)) }); }
  }
  out.sort((a, b) => b.pop - a.pop || a.c - b.c);
  return out.slice(0, 8);
}
function cleanShare(st) { // the share of the people who live in cities that took up clean energy
  const c = st.civ; if (!c || !c.clean || !c.clean.length) return 0;
  const cs = cities(st); let all = 0, cp = 0;
  for (const x of cs) { all += x.pop; if (x.clean) cp += x.pop; }
  return all > 0 ? cp / all : 0;
}


// ---- wonder planets: handcrafted strange worlds to visit (time stands still there) ----
const WONDERS = ['ring', 'ice', 'lava', 'moon', 'bloom'];
function wonder(id) {
  let st;
  const ring = (n, lat0, amp, fn) => { const out = []; for (let i = 0; i < n; i++) { const lon = -180 + i * 360 / n; out.push(fn(Math.round(lat0 + amp * Math.sin(lon * D2R * 2)), Math.round(lon), i)); } return out; };
  if (id === 'ring') { // a water world with a ring of islands under a ring of ice
    st = lifeWorld(4.5e9, { seed: 31, co2: 300, water: 1.7 }, 6, 1); st.life.div = 70;
    applyOps(st, ring(30, 0, 9, (a, o, i) => [a, o, 7.75, i % 3 === 0 ? 1 : 0]).concat(ring(30, 2, 9, (a, o, i) => [a, o + 4, 6, 0])));
    settle(st, 6e4, 330);
    for (let i = 0; i < 3; i++) { const o = -180 + i * 120; addMark(st, 'arch', Math.round(9 * Math.sin(o * D2R * 2)), o); }
    for (let i = 0; i < 2; i++) { const o = -120 + i * 120 + 15; addMark(st, 'shell', Math.round(9 * Math.sin(o * D2R * 2)) + 1, o); }
    st.rings = 1;
  } else if (id === 'ice') { // a frozen world: geysers of warm water shoot up through the ice
    st = lifeWorld(4.5e9, { seed: 44, co2: 200, dist: 1.3 }, 1, 1e-4);
    settle(st, 8e4, 200);
    const r = rng(4404); for (let i = 0; i < 5; i++) addMark(st, 'geyser', (r() - 0.5) * 110, r() * 360 - 180);
    addMark(st, 'ice', 35, 40); addMark(st, 'aur', 74, -30); addMark(st, 'aur', -74, 150);
    st.geysers = 1;
  } else if (id === 'lava') { // a young world: the crust is thin and the lava runs in rivers
    st = create({ t: 2.2e7, p: { seed: 57, co2: 3e5 } }); st.noCiv = true;
    applyOps(st, [[20, 30, 7.75, 1], [-15, -100, 7.75, 1], [40, -150, 6, 1], [-35, 120, 7, 1], [5, 170, 5, 0]]);
    advance(st, 2e5);
    const v = [[20, 30], [-15, -100], [40, -150], [-35, 120]]; v.forEach(([a, o]) => addMark(st, 'lava', a + 6, o + 5));
    addMark(st, 'cry', -5, 60); addMark(st, 'cry', 55, 100);
  } else if (id === 'moon') { // a tiny moon: low gravity, big jumps, old craters with crystals
    st = create({ t: 4.5e9, p: { seed: 66, co2: 1, water: 0, size: 0.4, n2: 0.01 } }); st.noCiv = true; st.wl = 0; seaLevel(st);
    const r = rng(6606), ops = [];
    for (let i = 0; i < 14; i++) { const a = Math.round((r() - 0.5) * 140), o = Math.round(r() * 359 - 180), big = r() < 0.4 ? 1 : 0; ops.push([a, o, -3.5, big]); for (let q = 0; q < 6; q++) { const t = q * Math.PI / 3; ops.push([clamp(Math.round(a + (big ? 9 : 6) * Math.cos(t)), -89, 89), Math.round(o + (big ? 9 : 6) * Math.sin(t) / Math.max(0.3, Math.cos(a * D2R))), 1.25, 0]); } if (i < 4) addMark(st, 'cry', a, o); }
    applyOps(st, ops.map(q => [q[0], ((q[1] + 180) % 360 + 360) % 360 - 180, q[2], q[3]]));
    addMark(st, 'flag', 12, -40);
    advance(st, 1e3);
  } else { // bloom: a warm, wet world where life runs riot (giant flowers, many creatures)
    st = lifeWorld(4.4e9, { seed: 77, co2: 420, water: 0.9 }, 6, 1.3); st.life.div = 100;
    settle(st, 6e4, 600);
    for (let c = 0; c < N; c++) st.wet[c] = 0.5; moisture(st); settle(st, 1e4, 600);
    const r = rng(7707); for (let i = 0; i < 4; i++) { const c = landCell(st, r, q => st.veg[q] > 0.3); markAtCell(st, 'bloom', c); }
  }
  st.wonder = id; st.frozen = true; st.noMarks = true; st.ev = []; st.news = []; st.sitesAt = -1;
  return st;
}

// ---- save / load (compact) ----
const enc = (a, s) => { let o = ''; for (let i = 0; i < a.length; i++) o += B64[clamp(Math.round(a[i] * s), 0, 63)]; return o; };
const dec = (str, a, s) => { for (let i = 0; i < a.length; i++) { const q = B64.indexOf(str[i] || 'A'); a[i] = Math.max(0, q) / s; } };
const r4 = x => Math.round(x * 1e4) / 1e4;
function serialize(st) {
  return {
    v: 1, t: st.t, p: Object.assign({}, st.p), seed: st.seed, T: Array.from(st.T, x => Math.round(x * 10) / 10), A: st.A, O: st.O, ch4: st.ch4, o2: st.o2, wl: st.wl, lost: st.lost,
    iceL: enc(st.iceL, 63), iceO: enc(st.iceO, 63), veg: enc(st.veg, 63),
    plates: st.plates.map(P => ({ M: P.M.map(r4), ax: P.ax.map(r4), w: P.w, r: P.r, seed: P.seed, next: P.next, ep: P.ep })),
    bumps: st.bumps.map(b => ({ pl: b.pl, lp: b.lp.map(r4), r: b.r, h: Math.round(b.h * 100) / 100, fix: b.fix ? 1 : 0, tau: b.tau })),
    craters: st.craters, volcs: st.volcs || [], uplift: st.uplift, dust: st.dust, ash: st.ash, pulses: st.pulses,
    life: Object.assign({}, st.life), civ: st.civ ? Object.assign({}, st.civ, { pol: Object.assign({}, st.civ.pol) }) : null, civRest: st.civRest,
    ev: st.ev.slice(-40), flags: Object.assign({}, st.flags), tRef: st.tRef, lastCh4: st.lastCh4, lastImpact: st.lastImpact,
    reach: st.reachOn ? enc(st.reach, 63) : undefined, reachOn: st.reachOn ? 1 : 0, drain: st.drain || undefined, combos: st.combos.slice(), ms: Object.assign({}, st.ms), boost: st.boost, aur: Math.round(st.aur * 100) / 100, surp: st.surp ? 1 : 0, nextSurp: st.nextSurp,
    name: st.name || undefined,
    ops: st.ops.length ? opsCode(st.ops) : undefined, wet: st.wet.some(x => x > 0.01) ? enc(st.wet, 63) : undefined, marks: st.marks.length ? st.marks : undefined, found: st.found.length ? st.found.slice() : undefined, markN: st.markN || undefined,
    drift: st.drift, rings: st.rings || undefined, geysers: st.geysers || undefined, ramp: st.ramp || undefined, cloud: st.cloud ? Math.round(st.cloud * 100) / 100 : undefined, wonder: st.wonder || undefined, frozen: st.frozen ? 1 : undefined, noMarks: st.noMarks ? 1 : undefined,
  };
}
function deserialize(o) {
  if (!o || typeof o !== 'object' || o.v !== 1 || !o.p) return null;
  const st = create({ t: +o.t || 0, p: o.p });
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  st.t = num(o.t, 0); st.A = num(o.A, 280); st.O = num(o.O, st.A * K.K_OC); st.ch4 = num(o.ch4, 1); st.o2 = num(o.o2, 1e-6); st.wl = num(o.wl, st.p.water); st.lost = num(o.lost, 0);
  if (Array.isArray(o.T) && o.T.length === NY) for (let j = 0; j < NY; j++) st.T[j] = num(o.T[j], 10);
  if (typeof o.iceL === 'string') dec(o.iceL, st.iceL, 63); if (typeof o.iceO === 'string') dec(o.iceO, st.iceO, 63); if (typeof o.veg === 'string') dec(o.veg, st.veg, 63);
  if (Array.isArray(o.plates) && o.plates.length) st.plates = o.plates.map(P => ({ M: P.M.slice(), ax: P.ax.slice(), w: P.w, r: P.r, seed: P.seed >>> 0, next: P.next, ep: P.ep || 0 }));
  st.bumps = Array.isArray(o.bumps) ? o.bumps.map(b => Object.assign({}, b, { lp: b.lp.slice(), fix: !!b.fix })) : [];
  st.craters = Array.isArray(o.craters) ? o.craters : []; st.volcs = Array.isArray(o.volcs) ? o.volcs : [];
  st.uplift = num(o.uplift, 0); st.dust = num(o.dust, 0); st.ash = num(o.ash, 0); st.pulses = Array.isArray(o.pulses) ? o.pulses : [];
  st.life = Object.assign(st.life, o.life || {}); st.civ = o.civ && typeof o.civ === 'object' ? Object.assign({ on: false, y: 0, pop: 0.7, tech: 8, fos: 5000, res: 100, stab: 75, T0: 14, cum: 0, em: 0, cdr: 0, aer: 0, ch4: 0, lu: 0.05, food: 1, short: 0, why: null, space: false }, o.civ, { pol: Object.assign({ en: 0, rs: 0, env: 0 }, o.civ.pol || {}) }) : null; st.civRest = num(o.civRest, 0);
  st.ev = Array.isArray(o.ev) ? o.ev : []; st.flags = Object.assign({}, o.flags || {}); st.tRef = o.tRef; st.lastCh4 = o.lastCh4; st.lastImpact = o.lastImpact;
  // added in the 2026-11 redesign (older saves have none of these: life is then everywhere, milestones are rebuilt from the state)
  if (o.reachOn && typeof o.reach === 'string') { dec(o.reach, st.reach, 63); st.reachOn = true; }
  st.combos = Array.isArray(o.combos) ? o.combos.filter(x => typeof x === 'string').slice(0, 12) : [];
  st.ms = o.ms && typeof o.ms === 'object' ? Object.assign({}, o.ms) : null;
  st.boost = num(o.boost, 0); st.aur = num(o.aur, 0); st.surp = o.surp == null ? true : !!o.surp; st.nextSurp = num(o.nextSurp, 0);
  if (typeof o.name === 'string') st.name = o.name.slice(0, 24);
  // added with the sculpted world (older saves: plates drift at the old speed, nothing sculpted, nothing to find yet)
  st.rings = o.rings ? 1 : 0; st.geysers = o.geysers ? 1 : 0; if (Array.isArray(o.ramp) && o.ramp.length === 2) st.ramp = o.ramp.map(Number); st.drift = num(o.drift, 1); st.cloud = num(o.cloud, 0); st.markN = num(o.markN, 0);
  if (typeof o.ops === 'string') st.ops = opsRead(o.ops);
  if (typeof o.wet === 'string') dec(o.wet, st.wet, 63);
  st.marks = Array.isArray(o.marks) ? o.marks.filter(m => m && typeof m.id === 'string' && isFinite(m.lat) && isFinite(m.lon)).slice(-MARK_MAX) : [];
  st.found = Array.isArray(o.found) ? o.found.filter(x => typeof x === 'string').slice(-200) : [];
  if (typeof o.wonder === 'string') st.wonder = o.wonder; st.frozen = !!o.frozen; st.noMarks = !!o.noMarks;
  if (st.civ) { st.civ.clean = Array.isArray(st.civ.clean) ? st.civ.clean.filter(Number.isInteger) : []; st.civ.trees = num(st.civ.trees, 0); }
  rebuildSculpt(st);
  geology(st, true);
  step(st, 1e-3); st.t -= 1e-3;
  if (!st.ms) { st.ms = {}; const nm = st.noMarks; st.noMarks = true; msCheck(st); st.noMarks = nm; st.ev = st.ev.filter(e => e.k !== 'ms'); st.news = []; } // an old save: what it already reached, without fanfare
  return st;
}

// ---- scenarios: a short task on a prepared planet ----
function settle(st, years, co2) { // let the climate settle while the CO2 is held
  let left = years; while (left > 0) { const dt = Math.min(left, 1e4); if (co2 != null) { st.A = co2; st.O = co2 * K.K_OC; } advance(st, dt); left -= dt; }
  if (co2 != null) { st.A = co2; st.O = co2 * K.K_OC; }
  msCheck(st); st.ev = []; st.news = []; st.flags = st.o2 > 0.002 ? { goe: 1 } : {}; st.tRef = st.d.Tg;
}
function landVeg(st) { return st.d.land > 0.01 ? st.d.vegA / st.d.land : 0; }
function arcticT(st, lat) { let a = 0, w = 0; for (let j = 0; j < NY; j++) if (latC[j] >= lat) { a += st.T[j] * wRow[j]; w += wRow[j]; } return w ? a / w : 0; }
function seaIceNorth(st, lat) { let a = 0, o = 0; for (let j = 0; j < NY; j++) { if (latC[j] < lat) continue; const ca = cellA(j); for (let i = 0; i < NX; i++) { const k = j * NX + i, w = ca * (1 - st.lf[k]); o += w; a += w * st.iceO[k]; } } return o > 0 ? a / o : 0; }
function lifeWorld(t, p, stage, o2) { const st = create({ t, p }); st.noCiv = true; st.wl = st.p.water; seaLevel(st); st.life.st = stage; st.life.euk = stage >= 3 ? 1 : 0; st.life.div = DIVK[stage] * 0.9; st.o2 = o2; return st; }
function seaLife(st) { // how much of the open sea life has reached (0..1)
  if (st.life.st === 0 || st.wl <= 0.05) return 0;
  let a = 0, o = 0;
  for (let j = 0; j < NY; j++) { const ca = cellA(j); for (let i = 0; i < NX; i++) { const k = j * NX + i, w = ca * (1 - st.lf[k]); o += w; a += w * (1 - st.iceO[k]) * (st.reachOn ? st.reach[k] : 1); } }
  return o > 0 ? a / o : 0;
}
// Each scenario is a short "challenge planet": a prepared world, a few verbs, a budget of strokes (fewer = more points), a clear goal,
// and a sensible plan (the tests prove each one can be won through the same verbs the page uses).
// speed is an index into the page's speeds (1 = 10 years a second, 5 = 100,000, 6 = 1 million, 7 = 10 million).
function interior(st, n) { // the n land cells farthest from the sea (for digging inland seas)
  const out = []; for (let c = 0; c < N; c++) if (st.lf[c] >= 0.9) out.push([c, st.moist[c]]);
  out.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  const pick = []; for (const [c] of out) { const [a, o] = cellLL(c); if (pick.every(q => angDeg(a, o, q[0], q[1]) > 22)) pick.push([a, o]); if (pick.length >= n) break; }
  return pick;
}
function coasts(st, n, minLat) { // n coastal land cells spread around the planet
  const pick = [];
  for (let c = 0; c < N && pick.length < n; c += 7) { if (st.lf[c] < 0.6 || !coastal(st, c)) continue; const [a, o] = cellLL(c); if (Math.abs(a) > (minLat || 50)) continue; if (pick.every(q => angDeg(a, o, q[0], q[1]) > 30)) pick.push([a, o]); }
  return pick;
}
const SCEN = [
  { id: 'cradle', limit: 4e7, speed: 5, maxSpeed: 6, budget: 8, allow: { tools: ['volcano', 'asteroid', 'seed'] },
    setup() { const st = create({ t: 1.0e8, p: { seed: 2, dist: 1, water: 0.4, n2: 0.5, co2: 2e5 } }); st.noCiv = true; st.wl = 0.4; seaLevel(st); settle(st, 2e5); st.life.pre = 0; st.drain = 0.15; return st; },
    check(st) { const sl = seaLife(st); return { win: st.life.st >= 1 && sl >= 0.6, fail: st.flags.snow ? 'snow' : null, goals: [{ k: 'life', v: st.life.st >= 1 ? 1 : 0, goal: 1 }, { k: 'sealife', v: sl, goal: 0.6 }] }; },
    quality(st) { return clamp(1 - (st.d.ice || 0) / 0.3, 0, 1); },
    plan(k, A, st) { if (k === 0) { A.tool('volcano', 0, 0); A.tool('volcano', 5, 120); A.tool('volcano', -5, 240); } if (st.life.st === 0 && (st.d.liq || 0) > 0.3) A.tool('seed', 2, 4); } },
  // the snowball: volcanoes alone are too slow now. Comets on the ice darken it (ash), and the warmth must reach the equator first
  { id: 'snow', limit: 2e6, speed: 5, maxSpeed: 6, budget: 6, allow: { tools: ['volcano', 'asteroid'] },
    setup() { const st = lifeWorld(3.9e9, { seed: 5, co2: 280 }, 3, 0.2); settle(st, 1e5, 280); st.p.dist = 1.12; settle(st, 6e4); st.p.dist = 1.03; settle(st, 2e4); st.flags.snow = 1; st.flags.snowT = st.t; st.drain = 0.03; return st; },
    check(st) { const ice = st.d.ice; return { win: ice < 0.4, fail: null, goals: [{ k: 'ice', v: ice, goal: 0.4, le: true }] }; },
    quality(st) { return clamp(1 - Math.abs(st.d.Tg - 15) / 20, 0, 1); },
    plan(k, A) { if (k === 0) { for (let q = 0; q < 3; q++) A.tool('volcano', 0, 40 + q * 3); A.tool('asteroid', 0, -100); } } },
  // a dry supercontinent: carve inland seas and bring rain so that forests can grow in the middle
  { id: 'green', limit: 2e6, speed: 5, maxSpeed: 6, budget: 10, allow: { tools: ['sink', 'rain', 'raise'] },
    setup() { const st = lifeWorld(4.3e9, { seed: 15, co2: 280, water: 0.8, dist: 0.97 }, 5, 1); st.life.div = 50;
      const ops = []; for (let a = -32; a <= 32; a += 8) for (let o = -88; o <= 88; o += 8) ops.push([a, o, 2, 1]);
      applyOps(st, ops); st.baseOps = st.ops.length; settle(st, 2e5, 500); advance(st, 5e5); settle(st, 0); return st; },
    check(st) { const g = landVeg(st); return { win: g >= 0.55, fail: st.flags.snow ? 'snow' : null, goals: [{ k: 'green', v: g, goal: 0.55 }] }; },
    quality(st) { return clamp((landVeg(st) - 0.55) / 0.06, 0, 1); },
    plan(k, A, st) { if (k === 0) for (const [a, o] of interior(st, 4)) { A.tool('sink', a, o); for (let q = 0; q < 8; q++) A.tool('sink', a, o, { cont: true }); } if (k === 1) for (const [a, o] of interior(st, 6)) A.tool('rain', a, o); } },
  // the closed north: dig a gate through the ring of mountains so that warm water reaches the pole
  { id: 'gate', limit: 2e6, speed: 5, maxSpeed: 6, budget: 8, allow: { tools: ['sink', 'raise', 'volcano'] },
    setup() { const st = lifeWorld(4.4e9, { seed: 12, co2: 280 }, 6, 1);
      st.plates = st.plates.filter(P => P.M[7] < 0.35);
      for (let lon = -180; lon < 180; lon += 9) bump(st, 48, lon, 3.4, 5.5, { fixed: true });
      geology(st); settle(st, 3e5, 330); return st; },
    check(st) { const n = arcticT(st, 60); return { win: n >= -22, fail: null, goals: [{ k: 'arctic', v: n, goal: -22 }] }; },
    quality(st) { return clamp((arcticT(st, 60) + 22) / 5, 0, 1); },
    plan(k, A) { if (k === 0) for (let lon = -180; lon < 180; lon += 60) { A.tool('sink', 48, lon); for (let q = 0; q < 8; q++) A.tool('sink', 48, lon, { cont: true }); } } },
  // the oxygen sky: fresh mountains on the coasts feed the sea with nutrients; tiny algae bloom and breathe out oxygen
  { id: 'goe', limit: 1.5e8, speed: 6, maxSpeed: 7, budget: 10, allow: { tools: ['volcano', 'raise', 'seed'] },
    setup() { const st = lifeWorld(2.0e9, { seed: 9, co2: 3e4 }, 2, 1e-6); st.ch4 = 1000; settle(st, 1e6); return st; },
    check(st) { return { win: st.o2 >= 0.02, fail: st.flags.snow ? 'snow' : null, goals: [{ k: 'o2', v: st.o2, goal: 0.02 }] }; },
    quality(st) { return clamp(1 - Math.abs(st.d.Tg - 15) / 20, 0, 1); },
    plan(k, A, st) { if (k < 9) { const [a, o] = coasts(st, 9)[k] || [0, k * 40]; A.tool('raise', a, o); for (let q = 0; q < 10; q++) A.tool('raise', a + q * 0.8, o + q, { cont: true }); } if (st.d.ice > 0.25) A.tool('volcano', 0, k * 37); } },
  // the brightening star: hold the heat back for a long time with mountains (weathering), forests and bright clouds
  { id: 'sun', limit: 1.5e8, speed: 6, maxSpeed: 7, budget: 10, endure: true, allow: { tools: ['raise', 'cool', 'rain'] },
    setup() { const st = lifeWorld(5.4e9, { seed: 4, co2: 280 }, 6, 1); settle(st, 2e6); st.ramp = [st.t, 0.03 / 1.5e8]; return st; },
    sample(sc) { sc.devSum += Math.abs(sc.st.d.Tg - 22); sc.devN++; },
    check(st, sc) { const T = st.d.Tg, end = sc && sc.end; return { win: !!end && T <= 30, fail: T > 36 ? 'hot' : st.flags.snow ? 'snow' : st.life.st < 4 ? 'wipe' : end && T > 30 ? 'hot' : null, goals: [{ k: 'temp', v: T, goal: 30, le: true }] }; },
    quality(st, sc) { return clamp(1 - (sc.devSum || 0) / Math.max(1, sc.devN || 1) / 8, 0, 1); },
    plan(k, A, st) { if (st.d.Tg > 26.5 && k % 2 === 0) { const c = coasts(st, 10)[k % 10] || [10, k * 30]; A.tool('raise', c[0], c[1]); for (let q = 0; q < 12; q++) A.tool('raise', c[0], c[1] + q, { cont: true }); } if (st.d.Tg > 28.5) A.tool('cool', 0, 0); } },
  // a young civilization burns its fuel: give its biggest cities the idea of clean energy, and plant forests
  { id: 'warm', limit: 300, speed: 1, maxSpeed: 2, civ: true, budget: 10, allow: { tools: ['idea', 'seed'] },
    setup() { const st = lifeWorld(4.57e9, { seed: 3, co2: 280 }, 7, 1); settle(st, 2e5, 280); st.noCiv = false; startCiv(st); st.civ.pop = 0.9; st.civ.tech = 14; st.civ.pol = { en: 0, rs: 1, env: 0 }; st.ev = []; st.news = []; popMap(st); return st; },
    check(st, sc) { const c = st.civ, dT = st.d.Tg - c.T0, done = c.y >= 300 - 1e-6;
      return { win: done && c.on && dT < 1.2 && c.tech >= 60, fail: !c.on ? 'collapse' : dT >= 2 ? 'heat' : done ? (dT >= 1.2 ? 'heat' : 'tech') : null,
        goals: [{ k: 'dT', v: dT, goal: 1.2, le: true }, { k: 'tech', v: c.tech, goal: 60 }, { k: 'year', v: c.y, goal: 300 }] }; },
    quality(st) { return clamp((1.2 - (st.d.Tg - st.civ.T0)) / 0.6, 0, 1); },
    plan(k, A, st) { if ([1, 2, 3, 5, 7, 9, 11, 13].includes(k)) { const cs = cities(st).filter(x => !x.clean); if (cs.length) A.tool('idea', cs[0].lat, cs[0].lon); } if (k === 4) { const c = topCell(st, q => st.veg[q] < 0.3 && st.moist[q] > 0.4 ? st.moist[q] : -1); if (c >= 0) A.tool('seed', ...cellLL(c)); } } },
  // the dawn of space: three ancient libraries hold the knowledge the people need. Walk there and find them, and keep the forests
  { id: 'dawn', limit: 200, speed: 1, maxSpeed: 2, civ: true, budget: 6, allow: { tools: ['idea', 'seed'], walk: true },
    setup() { const st = lifeWorld(4.57e9, { seed: 8, co2: 280 }, 7, 1); settle(st, 2e5, 280); st.noCiv = false; startCiv(st); st.civ.pop = 0.9; st.civ.tech = 20; st.ev = []; st.news = []; st.noMarks = false;
      const r = rng(808); for (let i = 0; i < 3; i++) { const c = landCell(st, r, q => st.iceL[q] < 0.2); const [a, o] = cellLL(c); addMark(st, 'lib', a, o); } popMap(st); return st; },
    check(st) { const c = st.civ; return { win: c.on && c.tech >= 100 && st.life.div >= 50, fail: !c.on ? 'collapse' : st.life.div < 40 ? 'nature' : null, goals: [{ k: 'tech', v: c.tech, goal: 100 }, { k: 'div', v: st.life.div, goal: 50 }, { k: 'libs', v: st.found.filter(x => /^lib/.test(x)).length, goal: 3 }] }; },
    quality(st) { return clamp((st.civ.res) / 60, 0, 1); },
    plan(k, A, st) { if (k < 3) { const m = st.marks.filter(q => q.k === 'lib' && !st.found.includes(q.id))[0]; if (m) A.visit(m.id); } } },
];
function civPlan(k, A, st) { const c = st.civ; A.policy('en', c.tech > 25 ? 2 : c.tech > 15 ? 1 : 0); A.policy('env', c.tech > 45 ? 2 : 1); A.policy('rs', c.tech > 30 ? 2 : 1); }
const SC_IDS = SCEN.map(d => d.id);
// ---- running a scenario (the page and the tests share this) ----
function scStart(i) { const def = SCEN[i]; const st = def.setup(); return { def, i, st, t0: st.t, ended: false, win: false, why: null, actions: 0, devSum: 0, devN: 0, last: null, score: 0, stars: 0, end: false }; }
function scUsed(sc) { return sc.def.civ ? sc.st.civ.y : sc.st.t - sc.t0; }
function scLeft(sc) { return sc.def.budget == null ? Infinity : Math.max(0, sc.def.budget - sc.actions); }
function scAllowed(sc, kind, x) { const a = sc.def.allow || {}; if (kind === 'planet' || kind === 'tools') return !!(a[kind] && a[kind].includes(x)); return !!a[kind]; }
const BRUSH = ['raise', 'sink'];
function scTool(sc, k, lat, lon, o) { // 'ok' | 'locked' | 'empty' | 'no' | 'ended'. o.cont: the same brush stroke goes on (free, up to 14 dabs)
  if (sc.ended) return 'ended';
  if (!scAllowed(sc, 'tools', k)) return 'locked';
  const cont = !!(o && o.cont);
  if (cont && !(BRUSH.includes(k) && sc.stroke === k && sc.strokeN < 14)) return 'no';
  if (!cont && scLeft(sc) <= 0) return 'empty';
  if (!tools[k](sc.st, lat, lon, cont ? { cont: true } : undefined)) return 'no';
  if (cont) sc.strokeN++; else { sc.actions++; sc.stroke = k; sc.strokeN = 0; }
  if (sc.st.geoDirty) geology(sc.st);
  return 'ok';
}
function scVisit(sc, id) { if (sc.ended) return null; const g = discover(sc.st, id); if (g) scCheck(sc); return g; }
function scCheck(sc) {
  if (sc.ended) return;
  const def = sc.def, used = scUsed(sc); sc.end = used >= def.limit - 1e-6;
  if (def.sample) def.sample(sc);
  const r = def.check(sc.st, sc); sc.last = r;
  if (r.win) scFinish(sc, true); else if (r.fail) scFinish(sc, false, r.fail); else if (sc.end) scFinish(sc, false, 'time');
}
function scFinish(sc, win, why) {
  const def = sc.def, frac = clamp(scUsed(sc) / def.limit, 0, 1), q = clamp(def.quality(sc.st, sc), 0, 1);
  const thrift = def.budget ? clamp(1 - sc.actions / def.budget, 0, 1) : q, fast = def.endure ? q : 1 - frac;
  sc.ended = true; sc.win = win; sc.why = win ? null : why || 'time';
  sc.score = win ? clamp(Math.round(600 + 150 * fast + 150 * thrift + 100 * q), 1, 1000) : 0;
  sc.stars = win ? (sc.score >= 900 ? 3 : sc.score >= 750 ? 2 : 1) : 0;
}
function scRun(sc, years, o) { // run up to `years` (stops at the end of the scenario)
  o = o || {}; let left = years;
  const chunk = o.chunk || years;
  while (left > 1e-9 && !sc.ended) {
    const y = Math.min(left, chunk, Math.max(0, sc.def.limit - scUsed(sc)));
    if (y > 1e-9) advance(sc.st, y, o);
    left -= Math.max(y, 1e-9); scCheck(sc);
    if (y <= 1e-9) break;
  }
  return sc;
}
// the do-it-yourself API the plans use (in the tests; the page wires the same verbs to its buttons)
function scApi(sc) {
  return {
    tool: (k, lat, lon, o) => scTool(sc, k, lat, lon, o),
    visit: id => scVisit(sc, id),
    set: (k, v) => { if (scAllowed(sc, 'planet', k)) setParam(sc.st, k, v); },
    policy: (k, v) => { const c = sc.st.civ; if (c && c.on && scAllowed(sc, 'civ')) c.pol[k] = v; },
    nudge: v => { if (scAllowed(sc, 'life')) sc.st.life.nudge = v || null; },
  };
}
function scPlay(i, withPlan, steps) { // a whole scenario: `steps` plan moves spread over the time limit
  const sc = scStart(i), A = scApi(sc), n = steps || 20;
  for (let k = 0; k < n && !sc.ended; k++) { if (withPlan) sc.def.plan(k, A, sc.st); scRun(sc, sc.def.limit / n, { chunk: sc.def.civ ? 25 : sc.def.limit / n }); }
  if (!sc.ended) scRun(sc, sc.def.limit);
  return sc;
}

// ---- online score battle (common/versus.js) ----
// Everyone gets the same young planet from the match seed (same land, same sea creatures, three crystals to find) and grows it for the whole match.
// Time is driven by the match clock, not by the player: VS_RATE years go by every second of the match, in fixed steps of VS_CH seconds (vsStep), so the
// planet itself evolves the same for everybody; only what the players do to it (tools, walking) differs. The score is read from the model (vsScore):
//   variety  = 4 per point of life.div (the variety of life the planet holds, up to ~100)
//   green    = 3 per % of the land that is green
//   finds    = 80 per thing found (creatures, crystals, fossils…)
//   evolve   = 120 for each life stage above the sea life (plants, then animals)
//   climate  = up to 150 for a mild planet (15 °C is best; frozen or boiling gives 0)
const VS_RATE = 3e6, VS_CH = 0.25;
function vsWorld(seed) {
  seed = seed >>> 0;
  const r = rng((seed ^ 0x7b5a1) >>> 0);
  const st = lifeWorld(4.2e9, { seed, co2: 1500, dist: 0.98 + r() * 0.04, size: 0.9 + r() * 0.2, water: 0.8 + r() * 0.4 }, 4, 1);
  settle(st, 5e5, 1500);
  st.life.div = DIVK[4] * 0.9; st.flags.snow = 0; st.surp = false; st.noMarks = false; st.found = [];
  const q = rng((seed ^ 0xc47) >>> 0);
  for (let i = 0; i < 3; i++) { const c = landCell(st, q, k => st.iceL[k] < 0.3); const [a, o] = cellLL(c); addMark(st, 'cry', a + (q() - 0.5) * 4, o + (q() - 0.5) * 4); }
  return st;
}
function vsStep(st) { advance(st, VS_RATE * VS_CH, { coarse: 5e4 }); }
function vsScore(st) {
  const L = st.life, d = st.d;
  const div = Math.round(L.div) * 4, green = Math.round(landVeg(st) * 100) * 3, finds = st.found.length * 80;
  const evolve = Math.max(0, Math.min(L.st, 6) - 4) * 120;
  const climate = st.flags.snow ? 0 : Math.round(150 * clamp(1 - Math.abs(d.Tg - 15) / 25, 0, 1));
  return { div, green, finds, evolve, climate, total: div + green + finds + evolve + climate };
}

return { VS_RATE, VS_CH, vsWorld, vsStep, vsScore, WONDERS, wonder, lifeWorld, sculpt, stamp, rebuildSculpt, refreshElev, opsCode, opsRead, applyOps, addMark, sites, species, explore, discover, hint, era, ERAS, cities, cleanShare, SPARK, FIND_DEG, OPS_MAX, coastal, SCEN, SC_IDS, MS, scStart, scUsed, scLeft, scAllowed, scTool, scVisit, BRUSH, scCheck, scFinish, scRun, scApi, scPlay, danger, msCheck, seaLife, cellOf, cellLL, angDeg, habitable, arcticT, settle, landVeg, seaIceNorth, STAGES, EVO, advance, tools, setParam, serialize, deserialize, startCiv, endCiv, popMap, movePlates, event, REF, NX, NY, N, HX, HY, HN, K, latC, xC, wRow, PX, PY, PZ, PW, FLOOR, create, step, geology, seaLevel, forcing, lum, volc, rng, fbm, dirOf, latLonOf, rotM, mul, ortho, randAxis, clamp, sstep };
})();
if (typeof window !== 'undefined') window.PSim = PSim;
if (typeof module !== 'undefined' && module.exports) module.exports = PSim;
