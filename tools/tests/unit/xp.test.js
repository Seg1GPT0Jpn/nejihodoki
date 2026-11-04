// P3-1：XP・レベル・ランクの単体テスト（common/platform.js の KoboPlatform.xp と merge.xp）。node だけ。
// 実行：node tools/tests/unit/xp.test.js   （いくつかのタイムゾーンでも自分を実行し直す。XP_TZ_ONCE=1 で1回だけ）
'use strict';
const path = require('path');
const { spawnSync } = require('child_process');
const { fresh, test, eq, ok, deep, run, FakeStorage, fixedNow, COMMON } = require('./_kobo-env');

const H = 3600000, DAY = 86400000, MIN = 60000;
const jst = (y, m, d, hh = 0, mm = 0, ss = 0) => Date.UTC(y, m - 1, d, hh, mm, ss) - 9 * H;
const S = JSON.stringify;
const T0 = jst(2026, 11, 4, 12); // 水曜の昼（日本時間）

// 1台の端末：storage を持ち、use() でその端末の common を読み込み直す（devId は storage の kobo.dev）
function device(id, init) {
  const storage = new FakeStorage(Object.assign({ 'kobo.dev': id }, init || {}));
  return {
    id, storage,
    use() {
      const m = fresh({ storage });
      delete require.cache[path.join(COMMON, 'achievements.js')]; delete globalThis.KoboAchievements;
      return m.platform;
    },
    get(k) { const v = storage.getItem(k); return v == null ? undefined : JSON.parse(v); },
  };
}
// 1回のプレイ（play_start → stage_clear × clears → best? → play_end）
function play(P, g, o = {}) {
  const t = o.t != null ? o.t : Date.now(), dur = o.dur != null ? o.dur : 60000;
  fixedNow(t - dur);
  P.emit('play_start', { game: g, mode: o.mode || 'normal', t: t - dur, dateKey: o.dateKey });
  for (let i = 0; i < (o.clears || 0); i++) P.emit('stage_clear', { game: g, stage: i + 1 });
  if (o.best) P.emit('best', { game: g, score: o.score || 1 });
  fixedNow(t);
  let res = null; const off = P.on('played', x => { res = x.xp; });
  P.emit('play_end', { game: g, mode: o.mode || 'normal', score: o.score || 0, durationMs: dur, wallMs: o.wallMs != null ? o.wallMs : dur,
    reason: o.reason || 'over', dateKey: o.dateKey, t });
  off();
  return res;
}
// 2台の同期（cloud.js が使うマージ関数を、両方の向きで）
const SYNC_KEYS = ['kobo.xp', 'kobo.ach', 'kobo.history', 'kobo.stats', 'kobo.daily'];
function sync(P, a, b) {
  const sm = P.syncMap();
  for (const k of SYNC_KEYS) {
    const f = sm[k].merge, x = a.storage.getItem(k), y = b.storage.getItem(k);
    if (x == null && y == null) continue;
    const ab = f(x, y, { localT: 1, remoteT: 2 }), ba = f(y, x, { localT: 2, remoteT: 1 });
    eq(norm(ab), norm(ba), 'merge is commutative for ' + k);
    a.storage.setItem(k, ab); b.storage.setItem(k, ab);
  }
}
const sortDeep = x => Array.isArray(x) ? x.map(sortDeep) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, sortDeep(x[k])])) : x;
const norm = s => JSON.stringify(sortDeep(JSON.parse(s)));

// ------------------------------------------------------------------ レベルとランク
test('levels: cumulative 25L²+25L−50 (Lv10 2,700, Lv30 23,200), need(L) = 50(L+1), max 999', () => {
  const { platform: P } = fresh(); const X = P.xp;
  eq(X.xpForLevel(1), 0); eq(X.xpForLevel(2), 100); eq(X.xpForLevel(10), 2700); eq(X.xpForLevel(30), 23200);
  for (let L = 1; L < 60; L++) eq(X.xpForLevel(L + 1) - X.xpForLevel(L), 50 * (L + 1), 'need ' + L);
  eq(X.levelInfo(0).lv, 1); eq(X.levelInfo(99).lv, 1); eq(X.levelInfo(100).lv, 2);
  eq(X.levelInfo(2699).lv, 9); eq(X.levelInfo(2700).lv, 10);
  deep(X.levelInfo(2750), { lv: 10, total: 2750, into: 50, need: 550, next: 3250 });
  for (let L = 1; L < 400; L += 7) { eq(X.levelInfo(X.xpForLevel(L)).lv, L); eq(X.levelInfo(X.xpForLevel(L) - 1).lv, Math.max(1, L - 1)); }
  eq(X.levelInfo(1e12).lv, 999); eq(X.levelInfo(1e12).need, 0); eq(X.levelInfo(-5).lv, 1); eq(X.levelInfo('x').lv, 1);
});

