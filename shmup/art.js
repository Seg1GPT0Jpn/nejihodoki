// ペーパーウイング - art: everything is drawn with canvas vector calls, then cached on offscreen canvases (sprites, parallax tiles).
// A frame is mostly drawImage calls, so 400+ bullets stay cheap. Particles live here (view only, Math.random is fine); the sim never reads them.
(function (root) {
  'use strict';
  const E = root.ShmupEngine, Dt = root.ShmupData;
  const W = 480, H = 270, TAU = Math.PI * 2;
  let K = 2;                         // backing pixels per logical unit
  let spr = null, bgc = null;        // caches
  const BCOL = ['#ff5a6e', '#59a8ff', '#ffd23f', '#5fe08a'];     // red blue yellow green

  // ---------------------------------------------------------------- tiny draw kit
  const mkCanvas = (w, h) => { const c = document.createElement('canvas'); c.width = Math.ceil(w * K); c.height = Math.ceil(h * K); const x = c.getContext('2d'); x.scale(K, K); return [c, x]; };
  function P(c, pts, fill, st, lw) { c.beginPath(); for (let i = 0; i < pts.length; i++) i ? c.lineTo(pts[i][0], pts[i][1]) : c.moveTo(pts[i][0], pts[i][1]); c.closePath(); if (fill) { c.fillStyle = fill; c.fill(); } if (st) { c.strokeStyle = st; c.lineWidth = lw || 1.2; c.lineJoin = 'round'; c.stroke(); } }
  function C(c, x, y, r, fill, st, lw) { c.beginPath(); c.arc(x, y, r, 0, TAU); if (fill) { c.fillStyle = fill; c.fill(); } if (st) { c.strokeStyle = st; c.lineWidth = lw || 1.2; c.stroke(); } }
  function R(c, x, y, w, h, fill, st, rad) { c.beginPath(); if (c.roundRect) c.roundRect(x, y, w, h, rad || 2); else c.rect(x, y, w, h); if (fill) { c.fillStyle = fill; c.fill(); } if (st) { c.strokeStyle = st; c.lineWidth = 1.2; c.stroke(); } }
  function L(c, x1, y1, x2, y2, col, lw) { c.beginPath(); c.moveTo(x1, y1); c.lineTo(x2, y2); c.strokeStyle = col; c.lineWidth = lw || 1.2; c.lineCap = 'round'; c.stroke(); }
  const TIN = '#c4ccd4', TIN2 = '#8e99a6', RUST = '#b5653a', RUST2 = '#7a3f22', INK = '#3b2f2a', YEL = '#ffd23f', RED = '#e0453a', BLUE = '#4f8fe0';
  function sprite(w, h, fn) { const [cv, c] = mkCanvas(w, h); c.translate(w / 2, h / 2); fn(c); return { cv, w, h }; }

  // ---------------------------------------------------------------- player ships (paper planes facing right)
  const SHIPART = [
    c => { P(c, [[16, 0], [-14, -11], [-8, 0], [-14, 11]], '#fbfdff', '#6b7f99'); P(c, [[16, 0], [-8, 0], [-14, 11]], '#d3e3f7'); L(c, 16, 0, -8, 0, '#5b86c9', 1.4); P(c, [[-2, -3], [-12, -9], [-8, 0]], '#9fc0ee'); },
    c => { P(c, [[17, 0], [-6, -4], [-16, -13], [-12, -2], [-16, 0], [-12, 2], [-16, 13], [-6, 4]], '#fff6e0', '#a07a50'); P(c, [[17, 0], [-6, 4], [-16, 13], [-12, 2]], '#ead6b0'); P(c, [[-12, -9], [-16, -13], [-14, -6]], '#e0453a'); P(c, [[-12, 9], [-16, 13], [-14, 6]], '#e0453a'); C(c, 6, 0, 1.6, '#a07a50'); },
    c => { P(c, [[14, 0], [-4, -9], [-14, -6], [-10, 0], [-14, 6], [-4, 9]], '#f4ffe0', '#6f9a52'); P(c, [[14, 0], [-10, 0], [-14, 6], [-4, 9]], '#d4eab0'); C(c, -1, 0, 3.4, '#ffe680', '#c9a020'); C(c, -1, 0, 1.4, '#fff9d0'); },
  ];
  function buildPlayerSprites() {
    spr.ship = SHIPART.map(f => sprite(40, 32, f));
    spr.opt = [0, 1, 2].map(i => sprite(14, 14, c => { if (i === 2) { C(c, 0, 0, 4.5, '#fff2a8', '#d9a82a'); C(c, 0, 0, 2, '#fff'); } else { P(c, [[5, 0], [-4, -4], [-2, 0], [-4, 4]], '#fff', '#6b7f99'); } }));
    spr.core = sprite(12, 12, c => { C(c, 0, 0, 3.4, '#fff', '#ff4060', 1.4); });
    spr.shots = [
      sprite(14, 8, c => { R(c, -5, -1.6, 10, 3.2, '#dff0ff', '#4f8fe0', 1.5); }),
      sprite(18, 6, c => { P(c, [[8, 0], [-8, -1.8], [-8, 1.8]], '#fff4d6', '#d28a2a'); }),
      sprite(14, 10, c => { P(c, [[6, 0], [-5, -3], [-3, 0], [-5, 3]], '#ffe0e0', '#e0453a'); C(c, -5, 0, 1.4, '#ffb347'); }),
      sprite(10, 10, c => { C(c, 0, 0, 3.2, '#fff8c0', '#ffc936'); }),
    ];
    spr.charge = [0, 1].map(i => sprite(60, 60, c => { const r = i ? 22 : 14; const g = c.createRadialGradient(0, 0, 2, 0, 0, r); g.addColorStop(0, '#fff'); g.addColorStop(0.6, '#ffd36b'); g.addColorStop(1, 'rgba(255,120,60,0)'); c.fillStyle = g; c.beginPath(); c.arc(0, 0, r + 4, 0, TAU); c.fill(); }));
  }

  // ---------------------------------------------------------------- bullets, items
  function buildBulletSprites() {
    spr.b = [];
    for (let k = 0; k < 4; k++) {
      spr.b[k] = [];
      for (let c = 0; c < 4; c++) {
        const col = BCOL[c];
        if (k === 0 || k === 1) { const r = k ? 5.5 : 3.6; spr.b[k][c] = sprite(r * 2 + 4, r * 2 + 4, x => { C(x, 0, 0, r + 1, 'rgba(255,255,255,.9)'); C(x, 0, 0, r - 0.3, col); C(x, -r * 0.25, -r * 0.25, r * 0.35, 'rgba(255,255,255,.8)'); }); }
        else {
          spr.b[k][c] = [];
          for (let a = 0; a < 16; a++) spr.b[k][c][a] = sprite(16, 16, x => { x.rotate(a * TAU / 16); if (k === 2) { P(x, [[6, 0], [-5, -2.2], [-5, 2.2]], col, '#fff', 0.8); } else { P(x, [[6, 0], [-3, -3.2], [-6, 0], [-3, 3.2]], col, '#fff', 0.9); C(x, -5.5, 0, 1.6, '#ffd5a0'); } });
        }
      }
    }
    const IT = [['P', '#ff5a6e'], ['S', '#59a8ff'], ['O', '#ffd23f'], ['H', '#5fe08a'], ['B', '#c07cff']];
    spr.item = IT.map(it => sprite(24, 24, c => { C(c, 0, 0, 9.5, it[1], '#fff', 1.6); c.fillStyle = '#fff'; c.font = '800 11px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(it[0], 0, 0.5); }));
  }

  // ---------------------------------------------------------------- the junk fleet. Facing left. (c is centered on the enemy)
  const ENART = {
    rivet: c => { C(c, 0, 0, 6.5, TIN, INK); C(c, -2, -1, 1.3, INK); C(c, 2, 2, 1.1, INK); P(c, [[6, -2], [11, -5], [11, 5], [6, 2]], RUST, INK); },
    gull: c => { P(c, [[-8, 0], [2, -4], [8, 0], [2, 4]], TIN, INK); P(c, [[0, -3], [-4, -13], [6, -4]], TIN2, INK); P(c, [[0, 3], [-4, 13], [6, 4]], TIN2, INK); P(c, [[-8, 0], [-13, 1], [-8, 2]], YEL, INK); C(c, -4, -1, 1, INK); },
    bolt: c => { for (let i = 0; i < 6; i++) { const a = i * TAU / 6; } P(c, [[-6, 0], [-3, -5.5], [3, -5.5], [6, 0], [3, 5.5], [-3, 5.5]], TIN2, INK); C(c, 0, 0, 2.5, INK); L(c, 6, 0, 12, 0, RUST, 3); },
    pod: c => { R(c, -8, -2, 16, 12, RUST, RUST2, 2); R(c, -8, 1, 16, 2, '#d79b57'); R(c, -8, 6, 16, 2, '#d79b57'); C(c, 0, -8, 9, 'rgba(255,230,120,.95)', '#b08a20'); L(c, -7, -4, -5, -2, INK, 1); L(c, 7, -4, 5, -2, INK, 1); C(c, -3, -10, 2, 'rgba(255,255,255,.7)'); },
    spring: c => { for (let i = -2; i <= 2; i++) { c.beginPath(); c.ellipse(i * 3.2, 0, 2.2, 7, 0, 0, TAU); c.strokeStyle = TIN2; c.lineWidth = 1.8; c.stroke(); } R(c, -11, -3, 4, 6, RUST, INK, 1); R(c, 7, -3, 4, 6, RUST, INK, 1); },
    gear: c => { for (let i = 0; i < 10; i++) { c.save(); c.rotate(i * TAU / 10); R(c, 9, -2.6, 5, 5.2, TIN2, INK, 1); c.restore(); } C(c, 0, 0, 11, TIN, INK, 1.6); C(c, 0, 0, 4, RUST2, INK); L(c, -6, 0, 6, 0, TIN2, 1.2); L(c, 0, -6, 0, 6, TIN2, 1.2); },
    turret: c => { R(c, -7, 0, 14, 8, RUST2, INK, 2); C(c, 0, 0, 6.5, TIN, INK); R(c, -13, -2.5, 11, 5, TIN2, INK, 1.5); },
    kettle: c => { P(c, [[-10, 6], [-12, -2], [-6, -9], [6, -9], [11, -2], [9, 6]], RUST, RUST2, 1.6); R(c, -3, -13, 6, 4, TIN, INK, 1); P(c, [[-10, -1], [-17, -6], [-15, 0]], RUST, RUST2); C(c, 3, -1, 3.2, TIN, INK); L(c, 8, -6, 14, 0, INK, 1.8); },
    magnet: c => { c.beginPath(); c.arc(0, 0, 9, Math.PI * 0.6, Math.PI * 2.4); c.strokeStyle = RED; c.lineWidth = 6; c.stroke(); R(c, -12, 3, 6, 6, '#eee', INK, 1); R(c, 6, 3, 6, 6, '#eee', INK, 1); C(c, 0, -2, 1.4, YEL); },
    lamp: c => { P(c, [[-12, 0], [-5, -8], [6, -8], [6, 8], [-5, 8]], TIN2, INK); C(c, -9, 0, 4.2, '#fff4a8', INK); C(c, -9, 0, 7, 'rgba(255,240,150,.35)'); R(c, 6, -4, 8, 8, RUST, INK, 1); },
    spool: c => { R(c, -7, -7, 14, 3, RUST, INK, 1); R(c, -7, 4, 14, 3, RUST, INK, 1); R(c, -4, -4, 8, 8, '#e8d5a0', INK, 0); L(c, -4, -2, 4, -2, RED, 1.2); L(c, -4, 1, 4, 1, RED, 1.2); L(c, -4, 3, 4, 3, RED, 1.2); },
    umbrella: c => { c.beginPath(); c.arc(0, 0, 10, Math.PI * 0.5, Math.PI * 1.5); c.lineTo(0, 0); c.closePath(); c.fillStyle = BLUE; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke(); L(c, 0, 0, 12, 0, INK, 1.6); L(c, 0, -5, 9, 0, '#fff', 1); L(c, 0, 5, 9, 0, '#fff', 1); },
    crab: c => { R(c, -13, -8, 26, 16, RUST, RUST2, 5); R(c, -17, 4, 34, 5, TIN2, INK, 2); for (let i = -2; i <= 2; i++) C(c, i * 6.5, 11, 3, TIN, INK); P(c, [[-13, -2], [-23, -10], [-18, -12], [-12, -8]], RED, INK); P(c, [[13, -2], [21, -12], [14, -9]], RED, INK); C(c, -5, -3, 2.6, '#fff', INK); C(c, 5, -3, 2.6, '#fff', INK); C(c, -5, -3, 1, INK); C(c, 5, -3, 1, INK); },
    prop: c => { P(c, [[-7, 0], [0, -4], [7, 0], [0, 4]], RED, INK); C(c, 7, 0, 1.6, INK); P(c, [[-9, 0], [-14, -9], [-12, 0]], TIN, INK); P(c, [[-9, 0], [-14, 9], [-12, 0]], TIN, INK); L(c, -9, -10, -9, 10, 'rgba(60,60,60,.5)', 1.6); },
    mine: c => { for (let i = 0; i < 8; i++) { c.save(); c.rotate(i * TAU / 8); P(c, [[7, -2], [13, 0], [7, 2]], TIN2, INK, 1); c.restore(); } C(c, 0, 0, 8, RUST2, INK, 1.6); C(c, -2, -2, 2.6, RED); },
    cannon: c => { P(c, [[-26, -4], [-22, 8], [20, 10], [28, 0], [22, -6]], RUST, RUST2, 2); R(c, -12, -17, 22, 14, TIN2, INK, 3); R(c, -34, -2, 22, 6, TIN, INK, 2); R(c, -30, 6, 24, 4, TIN, INK, 2); C(c, 0, -10, 4, YEL, INK); for (let i = -2; i <= 2; i++) C(c, i * 9, 4, 2.2, TIN, INK); L(c, 18, -6, 18, -16, INK, 2); P(c, [[18, -16], [28, -13], [18, -10]], RED, INK, 1); },
    jelly: c => { c.beginPath(); c.arc(0, -1, 10, Math.PI, 0); c.lineTo(10, 3); c.lineTo(-10, 3); c.closePath(); c.fillStyle = 'rgba(255,170,220,.95)'; c.fill(); c.strokeStyle = '#a04a85'; c.lineWidth = 1.2; c.stroke(); for (let i = -2; i <= 2; i++) L(c, i * 4, 3, i * 4 + (i % 2 ? 2 : -2), 12, '#e07ac0', 1.6); C(c, -3, -3, 1.4, INK); C(c, 3, -3, 1.4, INK); },
    icicle: c => { P(c, [[-5, -11], [5, -11], [0, 12]], '#dff4ff', '#6aa7d6', 1.4); L(c, -1, -9, 0, 6, '#fff', 1.2); },
    rocket: c => { P(c, [[11, 0], [5, -5], [-9, -5], [-9, 5], [5, 5]], '#f2f2f2', INK); P(c, [[11, 0], [5, -5], [5, 5]], RED, INK); P(c, [[-9, -5], [-14, -9], [-6, -5]], BLUE, INK); P(c, [[-9, 5], [-14, 9], [-6, 5]], BLUE, INK); C(c, -2, 0, 2.2, YEL, INK); P(c, [[-9, -2], [-18, 0], [-9, 2]], '#ff9f3a'); },
    wisp: c => { c.beginPath(); c.moveTo(-9, 2); c.quadraticCurveTo(-8, -13, 2, -12); c.quadraticCurveTo(10, -7, 9, 3); c.quadraticCurveTo(5, 12, 0, 7); c.quadraticCurveTo(-4, 12, -9, 2); c.fillStyle = 'rgba(170,230,255,.92)'; c.fill(); c.strokeStyle = '#4d86b8'; c.lineWidth = 1.2; c.stroke(); C(c, -3, -2, 1.5, INK); C(c, 3, -2, 1.5, INK); },
    wasp: c => { c.beginPath(); c.ellipse(0, 0, 8, 5, 0, 0, TAU); c.fillStyle = YEL; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.2; c.stroke(); L(c, -2, -4, -2, 4, INK, 2); L(c, 3, -4, 3, 4, INK, 2); P(c, [[8, 0], [14, 0], [8, 2]], INK); P(c, [[-2, -4], [2, -11], [5, -4]], 'rgba(255,255,255,.7)', INK, 0.8); C(c, -6, -1, 1.3, INK); },
  };
  const BOSSART = [
    c => { R(c, -20, -22, 40, 40, RUST, RUST2, 6); R(c, -14, -34, 28, 14, TIN2, INK, 5); P(c, [[-14, -34], [0, -46], [14, -34]], RED, INK); C(c, -6, -26, 3, '#fff', INK); C(c, 6, -26, 3, '#fff', INK); R(c, -30, -12, 10, 26, TIN, INK, 3); R(c, 20, -12, 10, 26, TIN, INK, 3); R(c, -16, 18, 12, 14, TIN2, INK, 3); R(c, 4, 18, 12, 14, TIN2, INK, 3); for (let i = 0; i < 3; i++) C(c, -8 + i * 8, -2, 2.4, YEL, INK); L(c, 0, -2, 0, 14, INK, 2); P(c, [[24, -22], [46, -26], [46, -16]], TIN, INK); },
    c => { R(c, -34, -4, 60, 18, RUST, RUST2, 4); L(c, -4, -4, -4, -40, TIN2, 5); L(c, -4, -40, 30, -34, TIN2, 4); L(c, 30, -34, 30, -10, '#222', 1.6); P(c, [[24, -10], [36, -10], [30, 0]], YEL, INK); R(c, -30, -16, 16, 12, TIN, INK, 3); C(c, -22, -10, 3, '#9ae', INK); for (let i = 0; i < 4; i++) C(c, -26 + i * 14, 18, 5, INK, TIN2, 2); },
    c => { R(c, -22, -16, 44, 34, RUST2, INK, 6); R(c, -14, -34, 28, 20, TIN2, INK, 6); C(c, -6, -26, 4, YEL, INK); C(c, 7, -26, 4, YEL, INK); P(c, [[-22, -8], [-44, 4], [-40, 18], [-22, 10]], RUST, INK); P(c, [[22, -8], [44, -2], [42, 14], [22, 10]], TIN, INK); for (let i = 0; i < 5; i++) { C(c, -14 + i * 7, 4, 2.4, TIN, INK); } P(c, [[-8, 18], [-14, 32], [-2, 32]], TIN2, INK); P(c, [[8, 18], [2, 32], [14, 32]], TIN2, INK); },
    c => { for (let i = 0; i < 14; i++) { c.save(); c.rotate(i * TAU / 14); R(c, 22, -3.4, 8, 6.8, '#d8b24a', INK, 1); c.restore(); } C(c, 0, 0, 24, '#e6c45a', INK, 2); C(c, 0, 0, 14, RUST2, INK); C(c, 0, 0, 7, '#ffe9a0', INK); P(c, [[-8, -34], [0, -44], [8, -34], [4, -26], [-4, -26]], '#ffd23f', INK); L(c, -14, 0, 14, 0, INK, 1.6); L(c, 0, -14, 0, 14, INK, 1.6); },
    c => { C(c, 0, 12, 20, '#f4fbff', '#6aa7d6', 2); C(c, 0, -14, 14, '#f4fbff', '#6aa7d6', 2); C(c, -5, -17, 2.2, INK); C(c, 5, -17, 2.2, INK); P(c, [[0, -14], [-12, -11], [0, -9]], '#ff9f3a', INK); R(c, -16, -32, 32, 7, BLUE, INK, 2); R(c, -10, -42, 20, 11, BLUE, INK, 2); L(c, -20, 8, -34, -2, INK, 2.4); L(c, 20, 8, 34, -2, INK, 2.4); for (let i = 0; i < 3; i++) C(c, 0, 4 + i * 8, 1.8, INK); },
    c => { c.beginPath(); c.ellipse(0, 18, 30, 8, 0, 0, TAU); c.fillStyle = '#6a4aa0'; c.fill(); c.strokeStyle = INK; c.lineWidth = 1.5; c.stroke(); P(c, [[-30, 14], [0, -40], [30, 14]], '#c04a7a', INK, 2); for (let i = -2; i <= 2; i++) L(c, i * 9, 14, i * 4, -30 + Math.abs(i) * 6, '#ffd5e5', 1.5); L(c, 0, -40, 0, -50, INK, 2); P(c, [[0, -50], [10, -47], [0, -44]], YEL, INK, 1); for (let i = -2; i <= 2; i++) { C(c, i * 10, 14, 2.4, YEL, INK); } L(c, -14, 18, -14, 32, TIN, 2); L(c, 14, 18, 14, 32, TIN, 2); P(c, [[-12, 28], [-20, 26], [-18, 36], [-10, 34]], '#f2e6d0', INK, 1); },
    c => { P(c, [[-30, 24], [-30, -10], [-16, -10], [-16, -22], [-6, -22], [-6, -34], [6, -34], [6, -22], [16, -22], [16, -10], [30, -10], [30, 24]], '#6a5a64', INK, 2); P(c, [[-14, -34], [-8, -48], [-2, -34], [2, -48], [8, -34], [14, -48], [18, -34]], '#ffd23f', INK, 1.5); R(c, -10, -20, 20, 14, '#2b2230', INK, 4); C(c, -4, -14, 2, '#ff5a6e'); C(c, 4, -14, 2, '#ff5a6e'); for (let i = -2; i <= 2; i++) R(c, i * 11 - 3, 8, 6, 12, RUST, INK, 1); C(c, 0, -2, 4, '#ffd23f', INK); },
  ];
  function buildEnemySprites() {
    spr.en = {};
    for (const id of Dt.EN_IDS) { const r = Dt.EN[id].r, s = Math.max(40, r * 2 + 40); spr.en[id] = [0, 1].map(f => sprite(s, s, c => { ENART[id](c); if (f) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(255,255,255,.6)'; c.fillRect(-s / 2, -s / 2, s, s); } })); }
    spr.boss = BOSSART.map(fn => [0, 1].map(f => sprite(130, 130, c => { fn(c); if (f) { c.globalCompositeOperation = 'source-atop'; c.fillStyle = 'rgba(255,255,255,.55)'; c.fillRect(-65, -65, 130, 130); } })));
  }

  // ---------------------------------------------------------------- parallax backgrounds (seamless 480 x 270 tiles, drawn twice)
  const THEMES = {
    toysky: { sky: ['#8fd3ff', '#e8f7ff'], layers: [['clouds', 'rgba(255,255,255,.85)', 0.25], ['blocks', 'rgba(255,170,90,.55)', 0.5], ['balloons', 'rgba(255,90,120,.7)', 0.9]] },
    harbor: { sky: ['#ffb27a', '#ffe7c4'], layers: [['waves', 'rgba(90,120,160,.8)', 0.2], ['cranes', 'rgba(90,60,50,.6)', 0.5], ['buoys', 'rgba(200,70,50,.75)', 1]] },
    scrap: { sky: ['#c79a6b', '#f2d6a8'], layers: [['heaps', 'rgba(110,70,45,.6)', 0.25], ['heaps', 'rgba(80,50,35,.75)', 0.55], ['sparks', 'rgba(255,180,60,.8)', 1.1]] },
    factory: { sky: ['#6f8fb8', '#cfe0f2'], layers: [['clouds', 'rgba(255,255,255,.55)', 0.2], ['pipes', 'rgba(70,85,110,.7)', 0.5], ['gears', 'rgba(50,60,80,.65)', 0.9]] },
    frozen: { sky: ['#b6e5ff', '#f4fcff'], layers: [['ice', 'rgba(150,200,235,.7)', 0.25], ['ice', 'rgba(110,170,215,.75)', 0.55], ['snow', 'rgba(255,255,255,.9)', 1.2]] },
    carnival: { sky: ['#1b1040', '#5a2a78'], layers: [['stars', 'rgba(255,240,180,.9)', 0.1], ['wheel', 'rgba(255,120,190,.55)', 0.35], ['bulbs', 'rgba(255,220,90,.9)', 0.9]] },
    castle: { sky: ['#2a1420', '#6a3042'], layers: [['spires', 'rgba(30,20,30,.8)', 0.3], ['heaps', 'rgba(20,12,20,.85)', 0.6], ['sparks', 'rgba(255,110,60,.85)', 1.1]] },
  };
  function layerDraw(kind, c, col, seed) {
    let s = seed * 9301 + 49297; const r = () => { s = (s * 9301 + 49297) % 233280; return s / 233280; };
    c.fillStyle = col; c.strokeStyle = col;
    const wrap = (x, w, f) => { f(x); if (x + w > W) f(x - W); if (x < w * 0.3) f(x + W); };
    if (kind === 'clouds') for (let i = 0; i < 6; i++) { const x = r() * W, y = 20 + r() * 150, w = 50 + r() * 50; wrap(x, w * 1.2, x0 => { for (let j = 0; j < 4; j++) { c.beginPath(); c.arc(x0 + j * w / 4, y + (j % 2) * 6, w / 5 + (j % 2) * 4, 0, TAU); c.fill(); } }); }
    else if (kind === 'blocks') for (let i = 0; i < 7; i++) { const x = r() * W, y = 40 + r() * 190, s2 = 14 + r() * 16; wrap(x, s2, x0 => { c.save(); c.translate(x0 + s2 / 2, y); c.rotate(r() * 0.8 - 0.4); R(c, -s2 / 2, -s2 / 2, s2, s2, col, null, 3); c.fillStyle = 'rgba(255,255,255,.4)'; c.fillRect(-s2 / 4, -s2 / 4, s2 / 2, s2 / 6); c.restore(); }); }
    else if (kind === 'balloons') for (let i = 0; i < 5; i++) { const x = r() * W, y = 30 + r() * 200; wrap(x, 24, x0 => { c.beginPath(); c.ellipse(x0, y, 9, 11, 0, 0, TAU); c.fill(); c.lineWidth = 1; c.strokeStyle = 'rgba(80,60,60,.5)'; c.beginPath(); c.moveTo(x0, y + 11); c.lineTo(x0 + 2, y + 34); c.stroke(); }); }
    else if (kind === 'waves') { c.fillRect(0, 190, W, 80); c.fillStyle = 'rgba(255,255,255,.4)'; for (let i = 0; i < 20; i++) c.fillRect(r() * W, 192 + r() * 70, 18 + r() * 24, 2); }
    else if (kind === 'cranes') for (let i = 0; i < 3; i++) { const x = (i + r() * 0.5) * 160; wrap(x, 100, x0 => { c.lineWidth = 5; c.beginPath(); c.moveTo(x0, 200); c.lineTo(x0, 90); c.lineTo(x0 + 70, 100); c.moveTo(x0 + 60, 99); c.lineTo(x0 + 60, 150); c.stroke(); c.fillRect(x0 - 8, 195, 18, 10); }); }
    else if (kind === 'buoys') for (let i = 0; i < 4; i++) { const x = r() * W; wrap(x, 14, x0 => { P(c, [[x0 - 7, 240], [x0 + 7, 240], [x0 + 4, 222], [x0 - 4, 222]], col); c.fillRect(x0 - 1, 206, 2, 16); }); }
    else if (kind === 'heaps') { c.beginPath(); c.moveTo(0, H); let x = 0; const y0 = 250; for (; x <= W; x += 24) { const v = x === 0 || x >= W ? 0.5 : r(); c.lineTo(x, y0 - v * 70 - (r() < 0.2 ? 18 : 0)); } c.lineTo(W, H); c.closePath(); c.fill(); }
    else if (kind === 'sparks') for (let i = 0; i < 28; i++) { c.fillRect(r() * W, r() * H, 1.6, 1.6 + r() * 3); }
    else if (kind === 'pipes') for (let i = 0; i < 6; i++) { const x = r() * W, w = 14 + r() * 18; wrap(x, w, x0 => { c.fillRect(x0, 0, w, 40 + r() * 100); c.fillRect(x0 - 3, 130 + r() * 20, w + 6, 8); }); c.fillRect(0, 220 + r() * 10, W, 6); }
    else if (kind === 'gears') for (let i = 0; i < 4; i++) { const x = r() * W, y = 40 + r() * 190, rr = 18 + r() * 18; wrap(x, rr * 2, x0 => { c.beginPath(); c.arc(x0, y, rr, 0, TAU); c.fill(); for (let j = 0; j < 9; j++) { const a = j * TAU / 9; c.fillRect(x0 + Math.cos(a) * rr - 3, y + Math.sin(a) * rr - 3, 6, 6); } c.globalCompositeOperation = 'destination-out'; c.beginPath(); c.arc(x0, y, rr * 0.4, 0, TAU); c.fill(); c.globalCompositeOperation = 'source-over'; }); }
    else if (kind === 'ice') { c.beginPath(); c.moveTo(0, H); let x = 0; for (; x <= W; x += 30) { const v = x === 0 || x >= W ? 0.4 : r(); c.lineTo(x, 240 - v * 90); c.lineTo(x + 15, 250 - v * 40); } c.lineTo(W, H); c.closePath(); c.fill(); }
    else if (kind === 'snow') for (let i = 0; i < 60; i++) { c.beginPath(); c.arc(r() * W, r() * H, 0.8 + r() * 1.6, 0, TAU); c.fill(); }
    else if (kind === 'stars') for (let i = 0; i < 70; i++) { c.fillRect(r() * W, r() * H, 1.4, 1.4); }
    else if (kind === 'wheel') { const x = 140 + r() * 40, y = 130, rr = 78; c.lineWidth = 3; c.beginPath(); c.arc(x, y, rr, 0, TAU); c.stroke(); for (let j = 0; j < 12; j++) { const a = j * TAU / 12; c.beginPath(); c.moveTo(x, y); c.lineTo(x + Math.cos(a) * rr, y + Math.sin(a) * rr); c.stroke(); c.beginPath(); c.arc(x + Math.cos(a) * rr, y + Math.sin(a) * rr, 5, 0, TAU); c.fill(); } c.beginPath(); c.moveTo(x, y); c.lineTo(x - 40, 270); c.moveTo(x, y); c.lineTo(x + 40, 270); c.stroke(); for (let i = 0; i < 3; i++) { const tx = 300 + i * 60; P(c, [[tx, 270], [tx + 26, 200], [tx + 52, 270]], col); } }
    else if (kind === 'bulbs') { c.lineWidth = 1; c.strokeStyle = 'rgba(255,255,255,.35)'; for (let k = 0; k < 2; k++) { const y = 30 + k * 190; c.beginPath(); c.moveTo(0, y); for (let x = 0; x <= W; x += 40) c.quadraticCurveTo(x + 20, y + 14, x + 40, y); c.stroke(); for (let x = 0; x < W; x += 40) { c.beginPath(); c.arc(x + 20, y + 10, 3, 0, TAU); c.fill(); } } }
    else if (kind === 'spires') for (let i = 0; i < 5; i++) { const x = (i + r() * 0.5) * 100, h = 70 + r() * 90; wrap(x, 40, x0 => { c.fillRect(x0, H - h, 34, h); P(c, [[x0 - 4, H - h], [x0 + 17, H - h - 36], [x0 + 38, H - h]], col); }); }
  }
  function buildBackgrounds() {
    bgc = {};
    Object.keys(THEMES).forEach((id, ti) => {
      const th = THEMES[id], sky = mkCanvas(W, H), layers = [];
      const g = sky[1].createLinearGradient(0, 0, 0, H); g.addColorStop(0, th.sky[0]); g.addColorStop(1, th.sky[1]); sky[1].fillStyle = g; sky[1].fillRect(0, 0, W, H);
      th.layers.forEach((l, i) => { const [cv, c] = mkCanvas(W, H); layerDraw(l[0], c, l[1], ti * 7 + i + 1); layers.push({ cv, sp: l[2] }); });
      bgc[id] = { sky: sky[0], layers };
    });
  }

  // ---------------------------------------------------------------- particles (view only)
  const PN = 280; const parts = []; for (let i = 0; i < PN; i++) parts.push({ a: 0, x: 0, y: 0, vx: 0, vy: 0, l: 0, m: 1, s: 2, c: '#fff', k: 0 });
  let pc = 0, lowQ = false;
  function emit(x, y, vx, vy, l, s, c, k) { for (let n = 0; n < PN; n++) { const p = parts[(pc + n) % PN]; if (p.a) continue; pc = (pc + n + 1) % PN; p.a = 1; p.x = x; p.y = y; p.vx = vx; p.vy = vy; p.l = l; p.m = l; p.s = s; p.c = c; p.k = k || 0; return; } }
  const BOOM = ['#fff4b0', '#ffb347', '#ff6a3a', '#e8e8e8'];
  function onEvent(e, view) {
    const f = lowQ ? 0.5 : 1;
    switch (e.t) {
      case 'boom': { const n = Math.min(26, Math.round((6 + e.s * 0.9) * f)); for (let i = 0; i < n; i++) { const a = Math.random() * TAU, sp = 0.6 + Math.random() * (1.4 + e.s * 0.06); emit(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 18 + Math.random() * 18, 1.5 + Math.random() * 2.2, BOOM[i & 3]); } emit(e.x, e.y, 0, 0, 14, e.s * 1.8, '#fff', 1); if (e.s >= 14) view.shake = Math.max(view.shake, 3); break; }
      case 'spark': emit(e.x, e.y, (Math.random() - 0.5) * 1.2, (Math.random() - 0.5) * 1.2, 14, 1.8, '#ffe680'); break;
      case 'die': for (let i = 0; i < 40 * f; i++) { const a = Math.random() * TAU, sp = 0.8 + Math.random() * 3; emit(e.x, e.y, Math.cos(a) * sp, Math.sin(a) * sp, 30 + Math.random() * 20, 2 + Math.random() * 2, i & 1 ? '#fff' : '#9fc0ee'); } view.shake = 8; view.flash = 1; break;
      case 'hit': view.shake = 5; break;
      case 'shield': emit(e.x, e.y, 0, 0, 22, 34, '#8fffb0', 1); break;
      case 'phase': emit(e.x, e.y, 0, 0, 40, 90, '#fff', 1); view.shake = 6; break;
      case 'bossdie': for (let i = 0; i < 6; i++) emit(e.x + (Math.random() - 0.5) * 50, e.y + (Math.random() - 0.5) * 50, 0, 0, 20 + i * 8, 20 + Math.random() * 30, '#ffd36b', 1); view.shake = 14; break;
      case 'pick': emit(e.x, e.y, 0, 0, 16, 22, '#fff', 1); break;
      case 'bomb': view.flash = 0.6; break;
    }
  }

  // ---------------------------------------------------------------- the frame
  function init(k) { K = k || 2; spr = {}; buildPlayerSprites(); buildBulletSprites(); buildEnemySprites(); buildBackgrounds(); }
  function img(c, s, x, y) { c.drawImage(s.cv, x - s.w / 2, y - s.h / 2, s.w, s.h); }
  function bgFor(S) { return STAGEBG[S.stage] || 'toysky'; }
  const STAGEBG = Dt.STAGES.map(s => s.bg);

  function draw(c, S, view, T) {
    const t = view.t;
    c.setTransform(K, 0, 0, K, 0, 0);
    const sx = view.shake > 0 ? (Math.random() - 0.5) * view.shake : 0, sy = view.shake > 0 ? (Math.random() - 0.5) * view.shake : 0;
    c.save(); c.translate(sx, sy);
    // background
    const bg = bgc[view.bg || bgFor(S)];
    c.drawImage(bg.sky, 0, 0, W, H);
    for (let i = 0; i < bg.layers.length; i++) {
      if (lowQ && i === 1) continue;
      const l = bg.layers[i], off = (t * l.sp) % W;
      c.drawImage(l.cv, -off, 0, W, H); c.drawImage(l.cv, W - off, 0, W, H);
    }
    // items
    for (const it of S.itm) if (it.a) img(c, spr.item[it.k], it.x, it.y);
    // lasers
    for (const l of S.las) if (l.a) {
      const tele = l.t < l.tele; c.save(); c.translate(l.x, l.y);
      c.rotate(Math.atan2(l.dy, l.dx));
      if (tele) { c.globalAlpha = 0.35 + 0.35 * Math.sin(l.t * 0.6); c.fillStyle = '#ff4060'; c.fillRect(0, -1, 600, 2); }
      else { const w = l.w; c.fillStyle = 'rgba(255,60,90,.35)'; c.fillRect(0, -w, 600, w * 2); c.fillStyle = '#fff'; c.fillRect(0, -w * 0.35, 600, w * 0.7); c.fillStyle = '#ff4060'; c.fillRect(0, -w * 0.5, 600, w * 0.15); c.fillRect(0, w * 0.35, 600, w * 0.15); }
      c.restore();
    }
    // enemies
    for (const e of S.ene) if (e.a) {
      if (e.boss) { img(c, spr.boss[e.bi][e.fl > 0 ? 1 : 0], e.x, e.y); if (e.inv) { c.globalAlpha = 0.4 + 0.3 * Math.sin(t * 0.5); c.strokeStyle = '#fff'; c.lineWidth = 2; c.beginPath(); c.arc(e.x, e.y, e.r + 8, 0, TAU); c.stroke(); c.globalAlpha = 1; } }
      else if (e.d.mv.k === 'fall' && e.inv) { c.globalAlpha = 0.5 + 0.4 * Math.sin(t * 0.5); c.fillStyle = '#ff4060'; c.fillRect(e.x - 2, 0, 4, 22); c.globalAlpha = 1; }
      else img(c, spr.en[e.type][e.fl > 0 ? 1 : 0], e.x, e.y);
    }
    // player shots
    for (const s of S.sht) if (s.a) {
      if (s.k === 4) img(c, spr.charge[s.r > 15 ? 1 : 0], s.x, s.y);
      else if (s.k === 2) { c.save(); c.translate(s.x, s.y); c.rotate(Math.atan2(s.vy, s.vx)); c.drawImage(spr.shots[2].cv, -7, -5, 14, 10); c.restore(); }
      else img(c, spr.shots[s.k], s.x, s.y);
    }
    // player
    const p = S.p;
    if (S.phase !== 'over') {
      const blink = p.inv > 0 && p.dying === 0 && ((t >> 2) & 1) && S.phase !== 'clear';
      if (!blink) {
        for (let i = 0; i < S.opt; i++) { E.optPos(S, i, OPP); img(c, spr.opt[S.ship === 2 ? 2 : S.ship === 1 ? 1 : 0], OPP[0], OPP[1]); }
        c.save(); c.translate(p.x, p.y); c.rotate(((S.in & 4) ? -0.12 : (S.in & 8) ? 0.12 : 0)); c.drawImage(spr.ship[S.ship].cv, -20, -16, 40, 32); c.restore();
        if (S.shield > 0) { c.strokeStyle = 'rgba(120,255,170,.9)'; c.lineWidth = 2; c.beginPath(); c.arc(p.x, p.y, 18, 0, TAU); c.stroke(); if (S.shield > 1) { c.beginPath(); c.arc(p.x, p.y, 22, 0, TAU); c.stroke(); } }
        if (S.ship === 1 && p.charge > 6) { c.fillStyle = p.charge >= 60 ? '#ffe680' : 'rgba(255,255,255,.7)'; c.globalAlpha = 0.8; c.beginPath(); c.arc(p.x + 14, p.y, 2 + p.charge / 10, 0, TAU); c.fill(); c.globalAlpha = 1; }
      }
      if ((S.in & 64) || view.showCore) img(c, spr.core, p.x, p.y);
    }
    // bomb fx
    const b = S.bomb;
    if (b.t) {
      c.save(); c.globalAlpha = Math.max(0, 0.55 - b.t * 0.005);
      if (S.ship === 0) { c.strokeStyle = '#fff'; c.lineWidth = 8; c.beginPath(); c.arc(b.x, b.y, b.t * 7, 0, TAU); c.stroke(); c.strokeStyle = '#bcd9ff'; c.lineWidth = 3; c.beginPath(); c.arc(b.x, b.y, b.t * 7 - 10, 0, TAU); c.stroke(); }
      else if (S.ship === 1) { const hh = Math.min(80, 20 + b.t * 2); c.fillStyle = 'rgba(40,30,70,.7)'; c.fillRect(p.x, p.y - hh, W, hh * 2); }
      else { const g = c.createRadialGradient(p.x, p.y, 10, p.x, p.y, 72); g.addColorStop(0, 'rgba(255,250,200,.1)'); g.addColorStop(1, 'rgba(255,230,120,.6)'); c.fillStyle = g; c.beginPath(); c.arc(p.x, p.y, 72, 0, TAU); c.fill(); }
      c.restore();
    }
    // enemy bullets (on top so they stay readable)
    for (const bu of S.bul) if (bu.a) {
      if (bu.k < 2) img(c, spr.b[bu.k][bu.c], bu.x, bu.y);
      else { const ai = (Math.round(Math.atan2(bu.vy, bu.vx) / TAU * 16) + 16) & 15; img(c, spr.b[bu.k][bu.c][ai], bu.x, bu.y); }
    }
    // particles
    for (let i = 0; i < PN; i++) {
      const q = parts[i]; if (!q.a) continue;
      q.l--; if (q.l <= 0) { q.a = 0; continue; }
      q.x += q.vx; q.y += q.vy; q.vx *= 0.97; q.vy *= 0.97;
      const f = q.l / q.m; c.globalAlpha = f;
      if (q.k === 1) { c.strokeStyle = q.c; c.lineWidth = 2; c.beginPath(); c.arc(q.x, q.y, q.s * (1.3 - f), 0, TAU); c.stroke(); }
      else { c.fillStyle = q.c; c.fillRect(q.x - q.s / 2, q.y - q.s / 2, q.s * f + 0.6, q.s * f + 0.6); }
    }
    c.globalAlpha = 1;
    c.restore();
    if (view.flash > 0) { c.fillStyle = 'rgba(255,255,255,' + Math.min(0.7, view.flash * 0.7) + ')'; c.fillRect(0, 0, W, H); view.flash -= 0.05; }
    if (view.shake > 0) view.shake = Math.max(0, view.shake - 0.8);
    if (view.hud !== false) hud(c, S, view, T || (s => s));
  }
  const OPP = [0, 0];

  function hud(c, S, view, T) {
    c.textBaseline = 'top'; c.font = '800 11px sans-serif'; c.fillStyle = '#fff'; c.strokeStyle = 'rgba(0,0,0,.65)'; c.lineWidth = 3; c.lineJoin = 'round';
    const txt = (s, x, y, al) => { c.textAlign = al || 'left'; c.strokeText(s, x, y); c.fillText(s, x, y); };
    txt(String(S.score).replace(/\B(?=(\d{3})+(?!\d))/g, ','), 8, 5);
    // lives, bombs
    for (let i = 0; i < Math.min(S.lives, 8); i++) { c.drawImage(spr.ship[S.ship].cv, 8 + i * 15 - 6, 16, 20, 16); }
    for (let i = 0; i < Math.min(S.bombs, 8); i++) { C(c, 12 + i * 10, 40, 3.6, '#c07cff', '#fff', 1); }
    // power bars
    const bars = [[S.power, 4, '#ff5a6e'], [S.spd, 3, '#59a8ff'], [S.opt, 3, '#ffd23f']];
    for (let r = 0; r < 3; r++) for (let i = 0; i < bars[r][1]; i++) { c.fillStyle = i < bars[r][0] ? bars[r][2] : 'rgba(255,255,255,.25)'; c.fillRect(8 + i * 8, 49 + r * 5, 6, 3); }
    // chain
    if (S.chain >= 2) { const mp = (100 + Math.min(S.chain, 100) * 4) / 100; txt('x' + mp.toFixed(1) + '  ' + S.chain + ' ' + T('連鎖'), W - 8, 5, 'right'); c.fillStyle = '#ffd23f'; c.fillRect(W - 8 - 60, 18, 60 * S.chainT / 150, 3); c.fillStyle = '#fff'; }
    if (S.mode === 'daily' || S.mode === 'rush') txt((S.li + 1) + '/' + S.list.length, W - 8, 24, 'right');
    // boss hp
    const e = S.boss;
    if (e) { const d = Dt.BOSS[e.bi], w = 240, x = (W - w) / 2; c.fillStyle = 'rgba(0,0,0,.5)'; c.fillRect(x, 6, w, 7); c.fillStyle = e.inv ? '#ccc' : '#ff5a6e'; c.fillRect(x, 6, w * Math.max(0, e.hp) / e.maxhp, 7); c.strokeStyle = '#fff'; c.lineWidth = 1; c.strokeRect(x, 6, w, 7); for (let i = 0; i < d.ph.length; i++) { c.fillStyle = i <= e.bp ? '#ffd23f' : 'rgba(255,255,255,.3)'; c.fillRect(x + i * 8, 16, 6, 3); } }
    if (S.phase === 'play' && S.sf < 140 && S.mode !== 'rush') { const st = Dt.STAGES[S.stage]; c.globalAlpha = Math.min(1, (140 - S.sf) / 40); c.font = '800 18px sans-serif'; txt('STAGE ' + (S.stage + 1), W / 2, 100, 'center'); c.font = '800 13px sans-serif'; txt(view.en ? st.en : st.ja, W / 2, 124, 'center'); c.globalAlpha = 1; c.font = '800 11px sans-serif'; }
    if (e && e.ti > 50) { const ph = Dt.BOSS[e.bi].ph[e.bp]; c.font = '800 13px sans-serif'; txt(view.en ? ph.en : ph.ja, W / 2, 40, 'center'); c.font = '800 11px sans-serif'; }
  }

  function setLow(v) { lowQ = !!v; }
  function reset() { for (const q of parts) q.a = 0; }
  const api = { init, draw, onEvent, setLow, reset, THEMES, get K() { return K; }, sprites: () => spr, W, H, drawHud: hud };
  root.ShmupArt = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
