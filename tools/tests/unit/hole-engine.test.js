// hole/engine.js の単体テスト：12のミッション（街・ねらい・★の基準）・★の計算・コンボ・保存（kusoge.hole.x）の読み込みと記録
// 街の id が hole/cities.js にあること・古い保存（kusoge.hole.save）の読み込みはページ側（hole-play.js と save スイート）で確かめる
// 実行：node tools/tests/unit/hole-engine.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'hole/engine.js'));

// the city ids of hole/cities.js (read as text: the file needs a browser)
const CITY_IDS = [...fs.readFileSync(path.join(ROOT, 'hole/cities.js'), 'utf8').matchAll(/\bid: '([a-z0-9]+)', name:/g)].map(m => m[1]);

test('12 missions: unique ids, real cities, kinds, rising stars, worlds in order', () => {
  eq(E.MISSIONS.length, 12);
  ok(CITY_IDS.length >= 14, 'found the city ids: ' + CITY_IDS.length);
  eq(new Set(E.MISSIONS.map(m => m.id)).size, 12);
  E.MISSIONS.forEach((m, i) => {
    eq(m.index, i); ok(m.name && m.desc, m.id + ' text');
    ok(CITY_IDS.includes(m.city), m.id + ' city ' + m.city);
    ok(E.KINDS[m.kind], m.id + ' kind');
    ok(m.time >= 45 && m.time <= 180 && m.rivals >= 0 && m.rivals <= 5 && m.diff > 0 && m.diff <= 1, m.id + ' setup');
    ok(m.stars.length === 3 && m.stars[0] > 0 && m.stars[1] > m.stars[0] && m.stars[2] > m.stars[1], m.id + ' stars ascend');
    ok([0, 1, 2].includes(m.world), m.id + ' world');
    if (m.kind === 'fast') ok(m.target > 0 && m.target <= 100 && m.stars[2] < m.time, m.id + ' fast target and seconds');
    if (m.kind === 'kills') ok(m.rivals >= 1 && m.stars[2] <= m.rivals + 1, m.id + ' kills need rivals');
    if (m.st) ok(m.st >= 1 && m.st <= 15, m.id + ' start stage');
  });
  for (let i = 1; i < 12; i++) ok(E.MISSIONS[i].world >= E.MISSIONS[i - 1].world, 'worlds ascend');
  eq(E.info(0).id, 'm1'); eq(E.info(12), null);
  // all five goal kinds are used, and each world has four missions
  eq(new Set(E.MISSIONS.map(m => m.kind)).size, 5);
  for (const w of [0, 1, 2]) eq(E.MISSIONS.filter(m => m.world === w).length, 4);
});

test('metric and stars for every kind', () => {
  const s = o => Object.assign({ pct: 0, combo: 0, kills: 0, size: 0, fastLeft: 0 }, o);
  const pct = E.MISSIONS.findIndex(m => m.kind === 'pct'), [a, b, c] = E.MISSIONS[pct].stars;
  eq(E.starsFor(pct, 0), 0); eq(E.starsFor(pct, a - 0.01), 0); eq(E.starsFor(pct, a), 1); eq(E.starsFor(pct, b), 2); eq(E.starsFor(pct, c), 3); eq(E.starsFor(pct, c * 5), 3);
  eq(E.metric(pct, s({ pct: 1.2345 })), 1.2); eq(E.metric(pct, s({ pct: -3 })), 0); eq(E.metric(pct, null), 0); eq(E.metric(pct, s({ pct: NaN })), 0);
  const cb = E.MISSIONS.findIndex(m => m.kind === 'combo'); eq(E.metric(cb, s({ combo: 7, pct: 50 })), 7);
  const k = E.MISSIONS.findIndex(m => m.kind === 'kills'); eq(E.metric(k, s({ kills: 2 })), 2);
  const z = E.MISSIONS.findIndex(m => m.kind === 'size'); eq(E.metric(z, s({ size: 22.84 })), 22.8);
  const f = E.MISSIONS.findIndex(m => m.kind === 'fast'), M = E.MISSIONS[f];
  eq(E.metric(f, s({ pct: 99 })), 0, 'fast counts only the seconds left'); eq(E.metric(f, s({ fastLeft: 33.33 })), 33.3);
  ok(!E.goalReached(f, M.target - 0.01) && E.goalReached(f, M.target) && !E.goalReached(pct, 99));
  eq(E.starsFor(f, 0), 0); eq(E.starsFor(f, M.stars[0]), 1); eq(E.starsFor(f, M.stars[2]), 3);
  eq(E.starsFor(99, 5), 0);
  eq(E.progress(pct, 0), 0); eq(E.progress(pct, c / 2), 0.5); eq(E.progress(pct, c * 9), 1);
});

test('combo: 1.6 seconds keep it going, a gap starts it over, the max is kept', () => {
  const c = E.newCombo();
  eq(E.comboLive(c, 0), 0);
  eq(E.comboHit(c, 10), 1); eq(E.comboHit(c, 11.5), 2); eq(E.comboHit(c, 13.1), 3); eq(E.comboHit(c, 13.1 + 1.61), 1);
  eq(c.max, 3); eq(E.comboLive(c, 13.1 + 1.61 + 1.5), 1); eq(E.comboLive(c, 13.1 + 1.61 + 1.7), 0);
  for (let i = 0; i < 20; i++) E.comboHit(c, 20 + i * 0.5);
  eq(c.max, 20); eq(c.n, 20);
});

test('kusoge.hole.x: reads broken saves, unlocks in order, records only improvements', () => {
  const blank = E.blankX();
  deep(E.readX(null), blank); deep(E.readX('{bad'), blank); deep(E.readX('[1,2]'), blank); deep(E.readX(42), blank); deep(E.readX(undefined), blank);
  const x = E.readX(JSON.stringify({ v: 1, s: [3, 2, 9, -1, 'a', 1.5], b: [12.34, 'x', -2, 1e9], c: 17.9 }));
  eq(x.s.length, 12); eq(x.b.length, 12); deep(x.s.slice(0, 6), [3, 2, 0, 0, 0, 1]); eq(x.b[0], 12.3); eq(x.b[1], 0); eq(x.b[2], 0); eq(x.b[3], 0); eq(x.c, 17);
  // the object form and extra fields from a newer page are fine
  eq(E.readX({ s: [1] }).s[0], 1);
  ok(E.open(blank, 0) && !E.open(blank, 1) && !E.open(blank, -1) && !E.open(blank, 12));
  const y = E.blankX(); y.s[0] = 1; ok(E.open(y, 1) && !E.open(y, 2));
  ok(E.recordMission(y, 1, 2, 5.5)); eq(y.s[1], 2); eq(y.b[1], 5.5); ok(E.open(y, 2));
  ok(!E.recordMission(y, 1, 1, 4)); eq(y.s[1], 2); eq(y.b[1], 5.5, 'a worse run changes nothing');
  ok(E.recordMission(y, 1, 1, 9)); eq(y.s[1], 2); eq(y.b[1], 9, 'a better number alone is kept');
  ok(E.recordMission(y, 1, 3, 9)); eq(y.s[1], 3);
  ok(!E.recordMission(y, 99, 3, 9));
  ok(E.recordCombo(y, 6) && !E.recordCombo(y, 6) && !E.recordCombo(y, 3) && E.recordCombo(y, 30)); eq(y.c, 30);
  eq(E.totalStars(y), 4);
  deep(E.readX(JSON.stringify(y)), y);
  eq(E.coinsFor(0, false), 5); eq(E.coinsFor(3, false), 65); eq(E.coinsFor(1, true), 65);
});

run();
