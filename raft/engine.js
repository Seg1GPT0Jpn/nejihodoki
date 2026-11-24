// いかだ暮らしの「航海」の中身（node でも動く）：8つの航海（決まった始まり方・ねらい・日数の上限・★の基準）・進み具合の判定・★の計算・
// 端末だけの保存 kusoge.raft.x の読み込み。海・いかだ・戦いは raft/index.html（3D）。
// 航海は「ふつうのいかだ」（最長の生存日数＝ランキング）とは別の遊び。ランキング・実績には入らない（KoboGame には practice で報告）。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.RaftEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  // goal の条件（ぜんぶ満たすと達成）。t：
  //   day=N日目を迎える　caught=漂流物を拾った数　sharks=サメを追い払った数　raidsWon=海賊を撃退した回数　expWon=遠征の成功
  //   rescued=助けた漂流者　crew=今のクルー数　tiles=床の枚数　capLv=船長Lv　fac=施設 f がLv n 以上（f は施設の id）
  // limit：この日までにねらいを果たす（これを過ぎると失敗）。null なら期限なし（生き延びるのがねらい）。
  // metric：★の基準になる数。day=達成した日　tilesLost=沈んだ床の数　lost=失ったクルーの数。par=[★3 の上限, ★2 の上限]（それより大きいと★1）。
  // start：始まり方。lv=船長Lv　res=資源（足し算）　facs=[施設, Lv, 床のキー]　crew=[役割…]　up=強化　tiles=足す床 [i,j]
  // mods：海のむずかしさ。shark=サメが出る間隔の割り（2なら2倍の頻度・0.5なら半分）　storm=嵐の確率に足す　raidFrom=海賊が来はじめる日（99なら来ない）　raidMul=海賊の強さ　cast=漂流者の出る間隔の割り
  const VOYAGES = [
    { id: 'v1', name: 'はじめての漂流', desc: 'フックで漂流物をどんどん拾って、いかだの暮らしになれよう。',
      goal: [{ t: 'caught', n: 16 }], limit: 4, metric: 'day', par: [2, 3],
      start: {}, mods: { raidFrom: 3 } },
    { id: 'v2', name: 'くらしの土台', desc: '水・魚・料理。生きていくための3つの施設を建てよう。',
      goal: [{ t: 'fac', f: 'purifier', n: 1 }, { t: 'fac', f: 'fishing', n: 1 }, { t: 'fac', f: 'grill', n: 1 }], limit: 4, metric: 'day', par: [1, 2],
      start: { res: { wood: 6, plastic: 4, cloth: 2 } }, mods: { raidFrom: 3 } },
    { id: 'v3', name: 'サメの海', desc: 'サメがたくさん寄ってくる海。砲台と射手で守りながら追い払おう。',
      goal: [{ t: 'sharks', n: 8 }], limit: 6, metric: 'tilesLost', par: [1, 3],
      start: { lv: 3, res: { wood: 14, scrap: 6, plastic: 4 }, crew: ['射手', '戦士'], facs: [['ballista', 1, '0,-1']] }, mods: { shark: 3.5, raidFrom: 99 } },
    { id: 'v4', name: '嵐の季節', desc: '毎日のように嵐がくる。床をこまめに直して、8日目の朝をむかえよう。',
      goal: [{ t: 'day', n: 8 }], limit: null, metric: 'tilesLost', par: [0, 3],
      start: { lv: 2, res: { wood: 24, plastic: 6, scrap: 3 }, crew: ['技師'], facs: [['workbench', 1, '1,0']] }, mods: { storm: 0.5, shark: 0.5, raidFrom: 99 } },
    { id: 'v5', name: '海賊の海', desc: '1日目の夜から海賊が来る。陣形と砲台で3回撃退しよう。',
      goal: [{ t: 'raidsWon', n: 3 }], limit: 7, metric: 'lost', par: [0, 1],
      start: { lv: 3, res: { wood: 16, scrap: 6, cloth: 3 }, crew: ['戦士', '戦士', '射手'], facs: [['ballista', 1, '0,-1'], ['lookout', 1, '-1,0']] }, mods: { raidFrom: 1, raidMul: 1.15 } },
    { id: 'v6', name: 'にぎやかな船', desc: '漂流者をたくさん助けて、床を広げ、5人のクルーの船にしよう。',
      goal: [{ t: 'crew', n: 5 }, { t: 'tiles', n: 14 }], limit: 9, metric: 'day', par: [5, 7],
      start: { lv: 3, res: { wood: 30, plastic: 14, cloth: 8, meal: 6, water: 10 }, facs: [['quarters', 2, '-1,1']], crew: ['漁師'] }, mods: { cast: 2.2, shark: 0.6, raidFrom: 4 } },
    { id: 'v7', name: '遠い島へ', desc: '帆を張って、島への遠征を2回成功させよう。メンバー選びが大事。',
      goal: [{ t: 'expWon', n: 2 }], limit: 10, metric: 'day', par: [5, 8],
      start: { lv: 4, res: { wood: 20, cloth: 6, meal: 8, water: 12, fish: 4 }, crew: ['船乗り', '戦士', '射手'], facs: [['quarters', 1, '-1,1'], ['sail', 1, '1,1']] }, mods: { shark: 0.7, raidFrom: 4 } },
    { id: 'v8', name: '海の主', desc: '嵐も海賊もサメも。クルーを4人以上まもって、15日目の朝をむかえよう。',
      goal: [{ t: 'day', n: 15 }, { t: 'crew', n: 4 }], limit: null, metric: 'lost', par: [0, 2],
      start: { lv: 5, res: { wood: 40, plastic: 20, cloth: 10, scrap: 12, gear: 2, meal: 10, water: 16 }, crew: ['戦士', '射手', '漁師', '技師'],
        facs: [['quarters', 2, '-1,1'], ['ballista', 2, '0,-1'], ['lookout', 1, '-1,0'], ['purifier', 1, '0,0'], ['fishing', 1, '1,-1']] }, mods: { shark: 1.3, storm: 0.2, raidMul: 1.1 } },
  ];
  for (const v of VOYAGES) v.index = VOYAGES.indexOf(v);
  function byId(id) { return VOYAGES.find(v => v.id === id) || null; }

  // snap：{ day, caught, sharks, raidsWon, expWon, rescued, crew, tiles, capLv, fac:{id:最大Lv}, tilesLost, lost }
  function condValue(c, snap) {
    if (c.t === 'fac') return (snap.fac && snap.fac[c.f]) || 0;
    const v = snap[c.t === 'tiles' ? 'tiles' : c.t];
    return typeof v === 'number' && isFinite(v) ? v : 0;
  }
  function progress(v, snap) {
    return v.goal.map(c => { const cur = condValue(c, snap); return { t: c.t, f: c.f || null, v: Math.min(cur, c.n), cur, need: c.n, done: cur >= c.n }; });
  }
  function goalDone(v, snap) { return progress(v, snap).every(p => p.done); }
  // 0〜1：ぜんぶの条件の平均（進み具合の表示用）
  function fraction(v, snap) { const p = progress(v, snap); return p.length ? p.reduce((a, x) => a + x.v / x.need, 0) / p.length : 0; }
  function metricValue(v, snap) { const m = snap[v.metric]; return typeof m === 'number' ? m : 0; }
  function starsFor(v, snap) { const m = metricValue(v, snap); return m <= v.par[0] ? 3 : m <= v.par[1] ? 2 : 1; }
  // 期限：limit の日を過ぎた（day > limit）。ねらいを果たしていたら、その前の判定（0.5秒ごと）で終わっている
  function expired(v, snap) { return v.limit != null && snap.day > v.limit; }

  // ---------- 端末だけの保存 kusoge.raft.x ----------
  // { v:1, s:[航海ごとの★0〜3], c: 最後に遊んだ航海の id }。ふつうのいかだの保存（kusoge.raft.save・best）には触らない。
  function blankX() { return { v: 1, s: VOYAGES.map(() => 0), c: null }; }
  function loadX(raw) {
    const o = blankX();
    try {
      const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!d || typeof d !== 'object') return o;
      if (Array.isArray(d.s)) for (let i = 0; i < o.s.length; i++) { const n = d.s[i] | 0; o.s[i] = n >= 1 && n <= 3 ? n : 0; }
      if (typeof d.c === 'string' && byId(d.c)) o.c = d.c;
    } catch (e) { /* こわれた保存は空として扱う */ }
    return o;
  }
  function unlocked(x, i) { return i === 0 || (x.s[i - 1] || 0) >= 1; }
  function totalStars(x) { return x.s.reduce((a, b) => a + b, 0); }
  // ★を上書きするのは前より多いときだけ。x を直接書きかえて、変わったかを返す
  function record(x, id, stars) {
    const v = byId(id); if (!v) return false;
    if (stars > (x.s[v.index] || 0)) { x.s[v.index] = stars; return true; }
    return false;
  }

  return { VOYAGES, byId, progress, goalDone, fraction, metricValue, starsFor, expired, blankX, loadX, unlocked, totalStars, record };
});
