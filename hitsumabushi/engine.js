// ひつまぶし工房の中身（node でも動く）：特別営業10日（ねらい・店の条件・★）・ねらいの数え方・れんぞく（上以上の皿が続いた数）・保存 kusoge.hitsumabushi.x の読み込みと記録。
// 画面・保存・音・採点（judge）・注文づくりは hitsumabushi/index.html。特別営業は「決まった条件・決まった種」なので、だれがやっても同じ注文が同じ順番で来る。
//   HitsuEngine.STAGES[i]            … { id, world, name, desc, kind, stars:[1,2,3], seed, setup:{ grills, seats, coal, look, menu, rank, strict, dur, rush?, only?, styleMin?, sideP?, forceReq?, forceP? } }
//   HitsuEngine.setupOf(i)           … ゲームに渡す店の条件（新しい配列・オブジェクト）
//   HitsuEngine.metric(kind, stats)  … stats = { score, served, perfect, good, tips, angry, refused, streak } → ねらいの数
//   HitsuEngine.starsFor(i, v) / goalLine(i) / progress(i, v)
//   HitsuEngine.streakNext(n, rating) … 上（rating 3）以上で +1、それ以外は 0
//   HitsuEngine.readX(raw) → { v:1, s:[星×10], b:[ベスト×10], c: さいだいれんぞく }（こわれた保存でも読める）、open(x, i)、record(x, i, stars, v)、recordStreak(x, n)、totalStars(x)
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.HitsuEngine = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';
  const ALL = ['hitsu', 'don', 'shira', 'kimo', 'umaki'];
  // kind: 数え方。score＝点／served＝お出しした皿／perfect＝極上（90点以上）の皿／good＝上（75点以上）の皿／tips＝チップ／clean＝皿の数−2×（怒って帰った＋作り直し）／streak＝上以上のれんぞく
  const KINDS = {
    score: { ja: '点数', unit: '点' },
    served: { ja: 'お出しした皿', unit: '皿' },
    perfect: { ja: '極上の皿', unit: '皿' },
    good: { ja: '「上」以上の皿', unit: '皿' },
    tips: { ja: 'チップ', unit: '円' },
    clean: { ja: 'おだやかな営業', unit: '皿' },
    streak: { ja: 'れんぞく', unit: '皿' },
  };
  const mk = (id, world, name, desc, kind, stars, seed, setup) => ({
    id, world, name, desc, kind, stars, seed,
    setup: Object.assign({ grills: 2, seats: 3, coal: 0, look: 1, menu: ['hitsu', 'don'], rank: 0, strict: 'B', dur: 150 }, setup),
  });
  const STAGES = [
    mk('s1', 0, 'ひるどきの行列', 'ひつまぶしとうな丼。まずは、たくさんお出ししよう', 'served', [4, 6, 7], 70101, { menu: ['hitsu', 'don'], dur: 150, rush: 0.72 }),
    mk('s2', 0, 'ひつまぶしの日', 'ひつまぶしだけ。食べ方も4通りそろいぶみ', 'perfect', [2, 3, 5], 70102, { menu: ['hitsu'], only: ['hitsu'], styleMin: 1, dur: 150, rush: 0.85 }),
    mk('s3', 0, 'うな丼ランチ', '丼ものばかり。回転がはやい', 'score', [350, 600, 800], 70103, { menu: ['hitsu', 'don'], only: ['don'], rush: 0.62, grills: 2, seats: 4, dur: 150 }),
    mk('s4', 0, '白焼きの会', 'タレを塗らない白焼きとお吸い物。わさびをそえて', 'good', [3, 5, 6], 70104, { menu: ['hitsu', 'shira', 'kimo'], only: ['shira'], sideP: 0.8, coal: 1, dur: 150, rush: 0.8 }),
    mk('s5', 1, 'こだわり客の夜', 'こだわりのお客さんは、失敗すると作り直しを頼みます', 'clean', [5, 7, 9], 70105, { menu: ['hitsu', 'don', 'shira', 'kimo'], strict: 'C', rank: 2, look: 1, seats: 4, dur: 170, rush: 0.8 }),
    mk('s6', 1, 'ざわつく宵口', '焼き台3つ、客席5つ。次から次へとお客さん', 'served', [7, 10, 12], 70106, { grills: 3, seats: 5, menu: ['hitsu', 'don', 'shira', 'kimo'], strict: 'C', rank: 2, rush: 0.62, coal: 1, dur: 170 }),
    mk('s7', 1, 'う巻きとお吸い物', 'そえものの注文がいっぱい。最後まで気をぬかない', 'score', [500, 800, 950], 70107, { grills: 2, seats: 4, menu: ALL, strict: 'C', rank: 2, sideP: 0.85, coal: 1, look: 2, dur: 180, rush: 0.75 }),
    mk('s8', 2, 'せっかち客ぞろい', '「急いで」の注文ばかり。上の皿をつなげよう', 'streak', [3, 5, 8], 70108, { grills: 3, seats: 4, menu: ALL, strict: 'A', rank: 3, forceReq: ['hurry'], forceP: 0.7, coal: 1, look: 2, dur: 180, rush: 0.7 }),
    mk('s9', 2, '大盛りの日', '大盛りのチップをいただこう', 'tips', [6000, 11000, 15000], 70109, { grills: 3, seats: 4, menu: ALL, strict: 'A', rank: 3, forceReq: ['large', 'tareMore'], forceP: 0.7, coal: 1, look: 3, dur: 180, rush: 0.7 }),
    mk('s10', 2, '老舗の一日', 'ぜんぶ本気のお客さん。焦がさず、待たせず', 'score', [800, 1200, 1450], 70110, { grills: 3, seats: 5, menu: ALL, strict: 'A', rank: 4, coal: 1, look: 3, rush: 0.7, dur: 210 }),
  ];
  const N = STAGES.length;
  const info = i => STAGES[i] || null;
  function setupOf(i) {
    const s = STAGES[i]; if (!s) return null;
    const o = Object.assign({}, s.setup); o.menu = s.setup.menu.slice();
    if (s.setup.only) o.only = s.setup.only.slice();
    if (s.setup.forceReq) o.forceReq = s.setup.forceReq.slice();
    return o;
  }
  const num = v => { v = Number(v); return isFinite(v) && v > 0 ? v : 0; };
  function metric(kind, st) {
    st = st || {};
    switch (kind) {
      case 'score': return Math.floor(num(st.score));
      case 'served': return Math.floor(num(st.served));
      case 'perfect': return Math.floor(num(st.perfect));
      case 'good': return Math.floor(num(st.good));
      case 'tips': return Math.floor(num(st.tips));
      case 'clean': return Math.max(0, Math.floor(num(st.served) - 2 * (num(st.angry) + num(st.refused))));
      case 'streak': return Math.floor(num(st.streak));
      default: return 0;
    }
  }
  function starsFor(i, v) {
    const s = STAGES[i]; if (!s) return 0;
    let n = 0; for (let k = 0; k < 3; k++) if (v >= s.stars[k]) n = k + 1;
    return n;
  }
  const progress = (i, v) => { const s = STAGES[i]; return s ? Math.max(0, Math.min(1, v / s.stars[2])) : 0; };
  const streakNext = (n, rating) => (rating >= 3 ? (n | 0) + 1 : 0);
  // ---- kusoge.hitsumabushi.x（端末だけ・同期しない・ランキングに入らない）
  const blankX = () => ({ v: 1, s: new Array(N).fill(0), b: new Array(N).fill(0), c: 0 });
  function readX(raw) {
    const o = blankX();
    try {
      const d = typeof raw === 'string' ? JSON.parse(raw) : raw;
      if (!d || typeof d !== 'object' || Array.isArray(d)) return o;
      if (Array.isArray(d.s)) for (let i = 0; i < N; i++) { const n = d.s[i] | 0; o.s[i] = n >= 1 && n <= 3 ? n : 0; }
      if (Array.isArray(d.b)) for (let i = 0; i < N; i++) { const n = +d.b[i]; o.b[i] = isFinite(n) && n > 0 && n < 1e7 ? Math.floor(n) : 0; }
      const c = d.c | 0; o.c = c > 0 && c < 100000 ? c : 0;
    } catch (e) { /* こわれた保存は空として扱う */ }
    return o;
  }
  // 前の日を★1つ以上でクリアすると次が開く（最初は開いている）
  const open = (x, i) => i === 0 || (i > 0 && i < N && ((x.s[i - 1] | 0) >= 1));
  const totalStars = x => x.s.reduce((a, b) => a + b, 0);
  function record(x, i, stars, v) {
    if (!STAGES[i]) return false;
    let ch = false;
    if (stars > (x.s[i] || 0)) { x.s[i] = stars; ch = true; }
    if (v > (x.b[i] || 0)) { x.b[i] = Math.floor(v); ch = true; }
    return ch;
  }
  function recordStreak(x, n) { if (n > (x.c || 0)) { x.c = Math.min(99999, n | 0); return true; } return false; }
  return { STAGES, KINDS, N, info, setupOf, metric, starsFor, progress, streakNext, blankX, readX, open, totalStars, record, recordStreak };
});
