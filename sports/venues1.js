// ぽかぽか島スポーツ：種目の「会場」（入力・時間・絵）その1。アーチェリー・ディスクドッグ・バスケシュート・ボウリング。
// 中身（物理と得点）は sim1.js。ここは、タッチ・マウス・キーの入力を sim の入力にして、軌道を絵にする。
// 会場は env（index.html が渡す）を受け取り、{ start, resize, down, move, up, key, update, draw } を返す。
(function (root) {
  'use strict';
  const A = root.SportsArt, S1 = root.SportsSim1, C = root.SportsCore;
  const V = root.SportsVenues = root.SportsVenues || {};
  const { PAL, ell, circ, rr, text, lin } = A;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), TAU = Math.PI * 2;

  // ---------- フリックの計算 ----------
  function Gesture() { this.pts = []; }
  Gesture.prototype.add = function (x, y, t) { this.pts.push({ x, y, t }); if (this.pts.length > 40) this.pts.shift(); };
  // 直近 win ミリ秒の動き：{ dx, dy, dt, len, speed（px/ms）}
  Gesture.prototype.vec = function (win) {
    const p = this.pts; if (p.length < 2) return { dx: 0, dy: 0, dt: 1, len: 0, speed: 0 }; const e = p[p.length - 1]; let s = p[0];
    for (let i = p.length - 1; i >= 0; i--) { s = p[i]; if (e.t - p[i].t >= win) break; }
    const dx = e.x - s.x, dy = e.y - s.y, dt = Math.max(8, e.t - s.t), len = Math.hypot(dx, dy); return { dx, dy, dt, len, speed: len / dt };
  };
  // 軌跡のふくらみ（-1〜1。右にふくらむと正）。始点→終点の線から、いちばん離れた点の距離 ÷ 長さ
  Gesture.prototype.curve = function (win) {
    let p = this.pts; if (win && p.length) { const e = p[p.length - 1].t; p = p.filter(q => e - q.t <= win); } if (p.length < 4) return 0; const a = p[0], b = p[p.length - 1], dx = b.x - a.x, dy = b.y - a.y, len = Math.hypot(dx, dy); if (len < 30) return 0;
    let best = 0; for (const q of p) { const d = ((q.x - a.x) * dy - (q.y - a.y) * dx) / len; if (Math.abs(d) > Math.abs(best)) best = d; }
    return clamp(-best / len * 4.2, -1, 1);
  };
  V.util = { Gesture, clamp };
  const fontPx = (w, h) => Math.round(clamp(Math.min(w, h) * 0.04, 12, 22));
  const nowMs = e => (e && e.t != null ? e.t : Date.now());

  // 風ふきながし（アーチェリー）
  function sock(g, x, y, s, wind, t) {
    g.strokeStyle = '#6b7b86'; g.lineWidth = Math.max(2, s * 0.08); g.beginPath(); g.moveTo(x, y + s); g.lineTo(x, y - s * 0.8); g.stroke();
    const dir = wind >= 0 ? 1 : -1, len = s * (0.55 + Math.min(1, Math.abs(wind) / 5) * 0.9), droop = 1 - Math.min(1, Math.abs(wind) / 4);
    for (let i = 0; i < 4; i++) { const x0 = x + dir * (len / 4) * i, x1 = x + dir * (len / 4) * (i + 1), wob = Math.sin(t * 6 + i) * s * 0.04; g.fillStyle = i % 2 ? '#fff' : PAL.coral; g.beginPath(); g.moveTo(x0, y - s * 0.8 + droop * s * 0.12 * i); g.lineTo(x1, y - s * 0.8 + droop * s * 0.12 * (i + 1) + wob); g.lineTo(x1, y - s * 0.8 + s * (0.3 - i * 0.04) + droop * s * 0.12 * (i + 1) + wob); g.lineTo(x0, y - s * 0.8 + s * (0.3 - i * 0.02) + droop * s * 0.12 * i); g.fill(); }
  }

  // =====================================================================================
  // アーチェリー
  // =====================================================================================
  V.archery = function (env) {
    const L = env.L; let w = 300, h = 400, run = null, st = 'ready', t = 0, hold = 0, aim = { x: 0, y: 0 }, ptr = null, last = null, flyT = 0, flyShot = null, rest = 0, pops = [], keys = {}, kt = 0;
    const Sim = S1.Archery;
    function G() { const cx = w / 2, cy = h * 0.43, rp = Math.min(w * 0.44, h * 0.34); return { cx, cy, rp, pm: rp / run.cfg.R }; }
    function start() { run = Sim.newRun(env.diff, env.seed); st = 'ready'; aim = { x: 0, y: 0 }; t = 0; hold = 0; pops = []; hud(); env.status(L('画面をなぞって ねらい、はなして うつ。風をよんでね', 'Drag to aim, release to shoot. Read the wind!')); }
    function hud() { env.hud(L('ほん ', 'Arrow ') + Math.min(run.i + 1, Sim.N) + '/' + Sim.N + '  ' + L('てん ', 'Pts ') + run.total); }
    function tiltOff() { const tl = env.tilt(); return tl.on ? { x: tl.x * run.cfg.R * 0.55, y: tl.y * run.cfg.R * 0.4 } : { x: 0, y: 0 }; }
    function shoot() {
      const to = tiltOff(); const r = Sim.shoot(run, aim.x + to.x, aim.y + to.y, t, hold); if (!r) return; st = 'fly'; flyT = 0; flyShot = r; env.sfx('drop'); env.tone(180, 0.18, { type: 'sawtooth', vol: 0.04, slide: 700 });
    }
    function landed() {
      const r = flyShot; env.noise(0.07, { vol: 0.1, freq: 900 }); env.tone(r.ring >= 9 ? 880 : 440, 0.1, { type: 'triangle', vol: 0.08 });
      if (r.x10) env.stat('bulls'); const g = G(); pops.push({ txt: r.ring ? (r.x10 ? 'X 10' : String(r.ring)) : L('はずれ', 'Miss'), x: g.cx + r.x * g.pm, y: g.cy + r.y * g.pm - 14, t: 0, col: r.ring >= 9 ? PAL.sun : '#fff' });
      st = 'result'; rest = 0.9; hud(); env.status(r.ring ? L(r.ring + '点！', r.ring + ' points!') : L('はずれ！ 風にちゅうい', 'Missed! Mind the wind')); env.buzz(r.ring >= 9 ? 20 : 8);
    }
    return {
      start, resize(a, b) { w = a; h = b; },
      down(x, y, id, e) { if (st !== 'ready') return; ptr = id; last = { x, y }; st = 'draw'; t = 0; hold = 0; env.sfx('tap'); },
      move(x, y, id) { if (st !== 'draw' || ptr !== id) return; const g = G(), s = env.set.sens * 0.9; aim.x = clamp(aim.x + (x - last.x) / g.pm * s, -run.cfg.R * 1.7, run.cfg.R * 1.7); aim.y = clamp(aim.y + (y - last.y) / g.pm * s, -run.cfg.R * 1.7, run.cfg.R * 1.7); last = { x, y }; },
      up(x, y, id) { if (st !== 'draw' || ptr !== id) return; ptr = null; shoot(); },
      key(code, down) {
        keys[code] = down; if (code === 'Space' || code === 'Enter') { if (down && st === 'ready') { st = 'draw'; t = 0; hold = 0; } else if (!down && st === 'draw') shoot(); }
      },
      update(dt) {
        if (!run) return; kt += dt; for (const p of pops) p.t += dt; pops = pops.filter(p => p.t < 1.1);
        if (st === 'draw') { t += dt; hold += dt; const sp = run.cfg.R * 1.4 * dt; if (keys.ArrowLeft) aim.x -= sp; if (keys.ArrowRight) aim.x += sp; if (keys.ArrowUp) aim.y -= sp; if (keys.ArrowDown) aim.y += sp; }
        else if (st === 'fly') { flyT += dt; if (flyT >= 0.38) landed(); }
        else if (st === 'result') { rest -= dt; if (rest <= 0) { if (run.done) { st = 'over'; env.done({ score: run.total, detail: { x10: run.shots.filter(s => s.x10).length } }); } else { st = 'ready'; env.status(L('つぎのいっぽん。なぞって ねらおう', 'Next arrow. Drag to aim.')); } } }
      },
      draw(g) {
        if (!run) return; const hor = h * 0.62; A.sky(g, w, h, hor, kt); // 空・海・島・草
        g.fillStyle = PAL.sea1; g.fillRect(0, hor - h * 0.08, w, h * 0.08); g.fillStyle = PAL.grass2; g.beginPath(); g.ellipse(w * 0.2, hor - h * 0.08, w * 0.3, h * 0.07, 0, Math.PI, TAU); g.fill(); g.fillStyle = PAL.grass1; g.beginPath(); g.ellipse(w * 0.85, hor - h * 0.08, w * 0.28, h * 0.05, 0, Math.PI, TAU); g.fill();
        g.fillStyle = lin(g, 0, hor, 0, h, PAL.grass0, PAL.grass1); g.fillRect(0, hor, w, h - hor); A.palm(g, w * 0.08, hor + 4, h * 0.2, kt, 0.4); A.palm(g, w * 0.93, hor + 2, h * 0.17, kt, -0.4);
        const q = G(), R = run.cfg.R;
        g.strokeStyle = PAL.wood2; g.lineWidth = Math.max(4, q.rp * 0.07); g.lineCap = 'round'; g.beginPath(); g.moveTo(q.cx - q.rp * 0.5, q.cy + q.rp * 0.5); g.lineTo(q.cx - q.rp * 0.8, hor + h * 0.06); g.moveTo(q.cx + q.rp * 0.5, q.cy + q.rp * 0.5); g.lineTo(q.cx + q.rp * 0.8, hor + h * 0.06); g.stroke();
        const cols = ['#fff', '#fff', '#2b2b33', '#2b2b33', '#3aa0ff', '#3aa0ff', PAL.red, PAL.red, PAL.sun, PAL.sun];
        for (let i = 0; i < 10; i++) circ(g, q.cx, q.cy, q.rp * (1 - i / 10), cols[i], 'rgba(18,59,87,.7)', 1);
        // 刺さった矢
        for (const s of run.shots) if (s.ring || Math.hypot(s.x, s.y) < R * 1.4) { const px = q.cx + s.x * q.pm, py = q.cy + s.y * q.pm; g.strokeStyle = '#6b4a2a'; g.lineWidth = 2; g.beginPath(); g.moveTo(px, py); g.lineTo(px - q.rp * 0.18, py + q.rp * 0.3); g.stroke(); circ(g, px, py, 2.4, '#222'); g.fillStyle = PAL.red; g.fillRect(px - q.rp * 0.2, py + q.rp * 0.26, 4, 6); }
        // 飛んでいる矢
        if (st === 'fly' && flyShot) { const f = flyT / 0.38, px = lerp(w / 2, q.cx + flyShot.x * q.pm, f), py = lerp(h * 0.95, q.cy + flyShot.y * q.pm, f), sz = 1 - f * 0.55; g.strokeStyle = '#6b4a2a'; g.lineWidth = 3 * sz; g.beginPath(); g.moveTo(px, py); g.lineTo(px + (w / 2 - px) * 0.0, py + 46 * sz); g.stroke(); circ(g, px, py, 4 * sz, '#222'); }
        // ねらい
        if (st === 'ready' || st === 'draw') {
          const sw = Sim.swayAt(run, run.i, st === 'draw' ? t : 0, hold), to = tiltOff(), rx = q.cx + (aim.x + to.x + (st === 'draw' ? sw.x : 0)) * q.pm, ry = q.cy + (aim.y + to.y + (st === 'draw' ? sw.y : 0)) * q.pm;
          const bad = hold > 3; g.strokeStyle = bad ? PAL.red : '#fff'; g.lineWidth = 3; g.beginPath(); g.arc(rx, ry, q.rp * 0.12, 0, TAU); g.moveTo(rx - q.rp * 0.22, ry); g.lineTo(rx + q.rp * 0.22, ry); g.moveTo(rx, ry - q.rp * 0.22); g.lineTo(rx, ry + q.rp * 0.22); g.stroke(); g.strokeStyle = 'rgba(18,59,87,.6)'; g.lineWidth = 1; g.stroke();
          if (env.diff === 0) { const dr = Sim.drift(run, run.i) * q.pm; g.setLineDash([4, 4]); g.strokeStyle = PAL.sun; g.lineWidth = 2.5; g.beginPath(); g.arc(rx + dr, ry, q.rp * 0.09, 0, TAU); g.stroke(); g.setLineDash([]); }
          if (st === 'draw') { const bw = w * 0.36, bx = w / 2 - bw / 2, by = h * 0.86; rr(g, bx, by, bw, 10, 5); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill(); rr(g, bx, by, bw * clamp(1 - hold / 6, 0, 1), 10, 5); g.fillStyle = bad ? PAL.red : '#7be0a0'; g.fill(); text(g, L('いき', 'Breath'), w / 2, by - 10, fontPx(w, h) - 2); }
        }
        // 風
        const wd = run.winds[Math.min(run.i, Sim.N - 1)]; sock(g, w * 0.86, h * 0.1, Math.min(w, h) * 0.07, wd, kt);
        text(g, (env.diff === 2 ? '' : Math.abs(wd).toFixed(1) + 'm/s ') + (wd > 0.15 ? '→' : wd < -0.15 ? '←' : '・'), w * 0.86, h * 0.1 + Math.min(w, h) * 0.12, fontPx(w, h));
        for (const p of pops) text(g, p.txt, p.x, p.y - p.t * 30, fontPx(w, h) * 1.7, { color: p.col });
      },
    };
  };
  const lerp = (a, b, t) => a + (b - a) * t;

  // =====================================================================================
  // ディスクドッグ
  // =====================================================================================
  V.disc = function (env) {
    const L = env.L; let w = 300, h = 400, run = null, st = 'ready', t = 0, ptr = null, gest = null, th = null, ft = 0, rest = 0, pops = [], kt = 0, pre = null, dogT = 0, keys = {}, kcurve = 0;
    const Sim = S1.Disc;
    function proj(x, z, hh) { const hor = h * 0.27, yb = h * 0.84, u = Math.sqrt(clamp(z, 0, 90) / 90), k = 0.22 + 0.78 * (1 - u), px = Math.min(w * 0.042, h * 0.03) * k; return { x: w / 2 + x * px, y: hor + (yb - hor) * (1 - u) - (hh || 0) * px * 1.3, s: px * 6 }; }
    function start() { run = Sim.newRun(env.diff, env.seed); st = 'ready'; th = null; pops = []; pre = null; hud(); env.status(L('スワイプでディスクを投げよう。犬の行くさきへ！', 'Flick to throw the disc — aim ahead of the dog!')); dogT = 0; }
    function hud() { env.hud(L('なげ ', 'Throw ') + Math.min(run.i + 1, Sim.N) + '/' + Sim.N + '  ' + L('てん ', 'Pts ') + run.total); }
    function params(v) {
      // v = ジェスチャーのベクトル。dx, dy は画面。上へ投げる
      const spd = clamp(v.speed, 0.2, 3.2), len = clamp(v.len, 0, h * 0.5), yaw = clamp(Math.atan2(v.dx, -v.dy), -1.1, 1.1) * 0.62;
      return { v: 8 + 6.2 * spd, pitch: 0.16 + 0.3 * clamp(len / (h * 0.4), 0, 1), yaw, curve: gest ? gest.curve(260) : kcurve };
    }
    function throwIt(p) {
      th = Sim.throwDisc(run, p); if (!th) return; st = 'fly'; ft = 0; env.sfx('drop'); env.noise(0.12, { vol: 0.06, freq: 2600 }); env.buzz(10);
    }
    function after() {
      const r = th; env.sfx(r.kind === 'miss' ? 'fail' : 'ok'); if (r.caught) env.stat('catches');
      pops.push({ txt: r.kind === 'curve' ? L('カーブキャッチ！', 'Curve catch!') : r.kind === 'catch' ? L('ナイスキャッチ！', 'Nice catch!') : r.kind === 'near' ? L('おしい', 'Close') : L('とどかない', 'Missed'), t: 0, col: r.caught ? PAL.sun : '#fff' });
      st = 'result'; rest = 1.4; hud(); env.status(r.score ? L('+' + r.score + '点', '+' + r.score + ' pts') : L('ざんねん！', 'Missed!'));
    }
    return {
      start, resize(a, b) { w = a; h = b; },
      down(x, y, id, e) { if (st !== 'ready' || y < h * 0.12) return; ptr = id; gest = new Gesture(); gest.add(x, y, nowMs(e)); },
      move(x, y, id, e) { if (ptr !== id || !gest) return; gest.add(x, y, nowMs(e)); const v = gest.vec(220); if (env.diff < 2 && v.len > 30) { const p = params(v); pre = Sim.fly(p).pts; } else pre = null; },
      up(x, y, id, e) {
        if (ptr !== id || !gest) return; gest.add(x, y, nowMs(e)); const v = gest.vec(160); ptr = null; pre = null;
        if (v.len < 50 || v.dy > -20) { env.status(L('もっと長く、上へスワイプ！', 'Swipe longer, upward!')); gest = null; return; } const p = params(v); gest = null; throwIt(p);
      },
      key(code, down) { keys[code] = down; if (down && code === 'Space' && st === 'ready') { const sx = (keys.ArrowRight ? 1 : 0) - (keys.ArrowLeft ? 1 : 0); throwIt({ v: 18, pitch: 0.28, yaw: sx * 0.3, curve: 0 }); } },
      update(dt) {
        if (!run) return; kt += dt; dogT += dt; for (const p of pops) p.t += dt; pops = pops.filter(p => p.t < 1.4);
        if (st === 'fly') { ft += dt; const end = th.pts[th.pts.length - 1].t + (th.caught ? 0 : 0.3); if (th.caught && ft >= th.caught.t + 0.15 || ft >= end) after(); }
        else if (st === 'result') { rest -= dt; if (rest <= 0) { if (run.done) { st = 'over'; env.done({ score: run.total, detail: { catches: run.throws.filter(x => x.caught).length } }); } else { st = 'ready'; pre = null; env.status(L('つぎのなげ。犬の走る先をねらおう', 'Next throw. Aim ahead of the dog.')); } } }
      },
      draw(g) {
        if (!run) return; const hor = h * 0.3; A.sky(g, w, h, hor, kt); g.fillStyle = PAL.sea1; g.fillRect(0, hor - h * 0.03, w, h * 0.03);
        g.fillStyle = lin(g, 0, hor, 0, h, PAL.grass1, PAL.grass0); g.fillRect(0, hor, w, h - hor);
        // 芝の縞と距離の線
        for (let z = 0; z < 80; z += 10) { const a = proj(-60, z), c = proj(0, z + 10); g.fillStyle = (z / 10) % 2 ? 'rgba(255,255,255,.08)' : 'rgba(0,0,0,.05)'; g.fillRect(0, c.y, w, a.y - c.y); if (z > 0) text(g, z + 'm', w * 0.08, a.y - 4, fontPx(w, h) - 3, { color: 'rgba(255,255,255,.9)', stroke: 'rgba(18,59,87,.4)' }); }
        for (const [x, z, s] of [[-14, 30, 1], [16, 40, 1.2], [-20, 55, 1.3], [24, 22, 0.9]]) { const p = proj(x, z); A.palm(g, p.x, p.y, p.s * 1.6, kt, x > 0 ? -0.3 : 0.3); }
        if (!run.done || st !== 'over') {
          const dog = th && st !== 'ready' ? th.dog : Sim.dogFor(run, Math.min(run.i, Sim.N - 1)), tt = st === 'fly' ? ft : st === 'result' ? 99 : 0; let dp = Sim.dogAt(dog, tt);
          if (th && th.caught && (st === 'fly' || st === 'result')) { dp = Sim.dogAt(dog, Math.min(tt, th.caught.t)); }
          // 犬が走る先（やさしい・ふつうは点線で）
          if (st === 'ready' && env.diff < 2) { g.setLineDash([4, 5]); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; g.beginPath(); for (let k = 0; k <= 12; k++) { const q = Sim.dogAt(dog, k * 0.45), p = proj(q.x, q.z); if (k) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); } g.stroke(); g.setLineDash([]); if (env.diff === 0) for (let k = 1; k <= 5; k++) { const q = Sim.dogAt(dog, k * 1), p = proj(q.x, q.z); circ(g, p.x, p.y, 3 + p.s * 0.05, PAL.sun, PAL.ink, 1); text(g, k + 's', p.x, p.y - 10, fontPx(w, h) - 4); } }
          const p = proj(dp.x, dp.z), moving = st === 'fly' && !(th.caught && ft >= th.caught.t), dirx = dog.vx >= 0 ? 1 : -1;
          let jmp = 0; if (th && th.caught && st !== 'ready') { const near = Math.abs(ft - th.caught.t); jmp = Math.max(0, 1 - near / 0.4) * p.s * 0.35; }
          A.dog(g, p.x, p.y, Math.max(22, p.s * 0.9), { run: moving, t: dogT, dir: dirx, jump: jmp });
        }
        // 投げる人
        const me = proj(0, 0); A.mascot(g, me.x, me.y + 6, h * 0.19, { kind: env.kind, pose: st === 'fly' ? 'swing' : st === 'result' && th && th.caught ? 'cheer' : 'idle', t: kt });
        // ディスク
        const disc = (q, big) => { const p = proj(q.x, q.z, q.h), sh = proj(q.x, q.z, 0); ell(g, sh.x, sh.y, p.s * 0.06 + 3, 2.5, 'rgba(0,0,0,.22)'); g.save(); g.translate(p.x, p.y); g.rotate(Math.sin(kt * 8) * 0.1); ell(g, 0, 0, Math.max(7, p.s * 0.1), Math.max(3, p.s * 0.04), PAL.coral, PAL.ink, 1.5); ell(g, 0, -1, Math.max(4, p.s * 0.06), Math.max(1.6, p.s * 0.02), '#ffc2b8'); g.restore(); };
        if (pre) { g.setLineDash([3, 5]); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 2; g.beginPath(); pre.forEach((q, i) => { const p = proj(q.x, q.z, q.h); if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }); g.stroke(); g.setLineDash([]); const e = pre[pre.length - 1], pe = proj(e.x, e.z); ell(g, pe.x, pe.y, 10, 4, null, '#fff', 2); }
        if (st === 'fly') { const pts = th.pts; let q = pts[pts.length - 1]; for (let i = 0; i < pts.length; i++) if (pts[i].t >= ft) { q = pts[i]; break; } if (!(th.caught && ft >= th.caught.t)) disc(q); else { const dp = Sim.dogAt(th.dog, th.caught.t), pp = proj(dp.x, dp.z, 1.4); disc({ x: dp.x, z: dp.z, h: 1.2 }); } }
        else if (st === 'ready') { const hand = proj(0.3, 0.3, 1.2); disc({ x: 0.3, z: 0.3, h: 1.2 }); }
        else if (st === 'result' && th) { if (th.caught) { const dp = Sim.dogAt(th.dog, th.caught.t); disc({ x: dp.x, z: dp.z, h: 1.0 }); } else disc({ x: th.land.x, z: th.land.z, h: 0.05 }); }
        for (const p of pops) text(g, p.txt, w / 2, h * 0.5 - p.t * 24, fontPx(w, h) * 1.6, { color: p.col });
        if (gest && gest.pts.length > 1) { g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 4; g.lineCap = 'round'; g.beginPath(); gest.pts.forEach((q, i) => { if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }); g.stroke(); }
      },
    };
  };

  // =====================================================================================
  // バスケシュート
  // =====================================================================================
  V.hoops = function (env) {
    const L = env.L; let w = 300, h = 400, run = null, st = 'ready', ptr = null, start0 = null, cur = null, sh = null, ft = 0, rest = 0, pops = [], kt = 0, keys = {}, kp = { v: 8, ang: 0.9 };
    const Sim = S1.Hoops;
    const geo = () => { const sc = Math.min(w * 0.82 / (run.cfg.dmax + 2.4), h * 0.82 / 6.4), x0 = w * 0.12, fy = h * 0.86; return { sc, x0, fy, X: m => x0 + m * sc, Y: m => fy - m * sc }; };
    function start() { run = Sim.newRun(env.diff, env.seed); st = 'ready'; pops = []; sh = null; hud(); env.status(L('ボールからフリック（ひっぱって はなす）。ななめ上へ！', 'Flick from the ball toward the hoop, with an arc.')); }
    function hud() { env.hud(L('シュート ', 'Shot ') + Math.min(run.i + 1, Sim.N) + '/' + Sim.N + '  ' + L('てん ', 'Pts ') + run.total); }
    function paramsFrom(sx, sy, ex, ey) { const g = geo(), dx = ex - sx, dy = sy - ey; const ang = clamp(Math.atan2(dy, dx), 0.35, 1.4), len = Math.hypot(dx, dy); return { v: clamp(len * 0.052 * env.set.sens, 3, 15), ang }; }
    function shoot(p) { sh = Sim.shoot(run, p); if (!sh) return; st = 'fly'; ft = 0; env.sfx('pop'); env.buzz(8); }
    function after() {
      env.sfx(sh.made ? (sh.swish ? 'win' : 'ok') : 'fail'); if (sh.swish) env.stat('swish');
      pops.push({ txt: sh.made ? (sh.swish ? L('スウィッシュ！', 'Swish!') : L('ナイスシュート！', 'Nice!')) : (sh.rim ? L('おしい！', 'So close!') : L('はずれ', 'Miss')), t: 0, col: sh.made ? PAL.sun : '#fff' });
      st = 'result'; rest = 1.1; hud(); env.status(sh.made ? L('+' + sh.score + '点' + (sh.three ? '（3ポイント）' : ''), '+' + sh.score + (sh.three ? ' (three!)' : '')) : L('もういっかい ねらおう', 'Try the next one'));
    }
    return {
      start, resize(a, b) { w = a; h = b; },
      down(x, y, id) { if (st !== 'ready') return; ptr = id; start0 = { x, y }; cur = { x, y }; },
      move(x, y, id) { if (ptr === id) cur = { x, y }; },
      up(x, y, id) { if (ptr !== id) return; ptr = null; const ex = x, ey = y; if (Math.hypot(ex - start0.x, ey - start0.y) < 30) { start0 = null; env.status(L('ボールからななめ上へスワイプ！', 'Swipe up and toward the hoop')); return; } const p = paramsFrom(start0.x, start0.y, ex, ey); start0 = null; shoot(p); },
      key(code, down) { keys[code] = down; if (down && st === 'ready') { if (code === 'ArrowUp') kp.v = clamp(kp.v + 0.25, 4, 13); if (code === 'ArrowDown') kp.v = clamp(kp.v - 0.25, 4, 13); if (code === 'ArrowRight') kp.ang = clamp(kp.ang + 0.02, 0.4, 1.35); if (code === 'ArrowLeft') kp.ang = clamp(kp.ang - 0.02, 0.4, 1.35); if (code === 'Space') shoot({ v: kp.v, ang: kp.ang }); } },
      update(dt) {
        if (!run) return; kt += dt; for (const p of pops) p.t += dt; pops = pops.filter(p => p.t < 1.2);
        if (st === 'fly') { ft += dt; if (ft >= sh.pts.length / 60) after(); } else if (st === 'result') { rest -= dt; if (rest <= 0) { if (run.done) { st = 'over'; env.done({ score: run.total, detail: { made: run.shots.filter(s => s.made).length } }); } else { st = 'ready'; hud(); } } }
      },
      draw(g) {
        if (!run) return; const q = geo(), i = Math.min(run.i, Sim.N - 1), D = run.ds[i], rim = run.cfg.rim;
        g.fillStyle = lin(g, 0, 0, 0, h, '#ffd9a8', '#ffb98a'); g.fillRect(0, 0, w, h); circ(g, w * 0.82, h * 0.2, Math.min(w, h) * 0.08, '#fff2b0'); A.cloud(g, w * 0.3, h * 0.18, Math.min(w, h) * 0.06);
        g.fillStyle = PAL.sea1; g.fillRect(0, h * 0.58, w, h * 0.06); g.fillStyle = PAL.sand; g.fillRect(0, q.fy, w, h - q.fy); g.fillStyle = '#e8b86a'; g.fillRect(0, q.fy, w, 6);
        for (let m = 1; m <= 9; m++) { g.fillStyle = 'rgba(255,255,255,.55)'; g.fillRect(q.X(m) - 1, q.fy + 6, 2, 8); if (m % 2) text(g, m + 'm', q.X(m), q.fy + 24, fontPx(w, h) - 3, { color: 'rgba(18,59,87,.8)', stroke: false }); }
        // ゴール（支柱・バックボード・リング・ネット）
        const hx = q.X(D), hy = q.Y(Sim.HOOP_Y), bx = q.X(D + rim + 0.18);
        g.strokeStyle = '#6b7b86'; g.lineWidth = Math.max(4, q.sc * 0.12); g.beginPath(); g.moveTo(q.X(D + rim + 0.5), q.fy); g.lineTo(q.X(D + rim + 0.5), q.Y(3.6)); g.lineTo(bx + 2, q.Y(3.6)); g.stroke();
        rr(g, bx, q.Y(3.95), q.sc * 0.1, q.sc * 1.05, 2); g.fillStyle = '#fff'; g.fill(); g.strokeStyle = PAL.ink; g.lineWidth = 2; g.stroke();
        g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 1.5; for (let k = -2; k <= 2; k++) { g.beginPath(); g.moveTo(hx + k * rim * q.sc / 2.4, hy); g.lineTo(hx + k * rim * q.sc / 3.6, hy + q.sc * 0.65); g.stroke(); }
        g.strokeStyle = PAL.orange; g.lineWidth = Math.max(3, q.sc * 0.06); g.lineCap = 'round'; g.beginPath(); g.moveTo(q.X(D - rim), hy); g.lineTo(q.X(D + rim), hy); g.stroke();
        // 人
        A.mascot(g, q.X(0) - 4, q.fy + 6, q.sc * 2.3, { kind: env.kind, pose: st === 'fly' && ft < 0.4 ? 'swing' : st === 'result' && sh && sh.made ? 'cheer' : 'idle', t: kt, dir: 1 });
        // ボール
        const ball = (x, y, rot) => { const r = Sim.BALL_R * q.sc * 1.5; g.save(); g.translate(x, y); g.rotate(rot); circ(g, 0, 0, r, PAL.orange, PAL.ink, 1.8); g.strokeStyle = PAL.ink; g.lineWidth = 1.2; g.beginPath(); g.moveTo(-r, 0); g.lineTo(r, 0); g.moveTo(0, -r); g.lineTo(0, r); g.arc(0, 0, r * 0.7, 0.8, 2.4); g.stroke(); g.restore(); };
        if (st === 'fly') { const k = Math.min(sh.pts.length - 1, Math.floor(ft * 60)), p = sh.pts[k]; if (p) ball(q.X(p.x), q.Y(p.y), ft * 9); }
        else if (st !== 'over') ball(q.X(0.4), q.Y(Sim.REL_Y), 0);
        // ガイド
        if (ptr != null && start0 && cur) {
          const p = paramsFrom(start0.x, start0.y, cur.x, cur.y); g.strokeStyle = 'rgba(255,255,255,.85)'; g.lineWidth = 3; g.setLineDash([2, 6]); g.beginPath(); g.moveTo(start0.x, start0.y); g.lineTo(cur.x, cur.y); g.stroke(); g.setLineDash([]);
          if (env.diff < 2) { const f = Sim.fly(D, rim, p).pts, nmax = env.diff === 0 ? f.length : Math.floor(f.length * 0.4); g.fillStyle = '#fff'; for (let k = 0; k < nmax; k += 3) { const pt = f[k]; circ(g, q.X(pt.x), q.Y(pt.y), 2.4, 'rgba(255,255,255,.9)'); } }
          text(g, L('つよさ ', 'Power ') + p.v.toFixed(1) + '  ' + L('かくど ', 'Angle ') + Math.round(p.ang * 57.3) + '°', w / 2, h * 0.08, fontPx(w, h));
        }
        for (const p of pops) text(g, p.txt, w / 2, h * 0.3 - p.t * 24, fontPx(w, h) * 1.7, { color: p.col });
      },
    };
  };

  // =====================================================================================
  // ボウリング
  // =====================================================================================
  V.bowling = function (env) {
    const L = env.L; let w = 300, h = 400, run = null, st = 'ready', bx = 0, tx = 0, ptr = null, zone = '', gest = null, last = null, anim = null, ft = 0, rest = 0, pops = [], kt = 0, keys = {}, fell = {}, spinK = 0, hold = {};
    const Sim = S1.Bowling;
    // レーンの遠近：y = 0（手前）〜 19.5（ピンのむこう）
    function lane() { const yb = h * 0.80, yt = h * 0.2, wb = Math.min(w * 0.7, h * 0.44), wt = wb * 0.5; return { yb, yt, wb, wt, X: (x, y) => { const f = clamp(y / 19.6, 0, 1.05); return w / 2 + x / 1.05 * (wb + (wt - wb) * f); }, Y: y => { const f = clamp(y / 19.6, 0, 1.1); return h * 0.8 - (h * 0.8 - h * 0.2) * Math.pow(f, 0.78); }, S: y => { const f = clamp(y / 19.6, 0, 1.1); return (wb + (wt - wb) * f) / 1.05; } }; }
    function start() { run = Sim.newRun(env.diff, env.seed); st = 'ready'; bx = 0; tx = 0; pops = []; anim = null; fell = {}; hud(); env.setButtons([{ id: 'posL', label: '◁ ' + L('いち', 'Move'), hold: true }, { id: 'aimL', label: '◀ ' + L('ねらい', 'Aim'), hold: true }, { id: 'aimR', label: L('ねらい', 'Aim') + ' ▶', hold: true }, { id: 'posR', label: L('いち', 'Move') + ' ▷', hold: true }, { id: 'go', label: L('なげる', 'Roll') }]); env.status(L('ボールを よこにずらして、上のほうで ねらいを決め、すばやく上へフリック！', 'Slide the ball, set the aim up the lane, then flick upward.')); }
    function nb() { return C.bowlingScore(run.rolls).next; }
    function hud() { const n = nb(); env.hud(L('フレーム ', 'Frame ') + Math.min(10, n.frame + 1) + '/10  ' + L('てん ', 'Score ') + run.total); }
    function aimAng() { return (tx - bx) / Sim.PIN_Y; }
    function throwBall(v, spin) {
      const a = aimAng(); anim = Sim.roll(run, { x: bx, ang: a, v, spin }, env.diff === 0); if (!anim) return; st = 'roll'; ft = 0; fell = {}; env.sfx('drop'); env.noise(0.25, { vol: 0.05, freq: 500 }); env.buzz(10);
    }
    function after() {
      const r = run.last; let msg = '';
      if (r.strike) { msg = L('ストライク！', 'STRIKE!'); env.sfx('win'); env.stat('strikes'); } else if (r.spare) { msg = L('スペア！', 'SPARE!'); env.sfx('clear'); env.stat('spares'); } else if (r.gutter) { msg = L('ガター…', 'Gutter…'); env.sfx('fail'); } else { msg = r.down + L('本', ' pins'); env.sfx(r.down ? 'ok' : 'fail'); }
      const f = r.score.frames; let tk = 0, c = 0; for (let i = 0; i < 10; i++) { if (f[i].strike) c++; else c = 0; tk = Math.max(tk, c); } if (tk >= 3) env.stat('turkey');
      pops.push({ txt: msg, t: 0, col: r.strike || r.spare ? PAL.sun : '#fff' }); st = 'result'; rest = 1.5; hud(); env.status(msg);
    }
    function vpFrom(gv) { return { v: clamp(5 + 5.5 * clamp((gv.speed - 0.45) / 1.8, 0, 1), 5, 10.5), spin: gest ? gest.curve(260) : 0 }; }
    return {
      start, resize(a, b) { w = a; h = b; },
      down(x, y, id, e) { if (st !== 'ready') return; const l = lane(); ptr = id; zone = y < h * 0.52 ? 'aim' : 'ball'; gest = new Gesture(); gest.add(x, y, nowMs(e)); last = { x, y }; if (zone === 'aim') tx = clamp((x - w / 2) / l.S(Sim.PIN_Y), -0.52, 0.52); },
      move(x, y, id, e) {
        if (ptr !== id) return; gest.add(x, y, nowMs(e)); const l = lane();
        if (zone === 'aim') tx = clamp((x - w / 2) / l.S(Sim.PIN_Y), -0.52, 0.52); else { bx = clamp(bx + (x - last.x) / l.S(0), -0.46, 0.46); }
        last = { x, y };
      },
      up(x, y, id, e) {
        if (ptr !== id) return; ptr = null; gest.add(x, y, nowMs(e)); const v = gest.vec(150); if (zone === 'ball' && v.dy < -70 && v.speed > 0.55 && Math.abs(v.dy) > Math.abs(v.dx) * 0.7) throwBall(vpFrom(v).v, vpFrom(v).spin); gest = null;
      },
      key(code, down) {
        keys[code] = down; if (!down || st !== 'ready') return; if (code === 'KeyA') bx = clamp(bx - 0.03, -0.46, 0.46); if (code === 'KeyD') bx = clamp(bx + 0.03, -0.46, 0.46); if (code === 'ArrowLeft') tx = clamp(tx - 0.012, -0.52, 0.52); if (code === 'ArrowRight') tx = clamp(tx + 0.012, -0.52, 0.52);
        if (code === 'KeyZ') spinK = clamp(spinK - 0.25, -1, 1); if (code === 'KeyX') spinK = clamp(spinK + 0.25, -1, 1); if (code === 'Space' || code === 'ArrowUp') throwBall(7.8, spinK);
      },
      button(id, down) { if (id === 'go') { if (down && st === 'ready') throwBall(7.8, spinK); return; } hold[id] = down; },
      update(dt) {
        if (!run) return; kt += dt; for (const p of pops) p.t += dt; pops = pops.filter(p => p.t < 1.5);
        if (st === 'ready') { if (hold.aimL) tx = clamp(tx - dt * 0.16, -0.52, 0.52); if (hold.aimR) tx = clamp(tx + dt * 0.16, -0.52, 0.52); if (hold.posL) bx = clamp(bx - dt * 0.3, -0.46, 0.46); if (hold.posR) bx = clamp(bx + dt * 0.3, -0.46, 0.46); }
        if (st === 'roll') { ft += dt; if (ft >= anim.frames.length / 60 + 0.2) after(); }
        else if (st === 'result') { rest -= dt; if (rest <= 0) { if (run.done) { st = 'over'; const s = run.last.score; env.done({ score: run.total, detail: { strikes: s.frames.filter(f => f.strike).length, perfect: run.total === 300 } }); } else { st = 'ready'; Sim.prep(run); anim = null; hud(); env.status(L('つぎの1投。よこにずらして ねらおう', 'Next ball. Slide and aim.')); } } }
      },
      draw(g) {
        if (!run) return; const l = lane(); g.fillStyle = lin(g, 0, 0, 0, h, '#5fb4e8', '#b7e4f8'); g.fillRect(0, 0, w, h);
        // 壁と床
        g.fillStyle = '#2c3e66'; g.fillRect(0, 0, w, l.yt - 6); g.fillStyle = '#3a4f82'; for (let i = 0; i < 8; i++) g.fillRect(i * w / 8 + 4, 6, w / 8 - 8, l.yt - 22);
        g.fillStyle = '#7a5a3a'; g.fillRect(0, l.yt - 6, w, h);
        // レーン
        const lx0 = l.X(-0.525, 0), lx1 = l.X(0.525, 0), tx0 = l.X(-0.525, 19.6), tx1 = l.X(0.525, 19.6), ty = l.Y(19.6);
        g.fillStyle = '#222a3a'; g.beginPath(); g.moveTo(lx0 - l.wb * 0.07, l.yb); g.lineTo(tx0 - l.wt * 0.1, ty); g.lineTo(tx1 + l.wt * 0.1, ty); g.lineTo(lx1 + l.wb * 0.07, l.yb); g.fill();
        g.fillStyle = lin(g, 0, ty, 0, l.yb, '#f1cf93', '#e0b46c'); g.beginPath(); g.moveTo(lx0, l.yb); g.lineTo(tx0, ty); g.lineTo(tx1, ty); g.lineTo(lx1, l.yb); g.fill();
        g.strokeStyle = 'rgba(120,80,30,.25)'; g.lineWidth = 1; for (let k = -3; k <= 3; k++) { g.beginPath(); g.moveTo(l.X(k * 0.14, 0), l.Y(0)); g.lineTo(l.X(k * 0.14, 19.6), l.Y(19.6)); g.stroke(); }
        g.fillStyle = '#c24c4c'; for (const sx of [-1, 1]) { g.beginPath(); g.moveTo(l.X(sx * 0.525, 0), l.Y(0)); g.lineTo(l.X(sx * 0.525, 19.6), l.Y(19.6)); g.lineWidth = env.diff === 0 ? 7 : 2; g.strokeStyle = env.diff === 0 ? '#ff9a6a' : '#8a6a3a'; g.stroke(); }
        // 矢印の目印
        for (let k = -2; k <= 2; k++) { const y = 4.5 + Math.abs(k) * 0.4; g.fillStyle = 'rgba(120,70,20,.5)'; g.beginPath(); g.moveTo(l.X(k * 0.2, y), l.Y(y) - 5); g.lineTo(l.X(k * 0.2 - 0.03, y - 0.4), l.Y(y - 0.4) + 3); g.lineTo(l.X(k * 0.2 + 0.03, y - 0.4), l.Y(y - 0.4) + 3); g.fill(); }
        // ピン
        const standing = st === 'roll' ? null : run.standing, frame = st === 'roll' ? anim.frames[Math.min(anim.frames.length - 1, Math.floor(ft * 60))] : null;
        const pinsDraw = []; Sim.PIN_SPOTS.forEach((sp, i) => { let x = sp.x, y = sp.y, up = true, gone = false;
          if (st === 'roll') { const base = run.standing; const prev = st === 'roll' ? (anim.fell[i] ? true : false) : false; if (frame) { x = frame.p[i][0]; y = frame.p[i][1]; up = !!frame.p[i][2]; gone = !!frame.p[i][3]; } if (!(run.standing[i] || anim.fell[i])) gone = true; } else { up = !!standing[i]; gone = !up; }
          if (!gone) pinsDraw.push({ x, y, up, i }); });
        pinsDraw.sort((a, b) => b.y - a.y).forEach(p => { const X = l.X(p.x, p.y), Y = l.Y(p.y), s = l.S(p.y) * 0.9; g.save(); g.translate(X, Y); if (p.up) { ell(g, 0, 0, s * 0.07, s * 0.02, 'rgba(0,0,0,.25)'); ell(g, 0, -s * 0.14, s * 0.052, s * 0.12, '#fff', PAL.ink, 1.2); g.fillStyle = PAL.red; g.fillRect(-s * 0.05, -s * 0.2, s * 0.1, s * 0.03); circ(g, 0, -s * 0.28, s * 0.036, '#fff', PAL.ink, 1.2); } else { g.rotate(1.2 + (p.i % 3) * 0.3); ell(g, 0, -s * 0.12, s * 0.05, s * 0.12, '#f3f3f3', PAL.ink, 1); } g.restore(); });
        // ボール・矢印
        if (st === 'ready' || st === 'over') {
          const a = aimAng(); g.setLineDash([3, 6]); g.strokeStyle = 'rgba(255,255,255,.95)'; g.lineWidth = 3; g.beginPath(); g.moveTo(l.X(bx, 0), l.Y(0)); g.lineTo(l.X(bx + a * 19, 19), l.Y(19)); g.stroke(); g.setLineDash([]); circ(g, l.X(tx, Sim.PIN_Y), l.Y(Sim.PIN_Y), 5, PAL.sun, PAL.ink, 1.5);
          A.mascot(g, l.X(bx - 0.32, 0), l.Y(0) + h * 0.07, h * 0.15, { kind: env.kind, pose: 'idle', t: kt }); circ(g, l.X(bx, 0.3), l.Y(0.3) - 4, l.S(0.3) * 0.11 + 4, '#3a4a9a', PAL.ink, 2); circ(g, l.X(bx, 0.3) - 2, l.Y(0.3) - 8, 1.5, '#fff');
        } else if (frame) { const bx2 = frame.bx, by2 = frame.by; ell(g, l.X(bx2, by2), l.Y(by2) + 2, l.S(by2) * 0.1, l.S(by2) * 0.03, 'rgba(0,0,0,.3)'); circ(g, l.X(bx2, by2), l.Y(by2) - l.S(by2) * 0.06, Math.max(3, l.S(by2) * 0.11), '#3a4a9a', PAL.ink, 1.6); circ(g, l.X(bx2, by2) - 1, l.Y(by2) - l.S(by2) * 0.09, Math.max(1, l.S(by2) * 0.02), '#fff'); }
        // スコアの帯
        const sc = C.bowlingScore(run.rolls), cw = Math.min(46, (w - 8) / 10), x0 = (w - cw * 10) / 2, fs = Math.max(9, cw * 0.28);
        sc.frames.forEach((f, i) => { const x = x0 + i * cw; rr(g, x + 1, 4, cw - 2, 40, 5); g.fillStyle = i === sc.next.frame && st !== 'over' ? 'rgba(255,255,255,.95)' : 'rgba(255,255,255,.8)'; g.fill(); g.strokeStyle = i === sc.next.frame ? PAL.sun : PAL.ink; g.lineWidth = i === sc.next.frame ? 2.5 : 1; g.stroke();
          const r = f.r; let s1 = '', s2 = '', s3 = ''; if (i < 9) { if (f.strike) { s2 = 'X'; } else { if (r[0] != null) s1 = r[0] === 0 ? '-' : String(r[0]); if (r[1] != null) s2 = f.spare ? '/' : r[1] === 0 ? '-' : String(r[1]); } } else { const m = rr2(r); s1 = m[0]; s2 = m[1]; s3 = m[2]; }
          const xs = i < 9 ? [x + cw * 0.62, x + cw * 0.86] : [x + cw * 0.4, x + cw * 0.62, x + cw * 0.86]; const ss = i < 9 ? [s1, s2] : [s1, s2, s3]; ss.forEach((s, k) => { if (s) text(g, s, xs[k], 13, fs, { color: PAL.ink, stroke: false }); }); if (f.cum != null) text(g, String(f.cum), x + cw / 2, 32, fs + 1, { color: PAL.ink, stroke: false }); });
        for (const p of pops) text(g, p.txt, w / 2, h * 0.42 - p.t * 26, fontPx(w, h) * 1.9, { color: p.col });
      },
    };
    function rr2(r) { const o = ['', '', '']; r.forEach((v, k) => { const prev = r[k - 1]; o[k] = v === 10 ? 'X' : (k > 0 && prev !== 10 && prev + v === 10) ? '/' : v === 0 ? '-' : String(v); }); return o; }
  };
})(typeof window !== 'undefined' ? window : globalThis);