test('rank names (ja + en) at Lv1/5/10/20/30/50/80', () => {
  const { platform: P } = fresh(); const X = P.xp;
  const at = lv => X.rankFor(lv).ja;
  eq(at(1), '見習い'); eq(at(4), '見習い'); eq(at(5), '常連'); eq(at(9), '常連'); eq(at(10), '腕きき'); eq(at(20), '職人');
  eq(at(30), '名人'); eq(at(49), '名人'); eq(at(50), '匠'); eq(at(80), 'ひまつぶしの達人'); eq(at(999), 'ひまつぶしの達人');
  ok(X.RANKS.every(r => r.en && r.ja)); eq(X.rankFor(25).id, 'lv:20'); eq(X.rankTitle(80, 'en'), 'Pastime Grandmaster');
});

// ------------------------------------------------------------------ 1回のプレイ
test('formula (4.1): played 5 (≥20s or a clear), 3/min up to 15, clears 10×≤3, best 20; practice 0; versus no clear/best', () => {
  const { platform: P } = fresh(); const f = o => P.xp.playParts(Object.assign({ mode: 'normal', durationMs: 0, clears: 0, best: false }, o));
  deep(f({ durationMs: 19999 }), { played: 0, time: 0, clear: 0, best: 0 });
  deep(f({ durationMs: 20000 }), { played: 5, time: 0, clear: 0, best: 0 });
  deep(f({ durationMs: 59999 }), { played: 5, time: 0, clear: 0, best: 0 });
  deep(f({ durationMs: 60000 }), { played: 5, time: 3, clear: 0, best: 0 });
  deep(f({ durationMs: 4 * MIN + 59999 }), { played: 5, time: 12, clear: 0, best: 0 });
  deep(f({ durationMs: 60 * MIN }), { played: 5, time: 15, clear: 0, best: 0 }, 'time capped at 15');
  deep(f({ durationMs: 5000, clears: 1 }), { played: 5, time: 0, clear: 10, best: 0 }, 'a quick stage clear still counts as played');
  deep(f({ durationMs: 5000, clears: 9 }), { played: 5, time: 0, clear: 30, best: 0 }, 'clears capped at 3');
  deep(f({ durationMs: 30000, best: true }), { played: 5, time: 0, clear: 0, best: 20 });
  deep(f({ mode: 'daily', durationMs: 30000, best: true }), { played: 5, time: 0, clear: 0, best: 0 }, 'no best bonus outside normal');
  deep(f({ mode: 'versus', durationMs: 3 * MIN, clears: 2, best: true }), { played: 5, time: 9, clear: 0, best: 0 });
  deep(f({ mode: 'practice', durationMs: 30 * MIN, clears: 3, best: true }), { played: 0, time: 0, clear: 0, best: 0 });
  deep(f({ durationMs: 30000, short: true }), { played: 0, time: 0, clear: 0, best: 0 }, 'short-play streak zeroes "played"');
});

test('events: play_end awards XP once, reported in played.xp and an xp event; practice/versus handled', () => {
  const d = device('devaaa'); const P = d.use();
  const evs = []; P.on('xp', x => evs.push(x));
  fixedNow(T0);
  const r = play(P, 'blocks', { t: T0, dur: 2 * MIN, best: true, score: 500 });
  eq(r.gained, 5 + 6 + 20); deep(r.parts, { played: 5, time: 6, clear: 0, best: 20 });
  eq(evs.length, 1); eq(evs[0].gained, 31); eq(evs[0].source, 'play'); eq(P.xp.total(T0), 31);
  eq(play(P, 'blocks', { t: T0 + MIN, dur: 10 * MIN, mode: 'practice' }), null, 'practice records nothing (no played event)');
  eq(play(P, 'blocks', { t: T0 + 2 * MIN, dur: 3 * MIN, mode: 'versus', best: true }).gained, 5 + 9);
  const w = play(P, 'water', { t: T0 + 3 * MIN, dur: 40000, clears: 1, reason: 'clear', best: true });
  eq(w.gained, 5 + 10 + 20, 'stage clear + new best');
  // a clear without a stage_clear event still counts once (water emits play_end reason clear)
  eq(play(P, 'parking', { t: T0 + 4 * MIN, dur: 15000, reason: 'clear' }).gained, 15);
  eq(P.xp.total(T0 + 5 * MIN), 31 + 14 + 35 + 15);
});

