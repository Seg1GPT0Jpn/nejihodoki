// ぽかぽか島スポーツ：種目の「会場」その3。カヌー（ふたりで画面わけ）・卓球とテニス（ふたりでたいせん）・サイクリング。
(function (root) {
  'use strict';
  const A = root.SportsArt, S2 = root.SportsSim2, C = root.SportsCore;
  const V = root.SportsVenues = root.SportsVenues || {};
  const { PAL, ell, circ, rr, text, lin } = A;
  const { Gesture } = V.util;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), TAU = Math.PI * 2, lerp = (a, b, t) => a + (b - a) * t;
  const fontPx = (w, h) => Math.round(clamp(Math.min(w, h) * 0.04, 12, 22));
  const nowMs = e => (e && e.t != null ? e.t : Date.now());

  // =====================================================================================
  // カヌー：左右を交互にたたく。ふたりのときは画面を左右に分ける
  // =====================================================================================
  V.canoe = function (env) {
    const L = env.L; let w = 300, h = 400, m = null, kt = 0, pops = [], pressed = [0, 0, 0, 0], st = 'play', rest = 0, hum = 1, lastCountdown = 9, pads = [];
    const Sim = S2.Canoe, BOATCOL = [PAL.coral, PAL.violet, PAL.teal, PAL.sun];
    function start() { hum = env.players === 2 && env.versusMode !== 'pass' ? 2 : 1; m = Sim.newRun(env.diff, env.seed, hum); st = 'play'; pops = []; lastCountdown = 9; hud(); env.status(hum === 2 ? L('左右のボタンを、リズムよく 交互に！', 'Tap left and right in turn, to the rhythm!') : L('左・右・左・右…と、リズムよく 交互にタップ！', 'Tap left, right, left, right — keep the rhythm!')); }
    function hud() { const b = m.boats[0], rank = 1 + m.boats.filter(o => o.s > b.s).length; env.hud(L('きょり ', 'Dist ') + Math.round(Math.min(b.s, m.cfg.len)) + '/' + m.cfg.len + 'm  ' + rank + L('位', ['st', 'nd', 'rd', 'th'][rank - 1])); }
    function tap(i, side) {
      if (st !== 'play') return; const q = Sim.tap(m, i, side); pressed[i * 2 + (side < 0 ? 0 : 1)] = 0.14; if (q > 0) { env.sfx('move'); env.noise(0.05, { vol: 0.04, freq: 1500 }); if (q > 0.8) pops.push({ txt: L('いいリズム！', 'Nice!'), i, t: 0 }); }
    }
    function pad(x, y) { for (const p of pads) if (x >= p.x && x <= p.x + p.w && y >= p.y && y <= p.y + p.h) return p; return null; }
    function layout() { pads = []; const n = hum; for (let i = 0; i < n; i++) { const vx = i * w / n, vw = w / n, ph = Math.min(h * 0.26, 150); pads.push({ i, side: -1, x: vx + 4, y: h - ph - 4, w: vw / 2 - 6, h: ph }); pads.push({ i, side: 1, x: vx + vw / 2 + 2, y: h - ph - 4, w: vw / 2 - 6, h: ph }); } }
    return {
      start, resize(a, b) { w = a; h = b; layout(); },
      down(x, y, id) { if (!m) return; layout(); const p = pad(x, y) || (y < h - 10 ? { i: hum === 2 ? (x < w / 2 ? 0 : 1) : 0, side: (hum === 2 ? (x % (w / 2)) : x) < (hum === 2 ? w / 4 : w / 2) ? -1 : 1 } : null); if (p) tap(p.i, p.side); },
      move() {}, up() {},
      key(code, down) { if (!down || !m) return; if (hum === 1) { if (code === 'KeyA' || code === 'ArrowLeft' || code === 'KeyZ') tap(0, -1); if (code === 'KeyD' || code === 'ArrowRight' || code === 'KeyX') tap(0, 1); } else { if (code === 'KeyA') tap(0, -1); if (code === 'KeyD') tap(0, 1); if (code === 'ArrowLeft') tap(1, -1); if (code === 'ArrowRight') tap(1, 1); } },
      update(dt) {
        if (!m) return; kt += dt; dt = Math.min(dt, 0.05); for (let i = 0; i < 4; i++) pressed[i] = Math.max(0, pressed[i] - dt); for (const p of pops) p.t += dt; pops = pops.filter(p => p.t < 0.8);
        if (st === 'play') {
          const cd = Math.ceil(-m.t); if (m.t < 0 && cd !== lastCountdown) { lastCountdown = cd; env.tone(cd > 0 ? 440 : 880, 0.12, { type: 'triangle', vol: 0.08 }); }
          Sim.step(m, dt); for (const e of m.ev) { if (e.type === 'rock') { env.sfx('fail'); env.buzz(25); pops.push({ txt: L('ゴツン！', 'Bump!'), i: e.boat, t: 0 }); } if (e.type === 'finish') { env.sfx('clear'); } if (e.type === 'tired') { env.sfx('over'); pops.push({ txt: L('つかれた！ リズムをゆっくり', 'Tired! Slow the rhythm'), i: e.boat, t: 0 }); } } m.ev.length = 0; hud();
          if (m.done) { st = 'end'; rest = 1.8; const r = m.results; env.sfx(r[0].place === 1 ? 'win' : 'ok'); }
        } else if (st === 'end') { rest -= dt; if (rest <= 0) { st = 'over'; const r = m.results; const hs = r.filter(x => x.human); if (hum === 2) env.done({ scores: hs.map(x => x.score), score: Math.max(...hs.map(x => x.score)), extra: hs.map(x => x.time), detail: { places: hs.map(x => x.place), times: hs.map(x => x.time) } }); else env.done({ score: hs[0].score, extra: hs[0].time, detail: { place: hs[0].place, time: hs[0].time } }); } }
      },
      draw(g) {
        if (!m) return; layout();
        for (let i = 0; i < hum; i++) { const vx = i * w / hum, vw = w / hum; g.save(); g.beginPath(); g.rect(vx, 0, vw, h); g.clip(); view(g, vx, 0, vw, h, i); g.restore(); if (i) { g.fillStyle = '#fff'; g.fillRect(vx - 1.5, 0, 3, h); } }
        for (let i = 0; i < hum; i++) { const b = m.boats[i], vx = i * w / hum, vw = w / hum, bw = vw * 0.5, bx = vx + vw / 2 - bw / 2, by = 6; g.fillStyle = 'rgba(0,0,0,.35)'; g.fillRect(bx - 2, by - 2, bw + 4, 12); g.fillStyle = b.st > 0.5 ? '#7be0a0' : b.st > 0.25 ? '#ffd24d' : '#ff6b5b'; g.fillRect(bx, by, bw * b.st, 8); text(g, L('スタミナ', 'Stamina'), vx + vw / 2, by + 20, fontPx(w, h) * 0.8); }
        if (m.t < 0) text(g, Math.ceil(-m.t) + '', w / 2, h * 0.3, fontPx(w, h) * 4); else if (m.t < 0.6) text(g, 'GO!', w / 2, h * 0.3, fontPx(w, h) * 3, { color: PAL.sun });
        if (st === 'end' || st === 'over') { const r = m.results[0]; text(g, hum === 2 ? L('ゴール！', 'Finish!') : r.place + L('位！', ['st', 'nd', 'rd', 'th'][Math.min(3, r.place - 1)] + ' place!'), w / 2, h * 0.35, fontPx(w, h) * 2.4, { color: PAL.sun }); }
      },
    };
    function view(g, vx, vy, vw, vh, bi) {
      const b = m.boats[bi], len = m.cfg.len, ppm = vh * 0.0165, by = vy + vh * 0.64, cxm = vx + vw / 2, lw = vw * 0.34, sV = Math.max(0, Math.min(b.s, len + 6));
      const Y = s => by - (s - sV) * ppm, LX = bo => cxm + clamp(bo.human ? bo.x : bo.x * 0.4 + (bo.i - 1.5) * 0.45, -1.1, 1.1) * lw;
      // 川
      g.fillStyle = lin(g, 0, vy, 0, vy + vh, '#6fe0e0', '#1c93c4'); g.fillRect(vx, vy, vw, vh);
      g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 2; for (let s = Math.floor(sV / 5) * 5 - 10; s < sV + 50; s += 5) { const y = Y(s); for (let k = -2; k <= 2; k++) { const x = cxm + k * lw * 0.55 + Math.sin(s * 0.7 + k) * 8; g.beginPath(); g.moveTo(x - 10, y); g.lineTo(x + 10, y - 3); g.stroke(); } }
      // きし
      const bank = lw * 1.25; g.fillStyle = PAL.sand; g.fillRect(vx, vy, cxm - bank - vx, vh); g.fillRect(cxm + bank, vy, vx + vw - (cxm + bank), vh); g.fillStyle = PAL.grass1; g.fillRect(vx, vy, cxm - bank - vx - 12, vh); g.fillRect(cxm + bank + 12, vy, vx + vw - (cxm + bank) - 12, vh);
      for (let s = Math.floor(sV / 22) * 22 - 22; s < sV + 60; s += 22) { const y = Y(s); A.palm(g, cxm - bank - 10, y, vh * 0.1, kt + s, 0.2); A.palm(g, cxm + bank + 10, y - 12, vh * 0.1, kt + s, -0.2); }
      // ゴール
      if (len - sV < 60) { const y = Y(len); g.fillStyle = '#fff'; g.fillRect(cxm - bank, y - 6, bank * 2, 12); g.fillStyle = '#222'; for (let k = 0; k < 14; k++) if (k % 2 === 0) g.fillRect(cxm - bank + k * bank * 2 / 14, y - 6, bank * 2 / 14, 6); else g.fillRect(cxm - bank + k * bank * 2 / 14, y, bank * 2 / 14, 6); text(g, 'GOAL', cxm, y - 22, fontPx(w, h) * 1.1); }
      // 岩
      for (const rk of m.rocks) { const y = Y(rk.s); if (y < vy - 30 || y > vy + vh + 30) continue; const x = cxm + rk.x * lw; ell(g, x, y + 3, 17, 9, 'rgba(0,0,0,.2)'); ell(g, x, y, 17, 12, PAL.rock, PAL.ink, 2); ell(g, x - 4, y - 3, 8, 4, '#c5d3da'); }
      // ボート（うしろ→まえ）
      const order = m.boats.slice().sort((p, q) => p.s - q.s);
      for (const o of order) { const y = Y(o.s); if (y < vy - 50 || y > vy + vh + 50) continue; const x = LX(o); g.save(); g.translate(x, y); const col = BOATCOL[o.i]; ell(g, 2, 6, 16, 34, 'rgba(0,0,0,.18)'); g.fillStyle = col; g.strokeStyle = PAL.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -34); g.quadraticCurveTo(15, -4, 0, 34); g.quadraticCurveTo(-15, -4, 0, -34); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(0, -30); g.quadraticCurveTo(5, -4, 0, 24); g.quadraticCurveTo(-5, -4, 0, -30); g.fill();
        A.mascot(g, 0, 16, 40, { kind: o.i, pose: 'idle', t: kt }); const sw = o.human ? (o.lastSide || 1) : o.cside, ph = o.human ? clamp(1 - (m.t - o.last) / 0.3, 0, 1) : (Math.sin(kt * 9) > 0 ? 1 : 0); g.strokeStyle = PAL.wood2; g.lineWidth = 3; g.lineCap = 'round'; g.beginPath(); g.moveTo(-sw * 6, -6); g.lineTo(sw * (22 + 6 * ph), 4 + 10 * ph); g.stroke(); ell(g, sw * (24 + 6 * ph), 6 + 10 * ph, 5, 9, PAL.wood, PAL.ink, 1.2);
        if (o.human) { text(g, 'P' + (o.i + 1), 0, -42, fontPx(w, h) - 2); } g.restore(); if (m.t > 0 && o.v > 1) { g.strokeStyle = 'rgba(255,255,255,.6)'; g.lineWidth = 2; g.beginPath(); g.moveTo(x - 14, y + 30); g.lineTo(x - 22, y + 30 + o.v * 3); g.moveTo(x + 14, y + 30); g.lineTo(x + 22, y + 30 + o.v * 3); g.stroke(); } }
      // リズムの輪
      if (b.human && b.fin == null) { const tc = m.cfg.tc, ph = b.last < 0 ? 1 : clamp((m.t - b.last) / tc, 0, 1.6), R = lerp(54, 20, Math.min(1, ph)), ok = Math.abs(ph - 1) < 0.22; g.lineWidth = 4; g.strokeStyle = ok ? '#7be0a0' : 'rgba(255,255,255,.7)'; g.beginPath(); g.arc(LX(b), by, R, 0, TAU); g.stroke(); g.strokeStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.arc(LX(b), by, 20, 0, TAU); g.stroke(); }
      for (const p of pops) if (p.i === bi) text(g, p.txt, LX(b), by - 60 - p.t * 30, fontPx(w, h) * 1.3, { color: PAL.sun });
      // しんこうバー
      const bx = vx + vw - 14, y0 = vy + 40, y1 = vy + vh * 0.5; g.strokeStyle = 'rgba(255,255,255,.7)'; g.lineWidth = 3; g.beginPath(); g.moveTo(bx, y0); g.lineTo(bx, y1); g.stroke(); for (const o of m.boats) circ(g, bx, lerp(y1, y0, clamp(o.s / len, 0, 1)), o.human ? 6 : 4, BOATCOL[o.i], '#fff', 1.5);
      text(g, (b.v * 3.6).toFixed(0) + ' km/h', vx + vw / 2, vy + 24, fontPx(w, h)); text(g, Math.max(0, Math.round(len - b.s)) + 'm', vx + vw / 2, vy + 24 + fontPx(w, h) * 1.3, fontPx(w, h) - 2);
      // ボタン
      for (const p of pads) if (p.i === bi) { const down = pressed[p.i * 2 + (p.side < 0 ? 0 : 1)] > 0; rr(g, p.x, p.y, p.w, p.h, 18); g.fillStyle = down ? 'rgba(255,210,77,.95)' : 'rgba(255,255,255,.55)'; g.fill(); g.strokeStyle = PAL.ink; g.lineWidth = 3; g.stroke(); text(g, p.side < 0 ? L('ひだり', 'Left') : L('みぎ', 'Right'), p.x + p.w / 2, p.y + p.h / 2, fontPx(w, h) * 1.3, { color: PAL.ink, stroke: false }); text(g, p.side < 0 ? '◀' : '▶', p.x + p.w / 2, p.y + p.h / 2 - fontPx(w, h) * 1.4, fontPx(w, h) * 1.3, { color: PAL.ink, stroke: false }); }
    }
  };

  // =====================================================================================
  // 卓球とテニス：スワイプで打ち返す
  // =====================================================================================
  function rallyVenue(sport) {
    return function (env) {
      const L = env.L; let w = 300, h = 400, m = null, kt = 0, pops = [], gests = {}, fired = {}, trail = [], swing = [0, 0], st = 'play', rest = 0, kdir = 0, shk = 0, sparks = [];
      const Sim = S2.Rally; let two = false;
      function geo() {
        const P = m.P, tn = sport === 'tennis', back = tn ? 7.5 : 2.6, hor = h * (tn ? 0.2 : 0.2), camH = tn ? 5.6 : 1.3, zc = back, W2 = P.W / 2 + (tn ? 1.4 : 0.1);
        const F = Math.min(w * 0.47 * zc / W2, h * 1.4); return { F, hor, camH, back, X: (x, y, z) => { const d = P.L / 2 + back - y; return { x: w / 2 + x * F / d, y: hor + (camH - (z || 0)) * F / d, s: F / d }; } };
      }
      function start() { two = env.players === 2 && env.versusMode === 'versus'; const o = env.opts || {}; m = Sim.newMatch(sport, env.diff, env.seed, { two, opp: o.opp, doubles: !!o.doubles && !two }); st = 'play'; pops = []; trail = []; hud(); env.status(two ? L('2P対戦：下がP1、上がP2。ボールがはねたらスワイプ！', '2-player: P1 plays the bottom, P2 the top. Swipe after the bounce!') : L('ボールがはねて、緑の輪のときにスワイプで打ち返そう！', 'Swipe when the ring turns green, after the bounce!')); }
      function hud() { const l = Sim.label(m); env.hud(sport === 'pingpong' ? l.a + ' - ' + l.b + '  (' + L(m.target + '点先取', 'first to ' + m.target) + ')' : L('ゲーム ', 'Games ') + m.games[0] + '-' + m.games[1] + '  ' + l.a + '-' + l.b); }
      function aimOf(v, side, curve) { return { ax: clamp(v.dx / Math.max(1, Math.abs(v.dy)) * 1.1, -1, 1), s: clamp((v.speed - 0.3) / 2.1, 0.05, 1), spin: curve * 0.8, top: clamp((v.speed - 1.1) / 1.1, -1, 1) * 0.9 }; }
      function sideAt(y) { return two && y < h * 0.46 ? 1 : 0; }
      function fire(side, aim) { const r = Sim.swipe(m, side, aim); if (r === 'hit' || r === 'serve') { swing[side] = 0.28; env.sfx(aim.s > 0.7 ? 'hit' : 'tap'); if (aim.s > 0.82 && r === 'hit') { shk = 0.35; if (env.highlight) env.highlight(L('スマッシュ！', 'SMASH!')); pops.push({ txt: L('スマッシュ！', 'Smash!'), t: 0, col: '#ff9a6a' }); env.sfx('combo', 3); } if (m.ball) for (let i = 0; i < 8; i++) sparks.push({ x: m.ball.x, y: m.ball.y, z: m.ball.z, a: i / 8 * 6.28, t: 0 }); env.noise(0.05, { vol: 0.05, freq: 2400 }); env.buzz(8); } else if (r === 'whiff') { swing[side] = 0.2; env.tone(200, 0.06, { type: 'triangle', vol: 0.03 }); } return r; }
      function drain() {
        for (const e of m.ev) {
          if (e.type === 'bounce') { env.tone(sport === 'pingpong' ? 900 : 300, 0.04, { type: 'sine', vol: 0.05 }); }
          else if (e.type === 'point') { const mine = e.winner === 0; pops.push({ txt: two ? (e.winner === 0 ? 'P1' : 'P2') + L(' 得点！', ' scores!') : mine ? (e.why === 'winner' && e.rally <= 1 ? L('エース！', 'Ace!') : L('ポイント！', 'Point!')) : L('とられた…', 'Their point'), t: 0, col: mine ? PAL.sun : '#fff' }); env.sfx(mine ? 'ok' : 'fail'); if (mine && e.why === 'winner' && e.rally <= 1) env.stat('ace'); hud(); }
          else if (e.type === 'net') { env.tone(150, 0.1, { type: 'sine', vol: 0.06 }); } else if (e.type === 'fault') pops.push({ txt: L('フォールト', 'Fault'), t: 0, col: '#fff' }); else if (e.type === 'game') { pops.push({ txt: e.winner === 0 ? L('ゲーム！', 'Game!') : L('ゲームをとられた', 'Game to them'), t: 0, col: PAL.sun }); }
        }
        m.ev.length = 0;
      }
      return {
        start, resize(a, b) { w = a; h = b; },
        down(x, y, id, e) { if (!m || m.done) return; const side = sideAt(y); gests[id] = { g: new Gesture(), side, sx: x, sy: y }; gests[id].g.add(x, y, nowMs(e)); fired[id] = false; },
        move(x, y, id, e) { const o = gests[id]; if (!o || fired[id]) return; o.g.add(x, y, nowMs(e)); const d = Math.hypot(x - o.sx, y - o.sy); if (d >= 38) { fired[id] = true; const v = o.g.vec(260); fire(o.side, aimOf(v, o.side, o.g.curve(260))); } },
        up(x, y, id, e) { const o = gests[id]; if (!o) return; if (!fired[id]) { o.g.add(x, y, nowMs(e)); const d = Math.hypot(x - o.sx, y - o.sy); fired[id] = true; if (d < 38) fire(o.side, { ax: 0, s: 0.4, spin: 0 }); } delete gests[id]; },
        key(code, down) {
          if (!m) return; if (code === 'ArrowLeft') kdir = down ? -1 : (kdir === -1 ? 0 : kdir); if (code === 'ArrowRight') kdir = down ? 1 : (kdir === 1 ? 0 : kdir);
          if (!down) return; if (code === 'Space' || code === 'ArrowUp' || code === 'ArrowDown') fire(0, { ax: kdir * 0.7, s: code === 'ArrowUp' ? 0.9 : code === 'ArrowDown' ? 0.2 : 0.5, spin: 0 });
          if (two) { if (code === 'KeyJ') fire(1, { ax: -0.7, s: 0.5, spin: 0 }); if (code === 'KeyK') fire(1, { ax: 0, s: 0.5, spin: 0 }); if (code === 'KeyL') fire(1, { ax: 0.7, s: 0.5, spin: 0 }); }
        },
        update(dt) {
          if (!m) return; kt += dt; dt = Math.min(dt, 1 / 30); shk = Math.max(0, shk - dt * 1.8); for (const p of sparks) p.t += dt; sparks = sparks.filter(p => p.t < 0.35); for (const p of pops) p.t += dt; pops = pops.filter(p => p.t < 1.2); swing[0] = Math.max(0, swing[0] - dt); swing[1] = Math.max(0, swing[1] - dt);
          if (st === 'play') {
            Sim.step(m, dt); drain(); if (m.ball && m.state === 'rally') { trail.push({ x: m.ball.x, y: m.ball.y, z: m.ball.z }); if (trail.length > 7) trail.shift(); } else trail = [];
            if (m.done) { st = 'end'; rest = 1.8; env.sfx(m.winner === 0 ? 'win' : 'over'); pops.push({ txt: two ? (m.winner === 0 ? L('P1 のかち！', 'P1 wins!') : L('P2 のかち！', 'P2 wins!')) : m.winner === 0 ? L('かち！', 'You win!') : L('まけ…', 'You lose'), t: -0.1, col: PAL.sun }); }
          } else if (st === 'end') { rest -= dt; if (rest <= 0) { st = 'over'; if (two) env.done({ versus: true, winner: m.winner, scores: [m.pts[0], m.pts[1]], score: m.pts[0], detail: { pts: m.pts, games: m.games, longest: m.longest } }); else env.done({ score: Sim.scoreOf(m), detail: { won: m.winner === 0, pts: m.pts, games: m.games, longest: m.longest, aces: m.aces } }); } }
        },
        draw(g) { g.save(); if (shk > 0) g.translate((Math.random() - 0.5) * shk * 12, (Math.random() - 0.5) * shk * 8); this.draw0(g); for (const p of sparks) { const q = geo().X(p.x, p.y, p.z); g.fillStyle = 'rgba(255,230,120,' + (1 - p.t / 0.35) + ')'; g.beginPath(); g.arc(q.x + Math.cos(p.a) * p.t * 120, q.y + Math.sin(p.a) * p.t * 120, 3, 0, 6.3); g.fill(); } g.restore(); },
        draw0(g) {
          if (!m) return; const P = m.P, q = geo(), tn = sport === 'tennis', X = q.X, hl = P.L / 2, ww = P.W / 2;
          // 背景
          if (tn) { A.sky(g, w, h, q.hor, kt); g.fillStyle = PAL.sea1; g.fillRect(0, q.hor - 8, w, 8); g.fillStyle = PAL.grass1; g.fillRect(0, q.hor, w, h - q.hor); }
          else { g.fillStyle = lin(g, 0, 0, 0, q.hor + 10, '#7fd6ff', '#ffe9b8'); g.fillRect(0, 0, w, q.hor + 10); g.fillStyle = PAL.sea1; g.fillRect(0, q.hor - 24, w, 14); g.fillStyle = '#f0d8a0'; g.fillRect(0, q.hor - 10, w, h); A.palm(g, w * 0.1, q.hor - 8, h * 0.18, kt, 0.4); A.palm(g, w * 0.9, q.hor - 8, h * 0.16, kt, -0.4); }
          // 相手
          const op = X(m.pp[1], -hl - (tn ? 1.5 : 0.8), tn ? 0 : -0.76); A.mascot(g, op.x, op.y, (tn ? 1.8 : 1.5) * op.s, { kind: 2, pose: swing[1] > 0 ? 'swing' : 'idle', t: kt, dir: 1 }); racket(g, { x: op.x, y: op.y, s: op.s }, 1, swing[1], tn);
          const quad = (x0, y0, x1, y1, z, fill) => { const a = X(x0, y0, z), b = X(x1, y0, z), c = X(x1, y1, z), d = X(x0, y1, z); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.closePath(); g.fillStyle = fill; g.fill(); };
          const line = (x0, y0, x1, y1, z, col, lw) => { const a = X(x0, y0, z), b = X(x1, y0 === y1 ? y1 : y1, z); g.strokeStyle = col; g.lineWidth = lw; g.beginPath(); g.moveTo(X(x0, y0, z).x, X(x0, y0, z).y); g.lineTo(X(x1, y1, z).x, X(x1, y1, z).y); g.stroke(); };
          if (tn) { quad(-ww - 1.4, -hl - 3, ww + 1.4, hl + 3, 0, '#c9703a'); quad(-ww, -hl, ww, hl, 0, '#d98648'); for (const [a, b, c, d] of [[-ww, -hl, ww, -hl], [-ww, hl, ww, hl], [-ww, -hl, -ww, hl], [ww, -hl, ww, hl], [-ww, -6.4, ww, -6.4], [-ww, 6.4, ww, 6.4], [0, -6.4, 0, 6.4]]) line(a, b, c, d, 0, '#fff', 2); }
          else { // 台の足と台
            g.strokeStyle = '#555'; g.lineWidth = 5; for (const [x, y] of [[-ww * 0.9, hl * 0.9], [ww * 0.9, hl * 0.9], [-ww * 0.9, -hl * 0.9], [ww * 0.9, -hl * 0.9]]) { const a = X(x, y, 0), b = X(x, y, -0.76); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.stroke(); }
            const bk = X(0, 0, -0.76); const a = X(-ww, hl, 0), b = X(ww, hl, 0), c = X(ww, hl, -0.06), d = X(-ww, hl, -0.06); quad(-ww, -hl, ww, hl, 0, '#1d6fb5'); g.fillStyle = '#134f85'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(c.x, c.y); g.lineTo(d.x, d.y); g.fill(); line(-ww, -hl, ww, -hl, 0, '#fff', 2); line(-ww, hl, ww, hl, 0, '#fff', 3); line(-ww, -hl, -ww, hl, 0, '#fff', 2); line(ww, -hl, ww, hl, 0, '#fff', 2); line(0, -hl, 0, hl, 0, 'rgba(255,255,255,.7)', 1.5); }
          // ボールの影（ネットの前のもの）
          const drawNet = () => { const a = X(-ww - (tn ? 0.4 : 0.1), 0, 0), b = X(ww + (tn ? 0.4 : 0.1), 0, 0), at = X(-ww - (tn ? 0.4 : 0.1), 0, P.netH), bt = X(ww + (tn ? 0.4 : 0.1), 0, P.netH); g.fillStyle = 'rgba(255,255,255,.35)'; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(b.x, b.y); g.lineTo(bt.x, bt.y); g.lineTo(at.x, at.y); g.closePath(); g.fill(); g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(at.x, at.y); g.lineTo(bt.x, bt.y); g.stroke(); g.strokeStyle = '#555'; g.lineWidth = 3; g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(at.x, at.y); g.moveTo(b.x, b.y); g.lineTo(bt.x, bt.y); g.stroke(); };
          const ball = m.ball, bp = ball ? X(ball.x, ball.y, ball.z) : null;
          // 自分
          let mp = X(m.pp[0], tn && m.net[0] ? 5.4 : hl + (tn ? 1.7 : 0.95), 0); if (m.doubles) { const pp2 = X(clamp(-m.pp[0] * 0.8 + (m.pp[0] >= 0 ? -1 : 1) * (tn ? 2.2 : 0.35), -ww, ww), tn ? hl + 1.4 : hl + 0.9, tn ? 0 : -0.76); A.mascot(g, pp2.x, tn ? pp2.y : h * 0.99, (tn ? 1.8 : 1.5) * (tn ? pp2.s * 0.9 : h * 0.2 / 1.5), { kind: typeof env.kind === 'object' ? { k: (env.kind.k + 2) % 4, c: (env.kind.c + 3) % 8, h: 0, f: 1 } : (env.kind + 2) % 4, pose: 'idle', t: kt + 1, dir: -1 }); const op2 = X(clamp(-m.pp[1] * 0.8 + (tn ? 2.2 : 0.35), -ww, ww), -hl - (tn ? 1.7 : 0.8), tn ? 0 : -0.76); A.mascot(g, op2.x, op2.y, (tn ? 1.8 : 1.5) * op2.s * 0.95, { kind: 1, pose: 'idle', t: kt + 2, dir: 1 }); } if (!tn) mp = { x: X(m.pp[0], hl + 0.95, 0).x, y: h * 0.99, s: h * 0.26 / 1.5 }; A.mascot(g, mp.x, mp.y + 4, (tn ? 1.9 : 1.5) * mp.s * (tn ? 0.95 : 1), { kind: env.kind, pose: swing[0] > 0 ? 'swing' : 'idle', t: kt, dir: -1 }); racket(g, mp, -1, swing[0], tn);
          // ボールの影と本体：ネットより奥のもの→ネット→手前のもの
          const farFirst = ball && ball.y < 0;
          const drawBall = () => { if (!ball) return; const sh = X(ball.x, ball.y, tn ? 0 : (Rally_in(ball) ? 0 : -0.76)), r = Math.max(3.2, P.r * 2.3 * bp.s * (tn ? 1.7 : 1.0)); ell(g, sh.x, sh.y, r * 1.1, r * 0.4, 'rgba(0,0,0,.28)'); for (let i = 0; i < trail.length - 1; i++) { const t = X(trail[i].x, trail[i].y, trail[i].z); circ(g, t.x, t.y, r * (0.25 + i * 0.07), 'rgba(255,255,255,' + (0.05 + i * 0.05) + ')'); } circ(g, bp.x, bp.y, r, tn ? '#e8f55a' : '#fff', PAL.ink, 1.5);
            const qh = Sim.quality(m, 0); if (qh >= 0 && m.state === 'rally' && !m.done) { const good = qh > 0.55; circ(g, bp.x, bp.y, r * 2.6, null, good ? '#5cf08a' : '#ffd24d', 3.5); } if (two) { const q2 = Sim.quality(m, 1); if (q2 >= 0) circ(g, bp.x, bp.y, r * 2.6, null, q2 > 0.55 ? '#5cf08a' : '#ffd24d', 3.5); } };
          const Rally_in = b => Math.abs(b.x) <= ww && Math.abs(b.y) <= hl;
          if (farFirst) drawBall(); drawNet(); if (!farFirst) drawBall();
          if (m.state === 'serve' && m.ball && m.ball.held) { const sp = X(m.ball.x, m.ball.y, m.ball.z), r = Math.max(3.5, P.r * 2.5 * sp.s * (tn ? 1.7 : 1)); circ(g, sp.x, sp.y, r, tn ? '#e8f55a' : '#fff', PAL.ink, 1.5); }
          // 点数
          const l = Sim.label(m), pw = Math.min(w - 16, 300); rr(g, w / 2 - pw / 2, 6, pw, 34, 12); g.fillStyle = 'rgba(18,59,87,.78)'; g.fill();
          if (sport === 'pingpong') { text(g, (two ? 'P1 ' : L('あなた ', 'You ')) + m.pts[0] + '  –  ' + m.pts[1] + (two ? ' P2' : ' CPU'), w / 2, 23, fontPx(w, h) * 1.15, { stroke: false }); }
          else { text(g, L('ゲーム ', 'Games ') + m.games[0] + '–' + m.games[1] + '   ' + l.a + ' – ' + l.b + (l.text === 'deuce' ? ' deuce' : ''), w / 2, 23, fontPx(w, h) * 1.05, { stroke: false }); }
          if (m.state === 'serve' && !m.done && (m.server === 0 || (two && m.server === 1))) text(g, (two ? 'P' + (m.server + 1) + ' ' : '') + L('スワイプでサーブ！', 'Swipe to serve!'), w / 2, h * 0.5, fontPx(w, h) * 1.4, { color: PAL.sun });
          if (m.serveNo === 2 && m.sport === 'tennis' && m.state === 'serve') text(g, L('2本目', 'Second serve'), w / 2, h * 0.5 + fontPx(w, h) * 1.8, fontPx(w, h));
          for (const p of pops) if (p.t >= 0) text(g, p.txt, w / 2, h * 0.38 - p.t * 20, fontPx(w, h) * 1.8, { color: p.col });
          for (const id in gests) { const o = gests[id]; if (o.g.pts.length > 1) { g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 5; g.lineCap = 'round'; g.beginPath(); o.g.pts.forEach((p, i) => { if (i) g.lineTo(p.x, p.y); else g.moveTo(p.x, p.y); }); g.stroke(); } }
        },
      };
      function racket(g, p, dir, sw, tn) { const s = p.s * (tn ? 1.4 : 1.0), a = -0.6 + (sw > 0 ? (1 - sw / 0.28) * 2.2 : 0), len = (tn ? 1.0 : 0.45) * p.s; g.save(); g.translate(p.x + dir * (-0.5 * p.s * (tn ? 0.7 : 0.45)), p.y - (tn ? 0.9 : 0.55) * p.s); g.rotate(a * -dir); g.strokeStyle = PAL.wood2; g.lineWidth = Math.max(2, p.s * 0.05); g.beginPath(); g.moveTo(0, 0); g.lineTo(0, -len * 0.5); g.stroke(); ell(g, 0, -len * 0.85, len * 0.3, len * 0.38, tn ? 'rgba(255,255,255,.4)' : PAL.red, PAL.ink, 1.6); g.restore(); void s; }
    };
  }
  V.pingpong = rallyVenue('pingpong'); V.tennis = rallyVenue('tennis');

  // =====================================================================================
  // サイクリング：疑似3D の道。ハンドルはドラッグ・ボタン・キー・かたむき
  // =====================================================================================
  V.cycling = function (env) {
    const L = env.L, jet = (env.opts || {}).variant === 'jet'; let w = 300, h = 400, m = null, kt = 0, ptr = null, x0 = 0, du = 0, keyU = 0, btnU = 0, boostH = false, keyBoost = false, st = 'play', rest = 0, pops = [], lean = 0, lastCd = 9, bgx = 0;
    const Sim = S2.Cycling, RW = 2.2, SEG = 4, CAMZ = 3, COL = [PAL.violet, PAL.coral, PAL.teal, PAL.sun];
    function start() { m = Sim.newRun(env.diff, env.seed, { jet }); st = 'play'; pops = []; lastCd = 9; lean = 0; bgx = 0; setBtns(); hud(); env.status(jet ? L('左右にドラッグでかじとり。ブイをよけて、ターボで追い上げよう。前の人のうしろは らく（スリップ）', 'Drag to steer. Dodge buoys, use turbo, and tuck in behind a rider to draft.') : L('左右にドラッグでハンドル。ブーストで追い上げよう。前の人のうしろは らく（スリップストリーム）', 'Drag left/right to steer. Boost to catch up — and draft behind other riders!')); }
    function setBtns() { env.setButtons([{ id: 'left', label: '◀', hold: true }, { id: 'boost', label: L('ブースト', 'Boost'), hold: true }, { id: 'right', label: '▶', hold: true }]); }
    function place() { const hu = m.riders[0]; let p = 1; for (let i = 1; i < 4; i++) if (m.riders[i].s > hu.s) p++; return p; }
    function hud() { env.hud(place() + L('位  ', 'th  ') + Math.round(m.riders[0].v * 3.6) + 'km/h  ' + Math.max(0, Math.round(m.cfg.len - m.riders[0].s)) + 'm'); }
    function curU() { const tl = env.tilt(); return clamp(du + keyU + btnU + (tl.on ? tl.x * 1.8 : 0), -1, 1); }
    return {
      start, resize(a, b) { w = a; h = b; },
      button(id, down) { if (id === 'left') btnU = down ? -1 : (btnU === -1 ? 0 : btnU); else if (id === 'right') btnU = down ? 1 : (btnU === 1 ? 0 : btnU); else if (id === 'boost') boostH = down; },
      down(x, y, id) { ptr = id; x0 = x; du = 0; }, move(x, y, id) { if (ptr === id) du = clamp((x - x0) / (w * 0.16), -1, 1); }, up(x, y, id) { if (ptr === id) { ptr = null; du = 0; } },
      key(code, down) { if (code === 'ArrowLeft' || code === 'KeyA') keyU = down ? -1 : (keyU === -1 ? 0 : keyU); if (code === 'ArrowRight' || code === 'KeyD') keyU = down ? 1 : (keyU === 1 ? 0 : keyU); if (code === 'Space' || code === 'ArrowUp' || code === 'KeyW') keyBoost = down; },
      update(dt) {
        if (!m) return; kt += dt; dt = Math.min(dt, 0.05); for (const p of pops) p.t += dt; pops = pops.filter(p => p.t < 1);
        if (st === 'play') {
          const cd = Math.ceil(-m.t); if (m.t < 0 && cd !== lastCd) { lastCd = cd; env.tone(cd > 0 ? 440 : 880, 0.12, { type: 'triangle', vol: 0.08 }); }
          const u = curU(); lean += (u - lean) * Math.min(1, dt * 8); const n = Math.ceil(dt / (1 / 60)); for (let i = 0; i < n; i++) Sim.step(m, dt / n, u, boostH || keyBoost);
          bgx -= Sim.curvAt(m, m.riders[0].s).c * m.riders[0].v * dt * 0.25;
          for (const e of m.ev) { if (e.type === 'cone') { env.sfx('hit'); env.buzz(25); pops.push({ txt: L('ガツン！', 'Crash!'), t: 0 }); } else if (e.type === 'boost') { env.sfx('coin'); pops.push({ txt: L('ダッシュ！', 'Dash!'), t: 0 }); } else if (e.type === 'pick') { env.sfx('pop'); pops.push({ txt: L('パワー+', 'Power+'), t: 0 }); } else if (e.type === 'puddle') env.noise(0.1, { vol: 0.05, freq: 900 }); } m.ev.length = 0; hud();
          if (m.done) { st = 'end'; rest = 1.8; const r = m.results[0]; env.sfx(r.place === 1 ? 'win' : 'ok'); if (r.place === 1) env.stat('cycW'); }
        } else if (st === 'end') { rest -= dt; if (rest <= 0) { st = 'over'; const r = m.results[0]; env.done({ score: r.score, extra: r.time, detail: { place: r.place, time: r.time, hits: m.riders[0].hits, picks: m.riders[0].picks } }); } }
      },
      draw(g) {
        if (!m) return; const hu = m.riders[0], s = hu.s, hor = h * 0.36, seg0 = Math.floor(s / SEG), frac = s - seg0 * SEG;
        const Fz = Math.min(w * 0.34 * CAMZ / RW * 2, h * 0.6) , F = w * 0.34 * CAMZ / RW, yb = h * 0.84, camH = (yb - hor) * CAMZ / F;
        A.sky(g, w, h, hor, kt); g.fillStyle = PAL.sea1; g.fillRect(0, hor - 12, w, 12); g.fillStyle = PAL.grass2; for (let i = 0; i < 4; i++) { const x = ((i * 0.37 + bgx * 0.002) % 1.4 + 1.4) % 1.4 * w - w * 0.2; g.beginPath(); g.ellipse(x, hor - 6, w * 0.22, h * 0.05, 0, Math.PI, TAU); g.fill(); }
        // 道を手前から計算
        const N = 56, segs = []; let cx = 0, dx = 0; const camX = hu.x * RW;
        for (let n = 0; n < N; n++) { const zn = n * SEG - frac, zf = zn + SEG, sg = Sim.curvAt(m, s + Math.max(0, zn)); const near = { z: zn, x: cx }; dx += sg.c * 0.4; cx += dx * 0.5; const far = { z: zf, x: cx }; segs.push({ n, near, far, c: sg.c }); }
        const proj = (z, x, lat) => { const d = Math.max(0.3, z + CAMZ), sc = F / d; return { x: w / 2 + (x + (lat || 0) * RW - camX) * sc, y: hor + camH * sc, sc }; };
        g.fillStyle = jet ? '#2bb7d4' : PAL.grass1; g.fillRect(0, hor, w, h - hor);
        for (let n = N - 1; n >= 0; n--) {
          const sg = segs[n], a = proj(Math.max(sg.near.z, -CAMZ + 0.4), sg.near.x), b = proj(sg.far.z, sg.far.x), alt = (seg0 + n) % 2;
          g.fillStyle = jet ? (alt ? '#27a9cc' : '#2fb7d8') : (alt ? '#4bbd5d' : '#58c868'); g.fillRect(0, b.y, w, a.y - b.y + 1);
          const quadStrip = (l0, l1, fill) => { const a0 = proj(Math.max(sg.near.z, -CAMZ + 0.4), sg.near.x, l0), a1 = proj(Math.max(sg.near.z, -CAMZ + 0.4), sg.near.x, l1), b1 = proj(sg.far.z, sg.far.x, l1), b0 = proj(sg.far.z, sg.far.x, l0); g.fillStyle = fill; g.beginPath(); g.moveTo(a0.x, a0.y); g.lineTo(a1.x, a1.y); g.lineTo(b1.x, b1.y); g.lineTo(b0.x, b0.y); g.closePath(); g.fill(); };
          quadStrip(-1.25, -1.0, alt ? '#fff' : (jet ? '#ff7a6b' : PAL.red)); quadStrip(1.0, 1.25, alt ? '#fff' : (jet ? '#ff7a6b' : PAL.red)); quadStrip(-1.0, 1.0, jet ? (alt ? '#1b86b5' : '#1f93c2') : (alt ? '#9aa4ad' : '#a8b1b9')); if (alt) quadStrip(-0.03, 0.03, jet ? 'rgba(255,255,255,.55)' : '#fff');
          if (n === N - 1 && sg.far.z > 1) { /* 遠くのかすみ */ }
        }
        // ゴールの門
        const goalZ = m.cfg.len - s; if (goalZ > -2 && goalZ < N * SEG) { const idx = clamp(Math.floor((goalZ + frac) / SEG), 0, N - 1), sg = segs[idx], gx = lerp(sg.near.x, sg.far.x, ((goalZ + frac) - idx * SEG) / SEG), a = proj(goalZ, gx, -1.3), b = proj(goalZ, gx, 1.3); g.strokeStyle = '#fff'; g.lineWidth = Math.max(2, a.sc * 0.08); g.beginPath(); g.moveTo(a.x, a.y); g.lineTo(a.x, a.y - a.sc * 2.2); g.lineTo(b.x, b.y - b.sc * 2.2); g.lineTo(b.x, b.y); g.stroke(); g.fillStyle = '#222'; g.fillRect(a.x, a.y - a.sc * 2.4, b.x - a.x, a.sc * 0.4); text(g, 'GOAL', (a.x + b.x) / 2, a.y - a.sc * 2.2, Math.max(10, a.sc * 0.5)); }
        // もの（うしろから）
        const things = []; for (const o of m.obs) { const z = o.s - s; if (z > 0.4 && z < N * SEG && !o.hit) things.push({ z, x: o.x, o }); } for (let i = 1; i < 4; i++) { const c = m.riders[i], z = c.s - s; if (z > 0.2 && z < N * SEG) things.push({ z, x: c.x, c }); } things.sort((a, b) => b.z - a.z);
        for (const t of things) {
          const idx = clamp(Math.floor((t.z + frac) / SEG), 0, N - 1), sg = segs[idx], rx = lerp(sg.near.x, sg.far.x, ((t.z + frac) - idx * SEG) / SEG), p = proj(t.z, rx, t.x), u = p.sc;
          if (t.c) { bike(g, p.x, p.y, u * 1.1, COL[t.c.i], 0, t.c.i, kt + t.c.i, t.c.v); continue; }
          const o = t.o; if (jet && o.kind === 'cone') { ell(g, p.x, p.y, u * 0.28, u * 0.1, 'rgba(0,0,0,.2)'); g.fillStyle = PAL.orange; g.beginPath(); g.moveTo(p.x, p.y - u * 0.7); g.lineTo(p.x + u * 0.28, p.y - u * 0.04); g.lineTo(p.x - u * 0.28, p.y - u * 0.04); g.fill(); g.fillStyle = '#fff'; g.fillRect(p.x - u * 0.14, p.y - u * 0.4, u * 0.28, u * 0.1); }
          else if (o.kind === 'cone') { g.fillStyle = PAL.orange; g.beginPath(); g.moveTo(p.x, p.y - u * 0.9); g.lineTo(p.x + u * 0.35, p.y); g.lineTo(p.x - u * 0.35, p.y); g.fill(); g.fillStyle = '#fff'; g.fillRect(p.x - u * 0.18, p.y - u * 0.5, u * 0.36, u * 0.12); }
          else if (o.kind === 'puddle') ell(g, p.x, p.y, u * 0.55, u * 0.14, jet ? 'rgba(255,255,255,.7)' : 'rgba(60,160,230,.85)', '#bfeaff', 1.5);
          else if (o.kind === 'boost') { g.fillStyle = PAL.sun; for (let k = 0; k < 3; k++) { g.beginPath(); g.moveTo(p.x - u * 0.35, p.y - k * u * 0.12); g.lineTo(p.x, p.y - u * 0.2 - k * u * 0.12); g.lineTo(p.x + u * 0.35, p.y - k * u * 0.12); g.lineTo(p.x, p.y - u * 0.08 - k * u * 0.12); g.fill(); } }
          else { rr(g, p.x - u * 0.12, p.y - u * 0.55, u * 0.24, u * 0.55, u * 0.08); g.fillStyle = '#5be07a'; g.fill(); g.strokeStyle = PAL.ink; g.lineWidth = 1.2; g.stroke(); circ(g, p.x, p.y - u * 0.62, u * 0.07, '#fff'); }
        }
        // 自分
        const px = w / 2 + lean * w * 0.07; bike(g, px, yb - 4, Math.min(w, h) * 0.2, COL[0], lean, env.kind, kt, hu.v, true);
        if (m.draft && st === 'play') text(g, L('スリップストリーム！', 'Drafting!'), w / 2, h * 0.6, fontPx(w, h) * 1.1, { color: '#9ee7ff' });
        if (m.bst && hu.en > 0) { g.strokeStyle = 'rgba(255,230,120,.7)'; g.lineWidth = 3; for (let i = 0; i < 6; i++) { const x = w * (0.1 + i * 0.16), y = h * (0.5 + (i % 3) * 0.1); g.beginPath(); g.moveTo(x, y); g.lineTo(x + (x < w / 2 ? -1 : 1) * 24, y + 20); g.stroke(); } }
        // HUD
        const pw = Math.min(w - 20, 260); rr(g, w / 2 - pw / 2, 8, pw, 12, 6); g.fillStyle = 'rgba(0,0,0,.3)'; g.fill(); for (const r of m.riders) circ(g, w / 2 - pw / 2 + 6 + (pw - 12) * clamp(r.s / m.cfg.len, 0, 1), 14, r.human ? 7 : 5, COL[r.i], '#fff', 1.5);
        rr(g, 10, h - 78, 10, 56, 5); g.fillStyle = 'rgba(0,0,0,.35)'; g.fill(); rr(g, 10, h - 78 + 56 * (1 - hu.en), 10, 56 * hu.en, 5); g.fillStyle = hu.en > 0.2 ? PAL.sun : PAL.coral; g.fill(); text(g, jet ? L('ターボ', 'Turbo') : L('ブースト', 'Boost'), 40, h - 24, fontPx(w, h) - 3, { align: 'left', stroke: false, color: '#fff' });
        text(g, place() + (L('位', '')), w - 36, 44, fontPx(w, h) * 1.8);
        if (m.t < 0) text(g, Math.ceil(-m.t) + '', w / 2, h * 0.4, fontPx(w, h) * 4); else if (m.t < 0.6) text(g, 'GO!', w / 2, h * 0.4, fontPx(w, h) * 3, { color: PAL.sun });
        if (st !== 'play') { const r = m.results[0]; text(g, r.place + (L('位！', ['st', 'nd', 'rd', 'th'][Math.min(3, r.place - 1)] + ' place!')), w / 2, h * 0.4, fontPx(w, h) * 2.4, { color: PAL.sun }); }
        for (const p of pops) text(g, p.txt, w / 2, h * 0.5 - p.t * 30, fontPx(w, h) * 1.5, { color: PAL.sun });
        void Fz;
      },
    };
    function bike(g, x, y, sz, col, lean, kind, t, v, me) {
      if (jet) { g.save(); g.translate(x, y); g.rotate(lean * 0.12); const k = sz; ell(g, 0, 0, k * 0.4, k * 0.07, 'rgba(0,40,80,.25)'); g.fillStyle = col; g.strokeStyle = PAL.ink; g.lineWidth = Math.max(2, k * 0.03); g.beginPath(); g.moveTo(0, -k * 0.55); g.quadraticCurveTo(k * 0.36, -k * 0.2, k * 0.26, 0); g.lineTo(-k * 0.26, 0); g.quadraticCurveTo(-k * 0.36, -k * 0.2, 0, -k * 0.55); g.closePath(); g.fill(); g.stroke(); g.fillStyle = '#fff'; g.fillRect(-k * 0.05, -k * 0.5, k * 0.1, k * 0.45); A.mascot(g, 0, -k * 0.15, k * 0.6, { kind, pose: 'run', t: t * 0.4 }); if (v > 4) { g.fillStyle = 'rgba(255,255,255,.75)'; for (let i = 0; i < 8; i++) { const a = (t * 8 + i) % 1; g.beginPath(); g.arc((i % 2 ? 1 : -1) * k * (0.28 + a * 0.25), -k * 0.02 + a * k * 0.15, k * 0.04 * (1 - a) + 1, 0, TAU); g.fill(); } } g.restore(); return; }
      g.save(); g.translate(x, y); g.rotate(lean * 0.18); const k = sz; ell(g, 0, 0, k * 0.34, k * 0.06, 'rgba(0,0,0,.22)'); const sp = (t * (v || 0) * 0.8) % TAU;
      for (const dy of [0, -k * 0.5]) { g.save(); g.translate(0, -k * 0.16 + (dy ? 0 : 0)); g.restore(); }
      circ(g, 0, -k * 0.17, k * 0.17, null, PAL.ink, Math.max(2, k * 0.05)); g.strokeStyle = '#444'; g.lineWidth = 1.4; for (let i = 0; i < 3; i++) { const a = sp + i * Math.PI / 3; g.beginPath(); g.moveTo(Math.cos(a) * k * 0.17, -k * 0.17 + Math.sin(a) * k * 0.17); g.lineTo(-Math.cos(a) * k * 0.17, -k * 0.17 - Math.sin(a) * k * 0.17); g.stroke(); }
      g.strokeStyle = col; g.lineWidth = Math.max(3, k * 0.06); g.lineCap = 'round'; g.beginPath(); g.moveTo(0, -k * 0.17); g.lineTo(0, -k * 0.5); g.stroke(); A.mascot(g, 0, -k * 0.2, k * 0.78, { kind, pose: 'run', t: t * 0.5 }); g.restore();
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
