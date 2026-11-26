// orchestra/concert.js — 指揮者ゲームの「演奏会モード」の中身。DOM も Web Audio も持たない純粋な関数だけ（node でそのままテストできる）。
// UMD: ブラウザでは window.OrchConcert、node では module.exports（tools/tests/unit/orchestra-concert.test.js）。
//
//   曲目     [{ id, part? }]（part は長い楽章の前半・後半など）。最大 MAX_ITEMS 曲・MAX_MIN 分（1つの作品だけなら MAX_MIN_WORK 分）
//   presets  「交響曲まるごと」（作品の全楽章を順に）と、おまかせの曲目
//   plan     入場 → 曲 → 拍手（同じ作品の次の楽章へは拍手なし）→ 休憩 → … → 終演 の順番
//   judge    曲ごとの結果（engine.js の Scorer.result）から、一晩ぜんたいの評価（S/A/B/C・★1〜5）を作る
//   review   公演レビューの文章（データから作る。T は画面側の翻訳関数）
//   store    kusoge.orchestra.concert の読み書き（曲目ごとのベスト・履歴）
//
// engine.js の採点には触れない：曲ごとの採点は engine.js のまま、ここでは「それを束ねる」だけ。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OrchConcert = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const MAX_ITEMS = 6, MAX_MIN = 60, MAX_MIN_WORK = 80, MIN_INTERVAL_MIN = 25, MIN_INTERVAL_WORK = 45, HIST_MAX = 20;
  const GRADES = ['C', 'B', 'A', 'S'];
  // 評価の基準（むずかしさごと。たのしむは入りが自動なので少し高め）: [B, A, S]
  const CUT = { enjoy: [68, 82, 92], normal: [60, 76, 88], maestro: [56, 72, 84] };
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sum = a => a.reduce((x, y) => x + y, 0);
  const round1 = x => Math.round(x * 10) / 10;

  // ---------- items ----------
  const itemKey = it => (typeof it === 'string' ? it : it.id + (it.part ? '~' + it.part : ''));
  function parseItem(s) { if (s && typeof s === 'object') return { id: String(s.id), part: s.part ? String(s.part) : null }; const m = String(s).split('~'); return { id: m[0], part: m[1] || null }; }
  const progKey = items => items.map(itemKey).join(',');
  const catalog = pieces => { const by = {}; (pieces || []).forEach(p => { by[p.id] = p; }); return by; };
  const workKey = p => (p ? p.work || p.id : '');
  // 第○楽章の番号（"第3楽章" / "III. ..."）。なければ 0
  function mvNo(p) {
    if (!p) return 0;
    const j = p.mvt && /第\s*(\d+)\s*楽章/.exec(p.mvt.ja || ''); if (j) return +j[1];
    const e = p.mvt && /^\s*(I{1,3}|IV|V)\./.exec(p.mvt.en || ''); if (e) return { I: 1, II: 2, III: 3, IV: 4, V: 5 }[e[1]];
    const s = /-(\d)$/.exec(p.id); return s ? +s[1] : 0;
  }
  const workSize = (pieces, p) => pieces.filter(q => workKey(q) === workKey(p)).length;
  function itemMinutes(it, by) {
    const p = by[it.id]; if (!p) return 0; let m = Number(p.minutes) || 0;
    if (it.part && p.parts) { const q = p.parts.find(x => x.id === it.part); if (q && p.nBeats) m = m * (q.to - q.from) / p.nBeats; }
    return m;
  }
  const totalMinutes = (items, by) => sum(items.map(it => itemMinutes(it, by)));
  // 1つの作品の楽章だけの曲目か（まるごと系）
  const isSingleWork = (items, by) => items.length > 0 && items.every(it => by[it.id] && workKey(by[it.id]) === workKey(by[items[0].id]));
  function validate(items, by) {
    const errors = [], keys = new Set();
    if (!items || !items.length) errors.push('empty');
    else {
      if (items.length > MAX_ITEMS) errors.push('tooMany');
      items.forEach(it => { if (!by[it.id]) errors.push('unknown'); const k = itemKey(it); if (keys.has(k)) errors.push('dup'); keys.add(k); });
    }
    const minutes = round1(totalMinutes(items || [], by));
    if (minutes > (isSingleWork(items || [], by) ? MAX_MIN_WORK : MAX_MIN)) errors.push('tooLong');
    return { ok: errors.length === 0, errors: [...new Set(errors)], minutes };
  }
  // 作品の全楽章を楽章の順に
  function wholeWork(pieces, wk) {
    return pieces.filter(p => workKey(p) === wk).sort((a, b) => mvNo(a) - mvNo(b)).map(p => ({ id: p.id, part: null }));
  }
  // 次の曲が「同じ作品の次の楽章」なら、拍手はしない（楽章のあいだ）
  function isNextMovement(prev, next, pieces) {
    if (!prev || !next || workKey(prev) !== workKey(next)) return false;
    return workSize(pieces, prev) > 1 && mvNo(next) > mvNo(prev);
  }

  // ---------- ready-made programmes ----------
  const KIND = p => (/序曲/.test(p.mvt && p.mvt.ja || '') ? 'overture' : /行進曲/.test(p.mvt && p.mvt.ja || '') ? 'march' : 'other');
  // 作品を1つの塊として数える：ひとりぼっちの曲だけを集めて、作曲者がかたよらないように選ぶ
  function autoProgramme(pieces, o) {
    o = o || {};
    const target = o.targetMin || 24, maxLevel = o.maxLevel || 3, lim = o.perComposer || 2;
    const c = pieces.filter(p => workSize(pieces, p) === 1 && !p.sketch && !p.light && !p.simplified && p.minutes <= 12 && !(/第\s*\d+\s*楽章/.test(p.mvt && p.mvt.ja || '') && p.minutes > 6) && p.level <= maxLevel && (!o.era || p.era === o.era) && !(o.exclude || []).includes(p.id));
    const pri = p => (KIND(p) === 'overture' ? 0 : KIND(p) === 'march' ? 2 : 1);
    const pool = c.slice().sort((a, b) => pri(a) - pri(b) || a.level - b.level || b.minutes - a.minutes || (a.id < b.id ? -1 : 1));
    const picked = [], comp = {}; let min = 0;
    const take = p => { picked.push(p); comp[p.ck || p.composer.en] = (comp[p.ck || p.composer.en] || 0) + 1; min += p.minutes; };
    for (const p of pool) {
      if (picked.length >= MAX_ITEMS) break;
      if ((comp[p.ck || p.composer.en] || 0) >= lim) continue;
      if (min + p.minutes > target + 3) continue;
      take(p); if (min >= target - 1) break;
    }
    // 幕開けは序曲、おしまいは行進曲（または一番はなやかな曲）、まんなかは軽い曲から順に
    const opener = picked.filter(p => KIND(p) === 'overture').sort((a, b) => a.minutes - b.minutes)[0] || null;
    const closer = picked.filter(p => KIND(p) === 'march' && p !== opener).sort((a, b) => b.level - a.level || b.minutes - a.minutes)[0] || null;
    const mid = picked.filter(p => p !== opener && p !== closer).sort((a, b) => a.level - b.level || a.minutes - b.minutes || (a.id < b.id ? -1 : 1));
    return [opener].concat(mid, [closer]).filter(Boolean).map(p => ({ id: p.id, part: null }));
  }
  // 並びの全体：まるごと系（複数の楽章がある作品ごと）＋おまかせ
  function presets(pieces) {
    const by = catalog(pieces), out = [], seen = new Set();
    pieces.forEach(p => {
      const wk = workKey(p); if (seen.has(wk)) return; seen.add(wk);
      if (workSize(pieces, p) < 2) return;
      const items = wholeWork(pieces, wk), first = by[items[0].id], nos = items.map(it => mvNo(by[it.id]));
      out.push({ id: 'work:' + wk, kind: 'work', work: wk, title: { ja: first.title.ja + ' まるごと', en: first.title.en + ' — complete' }, composer: first.composer, items, minutes: round1(totalMinutes(items, by)), movements: nos });
    });
    [
      { id: 'mix:first', era: '', maxLevel: 2, target: 18, ja: 'はじめての演奏会', en: 'My First Concert', d: { ja: 'やさしめの曲を集めた、約20分の短い一夜', en: 'A short evening of easier pieces' } },
      { id: 'mix:classical', era: 'classical', maxLevel: 3, target: 38, per: 3, ja: '古典派の夕べ', en: 'A Classical Evening', d: { ja: 'ベートーヴェンやモーツァルトの時代の曲で、休憩つき', en: 'Beethoven, Mozart and friends, with an interval' } },
      { id: 'mix:romantic', era: 'romantic', maxLevel: 3, target: 38, per: 3, ja: 'ロマン派の夕べ', en: 'A Romantic Evening', d: { ja: '序曲や行進曲もまじえた、ロマン派の一晩', en: 'Overtures, marches and romantic favourites' } },
    ].forEach(m => {
      const items = autoProgramme(pieces, { era: m.era, maxLevel: m.maxLevel, targetMin: m.target, perComposer: m.per });
      if (items.length >= 2) out.push({ id: m.id, kind: 'mix', title: { ja: m.ja, en: m.en }, desc: m.d, items, minutes: round1(totalMinutes(items, by)) });
    });
    return out;
  }

  // ---------- the evening ----------
  // 休憩の位置：曲 i のあとに入れる（-1 = なし）。mark: null = おまかせ / 'none' = 入れない / 曲のキー = その曲のあと
  function intermissionAt(items, by, mark) {
    const n = items.length; if (n < 2) return -1;
    if (mark === 'none') return -1;
    if (typeof mark === 'string') { const i = items.findIndex(it => itemKey(it) === mark); if (i >= 0 && i < n - 1) return i; }
    const mins = items.map(it => itemMinutes(it, by)), total = sum(mins);
    if (isSingleWork(items, by) ? total < MIN_INTERVAL_WORK : (total < MIN_INTERVAL_MIN || n < 3)) return -1; // 1つの交響曲の楽章のあいだには、よほど長くなければ入れない
    let best = -1, bestCost = Infinity, acc = 0;
    for (let i = 0; i < n - 1; i++) {
      acc += mins[i];
      const a = by[items[i].id], b = by[items[i + 1].id], split = a && b && isNextMovement(a, b, Object.values(by));
      const cost = Math.abs(acc - total / 2) + (split ? 1000 : 0);
      if (cost < bestCost) { bestCost = cost; best = i; }
    }
    return best;
  }
  // 一晩の手順：entrance → (piece → gap → [interval]) … → piece → finale
  function planEvening(items, by, mark) {
    const all = Object.values(by), iv = intermissionAt(items, by, mark), steps = [{ t: 'entrance' }];
    items.forEach((it, i) => {
      steps.push({ t: 'piece', i });
      if (i < items.length - 1) {
        const quiet = isNextMovement(by[it.id], by[items[i + 1].id], all);
        steps.push({ t: 'gap', i, quiet });
        if (iv === i) steps.push({ t: 'interval', i });
      }
    });
    steps.push({ t: 'finale' });
    return steps;
  }

  // ---------- judging ----------
  const gradeOf = (score, diff) => { const c = CUT[diff] || CUT.normal; return score >= c[2] ? 'S' : score >= c[1] ? 'A' : score >= c[0] ? 'B' : 'C'; };
  const starsOf = (score, diff) => { const g = gradeOf(score, diff); return g === 'S' ? 5 : g === 'A' ? 4 : g === 'B' ? 3 : score >= 40 ? 2 : 1; };
  function aspectsOf(r, diff) {
    const a = { tempo: r.tempo || 0, dynamics: r.dynamics || 0 };
    if (diff !== 'enjoy' && r.cueCount > 0) a.cues = r.cues || 0;
    return a;
  }
  // results: [{ id, part?, total, tempo, dynamics, cues, cueCount, steady, minutes, perfect? }] in the order played
  function judge(results, o) {
    o = o || {}; const diff = o.diff || 'normal', by = o.by || {};
    const n = results.length; if (!n) return null;
    const mins = results.map(r => (r.minutes > 0 ? r.minutes : 4)), M = sum(mins);
    const tot = results.map(r => clamp(Number(r.total) || 0, 0, 100));
    let acc = 0; const pos = mins.map(m => { const f = (acc + m / 2) / M; acc += m; return f; });
    const w = mins.map(m => Math.sqrt(m)), wq = w.map((x, i) => x * (1 + 0.4 * pos[i])); // 後半の出来は少し重く数える
    const quality = sum(wq.map((x, i) => x * tot[i])) / sum(wq);
    const wMean = sum(w.map((x, i) => x * tot[i])) / sum(w);
    const sd = Math.sqrt(sum(w.map((x, i) => x * (tot[i] - wMean) * (tot[i] - wMean))) / sum(w));
    const even = n > 1 ? clamp(100 - 1.5 * sd - 0.25 * (wMean - Math.min(...tot)), 0, 100) : 100;
    const stead = sum(w.map((x, i) => x * clamp(results[i].steady != null ? results[i].steady : results[i].tempo || 0, 0, 100))) / sum(w);
    const steadiness = 0.5 * even + 0.5 * stead;
    // スタミナ：前半（曲の真ん中が半分より前）と後半の平均を比べる。後半の落ち込みは全部引き、後半の伸びは4割だけ足す
    const ei = [], li = []; pos.forEach((f, i) => (f < 0.5 ? ei : li).push(i));
    const avg = ix => sum(ix.map(i => w[i] * tot[i])) / sum(ix.map(i => w[i]));
    let early = quality, late = quality, stamina = quality;
    if (ei.length && li.length) { early = avg(ei); late = avg(li); stamina = clamp(quality + (late - early) * (late < early ? 1 : 0.4), 0, 100); }
    // 曲目のバラエティ：ちゃんと演奏できた曲（40点以上）だけ数える
    const good = results.filter(r => r.total >= 40).map(r => by[r.id]).filter(Boolean);
    const comps = new Set(good.map(p => p.ck || (p.composer && p.composer.en))), eras = new Set(good.map(p => p.era).filter(Boolean)), kinds = new Set(good.map(p => (workSize(Object.values(by), p) > 1 ? 'movement' : KIND(p))));
    const variety = Math.min(6, Math.max(0, comps.size - 1) * 1.5 + Math.max(0, eras.size - 1) + Math.min(2, Math.max(0, kinds.size - 1)) * 0.75);
    const overall = Math.round(clamp(0.6 * quality + 0.15 * steadiness + 0.25 * stamina + variety, 0, 100));
    const grade = gradeOf(overall, diff), stars = starsOf(overall, diff);
    let bi = 0, wi = 0; tot.forEach((s, i) => { if (s > tot[bi]) bi = i; if (s <= tot[wi]) wi = i; });
    const asp = i => { const a = aspectsOf(results[i], diff), k = Object.keys(a); return { lo: k.reduce((x, y) => (a[y] < a[x] ? y : x), k[0]), hi: k.reduce((x, y) => (a[y] > a[x] ? y : x), k[0]) }; };
    return {
      n, minutes: round1(M), overall, grade, stars, diff, quality: Math.round(quality), steadiness: Math.round(steadiness), stamina: Math.round(stamina), variety: round1(variety),
      early: Math.round(early), late: Math.round(late), spread: round1(sd), composers: comps.size, eras: eras.size,
      perfect: sum(results.map(r => r.perfect || 0)), best: { i: bi, total: tot[bi], aspect: asp(bi).hi }, weakest: { i: wi, total: tot[wi], aspect: asp(wi).lo },
      pieces: results.map((r, i) => ({ i, id: r.id, part: r.part || null, total: tot[i], grade: gradeOf(tot[i], diff), stars: r.stars || 0, pos: round1(pos[i]) })),
    };
  }

  // ---------- review text ----------
  const EN = {
    '公演レビュー': 'Concert Review',
    '総立ちのスタンディングオベーション！ 忘れられない夜になりました。': 'A standing ovation! A night nobody will forget.',
    '大きな拍手に包まれた、すばらしい演奏会でした。': 'A wonderful concert, wrapped in warm applause.',
    '温かい拍手。ところどころに伸びしろの見える、味わいのある夜でした。': 'Warm applause. A characterful evening with room to grow.',
    '最後まで指揮台に立ちきった、勇気ある一夜。次はもっとよくなるはず。': 'You stood on the podium to the very end. It can only get better.',
    '全{n}曲・約{m}分。{first}で幕を開け、{last}で締めくくりました。': '{n} pieces, about {m} minutes: it opened with {first} and closed with {last}.',
    '{first}を演奏した、凝縮された一夜。': 'One piece, {first}: a concentrated evening.',
    '見どころは「{piece}」（{score}点）。{praise}': 'The highlight was "{piece}" ({score} pts). {praise}',
    'テンポの運びがなめらかで、オーケストラが安心してついてきました。': 'The tempo flowed smoothly and the orchestra followed with confidence.',
    '強弱のつけ方が音楽の流れにぴたりと合っていました。': 'Your dynamics matched the flow of the music perfectly.',
    '入りのキューがことごとく決まり、楽器が気持ちよく出てきました。': 'Nearly every cue landed and the sections came in beautifully.',
    '「{piece}」（{score}点）はテンポがゆれた場面がありました。拍の間隔をそろえると、もっと伝わります。': '"{piece}" ({score} pts) had moments where the tempo wavered. Evenly spaced beats will carry further.',
    '「{piece}」（{score}点）は強弱が目安からずれがちでした。振りの大きさで音量を描き分けてみましょう。': '"{piece}" ({score} pts) drifted from the dynamics guide. Try drawing the volume with the size of your stroke.',
    '「{piece}」（{score}点）は入りのキューを取りこぼしました。光った楽器を少し早めに指しましょう。': '"{piece}" ({score} pts) lost some cues. Point at the glowing section a little earlier.',
    '大きな乱れはなく、どの曲も安定していました。': 'No big slips: every piece stayed steady.',
    '後半にかけて集中力が増し、終盤ほど指揮が冴えていました。': 'Your focus grew through the evening and the conducting sharpened toward the end.',
    '終盤に疲れが見えました。長い夜は、後半ほど一振りの丁寧さが大事です。': 'Some fatigue showed late on. In a long evening, care in every stroke matters most in the second half.',
    '最初から最後まで、集中力を保ちました。': 'You kept your focus from the first beat to the last.',
    '曲ごとの出来にばらつきがありました。得意な曲と苦手な曲の差を縮めたいところ。': 'The pieces varied in quality. Closing the gap between favourites and difficult ones is the next goal.',
    '{c}人の作曲家を取り上げた、変化に富んだ曲目でした。': 'A varied programme featuring {c} composers.',
    '「ばっちり」の入りを合わせて{n}回決めました。': 'You gave {n} perfect cues in total.',
    '評価 {grade}（★{stars}／5）· {score}点': 'Rating {grade} (★{stars}/5) · {score} pts',
  };
  const fmt = (s, v) => (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s);
  // sum: judge() の結果。o.T: 翻訳（既定は日本語のまま）、o.name(i): 曲の名前、o.firstLast
  function review(s, o) {
    o = o || {}; const T = o.T || fmt, name = o.name || (i => String(i + 1));
    const lines = [], add = (kind, k, v) => lines.push({ kind, text: T(k, v) });
    const head = { S: '総立ちのスタンディングオベーション！ 忘れられない夜になりました。', A: '大きな拍手に包まれた、すばらしい演奏会でした。', B: '温かい拍手。ところどころに伸びしろの見える、味わいのある夜でした。', C: '最後まで指揮台に立ちきった、勇気ある一夜。次はもっとよくなるはず。' }[s.grade];
    if (s.n >= 2) add('info', '全{n}曲・約{m}分。{first}で幕を開け、{last}で締めくくりました。', { n: s.n, m: Math.round(s.minutes), first: name(0), last: name(s.n - 1) });
    else add('info', '{first}を演奏した、凝縮された一夜。', { first: name(0) });
    const praise = { tempo: 'テンポの運びがなめらかで、オーケストラが安心してついてきました。', dynamics: '強弱のつけ方が音楽の流れにぴたりと合っていました。', cues: '入りのキューがことごとく決まり、楽器が気持ちよく出てきました。' };
    add('praise', '見どころは「{piece}」（{score}点）。{praise}', { piece: name(s.best.i), score: s.best.total, praise: T(praise[s.best.aspect] || praise.tempo) });
    const w = s.weakest;
    const showWeak = s.n === 1 ? w.total < 85 : (w.i !== s.best.i && w.total <= s.best.total - 8 && w.total < 88);
    if (showWeak) {
      const advice = { tempo: '「{piece}」（{score}点）はテンポがゆれた場面がありました。拍の間隔をそろえると、もっと伝わります。', dynamics: '「{piece}」（{score}点）は強弱が目安からずれがちでした。振りの大きさで音量を描き分けてみましょう。', cues: '「{piece}」（{score}点）は入りのキューを取りこぼしました。光った楽器を少し早めに指しましょう。' };
      add('note', advice[w.aspect] || advice.tempo, { piece: name(w.i), score: w.total });
    } else add('praise', '大きな乱れはなく、どの曲も安定していました。');
    if (s.n >= 2) {
      if (s.late - s.early >= 4) add('praise', '後半にかけて集中力が増し、終盤ほど指揮が冴えていました。');
      else if (s.early - s.late >= 6) add('note', '終盤に疲れが見えました。長い夜は、後半ほど一振りの丁寧さが大事です。');
      else add('praise', '最初から最後まで、集中力を保ちました。');
      if (s.spread >= 12) add('note', '曲ごとの出来にばらつきがありました。得意な曲と苦手な曲の差を縮めたいところ。');
    }
    if (s.composers >= 2 && s.variety >= 1.5) add('praise', '{c}人の作曲家を取り上げた、変化に富んだ曲目でした。', { c: s.composers });
    if (s.perfect >= 10) add('praise', '「ばっちり」の入りを合わせて{n}回決めました。', { n: s.perfect });
    return { title: T('公演レビュー'), headline: T(head), lines, rating: T('評価 {grade}（★{stars}／5）· {score}点', { grade: s.grade, stars: s.stars, score: s.overall }) };
  }

  // ---------- saving: kusoge.orchestra.concert ----------
  // { v:1, best:{ <曲目>:{ s（点）, g（0..3 = C..S）, st（★）, n（回数）} }, hist:[{ t, k, ids, s, g, st, diff, min }]（新しい順・最大20）, stats:{ done, s, a, pieces, minutes }, set:{ diff, iv, draft:[曲のキー] } }
  const defStore = () => ({ v: 1, best: {}, hist: [], stats: { done: 0, s: 0, a: 0, pieces: 0, minutes: 0 }, set: { diff: '', iv: null, draft: [] } });
  const isObj = x => x && typeof x === 'object' && !Array.isArray(x);
  const num = (x, a, b) => clamp(Math.round(Number(x) || 0), a, b);
  function readStore(raw) {
    let s = raw; if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { s = null; } }
    const d = defStore(); if (!isObj(s)) return d;
    Object.keys(isObj(s.best) ? s.best : {}).slice(0, 200).forEach(k => { const b = s.best[k]; if (isObj(b)) d.best[k] = { s: num(b.s, 0, 100), g: num(b.g, 0, 3), st: num(b.st, 0, 5), n: num(b.n, 0, 1e6) }; });
    d.hist = (Array.isArray(s.hist) ? s.hist : []).filter(h => isObj(h) && typeof h.k === 'string' && Array.isArray(h.ids)).slice(0, HIST_MAX).map(h => ({ t: Number(h.t) || 0, k: h.k, ids: h.ids.filter(x => typeof x === 'string').slice(0, MAX_ITEMS), s: num(h.s, 0, 100), g: num(h.g, 0, 3), st: num(h.st, 0, 5), diff: ['enjoy', 'normal', 'maestro'].includes(h.diff) ? h.diff : 'normal', min: Number(h.min) || 0 }));
    const st = isObj(s.stats) ? s.stats : {}; Object.keys(d.stats).forEach(k => { d.stats[k] = Math.max(0, Number(st[k]) || 0); });
    const se = isObj(s.set) ? s.set : {};
    d.set.diff = ['enjoy', 'normal', 'maestro'].includes(se.diff) ? se.diff : ''; d.set.iv = typeof se.iv === 'string' ? se.iv : null;
    d.set.draft = (Array.isArray(se.draft) ? se.draft : []).filter(x => typeof x === 'string').slice(0, MAX_ITEMS);
    return d;
  }
  // 終えた演奏会を記録する。戻り値: { store, isBest, prev }
  function record(store, entry) {
    const s = readStore(JSON.stringify(store)), k = entry.k, g = GRADES.indexOf(entry.grade), prev = s.best[k] ? Object.assign({}, s.best[k]) : null;
    const isBest = !prev || entry.score > prev.s;
    s.best[k] = { s: Math.max(prev ? prev.s : 0, entry.score), g: Math.max(prev ? prev.g : 0, g), st: Math.max(prev ? prev.st : 0, entry.stars), n: (prev ? prev.n : 0) + 1 };
    s.hist.unshift({ t: entry.t || 0, k, ids: entry.ids.slice(0, MAX_ITEMS), s: entry.score, g, st: entry.stars, diff: entry.diff || 'normal', min: round1(entry.minutes || 0) });
    s.hist = s.hist.slice(0, HIST_MAX);
    s.stats.done++; if (entry.grade === 'S') s.stats.s++; if (g >= 2) s.stats.a++; s.stats.pieces += entry.ids.length; s.stats.minutes = round1(s.stats.minutes + (entry.minutes || 0));
    return { store: s, isBest, prev };
  }

  return { MAX_ITEMS, MAX_MIN, MAX_MIN_WORK, MIN_INTERVAL_MIN, MIN_INTERVAL_WORK, HIST_MAX, GRADES, CUT, EN, itemKey, parseItem, progKey, catalog, workKey, mvNo, workSize, itemMinutes, totalMinutes, isSingleWork, validate, wholeWork, isNextMovement, autoProgramme, presets, intermissionAt, planEvening, gradeOf, starsOf, judge, review, defStore, readStore, record };
});
