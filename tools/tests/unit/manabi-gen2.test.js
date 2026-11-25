// 数学ラボ・英語ラボ（manabi/gen2.js）：答えを、つくった側とは別のやり方（式を engine の evalMath で計算・総当たり・代入）でもう一度確かめる。
// 実行：node tools/tests/unit/manabi-gen2.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'manabi/engine.js')); globalThis.ManabiEngine = E;
const G = require(path.join(ROOT, 'manabi/gen.js')); globalThis.ManabiGen = G; require(path.join(ROOT, 'manabi/gen2.js'));
const C = { english: require(path.join(ROOT, 'manabi/content/english.json')) };
const tex2 = t => t.replace(/\\dfrac\{(\d+)\}\{(\d+)\}/g, '($1)/($2)').replace(/\\times/g, '*').replace(/\\/g, '');
const many = (id, f, N = 300) => { for (let k = 0; k < N; k++) for (const q of G.make(id, 's' + k, C, 8)) f(q, q.meta || {}); };
const val = s => E.evalMath(s);
test('14 math + 7 English lab units exist and every question accepts its own answer', () => {
  eq(G.UNITS.filter(u => u.course === 'mathlab').length, 14); eq(G.UNITS.filter(u => u.course === 'englab').length, 7);
  for (const u of G.UNITS.filter(u => u.course === 'mathlab' || u.course === 'englab')) many(u.id, q => { ok(q.q && q.i, u.id); const inp = q.t === 'wb' ? q.a : q.a; eq(E.check(q, inp).ok, true, u.id + ' ' + q.q.slice(0, 40)); if (q.t === 'mc') ok(new Set(q.c.map(c => c[1])).size === q.c.length, u.id + ' duplicate choices ' + q.c.map(c => c[1])); }, 60);
});
test('M1 integer arithmetic: the displayed expression, evaluated independently, equals the answer', () => many('M1', (q, m) => ok(Math.abs(val(tex2(m.tex)) - Number(q.a)) < 1e-9, q.q)));
test('M2 fractions: independent evaluation of the displayed expression', () => many('M2', (q, m) => { const v = val(tex2(m.tex)), a = val(q.a); ok(Math.abs(v - a) < 1e-9, q.q + ' ' + q.a); ok(!/^-?\d+\/\d+$/.test(q.a) || (() => { const [n, d] = q.a.split('/').map(Number); return G.GEN2.gcd(n, d) === 1; })(), 'reduced ' + q.a); }));
test('M3 substitution / M4 linear / M5 simultaneous / M8 quadratic: substitute the answer back', () => {
  many('M3', (q, m) => eq(m.a * m.x * m.x + m.b * m.x + m.c, Number(q.a)));
  many('M4', (q, m) => eq(m.a * m.x + m.b, m.c * m.x + m.d));
  many('M5', (q, m) => { let hit = 0; for (let x = -9; x <= 9; x++) for (let y = -9; y <= 9; y++) if (m.a * x + m.b * y === m.p && m.c * x + m.d * y === m.q) { hit++; eq(m.ask === 'x' ? x : y, Number(q.a)); } eq(hit, 1, 'unique solution'); });
  many('M8', (q, m) => { const roots = []; for (let x = -20; x <= 20; x++) if (x * x + m.b * x + m.c === 0) roots.push(x); eq(roots.length, 2); eq(m.big ? Math.max(...roots) : Math.min(...roots), Number(q.a)); });
});
test('M6 expand / M7 factor: the keyed choice is right and the distractors are wrong (checked numerically at 5 points)', () => {
  const poly = s => x => val(s.replace(/\$/g, '').replace(/x/g, '(' + x + ')').replace(/\^2/g, '^2').replace(/\)\(/g, ')*(').replace(/(\d)\(/g, '$1*('));
  for (const id of ['M6', 'M7']) many(id, (q, m) => {
    const stem = q.q.match(/\$([^$]+)\$/)[1], right = q.c.find(c => c[0] === q.a)[1];
    const f = poly(stem), g = poly(right);
    for (const x of [-3, -1, 0, 2, 5]) ok(Math.abs(f(x) - g(x)) < 1e-9, id + ' ' + stem + ' vs ' + right);
    for (const c of q.c) if (c[0] !== q.a) ok([-3, -1, 0, 2, 5].some(x => poly(stem)(x) !== poly(c[1])(x)), id + ' distractor equals the answer: ' + c[1]);
  }, 120);
});
test('M9 roots: value of a√b equals √n', () => many('M9', (q, m) => ok(Math.abs(val(q.a) - Math.sqrt(m.n)) < 1e-9 && m.n === m.a * m.a * m.b)));
test('M10 counting: brute force enumeration', () => many('M10', (q, m) => {
  if (m.k === 'P') { let c = 0; const rec = (d, used) => { if (d === m.r) { c++; return; } for (let i = 0; i < m.n; i++) if (!(used & (1 << i))) rec(d + 1, used | (1 << i)); }; rec(0, 0); eq(c, Number(q.a)); }
  if (m.k === 'C') { let c = 0; for (let mask = 0; mask < (1 << m.n); mask++) { let b = 0; for (let i = 0; i < m.n; i++) b += (mask >> i) & 1; if (b === m.r) c++; } eq(c, Number(q.a)); }
  if (m.k === 'dice') { let c = 0; for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) if (a + b === m.s) c++; eq(c, Number(q.a)); }
  if (m.k === 'circ') { const seen = new Set(); const perm = (arr, cur) => { if (!arr.length) { const i = cur.indexOf(0), rot = cur.slice(i).concat(cur.slice(0, i)).join(); seen.add(rot); return; } arr.forEach((x, j) => perm(arr.filter((_, k) => k !== j), cur.concat(x))); }; perm([...Array(m.n).keys()], []); eq(seen.size, Number(q.a)); }
}, 80));
test('M11 probability: exact enumeration with fractions', () => many('M11', (q, m) => {
  let num = 0, den = 0;
  if (m.k === 'pdice') { for (let a = 1; a <= 6; a++) for (let b = 1; b <= 6; b++) { den++; if (a + b === m.s) num++; } }
  if (m.k === 'pcards') { den = m.n; for (let i = 1; i <= m.n; i++) if (i <= m.m) num++; }
  if (m.k === 'pballs') { const balls = [...Array(m.red).fill(1), ...Array(m.white).fill(0)]; for (let i = 0; i < balls.length; i++) for (let j = i + 1; j < balls.length; j++) { den++; if (balls[i] && balls[j]) num++; } }
  ok(Math.abs(val(q.a) - num / den) < 1e-12, q.q + ' ' + q.a + ' vs ' + num + '/' + den);
}));
test('M12 sequences: generated term by term', () => many('M12', (q, m) => {
  if (m.k === 'ap') { let t = m.a; for (let i = 1; i < m.n; i++) t += m.d; eq(t, Number(q.a)); }
  if (m.k === 'aps') { let t = m.a, s = 0; for (let i = 0; i < m.n; i++) { s += t; t += m.d; } eq(s, Number(q.a)); }
  if (m.k === 'gp') { let t = m.a; for (let i = 1; i < m.n; i++) t *= m.g; eq(t, Number(q.a)); }
}));
test('M13 geometry / M14 calculus: independent numeric evaluation', () => many('M13', (q, m) => {
  const v = val(q.a);
  if (m.k === 'pyth') eq(Math.hypot(m.a, m.b), m.c);
  if (m.k === 'circle') ok(Math.abs(v - Math.PI * m.r * m.r) < 1e-9);
  if (m.k === 'cyl') ok(Math.abs(v - Math.PI * m.r * m.r * m.h) < 1e-9);
  if (m.k === 'sector') ok(Math.abs(v - 2 * Math.PI * m.r * m.ang / 360) < 1e-9, q.q + ' ' + q.a);
  if (m.k === 'tri') ok(Math.abs(v - m.b * m.h / 2) < 1e-9);
}) || many('M14', (q, m) => {
  if (m.k === 'deriv') { const f = x => m.a * x * x + m.b * x + m.c, h = 1e-5; ok(Math.abs((f(m.x + h) - f(m.x - h)) / (2 * h) - Number(q.a)) < 1e-4); }
  if (m.k === 'integ') { let s = 0; const N = 20000; for (let i = 0; i < N; i++) { const x = (i + 0.5) * m.hi / N; s += m.cf * Math.pow(x, m.n) * m.hi / N; } ok(Math.abs(s - val(q.a)) < 1e-4, q.q + ' ' + q.a); }
}));
test('English labs: answers come from the authored tables; distractors differ; sentences tile back', () => {
  const irr = C.english.irregular; many('L1', (q, m) => { const v = irr.find(x => x[0] === m.v); eq(q.c.find(c => c[0] === q.a)[1], m.form === 1 ? v[1] : v[2]); });
  many('L2', (q, m) => ok(C.english.words.some(w => w[0] === m.w && (q.e.includes(w[1])))));
  many('L3', (q, m) => eq(q.c.find(c => c[0] === q.a)[1], C.english.plurals.find(x => x[0] === m.w)[1]));
  many('L4', (q, m) => eq(q.c.find(c => c[0] === q.a)[1], C.english.comparatives.find(x => x[0] === m.w)[m.lv]));
  many('L5', (q, m) => eq(q.c.find(c => c[0] === q.a)[1], C.english.subjects.find(x => x[0] === m.s)[1]));
  many('L6', (q, m) => { const ws = m.s.split(' '); eq(E.check(q, q.a).ok, true); eq(q.a.length, ws.length); ok(!E.check(q, q.a.slice().reverse()).ok || ws.join() === ws.slice().reverse().join()); });
  many('L7', (q, m) => { eq(q.sp, m.s); eq(q.c.find(c => c[0] === q.a)[1], m.s); });
  for (const [b, p] of C.english.irregular.map(x => [x[0], x[1]])) ok(b && p);
  eq(new Set(C.english.words.map(w => w[0])).size, C.english.words.length);
});
test('generation is deterministic and all 21 new units count as lessons without end (new seed each lesson)', () => { for (const id of ['M1', 'M10', 'L6']) { eq(JSON.stringify(G.make(id, 'q', C, 8)), JSON.stringify(G.make(id, 'q', C, 8))); ok(JSON.stringify(G.make(id, 'q', C, 8)) !== JSON.stringify(G.make(id, 'r', C, 8))); } });
test('stories: every answer is supported by quoted evidence from the story text; tap questions match their keywords', () => {
  const D = require(path.join(ROOT, 'manabi/content/stories.json')); eq(D.ai, 1); ok(D.stories.length >= 6);
  for (const st of D.stories) {
    const text = st.lines.map(l => l[0]).join(' ').toLowerCase(); ok(st.lines.every(l => l[0] && l[1]), st.id);
    for (const q of st.qs) {
      ok(text.includes(q.ev.toLowerCase()), st.id + ' evidence not in text: ' + q.ev);
      if (q.t === 'mc') { ok(q.c.includes(q.a) && new Set(q.c).size === q.c.length, st.id + ' ' + q.q); const core = q.a.toLowerCase().replace(/^(an?|the|his|her)\s+/, '').replace(/^(by|in|on|near)\s+/, ''); ok(q.ev.toLowerCase().includes(core.split(' ').pop()) || q.ev.toLowerCase().includes(core), st.id + ' answer ' + q.a + ' not in evidence ' + q.ev); }
      else { const toks = st.lines[q.ln][0].replace(/[.,"!?]/g, '').toLowerCase().split(/\s+/); ok(q.kw.every(k => toks.includes(k.toLowerCase())), st.id + ' kw'); ok(st.lines[q.ln][0].toLowerCase().includes(q.ev.toLowerCase())); }
    }
  }
});
run('manabi-gen2');
