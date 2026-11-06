// ころころ工房 — a small deterministic 2D rigid-body engine and the puzzle rules on top of it.
// Runs in the page (window.PhysicsEngine) and in node (require('physics/engine.js')) for the level solver test.
//
// Determinism: a fixed time step (DT = 1/60 s), bodies, contacts and joints are always visited in the same order, and the
// simulation only uses + − × ÷ and Math.sqrt (exactly rounded by IEEE 754). Math.sin / cos / atan2 / hypot / exp are not
// used inside the simulation (they may differ between browsers), so sin and cos are our own polynomials (dsin / dcos).
// The same level + the same parts → the same result on every device and every run.
//
// Physics: circles and convex polygons; sequential impulses with warm starting (Box2D-lite style), Baumgarte position
// bias with slop, speculative contacts (no tunnelling at the speeds the puzzles reach), restitution above a threshold,
// Coulomb friction with conveyor surface speed, pin (revolute) joints and ropes (max distance), island sleeping.
// Gadgets: launch pads (springs), wind zones (fans), magnets (attract metal), buoyancy (balloons), spinning paddles.
(function (root) {
  'use strict';

  var DT = 1 / 60;
  var PI = 3.141592653589793, HALF_PI = PI / 2, TWO_PI = PI * 2;
  var DEG = PI / 180;
  // Taylor coefficients (computed once with exact IEEE division)
  var S3 = -1 / 6, S5 = 1 / 120, S7 = -1 / 5040, S9 = 1 / 362880, S11 = -1 / 39916800, S13 = 1 / 6227020800, S15 = -1 / 1307674368000;
  function dsin(x) {
    x = x - TWO_PI * Math.floor((x + PI) / TWO_PI);           // → [−π, π)
    if (x > HALF_PI) x = PI - x; else if (x < -HALF_PI) x = -PI - x; // → [−π/2, π/2]
    var x2 = x * x;
    return x * (1 + x2 * (S3 + x2 * (S5 + x2 * (S7 + x2 * (S9 + x2 * (S11 + x2 * (S13 + x2 * S15)))))));
  }
  function dcos(x) { return dsin(x + HALF_PI); }

  // ------------------------------------------------------------------ bodies
  var STATIC = 0, DYNAMIC = 1, KINEMATIC = 2;
  function polyMass(v, density) { // v: local verts [x0,y0,...] around the centroid
    var n = v.length / 2, area = 0, I = 0;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n, x1 = v[2 * i], y1 = v[2 * i + 1], x2 = v[2 * j], y2 = v[2 * j + 1];
      var cr = x1 * y2 - x2 * y1;
      area += cr * 0.5;
      I += cr * (x1 * x1 + x1 * x2 + x2 * x2 + y1 * y1 + y1 * y2 + y2 * y2) / 12;
    }
    return { m: area * density, I: I * density, area: area };
  }
  function centroid(pts) { // pts [x,y,...] CCW → { cx, cy }
    var n = pts.length / 2, a = 0, cx = 0, cy = 0;
    for (var i = 0; i < n; i++) {
      var j = (i + 1) % n, x1 = pts[2 * i], y1 = pts[2 * i + 1], x2 = pts[2 * j], y2 = pts[2 * j + 1];
      var cr = x1 * y2 - x2 * y1; a += cr; cx += (x1 + x2) * cr; cy += (y1 + y2) * cr;
    }
    return { cx: cx / (3 * a), cy: cy / (3 * a) };
  }
  function makeCCW(pts) {
    var n = pts.length / 2, a = 0;
    for (var i = 0; i < n; i++) { var j = (i + 1) % n; a += pts[2 * i] * pts[2 * j + 1] - pts[2 * j] * pts[2 * i + 1]; }
    if (a >= 0) return pts.slice();
    var out = [];
    for (var k = n - 1; k >= 0; k--) out.push(pts[2 * k], pts[2 * k + 1]);
    return out;
  }
  function boxVerts(w, h) { var x = w / 2, y = h / 2; return [-x, -y, x, -y, x, y, -x, y]; }

  function Body(o, id) {
    this.id = id;
    this.type = o.type == null ? (o.dyn ? DYNAMIC : STATIC) : o.type;
    this.x = +o.x || 0; this.y = +o.y || 0; this.a = +o.a || 0;
    this.vx = 0; this.vy = 0; this.w = +o.w0 || 0;
    this.fx = 0; this.fy = 0; this.tq = 0;
    this.fr = o.fr == null ? 0.5 : o.fr; this.re = o.re == null ? 0.1 : o.re;
    this.gs = o.gs == null ? 1 : o.gs;
    this.ld = o.ld == null ? 0.02 : o.ld; this.ad = o.ad == null ? 0.08 : o.ad;
    this.sensor = !!o.sensor; this.tag = o.tag || ''; this.metal = !!o.metal;
    this.launch = o.launch || 0; this.belt = o.belt || 0; this.group = o.group || 0;
    this.awake = true; this.sleepT = 0; this.isl = -1; this.data = o.data || null;
    this.c = 1; this.s = 0;
    var density = o.density == null ? 1 : o.density;
    if (o.r != null) {
      this.circle = true; this.r = o.r;
      var m = PI * o.r * o.r * density;
      this.m = m; this.I = 0.5 * m * o.r * o.r;
    } else {
      this.circle = false;
      var pts = makeCCW(o.verts || boxVerts(o.wd || 1, o.ht || 1));
      var n = pts.length / 2;
      this.lv = pts; this.n = n;
      this.ln = new Array(pts.length);
      for (var i = 0; i < n; i++) {
        var j = (i + 1) % n, ex = pts[2 * j] - pts[2 * i], ey = pts[2 * j + 1] - pts[2 * i + 1], L = Math.sqrt(ex * ex + ey * ey);
        this.ln[2 * i] = ey / L; this.ln[2 * i + 1] = -ex / L;
      }
      this.wv = new Array(pts.length); this.wn = new Array(pts.length);
      var mp = polyMass(pts, density); this.m = mp.m; this.I = mp.I;
      var rr = 0; for (var k = 0; k < n; k++) rr = Math.max(rr, pts[2 * k] * pts[2 * k] + pts[2 * k + 1] * pts[2 * k + 1]);
      this.r = Math.sqrt(rr); // bounding radius
    }
    if (this.type === DYNAMIC) { this.invM = 1 / this.m; this.invI = 1 / this.I; }
    else { this.invM = 0; this.invI = 0; this.m = 0; this.I = 0; }
    if (o.vx) this.vx = o.vx; if (o.vy) this.vy = o.vy;
    this.sync();
  }
  Body.prototype.sync = function () {
    this.c = dcos(this.a); this.s = dsin(this.a);
    if (this.circle) { this.x0 = this.x - this.r; this.y0 = this.y - this.r; this.x1 = this.x + this.r; this.y1 = this.y + this.r; return; }
    var c = this.c, s = this.s, lv = this.lv, ln = this.ln, wv = this.wv, wn = this.wn;
    var x0 = 1e9, y0 = 1e9, x1 = -1e9, y1 = -1e9;
    for (var i = 0; i < this.n; i++) {
      var lx = lv[2 * i], ly = lv[2 * i + 1];
      var X = this.x + c * lx - s * ly, Y = this.y + s * lx + c * ly;
      wv[2 * i] = X; wv[2 * i + 1] = Y;
      wn[2 * i] = c * ln[2 * i] - s * ln[2 * i + 1]; wn[2 * i + 1] = s * ln[2 * i] + c * ln[2 * i + 1];
      if (X < x0) x0 = X; if (X > x1) x1 = X; if (Y < y0) y0 = Y; if (Y > y1) y1 = Y;
    }
    this.x0 = x0; this.y0 = y0; this.x1 = x1; this.y1 = y1;
  };
  // world → local and local → world helpers
  Body.prototype.toLocal = function (X, Y) { var dx = X - this.x, dy = Y - this.y; return [this.c * dx + this.s * dy, -this.s * dx + this.c * dy]; };
  Body.prototype.toWorld = function (lx, ly) { return [this.x + this.c * lx - this.s * ly, this.y + this.s * lx + this.c * ly]; };
  Body.prototype.speed2 = function () { return this.vx * this.vx + this.vy * this.vy; };

  // ------------------------------------------------------------------ narrow phase
  // A manifold: { nx, ny (A → B), np, p: [{ x, y, sep, id }] }
  function collideCircles(A, B, margin) {
    var dx = B.x - A.x, dy = B.y - A.y, R = A.r + B.r + margin, d2 = dx * dx + dy * dy;
    if (d2 > R * R) return null;
    var d = Math.sqrt(d2), nx = 0, ny = 1;
    if (d > 1e-9) { nx = dx / d; ny = dy / d; }
    var sep = d - A.r - B.r;
    return { nx: nx, ny: ny, p: [{ x: A.x + nx * (A.r + sep * 0.5), y: A.y + ny * (A.r + sep * 0.5), sep: sep, id: 0 }] };
  }
  function collidePolyCircle(A, B, margin) { // A polygon, B circle; normal A → B
    var cx = B.x, cy = B.y, r = B.r, wv = A.wv, wn = A.wn, n = A.n;
    var best = -1e9, bi = 0;
    for (var i = 0; i < n; i++) {
      var s = wn[2 * i] * (cx - wv[2 * i]) + wn[2 * i + 1] * (cy - wv[2 * i + 1]);
      if (s > r + margin) return null;
      if (s > best) { best = s; bi = i; }
    }
    var j = (bi + 1) % n;
    var v1x = wv[2 * bi], v1y = wv[2 * bi + 1], v2x = wv[2 * j], v2y = wv[2 * j + 1];
    var nx, ny, sep, id;
    if (best < 1e-9) { nx = wn[2 * bi]; ny = wn[2 * bi + 1]; sep = best - r; id = bi; }
    else {
      var u1 = (cx - v1x) * (v2x - v1x) + (cy - v1y) * (v2y - v1y);
      var u2 = (cx - v2x) * (v1x - v2x) + (cy - v2y) * (v1y - v2y);
      if (u1 <= 0 || u2 <= 0) {
        var vx = u1 <= 0 ? v1x : v2x, vy = u1 <= 0 ? v1y : v2y;
        var dx = cx - vx, dy = cy - vy, d2 = dx * dx + dy * dy;
        if (d2 > (r + margin) * (r + margin)) return null;
        var d = Math.sqrt(d2);
        if (d < 1e-9) { nx = wn[2 * bi]; ny = wn[2 * bi + 1]; } else { nx = dx / d; ny = dy / d; }
        sep = d - r; id = 16 + (u1 <= 0 ? bi : j);
      } else { nx = wn[2 * bi]; ny = wn[2 * bi + 1]; sep = best - r; id = bi; }
    }
    return { nx: nx, ny: ny, p: [{ x: cx - nx * (r + sep * 0.5), y: cy - ny * (r + sep * 0.5), sep: sep, id: id }] };
  }
  function maxSeparation(A, B) {
    var best = -1e9, bi = 0, wa = A.wv, na = A.wn, wb = B.wv;
    for (var i = 0; i < A.n; i++) {
      var nx = na[2 * i], ny = na[2 * i + 1], vx = wa[2 * i], vy = wa[2 * i + 1], mn = 1e9;
      for (var j = 0; j < B.n; j++) { var s = nx * (wb[2 * j] - vx) + ny * (wb[2 * j + 1] - vy); if (s < mn) mn = s; }
      if (mn > best) { best = mn; bi = i; }
    }
    return [best, bi];
  }
  function clip(p, nx, ny, off, ci) { // keep the part of segment p (2 points) where n·x ≤ off
    var d0 = nx * p[0].x + ny * p[0].y - off, d1 = nx * p[1].x + ny * p[1].y - off, out = [];
    if (d0 <= 0) out.push(p[0]);
    if (d1 <= 0) out.push(p[1]);
    if (d0 * d1 < 0) { var t = d0 / (d0 - d1); out.push({ x: p[0].x + t * (p[1].x - p[0].x), y: p[0].y + t * (p[1].y - p[0].y), id: (d0 > 0 ? p[0].id : p[1].id) | ci }); }
    return out;
  }
  function collidePolys(A, B, margin) {
    var sa = maxSeparation(A, B); if (sa[0] > margin) return null;
    var sb = maxSeparation(B, A); if (sb[0] > margin) return null;
    var ref, inc, edge, flip;
    if (sb[0] > 0.95 * sa[0] + 0.01) { ref = B; inc = A; edge = sb[1]; flip = true; } else { ref = A; inc = B; edge = sa[1]; flip = false; }
    var rn = ref.wn, nx = rn[2 * edge], ny = rn[2 * edge + 1];
    // incident edge: the face of inc most against n
    var mn = 1e9, ie = 0;
    for (var i = 0; i < inc.n; i++) { var d = nx * inc.wn[2 * i] + ny * inc.wn[2 * i + 1]; if (d < mn) { mn = d; ie = i; } }
    var ie2 = (ie + 1) % inc.n;
    var pts = [{ x: inc.wv[2 * ie], y: inc.wv[2 * ie + 1], id: ie << 4 }, { x: inc.wv[2 * ie2], y: inc.wv[2 * ie2 + 1], id: ie2 << 4 }];
    var e2 = (edge + 1) % ref.n;
    var v1x = ref.wv[2 * edge], v1y = ref.wv[2 * edge + 1], v2x = ref.wv[2 * e2], v2y = ref.wv[2 * e2 + 1];
    var tx = v2x - v1x, ty = v2y - v1y, tl = Math.sqrt(tx * tx + ty * ty); tx /= tl; ty /= tl;
    pts = clip(pts, -tx, -ty, -(tx * v1x + ty * v1y), 1); if (pts.length < 2) return null;
    pts = clip(pts, tx, ty, tx * v2x + ty * v2y, 2); if (pts.length < 2) return null;
    var front = nx * v1x + ny * v1y, out = [];
    for (var k = 0; k < 2; k++) {
      var sep = nx * pts[k].x + ny * pts[k].y - front;
      if (sep <= margin) out.push({ x: pts[k].x - nx * sep * 0.5, y: pts[k].y - ny * sep * 0.5, sep: sep, id: (edge << 8) | pts[k].id | (flip ? 4096 : 0) });
    }
    if (!out.length) return null;
    return flip ? { nx: -nx, ny: -ny, p: out } : { nx: nx, ny: ny, p: out };
  }
  function collide(A, B, margin) {
    if (A.circle && B.circle) return collideCircles(A, B, margin);
    if (!A.circle && B.circle) return collidePolyCircle(A, B, margin);
    if (A.circle && !B.circle) { var m = collidePolyCircle(B, A, margin); if (m) { m.nx = -m.nx; m.ny = -m.ny; } return m; }
    return collidePolys(A, B, margin);
  }
  // overlap test for placing parts (no margin): true when the shapes overlap by more than tol
  function overlaps(A, B, tol) {
    if (A.x1 < B.x0 || B.x1 < A.x0 || A.y1 < B.y0 || B.y1 < A.y0) return false;
    var m = collide(A, B, 0);
    if (!m) return false;
    for (var i = 0; i < m.p.length; i++) if (m.p[i].sep < -(tol || 0)) return true;
    return false;
  }

  // ------------------------------------------------------------------ world
  var BETA = 0.2, SLOP = 0.005, MAX_BIAS = 3, REST_V = 0.8, ITER = 10, MAXV = 24, MAXW = 40;
  var SLEEP_V2 = 0.0025, SLEEP_W2 = 0.01, SLEEP_T = 0.5;
  function World(o) {
    o = o || {};
    this.gx = o.gx || 0; this.gy = o.gy == null ? -10 : o.gy;
    this.bodies = []; this.joints = []; this.fields = [];
    this.contacts = []; this.cache = new Map();
    this.ground = this.add({ x: 0, y: 0, r: 0.01, sensor: true, tag: 'ground' }); // the anchor for joints to the world
    this.steps = 0; this.onLaunch = null; this.hits = [];
  }
  World.prototype.add = function (o) { var b = new Body(o, this.bodies.length); this.bodies.push(b); return b; };
  // pin joint: A and B share the world point (X, Y)
  World.prototype.pin = function (A, B, X, Y, o) {
    var j = { k: 'pin', A: A, B: B || this.ground, la: A.toLocal(X, Y), lb: (B || this.ground).toLocal(X, Y), px: 0, py: 0, motor: o && o.motor, mi: 0 };
    this.joints.push(j); return j;
  };
  // rope: the distance between A's local point and B's local point is at most len (pull only)
  World.prototype.rope = function (A, la, B, lb, len) {
    var j = { k: 'rope', A: A, B: B || this.ground, la: la, lb: lb, len: len, acc: 0 };
    this.joints.push(j); return j;
  };
  World.prototype.field = function (f) { this.fields.push(f); return f; };
  World.prototype.wake = function (b) {
    if (b.type !== DYNAMIC || b.awake) return;
    var isl = b.isl, bs = this.bodies;
    for (var i = 0; i < bs.length; i++) { var q = bs[i]; if (!q.awake && q.type === DYNAMIC && (q === b || (isl >= 0 && q.isl === isl))) { q.awake = true; q.sleepT = 0; q.isl = -1; } }
  };

  function applyImpulse(b, px, py, rx, ry) {
    if (b.type !== DYNAMIC) return;
    b.vx += px * b.invM; b.vy += py * b.invM; b.w += (rx * py - ry * px) * b.invI;
  }

  World.prototype.applyFields = function () {
    var bs = this.bodies, fs = this.fields;
    for (var f = 0; f < fs.length; f++) {
      var F = fs[f], S = F.body;
      for (var i = 0; i < bs.length; i++) {
        var b = bs[i];
        if (b.type !== DYNAMIC || b.sensor || b === S) continue;
        if (F.kind === 'wind') {
          // the zone in front of the fan: local x from 0 to len, |local y| ≤ wid/2 (plus the body's radius)
          var dx = b.x - S.x, dy = b.y - S.y, lx = S.c * dx + S.s * dy - F.off, ly = -S.s * dx + S.c * dy;
          if (lx < -b.r * 0.5 || lx > F.len || ly > F.wid / 2 + b.r * 0.5 || ly < -F.wid / 2 - b.r * 0.5) continue;
          var k = 1 - 0.6 * (lx < 0 ? 0 : lx) / F.len, size = b.circle ? b.r : b.r * 0.8;
          var mag = F.f * k * (0.35 + size);
          if (!b.awake) this.wake(b);
          b.fx += S.c * mag; b.fy += S.s * mag;
        } else if (F.kind === 'magnet') {
          if (!b.metal) continue;
          var mx = S.x + S.c * F.off, my = S.y + S.s * F.off; // the poles
          var ex = mx - b.x, ey = my - b.y, d2 = ex * ex + ey * ey;
          if (d2 > F.r * F.r || d2 < 1e-6) continue;
          var d = Math.sqrt(d2), q = 1 - d / F.r, fm = F.k * q * q / b.invM;
          if (!b.awake) this.wake(b);
          b.fx += ex / d * fm; b.fy += ey / d * fm;
        }
      }
    }
  };

  World.prototype.step = function () {
    var dt = DT, inv = 1 / dt, bs = this.bodies, nb = bs.length, i, j, k;
    this.hits.length = 0;
    // 1. forces and velocities
    for (i = 0; i < nb; i++) { var b0 = bs[i]; b0.fx = 0; b0.fy = 0; b0.tq = 0; }
    this.applyFields();
    for (i = 0; i < nb; i++) {
      var b = bs[i];
      if (b.type !== DYNAMIC || !b.awake) continue;
      b.vx += dt * (this.gx * b.gs + b.fx * b.invM);
      b.vy += dt * (this.gy * b.gs + b.fy * b.invM);
      b.w += dt * b.tq * b.invI;
      var ld = 1 / (1 + dt * b.ld), ad = 1 / (1 + dt * b.ad);
      b.vx *= ld; b.vy *= ld; b.w *= ad;
    }
    // 2. contacts (pairs i < j, always in the same order)
    var old = this.cache, cache = new Map(), list = [];
    for (i = 0; i < nb; i++) {
      var A = bs[i];
      if (A.sensor) continue;
      for (j = i + 1; j < nb; j++) {
        var B = bs[j];
        if (B.sensor) continue;
        if (A.type !== DYNAMIC && B.type !== DYNAMIC) continue;
        if ((A.type !== DYNAMIC || !A.awake) && (B.type !== DYNAMIC || !B.awake)) continue;
        if (A.group && A.group === B.group) continue;
        var spA = A.type === DYNAMIC ? Math.sqrt(A.speed2()) + Math.abs(A.w) * A.r * 0.5 : 0, spB = B.type === DYNAMIC ? Math.sqrt(B.speed2()) + Math.abs(B.w) * B.r * 0.5 : 0;
        if (A.type === KINEMATIC) spA = Math.abs(A.w) * A.r; if (B.type === KINEMATIC) spB = Math.abs(B.w) * B.r;
        var margin = 0.02 + (spA + spB) * dt; if (margin > 0.6) margin = 0.6;
        if (A.x1 + margin < B.x0 || B.x1 + margin < A.x0 || A.y1 + margin < B.y0 || B.y1 + margin < A.y0) continue;
        var m = collide(A, B, margin);
        if (!m) continue;
        if (A.type === DYNAMIC && !A.awake) this.wake(A);
        if (B.type === DYNAMIC && !B.awake) this.wake(B);
        var key = A.id * 65536 + B.id, prev = old.get(key);
        m.A = A; m.B = B; m.key = key; m.fresh = !prev;
        for (k = 0; k < m.p.length; k++) {
          var cp = m.p[k]; cp.ln = 0; cp.lt = 0;
          // warm start from the previous step's nearest point of the same pair (more robust than feature ids when clipping flips)
          if (prev) {
            var bd = 0.01, bq = -1;
            for (var q = 0; q < prev.p.length; q++) { var ex = prev.p[q].x - cp.x, ey = prev.p[q].y - cp.y, dd = ex * ex + ey * ey; if (dd < bd) { bd = dd; bq = q; } }
            if (bq >= 0) { cp.ln = prev.p[bq].ln; cp.lt = prev.p[bq].lt; }
          }
        }
        cache.set(key, m); list.push(m);
      }
    }
    this.cache = cache; this.contacts = list;
    // 3. pre-step: masses, biases, warm start
    for (i = 0; i < list.length; i++) {
      var M = list[i], a = M.A, c = M.B, nx = M.nx, ny = M.ny, tx = -ny, ty = nx;
      M.mu = Math.sqrt(a.fr * c.fr);
      var e = a.re > c.re ? a.re : c.re;
      // conveyor surface speed along t (the top face moves along +x, the bottom face back)
      M.surf = 0;
      if (a.belt) { var up = -a.s * nx + a.c * ny; M.surf = -(a.c * tx + a.s * ty) * a.belt * (up >= 0 ? 1 : -1); }
      if (c.belt) { var up2 = -c.s * -nx + c.c * -ny; M.surf = (c.c * tx + c.s * ty) * c.belt * (up2 >= 0 ? 1 : -1); }
      for (k = 0; k < M.p.length; k++) {
        var P = M.p[k];
        var r1x = P.x - a.x, r1y = P.y - a.y, r2x = P.x - c.x, r2y = P.y - c.y;
        P.r1x = r1x; P.r1y = r1y; P.r2x = r2x; P.r2y = r2y;
        var rn1 = r1x * ny - r1y * nx, rn2 = r2x * ny - r2y * nx;
        P.mn = 1 / (a.invM + c.invM + a.invI * rn1 * rn1 + c.invI * rn2 * rn2);
        var rt1 = r1x * ty - r1y * tx, rt2 = r2x * ty - r2y * tx;
        P.mt = 1 / (a.invM + c.invM + a.invI * rt1 * rt1 + c.invI * rt2 * rt2);
        var dvx = c.vx - c.w * r2y - a.vx + a.w * r1y, dvy = c.vy + c.w * r2x - a.vy - a.w * r1x;
        var vn = dvx * nx + dvy * ny;
        if (P.sep > 0) P.bias = -P.sep * inv;
        else { P.bias = BETA * inv * (-P.sep - SLOP > 0 ? -P.sep - SLOP : 0); if (P.bias > MAX_BIAS) P.bias = MAX_BIAS; }
        if (vn < -REST_V && e > 0) { var rb = -e * vn; if (rb > P.bias) P.bias = rb; }
        if (vn < -1.5 && M.fresh) this.hits.push(M.A, M.B, -vn);
      }
    }
    // warm start (after every bias is known: the restitution above must see the velocities before any impulse)
    for (i = 0; i < list.length; i++) {
      var Mw = list[i], wa = Mw.A, wc = Mw.B;
      for (k = 0; k < Mw.p.length; k++) {
        var Pw = Mw.p[k], pxw = Pw.ln * Mw.nx - Pw.lt * Mw.ny, pyw = Pw.ln * Mw.ny + Pw.lt * Mw.nx;
        applyImpulse(wa, -pxw, -pyw, Pw.r1x, Pw.r1y); applyImpulse(wc, pxw, pyw, Pw.r2x, Pw.r2y);
      }
    }
    var js = this.joints;
    for (i = 0; i < js.length; i++) this.preJoint(js[i]);
    // 4. iterations
    for (var it = 0; it < ITER; it++) {
      for (i = 0; i < js.length; i++) this.solveJoint(js[i]);
      for (i = 0; i < list.length; i++) {
        var C = list[i], A2 = C.A, B2 = C.B, n_x = C.nx, n_y = C.ny, t_x = -n_y, t_y = n_x;
        for (k = 0; k < C.p.length; k++) {
          var Q = C.p[k];
          // friction
          var dvx2 = B2.vx - B2.w * Q.r2y - A2.vx + A2.w * Q.r1y, dvy2 = B2.vy + B2.w * Q.r2x - A2.vy - A2.w * Q.r1x;
          var vt = dvx2 * t_x + dvy2 * t_y - C.surf;
          var dlt = -Q.mt * vt, maxF = C.mu * Q.ln, lt0 = Q.lt, lt1 = lt0 + dlt;
          if (lt1 > maxF) lt1 = maxF; else if (lt1 < -maxF) lt1 = -maxF;
          dlt = lt1 - lt0; Q.lt = lt1;
          applyImpulse(A2, -dlt * t_x, -dlt * t_y, Q.r1x, Q.r1y); applyImpulse(B2, dlt * t_x, dlt * t_y, Q.r2x, Q.r2y);
          // normal
          dvx2 = B2.vx - B2.w * Q.r2y - A2.vx + A2.w * Q.r1y; dvy2 = B2.vy + B2.w * Q.r2x - A2.vy - A2.w * Q.r1x;
          var vn2 = dvx2 * n_x + dvy2 * n_y;
          var dln = Q.mn * (Q.bias - vn2), ln0 = Q.ln, ln1 = ln0 + dln; if (ln1 < 0) ln1 = 0;
          dln = ln1 - ln0; Q.ln = ln1;
          applyImpulse(A2, -dln * n_x, -dln * n_y, Q.r1x, Q.r1y); applyImpulse(B2, dln * n_x, dln * n_y, Q.r2x, Q.r2y);
        }
      }
    }
    // 5. launch pads: a body touching the top face gets at least the pad's speed along its up axis
    for (i = 0; i < list.length; i++) {
      var L = list[i], pad = L.A.launch ? L.A : L.B.launch ? L.B : null;
      if (!pad) continue;
      var other = pad === L.A ? L.B : L.A;
      if (other.type !== DYNAMIC) continue;
      var sgn = pad === L.A ? 1 : -1, ux = -pad.s, uy = pad.c;
      if ((L.nx * sgn) * ux + (L.ny * sgn) * uy < 0.7) continue;
      var vu = other.vx * ux + other.vy * uy;
      if (vu < pad.launch * 0.9) {
        var dv = pad.launch - vu;
        other.vx += ux * dv; other.vy += uy * dv;
        if (this.onLaunch) this.onLaunch(pad, other);
      }
    }
    // 6. integrate positions
    for (i = 0; i < nb; i++) {
      var d = bs[i];
      if (d.type === STATIC || (d.type === DYNAMIC && !d.awake)) continue;
      var v2 = d.vx * d.vx + d.vy * d.vy;
      if (v2 > MAXV * MAXV) { var sc = MAXV / Math.sqrt(v2); d.vx *= sc; d.vy *= sc; }
      if (d.w > MAXW) d.w = MAXW; else if (d.w < -MAXW) d.w = -MAXW;
      d.x += d.vx * dt; d.y += d.vy * dt; d.a += d.w * dt;
      d.sync();
    }
    this.sleep(dt);
    this.steps++;
  };

  World.prototype.preJoint = function (J) {
    var A = J.A, B = J.B, inv = 1 / DT;
    var r1x = A.c * J.la[0] - A.s * J.la[1], r1y = A.s * J.la[0] + A.c * J.la[1];
    var r2x = B.c * J.lb[0] - B.s * J.lb[1], r2y = B.s * J.lb[0] + B.c * J.lb[1];
    J.r1x = r1x; J.r1y = r1y; J.r2x = r2x; J.r2y = r2y;
    var dx = B.x + r2x - A.x - r1x, dy = B.y + r2y - A.y - r1y;
    if (J.k === 'pin') {
      var k11 = A.invM + B.invM + A.invI * r1y * r1y + B.invI * r2y * r2y;
      var k12 = -A.invI * r1x * r1y - B.invI * r2x * r2y;
      var k22 = A.invM + B.invM + A.invI * r1x * r1x + B.invI * r2x * r2x;
      var det = k11 * k22 - k12 * k12; if (det !== 0) det = 1 / det;
      J.m11 = det * k22; J.m12 = -det * k12; J.m22 = det * k11;
      J.bx = -BETA * inv * dx; J.by = -BETA * inv * dy;
      applyImpulse(A, -J.px, -J.py, r1x, r1y); applyImpulse(B, J.px, J.py, r2x, r2y);
      if (J.motor) { J.mm = A.invI + B.invI; J.mm = J.mm > 0 ? 1 / J.mm : 0; }
    } else {
      var L = Math.sqrt(dx * dx + dy * dy);
      if (L < 1e-6) { J.ux = 0; J.uy = 1; } else { J.ux = dx / L; J.uy = dy / L; }
      var c = L - J.len;
      J.taut = c > -0.02;
      var ru1 = r1x * J.uy - r1y * J.ux, ru2 = r2x * J.uy - r2y * J.ux;
      J.m = 1 / (A.invM + B.invM + A.invI * ru1 * ru1 + B.invI * ru2 * ru2);
      J.bias = c < 0 ? -c * inv : -BETA * inv * c; // speculative while slack
      if (!J.taut) J.acc = 0;
      applyImpulse(A, -J.acc * J.ux, -J.acc * J.uy, r1x, r1y); applyImpulse(B, J.acc * J.ux, J.acc * J.uy, r2x, r2y);
    }
  };
  World.prototype.solveJoint = function (J) {
    var A = J.A, B = J.B;
    if ((A.type !== DYNAMIC || !A.awake) && (B.type !== DYNAMIC || !B.awake)) return;
    var dvx = B.vx - B.w * J.r2y - A.vx + A.w * J.r1y, dvy = B.vy + B.w * J.r2x - A.vy - A.w * J.r1x;
    if (J.k === 'pin') {
      if (J.motor) { // a gentle motor (spinners pinned to the world)
        var dw = B.w - A.w - J.motor.w, li = -J.mm * dw, mi0 = J.mi, mi1 = mi0 + li, mx = J.motor.t * DT;
        if (mi1 > mx) mi1 = mx; else if (mi1 < -mx) mi1 = -mx;
        li = mi1 - mi0; J.mi = mi1; A.w -= li * A.invI; B.w += li * B.invI;
        dvx = B.vx - B.w * J.r2y - A.vx + A.w * J.r1y; dvy = B.vy + B.w * J.r2x - A.vy - A.w * J.r1x;
      }
      var ex = J.bx - dvx, ey = J.by - dvy;
      var ix = J.m11 * ex + J.m12 * ey, iy = J.m12 * ex + J.m22 * ey;
      J.px += ix; J.py += iy;
      applyImpulse(A, -ix, -iy, J.r1x, J.r1y); applyImpulse(B, ix, iy, J.r2x, J.r2y);
    } else {
      var vu = dvx * J.ux + dvy * J.uy;
      var dl = J.m * (J.bias - vu), a0 = J.acc, a1 = a0 + dl; if (a1 > 0) a1 = 0;
      dl = a1 - a0; J.acc = a1;
      applyImpulse(A, -dl * J.ux, -dl * J.uy, J.r1x, J.r1y); applyImpulse(B, dl * J.ux, dl * J.uy, J.r2x, J.r2y);
    }
  };

  // island sleeping: groups of touching / jointed dynamic bodies fall asleep together when all of them rest for SLEEP_T
  World.prototype.sleep = function (dt) {
    var bs = this.bodies, nb = bs.length, par = new Array(nb), i;
    for (i = 0; i < nb; i++) par[i] = i;
    var find = function (x) { while (par[x] !== x) { par[x] = par[par[x]]; x = par[x]; } return x; };
    var unite = function (a, b) { a = find(a); b = find(b); if (a !== b) { if (a < b) par[b] = a; else par[a] = b; } };
    var hold = new Array(nb); // islands touching something that moves (kinematic, conveyor, launcher) stay awake
    var list = this.contacts;
    for (i = 0; i < list.length; i++) {
      var M = list[i], A = M.A, B = M.B;
      if (A.type === DYNAMIC && B.type === DYNAMIC) unite(A.id, B.id);
      else {
        var d = A.type === DYNAMIC ? A : B, s = d === A ? B : A;
        if (s.type === KINEMATIC || s.belt) hold[d.id] = true;
      }
    }
    var js = this.joints;
    for (i = 0; i < js.length; i++) {
      var J = js[i];
      if (J.A.type === DYNAMIC && J.B.type === DYNAMIC) unite(J.A.id, J.B.id);
      if (J.motor) { if (J.A.type === DYNAMIC) hold[J.A.id] = true; if (J.B.type === DYNAMIC) hold[J.B.id] = true; }
    }
    var minT = {};
    for (i = 0; i < nb; i++) {
      var b = bs[i];
      if (b.type !== DYNAMIC || !b.awake) continue;
      if (hold[i] || b.speed2() > SLEEP_V2 || b.w * b.w > SLEEP_W2 || b.gs < 0) b.sleepT = 0; else b.sleepT += dt;
      var r = find(i);
      var t = minT[r]; minT[r] = t == null ? b.sleepT : Math.min(t, b.sleepT);
    }
    for (i = 0; i < nb; i++) {
      var q = bs[i];
      if (q.type !== DYNAMIC || !q.awake) continue;
      var rr = find(i);
      if (minT[rr] >= SLEEP_T) { q.awake = false; q.vx = 0; q.vy = 0; q.w = 0; q.isl = this.steps * 1024 + rr; }
    }
  };
  World.prototype.awakeCount = function () { var n = 0; for (var i = 0; i < this.bodies.length; i++) { var b = this.bodies[i]; if (b.type === DYNAMIC && b.awake && !b.sensor) n++; } return n; };
  World.prototype.energy = function () { // kinetic + potential (for the tests)
    var E = 0;
    for (var i = 0; i < this.bodies.length; i++) {
      var b = this.bodies[i]; if (b.type !== DYNAMIC) continue;
      E += 0.5 * b.m * b.speed2() + 0.5 * b.I * b.w * b.w - b.m * this.gy * b.gs * b.y;
    }
    return E;
  };
  // a hash of every body's state (for determinism checks)
  World.prototype.hash = function () {
    var h = 2166136261, bs = this.bodies;
    var f = new Float64Array(1), u = new Uint32Array(f.buffer);
    for (var i = 0; i < bs.length; i++) {
      var b = bs[i], vals = [b.x, b.y, b.a, b.vx, b.vy, b.w];
      for (var k = 0; k < 6; k++) { f[0] = vals[k]; h = Math.imul(h ^ u[0], 16777619) >>> 0; h = Math.imul(h ^ u[1], 16777619) >>> 0; }
    }
    return h.toString(16);
  };

  // ================================================================== the puzzle on top of the engine
  // The board is 12 × 12 units, y up. Parts the player places (and level gadgets) are listed in PARTS.
  var BW = 12, BH = 12;
  var PARTS = {
    plank: { w: 3, h: 0.24, rot: true },
    short: { w: 1.6, h: 0.24, rot: true },
    spring: { w: 1.2, h: 0.4, rot: true, launch: 10.5 },
    fan: { w: 0.9, h: 0.9, rot: true, wind: { len: 4.6, wid: 1.2, f: 6.5 } },
    belt: { w: 3, h: 0.32, rot: true, belt: 3.2 },
    domino: { w: 0.24, h: 1.3, rot: true, dyn: true, density: 1.6 },
    seesaw: { w: 3.4, h: 0.22, rot: true, dyn: true, density: 0.9 },
    balloon: { r: 0.48, rot: false, dyn: true, density: 0.4 },
    weight: { r: 0.42, rot: false, dyn: true, density: 7, metal: true },
    magnet: { w: 0.9, h: 0.9, rot: true, magnet: { r: 4.2, k: 22 } },
  };
  var PART_IDS = ['plank', 'short', 'spring', 'fan', 'belt', 'domino', 'seesaw', 'balloon', 'weight', 'magnet'];
  var BALLS = {
    yarn: { r: 0.3, density: 1, fr: 0.7, re: 0.15, ad: 0.25 },
    bell: { r: 0.3, density: 3, fr: 0.5, re: 0.3, ad: 0.12, metal: true },
  };
  var GOAL = { w: 1.8, wall: 0.8, t: 0.14 };

  // the bodies (as Body options, before adding) of a part placed at (x, y), angle a in degrees
  function partShapes(t, x, y, aDeg) {
    var D = PARTS[t]; if (!D) return [];
    var a = (aDeg || 0) * DEG;
    var o = { x: x, y: y, a: D.rot ? a : 0, dyn: !!D.dyn, density: D.density, fr: 0.6, re: 0.1, tag: t };
    if (D.r != null) o.r = D.r; else { o.wd = D.w; o.ht = D.h; }
    if (t === 'spring') { o.launch = D.launch; o.re = 0; }
    if (t === 'belt') { o.belt = D.belt; o.fr = 0.9; }
    if (t === 'balloon') { o.gs = -0.55; o.ld = 1.2; o.ad = 1; o.re = 0.4; o.fr = 0.3; }
    if (t === 'weight') { o.metal = true; o.fr = 0.5; o.re = 0.05; o.ad = 0.2; }
    if (t === 'domino') { o.fr = 0.55; o.re = 0.02; }
    if (t === 'seesaw') { o.fr = 0.7; o.re = 0.05; o.ad = 0.6; }
    if (t === 'plank' || t === 'short') { o.fr = 0.55; o.re = 0.12; }
    if (t === 'seesaw') { // two little lips at the ends (welded to the board) keep a ball from rolling off the low end
      var c = dcos(o.a), s = dsin(o.a), out = [o];
      for (var side = -1; side <= 1; side += 2) {
        var lx = side * (D.w / 2 - 0.07), ly = D.h / 2 + 0.14;
        out.push({ x: x + c * lx - s * ly, y: y + s * lx + c * ly, a: o.a, wd: 0.14, ht: 0.3, dyn: true, density: 0.9, fr: 0.7, re: 0.05, ad: 0.6, tag: 'lip', lip: side });
      }
      return out;
    }
    return [o];
  }
  function goalShapes(g) {
    var x = g.x, y = g.y, w = GOAL.w, h = GOAL.wall, t = GOAL.t;
    return [
      { x: x, y: y + t / 2, wd: w, ht: t, tag: 'goal', fr: 0.9, re: 0 },
      { x: x - w / 2 + t / 2, y: y + h / 2, wd: t, ht: h, tag: 'goal', fr: 0.6, re: 0 },
      { x: x + w / 2 - t / 2, y: y + h / 2, wd: t, ht: h, tag: 'goal', fr: 0.6, re: 0 },
    ];
  }
  // level objects → Body options. Returns [{ o, extra }] where extra holds joints and fields to add afterwards
  function objShapes(ob) {
    var k = ob[0];
    if (k === 'wall') return [{ x: ob[1], y: ob[2], wd: ob[3], ht: ob[4], a: (ob[5] || 0) * DEG, tag: 'wall', fr: 0.6, re: 0.1 }];
    if (k === 'seg' || k === 'iceseg') { // a board between two points (x1, y1) → (x2, y2), thickness th (default 0.24)
      var sx = ob[3] - ob[1], sy = ob[4] - ob[2], sl = Math.sqrt(sx * sx + sy * sy), th = (ob[5] || 0.24) / 2;
      var nx = -sy / sl * th, ny = sx / sl * th, hx = sx / 2, hy = sy / 2;
      return [{ x: (ob[1] + ob[3]) / 2, y: (ob[2] + ob[4]) / 2, verts: [-hx - nx, -hy - ny, hx - nx, hy - ny, hx + nx, hy + ny, -hx + nx, -hy + ny], tag: k === 'iceseg' ? 'ice' : 'wall', fr: k === 'iceseg' ? 0.02 : 0.6, re: 0.1 }];
    }
    if (k === 'poly') { var p = ob[1].slice(), c = centroid(makeCCW(p)), v = []; for (var i = 0; i < p.length; i += 2) v.push(p[i] - c.cx, p[i + 1] - c.cy); return [{ x: c.cx, y: c.cy, verts: v, tag: 'wall', fr: 0.6, re: 0.1 }]; }
    if (k === 'box') return [{ x: ob[1], y: ob[2], wd: ob[3], ht: ob[4], a: (ob[5] || 0) * DEG, dyn: true, density: ob[6] || 1, tag: 'box', fr: 0.6, re: 0.05 }];
    if (k === 'ice') return [{ x: ob[1], y: ob[2], wd: ob[3], ht: ob[4], a: (ob[5] || 0) * DEG, tag: 'ice', fr: 0.02, re: 0.05 }];
    if (k === 'rubber') return [{ x: ob[1], y: ob[2], wd: ob[3], ht: ob[4], a: (ob[5] || 0) * DEG, tag: 'rubber', fr: 0.8, re: 0.85 }];
    if (k === 'spin') return [{ x: ob[1], y: ob[2], wd: ob[3], ht: ob[4], a: (ob[6] || 0) * DEG, dyn: true, density: 2, tag: 'spin', fr: 0.6, re: 0.1, ad: 0 }];
    if (PARTS[k]) return partShapes(k, ob[1], ob[2], ob[3]);
    return [];
  }

  // build a running puzzle: the level, plus the parts the player placed [{ t, x, y, a }]
  function build(level, placed) {
    var W = new World({ gy: -10 });
    var S = { W: W, level: level, t: 0, steps: 0, done: 0, balls: [], gears: [], parts: (placed || []).length, inGoal: 0, events: [], evN: 0, idle: 0, launches: 0 };
    var objBodies = [];
    var addFields = function (b, t) {
      var D = PARTS[t];
      if (D && D.wind) { W.field({ kind: 'wind', body: b, len: D.wind.len, wid: D.wind.wid, f: D.wind.f, off: D.w / 2 }); }
      if (D && D.magnet) { W.field({ kind: 'magnet', body: b, r: D.magnet.r, k: D.magnet.k, off: D.w * 0.3 }); }
      if (t === 'seesaw') W.pin(b, null, b.x, b.y);
    };
    // add a part's bodies (a placed part or a level object); the lips of a seesaw are welded to its board with two pins
    var addShapes = function (sh, t) {
      var first = null;
      for (var k = 0; k < sh.length; k++) {
        var b = W.add(sh[k]);
        if (!first) { first = b; addFields(b, t); }
        else if (sh[k].tag === 'lip') {
          first.group = b.group = 1000 + first.id;
          var p1 = b.toWorld(0, -0.1), p2 = b.toWorld(0, 0.1);
          W.pin(b, first, p1[0], p1[1]); W.pin(b, first, p2[0], p2[1]);
        }
        b.of = first;
      }
      return first;
    };
    // fixed level objects first (in their listed order), then the goal, then the player's parts, then the balls
    var objs = level.objs || [];
    for (var i = 0; i < objs.length; i++) {
      var ob = objs[i];
      if (ob[0] === 'rope' || ob[0] === 'hinge') { objBodies.push(null); continue; }
      var sh = objShapes(ob), b = sh.length ? addShapes(sh, ob[0]) : null;
      for (var k = 0; k < W.bodies.length; k++) if (W.bodies[k].of === b && b) { W.bodies[k].fixed = true; W.bodies[k].obj = i; }
      objBodies.push(b);
      if (b && ob[0] === 'spin') W.pin(b, null, b.x, b.y, { motor: { w: (ob[5] || 2) , t: 400 } });
    }
    // joints between level objects: ['rope', objIndex, ax, ay, len] (anchored to the world at ax, ay) and ['hinge', objIndex, x, y]
    for (var r = 0; r < objs.length; r++) {
      var o2 = objs[r];
      if (o2[0] === 'rope') {
        var tb = objBodies[o2[1]];
        if (tb) {
          var la = [o2[5] || 0, o2[6] || 0], at = tb.toWorld(la[0], la[1]);
          var len = o2[4] || Math.sqrt((at[0] - o2[2]) * (at[0] - o2[2]) + (at[1] - o2[3]) * (at[1] - o2[3]));
          W.rope(tb, la, null, W.ground.toLocal(o2[2], o2[3]), len);
          S.ropes = S.ropes || []; S.ropes.push({ b: tb, la: la, ax: o2[2], ay: o2[3], len: len });
        }
      } else if (o2[0] === 'hinge') {
        var hb = objBodies[o2[1]];
        if (hb) W.pin(hb, null, o2[2], o2[3]);
      }
    }
    var gs = goalShapes(level.goal);
    for (var g = 0; g < gs.length; g++) { var gb = W.add(gs[g]); gb.fixed = true; }
    var pl = placed || [];
    for (var p = 0; p < pl.length; p++) {
      var n0 = W.bodies.length;
      addShapes(partShapes(pl[p].t, pl[p].x, pl[p].y, pl[p].a), pl[p].t);
      for (var q = n0; q < W.bodies.length; q++) W.bodies[q].part = p;
    }
    var balls = level.balls || [level.ball];
    for (var n = 0; n < balls.length; n++) {
      var B = balls[n], D = BALLS[B.k || 'yarn'];
      var bb = W.add({ x: B.x, y: B.y, r: D.r, dyn: true, density: D.density, fr: D.fr, re: D.re, ad: D.ad, metal: !!D.metal, tag: 'ball', vx: B.vx || 0, vy: B.vy || 0 });
      bb.kind = B.k || 'yarn'; bb.home = false; bb.out = false;
      S.balls.push(bb);
    }
    var gl = level.gears || [];
    for (var m = 0; m < gl.length; m++) S.gears.push({ x: gl[m][0], y: gl[m][1], got: false, at: 0 });
    W.onLaunch = function (pad, other) { S.launches++; ev(S, 'launch', pad.id, other.id); };
    S.step = function () { return stepPuzzle(S); };
    return S;
  }
  function ev(S, k, a, b) { S.events.push({ k: k, a: a, b: b, t: S.t }); S.evN++; if (S.events.length > 64) S.events.shift(); }
  var GEAR_R = 0.36;
  function stepPuzzle(S) {
    if (S.done) return S.done;
    var W = S.W, L = S.level;
    W.step();
    S.t += DT; S.steps++;
    for (var h = 0; h < W.hits.length; h += 3) { if (W.hits[h + 2] > 2.5) ev(S, 'hit', W.hits[h].id, W.hits[h + 1].id); }
    var g = L.goal, home = 0, out = 0;
    for (var i = 0; i < S.balls.length; i++) {
      var b = S.balls[i];
      if (b.out) { out++; continue; }
      for (var k = 0; k < S.gears.length; k++) {
        var G = S.gears[k];
        if (G.got) continue;
        var dx = b.x - G.x, dy = b.y - G.y, R = b.r + GEAR_R;
        if (dx * dx + dy * dy < R * R) { G.got = true; G.at = S.t; ev(S, 'gear', k, i); }
      }
      var inside = b.x > g.x - GOAL.w / 2 + GOAL.t && b.x < g.x + GOAL.w / 2 - GOAL.t && b.y > g.y + GOAL.t && b.y < g.y + GOAL.wall + 0.15;
      if (inside) { b.homeT = (b.homeT || 0) + DT; if (b.homeT >= 0.25) { if (!b.home) ev(S, 'home', i, 0); b.home = true; } }
      else b.homeT = 0;
      if (b.home) home++;
      if (b.x < -1.5 || b.x > BW + 1.5 || b.y < -2) { b.out = true; out++; ev(S, 'out', i, 0); W.wake(b); b.type = STATIC; b.invM = 0; b.invI = 0; b.sensor = true; }
    }
    if (home === S.balls.length) { S.done = 1; ev(S, 'win', 0, 0); return 1; }
    if (out > 0 && home + out === S.balls.length) { S.idle += DT; if (S.idle > 0.6) { S.done = -1; ev(S, 'fail', 1, 0); return -1; } }
    else if (W.awakeCount() === 0) { S.idle += DT; if (S.idle > 0.8) { S.done = -1; ev(S, 'fail', 2, 0); return -1; } }
    else S.idle = 0;
    if (S.t >= (L.time || 30)) { S.done = -1; ev(S, 'fail', 3, 0); return -1; }
    return 0;
  }
  // run headless to the end → { win, t, gears (collected), gearsAll, parts, stars: [clear, gears, par], hash }
  function run(level, placed, maxSteps) {
    var S = build(level, placed), n = maxSteps || 60 * 40;
    while (!S.done && S.steps < n) S.step();
    return result(S);
  }
  function result(S) {
    var L = S.level, got = 0;
    for (var i = 0; i < S.gears.length; i++) if (S.gears[i].got) got++;
    var win = S.done === 1;
    var stars = [win, win && got === S.gears.length, win && S.parts <= (L.par == null ? 99 : L.par)];
    return { win: win, t: Math.round(S.t * 1000) / 1000, steps: S.steps, gears: got, gearsAll: S.gears.length, parts: S.parts, stars: stars, n: (stars[0] ? 1 : 0) + (stars[1] ? 1 : 0) + (stars[2] ? 1 : 0), hash: S.W.hash() };
  }

  // ------------------------------------------------------------------ placing parts
  // a placement is valid when it is inside the board, off the glass (no-place zones), and overlaps no level object,
  // the goal, a ball's start or another part (gears do not block: covering one only loses it)
  function shapesBodies(list) { var out = []; for (var i = 0; i < list.length; i++) out.push(new Body(list[i], -1)); return out; }
  function staticBodies(level) {
    var c = level.__static;
    if (c) return c;
    var L = [];
    var objs = level.objs || [];
    for (var i = 0; i < objs.length; i++) L = L.concat(objShapes(objs[i]));
    L = L.concat(goalShapes(level.goal));
    var balls = level.balls || [level.ball];
    for (var b = 0; b < balls.length; b++) L.push({ x: balls[b].x, y: balls[b].y, r: BALLS[balls[b].k || 'yarn'].r + 0.05 });
    var glass = level.glass || [];
    for (var z = 0; z < glass.length; z++) { var Z = glass[z]; L.push({ x: Z[0] + Z[2] / 2, y: Z[1] + Z[3] / 2, wd: Z[2], ht: Z[3] }); }
    c = shapesBodies(L);
    try { Object.defineProperty(level, '__static', { value: c, enumerable: false, configurable: true }); } catch (e) {}
    return c;
  }
  // why a part cannot go there: '' (it can), 'edge', 'overlap'
  function placeProblem(level, placed, idx, cand) {
    var mine = shapesBodies(partShapes(cand.t, cand.x, cand.y, cand.a));
    for (var i = 0; i < mine.length; i++) {
      var b = mine[i];
      if (b.x0 < -0.001 || b.y0 < -0.001 || b.x1 > BW + 0.001 || b.y1 > BH + 0.001) return 'edge';
      var st = staticBodies(level);
      for (var k = 0; k < st.length; k++) if (overlaps(b, st[k], 0.01)) return 'overlap';
      for (var p = 0; p < placed.length; p++) {
        if (p === idx) continue;
        var other = shapesBodies(partShapes(placed[p].t, placed[p].x, placed[p].y, placed[p].a));
        for (var q = 0; q < other.length; q++) if (overlaps(b, other[q], 0.01)) return 'overlap';
      }
    }
    return '';
  }
  // check that a list of placements respects the level's tray (counts) and the board
  function validate(level, placed) {
    var cnt = {};
    for (var i = 0; i < placed.length; i++) {
      var p = placed[i];
      if (!PARTS[p.t]) return 'unknown part ' + p.t;
      cnt[p.t] = (cnt[p.t] || 0) + 1;
      if (cnt[p.t] > ((level.parts || {})[p.t] || 0)) return 'too many ' + p.t;
      var why = placeProblem(level, placed, i, p);
      if (why) return why + ' (part ' + i + ' ' + p.t + ')';
    }
    return '';
  }

  var api = {
    DT: DT, DEG: DEG, BW: BW, BH: BH, dsin: dsin, dcos: dcos, World: World, Body: Body, collide: collide, overlaps: overlaps,
    STATIC: STATIC, DYNAMIC: DYNAMIC, KINEMATIC: KINEMATIC,
    PARTS: PARTS, PART_IDS: PART_IDS, BALLS: BALLS, GOAL: GOAL, GEAR_R: GEAR_R,
    build: build, run: run, result: result, partShapes: partShapes, goalShapes: goalShapes, objShapes: objShapes,
    placeProblem: placeProblem, validate: validate, centroid: centroid,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  root.PhysicsEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