test('anti-cheat: time XP uses the shorter of durationMs and wall time', () => {
  const d = device('devbbb'); const P = d.use();
  const r = play(P, 'drop', { t: T0, dur: 10 * MIN, wallMs: 30000 });
  deep(r.parts, { played: 5, time: 0, clear: 0, best: 0 });
});

// ------------------------------------------------------------------ 逓減と上限
test('diminishing returns: plays 1–5 full, 6–10 half, then a quarter (per game per JST day)', () => {
  const d = device('devccc'); const P = d.use();
  const got = [];
  for (let i = 0; i < 14; i++) got.push(play(P, 'blocks', { t: T0 + i * 10 * MIN, dur: 2 * MIN }).gained); // base 11
  deep(got, [11, 11, 11, 11, 11, 6, 6, 6, 6, 6, 3, 3, 3, 3]);
  eq(play(P, 'drop', { t: T0 + 200 * MIN, dur: 2 * MIN }).gained, 11, 'another game is not affected');
  eq(play(P, 'blocks', { t: jst(2026, 11, 5, 0, 5), dur: 2 * MIN }).gained, 11, 'the next JST day starts fresh');
});

test('caps: 200 per game per day, 800 per day overall; daily and achievements are outside the caps', () => {
  const d = device('devddd'); const P = d.use();
  let t = jst(2026, 11, 4, 1), sum = 0, r;
  for (let i = 0; i < 40; i++) { r = play(P, 'water', { t: t += 5 * MIN, dur: 3 * MIN, clears: 3, best: true }); sum += r.gained; }
  eq(sum, 200, 'one game stops at 200'); eq(r.gained, 0); eq(r.capped, true);
  for (const g of ['blocks', 'drop', 'raft', 'gates', 'n59049']) for (let i = 0; i < 40; i++) play(P, g, { t: t += 5 * MIN, dur: 5 * MIN, clears: 3, best: true });
  eq(P.xp.totals(t).today.play, 800, 'all games together stop at 800');
  eq(play(P, 'neji', { t: t += MIN, dur: 5 * MIN, best: true }).gained, 0);
  // daily first clear is outside the cap
  const dk = P.jstDateKey(t);
  const dr = play(P, 'blocks', { t: t += MIN, dur: 2 * MIN, mode: 'daily', dateKey: dk, reason: 'over', score: 100 });
  eq(dr.daily, 50); eq(dr.gained, 50);
  const g0 = P.xp.total(t);
  eq(P.xp.grantAchievement('test.x', 25, { t }).gained, 25, 'achievement XP outside the cap');
  eq(P.xp.total(t), g0 + 25);
});

test('cap boundary follows the JST day (00:00 JST = 15:00 UTC), not the device time zone', () => {
  const d = device('deveee'); const P = d.use();
  let s1 = 0, s2 = 0;
  for (let i = 0; i < 30; i++) s1 += play(P, 'gates', { t: jst(2026, 11, 4, 23, 0) + i * MIN, dur: 3 * MIN, clears: 3, best: true }).gained; // 23:00–23:29 JST
  eq(s1, 200);
  const late = play(P, 'gates', { t: jst(2026, 11, 4, 23, 59, 59), dur: 3 * MIN, clears: 1 }).gained;
  eq(late, 0, '23:59:59 JST is still the same day');
  s2 = play(P, 'gates', { t: jst(2026, 11, 5, 0, 0, 1), dur: 3 * MIN, clears: 1 }).gained;
  ok(s2 > 0, '00:00:01 JST is a new day');
  deep(Object.keys(d.get('kobo.xp').d).sort(), ['20261104', '20261105']);
});

test('short plays: 8 of the last 10 under 20 s → "played" is 0 for that game for the rest of the JST day', () => {
  const d = device('devfff'); const P = d.use();
  let t = T0;
  for (let i = 0; i < 8; i++) play(P, 'blocks', { t: t += MIN, dur: 5000 });
  const r = play(P, 'blocks', { t: t += 5 * MIN, dur: 2 * MIN });
  eq(r.short, true); deep(r.parts, { played: 0, time: 6, clear: 0, best: 0 });
  eq(play(P, 'drop', { t: t += 5 * MIN, dur: 2 * MIN }).parts.played, 5, 'other games keep "played"');
  for (let i = 0; i < 3; i++) play(P, 'blocks', { t: t += 5 * MIN, dur: 2 * MIN });
  eq(play(P, 'blocks', { t: t += 5 * MIN, dur: 2 * MIN }).parts.played, 0, 'sticky for the day');
  eq(play(P, 'blocks', { t: jst(2026, 11, 5, 9), dur: 2 * MIN }).parts.played, 5, 'next day, with longer plays in the window again');
});

