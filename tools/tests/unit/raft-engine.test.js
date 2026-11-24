// raft/engine.js の単体テスト：8つの航海（ねらい・期限・★の基準が筋が通っている）・進み具合・★の計算・保存（kusoge.raft.x）の読み込み
// 実行：node tools/tests/unit/raft-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'raft/engine.js'));

const FACS = ['purifier', 'fishing', 'grill', 'net', 'quarters', 'tank', 'workbench', 'garden', 'lookout', 'ballista', 'sail', 'storage'];
const ROLES = ['漁師', '技師', '料理人', '戦士', '射手', '船乗り'];
const KINDS = ['day', 'caught', 'sharks', 'raidsWon', 'expWon', 'rescued', 'crew', 'tiles', 'capLv', 'fac'];
const snap0 = (o) => Object.assign({ day: 1, caught: 0, sharks: 0, raidsWon: 0, expWon: 0, rescued: 0, crew: 0, tiles: 9, capLv: 1, fac: {}, tilesLost: 0, lost: 0 }, o);

test('8 voyages: unique ids, names, goals, limits and stars are consistent', () => {
  eq(E.VOYAGES.length, 8);
  eq(new Set(E.VOYAGES.map(v => v.id)).size, 8); eq(E.byId('v3').index, 2); eq(E.byId('zz'), null);
  for (const v of E.VOYAGES) {
    ok(v.name && v.desc, v.id + ' text');
    ok(v.goal.length >= 1 && v.goal.every(c => KINDS.includes(c.t) && c.n >= 1), v.id + ' goal kinds');
    for (const c of v.goal) if (c.t === 'fac') ok(FACS.includes(c.f), v.id + ' fac id');
    ok(v.limit == null || v.limit >= 2, v.id + ' limit');
    ok(['day', 'tilesLost', 'lost'].includes(v.metric), v.id + ' metric');
    ok(v.par[0] <= v.par[1], v.id + ' par order');
    if (v.metric === 'day' && v.limit) ok(v.par[1] <= v.limit, v.id + ' 2-star day within the limit');
    const st = v.start;
    for (const r of st.crew || []) ok(ROLES.includes(r), v.id + ' role ' + r);
    for (const [t, lv, k] of st.facs || []) { ok(FACS.includes(t) && lv >= 1 && lv <= 6, v.id + ' fac'); ok(/^-?\d+,-?\d+$/.test(k), v.id + ' tile key'); }
    // a voyage that needs a day to be reached has a day goal or a limit that is long enough for the goal to be reachable
    const dayGoal = v.goal.find(c => c.t === 'day'); if (dayGoal && v.limit) ok(v.limit >= dayGoal.n, v.id);
  }
  // facilities start on distinct tiles of the 3x3 start raft
  for (const v of E.VOYAGES) { const ks = (v.start.facs || []).map(f => f[2]); eq(new Set(ks).size, ks.length, v.id + ' distinct tiles'); for (const k of ks) { const [i, j] = k.split(',').map(Number); ok(Math.abs(i) <= 1 && Math.abs(j) <= 1, v.id + ' on the start raft'); } }
  // goals that need a facility / crew the start does not give are reachable: the captain level covers the facility
  const UNLOCK = { purifier: 1, fishing: 1, grill: 1, net: 1, quarters: 2, tank: 2, workbench: 2, garden: 3, lookout: 3, ballista: 3, sail: 4, storage: 4 };
  for (const v of E.VOYAGES) for (const [t] of v.start.facs || []) ok((v.start.lv || 1) >= UNLOCK[t], v.id + ' starts with a facility its level has not unlocked: ' + t);
  // difficulty rises: the later voyages start with more
  ok((E.VOYAGES[7].start.lv || 1) > (E.VOYAGES[0].start.lv || 1));
});

