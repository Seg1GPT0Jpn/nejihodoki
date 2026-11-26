// hop/gen.js（きょうのステージ）と hop/editor.js（合言葉）のテスト：どの日付でも同じ端末で同じステージ・5つのメダル・始まりとゴール、
// 使う部品（チャンク）はぜんぶ「1つだけでクリアできる」と証明ずみ（hop/genproofs.js を再生）、日付のステージを検査（物理の届く範囲）、
// 合言葉の符号化・読み込み・壊れた合言葉。
// 実行：node tools/tests/unit/hop-gen.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'hop/engine.js'));
const LV = require(path.join(ROOT, 'hop/levels.js'));
const V = require(path.join(ROOT, 'hop/validate.js'));
const G = require(path.join(ROOT, 'hop/gen.js'));
const ED = require(path.join(ROOT, 'hop/editor.js'));
const { P } = require(path.join(ROOT, 'hop/genproofs.js'));

test('every chunk the daily generator can use has a proof: start + chunk + plain + goal is finished by the recorded inputs', () => {
  for (const n of G.pool()) {
    ok(LV.CHUNKS[n], n + ' exists'); ok(P[n], n + ' has a proof');
    const L = E.parse(LV.assemble({ id: 'C-' + n, theme: 'meadow', parts: ['start2', n, 'plain', 'goal'] }));
    ok(E.runReplay(L, E.unrle(P[n])).res, n + ' replay reaches the goal');
  }
});

test('daily levels: same date = same level, different dates differ, all six themes appear, 5 medals, valid shape', () => {
  const themes = new Set(), sigs = new Set();
  for (let d = 20261101; d < 20261201; d++) {
    const a = G.make(d), b = G.make(d); deep(a.rows, b.rows, 'deterministic ' + d); themes.add(a.theme); sigs.add(a.rows.join('').length + a.theme + a.parts.join());
    const r = V.validate(a, { medals: 5, fast: true }); eq(r.errors.join('; '), '', d + ' static');
    eq(a.rows.length, 13); ok(a.W >= 150, 'long enough ' + a.W); eq(E.parse(a).medals.length, 5);
  }
  eq(themes.size, 6); ok(sigs.size >= 25, 'variety ' + sigs.size);
  ok(G.make(20261126).id === 'D20261126' && G.make(20261126, 1).rows.join() !== G.make(20261126).rows.join(), 'a salt gives another level');
});

test('daily levels: the physics reach analysis finds the goal and all five medals (12 dates)', () => {
  for (let d = 20261201; d < 20261213; d++) { const r = V.validate(G.make(d), { medals: 5 }); eq(r.errors.join('; '), '', 'day ' + d); }
});

test('daily levels: a real solver finishes a few of them (HOP_SLOW=1 for 6 dates, otherwise 1)', () => {
  const S = require(path.join(ROOT, 'tools/hop-solve.js')); const days = process.env.HOP_SLOW ? [20261126, 20261201, 20261210, 20261220, 20270105, 20270214] : [20261126];
  for (const d of days) { const L = E.parse(G.make(d)); let r = S.solve(L, { beam: 260 }); if (!r) r = S.solve(L, { beam: 700 }); ok(r && S.verify(L, r.inputs).res, 'solver on ' + d); }
});

test('editor codes: round trip, bad codes are refused', () => {
  const d = LV.get('2-2'); const code = ED.encode(d); ok(code.startsWith('HP1:') && code.length < 1200, code.length + ' chars');
  const b = ED.decode(code); deep(b.rows, d.rows); eq(b.theme, d.theme); eq(b.gear, 'cape');
  for (const bad of ['', 'HP1:', 'HP1:9:0:abc', 'HP2:0:0:' + '_20|'.repeat(13), 'HP1:0:0:' + '_20|'.repeat(12), 'HP1:0:0:' + '_20|'.repeat(12) + '_19', 'HP1:0:0:' + 'Z20|'.repeat(13), 'HP1:0:0:' + '_999|'.repeat(13), null, 5]) eq(ED.decode(bad), null, String(bad).slice(0, 20));
  const blank = { theme: 'snow', gear: 'ribbon', rows: ED.blank(40) }; const c2 = ED.encode(blank); deep(ED.decode(c2).rows, blank.rows);
  // a blank level has a start and a goal and is passable
  const r = V.validate(ED.decode(c2), { medals: null }); eq(r.errors.join('; '), '');
  // a level with no goal is refused by the validator
  const ng = ED.blank(40).map(x => x.replace('G', ' ')); ok(V.validate({ id: 'ED', theme: 'meadow', rows: ng }, { medals: null }).errors.some(e => /goal/.test(e)));
});

run('hop-gen');
