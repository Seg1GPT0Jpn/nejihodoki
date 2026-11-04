#!/usr/bin/env node
// 新しいランキング（P1-6：common/rank.js と ranking/index.html）のテスト。リポジトリの一番上で：
//
//   node tools/tests/rules/rank.js            エミュレーター（リポジトリの firestore.rules）で：
//                                             匿名ユーザー数人が本物の rank.js で送る → ルールで許される／拒まれる、
//                                             ランキングのページを開いて表示と「1回の表示で読んだ件数」を測る、
//                                             今のルール（P1-4 の前）に戻して、旧ランキングへ切り替わることを確かめる
//   node tools/tests/rules/rank.js --live     本番（neji-5913a）のランキングのページを開く（読むだけ。書き込みはしない）。
//                                             新しいルールを貼る前なら「旧ランキングに切り替わる」、貼ったあとなら新しいボードが出る
//   オプション：--verbose  --no-shots（スクリーンショットは tools/tests/rules/out/rank/ に撮る）
//
// firebase-tools と Java が要る（emulator.js の先頭）。読んだ件数は、ページの Firestore SDK（compat）の
// Query.get / DocumentReference.get を包んで数える（rank.js が自分で数えたものとは別に）。
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const server = require('../lib/server');
const { signUp, fsSet, SERVER_TIME, LIVE } = require('./rest');