test('daily challenge: +50 the first time each game\'s challenge is completed (today or yesterday only)', () => {
  const d = device('devggg'); const P = d.use();
  const today = P.jstDateKey(T0), yday = P.addDays(today, -1), old = P.addDays(today, -3);
  eq(play(P, 'water', { t: T0, dur: MIN, mode: 'daily', dateKey: today, reason: 'quit' }).daily, 0, 'quit is not a completion');
  eq(play(P, 'water', { t: T0 + MIN, dur: MIN, mode: 'daily', dateKey: today, reason: 'clear', score: 9000 }).daily, 50);
  eq(play(P, 'water', { t: T0 + 2 * MIN, dur: MIN, mode: 'daily', dateKey: today, reason: 'clear', score: 9500 }).daily, 0, 'once a day');
  eq(play(P, 'blocks', { t: T0 + 3 * MIN, dur: MIN, mode: 'daily', dateKey: today, reason: 'over', score: 10 }).daily, 50, 'per game');
  eq(play(P, 'water', { t: T0 + 4 * MIN, dur: MIN, mode: 'daily', dateKey: yday, reason: 'clear', score: 1 }).daily, 50, 'yesterday (grace)');
  eq(play(P, 'water', { t: T0 + 5 * MIN, dur: MIN, mode: 'daily', dateKey: old, reason: 'clear', score: 1 }).daily, 0, 'older challenges give no bonus');
  eq(d.get('kobo.xp').d[String(yday)].devggg['d:water'], 50, 'recorded on the challenge date');
});

// ------------------------------------------------------------------ 今週の XP
test('weekly XP: Monday 00:00 JST boundary, includes live achievements, excludes retroactive ones, capped at 12000', () => {
  const d = device('devhhh'); const P = d.use();
  const sun = jst(2026, 11, 8, 23, 50), mon = jst(2026, 11, 9, 0, 10);
  eq(P.jstWeekKey(sun) + 1, P.jstWeekKey(mon));
  play(P, 'blocks', { t: sun, dur: 2 * MIN });
  play(P, 'drop', { t: mon, dur: 2 * MIN });
  eq(P.xp.totals(mon).week, 11, 'only Monday counts'); eq(P.xp.totals(sun).week, 11); eq(P.xp.total(mon), 22);
  P.xp.grantAchievement('live.one', 25, { t: mon + MIN });
  P.xp.grantAchievement('old.one', 50, { t: mon + 2 * MIN, retro: true });
  eq(P.xp.totals(mon + 3 * MIN).week, 36); eq(P.xp.total(mon + 3 * MIN), 22 + 75);
  eq(P.xp.grantAchievement('live.one', 25, { t: mon + 4 * MIN }), null, 'an achievement is granted once');
  for (let i = 0; i < 600; i++) P.xp.grantAchievement('big.' + i, 100, { t: mon + 5 * MIN });
  eq(P.xp.totals(mon + 6 * MIN).week, 12000, 'rules cap xpw at 12000');
});

// ------------------------------------------------------------------ 複数の端末
test('two devices: per-(day, device, key) max merge never double counts; caps apply across devices', () => {
  const A = device('aaaaaa'), B = device('bbbbbb');
  let P = A.use(), t = T0;
  for (let i = 0; i < 6; i++) play(P, 'gates', { t: t += 5 * MIN, dur: 5 * MIN, clears: 3, best: true }); // 180 (diminishing on 6th)
  const aOnly = P.xp.total(t);
  P = B.use();
  for (let i = 0; i < 6; i++) play(P, 'gates', { t: t += 5 * MIN, dur: 5 * MIN, clears: 3, best: true });
  play(P, 'neji', { t: t += 5 * MIN, dur: 2 * MIN });
  const bOnly = P.xp.total(t);
  sync(P, A, B);
  P = A.use(); const ta = P.xp.total(t);
  P = B.use(); const tb = P.xp.total(t);
  eq(ta, tb, 'both devices agree');
  eq(ta, 200 + 11, 'gates capped at 200 across devices (not ' + (aOnly + bOnly) + ')');
  // syncing again (and again) changes nothing
  const before = A.storage.getItem('kobo.xp');
  sync(P, A, B); sync(P, B, A);
  eq(norm(A.storage.getItem('kobo.xp')), norm(before));
  P = A.use(); eq(P.xp.total(t), 211);
  // after the merge, B sees the cap: no more gates XP today on either device
  P = B.use(); eq(play(P, 'gates', { t: t += 5 * MIN, dur: 5 * MIN, clears: 3 }).gained, 0);
});

