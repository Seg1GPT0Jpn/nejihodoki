// orchestra/contest.js — 指揮者ゲームの「コンクールモード」と「他団体との勝負」の中身。DOM も Web Audio も持たない純粋な関数だけ（node でそのままテストできる）。
// UMD: ブラウザでは window.OrchContest、node では module.exports（tools/tests/unit/orchestra-contest.test.js）。
//
//   ROUNDS     予選 → 本選 → 全国大会。課題曲（決まった1曲）＋自由曲（候補から1曲）・足切り点・金/銀/銅の線・ライバル団体
//   DIFF       engine.js の Session にそのまま渡せる「きびしい採点」の設定（マエストロよりきびしい。お手本・ガイド・一時停止・やり直しなし）
//   extract / analyse   engine.js の Scorer（と1拍ごとの強さの記録）から、4つの小さな点（拍・テンポ / 強弱 / 入り / 表現）を作る
//   JUDGES / judgePiece 好みのちがう5人の審査員。データだけから決まる点と、数字から組み立てる講評
//   ENSEMBLES / cpuPerf CPU の団体。名前・性格・実力をもとに、曲ごとに「種つきの乱数」で決まる演奏（同じ曲なら、いつも同じ）
//   field / awards      順位表（金/銀/銅賞）・次の部へ進めるか・部門賞
//   store               kusoge.orchestra.contest の読み書き
//   duel                他団体との勝負：2人が同じ曲を同じときに指揮して、点を見くらべる（common/turnroom.js のアダプター）
//
// engine.js の採点そのものには触れない。曲の点は engine.js の結果と Scorer の生の数字から、ここで組み立てなおす。
(function (root, factory) {
  if (typeof module === 'object' && module.exports) module.exports = factory();
  else root.OrchContest = factory();
})(typeof self !== 'undefined' ? self : this, function () {
  'use strict';

  const EDITION = 1;              // 大会の回。変えると CPU の演奏がすべて変わる（テストは固定）
  const HIST_MAX = 20;
  const CATS = ['beat', 'dyn', 'cue', 'expr'];
  const clamp = (x, a, b) => Math.min(b, Math.max(a, x));
  const sum = a => a.reduce((x, y) => x + y, 0);
  const mean = a => (a.length ? sum(a) / a.length : 0);
  const round1 = x => Math.round(x * 10) / 10;
  const isObj = x => x && typeof x === 'object' && !Array.isArray(x);

  // ---------------------------------------------------------------- 種つきの乱数
  function hash32(s) {
    let h = 2166136261 >>> 0;
    for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; }
    h ^= h >>> 13; h = Math.imul(h, 0x85ebca6b) >>> 0; h ^= h >>> 16;
    return h >>> 0;
  }
  function rng(seed) {
    let a = seed >>> 0;
    return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  }
  const gauss = r => (r() + r() + r() - 1.5) * 2;          // ほぼ 平均0・ばらつき1

  // ---------------------------------------------------------------- きびしい採点（engine.js の DIFFS と同じ形）
  // マエストロ：slack 0.1・uncued 0.15・tol 0.72・steady 0.7。コンクールはさらにきびしい。ゴースト・ガイド・お手本は画面側で出さない。
  const DIFF = { id: 'contest', slack: 0.06, wait: true, autoCue: false, uncued: 0.08, tol: 0.5, steady: 0.5, assist: 0, stars: [60, 78, 90], cueWeight: 0.3 };
  const diffFor = rid => { const R = ROUND_BY[rid] || ROUNDS[0]; return Object.assign({}, DIFF, { tol: R.tol }); };

  // ---------------------------------------------------------------- 曲（コンクールの課題曲・自由曲に使う曲だけ。数字は scores/index.json と各曲の楽譜から。テストで確かめる）
  // lv 難しさ 1..3 / min 分 / cues 入りの数 / era 時代
  const PIECES = {
    midsummer: { lv: 2, min: 2.49, cues: 9, era: 'romantic' },
    nachtmusik: { lv: 1, min: 4.15, cues: 0, era: 'classical' },
    'grieg-aase': { lv: 1, min: 3.6, cues: 1, era: 'romantic' },
    finlandia: { lv: 1, min: 0.91, cues: 0, era: 'classical' },
    'beethoven-marsch': { lv: 2, min: 1.27, cues: 0, era: 'classical' },
    'sousa-fairest': { lv: 2, min: 2.32, cues: 0, era: 'romantic' },
    beethoven7: { lv: 2, min: 3.95, cues: 13, era: 'classical' },
    zauberflote: { lv: 2, min: 2.96, cues: 17, era: 'classical' },
    egmont: { lv: 3, min: 4.68, cues: 25, era: 'classical' },
    rossini: { lv: 3, min: 4.45, cues: 24, era: 'romantic' },
    'haydn76-1-1': { lv: 2, min: 5.63, cues: 9, era: 'classical' },
    'mozart387-4': { lv: 3, min: 4.97, cues: 7, era: 'classical' },
    beethoven5: { lv: 3, min: 3.96, cues: 26, era: 'classical' },
    'dvorak9-3': { lv: 3, min: 3.84, cues: 30, era: 'romantic' },
    'slavonic72-2': { lv: 3, min: 4.53, cues: 8, era: 'romantic' },
    fidelio: { lv: 3, min: 5.6, cues: 35, era: 'classical' },
  };
  const PIECE_IDS = Object.keys(PIECES);
  // 0..1：難しいほど大きい（CPU の演奏の出来に効く。自由曲の「難度点」にも使う）
  const pieceDiff = m => (m ? clamp(0.08 + 0.2 * (m.lv - 1) + Math.min(0.28, m.min / 18) + Math.min(0.3, m.cues / 100), 0.05, 0.95) : 0.5);
  // 自由曲の難度点：しっかり弾けた（65点以上）ときだけ、むずかしい曲に最大 約3点
  const freeBonus = (m, total) => (m && total >= 65 ? round1((m.lv - 1) * 1.2 + (m.cues >= 20 ? 0.8 : 0)) : 0);

  // ---------------------------------------------------------------- 大会（予選 → 本選 → 全国大会）
  // cut：足切りの点（これ未満は次へ進めない）/ advance：次へ進めるのは上位何団体まで / medal：[金, 銀, 銅] の点（順位ではなく点で決まる）
  // harsh：審査員がどの団体からも引く点（上の部ほどきびしい）/ tight：拍・テンポの許される幅の縮み / tol：強弱の許される幅（エンジンへ）
  const ROUNDS = [
    { id: 'q', name: { ja: '予選', en: 'Qualifier' }, no: 1, compulsory: 'midsummer', free: ['nachtmusik', 'grieg-aase', 'finlandia', 'beethoven-marsch', 'sousa-fairest'],
      rivals: ['hinata', 'tsubame', 'kitakaze', 'minato', 'midori', 'sakura', 'shirasagi'], advance: 4, cut: 58, medal: [78, 68, 58], harsh: 0, tight: 0.9, tol: 0.55, boost: 0 },
    { id: 'f', name: { ja: '本選', en: 'Semifinal' }, no: 2, compulsory: 'beethoven7', free: ['zauberflote', 'egmont', 'rossini', 'haydn76-1-1', 'mozart387-4'],
      rivals: ['minato', 'midori', 'sakura', 'shirasagi', 'hoshigaoka'], advance: 3, cut: 64, medal: [80, 70, 60], harsh: 1.5, tight: 1, tol: 0.5, boost: 5 },
    { id: 'n', name: { ja: '全国大会', en: 'Nationals' }, no: 3, compulsory: 'beethoven5', free: ['dvorak9-3', 'slavonic72-2', 'egmont', 'rossini', 'fidelio'],
      rivals: ['shirasagi', 'hoshigaoka', 'asagiri', 'ginrei', 'akatsuki'], advance: 1, cut: 0, medal: [84, 74, 64], harsh: 3, tight: 1.1, tol: 0.45, boost: 10 },
  ];
  const ROUND_BY = {}; ROUNDS.forEach(r => { ROUND_BY[r.id] = r; });
  const DUEL_ROUND = { id: 'd', name: { ja: '勝負', en: 'Duel' }, harsh: 0, tight: 1, tol: 0.5, boost: 0 };
  const roundOf = rid => ROUND_BY[rid] || (rid === 'd' ? DUEL_ROUND : null);

  // ---------------------------------------------------------------- CPU の団体：名前・性格・実力
  // skill：基本の実力 / pers：4つの点の得意・不得意（足し引き）/ sigma：出来のムラ / bias：強弱が大きめ(+)か小さめ(-)か / free：自由曲の好み
  const ENSEMBLES = [
    { id: 'hinata', name: { ja: 'ひなた市民管弦楽団', en: 'Hinata Civic Orchestra' }, skill: 52, sigma: 5, bias: 0.04, pers: { beat: -3, dyn: 2, cue: -2, expr: 4 }, free: 'easy',
      note: { ja: '地域の愛好家の楽団。のびのびとした歌いまわしが持ち味。', en: 'A community orchestra of amateurs. Relaxed, singing phrasing.' } },
    { id: 'tsubame', name: { ja: 'つばめ少年少女オーケストラ', en: 'Tsubame Youth Orchestra' }, skill: 56, sigma: 7, bias: 0.08, pers: { beat: -2, dyn: 3, cue: -4, expr: 3 }, free: 'easy',
      note: { ja: '元気いっぱいの子どもたち。ときどき走るが、勢いは一番。', en: 'Energetic children. They rush now and then, but nobody beats their drive.' } },
    { id: 'kitakaze', name: { ja: '北風高校 管弦楽部', en: 'Kitakaze High School Orchestra' }, skill: 62, sigma: 6, bias: 0.05, pers: { beat: 4, dyn: -2, cue: 0, expr: -3 }, free: 'mid',
      note: { ja: '練習熱心でテンポは正確。表現はまだ硬い。', en: 'Diligent rehearsers with accurate tempo. Expression is still stiff.' } },
    { id: 'minato', name: { ja: 'ミナト室内合奏団', en: 'Minato Chamber Players' }, skill: 66, sigma: 4, bias: -0.04, pers: { beat: 2, dyn: 3, cue: 4, expr: -4 }, free: 'mid',
      note: { ja: '少人数ならではのそろった入り。音量は控えめ。', en: 'A small band with tightly matched entrances. Plays on the quiet side.' } },
    { id: 'midori', name: { ja: 'みどり大学フィル', en: 'Midori University Philharmonic' }, skill: 70, sigma: 6, bias: 0.06, pers: { beat: -1, dyn: 4, cue: -3, expr: 2 }, free: 'hard',
      note: { ja: '大きな音と大胆な強弱。難しい曲にも挑む。', en: 'Big sound and bold dynamics. Always tackles the hard pieces.' } },
    { id: 'sakura', name: { ja: 'さくら管弦楽団', en: 'Sakura Orchestra' }, skill: 72, sigma: 3, bias: 0, pers: { beat: 3, dyn: 1, cue: 2, expr: -2 }, free: 'mid',
      note: { ja: '安定感はピカイチ。大崩れしない堅実派。', en: 'Rock-solid and steady. A safe pair of hands.' } },
    { id: 'shirasagi', name: { ja: '白鷺シンフォニエッタ', en: 'Shirasagi Sinfonietta' }, skill: 76, sigma: 4, bias: -0.03, pers: { beat: 0, dyn: 2, cue: 3, expr: 4 }, free: 'mid',
      note: { ja: '透明な響きと上品な強弱。入りがとてもきれい。', en: 'Clear sound and refined dynamics. Beautiful entrances.' } },
    { id: 'hoshigaoka', name: { ja: '星ヶ丘ユースオーケストラ', en: 'Hoshigaoka Youth Orchestra' }, skill: 79, sigma: 6, bias: 0.07, pers: { beat: -2, dyn: 5, cue: 0, expr: 3 }, free: 'hard',
      note: { ja: '若さと情熱。ひらめく日は全国一、外す日は大きく外す。', en: 'Youth and fire. Brilliant on a good day, shaky on a bad one.' } },
    { id: 'asagiri', name: { ja: '朝霧フィルハーモニー', en: 'Asagiri Philharmonic' }, skill: 83, sigma: 3, bias: 0.01, pers: { beat: 4, dyn: 0, cue: 2, expr: -3 }, free: 'mid',
      note: { ja: '拍の正確さは審査員も舌を巻く。ロマンはほどほど。', en: 'Judges marvel at their pulse. A little short on romance.' } },
    { id: 'ginrei', name: { ja: '銀嶺交響楽団', en: 'Ginrei Symphony' }, skill: 86, sigma: 3, bias: -0.02, pers: { beat: 1, dyn: 3, cue: 3, expr: 1 }, free: 'hard',
      note: { ja: '全国常連の強豪。弱点がほとんどない。', en: 'Regular nationals contenders. Hardly a weak point.' } },
    { id: 'akatsuki', name: { ja: '暁フィル', en: 'Akatsuki Philharmonic' }, skill: 88, sigma: 4, bias: 0.03, pers: { beat: -1, dyn: 2, cue: 0, expr: 6 }, free: 'hard',
      note: { ja: '歌心なら国内随一。細かい入りはときどき甘い。', en: 'The most songful band in the country. Small entrances are occasionally loose.' } },
    { id: 'kamome', name: { ja: 'かもめ吹奏楽団', en: 'Kamome Wind Band' }, skill: 60, sigma: 5, bias: 0.06, pers: { beat: 3, dyn: -1, cue: -2, expr: -1 }, free: 'easy',
      note: { ja: '行進曲が得意な楽団。リズムは元気、歌いまわしは素朴。', en: 'Loves a march. Lively rhythm, plain phrasing.' } },
  ];
  const ENS_BY = {}; ENSEMBLES.forEach(e => { ENS_BY[e.id] = e; });
  const DUEL_CPU = ['kamome', 'sakura'];      // オンラインの部屋で、足りない席をうめる団体（席 1・席 0 のとき）

  // 団体の自由曲：好み（easy / mid / hard）と実力から、候補の中から決める（種つき。同じ団体はいつも同じ曲）
  function cpuFree(ens, round) {
    const R = typeof round === 'string' ? ROUND_BY[round] : round, list = R.free.slice();
    const want = ens.free === 'hard' ? 1 : ens.free === 'easy' ? 0 : 0.5;
    const ds = list.map(id => pieceDiff(PIECES[id])), lo = Math.min(...ds), hi = Math.max(...ds);
    const r = rng(hash32([EDITION, ens.id, R.id, 'free'].join('|')));
    let best = list[0], bestCost = Infinity;
    list.forEach((id, i) => { const pos = hi > lo ? (ds[i] - lo) / (hi - lo) : 0.5, cost = Math.abs(pos - want) + 0.45 * r(); if (cost < bestCost) { bestCost = cost; best = id; } });
    return best;
  }

  // ---------------------------------------------------------------- 4つの点（perf）
  // perf = { beat, dyn, cue, expr, stab, adh, cov, missed, perfect, late, pauses, ratio, bias, shape, coh }  すべて 0..100（missed などは回数、ratio は % 、bias は -1..1）
  // beat 拍・テンポ（stab 拍のそろい / adh 曲のテンポに合っているか / cov 拍の出し具合）/ dyn 強弱 / cue 入り（coh 入りのそろい具合をふくむ）/ expr 表現（shape 強弱の流れの形 / 途切れなさ）
  function extract(sc, o) {
    o = o || {}; const res = sc.result(), score = sc.score, n = score.nBeats, target = [];
    for (let b = 0; b < n; b++) target.push(score.dynAt(b + 0.5));
    return { res, ratios: sc.ratios.slice(), devs: sc.devs.slice(), heldFrac: sc.playSec > 0 ? sc.heldSec / sc.playSec : 0, cueRel: sc.cues.filter(c => c.q != null).map(c => c.rel), cueCount: sc.cues.length,
      target, hist: (o.hist || []).slice(), pauses: o.pauses || 0 };
  }
  const curve = (x, g) => 100 * Math.pow(clamp(x, 0, 100) / 100, g);   // 高い点ほど取りにくく（きびしい採点）
  function pearson(a, b) {
    const n = a.length; if (n < 8) return null;
    const ma = mean(a), mb = mean(b); let sab = 0, saa = 0, sbb = 0;
    for (let i = 0; i < n; i++) { const x = a[i] - ma, y = b[i] - mb; sab += x * y; saa += x * x; sbb += y * y; }
    if (saa < 1e-9 || sbb < 1e-9) return 0;
    return sab / Math.sqrt(saa * sbb);
  }
  function analyse(raw, o) {
    o = o || {}; const tight = o.tight || 1, res = raw.res;
    const md = mean(raw.devs), enough = raw.ratios.length >= 2;
    const stab = enough ? clamp(100 - 650 * tight * md, 0, 100) : 0;
    const adh = enough ? clamp(100 - 400 * tight * mean(raw.ratios.map(r => Math.abs(Math.log(Math.max(0.05, r))))), 0, 100) : 0;
    const cov = clamp(res.coverage, 0, 1), avg = res.avgRatio || 1;
    const range = avg >= 0.62 && avg <= 1.6 ? 1 : 0.55;
    const beat = enough ? clamp((0.5 * stab + 0.3 * adh + 20 * cov) * (1 - 0.8 * clamp(raw.heldFrac, 0, 1)) * range, 0, 100) : 0;
    const bias = res.bias || 0;
    const dyn = curve(clamp((res.dynamics || 0) - 45 * Math.max(0, Math.abs(bias) - 0.07), 0, 100), 1.45);
    const missed = res.stats ? res.stats.missed : 0, wrong = res.stats ? res.stats.wrong : 0, perfect = res.stats ? res.stats.perfect : 0, late = res.stats ? res.stats.late : 0;
    let coh = 0, cue = 0;
    if (raw.cueCount > 0) {
      const rel = raw.cueRel; const sd = rel.length > 1 ? Math.sqrt(mean(rel.map(x => (x - mean(rel)) * (x - mean(rel))))) : 1.2;
      coh = clamp(100 - 35 * sd, 0, 100);
      cue = curve(clamp(0.85 * (res.cues || 0) + 0.15 * coh - 5 * missed - 3 * wrong, 0, 100), 1.3);
    }
    // 表現：強弱の流れの形（目安との相関）・なめらかさ（余計な上下）・途切れなさ
    const lv = [], tg = []; raw.hist.forEach((v, i) => { if (v != null && i < raw.target.length) { lv.push(v); tg.push(raw.target[i]); } });
    const corr = pearson(lv, tg);
    const shape = corr == null ? 0 : curve(clamp(100 * (corr - 0.15) / 0.8, 0, 100), 1.3);
    let jit = 0; if (lv.length > 2) { const dl = [], dt = []; for (let i = 1; i < lv.length; i++) { dl.push(Math.abs(lv[i] - lv[i - 1])); dt.push(Math.abs(tg[i] - tg[i - 1])); } jit = Math.max(0, mean(dl) - mean(dt)); }
    const smooth = lv.length > 2 ? clamp(100 - 420 * jit, 0, 100) : 0;
    const cont = clamp(100 * cov - 15 * (raw.pauses || 0) - 60 * clamp(raw.heldFrac, 0, 1), 0, 100);
    const expr = curve(clamp(0.4 * shape + 0.25 * smooth + 0.35 * cont, 0, 100), 1.45);
    const R = x => Math.round(x);
    return { beat: R(beat), dyn: R(dyn), cue: R(cue), expr: R(expr), stab: R(stab), adh: R(adh), cov: R(100 * cov), missed, perfect, late, pauses: raw.pauses || 0, ratio: R(100 * avg), bias: +bias.toFixed(2), shape: R(shape), coh: R(coh), cues: raw.cueCount };
  }

  // 4つの点を 0..255 の16個にまとめて（RTDB の act の r に入る）、また戻す
  function perfToVec(p, status) {
    const c255 = x => clamp(Math.round(x), 0, 255);
    return [status == null ? 1 : status, c255(p.beat), c255(p.dyn), c255(p.cue), c255(p.expr), c255(p.stab), c255(p.adh), c255(p.cov), c255(p.missed), c255(p.perfect), c255(p.late), c255(p.pauses),
      c255(p.ratio), c255(128 + 100 * p.bias), c255(p.shape), c255(p.coh)];
  }
  function vecToPerf(v) {
    const a = Array.isArray(v) ? v : isObj(v) ? Object.keys(v).sort((x, y) => x - y).map(k => v[k]) : [];
    if (a.length < 16 || a.some(x => typeof x !== 'number' || !isFinite(x))) return null;
    return { status: a[0], beat: a[1], dyn: a[2], cue: a[3], expr: a[4], stab: a[5], adh: a[6], cov: a[7], missed: a[8], perfect: a[9], late: a[10], pauses: a[11], ratio: a[12], bias: +((a[13] - 128) / 100).toFixed(2), shape: a[14], coh: a[15] };
  }
  const validVec = v => { const a = Array.isArray(v) ? v : isObj(v) ? Object.keys(v).sort((x, y) => x - y).map(k => v[k]) : null; return !!a && a.length === 16 && a.every(x => typeof x === 'number' && x === Math.floor(x) && x >= 0 && x <= 255) && (a[0] === 1 || a[0] === 2); };

  // ---------------------------------------------------------------- CPU の演奏（種つき）
  function cpuPerf(ens, pid, rid) {
    const m = PIECES[pid], d = pieceDiff(m), R = k => rng(hash32([EDITION, ens.id, pid, rid, k].join('|'))), g = k => gauss(R(k));
    const base = ens.skill - 13 * d + ((ROUND_BY[rid] || DUEL_ROUND).boost || 0);
    const val = (k, extra) => clamp(base + ens.pers[k] + (extra || 0) + ens.sigma * g(k), 12, 97);
    const beat = val('beat'), dyn = val('dyn'), expr = val('expr'), hasCue = m && m.cues > 0, cue = hasCue ? val('cue', -3 * d) : 0;
    const missed = hasCue ? Math.round(m.cues * (100 - cue) / 100 * 0.4) : 0, perfect = hasCue ? Math.max(0, Math.round(m.cues * cue / 100 * 0.8)) : 0;
    const R0 = x => Math.round(x);
    return { beat: R0(beat), dyn: R0(dyn), cue: R0(cue), expr: R0(expr), stab: R0(clamp(beat + 4 * g('stab'), 10, 99)), adh: R0(clamp(beat + 3 * g('adh'), 10, 99)), cov: 100, missed, perfect, late: Math.round(missed * 0.3),
      pauses: 0, ratio: R0(100 + 3 * g('ratio')), bias: +clamp(ens.bias + 0.02 * g('bias'), -0.3, 0.3).toFixed(2), shape: R0(clamp(expr + 5 * g('shape'), 10, 99)), coh: hasCue ? R0(clamp(cue + 4 * g('coh'), 10, 99)) : 0, cues: m ? m.cues : 0 };
  }

  // ---------------------------------------------------------------- 審査員（好みがちがう5人）
  // w：4つの点の重み / off：甘さ・からさ / era：好きな時代（その曲なら+2）/ peeve：気になる点
  const JUDGES = [
    { id: 'kirishima', name: { ja: '霧島 理', en: 'Kirishima' }, role: { ja: '拍・テンポ重視', en: 'Pulse and tempo' }, w: { beat: 0.46, dyn: 0.16, cue: 0.14, expr: 0.24 }, off: -1.5, era: '', peeve: 'steady' },
    { id: 'hanazono', name: { ja: '花園 あかり', en: 'Hanazono' }, role: { ja: '歌心・表現重視', en: 'Song and expression' }, w: { beat: 0.14, dyn: 0.28, cue: 0.1, expr: 0.48 }, off: 0, era: 'romantic', peeve: 'expr' },
    { id: 'asakura', name: { ja: '朝倉 玄', en: 'Asakura' }, role: { ja: '古典派の様式重視', en: 'Classical style' }, w: { beat: 0.32, dyn: 0.3, cue: 0.16, expr: 0.22 }, off: -1, era: 'classical', peeve: 'loud' },
    { id: 'shiraishi', name: { ja: '白石 ゆず', en: 'Shiraishi' }, role: { ja: 'アンサンブル重視', en: 'Ensemble' }, w: { beat: 0.22, dyn: 0.14, cue: 0.46, expr: 0.18 }, off: -0.5, era: '', peeve: 'miss' },
    { id: 'aoi', name: { ja: '蒼井 凛', en: 'Aoi' }, role: { ja: '総合・聴き手の目線', en: 'Overall, a listener\'s ear' }, w: { beat: 0.28, dyn: 0.26, cue: 0.2, expr: 0.26 }, off: 1.5, era: '', peeve: '' },
  ];
  // 入りのない曲では、入りの重みを他の3つに配りなおす
  function weightsFor(j, hasCue) {
    const w = Object.assign({}, j.w); if (hasCue) return w;
    const rest = 1 - w.cue; w.cue = 0; CATS.forEach(k => { if (k !== 'cue') w[k] = w[k] / rest; }); return w;
  }
  function judgeScore(j, perf, m, round) {
    if (!perf) return 0;
    const hasCue = !!(m && m.cues > 0), w = weightsFor(j, hasCue);
    let s = sum(CATS.map(k => w[k] * (k === 'cue' && !hasCue ? 0 : perf[k])));
    s += j.off; if (j.era && m && m.era === j.era) s += 2;
    if (j.peeve === 'steady') s -= 0.12 * Math.max(0, 72 - perf.stab);
    else if (j.peeve === 'expr') s += perf.expr >= 85 ? 2 : perf.expr < 55 ? -2.5 : 0;
    else if (j.peeve === 'loud') s -= Math.abs(perf.bias) > 0.14 ? 3 : 0;
    else if (j.peeve === 'miss' && hasCue) s -= Math.min(6, perf.missed);
    s -= (round && round.harsh) || 0;
    return round1(clamp(s, 0, 100));
  }
  // 一番高い点と一番低い点を除いた平均（好みが極端な1人に左右されない）
  function trimmed(a) { const b = a.slice().sort((x, y) => x - y); return b.length > 2 ? mean(b.slice(1, -1)) : mean(b); }
  // perf（なければ null = 棄権・未演奏）から、審査員ごとの点・まとめの点・4つの点
  function judgePiece(perf, pid, round) {
    const m = PIECES[pid], R = typeof round === 'string' ? roundOf(round) : round || DUEL_ROUND;
    const js = JUDGES.map(j => ({ id: j.id, score: judgeScore(j, perf, m, R) }));
    const total = perf ? round1(trimmed(js.map(x => x.score))) : 0;
    const cats = perf ? { beat: perf.beat, dyn: perf.dyn, cue: m && m.cues > 0 ? perf.cue : null, expr: perf.expr } : { beat: 0, dyn: 0, cue: null, expr: 0 };
    return { id: pid, total, judges: js, cats, hi: Math.max(...js.map(x => x.score)), lo: Math.min(...js.map(x => x.score)) };
  }

  // ---------------------------------------------------------------- 講評（数字から組み立てる）
  const CATN = { beat: '拍・テンポ', dyn: '強弱', cue: '入り', expr: '表現' };
  const LINES = {
    beat: ['拍の間隔がそろい、テンポの運びがとても安定していました。', 'テンポは大きく崩れませんでしたが、拍の間隔にゆれが残りました。', '拍がそろわず、テンポが落ち着きませんでした。'],
    dyn: ['強弱の階段を、楽譜のとおりに上り下りできていました。', '強弱はおおむね楽譜に沿っていますが、切り替えが少し遅れがちでした。', '強弱が楽譜の指示から離れていました。'],
    cue: ['入りの合図が的確で、楽器たちの足並みがそろっていました。', '入りは合いましたが、合図のタイミングにばらつきがありました。', '入りの取りこぼしが目立ち、アンサンブルがばらけました。'],
    expr: ['音楽の流れが途切れず、フレーズの山と谷が自然に描かれていました。', '流れはつながっていますが、強弱の動きがややぎこちなく感じました。', '音楽の流れが途切れがちで、表現が伝わりにくい演奏でした。'],
  };
  const tier = v => (v >= 82 ? 0 : v >= 62 ? 1 : 2);
  const fmt = (s, v) => (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s);
  // 戻り値：[{ kind: 'praise'|'note'|'info', text }]。T は画面側の翻訳関数（なければ日本語のまま）。name は曲名（なくてもよい）
  function comment(jid, perf, pid, round, o) {
    o = o || {}; const T = o.T || fmt, j = JUDGES.find(x => x.id === jid); if (!j || !perf) return [{ kind: 'note', text: T('演奏がありませんでした。') }];
    const m = PIECES[pid], hasCue = !!(m && m.cues > 0), w = weightsFor(j, hasCue), out = [];
    const ks = CATS.filter(k => k !== 'cue' || hasCue).sort((a, b) => w[b] - w[a]);
    const top = ks.filter(k => w[k] >= 0.2).sort((a, b) => perf[b] - perf[a])[0] || ks[0];            // 重みの大きい点のうち、一番よかったところ
    const low = ks.filter(k => w[k] >= 0.14).sort((a, b) => perf[a] - perf[b])[0] || ks[0];         // 重みのあるなかで、一番足りないところ
    out.push({ kind: perf[top] >= 62 ? 'praise' : 'note', text: T('「{c}」{n}点。', { c: T(CATN[top]), n: perf[top] }) + T(LINES[top][tier(perf[top])]) });
    if (low !== top && perf[low] < 78) out.push({ kind: 'note', text: T('「{c}」は{n}点。', { c: T(CATN[low]), n: perf[low] }) + T(LINES[low][tier(perf[low])]) });
    if (j.peeve === 'steady') out.push({ kind: perf.stab < 72 ? 'note' : 'praise', text: perf.stab < 72 ? T('拍の間隔の乱れ（そろい {n}）が気になりました。基本の拍が、すべての土台です。', { n: perf.stab }) : T('拍のそろいは {n}。基本がしっかりしています。', { n: perf.stab }) });
    else if (j.peeve === 'expr') out.push({ kind: perf.expr >= 85 ? 'praise' : 'note', text: perf.expr >= 85 ? T('フレーズに歌があり、思わず聴き入りました。') : perf.expr < 55 ? T('歌心がもう少し欲しいところです。流れを止めない振りを。') : T('表現は誠実でした。もう一歩の大胆さに期待します。') });
    else if (j.peeve === 'loud') out.push({ kind: Math.abs(perf.bias) > 0.14 ? 'note' : 'praise', text: perf.bias > 0.14 ? T('全体に音が大きすぎて、古典の様式から外れました。') : perf.bias < -0.14 ? T('全体に音が小さく、古典の様式としては控えめすぎました。') : T('音量の釣り合いが保たれ、様式感がありました。') });
    else if (j.peeve === 'miss') out.push(!hasCue ? { kind: 'info', text: T('この曲は入りが少なく、拍のそろい方を中心に聴きました。') } : perf.missed > 0 ? { kind: 'note', text: T('入りの取りこぼしが{n}回。アンサンブルでは、ひとつの遅れが全員に響きます。', { n: perf.missed }) } : { kind: 'praise', text: T('入りの取りこぼしはゼロ。見事な統率でした。') });
    else out.push({ kind: 'info', text: perf.pauses > 0 ? T('途中で止まったこと（{n}回）は減点です。最後まで流れを保ちましょう。', { n: perf.pauses }) : T('聴き手として、最後まで音楽に集中できました。') });
    if (j.era && m && m.era === j.era) out.push({ kind: 'info', text: T(j.era === 'classical' ? '古典派の曲なので、とくに厳しく聴きました。' : 'ロマン派の曲で、思い入れも強く聴きました。') });
    return out;
  }
  const medalIndex = (total, R) => (total >= R.medal[0] ? 3 : total >= R.medal[1] ? 2 : total >= R.medal[2] ? 1 : 0);   // 0 なし / 1 銅 / 2 銀 / 3 金
  const MEDALS = ['', '銅賞', '銀賞', '金賞'];

  // ---------------------------------------------------------------- 大会の順位表
  // 団体ごとの出場：{ id, name, cpu, comp: judged, free: judged, freeId, total, medal, ... }
  function entryOf(id, name, cpu, R, compPerf, freeId, freePerf) {
    const c = judgePiece(compPerf, R.compulsory, R), f = judgePiece(freePerf, freeId, R), fb = freeBonus(PIECES[freeId], f.total);
    const total = round1(clamp(0.5 * c.total + 0.5 * (f.total + fb), 0, 100));
    const avgCat = k => { const a = [c.cats[k], f.cats[k]].filter(v => v != null); return a.length ? round1(mean(a)) : 0; };
    return { id, name, cpu, comp: c, free: f, freeId, bonus: fb, total, medal: medalIndex(total, R), cats: { beat: avgCat('beat'), dyn: avgCat('dyn'), cue: avgCat('cue'), expr: avgCat('expr') }, perfs: [compPerf, freePerf] };
  }
  function rivalEntry(eid, R) {
    const e = ENS_BY[eid], fid = cpuFree(e, R);
    return entryOf(e.id, e.name, true, R, cpuPerf(e, R.compulsory, R.id), fid, cpuPerf(e, fid, R.id));
  }
  // player: { name, comp: perf, freeId, free: perf }（perf が null なら棄権）
  function field(rid, player) {
    const R = ROUND_BY[rid], me = entryOf('me', player.name, false, R, player.comp, player.freeId, player.free);
    const rows = R.rivals.map(id => rivalEntry(id, R)).concat([me]);
    rows.sort((a, b) => b.total - a.total || (a.cpu === b.cpu ? 0 : a.cpu ? -1 : 1) || (a.id < b.id ? -1 : 1));      // 同点なら、CPU が上（人にはきびしく）
    rows.forEach((r, i) => { r.rank = i + 1; });
    const you = rows.find(r => r.id === 'me');
    const passScore = you.total >= R.cut, passRank = you.rank <= R.advance;
    const adv = { ok: rid !== 'n' && passScore && passRank, why: rid === 'n' ? 'last' : !passScore ? 'score' : !passRank ? 'rank' : 'ok' };
    return { round: R, rows, you, n: rows.length, cut: R.cut, advance: R.advance, adv, awards: awards(rows), champion: rid === 'n' && you.rank === 1 && you.medal === 3 };
  }
  // 部門賞：課題曲部門・自由曲部門・4つの点の賞（最初に一番高い団体。同点なら上の順位が先）
  function awards(rows) {
    const best = f => { let b = null; rows.forEach(r => { const v = f(r); if (v == null) return; if (!b || v > b.v) b = { id: r.id, v }; }); return b; };
    const out = [{ id: 'comp', name: { ja: '課題曲部門', en: 'Compulsory Piece' }, win: best(r => r.comp.total) }, { id: 'free', name: { ja: '自由曲部門', en: 'Free Piece' }, win: best(r => r.free.total) }];
    const an = { beat: { ja: '拍・テンポ賞', en: 'Pulse Prize' }, dyn: { ja: '強弱賞', en: 'Dynamics Prize' }, cue: { ja: '入り賞', en: 'Entrance Prize' }, expr: { ja: '表現賞', en: 'Expression Prize' } };
    CATS.forEach(k => out.push({ id: k, name: an[k], win: best(r => r.cats[k]) }));
    return out;
  }

  // ---------------------------------------------------------------- 勝負（2団体を同じ曲で見くらべる）
  function verdict(pid, perfA, perfB) {
    const A = judgePiece(perfA, pid, DUEL_ROUND), B = judgePiece(perfB, pid, DUEL_ROUND);
    const votes = JUDGES.map((j, i) => { const a = A.judges[i].score, b = B.judges[i].score; return a > b ? 0 : b > a ? 1 : -1; });
    const va = votes.filter(x => x === 0).length, vb = votes.filter(x => x === 1).length;
    let w = va > vb ? 0 : vb > va ? 1 : -1; if (w < 0 && A.total !== B.total) w = A.total > B.total ? 0 : 1;
    return { a: A, b: B, votes, win: w, margin: round1(Math.abs(A.total - B.total)), tally: [va, vb] };
  }

  // ---------------------------------------------------------------- 保存：kusoge.orchestra.contest
  // { v:1, r:{ q|f|n:{ s（ベストの点）, m（金銀銅 0..3）, b（ぬいた団体の数）, n（出場回数）, c（次へ進めた 0/1）, sc（課題曲のベスト）, sf（自由曲のベスト）} },
  //   hist:[{ t, r, s, m, k（順位）, f（自由曲）, p（進めた 0/1）}]（新しい順・最大20）, stats:{ entries, gold, silver, bronze, passed, cups（全国大会の金賞）, grand（全国優勝）, duels, wins, losses, draws },
  //   duel:{ <曲ID>:{ w, l, d, b（勝負でのベストの点）} }, set:{ free:{ q, f, n }, rival, piece } }
  const defStore = () => ({ v: 1, r: {}, hist: [], stats: { entries: 0, gold: 0, silver: 0, bronze: 0, passed: 0, cups: 0, grand: 0, duels: 0, wins: 0, losses: 0, draws: 0 }, duel: {}, set: { free: {}, rival: '', piece: '' } });
  const num = (x, a, b) => clamp(Number(x) || 0, a, b);
  function readStore(raw) {
    let s = raw; if (typeof s === 'string') { try { s = JSON.parse(s); } catch (e) { s = null; } }
    const d = defStore(); if (!isObj(s)) return d;
    ROUNDS.forEach(R => { const q = isObj(s.r) ? s.r[R.id] : null; if (isObj(q)) d.r[R.id] = { s: round1(num(q.s, 0, 100)), m: Math.round(num(q.m, 0, 3)), b: Math.round(num(q.b, 0, 20)), n: Math.round(num(q.n, 0, 1e6)), c: q.c ? 1 : 0, sc: round1(num(q.sc, 0, 100)), sf: round1(num(q.sf, 0, 100)) }; });
    d.hist = (Array.isArray(s.hist) ? s.hist : []).filter(h => isObj(h) && ROUND_BY[h.r]).slice(0, HIST_MAX).map(h => ({ t: Number(h.t) || 0, r: h.r, s: round1(num(h.s, 0, 100)), m: Math.round(num(h.m, 0, 3)), k: Math.round(num(h.k, 1, 20)), f: typeof h.f === 'string' ? h.f.slice(0, 24) : '', p: h.p ? 1 : 0 }));
    const st = isObj(s.stats) ? s.stats : {}; Object.keys(d.stats).forEach(k => { d.stats[k] = Math.max(0, Math.floor(Number(st[k]) || 0)); });
    Object.keys(isObj(s.duel) ? s.duel : {}).filter(k => PIECES[k]).forEach(k => { const q = s.duel[k]; if (isObj(q)) d.duel[k] = { w: Math.round(num(q.w, 0, 1e6)), l: Math.round(num(q.l, 0, 1e6)), d: Math.round(num(q.d, 0, 1e6)), b: round1(num(q.b, 0, 100)) }; });
    const se = isObj(s.set) ? s.set : {};
    if (isObj(se.free)) ROUNDS.forEach(R => { if (R.free.includes(se.free[R.id])) d.set.free[R.id] = se.free[R.id]; });
    d.set.rival = ENS_BY[se.rival] ? se.rival : ''; d.set.piece = PIECES[se.piece] ? se.piece : '';
    return d;
  }
  // 大会の出場を記録する。戻り値：{ store, isBest, unlocked }
  function recordRound(store, rid, fl, t) {
    const s = readStore(JSON.stringify(store)), you = fl.you, R = ROUND_BY[rid], prev = s.r[rid] || { s: 0, m: 0, b: 0, n: 0, c: 0, sc: 0, sf: 0 };
    const isBest = you.total > prev.s, beaten = fl.n - you.rank;
    s.r[rid] = { s: Math.max(prev.s, you.total), m: Math.max(prev.m, you.medal), b: Math.max(prev.b, beaten), n: prev.n + 1, c: prev.c || (fl.adv.ok ? 1 : 0), sc: Math.max(prev.sc, you.comp.total), sf: Math.max(prev.sf, you.free.total) };
    s.hist.unshift({ t: t || 0, r: rid, s: you.total, m: you.medal, k: you.rank, f: you.freeId, p: fl.adv.ok ? 1 : 0 }); s.hist = s.hist.slice(0, HIST_MAX);
    s.stats.entries++; if (you.medal === 3) s.stats.gold++; else if (you.medal === 2) s.stats.silver++; else if (you.medal === 1) s.stats.bronze++;
    if (fl.adv.ok) s.stats.passed++; if (rid === 'n' && you.medal === 3) s.stats.cups++; if (fl.champion) s.stats.grand++;
    s.set.free[rid] = you.freeId;
    return { store: s, isBest, unlocked: !!(fl.adv.ok && !prev.c) };
  }
  function recordDuel(store, pid, v, myIndex) {
    const s = readStore(JSON.stringify(store)), d = s.duel[pid] || { w: 0, l: 0, d: 0, b: 0 }, mine = myIndex === 0 ? v.a : v.b;
    if (v.win < 0) { d.d++; s.stats.draws++; } else if (v.win === myIndex) { d.w++; s.stats.wins++; } else { d.l++; s.stats.losses++; }
    d.b = Math.max(d.b, mine.total); s.duel[pid] = d; s.stats.duels++; s.set.piece = pid;
    return { store: s };
  }
  // いま遊べる部：予選はいつでも、次の部は前の部を「進めた」あと
  const unlockedRounds = store => ROUNDS.filter((R, i) => i === 0 || (store.r[ROUNDS[i - 1].id] && store.r[ROUNDS[i - 1].id].c)).map(R => R.id);

  // ---------------------------------------------------------------- 他団体との勝負：common/turnroom.js のアダプター
  // 2人（席 0 = ホスト、席 1）。ホストが曲をえらぶ → 2人とも同じ曲を指揮する → 点を送る → くらべる。席が CPU（足りない席をうめる）なら、その団体の演奏をホストが入れる。
  // 手（act）：{ t:'pick', c: 曲の番号 } / { t:'done', r:[16個の 0..255] } / { t:'quit' }（自分の棄権）/ { t:'forf', c: 席 }（ホストが、切れた席を棄権にする）
  // みんなに見える状態 pd：{ p: 曲の番号（-1 = まだ）, ph: 0 えらび中 | 1 演奏中 | 2 おしまい, ra: [16]（席0の点・あれば）, rb: [16]（席1の点・あれば） }
  const DUEL_PIECES = PIECE_IDS.slice();
  const duelHost = {
    create(o) { return { v: 1, seed: o.seed >>> 0, ph: 0, piece: -1, n: 2, humans: (o.humans || [0, 1]).slice(), res: [null, null] }; },
    turn: st => (st.ph === 0 ? 0 : -1),
    isOver: st => st.ph === 2,
    apply(st, seat, a) {
      if (!a || typeof a.t !== 'string' || st.ph === 2 || seat < 0 || seat > 1) return null;
      if (a.t === 'pick') {
        if (st.ph !== 0 || seat !== 0 || !Number.isInteger(a.c) || a.c < 0 || a.c >= DUEL_PIECES.length) return null;
        st.piece = a.c; st.ph = 1;
        [0, 1].forEach(k => { if (st.humans.indexOf(k) < 0) st.res[k] = { s: 1, v: perfToVec(cpuPerf(ENS_BY[DUEL_CPU[k]], DUEL_PIECES[st.piece], 'd')) }; });
        settle(st);
        return { ev: [{ t: 'pk', c: a.c }] };
      }
      if (st.ph !== 1) return null;
      if (a.t === 'done') { if (st.res[seat] || !validVec(a.r)) return null; const v = Array.isArray(a.r) ? a.r.slice() : Object.keys(a.r).sort((x, y) => x - y).map(k => a.r[k]); v[0] = 1; st.res[seat] = { s: 1, v }; settle(st); return { ev: [{ t: 'dn', s: seat }] }; }
      if (a.t === 'quit') { if (st.res[seat]) return null; st.res[seat] = { s: 2, v: null }; settle(st); return { ev: [{ t: 'qt', s: seat }] }; }
      if (a.t === 'forf') { if (seat !== 0 || !Number.isInteger(a.c) || a.c !== 1 || st.res[1]) return null; st.res[1] = { s: 2, v: null }; settle(st); return { ev: [{ t: 'ff', s: 1 }] }; }
      return null;
    },
    cpu: st => ({ t: 'pick', c: hash32('p' + st.seed) % DUEL_PIECES.length }),
    auto: st => ({ t: 'pick', c: hash32('p' + st.seed) % DUEL_PIECES.length }),
    pub(st) {
      const pd = { p: st.piece, ph: st.ph };
      if (st.res[0]) pd.ra = st.res[0].v || [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 0, 0];
      if (st.res[1]) pd.rb = st.res[1].v || [2, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 128, 0, 0];
      return pd;
    },
    priv() { return {}; },
    result(st) { return rankOf(DUEL_PIECES[st.piece], st.res[0] && st.res[0].v, st.res[1] && st.res[1].v); },
    fallback(pd) { return rankOf(pd && DUEL_PIECES[pd.p], pd && pd.ra, pd && pd.rb); },
    ser: st => JSON.stringify(st),
    de: s => JSON.parse(s),
  };
  function settle(st) { if (st.ph === 1 && st.res[0] && st.res[1]) st.ph = 2; }
  // 順位：棄権は最下位。ふたりとも演奏していれば審査員の多数決（verdict）
  function rankOf(pid, va, vb) {
    const pa = vecToPerf(va), pb = vecToPerf(vb), okA = pa && pa.status === 1, okB = pb && pb.status === 1;
    if (okA && okB && PIECES[pid]) { const v = verdict(pid, pa, pb); return v.win === 0 ? { r: [1, 2], w: 0 } : v.win === 1 ? { r: [2, 1], w: 1 } : { r: [1, 1], w: -1 }; }
    if (okA && !okB) return { r: [1, 2], w: 0 };
    if (okB && !okA) return { r: [2, 1], w: 1 };
    return { r: [1, 1], w: -1 };
  }
  // 画面側：model（turnroom）から、いま何をするところかを読む
  function duelView(m) {
    const pd = m.pd || {}, me = m.me >= 0 ? m.me : 0, op = 1 - me, own = vecToPerf(me === 0 ? pd.ra : pd.rb), opp = vecToPerf(op === 0 ? pd.ra : pd.rb);
    const pid = pd.p >= 0 && pd.p < DUEL_PIECES.length ? DUEL_PIECES[pd.p] : '';
    const res = { piece: pid, ph: pd.ph | 0, me, op, mine: own && own.status === 1 ? own : null, theirs: opp && opp.status === 1 ? opp : null, myOut: !!own, oppOut: !!opp, oppForfeit: !!(opp && opp.status === 2), meForfeit: !!(own && own.status === 2), names: m.names || ['', ''] };
    if (res.piece && res.mine && res.theirs) { res.verdict = me === 0 ? verdict(pid, res.mine, res.theirs) : verdict(pid, res.theirs, res.mine); res.winIndex = res.verdict.win; res.won = res.verdict.win === me; res.draw = res.verdict.win < 0; }
    return res;
  }

  // ---------------------------------------------------------------- 英語
  const EN = {
    '演奏がありませんでした。': 'There was no performance.',
    '拍・テンポ': 'Pulse & Tempo', '強弱': 'Dynamics', '入り': 'Entrances', '表現': 'Expression',
    '「{c}」{n}点。': '"{c}": {n} pts. ', '「{c}」は{n}点。': '"{c}": {n} pts. ',
    '拍の間隔がそろい、テンポの運びがとても安定していました。': 'The beats were evenly spaced and the tempo was very steady.',
    'テンポは大きく崩れませんでしたが、拍の間隔にゆれが残りました。': 'The tempo never collapsed, but the spacing of the beats wavered.',
    '拍がそろわず、テンポが落ち着きませんでした。': 'The beats were uneven and the tempo never settled.',
    '強弱の階段を、楽譜のとおりに上り下りできていました。': 'You climbed and descended the dynamic ladder exactly as written.',
    '強弱はおおむね楽譜に沿っていますが、切り替えが少し遅れがちでした。': 'The dynamics mostly followed the score, but changes came a little late.',
    '強弱が楽譜の指示から離れていました。': 'The dynamics strayed from the markings in the score.',
    '入りの合図が的確で、楽器たちの足並みがそろっていました。': 'Your cues were precise and the sections moved as one.',
    '入りは合いましたが、合図のタイミングにばらつきがありました。': 'The entrances landed, but the timing of the cues was uneven.',
    '入りの取りこぼしが目立ち、アンサンブルがばらけました。': 'Missed entrances stood out and the ensemble came apart.',
    '音楽の流れが途切れず、フレーズの山と谷が自然に描かれていました。': 'The music never broke its flow and the peaks and valleys of each phrase felt natural.',
    '流れはつながっていますが、強弱の動きがややぎこちなく感じました。': 'The flow held together, but the movement of the dynamics felt slightly awkward.',
    '音楽の流れが途切れがちで、表現が伝わりにくい演奏でした。': 'The flow kept breaking, so the expression was hard to hear.',
    '拍の間隔の乱れ（そろい {n}）が気になりました。基本の拍が、すべての土台です。': 'The unevenness of the beats (steadiness {n}) bothered me. A steady pulse is the foundation of everything.',
    '拍のそろいは {n}。基本がしっかりしています。': 'Beat steadiness {n}. The basics are solid.',
    'フレーズに歌があり、思わず聴き入りました。': 'The phrases sang, and I found myself listening closely.',
    '歌心がもう少し欲しいところです。流れを止めない振りを。': 'I wanted a little more song. Keep the baton flowing without stopping.',
    '表現は誠実でした。もう一歩の大胆さに期待します。': 'The expression was sincere. I hope for one more step of boldness.',
    '全体に音が大きすぎて、古典の様式から外れました。': 'It was too loud overall, outside the classical style.',
    '全体に音が小さく、古典の様式としては控えめすぎました。': 'It was too quiet overall, too restrained even for the classical style.',
    '音量の釣り合いが保たれ、様式感がありました。': 'The volume stayed balanced, and the style came across.',
    'この曲は入りが少なく、拍のそろい方を中心に聴きました。': 'This piece has few entrances, so I listened mostly to how the beats lined up.',
    '入りの取りこぼしが{n}回。アンサンブルでは、ひとつの遅れが全員に響きます。': '{n} missed entrances. In an ensemble, one late player affects everyone.',
    '入りの取りこぼしはゼロ。見事な統率でした。': 'Not a single missed entrance. Superb command.',
    '途中で止まったこと（{n}回）は減点です。最後まで流れを保ちましょう。': 'Stopping midway ({n} times) costs points. Keep the flow to the end.',
    '聴き手として、最後まで音楽に集中できました。': 'As a listener, I could focus on the music to the very end.',
    '古典派の曲なので、とくに厳しく聴きました。': 'It is a classical piece, so I listened especially strictly.',
    'ロマン派の曲で、思い入れも強く聴きました。': 'A romantic piece, and I listened with extra fondness.',
    '予選': 'Qualifier', '本選': 'Semifinal', '全国大会': 'Nationals', '勝負': 'Duel',
    '金賞': 'Gold', '銀賞': 'Silver', '銅賞': 'Bronze', '賞なし': 'No medal',
  };
  // 日本語の名前を英語にするための表（画面から使う）
  const NAMES = { rounds: ROUNDS.map(r => r.name), judges: JUDGES.map(j => j.name) };

  return { EDITION, HIST_MAX, CATS, CATN, DIFF, diffFor, PIECES, PIECE_IDS, DUEL_PIECES, pieceDiff, freeBonus, ROUNDS, ROUND_BY, DUEL_ROUND, roundOf, ENSEMBLES, ENS_BY, DUEL_CPU, cpuFree, JUDGES, MEDALS,
    hash32, rng, gauss, extract, analyse, perfToVec, vecToPerf, validVec, cpuPerf, weightsFor, judgeScore, judgePiece, trimmed, comment, medalIndex, entryOf, rivalEntry, field, awards, verdict,
    defStore, readStore, recordRound, recordDuel, unlockedRounds, duel: { host: duelHost, rankOf, view: duelView, pieces: DUEL_PIECES, toWire: perf => ({ t: 'done', r: perfToVec(perf) }), pickWire: i => ({ t: 'pick', c: i }), quitWire: () => ({ t: 'quit' }), forfWire: () => ({ t: 'forf', c: 1 }) },
    EN, NAMES };
});
