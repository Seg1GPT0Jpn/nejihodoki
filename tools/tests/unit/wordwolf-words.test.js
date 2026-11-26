// wordwolf/words.js の検査：ことばのペア（300以上・15ジャンル以上）の形・重複・含みあい・ヒントの漏れ・使えない語・むずかしさの段・1語15個以上のヒント。
// 実行：node tools/tests/unit/wordwolf-words.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'wordwolf/engine.js'));
const W = require(path.join(ROOT, 'wordwolf/words.js'));

test('the word data passes every validator (shape, no duplicates, no pair where one contains the other, hints do not leak in Japanese or English, no sensitive words)', () => {
  const bad = E.validate(W); ok(bad.length === 0, bad.slice(0, 8).join('\n'));
});
test('at least 300 pairs in at least 15 categories, every category has enough pairs to play, themes the brief asked for exist', () => {
  const ps = E.pairsOf(W); ok(ps.length >= 300, 'pairs ' + ps.length); ok(W.cats.length >= 15, 'cats');
  const per = {}; ps.forEach(p => { per[p.cat] = (per[p.cat] || 0) + 1; });
  ok(Object.keys(per).length >= 15, 'categories with pairs ' + Object.keys(per).length);
  for (const k of Object.keys(per)) ok(per[k] >= 8, 'category ' + W.cats[k].ja + ' has ' + per[k]);
  for (const c of W.cats) ok(c.ja && c.en && !/[぀-ヿ一-龯]/.test(c.en), 'category names');
  for (const id of ['food', 'animals', 'vehicles', 'school', 'sports', 'places', 'home', 'nature', 'jobs']) ok(W.cats.some(c => c.id === id), id);
});
test('three difficulty tiers all have plenty of pairs (similar pairs are harder)', () => {
  const ps = E.pairsOf(W), c = [0, 0, 0, 0]; ps.forEach(p => { c[p.lv]++; ok(p.lv >= 1 && p.lv <= 3); });
  for (const lv of [1, 2, 3]) ok(c[lv] >= 60, 'tier ' + lv + ' has ' + c[lv]);
  const avg = lv => { const a = ps.filter(p => p.lv === lv).map(p => p.sim); return a.reduce((x, y) => x + y, 0) / a.length; };
  ok(avg(1) < avg(2) && avg(2) < avg(3), 'similarity rises with the tier');
});
test('every word has at least 15 true-ish generic attribute hints (its own tags + the category-wide ones), each with a Japanese and an English sentence; the two words of a pair differ in at least 1 tag', () => {
  for (const p of E.pairsOf(W)) {
    for (const w of [p.a, p.b]) { ok(w.all.length >= 15, 'hints ' + p.id); ok(w.t.length >= 2, 'own tags ' + p.id); for (const t of w.all) ok(E.hintText(t, 'ja', W) && E.hintText(t, 'en', W), 'hint text'); }
    const sb = new Set(p.b.t), com = p.a.t.filter(t => sb.has(t)); ok(p.a.t.length + p.b.t.length - 2 * com.length >= 1, 'distinct ' + p.id);
  }
});
test('English glosses: no Japanese, 2-28 chars, never identical for the two words of a pair; topic prompts exist in both languages', () => {
  for (const p of E.pairsOf(W)) for (const w of [p.a, p.b]) { ok(!/[぀-ヿ一-龯]/.test(w.en), w.en); ok(w.en.length >= 2 && w.en.length <= 28); }
  ok(W.prompts.length >= 20); W.prompts.forEach(x => { ok(x[0] && x[1] && !/[぀-ヿ一-龯]/.test(x[1])); });
});
test('the validator really catches bad data (duplicates, containment, leaks, sensitive words, unknown tags, too few hints)', () => {
  const mk = pairs => Object.assign({}, W, { pairs });
  const base = W.pairs[0].slice();
  ok(E.validate(mk([base, base])).some(x => /duplicate/.test(x)), 'dup');
  const cont = base.slice(); cont[3] = cont[1] + 'ん'; ok(E.validate(mk([cont])).some(x => /contains/.test(x)), 'contains');
  const unk = base.slice(); unk[5] = '99999 0 1'; ok(E.validate(mk([unk])).some(x => /unknown tag/.test(x)), 'unknown tag');
  const sens = base.slice(); sens[1] = 'ビール'; ok(E.validate(mk([sens])).some(x => /sensitive/.test(x)), 'sensitive');
  const few = base.slice(); few[5] = '0'; ok(E.validate(mk([few])).some(x => /tag count/.test(x)), 'few tags');
  eq(E.validate(W).length, 0);
});
run('wordwolf-words');
