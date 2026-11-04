// P3-5：フレンド（common/friends.js と KoboPlatform.merge.friends）の単体テスト。node だけ。
// 実行：node tools/tests/unit/friends.test.js
'use strict';
const path = require('path');
const { fresh, test, eq, ok, deep, run, FakeStorage, COMMON } = require('./_kobo-env');
const { FakeFirestore, fakeCloud, ST } = require('./_fake-firestore');

const H = 3600000, DAY = 86400000, MIN = 60000;
const jst = (y, m, d, hh = 0) => Date.UTC(y, m - 1, d, hh) - 9 * H;
const T0 = jst(2026, 11, 4, 12);

function setup(o = {}) {
  const storage = new FakeStorage(Object.assign({ 'kobo.dev': 'testdev' }, o.storage || {}));
  const m = fresh({ storage, files: ['games', 'platform'] });
  for (const f of ['friends', 'rank']) { delete require.cache[path.join(COMMON, f + '.js')]; }
  delete globalThis.KoboFriends; delete globalThis.KoboRank;
  const R = require(path.join(COMMON, 'rank.js'));
  const F = require(path.join(COMMON, 'friends.js'));
  const clock = { t: o.t || T0 };
  const db = new FakeFirestore();
  const cloud = fakeCloud(db, o.uid === undefined ? 'me' : o.uid);
  let seed = o.seed || 1;
  const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed - 1) / 2147483646; };
  F._env({ now: () => clock.t, storage: () => storage, cloud: () => cloud, db: async () => db, serverTime: () => ST, random: o.random || rnd });
  R._env({ now: () => clock.t, storage: () => storage, cloud: () => cloud, db: async () => db, serverTime: () => ST });
  return { F, R, P: m.platform, db, cloud, clock, storage, adv: ms => { clock.t += ms; } };
}
const wkOf = ms => Math.floor((ms + 9 * H + 3 * DAY) / (7 * DAY));
function putCode(db, code, uid, prof) { db.docs.set('kbCodes/' + code, { u: uid, t: 1 }); if (prof) db.docs.set('kbProfiles/' + uid, prof); }

// ------------------------------------------------------------------ マージ（cloud.js が使う）
test('merge: union of friends; the later event per uid wins; removal (tombstone) beats an older add', () => {
  const { P } = setup();
  const M = P.merge.friends;
  ok(P.PLATFORM_SYNC['kobo.friends'] === M, 'registered in PLATFORM_SYNC');
  eq(P.PLATFORM_SYNC['kobo.news.read'], 'max');
  const t = T0 - DAY;
  const a = { u1: { n: 'A', code: 'AAAAAAAA', at: t + 100 }, u2: { n: 'B', code: 'BBBBBBBB', at: t + 100, rm: t + 300 } };
  const b = { u2: { n: 'B', code: 'BBBBBBBB', at: t + 100 }, u3: { n: 'C', code: 'CCCCCCCC', at: t + 200 } };
  const ctx = { now: T0 };
  const out = JSON.parse(M(JSON.stringify(a), JSON.stringify(b), ctx));
  deep(Object.keys(out).sort(), ['u1', 'u2', 'u3']);
  eq(out.u2.rm, t + 300, 'device A removed u2 after device B added it → stays removed');
  eq(P.merge.friendOn(out.u2), false); eq(P.merge.friendOn(out.u1), true);
  // same result either way round (both devices converge)
  deep(JSON.parse(M(JSON.stringify(b), JSON.stringify(a), ctx)), out);
  // re-adding after the removal wins
  const c = { u2: { n: 'B', code: 'BBBBBBBB', at: t + 500 } };
  const out2 = JSON.parse(M(JSON.stringify(out), JSON.stringify(c), ctx));
  eq(P.merge.friendOn(out2.u2), true); eq(out2.u2.at, t + 500);
  // same moment: removing wins
  const out3 = JSON.parse(M(JSON.stringify({ u9: { at: t + 50 } }), JSON.stringify({ u9: { at: t + 40, rm: t + 50 } }), ctx));
  eq(P.merge.friendOn(out3.u9), false);
});

test('merge: old tombstones are pruned, at most 30 friends (newest kept), junk ignored, idempotent', () => {
  const { P } = setup();
  const M = P.merge.friends;
  const many = {}; for (let i = 0; i < 35; i++) many['u' + i] = { n: 'p' + i, code: '', at: 1000 + i };
  many.old = { n: 'o', at: 1, rm: T0 - 181 * DAY };
  many.recent = { n: 'r', at: 1, rm: T0 - 10 * DAY };
  many['bad/key'] = { at: 5 };
  const out = JSON.parse(M(JSON.stringify(many), JSON.stringify({ x: 'junk' }), { now: T0 }));
  const on = Object.keys(out).filter(k => P.merge.friendOn(out[k]));
  eq(on.length, 30); ok(!out.u0 && !out.u4 && out.u5 && out.u34, 'the 5 oldest adds are dropped');
  ok(!out.old, '181-day tombstone pruned'); ok(out.recent, '10-day tombstone kept'); ok(!out['bad/key'] && !out.x);
  eq(M(JSON.stringify(out), JSON.stringify(out), { now: T0 }), JSON.stringify(JSON.parse(M(JSON.stringify(out), '{}', { now: T0 }))), 'idempotent');
  eq(M('not json', null), 'not json', 'both unreadable → local unchanged');
  eq(M(null, JSON.stringify({ u1: { at: 1 } }), { now: T0 }), JSON.stringify({ u1: { at: 1 } }));
});

