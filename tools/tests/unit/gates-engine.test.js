// gates/engine.js の単体テスト：12のミッション（部隊・ねらい・★の基準が筋が通っている）・★の計算・保存（kusoge.gates.x）の読み込みと記録
// 実行：node tools/tests/unit/gates-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'gates/engine.js'));

const HEROES = ['ren', 'mina', 'bulk', 'shizuku', 'gou', 'sora', 'kai'];
const res = o => Object.assign({ won: true, n: 10, peak: 20, kills: 50, t: 60, lost: 5, combo: 10 }, o);

test('12 missions: unique ids, sane squads, goals and a rising difficulty', () => {
  eq(E.MISSIONS.length, 12);
  eq(new Set(E.MISSIONS.map(m => m.id)).size, 12); eq(new Set(E.MISSIONS.map(m => m.seed)).size, 12);
  eq(E.byId('m3').index, 2); eq(E.byId('zz'), null);
  E.MISSIONS.forEach((m, i) => {
    ok(m.name && m.desc, m.id + ' text'); eq(m.index, i);
    ok([0, 1, 2].includes(m.world), m.id + ' world'); ok(m.stage >= 1 && m.stage <= 20, m.id + ' stage');
    ok(m.n >= 5 && m.n <= 500 && m.tier >= 0 && m.tier <= 3 && m.hl >= 1 && m.hl <= 20, m.id + ' squad');
    ok(m.team.length <= 3 && m.team.every(h => HEROES.includes(h)) && new Set(m.team).size === m.team.length, m.id + ' team');
    if (m.mods.nh) eq(m.team.length, 0, m.id + ' no heroes means an empty team');
    ok(m.bl.length === 3 && m.bl.every(v => v >= 1 && v <= 30), m.id + ' base levels');
    ok(E.GOAL_KINDS.includes(m.goal.k) && m.goal.v.length === 2, m.id + ' goal');
    const [a, b] = m.goal.v; ok(E.lowerBetter(m.goal.k) ? b < a : b > a, m.id + ' star 3 is harder than star 2');
    for (const k of ['zc', 'lm', 'bh']) if (m.mods[k] != null) ok(m.mods[k] > 0 && m.mods[k] <= 3, m.id + ' mod ' + k);
  });
  // worlds are in order, stages never go back by more than a little within a world, and the last is harder than the first
  for (let i = 1; i < 12; i++) ok(E.MISSIONS[i].world >= E.MISSIONS[i - 1].world, 'worlds ascend');
  ok(E.MISSIONS[11].stage > E.MISSIONS[0].stage);
});

test('stars: 0 on a loss, 1 for the clear, 2 and 3 for the goals (both directions)', () => {
  const m = E.byId('m1'); // surv [100, 600]
  eq(E.starsFor(m, res({ won: false, n: 999 })), 0);
  eq(E.starsFor(m, res({ n: 1 })), 1); eq(E.starsFor(m, res({ n: 100 })), 2); eq(E.starsFor(m, res({ n: 599 })), 2); eq(E.starsFor(m, res({ n: 600 })), 3);
  const t = E.byId('m5'); // time [60, 42]
  eq(E.starsFor(t, res({ t: 61 })), 1); eq(E.starsFor(t, res({ t: 60 })), 2); eq(E.starsFor(t, res({ t: 42 })), 3); eq(E.starsFor(t, res({ t: 10 })), 3);
  const l = E.byId('m4'); // lost [150, 70]
  eq(E.starsFor(l, res({ lost: 151 })), 1); eq(E.starsFor(l, res({ lost: 150 })), 2); eq(E.starsFor(l, res({ lost: 70 })), 3);
  eq(E.metric(E.byId('m7'), res({ combo: 77 })), 77); eq(E.metric(E.byId('m3'), res({ kills: 5 })), 5);
  ok(E.goalMet(m, res({ n: 100 }), 0) && !E.goalMet(m, res({ n: 100 }), 1) && !E.goalMet(m, res({ won: false, n: 999 }), 0));
  // fraction stays within 0..1
  for (const mm of E.MISSIONS) for (const r of [res({ n: 0, peak: 0, kills: 0, t: 0, lost: 0, combo: 0 }), res({ n: 9999, peak: 9999, kills: 9999, t: 9999, lost: 9999, combo: 9999 })]) { const f = E.fraction(mm, r); ok(f >= 0 && f <= 1, mm.id); }
});

test('coins come only from newly earned stars', () => {
  const m = E.byId('m1'), w3 = E.byId('m12');
  eq(E.coinsFor(m, 0, 0), 0); eq(E.coinsFor(m, 2, 2), 0); eq(E.coinsFor(m, 3, 1), 0);
  eq(E.coinsFor(m, 0, 1), 40); eq(E.coinsFor(m, 1, 3), 50); eq(E.coinsFor(m, 0, 3), 90);
  eq(E.coinsFor(w3, 0, 3), 90 * 3);
});

test('kusoge.gates.x: broken or missing data loads as empty, good data is kept, only improvements are recorded', () => {
  for (const raw of [null, undefined, '', 'nope', '{', '[]', '"x"', 5, { s: 'x' }]) { const x = E.loadX(raw); eq(x.s.length, 12); eq(E.totalStars(x), 0); eq(x.c, null); }
  const x = E.loadX(JSON.stringify({ v: 1, s: [3, 2, 9, -1, 1.5, 'a'], t: [33.33, 0, -4, 99999], c: 'm2' }));
  deep(x.s.slice(0, 6), [3, 2, 0, 0, 1, 0]); eq(x.t[0], 33.3); eq(x.t[2], 0); eq(x.t[3], 0); eq(x.c, 'm2'); eq(E.loadX({ c: 'zz' }).c, null);
  eq(E.totalStars(x), 6);
  ok(E.unlocked(x, 0) && E.unlocked(x, 1) && E.unlocked(x, 2) && !E.unlocked(x, 3) && !E.unlocked(x, 4));
  const y = E.blankX();
  ok(E.unlocked(y, 0) && !E.unlocked(y, 1));
  let r = E.record(y, 'm1', 2, 50.04); deep(r, { stars: true, time: true }); eq(y.s[0], 2); eq(y.t[0], 50); eq(y.c, 'm1'); ok(E.unlocked(y, 1));
  r = E.record(y, 'm1', 1, 60); deep(r, { stars: false, time: false }); eq(y.s[0], 2); eq(y.t[0], 50);
  r = E.record(y, 'm1', 3, 40); deep(r, { stars: true, time: true }); eq(y.s[0], 3); eq(y.t[0], 40);
  r = E.record(y, 'm2', 0, 0); deep(r, { stars: false, time: false }); eq(y.s[1], 0);
  deep(E.record(y, 'zz', 3, 1), { stars: false, time: false });
  deep(E.loadX(JSON.stringify(y)), y); // round trip
});

run();
