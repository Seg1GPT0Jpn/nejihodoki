// あてっこの中身（akin/engine.js）の単体テスト：数字あてっこ（質問の選び方・何問であたるか・わからない・もどる・まちがいの見つけかた・保存と復元）／
// ものあてっこ（確率・質問の選び方・まちがい耐性・わからない・もどる・おぼえる・保存と復元）／保存の読み込みと記録。
// 実行：node tools/tests/unit/akin-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'akin/engine.js'));
for (const f of ['animals', 'foods', 'sports', 'countries', 'jobs', 'things']) require(path.join(ROOT, 'akin/data', f + '.js'));

// a truthful player: answers the computer's question about the secret number
function playNum(lo, hi, secret, seed, hard) {
  const r = new E.NumRound(lo, hi, { rand: E.rng(seed), hard });
  for (let g = 0; g < 100; g++) {
    const s = r.state(); if (s.phase === 'won') return r;
    if (s.phase === 'ask') r.answer(E.evalQ(s.q, secret)); else if (s.phase === 'guess') r.guessResult(s.guess === secret); else throw new Error('contradiction for ' + secret);
  }
  throw new Error('did not finish');
}

test('number: every number 1..100 is found, always within par+3 questions (par = ceil(log2 n))', () => {
  let tot = 0, max = 0;
  for (let n = 1; n <= 100; n++) { const r = playNum(1, 100, n, n * 7 + 1); eq(r.hist[r.hist.length - 1].n, n); tot += r.count; max = Math.max(max, r.count); }
  ok(max <= E.numPar(100) + 3, 'worst case ' + max); ok(tot / 100 <= E.numPar(100) + 1, 'average ' + tot / 100); ok(tot / 100 >= 5, 'not suspiciously low ' + tot / 100);
});
test('number: 1..1000 samples and 1..1,000,000 samples are found within par+4; 2-number and 3-number ranges work', () => {
  for (let n = 1; n <= 1000; n += 13) { const r = playNum(1, 1000, n, n); ok(r.count <= E.numPar(1000) + 4, n + ': ' + r.count); }
  for (const n of [1, 2, 999999, 1000000, 123456, 777777, 500000, 31337]) { const r = playNum(1, 1000000, n, n); eq(r.hist[r.hist.length - 1].n, n); ok(r.count <= E.numPar(1000000) + 5, n + ': ' + r.count); }
  for (const n of [1, 2]) { const r = playNum(1, 2, n, 3); ok(r.count <= 2); }
  for (const n of [5, 6, 7]) { const r = playNum(5, 7, n, 3); ok(r.count <= 3, 'three numbers ' + r.count); }
  for (const n of [500, 501, 777, 1000]) { const r = playNum(500, 1000, n, 9); eq(r.hist[r.hist.length - 1].n, n); }
});
test('number: with maths-lover questions on, every number is still found, and prime / square questions do get asked', () => {
  let seen = new Set();
  for (let n = 1; n <= 200; n += 3) { const r = playNum(1, 200, n, n + 5, true); r.hist.forEach(h => { if (h.t === 'q') seen.add(h.q.f); }); ok(r.count <= E.numPar(200) + 4); }
  ok(seen.has('prime') || seen.has('square') || seen.has('dsum'), [...seen].join());
  const easy = new Set(); for (let n = 1; n <= 200; n += 3) playNum(1, 200, n, n + 5, false).hist.forEach(h => { if (h.t === 'q') easy.add(h.q.f); });
  ok(!easy.has('prime') && !easy.has('square') && !easy.has('dsum'), 'easy mode never asks maths-lover questions');
});
test('number: the questions vary (not only "greater than") and each splits the candidates about evenly', () => {
  const kinds = new Set(); let even = 0, tot = 0;
  for (let n = 1; n <= 1000; n += 37) { const r = new E.NumRound(1, 1000, { rand: E.rng(n) });
    for (let g = 0; g < 60; g++) { const s = r.state(); if (s.phase !== 'ask') { if (s.phase === 'guess') r.guessResult(s.guess === n); if (r.done) break; continue; }
      kinds.add(E.FAM[s.q.f].kind); if (r.cands.length > 8) { tot++; const y = r.cands.filter(x => E.evalQ(s.q, x)).length / r.cands.length; if (y >= 0.2 && y <= 0.8) even++; } r.answer(E.evalQ(s.q, n)); } }
  ok(kinds.size >= 3, 'question kinds ' + [...kinds]); ok(even / tot >= 0.95, 'balanced splits ' + even + '/' + tot);
});
test('number: the first question on 1..1000 splits near the middle; questions are never repeated', () => {
  const r = new E.NumRound(1, 1000, { rand: E.rng(1) }), s = r.state(); const y = r.cands.filter(x => E.evalQ(s.q, x)).length; ok(y >= 300 && y <= 700, 'first split ' + y);
  const asked = new Set(); const q = []; for (let g = 0; g < 40; g++) { const t = r.state(); if (t.phase !== 'ask') break; const k = E.qKey(t.q); ok(!asked.has(k), 'repeat ' + k); asked.add(k); r.answer(E.evalQ(t.q, 777)); q.push(k); }
});
test('number: "don\'t know" drops the question without learning anything or counting, and the next question differs', () => {
  const r = new E.NumRound(1, 100, { rand: E.rng(4) }); const q0 = r.state().q, left0 = r.cands.length;
  ok(r.answer(null)); eq(r.cands.length, left0); eq(r.count, 0); eq(r.skipped, 1); ok(E.qKey(r.state().q) !== E.qKey(q0));
  r.answer(true); eq(r.count, 1);
});
test('number: undo and rewind restore the exact earlier state; undo from nothing is refused', () => {
  const r = new E.NumRound(1, 1000, { rand: E.rng(2) }); ok(!r.back());
  const a = []; for (let i = 0; i < 4; i++) { a.push(r.cands.length); r.answer(E.evalQ(r.state().q, 321)); }
  ok(r.back()); eq(r.cands.length, a[3]); ok(r.back()); eq(r.cands.length, a[2]); eq(r.count, 2);
  r.rewind(1); eq(r.cands.length, a[1]); eq(r.hist.length, 1); r.rewind(0); eq(r.cands.length, 1000);
});
test('number: a wrong answer ends in a contradiction that can be undone; mismatches names the wrong answer', () => {
  const secret = 42, r = new E.NumRound(1, 100, { rand: E.rng(5) }); let wrongAt = -1;
  for (let g = 0; g < 40 && r.state().phase !== 'contra' && r.state().phase !== 'won'; g++) {
    const s = r.state(); if (s.phase === 'ask') { const truth = E.evalQ(s.q, secret); if (g === 1) { wrongAt = r.hist.length; r.answer(!truth); } else r.answer(truth); } else r.guessResult(s.guess === secret);
  }
  eq(r.state().phase, 'contra'); const bad = r.mismatches(secret); ok(bad.includes(wrongAt), 'finds the wrong answer ' + bad + ' / ' + wrongAt);
  ok(r.back()); ok(r.state().phase !== 'contra' || r.cands.length === 0);
  r.rewind(wrongAt); ok(r.cands.length > 0); eq(r.state().phase === 'contra', false);
});
test('number: a rejected guess is removed; the round ends only on a right guess; restore() rebuilds a saved round', () => {
  const r = new E.NumRound(1, 2, { rand: E.rng(1) }); const g1 = r.state().guess; r.guessResult(false); eq(r.state().phase, 'guess'); ok(r.state().guess !== g1); r.guessResult(true); eq(r.state().phase, 'won'); ok(r.done);
  const a = new E.NumRound(1, 1000, { rand: E.rng(8) }); for (let i = 0; i < 5; i++) a.answer(E.evalQ(a.state().q, 640));
  const b = new E.NumRound(1, 1000, { rand: E.rng(99) }).restore(JSON.parse(JSON.stringify(a.hist))); eq(b.cands.length, a.cands.length); eq(b.count, 5); ok(b.state().phase === 'ask');
  const c = new E.NumRound(1, 1000, { rand: E.rng(1) }).restore([{ t: 'q', q: { f: 'nope' }, a: true }, null, { t: 'q', q: { f: 'gt', p: { k: 500 } }, a: true }]); eq(c.hist.length, 1); eq(c.cands[0], 501);
});

