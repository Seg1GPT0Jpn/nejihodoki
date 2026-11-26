// 麻雀工房：オンライン対戦のアダプター（common/turnroom.js の KoboTurnRoom に渡すもの。node でも動く）
// ---------------------------------------------------------------------------------------------------------------------
// host：ホストのページだけが使う。engine.js の状態（全員の手牌・牌山が入る）をメモリに持ち、手をたしかめて進める。
//       RTDB に出ていくのは「みんなが見てよい状態 pd（河・副露・点数・ドラ表示牌・残り枚数・手牌の枚数…）」と
//       「その席だけが見る priv（自分の手牌・ひいた牌・いまできる手のコード）」だけ。牌山・他の人の手牌・裏ドラは出ない（局が終わるまで）。
// view：どのページでも、model（pd と自分の priv）から、画面（app.js）が描ける「見かけの状態」を作る。他の人の手牌は枚数ぶんの -1。
// 手（ワイヤー形式。database.rules.json の act の形に合わせる：t は a-z の2〜8字、c は -1〜255、k・w・x は -1〜3）：
//   { t:'discard', c: 牌の id, k: リーチなら 1 } | { t:'tsumo' } | { t:'ron' } | { t:'pass' } | { t:'kyuushu' } | { t:'daiminkan' }
//   { t:'ankan', c: 牌の種類 } | { t:'kakan', c: 牌の id } | { t:'pon', c: 選べる形の番号 } | { t:'chii', c: 選べる形の番号 } | { t:'nx' }（局の結果を見た。次へ）
// 出来事（pub.ev：t は2文字）：dc 切る(s,c,d=リーチ) po ポン ci チー dk 大明槓 ak 暗槓 kk 加槓 ag あがり(s,w=放銃,d=ツモ) dw 流局 ro 次の局
// pd の形：キーは a-z の1〜4字、値は数・短い文字列・数の配列（添字0〜99）。入れ子の配列はなし。
(function (root) {
  'use strict';
  const E = root.MahjongEngine || (typeof require === 'function' ? require('./engine.js') : null);
  const AI = root.MahjongAI || (typeof require === 'function' ? require('./ai.js') : null);
  const arr = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const YK = Object.keys(E.YAKU);
  const LIM = ['', 'mangan', 'haneman', 'baiman', 'sanbaiman', 'kazoe', 'yakuman', 'double-yakuman'];
  const WHY = ['exhaust', 'kyuushu', 'suufon', 'suucha', 'suukan', 'sanchahou'];
  const MT = { chi: 1, pon: 2, daiminkan: 3, ankan: 4, kakan: 5 }, MN = ['', 'chi', 'pon', 'daiminkan', 'ankan', 'kakan'];
  const PH = { discard: 'dis', call: 'cal', end: 'end' }, PHN = { dis: 'discard', cal: 'call', end: 'end' };
  const SUF = ['a', 'b', 'c', 'd'];

  // ---------------------------------------------------------------- 手
  function toWire(a) {
    switch (a.t) {
      case 'discard': return { t: 'discard', c: a.tile, k: a.riichi ? 1 : 0 };
      case 'ankan': return { t: 'ankan', c: a.kind };
      case 'kakan': return { t: 'kakan', c: a.tile };
      case 'pon': case 'chii': return { t: a.t, c: a.idx != null ? a.idx : 0 };
      default: return { t: a.t };
    }
  }
  const isInt = (v, a, b) => typeof v === 'number' && v === Math.floor(v) && v >= a && v <= b;
  // ワイヤーの手 → エンジンの手（ホスト側。st で選べる形から選ぶ）。形がおかしいものは null
  function fromWire(st, seat, a) {
    if (!a || typeof a.t !== 'string') return null;
    switch (a.t) {
      case 'discard': if (!isInt(a.c, 0, 135)) return null; return { t: 'discard', tile: a.c, riichi: a.k === 1 };
      case 'tsumo': case 'ron': case 'pass': case 'kyuushu': case 'daiminkan': return { t: a.t };
      case 'ankan': if (!isInt(a.c, 0, 33)) return null; return { t: 'ankan', kind: a.c };
      case 'kakan': if (!isInt(a.c, 0, 135)) return null; return { t: 'kakan', tile: a.c };
      case 'pon': case 'chii': { if (!isInt(a.c, 0, 20)) return null; const o = E.legal(st, seat).filter(x => x.t === a.t)[a.c]; return o || null; }
      default: return null;
    }
  }

  // ---------------------------------------------------------------- 公開してよい出来事
  function pubEvents(ev) {
    const out = [];
    for (const e of ev || []) {
      switch (e.t) {
        case 'discard': out.push({ t: 'dc', s: e.s, c: e.tile, d: e.riichi ? 1 : 0 }); break;
        case 'pon': out.push({ t: 'po', s: e.s, w: e.from, c: e.tile }); break;
        case 'chii': out.push({ t: 'ci', s: e.s, w: e.from, c: e.tile }); break;
        case 'daiminkan': out.push({ t: 'dk', s: e.s, w: e.from, c: e.tile }); break;
        case 'ankan': out.push({ t: 'ak', s: e.s, c: e.kind }); break;
        case 'kakan': out.push({ t: 'kk', s: e.s, c: e.tile }); break;
        case 'agari': out.push({ t: 'ag', s: e.result.winners[0].seat, w: e.result.from == null ? -1 : e.result.from, d: e.result.type === 'tsumo' ? 1 : 0 }); break;
        case 'draw-end': out.push({ t: 'dw', n: Math.max(0, WHY.indexOf(e.why)) }); break;
        default: break;
      }
    }
    return out;
  }

  // ---------------------------------------------------------------- pd の書き出し
  const encRiver = rv => rv.map(r => r.t | (r.riichi ? 256 : 0) | (r.called ? 512 : 0) | (r.tsumogiri ? 1024 : 0));
  const encMelds = ms => { const o = []; for (const m of ms) { const t = m.tiles.slice(); while (t.length < 4) t.push(-1); o.push(MT[m.type], m.from, m.called == null ? -1 : m.called, m.added == null ? -1 : m.added, t[0], t[1], t[2], t[3]); } return o; };
  const cfgCode = c => [c.mode === 'hanchan' ? 1 : c.mode === 'mini' ? 2 : 0, c.aka ? 1 : 0, c.ura ? 1 : 0, c.ippatsu ? 1 : 0, c.kuitan ? 1 : 0, c.tobi ? 1 : 0, c.west ? 1 : 0, c.oka ? 1 : 0, ['10-20', '5-10', 'none'].indexOf(c.uma)];
  function encWinner(w, sfx, pd) {
    pd['wa' + sfx] = [w.seat, w.han, w.fu, w.yakuman || 0, w.total, Math.max(0, LIM.indexOf(w.limit || '')), w.tsumo ? 1 : 0, w.win, w.honba || 0, w.sticks || 0];
    pd['wh' + sfx] = w.hand.slice(); pd['wm' + sfx] = encMelds(w.melds || []);
    const y = []; for (const q of w.yaku) y.push(YK.indexOf(q.id), q.han); pd['wy' + sfx] = y;
    pd['wu' + sfx] = (w.ura || []).slice();
  }
  function pub(st) {
    const pd = { ph: PH[st.phase] || 'dis', sc: st.scores.slice(), dl: st.dealer, rw: st.roundWind, ky: st.kyoku, hb: st.honba, kt: st.kyotaku, rn: st.roundNo, rm: Math.max(0, E.remaining(st)), dn: st.doraN,
      di: E.doraIndicators(st), hc: st.hands.map(h => h.length), ri: st.riichi.slice(), ip: st.ippatsu.map(x => (x ? 1 : 0)), fp: st.furi.map(x => (x ? 1 : 0)), ft: st.tmpFuri.map(x => (x ? 1 : 0)),
      ncl: st.noCalls ? 1 : 0, kn: st.kans, ds: st.discards, rin: st.rinshanDraw ? 1 : 0, dw: st.phase === 'discard' && st.drawn >= 0 ? 1 : 0, kk: st.kuikae.slice(), cf: cfgCode(st.cfg), go: st.over ? 1 : 0 };
    for (let s = 0; s < 4; s++) { pd['r' + SUF[s]] = encRiver(st.rivers[s]); pd['m' + SUF[s]] = encMelds(st.melds[s]); }
    if (st.call) pd.cl = [st.call.tile, st.call.from, st.call.kind === 'discard' ? 0 : st.call.kind === 'kakan' ? 1 : 2];
    if (st.lastDiscard) pd.lt = [st.lastDiscard.seat, st.lastDiscard.idx];
    if (st.phase === 'end' && st.result) {
      const r = st.result;
      pd.rt = r.type === 'tsumo' ? 0 : r.type === 'ron' ? 1 : 2; pd.dt = r.delta.slice(); pd.rf = r.from == null ? -1 : r.from;
      if (r.type === 'draw') {
        pd.dwy = Math.max(0, WHY.indexOf(r.why)); pd.tp = (r.tenpai || [0, 0, 0, 0]).map(x => (x ? 1 : 0)); pd.ng = (r.nagashi || []).slice();
        if (r.why === 'exhaust') for (let s = 0; s < 4; s++) if (r.tenpai[s]) { pd['t' + SUF[s]] = r.hands[s].slice(); pd['n' + SUF[s]] = encMelds(r.melds[s] || []); }
      } else {
        r.winners.slice(0, 2).forEach((w, i) => encWinner(w, SUF[i], pd));
        pd.ui = E.uraIndicators(st).slice(0, st.doraN);
      }
    }
    return pd;
  }

  // ---------------------------------------------------------------- 本人だけのコード：できる手
  // x.c = [1, 打てる種類のビット×5, リーチで打てる種類のビット×5, (種類, a, b) …]
  const T_ = { tsumo: 1, ron: 2, pass: 3, ankan: 5, kakan: 6, kyuushu: 7, pon: 8, chii: 9, daiminkan: 10 };
  function encLegal(st, seat) {
    const L = E.legal(st, seat), c = [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0];
    for (const a of L) {
      if (a.t === 'discard') { const k = a.tile >> 2, i = (a.riichi ? 6 : 1) + (k >> 3); c[i] |= 1 << (k & 7); }
      else if (a.t === 'pon' || a.t === 'chii') c.push(T_[a.t], a.use[0], a.use[1]);
      else if (a.t === 'ankan') c.push(5, a.kind, 0);
      else if (a.t === 'kakan') c.push(6, a.tile, 0);
      else c.push(T_[a.t], 0, 0);
    }
    return c;
  }
  function decLegal(bytes, hand) {
    const c = arr(bytes), out = [];
    if (!c.length) return out;
    const mask = off => { const s = new Set(); for (let k = 0; k < 34; k++) if (c[off + (k >> 3)] & (1 << (k & 7))) s.add(k); return s; };
    const dm = mask(1), rm = mask(6);
    for (const id of hand) { if (dm.has(id >> 2)) out.push({ t: 'discard', tile: id }); }
    for (const id of hand) { if (rm.has(id >> 2)) out.push({ t: 'discard', tile: id, riichi: true }); }
    const names = { 1: 'tsumo', 2: 'ron', 3: 'pass', 5: 'ankan', 6: 'kakan', 7: 'kyuushu', 8: 'pon', 9: 'chii', 10: 'daiminkan' };
    const idx = { pon: 0, chii: 0 };
    for (let i = 11; i + 2 < c.length + 0; i += 3) {
      const t = names[c[i]]; if (!t) continue;
      if (t === 'pon' || t === 'chii') out.push({ t, use: [c[i + 1], c[i + 2]], idx: idx[t]++ });
      else if (t === 'ankan') out.push({ t, kind: c[i + 1] });
      else if (t === 'kakan') out.push({ t, tile: c[i + 1] });
      else out.push({ t });
    }
    return out;
  }

  // ---------------------------------------------------------------- ホスト側のアダプター
  const defaultCfg = () => (root.MahjongOnline && root.MahjongOnline.getCfg ? root.MahjongOnline.getCfg() : { mode: 'east' });
  const markEnd = st => { st.ack = [0, 1, 2, 3].map(s => st.humans.indexOf(s) < 0); };
  const host = {
    create(o) {
      const lv = clamp(o.cp || 2, 1, 3);
      const st = E.create({ seed: o.seed, levels: [lv, lv, lv, lv], humans: o.humans || [0], cfg: defaultCfg() });
      st.step = 0; st.ack = [true, true, true, true]; st.netNames = null;
      return st;
    },
    turn(st) {
      if (st.over && st.phase === 'end' && (!st.ack || st.ack.every(x => x))) return -1;
      if (st.phase === 'end') { const s = st.ack.findIndex(x => !x); return s < 0 ? -1 : s; }
      const w = E.waiting(st); return w.length ? w[0] : -1;
    },
    isOver: st => !!st.over && (!st.ack || st.ack.every(x => x)),
    apply(st, seat, a) {
      st.step = (st.step || 0) + 1;
      if (a && a.t === 'nx') {
        if (st.phase !== 'end') return null;
        if (!st.ack) markEnd(st);
        st.ack[seat] = true;
        if (!st.ack.every(x => x)) return { ev: [], soft: true };
        if (st.over) return { ev: [] };
        E.nextRound(st);
        if (!st.over) { st.ack = [true, true, true, true]; return { ev: [{ t: 'ro', n: st.roundNo }] }; }
        return { ev: [] };
      }
      if (st.phase === 'end') return null;
      const e = fromWire(st, seat, a); if (!e) return null;
      const r = E.apply(st, seat, e); if (!r) return null;
      if (st.phase === 'end') markEnd(st);
      const ev = pubEvents(r.ev);
      return { ev, soft: st.phase === 'call' && E.waiting(st).length > 0 };
    },
    cpu(st, seat, lv) {
      if (st.phase === 'end') return { t: 'nx' };
      return toWire(AI.decide(st, seat, clamp(lv || 2, 1, 3), Math.random));
    },
    // 時間切れ：あがれるならあがる。それ以外はツモ切り（鳴きはパス）
    auto(st, seat) { if (st.phase === 'end') return { t: 'nx' }; return toWire(AI.auto(st, seat)); },
    pub,
    priv(st, seat) {
      const o = { h: st.hands[seat].slice(), d: st.phase === 'discard' && st.turn === seat && st.drawn >= 0 ? st.drawn : -1 };
      o.x = { s: st.step || 0, t: -1, c: st.phase === 'end' ? [1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0] : encLegal(st, seat) };
      return o;
    },
    result(st) { const f = st.final || E.finalScores(st); const r = f.rank.slice(); return { r, w: f.order[0] }; },
    // ホストがいなくなったとき：みんなに見えている点数だけで順位をつける
    fallback(pd) {
      const sc = arr(pd.sc), idx = sc.map((x, i) => i).sort((a, b) => sc[b] - sc[a] || a - b), r = new Array(sc.length);
      idx.forEach((s, i) => { r[s] = i + 1; });
      return { r, w: idx[0] };
    },
    ser: st => JSON.stringify(st),
    de: s => JSON.parse(s),
  };

  // ---------------------------------------------------------------- 画面側：model → 見かけの状態
  function decMelds(a) {
    const out = [], v = arr(a);
    for (let i = 0; i + 7 < v.length; i += 8) {
      const type = MN[v[i]]; if (!type) continue;
      const tiles = [v[i + 4], v[i + 5], v[i + 6], v[i + 7]].filter(x => x >= 0);
      out.push({ type, kind: tiles.length ? tiles[0] >> 2 : 0, tiles, open: type !== 'ankan', from: v[i + 1], called: v[i + 2] >= 0 ? v[i + 2] : -1, added: v[i + 3] >= 0 ? v[i + 3] : null });
    }
    return out;
  }
  function decWinner(pd, sfx) {
    const a = arr(pd['wa' + sfx]); if (!a.length) return null;
    const y = arr(pd['wy' + sfx]), yaku = [];
    for (let i = 0; i + 1 < y.length; i += 2) if (YK[y[i]]) yaku.push({ id: YK[y[i]], han: y[i + 1] });
    return { seat: a[0], han: a[1], fu: a[2], yakuman: a[3], total: a[4], limit: LIM[a[5]] || '', tsumo: !!a[6], win: a[7], honba: a[8], sticks: a[9], hand: arr(pd['wh' + sfx]), melds: decMelds(pd['wm' + sfx]), yaku, ura: arr(pd['wu' + sfx]), pay: {}, fuDetail: null };
  }
  function view(m) {
    const pd = m.pd || {}, N = 4, me = m.me >= 0 ? m.me : 0, priv = m.priv || {};
    const cf = arr(pd.cf), cfg = { mode: cf[0] === 1 ? 'hanchan' : cf[0] === 2 ? 'mini' : 'east', mini: cf[0] === 2, aka: !!cf[1], ura: !!cf[2], ippatsu: !!cf[3], kuitan: !!cf[4], tobi: !!cf[5], west: !!cf[6], oka: !!cf[7], uma: ['10-20', '5-10', 'none'][cf[8]] || '10-20', kazoe: true, doubleYakuman: true, start: 25000, ret: 30000 };
    const hc = arr(pd.hc), hand = arr(priv.h);
    const phase = PHN[pd.ph] || 'discard';
    const rivers = [], melds = [];
    for (let s = 0; s < N; s++) {
      rivers.push(arr(pd['r' + SUF[s]]).map(v => ({ t: v & 255, riichi: !!(v & 256), called: !!(v & 512), tsumogiri: !!(v & 1024) })));
      melds.push(decMelds(pd['m' + SUF[s]]));
    }
    const hands = [];
    for (let s = 0; s < N; s++) hands.push(s === me ? hand.slice() : new Array(clamp(hc[s] || 0, 0, 14)).fill(-1));
    const di = arr(pd.di), ui = arr(pd.ui), dead = new Array(14).fill(-1);
    di.forEach((x, i) => { dead[4 + 2 * i] = x; }); ui.forEach((x, i) => { dead[5 + 2 * i] = x; });
    const tn = m.tn >= 0 ? m.tn : 0;
    const cl = arr(pd.cl), lt = arr(pd.lt);
    const drawnMe = phase === 'discard' && tn === me && priv.d != null && priv.d >= 0 ? priv.d : -1;
    const st = { v: 1, cfg, scores: arr(pd.sc), dealer: pd.dl | 0, roundWind: pd.rw | 0, kyoku: pd.ky | 0, honba: pd.hb | 0, kyotaku: pd.kt | 0, roundNo: pd.rn | 0, over: !!pd.go, humans: [me], levels: [2, 2, 2, 2],
      hands, melds, rivers, riichi: arr(pd.ri), ippatsu: arr(pd.ip).map(x => !!x), furi: arr(pd.fp).map(x => !!x), tmpFuri: arr(pd.ft).map(x => !!x), safe: [[], [], [], []],
      phase, turn: tn, drawn: drawnMe >= 0 ? drawnMe : (phase === 'discard' && pd.dw && tn !== me ? 0 : -1), dead, doraN: pd.dn | 0, wp: 0, liveEnd: pd.rm | 0, kans: pd.kn | 0, noCalls: !!pd.ncl, discards: pd.ds | 0,
      rinshanDraw: !!pd.rin, kuikae: arr(pd.kk), wall: [], log: [], lastDiscard: lt.length ? { seat: lt[0], idx: lt[1] } : null,
      call: phase === 'call' && cl.length ? { tile: cl[0], from: cl[1], kind: ['discard', 'kakan', 'ankan'][cl[2]] || 'discard', opts: { [tn]: {} }, resp: {} } : null, result: null };
    if (phase === 'end') {
      const rt = pd.rt | 0, delta = arr(pd.dt);
      if (rt === 2) {
        const tenpai = arr(pd.tp).map(x => !!x), hands2 = [[], [], [], []], melds2 = [[], [], [], []];
        for (let s = 0; s < N; s++) if (tenpai[s]) { hands2[s] = arr(pd['t' + SUF[s]]); melds2[s] = decMelds(pd['n' + SUF[s]]); }
        st.result = { type: 'draw', why: WHY[pd.dwy | 0] || 'exhaust', tenpai, nagashi: arr(pd.ng), delta, hands: hands2, melds: melds2 };
      } else {
        const ws = [decWinner(pd, 'a'), decWinner(pd, 'b')].filter(Boolean);
        st.result = { type: rt === 0 ? 'tsumo' : 'ron', from: pd.rf >= 0 ? pd.rf : null, winners: ws, delta };
      }
    }
    return { st, legal: decLegal(priv.x && priv.x.c, hand), me, mode: cfg.mode };
  }

  const API = { host, view, toWire, fromWire, pubEvents, pub, encLegal, decLegal, arr, getCfg: null, YK, LIM, WHY };
  root.MahjongOnline = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
