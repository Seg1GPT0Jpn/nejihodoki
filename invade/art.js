// ほしぞら守備隊 - canvas pixel art. Every sprite is a little character map drawn by this file (no image files).
// Palette: midnight navy sky, candy-neon crew (mint, sun, sky, rose, tangerine, lilac, coral), lime shields, white shots.
//   InvadeArt.init(K)                  build the sprite canvases at pixel scale K
//   InvadeArt.draw(cx, S, view, L)     draw one frame. view = { t, shake, flash, fx (0 plain, 1 scanlines, 2 scanlines + vignette), reduce, hud, hi, banner... }
//   InvadeArt.onEvent(e, view)         turn an engine event into particles, texts and shake
//   InvadeArt.update(view)             advance particles one tick
//   InvadeArt.icon(canvas, kind, i)    small icons for the menus
(function (root) {
  'use strict';
  const E = root.InvadeEngine || (typeof require === 'function' ? require('./engine.js') : null);
  const LV = root.InvadeLevels || (typeof require === 'function' ? require('./levels.js') : null);
  const W = 240, H = 320;

  const SPR = {
    blip: [[
      '..#......#..', '...#....#...', '..########..', '.##########.', '.#wk####wk#.', '.##########.', '..#dddddd#..', '..#.#..#.#..'], [
      '..#......#..', '...#....#...', '..########..', '.##########.', '.#wk####wk#.', '.##########.', '..#dddddd#..', '.#..#..#..#.']],
    zig: [[
      '.....##.....', '....####....', '.#.######.#.', '##.#wkwk#.##', '.#.######.#.', '..d.####.d..', '.....dd.....', '............'], [
      '.....##.....', '....####....', '#..######..#', '.#.#wkwk#.#.', '#..######..#', '..d.####.d..', '.....dd.....', '............']],
    shell: [[
      '...######...', '..########..', '.##########.', '.#kkkkkkkk#.', '.#kwkkkkwk#.', '.##########.', '.d#.#dd#.#d.', '..d......d..'], [
      '...######...', '..########..', '.##########.', '.#kkkkkkkk#.', '.#kwkkkkwk#.', '.##########.', '..#d.dd.d#..', '.d........d.']],
    twin: [[
      '.###....###.', '#####..#####', '#wk##..##kw#', '#####dd#####', '.###.##.###.', '..#......#..', '...#....#...', '............'], [
      '.###....###.', '#####..#####', '#wk##..##kw#', '#####dd#####', '.###.##.###.', '..#.#..#.#..', '.#........#.', '............']],
    diver: [[
      '#..........#', '##........##', '.##.####.##.', '.##########.', '..#wk##kw#..', '...######...', '....####....', '.....##.....'], [
      '#..........#', '##........##', '.##.####.##.', '.##########.', '..#wk##kw#..', '...######...', '....#dd#....', '....d..d....']],
    medi: [[
      '...######...', '..###ww###..', '.####ww####.', '.##wwwwww##.', '.####ww####.', '..###ww###..', '...#d..d#...', '...d....d...'], [
      '...######...', '..###ww###..', '.####ww####.', '.##wwwwww##.', '.####ww####.', '..###ww###..', '..#d....d#..', '..d......d..']],
    boomer: [[
      '..########..', '.##########.', '.#dddddddd#.', '.##########.', '.#dddddddd#.', '.##wk##kw##.', '..########..', '..##....##..'], [
      '..########..', '.##########.', '.#dddddddd#.', '.##########.', '.#dddddddd#.', '.##wk##kw##.', '..########..', '.##......##.']],
    mini: [[
      '..####..', '.######.', '.#w##w#.', '.######.', '..#..#..'], [
      '..####..', '.######.', '.#w##w#.', '.######.', '.#....#.']],
    saucer: [[
      '......######......', '....##########....', '..##############..', '.################.', '#w#w#w#w#w#w#w#w#w', '##################', '.##.##########.##.', '..#............#..']],
    base: [[
      '.......#.......', '......###......', '......###......', '.#############.', '###############', '###ww#####ww###', '###############', '##d#########d##', '#..#########..#']],
  };
  const KIND = ['blip', 'zig', 'shell', 'twin', 'diver', 'medi', 'boomer', 'mini'];
  const SHADE = (hex, k) => { const n = parseInt(hex.slice(1), 16); const f = c => Math.max(0, Math.min(255, Math.round(c * k))); return '#' + [(n >> 16) & 255, (n >> 8) & 255, n & 255].map(c => f(c).toString(16).padStart(2, '0')).join(''); };

  let K = 3; const cache = {};
  function render(rows, col, flash) {
    const h = rows.length, w = rows[0].length, c = document.createElement('canvas'); c.width = w * K; c.height = h * K; const g = c.getContext('2d');
    const dark = SHADE(col, 0.62);
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
      const ch = rows[y][x]; if (ch === '.') continue;
      g.fillStyle = flash ? '#ffffff' : ch === '#' ? col : ch === 'd' ? dark : ch === 'w' ? '#ffffff' : '#1a1030';
      g.fillRect(x * K, y * K, K, K);
    }
    return c;
  }
  function spr(name, frame, col, flash) {
    const key = name + frame + col + (flash ? 'f' : '') + K;
    if (!cache[key]) { const set = SPR[name]; cache[key] = render(set[frame % set.length], col, flash); }
    return cache[key];
  }
  function init(k) { K = k || 3; for (const key of Object.keys(cache)) delete cache[key]; }

  // ---------------------------------------------------------------- particles
  const P = { parts: [], texts: [], rings: [], stars: null };
  function reset() { P.parts.length = 0; P.texts.length = 0; P.rings.length = 0; }
  function burst(x, y, col, n, sp, life, view) {
    if (view && view.reduce) n = Math.ceil(n / 3);
    for (let i = 0; i < n && P.parts.length < 500; i++) {
      const a = (i / n) * 6.283 + (i * 1.7), v = (0.4 + ((i * 37) % 10) / 10) * sp;
      P.parts.push({ x, y, vx: Math.cos(a) * v, vy: Math.sin(a) * v - 0.3, l: life + (i % 5) * 3, m: life + 12, c: col, s: 1 + (i % 3 === 0 ? 1 : 0) });
    }
  }
  function text(x, y, t, col, big) { if (P.texts.length < 40) P.texts.push({ x, y, t, c: col, l: 50, big: !!big }); }
  function onEvent(e, view) {
    const sh = (v) => { if (!view.reduce) view.shake = Math.max(view.shake || 0, v); };
    switch (e.t) {
      case 'kill': { const en = LV.ENEMY[e.a] || LV.ENEMY[0]; burst(e.x, e.y, en.col, 12, 1.5, 16, view); burst(e.x, e.y, '#ffffff', 4, 1, 10, view); sh(1.5); break; }
      case 'pts': if (e.a >= 50 || e.b > 1) text(e.x, e.y - 6, (e.b > 1 ? 'x' + e.b + ' ' : '') + e.a, e.b > 2 ? '#ffd75e' : '#ffffff'); break;
      case 'sau': burst(e.x, e.y, '#8ff0ff', 24, 2, 24, view); burst(e.x, e.y, '#ffd75e', 12, 1.2, 24, view); sh(3); break;
      case 'pdie': burst(e.x, e.y, '#ffffff', 26, 2.4, 30, view); burst(e.x, e.y, '#5ec8ff', 20, 1.6, 36, view); sh(9); view.flash = 0.5; break;
      case 'boss': for (let i = 0; i < 8; i++) burst(e.x + (i % 4 - 1.5) * 12, e.y + (i >> 2) * 10 - 4, i % 2 ? '#ffd75e' : '#ff8fc4', 14, 2.4, 34, view); sh(14); view.flash = 0.7; break;
      case 'bhit': burst(e.x + ((view.t * 7) % 30) - 15, e.y + 6, '#ffffff', 3, 1, 8, view); break;
      case 'phase': view.flash = 0.35; sh(8); text(e.x, e.y + 30, '!', '#ff6a6a', true); break;
      case 'bomb': P.rings.push({ x: e.x, y: e.y, r: 4, c: '#ffd75e' }); view.flash = 0.6; sh(8); break;
      case 'shhit': burst(e.x, e.y, '#7be07b', 4, 0.9, 10, view); break;
      case 'ping': burst(e.x, e.y, '#ffffff', 4, 1, 8, view); break;
      case 'ecancel': burst(e.x, e.y, '#ffffff', 3, 0.8, 8, view); break;
      case 'shot': burst(e.x, e.y, '#fff6c0', 2, 0.8, 6, view); break;
      case 'cap': { const pw = LV.POWER[e.a]; if (pw) { text(e.x, e.y - 8, (view.en ? pw.en : pw.ja), pw.col, true); burst(e.x, e.y, pw.col, 14, 1.4, 20, view); } P.rings.push({ x: e.x, y: e.y, r: 3, c: '#ffffff' }); break; }
      case 'extend': text(e.x, e.y - 10, '1UP', '#9bff7a', true); break;
      case 'shield': P.rings.push({ x: e.x, y: e.y, r: 6, c: '#7fb4ff' }); burst(e.x, e.y, '#7fb4ff', 12, 1.6, 16, view); break;
      case 'heal': P.rings.push({ x: e.x, y: e.y, r: 4, c: '#9bff7a' }); break;
      case 'revive': burst(e.x, e.y, '#9bff7a', 8, 1, 14, view); break;
      case 'split': burst(e.x, e.y, '#ffb3d9', 8, 1.2, 14, view); break;
      case 'invade': view.flash = 0.6; sh(10); break;
      case 'beam': sh(3); break;
      default: break;
    }
  }
  function update(view) {
    const ps = P.parts;
    for (let i = ps.length - 1; i >= 0; i--) { const p = ps[i]; p.x += p.vx; p.y += p.vy; p.vy += 0.03; p.vx *= 0.985; if (--p.l <= 0) ps.splice(i, 1); }
    for (let i = P.texts.length - 1; i >= 0; i--) { const t = P.texts[i]; t.y -= 0.35; if (--t.l <= 0) P.texts.splice(i, 1); }
    for (let i = P.rings.length - 1; i >= 0; i--) { const r = P.rings[i]; r.r += 5; if (r.r > 170) P.rings.splice(i, 1); }
    if (view.shake) { view.shake *= 0.86; if (view.shake < 0.15) view.shake = 0; }
    if (view.flash) { view.flash -= 0.045; if (view.flash < 0) view.flash = 0; }
  }

  // ---------------------------------------------------------------- drawing helpers
  function stars() {
    if (P.stars) return P.stars; const a = []; let s = 12345;
    const r = () => { s = (s * 1103515245 + 12345) & 0x7fffffff; return s / 0x7fffffff; };
    for (let i = 0; i < 70; i++) a.push({ x: r() * W, y: r() * H, z: 0.2 + r() * 0.8, c: ['#ffffff', '#cfe8ff', '#ffe9a8', '#ffc4e8'][i % 4] });
    return (P.stars = a);
  }
  function bg(cx, view) {
    const g = cx.createLinearGradient(0, 0, 0, H * K); g.addColorStop(0, '#0a0f2a'); g.addColorStop(0.6, '#10163a'); g.addColorStop(1, '#1b1446');
    cx.fillStyle = g; cx.fillRect(0, 0, W * K, H * K);
    const t = view.t;
    for (const s of stars()) {
      const y = (s.y + t * 0.05 * s.z) % H, tw = ((t * 0.05 + s.x) % 7) < 0.5 ? 0.4 : 1;
      cx.globalAlpha = 0.35 + 0.5 * s.z * tw; cx.fillStyle = s.c; cx.fillRect(Math.round(s.x * K), Math.round(y * K), s.z > 0.7 ? 2 * K / 2 : K, s.z > 0.7 ? 2 * K / 2 : K);
    }
    cx.globalAlpha = 1;
    // distant planet + horizon
    cx.fillStyle = '#241a5a'; cx.beginPath(); cx.arc(W * 0.18 * K, 300 * K, 70 * K, Math.PI, 0); cx.fill();
    cx.fillStyle = '#2e2270'; cx.beginPath(); cx.arc(W * 0.86 * K, 312 * K, 52 * K, Math.PI, 0); cx.fill();
    cx.fillStyle = '#5ec8ff'; cx.globalAlpha = 0.35; cx.fillRect(0, 304 * K, W * K, K); cx.globalAlpha = 1;
  }
  const rect = (cx, x, y, w, h, c) => { cx.fillStyle = c; cx.fillRect(Math.round(x * K), Math.round(y * K), Math.round(w * K), Math.round(h * K)); };
  function sprite(cx, c, x, y, alpha) { if (alpha != null) cx.globalAlpha = alpha; cx.drawImage(c, Math.round(x * K - c.width / 2), Math.round(y * K - c.height / 2)); if (alpha != null) cx.globalAlpha = 1; }
  function circle(cx, x, y, r, c) { cx.fillStyle = c; cx.beginPath(); cx.arc(x * K, y * K, r * K, 0, 6.283); cx.fill(); }

  function drawAlien(cx, S, a, view) {
    const f = (S.stepN + (a.c & 1)) & 1;
    const en = LV.ENEMY[a.t];
    if (a.t === 8) { // gem
      const pulse = 1 + 0.12 * Math.sin(view.t * 0.15 + a.c);
      cx.save(); cx.translate(a.x * K, a.y * K); cx.scale(pulse, pulse);
      cx.fillStyle = a.fl > 0 ? '#fff' : en.col; cx.beginPath(); cx.moveTo(0, -5 * K); cx.lineTo(5 * K, 0); cx.lineTo(0, 5 * K); cx.lineTo(-5 * K, 0); cx.closePath(); cx.fill();
      cx.fillStyle = '#ffffff'; cx.globalAlpha = 0.8; cx.beginPath(); cx.moveTo(-1 * K, -3 * K); cx.lineTo(1 * K, -3 * K); cx.lineTo(0, -1 * K); cx.closePath(); cx.fill(); cx.globalAlpha = 1; cx.restore(); return;
    }
    const sp = spr(KIND[a.t], f, en.col, a.fl > 0);
    let al = null; if (S.phase === 'intro') al = Math.min(1, 0.3 + S.pt / 50);
    sprite(cx, sp, a.x, a.y, al);
    if (a.hp > 1 && a.t !== 2 && a.t !== 5) rect(cx, a.x - 5, a.y + 5, 10, 1, '#ffffff');
    if (a.t === 2 && a.hp === 1) { rect(cx, a.x - 2, a.y - 2, 1, 1, '#1a1030'); rect(cx, a.x - 1, a.y - 1, 1, 1, '#1a1030'); rect(cx, a.x, a.y - 2, 1, 1, '#1a1030'); }
    if (a.st === 1) { cx.globalAlpha = 0.35; rect(cx, a.x - 1, a.y - 14, 2, 8, en.col); cx.globalAlpha = 0.2; rect(cx, a.x - 1, a.y - 24, 2, 8, en.col); cx.globalAlpha = 1; }
    if (a.t === 5 && a.tm < 40) { cx.globalAlpha = 0.5 * (1 - a.tm / 40); circle(cx, a.x, a.y, 14 - a.tm / 4, '#9bff7a'); cx.globalAlpha = 1; }
  }

  function drawBoss(cx, S, view) {
    const b = S.boss; if (!b || b.dead) return;
    const B = LV.BOSS[b.k], col = b.fl > 0 ? '#ffffff' : B.col, dark = b.fl > 0 ? '#e8e8ff' : SHADE(B.col, 0.55), x = b.x, y = b.y;
    cx.save(); cx.translate(x * K, y * K);
    const k = b.k, wob = Math.sin(view.t * 0.1) * 1.2;
    cx.fillStyle = dark; // wings / pods
    const pod = (px, py, w, h) => { cx.fillRect((px - w / 2) * K, (py - h / 2) * K, w * K, h * K); };
    pod(-24, 2 + wob, 10, 10); pod(24, 2 - wob, 10, 10);
    if (k >= 3) { pod(-16, -13, 4, 8); pod(16, -13, 4, 8); }
    if (k >= 5) { pod(-30, 6, 6, 6); pod(30, 6, 6, 6); }
    cx.fillStyle = col; cx.beginPath(); cx.moveTo(-20 * K, 10 * K); cx.lineTo(-22 * K, 0); cx.lineTo(-14 * K, -10 * K); cx.lineTo(14 * K, -10 * K); cx.lineTo(22 * K, 0); cx.lineTo(20 * K, 10 * K); cx.closePath(); cx.fill();
    cx.fillStyle = dark; cx.fillRect(-18 * K, 4 * K, 36 * K, 3 * K);
    // eyes (1-3 by variant)
    const eyes = 1 + (k % 3); cx.fillStyle = '#1a1030';
    for (let i = 0; i < eyes; i++) { const ex = (i - (eyes - 1) / 2) * 11; cx.fillRect((ex - 3) * K, -5 * K, 6 * K, 5 * K); cx.fillStyle = b.ph >= 2 ? '#ff6a6a' : '#ffffff'; cx.fillRect((ex - 1) * K + Math.sin(view.t * 0.05 + i) * K * 0.8, -4 * K, 2 * K, 2 * K); cx.fillStyle = '#1a1030'; }
    if (k === 8 || k === 7) { cx.strokeStyle = b.fl > 0 ? '#fff' : '#ffffff'; cx.globalAlpha = 0.5; cx.lineWidth = K; cx.beginPath(); cx.ellipse(0, 0, 30 * K, 7 * K, view.t * 0.02, 0, 6.283); cx.stroke(); cx.globalAlpha = 1; }
    // cannons
    cx.fillStyle = '#ffffff'; cx.fillRect(-12 * K, 10 * K, 3 * K, 3 * K); cx.fillRect(9 * K, 10 * K, 3 * K, 3 * K);
    cx.restore();
  }

  function drawShield(cx, s, view) {
    for (let cy = 0; cy < E.SCH; cy++) for (let cxl = 0; cxl < E.SCW; cxl++) {
      if (!s.g[cy * E.SCW + cxl]) continue;
      cx.fillStyle = (cy === 0 || !s.g[(cy - 1) * E.SCW + cxl]) ? '#b8ff9a' : ((cxl + cy) & 1 ? '#6fd36f' : '#62c562');
      cx.fillRect((s.x + cxl * E.CELL) * K, (s.y + cy * E.CELL) * K, E.CELL * K, E.CELL * K);
    }
  }

  function drawEBullet(cx, e, view) {
    const x = e.x, y = e.y;
    if (e.k === 3) { circle(cx, x, y, 3.2, '#ff6a6a'); circle(cx, x, y, 1.6, (view.t >> 2) & 1 ? '#ffd75e' : '#ffffff'); rect(cx, x - 0.5, y - 6, 1, 2, '#ffd75e'); }
    else if (e.k === 1) { rect(cx, x - 1.5, y - 3, 3, 6, '#ffd75e'); rect(cx, x - 0.5, y - 2, 1, 4, '#fff6c0'); }
    else if (e.k === 2) { rect(cx, x - 1.5, y - 2.5, 3, 5, '#ff9a5e'); rect(cx, x - 0.5, y - 1.5, 1, 3, '#ffffff'); }
    else if (e.k === 4) { rect(cx, x - 1, y - 4, 2, 8, '#8ff0ff'); }
    else if (e.k === 5) { circle(cx, x, y, 2.4, '#ff8fc4'); circle(cx, x, y, 1.1, '#ffffff'); }
    else { rect(cx, x - 1, y - 3, 2, 6, ((view.t >> 2) & 1) ? '#ff8fc4' : '#ff6fa8'); }
  }

  function drawCap(cx, c, view) {
    const pw = LV.POWER[c.k], bob = Math.sin(c.ph * 0.15) * 1;
    circle(cx, c.x + bob, c.y, 5.5, '#10163a'); circle(cx, c.x + bob, c.y, 4.6, pw.col);
    cx.fillStyle = '#10163a'; cx.font = 'bold ' + Math.round(6.5 * K) + 'px monospace'; cx.textAlign = 'center'; cx.textBaseline = 'middle'; cx.fillText(pw.g, (c.x + bob) * K, (c.y + 0.5) * K);
  }

  function drawPlayer(cx, S, p, view) {
    if (p.dead !== 0) return;
    const col = p.i === 0 ? '#5ec8ff' : '#ff8fc4';
    if (p.inv > 0 && p.sh <= 0 && ((p.inv >> 2) & 1)) return;
    sprite(cx, spr('base', 0, col, false), p.x, p.y);
    if (p.rap > 0) rect(cx, p.x - 6, p.y + 5, 2, 1, '#5ef2c0'), rect(cx, p.x + 4, p.y + 5, 2, 1, '#5ef2c0');
    if (p.sh > 0) { cx.strokeStyle = '#7fb4ff'; cx.globalAlpha = 0.5 + 0.3 * Math.sin(view.t * 0.2) + (p.sh < 180 && ((p.sh >> 3) & 1) ? -0.3 : 0); cx.lineWidth = Math.max(1, K * 0.8); cx.beginPath(); cx.arc(p.x * K, (p.y - 1) * K, 11 * K, 0, 6.283); cx.stroke(); cx.globalAlpha = 1; }
    if (S.np === 2) { cx.fillStyle = col; cx.font = 'bold ' + Math.round(6 * K) + 'px monospace'; cx.textAlign = 'center'; cx.textBaseline = 'alphabetic'; cx.fillText('P' + (p.i + 1), p.x * K, (p.y + 14) * K); }
  }

  function hudText(cx, t, x, y, size, col, align) { cx.fillStyle = col; cx.font = 'bold ' + Math.round(size * K) + 'px "Courier New", monospace'; cx.textAlign = align || 'left'; cx.textBaseline = 'alphabetic'; cx.fillText(t, Math.round(x * K), Math.round(y * K)); }
  function jtext(cx, t, x, y, size, col, align) { cx.fillStyle = col; cx.font = '800 ' + Math.round(size * K) + 'px "M PLUS Rounded 1c", system-ui, sans-serif'; cx.textAlign = align || 'center'; cx.textBaseline = 'alphabetic'; cx.fillText(t, Math.round(x * K), Math.round(y * K)); }
  const fmt = n => String(Math.floor(n));

  function drawHud(cx, S, view, L) {
    hudText(cx, L('スコア', 'SCORE'), 6, 10, 6, '#7fb4ff'); hudText(cx, fmt(S.score).padStart(7, '0'), 6, 19, 8, '#ffffff');
    hudText(cx, L('ハイ', 'HI'), W / 2, 10, 6, '#7fb4ff', 'center'); hudText(cx, fmt(Math.max(view.hi || 0, S.score)).padStart(7, '0'), W / 2, 19, 8, '#ffd75e', 'center');
    hudText(cx, S.mode === 'campaign' ? L('ステージ', 'STAGE') : L('ウェーブ', 'WAVE'), W - 6, 10, 6, '#7fb4ff', 'right');
    hudText(cx, String(S.wave), W - 6, 19, 8, '#ffffff', 'right');
    if (S.chain >= 2) { const m = Math.min(5, 1 + Math.floor((S.chain - 1) / 5)); hudText(cx, S.chain + L(' れんさ ', ' CHAIN ') + 'x' + m, W / 2, 30, 7, m >= 3 ? '#ffd75e' : '#ffffff', 'center'); const w = 60 * (S.ct / 110); rect(cx, W / 2 - 30, 33, w, 1.5, '#5ef2c0'); }
    // lives (bases) bottom-left, powers bottom-right
    const lives = Math.max(0, S.inf ? 3 : S.lives - 1);
    const ic = spr('base', 0, '#5ec8ff', false);
    cx.save(); cx.globalAlpha = 0.9; for (let i = 0; i < Math.min(lives, 6); i++) cx.drawImage(ic, Math.round((6 + i * 17) * K), Math.round(308 * K), Math.round(ic.width * 0.7), Math.round(ic.height * 0.7)); cx.restore();
    if (S.inf) hudText(cx, '∞', 6, 316, 7, '#5ec8ff');
    let px = W - 6; const pl = S.pl[0];
    const tags = []; if (pl.spr > 0) tags.push([0, pl.spr / 900]); if (pl.rap > 0) tags.push([1, pl.rap / 900]); if (pl.prc > 0) tags.push([2, pl.prc / 700]); if (pl.sh > 0) tags.push([3, Math.min(1, pl.sh / 900)]); if (S.slow > 0) tags.push([4, S.slow / 480]);
    for (const t of tags) { px -= 14; const pw = LV.POWER[t[0]]; circle(cx, px + 5, 313, 4.5, '#10163a'); circle(cx, px + 5, 313, 3.8, pw.col); rect(cx, px, 319, 10 * t[1], 1, pw.col); }
    for (let i = 0; i < pl.bb; i++) { px -= 12; circle(cx, px + 5, 313, 4.5, '#ff9a5e'); hudText(cx, 'B', px + 5, 315.5, 5.5, '#10163a', 'center'); }
  }

  function banners(cx, S, view, L) {
    const sp = S.spec; if (!sp) return;
    if (S.phase === 'intro') {
      const a = Math.min(1, S.pt / 12, (E.INTRO - S.pt) / 14 + 0.4);
      cx.globalAlpha = Math.max(0, Math.min(1, a));
      jtext(cx, view.en ? sp.name.en : sp.name.ja, W / 2, 210, 12, sp.kind === 'boss' ? '#ff8fc4' : sp.kind === 'bonus' ? '#8ff0ff' : '#ffffff');
      if (sp.tip && S.pt > 10) { const lines = wrap(view.en ? sp.tip.en : sp.tip.ja, view.en ? 34 : 17); lines.forEach((ln, i) => jtext(cx, ln, W / 2, 226 + i * 11, 7.5, '#ffe9a8')); }
      if (sp.kind === 'bonus') jtext(cx, L('きらきらを とりまくれ！', 'Grab every gem!'), W / 2, 226, 8, '#8ff0ff');
      cx.globalAlpha = 1;
    } else if (S.phase === 'clear') {
      const cb = S.cb || { bonus: 0 };
      jtext(cx, L('ウェーブ クリア！', 'WAVE CLEAR!'), W / 2, 140, 14, '#ffd75e');
      if (S.pt > 20) jtext(cx, L('ボーナス ', 'BONUS ') + cb.bonus, W / 2, 158, 9, '#ffffff');
      if (S.pt > 36 && cb.perfect) jtext(cx, L('ノーダメージ！', 'PERFECT!'), W / 2, 174, 9, '#9bff7a');
    } else if (S.phase === 'over' && S.pt > 30) { jtext(cx, 'GAME OVER', W / 2, 150, 16, '#ff6a6a'); }
    else if (S.phase === 'done' && S.won) { jtext(cx, L('ステージ クリア！', 'STAGE CLEAR!'), W / 2, 150, 14, '#ffd75e'); }
    if (view.turn) { jtext(cx, view.turn, W / 2, 160, 14, '#ffffff'); }
  }
  function wrap(s, n) { const out = []; let cur = ''; for (const w of (s.indexOf(' ') > 0 ? s.split(' ') : s.split(''))) { const j = s.indexOf(' ') > 0 ? ' ' : ''; if ((cur + j + w).length > n) { out.push(cur); cur = w; } else cur = cur ? cur + j + w : w; } if (cur) out.push(cur); return out; }

  // ---------------------------------------------------------------- the frame
  function draw(cx, S, view, L) {
    L = L || ((a, b) => a);
    cx.save();
    cx.imageSmoothingEnabled = false;
    bg(cx, view);
    if (view.shake) cx.translate(Math.round((Math.sin(view.t * 3.1) * view.shake) * K * 0.5), Math.round((Math.cos(view.t * 2.7) * view.shake) * K * 0.5));
    for (const s of S.sh) drawShield(cx, s, view);
    // beam hazard
    if (S.bm) { const b = S.bm; if (b.t < 40) { cx.globalAlpha = ((b.t >> 2) & 1) ? 0.5 : 0.2; rect(cx, b.x - 0.5, 0, 1, 304, '#ff6a6a'); cx.globalAlpha = 1; } else if (b.t < 70) { rect(cx, b.x - b.w / 2, 0, b.w, 304, '#ffffff'); cx.globalAlpha = 0.5; rect(cx, b.x - b.w / 2 - 3, 0, b.w + 6, 304, '#ff8fc4'); cx.globalAlpha = 1; } }
    drawBoss(cx, S, view);
    for (const a of S.al) if (a.alive) drawAlien(cx, S, a, view);
    for (const m of S.mn) sprite(cx, spr('mini', (view.t >> 3) & 1, '#ffb3d9', m.fl > 0), m.x, m.y);
    if (S.sau) { sprite(cx, spr('saucer', 0, '#8ff0ff', false), S.sau.x, S.sau.y); cx.globalAlpha = 0.3 + 0.3 * Math.sin(view.t * 0.3); rect(cx, S.sau.x - 5, S.sau.y + 5, 10, 1, '#ffd75e'); cx.globalAlpha = 1; }
    for (const c of S.caps) drawCap(cx, c, view);
    for (const e of S.eb) drawEBullet(cx, e, view);
    for (const b of S.pb) { if (b.pr) { rect(cx, b.x - 1.5, b.y - 6, 3, 12, '#ff8fc4'); rect(cx, b.x - 0.5, b.y - 6, 1, 12, '#ffffff'); } else { rect(cx, b.x - 1, b.y - 4, 2, 7, '#fff6c0'); rect(cx, b.x - 0.5, b.y - 4, 1, 3, '#ffffff'); } }
    for (const p of S.pl) drawPlayer(cx, S, p, view);
    // particles
    for (const p of P.parts) { cx.globalAlpha = Math.min(1, p.l / 8); cx.fillStyle = p.c; cx.fillRect(Math.round(p.x * K), Math.round(p.y * K), p.s * K * 0.8 + 1, p.s * K * 0.8 + 1); }
    cx.globalAlpha = 1;
    for (const r of P.rings) { cx.strokeStyle = r.c; cx.globalAlpha = Math.max(0, 1 - r.r / 170); cx.lineWidth = K; cx.beginPath(); cx.arc(r.x * K, r.y * K, r.r * K, 0, 6.283); cx.stroke(); } cx.globalAlpha = 1;
    for (const t of P.texts) { cx.globalAlpha = Math.min(1, t.l / 14); hudText(cx, t.t, t.x, t.y, t.big ? 8 : 6.5, t.c, 'center'); } cx.globalAlpha = 1;
    cx.restore();
    // un-shaken overlays
    cx.save(); cx.imageSmoothingEnabled = false;
    if (S.slow > 0) { cx.globalAlpha = 0.1; cx.fillStyle = '#7fb4ff'; cx.fillRect(0, 0, W * K, H * K); cx.globalAlpha = 1; }
    if (view.flash > 0) { cx.globalAlpha = Math.min(0.6, view.flash); cx.fillStyle = '#ffffff'; cx.fillRect(0, 0, W * K, H * K); cx.globalAlpha = 1; }
    if (S.boss && !S.boss.dead && S.boss.y > 10) { const b = S.boss; rect(cx, W / 2 - 62, 26, 124, 4, '#10163a'); rect(cx, W / 2 - 61, 27, 122 * Math.max(0, b.hp / b.mh), 2, b.ph >= 2 ? '#ff6a6a' : b.ph === 1 ? '#ffd75e' : '#9bff7a'); jtext(cx, view.en ? LV.BOSS[b.k].en : LV.BOSS[b.k].ja, W / 2, 40, 6.5, '#ffffff'); }
    if (S.spec && S.spec.kind === 'bonus' && S.phase === 'play') { rect(cx, 40, 28, 160, 3, '#10163a'); rect(cx, 41, 29, 158 * Math.max(0, S.bt / S.spec.lim), 1, '#8ff0ff'); }
    if (view.hud !== false) drawHud(cx, S, view, L);
    banners(cx, S, view, L);
    if (view.fx >= 1) {
      cx.globalAlpha = 0.16; cx.fillStyle = '#000'; for (let y = 0; y < H * K; y += 2 * K) cx.fillRect(0, y + K, W * K, Math.max(1, K * 0.7)); cx.globalAlpha = 1;
      const g = cx.createRadialGradient(W * K / 2, H * K / 2, H * K * 0.35, W * K / 2, H * K / 2, H * K * 0.75); g.addColorStop(0, 'rgba(0,0,0,0)'); g.addColorStop(1, 'rgba(0,0,0,0.45)'); cx.fillStyle = g; cx.fillRect(0, 0, W * K, H * K);
    }
    cx.restore();
  }

  // small icons for menus: kind 'enemy' (i = type), 'base', 'saucer', 'cap' (i = power), 'boss' (i = k)
  function icon(canvas, kind, i, size) {
    const k0 = K; K = Math.max(2, Math.round((size || 40) / 14)); const g = canvas.getContext('2d'); g.imageSmoothingEnabled = false; g.clearRect(0, 0, canvas.width, canvas.height);
    let c = null;
    if (kind === 'enemy' && i === 8) { g.fillStyle = LV.ENEMY[8].col; g.beginPath(); g.moveTo(canvas.width / 2, 2); g.lineTo(canvas.width - 3, canvas.height / 2); g.lineTo(canvas.width / 2, canvas.height - 2); g.lineTo(3, canvas.height / 2); g.fill(); K = k0; return; }
    if (kind === 'enemy') c = spr(KIND[i], 0, LV.ENEMY[i].col, false); else if (kind === 'base') c = spr('base', 0, '#5ec8ff', false); else if (kind === 'saucer') c = spr('saucer', 0, '#8ff0ff', false);
    else if (kind === 'cap') { const pw = LV.POWER[i]; g.fillStyle = pw.col; g.beginPath(); g.arc(canvas.width / 2, canvas.height / 2, Math.min(canvas.width, canvas.height) / 2 - 2, 0, 6.283); g.fill(); g.fillStyle = '#10163a'; g.font = 'bold ' + Math.round(canvas.height * 0.55) + 'px monospace'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText(pw.g, canvas.width / 2, canvas.height / 2 + 1); K = k0; return; }
    else if (kind === 'boss') { const B = LV.BOSS[i]; g.fillStyle = B.col; g.beginPath(); g.moveTo(canvas.width * 0.1, canvas.height * 0.8); g.lineTo(canvas.width * 0.05, canvas.height * 0.45); g.lineTo(canvas.width * 0.3, canvas.height * 0.15); g.lineTo(canvas.width * 0.7, canvas.height * 0.15); g.lineTo(canvas.width * 0.95, canvas.height * 0.45); g.lineTo(canvas.width * 0.9, canvas.height * 0.8); g.fill(); g.fillStyle = '#1a1030'; const ey = 1 + (i % 3); for (let q = 0; q < ey; q++) g.fillRect(canvas.width * (0.5 + (q - (ey - 1) / 2) * 0.22) - 3, canvas.height * 0.4, 6, 6); K = k0; return; }
    if (c) { const s = Math.min(canvas.width / c.width, canvas.height / c.height); const w = c.width * s, h = c.height * s; g.drawImage(c, (canvas.width - w) / 2, (canvas.height - h) / 2, w, h); }
    K = k0;
  }

  const API = { SPR, KIND, init, draw, onEvent, update, reset, icon, P, spr };
  root.InvadeArt = API;
  if (typeof module === 'object' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
