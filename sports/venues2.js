// ぽかぽか島スポーツ：種目の「会場」その2。水上ジャンプ・チャンバラ（ゴルフは venue-golf.js）。
(function (root) {
  'use strict';
  const A = root.SportsArt, S1 = root.SportsSim1, S2 = root.SportsSim2, C = root.SportsCore;
  const V = root.SportsVenues = root.SportsVenues || {};
  const { PAL, ell, circ, rr, text, lin } = A;
  const { Gesture } = V.util;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), TAU = Math.PI * 2, lerp = (a, b, t) => a + (b - a) * t;
  const fontPx = (w, h) => Math.round(clamp(Math.min(w, h) * 0.04, 12, 22));
  const nowMs = e => (e && e.t != null ? e.t : Date.now());
  const angWrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };

  // =====================================================================================
  // 水上ジャンプ
  // =====================================================================================
  V.jump = function (env) {
    const L = env.L; let w = 300, h = 400, run = null, st = 'ready', t = 0, ptr = null, y0 = 0, du = 0, kt = 0, keyU = 0, btnU = 0, tapT = -1, tapAt = 0, landReq = false, launchT = 0, takeoffQ = null, rest = 0, pops = [], tl = 0, splash = 0;
    const Sim = S1.Jump, RAMP = 14;
    const sc = () => Math.min(h / 12.5, w / 17);
    function start() { run = Sim.newRun(env.diff, env.seed); st = 'ready'; t = -0.9; takeoffQ = null; landReq = false; pops = []; splash = 0; setBtns(); hud(); env.status(L('旗にきたら タップ！ とびこめ', 'Tap when you reach the flag to take off!')); }
    function setBtns() { env.setButtons(st === 'air' ? [{ id: 'up', label: '▲', hold: true }, { id: 'down', label: '▼', hold: true }, { id: 'land', label: L('ちゃくち', 'Land') }] : [{ id: 'go', label: L('とびこむ！', 'Jump!') }]); }
    function hud() { env.hud(st === 'done' || st === 'over' ? L('きょり ', 'Dist ') + run.dist + 'm' : L('ジャンプ', 'Jump')); }
    function takeoff() { if (st !== 'gauge') return; const r = Sim.takeoff(run, t); if (!r) return; takeoffQ = r; st = 'launch'; launchT = 0; env.sfx('pop'); env.noise(0.18, { vol: 0.06, freq: 3000 }); env.buzz(15); setBtns(); env.status(r.q > 0.85 ? L('ナイスタイミング！', 'Great timing!') : r.q > 0.5 ? L('まずまず', 'Not bad') : L('タイミングが…', 'Off timing…')); }
    function finish() {
      st = 'done'; hud(); const lt = run.land; env.sfx(lt === 'clean' ? 'win' : lt === 'wobble' ? 'ok' : 'fail'); splash = 1; env.noise(0.3, { vol: 0.12, freq: 1500 }); env.buzz(25);
      pops.push({ txt: run.dist + 'm', t: 0, col: PAL.sun }); pops.push({ txt: lt === 'clean' ? L('ピタッと着水！', 'Clean landing!') : lt === 'wobble' ? L('ぐらついた', 'Wobbly landing') : L('ドボン！', 'Wipeout!'), t: -0.5, col: '#fff' });
      env.status(L('ジャンプ ', 'Jump ') + run.dist + 'm  ' + L('スタイル +', 'Style +') + run.style); rest = 2.4; env.stat('jumpM', Math.round(run.dist));
    }
    function curU() { const tl = env.tilt(); return clamp(du + keyU + btnU + (tl.on ? -tl.y * 1.6 : 0), -1, 1); }
    return {
      start, resize(a, b) { w = a; h = b; },
      button(id, down) { if (id === 'go') { if (down && st === 'ready') { st = 'gauge'; t = 0; } else if (down && st === 'gauge') takeoff(); } else if (id === 'up') btnU = down ? 1 : (btnU === 1 ? 0 : btnU); else if (id === 'down') btnU = down ? -1 : (btnU === -1 ? 0 : btnU); else if (id === 'land' && down) { if (st === 'air') landReq = true; } },
      down(x, y, id, e) { if (st === 'ready') { st = 'gauge'; t = 0; return; } if (st === 'gauge') { takeoff(); return; } if (st === 'done') { rest = Math.min(rest, 0.2); return; } if (st === 'air') { ptr = id; y0 = y; tapAt = nowMs(e); du = 0; } },
      move(x, y, id) { if (st === 'air' && ptr === id) du = clamp(-(y - y0) / (h * 0.1), -1, 1); },
      up(x, y, id, e) { if (st === 'air' && ptr === id) { ptr = null; du = 0; if (nowMs(e) - tapAt < 260 && Math.abs(y - y0) < 14) landReq = true; } },
      key(code, down) {
        if (code === 'Space' || code === 'Enter') { if (down) { if (st === 'ready') { st = 'gauge'; t = 0; } else if (st === 'gauge') takeoff(); else if (st === 'air') landReq = true; else if (st === 'done') rest = Math.min(rest, 0.2); } }
        if (code === 'ArrowUp') keyU = down ? 1 : (keyU === 1 ? 0 : keyU); if (code === 'ArrowDown') keyU = down ? -1 : (keyU === -1 ? 0 : keyU);
      },
      update(dt) {
        if (!run) return; kt += dt; dt = Math.min(dt, 0.05); for (const p of pops) p.t += dt; pops = pops.filter(p => p.t < 2.4); splash = Math.max(0, splash - dt * 0.7);
        if (st === 'ready') { t += dt; if (t > 0) t = 0; }
        else if (st === 'gauge') { t += dt; if (t >= run.cfg.gauge) takeoff(); }
        else if (st === 'launch') { launchT += dt; if (launchT >= 0.18) { st = 'air'; tl = 0; setBtns(); } }
        else if (st === 'air') {
          const n = Math.ceil(dt / (1 / 60)), sdt = dt / n; for (let i = 0; i < n && run.phase === 'air'; i++) { const lr = landReq && run.y < 4.6 && run.vy < 0 && run.y > 0.2; Sim.step(run, sdt, curU(), lr); if (lr) landReq = false; }
          if (landReq && run.y >= 4.6) landReq = false; if (run.phase === 'done') { finish(); }
        } else if (st === 'done') { rest -= dt; if (rest <= 0) { st = 'over'; env.done({ score: run.score, extra: run.dist, detail: { dist: run.dist, style: run.style, land: run.land } }); } }
      },
      draw(g) {
        if (!run) return; const S = sc(), wy = h * 0.8; const camX = (st === 'air' || st === 'done' || st === 'over') ? Math.max(-RAMP - 3, run.x - w * 0.3 / S) : -RAMP - 3; const X = x => (x - camX) * S + w * 0.3 - (-9 - camX) * 0 , Y = y => wy - y * S;
        const X2 = x => (x - camX) * S;
        A.sky(g, w, h, wy, kt); g.fillStyle = lin(g, 0, wy - h * 0.12, 0, h, PAL.sea0, PAL.sea2); g.fillRect(0, wy - 2, w, h - wy + 2); A.sea(g, 0, wy, w, h - wy, kt);
        // 遠くの島
        g.fillStyle = PAL.grass2; g.beginPath(); g.ellipse(w * 0.75 - (camX * S * 0.05) % w, wy - 2, w * 0.28, h * 0.06, 0, Math.PI, TAU); g.fill(); A.palm(g, w * 0.7 - (camX * S * 0.05) % w, wy - h * 0.03, h * 0.09, kt, 0.3);
        // 距離の目印
        for (let m = 10; m <= 120; m += 10) { const x = X2(m); if (x < -20 || x > w + 20) continue; g.fillStyle = 'rgba(255,255,255,.6)'; g.fillRect(x - 1, wy, 2, 10); text(g, m + 'm', x, wy + 24, fontPx(w, h) - 3, { stroke: false, color: 'rgba(255,255,255,.95)' }); }
        // ジャンプ台
        const lipH = run.cfg.lipH; g.fillStyle = PAL.wood; g.strokeStyle = PAL.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(X2(-RAMP), Y(0.05)); g.lineTo(X2(0), Y(lipH)); g.lineTo(X2(0.6), Y(lipH - 0.3)); g.lineTo(X2(0.6), Y(0)); g.lineTo(X2(-RAMP), Y(0)); g.closePath(); g.fill(); g.stroke();
        g.strokeStyle = PAL.wood2; g.lineWidth = 2; for (let k = 1; k < 7; k++) { g.beginPath(); g.moveTo(X2(-RAMP + k * 2), Y(0)); g.lineTo(X2(-RAMP + k * 2), Y(lipH * (1 - (RAMP - k * 2) / RAMP) * 0.98)); g.stroke(); }
        // 目印の旗
        const fx = -RAMP * (1 - Sim.SWEET), fy = lipH * (1 - (RAMP + fx) * 0 - (-fx) / RAMP) ; const fyy = lipH * (1 + fx / RAMP); g.strokeStyle = '#fff'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(X2(fx), Y(fyy)); g.lineTo(X2(fx), Y(fyy + 1.6)); g.stroke(); g.fillStyle = PAL.coral; g.beginPath(); g.moveTo(X2(fx), Y(fyy + 1.6)); g.lineTo(X2(fx) + 18, Y(fyy + 1.3)); g.lineTo(X2(fx), Y(fyy + 1.0)); g.fill();
        // 選手
        let px, py, pitch = 0.1, pose = 'idle';
        if (st === 'ready' || st === 'gauge') { const nd = st === 'ready' ? 0 : Sim.needle(run, Math.max(0, t)); const x = -RAMP * (1 - nd); px = x; py = lipH * (1 + x / RAMP); pitch = 0.4 * nd; pose = 'run'; }
        else if (st === 'launch') { const nd = takeoffQ.needle, x = -RAMP * (1 - nd), f = launchT / 0.18; px = lerp(x, 0, f); py = lipH * (1 + px / RAMP); pitch = 0.4; pose = 'run'; }
        else { px = run.x; py = run.y; pitch = run.pitch * 0.6; pose = st === 'air' ? 'swing' : run.land === 'crash' ? 'sad' : 'cheer'; }
        if (st === 'ready' || st === 'gauge') { g.strokeStyle = '#fff'; g.lineWidth = 1.5; g.beginPath(); g.moveTo(X2(px), Y(py) - 10); g.lineTo(X2(-RAMP - 3), Y(2.2)); g.stroke(); // ロープとボート
          A.ell(g, X2(-RAMP - 3.5), Y(0.4), 28, 10, '#fff', PAL.ink, 2); A.ell(g, X2(-RAMP - 3.5), Y(0.9), 14, 8, PAL.coral, PAL.ink, 2); }
        g.save(); g.translate(X2(px), Y(py)); g.rotate(-pitch * 0.9); A.mascot(g, 0, 8, S * 2.1, { kind: env.kind, pose, t: kt }); g.fillStyle = PAL.sun; g.strokeStyle = PAL.ink; g.lineWidth = 1.5; rr(g, -S * 0.7, 0, S * 1.4, 7, 3); g.fill(); g.stroke(); g.restore();
        // 空中の表示
        if (st === 'air') {
          const ideal = Sim.idealNow(run), bx = w - 34, by0 = h * 0.18, bh = h * 0.4, vy = v => by0 + bh * (1 - (v + 0.4) / 1.8); rr(g, bx - 8, by0 - 6, 16, bh + 12, 8); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill();
          g.fillStyle = 'rgba(120,255,160,.55)'; g.fillRect(bx - 8, vy(ideal + 0.2), 16, vy(ideal - 0.2) - vy(ideal + 0.2)); circ(g, bx, vy(run.pitch), 7, Math.abs(run.pitch - ideal) < 0.2 ? '#7be0a0' : PAL.coral, '#fff', 2); text(g, L('バランス', 'Balance'), bx - 6, by0 - 18, fontPx(w, h) - 3);
          const hh = run.y; if (hh < 4.6 && run.vy < 0) text(g, L('いまタップで ちゃくち！', 'Tap to prepare landing!'), w / 2, h * 0.2, fontPx(w, h) * 1.2, { color: PAL.sun });
          text(g, Math.round(run.x) + 'm', w * 0.3, h * 0.1, fontPx(w, h) * 1.4);
        } else if (st === 'gauge') {
          const nd = Sim.needle(run, t), gw = w * 0.7, gx = (w - gw) / 2, gy = h * 0.9, z = run.cfg.zone; rr(g, gx, gy, gw, 14, 7); g.fillStyle = 'rgba(0,0,0,.4)'; g.fill(); g.fillStyle = 'rgba(120,255,160,.8)'; g.fillRect(gx + gw * (Sim.SWEET - z / 2), gy, gw * z, 14); circ(g, gx + gw * nd, gy + 7, 9, '#fff', PAL.ink, 2); text(g, L('旗のところで タップ！', 'Tap at the flag!'), w / 2, gy - 16, fontPx(w, h) * 1.1);
        }
        if (splash > 0 && (st === 'done' || st === 'over')) { for (let i = 0; i < 9; i++) { const a = -Math.PI / 2 + (i - 4) * 0.28, r = (1 - splash) * 70; g.fillStyle = 'rgba(255,255,255,' + splash + ')'; g.beginPath(); g.arc(X2(run.x) + Math.cos(a) * r * 0.6, wy + Math.sin(a) * r, 5 * splash + 1, 0, TAU); g.fill(); } }
        for (const p of pops) if (p.t >= 0) text(g, p.txt, w / 2, h * 0.34 - p.t * 14 + (p.col === '#fff' ? 36 : 0), fontPx(w, h) * (p.col === '#fff' ? 1.2 : 2), { color: p.col });
      },
    };
  };

  // =====================================================================================
  // チャンバラ
  // =====================================================================================
  V.kendo = function (env) {
    const L = env.L; let w = 300, h = 400, run = null, kt = 0, ptr = null, p0 = null, used = false, slashes = [], pops = [], flash = 0, shake = 0, over = false, rest = 0, st = 'play', evSeen = 0, keysDown = {}, sparks = [];
    const Sim = S2.Kendo, ARW = ['←', '→', '↑', '↓'], VEC = [[-1, 0], [1, 0], [0, -1], [0, 1]];
    const FOES = [{ kind: 2, band: PAL.red }, { kind: 3, band: '#3a4a9a' }, { kind: 1, band: '#222' }];
    function start() { run = Sim.newRun(env.diff, env.seed); st = 'play'; kt = 0; slashes = []; pops = []; sparks = []; over = false; hud(); env.status(L('敵の矢印と同じ向きにスワイプで受け流し！ すきをスワイプで切る', 'Swipe the same way as the arrow to parry, then swipe to strike when it staggers!')); }
    function hud() { env.hud(L('ひとりめ…', 'Bout ') + Math.min(3, run.bout + 1) + '/3  ' + L('てん ', 'Pts ') + run.score); }
    function dirOf(dx, dy) { return Math.abs(dx) > Math.abs(dy) ? (dx < 0 ? 0 : 1) : (dy < 0 ? 2 : 3); }
    function act(dir) {
      if (st !== 'play') return; const r = Sim.input(run, dir); if (r === 'hit' || r === 'parry' || r === 'perfect') slashes.push({ dir, t: 0, kind: r }); drain();
    }
    function drain() {
      for (const e of run.ev) {
        if (e.type === 'windup') { env.sfx('move'); env.tone(300, 0.1, { type: 'sawtooth', vol: 0.03, slide: 520 }); }
        else if (e.type === 'parry') { env.sfx('hit'); pops.push({ txt: L('うけた！', 'Parry!'), t: 0, col: '#fff' }); sparks.push({ t: 0 }); env.buzz(12); }
        else if (e.type === 'perfect') { env.sfx('win'); env.stat('parry'); pops.push({ txt: L('ぴたり！！', 'PERFECT!'), t: 0, col: PAL.sun }); sparks.push({ t: 0, big: 1 }); env.buzz([10, 20, 10]); }
        else if (e.type === 'hit') { env.sfx('hit'); pops.push({ txt: e.dmg > 1 ? L('大ダメージ！', 'Big hit!') : L('ヒット', 'Hit'), t: 0, col: PAL.sun }); shake = 0.25; }
        else if (e.type === 'clank') { env.sfx('error'); pops.push({ txt: L('カキーン！ はじかれた', 'Blocked!'), t: 0, col: '#aaf' }); }
        else if (e.type === 'hurt') { env.sfx('fail'); flash = 0.4; env.buzz(40); pops.push({ txt: L('やられた！', 'Ouch!'), t: 0, col: PAL.coral }); }
        else if (e.type === 'ko') { env.sfx('clear'); pops.push({ txt: L('いっぽん！', 'Down!'), t: 0, col: PAL.sun }); }
        else if (e.type === 'early' || e.type === 'wrong') { env.sfx('error'); pops.push({ txt: e.type === 'wrong' ? L('ちがう向き', 'Wrong way') : L('はやい！', 'Too early'), t: 0, col: '#fff' }); }
      }
      run.ev.length = 0; hud();
    }
    return {
      start, resize(a, b) { w = a; h = b; },
      down(x, y, id) { if (st !== 'play') return; ptr = id; p0 = { x, y }; used = false; },
      move(x, y, id) { if (ptr !== id || used || !p0) return; const dx = x - p0.x, dy = y - p0.y; if (Math.hypot(dx, dy) >= 34) { used = true; act(dirOf(dx, dy)); } },
      up(x, y, id) { if (ptr === id) { ptr = null; used = false; } },
      key(code, down) { if (!down) return; const d = { ArrowLeft: 0, ArrowRight: 1, ArrowUp: 2, ArrowDown: 3, KeyA: 0, KeyD: 1, KeyW: 2, KeyS: 3 }[code]; if (d != null) act(d); },
      update(dt) {
        if (!run) return; kt += dt; dt = Math.min(dt, 0.05); flash = Math.max(0, flash - dt); shake = Math.max(0, shake - dt); for (const p of pops) p.t += dt; pops = pops.filter(p => p.t < 1.2); for (const s of slashes) s.t += dt; slashes = slashes.filter(s => s.t < 0.3); for (const s of sparks) s.t += dt; sparks = sparks.filter(s => s.t < 0.5);
        if (st === 'play') { Sim.step(run, dt); drain(); if (run.done) { st = 'end'; rest = 1.6; env.sfx(run.won ? 'win' : 'over'); pops.push({ txt: run.won ? L('かち！', 'You win!') : L('まけ…', 'Defeated'), t: -0.1, col: run.won ? PAL.sun : '#fff' }); env.stat('clears', run.won ? 1 : 0); } }
        else if (st === 'end') { rest -= dt; if (rest <= 0) { st = 'over'; env.done({ score: run.score, detail: { won: run.won, parries: run.parries, perfects: run.perfects, hits: run.hits } }); } }
      },
      draw(g) {
        if (!run) return; const sx = shake > 0 ? (Math.random() - 0.5) * 6 : 0; g.save(); g.translate(sx, 0);
        // 道場の庭
        g.fillStyle = lin(g, 0, 0, 0, h, '#ffe9c7', '#ffd09a'); g.fillRect(0, 0, w, h); g.fillStyle = '#e9bd7a'; g.fillRect(0, h * 0.62, w, h * 0.38); g.strokeStyle = 'rgba(120,70,20,.25)'; g.lineWidth = 2; for (let i = 1; i < 6; i++) { g.beginPath(); g.moveTo(0, h * 0.62 + i * h * 0.07); g.lineTo(w, h * 0.62 + i * h * 0.07); g.stroke(); }
        g.fillStyle = '#c14b4b'; g.fillRect(0, 0, w, h * 0.06); for (let i = 0; i < 6; i++) { g.fillStyle = i % 2 ? '#fff' : '#c14b4b'; g.fillRect(i * w / 6, h * 0.06, w / 6, h * 0.025); }
        const foe = FOES[Math.min(2, run.bout)], cx = w / 2, fy = h * 0.6, fs = Math.min(h * 0.4, w * 0.9), K = A.KINDS[foe.kind];
        let pose = run.st === 'stagger' ? 'sad' : run.st === 'ko' ? 'sad' : run.st === 'windup' ? 'swing' : 'idle'; const wob = run.st === 'windup' ? Math.sin(kt * 40) * 2 * (run.tt / run.wnd) : run.st === 'stagger' ? Math.sin(kt * 9) * 7 : 0;
        g.save(); g.translate(cx + wob, fy); if (run.st === 'ko') { g.rotate(Math.min(1.2, run.tt * 1.2)); g.globalAlpha = Math.max(0.2, 1 - run.tt * 0.6); } A.mascot(g, 0, 0, fs, { kind: foe.kind, pose, t: kt, band: foe.band }); g.restore();
        // 守りの向き（青い盾）
        if (run.st === 'idle') { const v = VEC[run.guard]; const px = cx + v[0] * fs * 0.42, py = fy - fs * 0.35 + v[1] * fs * 0.3; g.save(); g.translate(px, py); g.rotate(Math.atan2(v[1], v[0])); g.fillStyle = 'rgba(80,140,255,.85)'; g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(0, -fs * 0.2); g.quadraticCurveTo(fs * 0.12, 0, 0, fs * 0.2); g.lineTo(-fs * 0.05, 0); g.closePath(); g.fill(); g.stroke(); g.restore(); text(g, L('ガード', 'Guard'), px, py + fs * 0.3 * (v[1] >= 0 ? 1 : -1) - (v[1] === 0 ? fs * 0.22 : 0), fontPx(w, h) - 3, { color: '#cfe0ff' }); }
        // ふりかぶり：大きな矢印とタイマーの輪
        if (run.st === 'windup') { const v = VEC[run.atk], f = clamp(run.tt / run.wnd, 0, 1), perfect = run.wnd - run.tt <= run.cfg.perfect, R = fs * 0.46; g.save(); g.translate(cx, fy - fs * 0.45); g.lineWidth = 9; g.strokeStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.arc(0, 0, R, 0, TAU); g.stroke(); g.strokeStyle = perfect ? PAL.sun : PAL.red; g.beginPath(); g.arc(0, 0, R, -Math.PI / 2, -Math.PI / 2 + TAU * (1 - f)); g.stroke();
          g.rotate(Math.atan2(v[1], v[0])); g.fillStyle = perfect ? PAL.sun : PAL.red; g.strokeStyle = '#fff'; g.lineWidth = 4; g.beginPath(); g.moveTo(R * 0.55, 0); g.lineTo(-R * 0.1, -R * 0.45); g.lineTo(-R * 0.1, -R * 0.18); g.lineTo(-R * 0.55, -R * 0.18); g.lineTo(-R * 0.55, R * 0.18); g.lineTo(-R * 0.1, R * 0.18); g.lineTo(-R * 0.1, R * 0.45); g.closePath(); g.fill(); g.stroke(); g.restore(); }
        if (run.st === 'stagger') text(g, L('チャンス！ スワイプで切れ！', 'Chance! Swipe to strike!'), cx, fy - fs * 1.15, fontPx(w, h) * 1.2, { color: PAL.sun });
        // 切りつけの線・火花
        for (const s of slashes) { const v = VEC[s.dir], f = s.t / 0.3; g.strokeStyle = s.kind === 'hit' ? 'rgba(255,255,255,' + (1 - f) + ')' : 'rgba(255,210,77,' + (1 - f) + ')'; g.lineWidth = 12 * (1 - f) + 2; g.lineCap = 'round'; g.beginPath(); g.moveTo(cx - v[0] * fs * 0.5 + v[1] * fs * 0.2, fy - fs * 0.4 - v[1] * fs * 0.5 - v[0] * fs * 0.2); g.lineTo(cx + v[0] * fs * 0.5 - v[1] * fs * 0.2, fy - fs * 0.4 + v[1] * fs * 0.5 + v[0] * fs * 0.2); g.stroke(); }
        for (const s of sparks) { for (let i = 0; i < 10; i++) { const a = i / 10 * TAU, r = (s.big ? 90 : 50) * s.t * 2; g.fillStyle = 'rgba(255,230,120,' + (1 - s.t * 2) + ')'; g.beginPath(); g.arc(cx + Math.cos(a) * r, fy - fs * 0.45 + Math.sin(a) * r, 4, 0, TAU); g.fill(); } }
        // 自分（うしろ姿ふうに、まんなか下に小さく）と体力
        A.mascot(g, w * 0.5, h * 0.97, Math.min(h * 0.2, w * 0.4), { kind: env.kind, pose: run.stun > 0 ? 'sad' : 'idle', t: kt }); g.restore();
        for (let i = 0; i < Sim.PHP; i++) text(g, i < run.php ? '♥' : '♡', 18 + i * 20, 22, 20, { color: i < run.php ? PAL.red : '#fff' });
        for (let i = 0; i < run.emax; i++) { circ(g, w - 16 - i * 17, 22, 6, i < run.ehp ? PAL.teal : 'rgba(18,59,87,.25)', '#fff', 1.5); }
        const tl = clamp(1 - run.t / Sim.LIMIT, 0, 1); rr(g, w * 0.3, 8, w * 0.4, 7, 4); g.fillStyle = 'rgba(0,0,0,.25)'; g.fill(); rr(g, w * 0.3, 8, w * 0.4 * tl, 7, 4); g.fillStyle = '#fff'; g.fill();
        if (flash > 0) { g.fillStyle = 'rgba(255,60,60,' + flash * 0.9 + ')'; g.fillRect(0, 0, w, h); }
        for (const p of pops) if (p.t >= 0) text(g, p.txt, w / 2, h * 0.3 - p.t * 20, fontPx(w, h) * 1.7, { color: p.col });
        if (ptr != null && p0 && !used) { g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; circ(g, p0.x, p0.y, 18, null, 'rgba(255,255,255,.7)', 3); }
      },
    };
  };
})(typeof window !== 'undefined' ? window : globalThis);
