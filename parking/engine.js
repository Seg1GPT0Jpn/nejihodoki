// くるま出し：パズルの中身（DOM を使わない）。マスの種類、走らせる決まり、ソルバー、乱数で作るステージ。
// ---------------------------------------------------------------------------------
// 読み込み：ページでは <script src="engine.js"></script>（ParkingEngine というグローバルを作る）。node では require('./engine.js')。
// 決まり（オーナーの決定）：車は矢印の向き（前）にしか走らない。後ろへは動かない。
// 同じレベルの番号（と salt）なら、いつも同じ駐車場になる（tools のテストで 1〜200 を前の版と比べている）。
//   ParkingEngine.generate(n, salt?)   ステージ n の駐車場 { W, H, grid, cars, lens, barrier, cat, par, sol, tip, ... }
//   ParkingEngine.solve(lv, state, cap?) 最少のタップ数の解き方 { taps, moves, waves, partial, nodes } か null
//   ParkingEngine.makeState / slide / rotTarget / closure / buildOcc / cellsOf / aliveCount   盤の操作
//   ParkingEngine.dailyLot(seed, i) / DAILY_LEVELS / lotPoints(moves, par) / starsFor(moves, par)
(function (root) {
'use strict';
const Core = (() => {
  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0]; // 0 up(far) 1 right 2 down(near) 3 left
  const T_EMPTY = 0, T_CONE = 1, T_PILLAR = 2, T_TURN = 3;

  function rng32(a) {
    return function () {
      a |= 0; a = a + 0x6D2B79F5 | 0;
      let t = Math.imul(a ^ a >>> 15, 1 | a);
      t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t;
      return ((t ^ t >>> 14) >>> 0) / 4294967296;
    };
  }

  // state: Int8Array [x,y,d]*nCars ; x = -1 means the car has left
  function makeState(lv) {
    const s = new Int8Array(lv.cars.length * 3);
    lv.cars.forEach((c, i) => { s[i * 3] = c.x; s[i * 3 + 1] = c.y; s[i * 3 + 2] = c.d; });
    return s;
  }
  function aliveCount(s) { let n = 0; for (let i = 0; i < s.length; i += 3) if (s[i] >= 0) n++; return n; }
  function buildOcc(lv, s) {
    const W = lv.W, o = new Int16Array(W * lv.H);
    for (let i = 0; i < lv.lens.length; i++) {
      const x = s[i * 3]; if (x < 0) continue;
      const y = s[i * 3 + 1], h = s[i * 3 + 2] & 1, L = lv.lens[i];
      for (let k = 0; k < L; k++) o[(y + (h ? 0 : k)) * W + x + (h ? k : 0)] = i + 1;
    }
    return o;
  }
  function cellsOf(x, y, d, L) {
    const h = d & 1, out = [];
    for (let k = 0; k < L; k++) out.push([x + (h ? k : 0), y + (h ? 0 : k)]);
    return out;
  }
  // Drive car i toward direction m (must be along its axis). left = cars already gone.
  function slide(lv, s, o, i, m, left) {
    const x = s[i * 3], y = s[i * 3 + 1], L = lv.lens[i], W = lv.W, H = lv.H;
    let lx = x, ly = y;
    if (m === 1) lx = x + L - 1; else if (m === 2) ly = y + L - 1;
    for (let k = 1; ; k++) {
      const cx = lx + DX[m] * k, cy = ly + DY[m] * k;
      if (cx < 0 || cy < 0 || cx >= W || cy >= H) {
        if (lv.barrier && lv.barrier.side === m && left < lv.barrier.need) return { exit: false, k: k - 1, hit: 'barrier' };
        return { exit: true, k: k - 1 };
      }
      const t = lv.grid[cy * W + cx];
      if (t === T_CONE || t === T_PILLAR) return { exit: false, k: k - 1, hit: 'block', hx: cx, hy: cy };
      const oc = o[cy * W + cx];
      if (oc && oc !== i + 1) return { exit: false, k: k - 1, hit: 'car', car: oc - 1 };
    }
  }
  // Turntable: rotate car 90° clockwise around the turntable cell it covers.
  function rotTarget(lv, s, o, i) {
    const x = s[i * 3], y = s[i * 3 + 1], d = s[i * 3 + 2], L = lv.lens[i], W = lv.W, H = lv.H;
    const cs = cellsOf(x, y, d, L);
    let tx = -1, ty = -1;
    for (const [cx, cy] of cs) if (lv.grid[cy * W + cx] === T_TURN) { tx = cx; ty = cy; break; }
    if (tx < 0) return null;
    let mx = 99, my = 99;
    for (const [cx, cy] of cs) {
      const nx = tx - (cy - ty), ny = ty + (cx - tx);
      if (nx < 0 || ny < 0 || nx >= W || ny >= H) return { ok: false, tx, ty };
      const t = lv.grid[ny * W + nx];
      if (t === T_CONE || t === T_PILLAR) return { ok: false, tx, ty, hx: nx, hy: ny };
      const oc = o[ny * W + nx];
      if (oc && oc !== i + 1) return { ok: false, tx, ty, car: oc - 1 };
      mx = Math.min(mx, nx); my = Math.min(my, ny);
    }
    return { ok: true, x: mx, y: my, d: (d + 1) & 3, tx, ty };
  }

  // Cars only ever drive forward (the way their arrow points); there is no reversing anywhere.
  // Remove every car that can drive straight out forward, in waves, until none can. Returns number of waves.
  function closure(lv, s, exits) {
    const nc = lv.lens.length; let waves = 0;
    for (;;) {
      const o = buildOcc(lv, s), left = nc - aliveCount(s), rm = [];
      for (let i = 0; i < nc; i++) {
        if (s[i * 3] < 0) continue;
        const d = s[i * 3 + 2];
        if (slide(lv, s, o, i, d, left).exit) rm.push([i, d]);
      }
      if (!rm.length) return waves;
      waves++;
      for (const [i, m] of rm) { s[i * 3] = -1; if (exits) exits.push({ i, m }); }
    }
  }
  const keyOf = s => String.fromCharCode.apply(null, s);

  // Dijkstra over states; exits are applied greedily (closure), branching only on partial forward slides and rotations.
  // Returns { taps, moves:[{i,m}|{i,rot:1}], waves, partial, nodes } or null (unsolvable / over cap).
  function solve(lv, s0, cap) {
    cap = cap || 40000;
    const nc = lv.lens.length;
    const st0 = Int8Array.from(s0), ex0 = [];
    const w0 = closure(lv, st0, ex0);
    const S = [st0], G = [ex0.length], P = [-1], M = [ex0], WV = [w0], PA = [0], done = [false];
    const idx = new Map([[keyOf(st0), 0]]);
    const heap = [[ex0.length, 0]];
    const push = (it) => { heap.push(it); let c = heap.length - 1; while (c > 0) { const p = (c - 1) >> 1; if (heap[p][0] <= heap[c][0]) break; [heap[p], heap[c]] = [heap[c], heap[p]]; c = p; } };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { heap[0] = last; let c = 0; for (;;) { const l = c * 2 + 1, r = l + 1; let m = c; if (l < heap.length && heap[l][0] < heap[m][0]) m = l; if (r < heap.length && heap[r][0] < heap[m][0]) m = r; if (m === c) break; [heap[m], heap[c]] = [heap[c], heap[m]]; c = m; } } return top; };
    while (heap.length) {
      const [g, id] = pop();
      if (done[id] || g > G[id]) continue;
      done[id] = true;
      const s = S[id];
      if (aliveCount(s) === 0) {
        const moves = []; let n = id;
        while (n >= 0) { moves.unshift(...M[n]); n = P[n]; }
        return { taps: g, moves, waves: WV[id], partial: PA[id], nodes: S.length };
      }
      const o = buildOcc(lv, s), left = nc - aliveCount(s);
      const relax = (ns, first) => {
        const ex = []; const w = closure(lv, ns, ex);
        const ng = g + 1 + ex.length, k = keyOf(ns);
        let j = idx.get(k);
        if (j === undefined) {
          j = S.length; idx.set(k, j);
          S.push(ns); G.push(ng); P.push(id); M.push([first, ...ex]); WV.push(WV[id] + w); PA.push(PA[id] + 1); done.push(false);
          push([ng, j]);
        } else if (!done[j] && ng < G[j]) {
          G[j] = ng; P[j] = id; M[j] = [first, ...ex]; WV[j] = WV[id] + w; PA[j] = PA[id] + 1; push([ng, j]);
        }
      };
      for (let i = 0; i < nc; i++) {
        if (s[i * 3] < 0) continue;
        const d = s[i * 3 + 2];
        const r = slide(lv, s, o, i, d, left);   // forward only
        if (r.k > 0 && !r.exit) {
          const ns = Int8Array.from(s); ns[i * 3] += DX[d] * r.k; ns[i * 3 + 1] += DY[d] * r.k;
          relax(ns, { i, m: d });
        }
        const rt = rotTarget(lv, s, o, i);
        if (rt && rt.ok) {
          const ns = Int8Array.from(s); ns[i * 3] = rt.x; ns[i * 3 + 1] = rt.y; ns[i * 3 + 2] = rt.d;
          relax(ns, { i, rot: 1 });
        }
      }
      if (S.length > cap) return null;
    }
    return null;
  }

  // ---------- Levels ----------
  const SIZES = [[4, 6, 6], [12, 6, 7], [22, 7, 7], [35, 7, 8], [55, 7, 9], [75, 8, 9], [100, 8, 10], [130, 9, 10], [160, 9, 11]];
  // salt (optional, 32-bit): another lot for the same level number (online battles); 0 = the normal stages
  function config(n, salt) {
    let W = 6, H = 6;
    for (const [from, w, h] of SIZES) if (n >= from) { W = w; H = h; }
    const r = rng32((n * 7919 + 17) ^ (salt | 0));
    const t = Math.min(1, (n - 4) / 150);
    const c = {
      n, W, H,
      fill: Math.min(0.9, 0.5 + 0.4 * Math.sqrt(t)),
      truckP: n < 8 ? 0 : Math.min(0.3, 0.12 + t * 0.2),
      cones: n < 16 ? 0 : (n === 16 ? 2 : Math.floor(r() * (2 + Math.min(3, n / 40)))),
      barrier: n === 30 || (n > 30 && r() < 0.45),
      turn: n === 50 ? 1 : (n > 50 && r() < 0.4 ? (n > 120 && r() < 0.4 ? 2 : 1) : 0),
      cat: n === 70 || (n > 70 && r() < 0.35),
      bias: 0.3 + 0.5 * t,
    };
    // target difficulty band rises steadily with level
    c.lo = 10 + 27 * Math.pow(Math.min(1, (n - 4) / 196), 0.9);
    c.hi = c.lo + 2.5 + c.lo * 0.1;
    return c;
  }
  function difficulty(sol, nc) { return sol.taps * 0.4 + sol.waves * 3 + sol.partial * 4; }

  function randomLot(c, r) {
    const W = c.W, H = c.H, grid = new Uint8Array(W * H), occ = new Int16Array(W * H), cars = [];
    const ri = n => Math.floor(r() * n);
    const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !occ[y * W + x] && grid[y * W + x] !== T_CONE && grid[y * W + x] !== T_PILLAR;
    const put = (x, y, d, L) => {
      const cs = cellsOf(x, y, d, L);
      if (!cs.every(([a, b]) => free(a, b))) return false;
      cars.push({ x, y, d, len: L }); cs.forEach(([a, b]) => occ[b * W + a] = cars.length); return true;
    };
    // forward-only: a car whose lane ahead is empty right now can always leave before every car parked earlier,
    // so parking each new car facing a clear lane keeps the lot solvable (leave in reverse parking order)
    const clearAhead = (x, y, d, L) => {
      let fx = x + (d === 1 ? L - 1 : 0), fy = y + (d === 2 ? L - 1 : 0);
      for (;;) {
        fx += DX[d]; fy += DY[d];
        if (fx < 0 || fy < 0 || fx >= W || fy >= H) return true;
        if (occ[fy * W + fx] || grid[fy * W + fx] === T_CONE || grid[fy * W + fx] === T_PILLAR) return false;
      }
    };
    for (let k = 0; k < c.turn; k++) {
      for (let tries = 0; tries < 30; tries++) {
        const tx = 1 + ri(W - 2), ty = 1 + ri(H - 2);
        let bad = false;
        for (let yy = ty - 1; yy <= ty + 1; yy++) for (let xx = tx - 1; xx <= tx + 1; xx++) if (grid[yy * W + xx]) bad = true;
        if (bad) continue;
        grid[ty * W + tx] = T_TURN;
        const h = r() < 0.5, L = 2, back = r() < 0.5;
        const x = h ? tx - (back ? 1 : 0) : tx, y = h ? ty : ty - (back ? 1 : 0);
        const d = h ? (r() < 0.5 ? 1 : 3) : (r() < 0.5 ? 0 : 2);
        if (put(x, y, d, L) && r() < 0.6) {
          // lock its lane with cones so the turntable matters
          for (const sgn of [-1, 1]) {
            const dist = 1 + ri(2);
            const ex = h ? (sgn < 0 ? x - dist : x + L - 1 + dist) : x, ey = h ? y : (sgn < 0 ? y - dist : y + L - 1 + dist);
            if (free(ex, ey) && grid[ey * W + ex] === 0) grid[ey * W + ex] = r() < 0.5 ? T_CONE : T_PILLAR;
          }
        }
        break;
      }
    }
    for (let k = 0; k < c.cones; k++) {
      const x = ri(W), y = ri(H);
      if (free(x, y) && grid[y * W + x] === 0) grid[y * W + x] = r() < 0.6 ? T_CONE : T_PILLAR;
    }
    const order = [];
    for (let i = 0; i < W * H; i++) order.push(i);
    for (let i = order.length - 1; i > 0; i--) { const j = ri(i + 1); [order[i], order[j]] = [order[j], order[i]]; }
    for (const p of order) {
      const x = p % W, y = (p / W) | 0;
      if (!free(x, y) || r() > c.fill) continue;
      const L = r() < c.truckP ? 3 : 2;
      // bias: cars near the rim tend to park parallel to it, forming walls that must be opened in order
      const ex = Math.min(x, W - 1 - x), ey = Math.min(y, H - 1 - y);
      const h0 = r() < (c.bias || 0) ? ey < ex || (ey === ex && r() < 0.5) : r() < 0.5;
      done: for (const h of [h0, !h0]) {
        const offs = []; for (let j = 0; j < L; j++) offs.push(j);
        for (let j = offs.length - 1; j > 0; j--) { const q = ri(j + 1); [offs[j], offs[q]] = [offs[q], offs[j]]; }
        for (const j of offs) {
          const ax = h ? x - j : x, ay = h ? y : y - j;
          const ds = h ? (r() < 0.5 ? [1, 3] : [3, 1]) : (r() < 0.5 ? [0, 2] : [2, 0]);
          const d = ds.find(dd => clearAhead(ax, ay, dd, L));
          if (d !== undefined && put(ax, ay, d, L)) break done;
        }
      }
    }
    return { W, H, grid, cars };
  }

  function finish(lv, n) {
    lv.n = n;
    lv.lens = lv.cars.map(c => c.len);
    return lv;
  }

  // Handmade tutorials (d: 0 up 1 right 2 down 3 left)
  const TUTORIAL = [
    { W: 6, H: 6, cones: [], cars: [[2, 2, 0, 2], [0, 4, 1, 2], [4, 0, 2, 2]], tip: '車をタップすると、矢印の向きへ走り出すよ' },
    { W: 6, H: 6, cones: [[0, 2], [4, 1], [5, 4]], cars: [[1, 2, 1, 2], [4, 2, 2, 2], [3, 4, 3, 2], [2, 4, 2, 2], [0, 0, 1, 2]], tip: '前がふさがっていたら、じゃまな車から先に出そう' },
    { W: 6, H: 6, cones: [[0, 0]], cars: [[1, 2, 1, 2], [4, 1, 0, 2], [2, 3, 2, 2], [1, 5, 3, 2], [3, 4, 3, 3]], tip: '車は矢印の向きにしか走れない。出す順番を考えよう' },
  ];
  function tutorial(n) {
    const t = TUTORIAL[n - 1];
    const grid = new Uint8Array(t.W * t.H);
    t.cones.forEach(([x, y]) => grid[y * t.W + x] = T_CONE);
    const lv = finish({ W: t.W, H: t.H, grid, cars: t.cars.map(([x, y, d, len]) => ({ x, y, d, len })), barrier: null, cat: null, tip: t.tip }, n);
    const sol = solve(lv, makeState(lv));
    lv.par = sol.taps; lv.diff = difficulty(sol, lv.cars.length); lv.sol = sol;
    return lv;
  }

  function cloneLot(lv) {
    return { W: lv.W, H: lv.H, grid: Uint8Array.from(lv.grid), cars: lv.cars.map(c => Object.assign({}, c)), barrier: lv.barrier && Object.assign({}, lv.barrier), cat: lv.cat, bfrac: lv.bfrac };
  }
  // Local edit of a lot: re-park a car, re-orient one, add one, or move a cone.
  function mutate(src, c, r) {
    const lv = cloneLot(src), W = lv.W, H = lv.H;
    const ri = n => Math.floor(r() * n);
    const occ = new Int16Array(W * H);
    const mark = () => { occ.fill(0); lv.cars.forEach((cr, i) => cellsOf(cr.x, cr.y, cr.d, cr.len).forEach(([x, y]) => occ[y * W + x] = i + 1)); };
    mark();
    const free = (x, y) => x >= 0 && y >= 0 && x < W && y < H && !occ[y * W + x] && (lv.grid[y * W + x] === 0 || lv.grid[y * W + x] === T_TURN);
    const clearAhead = (x, y, d, L) => { // same rule as randomLot: face an empty lane so the lot stays solvable
      let fx = x + (d === 1 ? L - 1 : 0), fy = y + (d === 2 ? L - 1 : 0);
      for (;;) {
        fx += DX[d]; fy += DY[d];
        if (fx < 0 || fy < 0 || fx >= W || fy >= H) return true;
        const t = lv.grid[fy * W + fx];
        if (occ[fy * W + fx] || t === T_CONE || t === T_PILLAR) return false;
      }
    };
    const tryPut = (x, y, h, L) => {
      for (let j = 0; j < L; j++) {
        const ax = h ? x - j : x, ay = h ? y : y - j;
        if (!cellsOf(ax, ay, h ? 1 : 2, L).every(([a, b]) => free(a, b))) continue;
        const ds = h ? (r() < 0.5 ? [1, 3] : [3, 1]) : (r() < 0.5 ? [0, 2] : [2, 0]);
        // half the time ignore the lane rule: harder lots, the solver rejects any that can't be cleared
        const d = r() < 0.5 ? ds[0] : ds.find(dd => clearAhead(ax, ay, dd, L));
        if (d !== undefined) { lv.cars.push({ x: ax, y: ay, d, len: L }); mark(); return true; }
      }
      return false;
    };
    const op = r();
    if (op < 0.5 && lv.cars.length > 3) { // remove one car, refill its area
      const k = ri(lv.cars.length), old = lv.cars[k];
      lv.cars.splice(k, 1); mark();
      const cs = cellsOf(old.x, old.y, old.d, old.len);
      for (let q = 0; q < 3; q++) { const [x, y] = cs[ri(cs.length)]; if (free(x, y)) tryPut(x, y, r() < 0.5, r() < c.truckP ? 3 : 2); }
    } else if (op < 0.8) { // turn a car sideways where it stands
      const k = ri(lv.cars.length), old = lv.cars[k];
      lv.cars.splice(k, 1); mark();
      const cs = cellsOf(old.x, old.y, old.d, old.len), [x, y] = cs[ri(cs.length)];
      if (!tryPut(x, y, !(old.d & 1), old.len)) { lv.cars.push(old); mark(); }
    } else if (op < 0.92) { // squeeze in another car
      for (let q = 0; q < 12; q++) { const x = ri(W), y = ri(H); if (free(x, y) && tryPut(x, y, r() < 0.5, r() < c.truckP ? 3 : 2)) break; }
    } else { // move a cone / pillar
      const cones = []; lv.grid.forEach((t, i) => { if (t === T_CONE || t === T_PILLAR) cones.push(i); });
      if (cones.length) {
        const from = cones[ri(cones.length)], x = ri(W), y = ri(H);
        if (free(x, y) && lv.grid[y * W + x] === 0) { lv.grid[y * W + x] = lv.grid[from]; lv.grid[from] = 0; }
      }
    }
    return lv;
  }
  function evaluate(lv, n) {
    finish(lv, n);
    if (lv.barrier) lv.barrier.need = Math.max(1, Math.round(lv.cars.length * lv.bfrac));
    const sol = solve(lv, makeState(lv), 6000);
    if (!sol) return false;
    lv.sol = sol; lv.diff = difficulty(sol, lv.cars.length); lv.pen = 0;
    // a featured obstacle must matter: the turntable gets used, the gate changes the solution
    if (lv.grid.includes(T_TURN) && !sol.moves.some(m => m.rot)) lv.pen += 6;
    if (lv.barrier) {
      const free = Object.assign({}, lv, { barrier: null }), s2 = solve(free, makeState(free), 6000);
      if (s2 && s2.taps === sol.taps && s2.waves === sol.waves) lv.pen += 4;
    }
    return true;
  }

  function generate(n, salt) {
    n = Math.max(1, n | 0); salt = salt | 0;
    if (n <= 3 && !salt) return tutorial(n);
    const c = config(n, salt), r = rng32((n * 2654435761 >>> 0) ^ 0x5eed ^ salt);
    const score = l => (l.diff < c.lo ? (c.lo - l.diff) * 2 : l.diff > c.hi ? l.diff - c.hi : 0) + l.pen;
    let cur = null, tries = 0;
    for (let k = 0; k < 400 && !(cur && k >= 6); k++) {
      const lv = randomLot(c, r);
      lv.barrier = null; lv.cat = null;
      if (c.barrier) { lv.bfrac = 0.22 + r() * 0.2; lv.barrier = { side: [1, 2, 3][Math.floor(r() * 3)], need: 1 }; }
      if (c.cat) { const side = Math.floor(r() * 4), span = side & 1 ? lv.H : lv.W; lv.cat = { side, pos: Math.floor(r() * (span - 1)), len: 2 }; }
      if (lv.cars.length < 3 || !evaluate(lv, n)) continue;
      if (!cur || score(lv) < score(cur)) cur = lv;
    }
    for (; tries < 900 && score(cur) > 0; tries++) { // hill-climb toward the level's difficulty band
      const lv = mutate(cur, c, r);
      if (!evaluate(lv, n)) continue;
      if (score(lv) <= score(cur)) cur = lv;
    }
    cur.par = cur.sol.taps;
    cur.tries = tries;
    cur.tip = n === 4 ? 'どの車から出せるか、よく見て順番を考えよう' : n === 8 ? 'トラックは3マス。長いぶん、道をふさぎやすい' : n === 16 ? 'コーンと柱は動かない。車はその手前で止まる' :
      n === 30 ? 'しましまのゲートは「あと○台」出るまで開かない' : n === 50 ? '回転台の上の車はタップで90°回る（矢印の向きへスワイプで発進）' : n === 70 ? 'ねこが横断歩道をわたる間は、その出口から出られない' : '';
    return cur;
  }

  // ---------- Daily challenge ----------
  // The day's lots: the stage generator at fixed level numbers, salted with the day's seed (KoboPlatform.dailySeed), so everyone
  // gets the same lots in the same order. The levels stay below the turntable and cat stages (50 / 70): no timing gimmick.
  const DAILY_LEVELS = [12, 26, 44];
  const dailySalt = seed => ((seed | 0) ^ 0x0da11e) | 0 || 1;
  function dailyLot(seed, i) { return generate(DAILY_LEVELS[i], dailySalt(seed)); }
  // Points for one lot (daily and online battles): 100 per cleared lot + 50 at par, 10 less per extra move.
  function lotPoints(moves, par) { return 100 + Math.max(0, 50 - 10 * Math.max(0, moves - par)); }
  // Stars for one lot: 3 at par or better, 2 a little over par, 1 otherwise.
  function starsFor(moves, par) { return moves <= par ? 3 : moves <= par + Math.max(2, Math.ceil(par * 0.12)) ? 2 : 1; }

  return { DX, DY, T_EMPTY, T_CONE, T_PILLAR, T_TURN, makeState, aliveCount, buildOcc, cellsOf, slide, rotTarget, closure, solve, generate, config, difficulty, rng32,
    DAILY_LEVELS, dailySalt, dailyLot, lotPoints, starsFor };
})();
root.ParkingEngine = Core;
if (typeof module === 'object' && module && module.exports) module.exports = Core;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