test('through cloud.js rules: kobo.friends merges by function, not newest (a remove on one device survives an add on another)', () => {
  const { P } = setup();
  const map = P.syncMap();
  ok(map['kobo.friends'] && typeof map['kobo.friends'].merge === 'function', 'syncMap gives a merge function');
  eq(map['kobo.news.read'], 'max');
  eq(P.syncMap({ legacy: true })['kobo.friends'], 'newest', 'old cloud.js: plain newest');
});

// ------------------------------------------------------------------ コード
test('codes: normalize and validate (8 chars, no 0/1/I/O), generator only uses the alphabet', () => {
  const { F } = setup();
  eq(F.normCode(' abcd-2345 '), 'ABCD2345'); eq(F.normCode('ＡＢＣＤ２３４５'), 'ABCD2345');
  ok(F.validCode('ABCD2345')); ok(!F.validCode('ABCD1234')); ok(!F.validCode('ABCDO234')); ok(!F.validCode('ABC2345'));
  for (let i = 0; i < 200; i++) ok(F.validCode(F.genCode()), 'gen');
  eq(F.ALPHABET.length, 32);
});

test('ensureCode: creates kbCodes/{code} = { u, t } once (the rule allows only create), saves it in kobo.profile, reuses it', async () => {
  const { F, db, storage } = setup();
  const r = await F.ensureCode();
  ok(r.ok && r.created, JSON.stringify(r));
  const doc = db.docs.get('kbCodes/' + r.code);
  deep(doc, { u: 'me', t: 1000 });
  const prof = JSON.parse(storage.getItem('kobo.profile'));
  eq(prof.code, r.code); eq(prof.codeU, 'me');
  eq(F.myCode(), r.code);
  const w = db.writes;
  const r2 = await F.ensureCode(); eq(r2.code, r.code); eq(db.writes, w, 'no second write');
});

test('ensureCode: a code taken by someone else is drawn again; guests get an anonymous account; another account gets a new code', async () => {
  const seq = [0, 0, 0, 0, 0, 0, 0, 0, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99, 0.99];
  let i = 0;
  const { F, db, cloud } = setup({ uid: null, random: () => seq[i++ % seq.length] });
  putCode(db, '22222222', 'someone');
  const r = await F.ensureCode();
  ok(r.ok, JSON.stringify(r)); eq(r.code, 'ZZZZZZZZ'); eq(cloud.guests, 1); eq(db.docs.get('kbCodes/ZZZZZZZZ').u, 'guest1');
  cloud.switchUser('other');
  eq(F.myCode(), null, 'the saved code belongs to guest1');
  i = 0; db.docs.delete('kbCodes/22222222');
  const r2 = await F.ensureCode(); eq(r2.code, '22222222'); eq(db.docs.get('kbCodes/22222222').u, 'other');
});

// ------------------------------------------------------------------ 足す・外す
test('add: looks up the code (2 reads), stores { n, code, at }; refuses bad / unknown / own / duplicate codes', async () => {
  const { F, db } = setup();
  putCode(db, 'FRND2345', 'u1', { n: 'ともだち', lv: 4, xpw: 90, wk: wkOf(T0), t: 1 });
  eq((await F.add('nope')).reason, 'bad-code');
  eq((await F.add('ABCD2345')).reason, 'notfound');
  const r0 = db.reads;
  const r = await F.add('frnd-2345');
  ok(r.ok, JSON.stringify(r)); eq(db.reads - r0, 2);
  deep(F.list().map(f => [f.uid, f.n, f.code]), [['u1', 'ともだち', 'FRND2345']]);
  eq((await F.add('FRND2345')).reason, 'exists');
  const mine = await F.ensureCode();
  eq((await F.add(mine.code)).reason, 'self');
  putCode(db, 'SELF2345', 'me'); eq((await F.add('SELF2345')).reason, 'self');
});

