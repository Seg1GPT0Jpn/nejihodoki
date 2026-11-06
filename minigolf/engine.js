// ころがし工房ゴルフ（minigolf）：決まった結果になるミニゴルフの物理（ブラウザでも node でも動く）
// ---------------------------------------------------------------------------------
// 上から見た2Dの球。座標は「マス」（1マス＝コースの1単位）で、y は下向き。1/60秒の固定刻みを4つに分けて進める。
// 結果がいつも同じになるように：sin/cos は自前の多項式（dsin/dcos）、Math.hypot・Math.atan2・乱数は使わない。
// 打つ向き（度。0＝右、90＝下、-90＝上）と強さ（0〜1）は、ここで 1/20度・1/1000 に丸めてから使う。
//
//   const G = MinigolfEngine.create(hole)    hole は minigolf/holes.js の1件
//   G.step()                                 1刻み（1/60秒）。止まっている球も、動く障害物（歯車・定規）に押されると動き出す
//   G.canShoot() / G.shoot(angleDeg, power)  止まっているときだけ打てる。打数が1つ増える
//   G.st                                     'rest' | 'roll' | 'pipe' | 'sunk'（カップイン）| 'over'（打数の上限）
//   G.events / G.evN                         最近の出来事 { k, t, a }（k: shot, wall, bump, hit, pipe, out, ink, cup, rest, over, sand）
//   G.snap() / MinigolfEngine.restore(hole, snap)   止まっているときの状態（自動保存）
//   MinigolfEngine.play(hole, shots)         [[待つ刻み, 角度, 強さ], …] を流して { sunk, strokes, ticks, hash, … }（テストと答えの確認）
(function (root) {
  'use strict';

  var DT = 1 / 60, SUB = 4, H = DT / SUB;
  var BALL_R = 0.17, CUP_R = 0.27, VMAX = 11;
  var FR = 1.6, DRAG = 0.3;              // フェルト：一定の減速（マス/秒²）と速さに比べた減速（1/秒）
  var FR_SAND = 8, DRAG_SAND = 2.4;      // おがくず
  var E_WALL = 0.72, E_POST = 0.62, E_MOVE = 0.75, E_BUMP = 1.1, BUMP_MIN = 3.6, TAN_KEEP = 0.97;
  var SINK_V = 4.4;                      // これより遅くカップに来たら入る
  var REST_V = 0.07, REST_TICKS = 12, MAX_ROLL = 60 * 25, PIPE_TICKS = 24, PIPE_MIN = 3;
  var GEAR_HUB = 0.32, GEAR_TH = 0.09, RULER_TH = 0.12;
  var PI = 3.141592653589793, TAU = 6.283185307179586, HALF = 1.5707963267948966, DEG = PI / 180;

  // ---------- 自前の sin / cos（範囲を [-π/2, π/2] に寄せて、テイラー展開を17次まで） ----------
  function dsin(x) {
    var k = Math.round(x / TAU); x = x - k * TAU;
    if (x > HALF) x = PI - x; else if (x < -HALF) x = -PI - x;
    var x2 = x * x;
    return x * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110 * (1 - x2 / 156 * (1 - x2 / 210 * (1 - x2 / 272))))))));
  }
  function dcos(x) { return dsin(x + HALF); }
  var qa = function (a) { return Math.round(Number(a) * 20) / 20; };
  var qp = function (p) { return Math.max(0, Math.min(1, Math.round(Number(p) * 1000) / 1000)); };

  // ---------- 形 ----------
  function inPoly(P, x, y) {
    var c = false;
    for (var i = 0, j = P.length - 1; i < P.length; j = i++) {
      var xi = P[i][0], yi = P[i][1], xj = P[j][0], yj = P[j][1];
      if ((yi > y) !== (yj > y) && x < (xj - xi) * (y - yi) / (yj - yi) + xi) c = !c;
    }
    return c;
  }
  function seg(ax, ay, bx, by) { var dx = bx - ax, dy = by - ay; return { ax: ax, ay: ay, bx: bx, by: by, dx: dx, dy: dy, l2: dx * dx + dy * dy }; }
  function edges(P, closed, out) {
    var n = P.length;
    for (var i = 0; i < (closed ? n : n - 1); i++) { var a = P[i], b = P[(i + 1) % n]; out.push(seg(a[0], a[1], b[0], b[1])); }
  }
  function bbox(P) {
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < P.length; i++) { x0 = Math.min(x0, P[i][0]); y0 = Math.min(y0, P[i][1]); x1 = Math.max(x1, P[i][0]); y1 = Math.max(y1, P[i][1]); }
    return { x0: x0, y0: y0, x1: x1, y1: y1 };
  }
  // ホールの形を、当たり判定に使う形に直す（何度呼んでも同じ。結果は hole に覚えておく）
  function prep(hole) {
    if (hole._p) return hole._p;
    var walls = [];
    edges(hole.poly, true, walls);
    (hole.blocks || []).forEach(function (b) { edges(b, true, walls); });
    (hole.walls || []).forEach(function (w) { edges(w, false, walls); });
    var rulers = (hole.rulers || []).map(function (r) {
      var a = (r.ang || 0) * DEG;
      return { ax: r.a[0], ay: r.a[1], bx: r.b[0], by: r.b[1], hx: dcos(a) * r.len / 2, hy: dsin(a) * r.len / 2, per: r.per, ph: r.ph || 0, len: r.len, ang: r.ang || 0 };
    });
    var gears = (hole.gears || []).map(function (g) { return { x: g.x, y: g.y, r: g.r, n: g.arms || 4, w: g.w, ph: g.ph || 0 }; });
    var p = {
      walls: walls, rulers: rulers, gears: gears,
      posts: (hole.posts || []).map(function (q) { return { x: q[0], y: q[1], r: q[2] }; }),
      bumpers: (hole.bumpers || []).map(function (q) { return { x: q[0], y: q[1], r: q[2] }; }),
      pipes: (hole.pipes || []).map(function (q) { var d = q.d * DEG; return { ax: q.a[0], ay: q.a[1], bx: q.b[0], by: q.b[1], ux: dcos(d), uy: dsin(d), d: q.d }; }),
      sand: hole.sand || [], ink: hole.ink || [], slopes: (hole.slopes || []).map(function (s) { return { p: s.p, gx: s.g[0], gy: s.g[1], bb: bbox(s.p) }; }),
      bb: bbox(hole.poly),
    };
    p.sandBB = p.sand.map(bbox); p.inkBB = p.ink.map(bbox);
    Object.defineProperty(hole, '_p', { value: p, enumerable: false, configurable: true });
    return p;
  }
  var inBB = function (b, x, y) { return x >= b.x0 && x <= b.x1 && y >= b.y0 && y <= b.y1; };

  // 動く障害物の、時刻 t（秒）の位置
  function rulerAt(r, t) {
    var u = TAU * (t / r.per + r.ph);
    var s = (1 - dcos(u)) / 2, ds = (TAU / r.per) * dsin(u) / 2;
    var cx = r.ax + (r.bx - r.ax) * s, cy = r.ay + (r.by - r.ay) * s;
    return { cx: cx, cy: cy, x1: cx - r.hx, y1: cy - r.hy, x2: cx + r.hx, y2: cy + r.hy, vx: (r.bx - r.ax) * ds, vy: (r.by - r.ay) * ds };
  }
  function gearAngle(g, t) { return g.ph + g.w * t; }
  function gearArms(g, t) {
    var out = [], th = gearAngle(g, t);
    for (var k = 0; k < g.n; k++) { var a = th + k * TAU / g.n; out.push({ x: g.x + dcos(a) * g.r, y: g.y + dsin(a) * g.r }); }
    return out;
  }

  // ---------- 1回のゲーム（1ホール） ----------
  function Game(hole) {
    this.hole = hole; this.P = prep(hole);
    this.par = hole.par; this.limit = hole.par + 4;
    this.tick = 0; this.x = hole.tee[0]; this.y = hole.tee[1]; this.vx = 0; this.vy = 0;
    this.st = 'rest'; this.strokes = 0; this.pen = 0; this.lx = this.x; this.ly = this.y;
    this.slow = 0; this.roll = 0; this.pipeT = 0; this.pipeI = -1; this.pipeV = 0; this.touch = false; this.lip = false;
    this.events = []; this.evN = 0; this.shots = []; this.bumpI = -1;
  }
  Game.prototype.ev = function (k, a) { this.events.push({ k: k, t: this.tick, a: a == null ? 0 : a }); this.evN++; if (this.events.length > 64) this.events.shift(); };
  Game.prototype.canShoot = function () { return this.st === 'rest'; };
  Game.prototype.done = function () { return this.st === 'sunk' || this.st === 'over'; };
  Game.prototype.shoot = function (a, p) {
    if (this.st !== 'rest') return false;
    a = qa(a); p = qp(p);
    if (!(p > 0)) return false;
    this.strokes++; this.lx = this.x; this.ly = this.y;
    var v = p * VMAX, r = a * DEG;
    this.vx = dcos(r) * v; this.vy = dsin(r) * v;
    this.st = 'roll'; this.slow = 0; this.roll = 0; this.lip = false;
    this.shots.push([this.tick, a, p]);
    this.ev('shot', p);
    return true;
  };
  // 地面：{ fr, dr, gx, gy, sand }
  Game.prototype.ground = function (x, y) {
    var P = this.P, sand = false, gx = 0, gy = 0;
    for (var i = 0; i < P.sand.length; i++) if (inBB(P.sandBB[i], x, y) && inPoly(P.sand[i], x, y)) { sand = true; break; }
    for (var j = 0; j < P.slopes.length; j++) { var s = P.slopes[j]; if (inBB(s.bb, x, y) && inPoly(s.p, x, y)) { gx += s.gx; gy += s.gy; } }
    return { sand: sand, gx: gx, gy: gy };
  };
  // 線分（太さ th）との当たり。sv = 線分の上の点の速さ（動く障害物）
  Game.prototype.hitSeg = function (ax, ay, dx, dy, l2, th, e, svx, svy) {
    var px = this.x - ax, py = this.y - ay;
    var u = l2 > 0 ? (px * dx + py * dy) / l2 : 0;
    if (u < 0) u = 0; else if (u > 1) u = 1;
    var cx = ax + dx * u, cy = ay + dy * u;
    var nx = this.x - cx, ny = this.y - cy, d2 = nx * nx + ny * ny, R = BALL_R + th;
    if (d2 >= R * R || d2 === 0) return false;
    var d = Math.sqrt(d2); nx /= d; ny /= d;
    this.x = cx + nx * R; this.y = cy + ny * R;
    var rvx = this.vx - svx, rvy = this.vy - svy, vn = rvx * nx + rvy * ny;
    if (vn < 0) {
      var tx = rvx - vn * nx, ty = rvy - vn * ny;
      rvx = tx * TAN_KEEP - e * vn * nx; rvy = ty * TAN_KEEP - e * vn * ny;
      this.vx = rvx + svx; this.vy = rvy + svy;
      return -vn;
    }
    return 0.0001;
  };
  Game.prototype.hitCircle = function (cx, cy, r, e) {
    var nx = this.x - cx, ny = this.y - cy, d2 = nx * nx + ny * ny, R = BALL_R + r;
    if (d2 >= R * R || d2 === 0) return false;
    var d = Math.sqrt(d2); nx /= d; ny /= d;
    this.x = cx + nx * R; this.y = cy + ny * R;
    var vn = this.vx * nx + this.vy * ny;
    if (vn < 0) { this.vx -= (1 + e) * vn * nx; this.vy -= (1 + e) * vn * ny; return { vn: -vn, nx: nx, ny: ny }; }
    return { vn: 0, nx: nx, ny: ny };
  };
  // 動く障害物（止まっている球も押す）。戻り値：当たったら true
  Game.prototype.movers = function (t) {
    var P = this.P, hit = false, i, k;
    for (i = 0; i < P.gears.length; i++) {
      var g = P.gears[i];
      var ddx = this.x - g.x, ddy = this.y - g.y, reach = g.r + BALL_R + GEAR_TH;
      if (ddx * ddx + ddy * ddy > reach * reach) continue;
      var tips = gearArms(g, t);
      for (k = 0; k < tips.length; k++) {
        var tx = tips[k].x - g.x, ty = tips[k].y - g.y;
        var px = this.x - g.x, py = this.y - g.y, l2 = tx * tx + ty * ty;
        var u = (px * tx + py * ty) / l2; if (u < 0) u = 0; else if (u > 1) u = 1;
        var cx = g.x + tx * u, cy = g.y + ty * u;
        // 腕の上の点の速さ：ω × r
        var svx = -g.w * (cy - g.y), svy = g.w * (cx - g.x);
        var r = this.hitSeg(g.x, g.y, tx, ty, l2, GEAR_TH, E_MOVE, svx, svy);
        if (r) { hit = true; if (r > 0.6) this.ev('hit', 0); }
      }
      var hc = this.hitCircle(g.x, g.y, GEAR_HUB, E_POST);
      if (hc) { hit = true; if (hc.vn > 0.6) this.ev('wall', hc.vn); }
    }
    for (i = 0; i < P.rulers.length; i++) {
      var R = rulerAt(P.rulers[i], t);
      var r2 = this.hitSeg(R.x1, R.y1, R.x2 - R.x1, R.y2 - R.y1, (R.x2 - R.x1) * (R.x2 - R.x1) + (R.y2 - R.y1) * (R.y2 - R.y1), RULER_TH, E_MOVE, R.vx, R.vy);
      if (r2) { hit = true; if (r2 > 0.6) this.ev('hit', 1); }
    }
    return hit;
  };
  Game.prototype.statics = function () {
    var P = this.P, hit = false, i, r;
    for (i = 0; i < P.walls.length; i++) {
      var w = P.walls[i];
      r = this.hitSeg(w.ax, w.ay, w.dx, w.dy, w.l2, 0, E_WALL, 0, 0);
      if (r) { hit = true; if (r > 0.8) this.ev('wall', r); }
    }
    for (i = 0; i < P.posts.length; i++) {
      var q = P.posts[i], c = this.hitCircle(q.x, q.y, q.r, E_POST);
      if (c) { hit = true; if (c.vn > 0.8) this.ev('wall', c.vn); }
    }
    for (i = 0; i < P.bumpers.length; i++) {
      var b = P.bumpers[i], h = this.hitCircle(b.x, b.y, b.r, E_BUMP);
      if (h) {
        hit = true;
        var out = this.vx * h.nx + this.vy * h.ny;
        if (out < BUMP_MIN) { this.vx += (BUMP_MIN - out) * h.nx; this.vy += (BUMP_MIN - out) * h.ny; }
        if (this.bumpI !== i) this.ev('bump', i);
        this.bumpI = i;
      }
    }
    return hit;
  };
  // 外に出た・ブロックの中に入った（動く障害物に押し込まれたとき）→ 打つ前の場所に戻す（罰打なし）
  Game.prototype.lost = function () {
    var P = this.P;
    if (!inPoly(this.hole.poly, this.x, this.y)) return true;
    var bl = this.hole.blocks || [];
    for (var i = 0; i < bl.length; i++) if (inPoly(bl[i], this.x, this.y)) return true;
    return false;
  };
  Game.prototype.toRest = function (x, y) { this.x = x; this.y = y; this.vx = 0; this.vy = 0; this.st = 'rest'; this.slow = 0; };
  Game.prototype.afterRest = function () {
    this.ev('rest', this.strokes);
    if (this.strokes >= this.limit) { this.st = 'over'; this.ev('over', this.strokes); }
  };
  Game.prototype.step = function () {
    var t0 = this.tick * DT;
    this.tick++;
    if (this.st === 'sunk' || this.st === 'over') return;
    if (this.st === 'pipe') {
      if (--this.pipeT > 0) return;
      var pp = this.P.pipes[this.pipeI], sp0 = Math.max(this.pipeV * 0.8, PIPE_MIN);
      this.x = pp.bx; this.y = pp.by; this.vx = pp.ux * sp0; this.vy = pp.uy * sp0;
      this.st = 'roll'; this.ev('pipe', 1);
    }
    var P = this.P, touched = false;
    for (var s = 0; s < SUB; s++) {
      var t = t0 + (s + 1) * H;
      if (this.st === 'rest') {
        // 止まっている球：動く障害物に押されたときと、坂で支えがないときだけ動き出す
        if (P.gears.length || P.rulers.length) {
          if (this.movers(t)) { this.st = 'roll'; this.slow = 0; this.roll = 0; }
        }
        if (this.st === 'rest') continue;
      }
      var gr = this.ground(this.x, this.y);
      var fr = gr.sand ? FR_SAND : FR, dr = gr.sand ? DRAG_SAND : DRAG;
      this.vx += gr.gx * H; this.vy += gr.gy * H;
      var sp = Math.sqrt(this.vx * this.vx + this.vy * this.vy), dec = (fr + dr * sp) * H;
      if (sp <= dec) { this.vx = 0; this.vy = 0; } else { var f = (sp - dec) / sp; this.vx *= f; this.vy *= f; }
      this.x += this.vx * H; this.y += this.vy * H;
      if (this.statics()) touched = true;
      if ((P.gears.length || P.rulers.length) && this.movers(t)) touched = true;
      if (this.lost()) { this.ev('out', 0); this.toRest(this.lx, this.ly); this.afterRest(); return; }
      // パイプの入り口
      for (var pi = 0; pi < P.pipes.length; pi++) {
        var pq = P.pipes[pi], ex = this.x - pq.ax, ey = this.y - pq.ay;
        if (ex * ex + ey * ey < 0.3 * 0.3) {
          this.pipeV = Math.sqrt(this.vx * this.vx + this.vy * this.vy); this.pipeI = pi; this.pipeT = PIPE_TICKS;
          this.x = pq.ax; this.y = pq.ay; this.vx = 0; this.vy = 0; this.st = 'pipe'; this.ev('pipe', 0);
          return;
        }
      }
      // インク（罰打1。打つ前の場所へ）
      for (var ii = 0; ii < P.ink.length; ii++) {
        if (inBB(P.inkBB[ii], this.x, this.y) && inPoly(P.ink[ii], this.x, this.y)) {
          var ix = this.x, iy = this.y;
          this.strokes++; this.pen++; this.ev('ink', 0); this.events[this.events.length - 1].x = ix; this.events[this.events.length - 1].y = iy;
          this.toRest(this.lx, this.ly); this.afterRest(); return;
        }
      }
      // カップ
      var cx = this.x - this.hole.cup[0], cy = this.y - this.hole.cup[1], c2 = cx * cx + cy * cy;
      if (c2 < CUP_R * CUP_R) {
        var v2 = this.vx * this.vx + this.vy * this.vy;
        if (v2 < SINK_V * SINK_V) { this.x = this.hole.cup[0]; this.y = this.hole.cup[1]; this.vx = 0; this.vy = 0; this.st = 'sunk'; this.ev('cup', this.strokes); return; }
        if (!this.lip) { this.lip = true; this.vx *= 0.82; this.vy *= 0.82; this.ev('lip', 0); }
      } else if (c2 > (CUP_R + BALL_R) * (CUP_R + BALL_R)) this.lip = false;
      if (this.bumpI >= 0) { var bq = P.bumpers[this.bumpI], bx = this.x - bq.x, by = this.y - bq.y, br = bq.r + BALL_R + 0.05; if (bx * bx + by * by > br * br) this.bumpI = -1; }
    }
    if (this.st !== 'roll') return;
    this.roll++;
    var spd = Math.sqrt(this.vx * this.vx + this.vy * this.vy);
    if (spd < REST_V) this.slow++; else this.slow = 0;
    var g = this.ground(this.x, this.y), gm2 = g.gx * g.gx + g.gy * g.gy, frr = g.sand ? FR_SAND : FR;
    if ((this.slow >= REST_TICKS && (gm2 <= frr * frr || touched)) || this.roll > MAX_ROLL) { this.toRest(this.x, this.y); this.afterRest(); }
  };
  // 止まっているときの状態（自動保存）
  Game.prototype.snap = function () { return { v: 1, tick: this.tick, x: this.x, y: this.y, strokes: this.strokes, pen: this.pen, lx: this.lx, ly: this.ly }; };
  Game.prototype.hash = function () {
    var s = [this.tick, this.x, this.y, this.vx, this.vy, this.strokes, this.st].join('|'), h = 2166136261;
    for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    return h.toString(16);
  };
  // 描くための、時刻の動く障害物
  Game.prototype.time = function () { return this.tick * DT; };

  function create(hole) { return new Game(hole); }
  function restore(hole, sn) {
    var G = new Game(hole);
    if (!sn || typeof sn !== 'object') return G;
    var num = function (v, d) { v = Number(v); return isFinite(v) ? v : d; };
    G.tick = Math.max(0, Math.floor(num(sn.tick, 0)));
    G.x = num(sn.x, G.x); G.y = num(sn.y, G.y); G.lx = num(sn.lx, G.x); G.ly = num(sn.ly, G.y);
    G.strokes = Math.max(0, Math.floor(num(sn.strokes, 0))); G.pen = Math.max(0, Math.floor(num(sn.pen, 0)));
    if (G.lost()) { G.x = hole.tee[0]; G.y = hole.tee[1]; G.lx = G.x; G.ly = G.y; }
    if (G.strokes >= G.limit) G.st = 'over';
    return G;
  }
  // 止まるまで（カップイン・上限・止まる）進める。戻り値：進めた刻み
  function settle(G, max) {
    var n = 0; max = max || 60 * 40;
    while ((G.st === 'roll' || G.st === 'pipe') && n < max) { G.step(); n++; }
    return n;
  }
  // 打つ手の列を流す：[[待つ刻み, 角度, 強さ], …]（待つ刻み＝球が止まってから打つまで。動く障害物のタイミング）
  function play(hole, shots, o) {
    o = o || {};
    var G = o.snap ? restore(hole, o.snap) : create(hole);
    for (var i = 0; i < shots.length; i++) {
      settle(G);
      if (G.done()) break;
      var w = Math.max(0, Math.floor(shots[i][0] || 0));
      for (var k = 0; k < w; k++) G.step();
      settle(G);
      if (G.done()) break;
      G.shoot(shots[i][1], shots[i][2]);
    }
    settle(G);
    return { sunk: G.st === 'sunk', over: G.st === 'over', st: G.st, strokes: G.strokes, pen: G.pen, ticks: G.tick, x: G.x, y: G.y, hash: G.hash(), G: o.keep ? G : undefined };
  }
  // 打数の名前（バーディーなど）。d = 打数 − パー
  function scoreName(strokes, par) {
    if (strokes === 1) return 'ace';
    var d = strokes - par;
    return d <= -3 ? 'albatross' : d === -2 ? 'eagle' : d === -1 ? 'birdie' : d === 0 ? 'par' : d === 1 ? 'bogey' : d === 2 ? 'double' : 'over';
  }

  var api = {
    DT: DT, SUB: SUB, BALL_R: BALL_R, CUP_R: CUP_R, VMAX: VMAX, SINK_V: SINK_V, GEAR_HUB: GEAR_HUB, GEAR_TH: GEAR_TH, RULER_TH: RULER_TH,
    dsin: dsin, dcos: dcos, qa: qa, qp: qp, inPoly: inPoly, bbox: bbox, prep: prep,
    rulerAt: rulerAt, gearAngle: gearAngle, gearArms: gearArms,
    create: create, restore: restore, settle: settle, play: play, scoreName: scoreName, Game: Game,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.MinigolfEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
