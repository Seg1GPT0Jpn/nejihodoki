// common/rank.js の単体テスト（node だけ。偽の localStorage と、kbBoards のルールをまねた偽の Firestore を使う）
// 実行：node tools/tests/unit/rank.test.js   （TZ を変えて：TZ=America/New_York node tools/tests/unit/rank.test.js）
'use strict';
const path = require('path');
const { fresh, test, eq, ok, deep, run, FakeStorage, COMMON } = require('./_kobo-env');

const H = 3600000, DAY = 86400000, MIN = 60000;
const jst = (y, m, d, hh = 0, mm = 0, ss = 0) => Date.UTC(y, m - 1, d, hh, mm, ss) - 9 * H;

// ------------------------------------------------------------------ 偽の Firestore（firestore.rules の kbBoards・kbProfiles・kusogeRanks を簡単にまねる）
const ST = { __serverTime: true };
const CAPS = { neji: 100000, blocks: 100000000, drop: 100000000, raft: 100000, gates: 100000, n59049: 1000000000, water: 100000, parking: 100000, hole: 1000000 };
function denied() { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; return e; }
const dayKeyOf = ms => { const d = new Date(ms + 9 * H); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
const weekOf = ms => Math.floor((ms + 9 * H + 3 * DAY) / (7 * DAY));
class FakeDb {
  constructor(clock) { this.clock = clock; this.docs = new Map(); this.live = true; this.uid = null; this.reads = 0; this.writes = 0; this.deniedWrites = 0; this.log = []; }
  collection(name) { return new Coll(this, name); }
  okPeriod(p) {
    const t = this.clock(), g = t - 15 * MIN;
    if (p === 'all') return true;
    if (/^d\d{8}$/.test(p)) return [dayKeyOf(t), dayKeyOf(g)].includes(Number(p.slice(1)));
    if (/^w\d+$/.test(p)) return [weekOf(t), weekOf(g)].includes(Number(p.slice(1)));
    return false;
  }
  setDoc(p, data) {
    const seg = p.split('/');
    this.writes++; this.log.push(['set', p, data.s]);
    if (seg[0] === 'kbBoards') {
      if (!this.live) { this.deniedWrites++; throw denied(); }
      const [game, per] = seg[1].split('~'), old = this.docs.get(p), now = this.clock();
      const ok = seg[2] === 'e' && seg[3] === this.uid && data.u === this.uid && CAPS[game] && this.okPeriod(per)
        && typeof data.n === 'string' && data.n.length >= 1 && data.n.length <= 12
        && Number.isInteger(data.s) && data.s > 0 && data.s <= CAPS[game] && data.t === ST
        && (!old || (data.s > old.s && now > old.t + 5000));
      if (!ok) { this.deniedWrites++; throw denied(); }
      this.docs.set(p, Object.assign({}, data, { t: now }));
      return;
    }
    this.docs.set(p, data);
  }
  getDoc(p) {
    this.reads++;
    if (/^(kbBoards|kbProfiles)\//.test(p) && !this.live) throw denied();
    const d = this.docs.get(p);
    return snapDoc(p, d);
  }
  query(coll, q) {
    if (/^(kbBoards|kbProfiles)/.test(coll) && (!this.live || !(q.limit <= 50))) throw denied();
    const pre = coll + '/';
    let rows = [...this.docs.entries()].filter(([k]) => k.startsWith(pre) && !k.slice(pre.length).includes('/')).map(([k, v]) => ({ k, v }));
    const at = (o, f) => f.split('.').reduce((x, y) => (x == null ? undefined : x[y]), o);
    for (const w of q.where) rows = rows.filter(r => at(r.v, w[0]) === w[2]);
    if (q.order) { rows = rows.filter(r => at(r.v, q.order) != null); rows.sort((a, b) => at(b.v, q.order) - at(a.v, q.order)); }
    if (q.limit) rows = rows.slice(0, q.limit);
    this.reads += Math.max(1, rows.length);
    const docs = rows.map(r => snapDoc(r.k, r.v));
    return { size: docs.length, docs, empty: !docs.length };
  }
}
function snapDoc(p, d) {
  const id = p.split('/').pop();
  const data = d ? Object.assign({}, d) : undefined;
  if (data && typeof data.t === 'number') { const t = data.t; data.t = { toMillis: () => t }; }
  return { id, exists: !!d, data: () => data };
}
class Coll {
  constructor(db, p, q) { this.db = db; this.p = p; this.q = q || { where: [], order: null, limit: 0 }; }
  doc(id) { return new Doc(this.db, this.p + '/' + id); }
  orderBy(f) { return new Coll(this.db, this.p, Object.assign({}, this.q, { order: f })); }
  where(f, op, v) { return new Coll(this.db, this.p, Object.assign({}, this.q, { where: this.q.where.concat([[f, op, v]]) })); }
  limit(n) { return new Coll(this.db, this.p, Object.assign({}, this.q, { limit: n })); }
  async get() { return this.db.query(this.p, this.q); }
}
class Doc {
  constructor(db, p) { this.db = db; this.p = p; }
  collection(n) { return new Coll(this.db, this.p + '/' + n); }
  async set(d) { return this.db.setDoc(this.p, d); }
  async get() { return this.db.getDoc(this.p); }
}

// ------------------------------------------------------------------ 環境
function setup(o = {}) {
  const storage = new FakeStorage(Object.assign({ 'kobo.nick': 'テスト' }, o.storage || {}));
  if (o.nick === null) storage.removeItem('kobo.nick'); else if (o.nick) storage.setItem('kobo.nick', o.nick);
  const mods = fresh({ storage, files: ['games', 'platform'] });
  delete require.cache[path.join(COMMON, 'rank.js')];
  delete globalThis.KoboRank;
  const R = require(path.join(COMMON, 'rank.js'));
  const clock = { t: o.t || jst(2026, 11, 4, 12) };
  const db = new FakeDb(() => clock.t);
  let user = o.user === null ? null : { uid: o.uid || 'uidA', isAnonymous: true };
  db.uid = user && user.uid;
  const cloud = {
    guests: 0,
    user: () => user,
    me: () => user && user.uid,
    ensureGuest: async () => { cloud.guests++; user = { uid: 'guest1', isAnonymous: true }; db.uid = user.uid; return user; },
    switchUser(uid) { user = { uid, isAnonymous: true }; db.uid = uid; },
  };
  R._env({ now: () => clock.t, storage: () => storage, cloud: () => cloud, db: async () => (o.offline ? null : db), serverTime: () => ST });
  R._reset();
  const P = mods.platform;
  Date.now = () => clock.t; // KoboPlatform の now() も同じ時計
  return { R, P, db, clock, storage, cloud, adv(ms) { clock.t += ms; } };
}
const entry = (db, b, uid = 'uidA') => db.docs.get(`kbBoards/${b}/e/${uid}`);
const seed = (db, b, n, base = 1000, t0 = 0) => { for (let i = 0; i < n; i++) db.docs.set(`kbBoards/${b}/e/u${i}`, { u: 'u' + i, n: 'p' + i, s: base - i, t: t0 }); };

// ------------------------------------------------------------------ ボードの名前（日本時間）
test('board keys: all / week / day in JST, independent of the device time zone', () => {
  const { R } = setup();
  const t = jst(2026, 11, 4, 12);
  deep(R.boards('blocks', t), { all: 'blocks~all', week: 'blocks~w' + weekOf(t), day: 'blocks~d20261104' });
  eq(R.board('blocks', 'day', jst(2026, 11, 4, 0, 0, 0)), 'blocks~d20261104');
  eq(R.board('blocks', 'day', jst(2026, 11, 4, 0, 0, 0) - 1), 'blocks~d20261103');
  // 週は日本時間の月曜0時（2026-11-02 は月曜）
  const mon = jst(2026, 11, 2);
  eq(R.weekKey(mon) - R.weekKey(mon - 1), 1, 'week changes at Monday 00:00 JST');
  eq(R.weekKey(jst(2026, 11, 8, 23, 59, 59)), R.weekKey(mon), 'Sunday 23:59 JST is the same week');
  const w = R.weekRange(jst(2026, 11, 4, 12));
  eq(w.from, 20261102); eq(w.to, 20261108); eq(w.endsAt, jst(2026, 11, 9));
  eq(R.board('tetris', 'all'), 'tetris~all'); eq(R.board('blocks', 'month'), null);
});

// ------------------------------------------------------------------ 送る前の確認
test('check: caps, integers, zero, NaN, maxRate, mode', () => {
  const { R } = setup();
  eq(R.check('blocks', 500).ok, true); eq(R.check('blocks', 500.9).value, 500);
  eq(R.check('blocks', 0).reason, 'zero'); eq(R.check('blocks', -3).reason, 'zero');
  eq(R.check('blocks', NaN).reason, 'nan'); eq(R.check('blocks', 'x').reason, 'nan');
  eq(R.check('neji', 100000).ok, true); eq(R.check('neji', 100001).reason, 'cap');
  eq(R.check('hole', 1000001).reason, 'cap');
  eq(R.check('tetris', 5).reason, 'game');
  eq(R.check('blocks', 5, { mode: 'versus' }).reason, 'mode');
  globalThis.KOBO_REGISTRY.byId('drop').score.maxRate = 10;
  eq(R.check('drop', 600, { durationMs: 60000 }).ok, true, '10/s');
  eq(R.check('drop', 601, { durationMs: 60000 }).reason, 'rate');
  eq(R.check('drop', 601).ok, true, 'no duration → no rate check');
});

// ------------------------------------------------------------------ 外れ値と同点
test('flag: ties share a rank, outliers are greyed and left out of the numbering', () => {
  const { R } = setup();
  const rows = R.flag([{ s: 100 }, { s: 300 }, { s: 300 }, { s: 200 }, { s: 99999999 }, { s: 150 }, { s: 120 }], 'blocks');
  deep(rows.map(r => [r.s, r.rank, r.out]), [[99999999, null, 'median'], [300, 1, null], [300, 1, null], [200, 3, null], [150, 4, null], [120, 5, null], [100, 6, null]]);
  const c = R.flag([{ s: 100001 }, { s: 50 }, { s: 1.5 }], 'neji');
  deep(c.map(r => [r.s, r.rank, r.out]), [[100001, null, 'cap'], [50, 1, null], [1.5, null, 'value']]);
  globalThis.KOBO_REGISTRY.byId('drop').score.maxRate = 10;
  const d = R.flag([{ s: 1000, dur: 10000 }, { s: 900, dur: 600000 }], 'drop');
  deep(d.map(r => [r.rank, r.out]), [[null, 'rate'], [1, null]]);
  eq(R.flag([{ s: 1000 }, { s: 10 }], 'blocks')[0].out, null, 'median rule needs 3 rows');
});

// ------------------------------------------------------------------ 送る
test('submit: writes all/week/day once, then only when the value goes up (rules: increase + 5 s)', async () => {
  const { R, db, adv } = setup();
  const b = R.boards('blocks');
  let r = await R.submit('blocks', 500, { durationMs: 120000 });
  deep(r.wrote.sort(), [b.all, b.day, b.week].sort());
  eq(entry(db, b.all).s, 500); eq(entry(db, b.all).n, 'テスト'); eq(entry(db, b.all).u, 'uidA'); deep(entry(db, b.all).m, { dur: 120000 });
  eq(db.writes, 3);
  r = await R.submit('blocks', 500); eq(r.wrote.length, 0); eq(r.skipped[b.all], 'sent'); eq(db.writes, 3, 'same value: no writes');
  r = await R.submit('blocks', 400); eq(db.writes, 3, 'lower value: no writes');
  adv(7000);
  r = await R.submit('blocks', 800); eq(r.wrote.length, 3); eq(entry(db, b.week).s, 800);
  eq(db.deniedWrites, 0);
  eq(R.sentValue(b.day), 800);
});

test('submit: two quick improvements wait 6 s for the same board (rule: 5 s), nothing is denied', async () => {
  const { R, db, clock } = setup();
  await R.submit('blocks', 500, { periods: ['all'] });
  clock.t += 1000;
  const t0 = Date.now.call ? process.hrtime.bigint() : 0n;
  // 実時間で待つ（6秒 − 1秒）ので、時計も待つあいだに進める
  const tick = setInterval(() => { clock.t += 250; }, 50);
  const r = await R.submit('blocks', 600, { periods: ['all'] });
  clearInterval(tick);
  eq(r.wrote.length, 1); eq(db.deniedWrites, 0); eq(entry(db, 'blocks~all').s, 600);
  ok(Number(process.hrtime.bigint() - t0) / 1e6 >= 900, 'waited');
});

test('weekly and daily rollover (injected clock): new boards get the value again, all-time does not', async () => {
  const { R, db, clock } = setup({ t: jst(2026, 11, 8, 23, 50) }); // 日曜 23:50
  const before = R.boards('blocks');
  await R.submit('blocks', 500);
  eq(db.writes, 3);
  clock.t = jst(2026, 11, 9, 0, 5); // 月曜 0:05：週も日も変わる
  const after = R.boards('blocks');
  ok(after.week !== before.week && after.day !== before.day);
  const r = await R.submit('blocks', 500);
  deep(r.wrote.sort(), [after.day, after.week].sort()); eq(r.skipped[after.all], 'sent');
  eq(entry(db, after.week).s, 500); eq(entry(db, before.week).s, 500, 'last week stays');
  // 次の日（週はそのまま）
  clock.t = jst(2026, 11, 10, 0, 1);
  const r2 = await R.submit('blocks', 500);
  deep(r2.wrote, ['blocks~d20261110']);
  // 古い週と日の記録は端末から消える
  const sent = JSON.parse(globalThis.localStorage.getItem('kobo.rankSent'));
  deep(Object.keys(sent.b).sort(), ['blocks~all', 'blocks~d20261110', after.week].sort());
});

test('a device clock that is a day behind writes a board the rules refuse: recorded once, no retry', async () => {
  const { R, db, clock } = setup();
  R._env({ now: () => clock.t - DAY }); // 端末の時計だけ1日遅れ
  const r = await R.submit('blocks', 500);
  deep(r.wrote.sort(), ['blocks~all', R.board('blocks', 'week')].sort(), 'all-time and the week (Tue → Wed) are fine'); eq(r.skipped['blocks~d20261103'], 'denied');
  const rej = JSON.parse(globalThis.localStorage.getItem('kobo.rankRejected'));
  ok(rej.some(x => /denied:blocks~d20261103/.test(x.why)));
  const w0 = db.writes; await R.submit('blocks', 500); eq(db.writes, w0, 'not retried');
  eq(R.rulesOff(), false, 'still treated as rules live');
});

test('submitBests: first run migrates the all-time value only; a later increase goes to all/week/day', async () => {
  const { R, db, storage, adv } = setup({ storage: { 'kusoge.blocks.best': '900', 'nejihodoki3d.maxLevel': '12', 'kusoge.hole.save': JSON.stringify({ best: { matchPts: 80, maxPts: 120 } }) } });
  const out = await R.submitBests();
  deep(out.map(x => [x.game, x.value, x.periods.join()]), [['neji', 11, 'all'], ['blocks', 900, 'all'], ['hole', 120, 'all']]);
  eq(entry(db, 'neji~all').s, 11); eq(entry(db, 'hole~all').s, 120);
  eq(db.writes, 3);
  eq((await R.submitBests()).filter(x => x.res.wrote.length).length, 0, 'nothing changed → nothing written');
  eq(db.writes, 3);
  adv(10000);
  storage.setItem('kusoge.blocks.best', '950');
  const out2 = await R.submitBests();
  const bl = out2.find(x => x.game === 'blocks');
  eq(bl.periods.join(), 'all,week,day'); eq(bl.res.wrote.length, 3);
  eq(db.writes, 6);
});

test('submitBests: a value over the cap is not sent and is logged', async () => {
  const { R, db } = setup({ storage: { 'nejihodoki3d.maxLevel': '999999' } });
  await R.submitBests();
  eq(db.writes, 0);
  ok(JSON.parse(globalThis.localStorage.getItem('kobo.rankRejected')).some(x => x.g === 'neji' && x.why === 'cap'));
});

test('no nickname → nothing is sent; no account → a guest is created only when there is something to send', async () => {
  let e = setup({ nick: null, storage: { 'kusoge.blocks.best': '900' } });
  eq((await e.R.submit('blocks', 5)).reason, 'nick'); await e.R.submitBests(); eq(e.db.writes, 0);
  e = setup({ user: null });
  eq(e.cloud.guests, 0);
  const r = await e.R.submit('blocks', 5);
  eq(e.cloud.guests, 1); eq(r.wrote.length, 3); ok(e.db.docs.has('kbBoards/blocks~all/e/guest1'));
});

test('another device already sent more: the refused update is checked with 1 read and remembered', async () => {
  const { R, db } = setup();
  db.docs.set('kbBoards/blocks~all/e/uidA', { u: 'uidA', n: 'x', s: 900, t: 0 });
  const r = await R.submit('blocks', 500, { periods: ['all'] });
  eq(r.skipped['blocks~all'], 'lower'); eq(db.reads, 1);
  eq(R.sentValue('blocks~all'), 900);
  const w = db.writes; await R.submit('blocks', 600, { periods: ['all'] }); eq(db.writes, w, '600 < 900: no write');
  eq(R.rulesOff(), false);
});

test('refused because the last write was < 5 s ago (page reopened): waits once and retries', async () => {
  const { R, db, clock } = setup();
  db.docs.set('kbBoards/blocks~all/e/uidA', { u: 'uidA', n: 'x', s: 100, t: clock.t - 1000 });
  const tick = setInterval(() => { clock.t += 300; }, 50);
  const r = await R.submit('blocks', 500, { periods: ['all'] });
  clearInterval(tick);
  deep(r.wrote, ['blocks~all']); eq(db.deniedWrites, 1); eq(entry(db, 'blocks~all').s, 500);
});

test('switching account resets what was sent (the new account\'s boards are unknown)', async () => {
  const { R, db, cloud, adv } = setup();
  await R.submit('blocks', 500, { periods: ['all'] });
  cloud.switchUser('uidB'); adv(7000);
  await R.submit('blocks', 500, { periods: ['all'] });
  eq(entry(db, 'blocks~all', 'uidB').s, 500);
});

test('rules not published yet: writes fail once, then back off for 6 hours; reads back off for 10 minutes', async () => {
  const { R, db, adv, storage } = setup({ storage: { 'kusoge.blocks.best': '900' } });
  db.live = false;
  const r = await R.submit('blocks', 500);
  eq(r.ok, false); eq(r.reason, 'rules'); eq(db.writes, 1, 'stops after the first refused write'); eq(db.reads, 1, 'one get to tell the cause');
  eq(R.rulesOff(), true);
  await R.submitBests(); eq(db.writes, 1, 'backing off');
  const t = await R.top('blocks', 'week');
  eq(t.error.code, 'permission-denied'); eq(db.reads, 1, 'no read while backing off');
  // 公開されたあと：読むのは10分後、書くのは6時間後から
  db.live = true; adv(11 * MIN);
  const t2 = await R.top('blocks', 'week'); ok(!t2.error); eq(R.rulesOff(), false);
  const out = await R.submitBests();
  eq(out[0].res.wrote.length >= 1, true, 'rules live again → the first send is the migration');
  ok(JSON.parse(storage.getItem('kobo.rankSent')).base.blocks === 900);
});

test('rules not published: the "improved" signal is kept until the send works', async () => {
  const { R, db, adv, storage } = setup({ storage: { 'kusoge.blocks.best': '900' } });
  await R.submitBests(); eq(db.writes, 1);
  adv(10000); storage.setItem('kusoge.blocks.best', '950');
  db.live = false; await R.submitBests();
  db.live = true; adv(7 * H);
  const out = await R.submitBests();
  eq(out.find(x => x.game === 'blocks').periods.join(), 'all,week,day');
});

test('week/day are skipped when the cached 30th place is out of reach; all-time is always sent', async () => {
  const { R, db } = setup();
  const b = R.boards('blocks');
  seed(db, b.week, 35, 1000);
  const t = await R.top('blocks', 'week'); eq(t.rows.length, 30);
  const r = await R.submit('blocks', 900);
  eq(r.skipped[b.week], 'cutoff'); ok(r.wrote.includes(b.all) && r.wrote.includes(b.day));
  const r2 = await R.submit('blocks', 999); // 30位（971）より上
  ok(r2.wrote.includes(b.week));
});

test('daily write budget: at most DAY_WRITES writes per device per JST day', async () => {
  const { R, db, adv } = setup();
  for (let i = 1; i <= 20; i++) { await R.submit('blocks', i * 10); adv(7000); }
  eq(db.writes, R.DAY_WRITES);
  adv(DAY);
  const r = await R.submit('blocks', 100000); eq(r.wrote.length, 3);
});

test('offline / no Firebase: submit and top fail softly', async () => {
  const { R } = setup({ offline: true });
  eq((await R.submit('blocks', 5)).reason, 'offline');
  eq((await R.top('blocks', 'all')).error.code, 'unavailable');
});

// ------------------------------------------------------------------ 読む
test('top: 30 rows, ≤ 31 reads per view, 5-minute cache, own row from the cache after a submit', async () => {
  const { R, db, adv } = setup();
  const b = R.boards('drop');
  seed(db, b.all, 45, 5000);
  let t = await R.top('drop', 'all');
  eq(t.rows.length, 30); eq(t.reads, 30); eq(db.reads, 30); eq(t.cached, false);
  eq(t.rows[0].s, 5000); eq(t.rows[0].rank, 1); eq(t.rows[29].rank, 30);
  t = await R.top('drop', 'all'); eq(t.cached, true); eq(db.reads, 30, 'cached: no reads');
  await R.submit('drop', 6000);
  t = await R.top('drop', 'all'); eq(t.rows[0].uid, 'uidA'); eq(t.rows.length, 30); eq(db.reads, 30);
  adv(5 * MIN + 1);
  t = await R.top('drop', 'all'); eq(t.cached, false); eq(db.reads, 60); eq(t.rows[0].uid, 'uidA');
  const e = await R.top('raft', 'day'); eq(e.rows.length, 0); eq(e.reads, 1, 'an empty board costs 1 read');
});

test('overall (this week XP) and hasOverall: rows from other weeks are dropped; 1 read to check', async () => {
  const { R, db, clock } = setup();
  const wk = weekOf(clock.t);
  eq(await R.hasOverall(), false); eq(db.reads, 1);
  db.docs.set('kbProfiles/a', { n: 'A', lv: 3, xpw: 500, wk, t: 0 });
  db.docs.set('kbProfiles/b', { n: 'B', lv: 3, xpw: 9000, wk: wk - 1, t: 0 });
  db.docs.set('kbProfiles/c', { n: 'C', lv: 3, xpw: 500, wk, t: 0 });
  eq(await R.hasOverall({ fresh: true }), true);
  const o = await R.overall();
  deep(o.rows.map(r => [r.n, r.s, r.rank]), [['A', 500, 1], ['C', 500, 1]]);
});

test('legacy: per game reads 30 via orderBy(scores.<id>); overall reads all (≤1000) and is cached for a day', async () => {
  const { R, db, adv } = setup();
  for (let i = 0; i < 40; i++) db.docs.set('kusogeRanks/u' + i, { name: 'p' + i, scores: { blocks: 1000 + i, ...(i % 2 ? { drop: 50 + i } : {}) }, updatedAt: i });
  db.docs.set('kusogeRanks/cheat', { name: 'cheat', scores: { neji: 999999 }, updatedAt: 1 });
  db.live = false; // 旧ランキングは、今のルールでも読める
  const g = await R.legacy.game('blocks');
  eq(g.rows.length, 30); eq(g.rows[0].s, 1039); eq(db.reads, 30);
  const n = await R.legacy.game('neji'); eq(n.rows[0].out, 'cap', 'over the cap → greyed');
  const before = db.reads;
  const o = await R.legacy.overall();
  eq(db.reads - before, 41);
  eq(o.rows[0].uid, 'u39'); eq(o.rows[0].s, 200); eq(o.rows[0].games, 2);
  ok(!o.rows.some(r => r.uid === 'cheat'), 'outliers earn no points');
  adv(23 * H); await R.legacy.overall(); eq(db.reads - before, 41, 'cached for a day');
  adv(2 * H); await R.legacy.overall(); eq(db.reads - before, 82);
  eq(R.legacy.open(Date.UTC(2026, 11, 1, 14, 59)), true); eq(R.legacy.open(Date.UTC(2026, 11, 1, 15, 0)), false);
});

// ------------------------------------------------------------------ ゲームのイベント（KoboPlatform の played）
test('play_end of a score game (normal) sends that play to week/day/all; versus and stage games do not', async () => {
  const { R, P, db } = setup();
  P.emit('play_start', { game: 'drop', mode: 'normal' });
  P.emit('play_end', { game: 'drop', mode: 'normal', score: 777, durationMs: 90000, reason: 'over' });
  await new Promise(r => setTimeout(r, 20));
  const b = R.boards('drop');
  eq(entry(db, b.week).s, 777); deep(entry(db, b.day).m, { dur: 90000 });
  P.emit('play_start', { game: 'blocks', mode: 'versus' });
  P.emit('play_end', { game: 'blocks', mode: 'versus', score: 5000, reason: 'over' });
  P.emit('play_start', { game: 'water', mode: 'normal' });
  P.emit('play_end', { game: 'water', mode: 'normal', score: 5, reason: 'clear' });
  await new Promise(r => setTimeout(r, 20));
  eq(db.writes, 3);
});

run('rank.test.js');
