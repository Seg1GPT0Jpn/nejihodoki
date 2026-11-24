// でんしゃでいこう（train）：決まった結果の運転の中身。1/60秒の固定刻み。node でもブラウザでも動く（window.TrainEngine）。
// ぜんぶ自作の架空の路線（ひなた本線・うみかぜ線・ほしぞら線）。実在の会社・車両・駅名は使わない。
// 乱数は使わない（同じ入力なら、同じ運転・同じ点数）。距離は m、速さは m/s（画面は km/h）、時間は秒。
// ノッチ：-8＝非常ブレーキ、-7〜-1＝ブレーキ B7〜B1、0＝切（惰行）、1〜5＝力行 P1〜P5。
(function (root) {
  'use strict';
  const DT = 1 / 60;
  const KMH = 3.6;
  const rd = (v, k) => { k = k || 1000; return Math.round(v * k) / k; };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const hash32 = s => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };

  // ------------------------------------------------------------------ 車両（架空の4両の電車）
  const VEH = {
    len: 80,                       // 編成の長さ m（見た目だけ）
    vmax: 30,                      // 力行の限界 m/s
    pow: [0, 0.22, 0.44, 0.66, 0.86, 1.05],              // P0〜P5 の加速（低い速さのとき m/s²）
    brk: [0, 0.13, 0.26, 0.39, 0.52, 0.65, 0.78, 0.91, 1.25], // B0〜B7、非常 m/s²
    tauT: 0.5, tauB: 0.55, tauE: 0.22,                  // 力行・ブレーキ・非常ブレーキが効くまでの時間 s
  };
  const WEATHER = {
    clear: { tr: 1, br: 1, view: 1 }, cloud: { tr: 1, br: 1, view: 0.95 }, rain: { tr: 0.93, br: 0.84, view: 0.6 },
    snow: { tr: 0.82, br: 0.7, view: 0.5 }, fog: { tr: 1, br: 0.95, view: 0.22 },
  };
  const NOTCH_MIN = -8, NOTCH_MAX = 5;

  // ------------------------------------------------------------------ 路線（ぜんぶ架空）
  // 道のりは、ひまつぶしに合う長さにちぢめてある（駅と駅のあいだは 500〜600m）
  const SC = 0.62, sc = v => Math.round(v * SC / 5) * 5;
  const STATIONS = [
    { id: 'tsukushi', x: 0, name: { ja: 'つくし台', en: 'Tsukushi Heights' } },
    { id: 'komorebi', x: 850, name: { ja: 'こもれび', en: 'Komorebi' } },
    { id: 'mizuho', x: 1750, name: { ja: 'みずほ橋', en: 'Mizuho Bridge' } },
    { id: 'kazaguruma', x: 2700, name: { ja: 'かざぐるま', en: 'Kazaguruma' } },
    { id: 'nanairo', x: 3500, name: { ja: 'なないろ町', en: 'Nanairo Town' } },
    { id: 'shirogane', x: 4450, name: { ja: 'しろがね', en: 'Shirogane' } },
    { id: 'akane', x: 5300, name: { ja: 'あかね坂', en: 'Akane Hill' } },
    { id: 'umikaze', x: 6250, name: { ja: 'うみかぜ', en: 'Umikaze' } },
    { id: 'hinata', x: 7050, name: { ja: 'ひなた港', en: 'Hinata Harbor' } },
    { id: 'hoshizora', x: 8100, name: { ja: 'ほしぞら山', en: 'Mt. Hoshizora' } },
  ];
  STATIONS.forEach(S => { S.x = sc(S.x); });
  const NET_END = sc(8300);
  // 路線の区間ごとの制限（km/h）と景色
  const SECTIONS = [
    { a: 0, b: 3500, kmh: 65, theme: 'meadow' },
    { a: 3500, b: 6300, kmh: 75, theme: 'sea' },
    { a: 6300, b: 9000, kmh: 85, theme: 'mountain' },
  ];
  // カーブ・橋・トンネルの手前などの速度制限（km/h）
  const ZONES = [
    { a: 1100, b: 1450, kmh: 40 }, { a: 2200, b: 2450, kmh: 45 }, { a: 3050, b: 3250, kmh: 40 }, { a: 4050, b: 4300, kmh: 45 },
    { a: 4800, b: 5100, kmh: 50 }, { a: 5600, b: 5850, kmh: 40 }, { a: 6600, b: 6850, kmh: 55 }, { a: 7350, b: 7600, kmh: 45 },
    { a: 7700, b: 7900, kmh: 55 },
  ];
  const GRADES = [ // こう配（上りが +）
    { a: 250, b: 650, g: 0.012 }, { a: 1000, b: 1500, g: -0.02 }, { a: 1900, b: 2500, g: 0.025 }, { a: 2900, b: 3300, g: -0.03 },
    { a: 3650, b: 4250, g: 0.015 }, { a: 4600, b: 5100, g: -0.02 }, { a: 5450, b: 6000, g: 0.02 }, { a: 6400, b: 6850, g: -0.015 },
    { a: 7150, b: 7700, g: 0.03 }, { a: 7700, b: 7850, g: -0.02 },
  ];
  const CURVES = [ // 絵のためのカーブ（+ は右）
    { a: 1100, b: 1450, k: 1 }, { a: 2200, b: 2450, k: -1 }, { a: 3050, b: 3250, k: 1.2 }, { a: 4050, b: 4300, k: -1 },
    { a: 4800, b: 5100, k: 1 }, { a: 5600, b: 5850, k: -1.2 }, { a: 6600, b: 6850, k: 1 }, { a: 7350, b: 7600, k: -1 }, { a: 7700, b: 7900, k: 0.8 },
  ];
  const SIGNALS = [ // c＝注意の信号（黄→青）、s＝止まれの信号（赤→黄→青）
    { id: 's1', x: 480, kind: 'c' }, { id: 's2', x: 1380, kind: 's' }, { id: 's3', x: 2300, kind: 'c' }, { id: 's4', x: 3150, kind: 's' },
    { id: 's5', x: 3950, kind: 'c' }, { id: 's6', x: 4800, kind: 's' }, { id: 's7', x: 5700, kind: 'c' }, { id: 's8', x: 6550, kind: 's' },
    { id: 's9', x: 7400, kind: 's' }, { id: 's10', x: 7800, kind: 'c' },
  ];
  const TUNNELS = [{ a: 6700, b: 6950 }, { a: 7450, b: 7650 }]; // 絵だけ
  const BRIDGES = [{ a: 3050, b: 3250 }, { a: 1750 - 260, b: 1750 - 120 }];
  const scaleA = list => list.forEach(z => { z.a = sc(z.a); z.b = sc(z.b); });
  [SECTIONS, ZONES, GRADES, CURVES, TUNNELS, BRIDGES].forEach(scaleA);
  SIGNALS.forEach(z => { z.x = sc(z.x); });
  SECTIONS[SECTIONS.length - 1].b = 99999;

  const LINES = [
    { id: 'l1', name: { ja: 'ひなた本線', en: 'Hinata Main Line' }, need: 0, color: '#3aa05c' },
    { id: 'l2', name: { ja: 'うみかぜ線', en: 'Umikaze Line' }, need: 4, color: '#2f86d6' },
    { id: 'l3', name: { ja: 'ほしぞら線', en: 'Hoshizora Line' }, need: 12, color: '#7b5bd6' },
  ];
  const ROUTES = [
    { id: 'r1', line: 'l1', stops: [0, 1, 2], weather: 'clear', tod: 'day', cap: 55, bonus: 0, sig: 0, slack: 1.18, add: 6, level: 1,
      name: { ja: 'はじめてのでんしゃ', en: 'First Ride' }, desc: { ja: '2つの駅に、ゆっくり止まろう。信号はなし', en: 'Two gentle stops. No signals.' } },
    { id: 'r2', line: 'l1', stops: [0, 1, 2, 3, 4], weather: 'cloud', tod: 'day', cap: 65, bonus: 0, sig: 1, slack: 1.12, add: 4, level: 1,
      name: { ja: 'ひなた各駅停車', en: 'Hinata Local' }, desc: { ja: '5つの駅をぜんぶ止まる。黄色い信号は速度を落とす', en: 'All five stops. Slow down at yellow signals.' } },
    { id: 'r3', line: 'l1', stops: [0, 2, 4], weather: 'clear', tod: 'dusk', cap: 80, bonus: 15, sig: 1, slack: 1.08, add: 4, level: 2,
      name: { ja: 'ゆうやけ快速', en: 'Sunset Rapid' }, desc: { ja: 'こもれびとかざぐるまは通過。夕やけの中を速く、でも時間どおりに', en: 'Pass two stations at speed, on time, into the sunset.' } },
    { id: 'r4', line: 'l2', stops: [4, 5, 6, 7], weather: 'clear', tod: 'day', cap: 75, bonus: 0, sig: 1, slack: 1.1, add: 4, level: 2,
      name: { ja: 'うみかぜ各駅', en: 'Seaside Local' }, desc: { ja: '海ぞいを走る。長いくだり坂に気をつけて', en: 'Run along the sea. Mind the long downhill.' } },
    { id: 'r5', line: 'l2', stops: [4, 6, 7], weather: 'rain', tod: 'day', cap: 70, bonus: 0, sig: 2, slack: 1.12, add: 5, level: 3,
      name: { ja: 'あめのうみかぜ', en: 'Rainy Seaside' }, desc: { ja: '雨でレールがぬれて、ブレーキが効きにくい。止まれの信号も', en: 'Wet rails: brakes bite less. Red signals ahead.' } },
    { id: 'r6', line: 'l2', stops: [4, 5, 7], weather: 'clear', tod: 'night', cap: 85, bonus: 10, sig: 2, slack: 1.07, add: 4, level: 3,
      name: { ja: 'よぞらライナー', en: 'Midnight Liner' }, desc: { ja: '夜の海ぞいを速く走る。信号が見えたらすぐ判断', en: 'A fast night run. React to signals the moment you see them.' } },
    { id: 'r7', line: 'l3', stops: [6, 7, 8, 9], weather: 'clear', tod: 'night', cap: 85, bonus: 0, sig: 2, slack: 1.08, add: 4, level: 3,
      name: { ja: 'ほしぞら各駅', en: 'Starlight Local' }, desc: { ja: '星空の下、山へのぼる。上り坂でスピードが落ちる', en: 'Climb into the mountains under the stars.' } },
    { id: 'r8', line: 'l3', stops: [5, 7, 8, 9], weather: 'snow', tod: 'night', cap: 75, bonus: 0, sig: 2, slack: 1.12, add: 5, level: 4,
      name: { ja: 'ゆきのほしぞら', en: 'Snowy Starlight' }, desc: { ja: '雪の夜。ブレーキがとても長い。早めに早めに', en: 'Snow at night. Brake early, brake gently.' } },
    { id: 'r9', line: 'l3', stops: [3, 5, 7, 9], weather: 'fog', tod: 'night', cap: 100, bonus: 15, sig: 2, slack: 1.06, add: 4, level: 5,
      name: { ja: 'ひなた特急 ぜんせん', en: 'Grand Limited' }, desc: { ja: '霧の夜の長い旅。いちばん速く、いちばん正確に', en: 'The long run through night fog. Fast and precise.' } },
  ];
  const ROUTE_IDS = ROUTES.map(r => r.id);
  const byId = id => { for (const r of ROUTES) if (r.id === id) return r; return null; };

  // ------------------------------------------------------------------ 路線の見え方（位置 x → 値）
  function baseKmh(x) { for (const s of SECTIONS) if (x < s.b) return s.kmh; return SECTIONS[SECTIONS.length - 1].kmh; }
  function themeAt(x) { for (const s of SECTIONS) if (x < s.b) return s.theme; return SECTIONS[SECTIONS.length - 1].theme; }
  function gradeAt(x) { for (const z of GRADES) if (x >= z.a && x < z.b) { const m = Math.min(x - z.a, z.b - x, 60) / 60; return z.g * m; } return 0; }
  function curveAt(x) { for (const z of CURVES) if (x >= z.a && x < z.b) return z.k * Math.min(1, Math.min(x - z.a, z.b - x) / 60); return 0; }
  const inList = (list, x) => { for (const z of list) if (x >= z.a && x < z.b) return z; return null; };
  // 路線 R での、その場所の制限（km/h）。駅の手前の速度制限・通過駅の制限もふくむ
  function limitAt(R, x) {
    let l = Math.min(R.cap, baseKmh(x) + R.bonus);
    for (const z of ZONES) if (x >= z.a && x < z.b && z.kmh < l) l = z.kmh;
    for (const si of R.stops) {
      const sx = STATIONS[si].x, last = si === R.stops[R.stops.length - 1];
      if (x >= sx - 230 && x < sx + (last ? 60 : 40) && 50 < l) l = 50;
    }
    const stopSet = R.stops;
    for (let i = 0; i < STATIONS.length; i++) {
      if (stopSet.indexOf(i) >= 0) continue;
      const sx = STATIONS[i].x;
      if (x >= sx - 120 && x < sx + 120 && 60 < l && sx > STATIONS[stopSet[0]].x && sx < STATIONS[stopSet[stopSet.length - 1]].x) l = 60;
    }
    return l;
  }

  // ------------------------------------------------------------------ ダイヤ（時刻表）
  const AP = 0.85, AB = 0.65, DWELL = 8, START_DEP = 6, MIN_DWELL = 4;
  // x0 から x1 まで、止まってから止まるまでの、制限を守った最短の時間（s）。10m ごとの速さの表も返す
  function profile(R, x0, x1, v0, v1) {
    const ds = 10, n = Math.max(1, Math.ceil((x1 - x0) / ds));
    const vl = [], v = [];
    for (let i = 0; i <= n; i++) vl.push(Math.min(limitAt(R, x0 + Math.min(i, n - 1) * ds + 5) / KMH, VEH.vmax));
    v[0] = Math.min(v0, vl[0]);
    for (let i = 0; i < n; i++) v[i + 1] = Math.min(vl[i], Math.sqrt(v[i] * v[i] + 2 * AP * ds));
    v[n] = Math.min(v[n], v1);
    for (let i = n - 1; i >= 0; i--) v[i] = Math.min(v[i], Math.sqrt(v[i + 1] * v[i + 1] + 2 * AB * ds));
    const cum = [0];
    for (let i = 0; i < n; i++) cum.push(cum[i] + 2 * ds / Math.max(0.6, v[i] + v[i + 1]));
    return { ds, n, x0, x1, v, cum, total: cum[n] };
  }
  const plans = {};
  function plan(id) {
    if (plans[id]) return plans[id];
    const R = byId(id);
    const stops = [], legs = [];
    let t = 0;
    R.stops.forEach((si, k) => {
      const S = STATIONS[si], st = { k, si, id: S.id, x: S.x, name: S.name, last: k === R.stops.length - 1, sArr: 0, sDep: 0 };
      if (k === 0) { st.sArr = 0; st.sDep = START_DEP; t = START_DEP; }
      else {
        const prev = stops[k - 1], pf = profile(R, prev.x, S.x, 0, 0);
        const run = Math.ceil(pf.total * R.slack + R.add);
        st.sArr = t + run; st.sDep = st.sArr + DWELL; t = st.sDep;
        legs.push({ k: k - 1, from: prev, to: st, pf, ideal: pf.total, run, t0: prev.sDep });
      }
      stops.push(st);
    });
    const P = { id, R, stops, legs, sigs: [] };
    // この路線で見える信号と、いつ変わるか
    if (R.sig > 0) {
      for (const sg of SIGNALS) {
        if (sg.x <= stops[0].x + 200 || sg.x >= stops[stops.length - 1].x - 150) continue;
        const ref = timeAtPlan(P, sg.x);
        const kind = R.sig === 1 ? 'c' : sg.kind;
        P.sigs.push({ id: sg.id, x: sg.x, kind, ref, clear: kind === 's' ? ref - 16 : ref - 8 });
      }
    }
    plans[id] = P;
    return P;
  }
  // ダイヤで、その場所を通る予定の時刻
  function timeAtPlan(P, x) {
    for (const L of P.legs) {
      if (x >= L.from.x && x <= L.to.x) {
        const pf = L.pf, f = clamp((x - pf.x0) / pf.ds, 0, pf.n), i = Math.min(pf.n - 1, Math.floor(f));
        const ti = pf.cum[i] + (pf.cum[i + 1] - pf.cum[i]) * (f - i);
        return L.t0 + ti / pf.total * L.run;
      }
    }
    return x < P.stops[0].x ? 0 : P.stops[P.stops.length - 1].sArr;
  }
  const timeAt = (id, x) => timeAtPlan(plan(id), x);
  function aspect(sg, t) {
    if (sg.kind === 's') return t < sg.clear ? 'r' : t < sg.clear + 9 ? 'y' : 'g';
    return t < sg.clear ? 'y' : 'g';
  }

  // ------------------------------------------------------------------ 物理
  function gradeNow(x) { return gradeAt(x); }
  // p = { x, v, tr, br }。n は実際に効いているノッチ。1ステップぶん進める。止まった瞬間は p.stopped に力を残す
  function advance(p, n, dt, W) {
    const tT = n > 0 ? VEH.pow[n] * W.tr : 0;
    const bT = n < 0 ? VEH.brk[-n] * W.br : 0;
    p.tr += (tT - p.tr) * (1 - Math.exp(-dt / VEH.tauT));
    p.br += (bT - p.br) * (1 - Math.exp(-dt / (n <= -8 ? VEH.tauE : VEH.tauB)));
    const fade = Math.max(0, 1 - (p.v / VEH.vmax) * (p.v / VEH.vmax));
    const drive = p.tr * fade - p.br;
    p.drive = drive;
    const g = -9.8 * gradeAt(p.x);
    p.stopped = 0;
    if (p.v <= 0) {
      const net = p.tr * fade + g - 0.012;
      if (n < 0 || net <= 0) { p.v = 0; return; } // 止まっている：ブレーキをかけていれば動かない
      p.v = Math.max(0, net * dt); p.x += p.v * dt; return;
    }
    const res = 0.012 + 0.0004 * p.v + 0.00002 * p.v * p.v;
    let a = drive - res + g;
    let v2 = p.v + a * dt;
    if (v2 <= 0) {
      // 止まった。いきおいが残らない最後のブレーキの強さ＝止まるときのガクン
      const f = p.v / (p.v - v2);
      p.x += p.v * dt * f * 0.5; p.v = 0; p.stopped = p.br;
      if (n >= 0 && p.tr * fade + g <= 0.012) p.stopped = 0.0001;
      return;
    }
    p.x += (p.v + v2) * 0.5 * dt; p.v = v2;
  }

  // ------------------------------------------------------------------ 点数
  const LEG_MAX = 1000, W_STOP = 400, W_PUNCT = 300, W_COMF = 200, W_SAFE = 100;
  const pw = (pts, e) => { // 折れ線
    if (e <= pts[0][0]) return pts[0][1];
    for (let i = 1; i < pts.length; i++) if (e <= pts[i][0]) return lerp(pts[i - 1][1], pts[i][1], (e - pts[i - 1][0]) / (pts[i][0] - pts[i - 1][0]));
    return pts[pts.length - 1][1];
  };
  const STOP_CURVE = [[0, 1], [0.6, 1], [1.5, 0.86], [3, 0.66], [6, 0.36], [12, 0.1], [20, 0]];
  const PUNCT_CURVE = [[0, 1], [2, 1], [5, 0.84], [10, 0.6], [20, 0.3], [40, 0]];
  const stopFrac = err => pw(STOP_CURVE, Math.abs(err));
  const punctFrac = d => pw(PUNCT_CURVE, Math.abs(d));
  const stopRank = err => { const e = Math.abs(err); return e <= 0.6 ? 'pita' : e <= 1.5 ? 'great' : e <= 3 ? 'good' : e <= 6 ? 'ok' : 'miss'; };
  const COMF_COST = 2.2;
  function starsOf(score, legs, ats, red) {
    const pct = legs ? score / (LEG_MAX * legs) : 0;
    let s = pct >= 0.85 ? 3 : pct >= 0.7 ? 2 : pct >= 0.5 ? 1 : 0;
    if (ats > 0) s = Math.min(s, 2);
    if (red > 0) s = Math.min(s, 1);
    return s;
  }

  // ------------------------------------------------------------------ 運転のはじまりと1ステップ
  function create(o) {
    o = o || {};
    const id = o.route || 'r1', P = plan(id), R = P.R;
    const st = {
      v: 1, route: id, seed: o.seed != null ? o.seed >>> 0 : hash32('train:' + id), f: 0, t: 0, x: P.stops[0].x, sp: 0, tr: 0, br: 0, drive: 0, notch: -4,
      phase: 'dwell', k: 1, stopT: -MIN_DWELL, stillT: 0, dwellStart: 0, over: false, ats: { on: false, n: 0, t: 0 }, atsT: 0, hot: 0,
      leg: null, legs: [], res: null, jolt: 0, waited: {}, redPass: 0, atsN: 0, ev: [], depEarly: 0,
      stat: { maxKmh: 0, pita: 0, ontime: 0, waits: 0, gold: 0, smooth: 0 },
    };
    st.leg = newLeg(0);
    return st;
  }
  function newLeg() { return { cost: 0, overS: 0, ats: 0, red: 0, maxOver: 0, depEarly: 0, jolt: 0, tStart: 0 }; }
  function limitNow(st) { // 信号の黄色の制限もふくむ今の制限（km/h）
    const P = plan(st.route), R = P.R;
    let l = limitAt(R, st.x);
    for (const sg of P.sigs) {
      if (st.x >= sg.x - 150 && st.x < sg.x + 30 && aspect(sg, st.t) === 'y' && l > 35) l = 35;
    }
    return l;
  }
  function nextSignal(st) { // 前にいちばん近い信号 { x, d, a }
    const P = plan(st.route);
    for (const sg of P.sigs) if (sg.x > st.x - 0.5) return { id: sg.id, x: sg.x, d: sg.x - st.x, a: aspect(sg, st.t), kind: sg.kind };
    return null;
  }

  function step(st, inp) {
    const evs = [];
    if (st.over) return evs;
    inp = inp || {};
    const P = plan(st.route), R = P.R, W = WEATHER[R.weather];
    st.f++; st.t = st.f * DT;
    if (inp.notch != null) st.notch = clamp(Math.round(inp.notch), NOTCH_MIN, NOTCH_MAX);
    let n = st.notch;
    // ATS（速度か赤信号で非常ブレーキ）
    if (st.ats.on) n = -8;
    const p = { x: st.x, v: st.sp, tr: st.tr, br: st.br };
    if (st.phase === 'dwell') {
      // 駅で止まっている
      p.v = 0; p.tr = 0; p.br = 0; p.drive = 0; p.stopped = 0;
      st.sp = 0; st.tr = 0; st.br = 0; st.drive = 0;
      const stp = P.stops[st.k - 1];
      if (inp.depart && st.t - st.stopT >= MIN_DWELL && !st.over) {
        const early = Math.max(0, stp.sDep - st.t);
        st.leg.depEarly = early; st.leg.tStart = st.t;
        st.phase = 'run'; st.stillT = 0; st.notch = Math.max(st.notch, 0) === 0 ? 0 : st.notch;
        evs.push({ t: 'depart', k: st.k - 1, early: rd(early, 10), at: rd(st.t, 10) });
      }
      st.x = stp.x;
      if (st.phase === 'dwell') { st.ev = evs; return evs; }
      st.x = stp.x;
    }
    // ----- 走る
    const prevX = st.x, prevDrive = st.drive;
    if (n > 0 && st.sp <= 0) st.stillT = 0;
    advance(p, n, DT, W);
    st.x = p.x; st.sp = p.v; st.tr = p.tr; st.br = p.br; st.drive = p.drive;
    const kmh = st.sp * KMH;
    if (kmh > st.stat.maxKmh) st.stat.maxKmh = kmh;
    // ゆれ（ジャーク）
    const jerk = (st.drive - prevDrive) / DT;
    st.leg.cost += Math.max(0, Math.abs(jerk) - 1.2) * DT;
    if (p.stopped > 0.16 && n >= -8) { const j = (p.stopped - 0.16) * 1.6; st.leg.cost += j; st.leg.jolt = Math.max(st.leg.jolt, j); evs.push({ t: 'jolt', v: rd(j) }); }
    // 速度の制限
    const lim = limitNow(st), over = kmh - lim;
    if (over > 2) { st.leg.overS += DT; st.leg.maxOver = Math.max(st.leg.maxOver, over); }
    if (over > 7 && !st.ats.on) { st.hot += DT; if (st.hot >= 1.0) triggerAts(st, evs, 'speed'); } else if (over <= 7) st.hot = 0;
    // 信号をこえた
    for (const sg of P.sigs) {
      if (prevX < sg.x && st.x >= sg.x) {
        const a = aspect(sg, st.t);
        if (a === 'r') { st.redPass++; st.leg.red++; evs.push({ t: 'redpass', id: sg.id }); if (!st.ats.on) triggerAts(st, evs, 'red'); }
        else evs.push({ t: 'signal', id: sg.id, a });
      }
    }
    // 赤信号の前で待っている
    if (st.sp < 0.05) for (const sg of P.sigs) {
      if (!st.waited[sg.id] && sg.x - st.x > 0 && sg.x - st.x < 80 && aspect(sg, st.t) === 'r') { st.waited[sg.id] = 1; st.stat.waits++; evs.push({ t: 'wait', id: sg.id }); }
    }
    // ATS がとまった
    if (st.ats.on && st.sp <= 0) { st.atsT += DT; if (st.atsT >= 3) { st.ats.on = false; st.atsT = 0; evs.push({ t: 'atsOff' }); } }
    // 駅につく
    const stp = P.stops[st.k];
    if (stp && st.phase === 'run') {
      if (st.sp <= 0 && st.x >= stp.x - 60) {
        st.stillT += DT;
        if (st.stillT >= 1.0) arrive(st, P, stp, evs);
      } else st.stillT = 0;
      // 駅に止まらずに、ずっと先まで行った
      if (st.x > stp.x + 400) { st.x = stp.x + 400; }
    }
    st.ev = evs;
    return evs;
  }
  function triggerAts(st, evs, why) {
    st.ats.on = true; st.ats.n++; st.atsN++; st.leg.ats++; st.atsT = 0; st.hot = 0;
    evs.push({ t: 'ats', why });
  }
  function arrive(st, P, stp, evs) {
    const L = st.leg, err = st.x - stp.x, missed = err > 12;
    const arr = st.t - 1.0; // 止まったのは1秒前
    const dArr = arr - stp.sArr;
    const sf = missed ? 0 : stopFrac(err);
    const pf = punctFrac(dArr);
    const comfort = 1 - clamp(L.cost / COMF_COST, 0, 1);
    const safety = L.ats ? 0 : clamp(1 - L.overS * 0.12 - Math.max(0, L.maxOver - 3) * 0.01, 0, 1);
    const stopPts = Math.round(W_STOP * sf);
    let punctPts = Math.round(W_PUNCT * clamp(pf - clamp(L.depEarly * 0.06, 0, 0.4), 0, 1));
    const comfPts = Math.round(W_COMF * comfort);
    const safePts = Math.round(W_SAFE * safety);
    const leg = { k: st.k - 1, from: P.stops[st.k - 1].id, to: stp.id, err: rd(err, 100), rank: missed ? 'miss' : stopRank(err), missed, dArr: rd(dArr, 10), early: rd(L.depEarly, 10),
      stop: stopPts, punct: punctPts, comfort: comfPts, safety: safePts, ats: L.ats, red: L.red, overS: rd(L.overS, 10), jolt: rd(L.jolt, 100), cost: rd(L.cost, 100), t: rd(arr, 10), total: stopPts + punctPts + comfPts + safePts };
    st.legs.push(leg);
    st.stat.waits += 0;
    if (leg.rank === 'pita') st.stat.pita++;
    if (Math.abs(dArr) <= 2) st.stat.ontime++;
    if (comfort >= 0.95) st.stat.smooth++;
    if (leg.total >= 950) st.stat.gold++;
    st.ats.on = false; st.atsT = 0;
    st.stopT = st.t; st.phase = 'dwell'; st.notch = Math.min(st.notch, -4); st.sp = 0; st.tr = 0; st.br = 0;
    evs.push({ t: 'stop', leg, err: leg.err, rank: leg.rank });
    if (stp.last) finish(st, P, evs);
    else { st.k++; st.leg = newLeg(); }
  }
  function finish(st, P, evs) {
    const score = st.legs.reduce((s, l) => s + l.total, 0);
    const nLegs = P.legs.length;
    const stars = starsOf(score, nLegs, st.atsN, st.redPass);
    st.over = true; st.phase = 'done';
    st.res = { route: st.route, score, max: LEG_MAX * nLegs, stars, ats: st.atsN, red: st.redPass, legs: st.legs.map(l => Object.assign({}, l)), time: rd(st.t, 10), stat: Object.assign({}, st.stat) };
    evs.push({ t: 'finish', res: st.res });
  }

  // ------------------------------------------------------------------ 先のことの予測（オートパイロットと、画面の「止まれる？」表示）
  // いまのノッチのまま止まるまで進めたとき、どこで止まるか（その速さで B1 にゆるめる）
  function predictStop(st, notch, relaxBelow) {
    const P = plan(st.route), W = WEATHER[P.R.weather];
    const p = { x: st.x, v: st.sp, tr: st.tr, br: st.br };
    let n = notch;
    for (let i = 0; i < 60 * 90; i++) {
      if (relaxBelow != null && n < -1 && p.v < relaxBelow) n = -1;
      advance(p, n, DT, W);
      if (p.v <= 0 && p.tr < 0.02) return p.x;
    }
    return p.x + 1e6;
  }
  function stopDist(st) { return predictStop(st, Math.min(st.notch, -1) > -4 ? -4 : st.notch, null) - st.x; }

  // 自動運転。せんりゃく：制限と止まる位置から「出してよい速さ」をつくり、ノッチをえらぶ。止まる最後は先読みで合わせる
  function autopilot(st, o) {
    o = o || {};
    const P = plan(st.route), R = P.R, W = WEATHER[R.weather];
    if (st.over) return { notch: -4 };
    if (st.phase === 'dwell') {
      const stp = P.stops[st.k - 1];
      const go = st.t >= stp.sDep - (o.early || 0) && st.t - st.stopT >= MIN_DWELL;
      return { notch: -4, depart: go };
    }
    const stp = P.stops[st.k];
    const v = st.sp, x = st.x;
    const ab = o.decel || 0.5 * W.br;
    const dS = stp.x - x;
    const ap = st.ap || (st.ap = { until: 0, notch: 0, hold: 0 });
    // 先の制限・止まれの信号
    let aReq = 0, cap = Infinity;
    const lim = limitNow(st) / KMH;
    const consider = (d, vt) => { // d メートル先で vt m/s 以下にしたい
      const dd = d - 2;
      if (v <= vt) return;
      const need = dd <= 0.5 ? 9 : (v * v - vt * vt) / (2 * dd);
      if (need > aReq) aReq = need;
      cap = Math.min(cap, Math.sqrt(vt * vt + 2 * ab * Math.max(0, dd)));
    };
    consider(dS - 1.5, 0);
    for (let d = 10; d <= 700; d += 10) {
      const l2 = limitAt(R, x + d) / KMH - 0.6;
      if (l2 < lim - 0.3) consider(d, Math.max(l2, 0));
    }
    for (const sg of P.sigs) {
      const d = sg.x - x;
      if (d < -2 || d > 900) continue;
      // 黄色（ゾーンは信号の150m手前から）・赤は、そこに着くころの色で決める。色は赤→黄→青としか変わらない
      const zd = Math.max(0, d - 150);
      const aZ = aspect(sg, st.t + zd / Math.max(v, 6)), aS = aspect(sg, st.t + d / Math.max(v, 6));
      if (aS === 'r' || aZ === 'r') consider(d - 8, 0);
      else if (aZ === 'y') consider(zd, 9.3);
      else if (aspect(sg, st.t) === 'y' && d < 150 && aS === 'y') consider(0.6, 9.3);
    }
    // ダイヤどおりに走る（早く着きすぎるなら、少し遅めに）
    const lg = P.legs[st.k - 1];
    const tRem = Math.max(3, stp.sArr - st.t);
    const idealRem = pfRemain(lg.pf, x);
    const f = clamp(idealRem / tRem * (o.pace || 1), 0.5, 1);
    const target = Math.min(lim - 0.7, f * lim, cap);
    let notch = st.notch;
    const near = dS < 150 && v < 22;
    // 止まる前の先読み：10Hz で、ノッチごとに止まる位置を予測して、いちばん近いものを選ぶ
    if (near && dS < 130) {
      if (st.f % 6 === 0 || ap.mode !== 'near') {
        let best = null, bestE = 1e9;
        const cands = [0, -1, -2, -3, -4, -5, -6, -7];
        for (const c of cands) {
          const e = Math.abs(predictStop(st, c, null) - stp.x);
          const pe = e + (c === st.notch ? -0.3 : 0) + Math.abs(c - st.notch) * 0.15;
          if (pe < bestE) { bestE = pe; best = c; }
        }
        ap.mode = 'near'; ap.notch = best;
      }
      notch = ap.notch;
      // 止まりそこねそうなら、力行でつなぐ
      if (v < 0.9 && dS > 3) notch = 1;
      else if (v < 0.3 && dS > 0.8) notch = 1;
      return { notch };
    }
    ap.mode = 'far';
    if (aReq > 0.03 && v > target - 0.2) {
      let k = 1;
      while (k < 7 && VEH.brk[k] * W.br < aReq * 1.04) k++;
      notch = -k;
    } else if (v > target + 0.5) notch = v > target + 2.5 ? -2 : -1;
    else if (v > target + 0.05) notch = 0;
    else {
      const gap = target - v;
      notch = gap > 7 ? 5 : gap > 4.5 ? 4 : gap > 2.5 ? 3 : gap > 1.2 ? 2 : gap > 0.35 ? 1 : 0;
    }
    // ノッチは1段ずつ動かす（ゆれをへらす）
    if (notch > st.notch + 1) notch = st.notch + 1;
    if (notch < st.notch - 1 && notch > -8 && aReq < 1.0) notch = st.notch - 1;
    if (st.f % 10 !== 0 && Math.abs(notch - st.notch) === 1 && notch > 0 === st.notch > 0 && notch >= 0 && st.notch >= 0) notch = st.notch;
    return { notch };
  }
  function pfRemain(pf, x) { // その位置から、ダイヤの上の止まる位置までにかかる最短時間
    const f = clamp((x - pf.x0) / pf.ds, 0, pf.n), i = Math.min(pf.n - 1, Math.floor(f));
    const ti = pf.cum[i] + (pf.cum[i + 1] - pf.cum[i]) * (f - i);
    return Math.max(0.5, pf.total - ti);
  }

  // 1つの路線を、最初から最後まで走らせる（テスト用）。ctl(st) → 入力。最大 maxSec 秒
  function run(routeId, ctl, o) {
    o = o || {};
    const st = create({ route: routeId, seed: o.seed });
    const lim = (o.maxSec || 900) * 60;
    const log = o.log;
    for (let i = 0; i < lim && !st.over; i++) {
      const inp = ctl(st, i);
      const evs = step(st, inp);
      if (log) log(st, evs);
    }
    return st;
  }

  // 見る人（絵）のための、前にある物の一覧
  function ahead(st, dist) {
    const P = plan(st.route), R = P.R, x = st.x, out = { stations: [], signals: [], limits: [] };
    for (const s of P.stops) if (s.x >= x - 20 && s.x <= x + dist) out.stations.push({ x: s.x, d: s.x - x, name: s.name, stop: true, last: s.last });
    for (let i = 0; i < STATIONS.length; i++) {
      const S = STATIONS[i];
      if (P.stops.some(s => s.si === i)) continue;
      if (S.x >= x - 120 && S.x <= x + dist && S.x > P.stops[0].x && S.x < P.stops[P.stops.length - 1].x) out.stations.push({ x: S.x, d: S.x - x, name: S.name, stop: false });
    }
    for (const sg of P.sigs) if (sg.x >= x - 5 && sg.x <= x + dist) out.signals.push({ x: sg.x, d: sg.x - x, a: aspect(sg, st.t), kind: sg.kind });
    // 制限が変わる場所
    let prev = limitAt(R, x);
    for (let d = 10; d <= dist; d += 10) { const l = limitAt(R, x + d); if (l !== prev) { out.limits.push({ x: x + d, d, kmh: l, up: l > prev }); prev = l; } }
    return out;
  }

  const api = {
    DT, KMH, VEH, WEATHER, STATIONS, SECTIONS, ZONES, GRADES, CURVES, SIGNALS, TUNNELS, BRIDGES, LINES, ROUTES, ROUTE_IDS, NET_END,
    NOTCH_MIN, NOTCH_MAX, LEG_MAX, W_STOP, W_PUNCT, W_COMF, W_SAFE, START_DEP, MIN_DWELL, DWELL,
    byId, plan, timeAt, aspect, limitAt, limitNow, nextSignal, baseKmh, themeAt, gradeAt, curveAt, inList, profile,
    create, step, autopilot, predictStop, stopDist, run, ahead, advance, starsOf, stopFrac, punctFrac, stopRank,
    hash32, rd, clamp, lerp,
    sameJSON: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.TrainEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
