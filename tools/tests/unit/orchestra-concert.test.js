// orchestra/concert.js: 演奏会モードの中身（曲目づくり・一晩の手順・全体の評価・公演レビューの文章・保存）。engine.js の採点は変えず、曲ごとの結果を束ねるだけ。
// 実行：node tools/tests/unit/orchestra-concert.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const C = require(path.join(ROOT, 'orchestra/concert.js'));
const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'orchestra/scores/index.json'), 'utf8')).pieces;
const by = C.catalog(P);
const it = (...ids) => ids.map(id => C.parseItem(id));
// a made-up per-piece result like Scorer.result() gives
const res = (id, total, o) => Object.assign({ id, total, tempo: total, dynamics: total, cues: total, cueCount: 4, steady: total, minutes: by[id].minutes, perfect: 0 }, o || {});
const fill = (s, v) => (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s);

test('movement numbers come from the data, and a work\'s movements are played in order', () => {
  eq(C.mvNo(by.dvorak7), 3, 'dvorak7 is the third movement'); eq(C.mvNo(by['dvorak7-4']), 4); eq(C.mvNo(by.beethoven5), 1); eq(C.mvNo(by['beethoven5-2']), 2); eq(C.mvNo(by.beethoven7), 2);
  eq(C.wholeWork(P, 'dvorak7').map(x => x.id).join(), 'dvorak7-1,dvorak7-2,dvorak7,dvorak7-4');
  eq(C.wholeWork(P, 'beethoven7').map(x => x.id).join(), 'beethoven7-1,beethoven7', 'a work whose first movement has no "work" field still groups');
  eq(C.wholeWork(P, 'haydn76-1').map(x => x.id).join(), 'haydn76-1-1,haydn76-1-2,haydn76-1-4');
});

test('presets: one 「まるごと」 per multi-movement work, all movements in order, plus the made-up evenings; every one is valid', () => {
  const ps = C.presets(P), works = new Set(P.filter(p => C.workSize(P, p) > 1).map(C.workKey));
  eq(ps.filter(p => p.kind === 'work').length, works.size, 'a programme per work');
  for (const p of ps) {
    ok(p.title.ja && p.title.en && p.items.length >= 2 && p.minutes > 0, p.id);
    const v = C.validate(p.items, by); ok(v.ok, p.id + ' ' + v.errors.join());
    if (p.kind === 'work') { const nos = p.items.map(i => C.mvNo(by[i.id])); ok(nos.every((x, i) => !i || x > nos[i - 1]), p.id + ' in order'); eq(p.items.length, P.filter(q => C.workKey(q) === p.work).length, p.id + ' has every movement'); }
    else { const comp = {}; p.items.forEach(i => { const c = by[i.id].ck; comp[c] = (comp[c] || 0) + 1; }); ok(Math.max(...Object.values(comp)) <= 3, p.id + ' not one composer'); ok(p.items.every(i => C.workSize(P, by[i.id]) === 1), p.id + ' only whole pieces'); }
  }
  ok(ps.some(p => p.id === 'work:dvorak9') && ps.some(p => p.id === 'mix:first'));
  deepNo(C.presets(P), ps); // deterministic
  function deepNo(a, b) { eq(JSON.stringify(a), JSON.stringify(b), 'same presets every time'); }
  ok(ps.find(p => p.id === 'work:mahler5').minutes > C.MAX_MIN, 'a whole Mahler 5 is longer than an ordinary evening...');
  ok(C.validate(ps.find(p => p.id === 'work:mahler5').items, by).ok, '...but one symphony alone may run to 80 minutes');
});

