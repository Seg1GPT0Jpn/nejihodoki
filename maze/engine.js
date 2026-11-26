// めいろ探検（maze）：迷路の中身。node でもブラウザでも動く（window.MazeEngine）。ここは「決まった種から決まった迷路」を作る・歩く・解く・採点するだけ。
// 画面・音・保存は index.html、絵は art.js。乱数は種つき（mulberry32）だけ。Math.random は使わない。
// 迷路はタイルの格子：t[y*w+x] が 0=壁 1=床。外周はかならず壁。セルは (2cx+1, 2cy+1)、セルの間のタイルが通路または壁。
// 合言葉（code）：モード-大きさ-むずかしさ-番号（例 c-M-2-48213）。モード c=クラシック f=きりのランタン 3=3D k=かぎとびら t=動くかべ。
//   e-<階>-<番号> は「どこまでも下へ」の1階ぶん。おなじ合言葉はだれが開いてもおなじ迷路。
// 動き：dir 0=上 1=右 2=下 3=左 4=待つ（動くかべのモードだけ）。1回の動きで1ティック進む。
(function (root) {
  'use strict';

  const DX = [0, 1, 0, -1], DY = [-1, 0, 1, 0], DCH = 'urdlw';
  const SIZES = [{ id: 'XS', n: 9 }, { id: 'S', n: 15 }, { id: 'M', n: 25 }, { id: 'L', n: 41 }, { id: 'XL', n: 61 }];
  const MODES = ['classic', 'fog', 'd3', 'keys', 'timed'];
  const MCH = { classic: 'c', fog: 'f', d3: '3', keys: 'k', timed: 't' };
  const CHM = { c: 'classic', f: 'fog', '3': 'd3', k: 'keys', t: 'timed' };
  const GENS = ['backtracker', 'prim', 'kruskal', 'wilson', 'braid', 'rooms'];
  const PERFECT = { backtracker: 1, prim: 1, kruskal: 1, wilson: 1 };
  const PERIOD = 12;                       // 動くかべの周期（2,3,4,6 の最小公倍数）
  const DIFFS = [null, { ja: 'やさしい', en: 'Easy' }, { ja: 'ふつう', en: 'Normal' }, { ja: 'むずかしい', en: 'Hard' }];
  // むずかしさごとに、使う作り方の候補（行き止まり・枝わかれの割合がちがう）。番号 % 候補数 で決まる
  const POOLS = { 1: ['backtracker', 'braid', 'rooms', 'prim'], 2: ['backtracker', 'prim', 'kruskal', 'wilson', 'braid', 'rooms'], 3: ['prim', 'kruskal', 'wilson', 'braid', 'kruskal', 'wilson'] };
  const BRAID = { 1: 0.85, 2: 0.5, 3: 0.2 };
  const FOG_R = { 1: 5, 2: 4, 3: 3 };
  const SEED_MAX = 999999999;

  // ---------------------------------------------------------------- 乱数
  function mulberry32(a) { a = a >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function hash32(str) { let h = 2166136261 >>> 0; str = String(str); for (let i = 0; i < str.length; i++) { h ^= str.charCodeAt(i); h = Math.imul(h, 16777619); } h ^= h >>> 15; h = Math.imul(h, 2246822507); h ^= h >>> 13; h = Math.imul(h, 3266489909); h ^= h >>> 16; return h >>> 0; }
  const ri = (rnd, n) => Math.floor(rnd() * n);
  function shuffle(a, rnd) { for (let i = a.length - 1; i > 0; i--) { const j = ri(rnd, i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  const sizeById = id => SIZES.find(s => s.id === id) || null;

  // ---------------------------------------------------------------- 作り方（タイルの格子に彫る）
  // どれも t を書き換えるだけ。cw×ch がセルの数
  function openCell(t, W, cx, cy) { t[(2 * cy + 1) * W + 2 * cx + 1] = 1; }
  function openBetween(t, W, ax, ay, bx, by) { t[(ay + by + 1) * W + (ax + bx + 1)] = 1; }   // セル a と b の間のタイル（(2ax+1 + 2bx+1)/2）
  function nbrCells(cx, cy, cw, ch) { const o = []; for (let d = 0; d < 4; d++) { const x = cx + DX[d], y = cy + DY[d]; if (x >= 0 && y >= 0 && x < cw && y < ch) o.push([x, y]); } return o; }

  function genBacktracker(t, W, H, rnd, allow) {
    const cw = (W - 1) >> 1, ch = (H - 1) >> 1, seen = new Uint8Array(cw * ch);
    const ok = allow || (() => true);
    const starts = []; for (let i = 0; i < cw * ch; i++) if (ok(i)) starts.push(i);
    shuffle(starts, rnd);
    const comps = [];
    for (const s0 of starts) {
      if (seen[s0]) continue;
      const comp = [s0]; seen[s0] = 1; const stack = [s0]; openCell(t, W, s0 % cw, (s0 / cw) | 0);
      while (stack.length) {
        const c = stack[stack.length - 1], cx = c % cw, cy = (c / cw) | 0;
        const opts = nbrCells(cx, cy, cw, ch).filter(([x, y]) => !seen[y * cw + x] && ok(y * cw + x));
        if (!opts.length) { stack.pop(); continue; }
        const [nx, ny] = opts[ri(rnd, opts.length)];
        seen[ny * cw + nx] = 1; openCell(t, W, nx, ny); openBetween(t, W, cx, cy, nx, ny); stack.push(ny * cw + nx); comp.push(ny * cw + nx);
      }
      comps.push(comp);
    }
    return comps;
  }
  function genPrim(t, W, H, rnd) {
    const cw = (W - 1) >> 1, ch = (H - 1) >> 1, seen = new Uint8Array(cw * ch), fr = [];
    const add = (cx, cy) => { for (const [x, y] of nbrCells(cx, cy, cw, ch)) if (!seen[y * cw + x]) fr.push([cx, cy, x, y]); };
    const sx = ri(rnd, cw), sy = ri(rnd, ch); seen[sy * cw + sx] = 1; openCell(t, W, sx, sy); add(sx, sy);
    while (fr.length) {
      const k = ri(rnd, fr.length), [ax, ay, bx, by] = fr[k]; fr[k] = fr[fr.length - 1]; fr.pop();
      if (seen[by * cw + bx]) continue;
      seen[by * cw + bx] = 1; openCell(t, W, bx, by); openBetween(t, W, ax, ay, bx, by); add(bx, by);
    }
  }
  function makeUF(n) { const p = new Int32Array(n); for (let i = 0; i < n; i++) p[i] = i; const find = x => { while (p[x] !== x) { p[x] = p[p[x]]; x = p[x]; } return x; }; return { find, union(a, b) { a = find(a); b = find(b); if (a === b) return false; p[a] = b; return true; } }; }
  function genKruskal(t, W, H, rnd) {
    const cw = (W - 1) >> 1, ch = (H - 1) >> 1, uf = makeUF(cw * ch), edges = [];
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) { openCell(t, W, x, y); if (x + 1 < cw) edges.push([x, y, x + 1, y]); if (y + 1 < ch) edges.push([x, y, x, y + 1]); }
    shuffle(edges, rnd);
    for (const [ax, ay, bx, by] of edges) if (uf.union(ay * cw + ax, by * cw + bx)) openBetween(t, W, ax, ay, bx, by);
  }
  function genWilson(t, W, H, rnd) {
    const cw = (W - 1) >> 1, ch = (H - 1) >> 1, n = cw * ch, inTree = new Uint8Array(n), next = new Int32Array(n).fill(-1);
    for (let i = 0; i < n; i++) openCell(t, W, i % cw, (i / cw) | 0);
    inTree[ri(rnd, n)] = 1;
    for (let s = 0; s < n; s++) {
      if (inTree[s]) continue;
      let c = s;
      while (!inTree[c]) { const o = nbrCells(c % cw, (c / cw) | 0, cw, ch), [x, y] = o[ri(rnd, o.length)]; next[c] = y * cw + x; c = next[c]; }
      c = s;
      while (!inTree[c]) { const nx = next[c]; inTree[c] = 1; openBetween(t, W, c % cw, (c / cw) | 0, nx % cw, (nx / cw) | 0); c = nx; }
    }
  }
  const floorN = (t, W, H, x, y) => { let n = 0; for (let d = 0; d < 4; d++) { const a = x + DX[d], b = y + DY[d]; if (a >= 0 && b >= 0 && a < W && b < H && t[b * W + a]) n++; } return n; };
  // 行き止まりの一部に壁をぶちぬく（ループができる）
  function braidMaze(t, W, H, rnd, frac) {
    const cw = (W - 1) >> 1, ch = (H - 1) >> 1, ends = [];
    for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) if (t[(2 * cy + 1) * W + 2 * cx + 1] && floorN(t, W, H, 2 * cx + 1, 2 * cy + 1) === 1) ends.push([cx, cy]);
    shuffle(ends, rnd);
    for (const [cx, cy] of ends) {
      if (rnd() >= frac) continue;
      if (floorN(t, W, H, 2 * cx + 1, 2 * cy + 1) !== 1) continue;
      const opts = nbrCells(cx, cy, cw, ch).filter(([x, y]) => !t[(cy + y + 1) * W + (cx + x + 1)]);
      if (!opts.length) continue;
      // 行き止まり同士を先につなぐ（つなぎやすく、ループが大きくなる）
      const dead = opts.filter(([x, y]) => floorN(t, W, H, 2 * x + 1, 2 * y + 1) === 1);
      const pick = dead.length ? dead[ri(rnd, dead.length)] : opts[ri(rnd, opts.length)];
      openBetween(t, W, cx, cy, pick[0], pick[1]);
    }
  }
  // 部屋と通路：部屋を置いて、のこりを迷路でうめ、領域どうしをつなぐ
  function genRooms(t, W, H, rnd) {
    const cw = (W - 1) >> 1, ch = (H - 1) >> 1, reg = new Int32Array(cw * ch), rooms = [];
    const tries = Math.max(6, Math.floor(cw * ch / 5));
    for (let k = 0; k < tries; k++) {
      const rw = 1 + ri(rnd, Math.min(4, cw)), rh = 1 + ri(rnd, Math.min(4, ch));
      if (rw * rh < 2) continue;
      const x0 = ri(rnd, cw - rw + 1), y0 = ri(rnd, ch - rh + 1);
      let bad = false;
      for (let y = Math.max(0, y0 - 1); y <= Math.min(ch - 1, y0 + rh) && !bad; y++) for (let x = Math.max(0, x0 - 1); x <= Math.min(cw - 1, x0 + rw) && !bad; x++) if (reg[y * cw + x]) bad = true;
      if (bad) continue;
      rooms.push({ x0, y0, rw, rh }); const id = rooms.length;
      for (let y = y0; y < y0 + rh; y++) for (let x = x0; x < x0 + rw; x++) reg[y * cw + x] = id;
      for (let ty = 2 * y0 + 1; ty <= 2 * (y0 + rh - 1) + 1; ty++) for (let tx = 2 * x0 + 1; tx <= 2 * (x0 + rw - 1) + 1; tx++) t[ty * W + tx] = 1;
    }
    let nid = rooms.length;
    const comps = genBacktracker(t, W, H, rnd, i => !reg[i]);
    for (const comp of comps) { nid++; for (const c of comp) reg[c] = nid; }
    // 領域のつなぎ
    const uf = makeUF(nid + 1), conns = [];
    for (let y = 0; y < ch; y++) for (let x = 0; x < cw; x++) {
      if (x + 1 < cw && reg[y * cw + x] !== reg[y * cw + x + 1] && !t[(2 * y + 1) * W + 2 * x + 2]) conns.push([x, y, x + 1, y]);
      if (y + 1 < ch && reg[y * cw + x] !== reg[(y + 1) * cw + x] && !t[(2 * y + 2) * W + 2 * x + 1]) conns.push([x, y, x, y + 1]);
    }
    shuffle(conns, rnd);
    for (const [ax, ay, bx, by] of conns) {
      const a = reg[ay * cw + ax], b = reg[by * cw + bx];
      if (uf.union(a, b) || rnd() < 0.03) openBetween(t, W, ax, ay, bx, by);
    }
    // 通路の行き止まりを半分ほどけずる
    for (let pass = 0; pass < 2; pass++) for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
      const i = cy * cw + cx, tx = 2 * cx + 1, ty = 2 * cy + 1;
      if (i < 0 || reg[i] <= rooms.length || !t[ty * W + tx] || floorN(t, W, H, tx, ty) !== 1 || rnd() < 0.5) continue;
      t[ty * W + tx] = 0; for (let d = 0; d < 4; d++) { const mx = tx + DX[d], my = ty + DY[d]; if (t[my * W + mx] && floorN(t, W, H, mx, my) <= 1) t[my * W + mx] = 0; }
    }
  }

  // ---------------------------------------------------------------- 距離・つながり
  function bfsDist(t, W, H, from) {
    const dist = new Int32Array(W * H).fill(-1), q = [from]; dist[from] = 0;
    for (let h = 0; h < q.length; h++) { const c = q[h], x = c % W, y = (c / W) | 0; for (let d = 0; d < 4; d++) { const a = x + DX[d], b = y + DY[d]; if (a < 0 || b < 0 || a >= W || b >= H) continue; const n = b * W + a; if (t[n] && dist[n] < 0) { dist[n] = dist[c] + 1; q.push(n); } } }
    return dist;
  }
  function farthest(dist) { let b = -1, bi = -1; for (let i = 0; i < dist.length; i++) if (dist[i] > b) { b = dist[i]; bi = i; } return bi; }
  // 道すじ（from→to）：タイルの番号の列
  function shortestPath(t, W, H, from, to) {
    const par = new Int32Array(W * H).fill(-2), q = [from]; par[from] = -1;
    for (let h = 0; h < q.length && par[to] === -2; h++) { const c = q[h], x = c % W, y = (c / W) | 0; for (let d = 0; d < 4; d++) { const a = x + DX[d], b = y + DY[d]; if (a < 0 || b < 0 || a >= W || b >= H) continue; const n = b * W + a; if (t[n] && par[n] === -2) { par[n] = c; q.push(n); } } }
    if (par[to] === -2) return null;
    const p = []; for (let c = to; c !== -1; c = par[c]) p.push(c); return p.reverse();
  }
  const reachCount = (t, W, H, from) => { const d = bfsDist(t, W, H, from); let n = 0; for (let i = 0; i < d.length; i++) if (d[i] >= 0) n++; return n; };

  // ---------------------------------------------------------------- 迷路をつくる
  // params: { mode, size:'M' か n（タイル数・奇数）, diff:1..3, seed, gen?（テスト用に作り方を決め打ち）, code? }
  function normParams(p) {
    const mode = MODES.includes(p.mode) ? p.mode : 'classic';
    let n = p.n, size;
    if (!n) { const s = sizeById(p.size) || sizeById('M'); n = s.n; size = s.id; }
    else { n = Math.max(7, Math.min(61, n | 0)); if (!(n & 1)) n--; const s = SIZES.find(z => z.n === n); size = s ? s.id : 'E' + n; }
    const diff = Math.max(1, Math.min(3, p.diff | 0 || 2));
    const seed = Math.max(0, Math.min(SEED_MAX, Math.floor(Number(p.seed)) || 0));
    return { mode, n, size, diff, seed };
  }
  function pickGen(mode, diff, seed, forced) {
    if (forced) return forced;
    const pool = POOLS[diff]; let g = pool[seed % pool.length];
    if ((mode === 'keys' || mode === 'timed') && !PERFECT[g]) g = 'kruskal';
    return g;
  }
  function buildBase(n, diff, seed, gen) {
    const W = n, H = n, t = new Uint8Array(W * H), rnd = mulberry32(hash32('mz|' + n + '|' + diff + '|' + seed));
    if (gen === 'backtracker') genBacktracker(t, W, H, rnd);
    else if (gen === 'prim') genPrim(t, W, H, rnd);
    else if (gen === 'kruskal') genKruskal(t, W, H, rnd);
    else if (gen === 'wilson') genWilson(t, W, H, rnd);
    else if (gen === 'braid') { genBacktracker(t, W, H, rnd); braidMaze(t, W, H, rnd, BRAID[diff]); }
    else if (gen === 'rooms') genRooms(t, W, H, rnd);
    else throw new Error('unknown generator ' + gen);
    return { t, W, H };
  }
  function codeOf(P) { return MCH[P.mode] + '-' + (P.size && /^[A-Z]+$/.test(P.size) ? P.size : String(P.n)) + '-' + P.diff + '-' + P.seed; }

  function generate(params) {
    const P = normParams(params), gen = pickGen(P.mode, P.diff, P.seed, params.gen);
    const { t, W, H } = buildBase(P.n, P.diff, P.seed, gen);
    const N = W * H; let first = W + 1; for (let i = 0; i < N; i++) if (t[i]) { first = i; break; }
    const d0 = bfsDist(t, W, H, first), A = farthest(d0), dA = bfsDist(t, W, H, A), B = farthest(dA);
    const m = { code: params.code || codeOf(P), mode: P.mode, size: P.size, n: P.n, diff: P.diff, seed: P.seed, gen, w: W, h: H, t, start: A, goal: B,
      coins: [], gems: [], keys: [], doors: [], gates: [], period: 1, radius: 0, par: 0, floors: 0 };
    for (let i = 0; i < N; i++) if (t[i]) m.floors++;
    const rx = mulberry32(hash32('mx|' + m.code + '|' + gen));
    const used = new Set([A, B]);
    // 通路の行き止まりのセル（宝やかぎの置き場）
    const cells = []; for (let cy = 1; cy < H; cy += 2) for (let cx = 1; cx < W; cx += 2) if (t[cy * W + cx]) cells.push(cy * W + cx);
    const ends = cells.filter(c => floorN(t, W, H, c % W, (c / W) | 0) === 1 && !used.has(c));
    if (P.mode === 'keys') addKeys(m, rx, used, dA);
    if (P.mode === 'timed') addGates(m, rx, used);
    if (P.mode === 'fog') m.radius = FOG_R[P.diff];
    // 宝（コインと宝石）
    const nCoin = Math.max(2, Math.min(14, Math.round(cells.length / 24))), nGem = P.n >= 61 ? 3 : P.n >= 41 ? 2 : P.n >= 25 ? 1 : 0;
    const far = shuffle(ends.filter(c => !used.has(c)), rx).sort((a, b) => dA[b] - dA[a]);
    for (const c of far) { if (m.gems.length >= nGem) break; if (!used.has(c)) { m.gems.push(c); used.add(c); } }
    for (const c of shuffle(cells.filter(c => !used.has(c)), rx)) { if (m.coins.length >= nCoin) break; used.add(c); m.coins.push(c); }
    finalize(m);
    const s = search(m, m.start, 0, 0);
    if (!s) throw new Error('unsolvable maze ' + m.code);
    m.par = s.len;
    return m;
  }

  // かぎとびら：解の道すじの上にとびらを置き、かぎは「そのとびらの手前だけで行ける場所」に置く
  function addKeys(m, rx, used) {
    const { t, w: W, h: H } = m, path = shortestPath(t, W, H, m.start, m.goal);
    let nd = [0, 1, 2, 3][m.diff]; if (m.n <= 9) nd = 1; else if (m.n <= 15) nd = Math.min(nd, 2);
    for (; nd >= 1; nd--) {
      const L = path.length, doors = [], taken = new Set([m.start, m.goal]);
      for (let j = 0; j < nd; j++) {
        let k = Math.round(L * (j + 1) / (nd + 1)), best = -1;
        for (let o = 0; o < L && best < 0; o++) for (const c of [k + o, k - o]) { if (c < 2 || c > L - 3) continue; const q = path[c], x = q % W, y = (q / W) | 0; if (((x & 1) === 0) !== ((y & 1) === 0) && !taken.has(q)) { best = c; break; } }
        if (best < 0) { doors.length = 0; break; }
        taken.add(path[best]); doors.push(path[best]);
      }
      if (doors.length !== nd) continue;
      doors.sort((a, b) => path.indexOf(a) - path.indexOf(b));
      const keys = []; let okAll = true;
      for (let j = 0; j < nd && okAll; j++) {
        // 扉 j 以降を閉じたとき、スタートから行ける場所
        const closed = new Set(doors.slice(j)), seen = new Uint8Array(W * H), q = [m.start]; seen[m.start] = 1;
        for (let h = 0; h < q.length; h++) { const c = q[h], x = c % W, y = (c / W) | 0; for (let d = 0; d < 4; d++) { const a = x + DX[d], b = y + DY[d], nn = b * W + a; if (a < 0 || b < 0 || a >= W || b >= H || !t[nn] || seen[nn] || closed.has(nn)) continue; seen[nn] = 1; q.push(nn); } }
        const onPath = new Set(path);
        const cand = [], dist = bfsDist(t, W, H, m.start);
        for (let cy = 1; cy < H; cy += 2) for (let cx = 1; cx < W; cx += 2) { const c = cy * W + cx; if (seen[c] && !used.has(c) && !taken.has(c) && !keys.some(kk => kk.i === c)) cand.push(c); }
        if (!cand.length) { okAll = false; break; }
        cand.sort((a, b) => ((floorN(t, W, H, a % W, (a / W) | 0) === 1 ? 0 : 1) + (onPath.has(a) ? 2 : 0)) - ((floorN(t, W, H, b % W, (b / W) | 0) === 1 ? 0 : 1) + (onPath.has(b) ? 2 : 0)) || dist[b] - dist[a]);
        const top = cand.filter(c => ((floorN(t, W, H, c % W, (c / W) | 0) === 1 ? 0 : 1) + (onPath.has(c) ? 2 : 0)) === ((floorN(t, W, H, cand[0] % W, (cand[0] / W) | 0) === 1 ? 0 : 1) + (onPath.has(cand[0]) ? 2 : 0)));
        keys.push({ i: top[ri(rx, top.length)], k: j });
      }
      if (!okAll) continue;
      m.doors = doors.map((i, k) => ({ i, k })); m.keys = keys; for (const k of keys) used.add(k.i);
      return;
    }
  }
  // 動くかべ：通路を一定の間だけふさぐ「とじるかべ」と、壁を一定の間だけひらく「近道」
  function addGates(m, rx, used) {
    const { t, w: W, h: H } = m, cw = (W - 1) >> 1, ch = (H - 1) >> 1;
    const walls = [], pass = [];
    for (let cy = 0; cy < ch; cy++) for (let cx = 0; cx < cw; cx++) {
      for (const [dx, dy] of [[1, 0], [0, 1]]) {
        const ax = cx + dx, ay = cy + dy; if (ax >= cw || ay >= ch) continue;
        const tile = (2 * cy + 1 + dy) * W + (2 * cx + 1 + dx);
        if (!t[(2 * cy + 1) * W + 2 * cx + 1] || !t[(2 * ay + 1) * W + 2 * ax + 1]) continue;
        (t[tile] ? pass : walls).push(tile);
      }
    }
    const total = Math.max(3, Math.round(cw * ch / 16 * [0, 0.7, 1, 1.4][m.diff]));
    const nA = Math.ceil(total / 2), nB = total - nA, periods = [2, 3, 4, 6];
    const take = (arr, n, type) => {
      for (const tile of shuffle(arr.slice(), rx)) {
        if (n <= 0) break; if (used.has(tile) || tile === m.start || tile === m.goal) continue;
        const p = periods[ri(rx, 4)], ph = ri(rx, p);
        const on = type === 'A' ? 1 : Math.max(1, p - (m.diff === 3 && p >= 4 ? 2 : 1));
        m.gates.push({ i: tile, p, ph, on, type }); used.add(tile); n--;
      }
    };
    take(walls, nA, 'A'); take(pass, nB, 'B');
    m.period = PERIOD;
  }
  const gateOpen = (g, tm) => ((tm + g.ph) % g.p) < g.on;

  // 引き当て用の表（keyAt など）をつくる。generate と、保存からの復元の両方で使う
  function finalize(m) {
    const N = m.w * m.h;
    m.doorAt = new Uint8Array(N); m.keyAt = new Uint8Array(N); m.gateAt = new Int16Array(N); m.coinAt = new Uint8Array(N); m.gemAt = new Uint8Array(N);
    for (const d of m.doors) m.doorAt[d.i] = d.k + 1;
    for (const k of m.keys) m.keyAt[k.i] = k.k + 1;
    m.gates.forEach((g, i) => { m.gateAt[g.i] = i + 1; m.t[g.i] = 1; });
    for (const c of m.coins) m.coinAt[c] = 1;
    for (const c of m.gems) m.gemAt[c] = 1;
    m.nkeys = m.keys.length; m.masks = 1 << m.nkeys; m.P = m.gates.length ? (m.period || PERIOD) : 1;
    return m;
  }

  // ---------------------------------------------------------------- 動き
  // 状態 (pos, mask, tm) からの1手。動けなければ null
  function move(m, pos, mask, tm, d) {
    if (d === 4) { if (m.P <= 1) return null; return { pos, mask, tm: (tm + 1) % m.P }; }
    const W = m.w, x = pos % W + DX[d], y = ((pos / W) | 0) + DY[d];
    if (x < 0 || y < 0 || x >= W || y >= m.h) return null;
    const ni = y * W + x; if (!m.t[ni]) return null;
    const door = m.doorAt[ni]; if (door && !((mask >> (door - 1)) & 1)) return null;
    const tn = m.P > 1 ? (tm + 1) % m.P : 0, g = m.gateAt[ni];
    if (g && !gateOpen(m.gates[g - 1], tn)) return null;
    const key = m.keyAt[ni];
    return { pos: ni, mask: key ? mask | (1 << (key - 1)) : mask, tm: tn };
  }
  // いちばん短い手順。{ dirs:[0..4], len }。ゴールまで行けなければ null
  function search(m, pos, mask, tm) {
    const N = m.w * m.h, M = m.masks, P = m.P, total = N * M * P;
    const par = new Int32Array(total).fill(-2), pdir = new Int8Array(total);
    const enc = (p, k, q) => (q * M + k) * N + p;
    const s0 = enc(pos, mask, tm % P), queue = [s0]; par[s0] = -1;
    const dirsN = P > 1 ? 5 : 4;
    for (let h = 0; h < queue.length; h++) {
      const s = queue[h], p = s % N, r = (s / N) | 0, k = r % M, q = (r / M) | 0;
      if (p === m.goal) { const dirs = []; for (let c = s; par[c] !== -1; c = par[c]) dirs.push(pdir[c]); dirs.reverse(); return { dirs, len: dirs.length }; }
      for (let d = 0; d < dirsN; d++) { const ns = move(m, p, k, q, d); if (!ns) continue; const e = enc(ns.pos, ns.mask, ns.tm); if (par[e] === -2) { par[e] = s; pdir[e] = d; queue.push(e); } }
    }
    return null;
  }
  // タップで歩く用：かぎを持っているとびらは通る、動くかべは「開いている」とみなす道すじ
  function routeTo(m, pos, mask, target, allow) {
    const N = m.w * m.h, par = new Int32Array(N).fill(-2), pd = new Int8Array(N), q = [pos]; par[pos] = -1;
    for (let h = 0; h < q.length && par[target] === -2; h++) {
      const c = q[h], x = c % m.w, y = (c / m.w) | 0;
      for (let d = 0; d < 4; d++) { const a = x + DX[d], b = y + DY[d]; if (a < 0 || b < 0 || a >= m.w || b >= m.h) continue; const n = b * m.w + a; if (!m.t[n] || par[n] !== -2 || (allow && !allow[n])) continue; const door = m.doorAt[n]; if (door && !((mask >> (door - 1)) & 1)) continue; par[n] = c; pd[n] = d; q.push(n); }
    }
    if (par[target] === -2) return null;
    const dirs = []; for (let c = target; par[c] !== -1; c = par[c]) dirs.push(pd[c]); return dirs.reverse();
  }

  // ---------------------------------------------------------------- 1回ぶんのプレイ
  function newRun(m) {
    const run = { m, pos: m.start, mask: 0, tk: 0, moves: 0, bumps: 0, log: '', route: [m.start], vis: new Uint8Array(m.w * m.h), seen: m.mode === 'fog' ? new Uint8Array(m.w * m.h) : null, coins: new Set(), gems: new Set(), done: false };
    run.vis[m.start] = 1; if (run.seen) markSeen(run); return run;
  }
  function markSeen(run) { const v = visible(run.m, run.pos, run.m.radius); for (const i of v) run.seen[i] = 1; }
  // 1手。{ ok, reason?, to, coin, gem, key, done }
  function step(run, d) {
    const m = run.m; if (run.done) return { ok: false, reason: 'done' };
    const s = move(m, run.pos, run.mask, run.tk % m.P, d);
    if (!s) { run.bumps++; let reason = 'wall'; if (d < 4) { const ni = run.pos + DY[d] * m.w + DX[d]; const x = run.pos % m.w + DX[d], y = ((run.pos / m.w) | 0) + DY[d]; if (x >= 0 && y >= 0 && x < m.w && y < m.h && m.t[y * m.w + x]) reason = m.doorAt[ni] ? 'door' : 'gate'; } return { ok: false, reason }; }
    const res = { ok: true, to: s.pos, coin: false, gem: false, key: 0, done: false, wait: d === 4 };
    run.pos = s.pos; run.tk++; run.moves++; run.log += DCH[d];
    if (s.mask !== run.mask) res.key = (s.mask & ~run.mask) ? Math.log2(s.mask & ~run.mask) + 1 : 0;
    run.mask = s.mask;
    if (d < 4) { const k = run.route.lastIndexOf(s.pos); if (k >= 0) run.route.length = k + 1; else run.route.push(s.pos); }
    run.vis[s.pos] = 1;
    if (m.coinAt[s.pos] && !run.coins.has(s.pos)) { run.coins.add(s.pos); res.coin = true; }
    if (m.gemAt[s.pos] && !run.gems.has(s.pos)) { run.gems.add(s.pos); res.gem = true; }
    if (run.seen) markSeen(run);
    if (s.pos === m.goal) { run.done = true; res.done = true; }
    return res;
  }
  const degree = (m, i) => floorN(m.t, m.w, m.h, i % m.w, (i / m.w) | 0);
  // 「もどる」：いまの道すじ（ループを消した道）を、ひとつ前の分かれ道まで戻る手順（実際に歩くので手数にもなる）
  function undoJunction(run) {
    const m = run.m, r = run.route, n = r.length; if (n < 2) return [];
    let k = 0; for (let i = n - 2; i >= 1; i--) if (degree(m, r[i]) >= 3) { k = i; break; }
    const dirs = [];
    for (let i = n - 1; i > k; i--) { const a = r[i], b = r[i - 1], dx = (b % m.w) - (a % m.w), dy = ((b / m.w) | 0) - ((a / m.w) | 0); dirs.push(dx === 1 ? 1 : dx === -1 ? 3 : dy === 1 ? 2 : 0); }
    return dirs;
  }
  function hintPath(run) { return search(run.m, run.pos, run.mask, run.tk % run.m.P); }
  function replay(m, log, upto) { const run = newRun(m); const n = upto == null ? log.length : Math.min(upto, log.length); for (let i = 0; i < n; i++) { const d = DCH.indexOf(log[i]); if (d < 0 || !step(run, d).ok) break; } return run; }
  // ゴーストの位置（動くたびのタイル番号の列）
  function ghostPath(m, log) { const run = newRun(m), out = [m.start]; for (let i = 0; i < log.length; i++) { const d = DCH.indexOf(log[i]); if (d < 0 || !step(run, d).ok) break; out.push(run.pos); } return out; }

  // きり：まっすぐ見通せて半径 r 以内のタイル（途中のタイルが壁なら見えない。壁そのものは見える）
  function visible(m, pos, r) {
    const W = m.w, H = m.h, px = pos % W, py = (pos / W) | 0, out = [];
    for (let y = Math.max(0, py - r); y <= Math.min(H - 1, py + r); y++) for (let x = Math.max(0, px - r); x <= Math.min(W - 1, px + r); x++) {
      const dx = x - px, dy = y - py; if (dx * dx + dy * dy > r * r + 0.5) continue;
      const n = Math.max(Math.abs(dx), Math.abs(dy)); let ok = true;
      for (let k = 1; k < n; k++) { const cx = px + Math.round(dx * k / n), cy = py + Math.round(dy * k / n); if (!m.t[cy * W + cx]) { ok = false; break; } }
      if (ok) out.push(y * W + x);
    }
    return out;
  }

  // ---------------------------------------------------------------- ★・点数
  const STAR_K = { classic: [1.25, 2.2], fog: [2.2, 4], d3: [2.2, 4], keys: [1.3, 2.4], timed: [1.3, 2.2] };
  // assist: { hints, reveal } ヒントを使うと★は2まで、全部見せると1まで
  function starsFor(m, moves, assist) {
    const k = STAR_K[m.mode] || STAR_K.classic; let s = moves <= Math.ceil(m.par * k[0] - 1e-9) ? 3 : moves <= Math.ceil(m.par * k[1] - 1e-9) ? 2 : 1;
    if (assist && assist.reveal) s = Math.min(s, 1); else if (assist && assist.hints) s = Math.min(s, 2);
    return s;
  }
  const starLimits = m => { const k = STAR_K[m.mode] || STAR_K.classic; return [Math.ceil(m.par * k[0] - 1e-9), Math.ceil(m.par * k[1] - 1e-9)]; };

  // ---------------------------------------------------------------- 合言葉・毎日・どこまでも
  function parseCode(str) {
    const s = String(str || '').trim().replace(/[\s　]+/g, '').replace(/[ー－―—–−]/g, '-');
    let m = /^e-(\d{1,3})-(\d{1,9})$/i.exec(s);
    if (m) { const level = +m[1]; if (level < 1 || level > 999) return null; return { endless: true, level, seed: +m[2], code: 'e-' + level + '-' + (+m[2]) }; }
    m = /^([cf3kt])-(xs|s|m|l|xl)(?:-([123]))?-(\d{1,9})$/i.exec(s);
    if (!m) return null;
    const size = m[2].toUpperCase(), diff = m[3] ? +m[3] : 2, seed = +m[4];
    return { mode: CHM[m[1].toLowerCase()], size, diff, seed, code: m[1].toLowerCase() + '-' + size + '-' + diff + '-' + seed };
  }
  function dailyParams(seed) {
    const r = mulberry32(seed >>> 0), mode = MODES[ri(r, MODES.length)], size = ['S', 'M', 'M', 'L'][ri(r, 4)], diff = 2 + ri(r, 2), sd = ri(r, SEED_MAX + 1);
    return { mode, size, diff, seed: sd, code: MCH[mode] + '-' + size + '-' + diff + '-' + sd };
  }
  function endlessParams(level, seed) {
    level = Math.max(1, level | 0); const n = Math.min(61, 9 + 2 * Math.floor((level - 1) * 1.5));
    const mode = ['classic', 'classic', 'fog', 'keys', 'classic', 'timed'][(level - 1) % 6], diff = 1 + Math.min(2, Math.floor((level - 1) / 8));
    return { mode, n, diff, seed: hash32('en|' + seed + '|' + level) % (SEED_MAX + 1), code: 'e-' + level + '-' + seed };
  }
  function endlessLimitMs(level, par) { return Math.round((14 + par * 0.8) * Math.max(0.7, 1.15 - level * 0.02)) * 1000; }
  function endlessScore(level, leftMs, coins) { return 100 + level * 20 + Math.floor(Math.max(0, leftMs) / 1000) * 2 + coins * 10; }
  function fromCode(str) {
    const c = typeof str === 'string' ? parseCode(str) : str; if (!c) return null;
    if (c.endless) { const p = endlessParams(c.level, c.seed); const m = generate(p); m.code = c.code; m.level = c.level; return m; }
    return generate({ mode: c.mode, size: c.size, diff: c.diff, seed: c.seed, code: c.code });
  }

  // ---------------------------------------------------------------- 検査（テスト用）
  // 問題の文字列の配列を返す。空なら正しい迷路
  function check(m) {
    const bad = [], { w: W, h: H, t } = m;
    if (W !== H || !(W & 1) || W < 7 || W > 61) bad.push('size ' + W + 'x' + H);
    for (let i = 0; i < W; i++) if (t[i] || t[(H - 1) * W + i] || t[i * W] || t[i * W + W - 1]) { bad.push('border is not a wall'); break; }
    if (!t[m.start] || !t[m.goal]) bad.push('start or goal is a wall');
    if (m.start === m.goal) bad.push('start equals goal');
    let nf = 0; for (let i = 0; i < t.length; i++) if (t[i]) nf++;
    if (reachCount(t, W, H, m.start) !== nf) bad.push('not connected (' + reachCount(t, W, H, m.start) + '/' + nf + ')');
    const s = search(m, m.start, 0, 0); if (!s) bad.push('unsolvable'); else if (s.len !== m.par) bad.push('par ' + m.par + ' != ' + s.len);
    for (const c of m.coins.concat(m.gems, m.keys.map(k => k.i))) if (!t[c]) bad.push('item in a wall');
    return bad;
  }
  // 完全迷路（ループがない）か：床タイルの数 - つながり数 = 1 かつ ... 床の数 V, 通路（床どうしのとなり）E, E = V - 1
  function isPerfect(m) { const { w: W, h: H, t } = m; let V = 0, E = 0; for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (t[y * W + x]) { V++; if (x + 1 < W && t[y * W + x + 1]) E++; if (y + 1 < H && t[(y + 1) * W + x]) E++; } return E === V - 1; }
  // ただの四角い広間があるとループ（E=V-1 にならない）。セル迷路のループ数はタイル格子で数える：E - V + 1（2x2 の床の塊は数えない）
  function loopCount(m) {
    const { w: W, h: H, t } = m; let V = 0, E = 0, sq = 0;
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (t[y * W + x]) { V++; if (x + 1 < W && t[y * W + x + 1]) E++; if (y + 1 < H && t[(y + 1) * W + x]) E++; if (x + 1 < W && y + 1 < H && t[y * W + x + 1] && t[(y + 1) * W + x] && t[(y + 1) * W + x + 1]) sq++; }
    return E - V + 1 - sq;
  }
  const deadEnds = m => { let n = 0; for (let i = 0; i < m.t.length; i++) if (m.t[i] && degree(m, i) === 1) n++; return n; };

  // ---------------------------------------------------------------- ずかん（40のせかい）
  // [id, 日本語, English, 壁, 床, 差し色, 壁のもよう, ひらく条件]
  // 条件：stars=★の合計 clears=クリア数 coins gems daily=毎日クリアの日数 streak=毎日の最長れんぞく depth=どこまでもの最深 three=★3の数 mode:クラシック等のクリア数
  const W_ = (id, ja, en, wall, floor, acc, pat, req) => ({ id, ja, en, wall, floor, acc, pat, req });
  const WORLDS = [
    W_('forest', 'もりの小道', 'Forest Path', '#3d7a3a', '#dccb9b', '#f2c14e', 'hedge', ['stars', 0]),
    W_('castle', 'こもれびの城', 'Sunlit Castle', '#8c8f9c', '#d9d2c3', '#c9482f', 'stone', ['stars', 0]),
    W_('icecave', 'こおりの洞くつ', 'Ice Cave', '#7fc2e3', '#e8f5fb', '#3a7ca8', 'ice', ['clears', 2]),
    W_('desert', 'さばくの遺跡', 'Desert Ruins', '#c99a55', '#f0dcae', '#b4452a', 'sand', ['clears', 4]),
    W_('garden', 'ばらの生けがき', 'Rose Hedge', '#2f8a5a', '#e7e0b8', '#e0507a', 'hedge', ['coins', 10]),
    W_('mine', 'きらめく鉱山', 'Glimmer Mine', '#5a5470', '#2a2638', '#7be0e6', 'crystal', ['clears', 6]),
    W_('beach', 'なみうちぎわ', 'Seaside', '#e2b98a', '#f6ecd0', '#2e8bc0', 'waves', ['stars', 4]),
    W_('autumn', 'もみじの公園', 'Autumn Park', '#b5532a', '#ecd6a4', '#f0a02b', 'hedge', ['coins', 25]),
    W_('snow', 'ゆきの村', 'Snow Village', '#a9b9c8', '#f7fafc', '#d94b4b', 'ice', ['stars', 8]),
    W_('library', 'ほしの図書室', 'Starlit Library', '#6b4a32', '#cdb58a', '#e4b43a', 'wood', ['clears', 10]),
    W_('volcano', 'ひのやま', 'Ember Mountain', '#4a2e2a', '#e08a4a', '#ffd23a', 'stone', ['mode:keys', 2]),
    W_('candy', 'おかしの国', 'Candy Land', '#f089b3', '#fff1d9', '#7a4bd0', 'stripes', ['stars', 12]),
    W_('sea', 'うみのそこ', 'Deep Sea', '#2c6e9e', '#0e2a45', '#ffc857', 'scales', ['gems', 1]),
    W_('toybox', 'おもちゃ箱', 'Toy Box', '#e1573b', '#f6e7bf', '#2f77d1', 'dots', ['clears', 15]),
    W_('mushroom', 'きのこの森', 'Mushroom Grove', '#9c4f72', '#3a2e3f', '#f6d36b', 'dots', ['mode:fog', 3]),
    W_('bamboo', 'たけやぶ', 'Bamboo Thicket', '#4f9a4a', '#e8dfb0', '#d9a441', 'stripes', ['stars', 18]),
    W_('moon', 'つきの庭', 'Moon Garden', '#6f7fa8', '#d3d9ec', '#ffe27a', 'crystal', ['coins', 60]),
    W_('clock', 'とけいの塔', 'Clockwork Tower', '#8a6a3a', '#3b3226', '#e8c25a', 'metal', ['mode:timed', 3]),
    W_('sakura', 'さくらの小道', 'Cherry Blossom Lane', '#e79ab6', '#fbeee9', '#8a4a5e', 'dots', ['stars', 24]),
    W_('orchard', 'くだもの果樹園', 'Fruit Orchard', '#6f9a35', '#f3e3b3', '#e0503a', 'dots', ['clears', 30]),
    W_('jungle', 'ジャングルの神殿', 'Jungle Temple', '#4a7a3f', '#c9b77f', '#e9b52c', 'stone', ['clears', 25]),
    W_('canyon', 'あかい谷', 'Red Canyon', '#b6542f', '#eecb9a', '#3e7f9a', 'sand', ['three', 3]),
    W_('swamp', 'しずかな沼', 'Quiet Swamp', '#3f5a30', '#aebb8e', '#c9e06b', 'waves', ['coins', 100]),
    W_('lighthouse', 'とうだいの岬', 'Lighthouse Cape', '#d9dde3', '#9ab6cc', '#d6403a', 'brick', ['stars', 30]),
    W_('market', '夜のにぎわい市', 'Night Market', '#7a3a5a', '#2b2036', '#ffb347', 'brick', ['daily', 3]),
    W_('aurora', 'オーロラの原', 'Aurora Fields', '#4fb59a', '#122a3a', '#c8a2ff', 'ice', ['depth', 5]),
    W_('pyramid', 'ピラミッド', 'Pyramid', '#d2a95a', '#8a6a35', '#2d9c8a', 'sand', ['gems', 5]),
    W_('neon', 'ネオンの街', 'Neon City', '#4b4fb8', '#0d0f24', '#ff4fb3', 'metal', ['stars', 38]),
    W_('paper', 'かみ細工', 'Paper Craft', '#f8f0dc', '#c9b48a', '#e0583a', 'stripes', ['clears', 40]),
    W_('pixel', 'ドットの国', 'Pixel Land', '#3a7a3a', '#101a2e', '#ffd23a', 'brick', ['three', 10]),
    W_('steam', 'じょうきの工場', 'Steam Works', '#6a5a4a', '#cbbb9a', '#d98a2a', 'metal', ['mode:d3', 5]),
    W_('dream', 'ゆめのまくら', 'Dream Pillows', '#b69be0', '#f5eefc', '#ff9ec6', 'waves', ['streak', 3]),
    W_('stars', 'ほしぞら回廊', 'Starfield Hall', '#2a3a7a', '#0a0f2a', '#fff2a8', 'crystal', ['stars', 48]),
    W_('coral', 'さんごの礁', 'Coral Reef', '#e8604a', '#a4e8e0', '#fff3b0', 'scales', ['gems', 12]),
    W_('glacier', 'ひょうがの谷', 'Glacier Valley', '#5aa6c8', '#dff1f8', '#0f4c75', 'ice', ['depth', 12]),
    W_('savanna', 'サバンナ', 'Savanna', '#b88a4a', '#e9d9a0', '#4f8a3a', 'sand', ['coins', 200]),
    W_('tea', 'おちゃの庭', 'Tea Garden', '#3f6f3a', '#d9d0a8', '#c0a14a', 'hedge', ['daily', 7]),
    W_('skybridge', 'そらのかけ橋', 'Sky Bridge', '#9ac7ee', '#f3f8fd', '#e8a13a', 'brick', ['stars', 60]),
    W_('ruins', 'うみに沈んだ神殿', 'Sunken Temple', '#3b6f7a', '#1a3640', '#e6c24a', 'stone', ['three', 25]),
    W_('crown', 'さいごの王宮', 'Final Palace', '#c9a23a', '#3a2a5a', '#fff0b0', 'brick', ['stars', 75]),
  ];
  const WORLD_BY_ID = {}; for (const w of WORLDS) WORLD_BY_ID[w.id] = w;
  function progressOf(save, kind) {
    const s = save || {}, st = s.stats || {}, dl = s.dl || {}, en = s.en || {};
    switch (kind) {
      case 'stars': return s.stars | 0; case 'clears': return st.clears | 0; case 'coins': return s.coins | 0; case 'gems': return s.gems | 0;
      case 'daily': return dl.n | 0; case 'streak': return dl.bs | 0; case 'depth': return en.best | 0; case 'three': return st.three | 0;
      default: if (kind.indexOf('mode:') === 0) return st[kind.slice(5)] | 0; return 0;
    }
  }
  const worldUnlocked = (save, w) => progressOf(save, w.req[0]) >= w.req[1];
  const MAX_STARS = SIZES.length * MODES.length * 3 + 5 + 5;
  const slotKey = (mode, size) => mode + '.' + size;
  // ★の合計＝ランキング。b（モード×大きさの最高）と、どこまでも・毎日のしるし
  function totalStars(save) {
    const b = (save && save.b) || {}; let s = 0;
    for (const md of MODES) for (const z of SIZES) { const r = b[slotKey(md, z.id)]; if (r) s += Math.max(0, Math.min(3, r.s | 0)); }
    const depth = ((save && save.en && save.en.best) | 0), days = ((save && save.dl && save.dl.n) | 0);
    s += [5, 10, 15, 20, 30].filter(x => depth >= x).length + [1, 3, 7, 14, 30].filter(x => days >= x).length;
    return s;
  }

  const api = {
    DX, DY, DCH, SIZES, MODES, MCH, GENS, PERFECT, PERIOD, DIFFS, POOLS, FOG_R, SEED_MAX, STAR_K,
    mulberry32, hash32, sizeById, generate, normParams, pickGen, buildBase, finalize, codeOf, bfsDist, shortestPath, search, move, routeTo, gateOpen,
    newRun, step, undoJunction, hintPath, replay, ghostPath, visible, starsFor, starLimits, parseCode, dailyParams, endlessParams, endlessLimitMs, endlessScore, fromCode,
    check, isPerfect, loopCount, deadEnds, degree, WORLDS, WORLD_BY_ID, worldUnlocked, progressOf, totalStars, slotKey, MAX_STARS,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.MazeEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
