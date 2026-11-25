// 五目ならべ工房：オンライン対戦のアダプター（common/turnroom.js の KoboTurnRoom に渡すもの。node でも動く）
// ---------------------------------------------------------------------------------------------------------------------
// 2人だけ・かくす情報がないゲーム。席 0 が黒（先手）、席 1 が白。もう一度のたびに、turnroom が席を入れかえる（`alternate`）。
// host：ホストのページだけが使う。gomoku/engine.js の状態をメモリに持ち、手をたしかめて進める。
//       RTDB に出ていくのは「みんなが見てよい状態 pd」だけ：{ n: 盤の大きさ, ru: ルール（free|std|renju）, b: 盤（n 個の文字列。1行＝n 文字の 0/1/2）,
//       o: 打った順（文字列の並び。1つに12手。1手は 行・列 を 16進 1文字ずつ）, lm: 最後に置いたマス（なければ -1）, mc: 手の数 }。
//       （RTDB のルールは、pd の配列の添字を 99 まで・文字列を 24 文字までとしているので、225 マスの盤は「行ごとの文字列」にして入れる）
//       priv（本人だけが読める部分）に隠すものはないので、空（v だけ）。
// view：どのページでも、model（pd）から、画面（index.html）が今までどおり描ける状態と、「いま置かれた石」を作る。
// 手（ワイヤー形式）：{ t: 'mv', c: マスの番号 0..224 }
// 出来事（pub.ev）：{ i, t: 'mv', s: 席, c: マス, n: 何手目 }
// CPU の強さ：meta.cp（1〜3）がそのままエンジンの強さ。
// 盤の大きさ・ルールは、ホストのページが setCfg で決める（部屋を作る前）。ゲストは pd から読む。
(function (root) {
  'use strict';
  const E = root.GomokuEngine || (typeof require === 'function' ? require('./engine.js') : null);
  const arr = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const isInt = (v, a, b) => typeof v === 'number' && v === Math.floor(v) && v >= a && v <= b;
  const CFG = { n: 15, rule: 'free' };
  function setCfg(o) { if (o && E.SIZES.indexOf(o.n) >= 0) CFG.n = o.n; if (o && E.RULES.indexOf(o.rule) >= 0) CFG.rule = o.rule; return Object.assign({}, CFG); }

  // ---------------------------------------------------------------- 盤と手の文字列
  const encRows = (b, n) => { const out = []; for (let r = 0; r < n; r++) out.push(b.slice(r * n, r * n + n).join('')); return out; };
  const decRows = (rows, n) => { const b = []; for (const s of arr(rows)) for (const ch of String(s)) b.push(+ch | 0); while (b.length < n * n) b.push(0); return b.slice(0, n * n); };
  const hx = v => v.toString(16);
  function encMoves(moves, n) {
    const out = []; let cur = '';
    for (const m of moves) { cur += hx((m[0] / n) | 0) + hx(m[0] % n); if (cur.length >= 24) { out.push(cur); cur = ''; } }
    if (cur) out.push(cur);
    return out;
  }
  function decMoves(strs, n) {
    const s = arr(strs).join(''), out = [];
    for (let i = 0; i + 1 < s.length; i += 2) { const r = parseInt(s[i], 16), c = parseInt(s[i + 1], 16); if (r < n && c < n) out.push([r * n + c, out.length % 2 === 0 ? 1 : 2]); }
    return out;
  }

  // ---------------------------------------------------------------- 手
  const toWire = cell => ({ t: 'mv', c: cell });
  // 形のおかしいものは null。できる手かどうかは apply が見る
  function fromWire(a) { return a && a.t === 'mv' && isInt(a.c, 0, 224) ? a.c : null; }

  // ---------------------------------------------------------------- ホスト側のアダプター
  const rankOf = st => ({ r: st.winner === 0 ? [1, 1] : st.winner === 1 ? [1, 2] : [2, 1], w: st.winner === 0 ? -1 : st.winner - 1 });
  const host = {
    create(o) { return E.create({ n: CFG.n, rule: CFG.rule, seed: o.seed }); },
    turn: st => (st.over ? -1 : st.turn - 1),
    isOver: st => !!st.over,
    apply(st, seat, a) {
      if (st.over || st.turn !== seat + 1) return null;
      const cell = fromWire(a);
      if (cell == null || cell >= st.n * st.n || !E.isLegal(st, cell)) return null;
      E.play(st, cell);
      return { ev: [{ t: 'mv', s: seat, c: cell, n: st.moves.length }] };
    },
    cpu(st, seat, lv) { return toWire(E.cpu(st, clamp(lv || 2, 1, 4))); },
    // 時間切れ：いちばんよわい CPU のように
    auto(st) { return toWire(E.auto(st)); },
    pub(st) {
      const last = st.moves.length ? st.moves[st.moves.length - 1][0] : -1;
      return { n: st.n, ru: st.rule, b: encRows(st.b, st.n), o: encMoves(st.moves, st.n), lm: last, mc: st.moves.length };
    },
    priv() { return {}; },
    result: rankOf,
    // ホストがいなくなったとき：みんなが見えているもの（盤）だけで順位をつける。五つ並びができていればその色の勝ち、なければ引き分け
    fallback(pd) {
      const n = pd && E.SIZES.indexOf(pd.n | 0) >= 0 ? pd.n | 0 : 15, rule = pd && E.RULES.indexOf(pd.ru) >= 0 ? pd.ru : 'free';
      const w = winnerOf(decRows(pd && pd.b, n), n, rule, pd && pd.lm != null ? pd.lm | 0 : -1);
      return w === 1 ? { r: [1, 2], w: 0 } : w === 2 ? { r: [2, 1], w: 1 } : { r: [1, 1], w: -1 };
    },
    ser: st => JSON.stringify(st),
    de: s => JSON.parse(s),
  };
  // 盤と最後の手から、勝った色（なければ 0）と並び
  function winnerOf(b, n, rule, last) {
    if (last < 0 || last >= n * n || !b[last]) return 0;
    return E.winLine(b, n, last, b[last], rule) ? b[last] : 0;
  }

  // ---------------------------------------------------------------- 画面側：model → 状態・出来事
  function newCtx() { return { prev: null, gn: 0 }; }
  function view(m, ctx) {
    const pd = m.pd || {}, n = E.SIZES.indexOf(pd.n | 0) >= 0 ? pd.n | 0 : 15, rule = E.RULES.indexOf(pd.ru) >= 0 ? pd.ru : 'free';
    const board = decRows(pd.b, n), moves = decMoves(pd.o, n);
    const me = m.me >= 0 ? m.me : 0, over = m.ph === 'over';
    if (m.fresh || ctx.gn !== m.gn) { ctx.prev = null; ctx.gn = m.gn; }
    const prev = ctx.prev, placed = [];
    if (prev && prev.length === board.length) for (let i = 0; i < board.length; i++) if (!prev[i] && board[i]) placed.push(i);
    ctx.prev = board.slice();
    const last = pd.lm == null ? -1 : pd.lm | 0;
    const turn = m.tn >= 0 ? m.tn + 1 : 0;
    const st = { v: 1, n, rule, b: board, turn: turn || 1, moves, over, winner: 0, line: [], first: 1, seed: 0 };
    if (over && last >= 0 && board[last]) { const ln = E.winLine(board, n, last, board[last], rule); if (ln) { st.winner = board[last]; st.line = ln; } }
    return { st, me, color: me + 1, placed, last, evs: arr(m.ev), turn };
  }

  const API = { host, view, newCtx, toWire, fromWire, arr, rankOf, setCfg, cfg: CFG, encRows, decRows, encMoves, decMoves, winnerOf };
  root.GomokuOnline = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