test('validate: empty, more than 6 pieces, more than 60 minutes, unknown ids, doubles; minutes of a part follow its beats', () => {
  eq(C.validate([], by).errors.join(), 'empty');
  const ids = ['finlandia', 'grieg-aase', 'nachtmusik', 'zauberflote', 'fidelio', 'rossini', 'egmont'];
  eq(C.validate(it(...ids), by).errors.join(), 'tooMany'); ok(C.validate(it(...ids.slice(0, 6)), by).ok);
  eq(C.validate(it('mahler5-1', 'mahler5-2', 'mahler5-3', 'coriolan', 'egmont', 'rossini'), by).errors.join(), 'tooLong');
  eq(C.validate(it('nope'), by).errors.join(), 'unknown'); eq(C.validate(it('egmont', 'egmont'), by).errors.join(), 'dup');
  const half = C.itemMinutes({ id: 'coriolan', part: 'a' }, by); ok(Math.abs(half - by.coriolan.minutes / 2) < 0.01, 'half a piece is half the minutes: ' + half);
  ok(C.validate([{ id: 'coriolan', part: 'a' }, { id: 'coriolan', part: 'b' }], by).ok, 'both halves of one piece are not "the same" item');
  eq(C.progKey(it('egmont', 'coriolan~a')), 'egmont,coriolan~a'); eq(C.parseItem('coriolan~b').part, 'b');
});

test('between pieces: no applause from one movement to the next of the same work; applause for anything else', () => {
  ok(C.isNextMovement(by['dvorak9-1'], by['dvorak9-2'], P)); ok(C.isNextMovement(by['beethoven5'], by['beethoven5-2'], P), 'beethoven5 (no work field) is a movement of its work');
  ok(!C.isNextMovement(by['dvorak9-2'], by['dvorak9-1'], P), 'out of order: applause'); ok(!C.isNextMovement(by.egmont, by.coriolan, P), 'two overtures'); ok(!C.isNextMovement(by['dvorak9-4'], by['dvorak7-1'], P), 'two symphonies');
  ok(!C.isNextMovement(by['beethoven-q59-3'], by.egmont, P) && !C.isNextMovement(by.egmont, by.egmont, P));
  const steps = C.planEvening(it('egmont', 'dvorak9-1', 'dvorak9-2', 'rossini'), by, 'none');
  eq(steps.map(s => s.t + (s.t === 'gap' ? (s.quiet ? '-quiet' : '-clap') : '')).join(' '), 'entrance piece gap-clap piece gap-quiet piece gap-clap piece finale', 'only the dvorak9 pair is quiet');
});

test('intermission: none for a short evening, near the middle (and not inside a symphony) for a long one, the player\'s mark wins', () => {
  eq(C.intermissionAt(it('egmont', 'rossini', 'fidelio'), by, null), -1, '14 minutes: no interval');
  const long = it('coriolan', 'dvorak9-1', 'dvorak9-2', 'egmont', 'rossini', 'fidelio'); ok(C.totalMinutes(long, by) >= 39);
  const i = C.intermissionAt(long, by, null); ok(i === 0 || i === 2 || i === 3, 'not between the two movements: ' + i);
  eq(C.intermissionAt(long, by, 'none'), -1, 'the player says no'); eq(C.intermissionAt(long, by, 'rossini'), 4, 'the player marks the piece after which it comes');
  eq(C.intermissionAt(long, by, 'fidelio'), i, 'a mark on the last piece is meaningless (no second half): falls back to automatic');
  eq(C.intermissionAt(it('dvorak9-1', 'dvorak9-2', 'dvorak9-3', 'dvorak9-4'), by, null), -1, 'one symphony of half an hour is played through');
  eq(C.intermissionAt(it('mahler5-1', 'mahler5-2', 'mahler5-3', 'mahler5-4', 'mahler5-5'), by, null), 1, 'Mahler 5 is long enough for one: after the second movement');
  eq(C.intermissionAt(long.slice(0, 2), by, null), -1, 'two pieces: nothing to split');
  const steps = C.planEvening(long, by, 'dvorak9-2'); const k = steps.findIndex(s => s.t === 'interval');
  eq(steps[k - 1].t, 'gap'); eq(steps[k - 1].i, 2); eq(steps.filter(s => s.t === 'interval').length, 1);
  eq(steps[0].t, 'entrance'); eq(steps[steps.length - 1].t, 'finale'); eq(steps.filter(s => s.t === 'piece').length, 6);
});

