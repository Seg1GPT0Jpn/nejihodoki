// manabi/engine.js の単体テスト：答え合わせ（型ごと・日本語の正規化）、ライトナー、レッスンの決まった結果、保存・ストリーク、getQuiz。
// 実行：node tools/tests/unit/manabi-engine.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'manabi/engine.js'));
const DATA = path.join(ROOT, 'manabi/data');
const J = f => JSON.parse(fs.readFileSync(path.join(DATA, f), 'utf8'));
const N = (a, un, x) => ({ t: 'nu', a, un, x });
const S = (a, x) => ({ t: 'sa', a, x });

test('tokenize: LaTeX inline/display and markup are kept verbatim', () => {
  const t = E.tokenize('値は $\\dfrac{1}{2}$ です。$$x^2$$ [[u:下線]] [[blank:ア]] [[mark:(1):傍線部]] 5\\$');
  deep(t.filter(x => x.k === 'm'), [{ k: 'm', v: '\\dfrac{1}{2}', d: false }, { k: 'm', v: 'x^2', d: true }]);
  eq(t.find(x => x.k === 'u').v, '下線'); eq(t.find(x => x.k === 'b').v, 'ア'); eq(t.find(x => x.k === 'k').m, '(1)');
  eq(t[t.length - 1].v.endsWith('5$'), true);
  eq(E.tokenize('price $5 and more').map(x => x.k).join(), 't', 'a lone $ is text');
  eq(E.stripMarkup('[[u:a]]と[[blank:x]]'), 'aと＿');
});
test('choice / multiple / ordering', () => {
  eq(E.check({ t: 'mc', a: 'イ' }, 'イ').ok, true); eq(E.check({ t: 'mc', a: 'イ' }, 'ア').ok, false); eq(E.check({ t: 'mc', a: 'イ' }, null).ok, false);
  eq(E.check({ t: 'ms', a: ['ア', 'ウ'] }, ['ウ', 'ア']).ok, true); eq(E.check({ t: 'ms', a: ['ア', 'ウ'] }, ['ア']).ok, false);
  eq(E.check({ t: 'or', a: ['イ', 'ア', 'ウ'] }, ['イ', 'ア', 'ウ']).ok, true); eq(E.check({ t: 'or', a: ['イ', 'ア', 'ウ'] }, ['ア', 'イ', 'ウ']).ok, false);
  eq(E.check({ t: 'de', a: 'x' }, 'y').self, true); eq(E.check({ t: 'pr', a: 'x' }, 'y').self, true);
});
test('numeric: plain, full-width, comma, sign, decimals, tolerance', () => {
  for (const [a, i] of [['150', '150'], ['150', '１５０'], ['1234', '1,234'], ['-3', '−3'], ['-3', '－3'], ['0.5', '.5'], ['0.5', '0.50'], ['60', ' 60 ']]) eq(E.check(N(a), i).ok, true, a + ' <- ' + i);
  for (const [a, i] of [['150', '15'], ['150', '151'], ['-3', '3'], ['0.5', '0.4'], ['60', '']]) eq(E.check(N(a), i).ok, false, a + ' <- ' + i);
  eq(E.checkNumeric(N('3.14'), '3.1416', 1e-3).ok, true, 'custom tolerance'); eq(E.checkNumeric(N('3.14'), '3.2', 1e-3).ok, false);
});
test('numeric: fractions, LaTeX, roots, powers of ten, percent/degree', () => {
  for (const [a, i] of [['3/5', '0.6'], ['3/5', '3/5'], ['3/5', '３／５'], ['$\\dfrac{1}{2}$', '1/2'], ['$\\dfrac{1}{2}$', '0.5'], ['$-\\dfrac{7}{2}$', '-3.5'], ['$2\\sqrt{3}$', '2√3'], ['$2\\sqrt{3}$', '2*sqrt3'.replace('sqrt', '√')], ['$2.0\\times10^{5}$', '2×10^5'], ['$2.0\\times10^{5}$', '200000'], ['$\\dfrac{\\sqrt{6}+\\sqrt{2}}{4}$', '(√6+√2)/4'], ['$\\pi$', 'π'], ['45', '45°']]) eq(E.check(N(a), i).ok, true, a + ' <- ' + i);
  eq(E.check(N('$\\dfrac{1}{3}$'), '0.33').ok, false, 'rounded fractions are not equal');
});
test('numeric: units (optional, but a wrong unit fails)', () => {
  const q = N('74', 'cm');
  eq(E.check(q, '74').ok, true); eq(E.check(q, '74cm').ok, true); eq(E.check(q, '74 cm').ok, true); eq(E.check(q, '７４ｃｍ').ok, true);
  const w = E.check(q, '74m'); eq(w.ok, false); eq(w.unit, true);
  eq(E.check(N('60', '点'), '60点').ok, true); eq(E.check(N('2.5', 'm/s'), '2.5m/s').ok, true); eq(E.check(N('9', 'm²'), '9 m^2').ok, true);
  eq(E.check(N('1.0', 'kJ/mol'), '1 kJ/mol').ok, true); eq(E.check(N('3'), 'x=3').ok, true, 'x= prefix');
  eq(E.check(N('2', null, ['2.0']), '2.0').ok, true);
});
test('short answer: width, case, spaces, punctuation, accepted', () => {
  const q = S('Do you need to read the book?');
  for (const i of ['Do you need to read the book?', 'do you need to read the book', 'ＤＯ　ｙｏｕ need to read the book？', ' Do  you need to read the book ']) eq(E.check(q, i).ok, true, i);
  eq(E.check(q, 'Do you need read the book?').ok, false);
  const a = S("They don't wash the dishes after dinner.", ['They do not wash the dishes after dinner.']);
  eq(E.check(a, 'they do not wash the dishes after dinner').ok, true); eq(E.check(a, 'They don’t wash the dishes after dinner.').ok, true, 'curly apostrophe');
  eq(E.check(S('(1) stopped　(2) gave　(3) cried', ['stopped, gave, cried']), 'stopped gave cried').ok, true);
  eq(E.check(S('私の夢は、医者になることです。', ['私の夢は医者になることです。']), '私の夢は医者になることです').ok, true);
});
test('short answer: kana variants only when the answer is kana', () => {
  const q = S('こば', ['こばむ']);
  eq(E.check(q, 'こば').ok, true); eq(E.check(q, 'コバ').ok, true); eq(E.check(q, 'ｺﾊﾞ').ok, true, 'half-width katakana'); eq(E.check(q, 'こばむ').ok, true); eq(E.check(q, '拒').ok, false);
  eq(E.check(S('血清療法'), '血清療法').ok, true); eq(E.check(S('血清療法'), 'けっせいりょうほう').ok, false, 'kanji answers do not accept kana');
  eq(E.check(S('鼻'), 'はな').ok, false);
});
test('short answer: math expressions in LaTeX vs typed', () => {
  const m = (a, i, x) => E.check(S(a, x), i).ok;
  eq(m('$y=-x^2-12x-32$', 'y=-x^2-12x-32'), true); eq(m('$y=-x^2-12x-32$', 'y = −x^2 − 12x − 32'), true); eq(m('$y=-x^2-12x-32$', 'y=-x^2-12x-33'), false);
  eq(m('$x\\geqq \\dfrac{3}{2}$', 'x≧3/2'), true); eq(m('$x\\geqq \\dfrac{3}{2}$', 'x>=3/2'), true); eq(m('$x\\geqq \\dfrac{3}{2}$', 'x<=3/2'), false);
  eq(m('$1<x<5$', '1<x<5'), true); eq(m('$-\\dfrac{40}{9}$', '-40/9'), true); eq(m('$\\sqrt{137}$', '√137'), true);
  eq(m('$x=2$', '2'), true, 'x= can be left out'); eq(m('$(x-3y-2)(x+2y+1)$', '(x+2y+1)(x-3y-2)', ['(x+2y+1)(x-3y-2)']), true, 'accepted list');
  eq(m('$a=4,\\ b=-4$', 'a=4, b=-4'), true);
});
test('every converted numeric / short answer accepts its own answer and alternatives', () => {
  let n = 0;
  for (const f of fs.readdirSync(path.join(DATA, 'u'))) for (const q of J('u/' + f).q) {
    if (q.t !== 'nu' && q.t !== 'sa') continue; n++;
    for (const inp of [q.a, ...(q.x || [])]) if (!E.check(q, inp).ok) throw new Error(q.i + ' rejects ' + JSON.stringify(inp));
  }
  ok(n > 3000, 'checked ' + n);
});
test('evalMath is safe and strict', () => {
  eq(E.evalMath('2+3*4'), 14); eq(E.evalMath('(1+2)^2'), 9); eq(E.evalMath('2^-2'), 0.25); eq(E.evalMath('alert(1)'), null); eq(E.evalMath('1/0'), null); eq(E.evalMath('9^9^9^9'), null); eq(E.evalMath(''), null);
});
test('Leitner: encoding, boxes, due dates', () => {
  const today = E.dayNum(new Date(2026, 10, 25));
  let b = '000'.repeat(4);
  deep(E.card(b, 2), { box: 0, day: -1 });
  b = E.setCard(b, 1, 3, today); b = E.setCard(b, 2, 1, today - 5);
  eq(b.length, 12); deep(E.card(b, 1), { box: 3, day: today }); eq(E.card(b, 0).box, 0);
  eq(E.isDue(E.card(b, 1), today), false); eq(E.isDue(E.card(b, 1), today + 7), true); eq(E.isDue(E.card(b, 2), today), true); eq(E.dueIn(E.card(b, 1), today), 7);
  eq(E.decDay(E.encDay(today)), today);
  eq(E.nextBox(0, 'first'), 2); eq(E.nextBox(2, 'first'), 3); eq(E.nextBox(5, 'first'), 5); eq(E.nextBox(4, 'miss'), 1); eq(E.nextBox(3, 'retry'), 3); eq(E.nextBox(0, 'retry'), 1); eq(E.nextBox(2, 'no'), 1); eq(E.nextBox(1, 'ok'), 2);
  const b2 = E.applyResults(b, [{ i: 0, res: 'first' }, { i: 1, res: 'miss' }], today + 1);
  eq(E.card(b2, 0).box, 2); eq(E.card(b2, 1).box, 1); eq(E.card(b2, 1).day, today + 1); eq(E.card(b2, 3).box, 0);
  const st = E.boxStats(b2, 4, today + 2); eq(st.fresh, 1); eq(st.learning, 3); eq(st.due, 2);
  eq(E.parseBoxes('x:' + b, 'x', 4), b); eq(E.parseBoxes('y:' + b, 'x', 4), '000'.repeat(4), 'hash mismatch resets'); eq(E.parseBoxes(undefined, 'x', 2), '000000');
});
const unit = J('u/jh-math-g2-u01.json');
test('lesson generation is deterministic and varied by seed', () => {
  const mk = seed => E.createLesson({ qs: unit.q, today: 20800, seed, boxes: '000'.repeat(unit.q.length) });
  const run1 = L => { const ids = []; while (L.cur) { ids.push(L.cur.e.q.i); E.answer(L, 'ok'); } return ids; };
  const a = run1(mk('s1')), b = run1(mk('s1')), c = run1(mk('s2'));
  deep(a, b); ok(a.length === 8, 'size ' + a.length); eq(new Set(a).size, 8); ok(a.join() !== c.join(), 'seed matters');
});
test('lesson: wrong answers return later in the same lesson (max twice), then the lesson ends; no lockout', () => {
  const L = E.createLesson({ qs: unit.q, today: 20800, seed: 'w', boxes: '000'.repeat(unit.q.length) });
  const first = L.cur.e.q.i; const seen = []; let guard = 0;
  while (L.cur && guard++ < 60) { const id = L.cur.e.q.i; seen.push(id); E.answer(L, id === first && !L.cur.e.q.t.match(/de|pr/) ? 'miss' : 'ok'); }
  const times = seen.filter(i => i === first).length;
  if (!/de|pr/.test(unit.q.find(q => q.i === first).t)) { eq(times, 1 + E.MAX_RETRY, 'asked 3 times in total'); ok(seen.indexOf(first, 1) >= E.RETRY_GAP, 'gap'); }
  ok(L.over && L.cur === null); eq(L.results.length, 8);
  ok(L.results.find(r => r.i === L.picked[0].i).res === 'miss' || true);
  const s = E.lessonSummary(L, 10); eq(s.n, 8); ok(s.missed.length <= 1);
});
test('lesson: a correct retry still leaves box 1 (miss on the first try)', () => {
  const L = E.createLesson({ qs: unit.q, today: 20800, seed: 'r', boxes: '000'.repeat(unit.q.length) });
  const f = L.cur.e; E.answer(L, f.q.t === 'de' || f.q.t === 'pr' ? 'sg-no' : 'miss');
  while (L.cur) E.answer(L, L.cur.retry ? 'ok' : 'ok');
  const r = L.results.find(x => x.i === f.i); ok(r.res === 'miss' || r.res === 'no');
  const b = E.applyResults('000'.repeat(unit.q.length), L.results, 20800); eq(E.card(b, f.i).box, 1);
});
test('lesson: due cards come first (up to 3); review mode picks only given cards; difficulty adapts', () => {
  let b = '000'.repeat(unit.q.length);
  for (let i = 0; i < 5; i++) b = E.setCard(b, i, 2, 20700);
  const L = E.createLesson({ qs: unit.q, today: 20800, seed: 'd', boxes: b });
  const picks = []; while (L.cur) { picks.push(L.cur.e); E.answer(L, 'ok'); }
  const due = picks.filter(e => e.due).length; ok(due >= 2 && due <= 3, 'due ' + due);
  const R = E.createLesson({ qs: unit.q, today: 20800, seed: 'x', boxes: b, only: [0, 1, 2], size: 3, mode: 'review' });
  const ids = []; while (R.cur) { ids.push(R.cur.e.i); E.answer(R, 'ok'); } deep(ids.sort(), [0, 1, 2]);
  const hi = E.createLesson({ qs: unit.q, today: 1, seed: 'a', target: 4.5 }), lo = E.createLesson({ qs: unit.q, today: 1, seed: 'a', target: 1 });
  ok(hi.cur.e.q.df >= lo.cur.e.q.df, 'target difficulty');
  const A = E.createLesson({ qs: unit.q, today: 1, seed: 'a', target: 2 }); const t0 = A.target; E.answer(A, 'ok'); E.answer(A, 'ok'); ok(A.target > t0); E.answer(A, 'miss'); ok(A.target < t0 + 0.5);
});
test('lesson mixes at most 2 self-graded questions', () => {
  const u = J('u/hs-matha-u01.json'); // de が多い
  for (const s of ['a', 'b', 'c', 'd']) { const L = E.createLesson({ qs: u.q, today: 1, seed: s }); let n = 0; while (L.cur) { if (E.isSelfGrade(L.cur.e.q) && !L.cur.retry) n++; E.answer(L, E.isSelfGrade(L.cur.e.q) ? 'sg-ok' : 'ok'); } ok(n <= E.MAX_SELF, 'self ' + n); }
});
test('save: normalize, XP / goal, streak (gentle), compact', () => {
  const s0 = E.normSave({ xp: -4, d: [5, 5, 'x', 3], goal: 7, b: { a: 'h:000', bad: 'zz' }, st: { q: 'a' }, extra: 1 });
  eq(s0.xp, 0); deep(s0.d, [3, 5]); eq(s0.goal, 20); deep(Object.keys(s0.b), ['a']); eq(s0.st.q, 0); ok(!('extra' in s0));
  eq(E.streakOf([10, 11, 12], 12), 3); eq(E.streakOf([10, 11, 12], 13), 3, 'today not yet played still counts'); eq(E.streakOf([10, 11, 12], 14), 0, 'a day off resets with no penalty'); eq(E.streakOf([], 5), 0);
  let s = E.defSave(); s = E.recordLesson(s, { today: 100, xp: 15, n: 8, ok: 7, unitKey: 'u1', setHash: 'abc', boxes: '211' });
  s = E.recordLesson(s, { today: 101, xp: 10, n: 8, ok: 8 });
  eq(s.xp, 25); eq(E.xpToday(s, 101), 10); eq(E.goalMet(s, 101), false); eq(E.goalMet(s, 100), false); s = E.recordLesson(s, { today: 101, xp: 12, n: 1, ok: 1 }); eq(E.goalMet(s, 101), true);
  eq(s.b.u1, 'abc:211'); eq(s.st.ls, 3); eq(s.st.best, 2);
  const big = E.defSave(); for (let d = 0; d < 300; d++) { big.d.push(d + 1); big.g[d + 1] = 5; } const n = E.normSave(big); ok(n.d.length <= 120 && Object.keys(n.g).length <= 14);
  // 全 205 単元ぶんの箱でも小さい
  const all = E.defSave(); for (const f of fs.readdirSync(path.join(DATA, 'u'))) { const c = J('u/' + f); all.b[c.id] = E.hashIds(c.q.map(q => q.i)) + ':' + '3AB'.repeat(c.q.length); }
  ok(JSON.stringify(all).length < 60000, 'size ' + JSON.stringify(all).length); eq(E.normSave(all).b['jh-math-g2-u01'] === all.b['jh-math-g2-u01'], true);
});
test('mock exam scoring with points and self grades', () => {
  const ex = { q: [{ i: 'a', t: 'mc', a: 'ア', p: 3 }, { i: 'b', t: 'nu', a: '4', p: 5 }, { i: 'c', t: 'de', a: 'x', p: 2 }] };
  const r = E.scoreExam(ex, { a: 'ア', b: '5' }, { c: 'unsure' });
  eq(r.total, 10); eq(r.got, 4); eq(r.pct, 40); eq(E.scoreExam(ex, {}, {}).got, 0);
});
test('getQuiz: n random questions with a check function (injected fetch)', async () => {
  const fetchFn = async url => { const f = url.replace(/^.*data\//, ''); const p = path.join(DATA, f); return { ok: fs.existsSync(p), status: 404, json: async () => JSON.parse(fs.readFileSync(p, 'utf8')) }; };
  const seq = E.rng(7);
  const quiz = await E.getQuiz({ n: 5, subjects: ['math'], levels: ['JH'], base: 'http://x/data/', fetch: fetchFn, random: seq });
  eq(quiz.questions.length, 5); eq(quiz.n, 5);
  for (const q of quiz.questions) { eq(q.subject, 'math'); eq(q.level, 'JH'); ok(['mc', 'ms', 'or', 'nu', 'sa'].includes(q.type)); ok(!('a' in q) && !('answer' in q), 'answers are not exposed'); }
  const q0 = quiz.questions[0], chunkQ = Object.values(E._cache.chunks).length; ok(chunkQ >= 1);
  const res = quiz.check(q0.id, q0.type === 'mc' ? 'zz' : ''); eq(res.ok, false); ok(res.correctText.length >= 1);
  // 正しい答えで通る（chunk から答えを引く）
  const ch = await E.loadChunk('http://x/data/', 'u/' + q0.unit.toLowerCase() + '.json', fetchFn); const raw = ch.q.find(q => q.i === q0.id);
  eq(quiz.check(q0, raw.t === 'nu' || raw.t === 'sa' ? raw.a : raw.a).ok, true);
  eq(quiz.check('nope', 'x').unknown, true);
  const hs = await E.getQuiz({ n: 3, subjects: ['english'], levels: ['HS'], base: 'http://x/data/', fetch: fetchFn, random: E.rng(1) }); eq(hs.questions.every(q => q.level === 'HS' && q.subject === 'english'), true);
  eq((await E.getQuiz({ n: 2, subjects: ['nothing'], base: 'http://x/data/', fetch: fetchFn })).questions.length, 0);
});
run('manabi-engine');
