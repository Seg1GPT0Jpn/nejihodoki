// チェス工房：オンライン対戦のアダプター（common/turnroom.js の KoboTurnRoom に渡すもの。node でも動く）
// ---------------------------------------------------------------------------------------------------------------------
// 2人だけ・かくす情報がないゲーム。席 0 が白（先手）、席 1 が黒。もう一度のたびに、turnroom が席を入れかえる（`alternate`）。
// host：ホストのページだけが使う。chess/engine.js の Game をメモリに持ち、手をたしかめて進める。持ち時間の時計もホストが持つ（時間切れの判定はホストの時計）。
//       RTDB に出ていくのは「みんなが見てよい状態 pd」だけ。データベースのルール（pd のキーは英小文字 1〜4 字・配列の添字は 99 まで・文字列は 24 文字まで・数は ±1000000）に収まる形：
//         { m: 手の列（文字列の配列。1つに 8 手。1手は 3 文字 = from・to・昇格の駒）, mc: 手の数, ck: [白の残り, 黒の残り]（0.1 秒の単位。時計なしは 0）,
//           tb: 基本の秒, ti: 1手ごとにふえる秒, of: 申し出（0 なし・1 白が引き分け・2 黒が引き分け・3 白が「待った」・4 黒が「待った」）, rz: 終わりの理由, rw: 勝った席（-1 引き分け）}
//       priv（本人だけが読める部分）に隠すものはないので、空（v だけ）。
// view：どのページでも、model（pd）から、画面（index.html）が描ける状態（Game・最後の手・時計）を作る。
// 手（ワイヤー形式。act の形：t は英小文字 2〜8 字、c・k・w・x は小さな数だけ）：
//   { t: 'mv', c: from, k: to&3, w: (to>>2)&3, x: to>>4 }（昇格は t を 'pq' 'pr' 'pb' 'pn' にする）
//   { t: 'rs' } 投了／{ t: 'dr' } 引き分けの申し出／{ t: 'da' } 受ける／{ t: 'dn' } ことわる／{ t: 'tb' } 「待った」のお願い／{ t: 'ta' } 受ける／{ t: 'fl' } 時間切れの届け
// 出来事（pub.ev）：{ i, t: 'mv', s: 席, c: from, n: to | とった<<6 | チェック<<7 | メイト<<8 | キャスリング<<9 | アンパッサン<<10 | 昇格の駒<<11 } ／ { t: 'do', s } 申し出 ／ { t: 'tk', s, n } 待った ／ { t: 'rs', s } ／ { t: 'fl', s }
// CPU の強さ：meta.cp（1〜3）を CPU_LV で エンジンの強さ（3・5・6）にする。
(function (root) {
  'use strict';
  const E = root.ChessEngine || (typeof require === 'function' ? require('./engine.js') : null);
  const AI = root.ChessAI || (typeof require === 'function' ? require('./ai.js') : null);
  const arr = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const isInt = (v, a, b) => typeof v === 'number' && v === Math.floor(v) && v >= a && v <= b;
  const CFG = { tc: 2 };
  function setCfg(o) { if (o && isInt(o.tc, 0, E.TC.length - 1)) CFG.tc = o.tc; return Object.assign({}, CFG); }
  let nowFn = () => Date.now();
  const setNow = f => { nowFn = f || (() => Date.now()); };
  const CPU_LV = [0, 3, 5, 6];
  const MAXPLY = 790;                    // pd.m は 100 個 × 8 手まで入る
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';
  const PR_CH = { 0: '-', 2: 'n', 3: 'b', 4: 'r', 5: 'q' }, CH_PR = { '-': 0, n: 2, b: 3, r: 4, q: 5 };
  const REASONS = ['mate', 'stalemate', 'insufficient', 'repetition', 'fifty', 'fivefold', 'seventyfive', 'resign', 'time', 'agreed', 'limit', 'abandon'];

  // ---------------------------------------------------------------- 手の文字列
  const encMove = m => B64[m & 63] + B64[(m >> 6) & 63] + PR_CH[(m >> 12) & 15];
  function encMoves(list) {
    const out = []; let cur = '';
    for (const m of list) { cur += encMove(m); if (cur.length >= 24) { out.push(cur); cur = ''; } }
    if (cur) out.push(cur);
    return out;
  }
  // 文字列の並び → [{from, to, promo}…]（形のおかしいものは打ち切る）
  function decMoves(strs) {
    const s = arr(strs).join(''), out = [];
    for (let i = 0; i + 2 < s.length + 0; i += 3) {
      const f = B64.indexOf(s[i]), t = B64.indexOf(s[i + 1]), p = CH_PR[s[i + 2]];
      if (f < 0 || t < 0 || p === undefined) break;
      out.push({ from: f, to: t, promo: p });
    }
    return out;
  }
  // ---------------------------------------------------------------- ワイヤー
  const toWire = (from, to, promo) => ({ t: promo ? 'p' + PR_CH[promo] : 'mv', c: from, k: to & 3, w: (to >> 2) & 3, x: to >> 4 });
  // 形のおかしいものは null。できる手かどうかは apply が見る
  function fromWire(a) {
    if (!a || typeof a.t !== 'string') return null;
    const pm = /^(mv|p[nbrq])$/.exec(a.t); if (!pm) return null;
    if (!isInt(a.c, 0, 63) || !isInt(a.k, 0, 3) || !isInt(a.w, 0, 3) || !isInt(a.x, 0, 3)) return null;
    return { from: a.c, to: a.k | (a.w << 2) | (a.x << 4), promo: a.t === 'mv' ? 0 : CH_PR[a.t[1]] };
  }
  const SIMPLE = ['rs', 'dr', 'da', 'dn', 'tb', 'ta', 'fl'];
  const simpleWire = t => ({ t });

  // ---------------------------------------------------------------- ホスト側のアダプター
  const OFFER_DRAW = [1, 2], OFFER_TB = [3, 4];
  function setResult(st, winner, reason) { st.res = { winner, reason }; if (st.clock) st.clock.stop(nowFn()); }
  function applyStatus(st) {
    const s = st.game.status();
    if (s.over) setResult(st, s.winner, s.reason);
    else if (st.game.list.length >= MAXPLY) setResult(st, -1, 'limit');
  }
  const host = {
    create(o) {
      const tc = CFG.tc, g = new E.Game(), clock = new E.Clock(tc, nowFn());
      clock.start(0, nowFn());
      const humans = [false, false]; for (const k of (o.humans || [])) if (k === 0 || k === 1) humans[k] = true;
      return { game: g, clock, tc, res: null, offer: 0, humans, away: [0, 0], viaCpu: false, g: o.g || 1 };
    },
    turn: st => (st.res ? -1 : st.game.pos.side),
    isOver: st => !!st.res,
    apply(st, seat, a) {
      if (st.res) return null;
      const viaCpu = st.viaCpu; st.viaCpu = false;
      const t = a && a.t, now = nowFn();
      if (t === 'rs') { setResult(st, seat ^ 1, 'resign'); return { ev: [{ t: 'rs', s: seat }] }; }
      if (t === 'dr') {
        if (st.offer === OFFER_DRAW[seat ^ 1]) { setResult(st, -1, 'agreed'); return { ev: [{ t: 'da', s: seat }] }; }
        if (st.offer === OFFER_DRAW[seat]) return null;
        st.offer = OFFER_DRAW[seat]; return { ev: [{ t: 'do', s: seat }], soft: true };
      }
      if (t === 'da') { if (st.offer !== OFFER_DRAW[seat ^ 1]) return null; setResult(st, -1, 'agreed'); return { ev: [{ t: 'da', s: seat }] }; }
      if (t === 'dn') { if (st.offer !== OFFER_DRAW[seat ^ 1] && st.offer !== OFFER_TB[seat ^ 1]) return null; st.offer = 0; return { ev: [{ t: 'dn', s: seat }], soft: true }; }
      if (t === 'tb') {
        if (st.offer) return null;
        const n = st.game.pos.side === seat ? 2 : 1;          // 自分の最後の手まで戻す
        if (st.game.list.length < n) return null;
        st.offer = OFFER_TB[seat]; return { ev: [{ t: 'do', s: seat, c: 1 }], soft: true };
      }
      if (t === 'ta') {
        if (st.offer !== OFFER_TB[seat ^ 1]) return null;
        const r = seat ^ 1, n = st.game.pos.side === r ? 2 : 1;
        if (st.game.list.length < n) { st.offer = 0; return null; }
        st.game.undo(n); st.offer = 0; st.clock.run = r; st.clock.t = now;
        return { ev: [{ t: 'tk', s: r, n }] };
      }
      if (t === 'fl') {
        const side = st.game.pos.side;
        if (!st.clock.on || st.clock.left(side, now) > 0) return null;
        flag(st, side); return { ev: [{ t: 'fl', s: side }] };
      }
      const w = fromWire(a); if (!w) return null;
      if (seat !== st.game.pos.side) return null;
      if (st.clock.on && st.clock.left(seat, now) <= 0) { flag(st, seat); return { ev: [{ t: 'fl', s: seat }] }; }
      const lg = st.game.legal();
      const mv = lg.find(m => (m & 63) === w.from && ((m >> 6) & 63) === w.to && ((m >> 12) & 15) === w.promo);
      if (mv == null) return null;
      const b = st.game.pos.b, pc = b[w.from], fl = mv >> 16, cap = (fl & E.F_CAP) ? 1 : 0;
      const r = st.game.play(mv); if (!r.ok) return null;
      if (!viaCpu) st.away[seat] = 0;
      st.clock.press(seat, now);
      st.offer = 0;
      const stt = r.status;
      const n = w.to | (cap << 6) | ((stt.check ? 1 : 0) << 7) | ((stt.reason === 'mate' ? 1 : 0) << 8) | (((fl & (E.F_KC | E.F_QC)) ? 1 : 0) << 9) | (((fl & E.F_EP) ? 1 : 0) << 10) | (w.promo << 11);
      void pc;
      applyStatus(st);
      return { ev: [{ t: 'mv', s: seat, c: w.from, n }] };
    },
    // CPU が打つ席：はじめから CPU の席は強さ lv どおり。人の席（切れた・出た・時間切れ）の代わりは、2手まで打って、そのあとは投了
    cpu(st, seat, lv) {
      const isHuman = st.humans[seat];
      if (isHuman) { st.away[seat]++; if (st.away[seat] > 2) return simpleWire('rs'); }
      const level = isHuman ? 3 : CPU_LV[clamp(lv || 2, 1, 3)];
      const o = AI.cpuMove(st.game, level, { seed: st.game.list.length * 7919 + (st.g | 0), ms: 220 });
      st.viaCpu = isHuman; if (!o.move) return simpleWire('rs');
      return toWire(o.move & 63, (o.move >> 6) & 63, (o.move >> 12) & 15);
    },
    // 1手の持ち時間切れ（turnroom の「1手 180 秒」）：投了にする
    auto(st) { return simpleWire('rs'); },
    pub(st) {
      const now = nowFn(), clk = st.clock;
      const tc = E.tcOf(st.tc);
      const ck = clk.on ? [Math.round(clk.left(0, now) / 100), Math.round(clk.left(1, now) / 100)] : [0, 0];
      return { m: encMoves(st.game.list), mc: st.game.list.length, ck, tb: tc.base, ti: tc.inc, of: st.offer, rz: st.res ? st.res.reason : '', rw: st.res ? st.res.winner : -2 };
    },
    priv() { return {}; },
    result: st => { const w = st.res ? st.res.winner : -1; return { r: w === 0 ? [1, 2] : w === 1 ? [2, 1] : [1, 1], w: w < 0 ? -1 : w }; },
    // ホストがいなくなったとき：みんなが見えているもの（盤）だけで順位をつける。メイト・投了などが出ていればそのとおり、なければ駒の損得が3点以上なら多いほうの勝ち、それ以外は引き分け
    fallback(pd) {
      const v = decode(pd), g = v.game, s = g.status();
      if (pd && pd.rz && REASONS.indexOf(pd.rz) >= 0 && (pd.rw === 0 || pd.rw === 1 || pd.rw === -1)) return pd.rw === 0 ? { r: [1, 2], w: 0 } : pd.rw === 1 ? { r: [2, 1], w: 1 } : { r: [1, 1], w: -1 };
      if (s.over) return s.winner === 0 ? { r: [1, 2], w: 0 } : s.winner === 1 ? { r: [2, 1], w: 1 } : { r: [1, 1], w: -1 };
      let d = 0; const val = [0, 1, 3, 3, 5, 9, 0];
      for (let i = 0; i < 64; i++) { const p = g.pos.b[i]; if (p) d += (p >> 3 ? -1 : 1) * val[p & 7]; }
      return d >= 3 ? { r: [1, 2], w: 0 } : d <= -3 ? { r: [2, 1], w: 1 } : { r: [1, 1], w: -1 };
    },
    ser: st => JSON.stringify({ u: st.game.ucis, tc: st.tc, res: st.res, offer: st.offer, humans: st.humans, away: st.away, g: st.g, ck: st.clock.rem, run: st.clock.run, on: st.clock.on }),
    de: s => {
      const o = JSON.parse(s), g = E.Game.fromUci(o.u), clock = new E.Clock(o.tc, nowFn());
      clock.rem = o.ck; clock.on = o.on; clock.run = o.run; clock.t = nowFn();
      return { game: g, clock, tc: o.tc, res: o.res, offer: o.offer, humans: o.humans, away: o.away, viaCpu: false, g: o.g };
    },
  };
  function flag(st, side) {
    const g = st.game, w = side ^ 1;
    // 相手がどうしてもメイトできない駒しかないなら、引き分け
    if (!E.canMate(g.pos, w)) setResult(st, -1, 'time'); else setResult(st, w, 'time');
  }

  // ---------------------------------------------------------------- 画面側：model（pd）→ Game・最後の手・時計
  function newCtx() { return { game: null, list: [], gn: 0, recv: 0, v: -1 }; }
  function decode(pd) {
    const g = new E.Game();
    for (const w of decMoves(pd && pd.m)) {
      const lg = g.legal(), mv = lg.find(m => (m & 63) === w.from && ((m >> 6) & 63) === w.to && ((m >> 12) & 15) === w.promo);
      if (mv == null) break; g.play(mv);
    }
    return { game: g };
  }
  function view(m, ctx) {
    const pd = m.pd || {}, me = m.me >= 0 ? m.me : 0, over = m.ph === 'over';
    if (m.fresh || ctx.gn !== m.gn) { ctx.game = null; ctx.list = []; ctx.gn = m.gn; ctx.moves = 0; }
    const want = decMoves(pd.m);
    // 前の局面の続きなら、足すだけ。そうでなければ最初から作る
    let g = ctx.game, k = 0;
    if (g) { while (k < g.list.length && k < want.length && E.uci(g.list[k]) === (E.sqName(want[k].from) + E.sqName(want[k].to) + (want[k].promo ? E.PCH[want[k].promo].toLowerCase() : ''))) k++; if (k < g.list.length) { g.undo(g.list.length - k); } }
    else { g = new E.Game(); k = 0; }
    for (let i = k; i < want.length; i++) {
      const w = want[i], lg = g.legal(), mv = lg.find(x => (x & 63) === w.from && ((x >> 6) & 63) === w.to && ((x >> 12) & 15) === w.promo);
      if (mv == null) break; g.play(mv);
    }
    const added = g.list.length - ctx.list.length, takeback = g.list.length < ctx.list.length;
    ctx.game = g; ctx.list = g.list.slice();
    if (ctx.v !== m.v) { ctx.v = m.v; ctx.recv = Date.now(); }
    const last = g.list.length ? g.list[g.list.length - 1] : null;
    const stt = g.status();
    const rz = typeof pd.rz === 'string' ? pd.rz : '';
    const res = rz && over ? { winner: pd.rw === 0 || pd.rw === 1 ? pd.rw : -1, reason: rz } : stt.over ? { winner: stt.winner, reason: stt.reason } : null;
    const turn = m.tn >= 0 ? m.tn : (stt.over ? -1 : g.pos.side);
    const ck = arr(pd.ck), on = (pd.tb | 0) > 0;
    return {
      game: g, me, color: me, last: last ? { from: last & 63, to: (last >> 6) & 63, m: last } : null, added, takeback, evs: arr(m.ev), turn, over, res, offer: pd.of | 0,
      clock: { on, left: [(ck[0] | 0) * 100, (ck[1] | 0) * 100], recv: ctx.recv, base: pd.tb | 0, inc: pd.ti | 0, running: over ? -1 : turn },
    };
  }

  const API = { host, view, newCtx, toWire, fromWire, simpleWire, arr, setCfg, cfg: CFG, setNow, encMoves, decMoves, decode, encMove, SIMPLE, REASONS, CPU_LV, MAXPLY };
  root.ChessOnline = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
