// 59049 の中身（node でも動く）：3×3×3 の盤で「1列に同じ数字が3つ」で合体する決まり（slide）・いし・種つき乱数・
// ステージ12（ねらい・手数の上限・★）・ラッシュ（60手）・手を探すビームサーチ（ヒントと自動テスト）・端末だけの保存 kusoge.n59049.x。
// 画面・3D・保存・音は n59049/index.html。ステージは決まった結果：はじめの盤・いしの場所・出る数字の順番（種つき乱数）が毎回同じなので、
// 探索で「解ける」「★3がとれる」を確かめられる。ふつうのゲームとデイリーの決まり（slide・spawn の乱数の使い方）は今までどおり。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.N59049Engine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // ---------- rules ----------
  const idx = (x, y, z) => x + 3 * y + 9 * z;
  const coords = i => [i % 3, ((i / 3) | 0) % 3, (i / 9) | 0];
  const DIRS = { '+X': [0, 1], '-X': [0, -1], '+Y': [1, 1], '-Y': [1, -1], '+Z': [2, 1], '-Z': [2, -1] };
  const DIR_LIST = Object.keys(DIRS);
  const dirName = (a, s) => (s > 0 ? '+' : '-') + 'XYZ'[a];
  const pow3 = e => Math.pow(3, e);
  const GOAL_E = 10; // 3^10 = 59049

  // cells: 長さ27の {e,id}|null。タイルは「奥側」へ寄り、1列に同じ数字が3つあると1つになる（指数+1）。
  // stones: 長さ27の 0/1（いし。タイルは入れない・通れない。いしのある列は合体できない）
  function slide(cells, dir, stones) {
    const [a, s] = DIRS[dir];
    const o = [0, 1, 2].filter(k => k !== a);
    const out = new Array(27).fill(null), moves = [], merges = [];
    let gained = 0, changed = false;
    for (let u = 0; u < 3; u++) for (let w = 0; w < 3; w++) {
      const line = (s > 0 ? [2, 1, 0] : [0, 1, 2]).map(p => { const c = [0, 0, 0]; c[a] = p; c[o[0]] = u; c[o[1]] = w; return idx(c[0], c[1], c[2]); });
      if (stones && line.some(i => stones[i])) { // いしで区切られた短い区間ごとに寄せる（合体はしない）
        let seg = [];
        const flush = () => {
          const tiles = seg.filter(i => cells[i]).map(i => ({ t: cells[i], from: i }));
          tiles.forEach((t, k) => { out[seg[k]] = t.t; moves.push({ id: t.t.id, from: t.from, to: seg[k] }); if (t.from !== seg[k]) changed = true; });
          seg = [];
        };
        for (const i of line) { if (stones[i]) flush(); else seg.push(i); }
        flush();
        continue;
      }
      const tiles = line.filter(i => cells[i]).map(i => ({ t: cells[i], from: i }));
      if (tiles.length === 3 && tiles[0].t.e === tiles[1].t.e && tiles[1].t.e === tiles[2].t.e) {
        const e = tiles[0].t.e + 1, keep = tiles[0].t.id;
        out[line[0]] = { e, id: keep }; gained += pow3(e); changed = true;
        merges.push({ to: line[0], e, ids: tiles.map(t => t.t.id), keep });
        tiles.forEach(t => moves.push({ id: t.t.id, from: t.from, to: line[0] }));
      } else {
        tiles.forEach((t, k) => { out[line[k]] = t.t; moves.push({ id: t.t.id, from: t.from, to: line[k] }); if (t.from !== line[k]) changed = true; });
      }
    }
    return { cells: out, moves, merges, gained, changed };
  }
  const canMove = (cells, stones) => DIR_LIST.some(d => slide(cells, d, stones).changed);

  // 新しい数字：空きマスから1つ（3 が90%・9 が10%。p2 でステージごとに変えられる）。乱数の使い方（先にマス、次に数字）はデイリーと同じ
  function spawnPick(cells, stones, rnd, p2) {
    const empty = []; for (let i = 0; i < 27; i++) if (!cells[i] && !(stones && stones[i])) empty.push(i);
    if (!empty.length) return null;
    const i = empty[(rnd() * empty.length) | 0];
    return { i, e: rnd() < 1 - (p2 == null ? 0.1 : p2) ? 1 : 2 };
  }

  // 種つき乱数（common/platform.js の rng と同じ数列）。get/set で途中の状態を戻せる（もどす・先読み）
  function rng(seed) {
    let a = seed >>> 0;
    const next = () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
    return { next, get: () => a, set: v => { a = v >>> 0; } };
  }

  // ---------- goals ----------
  // k：tile＝指数 v（3^v）の数字を作る　score＝v 点　merges＝合体を v 回　two＝指数 v 以上の数字を盤に2つ同時に
  const GOAL_KINDS = ['tile', 'score', 'merges', 'two'];
  function maxExp(cells) { let m = 0; for (const c of cells) if (c && c.e > m) m = c.e; return m; }
  function goalMet(g, st) {
    if (!g) return false;
    if (g.k === 'tile') return st.maxE >= g.v;
    if (g.k === 'score') return st.score >= g.v;
    if (g.k === 'merges') return st.merges >= g.v;
    if (g.k === 'two') return st.cnt >= 2 && st.top2 >= g.v;
    return false;
  }
  const stat = sim => {
    const es = []; let maxE = 0;
    for (const c of sim.cells) if (c) { es.push(c.e); if (c.e > maxE) maxE = c.e; }
    es.sort((a, b) => b - a);
    return { score: sim.score, merges: sim.merges, maxE, cnt: es.length, top2: es.length >= 2 ? es[1] : 0 };
  };
  // 0〜1 の進み具合（ねらいのバー）
  function progress(g, sim) {
    if (!g) return 0;
    const st = stat(sim);
    if (g.k === 'tile') return Math.min(1, st.maxE / g.v);
    if (g.k === 'score') return Math.min(1, st.score / g.v);
    if (g.k === 'merges') return Math.min(1, st.merges / g.v);
    if (g.k === 'two') return Math.min(1, (st.maxE >= g.v ? 0.5 : 0.5 * st.maxE / g.v) + (st.top2 >= g.v ? 0.5 : 0.5 * st.top2 / g.v));
    return 0;
  }

  // ---------- simulation (the screen runs the same steps; this one has no animation) ----------
  // def：ステージ（start・stones・moves・goal・seed・p2）か、ラッシュ { moves, p2 }（goal なし・start なし＝ふつうに2つ出して始める）
  function newSim(def, seed) {
    const sim = { def, cells: new Array(27).fill(null), stones: new Array(27).fill(0), score: 0, merges: 0, moves: 0, left: def.moves, nextId: 1,
      rng: rng(seed != null ? seed : def.seed), over: false, won: false };
    (def.stones || []).forEach(i => { sim.stones[i] = 1; });
    if (def.start) def.start.forEach((e, i) => { if (e > 0) sim.cells[i] = { e, id: sim.nextId++ }; });
    else for (let k = 0; k < 2; k++) spawn(sim);
    return sim;
  }
  function spawn(sim) {
    const p = spawnPick(sim.cells, sim.stones, sim.rng.next, sim.def.p2);
    if (p) sim.cells[p.i] = { e: p.e, id: sim.nextId++ };
    return p;
  }
  function clone(sim) {
    return { def: sim.def, cells: sim.cells.slice(), stones: sim.stones, score: sim.score, merges: sim.merges, moves: sim.moves, left: sim.left, nextId: sim.nextId,
      rng: (() => { const r = rng(0); r.set(sim.rng.get()); return r; })(), over: sim.over, won: sim.won };
  }
  // 1手。うごかないときは false。うごいたら、新しい数字を出して、勝ち・おしまいを決める
  function step(sim, dir) {
    if (sim.over) return false;
    const r = slide(sim.cells, dir, sim.stones);
    if (!r.changed) return false;
    sim.cells = r.cells; sim.score += r.gained; sim.merges += r.merges.length; sim.moves++; sim.left--;
    spawn(sim);
    if (sim.def.goal && goalMet(sim.def.goal, stat(sim))) { sim.won = true; sim.over = true; }
    else if (sim.left <= 0 || !canMove(sim.cells, sim.stones)) sim.over = true;
    return true;
  }

  // 画面の今の盤から探索用の盤をつくる（ヒント）。rs＝乱数の今の状態、left＝残り手数
  function simFrom(def, cells, score, merges, left, rs) {
    const sim = newSim(def, 0);
    sim.cells = cells.map(c => (c ? { e: c.e, id: c.id } : null)); sim.score = score; sim.merges = merges; sim.left = left; sim.moves = (def.moves || 0) - left;
    sim.nextId = 1 + cells.reduce((m, c) => Math.max(m, c ? c.id : 0), 0); sim.rng.set(rs);
    return sim;
  }

  // ---------- planner (beam search; spawns are seeded so the plan is exact) ----------
  function heur(sim) {
    const g = sim.def.goal, st = stat(sim);
    let empties = 0, mass = 0;
    for (let i = 0; i < 27; i++) { const c = sim.cells[i]; if (c) mass += Math.pow(3, c.e * 1.5); else if (!sim.stones[i]) empties++; }
    let h = mass + empties * 6;
    if (!g) return h + sim.score * 0.5;
    if (g.k === 'score') return h * 0.3 + sim.score * 2;
    if (g.k === 'merges') return sim.merges * 400 + h * 0.2 + empties * 20;
    if (g.k === 'two') return h + Math.pow(3, st.top2 * 1.5) * 2;
    return h; // tile
  }
  // 現在の盤から、いちばん早く勝つ手順（なければ、いちばん見込みのある先頭の手）。{ won, path, left }
  function plan(sim0, o) {
    o = o || {};
    const width = o.width || 40, maxDepth = Math.min(sim0.left, o.depth || 200);
    let beam = [{ s: sim0, path: [] }], fallback = null;
    for (let d = 0; d < maxDepth && beam.length; d++) {
      const next = [], seen = new Set();
      for (const n of beam) for (const dir of DIR_LIST) {
        const c = clone(n.s);
        if (!step(c, dir)) continue;
        const path = n.path.concat(dir);
        if (c.won) return { won: true, path, left: c.left };
        if (c.over) continue;
        const key = c.cells.map(t => (t ? t.e : 0)).join('') + '|' + c.rng.get();
        if (seen.has(key)) continue; seen.add(key);
        next.push({ s: c, path, h: heur(c) });
      }
      next.sort((a, b) => b.h - a.h);
      beam = next.slice(0, width);
      if (beam.length) fallback = beam[0];
    }
    return { won: false, path: fallback ? fallback.path : [], left: 0 };
  }
  // ふつうのゲーム・デイリー用の、1手先を読むだけの欲ばりボット（これまでの __kb.step と同じ）
  function greedyMove(cells, stones) {
    let bestD = null, bv = -1e9;
    for (const d of DIR_LIST) {
      const r = slide(cells, d, stones); if (!r.changed) continue;
      let la = 0; for (const d2 of DIR_LIST) { const r2 = slide(r.cells, d2, stones); if (r2.changed) la = Math.max(la, r2.gained); }
      const v = r.gained * 2 + la + r.cells.filter(c => !c).length * 30;
      if (v > bv) { bv = v; bestD = d; }
    }
    return bestD;
  }

  // ---------- stages ----------
  // world：0=はじまりの部屋 1=いしの庭 2=いただき。start：はじめの盤（27個の指数、0=空）。stones：いしのマス。
  // moves：手数の上限　goal：ねらい　par：[★2 に必要な「残り手数」, ★3 に必要な残り手数]（早くクリアするほど★が増える）
  // seed：出る数字の順番の種　p2：9 が出る割合
  const WORLDS = [
    { id: 1, ja: 'はじまりの部屋' }, { id: 2, ja: 'いしの庭' }, { id: 3, ja: 'いただき' },
  ];
  const PER_WORLD = 4;
  const STAGE_DEFS = [
    { id: '1-1', name: 'はじめの一歩', seed: 8, moves: 22, par: [5,10], p2: 0.1, goal: { k: 'tile', v: 3 },
      stones: [],
      start: [0,0,0,0,0,0,0,0,0,0,0,0,0,0,2,0,1,0,0,1,0,0,0,0,0,0,1] },
    { id: '1-2', name: '三つそろえ', seed: 43, moves: 32, par: [7,14], p2: 0.1, goal: { k: 'tile', v: 4 },
      stones: [],
      start: [0,1,0,0,0,3,0,0,0,0,0,0,0,0,1,0,0,1,0,0,0,0,0,0,3,0,0] },
    { id: '1-3', name: '点をかせげ', seed: 1765, moves: 52, par: [11,22], p2: 0.1, goal: { k: 'score', v: 300 },
      stones: [],
      start: [0,0,0,0,0,0,0,0,0,0,3,0,3,0,2,0,0,0,0,2,3,0,0,0,0,0,0] },
    { id: '1-4', name: 'つながり', seed: 8, moves: 32, par: [7,14], p2: 0.1, goal: { k: 'merges', v: 7 },
      stones: [],
      start: [0,0,0,2,0,0,0,0,0,0,0,0,2,0,3,0,1,0,0,2,0,0,0,0,0,0,1] },
    { id: '2-1', name: 'まんなかの岩', seed: 22, moves: 44, par: [10,19], p2: 0.1, goal: { k: 'tile', v: 4 },
      stones: [13],
      start: [0,0,3,0,1,0,0,0,0,0,0,0,1,0,1,0,0,0,0,1,2,0,0,0,0,0,0] },
    { id: '2-2', name: 'ふたごの塔', seed: 330, moves: 24, par: [6,11], p2: 0.1, goal: { k: 'two', v: 3 },
      stones: [4,22],
      start: [2,0,0,1,0,0,0,0,0,1,0,0,2,2,0,0,1,0,2,0,0,0,0,0,0,0,0] },
    { id: '2-3', name: 'いしだたみ', seed: 15, moves: 68, par: [14,28], p2: 0.1, goal: { k: 'score', v: 500 },
      stones: [0,26,13],
      start: [0,0,0,4,0,2,0,3,0,4,0,0,0,0,0,0,0,0,0,2,0,0,0,3,0,0,0] },
    { id: '2-4', name: '柱の迷路', seed: 8, moves: 64, par: [14,27], p2: 0.1, goal: { k: 'tile', v: 5 },
      stones: [4,10,16,22],
      start: [3,0,0,2,0,0,1,3,0,0,0,0,2,1,0,0,0,0,0,2,0,0,0,0,0,0,4] },
    { id: '3-1', name: '高みのふたつ', seed: 8, moves: 52, par: [11,22], p2: 0.1, goal: { k: 'two', v: 4 },
      stones: [13,4],
      start: [0,2,0,2,0,0,1,0,0,0,0,0,2,0,4,0,1,0,0,2,0,0,0,0,0,0,2] },
    { id: '3-2', name: '雲の上', seed: 8, moves: 70, par: [15,29], p2: 0.1, goal: { k: 'two', v: 5 },
      stones: [13,1,25],
      start: [0,0,0,3,0,0,1,0,0,0,4,0,3,0,5,0,1,0,0,3,0,0,0,0,0,0,2] },
    { id: '3-3', name: 'せまい道', seed: 43, moves: 64, par: [14,27], p2: 0.1, goal: { k: 'score', v: 1200 },
      stones: [4,10,12,14,16,22],
      start: [4,1,0,0,0,3,0,5,0,0,0,0,0,0,0,0,0,0,0,0,0,4,0,0,5,2,5] },
    { id: '3-4', name: 'いただきへ', seed: 85, moves: 140, par: [29,57], p2: 0.1, goal: { k: 'tile', v: 6 },
      stones: [13,1,25],
      start: [5,0,0,0,1,0,0,1,0,0,0,0,0,0,4,5,0,0,4,0,0,0,0,0,0,0,0] }
  ];
  const STAGES = STAGE_DEFS.map((d, i) => Object.assign({ index: i, world: (i / PER_WORLD) | 0 }, d));
  const STAGE_N = STAGES.length;
  const stageById = id => STAGES.find(s => s.id === id) || null;
  const STAGE_TOOLS = { undo: 3, hint: 3 };
  // ★：ねらいを手数の上限の中で達成＝★1、残り手数が par[0] 以上＝★2、par[1] 以上＝★3（早くクリアするほど多い）。負けは 0
  function starsFor(stage, won, left) {
    if (!won) return 0;
    return left >= stage.par[1] ? 3 : left >= stage.par[0] ? 2 : 1;
  }
  // ラッシュ：60手でどこまで点をとれるか（ふつうの決まりのまま。もどすなし。ベストは小さい数字ではなく大きいほど良い）
  const RUSH = { moves: 60, p2: 0.1 };

  // ---------- 端末だけの保存 kusoge.n59049.x ----------
  // { v:1, s:[ステージごとの★0〜3], r:ラッシュのベスト点, c:最後に遊んだステージの番号 }。ふつうのベスト（kusoge.n59049.best＝ランキング）には触らない。
  function blankX() { return { v: 1, s: STAGES.map(() => 0), r: 0, c: 0 }; }
  function loadX(raw) {
    const o = blankX();
    try {
      const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!d || typeof d !== 'object') return o;
      if (Array.isArray(d.s)) for (let i = 0; i < o.s.length; i++) { const n = d.s[i] | 0; o.s[i] = n >= 1 && n <= 3 ? n : 0; }
      const r = Number(d.r); if (Number.isFinite(r) && r > 0 && r < 1e7) o.r = Math.floor(r);
      const c = d.c | 0; if (c >= 0 && c < STAGE_N) o.c = c;
    } catch (e) { /* こわれた保存は空として扱う */ }
    return o;
  }
  const writeX = x => JSON.stringify({ v: 1, s: x.s.slice(0, STAGE_N), r: x.r | 0, c: x.c | 0 });
  const unlocked = (x, i) => i === 0 || (x.s[i - 1] || 0) >= 1;
  const totalStars = x => x.s.reduce((a, b) => a + b, 0);
  // ★・ベストを上書きするのは良くなったときだけ。x を直接書きかえて、増えたかを返す
  function recordStage(x, i, stars) { x.c = i; if (stars > (x.s[i] || 0)) { x.s[i] = stars; return true; } return false; }
  function recordRush(x, score) { if (score > x.r) { x.r = Math.floor(score); return true; } return false; }

  // ---------- bots ----------
  // ステージを探索で解く（テストとヒント）。うまくいけば { won:true, path:[向き…], left }
  function solveStage(stage, o) { return plan(newSim(stage), o); }
  // ステージ・ラッシュを最後まで遊ぶボット。1回の探索の手順をたどり、ずれたら探し直す（出る数字は種で決まっているので、ふつうはずれない）
  function botPlay(def, o) {
    o = o || {};
    const sim = newSim(def, o.seed);
    let path = [];
    while (!sim.over) {
      if (!path.length) path = plan(sim, { width: o.width || 40, depth: o.depth || 200 }).path.slice();
      const d = path.shift() || greedyMove(sim.cells, sim.stones);
      if (!d || !step(sim, d)) { path = []; if (!d || !step(sim, greedyMove(sim.cells, sim.stones))) break; }
    }
    return sim;
  }

  return { idx, coords, DIRS, DIR_LIST, dirName, pow3, GOAL_E, slide, canMove, spawnPick, rng, GOAL_KINDS, goalMet, stat, progress, maxExp,
    newSim, simFrom, spawn, clone, step, plan, greedyMove, heur, WORLDS, PER_WORLD, STAGES, STAGE_N, stageById, STAGE_TOOLS, starsFor, RUSH,
    blankX, loadX, writeX, unlocked, totalStars, recordStage, recordRush, solveStage, botPlay };
});
