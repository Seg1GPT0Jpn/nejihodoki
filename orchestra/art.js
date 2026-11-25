// orchestra/art.js — draws the concert stage (original vector art; the players are plain shapes, no real people): the seating chart seen from above with the
// podium at the bottom, the sections reacting to what they play, entrance glows, the baton trail, the beat-pattern guide, the level meter and the score-follow bar.
// UMD: window.OrchArt. Everything is Canvas 2D in CSS pixels (the context is scaled by the device pixel ratio).
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OrchArt = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const TAU = Math.PI * 2;

  // The classic beat patterns as points the baton visits (x right, y down, 0..1 inside a small box)
  const PATTERNS = {
    1: [[0.5, 0.15], [0.5, 0.85]],
    2: [[0.5, 0.15], [0.5, 0.88], [0.78, 0.4]],
    3: [[0.5, 0.15], [0.5, 0.88], [0.86, 0.6], [0.78, 0.3]],
    4: [[0.5, 0.15], [0.5, 0.88], [0.14, 0.62], [0.86, 0.62], [0.6, 0.25]],
  };
  const BEATPOINT = { 1: [1], 2: [1, 2], 3: [1, 2, 3], 4: [1, 2, 3, 4] };

  function pal(dark) {
    return dark
      ? { bg0: '#1b1015', bg1: '#2a1820', floor0: '#3a2428', floor1: '#251419', rim: 'rgba(255,214,150,.22)', ink: '#f6ecdf', dim: 'rgba(246,236,223,.62)', podium: '#5b2a2f', podiumTop: '#7a3a40',
          gold: '#ffcf6a', good: '#7be0a0', bad: '#ff8f80', panel: 'rgba(0,0,0,.34)', line: 'rgba(255,255,255,.2)', trail: '255,236,190', seat: 0.62, stand: 'rgba(255,255,255,.22)' }
      : { bg0: '#f6ecdf', bg1: '#e9d8c3', floor0: '#d9bf9f', floor1: '#c9aa86', rim: 'rgba(90,40,30,.28)', ink: '#2c1a14', dim: 'rgba(44,26,20,.66)', podium: '#8a3b3f', podiumTop: '#a8494e',
          gold: '#b8780a', good: '#2c8a52', bad: '#c2412a', panel: 'rgba(255,255,255,.55)', line: 'rgba(60,30,20,.25)', trail: '120,60,30', seat: 0.5, stand: 'rgba(60,30,20,.3)' };
  }
  const hsl = (h, s, l, a) => 'hsla(' + h + ',' + s + '%,' + l + '%,' + (a == null ? 1 : a) + ')';

  function create(canvas, o) {
    const ctx = canvas.getContext('2d');
    const A = { W: 0, H: 0, dpr: 1, cfg: Object.assign({ dark: true, en: false, reduced: false, T: s => s }, o || {}), seats: {}, barRect: null, stageH: 0 };
    A.setCfg = c => Object.assign(A.cfg, c);
    A.resize = function (w, h, dpr) {
      A.dpr = dpr || (typeof devicePixelRatio === 'number' ? Math.min(2.5, devicePixelRatio) : 1);
      A.W = Math.max(160, Math.round(w)); A.H = Math.max(160, Math.round(h));
      canvas.width = Math.round(A.W * A.dpr); canvas.height = Math.round(A.H * A.dpr); canvas.style.width = A.W + 'px'; canvas.style.height = A.H + 'px';
      A.barH = clamp(Math.round(A.H * 0.15), 50, 84); A.stageH = A.H - A.barH; A.scale = Math.min(A.W, A.stageH);
    };
    // seat positions in CSS pixels for the given sections definitions
    A.layout = function (secs) {
      A.seats = {};
      const narrow = A.W < 430; let wi = 0;
      secs.forEach(s => {
        const d = s.def; if (!d) return;
        // on a narrow screen the four woodwinds would sit side by side on top of each other: stagger them up and down
        let dy = 0; if (narrow && /^(fl|ob|cl|fg)$/.test(d.inst)) { dy = (wi++ % 2 ? 0.05 : -0.035); }
        A.seats[s.id] = { id: s.id, x: d.x * A.W, y: 0.06 * A.stageH + (d.y + dy) * A.stageH * 0.92, hue: d.hue, n: d.n, inst: d.inst, def: d, r: Math.max(10, Math.min(A.W, A.stageH) * 0.075) };
      });
      A.podium = { x: A.W * 0.5, y: A.stageH * 0.94 };
    };
    A.hit = function (x, y) {
      let best = null, bd = 1e9; const lim = Math.max(30, A.scale * 0.11);
      for (const id in A.seats) { const s = A.seats[id], d = Math.hypot(s.x - x, s.y - y); if (d < lim && d < bd) { bd = d; best = id; } }
      return best;
    };
    A.seatList = () => Object.keys(A.seats).map(k => A.seats[k]);

    // ---- one section ------------------------------------------------------------------------------------------------------------------------
    function drawSection(s, st, c, time) {
      const act = st.act[s.id] || 0, glow = st.glow[s.id] || null, n = s.n, R = s.r;
      const sat = st.dark ? 52 : 46, light = st.dark ? 56 : 46;
      const wob = A.cfg.reduced ? 0 : 1;
      // cluster of players on an arc facing the podium
      const cols = n <= 2 ? n : n <= 4 ? 2 : n <= 8 ? 4 : 4, rows = Math.ceil(n / cols), pr = Math.min(R * 0.34, A.W * 0.0165);
      ctx.save();
      // pad under the section
      ctx.fillStyle = hsl(s.hue, 30, st.dark ? 20 : 78, 0.55); ctx.strokeStyle = hsl(s.hue, 35, st.dark ? 55 : 40, 0.5); ctx.lineWidth = 1;
      const pw = (cols * pr * 2.5 + pr), ph = (rows * pr * 2.5 + pr * 1.2);
      roundRect(ctx, s.x - pw / 2, s.y - ph / 2, pw, ph, pr);
      ctx.fill(); ctx.stroke();
      for (let i = 0; i < n; i++) {
        const cx = s.x + ((i % cols) - (Math.min(cols, n - Math.floor(i / cols) * cols) - 1) / 2) * pr * 2.5, cy = s.y + (Math.floor(i / cols) - (rows - 1) / 2) * pr * 2.5;
        const bob = wob * Math.sin(time * 6.2 + i * 1.7 + s.hue) * act * pr * 0.42, sway = wob * Math.sin(time * 4.1 + i * 2.3) * act * pr * 0.5;
        // stand
        ctx.fillStyle = st.pal.stand; ctx.fillRect(cx - pr * 0.55, cy - pr * 1.18, pr * 1.1, pr * 0.34);
        // body (shoulders) and head
        ctx.fillStyle = hsl(s.hue, sat, light - 14, 1); ctx.beginPath(); ctx.ellipse(cx + sway * 0.4, cy + pr * 0.35 + bob, pr * 1.0, pr * 0.75, 0, 0, TAU); ctx.fill();
        ctx.fillStyle = hsl(s.hue, sat - 10, light + 10 + act * 14, 1); ctx.beginPath(); ctx.arc(cx + sway * 0.4, cy - pr * 0.18 + bob, pr * 0.62, 0, TAU); ctx.fill();
        // the instrument
        ctx.strokeStyle = hsl(s.hue, 70, st.dark ? 80 : 30, 0.95); ctx.lineWidth = Math.max(1.2, pr * 0.16); ctx.lineCap = 'round';
        ctx.beginPath();
        const ang = -0.6 + sway * 0.08;
        if (s.inst === 'vln' || s.inst === 'vla') { ctx.moveTo(cx - pr * 1.1, cy + pr * 0.1 + bob); ctx.lineTo(cx + pr * 1.1, cy - pr * (0.1 + 0.9 * act * Math.sin(time * 9 + i)) + bob); }
        else if (s.inst === 'vc' || s.inst === 'cb') { ctx.moveTo(cx - pr * 1.0, cy + pr * 0.9); ctx.lineTo(cx + pr * 0.2 + sway * 0.3, cy - pr * 0.1 + bob); }
        else if (s.inst === 'timp' || s.inst === 'bd') { ctx.arc(cx, cy + pr * 0.3, pr * 1.15, 0, TAU); }
        else { ctx.moveTo(cx, cy + pr * 0.1 + bob); ctx.lineTo(cx + Math.cos(ang) * pr * 1.5, cy + Math.sin(ang) * pr * 1.5 + bob); }
        ctx.stroke();
      }
      // label
      const ab = A.cfg.en ? s.def.ab.en : s.def.ab.ja;
      ctx.font = '800 ' + Math.max(9, Math.round(A.scale * 0.03)) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'top';
      ctx.fillStyle = st.pal.dim; ctx.fillText(st.keys[s.id] ? st.keys[s.id] + ' ' + ab : ab, s.x, s.y + ph / 2 + 1);
      // activity ring
      if (act > 0.05) { ctx.strokeStyle = hsl(s.hue, 75, st.dark ? 68 : 40, act * 0.55); ctx.lineWidth = 2; roundRect(ctx, s.x - pw / 2 - 2, s.y - ph / 2 - 2, pw + 4, ph + 4, pr + 2); ctx.stroke(); }
      // cue glow / result flash
      if (glow) {
        const k = glow.k;
        if (glow.kind === 'cue') {
          const pulse = 0.5 + 0.5 * Math.sin(time * 9);
          ctx.strokeStyle = st.pal.gold; ctx.lineWidth = 3 + pulse * 2; ctx.globalAlpha = 0.55 + 0.45 * pulse;
          roundRect(ctx, s.x - pw / 2 - 5, s.y - ph / 2 - 5, pw + 10, ph + 10, pr + 5); ctx.stroke(); ctx.globalAlpha = 1;
          // shrinking arc = how long until the entrance
          ctx.beginPath(); ctx.strokeStyle = st.pal.ink; ctx.lineWidth = 3; ctx.arc(s.x, s.y - ph / 2 - pr * 1.6, pr * 1.0, -Math.PI / 2, -Math.PI / 2 + TAU * clamp(k, 0, 1)); ctx.stroke();
          ctx.fillStyle = st.pal.gold; ctx.beginPath(); ctx.moveTo(s.x - pr * 0.5, s.y - ph / 2 - pr * 2.9); ctx.lineTo(s.x + pr * 0.5, s.y - ph / 2 - pr * 2.9); ctx.lineTo(s.x, s.y - ph / 2 - pr * 2.2); ctx.closePath(); ctx.fill();
        } else {
          ctx.globalAlpha = clamp(glow.k, 0, 1); ctx.strokeStyle = glow.kind === 'good' ? st.pal.good : st.pal.bad; ctx.lineWidth = 4; roundRect(ctx, s.x - pw / 2 - 4, s.y - ph / 2 - 4, pw + 8, ph + 8, pr + 4); ctx.stroke(); ctx.globalAlpha = 1;
        }
      }
      ctx.restore();
    }
    function roundRect(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

    // ---- the beat pattern guide ---------------------------------------------------------------------------------------------------------------
    function drawPattern(st, c) {
      const w = Math.min(64, A.scale * 0.2), h = Math.min(78, A.scale * 0.24), pat = PATTERNS[st.pattern] || PATTERNS[2], bx = Math.max(6, A.podium.x - 34 - 8 - w), by = A.stageH - h - 6;
      ctx.save(); ctx.fillStyle = st.pal.panel; roundRect(ctx, bx, by, w, h, 10); ctx.fill();
      const P = pat.map(p => [bx + 8 + p[0] * (w - 16), by + 6 + p[1] * (h - 22)]);
      ctx.strokeStyle = st.pal.line; ctx.lineWidth = 1.5; ctx.beginPath(); P.forEach((p, i) => (i ? ctx.lineTo(p[0], p[1]) : ctx.moveTo(p[0], p[1]))); ctx.stroke();
      const nb = st.pattern;
      for (let i = 0; i < nb; i++) {
        const q = P[Math.min(P.length - 1, i + 1)], on = i === st.beatInBar;
        ctx.fillStyle = on ? st.pal.gold : st.pal.dim; ctx.beginPath(); ctx.arc(q[0], q[1], on ? 5.5 : 3.4, 0, TAU); ctx.fill();
      }
      ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.fillStyle = st.pal.ink; ctx.textBaseline = 'bottom';
      ctx.fillText(st.pattern + ' · ' + (st.beatInBar + 1), bx + w / 2, by + h - 2);
      ctx.restore();
    }

    // ---- level meter --------------------------------------------------------------------------------------------------------------------------------
    const METER_MARKS = [['ppp', 0.07], ['pp', 0.19], ['p', 0.30], ['mp', 0.40], ['mf', 0.50], ['f', 0.65], ['ff', 0.88]]; // the levels the strokes map to (engine.js Dynamics)
    function drawMeter(st) {
      const w = 12, x = A.W - w - 8, h = Math.min(A.stageH * 0.34, 170), y = A.stageH * 0.56;
      ctx.save(); ctx.fillStyle = st.pal.panel; roundRect(ctx, x - 3, y - 3, w + 6, h + 6, 8); ctx.fill();
      const lv = clamp(st.level, 0, 1), tg = clamp(st.target, 0, 1);
      const near = Math.abs(lv - tg) < 0.14 * st.tol;
      ctx.fillStyle = near ? st.pal.good : st.pal.gold; const fh = h * lv; roundRect(ctx, x, y + h - fh, w, Math.max(2, fh), 4); ctx.fill();
      // the scale ppp..ff (so players can learn the range), the current mark in bold
      ctx.font = '700 9px system-ui, sans-serif'; ctx.textAlign = 'left'; ctx.textBaseline = 'middle';
      METER_MARKS.forEach(m => { const my = y + h - h * m[1], cur = st.curMark === m[0]; ctx.fillStyle = st.pal.ink; ctx.globalAlpha = cur ? 1 : 0.5; ctx.fillRect(x + w - 3, my - 0.5, 3, 1); if (cur) { ctx.font = '900 10px system-ui, sans-serif'; } ctx.fillText(m[0], x + w + 4 > A.W - 20 ? x : x, my - (cur ? 0 : 0)); ctx.font = '700 9px system-ui, sans-serif'; });
      ctx.globalAlpha = 1;
      ctx.strokeStyle = st.pal.ink; ctx.lineWidth = 2.5; ctx.beginPath(); ctx.moveTo(x - 6, y + h - h * tg); ctx.lineTo(x + w + 6, y + h - h * tg); ctx.stroke();
      ctx.font = '800 11px system-ui, sans-serif'; ctx.textAlign = 'right'; ctx.textBaseline = 'middle'; ctx.fillStyle = st.pal.ink; ctx.fillText(st.mark, x - 9, y + h - h * tg);
      if (st.curMark) { ctx.font = '900 12px system-ui, sans-serif'; ctx.fillStyle = near ? st.pal.good : st.pal.gold; ctx.textAlign = 'center'; ctx.textBaseline = 'top'; ctx.fillText(st.curMark, x + w / 2, y + h + 6); }
      ctx.restore();
    }

    // ---- score-follow bar ---------------------------------------------------------------------------------------------------------------------------
    function drawBar(st) {
      const y0 = A.stageH, h = A.barH, pad = 8, w = A.W - pad * 2, x0 = pad;
      ctx.save(); ctx.fillStyle = st.pal.panel; ctx.fillRect(0, y0, A.W, h);
      const d = st.dyn || '', nB = Math.max(1, d.length), bw = Math.max(1.5, w / nB), top = y0 + 16, bh = h - 28, pos = clamp(st.pos / nB, 0, 1);
      const step = Math.max(1, Math.floor(nB / (w / 2.4)));
      for (let b = 0; b < nB; b += step) {
        let g = 0; for (let k = 0; k < step && b + k < nB; k++) g = Math.max(g, d.charCodeAt(b + k) - 48);
        const x = x0 + (b / nB) * w, hh = (g + 1) / 9 * bh, played = (b + step) / nB <= pos;
        ctx.fillStyle = played ? 'rgba(255,200,100,.28)' : 'rgba(255,200,100,.55)'; if (!st.dark) ctx.fillStyle = played ? 'rgba(150,80,30,.25)' : 'rgba(150,80,30,.5)';
        ctx.fillRect(x, top + bh - hh, Math.max(1, (w / nB) * step - 0.6), hh);
      }
      // what the player did
      if (st.hist && st.hist.length) {
        ctx.strokeStyle = st.pal.ink; ctx.lineWidth = 1.6; ctx.beginPath(); let started = false;
        st.hist.forEach((v, b) => { if (v == null) return; const x = x0 + ((b + 0.5) / nB) * w, y = top + bh - clamp(v, 0, 1) * bh; if (!started) { ctx.moveTo(x, y); started = true; } else ctx.lineTo(x, y); });
        ctx.stroke();
      }
      // cue marks (a little flag in the section's colour)
      (st.cues || []).forEach(c => {
        const x = x0 + (c.b / nB) * w, h0 = st.secHue[c.secs[0]] != null ? st.secHue[c.secs[0]] : 40;
        ctx.fillStyle = c.q != null ? (c.q >= 0.45 ? st.pal.good : st.pal.bad) : hsl(h0, 70, st.dark ? 62 : 42, 1);
        ctx.beginPath(); ctx.moveTo(x, y0 + 3); ctx.lineTo(x + 5, y0 + 9); ctx.lineTo(x - 5, y0 + 9); ctx.closePath(); ctx.fill();
      });
      // playhead
      const px = x0 + pos * w; ctx.fillStyle = st.pal.ink; ctx.fillRect(px - 1, y0 + 4, 2, h - 8);
      ctx.font = '800 11px system-ui, sans-serif'; ctx.textBaseline = 'bottom'; ctx.fillStyle = st.pal.dim; ctx.textAlign = 'left'; ctx.fillText(st.barText, x0, y0 + h - 2);
      ctx.textAlign = 'right'; ctx.fillText(st.timeText, A.W - pad, y0 + h - 2);
      ctx.restore();
    }

    // ---- baton --------------------------------------------------------------------------------------------------------------------------------------------
    function drawBaton(st) {
      const tr = st.trail; if (!tr || tr.length < 2) return;
      ctx.save(); ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (let i = 1; i < tr.length; i++) {
        const a = tr[i - 1], b = tr[i], age = (st.now - b.t); const al = clamp(1 - age / 0.9, 0, 1); if (al <= 0) continue;
        ctx.strokeStyle = 'rgba(' + st.pal.trail + ',' + (al * 0.8) + ')'; ctx.lineWidth = 1 + 4 * al; ctx.beginPath(); ctx.moveTo(a.x, a.y); ctx.lineTo(b.x, b.y); ctx.stroke();
      }
      const t = tr[tr.length - 1];
      if (st.now - t.t < 1.2) {
        const p = tr[Math.max(0, tr.length - 6)]; let dx = t.x - p.x, dy = t.y - p.y; const L = Math.hypot(dx, dy) || 1; dx /= L; dy /= L;
        ctx.strokeStyle = st.dark ? '#fff7e6' : '#3a2018'; ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(t.x - dx * 46, t.y - dy * 46); ctx.lineTo(t.x, t.y); ctx.stroke();
        ctx.fillStyle = st.pal.gold; ctx.beginPath(); ctx.arc(t.x, t.y, 5, 0, TAU); ctx.fill();
      }
      ctx.restore();
    }

    // ---- everything -----------------------------------------------------------------------------------------------------------------------------------
    // st: see index.html (act, glow, keys, level, target, mark, pattern, beatInBar, trail, dyn, hist, cues, pos, barText, timeText, hint, ...)
    A.draw = function (st) {
      const c = ctx, W = A.W, H = A.H, time = st.now; st.pal = pal(st.dark); st.dark = !!st.dark;
      c.setTransform(A.dpr, 0, 0, A.dpr, 0, 0);
      // hall
      const g = c.createLinearGradient(0, 0, 0, A.stageH); g.addColorStop(0, st.pal.bg0); g.addColorStop(1, st.pal.bg1); c.fillStyle = g; c.fillRect(0, 0, W, A.stageH);
      // the stage floor: a wide arc around the podium
      const cx = W / 2, cy = A.stageH * 0.98, rx = W * 0.62, ry = A.stageH * 0.98;
      const fg = c.createRadialGradient(cx, cy, 10, cx, cy, ry); fg.addColorStop(0, st.pal.floor0); fg.addColorStop(1, st.pal.floor1);
      c.fillStyle = fg; c.beginPath(); c.ellipse(cx, cy, rx, ry, 0, Math.PI, TAU); c.fill();
      c.strokeStyle = st.pal.rim; c.lineWidth = 2; c.stroke();
      c.strokeStyle = st.pal.line; c.lineWidth = 1; for (let i = 1; i <= 3; i++) { c.beginPath(); c.ellipse(cx, cy, rx * i / 3.6, ry * i / 3.6, 0, Math.PI, TAU); c.stroke(); }
      // sections, back rows first
      const order = A.seatList().sort((p, q) => p.y - q.y);
      order.forEach(s => drawSection(s, st, c, time));
      // podium
      const p = A.podium; c.fillStyle = st.pal.podium; roundRect(c, p.x - 34, p.y - 10, 68, 22, 8); c.fill(); c.fillStyle = st.pal.podiumTop; roundRect(c, p.x - 34, p.y - 14, 68, 12, 6); c.fill();
      if (st.silhouette) { c.fillStyle = st.dark ? '#120a0d' : '#3a2018'; c.beginPath(); c.arc(p.x, p.y - 38, 9, 0, TAU); c.fill(); c.beginPath(); c.ellipse(p.x, p.y - 17, 14, 14, 0, Math.PI, TAU); c.fill(); }
      drawPattern(st, c); drawMeter(st); drawBaton(st);
      // centre message
      if (st.msg) {
        c.save(); c.font = '800 ' + Math.max(14, Math.round(A.scale * 0.045)) + 'px system-ui, sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        const lines = String(st.msg).split('\n'), lh = Math.max(18, A.scale * 0.058), tw = Math.max(...lines.map(l => c.measureText(l).width)) + 28, th = lines.length * lh + 14, yy = A.stageH * 0.5;
        c.fillStyle = st.dark ? 'rgba(10,5,8,.72)' : 'rgba(255,250,240,.86)'; roundRect(c, W / 2 - tw / 2, yy - th / 2, tw, th, 14); c.fill();
        c.fillStyle = st.pal.ink; lines.forEach((l, i) => c.fillText(l, W / 2, yy - th / 2 + 7 + lh * (i + 0.5))); c.restore();
      }
      drawBar(st);
    };
    return A;
  }
  return { create, PATTERNS, BEATPOINT, hsl };
});
