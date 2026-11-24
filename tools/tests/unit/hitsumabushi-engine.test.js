// hitsumabushi/engine.js の単体テスト：特別営業10日（条件・ねらい・★の基準）・ねらいの数え方・★・れんぞく・保存（kusoge.hitsumabushi.x）の読み込みと記録
// ページ側（注文づくり・採点・画面）は hitsumabushi-play.js で確かめる。ここでは engine.js がゲーム本体から使われていること（script と sw.js）も確かめる
// 実行：node tools/tests/unit/hitsumabushi-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run, readText } = require('./_kobo-env');
const E = require(path.join(ROOT, 'hitsumabushi/engine.js'));
const DISH = ['hitsu', 'don', 'shira', 'kimo', 'umaki'];
const REQ = ['tareMore', 'tareLess', 'well', 'noWasabi', 'noSansho', 'large', 'hurry'];

test('10 special days: unique ids and seeds, worlds ascend, goal kinds, rising stars', () => {
  eq(E.STAGES.length, 10); eq(E.N, 10);
  eq(new Set(E.STAGES.map(s => s.id)).size, 10); eq(new Set(E.STAGES.map(s => s.seed)).size, 10);
  E.STAGES.forEach((s, i) => {
    ok(s.name && s.desc, s.id + ' text'); ok(E.KINDS[s.kind], s.id + ' kind ' + s.kind);
    ok(s.stars.length === 3 && s.stars[0] > 0 && s.stars[1] > s.stars[0] && s.stars[2] > s.stars[1], s.id + ' stars ascend');
    ok([0, 1, 2].includes(s.world), s.id + ' world');
    if (i) ok(s.world >= E.STAGES[i - 1].world, 'worlds ascend');
    eq(E.info(i), s);
  });
  eq(E.info(10), null); eq(E.info(-1), null);
  for (const w of [0, 1, 2]) ok(E.STAGES.filter(s => s.world === w).length >= 3, 'each world has days');
  ok(new Set(E.STAGES.map(s => s.kind)).size >= 6, 'many kinds of goals');
});

test('every day is a valid shop: menu, strictness, dishes, themed requests', () => {
  E.STAGES.forEach((s, i) => {
    const u = E.setupOf(i);
    ok(u.menu.includes('hitsu') && u.menu.every(m => DISH.includes(m)), s.id + ' menu');
    ok(u.grills >= 1 && u.grills <= 3 && u.seats >= 2 && u.seats <= 5, s.id + ' grills/seats');
    ok(['B', 'C', 'A'].includes(u.strict), s.id + ' strict'); ok(u.rank >= 0 && u.rank <= 4, s.id + ' rank');
    ok(u.dur >= 120 && u.dur <= 240, s.id + ' duration');
    ok(u.coal === 0 || u.coal === 1, s.id + ' coal'); ok(u.look >= 0 && u.look <= 3, s.id + ' look');
    if (u.rush != null) ok(u.rush >= 0.5 && u.rush <= 1.3, s.id + ' rush');
    if (u.only) ok(u.only.length && u.only.every(d => u.menu.includes(d)), s.id + ' only is a subset of the menu');
    if (u.forceReq) ok(u.forceReq.every(r => REQ.includes(r)) && u.forceP > 0 && u.forceP <= 1, s.id + ' forced requests');
    if (u.sideP != null) ok(u.sideP > 0 && u.sideP <= 1 && (u.menu.includes('kimo') || u.menu.includes('umaki')), s.id + ' side chance needs a side dish');
    if (u.styleMin != null) ok(u.styleMin >= 1 && u.styleMin <= 3 && u.menu.includes('hitsu'), s.id + ' style');
  });
  // a copy: changing it never changes the day itself
  const a = E.setupOf(0); a.menu.push('x'); a.grills = 9; eq(E.setupOf(0).menu.length, E.STAGES[0].setup.menu.length); ok(E.setupOf(0).grills !== 9);
  eq(E.setupOf(99), null);
  // strictness never gets easier along the way
  const rk = { B: 0, C: 1, A: 2 };
  for (let i = 1; i < 10; i++) ok(rk[E.setupOf(i).strict] >= rk[E.setupOf(i - 1).strict], 'strict ascends');
});

