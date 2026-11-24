// ゲートランナーの「ミッション」の中身（node でも動く）：12のミッション（決まった部隊・コース・ねらい）・★の計算・端末だけの保存 kusoge.gates.x の読み込み。
// 3D の道・敵・基地は gates/index.html。ミッションは「ふつうの出撃」（ステージ・基地・英雄の育成＝ランキング）とは別の遊び。
// 基地や英雄の育成に関係なく、ミッションごとに決まった部隊で出撃する（だれでも同じ条件）。ランキング・実績には入らない（KoboGame には practice で報告）。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.GatesEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // world：0=昼 1=夕方 2=夜（空の色）
  // stage：敵とコースの強さ（ふつうのステージ番号と同じ式）。seed：コースの乱数の種（毎回同じコース）
  // n：はじめの人数　tier：武器 0〜3（0=ハンドガン…）　team：英雄の id（最大3）　hl：英雄のLv　bl：[兵舎のLv, 研究所のLv, 武器庫のLv]
  // mods：zc=ザコの数の倍率　lm=コースの長さの倍率　bh=ボスの体力の倍率　nh=英雄なし（ゲートを選ぶ力だけで勝負）
  // goal：★2 と ★3 のねらい。k：surv=ボスを倒したとき生き残っている人数　peak=いちばん多いときの人数　kills=倒した敵の数
  //   time=クリアまでの秒数（小さいほど良い）　lost=失った人数（小さいほど良い）　combo=連続で倒した最大コンボ。v=[★2, ★3]
  const MISSIONS = [
    { id: 'm1', world: 0, stage: 1, seed: 1101, name: 'はじめの一歩', desc: 'ゲートで仲間を増やして、ボスまで走りぬけよう。',
      n: 10, tier: 0, team: ['ren', 'mina'], hl: 1, bl: [1, 1, 1], mods: {}, goal: { k: 'surv', v: [100, 600] } },
    { id: 'm2', world: 0, stage: 2, seed: 1102, name: 'ゲートの目利き', desc: 'いい数字のゲートをえらんで、部隊をふくらませよう。',
      n: 14, tier: 1, team: ['ren', 'bulk'], hl: 2, bl: [2, 2, 2], mods: {}, goal: { k: 'peak', v: [150, 500] } },
    { id: 'm3', world: 0, stage: 2, seed: 1103, name: 'ゾンビの大群', desc: 'いつもの2倍の群れ！ 撃って撃って撃ちまくれ。',
      n: 16, tier: 1, team: ['ren', 'bulk', 'mina'], hl: 2, bl: [2, 2, 3], mods: { zc: 2 }, goal: { k: 'kills', v: [150, 240] } },
    { id: 'm4', world: 0, stage: 4, seed: 1104, name: '中ボスの門', desc: '中ボスとボスが待っている。ほとんど減らさずに突破しよう。',
      n: 14, tier: 1, team: ['ren', 'mina', 'shizuku'], hl: 3, bl: [2, 2, 3], mods: {}, goal: { k: 'lost', v: [150, 70] } },
    { id: 'm5', world: 1, stage: 5, seed: 1105, name: '夕やけの急行', desc: '道は短い。ボスまで一直線、はやさがいのち。',
      n: 20, tier: 1, team: ['ren', 'bulk', 'sora'], hl: 3, bl: [3, 3, 3], mods: { lm: 0.55 }, goal: { k: 'time', v: [60, 42] } },
    { id: 'm6', world: 1, stage: 6, seed: 1106, name: 'ひとりぼっち', desc: '英雄はお休み。ゲートと銃だけで勝ちぬこう。',
      n: 20, tier: 2, team: [], hl: 1, bl: [3, 3, 5], mods: { nh: 1 }, goal: { k: 'surv', v: [80, 400] } },
    { id: 'm7', world: 1, stage: 7, seed: 1107, name: '連続キル', desc: '倒しつづけるとコンボが伸びる。途切れさせずに大物を狙え。',
      n: 24, tier: 2, team: ['ren', 'bulk', 'gou'], hl: 4, bl: [3, 3, 5], mods: { zc: 1.4 }, goal: { k: 'combo', v: [90, 200] } },
    { id: 'm8', world: 1, stage: 8, seed: 1108, name: '岩のボス', desc: 'ボスの体力は2倍。時間をかけすぎると押しつぶされる。はやく倒そう。',
      n: 26, tier: 2, team: ['ren', 'shizuku', 'sora'], hl: 5, bl: [4, 4, 5], mods: { bh: 2 }, goal: { k: 'time', v: [105, 88] } },
    { id: 'm9', world: 2, stage: 9, seed: 1109, name: '夜のゲート街', desc: '暗い道にゲートがならぶ。人数をどこまで伸ばせるか。',
      n: 30, tier: 2, team: ['ren', 'mina', 'bulk'], hl: 6, bl: [4, 4, 5], mods: {}, goal: { k: 'peak', v: [300, 700] } },
    { id: 'm10', world: 2, stage: 9, seed: 1110, name: '闇の突撃', desc: '短い道に敵がぎっしり。倒した数をきそおう。',
      n: 60, tier: 3, team: ['ren', 'bulk', 'sora'], hl: 7, bl: [6, 6, 7], mods: { lm: 0.7, zc: 1.5 }, goal: { k: 'kills', v: [260, 400] } },
    { id: 'm11', world: 2, stage: 9, seed: 1111, name: '英雄なしの夜', desc: '英雄なしで夜をこえる。生き残りが多いほど高評価。',
      n: 150, tier: 3, team: [], hl: 1, bl: [7, 7, 7], mods: { nh: 1 }, goal: { k: 'surv', v: [60, 250] } },
    { id: 'm12', world: 2, stage: 12, seed: 1112, name: '最後のボス', desc: '最強のボス。すべてを使って、最短で倒せ！',
      n: 60, tier: 3, team: ['ren', 'mina', 'shizuku'], hl: 10, bl: [7, 7, 7], mods: { bh: 1.4 }, goal: { k: 'time', v: [120, 90] } },
  ];
  MISSIONS.forEach((m, i) => { m.index = i; });
  const byId = id => MISSIONS.find(m => m.id === id) || null;
  const GOAL_KINDS = ['surv', 'peak', 'kills', 'time', 'lost', 'combo'];
  // 小さいほど良いねらい
  const lowerBetter = k => k === 'time' || k === 'lost';

  // r：結果 { won, n(生き残り), peak, kills, t(秒), lost, combo }
  function metric(m, r) {
    const k = m.goal.k;
    return k === 'surv' ? r.n : k === 'peak' ? r.peak : k === 'kills' ? r.kills : k === 'time' ? r.t : k === 'lost' ? r.lost : r.combo;
  }
  // ねらい i（0=★2・1=★3）を満たしているか
  function goalMet(m, r, i) {
    if (!r || !r.won) return false;
    const v = m.goal.v[i], x = metric(m, r);
    return lowerBetter(m.goal.k) ? x <= v : x >= v;
  }
  function starsFor(m, r) {
    if (!r || !r.won) return 0;
    return goalMet(m, r, 1) ? 3 : goalMet(m, r, 0) ? 2 : 1;
  }
  // 走っている途中の進み具合（0〜1）：ねらい（★3 を目指す）に対して
  function fraction(m, r) {
    const v = m.goal.v[1], x = metric(m, r);
    if (lowerBetter(m.goal.k)) return v > 0 ? Math.max(0, Math.min(1, 1 - (x - v) / Math.max(1, v * 2))) : 0;
    return v > 0 ? Math.max(0, Math.min(1, x / v)) : 0;
  }
  // 新しく増えた★の数だけコインがもらえる（1つ目の★だけ多め）。★が増えなければ 0
  function coinsFor(m, oldStars, newStars) {
    let c = 0;
    for (let s = oldStars + 1; s <= newStars; s++) c += (s === 1 ? 40 : 25) * (1 + m.world);
    return c;
  }

  // ---------- 端末だけの保存 kusoge.gates.x ----------
  // { v:1, s:[ミッションごとの★0〜3], t:[クリアの最短秒（なければ 0）], c:最後に遊んだミッションの id }。
  // ふつうの保存（kusoge.gates.save・ランキングの best）には触らない。
  function blankX() { return { v: 1, s: MISSIONS.map(() => 0), t: MISSIONS.map(() => 0), c: null }; }
  function loadX(raw) {
    const o = blankX();
    try {
      const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!d || typeof d !== 'object') return o;
      if (Array.isArray(d.s)) for (let i = 0; i < o.s.length; i++) { const n = d.s[i] | 0; o.s[i] = n >= 1 && n <= 3 ? n : 0; }
      if (Array.isArray(d.t)) for (let i = 0; i < o.t.length; i++) { const n = +d.t[i]; o.t[i] = n > 0 && n < 36000 ? Math.round(n * 10) / 10 : 0; }
      if (typeof d.c === 'string' && byId(d.c)) o.c = d.c;
    } catch (e) { /* こわれた保存は空として扱う */ }
    return o;
  }
  function unlocked(x, i) { return i === 0 || (x.s[i - 1] || 0) >= 1; }
  function totalStars(x) { return x.s.reduce((a, b) => a + b, 0); }
  // ★・最短秒を上書きするのは良くなったときだけ。x を直接書きかえて、{ stars:増えたか, time:最短が出たか } を返す
  function record(x, id, stars, secs) {
    const m = byId(id); if (!m) return { stars: false, time: false };
    const out = { stars: false, time: false };
    if (stars > (x.s[m.index] || 0)) { x.s[m.index] = stars; out.stars = true; }
    if (stars >= 1 && secs > 0 && (!x.t[m.index] || secs < x.t[m.index])) { x.t[m.index] = Math.round(secs * 10) / 10; out.time = true; }
    x.c = id;
    return out;
  }

  return { MISSIONS, GOAL_KINDS, byId, lowerBetter, metric, goalMet, starsFor, fraction, coinsFor, blankX, loadX, unlocked, totalStars, record };
});
