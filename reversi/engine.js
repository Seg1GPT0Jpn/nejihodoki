// リバーシ工房：ゲームの中身（決まった結果の純粋なロジック。node でもブラウザでも動く）
// ---------------------------------------------------------------------------------
// ルール（昔からあるふつうのルール）：黒（先手）と白が交互に石を置く。置けるのは、縦・横・ななめのどこかで、相手の石を1つ以上はさんで
//   自分の石につながる場所だけ。はさんだ石はぜんぶひっくり返る。置ける場所がなければパス。どちらも置けなくなったら終わりで、石が多いほうの勝ち。
// 盤：8×8 または 6×6（n）。はじめの並び：'std'（ななめ。ふつう）か 'par'（たてに2つずつ並べる）。マスの番号は r*n+c（上の段が 0）。
//   マスの名前は 列の英字 a〜h ＋ 段の数字 1〜8（例：d3）。
// 石：0 なし・1 黒・2 白。st は JSON にできるものだけ。
//   st = { v:1, n, start, b:[n*n], turn:1|2, moves:[[マス, 色]…]（マス -1 はパス）, over, first:1, seed }（seed は CPU のばらつきの種。ゲームごとに変える）
//   乱数は使わない（CPU のばらつきは、盤のようすから決まる種で決める）ので、同じ局面・同じ強さなら、必ず同じ手になる。
// CPU の強さ：1 よわい（でたらめ）・2 ふつう（角が取れれば角、なければいちばん多く返す）・3 つよい（場所の重みと置ける数を2手先まで）・
//   4 とてもつよい（6手先まで読む。終盤は最後まで読み切る）。
// 読み切り（solve）：石の差（最後に空きマスは勝ったほうのもの）を、アルファ・ベータで最後まで確かめる。毎日のパズルの答えを証明するのにも使う。
(function (root) {
  'use strict';

  const EMPTY = 0, BLACK = 1, WHITE = 2;
  const opp = k => 3 - k;
  const DIRS = [[-1, -1], [-1, 0], [-1, 1], [0, -1], [0, 1], [1, -1], [1, 0], [1, 1]];
  const COLS = 'abcdefgh';

  // ---------- 盤の形（n ごとに1回だけ作る） ----------
  const GEO = {};
  function wt(r, c, n) {
    const a = Math.min(r, n - 1 - r), b = Math.min(c, n - 1 - c), lo = Math.min(a, b), hi = Math.max(a, b);
    const T = { '0,0': 100, '0,1': -20, '0,2': 10, '0,3': 5, '1,1': -50, '1,2': -2, '1,3': -2, '2,2': -1, '2,3': -1, '3,3': -1 };
    return T[lo + ',' + hi];
  }
  function geo(n) {
    if (GEO[n]) return GEO[n];
    const N = n * n, rays = [], W = new Int16Array(N), order = [];
    for (let r = 0; r < n; r++) for (let c = 0; c < n; c++) {
      const rs = [];
      for (const [dr, dc] of DIRS) {
        const ray = []; let rr = r + dr, cc = c + dc;
        while (rr >= 0 && rr < n && cc >= 0 && cc < n) { ray.push(rr * n + cc); rr += dr; cc += dc; }
        if (ray.length >= 2) rs.push(Int16Array.from(ray));
      }
      rays.push(rs); W[r * n + c] = wt(r, c, n); order.push(r * n + c);
    }
    order.sort((a, b) => W[b] - W[a] || a - b);
    const corners = [0, n - 1, n * (n - 1), N - 1];
    return (GEO[n] = { n, N, rays, W, order: Int16Array.from(order), corners });
  }

  // ---------- 低いレベル：Int8Array の盤の上で石を置く・戻す ----------
  // マス cell に me が置けるなら、ひっくり返るマスを stack に積んで、その数を返す。置けなければ 0（盤は変えない）。
  function place(g, b, cell, me, stack) {
    if (b[cell] !== EMPTY) return 0;
    const you = opp(me), rays = g.rays[cell];
    let total = 0;
    for (let i = 0; i < rays.length; i++) {
      const ray = rays[i]; let k = 0;
      while (k < ray.length && b[ray[k]] === you) k++;
      if (k > 0 && k < ray.length && b[ray[k]] === me) { for (let j = 0; j < k; j++) { b[ray[j]] = me; stack.push(ray[j]); } total += k; }
    }
    if (total) b[cell] = me;
    return total;
  }
  function unplace(b, cell, you, stack, cnt) { b[cell] = EMPTY; for (let i = 0; i < cnt; i++) b[stack.pop()] = you; }
  function canPlace(g, b, cell, me) {
    if (b[cell] !== EMPTY) return false;
    const you = opp(me), rays = g.rays[cell];
    for (let i = 0; i < rays.length; i++) {
      const ray = rays[i]; let k = 0;
      while (k < ray.length && b[ray[k]] === you) k++;
      if (k > 0 && k < ray.length && b[ray[k]] === me) return true;
    }
    return false;
  }
  function movesOf(g, b, me) { const out = []; for (let i = 0; i < g.N; i++) if (canPlace(g, b, i, me)) out.push(i); return out; }
  function countMoves(g, b, me) { let k = 0; for (let i = 0; i < g.N; i++) if (canPlace(g, b, i, me)) k++; return k; }
  function ordered(g, list) { return list.sort((a, c) => g.W[c] - g.W[a] || a - c); }

  // 終わった局面の石の差（me − 相手）。空きマスは勝ったほうのもの（ふつうの数え方）
  function finalDiff(g, b, me) {
    let m = 0, y = 0;
    for (let i = 0; i < g.N; i++) { const v = b[i]; if (v === me) m++; else if (v) y++; }
    const e = g.N - m - y;
    return m > y ? m - y + e : m < y ? m - y - e : 0;
  }

  // ---------- 読み切り：最後まで ----------
  let nodes = 0;
  function exact(g, b, me, alpha, beta, passed) {
    nodes++;
    const mv = movesOf(g, b, me);
    if (!mv.length) {
      if (passed) return finalDiff(g, b, me);
      return -exact(g, b, opp(me), -beta, -alpha, true);
    }
    if (mv.length > 1) ordered(g, mv);
    const stack = [];
    let best = -999;
    for (let i = 0; i < mv.length; i++) {
      const cnt = place(g, b, mv[i], me, stack);
      const v = -exact(g, b, opp(me), -beta, -alpha, false);
      unplace(b, mv[i], opp(me), stack, cnt);
      if (v > best) { best = v; if (v > alpha) { alpha = v; if (alpha >= beta) break; } }
    }
    return best;
  }

  // ---------- 先読み：場所の重み＋置ける数 ----------
  function evaluate(g, b, me, empties) {
    const you = opp(me);
    let pos = 0, md = 0;
    for (let i = 0; i < g.N; i++) { const v = b[i]; if (v === me) { pos += g.W[i]; md++; } else if (v === you) { pos -= g.W[i]; md--; } }
    const mob = countMoves(g, b, me) - countMoves(g, b, you);
    return pos + 7 * mob + (empties <= 12 ? 4 * md : 0);
  }
  function negamax(g, b, me, depth, alpha, beta, passed, empties) {
    nodes++;
    if (depth <= 0) return evaluate(g, b, me, empties);
    const mv = movesOf(g, b, me);
    if (!mv.length) {
      if (passed) return finalDiff(g, b, me) * 100;
      return -negamax(g, b, opp(me), depth - 1, -beta, -alpha, true, empties);
    }
    if (mv.length > 1) ordered(g, mv);
    const stack = [];
    let best = -1e9;
    for (let i = 0; i < mv.length; i++) {
      const cnt = place(g, b, mv[i], me, stack);
      const v = -negamax(g, b, opp(me), depth - 1, -beta, -alpha, false, empties - 1);
      unplace(b, mv[i], opp(me), stack, cnt);
      if (v > best) { best = v; if (v > alpha) { alpha = v; if (alpha >= beta) break; } }
    }
    return best;
  }

  // ---------- 状態 ----------
  function setup(n, start) {
    const b = new Array(n * n).fill(EMPTY), h = n / 2;
    const at = (r, c, v) => { b[r * n + c] = v; };
    if (start === 'par') { at(h - 1, h - 1, BLACK); at(h - 1, h, BLACK); at(h, h - 1, WHITE); at(h, h, WHITE); }
    else { at(h - 1, h - 1, WHITE); at(h - 1, h, BLACK); at(h, h - 1, BLACK); at(h, h, WHITE); }
    return b;
  }
  function create(o) {
    o = o || {};
    const n = o.n === 6 ? 6 : 8, start = o.start === 'par' ? 'par' : 'std';
    return { v: 1, n, start, b: setup(n, start), turn: BLACK, moves: [], over: false, first: BLACK, seed: (o.seed >>> 0) || 0 };
  }
  const clone = st => JSON.parse(JSON.stringify(st));
  const arr = st => Int8Array.from(st.b);
  const legalFor = (st, k) => (st.over ? [] : movesOf(geo(st.n), arr(st), k));
  const legal = st => legalFor(st, st.turn);
  function flipsOf(st, cell, k) {
    k = k || st.turn;
    const g = geo(st.n), b = arr(st), stack = [];
    if (!(cell >= 0 && cell < g.N)) return [];
    const cnt = place(g, b, cell, k, stack);
    return cnt ? stack.slice() : [];
  }
  const isLegal = (st, cell) => !st.over && Number.isInteger(cell) && cell >= 0 && cell < st.n * st.n && canPlace(geo(st.n), arr(st), cell, st.turn);
  function counts(st) { let b = 0, w = 0; for (const v of st.b) { if (v === BLACK) b++; else if (v === WHITE) w++; } return { b, w, e: st.n * st.n - b - w }; }
  function result(st) {
    const c = counts(st);
    return { b: c.b, w: c.w, e: c.e, winner: c.b > c.w ? BLACK : c.b < c.w ? WHITE : 0, diff: c.b - c.w };
  }

  // マスを置く。できなければ null。できれば出来事（置いた・パス・おわり）を返す。ひっくり返る石は fl にマスの番号で入る
  function play(st, cell) {
    if (st.over || !isLegal(st, cell)) return null;
    const g = geo(st.n), b = arr(st), k = st.turn, stack = [];
    place(g, b, cell, k, stack);
    st.b = Array.from(b);
    st.moves.push([cell, k]);
    const ev = [{ t: 'mv', c: cell, k, fl: stack.slice() }];
    const you = opp(k);
    if (movesOf(g, b, you).length) st.turn = you;
    else if (movesOf(g, b, k).length) { st.turn = k; st.moves.push([-1, you]); ev.push({ t: 'pa', k: you }); }
    else { st.over = true; ev.push({ t: 'end' }); }
    return ev;
  }
  // 手の列から作り直す（もどす・つづきから）
  function replay(n, start, list, seed) {
    const st = create({ n, start, seed });
    for (const m of list) { if (m[0] < 0) continue; if (!play(st, m[0])) return null; }
    return st;
  }
  // 人間の番にもどるまで手を戻す：upTo は戻したあとの手の数。st を作り直して返す
  function rewind(st, len) { return replay(st.n, st.start, st.moves.slice(0, Math.max(0, len)), st.seed); }

  // ---------- 名前 ----------
  const name = (cell, n) => (cell < 0 ? 'pass' : COLS[cell % (n || 8)] + (Math.floor(cell / (n || 8)) + 1));
  function parse(s, n) {
    const m = /^([a-h])([1-8])$/.exec(String(s).toLowerCase());
    if (!m) return -1;
    const c = COLS.indexOf(m[1]), r = +m[2] - 1;
    return c < (n || 8) && r < (n || 8) ? r * (n || 8) + c : -1;
  }

  // ---------- 種（局面から決まる。乱数のかわり） ----------
  function hash32(s) {
    let h = 2166136261;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); }
    h ^= h >>> 15; h = Math.imul(h, 2246822519); h ^= h >>> 13;
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const seedOf = (st, level) => hash32(st.b.join('') + ':' + st.turn + ':' + st.moves.length + ':' + level + ':' + (st.seed | 0));

  // ---------- 読む ----------
  const SOLVE_AT = { 8: 12, 6: 14 };
  const DEPTH = { 3: 2, 4: 6 };
  // 手ごとの点（大きいほどよい）。exact が true なら、最後まで読み切った石の差
  function analyze(st, level) {
    const g = geo(st.n), k = st.turn, mv = legal(st);
    const b = arr(st), stack = [], out = [];
    if (!mv.length) return { moves: [], exact: false };
    let empties = 0; for (let i = 0; i < g.N; i++) if (!b[i]) empties++;
    const solve = level >= 4 && empties <= SOLVE_AT[st.n];
    const depth = DEPTH[level] || 2;
    ordered(g, mv);
    let alpha = -1e9;
    for (const c of mv) {
      const cnt = place(g, b, c, k, stack);
      let v;
      if (solve) v = -exact(g, b, opp(k), -999, 999, false);
      else v = -negamax(g, b, opp(k), depth - 1, -1e9, 1e9, false, empties - 1);
      unplace(b, c, opp(k), stack, cnt);
      out.push({ c, v });
      if (v > alpha) alpha = v;
    }
    return { moves: out, exact: solve };
  }
  // 最善手（読み切れる局面なら読み切る）。ヒントにも使う
  function best(st, level) {
    const a = analyze(st, level || 4);
    if (!a.moves.length) return null;
    let top = -1e9; for (const m of a.moves) if (m.v > top) top = m.v;
    const set = a.moves.filter(m => m.v === top);
    return { cell: set[0].c, v: top, exact: a.exact, ties: set.map(m => m.c) };
  }
  // CPU の手（st の手番のぶん）。置けないとき null
  function cpu(st, level) {
    level = Math.max(1, Math.min(4, level | 0 || 2));
    const mv = legal(st);
    if (!mv.length) return null;
    if (mv.length === 1) return mv[0];
    const g = geo(st.n), rnd = rng(seedOf(st, level));
    if (level === 1) {
      return mv[Math.floor(rnd() * mv.length)];
    }
    if (level === 2) {
      // いちばん多く返せる手。ただし角が取れるなら角
      const cor = mv.filter(c => g.corners.indexOf(c) >= 0);
      if (cor.length) return cor[Math.floor(rnd() * cor.length)];
      let top = -1, set = [];
      for (const c of mv) { const f = flipsOf(st, c).length; if (f > top) { top = f; set = [c]; } else if (f === top) set.push(c); }
      return set[Math.floor(rnd() * set.length)];
    }
    const a = analyze(st, level);
    let top = -1e9; for (const m of a.moves) if (m.v > top) top = m.v;
    // はじめの数手は、ほとんど同じ点の手からえらぶ（毎回同じ展開にならないように）
    const tol = level === 4 && !a.exact && st.moves.length < 10 ? 6 : level === 3 ? 4 : 0;
    const set = a.moves.filter(m => m.v >= top - tol).map(m => m.c).sort((x, y) => x - y);
    return set[Math.floor(rnd() * set.length)];
  }

  // 読み切り：手番の人から見た、すべての手の最後の石の差
  function solve(st) {
    const g = geo(st.n), k = st.turn, b = arr(st), stack = [], values = {};
    const mv = legal(st);
    let top = -999;
    for (const c of mv) {
      const cnt = place(g, b, c, k, stack);
      const v = -exact(g, b, opp(k), -999, 999, false);
      unplace(b, c, opp(k), stack, cnt);
      values[c] = v || 0; if (v > top) top = v;
    }
    return { value: (mv.length ? top : finalDiff(g, b, k)) || 0, values, best: mv.filter(c => values[c] === top) };
  }
  // 時間切れのとき：いちばんよわい CPU のように
  const auto = st => cpu(st, 1);

  // ---------- 毎日のパズル ----------
  // 登録簿のパズル集（reversi/puzzles.js が作る）から、種で5問えらぶ。やさしい順。
  function dailySet(seed, bank, count) {
    count = count || 5;
    const list = (bank && bank.list) || [];
    if (!list.length) return [];
    const tiers = []; for (let t = 0; t < count; t++) tiers.push([]);
    for (let i = 0; i < list.length; i++) tiers[Math.min(count - 1, Math.floor(i * count / list.length))].push(i);
    const rnd = rng(hash32('reversi:daily:' + seed)), out = [];
    for (let t = 0; t < count; t++) { const T = tiers[t]; out.push(T[Math.floor(rnd() * T.length)]); }
    return out;
  }
  // パズルの点：いちばん良い手なら 200。そうでなければ、失った石の差に応じて減る
  const puzzlePoints = (bestValue, chosen) => (chosen === bestValue ? 200 : Math.max(0, 150 - 10 * (bestValue - chosen)));
  // パズル 1 問を st にする
  function fromPuzzle(p) {
    const n = 8, b = []; for (let i = 0; i < n * n; i++) b.push(+p.b[i]);
    return { v: 1, n, start: 'std', b, turn: p.k, moves: [], over: false, first: p.k, puzzle: true };
  }

  const API = {
    EMPTY, BLACK, WHITE, DIRS, geo, create, clone, setup, legal, legalFor, isLegal, flipsOf, play, replay, rewind, counts, result, name, parse,
    cpu, best, analyze, solve, auto, hash32, rng, seedOf, dailySet, puzzlePoints, fromPuzzle, finalDiff,
    arr, place, movesOf, exact, opp, SOLVE_AT, get nodes() { return nodes; }, resetNodes() { nodes = 0; },
  };
  root.ReversiEngine = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