test('two devices: the same achievement unlocked on both counts once (kobo.ach union, earliest time)', () => {
  const A = device('aaaaaa'), B = device('bbbbbb');
  let P = A.use(); P.xp.grantAchievement('blocks.s1k', 10, { t: T0 });
  P = B.use(); P.xp.grantAchievement('blocks.s1k', 10, { t: T0 + H }); P.xp.grantAchievement('drop.s5k', 10, { t: T0 + H, retro: true });
  sync(P, A, B);
  eq(A.get('kobo.ach')['blocks.s1k'], T0, 'earliest time');
  P = A.use(); eq(P.xp.total(T0 + 2 * H), 20); eq(P.xp.totals(T0 + 2 * H).week, 10, 'retro unlock from B stays out of the week');
  P = B.use(); eq(P.xp.total(T0 + 2 * H), 20);
});

test('two devices: both clear the same daily before syncing → the 50 XP bonus counts once', () => {
  const A = device('aaaaaa'), B = device('bbbbbb'), dk = 20261104;
  let P = A.use(); eq(play(P, 'blocks', { t: T0, dur: MIN, mode: 'daily', dateKey: dk, score: 5 }).daily, 50);
  P = B.use(); eq(play(P, 'blocks', { t: T0 + MIN, dur: MIN, mode: 'daily', dateKey: dk, score: 7 }).daily, 50);
  sync(P, A, B);
  P = A.use(); eq(P.xp.totals(T0 + 2 * MIN).today.daily, 50);
  // and once synced, the other device does not award it again
  const C = device('cccccc'); for (const k of SYNC_KEYS) { const v = A.storage.getItem(k); if (v != null) C.storage.setItem(k, v); }
  P = C.use(); eq(play(P, 'blocks', { t: T0 + 3 * MIN, dur: MIN, mode: 'daily', dateKey: dk, score: 9 }).daily, 0);
});

// ------------------------------------------------------------------ 35日より古い日のまとめ
test('archive: own days older than 35 days fold into ar[dev]; total unchanged; merging an old copy does not double count', () => {
  const A = device('aaaaaa'), B = device('bbbbbb');
  let P = A.use();
  const old = jst(2026, 9, 1, 12);
  for (let i = 0; i < 3; i++) play(P, 'blocks', { t: old + i * H, dur: 2 * MIN });
  const stale = A.storage.getItem('kobo.xp'); // B has this copy from a sync long ago
  B.storage.setItem('kobo.xp', stale);
  const tot = P.xp.total(T0);
  play(P, 'drop', { t: T0, dur: 2 * MIN }); // archives on write
  const x = A.get('kobo.xp');
  ok(!x.d['20260901'], 'old day removed'); eq(x.ar.aaaaaa.xp, 33); eq(x.ar.aaaaaa.to, P.addDays(20261104, -35));
  eq(P.xp.total(T0), tot + 11);
  sync(P, A, B);
  P = B.use(); eq(P.xp.total(T0), tot + 11, 'stale copy of the old day is dropped by ar.to');
  ok(!B.get('kobo.xp').d['20260901']);
});

test('archive: two devices over the cap on the same old day → archived shares add up to the capped total', () => {
  const run2 = order => {
    const A = device('aaaaaa'), B = device('bbbbbb'), old = jst(2026, 9, 1, 8);
    let P = A.use(); for (let i = 0; i < 8; i++) play(P, 'water', { t: old + i * 5 * MIN, dur: 3 * MIN, clears: 3, best: true });
    P = B.use(); for (let i = 0; i < 8; i++) play(P, 'water', { t: old + H + i * 5 * MIN, dur: 3 * MIN, clears: 3, best: true });
    sync(P, A, B);
    P = A.use(); const capped = P.xp.total(T0); eq(capped, 200);
    const [first, second] = order === 'ab' ? [A, B] : [B, A];
    P = first.use(); P.xp.archive(T0); sync(P, A, B);
    P = second.use(); P.xp.archive(T0); sync(P, A, B);
    P = A.use(); eq(P.xp.total(T0), 200, order + ': A'); P = B.use(); eq(P.xp.total(T0), 200, order + ': B');
    const x = A.get('kobo.xp'); eq(x.ar.aaaaaa.xp + x.ar.bbbbbb.xp, 200); deep(x.d, {});
  };
  run2('ab'); run2('ba');
});