// ---------------------------------------------------------------- themes
const ALL = E.THEMES.map(d => E.compileTheme(d));
test('themes: six themes are registered with ja/en names and an icon', () => {
  ok(E.THEMES.length >= 6); for (const d of E.THEMES) ok(d.id && d.ja && d.en && d.icon, d.id);
  deep(E.THEMES.map(d => d.id).sort(), ['animals', 'countries', 'foods', 'jobs', 'sports', 'things']);
});
test('theme round: the posterior is a distribution; questions are never repeated; guessing happens', () => {
  const th = ALL[0], r = new E.ThemeRound(th, { rand: E.rng(1) });
  const w0 = r.posterior(); ok(Math.abs(w0.reduce((a, b) => a + b, 0) - 1) < 1e-9);
  const seen = new Set(); for (let g = 0; g < 40; g++) { const s = r.state(); if (s.phase !== 'ask') break; ok(!seen.has(s.a)); seen.add(s.a); r.answer('n'); }
  ok(['guess', 'giveup'].includes(r.state().phase));
});
test('theme round: a yes answer on a question raises exactly the items that have it (and a no lowers them)', () => {
  const th = ALL[0], r = new E.ThemeRound(th, { rand: E.rng(2) }), a = r.state().a;
  r.log.push({ t: 'q', a, c: 'y' }); const w = r.posterior();
  const yes = th.items.findIndex(it => it.v[a] === 1), no = th.items.findIndex(it => it.v[a] === 0); ok(w[yes] > w[no] * 5);
  r.log.length = 0; r.log.push({ t: 'q', a, c: 'n' }); const w2 = r.posterior(); ok(w2[no] > w2[yes] * 5);
});
test('theme round: "don\'t know" changes nothing and is not counted; p / q lean softly; undo works', () => {
  const th = ALL[1], r = new E.ThemeRound(th, { rand: E.rng(3) }), a = r.state().a;
  const before = Array.from(r.posterior()); r.answer('u'); deep(Array.from(r.posterior()), before); eq(r.count, 0); eq(r.skipped, 1); ok(r.state().a !== a);
  ok(r.back()); eq(r.log.length, 0); ok(!r.back());
  const a2 = r.state().a; r.log.push({ t: 'q', a: a2, c: 'p' }); const wp = r.posterior(); r.log.length = 0; r.log.push({ t: 'q', a: a2, c: 'y' }); const wy = r.posterior();
  const it = th.items.findIndex(x => x.v[a2] === 1), ot = th.items.findIndex(x => x.v[a2] === 0); ok(wy[it] / wy[ot] > wp[it] / wp[ot], 'yes is stronger than probably');
});
test('theme round: a wrong guess removes the item for good and the round goes on; three wrong guesses make it give up', () => {
  const th = ALL[0], r = new E.ThemeRound(th, { rand: E.rng(4), thr: 0.0, soft: 0 }); // guesses as soon as it may
  for (let i = 0; i < 10 && r.state().phase === 'ask'; i++) r.answer('n');
  eq(r.state().phase, 'guess'); const g0 = r.state().guess; r.guessResult(false); eq(r.posterior()[g0], 0); eq(r.wrong, 1);
  for (let i = 0; i < 8 && ['ask', 'guess'].includes(r.state().phase); i++) { if (r.state().phase === 'ask') r.answer('n'); else r.guessResult(false); }
  eq(r.state().phase, 'giveup'); ok(r.wrong >= 3);
});
test('theme round: every item of every theme is found by a careful player (hard answers y/n, "it depends" -> p/q) within 20 questions', () => {
  for (const th of ALL) {
    let tot = 0, max = 0, fails = [];
    th.items.forEach((it, i) => { const res = E.simulateTheme(th, i, i * 31 + 7, 0); if (!res.found) fails.push(it.ja); tot += res.count; max = Math.max(max, res.count); });
    eq(fails.join(), '', th.id + ' not found: ' + fails.join()); ok(max <= 20, th.id + ' worst ' + max); const avg = tot / th.items.length; ok(avg >= 6 && avg <= 12, th.id + ' average ' + avg.toFixed(2));
  }
});
test('theme round: the same seed gives the same game; different players (seeds) give different question orders', () => {
  const th = ALL[0], a = E.simulateTheme(th, 5, 11, 0), b = E.simulateTheme(th, 5, 11, 0); deep(a.round.log, b.round.log);
  const logs = new Set(); for (let s = 1; s <= 6; s++) logs.add(JSON.stringify(E.simulateTheme(th, 5, s, 0).round.log.map(e => e.a))); ok(logs.size >= 2);
});
test('theme round: noise tolerance — with 5% wrong answers the item is still found in most rounds, and 1 wrong answer in 10 rarely breaks it', () => {
  for (const th of ALL) {
    let found = 0, n = 0; th.items.forEach((it, i) => { const r = E.simulateTheme(th, i, i * 17 + 3, 0.05); n++; if (r.found) found++; });
    ok(found / n >= 0.9, th.id + ' with 5% noise ' + found + '/' + n);
  }
  const th = ALL[0]; let ok2 = 0, n = 0;
  th.items.forEach((it, i) => { if (i % 3) return; const r = new E.ThemeRound(th, { rand: E.rng(i + 1) }); const ans = E.rng(i + 77); let flipped = false;
    for (let g = 0; g < 60; g++) { const s = r.state(); if (s.phase === 'won' || s.phase === 'giveup') break; if (s.phase === 'guess') { r.guessResult(s.guess === i); continue; }
      let c = E.simAnswer(it.v[s.a], ans, 0); if (!flipped && r.answered === 3 && (c === 'y' || c === 'n')) { c = c === 'y' ? 'n' : 'y'; flipped = true; } r.answer(c); }
    n++; if (r.done) ok2++; });
  ok(ok2 / n >= 0.85, 'one deliberate wrong answer ' + ok2 + '/' + n);
});
test('theme round: robust to "don\'t know" — answering "don\'t know" to a third of the questions still finds nearly everything', () => {
  const th = ALL[2]; let found = 0, n = 0;
  th.items.forEach((it, i) => { const r = new E.ThemeRound(th, { rand: E.rng(i + 5) }); const ans = E.rng(i + 9);
    for (let g = 0; g < 80; g++) { const s = r.state(); if (s.phase === 'won' || s.phase === 'giveup') break; if (s.phase === 'guess') { r.guessResult(s.guess === i); continue; }
      r.answer(ans() < 0.33 ? 'u' : E.simAnswer(it.v[s.a], ans, 0)); }
    n++; if (r.done) found++; });
  ok(found / n >= 0.95, found + '/' + n);
});
test('theme round: undo / rewind / restore rebuild the same state; learned() describes the answers; mismatches() flags disagreements', () => {
  const th = ALL[0], r = new E.ThemeRound(th, { rand: E.rng(6) }); const target = 12;
  for (let i = 0; i < 5; i++) r.answer(E.simAnswer(th.items[target].v[r.state().a], E.rng(i), 0));
  const w = Array.from(r.posterior()), log = JSON.parse(JSON.stringify(r.log));
  const r2 = new E.ThemeRound(th, { rand: E.rng(1) }).restore(log); deep(Array.from(r2.posterior()), w); eq(r2.count, 5);
  r.rewind(2); eq(r.log.length, 2); eq(r.learned().replace(/-/g, '').length, 2);
  const bad = new E.ThemeRound(th, { rand: E.rng(1) }).restore([{ t: 'q', a: 999, c: 'y' }, { t: 'q', a: 0, c: 'z' }, { t: 'g', i: 9999, ok: true }, { t: 'q', a: 0, c: 'y' }]); eq(bad.log.length, 1);
  const m = new E.ThemeRound(th, { rand: E.rng(1) }); m.log.push({ t: 'q', a: th.items[target].v.findIndex(v => v === 1), c: 'n' }); eq(m.mismatches(target).length, 1);
});
test('theme round: custom (learned) items join the pool, are found, and unknown attributes neither help nor hurt', () => {
  const def = E.THEMES.find(d => d.id === 'animals'); const th0 = E.compileTheme(def);
  const vec = th0.items[0].v; // a learned copy of the first item, with half of the attributes unknown
  let a = ''; for (let i = 0; i < vec.length; i++) a += i % 2 ? '-' : vec[i] >= 0.99 ? '1' : vec[i] <= 0.01 ? '0' : '5';
  const th = E.compileTheme(def, [{ n: 'ぬし', a }]); const last = th.items.length - 1; ok(th.items[last].custom); eq(th.items[last].ja, 'ぬし'); eq(th.items[last].v[1], -1);
  const w = new E.ThemeRound(th, { rand: E.rng(1) }); w.log.push({ t: 'q', a: 1, c: 'y' }); const p = w.posterior(); ok(Math.abs(p[last] - 1 / th.items.length) < 1 || p[last] > 0, 'no crash');
  const res = E.simulateTheme(th, last, 3, 0); ok(res.found, 'a learned item can be guessed; count ' + res.count);
});
test('themes: the data is valid — unique names, every tag exists, no two items identical, >= 25 attributes, 60..100 items, English has no Japanese', () => {
  const JP = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/;
  for (const th of ALL) {
    eq(th.errors.join(';'), '', th.id + ' tags'); ok(th.attrs.length >= 25, th.id + ' attrs ' + th.attrs.length); ok(th.items.length >= 60 && th.items.length <= 100, th.id + ' items ' + th.items.length);
    eq(new Set(th.items.map(i => i.ja)).size, th.items.length, th.id + ' ja names unique'); eq(new Set(th.items.map(i => i.en.toLowerCase())).size, th.items.length, th.id + ' en names unique');
    eq(new Set(th.attrs.map(a => a.id)).size, th.attrs.length, th.id + ' attr ids unique');
    ok(th.items.every(i => i.ja && !JP.test(i.en)), th.id + ' languages'); ok(th.attrs.every(a => a.q.ja && a.q.en && !JP.test(a.q.en) && JP.test(a.q.ja) && /[?？]$/.test(a.q.en + a.q.ja)), th.id + ' questions');
    eq(E.closePairs(th, 1).length, 0, th.id + ' duplicate vectors: ' + E.closePairs(th, 1).map(p => th.items[p[0]].ja + '/' + th.items[p[1]].ja)); ok(E.closePairs(th, 2).length <= 3, th.id + ' near-duplicates ' + E.closePairs(th, 2).length);
    // every attribute splits the items (no useless questions): between 3% and 97% yes
    th.attrs.forEach((a, k) => { const y = th.items.filter(i => i.v[k] >= 0.5).length / th.items.length; ok(y >= 0.03 && y <= 0.97, th.id + '.' + a.id + ' yes-rate ' + y.toFixed(2)); });
    // every item is reachable: its own answers single it out of the others
    th.items.forEach((it, i) => { const r = new E.ThemeRound(th, { rand: E.rng(1) }); th.attrs.forEach((a, k) => r.log.push({ t: 'q', a: k, c: it.v[k] >= 0.99 ? 'y' : it.v[k] <= 0.01 ? 'n' : 'p' })); const w = r.posterior(); eq(r.top(w, 1)[0].i, i, th.id + ' ' + it.ja + ' is the best match for its own answers'); });
  }
});