const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const LIVE_RUN = has('--live'), VERBOSE = has('--verbose'), SHOTS = !has('--no-shots');
const OUT = path.join(__dirname, 'out', 'rank');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const JST = 9 * 3600e3, DAY = 86400e3;
const dayKey = (ms = Date.now()) => { const d = new Date(ms + JST); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
const weekNo = (ms = Date.now()) => Math.floor((ms + JST + 3 * DAY) / (7 * DAY));

const rows = [];
function check(group, name, pass, detail) {
  const r = { group, name, pass: !!pass, detail };
  rows.push(r);
  if (!r.pass || VERBOSE) console.log(`  ${r.pass ? 'ok  ' : 'FAIL'} [${group}] ${name}${detail !== undefined ? '  ' + (typeof detail === 'string' ? detail : JSON.stringify(detail)) : ''}`);
  return r.pass;
}

// SDK に足すコード：エミュレーターへつなぐ（initializeApp のあと）＋ 読み書きを数える
function sdkPatch(T) {
  const emu = T && T.emu ? `
    var init = firebase.initializeApp;
    firebase.initializeApp = function () {
      var a = init.apply(this, arguments);
      try { a.firestore().useEmulator('127.0.0.1', ${T.ports.firestore}); } catch (e) { console.warn('useEmulator fs', e); }
      try { a.auth().useEmulator('http://127.0.0.1:${T.ports.auth}', { disableWarnings: true }); } catch (e) { console.warn('useEmulator auth', e); }
      return a;
    };` : '';
  return `;(function () {
    try {
      ${emu}
      var c = window.__fsCount = { reads: 0, queries: 0, gets: 0, writes: 0, denied: 0, log: [] };
      var F = firebase.firestore;
      var wrap = function (proto, name, kind) {
        var o = proto[name];
        proto[name] = function () {
          var self = this, p = o.apply(this, arguments);
          return p.then(function (s) {
            if (kind === 'query') { c.queries++; var n = Math.max(1, s.size); c.reads += n; c.log.push(['q', n]); }
            else if (kind === 'get') { c.gets++; c.reads++; c.log.push(['g', self.path]); }
            else { c.writes++; c.log.push(['w', self.path]); }
            return s;
          }, function (e) { if (/permission/i.test(String(e && e.code))) c.denied++; c.log.push(['x', kind, String(e && e.code)]); throw e; });
        };
      };
      wrap(F.Query.prototype, 'get', 'query');
      wrap(F.DocumentReference.prototype, 'get', 'get');
      wrap(F.DocumentReference.prototype, 'set', 'set');
    } catch (e) { console.warn('fs patch', e); }
  })();`;
}

async function newPage(browser, env, T, o = {}) {
  const proxy = process.env.HTTPS_PROXY ? { server: process.env.HTTPS_PROXY, bypass: 'localhost,127.0.0.1' } : undefined;
  const ctx = await browser.newContext({ viewport: o.vp || { width: 375, height: 667 }, locale: o.lang === 'en' ? 'en-US' : 'ja-JP', serviceWorkers: 'block', proxy, colorScheme: o.scheme || 'dark' });
  await ctx.addInitScript(([nick, store, lang]) => {
    window.KOBO_CLOUD_OPTS = { localhost: true };
    try {
      if (sessionStorage.getItem('__seeded')) return; sessionStorage.setItem('__seeded', '1');
      if (nick) localStorage.setItem('kobo.nick', nick);
      if (lang) localStorage.setItem('kobo.lang', lang);
      for (const [k, v] of Object.entries(store || {})) localStorage.setItem(k, v);
    } catch (e) {}
  }, [o.nick || null, o.storage || {}, o.lang || null]);
  const errs = [];
  await ctx.route('**/*', async route => {
    const url = route.request().url();
    if (/^https:\/\/fonts\.(googleapis|gstatic)\.com\//.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '' });
    if (/firebase@10\.12\.2\/firebase-firestore-compat\.js/.test(url)) {
      const r = await route.fetch(); return route.fulfill({ response: r, body: (await r.text()) + sdkPatch(null) });
    }
    if (T.emu && /firebase@10\.12\.2\/firebase-app-compat\.js/.test(url)) {
      const r = await route.fetch(); return route.fulfill({ response: r, body: (await r.text()) + sdkPatch(T).replace(/var c = window[\s\S]*$/, '} catch (e) {} })();') });
    }
    if (T.emu && url.startsWith(env.url + '/firebase-config.js')) {
      return route.fulfill({ status: 200, contentType: 'text/javascript', body: `window.NEJI_FIREBASE = { apiKey: 'fake-api-key', authDomain: 'demo-kobo.firebaseapp.com', projectId: 'demo-kobo', appId: '1:1:web:1' };` });
    }
    return route.continue();
  });
  const page = await ctx.newPage();
  page.on('pageerror', e => errs.push('pageerror: ' + e.message));
  page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text().slice(0, 300)); });
  page.errs = errs; page.ctx = ctx;
  return page;
}
const counts = page => page.evaluate(() => Object.assign({}, window.__fsCount || {}, { log: undefined }));
const resetCounts = page => page.evaluate(() => { const c = window.__fsCount; if (c) { c.reads = c.queries = c.gets = c.writes = c.denied = 0; c.log = []; } });
const view = page => page.evaluate(() => ({
  period: (document.querySelector('#periods [aria-selected="true"]') || {}).textContent,
  game: (document.querySelector('#tabs [aria-selected="true"]') || {}).textContent,
  periods: [...document.querySelectorAll('#periods button')].map(b => b.dataset.id),
  chips: [...document.querySelectorAll('#tabs button')].map(b => b.dataset.id),
  rows: [...document.querySelectorAll('#list li')].map(li => ({ rk: li.querySelector('.rk').textContent, n: li.querySelector('.nm').firstChild.textContent, sc: li.querySelector('.sc').textContent, cls: li.className })),
  empty: document.getElementById('empty').hidden ? '' : document.getElementById('empty').textContent,
  notice: document.getElementById('notice').hidden ? '' : document.getElementById('notice').textContent,
  me: document.getElementById('me').hidden ? '' : document.getElementById('me').textContent,
  title: document.getElementById('title').textContent,
}));
const settle = page => page.waitForFunction(() => !/読み込み中|Loading/.test(document.getElementById('empty').textContent) || document.getElementById('empty').hidden, null, { timeout: 20000 }).then(() => sleep(400), () => sleep(400));
async function shot(page, name) {
  if (!SHOTS) return;
  fs.mkdirSync(OUT, { recursive: true });
  await page.screenshot({ path: path.join(OUT, name + '.png'), fullPage: true }).catch(() => {});
}
async function layoutOk(page) {
  return page.evaluate(() => {
    const W = document.documentElement.clientWidth, bad = [];
    if (document.documentElement.scrollWidth > W + 1) bad.push('hscroll ' + (document.documentElement.scrollWidth - W));
    for (const el of document.querySelectorAll('a,button')) {
      const r = el.getBoundingClientRect(); if (!r.width) continue;
      const inScroller = el.closest('.chips,.kb-tabs');
      if (!inScroller && (r.left < -1 || r.right > W + 1)) bad.push('offscreen ' + el.textContent.trim().slice(0, 20));
      if (r.height < 43.5) bad.push('small ' + el.textContent.trim().slice(0, 20) + ' ' + Math.round(r.height));
    }
    return bad;
  });
}

