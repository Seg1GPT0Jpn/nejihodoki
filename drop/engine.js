// おちものタワーの中身（node でも動く）：ピースの形と出方・当たり判定・ライン判定と得点・12ステージ（ねらい付きの盤）・
// 画面なしで遊べる Sim（ステージの出方はページと同じ）・手を選ぶボット（デモとテスト）・進み具合の保存。
// 画面・保存・音・入力は drop/index.html。ピースの形・袋の中身・出る順番はデイリーの種に使うので変えない。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.DropEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const COLS = 9, ROWS = 16, HID = 2, H = ROWS + HID;   // 見えない2行が上にある
  const COLOR_N = 4;     // ゼリーの色 0〜3
  const STONE = 4;       // おじゃまブロック（ステージだけ。1列に入ると「そろい消し」にはならない）
  const SHAPES = {
    I3: { n: 3, c: [[0,1],[1,1],[2,1]] },
    V3: { n: 2, c: [[0,0],[0,1],[1,1]] },
    I4: { n: 4, c: [[0,1],[1,1],[2,1],[3,1]] },
    O4: { n: 2, c: [[0,0],[1,0],[0,1],[1,1]] },
    T4: { n: 3, c: [[1,0],[0,1],[1,1],[2,1]] },
    L4: { n: 3, c: [[2,0],[0,1],[1,1],[2,1]] },
    S4: { n: 3, c: [[1,0],[2,0],[0,1],[1,1]] },
    P5: { n: 3, c: [[0,0],[1,0],[0,1],[1,1],[0,2]] },
    U5: { n: 3, c: [[0,0],[2,0],[0,1],[1,1],[2,1]] },
    T5: { n: 3, c: [[0,0],[1,0],[2,0],[1,1],[1,2]] },
    X5: { n: 3, c: [[1,0],[0,1],[1,1],[2,1],[1,2]] },
  };
  const BAG = ['I3','I3','V3','V3','I4','O4','T4','L4','S4','P5','U5','T5','X5'];
  const COLOR_BAG = [0,0,1,1,2,2,3,3];
  const KICKS = [[0,0],[-1,0],[1,0],[0,-1],[-1,-1],[1,-1],[-2,0],[2,0],[0,1]];
  const LINE_PTS = [0, 100, 300, 500, 800];
  const SOROI_PTS = 1000;
  const gravityMs = level => Math.max(45, 850 * Math.pow(0.82, level - 1));

  // ---------- rng (KoboPlatform.rng と同じ列) ----------
  function hash32(str) {
    str = String(str);
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function mulberry32(seed) {
    let a = (Number(seed) >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffleWith(rnd, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(rnd() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; }
  // 次のピース（形と色は別の袋。ページの nextFromBag と同じ）
  function nextSpec(st, rnd) {
    if (!st.bag.length) st.bag = shuffleWith(rnd, BAG.slice());
    if (!st.cbag.length) st.cbag = shuffleWith(rnd, COLOR_BAG.slice());
    return { t: st.bag.pop(), c: st.cbag.pop() };
  }

  // ---------- board and pieces ----------
  const emptyRow = () => new Array(COLS).fill(-1);
  const emptyBoard = () => { const b = []; for (let r = 0; r < H; r++) b.push(emptyRow()); return b; };
  const cloneBoard = b => b.map(r => r.slice());
  function collidesOn(b, cells, x, y) {
    for (const [cx, cy] of cells) {
      const bx = x + cx, by = y + cy;
      if (bx < 0 || bx >= COLS || by >= H || by < 0) return true;
      if (b[by][bx] >= 0) return true;
    }
    return false;
  }
  const rotCells = (cells, n, dir) => cells.map(([x, y]) => dir > 0 ? [n - 1 - y, x] : [y, n - 1 - x]);
  function makePiece(spec) {
    const s = SHAPES[spec.t];
    const cells = s.c.map(p => p.slice());
    const minY = Math.min(...cells.map(p => p[1]));
    return { t: spec.t, c: spec.c, n: s.n, cells, x: Math.floor((COLS - s.n) / 2), y: HID - minY };
  }
  // ライン判定：うまった列・そろい消し（1色）・そろい消しの1つ下の列。pts は得点（level 倍）
  function analyze(board, level) {
    const full = [];
    for (let r = 0; r < H; r++) if (board[r].every(v => v >= 0)) full.push(r);
    const soroi = full.filter(r => board[r][0] < COLOR_N && board[r].every(v => v === board[r][0]));
    const extra = [];
    for (const r of soroi) { const b = r + 1; if (b < H && !full.includes(b) && !extra.includes(b)) extra.push(b); }
    const remove = full.concat(extra);
    const pts = full.length ? LINE_PTS[Math.min(4, full.length)] * level + soroi.length * SOROI_PTS * level : 0;
    return { full, soroi, extra, remove, pts };
  }
  function removeRows(board, remove) {
    const rm = new Set(remove);
    const kept = board.filter((_, r) => !rm.has(r));
    while (kept.length < H) kept.unshift(emptyRow());
    return kept;
  }
  const stoneCount = b => { let n = 0; for (const r of b) for (const v of r) if (v === STONE) n++; return n; };
  const cellCount = b => { let n = 0; for (const r of b) for (const v of r) if (v >= 0) n++; return n; };
  const topOut = b => b.slice(0, HID).some(row => row.some(v => v >= 0));
  const stackTop = b => { for (let r = 0; r < H; r++) if (b[r].some(v => v >= 0)) return r; return H; };

  // ---------- bot (best spot for a piece: low, flat, no holes; w.soroi = chase one-colour rows; w.stone = dig the stones) ----------
  function evalPlace(board, cells, x, y, color, w) {
    const b = cloneBoard(board);
    for (const [cx, cy] of cells) b[y + cy][x + cx] = color;
    const an = analyze(b, 1);
    let bonus = 0;
    if (w && w.stone) for (const r of an.remove) for (const v of board[r]) if (v === STONE) bonus += 3;
    if (w && w.soroi) {
      bonus += an.soroi.length * 40;
      // rows that are still one colour (and nearly full) are worth keeping pure
      for (let r = H - 1; r >= HID; r--) {
        const row = b[r]; let n = 0, c0 = -2, pure = true;
        for (const v of row) if (v >= 0) { n++; if (c0 === -2) c0 = v; else if (v !== c0) pure = false; }
        if (n >= 3 && n < COLS) bonus += (pure ? 1.1 : -0.7) * n;
      }
    }
    const kept = removeRows(b, an.remove);
    let holes = 0, sumH = 0, maxH = 0, bump = 0, prev = -1;
    for (let c = 0; c < COLS; c++) {
      let top = H; for (let r = 0; r < H; r++) if (kept[r][c] >= 0) { top = r; break; }
      const h = H - top; sumH += h; maxH = Math.max(maxH, h);
      for (let r = top + 1; r < H; r++) if (kept[r][c] < 0) holes++;
      if (prev >= 0) bump += Math.abs(h - prev); prev = h;
    }
    return an.remove.length * 8 + bonus - holes * 5 - maxH * 0.6 - sumH * 0.15 - bump * 0.25;
  }
  // → { cells, x, y, rot } | null（cells は回したあとの形。ページのボットとデモが使う）
  function bestPlacement(board, piece, w) {
    let bestS = -Infinity, pick = null, cells = piece.cells;
    for (let rot = 0; rot < 4; rot++) {
      for (let x = -4; x <= COLS; x++) {
        if (collidesOn(board, cells, x, piece.y)) continue;
        let y = piece.y; while (!collidesOn(board, cells, x, y + 1)) y++;
        const s = evalPlace(board, cells, x, y, piece.c, w);
        if (s > bestS) { bestS = s; pick = { cells: cells.map(p => p.slice()), x, y, rot }; }
      }
      cells = rotCells(cells, piece.n, 1);
    }
    return pick;
  }

  // ---------- stages ----------
  // goal: lines（ライン数）/ soroi（そろい消しの回数）/ score（点）/ clear（おじゃま岩をぜんぶ消す）
  // limit: 置けるピースの数（これを使い切るまでにねらいを達成）。par3/par2: ★3・★2に必要な「使ったピース数」の上限
  // garbage: { rows, holes, kind: 'stone' | 'mix' | 色 0〜3 }  level: ステージ中は速さが変わらない
  const WORLDS = [
    { id: 1, ja: 'ゼリーの森', en: 'Jelly Woods' },
    { id: 2, ja: 'キャンディ山', en: 'Candy Hills' },
    { id: 3, ja: 'タワーの頂上', en: 'Tower Top' },
  ];
  const DEFS = [
    // world 1
    { goal: ['lines', 4],    level: 1, garbage: null,                                 limit: 24, par: [13, 17], salt: 0 },
    { goal: ['lines', 6],    level: 1, garbage: { rows: 3, holes: 1, kind: 'mix' },   limit: 26, par: [14, 19], salt: 0 },
    { goal: ['soroi', 1],    level: 2, garbage: { rows: 1, holes: 3, kind: 0 },       limit: 30, par: [17, 23], salt: 17 },
    { goal: ['score', 1500], level: 2, garbage: null,                                 limit: 26, par: [16, 21], salt: 0 },
    // world 2
    { goal: ['lines', 8],    level: 3, garbage: { rows: 4, holes: 1, kind: 'mix' },   limit: 30, par: [17, 23], salt: 0 },
    { goal: ['soroi', 2],    level: 3, garbage: { rows: 2, holes: 3, kind: 1 },       limit: 36, par: [22, 28], salt: 7 },
    { goal: ['clear', 0],    level: 3, garbage: { rows: 3, holes: 1, kind: 'stone', shift: 0.2 }, limit: 32, par: [20, 25], salt: 5 },
    { goal: ['score', 4000], level: 4, garbage: { rows: 2, holes: 1, kind: 'mix' },   limit: 32, par: [19, 25], salt: 0 },
    // world 3
    { goal: ['lines', 12],   level: 5, garbage: { rows: 5, holes: 1, kind: 'mix' },   limit: 38, par: [24, 30], salt: 0 },
    { goal: ['soroi', 3],    level: 5, garbage: { rows: 3, holes: 3, kind: 2 },       limit: 44, par: [32, 38], salt: 20 },
    { goal: ['clear', 0],    level: 6, garbage: { rows: 6, holes: 1, kind: 'stone' }, limit: 38, par: [24, 30], salt: 3 },
    { goal: ['score', 9000], level: 7, garbage: { rows: 3, holes: 1, kind: 'mix' },   limit: 40, par: [27, 33], salt: 0 },
  ];
  const PER_WORLD = 4;
  // おじゃまの盤を作る（種が同じなら毎回同じ）。うまりきった列はつくらない
  function makeGarbage(g, seed) {
    const b = emptyBoard();
    if (!g) return b;
    const rnd = mulberry32(seed ^ 0x9e3779b9);
    g = Object.assign({ shift: 0.4 }, g);
    let hc = Math.floor(rnd() * COLS), gapAt = 0;
    for (let k = 0; k < g.rows; k++) {
      const r = H - 1 - k;
      const holes = new Set();
      if (typeof g.kind === 'number') { // 1色のおじゃま：すきまは横につながった1か所（同じ色のピースでうめるとそろい消し）
        const st0 = k === 0 || rnd() < 0.3 ? Math.floor(rnd() * (COLS - g.holes + 1)) : gapAt;
        gapAt = st0;
        for (let i = 0; i < g.holes; i++) holes.add(st0 + i);
      } else {
        if (rnd() < g.shift) hc = Math.floor(rnd() * COLS);
        holes.add(hc);
        while (holes.size < g.holes) holes.add(Math.floor(rnd() * COLS));
      }
      for (let c = 0; c < COLS; c++) {
        if (holes.has(c)) continue;
        b[r][c] = g.kind === 'stone' ? STONE : g.kind === 'mix' ? Math.floor(rnd() * COLOR_N) : g.kind;
      }
    }
    return b;
  }
  function buildStage(d, i) {
    const world = Math.floor(i / PER_WORLD) + 1, n = i % PER_WORLD + 1;
    const seed = hash32('drop:stage:' + world + '-' + n + (d.salt ? ':' + d.salt : ''));
    return { index: i, id: world + '-' + n, world, n, seed, level: d.level, goal: { t: d.goal[0], n: d.goal[1] }, garbage: d.garbage,
      limit: d.limit, par3: d.par[0], par2: d.par[1], board: makeGarbage(d.garbage, seed) };
  }
  const STAGES = DEFS.map(buildStage);
  const STAGE_N = STAGES.length;
  const stageById = id => typeof id === 'number' ? STAGES[id] || null : STAGES.find(s => s.id === id) || null;

  // ねらいの進み具合（st = { lines, soroi, score, stones }）
  function goalProgress(stage, st) {
    const g = stage.goal;
    if (g.t === 'lines') return { have: Math.min(st.lines, g.n), need: g.n, done: st.lines >= g.n };
    if (g.t === 'soroi') return { have: Math.min(st.soroi, g.n), need: g.n, done: st.soroi >= g.n };
    if (g.t === 'score') return { have: Math.min(st.score, g.n), need: g.n, done: st.score >= g.n };
    const total = stoneCount(stage.board);
    return { have: total - st.stones, need: total, done: st.stones === 0 };
  }
  const starsFor = (stage, placed) => placed <= stage.par3 ? 3 : placed <= stage.par2 ? 2 : 1;

  // ---------- Sim: 画面なしで遊べる ----------
  // ステージ（または { seed, level, board }）をピース1つずつ置いて進める。出るピースの順番はページと同じ。
  class Sim {
    constructor(o) {
      const stage = typeof o === 'string' || typeof o === 'number' ? stageById(o) : (o && o.goal ? o : null);
      this.stage = stage;
      this.level = stage ? stage.level : (o && o.level) || 1;
      this.board = stage ? cloneBoard(stage.board) : (o && o.board ? cloneBoard(o.board) : emptyBoard());
      this._rnd = mulberry32(stage ? stage.seed : (o && o.seed) || 1);
      this.st = { bag: [], cbag: [] }; this.queue = [];
      this.score = 0; this.lines = 0; this.soroi = 0; this.combo = 0; this.placed = 0;
      this.status = 'play';
      this._fill(); this.cur = this.queue.shift(); this._fill();
    }
    _fill() { while (this.queue.length < 4) this.queue.push(nextSpec(this.st, this._rnd)); }
    get stones() { return stoneCount(this.board); }
    progress() { return this.stage ? goalProgress(this.stage, { lines: this.lines, soroi: this.soroi, score: this.score, stones: this.stones }) : null; }
    // 置く：cells（回したあとの形）を x に落として固定する。置けなければ null
    place(cells, x) {
      if (this.status !== 'play') return null;
      const piece = makePiece(this.cur);
      if (collidesOn(this.board, cells, x, piece.y)) return null;
      let y = piece.y; while (!collidesOn(this.board, cells, x, y + 1)) y++;
      this.score += (y - piece.y) * 2;
      for (const [cx, cy] of cells) this.board[y + cy][x + cx] = this.cur.c;
      this.placed++;
      const an = analyze(this.board, this.level);
      if (an.full.length) {
        this.score += an.pts; this.soroi += an.soroi.length; this.lines += an.remove.length; this.combo++;
        this.board = removeRows(this.board, an.remove);
      } else this.combo = 0;
      const res = { lines: an.remove.length, soroi: an.soroi.length, pts: an.pts };
      if (topOut(this.board)) { this.status = 'lost'; return res; }
      const pr = this.progress();
      if (pr && pr.done) { this.status = 'won'; return res; }
      if (this.stage && this.placed >= this.stage.limit) { this.status = 'lost'; return res; }
      this.cur = this.queue.shift(); this._fill();
      if (collidesOn(this.board, makePiece(this.cur).cells, makePiece(this.cur).x, makePiece(this.cur).y)) { this.status = 'lost'; }
      return res;
    }
    bot() {
      const p = makePiece(this.cur);
      const g = this.stage && this.stage.goal.t;
      return bestPlacement(this.board, p, { soroi: g === 'soroi', stone: g === 'clear' || (this.stage && this.stage.garbage && this.stage.garbage.kind === 'stone') });
    }
    botStep() { const m = this.bot(); if (!m) { this.status = 'lost'; return null; } return this.place(m.cells, m.x); }
    stars() { return this.status === 'won' && this.stage ? starsFor(this.stage, this.placed) : 0; }
  }
  // ボットに最後まで（または maxPieces まで）遊ばせる
  function botPlay(o, maxPieces) {
    const s = new Sim(o);
    for (let i = 0; i < (maxPieces || 400) && s.status === 'play'; i++) s.botStep();
    return s;
  }

  // ---------- スプリント（20ライン） ----------
  const SPRINT = { lines: 20 };

  // ---------- 保存（kusoge.drop.x: { v:1, s:[ステージの星 0〜3 ×12], sp: スプリントのベスト（ミリ秒。小さいほど良い。なければ省く） }） ----------
  function readProgress(raw) {
    const out = { s: new Array(STAGE_N).fill(0), sp: 0 };
    try {
      const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!o || o.v !== 1) return out;
      if (Array.isArray(o.s)) for (let i = 0; i < STAGE_N; i++) { const v = Number(o.s[i]); out.s[i] = v >= 1 && v <= 3 ? Math.floor(v) : 0; }
      const sp = Number(o.sp); out.sp = Number.isFinite(sp) && sp >= 1000 ? Math.min(Math.floor(sp), 36e5) : 0;
    } catch (e) { /* ignore */ }
    return out;
  }
  function writeProgress(p) { const o = { v: 1, s: p.s.slice(0, STAGE_N) }; if (p.sp) o.sp = p.sp | 0; return JSON.stringify(o); }
  // 前のステージに★が1つでもあれば開く（最初は開いている）
  const unlocked = (p, i) => i === 0 || p.s[i - 1] >= 1;

  return { COLS, ROWS, HID, H, COLOR_N, STONE, SHAPES, BAG, COLOR_BAG, KICKS, LINE_PTS, SOROI_PTS, gravityMs, hash32, mulberry32, shuffleWith, nextSpec,
    emptyBoard, cloneBoard, collidesOn, rotCells, makePiece, analyze, removeRows, stoneCount, cellCount, topOut, stackTop, evalPlace, bestPlacement,
    WORLDS, STAGES, DEFS, buildStage, STAGE_N, PER_WORLD, stageById, goalProgress, starsFor, Sim, botPlay, SPRINT, readProgress, writeProgress, unlocked };
});
