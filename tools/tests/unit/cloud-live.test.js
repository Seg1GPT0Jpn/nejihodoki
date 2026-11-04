// P1-5 の本番での確認（ネットが必要）：本物の Firebase（neji-5913a）に匿名ログインで入り、common/cloud.js の同期を確かめる。
// 2台の端末は、同じ匿名ユーザーのまま localStorage を入れ替えて再現する（ログインは IndexedDB に残る）。
// 最後に、作った文書（nejiUsers/{uid}・kusogeRanks/{uid}）と匿名ユーザーを消す。
// 実行：python3 -m http.server 8765 --bind 127.0.0.1 を別に動かしてから
//       node tools/tests/unit/cloud-live.test.js --port 8765
'use strict';
const { chromium } = require('playwright');

const arg = n => { const i = process.argv.indexOf(n); return i > 0 ? process.argv[i + 1] : null; };
const PORT = arg('--port') || '8765';
const BASE = `http://localhost:${PORT}`;
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond, info }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info)}`); };
const JP = /[぀-ヿ一-鿿]/;

(async () => {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const browser = await chromium.launch({ proxy });
  const ctx = await browser.newContext({ serviceWorkers: 'block', locale: 'ja-JP' });
  await ctx.addInitScript(() => { window.KOBO_CLOUD_OPTS = { localhost: true, guestSync: true }; });
  const page = await ctx.newPage();
  const errors = [];
  page.on('pageerror', e => errors.push(String(e)));
  const T0 = Date.now();
  let uid = null;

  // replace this "device's" localStorage, then open the hub (it syncs every game's keys and never rewrites them)
  async function device(storage, o = {}) {
    await page.goto(BASE + '/HANDOFF.md'); // same origin, no cloud.js: seeding here is not seen as an edit
    await page.evaluate(s => { localStorage.clear(); sessionStorage.clear(); for (const [k, v] of Object.entries(s)) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }, storage);
    await page.goto(BASE + '/index.html');
    const ok = await page.evaluate(() => KoboCloud.ready());
    if (!ok) throw new Error('KoboCloud.ready() was false');
    if (o.guest) await page.evaluate(() => KoboCloud.ensureGuest());
    await page.waitForFunction(() => KoboCloud.me(), null, { timeout: 15000 });
    await page.evaluate(() => KoboCloud.pull());
  }
  const local = k => page.evaluate(k => { const v = localStorage.getItem(k); try { return v == null ? null : JSON.parse(v); } catch (e) { return v; } }, k);
  const cloud = () => page.evaluate(async () => { const d = await firebase.firestore().collection('nejiUsers').doc(KoboCloud.me()).get(); return d.exists ? d.data() : null; });
  const cv = (doc, k) => { const e = doc && doc.games && doc.games[k.replace(/\./g, '~')]; if (!e) return undefined; if (e.v === null) return null; try { return JSON.parse(e.v); } catch (x) { return e.v; } };
  const hide = () => page.evaluate(() => new Promise(r => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); setTimeout(r, 2500); }));

  try {
    // ---- device A: a guest with progress
    const tA = T0 - 60000;
    await device({
      'kusoge.water.save': { level: 5, best: 9, stars: { 1: 3 } },
      'kusoge.raft.save': { v: 3, day: 12 },
      'kusoge.drop.best': '300',
      'kusoge.gates.save': { v: 2, best: 5, stage: 5, coins: 200, mat: 0, exp: 0, bld: { wall: 2 }, heroes: { h1: { lv: 3, star: 1, cards: 4 } }, sel: [], runs: 5 },
      'kobo.mtime': { 'kusoge.water.save': tA, 'kusoge.raft.save': tA, 'kusoge.drop.best': tA, 'kusoge.gates.save': tA },
    }, { guest: true });
    uid = await page.evaluate(() => KoboCloud.me());
    const u = await page.evaluate(() => KoboCloud.user());
    check('guest signed in anonymously', u && u.isAnonymous, u);
    let doc = await cloud();
    check('A pushed water.save', cv(doc, 'kusoge.water.save') && cv(doc, 'kusoge.water.save').best === 9, doc && doc.games);
    check('A pushed raft.save', cv(doc, 'kusoge.raft.save') && cv(doc, 'kusoge.raft.save').day === 12);
    // the raft sinks on A: removeItem → tombstone, sent when the page is hidden
    await page.evaluate(() => localStorage.removeItem('kusoge.raft.save'));
    await hide();
    doc = await cloud();
    check('R3: tombstone in the cloud after removeItem', cv(doc, 'kusoge.raft.save') === null, doc.games['kusoge~raft~save']);
    const snapA = await page.evaluate(() => Object.assign({}, localStorage));

    // ---- device B: older, partly stale copy; first sync of this account here
    const tB = Date.now();
    await device({
      'kusoge.water.save': { level: 3, best: 7, stars: { 2: 1 } },
      'kusoge.raft.save': { v: 3, day: 4 },
      'kusoge.gates.save': { v: 2, best: 3, stage: 3, coins: 40, mat: 0, exp: 0, bld: { wall: 1, tower: 1 }, heroes: { h1: { lv: 2, star: 1, cards: 1 }, h2: { lv: 1, star: 0, cards: 0 } }, sel: [], runs: 3 },
      'kusoge.drop.best': '120',
      'kobo.mtime': { 'kusoge.water.save': tB, 'kusoge.raft.save': tA - 1000, 'kusoge.gates.save': tB },
    });
    let w = await local('kusoge.water.save'), g = await local('kusoge.gates.save');
    check('R4: water best kept (max)', w && w.best === 9, w);
    check('R4: water stars merged', w && w.stars && w.stars[1] === 3 && w.stars[2] === 1, w);
    check('R4: gates best/bld/heroes kept', g && g.best === 5 && g.bld.wall === 2 && g.bld.tower === 1 && g.heroes.h1.lv === 3 && g.heroes.h2.lv === 1, g);
    check('first device: cloud coins win', g && g.coins === 200, g && g.coins);
    check('R3: deleted raft save not restored on B', (await local('kusoge.raft.save')) === null, await local('kusoge.raft.save'));
    check("'max' drop.best", (await local('kusoge.drop.best')) === 300);
    doc = await cloud();
    check('cloud gates merged', cv(doc, 'kusoge.gates.save').bld.tower === 1 && cv(doc, 'kusoge.gates.save').heroes.h2.lv === 1, cv(doc, 'kusoge.gates.save'));
    // B spends coins (newer edit) and sets a nickname (ranking row)
    await page.evaluate(() => { const g = JSON.parse(localStorage.getItem('kusoge.gates.save')); g.coins = 10; localStorage.setItem('kusoge.gates.save', JSON.stringify(g)); });
    await page.evaluate(() => KoboCloud.setNickname('kbt-live'));
    await hide();
    const rank1 = await page.evaluate(async () => (await firebase.firestore().collection('kusogeRanks').doc(KoboCloud.me()).get()).data());
    check('ranking row written', rank1 && rank1.name === 'kbt-live' && rank1.scores.drop === 300 && rank1.scores.gates === 5, rank1);
    const snapB = await page.evaluate(() => Object.assign({}, localStorage));

    // ---- back to device A (it synced before): newest coins from B, nothing rolls back
    await device(snapA);
    g = await local('kusoge.gates.save'); w = await local('kusoge.water.save');
    check('R4: A gets coins from B (newest)', g && g.coins === 10, g && g.coins);
    check('R4: A keeps best 5 and merged heroes', g && g.best === 5 && g.heroes.h2.lv === 1, g);
    check('R4: A water best 9, stars merged', w && w.best === 9 && w.stars[2] === 1, w);
    check('R3: A still has no raft save', (await local('kusoge.raft.save')) === null);

    // ---- device B again: no ranking write when nothing changed
    await device(snapB);
    await page.waitForTimeout(4000);
    const rank2 = await page.evaluate(async () => (await firebase.firestore().collection('kusogeRanks').doc(KoboCloud.me()).get()).data());
    check('R2: ranking not re-sent on reload', rank2 && rank2.updatedAt === rank1.updatedAt, { before: rank1.updatedAt, after: rank2 && rank2.updatedAt });

    // ---- English UI of the login widget
    await page.evaluate(() => localStorage.setItem('kobo.lang', 'en'));
    await page.goto(BASE + '/index.html');
    await page.evaluate(() => KoboCloud.ready());
    await page.waitForFunction(() => KoboCloud.me(), null, { timeout: 15000 });
    await page.waitForTimeout(500);
    const acct = await page.evaluate(() => { const a = document.getElementById('acct'); return a ? [a.innerText, ...[...a.querySelectorAll('[placeholder]')].map(e => e.placeholder)].join(' | ') : ''; });
    check('i18n: account widget has no Japanese in English', acct && !JP.test(acct), acct);
    check('no page errors', !errors.length, errors.slice(0, 3));
  } catch (e) {
    check('live run', false, String(e && e.stack || e));
  } finally {
    // ---- clean up what this test created
    if (uid) {
      const out = await page.evaluate(async () => {
        const r = {}, db = firebase.firestore(), me = KoboCloud.me();
        try { await db.collection('kusogeRanks').doc(me).delete(); r.ranks = 'deleted'; } catch (e) { r.ranks = 'delete failed: ' + e.code; }
        try { await db.collection('nejiUsers').doc(me).delete(); r.users = 'deleted'; }
        catch (e) {
          r.users = 'delete denied (' + e.code + ')';
          try { await db.collection('nejiUsers').doc(me).set({ games: {}, updatedAt: Date.now() }); r.users += ' → overwritten with an empty games map'; } catch (x) { r.users += ' → overwrite failed: ' + x.code; }
        }
        try { await firebase.auth().currentUser.delete(); r.auth = 'anonymous user deleted'; } catch (e) { r.auth = 'user delete failed: ' + e.code; }
        return r;
      }).catch(e => ({ error: String(e) }));
      console.log('  cleanup uid=' + uid + ': ' + JSON.stringify(out));
    }
    await browser.close();
    const fail = results.filter(r => !r.ok).length;
    console.log(`cloud live (P1-5): ${results.length - fail} passed, ${fail} failed`);
    process.exitCode = fail ? 1 : 0;
  }
})();