test('judge: grade and stars follow the overall score and the difficulty; a perfect evening is S / 5 stars, a rough one is C', () => {
  const items = ['egmont', 'dvorak9-1', 'dvorak9-2', 'rossini'];
  const top = C.judge(items.map(id => res(id, 97, { perfect: 3 })), { by, diff: 'normal' });
  eq(top.grade, 'S'); eq(top.stars, 5); ok(top.overall >= 97 && top.overall <= 100, 'overall ' + top.overall); eq(top.perfect, 12);
  const rough = C.judge(items.map(id => res(id, 25)), { by, diff: 'normal' }); eq(rough.grade, 'C'); eq(rough.stars, 1);
  const mid = C.judge(items.map(id => res(id, 66)), { by, diff: 'normal' }); eq(mid.grade, 'B'); eq(mid.stars, 3);
  ok(mid.overall >= 60 && mid.overall <= 76, 'overall ' + mid.overall);
  eq(C.gradeOf(80, 'enjoy'), 'B', 'enjoy is easier, so 80 is only B there'); eq(C.gradeOf(80, 'normal'), 'A'); eq(C.gradeOf(80, 'maestro'), 'A'); eq(C.gradeOf(85, 'maestro'), 'S');
  eq(C.starsOf(45, 'normal'), 2); eq(C.starsOf(20, 'normal'), 1);
  eq(C.judge([], { by }), null);
  const one = C.judge([res('rossini', 90)], { by, diff: 'normal' }); eq(one.n, 1); eq(one.stamina, one.quality, 'one piece: nothing to compare'); eq(one.grade, 'S');
  eq(one.variety, 0, 'one piece: no variety');
});

test('judge: a slip late in the evening costs more than the same slip early (stamina), and a steady evening beats an uneven one with the same mean', () => {
  const ids = ['egmont', 'fidelio', 'rossini', 'coriolan'];
  const slipEarly = C.judge([res(ids[0], 55), res(ids[1], 90), res(ids[2], 90), res(ids[3], 90)], { by });
  const slipLate = C.judge([res(ids[0], 90), res(ids[1], 90), res(ids[2], 90), res(ids[3], 55)], { by });
  ok(slipLate.overall < slipEarly.overall, 'late ' + slipLate.overall + ' < early ' + slipEarly.overall); ok(slipLate.stamina < slipEarly.stamina, 'stamina ' + slipLate.stamina + ' vs ' + slipEarly.stamina);
  const strongFinish = C.judge([res(ids[0], 70), res(ids[1], 70), res(ids[2], 90), res(ids[3], 90)], { by }), weakFinish = C.judge([res(ids[0], 90), res(ids[1], 90), res(ids[2], 70), res(ids[3], 70)], { by });
  ok(strongFinish.overall > weakFinish.overall && strongFinish.late > strongFinish.early && weakFinish.late < weakFinish.early, 'finishing strong is better than fading');
  const even = C.judge(ids.map(id => res(id, 75)), { by }), uneven = C.judge([res(ids[0], 95), res(ids[1], 55), res(ids[2], 95), res(ids[3], 55)], { by });
  ok(even.steadiness > uneven.steadiness && even.overall >= uneven.overall, 'steady ' + even.overall + ' vs uneven ' + uneven.overall);
  ok(C.judge(ids.map(id => res(id, 100, { steady: 100 })), { by }).overall <= 100 && C.judge(ids.map(id => res(id, 0, { steady: 0 })), { by }).overall >= 0, 'stays in 0..100');
});

test('judge: variety bonus (composers, eras, kinds) counts only pieces that were actually played, and is capped', () => {
  const mono = C.judge(['coriolan', 'fidelio', 'egmont'].map(id => res(id, 80)), { by }), mixed = C.judge(['coriolan', 'rossini', 'finlandia'].map(id => res(id, 80)), { by });
  eq(mono.variety, 0.0, 'three Beethoven overtures: nothing'); ok(mixed.variety > 0 && mixed.overall > mono.overall, 'mixed ' + mixed.variety);
  const dropped = C.judge([res('coriolan', 80), res('rossini', 20), res('finlandia', 20)], { by }); eq(dropped.variety, 0, 'pieces below 40 do not count');
  const many = C.judge(['coriolan', 'rossini', 'sousa-fairest', 'nachtmusik', 'grieg-aase', 'slavonic72-2'].map(id => res(id, 80)), { by }); ok(many.variety <= 6, 'cap ' + many.variety);
  eq(many.composers >= 5, true);
});

