// まなびの工房：自動でつくる問題と、特別コース（古文・理科ラボ・社会ラボ）の問題づくり（純粋なロジック。ブラウザでも node でも動く）
// ---------------------------------------------------------------------------------
// ・数値の問題は種つき乱数でつくり、答えは必ず「コードの計算」から出す（AI の答えは使わない）。tests が全問をもう一度計算し直して確かめる。
// ・本から取った事実（古文の活用表・年表・都道府県庁所在地など）は manabi/content/*.json に「AI作成・未レビュー」として置いてある。
//   コードで確かめられるもの（仮名遣いの変換・年表の並び・活用表の形・地図の名前）は tests が確かめる。
// ・問題の形（engine.js の check が見る）：
//     mp  組み合わせ  { pairs:[[左,右]…], rs:[右の候補], ru:1（右を何度も使える）}   入力＝[[左,右]…]
//     wb  ことばのタイル  { w:[{id,t}…], a:[id…], x:[[id…]…] }                     入力＝[id…]（タイルの文字の並びで比べる）
//     tt  タップで選ぶ  { tk:[文字…], a:[位置…] }                                   入力＝[位置…]
//     hs  図のタップ  { svg, a:領域のid, rg:{ id:名前 } }                            入力＝領域の id
//     ft  表をうめる  { hd:[…], rows:[{ n, cells:[{ v:[正しい答え…]|null }…] }] }     入力＝{ "行-列": 文字 }
//     ls  聞いて選ぶ（mc の形）  { sp:読み上げる文, lang }
// ---------------------------------------------------------------------------------
(function (root) {
  'use strict';
  const En = (root.ManabiEngine) || (typeof require === 'function' ? require('./engine.js') : null);
  const rng = En.rng, seedOf = En.seedOf;
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const shuffle = (a, r) => En.shuffle(a, r);
  const sample = (a, n, r) => shuffle(a, r).slice(0, n);
  const ri = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const num = x => String(Math.round(x * 1e9) / 1e9);

  // ================================================================ 特別コース（路線図に出るもの）
  // sub: 色・アイコンのキー。need: 読み込む content のファイル。n: 1レッスンの問題数
  const UNITS = [
    { id: 'K1', course: 'kobun', ti: '歴史的仮名遣い', goal: '歴史的仮名遣いを現代仮名遣いに直せる', sec: '古文のきほん', need: 'kobun' },
    { id: 'K2', course: 'kobun', ti: '古語と現代語', goal: '重要な古語の意味をつかむ', sec: '古文のきほん', need: 'kobun' },
    { id: 'K3', course: 'kobun', ti: '活用の表', goal: '動詞・助動詞の活用をうめる', sec: '古文の文法', need: 'kobun' },
    { id: 'K4', course: 'kobun', ti: '助動詞の意味', goal: '助動詞の意味と接続を結ぶ', sec: '古文の文法', need: 'kobun' },
    { id: 'K5', course: 'kobun', ti: '係り結び', goal: '係助詞に合う結びの形を選ぶ', sec: '古文の文法', need: 'kobun' },
    { id: 'K6', course: 'kobun', ti: '敬語', goal: '尊敬・謙譲・丁寧を見分ける', sec: '古文の文法', need: 'kobun' },
    { id: 'K7', course: 'kobun', ti: '現代語訳タイル', goal: '古文を現代語に組み立てる', sec: '古文を読む', need: 'kobun' },
    { id: 'K8', course: 'kobun', ti: '品詞分解', goal: '文の中の品詞をタップで見つける', sec: '古文を読む', need: 'kobun' },
    { id: 'K9', course: 'kobun', ti: '和歌の修辞法', goal: '枕詞・掛詞を見つける', sec: '古文を読む', need: 'kobun' },
    { id: 'K10', course: 'kobun', ti: '漢文の返り点', goal: '訓読の順にならべる', sec: '漢文', need: 'kobun' },
    { id: 'S1', course: 'science', ti: '公式ドリル（計算）', goal: '密度・速さ・オームの法則などを計算する', sec: '計算ラボ', need: null },
    { id: 'S2', course: 'science', ti: '単位の換算', goal: '単位をすばやく変える', sec: '計算ラボ', need: null },
    { id: 'S3', course: 'science', ti: '運動と化学の計算', goal: '濃度・物質量・等加速度運動', sec: '計算ラボ', need: null },
    { id: 'S4', course: 'science', ti: '図のラベル', goal: '図の部分をタップして名前を答える', sec: '観察ラボ', need: null },
    { id: 'S5', course: 'science', ti: 'グラフの読み取り', goal: 'グラフから値を読み取る', sec: '観察ラボ', need: null },
    { id: 'S6', course: 'science', ti: '元素記号', goal: '元素記号と名前を結ぶ', sec: '知識ラボ', need: 'science' },
    { id: 'S7', course: 'science', ti: '実験の手順・分類', goal: '手順をならべ、なかま分けをする', sec: '知識ラボ', need: 'science' },
    { id: 'C1', course: 'social', ti: '年表ならべ', goal: 'できごとを古い順にならべる', sec: '歴史ラボ', need: 'social' },
    { id: 'C2', course: 'social', ti: '原因と結果・人物', goal: 'できごとのつながりを結ぶ', sec: '歴史ラボ', need: 'social' },
    { id: 'C3', course: 'social', ti: '公民のことば', goal: '公民の用語と意味を結ぶ', sec: '公民ラボ', need: 'social' },
    { id: 'C4', course: 'social', ti: '日本地図：県をさがす', goal: '県の場所と名前を覚える', sec: '地理ラボ', need: 'social', maps: 'jp' },
    { id: 'C5', course: 'social', ti: '日本地図：県庁所在地と地方', goal: '県庁所在地と地方区分', sec: '地理ラボ', need: 'social', maps: 'jp' },
    { id: 'C6', course: 'social', ti: '世界地図：国をさがす', goal: '主な国の場所と名前', sec: '地理ラボ', need: 'social', maps: 'world' },
    { id: 'C7', course: 'social', ti: '資料の読み取り', goal: '表やグラフから読み取る', sec: '地理ラボ', need: null },
  ];
  const COURSES = [{ id: 'kobun', ja: '古文・漢文', en: 'Classics', sub: 'kobun' }, { id: 'science', ja: '理科ラボ', en: 'Science lab', sub: 'science' }, { id: 'social', ja: '社会ラボ', en: 'Social lab', sub: 'social' }];

  // ================================================================ 歴史的仮名遣い → 現代仮名遣い（コードで変換して答えを確かめる）
  const HA = { は: 'わ', ひ: 'い', ふ: 'う', へ: 'え', ほ: 'お' };
  const A2O = { あ: 'お', か: 'こ', が: 'ご', さ: 'そ', ざ: 'ぞ', た: 'と', だ: 'ど', な: 'の', は: 'ほ', ば: 'ぼ', ま: 'も', や: 'よ', ら: 'ろ', わ: 'お' };
  const E2Y = { え: 'よ', け: 'きょ', げ: 'ぎょ', せ: 'しょ', ぜ: 'じょ', て: 'ちょ', で: 'じょ', ね: 'にょ', へ: 'ひょ', べ: 'びょ', め: 'みょ', れ: 'りょ' };
  // kind: h＝ハ行→ワ行（語中・語尾）／w＝ゐゑを／d＝ぢづ／l＝長音（ア段＋う・ふ、エ段＋う・ふ）
  function toModern(w, kind) {
    let s = w;
    if (kind === 'l') {
      s = s.replace(/([あかがさざただなはばまやらわ])[うふ]/g, (m, c) => A2O[c] + 'う').replace(/([えけげせぜてでねへべめれ])[うふ]/g, (m, c) => E2Y[c] + 'う');
    }
    s = [...s].map((c, i) => (i > 0 && HA[c] ? HA[c] : c)).join('');
    return s.replace(/ゐ/g, 'い').replace(/ゑ/g, 'え').replace(/を/g, 'お').replace(/ぢ/g, 'じ').replace(/づ/g, 'ず');
  }

  // ================================================================ 小さな図（自作の SVG。領域に data-r を付ける）
  const svgWrap = (w, h, body) => '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" role="img">' + body + '</svg>';
  const R = (id, inner) => '<g class="rg" data-r="' + id + '" tabindex="0" role="button">' + inner + '</g>';
  function diagramCell() {
    const parts = {
      wall: R('wall', '<rect x="10" y="10" width="300" height="200" rx="26" fill="#9bd87a" stroke="#3e8a2a" stroke-width="8"/>'),
      membrane: R('membrane', '<rect x="22" y="22" width="276" height="176" rx="20" fill="#f7efc8" stroke="#e08a2a" stroke-width="4"/>'),
      nucleus: R('nucleus', '<circle cx="110" cy="105" r="30" fill="#8e6bd8" stroke="#4d2f9c" stroke-width="4"/><circle cx="108" cy="102" r="9" fill="#d5c4ff"/>'),
      vacuole: R('vacuole', '<ellipse cx="225" cy="105" rx="45" ry="58" fill="#8fd4f2" stroke="#2b86b3" stroke-width="4"/>'),
      chloro: R('chloro', '<ellipse cx="85" cy="165" rx="20" ry="12" fill="#2f9e44" stroke="#1b6b2c" stroke-width="3"/><ellipse cx="150" cy="55" rx="20" ry="12" fill="#2f9e44" stroke="#1b6b2c" stroke-width="3"/>'),
    };
    return { svg: svgWrap(320, 220, parts.wall + parts.membrane + parts.nucleus + parts.vacuole + parts.chloro), rg: { wall: '細胞壁', membrane: '細胞膜', nucleus: '核', vacuole: '液胞', chloro: '葉緑体' }, ti: '植物の細胞' };
  }
  function diagramMoon() {
    // 太陽は右。月は地球のまわりを反時計回り（上から見て）。新月＝右、上弦＝上、満月＝左、下弦＝下
    const cx = 160, cy = 120, rr = 80, pos = { new: [0, '新月'], first: [90, '上弦の月'], full: [180, '満月'], last: [270, '下弦の月'] };
    let b = '<circle cx="' + cx + '" cy="' + cy + '" r="' + rr + '" fill="none" stroke="#9aa7b4" stroke-width="2" stroke-dasharray="5 5"/>';
    b += '<circle cx="300" cy="120" r="16" fill="#ffb627"/><text x="280" y="160" font-size="13" fill="#7a5a00">太陽</text>';
    for (let y = 70; y <= 170; y += 25) b += '<path d="M268 ' + y + 'h-24" stroke="#ffb627" stroke-width="3" stroke-linecap="round"/>';
    b += '<circle cx="' + cx + '" cy="' + cy + '" r="20" fill="#4aa3df"/><text x="' + (cx - 10) + '" y="' + (cy + 4) + '" font-size="11" fill="#fff">地球</text>';
    const rg = {};
    for (const [id, [deg, name]] of Object.entries(pos)) {
      const a = deg * Math.PI / 180, x = cx + rr * Math.cos(a), y = cy - rr * Math.sin(a);
      b += R(id, '<circle cx="' + x.toFixed(1) + '" cy="' + y.toFixed(1) + '" r="15" fill="#e9e4d4" stroke="#6b6552" stroke-width="3"/>'); rg[id] = name;
    }
    return { svg: svgWrap(330, 240, b), rg, ti: '月の位置と満ち欠け' };
  }
  function diagramCircuit() {
    const parts = [
      R('battery', '<path d="M40 100v-20h-14M40 100v20h-14" stroke="#333" stroke-width="3"/><rect x="20" y="92" width="40" height="16" rx="3" fill="#ffd166" stroke="#333" stroke-width="3"/>'),
      R('switch', '<path d="M100 40h20" stroke="#333" stroke-width="3"/><path d="M120 40l35-16" stroke="#333" stroke-width="5" stroke-linecap="round"/><circle cx="160" cy="40" r="5" fill="#333"/>'),
      R('bulb', '<circle cx="280" cy="100" r="22" fill="#fff3a8" stroke="#333" stroke-width="3"/><path d="M270 108l10-16 10 16" stroke="#e08a2a" stroke-width="3" fill="none"/>'),
      R('ammeter', '<circle cx="220" cy="40" r="18" fill="#fff" stroke="#333" stroke-width="3"/><text x="214" y="46" font-size="16" fill="#333">A</text>'),
      R('voltmeter', '<circle cx="280" cy="170" r="18" fill="#fff" stroke="#333" stroke-width="3"/><text x="274" y="176" font-size="16" fill="#333">V</text>'),
      R('resistor', '<rect x="120" y="150" width="60" height="22" rx="3" fill="#f4b183" stroke="#333" stroke-width="3"/>'),
    ];
    const wires = '<path d="M40 80V40h60M165 40h37M238 40h42v36M280 122v30M280 188v14H40V120M40 80M180 161h82M60 161h60" stroke="#333" stroke-width="3" fill="none"/>';
    return { svg: svgWrap(330, 220, wires + parts.join('')), rg: { battery: '電池', switch: 'スイッチ', bulb: '豆電球', ammeter: '電流計', voltmeter: '電圧計', resistor: '抵抗' }, ti: '電気回路' };
  }
  function diagramPlate() {
    const parts = [
      R('ocean', '<path d="M10 100h120l30 30 20 40H10z" fill="#5aa9e6" stroke="#245c8a" stroke-width="3"/>'),
      R('cont', '<path d="M180 100h140v70H180z" fill="#c9a66b" stroke="#6b4e1e" stroke-width="3"/>'),
      R('trench', '<path d="M130 100l30 30 20 40" stroke="#16324a" stroke-width="9" fill="none" stroke-linecap="round"/>'),
      R('volcano', '<path d="M230 100l24-34 24 34z" fill="#b5523b" stroke="#6b2a1a" stroke-width="3"/>'),
      R('magma', '<ellipse cx="254" cy="140" rx="26" ry="14" fill="#ff7a3d" stroke="#a83a0a" stroke-width="3"/>'),
    ];
    return { svg: svgWrap(330, 190, parts.join('')), rg: { ocean: '海洋プレート', cont: '大陸プレート', trench: '海溝', volcano: '火山', magma: 'マグマだまり' }, ti: 'プレートの境界' };
  }
  const DIAGRAMS = { cell: diagramCell, moon: diagramMoon, circuit: diagramCircuit, plate: diagramPlate };
  function diagramQ(kind, r) {
    const d = DIAGRAMS[kind](), ids = Object.keys(d.rg), t = pick(r, ids);
    return { t: 'hs', q: '「' + d.rg[t] + '」をタップしよう。（' + d.ti + '）', svg: d.svg, a: t, rg: d.rg, e: '正解は「' + d.rg[t] + '」の部分です。', df: 2 };
  }
  function moonQ(r) {
    const d = diagramMoon(), t = pick(r, ['new', 'first', 'full', 'last']);
    return { t: 'hs', q: '地球から見て「' + d.rg[t] + '」になるのは、月がどの位置にあるときか、タップしよう。（太陽は右）', svg: d.svg, a: t, rg: d.rg, e: '太陽の光が当たる側と地球から見える側の重なりで満ち欠けが決まります。', df: 3 };
  }

  // ================================================================ 数値ドリル（答えはコードの計算）
  function mkNu(q, a, un, e, df, tol) { return { t: 'nu', q, a: num(a), un: un || '', e, df: df || 2 }; }
  const DRILLS = {
    density(r) { const rho = pick(r, [0.8, 1.0, 2.7, 7.9, 8.9, 11.3]), v = pick(r, [10, 20, 25, 40, 50, 100]); const m = rho * v;
      return r() < 0.5 ? mkNu('体積 ' + v + ' cm³ の物質の質量は ' + num(m) + ' g です。密度は何 g/cm³ ですか。', rho, 'g/cm³', '密度＝質量÷体積＝' + num(m) + '÷' + v + '＝' + num(rho) + ' g/cm³', 2)
        : mkNu('密度 ' + num(rho) + ' g/cm³ の物質 ' + v + ' cm³ の質量は何 g ですか。', m, 'g', '質量＝密度×体積＝' + num(rho) + '×' + v + '＝' + num(m) + ' g', 2); },
    speed(r) { const v = pick(r, [2, 4, 5, 8, 12, 15, 20, 25]), t = pick(r, [3, 4, 5, 6, 10, 12]); const s = v * t;
      return r() < 0.5 ? mkNu(s + ' m を ' + t + ' 秒で進みました。速さは何 m/s ですか。', v, 'm/s', '速さ＝距離÷時間＝' + s + '÷' + t + '＝' + v + ' m/s', 2)
        : mkNu('秒速 ' + v + ' m で ' + t + ' 秒間進むと、何 m 進みますか。', s, 'm', '距離＝速さ×時間＝' + v + '×' + t + '＝' + s + ' m', 2); },
    ohm(r) { const I = pick(r, [0.1, 0.2, 0.25, 0.5, 1, 1.5, 2]), Rr = pick(r, [4, 5, 10, 20, 30, 40]); const V = I * Rr; const k = ri(r, 0, 2);
      if (k === 0) return mkNu('抵抗が ' + Rr + ' Ω の導線に ' + num(I) + ' A の電流が流れました。電圧は何 V ですか。', V, 'V', '電圧＝抵抗×電流＝' + Rr + '×' + num(I) + '＝' + num(V) + ' V', 2);
      if (k === 1) return mkNu(num(V) + ' V の電圧を加えると ' + num(I) + ' A の電流が流れる抵抗は何 Ω ですか。', Rr, 'Ω', '抵抗＝電圧÷電流＝' + num(V) + '÷' + num(I) + '＝' + Rr + ' Ω', 3);
      return mkNu(Rr + ' Ω の抵抗に ' + num(V) + ' V を加えたとき、流れる電流は何 A ですか。', I, 'A', '電流＝電圧÷抵抗＝' + num(V) + '÷' + Rr + '＝' + num(I) + ' A', 3); },
    pressure(r) { const F = pick(r, [20, 50, 60, 100, 120, 200]), S = pick(r, [0.5, 1, 2, 4, 5]); return mkNu(F + ' N の力が面積 ' + S + ' m² に垂直にはたらくとき、圧力は何 Pa ですか。', F / S, 'Pa', '圧力＝力÷面積＝' + F + '÷' + S + '＝' + num(F / S) + ' Pa', 2); },
    work(r) { const F = pick(r, [5, 10, 20, 50, 100]), s = pick(r, [2, 3, 4, 5, 10]); return mkNu(F + ' N の力で物体を力の向きに ' + s + ' m 動かしたときの仕事は何 J ですか。', F * s, 'J', '仕事＝力×距離＝' + F + '×' + s + '＝' + F * s + ' J', 2); },
    conc(r) { const T = pick(r, [50, 100, 200, 250, 400, 500]), p = pick(r, [5, 10, 20, 25, 40]); const s = T * p / 100, w = T - s;
      return r() < 0.5 ? mkNu('食塩 ' + num(s) + ' g を水 ' + num(w) + ' g にとかしました。質量パーセント濃度は何％ですか。', p, '％', '濃度＝溶質÷溶液×100＝' + num(s) + '÷' + T + '×100＝' + p + '％', 3)
        : mkNu('質量パーセント濃度 ' + p + '％の食塩水 ' + T + ' g にふくまれる食塩は何 g ですか。', s, 'g', '溶質＝溶液×濃度＝' + T + '×' + p + '/100＝' + num(s) + ' g', 3); },
    mol(r) { const sub = pick(r, [['水 H₂O', 18], ['二酸化炭素 CO₂', 44], ['酸素 O₂', 32], ['アンモニア NH₃', 17], ['メタン CH₄', 16]]), n = pick(r, [0.5, 1, 2, 3, 4]); const m = sub[1] * n;
      return r() < 0.5 ? mkNu(sub[0] + '（モル質量 ' + sub[1] + ' g/mol）' + num(m) + ' g は何 mol ですか。', n, 'mol', '物質量＝質量÷モル質量＝' + num(m) + '÷' + sub[1] + '＝' + num(n) + ' mol', 3)
        : mkNu(sub[0] + '（モル質量 ' + sub[1] + ' g/mol）' + num(n) + ' mol の質量は何 g ですか。', m, 'g', '質量＝物質量×モル質量＝' + num(n) + '×' + sub[1] + '＝' + num(m) + ' g', 3); },
    kin(r) { const v0 = pick(r, [0, 2, 4, 5, 10]), a = pick(r, [1, 2, 3, 4]), t = pick(r, [2, 3, 4, 5]);
      return r() < 0.5 ? mkNu('初速度 ' + v0 + ' m/s、加速度 ' + a + ' m/s² の等加速度直線運動で、' + t + ' 秒後の速さは何 m/s ですか。', v0 + a * t, 'm/s', 'v＝v₀＋at＝' + v0 + '＋' + a + '×' + t + '＝' + (v0 + a * t) + ' m/s', 4)
        : mkNu('初速度 ' + v0 + ' m/s、加速度 ' + a + ' m/s² の等加速度直線運動で、' + t + ' 秒間に進む距離は何 m ですか。', v0 * t + a * t * t / 2, 'm', 'x＝v₀t＋½at²＝' + v0 + '×' + t + '＋½×' + a + '×' + t + '²＝' + num(v0 * t + a * t * t / 2) + ' m', 4); },
  };
  const CONV = [ // [からの単位, への単位, 係数（から×係数＝へ）]
    ['m', 'cm', 100], ['km', 'm', 1000], ['cm', 'mm', 10], ['kg', 'g', 1000], ['g', 'mg', 1000], ['L', 'mL', 1000], ['mL', 'cm³', 1], ['h', '分', 60], ['分', '秒', 60], ['A', 'mA', 1000], ['V', 'mV', 1000], ['m²', 'cm²', 10000], ['t', 'kg', 1000],
  ];
  function convQ(r) {
    const c = pick(r, CONV), vals = c[2] >= 100 ? [0.5, 2, 3, 5, 1.5, 25] : [2, 3, 4, 5, 0.5, 12], x = pick(r, vals), back = r() < 0.4;
    const from = back ? c[1] : c[0], to = back ? c[0] : c[1], v = back ? x * c[2] : x, a = back ? x : x * c[2];
    return mkNu(num(v) + ' ' + from + ' は何 ' + to + ' ですか。', a, to, '1 ' + c[0] + '＝' + c[2] + ' ' + c[1] + ' なので、' + num(v) + ' ' + from + '＝' + num(a) + ' ' + to + '。', 2);
  }
  function kmhQ(r) { const v = pick(r, [18, 36, 54, 72, 90, 108]); return r() < 0.5 ? mkNu(v + ' km/h は何 m/s ですか。', v / 3.6, 'm/s', v + ' km/h ÷ 3.6＝' + num(v / 3.6) + ' m/s', 3) : mkNu(num(v / 3.6) + ' m/s は何 km/h ですか。', v, 'km/h', num(v / 3.6) + '×3.6＝' + v + ' km/h', 3); }

  // ================================================================ 資料（グラフを自分で描いて、読み取りを聞く）
  const palette = ['#ef476f', '#ffd166', '#06d6a0', '#118ab2', '#9b5de5', '#f78c6b'];
  function barChart(labels, vals, unit) {
    const W = 320, H = 200, max = Math.max(...vals), top = Math.ceil(max / 10) * 10, bw = 36, gap = (W - 50 - bw * vals.length) / (vals.length + 1);
    let b = '<path d="M40 10V160H312" stroke="#555" stroke-width="2" fill="none"/>';
    for (let k = 0; k <= 4; k++) { const y = 160 - 150 * k / 4; b += '<path d="M40 ' + y + 'H312" stroke="#ddd"/><text x="4" y="' + (y + 4) + '" font-size="11" fill="#333">' + (top * k / 4) + '</text>'; }
    vals.forEach((v, i) => { const x = 40 + gap + i * (bw + gap), h = 150 * v / top; b += '<rect x="' + x.toFixed(1) + '" y="' + (160 - h).toFixed(1) + '" width="' + bw + '" height="' + h.toFixed(1) + '" rx="4" fill="' + palette[i % 6] + '"/><text x="' + (x + 4).toFixed(1) + '" y="180" font-size="12" fill="#333">' + labels[i] + '</text>'; });
    return svgWrap(W, H + 10, b + '<text x="44" y="10" font-size="11" fill="#333">' + unit + '</text>');
  }
  function lineChart(xs, ys, xl, yl) {
    const W = 320, H = 200, mx = Math.max(...xs), my = Math.ceil(Math.max(...ys) / 10) * 10;
    let b = '<path d="M40 10V160H312" stroke="#555" stroke-width="2" fill="none"/>';
    for (let k = 0; k <= 4; k++) { const y = 160 - 150 * k / 4; b += '<path d="M40 ' + y + 'H312" stroke="#ddd"/><text x="4" y="' + (y + 4) + '" font-size="11" fill="#333">' + (my * k / 4) + '</text>'; }
    const pts = xs.map((x, i) => [40 + 270 * x / mx, 160 - 150 * ys[i] / my]);
    b += '<polyline points="' + pts.map(p => p.map(n => n.toFixed(1)).join(',')).join(' ') + '" fill="none" stroke="#118ab2" stroke-width="4"/>';
    pts.forEach((p, i) => { b += '<circle cx="' + p[0].toFixed(1) + '" cy="' + p[1].toFixed(1) + '" r="5" fill="#ef476f"/><text x="' + (p[0] - 6).toFixed(1) + '" y="178" font-size="11" fill="#333">' + xs[i] + '</text>'; });
    return svgWrap(W, H + 10, b + '<text x="250" y="195" font-size="11" fill="#333">' + xl + '</text><text x="44" y="10" font-size="11" fill="#333">' + yl + '</text>');
  }
  function chartQ(r, kind) {
    if (kind === 'line') {
      const sp = pick(r, [10, 20, 30, 40]), xs = [0, 1, 2, 3, 4, 5], ys = xs.map(x => sp * x), x = ri(r, 2, 5);
      return { t: 'nu', q: '物体の運動を表したグラフです。' + x + ' 秒後の位置は何 m ですか。', a: String(sp * x), un: 'm', e: 'グラフは原点を通る直線で、1 秒あたり ' + sp + ' m 進みます。' + x + '×' + sp + '＝' + sp * x + ' m。', f: { s: lineChart(xs, ys, '時間(秒)', '位置(m)'), a: '時間と位置のグラフ' }, df: 2 };
    }
    const labs = sample(['A', 'B', 'C', 'D', 'E'], 4, r), vals = labs.map(() => ri(r, 2, 9) * 10), k = ri(r, 0, 2), mx = Math.max(...vals), mn = Math.min(...vals);
    if (new Set(vals).size < vals.length) return chartQ(r, kind);
    const f = { s: barChart(labs, vals, '(万人)'), a: '各地域の人口の棒グラフ（架空）' };
    if (k === 0) return { t: 'mc', q: '架空の4地域の人口の棒グラフです。人口がいちばん多いのはどこですか。', c: labs.map(l => [l, l + ' 地域']), a: labs[vals.indexOf(mx)], e: '棒がいちばん高い ' + labs[vals.indexOf(mx)] + ' が最多（' + mx + ' 万人）。', f, df: 2 };
    if (k === 1) return { t: 'nu', q: '架空の4地域の人口の棒グラフです。いちばん多い地域は、いちばん少ない地域より何万人多いですか。', a: String(mx - mn), un: '万人', e: mx + '−' + mn + '＝' + (mx - mn) + ' 万人。', f, df: 3 };
    const i = ri(r, 0, 3); return { t: 'nu', q: '架空の4地域の人口の棒グラフです。' + labs[i] + ' 地域の人口は何万人ですか。', a: String(vals[i]), un: '万人', e: '棒の高さを目盛りから読むと ' + vals[i] + ' 万人。', f, df: 2 };
  }

  // ================================================================ 問題のつくり（単元ごと）
  const mcFrom = (q, correct, others, r, e, df) => { const ch = shuffle([correct].concat(others), r); const labs = ['ア', 'イ', 'ウ', 'エ', 'オ'].slice(0, ch.length); return { t: 'mc', q, c: ch.map((x, i) => [labs[i], x]), a: labs[ch.indexOf(correct)], e: e || '', df: df || 2 }; };
  function mpQ(title, pairs, r, n, reuse, e) {
    const ps = sample(pairs, n, r), rs = reuse ? [...new Set(ps.map(p => p[1]))] : shuffle(ps.map(p => p[1]), r);
    return { t: 'mp', q: title, pairs: ps, rs: shuffle(rs, r), ru: reuse ? 1 : 0, e: e || ps.map(p => p[0] + '＝' + p[1]).join(' ／ '), df: 2 };
  }
  function ftQ(C, r) {
    const useAux = r() < 0.55, row = useAux ? pick(r, C.aux) : pick(r, C.verbs), HD = ['未然形', '連用形', '終止形', '連体形', '已然形', '命令形'];
    const cells = row.forms.map((f, i) => { const alts = useAux ? f : [f]; return alts ? { v: alts.slice() } : null; });
    const live = cells.map((c, i) => (c ? i : -1)).filter(i => i >= 0), ask = new Set(sample(live, Math.min(3, live.length), r));
    return { t: 'ft', q: (useAux ? '助動詞「' + row.name + '」' : '動詞の活用「' + row.name + '」') + 'の活用形のうち、空らんにあてはまる語尾（ひらがな）を入れよう。', hd: HD, row: { n: row.name, pre: useAux ? '' : row.stem },
      cells: cells.map((c, i) => (c ? { v: c.v, ask: ask.has(i) } : null)), e: HD.map((h, i) => h + '：' + (cells[i] ? cells[i].v.join('／') : '―')).join('　'), df: 3 };
  }
  function kakariQ(C, r) {
    const it = pick(r, C.kakari), p = pick(r, ['ぞ', 'なむ', 'や', 'か', 'こそ']), conc = p === 'こそ' ? 4 : 3, f = it.forms;
    const correct = f[conc], pool = [...new Set([f[2], f[3], f[4], f[0], f[1]].filter(x => x !== correct))];
    const r2 = mcFrom('「' + it.n + p + it.stem + '（　）。」の（　）に入る語尾はどれ？', correct, sample(pool, 3, r), r, '係助詞「' + p + '」の結びは' + (p === 'こそ' ? '已然形' : '連体形') + '。「' + it.stem + correct + '」。', 3);
    return r2;
  }

  function make(unitId, seed, content, n) {
    const r = rng(seedOf(seed + '|' + unitId)); n = n || 8;
    const K = content.kobun, Sc = content.science, So = content.social, out = [];
    const add = q => { q.i = 'g:' + unitId + ':' + seedOf(seed + '|' + out.length).toString(36); q.gen = unitId; out.push(q); };
    for (let k = 0; k < n; k++) {
      switch (unitId) {
        case 'K1': { const w = pick(r, K.kana), ans = toModern(w[0], w[2]); const bad = sample(K.kana.filter(x => x[1] !== w[1]).map(x => x[1]), 3, r);
          add(mcFrom('「' + w[0] + '」（' + w[3] + '）を現代仮名遣いに直すと？', ans, bad, r, '「' + w[0] + '」→「' + ans + '」。', 2)); break; }
        case 'K2': { if (k % 3 === 0) add(mpQ('古語と現代語を結ぼう', K.words, r, k === 0 ? 5 : 4, false)); else { const w = pick(r, K.words); add(mcFrom('古語「' + w[0] + '」の意味は？', w[1], sample(K.words.filter(x => x[1] !== w[1]).map(x => x[1]), 3, r), r, '「' + w[0] + '」＝' + w[1], 2)); } break; }
        case 'K3': add(ftQ(K, r)); break;
        case 'K4': k % 2 === 0 ? add(mpQ('助動詞と意味を結ぼう', K.aux.map(a => [a.name, a.meaning]).filter((x, i, arr) => arr.findIndex(y => y[1] === x[1]) === i || true), r, 4, false)) : (() => { const a = pick(r, K.aux); add(mcFrom('助動詞「' + a.name + '」が接続する活用形は？', a.conn, ['未然形', '連用形', '終止形', '連体形', '已然形'].filter(x => x !== a.conn).slice(0, 3), r, '「' + a.name + '」は' + a.conn + 'に接続する。', 3)); })(); break;
        case 'K5': add(kakariQ(K, r)); break;
        case 'K6': k % 2 === 0 ? add(mpQ('敬語の種類を結ぼう', K.keigo, r, 6, true)) : (() => { const t = pick(r, [['尊敬語', '動作をする人'], ['謙譲語', '動作を受ける人'], ['丁寧語', '読み手・聞き手']]); add(mcFrom(t[0] + 'は、だれに対する敬意を表すか？', t[1], ['動作をする人', '動作を受ける人', '読み手・聞き手', '作者'].filter(x => x !== t[1]).slice(0, 3), r, t[0] + 'は' + t[1] + 'への敬意。', 3)); })(); break;
        case 'K7': { const t = pick(r, K.tr), tiles = t.tiles.concat(sample(t.dis, 2, r)); const w = shuffle(tiles.map((x, i) => ({ id: 't' + i, t: x })), r); const idOf = x => w.find(y => y.t === x).id;
          add({ t: 'wb', q: '「' + t.src + '」（' + t.from + '）を現代語にしよう。', w, a: t.tiles.map(idOf), x: [], e: t.tiles.join(''), df: 3 }); break; }
        case 'K8': { const s = pick(r, K.pos), kinds = { n: '名詞', v: '動詞', p: '助詞', a: '助動詞', j: '形容詞', d: '副詞' }; const have = [...new Set(s.tk.map(x => x[1]))]; const kind = pick(r, have);
          add({ t: 'tt', q: '「' + s.text + '」（' + s.from + '）から、' + kinds[kind] + 'をすべてタップしよう。', tk: s.tk.map(x => x[0]), a: s.tk.map((x, i) => (x[1] === kind ? i : -1)).filter(i => i >= 0), e: s.tk.map(x => x[0] + '（' + kinds[x[1]] + '）').join(' / '), df: 3 }); break; }
        case 'K9': { const w = pick(r, K.waka); add({ t: 'tt', q: w.poet + 'の歌の「' + w.kind + '」をすべてタップしよう。', tk: w.tokens, a: w.idx, e: w.e, df: 3 }); break; }
        case 'K10': { const w = pick(r, K.kanbun), tiles = w.tiles.map((t, i) => ({ id: 'k' + i, t })); add({ t: 'wb', q: '白文「' + w.tiles.join('') + '」（' + w.from + '）を、訓読で読む順にならべよう。', w: shuffle(tiles, r), a: w.order.map(i => 'k' + i), x: [], e: '訓読：' + w.yomi, df: 3, spLang: 'ja' }); break; }
        case 'S1': add(DRILLS[pick(r, ['density', 'speed', 'ohm', 'pressure', 'work'])](r)); break;
        case 'S2': add(r() < 0.75 ? convQ(r) : kmhQ(r)); break;
        case 'S3': add(DRILLS[pick(r, ['conc', 'mol', 'kin'])](r)); break;
        case 'S4': add(r() < 0.25 ? moonQ(r) : diagramQ(pick(r, ['cell', 'circuit', 'plate', 'cell']), r)); break;
        case 'S5': add(chartQ(r, r() < 0.4 ? 'line' : 'bar')); break;
        case 'S6': { const e = pick(r, Sc.elements); k % 3 === 0 ? add(mpQ('元素記号と名前を結ぼう', Sc.elements, r, 5, false)) : (r() < 0.5 ? add(mcFrom('元素記号「' + e[0] + '」は？', e[1], sample(Sc.elements.filter(x => x[1] !== e[1]).map(x => x[1]), 3, r), r, e[0] + '＝' + e[1], 2)) : add(mcFrom(e[1] + 'の元素記号は？', e[0], sample(Sc.elements.filter(x => x[0] !== e[0]).map(x => x[0]), 3, r), r, e[1] + '＝' + e[0], 2))); break; }
        case 'S7': { if (k % 3 === 2) { const g = pick(r, Sc.groups); add(mpQ(g.t + '：なかま分けをしよう', g.items, r, 6, true)); } else { const p = pick(r, Sc.procedures), w = shuffle(p.steps.map((s, i) => ({ id: 'p' + i, t: s })), r); add({ t: 'or', q: p.t + '：手順を正しい順にならべよう。', c: w.map((x, i) => [String(i + 1), x.t]), a: p.steps.map(s => String(w.findIndex(x => x.t === s) + 1)), e: p.steps.map((s, i) => (i + 1) + '. ' + s).join(' → '), df: 3 }); } break; }
        case 'C1': { const ev = sample(So.timeline, 5, r); const sorted = ev.slice().sort((a, b) => a[0] - b[0]); if (new Set(ev.map(x => x[0])).size < 5) { k--; break; } const c = ev.map((x, i) => [String(i + 1), x[1]]);
          add({ t: 'or', q: '古い順にならべよう。', c, a: sorted.map(s => String(ev.findIndex(x => x === s) + 1)), e: sorted.map(s => s[0] + '年　' + s[1]).join(' → '), df: 3 }); break; }
        case 'C2': add(mpQ(k % 2 ? '人物とできごとを結ぼう' : 'できごとと結果を結ぼう', k % 2 ? So.people : So.cause, r, 5, false)); break;
        case 'C3': add(mpQ('用語と意味を結ぼう', So.civics, r, 5, false)); break;
        case 'C4': { const m = content.mapJp, id = pick(r, Object.keys(So.prefs)), nm = m.prefs.find(p => p.id === id).ja;
          if (k % 2 === 0) add({ t: 'hs', q: '「' + nm + '」をタップしよう。', svg: mapSvg(m.prefs, m.w, m.h, null, false, m.inset), a: id, rg: nameMap(m.prefs), map: 1, e: nm + 'の位置です。', df: 3 });
          else { const q = mcFrom('色のついた県の名前は？', nm, sample(m.prefs.filter(p => p.id !== id).map(p => p.ja), 3, r), r, nm + 'です。', 3); q.svg = mapSvg(m.prefs, m.w, m.h, id, false, m.inset); q.map = 1; add(q); } break; }
        case 'C5': { const id = pick(r, Object.keys(So.prefs)), nm = content.mapJp.prefs.find(p => p.id === id).ja, cap = So.prefs[id][0], reg = So.regions[So.prefs[id][1]];
          if (k % 2 === 0) add(mcFrom(nm + 'の県庁所在地は？', cap, sample(Object.values(So.prefs).map(x => x[0]).filter(x => x !== cap), 3, r), r, nm + 'の県庁所在地は' + cap + '。', 2));
          else add(mcFrom(nm + 'は何地方？', reg, Object.values(So.regions).filter(x => x !== reg).slice(0, 3), r, nm + 'は' + reg + '。', 2)); break; }
        case 'C6': { const m = content.mapWorld, ids = m.countries.filter(c => So.worldNames[c.id]).map(c => c.id), id = pick(r, ids), nm = So.worldNames[id];
          if (k % 2 === 0) add({ t: 'hs', q: '「' + nm + '」をタップしよう。', svg: mapSvg(m.countries, m.w, m.h, null, true), a: id, rg: Object.fromEntries(m.countries.map(c => [c.id, So.worldNames[c.id] || c.ja])), map: 1, e: nm + 'の位置です。', df: 3 });
          else { const q = mcFrom('色のついた国の名前は？', nm, sample(ids.filter(x => x !== id).map(x => So.worldNames[x]), 3, r), r, nm + 'です。', 3); q.svg = mapSvg(m.countries, m.w, m.h, id, true); q.map = 1; add(q); } break; }
        case 'C7': add(chartQ(r, 'bar')); break;
        default: throw new Error('unknown unit ' + unitId);
      }
    }
    return out;
  }
  function mapSvg(items, w, h, hi, world, inset) {
    const hit = p => (inset && p.id === '47' ? '<rect x="' + inset.x + '" y="' + inset.y + '" width="' + inset.w + '" height="' + inset.h + '" fill="rgba(0,0,0,0.001)" stroke="none"/><path d="' + p.d + '" fill="none" stroke="transparent" stroke-width="16" pointer-events="stroke"/>' : '');
    const paths = items.map(p => R(p.id, hit(p) + '<path d="' + p.d + '" fill="' + (hi === p.id ? '#ff6b6b' : world ? '#9ad39a' : '#9ad39a') + '" stroke="#2f6b3a" stroke-width="' + (world ? 0.8 : 1) + '"/>')).join('');
    return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ' + w + ' ' + h + '" role="img">' + (world ? '<rect width="' + w + '" height="' + h + '" fill="#cdeaff"/>' : '') + (inset ? '<rect x="' + inset.x + '" y="' + inset.y + '" width="' + inset.w + '" height="' + inset.h + '" fill="none" stroke="#7a8a99" stroke-width="1.5" stroke-dasharray="5 4"/>' : '') + paths + '</svg>';
  }
  const nameMap = items => Object.fromEntries(items.map(p => [p.id, p.ja]));

  // ================================================================ 既存の問題を、別の形に自動で直す（変換できるものだけ。答えは元の問題から）
  const EN_SENT = /^[A-Za-z][A-Za-z' ,.?!-]*[.?!]$/;
  function words(s) { return s.trim().split(/\s+/); }
  const norm = s => s.toLowerCase().replace(/[.?!,]/g, '');
  // → { kind:'wb'|'ls'|'fb', q } か null
  function variantOf(q, pool, salt) {
    if (q.t !== 'sa' || q.d || /\$|\\/.test(q.a) || !EN_SENT.test(q.a.trim())) return null;
    const ws = words(q.a);
    if (ws.length < 4 || ws.length > 14 || /[ぁ-んァ-ヶ一-龥]/.test(q.a)) return null;
    const r = rng(seedOf(q.i + '|' + salt)), kinds = ['wb', 'ls', 'fb'], kind = kinds[Math.floor(r() * 3)];
    const others = pool.filter(p => p.t === 'sa' && p.i !== q.i && EN_SENT.test(p.a.trim()) && !/[ぁ-んァ-ヶ一-龥]/.test(p.a)).map(p => p.a.trim());
    if (kind === 'wb') {
      const extra = sample([...new Set(others.flatMap(words).map(w => w.replace(/[.?!,]/g, '')).filter(w => w && !ws.map(norm).includes(w.toLowerCase())))], 2, r);
      const tiles = ws.map((t, i) => ({ id: 'w' + i, t })).concat(extra.map((t, i) => ({ id: 'd' + i, t })));
      const alts = (q.x || []).filter(x => EN_SENT.test(x.trim())).map(x => words(x));
      return { t: 'wb', q: q.q.split('\n')[0] + '\n（英語の語をタップしてならべよう）', w: shuffle(tiles, r), a: ws.map((_, i) => 'w' + i), alt: alts.map(a => a.map(norm)), norm: 1, e: q.e || q.a, df: q.df, i: q.i, orig: q.i };
    }
    if (kind === 'ls' && others.length >= 3) {
      const ch = shuffle([q.a.trim()].concat(sample(others, 3, r)), r), labs = ['ア', 'イ', 'ウ', 'エ'];
      return { t: 'mc', q: '音声を聞いて、聞こえた英文を選ぼう。', c: ch.map((x, i) => [labs[i], x]), a: labs[ch.indexOf(q.a.trim())], sp: q.a.trim(), lang: 'en', e: q.a, df: q.df, i: q.i, orig: q.i };
    }
    // fb：1語を空らんにして選ぶ
    const cand = ws.map((w, i) => i).filter(i => /^[A-Za-z']{3,}[.?!,]?$/.test(ws[i])), ix = cand.length ? cand[Math.floor(r() * cand.length)] : -1;
    if (ix < 0) return null;
    const ans = ws[ix].replace(/[.?!,]/g, ''), pool2 = [...new Set(others.flatMap(words).map(w => w.replace(/[.?!,]/g, '')).filter(w => w.length >= 3 && w.toLowerCase() !== ans.toLowerCase() && /^[A-Za-z']+$/.test(w)))];
    if (pool2.length < 3) return null;
    const ch = shuffle([ans].concat(sample(pool2, 3, r)), r), labs = ['ア', 'イ', 'ウ', 'エ'], sent = ws.map((w, i) => (i === ix ? '[[blank:　]]' + (/[.?!,]$/.test(w) ? w.slice(-1) : '') : w)).join(' ');
    return { t: 'mc', q: '空らんに入る語を選ぼう。\n' + sent, c: ch.map((x, i) => [labs[i], x]), a: labs[ch.indexOf(ans)], e: q.a, df: q.df, i: q.i, orig: q.i };
  }

  const api = { UNITS, COURSES, make, toModern, variantOf, DRILLS, DIAGRAMS, diagramQ, chartQ, convQ, kmhQ, mapSvg, norm };
  root.ManabiGen = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
