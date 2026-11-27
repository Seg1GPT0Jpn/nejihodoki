// ぽかぽか島スポーツ：1回ずつ「ねらって、放す」種目の中身（pure。画面・時計・組み込みの乱数に頼らない）。
// アーチェリー・ディスクドッグ・バスケシュート・ボウリング・水上ジャンプ（ゴルフは golf.js）。
// どれも newRun(diff, seed) で1回ぶんの状態を作り、入力（ねらい・ベクトル・タイミング）を渡すと、決まった結果と、絵のための軌道を返す。
// 同じ種・同じ入力なら毎回同じ。ブラウザは window.SportsSim1、node は require。
(function (root) {
  'use strict';
  const C = (typeof require === 'function' && typeof module === 'object') ? require('./core.js') : root.SportsCore;
  const { rng, hash32, clamp, gauss } = C;
  const G = 9.81;

  // =====================================================================================
  // アーチェリー：標的の面（メートル）にねらいをつけ、風で流され、手がゆれる。10本・満点100
  // =====================================================================================
  const ARCH = [
    { dist: 30, R: 0.9, wind: 1.6, sway: 0.15 },
    { dist: 50, R: 0.61, wind: 3.2, sway: 0.19 },
    { dist: 70, R: 0.45, wind: 5.0, sway: 0.22 },
  ];
  const Archery = {
    CFG: ARCH, N: 10,
    // opts.variant: null（10本）| 'moving'（うごく的＋ボーナス的）| 'rounds'（5本ずつ3ラウンド。ラウンドごとにとおく・風が強く）
    cfgFor(diff, variant, i) { const d = variant === 'rounds' ? clamp(diff + Math.floor(i / 5) - 1, 0, 2) : diff; return ARCH[d]; },
    newRun(diff, seed, opts) {
      opts = opts || {}; diff = clamp(diff | 0, 0, 2); const variant = opts.variant === 'moving' || opts.variant === 'rounds' ? opts.variant : null, n = variant === 'rounds' ? 15 : 10;
      const r = rng(hash32('arch:' + seed)), winds = [], ph = [], mv = [], bonus = []; let w = 0;
      for (let i = 0; i < n; i++) { const cfg = Archery.cfgFor(diff, variant, i); w = clamp((i === 0 ? (r() * 2 - 1) * cfg.wind : w) + (i ? (r() * 2 - 1) * cfg.wind * 0.55 : 0), -cfg.wind, cfg.wind); winds.push(Math.round(w * 10) / 10); ph.push([r() * 6.28, r() * 6.28, r() * 6.28, r() * 6.28]);
        mv.push({ amp: cfg.R * [0.9, 1.3, 1.7][diff], per: [5.5, 4.2, 3.2][diff], ph: r() * 6.28 }); bonus.push(variant === 'moving' && i % 3 === 2 ? { x: (r() * 2 - 1) * cfg.R * 0.55, y: (r() * 2 - 1) * cfg.R * 0.45, r: cfg.R * 0.2 } : null); }
      return { kind: 'archery', diff, seed, variant, n, cfg: Archery.cfgFor(diff, variant, 0), i: 0, shots: [], total: 0, winds, ph, mv, bonus, done: false };
    },
    // 的のよこのうごき（m）。tc = ずっと進んでいる時計（秒）
    targetX(run, i, tc) { if (run.variant !== 'moving') return 0; const m = run.mv[Math.min(i, run.n - 1)]; return m.amp * Math.sin((tc || 0) / m.per * 6.2832 + m.ph); },
    // 風で流される量（m）。右向きの風（正）で右へ
    drift(run, i) { return run.winds[i] * 0.22 * (run.cfg.dist / 50); },
    // 手のゆれ（m）。hold = 弓をひいている時間（秒）。息を止めすぎるとゆれが大きくなる
    swayAt(run, i, t, hold) {
      const p = run.ph[i], a = run.cfg.sway * (run.cfg.dist / 50) * (1 + Math.max(0, (hold == null ? t : hold) - 3) * 0.7);
      return { x: a * (0.6 * Math.sin(t * 2.1 + p[0]) + 0.4 * Math.sin(t * 3.7 + p[1])), y: a * (0.6 * Math.sin(t * 1.7 + p[2]) + 0.4 * Math.sin(t * 3.1 + p[3])) };
    },
    ringOf(run, x, y) {
      const d = Math.hypot(x, y), w = run.cfg.R / 10; if (d >= run.cfg.R) return { ring: 0, score: 0, x10: false };
      const ring = 10 - Math.floor(d / w); return { ring, score: ring, x10: ring === 10 && d < w * 0.5 };
    },
    // ねらい (ax, ay)（標的の面、m）で放す。t = 放した時刻（ゆれの位相）、tc = 的のうごきの時計
    shoot(run, ax, ay, t, hold, tc) {
      if (run.done) return null; const i = run.i, s = Archery.swayAt(run, i, t || 0, hold), dr = Archery.drift(run, i), tx = Archery.targetX(run, i, tc);
      const x = ax + s.x + dr - tx, y = ay + s.y, rr = Archery.ringOf(run, x, y), bn = run.bonus[i], hitB = !!bn && Math.hypot(x - bn.x, y - bn.y) < bn.r, shot = { x, y, ring: rr.ring, score: rr.score + (hitB ? 5 : 0), x10: rr.x10, wind: run.winds[i], ax, ay, tx, bonus: hitB };
      run.shots.push(shot); run.total += shot.score; run.i++; if (run.i >= run.n) run.done = true; else run.cfg = Archery.cfgFor(run.diff, run.variant, run.i); return shot;
    },
  };

  // =====================================================================================
  // ディスクドッグ：フリックでディスクを投げる（速さ・角度・向き・カーブ）。犬は走りながら空中で受ける。8投
  // 座標：x = 右、z = 前、h = 高さ（m）。投げる人は (0,0)、手の高さ 1.1 m
  // =====================================================================================
  const DISC = [{ dogV: 4.6, reach: 2.6, zr: [10, 30], side: [3, 8] }, { dogV: 5.8, reach: 2.0, zr: [14, 40], side: [4, 10] }, { dogV: 6.8, reach: 1.5, zr: [18, 48], side: [5, 12] }];
  const Disc = {
    CFG: DISC, N: 8,
    newRun(diff, seed) { return { kind: 'disc', diff: clamp(diff | 0, 0, 2), seed, cfg: DISC[clamp(diff | 0, 0, 2)], i: 0, throws: [], total: 0, done: false }; },
    // その投げの犬（出発点と速さ。まっすぐ走る）。i 投目は種から毎回同じ
    dogFor(run, i) {
      const r = rng(hash32('disc:' + run.seed + ':' + i)), c = run.cfg, sgn = r() < 0.5 ? -1 : 1;
      const z0 = c.zr[0] + r() * (c.zr[1] - c.zr[0]) * 0.55, x0 = sgn * (c.side[0] + r() * (c.side[1] - c.side[0]));
      const ang = (r() * 0.9 - 0.3) + (sgn > 0 ? Math.PI : 0); // 横ぎる向き（前へすこし）
      const vx = Math.cos(ang) * c.dogV, vz = Math.sin(ang) * c.dogV * 0.55 + c.dogV * 0.2;
      return { x0, z0, vx, vz, tmax: 5.5 };
    },
    dogAt(dog, t) { const u = Math.min(t, dog.tmax); return { x: dog.x0 + dog.vx * u, z: dog.z0 + dog.vz * u }; },
    // 飛ばす。p = { v（m/s 8〜26）, pitch（ラジアン 0.1〜0.6）, yaw（ラジアン ±0.8）, curve（-1〜1）}
    fly(p) {
      const v = clamp(p.v, 6, 28), pitch = clamp(p.pitch, 0.05, 0.7), yaw = clamp(p.yaw, -0.9, 0.9), cv = clamp(p.curve, -1, 1);
      let vh = v * Math.cos(pitch), vy = v * Math.sin(pitch), hd = yaw, x = 0, z = 0, h = 1.1, t = 0; const dt = 1 / 60, pts = [{ t: 0, x, z, h }];
      for (let k = 0; k < 600; k++) {
        const lift = Math.min(0.78, 0.0016 * vh * vh);
        vy += -G * (1 - lift) * dt; vh *= 1 - 0.07 * dt; hd += cv * 0.34 * dt * (vh / 16) * (1.2 - Math.min(1, t / 3));
        x += Math.sin(hd) * vh * dt; z += Math.cos(hd) * vh * dt; h += vy * dt; t += dt; pts.push({ t, x, z, h: Math.max(0, h) }); if (h <= 0) break;
      }
      return { pts, land: pts[pts.length - 1] };
    },
    // 投げの結果。犬が空中で受けたか
    throwDisc(run, p) {
      if (run.done) return null; const i = run.i, dog = Disc.dogFor(run, i), f = Disc.fly(p), reach = run.cfg.reach;
      let caught = null;
      for (const q of f.pts) { if (q.t < 0.25) continue; const d = Disc.dogAt(dog, q.t); if (Math.hypot(d.x - q.x, d.z - q.z) <= reach && q.h >= 0.15 && q.h <= 2.3) { caught = q; break; } }
      let score = 0, kind = 'miss';
      if (caught) { const curve = Math.abs(p.curve) > 0.25; score = 10 + Math.min(5, Math.floor(caught.z / 8)) + (curve ? 3 : 0); kind = curve ? 'curve' : 'catch'; }
      else { const L = f.land, d = Disc.dogAt(dog, L.t + 0.6); if (Math.hypot(d.x - L.x, d.z - L.z) <= reach * 2.2) { score = 3; kind = 'near'; } }
      const th = { p: { v: p.v, pitch: p.pitch, yaw: p.yaw, curve: p.curve }, dog, pts: f.pts, land: f.land, caught, score, kind };
      run.throws.push(th); run.total += score; run.i++; if (run.i >= Disc.N) run.done = true; return th;
    },
    // テスト・ボット用：犬を受けられる投げ方を探す（グリッド探索）
    solve(run, curve) {
      const dog = Disc.dogFor(run, run.i); let best = null;
      for (let v = 10; v <= 26; v += 1) for (let pitch = 0.14; pitch <= 0.5; pitch += 0.04) for (let yaw = -0.7; yaw <= 0.7; yaw += 0.02) {
        const f = Disc.fly({ v, pitch, yaw, curve: curve || 0 });
        for (const q of f.pts) { if (q.t < 0.25) continue; const d = Disc.dogAt(dog, q.t); const dd = Math.hypot(d.x - q.x, d.z - q.z); if (dd <= run.cfg.reach * 0.55 && q.h >= 0.4 && q.h <= 2.0) { if (!best || q.z > best.z) best = { v, pitch, yaw, curve: curve || 0, z: q.z }; break; } }
      }
      return best;
    },
  };

  // =====================================================================================
  // バスケシュート：横から見たコート。フリックの向きが角度、速さが強さ。10本
  // =====================================================================================
  const HOOPS = [{ rim: 0.32, dmin: 3.0, dmax: 4.8 }, { rim: 0.28, dmin: 3.4, dmax: 6.4 }, { rim: 0.25, dmin: 3.8, dmax: 7.8 }];
  const HOOP_Y = 3.05, BALL_R = 0.11, REL_Y = 2.0;
  const Hoops = {
    CFG: HOOPS, N: 10, HOOP_Y, BALL_R, REL_Y,
    // opts.variant: null（10本）| 'contest'（3ポイントコンテスト：5カ所×5本、さいごの1本はマネーボール2倍、60秒）| 'pickup'（CPU と1本ずつこうたい）
    newRun(diff, seed, opts) {
      const variant = opts && (opts.variant === 'contest' || opts.variant === 'pickup') ? opts.variant : null, cfg = HOOPS[clamp(diff | 0, 0, 2)], r = rng(hash32('hoops:' + seed)), ds = [], n = variant === 'contest' ? 25 : Hoops.N;
      for (let i = 0; i < n; i++) ds.push(variant === 'contest' ? [5.6, 6.0, 6.4, 6.0, 5.6][i % 5] : Math.round((cfg.dmin + r() * (cfg.dmax - cfg.dmin)) * 10) / 10);
      const cpu = []; if (variant === 'pickup') { const cr = rng(hash32('hcpu:' + seed)), pm = [0.36, 0.48, 0.6][clamp(diff | 0, 0, 2)]; for (let i = 0; i < n; i++) cpu.push({ made: cr() < clamp(pm - 0.07 * (ds[i] - 4), 0.12, 0.8), three: ds[i] >= 5.5, swish: cr() < 0.4 }); }
      return { kind: 'hoops', variant, n, diff: clamp(diff | 0, 0, 2), seed, cfg, ds, cpu, cpuTotal: 0, i: 0, shots: [], total: 0, done: false, limit: variant === 'contest' ? 60 : 0 };
    },
    // 飛ばす。D = ゴールまでの距離（m）。p = { v, ang }。軌道 pts（x, y）と結果 { made, swish, rim, board }
    fly(D, rimR, p) {
      const v = clamp(p.v, 3, 16), ang = clamp(p.ang, 0.2, 1.45);
      let x = 0, y = REL_Y, vx = v * Math.cos(ang), vy = v * Math.sin(ang), t = 0, touched = false, made = false, hitRim = false, hitBoard = false, pastRim = false; const dt = 1 / 240, pts = [{ x, y }];
      const pts2 = [[D - rimR, HOOP_Y], [D + rimR, HOOP_Y]], bx = D + rimR + 0.18;
      for (let k = 0; k < 2400; k++) {
        const py = y; vy -= G * dt; x += vx * dt; y += vy * dt; t += dt;
        for (const rp of pts2) { const dx = x - rp[0], dy = y - rp[1], d = Math.hypot(dx, dy), rr = BALL_R + 0.02; if (d < rr && d > 1e-6) { const nx = dx / d, ny = dy / d, vn = vx * nx + vy * ny; if (vn < 0) { vx -= 1.5 * vn * nx; vy -= 1.5 * vn * ny; vx *= 0.92; vy *= 0.92; } x = rp[0] + nx * rr; y = rp[1] + ny * rr; touched = true; hitRim = true; } }
        if (x + BALL_R > bx && y > HOOP_Y - 0.1 && y < HOOP_Y + 0.95 && vx > 0) { x = bx - BALL_R; vx = -vx * 0.55; vy *= 0.9; touched = true; hitBoard = true; }
        if (!made && py > HOOP_Y && y <= HOOP_Y && vy < 0 && x > D - rimR + 0.04 && x < D + rimR - 0.04) { made = true; }
        if (k % 4 === 0) pts.push({ x, y });
        if (y < BALL_R && vy < 0 || x > D + 4 || t > 8) break;
        if (made && y < HOOP_Y - 0.6) break;
      }
      pts.push({ x, y }); return { pts, made, swish: made && !touched, rim: hitRim, board: hitBoard };
    },
    shoot(run, p) {
      if (run.done) return null; const i = run.i, D = run.ds[i], f = Hoops.fly(D, run.cfg.rim, p), three = D >= 5.5;
      const money = run.variant === 'contest' && i % 5 === 4, score = run.variant === 'contest' ? (f.made ? (money ? 2 : 1) : 0) : f.made ? (three ? 3 : 2) + (f.swish ? 1 : 0) : 0, sh = { D, p: { v: p.v, ang: p.ang }, pts: f.pts, made: f.made, swish: f.swish, rim: f.rim, board: f.board, score, three };
      if (run.variant === 'pickup') { const c = run.cpu[i]; sh.cpu = c; if (c.made) run.cpuTotal += (c.three ? 3 : 2) + (c.swish ? 1 : 0); } sh.money = money;
      run.shots.push(sh); run.total += score; run.i++; if (run.i >= run.n) run.done = true; return sh;
    },
    // ボット・テスト用：リングの中心を通る強さを角度ごとに計算（落ちてくる角度が深いほど入りやすい）
    solve(D, ang, rimR) {
      const dx = D, dy = HOOP_Y - REL_Y, c = Math.cos(ang), t = Math.tan(ang); const den = 2 * c * c * (dx * t - dy); if (den <= 0) return null;
      return { v: Math.sqrt(G * dx * dx / den), ang };
    },
  };

  // =====================================================================================
  // ボウリング：レーンの上の円（ボールとピン）の衝突。10フレーム。標準の得点（core.js の bowlingScore）
  // =====================================================================================
  const LANE_W = 1.05, PIN_Y = 18.29, BALL_RB = 0.1085, PIN_R = 0.07;
  const PIN_SPOTS = (() => { const o = []; const dx = 0.3048 / 2, dy = 0.264; for (let row = 0; row < 4; row++) for (let k = 0; k <= row; k++) o.push({ x: (k - row / 2) * 0.3048, y: PIN_Y + row * dy }); return o; })();
  const LANES = { house: { hook: 2.1, start: 7, len: 9 }, dry: { hook: 3.3, start: 4, len: 8 }, oil: { hook: 1.25, start: 10, len: 8 } };
  // スペアチャレンジの「のこりピン」（0 = 1番ピン … 9 = 10番ピン）
  const LEAVES = [
    [[3], [5], [1], [2], [6], [9], [4], [7], [3, 6], [5, 8]],
    [[3, 6], [5, 9], [1, 4], [2, 5], [3, 7], [1, 5], [2, 6], [4, 8], [6, 9], [0, 3]],
    [[6, 9], [3, 9], [5, 6], [1, 9], [2, 7], [4, 5], [6, 8, 9], [3, 5, 9], [1, 2, 8], [0, 6, 9]],
  ];
  const Bowling = {
    PIN_SPOTS, LANE_W, PIN_Y,
    LANES, LEAVES,
    // opts = { lane: 'house'|'dry'|'oil', variant: null | 'pins100' | 'spares' }。バリエーションは、1ラウンドごとに ピンの並びをかえて遊ぶ
    newRun(diff, seed, opts) {
      opts = opts || {}; diff = clamp(diff | 0, 0, 2); const run = { kind: 'bowling', diff, seed, lane: LANES[opts.lane] ? opts.lane : 'house', variant: opts.variant || null, rolls: [], standing: Array(10).fill(true), spots: PIN_SPOTS, done: false, total: 0, last: null, round: 0, ball: 0 };
      if (run.variant === 'pins100') { const r = rng(hash32('b100:' + seed)); run.layouts = []; for (let k = 0; k < 10; k++) run.layouts.push(Bowling.layout(r, diff)); run.spots = run.layouts[0]; }
      else if (run.variant === 'spares') { const r = rng(hash32('bsp:' + seed)), pool = LEAVES[diff].slice(); for (let i = pool.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [pool[i], pool[j]] = [pool[j], pool[i]]; } run.leaves = pool.slice(0, 10); run.standing = PIN_SPOTS.map((q, i) => run.leaves[0].includes(i)); }
      return run;
    },
    // ピン100本：10ラウンド、そのつどピンの並びがちがう（10本ずつ）
    layout(r, diff) { const w = [0.3, 0.4, 0.5][diff], out = []; let g = 0; while (out.length < 10 && g++ < 500) { const x = (r() * 2 - 1) * w, y = PIN_Y + r() * (0.5 + diff * 0.3); if (out.every(q => Math.hypot(q.x - x, q.y - y) > 0.17)) out.push({ x: Math.round(x * 1000) / 1000, y: Math.round(y * 1000) / 1000 }); } while (out.length < 10) out.push({ x: -0.45 + out.length * 0.09, y: PIN_Y + 1.1 }); return out; },
    // 1投。p = { x（スタート位置 m、±0.45）, ang（ラジアン、ふつう ±0.08）, v（m/s 4.5〜9.5）, spin（-1〜1）}。bumpers = true で両わきがはねかえす
    simulate(standing, p, bumpers, o) {
      o = o || {}; const hook = o.hook || 2.1, rs = o.start == null ? 7 : o.start, rl = o.len || 9, SPOTS = o.spots || PIN_SPOTS, B = { x: clamp(p.x, -0.5, 0.5), y: 0, vx: 0, vy: 0, r: BALL_RB, m: 6.4, gut: 0 };
      const sp = clamp(p.v, 4, 10); B.vx = sp * Math.sin(clamp(p.ang, -0.2, 0.2)); B.vy = sp * Math.cos(clamp(p.ang, -0.2, 0.2));
      const pins = SPOTS.map((s, i) => ({ x: s.x, y: s.y, vx: 0, vy: 0, up: !!standing[i], gone: !standing[i], hit: false, i, r: PIN_R, m: 1.55 }));
      const dt = 1 / 240, frames = []; const spin = clamp(p.spin, -1, 1);
      for (let k = 0; k < 2400; k++) {
        const ramp = clamp((B.y - rs) / rl, 0, 1);
        if (!B.gut) { B.vx += spin * hook * ramp * dt; B.vy -= 0.06 * dt; }
        B.x += B.vx * dt; B.y += B.vy * dt;
        if (!B.gut && Math.abs(B.x) > LANE_W / 2 + 0.01 && B.y < PIN_Y - 0.5) { if (bumpers) { B.x = Math.sign(B.x) * (LANE_W / 2 + 0.01); B.vx = -B.vx * 0.35; } else { B.gut = Math.sign(B.x); } }
        if (B.gut) { const tx = B.gut * 0.7; B.x += (tx - B.x) * 0.1; B.vx = 0; }
        // ピンとの衝突
        const objs = [B, ...pins.filter(q => !q.gone)];
        for (let a = 0; a < objs.length; a++) for (let b = a + 1; b < objs.length; b++) {
          const o = objs[a], q = objs[b]; if (o !== B && q !== B && !o.up && !q.up && Math.hypot(o.vx, o.vy) < 0.05 && Math.hypot(q.vx, q.vy) < 0.05) continue;
          const dx = q.x - o.x, dy = q.y - o.y, rr = o.r + q.r, d2 = dx * dx + dy * dy; if (d2 >= rr * rr || d2 < 1e-12) continue;
          const d = Math.sqrt(d2), nx = dx / d, ny = dy / d, rvn = (o.vx - q.vx) * nx + (o.vy - q.vy) * ny;
          const pen = rr - d; o.x -= nx * pen * q.m / (o.m + q.m); o.y -= ny * pen * q.m / (o.m + q.m); q.x += nx * pen * o.m / (o.m + q.m); q.y += ny * pen * o.m / (o.m + q.m);
          if (rvn > 0) { const j = (1 + 0.55) * rvn / (1 / o.m + 1 / q.m); o.vx -= j * nx / o.m; o.vy -= j * ny / o.m; q.vx += j * nx / q.m; q.vy += j * ny / q.m; if (rvn > 0.25) { for (const z of [o, q]) if (z !== B && z.up) z.up = false; } }
        }
        for (const q of pins) { if (q.up) { q.vx = q.vy = 0; continue; } if (!q.gone) { q.x += q.vx * dt; q.y += q.vy * dt; const dmp = Math.exp(-2.4 * dt); q.vx *= dmp; q.vy *= dmp; if (Math.hypot(q.vx, q.vy) < 0.05) q.vx = q.vy = 0; if (Math.abs(q.x) > 0.7 || q.y > 20.2) q.gone = true; } }
        if (k % 4 === 0) frames.push({ bx: B.x, by: B.y, p: pins.map(q => [q.x, q.y, q.up ? 1 : 0, q.gone ? 1 : 0]) });
        if (B.y > 19.6 || (B.vy < 0.4 && k > 60)) { if (!pins.some(q => !q.up && !q.gone && Math.hypot(q.vx, q.vy) > 0.06)) break; }
      }
      const down = pins.map(q => !q.up); const fell = standing.map((s, i) => !!s && down[i]);
      return { down: fell.filter(Boolean).length, fell, frames, gutter: !!B.gut };
    },
    // 投げる前にピンを立てなおす（フレームの1投目、10フレーム目で全部倒れたあと）
    prep(run) { const nb = C.bowlingScore(run.rolls).next; if (nb.ball === 0 || (nb.frame === 9 && run.standing.every(s => !s))) run.standing = Array(10).fill(true); return run.standing; },
    // バリエーションの1投
    rollV(run, p, bumpers) {
      if (run.done) return null; if (run.diff > 0) { const j = rng(hash32('bw:' + run.seed + ':' + run.rolls.length)), k = run.diff === 1 ? 1 : 3; p = { x: p.x + gauss(j) * 0.006 * k, ang: p.ang + gauss(j) * 0.0018 * k, v: p.v, spin: p.spin }; }
      const L = LANES[run.lane], allUp = run.standing.every(Boolean), r = Bowling.simulate(run.standing, p, bumpers == null ? run.diff === 0 : bumpers, { hook: L.hook, start: L.start, len: L.len, spots: run.spots });
      run.standing = run.standing.map((s, i) => s && !r.fell[i]); run.rolls.push(r.down); const clear = run.standing.every(s => !s), first = run.ball === 0;
      let spare = false, strike = false; if (run.variant === 'pins100') { run.total += r.down; strike = allUp && r.down === 10 && first; spare = !first && clear; run.ball++; if (clear || run.ball >= 2) { run.round++; run.ball = 0; if (run.round >= 10) run.done = true; else { run.standing = Array(10).fill(true); run.spots = run.layouts[run.round]; } } }
      else { spare = clear; if (clear) run.total += 10; run.round++; if (run.round >= 10) run.done = true; else run.standing = PIN_SPOTS.map((q, i) => run.leaves[run.round].includes(i)); }
      run.last = { down: r.down, frames: r.frames, gutter: r.gutter, strike, spare, score: null }; return r;
    },
    roll(run, p, bumpers) {
      if (run.variant) return Bowling.rollV(run, p, bumpers);
      if (run.done) return null; const standing = Bowling.prep(run), allUp = standing.every(Boolean);
      if (run.diff > 0) { const j = rng(hash32('bw:' + run.seed + ':' + run.rolls.length)), k = run.diff === 1 ? 1 : 3; p = { x: p.x + gauss(j) * 0.006 * k, ang: p.ang + gauss(j) * 0.0018 * k, v: p.v, spin: p.spin }; }
      const L = LANES[run.lane || 'house'], r = Bowling.simulate(standing, p, bumpers == null ? run.diff === 0 : bumpers, { hook: L.hook, start: L.start, len: L.len });
      run.standing = standing.map((s, i) => s && !r.fell[i]);
      run.rolls.push(r.down); const sc = C.bowlingScore(run.rolls); run.total = sc.total; run.done = sc.done;
      run.last = { down: r.down, frames: r.frames, gutter: r.gutter, strike: allUp && r.down === 10, spare: !allUp && run.standing.every(s => !s) , score: sc };
      return r;
    },
  };

  // =====================================================================================
  // 水上ジャンプ：ジャンプ台に向かって走り、とびたち（ゲージを止める）、空中でバランス、着水
  // =====================================================================================
  const JUMP = [{ gauge: 2.6, zone: 0.2, gust: 0.35, lipH: 2.6 }, { gauge: 1.9, zone: 0.13, gust: 0.75, lipH: 2.6 }, { gauge: 1.35, zone: 0.09, gust: 1.25, lipH: 2.6 }];
  const Jump = {
    CFG: JUMP, SWEET: 0.88,
    newRun(diff, seed) {
      const cfg = JUMP[clamp(diff | 0, 0, 2)], r = rng(hash32('jump:' + seed));
      return { kind: 'jump', diff: clamp(diff | 0, 0, 2), seed, cfg, phase: 'gauge', t: 0, q: 0, ph: [r() * 6.28, r() * 6.28, r() * 6.28], wind: Math.round((r() * 2 - 1) * 3 * 10) / 10,
        x: 0, y: cfg.lipH, vx: 0, vy: 0, pitch: 0.6, pr: 0, qsum: 0, qn: 0, ready: false, done: false, score: 0, dist: 0, style: 0, land: null, trail: [] };
    },
    // ゲージの針の位置（0〜1）
    needle(run, t) { return Math.min(1, t / run.cfg.gauge); },
    // とびたつ。t = ゲージが動き出してからの秒。ゲージが1に着いたら自動で（おそい）
    takeoff(run, t) {
      if (run.phase !== 'gauge') return null; const n = Jump.needle(run, t == null ? run.t : t), e = Math.abs(n - Jump.SWEET), q = n >= 1 ? 0.05 : clamp(1 - Math.max(0, e - run.cfg.zone * 0.5) / 0.22, 0, 1);
      run.q = q; const v = 12 + 8.5 * q, ang = 0.34 + 0.1 * (1 - Math.abs(q - 0.9)); run.vx = v * Math.cos(ang); run.vy = v * Math.sin(ang); run.phase = 'air'; run.t = 0; run.pitch = 0.45; run.pr = 0; run.ready = false;
      return { q, v, ang, needle: n };
    },
    // 空中の1コマ。u = バランスの入力（-1〜1。正で機首を上げる）、land = 着水の準備のタップ
    step(run, dt, u, land) {
      if (run.phase !== 'air') return;
      const c = run.cfg, g = run.ph; run.t += dt;
      const gust = c.gust * (Math.sin(run.t * 2.3 + g[0]) * 0.6 + Math.sin(run.t * 4.1 + g[1]) * 0.4);
      run.pr += (2.6 * clamp(u, -1, 1) + gust * 1.4 - 0.9 * run.pr) * dt; run.pitch += run.pr * dt; run.pitch = clamp(run.pitch, -1.4, 1.6);
      const ideal = 0.5 + 0.18 * Math.sin(run.t * 1.3 + g[2]) * (run.diff ? 1 : 0.4), err = run.pitch - ideal, ql = Math.max(0, 1 - (err / 0.55) * (err / 0.55));
      const v = Math.hypot(run.vx, run.vy), ax = -0.0007 * (1 + (1 - ql) * 3) * v * run.vx + run.wind * 0.02, ay = -G + 0.0066 * ql * v * v - 0.0007 * (1 + (1 - ql) * 3) * v * run.vy;
      run.vx += ax * dt; run.vy += ay * dt; run.x += run.vx * dt; run.y += run.vy * dt; run.qsum += ql; run.qn++; if (land) run.ready = true;
      if (run.trail.length < 4000 && run.qn % 2 === 0) run.trail.push({ x: run.x, y: run.y, p: run.pitch, ql });
      if (run.y <= 0 && run.vy < 0) Jump.touchdown(run);
    },
    touchdown(run) {
      const dist = Math.max(0, run.x), perr = Math.abs(run.pitch - 0.12), air = run.qn ? run.qsum / run.qn : 0;
      let land = 'crash'; if (run.ready && perr < 0.38) land = 'clean'; else if (perr < 0.75) land = run.ready ? 'wobble' : 'wobble'; if (!run.ready && perr >= 0.38) land = perr < 0.75 ? 'wobble' : 'crash';
      const styleAir = Math.round(air * 15), styleLand = land === 'clean' ? 15 : land === 'wobble' ? 5 : 0;
      run.dist = Math.round(dist * 10) / 10; run.style = styleAir + styleLand; run.land = land; run.air = air;
      run.score = Math.round((land === 'crash' ? dist * 0.5 : dist) * 2 + run.style); run.phase = 'done'; run.done = true;
    },
    // ボット：機首を理想の角度に近づける
    botU(run) { const ideal = 0.5 + 0.18 * Math.sin(run.t * 1.3 + run.ph[2]) * (run.diff ? 1 : 0.4); return clamp((ideal - run.pitch) * 2.2 - run.pr * 0.55, -1, 1); },
    idealNow(run) { return 0.5 + 0.18 * Math.sin(run.t * 1.3 + run.ph[2]) * (run.diff ? 1 : 0.4); },
    autoRun(run, tTake, uFn, dt) { dt = dt || 1 / 60; Jump.takeoff(run, tTake); let k = 0; while (run.phase === 'air' && k++ < 6000) Jump.step(run, dt, uFn ? uFn(run) : Jump.botU(run), run.y < 4 && run.vy < 0); return run; },
  };

  const api = { Archery, Disc, Hoops, Bowling, Jump };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SportsSim1 = api;
})(typeof window !== 'undefined' ? window : globalThis);
