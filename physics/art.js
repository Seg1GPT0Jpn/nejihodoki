// ころころ工房 — procedural art (Canvas 2D). Warm wood and brass: a pegboard wall, wooden boards, brass springs and
// gears, a woven basket with a sleeping cat. Everything is drawn from the bodies of a built puzzle (engine.js build()).
(function (root) {
  'use strict';
  var PE = null, T = function (s) { return s; };
  var view = { W: 360, H: 360, dpr: 1, s: 30, ox: 0, oy: 0 };
  var dark = false, reduced = function () { return false; };
  var stat = null, statKey = '';
  var PAL = {};
  function palette() {
    PAL = dark ? {
      wall0: '#2a2018', wall1: '#33271d', hole: 'rgba(0,0,0,.35)', holeHi: 'rgba(255,220,180,.05)', grid: 'rgba(255,226,180,.10)', grid2: 'rgba(255,226,180,.22)',
      wood: ['#a8743f', '#8a5a2c', '#6e4520'], board: ['#d9a865', '#b88446', '#94652f'], line: '#2a1708', shadow: 'rgba(0,0,0,.35)',
      glass: 'rgba(150,200,230,.13)', glassLine: 'rgba(170,215,240,.45)', floor: ['#7a5230', '#5c3b20'],
    } : {
      wall0: '#ead8b8', wall1: '#e2cda8', hole: 'rgba(110,80,40,.22)', holeHi: 'rgba(255,255,255,.35)', grid: 'rgba(110,80,40,.10)', grid2: 'rgba(110,80,40,.22)',
      wood: ['#b07a42', '#93622f', '#764c22'], board: ['#e3b475', '#c99554', '#a8763a'], line: '#3a210c', shadow: 'rgba(60,35,10,.22)',
      glass: 'rgba(120,180,220,.16)', glassLine: 'rgba(70,140,190,.55)', floor: ['#8a5c34', '#6a4424'],
    };
  }
  palette();
  var X = function (x) { return view.ox + x * view.s; };
  var Y = function (y) { return view.oy + (PE.BH - y) * view.s; };
  function hashN(n) { n = (n ^ 61) ^ (n >>> 16); n = n + (n << 3); n = n ^ (n >>> 4); n = Math.imul(n, 0x27d4eb2d); n = n ^ (n >>> 15); return (n >>> 0) / 4294967296; }

  // ---------------------------------------------------------------- shapes
  function polyPath(ctx, b) {
    ctx.beginPath();
    for (var i = 0; i < b.n; i++) { var x = X(b.wv[2 * i]), y = Y(b.wv[2 * i + 1]); if (i) ctx.lineTo(x, y); else ctx.moveTo(x, y); }
    ctx.closePath();
  }
  function roundBox(ctx, b, r) { // a rounded box in the body's frame (b.wd / b.ht from its verts)
    var w = Math.abs(b.lv[2] - b.lv[0]) * view.s, h = Math.abs(b.lv[5] - b.lv[3]) * view.s;
    ctx.save(); ctx.translate(X(b.x), Y(b.y)); ctx.rotate(-b.a);
    ctx.beginPath(); rr(ctx, -w / 2, -h / 2, w, h, Math.min(r, h / 2, w / 2));
    return { w: w, h: h };
  }
  function rr(ctx, x, y, w, h, r) { ctx.moveTo(x + r, y); ctx.arcTo(x + w, y, x + w, y + h, r); ctx.arcTo(x + w, y + h, x, y + h, r); ctx.arcTo(x, y + h, x, y, r); ctx.arcTo(x, y, x + w, y, r); ctx.closePath(); }
  function grain(ctx, w, h, seed, col) {
    ctx.strokeStyle = col; ctx.lineWidth = Math.max(0.6, view.s * 0.025);
    var n = Math.max(2, Math.round(h / (view.s * 0.11)));
    for (var i = 0; i < n; i++) {
      var y = -h / 2 + (i + 0.5) * h / n + (hashN(seed * 13 + i) - 0.5) * h / n * 0.6;
      ctx.beginPath(); ctx.moveTo(-w / 2, y);
      var k = 3 + Math.floor(hashN(seed + i * 7) * 3);
      for (var j = 1; j <= k; j++) ctx.lineTo(-w / 2 + w * j / k, y + (hashN(seed * 31 + i * 5 + j) - 0.5) * h * 0.18);
      ctx.stroke();
    }
  }

  // ---------------------------------------------------------------- static layer (wall, glass, fixed boards, goal back)
  function resize(v) { view = v; statKey = ''; }
  function setTheme(d) { dark = !!d; palette(); statKey = ''; }
  function background(ctx, w, h, grid) {
    var g = ctx.createLinearGradient(0, 0, 0, h); g.addColorStop(0, PAL.wall0); g.addColorStop(1, PAL.wall1);
    ctx.fillStyle = g; ctx.fillRect(0, 0, w, h);
    var s = view.s;
    // pegboard holes every unit
    for (var gx = 0.5; gx < PE.BW; gx += 1) for (var gy = 0.5; gy < PE.BH; gy += 1) {
      ctx.fillStyle = PAL.hole; ctx.beginPath(); ctx.arc(X(gx), Y(gy), Math.max(1, s * 0.06), 0, 6.283); ctx.fill();
      ctx.fillStyle = PAL.holeHi; ctx.beginPath(); ctx.arc(X(gx), Y(gy) + s * 0.05, Math.max(0.6, s * 0.035), 0, 3.14); ctx.fill();
    }
    if (grid) {
      ctx.lineWidth = 1;
      for (var i = 0; i <= PE.BW * 2; i++) {
        ctx.strokeStyle = i % 4 === 0 ? PAL.grid2 : PAL.grid;
        var x = Math.round(X(i / 2)) + 0.5; ctx.beginPath(); ctx.moveTo(x, Y(PE.BH)); ctx.lineTo(x, Y(0)); ctx.stroke();
        var y = Math.round(Y(i / 2)) + 0.5; ctx.beginPath(); ctx.moveTo(X(0), y); ctx.lineTo(X(PE.BW), y); ctx.stroke();
      }
    }
  }
  function buildStatic(S, grid) {
    var key = [view.W, view.H, view.dpr, view.s, dark, grid, S.level.id].join();
    if (stat && key === statKey) return;
    statKey = key;
    if (!stat) stat = document.createElement('canvas');
    stat.width = Math.round(view.W * view.dpr); stat.height = Math.round(view.H * view.dpr);
    var c = stat.getContext('2d');
    c.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    c.clearRect(0, 0, view.W, view.H);
    background(c, view.W, view.H, grid);
    var L = S.level;
    (L.glass || []).forEach(function (z) { drawGlass(c, z); });
    var bs = S.W.bodies;
    for (var i = 0; i < bs.length; i++) { var b = bs[i]; if (b.type === PE.STATIC && b.fixed && !b.sensor && b.part == null) drawStatic(c, b); }
    drawGoalBack(c, L.goal);
  }
  function drawGlass(c, z) {
    var x = X(z[0]), y = Y(z[1] + z[3]), w = z[2] * view.s, h = z[3] * view.s;
    c.save();
    c.fillStyle = PAL.glass; c.fillRect(x, y, w, h);
    c.beginPath(); c.rect(x, y, w, h); c.clip();
    c.strokeStyle = PAL.glassLine; c.lineWidth = 1; c.globalAlpha = 0.5;
    for (var k = -h; k < w; k += view.s * 0.45) { c.beginPath(); c.moveTo(x + k, y + h); c.lineTo(x + k + h, y); c.stroke(); }
    c.restore();
    c.strokeStyle = PAL.glassLine; c.lineWidth = 1.5; c.setLineDash([5, 4]); c.strokeRect(x + 0.75, y + 0.75, w - 1.5, h - 1.5); c.setLineDash([]);
  }
  function drawStatic(c, b) {
    if (b.tag === 'goal') return;
    c.save();
    c.shadowColor = PAL.shadow; c.shadowBlur = view.s * 0.18; c.shadowOffsetY = view.s * 0.08;
    polyPath(c, b);
    var floor = b.y < 0.5 && (b.x1 - b.x0) > 6;
    if (b.tag === 'rubber') c.fillStyle = '#d0453a';
    else if (b.tag === 'ice') { var gi = c.createLinearGradient(X(b.x0), Y(b.y1), X(b.x1), Y(b.y0)); gi.addColorStop(0, '#dff4ff'); gi.addColorStop(1, '#9fd2ef'); c.fillStyle = gi; }
    else {
      var cols = floor ? PAL.floor : PAL.wood, g = c.createLinearGradient(0, Y(b.y1), 0, Y(b.y0));
      g.addColorStop(0, cols[0]); g.addColorStop(1, cols[cols.length - 1]); c.fillStyle = g;
    }
    c.fill();
    c.shadowColor = 'transparent';
    c.save(); polyPath(c, b); c.clip();
    if (b.tag === 'ice') {
      c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 2;
      c.beginPath(); c.moveTo(X(b.x0) + 4, Y(b.y1) + 6); c.lineTo(X(b.x0) + view.s * 0.8, Y(b.y1) + 3); c.stroke();
    } else if (b.tag === 'rubber') {
      c.fillStyle = 'rgba(255,255,255,.25)'; c.fillRect(X(b.x0), Y(b.y1), (b.x1 - b.x0) * view.s, view.s * 0.08);
    } else {
      // grain along the longer side
      c.translate(X(b.x), Y(b.y));
      var w = (b.x1 - b.x0) * view.s, h = (b.y1 - b.y0) * view.s, vert = h > w * 1.5;
      if (vert) { c.rotate(Math.PI / 2); var t = w; w = h; h = t; }
      else if (b.n === 4 && !b.circle) { // a slanted board: follow its long edge
        var ex = b.wv[2] - b.wv[0], ey = b.wv[3] - b.wv[1], fx = b.wv[4] - b.wv[2], fy = b.wv[5] - b.wv[3];
        var L1 = ex * ex + ey * ey, L2 = fx * fx + fy * fy, ang = L1 > L2 ? Math.atan2(-ey, ex) : Math.atan2(-fy, fx);
        c.rotate(ang); w = Math.sqrt(Math.max(L1, L2)) * view.s; h = Math.sqrt(Math.min(L1, L2)) * view.s;
      }
      grain(c, w * 1.1, h, b.id + 3, dark ? 'rgba(40,20,5,.35)' : 'rgba(80,45,15,.28)');
    }
    c.restore();
    c.strokeStyle = b.tag === 'rubber' ? '#6a1a12' : b.tag === 'ice' ? '#5c9bc2' : PAL.line; c.lineWidth = Math.max(1, view.s * 0.045);
    polyPath(c, b); c.stroke();
    c.restore();
  }
  function goalRect(g) { return { x: X(g.x - PE.GOAL.w / 2), y: Y(g.y + PE.GOAL.wall), w: PE.GOAL.w * view.s, h: PE.GOAL.wall * view.s }; }
  function drawGoalBack(c, g) {
    var r = goalRect(g), s = view.s;
    // cushion inside
    c.fillStyle = dark ? '#5a3a5a' : '#c995c4';
    c.beginPath(); c.ellipse(r.x + r.w / 2, r.y + r.h * 0.78, r.w * 0.42, r.h * 0.3, 0, 0, 6.283); c.fill();
    c.fillStyle = 'rgba(255,255,255,.18)'; c.beginPath(); c.ellipse(r.x + r.w * 0.42, r.y + r.h * 0.68, r.w * 0.2, r.h * 0.1, 0, 0, 6.283); c.fill();
    void s;
  }

  // ---------------------------------------------------------------- the cat (in the basket)
  function drawCat(ctx, g, t, mood) { // mood: 0 asleep, 1 happy (won)
    var r = goalRect(g), s = view.s, cx = r.x + r.w * 0.6, cy = r.y + r.h * 0.4;
    var bob = mood ? Math.abs(Math.sin(t * 6)) * s * 0.12 : Math.sin(t * 1.6) * s * 0.02;
    ctx.save(); ctx.translate(cx, cy - bob);
    var fur = '#f0a050', furD = '#c8742c';
    // body curled behind the rim
    ctx.fillStyle = fur; ctx.beginPath(); ctx.ellipse(-s * 0.35, s * 0.25, s * 0.55, s * 0.32, 0, 0, 6.283); ctx.fill();
    // tail
    ctx.strokeStyle = furD; ctx.lineWidth = s * 0.13; ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(-s * 0.85, s * 0.25); ctx.quadraticCurveTo(-s * 1.05, -s * 0.15 + (mood ? Math.sin(t * 10) * s * 0.12 : 0), -s * 0.75, -s * 0.25); ctx.stroke();
    // head
    ctx.fillStyle = fur;
    ctx.beginPath(); ctx.moveTo(-s * 0.3, -s * 0.12); ctx.lineTo(-s * 0.22, -s * 0.5); ctx.lineTo(-s * 0.02, -s * 0.28); ctx.lineTo(s * 0.18, -s * 0.5); ctx.lineTo(s * 0.28, -s * 0.12); ctx.closePath(); ctx.fill();
    ctx.beginPath(); ctx.ellipse(0, -s * 0.05, s * 0.32, s * 0.27, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#ffd9b0'; ctx.beginPath(); ctx.ellipse(0, s * 0.06, s * 0.17, s * 0.11, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#f7a4a4'; ctx.beginPath(); ctx.moveTo(-s * 0.2, -s * 0.4); ctx.lineTo(-s * 0.18, -s * 0.24); ctx.lineTo(-s * 0.08, -s * 0.3); ctx.fill();
    ctx.beginPath(); ctx.moveTo(s * 0.17, -s * 0.4); ctx.lineTo(s * 0.17, -s * 0.24); ctx.lineTo(s * 0.06, -s * 0.3); ctx.fill();
    // stripes
    ctx.strokeStyle = furD; ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.beginPath(); ctx.moveTo(-s * 0.05, -s * 0.3); ctx.lineTo(-s * 0.03, -s * 0.2); ctx.moveTo(s * 0.04, -s * 0.3); ctx.lineTo(s * 0.03, -s * 0.2); ctx.stroke();
    // face
    ctx.strokeStyle = '#3a2210'; ctx.lineWidth = Math.max(1, s * 0.045); ctx.lineCap = 'round';
    if (mood) {
      ctx.beginPath(); ctx.arc(-s * 0.12, -s * 0.06, s * 0.06, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.12, -s * 0.06, s * 0.06, Math.PI * 1.1, Math.PI * 1.9); ctx.stroke();
    } else {
      ctx.beginPath(); ctx.arc(-s * 0.12, -s * 0.08, s * 0.06, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
      ctx.beginPath(); ctx.arc(s * 0.12, -s * 0.08, s * 0.06, Math.PI * 0.15, Math.PI * 0.85); ctx.stroke();
    }
    ctx.fillStyle = '#c8505a'; ctx.beginPath(); ctx.arc(0, s * 0.02, s * 0.03, 0, 6.283); ctx.fill();
    ctx.beginPath(); ctx.moveTo(-s * 0.05, s * 0.07); ctx.quadraticCurveTo(0, s * 0.11, 0, s * 0.05); ctx.quadraticCurveTo(0, s * 0.11, s * 0.05, s * 0.07); ctx.stroke();
    ctx.restore();
    // zzz or hearts
    ctx.save();
    ctx.font = '800 ' + Math.round(s * (mood ? 0.42 : 0.32)) + 'px system-ui, sans-serif'; ctx.textAlign = 'center';
    if (!mood) {
      var ph = (t * 0.5) % 1;
      ctx.fillStyle = dark ? 'rgba(255,240,220,' + (0.8 - ph * 0.7) + ')' : 'rgba(80,50,30,' + (0.75 - ph * 0.65) + ')';
      ctx.fillText('z', cx + s * 0.35 + ph * s * 0.3, cy - s * 0.55 - ph * s * 0.5);
      ctx.font = '800 ' + Math.round(s * 0.22) + 'px system-ui, sans-serif';
      ctx.fillText('z', cx + s * 0.6 + ph * s * 0.2, cy - s * 0.9 - ph * s * 0.3);
    } else {
      for (var k = 0; k < 3; k++) { var q = (t * 0.8 + k / 3) % 1; ctx.fillStyle = 'rgba(232,70,90,' + (1 - q) + ')'; ctx.fillText('♥', cx + (k - 1) * s * 0.45, cy - s * 0.5 - q * s * 1.2); }
    }
    ctx.restore();
  }
  function drawGoalFront(ctx, g) {
    var r = goalRect(g), s = view.s, t = PE.GOAL.t * s;
    ctx.save();
    // woven basket: two side posts and a front band (the ball sits behind the front band)
    var grd = ctx.createLinearGradient(0, r.y, 0, r.y + r.h); grd.addColorStop(0, '#c98c4a'); grd.addColorStop(1, '#8a5527');
    ctx.fillStyle = grd;
    ctx.beginPath(); rr(ctx, r.x, r.y + r.h * 0.45, r.w, r.h * 0.55, s * 0.12); ctx.fill();
    ctx.fillRect(r.x, r.y, t, r.h); ctx.fillRect(r.x + r.w - t, r.y, t, r.h);
    ctx.strokeStyle = 'rgba(60,30,8,.55)'; ctx.lineWidth = Math.max(1, s * 0.04);
    for (var i = 0; i < 6; i++) { var xx = r.x + (i + 0.5) * r.w / 6; ctx.beginPath(); ctx.moveTo(xx, r.y + r.h * 0.48); ctx.lineTo(xx, r.y + r.h); ctx.stroke(); }
    for (var j = 0; j < 2; j++) { var yy = r.y + r.h * (0.62 + j * 0.2); ctx.beginPath(); ctx.moveTo(r.x + 2, yy); ctx.bezierCurveTo(r.x + r.w * 0.3, yy + 3, r.x + r.w * 0.7, yy - 3, r.x + r.w - 2, yy); ctx.stroke(); }
    ctx.strokeStyle = '#4a2a0c'; ctx.lineWidth = Math.max(1.2, s * 0.06);
    ctx.beginPath(); rr(ctx, r.x, r.y + r.h * 0.45, r.w, r.h * 0.55, s * 0.12); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- parts and dynamic things
  function drawBody(ctx, b, t, o) {
    var s = view.s, tag = b.tag;
    if (tag === 'ball') return drawBall(ctx, b, t);
    ctx.save();
    if (o && o.ghost) ctx.globalAlpha = 0.45;
    switch (tag) {
      case 'plank': case 'short': drawBoard(ctx, b, false); break;
      case 'seesaw': drawBoard(ctx, b, true); break;
      case 'lip': { roundBox(ctx, b, s * 0.05); ctx.fillStyle = '#c99554'; ctx.fill(); ctx.strokeStyle = PAL.line; ctx.lineWidth = Math.max(1, s * 0.04); ctx.stroke(); ctx.restore(); break; }
      case 'box': drawCrate(ctx, b); break;
      case 'spring': drawSpring(ctx, b, t, o); break;
      case 'fan': drawFan(ctx, b, t, o); break;
      case 'belt': drawBelt(ctx, b, t, o); break;
      case 'domino': drawDomino(ctx, b); break;
      case 'balloon': drawBalloon(ctx, b); break;
      case 'weight': drawWeight(ctx, b); break;
      case 'magnet': drawMagnet(ctx, b, t, o); break;
      case 'spin': drawSpin(ctx, b); break;
      default: if (!b.circle) { polyPath(ctx, b); ctx.fillStyle = PAL.wood[0]; ctx.fill(); }
    }
    ctx.restore();
  }
  function drawBoard(ctx, b, pivot) {
    var s = view.s, d = roundBox(ctx, b, s * 0.06);
    var g = ctx.createLinearGradient(0, -d.h / 2, 0, d.h / 2); g.addColorStop(0, PAL.board[0]); g.addColorStop(0.6, PAL.board[1]); g.addColorStop(1, PAL.board[2]);
    ctx.shadowColor = PAL.shadow; ctx.shadowBlur = s * 0.15; ctx.shadowOffsetY = s * 0.06;
    ctx.fillStyle = g; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.save(); ctx.clip(); grain(ctx, d.w, d.h, b.id * 7 + 1, 'rgba(90,50,15,.25)'); ctx.restore();
    ctx.strokeStyle = PAL.line; ctx.lineWidth = Math.max(1, s * 0.045); ctx.stroke();
    // nails
    ctx.fillStyle = '#9aa0a8';
    var nx = d.w / 2 - s * 0.16;
    if (!pivot) { ctx.beginPath(); ctx.arc(-nx, 0, s * 0.045, 0, 6.283); ctx.arc(nx, 0, s * 0.045, 0, 6.283); ctx.fill(); }
    else {
      ctx.fillStyle = '#d8a83a'; ctx.strokeStyle = '#6a4a0c'; ctx.lineWidth = Math.max(1, s * 0.04);
      ctx.beginPath(); ctx.arc(0, 0, s * 0.14, 0, 6.283); ctx.fill(); ctx.stroke();
      ctx.fillStyle = '#6a4a0c'; ctx.beginPath(); ctx.arc(0, 0, s * 0.05, 0, 6.283); ctx.fill();
    }
    ctx.restore();
    if (pivot) { // the bracket on the wall behind the pin
      ctx.save(); ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#7d6a4a'; ctx.beginPath(); ctx.moveTo(X(b.x) - s * 0.22, Y(b.y) + s * 0.55); ctx.lineTo(X(b.x) + s * 0.22, Y(b.y) + s * 0.55); ctx.lineTo(X(b.x), Y(b.y)); ctx.closePath(); ctx.fill();
      ctx.restore();
    }
  }
  function drawCrate(ctx, b) {
    var s = view.s, d = roundBox(ctx, b, s * 0.04);
    ctx.fillStyle = '#b8864a'; ctx.fill(); ctx.strokeStyle = PAL.line; ctx.lineWidth = Math.max(1, s * 0.05); ctx.stroke();
    var m = Math.min(d.w, d.h) * 0.14;
    ctx.strokeStyle = '#7a5226'; ctx.lineWidth = m;
    ctx.strokeRect(-d.w / 2 + m / 2, -d.h / 2 + m / 2, d.w - m, d.h - m);
    if (d.h > s * 0.4) { ctx.beginPath(); ctx.moveTo(-d.w / 2 + m, -d.h / 2 + m); ctx.lineTo(d.w / 2 - m, d.h / 2 - m); ctx.stroke(); }
    ctx.restore();
  }
  function drawSpring(ctx, b, t, o) {
    var s = view.s; var d = roundBox(ctx, b, 3); ctx.restore();
    ctx.save(); ctx.translate(X(b.x), Y(b.y)); ctx.rotate(-b.a);
    var w = d.w, h = d.h, squash = o && o.squash ? o.squash : 0;
    var top = -h / 2 + h * 0.25 * squash;
    ctx.fillStyle = '#5a646e'; ctx.fillRect(-w / 2, h / 2 - h * 0.22, w, h * 0.22);
    ctx.strokeStyle = '#c8962e'; ctx.lineWidth = Math.max(1.5, s * 0.07); ctx.lineJoin = 'round';
    ctx.beginPath();
    var n = 5, y0 = h / 2 - h * 0.22, y1 = top + h * 0.2;
    for (var i = 0; i <= n * 2; i++) { var xx = -w * 0.32 + (i % 2) * w * 0.64, yy = y0 + (y1 - y0) * i / (n * 2); if (i) ctx.lineTo(xx, yy); else ctx.moveTo(0, y0); }
    ctx.stroke();
    ctx.fillStyle = '#d9483b'; ctx.strokeStyle = '#5a1410'; ctx.lineWidth = Math.max(1, s * 0.04);
    ctx.beginPath(); rr(ctx, -w / 2, top, w, h * 0.22, 3); ctx.fill(); ctx.stroke();
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.fillRect(-w / 2 + 3, top + 2, w - 6, Math.max(1, h * 0.05));
    ctx.restore();
  }
  function windZone(ctx, b, t, alpha) {
    var D = PE.PARTS.fan, s = view.s;
    ctx.save(); ctx.translate(X(b.x), Y(b.y)); ctx.rotate(-b.a);
    var x0 = D.w / 2 * s, L = D.wind.len * s, hw = D.wind.wid / 2 * s;
    var g = ctx.createLinearGradient(x0, 0, x0 + L, 0); g.addColorStop(0, 'rgba(160,210,240,' + 0.22 * alpha + ')'); g.addColorStop(1, 'rgba(160,210,240,0)');
    ctx.fillStyle = g; ctx.fillRect(x0, -hw, L, hw * 2);
    ctx.strokeStyle = 'rgba(120,180,220,' + 0.55 * alpha + ')'; ctx.lineWidth = Math.max(1, s * 0.04); ctx.lineCap = 'round';
    for (var i = 0; i < 5; i++) {
      var ph = ((t * 1.6 + hashN(i * 9 + b.id)) % 1), yy = -hw + hw * 2 * (i + 0.5) / 5;
      var xx = x0 + ph * L * 0.9;
      ctx.globalAlpha = 1 - ph;
      ctx.beginPath(); ctx.moveTo(xx, yy); ctx.lineTo(xx + s * 0.45, yy + Math.sin(ph * 6 + i) * s * 0.06); ctx.stroke();
    }
    ctx.restore();
  }
  function drawFan(ctx, b, t, o) {
    var s = view.s, d = roundBox(ctx, b, s * 0.12);
    ctx.fillStyle = '#3f6a5a'; ctx.fill(); ctx.strokeStyle = '#162a22'; ctx.lineWidth = Math.max(1, s * 0.05); ctx.stroke();
    var R = d.w * 0.36;
    ctx.fillStyle = '#20382e'; ctx.beginPath(); ctx.arc(0, 0, R, 0, 6.283); ctx.fill();
    var spin = o && o.running ? t * 18 : 0.4;
    ctx.fillStyle = '#d8dde2';
    for (var i = 0; i < 4; i++) {
      var a = spin + i * Math.PI / 2;
      ctx.save(); ctx.rotate(a); ctx.beginPath(); ctx.ellipse(R * 0.5, 0, R * 0.48, R * 0.2, 0.4, 0, 6.283); ctx.fill(); ctx.restore();
    }
    ctx.fillStyle = '#c8962e'; ctx.beginPath(); ctx.arc(0, 0, R * 0.22, 0, 6.283); ctx.fill();
    // the arrow on the side that blows
    ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.moveTo(d.w / 2 + s * 0.02, 0); ctx.lineTo(d.w / 2 - s * 0.14, -s * 0.12); ctx.lineTo(d.w / 2 - s * 0.14, s * 0.12); ctx.closePath(); ctx.fill();
    ctx.restore();
  }
  function drawBelt(ctx, b, t, o) {
    var s = view.s, d = roundBox(ctx, b, s * 0.16);
    ctx.fillStyle = '#2f3338'; ctx.fill(); ctx.strokeStyle = '#111'; ctx.lineWidth = Math.max(1, s * 0.04); ctx.stroke();
    ctx.save(); ctx.clip();
    var sp = PE.PARTS.belt.belt, off = ((o && o.running ? t * sp : 0) * s) % (s * 0.5);
    ctx.strokeStyle = '#f2b33d'; ctx.lineWidth = Math.max(1, s * 0.05);
    for (var x = -d.w / 2 - s; x < d.w / 2 + s; x += s * 0.5) {
      ctx.beginPath(); ctx.moveTo(x + off, -d.h * 0.3); ctx.lineTo(x + off + s * 0.12, -d.h * 0.05); ctx.lineTo(x + off, d.h * 0.2); ctx.stroke();
    }
    ctx.restore();
    ctx.fillStyle = '#9aa3ad';
    var rr2 = d.h * 0.32;
    ctx.beginPath(); ctx.arc(-d.w / 2 + d.h / 2, 0, rr2, 0, 6.283); ctx.arc(d.w / 2 - d.h / 2, 0, rr2, 0, 6.283); ctx.fill();
    ctx.restore();
  }
  function drawDomino(ctx, b) {
    var s = view.s, d = roundBox(ctx, b, s * 0.05);
    ctx.shadowColor = PAL.shadow; ctx.shadowBlur = s * 0.1;
    ctx.fillStyle = '#f6efe0'; ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#3a2a1a'; ctx.lineWidth = Math.max(1, s * 0.04); ctx.stroke();
    ctx.strokeStyle = '#b8a888'; ctx.beginPath(); ctx.moveTo(-d.w * 0.35, 0); ctx.lineTo(d.w * 0.35, 0); ctx.stroke();
    ctx.fillStyle = '#c03a2e';
    [-0.3, -0.15, 0.15, 0.3].forEach(function (k) { ctx.beginPath(); ctx.arc(0, d.h * k, Math.max(1, s * 0.035), 0, 6.283); ctx.fill(); });
    ctx.restore();
  }
  function drawBalloon(ctx, b) {
    var s = view.s, r = b.r * s, x = X(b.x), y = Y(b.y);
    ctx.strokeStyle = '#6a4a2a'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.moveTo(x, y + r * 1.05); ctx.quadraticCurveTo(x - r * 0.3, y + r * 1.6, x + r * 0.1, y + r * 2.1); ctx.stroke();
    var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r * 1.1); g.addColorStop(0, '#ff9a9a'); g.addColorStop(1, '#d0303a');
    ctx.fillStyle = g; ctx.beginPath(); ctx.ellipse(x, y, r * 0.95, r * 1.05, 0, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#a82028'; ctx.beginPath(); ctx.moveTo(x - r * 0.12, y + r * 1.08); ctx.lineTo(x + r * 0.12, y + r * 1.08); ctx.lineTo(x, y + r * 0.95); ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,.55)'; ctx.beginPath(); ctx.ellipse(x - r * 0.35, y - r * 0.42, r * 0.16, r * 0.26, -0.5, 0, 6.283); ctx.fill();
  }
  function drawWeight(ctx, b) {
    var s = view.s, r = b.r * s, x = X(b.x), y = Y(b.y);
    ctx.shadowColor = PAL.shadow; ctx.shadowBlur = s * 0.15; ctx.shadowOffsetY = s * 0.06;
    var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.35, r * 0.1, x, y, r); g.addColorStop(0, '#8a939c'); g.addColorStop(1, '#2b3036');
    ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill(); ctx.shadowColor = 'transparent';
    ctx.strokeStyle = '#15181c'; ctx.lineWidth = Math.max(1, s * 0.04); ctx.stroke();
    ctx.save(); ctx.translate(x, y); ctx.rotate(-b.a);
    ctx.fillStyle = 'rgba(255,255,255,.75)'; ctx.font = '800 ' + Math.round(r * 0.7) + 'px system-ui, sans-serif'; ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
    ctx.fillText('kg', 0, r * 0.05);
    ctx.restore();
  }
  function drawMagnet(ctx, b, t, o) {
    var s = view.s, D = PE.PARTS.magnet;
    if (o && o.field) { // the reach
      ctx.save(); ctx.strokeStyle = 'rgba(208,69,58,.25)'; ctx.setLineDash([4, 5]); ctx.lineWidth = 1.2;
      var px = b.x + b.c * D.w * 0.3, py = b.y + b.s * D.w * 0.3;
      ctx.beginPath(); ctx.arc(X(px), Y(py), D.magnet.r * s, 0, 6.283); ctx.stroke(); ctx.restore();
    }
    ctx.save(); ctx.translate(X(b.x), Y(b.y)); ctx.rotate(-b.a);
    var w = D.w * s, h = D.h * s, th = h * 0.3;
    // a U opening toward +x
    ctx.lineCap = 'butt';
    ctx.strokeStyle = '#d0453a'; ctx.lineWidth = th;
    ctx.beginPath(); ctx.moveTo(w * 0.2, -h / 2 + th / 2); ctx.lineTo(-w * 0.05, -h / 2 + th / 2); ctx.arc(-w * 0.05, 0, h / 2 - th / 2, -Math.PI / 2, Math.PI / 2, true); ctx.lineTo(w * 0.2, h / 2 - th / 2); ctx.stroke();
    ctx.fillStyle = '#d8dde2'; ctx.fillRect(w * 0.2, -h / 2, w * 0.3, th); ctx.fillRect(w * 0.2, h / 2 - th, w * 0.3, th);
    ctx.strokeStyle = '#5a1410'; ctx.lineWidth = 1; ctx.strokeRect(w * 0.2, -h / 2, w * 0.3, th); ctx.strokeRect(w * 0.2, h / 2 - th, w * 0.3, th);
    if (o && o.running) {
      ctx.strokeStyle = 'rgba(255,211,107,.6)'; ctx.lineWidth = 1.2;
      var ph = (t * 1.5) % 1;
      ctx.beginPath(); ctx.arc(w * 0.5, 0, s * (0.3 + ph * 0.8), -0.9, 0.9); ctx.globalAlpha = 1 - ph; ctx.stroke();
    }
    ctx.restore();
  }
  function drawSpin(ctx, b) {
    var s = view.s, d = roundBox(ctx, b, s * 0.1);
    ctx.fillStyle = '#c8962e'; ctx.fill(); ctx.strokeStyle = '#5a3a0c'; ctx.lineWidth = Math.max(1, s * 0.05); ctx.stroke();
    ctx.fillStyle = '#5a3a0c'; ctx.beginPath(); ctx.arc(0, 0, s * 0.16, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#ffd36b'; ctx.beginPath(); ctx.arc(0, 0, s * 0.07, 0, 6.283); ctx.fill();
    void d; ctx.restore();
  }
  function drawBall(ctx, b, t) {
    var s = view.s, r = b.r * s, x = X(b.x), y = Y(b.y);
    if (b.kind === 'bell') {
      var g = ctx.createRadialGradient(x - r * 0.35, y - r * 0.4, r * 0.1, x, y, r); g.addColorStop(0, '#fff2b0'); g.addColorStop(0.5, '#e8b83a'); g.addColorStop(1, '#9a6a10');
      ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
      ctx.strokeStyle = '#5a3a08'; ctx.lineWidth = Math.max(1, s * 0.04); ctx.stroke();
      ctx.save(); ctx.translate(x, y); ctx.rotate(-b.a);
      ctx.strokeStyle = '#5a3a08'; ctx.lineWidth = Math.max(1, s * 0.05);
      ctx.beginPath(); ctx.moveTo(-r * 0.8, 0); ctx.lineTo(r * 0.8, 0); ctx.stroke();
      ctx.fillStyle = '#3a2404'; ctx.beginPath(); ctx.arc(0, r * 0.45, r * 0.16, 0, 6.283); ctx.fill();
      ctx.restore();
      return;
    }
    ctx.fillStyle = '#e86a8a'; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.fill();
    ctx.save(); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.clip();
    ctx.translate(x, y); ctx.rotate(-b.a);
    ctx.strokeStyle = '#b8385a'; ctx.lineWidth = Math.max(1, s * 0.035);
    for (var i = -2; i <= 2; i++) { ctx.beginPath(); ctx.ellipse(i * r * 0.3, 0, r * 0.35, r * 1.1, 0.5, 0, 6.283); ctx.stroke(); }
    ctx.strokeStyle = '#ffb0c4';
    for (var k = -1; k <= 1; k++) { ctx.beginPath(); ctx.ellipse(0, k * r * 0.4, r * 1.1, r * 0.3, -0.3, 0, 6.283); ctx.stroke(); }
    ctx.restore();
    ctx.fillStyle = 'rgba(255,255,255,.3)'; ctx.beginPath(); ctx.arc(x - r * 0.35, y - r * 0.35, r * 0.25, 0, 6.283); ctx.fill();
    ctx.strokeStyle = '#7a2038'; ctx.lineWidth = Math.max(1, s * 0.04); ctx.beginPath(); ctx.arc(x, y, r, 0, 6.283); ctx.stroke();
  }
  function drawGear(ctx, x, y, r, a, alpha) {
    ctx.save(); ctx.translate(x, y); ctx.rotate(a); ctx.globalAlpha = alpha == null ? 1 : alpha;
    ctx.fillStyle = '#e0a834'; ctx.strokeStyle = '#6a440c'; ctx.lineWidth = Math.max(1, r * 0.12);
    ctx.beginPath();
    var n = 8;
    for (var i = 0; i < n * 2; i++) { var a0 = i * Math.PI / n, ro = i % 2 ? r * 0.78 : r; ctx.lineTo(Math.cos(a0 - 0.18) * ro, Math.sin(a0 - 0.18) * ro); ctx.lineTo(Math.cos(a0 + 0.18) * ro, Math.sin(a0 + 0.18) * ro); }
    ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.fillStyle = '#fff0b8'; ctx.beginPath(); ctx.arc(-r * 0.2, -r * 0.2, r * 0.18, 0, 6.283); ctx.fill();
    ctx.fillStyle = '#6a440c'; ctx.beginPath(); ctx.arc(0, 0, r * 0.25, 0, 6.283); ctx.fill();
    ctx.restore();
  }
  function drawRope(ctx, S, rp) {
    var at = rp.b.toWorld(rp.la[0], rp.la[1]);
    var x1 = X(rp.ax), y1 = Y(rp.ay), x2 = X(at[0]), y2 = Y(at[1]);
    var d = Math.sqrt((at[0] - rp.ax) * (at[0] - rp.ax) + (at[1] - rp.ay) * (at[1] - rp.ay)), slack = Math.max(0, rp.len - d) * view.s;
    ctx.strokeStyle = '#8a6a40'; ctx.lineWidth = Math.max(1.5, view.s * 0.06); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x1, y1); ctx.quadraticCurveTo((x1 + x2) / 2, (y1 + y2) / 2 + slack * 0.7, x2, y2); ctx.stroke();
    ctx.fillStyle = '#c8962e'; ctx.strokeStyle = '#5a3a0c'; ctx.lineWidth = 1;
    ctx.beginPath(); ctx.arc(x1, y1, Math.max(3, view.s * 0.1), 0, 6.283); ctx.fill(); ctx.stroke();
  }
  function drawHolder(ctx, b) { // the brass clip that holds the ball before the start
    var s = view.s, x = X(b.x), y = Y(b.y) - b.r * s;
    ctx.save();
    ctx.strokeStyle = '#a8803a'; ctx.lineWidth = Math.max(1.5, s * 0.06); ctx.lineCap = 'round';
    ctx.beginPath(); ctx.moveTo(x, y - s * 0.12); ctx.lineTo(x, y - s * 0.45); ctx.stroke();
    ctx.beginPath(); ctx.arc(x, y + s * 0.02, s * 0.16, Math.PI * 1.15, Math.PI * 1.85); ctx.stroke();
    ctx.restore();
  }

  // ---------------------------------------------------------------- one frame
  // o: { S, t, running, done, sel (part index), bad (part index drawn red), ghost: [{ t, x, y, a }], grid, squash: { bodyId: 0..1 }, fx: [...] }
  function frame(ctx, o) {
    var S = o.S, t = o.t;
    ctx.setTransform(view.dpr, 0, 0, view.dpr, 0, 0);
    buildStatic(S, o.grid);
    ctx.drawImage(stat, 0, 0, view.W, view.H);
    var bs = S.W.bodies, i;
    // wind behind everything
    for (i = 0; i < bs.length; i++) if (bs[i].tag === 'fan') windZone(ctx, bs[i], t, o.running ? 1 : 0.55);
    if (S.ropes) for (i = 0; i < S.ropes.length; i++) drawRope(ctx, S, S.ropes[i]);
    // gears
    for (i = 0; i < S.gears.length; i++) {
      var G = S.gears[i], gr = PE.GEAR_R * view.s;
      if (G.got) { var k = Math.min(1, (S.t - G.at) / 0.5); if (k < 1) drawGear(ctx, X(G.x), Y(G.y) - k * view.s * 0.8, gr * (1 + k * 0.6), t * 6, 1 - k); }
      else drawGear(ctx, X(G.x), Y(G.y), gr, t * 0.8 + i, 1);
    }
    // the cat behind the basket front
    drawCat(ctx, S.level.goal, t, o.done === 1 ? 1 : 0);
    // ghosts (tutorial)
    if (o.ghost) o.ghost.forEach(function (g) {
      var gb = PE.partShapes(g.t, g.x, g.y, g.a).map(function (q) { return new PE.Body(q, 900); });
      ctx.save(); ctx.globalAlpha = 0.7 + 0.3 * Math.sin(t * 4);
      gb.forEach(function (b) { if (b.circle) { ctx.beginPath(); ctx.arc(X(b.x), Y(b.y), b.r * view.s, 0, 6.283); } else polyPath(ctx, b); ctx.fillStyle = 'rgba(242,160,40,.35)'; ctx.fill(); ctx.strokeStyle = dark ? '#ffd36b' : '#c0650a'; ctx.setLineDash([7, 4]); ctx.lineWidth = 3; ctx.stroke(); ctx.setLineDash([]); });
      ctx.restore();
    });
    // bodies: fixed dynamic things and parts, then balls
    for (i = 0; i < bs.length; i++) {
      var b = bs[i];
      if (b.sensor || b.tag === 'ball' || b.tag === 'goal' || b.tag === 'wall' || b.tag === 'ice' || b.tag === 'rubber' || b.tag === 'ground') continue;
      if (b.type === PE.STATIC && b.fixed && b.part == null && !PE.PARTS[b.tag]) continue;
      drawBody(ctx, b, t, { running: o.running, squash: o.squash && o.squash[b.id], field: !o.running && b.part === o.sel });
      if (b.part != null && (b.part === o.sel || b.part === o.bad) && b.tag !== 'lip') outline(ctx, b, b.part === o.bad ? '#ff5a4a' : '#ffd36b');
    }
    drawGoalFront(ctx, S.level.goal);
    for (i = 0; i < S.balls.length; i++) {
      var B = S.balls[i];
      if (B.out) continue;
      drawBall(ctx, B, t);
      if (!o.running && !o.done) drawHolder(ctx, B);
    }
    if (o.fx) drawFx(ctx, o.fx, t);
  }
  function outline(ctx, b, col) {
    ctx.save(); ctx.strokeStyle = col; ctx.lineWidth = 3; ctx.shadowColor = col; ctx.shadowBlur = 8;
    if (b.circle) { ctx.beginPath(); ctx.arc(X(b.x), Y(b.y), b.r * view.s + 3, 0, 6.283); }
    else polyPath(ctx, b);
    ctx.stroke(); ctx.restore();
  }
  function drawFx(ctx, fx, t) {
    for (var i = 0; i < fx.length; i++) {
      var f = fx[i], k = (t - f.t0) / f.d;
      if (k < 0 || k > 1) continue;
      ctx.save(); ctx.globalAlpha = 1 - k;
      if (f.k === 'puff') { ctx.strokeStyle = f.c || '#fff3d0'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(X(f.x), Y(f.y), view.s * (0.2 + k * 0.7), 0, 6.283); ctx.stroke(); }
      else if (f.k === 'confetti') {
        for (var j = 0; j < 26; j++) {
          var a = hashN(j * 17 + f.seed) * 6.283, sp = 2 + hashN(j * 5 + 3) * 4, x = f.x + Math.cos(a) * sp * k, y = f.y + Math.sin(a) * sp * k + 3 * k - 6 * k * k;
          ctx.fillStyle = ['#ffcf4a', '#e86a8a', '#7fc8f0', '#94d98a', '#f2b33d'][j % 5];
          ctx.save(); ctx.translate(X(x), Y(y)); ctx.rotate(k * 10 + j); ctx.fillRect(-3, -2, 6, 4); ctx.restore();
        }
      }
      ctx.restore();
    }
  }

  // ---------------------------------------------------------------- icons for the tray (small canvases → data URLs)
  var iconCache = {};
  function partIcon(t, px) {
    px = px || 48;
    var key = t + ':' + px + ':' + dark;
    if (iconCache[key]) return iconCache[key];
    var c = document.createElement('canvas'), dpr = 2; c.width = px * dpr; c.height = px * dpr;
    var ctx = c.getContext('2d');
    var D = PE.PARTS[t], ext = D.r != null ? D.r * 2.5 : Math.max(D.w, D.h) * 1.15 + 0.12;
    var saved = view;
    view = { W: px, H: px, dpr: dpr, s: px / ext, ox: px / 2, oy: px / 2 - PE.BH * (px / ext) };
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var a = t === 'fan' || t === 'magnet' ? 0 : t === 'domino' ? -60 : -12;
    var sh = PE.partShapes(t, 0, 0, a);
    var bodies = sh.map(function (q, i) { return new PE.Body(q, 800 + i); });
    bodies.forEach(function (b) { b.tag = q2(b, sh); drawBody(ctx, b, 0.3, {}); });
    view = saved;
    return (iconCache[key] = c.toDataURL());
  }
  function q2(b) { return b.tag; }
  // a level's miniature (level select)
  function levelThumb(canvas, S) {
    var ctx = canvas.getContext('2d'), w = canvas.width, h = canvas.height;
    var saved = view, savedStat = stat, savedKey = statKey;
    view = { W: w, H: h, dpr: 1, s: Math.min(w, h) / PE.BW, ox: (w - Math.min(w, h)) / 2, oy: (h - Math.min(w, h)) / 2 };
    stat = null; statKey = '';
    frame(ctx, { S: S, t: 0.5, running: false, done: 0, grid: false });
    view = saved; stat = savedStat; statKey = savedKey;
  }

  root.PhysicsArt = {
    init: function (o) { PE = o.PE; T = o.T || T; reduced = o.reduced || reduced; },
    resize: resize, setTheme: setTheme, frame: frame, partIcon: partIcon, levelThumb: levelThumb, drawGear: drawGear,
    invalidate: function () { statKey = ''; },
    view: function () { return view; },
  };
})(typeof window !== 'undefined' ? window : globalThis);
