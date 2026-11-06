// P3-2：データの書き出しと削除（common/account.js）の単体テスト。firestore.rules をまねた偽の Firestore を使う。node だけ。
// 実行：node tools/tests/unit/account.test.js
'use strict';
const path = require('path');
const { fresh, test, eq, ok, deep, run, FakeStorage, COMMON } = require('./_kobo-env');
const { FakeFirestore, fakeCloud } = require('./_fake-firestore');

const H = 3600000, DAY = 86400000;
const T0 = Date.UTC(2026, 10, 4, 3); // 2026-11-04 12:00 JST
const wk = Math.floor((T0 + 9 * H + 3 * DAY) / (7 * DAY));

function setup(o = {}) {
  const storage = new FakeStorage(Object.assign({
    'kobo.dev': 'dev1', 'kobo.lang': 'en', 'kobo.theme': 'dark', 'kobo.nick': 'わたし', 'kusoge.blocks.best': '1200',
    'nejihodoki3d.maxLevel': '12', 'kobo.mtime': '{}', 'kobo.syncedUid': 'me', 'other.app': 'keep me',
    'kobo.profile': JSON.stringify({ v: 1, code: 'MYCD2345', codeU: 'me' }),
    'kobo.rankSent': JSON.stringify({ uid: 'me', b: { 'blocks~all': 1200, ['drop~w' + wk]: 50 } }),
  }, o.storage || {}));
  const m = fresh({ storage, files: ['games', 'platform'] });
  for (const f of ['account', 'rank']) delete require.cache[path.join(COMMON, f + '.js')];
  delete globalThis.KoboAccount; delete globalThis.KoboRank;
  require(path.join(COMMON, 'rank.js'));
  const A = require(path.join(COMMON, 'account.js'));
  const db = new FakeFirestore();
  const cloud = fakeCloud(db, o.uid === undefined ? 'me' : o.uid);
  const auth = {
    currentUser: cloud.user() ? { uid: cloud.user().uid, deleted: false, async delete() { if (o.recent) { const e = new Error('x'); e.code = 'auth/requires-recent-login'; throw e; } this.deleted = true; } } : null,
    signedOut: false, async signOut() { this.signedOut = true; cloud.switchUser(null); },
  };
  A._env({ now: () => T0, storage: () => storage, cloud: () => cloud, db: async () => (o.noDb ? null : db), auth: () => auth });
  // the owner's data in the cloud, plus someone else's
  const mine = ['nejiUsers/me', 'kbProfiles/me', 'kusogeRanks/me', 'kbCodes/MYCD2345', 'kbBoards/blocks~all/e/me', 'kbBoards/drop~w' + wk + '/e/me', 'kbBoards/water~d20261104/e/me'];
  for (const p of mine) db.docs.set(p, p.startsWith('kbCodes') ? { u: 'me', t: 1 } : { u: 'me' });
  const theirs = ['nejiUsers/you', 'kbProfiles/you', 'kbCodes/YURS2345', 'kbBoards/blocks~all/e/you'];
  for (const p of theirs) db.docs.set(p, p.startsWith('kbCodes') ? { u: 'you', t: 1 } : { u: 'you' });
  return { A, db, storage, auth, cloud, mine, theirs, P: m.platform };
}

test('localKeys / export: only this site\'s keys, as raw strings, with the uid', () => {
  const { A } = setup();
  const keys = A.localKeys();
  ok(keys.includes('kusoge.blocks.best') && keys.includes('nejihodoki3d.maxLevel') && keys.includes('kobo.nick'));
  ok(!keys.includes('other.app'));
  const d = A.exportData();
  eq(d.app, 'himatsubushi-kobo'); eq(d.uid, 'me'); eq(d.data['kusoge.blocks.best'], '1200'); eq(d.data['other.app'], undefined);
  eq(d.at, new Date(T0).toISOString());
});

test('cloudTargets: own code, sent boards + every game\'s all/this week/today/today\'s challenge, profile, legacy rank, nejiUsers last', () => {
  const { A } = setup();
  const t = A.cloudTargets('me');
  eq(t[0], 'kbCodes/MYCD2345'); eq(t[t.length - 1], 'nejiUsers/me');
  ok(t.includes('kbBoards/blocks~all/e/me') && t.includes('kbBoards/drop~w' + wk + '/e/me') && t.includes('kbBoards/water~d20261104/e/me') && t.includes('kbBoards/neji~c20261104/e/me'));
  ok(t.includes('kbProfiles/me') && t.includes('kusogeRanks/me'));
  ok(t.every(p => !/you/.test(p)), 'only the own uid');
  // all / this week / today per game, today's challenge per daily game, plus a few own docs: grows with the registry, never unbounded
  const REG = require(path.join(COMMON, 'games.js'));
  ok(t.length <= 3 * REG.games.length + REG.games.filter(g => g.flags.daily).length + 10, 'bounded number of deletes: ' + t.length);
});

test('erase: deletes the own cloud docs the rules allow, deletes the account, wipes local keys (keeps language + theme and other sites\' keys)', async () => {
  const { A, db, storage, auth, mine, theirs } = setup();
  const r = await A.erase();
  ok(r.ok, JSON.stringify(r.failed));
  for (const p of mine) ok(!db.docs.has(p), 'deleted ' + p);
  for (const p of theirs) ok(db.docs.has(p), 'kept ' + p);
  eq(db.denied, 0, 'no request the rules would refuse');
  eq(r.account, 'deleted'); ok(auth.currentUser.deleted);
  eq(storage.getItem('kusoge.blocks.best'), null); eq(storage.getItem('kobo.nick'), null); eq(storage.getItem('kobo.mtime'), null); eq(storage.getItem('kobo.syncedUid'), null);
  eq(storage.getItem('kobo.lang'), 'en'); eq(storage.getItem('kobo.theme'), 'dark'); eq(storage.getItem('other.app'), 'keep me');
  ok(r.local >= 6);
  eq(r.deleted[r.deleted.length - 1], 'nejiUsers/me', 'the synced copy goes last');
});

test('erase: a code that is not ours / already gone is not a failure; Google needing a recent login → signed out, data still gone', async () => {
  const { A, db, auth } = setup({ recent: true });
  db.docs.delete('kbCodes/MYCD2345');
  const r = await A.erase();
  ok(r.ok, JSON.stringify(r.failed));
  eq(r.failed.length, 1); eq(r.failed[0].path, 'kbCodes/MYCD2345'); eq(r.failed[0].code, 'permission-denied');
  eq(r.account, 'signedOut'); eq(r.accountError, 'auth/requires-recent-login'); ok(auth.signedOut);
  ok(!db.docs.has('nejiUsers/me'));
});

test('erase: when the cloud is unreachable, nothing local is deleted (so the player can try again)', async () => {
  const { A, storage } = setup({ noDb: true });
  const r = await A.erase();
  eq(r.ok, false); eq(storage.getItem('kusoge.blocks.best'), '1200');
});

test('erase: not signed in → only this device; cloud: false → only this device even when signed in', async () => {
  let s = setup({ uid: null });
  let r = await s.A.erase();
  ok(r.ok); eq(s.db.writes, 0); eq(s.storage.getItem('kusoge.blocks.best'), null); eq(r.account, 'none');
  s = setup();
  r = await s.A.erase({ cloud: false });
  ok(r.ok); eq(s.db.writes, 0); ok(s.db.docs.has('nejiUsers/me')); eq(s.storage.getItem('kobo.nick'), null);
});

run('account (P3-2)');
