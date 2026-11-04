// 同期の回帰テスト（オフライン）：本番の origin（https://neji-5913a.web.app）を page.route で手元のファイルにし、
// Firebase の SDK を偽物（lib/fakes.js）に差し替えて、cloud.js のマージと送信を確かめる。
// fixtures/cloud/*.json：端末の保存（local）とクラウドの写し（remote = nejiUsers/{uid}.games）→ 同期のあとの期待
'use strict';
const { pages } = require('../lib/pages');
const viewports = require('../lib/viewports');
const { newSession, settle } = require('../lib/browser');
const storage = require('../lib/storage');

const UID = 'kbt-user';
const enc = k => k.replace(/\./g, '~');
const dig = (o, p) => (p ? String(p).split('.') : []).reduce((a, k) => (a == null ? a : a[k]), o);

function plan(opts) {
  const all = pages();
  const allowed = new Set(opts.pages(all).map(p => p.id));
  const tasks = storage.fixtures('cloud').filter(f => allowed.has(f.page)).map(f => ({
    page: f.page, vp: 'se2', lang: 'ja', label: f.name, run: (env, t) => fixture(env, t, f, all.find(p => p.id === f.page)),
  }));
  if (allowed.has('drop')) tasks.push({ page: 'drop', vp: 'se2', lang: 'ja', label: 'push-batching', run: (env, t) => pushBatching(env, t, all.find(p => p.id === 'drop')) });
  return tasks;
}

function fsInitFrom(f) {
  const games = {};
  for (const [k, e] of Object.entries(f.remote || {})) games[enc(k)] = { v: e.raw ? e.v : JSON.stringify(e.v), t: e.t };
  return { docs: { ['nejiUsers/' + UID]: { games, updatedAt: 1 } }, user: { uid: UID, displayName: 'Tester', isAnonymous: false } };
}
function seedFrom(f) {
  const seed = Object.assign({}, f.local || {});
  seed['kobo.mtime'] = f.mtime || {};
  if (f.syncedUid) seed['kobo.syncedUid'] = UID;
  return seed;
}
const cloudState = page => page.evaluate(() => { try { return JSON.parse(sessionStorage.getItem('__kbt.fs')); } catch (e) { return null; } });

// 最初の同期（pull → push）が終わるまで待つ。同期のあとの再読み込み（reloadOnNewer）もここで吸収する
async function waitFirstPush(s, timeout = 10000) {
  const end = Date.now() + timeout;
  while (Date.now() < end) {
    const st = await cloudState(s.page).catch(() => null);
    if (st && st.writes.some(w => w.path === 'nejiUsers/' + UID)) {
      await s.page.waitForLoadState('load').catch(() => {});
      await settle(s.page);
      return true;
    }
    await s.page.waitForTimeout(100).catch(() => {}); // ポーリングの間隔（同期は非同期で、待つ対象のイベントがない）
  }
  return false;
}

async function fixture(env, t, f, p) {
  const s = await newSession(env, { vp: viewports.get('se2'), lang: 'ja', https: true, fakeFirebase: true, fsInit: fsInitFrom(f), seed: seedFrom(f) });
  try {
    await s.goto(p.path);
    const pushed = await waitFirstPush(s);
    t.check(`${f.name}:synced`, pushed, 'cloud.js never pushed to nejiUsers (sync did not run)');
    const st = await cloudState(s.page);
    const remoteGames = dig(st, 'docs') && st.docs['nejiUsers/' + UID] && st.docs['nejiUsers/' + UID].games || {};
    for (const e of f.expect || []) {
      const o = { known: e.known || f.known || '' };
      if (e.noErrors) { t.check(`${f.name}:no-errors`, !s.log.pageErrors.length, s.log.pageErrors.slice(0, 3), o); continue; }
      const key = e.local || e.remote;
      let raw;
      if (e.local) raw = await storage.get(s.page, key);
      else raw = remoteGames[enc(key)] ? remoteGames[enc(key)].v : null;
      let val; try { val = raw == null ? null : JSON.parse(raw); } catch (_) { val = raw; }
      const v = dig(val, e.path);
      const name = `${f.name}:${e.local ? 'local' : 'remote'}:${key}${e.path ? '.' + e.path : ''}`;
      if (e.absent) t.check(name, raw == null, `expected the key to stay deleted, but it came back: ${String(raw).slice(0, 80)}`, o);
      if ('eq' in e) t.check(name, JSON.stringify(v) === JSON.stringify(e.eq), `expected ${JSON.stringify(e.eq)}, got ${JSON.stringify(v)}`, o);
      if ('min' in e) t.check(name, Number(v) >= e.min, `expected >= ${e.min}, got ${JSON.stringify(v)}`, o);
      if ('includes' in e) t.check(name, Array.isArray(v) && v.includes(e.includes), `expected to include ${JSON.stringify(e.includes)}, got ${JSON.stringify(v)}`, o);
    }
  } finally { await s.close(); }
}

