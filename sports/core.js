// ぽかぽか島スポーツ：共通の土台（pure。画面・時計・組み込みの乱数に頼らない。UMD：ブラウザは window.SportsCore、node は require）。
// 乱数は種つきの mulberry32。同じ種・同じ入力なら毎回同じ結果になる（デイリーは日付から種を作る）。
// ここにあるもの：種つき乱数・種目の一覧と★のしきい値・保存の読み込みと記録・デイリー・ボウリング／テニス／卓球の得点の決まり。
(function (root) {
  'use strict';

  // ---------- 乱数・ハッシュ ----------
  function hash32(s) { s = String(s); let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const num = (v, d) => (typeof v === 'number' && isFinite(v) ? v : d);
  // 正規分布ふうのゆらぎ（-1〜1 くらい）。3つの一様乱数の平均
  const gauss = r => (r() + r() + r() - 1.5) / 1.5;

  // ---------- 種目 ----------
  // thr[難しさ 0..2] = [★1, ★2, ★3] のしきい値（点数は大きいほどよい）。mode: 'turn' = 1回ずつ投げる／打つ、'real' = リアルタイム
  // map: 島の地図の上の場所（0〜1）。col: 種目の色。
  const DIFFS = ['easy', 'normal', 'hard'];
  const SPORTS = [
    { id: 'archery', bit: 0, ja: 'アーチェリー', en: 'Archery', mode: 'turn', col: '#e5484d', map: [0.20, 0.30], two: 'pass',
      thr: [[65, 82, 93], [50, 68, 80], [30, 44, 56]] },
    { id: 'disc', bit: 1, ja: 'ディスクドッグ', en: 'Disc Dog', mode: 'turn', col: '#f5a524', map: [0.50, 0.17], two: 'pass',
      thr: [[30, 55, 80], [30, 52, 75], [25, 45, 65]] },
    { id: 'bowling', bit: 2, ja: 'ボウリング', en: 'Bowling', mode: 'turn', col: '#7c5cff', map: [0.80, 0.30], two: 'pass',
      thr: [[70, 110, 150], [75, 115, 155], [75, 110, 145]] },
    { id: 'kendo', bit: 3, ja: 'チャンバラ', en: 'Sword Play', mode: 'real', col: '#2fb67c', map: [0.13, 0.55], two: 'pass',
      thr: [[800, 1800, 2800], [800, 1800, 2800], [800, 1800, 3000]] },
    { id: 'hoops', bit: 4, ja: 'バスケシュート', en: 'Hoops', mode: 'turn', col: '#ff7a33', map: [0.37, 0.43], two: 'pass',
      thr: [[10, 17, 24], [8, 14, 21], [6, 11, 17]] },
    { id: 'golf', bit: 5, ja: 'ゴルフ', en: 'Golf', mode: 'turn', col: '#3aa655', map: [0.62, 0.45], two: 'pass',
      thr: [[70, 90, 105], [60, 80, 92], [50, 68, 80]] },
    { id: 'canoe', bit: 6, ja: 'カヌー', en: 'Canoe', mode: 'real', col: '#1aa7c8', map: [0.88, 0.58], two: 'split',
      thr: [[120, 170, 215], [110, 160, 205], [100, 150, 195]] },
    { id: 'pingpong', bit: 7, ja: '卓球', en: 'Table Tennis', mode: 'real', col: '#e6567a', map: [0.28, 0.72], two: 'versus',
      thr: [[70, 105, 135], [80, 120, 160], [90, 140, 185]] },
    { id: 'cycling', bit: 8, ja: 'サイクリング', en: 'Cycling', mode: 'real', col: '#8a6bd6', map: [0.55, 0.78], two: 'pass',
      thr: [[190, 250, 285], [160, 215, 245], [140, 190, 215]] },
    { id: 'jump', bit: 9, ja: '水上ジャンプ', en: 'Water Jump', mode: 'real', col: '#0b9be6', map: [0.80, 0.82], two: 'pass',
      thr: [[70, 95, 115], [65, 90, 112], [55, 80, 105]] },
    { id: 'tennis', bit: 10, ja: 'テニス', en: 'Tennis', mode: 'real', col: '#9ac12b', map: [0.40, 0.92], two: 'versus',
      thr: [[60, 100, 130], [60, 100, 135], [70, 115, 150]] },
  ];
  const SPORT_IDS = SPORTS.map(s => s.id);
  const sportOf = id => SPORTS.find(s => s.id === id) || null;
  // 難しさの名前
  const DIFF_NAMES = { ja: ['やさしい', 'ふつう', 'むずかしい'], en: ['Easy', 'Normal', 'Hard'] };

  // ---------- ★ ----------
  function starsFor(id, diff, score) {
    const s = sportOf(id); if (!s) return 0;
    const t = s.thr[clamp(diff | 0, 0, 2)]; let n = 0;
    for (let i = 0; i < 3; i++) if (score >= t[i]) n = i + 1;
    return n;
  }

  // ---------- 保存 ----------
  const STAT_KEYS = ['plays', 'daily', 'twop', 'wins2p', 'stars3', 'strikes', 'spares', 'turkey', 'perfect', 'bulls', 'hio', 'birdie', 'swish', 'catches', 'parry', 'ace', 'jumpM', 'canoeW', 'cycW', 'rallyW', 'streak', 'tiltOn', 'tutAll', 'clears', 'flights', 'photos', 'rings', 'landings', 'pops'];
  function newSave() { return { v: 1, pts: 0, b: {}, x: {}, dl: { k: 0, id: '', sc: 0, st: 0 }, stats: {}, set: { sens: 1, tilt: 0, vib: 1, who: 0, lp: 0, last: {} }, fl: { b: [0, 0, 0], ph: 0, n: 0 }, tm: 0, tu: 0, tut: 0 }; }
  function sanitize(o) {
    const s = newSave();
    if (!o || typeof o !== 'object') return s;
    for (const sp of SPORTS) {
      const b = o.b && Array.isArray(o.b[sp.id]) ? o.b[sp.id] : null;
      if (b) s.b[sp.id] = [0, 1, 2].map(i => Math.max(0, Math.min(999999, Math.floor(num(b[i], 0)))));
      const x = o.x && Array.isArray(o.x[sp.id]) ? o.x[sp.id] : null;
      if (x) s.x[sp.id] = [0, 1, 2].map(i => Math.max(0, Math.min(999999, Math.floor(num(x[i], 0)))));
    }
    if (o.dl && typeof o.dl === 'object') s.dl = { k: Math.max(0, Math.floor(num(o.dl.k, 0))), id: typeof o.dl.id === 'string' && sportOf(o.dl.id) ? o.dl.id : '', sc: Math.max(0, Math.floor(num(o.dl.sc, 0))), st: clamp(Math.floor(num(o.dl.st, 0)), 0, 3) };
    if (o.stats && typeof o.stats === 'object') for (const k of STAT_KEYS) { const v = Math.floor(num(o.stats[k], 0)); if (v > 0) s.stats[k] = Math.min(v, 99999999); }
    if (o.set && typeof o.set === 'object') {
      s.set.sens = clamp(num(o.set.sens, 1), 0.5, 1.5); s.set.tilt = o.set.tilt ? 1 : 0; s.set.lp = o.set.lp ? 1 : 0; s.set.vib = o.set.vib === 0 ? 0 : 1;
      s.set.who = clamp(Math.floor(num(o.set.who, 0)), 0, 3);
      if (o.set.last && typeof o.set.last === 'object') for (const sp of SPORTS) { const v = o.set.last[sp.id]; if (v === 0 || v === 1 || v === 2) s.set.last[sp.id] = v; }
    }
    if (o.fl && typeof o.fl === 'object') { const b = Array.isArray(o.fl.b) ? o.fl.b : []; s.fl = { b: [0, 1, 2].map(i => Math.max(0, Math.min(999999, Math.floor(num(b[i], 0))))), ph: Math.max(0, Math.floor(num(o.fl.ph, 0))) & 0xffff, n: Math.max(0, Math.min(99999999, Math.floor(num(o.fl.n, 0)))) }; }
    s.tm = Math.max(0, Math.floor(num(o.tm, 0))) & 0x7ff; s.tu = Math.max(0, Math.floor(num(o.tu, 0))) & 0x7ff; s.tut = o.tut ? 1 : 0;
    derive(s);
    return s;
  }
  function derive(s) { s.pts = totalStars(s); return s; }
  function bestOf(s, id, diff) { const b = s.b[id]; return b ? b[diff] | 0 : 0; }
  function starsOf(s, id, diff) { return starsFor(id, diff, bestOf(s, id, diff)); }
  function sportStars(s, id) { return starsOf(s, id, 0) + starsOf(s, id, 1) + starsOf(s, id, 2); }
  function totalStars(s) { let n = 0; for (const sp of SPORTS) n += sportStars(s, sp.id); return n; }
  const MAX_STARS = SPORTS.length * 9;
  // 記録する。{ isBest, stars, newStars（この難しさで増えた★）, prev }
  function record(s, id, diff, score, extra) {
    diff = clamp(diff | 0, 0, 2); score = Math.max(0, Math.min(999999, Math.floor(score)));
    const b = s.b[id] || (s.b[id] = [0, 0, 0]), prev = b[diff], ps = starsFor(id, diff, prev), ns = starsFor(id, diff, score);
    const isBest = score > prev; if (isBest) b[diff] = score;
    if (extra != null && isFinite(extra)) { const x = s.x[id] || (s.x[id] = [0, 0, 0]); if (!x[diff] || (LOWER_BETTER[id] ? extra < x[diff] : extra > x[diff])) x[diff] = Math.max(1, Math.min(999999, Math.round(extra))); }
    s.tm |= 1 << (sportOf(id) ? sportOf(id).bit : 0);
    derive(s);
    return { isBest, stars: ns, newStars: Math.max(0, ns - ps), prev };
  }
  const LOWER_BETTER = { canoe: true, cycling: true, golf: true };
  function bump(s, key, n) { s.stats[key] = Math.min(99999999, (s.stats[key] | 0) + (n == null ? 1 : n)); }
  function setMax(s, key, v) { v = Math.floor(v); if (v > (s.stats[key] | 0)) s.stats[key] = Math.min(99999999, v); }

  // ---------- デイリー ----------
  // 日付（YYYYMMDD）から、きょうの種目・種・難しさが決まる。種目は日がわりで、同じ日は世界じゅう同じ。
  function dayNumber(dateKey) { const y = Math.floor(dateKey / 10000), m = Math.floor(dateKey / 100) % 100, d = dateKey % 100; return Math.floor(Date.UTC(y, m - 1, d) / 86400000); }
  function dailyOf(dateKey) {
    dateKey = Math.floor(num(dateKey, 20260101));
    const n = dayNumber(dateKey), idx = ((n * 5 + (hash32('sports-day:' + (n >> 3)) % SPORTS.length)) % SPORTS.length + SPORTS.length) % SPORTS.length;
    const sport = SPORTS[idx].id;
    return { dateKey, sport, diff: 1, seed: hash32('sports:' + dateKey + ':' + sport) };
  }
  // デイリーの★：ふつうの★のしきい値をそのまま使う（きょうの種で1回）
  function dailyStars(id, score) { return starsFor(id, 1, score); }

  // ---------- ボウリングの得点（10フレーム。rolls はそれまでに倒した本数の並び） ----------
  // 返す値：{ frames:[{ r:[…], cum:数|null, strike, spare }]×10, total, done, next:{ frame, ball } }
  // cum は、そのフレームまでの合計（ストライク・スペアのボーナスが決まるまでは null）。total は決まっているところまでの合計
  function bowlingScore(rolls) {
    const frames = []; let i = 0, cum = 0, cumOk = true, alive = true, next = { frame: 10, ball: 0 }, done = false;
    for (let f = 0; f < 10; f++) {
      const fr = { r: [], cum: null, strike: false, spare: false }; frames.push(fr);
      if (!alive) continue;
      const a = rolls[i];
      if (a == null) { alive = false; next = { frame: f, ball: 0 }; continue; }
      if (f < 9) {
        if (a === 10) { fr.r = [10]; fr.strike = true; const b = rolls[i + 1], c = rolls[i + 2]; if (cumOk && b != null && c != null) { cum += 10 + b + c; fr.cum = cum; } else cumOk = false; i += 1; }
        else {
          const b = rolls[i + 1];
          if (b == null) { fr.r = [a]; alive = false; cumOk = false; next = { frame: f, ball: 1 }; i += 1; continue; }
          fr.r = [a, b]; const c = rolls[i + 2];
          if (a + b === 10) { fr.spare = true; if (cumOk && c != null) { cum += 10 + c; fr.cum = cum; } else cumOk = false; }
          else if (cumOk) { cum += a + b; fr.cum = cum; }
          i += 2;
        }
      } else {
        const r = [a], b = rolls[i + 1], c = rolls[i + 2]; let fin = false;
        if (b != null) r.push(b);
        if (a === 10) { fr.strike = true; if (b != null && c != null) { r.push(c); fin = true; } }
        else if (b != null) { if (a + b === 10) { fr.spare = true; if (c != null) { r.push(c); fin = true; } } else fin = true; }
        fr.r = r;
        if (fin) { done = true; if (cumOk) { cum += r.reduce((x, y) => x + y, 0); fr.cum = cum; } next = { frame: 10, ball: 0 }; } else { next = { frame: 9, ball: r.length }; cumOk = false; }
        i += r.length;
      }
    }
    let last = 0; for (const f of frames) if (f.cum != null) last = f.cum;
    return { frames, total: last, done, next };
  }

  // ---------- 卓球とテニスの得点の決まり ----------
  // 卓球：target 点先取、2点差。サーブは2点ごとに交代、target-1 同士（デュース）からは1点ごと。first は最初にサーブする人（0|1）
  function ttDone(a, b, target) { target = target || 11; return (a >= target || b >= target) && Math.abs(a - b) >= 2 ? (a > b ? 0 : 1) : -1; }
  function ttServer(a, b, first, target) {
    target = target || 11; const n = a + b, lim = 2 * (target - 1);
    const sw = n < lim ? Math.floor(n / 2) : (target - 1) + (n - lim);
    return (first + sw) % 2;
  }
  // テニス：1ゲーム。a, b はそのゲームの点（0,1,2,3,…）。ラベルは '0' '15' '30' '40' 'AD'
  const TL = ['0', '15', '30', '40'];
  function tennisGameWinner(a, b) { return (a >= 4 || b >= 4) && Math.abs(a - b) >= 2 ? (a > b ? 0 : 1) : -1; }
  function tennisLabel(a, b) {
    const w = tennisGameWinner(a, b); if (w >= 0) return { a: w === 0 ? 'G' : '', b: w === 1 ? 'G' : '', text: 'game' };
    if (a >= 3 && b >= 3) { if (a === b) return { a: '40', b: '40', text: 'deuce' }; return a > b ? { a: 'AD', b: '40', text: 'adv' } : { a: '40', b: 'AD', text: 'adv' }; }
    return { a: TL[a], b: TL[b], text: '' };
  }
  // 1セットマッチ：先に to ゲーム（既定 4。to-1 同士になったら次の1ゲームで決まる）
  function tennisSetWinner(ga, gb, to) { to = to || 4; return ga >= to ? 0 : gb >= to ? 1 : -1; }
  function tennisServer(gamesPlayed, first) { return (first + gamesPlayed) % 2; }

  const api = { hash32, rng, clamp, num, gauss, DIFFS, DIFF_NAMES, SPORTS, SPORT_IDS, sportOf, starsFor, newSave, sanitize, derive, bestOf, starsOf, sportStars, totalStars, MAX_STARS, record, bump, setMax, LOWER_BETTER,
    dayNumber, dailyOf, dailyStars, bowlingScore, ttDone, ttServer, tennisGameWinner, tennisLabel, tennisSetWinner, tennisServer, STAT_KEYS };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SportsCore = api;
})(typeof window !== 'undefined' ? window : globalThis);
