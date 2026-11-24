// town/engine.js の単体テスト：決まった結果・るす番（上限・時計）・ひらきなおし・保存の読み込み・ボットで経済のバランス（最初の目標・最初のひらきなおし・行きづまらない）
// 実行：node tools/tests/unit/town-engine.test.js
'use strict';
const path = require('path');
const ROOT = path.resolve(__dirname, '../../..');
const T = require(path.join(ROOT, 'town/engine.js'));
const Bot = require(path.join(ROOT, 'tools/tests/lib/town-bot.js'));
let pass = 0, fail = 0;
const ok = (c, m) => { if (c) pass++; else { fail++; console.log('  FAIL', m); } };
const eq = (a, b, m) => ok(JSON.stringify(a) === JSON.stringify(b), `${m}: ${JSON.stringify(a)} != ${JSON.stringify(b)}`);
const test = (n, f) => { try { f(); } catch (e) { fail++; console.log('  CRASH', n, e && e.stack); } };
const T0 = 1.8e12, H = 3600000;

test('build, adjacency and prices', () => {
  const S = T.newState(T0, 1);
  eq(T.build(S, 'house', 3, 3), null, 'build house');
  eq(T.build(S, 'house', 3, 3), 'taken', 'taken');
  eq(T.build(S, 'house', 0, 0), 'land', 'outside the land');
  eq(T.build(S, 'harbor', 3, 5), 'locked', 'harbor needs a new town');
  ok(T.cost(S, 'house').c > 20, 'the second house costs more');
  S.res.coin = 1e6; S.res.wood = 1e6;
  T.build(S, 'farm', 5, 3); const r0 = T.rates(S).food;
  S.peak = 99; T.refreshUnlocks(S); T.build(S, 'mill', 5, 2);
  ok(T.rates(S).food > r0 * 1.4, 'a mill next to a farm raises the farm by 50%');
  T.build(S, 'park', 2, 3);
  ok(T.rates(S).tiles[T.IDX(3, 3)].cap > 3, 'a park next to a cottage adds room');
  eq(T.build(S, 'house', 3, 6), 'water', 'water');
  T.tier = 1; S.tier = 1; T.refreshUnlocks(S);
  eq(T.build(S, 'harbor', 4, 4), 'taken', 'plaza tile');
  eq(T.build(S, 'harbor', 2, 2), 'shore', 'harbor only on the shore');
  eq(T.build(S, 'harbor', 3, 5), null, 'harbor on the shore');
  ok(T.demolish(S, 3, 3) === null && S.g[T.IDX(3, 3)] === null, 'demolish');
  eq(T.demolish(S, 4, 4), 'none', 'the plaza stays');
});
test('deterministic tick', () => {
  const run = () => { const S = T.newState(T0, 5); T.build(S, 'house', 3, 3); T.build(S, 'farm', 5, 3); let n = T0; for (let i = 0; i < 600; i++) { n += 1000; T.advance(S, n); } return JSON.stringify([T.packMeta(S), T.packRun(S)]); };
  eq(run(), run(), 'same actions give the same town');
});
test('offline: income, cap, research, clock', () => {
  const S = T.newState(T0, 1); T.build(S, 'house', 3, 3); T.build(S, 'farm', 5, 3);
  S.res.food = 100; S.pop = 3;
  const c0 = S.res.coin, rate = T.coinRate(S);
  let r = T.advance(S, T0 + 2 * H);
  eq(r.mode, 'away', 'away'); ok(Math.abs(S.res.coin - c0 - rate * 2 * 3600) < rate * 2 * 3600 * 0.2 + 5, 'about 2 h of income');
  ok(r.gains.coin > 0 && r.capped === false, 'summary');
  const S2 = T.newState(T0, 1); T.build(S2, 'house', 3, 3);
  const a = S2.res.coin; r = T.advance(S2, T0 + 30 * H);
  eq(r.capped, true, 'capped'); eq(Math.round(r.dt), 8 * 3600, 'cap 8 h'); ok(S2.res.coin - a < T.coinRate(S2) * 9 * 3600, 'no more than the cap');
  S2.res.spark = 100; for (let i = 0; i < 4; i++) T.buyResearch(S2, 'rest');
  eq(T.offlineCapH(S2), 12, 'research extends the cap to 12 h');
  const S3 = T.newState(T0, 1); T.build(S3, 'house', 3, 3); T.advance(S3, T0 + H); const t1 = S3.t, c1 = S3.res.coin;
  r = T.advance(S3, T0 - 5 * H);
  eq(r.clock, 'back', 'clock back'); eq(S3.t, t1, 't never goes down'); eq(S3.res.coin, c1, 'nothing granted'); 
  r = T.advance(S3, T0 + H + 1000); ok(S3.res.coin - c1 < 5, 'going back and forth pays nothing extra');
  r = T.advance(S3, T0 + 200 * 86400000); eq(r.clock, 'jump', 'a year jump is a broken clock'); eq(r.mode, 'none', 'nothing paid');
  eq(T.advance(S3, NaN).clock, 'bad', 'NaN');
  const S4 = T.newState(T0, 1); T.advance(S4, T0 + 100 * 1000); ok(S4.vis.length === 0, 'no visitors while away');
});
test('visitors, events and the daily gift', () => {
  const S = T.newState(T0, 3); T.build(S, 'house', 3, 3); T.build(S, 'farm', 5, 3);
  let n = T0, seen = 0, ev = 0, vid = 0, c1 = 0, c2 = 0, g1 = null;
  for (let i = 0; i < 600; i++) { n += 1000; const r = T.advance(S, n); for (const e of r.events) { if (e.type === 'visitor') { seen++; if (!vid) { vid = S.vis[S.vis.length - 1].id; c1 = S.res.coin; g1 = T.tapVisitor(S, vid); c2 = S.res.coin; } } if (e.type === 'event') ev++; } }
  ok(seen >= 8 && seen <= 20, 'visitors every ~50 s: ' + seen); ok(ev >= 3, 'events: ' + ev);
  ok(vid > 0, 'a visitor came'); ok(g1 && g1.coin >= 10 && c2 > c1, 'tap pays'); eq(T.tapVisitor(S, vid), null, 'once');
  ok(T.giftReady(S, n), 'gift ready'); const gf = T.claimGift(S, n); ok(gf && gf.spark === 1 && gf.streak === 1, 'gift'); ok(!T.giftReady(S, n), 'once a day');
  ok(T.giftReady(S, n + 86400000), 'next day'); eq(T.claimGift(S, n + 86400000).streak, 2, 'streak'); ok(!T.giftReady(S, n - 5 * 86400000), 'a clock set back does not give the gift again');
});
test('goals', () => {
  const S = T.newState(T0, 1);
  eq(T.currentQuest(S).id, 'h1', 'first goal'); eq(T.checkQuests(S).length, 0, 'not yet');
  T.build(S, 'house', 3, 3); const d = T.checkQuests(S); eq(d.map(q => q.id), ['h1'], 'house goal'); ok(S.res.coin > 40 - 20, 'reward paid');
  const ids = new Set(T.QUESTS.map(q => q.id)); eq(ids.size, T.QUESTS.length, 'unique goal ids');
  for (const q of T.QUESTS) ok(q.tier >= 0 && T.questProgress(T.newState(T0, 1), q).goal >= 1, 'goal ' + q.id);
});
test('prestige: three tiers, permanent multiplier, unlocks', () => {
  const S = T.newState(T0, 1);
  eq(T.prestige(S, T0), null, 'not allowed at pop 0');
  for (let tier = 0; tier < 4; tier++) {
    S.pop = T.prestigeNeed(S) + 5; S.res.spark = 7;
    const info = T.prestigeInfo(S); ok(info.ok && info.gain >= 1, 'tier ' + tier + ' ok');
    const m0 = T.rates(S).mCoin; T.build(S, 'house', 3, 3);
    ok(T.prestige(S, T0 + tier) !== null, 'prestige ' + tier);
    eq(S.tier, tier + 1, 'tier'); eq(S.land, 5, 'land back to 5'); ok(!S.g.some((b, i) => b && b.b !== 'plaza'), 'town reset'); eq(S.res.spark, 7, 'spark kept');
    ok(T.rates(S).mCoin > m0, 'income multiplier up'); ok(S.best >= info.pop, 'best kept');
  }
  ok(T.prestigeNeed(S) > 600 && T.maxLand(S) === 10 && T.maxLv(S) >= 9, 'late tiers');
  ok(T.unlocked(S, 'tower') && T.unlocked(S, 'well') && T.unlocked(S, 'harbor'), 'buildings unlocked by tiers');
  const need = [0, 1, 2, 3].map(t => { const X = T.newState(T0, 1); X.tier = t; return T.prestigeNeed(X); }); eq(need, [80, 220, 420, 600], 'needs');
});
test('save: round trip and broken input', () => {
  const S = T.newState(T0, 9); S.res.coin = 1e7; S.res.wood = 1e6; T.build(S, 'house', 3, 3); T.build(S, 'farm', 5, 3); S.pop = 3; S.qd.h1 = 1; S.rs.wealth = 2; S.best = 12; S.stats.taps = 4; S.peak = 3; T.refreshUnlocks(S);
  const m = JSON.parse(JSON.stringify(T.packMeta(S))), r = JSON.parse(JSON.stringify(T.packRun(S)));
  const U = T.unpack(m, r, T0);
  eq(JSON.stringify(T.packMeta(U)), JSON.stringify(T.packMeta(S)), 'meta'); eq(JSON.stringify(T.packRun(U)), JSON.stringify(T.packRun(S)), 'run');
  for (const bad of [null, 5, 'x', [], { v: 1, g: 7, res: { coin: 'a' }, land: 99 }, { v: 1, g: [['house', 99, -5, 'x']], land: 3, pop: -4 }]) {
    const X = T.unpack({ best: 'x', tier: -3, rs: { nope: 4, rest: 99 }, qd: 7, stats: { built: 'q' } }, bad, T0);
    ok(X.land >= 5 && X.land <= 10 && X.res.coin >= 0 && X.pop >= 0 && X.tier === 0 && X.rs.rest === 4 && Number.isFinite(X.stats.built), 'sanitised');
    T.advance(X, T0 + 1000);
  }
});
test('hungry town: no growth, half tax, no soft-lock', () => {
  const S = T.newState(T0, 1); T.build(S, 'house', 3, 3); S.res.food = 0; S.pop = 2;
  T.advance(S, T0 + 60000); ok(S.pop <= 2.001, 'no growth without food'); ok(S.res.coin > 40, 'the plaza still pays');
});
test('bot: first goals fast, first new town in a sensible time, nothing stalls', () => {
  const S = T.newState(T0, 1);
  const tl = Bot.play(S, T0, { minutes: 120, stopAtPrestige: true });
  const q = id => (tl.quests.find(x => x.id === id) || {}).t;
  ok(q('h1') <= 20 && q('p3') <= 60, 'first goals inside a minute: ' + q('h1') + ' ' + q('p3'));
  ok(tl.prestiges.length === 1, 'the bot opens the first new town');
  const t1 = tl.prestiges[0].t / 60; ok(t1 >= 15 && t1 <= 50, 'first new town after ' + t1.toFixed(1) + ' min of play (15-50)');
  // goals never stall for more than 12 minutes
  let last = 0, gap = 0; for (const x of tl.quests) { gap = Math.max(gap, x.t - last); last = x.t; } ok(gap <= 12 * 60, 'longest gap between goals ' + Math.round(gap / 60) + ' min');
  // the second and third towns are reachable
  const R = T.newState(T0, 2), tl2 = Bot.play(R, T0, { minutes: 200, auto: true });
  ok(tl2.prestiges.length >= 3, 'three new towns inside 200 min of play: ' + tl2.prestiges.map(p => Math.round(p.t / 60)).join(','));
  // an idle player (never taps) is slower but gets there
  const I = T.newState(T0, 3), tl3 = Bot.play(I, T0, { minutes: 100, stopAtPrestige: true, taps: false });
  ok(tl3.prestiges.length === 1 && tl3.prestiges[0].t / 60 >= tl.prestiges[0].t / 60, 'idle play reaches it too, a little later: ' + (tl3.prestiges[0] ? Math.round(tl3.prestiges[0].t / 60) : 'never') + ' min');
  // away play: a closed town for 8 h grows the coins a lot but never the population past the room
  const A = T.newState(T0, 4); Bot.play(A, T0, { minutes: 20 }); const cap0 = T.rates(A).cap, c0 = A.res.coin; T.advance(A, A.t + 6 * H); ok(A.res.coin > c0 + 100 && A.pop <= cap0 + 1e-6, 'away income, population bounded by room');
});
console.log(`town-engine: ${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