test('metric for every kind (bad numbers count as 0)', () => {
  const st = { score: 812.9, served: 9, perfect: 4, good: 7, tips: 3200.5, angry: 1, refused: 2, streak: 5 };
  eq(E.metric('score', st), 812); eq(E.metric('served', st), 9); eq(E.metric('perfect', st), 4); eq(E.metric('good', st), 7);
  eq(E.metric('tips', st), 3200); eq(E.metric('streak', st), 5);
  eq(E.metric('clean', st), 3, 'served minus 2 per angry or sent-back');
  eq(E.metric('clean', { served: 2, angry: 5 }), 0, 'never below 0');
  for (const k of Object.keys(E.KINDS)) { eq(E.metric(k, null), 0); eq(E.metric(k, {}), 0); eq(E.metric(k, { score: NaN, served: -4, perfect: 'x', good: Infinity, tips: undefined, streak: -1 }) >= 0, true); }
  eq(E.metric('nope', st), 0);
});

test('stars: thresholds, never more than 3, nothing for a missing day', () => {
  E.STAGES.forEach((s, i) => {
    const [a, b, c] = s.stars;
    eq(E.starsFor(i, 0), 0); eq(E.starsFor(i, a - 1), 0); eq(E.starsFor(i, a), 1); eq(E.starsFor(i, b - 1), 1); eq(E.starsFor(i, b), 2); eq(E.starsFor(i, c), 3); eq(E.starsFor(i, c * 9), 3);
    eq(E.progress(i, 0), 0); eq(E.progress(i, c / 2), 0.5); eq(E.progress(i, c * 9), 1);
  });
  eq(E.starsFor(99, 5), 0); eq(E.progress(99, 5), 0);
});

test('streak: Good (rating 3) or better continues it, anything else starts over', () => {
  let n = 0;
  for (const [r, want] of [[4, 1], [3, 2], [4, 3], [2, 0], [3, 1], [1, 0], [0, 0], [4, 1]]) { n = E.streakNext(n, r); eq(n, want); }
  eq(E.streakNext(undefined, 4), 1);
});

test('kusoge.hitsumabushi.x: reads broken saves, unlocks in order, records only improvements', () => {
  const blank = E.blankX();
  deep(E.readX(null), blank); deep(E.readX('{bad'), blank); deep(E.readX('[1,2]'), blank); deep(E.readX(42), blank); deep(E.readX(undefined), blank);
  const x = E.readX(JSON.stringify({ v: 1, s: [3, 2, 9, -1, 'a', 1.5], b: [1234.9, 'x', -2, 1e9], c: 17.9 }));
  eq(x.s.length, 10); eq(x.b.length, 10); deep(x.s.slice(0, 6), [3, 2, 0, 0, 0, 1]); eq(x.b[0], 1234); eq(x.b[1], 0); eq(x.b[2], 0); eq(x.b[3], 0); eq(x.c, 17);
  eq(E.readX({ s: [1], extra: 1 }).s[0], 1);
  ok(E.open(blank, 0) && !E.open(blank, 1) && !E.open(blank, -1) && !E.open(blank, 10));
  const y = E.blankX(); y.s[0] = 1; ok(E.open(y, 1) && !E.open(y, 2));
  ok(E.record(y, 1, 2, 7)); eq(y.s[1], 2); eq(y.b[1], 7); ok(E.open(y, 2));
  ok(!E.record(y, 1, 1, 5)); eq(y.s[1], 2); eq(y.b[1], 7, 'a worse run changes nothing');
  ok(E.record(y, 1, 1, 9)); eq(y.s[1], 2); eq(y.b[1], 9, 'a better number alone is kept');
  ok(E.record(y, 1, 3, 9)); eq(y.s[1], 3); ok(!E.record(y, 99, 3, 9));
  ok(E.recordStreak(y, 6) && !E.recordStreak(y, 6) && !E.recordStreak(y, 3) && E.recordStreak(y, 30)); eq(y.c, 30);
  eq(E.totalStars(y), 4); deep(E.readX(JSON.stringify(y)), y);
});

test('the page uses engine.js (script tag, service worker list, the save key is documented)', () => {
  ok(/<script src="engine\.js"><\/script>/.test(readText('hitsumabushi/index.html')), 'script tag');
  ok(readText('sw.js').includes("'./hitsumabushi/engine.js'"), 'sw.js precache');
  ok(readText('common/games.js').includes("'kusoge.hitsumabushi.x'"), 'games.js key doc');
});

run();
