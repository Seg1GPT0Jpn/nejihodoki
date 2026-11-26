// ぴょんぴょん冒険: all art is drawn here with canvas paths (no images). A cheerful patchwork-felt look: soft colors, dark outlines, stitches.
//   HopArt.draw(ctx, S, o)   o = { w, h, sc, t, theme, fx, dark }   draws the whole frame (background, tiles, things, hero, particles)
//   HopArt.feed(fx, S)       turns S.ev (engine events) into particles; HopArt.Fx is the pool
(function (root) {
  'use strict';
  const TS = 16;
  const E = root.HopEngine || (typeof require === 'function' ? require('./engine.js') : null);
  const T = E.T;
  const TAU = Math.PI * 2;
  const THEMES = {
    meadow: { top: '#79c8ff', bot: '#eaf9ff', far: '#a9e0b0', mid: '#7ccf86', near: '#5db96a', gTop: '#5ec45f', gTop2: '#47a84a', gFill: '#c98b57', gDark: '#a56a3c', stitch: '#f6e6c4', ink: '#4a3326', brick: '#e8836b', cloud: '#ffffff', deco: 'flower' },
    factory: { top: '#9db4c9', bot: '#e6dfd0', far: '#b9b3a8', mid: '#9aa5b3', near: '#7d8a9c', gTop: '#8d9db0', gTop2: '#74859a', gFill: '#667488', gDark: '#4e5a6c', stitch: '#ffd75e', ink: '#2c3340', brick: '#e0a040', cloud: '#f2efe6', deco: 'gear' },
    bath: { top: '#69d0ee', bot: '#e8fbff', far: '#b8ecf5', mid: '#8bd9ea', near: '#62c4dc', gTop: '#f4a6c0', gTop2: '#e386a6', gFill: '#f3d9c4', gDark: '#d7b79e', stitch: '#ffffff', ink: '#3a4a60', brick: '#ffcf5e', cloud: '#ffffff', deco: 'bubble' },
    snow: { top: '#a8c7f5', bot: '#f4f8ff', far: '#dce8fb', mid: '#c4d7f3', near: '#a9c0e6', gTop: '#ffffff', gTop2: '#dfeaf9', gFill: '#a8b8d6', gDark: '#8497bd', stitch: '#ffffff', ink: '#31426a', brick: '#8fb0e8', cloud: '#ffffff', deco: 'snow' },
    night: { top: '#1d1f4a', bot: '#4b4a8c', far: '#34336f', mid: '#2a2a5e', near: '#202049', gTop: '#6c5aa8', gTop2: '#58478f', gFill: '#3b3478', gDark: '#2b2660', stitch: '#ffd96b', ink: '#0d0d26', brick: '#9a6fd6', cloud: '#5e5ca8', deco: 'star' },
    atelier: { top: '#ffc98a', bot: '#fff1d6', far: '#f3b88d', mid: '#e79d78', near: '#d4856a', gTop: '#e7b04a', gTop2: '#cf9632', gFill: '#a8693c', gDark: '#85502c', stitch: '#fff3c9', ink: '#4a2a1a', brick: '#d9604c', cloud: '#fff7e6', deco: 'screw' },
  };
  const hash = (x, y) => { let h = (x * 374761393 + y * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };
  const sn = a => Math.sin(a);

  // ---- tiny helpers
  function rr(c, x, y, w, h, r) { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }
  function ell(c, x, y, rx, ry) { c.beginPath(); c.ellipse(x, y, Math.max(0.1, rx), Math.max(0.1, ry), 0, 0, TAU); }
  function fs(c, fill, stroke, lw) { if (fill) { c.fillStyle = fill; c.fill(); } if (stroke) { c.strokeStyle = stroke; c.lineWidth = lw || 1; c.stroke(); } }
  function stitchLine(c, x0, y0, x1, y1, col) { c.save(); c.strokeStyle = col; c.lineWidth = 0.8; c.setLineDash([2, 2]); c.beginPath(); c.moveTo(x0, y0); c.lineTo(x1, y1); c.stroke(); c.restore(); }
  function eyes(c, x, y, gap, r, look, blink) {
    for (const s of [-1, 1]) {
      const ex = x + s * gap;
      if (blink) { c.strokeStyle = '#2a2018'; c.lineWidth = 1; c.beginPath(); c.moveTo(ex - r, y); c.lineTo(ex + r, y); c.stroke(); continue; }
      ell(c, ex, y, r, r * 1.15); fs(c, '#fff', '#2a2018', 0.7);
      ell(c, ex + (look || 0) * r * 0.5, y + r * 0.1, r * 0.5, r * 0.6); fs(c, '#2a2018');
    }
  }

  // ---- backgrounds
  function sky(c, th, w, h, camx, t, dark) {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, th.top); g.addColorStop(1, th.bot);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
    const deco = th.deco;
    // far layer
    c.save(); c.fillStyle = th.far;
    if (deco === 'gear') {
      for (let i = -1; i < w / 90 + 2; i++) { const x = i * 90 - (camx * 0.15) % 90, k = Math.floor((i * 90 + camx * 0.15) / 90); const r = 26 + hash(k, 3) * 24, gy = 70 + hash(k, 5) * 70; gear(c, x + 40, gy, r, t * (hash(k, 7) > 0.5 ? 0.01 : -0.012), th.far, 0.9); }
    } else if (deco === 'star') {
      c.fillStyle = '#fff'; for (let i = 0; i < 40; i++) { const x = (hash(i, 1) * (w + 200) - camx * 0.05 * (1 + hash(i, 2))) % (w + 40); const px = x < 0 ? x + w + 40 : x; c.globalAlpha = 0.4 + 0.5 * Math.abs(sn(t * 0.03 + i)); c.fillRect(px, hash(i, 4) * h * 0.7, 1.3, 1.3); } c.globalAlpha = 1;
    } else {
      c.beginPath(); c.moveTo(0, h);
      for (let x = 0; x <= w + 10; x += 8) { const wx = x + camx * 0.2; c.lineTo(x, h * 0.72 - 24 - sn(wx * 0.011) * 18 - sn(wx * 0.027 + 1) * 8); }
      c.lineTo(w, h); c.closePath(); c.fill();
    }
    c.restore();
    // clouds / snow / bubbles
    c.fillStyle = th.cloud; c.globalAlpha = deco === 'star' ? 0.5 : 0.85;
    for (let i = 0; i < 6; i++) { const span = w + 120, x = ((hash(i, 11) * span * 1.5 - camx * 0.1 - t * (0.05 + hash(i, 12) * 0.05)) % span + span) % span - 60, y = 14 + hash(i, 13) * 52; cloud(c, x, y, 18 + hash(i, 14) * 14); }
    c.globalAlpha = 1;
    // mid layer
    c.fillStyle = th.mid; c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w + 10; x += 8) { const wx = x + camx * 0.4; c.lineTo(x, h * 0.78 - 10 - sn(wx * 0.018 + 2) * 10 - (deco === 'gear' ? Math.abs(sn(wx * 0.05)) * 10 : 0)); }
    c.lineTo(w, h); c.closePath(); c.fill();
    c.fillStyle = th.near; c.beginPath(); c.moveTo(0, h);
    for (let x = 0; x <= w + 10; x += 6) { const wx = x + camx * 0.65; c.lineTo(x, h * 0.9 - 8 - sn(wx * 0.03 + 4) * 6); }
    c.lineTo(w, h); c.closePath(); c.fill();
    if (dark) { c.fillStyle = 'rgba(0,0,20,.18)'; c.fillRect(0, 0, w, h); }
  }
  function cloud(c, x, y, r) { c.beginPath(); c.arc(x, y, r * 0.6, 0, TAU); c.arc(x + r * 0.7, y + 3, r * 0.5, 0, TAU); c.arc(x - r * 0.7, y + 4, r * 0.45, 0, TAU); c.fill(); }
  function gear(c, x, y, r, a, col, al) {
    c.save(); c.translate(x, y); c.rotate(a); c.fillStyle = col; c.globalAlpha = al || 1; c.beginPath();
    const n = 10; for (let i = 0; i < n; i++) { const a0 = i / n * TAU, a1 = (i + 0.5) / n * TAU; c.lineTo(Math.cos(a0) * r * 1.15, Math.sin(a0) * r * 1.15); c.lineTo(Math.cos(a1) * r * 1.15, Math.sin(a1) * r * 1.15); c.lineTo(Math.cos(a1) * r * 0.9, Math.sin(a1) * r * 0.9); c.lineTo(Math.cos(a1 + 0.2) * r * 0.9, Math.sin(a1 + 0.2) * r * 0.9); }
    c.closePath(); c.moveTo(r * 0.35, 0); c.arc(0, 0, r * 0.35, 0, TAU, true); c.fill('evenodd'); c.restore();
  }

  // ---- tiles
  function solidish(S, tx, ty) { const t = E.tl(S, tx, ty); return t === T.GROUND || t === T.ICE || t === T.BRICK || t === T.USED || t === T.QBLK || t === T.GBLK || t === T.FAKE || t === T.CONVR || t === T.CONVL || t === T.SPRING || t === T.GATE; }
  function drawTile(c, S, th, tx, ty, t, o) {
    const x = tx * TS, y = ty * TS, f = o.t;
    switch (t) {
      case T.GROUND: case T.FAKE: {
        c.fillStyle = th.gFill; c.fillRect(x, y, TS, TS);
        const up = solidish(S, tx, ty - 1) && E.tl(S, tx, ty - 1) !== T.GATE;
        if (!up) {
          c.fillStyle = th.gTop; c.fillRect(x, y, TS, 5);
          c.fillStyle = th.gTop2; c.fillRect(x, y + 4, TS, 1.5);
          if (th.deco === 'gear') { c.fillStyle = '#e7edf5'; c.beginPath(); c.arc(x + 3, y + 2.5, 0.9, 0, TAU); c.arc(x + 13, y + 2.5, 0.9, 0, TAU); c.fill(); }
          else { c.fillStyle = th.gTop; for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(x + 2.5 + i * 5.5, y + 5, 2.5, 0, TAU); c.fill(); } }
          stitchLine(c, x + 1, y + 8, x + 15, y + 8, th.stitch);
        } else if (hash(tx, ty) > 0.82) { c.fillStyle = th.gDark; c.beginPath(); c.arc(x + 4 + hash(ty, tx) * 8, y + 5 + hash(tx, tx) * 7, 1.6, 0, TAU); c.fill(); }
        if (!solidish(S, tx - 1, ty)) { c.fillStyle = th.gDark; c.fillRect(x, y, 1, TS); }
        if (!solidish(S, tx + 1, ty)) { c.fillStyle = th.gDark; c.fillRect(x + 15, y, 1, TS); }
        break;
      }
      case T.ICE: {
        c.fillStyle = '#bfe8ff'; c.fillRect(x, y, TS, TS); c.fillStyle = '#e8f8ff'; c.fillRect(x, y, TS, 4); c.strokeStyle = 'rgba(255,255,255,.9)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 3, y + 12); c.lineTo(x + 9, y + 6); c.moveTo(x + 8, y + 13); c.lineTo(x + 12, y + 9); c.stroke(); break;
      }
      case T.BRICK: patch(c, x, y, th.brick, th); break;
      case T.QBLK: case T.GBLK: {
        const b = S.bump && S.bump.x === tx && S.bump.y === ty && f - S.bump.f < 8 ? -Math.sin((f - S.bump.f) / 8 * Math.PI) * 4 : 0;
        const q = t === T.QBLK;
        rr(c, x + 0.5, y + 0.5 + b, 15, 15, 3); fs(c, q ? '#ffd24a' : '#6fd3c2', th.ink, 1);
        stitchLine(c, x + 3, y + 3 + b, x + 13, y + 3 + b, '#fff8d8'); stitchLine(c, x + 3, y + 13 + b, x + 13, y + 13 + b, '#fff8d8');
        c.fillStyle = th.ink; c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
        if (q) c.fillText('?', x + 8, y + 8.5 + b); else { // gift ribbon
          c.strokeStyle = '#ff6b8b'; c.lineWidth = 2; c.beginPath(); c.moveTo(x + 8, y + 3 + b); c.lineTo(x + 8, y + 13 + b); c.moveTo(x + 3, y + 8 + b); c.lineTo(x + 13, y + 8 + b); c.stroke(); ell(c, x + 6, y + 4 + b, 2, 1.5); fs(c, '#ff6b8b'); ell(c, x + 10, y + 4 + b, 2, 1.5); fs(c, '#ff6b8b');
        }
        break;
      }
      case T.USED: rr(c, x + 0.5, y + 0.5, 15, 15, 3); fs(c, '#a98466', th.ink, 1); stitchLine(c, x + 3, y + 3, x + 13, y + 3, '#d8bc9d'); break;
      case T.ONEWAY: { c.fillStyle = '#d9a566'; c.fillRect(x, y, TS, 5); c.strokeStyle = th.ink; c.lineWidth = 0.8; c.strokeRect(x + 0.4, y + 0.4, TS - 0.8, 4.2); stitchLine(c, x + 2, y + 2.5, x + 14, y + 2.5, '#fff1d0'); break; }
      case T.SPIKE: { c.fillStyle = '#9aa3b2'; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(x + i * 5.3, y + 16); c.lineTo(x + i * 5.3 + 2.7, y + 6); c.lineTo(x + i * 5.3 + 5.3, y + 16); c.closePath(); fs(c, '#c3cad6', th.ink, 0.8); } break; }
      case T.CSPIKE: { for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(x + i * 5.3, y); c.lineTo(x + i * 5.3 + 2.7, y + 10); c.lineTo(x + i * 5.3 + 5.3, y); c.closePath(); fs(c, '#c3cad6', th.ink, 0.8); } break; }
      case T.SPRING: {
        const comp = S.sprAt && S.sprAt.x === tx && S.sprAt.y === ty && f - S.sprAt.f < 8 ? 1 : 0;
        c.fillStyle = '#6a7388'; c.fillRect(x, y + 12, TS, 4);
        c.strokeStyle = '#d6dbe6'; c.lineWidth = 1.6; c.beginPath(); const top = y + (comp ? 8 : 4);
        for (let i = 0; i < 4; i++) { const yy = top + (12 - (top - y)) * i / 3; c.moveTo(x + 3, yy); c.lineTo(x + 13, yy + 1.2); }
        c.stroke(); rr(c, x + 1, top - 3, 14, 3.5, 1.5); fs(c, '#ff5d73', th.ink, 0.8); break;
      }
      case T.CONVR: case T.CONVL: {
        c.fillStyle = th.gFill; c.fillRect(x, y, TS, TS); c.fillStyle = '#3b4352'; c.fillRect(x, y, TS, 6); c.strokeStyle = '#ffd75e'; c.lineWidth = 1.4;
        const d = t === T.CONVR ? 1 : -1, off = ((f * 0.3 * d) % 8 + 8) % 8;
        c.beginPath(); for (let k = -1; k < 3; k++) { const cx = x + k * 8 + off; c.moveTo(cx - d * 1.5, y + 1.5); c.lineTo(cx + d * 1.5, y + 3); c.lineTo(cx - d * 1.5, y + 4.5); } c.stroke();
        break;
      }
      case T.COIN: { const w = Math.abs(Math.cos((f + tx * 5) * 0.08)); ell(c, x + 8, y + 8 + Math.sin((f + tx * 9) * 0.07) * 0.8, 1.5 + 4.5 * w, 5.5); fs(c, '#ffd23f', '#b07a00', 0.9); if (w > 0.5) { c.fillStyle = '#fff3a8'; c.fillRect(x + 7, y + 5, 1.5, 6); } break; }
      case T.MEDAL: {
        const got = o.medGot && o.medGot[S.L.medals.findIndex(m => m.x === tx && m.y === ty)];
        const bob = Math.sin(f * 0.06 + tx) * 1.5;
        c.save(); c.translate(x + 8, y + 8 + bob); c.rotate(Math.sin(f * 0.05) * 0.12);
        c.fillStyle = '#ff6f91'; c.beginPath(); c.moveTo(-4, 2); c.lineTo(-6, 9); c.lineTo(-3, 7.5); c.lineTo(-1, 9.5); c.lineTo(0, 3); c.fill(); c.beginPath(); c.moveTo(4, 2); c.lineTo(6, 9); c.lineTo(3, 7.5); c.lineTo(1, 9.5); c.lineTo(0, 3); c.fill();
        starPath(c, 0, -1, 7, 3.4, 5); fs(c, '#ffe066', '#b07a00', 1); ell(c, 0, -1, 2, 2); fs(c, '#fff6b8'); c.restore(); break;
      }
      case T.HEART: { puff(c, x + 8, y + 8 + Math.sin(f * 0.07 + tx) * 1.5, 6.5, f); break; }
      case T.CP: {
        const on = S.L.cps.findIndex(q => q.x === tx && q.y === ty) <= S.cpIdx;
        c.fillStyle = '#8a6a4a'; c.fillRect(x + 7, y - 4, 2, 20);
        c.beginPath(); c.moveTo(x + 9, y - 3); c.lineTo(x + 9 + 9, y - 3 + (on ? Math.sin(f * 0.15) * 1 + 3 : 7)); c.lineTo(x + 9, y + 5 + (on ? 0 : 3)); c.closePath(); fs(c, on ? '#4fd36b' : '#b9bfcb', th.ink, 0.8); break;
      }
      case T.BURROW: { ell(c, x + 8, y + 13, 7.5, 3.8); fs(c, '#2a1a12', '#7a4a2a', 1.2); c.fillStyle = 'rgba(255,255,255,' + (0.35 + 0.3 * Math.sin(f * 0.1)) + ')'; c.fillRect(x + 3 + (f % 20) * 0.5, y + 9 - (f % 14) * 0.3, 1, 1); break; }
      case T.RING: { c.strokeStyle = '#ffcc33'; c.lineWidth = 2.4; c.beginPath(); c.arc(x + 8, y + 8, 5.2, 0, TAU); c.stroke(); c.strokeStyle = '#fff2a8'; c.lineWidth = 0.8; c.beginPath(); c.arc(x + 8, y + 8, 5.2, 3.6, 4.6); c.stroke(); break; }
      case T.GATE: { c.fillStyle = '#6a5a8c'; c.fillRect(x + 2, y, 12, TS); c.fillStyle = '#ffd75e'; for (let i = 0; i < 4; i++) c.fillRect(x + 2, y + i * 4, 12, 2); c.strokeStyle = th.ink; c.lineWidth = 0.8; c.strokeRect(x + 2.4, y, 11.2, TS); break; }
      case T.WIND: { c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 1; for (let i = 0; i < 2; i++) { const yy = y + 16 - (((f * 1.4 + i * 8 + tx * 5) % 16)), xx = x + 3 + i * 8; c.beginPath(); c.moveTo(xx, yy); c.quadraticCurveTo(xx + 2, yy - 4, xx, yy - 8); c.stroke(); } break; }
      case T.GOAL: {
        c.fillStyle = '#d9d3c4'; c.fillRect(x + 6.5, y - 40, 3, 56); ell(c, x + 8, y - 41, 3, 3); fs(c, '#ffd23f', th.ink, 0.8);
        const w = Math.sin(f * 0.12) * 2; c.beginPath(); c.moveTo(x + 9.5, y - 38); c.quadraticCurveTo(x + 18, y - 38 + w, x + 26, y - 34 + w * 1.5); c.quadraticCurveTo(x + 18, y - 30 - w, x + 9.5, y - 26); c.closePath(); fs(c, '#ff5d73', th.ink, 0.8);
        c.fillStyle = '#fff'; heart(c, x + 17, y - 32, 3, '#fff'); break;
      }
    }
  }
  function patch(c, x, y, col, th) { c.fillStyle = col; c.fillRect(x, y, TS, TS); c.strokeStyle = th.ink; c.lineWidth = 0.8; c.strokeRect(x + 0.4, y + 0.4, 15.2, 15.2); stitchLine(c, x + 2.5, y + 2.5, x + 13.5, y + 2.5, '#fff'); stitchLine(c, x + 2.5, y + 13.5, x + 13.5, y + 13.5, '#fff'); stitchLine(c, x + 2.5, y + 2.5, x + 2.5, y + 13.5, '#fff'); stitchLine(c, x + 13.5, y + 2.5, x + 13.5, y + 13.5, '#fff'); c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1; c.beginPath(); c.moveTo(x + 5, y + 5); c.lineTo(x + 11, y + 11); c.moveTo(x + 11, y + 5); c.lineTo(x + 5, y + 11); c.stroke(); }
  function starPath(c, x, y, R, r, n) { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rad = i % 2 ? r : R; c.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } c.closePath(); }
  function puff(c, x, y, r, f) { c.fillStyle = '#fff'; c.strokeStyle = '#4a3326'; c.lineWidth = 1; c.beginPath(); for (let i = 0; i < 6; i++) { const a = i / 6 * TAU + 0.3; c.arc(x + Math.cos(a) * r * 0.55, y + Math.sin(a) * r * 0.55, r * 0.55, 0, TAU); } c.fill(); ell(c, x, y, r * 0.7, r * 0.7); fs(c, '#fff4e6', '#4a3326', 0.9); eyes(c, x, y - 0.5, 2, 1.1, 0); ell(c, x, y + 2.3, 1.4, 0.9); fs(c, '#ffb3c6'); }
  function heart(c, x, y, r, col) { c.beginPath(); c.moveTo(x, y + r * 0.9); c.bezierCurveTo(x - r * 1.5, y - r * 0.1, x - r * 0.7, y - r * 1.2, x, y - r * 0.45); c.bezierCurveTo(x + r * 0.7, y - r * 1.2, x + r * 1.5, y - r * 0.1, x, y + r * 0.9); c.fillStyle = col; c.fill(); }

  // ---- things
  function drawPlat(c, e, th, f) {
    if (e.sub === 'c' && e.s === 3) return;
    const shake = e.sub === 'c' && e.s === 1 ? Math.sin(f * 2.2) * 0.8 : 0;
    rr(c, e.x + shake, e.y, e.w, 8, 3); fs(c, e.sub === 'c' ? '#d8a45f' : '#9ad06b', th.ink, 1);
    stitchLine(c, e.x + 3 + shake, e.y + 4, e.x + e.w - 3 + shake, e.y + 4, '#fff6d8');
    if (e.sub !== 'c') { c.fillStyle = th.ink; c.beginPath(); c.arc(e.x + 6, e.y + 8.5, 2.2, 0, TAU); c.arc(e.x + e.w - 6, e.y + 8.5, 2.2, 0, TAU); c.fill(); }
  }
  function drawEnemy(c, e, th, f, S) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, d = e.dir || -1;
    c.save();
    switch (e.k) {
      case 'bug': { // button bug
        const w = Math.sin(f * 0.3) * 1.2; c.fillStyle = '#5a3d2b'; c.fillRect(cx - 4 + w, e.y + e.h - 2, 3, 2); c.fillRect(cx + 1 - w, e.y + e.h - 2, 3, 2);
        ell(c, cx, cy - 0.5, 6.5, 5.8); fs(c, '#e86f4d', th.ink, 1); ell(c, cx, cy - 0.5, 4.6, 4); c.strokeStyle = 'rgba(255,255,255,.55)'; c.lineWidth = 0.8; c.stroke();
        eyes(c, cx + d * 0.6, cy - 1, 2.2, 1.5, d); break;
      }
      case 'windup': {
        c.fillStyle = '#5a6a80'; const w = Math.sin(f * 0.5) * 1.5; c.fillRect(cx - 4 + w, e.y + e.h - 2, 3, 2); c.fillRect(cx + 1 - w, e.y + e.h - 2, 3, 2);
        rr(c, e.x, e.y, e.w, e.h - 2, 3); fs(c, '#7fb6e8', th.ink, 1); eyes(c, cx + d, cy - 2, 2.2, 1.5, d);
        c.save(); c.translate(cx - d * 6, cy - 1); c.rotate(f * 0.15); c.fillStyle = '#ffcf4a'; c.fillRect(-1, -5, 2, 10); ell(c, 0, -5, 2.5, 1.8); c.fill(); ell(c, 0, 5, 2.5, 1.8); c.fill(); c.restore(); break;
      }
      case 'frog': {
        const air = !e.on, sq = air ? 1.15 : 0.9 + Math.min(0.15, (e.t % 62) / 62 * 0.2);
        ell(c, cx, e.y + e.h - 5 * sq, 6.5, 5 * sq); fs(c, '#6fd17a', th.ink, 1); ell(c, cx - 3, e.y + e.h - 9 * sq, 2.4, 2.4); fs(c, '#fff', th.ink, 0.8); ell(c, cx + 3, e.y + e.h - 9 * sq, 2.4, 2.4); fs(c, '#fff', th.ink, 0.8);
        c.fillStyle = '#2a2018'; c.fillRect(cx - 3.5 + d * 0.6, e.y + e.h - 9.6 * sq, 1.2, 1.5); c.fillRect(cx + 2.5 + d * 0.6, e.y + e.h - 9.6 * sq, 1.2, 1.5);
        c.strokeStyle = th.ink; c.lineWidth = 0.8; c.beginPath(); c.arc(cx, e.y + e.h - 4 * sq, 2.4, 0.1, Math.PI - 0.1); c.stroke(); break;
      }
      case 'bat': {
        const fl = Math.sin(f * 0.4) * 5; c.fillStyle = '#8a6fd6'; c.beginPath(); c.moveTo(cx, cy); c.quadraticCurveTo(cx - 8, cy - 8 - fl, cx - 12, cy + 1); c.quadraticCurveTo(cx - 8, cy - 1, cx - 5, cy + 3); c.fill(); c.beginPath(); c.moveTo(cx, cy); c.quadraticCurveTo(cx + 8, cy - 8 - fl, cx + 12, cy + 1); c.quadraticCurveTo(cx + 8, cy - 1, cx + 5, cy + 3); c.fill();
        ell(c, cx, cy, 5, 5); fs(c, '#a78cf0', th.ink, 1); c.fillStyle = '#a78cf0'; c.beginPath(); c.moveTo(cx - 4, cy - 3); c.lineTo(cx - 3, cy - 8); c.lineTo(cx - 1, cy - 4); c.moveTo(cx + 4, cy - 3); c.lineTo(cx + 3, cy - 8); c.lineTo(cx + 1, cy - 4); c.fill(); eyes(c, cx, cy - 0.5, 2, 1.2, 0); break;
      }
      case 'balloon': {
        c.strokeStyle = 'rgba(60,40,30,.6)'; c.lineWidth = 0.7; c.beginPath(); c.moveTo(cx, e.y + e.h - 3); c.quadraticCurveTo(cx + Math.sin(f * 0.1) * 3, e.y + e.h + 4, cx, e.y + e.h + 10); c.stroke();
        ell(c, cx, cy - 1, 6, 6.8); fs(c, '#ff6b6b', th.ink, 1); c.fillStyle = 'rgba(255,255,255,.55)'; ell(c, cx - 2, cy - 4, 1.6, 2.2); c.fill(); eyes(c, cx, cy - 1, 2, 1.3, 0); c.beginPath(); c.moveTo(cx - 1.5, e.y + e.h - 2.5); c.lineTo(cx + 1.5, e.y + e.h - 2.5); c.lineTo(cx, e.y + e.h); c.fillStyle = '#e04848'; c.fill(); break;
      }
      case 'cannon': {
        const dd = e.dir || -1, kick = e.t < 8 ? 2 - e.t * 0.25 : 0;
        c.save(); c.translate(cx, cy); c.rotate(dd * -0.15); rr(c, dd > 0 ? -5 - kick : -12 + kick, -4, 17, 8, 3); fs(c, '#6e7b92', th.ink, 1); c.restore();
        ell(c, cx, cy + 1, 6, 6); fs(c, '#56627a', th.ink, 1); c.fillStyle = '#ffd75e'; c.beginPath(); c.arc(cx, cy + 1, 1.8, 0, TAU); c.fill(); break;
      }
      case 'pin': {
        const w = Math.sin(f * 0.25) * 1; ell(c, cx, cy + 1, 6.5, 5); fs(c, '#d83a52', th.ink, 1);
        c.strokeStyle = '#e8edf5'; c.lineWidth = 1; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(cx + i * 2.4, cy - 2); c.lineTo(cx + i * 3.4, cy - 8 - Math.abs(i) * -0.6); c.stroke(); c.fillStyle = i % 2 ? '#ffd23f' : '#6fd3c2'; c.beginPath(); c.arc(cx + i * 3.4, cy - 8, 1.2, 0, TAU); c.fill(); }
        eyes(c, cx + d, cy + 1.5, 2.2, 1.3, d); c.fillStyle = '#5a3d2b'; c.fillRect(cx - 4 + w, e.y + e.h - 1.5, 3, 1.5); c.fillRect(cx + 1 - w, e.y + e.h - 1.5, 3, 1.5); break;
      }
      case 'roller': {
        const rot = e.s === 2 ? f * 0.3 * d : 0, z = e.s === 0 || e.s === 3; c.save(); c.translate(cx, cy); c.rotate(rot); ell(c, 0, 0, 6.5, 6.5); fs(c, '#f2b84b', th.ink, 1); c.fillStyle = '#e8863a'; c.fillRect(-6.5, -1.5, 13, 3); c.restore();
        eyes(c, cx + d * 0.5, cy - 1, 2, 1.4, d, z); if (e.s === 1) { c.fillStyle = th.ink; c.font = 'bold 8px sans-serif'; c.textAlign = 'center'; c.fillText('!', cx, e.y - 3); } if (z) { c.fillStyle = th.ink; c.font = '6px sans-serif'; c.textAlign = 'center'; c.fillText('z', cx + 5, e.y - 2); } break;
      }
      case 'drip': {
        if (e.s === 2) { ell(c, cx, e.y + e.h - 1, 6, 1.6); fs(c, '#3e3a8a'); break; }
        c.beginPath(); c.moveTo(cx, e.y); c.quadraticCurveTo(cx + 6, cy + 2, cx, e.y + e.h); c.quadraticCurveTo(cx - 6, cy + 2, cx, e.y); fs(c, '#4a46b0', th.ink, 0.8); c.fillStyle = 'rgba(255,255,255,.5)'; c.fillRect(cx - 1.8, cy, 1, 2); break;
      }
      case 'bird': {
        const fl = Math.sin(f * 0.5) * 4; c.fillStyle = '#f5c542'; ell(c, cx, cy, 6.5, 4.8); fs(c, '#f5c542', th.ink, 1); c.beginPath(); c.moveTo(cx - 2, cy); c.lineTo(cx - 8, cy - 4 - fl); c.lineTo(cx + 1, cy - 1); c.fillStyle = '#e8a82a'; c.fill();
        c.beginPath(); c.moveTo(cx + d * 6, cy - 1); c.lineTo(cx + d * 10, cy + 0.5); c.lineTo(cx + d * 6, cy + 2); c.fillStyle = '#ff7a3d'; c.fill(); eyes(c, cx + d * 2.5, cy - 1.5, 0.1, 1.2, d);
        c.save(); c.translate(cx - d * 5, cy + 1); c.rotate(f * 0.2); c.fillStyle = '#ffd75e'; c.fillRect(-0.6, -3, 1.2, 6); c.restore(); break;
      }
      case 'pend': {
        c.strokeStyle = '#4a3a2a'; c.lineWidth = 1; c.beginPath(); c.moveTo(e.ax, e.ay); c.lineTo(cx, cy); c.stroke(); c.fillStyle = '#8a8a99'; c.beginPath(); c.arc(e.ax, e.ay, 2.2, 0, TAU); c.fill();
        ell(c, cx, cy, 6.5, 6.5); fs(c, '#d9534f', th.ink, 1); starPath(c, cx, cy, 4, 2, 5); fs(c, '#ffd23f'); break;
      }
      case 'umb': {
        const walk = Math.sin(f * 0.3) * 1; c.fillStyle = '#5a3d2b'; c.fillRect(cx - 4 + walk, e.y + e.h - 2, 3, 2); c.fillRect(cx + 1 - walk, e.y + e.h - 2, 3, 2);
        rr(c, e.x + 2, cy - 1, e.w - 4, e.h / 2, 3); fs(c, '#ffd0a0', th.ink, 1); eyes(c, cx + d, cy + 2, 2, 1.3, d);
        if (e.sh) { c.beginPath(); c.moveTo(e.x - 2, cy - 1); c.quadraticCurveTo(cx, e.y - 8, e.x + e.w + 2, cy - 1); c.quadraticCurveTo(cx, cy - 4, e.x - 2, cy - 1); fs(c, '#4aa8ff', th.ink, 1); c.fillStyle = '#fff'; c.beginPath(); c.arc(cx, e.y - 0.5, 1.6, 0, TAU); c.fill(); }
        else if (e.s === 1) { c.fillStyle = th.ink; c.font = 'bold 7px sans-serif'; c.textAlign = 'center'; c.fillText('?', cx, e.y - 2); }
        break;
      }
      case 'shot': {
        if (e.sub === 'wave') { c.beginPath(); c.moveTo(e.x, e.y + e.h); c.quadraticCurveTo(e.x + e.w / 2, e.y - 4, e.x + e.w, e.y + e.h); fs(c, '#ffe08a', '#c98a1a', 1); }
        else if (e.sub === 'screw') { c.save(); c.translate(cx, cy); c.rotate(f * 0.4); c.fillStyle = '#cfd6e2'; c.fillRect(-1, -4, 2, 8); c.fillStyle = '#6a7388'; c.fillRect(-3.5, -4, 7, 2); c.restore(); }
        else { ell(c, cx, cy, e.sub === 'bubble' ? 4.2 : 3.4, e.sub === 'bubble' ? 4.2 : 3.4); fs(c, e.sub === 'bubble' ? 'rgba(160,230,255,.8)' : e.sub === 'snow' ? '#fff' : '#3b3f52', th.ink, 0.8); }
        break;
      }
      case 'item': {
        const b = Math.sin(f * 0.1) * 1.2; c.translate(0, b);
        if (e.sub === 4) puff(c, cx, cy, 7, f);
        else if (e.sub === 1) { ell(c, cx, cy + 3, 6, 3); fs(c, '#ff8a3d', th.ink, 1); c.strokeStyle = '#e8edf5'; c.lineWidth = 1.4; c.beginPath(); for (let i = 0; i < 3; i++) { c.moveTo(cx - 4, cy - 5 + i * 2.5); c.lineTo(cx + 4, cy - 4 + i * 2.5); } c.stroke(); }
        else if (e.sub === 2) { c.beginPath(); c.moveTo(cx - 6, cy - 5); c.lineTo(cx + 6, cy - 5); c.lineTo(cx + 8, cy + 6); c.quadraticCurveTo(cx, cy + 2, cx - 8, cy + 6); c.closePath(); fs(c, '#9b6bd9', th.ink, 1); c.fillStyle = '#ffd75e'; c.fillRect(cx - 2, cy - 6, 4, 2); }
        else { ell(c, cx, cy, 6, 6); fs(c, '#ff89b0', th.ink, 1); c.strokeStyle = '#fff'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(cx - 5, cy + 1); c.bezierCurveTo(cx - 2, cy - 5, cx + 2, cy + 5, cx + 5, cy - 1); c.stroke(); }
        break;
      }
      case 'boss': drawBoss(c, e, th, f, S); break;
    }
    c.restore();
  }
  function drawBoss(c, e, th, f, S) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, d = e.dir || -1, flash = e.inv > 0 && (f % 6 < 3);
    if (!e.awake && e.k === 'boss') { /* sleeping pose */ }
    c.save(); if (flash) c.globalAlpha = 0.45;
    if (e.bk === 'bear') {
      const sq = e.s === 1 ? 1.06 : 1, w = Math.sin(f * 0.08) * 0.6;
      ell(c, cx - 8, e.y + 3, 5, 5); fs(c, '#c98b57', th.ink, 1.2); ell(c, cx + 8, e.y + 3, 5, 5); fs(c, '#c98b57', th.ink, 1.2);
      ell(c, cx, cy + 2, 14, 12 * sq); fs(c, '#d9a066', th.ink, 1.4);
      c.fillStyle = '#e8836b'; c.fillRect(cx - 9, cy + 4, 8, 7); c.fillStyle = '#7cc4e8'; c.fillRect(cx + 2, cy - 2, 7, 8); stitchLine(c, cx - 9, cy + 4, cx - 1, cy + 4, '#fff'); stitchLine(c, cx + 2, cy - 2, cx + 9, cy - 2, '#fff');
      ell(c, cx, cy - 6, 10, 8); fs(c, '#e2b27a', th.ink, 1.2); ell(c, cx, cy - 3, 4.5, 3.5); fs(c, '#f6dcb4', th.ink, 0.8); c.fillStyle = th.ink; c.beginPath(); c.arc(cx, cy - 4.5, 1.2, 0, TAU); c.fill();
      if (e.s === 2 || e.inv > 40) { c.strokeStyle = th.ink; c.lineWidth = 1.2; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(cx + s * 6 - 2, cy - 10); c.lineTo(cx + s * 6 + 2, cy - 8); c.moveTo(cx + s * 6 + 2, cy - 10); c.lineTo(cx + s * 6 - 2, cy - 8); c.stroke(); } }
      else { eyes(c, cx + d, cy - 8, 4.5, 1.6, d); c.strokeStyle = th.ink; c.lineWidth = 1.4; c.beginPath(); c.moveTo(cx - 8, cy - 12.5); c.lineTo(cx - 3, cy - 11); c.moveTo(cx + 8, cy - 12.5); c.lineTo(cx + 3, cy - 11); c.stroke(); }
      c.fillStyle = '#c98b57'; c.fillRect(cx - 12 + w, e.y + e.h - 4, 8, 4); c.fillRect(cx + 4 - w, e.y + e.h - 4, 8, 4); c.fillStyle = th.ink; c.fillRect(cx - 12 + w, e.y + e.h - 1, 8, 1); c.fillRect(cx + 4 - w, e.y + e.h - 1, 8, 1);
    } else if (e.bk === 'general') {
      const dz = e.s === 2;
      rr(c, e.x + 2, e.y + 6, e.w - 4, e.h - 8, 4); fs(c, '#d84a4a', th.ink, 1.4); c.fillStyle = '#ffd75e'; c.fillRect(e.x + 2, e.y + 14, e.w - 4, 3); rr(c, cx - 8, e.y, 16, 12, 4); fs(c, '#e8dfc8', th.ink, 1.2);
      c.fillStyle = '#2f5aa8'; c.fillRect(cx - 9, e.y - 4, 18, 5); c.fillRect(cx - 4, e.y - 8, 8, 5);
      if (dz) { c.strokeStyle = th.ink; c.lineWidth = 1.2; for (const s of [-1, 1]) { c.beginPath(); c.arc(cx + s * 4, e.y + 6, 2, 0, TAU); c.stroke(); } for (let i = 0; i < 3; i++) { const a = f * 0.12 + i * 2.1; starPath(c, cx + Math.cos(a) * 10, e.y - 8 + Math.sin(a) * 3, 2.5, 1.1, 5); fs(c, '#ffd23f'); } }
      else eyes(c, cx + d * 1.5, e.y + 6, 3.4, 1.6, d);
      c.save(); c.translate(cx - d * 14, cy); c.rotate(f * (e.s === 1 ? 0.35 : 0.1)); c.fillStyle = '#ffcf4a'; c.fillRect(-1, -7, 2, 14); ell(c, 0, -7, 3.5, 2.5); c.fill(); ell(c, 0, 7, 3.5, 2.5); c.fill(); c.restore();
      c.fillStyle = '#5a6a80'; const w = e.s === 1 ? Math.sin(f * 0.6) * 3 : 0; c.fillRect(cx - 9 + w, e.y + e.h - 4, 7, 4); c.fillRect(cx + 2 - w, e.y + e.h - 4, 7, 4);
    } else if (e.bk === 'duck') {
      const dive = e.s === 1 || e.s === 2 || e.s === 3, w = Math.sin(f * 0.1) * 1.2;
      ell(c, cx, cy + 4, 15, 10); fs(c, '#ffd84a', th.ink, 1.4); ell(c, cx - 3 * d, cy - 8, 9, 9); fs(c, '#ffd84a', th.ink, 1.4);
      c.beginPath(); c.moveTo(cx + d * 7, cy - 7); c.lineTo(cx + d * 17, cy - 5 + w * 0.3); c.lineTo(cx + d * 7, cy - 2); c.closePath(); fs(c, '#ff8a2d', th.ink, 1);
      if (dive) { c.strokeStyle = th.ink; c.lineWidth = 1.2; c.beginPath(); c.moveTo(cx - d * 5, cy - 10); c.lineTo(cx - d * 1, cy - 8); c.moveTo(cx - d * 1, cy - 10); c.lineTo(cx - d * 5, cy - 8); c.stroke(); }
      else eyes(c, cx + d * 0.5, cy - 9, 3.4, 1.6, d);
      c.fillStyle = '#fff'; ell(c, cx - d * 8, cy + 4, 5, 3.4); c.fill(); c.fillStyle = '#e24d4d'; c.fillRect(cx - 6, cy + 1, 14, 3);
      c.strokeStyle = 'rgba(255,255,255,.7)'; c.lineWidth = 1; if (dive) for (let i = 0; i < 3; i++) { c.beginPath(); c.arc(cx - 10 + i * 10, cy - 14 - ((f * 0.7 + i * 7) % 10), 1.6, 0, TAU); c.stroke(); }
    } else if (e.bk === 'owl') {
      const fl = Math.sin(f * (e.s === 2 ? 0.7 : 0.3)) * (e.s === 3 ? 0 : 7), crash = e.s === 3;
      c.fillStyle = '#8fb0e8'; c.beginPath(); c.moveTo(cx, cy); c.quadraticCurveTo(cx - 18, cy - 12 - fl, cx - 24, cy + 2); c.quadraticCurveTo(cx - 14, cy - 2, cx - 6, cy + 6); c.fill(); c.beginPath(); c.moveTo(cx, cy); c.quadraticCurveTo(cx + 18, cy - 12 - fl, cx + 24, cy + 2); c.quadraticCurveTo(cx + 14, cy - 2, cx + 6, cy + 6); c.fill();
      ell(c, cx, cy + 1, 11, 12); fs(c, '#f4f8ff', th.ink, 1.4); ell(c, cx, cy + 5, 6, 6); fs(c, '#d6e4fa'); c.fillStyle = '#f4f8ff'; c.beginPath(); c.moveTo(cx - 9, cy - 8); c.lineTo(cx - 6, cy - 15); c.lineTo(cx - 3, cy - 10); c.moveTo(cx + 9, cy - 8); c.lineTo(cx + 6, cy - 15); c.lineTo(cx + 3, cy - 10); c.fill();
      if (crash) { c.strokeStyle = th.ink; c.lineWidth = 1.3; for (const sx of [-4.5, 4.5]) { c.beginPath(); c.moveTo(cx + sx - 2, cy - 5); c.lineTo(cx + sx + 2, cy - 1); c.moveTo(cx + sx + 2, cy - 5); c.lineTo(cx + sx - 2, cy - 1); c.stroke(); } for (let i = 0; i < 3; i++) { const a = f * 0.12 + i * 2.1; starPath(c, cx + Math.cos(a) * 12, e.y - 4 + Math.sin(a) * 3, 2.5, 1.1, 5); fs(c, '#ffd23f'); } }
      else { for (const sx of [-4.5, 4.5]) { ell(c, cx + sx, cy - 4, 3.6, 3.6); fs(c, '#ffd23f', th.ink, 0.9); ell(c, cx + sx + d * 0.8, cy - 4, 1.4, 1.8); fs(c, '#2a2018'); } }
      c.beginPath(); c.moveTo(cx - 2, cy); c.lineTo(cx + 2, cy); c.lineTo(cx, cy + 4); c.closePath(); fs(c, '#ff9a3d', th.ink, 0.8);
    } else if (e.bk === 'mouse') {
      c.save(); c.beginPath(); c.rect(e.x - 30, 0, e.w + 60, e.fy); c.clip();
      ell(c, cx - 8, cy - 8, 6, 6); fs(c, '#b9bfcb', th.ink, 1.2); ell(c, cx + 8, cy - 8, 6, 6); fs(c, '#b9bfcb', th.ink, 1.2); ell(c, cx - 8, cy - 8, 3.2, 3.2); fs(c, '#ffb3c6'); ell(c, cx + 8, cy - 8, 3.2, 3.2); fs(c, '#ffb3c6');
      ell(c, cx, cy + 1, 11, 11); fs(c, '#c9cfdb', th.ink, 1.4); ell(c, cx, cy + 4, 6, 6); fs(c, '#eef0f5'); eyes(c, cx + d * 0.5, cy - 2, 4, 1.8, d);
      ell(c, cx, cy + 3, 2, 1.5); fs(c, '#ff7a9a'); c.strokeStyle = th.ink; c.lineWidth = 0.7; c.beginPath(); c.moveTo(cx - 6, cy + 3); c.lineTo(cx - 12, cy + 2); c.moveTo(cx + 6, cy + 3); c.lineTo(cx + 12, cy + 2); c.stroke();
      c.fillStyle = '#ffe27a'; c.beginPath(); c.arc(cx, cy - 12, 3.2, 0, TAU); c.fill(); c.restore();
    } else if (e.bk === 'golem') {
      const st = e.s === 6, step = e.s === 0 ? Math.sin(f * 0.2) * 2 : 0;
      rr(c, e.x + 3, e.y + 12, e.w - 6, e.h - 16, 4); fs(c, '#c98a50', th.ink, 1.5); c.fillStyle = '#a56a3c'; c.fillRect(e.x + 3, e.y + 22, e.w - 6, 3);
      rr(c, e.x + 5, e.y, e.w - 10, 15, 4); fs(c, '#d9a066', th.ink, 1.5);
      if (st) { c.strokeStyle = th.ink; c.lineWidth = 1.3; for (const sx of [-5, 5]) { c.beginPath(); c.moveTo(cx + sx - 2, e.y + 5); c.lineTo(cx + sx + 2, e.y + 9); c.moveTo(cx + sx + 2, e.y + 5); c.lineTo(cx + sx - 2, e.y + 9); c.stroke(); } for (let i = 0; i < 3; i++) { const a = f * 0.12 + i * 2.1; starPath(c, cx + Math.cos(a) * 12, e.y - 6 + Math.sin(a) * 3, 2.5, 1.1, 5); fs(c, '#ffd23f'); } }
      else eyes(c, cx + d * 1.5, e.y + 7, 4.5, 2, d);
      c.fillStyle = '#6a7388'; c.fillRect(e.x - 4 + step, e.y + 16, 6, 14); c.save(); c.translate(e.x + e.w + 1, e.y + 18); c.rotate(-0.4 + Math.sin(f * 0.1) * 0.1); c.fillStyle = '#e24d4d'; c.fillRect(-2, 0, 4, 10); c.fillStyle = '#cfd6e2'; c.fillRect(-1, 10, 2, 12); c.restore();
      c.fillStyle = '#5a3d2b'; c.fillRect(e.x + 6 + step, e.y + e.h - 4, 8, 4); c.fillRect(e.x + e.w - 14 - step, e.y + e.h - 4, 8, 4);
      if (e.sh) { c.beginPath(); c.moveTo(e.x - 2, e.y + 14); c.quadraticCurveTo(cx, e.y - 12, e.x + e.w + 2, e.y + 14); c.closePath(); c.globalAlpha = 0.85; fs(c, '#6fb6ff', th.ink, 1.2); c.globalAlpha = 1; c.strokeStyle = '#fff'; c.lineWidth = 1; c.beginPath(); c.arc(cx, e.y + 6, 10, 3.6, 5.2); c.stroke(); }
    } else { rr(c, e.x, e.y, e.w, e.h, 8); fs(c, '#a78cf0', th.ink, 1.4); eyes(c, cx + d * 2, cy - 4, 5, 2.2, d); }
    c.restore();
  }

  // ---- the hero
  function drawPlayer(c, p, f, S) {
    if (p.dead) { c.save(); c.translate(p.x + p.w / 2, p.y + p.h / 2); c.rotate(p.deadT * 0.25); if (p.pw) c.scale(1.22, 1.22); body(c, p, f, 'dead', S); c.restore(); return; }
    if (p.inv > 0 && Math.floor(p.inv / 4) % 2 === 1 && !p.hurtT) return;
    const air = !p.on && !p.rope, run = p.on && Math.abs(p.vx) > 0.35;
    let pose = p.hurtT > 0 ? 'hurt' : p.rope ? 'rope' : p.pound ? 'pound' : p.crouch ? 'crouch' : air ? (p.vy < 0 ? 'jump' : (p.gear === 2 && (S.prev & 16) && p.vy > 0.3 ? 'glide' : 'fall')) : run ? 'run' : 'idle';
    c.save(); c.translate(p.x + p.w / 2, p.y + p.h); c.scale(p.face >= 0 ? 1 : -1, 1); if (p.pw) c.scale(1.22, 1.22);
    if (p.spr > 0) c.scale(0.9, 1.15);
    if (pose === 'jump') c.scale(0.92, 1.1); else if (pose === 'fall') c.scale(0.95, 1.06);
    body(c, p, f, pose, S); c.restore();
    if (p.rope) { c.strokeStyle = '#ff6fa0'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(p.x + p.w / 2, p.y + 3); c.lineTo(p.rope.ax, p.rope.ay); c.stroke(); c.strokeStyle = th0.ink || '#4a3326'; c.lineWidth = 0.4; c.stroke(); }
  }
  const th0 = { ink: '#4a3326' };
  function body(c, p, f, pose, S) {
    // origin: bottom center of the hitbox, facing +x
    const crouch = pose === 'crouch', h = crouch ? 8 : 14, bob = pose === 'idle' ? Math.sin(f * 0.07) * 0.4 : 0, ink = '#4a3326';
    const run = pose === 'run', ph = f * 0.35;
    if (pose === 'dead') { c.translate(0, -7); }
    const oy = pose === 'dead' ? 0 : 0;
    // cape (behind)
    if (p.gear === 2) { c.beginPath(); const fl = pose === 'glide' ? 5 : Math.sin(f * 0.2) * 1.5 + (run ? 3 : 0); c.moveTo(-1, oy - h + 5); c.lineTo(-9 - fl, oy - h + 7 + fl * 0.5); c.lineTo(-7 - fl * 0.6, oy - 2); c.lineTo(-1, oy - 3); c.closePath(); fs(c, '#9b6bd9', ink, 0.9); if (pose === 'glide') { c.beginPath(); c.moveTo(-1, oy - h + 5); c.lineTo(-12, oy - h + 2); c.lineTo(-12, oy - h + 12); c.lineTo(10, oy - h + 12); c.lineTo(10, oy - h + 2); c.closePath(); fs(c, 'rgba(155,107,217,.9)', ink, 0.9); } }
    // ears
    const earA = pose === 'run' ? -0.5 + Math.sin(ph) * 0.2 : pose === 'jump' ? 0.2 : pose === 'fall' || pose === 'glide' ? -0.9 : Math.sin(f * 0.05) * 0.06 - 0.1;
    for (const s of [0, 1]) { c.save(); c.translate(-1 + s * 4, oy - h - 0.5 + bob); c.rotate(earA * (s ? 0.8 : 1) - (s ? 0.05 : 0.2)); ell(c, 0, -5, 2.2, 6); fs(c, '#fff4e6', ink, 0.9); ell(c, 0, -5, 1, 4); fs(c, '#ffb3c6'); c.restore(); }
    // legs
    c.fillStyle = '#fff4e6'; c.strokeStyle = ink; c.lineWidth = 0.9;
    const l1 = run ? Math.sin(ph) * 3 : pose === 'jump' ? 2 : pose === 'fall' ? -1 : 0, l2 = run ? -Math.sin(ph) * 3 : pose === 'jump' ? -2 : 0;
    if (!crouch) { rr(c, -4 + l1, oy - 3.5, 4, 3.5, 1.5); fs(c, '#ffd6a8', ink, 0.8); rr(c, 1 + l2, oy - 3.5, 4, 3.5, 1.5); fs(c, '#ffd6a8', ink, 0.8); }
    if (p.gear === 1) { // spring boots
      c.strokeStyle = '#ff8a3d'; c.lineWidth = 1.5; for (const lx of [-4 + l1, 1 + l2]) { c.beginPath(); for (let i = 0; i < 3; i++) { c.moveTo(lx, oy - 3 + i); c.lineTo(lx + 4, oy - 2.4 + i); } c.stroke(); }
    }
    // body
    const sq = pose === 'pound' ? 0.85 : 1;
    ell(c, 0.5, oy - h / 2 - 0.5 + bob, 5.8 * sq, h / 2 + 0.2); fs(c, '#fff4e6', ink, 1);
    ell(c, 0.5, oy - h / 2 + 2 + bob, 3.2, h / 3.4); fs(c, '#ffe7d0');
    // face
    const ey = oy - h + 4.5 + bob, blink = pose === 'idle' && f % 130 < 5;
    if (pose === 'hurt' || pose === 'dead') { c.strokeStyle = ink; c.lineWidth = 1; for (const ex of [1, 5]) { c.beginPath(); c.moveTo(ex - 1, ey - 1); c.lineTo(ex + 1, ey + 1); c.moveTo(ex + 1, ey - 1); c.lineTo(ex - 1, ey + 1); c.stroke(); } }
    else if (blink) { c.strokeStyle = ink; c.lineWidth = 0.9; c.beginPath(); c.moveTo(2, ey); c.lineTo(5, ey); c.stroke(); }
    else { ell(c, 3.2, ey, 1.4, 1.7); fs(c, '#2a2018'); c.fillStyle = '#fff'; c.fillRect(3.4, ey - 1, 0.7, 0.7); }
    ell(c, 5, ey + 2, 1.7, 1.2); fs(c, '#ffb3c6'); c.fillStyle = '#e2708a'; c.fillRect(5.6, ey + 0.8, 0.9, 0.8);
    // scarf / ribbon
    c.fillStyle = p.gear === 3 ? '#ff6fa0' : '#e85d75'; c.fillRect(-4, oy - h + 7.5 + bob, 9, 2); if (p.gear === 3) { c.strokeStyle = '#ff6fa0'; c.lineWidth = 1.4; c.beginPath(); c.moveTo(-4, oy - h + 8.5 + bob); c.quadraticCurveTo(-9, oy - h + 8 + Math.sin(f * 0.3) * 2, -12, oy - h + 10 + Math.sin(f * 0.3 + 1) * 2); c.stroke(); } else { c.strokeStyle = '#e85d75'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(-4, oy - h + 8.5 + bob); c.lineTo(-7 - (run ? 2 : 0), oy - h + 9.5 + Math.sin(f * 0.25) * 1); c.stroke(); }
    if (pose === 'pound') { c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1; c.beginPath(); for (let i = -1; i <= 1; i++) { c.moveTo(i * 4, oy - h - 6); c.lineTo(i * 4, oy - h - 14); } c.stroke(); }
  }

  // ---- particles
  class Fx {
    constructor() { this.a = []; this.pop = []; }
    add(p) { if (this.a.length < 260) this.a.push(p); }
    update() { const a = this.a; for (let i = a.length - 1; i >= 0; i--) { const p = a[i]; p.t++; p.x += p.vx; p.y += p.vy; p.vy += p.g || 0; p.vx *= p.dr || 1; if (p.t >= p.life) { a[i] = a[a.length - 1]; a.pop(); } } const q = this.pop; for (let i = q.length - 1; i >= 0; i--) { q[i].t++; if (q[i].t > 40) q.splice(i, 1); } }
    burst(x, y, n, col, o) { o = o || {}; for (let i = 0; i < n; i++) { const a = (o.arc || TAU) * (i / n) + (o.a0 || 0) + (i * 7 % 3) * 0.2, s = (o.s || 1.4) * (0.5 + ((i * 37) % 10) / 10); this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s + (o.up || 0), g: o.g === undefined ? 0.06 : o.g, life: o.life || 28, t: 0, col, r: o.r || 1.6, kind: o.kind || 'dot', dr: 0.98 }); } }
    text(x, y, s, col) { this.pop.push({ x, y, s, col: col || '#fff', t: 0 }); }
    draw(c) {
      for (const p of this.a) { const k = 1 - p.t / p.life; c.globalAlpha = Math.max(0, Math.min(1, k * 1.4)); c.fillStyle = p.col; if (p.kind === 'star') { starPath(c, p.x, p.y, p.r * 1.8, p.r * 0.8, 4); c.fill(); } else if (p.kind === 'ring') { c.strokeStyle = p.col; c.lineWidth = 1; c.beginPath(); c.arc(p.x, p.y, p.t * 0.9, 0, TAU); c.stroke(); } else { c.beginPath(); c.arc(p.x, p.y, p.r * (0.5 + k * 0.5), 0, TAU); c.fill(); } }
      c.globalAlpha = 1;
      for (const q of this.pop) { c.globalAlpha = Math.max(0, 1 - q.t / 40); c.fillStyle = q.col; c.font = 'bold 8px sans-serif'; c.textAlign = 'center'; c.strokeStyle = 'rgba(0,0,0,.5)'; c.lineWidth = 2; c.strokeText(q.s, q.x, q.y - q.t * 0.35); c.fillText(q.s, q.x, q.y - q.t * 0.35); }
      c.globalAlpha = 1;
    }
  }
  // engine events -> particles + sounds (sound is a callback so node tests stay silent)
  function feed(fx, S, snd) {
    for (const [n, x, y, k] of S.ev) {
      switch (n) {
        case 'jump': fx.burst(x + 5, y + 14, 4, '#fff', { s: 0.7, arc: Math.PI, a0: Math.PI, life: 14, g: 0 }); break;
        case 'land': fx.burst(x + 5, y, 4, '#f6e6c4', { s: 0.8, arc: Math.PI, a0: Math.PI, life: 12, g: 0 }); break;
        case 'coin': fx.burst(x, y, 5, '#ffd23f', { s: 1.1, life: 16, kind: 'star', g: 0 }); break;
        case 'medal': fx.burst(x, y, 14, '#ffe066', { s: 2, life: 40, kind: 'star', g: 0.02 }); fx.text(x, y - 8, '★', '#ffe066'); break;
        case 'stomp': fx.burst(x, y, 10, '#fff', { s: 1.8, life: 20, kind: 'star' }); fx.burst(x, y, 6, '#ffb347', { s: 1.2, life: 22 }); break;
        case 'poof': fx.burst(x, y, 6, '#ddd', { s: 1.1, life: 18 }); break;
        case 'hurt': fx.burst(x + 5, y + 7, 8, '#ff6b6b', { s: 1.6, life: 20 }); break;
        case 'break': fx.burst(x, y, 10, '#e8836b', { s: 2, life: 30, g: 0.14 }); break;
        case 'pound': fx.burst(x, y, 10, '#f6e6c4', { s: 2, arc: Math.PI, a0: Math.PI, life: 18, g: 0 }); fx.add({ x, y, vx: 0, vy: 0, life: 14, t: 0, col: '#fff', kind: 'ring' }); break;
        case 'spring': fx.add({ x: x + 5, y, vx: 0, vy: 0, life: 12, t: 0, col: '#fff', kind: 'ring' }); break;
        case 'cp': fx.burst(x, y, 12, '#6fe08a', { s: 1.8, life: 34, kind: 'star', g: 0.02 }); fx.text(x, y - 12, 'CHECK!', '#b9ffc8'); break;
        case 'goal': fx.burst(x, y, 30, '#ffd23f', { s: 3, life: 60, kind: 'star', g: 0.05 }); fx.burst(x, y, 20, '#ff6fa0', { s: 2.5, life: 60, g: 0.05 }); break;
        case 'gear': fx.burst(x, y, 12, '#c9a8ff', { s: 1.8, life: 30, kind: 'star' }); break;
        case 'heart': fx.burst(x, y, 6, '#ffffff', { s: 1, life: 24, g: -0.02 }); break;
        case 'grow': fx.burst(x + 5, y + 7, 14, '#fff', { s: 2, life: 30, kind: 'star' }); fx.add({ x: x + 5, y: y + 7, vx: 0, vy: 0, life: 16, t: 0, col: '#ffd23f', kind: 'ring' }); break;
        case 'shrink': fx.burst(x + 5, y + 7, 8, '#ffb3c6', { s: 1.6, life: 22 }); break;
        case 'reserve': case 'reserveuse': fx.burst(x + 5, y, 6, '#ffe27a', { s: 1.2, life: 22, kind: 'star' }); break;
        case 'burrow': fx.burst(x + 5, y + 7, 12, '#a0785a', { s: 1.4, life: 24 }); break;
        case 'quake': case 'bossdown': fx.burst(x, y, 18, '#ffd23f', { s: 2.4, life: 40, kind: 'star' }); break;
        case 'bosshit': fx.burst(x, y, 14, '#fff', { s: 2.2, life: 26, kind: 'star' }); break;
        case 'shoot': fx.burst(x + 8, y + 8, 4, '#ccc', { s: 0.8, life: 14 }); break;
        case 'glide': fx.burst(x + 5, y + 10, 1, '#e0d0ff', { s: 0.4, life: 18, g: 0 }); break;
        case 'rope': fx.add({ x, y, vx: 0, vy: 0, life: 12, t: 0, col: '#ffd23f', kind: 'ring' }); break;
        case 'die': fx.burst(x + 5, y + 7, 16, '#fff', { s: 2.4, life: 36, kind: 'star' }); break;
        case 'splat': fx.burst(x, y, 6, '#5a56c8', { s: 1.2, arc: Math.PI, a0: Math.PI, life: 18 }); break;
        case 'itemup': fx.burst(x, y, 6, '#ffd23f', { s: 1, life: 20, kind: 'star' }); break;
      }
      if (snd) snd(n, k);
    }
    S.ev.length = 0;
  }

  // ---- the whole frame
  // o: { w, h (CSS px of the canvas), sc (px per logical unit), t (frame counter), theme, fx, dark, medGot }
  function draw(c, S, o) {
    const th = THEMES[o.theme] || THEMES.meadow, L = S.L, sc = o.sc, vw = o.w / sc, vh = o.h / sc;
    c.setTransform(o.dpr || 1, 0, 0, o.dpr || 1, 0, 0);
    c.save(); c.scale(sc, sc);
    // vertical layout: the level is 13 rows; the floor sits on the bottom edge when the canvas is taller
    const camx = Math.round(S.cam.x * sc) / sc, oy = Math.max(0, vh - L.H * TS);
    sky(c, th, vw, vh, camx, o.t, o.dark);
    const shx = S.shake > 0 ? Math.sin(o.t * 2.1) * Math.min(S.shake, 6) * 0.35 : 0, shy = S.shake > 0 ? Math.cos(o.t * 1.7) * Math.min(S.shake, 6) * 0.3 : 0;
    c.translate(-camx + shx, oy + shy);
    const tx0 = Math.max(0, Math.floor(camx / TS) - 1), tx1 = Math.min(L.W - 1, Math.ceil((camx + vw) / TS) + 1);
    const oo = { t: o.t, medGot: o.medGot };
    // water goes behind things, in front of the sky
    for (let ty = 0; ty < L.H; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const t = E.tl(S, tx, ty); if (t === 0) continue;
      if (t === T.WATER) continue;
      c.save(); drawTile(c, S, th, tx, ty, t, oo); c.restore();
    }
    c.fillStyle = th.gFill; c.fillRect(camx - 8, L.H * TS, vw + 16, 400);
    // platforms and creatures
    for (const e of S.en) { if (e.x + e.w < camx - 40 || e.x > camx + vw + 40) continue; if (e.k === 'plat') drawPlat(c, e, th, o.t); }
    for (const e of S.en) { if (e.k === 'plat') continue; const ax = e.k === 'pend' ? e.ax : e.x; if (ax + e.w < camx - 90 || ax > camx + vw + 90) continue; c.save(); drawEnemy(c, e, th, o.t, S); c.restore(); }
    if (o.ghost) { c.save(); c.globalAlpha = 0.4; drawPlayer(c, o.ghost.p, o.t, o.ghost); c.restore(); }
    c.save(); drawPlayer(c, S.p, o.t, S); c.restore();
    // water overlay (in front)
    c.fillStyle = 'rgba(70,170,240,.38)';
    for (let ty = 0; ty < L.H; ty++) for (let tx = tx0; tx <= tx1; tx++) if (E.tl(S, tx, ty) === T.WATER) { const top = E.tl(S, tx, ty - 1) !== T.WATER; c.fillRect(tx * TS, ty * TS + (top ? 3 : 0), TS, TS - (top ? 3 : 0)); if (top) { c.fillStyle = 'rgba(255,255,255,.7)'; c.fillRect(tx * TS, ty * TS + 2 + Math.sin(o.t * 0.1 + tx) * 0.8, TS, 1.2); c.fillStyle = 'rgba(70,170,240,.38)'; } }
    if (o.fx) o.fx.draw(c);
    if (L.meta.dark && !o.noDark) { // darkness: only a small light around the hero; medals, flags and the goal keep a faint glow
      const hp = S.p, hx = hp.x + hp.w / 2, hy = hp.y + hp.h / 2, r1 = 96 + Math.sin(o.t * 0.05) * 3;
      const g = c.createRadialGradient(hx, hy, 18, hx, hy, r1); g.addColorStop(0, 'rgba(6,6,28,0)'); g.addColorStop(1, 'rgba(6,6,28,.9)');
      c.fillStyle = g; c.fillRect(camx - 20, -60, vw + 40, vh + 140);
      for (let ty = 0; ty < L.H; ty++) for (let tx = tx0; tx <= tx1; tx++) { const t = E.tl(S, tx, ty); if (t === T.MEDAL || t === T.CP || t === T.GOAL || t === T.COIN) { c.save(); c.globalAlpha = 0.9; drawTile(c, S, th, tx, ty, t, oo); c.restore(); } }
    }
    c.restore();
  }
  // a still scene for thumbnails and icons
  const API = { THEMES, draw, feed, Fx, drawTile, drawEnemy, drawPlayer, sky, heart, starPath, rr };
  if (typeof module === 'object' && module && module.exports) module.exports = API;
  root.HopArt = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