// ---------------------------------------------------------------- emulator
async function emulatorRun(browser, env) {
  const emu = await require('./emulator').start({ verbose: VERBOSE });
  const T = { name: 'emulator', apiKey: 'fake-api-key', project: 'demo-kobo', authBase: `http://127.0.0.1:${emu.ports.auth}/identitytoolkit.googleapis.com`, fsBase: `http://127.0.0.1:${emu.ports.firestore}`, emu: true, ports: emu.ports };
  try {
    await emu.clearData();
    const d = dayKey(), w = weekNo();
    // ---- 1. 本物の rank.js で、匿名ユーザー3人が送る
    const g = 'submit';
    const users = [];
    for (const [nick, best] of [['あさひ', 1500], ['Bob', 1200], ['ちはや', 900]]) {
      const p = await newPage(browser, env, T, { nick, storage: { 'kusoge.blocks.best': String(best) } });
      await p.goto(env.url + '/ranking/');
      await p.waitForFunction(() => window.KoboRank && window.KoboCloud, null, { timeout: 15000 });
      const guest = await p.evaluate(() => KoboCloud.ensureGuest());
      check(g, nick + ': anonymous sign-in on the emulator', guest && guest.uid, guest);
      await resetCounts(p);
      const mig = await p.evaluate(() => KoboRank.submitBests());
      const bl = mig.find(x => x.game === 'blocks');
      check(g, nick + ': first run migrates the all-time best only', bl && bl.periods.join() === 'all' && bl.res.wrote.join() === 'blocks~all', bl);
      const r1 = await p.evaluate(v => KoboRank.submit('drop', v, { durationMs: 95000 }), best + 7);
      check(g, nick + ': drop play → all/week/day written', r1.wrote.length === 3 && r1.wrote.includes(`drop~w${w}`) && r1.wrote.includes(`drop~d${d}`), r1);
      const r2 = await p.evaluate(v => KoboRank.submit('drop', v), best + 7);
      check(g, nick + ': same value again → no write', r2.wrote.length === 0, r2);
      users.push({ p, nick, uid: guest.uid, best });
    }
    const A = users[0].p;
    let c = await counts(A);
    check('budget', 'writes for migration + one improved play', c.writes === 4 && c.denied === 0, c);
    // 5秒以内に2回増やす：rank.js が6秒待つので、ルールに拒まれない
    await resetCounts(A);
    const t0 = Date.now();
    const quick = await A.evaluate(async () => { const a = await KoboRank.submit('drop', 3000, { periods: ['all'] }); const b = await KoboRank.submit('drop', 3100, { periods: ['all'] }); return [a, b]; });
    c = await counts(A);
    check('submit', 'two improvements within 5 s: the second waits (rule: 5 s), none denied', quick[1].wrote.length === 1 && c.denied === 0 && Date.now() - t0 >= 5500, { quick, c, ms: Date.now() - t0 });
    // ルールが拒むもの（クライアントの確認を通さずに SDK で直接）
    const direct = await A.evaluate(async () => {
      const db = firebase.firestore(), me = KoboCloud.me(), st = firebase.firestore.FieldValue.serverTimestamp();
      const tryW = async (b, doc) => { try { await db.collection('kbBoards').doc(b).collection('e').doc(doc.u || me).set(doc); return 'allow'; } catch (e) { return e.code; } };
      return {
        lower: await tryW('drop~all', { u: me, n: 'x', s: 10, t: st }),
        overCap: await tryW('neji~all', { u: me, n: 'x', s: 100001, t: st }),
        other: await tryW('drop~all', { u: 'someoneElse', n: 'x', s: 99999, t: st }),
      };
    });
    check('rules', 'lower score / over the cap / someone else\'s row are refused', direct.lower === 'permission-denied' && direct.overCap === 'permission-denied' && direct.other === 'permission-denied', direct);
    // 端末の時計（注入）がずれているとき：日間・週間のボードはルールが拒む → 記録して、やり直さない
    const skew = await users[1].p.evaluate(async () => {
      KoboRank._env({ now: () => Date.now() + 8 * 86400000 });
      const r = await KoboRank.submit('n59049', 4096);
      const again = await KoboRank.submit('n59049', 4096);
      KoboRank._env({ now: () => Date.now() });
      return { r, again, rej: JSON.parse(localStorage.getItem('kobo.rankRejected') || '[]'), rulesOff: KoboRank.rulesOff() };
    });
    const fw = `n59049~w${w + 1}`;
    check('rollover', 'clock 8 days ahead: all-time written, future week/day refused by the rules and not retried', skew.r.wrote.join() === 'n59049~all' && skew.r.skipped[fw] === 'denied' && skew.again.wrote.length === 0 && !skew.rulesOff, skew);
    // 今の時計：今週・今日のボードは、ルールの週番号・日付（日本時間）と一致する
    const now2 = await users[1].p.evaluate(() => KoboRank.submit('n59049', 4097));
    check('rollover', `client board keys match the rules (w${w}, d${d})`, now2.wrote.includes(`n59049~w${w}`) && now2.wrote.includes(`n59049~d${d}`), now2);
    // ページを開き直した直後（5秒以内）にもう一度増えた：拒まれたら1回だけ待ってやり直す
    const reload = await users[1].p.evaluate(async () => { await KoboRank.submit('raft', 5, { periods: ['all'] }); KoboRank._reset(); return KoboRank.submit('raft', 6, { periods: ['all'] }); });
    check('submit', 'refused within 5 s after a reload → waits and retries once', reload.wrote.join() === 'raft~all', reload);
    // ほかの端末がもっと高い値を送っていた：拒否を1件読んで見分ける
    const other = await users[2].p.evaluate(async () => {
      const s = JSON.parse(localStorage.getItem('kobo.rankSent')); s.b = {}; localStorage.setItem('kobo.rankSent', JSON.stringify(s));
      return KoboRank.submit('drop', 500, { periods: ['all'] });
    });
    check('submit', 'another device already sent more → "lower", remembered, rules still live', other.skipped['drop~all'] === 'lower', other);

    // ---- 2. ランキングのページ：読む件数・30件・外れ値・自分の行・キャッシュ
    // 35人ぶんの行を REST で足す（drop の通算・今週・今日）＋ 外れ値を1人
    const extra = [];
    for (let i = 0; i < 35; i++) extra.push(await signUp(T));
    await Promise.all(extra.map((u, i) => Promise.all([
      fsSet(T, `kbBoards/drop~all/e/${u.uid}`, { u: u.uid, n: 'P' + i, s: 1000 + i * 10, t: SERVER_TIME }, u),
      fsSet(T, `kbBoards/drop~w${w}/e/${u.uid}`, { u: u.uid, n: 'P' + i, s: 1000 + i * 10, t: SERVER_TIME }, u),
      fsSet(T, `kbBoards/drop~d${d}/e/${u.uid}`, { u: u.uid, n: 'P' + i, s: 100 + i, t: SERVER_TIME }, u),
    ])));
    const cheat = await signUp(T);
    await fsSet(T, `kbBoards/drop~all/e/${cheat.uid}`, { u: cheat.uid, n: 'Cheater', s: 99999999, t: SERVER_TIME }, cheat);
    const prof = await signUp(T);
    await fsSet(T, `kbProfiles/${prof.uid}`, { n: 'XPさん', lv: 4, xpw: 320, wk: w, t: SERVER_TIME }, prof);

    const V = await newPage(browser, env, T, { nick: 'Viewer', vp: { width: 320, height: 568 } });
    await V.goto(env.url + '/ranking/#week/drop');
    await settle(V);
    await sleep(800);
    let v = await view(V); c = await counts(V);
    check('read', 'weekly drop: 30 rows', v.rows.length === 30, v.rows.length);
    check('read', 'weekly view reads ≤ 60 (30 + 1 to check for overall XP)', c.reads <= 60 && c.reads === 31, c);
    check('read', 'overall (this week XP) chip shown because a profile exists', v.chips[0] === 'xp', v.chips);
    check('read', 'legacy tab shown until 2026-12-02 JST', v.periods.includes('old') === (Date.now() < Date.UTC(2026, 11, 1, 15)), v.periods);
    await shot(V, 'emu-week-drop-320');
    await resetCounts(V);
    await V.click('#periods [data-id="all"]'); await settle(V);
    v = await view(V); c = await counts(V);
    const cheatRow = v.rows.find(r => r.n === 'Cheater');
    check('outlier', 'all-time: a value 20× over the median is greyed and unranked', cheatRow && /out/.test(cheatRow.cls) && cheatRow.rk === '—', cheatRow);
    check('outlier', 'the next row is #1', v.rows.find(r => !/out/.test(r.cls)).rk === '1', v.rows.slice(0, 3));
    check('read', 'all-time view reads ≤ 60', c.reads <= 60, c);
    await shot(V, 'emu-all-drop-320');
    await resetCounts(V);
    await V.click('#periods [data-id="day"]'); await settle(V);
    v = await view(V); c = await counts(V);
    check('read', 'daily view: 30 rows, reads ≤ 60', v.rows.length === 30 && c.reads <= 60, { n: v.rows.length, c });
    await resetCounts(V);
    await V.click('#periods [data-id="week"]'); await settle(V);
    c = await counts(V);
    check('cache', 'back to weekly within 5 minutes: 0 reads (cache)', c.reads === 0, c);
    await V.click('#tabs [data-id="xp"]'); await settle(V);
    v = await view(V);
    check('read', 'overall (XP) lists the profile', v.rows.length === 1 && v.rows[0].n === 'XPさん', v.rows);
    check('page', 'no page errors (viewer)', V.errs.length === 0, V.errs);
    check('layout', '320×568: no sideways scroll, nothing off-screen, controls ≥ 44px', (await layoutOk(V)).length === 0, await layoutOk(V));

    // 送った本人：自分の行が光る
    await A.goto(env.url + '/ranking/#all/drop'); await settle(A);
    v = await view(A);
    const mine = v.rows.find(r => /mine/.test(r.cls));
    check('read', 'own row is highlighted and the "me" box shows the rank', mine && mine.n === 'あさひ' && /位|#/.test(v.me), { mine, me: v.me });
    // 30位より下の本人
    await users[2].p.goto(env.url + '/ranking/#all/drop'); await settle(users[2].p);
    v = await view(users[2].p);
    check('read', 'below #30: "me" box shows the own record from the device', /30位より下/.test(v.me), v.me);

    // 旧ランキング（kusogeRanks。移行期間中は書ける）
    const L = [];
    for (let i = 0; i < 4; i++) { const u = await signUp(T); L.push(u); L[i].res = await fsSet(T, `kusogeRanks/${u.uid}`, { name: 'Old' + i, scores: { drop: 100 * (i + 1), blocks: 50 * (4 - i) }, updatedAt: Date.now() }, u); }
    check('legacy', 'seeded 4 kusogeRanks rows', L.every(u => u.res.ok), L.map(u => u.res.status + ' ' + JSON.stringify(u.res.body).slice(0, 200)));
    await resetCounts(V);
    await V.click('#periods [data-id="old"]'); await settle(V);
    v = await view(V); c = await counts(V);
    check('legacy', 'legacy drop: orderBy(scores.drop) top rows, reads ≤ 30', v.rows.length === 4 && v.rows[0].n === 'Old3' && c.reads <= 30, { rows: v.rows, c });
    await V.click('#tabs [data-id="total"]'); await settle(V);
    v = await view(V);
    check('legacy', 'old overall computed from per-game ranks', v.rows.length === 4 && /点|pts/.test(v.rows[0].sc), v.rows);
    await shot(V, 'emu-legacy-total-320');

    // 英語・ライト・414×736
    const E = await newPage(browser, env, T, { nick: 'Eve', lang: 'en', scheme: 'light', vp: { width: 414, height: 736 } });
    await E.goto(env.url + '/ranking/#week/drop'); await settle(E);
    const jp = await E.evaluate(() => [...document.querySelectorAll('body *')].filter(e => e.children.length === 0 && e.checkVisibility && e.checkVisibility() && /[぀-ヿ一-鿿]/.test(e.textContent) && !/^P\d+$|Cheater/.test(e.textContent)).map(e => e.textContent.trim()).filter(t => !/^(あさひ|ちはや|XPさん|Bob)$/.test(t)));
    check('i18n', 'English: no Japanese UI text (player names aside)', jp.length === 0, jp);
    check('layout', '414×736 en light: layout ok', (await layoutOk(E)).length === 0, await layoutOk(E));
    await shot(E, 'emu-week-drop-414-en-light');

    for (const u of users) check('page', u.nick + ': no page errors', u.p.errs.length === 0, u.p.errs);
    for (const p of [V, E, ...users.map(u => u.p)]) await p.ctx.close().catch(() => {});

    // ---- 3. 新しいルールがまだない（今の本番のルール）：旧ランキングに切り替わる
    const md = fs.readFileSync(path.join(__dirname, 'PASTE_JA.md'), 'utf8');
    const old = /Firestore：\s*```\s*([\s\S]*?)```/.exec(md)[1];
    const put = await fetch(`http://127.0.0.1:${emu.ports.firestore}/emulator/v1/projects/demo-kobo:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: old }] } }) });
    check('fallback', 'emulator loaded the current (old) live rules', put.ok, put.status);
    const F = await newPage(browser, env, T, { nick: 'あさひ', storage: { 'kusoge.blocks.best': '2000' }, vp: { width: 320, height: 568 } });
    await F.goto(env.url + '/ranking/#week/drop'); await settle(F);
    await sleep(1500);
    v = await view(F); c = await counts(F);
    check('fallback', 'permission denied → legacy tab selected with a short note', /旧ランキング/.test(v.period) && /準備中/.test(v.notice) && v.rows.length > 0, { period: v.period, notice: v.notice, rows: v.rows.length });
    check('fallback', 'fallback view reads ≤ 60', c.reads <= 60, c);
    // 匿名ログインして送ろうとしても、1回拒まれたら6時間は送らない
    const fb = await F.evaluate(async () => { await KoboCloud.ensureGuest(); const a = await KoboRank.submitBests(); const b = await KoboRank.submitBests(); return { a: a.map(x => x.res.reason), b: b.length, off: KoboRank.rulesOff() }; });
    c = await counts(F);
    check('fallback', 'rules missing (seen on the read) → no write attempts for 6 h', fb.off && fb.b === 0 && c.writes === 0, { fb, c });
    await F.click('#periods [data-id="all"]'); await settle(F);
    v = await view(F);
    check('fallback', 'new tab while rules are missing: note, no read', /準備中/.test(v.notice), v.notice);
    await shot(F, 'emu-fallback-320');
    check('page', 'fallback: no page errors', F.errs.filter(e => !/permission|insufficient/i.test(e)).length === 0, F.errs);
    await F.ctx.close();
  } finally {
    await emu.stop();
  }
}

// ---------------------------------------------------------------- live（読むだけ）
async function liveRun(browser, env) {
  const T = Object.assign({}, LIVE, { emu: false });
  for (const [lang, vp, scheme] of [['ja', { width: 320, height: 568 }, 'dark'], ['en', { width: 414, height: 736 }, 'light']]) {
    const P = await newPage(browser, { url: env.url.replace('127.0.0.1', 'localhost') }, T, { lang, vp, scheme });
    await P.goto(env.url.replace('127.0.0.1', 'localhost') + '/ranking/'); await settle(P);
    await sleep(2500);
    const v = await view(P), c = await counts(P);
    const fallback = /旧|Legacy/.test(v.period);
    check('live', `${lang}: page shows ${fallback ? 'the legacy fallback (rules not published yet)' : 'the new boards (rules live)'}`, fallback ? !!v.notice && (v.rows.length > 0 || !!v.empty) : !v.notice, { period: v.period, notice: v.notice, rows: v.rows.length, empty: v.empty });
    check('live', `${lang}: reads ≤ 60`, c.reads <= 60, c);
    check('live', `${lang}: layout ok`, (await layoutOk(P)).length === 0, await layoutOk(P));
    check('live', `${lang}: no page errors`, P.errs.filter(e => !/permission|insufficient/i.test(e)).length === 0, P.errs);
    await shot(P, `live-${lang}-${vp.width}`);
    await P.ctx.close();
  }
}

(async () => {
  const env = await server.start();
  const browser = await chromium.launch();
  try {
    if (LIVE_RUN) await liveRun(browser, env); else await emulatorRun(browser, env);
  } catch (e) {
    check('run', 'test run finished', false, String(e && e.stack || e));
  } finally {
    await browser.close(); await env.close();
  }
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', `rank-${LIVE_RUN ? 'live' : 'emulator'}.json`), JSON.stringify({ at: new Date().toISOString(), rows }, null, 1));
  const fail = rows.filter(r => !r.pass).length;
  console.log(`rank (${LIVE_RUN ? 'live' : 'emulator'}): pass ${rows.length - fail}, fail ${fail}`);
  process.exit(fail ? 1 : 0);
})();
