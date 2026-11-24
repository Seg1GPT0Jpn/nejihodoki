// 貿易ゲームの「ルールの一部」と「ミッション」の中身（node でも動く）。画面・生産・交渉・CPU の進行は trade/index.html。
// ・価格の見直し（reviewPrice）：5分ごとに国連が値段を見直す。むずかしさ（DIFFS）で下がり幅が変わる。ふつう（n）は今までと同じ。
//   ふつう以外の値段は、できごと「ブーム」で基準より上がることがあり、見直しのたびに100ずつ基準へ戻る。
// ・できごと（EVENTS）：ブーム・災害・技術協力・航路の混雑・フェアトレード。planEvents が時刻と乱数だけを決める（国や製品は画面が選ぶ）。
//   はじめから決まっている「国連の援助（12分）」「資源の発見（24分）」は今までどおり画面にある。
// ・ミッション（MISSIONS）：8つ（2ワールド×4）。国のタイプ・むずかしさ・ねらいが決まった別の遊び。
//   ねらい（need）をぜんぶ満たすと★1、s2 も満たすと★2、s3 も満たすと★3。ねらいは { m: 数え方, v: 値 }（rank だけ「以内」、あとは「以上」）。
//   数え方（summary）：x＝お金の倍率（おわり÷はじめ）　rank＝8か国での順位　deals＝成立した取引の数　kinds＝2個以上輸出した製品の種類
//   gifts＝産油国・途上国にお金をもらわずにゆずった回数
// ・保存 kusoge.trade.x = { v:1, s:[8ミッションの星0〜3], b:[ベストの倍率×10 ×8] }（端末だけ・同期しない・ランキングにも実績にも入らない）。
//   今までの kusoge.trade.save（best＝最後のお金の最高）の意味は変えていない。ミッションとかんたんは save に入れない。
// 読み込み：ブラウザでは <script src="engine.js"></script>（window.TradeEngine）、node では require('./trade/engine.js')。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.TradeEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const GAME_MIN = 40, SHEET = 600;
  const r100 = n => Math.round(n / 100) * 100;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  function mkRng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }

  // むずかしさ：greed＝CPUの「もうけたい額」にたす（かんたんは交渉がやさしい）／drop＝値下がり幅の倍／events＝ランダムなできごとの数
  const DIFFS = {
    e: { id: 'e', ja: 'かんたん', greed: -100, drop: 0.5, events: 1, practice: true },
    n: { id: 'n', ja: 'ふつう', greed: 0, drop: 1, events: 2, practice: false },
    h: { id: 'h', ja: 'むずかしい', greed: 150, drop: 1.5, events: 3, practice: false },
  };
  const diffOf = id => DIFFS[id] || DIFFS.n;

  // 5分ごとの値段の見直し。sh＝{ base, floor, drop, limit }、period＝この5分に売れた数、mult＝むずかしさの下がり幅の倍
  function dropBy(sh, mult) { return mult === 1 ? sh.drop : Math.max(100, r100(sh.drop * mult)); }
  function reviewPrice(sh, price, period, mult) {
    if (sh.drop && period >= sh.limit && price > sh.floor) return { price: Math.max(sh.floor, price - dropBy(sh, mult || 1)), kind: 'down' };
    if (price > sh.base) return { price: Math.max(sh.base, price - 100), kind: 'decay' };
    if (sh.drop && period <= Math.floor(sh.limit / 3) && price < sh.base) return { price: Math.min(sh.base, price + 100), kind: 'up' };
    return { price, kind: 'same' };
  }
  const BOOM = 200;   // ブームで基準より上がる額の上限
  const boomPrice = (base, price) => Math.min(base + BOOM, price + BOOM);

  // ---------- できごと ----------
  // kind は画面のカードの色：rise（よいニュース）crash（わるいニュース）aid（援助）find（発見）
  const EVENTS = [
    { id: 'boom', kind: 'rise' },     // 新しい需要：ある製品の値段が +200（見直しのたびに100ずつもどる）
    { id: 'storm', kind: 'crash' },   // 災害：ある国の資源が減る
    { id: 'tech', kind: 'aid' },      // 技術協力：加工技術がない産油国・途上国に加工技術がとどく
    { id: 'route', kind: 'crash' },   // 航路の混雑：ある国との取引に5分間、輸送費がかかる
    { id: 'fair', kind: 'rise' },     // フェアトレード・フェア：衣類を5分間、1個あたり +100 で買い取る
  ];
  const EVENT_IDS = EVENTS.map(e => e.id);
  const ROUTE_FEE = 200, ROUTE_MIN = 5, FAIR_BONUS = 100, FAIR_MIN = 5;
  function planEvents(rng, diff, on) {
    if (on === false) return [];
    const n = clamp(diffOf(diff).events, 0, EVENT_IDS.length);
    if (!n) return [];
    const ids = EVENT_IDS.slice();
    for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); const t = ids[i]; ids[i] = ids[j]; ids[j] = t; }
    const lo = 6, hi = 35, span = (hi - lo) / n;
    return ids.slice(0, n).map((id, i) => {
      let at = lo + span * i + rng() * span * 0.8;
      [12, 24].forEach(f => { if (Math.abs(at - f) < 1.5) at += 2; });   // 国連の援助・資源の発見とかさなりにくく
      return { at: Math.round(Math.min(at, 36) * 10) / 10, id, r: rng(), r2: rng() };
    }).sort((a, b) => a.at - b.at);
  }

  // ---------- ミッション ----------
  const C = (m, v) => ({ m, v });
  const MISSIONS = [
    { id: 'first', world: 0, who: 'A', diff: 'e', ja: 'はじめの輸出', desc: 'かんたんな先進国で、製品をつくって世界市場に売る。お金を増やそう。',
      need: [C('x', 4)], s2: [C('x', 10)], s3: [C('x', 20)] },
    { id: 'mix', world: 0, who: 'B', diff: 'n', ja: 'たよらない国', desc: '新興国で、いろいろな製品を輸出する。ひとつの製品にたよらないと、値下がりにも強い。',
      need: [C('x', 4), C('kinds', 2)], s2: [C('x', 10), C('kinds', 3)], s3: [C('x', 20), C('kinds', 4)] },
    { id: 'oil', world: 0, who: 'C', diff: 'n', ja: '資源の国の知恵', desc: '産油国は資源がたっぷり。でも加工する技術がない。技術を手に入れて、資源を製品に変えよう。',
      need: [C('x', 8)], s2: [C('x', 25)], s3: [C('x', 60)] },
    { id: 'catch', world: 0, who: 'D', diff: 'n', ja: '途上国の追い上げ', desc: '資源も技術もお金も少ない途上国。交渉と援助をいかして、順位を上げよう。',
      need: [C('rank', 4)], s2: [C('rank', 3)], s3: [C('rank', 2)] },
    { id: 'team', world: 1, who: 'random', diff: 'n', ja: '協力の輪', desc: '届いた提案を受け、自分からも交渉して、たくさん取引する。取引はお互いの得になる。',
      need: [C('deals', 6), C('x', 3)], s2: [C('deals', 10), C('x', 8)], s3: [C('deals', 14), C('x', 15)] },
    { id: 'share', world: 1, who: 'A', diff: 'n', ja: '分かち合い', desc: '先進国が、産油国や途上国にお金をもらわずに道具や資源をゆずる。それでも上位に残れるかな。',
      need: [C('gifts', 1), C('rank', 5)], s2: [C('gifts', 2), C('rank', 4)], s3: [C('gifts', 3), C('rank', 3)] },
    { id: 'slump', world: 1, who: 'random', diff: 'h', ja: '値下がりの嵐', desc: '値下がりもできごとも多いむずかしい世界。ひとつの製品に集中しすぎないで切りぬけよう。',
      need: [C('x', 3)], s2: [C('x', 8)], s3: [C('x', 15)] },
    { id: 'top', world: 1, who: 'B', diff: 'h', ja: '世界一の貿易国', desc: 'むずかしい世界で、新興国から1位をねらう。',
      need: [C('rank', 3)], s2: [C('rank', 2)], s3: [C('rank', 1)] },
  ];
  const WORLDS = [{ id: 0, ja: 'はじめての貿易' }, { id: 1, ja: 'むずかしい世界' }];
  // ねらいの文（画面で t() に通す）
  const COND_JA = {
    x: 'お金が、はじめの ×{v} 以上', rank: '8か国で {v}位以内', deals: '取引を {v} 回以上', kinds: '{v}種類以上の製品を輸出',
    gifts: '産油国・途上国に {v} 回、ゆずる',
  };
  const condOk = (c, s) => c.m === 'rank' ? (s.rank || 99) <= c.v : (s[c.m] || 0) >= c.v;
  function evalMission(i, s) {
    const m = MISSIONS[i];
    if (!m || !s) return null;
    const all = k => m[k].every(c => condOk(c, s));
    const cleared = all('need');
    const stars = !cleared ? 0 : all('s3') ? 3 : all('s2') ? 2 : 1;
    const conds = k => m[k].map(c => ({ m: c.m, v: c.v, ok: condOk(c, s) }));
    return { cleared, stars, need: conds('need'), s2: conds('s2'), s3: conds('s3') };
  }
  // 遊んでいる最中の進み具合（0〜1）：次の★までの近さ
  function progressOf(i, s) {
    const m = MISSIONS[i], ev = evalMission(i, s);
    if (!m || !ev) return 0;
    const tier = ev.stars >= 3 ? 's3' : ev.stars === 2 ? 's3' : ev.stars === 1 ? 's2' : 'need';
    return Math.round(m[tier].reduce((a, c) => {
      const cur = s[c.m] || 0;
      const f = c.m === 'rank' ? (cur && cur <= c.v ? 1 : c.v / Math.max(c.v, cur || 8)) : clamp(cur / c.v, 0, 1);
      return Math.min(a, f);
    }, 1) * 100) / 100;
  }

  // ---------- 格差（ジニ係数） ----------
  function gini(xs) {
    const a = xs.slice().sort((p, q) => p - q), n = a.length;
    let s = 0, w = 0;
    a.forEach((x, i) => { s += x; w += (2 * (i + 1) - n - 1) * x; });
    return s ? w / (n * s) : 0;
  }

  // ---------- 保存 kusoge.trade.x ----------
  const N = MISSIONS.length;
  const int = (v, lo, hi) => { v = Math.floor(+v); return isFinite(v) ? clamp(v, lo, hi) : lo; };
  function readX(raw) {
    let o = raw;
    if (typeof raw === 'string') { try { o = JSON.parse(raw); } catch (e) { o = null; } }
    if (!o || typeof o !== 'object') o = {};
    const s = [], b = [];
    for (let i = 0; i < N; i++) {
      s.push(Array.isArray(o.s) ? int(o.s[i], 0, 3) : 0);
      b.push(Array.isArray(o.b) ? int(o.b[i], 0, 1e6) : 0);
    }
    return { v: 1, s, b };
  }
  function recordX(x, i, stars, x10) {
    const r = readX(x);
    if (i < 0 || i >= N) return r;
    r.s[i] = Math.max(r.s[i], int(stars, 0, 3));
    r.b[i] = Math.max(r.b[i], int(x10, 0, 1e6));
    return r;
  }
  const isOpen = (x, i) => i >= 0 && i < N && (i === 0 || readX(x).s[i - 1] >= 1);
  const totalStars = x => readX(x).s.reduce((a, b) => a + b, 0);

  return { GAME_MIN, SHEET, mkRng, DIFFS, diffOf, reviewPrice, dropBy, boomPrice, BOOM, EVENTS, EVENT_IDS, ROUTE_FEE, ROUTE_MIN, FAIR_BONUS, FAIR_MIN, planEvents,
    MISSIONS, WORLDS, COND_JA, evalMission, progressOf, gini, readX, recordX, isOpen, totalStars };
});
