// manabi/dialogue.js：場面の検査（分かれ道・終わり・正解が1つ）、声の点数、取り込んだ台本の全場面の検査。
// 実行：node tools/tests/unit/manabi-dialogue.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
global.ManabiEngine = require(path.join(ROOT, 'manabi/engine.js'));
const D = require(path.join(ROOT, 'manabi/dialogue.js'));
const fx = JSON.parse(fs.readFileSync(path.join(ROOT, 'tools/tests/fixtures/manabi-dialogues-fixture.json'), 'utf8')).scenes;
const clone = o => JSON.parse(JSON.stringify(o));
test('the fixture scenes are valid; max player turns counted', () => { for (const s of fx) eq(D.validate(s).join(), '', s.id); eq(D.maxTurns(fx[0]), 3); });
test('validator catches: dangling next, cycle, unreachable node, two ok choices, no ok, missing fb, duplicate text, no end, too few turns', () => {
  const t = (f, re) => { const s = clone(fx[0]); f(s); const e = D.validate(s).join('; '); ok(re.test(e), re + ' not in: ' + e); };
  t(s => { s.nodes.n2.choices[0].next = 'zz'; }, /leads nowhere/);
  t(s => { s.nodes.n3.choices[0].next = 'n2'; s.nodes.n3.choices[1].next = 'n2'; }, /cycle/);
  t(s => { s.nodes.orphan = { say: 'x', next: 'n5' }; }, /unreachable/);
  t(s => { s.nodes.n2.choices[1].ok = true; }, /exactly one ok/);
  t(s => { delete s.nodes.n2.choices[0].ok; }, /exactly one ok/);
  t(s => { delete s.nodes.n2.choices[1].fb; }, /needs fb/);
  t(s => { s.nodes.n2.choices[1].text = s.nodes.n2.choices[0].text; }, /duplicate/);
  t(s => { delete s.nodes.n5.end; s.nodes.n5.next = 'n5'; }, /cycle|no end/);
  t(s => { s.nodes.n3 = { say: 'skip', next: 'n4' }; s.nodes.n4 = { say: 'skip', next: 'n5' }; }, /player turns/);
  t(s => { s.lang = 'fr'; }, /lang/);
});
test('speech score: exact, case/punctuation, near miss, wrong, extra words, Japanese', () => {
  eq(D.scoreSpeech('I would like a burger, please.', 'i would like a burger please'), 100);
  ok(D.scoreSpeech('I would like a burger, please.', 'I would like a burgers please') >= 90);
  ok(D.scoreSpeech('I would like a burger, please.', 'I would like a burger') >= 70);
  ok(D.scoreSpeech('I would like a burger, please.', 'where is the station') < 40);
  eq(D.scoreSpeech('Hello', ''), 0);
  ok(D.scoreSpeech('Water, please.', 'water please please please please') < 100);
  eq(D.scoreSpeech('山田と申します。', '山田と申します', 'ja'), 100); ok(D.scoreSpeech('山田と申します。', '山田と言います', 'ja') < 100); ok(D.scoreSpeech('山田と申します。', '田中です', 'ja') < 50);
  ok(D.PASS >= 60 && D.PASS <= 80);
});
const real = path.join(ROOT, 'manabi/content/dialogues.json');
if (fs.existsSync(real)) test('shipped dialogues: 40+ scenes, all valid, flagged AI-made, ids unique, all three English levels and Japanese scenes', () => {
  const d = JSON.parse(fs.readFileSync(real, 'utf8')), ids = new Set();
  ok(d.scenes.length >= 40, 'scenes ' + d.scenes.length); eq(d.ai, 1);
  for (const s of d.scenes) { ok(!ids.has(s.id)); ids.add(s.id); eq(D.validate(s).join('; '), '', s.id); eq(s.ai, 1); if (s.lang === 'en') ok(Object.values(s.nodes).filter(n => n.say).every(n => /^[\x20-\x7E’‘“”–—…]+$/.test(n.say)), s.id + ' non-ASCII english'); }
  for (const l of [1, 2, 3]) ok(d.scenes.filter(s => s.lang === 'en' && s.level === l).length >= 8, 'level ' + l);
  ok(d.scenes.filter(s => s.lang === 'ja').length >= 5);
});
run('manabi-dialogue');
