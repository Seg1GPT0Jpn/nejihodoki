// まなびの工房：数学ラボ・英語ラボ（種つき乱数でつくる問題。答えは必ずコードで計算する。tests が別のやり方でもう一度計算して確かめる）
// 数学：正負の数・分数・文字式・方程式・連立・展開・因数分解・二次方程式・平方根・場合の数・確率・数列・図形・微分積分
// 英語：不規則動詞・単語・複数形・比較・be動詞・並べかえ・聞き取り（単語や文は content/english.json の自作リスト）
// 形：gen.js と同じ。meta は検算用（画面には出ない）。
(function (root) {
  'use strict';
  const E = root.ManabiEngine || require('./engine.js'), G = root.ManabiGen || require('./gen.js');
  const rng = E.rng, seedOf = E.seedOf, shuffle = E.shuffle;
  const pick = (r, a) => a[Math.floor(r() * a.length)];
  const ri = (r, lo, hi) => lo + Math.floor(r() * (hi - lo + 1));
  const sample = (a, n, r) => shuffle(a, r).slice(0, n);
  const gcd = (a, b) => (b ? gcd(b, a % b) : Math.abs(a));
  const frac = (n, d) => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d) || 1; n /= g; d /= g; return d === 1 ? String(n) : n + '/' + d; };
  const tex = (n, d) => { if (d < 0) { n = -n; d = -d; } const g = gcd(n, d) || 1; n /= g; d /= g; return d === 1 ? String(n) : (n < 0 ? '-' : '') + '\\dfrac{' + Math.abs(n) + '}{' + d + '}'; };
  const sg = n => (n < 0 ? '(' + n + ')' : String(n));
  const fact = n => (n <= 1 ? 1 : n * fact(n - 1));
  const nPr = (n, r) => { let x = 1; for (let i = 0; i < r; i++) x *= n - i; return x; };
  const nCr = (n, r) => nPr(n, r) / fact(r);
  const NU = (q, a, o) => Object.assign({ t: 'nu', q, a: String(a), un: '', e: '', df: 2 }, o || {});
  const MC = (q, correct, others, r, e, df, meta) => { const ch = shuffle([correct].concat(others), r), labs = ['ア', 'イ', 'ウ', 'エ', 'オ']; return { t: 'mc', q, c: ch.map((x, i) => [labs[i], x]), a: labs[ch.indexOf(correct)], e: e || '', df: df || 3, meta }; };
  const poly = (a, b, c) => { // a x^2 + b x + c を TeX で
    let s = ''; const term = (k, v) => (k === 'x^2' ? (v === 1 ? 'x^2' : v === -1 ? '-x^2' : v + 'x^2') : k === 'x' ? (v === 1 ? 'x' : v === -1 ? '-x' : v + 'x') : String(v));
    const parts = [[a, 'x^2'], [b, 'x'], [c, '']].filter(p => p[0] !== 0);
    parts.forEach((p, i) => { const t = term(p[1], p[0]); s += i === 0 ? t : (t[0] === '-' ? t : '+' + t); });
    return s || '0';
  };

  // ---------------------------------------------------------------- 数学
  const M = {
    M1(r) { // 正負の数の四則
      const a = ri(r, -9, 9), b = ri(r, -9, 9), c = ri(r, -6, 6), o1 = pick(r, ['+', '-', '\\times']), o2 = pick(r, ['+', '-', '\\times']);
      const f = (x, o, y) => (o === '+' ? x + y : o === '-' ? x - y : x * y);
      const v = o2 === '\\times' && o1 !== '\\times' ? f(a, o1, f(b, o2, c)) : f(f(a, o1, b), o2, c);
      return NU('次の計算をしなさい。 $' + sg(a) + o1 + sg(b) + o2 + sg(c) + '$', v, { e: '×を先に計算し、あとは左から計算する。答えは ' + v + '。', df: 2, meta: { k: 'expr', tex: sg(a) + o1 + sg(b) + o2 + sg(c) } });
    },
    M2(r) { // 分数の計算
      const d1 = pick(r, [2, 3, 4, 5, 6]), d2 = pick(r, [2, 3, 4, 6, 8]), n1 = ri(r, 1, d1 * 2 - 1), n2 = ri(r, 1, d2 * 2 - 1), op = pick(r, ['+', '-', '\\times']);
      let n, d; if (op === '+') { n = n1 * d2 + n2 * d1; d = d1 * d2; } else if (op === '-') { n = n1 * d2 - n2 * d1; d = d1 * d2; } else { n = n1 * n2; d = d1 * d2; }
      return NU('次の計算をしなさい。（答えは約分した分数で、例：3/4）$\\dfrac{' + n1 + '}{' + d1 + '}' + op + '\\dfrac{' + n2 + '}{' + d2 + '}$', frac(n, d), { e: '通分（かけ算は分子どうし・分母どうし）して約分すると ' + frac(n, d) + '。', df: 3, meta: { k: 'expr', tex: '\\dfrac{' + n1 + '}{' + d1 + '}' + op + '\\dfrac{' + n2 + '}{' + d2 + '}' } });
    },
    M3(r) { // 式の値
      const a = ri(r, 2, 6), b = ri(r, -9, 9), x = ri(r, -4, 5), c = ri(r, 1, 4), v = a * x * x + b * x + c;
      return NU('$x=' + x + '$ のとき、$' + poly(a, b, c) + '$ の値を求めなさい。', v, { e: '代入すると ' + a + '×' + sg(x) + '²＋' + sg(b) + '×' + sg(x) + '＋' + c + '＝' + v + '。', df: 2, meta: { k: 'subst', a, b, c, x } });
    },
    M4(r) { // 一次方程式
      const x = ri(r, -9, 9), c = ri(r, -3, 4), a = ri(r, 2, 7) + (c > 0 ? c : 0), cc = c, b = ri(r, -9, 9); // a x + b = c x + d
      const d = a * x + b - cc * x;
      return NU('方程式 $' + poly(0, a, b) + '=' + poly(0, cc, d) + '$ を解きなさい。（$x$ の値）', x, { e: '移項して整理すると ' + (a - cc) + 'x＝' + (d - b) + '、x＝' + x + '。', df: 2, meta: { k: 'lin', a, b, c: cc, d, x } });
    },
    M5(r) { // 連立方程式
      let x, y, a, b, c, d; do { x = ri(r, -5, 6); y = ri(r, -5, 6); a = ri(r, 1, 4); b = ri(r, -4, 4); c = ri(r, 1, 4); d = ri(r, -4, 4); } while (a * d - b * c === 0 || b === 0 || d === 0);
      const p = a * x + b * y, q = c * x + d * y, ask = r() < 0.5 ? 'x' : 'y', t = (m, n) => (m === 1 ? 'x' : m === -1 ? '-x' : m + 'x') + (n < 0 ? (n === -1 ? '-' : n) + 'y' : '+' + (n === 1 ? '' : n) + 'y');
      return NU('連立方程式 $' + t(a, b) + '=' + p + '$、$' + t(c, d) + '=' + q + '$ を解いたとき、$' + ask + '$ の値を答えなさい。', ask === 'x' ? x : y, { e: 'x＝' + x + '、y＝' + y + '。', df: 3, meta: { k: 'sys', a, b, c, d, p, q, ask, ans: ask === 'x' ? x : y } });
    },
    M6(r) { // 展開（選択式）
      const a = ri(r, -6, 6) || 2, b = ri(r, -6, 6) || -3, ok = poly(1, a + b, a * b);
      const w = [poly(1, a + b, -a * b), poly(1, a * b, a + b), poly(1, a - b, a * b), poly(1, -(a + b), a * b)].filter(z => z !== ok);
      return MC('$(x' + (a < 0 ? a : '+' + a) + ')(x' + (b < 0 ? b : '+' + b) + ')$ を展開すると？', '$' + ok + '$', [...new Set(w)].slice(0, 3).map(z => '$' + z + '$'), r, '（x＋a）（x＋b）＝x²＋（a＋b）x＋ab を使う。', 3, { k: 'expand', a, b });
    },
    M7(r) { // 因数分解（選択式）
      const a = ri(r, -7, 7) || 3, b = ri(r, -7, 7) || -2, expr = poly(1, a + b, a * b), fm = (u, v) => '(x' + (u < 0 ? u : '+' + u) + ')(x' + (v < 0 ? v : '+' + v) + ')';
      const ok = fm(a, b), wr = [fm(-a, -b), fm(a, -b), fm(-a, b), fm(a + 1, b - 1)].filter(z => z !== ok && z !== fm(b, a));
      return MC('$' + expr + '$ を因数分解すると？', '$' + ok + '$', [...new Set(wr)].slice(0, 3).map(z => '$' + z + '$'), r, 'たして ' + (a + b) + '、かけて ' + a * b + ' になる2数は ' + a + ' と ' + b + '。', 3, { k: 'factor', a, b });
    },
    M8(r) { // 二次方程式
      const p = ri(r, -6, 6), q = ri(r, -6, 6); if (p === q) return M.M8(r);
      const lo = Math.min(p, q), hi = Math.max(p, q), big = r() < 0.5;
      return NU('二次方程式 $' + poly(1, -(p + q), p * q) + '=0$ の解のうち、' + (big ? '大きい' : '小さい') + '方の値を答えなさい。', big ? hi : lo, { e: '因数分解すると (x' + (-p < 0 ? -p : '+' + -p) + ')(x' + (-q < 0 ? -q : '+' + -q) + ')＝0。解は x＝' + p + '、' + q + '。', df: 3, meta: { k: 'quad', b: -(p + q), c: p * q, big, ans: big ? hi : lo } });
    },
    M9(r) { // 平方根
      const s = pick(r, [2, 3, 5, 6, 7]), k = ri(r, 2, 6), n = k * k * s;
      return NU('$\\sqrt{' + n + '}$ を $a\\sqrt{b}$ の形にしなさい。（例：$2\\sqrt{3}$ は 2√3 と入力）', k + '√' + s, { e: n + '＝' + k * k + '×' + s + ' より √' + n + '＝' + k + '√' + s + '。', df: 3, meta: { k: 'root', n, a: k, b: s } });
    },
    M10(r) { // 場合の数
      const kind = pick(r, ['P', 'C', 'dice', 'circ']);
      if (kind === 'P') { const n = ri(r, 4, 8), k = ri(r, 2, 3); return NU(n + ' 人から ' + k + ' 人を選んで1列にならべる方法は何通りか。', nPr(n, k), { e: n + 'P' + k + '＝' + nPr(n, k) + '通り。', df: 3, meta: { k: 'P', n, r: k } }); }
      if (kind === 'C') { const n = ri(r, 5, 9), k = ri(r, 2, 4); return NU(n + ' 人から ' + k + ' 人の代表を選ぶ方法は何通りか。', nCr(n, k), { e: n + 'C' + k + '＝' + nCr(n, k) + '通り。', df: 3, meta: { k: 'C', n, r: k } }); }
      if (kind === 'dice') { const s = ri(r, 3, 11); let c = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b === s) c++; return NU('大小2つのさいころを投げて、目の和が ' + s + ' になる場合は何通りか。', c, { e: '表をつくって数えると ' + c + ' 通り。', df: 2, meta: { k: 'dice', s } }); }
      const n = ri(r, 4, 7); return NU(n + ' 人が円形のテーブルにすわる。すわり方は何通りか。（回転して同じになるものは同じとみなす）', fact(n - 1), { e: '円順列は (n−1)!＝' + fact(n - 1) + '。', df: 4, meta: { k: 'circ', n } });
    },
    M11(r) { // 確率
      const kind = pick(r, ['dice', 'cards', 'balls']);
      if (kind === 'dice') { const s = ri(r, 3, 11); let c = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b === s) c++; return NU('大小2つのさいころを投げて、目の和が ' + s + ' になる確率を答えなさい。（分数で、例：1/6）', frac(c, 36), { e: c + '/36 を約分して ' + frac(c, 36) + '。', df: 3, meta: { k: 'pdice', s } }); }
      if (kind === 'cards') { const n = ri(r, 3, 6); const m = ri(r, 1, n - 1); return NU('1〜' + (n * 3) + ' の番号のカードから1枚ひく。' + m * 3 + ' 以下の番号が出る確率は？（分数で）', frac(m * 3, n * 3), { e: m * 3 + '/' + n * 3 + ' を約分して ' + frac(m * 3, n * 3) + '。', df: 2, meta: { k: 'pcards', m: m * 3, n: n * 3 } }); }
      const red = ri(r, 2, 5), white = ri(r, 2, 5), tot = red + white; return NU('赤玉 ' + red + ' 個、白玉 ' + white + ' 個が入った袋から、同時に2個取り出す。2個とも赤玉である確率は？（分数で）', frac(red * (red - 1), tot * (tot - 1)), { e: 'C(' + red + ',2)/C(' + tot + ',2)＝' + frac(nCr(red, 2), nCr(tot, 2)) + '。', df: 4, meta: { k: 'pballs', red, white } });
    },
    M12(r) { // 数列
      const a = ri(r, -5, 9), d = ri(r, 2, 6), n = ri(r, 6, 15);
      if (r() < 0.5) return NU('初項 ' + a + '、公差 ' + d + ' の等差数列の第 ' + n + ' 項は？', a + (n - 1) * d, { e: 'a＋(n−1)d＝' + (a + (n - 1) * d) + '。', df: 2, meta: { k: 'ap', a, d, n } });
      if (r() < 0.5) return NU('初項 ' + a + '、公差 ' + d + ' の等差数列の初項から第 ' + n + ' 項までの和は？', n * (2 * a + (n - 1) * d) / 2, { e: 'n(2a＋(n−1)d)/2＝' + n * (2 * a + (n - 1) * d) / 2 + '。', df: 3, meta: { k: 'aps', a, d, n } });
      const g = ri(r, 2, 3), m = ri(r, 3, 6), a0 = ri(r, 1, 4); return NU('初項 ' + a0 + '、公比 ' + g + ' の等比数列の第 ' + m + ' 項は？', a0 * Math.pow(g, m - 1), { e: 'a·rⁿ⁻¹＝' + a0 * Math.pow(g, m - 1) + '。', df: 3, meta: { k: 'gp', a: a0, g, n: m } });
    },
    M13(r) { // 図形の計量
      const kind = pick(r, ['pyth', 'circle', 'cyl', 'sector', 'tri']);
      if (kind === 'pyth') { const t = pick(r, [[3, 4, 5], [5, 12, 13], [8, 15, 17], [7, 24, 25], [6, 8, 10]]); return NU('直角をはさむ2辺が ' + t[0] + ' cm と ' + t[1] + ' cm の直角三角形の斜辺は何 cm ですか。', t[2], { un: 'cm', e: '三平方の定理より ' + t[0] + '²＋' + t[1] + '²＝' + t[2] + '²。', df: 2, meta: { k: 'pyth', a: t[0], b: t[1], c: t[2] } }); }
      if (kind === 'circle') { const rr = ri(r, 2, 12); return NU('半径 ' + rr + ' cm の円の面積は何 cm² ですか。（円周率は π、例：9π）', rr * rr + 'π', { un: 'cm²', e: 'π×' + rr + '²＝' + rr * rr + 'π。', df: 2, meta: { k: 'circle', r: rr } }); }
      if (kind === 'cyl') { const rr = ri(r, 2, 6), h = ri(r, 2, 10); return NU('底面の半径 ' + rr + ' cm、高さ ' + h + ' cm の円柱の体積は何 cm³ ですか。（πを使って答える）', rr * rr * h + 'π', { un: 'cm³', e: 'π×' + rr + '²×' + h + '＝' + rr * rr * h + 'π。', df: 3, meta: { k: 'cyl', r: rr, h } }); }
      if (kind === 'sector') { const rr = ri(r, 3, 12), ang = pick(r, [30, 45, 60, 90, 120, 180]); return NU('半径 ' + rr + ' cm、中心角 ' + ang + '° のおうぎ形の弧の長さは何 cm ですか。（πを使って答える。例：3π/2）', frac(2 * rr * ang, 360) === '0' ? '0' : (frac(2 * rr * ang, 360) + 'π').replace(/^(-?\d+)\/(\d+)π$/, '$1π/$2'), { un: 'cm', e: '2π×' + rr + '×' + ang + '/360。', df: 3, meta: { k: 'sector', r: rr, ang } }); }
      const b = ri(r, 4, 14), h = ri(r, 3, 12); return NU('底辺 ' + b + ' cm、高さ ' + h + ' cm の三角形の面積は何 cm² ですか。', frac(b * h, 2), { un: 'cm²', e: '底辺×高さ÷2＝' + frac(b * h, 2) + '。', df: 1, meta: { k: 'tri', b, h } });
    },
    M14(r) { // 微分・積分
      const a = ri(r, 1, 5), b = ri(r, -6, 6), c = ri(r, -5, 5), x = ri(r, -3, 4);
      if (r() < 0.5) return NU('$f(x)=' + poly(a, b, c) + '$ のとき、$f\'(' + x + ')$ の値を求めなさい。', 2 * a * x + b, { e: "f'(x)＝" + (2 * a) + 'x＋' + b + ' なので f\'(' + x + ')＝' + (2 * a * x + b) + '。', df: 3, meta: { k: 'deriv', a, b, c, x } });
      const hi = ri(r, 1, 3), n = ri(r, 1, 3), cf = ri(r, 1, 6); const v = frac(cf * Math.pow(hi, n + 1), n + 1);
      return NU('定積分 $\\int_0^{' + hi + '} ' + (cf === 1 ? '' : cf) + 'x^{' + n + '}\\,dx$ の値を求めなさい。（分数なら 5/2 のように）', v, { e: '[' + cf + 'x^' + (n + 1) + '/' + (n + 1) + ']₀^' + hi + '＝' + v + '。', df: 4, meta: { k: 'integ', cf, n, hi } });
    },
  };
  const MATH_UNITS = [
    ['M1', '正負の数の計算', '符号に気をつけて四則計算できる', '計算のきほん'], ['M2', '分数の計算', '分数のたし算・ひき算・かけ算ができる', '計算のきほん'], ['M3', '文字式の値', '式に数を代入して値を求められる', '式と方程式'],
    ['M4', '一次方程式', '一次方程式を解ける', '式と方程式'], ['M5', '連立方程式', '連立方程式を解ける', '式と方程式'], ['M6', '展開', '乗法公式で展開できる', '式と方程式'], ['M7', '因数分解', '2次式を因数分解できる', '式と方程式'],
    ['M8', '二次方程式', '二次方程式の解を求められる', '式と方程式'], ['M9', '平方根', '根号を含む数を簡単にできる', '数と式'], ['M10', '場合の数', '順列・組合せ・円順列を数えられる', '場合の数と確率'],
    ['M11', '確率', 'さいころ・カード・玉の確率を求められる', '場合の数と確率'], ['M12', '数列', '等差数列・等比数列の項と和を求められる', '数列'], ['M13', '図形の計量', '三平方の定理・面積・体積・弧の長さを求められる', '図形'], ['M14', '微分と積分', '導関数の値と定積分を求められる', '微分積分'],
  ];

  // ---------------------------------------------------------------- 英語
  const mcEn = (q, correct, others, r, e, df, extra) => Object.assign(MC(q, correct, others, r, e, df), extra || {});
  const EN = {
    L1(r, C) { const v = pick(r, C.irregular), form = pick(r, [1, 2]); const ans = form === 1 ? v[1] : v[2]; const others = C.irregular.filter(x => x !== v).map(x => (form === 1 ? x[1] : x[2])).filter(x => x !== ans);
      return mcEn('「' + v[3] + '」を表す ' + v[0] + ' の' + (form === 1 ? '過去形' : '過去分詞') + 'は？', ans, sample([...new Set(others)], 3, r), r, v[0] + ' - ' + v[1] + ' - ' + v[2], 3, { meta: { k: 'irr', v: v[0], form } }); },
    L2(r, C) { const w = pick(r, C.words), d = r() < 0.5; const bad = C.words.filter(x => x !== w);
      return d ? mcEn('英単語「' + w[0] + '」の意味は？', w[1], sample(bad, 3, r).map(x => x[1]), r, w[0] + '＝' + w[1], 2, { sp: w[0], lang: 'en', meta: { k: 'word', w: w[0] } }) : mcEn('「' + w[1] + '」を英語にすると？', w[0], sample(bad, 3, r).map(x => x[0]), r, w[1] + '＝' + w[0], 2, { meta: { k: 'word', w: w[0] } }); },
    L3(r, C) { const p = pick(r, C.plurals); return mcEn(p[0] + ' の複数形は？', p[1], sample(C.plurals.filter(x => x !== p).map(x => x[1]).concat([p[0] + 's', p[0] + 'es']).filter(x => x !== p[1]), 3, r), r, p[0] + ' → ' + p[1], 2, { meta: { k: 'plural', w: p[0] } }); },
    L4(r, C) { const w = pick(r, C.comparatives), lv = pick(r, [1, 2]), ans = w[lv]; const bad = [w[0] + 'er', w[0] + 'est', 'more ' + w[0], 'most ' + w[0], w[1], w[2]].filter(x => x !== ans && x !== w[0]);
      return mcEn((lv === 1 ? '「' + w[0] + '」の比較級は？' : '「' + w[0] + '」の最上級は？'), ans, sample([...new Set(bad)], 3, r), r, w[0] + ' - ' + w[1] + ' - ' + w[2], 3, { meta: { k: 'comp', w: w[0], lv } }); },
    L5(r, C) { const s = pick(r, C.subjects), ans = s[1], bad = ['am', 'is', 'are', 'be'].filter(x => x !== ans); const n = pick(r, ['a student', 'happy', 'in the park', 'from Japan']);
      return mcEn(s[0] + ' ___ ' + n + '.（空らんに入る be 動詞は？）', ans, sample(bad, 3, r), r, s[0] + ' には ' + ans + ' を使う。', 1, { meta: { k: 'be', s: s[0] } }); },
    L6(r, C) { const s = pick(r, C.sentences), words = s[0].split(' '), extra = sample(C.sentences.flatMap(x => x[0].replace(/[.?!,]/g, '').split(' ')).filter(w => !s[0].includes(w)), 2, r);
      const tiles = words.map((t, i) => ({ id: 'w' + i, t })).concat(extra.map((t, i) => ({ id: 'd' + i, t }))); return { t: 'wb', q: '「' + s[1] + '」を英語にしよう。', w: shuffle(tiles, r), a: words.map((_, i) => 'w' + i), alt: [], norm: 1, e: s[0], df: 3, meta: { k: 'sent', s: s[0] } }; },
    L7(r, C) { const s = pick(r, C.sentences), bad = sample(C.sentences.filter(x => x !== s), 3, r).map(x => x[0]); return mcEn('音声を聞いて、聞こえた英文を選ぼう。', s[0], bad, r, s[0] + '（' + s[1] + '）', 2, { sp: s[0], lang: 'en', meta: { k: 'listen', s: s[0] } }); },
  };
  const EN_UNITS = [
    ['L1', '不規則動詞', '過去形・過去分詞を覚える', 'ことばのドリル'], ['L2', '単語', '基本単語の意味がわかる', 'ことばのドリル'], ['L3', '複数形', '名詞の複数形を選べる', '文法のドリル'], ['L4', '比較級・最上級', '比較の形を選べる', '文法のドリル'],
    ['L5', 'be動詞', '主語に合う be 動詞を選べる', '文法のドリル'], ['L6', '英作文タイル', '日本語に合う英文をならべる', '英文のドリル'], ['L7', '聞き取り', '聞こえた英文を選べる', '英文のドリル'],
  ];

  const extraUnits = MATH_UNITS.map(u => ({ id: u[0], course: 'mathlab', ti: u[1], goal: u[2], sec: u[3], need: null }))
    .concat(EN_UNITS.map(u => ({ id: u[0], course: 'englab', ti: u[1], goal: u[2], sec: u[3], need: 'english' })));
  for (const u of extraUnits) G.UNITS.push(u);
  G.COURSES.push({ id: 'mathlab', ja: '数学ラボ', en: 'Math Lab', sub: 'math' }, { id: 'englab', ja: '英語ラボ', en: 'English Lab', sub: 'english' });
  const baseMake = G.make;
  G.make = function (unitId, seed, content, n) {
    if (!M[unitId] && !EN[unitId]) return baseMake(unitId, seed, content, n);
    const r = rng(seedOf(seed + '|' + unitId)), out = []; n = n || 8;
    for (let k = 0; k < n; k++) { const q = M[unitId] ? M[unitId](r) : EN[unitId](r, content.english); q.i = 'g:' + unitId + ':' + seedOf(seed + '|' + k).toString(36); q.gen = unitId; q.ai = 1; out.push(q); }
    return out;
  };
  G.GEN2 = { M, EN, nPr, nCr, fact, frac, gcd };
  if (typeof module === 'object' && module && module.exports) module.exports = G;
})(typeof globalThis !== 'undefined' ? globalThis : this);
