// ワードウルフ（ひまつぶし工房）の中身（pure。node でもブラウザでも動く）。
// ことば（words.js）→ ペア・むずかしさ → 配る（ウルフ 1〜2人・ウルフは自分がウルフと知っている／知らない）
// → ヒント（CPU は「ことばの属性ヒント」から文を作る。性格つき）→ うたがい度 → 投票（同数は決選）→ ウルフの逆転チャンス → 点数。
// 乱数はぜんぶ種（seed）から。同じ種なら同じ展開。CPU は自分のことばと、みんなの発言だけを見る（だれがウルフかは知らない）。
(function (root) {
  'use strict';
  var MAX_PLAYERS = 8, MIN_PLAYERS = 3;
  var DATA = root.WordWolfWords || (typeof require === 'function' ? require('./words.js') : null);

  // ---------------------------------------------------------------- 乱数
  function hash32(s) { s = String(s); var h = 2166136261 >>> 0; for (var i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rng(seed) { var a = (typeof seed === 'number' ? seed : hash32(seed)) >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; var t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  function shuffle(a, r) { a = a.slice(); for (var i = a.length - 1; i > 0; i--) { var j = Math.floor(r() * (i + 1)); var t = a[i]; a[i] = a[j]; a[j] = t; } return a; }
  var pick = function (a, r) { return a[Math.floor(r() * a.length)]; };
  var asArr = function (v) { return Array.isArray(v) ? v : (v == null || v < 0 ? [] : [v]); };

  // ---------------------------------------------------------------- ことば
  // words.js の pairs[i] = [cat, jaA, enA, jaB, enB, "Aの tag…", "Bの tag…"]。ことばのヒント all = そのことばだけの tag（t）＋ジャンルぜんたいの tag（g）
  var cache = null, LV_CUT = [0.34, 0.55];     // 似ている度（共通の tag の割合）：小さい=かんたん、大きい=むずかしい
  function nums(s) { return String(s || '').split(' ').filter(Boolean).map(Number); }
  function pairsOf(W) {
    W = W || DATA; if (cache && cache.W === W) return cache.list;
    var list = W.pairs.map(function (p, i) {
      var g = (W.gen && W.cats[p[0]] && W.gen[W.cats[p[0]].g]) || [], ta = nums(p[5]), tb = nums(p[6]);
      var sb = {}; tb.forEach(function (t) { sb[t] = 1; });
      var com = ta.filter(function (t) { return sb[t]; }).length, uni = ta.length + tb.length - com, sim = uni ? com / uni : 0;
      var mk = function (ja, en, t) { return { ja: ja, en: en, t: t, g: g, all: t.concat(g).sort(function (x, y) { return x - y; }) }; };
      return { id: i, cat: p[0], a: mk(p[1], p[2], ta), b: mk(p[3], p[4], tb), sim: sim, lv: sim < LV_CUT[0] ? 1 : sim < LV_CUT[1] ? 2 : 3 };
    });
    cache = { W: W, list: list }; return list;
  }
  // ことばの検査（unit test と作るときに使う）。問題の一覧を返す（空なら合格）
  var BAD = /酒|ビール|ワイン|たばこ|タバコ|殺|死|銃|爆|セックス|麻薬|ギャンブル|パチンコ|戦争|宗教|マクドナルド|ディズニー|ポケモン|ドラえもん|ガンダム/;
  var JP = /[぀-ヿ㐀-鿿]/;
  function validate(W) {
    W = W || DATA; var bad = [], seenW = {}, seenP = {};
    if (!W.cats || W.cats.length < 15) bad.push('categories < 15');
    W.cats.forEach(function (c) { if (!W.gen || !W.gen[c.g] || W.gen[c.g].length < 10) bad.push('category ' + c.id + ' has fewer than 10 generic hints'); });
    W.tags.forEach(function (t, i) {
      if (!t[0] || !t[1] || !t[2]) bad.push('tag ' + i + ' incomplete');
      else { if (t[1].length > 30) bad.push('tag ja too long ' + t[1]); if (t[2].length > 60) bad.push('tag en too long ' + t[2]); if (JP.test(t[2])) bad.push('tag en has Japanese ' + t[2]); if (BAD.test(t[1])) bad.push('tag sensitive ' + t[1]); }
    });
    pairsOf(W).forEach(function (p) {
      var id = '#' + p.id + ' ' + p.a.ja + '/' + p.b.ja;
      [p.a, p.b].forEach(function (w) {
        if (!w.ja || w.ja.length > 12) bad.push(id + ' ja length');
        if (/[A-Za-z0-9]/.test(w.ja)) bad.push(id + ' ja has latin/digit');
        if (!w.en || w.en.length < 2 || w.en.length > 28 || JP.test(w.en)) bad.push(id + ' en gloss');
        if (BAD.test(w.ja) || BAD.test(w.en)) bad.push(id + ' sensitive');
        if (seenW[w.ja]) bad.push(id + ' duplicate word ' + w.ja); seenW[w.ja] = 1;
        if (w.t.length < 2 || w.t.length > 14) bad.push(id + ' tag count ' + w.t.length);
        if (w.all.length < 15) bad.push(id + ' fewer than 15 hints (' + w.all.length + ')');
        if (new Set(w.all).size !== w.all.length) bad.push(id + ' repeated tag');
        w.all.forEach(function (t) {
          if (!W.tags[t]) { bad.push(id + ' unknown tag ' + t); return; }
          [p.a, p.b].forEach(function (x) {
            if (W.tags[t][1].indexOf(x.ja) >= 0) bad.push(id + ' hint leaks the word ' + W.tags[t][1]);
            var e = x.en.toLowerCase(); if (e.length >= 3 && new RegExp('\\b' + e.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + '(s|es)?\\b').test(W.tags[t][2].toLowerCase())) bad.push(id + ' English hint leaks the word ' + W.tags[t][2]);
          });
        });
      });
      if (p.a.ja === p.b.ja || p.a.ja.indexOf(p.b.ja) >= 0 || p.b.ja.indexOf(p.a.ja) >= 0) bad.push(id + ' one word contains the other');
      if (p.a.en.toLowerCase() === p.b.en.toLowerCase()) bad.push(id + ' same gloss');
      var k = [p.a.ja, p.b.ja].sort().join('|'); if (seenP[k]) bad.push(id + ' duplicate pair'); seenP[k] = 1;
      var sb = {}; p.b.t.forEach(function (t) { sb[t] = 1; }); var com = p.a.t.filter(function (t) { return sb[t]; }).length;
      if (p.a.t.length + p.b.t.length - 2 * com < 1) bad.push(id + ' identical tag sets');
      if (!W.cats[p.cat]) bad.push(id + ' unknown category');
    });
    return bad;
  }
  var hintText = function (tag, lang, W) { W = W || DATA; var t = W.tags[tag]; return t ? (lang === 'en' ? t[2] : t[1]) : ''; };
  var wordName = function (w, lang) { return lang === 'en' ? w.en : w.ja; };
  var promptOf = function (i, lang, W) { W = W || DATA; var p = W.prompts && W.prompts[((i % W.prompts.length) + W.prompts.length) % W.prompts.length]; return p ? (lang === 'en' ? p[1] : p[0]) : ''; };

  // ---------------------------------------------------------------- CPU の性格（deterministic。種と席から決まる）
  // spec：ことば特有のヒントをどれだけ好むか（1=ふつう、大きいほど具体的）／ noise：うたがいのブレ／ copy：ほかの人のヒントに寄せる強さ
  var PERSONAS = [
    { id: 'bold', ja: 'だいたん', en: 'Bold', spec: 2.4, noise: 1.2, copy: 0.4, say: [['ずばり、', 'Let me say it straight: '], ['これは言える！ ', 'I can say this: '], ['まよわず言うと、', 'No doubt, ']] },
    { id: 'careful', ja: 'しんちょう', en: 'Careful', spec: 0.35, noise: 0.7, copy: 1.2, say: [['うーん、', 'Hmm, '], ['ふつうに考えて、', 'Thinking plainly, '], ['あたりさわりなく、', 'Keeping it safe: ']] },
    { id: 'sharp', ja: 'するどい', en: 'Sharp', spec: 1.0, noise: 0.45, copy: 0.8, say: [['ふむ、', 'Let me see, '], ['ここだけの話、', 'Between us, '], ['たとえば、', 'For example, ']] },
    { id: 'dreamy', ja: 'おっとり', en: 'Dreamy', spec: 0.8, noise: 1.6, copy: 0.6, say: [['えっとね、', 'Um, '], ['そういえば、', 'Now that I think of it, '], ['ぼんやり思うのは、', 'Vaguely, ']] },
    { id: 'copycat', ja: 'まねっこ', en: 'Copycat', spec: 0.6, noise: 1.0, copy: 3.0, say: [['それな、', 'Right, '], ['わたしも、', 'Me too: '], ['同じく、', 'Same here: ']] },
  ];
  function personaOf(S, p) { return S.players[p] && S.players[p].persona != null ? PERSONAS[S.players[p].persona] : PERSONAS[2]; }
  // CPU の発言の頭につく一言（性格つき）。{ ja, en }
  function cpuLead(S, p, round) { var P = personaOf(S, p), r = rng('ww:' + S.seed + ':lead:' + round + ':' + p), x = pick(P.say, r); return r() < 0.7 ? { ja: x[0], en: x[1] } : { ja: '', en: '' }; }

  // ---------------------------------------------------------------- 配る
  // opts: { seed, n(3..8), names[], humans(人間の数。残りは CPU), lv(0=ぜんぶ,1..3), cats[], recent[], skill(1..3), minutes, rounds(1..3), wolves(1..2), wolfKnows }
  function newGame(opts) {
    var W = opts.W || DATA, n = Math.max(MIN_PLAYERS, Math.min(MAX_PLAYERS, opts.n | 0)), r = rng('ww:' + opts.seed);
    var all = pairsOf(W), lv = opts.lv | 0, cats = opts.cats && opts.cats.length ? opts.cats : null, recent = opts.recent || [];
    var pool = all.filter(function (p) { return (!lv || p.lv === lv) && (!cats || cats.indexOf(p.cat) >= 0); });
    if (!pool.length) pool = all;
    var fresh = pool.filter(function (p) { return recent.indexOf(p.id) < 0; }); if (fresh.length) pool = fresh;
    var pair = pick(pool, r), maj = r() < 0.5 ? 'a' : 'b';
    var k = (opts.wolves | 0) >= 2 && n >= 5 ? 2 : 1, seats = shuffle(Array.from({ length: n }, function (_, i) { return i; }), r), wolves = seats.slice(0, k).sort(function (x, y) { return x - y; });
    var humans = opts.humans == null ? n : Math.max(1, Math.min(n, opts.humans | 0));
    var pers = shuffle(PERSONAS.map(function (_, i) { return i; }), rng('ww:' + opts.seed + ':persona'));
    var players = [], c = 0; for (var i = 0; i < n; i++) { var cpu = i >= humans; players.push({ name: (opts.names && opts.names[i]) || ('P' + (i + 1)), cpu: cpu, wolf: wolves.indexOf(i) >= 0, persona: cpu ? pers[c++ % pers.length] : null }); }
    var order = shuffle(players.map(function (_, i) { return i; }), r);
    var S = { v: 2, seed: String(opts.seed), n: n, players: players, pair: pair.id, maj: maj, wolf: wolves[0], wolves: wolves, k: k, knows: !!opts.wolfKnows, lv: pair.lv, cat: pair.cat,
      skill: Math.max(1, Math.min(3, opts.skill || 2)), minutes: opts.minutes || 4, order: order, rounds: Math.max(1, Math.min(3, opts.rounds || 2)), hints: [], votes: [], revote: 0, tied: null, sure: [], slots: k, caught: [], executed: -1, guess: null, over: false, outcome: null };
    Object.defineProperty(S, 'W', { value: W, enumerable: false, writable: true });
    return S;
  }
  function pairOf(S) { return pairsOf(S.W)[S.pair]; }
  var isWolf = function (S, p) { return !!S.players[p].wolf; };
  function sideOf(S, p) { return isWolf(S, p) ? (S.maj === 'a' ? 'b' : 'a') : S.maj; }
  function wordOf(S, p) { return pairOf(S)[sideOf(S, p)]; }
  function majorityWord(S) { return pairOf(S)[S.maj]; }
  function wolfWord(S) { return pairOf(S)[S.maj === 'a' ? 'b' : 'a']; }
  // その人が「ウルフだよ」と教えられているか（ウルフが知っているルールのとき）
  var knowsWolf = function (S, p) { return !!S.knows && isWolf(S, p); };

  // ---------------------------------------------------------------- ヒント
  // S.hints = [{ p, tag, r（ラウンド）}]。人間は word.all の中から選ぶ。slot（all の並びの番号）で送ってもよい。
  function hintsBy(S, p) { return S.hints.filter(function (h) { return h.p === p; }); }
  var setOf = function (arr) { var s = {}; arr.forEach(function (t) { s[t] = 1; }); return s; };
  // 人間（や、オンラインの人）が選べるヒントの一覧（まだ言っていないもの）。順番は固定（番号の小さい順）
  function hintChoices(S, p) { var said = setOf(hintsBy(S, p).map(function (h) { return h.tag; })); return wordOf(S, p).all.filter(function (t) { return !said[t]; }); }
  // p が「ほかの人の言ったことが、自分のことばとずれている」と感じている度合い（0..1）
  function selfDoubt(S, p) {
    var own = setOf(wordOf(S, p).all), n = 0, bad = 0;
    S.hints.forEach(function (h) { if (h.p !== p) { n++; if (!own[h.tag]) bad++; } });
    return n >= 2 ? bad / n : 0;
  }
  function cpuHintTag(S, p, round) {
    var r = rng('ww:' + S.seed + ':hint:' + round + ':' + p), w = wordOf(S, p), P = personaOf(S, p), opts = hintChoices(S, p);
    if (!opts.length) opts = w.all.slice();
    var gen = setOf(w.g), said = {}; S.hints.forEach(function (h) { if (h.p !== p) said[h.tag] = (said[h.tag] || 0) + 1; });
    var doubt = selfDoubt(S, p), knows = knowsWolf(S, p), first = !S.hints.length;
    // 前半は「ざっくり」、後半ほど「ことば特有」のヒントになる（性格で好みがちがう）
    var specW = P.spec * (round === 0 ? 0.55 : round === 1 ? 1 : 1.6);
    var ws = opts.map(function (t) {
      var x = gen[t] ? 1 : specW;
      if (said[t]) x *= 1 + P.copy * (doubt > 0.3 ? 2.5 : 0.8);          // ほかの人と同じ方向に寄せる
      if (knows) { x = gen[t] ? 1.6 : 0.5; if (said[t]) x *= 5; }          // ウルフだと知っている：目立たないヒントで合わせる
      else if (first) x = gen[t] ? 1 : specW * 0.8;
      return Math.max(0.02, x);
    });
    var tot = ws.reduce(function (a, b) { return a + b; }, 0), v = r() * tot, k = 0;
    for (; k < ws.length - 1; k++) { v -= ws[k]; if (v < 0) break; }
    return opts[k];
  }
  // p から見た、ほかの人のうたがい度（大きいほどあやしい）。noise は性格と CPU の鋭さで変わる
  function rawSuspicion(S, p) {
    var own = setOf(wordOf(S, p).all), out = [];
    for (var q = 0; q < S.n; q++) {
      if (q === p) { out.push(-Infinity); continue; }
      var s = 0; hintsBy(S, q).forEach(function (h) { s += own[h.tag] ? -0.5 : 2; });
      out.push(s);
    }
    return out;
  }
  function suspicion(S, p) {
    var r = rng('ww:' + S.seed + ':sus:' + S.revote + ':' + p), P = personaOf(S, p), noise = [7, 4.2, 1.2][S.skill - 1] * P.noise, raw = rawSuspicion(S, p);
    return raw.map(function (v) { return v === -Infinity ? v : v + (r() - 0.5) * noise; });
  }
  // 投票：slots 人ぶん（ウルフ2人なら2人）。cands があれば決選投票。配列で返す
  function cpuVote(S, p, cands, slots) {
    slots = slots || 1;
    var sus = suspicion(S, p), dbt = selfDoubt(S, p), sc = [];
    for (var q = 0; q < S.n; q++) {
      if (q === p || (cands && cands.indexOf(q) < 0)) continue;
      var v = sus[q];
      if (dbt > 0.5) v += (rng('ww:' + S.seed + ':def:' + p + ':' + q)() - 0.5) * 3;   // 自分があやしいと感じたら、まぎらわす
      sc.push({ q: q, v: v });
    }
    sc.sort(function (a, b) { return b.v - a.v || a.q - b.q; });
    var out = sc.slice(0, slots).map(function (x) { return x.q; });
    if (!out.length) out.push(cands ? cands[0] : (p + 1) % S.n);
    return out;
  }

  // ---------------------------------------------------------------- 投票
  // votes[i] = i が投票した相手の番号（数、または slots 人ぶんの配列）。
  function tally(votes, n) { var c = []; for (var i = 0; i < n; i++) c.push(0); (votes || []).forEach(function (v, who) { var seen = {}; asArr(v).forEach(function (t) { if (t >= 0 && t < n && t !== who && !seen[t]) { seen[t] = 1; c[t]++; } }); }); return c; }
  // counts から上位 slots 人を決める。同数で決まらなければ tied（その人たちで決選）
  function pickTop(counts, slots, cands) {
    var ids = (cands || counts.map(function (_, i) { return i; })).slice().sort(function (a, b) { return counts[b] - counts[a] || a - b; });
    if (ids.length <= slots) return { sure: ids.slice().sort(function (a, b) { return a - b; }), tied: [], need: 0 };
    var th = counts[ids[slots - 1]], sure = ids.filter(function (i) { return counts[i] > th; }), tie = ids.filter(function (i) { return counts[i] === th; });
    if (sure.length + tie.length === slots) return { sure: sure.concat(tie).sort(function (a, b) { return a - b; }), tied: [], need: 0 };
    return { sure: sure.sort(function (a, b) { return a - b; }), tied: tie.sort(function (a, b) { return a - b; }), need: slots - sure.length };
  }
  function resolveVote(votes, n, slots) {
    var c = tally(votes, n), t = pickTop(c, slots || 1);
    return t.tied.length ? { kind: 'tie', tied: t.tied, sure: t.sure, need: t.need, counts: c } : { kind: 'out', target: t.sure[0], caught: t.sure, counts: c };
  }
  // 投票をまとめる。1回目の同数 → 同数の人だけで決選投票。2回目も同数 → 決まらない分はにげきり
  function applyVotes(S, votes) {
    var cands = S.revote ? S.tied : null, slots = S.revote ? S.slots : S.k, c = tally(votes, S.n), t = pickTop(c, slots, cands);
    S.lastVotes = votes.map(function (v) { return asArr(v).slice(); }); S.lastCounts = c;
    (S.voteLog = S.voteLog || []).push({ revote: S.revote, votes: S.lastVotes.map(function (v) { return v.slice(); }), counts: c });
    var sure = (S.revote ? S.sure : []).concat(t.sure);
    if (!t.tied.length || S.revote) {
      S.caught = sure.sort(function (a, b) { return a - b; }); S.executed = S.caught.length ? S.caught[0] : -1; S.tied = null;
      return S.caught.length ? { next: 'caught', target: S.caught[0], caught: S.caught.slice(), counts: c } : { next: 'escaped', caught: [], counts: c };
    }
    S.revote = 1; S.sure = sure; S.tied = t.tied; S.slots = t.need;
    return { next: 'revote', tied: t.tied.slice(), slots: t.need, counts: c };
  }
  // いま集める投票：{ slots: 何人に入れるか, cands: 選べる人（null=ぜんいん） }
  function ballotRule(S) { return S.revote ? { slots: S.slots, cands: S.tied.slice() } : { slots: S.k, cands: null }; }
  // つかまった人の中に、ウルフが全員いるか
  function allWolvesCaught(S) { return S.wolves.every(function (w) { return S.caught.indexOf(w) >= 0; }); }

  // ---------------------------------------------------------------- ウルフの逆転
  // 選択肢：本当のことば（多数派）＋同じカテゴリのほかのことば（ウルフ自身のことばは除く）。全部で k こ。
  function guessOptions(S, k) {
    k = k || 6; var r = rng('ww:' + S.seed + ':guess'), all = pairsOf(S.W), P = pairOf(S), maj = P[S.maj], wolfW = P[S.maj === 'a' ? 'b' : 'a'];
    var cand = [], seen = {}; seen[maj.ja] = 1; seen[wolfW.ja] = 1;
    var same = shuffle(all.filter(function (p) { return p.cat === P.cat && p.id !== P.id; }), r), other = shuffle(all.filter(function (p) { return p.cat !== P.cat; }), r);
    same.concat(other).forEach(function (p) { [p.a, p.b].forEach(function (w) { if (cand.length < k - 1 && !seen[w.ja] && w.ja.indexOf(maj.ja) < 0 && maj.ja.indexOf(w.ja) < 0 && w.ja.indexOf(wolfW.ja) < 0 && wolfW.ja.indexOf(w.ja) < 0) { seen[w.ja] = 1; cand.push(w); } }); });
    return shuffle([maj].concat(cand), r).map(function (w) { return { ja: w.ja, en: w.en, ok: w === maj }; });
  }
  // CPU のウルフ：みんなのヒントに合うことばを選ぶ
  function cpuGuess(S) {
    var opts = guessOptions(S), cnt = {}; S.hints.forEach(function (h) { if (!S.players[h.p].wolf) cnt[h.tag] = (cnt[h.tag] || 0) + 1; });
    var all = pairsOf(S.W), best = 0, bv = -1, r = rng('ww:' + S.seed + ':cg');
    opts.forEach(function (o, i) {
      var w = null; all.forEach(function (p) { [p.a, p.b].forEach(function (x) { if (x.ja === o.ja) w = x; }); });
      var v = 0; if (w) w.all.forEach(function (t) { v += cnt[t] || 0; }); v += r() * 0.4;
      if (v > bv) { bv = v; best = i; }
    });
    return best;
  }

  // ---------------------------------------------------------------- 点数と結果
  // 村の勝ち（ウルフを全員つかまえて、逆転も外れ）：ウルフに投票した村人 +2、ほかの村人 +1、ウルフ 0
  // ウルフの逆転：ウルフ +2、ウルフに投票した村人 +1
  // ウルフのにげきり（ちがう人が選ばれた／決選も同数／2人のうち1人しかつかまらなかった）：にげたウルフ +3、つかまったウルフ +1
  function finish(S, guessOk) {
    var pts = S.players.map(function () { return 0; }), caught = S.caught && S.caught.length ? S.caught : (S.executed >= 0 ? [S.executed] : []), how, winner;
    S.caught = caught; var log = S.voteLog && S.voteLog.length ? S.voteLog : [{ votes: S.lastVotes || [] }];
    var hit = function (i) { return log.some(function (e) { return asArr(e.votes[i]).some(function (t) { return S.wolves.indexOf(t) >= 0; }); }); };
    var all = S.wolves.every(function (w) { return caught.indexOf(w) >= 0; });
    if (all) {
      if (guessOk) { how = 'counter'; winner = 'wolf'; S.wolves.forEach(function (w) { pts[w] = 2; }); } else { how = 'caught'; winner = 'village'; }
      S.players.forEach(function (pl, i) { if (pl.wolf) return; var right = hit(i); if (how === 'caught') pts[i] = right ? 2 : 1; else if (right) pts[i] = 1; });
    } else {
      var some = S.wolves.some(function (w) { return caught.indexOf(w) >= 0; });
      how = some ? 'partial' : caught.length ? 'wrong' : 'tie'; winner = 'wolf';
      S.wolves.forEach(function (w) { pts[w] = caught.indexOf(w) >= 0 ? 1 : 3; });
    }
    S.outcome = { winner: winner, how: how, caught: caught.length ? caught[0] : -1, caughtAll: caught.slice(), guessOk: !!guessOk, pts: pts }; S.over = true; return S.outcome;
  }

  // ---------------------------------------------------------------- 記録（保存の形）
  function newStats() { return { games: 0, wins: 0, wolfGames: 0, wolfWins: 0, soloGames: 0, soloWins: 0, caught: 0, counters: 0, escapes: 0, local: 0, hints: 0, perfect: 0, maxpts: 0, hard: 0, big: 0, streak: 0, bs: 0, two: 0, knows: 0, onl: 0, onw: 0, cats: 0 }; }
  // ランキング値：ひとり対CPUで遊んだ回数 + 勝った回数×2。上限 500（みんなで・オンラインは数えない）
  var CAP = 500;
  function rankValue(sv) { var s = (sv && sv.stats) || {}; return Math.min(CAP, (s.soloGames | 0) + 2 * (s.soloWins | 0)); }
  // human: 画面の前の人（ひとり対CPU のとき。ローカルは -1）。online: { me, won }（オンラインの記録。ランキングには入れない）
  function record(stats, S, human, online) {
    var o = S.outcome; stats.games++; var solo = !online && human >= 0 && S.players.some(function (p) { return p.cpu; });
    if (!solo && !online) stats.local++;
    if (S.n >= 8) stats.big++;
    if (S.k >= 2) stats.two++;
    if (S.knows) stats.knows++;
    if (online) { stats.onl++; if (online.won) stats.onw++; stats.hints += online.hints | 0; }
    else stats.hints += S.hints.filter(function (h) { return !S.players[h.p].cpu; }).length;
    if (solo) {
      stats.soloGames++; var isWolf = S.wolves.indexOf(human) >= 0, win = (o.winner === 'wolf') === isWolf; if (win) { stats.soloWins++; stats.wins++; stats.streak++; if (stats.streak > stats.bs) stats.bs = stats.streak; if (S.lv === 3) stats.hard++; } else stats.streak = 0;
      if (isWolf) { stats.wolfGames++; if (win) stats.wolfWins++; }
      var votedWolf = (S.voteLog || []).some(function (e) { return asArr(e.votes[human]).some(function (t) { return S.wolves.indexOf(t) >= 0; }); });
      if (win && !isWolf && o.how === 'caught' && votedWolf) stats.perfect++;
      if (o.pts[human] > stats.maxpts) stats.maxpts = o.pts[human];
    }
    if (o.how === 'caught') stats.caught++; else if (o.how === 'counter') stats.counters++; else stats.escapes++;
    return stats;
  }

  var API = {
    MAX_PLAYERS: MAX_PLAYERS, MIN_PLAYERS: MIN_PLAYERS, CAP: CAP, PERSONAS: PERSONAS, hash32: hash32, rng: rng, shuffle: shuffle,
    pairsOf: pairsOf, validate: validate, hintText: hintText, wordName: wordName, promptOf: promptOf,
    newGame: newGame, pairOf: pairOf, sideOf: sideOf, wordOf: wordOf, majorityWord: majorityWord, wolfWord: wolfWord, isWolf: isWolf, knowsWolf: knowsWolf,
    personaOf: personaOf, cpuLead: cpuLead, hintsBy: hintsBy, hintChoices: hintChoices, selfDoubt: selfDoubt, cpuHintTag: cpuHintTag, rawSuspicion: rawSuspicion, suspicion: suspicion, cpuVote: cpuVote,
    tally: tally, pickTop: pickTop, resolveVote: resolveVote, applyVotes: applyVotes, ballotRule: ballotRule, allWolvesCaught: allWolvesCaught,
    guessOptions: guessOptions, cpuGuess: cpuGuess, finish: finish, newStats: newStats, rankValue: rankValue, record: record,
  };
  if (typeof module === 'object' && module.exports) module.exports = API;
  root.WordWolfEngine = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