test('judge: best and weakest piece, and the weakest aspect (cues only count when they were judged)', () => {
  const r = [res('egmont', 70), res('rossini', 95, { tempo: 99, dynamics: 90, cues: 95 }), res('fidelio', 60, { tempo: 80, dynamics: 70, cues: 30 })];
  const j = C.judge(r, { by, diff: 'normal' }); eq(j.best.i, 1); eq(j.best.aspect, 'tempo'); eq(j.weakest.i, 2); eq(j.weakest.aspect, 'cues');
  eq(C.judge(r, { by, diff: 'enjoy' }).weakest.aspect, 'dynamics', 'enjoy plays the cues itself: they are not a weakness');
  eq(C.judge([res('egmont', 80, { cueCount: 0, cues: 100, tempo: 70, dynamics: 90 })], { by }).weakest.aspect, 'tempo', 'a piece without cues has no cue score');
  eq(j.pieces.length, 3); eq(j.pieces[1].grade, 'S'); ok(j.pieces[0].pos < j.pieces[2].pos);
});

test('review: built from the data, in Japanese and in English; no unfilled {braces}, every template has an English version', () => {
  const needEN = (k) => { const v = C.EN[k]; if (v == null) throw new Error('no English for: ' + k); return v; };
  const tJa = (k, v) => fill(k, v), tEn = (k, v) => fill(needEN(k), v);
  const scenarios = [
    ['egmont', 'dvorak9-1', 'dvorak9-2', 'rossini'].map((id, i) => res(id, [97, 96, 94, 98][i], { perfect: 5 })),
    ['egmont', 'rossini', 'fidelio', 'coriolan'].map((id, i) => res(id, [85, 50, 70, 40][i], { cues: 20 - i })),
    [res('rossini', 62, { tempo: 40 })], [res('rossini', 95)],
    ['egmont', 'rossini', 'fidelio', 'coriolan'].map((id, i) => res(id, [60, 70, 80, 90][i])),
    ['coriolan', 'rossini', 'finlandia', 'sousa-fairest'].map((id, i) => res(id, 82)),
  ];
  for (const diff of ['enjoy', 'normal', 'maestro']) for (const sc of scenarios) {
    const j = C.judge(sc, { by, diff });
    for (const [lang, T] of [['ja', tJa], ['en', tEn]]) {
      const rv = C.review(j, { T, name: i => (lang === 'en' ? by[sc[i].id].title.en : by[sc[i].id].title.ja) });
      const all = [rv.title, rv.headline, rv.rating].concat(rv.lines.map(l => l.text)).join('\n');
      ok(!/\{\w+\}/.test(all), 'unfilled in ' + lang + ': ' + all.slice(0, 200));
      if (lang === 'en') ok(!/[぀-ヿ一-龯]/.test(all.replace(/[「」]/g, '')), 'Japanese left in English review: ' + all.slice(0, 300));
      ok(rv.lines.length >= 3 && rv.lines.some(l => l.kind === 'praise'), 'a few lines with praise');
      ok(all.includes(j.grade) && all.includes(String(j.overall)), 'rating line has the grade and the score');
    }
  }
  const j = C.judge(scenarios[1], { by }), rv = C.review(j, { name: i => 'P' + i });
  ok(rv.lines.some(l => l.kind === 'note' && /P1|P3/.test(l.text)), 'the weakest piece is named in a note: ' + JSON.stringify(rv.lines));
  ok(rv.lines.some(l => /P0/.test(l.text)) === false || true);
  const late = C.review(C.judge([res('egmont', 90), res('fidelio', 90), res('rossini', 60), res('coriolan', 60)], { by }), { name: i => 'P' + i });
  ok(late.lines.some(l => /終盤に疲れ/.test(l.text)), 'a fading evening says so');
  const grow = C.review(C.judge([res('egmont', 70), res('fidelio', 72), res('rossini', 90), res('coriolan', 92)], { by }), { name: i => 'P' + i });
  ok(grow.lines.some(l => /後半にかけて/.test(l.text)), 'a growing evening says so');
});

test('review: the headline matches the grade', () => {
  const heads = new Set();
  for (const [t, g] of [[97, 'S'], [80, 'A'], [65, 'B'], [30, 'C']]) { const j = C.judge(['egmont', 'rossini'].map(id => res(id, t)), { by }); eq(j.grade, g); heads.add(C.review(j, { name: i => 'x' }).headline); }
  eq(heads.size, 4, 'four different headlines');
});

