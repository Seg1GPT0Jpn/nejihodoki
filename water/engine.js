// いろみず分け：ステージの生成・ソルバー・ルール（ページと node の検証で共通）
// ---------------------------------------------------------------------------------
// 読み込み：ブラウザでは <script src="engine.js"></script>（classic script。window.WaterEngine）。
//           node では const E = require('./water/engine.js')。外のモジュールには頼らない。
// 決まりごと：generate(L, salt) は、同じ L と salt なら、どの端末でも同じ問題を返す。生成の部分（rng〜generate）は
//   water/index.html の旧 Engine をそのまま移したもので、1〜300 の問題が前と同じであることを確かめてある
//   （P2-water の確認スクリプト）。生成のコードを変えると、遊んでいる人のステージが変わるので、変えないこと。
//
//   E.generate(L, salt?) → pz { L, spec, K, colors, tubes, caps, locks, hid, moves, sol, tried, inBand, trap }
//   E.solve / moves / apply / legal / isDone / isWin / doneCount / runLen / openSet / keyOf / makeMeta / spec / rng
//   遊ぶときのルール（ページもこれを使う。リプレイの検証も同じ関数で行う）：
//     E.newGame(pz) → g { K, tubes, hid, caps, locks, open, done, history, moves, undos, hintsUsed, extraUsed, log }
//     E.canPour(g, f, t) → 移る段数（0 = 注げない） / E.pour(g, f, t) → { n, color, before, newly, opened, revealed } | null
//     E.undo(g) → bool / E.addTube(g) → bool / E.useHint(g) / E.hintMove(g) → { move } | { aborted } | { none }
//     E.stuck(g) / E.won(g) / E.meta(g)（開いた錠はそのまま開いている）
//     g.log：操作の記録。注ぐ = 試験管の番号2文字（36進）、'U' = 戻す、'X' = 試験管を追加、'H' = ヒント
//     E.replay(pz, log) → { ok, g, won, err }   記録を最初から当てはめ直す（途中の盤の復元と検証）
//   デイリー（SYSTEM_ARCHITECTURE.md 6章）：
//     E.daily(seed) → [{ L, salt }]（3問。中くらいの難しさ）、E.dailyPuzzles(seed) → [pz]
//     E.dailyScore({ pours, hints, extra, ms }) = 100000 − (手数 + ヒント×5 + 追加×10)×100 − 秒（最低1）
//     E.encodeReplay({ seed, ms, logs }) → 'w1|seed|ms|log0|log1|log2'、E.verify(str) → { ok, score, pours, hints, extra, err }
(function (root) {
  'use strict';
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) | 0; let t = Math.imul(a ^ (a >>> 15), 1 | a); t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t; return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  // ---- level design: smooth curve, gimmicks unlock gradually ----
  const COLOR_STEPS = [[1, 3], [3, 4], [6, 5], [10, 6], [15, 7], [21, 8], [28, 9], [37, 10], [48, 11], [62, 12]];
  // salt (optional, 32-bit): a different puzzle family for the same level number (online battles); 0 = the normal stages
  function spec(L, salt) {
    const r = rng((L * 7919 + 13) ^ (salt | 0));
    let colors = 3;
    for (const [lv, c] of COLOR_STEPS) if (L >= lv) colors = c;
    let cap = 4;
    if (L >= 100) cap = 5;                                        // capacity 5 from level 100
    if (cap === 5) colors = Math.min(colors, 9 + Math.floor((L - 100) / 20)); // ease the step to 5
    let empties = 2;
    if (L >= 80 && L % 4 === 3) empties = 1;                      // occasionally only one spare tube
    const gim = { hidden: 0, lock: 0, tall: 0 };
    if (L >= 12 && (L === 12 || r() < 0.4)) gim.hidden = L < 30 ? 0.5 : 0.55 + 0.1 * Math.floor(r() * 4);    // share of tubes with ？ layers
    if (L >= 25 && (L === 25 || r() < 0.3)) gim.lock = L < 60 ? 1 : 1 + (r() < 0.5 ? 1 : 0);
    if (L >= 40 && (L === 40 || r() < 0.25)) gim.tall = 1;
    // target band for solver moves (near-minimum) — grows with colors and level
    const units = colors * cap;
    const lo = Math.round(units * (0.66 + 0.1 * Math.min(L, 300) / 300));
    const band = { lo, hi: Math.round(units * 0.84 + 3) };
    return { L, colors, cap, empties, gim, band };
  }

  // ---- solver ----
  // state: array of tubes, each array of color ints (bottom→top)
  // meta: caps[], locks[] (0 = none, N = opens after N colors done), K = units per color
  function isDone(t, K) { if (t.length !== K) return false; for (let i = 1; i < K; i++) if (t[i] !== t[0]) return false; return true; }
  function doneCount(st, K) { let n = 0; for (const t of st) if (isDone(t, K)) n++; return n; }
  function isWin(st, K) { for (const t of st) if (t.length && !isDone(t, K)) return false; return true; }
  function runLen(t) { const n = t.length; if (!n) return 0; const c = t[n - 1]; let k = 1; while (k < n && t[n - 1 - k] === c) k++; return k; }
  function keyOf(st, meta) {
    const a = new Array(st.length);
    for (let i = 0; i < st.length; i++) a[i] = meta.tag[i] + String.fromCharCode.apply(null, st[i].map(c => 97 + c));
    return a.sort().join(',');
  }
  function legal(st, meta, from, to, unlockedSet) {
    if (from === to) return 0;
    const a = st[from], b = st[to];
    if (!a.length) return 0;
    if (unlockedSet && (!unlockedSet[from] || !unlockedSet[to])) return 0;
    const space = meta.caps[to] - b.length;
    if (space <= 0) return 0;
    if (b.length && b[b.length - 1] !== a[a.length - 1]) return 0;
    return Math.min(space, runLen(a));
  }
  function openSet(st, meta, stickyOpen) {
    const d = doneCount(st, meta.K), o = new Array(st.length);
    for (let i = 0; i < st.length; i++) o[i] = !meta.locks[i] || d >= meta.locks[i] || (stickyOpen && stickyOpen[i]);
    return o;
  }
  // useful moves (prunes pointless ones) for search
  function moves(st, meta) {
    const K = meta.K, open = openSet(st, meta), out = [];
    for (let i = 0; i < st.length; i++) {
      const a = st[i];
      if (!a.length || !open[i] || isDone(a, K)) continue;
      const rl = runLen(a), uniform = rl === a.length;
      let emptyTried = {};
      for (let j = 0; j < st.length; j++) {
        if (i === j || !open[j]) continue;
        const b = st[j];
        const n = legal(st, meta, i, j);
        if (!n) continue;
        if (!b.length) {
          if (uniform && meta.caps[j] <= meta.caps[i]) continue; // moving a pure tube into an empty one is pointless
          if (emptyTried[meta.caps[j]]) continue;
          emptyTried[meta.caps[j]] = 1;
        }
        out.push([i, j, n]);
      }
    }
    return out;
  }
  function apply(st, m) {
    const s = st.slice(); const a = s[m[0]].slice(), b = s[m[1]].slice();
    for (let k = 0; k < m[2]; k++) b.push(a.pop());
    s[m[0]] = a; s[m[1]] = b; return s;
  }
  function heur(st, meta) {
    let h = 0; const bottoms = {};
    for (const t of st) {
      if (!t.length) continue;
      let segs = 1; for (let i = 1; i < t.length; i++) if (t[i] !== t[i - 1]) segs++;
      h += segs - 1;
      bottoms[t[0]] = (bottoms[t[0]] || 0) + 1;
    }
    for (const c in bottoms) h += bottoms[c] - 1;
    return h;
  }
  // weighted best-first search -> near-minimum solution (array of moves) or null
  function solve(st, meta, opts) {
    opts = opts || {};
    const limit = opts.limit || 40000, w = opts.w || 1.6;
    const heap = []; const push = (n) => { heap.push(n); let i = heap.length - 1; while (i) { const p = (i - 1) >> 1; if (heap[p].f <= n.f) break; heap[i] = heap[p]; i = p; } heap[i] = n; };
    const pop = () => { const top = heap[0], last = heap.pop(); if (heap.length) { let i = 0; for (;;) { let l = 2 * i + 1, r = l + 1, m = i; if (l < heap.length && heap[l].f < (m === i ? last.f : heap[m].f)) m = l; if (r < heap.length && heap[r].f < (m === i ? last.f : heap[m].f)) m = r; if (m === i) break; heap[i] = heap[m]; i = m; } heap[i] = last; } return top; };
    const seen = new Map();
    const start = { s: st, g: 0, f: w * heur(st, meta), m: null, p: null };
    seen.set(keyOf(st, meta), 0); push(start);
    let n = 0;
    while (heap.length) {
      const cur = pop();
      if (isWin(cur.s, meta.K)) { const path = []; for (let c = cur; c.p; c = c.p) path.push(c.m); path.reverse(); return { path, nodes: n }; }
      if (++n > limit) return { path: null, nodes: n, aborted: true };
      for (const m of moves(cur.s, meta)) {
        const s2 = apply(cur.s, m), k = keyOf(s2, meta), g = cur.g + 1;
        const old = seen.get(k);
        if (old !== undefined && old <= g) continue;
        seen.set(k, g);
        push({ s: s2, g, f: g + w * heur(s2, meta), m, p: cur });
      }
    }
    return { path: null, nodes: n };
  }
  // random-player trap rate: share of random playouts that get stuck
  function trapRate(st, meta, r, tries) {
    let stuck = 0;
    for (let t = 0; t < tries; t++) {
      let s = st; const seen = new Set([keyOf(s, meta)]);
      for (let step = 0; step < 400; step++) {
        if (isWin(s, meta.K)) break;
        const ms = moves(s, meta).map(m => apply(s, m)).filter(s2 => !seen.has(keyOf(s2, meta)));
        if (!ms.length) { stuck++; break; }
        s = ms[Math.floor(r() * ms.length)]; seen.add(keyOf(s, meta));
      }
    }
    return stuck / tries;
  }
  function makeMeta(caps, locks, K) {
    return { caps, locks, K, tag: caps.map((c, i) => String.fromCharCode(65 + c) + (locks[i] ? String(locks[i]) : '') + ':') };
  }

  // ---- generator ----
  const cache = new Map();
  function generate(L, salt) {
    salt = salt | 0;
    const ck = salt ? L + ':' + salt : L;
    if (cache.has(ck)) return cache.get(ck);
    const sp = spec(L, salt), r = rng(((L * 2654435761 + 7) >>> 0) ^ salt);
    const K = sp.cap, C = sp.colors;
    let best = null, bestErr = Infinity, tried = 0;
    const MAXC = 40;
    for (let cand = 0; cand < MAXC; cand++) {
      tried++;
      const units = []; for (let c = 0; c < C; c++) for (let k = 0; k < K; k++) units.push(c);
      for (let i = units.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [units[i], units[j]] = [units[j], units[i]]; }
      const tubes = [];
      if (sp.empties >= 2) { for (let i = 0; i < C; i++) tubes.push(units.slice(i * K, i * K + K)); }
      else { // one empty tube: the other spare space is scattered over C+1 partly filled tubes
        const lens = new Array(C + 1).fill(K); let rem = K;
        while (rem > 0) { const i = Math.floor(r() * (C + 1)); if (lens[i] > K - 2) { lens[i]--; rem--; } }
        let p = 0; for (const n of lens) { tubes.push(units.slice(p, p + n)); p += n; }
      }
      // reject boring starts: a tube already 3+ same at top/bottom chunk
      let boring = false;
      for (const t of tubes) { if (!t.length) { boring = true; continue; } let m = 1, run = 1; for (let i = 1; i < K; i++) { run = t[i] === t[i - 1] ? run + 1 : 1; m = Math.max(m, run); } if (m >= K - 1 && C > 3) boring = true; if (m === t.length && t.length > 1) boring = true; }
      if (boring) continue;
      const caps = tubes.map(() => K), locks = tubes.map(() => 0);
      for (let e = 0; e < (sp.empties >= 2 ? 2 : 1); e++) { tubes.push([]); caps.push(K); locks.push(0); }
      if (sp.gim.tall) caps[caps.length - 1] = K + 2;
      if (sp.gim.lock) { const li = Math.floor(r() * (tubes.length - (sp.empties >= 2 ? 2 : 1))); locks[li] = sp.gim.lock; }
      const meta = makeMeta(caps, locks, K);
      const res = solve(tubes, meta, { limit: C >= 10 ? 12000 : 8000 });
      if (!res.path) continue;
      const moves = res.path.length;
      const err = moves < sp.band.lo ? (sp.band.lo - moves) * 3 : moves > sp.band.hi ? moves - sp.band.hi : 0;
      const pz = { tubes, caps, locks, K, moves, sol: res.path, nodes: res.nodes };
      if (err < bestErr) { best = pz; bestErr = err; }
      if (err === 0 && cand >= 2) break; // take an in-band candidate after looking at a few
    }
    if (!best) { // fallback: always solvable (should not happen) – 2 colors swapped
      throw new Error('no puzzle for level ' + L);
    }
    // hidden layers: everything below the top is ？ in chosen tubes
    const hid = best.tubes.map(t => t.map(() => false));
    if (sp.gim.hidden) {
      const idx = []; best.tubes.forEach((t, i) => { if (t.length > 1) idx.push(i); });
      const n = Math.max(1, Math.round(idx.length * sp.gim.hidden));
      for (let i = idx.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [idx[i], idx[j]] = [idx[j], idx[i]]; }
      for (const i of idx.slice(0, n)) for (let k = 0; k < best.tubes[i].length - 1; k++) hid[i][k] = true;
    }
    const out = { L, spec: sp, K, colors: C, tubes: best.tubes, caps: best.caps, locks: best.locks, hid, moves: best.moves, sol: best.sol, tried, inBand: bestErr === 0 };
    out.trap = trapRate(best.tubes, makeMeta(best.caps, best.locks, K), rng((L + 99) ^ salt), 24);
    cache.set(ck, out);
    return out;
  }

  // ---- play state: the rules the page uses, and replay verification ----
  const HINTS_PER_LEVEL = 3;
  const CODE = '0123456789abcdefghijklmnopqrstuvwxyz';
  function newGame(pz) {
    const g = {
      K: pz.K,
      tubes: pz.tubes.map(t => t.slice()), hid: pz.hid.map(h => h.slice()),
      caps: pz.caps.slice(), locks: pz.locks.slice(), open: pz.locks.map(n => !n),
      done: [], history: [], moves: 0, undos: 0, hintsUsed: 0, extraUsed: 0, log: '',
    };
    g.done = g.tubes.map(t => isDone(t, g.K));
    return g;
  }
  function canPour(g, f, t) {
    const n = g.tubes.length;
    if (f === t || !(f >= 0 && f < n && t >= 0 && t < n) || !g.open[f] || !g.open[t]) return 0;
    return legal(g.tubes, { caps: g.caps }, f, t);
  }
  // pour f → t. Completed tubes (cork), reveals and locks are judged on the new state.
  function pour(g, f, t) {
    if (isWin(g.tubes, g.K) || g.done[f]) return null;
    const n = canPour(g, f, t);
    if (!n) return null;
    const src = g.tubes[f], dst = g.tubes[t];
    const color = src[src.length - 1];
    const before = { src: src.slice(), dst: dst.slice(), srcHid: g.hid[f].slice(), dstHid: g.hid[t].slice() };
    for (let k = 0; k < n; k++) { dst.push(src.pop()); g.hid[f].pop(); g.hid[t].push(false); }
    g.history.push({ f, t, n });
    g.moves++;
    g.log += CODE[f] + CODE[t];
    const newly = [];
    g.tubes.forEach((tb, i) => { const d = isDone(tb, g.K); if (d && !g.done[i]) newly.push(i); g.done[i] = d; });
    const dc = doneCount(g.tubes, g.K), opened = [];
    g.locks.forEach((lk, i) => { if (lk && !g.open[i] && dc >= lk) { g.open[i] = true; opened.push(i); } });
    const revealed = [];
    g.tubes.forEach((tb, i) => { if (tb.length && g.hid[i][tb.length - 1]) { g.hid[i][tb.length - 1] = false; revealed.push(i); } });
    return { n, color, before, newly, opened, revealed };
  }
  // undo the last pour (free). Opened locks stay open and revealed colors stay revealed.
  function undo(g) {
    if (!g.history.length || isWin(g.tubes, g.K)) return false;
    const m = g.history.pop();
    for (let k = 0; k < m.n; k++) { g.tubes[m.f].push(g.tubes[m.t].pop()); g.hid[m.t].pop(); g.hid[m.f].push(false); }
    g.undos++;
    g.log += 'U';
    g.done = g.tubes.map(t => isDone(t, g.K));
    return true;
  }
  function addTube(g) {
    if (g.extraUsed || isWin(g.tubes, g.K)) return false;
    g.extraUsed = 1;
    g.tubes.push([]); g.hid.push([]); g.caps.push(g.K); g.locks.push(0); g.open.push(true); g.done.push(false);
    g.log += 'X';
    return true;
  }
  function useHint(g) {
    if (g.hintsUsed >= HINTS_PER_LEVEL || isWin(g.tubes, g.K)) return false;
    g.hintsUsed++; g.log += 'H';
    return true;
  }
  // locks that were opened stay open (sticky), so the solver sees them as plain tubes
  function meta(g) { return makeMeta(g.caps, g.locks.map((n, i) => (g.open[i] ? 0 : n)), g.K); }
  function hintMove(g, opts) {
    const res = solve(g.tubes.map(t => t.slice()), meta(g), Object.assign({ limit: 60000, w: 2 }, opts || {}));
    if (!res.path) return res.aborted ? { aborted: true } : { none: true };
    if (!res.path.length) return { done: true };
    return { move: res.path[0], path: res.path };
  }
  function stuck(g) {
    for (let i = 0; i < g.tubes.length; i++) {
      const a = g.tubes[i];
      if (!a.length || g.done[i]) continue;
      for (let j = 0; j < g.tubes.length; j++) {
        if (!canPour(g, i, j)) continue;
        if (!g.tubes[j].length && runLen(a) === a.length) continue; // just moving a pure tube around
        return false;
      }
    }
    return true;
  }
  function won(g) { return isWin(g.tubes, g.K); }
  function replay(pz, log) {
    const g = newGame(pz);
    log = String(log == null ? '' : log);
    for (let i = 0; i < log.length; i++) {
      const c = log[i];
      let ok;
      if (c === 'U') ok = undo(g);
      else if (c === 'X') ok = addTube(g);
      else if (c === 'H') ok = useHint(g);
      else {
        const f = CODE.indexOf(c), t = CODE.indexOf(log[i + 1]);
        ok = f >= 0 && t >= 0 && !!pour(g, f, t);
        i++;
      }
      if (!ok) return { ok: false, g, won: won(g), err: 'bad action at ' + i };
    }
    return { ok: true, g, won: won(g) };
  }

  // ---- daily challenge: three medium puzzles from the day's seed ----
  const DAILY_LEVELS = [14, 27, 42];
  function mix(a, b) { let h = Math.imul((a | 0) ^ 0x9E3779B9, 0x85EBCA6B) ^ Math.imul((b | 0) + 0x632BE5AB, 0xC2B2AE35); h ^= h >>> 15; h = Math.imul(h, 0x2C1B3C6D); h ^= h >>> 12; return h | 0; }
  const dailyCache = new Map();
  function dailyBuild(seed) {
    seed = seed | 0;
    if (dailyCache.has(seed)) return dailyCache.get(seed);
    const salts = [], pzs = DAILY_LEVELS.map((L, i) => {
      for (let k = 0; k < 8; k++) {
        const salt = mix(seed, i * 16 + k) || 1;
        try { const pz = generate(L, salt); salts.push(salt); return pz; } catch (e) { /* try the next salt (same on every device) */ }
      }
      salts.push(0); return generate(L, 0);
    });
    const d = { pzs, salts };
    dailyCache.set(seed, d);
    return d;
  }
  function dailyPuzzles(seed) { return dailyBuild(seed).pzs; }
  function daily(seed) { const d = dailyBuild(seed); return d.pzs.map((pz, i) => ({ L: pz.L, salt: d.salts[i] })); }
  function dailyScore(r) {
    const p = Math.max(0, r.pours | 0) + 5 * Math.max(0, r.hints | 0) + 10 * Math.max(0, r.extra | 0);
    return Math.max(1, 100000 - p * 100 - Math.floor(Math.max(0, Number(r.ms) || 0) / 1000));
  }
  function encodeReplay(r) { return ['w1', r.seed | 0, Math.max(0, Math.round(Number(r.ms) || 0))].concat(r.logs || []).join('|'); }
  function verify(str) {
    const parts = String(str || '').split('|');
    if (parts[0] !== 'w1' || parts.length !== 3 + DAILY_LEVELS.length) return { ok: false, err: 'format' };
    const seed = parseInt(parts[1], 10) | 0, ms = Number(parts[2]);
    if (!isFinite(ms) || ms < 0) return { ok: false, err: 'time' };
    const pzs = dailyPuzzles(seed);
    let pours = 0, hints = 0, extra = 0;
    for (let i = 0; i < pzs.length; i++) {
      const r = replay(pzs[i], parts[3 + i]);
      if (!r.ok || !r.won) return { ok: false, err: 'puzzle ' + (i + 1) + ': ' + (r.err || 'not solved') };
      pours += r.g.moves; hints += r.g.hintsUsed; extra += r.g.extraUsed;
    }
    return { ok: true, seed, ms, pours, hints, extra, score: dailyScore({ pours, hints, extra, ms }) };
  }

  const Engine = {
    rng, spec, generate, solve, makeMeta, moves, apply, legal, isDone, isWin, doneCount, runLen, openSet, keyOf,
    HINTS_PER_LEVEL, newGame, canPour, pour, undo, addTube, useHint, meta, hintMove, stuck, won, replay,
    DAILY_LEVELS: DAILY_LEVELS.slice(), daily, dailyPuzzles, dailyScore, encodeReplay, verify,
  };
  root.WaterEngine = Engine;
  if (typeof module === 'object' && module && module.exports) module.exports = Engine;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
