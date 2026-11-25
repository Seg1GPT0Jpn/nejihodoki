// manabi/social.js：リーグの組に入る・XP を書く・順位表・フィード・友だちペア（偽の Firestore で）。実行：node tools/tests/unit/manabi-social.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const S = require(path.join(ROOT, 'manabi/social.js'));
function fakeDb(opt) {
  const store = {}, o = opt || {};
  const set = (obj, p, v) => { const k = p.split('.'); let c = obj; for (let i = 0; i < k.length - 1; i++) c = c[k[i]] = c[k[i]] || {}; c[k[k.length - 1]] = v; };
  const deny = () => { const e = new Error('denied'); e.code = 'permission-denied'; throw e; };
  return { store, collection: c => ({ doc: id => ({ id, async get() { const d = store[c + '/' + id]; return { exists: !!d, data: () => JSON.parse(JSON.stringify(d)) }; },
    async set(v) { if (o.denyWrites || (store[c + '/' + id] && o.createOnly)) deny(); store[c + '/' + id] = JSON.parse(JSON.stringify(v)); },
    async update(v) { if (o.denyWrites || !store[c + '/' + id]) deny(); if (c === 'kbLg' && o.maxM && Object.keys(store[c + '/' + id].m).length >= o.maxM && !Object.keys(v).every(k => store[c + '/' + id].m[k.slice(2)])) deny(); for (const k of Object.keys(v)) set(store[c + '/' + id], k, v[k]); } }) }) };
}
const ts = () => 1000;
test('join creates room 1, fills it up to 30, then goes to room 2; rejoining returns the same room', async () => {
  const db = fakeDb({ maxM: 30 }); const base = { week: 2900, tier: 1, xp: 5, ts };
  const r = await S.join(db, { ...base, uid: 'u0', name: 'a' }); eq(r.room, 'w2900-t1-1');
  for (let i = 1; i < 30; i++) await S.join(db, { ...base, uid: 'u' + i, name: 'p' + i });
  eq(Object.keys(db.store['kbLg/w2900-t1-1'].m).length, 30);
  const r31 = await S.join(db, { ...base, uid: 'late', name: 'x' }); eq(r31.room, 'w2900-t1-2');
  const again = await S.join(db, { ...base, uid: 'u3', name: 'p3' }); eq(again.room, 'w2900-t1-1'); ok(again.existed);
});
test('join: denied writes (rules not deployed) give ok:false, never throw; a long name is cut to 12', async () => {
  const r = await S.join(fakeDb({ denyWrites: true }), { week: 1, tier: 0, xp: 0, uid: 'a', name: 'x', ts }); eq(r.ok, false);
  eq(S.nm('あいうえおかきくけこさしすせそ').length, 12); eq(S.nm('  '), 'ゲスト');
});
test('push respects the 60 s gap, the +2000 step and the 12000 cap, and never goes down', async () => {
  const db = fakeDb(); await S.join(db, { week: 5, tier: 0, xp: 10, uid: 'a', name: 'A', ts });
  eq((await S.push(db, { room: 'w5-t0-1', uid: 'a', name: 'A', xp: 10, prevX: 10, prevT: 0, now: 1e6, ts })).skipped, 'same');
  eq((await S.push(db, { room: 'w5-t0-1', uid: 'a', name: 'A', xp: 50, prevX: 10, prevT: 1e6 - 1000, now: 1e6, ts })).skipped, 'gap');
  const p = await S.push(db, { room: 'w5-t0-1', uid: 'a', name: 'A', xp: 9000, prevX: 10, prevT: 0, now: 1e6, ts }); eq(p.x, 2010); eq(db.store['kbLg/w5-t0-1'].m.a.x, 2010);
  eq((await S.push(db, { room: 'w5-t0-1', uid: 'a', name: 'A', xp: 99999, prevX: 11000, prevT: 0, now: 1e6, ts })).x, 12000);
  eq((await S.push(fakeDb({ denyWrites: true }), { room: 'r', uid: 'a', name: 'A', xp: 50, prevX: 10, prevT: 0, now: 1e6, ts })).ok, false);
});
test('board: bots fill empty seats up to 10, none when 10+ real players, I sort ahead of ties, zones 3/8 and 9/22', () => {
  const bots = Array.from({ length: 9 }, (_, k) => ({ n: 'b' + k, xp: 100 - k * 10, k }));
  const b = S.board([{ uid: 'me', n: 'M', xp: 100 }, { uid: 'z', n: 'Z', xp: 100 }], 'me', bots, 10);
  eq(b.length, 10); eq(b[0].uid, 'me'); eq(b.filter(r => r.bot).length, 8);
  const real = Array.from({ length: 12 }, (_, i) => ({ uid: 'u' + i, n: 'p', xp: i })); eq(S.board(real, 'u1', bots, 10).filter(r => r.bot).length, 0);
  eq(JSON.stringify(S.zones(10)), '{"up":3,"dnFrom":8}'); eq(JSON.stringify(S.zones(30)), '{"up":9,"dnFrom":22}');
});
test('feed: newest first, max 10, 20 s gap, validates; feedRead merges friends newest first and skips unreadable ones', async () => {
  const db = fakeDb(); const ev = i => ({ ty: 'lesson', tx: 'レッスン' + i, at: 1000 + i });
  eq((await S.feedPush(db, { uid: 'a', ev: { ty: 'x', tx: 'a', at: 1 }, now: 1e6, ts })).ok, false);
  for (let i = 0; i < 12; i++) await S.feedPush(db, { uid: 'a', ev: ev(i), now: 1e6 + i * 30000, ts: () => 1e6 + i * 30000 });
  const e = db.store['kbFeed/a'].e; eq(Object.keys(e).length, 10); eq(e.e0.tx, 'レッスン11');
  eq((await S.feedPush(db, { uid: 'a', ev: ev(99), now: 1e6 + 11 * 30000 + 5000, ts })).skipped, 'gap');
  await S.feedPush(db, { uid: 'b', ev: { ty: 'ach', tx: '実績', at: 5000 }, now: 1, ts: () => 1 });
  const r = await S.feedRead(db, [{ uid: 'a', n: 'A' }, { uid: 'b', n: 'B' }, { uid: 'none', n: 'N' }]); eq(r[0].uid, 'b'); eq(r.length, 11);
});
test('pair: create with own side, update only mine upward by 2000, read theirs, reset on a new week', async () => {
  const db = fakeDb(); const base = { me: 'bbbb', other: 'aaaa', week: 10, ts };
  let r = await S.pairSync(db, { ...base, xp: 30 }); eq(r.mine, 30); eq(r.theirs, 0); eq(db.store['kbPairs/aaaa_bbbb'].xb, 30); eq(db.store['kbPairs/aaaa_bbbb'].xa, 0);
  db.store['kbPairs/aaaa_bbbb'].xa = 120;
  r = await S.pairSync(db, { ...base, xp: 5000 }); eq(r.mine, 2030); eq(r.theirs, 120);
  r = await S.pairSync(db, { ...base, week: 11, xp: 7 }); eq(db.store['kbPairs/aaaa_bbbb'].wk, 11); eq(db.store['kbPairs/aaaa_bbbb'].xa, 0); eq(r.theirs, 0);
  eq((await S.pairSync(fakeDb({ denyWrites: true }), { ...base, xp: 1 })).ok, false); eq(S.pairId('b', 'a'), 'a_b');
});
run();