// 送信のまとめ：短い間に何度保存しても、クラウドへの書き込みは少ないこと。同じ値の保存では書かないこと（R2）
async function pushBatching(env, t, p) {
  const f = { local: { 'kusoge.drop.best': '10', 'kobo.nick': 'tester' }, mtime: { 'kusoge.drop.best': 1000 }, syncedUid: true, remote: { 'kusoge.drop.best': { v: 10, t: 1000 } } };
  const s = await newSession(env, { vp: viewports.get('se2'), lang: 'ja', https: true, fakeFirebase: true, fsInit: fsInitFrom(f), seed: seedFrom(f) });
  try {
    await s.goto(p.path);
    t.check('push-batching:synced', await waitFirstPush(s), 'first sync did not run');
    // 初回の送信（ランキングも含む）が落ち着くまで待つ：書き込みの数が 3 秒変わらなくなるまで
    const count = async () => { const st = await cloudState(s.page); return { users: st.writes.filter(w => w.path.startsWith('nejiUsers/')).length, ranks: st.writes.filter(w => w.path.startsWith('kusogeRanks/')).length }; };
    const quiet = async () => { let last = JSON.stringify(await count()), since = Date.now(); while (Date.now() - since < 3000) { await s.page.waitForTimeout(250); const c = JSON.stringify(await count()); if (c !== last) { last = c; since = Date.now(); } } return JSON.parse(last); };
    const c0 = await quiet();
    // 1秒の間に10回、ベストを上げる
    await s.page.evaluate(() => new Promise(res => { let i = 0; const step = () => { localStorage.setItem('kusoge.drop.best', String(20 + i)); if (++i < 10) setTimeout(step, 100); else res(); }; step(); }));
    const c1 = await quiet();
    t.check('push-batching:10-saves-in-1s', c1.users - c0.users >= 1 && c1.users - c0.users <= 2, `nejiUsers writes for 10 saves within 1s: ${c1.users - c0.users} (expected 1–2)`);
    t.check('push-batching:rank-10-saves-in-1s', c1.ranks - c0.ranks <= 2, `kusogeRanks writes for 10 saves within 1s: ${c1.ranks - c0.ranks}`);
    // 同じ値をもう一度保存（raft は4秒ごとに同じ状態を書く）→ 書き込みは増えないはず
    await s.page.evaluate(() => { const v = localStorage.getItem('kusoge.drop.best'); localStorage.setItem('kusoge.drop.best', v); });
    const c2 = await quiet();
    t.check('push-batching:unchanged-value-no-write', c2.users === c1.users && c2.ranks === c1.ranks, `saving the same value again wrote nejiUsers ×${c2.users - c1.users}, kusogeRanks ×${c2.ranks - c1.ranks}`, { known: 'R2' });
  } finally { await s.close(); }
}

module.exports = { name: 'sync', describe: 'cloud.js のマージと送信（偽の Firebase、オフライン）。R2・R3・R4 の回帰', plan };
