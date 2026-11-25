// 自由ライセンス教材（青空文庫・Tatoeba CC0）とライセンス一覧の検査。実行：node tools/tests/unit/manabi-content.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const J = n => JSON.parse(fs.readFileSync(path.join(ROOT, 'manabi/content', n + '.json'), 'utf8'));
test('Aozora: only public-domain works (flag なし, died > 70 years ago), verbatim lines, evidence in text, one right choice', () => {
  const d = J('aozora'), year = 2026;
  eq(d.works.length, 3);
  for (const w of d.works) {
    eq(w.copyrightFlag, 'なし', w.id); ok(year - Number(w.died.slice(0, 4)) > 70, w.id + ' died ' + w.died); ok(/^https:\/\/www\.aozora\.gr\.jp\//.test(w.url), w.id);
    const text = w.lines.map(l => l[0]).join('');
    for (const q of w.qs) { ok(text.includes(q.ev), w.id + ' ev ' + q.ev); eq(q.c.filter(x => x === q.a).length, 1, q.q); ok(q.ev && (q.q.length > 3), q.q); eq(new Set(q.c).size, q.c.length); }
  }
});
test('Tatoeba subset: CC0 label, short ASCII sentences, no duplicates, ids, size modest', () => {
  const d = J('tatoeba-en'); eq(d.license, 'CC0 1.0'); ok(d.sentences.length >= 400);
  const seen = new Set();
  for (const [id, s, lv] of d.sentences) { ok(Number.isInteger(id) && id > 0); ok(/^[\x20-\x7e]+$/.test(s), s); const n = s.split(/\s+/).length; ok(n >= 5 && n <= 9, s); ok(!seen.has(s.toLowerCase())); seen.add(s.toLowerCase()); ok(lv >= 1 && lv <= 3); }
  ok(fs.statSync(path.join(ROOT, 'manabi/content/tatoeba-en.json')).size < 60000);
});
test('Licence list names every outside source with a licence', () => {
  const d = J('licenses'), ids = d.items.map(x => x.id);
  for (const k of ['tatoeba', 'aozora', 'naturalearth', 'katex', 'questions']) ok(ids.includes(k), k);
  for (const it of d.items) { ok(it.name && it.by && it.licence, it.id); if (it.url) ok(/^https:\/\//.test(it.url)); }
});
run();
