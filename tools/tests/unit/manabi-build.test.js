// manabi の変換結果（manabi/data）の検査：全問に答えがある・型ごとの形・LaTeX が残る・図の SVG が安全・index と chunk が合う・容量。
// ソースがあれば（MANABI_SRC）、同じ入力から同じ出力ができること（決まった結果）も確かめる。
// 実行：node tools/tests/unit/manabi-build.test.js
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const B = require(path.join(ROOT, 'tools/build-manabi.js'));
const DATA = path.join(ROOT, 'manabi/data');
const idx = JSON.parse(fs.readFileSync(path.join(DATA, 'index.json'), 'utf8'));
const units = idx.courses.flatMap(c => c.subjects.flatMap(s => s.units));
const sets = units.flatMap(u => u.sets);
const chunks = sets.map(s => ({ s, c: JSON.parse(fs.readFileSync(path.join(DATA, s.f), 'utf8')) }));
const exams = idx.exams.map(x => ({ x, c: JSON.parse(fs.readFileSync(path.join(DATA, x.f), 'utf8')) }));
const allQ = chunks.flatMap(c => c.c.q).concat(exams.flatMap(e => e.c.q));

test('index: courses JH/HS, credit line, counts add up', () => {
  eq(idx.courses.map(c => c.id).join(), 'JH,HS');
  ok(idx.credit.includes('かながわコネクト教材プロジェクト'));
  eq(units.reduce((a, u) => a + u.n, 0), idx.total);
  eq(exams.reduce((a, e) => a + e.c.q.length, 0), idx.examTotal);
  ok(idx.total > 13000 && units.length >= 200);
  for (const u of units) { eq(u.sets.reduce((a, s) => a + s.n, 0), u.n, u.id); ok(u.ti && u.g >= 1 && u.g <= 3, u.id); }
  for (const { s, c } of chunks) { eq(c.q.length, s.n, s.id); eq(c.n, s.n); }
});
test('every question has an answer and a stem; ids are unique', () => {
  const ids = new Set();
  for (const q of allQ) { ok(q.q && q.q.trim(), q.i + ' stem'); ok(q.a != null && q.a !== '' && !(Array.isArray(q.a) && !q.a.length), q.i + ' answer'); ok(!ids.has(q.i), 'dup ' + q.i); ids.add(q.i); ok(q.df >= 1 && q.df <= 5, q.i + ' df'); }
});
test('type-specific validators', () => {
  const cnt = {};
  for (const q of allQ) {
    cnt[q.t] = (cnt[q.t] || 0) + 1;
    ok(['mc', 'ms', 'or', 'nu', 'sa', 'de', 'pr'].includes(q.t), q.i);
    if (q.t === 'mc') { ok(q.c.length >= 2 && typeof q.a === 'string' && q.c.some(c => c[0] === q.a), q.i); }
    if (q.t === 'ms') { ok(Array.isArray(q.a) && q.a.every(l => q.c.some(c => c[0] === l)), q.i); }
    if (q.t === 'or') { ok(Array.isArray(q.a) && q.a.length === q.c.length && new Set(q.a).size === q.a.length && q.a.every(l => q.c.some(c => c[0] === l)), q.i); }
    if (q.t === 'nu' || q.t === 'sa' || q.t === 'de' || q.t === 'pr') { ok(typeof q.a === 'string' && q.a.trim(), q.i); if (q.x) ok(Array.isArray(q.x) && q.x.every(x => typeof x === 'string'), q.i); }
    if (q.c) { eq(new Set(q.c.map(c => c[0])).size, q.c.length, q.i + ' labels'); }
    if (q.st) { const c = chunks.find(k => k.c.q.includes(q)) || exams.find(k => k.c.q.includes(q)); ok(c.c.S[q.st], q.i + ' stimulus ' + q.st); }
  }
  for (const t of ['mc', 'nu', 'sa', 'de', 'or']) ok(cnt[t] > 100, t);
});
test('LaTeX is preserved verbatim; figures are inline sanitized SVG', () => {
  const tex = allQ.filter(q => /\$[^$]+\$/.test(q.q));
  ok(tex.length > 3000, 'latex questions ' + tex.length);
  ok(allQ.some(q => q.q.includes('\\dfrac') || (q.e || '').includes('\\dfrac')), 'dfrac kept');
  const figs = allQ.filter(q => q.f);
  ok(figs.length > 400, 'figures ' + figs.length);
  for (const q of figs) { ok(/^<svg/.test(q.f.s) && !/<script|foreignObject|\son\w+=|href/i.test(q.f.s), q.i); ok(q.f.a, q.i + ' alt'); }
});
test('questions that point at a missing figure are gone', () => {
  for (const q of allQ) if (!q.f && !q.tb && !q.st) ok(!B.MISSING_FIG.test(q.q), q.i + ' ' + q.q.slice(0, 40));
});
test('dropped bloat: no verification / copyright / scoring / calc_check keys', () => {
  const keys = new Set(); for (const q of allQ) for (const k of Object.keys(q)) keys.add(k);
  for (const k of ['verification', 'copyright', 'scoring', 'calc_check', 'revision', 'distractor_analysis', 'error_analysis']) ok(!keys.has(k), k);
  const total = ['u', 'x'].reduce((n, d) => n + fs.readdirSync(path.join(DATA, d)).reduce((m, f) => m + fs.statSync(path.join(DATA, d, f)).size, 0), 0);
  ok(total < 25 * 1048576, 'size ' + total);
});
test('exams: time limit, sections, points', () => {
  ok(exams.length >= 15);
  for (const { x, c } of exams) { ok(x.min > 0 && c.min === x.min, x.id); ok(c.q.every(q => q.p > 0), x.id + ' points'); }
  ok(exams.some(e => e.c.sec.length >= 5), 'kanagawa sections');
});
test('cleanSvg removes scripts, handlers and links', () => {
  const s = B.cleanSvg('<svg xmlns="x"><script>alert(1)</script><a href="javascript:1"><rect onclick="x()" width="1"/></a><foreignObject>x</foreignObject></svg>');
  ok(!/script|onclick|href|foreignObject/.test(s), s);
  eq(B.cleanSvg('<div>x</div>'), '');
});
test('converter rejects broken questions and is deterministic on synthetic input', () => {
  const S = {};
  eq(B.convert({ id: 'a', question_type: 'multiple_choice', stem: 'x', choices: [{ label: 'A', text: '1' }, { label: 'B', text: '2' }], answer: { value: 'C' } }, {}, S), 'bad-answer-label');
  eq(B.convert({ id: 'a', question_type: 'numeric', stem: 'x', answer: { value: '' } }, {}, S), 'no-answer');
  eq(B.convert({ id: 'a', question_type: 'short_answer', stem: '右の図で、xを求めなさい', answer: { value: '3' } }, {}, S), 'refers-to-missing-figure');
  const r = B.convert({ id: 'a', question_type: 'numeric', stem: '$1+1$', answer: { value: '2', unit: 'cm', accepted: ['2.0'] }, explanation: 'e', difficulty: { score: 2 } }, {}, S);
  eq(r.q, '$1+1$'); eq(r.un, 'cm'); eq(r.x[0], '2.0'); eq(r.t, 'nu');
});

