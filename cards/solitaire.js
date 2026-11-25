// トランプ広場：ソリティアの中身（決まった結果の純粋なロジック。node でもブラウザでも動く）
// ---------------------------------------------------------------------------------
//   Klondike（山札から1枚 / 3枚めくり）・FreeCell・Spider（1 / 2 / 4 スート）。cards/engine.js のゲームとは別の形（手番も CPU もない一人用）。
//   CardsSolitaire.create({ variant, draw, suits, seed })  → st（JSON にできるものだけ。そのまま保存して続きから遊べる）
//   legal(st) → 手の配列 / apply(st, mv, cont) → events（反則の手は null）/ undo(st)（回数ぎりなし。自動の手は1手とまとめて戻す）
//   hint(st) → 必ず legal の中の1手 / autoNext(st) → 安全に土台へ送れる1手 / autoFinish(st)
//   手：{ t:'mv', f:[山の種類, 番号], n:枚数, to:[山の種類, 番号] } | { t:'draw' }（Klondike の山札）| { t:'deal' }（Spider の山札）
//   山の種類：T 場札の列 / F 土台（Klondike・FreeCell はスートごと、番号 = スート）/ C セル（FreeCell）/ S 山札 / W 捨て札（Klondike）/ D 完成した列（Spider）
//   カード：番号 id（Klondike・FreeCell は 0〜51、Spider は 0〜103）。見た目の札 = faceOf(st, id)（スート×13＋ランク。ランク 0 = A … 12 = K）
//   FreeCell の配りは、番号（1〜）から決まるむかしからの方式（同じ番号 → 同じ配り。1〜32000 はほぼすべて解ける）。今日の配りは日付から決まる。
(function (root) {
  'use strict';

  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const last = a => a[a.length - 1];
  const rk = id => id % 13;

  // ---------- 乱数（mulberry32。状態は st に持たず、配るときだけ使う） ----------
  function mix(seed) {
    let h = ((seed >>> 0) ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function rng(seed) {
    let s = mix(seed);
    return () => {
      s = (s + 0x6D2B79F5) >>> 0;
      let t = s; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  function shuffle(r, a) { for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }

  // ---------- 見た目の札 ----------
  function faceOf(st, id) {
    if (st.variant !== 'spider') return id;
    const k = (id / 13) | 0;   // 0..7 = 同じ並びの8組
    const su = st.suits === 1 ? 0 : st.suits === 2 ? k % 2 : k % 4;
    return su * 13 + rk(id);
  }
  const suitOf = (st, id) => (faceOf(st, id) / 13) | 0;
  const isRed = (st, id) => { const s = suitOf(st, id); return s === 1 || s === 2; };

  // ---------- FreeCell の番号つきの配り ----------
  function msDeal(n) {   // 8列の配列（札は 0〜51）
    let seed = (n >>> 0) || 1;
    const deck = []; for (let i = 0; i < 52; i++) deck.push(i);
    const order = []; let left = 52;
    for (let i = 0; i < 52; i++) {
      seed = (Math.imul(seed, 214013) + 2531011) & 0x7fffffff;
      const j = (seed >>> 16) % left;
      order.push(deck[j]); deck[j] = deck[--left];
    }
    const SU = [3, 2, 1, 0];   // 昔の並び（クラブ・ダイヤ・ハート・スペード）→ このゲームのスート番号
    const cols = Array.from({ length: 8 }, () => []);
    order.forEach((c, i) => cols[i % 8].push(SU[c % 4] * 13 + ((c / 4) | 0)));
    return cols;
  }
  const FC_BAD = 11982;   // 昔から解けないと知られている番号
  function dailySeed(variant, y, m, d) {
    const h = mix(y * 10000 + m * 100 + d + (variant === 'klondike' ? 17 : variant === 'spider' ? 29 : 0));
    if (variant === 'freecell') { let n = 1 + (h % 32000); if (n === FC_BAD) n++; return n; }
    return h || 1;
  }
  function randomSeed(variant, rnd) {
    const r = (rnd || Math.random)();
    if (variant === 'freecell') { let n = 1 + Math.floor(r * 32000); if (n === FC_BAD) n++; return n; }
    return (Math.floor(r * 4294967295) >>> 0) || 1;
  }

  // ---------- 配る ----------
  function create(o) {
    o = o || {};
    const variant = o.variant === 'freecell' || o.variant === 'spider' ? o.variant : 'klondike';
    const st = { game: 'solitaire', v: 1, variant, draw: variant === 'klondike' && o.draw === 3 ? 3 : 1, suits: variant === 'spider' ? ([1, 2, 4].indexOf(o.suits) >= 0 ? o.suits : 1) : 4,
      seed: variant === 'freecell' ? ((o.seed >>> 0) || 1) : ((o.seed >>> 0) || 1), over: false, won: false, moves: 0, gid: 0,
      p: { T: [], F: [], C: [], S: [[]], W: [[]], D: [] }, dn: [], hist: [], humans: [0] };
    const P = st.p;
    if (variant === 'klondike') {
      const d = shuffle(rng(st.seed), Array.from({ length: 52 }, (_, i) => i));
      for (let i = 0; i < 7; i++) { P.T.push(d.splice(d.length - (i + 1), i + 1)); st.dn.push(i); }
      P.S[0] = d;
      for (let s = 0; s < 4; s++) P.F.push([]);
    } else if (variant === 'freecell') {
      msDeal(st.seed).forEach(c => { P.T.push(c); st.dn.push(0); });
      for (let s = 0; s < 4; s++) { P.F.push([]); P.C.push([]); }
    } else {
      const d = shuffle(rng(st.seed), Array.from({ length: 104 }, (_, i) => i));
      for (let i = 0; i < 10; i++) { const k = i < 4 ? 6 : 5; P.T.push(d.splice(d.length - k, k)); st.dn.push(k - 1); }
      P.S[0] = d;
      for (let s = 0; s < 8; s++) P.D.push([]);
    }
    return st;
  }

  // ---------- 規則の小さな部品 ----------
  // 下（深いほう）から順に、その上に重ねてよい並びか（col[q] のすぐ上に col[q+1]）
  function pairOK(st, a, b) {   // a の上に b を置ける？
    if (rk(a) !== rk(b) + 1) return false;
    if (st.variant === 'spider') return suitOf(st, a) === suitOf(st, b);
    return isRed(st, a) !== isRed(st, b);
  }
  function runStart(st, col, from) {   // from 以降で、動かせる並び（最後まで正しく連なる）の先頭の位置
    let s = col.length - 1;
    while (s - 1 >= from && pairOK(st, col[s - 1], col[s])) s--;
    return s;
  }
  const emptyCells = st => st.p.C.filter(c => !c.length).length;
  const emptyCols = st => st.p.T.filter(c => !c.length).length;
  function maxMove(st, toEmpty) {   // FreeCell：いちどに動かせる枚数
    return (emptyCells(st) + 1) * Math.pow(2, Math.max(0, emptyCols(st) - (toEmpty ? 1 : 0)));
  }

  // ---------- 動かせる手 ----------
  function legal(st) {
    const L = [];
    if (st.over) return L;
    const P = st.p, T = P.T, F = P.F;
    const mv = (f, n, to) => L.push({ t: 'mv', f, n, to });
    if (st.variant === 'klondike') {
      if (P.S[0].length || P.W[0].length) L.push({ t: 'draw' });
      const srcs = [];
      if (P.W[0].length) srcs.push({ f: ['W', 0], n: 1, c: last(P.W[0]) });
      for (let i = 0; i < 7; i++) {
        const col = T[i]; if (!col.length) continue;
        for (let pos = runStart(st, col, st.dn[i]); pos < col.length; pos++) srcs.push({ f: ['T', i], n: col.length - pos, c: col[pos] });
      }
      for (let s = 0; s < 4; s++) if (F[s].length) srcs.push({ f: ['F', s], n: 1, c: last(F[s]), fromF: true });
      for (const sr of srcs) {
        const c = sr.c;
        if (sr.n === 1 && !sr.fromF) { const s = suitOf(st, c); if (F[s].length === rk(c)) mv(sr.f, 1, ['F', s]); }
        for (let j = 0; j < 7; j++) {
          if (sr.f[0] === 'T' && sr.f[1] === j) continue;
          const col = T[j];
          if (col.length ? pairOK(st, last(col), c) : rk(c) === 12) mv(sr.f, sr.n, ['T', j]);
        }
      }
    } else if (st.variant === 'freecell') {
      const srcs = [];
      for (let i = 0; i < 8; i++) {
        const col = T[i]; if (!col.length) continue;
        const lim = maxMove(st, false);
        for (let pos = runStart(st, col, 0); pos < col.length; pos++) if (col.length - pos <= lim) srcs.push({ f: ['T', i], n: col.length - pos, c: col[pos] });
      }
      for (let i = 0; i < 4; i++) if (P.C[i].length) srcs.push({ f: ['C', i], n: 1, c: P.C[i][0] });
      const freeCell = P.C.findIndex(c => !c.length);
      for (const sr of srcs) {
        const c = sr.c;
        if (sr.n === 1) { const s = suitOf(st, c); if (F[s].length === rk(c)) mv(sr.f, 1, ['F', s]); }
        for (let j = 0; j < 8; j++) {
          if (sr.f[0] === 'T' && sr.f[1] === j) continue;
          const col = T[j];
          if (col.length) { if (pairOK(st, last(col), c)) mv(sr.f, sr.n, ['T', j]); }
          else if (sr.n <= maxMove(st, true)) mv(sr.f, sr.n, ['T', j]);
        }
        if (sr.f[0] === 'T' && sr.n === 1 && freeCell >= 0) mv(sr.f, 1, ['C', freeCell]);
      }
    } else {
      for (let i = 0; i < 10; i++) {
        const col = T[i]; if (!col.length) continue;
        for (let pos = runStart(st, col, st.dn[i]); pos < col.length; pos++) {
          const c = col[pos];
          for (let j = 0; j < 10; j++) {
            if (j === i) continue;
            const dst = T[j];
            if (dst.length ? rk(last(dst)) === rk(c) + 1 : !(pos === 0)) mv(['T', i], col.length - pos, ['T', j]);
          }
        }
      }
      if (P.S[0].length && T.every(c => c.length)) L.push({ t: 'deal' });
    }
    return L;
  }
  const sameMove = (a, b) => a.t === b.t && (a.t !== 'mv' || (a.n === b.n && a.f[0] === b.f[0] && a.f[1] === b.f[1] && a.to[0] === b.to[0] && a.to[1] === b.to[1]));

  // ---------- 手を打つ・戻す ----------
  function touch(st, rec, k, i) {
    if (rec.s.some(x => x[0] === k && x[1] === i)) return;
    rec.s.push([k, i, st.p[k][i].slice(), k === 'T' ? st.dn[i] : 0]);
  }
  function flipTop(st, rec, i, ev) {
    const col = st.p.T[i];
    if (col.length && st.dn[i] >= col.length) { st.dn[i] = col.length - 1; ev.push({ t: 'flip', i, c: last(col) }); }
  }
  function completeRuns(st, rec, ev) {   // Spider：K〜A が同じスートでそろった列を取り除く
    for (let i = 0; i < 10; i++) {
      const col = st.p.T[i];
      if (col.length < 13 || col.length - 13 < st.dn[i]) continue;
      const base = col.length - 13, su = suitOf(st, col[base]);
      let ok = true;
      for (let q = 0; q < 13 && ok; q++) { const c = col[base + q]; if (rk(c) !== 12 - q || suitOf(st, c) !== su) ok = false; }
      if (!ok) continue;
      const di = st.p.D.findIndex(d => !d.length);
      touch(st, rec, 'T', i); touch(st, rec, 'D', di);
      st.p.D[di] = col.splice(base, 13);
      ev.push({ t: 'run', i, d: di, suit: su });
      flipTop(st, rec, i, ev);
    }
  }
  function isWon(st) {
    if (st.variant === 'spider') return st.p.D.every(d => d.length === 13);
    return st.p.F.reduce((n, f) => n + f.length, 0) === 52;
  }
  function apply(st, mv, cont) {
    if (st.over || !mv) return null;
    if (!legal(st).some(m => sameMove(m, mv))) return null;
    const rec = { s: [], g: cont ? st.gid : ++st.gid, m: st.moves, mv, a: cont ? 1 : 0 }, ev = [];
    const P = st.p;
    if (mv.t === 'mv') {
      touch(st, rec, mv.f[0], mv.f[1]); touch(st, rec, mv.to[0], mv.to[1]);
      const src = P[mv.f[0]][mv.f[1]], cards = src.splice(src.length - mv.n, mv.n);
      P[mv.to[0]][mv.to[1]].push.apply(P[mv.to[0]][mv.to[1]], cards);
      ev.push({ t: 'move', f: mv.f, to: mv.to, cards });
      if (mv.f[0] === 'T') flipTop(st, rec, mv.f[1], ev);
      if (st.variant === 'spider') completeRuns(st, rec, ev);
    } else if (mv.t === 'draw') {
      touch(st, rec, 'S', 0); touch(st, rec, 'W', 0);
      const S = P.S[0], W = P.W[0];
      if (S.length) { for (let k = 0; k < st.draw && S.length; k++) W.push(S.pop()); ev.push({ t: 'draw' }); }
      else { P.S[0] = W.slice().reverse(); P.W[0] = []; ev.push({ t: 'recycle' }); }
    } else if (mv.t === 'deal') {
      touch(st, rec, 'S', 0);
      for (let i = 0; i < 10; i++) touch(st, rec, 'T', i);
      for (let i = 0; i < 10; i++) P.T[i].push(P.S[0].pop());
      ev.push({ t: 'deal' });
      completeRuns(st, rec, ev);
    }
    st.hist.push(rec); st.moves++;
    if (isWon(st)) { st.over = st.won = true; ev.push({ t: 'win' }); }
    return ev;
  }
  function undo(st) {
    if (!st.hist.length || st.won) return false;
    const g = last(st.hist).g;
    while (st.hist.length && last(st.hist).g === g) {
      const rec = st.hist.pop();
      for (const [k, i, arr, dn] of rec.s) { st.p[k][i] = arr; if (k === 'T') st.dn[i] = dn; }
      st.moves = rec.m;
    }
    st.over = false;
    return true;
  }

  // ---------- 自動で土台へ（Klondike・FreeCell） ----------
  function foundationMoves(st) {
    if (st.variant === 'spider') return [];
    return legal(st).filter(m => m.t === 'mv' && m.to[0] === 'F');
  }
  function isSafe(st, mv) {
    const c = mv.f[0] === 'T' ? last(st.p.T[mv.f[1]]) : mv.f[0] === 'W' ? last(st.p.W[0]) : st.p.C[mv.f[1]][0];
    const r = rk(c);
    if (r <= 1) return true;
    const red = isRed(st, c), F = st.p.F;
    for (let s = 0; s < 4; s++) { const o = s === 1 || s === 2; if (o !== red && F[s].length < r) return false; }
    return true;
  }
  function autoNext(st) { return foundationMoves(st).find(m => isSafe(st, m)) || null; }
  // newGroup：true なら、さいしょの手から新しい1まとまり（「オート」ボタン）。false なら、いまの手のあとにつづけてまとめる（手を打ったあとの自動）
  function autoSafe(st, newGroup) { // 安全な手を続けて打つ。打った数を返す
    let n = 0, mv;
    while (!st.over && (mv = autoNext(st))) { apply(st, mv, !(newGroup && n === 0)); n++; }
    return n;
  }
  function autoFinish(st, newGroup) { // 土台へ送れるだけ送る。打った数を返す
    let n = 0, ms;
    while (!st.over && (ms = foundationMoves(st)).length) { apply(st, ms[0], !(newGroup && n === 0)); n++; }
    return n;
  }
  function canAutoFinish(st) { // 土台への手だけで、そのまま完成できる？
    if (st.over || st.variant === 'spider') return false;
    const c = JSON.parse(JSON.stringify(st)); c.hist = [];
    autoFinish(c);
    return c.won;
  }

  // ---------- ヒント（かならず legal の手のどれか） ----------
  function reveals(st, mv) {
    return mv.f[0] === 'T' && st.dn[mv.f[1]] > 0 && st.p.T[mv.f[1]].length - mv.n === st.dn[mv.f[1]];
  }
  function score(st, mv) {
    if (mv.t === 'draw') return st.p.S[0].length ? 10 : 2;
    if (mv.t === 'deal') return 5;
    const P = st.p, v = st.variant, fromT = mv.f[0] === 'T', toK = mv.to[0];
    const srcCol = fromT ? P.T[mv.f[1]] : null;
    const wholeToEmpty = fromT && toK === 'T' && srcCol.length === mv.n && !P.T[mv.to[1]].length;
    const rev = reveals(st, mv);
    let sc = 0;
    if (v === 'spider') {
      const col = P.T[mv.f[1]], c = col[col.length - mv.n], dst = P.T[mv.to[1]];
      if (dst.length && suitOf(st, last(dst)) === suitOf(st, c)) {
        sc = 80;
        const joined = mv.n + (function () { let k = 1; while (k < dst.length && pairOK(st, dst[dst.length - k - 1], dst[dst.length - k])) k++; return k; })();
        if (joined >= 13) sc = 200;
      } else sc = dst.length ? 30 : 10;
      if (rev) sc += 40;
      const before = col.length - mv.n > 0 ? suitOf(st, col[col.length - mv.n - 1]) === suitOf(st, c) && rk(col[col.length - mv.n - 1]) === rk(c) + 1 : false;
      if (before) sc -= 60;   // つながっていた並びを切ってしまう
      if (wholeToEmpty) sc -= 50;
      return sc;
    }
    if (toK === 'F') sc = 100 + (rev ? 20 : 0);
    else if (v === 'klondike') {
      if (fromT) sc = (rev ? 80 : 40) + (P.T[mv.to[1]].length ? 0 : (rev ? 0 : -10));
      else if (mv.f[0] === 'W') sc = 60;
      else sc = 3;
      if (wholeToEmpty) sc = -50;
    } else {
      if (mv.f[0] === 'C') sc = 70;
      else if (toK === 'C') {
        const col = P.T[mv.f[1]], under = col.length >= 2 ? col[col.length - 2] : -1;
        sc = under >= 0 && P.F[suitOf(st, under)].length === rk(under) ? 40 : 8;
      } else sc = (P.T[mv.to[1]].length ? 60 : 20) + (rev ? 5 : 0);
      if (wholeToEmpty) sc = -50;
      if (fromT && mv.n === 1 && toK === 'T') { const col = P.T[mv.f[1]]; if (col.length >= 2 && P.F[suitOf(st, col[col.length - 2])].length === rk(col[col.length - 2])) sc += 25; }
    }
    return sc;
  }
  function undoesLast(st, mv) {
    const r = last(st.hist); if (!r || mv.t !== 'mv' || r.mv.t !== 'mv') return false;
    const a = r.mv;
    return a.n === mv.n && a.f[0] === mv.to[0] && a.f[1] === mv.to[1] && a.to[0] === mv.f[0] && a.to[1] === mv.f[1];
  }
  function hint(st) {
    const L = legal(st); if (!L.length) return null;
    let best = null, bs = -1e9;
    for (const m of L) {
      let s = score(st, m) - (undoesLast(st, m) ? 150 : 0);
      if (m.t === 'mv' && m.f[0] === 'F') s = Math.min(s, 3);
      if (s > bs) { bs = s; best = m; }
    }
    return best;
  }

  // ---------- テスト・デバッグ用：あと一手で完成する局面 ----------
  function nearWin(st) {
    const P = st.p;
    P.T = P.T.map(() => []); st.dn = P.T.map(() => 0); P.S = [[]]; P.W = [[]]; P.C = P.C.map(() => []); st.hist = []; st.over = st.won = false;
    if (st.variant === 'spider') {
      for (let k = 0; k < 7; k++) P.D[k] = Array.from({ length: 13 }, (_, q) => k * 13 + 12 - q);
      P.D[7] = [];
      P.T[0] = Array.from({ length: 12 }, (_, q) => 7 * 13 + 12 - q);   // K … 2
      P.T[1] = [7 * 13];                                                  // A
    } else {
      for (let s = 0; s < 4; s++) P.F[s] = Array.from({ length: 12 }, (_, q) => s * 13 + q);
      for (let s = 0; s < 4; s++) P.T[s] = [s * 13 + 12];
    }
    return st;
  }
  function progress(st) {
    return st.variant === 'spider' ? st.p.D.filter(d => d.length === 13).length * 13 : st.p.F.reduce((n, f) => n + f.length, 0);
  }

  const API = { create, legal, apply, undo, hint, autoNext, autoSafe, autoFinish, canAutoFinish, foundationMoves, sameMove, faceOf, suitOf, isRed, msDeal, dailySeed, randomSeed, nearWin, progress, isWon, runStart, maxMove, rk,
    VARIANTS: ['klondike', 'freecell', 'spider'], FC_BAD };
  if (typeof module !== 'undefined' && module.exports) module.exports = API;
  else root.CardsSolitaire = API;
})(typeof window !== 'undefined' ? window : globalThis);
