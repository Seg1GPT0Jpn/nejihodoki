// common/platform.js の単体テスト（node だけ。偽の localStorage を使う）
// 実行：node tools/tests/unit/platform.test.js   （TZ を変えて：node tools/tests/unit/run-tz.js）
'use strict';
const { fresh, test, eq, ok, deep, throws, run, readText, fixture, fixedNow, FakeStorage } = require('./_kobo-env');

const H = 3600000, DAY = 86400000;
// 日本時間の壁時計 → UTC の ms（テストの入力を作るため。Date.UTC だけを使うので TZ に左右されない）
const jst = (y, m, d, hh = 0, mm = 0, ss = 0, ms = 0) => Date.UTC(y, m - 1, d, hh, mm, ss, ms) - 9 * H;
// 独立した答え：Intl の Asia/Tokyo
const intlKey = ms => { const f = new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Tokyo', year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date(ms)); return Number(f.replace(/-/g, '')); };
const intlDow = ms => ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'].indexOf(new Intl.DateTimeFormat('en-US', { timeZone: 'Asia/Tokyo', weekday: 'short' }).format(new Date(ms)));

// ------------------------------------------------------------------ JST date
test('jstDateKey: day boundary at 00:00 JST (= 15:00 UTC)', () => {
  const { platform: P } = fresh();
  eq(P.jstDateKey(jst(2026, 11, 4, 0, 0, 0, 0)), 20261104);
  eq(P.jstDateKey(jst(2026, 11, 4, 0, 0, 0, 0) - 1), 20261103);
  eq(P.jstDateKey(jst(2026, 11, 4, 23, 59, 59, 999)), 20261104);
  eq(P.jstDateKey(Date.UTC(2026, 10, 3, 15, 0, 0)), 20261104, '15:00Z is midnight in Tokyo');
  eq(P.jstDateKey(Date.UTC(2026, 10, 3, 14, 59, 59, 999)), 20261103);
  eq(P.jstDateKey(new Date(Date.UTC(2026, 10, 3, 15))), 20261104, 'accepts Date');
  eq(P.jstDateKey(0), 19700101); eq(P.jstDateKey(-9 * H - 1), 19691231);
});

test('jstDateKey: month/year ends and leap days', () => {
  const { platform: P } = fresh();
  eq(P.jstDateKey(jst(2026, 12, 31, 23, 59, 59, 999)), 20261231);
  eq(P.jstDateKey(jst(2027, 1, 1)), 20270101);
  eq(P.jstDateKey(jst(2028, 2, 29, 12)), 20280229);
  eq(P.jstDateKey(jst(2028, 3, 1)), 20280301);
  eq(P.jstDateKey(jst(2026, 2, 28, 23, 59)), 20260228);
  eq(P.jstDateKey(jst(2026, 3, 1)), 20260301);
});

test('jstDateKey: default argument is Date.now()', () => {
  const { platform: P } = fresh();
  fixedNow(jst(2026, 11, 4, 0, 0, 1));
  eq(P.jstDateKey(), 20261104);
  fixedNow(jst(2026, 11, 3, 23, 59, 59));
  eq(P.jstDateKey(), 20261103);
});

test('jstDateKey agrees with Intl Asia/Tokyo around every hour of DST-transition days', () => {
  const { platform: P } = fresh();
  // US / EU / AU / NZ DST changes in 2026–2027, plus odd zones; check each hour ±1ms of 48h windows
  const days = [Date.UTC(2026, 2, 8), Date.UTC(2026, 10, 1), Date.UTC(2026, 2, 29), Date.UTC(2026, 9, 25), Date.UTC(2026, 3, 5), Date.UTC(2026, 8, 27), Date.UTC(2027, 2, 14), Date.UTC(2026, 11, 31)];
  let n = 0;
  for (const d of days) for (let h = -24; h <= 48; h++) for (const off of [-1, 0, 1]) {
    const ms = d + h * H + off;
    eq(P.jstDateKey(ms), intlKey(ms), new Date(ms).toISOString()); eq(P.jstParts(ms).dow, intlDow(ms), 'dow ' + new Date(ms).toISOString()); n++;
  }
  ok(n > 1500);
});

test('jstDateKey agrees with Intl for 20,000 pseudo-random instants 1990–2060', () => {
  const { platform: P } = fresh();
  const r = P.rng(42), a = Date.UTC(1990, 0, 1), b = Date.UTC(2060, 0, 1);
  for (let i = 0; i < 20000; i++) { const ms = Math.floor(a + r() * (b - a)); if (P.jstDateKey(ms) !== intlKey(ms)) throw new Error('mismatch at ' + new Date(ms).toISOString()); }
});

test('jstDateKey does not depend on the device clock zone (same result as a manual +9h computation)', () => {
  const { platform: P } = fresh();
  const ms = Date.UTC(2026, 10, 3, 20, 30);
  const d = new Date(ms + 9 * H);
  eq(P.jstDateKey(ms), d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate());
  // the device-local date may differ (e.g. New York is still Nov 3) — jstDateKey must not use it
  const local = new Date(ms); const localKey = local.getFullYear() * 10000 + (local.getMonth() + 1) * 100 + local.getDate();
  eq(P.jstDateKey(ms), 20261104);
  if (process.env.TZ === 'America/New_York') eq(localKey, 20261103, 'sanity: local date differs in NY');
});

test('jstWeekKey switches at Monday 00:00 JST and matches the rules formula', () => {
  const { platform: P } = fresh();
  const mon = jst(2026, 11, 2); // Monday
  eq(intlDow(mon), 1, 'fixture is a Monday in Tokyo');
  eq(P.jstWeekKey(mon), P.jstWeekKey(mon - 1) + 1);
  eq(P.jstWeekKey(mon), P.jstWeekKey(mon + 7 * DAY - 1));
  eq(P.jstWeekKey(mon + 7 * DAY), P.jstWeekKey(mon) + 1);
  eq(P.jstWeekKey(mon), Math.floor((mon + 32400000 + 259200000) / 604800000), 'firestore weekKey()');
  // every Monday 00:00 JST over two years is a boundary, nothing else is
  for (let t = mon - 400 * DAY; t < mon + 400 * DAY; t += DAY) {
    const boundary = P.jstWeekKey(t) !== P.jstWeekKey(t - 1);
    eq(boundary, intlDow(t) === 1, new Date(t).toISOString());
  }
});

test('jstParts, jstDayStart, addDays, daysBetween, isDateKey', () => {
  const { platform: P } = fresh();
  deep(P.jstParts(jst(2026, 11, 4, 7, 5)), { y: 2026, m: 11, d: 4, hh: 7, mm: 5, dow: 3 });
  eq(P.jstDayStart(20261104), jst(2026, 11, 4));
  eq(P.jstDateKey(P.jstDayStart(20261104)), 20261104); eq(P.jstDateKey(P.jstDayStart(20261104) - 1), 20261103);
  eq(P.addDays(20261231, 1), 20270101); eq(P.addDays(20260301, -1), 20260228); eq(P.addDays(20280301, -1), 20280229);
  eq(P.addDays(20261104, -60), 20260905);
  eq(P.daysBetween(20261104, 20261111), 7); eq(P.daysBetween(20261231, 20270101), 1);
  ok(P.isDateKey(20261104) && P.isDateKey('20280229'));
  ok(!P.isDateKey(20260229) && !P.isDateKey(20261332) && !P.isDateKey('2026114') && !P.isDateKey('abc') && !P.isDateKey(null));
  ok(Number.isNaN(P.jstDayStart(20261340)));
});

// ------------------------------------------------------------------ hash / rng
test('hash32 = xmur3 (reference implementation) and golden values', () => {
  const { platform: P } = fresh();
  function xmur3ref(str) { // bryc's reference
    for (var i = 0, h = 1779033703 ^ str.length; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 3432918353), h = h << 13 | h >>> 19;
    return function () { h = Math.imul(h ^ h >>> 16, 2246822507); h = Math.imul(h ^ h >>> 13, 3266489909); return (h ^= h >>> 16) >>> 0; };
  }
  for (const s of ['', 'a', 'kobo:blocks:20261104', 'あいう', 'x'.repeat(1000)]) {
    eq(P.hash32(s), xmur3ref(s)(), s.slice(0, 20));
    const g1 = P.xmur3(s), g2 = xmur3ref(s); for (let i = 0; i < 5; i++) eq(g1(), g2());
  }
  eq(P.hash32(''), 167010153); eq(P.hash32('kobo:blocks:20261104'), 3497277783); eq(P.hash32('あいう'), 797632956);
  ok(P.hash32('kobo:blocks:20261104') !== P.hash32('kobo:blocks:20261105'));
  eq(P.hash32(12345), P.hash32('12345'), 'non-strings are stringified');
});

test('rng = mulberry32, identical sequence to KoboVersus.rng (versus.js)', () => {
  const { platform: P } = fresh();
  const src = readText('common/versus.js');
  const fnSrc = src.slice(src.indexOf('  function rng(seed) {'), src.indexOf('  // ----', src.indexOf('  function rng(seed) {')));
  const vrng = new Function(fnSrc + '\nreturn rng;')();
  for (const seed of [0, 1, 42, 12345, 0xffffffff, -7, 2 ** 32 + 5, 20261104]) {
    const a = P.rng(seed), b = vrng(seed);
    for (let i = 0; i < 100; i++) eq(a(), b(), 'seed ' + seed + ' #' + i);
  }
  const r = P.rng(12345);
  deep([r(), r(), r()], [0.9797282677609473, 0.3067522644996643, 0.484205421525985], 'golden');
  const u = P.rng(9); for (let i = 0; i < 10000; i++) { const x = u(); ok(x >= 0 && x < 1); }
  const q = P.rng(5); for (let i = 0; i < 1000; i++) { const k = q.int(6); ok(k >= 0 && k < 6 && Number.isInteger(k)); }
  eq(P.rng(3).pick(['a', 'b', 'c']), P.rng(3).pick(['a', 'b', 'c']));
});

test('dailySeed = hash32("kobo:" + game + ":" + dateKey); defaults to today (JST)', () => {
  const { platform: P } = fresh();
  eq(P.dailySeed('neji', 20261104), P.hash32('kobo:neji:20261104'));
  eq(P.dailySeed('neji', 20261104), 3584409700);
  fixedNow(jst(2026, 11, 4, 0, 0, 0));
  eq(P.dailySeed('blocks'), P.hash32('kobo:blocks:20261104'));
  eq(P.daily.seed, P.dailySeed);
});

// ------------------------------------------------------------------ storage
test('store: JSON helpers over localStorage', () => {
  const st = new FakeStorage(); const { platform: P } = fresh({ storage: st });
  ok(P.store.available());
  P.store.set('kobo.x', { a: 1 }); eq(st.getItem('kobo.x'), '{"a":1}'); deep(P.store.get('kobo.x'), { a: 1 });
  st.setItem('kobo.bad', '{oops'); eq(P.store.get('kobo.bad', 'd'), 'd');
  eq(P.store.get('missing', 7), 7); eq(P.store.raw('missing'), null);
  P.store.del('kobo.x'); eq(st.getItem('kobo.x'), null);
});

test('store: falls back to memory when localStorage throws (private mode) or is full', () => {
  let { platform: P } = fresh({ storage: 'throw' });
  ok(!P.store.available());
  P.store.set('kobo.fav', { blocks: 5 }); deep(P.store.get('kobo.fav'), { blocks: 5 });
  P.fav.set('neji', true); ok(P.fav.has('neji'));
  P.history.add({ g: 'blocks', t: 1, d: 5, s: 3, m: 'normal' }); eq(P.history.list().length, 1);
  eq(typeof P.devId(), 'string');
  const st = new FakeStorage(); st.throwOnSet = true;
  ({ platform: P } = fresh({ storage: st }));
  ok(!P.store.available());
  P.store.set('kobo.history', [{ g: 'x' }]); eq(P.store.get('kobo.history')[0].g, 'x');
  ({ platform: P } = fresh({ storage: null }));
  P.store.set('k', 1); eq(P.store.get('k'), 1);
  P.emit('play_start', { game: 'blocks', mode: 'normal' }); P.emit('play_end', { game: 'blocks', score: 5, durationMs: 1000 });
  eq(P.history.list().length, 1, 'events still processed without storage');
});

test('devId is stable, local-only and never in the sync map', () => {
  const st = new FakeStorage(); let { platform: P } = fresh({ storage: st });
  const a = P.devId(); ok(/^[a-z0-9]{10}$/.test(a)); eq(P.devId(), a); eq(st.getItem('kobo.dev'), a);
  ({ platform: P } = fresh({ storage: st })); eq(P.devId(), a, 'persists');
  ok(!('kobo.dev' in P.syncMap()) && !('kobo.plays' in P.syncMap()) && !('kobo.migrated' in P.syncMap()));
});

// ------------------------------------------------------------------ events
test('event bus: on/off/once/wildcard, listener errors are isolated', () => {
  const { platform: P } = fresh();
  const got = [];
  const off = P.on('best', p => got.push('a' + p.score));
  P.on('best', () => { throw new Error('boom'); });
  P.once('best', p => got.push('once' + p.score));
  const offAll = P.on('*', (p, type) => got.push('*' + type));
  const warn = console.warn; console.warn = () => {};
  P.emit('best', { score: 1 }); off(); P.emit('best', { score: 2 }); offAll(); P.emit('best', { score: 3 });
  console.warn = warn;
  deep(got, ['a1', 'once1', '*best', '*best']);
  eq(typeof P.on('x', null), 'function', 'bad listener is ignored');
  deep(P.emit('nothing'), {}, 'emit returns payload');
});

test('play_start/play_end → history, stats, popularity counter; played event', () => {
  const st = new FakeStorage(); const { platform: P } = fresh({ storage: st });
  const t0 = jst(2026, 11, 4, 10); fixedNow(t0);
  const played = []; P.on('played', p => played.push(p));
  P.emit('play_start', { game: 'blocks', mode: 'normal', t: t0 });
  fixedNow(t0 + 65000);
  P.emit('play_end', { game: 'blocks', score: 1234, reason: 'over', t: t0 + 65000 });
  const h = P.history.list(); eq(h.length, 1);
  deep(h[0], { g: 'blocks', t: t0, d: 65000, s: 1234, m: 'normal' });
  deep(P.stats.get('blocks'), { plays: 1, ms: 65000, clears: 0 });
  deep(P.plays.today(), { blocks: 1 });
  eq(played.length, 1); eq(played[0].rankable, true); eq(played[0].entry.s, 1234);
  // explicit durationMs wins, junk is clamped
  P.emit('play_start', { game: 'drop' }); P.emit('play_end', { game: 'drop', score: -5, durationMs: 'abc' });
  eq(P.history.list()[0].s, 0); eq(P.history.list()[0].d, 0);
  // unknown games are ignored
  P.emit('play_start', { game: 'zzz' }); P.emit('play_end', { game: 'zzz', score: 1 });
  eq(P.history.list().length, 2);
});

test('stage_clear counts clears; a clear play_end without stage_clear counts one', () => {
  const { platform: P } = fresh();
  P.emit('play_start', { game: 'water' });
  P.emit('stage_clear', { game: 'water', stage: 3 }); P.emit('stage_clear', { game: 'water', stage: 4 });
  P.emit('play_end', { game: 'water', reason: 'clear', score: 0, durationMs: 1000 });
  eq(P.stats.get('water').clears, 2);
  P.emit('play_start', { game: 'parking' }); P.emit('play_end', { game: 'parking', reason: 'clear', durationMs: 10 });
  eq(P.stats.get('parking').clears, 1);
  P.emit('stage_clear', { game: 'neji', stage: 1 }); eq(P.stats.get('neji').clears, 1, 'outside a session');
});

test('mode rules: practice records nothing; versus → history+stats only; daily → kobo.daily', () => {
  const { platform: P } = fresh();
  const t0 = jst(2026, 11, 4, 23, 58); fixedNow(t0);
  const played = []; P.on('played', p => played.push(p));
  P.emit('play_start', { game: 'blocks', mode: 'practice' }); P.emit('stage_clear', { game: 'blocks' }); P.emit('play_end', { game: 'blocks', score: 99 });
  eq(P.history.list().length, 0); deep(P.plays.today(), {}); eq(P.stats.get('blocks').plays, 0); eq(P.stats.get('blocks').clears, 0);
  P.emit('play_start', { game: 'blocks', mode: 'versus' }); P.emit('play_end', { game: 'blocks', score: 50, durationMs: 180000 });
  eq(P.history.list()[0].m, 'versus'); eq(played[0].rankable, false); deep(P.daily.get(), {});
  // daily started before midnight, ended after: counts for the day it started
  P.emit('play_start', { game: 'neji', mode: 'daily', t: t0 });
  fixedNow(t0 + 5 * 60000);
  P.emit('play_end', { game: 'neji', score: 800, reason: 'clear' });
  const d = P.daily.get(20261104, 'neji');
  eq(d.best, 800); eq(d.tries, 1); eq(d.clearedAt, t0 + 5 * 60000);
  eq(played[1].rankable, true); eq(played[1].daily.best, 800);
  // later tries: best keeps the better value, clearedAt the first, quit does not set best
  P.emit('play_start', { game: 'neji', mode: 'daily', dateKey: 20261104 }); P.emit('play_end', { game: 'neji', score: 500, reason: 'clear' });
  P.emit('play_start', { game: 'neji', mode: 'daily', dateKey: 20261104 }); P.emit('play_end', { game: 'neji', score: 9000, reason: 'quit' });
  const d2 = P.daily.get(20261104, 'neji'); eq(d2.best, 800); eq(d2.tries, 3); eq(d2.clearedAt, t0 + 5 * 60000);
});

test('history keeps the newest 50, deduped by (g, t)', () => {
  const { platform: P } = fresh();
  for (let i = 0; i < 60; i++) P.history.add({ g: 'drop', t: 1000 + i, d: 1, s: i, m: 'normal' });
  P.history.add({ g: 'drop', t: 1059, d: 1, s: 999 });
  const h = P.history.list(); eq(h.length, 50); eq(h[0].t, 1059); eq(h[49].t, 1010);
  eq(P.history.last('drop').t, 1059); eq(P.history.last('neji'), null);
  eq(P.history.add({ g: 'nope', t: 1 }), null);
  P.history.add({ g: 'raft', t: 5000, m: 'weird' }); eq(P.history.list()[0].m, 'normal');
  P.history.clear(); eq(P.history.list().length, 0);
});

test('favorites: set/toggle/list with tombstones; same-ms toggles still order correctly', () => {
  const st = new FakeStorage(); const { platform: P } = fresh({ storage: st });
  fixedNow(1000);
  P.fav.set('blocks', true); P.fav.set('neji', true); ok(P.fav.has('blocks'));
  P.fav.toggle('blocks'); ok(!P.fav.has('blocks'));
  P.fav.toggle('blocks'); ok(P.fav.has('blocks'));
  const raw = JSON.parse(st.getItem('kobo.fav'));
  ok(raw.blocks > 0 && Math.abs(raw.blocks) > 1001, 'monotonic time within one ms: ' + raw.blocks);
  fixedNow(5000); P.fav.set('hole', true); P.fav.set('neji', false);
  deep(P.fav.list(), ['hole', 'blocks']);
  ok(!P.fav.set('zzz', true), 'unknown id rejected');
});

test('stats are per device and summed across devices', () => {
  const st = new FakeStorage({ 'kobo.dev': 'devaaaaaaa', 'kobo.stats': { devbbbbbbb: { blocks: { plays: 3, ms: 3000, clears: 1 } } } });
  const { platform: P } = fresh({ storage: st });
  P.stats.record('blocks', { plays: 2, ms: 500 });
  deep(P.stats.get('blocks'), { plays: 5, ms: 3500, clears: 1 });
  deep(JSON.parse(st.getItem('kobo.stats')).devaaaaaaa.blocks, { plays: 2, ms: 500, clears: 0 });
  eq(Object.keys(P.stats.all()).length, 9);
});

test('popularity counter: per JST day, anonymous, pending/markSent, 35-day pruning', () => {
  const st = new FakeStorage(); const { platform: P } = fresh({ storage: st });
  const t = jst(2026, 11, 4, 12); fixedNow(t);
  P.plays.count('blocks'); P.plays.count('blocks'); P.plays.count('neji', jst(2026, 11, 3, 23, 59));
  deep(P.plays.today(), { blocks: 2 });
  const pend = P.plays.pending();
  deep(pend.map(x => x.dateKey + x.game).sort(), ['20261103neji', '20261104blocks']);
  eq(pend.find(x => x.game === 'blocks').week, 'w' + P.jstWeekKey(t));
  P.plays.markSent(20261104, 'blocks');
  deep(P.plays.pending().map(x => x.game), ['neji']);
  deep(P.plays.local(7), { blocks: 2, neji: 1 });
  // what is stored has no ids, names or uids: only dates, game ids and counts
  const raw = st.getItem('kobo.plays');
  ok(!/dev|uid|nick/.test(raw), raw);
  fixedNow(t + 40 * DAY); P.plays.count('drop');
  const o = JSON.parse(st.getItem('kobo.plays'));
  deep(Object.keys(o.d), [String(P.jstDateKey(t + 40 * DAY))], 'old days pruned');
  deep(o.sent, {}, 'old sent marks pruned');
});

test('daily.record ignores bad input and prunes >60 days', () => {
  const st = new FakeStorage(); const { platform: P } = fresh({ storage: st });
  fixedNow(jst(2026, 11, 4, 12));
  eq(P.daily.record('nope', 20261104, { score: 1 }), null);
  eq(P.daily.record('blocks', 20261340, { score: 1 }), null);
  st.setItem('kobo.daily', JSON.stringify({ 20260801: { blocks: { best: 1 } }, junk: {} }));
  P.daily.record('blocks', 20261104, { score: 10, cleared: true });
  deep(Object.keys(P.daily.get()), ['20261104']);
});

// ------------------------------------------------------------------ merge
const M = () => fresh().platform.merge;
const S = JSON.stringify;
test('merge engine: primitives', () => {
  const m = M();
  eq(m.value('max', 3, 5), 5); eq(m.value('max', 5, undefined), 5); eq(m.value('max', undefined, 2), 2);
  eq(m.value('min', 3, 5), 3); eq(m.value('minPos', 0, 4), 4); eq(m.value('minPos', 2, 4), 2); eq(m.value('minPos', 0, 0), 0);
  eq(m.value('newest', 'a', 'b', { localT: 2, remoteT: 1 }), 'a'); eq(m.value('newest', 'a', 'b', { localT: 1, remoteT: 2 }), 'b');
  eq(m.value('newest', 'a', 'b', {}), m.value('newest', 'b', 'a', {}), 'tie is symmetric');
  deep(m.value('union', ['kuro', 'a'], ['kuro', 'b'], { localT: 1, remoteT: 2 }), ['kuro', 'b', 'a']);
  deep(m.value('arrMax', [1, 5, 0], [2, 1, 0, 3]), [2, 5, 0, 3]);
  deep(m.value('mapMax', { 1: 3, 2: 1 }, { 2: 2, 3: 1 }), { 1: 3, 2: 2, 3: 1 });
  eq(m.value('max', 'x', 3), 3, 'non-number loses to number');
});

test('merge.make: string API; null / broken JSON on one side returns the other', () => {
  const m = M(); const f = m.make({ fields: { best: 'max' } });
  eq(f(null, '{"best":2}'), '{"best":2}'); eq(f('{"best":2}', null), '{"best":2}');
  eq(f('{oops', '{"best":3}'), '{"best":3}'); eq(f('{"best":3}', 'garbage'), '{"best":3}');
  eq(f(null, null), null); eq(f('{bad', null), '{bad');
  deep(f.rule, { fields: { best: 'max' } });
});

test('R4 water/parking: best is max, stars per level max, level from the newer device (fixture)', () => {
  const { platform: P } = fresh();
  const fx = fixture('cloud/r4-water-field-merge.json');
  const merge = P.syncMap()['kusoge.water.save'].merge;
  const out = JSON.parse(merge(S(fx.local['kusoge.water.save']), S(fx.remote['kusoge.water.save'].v), { localT: fx.mtime['kusoge.water.save'], remoteT: fx.remote['kusoge.water.save'].t }));
  for (const e of fx.expect) ok(out[e.path] >= e.min, e.path);
  eq(out.level, 3, 'level follows the newer device'); eq(out.best, 9);
  const out2 = JSON.parse(P.syncMap()['kusoge.parking.save'].merge('{"level":4,"best":4,"stars":{"1":3,"2":1}}', '{"level":2,"best":6,"stars":{"2":3,"5":1}}', { localT: 9, remoteT: 1 }));
  deep(out2, { level: 4, best: 6, stars: { 1: 3, 2: 3, 5: 1 } });
});

test('R4 hole: skins union, best rank+points as a pair, perks/camp max, coins newest (fixture)', () => {
  const { platform: P } = fresh();
  const fx = fixture('cloud/r4-hole-skins.json');
  const merge = P.syncMap()['kusoge.hole.save'].merge;
  const L = fx.local['kusoge.hole.save'], R = fx.remote['kusoge.hole.save'].v;
  const out = JSON.parse(merge(S(L), S(R), { localT: fx.mtime['kusoge.hole.save'], remoteT: fx.remote['kusoge.hole.save'].t }));
  ok(out.skins.owned.includes('sora') && out.skins.owned.includes('ichigo'), 'union');
  eq(out.skins.sel, 'kuro', 'selected skin follows the newer device');
  eq(out.best.matchRank, 2); eq(out.best.matchPts, 300, 'pair from the better rank'); eq(out.best.maxSize, 5);
  eq(out.coins, 80, 'coins: newer device'); eq(out.wins, 1);
  const a = { best: { matchRank: 1, matchPts: 200, maxPts: 900 }, camp: { open: 3, stars: [3, 2, 0], best: [90, 50, 0] }, online: { plays: 5, wins: 1, best: 2 }, perks: { size: 2, speed: 0 }, city: 4, coins: 10 };
  const b = { best: { matchRank: 1, matchPts: 450, maxPts: 450 }, camp: { open: 5, stars: [1, 3, 2, 1, 0], best: [40, 99, 60, 10, 0] }, online: { plays: 7, wins: 0, best: 0 }, perks: { size: 1, speed: 3 }, city: -1, coins: 99 };
  const o = JSON.parse(merge(S(a), S(b), { localT: 5, remoteT: 1 }));
  deep(o.best, { matchRank: 1, matchPts: 450, maxPts: 900 }, 'same rank → higher points; maxPts max');
  deep(o.camp, { open: 5, stars: [3, 3, 2, 1, 0], best: [90, 99, 60, 10, 0] });
  deep(o.online, { plays: 7, wins: 1, best: 2 }, 'online best rank: smallest positive');
  deep(o.perks, { size: 2, speed: 3 }); eq(o.city, 4); eq(o.coins, 10);
});

test('R4 gates: best/buildings/hero lv+star max; coins/mat/exp/cards/sel/stage newest; old 2D save loses to v2', () => {
  const { platform: P } = fresh();
  const merge = P.syncMap()['kusoge.gates.save'].merge;
  const v2 = fixture('saves/gates-v2.json').storage['kusoge.gates.save'];
  const other = { v: 2, best: 9, stage: 3, coins: 10, mat: 1, exp: 0, bld: { hq: 6, bar: 1 }, heroes: { ren: { lv: 3, star: 2, cards: 0 }, mina: { lv: 2, star: 0, cards: 5 } }, sel: ['mina'], runs: 31 };
  const o = JSON.parse(merge(S(v2), S(other), { localT: 1, remoteT: 2 }));
  eq(o.best, 14); eq(o.stage, 3); eq(o.coins, 10); eq(o.mat, 1); eq(o.runs, 31);
  deep(o.bld, { hq: 6, bar: 3, lab: 2, arm: 2, truck: 1 });
  deep(o.heroes, { ren: { lv: 7, star: 2, cards: 0 }, mina: { lv: 2, star: 0, cards: 5 } });
  deep(o.sel, ['mina']);
  const old2d = fixture('saves/gates-2d-old.json').storage['kusoge.gates.save'];
  deep(JSON.parse(merge(S(old2d), S(v2), { localT: 9, remoteT: 1 })), v2, 'v2 wins over unversioned 2D save');
  deep(JSON.parse(merge(S(v2), S(old2d), { localT: 1, remoteT: 9 })), v2);
});

test('neji stars/daily mapMax; vs.stats per game/field max', () => {
  const { platform: P } = fresh(); const sm = P.syncMap();
  deep(JSON.parse(sm['nejihodoki3d.stars'].merge('{"1":3,"2":1}', '{"2":2,"9":1}')), { 1: 3, 2: 2, 9: 1 });
  deep(JSON.parse(sm['nejihodoki3d.daily'].merge('{"20261104":2}', '{"20261104":3,"20261103":1}')), { 20261104: 3, 20261103: 1 });
  deep(JSON.parse(sm['kusoge.vs.stats'].merge('{"blocks":{"plays":4,"wins":1,"best":900}}', '{"blocks":{"plays":2,"wins":2,"best":100},"drop":{"plays":1,"wins":0,"best":5}}')),
    { blocks: { plays: 4, wins: 2, best: 900 }, drop: { plays: 1, wins: 0, best: 5 } });
});

test('platform merges: history, fav, stats, ach, daily, xp, profile', () => {
  const { platform: P } = fresh(); const m = P.merge;
  const h = JSON.parse(m.history(S([{ g: 'a', t: 3 }, { g: 'b', t: 1 }].map(x => Object.assign(x, { g: 'blocks' }))), S([{ g: 'blocks', t: 3 }, { g: 'neji', t: 2 }])));
  deep(h.map(x => x.g + x.t), ['blocks3', 'neji2', 'blocks1']);
  eq(JSON.parse(m.history(S(Array.from({ length: 40 }, (_, i) => ({ g: 'drop', t: i }))), S(Array.from({ length: 40 }, (_, i) => ({ g: 'raft', t: i }))))).length, 50);
  deep(JSON.parse(m.fav('{"blocks":100,"neji":-50}', '{"blocks":-200,"neji":40,"hole":7}')), { blocks: -200, neji: -50, hole: 7 });
  deep(JSON.parse(m.fav('{"blocks":-100}', '{"blocks":100}')), { blocks: 100 }, 'tie → favorite');
  deep(JSON.parse(m.stats(S({ d1: { blocks: { plays: 3, ms: 10, clears: 0 } } }), S({ d1: { blocks: { plays: 2, ms: 20, clears: 1 } }, d2: { neji: { plays: 1, ms: 1, clears: 1 } } }))),
    { d1: { blocks: { plays: 3, ms: 20, clears: 1 } }, d2: { neji: { plays: 1, ms: 1, clears: 1 } } });
  deep(JSON.parse(m.ach('{"x":500,"y":10}', '{"x":300,"z":1}')), { x: 300, y: 10, z: 1 });
  fixedNow(jst(2026, 11, 4, 12));
  deep(JSON.parse(m.daily(S({ 20261104: { blocks: { best: 10, tries: 2, clearedAt: 500 } }, 20260101: { blocks: { best: 1 } } }), S({ 20261104: { blocks: { best: 20, tries: 1, clearedAt: 900 }, neji: { best: 1, tries: 1, clearedAt: 0 } } }))),
    { 20261104: { blocks: { best: 20, tries: 2, clearedAt: 500 }, neji: { best: 1, tries: 1, clearedAt: 0 } } });
  deep(JSON.parse(m.xp(S({ v: 1, d: { 20261104: { dA: { blocks: 50, _a: 25 } } }, arch: 100 }), S({ v: 1, d: { 20261104: { dA: { blocks: 40 }, dB: { neji: 10 } } }, arch: 300 }))),
    { v: 1, d: { 20261104: { dA: { blocks: 50, _a: 25 }, dB: { neji: 10 } } }, arch: 300 });
  deep(JSON.parse(m.profile(S({ v: 1, icon: 'a', title: 't1', created: 50 }), S({ v: 1, icon: 'b', title: 't2', created: 20 }), { localT: 1, remoteT: 2 })), { v: 1, icon: 'b', title: 't2', created: 20 });
});

test('merges are idempotent and commutative (swap sides and times) on random data', () => {
  const { platform: P } = fresh(); const sm = P.syncMap(); const r = P.rng(7);
  const ri = n => Math.floor(r() * n);
  const gen = {
    'kusoge.water.save': () => ({ level: ri(9) + 1, best: ri(20) + 1, stars: { [ri(5)]: ri(4), [ri(5)]: ri(4) } }),
    'kusoge.hole.save': () => ({ best: { matchRank: ri(4), matchPts: ri(900), soloPct: ri(100), maxSize: ri(9) }, coins: ri(500), skins: { owned: ['kuro', ['a', 'b', 'c'][ri(3)]], sel: 'kuro' }, perks: { size: ri(3), speed: ri(3) }, wins: ri(5), camp: { open: ri(10) + 1, stars: [ri(4), ri(4)], best: [ri(100), ri(100)] }, online: { plays: ri(9), wins: ri(3), best: ri(4) }, city: ri(10) - 1 }),
    'kusoge.gates.save': () => ({ v: 2, best: ri(30), stage: ri(30), coins: ri(1e4), mat: ri(99), exp: ri(99), bld: { hq: ri(9) + 1, bar: ri(9) + 1 }, heroes: { ren: { lv: ri(30), star: ri(5), cards: ri(9) } }, sel: [['ren', 'mina'][ri(2)]], runs: ri(50) }),
    'kobo.stats': () => ({ ['d' + ri(3)]: { blocks: { plays: ri(9), ms: ri(9e4), clears: ri(4) } } }),
    'kobo.fav': () => ({ blocks: (ri(2) ? 1 : -1) * (ri(1e4) + 1), neji: (ri(2) ? 1 : -1) * (ri(1e4) + 1) }),
    // a stored history is always canonical (newest first, no duplicates), so generate it that way
    'kobo.history': () => JSON.parse(P.merge.history(S(Array.from({ length: ri(30) }, () => ({ g: ['blocks', 'neji'][ri(2)], t: ri(1e5), d: 1, s: 1, m: 'normal' }))), '[]')),
    'kobo.ach': () => ({ ['a' + ri(5)]: ri(1e5) + 1, ['a' + ri(5)]: ri(1e5) + 1 }),
    'kusoge.vs.stats': () => ({ blocks: { plays: ri(9), wins: ri(9), best: ri(999) } }),
  };
  const norm = s => JSON.stringify(sortDeep(JSON.parse(s)));
  const sortDeep = x => Array.isArray(x) ? x.map(sortDeep) : x && typeof x === 'object' ? Object.fromEntries(Object.keys(x).sort().map(k => [k, sortDeep(x[k])])) : x;
  for (const [k, g] of Object.entries(gen)) {
    const f = typeof sm[k] === 'object' ? sm[k].merge : null; ok(f, k);
    for (let i = 0; i < 150; i++) {
      const a = S(g()), b = S(g()), ta = ri(100), tb = ri(100);
      const ab = f(a, b, { localT: ta, remoteT: tb }), ba = f(b, a, { localT: tb, remoteT: ta });
      const unionish = k === 'kusoge.hole.save' || k === 'kobo.history';
      if (!unionish || ta !== tb) eq(norm(ab), norm(ba), k + ' commutative ' + a + ' | ' + b);
      else eq(norm(ab).length, norm(ba).length, k + ' commutative up to order');
      eq(norm(f(a, a, { localT: ta, remoteT: ta })), norm(a), k + ' idempotent');
      eq(norm(f(ab, b, { localT: Math.max(ta, tb), remoteT: tb })), norm(ab), k + ' absorbs ' + a + ' | ' + b);
    }
  }
});

test('syncMap: legacy mode returns only strings; platform keys included unless opted out', () => {
  const { platform: P } = fresh();
  const all = P.syncMap(), legacy = P.syncMap({ legacy: true });
  for (const v of Object.values(legacy)) ok(v === 'max' || v === 'newest');
  ok('kobo.history' in all && 'kobo.fav' in all && 'kobo.stats' in all && 'kobo.daily' in all);
  ok(!('kobo.history' in P.syncMap({ platform: false })));
  deep(Object.keys(P.syncMap({ games: ['drop'], platform: false, shared: false })), ['kusoge.drop.best', 'kusoge.drop.state']);
});

// ------------------------------------------------------------------ migrations
test('migrations: run once, record kobo.migrated, retry on failure, ordered by v, idempotent re-run', () => {
  const st = new FakeStorage({ 'kusoge.sound': '0' }); let { platform: P } = fresh({ storage: st });
  fixedNow(1234);
  const calls = [];
  let failOnce = true;
  P.migrations.add({ id: 'b-2', v: 2, run(ctx) { calls.push('b'); const a = ctx.store.get('kobo.audio', null) || {}; a.mute = ctx.store.raw('kusoge.sound') === '0'; ctx.store.set('kobo.audio', a); } });
  P.migrations.add({ id: 'a-1', v: 1, run() { calls.push('a'); } });
  P.migrations.add({ id: 'c-3', v: 3, run() { calls.push('c'); if (failOnce) { failOnce = false; throw new Error('not yet'); } } });
  P.migrations.add({ id: 'd-4', v: 4, run() { calls.push('d'); return false; } });
  eq(P.migrations.add({ id: 'a-1', v: 1, run() {} }), false, 'duplicate id ignored');
  throws(() => P.migrations.add({ id: 'x' }));
  const warn = console.warn; console.warn = () => {};
  const r1 = P.migrations.run();
  console.warn = warn;
  deep(calls, ['a', 'b', 'c', 'd']); deep(r1.ran, ['a-1', 'b-2']); deep(r1.failed, ['c-3', 'd-4']);
  deep(JSON.parse(st.getItem('kobo.migrated')), { 'a-1': 1234, 'b-2': 1234 });
  eq(P.migrations.version(), 2); ok(P.migrations.done('a-1') && !P.migrations.done('c-3'));
  eq(st.getItem('kusoge.sound'), '0', 'old key is kept');
  const r2 = P.migrations.run();
  deep(r2.ran, ['c-3']); deep(r2.skipped, ['a-1', 'b-2']); eq(P.migrations.version(), 3);
  deep(calls, ['a', 'b', 'c', 'd', 'c', 'd']);
  // a fresh page load: same list, nothing runs again
  ({ platform: P } = fresh({ storage: st }));
  let again = 0; P.migrations.add({ id: 'a-1', v: 1, run() { again++; } });
  P.migrations.run(); eq(again, 0);
  deep(JSON.parse(st.getItem('kobo.audio')), { mute: true });
});

// ------------------------------------------------------------------ launch / misc
test('launch(): ?daily, ?stage, ?code parsing; future daily → today', () => {
  const { platform: P } = fresh();
  fixedNow(jst(2026, 11, 4, 9));
  deep(P.launch('?daily=20261104'), { daily: 20261104, stage: null, code: null });
  deep(P.launch('?daily=20261101&stage=12&code=water:v1:abc-_9'), { daily: 20261101, stage: 12, code: 'water:v1:abc-_9' });
  eq(P.launch('?daily=20261105').daily, 20261104, 'future');
  eq(P.launch('?daily').daily, 20261104); eq(P.launch('?daily=junk').daily, 20261104);
  eq(P.launch('?stage=0').stage, null); eq(P.launch('?stage=-1').stage, null); eq(P.launch('?stage=abc').stage, null);
  eq(P.launch('?code=<script>').code, null);
  deep(P.launch(''), { daily: null, stage: null, code: null });
  globalThis.location = { search: '?stage=3' }; eq(P.launch().stage, 3); delete globalThis.location;
});

test('game/games/genres/rankable/theme', () => {
  const st = new FakeStorage(); const { platform: P } = fresh({ storage: st });
  eq(P.game('hole').title.en, 'Hole City'); eq(P.game('x'), null); eq(P.games().length, 9); eq(P.genres().length, 4);
  ok(P.rankable('normal') && P.rankable('daily') && !P.rankable('versus') && !P.rankable('practice'));
  eq(P.theme.get(), 'system'); eq(P.theme.apply(), null, 'no document in node');
  const attrs = {}; const meta = { attrs: {}, setAttribute(k, v) { this.attrs[k] = v; }, getAttribute(k) { return this.attrs[k] == null ? null : this.attrs[k]; } };
  globalThis.document = { documentElement: { setAttribute(k, v) { attrs[k] = v; } }, querySelector: q => (q.includes('[data-kb-theme-color]') ? meta : null) };
  globalThis.matchMedia = q => ({ matches: q.includes('light') });
  eq(P.theme.apply(), 'light'); eq(attrs['data-kb-theme'], 'light'); eq(meta.attrs.content, '#f4f1ea');
  P.theme.set('dark'); eq(attrs['data-kb-theme'], 'dark'); eq(st.getItem('kobo.theme'), 'dark', 'same plain string as ui.js');
  P.theme.set('weird'); eq(P.theme.get(), 'system');
  ok(!P.fx.reducedMotion());
});

test('works without games.js (registry missing): no throw, game events ignored', () => {
  const { platform: P } = fresh({ files: ['platform'] });
  eq(P.games().length, 0); eq(P.game('blocks'), null); eq(P.rankValue('blocks'), 0);
  P.emit('play_start', { game: 'blocks' }); P.emit('play_end', { game: 'blocks', score: 1 });
  eq(P.history.list().length, 0);
  ok(Object.keys(P.syncMap()).every(k => k.startsWith('kobo.')));
  eq(P.jstDateKey(jst(2026, 11, 4)), 20261104);
});

run('platform');