test('add: max 30 friends; remove leaves a tombstone and re-adding works', async () => {
  const { F, db, adv, storage } = setup();
  for (let i = 0; i < 30; i++) { const c = ('2345' + 'ABCDEFGHJK'[i % 10] + 'ABC'[Math.floor(i / 10)] + 'ZZ'); putCode(db, c, 'f' + i); ok((await F.add(c)).ok, 'add ' + i); adv(1000); }
  eq(F.count(), 30);
  putCode(db, 'MXRE2345', 'f99'); eq((await F.add('MXRE2345')).reason, 'full');
  ok(F.remove('f3')); eq(F.count(), 29); eq(F.has('f3'), false);
  const raw = JSON.parse(storage.getItem('kobo.friends')); ok(raw.f3.rm >= raw.f3.at, 'tombstone kept for sync');
  eq(F.remove('f3'), false, 'removing twice does nothing');
  adv(1000); ok((await F.add('MXRE2345')).ok); eq(F.count(), 30);
  const c3 = Object.values(raw).length && raw.f3.code; adv(1000);
  ok(F.remove('f99')); ok((await F.add(c3)).ok, 're-add a removed friend'); eq(F.has('f3'), true);
});

// ------------------------------------------------------------------ 表示（読み取りの数）
test('profiles / overall: 1 get per friend + me (≤31), only this week XP counts, 5-minute cache, cache drops when the list changes', async () => {
  const { F, db, adv } = setup();
  const wk = wkOf(T0);
  db.docs.set('kbProfiles/me', { n: 'わたし', lv: 5, xpw: 120, wk, title: 'lv:5', t: 1 });
  putCode(db, 'AAAA2345', 'a', { n: 'A', lv: 3, xpw: 300, wk, title: 'all.streak7', t: 1 });
  putCode(db, 'BBBB2345', 'b', { n: 'B', lv: 9, xpw: 999, wk: wk - 1, t: 1 });
  putCode(db, 'CCCC2345', 'c');
  for (const c of ['AAAA2345', 'BBBB2345', 'CCCC2345']) ok((await F.add(c)).ok);
  const r0 = db.reads;
  const o = await F.overall();
  eq(db.reads - r0, 4, '3 friends + me');
  deep(o.rows.map(x => [x.uid, x.s, x.rank, x.title]), [['a', 300, 1, 'all.streak7'], ['me', 120, 2, 'lv:5']]);
  const p = await F.profiles(); eq(p.cached, true); eq(db.reads - r0, 4);
  ok(p.rows.find(x => x.uid === 'c').missing, 'no public profile yet');
  eq(p.rows.find(x => x.uid === 'b').xpw, 0, 'last week XP is not shown');
  adv(5 * MIN + 1); await F.profiles(); eq(db.reads - r0, 8);
  F.remove('c'); const q = await F.profiles(); eq(q.cached, false); eq(db.reads - r0, 11);
});

test('board: one where(u in [friends+me]).limit(30) query (reads = rows found, ≥1), flagged like KoboRank.top, cached', async () => {
  const { F, R, db } = setup();
  const b = R.board('blocks', 'week');
  for (let i = 0; i < 29; i++) { putCode(db, '2345' + 'ABCDEFGHJK'[i % 10] + 'ABC'[Math.floor(i / 10)] + 'YY', 'f' + i); }
  for (let i = 0; i < 29; i++) ok((await F.add('2345' + 'ABCDEFGHJK'[i % 10] + 'ABC'[Math.floor(i / 10)] + 'YY')).ok);
  db.docs.set('kbBoards/' + b + '/e/f1', { u: 'f1', n: 'F1', s: 500, t: 1 });
  db.docs.set('kbBoards/' + b + '/e/me', { u: 'me', n: 'ME', s: 800, t: 1 });
  db.docs.set('kbBoards/' + b + '/e/stranger', { u: 'stranger', n: 'X', s: 9999, t: 1 });
  db.docs.set('kbBoards/' + b + '/e/f2', { u: 'f2', n: 'F2', s: 2000000000, t: 1 });
  const r0 = db.reads;
  const r = await F.board('blocks', 'week');
  ok(!r.error, JSON.stringify(r.error)); eq(r.board, b);
  eq(db.reads - r0, 3, '30 uids → 1 query, 3 rows');
  deep(r.rows.filter(x => !x.out).map(x => [x.uid, x.rank]), [['me', 1], ['f1', 2]]);
  eq(r.rows.find(x => x.uid === 'f2').out, 'cap');
  ok(!r.rows.some(x => x.uid === 'stranger'));
  const again = await F.board('blocks', 'week'); eq(again.cached, true); eq(db.reads - r0, 3);
  ok(db.reads - r0 <= 60, 'within the 60-read budget');
});

test('without a database: friendly reasons, no throw; without cloud.js nothing breaks', async () => {
  const { F } = setup();
  F._env({ db: async () => null });
  eq((await F.add('ABCD2345')).reason, 'db');
  eq((await F.ensureCode()).reason, 'db');
  F._env({ cloud: () => null });
  eq((await F.ensureCode()).reason, 'signin');
  const p = await F.profiles(); deep(p.rows, []);
});

run('friends (P3-5)');
