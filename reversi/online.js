// リバーシ工房：オンライン対戦のアダプター（common/turnroom.js の KoboTurnRoom に渡すもの。node でも動く）
// ---------------------------------------------------------------------------------------------------------------------
// 2人だけ・かくす情報がないゲーム。席 0 が黒（先手）、席 1 が白。もう一度のたびに、turnroom が席を入れかえる（`alternate`）。
// host：ホストのページだけが使う。reversi/engine.js の状態をメモリに持ち、手をたしかめて進める。
//       RTDB に出ていくのは「みんなが見てよい状態 pd」だけ：{ b: 盤（64個の 0/1/2）, bk・wh: 石の数, lm: 最後に置いたマス（なければ -1）, mc: 置いた数 }。
//       priv（本人だけが読める部分）に隠すものはないので、空（v だけ）。
// view：どのページでも、model（pd）から、画面（index.html）が今までどおり描ける状態と、「いま置かれた・ひっくり返った石」を作る。
// 手（ワイヤー形式）：{ t: 'mv', c: マスの番号 0..63 }
// 出来事（pub.ev）：{ i, t: 'mv', s: 席, c: マス, n: ひっくり返した数 } ／ { i, t: 'pa', s: パスした席 }
// CPU の強さ：meta.cp（1〜3）がそのままエンジンの強さ（1 よわい・2 ふつう・3 つよい）。
(function (root) {
  'use strict';
  const E = root.ReversiEngine || (typeof require === 'function' ? require('./engine.js') : null);
  const arr = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const isInt = (v, a, b) => typeof v === 'number' && v === Math.floor(v) && v >= a && v <= b;
  const N = 8;

  // ---------------------------------------------------------------- 手
  const toWire = cell => ({ t: 'mv', c: cell });
  // 形のおかしいものは null。できる手かどうかは apply が見る
  function fromWire(a) { return a && a.t === 'mv' && isInt(a.c, 0, N * N - 1) ? a.c : null; }

  // ---------------------------------------------------------------- ホスト側のアダプター
  const rankOf = st => {
    const r = E.result(st);
    return { r: r.winner === 0 ? [1, 1] : r.winner === 1 ? [1, 2] : [2, 1], w: r.winner === 0 ? -1 : r.winner - 1 };
  };
  const host = {
    create(o) { return E.create({ n: N, start: 'std', seed: o.seed }); },
    turn: st => (st.over ? -1 : st.turn - 1),
    isOver: st => !!st.over,
    apply(st, seat, a) {
      if (st.over || st.turn !== seat + 1) return null;
      const cell = fromWire(a);
      if (cell == null || !E.isLegal(st, cell)) return null;
      const ev = E.play(st, cell), out = [];
      for (const e of ev) {
        if (e.t === 'mv') out.push({ t: 'mv', s: e.k - 1, c: e.c, n: e.fl.length });
        else if (e.t === 'pa') out.push({ t: 'pa', s: e.k - 1 });
      }
      return { ev: out };
    },
    cpu(st, seat, lv) { return toWire(E.cpu(st, clamp(lv || 2, 1, 4))); },
    // 時間切れ：いちばんよわい CPU のように
    auto(st) { return toWire(E.auto(st)); },
    pub(st) {
      const c = E.counts(st), last = st.moves.filter(m => m[0] >= 0).slice(-1)[0];
      return { b: st.b.slice(), bk: c.b, wh: c.w, lm: last ? last[0] : -1, mc: st.moves.filter(m => m[0] >= 0).length };
    },
    priv() { return {}; },
    result: rankOf,
    // ホストがいなくなったとき：みんなが見えているもの（石の数）だけで順位をつける
    fallback(pd) {
      const bk = pd.bk | 0, wh = pd.wh | 0;
      return bk === wh ? { r: [1, 1], w: -1 } : bk > wh ? { r: [1, 2], w: 0 } : { r: [2, 1], w: 1 };
    },
    ser: st => JSON.stringify(st),
    de: s => JSON.parse(s),
  };

  // ---------------------------------------------------------------- 画面側：model → 状態・出来事
  function newCtx() { return { prev: null, moves: [], gn: 0 }; }
  function view(m, ctx) {
    const pd = m.pd || {}, board = arr(pd.b).map(v => v | 0);
    while (board.length < N * N) board.push(0);
    const me = m.me >= 0 ? m.me : 0, over = m.ph === 'over';
    if (m.fresh || ctx.gn !== m.gn) { ctx.prev = null; ctx.moves = []; ctx.gn = m.gn; }
    const prev = ctx.prev;
    // この更新で置かれた石・ひっくり返った石（盤の差から）
    const placed = [], flipped = [];
    if (prev) for (let i = 0; i < N * N; i++) { if (!prev[i] && board[i]) placed.push(i); else if (prev[i] && board[i] && prev[i] !== board[i]) flipped.push(i); }
    for (const e of arr(m.ev)) {
      if (e.t === 'mv') ctx.moves.push([e.c, e.s + 1]);
      else if (e.t === 'pa') ctx.moves.push([-1, e.s + 1]);
    }
    ctx.prev = board.slice();
    const last = pd.lm == null ? -1 : pd.lm | 0;
    const turn = m.tn >= 0 ? m.tn + 1 : 0;
    const st = { v: 1, n: N, start: 'std', b: board, turn: turn || 1, moves: ctx.moves.slice(), over, first: 1, seed: 0 };
    return { st, me, color: me + 1, placed, flipped, last, evs: arr(m.ev), turn };
  }

  const API = { host, view, newCtx, toWire, fromWire, arr, rankOf };
  root.ReversiOnline = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
