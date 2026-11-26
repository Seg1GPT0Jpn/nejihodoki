// ワードウルフ：オンライン対戦のアダプター（common/turnroom.js の KoboTurnRoom に渡すもの。node でも動く）
// ---------------------------------------------------------------------------------------------------------------------
// 3〜8人。ホスト権限：ホストのページが engine.js の状態（だれがウルフか・みんなのことば）をメモリに持ち、手をたしかめて進める。
// RTDB に出ていくのは「みんなが見てよい状態 pd」と、「その席だけが見る priv（自分のことばの番号）」だけ。
// 話し合いは「ヒントカード」だけ（自由な文字入力はなし）：自分のことばについての、あたりさわりのないヒント文を一覧から選ぶ。声は、ボイスチャットなどで。
// フェーズ（pd.ph）：h ヒント（順番に1人ずつ）→ v 投票（みんな同時。同数なら決選）→ g ウルフの逆転チャンス → e 結果
// 手（ワイヤー形式。database.rules.json の act の形に合わせる：t は a-z の2〜8字、c は -1〜255、k は -1〜7）：
//   { t:'hn', c: ヒントの番号（hintChoices の並びの何番目か） } | { t:'vt', c: 投票先の席, k: 2人目の投票先（ウルフ2人のとき。なければ -1） } | { t:'gs', c: 逆転の答えの番号 }
// pd の形：キーは a-z の1〜4字、値は数・短い文字列・数の配列（添字0〜99）。入れ子の配列はなし。
(function (root) {
  'use strict';
  const E = root.WordWolfEngine || (typeof require === 'function' ? require('./engine.js') : null);
  const arr = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);
  const isInt = (v, a, b) => typeof v === 'number' && v === Math.floor(v) && v >= a && v <= b;
  const CFG = { rounds: 2, wolves: 1, knows: false };
  function setCfg(o) {
    if (o && isInt(o.rounds, 1, 3)) CFG.rounds = o.rounds;
    if (o && isInt(o.wolves, 1, 2)) CFG.wolves = o.wolves;
    if (o && typeof o.knows === 'boolean') CFG.knows = o.knows;
    return Object.assign({}, CFG);
  }
  const HOW = ['caught', 'counter', 'partial', 'wrong', 'tie'];

  const wordCode = (S, w) => { const P = E.pairOf(S); return P.id * 2 + (P.b === w ? 1 : 0); };
  const wordByCode = (code, W) => { const p = E.pairsOf(W)[code >> 1]; return p ? ((code & 1) ? p.b : p.a) : null; };
  function optCodes(S) {
    const all = E.pairsOf(S.W);
    return E.guessOptions(S).map(o => { for (const p of all) { if (p.a.ja === o.ja) return p.id * 2; if (p.b.ja === o.ja) return p.id * 2 + 1; } return 0; });
  }

  // ---------------------------------------------------------------- ホスト側
  const turnSeat = st => {
    const S = st.S;
    if (st.ph === 'h') return st.hi < S.n * S.rounds ? S.order[st.hi % S.n] : -1;
    if (st.ph === 'v') { for (let i = 0; i < S.n; i++) if (!st.voted[i]) return i; return -1; }
    if (st.ph === 'g') return S.wolves.find(w => S.caught.indexOf(w) >= 0);
    return -1;
  };
  function startVote(st) { st.ph = 'v'; st.voted = st.S.players.map(() => false); st.ballots = st.S.players.map(() => []); }
  function afterTally(st, res) {
    const S = st.S;
    st.show = { w: res.next === 'revote' ? S.slots : S.revote ? S.slots : S.k, c: res.counts.slice(), b: S.lastVotes.map(v => v.slice()) };
    if (res.next === 'revote') { startVote(st); return; }
    if (res.next === 'caught' && E.allWolvesCaught(S)) { st.ph = 'g'; st.opts = E.guessOptions(S); st.optc = optCodes(S); return; }
    E.finish(S, false); st.ph = 'e';
  }
  function slotOf(S, seat, tag) { return E.hintChoices(S, seat).indexOf(tag); }
  const host = {
    create(o) {
      const n = o.n, seed = String(o.seed);
      const S = E.newGame({ seed, n, humans: n, lv: 0, rounds: CFG.rounds, wolves: CFG.wolves, wolfKnows: CFG.knows, skill: o.cp || 2, minutes: 0 });
      const hs = new Set(o.humans || []);
      S.players.forEach((p, i) => { p.cpu = !hs.has(i); p.persona = p.cpu ? i % E.PERSONAS.length : null; p.name = 'P' + (i + 1); });
      return { S, ph: 'h', hi: 0, voted: [], ballots: [], show: null, opts: null, optc: null, g: o.g || 1, step: 0 };
    },
    turn: st => (st.ph === 'e' ? -1 : turnSeat(st)),
    isOver: st => st.ph === 'e',
    apply(st, seat, a) {
      const S = st.S; if (!a || typeof a.t !== 'string') return null;
      if (a.t === 'hn' && st.ph === 'h') {
        if (turnSeat(st) !== seat || !isInt(a.c, 0, 255)) return null;
        const ch = E.hintChoices(S, seat), tag = ch[a.c]; if (tag == null) return null;
        S.hints.push({ p: seat, tag, r: Math.floor(st.hi / S.n) }); st.hi++;
        if (st.hi >= S.n * S.rounds) startVote(st);
        return { ev: [] };
      }
      if (a.t === 'vt' && st.ph === 'v') {
        if (st.voted[seat]) return null;
        const rule = E.ballotRule(S), t = [a.c];
        if (rule.slots >= 2) t.push(a.k);
        const seen = {};
        for (const x of t) { if (!isInt(x, 0, S.n - 1) || x === seat || seen[x] || (rule.cands && rule.cands.indexOf(x) < 0)) return null; seen[x] = 1; }
        st.ballots[seat] = t; st.voted[seat] = true;
        if (st.voted.every(Boolean)) { afterTally(st, E.applyVotes(S, st.ballots)); return { ev: [] }; }
        return { ev: [], soft: true };
      }
      if (a.t === 'gs' && st.ph === 'g') {
        if (turnSeat(st) !== seat || !isInt(a.c, 0, st.opts.length - 1)) return null;
        S.guess = a.c; E.finish(S, !!st.opts[a.c].ok); st.ph = 'e';
        return { ev: [] };
      }
      return null;
    },
    cpu(st, seat) {
      const S = st.S;
      if (st.ph === 'h') { const tag = E.cpuHintTag(S, seat, Math.floor(st.hi / S.n)); return { t: 'hn', c: Math.max(0, slotOf(S, seat, tag)) }; }
      if (st.ph === 'v') { const r = E.ballotRule(S), v = E.cpuVote(S, seat, r.cands, r.slots); return { t: 'vt', c: v[0], k: v.length > 1 ? v[1] : -1 }; }
      return { t: 'gs', c: E.cpuGuess(S) };
    },
    // 時間切れ：ヒントは「ざっくり」の1つ、投票は CPU の見立て、逆転は CPU の答え
    auto(st, seat) { return host.cpu(st, seat); },
    pub(st) {
      const S = st.S, pd = { ph: st.ph, n: S.n, rd: S.rounds, kk: S.k, kn: S.knows ? 1 : 0, hi: st.hi, hp: S.hints.map(h => h.p), ht: S.hints.map(h => h.tag) };
      if (st.ph === 'v') { const r = E.ballotRule(S); pd.vd = st.voted.map(x => (x ? 1 : 0)); pd.rv = S.revote; pd.sl = r.slots; pd.cd = r.cands ? r.cands.slice() : []; }
      if (st.show) { pd.lw = st.show.w; pd.lc = st.show.c; pd.lb = [].concat(...st.show.b.map(v => { const o = v.slice(0, 2); while (o.length < 2) o.push(-1); return o; })); }
      if (st.ph === 'g' || st.ph === 'e') { pd.cg = S.caught.slice(); pd.go = st.optc ? st.optc.slice() : []; }
      if (st.ph === 'e') {
        const o = S.outcome; pd.pi = S.pair; pd.mj = S.maj === 'b' ? 1 : 0; pd.wl = S.wolves.slice(); pd.pt = o.pts.slice(); pd.ow = HOW.indexOf(o.how); pd.wn = o.winner === 'wolf' ? 1 : 0;
        pd.gp = S.guess == null ? -1 : S.guess; pd.gk = o.guessOk ? 1 : 0;
      }
      return pd;
    },
    priv(st, seat) {
      const S = st.S, P = E.pairOf(S), side = E.sideOf(S, seat) === 'b' ? 1 : 0;
      return { x: { s: P.id * 4 + side * 2 + (E.knowsWolf(S, seat) ? 1 : 0) } };
    },
    result(st) {
      const pts = st.S.outcome.pts, r = pts.map(p => 1 + pts.filter(q => q > p).length);
      return { r, w: st.S.outcome.winner === 'wolf' ? st.S.wolves[0] : -1 };
    },
    // ホストがいなくなったとき：結果は出せない（みんな同順位）
    fallback(pd) { const n = Math.max(3, Math.min(8, (pd && pd.n) | 0 || 3)); return { r: new Array(n).fill(1), w: -1 }; },
    ser: st => JSON.stringify(st),
    de: s => { const st = JSON.parse(s); Object.defineProperty(st.S, 'W', { value: E.pairsOf ? (root.WordWolfWords || require('./words.js')) : null, enumerable: false, writable: true }); return st; },
  };

  // ---------------------------------------------------------------- 画面側
  const toWire = a => (a.t === 'hn' ? { t: 'hn', c: a.c } : a.t === 'vt' ? { t: 'vt', c: a.c, k: a.k == null ? -1 : a.k } : { t: 'gs', c: a.c });
  // model → 見かけの状態。自分のことば（priv.x.s）と、いま選べるヒント（slot の並び）もここで作る
  function view(m, W) {
    W = W || root.WordWolfWords || (typeof require === 'function' ? require('./words.js') : null);
    const pd = m.pd || {}, me = m.me >= 0 ? m.me : 0, n = pd.n | 0 || m.n, s = m.priv && m.priv.x ? m.priv.x.s | 0 : -1;
    const pairs = E.pairsOf(W), P = s >= 0 ? pairs[s >> 2] : null, side = (s >> 1) & 1, myWord = P ? (side ? P.b : P.a) : null, knowsWolf = s >= 0 && (s & 1) === 1;
    const hp = arr(pd.hp), ht = arr(pd.ht), hints = hp.map((p, i) => ({ p, tag: ht[i] }));
    const said = {}; hints.forEach(h => { if (h.p === me) said[h.tag] = 1; });
    const choices = myWord ? myWord.all.filter(t => !said[t]) : [];
    const lb = arr(pd.lb), lw = pd.lw | 0, ballots = []; for (let i = 0; i < n; i++) ballots.push([lb[i * 2], lb[i * 2 + 1]].slice(0, Math.max(1, lw)).filter(x => x >= 0));
    const o = { ph: pd.ph || 'h', n, me, rounds: pd.rd | 0 || 2, k: pd.kk | 0 || 1, knows: !!pd.kn, hi: pd.hi | 0, hints, choices, myWord, knowsWolf, turn: m.tn, voted: arr(pd.vd).map(x => !!x), slots: pd.sl | 0 || 1, cands: arr(pd.cd), revote: pd.rv | 0,
      lastCounts: arr(pd.lc), lastBallots: ballots, lastW: lw, caught: arr(pd.cg), guessOpts: arr(pd.go).map(c => wordByCode(c, W)), pair: P, fin: null };
    if (o.ph === 'e') {
      const pi = pairs[pd.pi | 0], maj = (pd.mj | 0) ? pi.b : pi.a, wolfW = (pd.mj | 0) ? pi.a : pi.b;
      o.fin = { pair: pi, maj, wolfW, wolves: arr(pd.wl), pts: arr(pd.pt), how: HOW[pd.ow | 0] || 'caught', winner: (pd.wn | 0) ? 'wolf' : 'village', guess: pd.gp | 0, guessOk: !!(pd.gk | 0) };
    }
    return o;
  }

  const API = { host, view, toWire, setCfg, cfg: CFG, wordByCode, arr, HOW };
  root.WordWolfOnline = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
