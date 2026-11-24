// ぴったりパズル工房 (Fit Workshop) — pure logic, runs in the browser and in node (tools/tests/unit/fit-engine.test.js).
// Seeded puzzle generator + exact-cover tiling solver + the play session (place / lift / rotate / flip / undo / hint).
// Nothing here touches the DOM, Math.random, Date or Math.sin: the same seed always gives the same puzzle.
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- seeded random
  function hash32(str) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 15; h = Math.imul(h, 2246822519) >>> 0; h ^= h >>> 13;
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return {
      next,
      int: n => Math.floor(next() * n),
      pick(arr) { return arr[Math.floor(next() * arr.length)]; },
      shuffle(arr) { const a2 = arr.slice(); for (let i = a2.length - 1; i > 0; i--) { const j = Math.floor(next() * (i + 1)); const t = a2[i]; a2[i] = a2[j]; a2[j] = t; } return a2; },
    };
  }

  // ---------------------------------------------------------------- pieces (free polyominoes of 3 to 5 cells, named after workshop tools)
  const PIECES = {
    i3: { size: 3, name: { ja: 'ものさし', en: 'Ruler' }, cells: [[0, 0], [1, 0], [2, 0]] },
    l3: { size: 3, name: { ja: 'かね折れ', en: 'Bracket' }, cells: [[0, 0], [0, 1], [1, 1]] },
    i4: { size: 4, name: { ja: '角材', en: 'Beam' }, cells: [[0, 0], [1, 0], [2, 0], [3, 0]] },
    l4: { size: 4, name: { ja: 'カギ', en: 'Hook' }, cells: [[0, 0], [0, 1], [0, 2], [1, 2]] },
    t4: { size: 4, name: { ja: 'かなとこ', en: 'Anvil' }, cells: [[0, 0], [1, 0], [2, 0], [1, 1]] },
    s4: { size: 4, name: { ja: 'ジグザグ', en: 'Zigzag' }, cells: [[1, 0], [2, 0], [0, 1], [1, 1]] },
    o4: { size: 4, name: { ja: '角ブロック', en: 'Block' }, cells: [[0, 0], [1, 0], [0, 1], [1, 1]] },
    f5: { size: 5, name: { ja: 'てこ', en: 'Lever' }, cells: [[1, 0], [2, 0], [0, 1], [1, 1], [1, 2]] },
    i5: { size: 5, name: { ja: '長板', en: 'Plank' }, cells: [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0]] },
    l5: { size: 5, name: { ja: 'L定規', en: 'L-square' }, cells: [[0, 0], [0, 1], [0, 2], [0, 3], [1, 3]] },
    n5: { size: 5, name: { ja: 'のこ歯', en: 'Saw' }, cells: [[1, 0], [1, 1], [0, 2], [1, 2], [0, 3]] },
    p5: { size: 5, name: { ja: 'づち', en: 'Mallet' }, cells: [[0, 0], [1, 0], [0, 1], [1, 1], [0, 2]] },
    t5: { size: 5, name: { ja: 'T定規', en: 'T-square' }, cells: [[0, 0], [1, 0], [2, 0], [1, 1], [1, 2]] },
    u5: { size: 5, name: { ja: 'クランプ', en: 'Clamp' }, cells: [[0, 0], [2, 0], [0, 1], [1, 1], [2, 1]] },
    v5: { size: 5, name: { ja: 'さしがね', en: 'Set square' }, cells: [[0, 0], [0, 1], [0, 2], [1, 2], [2, 2]] },
    w5: { size: 5, name: { ja: 'かいだん', en: 'Stairs' }, cells: [[0, 0], [0, 1], [1, 1], [1, 2], [2, 2]] },
    x5: { size: 5, name: { ja: 'ほしがた', en: 'Star' }, cells: [[1, 0], [0, 1], [1, 1], [2, 1], [1, 2]] },
    y5: { size: 5, name: { ja: 'ツルハシ', en: 'Pick' }, cells: [[1, 0], [0, 1], [1, 1], [1, 2], [1, 3]] },
    z5: { size: 5, name: { ja: 'ねじれ', en: 'Twist' }, cells: [[0, 0], [1, 0], [1, 1], [1, 2], [2, 2]] },
  };
  const TYPES = Object.keys(PIECES);
  const AWKWARD = ['f5', 'n5', 'w5', 'x5', 'y5', 'z5', 'u5'];
  const bySize = s => TYPES.filter(t => PIECES[t].size === s);

  // ---------------------------------------------------------------- orientations
  function norm(cells) {
    let mx = Infinity, my = Infinity;
    for (const c of cells) { if (c[0] < mx) mx = c[0]; if (c[1] < my) my = c[1]; }
    return cells.map(c => [c[0] - mx, c[1] - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]);
  }
  // flip = mirror left-right first, then rot quarter turns clockwise (y points down)
  function shape(type, rot, flip) {
    let cs = PIECES[type].cells.map(c => [flip ? -c[0] : c[0], c[1]]);
    for (let k = 0; k < (rot & 3); k++) cs = cs.map(c => [-c[1], c[0]]);
    return norm(cs);
  }
  const key = cells => cells.map(c => c[0] + ',' + c[1]).join(';');
  const bbox = cells => { let w = 0, h = 0; for (const c of cells) { if (c[0] + 1 > w) w = c[0] + 1; if (c[1] + 1 > h) h = c[1] + 1; } return { w, h }; };
  // distinct shapes of a type: [{ rot, flip, cells }]
  const ORI = {};
  for (const t of TYPES) {
    const seen = new Set(), list = [];
    for (let f = 0; f < 2; f++) for (let r = 0; r < 4; r++) { const cs = shape(t, r, f), k = key(cs); if (!seen.has(k)) { seen.add(k); list.push({ rot: r, flip: f, cells: cs }); } }
    ORI[t] = list;
  }
  function rotFlipFor(type, cells) { // some (rot, flip) giving exactly this shape
    const k = key(norm(cells));
    for (let f = 0; f < 2; f++) for (let r = 0; r < 4; r++) if (key(shape(type, r, f)) === k) return { rot: r, flip: f };
    return null;
  }

  // ---------------------------------------------------------------- the tiling solver (backtracking on the first empty cell = exact cover)
  // board: [[x, y]…]; tray: types (repeats allowed; each piece is used at most once). Every board cell must be covered.
  // opt: { limit (stop counting at this many), occupied (Set 'x,y' already filled), nodes (cap) }
  // → { count, first: [{ type, cells: [[x, y]…] }], nodes, capped }
  function solve(board, tray, opt) {
    opt = opt || {};
    const limit = opt.limit || 2, maxNodes = opt.maxNodes || 2e6;
    const occ = new Set(opt.occupied || []);
    const inBoard = new Set(board.map(c => c[0] + ',' + c[1]));
    const cells = board.filter(c => !occ.has(c[0] + ',' + c[1])).slice().sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const cnt = {}; for (const t of tray) cnt[t] = (cnt[t] || 0) + 1;
    const types = Object.keys(cnt);
    // anchored shapes: each orientation shifted so its first cell (row-major) is the origin
    const anch = {};
    for (const t of types) anch[t] = ORI[t].map(o => { const f = o.cells[0]; return o.cells.map(c => [c[0] - f[0], c[1] - f[1]]); });
    const filled = new Set(); // cells covered during the search
    const stack = [];
    const res = { count: 0, first: null, nodes: 0, capped: false };
    let left = cells.length;
    function rec(from) {
      if (res.count >= limit || res.capped) return;
      if (++res.nodes > maxNodes) { res.capped = true; return; }
      if (left === 0) { res.count++; if (!res.first) res.first = stack.map(s => ({ type: s.type, cells: s.cells.map(c => [c[0], c[1]]) })); return; }
      let i = from; while (i < cells.length && filled.has(cells[i][0] + ',' + cells[i][1])) i++;
      if (i >= cells.length) return;
      const c0 = cells[i];
      for (const t of types) {
        if (!cnt[t]) continue;
        for (const a of anch[t]) {
          let ok = true; const abs = [];
          for (let k = 0; k < a.length; k++) {
            const x = c0[0] + a[k][0], y = c0[1] + a[k][1], kk = x + ',' + y;
            if (!inBoard.has(kk) || occ.has(kk) || filled.has(kk)) { ok = false; break; }
            abs.push([x, y]);
          }
          if (!ok) continue;
          for (const c of abs) filled.add(c[0] + ',' + c[1]);
          cnt[t]--; left -= abs.length; stack.push({ type: t, cells: abs });
          rec(i + 1);
          stack.pop(); cnt[t]++; left += abs.length; for (const c of abs) filled.delete(c[0] + ',' + c[1]);
          if (res.count >= limit || res.capped) return;
        }
      }
    }
    if (cells.length === 0) { res.count = 1; res.first = []; return res; }
    rec(0);
    return res;
  }

  // ---------------------------------------------------------------- the generator
  // spec: { n: [min, max] required pieces, sizes: { 3: w, 4: w, 5: w }, decoys: [min, max], cells: [min, max] board cells,
  //         sol: [min, max] allowed solution count, awkward: min awkward pieces among the required, nodes: min search effort,
  //         maxDim: longest side }
  function makePieceList(r, spec) {
    const n = spec.n[0] + r.int(spec.n[1] - spec.n[0] + 1);
    const sizes = spec.sizes, tot = (sizes[3] || 0) + (sizes[4] || 0) + (sizes[5] || 0);
    const draw = () => { let x = r.next() * tot; for (const s of [3, 4, 5]) { x -= sizes[s] || 0; if (x < 0) return s; } return 4; };
    const out = [];
    let guard = 0;
    while (out.length < n && guard++ < 200) {
      const s = draw(), pool = bySize(s);
      let t = r.pick(pool);
      if (out.filter(x => x === t).length >= 2) t = r.pick(pool); // not too many of one kind
      out.push(t);
    }
    return out;
  }
  function growBoard(r, list, spec) {
    // glue the pieces edge to edge, one at a time, keeping the outline compact-ish but never a plain rectangle
    const maxDim = spec.maxDim || 8;
    let occ = new Map(); // 'x,y' → piece index
    const placed = [];
    const order = r.shuffle(list.map((t, i) => i));
    for (let oi = 0; oi < order.length; oi++) {
      const pi = order[oi], t = list[pi];
      if (oi === 0) {
        const o = r.pick(ORI[t]);
        placed.push({ p: pi, type: t, cells: o.cells.map(c => [c[0] + 4, c[1] + 4]) });
        for (const c of placed[0].cells) occ.set(c[0] + ',' + c[1], pi);
        continue;
      }
      const cands = [];
      const seen = new Set();
      for (const [k] of occ) {
        const [x, y] = k.split(',').map(Number);
        for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
          const nx = x + d[0], ny = y + d[1];
          if (occ.has(nx + ',' + ny)) continue;
          for (const o of ORI[t]) for (const a of o.cells) {
            const ox = nx - a[0], oy = ny - a[1];
            const id = t + '|' + o.rot + o.flip + '|' + ox + ',' + oy;
            if (seen.has(id)) continue; seen.add(id);
            let ok = true; const abs = [];
            for (const c of o.cells) { const px = c[0] + ox, py = c[1] + oy; if (occ.has(px + ',' + py)) { ok = false; break; } abs.push([px, py]); }
            if (ok) cands.push(abs);
          }
        }
      }
      if (!cands.length) return null;
      // prefer the more compact of a few random candidates (so the board stays a puzzle, not a snake)
      let best = null, bs = Infinity;
      for (let q = 0; q < 3; q++) {
        const abs = cands[r.int(cands.length)];
        let x0 = Infinity, y0 = Infinity, x1 = -Infinity, y1 = -Infinity;
        for (const [k] of occ) { const [x, y] = k.split(',').map(Number); x0 = Math.min(x0, x); x1 = Math.max(x1, x); y0 = Math.min(y0, y); y1 = Math.max(y1, y); }
        for (const c of abs) { x0 = Math.min(x0, c[0]); x1 = Math.max(x1, c[0]); y0 = Math.min(y0, c[1]); y1 = Math.max(y1, c[1]); }
        const sc = (x1 - x0 + 1) * (y1 - y0 + 1) + r.next() * 3;
        if (sc < bs && Math.max(x1 - x0 + 1, y1 - y0 + 1) <= maxDim) { bs = sc; best = abs; }
      }
      if (!best) return null;
      placed.push({ p: pi, type: t, cells: best });
      for (const c of best) occ.set(c[0] + ',' + c[1], pi);
    }
    // normalise to (0, 0)
    let mx = Infinity, my = Infinity;
    for (const [k] of occ) { const [x, y] = k.split(',').map(Number); mx = Math.min(mx, x); my = Math.min(my, y); }
    const board = [];
    for (const [k] of occ) { const [x, y] = k.split(',').map(Number); board.push([x - mx, y - my]); }
    board.sort((a, b) => a[1] - b[1] || a[0] - b[0]);
    const sol = placed.map(s => ({ p: s.p, type: s.type, cells: s.cells.map(c => [c[0] - mx, c[1] - my]).sort((a, b) => a[1] - b[1] || a[0] - b[0]) }));
    sol.sort((a, b) => a.p - b.p);
    return { board, sol };
  }
  function isRect(board) { const b = bbox(board); return b.w * b.h === board.length; }
  const countAwkward = list => list.filter(t => AWKWARD.includes(t)).length;

  // one attempt → a puzzle or null
  function attempt(seed, spec, relax) {
    const r = rng(seed);
    const req = makePieceList(r, spec);
    if (countAwkward(req) < (spec.awkward || 0) - (relax > 1 ? 1 : 0)) return null;
    if (new Set(req).size < Math.min(2, req.length)) return null;
    const g = growBoard(r, req, spec);
    if (!g) return null;
    const n = g.board.length;
    if (n < spec.cells[0] || n > spec.cells[1]) return null;
    if (isRect(g.board)) return null;
    const nd = spec.decoys[0] + r.int(spec.decoys[1] - spec.decoys[0] + 1);
    const decoys = [];
    for (let i = 0; i < nd; i++) {
      const s = [3, 4, 4, 5, 5][r.int(5)], t = r.pick(bySize(s));
      decoys.push(t);
    }
    const tray = req.concat(decoys);
    const maxSol = spec.sol[1] * (relax ? 2 : 1);
    const res = solve(g.board, tray, { limit: maxSol + 1 });
    if (res.capped || res.count < spec.sol[0] || res.count > maxSol) return null;
    if (res.nodes < (spec.nodes || 0) * (relax ? 0.4 : 1)) return null;
    // the order of the tray is shuffled; the stored solution is the one we grew
    const slots = r.shuffle(tray.map((t, i) => i));
    const pieces = slots.map((si, k) => ({ id: k, type: tray[si], decoy: si >= req.length }));
    // map the grown solution onto piece ids
    const solution = [];
    for (const s of g.sol) {
      const k = slots.indexOf(s.p); // piece slot
      const rf = rotFlipFor(s.type, s.cells) || { rot: 0, flip: 0 };
      let x0 = Infinity, y0 = Infinity; for (const c of s.cells) { x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); }
      solution.push({ id: k, type: s.type, rot: rf.rot, flip: rf.flip, x: x0, y: y0 });
    }
    solution.sort((a, b) => a.id - b.id);
    const bb = bbox(g.board.map(c => [c[0], c[1]]));
    return { board: g.board, w: bb.w, h: bb.h, pieces, solution, solutions: res.count, nodes: res.nodes, req: req.length, decoys: nd, awk: countAwkward(req) };
  }
  function generate(seed, spec) {
    for (let a = 0; a < 2400; a++) {
      const relax = a < 1200 ? 0 : a < 1800 ? 1 : 2;
      const p = attempt(hash32('fit:' + seed + ':' + a) ^ (seed >>> 0), spec, relax);
      if (p) { p.attempts = a + 1; p.seed = seed >>> 0; return p; }
    }
    throw new Error('fit: no puzzle for seed ' + seed);
  }

  // ---------------------------------------------------------------- worlds and stages
  const WORLDS = [
    { id: 1, name: { ja: '木くずの通り', en: 'Sawdust Row' }, color: '#d9a35e', n: [3, 3], sizes: { 3: 3, 4: 2, 5: 0 }, decoys: [0, 0], cells: [9, 13], sol: [1, 40], awkward: 0, nodes: 0 },
    { id: 2, name: { ja: 'かんな台', en: 'Planer Bench' }, color: '#c98a4b', n: [3, 4], sizes: { 3: 2, 4: 4, 5: 0 }, decoys: [0, 0], cells: [11, 16], sol: [1, 24], awkward: 0, nodes: 12 },
    { id: 3, name: { ja: 'くぎ箱', en: 'Nail Box' }, color: '#b5793f', n: [4, 4], sizes: { 3: 1, 4: 4, 5: 3 }, decoys: [0, 0], cells: [16, 20], sol: [1, 12], awkward: 0, nodes: 30 },
    { id: 4, name: { ja: '真鍮の間', en: 'Brass Hall' }, color: '#d6b44e', n: [4, 5], sizes: { 3: 0, 4: 3, 5: 4 }, decoys: [0, 0], cells: [18, 24], sol: [1, 6], awkward: 1, nodes: 60 },
    { id: 5, name: { ja: 'ひっかけ台', en: 'Decoy Table' }, color: '#6fa8a0', n: [4, 4], sizes: { 3: 1, 4: 3, 5: 3 }, decoys: [1, 1], cells: [15, 20], sol: [1, 4], awkward: 1, nodes: 70 },
    { id: 6, name: { ja: '歯車の塔', en: 'Gear Tower' }, color: '#8b8fd0', n: [5, 5], sizes: { 3: 0, 4: 3, 5: 4 }, decoys: [1, 2], cells: [20, 25], sol: [1, 3], awkward: 2, nodes: 110 },
    { id: 7, name: { ja: 'からくり蔵', en: 'Clockwork Vault' }, color: '#c7685a', n: [5, 5], sizes: { 3: 0, 4: 2, 5: 5 }, decoys: [2, 2], cells: [21, 25], sol: [1, 2], awkward: 2, nodes: 160 },
    { id: 8, name: { ja: '親方の間', en: "Master's Loft" }, color: '#b9507a', n: [5, 5], sizes: { 3: 0, 4: 1, 5: 6 }, decoys: [2, 2], cells: [23, 25], sol: [1, 1], awkward: 3, nodes: 220 },
  ];
  const PER_WORLD = 16;
  function stageSpec(world, i) {
    const W = WORLDS[world - 1], t = i / (PER_WORLD - 1);
    const s = Object.assign({}, W);
    // the first stages of a world are gentler than the last
    const eased = k => Math.round(k * (0.55 + 0.45 * t));
    s.nodes = eased(W.nodes);
    if (W.n[0] !== W.n[1]) s.n = [W.n[0], i < 5 ? W.n[0] : W.n[1]];
    if (W.decoys[1] > W.decoys[0]) s.decoys = [W.decoys[0], i < 8 ? W.decoys[0] : W.decoys[1]];
    if (W.decoys[0] > 0 && i < 3) s.decoys = [Math.max(1, W.decoys[0] - 1), Math.max(1, W.decoys[0] - 1)];
    if (W.sol[1] > 1 && i < PER_WORLD / 2) s.sol = [1, Math.max(W.sol[1], 2)];
    if (W.sol[1] <= 3 && i >= 6) s.sol = [1, Math.max(1, W.sol[1] - 1)];
    if (W.awkward && i < 4) s.awkward = Math.max(0, W.awkward - 1);
    s.maxDim = 8;
    return s;
  }
  const STAGES = [];
  WORLDS.forEach(W => { for (let i = 0; i < PER_WORLD; i++) STAGES.push({ id: W.id + '-' + (i + 1), world: W.id, n: i + 1, index: WORLDS.length ? STAGES.length : 0, seed: hash32('fit:stage:' + W.id + '-' + (i + 1)) }); });
  const STAGE_BY_ID = {}; STAGES.forEach(s => { STAGE_BY_ID[s.id] = s; });
  const cache = {};
  function parTimes(p) { const base = 8 + 8 * p.req + 5 * p.decoys; return { three: base, two: base * 2 }; }
  function finish(p, extra) { Object.assign(p, extra); p.par = parTimes(p); return p; }
  function stage(id) {
    const st = STAGE_BY_ID[id]; if (!st) return null;
    if (cache[id]) return cache[id];
    const p = generate(st.seed, stageSpec(st.world, st.n - 1));
    return (cache[id] = finish(p, { id, kind: 'stage', world: st.world, index: st.index }));
  }
  // daily: one puzzle for everybody (seed = KoboPlatform.dailySeed('fit', dateKey)), a world 4-6 level puzzle with a decoy or two
  function daily(seed) {
    const r = rng(hash32('fit:daily:' + seed));
    const world = 4 + r.int(3), i = 6 + r.int(8);
    const spec = Object.assign({}, stageSpec(world, i));
    if (!spec.decoys[1]) spec.decoys = [1, 1];
    const p = generate(hash32('fit:dailyp:' + seed), spec);
    return finish(p, { id: 'daily', kind: 'daily', world });
  }
  // time attack: the k-th puzzle of a run (k from 0). Starts gentle and ramps to world 5-6 level with decoys.
  function attack(seed, k) {
    const r = rng(hash32('fit:attack:' + seed + ':' + k));
    const world = Math.min(6, 1 + Math.floor(k / 2.2));
    const i = Math.min(PER_WORLD - 1, 2 + r.int(8) + (k > 12 ? 4 : 0));
    const spec = Object.assign({}, stageSpec(world, i));
    spec.nodes = Math.round(spec.nodes * 0.6);
    const p = generate(hash32('fit:attackp:' + seed + ':' + k), spec);
    return finish(p, { id: 'attack-' + k, kind: 'attack', world, k });
  }

  // ---------------------------------------------------------------- the play session
  function Session(puzzle, init) {
    const self = this;
    self.puzzle = puzzle;
    self.boardSet = new Set(puzzle.board.map(c => c[0] + ',' + c[1]));
    self.pieces = puzzle.pieces.map(p => ({ id: p.id, type: p.type, rot: 0, flip: 0, at: null }));
    self.hist = [];
    self.moves = 0; self.hints = 0;
    if (init) self.restore(init);
  }
  const P = Session.prototype;
  P.shapeOf = function (i) { const p = this.pieces[i]; return shape(p.type, p.rot, p.flip); };
  P.absCells = function (i, x, y) { return this.shapeOf(i).map(c => [c[0] + x, c[1] + y]); };
  P.occupied = function (except) {
    const m = new Map();
    for (const p of this.pieces) { if (p.at && p.id !== except) for (const c of this.absCells(p.id, p.at.x, p.at.y)) m.set(c[0] + ',' + c[1], p.id); }
    return m;
  };
  P.canPlace = function (i, x, y) {
    const occ = this.occupied(i);
    for (const c of this.absCells(i, x, y)) { const k = c[0] + ',' + c[1]; if (!this.boardSet.has(k) || occ.has(k)) return false; }
    return true;
  };
  P._push = function (i) { const p = this.pieces[i]; this.hist.push({ i, rot: p.rot, flip: p.flip, at: p.at ? { x: p.at.x, y: p.at.y } : null }); if (this.hist.length > 200) this.hist.shift(); };
  P.place = function (i, x, y) {
    if (!this.canPlace(i, x, y)) return false;
    this._push(i); this.pieces[i].at = { x, y }; this.moves++; return true;
  };
  // a piece that was picked up from the board (orig = where it was) is put down somewhere else: one undo step back to where it was
  P.drop = function (i, x, y, orig) {
    const p = this.pieces[i]; p.at = null;
    if (!this.canPlace(i, x, y)) return false;
    this.hist.push({ i, rot: orig.rot, flip: orig.flip, at: orig.at ? { x: orig.at.x, y: orig.at.y } : null });
    p.at = { x, y }; this.moves++; return true;
  };
  P.lift = function (i) { const p = this.pieces[i]; if (!p.at) return false; this._push(i); p.at = null; this.moves++; return true; };
  // rotate (dir 1 = clockwise, -1 = counter) or flip. A placed piece turns in place around its middle if it still fits, otherwise it goes back to the tray.
  P.turn = function (i, kind, dir) {
    const p = this.pieces[i], old = this.shapeOf(i), ob = bbox(old), at = p.at;
    const keep = { rot: p.rot, flip: p.flip };
    if (!at) {
      if (kind === 'flip') p.flip ^= 1; else p.rot = (p.rot + (dir < 0 ? 3 : 1)) & 3;
      return 'tray';
    }
    if (kind === 'flip') p.flip ^= 1; else p.rot = (p.rot + (dir < 0 ? 3 : 1)) & 3;
    const nb = bbox(this.shapeOf(i));
    const tries = [[at.x + Math.floor((ob.w - nb.w) / 2), at.y + Math.floor((ob.h - nb.h) / 2)], [at.x + Math.ceil((ob.w - nb.w) / 2), at.y + Math.ceil((ob.h - nb.h) / 2)], [at.x, at.y]];
    for (const t of tries) if (this.canPlace(i, t[0], t[1])) {
      this.hist.push({ i, rot: keep.rot, flip: keep.flip, at: { x: at.x, y: at.y } });
      p.at = { x: t[0], y: t[1] }; this.moves++; return 'placed';
    }
    this.hist.push({ i, rot: keep.rot, flip: keep.flip, at: { x: at.x, y: at.y } });
    p.at = null; this.moves++; return 'lifted';
  };
  P.undo = function () {
    const h = this.hist.pop(); if (!h) return false;
    const p = this.pieces[h.i]; p.rot = h.rot; p.flip = h.flip; p.at = h.at ? { x: h.at.x, y: h.at.y } : null; return true;
  };
  P.reset = function () { for (const p of this.pieces) if (p.at) { this._push(p.id); p.at = null; } return true; };
  P.filled = function () { return this.occupied().size; };
  P.solved = function () {
    const occ = this.occupied();
    if (occ.size !== this.puzzle.board.length) return false;
    for (const c of this.puzzle.board) if (!occ.has(c[0] + ',' + c[1])) return false;
    return true;
  };
  P.usedDecoys = function () { return this.pieces.filter(p => p.at && this.puzzle.pieces[p.id].decoy).length; };
  // a hint: one placement that can still lead to a full tiling. Pieces that are in the way go back to the tray.
  // → { id, x, y, rot, flip, lifted: [ids] } or null (nothing left to place)
  P.hint = function () {
    const pz = this.puzzle;
    const unplaced = () => this.pieces.filter(p => !p.at);
    if (!unplaced().length) return null;
    const trayOf = skip => this.pieces.filter(p => !p.at || (skip && skip.includes(p.id))).map(p => p.type);
    const fixedOcc = skip => { const o = new Set(); for (const p of this.pieces) if (p.at && !(skip && skip.includes(p.id))) for (const c of this.absCells(p.id, p.at.x, p.at.y)) o.add(c[0] + ',' + c[1]); return o; };
    let lifted = [], comp = solve(pz.board, trayOf(), { occupied: fixedOcc(), limit: 1 });
    if (!comp.count || !comp.first.length) {
      // the placed pieces block every solution: keep only those that match the stored solution
      const keep = [];
      for (const p of this.pieces) if (p.at) {
        const mine = key(this.absCells(p.id, p.at.x, p.at.y).sort((a, b) => a[1] - b[1] || a[0] - b[0]));
        const ok = pz.solution.some(s => s.type === p.type && key(shape(s.type, s.rot, s.flip).map(c => [c[0] + s.x, c[1] + s.y])) === mine);
        if (!ok) lifted.push(p.id); else keep.push(p.id);
      }
      for (const id of lifted) { this._push(id); this.pieces[id].at = null; }
      comp = solve(pz.board, trayOf(), { occupied: fixedOcc(), limit: 1 });
      if (!comp.count || !comp.first.length) {
        // still nothing (a decoy was kept): lift everything
        for (const p of this.pieces) if (p.at) { lifted.push(p.id); this._push(p.id); p.at = null; }
        comp = solve(pz.board, trayOf(), { occupied: new Set(), limit: 1 });
      }
    }
    if (!comp.first || !comp.first.length) return null;
    const pl = comp.first[0];
    const piece = this.pieces.find(p => !p.at && p.type === pl.type);
    if (!piece) return null;
    let x0 = Infinity, y0 = Infinity; for (const c of pl.cells) { x0 = Math.min(x0, c[0]); y0 = Math.min(y0, c[1]); }
    const rf = rotFlipFor(pl.type, pl.cells);
    this.hints++;
    return { id: piece.id, x: x0, y: y0, rot: rf.rot, flip: rf.flip, lifted };
  };
  P.snapshot = function () { return { p: this.pieces.map(p => [p.rot, p.flip, p.at ? p.at.x : -1, p.at ? p.at.y : -1]), h: this.hist.slice(-40).map(h => [h.i, h.rot, h.flip, h.at ? h.at.x : -1, h.at ? h.at.y : -1]), m: this.moves, n: this.hints }; };
  P.restore = function (s) {
    if (!s || !Array.isArray(s.p) || s.p.length !== this.pieces.length) return false;
    s.p.forEach((q, i) => { const p = this.pieces[i]; p.rot = q[0] & 3; p.flip = q[1] & 1; p.at = q[2] >= 0 && q[3] >= 0 ? { x: q[2] | 0, y: q[3] | 0 } : null; });
    this.hist = (s.h || []).map(h => ({ i: h[0], rot: h[1] & 3, flip: h[2] & 1, at: h[3] >= 0 ? { x: h[3], y: h[4] } : null }));
    this.moves = s.m | 0; this.hints = s.n | 0;
    // a corrupt save (overlap or outside the board) → everything back to the tray
    const occ = new Set();
    for (const p of this.pieces) if (p.at) for (const c of this.absCells(p.id, p.at.x, p.at.y)) { const k = c[0] + ',' + c[1]; if (!this.boardSet.has(k) || occ.has(k)) { this.pieces.forEach(q => { q.at = null; }); this.hist = []; return false; } occ.add(k); }
    return true;
  };
  // the tray starts scrambled: each piece gets a seeded turn / flip so the player has to rotate things
  function scramble(puzzle, tutorial) {
    const r = rng(hash32('fit:scr:' + puzzle.seed + ':' + puzzle.id));
    return puzzle.pieces.map((p, i) => {
      if (tutorial && i === 0) { const s = puzzle.solution.find(q => q.id === 0); return { rot: s.rot, flip: s.flip }; }
      return { rot: r.int(4), flip: r.int(2) };
    });
  }
  function newSession(puzzle, tutorial) {
    const s = new Session(puzzle);
    scramble(puzzle, tutorial).forEach((o, i) => { s.pieces[i].rot = o.rot; s.pieces[i].flip = o.flip; });
    return s;
  }
  // stars from the time (ms, hint penalties already included)
  function starsFor(puzzle, ms) { const t = ms / 1000; return t <= puzzle.par.three ? 3 : t <= puzzle.par.two ? 2 : 1; }
  // the daily score (higher is better): 600 minus the seconds, at least 1
  function dailyScore(ms) { return Math.max(1, 600 - Math.round(ms / 1000)); }
  const HINT_MS = 20000, ATTACK_MS = 180000, ATTACK_HINT_MS = 10000, ATTACK_SKIP_MS = 15000;
  // a flat description for tests and digests: the board rows and the pieces
  function describe(p) {
    const rows = []; const set = new Set(p.board.map(c => c[0] + ',' + c[1]));
    for (let y = 0; y < p.h; y++) { let s = ''; for (let x = 0; x < p.w; x++) s += set.has(x + ',' + y) ? '#' : '.'; rows.push(s); }
    return rows.join('/') + '|' + p.pieces.map(q => q.type + (q.decoy ? '*' : '')).join(',');
  }

  const Fit = {
    PIECES, TYPES, AWKWARD, ORI, WORLDS, PER_WORLD, STAGES, STAGE_BY_ID, HINT_MS, ATTACK_MS, ATTACK_HINT_MS, ATTACK_SKIP_MS,
    hash32, rng, shape, norm, key, bbox, rotFlipFor, solve, generate, stageSpec, stage, daily, attack, parTimes,
    Session, newSession, scramble, starsFor, dailyScore, describe,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Fit; else root.FitEngine = Fit;
})(typeof window !== 'undefined' ? window : globalThis);
