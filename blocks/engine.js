// ブロックはめの中身（node でも動く）：ブロックの形と重み・ライン判定・得点・15ステージ（ねらい付きの盤）・ステージの進め方（StageRun）・
// 手を選ぶボット（ヒントと自動テスト）。画面・保存・音は blocks/index.html。
// ステージは決まった結果：盤・出るブロックの順番（種つき乱数）が毎回同じなので、ボットで「解ける」を確かめられる。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.BlocksEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const N = 8;
  const COLOR_N = 8;      // ブロックの色 0〜7
  const STONE = 8;        // いし（ステージだけ。ふつうのタイルと同じように、そろうと消える）

  // ---------- pieces ----------
  function rot(cells) { // 90° clockwise, normalised
    const r = cells.map(([y, x]) => [x, -y]);
    const my = Math.min(...r.map(c => c[0])), mx = Math.min(...r.map(c => c[1]));
    return r.map(([y, x]) => [y - my, x - mx]).sort((a, b) => a[0] - b[0] || a[1] - b[1]);
  }
  const key = cs => cs.map(c => c.join(',')).join(';');
  function rotations(cells, n) {
    const out = []; const seen = new Set(); let cur = rot(rot(rot(rot(cells))));
    for (let i = 0; i < n; i++) { const k = key(cur); if (!seen.has(k)) { seen.add(k); out.push(cur); } cur = rot(cur); }
    return out;
  }
  const FAMILIES = [ // [name, base cells, rotations, total weight, color]
    ['dot', [[0,0]], 1, 5, 3],
    ['I2', [[0,0],[0,1]], 2, 8, 6],
    ['I3', [[0,0],[0,1],[0,2]], 2, 8, 4],
    ['I4', [[0,0],[0,1],[0,2],[0,3]], 2, 7, 1],
    ['I5', [[0,0],[0,1],[0,2],[0,3],[0,4]], 2, 4, 0],
    ['O2', [[0,0],[0,1],[1,0],[1,1]], 1, 7, 2],
    ['O3', [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2],[2,0],[2,1],[2,2]], 1, 2.5, 7],
    ['R23', [[0,0],[0,1],[0,2],[1,0],[1,1],[1,2]], 2, 3, 5],
    ['V3', [[0,0],[1,0],[1,1]], 4, 8, 6],
    ['L4', [[0,0],[1,0],[2,0],[2,1]], 4, 6, 7],
    ['J4', [[0,1],[1,1],[2,1],[2,0]], 4, 6, 1],
    ['V5', [[0,0],[1,0],[2,0],[2,1],[2,2]], 4, 4, 4],
    ['T4', [[0,0],[0,1],[0,2],[1,1]], 4, 6, 4],
    ['S4', [[0,1],[0,2],[1,0],[1,1]], 2, 4, 2],
    ['Z4', [[0,0],[0,1],[1,1],[1,2]], 2, 4, 0],
  ];
  const PIECES = []; // {name, cells, color, weight, w, h}
  for (const [name, base, nrot, weight, color] of FAMILIES) {
    const rs = rotations(base, nrot);
    for (const cells of rs) {
      PIECES.push({ name, cells, color, weight: weight / rs.length,
        w: Math.max(...cells.map(c => c[1])) + 1, h: Math.max(...cells.map(c => c[0])) + 1 });
    }
  }
  const pidOf = (name, w, h) => PIECES.findIndex(p => p.name === name && p.w === w && p.h === h);
  const TOTAL_W = PIECES.reduce((s, p) => s + p.weight, 0);
  function pickPiece(rnd) {
    let r = rnd() * TOTAL_W;
    for (let i = 0; i < PIECES.length; i++) { r -= PIECES[i].weight; if (r <= 0) return i; }
    return PIECES.length - 1;
  }

  // ---------- board helpers ----------
  function fits(board, pid, r0, c0) {
    const p = PIECES[pid];
    if (r0 < 0 || c0 < 0 || r0 + p.h > N || c0 + p.w > N) return false;
    for (const [r, c] of p.cells) if (board[(r0 + r) * N + c0 + c] >= 0) return false;
    return true;
  }
  function fitsAnywhere(board, pid) {
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) if (fits(board, pid, r, c)) return true;
    return false;
  }
  function fullLines(board) {
    const rows = [], cols = [];
    for (let r = 0; r < N; r++) { let f = true; for (let c = 0; c < N; c++) if (board[r * N + c] < 0) { f = false; break; } if (f) rows.push(r); }
    for (let c = 0; c < N; c++) { let f = true; for (let r = 0; r < N; r++) if (board[r * N + c] < 0) { f = false; break; } if (f) cols.push(c); }
    return { rows, cols };
  }
  const lineScore = n => 10 * n * (n + 1) / 2; // 1:10 2:30 3:60 4:100 ...
  // how much of the board is filled (0..1)
  const fillRatio = board => { let n = 0; for (let i = 0; i < N * N; i++) if (board[i] >= 0) n++; return n / (N * N); };

  // ---------- rng ----------
  function hash32(str) { // xmur3 first value (the same as KoboPlatform.hash32)
    str = String(str);
    let h = 1779033703 ^ str.length;
    for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
    h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function mulberry32(seed) { // the same sequence as KoboPlatform.rng
    let a = (Number(seed) >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------- bot: the move that clears the most, then leaves the most room ----------
  // opts.gems: array(64) of 0/1 → a cleared gem is worth a lot more (used for stage hints)
  function bestMove(board, tray, opts) {
    opts = opts || {};
    const gems = opts.gems || null;
    let bestM = null, bestV = -1e9;
    for (let i = 0; i < tray.length; i++) {
      const pid = tray[i]; if (pid == null) continue;
      const p = PIECES[pid];
      for (let r = 0; r + p.h <= N; r++) for (let c = 0; c + p.w <= N; c++) {
        if (!fits(board, pid, r, c)) continue;
        const b = board.slice(); for (const [y, x] of p.cells) b[(r + y) * N + c + x] = 0;
        const fl = fullLines(b);
        const lines = fl.rows.length + fl.cols.length;
        let gemGot = 0;
        if (gems && lines) {
          const seen = new Set();
          fl.rows.forEach(y => { for (let x = 0; x < N; x++) seen.add(y * N + x); });
          fl.cols.forEach(x => { for (let y = 0; y < N; y++) seen.add(y * N + x); });
          for (const k of seen) if (gems[k]) gemGot++;
        }
        fl.rows.forEach(y => { for (let x = 0; x < N; x++) b[y * N + x] = -1; });
        fl.cols.forEach(x => { for (let y = 0; y < N; y++) b[y * N + x] = -1; });
        let holes = 0, empty = 0;
        for (let k = 0; k < N * N; k++) if (b[k] < 0) {
          empty++;
          const y = (k / N) | 0, x = k % N; let n = 0;
          if (y > 0 && b[k - N] >= 0) n++; if (y < N - 1 && b[k + N] >= 0) n++; if (x > 0 && b[k - 1] >= 0) n++; if (x < N - 1 && b[k + 1] >= 0) n++;
          if (n >= 3) holes++;
        }
        // a line that is nearly full is worth working toward: reward the fullest row/column this piece touches
        let near = 0;
        if (opts.near) {
          for (let y = r; y < r + p.h; y++) { let f = 0; for (let x = 0; x < N; x++) if (b[y * N + x] >= 0) f++; if (f >= 5) near += f; }
          for (let x = c; x < c + p.w; x++) { let f = 0; for (let y = 0; y < N; y++) if (b[y * N + x] >= 0) f++; if (f >= 5) near += f; }
        }
        const v = lines * 100 + gemGot * 140 + p.cells.length * 2 - holes * 6 + empty * 0.5 + near * 0.8;
        if (v > bestV) { bestV = v; bestM = { i, r, c }; }
      }
    }
    return bestM;
  }


  // ---------- planner: looks at the whole tray (every order, every spot, a narrow beam) ----------
  // goalT: 'lines' | 'score' | 'gems' | 'clear'. Returns {i, r, c} for the first move of the best plan.
  function simPlace(board, gems, pid, r0, c0) {
    const p = PIECES[pid], b = board.slice(), g = gems.slice();
    for (const [r, c] of p.cells) b[(r0 + r) * N + c0 + c] = 0;
    const fl = fullLines(b), lines = fl.rows.length + fl.cols.length;
    let gemGot = 0;
    if (lines) {
      const clr = new Set();
      fl.rows.forEach(r => { for (let c = 0; c < N; c++) clr.add(r * N + c); });
      fl.cols.forEach(c => { for (let r = 0; r < N; r++) clr.add(r * N + c); });
      for (const k of clr) { if (g[k]) { gemGot++; g[k] = 0; } b[k] = -1; }
    }
    return { b, g, lines, gemGot, size: p.cells.length };
  }
  function shapeScore(b) {
    let holes = 0, empty = 0;
    for (let k = 0; k < N * N; k++) if (b[k] < 0) {
      empty++;
      const y = (k / N) | 0, x = k % N; let n = 0;
      if (y > 0 && b[k - N] >= 0) n++; if (y < N - 1 && b[k + N] >= 0) n++; if (x > 0 && b[k - 1] >= 0) n++; if (x < N - 1 && b[k + 1] >= 0) n++;
      if (n >= 3) holes++;
    }
    return empty * 0.5 - holes * 6;
  }
  function plan(board, tray, gems, goalT, beam) {
    beam = beam || 5;
    const idx = []; tray.forEach((v, i) => { if (v != null) idx.push(i); });
    if (!idx.length) return null;
    const w = goalT === 'gems' ? { line: 25, gem: 160, size: 1 } : goalT === 'clear' ? { line: 40, gem: 0, size: 0, empty: 4 }
      : goalT === 'combo' ? { line: 80, gem: 0, size: 1, combo: 1 }
      : goalT === 'score' ? { line: 60, gem: 0, size: 2, combo: 1 } : { line: 100, gem: 0, size: 1 };
    let states = [{ b: board, g: gems || new Array(N * N).fill(0), left: idx, first: null, v: 0, streak: 0 }];
    let best = null;
    for (let depth = 0; depth < idx.length; depth++) {
      const next = [];
      for (const s of states) {
        for (const i of s.left) {
          const pid = tray[i], p = PIECES[pid];
          for (let r = 0; r + p.h <= N; r++) for (let c = 0; c + p.w <= N; c++) {
            if (!fits(s.b, pid, r, c)) continue;
            const o = simPlace(s.b, s.g, pid, r, c);
            const streak = o.lines ? s.streak + 1 : 0;
            let v = s.v + o.lines * w.line * (w.combo ? streak : 1) + o.gemGot * w.gem + o.size * w.size;
            let fin = v + shapeScore(o.b);
            if (w.gem) { // a star waits in a row or column: the fuller that line, the better
              for (let k = 0; k < N * N; k++) if (o.g[k]) {
                const y = (k / N) | 0, x = k % N; let rf = 0, cf = 0;
                for (let q = 0; q < N; q++) { if (o.b[y * N + q] >= 0) rf++; if (o.b[q * N + x] >= 0) cf++; }
                const m = Math.max(rf, cf); fin += m * m * 0.6;
              }
            }
            if (w.empty) { let f = 0; for (let k = 0; k < N * N; k++) if (o.b[k] >= 0) f++; fin += (f === 0 ? 500 : 0) - f * w.empty; }
            next.push({ b: o.b, g: o.g, left: s.left.filter(x => x !== i), first: s.first || { i, r, c }, v, streak, fin });
          }
        }
      }
      if (!next.length) break;
      next.sort((a, b) => b.fin - a.fin);
      states = next.slice(0, beam); best = states[0];
    }
    return best ? best.first : null;
  }

  // ---------- stages ----------
  // art: 8 rows of 8 chars. '.' empty, a-h a colored tile (0-7), '#' stone, A-H a colored tile holding a star gem.
  // goal: {t:'lines', n} | {t:'score', n} | {t:'gems'} | {t:'combo', n} | {t:'clear'}   limit: placements allowed   par: [★3 moves, ★2 moves] (the planner bot's moves are the ★2 line)
  const WORLDS = [
    { id: 1, ja: 'はじめの庭', en: 'First Garden' },
    { id: 2, ja: 'いしの谷', en: 'Stone Valley' },
    { id: 3, ja: 'たからの山', en: 'Treasure Peak' },
  ];
  const STAGE_DEFS = [
    // ---- world 1
    { art: ['........','........','........','........','........','........','........','........'],
      goal: { t: 'lines', n: 3 }, limit: 22, par: [11, 14] },
    { art: ['........','........','........','........','........','.....b..','dd.aa.cc','ee.ff.gg'],
      goal: { t: 'score', n: 100 }, limit: 25, par: [13, 16] },
    { art: ['........','........','........','........','........','........','a.b.C.d.','eAfAgAh.'],
      goal: { t: 'gems' }, limit: 14, par: [6, 8] },
    { art: ['........','........','........','........','........','........','........','........'],
      goal: { t: 'lines', n: 5 }, limit: 21, par: [10, 13] },
    { art: ['........','........','........','........','........','a.cdefg.','abc.efgh','abcd.fgh'],
      goal: { t: 'combo', n: 2 }, limit: 19, par: [10, 12] },
    // ---- world 2
    { art: ['........','........','........','...#....','........','........','........','a.B.c.D.'],
      goal: { t: 'gems' }, limit: 12, par: [6, 7] },
    { art: ['........','........','#......#','........','........','#......#','........','........'],
      goal: { t: 'lines', n: 8 }, limit: 32, par: [17, 21] },
    { art: ['........','........','........','..#..#..','........','........','.#....#.','........'],
      goal: { t: 'score', n: 200 }, limit: 40, par: [21, 26] },
    { art: ['........','........','.A....B.','........','........','........','.#....#.','C#..#..D'],
      goal: { t: 'gems' }, limit: 43, par: [22, 28] },
    { art: ['........','........','........','........','.#.cdef.','abc.efgh','ab.defg#','a.cdef.h'],
      goal: { t: 'combo', n: 3 }, limit: 8, par: [3, 4] },
    // ---- world 3
    { art: ['A......B','........','........','........','........','........','........','C......D'],
      goal: { t: 'gems' }, limit: 18, par: [9, 11] },
    { art: ['........','........','........','........','........','........','........','........'],
      goal: { t: 'lines', n: 8 }, limit: 34, par: [18, 22] },
    { art: ['........','..A..B..','........','#......#','........','..C..D..','........','........'],
      goal: { t: 'gems' }, limit: 25, par: [13, 16] },
    { art: ['........','........','#.#.#.#.','........','........','.#.#.#.#','........','........'],
      goal: { t: 'score', n: 320 }, limit: 53, par: [28, 35] },
    { art: ['A.B.C.D.','........','........','#......#','#......#','........','........','e.F.g.H.'],
      goal: { t: 'gems' }, limit: 34, par: [18, 22] },
  ];
  const STAGE_N = STAGE_DEFS.length;
  const PER_WORLD = 5;
  const STAGES = STAGE_DEFS.map((d, i) => {
    const world = Math.floor(i / PER_WORLD) + 1, n = i % PER_WORLD + 1;
    const board = new Array(N * N).fill(-1), gems = new Array(N * N).fill(0);
    for (let r = 0; r < N; r++) for (let c = 0; c < N; c++) {
      const ch = d.art[r][c];
      if (ch === '.') continue;
      if (ch === '#') board[r * N + c] = STONE;
      else if (ch >= 'a' && ch <= 'h') board[r * N + c] = ch.charCodeAt(0) - 97;
      else { board[r * N + c] = ch.charCodeAt(0) - 65; gems[r * N + c] = 1; }
    }
    return { index: i, id: world + '-' + n, world, n, board, gems, goal: d.goal, limit: d.limit,
      seed: hash32('blocks:stage:' + world + '-' + n), par3: d.par[0], par2: d.par[1],
      gemCount: gems.reduce((a, b) => a + b, 0) };
  });
  const stageById = id => STAGES.find(s => s.id === id) || null;
  const STAGE_TOOLS = { undo: 3, swap: 2, hint: 3 };

  class StageRun {
    constructor(stage) {
      this.stage = typeof stage === 'string' ? stageById(stage) : (typeof stage === 'number' ? STAGES[stage] : stage);
      if (!this.stage) throw new Error('unknown stage');
      this.board = this.stage.board.slice(); this.gems = this.stage.gems.slice();
      this.score = 0; this.combo = 0; this.maxCombo = 0; this.moves = 0; this.lines = 0; this.gemsGot = 0; this.draws = 0;
      this.undos = STAGE_TOOLS.undo; this.swaps = STAGE_TOOLS.swap; this.hints = STAGE_TOOLS.hint;
      this.status = 'play'; // 'play' | 'won' | 'lost'
      this.hist = [];
      this._rng = null; this.tray = [null, null, null];
      this._seedRng(0);
      this.deal();
    }
    _seedRng(skip) { const f = mulberry32(this.stage.seed); for (let i = 0; i < skip; i++) f(); this._rng = f; this.draws = skip; }
    _next() { this.draws++; return pickPiece(this._rng); }
    deal() {
      let hand = null;
      for (let attempt = 0; attempt < 14; attempt++) {
        const h = [this._next(), this._next(), this._next()];
        if (!hand) hand = h;
        if (h.some(p => fitsAnywhere(this.board, p))) { hand = h; break; }
      }
      this.tray = hand;
    }
    stuck() { return !this.tray.some(v => v !== null && fitsAnywhere(this.board, v)); }
    progress() {
      const g = this.stage.goal;
      if (g.t === 'lines') return { have: Math.min(this.lines, g.n), need: g.n };
      if (g.t === 'score') return { have: Math.min(this.score, g.n), need: g.n };
      if (g.t === 'combo') return { have: Math.min(this.maxCombo, g.n), need: g.n };
      if (g.t === 'gems') return { have: this.gemsGot, need: this.stage.gemCount };
      return { have: this.board.every(v => v < 0) ? 1 : 0, need: 1 };
    }
    movesLeft() { return Math.max(0, this.stage.limit - this.moves); }
    _snap() {
      return { board: this.board.slice(), gems: this.gems.slice(), tray: this.tray.slice(), score: this.score, combo: this.combo, maxCombo: this.maxCombo, moves: this.moves,
        lines: this.lines, gemsGot: this.gemsGot, draws: this.draws };
    }
    _restore(s) {
      this.board = s.board.slice(); this.gems = s.gems.slice(); this.tray = s.tray.slice(); this.score = s.score; this.combo = s.combo; this.maxCombo = s.maxCombo; this.moves = s.moves;
      this.lines = s.lines; this.gemsGot = s.gemsGot; this._seedRng(s.draws);
    }
    // place tray piece i with its top-left at (r0, c0). Returns what happened (or null when it is not a legal move)
    place(i, r0, c0) {
      if (this.status !== 'play') return null;
      const pid = this.tray[i];
      if (pid == null || !fits(this.board, pid, r0, c0)) return null;
      this.hist.push(this._snap()); if (this.hist.length > 12) this.hist.shift();
      const p = PIECES[pid], placed = [];
      for (const [r, c] of p.cells) { const k = (r0 + r) * N + c0 + c; this.board[k] = p.color; placed.push(k); }
      this.tray[i] = null; this.moves++;
      let gain = p.cells.length, pts = 0, allClear = false, gemsNow = 0;
      const cleared = [];
      const fl = fullLines(this.board), lines = fl.rows.length + fl.cols.length;
      if (lines) {
        this.combo++; this.maxCombo = Math.max(this.maxCombo, this.combo);
        const clr = new Set();
        fl.rows.forEach(r => { for (let c = 0; c < N; c++) clr.add(r * N + c); });
        fl.cols.forEach(c => { for (let r = 0; r < N; r++) clr.add(r * N + c); });
        for (const k of clr) {
          const g = this.gems[k] ? 1 : 0;
          cleared.push({ idx: k, color: this.board[k], gem: g });
          if (g) { gemsNow++; this.gems[k] = 0; }
          this.board[k] = -1;
        }
        this.lines += lines; this.gemsGot += gemsNow;
        pts = lineScore(lines) * this.combo;
        allClear = this.board.every(v => v < 0);
        if (allClear) pts += 300;
        gain += pts;
      } else this.combo = 0;
      this.score += gain;
      let dealt = false;
      if (this.tray.every(v => v === null)) { this.deal(); dealt = true; }
      const prog = this.progress();
      const g = this.stage.goal;
      const won = g.t === 'clear' ? this.board.every(v => v < 0) : prog.have >= prog.need;
      if (won) this.status = 'won';
      else if (this.moves >= this.stage.limit) this.status = 'lost';
      else if (this.stuck() && this.undos <= 0 && this.swaps <= 0) this.status = 'lost';
      return { placed, cleared, lines, rows: fl.rows, cols: fl.cols, pts, gain, allClear, gems: gemsNow, dealt, status: this.status, pr: r0, pc: c0, piece: pid };
    }
    undo() {
      if (this.status !== 'play' || this.undos <= 0 || !this.hist.length) return false;
      this.undos--; this._restore(this.hist.pop()); return true;
    }
    // throw away the tray for three new pieces (no move spent)
    swap() {
      if (this.status !== 'play' || this.swaps <= 0) return false;
      this.swaps--; this.deal();
      if (this.stuck() && this.undos <= 0 && this.swaps <= 0) this.status = 'lost';
      return true;
    }
    hint() {
      if (this.status !== 'play') return null;
      return plan(this.board, this.tray, this.gems, this.stage.goal.t, 6);
    }
    useHint() { if (this.hints <= 0 || this.status !== 'play') return null; const m = this.hint(); if (m) this.hints--; return m; }
    stars() { return this.status !== 'won' ? 0 : this.moves <= this.stage.par3 ? 3 : this.moves <= this.stage.par2 ? 2 : 1; }
    // for saving between page loads is not needed (a stage is a few minutes); a plain summary for the HUD / tests
    summary() { return { stage: this.stage.id, moves: this.moves, left: this.movesLeft(), score: this.score, lines: this.lines, gems: this.gemsGot, status: this.status, stars: this.stars() }; }
  }

  // play a whole stage with the bot (used by the tests and to calibrate limits)
  function botPlay(stage, o) {
    o = o || {};
    const run = new StageRun(stage);
    let guard = 0;
    while (run.status === 'play' && guard++ < 200) {
      if (run.stuck()) { if (o.tools !== false && run.swap()) continue; break; }
      const m = run.hint();
      if (!m) break;
      run.place(m.i, m.r, m.c);
    }
    return run;
  }

  // ---------- time attack ----------
  const TIME = { start: 90, perLine: 2, cap: 120 };

  // ---------- saved progress (kusoge.blocks.x: { v:1, s:[stars per stage], ta:best time-attack score }) ----------
  function readProgress(raw) {
    const out = { s: new Array(STAGE_N).fill(0), ta: 0 };
    try {
      const o = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!o || o.v !== 1) return out;
      if (Array.isArray(o.s)) for (let i = 0; i < STAGE_N; i++) { const v = Number(o.s[i]); out.s[i] = v >= 1 && v <= 3 ? Math.floor(v) : 0; }
      const ta = Number(o.ta); out.ta = Number.isFinite(ta) && ta > 0 ? Math.min(Math.floor(ta), 1e7) : 0;
    } catch (e) { /* ignore */ }
    return out;
  }
  function writeProgress(p) { return JSON.stringify({ v: 1, s: p.s.slice(0, STAGE_N), ta: p.ta | 0 }); }
  // a stage is open when the one before it has at least a star (the first is always open)
  const unlocked = (p, i) => i === 0 || p.s[i - 1] >= 1;

  return { N, COLOR_N, STONE, PIECES, pidOf, pickPiece, TOTAL_W, fits, fitsAnywhere, fullLines, lineScore, fillRatio, hash32, mulberry32, bestMove, plan,
    WORLDS, STAGES, STAGE_N, PER_WORLD, stageById, StageRun, botPlay, STAGE_TOOLS, TIME, readProgress, writeProgress, unlocked };
});
