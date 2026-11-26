// のんびり釣り：絵（Canvas。画像ファイルなし）。魚はパーツ（体の輪郭・尾・背びれ・飾り・もよう・色）から描く。
// drawFish(ctx, art, x, y, w, opts) … 魚1ひき。drawScene(ctx, W, H, S) … 場所・時刻・天気つきの背景と、つり人・ウキ・糸。
(function (root) {
  'use strict';
  const TAU = Math.PI * 2, clamp = (x, a, b) => Math.max(a, Math.min(b, x)), lerp = (a, b, t) => a + (b - a) * t;
  function hex(c) { c = c.replace('#', ''); if (c.length === 3) c = c[0] + c[0] + c[1] + c[1] + c[2] + c[2]; const n = parseInt(c, 16); return [(n >> 16) & 255, (n >> 8) & 255, n & 255]; }
  const rgb = a => 'rgb(' + a.map(v => Math.round(clamp(v, 0, 255))).join(',') + ')';
  const mix = (a, b, t) => { const x = typeof a === 'string' ? hex(a) : a, y = typeof b === 'string' ? hex(b) : b; return [lerp(x[0], y[0], t), lerp(x[1], y[1], t), lerp(x[2], y[2], t)]; };
  const shade = (c, f) => rgb(f < 0 ? mix(c, [0, 0, 20], -f) : mix(c, [255, 255, 240], f));
  function prng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash(s) { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h; }

  // ---- 体の輪郭（頭が +x、尾が -x。長さ約1） ----
  const PROF = { fus: { a: 0.85, b: 0.7, c: 0.14, bel: 1.1 }, dee: { a: 0.9, b: 0.55, c: 0.1, bel: 1.15 }, lon: { a: 0.75, b: 0.5, c: 0.3, bel: 0.9 }, tor: { a: 1.4, b: 0.6, c: 0.12, bel: 1.05 },
    cat: { a: 0.65, b: 0.7, c: 0.2, bel: 0.75 }, sha: { a: 1.2, b: 0.55, c: 0.12, bel: 0.95 }, rou: { a: 0.9, b: 0.42, c: 0.08, bel: 1 }, eel: { a: 0.5, b: 0.35, c: 0.85, bel: 1 }, fla: { a: 0.9, b: 0.5, c: 0.1, bel: 1 }, ang: { a: 0.7, b: 0.45, c: 0.12, bel: 1.1 } };
  const X0 = -0.36, X1 = 0.5, NP = 28;
  function bodyPts(art, t) {
    const P = PROF[art.shape] || PROF.fus, hh = clamp(art.D / art.L * 0.31, 0.03, 0.34), up = [], dn = [];
    for (let k = 0; k <= NP; k++) { const u = k / NP; let s = P.c + (1 - P.c) * Math.pow(Math.max(0, Math.sin(Math.PI * Math.pow(u, P.a))), P.b); if (u > 0.94) s *= 1 - (u - 0.94) * 6 * (art.shape === 'sha' || art.shape === 'lon' ? 1.2 : 0.6);
      const x = lerp(X0, X1, u), wave = art.shape === 'eel' ? Math.sin(u * 7 + t * 4) * 0.05 * (1 - u * 0.4) : 0;
      up.push([x, -hh * s + wave]); dn.push([x, hh * s * P.bel + wave]); }
    return { up, dn, hh };
  }
  function pathBody(ctx, b) { ctx.beginPath(); ctx.moveTo(b.up[0][0], b.up[0][1]); for (const p of b.up) ctx.lineTo(p[0], p[1]); for (let k = b.dn.length - 1; k >= 0; k--) ctx.lineTo(b.dn[k][0], b.dn[k][1]); ctx.closePath(); }
  function tailShape(ctx, art, b, wag, ink, col) {
    const base = b.up[0], bd = b.dn[0], cy = (base[1] + bd[1]) / 2, hh = Math.max(0.05, b.hh), len = art.shape === 'eel' ? 0.07 : 0.2;
    ctx.save(); ctx.translate(X0 + 0.01, cy); ctx.rotate(wag); ctx.beginPath();
    switch (art.tail) {
      case 'fork': ctx.moveTo(0, -0.03); ctx.lineTo(-len, -hh * 1.35); ctx.lineTo(-len * 0.65, 0); ctx.lineTo(-len, hh * 1.35); ctx.lineTo(0, 0.03); break;
      case 'lun': ctx.moveTo(0, -0.025); ctx.quadraticCurveTo(-len * 0.4, -hh * 1.8, -len * 1.1, -hh * 2); ctx.quadraticCurveTo(-len * 0.55, -hh * 0.3, -len * 0.6, 0); ctx.quadraticCurveTo(-len * 0.55, hh * 0.3, -len * 1.1, hh * 2); ctx.quadraticCurveTo(-len * 0.4, hh * 1.8, 0, 0.025); break;
      case 'fan': ctx.moveTo(0, -0.02); ctx.quadraticCurveTo(-len * 1.1, -hh * 2.2, -len * 1.35, -hh * 0.6); ctx.quadraticCurveTo(-len * 1.2, 0, -len * 1.35, hh * 0.6); ctx.quadraticCurveTo(-len * 1.1, hh * 2.2, 0, 0.02); break;
      case 'fil': ctx.moveTo(0, -0.02); ctx.quadraticCurveTo(-len, -hh * 0.6, -len * 2.1, 0); ctx.quadraticCurveTo(-len, hh * 0.6, 0, 0.02); break;
      default: ctx.moveTo(0, -0.03); ctx.quadraticCurveTo(-len * 1.2, -hh * 1.5, -len * 1.1, 0); ctx.quadraticCurveTo(-len * 1.2, hh * 1.5, 0, 0.03);
    }
    ctx.closePath(); ctx.fillStyle = col; ctx.fill(); ctx.strokeStyle = ink; ctx.lineWidth = 0.008; ctx.stroke(); ctx.restore();
  }
  function dorsal(ctx, art, b, ink, col) {
    const f = art.fin; if (f === 'none') return; const hh = b.hh, pts = b.up; const at = u => pts[clamp(Math.round(u * NP), 0, NP)];
    ctx.beginPath(); const mk = (u0, u1, h, spikes) => { const p0 = at(u0), p1 = at(u1); ctx.moveTo(p0[0], p0[1] + 0.01);
      if (spikes) { for (let k = 0; k <= spikes; k++) { const u = lerp(u0, u1, k / spikes), p = at(u); ctx.lineTo(p[0] + 0.01, p[1] - h * (k % 2 ? 0.5 : 1)); } } else { const m = at((u0 + u1) / 2); ctx.quadraticCurveTo(m[0] - 0.02, m[1] - h * 1.6, p1[0], p1[1] + 0.01); return; } ctx.lineTo(p1[0], p1[1] + 0.01); };
    if (f === 'low') mk(0.38, 0.62, hh * 0.35); else if (f === 'mid') mk(0.3, 0.68, hh * 0.6); else if (f === 'high') mk(0.3, 0.62, hh * 1.1); else if (f === 'sail') mk(0.25, 0.75, hh * 1.9);
    else if (f === 'spin') mk(0.25, 0.7, hh * 0.65, 8); else if (f === 'long') mk(0.12, 0.8, hh * 0.38);
    else if (f === 'two') { mk(0.26, 0.45, hh * 0.55); mk(0.55, 0.65, hh * 0.3); }
    ctx.closePath(); ctx.fillStyle = col; ctx.globalAlpha *= 0.9; ctx.fill(); ctx.globalAlpha /= 0.9; ctx.strokeStyle = ink; ctx.lineWidth = 0.007; ctx.stroke();
  }
  function pattern(ctx, art, b, key) {
    const r = prng(hash(key)), hh = b.hh, c1 = art.c1, c3 = art.c3, dark = shade(c1, -0.45), lite = shade(c1, 0.4); ctx.save();
    switch (art.pat) {
      case 'bars': { const n = 4 + Math.floor(r() * 3); ctx.fillStyle = dark; ctx.globalAlpha = 0.55; for (let k = 0; k < n; k++) { const x = lerp(-0.2, 0.34, (k + 0.5) / n); ctx.fillRect(x - 0.02, -0.5, 0.04, 1); } break; }
      case 'line': ctx.fillStyle = c3; ctx.globalAlpha = 0.85; ctx.fillRect(-0.32, -hh * 0.06, 0.8, hh * 0.22); break;
      case 'spot': { ctx.fillStyle = c3; ctx.globalAlpha = 0.8; for (let k = 0; k < 14; k++) { ctx.beginPath(); ctx.arc(lerp(-0.25, 0.38, r()), (r() - 0.5) * hh * 1.6, 0.012 + r() * 0.014, 0, TAU); ctx.fill(); } break; }
      case 'saddle': { ctx.fillStyle = c3; ctx.globalAlpha = 0.8; for (let k = 0; k < 4; k++) { const x = lerp(-0.2, 0.3, (k + 0.5) / 4); ctx.beginPath(); ctx.ellipse(x, -hh * 0.75, 0.05, hh * 0.45, 0, 0, TAU); ctx.fill(); } break; }
      case 'mott': { ctx.globalAlpha = 0.5; for (let k = 0; k < 16; k++) { ctx.fillStyle = r() < 0.5 ? dark : c3; ctx.beginPath(); ctx.ellipse(lerp(-0.3, 0.4, r()), (r() - 0.5) * hh * 1.8, 0.02 + r() * 0.04, 0.012 + r() * 0.03, r() * 3, 0, TAU); ctx.fill(); } break; }
      case 'scale': { ctx.strokeStyle = dark; ctx.globalAlpha = 0.35; ctx.lineWidth = 0.004; for (let ix = 0; ix < 12; ix++) for (let iy = -3; iy <= 3; iy++) { const x = -0.3 + ix * 0.06 + (iy & 1) * 0.03, y = iy * hh * 0.28; ctx.beginPath(); ctx.arc(x, y, 0.03, -1.2, 1.2); ctx.stroke(); } break; }
      case 'glow': { ctx.fillStyle = c3; for (let k = 0; k < 10; k++) { const x = lerp(-0.25, 0.38, r()), y = hh * (0.25 + r() * 0.6); ctx.globalAlpha = 0.25; ctx.beginPath(); ctx.arc(x, y, 0.03, 0, TAU); ctx.fill(); ctx.globalAlpha = 0.95; ctx.beginPath(); ctx.arc(x, y, 0.011, 0, TAU); ctx.fill(); } break; }
      case 'grad': { const g = ctx.createLinearGradient(-0.35, 0, 0.5, 0); g.addColorStop(0, c3); g.addColorStop(0.6, 'rgba(0,0,0,0)'); ctx.globalAlpha = 0.7; ctx.fillStyle = g; ctx.fillRect(-0.4, -0.5, 1, 1); break; }
      default: break;
    }
    ctx.restore(); void lite;
  }
  function extras(ctx, art, b, ink) {
    const hh = b.hh, nose = b.up[NP], x = nose[0], mid = (b.up[NP][1] + b.dn[NP][1]) / 2;
    switch (art.ext) {
      case 'barb': ctx.strokeStyle = ink; ctx.lineWidth = 0.008; ctx.beginPath(); ctx.moveTo(x - 0.01, mid + hh * 0.2); ctx.quadraticCurveTo(x + 0.06, mid + hh * 0.5, x + 0.05, mid + hh * 1.1); ctx.moveTo(x - 0.03, mid + hh * 0.3); ctx.quadraticCurveTo(x + 0.03, mid + hh * 0.9, x + 0.0, mid + hh * 1.4); ctx.stroke(); break;
      case 'lure': { const lx = x - 0.12, ly = -hh * 2.2; ctx.strokeStyle = ink; ctx.lineWidth = 0.01; ctx.beginPath(); ctx.moveTo(x - 0.16, -hh * 0.9); ctx.quadraticCurveTo(x - 0.1, -hh * 2.4, x + 0.1, -hh * 1.9); ctx.stroke();
        ctx.fillStyle = 'rgba(255,240,150,.35)'; ctx.beginPath(); ctx.arc(x + 0.1, -hh * 1.9, 0.07, 0, TAU); ctx.fill(); ctx.fillStyle = '#fff6a8'; ctx.beginPath(); ctx.arc(x + 0.1, -hh * 1.9, 0.028, 0, TAU); ctx.fill(); void lx; void ly; break; }
      case 'beak': ctx.fillStyle = art.c3; ctx.strokeStyle = ink; ctx.lineWidth = 0.006; ctx.beginPath(); ctx.moveTo(x - 0.03, mid - hh * 0.2); ctx.lineTo(x + 0.14, mid + hh * 0.25); ctx.lineTo(x - 0.03, mid + hh * 0.35); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      case 'bill': ctx.fillStyle = shade(art.c1, -0.2); ctx.strokeStyle = ink; ctx.lineWidth = 0.006; ctx.beginPath(); ctx.moveTo(x - 0.03, mid - 0.02); ctx.lineTo(x + 0.34, mid); ctx.lineTo(x - 0.03, mid + 0.025); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      case 'hump': ctx.fillStyle = shade(art.c1, 0.1); ctx.strokeStyle = ink; ctx.lineWidth = 0.006; ctx.beginPath(); ctx.ellipse(x - 0.09, -hh * 0.95, 0.07, hh * 0.5, -0.3, 0, TAU); ctx.fill(); ctx.stroke(); break;
      case 'tube': ctx.fillStyle = art.c3; ctx.strokeStyle = ink; ctx.lineWidth = 0.006; ctx.beginPath(); ctx.rect(x - 0.02, mid - hh * 0.2, 0.09, hh * 0.45); ctx.fill(); ctx.stroke(); break;
      case 'horn': ctx.fillStyle = art.c3; ctx.strokeStyle = ink; ctx.lineWidth = 0.006; ctx.beginPath(); ctx.moveTo(x - 0.12, -hh * 0.8); ctx.lineTo(x - 0.05, -hh * 2.1); ctx.lineTo(x - 0.03, -hh * 0.75); ctx.closePath(); ctx.fill(); ctx.stroke(); break;
      case 'spot': ctx.fillStyle = art.c3; ctx.strokeStyle = ink; ctx.lineWidth = 0.006; ctx.beginPath(); ctx.arc(X0 + 0.2, 0, hh * 0.45, 0, TAU); ctx.fill(); ctx.stroke(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(X0 + 0.2, 0, hh * 0.18, 0, TAU); ctx.fill(); break;
      default: break;
    }
  }
  function eye(ctx, b, size, ink) { const p = b.up[NP - 4]; const ey = p[1] + b.hh * 0.55, ex = p[0]; ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(ex, ey, size, 0, TAU); ctx.fill(); ctx.fillStyle = ink; ctx.beginPath(); ctx.arc(ex + size * 0.2, ey, size * 0.55, 0, TAU); ctx.fill(); }
  function fishBody(ctx, art, o) {
    const b = bodyPts(art, o.t), ink = shade(art.c1, -0.55), wag = Math.sin(o.t * 6) * 0.18 * (o.wag == null ? 1 : o.wag);
    if (o.sil) { ctx.fillStyle = o.sil; tailShape(ctx, art, b, wag, o.sil, o.sil); dorsal(ctx, art, b, o.sil, o.sil); pathBody(ctx, b); ctx.fill(); if (art.ext === 'barb' || art.ext === 'lure' || art.ext === 'beak' || art.ext === 'bill' || art.ext === 'horn' || art.ext === 'tube' || art.ext === 'hump') extras(ctx, Object.assign({}, art, { c3: o.sil, c1: o.sil }), b, o.sil); return; }
    tailShape(ctx, art, b, wag, ink, shade(art.c3, -0.05));
    if (art.shape === 'fla') { ctx.fillStyle = shade(art.c1, -0.15); ctx.beginPath(); ctx.moveTo(-0.3, -b.hh); ctx.quadraticCurveTo(0.1, -b.hh * 1.35, 0.4, -b.hh * 0.3); ctx.lineTo(0.4, 0.2); ctx.quadraticCurveTo(0.1, b.hh * 1.4, -0.3, b.hh); ctx.closePath(); ctx.fill(); }
    dorsal(ctx, art, b, ink, shade(art.c3, -0.05));
    // はら・むなびれ
    ctx.fillStyle = shade(art.c3, -0.1); ctx.strokeStyle = ink; ctx.lineWidth = 0.007; const pb = b.dn[Math.round(NP * 0.62)]; ctx.beginPath(); ctx.moveTo(pb[0] - 0.05, pb[1] - 0.01); ctx.lineTo(pb[0] - 0.12, pb[1] + b.hh * 0.6 + 0.02); ctx.lineTo(pb[0] + 0.02, pb[1] - 0.005); ctx.closePath(); ctx.fill(); ctx.stroke();
    const g = ctx.createLinearGradient(0, -b.hh, 0, b.hh * 1.1); g.addColorStop(0, art.c1); g.addColorStop(0.55, rgb(mix(art.c1, art.c2, 0.45))); g.addColorStop(1, art.c2);
    pathBody(ctx, b); ctx.fillStyle = g; ctx.fill(); ctx.save(); pathBody(ctx, b); ctx.clip(); pattern(ctx, art, b, o.key || art.c1 + art.pat); ctx.restore();
    pathBody(ctx, b); ctx.strokeStyle = ink; ctx.lineWidth = 0.01; ctx.stroke();
    const gp = b.up[NP - 9]; ctx.strokeStyle = ink; ctx.globalAlpha = 0.4; ctx.lineWidth = 0.006; ctx.beginPath(); ctx.moveTo(gp[0], gp[1] + 0.02); ctx.quadraticCurveTo(gp[0] - 0.03, 0, gp[0], b.dn[NP - 9][1] - 0.02); ctx.stroke(); ctx.globalAlpha = 1;
    extras(ctx, art, b, ink); eye(ctx, b, Math.max(0.014, b.hh * 0.22), '#111');
  }
  // ---- ふつうの魚でない形 ----
  function drawRay(ctx, a, o) { const ink = shade(a.c1, -0.55), w = a.D / a.L; const wob = Math.sin(o.t * 3) * 0.06; ctx.beginPath(); ctx.moveTo(0.46, 0); ctx.quadraticCurveTo(0.2, -0.3 - wob, -0.18, -0.34 - wob * 2); ctx.quadraticCurveTo(-0.12, 0, -0.18, 0.34 + wob * 2); ctx.quadraticCurveTo(0.2, 0.3 + wob, 0.46, 0); ctx.closePath();
    const g = ctx.createLinearGradient(0, -0.3, 0, 0.3); g.addColorStop(0, a.c1); g.addColorStop(1, a.c2); if (o.sil) ctx.fillStyle = o.sil; else { ctx.strokeStyle = ink; ctx.lineWidth = 0.008; ctx.beginPath(); ctx.moveTo(-0.14, 0); ctx.quadraticCurveTo(-0.4, 0.01, -0.55 - w * 0.05, 0.04); ctx.stroke(); ctx.beginPath(); ctx.moveTo(0.46, 0); ctx.quadraticCurveTo(0.2, -0.3 - wob, -0.18, -0.34 - wob * 2); ctx.quadraticCurveTo(-0.12, 0, -0.18, 0.34 + wob * 2); ctx.quadraticCurveTo(0.2, 0.3 + wob, 0.46, 0); ctx.closePath(); ctx.fillStyle = g; }
    ctx.fill(); if (!o.sil) { ctx.strokeStyle = ink; ctx.lineWidth = 0.01; ctx.stroke(); ctx.save(); ctx.clip(); const b = { hh: 0.2 }; pattern(ctx, a, b, o.key || 'ray'); ctx.restore(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0.3, -0.05, 0.012, 0, TAU); ctx.arc(0.3, 0.05, 0.012, 0, TAU); ctx.fill(); if (a.ext === 'horn') { ctx.fillStyle = a.c2; ctx.beginPath(); ctx.moveTo(0.43, -0.06); ctx.lineTo(0.55, -0.05); ctx.lineTo(0.43, -0.015); ctx.moveTo(0.43, 0.06); ctx.lineTo(0.55, 0.05); ctx.lineTo(0.43, 0.015); ctx.fill(); } } }
  function drawSeahorse(ctx, a, o) { const ink = shade(a.c1, -0.55), sw = Math.sin(o.t * 2) * 0.02; ctx.save(); ctx.rotate(-Math.PI / 2 * 0); ctx.fillStyle = o.sil || a.c1; ctx.strokeStyle = o.sil || ink; ctx.lineWidth = 0.012;
    ctx.beginPath(); ctx.moveTo(0.1, -0.3); ctx.quadraticCurveTo(0.2, -0.35, 0.34, -0.28); ctx.lineTo(0.42, -0.26); ctx.lineTo(0.34, -0.23); ctx.quadraticCurveTo(0.2, -0.2, 0.2, -0.1); ctx.quadraticCurveTo(0.26, 0.1, 0.1, 0.2); ctx.quadraticCurveTo(-0.06 + sw, 0.32, -0.12, 0.2); ctx.quadraticCurveTo(-0.16, 0.12, -0.08, 0.14); ctx.quadraticCurveTo(0.0, 0.12, 0.0, 0); ctx.quadraticCurveTo(-0.08, -0.12, 0.02, -0.26); ctx.closePath(); ctx.fill(); if (!o.sil) { ctx.stroke(); ctx.fillStyle = a.c3; ctx.beginPath(); ctx.arc(0.08, -0.05, 0.02, 0, TAU); ctx.arc(0.12, 0.05, 0.02, 0, TAU); ctx.arc(0.08, 0.14, 0.02, 0, TAU); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0.16, -0.27, 0.012, 0, TAU); ctx.fill(); } ctx.restore(); }
  function drawSquid(ctx, a, o) { const ink = shade(a.c1, -0.5), body = a.L / 22 + 0.18; ctx.fillStyle = o.sil || a.c1; ctx.strokeStyle = o.sil || ink; ctx.lineWidth = 0.01;
    ctx.beginPath(); ctx.moveTo(-0.2 - body * 0.3, 0); ctx.quadraticCurveTo(-0.05, -0.17 * (a.D / 6 + 0.3), 0.25, -0.1); ctx.lineTo(0.25, 0.1); ctx.quadraticCurveTo(-0.05, 0.17 * (a.D / 6 + 0.3), -0.2 - body * 0.3, 0); ctx.fill(); if (!o.sil) ctx.stroke();
    if (a.tail === 'fan' || a.tail === 'lun') { ctx.beginPath(); ctx.moveTo(-0.2 - body * 0.3, 0); ctx.lineTo(-0.1, -0.13); ctx.lineTo(-0.05, 0); ctx.lineTo(-0.1, 0.13); ctx.closePath(); ctx.fillStyle = o.sil || a.c3; ctx.fill(); }
    ctx.strokeStyle = o.sil || a.c2; ctx.lineWidth = 0.014; for (let k = 0; k < 6; k++) { const y = (k - 2.5) * 0.034, w = Math.sin(o.t * 4 + k) * 0.015; ctx.beginPath(); ctx.moveTo(0.25, y); ctx.quadraticCurveTo(0.36, y + w, 0.46 + (k % 3) * 0.02, y * 1.4 + w); ctx.stroke(); }
    if (!o.sil) { ctx.save(); ctx.beginPath(); ctx.moveTo(-0.2 - body * 0.3, 0); ctx.quadraticCurveTo(-0.05, -0.17, 0.25, -0.1); ctx.lineTo(0.25, 0.1); ctx.quadraticCurveTo(-0.05, 0.17, -0.2 - body * 0.3, 0); ctx.clip(); pattern(ctx, a, { hh: 0.1 }, o.key || 'sq'); ctx.restore(); ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(0.19, -0.03, 0.025, 0, TAU); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0.2, -0.03, 0.014, 0, TAU); ctx.fill(); } }
  function drawOcto(ctx, a, o) { const ink = shade(a.c1, -0.5), R = 0.13 + a.D / 80; ctx.fillStyle = o.sil || a.c1; ctx.strokeStyle = o.sil || ink; ctx.lineWidth = 0.012; ctx.lineCap = 'round';
    for (let k = 0; k < 8; k++) { const ang = Math.PI * (0.62 + k * 0.1), w = Math.sin(o.t * 3 + k) * 0.05, ex = -0.05 + Math.cos(ang) * 0.5 + w, ey = Math.sin(ang) * 0.34; ctx.lineWidth = 0.035; ctx.strokeStyle = o.sil || a.c1; ctx.beginPath(); ctx.moveTo(0, 0.04); ctx.quadraticCurveTo(Math.cos(ang) * 0.2, 0.15, ex, ey); ctx.stroke(); }
    ctx.lineWidth = 0.01; ctx.strokeStyle = o.sil || ink; ctx.beginPath(); ctx.ellipse(0, -0.04, R * 1.15, R, 0, 0, TAU); ctx.fill(); if (!o.sil) { ctx.stroke(); ctx.save(); ctx.beginPath(); ctx.ellipse(0, -0.04, R * 1.15, R, 0, 0, TAU); ctx.clip(); pattern(ctx, a, { hh: R }, o.key || 'oc'); ctx.restore(); if (a.pat === 'grad' && a.D < 10) { ctx.fillStyle = a.c3; ctx.beginPath(); ctx.ellipse(-R * 1.1, -0.1, 0.04, 0.07, -0.5, 0, TAU); ctx.ellipse(R * 1.1, -0.1, 0.04, 0.07, 0.5, 0, TAU); ctx.fill(); } ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.arc(-0.05, 0.0, 0.025, 0, TAU); ctx.arc(0.06, 0.0, 0.025, 0, TAU); ctx.fill(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-0.05, 0.005, 0.014, 0, TAU); ctx.arc(0.06, 0.005, 0.014, 0, TAU); ctx.fill(); } }
  function drawCrab(ctx, a, o) { const ink = shade(a.c1, -0.55), W = 0.18 + a.L / 90, H = 0.12 + a.D / 110, shr = a.L > 11; ctx.lineCap = 'round'; ctx.strokeStyle = o.sil || ink;
    for (let s = -1; s <= 1; s += 2) for (let k = 0; k < 3; k++) { const x = -0.12 + k * 0.12, w = Math.sin(o.t * 5 + k * 2 + s) * 0.02; ctx.lineWidth = 0.014; ctx.beginPath(); ctx.moveTo(x, 0.02); ctx.lineTo(x + w, 0.17 + 0.02 * s + (shr ? 0.05 : 0)); ctx.lineTo(x + w * 2, 0.27 + (shr ? 0.08 : 0)); ctx.stroke(); }
    for (const sx of [1, -1]) { ctx.fillStyle = o.sil || a.c3; ctx.lineWidth = 0.012; ctx.beginPath(); ctx.moveTo(sx * W * 0.7, -H * 0.2); ctx.lineTo(sx * (W + 0.1), -H * 1.4); ctx.lineTo(sx * (W + 0.17), -H * 0.9); ctx.lineTo(sx * (W + 0.08), -H * 0.55); ctx.lineTo(sx * (W + 0.16), -H * 0.2); ctx.lineTo(sx * W * 0.8, 0.0); ctx.closePath(); ctx.fill(); ctx.stroke(); }
    ctx.fillStyle = o.sil || a.c1; ctx.beginPath(); ctx.ellipse(0, 0, W, H, 0, 0, TAU); ctx.fill(); ctx.stroke();
    if (!o.sil) { ctx.save(); ctx.beginPath(); ctx.ellipse(0, 0, W, H, 0, 0, TAU); ctx.clip(); pattern(ctx, a, { hh: H }, o.key || 'cr'); ctx.restore(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(-0.05, -H * 0.9, 0.018, 0, TAU); ctx.arc(0.05, -H * 0.9, 0.018, 0, TAU); ctx.fill(); if (a.ext === 'horn') { ctx.fillStyle = a.c2; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 0.06 - 0.02, -H * 0.8); ctx.lineTo(k * 0.06, -H * 1.5); ctx.lineTo(k * 0.06 + 0.02, -H * 0.8); ctx.fill(); } } } }
  function drawShrimp(ctx, a, o) { const ink = shade(a.c1, -0.5), n = 6, col = o.sil || a.c1; ctx.lineCap = 'round'; ctx.strokeStyle = col; ctx.lineWidth = 0.012; ctx.beginPath(); ctx.moveTo(0.3, -0.12); ctx.quadraticCurveTo(0.55, -0.22, 0.62, -0.1); ctx.moveTo(0.3, -0.08); ctx.quadraticCurveTo(0.6, -0.05, 0.64, 0.05); ctx.stroke();
    for (let k = 0; k < n; k++) { const u = k / (n - 1), x = lerp(0.3, -0.3, u), y = -Math.sin(u * Math.PI) * 0.1 + u * 0.18, r = 0.075 - u * 0.03; ctx.fillStyle = k % 2 && !o.sil ? shade(a.c1, 0.1) : col; ctx.strokeStyle = o.sil || ink; ctx.lineWidth = 0.008; ctx.beginPath(); ctx.ellipse(x, y, r * 1.2, r, 0, 0, TAU); ctx.fill(); if (!o.sil) ctx.stroke(); }
    ctx.fillStyle = o.sil || a.c3; ctx.beginPath(); ctx.moveTo(-0.3, 0.18); ctx.lineTo(-0.42, 0.1); ctx.lineTo(-0.44, 0.2); ctx.lineTo(-0.4, 0.3); ctx.closePath(); ctx.fill(); if (!o.sil) { ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0.3, -0.1, 0.018, 0, TAU); ctx.fill(); if (a.ext === 'horn') { ctx.fillStyle = a.c3; ctx.beginPath(); ctx.ellipse(0.38, 0.02, 0.07, 0.04, 0.5, 0, TAU); ctx.fill(); } } }
  function drawJelly(ctx, a, o) { const R = 0.2 + a.L / 80, ink = shade(a.c1, -0.4), pul = 1 + Math.sin(o.t * 2.5) * 0.06; ctx.lineCap = 'round';
    const starfish = a.pat === 'spot' && a.D === a.L && a.tail === 'none' && a.fin === 'none' && a.ext === '-' && a.L === 8; if (starfish) { ctx.fillStyle = o.sil || a.c1; ctx.strokeStyle = o.sil || ink; ctx.lineWidth = 0.012; ctx.beginPath(); for (let k = 0; k < 10; k++) { const r = k % 2 ? 0.1 : 0.4, ang = k * Math.PI / 5 - Math.PI / 2; ctx.lineTo(Math.cos(ang) * r, Math.sin(ang) * r); } ctx.closePath(); ctx.fill(); if (!o.sil) { ctx.stroke(); ctx.fillStyle = a.c3; for (let k = 0; k < 5; k++) { const ang = k * TAU / 5 - Math.PI / 2; ctx.beginPath(); ctx.arc(Math.cos(ang) * 0.22, Math.sin(ang) * 0.22, 0.02, 0, TAU); ctx.fill(); } } return; }
    if (a.ext === 'horn') { const sl = true; ctx.fillStyle = o.sil || a.c1; ctx.strokeStyle = o.sil || ink; ctx.lineWidth = 0.012; ctx.beginPath(); ctx.ellipse(0, 0, sl ? 0.33 : 0.28, sl ? 0.16 : 0.2, 0, 0, TAU); ctx.fill(); if (!o.sil) { ctx.stroke(); ctx.fillStyle = a.c3; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(-0.18 + k * 0.12, -0.05 + (k % 2) * 0.08, 0.035, 0.03, 0, 0, TAU); ctx.fill(); } ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0.22, -0.02, 0.014, 0, TAU); ctx.fill(); } if (a.ext === 'horn') { ctx.strokeStyle = o.sil || a.c3; ctx.lineWidth = 0.016; for (let k = -2; k <= 2; k++) { ctx.beginPath(); ctx.moveTo(k * 0.08, -0.15); ctx.quadraticCurveTo(k * 0.09, -0.3, k * 0.06 + 0.02, -0.34); ctx.stroke(); } } return; }
    ctx.save(); ctx.scale(1, pul); ctx.beginPath(); ctx.arc(0, -0.05, R, Math.PI, TAU); ctx.quadraticCurveTo(R * 0.6, 0.08, 0, 0.06); ctx.quadraticCurveTo(-R * 0.6, 0.08, -R, -0.05); ctx.closePath(); ctx.fillStyle = o.sil || rgb(mix(a.c1, '#ffffff', 0.15)); ctx.globalAlpha *= o.sil ? 1 : 0.88; ctx.fill(); ctx.globalAlpha /= o.sil ? 1 : 0.88; if (!o.sil) { ctx.strokeStyle = ink; ctx.lineWidth = 0.008; ctx.stroke(); ctx.strokeStyle = a.c3; ctx.lineWidth = 0.012; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.ellipse(0, -0.06, R * 0.14 * (k + 1), R * 0.07 * (k + 1), 0, Math.PI, TAU); ctx.stroke(); } } ctx.restore();
    ctx.strokeStyle = o.sil || a.c2; ctx.lineWidth = 0.012; for (let k = -3; k <= 3; k++) { const w = Math.sin(o.t * 3 + k) * 0.03; ctx.beginPath(); ctx.moveTo(k * R * 0.28, 0.06); ctx.quadraticCurveTo(k * R * 0.28 + w, 0.2, k * R * 0.26 - w, 0.34 + (k & 1) * 0.08); ctx.stroke(); } }
  function drawTurtle(ctx, a, o) { const ink = shade(a.c1, -0.55); ctx.fillStyle = o.sil || a.c3; ctx.strokeStyle = o.sil || ink; ctx.lineWidth = 0.01; const f = Math.sin(o.t * 3) * 0.05; ctx.beginPath(); ctx.ellipse(0.1, 0.15 + f, 0.2, 0.06, 0.6, 0, TAU); ctx.fill(); if (!o.sil) ctx.stroke(); ctx.beginPath(); ctx.ellipse(-0.1, -0.15 - f, 0.2, 0.06, -0.6, 0, TAU); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0.4, 0, 0.1, 0.07, 0, 0, TAU); ctx.fill(); if (!o.sil) { ctx.stroke(); ctx.fillStyle = '#111'; ctx.beginPath(); ctx.arc(0.43, -0.02, 0.012, 0, TAU); ctx.fill(); } if (a.fin === 'low' || a.fin === 'none') { ctx.fillStyle = o.sil || a.c3; ctx.beginPath(); ctx.moveTo(-0.34, 0); ctx.lineTo(-0.5, 0.03); ctx.lineTo(-0.34, 0.06); ctx.fill(); }
    const g = ctx.createLinearGradient(0, -0.3, 0, 0.3); g.addColorStop(0, a.c1); g.addColorStop(1, a.c2); ctx.fillStyle = o.sil || g; ctx.beginPath(); ctx.moveTo(-0.34, 0.04); ctx.quadraticCurveTo(-0.3, -0.3, 0.05, -0.3); ctx.quadraticCurveTo(0.34, -0.28, 0.34, 0.04); ctx.closePath(); ctx.fill(); if (!o.sil) { ctx.stroke(); ctx.save(); ctx.clip(); ctx.strokeStyle = ink; ctx.globalAlpha = 0.4; ctx.lineWidth = 0.008; for (let k = -1; k <= 1; k++) for (let j = 0; j < 2; j++) { ctx.beginPath(); ctx.ellipse(k * 0.15, -0.12 - j * 0.1 + 0.05, 0.07, 0.06, 0, 0, TAU); ctx.stroke(); } ctx.restore(); } }
  // 1ひきを描く。w＝全体の幅（px）。opts: { t:時間, flip, sil:単色, rot, alpha, key, wag }
  function drawFish(ctx, art, x, y, w, o) {
    o = o || {}; ctx.save(); ctx.translate(x, y); const s = w / 1.12; ctx.scale(o.flip ? -s : s, s); if (o.rot) ctx.rotate(o.rot); if (o.alpha != null) ctx.globalAlpha = o.alpha; ctx.lineJoin = 'round'; o = Object.assign({ t: 0 }, o);
    // たてに長い形（タツノオトシゴ・クラゲ・ヒトデ）以外は横向き。体が長い魚は、枠におさまるよう縮める
    const long = { eel: 1, lon: 1 }[art.shape] ? clamp(11 / art.L, 0.5, 1) : 1; if (long < 1) ctx.scale(long * 1.0, 1);
    switch (art.shape) {
      case 'ray': drawRay(ctx, art, o); break; case 'sea': drawSeahorse(ctx, art, o); break; case 'squ': drawSquid(ctx, art, o); break; case 'oct': drawOcto(ctx, art, o); break;
      case 'cra': drawCrab(ctx, art, o); break; case 'shr': drawShrimp(ctx, art, o); break; case 'jel': drawJelly(ctx, art, o); break; case 'tur': drawTurtle(ctx, art, o); break;
      default: fishBody(ctx, art, o);
    }
    ctx.restore();
  }

  // ---- 背景 ----
  const SKY = [[0, '#050a1e', '#1a2a50'], [5, '#0d1633', '#2b3a68'], [6.5, '#e98a8a', '#ffd2a0'], [8.5, '#5aa9e8', '#cfeaff'], [15.5, '#5aa9e8', '#cfeaff'], [17.5, '#6d4a8c', '#ff9d5c'], [19.5, '#0d1633', '#2b3a68'], [24, '#050a1e', '#1a2a50']];
  function skyAt(h) { for (let i = 1; i < SKY.length; i++) if (h <= SKY[i][0]) { const a = SKY[i - 1], b = SKY[i], t = (h - a[0]) / (b[0] - a[0]); return [mix(a[1], b[1], t), mix(a[2], b[2], t)]; } return [hex(SKY[0][1]), hex(SKY[0][2])]; }
  const WATER = { fresh: ['#4a98b4', '#1f5a78'], brackish: ['#6a9c8e', '#2c5f5a'], salt: ['#3d8fd0', '#144a8a'] };
  const LOCSTYLE = { pond: { w: 'fresh', tint: [0.1, 0.3, 0.1], back: 'reeds' }, river: { w: 'fresh', back: 'hills' }, stream: { w: 'fresh', tint: [0.1, 0.35, 0.3], back: 'pines' }, estuary: { w: 'brackish', back: 'flat' }, harbour: { w: 'salt', back: 'harbour' },
    tide: { w: 'salt', tint: [0.2, 0.5, 0.45], back: 'rocks' }, rocky: { w: 'salt', back: 'cliff' }, open: { w: 'salt', back: 'open' }, reef: { w: 'salt', tint: [0.1, 0.8, 0.8], back: 'island' }, deep: { w: 'salt', dark: 0.7, back: 'deep' }, ice: { w: 'fresh', back: 'snow' }, night: { w: 'fresh', back: 'moon' } };
  function drawScene(ctx, W, H, S) {
    const env = S.env, st = LOCSTYLE[S.loc] || LOCSTYLE.pond, T = S.T || 0, hy = Math.round(H * (S.land ? 0.34 : 0.38)), h = env.hour;
    const gray = env.wx === 0 ? 0 : env.wx === 1 ? 0.35 : 0.6; let [top, bot] = skyAt(h); const dim = st.dark || 0; top = mix(mix(top, [128, 135, 145], gray), [0, 4, 10], dim); bot = mix(mix(bot, [150, 156, 165], gray), [2, 12, 24], dim);
    let g = ctx.createLinearGradient(0, 0, 0, hy); g.addColorStop(0, rgb(top)); g.addColorStop(1, rgb(bot)); ctx.fillStyle = g; ctx.fillRect(0, 0, W, hy + 1);
    const night = h < 5.5 || h >= 19.5, light = night ? 0.35 : h < 8 || h > 17 ? 0.75 : 1;
    if (night && env.wx < 2 && !dim) { const r = prng(77); ctx.fillStyle = '#fff'; for (let k = 0; k < 50; k++) { ctx.globalAlpha = (0.3 + r() * 0.7) * (0.6 + 0.4 * Math.sin(T * 1.5 + k)); ctx.fillRect(r() * W, r() * hy * 0.8, 1.5, 1.5); } ctx.globalAlpha = 1; }
    // 太陽・月
    const sunA = (h - 6) / 12, moonA = ((h + 6) % 24) / 12 - 1; const sx = t => W * (0.1 + 0.8 * t), sy = t => hy * (0.92 - 0.8 * Math.sin(Math.PI * clamp(t, 0, 1)));
    if (!dim && h >= 5.5 && h <= 19) { const t = sunA, x = sx(t), y = sy(t); const rg = ctx.createRadialGradient(x, y, 2, x, y, 70); rg.addColorStop(0, 'rgba(255,240,190,' + 0.7 * (1 - gray) + ')'); rg.addColorStop(1, 'rgba(255,240,190,0)'); ctx.fillStyle = rg; ctx.fillRect(x - 70, y - 70, 140, 140); ctx.fillStyle = rgb(mix('#ffe9a0', '#ff9d5c', Math.abs(t - 0.5) * 1.2)); ctx.globalAlpha = 1 - gray * 0.8; ctx.beginPath(); ctx.arc(x, y, 15, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; }
    if (night || S.loc === 'night') { const t = night ? clamp(moonA < 0 ? moonA + 2 : moonA, 0, 1) : 0.5, x = S.loc === 'night' ? W * 0.68 : sx(t), y = S.loc === 'night' ? hy * 0.3 : sy(t), r = S.loc === 'night' ? 26 : 13; if (night || S.loc === 'night') { ctx.globalAlpha = 1 - gray * 0.7; ctx.fillStyle = 'rgba(220,230,255,.18)'; ctx.beginPath(); ctx.arc(x, y, r * 2.2, 0, TAU); ctx.fill(); ctx.fillStyle = '#f2f1dc'; ctx.beginPath(); ctx.arc(x, y, r, 0, TAU); ctx.fill(); ctx.fillStyle = 'rgba(180,180,150,.4)'; ctx.beginPath(); ctx.arc(x - r * 0.3, y - r * 0.2, r * 0.25, 0, TAU); ctx.arc(x + r * 0.35, y + r * 0.25, r * 0.18, 0, TAU); ctx.fill(); ctx.globalAlpha = 1; S.moonX = x; } }
    // 雲（3層ゆっくり流れる）
    const nc = env.wx === 0 ? 3 : env.wx === 1 ? 7 : 10; for (let k = 0; k < nc; k++) { const sp = 6 + (k % 3) * 4, x = ((k * 97 + T * sp) % (W + 160)) - 80, y = hy * (0.12 + (k * 0.37 % 0.55)), s = 0.8 + (k % 3) * 0.3; ctx.fillStyle = 'rgba(' + (night ? '80,90,120' : '255,255,255') + ',' + (env.wx === 2 ? 0.75 : 0.55) + ')'; for (let j = 0; j < 4; j++) { ctx.beginPath(); ctx.ellipse(x + j * 16 * s, y + (j % 2) * 4, 22 * s, 10 * s, 0, 0, TAU); ctx.fill(); } }
    backdrop(ctx, W, H, hy, st, S, light, T);
    // 水（または氷）
    const wc = WATER[st.w], tint = st.tint || [0, 0, 0]; const topC = mix(mix(wc[0], tint.length === 3 && st.tint ? [tint[0] * 255, tint[1] * 255 + 60, tint[2] * 255 + 60] : wc[0], st.tint ? 0.2 : 0), [0, 0, 0], 1 - light * (1 - dim * 0.8)), botC = mix(wc[1], [0, 4, 12], 1 - light * (1 - dim * 0.5));
    if (S.loc === 'ice') { g = ctx.createLinearGradient(0, hy, 0, H); g.addColorStop(0, rgb(mix('#dff0fa', [20, 30, 60], 1 - light))); g.addColorStop(1, rgb(mix('#b6d8ee', [10, 20, 45], 1 - light))); ctx.fillStyle = g; ctx.fillRect(0, hy, W, H - hy); }
    else { g = ctx.createLinearGradient(0, hy, 0, H); g.addColorStop(0, rgb(topC)); g.addColorStop(1, rgb(botC)); ctx.fillStyle = g; ctx.fillRect(0, hy, W, H - hy);
      for (let L = 0; L < 4; L++) { const y0 = hy + (H - hy) * (L / 4) * (L / 4 + 0.2), amp = 1 + L * 1.4, sp = 0.5 + L * 0.35, per = 28 + L * 22; ctx.beginPath(); ctx.moveTo(0, H); for (let x = 0; x <= W + 6; x += 6) ctx.lineTo(x, y0 + Math.sin(x / per + T * sp + L * 2) * amp); ctx.lineTo(W, H); ctx.closePath(); ctx.fillStyle = L % 2 ? 'rgba(255,255,255,0.05)' : 'rgba(0,20,40,0.07)'; ctx.fill(); }
      // 光のすじ（太陽・月）
      const rx = night || S.loc === 'night' ? S.moonX : W * (0.1 + 0.8 * clamp(sunA, 0, 1)); if (rx && !dim && (night || S.loc === 'night' || (h > 6 && h < 18.5))) { ctx.fillStyle = night || S.loc === 'night' ? 'rgba(230,235,255,.5)' : 'rgba(255,240,200,.55)'; for (let k = 0; k < 14; k++) { const y = hy + 4 + k * (H - hy) * 0.045 * (1 + k * 0.12), wd = 6 + k * 3.2 + Math.sin(T * 2 + k) * 4; ctx.globalAlpha = (1 - gray) * (0.7 - k * 0.04); ctx.fillRect(rx - wd / 2 + Math.sin(T + k) * 3, y, wd, 1.6); } ctx.globalAlpha = 1; } }
    // 雨・雪
    if (env.wx === 2) { const r = prng(5); ctx.strokeStyle = env.snow ? 'rgba(255,255,255,.9)' : 'rgba(210,225,255,.55)'; ctx.fillStyle = ctx.strokeStyle; for (let k = 0; k < 70; k++) { const x0 = r() * W, sp = env.snow ? 40 : 420, y = ((r() * H + T * sp * (0.7 + r() * 0.6)) % (H + 20)) - 10, x = x0 + (env.snow ? Math.sin(T + k) * 12 : y * 0.12); if (env.snow) { ctx.beginPath(); ctx.arc(x, y, 1.6, 0, TAU); ctx.fill(); } else { ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - 2, y + 9); ctx.stroke(); } } }
    if (dim) { const r = prng(11); for (let k = 0; k < 40; k++) { const x = r() * W, y = hy + r() * (H - hy), a = 0.3 + 0.7 * Math.abs(Math.sin(T * (0.6 + r()) + k)); ctx.fillStyle = k % 5 ? 'rgba(150,230,255,' + a * 0.5 + ')' : 'rgba(255,230,120,' + a + ')'; ctx.beginPath(); ctx.arc(x, y - ((T * 6 * (0.5 + r())) % 30), 1.4 + r() * 1.6, 0, TAU); ctx.fill(); } }
    S.hy = hy; S.light = light;
  }
  function backdrop(ctx, W, H, hy, st, S, light, T) {
    const k = st.back, dk = c => rgb(mix(c, [8, 12, 30], 1 - light)); ctx.save(); ctx.beginPath(); ctx.rect(0, 0, W, hy + 1); ctx.clip();
    const hills = (c, amp, per, ph) => { ctx.fillStyle = dk(c); ctx.beginPath(); ctx.moveTo(0, hy); for (let x = 0; x <= W + 8; x += 8) ctx.lineTo(x, hy - amp * (0.55 + 0.45 * Math.sin(x / per + ph))); ctx.lineTo(W, hy); ctx.fill(); };
    if (k === 'reeds') { hills('#5e8a4a', 14, 70, 1); ctx.strokeStyle = dk('#6b8f3a'); ctx.lineWidth = 2; for (let x = 6; x < W; x += 9) { const hh = 18 + (x * 7 % 13), sw = Math.sin(T + x) * 2; ctx.beginPath(); ctx.moveTo(x, hy); ctx.quadraticCurveTo(x + sw, hy - hh * 0.6, x + sw * 1.5, hy - hh); ctx.stroke(); } }
    else if (k === 'hills') { hills('#7a9a8a', 40, 90, 0); hills('#4f7d55', 26, 60, 2); }
    else if (k === 'pines') { hills('#6a7f98', 56, 110, 1); hills('#3d6048', 28, 50, 3); ctx.fillStyle = dk('#274a38'); for (let x = 4; x < W; x += 16) { const hh = 22 + (x * 5 % 17); ctx.beginPath(); ctx.moveTo(x, hy); ctx.lineTo(x + 6, hy - hh); ctx.lineTo(x + 12, hy); ctx.fill(); } }
    else if (k === 'flat') { hills('#98a88a', 8, 140, 0); ctx.fillStyle = dk('#777'); ctx.fillRect(W * 0.55, hy - 18, W * 0.4, 5); for (let i = 0; i < 4; i++) ctx.fillRect(W * 0.58 + i * W * 0.1, hy - 14, 4, 14); }
    else if (k === 'harbour') { hills('#8d9bb0', 10, 100, 0); ctx.fillStyle = dk('#c9b8a3'); for (let i = 0; i < 6; i++) { const w = 22 + (i * 11 % 14), x = i * (W / 5.5) + 4, hh = 22 + (i * 17 % 20); ctx.fillRect(x, hy - hh, w, hh); ctx.fillStyle = dk(i % 2 ? '#b85c4a' : '#4a6a8a'); ctx.beginPath(); ctx.moveTo(x - 2, hy - hh); ctx.lineTo(x + w / 2, hy - hh - 9); ctx.lineTo(x + w + 2, hy - hh); ctx.fill(); ctx.fillStyle = dk('#c9b8a3'); }
      const lx = W * 0.82; ctx.fillStyle = dk('#f2f2f2'); ctx.beginPath(); ctx.moveTo(lx - 5, hy); ctx.lineTo(lx - 3, hy - 46); ctx.lineTo(lx + 3, hy - 46); ctx.lineTo(lx + 5, hy); ctx.fill(); ctx.fillStyle = '#e44'; ctx.fillRect(lx - 4, hy - 30, 8, 5); if (light < 0.8) { ctx.fillStyle = 'rgba(255,240,150,.9)'; ctx.fillRect(lx - 3, hy - 52, 6, 6); } }
    else if (k === 'rocks') { hills('#8a8a96', 12, 80, 2); ctx.fillStyle = dk('#6b6a74'); for (let i = 0; i < 5; i++) { ctx.beginPath(); ctx.ellipse(i * W / 4.5 + 10, hy + 2, 30 + (i * 13 % 18), 14 + (i * 7 % 9), 0, Math.PI, TAU); ctx.fill(); } }
    else if (k === 'cliff') { ctx.fillStyle = dk('#6a6672'); ctx.beginPath(); ctx.moveTo(W * 0.45, hy); ctx.lineTo(W * 0.52, hy - 46); ctx.lineTo(W * 0.7, hy - 52); ctx.lineTo(W * 0.78, hy - 30); ctx.lineTo(W, hy - 36); ctx.lineTo(W, hy); ctx.fill(); ctx.fillStyle = dk('#5a8a4a'); ctx.fillRect(W * 0.52, hy - 52, W * 0.2, 5); }
    else if (k === 'open') { ctx.fillStyle = dk('#fff'); ctx.beginPath(); const sx = W * 0.7 + Math.sin(T * 0.2) * 6; ctx.moveTo(sx, hy - 2); ctx.lineTo(sx, hy - 24); ctx.lineTo(sx + 14, hy - 4); ctx.fill(); ctx.fillStyle = dk('#8a5a3a'); ctx.fillRect(sx - 8, hy - 3, 26, 3); }
    else if (k === 'island') { ctx.fillStyle = dk('#e8d9a0'); ctx.beginPath(); ctx.ellipse(W * 0.72, hy + 2, 70, 9, 0, Math.PI, TAU); ctx.fill(); ctx.strokeStyle = dk('#6a4a2a'); ctx.lineWidth = 3; ctx.beginPath(); ctx.moveTo(W * 0.7, hy); ctx.quadraticCurveTo(W * 0.72, hy - 22, W * 0.7, hy - 36); ctx.stroke(); ctx.fillStyle = dk('#3a9a4a'); for (let a = 0; a < 5; a++) { ctx.beginPath(); ctx.ellipse(W * 0.7 + (a - 2) * 7, hy - 38 + Math.abs(a - 2) * 4, 12, 3, (a - 2) * 0.5, 0, TAU); ctx.fill(); } }
    else if (k === 'snow') { hills('#d8e6f4', 38, 100, 1); hills('#eef6fc', 20, 70, 3); ctx.fillStyle = dk('#4a6a58'); for (let x = 10; x < W; x += 30) { ctx.beginPath(); ctx.moveTo(x, hy); ctx.lineTo(x + 6, hy - 22); ctx.lineTo(x + 12, hy); ctx.fill(); } }
    else if (k === 'moon') { hills('#34476a', 36, 120, 0); hills('#26365a', 22, 70, 2); const r = prng(3); for (let i = 0; i < 12; i++) { const x = r() * W, y = hy - 4 - r() * 28, a = 0.4 + 0.6 * Math.abs(Math.sin(T * 1.3 + i)); ctx.fillStyle = 'rgba(210,255,140,' + a + ')'; ctx.beginPath(); ctx.arc(x, y, 1.8, 0, TAU); ctx.fill(); } }
    else if (k === 'deep') { ctx.fillStyle = dk('#10304a'); ctx.fillRect(0, hy - 3, W, 3); ctx.fillStyle = 'rgba(255,230,120,.9)'; ctx.fillRect(W * 0.12, hy - 12, 5, 9); }
    ctx.restore();
  }
  // つり人・さお・糸・ウキ。S: { rodAng, tip:{x,y}, bob:{x,y,s,sink}, tension, line:true, pull }
  function layout(W, H, S) {
    const hy = S.hy || Math.round(H * 0.38), ax = W * 0.13, ay = H * 0.9, tip = { x: ax + 34 + (S.rodBend || 0) * 6, y: ay - 76 + (S.rodBend || 0) * 10 };
    const f = clamp(S.far == null ? 0.5 : S.far, 0, 1), ice = S.loc === 'ice';
    const bx = ice ? W * 0.52 : W * 0.5 + (S.aim || 0) * W * 0.36 * (0.25 + 0.75 * f), by = ice ? H * 0.78 : lerp(H * 0.8, hy + (H - hy) * 0.12, f), bs = ice ? 1.2 : lerp(1.3, 0.5, f);
    return { ax, ay, tip, bx, by, bs, hy };
  }
  function drawAngler(ctx, W, H, S, T) {
    const L = layout(W, H, S), { ax, ay, tip } = L, ice = S.loc === 'ice', dock = ['harbour', 'estuary', 'open', 'deep', 'reef'].includes(S.loc), night = (S.env.hour < 5.5 || S.env.hour >= 19.5); const dkf = c => rgb(mix(c, [8, 12, 30], night ? 0.55 : 0));
    ctx.save(); ctx.fillStyle = dkf(ice ? '#e8f2fa' : dock ? '#8a6a4a' : S.loc === 'tide' || S.loc === 'rocky' ? '#6a6672' : '#6a8a4a'); ctx.beginPath(); ctx.moveTo(0, H); ctx.lineTo(0, ay + 4); ctx.lineTo(ax + 56, ay + 4); ctx.quadraticCurveTo(ax + 78, ay + 8, ax + 84, H); ctx.fill();
    if (dock) { ctx.fillStyle = dkf('#a98557'); ctx.fillRect(0, ay + 4, ax + 70, 5); ctx.fillStyle = dkf('#6a4c30'); for (let x = 8; x < ax + 70; x += 22) ctx.fillRect(x, ay + 9, 4, H - ay); }
    const bob = Math.sin(T * 1.6) * 0.8; ctx.translate(0, bob);
    ctx.fillStyle = dkf('#3a5a8a'); ctx.beginPath(); ctx.roundRect ? ctx.roundRect(ax - 12, ay - 44, 24, 42, 8) : ctx.rect(ax - 12, ay - 44, 24, 42); ctx.fill();
    ctx.fillStyle = dkf('#2a2a3a'); ctx.fillRect(ax - 10, ay - 4, 8, 8); ctx.fillRect(ax + 2, ay - 4, 8, 8);
    ctx.fillStyle = dkf('#f0c8a0'); ctx.beginPath(); ctx.arc(ax, ay - 54, 10, 0, TAU); ctx.fill(); ctx.fillStyle = dkf('#e8c860'); ctx.beginPath(); ctx.ellipse(ax, ay - 61, 17, 4, 0, 0, TAU); ctx.fill(); ctx.beginPath(); ctx.arc(ax, ay - 62, 9, Math.PI, TAU); ctx.fill();
    ctx.fillStyle = '#222'; ctx.fillRect(ax + 3, ay - 55, 2, 2);
    ctx.strokeStyle = dkf('#c8a050'); ctx.lineWidth = 3; ctx.lineCap = 'round'; ctx.beginPath(); ctx.moveTo(ax + 8, ay - 34); ctx.quadraticCurveTo(ax + 22, ay - 56 - (S.rodBend || 0) * 3, tip.x, tip.y); ctx.stroke(); ctx.strokeStyle = dkf('#3a5a8a'); ctx.lineWidth = 5; ctx.beginPath(); ctx.moveTo(ax + 4, ay - 38); ctx.lineTo(ax + 10, ay - 33); ctx.stroke();
    ctx.restore(); return Object.assign(L, { tip: { x: tip.x, y: tip.y + bob } });
  }
  function drawLine(ctx, W, H, S, T) {
    const L = layout(W, H, S), tip = S.tipPos || L.tip, bx = S.bobPos ? S.bobPos.x : L.bx, by = S.bobPos ? S.bobPos.y : L.by; const tens = S.tension || 0;
    ctx.save(); ctx.strokeStyle = tens > 0.85 ? '#ff6a5a' : 'rgba(255,255,255,.85)'; ctx.lineWidth = 1.2 + tens * 1.2; ctx.beginPath(); ctx.moveTo(tip.x, tip.y); const sag = (1 - tens) * 26 * (S.state === 'cast' ? 0.4 : 1) * (S.slack == null ? 1 : S.slack); ctx.quadraticCurveTo((tip.x + bx) / 2, (tip.y + by) / 2 + sag, bx, by); ctx.stroke(); ctx.restore(); return { x: bx, y: by };
  }
  function drawBobber(ctx, x, y, s, T, o) {
    o = o || {}; const bob = Math.sin(T * 2.2) * 1.2 + (o.sink || 0) * 9; ctx.save(); ctx.translate(x, y + bob); ctx.scale(s, s);
    ctx.fillStyle = 'rgba(255,255,255,.35)'; ctx.beginPath(); ctx.ellipse(0, 5, 11 + (o.ripple || 0) * 6, 3 + (o.ripple || 0) * 1.5, 0, 0, TAU); ctx.fill();
    ctx.strokeStyle = 'rgba(255,255,255,' + (0.5 * (o.ripple || 0.3)) + ')'; ctx.lineWidth = 1; ctx.beginPath(); ctx.ellipse(0, 5, 14 + (o.ripple || 0) * 12, 4 + (o.ripple || 0) * 3, 0, 0, TAU); ctx.stroke();
    ctx.fillStyle = '#fff'; ctx.beginPath(); ctx.ellipse(0, 0, 4.2, 6, 0, 0, TAU); ctx.fill(); ctx.fillStyle = '#e8483a'; ctx.beginPath(); ctx.ellipse(0, -2.2, 4.2, 3.8, 0, Math.PI, TAU); ctx.fill(); ctx.fillRect(-4.2, -2.2, 8.4, 1);
    ctx.strokeStyle = '#444'; ctx.lineWidth = 1.4; ctx.beginPath(); ctx.moveTo(0, -6); ctx.lineTo(0, -12); ctx.stroke(); if (o.glow) { ctx.fillStyle = 'rgba(255,250,150,.9)'; ctx.beginPath(); ctx.arc(0, -13, 3, 0, TAU); ctx.fill(); }
    ctx.restore();
  }
  // 水しぶき・波紋・きらきらの粒。list の要素: { x,y,vx,vy,life,max,kind:'drop'|'ring'|'spark'|'bubble',r,c }
  function drawParticles(ctx, list) {
    for (const p of list) { const a = clamp(p.life / p.max, 0, 1); ctx.save(); ctx.globalAlpha = a * (p.alpha == null ? 1 : p.alpha);
      if (p.kind === 'ring') { ctx.strokeStyle = p.c || '#fff'; ctx.lineWidth = 1.5; ctx.beginPath(); ctx.ellipse(p.x, p.y, p.r * (2 - a), p.r * (2 - a) * 0.3, 0, 0, TAU); ctx.stroke(); }
      else if (p.kind === 'spark') { ctx.fillStyle = p.c || '#ffe680'; ctx.translate(p.x, p.y); ctx.rotate(p.life * 3); ctx.beginPath(); for (let k = 0; k < 8; k++) { const r = k % 2 ? p.r * 0.35 : p.r, an = k * Math.PI / 4; ctx.lineTo(Math.cos(an) * r, Math.sin(an) * r); } ctx.closePath(); ctx.fill(); }
      else { ctx.fillStyle = p.c || '#fff'; ctx.beginPath(); ctx.arc(p.x, p.y, p.r, 0, TAU); ctx.fill(); if (p.kind === 'bubble') { ctx.strokeStyle = 'rgba(255,255,255,.8)'; ctx.stroke(); } }
      ctx.restore(); }
  }
  // 水そう（水族館）。list: [{ art, x, y, vx, ph, w }] decor: ビット
  function drawTank(ctx, W, H, T, fish, decor, dark) {
    const g = ctx.createLinearGradient(0, 0, 0, H); g.addColorStop(0, dark ? '#0f3b57' : '#7fd0ee'); g.addColorStop(1, dark ? '#0a2236' : '#2f87b8'); ctx.fillStyle = g; ctx.fillRect(0, 0, W, H);
    ctx.fillStyle = 'rgba(255,255,255,.08)'; for (let k = 0; k < 4; k++) { ctx.beginPath(); ctx.moveTo(W * (0.1 + k * 0.25), 0); ctx.lineTo(W * (0.2 + k * 0.25), 0); ctx.lineTo(W * (0.1 + k * 0.25) + 30, H); ctx.lineTo(W * (0.0 + k * 0.25), H); ctx.fill(); }
    ctx.fillStyle = dark ? '#6a5a40' : '#e8d5a0'; ctx.fillRect(0, H * 0.88, W, H * 0.12);
    const has = k => (decor >> k) & 1;
    if (has(1)) { ctx.fillStyle = '#8a8a96'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(W * (0.15 + k * 0.12), H * 0.9, 20 - k * 3, 11, 0, Math.PI, TAU); ctx.fill(); } }
    if (has(0)) { ctx.strokeStyle = '#3aa65a'; ctx.lineWidth = 4; for (let k = 0; k < 6; k++) { const x = W * (0.7 + k * 0.04); ctx.beginPath(); ctx.moveTo(x, H * 0.9); ctx.quadraticCurveTo(x + Math.sin(T + k) * 8, H * 0.75, x + Math.sin(T * 1.2 + k) * 10, H * 0.6 - k * 4); ctx.stroke(); } }
    if (has(2)) { ctx.fillStyle = '#f4d4c4'; for (let k = 0; k < 3; k++) { ctx.beginPath(); ctx.ellipse(W * (0.42 + k * 0.05), H * 0.91, 9, 7, 0.3 * k, Math.PI, TAU); ctx.fill(); } }
    if (has(5)) { const x = W * 0.5; ctx.fillStyle = '#b89ad0'; ctx.fillRect(x - 24, H * 0.72, 48, H * 0.16); ctx.fillRect(x - 30, H * 0.68, 10, H * 0.2); ctx.fillRect(x + 20, H * 0.68, 10, H * 0.2); ctx.fillStyle = '#6a4a88'; ctx.fillRect(x - 7, H * 0.8, 14, H * 0.08); }
    if (has(6)) { const x = W * 0.3, y = H * 0.86; ctx.fillStyle = '#9a6a30'; ctx.fillRect(x, y, 34, 18); ctx.fillStyle = '#e8c04a'; ctx.fillRect(x, y, 34, 5); }
    if (has(7)) { ctx.strokeStyle = '#f2706a'; ctx.lineWidth = 3; const x = W * 0.86; ctx.beginPath(); ctx.moveTo(x, H * 0.9); ctx.lineTo(x, H * 0.62); ctx.moveTo(x, H * 0.75); ctx.lineTo(x - 14, H * 0.64); ctx.moveTo(x, H * 0.7); ctx.lineTo(x + 14, H * 0.6); ctx.stroke(); }
    if (has(3)) { ctx.fillStyle = 'rgba(255,255,255,.55)'; for (let k = 0; k < 12; k++) { const y = H - ((T * 40 + k * 41) % H); ctx.beginPath(); ctx.arc(W * 0.9 + Math.sin(T * 2 + k) * 4, y, 2 + (k % 3), 0, TAU); ctx.fill(); } }
    for (const f of fish) drawFish(ctx, f.art, f.x, f.y, f.w, { t: T + f.ph, flip: f.vx < 0, key: f.key });
    if (has(4)) { const x = W * 0.58, y = H * 0.08; const rg = ctx.createRadialGradient(x, y, 2, x, y, H * 0.7); rg.addColorStop(0, 'rgba(255,240,170,.5)'); rg.addColorStop(1, 'rgba(255,240,170,0)'); ctx.fillStyle = rg; ctx.fillRect(0, 0, W, H); ctx.fillStyle = '#ffe88a'; ctx.beginPath(); ctx.arc(x, y + 4, 7, 0, TAU); ctx.fill(); }
  }
  const api = { drawFish, drawScene, drawAngler, drawLine, drawBobber, drawParticles, drawTank, layout, shade, mix, prng, hash, skyAt };
  root.FishingArt = api; if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
