// いろあわせカード工房：ゲームの中身（決まった結果の純粋なロジック。node でもブラウザでも動く）
// ---------------------------------------------------------------------------------
// 手札を先に使い切った人の勝ち。出せるのは、いまの「いろ」と同じ色、または場の札と同じ数字（同じ種類の特別札）、「染め直し」はいつでも。
// 札は104枚（st には番号だけ入る）：
//   0〜79   数字札：色 (id/20)|0（0 あか 1 あい 2 わかくさ 3 やまぶき）×数字 0〜9 が各2枚。数字 = (id%20)>>1。
//   80〜99  特別札：(id-80)/4 の整数部が種類（0 とりかえ・1 のぞき見・2 からまり・3 ふた針・4 まもり糸）、色は (id-80)%4。
//   100〜103 染め直し（どの色にもつく。出すとき色を決める）
// ルール（このゲームだけの決まり）：
//   ・数字の「0」を出すと、まわる向きが逆になる。
//   ・とりかえ：となり（前か次）の人と手札を丸ごと入れかえる。  のぞき見：好きな1人の手札を見る。
//   ・からまり：次の人が2枚引く（そのあとふつうに出せる）。  ふた針：もう一度、自分の番。
//   ・まもり糸：自分に「まもり」がつき、次の1回の「とりかえ・のぞき見・からまり」をはね返す。
//   ・出せる札がなければ1枚引く。引いた札が出せるなら出してよい（出さなくてもよい）。出せる札があるときは引けない。
//   ・「ラスト！」：手札が2枚以下のとき、自分の番に宣言できる。宣言しないで1枚まで減らすと、次の人に「つかまえた！」と言われて2枚引く。
//   ・10ラウンドマッチ：ラウンドの勝者は、ほかの人の手札の点（数字はそのまま、特別札10〜30）をもらう。合計がいちばん多い人の勝ち。
// st は JSON にできるものだけ。乱数は st.rs だけを使うので、同じ seed と同じ手なら、必ず同じ結果になる。
// opts：{ seed, n（2〜4）, level（1 よわい / 2 ふつう / 3 つよい）, levels（席ごとの強さ）, humans（人間の席。既定 [0]）, match（0 か ラウンド数）, first（最初の席。なければ乱数）, hand（配る枚数。既定7）}
(function (root) {
  'use strict';

  const NCARDS = 104;
  const KINDS = ['swap', 'peek', 'tangle', 'double', 'shield'];
  const VALUE = { swap: 20, peek: 10, tangle: 20, double: 20, shield: 15, dye: 30 };
  const INFO = [];
  for (let c = 0; c < NCARDS; c++) {
    if (c < 80) INFO.push({ id: c, kind: 'n', color: (c / 20) | 0, num: (c % 20) >> 1 });
    else if (c < 100) INFO.push({ id: c, kind: KINDS[((c - 80) / 4) | 0], color: (c - 80) % 4, num: -1 });
    else INFO.push({ id: c, kind: 'dye', color: -1, num: -1 });
  }
  const info = c => INFO[c];
  const cardPoints = c => { const i = INFO[c]; return i.kind === 'n' ? i.num : VALUE[i.kind]; };
  const handPoints = h => h.reduce((a, c) => a + cardPoints(c), 0);
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const sameJSON = (a, b) => JSON.stringify(a) === JSON.stringify(b);

  // ---------- 乱数（状態は st.rs の1つの整数） ----------
  function mix(seed) {
    let h = ((seed >>> 0) ^ 0x9E3779B9) >>> 0;
    h = Math.imul(h ^ (h >>> 16), 0x85ebca6b); h = Math.imul(h ^ (h >>> 13), 0xc2b2ae35);
    return (h ^ (h >>> 16)) >>> 0;
  }
  function rnd(st) {
    st.rs = (st.rs + 0x6D2B79F5) >>> 0;
    let t = st.rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const ri = (st, n) => Math.floor(rnd(st) * n);
  function shuffle(st, a) { for (let i = a.length - 1; i > 0; i--) { const j = ri(st, i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  const lvOf = (st, s) => (st.levels && st.levels[s]) || st.level;
  const isHuman = (st, s) => st.humans.indexOf(s) >= 0;

  // ---------- 札が出せるか ----------
  // color：いまの色、top：場の一番上の札の info
  function canPlay(c, color, top) {
    const i = INFO[c];
    if (i.kind === 'dye') return true;
    if (i.color === color) return true;
    if (i.kind === 'n') return top.kind === 'n' && top.num === i.num;
    return top.kind === i.kind;
  }
  const topInfo = st => INFO[st.disc[st.disc.length - 1]];
  const playable = (st, c) => canPlay(c, st.color, topInfo(st));
  const nextSeat = (st, s, dir) => (s + (dir === undefined ? st.dir : dir) + st.n) % st.n;

  // ---------- 配る ----------
  function deal(st, starter) {
    const d = []; for (let c = 0; c < NCARDS; c++) d.push(c);
    shuffle(st, d);
    st.hands = Array.from({ length: st.n }, () => []);
    for (let i = 0; i < st.handSize; i++) for (let s = 0; s < st.n; s++) st.hands[s].push(d.pop());
    // 最初の場の札は数字札
    let start = d.pop();
    while (INFO[start].kind !== 'n') { d.unshift(start); start = d.pop(); }
    st.draw = d; st.disc = [start]; st.color = INFO[start].color; st.dir = 1;
    st.turn = starter; st.phase = 'play'; st.drawn = -1;
    st.ward = new Array(st.n).fill(false); st.called = new Array(st.n).fill(false); st.uncalled = -1;
    st.lack = new Array(st.n).fill(0); st.seen = Array.from({ length: st.n }, () => ({}));
    st.afterDouble = false; st.winner = -1; st.roundGain = 0;
    const z = () => new Array(st.n).fill(0);
    const old = st.stat;
    st.stat = { plays: z(), swap: z(), peek: z(), tangle: z(), block: z(), dye: z(), double: z(), zero: z(), calls: z(), catches: z(), caught: z(), draws: z(), maxHand: st.hands.map(h => h.length), dblOut: z(), shield: z() };
    if (old) for (const k of Object.keys(old)) if (k !== 'maxHand') for (let s = 0; s < st.n; s++) st.stat[k][s] += old[k][s];   // マッチでは数をためる
    if (old) for (let s = 0; s < st.n; s++) st.stat.maxHand[s] = Math.max(st.stat.maxHand[s], old.maxHand[s]);
    return st;
  }

  function create(o) {
    o = o || {};
    const n = clamp(Math.round(o.n || 3), 2, 4);
    const st = { game: 'colorcards', v: 1, n, level: clamp(Math.round(o.level || 2), 1, 3), seed: (o.seed >>> 0) || 1, rs: mix(o.seed || 1),
      levels: Array.isArray(o.levels) ? o.levels.slice() : null, humans: Array.isArray(o.humans) ? o.humans.slice() : [0],
      over: false, step: 0, handSize: clamp(Math.round(o.hand || 7), 3, 10), match: o.match ? clamp(Math.round(o.match), 2, 30) : 0, round: 1,
      scores: new Array(n).fill(0), rwins: new Array(n).fill(0), gains: [] };
    st.first = o.first != null ? clamp(o.first | 0, 0, n - 1) : ri(st, n);
    deal(st, st.first);
    return st;
  }

  // ---------- 引く（山が空なら捨て札をまぜる） ----------
  function takeCard(st, ev) {
    if (!st.draw.length) {
      if (st.disc.length > 1) {
        const top = st.disc.pop(); const rest = st.disc; st.disc = [top];
        st.draw = shuffle(st, rest); ev.push({ t: 'reshuffle' });
      } else return -1;
    }
    return st.draw.pop();
  }
  function gain(st, seat, k, cause, ev) {
    const got = [];
    for (let i = 0; i < k; i++) { const c = takeCard(st, ev); if (c < 0) break; got.push(c); st.hands[seat].push(c); }
    if (got.length) ev.push({ t: 'draw', seat, cards: got, cause });
    if (st.hands[seat].length > 2) st.called[seat] = false;
    st.stat.maxHand[seat] = Math.max(st.stat.maxHand[seat], st.hands[seat].length);
    return got;
  }
  const others = (st, s) => { const a = []; for (let k = 1; k < st.n; k++) a.push((s + k) % st.n); return a; };
  function neighbours(st, s) { const a = [nextSeat(st, s, 1)]; const b = nextSeat(st, s, -1); if (b !== a[0]) a.push(b); return a; }

  // ---------- 手の一覧 ----------
  function playMoves(st, s, c) {
    const i = INFO[c], out = [];
    if (i.kind === 'dye') for (let k = 0; k < 4; k++) out.push({ t: 'play', c, color: k });
    else if (i.kind === 'swap') neighbours(st, s).forEach(w => out.push({ t: 'play', c, with: w }));
    else if (i.kind === 'peek') others(st, s).forEach(w => out.push({ t: 'play', c, target: w }));
    else out.push({ t: 'play', c });
    return out;
  }
  function legal(st) {
    if (st.over) return [];
    if (st.phase === 'roundover') return [{ t: 'next' }];
    const s = st.turn, h = st.hands[s], out = [];
    if (st.uncalled >= 0 && st.uncalled !== s) out.push({ t: 'catch' });
    if (!st.called[s] && h.length <= 2) out.push({ t: 'call' });
    if (st.phase === 'drawn') {
      playMoves(st, s, st.drawn).forEach(m => out.push(m));
      out.push({ t: 'keep' });
    } else {
      const seen = {};
      for (const c of h) if (playable(st, c) && !seen[c]) { seen[c] = 1; playMoves(st, s, c).forEach(m => out.push(m)); }
      if (!Object.keys(seen).length) out.push({ t: 'draw' });
    }
    return out;
  }
  const hasPlay = (st, s) => st.hands[s].some(c => playable(st, c));
  function who(st) { return st.over ? null : st.phase === 'roundover' ? { sys: { t: 'next' } } : { seat: st.turn }; }

  // ---------- 手を打つ ----------
  function endRound(st, winner, ev) {
    st.winner = winner;
    let g = 0; for (let s = 0; s < st.n; s++) if (s !== winner) g += handPoints(st.hands[s]);
    st.roundGain = g; st.scores[winner] += g; st.rwins[winner]++; st.gains.push({ w: winner, g });
    ev.push({ t: 'win', seat: winner, gain: g });
    if (st.match && st.round < st.match) st.phase = 'roundover'; else { st.over = true; st.phase = 'over'; }
  }
  function apply(st, mv) {
    const ev = [];
    if (st.over) return ev;
    const s = st.turn;
    if (++st.step > 6000) { // 保険：行き詰まったら、いちばん手札の少ない人の勝ち（テストで一度も起きないことを確かめる）
      let b = 0; for (let k = 1; k < st.n; k++) if (st.hands[k].length < st.hands[b].length) b = k;
      st.timeout = true; endRound(st, b, ev); st.phase = 'over'; st.over = true; return ev;
    }
    if (mv.t === 'next') {
      st.round++;
      deal(st, (st.first + st.round - 1) % st.n);
      ev.push({ t: 'round', n: st.round });
      return ev;
    }
    if (mv.t === 'call') {
      st.called[s] = true; st.stat.calls[s]++;
      if (st.uncalled === s) st.uncalled = -1;
      ev.push({ t: 'call', seat: s }); return ev;
    }
    if (mv.t === 'catch') {
      const w = st.uncalled; st.uncalled = -1; st.stat.catches[s]++; st.stat.caught[w]++;
      ev.push({ t: 'catch', by: s, seat: w });
      gain(st, w, 2, 'catch', ev); return ev;
    }
    st.uncalled = -1;
    const next = () => { st.turn = nextSeat(st, st.turn); st.phase = 'play'; st.drawn = -1; st.afterDouble = false; };
    if (mv.t === 'draw') {
      const got = gain(st, s, 1, 'draw', ev);
      st.stat.draws[s]++;
      st.lack[s] |= 1 << st.color;
      if (got.length && playable(st, got[0])) { st.phase = 'drawn'; st.drawn = got[0]; ev[ev.length - 1].playable = true; }
      else { ev.push({ t: 'pass', seat: s }); next(); }
      return ev;
    }
    if (mv.t === 'keep') { ev.push({ t: 'keep', seat: s }); next(); return ev; }
    // ---- 札を出す ----
    const c = mv.c, ci = INFO[c], h = st.hands[s];
    h.splice(h.indexOf(c), 1);
    st.disc.push(c);
    st.color = ci.kind === 'dye' ? mv.color : ci.color;
    st.lack[s] &= ~(1 << st.color);
    st.stat.plays[s]++;
    if (st.afterDouble && h.length === 0) st.stat.dblOut[s]++;
    ev.push({ t: 'play', seat: s, c, color: st.color, kind: ci.kind });
    const protect = (target, what) => { // まもり
      if (st.ward[target]) { st.ward[target] = false; st.stat.block[target]++; ev.push({ t: 'block', seat: target, by: s, what }); return true; }
      return false;
    };
    let again = false;
    if (ci.kind === 'dye') { st.stat.dye[s]++; ev.push({ t: 'dye', seat: s, color: st.color }); }
    else if (ci.kind === 'n' && ci.num === 0) { st.dir = -st.dir; st.stat.zero[s]++; ev.push({ t: 'rev', seat: s, dir: st.dir }); }
    else if (ci.kind === 'swap') {
      const w = mv.with;
      if (!protect(w, 'swap')) {
        const t = st.hands[s]; st.hands[s] = st.hands[w]; st.hands[w] = t;
        st.stat.swap[s]++; st.lack[s] = 0; st.lack[w] = 0; st.called[s] = false; st.called[w] = false;
        for (let a = 0; a < st.n; a++) { delete st.seen[a][s]; delete st.seen[a][w]; }
        st.stat.maxHand[s] = Math.max(st.stat.maxHand[s], st.hands[s].length); st.stat.maxHand[w] = Math.max(st.stat.maxHand[w], st.hands[w].length);
        ev.push({ t: 'swap', seat: s, with: w });
      }
    } else if (ci.kind === 'peek') {
      const w = mv.target;
      if (!protect(w, 'peek')) { st.seen[s][w] = st.hands[w].slice(); st.stat.peek[s]++; ev.push({ t: 'peek', seat: s, target: w, cards: st.hands[w].slice() }); }
    } else if (ci.kind === 'tangle') {
      const w = nextSeat(st, s);
      if (!protect(w, 'tangle')) {
        st.stat.tangle[s]++; st.lack[w] = 0;
        for (let a = 0; a < st.n; a++) delete st.seen[a][w];
        gain(st, w, 2, 'tangle', ev);
      }
    } else if (ci.kind === 'double') { again = true; st.stat.double[s]++; ev.push({ t: 'double', seat: s }); }
    else if (ci.kind === 'shield') { st.ward[s] = true; st.stat.shield[s]++; ev.push({ t: 'ward', seat: s }); }
    if (st.hands[s].length === 0) { endRound(st, s, ev); return ev; }
    if (st.hands[s].length === 1 && !st.called[s]) st.uncalled = s;
    if (again) { st.phase = 'play'; st.drawn = -1; st.afterDouble = true; } else next();
    return ev;
  }

  // =================================================================================
  // CPU：色を管理する（これから出せる札が多く残る色へ）、特別札は取っておく、手札の少ない相手に反応する
  // =================================================================================
  const TUNE = { dye: 7, tangle: 2.5, swap: 1.2, peek: 1.5, dbl: 3.5 };
  function countPlayable(cards, color, top) { let k = 0; for (const c of cards) if (canPlay(c, color, top)) k++; return k; }
  // 自分の手札だけで、続けて何枚出せるか（いまの色と場の札から、いちばん長い並べ方）
  function chainLen(cards, color, top) {
    const memo = new Map();
    const go = (mask, col, tk, tn) => {
      const key = mask * 64 + col * 16 + (tk === 'n' ? tn : 10 + ['swap', 'peek', 'tangle', 'double', 'shield', 'dye'].indexOf(tk));
      if (memo.has(key)) return memo.get(key);
      let best = 0;
      for (let i = 0; i < cards.length; i++) {
        if (mask & (1 << i)) continue;
        const c = cards[i], ci = INFO[c];
        if (!canPlay(c, col, { kind: tk, num: tn })) continue;
        if (ci.kind === 'dye') { for (let k = 0; k < 4; k++) { const v = 1 + go(mask | (1 << i), k, 'dye', -1); if (v > best) best = v; } }
        else { const v = 1 + go(mask | (1 << i), ci.color, ci.kind, ci.num); if (v > best) best = v; }
      }
      memo.set(key, best); return best;
    };
    return go(0, color, top.kind, top.num);
  }
  function evalPlay(st, s, mv, lv) {
    const c = mv.c, ci = INFO[c], hand = st.hands[s], n = st.n;
    const at = hand.indexOf(c);
    const rest = hand.filter((x, i) => i !== at);
    if (!rest.length) return 1000;
    const color = ci.kind === 'dye' ? mv.color : ci.color;
    const minOpp = Math.min.apply(null, others(st, s).map(o => st.hands[o].length));
    const near = minOpp <= 2, danger = minOpp <= 1;
    let sc = 0;
    const flex = countPlayable(rest, color, ci);   // これから出せる札の数
    sc += flex * 0.6 + (lv >= 2 && rest.length <= 12 ? chainLen(rest, color, ci) * 1.4 : 0);
    const cnt = [0, 0, 0, 0]; rest.forEach(x => { const k = INFO[x].color; if (k >= 0) cnt[k]++; });
    sc += cnt[color] * 0.5;
    sc += cardPoints(c) * (near ? 0.12 : 0.04);    // 失点の大きい札から先に
    let dir = st.dir; if (ci.kind === 'n' && ci.num === 0) dir = -dir;
    const nx = nextSeat(st, s, dir);
    const know = lv === 3 ? 1 : 0.5;
    if (nx !== s && ((st.lack[nx] >> color) & 1)) sc += (st.hands[nx].length <= 2 ? 4 : 1.5) * know;   // 次の人が持っていなさそうな色
    if (lv === 3 && nx !== s && st.seen[s][nx]) {
      const k = st.seen[s][nx].filter(x => st.hands[nx].indexOf(x) >= 0);
      if (k.length && k.length === st.hands[nx].length && !k.some(x => canPlay(x, color, ci))) sc += 5;
    }
    switch (ci.kind) {
      case 'dye':
        sc -= hand.length <= 3 || danger ? 2 : TUNE.dye;      // 染め直しは取っておく
        if (near) sc += 3;
        break;
      case 'n':
        if (ci.num === 0 && n > 2) {
          const curNext = st.hands[nextSeat(st, s)].length, newNext = st.hands[nextSeat(st, s, -st.dir)].length;
          sc += (curNext <= 2 ? 3 : 0) - (newNext <= 2 ? 3 : 0);
        }
        break;
      case 'tangle': {
        const w = nextSeat(st, s);
        if (st.ward[w]) sc -= 3; else sc += TUNE.tangle + (st.hands[w].length <= 2 ? 6 : st.hands[w].length <= 3 ? 2 : 0);
        break;
      }
      case 'swap': {
        const w = mv.with;
        if (st.ward[w]) { sc -= 4; break; }
        const d = rest.length - st.hands[w].length;
        sc += d * TUNE.swap; if (d <= 0) sc -= 3;
        if (st.hands[w].length <= 2 && d > 0) sc += 4;
        break;
      }
      case 'peek': {
        const w = mv.target;
        if (st.ward[w]) { sc -= 3; break; }
        sc += TUNE.peek + (st.hands[w].length <= 2 ? 1.5 : 0) + (w === nx ? 1 : 0);
        break;
      }
      case 'double': sc += flex > 0 ? TUNE.dbl + (rest.length <= 3 ? 3 : 0) : -1.5; break;
      case 'shield': sc += st.ward[s] ? -2 : 2; break;
    }
    return sc;
  }
  function cpu(st) {
    if (st.over) return null;
    if (st.phase === 'roundover') return { t: 'next' };
    const s = st.turn, lv = lvOf(st, s), moves = legal(st);
    if (moves.some(m => m.t === 'catch') && rnd(st) < [0, 0.25, 0.6, 0.95][lv]) return { t: 'catch' };
    if (moves.some(m => m.t === 'call') && rnd(st) >= [0, 0.35, 0.12, 0][lv]) return { t: 'call' };
    const plays = moves.filter(m => m.t === 'play');
    if (!plays.length) return moves.find(m => m.t === 'draw') || { t: 'keep' };
    const drawn = st.phase === 'drawn';
    if (lv === 1) {
      if (drawn && rnd(st) < 0.15) return { t: 'keep' };
      return plays[ri(st, plays.length)];
    }
    let best = null, bs = -1e9;
    for (const m of plays) { const v = evalPlay(st, s, m, lv) + rnd(st) * (lv === 3 ? 0.3 : 1.6); if (v > bs) { bs = v; best = m; } }
    if (drawn && bs < (lv === 3 ? -3 : -2)) return { t: 'keep' };
    return best;
  }
  // ヒント：「つよい」CPU がいまの席を打つなら、札を出す・引く・見送る手（宣言ややつかまえるは除く）
  function hint(st) {
    if (st.over || st.phase === 'roundover') return null;
    const c = JSON.parse(JSON.stringify(st)); c.levels = null; c.level = 3;
    const s = c.turn;
    for (let i = 0; i < 4; i++) { const m = cpu(c); if (!m) return null; if (m.t !== 'call' && m.t !== 'catch') return m; apply(c, m); if (c.turn !== s) return null; }
    return null;
  }

  // ---------- 結果 ----------
  function result(st) {
    const idx = []; for (let s = 0; s < st.n; s++) idx.push(s);
    let order;
    if (st.match) order = idx.sort((a, b) => st.scores[b] - st.scores[a] || st.rwins[b] - st.rwins[a] || a - b);
    else order = idx.sort((a, b) => (a === st.winner ? -1 : b === st.winner ? 1 : 0) || handPoints(st.hands[a]) - handPoints(st.hands[b]) || st.hands[a].length - st.hands[b].length || a - b);
    const rank = new Array(st.n); order.forEach((s, i) => { rank[s] = i + 1; });
    return { order, rank, winner: st.winner, points: st.hands.map(handPoints), scores: st.scores.slice(), gain: st.roundGain };
  }

  const API = { NCARDS, INFO, info, cardPoints, handPoints, canPlay, playable, topInfo, nextSeat, neighbours, others, mix, rnd, ri, shuffle, lvOf, isHuman, clamp, sameJSON,
    TUNE, create, deal, legal, apply, cpu, hint, who, done: st => st.over, result, hasPlay, evalPlay };
  root.ColorCardsEngine = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
