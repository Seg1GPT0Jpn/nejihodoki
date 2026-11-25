// おもちゃ大乱闘（brawl）：決まった結果の対戦の中身。1/60秒の固定刻み。node でもブラウザでも動く（window.BrawlEngine）。
// 入力は 1人ぶんのビット（B.L など）。同じ種・同じ入力なら、同じ試合になる。乱数は状態の中の数え方（st.rs）だけ。
// 座標は px（右が +x、下が +y）。足元が (x, y)。ダメージ%が大きいほど、技の吹っ飛ばしが強くなり、ブラストゾーンの外に出ると1機を失う。
(function (root) {
  'use strict';
  const DT = 1 / 60;
  // 左・右・上・下・ジャンプ・こうげき・とくぎ・まもり・つかみ・つよい ／ F＝スティックを「いっぱいまで」たおしている ／ T＝あいさつ ／ CL..CD＝Cスティック（いつも強い攻撃・空中は向きの空中技）
  const B = { L: 1, R: 2, U: 4, D: 8, J: 16, A: 32, S: 64, H: 128, G: 256, M: 512, F: 1024, T: 2048, CL: 4096, CR: 8192, CU: 16384, CD: 32768 };
  const CMASK = B.CL | B.CR | B.CU | B.CD;
  const FLICK_N = 4, FLICK_HOLD = 6, WALK = 0.62, DASH_F = 14, TECH_WIN = 20, TECH_LOCK = 40;
  const rd = v => Math.round(v * 1000) / 1000;
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  // 角度（整数の度。0＝前、90＝上）→ 向き [dx, dy]（dy は上が負）。Math.cos / Math.sin は使わない（ブラウザごとに最後の桁がちがうことがあるため）。
  // 値は rd(cos), rd(-sin) を前もって計算した表（0〜359度。技の角度はすべて整数。tools/tests/unit/brawl-netcode.test.js が表と式の一致を確かめる）
  const ANG = [
    [1,-0],[1,-0.017],[0.999,-0.035],[0.999,-0.052],[0.998,-0.07],[0.996,-0.087],[0.995,-0.105],[0.993,-0.122],[0.99,-0.139],[0.988,-0.156],[0.985,-0.174],[0.982,-0.191],
    [0.978,-0.208],[0.974,-0.225],[0.97,-0.242],[0.966,-0.259],[0.961,-0.276],[0.956,-0.292],[0.951,-0.309],[0.946,-0.326],[0.94,-0.342],[0.934,-0.358],[0.927,-0.375],[0.921,-0.391],
    [0.914,-0.407],[0.906,-0.423],[0.899,-0.438],[0.891,-0.454],[0.883,-0.469],[0.875,-0.485],[0.866,-0.5],[0.857,-0.515],[0.848,-0.53],[0.839,-0.545],[0.829,-0.559],[0.819,-0.574],
    [0.809,-0.588],[0.799,-0.602],[0.788,-0.616],[0.777,-0.629],[0.766,-0.643],[0.755,-0.656],[0.743,-0.669],[0.731,-0.682],[0.719,-0.695],[0.707,-0.707],[0.695,-0.719],[0.682,-0.731],
    [0.669,-0.743],[0.656,-0.755],[0.643,-0.766],[0.629,-0.777],[0.616,-0.788],[0.602,-0.799],[0.588,-0.809],[0.574,-0.819],[0.559,-0.829],[0.545,-0.839],[0.53,-0.848],[0.515,-0.857],
    [0.5,-0.866],[0.485,-0.875],[0.469,-0.883],[0.454,-0.891],[0.438,-0.899],[0.423,-0.906],[0.407,-0.914],[0.391,-0.921],[0.375,-0.927],[0.358,-0.934],[0.342,-0.94],[0.326,-0.946],
    [0.309,-0.951],[0.292,-0.956],[0.276,-0.961],[0.259,-0.966],[0.242,-0.97],[0.225,-0.974],[0.208,-0.978],[0.191,-0.982],[0.174,-0.985],[0.156,-0.988],[0.139,-0.99],[0.122,-0.993],
    [0.105,-0.995],[0.087,-0.996],[0.07,-0.998],[0.052,-0.999],[0.035,-0.999],[0.017,-1],[0,-1],[-0.017,-1],[-0.035,-0.999],[-0.052,-0.999],[-0.07,-0.998],[-0.087,-0.996],
    [-0.105,-0.995],[-0.122,-0.993],[-0.139,-0.99],[-0.156,-0.988],[-0.174,-0.985],[-0.191,-0.982],[-0.208,-0.978],[-0.225,-0.974],[-0.242,-0.97],[-0.259,-0.966],[-0.276,-0.961],[-0.292,-0.956],
    [-0.309,-0.951],[-0.326,-0.946],[-0.342,-0.94],[-0.358,-0.934],[-0.375,-0.927],[-0.391,-0.921],[-0.407,-0.914],[-0.423,-0.906],[-0.438,-0.899],[-0.454,-0.891],[-0.469,-0.883],[-0.485,-0.875],
    [-0.5,-0.866],[-0.515,-0.857],[-0.53,-0.848],[-0.545,-0.839],[-0.559,-0.829],[-0.574,-0.819],[-0.588,-0.809],[-0.602,-0.799],[-0.616,-0.788],[-0.629,-0.777],[-0.643,-0.766],[-0.656,-0.755],
    [-0.669,-0.743],[-0.682,-0.731],[-0.695,-0.719],[-0.707,-0.707],[-0.719,-0.695],[-0.731,-0.682],[-0.743,-0.669],[-0.755,-0.656],[-0.766,-0.643],[-0.777,-0.629],[-0.788,-0.616],[-0.799,-0.602],
    [-0.809,-0.588],[-0.819,-0.574],[-0.829,-0.559],[-0.839,-0.545],[-0.848,-0.53],[-0.857,-0.515],[-0.866,-0.5],[-0.875,-0.485],[-0.883,-0.469],[-0.891,-0.454],[-0.899,-0.438],[-0.906,-0.423],
    [-0.914,-0.407],[-0.921,-0.391],[-0.927,-0.375],[-0.934,-0.358],[-0.94,-0.342],[-0.946,-0.326],[-0.951,-0.309],[-0.956,-0.292],[-0.961,-0.276],[-0.966,-0.259],[-0.97,-0.242],[-0.974,-0.225],
    [-0.978,-0.208],[-0.982,-0.191],[-0.985,-0.174],[-0.988,-0.156],[-0.99,-0.139],[-0.993,-0.122],[-0.995,-0.105],[-0.996,-0.087],[-0.998,-0.07],[-0.999,-0.052],[-0.999,-0.035],[-1,-0.017],
    [-1,-0],[-1,0.017],[-0.999,0.035],[-0.999,0.052],[-0.998,0.07],[-0.996,0.087],[-0.995,0.105],[-0.993,0.122],[-0.99,0.139],[-0.988,0.156],[-0.985,0.174],[-0.982,0.191],
    [-0.978,0.208],[-0.974,0.225],[-0.97,0.242],[-0.966,0.259],[-0.961,0.276],[-0.956,0.292],[-0.951,0.309],[-0.946,0.326],[-0.94,0.342],[-0.934,0.358],[-0.927,0.375],[-0.921,0.391],
    [-0.914,0.407],[-0.906,0.423],[-0.899,0.438],[-0.891,0.454],[-0.883,0.469],[-0.875,0.485],[-0.866,0.5],[-0.857,0.515],[-0.848,0.53],[-0.839,0.545],[-0.829,0.559],[-0.819,0.574],
    [-0.809,0.588],[-0.799,0.602],[-0.788,0.616],[-0.777,0.629],[-0.766,0.643],[-0.755,0.656],[-0.743,0.669],[-0.731,0.682],[-0.719,0.695],[-0.707,0.707],[-0.695,0.719],[-0.682,0.731],
    [-0.669,0.743],[-0.656,0.755],[-0.643,0.766],[-0.629,0.777],[-0.616,0.788],[-0.602,0.799],[-0.588,0.809],[-0.574,0.819],[-0.559,0.829],[-0.545,0.839],[-0.53,0.848],[-0.515,0.857],
    [-0.5,0.866],[-0.485,0.875],[-0.469,0.883],[-0.454,0.891],[-0.438,0.899],[-0.423,0.906],[-0.407,0.914],[-0.391,0.921],[-0.375,0.927],[-0.358,0.934],[-0.342,0.94],[-0.326,0.946],
    [-0.309,0.951],[-0.292,0.956],[-0.276,0.961],[-0.259,0.966],[-0.242,0.97],[-0.225,0.974],[-0.208,0.978],[-0.191,0.982],[-0.174,0.985],[-0.156,0.988],[-0.139,0.99],[-0.122,0.993],
    [-0.105,0.995],[-0.087,0.996],[-0.07,0.998],[-0.052,0.999],[-0.035,0.999],[-0.017,1],[0,1],[0.017,1],[0.035,0.999],[0.052,0.999],[0.07,0.998],[0.087,0.996],
    [0.105,0.995],[0.122,0.993],[0.139,0.99],[0.156,0.988],[0.174,0.985],[0.191,0.982],[0.208,0.978],[0.225,0.974],[0.242,0.97],[0.259,0.966],[0.276,0.961],[0.292,0.956],
    [0.309,0.951],[0.326,0.946],[0.342,0.94],[0.358,0.934],[0.375,0.927],[0.391,0.921],[0.407,0.914],[0.423,0.906],[0.438,0.899],[0.454,0.891],[0.469,0.883],[0.485,0.875],
    [0.5,0.866],[0.515,0.857],[0.53,0.848],[0.545,0.839],[0.559,0.829],[0.574,0.819],[0.588,0.809],[0.602,0.799],[0.616,0.788],[0.629,0.777],[0.643,0.766],[0.656,0.755],
    [0.669,0.743],[0.682,0.731],[0.695,0.719],[0.707,0.707],[0.719,0.695],[0.731,0.682],[0.743,0.669],[0.755,0.656],[0.766,0.643],[0.777,0.629],[0.788,0.616],[0.799,0.602],
    [0.809,0.588],[0.819,0.574],[0.829,0.559],[0.839,0.545],[0.848,0.53],[0.857,0.515],[0.866,0.5],[0.875,0.485],[0.883,0.469],[0.891,0.454],[0.899,0.438],[0.906,0.423],
    [0.914,0.407],[0.921,0.391],[0.927,0.375],[0.934,0.358],[0.94,0.342],[0.946,0.326],[0.951,0.309],[0.956,0.292],[0.961,0.276],[0.966,0.259],[0.97,0.242],[0.974,0.225],
    [0.978,0.208],[0.982,0.191],[0.985,0.174],[0.988,0.156],[0.99,0.139],[0.993,0.122],[0.995,0.105],[0.996,0.087],[0.998,0.07],[0.999,0.052],[0.999,0.035],[1,0.017],
  ];
  const V = deg => { const a = ANG[((Math.round(deg) % 360) + 360) % 360]; return [a[0], a[1]]; };
  // 2点の距離。Math.hypot は実装ごとに最後の桁がずれることがあるので、sqrt（IEEE で正確）を使う
  const hyp = (x, y) => Math.sqrt(x * x + y * y);
  // なめらかな sin（周期 1。Math.sin に頼らない）
  const sinT = p => { p -= Math.floor(p); return p < 0.5 ? 16 * p * (0.5 - p) : -16 * (p - 0.5) * (1 - p); };
  function rnd(st) { // mulberry32
    let t = (st.rs = (st.rs + 0x6D2B79F5) | 0);
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const hash32 = s => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; };

  // ------------------------------------------------------------------------------------------------ ステージ
  // solids：ふつうの床とかべ（上に乗れる・横からぶつかる・下から頭をぶつける）。thins：下からすり抜けられる板（下ボタンで降りる）。
  // mv：うごく板（ax, ay の幅・per の周期（フレーム）・ph の位相）。wrap：電車（sp の速さで流れて、span でもどる）。
  // ledges：つかまれる縁（dir は床が縁のどちら側か：+1 なら床は右）。blast：ブラストゾーン。spawn：復活の場所。
  const STAGES = {
    bench: { id: 'bench', name: { ja: '作業台', en: 'Workbench' }, desc: { ja: '広い天板と、3まいの板。ふつうに戦える', en: 'A wide top and three thin boards. Plain and fair' },
      solids: [{ x1: -330, y1: 0, x2: 330, y2: 130 }],
      thins: [{ x1: -240, x2: -110, y: -105 }, { x1: 110, x2: 240, y: -105 }, { x1: -65, x2: 65, y: -215 }],
      ledges: [{ x: -330, y: 0, dir: 1 }, { x: 330, y: 0, dir: -1 }], blast: { l: -780, r: 780, t: -660, b: 430 }, spawn: [0, -320], start: [-190, 190], theme: 'bench' },
    box: { id: 'box', name: { ja: 'おもちゃ箱', en: 'Toy Box' }, desc: { ja: 'ふちが高く、まん中がくぼんだ箱。かべに当たるとはね返る', en: 'A tall-rimmed box with a pit in the middle. Walls bounce flying toys' },
      solids: [{ x1: -340, y1: -70, x2: -245, y2: 150 }, { x1: 245, y1: -70, x2: 340, y2: 150 }, { x1: -245, y1: 55, x2: 245, y2: 150 }],
      thins: [{ x1: -75, x2: 75, y: -125 }],
      ledges: [{ x: -340, y: -70, dir: 1 }, { x: 340, y: -70, dir: -1 }], blast: { l: -740, r: 740, t: -640, b: 430 }, spawn: [0, -300], start: [-300, 300], theme: 'box' },
    shelf: { id: 'shelf', name: { ja: '本だな', en: 'Bookshelf' }, desc: { ja: 'せまい本の上と、ゆっくり動く3まいの棚', en: 'A small book top and three slowly moving shelves' },
      solids: [{ x1: -170, y1: 0, x2: 170, y2: 110 }],
      thins: [{ x1: -75, x2: 75, y: -100, mv: { x: -300, ax: 90, ay: 0, per: 420, ph: 0 } }, { x1: -75, x2: 75, y: -100, mv: { x: 300, ax: 90, ay: 0, per: 420, ph: 0.5 } }, { x1: -70, x2: 70, y: -215, mv: { x: 0, ax: 0, ay: 45, per: 360, ph: 0 } }],
      ledges: [{ x: -170, y: 0, dir: 1 }, { x: 170, y: 0, dir: -1 }], blast: { l: -800, r: 800, t: -700, b: 450 }, spawn: [0, -330], start: [-100, 100], theme: 'shelf' },
    track: { id: 'track', name: { ja: '線路', en: 'Train Track' }, desc: { ja: '長い線路と、通りすぎる2台のおもちゃ電車', en: 'A long track with two toy trains rolling by' },
      solids: [{ x1: -440, y1: 0, x2: 440, y2: 60 }],
      thins: [{ x1: -90, x2: 90, y: -200 }, { x1: -130, x2: 130, y: -65, wrap: { sp: 1.5, span: 2200, x: -1100 } }, { x1: -130, x2: 130, y: -150, wrap: { sp: -1.5, span: 2200, x: 1100 } }],
      ledges: [{ x: -440, y: 0, dir: 1 }, { x: 440, y: 0, dir: -1 }], blast: { l: -880, r: 880, t: -650, b: 420 }, spawn: [0, -330], start: [-260, 260], theme: 'track' },
    house: { id: 'house', name: { ja: 'ドールハウス', en: 'Dollhouse' }, desc: { ja: '左が高い階段。かたむいた戦い', en: 'A staircase that rises on the left, for lopsided fights' },
      solids: [{ x1: -360, y1: -90, x2: -215, y2: 140 }, { x1: -215, y1: -45, x2: -70, y2: 140 }, { x1: -70, y1: 0, x2: 360, y2: 140 }],
      thins: [{ x1: 40, x2: 210, y: -190 }, { x1: -300, x2: -170, y: -220 }],
      ledges: [{ x: -360, y: -90, dir: 1 }, { x: 360, y: 0, dir: -1 }], blast: { l: -820, r: 820, t: -680, b: 430 }, spawn: [60, -330], start: [-290, 250], theme: 'house' },
  };
  const STAGE_IDS = ['bench', 'box', 'shelf', 'track', 'house'];
  // 時刻 t（フレーム）の、うごく板の位置
  function thinAt(sd, t) {
    if (sd.mv) { const m = sd.mv, p = t / m.per + m.ph; return { x1: sd.x1 + m.x + m.ax * sinT(p), x2: sd.x2 + m.x + m.ax * sinT(p), y: sd.y + m.ay * sinT(p) }; }
    if (sd.wrap) { const w = sd.wrap, o = (((w.x + t * w.sp + w.span / 2) % w.span) + w.span) % w.span - w.span / 2; return { x1: sd.x1 + o, x2: sd.x2 + o, y: sd.y }; }
    return { x1: sd.x1, x2: sd.x2, y: sd.y };
  }

  // ------------------------------------------------------------------------------------------------ 技
  // 地上と空中の通常技の土台（足元から見た位置 hb = [x0, y0, x1, y1, r]：技の間に x0,y0 → x1,y1 へ動く円。前が +x、上が -y）
  //   s=はじまるまで a=あたり判定が出ている t=ぜんぶ dmg bkb kbg ang(度) ll=空中の着地のすき
  const BASE = {
    jab:    { s: 3, a: 3, t: 15, dmg: 3, bkb: 9, kbg: 6, ang: 40, hb: [[28, -30, 38, -30, 13]] },
    ftilt:  { s: 6, a: 4, t: 23, dmg: 7, bkb: 20, kbg: 22, ang: 35, hb: [[30, -28, 50, -28, 16]] },
    utilt:  { s: 5, a: 5, t: 22, dmg: 6, bkb: 24, kbg: 24, ang: 85, hb: [[16, -40, -12, -72, 16]] },
    dtilt:  { s: 5, a: 4, t: 20, dmg: 5, bkb: 14, kbg: 14, ang: 72, hb: [[36, -8, 50, -8, 13]] },
    fsmash: { s: 14, a: 4, t: 44, dmg: 15, bkb: 28, kbg: 40, ang: 38, hb: [[30, -34, 62, -26, 22]], sm: 1 },
    usmash: { s: 12, a: 5, t: 46, dmg: 14, bkb: 28, kbg: 38, ang: 88, hb: [[14, -40, -10, -86, 22]], sm: 1 },
    dsmash: { s: 10, a: 6, t: 44, dmg: 12, bkb: 25, kbg: 34, ang: 30, hb: [[40, -10, 40, -10, 17], [-40, -10, -40, -10, 17]], sm: 1 },
    // ac＝オートキャンセル（[はやすぎる, おそい] のフレームに着地すれば、着地のすきなし）
    nair:   { s: 4, a: 10, t: 26, dmg: 7, bkb: 12, kbg: 16, ang: 50, hb: [[0, -30, 0, -30, 25]], ll: 8, ac: [3, 19] },
    fair:   { s: 8, a: 4, t: 28, dmg: 10, bkb: 20, kbg: 28, ang: 40, hb: [[28, -30, 44, -12, 18]], ll: 14, ac: [5, 22] },
    bair:   { s: 7, a: 4, t: 26, dmg: 11, bkb: 22, kbg: 32, ang: 145, hb: [[-34, -30, -46, -28, 17]], ll: 12, ac: [5, 21] },
    uair:   { s: 5, a: 5, t: 24, dmg: 8, bkb: 18, kbg: 24, ang: 88, hb: [[6, -62, -6, -80, 18]], ll: 10, ac: [4, 18] },
    dair:   { s: 11, a: 6, t: 34, dmg: 11, bkb: 22, kbg: 26, ang: -70, hb: [[6, 6, 12, -6, 17]], ll: 18, ac: [6, 28] },
  };
  const NORMALS = Object.keys(BASE);
  // ほかの地上の技（ダッシュこうげき・れんだ・れんだのしめ・ふちのぼり・おきあがりこうげき）。NORMALS には入れない
  const EXTRA_BASE = {
    dattack:  { kind: 'dash', v: 5.4, s: 7, a: 6, t: 32, dmg: 7, bkb: 16, kbg: 22, ang: 45, hb: [[26, -28, 46, -26, 17]] },
    rjab:     { s: 2, a: 2, t: 6, dmg: 1.3, bkb: 5, kbg: 0, ang: 30, hb: [[30, -30, 40, -30, 14]] },
    jabfin:   { s: 3, a: 4, t: 18, dmg: 3.5, bkb: 14, kbg: 12, ang: 40, hb: [[30, -30, 52, -30, 16]] },
    ledgeatk: { s: 3, a: 5, t: 22, dmg: 6, bkb: 18, kbg: 18, ang: 50, hb: [[24, -24, 52, -24, 18]] },
    getupatk: { s: 4, a: 5, t: 24, dmg: 6, bkb: 16, kbg: 16, ang: 60, hb: [[30, -12, 36, -12, 18], [-30, -12, -36, -12, 18]] },
  };
  const EXTRAS = Object.keys(EXTRA_BASE);
  // キャラごとの「くせ」：reach=横の長さ sp=はじまる・おわる速さ（小さいほど速い） pw=ちから rr=あたり判定の大きさ ov=技ごとの上書き
  // kit.tpl があれば、kits.js の TPL[tpl] を土台にする（base の数 → kit の数、ov はひな形 → kit.ov の順に重ねる）。tpl がなければ、kit だけ（今までと同じ）
  function normals(k0) {
    const tpl = k0.tpl && K.TPL[k0.tpl];
    if (k0.tpl && !tpl) throw new Error('unknown move template ' + k0.tpl);
    const k = tpl ? Object.assign({}, tpl.base, k0) : k0;
    const out = {};
    for (const key of NORMALS.concat(EXTRAS)) {
      const b = BASE[key] || EXTRA_BASE[key], o = tpl ? Object.assign({}, tpl.ov && tpl.ov[key], k0.ov && k0.ov[key]) : ((k.ov && k.ov[key]) || {});
      const sp = o.sp || k.sp;
      const m = { kind: b.kind || 'melee', fx: o.fx || k.fx, sm: b.sm || 0, ll: b.ll || 0 };
      if (b.v) m.v = o.v || b.v; if (b.ac) m.ac = o.ac === 0 ? [0, 0] : b.ac.slice();
      m.s = o.s || Math.max(2, Math.round(b.s * sp)); m.a = o.a || b.a; m.t = o.t || Math.max(m.s + m.a + 4, Math.round(b.t * (0.5 + sp * 0.5) + (o.dt || 0)));
      m.dmg = o.dmg || rd(b.dmg * k.pw * (o.pw || 1)); m.bkb = rd(b.bkb * (0.85 + 0.15 * k.pw)); m.kbg = rd(b.kbg * k.pw * (o.pw || 1)); m.ang = o.ang != null ? o.ang : b.ang;
      if (o.bkb) m.bkb = o.bkb; if (o.kbg) m.kbg = o.kbg;
      const reach = o.reach || k.reach, rr = o.rr || k.rr;
      m.hb = (o.hb || b.hb).map(h => [rd(h[0] * (h[0] > 0 && key !== 'nair' ? reach : 1)), h[1], rd(h[2] * (h[2] > 0 && key !== 'nair' ? reach : 1)), h[3], rd(h[4] * rr)]);
      if (o.ll != null) m.ll = o.ll;
      out[key] = m;
    }
    return out;
  }
  // おもちゃのデータ（技の数値・色・名前）は brawl/kits.js。ここは、それを読んで動かす。
  const K = root.BrawlKits || (typeof require === 'function' ? require('./kits.js') : null);
  if (!K) throw new Error('brawl/kits.js must be loaded before engine.js');
  const CH = {};
  const CHAR_IDS = [];
  const MOVES = {};
  const sp = K.sp;
  // 共通の技：つかみ・なげ
  const GRAB = { s: 6, a: 3, t: 34, hb: [[30, -30, 42, -30, 20]] };
  const THROWS = { f: { dmg: 6, bkb: 36, kbg: 50, ang: 38 }, b: { dmg: 7, bkb: 36, kbg: 50, ang: 142 }, u: { dmg: 5, bkb: 40, kbg: 46, ang: 88 }, d: { dmg: 4, bkb: 30, kbg: 36, ang: 72 } };

  // ------------------------------------------------------------------------------------------------ 試合の状態
  // create({ seed, stage, fighters:[{ ch, lvl（0＝人、1〜3＝CPU）}], mode:'stock'|'time', stocks, time（秒）, training })
  function create(o) {
    o = o || {};
    const stage = STAGES[o.stage] || STAGES.bench;
    const fl = (o.fighters && o.fighters.length ? o.fighters : [{ ch: 'robo' }, { ch: 'duck', lvl: 2 }]).slice(0, 4);
    const st = {
      v: 1, f: 0, rs: (o.seed >>> 0) || 1, stage: stage.id, over: false, win: -1, mode: o.mode === 'time' ? 'time' : 'stock', training: !!o.training,
      stocks: clamp(o.stocks | 0 || 3, 1, 9), timeMax: Math.round((o.time || 180) * 60), cap: Math.round((o.cap || 600) * 60), sudden: false,
      fighters: [], pr: [], th: [], ev: [], ai: [], sc: [], res: null, dummy: 'stand', shake: 0,
    };
    const n = fl.length, sx = stage.start;
    for (let i = 0; i < n; i++) {
      const c = CH[fl[i].ch] || CH.robo;
      const px = n === 2 ? (i === 0 ? sx[0] : sx[1]) : sx[0] + (sx[1] - sx[0]) * (i / (n - 1));
      const f = {
        i, ch: c.id, lvl: fl[i].lvl | 0, name: fl[i].name || '', opt: { tj: fl[i].tj === 0 ? 0 : 1, fl: clamp(fl[i].fl | 0 || FLICK_N, 2, 8) }, x: px, y: 0, vx: 0, vy: 0, face: px <= 0 ? 1 : -1, pct: 0, stk: clamp(fl[i].stk | 0 || st.stocks, 1, 9), s: 'free', sf: 0, mv: '', mf: 0, mh: [], hold: 0, gr: -1, jumps: c.jmax || 1,
        coy: 0, dropT: 0, inv: 0, arm: 0, hs: 0, shd: 100, help: false, adUsed: false, sbUsed: false, lg: -1, lcd: 0, pin: 0, bj: 0, ba: 0, bs: 0, chg: 0, by: -1, grabbing: -1, gt: 0,
        buff: 0, cmb: 0, cmbT: 0, recent: [], respT: 0, rez: 0, lv: null, last: -1, lastF: -9999, dealt: 0, taken: 0, kos: 0, falls: 0, maxCmb: 0, ndash: 0, sticky: 0, cdm: 0, ts: 0, pc: 0, sel: 0, mash: 0, thr: '', used: {}, lk: '', chain: 0, ss: 0, pum: 0, pf: 0, ffl: false, lag: 0, lastVy: 0, gt0: 0,
        hx: 0, hy: 0, hxd: 0, hyd: 0, fkn: false, fkx: 0, fky: 0, fkt: 0, bc: 0, bcd: 0, bj: 0, jsrc: 0, mm: 0, dsh: 0, dd: 0, tn: 0, pv: 0, cr: 0, tq: 0, tl: 0, tw: 0, tdir: 0, sdi: 0, ssn: 0, pst: 0, psl: 0, rj: 0, rfl: 0, lgN: 0, gk: '', mdx: 0, mdy: 0, tau: 0, adl: 0,
      };
      if (o.hp) f.pct = o.hp[i] || 0;
      st.fighters.push(f); st.ai.push(newAI(f)); st.sc.push(0);
    }
    st.th = thinsNow(st);
    for (const f of st.fighters) { f.y = standY(st, f.x) ; f.gr = supportAt(st, f); }
    return st;
  }
  function thinsNow(st) {
    const S = STAGES[st.stage], out = [];
    for (let i = 0; i < S.thins.length; i++) {
      const p = thinAt(S.thins[i], st.f), q = thinAt(S.thins[i], Math.max(0, st.f - 1));
      out.push({ x1: p.x1, x2: p.x2, y: p.y, vx: st.f ? p.x1 - q.x1 : 0, vy: st.f ? p.y - q.y : 0 });
    }
    return out;
  }
  function standY(st, x) {
    const S = STAGES[st.stage]; let y = null;
    for (const s of S.solids) if (x >= s.x1 && x <= s.x2 && (y == null || s.y1 < y)) y = s.y1;
    return y == null ? 0 : y;
  }
  // いま足の下にあるもの：solid は 0..、thin は 100..（なければ -1）
  function supportAt(st, f) {
    const S = STAGES[st.stage];
    for (let i = 0; i < S.solids.length; i++) { const s = S.solids[i]; if (f.x >= s.x1 && f.x <= s.x2 && Math.abs(f.y - s.y1) < 0.6) return i; }
    for (let i = 0; i < st.th.length; i++) { const t = st.th[i]; if (f.x >= t.x1 && f.x <= t.x2 && Math.abs(f.y - t.y) < 0.8) return 100 + i; }
    return -1;
  }
  const stageOf = st => STAGES[st.stage];
  const JM = f => CH[f.ch].jmax || 1; // 空中ジャンプの回数
  const info = f => CH[f.ch];
  const moveOf = (f, key) => MOVES[f.ch][key] || null;
  const alive = f => f.s !== 'out';

  // おもちゃ1人ぶんの技の表（MOVES）を作る。つかみは、キャラごとに少しだけ大きさがちがう（c.gx）。データから作るだけで、状態は持たない
  function buildChar(c) {
    const id = c.id, m = normals(c.kit);
    for (const k of ['N', 'S', 'U', 'D']) m['sp' + k] = Object.assign({}, c.sp[k], { key: 'sp' + k });
    for (const k of NORMALS.concat(EXTRAS)) m[k].key = k;
    if (c.spb) for (const k of ['N', 'S', 'U', 'D']) if (c.spb[k]) m['sp' + k + 'b'] = Object.assign({}, c.spb[k], { key: 'sp' + k + 'b' });
    const tb = c.kit.tpl && K.TPL[c.kit.tpl], r = c.kit.rr != null ? c.kit.rr : (tb && tb.base.rr) || 1, gx = c.gx || 1;
    m.dgrab = { key: 'dgrab', kind: 'grab', fx: 'grab', s: 9, a: 4, t: 42, dmg: 0, bkb: 0, kbg: 0, ang: 0, sm: 0, ll: 0, hb: [[GRAB.hb[0][0] * gx * 1.12 + 6, -c.h * 0.5, GRAB.hb[0][2] * gx * 1.3 + 8, -c.h * 0.5, 20 * Math.max(1, r * 0.85)]] };
    m.grab = { key: 'grab', kind: 'grab', fx: 'grab', s: GRAB.s, a: GRAB.a, t: GRAB.t, dmg: 0, bkb: 0, kbg: 0, ang: 0, sm: 0, ll: 0, hb: [[GRAB.hb[0][0] * gx, -c.h * 0.5, GRAB.hb[0][2] * (gx === 1 ? 1.04 : gx), -c.h * 0.5, 20 * Math.max(1, r * 0.85)]] };
    MOVES[id] = m;
  }
  // おもちゃを足す（kits.js の CH と、テストや後から足すもの）。同じ id は足せない。boss:1 は CHAR_IDS（選べるおもちゃ）に入らない
  function defineChar(c) {
    if (!c || !c.id || CH[c.id]) throw new Error('defineChar: bad or duplicate id ' + (c && c.id));
    for (const k of ['N', 'S', 'U', 'D']) { const m = c.sp && c.sp[k]; if (!m) throw new Error('defineChar ' + c.id + ': missing special ' + k); if (m.kind !== 'melee' && !KINDS[m.kind] && BUILTIN_KINDS.indexOf(m.kind) < 0) throw new Error('defineChar ' + c.id + ': unknown special kind ' + m.kind); }
    CH[c.id] = c; buildChar(c); if (!c.boss) CHAR_IDS.push(c.id);
    return c;
  }
  // とくぎの種類を足す。ここに書いた kind は、とくぎ sp({ kind: 名前 }) で使える。すべて任意：
  //   melee：true なら、ふつうの近接と同じ（s〜s+a フレームに hb が出る）。boxes(A, m, fr)：自分で当たり判定を返す { hbs, p, t }（p＝ダメージの表）
  //   canUse(st, f, m, grounded)：false なら、いまは出せない（空中で使えない・回数ぎれ など）
  //   tick(st, f, C, m, fr, cx)：とくぎが出ているあいだ毎フレーム。cx.grav（重力）・cx.free（true なら、ふつうの摩擦と空中の操作をしない）・cx.ax / cx.ay / cx.inp / cx.grounded
  //   onHit(st, A, D, h)：この技が当たってダメージが入った後（h.m＝この技、h.p＝当たりの表）
  //   ai(st, f, m, T, cx)：CPU がこのとくぎを出したいとき { hold, pulse } を返す（cx＝距離・強さ・向きなど）。なければ「近ければ近接」と同じ
  const KINDS = {};
  const BUILTIN_KINDS = ['melee', 'proj', 'dash', 'rise', 'counter', 'spin', 'cmdgrab', 'pound', 'mine', 'buff', 'tele', 'reflect'];
  function defineKind(name, h) { if (KINDS[name] || BUILTIN_KINDS.indexOf(name) >= 0) throw new Error('defineKind: duplicate ' + name); KINDS[name] = h || {}; return h; }
  // 飛び道具の種類（p.k）：{ update(st, p) } を足すと、毎フレーム動いたあとに呼ばれる（曲がる・分かれる・もどる など）。絵は art.js の DRAWPROJ
  const PROJ = {};
  function defineProj(name, h) { if (PROJ[name]) throw new Error('defineProj: duplicate ' + name); PROJ[name] = h || {}; return h; }

  // ------------------------------------------------------------------------------------------------ ちがいの数字（おもちゃどうしが似すぎていないかを測る）
  // sigOf(id)：そのおもちゃの技ぜんぶを、0〜1 にそろえた数の列にしたもの（あたり判定の長さ・高さ・大きさ・数、はじまる／おわるフレーム、ダメージ、ふっとばし、
  // 飛び道具の速さ・大きさ、とくぎの動き、体）と、種類の名前（kind・fx）。dist(a, b)：2人の「ちがい」を 0〜100 で（ぜんぶの技で平均）。テストが、どの2人でも下限を超えることを調べる。
  const SIG_NUM = [['s', 40], ['a', 30], ['t', 90], ['dmg', 22], ['bkb', 40], ['kbg', 60], ['v', 12], ['rv', 14], ['dv', 4], ['fv', 16], ['td', 260], ['rh', 12], ['buff', 600], ['cf', 40], ['ca', 10], ['arm', 40]];
  const SIG_PROJ = [['sp', 14], ['vy', 8], ['g', 0.6], ['r', 36], ['life', 200], ['dmg', 22], ['bkb', 40], ['kbg', 60], ['arm', 80], ['max', 4]];
  const sg = (a, b) => Math.min(1, Math.abs(a - b));
  function moveSig(x) {
    const num = [], cat = [x.kind, x.fx];
    for (const [k, sc] of SIG_NUM) num.push((Array.isArray(x[k]) ? x[k][1] - x[k][0] : x[k] || 0) / sc);
    const hb = (x.kind === 'pound' && x.land ? x.hb.concat(x.land.hb) : x.hb) || [];
    let fx0 = 0, bx0 = 0, ty = 0, by = 0, rm = 0;
    for (const h of hb) { fx0 = Math.max(fx0, h[0], h[2]); bx0 = Math.min(bx0, h[0], h[2]); ty = Math.min(ty, h[1] - h[4], h[3] - h[4]); by = Math.max(by, h[1] + h[4], h[3] + h[4]); rm = Math.max(rm, h[4]); }
    num.push(fx0 / 150, -bx0 / 150, -ty / 140, by / 140 + 0.2, rm / 60, hb.length / 3);
    const an = V(x.ang || 0); num.push(an[0], an[1]);
    num.push(x.ll / 24, x.sm ? 1 : 0);
    if (x.kind === 'pound' && x.land) num.push(x.land.a / 10, x.land.dmg / 22); else num.push(0, 0);
    const p = x.proj || {}; for (const [k, sc] of SIG_PROJ) num.push((p[k] || 0) / sc);
    cat.push(p.kind || '');
    return { num, cat };
  }
  const BLANK = moveSig({ kind: '', fx: '', hb: [], ang: 0, ll: 0 });
  const sigCache = {};
  function sigOf(id) {
    if (sigCache[id]) return sigCache[id];
    const m = MOVES[id], c = CH[id], parts = [];
    for (const k of NORMALS) parts.push({ w: 1, s: moveSig(m[k]) });
    for (const k of EXTRAS) parts.push({ w: 0.5, s: moveSig(m[k]) });
    for (const k of ['spN', 'spS', 'spU', 'spD']) parts.push({ w: 3.5, s: moveSig(m[k]) });
    for (const k of ['N', 'S', 'U', 'D']) parts.push(c.spb && c.spb[k] ? { w: 1.2, s: moveSig(m['sp' + k + 'b']) } : { w: 1.2, blank: 1, s: BLANK });
    const body = { num: [(c.weight - 60) / 90, (c.run - 2.4) / 2.6, (c.jump - 9) / 4, (c.dj - 8) / 4, ((c.jmax || 1) - 1) / 3, (c.w - 24) / 36, (c.h - 30) / 50, (c.grav - 0.34) / 0.16, (c.fall - 6.4) / 4, (c.air - 2) / 1.8, (c.acc - 0.38) / 0.4, (c.aacc - 0.1) / 0.3], cat: [] };
    parts.push({ w: 9, s: body });
    return (sigCache[id] = parts);
  }
  // 2人のちがい（0〜100）。技ごとに「数の差の平均」と「種類が同じか」を混ぜて、重みつきで平均する
  function dist(a, b) {
    const A = sigOf(a), B = sigOf(b); let tot = 0, wt = 0;
    for (let i = 0; i < A.length; i++) {
      if (A[i].blank && B[i].blank) continue;
      const x = A[i].s, y = B[i].s; let d = 0;
      for (let k = 0; k < x.num.length; k++) d += sg(x.num[k], y.num[k]);
      d = x.num.length ? d / x.num.length : 0;
      let cd = 0; for (let k = 0; k < x.cat.length; k++) if (x.cat[k] !== y.cat[k]) cd++;
      const c = x.cat.length ? cd / x.cat.length : 0;
      tot += A[i].w * (d * 0.75 + c * 0.25); wt += A[i].w;
    }
    return Math.round(tot / wt * 10000) / 100;
  }
  const throwMul = id => CH[id].tm || 1;

  // ------------------------------------------------------------------------------------------------ 新しい種類のとくぎ（kits.js の kind / proj.kind で使う）
  // どれも、状態は f.ks（そのおもちゃの小さな札。使ったときだけできる）と、飛び道具 st.pr の中だけに持つ。乱数・時刻は使わない。
  const ksOf = f => f.ks || (f.ks = {});
  const setSlow = (D, n) => { const k = ksOf(D); if (n > (k.slow | 0)) k.slow = n; };
  const setRoot = (D, n) => { const k = ksOf(D); if (n > (k.root | 0)) k.root = n; };
  const foeNear = (st, p) => { let best = null, bd = 1e9; for (const F of st.fighters) { if (F.i === p.o || F.s === 'dead' || F.s === 'out' || F.s === 'rez') continue; const d = hyp(F.x - p.x, F.y - CH[F.ch].h / 2 - p.y); if (d < bd) { bd = d; best = F; } } return best; };
  const projOf = (st, o, k) => { for (const p of st.pr) if (p.o === o && p.k === k && !p.dead) return p; return null; };
  const dropProj = (st, f, C, m, extra) => { // 足もと（少しまえ）に、とどまる飛び道具を1つ置く（同じ種類は1つだけ）
    const p = m.proj, old = projOf(st, f.i, p.kind); if (old) old.dead = true;
    const o = { o: f.i, k: p.kind, x: f.x + f.face * (p.ox || 0), y: f.y - (p.oy !== undefined ? p.oy : C.h * 0.5), vx: 0, vy: 0, g: 0, r: p.r, life: p.life, dmg: p.dmg || 0, bkb: p.bkb || 0, kbg: p.kbg || 0, ang: p.ang || 0, bn: 0, t: 0, face: f.face, bf: 1, hbk: m.key };
    for (const k of PROJ_OPT) if (p[k] !== undefined) o[k] = p[k];
    st.pr.push(Object.assign(o, extra || {})); ev(st, { t: 'shoot', i: f.i, k: p.kind, x: o.x, y: o.y });
  };
  // とどまる輪：中にいる相手を、遅くする（slow）・引きよせる / おしやる（pw の正負）
  const zoneUpdate = (st, p) => {
    for (const F of st.fighters) {
      if (F.i === p.o || F.s === 'dead' || F.s === 'out' || F.s === 'rez' || F.s === 'held' || F.s === 'ledge') continue;
      const dx = p.x - F.x, dy = p.y - (F.y - CH[F.ch].h / 2), d = hyp(dx, dy);
      if (d >= p.rad) continue;
      if (p.slow) setSlow(F, p.slow);
      if (p.pw) { const k = p.pw * (1 - d / p.rad) / (d || 1); F.vx = clamp(F.vx + dx * k, -9, 9); if (F.gr < 0) F.vy = clamp(F.vy + dy * k * 0.7, -9, 9); }
    }
  };
  for (const n of ['pool', 'well', 'gale']) defineProj(n, { update: zoneUpdate });
  defineProj('missile', { update(st, p) { if (Math.abs(p.vx) < 13) p.vx *= 1.05; } });
  defineProj('jet', { hit(st, A, D) { setSlow(D, 45); } });
  defineProj('void', { hit(st, A, D) { setSlow(D, 70); } });
  defineProj('hook', { hit(st, A, D) { if (D.lv) D.lv = [rd((A.x >= D.x ? 1 : -1) * 6.5), -1.2]; } }); // 当たった相手を、持ち主のほうへ引きよせる
  defineProj('snare', { mine: true, hit(st, A, D) { setRoot(D, 75); } });
  defineProj('chord', { update(st, p) { if (p.pb === undefined) p.pb = p.bn; if (p.bn < p.pb) { p.pb = p.bn; p.dmg = rd(p.dmg * 1.3); p.r += 2; ev(st, { t: 'tick', x: p.x, y: p.y }); } } }); // はね返るたびに、大きく強くなる音符
  defineProj('cuff', { hit(st, A, D) { setRoot(D, 60); } });
  defineProj('plane', { update(st, p) { // ブーメラン：まっすぐ飛んで、もどってくる（持ち主にふれたら消える）
    const O = st.fighters[p.o]; if (!O) { p.dead = true; return; }
    if (p.t > 26) { const tx = O.x - p.x, ty = O.y - CH[O.ch].h / 2 - p.y, d = hyp(tx, ty) || 1; p.vx = clamp(p.vx + tx / d * 0.7, -9, 9); p.vy = clamp(p.vy + ty / d * 0.7, -6, 6); p.g = 0; if (d < 22) p.dead = true; }
  } });
  defineProj('dancer', { update(st, p) { // おどる助っ人：いちばん近い相手のほうへ、ゆっくり歩く
    const T = foeNear(st, p); if (T) p.vx = (T.x > p.x ? 1 : -1) * 1.5; else p.vx = 0;
    const fb = floorBelow(st, p.x, p.y - p.r); if (fb != null && p.y + p.r >= fb && p.vy >= 0) { p.y = fb - p.r; p.vy = 0; }
  } });
  defineKind('stance', { tick(st, f, C, m, fr) { if (fr === m.s) { const k = ksOf(f); k.st = k.st ? 0 : 1; k.stT = k.st && m.dur ? m.dur : 0; ev(st, { t: 'stance', i: f.i, x: f.x, y: f.y - C.h / 2, on: k.st }); } },
    ai(st, f, m, T, c) { const on = f.ks && f.ks.st; if (m.dur) return !on && c.adx < 230 && c.r < 0.25 && c.lvl >= 2 ? { hold: B.D } : null; return c.r < 0.03 && c.lvl >= 2 ? { hold: B.D } : null; } });
  defineKind('charge', { tick(st, f, C, m, fr, cx) { // ためる：とくぎボタンをおしているあいだ（cmax フレームまで）。はなすと、ためたぶん大きく強く飛ぶ
    const k = ksOf(f);
    if (fr === m.s) {
      if ((cx.inp & B.S) && (k.cc | 0) < m.cmax) { k.cc = (k.cc | 0) + 1; f.mf = m.s - 1; return; }
      const q = Math.min(1, (k.cc | 0) / m.cmax), p = m.proj; k.cc = 0;
      st.pr.push({ o: f.i, k: p.kind, x: f.x + f.face * (C.w / 2 + 8 + q * 10), y: f.y - C.h * 0.55, vx: f.face * rd(p.sp * (1 + q * 0.4)), vy: 0, g: 0, r: rd(p.r * (1 + q * 1.1)), life: p.life, dmg: rd(p.dmg * (1 + q * 2.4)), bkb: rd(p.bkb + q * 14), kbg: rd(p.kbg + q * 22), ang: p.ang, bn: 0, t: 0, face: f.face, bf: f.buff > 0 ? 1.25 : 1, hbk: m.key, pierce: 1, rh: 99 });
      ev(st, { t: 'shoot', i: f.i, k: p.kind, x: f.x + f.face * 30, y: f.y - C.h * 0.55 });
    }
  }, ai(st, f, m, T, c) { return c.lvl >= 2 && c.adx > 170 && c.adx < 520 && c.ady < 90 && c.r < 0.5 ? { hold: (c.faceT > 0 ? B.R : B.L) | B.S, pt: 14 + Math.floor(rnd(st) * 26) } : null; } });
  defineKind('ammo', { canUse(st, f) { return !f.ks || f.ks.ammo === undefined || f.ks.ammo > 0; },
    tick(st, f, C, m, fr) { if (fr === m.s) { const k = ksOf(f); if (k.ammo === undefined) k.ammo = m.mag; k.ammo--; spawnProj(st, f, C, m); } },
    ai(st, f, m, T, c) { return c.adx > 110 && c.adx < 460 && c.ady < 90 && c.r < 0.45 && (!f.ks || f.ks.ammo === undefined || f.ks.ammo > 0) ? { hold: 0 } : null; } });
  defineKind('reload', { tick(st, f, C, m, fr) { if (fr === m.t - 4) { ksOf(f).ammo = m.mag; ev(st, { t: 'stance', i: f.i, x: f.x, y: f.y - C.h / 2, on: 2 }); } },
    ai(st, f, m, T, c) { return f.ks && f.ks.ammo === 0 && c.adx > 150 ? { hold: B.D } : null; } });
  defineKind('summon', { tick(st, f, C, m, fr) { if (fr === m.s) dropProj(st, f, C, m, { g: 0.5 }); },
    ai(st, f, m, T, c) { return c.adx < 380 && c.r < 0.35 && !projOf(st, f.i, m.proj.kind) ? { hold: c.faceT > 0 ? B.R : B.L } : null; } });
  defineKind('zone', { tick(st, f, C, m, fr) { if (fr === m.s) dropProj(st, f, C, m); },
    ai(st, f, m, T, c) { return c.adx > 60 && c.adx < 300 && c.r < 0.3 && !projOf(st, f.i, m.proj.kind) ? { hold: B.D } : null; } });
  defineKind('roll', { melee: true, tick(st, f, C, m, fr, cx) { // 転がる体あたり：だんだん速くなる。毎 rh フレーム、同じ相手にまた当たる
    cx.free = true;
    if (fr >= m.s && fr < m.s + m.a) { f.vx = f.face * Math.min(m.vmax, m.v0 + (fr - m.s) * m.acc); if ((fr - m.s) % m.rh === 0) f.mh = []; if (f.gr < 0) { f.vy = Math.min(f.vy, 1.5); cx.grav = 0.25; } }
    else if (fr === m.s + m.a) f.vx *= 0.35;
    else if (f.gr >= 0) f.vx *= 0.8;
  }, ai(st, f, m, T, c) { return c.adx > 70 && c.adx < 340 && c.ady < 70 && c.r < 0.4 ? { hold: 0 } : null; } });
  defineKind('absorb', { tick(st, f, C, m, fr) { if (fr >= m.s && fr < m.s + m.a) ksOf(f).abs = 2; },
    ai(st, f, m, T, c) { for (const q of st.pr) if (q.o !== f.i && !isMine(q) && !q.nohit && Math.abs(q.x - f.x) < 220 && Math.abs(q.y - (f.y - 28)) < 60 && (q.vx > 0) === (q.x < f.x)) return { hold: B.D, pt: 6 }; return null; } });
  defineKind('beacon', { melee: true, tick(st, f, C, m, fr) { // 1回目：目じるしを置く。2回目：目じるしへワープして、まわりをはじく
    if (fr !== m.s) return;
    const k = ksOf(f), mk = projOf(st, f.i, 'star');
    if (!mk || k.bx === undefined) { k.bx = f.x; k.by = f.y; if (mk) mk.dead = true; st.pr.push({ o: f.i, k: 'star', x: f.x, y: f.y - 16, vx: 0, vy: 0, g: 0, r: 12, life: 1500, dmg: 0, bkb: 0, kbg: 0, ang: 0, bn: 0, t: 0, face: f.face, bf: 1, nohit: 1 }); ev(st, { t: 'shoot', i: f.i, k: 'star', x: f.x, y: f.y - 16 }); }
    else { ev(st, { t: 'warp', i: f.i, x: f.x, y: f.y - C.h / 2, x2: k.bx, y2: k.by - C.h / 2 }); f.x = k.bx; f.y = k.by; f.vx = 0; f.vy = 0; f.gr = -1; f.inv = Math.max(f.inv, 8); mk.dead = true; delete k.bx; delete k.by; f.mh = []; }
  }, ai(st, f, m, T, c) { const k = f.ks; if (!k || k.bx === undefined) return c.r < 0.06 && c.adx < 420 ? { hold: B.D } : null; return c.adx > 380 || f.pct > 90 && c.r < 0.1 ? { hold: B.D } : null; } });
  defineKind('glide', { recovery: true, tick(st, f, C, m, fr, cx) { // 噴射して上がり、ボタンをおしているあいだ、ふわっと進める
    cx.free = true;
    if (fr === m.s && f.gr >= 0) f.gr = -1;
    if (fr >= m.s && fr < m.s + m.a) { const p = (fr - m.s) / m.a; f.gr = -1; f.vy = -m.rv * (1 - 0.6 * p); f.vx = cx.ax ? cx.ax * m.dv : f.vx * 0.9; cx.grav = 0; f.ffl = false; if (cx.ax && fr === m.s) f.face = cx.ax; }
    else if (fr >= m.s + m.a && f.gr < 0) {
      if (cx.inp & B.S) { cx.grav = 0.08; f.vy = Math.min(f.vy, 0.7); f.vx = clamp(f.vx + cx.ax * 0.45, -m.dv, m.dv); } else f.mf = m.t; // はなしたら、おしまい
    }
  } });

  for (const c of K.CH_LIST) defineChar(c);

  // ------------------------------------------------------------------------------------------------ 動き
  function ev(st, o) { st.ev.push(o); return o; }
  const axOf = inp => (inp & B.R ? 1 : 0) - (inp & B.L ? 1 : 0);
  const ayOf = inp => (inp & B.D ? 1 : 0) - (inp & B.U ? 1 : 0);

  // 重力・かべ・床。着地したら true
  function physics(st, f, C, o) {
    const S = stageOf(st), hw = C.w / 2, h = C.h, th = st.th;
    const px = f.x, py = f.y, hurt = f.s === 'hurt';
    let landed = false;
    f.x += f.vx;
    for (const s of S.solids) {
      if (f.x + hw > s.x1 && f.x - hw < s.x2 && f.y > s.y1 + 0.5 && f.y - h < s.y2) {
        if (px + hw <= s.x1 + 0.5) f.x = s.x1 - hw;
        else if (px - hw >= s.x2 - 0.5) f.x = s.x2 + hw;
        else f.x = f.x < (s.x1 + s.x2) / 2 ? s.x1 - hw : s.x2 + hw;
        if (hurt && Math.abs(f.vx) > 4) { ev(st, { t: 'bounce', i: f.i, x: f.x, y: f.y - h / 2, p: Math.abs(f.vx) }); f.vx = -f.vx * 0.55; if (f.tq > 0) f.tw = 1; } else f.vx = 0;
      }
    }
    if (f.gr >= 0) {
      // 立っている：足もとの床がまだあるか
      f.vy = 0;
      if (!supportHolds(st, f, hw)) { f.gr = -1; f.coy = f.s === 'hurt' ? 0 : 6; }
      return false;
    }
    f.vy += o.grav;
    const cap = f.ffl ? C.ff : (o.fall || C.fall);
    if (f.vy > cap) f.vy = cap;
    f.y += f.vy;
    for (let i = 0; i < S.solids.length; i++) {
      const s = S.solids[i];
      if (f.x >= s.x1 && f.x <= s.x2 && f.vy >= 0 && py <= s.y1 + 0.01 && f.y >= s.y1) { f.y = s.y1; landed = true; f.gr = i; break; }
      if (f.x + hw > s.x1 && f.x - hw < s.x2 && f.vy < 0 && py - h >= s.y2 - 0.5 && f.y - h < s.y2) {
        f.y = s.y2 + h; if (hurt && f.vy < -3) { ev(st, { t: 'bounce', i: f.i, x: f.x, y: f.y - h, p: -f.vy }); f.vy = -f.vy * 0.4; if (f.tq > 0) f.tw = 2; } else f.vy = 0;
      }
    }
    if (!landed && f.vy >= 0 && f.dropT <= 0) {
      for (let i = 0; i < th.length; i++) {
        const t = th[i];
        if (f.x >= t.x1 && f.x <= t.x2 && py <= t.y - t.vy + 0.6 && f.y >= t.y) { f.y = t.y; landed = true; f.gr = 100 + i; break; }
      }
    }
    if (landed) { f.vy = 0; f.ffl = false; }
    return landed;
  }
  function supportHolds(st, f, hw) {
    const S = stageOf(st);
    if (f.gr >= 100) {
      const t = st.th[f.gr - 100]; if (!t) return false;
      if (f.x < t.x1 || f.x > t.x2) return false;
      f.y = t.y; return true;
    }
    const s = S.solids[f.gr]; if (!s) return false;
    return f.x >= s.x1 && f.x <= s.x2;
  }
  function onLand(st, f, C) {
    f.jumps = JM(f); f.adUsed = false; f.sbUsed = false; f.help = false; f.ffl = false; f.coy = 0; f.lgN = 0;
    if (f.s === 'hurt') {
      if (f.hs > 6 && f.lastVy > 3 && f.tq > 0) { startTech(st, f, C, 'ground'); return; } // うけ身
      if (f.hs > 6 && f.lastVy > 4.5) { f.s = 'down'; f.sf = 0; f.inv = 0; f.vx *= 0.5; ev(st, { t: 'bounce', i: f.i, x: f.x, y: f.y, p: f.lastVy }); }
      return;
    }
    if (f.s === 'adodge') { f.s = 'lag'; f.lag = 10; f.sf = 0; f.inv = 0; f.vx *= 0.5; return; } // 空中よけで着地：すきができる
    if (f.s === 'atk') {
      const m = MOVES[f.ch][f.mv];
      if (m.kind === 'pound' && f.pf) { f.pf = 0; f.mf = m.s + 1; f.mh = []; ev(st, { t: 'slam', i: f.i, x: f.x, y: f.y, p: 10 }); return; }
      if (m.kind === 'rise') { f.s = 'lag'; f.lag = 8; f.mv = ''; return; }
      if (m.ll) {
        if (m.ac && (f.mf < m.ac[0] || f.mf >= m.ac[1])) { f.s = 'free'; f.sf = 0; f.mv = ''; return; } // オートキャンセル
        f.s = 'lag'; f.lag = m.ll; f.mv = ''; return;
      }
      if (m.kind !== 'dash' && m.kind !== 'spin' && m.kind !== 'melee' && m.kind !== 'proj' && m.kind !== 'mine' && m.kind !== 'buff' && m.kind !== 'tele' && m.kind !== 'reflect') { f.s = 'lag'; f.lag = 8; f.mv = ''; }
      return;
    }
    if (f.s === 'free' && f.lastVy > 7) ev(st, { t: 'land', i: f.i, x: f.x, y: f.y, p: f.lastVy });
  }

  function newAI() { return { w: 0, tgt: -1, pl: '', pt: 0, inp: 0, hold: 0, sw: 0, mash: 0, stuck: 0, lx: 0, ly: 0, wl: 0 }; }

  // はじき（フリック）：スティックが「ニュートラル → いっぱい」へ N フレーム以内に動いたら、はじき。キーボードはダブルタップ（F ビットはフロントが付ける）
  function inputFlick(f, inp) {
    const hx = axOf(inp), hy = ayOf(inp), full = (inp & B.F) !== 0, was = (f.pin & B.F) !== 0, N = f.opt.fl;
    f.hx = hx ? (hx === f.hxd ? f.hx + 1 : 1) : 0; f.hxd = hx;
    f.hy = hy ? (hy === f.hyd ? f.hy + 1 : 1) : 0; f.hyd = hy;
    f.fkn = false; if (f.fkt > 0) f.fkt--;
    let nx = 0, ny = 0;
    if (hx && full && (f.hx === 1 || !was) && f.hx <= N) nx = hx;
    if (hy && full && (f.hy === 1 || !was) && f.hy <= N) ny = hy;
    if (nx || ny) { f.fkn = true; f.fkx = nx; f.fky = ny; f.fkt = FLICK_HOLD; } else if (f.fkt <= 0) { f.fkx = 0; f.fky = 0; }
  }

  // 1人の1フレーム
  function updateFighter(st, f, inp) {
    const C = CH[f.ch], S = stageOf(st);
    const pr = inp & ~f.pin;
    f.lastVy = f.vy;
    if (pr & B.J) { f.bj = 7; f.jsrc = 0; } else if (f.bj > 0) f.bj--;
    if (pr & B.A) f.ba = 7; else if (f.ba > 0) f.ba--;
    if (pr & B.M) f.bm = 7; else if (f.bm > 0) f.bm--;
    if (pr & B.S) f.bs = 7; else if (f.bs > 0) f.bs--;
    if (pr & CMASK) { f.bc = 7; f.bcd = pr & CMASK; } else if (f.bc > 0) f.bc--;
    inputFlick(f, inp);
    if (f.fkn && f.fky < 0 && f.opt.tj) { f.bj = 7; f.jsrc = 1; } // はじきジャンプ（上にはじく）
    // ふっとばされている間：まもりボタンで受け身の先行入力
    if ((pr & B.H) && (f.s === 'hurt' || f.lv) && f.tl <= 0 && f.tq <= 0) { f.tq = TECH_WIN; f.tl = TECH_LOCK; }
    if (f.s === 'out') { f.pin = inp; return; }
    if (f.hold > 0) {
      f.hold--;
      // ずらし（SDI）：ヒットストップ中に方向を入れると、少しだけずれる
      if (f.lv && f.sdi < 4 && (pr & (B.L | B.R | B.U | B.D))) { f.sdi++; f.x += axOf(pr) * 3; if (f.gr < 0) f.y += ayOf(pr) * 3; }
      if (f.hold === 0 && f.lv) applyLaunch(st, f, inp);
      f.pin = inp; return;
    }
    if (f.inv > 0) f.inv--;
    if (f.dropT > 0) f.dropT--;
    if (f.lcd > 0) f.lcd--;
    if (f.coy > 0) f.coy--;
    if (f.buff > 0) f.buff--;
    if (f.tq > 0) f.tq--; if (f.tl > 0) f.tl--;
    if (f.pst > 0) f.pst--; if (f.psl > 0) f.psl--;
    if (f.cmbT > 0) { f.cmbT--; if (f.cmbT === 0) f.cmb = 0; }
    const ax = axOf(inp), ay = ayOf(inp);
    f.tdir = ax;
    f.arm = 0; f.rfl = 0;
    f.sf++;
    if (f.s !== 'free') { f.mm = 0; f.cr = 0; }
    if (f.s !== 'shield' && f.s !== 'stun' && f.shd < 100) f.shd = Math.min(100, f.shd + 0.14);
    switch (f.s) {
      case 'dead': { if (--f.respT <= 0) respawn(st, f); break; }
      case 'rez': {
        const sp = S.spawn; f.x = sp[0]; f.y = sp[1]; f.vx = 0; f.vy = 0; f.gr = -1; f.rez--; if (f.inv < 3) f.inv = 3;
        if (f.rez <= 0 || (f.rez < 160 && (pr & (B.J | B.A | B.S | B.M | B.D | B.U | B.L | B.R)))) { f.s = 'free'; f.inv = 70; f.jumps = JM(f); f.sf = 0; f.vy = 1; }
        break;
      }
      case 'lag': {
        f.lag--; groundMove(f, C, 0, 0); physics(st, f, C, { grav: C.grav }) && onLand(st, f, C);
        if (f.lag <= 0) { f.s = 'free'; f.sf = 0; }
        break;
      }
      case 'jsq': {
        groundMove(f, C, ax, 0.5);
        // ジャンプのしゃがみ中：上スマッシュ・上とくぎへ切りかえられる
        if (f.sf <= 3 && f.gr >= 0) {
          if (f.bs > 0 && ay < 0) { f.bs = 0; f.bj = 0; startMove(st, f, 'spU', ax, ay); break; }
          if ((f.bm > 0 && ay < 0) || (f.ba > 0 && f.fkt > 0 && f.fky < 0) || (f.bc > 0 && (f.bcd & B.CU))) { f.ba = 0; f.bm = 0; f.bc = 0; f.bj = 0; startMove(st, f, 'usmash', ax, ay); break; }
        }
        if (f.sf >= 4) {
          const hop = ((inp & B.J) || (f.jsrc && (inp & B.U))) ? C.jump : C.jump * 0.64;
          f.vy = -hop; f.gr = -1; f.coy = 0; f.s = 'free'; f.sf = 0; f.vx += ax * 0.8; if (ax) f.face = ax; f.jumps = JM(f);
          ev(st, { t: 'jump', i: f.i, x: f.x, y: f.y, big: 0 });
        } else physics(st, f, C, { grav: C.grav });
        break;
      }
      case 'free': freeState(st, f, C, inp, pr, ax, ay); break;
      case 'atk': atkState(st, f, C, inp, pr, ax, ay); break;
      case 'taunt': {
        f.vx *= 0.8; physics(st, f, C, { grav: C.grav }) && onLand(st, f, C);
        if (f.sf >= 56) { f.s = 'free'; f.sf = 0; }
        break;
      }
      case 'tech': {
        f.vx *= 0.8; f.inv = f.sf < 20 ? Math.max(f.inv, 2) : f.inv;
        physics(st, f, C, { grav: C.grav }) && onLand(st, f, C);
        if (f.sf >= 24) { f.s = 'free'; f.sf = 0; }
        break;
      }
      case 'hurt': {
        f.hs--;
        // めいていキャンセル：まっさかさまに飛ばされても、ジャンプでたてなおせる
        if (f.vy > 2.5 && f.hs > 3 && f.jumps > 0 && (pr & B.J) && !f.lv) {
          f.s = 'free'; f.sf = 0; f.jumps--; f.vy = -C.dj * 0.8; f.vx *= 0.4; f.ffl = false; f.cmbT = 0;
          ev(st, { t: 'mcancel', i: f.i, x: f.x, y: f.y - C.h / 2 }); break;
        }
        if (f.gr >= 0) { f.vx *= 0.9; }
        else f.vx *= 0.99;
        if (f.hs <= 0) { f.s = 'free'; f.sf = 0; f.cmbT = Math.min(f.cmbT, 8); f.vx *= 0.8; }
        const lnd = physics(st, f, C, { grav: C.grav * 0.62, fall: 99 });
        if (f.tw) { const w = f.tw; f.tw = 0; startTech(st, f, C, w === 1 ? 'wall' : 'ceil'); break; }
        if (lnd) onLand(st, f, C);
        break;
      }
      case 'down': {
        f.vx *= 0.88;
        physics(st, f, C, { grav: C.grav });
        if (f.sf >= 26 || (f.sf > 10 && (pr & (B.J | B.A | B.S | B.M | B.H | B.L | B.R | B.U | B.D)))) {
          // おきあがり：こうげき・ころがり・その場
          if (pr & B.A) { f.s = 'free'; f.sf = 0; f.inv = 12; f.ba = 0; startMove(st, f, 'getupatk'); }
          else if (pr & (B.L | B.R)) { f.s = 'roll'; f.sf = 0; f.thr = (pr & B.R) ? 1 : -1; f.inv = 2; }
          else { f.s = 'free'; f.sf = 0; f.inv = 14; }
        }
        break;
      }
      case 'stun': {
        f.vx *= 0.85; physics(st, f, C, { grav: C.grav });
        if (pr & (B.J | B.A | B.S | B.M | B.L | B.R | B.U | B.D | B.H | B.G)) f.sf += 3;
        if (f.sf >= 130) { f.s = 'free'; f.sf = 0; f.shd = 40; f.inv = 20; }
        break;
      }
      case 'shield': {
        f.vx *= 0.7; f.shd = Math.max(0, f.shd - 0.3);
        physics(st, f, C, { grav: C.grav });
        if (f.gr < 0) { f.s = 'free'; break; }
        if (f.shd <= 1) { f.s = 'lag'; f.lag = 14; f.sf = 0; f.psl = 30; break; }
        if (f.ssn > 0) { f.ssn--; break; } // まもりのしびれ：その間は動けない（まもりの上から攻められる）
        if (pr & B.J) { f.s = 'jsq'; f.sf = 0; f.bj = 0; break; }
        if (pr & (B.A | B.G) && f.sf >= 3) { startMove(st, f, 'grab'); f.ba = 0; break; }
        if (f.sf >= 4 && (pr & B.D || (f.fkn && f.fky > 0))) {
          if (f.gr >= 100) { f.s = 'free'; f.sf = 0; f.dropT = 16; f.gr = -1; f.vy = 1.2; f.psl = 30; break; } // まもり降り：板をすりぬける
          f.s = 'spot'; f.sf = 0; f.inv = 0; break;
        }
        if (f.sf >= 3 && (pr & (B.L | B.R))) { f.s = 'roll'; f.sf = 0; f.thr = (pr & B.R) ? 1 : -1; break; }
        if (!(inp & B.H)) { f.s = 'lag'; f.lag = 5; f.sf = 0; f.psl = 30; }
        break;
      }
      case 'roll': {
        const d = f.thr; f.vx = d * (f.sf < 20 ? 4.2 : 0);
        f.inv = f.sf >= 3 && f.sf <= 17 ? 2 : 0;
        physics(st, f, C, { grav: C.grav });
        if (f.sf >= 26) { f.s = 'lag'; f.lag = 4; f.vx = 0; }
        break;
      }
      case 'spot': {
        f.vx = 0; f.inv = f.sf >= 2 && f.sf <= 17 ? 2 : 0; physics(st, f, C, { grav: C.grav });
        if (f.sf >= 24) { f.s = 'lag'; f.lag = 2; }
        break;
      }
      case 'adodge': {
        f.inv = f.sf >= 2 && f.sf <= 20 ? 2 : 0;
        if (f.sf < 22) { f.vy = f.sf < 3 ? f.vy : f.dvy; f.vx = f.dvx * (f.sf < 14 ? 1 : 0.5); }
        const lnd = physics(st, f, C, { grav: f.sf < 22 ? 0 : C.grav });
        if (lnd) onLand(st, f, C);
        if (f.sf >= 30) { f.s = 'free'; f.sf = 0; }
        break;
      }
      case 'grab': grabState(st, f, C, inp, pr, ax, ay); break;
      case 'held': {
        const g = st.fighters[f.by];
        f.vx = 0; f.vy = 0;
        if (!g || g.s !== 'grab' || g.grabbing !== f.i) { f.s = 'free'; f.by = -1; f.inv = 12; break; }
        f.gt--; if (pr & (B.J | B.A | B.S | B.M | B.L | B.R | B.U | B.D | B.H | B.G)) f.gt -= 4;
        f.x = g.x + g.face * (CH[g.ch].w / 2 + C.w / 2 + 6); f.y = g.y; f.gr = g.gr; f.face = -g.face;
        if (f.gt <= 0) { releaseGrab(st, g, f); }
        break;
      }
      case 'ledge': ledgeState(st, f, C, inp, pr, ax, ay); break;
      case 'getup': {
        const t = Math.min(1, f.sf / f.gn);
        f.x = f.gx0 + (f.gx1 - f.gx0) * t; f.y = f.gy0 + (f.gy1 - f.gy0) * (t < 0.5 ? t * 1.6 : 0.8 + (t - 0.5) * 0.4);
        if (f.sf >= f.gn) {
          f.s = 'free'; f.sf = 0; f.x = f.gx1; f.y = f.gy1; f.gr = supportAt(st, f); if (f.gr < 0) { f.gr = 0; } f.inv = Math.max(f.inv, 28); f.vx = 0; f.vy = 0;
          if (f.gk === 'atk') { f.gk = ''; startMove(st, f, 'ledgeatk'); }
        }
        break;
      }
      default: break;
    }
    f.pin = inp;
  }
  function groundMove(f, C, ax, k) {
    if (f.gr < 0) return;
    if (ax) { f.vx += ax * C.acc * k; const m = C.run * (k > 0.6 ? 1 : 0.6); if (f.vx > m) f.vx = m; else if (f.vx < -m) f.vx = -m; } else f.vx *= 0.72;
    if (Math.abs(f.vx) < 0.08) f.vx = 0;
  }
  // 地上のうごき：あるく（かるくたおす）・ダッシュ（はじく）・はしる（いっぱいにたおし続ける）・ふりむき（はしりながら逆にはじく）・ダッシュダンス・しゃがみ
  function groundControl(st, f, C, inp, ax, ay) {
    const full = (inp & B.F) !== 0, fl = f.fkn && f.fkx ? f.fkx : 0;
    f.cr = ay > 0 ? f.cr + 1 : 0;
    if (f.cr > 0 && !fl) { f.vx *= 0.78; if (Math.abs(f.vx) < 0.08) f.vx = 0; f.mm = 0; return; } // しゃがみ
    if (fl) {
      const vd = f.vx > 0 ? 1 : f.vx < 0 ? -1 : 0;
      if (f.mm === 2 && vd && fl !== vd && Math.abs(f.vx) > 1.5) { f.mm = 3; f.tn = 9; f.pv = 8; f.face = fl; ev(st, { t: 'pivot', i: f.i, x: f.x, y: f.y }); }
      else {
        ev(st, { t: f.mm === 1 && f.dd !== fl ? 'dd' : 'dash', i: f.i, x: f.x, y: f.y, d: fl });
        f.mm = 1; f.dsh = DASH_F; f.dd = fl; f.face = fl; f.vx = fl * C.run * 1.12;
      }
    }
    if (f.mm === 3) { // ふりむき中（むきはもうかわっている：ここでのつかみ・こうげきが「ピボット」）
      f.vx *= 0.9; f.tn--;
      if (f.tn <= 0) { if (ax && full) { f.mm = 1; f.dsh = DASH_F; f.dd = ax; f.vx = ax * C.run; f.face = ax; } else f.mm = 0; }
      return;
    }
    if (f.mm === 1) { // ダッシュ
      if (ax === f.dd) f.vx = f.dd * C.run * 1.12; else f.vx *= 0.88;
      if (--f.dsh <= 0) f.mm = ax && ax === f.dd && full ? 2 : 0;
      return;
    }
    if (f.mm === 2) { // はしる
      if (!ax) { f.vx *= 0.8; if (Math.abs(f.vx) < 1.2) f.mm = 0; return; }
      if (!full) f.mm = 0;
    }
    if (ax) {
      const run = full; if (run) f.mm = 2;
      const mx = run ? C.run : C.run * WALK, same = (ax > 0) === (f.vx > 0) || f.vx === 0;
      let nv = f.vx + ax * C.acc * (same ? 1 : 2.2);
      if (Math.abs(nv) > mx) nv = Math.abs(f.vx) > mx ? f.vx - Math.sign(f.vx) * Math.min(0.35, Math.abs(f.vx) - mx) : Math.sign(nv) * mx;
      f.vx = nv; f.face = ax;
    } else { f.vx *= 0.74; if (Math.abs(f.vx) < 0.08) f.vx = 0; }
  }
  function startTech(st, f, C, how) {
    f.tq = 0; f.tl = TECH_LOCK; f.lv = null; f.hs = 0; f.mm = 0;
    if (how === 'ground' && f.tdir) { f.s = 'roll'; f.sf = 3; f.thr = f.tdir; f.vy = 0; f.inv = 2; }
    else { f.s = 'tech'; f.sf = 0; f.inv = 20; if (how === 'ground') f.vx = 0; else { f.vx = 0; f.vy = how === 'ceil' ? 1 : 0; } }
    ev(st, { t: 'tech', i: f.i, x: f.x, y: f.y - C.h / 2, how });
  }
  function freeState(st, f, C, inp, pr, ax, ay) {
    const S = stageOf(st);
    let grounded = f.gr >= 0;
    // 動くゆかに乗っている
    if (grounded && f.gr >= 100) { const t = st.th[f.gr - 100]; f.x += t.vx; }
    if (f.pv > 0) f.pv--;
    // 動き
    if (grounded) groundControl(st, f, C, inp, ax, ay);
    else {
      f.mm = 0; f.cr = 0;
      if (ax) { if (!(Math.abs(f.vx) > C.air && (f.vx > 0) === (ax > 0))) f.vx += ax * C.aacc; if (Math.abs(f.vx) > C.air * 1.15) f.vx -= Math.sign(f.vx) * 0.12; }
      else f.vx *= 0.985;
      if (f.vy > 0 && !f.ffl && ((pr & B.D) || (f.fkn && f.fky > 0)) && !f.help) { f.ffl = true; f.vy = C.ff; } // はやおち
    }
    // ふち
    if (!grounded && f.lcd <= 0 && f.vy > -3 && !(ay > 0 && f.vy < 2) && tryLedge(st, f, C)) return;
    if (f.help) {
      // うごけない：ふちにだけつかまれる
      const lnd = physics(st, f, C, { grav: C.grav }); if (lnd) onLand(st, f, C);
      return;
    }
    // まもり・かわす・つかむ
    if (grounded && (inp & B.H) && f.shd > 4) { f.s = 'shield'; f.sf = 0; f.ss = 0; f.ssn = 0; f.pst = f.psl > 0 ? 0 : 6; ev(st, { t: 'shield', i: f.i, x: f.x, y: f.y - C.h / 2 }); return; }
    if (!grounded && (pr & B.H) && !f.adUsed) {
      f.s = 'adodge'; f.sf = 0; f.adUsed = true; f.dvx = ax * 5.2; f.dvy = ay * 5.2; f.vx = f.dvx; f.vy = f.dvy; f.ffl = false; ev(st, { t: 'dodge', i: f.i, x: f.x, y: f.y - C.h / 2 }); return;
    }
    if (grounded && (pr & B.G)) { // つかみ：その場・ダッシュつかみ・ふりむきつかみ（ふりむき中はむきがもうかわっている）
      startMove(st, f, (f.mm === 1 || f.mm === 2) && Math.abs(f.vx) > 2 ? 'dgrab' : 'grab'); return;
    }
    if (grounded && (pr & B.T) && !(inp & B.H)) { f.s = 'taunt'; f.sf = 0; ev(st, { t: 'taunt', i: f.i, x: f.x, y: f.y - C.h }); return; }
    // こうげき・とくぎ
    if (f.bs > 0 || f.bm > 0 || f.ba > 0 || f.bc > 0) if (tryAttack(st, f, C, inp, ax, ay, grounded)) return;
    // ジャンプ
    if (f.bj > 0) {
      if (grounded || f.coy > 0) { f.s = 'jsq'; f.sf = 0; f.bj = 0; f.face = ax || f.face; return; }
      if (f.jumps > 0) { f.jumps--; f.vy = -C.dj; f.vx = ax ? ax * Math.max(C.air * 0.8, Math.abs(f.vx) * 0.5) : f.vx * 0.5; if (ax) f.face = ax; f.bj = 0; f.ffl = false; ev(st, { t: 'jump', i: f.i, x: f.x, y: f.y, big: 1 }); }
    }
    // すり抜けて降りる：下にはじく、または下をおし続ける
    if (grounded && f.gr >= 100 && ((f.fkn && f.fky > 0) || f.cr >= 8)) { f.dropT = 16; f.gr = -1; f.vy = 1.2; grounded = false; }
    const lnd = physics(st, f, C, { grav: C.grav });
    if (lnd) onLand(st, f, C);
  }
  // 縁につかまれる位置にいたら、つかまる
  function tryLedge(st, f, C) {
    const S = stageOf(st);
    for (let i = 0; i < S.ledges.length; i++) {
      const L = S.ledges[i];
      if (st.fighters.some(g => g !== f && g.s === 'ledge' && g.lg === i)) continue;
      const hy = L.y + C.h * 0.9, hx = L.x - L.dir * (C.w / 2 + 3);
      if (Math.abs(f.y - hy) < 38 && (f.x - hx) * L.dir > -34 && (f.x - hx) * L.dir < 14) { grabLedge(st, f, C, i, L, hx, hy); return true; }
    }
    return false;
  }
  function grabLedge(st, f, C, i, L, hx, hy) {
    f.s = 'ledge'; f.sf = 0; f.lg = i; f.x = hx; f.y = hy; f.vx = 0; f.vy = 0; f.gr = -1; f.face = L.dir; f.inv = Math.max(10, 40 - 7 * f.lgN); f.lgN++; f.jumps = JM(f); f.adUsed = false; f.sbUsed = false; f.help = false; f.ffl = false; f.mv = ''; f.gk = '';
    ev(st, { t: 'ledge', i: f.i, x: hx, y: hy });
  }
  function ledgeState(st, f, C, inp, pr) {
    const S = stageOf(st), L = S.ledges[f.lg];
    f.vx = 0; f.vy = 0; f.x = L.x - L.dir * (C.w / 2 + 3); f.y = L.y + C.h * 0.9;
    if (f.sf > 30 && f.inv < 1) f.inv = 1;
    if (f.sf >= 30 && f.sf < 33) f.inv = 0;
    const toward = L.dir > 0 ? B.R : B.L, away = L.dir > 0 ? B.L : B.R;
    // ふちのこうどう：のぼる（上・ふちがわ）／こうげき（A）／ころがってのぼる（まもり）／ジャンプ／おりる（下・はなれる）
    const up = (kind, gn, far) => { f.s = 'getup'; f.sf = 0; f.gn = gn; f.gk = kind; f.gx0 = f.x; f.gy0 = f.y; f.gx1 = L.x + L.dir * (C.w / 2 + 4 + far); f.gy1 = L.y;
      const sd = S.solids.find(q => Math.abs(q.y1 - L.y) < 1 && L.x >= q.x1 - 1 && L.x <= q.x2 + 1); if (sd) f.gx1 = clamp(f.gx1, sd.x1 + C.w / 2 + 2, sd.x2 - C.w / 2 - 2); f.lg = -1; f.lcd = 30; f.inv = Math.max(f.inv, kind === 'roll' ? 30 : 36); f.mv = ''; };
    if (f.sf >= 4 && (pr & (B.A | B.M))) up('atk', 22, 0);
    else if (f.sf >= 4 && (pr & B.H)) up('roll', 30, 78);
    else if (f.sf >= 8 && (inp & (B.U | toward)) || f.sf >= 4 && (pr & B.S)) up('norm', 22, 0);
    else if (f.sf >= 4 && (pr & B.J)) {
      f.s = 'free'; f.sf = 0; f.vy = -C.jump * 0.95; f.vx = L.dir * 2.4; f.lg = -1; f.lcd = 24; f.jumps = JM(f); f.inv = Math.max(f.inv, 20);
    } else if (f.sf >= 8 && (inp & (B.D | away)) || f.sf > 230) {
      f.s = 'free'; f.sf = 0; f.lg = -1; f.lcd = 45; f.vx = -L.dir * 0.6; f.vy = 1; f.inv = 0;
    }
  }
  function respawn(st, f) {
    const S = stageOf(st);
    f.s = 'rez'; f.sf = 0; f.rez = 190; f.x = S.spawn[0]; f.y = S.spawn[1]; f.vx = 0; f.vy = 0; f.gr = -1; f.inv = 220; f.pct = f.pct; f.face = f.x <= 0 ? 1 : -1;
    if (f.ks) f.ks = null;
    f.mv = ''; f.shd = 100; f.buff = 0; f.help = false; f.adUsed = false; f.sbUsed = false; f.lg = -1; f.lv = null; f.hold = 0; f.hs = 0; f.cmb = 0; f.cmbT = 0; f.jumps = JM(f); f.lgN = 0; f.tq = 0; f.tl = 0; f.mm = 0;
    ev(st, { t: 'respawn', i: f.i, x: f.x, y: f.y });
  }

  // こうげきを選ぶ
  function tryAttack(st, f, C, inp, ax, ay, grounded) {
    let key = null;
    // Cスティック：地上はいつも強い攻撃、空中はその向きの空中技
    if (f.bc > 0) {
      const d = f.bcd, cx = (d & B.CR ? 1 : 0) - (d & B.CL ? 1 : 0), cy = (d & B.CD ? 1 : 0) - (d & B.CU ? 1 : 0);
      if (grounded) { key = cx ? 'fsmash' : cy < 0 ? 'usmash' : 'dsmash'; if (cx) f.face = cx; }
      else key = cx ? (cx === f.face ? 'fair' : 'bair') : cy < 0 ? 'uair' : 'dair';
      f.bc = 0; f.ba = 0; f.bm = 0; startMove(st, f, key, ax, ay, 'cstick'); return true;
    }
    if (f.bs > 0) {
      key = 'sp' + (ay < 0 ? 'U' : ay > 0 ? 'D' : ax ? 'S' : 'N');
      if (f.ks && f.ks.st && MOVES[f.ch][key + 'b']) key += 'b'; // 構え（ピアノ騎士・パトリン）：構えているあいだは、もう一組のとくぎ
      const m = MOVES[f.ch][key];
      if (!grounded && f.help) key = null;
      else if (!grounded && m.kind === 'dash' && f.sbUsed) key = null;
      else if (!grounded && m.kind === 'cmdgrab') key = null;
      else if (KINDS[m.kind] && KINDS[m.kind].canUse && !KINDS[m.kind].canUse(st, f, m, grounded)) key = null;
      if (key) { if (ax && (key === 'spS' || key === 'spSb' || grounded)) f.face = ax; f.bs = 0; f.ba = 0; f.bm = 0; startMove(st, f, key, ax, ay); return true; }
    }
    if (f.bm > 0 && grounded) {
      key = ay < 0 ? 'usmash' : ay > 0 ? 'dsmash' : 'fsmash';
      if (ax && !ay) f.face = ax;
      f.bm = 0; f.ba = 0; startMove(st, f, key, ax, ay); return true;
    }
    // はじき＋こうげき＝強い攻撃
    if (f.ba > 0 && grounded && f.fkt > 0 && (f.fkx || f.fky)) {
      key = f.fky < 0 ? 'usmash' : f.fky > 0 ? 'dsmash' : 'fsmash';
      if (f.fkx && !f.fky) f.face = f.fkx;
      f.ba = 0; f.bm = 0; startMove(st, f, key, ax, ay, 'flick'); return true;
    }
    if (f.ba > 0 || f.bm > 0) {
      if (grounded) {
        if (!ay && (f.mm === 1 || f.mm === 2) && Math.abs(f.vx) > 1.6) key = 'dattack'; // はしりながら：ダッシュこうげき
        else { key = ay < 0 ? 'utilt' : ay > 0 ? 'dtilt' : ax ? 'ftilt' : 'jab'; if (ax && !ay) f.face = ax; }
      }
      else key = ay < 0 ? 'uair' : ay > 0 ? 'dair' : ax === f.face ? 'fair' : ax === -f.face ? 'bair' : 'nair';
      f.ba = 0; f.bm = 0; startMove(st, f, key, ax, ay); return true;
    }
    return false;
  }
  function startMove(st, f, key, ax, ay, how) {
    const C = CH[f.ch], m = MOVES[f.ch][key];
    f.s = 'atk'; f.mv = key; f.mf = 0; f.sf = 0; f.mh = []; f.chg = 0; f.pf = 0; f.cdm = 0; f.sel = 0; f.mdx = ax | 0; f.mdy = ay | 0; f.rj = 0;
    if (f.gr >= 0 && key !== 'dattack' && key !== 'dgrab') f.mm = 0;
    if (!f.used) f.used = {}; f.used[key] = (f.used[key] | 0) + 1;
    if (key !== 'grab' && key !== 'dgrab' && key !== 'ledgeatk' && key !== 'getupatk') { f.recent.push(key); if (f.recent.length > 8) f.recent.shift(); }
    if (f.gr < 0 && m.kind === 'dash') f.sbUsed = true;
    ev(st, { t: 'move', i: f.i, k: key, x: f.x, y: f.y - C.h / 2, how: how || '' });
  }

  function atkState(st, f, C, inp, pr, ax, ay) {
    const m = MOVES[f.ch][f.mv];
    const grounded = f.gr >= 0;
    let frozen = false;
    // ため（つよい攻撃）：はじまる前のところで、ボタンを押しているあいだ止まる
    if (m.sm && f.mf === 3 && (inp & (B.M | B.A | CMASK)) && f.chg < 45) { f.chg++; frozen = true; if (f.chg === 1) ev(st, { t: 'charge', i: f.i, x: f.x, y: f.y - C.h / 2 }); }
    if (!frozen) f.mf++;
    const k = m.kind, fr = f.mf;
    // れんだ：じゃぶがあたっているあいだ、ボタンを押し続けると「れんぞくジャブ」→ しめ
    if (f.mv === 'jab' && fr >= m.s + m.a + 2 && fr < m.t && (inp & B.A) && f.mh.length > 0) { f.mv = 'rjab'; f.mf = 0; f.mh = []; f.rj = 0; return; }
    if (k === 'proj' && fr === m.s) spawnProj(st, f, C, m);
    else if (k === 'mine' && fr === m.s) spawnMine(st, f, C, m);
    else if (k === 'buff' && fr === m.s) { f.buff = m.buff; ev(st, { t: 'buff', i: f.i, x: f.x, y: f.y - C.h }); }
    if (m.arm && fr >= m.arm[0] && fr <= m.arm[1]) f.arm = 1;
    if (k === 'reflect' && fr >= m.s && fr < m.s + m.a) f.rfl = 1;
    let grav = C.grav, aair = 0.45;
    const cx = { grav, free: false, ax, ay, inp, grounded };
    if (k === 'dash') {
      if (fr >= m.s && fr < m.s + m.a) { f.vx = f.face * m.v; if (!grounded) { f.vy = 0; grav = 0; } }
      else if (fr === m.s + m.a) f.vx *= 0.35;
    } else if (k === 'rise') {
      if (fr === m.s && grounded) { f.gr = -1; }
      if (fr >= m.s && fr < m.s + m.a) {
        const p = (fr - m.s) / m.a; f.gr = -1; f.vy = -m.rv * (1 - 0.45 * p); f.vx = ax ? ax * m.dv : f.vx * 0.9; grav = 0; f.ffl = false;
        if (ax && fr === m.s) f.face = ax;
      }
      if (fr === m.s + m.a) { f.vy = -1; }
    } else if (k === 'spin') {
      if (fr >= m.s && fr < m.s + m.a) { f.vx = ax * 3.6 + f.vx * 0.2; if (f.gr < 0) { f.vy = Math.min(f.vy, 0.7); grav = 0.12; } if ((fr - m.s) % m.rh === 0) f.mh = []; }
    } else if (k === 'pound') {
      if (fr <= m.s) { if (!grounded) { f.vy = 0; grav = 0; f.vx *= 0.8; } }
      if (fr === m.s) {
        if (!grounded) { f.pf = 1; f.vy = m.fv; f.vx *= 0.3; f.mf = m.s; f.mh = []; ev(st, { t: 'move', i: f.i, k: 'poundfall', x: f.x, y: f.y }); }
        else { f.mf = m.s + 1; f.mh = []; ev(st, { t: 'slam', i: f.i, x: f.x, y: f.y, p: 8 }); }
      }
      if (f.pf) { f.mf = m.s; grav = 0.9; f.vy = Math.max(f.vy, m.fv * 0.7); }
    } else if (k === 'counter') {
      if (fr >= m.s && fr < m.s + m.a) f.arm = 2;
    } else if (KINDS[k] && KINDS[k].tick) {
      KINDS[k].tick(st, f, C, m, fr, cx);
      grav = cx.grav;
    } else if (k === 'tele') {
      // ワープ：はじまるまでは消えている（よけ）。むきは、はじめに入れていた方向（なければ m.dd）
      if (fr >= 2 && fr < m.s) { f.inv = 2; f.vx = 0; f.vy = 0; grav = 0; }
      if (fr === m.s) teleport(st, f, C, m);
      if (fr > m.s && fr < m.s + 3) { grav = 0.15; }
    }
    if (cx.free) { /* 新しい種類のとくぎが、動きを自分で決めている */ }
    else if (grounded) { if (k !== 'dash') f.vx *= 0.8; }
    else if (k !== 'dash' && k !== 'rise' && k !== 'spin') { if (ax) { f.vx += ax * C.aacc * aair; } f.vx *= 0.99; }
    const lnd = physics(st, f, C, { grav });
    if (lnd) onLand(st, f, C);
    if (f.s !== 'atk') return;
    if ((k === 'rise' || (k === 'tele' && m.help) || (KINDS[k] && KINDS[k].recovery)) && f.gr < 0 && f.lcd <= 0 && fr >= m.s + 4 && tryLedge(st, f, C)) return;
    if (f.mf >= m.t) {
      if (f.mv === 'rjab') { // れんぞくジャブ：押し続けているあいだ。はなしたら、しめ
        if ((inp & B.A) && f.rj < 10) { f.rj++; f.mf = 0; f.mh = []; return; }
        if (f.rj >= 2) { f.mv = 'jabfin'; f.mf = 0; f.mh = []; ev(st, { t: 'move', i: f.i, k: 'jabfin', x: f.x, y: f.y - C.h / 2 }); return; }
      }
      f.s = 'free'; f.sf = 0; f.mv = ''; f.pf = 0;
      if ((k === 'rise' || (k === 'tele' && m.help) || (KINDS[k] && KINDS[k].recovery)) && f.gr < 0) f.help = true;
    }
  }
  // ワープ先：(mdx, mdy) の方向へ td の距離。ステージの中の壁にめりこまないように手前でとめる
  function teleport(st, f, C, m) {
    let dx = f.mdx, dy = f.mdy;
    if (m.fixed || (!dx && !dy)) { dx = m.dd ? m.dd[0] * f.face : f.face; dy = m.dd ? m.dd[1] : 0; }
    else if (dx) f.face = dx;
    const n = hyp(dx, dy) || 1; dx /= n; dy /= n;
    const S = stageOf(st), bl = S.blast, hw = C.w / 2;
    const free = (x, y) => { for (const s of S.solids) if (x + hw > s.x1 && x - hw < s.x2 && y > s.y1 + 0.5 && y - C.h < s.y2) return false; return true; };
    let d = m.td;
    for (; d > 0; d -= 10) { const x = f.x + dx * d, y = f.y + dy * d; if (x > bl.l + 30 && x < bl.r - 30 && y > bl.t + 30 && y < bl.b - 30 && free(x, y)) break; }
    ev(st, { t: 'warp', i: f.i, x: f.x, y: f.y - C.h / 2, x2: f.x + dx * d, y2: f.y + dy * d - C.h / 2 });
    f.x += dx * d; f.y += dy * d; f.gr = -1; f.vx = dx * 1.2; f.vy = Math.min(0, dy * 1.5); f.ffl = false;
    f.mh = [];
  }
  const PROJ_OPT = ['pierce', 'rh', 'bnc', 'nohit', 'rad', 'pw', 'slow', 'root', 'arm', 'dn'];
  function spawnProj(st, f, C, m) {
    const p = m.proj;
    const o = { o: f.i, k: p.kind, x: f.x + f.face * (C.w / 2 + 8), y: f.y - C.h * 0.55, vx: f.face * p.sp, vy: p.vy, g: p.g, r: p.r, life: p.life, dmg: p.dmg, bkb: p.bkb, kbg: p.kbg, ang: p.ang, bn: p.bounce ? 3 : 0, t: 0, face: f.face, bf: f.buff > 0 ? 1.25 : 1, hbk: m.key };
    for (const k of PROJ_OPT) if (p[k] !== undefined) o[k] = p[k]; // 新しい飛び道具の性質（貫通・はね返り・当たらない印 など）。古い飛び道具には足さない（状態が変わらないように）
    st.pr.push(o);
    ev(st, { t: 'shoot', i: f.i, k: p.kind, x: f.x + f.face * 30, y: f.y - C.h * 0.55 });
  }
  function spawnMine(st, f, C, m) {
    const p = m.proj;
    const mx = p.max || 1, mk = p.kind || 'mine';
    for (;;) { let first = -1, n = 0; for (let i = 0; i < st.pr.length; i++) if (st.pr[i].o === f.i && st.pr[i].k === mk) { if (first < 0) first = i; n++; } if (n < mx) break; st.pr.splice(first, 1); }
    st.pr.push({ o: f.i, k: mk, x: f.x + f.face * 28, y: f.y - 12, vx: 0, vy: 0, g: 0.5, r: p.r, life: p.life, arm: p.arm, dmg: p.dmg, bkb: p.bkb, kbg: p.kbg, ang: p.ang, bn: 0, t: 0, face: f.face, bf: 1, hbk: m.key });
    ev(st, { t: 'shoot', i: f.i, k: mk, x: f.x + f.face * 28, y: f.y });
  }

  // つかみ
  function grabState(st, f, C, inp, pr, ax, ay) {
    const D = st.fighters[f.grabbing];
    f.vx = 0; physics(st, f, C, { grav: C.grav });
    if (!D || D.s !== 'held' || D.by !== f.i) { f.s = 'lag'; f.lag = 10; f.grabbing = -1; return; }
    f.gt--;
    let dir = '';
    if (f.sf > 6) {
      if (pr & B.U) dir = 'u'; else if (pr & B.D) dir = 'd';
      else if (pr & (B.L | B.R)) dir = ((pr & B.R) ? 1 : -1) === f.face ? 'f' : 'b';
      else if (pr & (B.G | B.S | B.M)) dir = 'f';
    }
    if (dir) { throwFighter(st, f, D, dir); return; }
    if ((pr & B.A) && f.pum <= 0) { f.pum = 12; D.pct += 1.6; f.dealt += 1.6; D.taken += 1.6; f.hold = 3; D.hold = 3; D.gt -= 6; ev(st, { t: 'pummel', i: f.i, d: D.i, x: D.x, y: D.y - 24 }); }
    if (f.pum > 0) f.pum--;
    if (f.gt <= 0) releaseGrab(st, f, D);
  }
  function releaseGrab(st, g, d) {
    g.s = 'lag'; g.lag = 14; g.grabbing = -1; d.s = 'free'; d.by = -1; d.inv = 14; d.vx = g.face * 1.2; d.sf = 0;
  }
  function throwFighter(st, A, D, dir) {
    const T = Object.assign({}, THROWS[dir], (CH[A.ch].tw || {})[dir]), tm = throwMul(A.ch);
    const p = { dmg: T.dmg * tm, bkb: T.bkb, kbg: T.kbg * tm, ang: dir === 'b' ? 142 : T.ang, throw: 1 };
    A.s = 'lag'; A.lag = 18; A.grabbing = -1; A.sf = 0;
    D.by = -1; D.s = 'free';
    const face = A.face; // うしろなげは、角度（142度）のほうで後ろへ飛ぶ
    launch(st, A, D, p, face, D.x, D.y - 24, 'throw'); applyLaunch(st, D, 0); D.hold = 0;
    ev(st, { t: 'throw', i: A.i, d: D.i, dir });
  }

  // ------------------------------------------------------------------------------------------------ あたり判定
  function hurtDist(f, C, cx, cy) { // 円の中心 (cx,cy) から、からだの四角までの近さ（しゃがむと、低くなる）
    const hw = C.w / 2, hh = f.cr > 2 && f.s === 'free' ? C.h * 0.66 : C.h, qx = clamp(cx, f.x - hw, f.x + hw), qy = clamp(cy, f.y - hh, f.y);
    return hyp(cx - qx, cy - qy);
  }
  function boxesOf(st, A) {
    const m = MOVES[A.ch][A.mv]; if (!m) return null;
    const k = m.kind, fr = A.mf;
    let hbs = null, p = null, t = 0;
    if (k === 'pound') {
      if (A.pf) { hbs = m.hb; p = m; t = 0; }
      else if (fr >= m.s + 1 && fr < m.s + 1 + m.land.a) { hbs = m.land.hb; p = m.land; t = 0; }
    } else if (k === 'counter') {
      const s0 = m.cf + m.cs;
      if (A.cdm > 0 && fr >= s0 && fr < s0 + m.ca) { hbs = m.hb; p = { dmg: Math.min(24, m.dmg + A.cdm * 1.2), bkb: m.bkb, kbg: m.kbg, ang: m.ang }; t = (fr - s0) / Math.max(1, m.ca - 1); }
    } else if (k === 'spin') {
      if (fr >= m.s && fr < m.s + m.a) { hbs = m.hb; p = fr >= m.s + m.a - m.rh ? m.fin : m; t = 0; }
    } else if (k === 'melee' || k === 'dash' || k === 'rise' || k === 'tele' || k === 'reflect') {
      if (fr >= m.s && fr < m.s + m.a) { hbs = m.hb; p = m; t = (fr - m.s) / Math.max(1, m.a - 1); }
    } else if (k === 'grab' || k === 'cmdgrab') {
      if (fr >= m.s && fr < m.s + m.a) { hbs = m.hb; p = m; t = (fr - m.s) / Math.max(1, m.a - 1); }
    } else if (KINDS[k]) {
      const KH = KINDS[k];
      if (KH.boxes) { const r = KH.boxes(A, m, fr); if (r) { hbs = r.hbs; p = r.p; t = r.t || 0; } }
      else if (KH.melee && fr >= m.s && fr < m.s + m.a) { hbs = m.hb; p = m; t = (fr - m.s) / Math.max(1, m.a - 1); }
    }
    if (!hbs) return null;
    const out = [];
    for (const h of hbs) out.push({ x: A.x + A.face * (h[0] + (h[2] - h[0]) * t), y: A.y + h[1] + (h[3] - h[1]) * t, r: h[4] });
    return { boxes: out, p, m };
  }
  // 見た目用：いま出ているあたり判定
  function activeBoxes(st, i) { const A = st.fighters[i]; return A.s === 'atk' ? boxesOf(st, A) : null; }

  const isMine = p => p.k === 'mine' || (PROJ[p.k] !== undefined && PROJ[p.k].mine === true);
  function gatherHits(st) {
    const F = st.fighters, hits = [];
    for (const A of F) {
      if (A.s !== 'atk' || A.hold > 0) continue;
      const b = boxesOf(st, A); if (!b) continue;
      const kind = b.m.kind;
      for (const D of F) {
        if (D === A || D.s === 'dead' || D.s === 'out' || D.s === 'rez') continue;
        if (A.mh.indexOf(D.i) >= 0) continue;
        const DC = CH[D.ch];
        for (const bx of b.boxes) {
          if (hurtDist(D, DC, bx.x, bx.y) <= bx.r) {
            hits.push({ A, D, p: b.p, m: b.m, x: bx.x, y: bx.y, kind, face: A.face }); A.mh.push(D.i); break;
          }
        }
      }
    }
    for (const p of st.pr) {
      if (p.dead || p.nohit) continue;
      if (p.arm && p.t < p.arm) continue;
      const mine = isMine(p);
      for (const D of F) {
        if (D.i === p.o || D.s === 'dead' || D.s === 'out' || D.s === 'rez') continue;
        if (p.pierce && p.hl && p.hl[D.i] !== undefined && st.f - p.hl[D.i] < (p.rh || 20)) continue;
        if (mine ? hurtDist(D, CH[D.ch], p.x, p.y) <= p.r + 6 : hurtDist(D, CH[D.ch], p.x, p.y) <= p.r) {
          const face = mine ? (D.x >= p.x ? 1 : -1) : (p.vx >= 0 ? 1 : -1);
          hits.push({ A: F[p.o], D, p: { dmg: p.dmg * p.bf, bkb: p.bkb, kbg: p.kbg, ang: p.ang }, m: null, x: p.x, y: p.y, kind: 'proj', face, pj: p });
          if (p.pierce) { if (!p.hl) p.hl = {}; p.hl[D.i] = st.f; } else { p.dead = true; break; }
        }
      }
    }
    return hits;
  }
  function applyHits(st, hits) {
    // つかみは、ふつうの攻撃より後
    hits.sort((a, b) => ((a.kind === 'grab' || a.kind === 'cmdgrab') ? 1 : 0) - ((b.kind === 'grab' || b.kind === 'cmdgrab') ? 1 : 0));
    for (const h of hits) {
      const { A, D } = h;
      if (D.inv > 0 || D.s === 'dead' || D.s === 'out') continue;
      if (h.kind === 'grab' || h.kind === 'cmdgrab') {
        if (D.gr < 0 || D.s === 'hurt' || D.s === 'held' || D.s === 'ledge' || D.s === 'getup' || D.s === 'grab' || A.s !== 'atk') continue;
        if (D.s === 'roll' || D.s === 'spot') continue;
        A.s = 'grab'; A.grabbing = D.i; A.gt = Math.round(60 + D.pct * 0.5); A.sf = 0; A.mv = ''; A.pum = 0; A.vx = 0;
        D.s = 'held'; D.by = A.i; D.gt = Math.round(70 + D.pct * 0.9); D.mv = ''; D.vx = 0; D.sf = 0;
        ev(st, { t: 'grab', i: A.i, d: D.i, x: D.x, y: D.y - 24 });
        if (h.kind === 'cmdgrab') { // ぎゅっ：すぐなげる
          const T = h.m; A.gt = 14; A.hugp = 1;
          A.s = 'lag'; A.lag = 22; A.grabbing = -1; D.by = -1; D.s = 'free';
          launch(st, A, D, { dmg: T.dmg, bkb: T.bkb, kbg: T.kbg, ang: T.ang, throw: 1 }, A.face, D.x, D.y - 24, 'hug'); applyLaunch(st, D, 0); D.hold = 0;
        }
        continue;
      }
      hitFighter(st, h);
    }
    for (let i = st.pr.length - 1; i >= 0; i--) if (st.pr[i].dead) { const p = st.pr[i]; ev(st, { t: 'pop', k: p.k, x: p.x, y: p.y }); st.pr.splice(i, 1); }
  }
  function hitFighter(st, h) {
    const { A, D, p } = h, DC = CH[D.ch];
    let d = p.dmg;
    // 同じ技ばかり使うと弱くなる
    if (h.m) { let n = 0; for (const k of A.recent) if (k === h.m.key) n++; d *= Math.max(0.55, 1 - 0.06 * Math.max(0, n - 1)); if (A.buff > 0) d *= 1.25; }
    if (h.m && h.m.sm && A.chg > 0) d *= 1 + 0.4 * Math.min(1, A.chg / 45);
    if (h.m && A.ks && A.ks.pow > 0) { d *= 1 + Math.min(0.5, A.ks.pow * 0.03); A.ks.pow = 0; }
    d = rd(d);
    const face = h.face;
    // まもり
    if (D.s === 'shield') {
      const hs = 3 + Math.min(6, Math.floor(d / 3));
      if (D.pst > 0) { // ジャストガード：まもりを出した直後。まもりはへらず、しびれもなく、攻めた側にすきができる
        A.hold = hs + 6; D.hold = hs; D.ssn = 0; D.vx += face * 0.3; D.shd = Math.min(100, D.shd + 4);
        if (A.s === 'atk') A.vx -= face * 1.4;
        ev(st, { t: 'block', i: A.i, d: D.i, x: h.x, y: h.y, dmg: d, perfect: 1 }); ev(st, { t: 'pshield', i: A.i, d: D.i, x: h.x, y: h.y });
        return;
      }
      D.shd -= d * 1.3 + 1.5 + (h.m && h.m.sbk ? h.m.sbk : 0);
      A.hold = hs; D.hold = hs; D.ssn = hs + 2 + Math.floor(d * 0.3); D.vx += face * (0.9 + d * 0.1); if (A.s === 'atk') A.vx -= face * (0.9 + d * 0.06);
      ev(st, { t: 'block', i: A.i, d: D.i, x: h.x, y: h.y, dmg: d });
      if (D.shd <= 0) { D.s = 'stun'; D.sf = 0; D.vy = -6; D.gr = -1; D.shd = 0; D.ssn = 0; ev(st, { t: 'shbreak', d: D.i, x: D.x, y: D.y - DC.h * 0.6 }); }
      return;
    }
    // カウンター
    if (D.s === 'atk') {
      const dm = MOVES[D.ch][D.mv];
      if (dm.kind === 'counter' && D.mf >= dm.s && D.mf < dm.s + dm.a) {
        D.mf = dm.cf; D.cdm = d; D.face = A.x >= D.x ? 1 : -1; D.mh = []; D.inv = 10; A.hold = 9; D.hold = 9; A.hold = 9;
        ev(st, { t: 'counter', i: D.i, a: A.i, x: h.x, y: h.y }); return;
      }
    }
    D.pct = rd(D.pct + d); A.dealt = rd(A.dealt + d); D.taken = rd(D.taken + d);
    D.last = A.i; D.lastF = st.f; D.lk = h.m ? h.m.key : (h.kind === 'proj' ? 'proj' : '');
    A.cmb = D.cmbT > 0 && D.s === 'hurt' ? A.cmb + 1 : 1; A.cmbT = 70; if (A.cmb > A.maxCmb) A.maxCmb = A.cmb;
    if (D.s === 'hurt') D.cmb = 0;
    const hs = clamp(3 + Math.floor(d * 0.34), 3, 12);
    // スーパーアーマー（ダメージだけ受ける）
    if (D.arm === 1 && d <= 15) { D.hold = 4; A.hold = hs; ev(st, { t: 'hit', i: A.i, d: D.i, x: h.x, y: h.y, dmg: d, p: 0, armor: 1, pct: D.pct }); return; }
    launch(st, A, D, Object.assign({}, p, { dmg: d }), face, h.x, h.y, h.kind);
    A.hold = Math.max(A.hold, hs); D.hold = hs + 1;
    if (h.pj) { /* 飛び道具：持ち主は止まらない */ A.hold = Math.max(0, A.hold - hs); }
    if (h.m && KINDS[h.m.kind] && KINDS[h.m.kind].onHit) KINDS[h.m.kind].onHit(st, A, D, h);
    if (h.pj && PROJ[h.pj.k] && PROJ[h.pj.k].hit) PROJ[h.pj.k].hit(st, A, D, h.pj, h);
  }
  // 吹っ飛ばし：ダメージが大きいほど、強く飛ぶ
  function launch(st, A, D, p, face, hx, hy, how) {
    const DC = CH[D.ch];
    const wm = 1 + (100 - DC.weight) * 0.006;
    const pAfter = D.pct;
    let v = (p.bkb + p.kbg * pAfter * 0.01) * 0.18 * wm;
    if (D.cr > 2 && D.gr >= 0 && D.s === 'free') v *= 0.85; // しゃがみ（クラウチキャンセル）：飛びにくい
    if (how === 'hug' || how === 'throw') { D.pct = rd(D.pct + p.dmg); A.dealt = rd(A.dealt + p.dmg); D.taken = rd(D.taken + p.dmg); D.last = A.i; D.lastF = st.f; D.lk = how; v = (p.bkb + p.kbg * D.pct * 0.01) * 0.18 * wm; }
    const a = V(p.ang); let dx = a[0] * face, dy = a[1];
    if (D.gr >= 0 && dy > -0.25) { dy = 0; dx = face; }
    if (D.gr >= 0 && v < 2.4 && dy >= -0.1) dy = 0;
    D.chain = D.s === 'hurt' ? (D.chain | 0) + 1 : 0;
    D.s = 'hurt'; D.mv = ''; D.mf = 0; D.chg = 0; D.sf = 0; D.hs = clamp(Math.floor((Math.floor(v * 3.4) + 4) * Math.max(0.3, 1 - 0.12 * D.chain)), 6, 90); D.cmbT = D.hs + 6; D.lg = -1; D.help = false; D.pf = 0; D.ffl = false; D.arm = 0;
    D.sdi = 0; D.mm = 0; D.cr = 0; D.tq = 0;
    D.lv = [rd(dx * v), rd(dy * v)]; D.by = -1; if (D.grabbing >= 0) { const g = st.fighters[D.grabbing]; if (g && g.s === 'held') { g.s = 'free'; g.by = -1; } D.grabbing = -1; }
    if (D.gr >= 0 && dy < 0) D.gr = -1;
    ev(st, { t: 'hit', i: A.i, d: D.i, x: hx, y: hy, dmg: p.dmg, p: v, pct: D.pct, how: how || 'melee', fx: dx, fy: dy });
  }
  function applyLaunch(st, f, inp) {
    const lv = f.lv; f.lv = null; if (!lv) return;
    let vx = lv[0], vy = lv[1];
    const sp = hyp(vx, vy);
    if (sp > 3 && inp) {
      const di = (axOf(inp) * (-vy) + ayOf(inp) * vx) / sp;
      const th = clamp(di, -1, 1) * 0.2, c = 1 - th * th / 2;
      const nx = vx * c - vy * th, ny = vx * th + vy * c; vx = nx; vy = ny;
    }
    f.vx = rd(vx); f.vy = rd(vy); f.lastVy = Math.abs(f.vy);
    if (f.vy < 0) f.gr = -1;
  }

  function updateProjectiles(st) {
    const S = stageOf(st), bl = S.blast;
    for (const p of st.pr) {
      // 吸収（ドラムコ）：構えている間に当たった飛び道具は、ダメージが回復と次の攻撃の力になる
      if (!isMine(p) && !p.nohit) for (const F of st.fighters) {
        if (!F.ks || !(F.ks.abs > 0) || F.i === p.o || p.dead) continue;
        if (hurtDist(F, CH[F.ch], p.x, p.y) <= p.r + 30) { p.dead = true; F.pct = Math.max(0, rd(F.pct - p.dmg * 0.8)); F.ks.pow = (F.ks.pow || 0) + p.dmg; ev(st, { t: 'absorb', i: F.i, x: p.x, y: p.y }); }
      }
      if (p.dead) continue;
      // はね返し（リフレクター）：構えている前に飛んできた飛び道具は、持ち主がかわる
      if (p.k !== 'mine' && !p.nohit) for (const F of st.fighters) {
        if (!F.rfl || F.i === p.o || F.s !== 'atk') continue;
        if ((p.x - F.x) * F.face > -8 && hurtDist(F, CH[F.ch], p.x, p.y) <= p.r + 34) {
          p.vx = -p.vx * 1.15; p.vy = p.vy * 0.5; p.o = F.i; p.bf = 1.3; p.life = Math.max(p.life, 36); p.face = -p.face; p.t = 0;
          ev(st, { t: 'reflect', i: F.i, x: p.x, y: p.y });
        }
      }
      p.t++; p.life--;
      p.vy += p.g; p.x += p.vx; p.y += p.vy;
      { const PK = PROJ[p.k]; if (PK && PK.update) PK.update(st, p); }
      if (isMine(p)) {
        // 床に落ちたら止まる
        for (const s of S.solids) if (p.x >= s.x1 && p.x <= s.x2 && p.y >= s.y1 - p.r * 0.5 && p.y <= s.y1 + 14 && p.vy >= 0) { p.y = s.y1 - p.r * 0.5; p.vy = 0; p.g = 0; }
        for (const t of st.th) if (p.x >= t.x1 && p.x <= t.x2 && p.y >= t.y - p.r * 0.5 && p.y <= t.y + 10 && p.vy >= 0) { p.y = t.y - p.r * 0.5; p.vy = 0; p.g = 0; p.x += t.vx; }
      } else if (p.k === 'ball' || p.bnc) {
        let bounced = false;
        for (const s of S.solids) if (p.x >= s.x1 - p.r && p.x <= s.x2 + p.r && p.y + p.r >= s.y1 && p.y - p.vy + p.r <= s.y1 + 2 && p.vy > 0) { p.y = s.y1 - p.r; p.vy = -Math.abs(p.vy) * 0.85; bounced = true; }
        for (const t of st.th) if (!bounced && p.x >= t.x1 && p.x <= t.x2 && p.y + p.r >= t.y && p.y - p.vy + p.r <= t.y + 3 && p.vy > 0) { p.y = t.y - p.r; p.vy = -Math.abs(p.vy) * 0.85; bounced = true; }
        if (bounced) { p.bn--; if (p.bn < 0) p.dead = true; else ev(st, { t: 'tick', x: p.x, y: p.y }); }
        for (const s of S.solids) if (p.x + p.r > s.x1 && p.x - p.r < s.x2 && p.y > s.y1 + 6 && p.y < s.y2) p.vx = -p.vx;
      } else if (!p.nohit) {
        for (const s of S.solids) if (p.x + p.r > s.x1 && p.x - p.r < s.x2 && p.y + p.r > s.y1 + 2 && p.y - p.r < s.y2) { p.dead = true; break; }
      }
      if (p.life <= 0 || p.x < bl.l - 100 || p.x > bl.r + 100 || p.y < bl.t - 200 || p.y > bl.b + 100) p.dead = true;
    }
    for (let i = st.pr.length - 1; i >= 0; i--) if (st.pr[i].dead) st.pr.splice(i, 1);
  }

  // ------------------------------------------------------------------------------------------------ KO と試合のおわり
  function checkKO(st, f) {
    if (f.s === 'dead' || f.s === 'out' || f.s === 'rez') return;
    const bl = stageOf(st).blast, C = CH[f.ch], cy = f.y - C.h / 2;
    if (f.x >= bl.l && f.x <= bl.r && cy >= bl.t && cy <= bl.b) return;
    const by = f.last >= 0 && st.f - f.lastF < 420 ? f.last : -1;
    const star = cy < bl.t && hyp(f.vx, f.vy) > 13 && by >= 0; // 上へ強く飛んだ：お星さまになる
    ev(st, { t: 'ko', i: f.i, by, mk: by >= 0 ? (f.lk || '') : '', x: clamp(f.x, bl.l, bl.r), y: clamp(cy, bl.t, bl.b), vx: f.vx, vy: f.vy, pct: f.pct, star });
    f.falls++; f.koPct = f.pct; f.koF = st.f;
    if (by >= 0) { st.fighters[by].kos++; st.sc[by]++; } st.sc[f.i]--;
    f.pct = st.training ? 0 : 0; f.last = -1; f.recent = []; f.lv = null; f.hold = 0; f.hs = 0; f.vx = 0; f.vy = 0; f.lg = -1; f.cmb = 0;
    if (f.grabbing >= 0) { const g = st.fighters[f.grabbing]; if (g && g.s === 'held') { g.s = 'free'; g.by = -1; } f.grabbing = -1; }
    if (f.by >= 0) { const g = st.fighters[f.by]; if (g && g.s === 'grab') { g.s = 'lag'; g.lag = 6; g.grabbing = -1; } f.by = -1; }
    if (st.training) { respawn(st, f); f.rez = 60; return; }
    if (st.mode === 'time' && !st.sudden) { f.s = 'dead'; f.respT = 70; return; }
    f.stk--;
    if (f.stk <= 0) { f.s = 'out'; f.stk = 0; ev(st, { t: 'out', i: f.i }); }
    else { f.s = 'dead'; f.respT = 70; }
  }
  function finish(st, win, why) {
    st.over = true; st.win = win; st.why = why;
    st.res = st.fighters.map(f => ({ i: f.i, ch: f.ch, lvl: f.lvl, stk: f.stk, pct: rd(f.pct), kos: f.kos, falls: f.falls, dealt: rd(f.dealt), taken: rd(f.taken), maxCmb: f.maxCmb, score: st.sc[f.i], used: f.used }));
    ev(st, { t: 'end', win, why });
  }
  function checkEnd(st) {
    if (st.over || st.training) return;
    const F = st.fighters;
    if (st.mode === 'time' && !st.sudden) {
      if (st.f >= st.timeMax) {
        let best = -1e9, idx = [];
        for (const f of F) { const s = st.sc[f.i]; if (s > best) { best = s; idx = [f.i]; } else if (s === best) idx.push(f.i); }
        if (idx.length === 1) { finish(st, idx[0], 'time'); return; }
        // 同点：さいごの決着（1回やられたら負け）
        st.sudden = true; for (const f of F) { if (idx.indexOf(f.i) >= 0) { f.stk = 1; f.pct = 150; if (f.s === 'dead') f.respT = 1; } else { f.stk = 0; f.s = 'out'; } }
        ev(st, { t: 'sudden' });
      }
      return;
    }
    const left = F.filter(f => f.s !== 'out');
    if (F.length > 1 && left.length <= 1) {
      if (left.length === 1) { finish(st, left[0].i, 'ko'); return; }
      let w = F[0];
      for (const f of F) if (f.koF > w.koF || (f.koF === w.koF && f.koPct < w.koPct)) w = f;
      finish(st, w.i, 'ko'); return;
    }
    if (st.f >= st.cap) {
      let w = F[0];
      for (const f of F) { const a = f.s === 'out' ? -1 : f.stk, b = w.s === 'out' ? -1 : w.stk; if (a > b || (a === b && f.pct < w.pct)) w = f; }
      st.capped = true; finish(st, w.i, 'cap');
    }
  }

  // 状態（遅くなる・動けない・吸収・構え）を毎フレーム進める。f.ks は、新しい種類のとくぎを使ったときだけできる
  function tickStatus(st) {
    for (const f of st.fighters) {
      const k = f.ks; if (!k) continue;
      if (k.slow > 0) { k.slow--; f.vx *= 0.8; if (f.gr < 0 && f.vy > 0) f.vy *= 0.97; }
      if (k.root > 0) { k.root--; f.vx = 0; if (f.gr >= 0) f.vy = 0; }
      if (k.abs > 0) k.abs--;
      if (k.stT > 0 && --k.stT === 0) k.st = 0;
      if (k.cc && f.s !== 'atk') k.cc = 0;
      if (f.s === 'dead' || f.s === 'out') { f.ks = null; }
    }
  }
  function step(st, inputs) {
    if (st.over) return st.ev;
    st.ev = []; st.f++;
    st.th = thinsNow(st);
    const F = st.fighters;
    tickStatus(st);
    for (let i = 0; i < F.length; i++) updateFighter(st, F[i], inputs && inputs[i] != null ? inputs[i] | 0 : 0);
    updateProjectiles(st);
    // 地雷
    const hits = gatherHits(st);
    applyHits(st, hits);
    for (const f of F) checkKO(st, f);
    checkEnd(st);
    return st.ev;
  }

  // ------------------------------------------------------------------------------------------------ CPU
  // 見えている情報（相手の位置・状態）だけで動く。強さ 1〜3：考えなおす間隔・ふちへの戻り・まもる確率・コンボがちがう。
  function tops(st) { const S = stageOf(st), out = []; for (const s of S.solids) out.push({ x1: s.x1, x2: s.x2, y: s.y1, s: 1 }); for (const t of st.th) out.push({ x1: t.x1, x2: t.x2, y: t.y, s: 0 }); return out; }
  // x の真下で、y より下にいちばん近い足場のてっぺん（なければ null）
  function floorBelow(st, x, y) {
    let best = null;
    for (const p of tops(st)) if (x >= p.x1 && x <= p.x2 && p.y >= y - 4 && (best == null || p.y < best)) best = p.y;
    return best;
  }
  function recoverReach(f) { const m = MOVES[f.ch].spU; return m.kind === 'tele' ? m.td * 0.9 : m.rv * m.a * 0.72; }
  function nearestLedge(st, f) {
    const S = stageOf(st), C = CH[f.ch]; let best = -1, bd = 1e9;
    for (let i = 0; i < S.ledges.length; i++) {
      const L = S.ledges[i];
      const occ = st.fighters.some(g => g !== f && g.s === 'ledge' && g.lg === i);
      const d = Math.abs(L.x - f.x) + Math.abs(L.y + C.h * 0.9 - f.y) * 0.7 + (occ ? 160 : 0);
      if (d < bd) { bd = d; best = i; }
    }
    return best;
  }
  function pickTarget(st, f) {
    let best = null, bd = 1e9;
    for (const g of st.fighters) {
      if (g === f || g.s === 'out' || g.s === 'dead') continue;
      const d = Math.abs(g.x - f.x) + Math.abs(g.y - f.y) * 1.2 + (g.s === 'rez' ? 300 : 0);
      if (d < bd) { bd = d; best = g; }
    }
    return best;
  }
  // この技を、いまの向きで出したら、相手（予想の位置）に当たるか
  function wouldHit(f, key, T, slack, lead) {
    const m = MOVES[f.ch][key]; if (!m || !m.hb || !m.hb.length || m.kind === 'proj') return false;
    const TC = CH[T.ch], fr = m.s + Math.floor(m.a * 0.5);
    const tx = T.x + T.vx * Math.min(lead, fr), ty = T.y + (T.gr >= 0 ? 0 : T.vy * Math.min(lead, fr));
    const px = f.x + f.vx * m.s * 0.5, py = f.y;
    const t = m.a > 1 ? 0.5 : 0;
    const hw = TC.w / 2;
    const arr = m.kind === 'pound' ? m.land.hb : m.hb;
    for (const h of arr) {
      const cx = px + f.face * (h[0] + (h[2] - h[0]) * t), cy = py + h[1] + (h[3] - h[1]) * t;
      const qx = clamp(cx, tx - hw, tx + hw), qy = clamp(cy, ty - TC.h, ty);
      if (hyp(cx - qx, cy - qy) <= h[4] + slack) return true;
    }
    return false;
  }
  // CPU の出力：走るときは「いっぱいまで」たおす（ダッシュ・はしり）。こうげきのじゅんびの間は、はじきにならないようにする
  function cpu(st, i) {
    let o = cpuCore(st, i);
    const ai = st.ai[i];
    if ((o & (B.L | B.R)) && !(o & (B.U | B.D)) && /^(approach|chase|guard|retreat|wait|drift|jump|dashin|whiff)?$/.test(ai.pl || '')) o |= B.F;
    if ((o & B.D) && ai.pl === 'drop') o |= B.F;
    return o;
  }
  function cpuCore(st, i) {
    const F = st.fighters, f = F[i], ai = st.ai[i];
    if (f.s === 'out' || f.s === 'dead') return 0;
    const lvl = clamp(f.lvl || 2, 1, 3), C = CH[f.ch], S = stageOf(st);
    const pulse = ai.pulse | 0; ai.pulse = 0;
    let out = 0;
    // ---- 特別な状態
    if (f.s === 'held' || f.s === 'stun') { ai.mash++; const mb = [B.A, B.J, B.L, B.R, B.S][ai.mash % 5]; return (ai.mash % (lvl === 1 ? 5 : lvl === 2 ? 3 : 2) === 0) ? mb : 0; }
    if (f.s === 'rez') return f.rez < 150 ? B.D : 0;
    if (f.s === 'getup' || f.s === 'tech' || f.s === 'taunt') return 0;
    if (f.s === 'down') { if (f.sf < 12) return 0; const r = rnd(st); return r < 0.3 ? B.A : r < 0.55 ? (f.x < 0 ? B.R : B.L) : r < 0.8 ? B.J : 0; }
    if (f.s === 'ledge') {
      if (ai.wl <= 0) ai.wl = (lvl === 3 ? 14 : lvl === 2 ? 28 : 60) + Math.floor(rnd(st) * 30);
      ai.wl--;
      if (ai.wl <= 0) { ai.wl = 0; const r = rnd(st); const L = S.ledges[f.lg]; return r < 0.28 ? B.U : r < 0.5 ? (L.dir > 0 ? B.R : B.L) : r < 0.68 ? B.A : r < 0.82 ? B.H : B.J; }
      return 0;
    }
    const T = pickTarget(st, f);
    if (!T) return 0;
    const grounded = f.gr >= 0;
    const dx = T.x - f.x, dy = T.y - f.y, adx = Math.abs(dx), ady = Math.abs(dy), toward = dx > 0 ? B.R : B.L;
    const towardF = (dx > 0 ? 1 : -1) === f.face;
    // ---- つかんでいる
    if (f.s === 'grab') {
      ai.wl++;
      if (ai.wl === 2 && lvl > 1 && rnd(st) < 0.7) return B.A;
      if (ai.wl > (lvl === 1 ? 24 : 10)) {
        ai.wl = 0;
        const c = nearestLedge(st, f); const L = S.ledges[c]; const ox = L ? L.x : 0;
        const edgeDir = ox > f.x ? 1 : -1; const fw = edgeDir === f.face;
        if (Math.abs(f.x) > 140 || lvl === 3) return fw ? (f.face > 0 ? B.R : B.L) : (f.face > 0 ? B.L : B.R);
        return rnd(st) < 0.5 ? B.U : B.D;
      }
      return 0;
    }
    // ---- 空中でとどかない：もどる
    const flying = f.gr < 0 && (f.s === 'free' || f.s === 'atk' || f.s === 'adodge' || f.s === 'jsq');
    const lb = floorBelow(st, f.x, f.y);
    const inDanger = f.gr < 0 && (lb == null || lb - f.y > 380);
    if (inDanger && flying && !(lvl === 1 && rnd(st) < 0.02)) {
      const li = nearestLedge(st, f), L = S.ledges[li], hy = L.y + C.h * 0.9, hx = L.x - L.dir * (C.w / 2 + 3);
      const ddx = hx - f.x, ddy = hy - f.y; // ddy<0：ふちが上
      let bits = ddx > 4 ? B.R : ddx < -4 ? B.L : 0;
      if (lvl === 1 && ai.sw++ % 90 < 12) bits = 0;
      if (f.help) return bits;
      const below = ddy < -6;
      const reach = recoverReach(f);
      // 1) 空中ジャンプ：ふちより下で、もう落ちはじめているか、上がり切ったとき
      if (f.jumps > 0 && below && (f.vy > 1 || ddy < -90) && (lvl > 1 || rnd(st) < 0.1) && f.s === 'free') return bits | pulse | B.J;
      // 2) 上へのとくぎ：ふちが届く範囲に入ったら
      const wantUp = below && Math.abs(ddx) < reach * 1.1 + 60 && (f.jumps === 0 || -ddy > 130 || f.vy > 4.5);
      if (wantUp && f.s === 'free' && f.bs === 0 && (lvl > 1 || rnd(st) < 0.35)) {
        const tele = MOVES[f.ch].spU.kind === 'tele'; // ワープは、ふちの真上をねらう（ななめだとステージの中へめりこむ）
        return ((tele && Math.abs(ddx) < -ddy * 0.8 ? 0 : bits) & ~B.U) | B.U | B.S;
      }
      // 3) 横にとくぎ（突進）で距離をかせぐ
      const sideM = MOVES[f.ch].spS;
      if (Math.abs(ddx) > 220 && !below && sideM.kind === 'dash' && !f.sbUsed && f.s === 'free' && lvl === 3 && ai.sw % 24 === 0) { ai.sw++; return bits | B.S | (ddx > 0 ? B.R : B.L); }
      // 4) 空中よけで着地のしかたを変える（ふちにつくまで）：ふちの高さ以下では落ちるのを少しおそくする
      if (lvl === 3 && f.vy > 6 && below && ddy > -40 && f.s === 'free' && !f.adUsed && Math.abs(ddx) < 60 && false) return bits | B.H;
      return bits;
    }
    // ---- 空中でうく：降りるまでの動き
    if (f.s === 'adodge') return 0;
    if (f.s === 'hurt') {
      // 生き残りのずらし（DI）：ステージの真ん中へ。ゆかの近くでは受け身
      if (lvl >= 2) {
        const c = f.x < 0 ? B.R : B.L, di = c | (f.y > S.spawn[1] + 400 ? B.U : 0);
        if (f.tl <= 0 && lb != null && lb - f.y < 48 && f.vy > 2.5 && rnd(st) < (lvl === 3 ? 0.9 : 0.5)) return (rnd(st) < 0.5 ? 0 : di) | B.H;
        if (f.vy > 3 && f.hs > 4 && f.jumps > 0 && f.y > S.spawn[1] + 100 && lvl === 3) return di | B.J; // めいていキャンセル
        return di;
      }
      return 0;
    }
    // ---- 考えなおす
    ai.w--;
    if (ai.w <= 0) {
      ai.w = [0, 22, 11, 5][lvl] + Math.floor(rnd(st) * 4);
      ai.tgt = T.i; plan(st, f, ai, T, lvl, C, S, grounded, dx, dy, adx, ady);
    }
    // ---- 計画の実行
    ai.pt--;
    let bits = ai.hold;
    if (ai.pt <= 0) { ai.hold = 0; ai.pl = ''; }
    // 自分から落ちない
    if (grounded && (bits & (B.L | B.R)) && lvl >= 2) {
      const ax = (bits & B.R) ? 1 : -1, fb = floorBelow(st, f.x + ax * 34, f.y - 2);
      const want = ai.pl === 'drop' || ai.pl === 'chase';
      if (fb == null || (fb - f.y > 300 && !want)) bits &= ~(B.L | B.R);
    }
    // 近づく・攻撃の本体は plan が ai.hold と ai.pulse にセットする
    out = bits | pulse | (ai.pulse2 | 0); ai.pulse2 = 0;
    // 見張り：同じところでうろうろしていたら動く
    ai.stuck++; if (Math.abs(f.x - ai.lx) > 20 || Math.abs(f.y - ai.ly) > 20) { ai.stuck = 0; ai.lx = f.x; ai.ly = f.y; }
    if (ai.stuck > 180 && grounded && f.s === 'free') { ai.stuck = 0; ai.hold = dx > 0 ? B.R : B.L; ai.pt = 40; out |= B.J; }
    return out;
  }
  function plan(st, f, ai, T, lvl, C, S, grounded, dx, dy, adx, ady) {
    const toward = dx > 0 ? B.R : B.L, away = dx > 0 ? B.L : B.R;
    const faceT = (dx > 0 ? 1 : -1);
    const fm = MOVES[f.ch];
    const Tm = T.s === 'atk' ? MOVES[T.ch][T.mv] : null;
    const targetOff = floorBelow(st, T.x, T.y) == null || (T.y > f.y + 260 && T.gr < 0);
    const myFloor = floorBelow(st, f.x, f.y);
    ai.hold = 0; ai.pt = 8; ai.pl = 'wait';
    const r = rnd(st);
    const lead = lvl === 3 ? 10 : lvl === 2 ? 4 : 0, slack = lvl === 3 ? 6 : lvl === 2 ? 10 : 18;
    // ---- まもる：相手の技が出ていて、近くて、こちらを向いている
    if (lvl >= 2 && Tm && adx < 120 + (Tm.hb && Tm.hb[0] ? Math.abs(Tm.hb[0][2]) : 0) && ady < 90 && f.s !== 'shield' && T.mf < Tm.s + Tm.a + 2 && Tm.kind !== 'proj') {
      const pBlock = lvl === 3 ? 0.65 : 0.3;
      if (grounded && r < pBlock && f.shd > 25) { ai.hold = B.H; ai.pt = 18 + Math.floor(rnd(st) * 8); ai.pl = 'shield'; ai.shieldT = st.f; return; }
      if (!grounded && lvl === 3 && r < 0.2 && !f.adUsed) { ai.hold = B.H | (dx > 0 ? B.L : B.R); ai.pt = 4; ai.pl = 'adodge'; return; }
    }
    if (lvl >= 2 && fm.spD.kind === 'reflect' && f.s === 'free' && st.pr.some(q => q.o !== f.i && q.k !== 'mine' && Math.abs(q.x - f.x) < 150 && Math.abs(q.y - (f.y - C.h / 2)) < 60 && (q.vx > 0) === (q.x < f.x))) { ai.hold = B.D; ai.pulse = B.S; ai.pt = 8; ai.pl = 'reflect'; return; }
    if (f.s === 'shield') {
      // まもりをやめるとき：相手が終わったらつかむ
      const tEnd = T.s !== 'atk' || (Tm && T.mf >= Tm.t - 6);
      if (tEnd && adx < 80 && lvl >= 2) { ai.pulse = B.G; ai.pt = 2; return; }
      if (tEnd || st.f - (ai.shieldT || 0) > 40) { ai.hold = 0; ai.pt = 2; return; }
      ai.hold = B.H; ai.pt = 10; return;
    }
    // ---- 自分が上空：空中攻撃・着地
    if (!grounded) {
      const faceTo = faceT;
      if (f.face !== faceTo && f.s === 'free') { /* 向きは空中の入力で変わる：次の押しで変える */ }
      const air = ['nair', 'fair', 'bair', 'uair', 'dair'];
      if (f.s === 'free' && !f.help) {
        let pick = null;
        for (const k of air) {
          const need = k === 'bair' ? -f.face : k === 'fair' ? f.face : 0;
          if (wouldHit(f, k, T, slack, lead)) { if (pick == null || fm[k].dmg * (0.6 + rnd(st) * 0.8) > fm[pick].dmg * 0.9) pick = k; }
        }
        if (pick && (lvl > 1 || r < 0.5)) {
          const hb = { nair: 0, fair: f.face > 0 ? B.R : B.L, bair: f.face > 0 ? B.L : B.R, uair: B.U, dair: B.D }[pick];
          ai.hold = hb; ai.pulse = B.A; ai.pt = 8; ai.pl = 'air-' + pick; return;
        }
        // とくぎ（飛び道具）：上空から
        if (adx > 160 && adx < 420 && ady < 120 && fm.spN.kind === 'proj' && r < 0.25 + 0.1 * lvl && T.gr >= 0) { ai.hold = faceT > 0 ? B.R : B.L; ai.pulse = B.S; ai.pt = 6; ai.pl = 'proj'; return; }
        if (fm.spD.kind === 'pound' && adx < 40 && dy > 60 && dy < 260 && lvl > 1) { ai.hold = B.D; ai.pulse = B.S; ai.pt = 6; ai.pl = 'pound'; return; }
      }
      // 近づく
      ai.hold = toward; ai.pt = 6; ai.pl = 'drift';
      if (f.jumps > 0 && dy < -90 && f.vy > -1 && lvl > 1 && f.s === 'free') { ai.pulse = B.J; }
      if (dy > 120 && (myFloor != null) && f.s === 'free') ai.hold = toward | B.D;
      return;
    }
    // ---- 以降は、地面にいるとき
    // 相手がステージの外：ふち見張り
    if (targetOff && lvl >= 2) {
      const li = nearestLedge(st, T), L = S.ledges[li];
      const ex = L.x + L.dir * (lvl === 3 ? 34 : 70);
      const ddx = ex - f.x;
      // 当たる技があれば出す
      for (const k of ['spS', 'fsmash', 'ftilt', 'fair', 'jab', 'utilt']) if (wouldHit(f, k, T, slack + 8, lead + 6)) { ai.hold = faceT > 0 ? B.R : B.L; if (k === 'fsmash') ai.pulse = B.M; else if (k === 'spS') ai.pulse = B.S; else ai.pulse = B.A; ai.pt = 10; ai.pl = 'guard'; return; }
      if (Math.abs(ddx) > 16) { ai.hold = ddx > 0 ? B.R : B.L; ai.pt = 8; ai.pl = 'guard'; return; }
      // 縁まで来た：外にとんで追う（強いCPUだけ）
      if (lvl === 3 && f.jumps > 0 && Math.abs(T.x - f.x) < 200 && T.y > f.y - 40 && T.y < f.y + 220 && r < 0.4 && f.pct < 90) { ai.hold = toward; ai.pulse = B.J; ai.pt = 12; ai.pl = 'chase'; return; }
      ai.hold = 0; ai.pt = 6; ai.pl = 'guard'; return;
    }
    // つかみ：まもっている相手
    if (T.s === 'shield' && adx < 60 && ady < 40 && lvl >= 2 && r < 0.8) { ai.hold = faceT > 0 ? B.R : B.L; ai.pulse = B.G; ai.pt = 8; ai.pl = 'grab'; return; }
    // 新しい種類のとくぎ：kits の kind が ai() を持っていれば、CPU はそれを聞いてみる
    for (const k of ['spN', 'spS', 'spU', 'spD']) {
      const m = fm[k], KH = KINDS[m.kind];
      if (KH && KH.ai) { const w = KH.ai(st, f, m, T, { lvl, dx, dy, adx, ady, faceT, grounded, r, key: k }); if (w) { ai.hold = w.hold | 0; ai.pulse = B.S; ai.pt = w.pt || 8; ai.pl = 'kind-' + m.kind; return; } }
    }
    // 近い：地上の技
    const ground = ['jab', 'ftilt', 'utilt', 'dtilt', 'dsmash'];
    let hitK = null;
    if (f.face !== faceT && adx > 14) { /* 向きは歩くと変わる */ }
    const saveFace = f.face; f.face = faceT;
    const cand = [];
    for (const k of ground) if (wouldHit(f, k, T, slack, lead)) cand.push(k);
    const smashK = ['fsmash', 'usmash', 'dsmash'].filter(k => wouldHit(f, k, T, slack - 2, lead + 8));
    for (const k of ['spN', 'spS', 'spD']) { const m = fm[k]; if ((m.kind === 'melee' || m.kind === 'dash' || m.kind === 'cmdgrab' || m.kind === 'spin' || (KINDS[m.kind] && KINDS[m.kind].melee)) && wouldHit(f, k, T, slack, lead + 4)) cand.push(k); }
    if (fm.spD.kind === 'counter' && lvl === 3 && Tm && adx < 130 && T.mf < Tm.s + 2) cand.push('spD');
    f.face = saveFace;
    if (cand.length || smashK.length) {
      const wantSmash = smashK.length && (T.pct > 60 || r < 0.25) && T.s !== 'shield' && lvl >= 2 && (T.s === 'hurt' ? false : true);
      if (wantSmash && r < 0.55) {
        const k = smashK[Math.floor(rnd(st) * smashK.length)];
        const dirb = k === 'usmash' ? B.U : k === 'dsmash' ? B.D : (faceT > 0 ? B.R : B.L);
        ai.pl = 'smash'; const kind = lvl === 3 ? rnd(st) : 0.2;
        if (kind < 0.3) { ai.hold = dirb | B.F; ai.pulse = B.A; ai.pt = 8; } // はじきスマッシュ（ためなし）
        else if (kind < 0.6) { const cb = k === 'usmash' ? B.CU : k === 'dsmash' ? B.CD : (faceT > 0 ? B.CR : B.CL); ai.hold = cb; ai.pt = 8 + Math.floor(rnd(st) * (lvl === 3 ? 22 : 8)); } // Cスティックでため
        else { ai.hold = dirb | B.M; ai.pt = 8 + Math.floor(rnd(st) * (lvl === 3 ? 22 : 8)); return; }
        return;
      }
      if (cand.length) {
        // 強い技ほど選ばれやすい（同じ技のくりかえしは避ける）
        let tot = 0; const w = cand.map(k => { let sc = fm[k].dmg / (1 + fm[k].t / 40); let n = 0; for (const q of f.recent) if (q === k) n++; sc *= Math.max(0.3, 1 - n * 0.2); tot += sc; return sc; });
        let pick = rnd(st) * tot, idx = 0; while (idx < cand.length - 1 && pick > w[idx]) { pick -= w[idx]; idx++; }
        const k = cand[idx];
        const dir = k === 'utilt' ? B.U : k === 'dtilt' ? B.D : k === 'ftilt' ? (faceT > 0 ? B.R : B.L) : 0;
        const isSp = k.slice(0, 2) === 'sp';
        const sdir = k === 'spS' ? (faceT > 0 ? B.R : B.L) : k === 'spD' ? B.D : 0;
        ai.hold = isSp ? sdir : (k === 'dsmash' ? B.D : dir); ai.pulse = isSp ? B.S : (k === 'dsmash' ? B.M : B.A); ai.pt = 7; ai.pl = 'atk-' + k;
        if (k === 'jab' && lvl >= 2) { ai.hold |= B.A; ai.pt = 15 + Math.floor(rnd(st) * 12); } // れんぞくジャブ
        if (lvl === 1 && r < 0.4) { ai.hold = 0; ai.pulse = 0; ai.pl = 'whiff'; }
        return;
      }
    }
    // 遠い：飛び道具・近づく・まつ
    if (adx > 150 && adx < 460 && ady < 80 && r < 0.2 + 0.13 * lvl) {
      const faceTo = faceT > 0 ? B.R : B.L;
      if (fm.spD.kind === 'mine' && fm.spD.proj.kind === 'snare' && lvl > 1 && r < 0.3 && st.pr.filter(q => q.o === f.i && q.k === 'snare').length < 3) { ai.hold = B.D; ai.pulse = B.S; ai.pt = 8; ai.pl = 'mine'; return; }
      for (const k of ['spN', 'spS']) { const m = fm[k]; if (m.kind === 'proj') { ai.hold = (k === 'spS' ? faceTo : 0) | faceTo; ai.pulse = B.S; ai.pt = 8; ai.pl = 'proj'; return; } }
      if (fm.spD.kind === 'mine' && lvl > 1 && r < 0.5) { ai.hold = B.D; ai.pulse = B.S; ai.pt = 8; ai.pl = 'mine'; return; }
      if (fm.spD.kind === 'buff' && f.buff <= 0 && lvl > 1) { ai.hold = B.D; ai.pulse = B.S; ai.pt = 8; ai.pl = 'buff'; return; }
      if (fm.spS.kind === 'dash' && adx < 260 && lvl > 1 && f.sbUsed === false && r < 0.5) { ai.hold = faceTo; ai.pulse = B.S; ai.pt = 8; ai.pl = 'dashin'; return; }
    }
    // まもり返し：近づきすぎない（弱いほどつっこむ）
    if (lvl >= 2 && f.pct > 130 && T.pct < 60 && adx < 100 && r < 0.4) { ai.hold = away; ai.pt = 14; ai.pl = 'retreat'; return; }
    // 上にいる相手：ジャンプ。下にいる相手：板から降りる
    if (dy < -70 && adx < 200 + 30 * lvl) { ai.hold = toward; ai.pulse = B.J; ai.pt = 10; ai.pl = 'jump'; if (rnd(st) < 0.4) ai.pulse2 = 0; return; }
    if (dy > 70 && f.gr >= 100 && adx < 260) { ai.hold = toward; ai.pulse = B.D; ai.pt = 8; ai.pl = 'drop'; return; }
    if (lvl >= 2 && adx > 50 && adx < 110 && ady < 50 && f.mm >= 1 && f.mm <= 2 && r < 0.35 && T.s !== 'shield') { ai.hold = toward; ai.pulse = B.A; ai.pt = 6; ai.pl = 'atk-dattack'; return; } // ダッシュこうげき
    if (adx > 36) {
      ai.hold = toward; ai.pt = 8 + Math.floor(rnd(st) * 8); ai.pl = 'approach';
      if (lvl === 1 && r < 0.35) ai.hold = 0;
      if (adx > 320 && r < 0.3) ai.pulse = B.J;
      return;
    }
    ai.hold = r < 0.5 ? away : 0; ai.pt = 6; ai.pl = 'wait';
  }
  // 練習用のダミー
  function dummy(st, i) {
    const f = st.fighters[i]; const mode = st.dummy || 'stand';
    if (f.s === 'out' || f.s === 'dead') return 0;
    if (mode === 'shield') return (f.shd > 8 || f.s === 'shield') && f.shd > 4 ? B.H : 0;
    if (mode === 'jump') return (st.f % 70 === 0) ? B.J : 0;
    if (mode === 'cpu') return cpu(st, i);
    // stand：でも、ふちからもどる
    const lb = floorBelow(st, f.x, f.y);
    if (f.gr < 0 && lb == null && (f.s === 'free')) return cpu(st, i);
    return 0;
  }

  // ------------------------------------------------------------------------------------------------ ユーティリティ
  const copy = st => JSON.parse(JSON.stringify(st));
  // ---- オンライン対戦（ロールバック）のための道具
  // clone：状態の深いコピー（スナップショットと復元はこれ。JSON より速く、-0 や undefined もそのまま残す）。
  // 状態は「数・文字・真偽・null・配列・ふつうの {}」だけでできている。step は st と入力のほかは何も読まない（Date・Math.random なし）。
  function clone(v) {
    if (v === null || typeof v !== 'object') return v;
    if (Array.isArray(v)) { const n = v.length, o = new Array(n); for (let i = 0; i < n; i++) { const x = v[i]; o[i] = x !== null && typeof x === 'object' ? clone(x) : x; } return o; }
    const o = {}; for (const k in v) { const x = v[k]; o[k] = x !== null && typeof x === 'object' ? clone(x) : x; } return o;
  }
  // hash：状態の指紋（32ビット×2）。ずれ（desync）の検出用。キーを並べ替えて、数は IEEE のビットのまま混ぜる（-0 は 0、NaN は1つにそろえる）。
  // 出来事 ev（そのフレームだけの飾り用）は入れない。端末やブラウザがちがっても、同じ状態なら同じ値。
  const HV = new DataView(new ArrayBuffer(8));
  function hash(st) {
    let a = 0x811C9DC5 | 0, b = 0x9E3779B9 | 0;
    const mix = x => { a = Math.imul(a ^ x, 16777619); b = Math.imul((b ^ x) + 0x7F4A7C15 | 0, 0x01000193) ^ (b >>> 15); };
    const walk = v => {
      if (v === null) { mix(4); return; }
      switch (typeof v) {
        case 'number': {
          if (v !== v) { mix(8); mix(0x7ff80000); return; }
          HV.setFloat64(0, v === 0 ? 0 : v, true); mix(1); mix(HV.getUint32(0, true)); mix(HV.getUint32(4, true)); return;
        }
        case 'string': mix(2); mix(v.length); for (let i = 0; i < v.length; i++) mix(v.charCodeAt(i)); return;
        case 'boolean': mix(v ? 3 : 9); return;
        case 'undefined': mix(5); return;
        case 'object': {
          if (Array.isArray(v)) { mix(6); mix(v.length); for (let i = 0; i < v.length; i++) walk(v[i]); return; }
          const ks = Object.keys(v).sort(); mix(7); mix(ks.length);
          for (const k of ks) { walk(k); walk(v[k]); }
          return;
        }
      }
    };
    const ks = Object.keys(st).sort(); mix(ks.length);
    for (const k of ks) { if (k === 'ev') continue; walk(k); walk(st[k]); }
    return [a >>> 0, b >>> 0];
  }
  const hashStr = st => { const h = hash(st); return h[0].toString(16).padStart(8, '0') + h[1].toString(16).padStart(8, '0'); };
  // NETV：決まった結果が変わる直しをしたら上げる。ちがう版どうしではオンライン対戦をしない（ずれてしまうので）
  const NETV = 2;
  // 種つきの入力（テスト用）：ランダムに押す
  function randInput(st, i) {
    const r = rnd(st); let b = 0;
    if (r < 0.3) b |= B.L; else if (r < 0.6) b |= B.R;
    if (rnd(st) < 0.1) b |= B.U; if (rnd(st) < 0.1) b |= B.D;
    if (rnd(st) < 0.08) b |= B.J; if (rnd(st) < 0.1) b |= B.A; if (rnd(st) < 0.06) b |= B.S; if (rnd(st) < 0.03) b |= B.H; if (rnd(st) < 0.02) b |= B.G; if (rnd(st) < 0.02) b |= B.M;
    if (rnd(st) < 0.25) b |= B.F; if (rnd(st) < 0.015) b |= (B.CL << Math.floor(rnd(st) * 4)); if (rnd(st) < 0.004) b |= B.T;
    return b;
  }
  const api = {
    DT, B, CMASK, FLICK_N, FLICK_HOLD, CH, CHAR_IDS, K, defineChar, defineKind, defineProj, KINDS, PROJ, sigOf, dist, STAGES, STAGE_IDS, MOVES, NORMALS, EXTRAS, GRAB, THROWS, create, step, cpu, dummy, randInput, copy, clone, hash, hashStr, NETV, thinAt, activeBoxes, boxesOf, hurtDist, rnd, hash32, rd, clamp, sinT, V, floorBelow, nearestLedge, recoverReach, supportAt,
    sameJSON: (a, b) => JSON.stringify(a) === JSON.stringify(b),
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api; else root.BrawlEngine = api;
})(typeof window !== 'undefined' ? window : globalThis);
