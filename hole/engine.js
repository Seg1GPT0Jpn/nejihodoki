// あなぼこシティ「ミッション」の中身（node でも動く）：12のミッション（街・時間・ライバル・ねらい）・★の計算・コンボ・
// kusoge.hole.x の読み込みと記録。3D の街・あな・AI・オンライン対戦は hole/index.html（このファイルには入っていない）。
// ミッションは「まちめぐり」「CPUとたいせん」「オンライン」とは別の遊びで、街・時間・ライバルの数が決まっている（だれでも同じ条件）。
// ランキング（best.maxPts）・実績・ベストには入らない（KoboGame には practice で報告）。保存は端末だけの kusoge.hole.x。
// 読み込み：ブラウザでは <script src="engine.js"></script>（window.HoleEngine）、node では require('./hole/engine.js')。
//   E.MISSIONS（12 = 3ワールド×4。{ id, index, world, city（街の id）, time, rivals, diff, kind, target?, stars:[★1,★2,★3], name, desc }）
//   kind：pct = 街ののみこみ率（%）　combo = 連続でのみこんだ最大数　kills = のみこんだライバルの数　size = あなの最大の直径（m）
//         fast = 目標の率に着くまでが速い（のこり秒数。着かなければ 0。着いたら その場で終わる。target = 目標の%）
//   st = はじめの大きさ（段。ライバルより大きく始めるミッション）、near = ライバルが近くから始まる
//   E.metric(i, stats) → ねらいの数（大きいほど良い）、E.starsFor(i, metric) → 0〜3、E.progress(i, metric) → 0〜1（★3まで）
//   E.newCombo() / E.comboHit(c, t) → いまのコンボ数 / E.comboLive(c, t) → いま続いているコンボ数（切れたら 0）
//   E.readX(raw) → { v:1, s:[星×12], b:[ベスト×12], c }（こわれた保存でも読める）、E.open(x, i)、E.recordMission(x, i, stars, metric) → 更新したか、
//   E.recordCombo(x, n) → 更新したか、E.coinsFor(stars, firstClear)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HoleEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const COMBO_WINDOW = 1.6; // 秒：この間に次をのみこむとコンボが続く
  const KINDS = {
    pct: { unit: '%', label: 'のみこみ率' },
    combo: { unit: '', label: 'コンボ' },
    kills: { unit: '', label: 'ライバル' },
    size: { unit: 'm', label: 'サイズ' },
    fast: { unit: '秒', label: 'のこり' },
  };
  const MISSIONS = [
    { world: 0, city: 'fujisawa', time: 90, rivals: 0, diff: 0.3, kind: 'pct', stars: [0.5, 1, 1.6], name: 'はじめの ひとのみ', desc: '時間は90秒。ちかくのものから のみこんで、街をどれだけ のみこめるか。' },
    { world: 0, city: 'shonandai', time: 70, rivals: 0, diff: 0.3, kind: 'combo', stars: [3, 5, 8], name: 'つづけて パクパク', desc: '1.6秒いないに つぎをのみこむと コンボがつづく。とぎれさせずに ならんだものを のみこもう。' },
    { world: 0, city: 'shonanhs', time: 75, rivals: 2, diff: 0.35, kind: 'kills', stars: [1, 2, 3], st: 6, near: 1, name: 'ライバルを のみこめ', desc: '大きくなって、小さいライバルの あなを のみこもう。' },
    { world: 0, city: 'kamiooka', time: 90, rivals: 0, diff: 0.3, kind: 'fast', target: 0.5, stars: [5, 20, 40], name: 'いそげ！ ダッシュ', desc: '街の0.5%を のみこんだら クリア。のこり時間が多いほど高評価。' },
    { world: 1, city: 'shibuya', time: 80, rivals: 0, diff: 0.3, kind: 'pct', stars: [0.3, 0.6, 1], name: '交差点の 大そうじ', desc: '人も車も いっぱいの街で、80秒でどこまで のみこめるか。' },
    { world: 1, city: 'asakusa', time: 90, rivals: 1, diff: 0.35, kind: 'size', stars: [16.4, 26.8, 36.8], name: 'どんどん 大きく', desc: 'あなの直径をのばそう。のみこむほど大きくなる。ライバルにも気をつけて。' },
    { world: 1, city: 'shinjuku', time: 90, rivals: 2, diff: 0.4, kind: 'combo', stars: [4, 7, 11], name: 'ビル街の れんぞく', desc: 'ライバルがじゃまをする中で、コンボを伸ばそう。' },
    { world: 1, city: 'yokohama', time: 100, rivals: 0, diff: 0.3, kind: 'fast', target: 2, stars: [10, 30, 55], name: '港までダッシュ', desc: '街の2%を のみこんだら クリア。ひろい港を走りぬけよう。' },
    { world: 2, city: 'dotonbori', time: 90, rivals: 4, diff: 0.55, kind: 'kills', stars: [1, 2, 4], st: 6, near: 1, name: 'ネオンの 大乱戦', desc: '4つのライバルがいる。大きくなって のみこんでしまおう。' },
    { world: 2, city: 'osakajo', time: 100, rivals: 2, diff: 0.5, kind: 'pct', stars: [1, 2, 3.5], name: 'お城の まわりを まるごと', desc: 'ひろい公園とお堀の街。100秒で、のみこめるだけ のみこめ。' },
    { world: 2, city: 'kyoto', time: 100, rivals: 3, diff: 0.55, kind: 'combo', stars: [15, 35, 70], name: '古都の ながい れんぞく', desc: 'せまい道に ものがならぶ。ライバルをよけて コンボをつなげ。' },
    { world: 2, city: 'nagoya', time: 110, rivals: 3, diff: 0.6, kind: 'size', stars: [22.8, 36.8, 50.8], name: 'お城より 大きく', desc: '110秒で、どこまで大きくなれるか。のみこむほど あなは広がる。' },
  ];
  MISSIONS.forEach((m, i) => { m.index = i; m.id = 'm' + (i + 1); });
  const N = MISSIONS.length;
  const info = i => MISSIONS[i] || null;

  // stats：{ pct, combo, kills, size, fastLeft }。fastLeft = 目標に着いたときののこり秒（着いていなければ 0）
  function metric(i, s) {
    const m = MISSIONS[i]; if (!m || !s) return 0;
    const v = m.kind === 'pct' ? s.pct : m.kind === 'combo' ? s.combo : m.kind === 'kills' ? s.kills : m.kind === 'size' ? s.size : s.fastLeft;
    return isFinite(v) && v > 0 ? Math.round(v * 10) / 10 : 0;
  }
  function starsFor(i, v) {
    const m = MISSIONS[i]; if (!m || !(v > 0)) return 0;
    let n = 0; for (const t of m.stars) if (v >= t) n++;
    return n;
  }
  // ★3 までの進み具合（0〜1）
  function progress(i, v) { const m = MISSIONS[i]; return m && v > 0 ? Math.min(1, v / m.stars[2]) : 0; }
  // fast：目標の%に着いたか
  const goalReached = (i, pct) => { const m = MISSIONS[i]; return !!m && m.kind === 'fast' && pct >= m.target; };

  // ---- コンボ：1.6秒いないに のみこむとつづく（時刻 t は秒）
  const newCombo = () => ({ n: 0, last: -99, max: 0 });
  function comboHit(c, t) {
    c.n = t - c.last <= COMBO_WINDOW && c.n > 0 ? c.n + 1 : 1; c.last = t;
    if (c.n > c.max) c.max = c.n;
    return c.n;
  }
  const comboLive = (c, t) => (c.n > 0 && t - c.last <= COMBO_WINDOW ? c.n : 0);

  const coinsFor = (stars, firstClear) => stars * 20 + 5 + (firstClear ? 40 : 0);

  // ---- kusoge.hole.x（端末だけ・同期しない・ランキングに入らない）
  function blankX() { return { v: 1, s: new Array(N).fill(0), b: new Array(N).fill(0), c: 0 }; }
  function readX(raw) {
    const o = blankX();
    try {
      const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!d || typeof d !== 'object' || Array.isArray(d)) return o;
      if (Array.isArray(d.s)) for (let i = 0; i < N; i++) { const n = d.s[i] | 0; o.s[i] = n >= 1 && n <= 3 ? n : 0; }
      if (Array.isArray(d.b)) for (let i = 0; i < N; i++) { const n = +d.b[i]; o.b[i] = isFinite(n) && n > 0 && n < 100000 ? Math.round(n * 10) / 10 : 0; }
      const c = d.c | 0; o.c = c > 0 && c < 100000 ? c : 0;
    } catch (e) { /* こわれた保存は空として扱う */ }
    return o;
  }
  // 前のミッションを★1つ以上でクリアすると次が開く（最初は開いている）
  const open = (x, i) => i === 0 || (i > 0 && i < N && ((x.s[i - 1] | 0) >= 1));
  const totalStars = x => x.s.reduce((a, b) => a + b, 0);
  // ★・ベストは良くなったときだけ上書き。x を直接書きかえて、更新したかを返す
  function recordMission(x, i, stars, v) {
    if (!MISSIONS[i]) return false;
    let ch = false;
    if (stars > (x.s[i] || 0)) { x.s[i] = stars; ch = true; }
    if (v > (x.b[i] || 0)) { x.b[i] = Math.round(v * 10) / 10; ch = true; }
    return ch;
  }
  function recordCombo(x, n) { if (n > (x.c || 0)) { x.c = Math.min(99999, n | 0); return true; } return false; }

  return { MISSIONS, KINDS, COMBO_WINDOW, info, metric, starsFor, progress, goalReached, newCombo, comboHit, comboLive, coinsFor, blankX, readX, open, totalStars, recordMission, recordCombo };
});
