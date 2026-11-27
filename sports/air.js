// ぽかぽか島スポーツ：空のイベント（pure。画面・時計・組み込みの乱数に頼らない。UMD：window.SportsAir / require）。
//   グライダー（エンジンなし。上昇気流でのぼってゲートをくぐり、着陸）／フォーメーション降下（自由落下で形をつくる→パラシュートで着地）／
//   風船バトル（しっぽの風船をわりあうCPUとの空中戦）
// どれも state = { kind, t, done, score, ev:[] }。step*(state, dt, sx, sy)：sx は -1〜1（ひだり〜みぎ）、sy は -1〜1（上〜下）。
(function (root) {
  'use strict';
  const C = (typeof require === 'function' && typeof module === 'object') ? require('./core.js') : root.SportsCore;
  const { rng, hash32, clamp } = C;
  const TAU = Math.PI * 2, lerp = (a, b, t) => a + (b - a) * t;
  const angDiff = (a, b) => { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; };
  const KINDS = ['glider', 'formation', 'duel'];
  const VKEYS = { glider: 'airGlider', formation: 'airFormation', duel: 'airDuel' };

  // ---------- グライダー ----------
  const GCFG = [{ gate: 46, lift: 6.8, rad: 120, time: 300 }, { gate: 38, lift: 6.0, rad: 105, time: 270 }, { gate: 32, lift: 5.4, rad: 92, time: 240 }];
  function newGlider(world, diff, seed) {
    diff = clamp(diff | 0, 0, 2); const cfg = GCFG[diff], r = rng(hash32('gl:' + seed + ':' + diff)), v = world.markOf('volcano');
    const left = ['kendo', 'town', 'bowling', 'archery', 'disc', 'hoops', 'golf'].map(id => world.markOf(id)).filter(Boolean), gates = []; let cur = v;
    while (gates.length < 6 && left.length) { let bi = 0, bd = 1e9; left.forEach((m, i) => { const d = Math.hypot(m.x - cur.x, m.z - cur.z); if (d < bd) { bd = d; bi = i; } }); const m = left.splice(bi, 1)[0]; gates.push({ x: m.x, z: m.z, y: Math.max(world.heightAt(m.x, m.z), 0) + 105, id: m.id, got: false }); cur = m; }
    // 上昇気流：各ゲートの手前（そこへ来る道すじ）に置く
    const therm = []; let prev = v; for (const g of gates) { const dx = g.x - prev.x, dz = g.z - prev.z, d = Math.hypot(dx, dz) || 1, k = Math.min(0.5, (130 + r() * 40) / d), off = (r() - 0.5) * 50; let bx = 0, bz = 0, bh = 1e9; for (let q = 0; q < 8; q++) { const kk = Math.min(0.6, k * (0.6 + q * 0.18)), oo = (r() - 0.5) * 140, cx = prev.x + dx * kk - dz / d * oo, cz = prev.z + dz * kk + dx / d * oo, hh = Math.max(0, world.heightAt(cx, cz)); if (hh < bh) { bh = hh; bx = cx; bz = cz; } } therm.push({ x: bx, z: bz, rad: cfg.rad, top: 520 }); prev = g; }
    const yaw = Math.atan2(gates[0].x - v.x, gates[0].z - v.z);
    return { kind: 'glider', world, diff, cfg, t: 0, done: false, score: 0, ev: [], gates, next: 0, therm, x: v.x, y: v.y + 48, z: v.z, yaw, pitch: 0, roll: 0, v: 27, vy: 0, alt: 48, inTherm: 0, thermT: 0, landed: false, crashed: false, near: 0, ground: false };
  }
  function liftAt(g, x, z) { let l = 0; for (const th of g.therm) { const d = Math.hypot(x - th.x, z - th.z) / th.rad; if (d < 1) l = Math.max(l, g.cfg.lift * (1 - d * d)); } return l; }
  function stepGlider(g, dt, sx, sy) {
    if (g.done) return; const w = g.world; g.t += dt; sx = clamp(sx || 0, -1, 1); sy = clamp(sy || 0, -1, 1);
    g.roll += (sx * 0.95 - g.roll) * Math.min(1, dt * 2.5); g.yaw += Math.sin(g.roll) * dt * 0.85;
    const vt = 27 + sy * 10; g.v += (vt - g.v) * Math.min(1, dt * 0.8);
    const lift = liftAt(g, g.x, g.z), sink = 1.7 + 0.012 * (g.v - 27) * (g.v - 27) + Math.abs(Math.sin(g.roll)) * 0.7 + Math.max(0, sy) * 3.5;
    g.vy += ((-sink + lift) - g.vy) * Math.min(1, dt * 1.6); g.inTherm = lift > 0.4 ? lift : 0; if (g.inTherm) g.thermT += dt;
    g.x += Math.sin(g.yaw) * g.v * dt; g.z += Math.cos(g.yaw) * g.v * dt; g.y += g.vy * dt;
    if (Math.hypot(g.x, g.z) > w.HALF * 0.97) g.yaw += Math.sign(Math.sin(Math.atan2(-g.x, -g.z) - g.yaw) || 1) * dt * 1.3;
    g.pitch = clamp(Math.atan2(g.vy, g.v) * 1.4 - sy * 0.12, -0.7, 0.7);
    const gy = Math.max(0, w.heightAt(g.x, g.z)); g.alt = g.y - gy;
    const gt = g.gates[g.next]; if (gt && Math.hypot(g.x - gt.x, g.y - gt.y, g.z - gt.z) < g.cfg.gate) { gt.got = true; g.next++; g.ev.push({ type: 'gate', n: g.next }); }
    if (g.alt <= 1.5) {
      if (gy <= 0.3) { g.y = 0.5; g.ev.push({ type: 'splash' }); end(g, false); }
      else if (g.v < 33 && g.vy > -4.2) { g.y = gy + 1; g.landed = true; const a = w.markOf('airstrip'); g.near = Math.hypot(g.x - a.x, g.z - a.z); g.ev.push({ type: 'land' }); end(g, true); }
      else { g.y = gy + 1; g.crashed = true; g.ev.push({ type: 'crash' }); end(g, false); }
    }
    if (!g.done && g.t > g.cfg.time) end(g, false);
  }
  function glideScore(g) { return g.gates.filter(x => x.got).length * 25 + (g.landed ? 35 + (g.near < 150 ? 35 : g.near < 320 ? 15 : 0) : 0) + Math.min(40, Math.round(g.thermT * 0.6)); }
  function end(s, ok) { s.done = true; s.ok = !!ok; s.score = scoreOf(s); }

  // ---------- フォーメーション降下 ----------
  const FCFG = [{ hold: 1.2, rot: 0, tol: 6.5, win: 9.5 }, { hold: 1.5, rot: 0.15, tol: 5.5, win: 9 }, { hold: 1.8, rot: 0.3, tol: 4.8, win: 8.5 }];
  const SHAPES = [
    [[0, 0], [20, 0], [-20, 0], [0, 20], [0, -20]],
    [[0, 0], [-18, -12], [18, -12], [-36, -24], [36, -24]],
    [[-40, 0], [-20, 0], [0, 0], [20, 0], [40, 0]],
    [[0, 22], [21, 7], [13, -18], [-13, -18], [-21, 7]],
    [[0, 0], [-20, 20], [20, 20], [-20, -20], [20, -20]],
    [[0, 30], [0, 10], [0, -10], [0, -30], [30, 0]],
  ];
  const FALL = 28, OPEN = 280, START_Y = 1500;
  function formBase(f, t) { return { x: f.b0.x + Math.sin(t * 0.21 + f.ph) * 55, z: f.b0.z + Math.cos(t * 0.17 + f.ph) * 45, y: START_Y - FALL * t }; }
  function newFormation(world, diff, seed) {
    diff = clamp(diff | 0, 0, 2); const r = rng(hash32('fm:' + seed + ':' + diff)), a = world.markOf('airstrip'), cfg = FCFG[diff];
    const order = []; const pool = [0, 1, 2, 3, 4, 5]; while (pool.length) order.push(pool.splice(Math.floor(r() * pool.length), 1)[0]);
    const f = { kind: 'formation', world, diff, cfg, t: 0, done: false, score: 0, ev: [], phase: 'fall', ph: r() * 6, order, shape: 0, shapeT: 0, linkT: 0, linked: false, links: 0, inSlot: 0, slotT: 0, b0: { x: a.x * 0.55, z: a.z * 0.55 }, rel: { x: 32, z: -26 }, mates: [], x: 0, y: START_Y, z: 0, vx: 0, vz: 0, yaw: 0, pad: { x: a.x, z: a.z }, landed: false, dist: 0, canT: 0 };
    for (let i = 0; i < 4; i++) f.mates.push({ x: (r() - 0.5) * 80, z: (r() - 0.5) * 80 });
    const b = formBase(f, 0); f.x = b.x + f.rel.x; f.z = b.z + f.rel.z; return f;
  }
  function slots(f) { const sh = SHAPES[f.order[f.shape % SHAPES.length]], ang = f.cfg.rot * f.shapeT * (f.shape % 2 ? -1 : 1), c = Math.cos(ang), s = Math.sin(ang); return sh.map(p => ({ x: p[0] * c - p[1] * s, z: p[0] * s + p[1] * c })); }
  function stepFormation(f, dt, sx, sy) {
    if (f.done) return; const w = f.world; f.t += dt; sx = clamp(sx || 0, -1, 1); sy = clamp(sy || 0, -1, 1);
    if (f.phase === 'fall') {
      f.shapeT += dt; const sl = slots(f); f.rel.x = clamp(f.rel.x + sx * 26 * dt, -70, 70); f.rel.z = clamp(f.rel.z - sy * 26 * dt, -70, 70);
      const my = sl[0]; f.mates.forEach((m, i) => { const s = sl[i + 1]; m.x += (s.x - m.x) * Math.min(1, dt * 1.7); m.z += (s.z - m.z) * Math.min(1, dt * 1.7); });
      const d = Math.hypot(f.rel.x - my.x, f.rel.z - my.z); f.dist = d;
      if (d < f.cfg.tol) { f.inSlot += dt; f.slotT += dt; f.linkT += dt; if (!f.linked && f.linkT >= f.cfg.hold) { f.linked = true; f.links++; f.ev.push({ type: 'link', n: f.links }); } } else { f.linkT = Math.max(0, f.linkT - dt * 2); }
      if (f.shapeT >= f.cfg.win) { f.shape++; f.shapeT = 0; f.linkT = 0; f.linked = false; f.ev.push({ type: 'shape', n: f.shape }); }
      const b = formBase(f, f.t); f.x = b.x + f.rel.x; f.z = b.z + f.rel.z; f.y = b.y;
      if (f.y <= OPEN) { f.phase = 'canopy'; f.vx = 0; f.vz = 0; f.yaw = 0; f.ev.push({ type: 'open' }); }
    } else {
      f.canT += dt; f.vx += (sx * 17 - f.vx) * Math.min(1, dt * 1.6); f.vz += (-sy * 17 - f.vz) * Math.min(1, dt * 1.6); f.x += f.vx * dt; f.z += f.vz * dt; f.y -= 8.5 * dt;
      f.mates.forEach((m, i) => { m.cx = (m.cx || 0) + ((i % 2 ? 1 : -1) * 14 - (m.cx || 0)) * dt * 0.3; });
      const gy = Math.max(0, w.heightAt(f.x, f.z)); if (f.y - gy <= 1.2) { f.y = gy + 1; f.landed = gy > 0.3; f.ev.push({ type: f.landed ? 'land' : 'splash' }); f.dist = Math.hypot(f.x - f.pad.x, f.z - f.pad.z); end(f, f.landed); }
    }
  }
  function formScore(f) { return Math.round(f.inSlot * 4) + f.links * 20 + (f.landed ? 10 + Math.round(50 * Math.max(0, 1 - f.dist / 160)) : 0); }

  // ---------- 風船バトル ----------
  const DCFG = [{ spd: 34, mv: 0.8, skill: 0.3, time: 100 }, { spd: 39, mv: 1, skill: 0.7, time: 100 }, { spd: 43, mv: 1.15, skill: 1, time: 100 }];
  const TAILN = 3;
  function craft(x, y, z, yaw) { return { x, y, z, yaw, pitch: 0, roll: 0, lives: TAILN, inv: 0, tx: x, ty: y, tz: z }; }
  function newDuel(world, diff, seed) {
    diff = clamp(diff | 0, 0, 2); const r = rng(hash32('du:' + seed + ':' + diff)), a = r() * TAU;
    const p = craft(Math.cos(a) * 260, 190, Math.sin(a) * 260, a + Math.PI), e = craft(-Math.cos(a) * 260, 200, -Math.sin(a) * 260, a);
    return { kind: 'duel', world, diff, cfg: DCFG[diff], t: 0, done: false, score: 0, ev: [], p, e, pops: 0, hits: 0, won: false, r: rng(hash32('dr:' + seed)), wob: 0 };
  }
  function stepCraft(c, w, dt, sx, sy, spd, mv) {
    c.roll += (sx * 1.05 - c.roll) * Math.min(1, dt * 3); c.yaw += Math.sin(c.roll) * dt * 1.0 * mv; c.pitch += (clamp(-sy, -1, 1) * 0.55 - c.pitch) * Math.min(1, dt * 2.4);
    const cp = Math.cos(c.pitch); c.x += Math.sin(c.yaw) * cp * spd * dt; c.z += Math.cos(c.yaw) * cp * spd * dt; c.y += Math.sin(c.pitch) * spd * dt;
    if (Math.hypot(c.x, c.z) > 640) c.yaw += Math.sign(Math.sin(Math.atan2(-c.x, -c.z) - c.yaw) || 1) * dt * 1.5;
    const floor = Math.max(0, w.heightAt(c.x, c.z)) + 40; if (c.y < floor) { c.y = floor; c.pitch = Math.max(c.pitch, 0.1); } if (c.y > 420) { c.y = 420; c.pitch = Math.min(c.pitch, -0.05); }
    // しっぽの風船：ゆっくり後ろにつく
    const k = Math.min(1, dt * 4.5), fx = Math.sin(c.yaw) * cp, fz = Math.cos(c.yaw) * cp; c.tx += (c.x - fx * 17 - c.tx) * k; c.ty += (c.y - Math.sin(c.pitch) * 17 + 3.5 - c.ty) * k; c.tz += (c.z - fz * 17 - c.tz) * k;
  }
  // CPUと味方ボットの考え方：相手のしっぽを追い、自分のしっぽに近づかれたら ひらりと旋回する
  function duelAI(me, foe, skill, noise) {
    const rx = foe.tx - me.x, rz = foe.tz - me.z, ry = foe.ty - me.y, want = Math.atan2(rx, rz), dy = ry;
    let steer = clamp(angDiff(want, me.yaw) * 2.2, -1, 1), up = clamp(-dy / 60, -1, 1) * 0.9;
    const dh = Math.hypot(me.tx - foe.x, me.tz - foe.z, me.ty - foe.y);
    if (dh < 60 * skill && Math.hypot(rx, rz, ry) > 40) { const away = Math.atan2(me.x - foe.x, me.z - foe.z); steer = clamp(angDiff(away + 1.2, me.yaw) * 2, -1, 1); }
    return [clamp(steer + noise, -1, 1), clamp(up, -1, 1)];
  }
  function stepDuel(d, dt, sx, sy) {
    if (d.done) return; const w = d.world, cf = d.cfg; d.t += dt; d.wob += dt; d.p.inv = Math.max(0, d.p.inv - dt); d.e.inv = Math.max(0, d.e.inv - dt);
    const noise = Math.sin(d.wob * 1.3) * (1 - cf.skill) * 0.7, ai = duelAI(d.e, d.p, cf.skill, noise);
    stepCraft(d.p, w, dt, clamp(sx || 0, -1, 1), clamp(sy || 0, -1, 1), 40, 1.12); stepCraft(d.e, w, dt, ai[0], ai[1], cf.spd, cf.mv);
    const hit = (a, b) => Math.hypot(a.x - b.tx, a.y - b.ty, a.z - b.tz) < 11;
    if (!d.e.inv && hit(d.p, d.e)) { d.e.lives--; d.e.inv = 1.6; d.pops++; d.ev.push({ type: 'pop', who: 'e', x: d.e.tx, y: d.e.ty, z: d.e.tz }); }
    if (!d.p.inv && hit(d.e, d.p)) { d.p.lives--; d.p.inv = 1.6; d.hits++; d.ev.push({ type: 'pop', who: 'p', x: d.p.tx, y: d.p.ty, z: d.p.tz }); }
    if (d.e.lives <= 0 || d.p.lives <= 0 || d.t >= cf.time) { d.won = d.e.lives < d.p.lives || (d.e.lives === d.p.lives && d.e.lives < TAILN && d.pops > d.hits); end(d, d.won); }
  }
  const duelScore = d => d.pops * 40 + (d.won ? 60 : 0) + (d.pops ? d.p.lives * 15 : 0);

  function scoreOf(s) { return s.kind === 'glider' ? glideScore(s) : s.kind === 'formation' ? formScore(s) : duelScore(s); }
  // 操作のボット（テスト用。noise で下手さを出す）
  function botGlider(g, k) {
    k = k || {}; const w = g.world, a = w.markOf('airstrip'), gt = g.gates[g.next] || a, dg = Math.hypot(gt.x - g.x, gt.z - g.z), need = (g.next < g.gates.length ? gt.y : 40) + dg / (k.ratio || 13) + 25;
    let th = null, bd = 1e9; if (g.y < need) for (const t of g.therm) { const d = Math.hypot(t.x - g.x, t.z - g.z); if (d < bd && g.y - d / 13 > Math.max(0, w.heightAt(t.x, t.z)) + 30) { bd = d; th = t; } }
    if (g.circ && g.y >= need) g.circ = false; if (th && bd < th.rad * 0.6) g.circ = true;
    let sx; if (g.circ && th) sx = bd < 30 ? 0.9 : clamp(angDiff(Math.atan2(th.x - g.x, th.z - g.z), g.yaw) * 1.6, -1, 1);
    else { const tx = th ? th.x : gt.x, tz = th ? th.z : gt.z; sx = clamp(angDiff(Math.atan2(tx - g.x, tz - g.z), g.yaw) * 1.6, -1, 1); }
    const final = g.next >= g.gates.length, high = g.next < g.gates.length && g.y - gt.y > Math.max(14, dg / 12) && !g.circ && g.y >= need - 60, sy = g.alt < 45 ? -0.4 : high ? 1 : final && dg > 300 && g.alt > 120 ? 0.5 : 0;
    return [sx, sy];
  }
  function botFormation(f, k) {
    k = k || {}; if (f.phase === 'fall') { const my = slots(f)[0], dx = my.x - f.rel.x, dz = my.z - f.rel.z; return [clamp(dx / 8, -1, 1), clamp(dz / 8, -1, 1) * -1]; }
    const dx = f.pad.x - f.x, dz = f.pad.z - f.z; return [clamp(dx / 40, -1, 1), clamp(-dz / 40, -1, 1)];
  }
  function botDuel(d, k) { k = k || {}; return duelAI(d.p, d.e, k.skill || 0.8, Math.sin(d.t * 1.7) * (k.noise == null ? 0.25 : k.noise)); }

  // ★のしきい値（バリエーションとして記録。VARIANTS は core.js）
  const stars = (diff, key, s) => C.variantStars(key, diff, s);
  const api = { KINDS, VKEYS, GCFG, FCFG, DCFG, SHAPES, TAILN, FALL, OPEN, START_Y, newGlider, stepGlider, liftAt, newFormation, stepFormation, slots, formBase, newDuel, stepDuel, scoreOf, botGlider, botFormation, botDuel, stars, angDiff };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SportsAir = api;
})(typeof window !== 'undefined' ? window : globalThis);
