// ぽかぽか島スポーツ：3D の島の中身（pure。画面・時計・組み込みの乱数に頼らない。UMD：window.SportsWorld / require）。
// 種つきの高さの地図（砂浜・丘・火山）、ランドマークの置き場所、木、飛行機の動き、リング・風船・撮影スポットの決まり。
(function (root) {
  'use strict';
  const C = (typeof require === 'function' && typeof module === 'object') ? require('./core.js') : root.SportsCore;
  const { rng, hash32, clamp } = C;
  const N = 128, SZ = 2400, CELL = SZ / N, HALF = SZ / 2;
  const lerp = (a, b, t) => a + (b - a) * t, sstep = t => t * t * (3 - 2 * t);

  function noise2(seed, x, z) { const ix = Math.floor(x), iz = Math.floor(z), fx = sstep(x - ix), fz = sstep(z - iz); const h = (a, b) => hash32(seed + ':' + a + ':' + b) / 4294967296; return lerp(lerp(h(ix, iz), h(ix + 1, iz), fx), lerp(h(ix, iz + 1), h(ix + 1, iz + 1), fx), fz); }
  function fbm(seed, x, z, oct) { let a = 0.5, f = 1, s = 0, n = 0; for (let i = 0; i < oct; i++) { s += a * noise2(seed + i, x * f, z * f); n += a; a *= 0.5; f *= 2; } return s / n; }

  // ランドマーク（ID、望みの向き（ラジアン）と島の中心からの距離の割合）。種目の11個＋ふつうの名所
  const SPOTS = [
    { id: 'archery', a: 0.6, r: 0.42 }, { id: 'disc', a: 1.25, r: 0.5 }, { id: 'bowling', a: 1.9, r: 0.45 }, { id: 'kendo', a: 2.5, r: 0.38 }, { id: 'hoops', a: 3.1, r: 0.52 }, { id: 'golf', a: 3.7, r: 0.46 },
    { id: 'canoe', a: 4.3, r: 0.6 }, { id: 'pingpong', a: 4.8, r: 0.4 }, { id: 'cycling', a: 5.4, r: 0.5 }, { id: 'jump', a: 5.9, r: 0.62 }, { id: 'tennis', a: 0.05, r: 0.55 },
    { id: 'town', a: 1.6, r: 0.22, big: 1 }, { id: 'lighthouse', a: 2.2, r: 0.72, coast: 1 }, { id: 'harbor', a: 3.4, r: 0.74, coast: 1 }, { id: 'airstrip', a: 5.1, r: 0.66, coast: 1, big: 1 }, { id: 'volcano', fixed: 1 },
  ];
  const SPOT_IDS = SPOTS.map(s => s.id);

  function generate(seed) {
    seed = String(seed == null ? 1 : seed); const r = rng(hash32('world:' + seed)), H = new Float32Array((N + 1) * (N + 1));
    const volc = { x: -420, z: -300 };
    const raw = (x, z) => {
      const d = Math.hypot(x, z) / (SZ * 0.4), warp = fbm(seed + 'w', x * 0.0016, z * 0.0016, 3);
      let isl = 1 - Math.pow(d * (0.8 + 0.5 * warp), 2.6); isl = clamp(isl, -0.4, 1);
      let h = isl * (24 + 48 * fbm(seed + 'h', x * 0.0035, z * 0.0035, 4)) - 7;
      const dv = Math.hypot(x - volc.x, z - volc.z); if (dv < 480) { const k = 1 - dv / 480; h += 210 * Math.pow(k, 1.7) * (0.8 + 0.4 * fbm(seed + 'v', x * 0.01, z * 0.01, 2)); if (dv < 60) h -= 34 * (1 - dv / 60); }
      return h;
    };
    for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) H[j * (N + 1) + i] = raw(i * CELL - HALF, j * CELL - HALF);
    const hAt = (x, z) => { const fx = clamp((x + HALF) / CELL, 0, N - 1e-6), fz = clamp((z + HALF) / CELL, 0, N - 1e-6), i = Math.floor(fx), j = Math.floor(fz), tx = fx - i, tz = fz - j, k = j * (N + 1) + i; return lerp(lerp(H[k], H[k + 1], tx), lerp(H[k + N + 1], H[k + N + 2], tx), tz); };
    // ランドマークの置き場所をさがして、まわりを平らにする
    const marks = []; const sepOK = (x, z) => marks.every(m => Math.hypot(m.x - x, m.z - z) > 140);
    for (const s of SPOTS) {
      if (s.fixed) { marks.push({ id: s.id, x: volc.x, z: volc.z, y: hAt(volc.x, volc.z), pad: 0 }); continue; }
      let best = null;
      for (let k = 0; k < 400 && !best; k++) { const a = s.a + (r() - 0.5) * 0.9 * (k / 400) * 2, rad = (s.r + (r() - 0.5) * 0.25 * (k / 400) * 2) * SZ * 0.5, x = Math.cos(a) * rad, z = Math.sin(a) * rad, h = hAt(x, z);
        const lo = s.coast ? 3 : 10, hi = s.coast ? 14 : 46; if (h >= lo && h <= hi && sepOK(x, z) && Math.hypot(x - volc.x, z - volc.z) > 200) best = { x, z, h }; }
      if (!best) best = { x: Math.cos(s.a) * SZ * 0.15, z: Math.sin(s.a) * SZ * 0.15, h: 14 };
      marks.push({ id: s.id, x: best.x, z: best.z, y: Math.max(best.h, s.coast ? 4 : 10), pad: s.big ? 85 : 38 });
    }
    for (const m of marks) { if (!m.pad) continue; for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const x = i * CELL - HALF, z = j * CELL - HALF, d = Math.hypot(x - m.x, z - m.z); if (d < m.pad * 1.7) { const k = d < m.pad ? 1 : 1 - sstep((d - m.pad) / (m.pad * 0.7)); H[j * (N + 1) + i] = lerp(H[j * (N + 1) + i], m.y, k); } } }
    const air = marks.find(m => m.id === 'airstrip'); air.hdg = Math.atan2(air.z * -0.3 + 0.0001, -air.x * 0.3 + 0.0001);
    // 木（草地にだけ）
    const trees = []; for (let k = 0; k < 900 && trees.length < 420; k++) { const x = (r() * 2 - 1) * HALF * 0.85, z = (r() * 2 - 1) * HALF * 0.85, h = hAt(x, z), sl = Math.abs(hAt(x + 6, z) - h) + Math.abs(hAt(x, z + 6) - h); if (h > 7 && h < 70 && sl < 9 && marks.every(m => Math.hypot(m.x - x, m.z - z) > (m.pad || 40) * 1.2 + 6)) trees.push({ x, z, y: h, s: 0.8 + r() * 0.8, k: h < 18 ? 0 : 1 }); }
    const palms = []; for (let k = 0; k < 600 && palms.length < 160; k++) { const x = (r() * 2 - 1) * HALF * 0.85, z = (r() * 2 - 1) * HALF * 0.85, h = hAt(x, z); if (h > 1.5 && h < 6.5 && marks.every(m => Math.hypot(m.x - x, m.z - z) > (m.pad || 40) + 6)) palms.push({ x, z, y: h, s: 0.8 + r() * 0.5 }); }
    const clouds = []; for (let k = 0; k < 26; k++) clouds.push({ x: (r() * 2 - 1) * SZ * 0.8, y: 260 + r() * 220, z: (r() * 2 - 1) * SZ * 0.8, s: 40 + r() * 60 });
    const w = { seed, N, SZ, CELL, HALF, H, marks, trees, palms, clouds, volc, heightAt: hAt, markOf: id => marks.find(m => m.id === id), weather: (hash32('wx:' + seed) % 3) };
    w.course = makeCourse(w, seed); w.balloons = makeBalloons(w, seed); return w;
  }
  const slopeAt = (w, x, z) => Math.hypot(w.heightAt(x + 8, z) - w.heightAt(x - 8, z), w.heightAt(x, z + 8) - w.heightAt(x, z - 8)) / 16;

  // リングのコース：ランドマークをめぐる。radius は むずかしさで小さくなる
  function makeCourse(w, seed) {
    const order = ['airstrip', 'town', 'archery', 'disc', 'bowling', 'kendo', 'hoops', 'golf', 'canoe', 'cycling', 'jump', 'lighthouse'], rings = [];
    for (const id of order) { const m = w.markOf(id); if (!m) continue; rings.push({ x: m.x, z: m.z, y: Math.max(m.y, w.heightAt(m.x, m.z)) + 42 + (id === 'volcano' ? 160 : 0), id }); }
    return rings;
  }
  function makeBalloons(w, seed) { const r = rng(hash32('bal:' + seed)), out = []; for (let k = 0; k < 24; k++) { const x = (r() * 2 - 1) * w.HALF * 0.7, z = (r() * 2 - 1) * w.HALF * 0.7; out.push({ x, z, y: Math.max(0, w.heightAt(x, z)) + 25 + r() * 90, col: k % 5, got: false }); } return out; }

  // ---------- 飛行機 ----------
  // 入力：sx（-1〜1 ひだり〜みぎ。バンクして曲がる）、sy（-1〜1 機首上げ〜下げ）。relaxed = ぶつからない
  const DIFFS = [{ ring: 46, time: 170, mv: 0.8 }, { ring: 34, time: 140, mv: 1 }, { ring: 25, time: 115, mv: 1.15 }];
  function newFlight(world, diff, opts) {
    opts = opts || {}; diff = clamp(diff | 0, 0, 2); const a = world.markOf('airstrip');
    const f = { world, diff, cfg: DIFFS[diff], mode: opts.mode || 'ring', relaxed: !!opts.relaxed || opts.mode === 'free', x: a.x, y: a.y + 1.2, z: a.z, yaw: a.hdg, pitch: 0, roll: 0, v: 0, t: 0, state: 'takeoff', next: 0, rings: 0, pops: 0, ground: true, score: 0, done: false, crashed: false, bumps: 0, landed: false, ev: [], photos: 0, alt: 0, balloons: world.balloons.map(b => Object.assign({}, b)) };
    return f;
  }
  const SPEED = 42;
  function stepFlight(f, dt, sx, sy, thr) {
    if (f.done) return; const w = f.world; f.t += dt; sx = clamp(sx || 0, -1, 1); sy = clamp(sy || 0, -1, 1); thr = thr == null ? 1 : thr;
    const target = f.ground && f.state === 'takeoff' ? 0 : SPEED * (0.85 + 0.3 * thr);
    f.v += (f.state === 'takeoff' && f.ground ? 14 * dt : (target - f.v) * Math.min(1, dt * 0.8)); f.v = clamp(f.v, 0, SPEED * 1.3);
    const rollT = f.relaxed ? sx * 0.8 : sx * 1.05; f.roll += (rollT - f.roll) * Math.min(1, dt * 3);
    if (f.ground) { if (f.state === 'takeoff') { f.pitch = 0; f.yaw += sx * dt * 0.4 * (f.v / SPEED); if (f.v > 26 && sy < -0.25) { f.ground = false; f.state = 'air'; f.ev.push({ type: 'takeoff' }); } } }
    else { f.yaw += Math.sin(f.roll) * dt * 0.9 * f.cfg.mv * (0.5 + f.v / SPEED / 2); const pt = -sy * 0.6; f.pitch += (pt - f.pitch) * Math.min(1, dt * 2.2); f.pitch = clamp(f.pitch, -0.7, 0.7); if (f.relaxed && Math.abs(sy) < 0.05) f.pitch *= 1 - Math.min(1, dt * 0.8); }
    const cp = Math.cos(f.pitch); const nx = f.x + Math.sin(f.yaw) * cp * f.v * dt, nz = f.z + Math.cos(f.yaw) * cp * f.v * dt; let ny = f.ground ? f.y : f.y + Math.sin(f.pitch) * f.v * dt;
    // 島の外まで行きすぎたら、島の方へゆるく曲げる
    if (Math.hypot(nx, nz) > w.HALF * 0.95) f.yaw += Math.sign(Math.sin(Math.atan2(-nx, -nz) - f.yaw)) * dt * 1.2;
    f.x = nx; f.z = nz; f.y = ny; const gy = Math.max(0, w.heightAt(f.x, f.z)); f.alt = f.y - gy;
    if (f.ground) { f.y = Math.max(gy, 0) + 1.2; f.alt = 1.2; if (!onStrip(f)) { f.ground = false; f.state = 'air'; } }
    else if (f.alt < 1.5) {
      if (f.y < 0.5 && gy <= 0.3) { f.y = 0.6; f.bumps++; f.ev.push({ type: 'splash' }); if (!f.relaxed) crash(f); }
      else if (onStrip(f) && f.v < SPEED * 1.1 && f.pitch > -0.35 && f.state === 'air') { f.ground = true; f.state = f.rings >= f.world.course.length || f.mode === 'free' ? 'landed' : 'takeoff'; f.pitch = 0; f.ev.push({ type: 'touch' }); if (f.state === 'landed') { f.landed = true; finish(f); } }
      else { f.y = gy + 1.6; f.pitch = Math.max(f.pitch, 0.05); f.bumps++; f.ev.push({ type: 'bump' }); if (!f.relaxed && f.bumps > 3) crash(f); }
    }
    if (f.mode === 'ring' && !f.done) { const rg = f.world.course[f.next]; if (rg && Math.hypot(f.x - rg.x, f.y - rg.y, f.z - rg.z) < f.cfg.ring) { f.next++; f.rings++; f.ev.push({ type: 'ring', n: f.rings }); } if (f.t > f.cfg.time && !f.landed) { finish(f); } }
    for (const b of f.balloons) if (!b.got && Math.hypot(f.x - b.x, f.y - b.y, f.z - b.z) < 14) { b.got = true; f.pops++; f.ev.push({ type: 'pop' }); }
  }
  const onStrip = f => { const a = f.world.markOf('airstrip'), dx = f.x - a.x, dz = f.z - a.z, c = Math.cos(a.hdg), s = Math.sin(a.hdg), along = dx * s + dz * c, side = dx * c - dz * s; return Math.abs(along) < 75 && Math.abs(side) < 14; };
  function crash(f) { f.crashed = true; finish(f); f.ev.push({ type: 'crash' }); }
  function finish(f) { f.done = true; f.score = scoreFlight(f); }
  function scoreFlight(f) { if (f.mode === 'free') return f.pops * 10; const timeLeft = Math.max(0, f.cfg.time - f.t); return f.rings * 20 + f.pops * 8 + (f.landed ? 60 + Math.round(timeLeft * 0.5) : 0) - (f.crashed ? 0 : 0); }
  // 3 つ星（難しさごと）。リング全部＋着陸でだいたい ★3
  const FSTARS = [[120, 200, 270], [140, 220, 290], [150, 240, 310]];
  const fstars = (d, s) => { const t = FSTARS[clamp(d | 0, 0, 2)]; return s >= t[2] ? 3 : s >= t[1] ? 2 : s >= t[0] ? 1 : 0; };
  // 撮影：いま見ているものの中で、近くにあるランドマークの ID（なければ null）
  function photoTarget(f) { let best = null, bd = 1e9; const fx = Math.sin(f.yaw), fz = Math.cos(f.yaw); for (const m of f.world.marks) { const dx = m.x - f.x, dz = m.z - f.z, dy = (m.y || 0) + 10 - f.y, d = Math.hypot(dx, dz, dy); if (d > (m.id === 'volcano' ? 900 : 520) || d < 25) continue; const dot = (dx * fx + dz * fz) / Math.hypot(dx, dz); if (dot < 0.8) continue; if (d < bd) { bd = d; best = m.id; } } return best; }

  const api = { N, SZ, CELL, HALF, SPOTS, SPOT_IDS, DIFFS, SPEED, generate, noise2, fbm, slopeAt, newFlight, stepFlight, onStrip, scoreFlight, fstars, photoTarget };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SportsWorld = api;
})(typeof window !== 'undefined' ? window : globalThis);
