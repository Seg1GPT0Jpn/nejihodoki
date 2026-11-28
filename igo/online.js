// 囲碁工房：オンライン対戦のアダプター（common/turnroom.js の KoboTurnRoom に渡すもの。node でも動く）
// ---------------------------------------------------------------------------------------------------------------------
// 2人だけ・かくす情報がないゲーム。席 0 が黒（先手。置き碁のときは白から打つ）、席 1 が白。もう一度のたびに turnroom が席を入れかえる（`alternate`）。
// host：ホストのページだけが使う。igo/engine.js の状態をメモリに持ち、手をたしかめて進める（CPU の席はホストが打つ）。
//       RTDB に出ていくのは「みんなが見てよい状態 pd」だけ（database.rules.json の pd は、キーが英小文字1〜4字・配列の添字は2けたまで・文字列は24文字まで）：
//         n 盤の大きさ・ru ルール（jp|cn）・km コミの2倍・hc 置き石・sk スーパーコウ（1|0）
//         b  盤（n 個の文字列。1行＝n 文字の 0/1/2）  o 打った順（文字列の並び。1手は3けたの16進：マス、パスは fff。1つに8手。色は交互なので入れない）
//         tc 手番の色（1|2）・kp コウのマス（-1 なし）・ps パスの連続・lm 最後のマス（-1 なし、-2 パス）・mc 手数・cb/cw 黒・白が取った石の数
//         sg 局面（p 対局中・d 死に石えらび・o 終局）・dd 死に石の印（n 個の文字列。1行＝n 文字の 0/1）・cf 確認（2文字。席0・席1、1＝確認ずみ）・rs 結果（'B+3.5'・'W+R'・'W+T'・'0'）
//       priv に隠すものはない（v だけ）。
// 手（ワイヤー形式：RTDB の a は、キー t（2〜8文字の英小文字）と c（-1〜255）・k（-1〜3）だけ。マスは c + 256*k）：
//   { t:'mv', c, k } 打つ ／ { t:'ps' } パス ／ { t:'rg' } 投了 ／ { t:'dd', c, k } 死に石の印を切りかえる ／ { t:'ok' } いまの印でよい ／ { t:'rp' } 対局にもどす
// 死に石えらびの約束（合意）：パスが2回つづくと、ホストが「自動の提案」（プレイアウトの見積もり）を印としてつける。どちらの席もつながりを選んで印を切りかえられる
//   （切りかえると、ふたりの確認が消える）。ふたりが「ok」を送ると、その印で数えて終わる。どちらかが「rp」を送ると、その人から対局にもどる。
//   時間切れの席は「ok」とみなす。CPU の席はいつも「ok」。
// 出来事（pub.ev）：{ i, t:'mv'|'ps'|'rg'|'dd'|'ok'|'rp'|'cn'(数えた), s: 席, n: 手数 }
(function (root) {
  'use strict';
  const E = root.IgoEngine || (typeof require === 'function' ? require('./engine.js') : null);
  const AI = root.IgoAI || (typeof require === 'function' ? require('./ai.js') : null);
  const arr = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);
  const isInt = (v, a, b) => typeof v === 'number' && v === Math.floor(v) && v >= a && v <= b;
  const CFG = { n: 9, rule: 'jp', komi: null, hc: 0, superko: 0 };
  const MAXMOVES = 700;
  function setCfg(o) {
    if (o) {
      if (E.SIZES.indexOf(o.n) >= 0) CFG.n = o.n; if (E.RULES.indexOf(o.rule) >= 0) CFG.rule = o.rule;
      if (o.hc === 0 || (o.hc >= 2 && o.hc <= 9)) CFG.hc = o.hc | 0;
      if (o.komi == null || (typeof o.komi === 'number' && isFinite(o.komi) && o.komi >= 0 && o.komi <= 30)) CFG.komi = o.komi == null ? null : o.komi;
      if (o.superko != null) CFG.superko = o.superko ? 1 : 0;
    }
    return Object.assign({}, CFG);
  }
  // ---------------------------------------------------------------- 文字列
  const encRows = (b, n) => { const out = []; for (let r = 0; r < n; r++) out.push(b.slice(r * n, r * n + n).join('')); return out; };
  const decRows = (rows, n) => { const b = []; for (const s of arr(rows)) for (const ch of String(s)) b.push(+ch | 0); while (b.length < n * n) b.push(0); return b.slice(0, n * n); };
  const h3 = v => (v < 0 ? 'fff' : ('00' + v.toString(16)).slice(-3));
  function encMoves(moves) { const out = []; let cur = ''; for (const m of moves) { cur += h3(m[0]); if (cur.length >= 24) { out.push(cur); cur = ''; } } if (cur) out.push(cur); return out.slice(0, 99); }
  function decMoves(strs, n, first) {
    const s = arr(strs).join(''), out = []; let col = first;
    for (let i = 0; i + 2 < s.length; i += 3) { const v = parseInt(s.slice(i, i + 3), 16); out.push([v === 4095 || !(v >= 0) ? -1 : v < n * n ? v : -1, col]); col = 3 - col; }
    return out;
  }
  // ---------------------------------------------------------------- 手
  const toWire = {
    mv: cell => ({ t: 'mv', c: cell & 255, k: cell >> 8 }), dd: cell => ({ t: 'dd', c: cell & 255, k: cell >> 8 }),
    ps: () => ({ t: 'ps' }), rg: () => ({ t: 'rg' }), ok: () => ({ t: 'ok' }), rp: () => ({ t: 'rp' }),
  };
  // 形のおかしいものは null。できる手かどうかは apply が見る
  function fromWire(a) {
    if (!a || typeof a.t !== 'string') return null;
    if (a.t === 'mv' || a.t === 'dd') { if (!isInt(a.c, 0, 255) || !(a.k == null || isInt(a.k, 0, 3))) return null; return { t: a.t, cell: a.c + 256 * (a.k || 0) }; }
    if (a.t === 'ps' || a.t === 'rg' || a.t === 'ok' || a.t === 'rp') return { t: a.t };
    return null;
  }
  // ---------------------------------------------------------------- ホスト側のアダプター
  const colorOf = seat => seat + 1;
  const seatOf = color => color - 1;
  const rankOf = st => {
    const w = st.result ? st.result.w : 0;
    return { r: w === 0 ? [1, 1] : w === 1 ? [1, 2] : [2, 1], w: w === 0 ? -1 : w - 1 };
  };
  const cpuLevel = cp => ({ 1: 2, 2: 3, 3: 4 }[cp] || 3);
  const host = {
    create(o) {
      const st = E.create({ n: CFG.n, rule: CFG.rule, komi: CFG.komi, hc: CFG.hc, superko: !!CFG.superko });
      st.cf = [0, 0]; return st;
    },
    turn(st) {
      if (st.over) return -1;
      if (st.phase === 'dead') return st.cf[0] ? (st.cf[1] ? 0 : 1) : 0;
      return seatOf(st.turn);
    },
    isOver: st => !!st.over,
    apply(st, seat, a) {
      if (st.over) return null;
      const w = fromWire(a); if (!w) return null;
      const color = colorOf(seat);
      if (w.t === 'rg') { E.resign(st, color); return { ev: [{ t: 'rg', s: seat, n: st.moves.length }] }; }
      if (st.phase === 'play') {
        if (st.turn !== color) return null;
        if (w.t === 'mv') {
          if (w.cell >= st.n * st.n) return null;
          const r = E.play(st, w.cell); if (!r.ok) return null;
          if (st.moves.length >= MAXMOVES) { E.pass(st); E.pass(st); startDead(st); }
          return { ev: [{ t: 'mv', s: seat, n: st.moves.length }] };
        }
        if (w.t === 'ps') { E.pass(st); if (st.phase === 'dead') startDead(st); return { ev: [{ t: 'ps', s: seat, n: st.moves.length }] }; }
        return null;
      }
      if (st.phase === 'dead') {
        if (w.t === 'dd') { if (w.cell >= st.n * st.n || !E.toggleDead(st, w.cell) && !st.b[w.cell]) return null; st.cf = [0, 0]; return { ev: [{ t: 'dd', s: seat, n: st.moves.length }], soft: true }; }
        if (w.t === 'ok') {
          st.cf[seat] = 1;
          if (st.cf[0] && st.cf[1]) { E.confirm(st); return { ev: [{ t: 'cn', s: seat, n: st.moves.length }] }; }
          return { ev: [{ t: 'ok', s: seat, n: st.moves.length }], soft: true };
        }
        if (w.t === 'rp') { E.resume(st, color); st.cf = [0, 0]; return { ev: [{ t: 'rp', s: seat, n: st.moves.length }] }; }
      }
      return null;
    },
    cpu(st, seat, lv) {
      if (st.phase === 'dead') return toWire.ok();
      const r = AI.choose(st, cpuLevel(lv), { time: 330 });
      return r.cell >= 0 ? toWire.mv(r.cell) : toWire.ps();
    },
    // 時間切れ：対局中はパス、死に石えらびでは「ok」
    auto(st) { return st.phase === 'dead' ? toWire.ok() : toWire.ps(); },
    pub(st) {
      const last = st.moves.length ? st.moves[st.moves.length - 1][0] : -1;
      const pd = {
        n: st.n, ru: st.rule, km: Math.round(st.komi * 2), hc: st.hc, sk: st.superko ? 1 : 0,
        b: encRows(st.b, st.n), o: encMoves(st.moves), tc: st.turn, kp: st.ko, ps: st.passes, lm: st.moves.length ? (last < 0 ? -2 : last) : -1, mc: st.moves.length,
        cb: st.caps[1], cw: st.caps[2], sg: st.phase === 'play' ? 'p' : st.phase === 'dead' ? 'd' : 'o',
      };
      if (st.phase !== 'play') { const dm = E.fresh(st.n); for (const c of st.dead) dm[c] = 1; pd.dd = encRows(dm, st.n); pd.cf = String(st.cf[0]) + String(st.cf[1]); }
      if (st.result) pd.rs = st.result.text;
      return pd;
    },
    priv() { return {}; },
    result: rankOf,
    // ホストがいなくなったとき：みんなが見えているもの（盤・死に石の印）だけで勝ち負けをつける
    fallback(pd) {
      const v = viewState(pd || {}, 0);
      if (v.st.result && v.st.result.w >= 0 && pd && pd.rs) return rankOf(v.st);
      const sc = E.score(v.st, v.st.phase === 'play' ? [] : v.st.dead);
      return rankOf({ result: { w: sc.winner } });
    },
    ser: st => JSON.stringify(st),
    de: s => JSON.parse(s),
  };
  function startDead(st) {
    if (st.phase !== 'dead') return;
    try { const r = AI.suggestDead(st, { time: 350, seed: 7 }); st.dead = r.dead.slice(); } catch (e) { st.dead = []; }
    st.cf = [0, 0];
  }
  // 結果の文字列から勝ちの色
  function resultFromText(t) { const s = String(t || ''); return s[0] === 'B' ? 1 : s[0] === 'W' ? 2 : 0; }
  // ---------------------------------------------------------------- 画面側：model → 状態・出来事
  function viewState(pd, firstColor) {
    const n = E.SIZES.indexOf(pd.n | 0) >= 0 ? pd.n | 0 : 9, rule = pd.ru === 'cn' ? 'cn' : 'jp', hc = pd.hc >= 2 && pd.hc <= 9 ? pd.hc | 0 : 0;
    const komi = typeof pd.km === 'number' ? pd.km / 2 : hc ? 0.5 : 6.5;
    const b = decRows(pd.b, n), first = firstColor || (hc ? 2 : 1), moves = decMoves(pd.o, n, first);
    const sg = pd.sg === 'd' ? 'dead' : pd.sg === 'o' ? 'over' : 'play';
    const dm = sg === 'play' ? [] : decRows(pd.dd, n), dead = []; for (let i = 0; i < dm.length; i++) if (dm[i]) dead.push(i);
    const st = { v: 1, n, rule, komi, hc, superko: !!pd.sk, b, turn: pd.tc === 2 ? 2 : 1, ko: typeof pd.kp === 'number' ? pd.kp : -1, caps: [0, pd.cb | 0, pd.cw | 0], moves, passes: pd.ps | 0, phase: sg, result: null, dead, over: sg === 'over', hs: [], start: null, cfg: { n, rule, komi, hc, superko: !!pd.sk } };
    if (sg === 'over' && pd.rs != null) { const w = resultFromText(pd.rs); st.result = { w, by: /R$/.test(pd.rs) ? 'resign' : /T$/.test(pd.rs) ? 'time' : 'score', text: String(pd.rs) }; }
    return { st, cf: String(pd.cf || '00') };
  }
  function newCtx() { return { prev: null, gn: 0 }; }
  function view(m, ctx) {
    const pd = m.pd || {}; const me = m.me >= 0 ? m.me : 0;
    if (m.fresh || ctx.gn !== m.gn) { ctx.prev = null; ctx.gn = m.gn; }
    const v = viewState(pd, 0), st = v.st;
    // 置き石の場合は白から：decMoves の先頭の色
    if (st.hc) { const mm = decMoves(pd.o, st.n, 2); st.moves = mm; }
    const board = st.b, prev = ctx.prev, placed = [], removed = [];
    if (prev && prev.length === board.length) for (let i = 0; i < board.length; i++) { if (!prev[i] && board[i]) placed.push(i); else if (prev[i] && !board[i]) removed.push(i); }
    ctx.prev = board.slice();
    const last = pd.lm == null ? -1 : pd.lm | 0;
    return { st, me, color: me + 1, placed, removed, last, cf: v.cf, evs: arr(m.ev), turn: m.tn >= 0 ? m.tn + 1 : 0 };
  }
  const API = { host, view, newCtx, toWire, fromWire, arr, rankOf, setCfg, cfg: CFG, encRows, decRows, encMoves, decMoves, viewState, cpuLevel, MAXMOVES };
  root.IgoOnline = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