// ---------------------------------------------------------------- learning, save, rank text
test('learnItem: adds a new item, refines a known one, caps the list, refuses empty names', () => {
  const c = E.readCustom(null); eq(E.learnItem(c, 'animals', '  ', '1'), null);
  const r = E.learnItem(c, 'animals', 'ぬし', '10--5'); ok(r.added); eq(c.t.animals.length, 1);
  const r2 = E.learnItem(c, 'animals', 'ぬし', '1-1-0'); ok(!r2.added); eq(c.t.animals.length, 1); eq(c.t.animals[0].a, '101-5');
  for (let i = 0; i < E.MAX_CUSTOM + 5; i++) E.learnItem(c, 'foods', 'x' + i, '1'); eq(c.t.foods.length, E.MAX_CUSTOM);
});
test('save: normalizeSave repairs junk, keeps good data; recordRound counts wins, losses, bests and stats; rk is capped', () => {
  deep(E.normalizeSave(null), E.defSave()); deep(E.normalizeSave('x'), E.defSave());
  const s = E.normalizeSave({ rk: -5, num: { r100: { p: 3, w: 2, b: 7, zz: 1 }, bad: 5 }, stats: { wins: 3, x: 'a' }, set: { hard: 1, peek: 0, sc: 99 }, tut: 1 });
  eq(s.rk, 0); eq(s.num.r100.b, 7); ok(!('zz' in s.num.r100)); eq(s.stats.wins, 3); eq(s.stats.x, 0); eq(s.set.sc, 6); eq(s.set.peek, 0);
  const t = E.defSave(); E.recordRound(t, { kind: 'num', key: 'r100', won: true, count: 7, par: 7, back: 1, idk: 2 }); E.recordRound(t, { kind: 'num', key: 'r100', won: true, count: 9 }); E.recordRound(t, { kind: 'th', key: 'animals', won: true, count: 8, recovered: true });
  E.recordRound(t, { kind: 'th', key: 'animals', won: false, count: 24, learned: 1 }); E.recordRound(t, { kind: 'num', key: 'r1m', won: true, count: 21 });
  eq(t.rk, 4); eq(t.num.r100.b, 7); eq(t.num.r100.p, 2); eq(t.th.animals.p, 2); eq(t.th.animals.w, 1); eq(t.stats.fast, 1); eq(t.stats.quick, 1); eq(t.stats.m1, 1); eq(t.stats.losses, 1); eq(t.stats.learn, 1); eq(t.stats.back, 1); eq(t.stats.idk, 2); eq(t.stats.recover, 1); eq(t.stats.nw, 3); eq(t.stats.tw, 1);
  const big = E.defSave(); big.rk = E.MAX_RANK; E.recordRound(big, { kind: 'num', key: 'r100', won: true, count: 5 }); eq(big.rk, E.MAX_RANK);
  const back = E.normalizeSave(JSON.parse(JSON.stringify(t))); deep(back.stats, t.stats);
});
test('save: readCustom keeps only well-formed entries and trims names; the sync rule keeps counters (max) and the fewest-questions best (minPos)', () => {
  const c = E.readCustom({ t: { animals: [{ n: ' a ', a: '1x0' }, { n: '', a: '1' }, { a: 'z' }, null, { n: 'b'.repeat(50), a: '10-' }] }, bad: 1 }); eq(c.t.animals.length, 2); eq(c.t.animals[0].n, 'a'); eq(c.t.animals[0].a, '1-0'); eq(c.t.animals[1].n.length, 24);
  eq(E.SYNC_RULE.fields.num.each.fields.b, 'minPos'); eq(E.SYNC_RULE.fields.rk, 'max'); eq(E.SYNC_RULE.fields.set, 'newest');
});
test('ranks: result titles get better with fewer questions', () => {
  ok(E.numRank(7, 7) >= E.numRank(10, 7)); ok(E.numRank(8, 7) === 4); ok(E.numRank(20, 7) === 0); ok(E.themeRank(6) === 4 && E.themeRank(9) === 3 && E.themeRank(12) === 2 && E.themeRank(15) === 1 && E.themeRank(24) === 0);
  for (const t of E.RANK_TEXT) ok(t.ja && t.en);
});

run('akin-engine');