const EN = require(path.join(ROOT, 'manabi/engine.js'));
test('audit: every question accepts its own answer (all types) and its alternatives; no empty or duplicated choices', () => {
  let n = 0;
  for (const q of allQ) {
    if (q.c) { const tx = q.c.map(x => x[1].trim()); ok(tx.every(Boolean), q.i + ' empty choice'); if (q.t !== 'or') eq(new Set(tx).size, tx.length, q.i + ' duplicate choices'); }
    if (q.t === 'de' || q.t === 'pr') continue; n++;
    ok(EN.check(q, q.a).ok, q.i + ' rejects its own answer');
    for (const x of q.x || []) ok(EN.check(q, x).ok, q.i + ' rejects alt ' + x);
  }
  ok(n > 10000, 'checked ' + n);
});
test('audit: typed variants of numeric / English answers are accepted; near misses are rejected', () => {
  const fw = s => s.replace(/[0-9]/g, c => String.fromCharCode(c.charCodeAt(0) + 0xFEE0));
  let n = 0;
  for (const q of allQ) {
    if (q.t === 'nu' && /^-?\d+(\.\d+)?$/.test(q.a)) { n++; for (const v of [fw(q.a), ' ' + q.a + ' ', q.un ? q.a + q.un : q.a, q.un ? q.a + ' ' + q.un : q.a]) ok(EN.check(q, v).ok, q.i + ' variant ' + v); ok(!EN.check(q, String(Number(q.a) + 1)).ok, q.i + ' +1 accepted'); }
    if (q.t === 'sa' && /^[A-Za-z' ,.?!-]+$/.test(q.a)) { n++; for (const v of [q.a.toUpperCase(), '  ' + q.a + '  ']) ok(EN.check(q, v).ok, q.i + ' variant'); ok(!EN.check(q, q.a + ' not').ok); }
    if (q.t === 'mc') ok(!EN.check(q, q.c.find(x => x[0] !== q.a)[0]).ok);
  }
  ok(n > 1500, 'variants ' + n);
});
const KX = path.join(ROOT, 'tools/tests/.cache/katex-0.16.9/katex.min.js');
if (fs.existsSync(KX)) test('audit: every distinct LaTeX fragment parses in KaTeX (strict off)', () => {
  const katex = require(KX), seen = new Set(); let n = 0;
  const log = console.warn; console.warn = () => {};
  try {
    for (const q of allQ) for (const s of [q.q, q.e, q.ea, ...(q.es || []), ...(q.c || []).map(c => c[1]), q.a, q.d]) {
      if (typeof s !== 'string') continue;
      for (const t of EN.tokenize(s)) if (t.k === 'm' && !seen.has(t.v)) { seen.add(t.v); n++; try { katex.renderToString(t.v, { throwOnError: true, strict: 'ignore' }); } catch (e) { throw new Error(q.i + ' ' + t.v.slice(0, 50) + ' ' + e.message); } }
      ok(!/\[\[(?!u:|blank:|mark:)/.test(s), q.i + ' unknown markup');
    }
  } finally { console.warn = log; }
  ok(n > 10000, 'fragments ' + n);
});

const SRC = process.env.MANABI_SRC || '/tmp/claude-0/-home-user/9cf827b1-24df-56d4-a31b-c782467d7b1d/scratchpad/qd';
if (fs.existsSync(path.join(SRC, 'data'))) test('same source → byte-identical output (twice) and equals the committed data', () => {
  const a = fs.mkdtempSync(path.join(os.tmpdir(), 'mn-a-')), b = fs.mkdtempSync(path.join(os.tmpdir(), 'mn-b-'));
  B.main({ src: SRC, out: path.relative(ROOT, a), quiet: true }); B.main({ src: SRC, out: path.relative(ROOT, b), quiet: true });
  const walk = d => fs.readdirSync(d, { withFileTypes: true }).flatMap(e => e.isDirectory() ? walk(path.join(d, e.name)).map(f => e.name + '/' + f) : [e.name]);
  const fa = walk(a).sort(); eq(fa.join(), walk(b).sort().join());
  for (const f of fa) { eq(fs.readFileSync(path.join(a, f), 'utf8') === fs.readFileSync(path.join(b, f), 'utf8'), true, f); eq(fs.readFileSync(path.join(a, f), 'utf8') === fs.readFileSync(path.join(DATA, f), 'utf8'), true, 'committed ' + f); }
});
run('manabi-build');
