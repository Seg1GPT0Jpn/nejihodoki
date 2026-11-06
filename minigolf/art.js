// ころがし工房ゴルフ：絵（Canvas 2D）。作業台の上のミニゴルフ：緑のフェルト、木の定規のかべ、おがくず、インク、
// 真ちゅうの歯車、黄色い定規、ばね、銅のパイプ、鉛筆の旗。動かないものはホールごとに1枚の絵にして使い回す。
//   MinigolfArt.init({ MG })                 最初に1回
//   MinigolfArt.setTheme(dark)               作業台の色だけ変わる（フェルトは同じ）
//   MinigolfArt.view(hole, W, H, dpr, rotate) → v   画面の大きさに合わせた変換（rotate：縦長のホールを横にして描く）
//   MinigolfArt.frame(ctx, v, { G, t, aim, fx, ghost })   1枚描く
//   v.toScreen(x, y) / v.toWorld(px, py)     マス ↔ キャンバスの CSS px
(function (root) {
  'use strict';
  var MG = null, dark = true;
  var M = 0.55; // ホールのまわりの作業台の幅（マス）
  var PI2 = Math.PI * 2;
  var C = {
    benchL: ['#d9b98c', '#caa475', '#b88f5e'], benchD: ['#5a4029', '#4b3421', '#3b2918'],
    felt: '#3f9a52', felt2: '#358847', feltEdge: '#2a6e39', wall: '#e8c58c', wallSide: '#a8783e', wallInk: '#6a4a22',
    block: '#d7ad6c', blockTop: '#efcc8e', sand: '#e9d3a2', sandDot: '#c9a96a', ink: '#1c2350', inkHi: '#4a5aa8',
    slopeA: 'rgba(255,255,255,.10)', slopeB: 'rgba(0,0,0,.10)', arrow: 'rgba(255,255,255,.34)',
    brass: '#d8a23a', brassD: '#8a5e14', ruler: '#f2cf3a', rulerD: '#9a7a10', copper: '#c8743a', copperD: '#6e3612', spring: '#b9c4cc', springD: '#56606a',
  };
  function init(o) { MG = o.MG; }
  function setTheme(d) { dark = !!d; cache = null; }
  var cache = null; // { key, canvas }

  // ---------- 変換 ----------
  function view(hole, W, H, dpr, rotate) {
    var bb = MG.prep(hole).bb;
    var x0 = bb.x0 - M, y0 = bb.y0 - M, x1 = bb.x1 + M, y1 = bb.y1 + M;
    var hw = x1 - x0, hh = y1 - y0;
    var rot = !!rotate;
    var sw = rot ? hh : hw, sh = rot ? hw : hh;
    var s = Math.min(W / sw, H / sh);
    var ox = (W - sw * s) / 2, oy = (H - sh * s) / 2;
    // CSS px：rot のとき、ティー（下）が左へ、カップ（上）が右へ来る
    var m = rot ? [0, s, -s, 0, ox + y1 * s, oy - x0 * s] : [s, 0, 0, s, ox - x0 * s, oy - y0 * s];
    return {
      hole: hole, W: W, H: H, dpr: dpr, s: s, rot: rot, m: m, x0: x0, y0: y0, x1: x1, y1: y1, ox: ox, oy: oy, pw: sw * s, ph: sh * s,
      toScreen: function (x, y) { return { x: m[0] * x + m[2] * y + m[4], y: m[1] * x + m[3] * y + m[5] }; },
      toWorld: function (px, py) { return rot ? { x: (py - m[5]) / s, y: -(px - m[4]) / s } : { x: (px - m[4]) / s, y: (py - m[5]) / s }; },
      // 画面の向き（CSS px の差）→ マスの向き
      dirWorld: function (dx, dy) { return rot ? { x: dy / s, y: -dx / s } : { x: dx / s, y: dy / s }; },
    };
  }
  function apply(ctx, v) { var d = v.dpr, m = v.m; ctx.setTransform(m[0] * d, m[1] * d, m[2] * d, m[3] * d, m[4] * d, m[5] * d); }

  // ---------- 小さな道具 ----------
  function path(ctx, P) { ctx.beginPath(); ctx.moveTo(P[0][0], P[0][1]); for (var i = 1; i < P.length; i++) ctx.lineTo(P[i][0], P[i][1]); ctx.closePath(); }
  function hash(i) { var x = Math.sin(i * 127.1 + 311.7) * 43758.5453; return x - Math.floor(x); }
  function circle(ctx, x, y, r) { ctx.beginPath(); ctx.arc(x, y, r, 0, PI2); }

  // ---------- 動かないもの（1枚の絵） ----------
  function staticLayer(v) {
    var key = v.hole.id + '|' + v.W + 'x' + v.H + '|' + v.dpr + '|' + v.rot + '|' + dark;
    if (cache && cache.key === key) return cache.canvas;
    var cv = cache && cache.canvas || document.createElement('canvas');
    cv.width = Math.max(1, Math.round(v.W * v.dpr)); cv.height = Math.max(1, Math.round(v.H * v.dpr));
    var ctx = cv.getContext('2d');
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, cv.width, cv.height);
    apply(ctx, v);
    drawStatic(ctx, v);
    cache = { key: key, canvas: cv };
    return cv;
  }
  function drawStatic(ctx, v) {
    var h = v.hole, s = v.s, i, k;
    var B = dark ? C.benchD : C.benchL;
    // 作業台（木目）
    ctx.fillStyle = B[0]; ctx.fillRect(v.x0 - 50, v.y0 - 50, (v.x1 - v.x0) + 100, (v.y1 - v.y0) + 100);
    ctx.lineWidth = 1.2 / s;
    for (i = 0; i < 70; i++) {
      var gy = v.y0 - 2 + i * 0.36 + hash(i) * 0.2;
      ctx.strokeStyle = i % 3 ? B[1] : B[2]; ctx.globalAlpha = 0.5;
      ctx.beginPath(); ctx.moveTo(v.x0 - 2, gy);
      for (var gx = v.x0 - 2; gx < v.x1 + 2; gx += 0.8) ctx.lineTo(gx, gy + Math.sin(gx * 0.7 + i) * 0.06);
      ctx.stroke();
    }
    ctx.globalAlpha = 1;
    // 影（フェルトの下）
    ctx.save(); ctx.translate(0.08, 0.14); path(ctx, h.poly); ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fill(); ctx.restore();
    // フェルト
    path(ctx, h.poly); ctx.fillStyle = C.felt; ctx.fill();
    ctx.save(); path(ctx, h.poly); ctx.clip();
    for (i = 0; i < 900; i++) { // フェルトのけば
      var fx = h._p.bb.x0 + hash(i * 3.1) * (h._p.bb.x1 - h._p.bb.x0), fy = h._p.bb.y0 + hash(i * 7.7) * (h._p.bb.y1 - h._p.bb.y0);
      ctx.fillStyle = i % 2 ? 'rgba(255,255,255,.05)' : 'rgba(0,0,0,.07)'; ctx.fillRect(fx, fy, 0.06, 0.06);
    }
    // 坂：明るい縞と矢印（下る向き）
    (h.slopes || []).forEach(function (sl, si) {
      var gx = sl.g[0], gy = sl.g[1], gl = Math.sqrt(gx * gx + gy * gy) || 1, ux = gx / gl, uy = gy / gl;
      path(ctx, sl.p); ctx.fillStyle = C.felt2; ctx.fill();
      ctx.save(); path(ctx, sl.p); ctx.clip();
      var bb = MG.bbox(sl.p), cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2, ext = Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0);
      for (var d = -ext; d < ext; d += 0.5) { // 等高線（坂の向きに直角）
        ctx.strokeStyle = C.slopeA; ctx.lineWidth = 0.05;
        ctx.beginPath(); ctx.moveTo(cx + ux * d - uy * ext, cy + uy * d + ux * ext); ctx.lineTo(cx + ux * d + uy * ext, cy + uy * d - ux * ext); ctx.stroke();
      }
      ctx.strokeStyle = C.arrow; ctx.lineWidth = 0.09; ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      for (var ax = bb.x0 + 0.7; ax < bb.x1; ax += 1.4) for (var ay = bb.y0 + 0.65; ay < bb.y1; ay += 1.3) {
        var px = -uy, py = ux;
        ctx.beginPath();
        ctx.moveTo(ax - ux * 0.22 + px * 0.24, ay - uy * 0.22 + py * 0.24); ctx.lineTo(ax + ux * 0.1, ay + uy * 0.1); ctx.lineTo(ax - ux * 0.22 - px * 0.24, ay - uy * 0.22 - py * 0.24);
        ctx.stroke();
      }
      ctx.restore();
    });
    // おがくず
    (h.sand || []).forEach(function (P, si) {
      path(ctx, P); ctx.fillStyle = C.sand; ctx.fill();
      ctx.save(); path(ctx, P); ctx.clip();
      var bb = MG.bbox(P);
      for (k = 0; k < (bb.x1 - bb.x0) * (bb.y1 - bb.y0) * 40; k++) {
        ctx.fillStyle = k % 3 ? C.sandDot : '#f6e6c0';
        var sx = bb.x0 + hash(k * 1.7 + si * 99) * (bb.x1 - bb.x0), sy = bb.y0 + hash(k * 2.3 + si * 51) * (bb.y1 - bb.y0);
        ctx.fillRect(sx, sy, 0.09, 0.035);
      }
      ctx.restore();
      path(ctx, P); ctx.strokeStyle = 'rgba(120,90,40,.35)'; ctx.lineWidth = 0.05; ctx.stroke();
    });
    // インクだまり
    (h.ink || []).forEach(function (P) {
      path(ctx, P); ctx.fillStyle = C.ink; ctx.fill();
      ctx.save(); path(ctx, P); ctx.clip();
      var bb = MG.bbox(P), cx = (bb.x0 + bb.x1) / 2, cy = (bb.y0 + bb.y1) / 2;
      var g = ctx.createRadialGradient(cx - 0.3, cy - 0.4, 0.1, cx, cy, Math.max(bb.x1 - bb.x0, bb.y1 - bb.y0));
      g.addColorStop(0, 'rgba(110,130,230,.55)'); g.addColorStop(1, 'rgba(10,12,40,0)');
      ctx.fillStyle = g; ctx.fillRect(bb.x0, bb.y0, bb.x1 - bb.x0, bb.y1 - bb.y0);
      ctx.strokeStyle = 'rgba(200,215,255,.35)'; ctx.lineWidth = 0.07; ctx.lineCap = 'round';
      ctx.beginPath(); ctx.arc(cx - 0.2, cy - 0.15, Math.min(0.6, (bb.x1 - bb.x0) / 4), Math.PI * 1.1, Math.PI * 1.45); ctx.stroke();
      ctx.restore();
      path(ctx, P); ctx.strokeStyle = '#0d1230'; ctx.lineWidth = 0.06; ctx.stroke();
    });
    // パイプの道すじ（うすく）
    (h.pipes || []).forEach(function (p) {
      ctx.setLineDash([0.18, 0.22]); ctx.strokeStyle = 'rgba(200,116,58,.35)'; ctx.lineWidth = 0.08;
      ctx.beginPath(); ctx.moveTo(p.a[0], p.a[1]); ctx.lineTo(p.b[0], p.b[1]); ctx.stroke(); ctx.setLineDash([]);
    });
    ctx.restore();
    // 外わく：木の定規（目盛り）
    var wallW = 0.32;
    ctx.lineJoin = 'round'; ctx.lineCap = 'round';
    path(ctx, h.poly); ctx.strokeStyle = C.wallSide; ctx.lineWidth = wallW + 0.08; ctx.stroke();
    path(ctx, h.poly); ctx.strokeStyle = C.wall; ctx.lineWidth = wallW; ctx.stroke();
    ctx.strokeStyle = C.wallInk; ctx.lineWidth = 0.035;
    for (i = 0; i < h.poly.length; i++) {
      var a = h.poly[i], b = h.poly[(i + 1) % h.poly.length], dx = b[0] - a[0], dy = b[1] - a[1], L = Math.sqrt(dx * dx + dy * dy);
      var nx = -dy / L, ny = dx / L; // 外向き（多角形の向きによらず、線の真ん中から両側へ少し）
      for (var tt = 0.25; tt < L - 0.1; tt += 0.25) {
        var len = Math.round(tt * 4) % 4 === 0 ? 0.13 : 0.07;
        var mx = a[0] + dx * tt / L, my = a[1] + dy * tt / L;
        ctx.beginPath(); ctx.moveTo(mx + nx * 0.06, my + ny * 0.06); ctx.lineTo(mx + nx * (0.06 - len), my + ny * (0.06 - len)); ctx.stroke();
      }
    }
    // 中のブロック（木の積み木）と板
    (h.blocks || []).forEach(function (P) {
      ctx.save(); ctx.translate(0.05, 0.09); path(ctx, P); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill(); ctx.restore();
      path(ctx, P); ctx.fillStyle = C.block; ctx.fill();
      ctx.save(); path(ctx, P); ctx.clip();
      var bb = MG.bbox(P);
      ctx.strokeStyle = 'rgba(140,90,40,.35)'; ctx.lineWidth = 0.03;
      for (var wy = bb.y0 + 0.12; wy < bb.y1; wy += 0.16) { ctx.beginPath(); ctx.moveTo(bb.x0, wy); ctx.lineTo(bb.x1, wy + 0.03); ctx.stroke(); }
      ctx.fillStyle = 'rgba(255,240,200,.35)'; ctx.fillRect(bb.x0, bb.y0, bb.x1 - bb.x0, 0.08);
      ctx.restore();
      path(ctx, P); ctx.strokeStyle = C.wallSide; ctx.lineWidth = 0.06; ctx.stroke();
    });
    (h.walls || []).forEach(function (W) {
      ctx.beginPath(); ctx.moveTo(W[0][0], W[0][1]); for (var j = 1; j < W.length; j++) ctx.lineTo(W[j][0], W[j][1]);
      ctx.strokeStyle = C.wallSide; ctx.lineWidth = 0.22; ctx.stroke(); ctx.strokeStyle = C.wall; ctx.lineWidth = 0.16; ctx.stroke();
    });
    // インクびん（くい）
    (h.posts || []).forEach(function (q) {
      var x = q[0], y = q[1], r = q[2];
      circle(ctx, x + 0.05, y + 0.08, r); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
      circle(ctx, x, y, r); ctx.fillStyle = '#2a3270'; ctx.fill();
      circle(ctx, x, y, r * 0.62); ctx.fillStyle = '#141a44'; ctx.fill();
      circle(ctx, x, y, r * 0.42); ctx.fillStyle = '#3a2a1a'; ctx.fill(); // ふた
      ctx.strokeStyle = 'rgba(190,205,255,.55)'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.arc(x, y, r * 0.82, Math.PI * 1.05, Math.PI * 1.5); ctx.stroke();
    });
    // ばね（上から見たコイル）
    (h.bumpers || []).forEach(function (q) {
      var x = q[0], y = q[1], r = q[2];
      circle(ctx, x + 0.05, y + 0.08, r); ctx.fillStyle = 'rgba(0,0,0,.3)'; ctx.fill();
      circle(ctx, x, y, r); ctx.fillStyle = C.springD; ctx.fill();
      for (var k2 = 0; k2 < 4; k2++) { circle(ctx, x - k2 * 0.02, y - k2 * 0.03, r * (0.92 - k2 * 0.2)); ctx.strokeStyle = k2 % 2 ? '#e8eef2' : C.spring; ctx.lineWidth = 0.07; ctx.stroke(); }
      circle(ctx, x, y, r * 0.2); ctx.fillStyle = '#e25a3a'; ctx.fill();
    });
    // パイプの口：入り口（暗い穴）と出口（矢印）
    (h.pipes || []).forEach(function (p, pi) {
      var hue = ['#c8743a', '#3a8ac8', '#8a5ac8'][pi % 3];
      circle(ctx, p.a[0], p.a[1], 0.42); ctx.fillStyle = C.copperD; ctx.fill();
      circle(ctx, p.a[0], p.a[1], 0.36); ctx.fillStyle = hue; ctx.fill();
      circle(ctx, p.a[0], p.a[1], 0.25); ctx.fillStyle = '#120a04'; ctx.fill();
      var d = p.d * Math.PI / 180, ux = Math.cos(d), uy = Math.sin(d);
      ctx.save(); ctx.translate(p.b[0], p.b[1]); ctx.rotate(d);
      ctx.fillStyle = C.copperD; ctx.fillRect(-0.55, -0.3, 0.5, 0.6);
      ctx.fillStyle = hue; ctx.fillRect(-0.5, -0.25, 0.45, 0.5);
      ctx.fillStyle = '#120a04'; ctx.fillRect(-0.1, -0.18, 0.1, 0.36);
      ctx.restore();
      ctx.strokeStyle = hue; ctx.lineWidth = 0.07; ctx.lineCap = 'round';
      var tx = p.b[0] + ux * 0.45, ty = p.b[1] + uy * 0.45;
      ctx.beginPath(); ctx.moveTo(tx - ux * 0.15 - uy * 0.15, ty - uy * 0.15 + ux * 0.15); ctx.lineTo(tx, ty); ctx.lineTo(tx - ux * 0.15 + uy * 0.15, ty - uy * 0.15 - ux * 0.15); ctx.stroke();
    });
    // ティー（足あとの印）
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.05;
    circle(ctx, h.tee[0], h.tee[1], 0.3); ctx.stroke();
    // カップ
    circle(ctx, h.cup[0], h.cup[1], MG.CUP_R + 0.04); ctx.fillStyle = '#d9e8d2'; ctx.fill();
    circle(ctx, h.cup[0], h.cup[1], MG.CUP_R); ctx.fillStyle = '#0c140c'; ctx.fill();
    circle(ctx, h.cup[0] + 0.05, h.cup[1] + 0.06, MG.CUP_R * 0.7); ctx.fillStyle = '#1e2a1c'; ctx.fill();
  }

  // ---------- 動くもの ----------
  function drawGear(ctx, g, t) {
    var th = MG.gearAngle(g, t), n = g.n || g.arms || 4;
    ctx.save(); ctx.translate(g.x + 0.06, g.y + 0.1);
    ctx.fillStyle = 'rgba(0,0,0,.28)';
    for (var k = 0; k < n; k++) { ctx.save(); ctx.rotate(th + k * PI2 / n); ctx.fillRect(0, -0.11, g.r, 0.22); ctx.restore(); }
    ctx.restore();
    ctx.save(); ctx.translate(g.x, g.y);
    for (var j = 0; j < n; j++) {
      ctx.save(); ctx.rotate(th + j * PI2 / n);
      ctx.fillStyle = C.brassD; ctx.fillRect(0, -0.11, g.r, 0.22);
      ctx.fillStyle = C.brass; ctx.fillRect(0, -0.08, g.r - 0.03, 0.16);
      ctx.fillStyle = 'rgba(255,240,190,.45)'; ctx.fillRect(0.3, -0.07, g.r - 0.4, 0.04);
      ctx.fillStyle = C.brassD; ctx.fillRect(g.r - 0.16, -0.15, 0.16, 0.3); // 先の歯
      ctx.restore();
    }
    // まん中の歯車
    ctx.rotate(th);
    ctx.fillStyle = C.brassD; ctx.beginPath();
    for (var q = 0; q < 20; q++) { var a = q * PI2 / 20, rr = q % 2 ? 0.42 : 0.52; ctx.lineTo(Math.cos(a) * rr, Math.sin(a) * rr); }
    ctx.closePath(); ctx.fill();
    circle(ctx, 0, 0, 0.38); ctx.fillStyle = C.brass; ctx.fill();
    circle(ctx, 0, 0, 0.13); ctx.fillStyle = C.brassD; ctx.fill();
    ctx.restore();
  }
  function drawRuler(ctx, r, t) {
    var R = MG.rulerAt(r, t), dx = R.x2 - R.x1, dy = R.y2 - R.y1, L = Math.sqrt(dx * dx + dy * dy), a = Math.atan2(dy, dx), w = MG.RULER_TH * 2 + 0.06;
    ctx.save(); ctx.translate(R.cx, R.cy); ctx.rotate(a);
    ctx.fillStyle = 'rgba(0,0,0,.28)'; ctx.fillRect(-L / 2 - 0.1 + 0.05, -w / 2 + 0.1, L + 0.2, w);
    ctx.fillStyle = C.rulerD; ctx.fillRect(-L / 2 - 0.12, -w / 2 - 0.02, L + 0.24, w + 0.04);
    ctx.fillStyle = C.ruler; ctx.fillRect(-L / 2 - 0.1, -w / 2, L + 0.2, w);
    ctx.strokeStyle = '#3a2c04'; ctx.lineWidth = 0.025;
    for (var x = -L / 2; x <= L / 2 + 0.001; x += 0.2) { var big = Math.round((x + L / 2) / 0.2) % 5 === 0; ctx.beginPath(); ctx.moveTo(x, -w / 2); ctx.lineTo(x, -w / 2 + (big ? w * 0.55 : w * 0.3)); ctx.stroke(); }
    ctx.restore();
  }
  function drawFlag(ctx, h, t, v) {
    // 鉛筆の旗（カップに立つ。球が近いと少しかたむく）
    var x = h.cup[0], y = h.cup[1];
    var up = v.rot ? { x: -1, y: 0 } : { x: 0, y: -1 }; // 画面の上の向き（マス）
    var side = v.rot ? { x: 0, y: -1 } : { x: 1, y: 0 };
    var L = 1.25, tx = x + up.x * L, ty = y + up.y * L;
    ctx.strokeStyle = 'rgba(0,0,0,.25)'; ctx.lineWidth = 0.1; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x + 0.06, y + 0.08); ctx.lineTo(tx + 0.3 * side.x + 0.06, ty + 0.3 * side.y + 0.08); ctx.stroke();
    ctx.strokeStyle = '#e8b420'; ctx.lineWidth = 0.1; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(tx, ty); ctx.stroke();
    ctx.strokeStyle = '#3a3a3a'; ctx.lineWidth = 0.05; ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x + up.x * 0.15, y + up.y * 0.15); ctx.stroke();
    var wv = Math.sin(t * 3) * 0.06;
    ctx.fillStyle = '#e04848'; ctx.beginPath();
    ctx.moveTo(tx, ty); ctx.lineTo(tx + side.x * 0.62 + up.x * (-0.12 + wv), ty + side.y * 0.62 + up.y * (-0.12 + wv)); ctx.lineTo(tx - up.x * 0.34, ty - up.y * 0.34); ctx.closePath(); ctx.fill();
    circle(ctx, tx, ty, 0.07); ctx.fillStyle = '#f0a0a8'; ctx.fill();
  }
  function drawBall(ctx, x, y, sc) {
    var r = MG.BALL_R * (sc || 1);
    circle(ctx, x + 0.05, y + 0.08, r); ctx.fillStyle = 'rgba(0,0,0,.32)'; ctx.fill();
    var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r);
    g.addColorStop(0, '#ffffff'); g.addColorStop(0.7, '#eef0ee'); g.addColorStop(1, '#b8bdb8');
    circle(ctx, x, y, r); ctx.fillStyle = g; ctx.fill();
    ctx.strokeStyle = 'rgba(60,70,60,.5)'; ctx.lineWidth = 0.02; ctx.stroke();
  }
  // 打つ前の目安：球から打つ向きへの点線（かべで1回はね返す）と、引っぱった帯
  function drawAim(ctx, v, G, aim) {
    var x = G.x, y = G.y, a = aim.a * Math.PI / 180, p = aim.p, ux = Math.cos(a), uy = Math.sin(a);
    var L = 0.7 + p * 3.3;
    // 引っぱった帯（反対側）
    ctx.strokeStyle = 'rgba(255,255,255,.55)'; ctx.lineWidth = 0.06; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y); ctx.lineTo(x - ux * (0.3 + p * 1.4), y - uy * (0.3 + p * 1.4)); ctx.stroke();
    circle(ctx, x - ux * (0.3 + p * 1.4), y - uy * (0.3 + p * 1.4), 0.1); ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.fill();
    // 点線（はね返り1回）
    var pts = ray(G.hole, x, y, ux, uy, L);
    var col = p < 0.5 ? 'rgba(255,255,255,.95)' : p < 0.8 ? '#ffe27a' : '#ff9a6a';
    ctx.fillStyle = col;
    var walked = 0, step = 0.24;
    for (var i = 0; i + 1 < pts.length; i++) {
      var A = pts[i], Bp = pts[i + 1], dx = Bp[0] - A[0], dy = Bp[1] - A[1], l = Math.sqrt(dx * dx + dy * dy);
      for (var d = (walked === 0 ? 0.32 : step - (walked % step)); d < l; d += step) {
        var f = 1 - (walked + d) / (L + 0.01);
        circle(ctx, A[0] + dx * d / l, A[1] + dy * d / l, 0.045 + 0.03 * f); ctx.fill();
      }
      walked += l;
    }
    var E = pts[pts.length - 1], P2 = pts[pts.length - 2], ex = E[0] - P2[0], ey = E[1] - P2[1], el = Math.sqrt(ex * ex + ey * ey) || 1;
    ex /= el; ey /= el;
    ctx.strokeStyle = col; ctx.lineWidth = 0.07;
    ctx.beginPath(); ctx.moveTo(E[0] - ex * 0.22 - ey * 0.15, E[1] - ey * 0.22 + ex * 0.15); ctx.lineTo(E[0], E[1]); ctx.lineTo(E[0] - ex * 0.22 + ey * 0.15, E[1] - ey * 0.22 - ex * 0.15); ctx.stroke();
  }
  // 動かないかべとの、まっすぐな線の当たり（はね返り1回まで）。目安なので歯車・定規は見ない
  function ray(h, x, y, ux, uy, L) {
    var P = MG.prep(h), pts = [[x, y]], R = MG.BALL_R;
    for (var bounce = 0; bounce < 2 && L > 0.01; bounce++) {
      var best = L, nx = 0, ny = 0;
      for (var i = 0; i < P.walls.length; i++) {
        var w = P.walls[i];
        // 線分の法線
        var wl = Math.sqrt(w.l2) || 1, wnx = -w.dy / wl, wny = w.dx / wl;
        var dn = ux * wnx + uy * wny; if (Math.abs(dn) < 1e-6) continue;
        if (dn > 0) { wnx = -wnx; wny = -wny; dn = -dn; }
        // 球の半径ぶん手前の線
        var dist = ((x - w.ax) * wnx + (y - w.ay) * wny - R) / -dn;
        if (dist < 0 || dist >= best) continue;
        var hx = x + ux * dist - wnx * R, hy = y + uy * dist - wny * R;
        var u = ((hx - w.ax) * w.dx + (hy - w.ay) * w.dy) / w.l2;
        if (u < 0 || u > 1) continue;
        best = dist; nx = wnx; ny = wny;
      }
      x += ux * best; y += uy * best; pts.push([x, y]); L -= best;
      if (L <= 0.01 || (!nx && !ny)) break;
      var vn = ux * nx + uy * ny; ux -= 2 * vn * nx; uy -= 2 * vn * ny;
    }
    if (pts.length < 2) pts.push([x + ux * 0.01, y + uy * 0.01]);
    return pts;
  }
  function drawFx(ctx, fx, t) {
    fx.forEach(function (f) {
      var k = (t - f.t0) / f.d; if (k < 0 || k > 1) return;
      if (f.k === 'ink') {
        for (var i = 0; i < 9; i++) { var a = i * PI2 / 9 + f.x, r = 0.15 + k * 0.7; circle(ctx, f.x + Math.cos(a) * r, f.y + Math.sin(a) * r, 0.1 * (1 - k)); ctx.fillStyle = '#2a3480'; ctx.fill(); }
        circle(ctx, f.x, f.y, 0.2 + k * 0.4); ctx.strokeStyle = 'rgba(160,180,255,' + (0.7 * (1 - k)) + ')'; ctx.lineWidth = 0.05; ctx.stroke();
      } else if (f.k === 'ring') {
        circle(ctx, f.x, f.y, 0.2 + k * (f.r || 0.8)); ctx.strokeStyle = 'rgba(' + (f.c || '255,255,255') + ',' + (0.8 * (1 - k)) + ')'; ctx.lineWidth = 0.07; ctx.stroke();
      } else if (f.k === 'cup') {
        for (var j = 0; j < 14; j++) {
          var b = j * PI2 / 14 + j, rr = 0.2 + k * 1.6 * (0.6 + hash(j) * 0.6);
          ctx.fillStyle = ['#ffd24a', '#ff7a6a', '#7ad0ff', '#9ae07a', '#ffffff'][j % 5];
          ctx.globalAlpha = 1 - k; ctx.fillRect(f.x + Math.cos(b) * rr - 0.05, f.y + Math.sin(b) * rr - 0.05 + k * k * 0.6, 0.1, 0.14); ctx.globalAlpha = 1;
        }
      } else if (f.k === 'puff') {
        circle(ctx, f.x, f.y, 0.15 + k * 0.4); ctx.fillStyle = 'rgba(240,220,170,' + (0.6 * (1 - k)) + ')'; ctx.fill();
      }
    });
  }
  // 1枚
  function frame(ctx, v, o) {
    var G = o.G, h = v.hole, t = o.t || 0, gt = G ? G.time() : 0;
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    ctx.drawImage(staticLayer(v), 0, 0);
    apply(ctx, v);
    var P = MG.prep(h);
    P.rulers.forEach(function (r) { drawRuler(ctx, r, gt); });
    if (G && (G.st === 'rest' || G.st === 'roll') && o.trail) {
      ctx.fillStyle = 'rgba(255,255,255,.18)';
      o.trail.forEach(function (q, i) { circle(ctx, q[0], q[1], MG.BALL_R * (0.35 + 0.5 * i / o.trail.length)); ctx.fill(); });
    }
    if (o.ghost) { // チュートリアル：引っぱる手本
      var gk = (t % 2) / 2, gp = Math.min(1, gk * 1.6), gg = o.ghost;
      ctx.globalAlpha = 0.75 * (1 - Math.max(0, gk - 0.7) / 0.3);
      drawAim(ctx, v, G, { a: gg.a, p: 0.2 + gp * (gg.p - 0.2) });
      ctx.globalAlpha = 1;
    }
    if (G && G.st !== 'pipe' && G.st !== 'sunk') {
      if (o.aim && G.st === 'rest') drawAim(ctx, v, G, o.aim);
      drawBall(ctx, G.x, G.y, o.ballScale);
    }
    P.gears.forEach(function (g) { drawGear(ctx, g, gt); });
    if (G && G.st === 'sunk' && o.sinkK != null && o.sinkK < 1) drawBall(ctx, h.cup[0], h.cup[1], 1 - o.sinkK);
    drawFlag(ctx, h, t, v);
    if (o.fx && o.fx.length) drawFx(ctx, o.fx, t);
    ctx.setTransform(1, 0, 0, 1, 0, 0);
  }
  // ホールの小さな絵（ホールをえらぶ画面）。縦長のまま
  function thumb(canvas, hole) {
    var w = canvas.width, hgt = canvas.height, v = view(hole, w, hgt, 1, false);
    var ctx = canvas.getContext('2d');
    var keep = cache; cache = null;
    ctx.setTransform(1, 0, 0, 1, 0, 0); ctx.clearRect(0, 0, w, hgt);
    apply(ctx, v); drawStatic(ctx, v);
    var P = MG.prep(hole);
    P.rulers.forEach(function (r) { drawRuler(ctx, r, 0); }); P.gears.forEach(function (g) { drawGear(ctx, g, 0); });
    drawBall(ctx, hole.tee[0], hole.tee[1]); drawFlag(ctx, hole, 0, v);
    cache = keep;
  }
  root.MinigolfArt = { init: init, setTheme: setTheme, view: view, frame: frame, thumb: thumb, ray: ray, invalidate: function () { cache = null; } };
})(typeof window !== 'undefined' ? window : globalThis);
