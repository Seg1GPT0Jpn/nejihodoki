// ぽかぽか島スポーツ：絵（canvas 2D のオリジナル。島・マスコット・種目のアイコン・空と海）。window.SportsArt
// 色は PAL にまとめる（明るい南の島：空の水色・海の青・砂・草・サンゴいろ・太陽のきいろ）。
(function (root) {
  'use strict';
  const PAL = {
    sky0: '#7fd6ff', sky1: '#d9f4ff', sea0: '#2bb7d4', sea1: '#1b86b5', sea2: '#0f5f8f', sand: '#ffe3a6', sand2: '#f3c978', grass0: '#7fdc79', grass1: '#4cb85e', grass2: '#2f8f4a',
    coral: '#ff7a6b', sun: '#ffd24d', ink: '#123b57', white: '#ffffff', wood: '#b9824a', wood2: '#8a5a2b', rock: '#8fa3ad', red: '#e5484d', pink: '#ff8fb3', violet: '#8f7cf0', teal: '#33c1ac', orange: '#ff9a3d',
  };
  const TAU = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const lerp = (a, b, t) => a + (b - a) * t;

  function rr(g, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); g.beginPath(); g.moveTo(x + r, y); g.arcTo(x + w, y, x + w, y + h, r); g.arcTo(x + w, y + h, x, y + h, r); g.arcTo(x, y + h, x, y, r); g.arcTo(x, y, x + w, y, r); g.closePath(); }
  function ell(g, x, y, rx, ry, fill, stroke, lw) { g.beginPath(); g.ellipse(x, y, Math.max(0.01, rx), Math.max(0.01, ry), 0, 0, TAU); if (fill) { g.fillStyle = fill; g.fill(); } if (stroke) { g.lineWidth = lw || 1.5; g.strokeStyle = stroke; g.stroke(); } }
  function circ(g, x, y, r, fill, stroke, lw) { ell(g, x, y, r, r, fill, stroke, lw); }
  function lin(g, x0, y0, x1, y1, c0, c1) { const l = g.createLinearGradient(x0, y0, x1, y1); l.addColorStop(0, c0); l.addColorStop(1, c1); return l; }
  function text(g, s, x, y, size, o) {
    o = o || {}; g.save(); g.font = (o.weight || 800) + ' ' + size + 'px ' + (o.font || '"M PLUS Rounded 1c", system-ui, sans-serif'); g.textAlign = o.align || 'center'; g.textBaseline = o.base || 'middle';
    if (o.stroke !== false) { g.lineJoin = 'round'; g.lineWidth = Math.max(2, size * 0.18); g.strokeStyle = o.stroke || 'rgba(18,59,87,.85)'; g.strokeText(s, x, y); }
    g.fillStyle = o.color || '#fff'; g.fillText(s, x, y); g.restore();
  }

  // ---------- 空と雲と海 ----------
  function sky(g, w, h, hor, t, o) {
    o = o || {}; g.fillStyle = lin(g, 0, 0, 0, hor, o.top || PAL.sky0, o.bot || PAL.sky1); g.fillRect(0, 0, w, hor + 1);
    circ(g, w * 0.82, hor * 0.28, Math.min(w, h) * 0.06, '#fff4b8'); circ(g, w * 0.82, hor * 0.28, Math.min(w, h) * 0.045, PAL.sun);
    for (let i = 0; i < 4; i++) cloud(g, ((i * 0.31 + (t || 0) * 0.004 * (1 + i * 0.3)) % 1.4 - 0.2) * w, hor * (0.18 + (i % 3) * 0.2), Math.min(w, h) * (0.07 + (i % 2) * 0.03));
  }
  function cloud(g, x, y, r) { g.fillStyle = 'rgba(255,255,255,.92)'; for (const [dx, dy, k] of [[0, 0, 1], [1.1, 0.2, 0.8], [-1.1, 0.25, 0.75], [0.4, -0.45, 0.8]]) { g.beginPath(); g.arc(x + dx * r, y + dy * r, r * k, 0, TAU); g.fill(); } }
  function sea(g, x, y, w, h, t) {
    g.fillStyle = lin(g, 0, y, 0, y + h, PAL.sea0, PAL.sea2); g.fillRect(x, y, w, h);
    g.strokeStyle = 'rgba(255,255,255,.35)'; g.lineWidth = 1.5; const n = Math.max(3, Math.round(h / 22));
    for (let i = 0; i < n; i++) { const yy = y + (i + 0.5) * h / n, a = 3 + i * 0.4; g.beginPath(); for (let xx = x; xx <= x + w + 8; xx += 8) { const v = yy + Math.sin(xx * 0.05 + (t || 0) * 1.4 + i * 1.7) * a * 0.5; if (xx === x) g.moveTo(xx, v); else g.lineTo(xx, v); } g.stroke(); }
  }
  function palm(g, x, y, s, t, lean) {
    lean = lean || 0; g.save(); g.translate(x, y); g.strokeStyle = PAL.wood2; g.lineWidth = s * 0.12; g.lineCap = 'round'; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(lean * s * 0.3, -s * 0.5, lean * s * 0.4, -s); g.stroke();
    g.translate(lean * s * 0.4, -s); g.fillStyle = PAL.grass2;
    for (let i = 0; i < 6; i++) { const a = -Math.PI / 2 + (i - 2.5) * 0.62 + Math.sin((t || 0) * 1.5 + i) * 0.04; g.save(); g.rotate(a + Math.PI / 2); g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(s * 0.18, -s * 0.5, 0, -s * 0.62); g.quadraticCurveTo(-s * 0.18, -s * 0.5, 0, 0); g.fill(); g.restore(); }
    circ(g, 0, 2, s * 0.06, '#7a4a24'); g.restore();
  }

  // ---------- マスコット（オリジナル）：ぽこ・ねね・みけ・ぴよ。体はまるく、耳と色がちがう ----------
  const KINDS = [
    { id: 'poko', ja: 'ぽこ', en: 'Poko', body: '#ff9a4d', belly: '#ffe2bd', ear: 'round', cheek: '#ff6f5e' },
    { id: 'nene', ja: 'ねね', en: 'Nene', body: '#ff9ec2', belly: '#fff0f6', ear: 'long', cheek: '#ff6f9a' },
    { id: 'mike', ja: 'みけ', en: 'Mike', body: '#46c9b3', belly: '#d8fff6', ear: 'tri', cheek: '#ff8a7a' },
    { id: 'piyo', ja: 'ぴよ', en: 'Piyo', body: '#ffd24d', belly: '#fff6cf', ear: 'tuft', cheek: '#ff8a5e' },
  ];
  // pose: 'idle' | 'cheer' | 'run' | 'sad' | 'swing'。x, y は足もと、s は高さ
  function mascot(g, x, y, s, o) {
    o = o || {}; const K = KINDS[(o.kind | 0) % 4], t = o.t || 0, pose = o.pose || 'idle', dir = o.dir || 1, bob = pose === 'run' ? Math.abs(Math.sin(t * 12)) * s * 0.06 : pose === 'idle' ? Math.sin(t * 2.5) * s * 0.012 : 0;
    g.save(); g.translate(x, y - bob); g.scale(dir, 1);
    ell(g, 0, 0, s * 0.3, s * 0.06, 'rgba(0,0,0,.18)');
    const bw = s * 0.3, bh = s * 0.3, by = -s * 0.3;
    // 足
    const step = pose === 'run' ? Math.sin(t * 12) * s * 0.07 : 0;
    ell(g, -s * 0.11 + step, -s * 0.03, s * 0.09, s * 0.05, K.body, PAL.ink, 1.5); ell(g, s * 0.11 - step, -s * 0.03, s * 0.09, s * 0.05, K.body, PAL.ink, 1.5);
    // うで（up = 1 で上、-1 で下）
    const aL = pose === 'cheer' ? 1 : pose === 'swing' ? Math.sin(t * 9) : pose === 'run' ? Math.sin(t * 12) * 0.7 : -0.15, aR = pose === 'cheer' ? 1 : pose === 'swing' ? Math.sin(t * 9 + 1.2) : pose === 'run' ? -Math.sin(t * 12) * 0.7 : -0.15;
    g.strokeStyle = K.body; g.lineWidth = s * 0.09; g.lineCap = 'round';
    for (const [sg, a] of [[-1, aL], [1, aR]]) { g.beginPath(); g.moveTo(sg * bw * 0.9, by - bh * 0.1); g.lineTo(sg * bw * 1.4, by + bh * (0.4 - a * 0.95)); g.stroke(); }
    // 体
    ell(g, 0, by, bw, bh, K.body, PAL.ink, 2); ell(g, 0, by + bh * 0.2, bw * 0.62, bh * 0.62, K.belly);
    // 頭
    const hy = -s * 0.66, hr = s * 0.27;
    if (K.ear === 'round') { circ(g, -hr * 0.8, hy - hr * 0.8, hr * 0.38, K.body, PAL.ink, 2); circ(g, hr * 0.8, hy - hr * 0.8, hr * 0.38, K.body, PAL.ink, 2); circ(g, -hr * 0.8, hy - hr * 0.8, hr * 0.2, K.cheek); circ(g, hr * 0.8, hy - hr * 0.8, hr * 0.2, K.cheek); }
    else if (K.ear === 'long') { for (const sg of [-1, 1]) { g.save(); g.translate(sg * hr * 0.5, hy - hr * 0.8); g.rotate(sg * 0.18 + Math.sin(t * 3) * 0.04 * sg); ell(g, 0, -hr * 0.55, hr * 0.26, hr * 0.8, K.body, PAL.ink, 2); ell(g, 0, -hr * 0.55, hr * 0.12, hr * 0.55, K.cheek); g.restore(); } }
    else if (K.ear === 'tri') { for (const sg of [-1, 1]) { g.beginPath(); g.moveTo(sg * hr * 0.25, hy - hr * 0.85); g.lineTo(sg * hr * 0.95, hy - hr * 0.95); g.lineTo(sg * hr * 0.85, hy - hr * 0.2); g.closePath(); g.fillStyle = K.body; g.fill(); g.strokeStyle = PAL.ink; g.lineWidth = 2; g.stroke(); } }
    else { g.fillStyle = K.body; g.strokeStyle = PAL.ink; g.lineWidth = 2; g.beginPath(); g.moveTo(-hr * 0.2, hy - hr * 0.95); g.quadraticCurveTo(0, hy - hr * 1.7, hr * 0.3, hy - hr * 0.95); g.closePath(); g.fill(); g.stroke(); }
    circ(g, 0, hy, hr, K.body, PAL.ink, 2); ell(g, 0, hy + hr * 0.25, hr * 0.72, hr * 0.62, K.belly);
    // 顔
    const bl = pose === 'sad' ? 0.1 : (Math.sin(t * 1.3 + (o.kind | 0)) > 0.97 ? 0.2 : 1);
    ell(g, -hr * 0.36, hy - hr * 0.02, hr * 0.12, hr * 0.17 * bl, PAL.ink); ell(g, hr * 0.36, hy - hr * 0.02, hr * 0.12, hr * 0.17 * bl, PAL.ink);
    circ(g, -hr * 0.4, hy - hr * 0.08, hr * 0.04, '#fff'); circ(g, hr * 0.32, hy - hr * 0.08, hr * 0.04, '#fff');
    ell(g, -hr * 0.62, hy + hr * 0.25, hr * 0.14, hr * 0.09, K.cheek); ell(g, hr * 0.62, hy + hr * 0.25, hr * 0.14, hr * 0.09, K.cheek);
    g.strokeStyle = PAL.ink; g.lineWidth = 1.8; g.lineCap = 'round'; g.beginPath();
    if (pose === 'sad') { g.moveTo(-hr * 0.15, hy + hr * 0.5); g.quadraticCurveTo(0, hy + hr * 0.38, hr * 0.15, hy + hr * 0.5); } else if (pose === 'cheer') { g.moveTo(-hr * 0.22, hy + hr * 0.32); g.quadraticCurveTo(0, hy + hr * 0.7, hr * 0.22, hy + hr * 0.32); } else { g.moveTo(-hr * 0.15, hy + hr * 0.38); g.quadraticCurveTo(0, hy + hr * 0.52, hr * 0.15, hy + hr * 0.38); } g.stroke();
    if (o.band) { g.fillStyle = o.band; g.fillRect(-hr * 0.98, hy - hr * 0.55, hr * 1.96, hr * 0.2); }
    g.restore();
  }
  // 犬の「こむぎ」（ディスクドッグ用）。x, y は足もと、s は体の長さ。dir = 1 で右向き
  function dog(g, x, y, s, o) {
    o = o || {}; const t = o.t || 0, run = !!o.run, dir = o.dir || 1, jump = o.jump || 0; g.save(); g.translate(x, y - jump); g.scale(dir, 1);
    ell(g, 0, jump, s * 0.42, s * 0.07, 'rgba(0,0,0,.18)');
    const ph = run ? Math.sin(t * 14) : 0, tan = '#e8b366', dk = '#a8743a';
    for (const [lx, sg] of [[-0.28, 1], [0.28, -1], [-0.14, -1], [0.14, 1]]) { g.strokeStyle = dk; g.lineWidth = s * 0.075; g.lineCap = 'round'; g.beginPath(); g.moveTo(s * lx, -s * 0.28); g.lineTo(s * lx + ph * sg * s * 0.1, -s * 0.02); g.stroke(); }
    g.save(); g.translate(-s * 0.4, -s * 0.42); g.rotate(-0.8 + Math.sin(t * 16) * 0.3); g.strokeStyle = tan; g.lineWidth = s * 0.07; g.beginPath(); g.moveTo(0, 0); g.quadraticCurveTo(-s * 0.1, -s * 0.15, -s * 0.05, -s * 0.28); g.stroke(); g.restore();
    ell(g, 0, -s * 0.4, s * 0.42, s * 0.22, tan, PAL.ink, 2); ell(g, s * 0.02, -s * 0.3, s * 0.3, s * 0.11, '#fff1d6');
    ell(g, s * 0.42, -s * 0.58, s * 0.2, s * 0.18, tan, PAL.ink, 2); ell(g, s * 0.58, -s * 0.52, s * 0.1, s * 0.07, '#fff1d6', PAL.ink, 1.5); circ(g, s * 0.65, -s * 0.54, s * 0.028, PAL.ink);
    circ(g, s * 0.45, -s * 0.62, s * 0.03, PAL.ink); g.save(); g.translate(s * 0.34, -s * 0.7); g.rotate(0.5 + (run ? Math.sin(t * 14) * 0.3 : 0)); ell(g, 0, s * 0.04, s * 0.06, s * 0.12, dk, PAL.ink, 1.5); g.restore();
    ell(g, s * 0.3, -s * 0.37, s * 0.13, s * 0.04, '#e5484d');
    g.restore();
  }

  // ---------- 種目のアイコン（ちいさな絵。cx, cy は中心、r は半径） ----------
  function icon(g, id, cx, cy, r) {
    g.save(); g.translate(cx, cy); g.lineCap = 'round'; g.lineJoin = 'round'; const k = r / 20;
    const S = (w) => { g.lineWidth = w * k; };
    switch (id) {
      case 'archery': for (const [rad, c] of [[16, '#fff'], [12, '#222'], [8, '#3aa0ff'], [4.5, PAL.red]]) circ(g, 0, 0, rad * k, c, PAL.ink, 1.2); g.strokeStyle = PAL.wood2; S(2.4); g.beginPath(); g.moveTo(-16 * k, 14 * k); g.lineTo(2 * k, -2 * k); g.stroke(); g.fillStyle = PAL.red; g.beginPath(); g.moveTo(-18 * k, 12 * k); g.lineTo(-12 * k, 10 * k); g.lineTo(-14 * k, 17 * k); g.fill(); break;
      case 'disc': g.rotate(-0.35); ell(g, 0, 0, 17 * k, 7 * k, PAL.coral, PAL.ink, 1.5); ell(g, 0, -1 * k, 10 * k, 3.6 * k, '#ffb3a8'); g.rotate(0.35); dog(g, 4 * k, 17 * k, 18 * k, { dir: -1 }); break;
      case 'bowling': circ(g, -6 * k, 8 * k, 9 * k, '#3a4a9a', PAL.ink, 1.5); circ(g, -8 * k, 5 * k, 1.2 * k, '#fff'); circ(g, -5 * k, 4 * k, 1.2 * k, '#fff'); for (const [x, y] of [[8, -6], [14, 4], [3, 6]]) { g.save(); g.translate(x * k, y * k); ell(g, 0, 2 * k, 4.3 * k, 8 * k, '#fff', PAL.ink, 1.3); rectFill(g, -4 * k, -1 * k, 8 * k, 2.2 * k, PAL.red); circ(g, 0, -7 * k, 3.2 * k, '#fff', PAL.ink, 1.3); g.restore(); } break;
      case 'kendo': g.strokeStyle = PAL.wood2; S(4.2); g.beginPath(); g.moveTo(-14 * k, 15 * k); g.lineTo(14 * k, -15 * k); g.stroke(); g.beginPath(); g.moveTo(14 * k, 15 * k); g.lineTo(-14 * k, -15 * k); g.stroke(); g.strokeStyle = '#f3d9a8'; S(2); g.beginPath(); g.moveTo(-13 * k, 14 * k); g.lineTo(13 * k, -14 * k); g.stroke(); g.beginPath(); g.moveTo(13 * k, 14 * k); g.lineTo(-13 * k, -14 * k); g.stroke(); circ(g, 0, 0, 4 * k, PAL.red, PAL.ink, 1.3); break;
      case 'hoops': rectFill(g, 2 * k, -18 * k, 16 * k, 14 * k, '#fff', PAL.ink); g.strokeStyle = PAL.red; S(2); g.strokeRect(6 * k, -13 * k, 8 * k, 6 * k); ell(g, 2 * k, 2 * k, 11 * k, 3.5 * k, null, PAL.orange, 3 * k); g.strokeStyle = '#fff'; S(1); for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(2 * k + i * 4 * k, 3 * k); g.lineTo(2 * k + i * 2.4 * k, 12 * k); g.stroke(); } circ(g, -10 * k, 12 * k, 7 * k, PAL.orange, PAL.ink, 1.4); g.strokeStyle = PAL.ink; S(1); g.beginPath(); g.moveTo(-17 * k, 12 * k); g.lineTo(-3 * k, 12 * k); g.moveTo(-10 * k, 5 * k); g.lineTo(-10 * k, 19 * k); g.stroke(); break;
      case 'golf': ell(g, 0, 14 * k, 18 * k, 5 * k, PAL.grass1, PAL.ink, 1.4); g.strokeStyle = '#fff'; S(2.2); g.beginPath(); g.moveTo(2 * k, 14 * k); g.lineTo(2 * k, -16 * k); g.stroke(); g.fillStyle = PAL.red; g.beginPath(); g.moveTo(2 * k, -16 * k); g.lineTo(15 * k, -10 * k); g.lineTo(2 * k, -4 * k); g.fill(); circ(g, -9 * k, 11 * k, 3 * k, '#fff', PAL.ink, 1.2); break;
      case 'canoe': g.fillStyle = PAL.sea0; g.fillRect(-20 * k, 6 * k, 40 * k, 14 * k); g.fillStyle = PAL.coral; g.beginPath(); g.moveTo(-18 * k, 4 * k); g.quadraticCurveTo(0, 14 * k, 18 * k, 4 * k); g.quadraticCurveTo(0, 0, -18 * k, 4 * k); g.fill(); g.strokeStyle = PAL.ink; S(1.4); g.stroke(); g.strokeStyle = PAL.wood2; S(2.6); g.beginPath(); g.moveTo(-10 * k, -12 * k); g.lineTo(8 * k, 10 * k); g.stroke(); ell(g, 9 * k, 11 * k, 3.4 * k, 6 * k, PAL.wood, PAL.ink, 1.2); circ(g, 0, -4 * k, 5 * k, PAL.sun, PAL.ink, 1.3); break;
      case 'pingpong': g.save(); g.rotate(-0.5); circ(g, -3 * k, -3 * k, 11 * k, PAL.red, PAL.ink, 1.6); rectFill(g, -6 * k, 7 * k, 6 * k, 12 * k, PAL.wood, PAL.ink); g.restore(); circ(g, 12 * k, 10 * k, 5 * k, '#fff', PAL.ink, 1.4); break;
      case 'cycling': for (const x of [-10, 10]) { circ(g, x * k, 6 * k, 9 * k, null, PAL.ink, 2.4 * k); circ(g, x * k, 6 * k, 1.6 * k, PAL.ink); } g.strokeStyle = PAL.violet; S(2.6); g.beginPath(); g.moveTo(-10 * k, 6 * k); g.lineTo(-2 * k, -6 * k); g.lineTo(8 * k, -6 * k); g.lineTo(10 * k, 6 * k); g.moveTo(-2 * k, -6 * k); g.lineTo(2 * k, 6 * k); g.lineTo(-10 * k, 6 * k); g.stroke(); g.strokeStyle = PAL.ink; S(2); g.beginPath(); g.moveTo(8 * k, -6 * k); g.lineTo(6 * k, -11 * k); g.lineTo(11 * k, -11 * k); g.stroke(); break;
      case 'jump': g.fillStyle = PAL.sea0; g.fillRect(-20 * k, 10 * k, 40 * k, 10 * k); g.fillStyle = PAL.wood; g.beginPath(); g.moveTo(-18 * k, 12 * k); g.lineTo(-2 * k, 2 * k); g.lineTo(2 * k, 12 * k); g.closePath(); g.fill(); g.strokeStyle = PAL.ink; S(1.4); g.stroke(); g.save(); g.translate(8 * k, -9 * k); g.rotate(-0.5); rectFill(g, -9 * k, 3 * k, 18 * k, 3 * k, PAL.sun, PAL.ink); circ(g, 0, -3 * k, 4 * k, PAL.pink, PAL.ink, 1.3); g.restore(); break;
      case 'tennis': g.save(); g.rotate(-0.6); ell(g, 0, -4 * k, 9 * k, 12 * k, null, PAL.ink, 3 * k); ell(g, 0, -4 * k, 9 * k, 12 * k, 'rgba(255,255,255,.55)'); g.strokeStyle = 'rgba(18,59,87,.45)'; S(0.8); for (let i = -2; i <= 2; i++) { g.beginPath(); g.moveTo(i * 3.5 * k, -14 * k); g.lineTo(i * 3.5 * k, 6 * k); g.stroke(); g.beginPath(); g.moveTo(-8 * k, i * 4.5 * k - 4 * k); g.lineTo(8 * k, i * 4.5 * k - 4 * k); g.stroke(); } rectFill(g, -2.2 * k, 8 * k, 4.4 * k, 12 * k, PAL.wood2, PAL.ink); g.restore(); circ(g, 12 * k, 12 * k, 5.4 * k, '#dff25a', PAL.ink, 1.4); break;
      default: circ(g, 0, 0, r * 0.7, '#fff', PAL.ink, 2);
    }
    g.restore();
  }
  function rectFill(g, x, y, w, h, fill, stroke) { g.fillStyle = fill; g.fillRect(x, y, w, h); if (stroke) { g.strokeStyle = stroke; g.lineWidth = 1.2; g.strokeRect(x, y, w, h); } }
  // 星（ n 個のうち st 個が金）
  function stars(g, cx, cy, size, n, on) { for (let i = 0; i < n; i++) star(g, cx + (i - (n - 1) / 2) * size * 1.15, cy, size * 0.5, i < on ? PAL.sun : 'rgba(18,59,87,.25)'); }
  function star(g, x, y, r, fill) { g.beginPath(); for (let i = 0; i < 10; i++) { const a = -Math.PI / 2 + i * Math.PI / 5, rad = i % 2 ? r * 0.45 : r; g.lineTo(x + Math.cos(a) * rad, y + Math.sin(a) * rad); } g.closePath(); g.fillStyle = fill; g.fill(); g.strokeStyle = 'rgba(18,59,87,.55)'; g.lineWidth = 1; g.stroke(); }

  // ---------- 島の地図 ----------
  // 島のかたち（ゆらぐ円）。w,h は地図の大きさ。島は中央、まわりに浅瀬
  function islandPath(g, w, h, grow) {
    const cx = w * 0.5, cy = h * 0.5, rx = w * (0.47 + (grow || 0)), ry = h * (0.45 + (grow || 0)); g.beginPath();
    for (let i = 0; i <= 72; i++) { const a = i / 72 * TAU, n = 1 + 0.07 * Math.sin(a * 3 + 0.5) + 0.05 * Math.sin(a * 5 + 2) + 0.03 * Math.sin(a * 9 + 1); const x = cx + Math.cos(a) * rx * n, y = cy + Math.sin(a) * ry * n; if (i) g.lineTo(x, y); else g.moveTo(x, y); }
    g.closePath();
  }
  function hubMap(g, w, h, t) {
    sea(g, 0, 0, w, h, t);
    g.save(); islandPath(g, w, h, 0.035); g.fillStyle = 'rgba(190,245,250,.55)'; g.fill(); g.restore();
    g.save(); islandPath(g, w, h, 0.01); g.fillStyle = PAL.sand; g.fill(); g.lineWidth = 3; g.strokeStyle = PAL.sand2; g.stroke(); g.restore();
    g.save(); islandPath(g, w, h, -0.025); g.fillStyle = lin(g, 0, 0, 0, h, PAL.grass0, PAL.grass1); g.fill(); g.restore();
    // 小さな湖と丘
    ell(g, w * 0.72, h * 0.66, w * 0.07, h * 0.035, PAL.sea0, '#b9f1f7', 2); ell(g, w * 0.3, h * 0.2, w * 0.05, h * 0.025, PAL.sea0, '#b9f1f7', 2);
    for (const [x, y, r] of [[0.14, 0.4, 0.07], [0.88, 0.45, 0.06], [0.5, 0.58, 0.05]]) { g.fillStyle = PAL.grass2; g.globalAlpha = 0.5; g.beginPath(); g.ellipse(w * x, h * y + h * 0.02, w * r, h * r * 0.5, 0, Math.PI, TAU); g.fill(); g.globalAlpha = 1; }
    for (const [x, y, s, l] of [[0.08, 0.52, 0.09, 0.4], [0.93, 0.7, 0.1, -0.4], [0.3, 0.88, 0.09, 0.3], [0.7, 0.9, 0.1, -0.3], [0.62, 0.12, 0.08, 0.2], [0.12, 0.2, 0.08, 0.3]]) palm(g, w * x, h * y, Math.min(w, h) * s, t, l);
  }
  function nodeDraw(g, sp, x, y, r, st, o) {
    o = o || {}; const pulse = o.hot ? 1 + Math.sin((o.t || 0) * 5) * 0.06 : 1; g.save(); g.translate(x, y); g.scale(pulse, pulse);
    ell(g, 0, r * 0.95, r * 0.9, r * 0.28, 'rgba(0,0,0,.2)'); circ(g, 0, 0, r, '#fff', sp.col, 3.5); circ(g, 0, 0, r * 0.84, lin(g, 0, -r, 0, r, '#ffffff', '#eef7fb')); icon(g, sp.id, 0, 0, r * 0.7);
    if (o.daily) { circ(g, r * 0.78, -r * 0.78, r * 0.34, PAL.coral, '#fff', 2); text(g, '★', r * 0.78, -r * 0.76, r * 0.42, { stroke: false }); }
    g.restore();
    for (let i = 0; i < 3; i++) star(g, x + (i - 1) * r * 0.62, y + r * 1.32, r * 0.3, i < st ? PAL.sun : 'rgba(18,59,87,.28)');
  }

  const api = { PAL, KINDS, rr, ell, circ, lin, text, sky, cloud, sea, palm, mascot, dog, icon, rectFill, stars, star, hubMap, nodeDraw, islandPath, clamp, lerp, TAU };
  root.SportsArt = api;
})(typeof window !== 'undefined' ? window : globalThis);