test('archive: both devices archive concurrently (before syncing) → never more than the capped total', () => {
  const A = device('aaaaaa'), B = device('bbbbbb'), old = jst(2026, 9, 1, 8);
  let P = A.use(); for (let i = 0; i < 8; i++) play(P, 'water', { t: old + i * 5 * MIN, dur: 3 * MIN, clears: 3, best: true });
  P = B.use(); for (let i = 0; i < 8; i++) play(P, 'water', { t: old + H + i * 5 * MIN, dur: 3 * MIN, clears: 3, best: true });
  sync(P, A, B);
  P = A.use(); P.xp.archive(T0); P = B.use(); P.xp.archive(T0);
  sync(P, A, B);
  P = A.use(); ok(P.xp.total(T0) <= 200, 'got ' + P.xp.total(T0));
});

// ------------------------------------------------------------------ マージ関数
test('merge.xp: old shape (numeric arch) still merges like before; unknown slot keys kept', () => {
  const { platform: P } = fresh(); const m = P.merge.xp;
  deep(JSON.parse(m(S({ v: 1, d: { 20261104: { dA: { blocks: 50, _a: 25 } } }, arch: 100 }), S({ v: 1, d: { 20261104: { dA: { blocks: 40 }, dB: { neji: 10 } } }, arch: 300 }))),
    { v: 1, d: { 20261104: { dA: { blocks: 50, _a: 25 }, dB: { neji: 10 } } }, arch: 300 });
  deep(JSON.parse(m(S({ ar: { dA: { to: 20261001, xp: 50 } } }), S({ ar: { dA: { to: 20261005, xp: 70 } }, d: { 20261003: { dA: { blocks: 9 }, dB: { blocks: 1 } } } }))),
    { ar: { dA: { to: 20261005, xp: 70 } }, d: { 20261003: { dB: { blocks: 1 } } } }, 'the newer archive wins and prunes its device\'s old rows');
  eq(m(null, S({ v: 1 })), S({ v: 1 }));
});

test('merge.xp: commutative, idempotent and associative on random ledgers', () => {
  const { platform: P } = fresh(); const m = P.merge.xp, r = P.rng(11), ri = n => Math.floor(r() * n);
  const devs = ['d1', 'd2', 'd3'], days = [20261001, 20261003, 20261104, 20261105];
  const gen = () => {
    const o = { v: 1, d: {}, ar: {}, a: {}, r: {} };
    for (let i = 0; i < 6; i++) { const day = days[ri(4)], dv = devs[ri(3)]; o.d[day] = o.d[day] || {}; o.d[day][dv] = { blocks: ri(200), 'n:blocks': ri(9), ['d:' + ['water', 'neji'][ri(2)]]: ri(2) * 50 }; }
    if (ri(2)) o.ar[devs[ri(3)]] = { to: days[ri(4)], xp: ri(500) };
    o.a['x' + ri(4)] = 10 * ri(4); if (ri(2)) o.r['x' + ri(4)] = 1;
    return S(o);
  };
  for (let i = 0; i < 300; i++) {
    const a = gen(), b = gen(), c = gen();
    const ab = m(a, b), ba = m(b, a);
    eq(norm(ab), norm(ba), 'commutative');
    eq(norm(m(ab, ab)), norm(ab), 'idempotent'); eq(norm(m(ab, a)), norm(ab), 'absorbs');
    eq(norm(m(m(a, b), c)), norm(m(a, m(b, c))), 'associative');
  }
});

// ------------------------------------------------------------------ いくつかのタイムゾーンで
if (!process.env.XP_TZ_ONCE) {
  test('the same results in other device time zones', () => {
    for (const tz of ['America/Los_Angeles', 'Pacific/Kiritimati', 'Europe/London', 'Australia/Lord_Howe']) {
      const r = spawnSync(process.execPath, [__filename], { env: Object.assign({}, process.env, { TZ: tz, XP_TZ_ONCE: '1' }), encoding: 'utf8' });
      ok(r.status === 0, tz + ':\n' + r.stdout + r.stderr);
    }
  });
}

run('xp (P3-1)');
