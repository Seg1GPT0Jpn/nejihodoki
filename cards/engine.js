// トランプ広場：ゲームの中身（決まった結果の純粋なロジック。node でもブラウザでも動く）
// ---------------------------------------------------------------------------------
// どのゲームも同じ形：
//   E.games[id] = { create(opts), legal(st), apply(st, move) → events[], cpu(st) → move, who(st) → { seat } | { sys: move } | null,
//                   done(st), result(st) → { order:[seat…1位から], rank:[seatごとの順位] } }
//   st は JSON にできるものだけ（そのまま保存して、続きから遊べる）。乱数は st.rs（mulberry32 の状態）だけを使うので、
//   同じ seed と同じ手なら、必ず同じ結果になる。
// カード：0〜51 = スート×13＋ランク（スート 0♠ 1♥ 2♦ 3♣、ランク 0=A … 9=10, 10=J, 11=Q, 12=K）、52 = ジョーカー。
// opts：{ seed, n（2〜4人）, level（1 よわい / 2 ふつう / 3 つよい）, humans（人間の席の配列。既定 [0]、CPU だけなら []）, …ゲームごとの設定 }
(function (root) {
  'use strict';

  const JOKER = 52;
  const suitOf = c => (c === JOKER ? -1 : (c / 13) | 0);
  const rankOf = c => (c === JOKER ? -1 : c % 13);
  const isRed = c => { const s = suitOf(c); return s === 1 || s === 2; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const last = a => a[a.length - 1];

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
  function pick(st, a) { return a[ri(st, a.length)]; }
  function deck(joker) { const d = []; for (let i = 0; i < 52; i++) d.push(i); if (joker) d.push(JOKER); return d; }

  function base(game, o) {
    o = o || {};
    const n = clamp(Math.round(o.n || 3), 2, 4);
    return { game, v: 1, n, level: clamp(Math.round(o.level || 2), 1, 3), seed: (o.seed >>> 0) || 1, rs: mix(o.seed || 1),
      levels: Array.isArray(o.levels) ? o.levels.slice() : null, humans: Array.isArray(o.humans) ? o.humans.slice() : [0], over: false, turn: 0, out: [], step: 0 };
  }
  const isHuman = (st, s) => st.humans.indexOf(s) >= 0;
  const lvOf = (st, s) => (st.levels && st.levels[s]) || st.level;   // 席ごとの強さ（テストで強さを混ぜるため。ふつうは全員 st.level）
  function nextActive(st, from, ok) { // from の次の、条件に合う席（時計まわり＝席の番号が増える向き）
    for (let k = 1; k <= st.n; k++) { const s = (from + k) % st.n; if (ok(s)) return s; }
    return -1;
  }
  function rankFromOrder(n, order) { const rank = new Array(n).fill(n); order.forEach((s, i) => { rank[s] = i + 1; }); return rank; }
  function sameJSON(a, b) { return JSON.stringify(a) === JSON.stringify(b); }

  // =================================================================================
  // ババ抜き（oldmaid）：53枚（ジョーカー1枚）。同じ数字を2枚そろえたら捨てる。となり（番号が次の席）から1枚引く。最後にジョーカーを持っていた人の負け。
  // =================================================================================
  const OM = {
    id: 'oldmaid',
    create(o, jiji) {
      const st = base(jiji ? 'jiji' : 'oldmaid', o);
      const d = shuffle(st, deck(!jiji));
      // ジジ抜き：ジョーカーなしの52枚から、ランダムに1枚を抜く。その数字が1枚だけ余る（ペアにならない）ので、それが「ジジ」
      if (jiji) st.removed = d.splice(ri(st, d.length), 1)[0];
      st.hands = Array.from({ length: st.n }, () => []);
      d.forEach((c, i) => st.hands[i % st.n].push(c));
      st.dealt = st.hands.map(h => h.slice());
      st.disc = [];
      for (let s = 0; s < st.n; s++) OM.pairOff(st, s);
      for (let s = 0; s < st.n; s++) if (!st.hands[s].length) st.out.push(s);
      st.turn = nextActive(st, st.n - 1, s => st.hands[s].length > 0);
      OM.check(st);
      return st;
    },
    pairOff(st, s) {
      const h = st.hands[s], pairs = [];
      for (let i = 0; i < h.length; i++) {
        const r = rankOf(h[i]); if (r < 0) continue;
        const j = h.findIndex((x, k) => k > i && rankOf(x) === r);
        if (j >= 0) { pairs.push([h[i], h[j]]); st.disc.push(h[i], h[j]); h.splice(j, 1); h.splice(i, 1); i--; }
      }
      return pairs;
    },
    active(st) { const a = []; for (let s = 0; s < st.n; s++) if (st.hands[s].length) a.push(s); return a; },
    target(st) { return nextActive(st, st.turn, s => st.hands[s].length > 0); },
    check(st) {
      const a = OM.active(st);
      if (a.length <= 1) { if (a.length === 1 && st.out.indexOf(a[0]) < 0) st.out.push(a[0]); st.over = true; st.loser = a.length ? a[0] : -1; }
    },
    legal(st) {
      if (st.over) return [];
      const t = OM.target(st); return st.hands[t].map((c, i) => ({ t: 'draw', i }));
    },
    // 手札を混ぜる（人間の「シャッフル」ボタンと CPU が使う。手番は進めない）
    shuffleHand(st, s) { shuffle(st, st.hands[s]); },
    apply(st, mv) {
      const me = st.turn, tg = OM.target(st), ev = [];
      const c = st.hands[tg].splice(mv.i, 1)[0];
      st.hands[me].push(c);
      ev.push({ t: 'draw', from: tg, to: me, c, i: mv.i });
      const r = rankOf(c);
      if (r >= 0) {
        const j = st.hands[me].findIndex(x => x !== c && rankOf(x) === r);
        if (j >= 0) {
          const o = st.hands[me][j];
          st.hands[me].splice(st.hands[me].indexOf(c), 1); st.hands[me].splice(st.hands[me].indexOf(o), 1);
          st.disc.push(o, c); ev.push({ t: 'pair', seat: me, cards: [o, c] });
        }
      }
      // CPU は、強さに応じて手札を混ぜる（よわい：混ぜない＝ジョーカーが最後に引いたところに残る）
      [tg, me].forEach(s => { if (!isHuman(st, s) && st.hands[s].length > 1 && (lvOf(st, s) === 3 || (lvOf(st, s) === 2 && rnd(st) < 0.6))) shuffle(st, st.hands[s]); });
      [tg, me].forEach(s => { if (!st.hands[s].length && st.out.indexOf(s) < 0) { st.out.push(s); ev.push({ t: 'out', seat: s, rank: st.out.length }); } });
      st.step++;
      OM.check(st);
      if (!st.over) st.turn = nextActive(st, me, s => st.hands[s].length > 0);
      else ev.push({ t: 'end' });
      return ev;
    },
    cpu(st) { const L = OM.legal(st); return L[ri(st, L.length)]; },
    who(st) { return st.over ? null : { seat: st.turn }; },
    done: st => st.over,
    result(st) { return { order: st.out.slice(), rank: rankFromOrder(st.n, st.out), loser: st.loser }; },
  };

  // ジジ抜き（jiji）：ババ抜きと同じ進めかた・同じ画面。ジョーカーなしの52枚から1枚を抜いて配る。最後まで残った1枚（ジジ）を持っていた人の負け。
  const JJ = Object.assign({}, OM, { id: 'jiji', create: o => OM.create(o, true) });

  // =================================================================================
  // 神経衰弱（concentration）：同じ数字で同じ色（赤と赤・黒と黒）の2枚が1組。そろえたらもう1回。多く取った人の勝ち。
  // opts.pairs：10 / 18 / 26 組
  // =================================================================================
  const CN = {
    id: 'concentration',
    create(o) {
      const st = base('concentration', o);
      const np = [10, 18, 26].indexOf(o.pairs) >= 0 ? o.pairs : 18;
      st.pairs = np;
      const all = [];
      for (let r = 0; r < 13; r++) for (let col = 0; col < 2; col++) all.push([r, col]);
      shuffle(st, all);
      const cells = [];
      all.slice(0, np).forEach(([r, col]) => {
        const suits = col ? [1, 2] : [0, 3];
        suits.forEach(s => cells.push(s * 13 + r));
      });
      st.cells = shuffle(st, cells);
      st.up = new Array(cells.length).fill(0); // 0 伏せている 1 いま表 2 取られた
      st.own = new Array(cells.length).fill(-1);
      st.first = -1; st.pend = null; st.match = false;
      st.score = new Array(st.n).fill(0);
      st.best = new Array(st.n).fill(0);        // 続けて取った最高の組数（実績用）
      st.streak = 0;
      st.known = Array.from({ length: st.n }, () => new Array(cells.length).fill(0));
      st.turn = 0;
      return st;
    },
    pid: (st, i) => rankOf(st.cells[i]) * 2 + (isRed(st.cells[i]) ? 1 : 0),
    legal(st) {
      if (st.over) return [];
      if (st.pend) return [{ t: 'resolve' }];
      const L = []; for (let i = 0; i < st.cells.length; i++) if (st.up[i] === 0) L.push({ t: 'flip', i });
      return L;
    },
    recall(st, s) { const l = lvOf(st, s); return l === 1 ? 0.5 : l === 2 ? 0.82 : 1; },
    forget(st, s) { const l = lvOf(st, s); return l === 1 ? 0.07 : l === 2 ? 0.02 : 0; },
    apply(st, mv) {
      const ev = [];
      if (mv.t === 'resolve') {
        const [a, b] = st.pend, seat = st.turn;
        if (st.match) {
          st.up[a] = st.up[b] = 2; st.own[a] = st.own[b] = seat; st.score[seat]++; st.streak++;
          st.best[seat] = Math.max(st.best[seat], st.streak);
          ev.push({ t: 'match', seat, cells: [a, b] });
          st.known.forEach(k => { k[a] = k[b] = 0; });
          if (st.score.reduce((x, y) => x + y, 0) >= st.pairs) { st.over = true; ev.push({ t: 'end' }); }
        } else {
          st.up[a] = st.up[b] = 0; st.streak = 0;
          ev.push({ t: 'miss', seat, cells: [a, b] });
          st.turn = (st.turn + 1) % st.n;
        }
        st.pend = null; st.first = -1; st.match = false;
        // CPU の記憶：ときどき忘れる
        st.known.forEach((k, s) => { const f = CN.forget(st, s); if (isHuman(st, s) || f <= 0) return; for (let i = 0; i < k.length; i++) if (k[i] && rnd(st) < f) k[i] = 0; });
        st.step++;
        return ev;
      }
      const i = mv.i;
      st.up[i] = 1;
      ev.push({ t: 'flip', seat: st.turn, i, c: st.cells[i] });
      st.known.forEach((k, s) => { const rc = isHuman(st, s) ? 1 : CN.recall(st, s); if (rc >= 1 || rnd(st) < rc) k[i] = 1; });   // 人間の席は「ヒント」用に全部おぼえている
      if (st.first < 0) st.first = i;
      else { st.pend = [st.first, i]; st.match = CN.pid(st, st.first) === CN.pid(st, i); }
      st.step++;
      return ev;
    },
    cpu(st) {
      if (st.pend) return { t: 'resolve' };
      const k = st.known[st.turn];
      const down = []; const unknown = [];
      for (let i = 0; i < st.cells.length; i++) if (st.up[i] === 0) { down.push(i); if (!k[i]) unknown.push(i); }
      const mate = (i) => { for (const j of down) if (j !== i && k[j] && CN.pid(st, j) === CN.pid(st, i)) return j; return -1; };
      if (st.first >= 0) {
        const j = mate(st.first);
        if (j >= 0) return { t: 'flip', i: j };
        const pool = unknown.filter(x => x !== st.first);
        if (pool.length) return { t: 'flip', i: pick(st, pool) };
        return { t: 'flip', i: pick(st, down.filter(x => x !== st.first)) };
      }
      for (const i of down) if (k[i]) { const j = mate(i); if (j >= 0) return { t: 'flip', i }; }
      if (unknown.length) return { t: 'flip', i: pick(st, unknown) };
      return { t: 'flip', i: pick(st, down) };
    },
    who(st) { return st.over ? null : st.pend ? { sys: { t: 'resolve' } } : { seat: st.turn }; },
    done: st => st.over,
    result(st) {
      const order = st.score.map((s, i) => i).sort((a, b) => st.score[b] - st.score[a] || a - b);
      const rank = new Array(st.n);
      order.forEach((s, i) => { rank[s] = i > 0 && st.score[s] === st.score[order[i - 1]] ? rank[order[i - 1]] : i + 1; });
      return { order, rank };
    },
  };

  // =================================================================================
  // 七並べ（sevens）：♦7 を持つ人から。7 はいつでも出せる。となりの数字を出していく。出せないときはパス（opts.passes 回まで。超えると手札を全部伏せて脱落）。
  // =================================================================================
  const SV = {
    id: 'sevens',
    create(o) {
      const st = base('sevens', o);
      st.limit = [0, 1, 2, 3, 5, 99].indexOf(o.passes) >= 0 ? o.passes : 3;
      const d = shuffle(st, deck(false));
      st.hands = Array.from({ length: st.n }, () => []);
      d.forEach((c, i) => st.hands[i % st.n].push(c));
      st.hands.forEach(h => h.sort((a, b) => a - b));
      st.table = [null, null, null, null];     // スートごとの { lo, hi }（出ている数字の範囲）
      st.pass = new Array(st.n).fill(0);
      st.dead = Array.from({ length: st.n }, () => []);
      st.busted = [];
      st.passTrail = [];                     // 最近のパス（席, 場の端）… つよいCPUが読む
      const start = st.hands.findIndex(h => h.indexOf(2 * 13 + 6) >= 0);
      st.start = start;
      SV.place(st, start, 2 * 13 + 6, []);
      st.turn = nextActive(st, start, s => SV.alive(st, s));
      SV.check(st);
      return st;
    },
    alive: (st, s) => st.hands[s].length > 0 && st.busted.indexOf(s) < 0,
    place(st, s, c, ev) {
      const h = st.hands[s]; h.splice(h.indexOf(c), 1);
      const su = suitOf(c), r = rankOf(c), t = st.table[su];
      if (!t) st.table[su] = { lo: r, hi: r }; else { if (r < t.lo) t.lo = r; if (r > t.hi) t.hi = r; }
      ev.push({ t: 'play', seat: s, c });
      if (!h.length) { st.out.push(s); ev.push({ t: 'out', seat: s, rank: st.out.length }); }
    },
    playable(st, c) {
      const t = st.table[suitOf(c)], r = rankOf(c);
      return t ? (r === t.lo - 1 || r === t.hi + 1) : r === 6;
    },
    legal(st) {
      if (st.over) return [];
      const L = st.hands[st.turn].filter(c => SV.playable(st, c)).map(c => ({ t: 'play', c }));
      return L.length ? L : [{ t: 'pass' }];
    },
    check(st) {
      const a = []; for (let s = 0; s < st.n; s++) if (SV.alive(st, s)) a.push(s);
      if (a.length <= 1) { st.over = true; st.rest = a[0] === undefined ? -1 : a[0]; }
    },
    apply(st, mv) {
      const s = st.turn, ev = [];
      if (mv.t === 'play') { SV.place(st, s, mv.c, ev); }
      else {
        st.pass[s]++; ev.push({ t: 'pass', seat: s, n: st.pass[s], limit: st.limit });
        st.passTrail.push([s, st.table.map(t => (t ? [t.lo, t.hi] : null))]); if (st.passTrail.length > 12) st.passTrail.shift();
        if (st.pass[s] > st.limit) { st.dead[s] = st.hands[s].splice(0); st.busted.push(s); ev.push({ t: 'bust', seat: s, cards: st.dead[s].slice() }); }
      }
      st.step++;
      SV.check(st);
      if (st.over) ev.push({ t: 'end' }); else st.turn = nextActive(st, s, x => SV.alive(st, x));
      return ev;
    },
    // 出せるカードの価値（大きいほど出したい）
    score(st, c, seat) {
      const h = st.hands[seat], su = suitOf(c), r = rankOf(c), has = x => h.indexOf(su * 13 + x) >= 0;
      const dirs = r === 6 ? [-1, 1] : [r > 6 ? 1 : -1];
      let v = 0;
      for (const d of dirs) {
        let k = r + d, chain = 0;
        while (k >= 0 && k <= 12 && has(k)) { chain++; k += d; }
        const nx = r + d;
        if (nx < 0 || nx > 12) v += 2;                 // 端のカード：出しても何も開かない
        else if (has(nx)) v += 2.5 + chain * 1.2;      // となりも自分が持っている：安全
        else v -= 3;                                   // となりを他の人に開けてしまう
      }
      if (r === 6) v -= 1;
      v += h.filter(x => suitOf(x) === su).length * 0.15;
      return v;
    },
    cpu(st) {
      const L = SV.legal(st);
      const seat = st.turn, lv = lvOf(st, seat);
      if (L.length === 1 || lv === 1) return L[ri(st, L.length)];
      if (lv === 3 && !SV.noRollout) return SV.cpuRollout(st, L);
      return SV.cpuHeur(st, L);
    },
    // つよいCPU：見えない手札を何通りか仮に決めて、各候補のあとをふつうのCPUで最後まで打ち、順位がいちばん良かった手を選ぶ
    cpuRollout(st, L) {
      const seat = st.turn, K = 10;
      const played = new Set();
      st.table.forEach((t, su) => { if (t) for (let r = t.lo; r <= t.hi; r++) played.add(su * 13 + r); });
      const unknown = deck(false).filter(c => st.hands[seat].indexOf(c) < 0 && !played.has(c));
      const sizes = st.hands.map((h, s) => (s === seat ? 0 : h.length));
      const deadN = st.dead.reduce((a, d) => a + d.length, 0);
      const tot = new Array(L.length).fill(0);
      const R = { rs: mix(st.rs ^ (st.step * 2654435761)) };
      for (let k = 0; k < K; k++) {
        const u = shuffle(R, unknown.slice());
        const hands = st.hands.map((h, s) => (s === seat ? h.slice() : u.splice(0, sizes[s]).sort((a, b) => a - b)));
        const dead = st.dead.map((d, s) => d.length ? u.splice(0, d.length) : []);
        void deadN;
        const rs0 = mix(st.rs + k * 977 + 13);
        for (let ci = 0; ci < L.length; ci++) {
          const sim = JSON.parse(JSON.stringify(st));
          sim.hands = hands.map(h => h.slice()); sim.dead = dead; sim.levels = null; sim.level = 2; sim.humans = []; sim.rs = rs0;
          let g = 0;
          SV.apply(sim, L[ci]);
          while (!sim.over && g++ < 200) SV.apply(sim, SV.cpuHeur(sim, SV.legal(sim)));
          tot[ci] += SV.result(sim).rank[seat];
        }
      }
      let bi = 0; for (let i = 1; i < L.length; i++) if (tot[i] < tot[bi] - 1e-9) bi = i;
      return L[bi];
    },
    cpuHeur(st, L) {
      const seat = st.turn, lv = lvOf(st, seat);
      if (L.length === 1) return L[0];
      let best = null, bv = -1e9;
      for (const m of L) {
        let v = SV.score(st, m.c, seat);
        if (lv === 3 && SV.noRollout) {
          // 出したあとに、自分がまた出せるカードがいくつ残るか（パスを減らす）
          const sv = st.table.map(t => (t ? { lo: t.lo, hi: t.hi } : null)); const su = suitOf(m.c), r = rankOf(m.c);
          const t = sv[su] ? sv[su] : (sv[su] = { lo: r, hi: r }); if (r < t.lo) t.lo = r; if (r > t.hi) t.hi = r;
          let mob = 0; for (const c of st.hands[seat]) { if (c === m.c) continue; const q = sv[suitOf(c)], rr = rankOf(c); if (q ? (rr === q.lo - 1 || rr === q.hi + 1) : rr === 6) mob++; }
          v += mob * 0.9;
          if (st.hands[seat].length <= 3) v += 2;
        }
        v += rnd(st) * 0.01;
        if (v > bv) { bv = v; best = m; }
      }
      return best;
    },
    who(st) { return st.over ? null : { seat: st.turn }; },
    done: st => st.over,
    result(st) {
      const order = st.out.slice();
      if (st.rest >= 0 && order.indexOf(st.rest) < 0) order.push(st.rest);
      for (let i = st.busted.length - 1; i >= 0; i--) order.push(st.busted[i]);
      for (let s = 0; s < st.n; s++) if (order.indexOf(s) < 0) order.push(s);
      return { order, rank: rankFromOrder(st.n, order) };
    },
  };

  // =================================================================================
  // 大富豪（daifugo）：3 が弱く 2 が強い。ジョーカーは最強（opts.joker）。場と同じ枚数で、強いカードを出す。出せない・出したくないときはパス。手札を早くなくした順に 大富豪→…→大貧民。
  // opts.rules：{ rev 革命（同じ数字4枚で強さが逆さま）, cut8 8切り, lock 縛り, jback 11バック, s3 スペ3返し, seq 階段 }
  // =================================================================================
  const DF = {
    id: 'daifugo',
    posOf: c => (c === JOKER ? 13 : (rankOf(c) + 11) % 13),   // 3=0 … K=10, A=11, 2=12, ジョーカー=13
    create(o) {
      const st = base('daifugo', o);
      const R = o.rules || {};
      st.rules = { rev: R.rev !== false, cut8: R.cut8 !== false, lock: !!R.lock, jback: !!R.jback, s3: !!R.s3, seq: !!R.seq, joker: R.joker !== false };
      const d = shuffle(st, deck(st.rules.joker));
      st.hands = Array.from({ length: st.n }, () => []);
      d.forEach((c, i) => st.hands[i % st.n].push(c));
      st.hands.forEach(h => h.sort((a, b) => DF.posOf(a) - DF.posOf(b) || a - b));
      st.field = null; st.owner = -1; st.passed = new Array(st.n).fill(false); st.gone = [];
      st.rev = false; st.jb = false; st.lock = 0;
      st.stat = { rev: new Array(st.n).fill(0), cut: new Array(st.n).fill(0), jback: new Array(st.n).fill(0) };
      // ♦3 を持つ人から（いなければ 0 番）
      const s3 = st.hands.findIndex(h => h.indexOf(2 * 13 + 2) >= 0);
      st.turn = s3 >= 0 ? s3 : 0;
      return st;
    },
    W: { 2: { T: 1.6, str: 2.2, dump: 0.5, noise: 0.6, cut: 0.5, minOpp: 0.8, pass: 0.35, passS: 0.9 }, 3: { T: 2.2, str: 2.6, dump: 0.35, noise: 0.05, cut: 0.9, minOpp: 2.2, pass: 0.8, passS: 0.8 } },
    inv: st => st.rev !== st.jb,
    eff(pos, inv) { return pos === 13 ? 13 : (inv ? 12 - pos : pos); },
    suitMask(cards) { let m = 0; for (const c of cards) if (c !== JOKER) m |= 1 << suitOf(c); return m; },
    // 手札から出せる組み合わせ（強さの比較はまだしない）
    combos(hand, rules) {
      const out = [], byPos = Array.from({ length: 13 }, () => []);
      let joker = false;
      for (const c of hand) { if (c === JOKER) joker = true; else byPos[DF.posOf(c)].push(c); }
      const subsets = (a, m) => { const res = []; const rec = (i, cur) => { if (cur.length === m) { res.push(cur.slice()); return; } for (let k = i; k < a.length; k++) { cur.push(a[k]); rec(k + 1, cur); cur.pop(); } }; rec(0, []); return res; };
      if (joker) out.push({ cards: [JOKER], kind: 'set', n: 1, pos: 13 });
      for (let p = 0; p < 13; p++) {
        const a = byPos[p];
        for (let m = 1; m <= a.length; m++) {
          for (const sub of subsets(a, m)) {
            out.push({ cards: sub, kind: 'set', n: m, pos: p });
            if (joker && m + 1 <= 4) out.push({ cards: sub.concat(JOKER), kind: 'set', n: m + 1, pos: p });
          }
        }
      }
      if (rules.seq) {
        for (let s = 0; s < 4; s++) {
          const have = new Array(13).fill(-1);
          for (const c of hand) if (c !== JOKER && suitOf(c) === s) have[DF.posOf(c)] = c;
          for (let lo = 0; lo <= 10; lo++) for (let hi = lo + 2; hi <= 12; hi++) {
            const cards = []; let miss = 0;
            for (let p = lo; p <= hi; p++) { if (have[p] >= 0) cards.push(have[p]); else miss++; }
            if (miss === 0) out.push({ cards, kind: 'seq', n: hi - lo + 1, pos: lo });
            else if (miss === 1 && joker) out.push({ cards: cards.concat(JOKER), kind: 'seq', n: hi - lo + 1, pos: lo });
          }
        }
      }
      return out;
    },
    // その組み合わせは、いまの場に出せるか
    ok(st, cb) {
      const f = st.field, inv = DF.inv(st);
      if (!f) return true;
      if (f.n === 1 && f.pos === 13) return st.rules.s3 && cb.n === 1 && cb.cards[0] === 2;   // ジョーカー1枚には ♠3 だけ
      if (cb.n !== f.n || cb.kind !== f.kind) return false;
      if (st.lock) { const m = DF.suitMask(cb.cards); if ((m & ~st.lock) !== 0) return false; }
      return DF.eff(cb.pos, inv) > DF.eff(f.pos, inv);
    },
    legal(st) {
      if (st.over) return [];
      const hand = st.hands[st.turn];
      const L = DF.combos(hand, st.rules).filter(cb => DF.ok(st, cb)).map(cb => ({ t: 'play', cards: cb.cards.slice().sort((a, b) => a - b), kind: cb.kind, pos: cb.pos, n: cb.n }));
      if (st.field) L.push({ t: 'pass' });
      return L;
    },
    // 選んだカードから出し方を決める（階段のジョーカーは、いちばん強くなる読みかたに）
    fromCards(st, cards) {
      const key = cards.slice().sort((a, b) => a - b).join(',');
      const c = DF.legal(st).filter(m => m.t === 'play' && m.cards.join(',') === key);
      if (!c.length) return null;
      const inv = DF.inv(st);
      c.sort((a, b) => DF.eff(b.pos, inv) - DF.eff(a.pos, inv));
      return c[0];
    },
    clearField(st) { st.field = null; st.lock = 0; st.jb = false; st.passed.fill(false); st.owner = -1; },
    activeCount(st) { let k = 0; for (let s = 0; s < st.n; s++) if (st.hands[s].length) k++; return k; },
    apply(st, mv) {
      const seat = st.turn, ev = [], hand = st.hands[seat];
      if (mv.t === 'pass') {
        st.passed[seat] = true; ev.push({ t: 'pass', seat });
        const all = [];
        for (let s = 0; s < st.n; s++) if (st.hands[s].length && s !== st.owner) all.push(s);
        if (all.every(s => st.passed[s])) {
          const lead = st.hands[st.owner] && st.hands[st.owner].length ? st.owner : nextActive(st, st.owner, s => st.hands[s].length > 0);
          DF.clearField(st); st.turn = lead; ev.push({ t: 'clear', why: 'pass', lead });
        } else st.turn = nextActive(st, seat, s => st.hands[s].length > 0);
        st.step++;
        return ev;
      }
      const prev = st.field;
      for (const c of mv.cards) { hand.splice(hand.indexOf(c), 1); st.gone.push(c); }
      const mask = DF.suitMask(mv.cards), hasJ = mv.cards.indexOf(JOKER) >= 0;
      // 縛り：続けて同じスートで出されたら、そのスートだけになる
      if (st.rules.lock && prev && !st.lock && !hasJ && !prev.joker && prev.mask === mask && mask) { st.lock = mask; ev.push({ t: 'lock', mask }); }
      st.field = { cards: mv.cards.slice(), n: mv.n, kind: mv.kind, pos: mv.pos, mask, joker: hasJ, seat };
      st.owner = seat; st.passed.fill(false);
      ev.push({ t: 'play', seat, cards: mv.cards.slice(), kind: mv.kind, n: mv.n });
      let clear = false;
      if (st.rules.rev && mv.kind === 'set' && mv.n >= 4) { st.rev = !st.rev; st.stat.rev[seat]++; ev.push({ t: 'rev', on: st.rev }); }
      if (st.rules.jback && mv.cards.some(c => c !== JOKER && DF.posOf(c) === 8)) { st.jb = !st.jb; st.stat.jback[seat]++; ev.push({ t: 'jback', on: st.jb }); }
      const posSet = mv.kind === 'seq' ? mv.cards.map(c => DF.posOf(c)) : null;
      const has8 = mv.kind === 'set' ? (mv.pos === 5 && !(mv.n === 1 && mv.pos === 13)) : (mv.pos <= 5 && mv.pos + mv.n - 1 >= 5);
      if (st.rules.cut8 && has8) { clear = true; st.stat.cut[seat]++; ev.push({ t: 'cut' }); }
      if (st.rules.s3 && prev && prev.n === 1 && prev.pos === 13 && mv.n === 1 && mv.cards[0] === 2) { clear = true; ev.push({ t: 's3' }); }
      void posSet;
      if (!hand.length) { st.out.push(seat); ev.push({ t: 'out', seat, rank: st.out.length }); }
      st.step++;
      if (DF.activeCount(st) <= 1) {
        for (let s = 0; s < st.n; s++) if (st.hands[s].length && st.out.indexOf(s) < 0) st.out.push(s);
        st.over = true; ev.push({ t: 'end' }); return ev;
      }
      if (clear) {
        const lead = hand.length ? seat : nextActive(st, seat, s => st.hands[s].length > 0);
        DF.clearField(st); st.turn = lead; ev.push({ t: 'clear', why: 'cut', lead });
      } else st.turn = nextActive(st, seat, s => st.hands[s].length > 0);
      return ev;
    },
    // --- CPU ---
    // 手札を出し切るまでの手数の見積もり（小さいほどよい）
    turns(hand, inv, rules) {
      const cnt = new Array(14).fill(0);
      for (const c of hand) cnt[DF.posOf(c)]++;
      let groups = 0, strong = 0, eights = cnt[5] ? 1 : 0;
      for (let p = 0; p < 13; p++) if (cnt[p]) { groups++; if (DF.eff(p, inv) >= 11) strong += cnt[p] >= 3 ? 1 : cnt[p]; }
      if (cnt[13]) { strong++; }
      if (hand.length && rules && rules.cut8) strong += eights * 0.6;
      return Math.max(hand.length ? 0.6 : 0, groups + (cnt[13] ? 1 : 0) - 0.55 * strong);
    },
    cpu(st) {
      const L = DF.legal(st);
      if (L.length === 1) return L[0];
      if (lvOf(st, st.turn) === 3 && st.n > 2 && !DF.noRollout) return DF.cpuRollout(st, L);
      return DF.cpuHeur(st, L);
    },
    cpuHeur(st, L) {
      const plays = L.filter(m => m.t === 'play');
      if (!plays.length) return { t: 'pass' };
      const seat = st.turn, lv = lvOf(st, seat), hand = st.hands[seat], inv = DF.inv(st);
      if (lv === 1) { if (st.field && rnd(st) < 0.2) return { t: 'pass' }; return plays[ri(st, plays.length)]; }
      const minOpp = Math.min.apply(null, st.hands.map((h, s) => (s !== seat && h.length ? h.length : 99)));
      const W = DF.W[lv];
      let best = null, bv = -1e9;
      for (const m of plays) {
        const after = hand.filter(c => m.cards.indexOf(c) < 0);
        if (!after.length) return m;
        let inv2 = inv;
        const revNow = st.rules.rev && m.kind === 'set' && m.n >= 4;
        if (revNow) inv2 = !inv;
        const jbNow = st.rules.jback && m.cards.some(c => c !== JOKER && DF.posOf(c) === 8);
        if (jbNow) inv2 = !inv2;
        const T = DF.turns(after, inv2, st.rules);
        const s = DF.eff(m.pos, inv) / 13;
        let v = -W.T * T - W.str * s * (1 + (m.cards.indexOf(JOKER) >= 0 ? 0.6 : 0)) + W.dump * m.n;
        const cut = st.rules.cut8 && ((m.kind === 'set' && m.pos === 5) || (m.kind === 'seq' && m.pos <= 5 && m.pos + m.n - 1 >= 5));
        if (cut) v += W.cut;
        if (revNow) { const wAfter = DF.turns(after, !inv, st.rules), wNow = DF.turns(after, inv, st.rules); v += (wNow - wAfter) * 1.8 - 0.2; }
        // 相手が上がりそうなとき：弱いカードで出し渋らない（リードを取りに行く）
        if (minOpp <= 2 && st.field) v += s * W.minOpp;
        // 出す順：弱いカードから（手札の中の高いカードは取っておく）
        v += rnd(st) * W.noise;
        if (v > bv) { bv = v; best = m; }
      }
      if (st.field) {
        // パス：出すのに強いカードが要り、相手に余裕があるなら見送る
        const sBest = DF.eff(best.pos, inv) / 13;
        const spend = sBest >= W.passS && minOpp > 3 && hand.length > best.n + 1 && !(best.cards.length && st.field.n === 1 && st.field.pos === 13);
        if (spend && rnd(st) < W.pass) return { t: 'pass' };
      }
      return best;
    },
    // つよいCPU：見えない手札を何通りか仮に決めて、上位の候補の手をふつうのCPUで最後まで打ち、順位がいちばん良かった手を選ぶ
    cpuRollout(st, L) {
      const seat = st.turn, K = 8, TOP = 7;
      const heur = DF.cpuHeur(st, L);
      // 候補：ヒューリスティックの最善手＋手札から出せるものを弱い順に少し＋パス
      const plays = L.filter(m => m.t === 'play');
      const inv = DF.inv(st);
      const cand = [heur];
      plays.slice().sort((a, b) => DF.eff(a.pos, inv) - DF.eff(b.pos, inv) || b.n - a.n).forEach(m => { if (cand.length < TOP && !cand.some(x => sameJSON(x, m))) cand.push(m); });
      if (L.some(m => m.t === 'pass') && !cand.some(m => m.t === 'pass')) cand.push({ t: 'pass' });
      if (cand.length === 1) return cand[0];
      const unknown = deck(st.rules.joker).filter(c => st.hands[seat].indexOf(c) < 0 && st.gone.indexOf(c) < 0);
      const sizes = st.hands.map((h, s) => (s === seat ? 0 : h.length));
      const tot = new Array(cand.length).fill(0);
      const R = { rs: mix(st.rs ^ (st.step * 2654435761)) };
      for (let k = 0; k < K; k++) {
        const u = shuffle(R, unknown.slice());
        const hands = st.hands.map((h, s) => { if (s === seat) return h.slice(); const a = u.splice(0, sizes[s]); a.sort((x, y) => DF.posOf(x) - DF.posOf(y) || x - y); return a; });
        const rs0 = mix(st.rs + k * 977 + 13);
        for (let ci = 0; ci < cand.length; ci++) {
          const sim = JSON.parse(JSON.stringify(st));
          sim.hands = hands.map(h => h.slice()); sim.levels = null; sim.level = 2; sim.humans = []; sim.rs = rs0;
          let g = 0;
          DF.apply(sim, cand[ci]);
          while (!sim.over && sim.out.indexOf(seat) < 0 && g++ < 400) DF.apply(sim, DF.cpuHeur(sim, DF.legal(sim)));
          const r = sim.out.indexOf(seat);
          tot[ci] += (r < 0 ? sim.n : r + 1);
        }
      }
      let bi = 0; for (let i = 1; i < cand.length; i++) if (tot[i] < tot[bi] - 1e-9) bi = i;
      return cand[bi];
    },
    who(st) { return st.over ? null : { seat: st.turn }; },
    done: st => st.over,
    result(st) { return { order: st.out.slice(), rank: rankFromOrder(st.n, st.out) }; },
    title(n, i) { // 順位の呼び名
      const T = { 2: ['大富豪', '大貧民'], 3: ['大富豪', '平民', '大貧民'], 4: ['大富豪', '富豪', '貧民', '大貧民'] };
      return T[n][i];
    },
  };


  // =================================================================================
  // ポーカー（poker）：5枚ドロー。1人ずつ手札5枚、ベット → 交換（0〜5枚）→ ベット → 勝負。固定額のリミット（1回目 20、2回目 40、レイズは1回のベットで3回まで）。
  // opts.stack 最初のチップ（既定 1000）、opts.hands 何ハンドで終わるか（既定 10）。チップがなくなったら脱落。終わったときにチップが多い順。
  // =================================================================================
  const HAND_NAMES = ['ハイカード', 'ワンペア', 'ツーペア', 'スリーカード', 'ストレート', 'フラッシュ', 'フルハウス', 'フォーカード', 'ストレートフラッシュ', 'ロイヤルフラッシュ'];
  const prk = c => (rankOf(c) + 12) % 13 + 2;   // A=14 … 2=2
  // 5枚の役：{ cat 0〜9, val 比べる値 }
  function eval5(cards) {
    const rk = cards.map(prk).sort((a, b) => b - a);
    const flush = cards.every(c => suitOf(c) === suitOf(cards[0]));
    const cnt = {}; rk.forEach(r => { cnt[r] = (cnt[r] || 0) + 1; });
    const groups = Object.keys(cnt).map(Number).sort((a, b) => cnt[b] - cnt[a] || b - a);
    let straight = 0;
    if (groups.length === 5) { if (rk[0] - rk[4] === 4) straight = rk[0]; else if (rk[0] === 14 && rk[1] === 5 && rk[4] === 2) straight = 5; }
    const key = ks => ks.reduce((a, r) => a * 15 + r, 0);
    let cat, ks;
    if (straight && flush) { cat = straight === 14 ? 9 : 8; ks = [straight]; }
    else if (cnt[groups[0]] === 4) { cat = 7; ks = [groups[0], groups[1]]; }
    else if (cnt[groups[0]] === 3 && cnt[groups[1]] === 2) { cat = 6; ks = [groups[0], groups[1]]; }
    else if (flush) { cat = 5; ks = rk; }
    else if (straight) { cat = 4; ks = [straight]; }
    else if (cnt[groups[0]] === 3) { cat = 3; ks = groups; }
    else if (cnt[groups[0]] === 2 && cnt[groups[1]] === 2) { cat = 2; ks = groups; }
    else if (cnt[groups[0]] === 2) { cat = 1; ks = groups; }
    else { cat = 0; ks = rk; }
    return { cat, val: cat * 1e7 + key(ks), name: HAND_NAMES[cat] };
  }
  const PK = {
    id: 'poker', ANTE: 10, BET: [20, 40], CAP: 3, HAND_NAMES, eval5,
    create(o) {
      const st = base('poker', o);
      st.stack0 = [500, 1000, 2000].indexOf(o.stack) >= 0 ? o.stack : 1000;
      st.hands_n = [5, 10, 20].indexOf(o.hands) >= 0 ? o.hands : 10;
      st.stacks = new Array(st.n).fill(st.stack0);
      st.bust = [];                                 // 脱落した順
      st.handNo = 0; st.dealer = st.n - 1;
      st.stat = { won: new Array(st.n).fill(0), best: new Array(st.n).fill(-1), wbest: new Array(st.n).fill(-1), bigPot: new Array(st.n).fill(0) };
      PK.startHand(st);
      return st;
    },
    startHand(st) {
      st.handNo++;
      st.dealer = nextActive(st, st.dealer, s => st.stacks[s] > 0);
      st.deck = shuffle(st, deck(false));
      st.hands = Array.from({ length: st.n }, () => []);
      st.dealt = st.stacks.map(c => c > 0);
      st.folded = st.stacks.map(c => c <= 0);
      st.allin = new Array(st.n).fill(false);
      st.tot = new Array(st.n).fill(0);
      st.pot = 0; st.drew = new Array(st.n).fill(-1);
      for (let r = 0; r < 5; r++) for (let s = 0; s < st.n; s++) if (st.dealt[s]) st.hands[s].push(st.deck.pop());
      st.hands.forEach((h, s) => { st.hands[s] = PK.sortHand(h); });
      for (let s = 0; s < st.n; s++) if (st.dealt[s]) PK.pay(st, s, PK.ANTE);
      st.phase = 'bet1'; st.last = null;
      PK.startRound(st);
    },
    sortHand: h => h.slice().sort((a, b) => prk(b) - prk(a) || a - b),
    pay(st, s, amt) { const a = Math.min(amt, st.stacks[s]); st.stacks[s] -= a; st.tot[s] += a; st.pot += a; if (st.stacks[s] === 0) st.allin[s] = true; return a; },
    live(st) { const a = []; for (let s = 0; s < st.n; s++) if (!st.folded[s]) a.push(s); return a; },
    startRound(st) {
      st.bet = 0; st.cont = new Array(st.n).fill(0); st.acted = new Array(st.n).fill(false); st.raises = 0;
      const live = PK.live(st), can = live.filter(s => !st.allin[s]);
      if (live.length < 2) { PK.finish(st, live); return; }
      if (can.length < 2) { PK.afterRound(st); return; }
      st.turn = nextActive(st, st.dealer, s => !st.folded[s] && !st.allin[s]);
    },
    afterRound(st) {
      if (st.phase === 'bet1') {
        st.phase = 'draw';
        st.turn = nextActive(st, st.dealer, s => !st.folded[s]);
      } else PK.showdown(st);
    },
    toCall: (st, s) => st.bet - st.cont[s],
    size: st => PK.BET[st.phase === 'bet2' ? 1 : 0],
    legal(st) {
      if (st.over) return [];
      const s = st.turn, L = [];
      if (st.phase === 'result') return [{ t: 'next' }];
      if (st.phase === 'draw') {
        const h = st.hands[s];
        for (let m = 0; m < 32; m++) { const d = []; for (let i = 0; i < 5; i++) if (m & (1 << i)) d.push(h[i]); L.push({ t: 'draw', d }); }
        return L;
      }
      const tc = PK.toCall(st, s);
      if (tc > 0) { L.push({ t: 'act', a: 'fold' }); L.push({ t: 'act', a: 'call' }); }
      else L.push({ t: 'act', a: 'check' });
      if (st.raises < PK.CAP && st.stacks[s] > tc) L.push({ t: 'act', a: tc > 0 ? 'raise' : 'bet' });
      return L;
    },
    apply(st, mv) {
      const ev = [], s = st.turn;
      st.step++;
      if (mv.t === 'next') { PK.next(st); ev.push({ t: 'next' }); return ev; }
      if (mv.t === 'draw') {
        const h = st.hands[s];
        mv.d.forEach(c => { const i = h.indexOf(c); h[i] = st.deck.pop(); });
        st.hands[s] = PK.sortHand(h);
        st.drew[s] = mv.d.length;
        ev.push({ t: 'draw', seat: s, n: mv.d.length, out: mv.d.slice() });
        const nx = nextActive(st, s, x => !st.folded[x] && st.drew[x] < 0);
        if (nx < 0) {
          st.phase = 'bet2';
          st.bet = 0; st.cont = new Array(st.n).fill(0); st.acted = new Array(st.n).fill(false); st.raises = 0;
          const can = PK.live(st).filter(x => !st.allin[x]);
          if (can.length < 2) PK.showdown(st); else st.turn = nextActive(st, st.dealer, x => !st.folded[x] && !st.allin[x]);
        } else st.turn = nx;
        if (st.phase === 'result') ev.push({ t: 'showdown' });
        return ev;
      }
      const a = mv.a, size = PK.size(st);
      if (a === 'fold') { st.folded[s] = true; ev.push({ t: 'fold', seat: s }); }
      else if (a === 'check') { ev.push({ t: 'check', seat: s }); }
      else if (a === 'call') { const x = PK.pay(st, s, PK.toCall(st, s)); st.cont[s] += x; ev.push({ t: 'call', seat: s, amt: x }); }
      else { // bet / raise
        const tc = PK.toCall(st, s), x = PK.pay(st, s, tc + size);
        st.cont[s] += x;
        if (st.cont[s] > st.bet) { st.bet = st.cont[s]; st.acted.fill(false); }
        st.raises++;
        ev.push({ t: a, seat: s, amt: x });
      }
      st.acted[s] = true;
      const live = PK.live(st);
      if (live.length === 1) { PK.finish(st, live); ev.push({ t: 'showdown' }); return ev; }
      const need = live.filter(x => !st.allin[x] && (!st.acted[x] || st.cont[x] < st.bet));
      if (!need.length) { PK.afterRound(st); if (st.phase === 'result') ev.push({ t: 'showdown' }); }
      else st.turn = nextActive(st, s, x => need.indexOf(x) >= 0);
      return ev;
    },
    // 勝負：サイドポットを順に分ける
    showdown(st) {
      const live = PK.live(st), ev = {};
      live.forEach(s => { ev[s] = eval5(st.hands[s]); });
      PK.finish(st, live, ev);
    },
    finish(st, live, ev) {
      const n = st.n, tot = st.tot.slice(), pots = [], start = st.stacks.slice();
      const order = []; for (let k = 1; k <= n; k++) order.push((st.dealer + k) % n);
      const unc = live.length === 1;
      if (unc) { const s = live[0], amt = st.pot; st.stacks[s] += amt; pots.push({ amt, winners: [s] }); }
      else {
        const lv = [...new Set(live.map(s => tot[s]))].sort((a, b) => a - b);
        let prev = 0;
        for (const L of lv) {
          let amt = 0; for (let s = 0; s < n; s++) amt += Math.max(0, Math.min(tot[s], L) - prev);
          const elig = live.filter(s => tot[s] >= L);
          const bestV = Math.max.apply(null, elig.map(s => ev[s].val));
          const w = elig.filter(s => ev[s].val === bestV);
          const share = Math.floor(amt / w.length); let rem = amt - share * w.length;
          const w2 = order.filter(s => w.indexOf(s) >= 0);
          w2.forEach(s => { st.stacks[s] += share + (rem > 0 ? 1 : 0); if (rem > 0) rem--; });
          pots.push({ amt, winners: w2 });
          prev = L;
        }
        const top = lv[lv.length - 1];   // 降りた人が、勝負する人より多く出していた分は返す
        for (let s = 0; s < n; s++) if (tot[s] > top && st.folded[s]) { st.stacks[s] += tot[s] - top; pots.push({ amt: tot[s] - top, winners: [s], refund: true }); }
      }
      st.pot = 0;
      const deltas = st.stacks.map((c, s) => c - start[s]);
      const winners = [...new Set(pots.filter(p => !p.refund).flatMap(p => p.winners))];
      winners.forEach(s => { st.stat.won[s]++; });
      if (!unc) live.forEach(s => { st.stat.best[s] = Math.max(st.stat.best[s], ev[s].cat); });
      if (!unc) winners.forEach(s => { if (ev[s]) st.stat.wbest[s] = Math.max(st.stat.wbest[s], ev[s].cat); });
      const big = pots.reduce((a, p) => a + (p.refund ? 0 : p.amt), 0);
      winners.forEach(s => { st.stat.bigPot[s] = Math.max(st.stat.bigPot[s], big); });
      st.last = { pots, winners, unc, deltas, names: unc ? {} : Object.fromEntries(live.map(s => [s, ev[s].name])), cats: unc ? {} : Object.fromEntries(live.map(s => [s, ev[s].cat])), revealed: unc ? [] : live.slice() };
      st.phase = 'result';
      st.turn = st.humans.length ? st.humans[0] : 0;
    },
    next(st) {
      for (let s = 0; s < st.n; s++) if (st.stacks[s] <= 0 && st.bust.indexOf(s) < 0 && st.dealt[s]) st.bust.push(s);
      const alive = []; for (let s = 0; s < st.n; s++) if (st.stacks[s] > 0) alive.push(s);
      const humanOut = st.humans.length && st.humans.every(h => st.stacks[h] <= 0);
      if (st.handNo >= st.hands_n || alive.length <= 1 || humanOut) { st.over = true; st.phase = 'done'; return; }
      PK.startHand(st);
    },
    // ----- CPU -----
    // 手の強さ 0〜1（交換前は伸びしろも見る）
    strength(hand, phase) {
      const e = eval5(hand), rk = hand.map(prk).sort((a, b) => b - a);
      const cnt = {}; rk.forEach(r => { cnt[r] = (cnt[r] || 0) + 1; });
      const pairRank = Number(Object.keys(cnt).filter(r => cnt[r] === 2).sort((a, b) => b - a)[0] || 0);
      if (e.cat === 0) {
        const d = PK.draws(hand);
        if (phase === 'bet1') return d.flush4 ? 0.42 : d.str4 ? 0.34 : 0.12 + rk[0] / 14 * 0.1;
        return 0.08 + rk[0] / 14 * 0.08;
      }
      if (e.cat === 1) return (phase === 'bet1' ? 0.34 : 0.3) + pairRank / 14 * 0.2;
      if (e.cat === 2) return 0.62 + rk[0] / 14 * 0.04;
      if (e.cat === 3) return 0.72;
      if (e.cat === 4) return 0.82; if (e.cat === 5) return 0.86; if (e.cat === 6) return 0.92; return 0.98;
    },
    draws(hand) {
      const bySuit = [0, 0, 0, 0]; hand.forEach(c => bySuit[suitOf(c)]++);
      const flush4 = bySuit.some(x => x === 4);
      const rs = [...new Set(hand.map(prk))]; if (rs.indexOf(14) >= 0) rs.push(1);
      let str4 = false; for (let lo = 1; lo <= 10; lo++) { let k = 0; for (let r = lo; r < lo + 5; r++) if (rs.indexOf(r) >= 0) k++; if (k >= 4) str4 = true; }
      return { flush4, str4 };
    },
    // 交換するカード
    discards(st, s) {
      const hand = st.hands[s], lv = lvOf(st, s), e = eval5(hand);
      const by = {}; hand.forEach(c => { (by[prk(c)] = by[prk(c)] || []).push(c); });
      const multi = Object.keys(by).filter(r => by[r].length >= 2).map(Number).sort((a, b) => by[b].length - by[a].length || b - a);
      if (e.cat >= 4 && e.cat !== 7) return [];                                  // ストレート以上はそのまま
      if (e.cat === 7) { const k = by[multi[0]]; return lv === 1 ? [] : hand.filter(c => k.indexOf(c) < 0).slice(0, 0); }
      if (e.cat === 3) { const k = by[multi[0]]; return hand.filter(c => k.indexOf(c) < 0); }
      if (e.cat === 2) return hand.filter(c => by[prk(c)].length < 2);
      if (e.cat === 1) {
        const k = by[multi[0]], rest = hand.filter(c => k.indexOf(c) < 0).sort((a, b) => prk(b) - prk(a));
        if (lv === 1 && rnd(st) < 0.35) return rest.slice(1);   // よわいCPU：ときどき余計な1枚を残す
        if (lv === 3 && prk(k[0]) >= 11 && prk(rest[0]) === 14) return rest.slice(1);
        return rest;
      }
      const d = PK.draws(hand);
      if (d.flush4 && lv >= 2) { const su = [0, 1, 2, 3].find(x => hand.filter(c => suitOf(c) === x).length === 4); return hand.filter(c => suitOf(c) !== su); }
      if (d.str4 && lv >= 3) {
        const rs = hand.map(prk), has = r => rs.indexOf(r) >= 0 || (r === 1 && rs.indexOf(14) >= 0);
        for (let lo = 1; lo <= 10; lo++) {
          const need = []; for (let r = lo; r < lo + 5; r++) if (!has(r)) need.push(r);
          if (need.length === 1) { const inSeq = c => { const r = prk(c); return (r >= lo && r < lo + 5) || (r === 14 && lo === 1); }; const out = hand.filter(c => !inSeq(c)); if (out.length === 1) return out; }
        }
      }
      const sorted = hand.slice().sort((a, b) => prk(b) - prk(a));   // ハイカード：つよい＝エースだけ残す
      if (lv === 3) return prk(sorted[0]) === 14 ? sorted.slice(1) : sorted.slice(2);
      if (lv === 2) return sorted.slice(2);
      return sorted.slice(3);
    },
    cpu(st) {
      const s = st.turn;
      if (st.phase === 'result') return { t: 'next' };
      if (st.phase === 'draw') { const d = PK.discards(st, s); return { t: 'draw', d: d.slice().sort((a, b) => st.hands[s].indexOf(a) - st.hands[s].indexOf(b)) }; }
      const lv = lvOf(st, s), L = PK.legal(st);
      const has = a => L.some(m => m.a === a);
      const tc = PK.toCall(st, s);
      let str = PK.strength(st.hands[s], st.phase);
      const opp = PK.live(st).filter(x => x !== s);
      if (lv === 3) {
        // 交換の枚数から相手を読む：ノーチェンジは強い、3枚引いたらペア止まり
        opp.forEach(o => { if (st.phase === 'bet2') { if (st.drew[o] === 0) str -= 0.1; else if (st.drew[o] === 1) str -= 0.04; else if (st.drew[o] >= 3) str += 0.03; } });
        str -= 0.03 * (opp.length - 1);
      }
      const odds = tc / (st.pot + tc), r = rnd(st);
      let act;
      if (lv === 1) {
        if (tc === 0) act = str > 0.55 && r < 0.5 ? 'bet' : 'check';
        else act = str < 0.28 && r < 0.4 ? 'fold' : str > 0.7 && r < 0.4 ? 'raise' : 'call';   // よわい：なんでも付き合う
      } else if (lv === 2) {
        if (tc === 0) act = str > 0.58 && r < 0.8 ? 'bet' : 'check';
        else if (str > 0.8 && r < 0.6) act = 'raise';
        else act = str + (st.phase === 'bet1' ? 0.14 : 0.04) > odds + 0.12 && !(str < 0.18 && r < 0.7) ? 'call' : 'fold';
      } else {
        const bluff = r < 0.07 && str < 0.3 && opp.length <= 2;
        if (tc === 0) act = (str > 0.5 && r < 0.88) || bluff ? 'bet' : 'check';
        else if (str > 0.78 && r < 0.7) act = 'raise';
        else if (str > 0.6 && r < 0.2) act = 'raise';
        else act = str + (st.phase === 'bet1' ? 0.12 : 0.02) >= odds * 0.9 + 0.1 && !(str < 0.2 && tc > st.pot * 0.3) ? 'call' : 'fold';
      }
      if (act === 'fold' && !has('fold')) act = 'check';
      if ((act === 'bet' || act === 'raise') && !has(act)) act = has('call') ? 'call' : 'check';
      if (act === 'check' && !has('check')) act = 'call';
      if (act === 'call' && !has('call')) act = 'check';
      return { t: 'act', a: act };
    },
    who(st) { return st.over ? null : { seat: st.turn }; },
    done: st => st.over,
    result(st) {
      const order = []; for (let s = 0; s < st.n; s++) order.push(s);
      order.sort((a, b) => {
        const ba = st.bust.indexOf(a), bb = st.bust.indexOf(b);
        if (ba >= 0 || bb >= 0) { if (ba >= 0 && bb >= 0) return bb - ba; return ba >= 0 ? 1 : -1; }
        return st.stacks[b] - st.stacks[a] || a - b;
      });
      const rank = new Array(st.n);
      order.forEach((s, i) => { const p = order[i - 1]; rank[s] = i > 0 && st.stacks[s] === st.stacks[p] && st.bust.indexOf(s) < 0 && st.bust.indexOf(p) < 0 ? rank[p] : i + 1; });
      return { order, rank };
    },
  };


  // =================================================================================
  // ブラックジャック（blackjack）：ディーラーと勝負。21 に近づけ、超えたら負け。最初の2枚が A＋10 の札ならブラックジャック（3:2）。ディーラーは 17 以上で止まる。
  // ヒット・スタンド・ダブルダウン・スプリット（1回）。1ラウンドごとに、新しい52枚をきる。opts.stack 最初のチップ、opts.hands ラウンド数。
  // =================================================================================
  const BJ = {
    id: 'blackjack', BETS: [10, 20, 50, 100, 200], MIN: 10,
    val: c => Math.min(10, rankOf(c) + 1),                         // A は 1（あとで 11 にもなる）
    total(cards) { let s = 0, a = 0; for (const c of cards) { const v = BJ.val(c); s += v; if (v === 1) a++; } const soft = a > 0 && s + 10 <= 21; return { n: soft ? s + 10 : s, soft }; },
    isBJ: (cards) => cards.length === 2 && BJ.total(cards).n === 21,
    create(o) {
      const st = base('blackjack', o);
      st.stack0 = [500, 1000, 2000].indexOf(o.stack) >= 0 ? o.stack : 1000;
      st.hands_n = [5, 10, 20].indexOf(o.hands) >= 0 ? o.hands : 10;
      st.stacks = new Array(st.n).fill(st.stack0);
      st.bust = []; st.roundNo = 0;
      st.stat = { bj: new Array(st.n).fill(0), won: new Array(st.n).fill(0), dbl: new Array(st.n).fill(0), split: new Array(st.n).fill(0), best: new Array(st.n).fill(st.stack0) };
      BJ.startRound(st);
      return st;
    },
    startRound(st) {
      st.roundNo++;
      st.deck = shuffle(st, deck(false));
      st.in = st.stacks.map(c => c >= BJ.MIN);
      st.bets = new Array(st.n).fill(0);
      st.hh = Array.from({ length: st.n }, () => []);   // 席ごとの手（スプリットで2つ）：{ cards, bet, done, dbl, fromSplit }
      st.dealer = []; st.hi = 0; st.last = null; st.phase = 'bet';
      st.turn = nextActive(st, -1 + st.n, s => st.in[s]);
      if (st.turn < 0) { st.over = true; st.phase = 'done'; }
    },
    draw(st) { return st.deck.pop(); },
    legalBets(st, s) { return BJ.BETS.filter(b => b <= st.stacks[s]); },
    cur(st) { return st.hh[st.turn][st.hi]; },
    legal(st) {
      if (st.over) return [];
      if (st.phase === 'bet') return BJ.legalBets(st, st.turn).map(b => ({ t: 'bet', amt: b }));
      if (st.phase === 'dealer') return [{ t: 'dealer' }];
      if (st.phase === 'result') return [{ t: 'next' }];
      const h = BJ.cur(st), s = st.turn, L = [{ t: 'act', a: 'hit' }, { t: 'act', a: 'stand' }];
      if (h.cards.length === 2 && st.stacks[s] >= h.bet) {
        L.push({ t: 'act', a: 'double' });
        if (st.hh[s].length === 1 && BJ.val(h.cards[0]) === BJ.val(h.cards[1])) L.push({ t: 'act', a: 'split' });
      }
      return L;
    },
    deal(st) {
      const seats = []; for (let s = 0; s < st.n; s++) if (st.in[s]) seats.push(s);
      for (const s of seats) st.hh[s] = [{ cards: [], bet: st.bets[s], done: false, dbl: false, fromSplit: false }];
      for (let r = 0; r < 2; r++) { for (const s of seats) st.hh[s][0].cards.push(BJ.draw(st)); st.dealer.push(BJ.draw(st)); }
      st.phase = 'play';
      const dBJ = BJ.isBJ(st.dealer);
      for (const s of seats) { const h = st.hh[s][0]; if (BJ.isBJ(h.cards)) { h.done = true; st.stat.bj[s]++; } }
      if (dBJ) { seats.forEach(s => { st.hh[s][0].done = true; }); BJ.settle(st); return; }
      BJ.advance(st, -1, 0);
    },
    // 次に遊ぶ手へ（手が全部終わっていたら、ディーラーへ）
    advance(st, seat, hi) {
      if (seat >= 0 && st.hh[seat][hi + 1] && !st.hh[seat][hi + 1].done) { st.turn = seat; st.hi = hi + 1; return; }
      for (let s = seat + 1; s < st.n; s++) if (st.in[s]) { const k = st.hh[s].findIndex(h => !h.done); if (k >= 0) { st.turn = s; st.hi = k; return; } }
      st.phase = 'dealer';
      st.turn = st.humans.length ? st.humans[0] : 0;
    },
    apply(st, mv) {
      const ev = [], s = st.turn; st.step++;
      if (mv.t === 'bet') {
        st.stacks[s] -= mv.amt; st.bets[s] = mv.amt; ev.push({ t: 'bet', seat: s, amt: mv.amt });
        const nx = nextActive(st, s, x => st.in[x] && st.bets[x] === 0);
        if (nx < 0 || nx < s) { const rest = []; for (let x = 0; x < st.n; x++) if (st.in[x] && !st.bets[x]) rest.push(x); if (rest.length) st.turn = rest[0]; else { BJ.deal(st); ev.push({ t: 'deal' }); } }
        else st.turn = nx;
        return ev;
      }
      if (mv.t === 'dealer') {
        const t = BJ.total(st.dealer);
        const needs = st.hh.some((hs, x) => st.in[x] && hs.some(h => BJ.total(h.cards).n <= 21 && !(BJ.isBJ(h.cards) && !h.fromSplit)));
        if (needs && t.n < 17) { const c = BJ.draw(st); st.dealer.push(c); ev.push({ t: 'dealerDraw', c }); if (BJ.total(st.dealer).n >= 17) { BJ.settle(st); ev.push({ t: 'settle' }); } }
        else { BJ.settle(st); ev.push({ t: 'settle' }); }
        return ev;
      }
      if (mv.t === 'next') { BJ.next(st); ev.push({ t: 'next' }); return ev; }
      const h = BJ.cur(st), hi = st.hi;
      if (mv.a === 'hit') {
        const c = BJ.draw(st); h.cards.push(c); ev.push({ t: 'hit', seat: s, hi, c });
        const T = BJ.total(h.cards).n;
        if (T > 21) { h.done = true; ev.push({ t: 'bust', seat: s, hi }); BJ.advance(st, s, hi); }
        else if (T === 21) { h.done = true; BJ.advance(st, s, hi); }
      } else if (mv.a === 'stand') { h.done = true; ev.push({ t: 'stand', seat: s, hi }); BJ.advance(st, s, hi); }
      else if (mv.a === 'double') {
        st.stacks[s] -= h.bet; h.bet *= 2; h.dbl = true; st.stat.dbl[s]++;
        const c = BJ.draw(st); h.cards.push(c); h.done = true; ev.push({ t: 'double', seat: s, hi, c });
        BJ.advance(st, s, hi);
      } else if (mv.a === 'split') {
        st.stacks[s] -= h.bet; st.stat.split[s]++;
        const second = { cards: [h.cards.pop()], bet: h.bet, done: false, dbl: false, fromSplit: true };
        h.fromSplit = true;
        h.cards.push(BJ.draw(st)); second.cards.push(BJ.draw(st));
        st.hh[s].push(second);
        ev.push({ t: 'split', seat: s });
        [h, second].forEach(x => { if (BJ.total(x.cards).n === 21) x.done = true; });
        if (h.done) BJ.advance(st, s, hi);
      }
      return ev;
    },
    settle(st) {
      const dT = BJ.total(st.dealer).n, dBJ = BJ.isBJ(st.dealer), deltas = new Array(st.n).fill(0), res = {};
      for (let s = 0; s < st.n; s++) {
        if (!st.in[s]) continue;
        res[s] = [];
        for (const h of st.hh[s]) {
          const T = BJ.total(h.cards).n, nat = BJ.isBJ(h.cards) && !h.fromSplit;
          let pay = 0, r;
          if (T > 21) r = 'bust';
          else if (nat && !dBJ) { pay = h.bet * 2.5; r = 'bj'; }
          else if (dBJ) { if (nat) { pay = h.bet; r = 'push'; } else r = 'lose'; }
          else if (dT > 21 || T > dT) { pay = h.bet * 2; r = 'win'; }
          else if (T === dT) { pay = h.bet; r = 'push'; }
          else r = 'lose';
          st.stacks[s] += pay; deltas[s] += pay - h.bet; res[s].push(r);
        }
        if (res[s].some(r => r === 'win' || r === 'bj')) st.stat.won[s]++;
        st.stat.best[s] = Math.max(st.stat.best[s], st.stacks[s]);
      }
      st.last = { deltas, res, dealer: dT, dBJ };
      st.phase = 'result';
      st.turn = st.humans.length ? st.humans[0] : 0;
    },
    next(st) {
      for (let s = 0; s < st.n; s++) if (st.stacks[s] < BJ.MIN && st.bust.indexOf(s) < 0) st.bust.push(s);
      const humanOut = st.humans.length && st.humans.every(h => st.stacks[h] < BJ.MIN);
      const alive = []; for (let s = 0; s < st.n; s++) if (st.stacks[s] >= BJ.MIN) alive.push(s);
      if (st.roundNo >= st.hands_n || !alive.length || humanOut) { st.over = true; st.phase = 'done'; return; }
      BJ.startRound(st);
    },
    // ----- CPU -----
    // 基本戦略（つよい）：ディーラーの見えている札 up（1〜10）に応じて
    basic(h, up, canDouble, canSplit) {
      const T = BJ.total(h.cards), pair = h.cards.length === 2 && BJ.val(h.cards[0]) === BJ.val(h.cards[1]) ? BJ.val(h.cards[0]) : 0;
      if (canSplit && pair) {
        if (pair === 1 || pair === 8) return 'split';
        if (pair === 9 && up !== 7 && up !== 10 && up !== 1) return 'split';
        if (pair === 7 && up <= 7 && up !== 1) return 'split';
        if (pair === 6 && up >= 2 && up <= 6) return 'split';
        if ((pair === 2 || pair === 3) && up >= 2 && up <= 7) return 'split';
      }
      if (T.soft) {
        if (T.n >= 19) return 'stand';
        if (T.n === 18) return up >= 3 && up <= 6 && canDouble ? 'double' : up === 2 || up === 7 || up === 8 ? 'stand' : 'hit';
        if (T.n >= 15) return up >= 4 && up <= 6 && canDouble ? 'double' : 'hit';
        return up >= 5 && up <= 6 && canDouble ? 'double' : 'hit';
      }
      if (T.n >= 17) return 'stand';
      if (T.n >= 13) return up >= 2 && up <= 6 ? 'stand' : 'hit';
      if (T.n === 12) return up >= 4 && up <= 6 ? 'stand' : 'hit';
      if (T.n === 11) return canDouble ? 'double' : 'hit';
      if (T.n === 10) return up >= 2 && up <= 9 && canDouble ? 'double' : 'hit';
      if (T.n === 9) return up >= 3 && up <= 6 && canDouble ? 'double' : 'hit';
      return 'hit';
    },
    cpu(st) {
      const s = st.turn, lv = lvOf(st, s);
      if (st.phase === 'dealer') return { t: 'dealer' };
      if (st.phase === 'result') return { t: 'next' };
      if (st.phase === 'bet') {
        const bets = BJ.legalBets(st, s), r = rnd(st);
        let want;
        if (lv === 1) want = BJ.BETS[ri(st, 5)];                                     // よわい：気分で賭ける
        else if (lv === 2) want = st.stacks[s] >= 600 ? 50 : 20;
        else want = Math.max(10, Math.min(100, Math.round(st.stacks[s] * 0.04 / 10) * 10)); // つよい：チップの4%くらい
        void r;
        let b = bets[0]; for (const x of bets) if (x <= want) b = x;
        return { t: 'bet', amt: b };
      }
      const h = BJ.cur(st), L = BJ.legal(st), has = a => L.some(m => m.a === a);
      const T = BJ.total(h.cards), up = BJ.val(st.dealer[0]);
      let a;
      if (lv === 1) a = T.n < 15 || (T.n < 17 && rnd(st) < 0.35) ? 'hit' : 'stand';
      else if (lv === 2) {
        if (T.n <= 11) a = (T.n >= 10 && has('double') && rnd(st) < 0.5) ? 'double' : 'hit';
        else if (T.soft && T.n <= 17) a = 'hit';
        else if (T.n >= 17) a = 'stand';
        else a = up >= 2 && up <= 6 ? 'stand' : 'hit';
        if (has('split') && BJ.val(h.cards[0]) === 8) a = 'split';
      } else a = BJ.basic(h, up, has('double'), has('split'));
      if (!has(a)) a = a === 'double' ? 'hit' : a === 'split' ? (T.n >= 17 ? 'stand' : 'hit') : 'stand';
      return { t: 'act', a };
    },
    who(st) { return st.over ? null : st.phase === 'dealer' ? { sys: { t: 'dealer' } } : { seat: st.turn }; },
    done: st => st.over,
    result(st) {
      const order = []; for (let s = 0; s < st.n; s++) order.push(s);
      order.sort((a, b) => {
        const ba = st.bust.indexOf(a), bb = st.bust.indexOf(b);
        if (ba >= 0 || bb >= 0) { if (ba >= 0 && bb >= 0) return bb - ba; return ba >= 0 ? 1 : -1; }
        return st.stacks[b] - st.stacks[a] || a - b;
      });
      const rank = new Array(st.n);
      order.forEach((s, i) => { const p = order[i - 1]; rank[s] = i > 0 && st.stacks[s] === st.stacks[p] && st.bust.indexOf(s) < 0 && st.bust.indexOf(p) < 0 ? rank[p] : i + 1; });
      return { order, rank };
    },
  };


  const API = { JOKER, lvOf, suitOf, rankOf, isRed, clamp, last, mix, rnd, ri, shuffle, pick, deck, base, isHuman, nextActive, rankFromOrder, sameJSON,
    games: { oldmaid: OM, jiji: JJ, concentration: CN, sevens: SV, daifugo: DF, poker: PK, blackjack: BJ } };
  root.CardsEngine = API;
  if (typeof module === 'object' && module && module.exports) module.exports = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