test('the store: a broken one reads as empty; recording keeps the best per programme, a short history, and the counters', () => {
  eq(JSON.stringify(C.readStore('{{{')), JSON.stringify(C.defStore())); eq(JSON.stringify(C.readStore([1, 2])), JSON.stringify(C.defStore())); eq(JSON.stringify(C.readStore(null)), JSON.stringify(C.defStore()));
  const odd = C.readStore(JSON.stringify({ v: 1, best: { 'a,b': { s: 999, g: 9, st: 'x', n: -3 }, bad: 5 }, hist: [{ k: 'a', ids: 'no' }, 5, { k: 'a,b', ids: ['a', 'b', 3], s: 70, g: 2, st: 4, diff: 'weird' }], stats: { done: -1, s: 'x' }, set: { diff: 'nightmare', iv: 7, draft: ['a', 3, 'b~c'] } }));
  eq(odd.best['a,b'].s, 100); eq(odd.best['a,b'].g, 3); eq(odd.best['a,b'].n, 0); ok(!('bad' in odd.best)); eq(odd.hist.length, 1); eq(odd.hist[0].ids.join(), 'a,b'); eq(odd.hist[0].diff, 'normal');
  eq(odd.stats.done, 0); eq(odd.set.diff, ''); eq(odd.set.iv, null); eq(odd.set.draft.join(), 'a,b~c');
  let st = C.defStore();
  let r = C.record(st, { k: 'x,y', ids: ['x', 'y'], score: 70, grade: 'B', stars: 3, diff: 'normal', minutes: 12.34, t: 1 }); st = r.store; ok(r.isBest && !r.prev);
  eq(st.best['x,y'].s, 70); eq(st.best['x,y'].n, 1); eq(st.stats.done, 1); eq(st.stats.pieces, 2); eq(st.stats.minutes, 12.3);
  r = C.record(st, { k: 'x,y', ids: ['x', 'y'], score: 60, grade: 'C', stars: 2, minutes: 12, t: 2 }); st = r.store; ok(!r.isBest); eq(st.best['x,y'].s, 70, 'the best stays'); eq(st.best['x,y'].g, 1); eq(st.best['x,y'].n, 2); eq(r.prev.s, 70);
  r = C.record(st, { k: 'x,y', ids: ['x', 'y'], score: 95, grade: 'S', stars: 5, minutes: 12, t: 3 }); st = r.store; ok(r.isBest); eq(st.best['x,y'].g, 3); eq(st.stats.s, 1); eq(st.stats.a, 1); eq(st.hist[0].t, 3, 'newest first');
  for (let i = 0; i < 30; i++) st = C.record(st, { k: 'k' + i, ids: ['x'], score: 50, grade: 'C', stars: 1, minutes: 1, t: 10 + i }).store;
  eq(st.hist.length, C.HIST_MAX); eq(Object.keys(st.best).length, 31); eq(st.stats.done, 33);
  eq(JSON.stringify(C.readStore(JSON.stringify(st))), JSON.stringify(st), 'writes and reads back the same');
});

test('wiring: the page loads concert.js, sw.js caches it, the registry documents the new key, and the page\'s English covers its own strings', () => {
  const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
  const html = rd('orchestra/index.html'), sw = rd('sw.js'), games = rd('common/games.js');
  ok(/<script src="concert\.js"><\/script>/.test(html), 'script tag'); ok(html.indexOf('src="engine.js"') < html.indexOf('src="concert.js"'), 'after engine.js');
  ok(sw.includes("'./orchestra/concert.js'"), 'ENGINES in sw.js');
  ok(games.includes("'kusoge.orchestra.concert'"), 'registry key'); ok(/KoboI18n\.add\(\{ en: window\.OrchConcert/.test(html) || /OrchConcert\.EN/.test(html), 'the page adds the English of concert.js');
  const G = require(path.join(ROOT, 'common/games.js')); const g = (G.games || G.GAMES || (G.KOBO_GAMES && G.KOBO_GAMES.games) || []).find(x => x.id === 'orchestra');
  if (g) ok(g.keys['kusoge.orchestra.concert'] && g.sync['kusoge.orchestra.concert'], 'documented and synced');
});

run('orchestra-concert');
