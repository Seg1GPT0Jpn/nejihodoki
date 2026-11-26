// ふわふわぱふ: all drawing. Everything is drawn with canvas paths (no image files): the cloud-creature "ぱふ", its helper "もこ", the creatures, bosses and five worlds.
//   PuffArt.draw(ctx, S, { w, h, sc, dpr, t, theme, fx })   one frame of the stage (world pixels * sc)
//   PuffArt.Fx / PuffArt.feed(fx, S, snd)                    particles and the sound hooks for S.ev
(function (root) {
  'use strict';
  const E = root.PuffEngine || require('./engine.js');
  const T = E.T, TS = E.TS;
  const TAU = Math.PI * 2;
  const THEMES = {
    meadow: { sky: ['#8fd3ff', '#eaf8ff'], far: '#c8ebb0', far2: '#a9dc95', top: '#6fcf7a', top2: '#58b25f', body: '#c98b57', dark: '#a56d3e', cloud: '#ffffff', water: '#4aa8ff', water2: '#9fd6ff', brick: '#d99a6a', snow: '#f6f6ff' },
    volcano: { sky: ['#3a1c33', '#e0663a'], far: '#5a2a30', far2: '#7a3a2c', top: '#8a5a48', top2: '#b0705a', body: '#5e3532', dark: '#3f2224', cloud: '#7a4a4a', water: '#ff7a1c', water2: '#ffd24a', brick: '#7a4440', snow: '#6b6260' },
    ice: { sky: ['#a9ddff', '#f4fcff'], far: '#d8f0ff', far2: '#bfe3f7', top: '#f4fbff', top2: '#cfe8f6', body: '#8dbfdc', dark: '#6a9ebd', cloud: '#ffffff', water: '#5aa8d8', water2: '#c8ecff', brick: '#9fcbe0', snow: '#ffffff' },
    sky: { sky: ['#5f9cff', '#dcedff'], far: '#e8f2ff', far2: '#cfe2ff', top: '#ffffff', top2: '#e3edff', body: '#c9d9f5', dark: '#a7bfe6', cloud: '#ffffff', water: '#8fb4ff', water2: '#dce8ff', brick: '#b6c8ee', snow: '#f4f6ff' },
    castle: { sky: ['#1d1646', '#6a4aa5'], far: '#3a2c70', far2: '#4c3a8c', top: '#cdaaff', top2: '#a98be0', body: '#4a3680', dark: '#33255e', cloud: '#7a64b8', water: '#8a5cff', water2: '#d8c2ff', brick: '#5c46a0', snow: '#d9d0f5' },
  };
  const OUT = '#5a3a4e';
  const rr = (c, x, y, w, h, r) => { c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); };
  const circ = (c, x, y, r) => { c.beginPath(); c.arc(x, y, r, 0, TAU); };
  function starPath(c, x, y, R, r, n) { c.beginPath(); for (let i = 0; i < n * 2; i++) { const a = -Math.PI / 2 + i * Math.PI / n, rad = i % 2 ? r : R; c[i ? 'lineTo' : 'moveTo'](x + Math.cos(a) * rad, y + Math.sin(a) * rad); } c.closePath(); }
  const sn = E.sn;

  // ---------------- particles ----------------
  class Fx {
    constructor() { this.p = []; this.t = 0; }
    add(o) { if (this.p.length < 260) this.p.push(Object.assign({ x: 0, y: 0, vx: 0, vy: 0, g: 0, life: 24, max: 24, col: '#fff', r: 2, k: 'dot' }, o, { max: o.life || 24 })); }
    burst(x, y, n, col, o) { o = o || {}; for (let i = 0; i < n; i++) { const a = (i / n) * TAU + (i % 3) * 0.7, s = (o.sp || 1.4) * (0.5 + (i * 37 % 10) / 10); this.add({ x, y, vx: Math.cos(a) * s, vy: Math.sin(a) * s - (o.up || 0), g: o.g || 0.04, life: o.life || 26, col, r: o.r || 2, k: o.k || 'dot' }); } }
    update() { this.t++; const out = []; for (const q of this.p) { q.x += q.vx; q.y += q.vy; q.vy += q.g; q.life--; if (q.life > 0) out.push(q); } this.p = out; }
    draw(c) {
      for (const q of this.p) {
        const a = Math.max(0, q.life / q.max); c.globalAlpha = a; c.fillStyle = q.col;
        if (q.k === 'star') { starPath(c, q.x, q.y, q.r * 1.6, q.r * 0.7, 5); c.fill(); }
        else if (q.k === 'ring') { c.strokeStyle = q.col; c.lineWidth = 1.2; circ(c, q.x, q.y, q.r + (1 - a) * 14); c.stroke(); }
        else if (q.k === 'puff') { circ(c, q.x, q.y, q.r * (1.6 - a * 0.6)); c.fill(); }
        else { circ(c, q.x, q.y, q.r * (0.5 + a * 0.5)); c.fill(); }
      }
      c.globalAlpha = 1;
    }
  }
  const ABCOL = { fire: '#ff7a2a', spark: '#ffe03a', ice: '#7fd8ff', blade: '#cfd8e6', stone: '#9a9aa8', leaf: '#6fcf5a', bubble: '#7fe0ff', bomb: '#444a5a' };
  function feed(fx, S, snd) {
    const sf = (n) => { if (snd) snd(n); };
    for (const e of S.ev) {
      const t = e[0], x = e[1], y = e[2], a = e[3];
      switch (t) {
        case 'jump': sf('jump'); fx.burst(x, y, 4, '#ffffff', { sp: 0.8, life: 14, k: 'puff', r: 2 }); break;
        case 'flap': sf('flap'); fx.burst(x, y + 4, 3, '#ffffff', { sp: 0.7, life: 12, k: 'puff', r: 2 }); break;
        case 'swim': sf('swim'); break;
        case 'inhale': sf('inhale'); break;
        case 'gulp': sf('gulp'); fx.burst(x, y, 6, '#ffe27a', { k: 'star', life: 20, sp: 1.2 }); break;
        case 'spit': sf('spit'); break;
        case 'copy': sf('copy'); fx.burst(x, y, 16, ABCOL[a] || '#fff', { k: 'star', life: 34, sp: 2, r: 2.4 }); fx.add({ x, y, life: 26, col: ABCOL[a] || '#fff', k: 'ring', r: 4 }); break;
        case 'drop': sf('drop'); fx.burst(x, y, 6, ABCOL[a] || '#fff', { k: 'star', life: 22 }); break;
        case 'fire': sf('fire'); break;
        case 'ice': sf('ice'); break;
        case 'zap': sf('zap'); fx.add({ x, y, life: 18, col: '#ffe03a', k: 'ring', r: 8 }); break;
        case 'slash': sf('slash'); break;
        case 'stone': sf('stone'); break;
        case 'leaf': sf('leaf'); break;
        case 'bub': sf('bub'); break;
        case 'bombset': sf('bombset'); break;
        case 'boom': sf('boom'); fx.burst(x, y, 18, '#ffb347', { sp: 2.6, life: 26, r: 3 }); fx.burst(x, y, 10, '#555', { sp: 1.6, life: 30, k: 'puff', r: 3 }); break;
        case 'burn': fx.burst(x, y, 6, '#ff9a3a', { sp: 1.4, life: 22, up: 0.6, r: 2.4 }); sf('burn'); break;
        case 'cut': fx.burst(x, y, 6, '#6fcf5a', { sp: 1.6, life: 22, r: 2 }); sf('cut'); break;
        case 'crack': fx.burst(x, y, 8, '#b8b8c8', { sp: 1.8, life: 26, r: 2.4, g: 0.12 }); sf('crack'); break;
        case 'ice_': break;
        case 'freeze': sf('freeze'); fx.burst(x, y, 6, '#bfefff', { k: 'star', life: 22 }); break;
        case 'sock': sf('sock'); fx.burst(x, y, 10, '#ffe03a', { k: 'star', life: 24, sp: 1.8 }); break;
        case 'door': sf('door'); break;
        case 'hit': sf('hit'); fx.burst(x, y, 5, '#fff', { k: 'star', life: 14 }); break;
        case 'kill': sf('kill'); fx.burst(x, y, 9, '#ffe27a', { k: 'star', life: 28, sp: 1.8, r: 2.4 }); fx.burst(x, y, 6, '#fff', { k: 'puff', life: 24, sp: 0.8, r: 2.6 }); break;
        case 'hurt': sf('hurt'); fx.burst(x, y, 8, '#ff8fa8', { life: 22, sp: 1.6 }); break;
        case 'die': sf('die'); break;
        case 'splash': sf('splash'); fx.burst(x, y, 8, '#9fd6ff', { life: 24, up: 1.4, g: 0.1 }); break;
        case 'fall': sf('fall'); break;
        case 'star': sf('star'); fx.burst(x, y, 4, '#ffe27a', { k: 'star', life: 16, sp: 1 }); break;
        case 'candy': sf('candy'); fx.burst(x, y, 5, '#ff9ad0', { k: 'star', life: 18 }); break;
        case 'medal': sf('medal'); fx.burst(x, y, 14, '#ffd23f', { k: 'star', life: 40, sp: 2, r: 2.6 }); break;
        case 'heart': sf('heart'); fx.burst(x, y, 7, '#ff6b8a', { life: 28, up: 0.8, g: -0.01 }); break;
        case 'cp': sf('cp'); fx.burst(x, y, 10, '#8ff0b0', { k: 'star', life: 30 }); break;
        case 'goal': sf('goal'); fx.burst(x, y, 24, '#ffe27a', { k: 'star', life: 50, sp: 2.4, r: 2.6 }); break;
        case 'bosshit': sf(a ? 'bosshit2' : 'bosshit'); fx.burst(x, y, a ? 14 : 6, a ? '#ffd23f' : '#fff', { k: 'star', life: 24, sp: 2 }); break;
        case 'bossdown': sf('bossdown'); fx.burst(x, y, 40, '#ffe27a', { k: 'star', life: 60, sp: 3.2, r: 3 }); fx.burst(x, y, 20, '#fff', { k: 'puff', life: 50, sp: 1.6, r: 3.4 }); break;
        case 'phase': sf('phase'); break;
        case 'quake': sf('quake'); fx.burst(x, y, 8, '#d9c6a0', { k: 'puff', life: 24, sp: 1.6 }); break;
        case 'bolt': sf('bolt'); break;
        case 'shoot': sf('shoot'); break;
        case 'clang': sf('clang'); break;
        case 'puffout': sf('puffout'); break;
        case 'pop': sf('pop'); fx.burst(x, y, 6, '#bfefff', { life: 16 }); break;
        case 'warp': case 'revive': sf('revive'); fx.burst(x, y, 10, '#fff', { k: 'star', life: 28 }); break;
        case 'blink': fx.burst(x, y, 10, '#d8c2ff', { k: 'puff', life: 22 }); break;
        case 'restore': sf('restore'); break;
        default: break;
      }
    }
  }

  // ---------------- background ----------------
  function sky(c, th, w, h, camx, t, top) {
    const g = c.createLinearGradient(0, 0, 0, h); g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]);
    c.fillStyle = g; c.fillRect(0, 0, w, h);
  }
  function backdrop(c, th, name, camx, t, vw, wh) {
    // parallax in world-ish pixels (c is already scaled): far hills, mid hills, theme details
    c.save();
    if (name === 'castle') {
      c.fillStyle = '#fff'; for (let i = 0; i < 40; i++) { const x = ((i * 97 + 13) % 400 - camx * 0.05 * (1 + i % 3) + 4000) % 400, y = (i * 53) % 150, tw = 0.5 + 0.5 * sn(t * 0.05 + i); c.globalAlpha = 0.4 + 0.5 * tw; c.fillRect(x * vw / 400, y, 1.3, 1.3); }
      c.globalAlpha = 1; c.fillStyle = '#f6efc8'; circ(c, vw * 0.78, 40, 20); c.fill(); c.fillStyle = th.sky[0]; circ(c, vw * 0.78 + 7, 36, 18); c.fill();
    }
    for (const [k, par, base, amp, col] of [[0, 0.12, 132, 22, th.far], [1, 0.25, 150, 18, th.far2]]) {
      c.fillStyle = col; c.beginPath(); c.moveTo(0, wh);
      for (let x = 0; x <= vw + 8; x += 8) { const wx = x + camx * par; c.lineTo(x, base - (sn(wx * 0.013 + k * 2) * 0.5 + 0.5) * amp - (sn(wx * 0.031 + k) * 0.5 + 0.5) * amp * 0.4); }
      c.lineTo(vw + 8, wh); c.closePath(); c.fill();
    }
    if (name === 'volcano') { c.fillStyle = 'rgba(255,170,80,.18)'; for (let i = 0; i < 5; i++) { const x = ((i * 90 - camx * 0.2) % (vw + 100) + vw + 100) % (vw + 100) - 20; circ(c, x, 130 - sn(t * 0.02 + i) * 8, 26); c.fill(); } }
    if (name === 'ice' || name === 'sky') { c.fillStyle = th.cloud; c.globalAlpha = name === 'sky' ? 0.85 : 0.55; for (let i = 0; i < 6; i++) { const x = ((i * 110 - camx * 0.3 - t * 0.1) % (vw + 160) + vw + 160) % (vw + 160) - 60, y = 24 + (i * 37) % 70; circ(c, x, y, 11); c.fill(); circ(c, x + 12, y + 2, 9); c.fill(); circ(c, x - 11, y + 3, 8); c.fill(); } c.globalAlpha = 1; }
    if (name === 'meadow') { c.fillStyle = th.cloud; c.globalAlpha = 0.9; for (let i = 0; i < 5; i++) { const x = ((i * 120 - camx * 0.3 - t * 0.05) % (vw + 160) + vw + 160) % (vw + 160) - 50, y = 22 + (i * 31) % 60; circ(c, x, y, 9); c.fill(); circ(c, x + 10, y + 2, 7); c.fill(); circ(c, x - 9, y + 3, 6); c.fill(); } c.globalAlpha = 1; }
    if (name === 'ice') { c.fillStyle = '#fff'; for (let i = 0; i < 30; i++) { const x = ((i * 53 + t * (0.3 + (i % 3) * 0.2) - camx * 0.5) % (vw + 20) + vw + 20) % (vw + 20), y = ((i * 71 + t * (0.5 + (i % 4) * 0.25)) % (wh + 10)); c.globalAlpha = 0.8; c.fillRect(x, y, 1.6, 1.6); } c.globalAlpha = 1; }
    c.restore();
  }

  // ---------------- tiles ----------------
  function drawTile(c, S, th, name, tx, ty, t, tt) {
    const x = tx * TS, y = ty * TS, S_ = (a, b) => E.tl(S, a, b);
    const up = S_(tx, ty - 1), solidUp = E.SOLID[up] === 1;
    switch (tt) {
      case T.GROUND: {
        c.fillStyle = th.body; c.fillRect(x, y, TS, TS);
        c.fillStyle = th.dark; c.fillRect(x + 3, y + 7, 2, 2); c.fillRect(x + 10, y + 11, 3, 2); c.fillRect(x + 8, y + 3, 2, 2);
        if (!solidUp) { c.fillStyle = th.top; c.fillRect(x, y, TS, 5); c.fillStyle = th.top2; c.fillRect(x, y + 4, TS, 1.5); if (name === 'meadow') { c.fillStyle = th.top; for (let i = 0; i < 4; i++) c.fillRect(x + i * 4 + 1, y - 1.5, 2, 2.5); } if (name === 'ice' || name === 'sky') { c.fillStyle = th.top; circ(c, x + 4, y + 1, 3); c.fill(); circ(c, x + 11, y + 1, 3.4); c.fill(); } }
        if (name === 'volcano' && !solidUp) { c.fillStyle = '#ff9a3a'; c.fillRect(x + 3, y + 6, 2, 1); c.fillRect(x + 11, y + 8, 1.5, 1); }
        break;
      }
      case T.BRICK: c.fillStyle = th.brick; c.fillRect(x, y, TS, TS); c.strokeStyle = th.dark; c.lineWidth = 1; c.strokeRect(x + 0.5, y + 0.5, TS - 1, TS - 1); c.beginPath(); c.moveTo(x, y + 8); c.lineTo(x + TS, y + 8); c.moveTo(x + 8, y); c.lineTo(x + 8, y + 8); c.moveTo(x + 4, y + 8); c.lineTo(x + 4, y + TS); c.moveTo(x + 12, y + 8); c.lineTo(x + 12, y + TS); c.stroke(); break;
      case T.ONEWAY: c.fillStyle = th.brick; rr(c, x, y, TS, 5, 2); c.fill(); c.strokeStyle = th.dark; c.lineWidth = 1; c.stroke(); c.fillStyle = th.top; c.fillRect(x + 1, y + 1, TS - 2, 1.6); break;
      case T.CRACK: c.fillStyle = '#b6b0c4'; c.fillRect(x, y, TS, TS); c.fillStyle = '#d4cfdf'; c.fillRect(x + 1, y + 1, TS - 2, 3); c.strokeStyle = '#6a6479'; c.lineWidth = 1.2; c.strokeRect(x + 0.6, y + 0.6, TS - 1.2, TS - 1.2); c.beginPath(); c.moveTo(x + 8, y + 1); c.lineTo(x + 6, y + 6); c.lineTo(x + 10, y + 9); c.lineTo(x + 7, y + 15); c.moveTo(x + 6, y + 6); c.lineTo(x + 2, y + 8); c.stroke(); break;
      case T.ROPE: { c.fillStyle = 'rgba(60,40,20,.25)'; c.fillRect(x, y, TS, TS); c.strokeStyle = '#b8793a'; c.lineWidth = 2; c.beginPath(); c.moveTo(x, y); c.lineTo(x + TS, y + TS); c.moveTo(x + TS, y); c.lineTo(x, y + TS); c.moveTo(x + 8, y); c.lineTo(x + 8, y + TS); c.moveTo(x, y + 8); c.lineTo(x + TS, y + 8); c.stroke(); c.strokeStyle = '#e0b070'; c.lineWidth = 0.8; c.stroke(); break; }
      case T.VINE: { c.strokeStyle = '#3f9a3a'; c.lineWidth = 2.4; c.beginPath(); c.moveTo(x + 4, y); c.quadraticCurveTo(x + 11, y + 5, x + 5, y + 10); c.quadraticCurveTo(x + 2, y + 13, x + 6, y + TS); c.moveTo(x + 12, y); c.quadraticCurveTo(x + 6, y + 6, x + 12, y + 11); c.quadraticCurveTo(x + 14, y + 14, x + 10, y + TS); c.stroke(); c.fillStyle = '#6fcf5a'; circ(c, x + 9, y + 5, 2.4); c.fill(); circ(c, x + 4, y + 11, 2.4); c.fill(); circ(c, x + 12, y + 12, 2); c.fill(); break; }
      case T.SNOW: { c.fillStyle = name === 'volcano' ? '#6b6260' : '#f6fbff'; c.beginPath(); c.moveTo(x, y + TS); c.quadraticCurveTo(x + 2, y + 1, x + 8, y + 2); c.quadraticCurveTo(x + 14, y + 1, x + TS, y + TS); c.closePath(); c.fill(); c.fillStyle = name === 'volcano' ? '#8a807d' : '#d6e8f7'; circ(c, x + 5, y + 8, 2); c.fill(); circ(c, x + 11, y + 10, 2.4); c.fill(); c.strokeStyle = OUT; c.globalAlpha = 0.35; c.lineWidth = 1; c.stroke(); c.globalAlpha = 1; break; }
      case T.WATER: {
        const lava = name === 'volcano', top = S_(tx, ty - 1) !== T.WATER;
        c.fillStyle = th.water; c.fillRect(x, y, TS, TS);
        if (top) { c.fillStyle = th.water2; c.beginPath(); c.moveTo(x, y + 4); for (let i = 0; i <= 8; i++) c.lineTo(x + i * 2, y + 3 + Math.sin(t * 0.08 + (x + i * 2) * 0.35) * 1.6); c.lineTo(x + TS, y); c.lineTo(x, y); c.closePath(); c.fill(); }
        c.fillStyle = lava ? 'rgba(255,230,120,.55)' : 'rgba(255,255,255,.28)'; c.fillRect(x + 3 + (t * 0.3 + y) % 8, y + 8, 4, 1.4); c.fillRect(x + 9 - (t * 0.2) % 5, y + 12, 3, 1.2);
        break;
      }
      case T.SPIKE: c.fillStyle = '#cfd4de'; for (let i = 0; i < 3; i++) { c.beginPath(); c.moveTo(x + i * 5.4, y + TS); c.lineTo(x + i * 5.4 + 2.7, y + 4); c.lineTo(x + i * 5.4 + 5.4, y + TS); c.closePath(); c.fill(); c.strokeStyle = '#6a7080'; c.lineWidth = 0.8; c.stroke(); } break;
      case T.SOCKET: case T.SOCKON: { const on = tt === T.SOCKON; c.fillStyle = on ? '#fff3a0' : '#5a5f78'; rr(c, x + 1, y + 1, TS - 2, TS - 2, 3); c.fill(); c.strokeStyle = on ? '#e0a800' : '#2c3045'; c.lineWidth = 1.3; c.stroke(); c.fillStyle = on ? '#e0a800' : '#9aa0c0'; c.beginPath(); c.moveTo(x + 9, y + 3); c.lineTo(x + 5, y + 9); c.lineTo(x + 8, y + 9); c.lineTo(x + 7, y + 14); c.lineTo(x + 11, y + 7); c.lineTo(x + 8, y + 7); c.closePath(); c.fill(); if (on) { c.globalAlpha = 0.35 + 0.2 * Math.sin(t * 0.2); c.fillStyle = '#ffe03a'; circ(c, x + 8, y + 8, 11); c.fill(); c.globalAlpha = 1; } break; }
      case T.DOOR: c.fillStyle = '#3c4260'; c.fillRect(x + 2, y, TS - 4, TS); c.strokeStyle = '#9aa0c0'; c.lineWidth = 1.4; c.strokeRect(x + 2.5, y + 0.5, TS - 5, TS - 1); c.fillStyle = '#ffe03a'; if ((t >> 3) % 3 === 0) { c.fillRect(x + 6, y + 3, 4, 1.6); c.fillRect(x + 5, y + 10, 5, 1.6); } break;
      case T.ICEB: c.fillStyle = 'rgba(160,225,255,.92)'; rr(c, x, y, TS, TS, 3); c.fill(); c.strokeStyle = '#6fb6dc'; c.lineWidth = 1.2; c.stroke(); c.fillStyle = 'rgba(255,255,255,.75)'; c.fillRect(x + 3, y + 3, 5, 1.6); c.fillRect(x + 3, y + 3, 1.6, 6); break;
      case T.COIN: { const w = Math.abs(Math.cos(t * 0.06 + tx * 0.7)); c.save(); c.translate(x + 8, y + 8 + Math.sin(t * 0.08 + tx) * 1.2); c.scale(0.4 + 0.6 * w, 1); starPath(c, 0, 0, 5.6, 2.6, 5); c.fillStyle = '#ffe27a'; c.fill(); c.strokeStyle = '#b07a00'; c.lineWidth = 1; c.stroke(); c.restore(); break; }
      case T.MEDAL: { c.save(); c.translate(x + 8, y + 8 + Math.sin(t * 0.07) * 1.5); c.fillStyle = '#e24b6a'; c.fillRect(-4, -9, 3, 7); c.fillStyle = '#4b8ee2'; c.fillRect(1, -9, 3, 7); circ(c, 0, 1, 6.2); c.fillStyle = '#ffd23f'; c.fill(); c.strokeStyle = '#9a6a00'; c.lineWidth = 1.2; c.stroke(); starPath(c, 0, 1, 3.6, 1.6, 5); c.fillStyle = '#fff3b0'; c.fill(); c.restore(); break; }
      case T.HEART: heart(c, x + 8, y + 8 + Math.sin(t * 0.09 + tx) * 1.2, 6, '#ff5f82'); break;
      case T.CP: { const on = S.cpIdx >= 0 && S.L.cps[S.cpIdx] && S.L.cps[S.cpIdx].x === tx && S.L.cps[S.cpIdx].y === ty, past = S.L.cps.findIndex(q => q.x === tx && q.y === ty) <= S.cpIdx; c.strokeStyle = '#7a6a60'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(x + 4, y + TS); c.lineTo(x + 4, y - 6); c.stroke(); c.fillStyle = past ? '#7be0a0' : '#ffd23f'; c.beginPath(); c.moveTo(x + 4, y - 6); c.lineTo(x + 14 + Math.sin(t * 0.15) * 1, y - 3); c.lineTo(x + 4, y); c.closePath(); c.fill(); c.strokeStyle = OUT; c.lineWidth = 0.9; c.stroke(); void on; break; }
      case T.GOAL: { const open = !S.L.boss || S.bossDead; c.save(); c.translate(x + 8, y + 8); c.fillStyle = open ? '#ffe9a8' : '#9a9aa8'; rr(c, -9, -16, 18, 32, 9); c.fill(); c.strokeStyle = open ? '#d79a00' : '#5a5a68'; c.lineWidth = 1.6; c.stroke(); if (open) { starPath(c, 0, -3, 6, 2.8, 5); c.fillStyle = '#ff9a3a'; c.fill(); c.globalAlpha = 0.3 + 0.2 * Math.sin(t * 0.1); c.fillStyle = '#fff'; circ(c, 0, -2, 15); c.fill(); c.globalAlpha = 1; } else { c.strokeStyle = '#4a4a58'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-9, -6); c.lineTo(9, 4); c.moveTo(9, -6); c.lineTo(-9, 4); c.stroke(); } c.restore(); break; }
      default: break;
    }
  }
  function heart(c, x, y, r, col) { c.save(); c.translate(x, y); c.beginPath(); c.moveTo(0, r * 0.9); c.bezierCurveTo(-r * 1.5, -r * 0.1, -r * 0.8, -r * 1.1, 0, -r * 0.35); c.bezierCurveTo(r * 0.8, -r * 1.1, r * 1.5, -r * 0.1, 0, r * 0.9); c.fillStyle = col; c.fill(); c.strokeStyle = OUT; c.lineWidth = Math.max(0.8, r / 6); c.stroke(); c.restore(); }

  // ---------------- characters ----------------
  function eyes(c, x, y, face, blink, big) {
    const ex = 2.6 * face;
    for (const o of [-2.2, 2.6]) { const px = x + o * 1 + ex * 0.3; if (blink) { c.strokeStyle = OUT; c.lineWidth = 1; c.beginPath(); c.moveTo(px - 1, y); c.lineTo(px + 1, y); c.stroke(); } else { c.fillStyle = '#2a1c2a'; c.beginPath(); c.ellipse(px, y, 1.1, big ? 2.4 : 1.9, 0, 0, TAU); c.fill(); c.fillStyle = '#fff'; circ(c, px + 0.3, y - 0.8, 0.55); c.fill(); } }
  }
  function drawHero(c, S, p, t, o) {
    o = o || {};
    if (p.dead) { c.save(); c.globalAlpha = 0.7; c.translate(p.x + 5, p.y + 6); c.rotate(p.dead * 0.1); c.scale(1, 1); drawHeroBody(c, p, t, o, true); c.restore(); return; }
    if (p.inv > 0 && (p.inv >> 2) % 2 === 0) c.globalAlpha = 0.45;
    c.save(); c.translate(p.x + 5, p.y + 6); drawHeroBody(c, p, t, o, false); c.restore(); c.globalAlpha = 1;
  }
  function drawHeroBody(c, p, t, o, dead) {
    const f = p.face || 1, two = o.id === 1, ab = p.ab;
    const body = two ? '#d8f0e4' : '#fff4f8', cheek = two ? '#8fd6b8' : '#ffb0c8', foot = two ? '#5cb88e' : '#ff9a7a';
    const puff = p.puff ? 1 : 0, held = !!p.held, stone = p.stone > 0;
    const sq = p.on ? 1 + Math.sin(t * 0.3) * (Math.abs(p.vx) > 0.3 ? 0.04 : 0.015) : 1;
    let r = 7.4 + (puff ? 2.2 : 0) + (held ? 1.4 : 0);
    c.scale(f, 1);
    // feet
    if (!puff) { c.fillStyle = foot; c.strokeStyle = OUT; c.lineWidth = 1; const sw = p.on && Math.abs(p.vx) > 0.3 ? Math.sin(t * 0.4) * 1.6 : 0; c.beginPath(); c.ellipse(-3 + sw, 5.6, 2.8, 1.8, 0, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.ellipse(3.4 - sw, 5.6, 2.8, 1.8, 0, 0, TAU); c.fill(); c.stroke(); }
    else { c.fillStyle = foot; c.strokeStyle = OUT; c.lineWidth = 1; c.beginPath(); c.ellipse(-3, 8.4, 2.4, 1.6, 0, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.ellipse(3, 8.4, 2.4, 1.6, 0, 0, TAU); c.fill(); c.stroke(); }
    if (stone) { c.fillStyle = '#9a9aa8'; c.strokeStyle = '#4a4a58'; c.lineWidth = 1.2; rr(c, -7, -6, 14, 13, 3); c.fill(); c.stroke(); c.fillStyle = '#c4c4d0'; c.fillRect(-5, -4, 5, 2); return; }
    // cloud body
    c.save(); c.scale(1 / sq, sq); c.fillStyle = body; c.strokeStyle = OUT; c.lineWidth = 1.3;
    c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
    for (const [bx, by, br] of [[-4.5, -r + 1.2, 3.4], [0.5, -r - 0.6, 3.8], [5, -r + 1.6, 3]]) { circ(c, bx, by, br); c.fill(); c.stroke(); }
    c.fillStyle = body; circ(c, 0, 0, r - 0.6); c.fill();
    c.restore();
    // ability crest
    if (ab) crest(c, ab, t, r);
    // cheeks / face
    c.fillStyle = cheek; c.beginPath(); c.ellipse(-4.6 + 2, 2.3, 1.7, 1.1, 0, 0, TAU); c.fill(); c.beginPath(); c.ellipse(5.6, 2.3, 1.7, 1.1, 0, 0, TAU); c.fill();
    eyes(c, 0.6, -1, 1, !p.on && !puff && 0 || (Math.floor(t / 3) % 70 === 0), puff);
    // mouth
    c.strokeStyle = OUT; c.fillStyle = '#7a2f47'; c.lineWidth = 0.9;
    if (p.inh > 0 && !held) { c.beginPath(); c.ellipse(5.4, 2.6, 3.2, 3.6, 0, 0, TAU); c.fill(); c.stroke(); }
    else if (held) { c.fillStyle = cheek; circ(c, 3.4, 3.6, 3.4); c.fill(); c.stroke(); }
    else if (puff) { circ(c, 4, 3.6, 1.2); c.fill(); }
    else if (p.stun > 0) { c.beginPath(); c.moveTo(2, 4); c.lineTo(6, 4); c.stroke(); }
    else { c.beginPath(); c.arc(4, 2.2, 1.6, 0.2, Math.PI - 0.2); c.stroke(); }
    // arms when puffed
    if (puff) { c.fillStyle = body; c.strokeStyle = OUT; c.lineWidth = 1; c.beginPath(); c.ellipse(-r + 0.5, -3 + Math.sin(t * 0.5) * 1.5, 2.2, 3.2, -0.5, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.ellipse(r - 0.5, -3 - Math.sin(t * 0.5) * 1.5, 2.2, 3.2, 0.5, 0, TAU); c.fill(); c.stroke(); }
    // ability effects on the body
    if (p.zap > 0) { c.strokeStyle = '#ffe03a'; c.lineWidth = 1.4; for (let i = 0; i < 6; i++) { const a = i * 1.05 + t * 0.4; c.beginPath(); c.moveTo(Math.cos(a) * 9, Math.sin(a) * 9); c.lineTo(Math.cos(a + 0.3) * 15, Math.sin(a + 0.3) * 15); c.stroke(); } }
    if (p.slash > 0) { c.strokeStyle = '#ffffff'; c.lineWidth = 2.4; c.beginPath(); c.arc(4, 0, 15, -1.1 + (14 - p.slash) * 0.15, -0.2 + (14 - p.slash) * 0.15); c.stroke(); c.strokeStyle = '#8fb8ff'; c.lineWidth = 1; c.stroke(); }
    if (p.flash > 0) { c.globalAlpha = p.flash / 24; c.fillStyle = '#fff'; circ(c, 0, 0, r + 2); c.fill(); c.globalAlpha = 1; }
  }
  function crest(c, ab, t, r) {
    c.save(); c.lineWidth = 1; c.strokeStyle = OUT;
    if (ab === 'fire') { c.fillStyle = '#ff7a2a'; for (const [dx, h] of [[-3, 5], [0, 7.5], [3, 5]]) { c.beginPath(); c.moveTo(dx - 2, -r - 1); c.quadraticCurveTo(dx - 1, -r - h * 0.5, dx + Math.sin(t * 0.3 + dx) * 1, -r - h - 2); c.quadraticCurveTo(dx + 1.5, -r - h * 0.4, dx + 2, -r - 1); c.closePath(); c.fill(); c.stroke(); } c.fillStyle = '#ffe27a'; circ(c, 0, -r - 1.5, 1.6); c.fill(); }
    else if (ab === 'spark') { c.strokeStyle = '#c99a00'; c.lineWidth = 1.2; for (const s of [-1, 1]) { c.beginPath(); c.moveTo(s * 2, -r); c.lineTo(s * 5, -r - 3); c.lineTo(s * 3, -r - 4); c.lineTo(s * 6.5, -r - 8); c.stroke(); } c.fillStyle = '#ffe03a'; circ(c, 6.5, -r - 8, 1.5); c.fill(); circ(c, -6.5, -r - 8, 1.5); c.fill(); }
    else if (ab === 'ice') { c.fillStyle = '#bfefff'; for (const [dx, h] of [[-4, 4], [0, 7], [4, 4]]) { c.beginPath(); c.moveTo(dx - 2, -r + 1); c.lineTo(dx, -r - h); c.lineTo(dx + 2, -r + 1); c.closePath(); c.fill(); c.stroke(); } }
    else if (ab === 'blade') { c.fillStyle = '#d34a5a'; c.beginPath(); c.moveTo(-r + 1, -4); c.lineTo(r - 1, -5); c.lineTo(r - 1, -2.6); c.lineTo(-r + 1, -1.6); c.closePath(); c.fill(); c.stroke(); c.fillRect(-r - 1, -3, 3, 2); c.fillStyle = '#cfd8e6'; c.beginPath(); c.moveTo(-6, -r + 1); c.lineTo(-6, -r - 8); c.lineTo(-4.4, -r - 8); c.lineTo(-4.4, -r + 1); c.closePath(); c.fill(); c.stroke(); }
    else if (ab === 'stone') { c.fillStyle = '#9a9aa8'; c.beginPath(); c.moveTo(-6, -r + 2); c.lineTo(-3, -r - 3); c.lineTo(1, -r - 1); c.lineTo(4, -r - 4); c.lineTo(6, -r + 2); c.closePath(); c.fill(); c.stroke(); }
    else if (ab === 'leaf') { c.fillStyle = '#6fcf5a'; c.beginPath(); c.ellipse(-2, -r - 2.4, 2.2, 5.5, -0.6, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.ellipse(3, -r - 2, 2, 4.6, 0.7, 0, TAU); c.fill(); c.stroke(); }
    else if (ab === 'bubble') { c.fillStyle = 'rgba(160,230,255,.35)'; circ(c, 0, 0, r + 2.4); c.fill(); c.strokeStyle = 'rgba(80,190,240,.9)'; c.lineWidth = 1; c.stroke(); c.fillStyle = 'rgba(255,255,255,.7)'; circ(c, -4, -5, 1.6); c.fill(); }
    else if (ab === 'bomb') { c.fillStyle = '#3a4050'; circ(c, 0, -r - 1, 4.2); c.fill(); c.stroke(); c.strokeStyle = '#a07a40'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(1, -r - 5); c.quadraticCurveTo(4, -r - 8, 6, -r - 6); c.stroke(); c.fillStyle = (t >> 2) % 2 ? '#ffe03a' : '#ff7a2a'; circ(c, 6.2, -r - 6.4, 1.5); c.fill(); }
    c.restore();
  }

  // ---------------- creatures ----------------
  function body(c, w, h, col, o) { o = o || {}; c.fillStyle = col; c.strokeStyle = OUT; c.lineWidth = 1.2; c.beginPath(); c.ellipse(0, 0, w / 2, h / 2, 0, 0, TAU); c.fill(); c.stroke(); }
  function faceE(c, x, y, ang) { c.fillStyle = '#2a1c2a'; circ(c, x - 2, y, 1.2); c.fill(); circ(c, x + 2.4, y, 1.2); c.fill(); if (ang) { c.strokeStyle = '#2a1c2a'; c.lineWidth = 1; c.beginPath(); c.moveTo(x - 4, y - 3); c.lineTo(x - 0.6, y - 1.8); c.moveTo(x + 4.6, y - 3); c.lineTo(x + 1, y - 1.8); c.stroke(); } }
  function drawEnemy(c, e, th, t, S) {
    const cx = e.x + e.w / 2, cy = e.y + e.h / 2, k = e.k;
    c.save(); c.translate(cx, cy);
    if (e.hit > 0 && (e.hit & 2)) c.globalAlpha = 0.6;
    const f = e.dir >= 0 ? 1 : -1;
    if (e.fr > 0) { c.fillStyle = 'rgba(180,235,255,.8)'; rr(c, -8, -8, 16, 16, 3); c.fill(); c.strokeStyle = '#6fb6dc'; c.lineWidth = 1.2; c.stroke(); c.globalAlpha *= 0.7; }
    c.scale(f, 1);
    const bob = Math.sin(t * 0.2 + (e.ph || 0)) * 0.6;
    switch (k) {
      case 'mogu': c.translate(0, bob * 0.5); body(c, 13, 12, '#f3c58a'); c.fillStyle = '#e0a060'; circ(c, -3, -5, 2); c.fill(); circ(c, 3, -5.4, 2); c.fill(); faceE(c, 0.5, -1, 0); c.fillStyle = '#e07a7a'; c.fillRect(-1, 2, 3, 1.4); break;
      case 'bobo': body(c, 13, 12, '#ff9a5a'); c.fillStyle = '#ff5a2a'; c.beginPath(); c.moveTo(-3, -5); c.quadraticCurveTo(0, -12 + Math.sin(t * 0.3) * 1.5, 3, -5); c.fill(); c.stroke(); faceE(c, 0.5, -0.5, 1); c.fillStyle = '#7a2f47'; circ(c, 1, 3, 1.4); c.fill(); break;
      case 'piri': c.translate(0, bob); body(c, 12, 12, '#fff08a'); c.strokeStyle = '#c99a00'; c.lineWidth = 1.2; for (let i = 0; i < 6; i++) { const a = i * 1.05 + t * 0.12; c.beginPath(); c.moveTo(Math.cos(a) * 6.5, Math.sin(a) * 6.5); c.lineTo(Math.cos(a + 0.2) * 9.5, Math.sin(a + 0.2) * 9.5); c.stroke(); } faceE(c, 0.5, 0, 0); break;
      case 'kogori': body(c, 13, 12, '#bfeaff'); c.fillStyle = '#fff'; c.fillRect(-4, -4, 3, 1.4); c.beginPath(); c.moveTo(-4, -6); c.lineTo(-2, -10); c.lineTo(0, -6); c.moveTo(1, -6); c.lineTo(3, -9); c.lineTo(5, -6); c.fillStyle = '#9fdcff'; c.fill(); c.stroke(); faceE(c, 0.5, 0, 0); break;
      case 'kiriri': { const air = !e.on; c.translate(0, air ? -1 : 0); body(c, 12, 12, '#a8e0c0'); c.fillStyle = '#d34a5a'; c.fillRect(-6, -4.4, 12, 2.4); c.strokeStyle = '#cfd8e6'; c.lineWidth = 1.6; c.beginPath(); c.moveTo(-3, 6); c.lineTo(-6, 11); c.moveTo(3, 6); c.lineTo(6, 11); c.stroke(); faceE(c, 0.5, 0.4, 1); break; }
      case 'goro': { c.rotate(Math.sign(e.vx || 1) * t * 0.14); body(c, 13, 13, '#a4a2b0'); c.fillStyle = '#8a8898'; circ(c, -3, -2, 2.4); c.fill(); circ(c, 3, 3, 2); c.fill(); c.strokeStyle = '#5a5868'; c.lineWidth = 1; c.beginPath(); c.moveTo(-1, -6); c.lineTo(2, 0); c.stroke(); c.rotate(-Math.sign(e.vx || 1) * t * 0.14); c.scale(1, 1); c.fillStyle = '#2a1c2a'; circ(c, -1.6, -0.4, 1.1); c.fill(); circ(c, 2.4, -0.4, 1.1); c.fill(); break; }
      case 'hirari': c.translate(0, bob); c.fillStyle = '#6fcf5a'; c.strokeStyle = OUT; c.lineWidth = 1.2; c.beginPath(); c.ellipse(0, 0, 6.5, 4.4, 0, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.ellipse(-3, -5 + Math.sin(t * 0.4) * 2, 2.4, 5, -0.5, 0, TAU); c.fill(); c.stroke(); c.beginPath(); c.ellipse(3, -5 - Math.sin(t * 0.4) * 2, 2.4, 5, 0.5, 0, TAU); c.fill(); c.stroke(); faceE(c, 1, 0, 0); c.fillStyle = '#ffb347'; c.beginPath(); c.moveTo(5, 0); c.lineTo(8, 0.8); c.lineTo(5, 2); c.fill(); break;
      case 'puka': c.translate(0, bob); c.fillStyle = 'rgba(150,225,255,.75)'; c.strokeStyle = '#3ea0d0'; c.lineWidth = 1.2; c.beginPath(); c.ellipse(0, -1, 6.5, 6, 0, 0, TAU); c.fill(); c.stroke(); c.strokeStyle = '#6fc4e8'; for (let i = -1; i <= 1; i++) { c.beginPath(); c.moveTo(i * 3, 4); c.quadraticCurveTo(i * 3 + Math.sin(t * 0.2 + i) * 2, 7, i * 3, 9); c.stroke(); } faceE(c, 0.5, -1, 0); c.fillStyle = 'rgba(255,255,255,.7)'; circ(c, -3, -4, 1.4); c.fill(); break;
      case 'bakuda': { const lit = e.s === 1 && (e.n >> 2) % 2 === 0; body(c, 13, 13, lit ? '#d84a3a' : '#4a5064'); c.strokeStyle = '#a07a40'; c.lineWidth = 1.3; c.beginPath(); c.moveTo(1, -6); c.quadraticCurveTo(4, -9, 6, -7); c.stroke(); c.fillStyle = (t >> 1) % 2 ? '#ffe03a' : '#ff7a2a'; circ(c, 6.4, -7.6, 1.8); c.fill(); faceE(c, 0.5, 0.2, 1); c.fillStyle = '#fff'; c.fillRect(-1, 3, 3, 1.4); break; }
      case 'tobi': c.translate(0, bob); body(c, 11, 9, '#8a6aa8'); c.fillStyle = '#6a4a88'; c.beginPath(); c.moveTo(-5, -1); c.lineTo(-11, -4 + Math.sin(t * 0.5) * 3); c.lineTo(-7, 2); c.moveTo(5, -1); c.lineTo(11, -4 + Math.sin(t * 0.5) * 3); c.lineTo(7, 2); c.fill(); c.stroke(); faceE(c, 0.5, -0.4, 1); break;
      case 'togeko': body(c, 13, 12, '#d98a5a'); c.fillStyle = '#7a4a30'; c.strokeStyle = OUT; c.lineWidth = 1; for (let i = -2; i <= 2; i++) { c.beginPath(); c.moveTo(i * 2.6 - 1.4, -4.4 + Math.abs(i) * 0.8); c.lineTo(i * 2.6, -10 + Math.abs(i)); c.lineTo(i * 2.6 + 1.4, -4.4 + Math.abs(i) * 0.8); c.fill(); c.stroke(); } faceE(c, 0.5, 0, 1); break;
      case 'taiho': { c.scale(f, 1); c.fillStyle = '#6a6e82'; c.strokeStyle = OUT; c.lineWidth = 1.3; rr(c, -7, -4, 14, 12, 3); c.fill(); c.stroke(); c.fillStyle = '#4a4e62'; rr(c, 0, -3, 11, 6, 2); c.fill(); c.stroke(); c.fillStyle = '#9aa0b8'; circ(c, -2, 2, 2); c.fill(); break; }
      default: body(c, 12, 12, '#ccc');
    }
    c.restore();
  }
  function drawBoss(c, b, th, t, S) {
    const cx = b.x + b.w / 2, cy = b.y + b.h / 2, f = b.dir >= 0 ? 1 : -1, bk = b.bk;
    c.save(); c.translate(cx, cy);
    if (b.inv > 0 && (b.inv >> 1) % 2 === 0) c.globalAlpha = 0.55;
    if (b.s === 1 && bk === 'moon') c.globalAlpha = 0.25;
    c.strokeStyle = OUT; c.lineWidth = 1.6;
    if (bk === 'mush') {
      const hop = b.s === 1 ? -2 : Math.sin(t * 0.2) * 0.8; c.translate(0, hop);
      c.fillStyle = '#f2e3c8'; rr(c, -9, -1, 18, 14, 5); c.fill(); c.stroke();                       // stem
      c.fillStyle = b.ph === 3 ? '#e04a4a' : '#d05a6a'; c.beginPath(); c.ellipse(0, -5, 15, 10, 0, Math.PI, 0); c.lineTo(15, -3); c.lineTo(-15, -3); c.closePath(); c.fill(); c.stroke();   // cap
      c.fillStyle = '#fff'; circ(c, -6, -9, 2.8); c.fill(); circ(c, 4, -11, 2.4); c.fill(); circ(c, 9, -6, 2); c.fill();
      c.scale(f, 1); c.fillStyle = '#2a1c2a'; circ(c, -3.5, 3, 1.5); c.fill(); circ(c, 4.5, 3, 1.5); c.fill(); c.strokeStyle = '#2a1c2a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-6, 0); c.lineTo(-2, 1.6); c.moveTo(7, 0); c.lineTo(3, 1.6); c.stroke();
      c.fillStyle = '#e07a7a'; c.fillRect(-1, 7, 5, 1.6);
    } else if (bk === 'lava') {
      const shell = b.s === 0; c.scale(f, 1);
      c.fillStyle = '#7a4a3a'; c.beginPath(); c.ellipse(0, -1, 15, 11, 0, Math.PI, 0); c.lineTo(15, 8); c.lineTo(-15, 8); c.closePath(); c.fill(); c.stroke();
      c.fillStyle = '#ff7a2a'; for (const [dx, dy] of [[-7, -5], [0, -8], [7, -5]]) { c.beginPath(); c.moveTo(dx - 3, dy + 3); c.lineTo(dx, dy - 3); c.lineTo(dx + 3, dy + 3); c.fill(); c.stroke(); }
      if (!shell) { c.fillStyle = '#e8a870'; circ(c, 13, 3, 6); c.fill(); c.stroke(); c.fillStyle = '#2a1c2a'; circ(c, 15, 1, 1.3); c.fill(); c.fillStyle = '#e8a870'; rr(c, -9, 6, 6, 5, 2); c.fill(); c.stroke(); rr(c, 3, 6, 6, 5, 2); c.fill(); c.stroke(); }
      else { c.fillStyle = '#e8a870'; rr(c, -9, 7, 18, 4, 2); c.fill(); }
      if (b.ph >= 2) { c.strokeStyle = '#ffd24a'; c.lineWidth = 1; c.beginPath(); c.moveTo(-8, -2); c.lineTo(-3, -6); c.lineTo(2, -3); c.stroke(); }
    } else if (bk === 'snowk') {
      c.fillStyle = '#fff'; c.strokeStyle = OUT; circ(c, 0, 8, 11); c.fill(); c.stroke(); circ(c, 0, -6, 8.5); c.fill(); c.stroke();
      c.fillStyle = '#4b8ee2'; c.beginPath(); c.moveTo(-7, -12); c.lineTo(-6, -19); c.lineTo(-2, -15); c.lineTo(0, -21); c.lineTo(2, -15); c.lineTo(6, -19); c.lineTo(7, -12); c.closePath(); c.fillStyle = '#ffd23f'; c.fill(); c.stroke();
      c.scale(f, 1); c.fillStyle = '#2a1c2a'; circ(c, -3, -6, 1.4); c.fill(); circ(c, 3, -6, 1.4); c.fill(); c.fillStyle = '#ff9a3a'; c.beginPath(); c.moveTo(1, -4); c.lineTo(8, -3); c.lineTo(1, -2); c.fill();
      c.fillStyle = '#2a1c2a'; circ(c, 0, 4, 1.3); c.fill(); circ(c, 0, 9, 1.3); c.fill();
      c.strokeStyle = '#7a4a30'; c.lineWidth = 1.8; c.beginPath(); c.moveTo(-10, 4); c.lineTo(-17, -2 + Math.sin(t * 0.2) * 2); c.moveTo(10, 4); c.lineTo(17, -2 - Math.sin(t * 0.2) * 2); c.stroke();
    } else if (bk === 'cloud') {
      const dark = b.ph >= 2; c.fillStyle = dark ? '#6a6f8f' : '#a8aecb';
      for (const [dx, dy, r] of [[-10, 2, 8], [0, -4, 10], [10, 2, 8], [-4, 5, 7], [5, 5, 7]]) { circ(c, dx, dy + Math.sin(t * 0.1 + dx) * 0.8, r); c.fill(); }
      c.strokeStyle = OUT; c.lineWidth = 1.4; c.beginPath(); c.arc(0, -4, 10, Math.PI * 1.05, Math.PI * 1.95); c.stroke();
      c.scale(f, 1); c.fillStyle = '#2a1c2a'; circ(c, -4, 0, 1.6); c.fill(); circ(c, 4, 0, 1.6); c.fill(); c.strokeStyle = '#2a1c2a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-7, -3); c.lineTo(-2, -1.4); c.moveTo(7, -3); c.lineTo(2, -1.4); c.stroke();
      c.fillStyle = '#ffe03a'; c.beginPath(); c.moveTo(0, 5); c.lineTo(-3, 9); c.lineTo(-0.4, 9); c.lineTo(-1.6, 13); c.lineTo(3, 8); c.lineTo(0.4, 8); c.closePath(); c.fill();
    } else if (bk === 'moon') {
      c.fillStyle = '#f6efc8'; circ(c, 0, 0, 11); c.fill(); c.stroke(); c.fillStyle = '#e6dca0'; circ(c, -4, -3, 2.6); c.fill(); circ(c, 4, 4, 2); c.fill();
      c.fillStyle = '#2a1c2a'; c.scale(f, 1); circ(c, -3, -1, 1.5); c.fill(); circ(c, 4, -1, 1.5); c.fill(); c.strokeStyle = '#2a1c2a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(-6, -4); c.lineTo(-1, -2); c.moveTo(7, -4); c.lineTo(2, -2); c.stroke(); c.beginPath(); c.arc(1, 4, 3, 0.2, Math.PI - 0.2); c.stroke();
      c.fillStyle = '#8a5cff'; c.beginPath(); c.moveTo(-9, -8); c.lineTo(-7, -17); c.lineTo(-3, -11); c.lineTo(0, -18); c.lineTo(3, -11); c.lineTo(7, -17); c.lineTo(9, -8); c.closePath(); c.fill(); c.stroke();
      if (b.ph >= 2) { c.globalAlpha = 0.5; c.strokeStyle = '#d8c2ff'; c.lineWidth = 1; circ(c, 0, 0, 14 + Math.sin(t * 0.2) * 1.5); c.stroke(); }
    }
    c.restore();
  }
  function drawProj(c, q, th, t, S) {
    const cx = q.x + q.w / 2, cy = q.y + q.h / 2, k = q.k;
    c.save(); c.translate(cx, cy);
    switch (k) {
      case 'star': c.rotate(t * 0.3); starPath(c, 0, 0, 6, 2.8, 5); c.fillStyle = '#ffe27a'; c.fill(); c.strokeStyle = '#b07a00'; c.lineWidth = 1; c.stroke(); break;
      case 'air': c.fillStyle = 'rgba(255,255,255,.8)'; circ(c, 0, 0, 4 + (14 - q.t) * 0.3); c.fill(); break;
      case 'flame': { const a = q.t / 24; c.fillStyle = a > 0.5 ? '#ffd24a' : '#ff7a2a'; c.globalAlpha = 0.5 + a * 0.5; circ(c, 0, 0, 3 + (1 - a) * 4); c.fill(); c.fillStyle = '#ff4a1a'; circ(c, 1, 0, 1.6 + (1 - a) * 2); c.fill(); break; }
      case 'icebr': { const a = q.t / 20; c.globalAlpha = 0.5 + a * 0.5; c.fillStyle = '#c8f0ff'; c.rotate(t * 0.2); starPath(c, 0, 0, 4 + (1 - a) * 3, 1.8, 6); c.fill(); break; }
      case 'leaf': c.rotate(t * 0.5); c.fillStyle = '#6fcf5a'; c.strokeStyle = OUT; c.lineWidth = 1; c.beginPath(); c.ellipse(0, 0, 8, 3.6, 0, 0, TAU); c.fill(); c.stroke(); c.strokeStyle = '#3f9a3a'; c.beginPath(); c.moveTo(-7, 0); c.lineTo(7, 0); c.stroke(); break;
      case 'bub': c.fillStyle = 'rgba(160,230,255,.4)'; c.strokeStyle = 'rgba(70,180,240,.95)'; c.lineWidth = 1.2; circ(c, 0, 0, 6.2); c.fill(); c.stroke(); c.fillStyle = 'rgba(255,255,255,.8)'; circ(c, -2, -2, 1.4); c.fill(); break;
      case 'bomb': c.fillStyle = (q.t < 20 && (q.t >> 2) % 2) ? '#d84a3a' : '#3a4050'; c.strokeStyle = OUT; c.lineWidth = 1; circ(c, 0, 0, 4.6); c.fill(); c.stroke(); c.strokeStyle = '#a07a40'; c.beginPath(); c.moveTo(1, -4); c.quadraticCurveTo(3, -7, 5, -5); c.stroke(); c.fillStyle = '#ffe03a'; circ(c, 5, -5.4, 1.3); c.fill(); break;
      case 'spore': c.fillStyle = '#e8c8f0'; c.strokeStyle = OUT; c.lineWidth = 1; circ(c, 0, 0, 4.2); c.fill(); c.stroke(); c.fillStyle = '#c88ad8'; circ(c, -1, -1, 1.4); c.fill(); break;
      case 'fb': c.fillStyle = '#ff7a2a'; circ(c, 0, 0, 4); c.fill(); c.fillStyle = '#ffe27a'; circ(c, 0, 0, 2); c.fill(); break;
      case 'ball': c.fillStyle = q.roll ? '#fff' : '#6a6e82'; c.strokeStyle = OUT; c.lineWidth = 1.2; circ(c, 0, 0, q.w / 2); c.fill(); c.stroke(); if (q.roll) { c.fillStyle = '#d6e8f7'; circ(c, -2, -2, 2); c.fill(); } break;
      case 'pellet': c.fillStyle = '#d8c2ff'; c.strokeStyle = '#6a4aa5'; c.lineWidth = 1; starPath(c, 0, 0, 4.4, 2, 4); c.fill(); c.stroke(); break;
      case 'drop': c.fillStyle = '#8fb4ff'; c.beginPath(); c.moveTo(0, -5); c.quadraticCurveTo(4, 1, 0, 4); c.quadraticCurveTo(-4, 1, 0, -5); c.fill(); break;
      case 'spike': c.fillStyle = '#bfefff'; c.strokeStyle = '#6fb6dc'; c.lineWidth = 1; c.beginPath(); c.moveTo(-5, -7); c.lineTo(5, -7); c.lineTo(0, 8); c.closePath(); c.fill(); c.stroke(); break;
      case 'bolt': case 'pillar': {
        const warn = q.t > q.warn; c.translate(-cx, -cy);
        if (warn) { c.globalAlpha = 0.25 + 0.2 * Math.sin(t * 0.5); c.fillStyle = k === 'bolt' ? '#ffe03a' : '#ff7a2a'; c.fillRect(q.x, q.y, q.w, q.h); c.globalAlpha = 1; c.fillStyle = k === 'bolt' ? '#ffe03a' : '#ff7a2a'; c.fillRect(q.x + q.w / 2 - 1, q.y + q.h - 5, 2, 4); }
        else { c.fillStyle = k === 'bolt' ? '#fff7a8' : '#ffb347'; c.fillRect(q.x, q.y, q.w, q.h); c.fillStyle = k === 'bolt' ? '#ffe03a' : '#ff5a2a'; c.fillRect(q.x + 3, q.y, q.w - 6, q.h); }
        break;
      }
      default: break;
    }
    c.restore();
  }
  function drawItem(c, it, th, t) {
    const cx = it.x + it.w / 2, cy = it.y + it.h / 2;
    if (it.k === 'candy') { c.save(); c.translate(cx, cy + Math.sin(t * 0.1) * 1); c.rotate(Math.sin(t * 0.05) * 0.3); c.fillStyle = ABCOL[it.ab] || '#ff9ad0'; c.strokeStyle = OUT; c.lineWidth = 1; circ(c, 0, 0, 4.4); c.fill(); c.stroke(); c.fillStyle = '#fff'; c.beginPath(); c.moveTo(-4.4, 0); c.lineTo(-8, -3); c.lineTo(-8, 3); c.closePath(); c.fill(); c.beginPath(); c.moveTo(4.4, 0); c.lineTo(8, -3); c.lineTo(8, 3); c.closePath(); c.fill(); c.restore(); }
    else if (it.k === 'heart') heart(c, cx, cy + Math.sin(t * 0.1) * 1.2, 6, '#ff5f82');
  }

  // ---------------- the stage ----------------
  function draw(c, S, o) {
    const th = THEMES[o.theme] || THEMES.meadow, sc = o.sc, dpr = o.dpr || 1, t = o.t || S.f;
    const L = S.L, W = L.W * TS, WH = L.H * TS;
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
    sky(c, th, o.w, o.h, 0, t);
    const vw = o.w / sc;
    const camx = Math.max(0, Math.min(W - vw, S.cam.x)), oy = Math.max(0, (o.h - WH * sc) / 2);
    S.vw = vw;
    c.save(); c.translate(0, oy); c.scale(sc, sc);
    backdrop(c, th, o.theme, camx, t, vw, WH);
    c.translate(-Math.round(camx * sc) / sc, 0);
    if (S.shake > 0) c.translate((S.f % 2 ? 1 : -1) * Math.min(2, S.shake * 0.3), 0);
    const tx0 = Math.max(0, Math.floor(camx / TS)), tx1 = Math.min(L.W - 1, Math.floor((camx + vw) / TS) + 1);
    for (let ty = 0; ty < L.H; ty++) for (let tx = tx0; tx <= tx1; tx++) { const tt = E.tl(S, tx, ty); if (tt) drawTile(c, S, th, o.theme, tx, ty, t, tt); }
    // the ground below the world (pits show the dark)
    c.fillStyle = th.dark; c.globalAlpha = 0.0; c.fillRect(camx, WH, vw, 400); c.globalAlpha = 1;
    for (const it of S.it) drawItem(c, it, th, t);
    for (const e of S.en) { if (e.dead) continue; if (e.x + 40 < camx || e.x - 40 > camx + vw) continue; if (e.k === 'boss') drawBoss(c, e, th, t, S); else drawEnemy(c, e, th, t, S); }
    for (const q of S.pr) drawProj(c, q, th, t, S);
    for (let i = S.ps.length - 1; i >= 0; i--) drawHero(c, S, S.ps[i], t, { id: i });
    if (o.fx) o.fx.draw(c);
    c.restore();
    // fill below / above the world when the screen is taller than the level
    if (oy > 0) { c.fillStyle = th.dark; c.fillRect(0, oy + WH * sc, o.w, o.h); }
    c.setTransform(dpr, 0, 0, dpr, 0, 0);
  }

  const PA = { THEMES, ABCOL, Fx, feed, draw, drawHero, drawHeroBody, drawEnemy, drawBoss, drawTile, drawItem, heart, starPath, rr, circ, crest, sky, backdrop, OUT };
  if (typeof module === 'object' && module && module.exports) module.exports = PA;
  root.PuffArt = PA;
})(typeof window !== 'undefined' ? window : globalThis);
