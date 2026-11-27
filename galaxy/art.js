// ぐるぐる星わたり：ものの形（ピップ・スターシャード・はっしゃスター・大砲…ぜんぶオリジナル）と、場面のならべかた、光る粒。window.GalaxyArt
(function (root) {
  'use strict';
  const GL = root.GalaxyGL || (typeof require !== 'undefined' ? require('./gl.js') : null), E = root.GalaxyEngine || (typeof require !== 'undefined' ? require('./engine.js') : null);
  const V = E.vec, hex = GL.hex, TAU = Math.PI * 2;
  const C = { cream: hex('#fff1c9'), cream2: hex('#ffe3a0'), eye: hex('#1d1a33'), pink: hex('#ff9ab5'), orange: hex('#ff8c3a'), scarf: hex('#ff5f7a'), gold: hex('#ffd24a'), gold2: hex('#fff0a0'), white: [1, 1, 1], wood: hex('#c98a4b'), wood2: hex('#8f5a2c'),
    purple: hex('#9b6bd6'), purple2: hex('#6f45a8'), cyan: hex('#6fe3ff'), pinkS: hex('#ff7fd1'), red: hex('#ff4d5e'), dark: hex('#2a2540'), metal: hex('#8fa0c0'), metal2: hex('#5b6a8c'), lava: hex('#ff7a2a'), magma: hex('#ffb347'), bee: hex('#ffd93a'), green: hex('#6fdc7a') };

  function build(r) {
    const m = r.mesh;
    m('hero', b => { // ピップ：まるい身体、大きな目、アンテナ、スカーフ、足（中心が原点、前は +z）
      b.ell(0, -0.02, 0, 0.44, 0.46, 0.41, C.cream, 8, 14); b.ell(0, -0.12, 0.1, 0.3, 0.32, 0.3, C.cream2, 5, 10);
      b.ell(-0.27, 0.0, 0.31, 0.07, 0.045, 0.04, C.pink, 3, 6); b.ell(0.27, 0.0, 0.31, 0.07, 0.045, 0.04, C.pink, 3, 6);
      b.ell(0, -0.2, 0, 0.45, 0.08, 0.42, C.scarf, 4, 12); b.ell(0.1, -0.24, -0.4, 0.07, 0.07, 0.2, C.scarf, 3, 6);
      b.ell(-0.17, -0.45, 0.06, 0.15, 0.08, 0.2, C.orange, 3, 8); b.ell(0.17, -0.45, 0.06, 0.15, 0.08, 0.2, C.orange, 3, 8); b.ell(-0.46, -0.1, 0.02, 0.1, 0.12, 0.1, C.cream2, 3, 6); b.ell(0.46, -0.1, 0.02, 0.1, 0.12, 0.1, C.cream2, 3, 6);
      b.cone(-0.12, 0.38, -0.02, 0.025, 0.28, C.dark, 5, 0.015); b.cone(0.12, 0.38, -0.02, 0.025, 0.28, C.dark, 5, 0.015); b.ell(-0.13, 0.7, -0.02, 0.07, 0.07, 0.07, C.gold2, 3, 6); b.ell(0.13, 0.7, -0.02, 0.07, 0.07, 0.07, C.gold2, 3, 6);
    });
    // かおのパターン：ひらいた目・まばたき・にっこり（^ ^）・ばってん・びっくり（口あき）
    const eyeO = (b, hh, mouth) => { b.ell(-0.16, 0.12, 0.34, 0.1, hh, 0.07, C.eye, 4, 8); b.ell(0.16, 0.12, 0.34, 0.1, hh, 0.07, C.eye, 4, 8); if (hh > 0.06) { b.ell(-0.13, 0.17, 0.4, 0.035, 0.04, 0.03, C.white, 3, 5); b.ell(0.19, 0.17, 0.4, 0.035, 0.04, 0.03, C.white, 3, 5); } mouth(b); };
    const qd = (b, p, q, r, t, col) => { b.quad(p, q, r, t, col); b.quad(p, t, r, q, col); };
    m('eyes_o', b => eyeO(b, 0.12, t => t.ell(0, 0.0, 0.4, 0.05, 0.025, 0.03, C.eye, 3, 6)));
    m('eyes_b', b => eyeO(b, 0.02, t => t.ell(0, 0.0, 0.4, 0.05, 0.025, 0.03, C.eye, 3, 6)));
    m('eyes_j', b => eyeO(b, 0.13, t => t.ell(0, -0.02, 0.4, 0.07, 0.07, 0.03, [0.5, 0.1, 0.15], 3, 6)));
    m('eyes_h', b => { for (const s of [-1, 1]) { qd(b,[s * 0.16 - 0.1, 0.1, 0.4], [s * 0.16, 0.2, 0.4], [s * 0.16, 0.16, 0.4], [s * 0.16 - 0.1, 0.06, 0.4], C.eye); qd(b,[s * 0.16, 0.2, 0.4], [s * 0.16 + 0.1, 0.1, 0.4], [s * 0.16 + 0.1, 0.06, 0.4], [s * 0.16, 0.16, 0.4], C.eye); } b.ell(0, 0.0, 0.4, 0.07, 0.04, 0.03, [0.5, 0.1, 0.15], 3, 6); });
    m('eyes_x', b => { for (const s of [-1, 1]) { qd(b,[s * 0.16 - 0.08, 0.2, 0.4], [s * 0.16 - 0.05, 0.2, 0.4], [s * 0.16 + 0.08, 0.04, 0.4], [s * 0.16 + 0.05, 0.04, 0.4], C.eye); qd(b,[s * 0.16 + 0.05, 0.2, 0.4], [s * 0.16 + 0.08, 0.2, 0.4], [s * 0.16 - 0.05, 0.04, 0.4], [s * 0.16 - 0.08, 0.04, 0.4], C.eye); } b.ell(0, -0.01, 0.4, 0.04, 0.04, 0.03, C.eye, 3, 6); });
    m('skate', b => { b.box(0, 0.1, 0, 0.5, 0.3, 0.9, hex('#4fb0ff')); b.box(0, -0.12, 0, 0.12, 0.1, 1.1, C.white); b.cone(0, 0.2, 0.4, 0.2, 0.3, hex('#ffffff'), 5, 0.05); });
    m('fire', b => { for (let i = 0; i < 4; i++) { const a = i * 1.57; b.cone(Math.cos(a) * 0.18, 0, Math.sin(a) * 0.18, 0.2, 0.8 + (i % 2) * 0.3, [2.0, 0.7 + i * 0.1, 0.15], 6, 0); } b.cone(0, 0, 0, 0.26, 1.2, [2.2, 1.4, 0.4], 6, 0); });
    m('shadow', b => { b.ell(0, 0, 0, 1, 0.02, 1, [0.04, 0.04, 0.1], 2, 14); });
    m('shard', b => { b.star(0, 0, 0, 0.95, 0.45, 0.2, C.gold, C.gold2); b.ell(0, 0, 0, 0.3, 0.3, 0.3, C.white, 3, 6); });
    m('coin', b => { b.ell(0, 0, 0, 0.36, 0.36, 0.07, C.gold, 5, 12); b.ell(0, 0, 0.05, 0.22, 0.22, 0.04, C.gold2, 4, 10); });
    m('crystal', b => { const t = [0, 0.7, 0], bt = [0, -0.7, 0], ps = [[0.38, 0, 0], [0, 0, 0.38], [-0.38, 0, 0], [0, 0, -0.38]]; for (let i = 0; i < 4; i++) { const a = ps[i], c = ps[(i + 1) % 4]; b.tri(t, c, a, i % 2 ? C.cyan : hex('#a8f0ff')); b.tri(bt, a, c, i % 2 ? hex('#4cc4ee') : C.cyan); } });
    m('orb', b => { b.ell(0, 0, 0, 0.5, 0.5, 0.5, hex('#9fe8ff'), 6, 12); b.ring(0, 0, 0, 0.8, 0.07, C.white, 20, 5); });
    m('lumi', b => { b.star(0, 0, 0, 0.5, 0.24, 0.14, C.cyan, C.white); b.ell(0, 0, 0.1, 0.1, 0.1, 0.05, C.eye, 3, 6); });
    m('heart', b => { b.ell(-0.2, 0.15, 0, 0.26, 0.26, 0.2, C.red, 5, 10); b.ell(0.2, 0.15, 0, 0.26, 0.26, 0.2, C.red, 5, 10); b.cone(0, -0.55, 0, 0.4, 0.75, C.red, 8, 0.02); });
    m('launch', b => { b.star(0, 0, 0, 1.25, 0.6, 0.28, C.pinkS, hex('#ffd0f0')); b.ring(0, 0, 0, 1.55, 0.09, C.cyan, 24, 5); b.ell(0, 0, 0.1, 0.34, 0.34, 0.16, C.white, 4, 8); });
    m('cannon', b => { b.cone(0, 0, 0, 0.9, 0.5, C.metal2, 10, 0.8); b.cone(0, 0.45, 0, 0.62, 1.3, C.metal, 10, 0.5); b.cone(0, 1.7, 0, 0.5, 0.18, C.red, 10, 0.5); });
    m('pipe', b => { b.cone(0, 0, 0, 0.75, 1.2, C.green, 12, 0.7); b.cone(0, 1.1, 0, 0.92, 0.35, hex('#4cc46a'), 12, 0.92); b.cone(0, 1.4, 0, 0.62, 0.06, C.dark, 12, 0.6); });
    m('pad', b => { b.ell(0, 0, 0, 0.9, 0.12, 0.9, C.orange, 3, 14); b.ell(0, 0.1, 0, 0.55, 0.1, 0.55, C.gold2, 3, 12); b.cone(0, 0.2, 0, 0.3, 0.4, C.white, 4, 0.0); });
    m('crate', b => { b.box(0, 0, 0, 1.3, 1.3, 1.3, C.wood); for (const s of [-1, 1]) { b.box(s * 0.62, 0, 0, 0.12, 1.34, 1.34, C.wood2); b.box(0, s * 0.62, 0, 1.34, 0.12, 1.34, C.wood2); b.box(0, 0, s * 0.62, 1.34, 1.34, 0.12, C.wood2); } b.star(0, 0, 0.7, 0.32, 0.15, 0.03, C.gold, C.gold2); });
    m('icer', b => { b.ell(0, 0, 0, 0.5, 0.62, 0.5, [0.55, 0.82, 1], 6, 12); b.ell(0, -0.12, 0.12, 0.34, 0.4, 0.34, [0.9, 0.97, 1], 4, 8); for (const sx of [-1, 1]) { b.ell(sx * 0.3, 0.45, -0.1, 0.1, 0.42, 0.1, [0.8, 0.95, 1], 3, 6); b.ell(sx * 0.15, 0.12, 0.44, 0.11, 0.13, 0.08, C.white, 4, 8); b.ell(sx * 0.15, 0.1, 0.5, 0.05, 0.07, 0.04, C.eye, 3, 6); } b.ell(0, 0.0, 0.5, 0.1, 0.06, 0.1, [1, 0.6, 0.2], 3, 6); });
    m('gum', b => { b.ell(0, 0, 0, 0.58, 0.46, 0.58, [1, 0.45, 0.7], 6, 12); b.ell(0, 0.28, 0, 0.5, 0.12, 0.5, [1, 0.8, 0.9], 4, 10); for (const sx of [-1, 1]) { b.ell(sx * 0.2, 0.08, 0.5, 0.13, 0.16, 0.08, C.white, 4, 8); b.ell(sx * 0.2, 0.06, 0.56, 0.06, 0.08, 0.04, C.eye, 3, 6); } for (let i = 0; i < 5; i++) { const a2 = i / 5 * 6.283; b.ell(Math.cos(a2) * 0.4, -0.05, Math.sin(a2) * 0.4 - 0.05, 0.05, 0.05, 0.05, [1, 1, 1], 2, 5); } });
    m('walker', b => { b.ell(0, 0, 0, 0.62, 0.5, 0.58, C.purple, 6, 12); b.ell(0, -0.1, 0.1, 0.45, 0.35, 0.4, hex('#b48cf0'), 4, 8); b.ell(-0.2, 0.12, 0.45, 0.14, 0.18, 0.1, C.white, 4, 8); b.ell(0.2, 0.12, 0.45, 0.14, 0.18, 0.1, C.white, 4, 8); b.ell(-0.2, 0.1, 0.54, 0.06, 0.09, 0.04, C.eye, 3, 6); b.ell(0.2, 0.1, 0.54, 0.06, 0.09, 0.04, C.eye, 3, 6);
      b.cone(-0.35, 0.4, 0, 0.1, 0.35, C.purple2, 5, 0); b.cone(0.35, 0.4, 0, 0.1, 0.35, C.purple2, 5, 0); b.ell(-0.25, -0.46, 0.1, 0.14, 0.08, 0.2, C.purple2, 3, 6); b.ell(0.25, -0.46, 0.1, 0.14, 0.08, 0.2, C.purple2, 3, 6); });
    m('spike', b => { for (let i = 0; i < 6; i++) { const a = i / 6 * TAU; b.cone(Math.cos(a) * 0.35, -0.4, Math.sin(a) * 0.35, 0.16, 0.9 + (i % 2) * 0.3, hex('#cfeaff'), 5, 0); } b.cone(0, -0.4, 0, 0.22, 1.3, hex('#e8f6ff'), 5, 0); });
    m('cp', b => { b.box(0, 0.8, 0, 0.1, 1.6, 0.1, C.metal); b.tri([0.05, 1.55, 0], [0.05, 0.95, 0], [0.85, 1.25, 0], C.red); b.tri([0.05, 1.55, 0], [0.85, 1.25, 0], [0.05, 0.95, 0], C.red); b.ell(0, 1.65, 0, 0.12, 0.12, 0.12, C.gold, 3, 6); });
    m('gate', b => { b.ring(0, 1.5, 0, 1.4, 0.2, C.cyan, 26, 6); b.ring(0, 1.5, 0, 1.0, 0.07, C.white, 22, 4); b.ell(0, 1.5, 0, 1.0, 1.0, 0.04, hex('#6a5cff'), 5, 14); b.box(-1.4, 0.4, 0, 0.3, 0.8, 0.3, C.metal2); b.box(1.4, 0.4, 0, 0.3, 0.8, 0.3, C.metal2); });
    m('kite', b => { const A = [0.35, 0.85, 1.0], P2 = [1.0, 0.55, 0.85]; qd(b, [0, 0.1, 1.1], [0.9, 0.1, 0.1], [0, 0.35, -0.1], [0, 0.35, -0.1], A); qd(b, [0, 0.1, 1.1], [0, 0.35, -0.1], [0, 0.35, -0.1], [-0.9, 0.1, 0.1], P2); qd(b, [0.9, 0.1, 0.1], [0, 0.1, -0.8], [0, 0.35, -0.1], [0, 0.35, -0.1], P2); qd(b, [0, 0.1, -0.8], [-0.9, 0.1, 0.1], [0, 0.35, -0.1], [0, 0.35, -0.1], A); b.box(0, 0.12, 0.1, 0.03, 0.03, 0.9, C.dark); for (let i = 0; i < 4; i++) b.ell(0, 0.1 - i * 0.02, -0.95 - i * 0.28, 0.1, 0.06, 0.1, i % 2 ? A : P2, 3, 6); });
    m('jelly', b => { b.ell(0, 0.1, 0, 0.5, 0.4, 0.5, [1, 0.55, 0.9], 5, 10); b.ell(0, 0.22, 0, 0.3, 0.2, 0.3, [1, 0.8, 0.95], 4, 8); for (let i = 0; i < 5; i++) { const a = i / 5 * 6.283; b.ell(Math.cos(a) * 0.32, -0.28, Math.sin(a) * 0.32, 0.07, 0.22, 0.07, [1, 0.6, 0.85], 3, 6); } });
    m('dash', b => { const O2 = [1, 0.62, 0.25], Y = [1, 0.92, 0.45]; for (const sx of [-1, 1]) { b.ell(sx * 0.42, 0.05, -0.45, 0.07, 0.3, 0.55, O2, 3, 8); b.ell(sx * 0.5, 0.0, -0.95, 0.05, 0.16, 0.4, Y, 3, 6); } b.ell(0, -0.1, -0.6, 0.12, 0.12, 0.7, Y, 3, 6); });
    m('boss', b => { // グツグツおうさま：まるいマグマのからだ、王冠、いかりの目
      b.ell(0, 0, 0, 1.0, 0.9, 0.95, C.lava, 8, 16); b.ell(0, -0.2, 0.15, 0.78, 0.6, 0.7, C.magma, 5, 12);
      b.ell(-0.38, 0.22, 0.82, 0.22, 0.26, 0.12, C.white, 4, 8); b.ell(0.38, 0.22, 0.82, 0.22, 0.26, 0.12, C.white, 4, 8); b.ell(-0.38, 0.2, 0.93, 0.1, 0.14, 0.06, C.eye, 3, 6); b.ell(0.38, 0.2, 0.93, 0.1, 0.14, 0.06, C.eye, 3, 6);
      b.quad([-0.62, 0.55, 0.85], [-0.12, 0.42, 0.9], [-0.12, 0.5, 0.9], [-0.62, 0.68, 0.85], C.dark); b.quad([0.12, 0.42, 0.9], [0.62, 0.55, 0.85], [0.62, 0.68, 0.85], [0.12, 0.5, 0.9], C.dark);
      b.ell(0, -0.3, 0.88, 0.4, 0.14, 0.1, C.dark, 3, 8);
      for (let i = 0; i < 5; i++) { const a = (i - 2) * 0.42; b.cone(Math.sin(a) * 0.7, 0.78 + Math.cos(a) * 0.1, Math.cos(a) * 0.1, 0.16, 0.55 + (i === 2 ? 0.25 : 0), C.gold, 5, 0); }
      b.ell(-0.95, -0.2, 0, 0.3, 0.3, 0.3, C.lava, 4, 8); b.ell(0.95, -0.2, 0, 0.3, 0.3, 0.3, C.lava, 4, 8); b.ell(-0.4, -0.85, 0.1, 0.34, 0.2, 0.4, C.magma, 3, 8); b.ell(0.4, -0.85, 0.1, 0.34, 0.2, 0.4, C.magma, 3, 8);
    });
    m('ghost', b => { b.ell(0, 0.1, 0, 0.55, 0.62, 0.5, [0.85, 0.9, 1.1], 6, 12); b.cone(0, -0.5, 0, 0.5, 0.45, [0.8, 0.86, 1.05], 8, 0.2); b.ell(-0.2, 0.2, 0.42, 0.12, 0.17, 0.08, C.eye, 3, 6); b.ell(0.2, 0.2, 0.42, 0.12, 0.17, 0.08, C.eye, 3, 6); b.ell(0, -0.05, 0.45, 0.1, 0.12, 0.06, C.eye, 3, 6); });
    m('lantern', b => { b.box(0, 0.5, 0, 0.1, 1.0, 0.1, C.dark); b.box(0, 1.15, 0, 0.5, 0.5, 0.5, [0.35, 0.3, 0.45]); b.cone(0, 1.4, 0, 0.42, 0.28, C.dark, 4, 0.05); });
    m('lantern_on', b => { b.box(0, 0.5, 0, 0.1, 1.0, 0.1, C.dark); b.box(0, 1.15, 0, 0.5, 0.5, 0.5, [2.2, 1.7, 0.6]); b.cone(0, 1.4, 0, 0.42, 0.28, C.dark, 4, 0.05); });
    m('shield', b => { b.ell(0, 0, 0, 0.5, 0.5, 0.18, [0.5, 0.85, 1.4], 6, 12); b.ring(0, 0, 0, 0.5, 0.06, C.white, 18, 4); });
    m('switch', b => { b.ell(0, 0, 0, 0.7, 0.14, 0.7, C.metal2, 3, 12); b.ell(0, 0.12, 0, 0.45, 0.1, 0.45, [0.6, 0.9, 1.4], 3, 10); });
    m('drill', b => { const M1 = [0.72, 0.78, 0.9], M2 = [0.45, 0.5, 0.65]; for (let i = 0; i < 5; i++) { const r = 0.5 - i * 0.09; b.ring(0, 0, 0.1 + i * 0.22, r, 0.07, i % 2 ? M1 : M2, 12, 4); } b.ell(0, 0, 1.15, 0.07, 0.07, 0.25, [1, 0.9, 0.5], 3, 6); b.ell(0, 0, 0, 0.5, 0.5, 0.18, M2, 4, 10); });
    m('ring', b => { b.ring(0, 0, 0, 1, 0.06, [1, 1, 1], 28, 4); });
    m('stonering', b => { b.ring(0, 0, 0, 1, 0.035, [1, 0.8, 0.4], 28, 4); });
  }

  // ---------- 光る粒 ----------
  function Fx(rm) {
    this.rm = !!rm; this.p = []; this.a = new Float32Array(640 * 8); this.n = 0; this.glows = []; this.seed = 7; this.shake = 0; this.flash = 0;
  }
  Fx.prototype.rnd = function () { this.seed = (this.seed * 1664525 + 1013904223) >>> 0; return this.seed / 4294967296; };
  Fx.prototype.burst = function (pos, n, col, o) {
    o = o || {}; n = this.rm ? Math.ceil(n * 0.35) : n; const sp = o.sp || 4, life = o.life || 0.7, up = o.up;
    for (let i = 0; i < n && this.p.length < 360; i++) { const a = this.rnd() * TAU, b = this.rnd() * 2 - 1, s = Math.sqrt(1 - b * b), v = [Math.cos(a) * s, b, Math.sin(a) * s]; const k = sp * (0.4 + this.rnd() * 0.8);
      this.p.push({ x: pos.slice(), v: [v[0] * k + (up ? up[0] * sp * 0.5 : 0), v[1] * k + (up ? up[1] * sp * 0.5 : 0), v[2] * k + (up ? up[2] * sp * 0.5 : 0)], t: life * (0.6 + this.rnd() * 0.6), m: life, s: (o.size || 0.4) * (0.6 + this.rnd() * 0.7), c: col, d: o.drag == null ? 2 : o.drag }); }
  };
  Fx.prototype.trail = function (pos, col, size) { if (this.rm || this.p.length > 340) return; this.p.push({ x: pos.slice(), v: [0, 0, 0], t: 0.45, m: 0.45, s: size || 0.3, c: col, d: 4 }); };
  Fx.prototype.ringFx = function (pos, up, col, R, n) { const u = up, a = E.perp(u), b = V.cross(u, a); const nn = this.rm ? 8 : (n || 22); for (let i = 0; i < nn; i++) { const ang = i / nn * TAU, d = V.add(V.mul(a, Math.cos(ang)), V.mul(b, Math.sin(ang))); this.p.push({ x: V.add(pos, V.mul(d, 0.4)), v: V.mul(d, R), t: 0.55, m: 0.55, s: 0.5, c: col, d: 3 }); } };
  Fx.prototype.glow = function (pos, col, size, a) { this.glows.push([pos, col, size, a == null ? 0.5 : a]); };
  Fx.prototype.update = function (dt) {
    const p = this.p; for (let i = p.length - 1; i >= 0; i--) { const q = p[i]; q.t -= dt; if (q.t <= 0) { p[i] = p[p.length - 1]; p.pop(); continue; } const k = Math.exp(-q.d * dt); q.v[0] *= k; q.v[1] *= k; q.v[2] *= k; q.x[0] += q.v[0] * dt; q.x[1] += q.v[1] * dt; q.x[2] += q.v[2] * dt; }
    this.shake = Math.max(0, this.shake - dt * 2.5); this.flash = Math.max(0, this.flash - dt * 2);
  };
  Fx.prototype.fill = function () {
    let n = 0; const a = this.a;
    const put = (x, s, c, al) => { if (n >= 640) return; const o = n * 8; a[o] = x[0]; a[o + 1] = x[1]; a[o + 2] = x[2]; a[o + 3] = s; a[o + 4] = c[0]; a[o + 5] = c[1]; a[o + 6] = c[2]; a[o + 7] = al; n++; };
    for (const g of this.glows) put(g[0], g[2], g[1], g[3]); this.glows.length = 0;
    for (const q of this.p) put(q.x, q.s, q.c, Math.min(1, q.t / q.m * 1.6)); this.n = n; return { a, n };
  };
  Fx.prototype.event = function (ev, S, th) {
    const gold = [1, 0.85, 0.3], cyan = [0.4, 0.9, 1], white = [1, 1, 1], pinkc = [1, 0.5, 0.85], orange = [1, 0.55, 0.2], red = [1, 0.3, 0.3];
    for (const e of ev) {
      const p = [e[1], e[2], e[3]];
      switch (e[0]) {
        case 'coin': this.burst(p, 6, gold, { sp: 3, life: 0.5, size: 0.3 }); break;
        case 'crystal': this.burst(p, 12, cyan, { sp: 4, life: 0.7 }); break;
        case 'shard': this.burst(p, 40, gold, { sp: 8, life: 1.1, size: 0.6 }); this.flash = 0.6; break;
        case 'orb': this.burst(p, 14, cyan, { sp: 5, life: 0.7 }); break;
        case 'lumi': this.burst(p, 20, cyan, { sp: 5, life: 0.9, size: 0.5 }); break;
        case 'jump': this.burst(p, 4, white, { sp: 2, life: 0.4, size: 0.3 }); break;
        case 'land': this.burst(p, 5, [0.9, 0.9, 1], { sp: 2.2, life: 0.4, size: 0.3 }); break;
        case 'spin': this.ringFx(p, S.h.up, white, 5, 14); break;
        case 'pound': this.ringFx(p, S.h.up, orange, 9, 26); this.shake = this.rm ? 0 : 0.5; break;
        case 'kill': this.burst(p, 16, [0.8, 0.5, 1], { sp: 5, life: 0.7, size: 0.5 }); break;
        case 'crate': this.burst(p, 14, [0.9, 0.65, 0.35], { sp: 5, life: 0.7, size: 0.4 }); break;
        case 'hurt': this.burst(p, 12, red, { sp: 5, life: 0.6, size: 0.4 }); this.shake = this.rm ? 0 : 0.3; break;
        case 'launch': this.burst(p, 22, pinkc, { sp: 6, life: 0.8, size: 0.5 }); this.ringFx(p, S.h.up, pinkc, 6, 20); break;
        case 'pad': this.burst(p, 12, orange, { sp: 5, life: 0.6 }); break;
        case 'power': this.burst(p, 24, gold, { sp: 6, life: 0.9, size: 0.5 }); break;
        case 'puff': this.burst(p, 8, white, { sp: 2.5, life: 0.6, size: 0.6 }); break;
        case 'wk': this.burst(p, 8, white, { sp: 3, life: 0.4 }); break;
        case 'cp': this.burst(p, 18, [0.5, 1, 0.6], { sp: 4, life: 0.8 }); break;
        case 'die': case 'void': this.burst(p, 24, red, { sp: 6, life: 0.9, size: 0.5 }); this.flash = 0.4; break;
        case 'boom': this.burst(p, 70, orange, { sp: 9, life: 1.4, size: 0.8 }); this.shake = this.rm ? 0 : 0.9; this.flash = 0.7; break;
        case 'bosshit': this.burst(p, 40, gold, { sp: 7, life: 0.9, size: 0.6 }); this.shake = this.rm ? 0 : 0.5; break;
        case 'bosslang': this.ringFx(p, th && th.bossUp || S.h.up, orange, 12, 32); this.shake = this.rm ? 0 : 0.7; break;
        case 'heart': this.burst(p, 10, red, { sp: 3, life: 0.7 }); break;
        case 'lantern': this.burst(p, 18, [1, 0.8, 0.35], { sp: 4, life: 0.9, size: 0.6 }); break;
        case 'shield': this.burst(p, 18, [0.5, 0.85, 1.2], { sp: 5, life: 0.6 }); break;
        case 'melt': this.burst(p, 16, orange, { sp: 4, life: 0.7, size: 0.5 }); break;
        default: break;
      }
    }
  };

  // ---------- 場面 ----------
  const ROT = (u, ang) => V.rodr(E.perp(u), u, ang);
  function scene(S, t, fx, opt) {
    opt = opt || {}; const L = S.L, h = S.h, objs = [], bn = [];
    const O = (m, pos, fw, up, sc, tint, emis, rim) => objs.push({ m, M: GL.M.basis(pos, fw, up, sc), tint, emis, rim });
    for (const i of S.act) {
      const e = L.ents[i]; if (S.e[i]) continue; if (e.req && !S.flag[e.req]) continue; const p = S.ep[i]; if (!p) continue; const up = E.entUp(S, i), spin = ROT(up, t * 2.2 + i), bob = V.add(p, V.mul(up, Math.sin(t * 2.4 + i) * 0.1));
      switch (e.k) {
        case 'shard': O('shard', V.add(p, V.mul(up, 0.2 + Math.sin(t * 2 + i) * 0.12)), spin, up, 1.0, null, 0.55); fx.glow(p, [1, 0.85, 0.3], 7, 0.5); break;
        case 'coin': O('coin', bob, spin, up, 1, null, 0.4); break;
        case 'crystal': O('crystal', bob, spin, up, 0.9, null, 0.5); fx.glow(p, [0.4, 0.9, 1], 3.2, 0.4); break;
        case 'orb': O('orb', bob, spin, up, 1, null, 0.6); fx.glow(p, [0.5, 0.9, 1], 5, 0.5); break;
        case 'lumi': O('lumi', bob, spin, up, 1, null, 0.7); fx.glow(p, [0.5, 1, 1], 4, 0.35); break;
        case 'heart': O('heart', bob, spin, up, 0.8, null, 0.35); break;
        case 'launch': if (e.mode === 'cannon') O('cannon', V.add(p, V.mul(up, -0.5)), spin, up, 1, null, 0); else if (e.mode === 'pipe') O('pipe', V.add(p, V.mul(up, -0.5)), spin, up, 1, null, 0); else { O('launch', V.add(p, V.mul(up, 0.5)), ROT(up, t * 1.4), up, 1, null, 0.6); fx.glow(V.add(p, V.mul(up, 0.5)), [1, 0.5, 0.85], 9, 0.55); } break;
        case 'pad': O('pad', V.add(p, V.mul(up, -0.2)), spin, up, 1, null, 0.1); break;
        case 'crate': O('crate', p, ROT(up, i), up, 1, e.iron ? [0.5, 0.56, 0.72] : e.drop === 'heart' ? [1, 0.7, 0.75] : e.drop === 'kite' ? [0.6, 0.95, 1.2] : e.drop === 'jelly' ? [1.2, 0.7, 1.1] : e.drop === 'dash' ? [1.3, 0.85, 0.5] : e.drop === 'skate' ? [0.7, 0.85, 1.2] : e.drop === 'fire' ? [1.3, 0.8, 0.6] : e.drop === 'shield' ? [0.7, 1, 1.3] : e.drop === 'drill' ? [0.8, 0.75, 0.7] : null, 0); break;
        case 'walker': { const dv = V.norm(V.cross(up, V.mv(S.xf[e.bi].R, e.ax))); const sq = 1 + Math.sin(t * 6 + i) * 0.06; if (e.look === 'ghost') { O('ghost', V.add(p, V.mul(up, 0.2 + Math.sin(t * 3 + i) * 0.15)), dv, up, 1, null, 0.5); fx.glow(p, [0.6, 0.7, 1], 4, 0.3); } else O(L.theme === 'ice' ? 'icer' : L.theme === 'candy' ? 'gum' : 'walker', p, dv, up, [sq, 2 - sq, sq], null, 0); break; }
        case 'spike': O('spike', V.add(p, V.mul(up, -0.1)), spin, up, 1, null, 0.1); break;
        case 'cp': { const on = S.cp === i; O('cp', V.add(p, V.mul(up, -0.5)), ROT(up, 0.6), up, 1, on ? [0.7, 1, 0.7] : [0.8, 0.8, 0.9], on ? 0.3 : 0); break; }
        case 'switch': { const on = S.lit.indexOf(i) >= 0; O('switch', V.add(p, V.mul(up, -0.45)), spin, up, 1, on ? [0.5, 1, 0.6] : null, on ? 0.9 : 0.3); fx.glow(p, on ? [0.5, 1, 0.6] : [0.6, 0.8, 1], 5, 0.4); break; }
        case 'lantern': { const lit = S.lit.indexOf(i) >= 0; O(lit ? 'lantern_on' : 'lantern', V.add(p, V.mul(up, -0.5)), ROT(up, 0.3), up, 1, null, lit ? 0.8 : 0); if (lit) fx.glow(V.add(p, V.mul(up, 0.7)), [1, 0.8, 0.35], 14, 0.55); else fx.glow(V.add(p, V.mul(up, 0.7)), [0.6, 0.5, 1], 3, 0.25); break; }
        case 'power': O(e.type, bob, spin, up, 1, null, 0.5); fx.glow(p, [1, 0.9, 0.4], 4, 0.4); break;
        case 'npc': { const to = V.sub(h.x, p), fw0 = E.projT(to, up), fw = V.len(fw0) > 1e-3 ? V.norm(fw0) : E.perp(up), pos = V.add(p, V.mul(up, 0.9 + Math.abs(Math.sin(t * 2 + i)) * 0.06)), M = GL.M.basis(pos, fw, up, [1, 1, 1]), tn = [1.35, 0.8, 0.45]; objs.push({ m: 'hero', M, tint: tn, emis: 0.08, rim: [0.5, 0.45, 0.35] }); objs.push({ m: 'eyes_h', M, tint: tn, emis: 0.05 }); fx.glow(V.add(pos, V.mul(up, 1.7)), [1, 0.8, 0.4], 2.4, 0.3); break; }
        case 'gate': { const open = !opt.locked || !opt.locked[e.gal]; O('gate', V.add(p, V.mul(up, -0.3)), ROT(up, 0.5 + i * 2), up, 1 + (open && opt.unlockAnim > 0 ? Math.sin(opt.unlockAnim * 0.3) * 0.25 * Math.min(1, opt.unlockAnim / 30) : 0), open ? null : [0.45, 0.45, 0.55], open ? 0.45 : 0); if (open) fx.glow(V.add(p, V.mul(up, 1.2)), [0.5, 0.6, 1], 9, 0.5); break; }
        default: break;
      }
    }
    // ボス
    if (S.boss && S.boss.st !== 'gone') { const bo = S.boss, bp = E.bossPos(S), e = L.ents[bo.i], R = S.xf[e.bi].R, up = V.norm(V.mv(R, bo.d)); const k = bo.st === 'stun' ? 0.85 + Math.sin(t * 14) * 0.04 : 1; const fl = bo.flash > 0 && Math.floor(t * 20) % 2 === 0;
      const hh = V.norm(V.sub(S.h.x, bp)), fw = V.norm(V.sub(hh, V.mul(up, V.dot(hh, up)))); const look = L.ents[bo.i].look, base = look === 'guard' ? [0.75, 0.85, 1.2] : look === 'king' ? [1.2, 0.95, 1.6] : null; const tg = bo.st === 'stun' ? [0.8, 0.8, 1.1] : fl ? [2, 2, 2] : base;
      const dead = bo.st === 'dead' ? Math.max(0, bo.t / 2.2) : 1; O('boss', bp, V.len(fw) > 0.1 ? fw : E.perp(up), up, [1.7 * k * dead * (1.2 - 0.2 * dead), 1.7 * (2 - k) * dead, 1.7 * k * dead], tg, bo.st === 'stun' ? 0 : 0.25); fx.glow(bp, [1, 0.5, 0.2], 12, 0.55);
      if (bo.st === 'jump' && bo.tg) { const c = S.xf[e.bi].p, rad = L.bodies[e.bi].r, mp = V.add(c, V.mv(R, V.mul(bo.tg, rad + 0.1))), mu = V.norm(V.mv(R, bo.tg)); const pulse = 1 + Math.sin(t * 20) * 0.1; O('ring', mp, E.perp(mu), mu, 2.2 * pulse, [1, 0.3, 0.2], 1); }
      if (bo.st === 'land' && bo.ring > 0) { const c = S.xf[e.bi].p, rad = L.bodies[e.bi].r, bu = V.norm(V.mv(R, bo.d)); const bc = V.add(c, V.mul(bu, rad * Math.cos(bo.ring / rad) + 0.2)), rr = rad * Math.sin(bo.ring / rad); if (rr > 0.1) { const bn2 = bu; O('stonering', bc, E.perp(bn2), bn2, rr, [3, 1.2, 0.3], 1); } }
    }
    if (h.lau && !fx.rm) { const lu = h.v, sp = V.len(lu); if (sp > 3) { const d = V.norm(lu); for (let k = 0; k < 4; k++) { const off = V.add(V.mul(E.perp(d), (fx.rnd() - 0.5) * 3), V.mul(V.cross(d, E.perp(d)), (fx.rnd() - 0.5) * 3)); fx.trail(V.add(V.add(h.x, V.mul(d, -2 - fx.rnd() * 5)), off), [0.7, 0.85, 1], 0.5 + fx.rnd() * 0.5); } } }
    // star-lane ribbon: a glowing band trails from the launch point to the hero during a lane flight
    if (h.lau && !fx.rm && L.ents[h.lau.i].lane && h.lau.t >= h.lau.pre) { const a = h.lau.p0, n = 14; for (let k = 0; k < n; k++) { const f = k / n, pp = V.add(a, V.mul(V.sub(h.x, a), f)); fx.glow(pp, [0.5 + f * 0.4, 0.7, 1], 3.2 + f * 2.5, 0.35 * f); } }
    // ピップ
    if (h.vis !== 0 || !h.lau || h.lau.t >= h.lau.pre) {
      const sq = h.pound === 1 ? [0.8, 1.35, 0.8] : h.pound === 2 ? [1.3, 0.7, 1.3] : (h.on < 0 && !h.lau ? [0.95, 1.08, 0.95] : [1, 1, 1]);
      const blink = h.inv > 0 && Math.floor(t * 18) % 2 === 0 && !h.dead; if (!blink && !(h.lau && h.lau.t < h.lau.pre && L.ents[h.lau.i].mode === 'pipe')) {
        const ang = h.spin > 0 ? (1 - h.spin / E.K.SPIN_T) * TAU * 2 : h.lau ? t * 14 : 0; const fw = ang ? V.rodr(h.fw, h.up, ang) : h.fw;
        const tint = !h.pw && opt.skin ? opt.skin : h.pw ? (h.pw.k === 'kite' ? [0.85, 1.05, 1.3] : h.pw.k === 'jelly' ? [1.2, 0.85, 1.15] : h.pw.k === 'dash' ? [1.25, 0.95, 0.7] : h.pw.k === 'drill' ? [0.75, 0.8, 0.95] : [0.9, 1, 1.25]) : null;
        const tilt = h.on < 0 && !h.lau && h.pound === 0 ? V.add(h.up, V.mul(V.norm(V.sub(h.v, V.mul(h.up, V.dot(h.v, h.up)))), 0.08)) : h.up;
        const sp = V.len(h.v), bob = h.on >= 0 && sp > 2 ? 1 + Math.sin(t * 17) * 0.045 : 1, lean = h.on >= 0 && sp > 2 ? V.add(V.norm(tilt), V.mul(h.fw, Math.min(0.22, sp * 0.03))) : tilt, sq2 = [sq[0] / Math.sqrt(bob), sq[1] * bob, sq[2] / Math.sqrt(bob)];
        const win = S.res && S.res.ok, ex = h.dead || (h.inv > 1.0 && h.inv < 1.7) ? 'eyes_x' : win || h.spin > 0 ? 'eyes_h' : h.pound === 1 || h.hp === 1 && Math.floor(t * 4) % 2 === 0 ? 'eyes_j' : (h.on < 0 && h.v && V.dot(h.v, h.up) > 4) || h.lau ? 'eyes_j' : (Math.sin(t * 2.1) > 0.985 ? 'eyes_b' : 'eyes_o');
        const MM = GL.M.basis(h.x, fw, V.norm(lean), sq2); objs.push({ m: 'hero', M: MM, tint, emis: h.dead ? 0 : 0.08, rim: [0.5, 0.45, 0.35] }); objs.push({ m: ex, M: MM, tint, emis: 0.05 });
        if (h.spin > 0 && !fx.rm) { for (let k = 0; k < 2; k++) { const a = t * 30 + k * 3.14, rr = 0.95, pp = V.add(h.x, V.add(V.mul(E.perp(h.up), Math.cos(a) * rr), V.mul(V.cross(h.up, E.perp(h.up)), Math.sin(a) * rr))); fx.trail(pp, h.pw && h.pw.k === 'fire' ? [1, 0.55, 0.15] : [1, 1, 0.7], 0.55); } }
        else if (sp > 6.5 && h.on >= 0 && !fx.rm && Math.floor(t * 30) % 3 === 0) fx.trail(V.add(h.x, V.mul(h.up, -0.4)), h.pw && h.pw.k === 'skate' ? [0.5, 0.85, 1] : [0.85, 0.85, 1], 0.28);
        if (h.pw && h.pw.k === 'fire') O('fire', V.add(h.x, V.mul(h.up, 0.55)), h.fw, h.up, 0.45, null, 0.8);
        if (h.pw && h.pw.k === 'skate') O('skate', V.add(h.x, V.mul(h.up, -0.5)), fw, h.up, 0.6, null, 0.3);
        if (h.pw && h.pw.k === 'kite') { const wob = Math.sin(t * 3) * 0.08; O('kite', V.add(h.x, V.mul(h.up, 1.0)), h.fw, V.norm(V.add(h.up, V.mul(V.cross(h.up, h.fw), wob))), 0.9, null, 0.3); }
        if (h.pw && h.pw.k === 'drill') O('drill', V.add(V.add(h.x, V.mul(h.fw, 0.8)), V.mul(h.up, 0.1)), h.fw, h.up, 1.0, null, 0.15);
        if (h.pw && h.pw.k === 'jelly') O('jelly', V.add(h.x, V.mul(h.up, -0.45)), h.fw, h.up, 1.05, null, 0.3);
        if (h.pw && h.pw.k === 'shield') O('shield', V.add(h.x, V.mul(h.fw, 0.6)), h.fw, h.up, 1.5, null, 0.6);
        if (h.pw && h.pw.k === 'dash') O('dash', V.add(h.x, V.mul(h.up, 0.1)), h.fw, h.up, 1, null, 0.3 + (h.dsh > 0 ? 0.6 : 0));
      }
      // まるい影
      const g = E.gravAt(S, h.x, h.gb); if (g.i >= 0 && g.up && !h.lau) { const r = E.sdfW(S, g.i, h.x), d = Math.max(0, r[0]), n = [r[1], r[2], r[3]], sp = V.sub(h.x, V.mul(n, d)); if (d < 14) O('shadow', V.add(sp, V.mul(n, 0.04)), E.perp(n), n, Math.max(0.2, 0.5 * (1 - d / 16)), null, 0); }
    }
    return objs;
  }
  const GalaxyArt = { build, Fx, scene, C };
  if (typeof module !== 'undefined' && module.exports) module.exports = GalaxyArt; else root.GalaxyArt = GalaxyArt;
})(typeof window !== 'undefined' ? window : globalThis);