test('progress / goalDone / fraction follow the snapshot', () => {
  const v = E.byId('v2');
  let p = E.progress(v, snap0({}));
  eq(p.length, 3); ok(p.every(x => !x.done)); eq(E.fraction(v, snap0({})), 0); eq(E.goalDone(v, snap0({})), false);
  p = E.progress(v, snap0({ fac: { purifier: 1, fishing: 3 } }));
  deep(p.map(x => x.done), [true, true, false]); eq(p[1].cur, 3); eq(p[1].v, 1, 'v is capped at the need');
  ok(Math.abs(E.fraction(v, snap0({ fac: { purifier: 1, fishing: 3 } })) - 2 / 3) < 1e-9);
  eq(E.goalDone(v, snap0({ fac: { purifier: 1, fishing: 1, grill: 2 } })), true);
  const v1 = E.byId('v1'); eq(E.goalDone(v1, snap0({ caught: 15 })), false); eq(E.goalDone(v1, snap0({ caught: 16 })), true);
  // garbage never throws and counts as zero
  eq(E.goalDone(v1, { caught: 'x' }), false); eq(E.goalDone(v1, {}), false); eq(E.fraction(v1, null || {}), 0);
  const v6 = E.byId('v6'); eq(E.goalDone(v6, snap0({ crew: 5, tiles: 13 })), false); eq(E.goalDone(v6, snap0({ crew: 5, tiles: 14 })), true);
  const v8 = E.byId('v8'); eq(E.goalDone(v8, snap0({ day: 15, crew: 3 })), false); eq(E.goalDone(v8, snap0({ day: 15, crew: 4 })), true);
});

test('stars: the metric decides (earlier / fewer losses = more stars)', () => {
  const v1 = E.byId('v1'), v3 = E.byId('v3'), v5 = E.byId('v5');
  eq(E.starsFor(v1, snap0({ day: 2 })), 3); eq(E.starsFor(v1, snap0({ day: 3 })), 2); eq(E.starsFor(v1, snap0({ day: 4 })), 1);
  eq(E.starsFor(v3, snap0({ tilesLost: 1 })), 3); eq(E.starsFor(v3, snap0({ tilesLost: 3 })), 2); eq(E.starsFor(v3, snap0({ tilesLost: 4 })), 1);
  eq(E.starsFor(v5, snap0({ lost: 0 })), 3); eq(E.starsFor(v5, snap0({ lost: 1 })), 2); eq(E.starsFor(v5, snap0({ lost: 5 })), 1);
  for (const v of E.VOYAGES) { const s = E.starsFor(v, snap0({ day: 1, tilesLost: 0, lost: 0 })); eq(s, 3, v.id + ' best case is 3 stars'); }
  eq(E.metricValue(v1, snap0({ day: 7 })), 7); eq(E.metricValue(v3, {}), 0);
});

test('expired: only past the limit day; no limit never expires', () => {
  const v1 = E.byId('v1'), v4 = E.byId('v4');
  eq(E.expired(v1, snap0({ day: 4 })), false); eq(E.expired(v1, snap0({ day: 5 })), true);
  eq(E.expired(v4, snap0({ day: 99 })), false);
});

test('kusoge.raft.x: missing, broken or odd values never break and never invent stars', () => {
  deep(E.loadX(null).s, [0, 0, 0, 0, 0, 0, 0, 0]);
  deep(E.loadX('{bad').s, new Array(8).fill(0));
  deep(E.loadX('[]').s, new Array(8).fill(0));
  deep(E.loadX('{"v":1,"s":[3,2,1,0,9,-1,"x",null],"c":"v2"}').s, [3, 2, 1, 0, 0, 0, 0, 0]);
  eq(E.loadX('{"v":1,"s":[1],"c":"nope"}').c, null); eq(E.loadX({ s: [1, 1], c: 'v4' }).c, 'v4');
  const x = E.loadX('{"v":1,"s":[2,1]}');
  eq(E.loadX(JSON.stringify(x)).s.join(), x.s.join(), 'round trip');
});

test('unlocking and recording: a star opens the next voyage; stars only go up', () => {
  const x = E.blankX();
  eq(E.unlocked(x, 0), true); eq(E.unlocked(x, 1), false);
  eq(E.record(x, 'v1', 2), true); eq(E.unlocked(x, 1), true); eq(E.unlocked(x, 2), false);
  eq(E.record(x, 'v1', 1), false, 'lower stars do not overwrite'); eq(x.s[0], 2);
  eq(E.record(x, 'v1', 3), true); eq(x.s[0], 3); eq(E.record(x, 'zz', 3), false);
  eq(E.totalStars(x), 3);
});

run('raft-engine');
