// いろあわせカード工房：オンライン対戦のアダプター（common/turnroom.js の KoboTurnRoom に渡すもの。node でも動く）
// ---------------------------------------------------------------------------------------------------------------------
// host：ホストのページだけが使う。colorcards/engine.js の状態（全員の手札・山札が入る）をメモリに持ち、手をたしかめて進める。
//       RTDB に出ていくのは「みんなが見てよい状態 pd（手札の枚数・場の上の4枚・向き・色・まもり・ラスト！…）」と
//       「その席だけが見る priv（自分の手札・ひいた札・のぞき見の結果）」だけ。山札と他の人の手札は出ない。
// view：どのページでも、model（pd と自分の priv）から、画面（index.html）が今までどおり描ける「見かけの状態」を作る。
//       他の人の手札は中身を知らないので、1枚ずつ、ほかと重ならない番号の伏せ札に置きかえる（誰かが札を出したら、その伏せ札が
//       出された札になって場へ飛ぶ）。
// 手（ワイヤー形式）：{ t: 'play'|'draw'|'keep'|'call'|'catch', c?: 札, k?: 色, w?: とりかえの相手, x?: のぞき見の相手 }
// 出来事（pub.ev）：{ i, t: 2文字, s, w, c, k, n, x, d }
(function (root) {
  'use strict';
  const E = root.ColorCardsEngine || (typeof require === 'function' ? require('./engine.js') : null);
  const arr = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const isInt = (v, a, b) => typeof v === 'number' && v === Math.floor(v) && v >= a && v <= b;

  // ---------------------------------------------------------------- 手
  function toWire(m) {
    const a = { t: m.t };
    if (m.c != null) a.c = m.c;
    if (m.color != null) a.k = m.color;
    if (m.with != null) a.w = m.with;
    if (m.target != null) a.x = m.target;
    return a;
  }
  // エンジンの手の形（キーの順番も合わせる：E.sameJSON が文字列で比べる）。形のおかしいものは null
  function fromWire(a) {
    if (!a || typeof a.t !== 'string' || ['play', 'draw', 'keep', 'call', 'catch'].indexOf(a.t) < 0) return null;
    if (a.t !== 'play') return { t: a.t };
    if (!isInt(a.c, 0, E.NCARDS - 1)) return null;
    const mv = { t: 'play', c: a.c };
    if (a.k != null) { if (!isInt(a.k, 0, 3)) return null; mv.color = a.k; }
    if (a.w != null) { if (!isInt(a.w, 0, 3)) return null; mv.with = a.w; }
    if (a.x != null) { if (!isInt(a.x, 0, 3)) return null; mv.target = a.x; }
    return mv;
  }

  // ---------------------------------------------------------------- 公開してよい出来事
  const CAUSE = ['draw', 'tangle', 'catch'];
  function pubEvents(ev, st) {
    const out = [];
    for (const e of ev) {
      switch (e.t) {
        case 'play': out.push({ t: 'pl', s: e.seat, c: e.c, k: e.color }); break;
        case 'draw': out.push({ t: 'dr', s: e.seat, n: e.cards.length, w: Math.max(0, CAUSE.indexOf(e.cause)) }); break;
        case 'reshuffle': out.push({ t: 'rs' }); break;
        case 'pass': out.push({ t: 'pa', s: e.seat }); break;
        case 'keep': out.push({ t: 'ke', s: e.seat }); break;
        case 'rev': out.push({ t: 'rv', s: e.seat, d: e.dir }); break;
        case 'swap': out.push({ t: 'sw', s: e.seat, w: e.with }); break;
        case 'peek': out.push({ t: 'pk', s: e.seat, x: e.target, n: st.step }); break;
        case 'block': out.push({ t: 'bl', s: e.seat, w: e.by }); break;
        case 'ward': out.push({ t: 'wd', s: e.seat }); break;
        case 'double': out.push({ t: 'db', s: e.seat }); break;
        case 'dye': out.push({ t: 'dy', s: e.seat, k: e.color }); break;
        case 'call': out.push({ t: 'ca', s: e.seat }); break;
        case 'catch': out.push({ t: 'ct', s: e.seat, w: e.by }); break;
        case 'win': out.push({ t: 'wn', s: e.seat, n: e.gain }); break;
        default: break;
      }
    }
    return out;
  }
  // のぞき見の結果は、のぞいた席にだけ（priv の x）
  function privEvents(ev, st) {
    let pv = null;
    for (const e of ev) if (e.t === 'peek') { pv = pv || {}; pv[e.seat] = { s: st.step, t: e.target, c: e.cards.slice() }; }
    return pv;
  }

  // ---------------------------------------------------------------- ホスト側のアダプター
  const host = {
    create(o) {
      const levels = []; for (let k = 0; k < o.n; k++) levels.push(clamp(o.cp || 2, 1, 3));
      return E.create({ seed: o.seed, n: o.n, level: levels[0], levels, humans: o.humans, first: o.first });
    },
    turn: st => (st.over ? -1 : st.turn),
    isOver: st => !!st.over,
    apply(st, seat, a) {
      if (st.over || st.turn !== seat || st.phase === 'roundover') return null;
      const mv = fromWire(a);
      if (!mv || !E.legal(st).some(m => E.sameJSON(m, mv))) return null;
      const ev = E.apply(st, mv);
      return { ev: pubEvents(ev, st), pv: privEvents(ev, st), soft: mv.t === 'call' || mv.t === 'catch' };
    },
    cpu(st, seat, lv) { st.levels = st.levels || []; st.levels[seat] = lv || 2; return toWire(E.cpu(st)); },
    // 時間切れ：いちばんよわい CPU のように（出せる札からてきとうに・なければ引く）
    auto(st, seat) {
      st.levels = st.levels || [];
      const old = st.levels[seat]; st.levels[seat] = 1;
      const m = E.cpu(st);
      st.levels[seat] = old;
      return toWire(m);
    },
    pub(st) {
      const pd = { co: st.color, dr: st.dir, tp: st.disc.slice(-4), dc: st.draw.length, hc: st.hands.map(h => h.length), wd: st.ward.map(b => (b ? 1 : 0)), cl: st.called.map(b => (b ? 1 : 0)),
        uc: st.uncalled, pp: st.phase === 'drawn' ? 1 : 0, wn: st.winner };
      if (st.over) pd.pt = st.hands.map(E.handPoints);
      return pd;
    },
    priv(st, seat) { return { h: st.hands[seat].slice(), d: st.phase === 'drawn' && st.turn === seat ? st.drawn : -1 }; },
    result(st) { const r = E.result(st); return { r: r.rank.slice(), w: r.winner }; },
    // ホストがいなくなったとき：みんなが見えているもの（手札の枚数）だけで順位をつける
    fallback(pd) {
      const hc = arr(pd.hc), idx = hc.map((x, i) => i).sort((a, b) => hc[a] - hc[b] || a - b), r = new Array(hc.length);
      idx.forEach((s, i) => { r[s] = i + 1; });
      return { r, w: -1 };
    },
    ser: st => JSON.stringify(st),
    de: s => JSON.parse(s),
  };

  // ---------------------------------------------------------------- 画面側：model → 見かけの状態
  function newCtx() { return { ph: [[], [], [], []], pk: 0, seen: 0 }; }
  const zeros = n => { const a = []; for (let i = 0; i < n; i++) a.push(0); return a; };
  function view(m, ctx) {
    const N = m.n, me = m.me >= 0 ? m.me : 0, pd = m.pd || {}, hc = arr(pd.hc), tp = arr(pd.tp), priv = m.priv || {};
    const hand = arr(priv.h);
    if (m.fresh) { ctx.ph = [[], [], [], []]; ctx.pk = 0; }
    // 新しい出来事に合わせて、伏せ札の番号をつけかえる
    const evs = [];
    const newCards = new Set();
    for (const e of m.fresh ? [] : arr(m.ev)) if (e.t === 'pl' && e.c != null) newCards.add(e.c);
    const from = {};
    for (const e of m.fresh ? [] : arr(m.ev)) {
      if (e.t === 'pl' && e.s !== me) from[e.c] = e.s;       // the card flies from that seat's hand to the pile
      else if (e.t === 'sw') {
        if (e.s !== me && e.w !== me) { const t = ctx.ph[e.s]; ctx.ph[e.s] = ctx.ph[e.w]; ctx.ph[e.w] = t; }
        else { ctx.ph[e.s === me ? e.w : e.s] = []; }
      }
    }
    const used = new Set(hand.concat(tp));
    newCards.forEach(c => used.add(c));
    let cursor = 0;
    const fresh = () => { for (let k = 0; k < E.NCARDS; k++) { const id = (cursor + k) % E.NCARDS; if (!used.has(id)) { used.add(id); cursor = id + 1; return id; } } return -1; };
    for (let s = 0; s < N; s++) {
      if (s === me) continue;
      let list = ctx.ph[s];
      // ほかの席が持っている伏せ札・自分の手札・場の札と重なる番号は、別の番号にする
      const keep = [];
      for (const id of list) { if (id >= 0 && !used.has(id)) { used.add(id); keep.push(id); } }
      list = keep;
      const want = clamp(hc[s] || 0, 0, 60);
      while (list.length > want) list.pop();
      while (list.length < want) list.push(fresh());
      ctx.ph[s] = list;
    }
    const hands = [];
    for (let s = 0; s < N; s++) hands.push(s === me ? hand.slice() : ctx.ph[s].slice());
    const over = m.ph === 'over';
    const st = { game: 'colorcards', v: 1, n: N, level: m.cpu || 2, seed: 0, rs: 0, levels: null, humans: [me], over, step: m.v, handSize: 7, match: 0, round: 1,
      scores: zeros(N), rwins: zeros(N), gains: [], first: 0, hands, draw: new Array(clamp(pd.dc || 0, 0, 104)).fill(-1), disc: tp.length ? tp : [0],
      color: pd.co | 0, dir: pd.dr === -1 ? -1 : 1, turn: m.tn >= 0 ? m.tn : Math.max(0, pd.wn | 0), phase: over ? 'over' : pd.pp ? 'drawn' : 'play',
      drawn: pd.pp && m.tn === me && priv.d != null ? priv.d : -1, ward: zeros(N).map((x, i) => !!arr(pd.wd)[i]), called: zeros(N).map((x, i) => !!arr(pd.cl)[i]),
      uncalled: pd.uc == null ? -1 : pd.uc, lack: zeros(N), seen: zeros(N).map(() => ({})), afterDouble: false, winner: pd.wn == null ? -1 : pd.wn, roundGain: 0, timeout: false,
      stat: { plays: zeros(N), swap: zeros(N), peek: zeros(N), tangle: zeros(N), block: zeros(N), dye: zeros(N), double: zeros(N), zero: zeros(N), calls: zeros(N), catches: zeros(N), caught: zeros(N), draws: zeros(N), maxHand: hands.map(h => h.length), dblOut: zeros(N), shield: zeros(N) } };
    // 出来事をエンジンの形に
    if (!m.fresh) {
      for (const e of arr(m.ev)) {
        switch (e.t) {
          case 'pl': evs.push({ t: 'play', seat: e.s, c: e.c, color: e.k, kind: E.INFO[e.c] ? E.INFO[e.c].kind : 'n' }); break;
          case 'dr': evs.push({ t: 'draw', seat: e.s, cards: [], count: e.n, cause: CAUSE[e.w] || 'draw' }); break;
          case 'rs': evs.push({ t: 'reshuffle' }); break;
          case 'pa': evs.push({ t: 'pass', seat: e.s }); break;
          case 'ke': evs.push({ t: 'keep', seat: e.s }); break;
          case 'rv': evs.push({ t: 'rev', seat: e.s, dir: e.d }); break;
          case 'sw': evs.push({ t: 'swap', seat: e.s, with: e.w }); break;
          case 'pk': {
            const x = priv.x;
            const mine = e.s === me && x && x.s === e.n && ctx.pk !== e.n;
            if (mine) ctx.pk = e.n;
            evs.push({ t: 'peek', seat: e.s, target: e.x, cards: mine ? arr(x.c) : null });
            break;
          }
          case 'bl': evs.push({ t: 'block', seat: e.s, by: e.w }); break;
          case 'wd': evs.push({ t: 'ward', seat: e.s }); break;
          case 'db': evs.push({ t: 'double', seat: e.s }); break;
          case 'dy': evs.push({ t: 'dye', seat: e.s, color: e.k }); break;
          case 'ca': evs.push({ t: 'call', seat: e.s }); break;
          case 'ct': evs.push({ t: 'catch', seat: e.s, by: e.w }); break;
          case 'wn': evs.push({ t: 'win', seat: e.s, gain: e.n }); break;
          default: break;
        }
      }
    }
    return { st, evs, me, from };
  }

  const API = { host, view, newCtx, toWire, fromWire, pubEvents, arr };
  root.ColorCardsOnline = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
