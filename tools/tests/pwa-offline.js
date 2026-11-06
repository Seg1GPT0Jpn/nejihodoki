#!/usr/bin/env node
// PWA の通し（P4）：Service Worker（sw.js）・オフライン・マニフェストとインストールの条件・更新のトースト。ネットにはつながない。
//   node tools/tests/pwa-offline.js                 一番上（Firebase Hosting と同じ /）と、下のフォルダ（GitHub Pages と同じ /nejihodoki/）の両方
//   node tools/tests/pwa-offline.js --base /nejihodoki   片方だけ（'' か '/nejihodoki'）   --game blocks,hole   ゲームを選ぶ   --headed
//
// 手順（それぞれの置き場所で）：
//   1. 通信ありでハブを開く → sw.js が入り、保存したのはハブとその部品（CORE）だけ。はじめての転送量（gzip）を測る
//   2. 通信を切って、開いたことのないゲームを開く → offline.html。通信を戻して全ゲームを1回ずつ開く → そのゲームの ENGINES
//      （hole は全部の街）が保存される。また通信を切り、全ゲームを開き直す：pageerror・console.error・同じサイトの失敗した通信が0件、
//      主な要素（canvas か #app など）があること。ハブ・ランキング・プロフィールも同じ
//   3. 保存していないページはオフラインのページ（日本語／英語）。リンクはそのサイトの一番上（scope）を指す
//   4. マニフェスト：Chrome 自身のインストールの判定（CDP Page.getInstallabilityErrors。Lighthouse の installable と同じ中身）と、
//      ここで決めた条件（name・short_name・id・start_url と scope が相対で中にある・display・アイコン 192/512 と maskable 192/512 が PNG で
//      その大きさ・theme/background の色・shortcuts 4つと 96px のアイコン・screenshots の大きさ・すべての URL が相対）
//   5. 更新：sw.js を1バイト変えて reg.update() → 待機 → 「新しいバージョンがあります」のトースト（遊んでいる最中のゲームでは出ない・
//      勝手に読み込み直さない）→「更新」で読み込み直して新しい版になる → 古い kobo-v の保存は消え、ほかのサイトの保存（同じ origin）は残る
// Service Worker は http://localhost で動かす（安全な origin とみなされる）。外のファイル：three.js は .cache から、Google Fonts は空の CSS。
'use strict';
const fs = require('fs');
const path = require('path');
const http = require('http');
const vm = require('vm');
const { chromium } = require('playwright');
const { resolveFile, mimeOf, ROOT } = require('./lib/server');
const { ensureCdn, GL_ARGS } = require('./lib/browser');

const argv = process.argv.slice(2);
const val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const BASES = val('--base') != null ? [val('--base')] : ['', '/nejihodoki'];
const REG = require(path.join(ROOT, 'common/games.js'));
const ONLY = val('--game') ? val('--game').split(',') : null;
const GAMES = REG.games.filter(g => !ONLY || ONLY.includes(g.id));
const THREE = path.join(__dirname, '.cache', 'three-r128.min.js');
const sleep = ms => new Promise(r => setTimeout(r, ms));
const firstVisit = {};

// ---------------------------------------------------------------- results
const rows = [];
function check(group, name, pass, detail) {
  rows.push({ group, name, pass: !!pass, detail });
  console.log(`  ${pass ? 'ok  ' : 'FAIL'} [${group}] ${name}${!pass && detail ? '\n       ' + String(detail).slice(0, 600) : ''}`);
}

// ---------------------------------------------------------------- server: the repo under a base path (and a switch to change sw.js)
function startServer(base) {
  const state = { swExtra: '', requests: [] };
  const srv = http.createServer((req, res) => {
    const u = req.url || '/';
    state.requests.push(u);
    if (base && !u.startsWith(base + '/')) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('outside the site'); }
    const rel = base ? u.slice(base.length) : u;
    const raw = rel.split('?')[0];
    const f = resolveFile(rel);
    if (f && !raw.endsWith('/') && f.endsWith(path.sep + 'index.html') && !raw.endsWith('index.html')) {
      res.writeHead(301, { Location: base + raw + '/' + (rel.includes('?') ? rel.slice(rel.indexOf('?')) : '') }); return res.end();
    }
    if (!f) { res.writeHead(404, { 'Content-Type': 'text/plain' }); return res.end('not found'); }
    const headers = { 'Content-Type': mimeOf(f), 'Cache-Control': 'no-cache' };
    if (raw === '/sw.js') { res.writeHead(200, headers); return res.end(fs.readFileSync(f, 'utf8') + state.swExtra); }
    res.writeHead(200, headers);
    fs.createReadStream(f).pipe(res);
  });
  return new Promise(r => srv.listen(0, '127.0.0.1', () => r({ state, port: srv.address().port, origin: `http://localhost:${srv.address().port}`, close: () => new Promise(c => srv.close(() => c())) })));
}

// sw.js の保存する一覧（CORE・PAGES・ENGINES）を、sw.js そのものから読む
function swLists() {
  const ctx = { self: { KOBO_REGISTRY: REG, registration: { scope: 'http://x/' }, addEventListener() {} }, importScripts() {}, location: { origin: 'http://x' }, URL, Request: function () {}, Response: function () {}, caches: {}, fetch() {} };
  vm.createContext(ctx);
  vm.runInContext(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8') + '\n;this.__l = { CORE, PAGES, ENGINES, BUILD, VERSION };', ctx);
  return ctx.__l;
}

const IGNORE = [/Could not reach Cloud Firestore backend/i, /\[Violation\]/];
async function newContext(browser, env, o = {}) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 }, deviceScaleFactor: 1, locale: o.lang === 'en' ? 'en-US' : 'ja-JP', serviceWorkers: 'allow', colorScheme: 'dark' });
  const blocked = [];
  await ctx.route('**/*', route => {
    const url = route.request().url();
    if (url.startsWith(env.origin + '/')) return route.continue();
    if (/^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/.test(url)) return route.fulfill({ status: 200, contentType: 'text/javascript', body: fs.readFileSync(THREE), headers: { 'Access-Control-Allow-Origin': '*' } });
    if (/^https:\/\/fonts\.googleapis\.com\//.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '/* fonts are stubbed in tests */', headers: { 'Access-Control-Allow-Origin': '*' } });
    blocked.push(url);
    return route.abort('blockedbyclient');
  });
  if (o.lang) await ctx.addInitScript(l => { try { localStorage.setItem('kobo.lang', l); } catch (e) {} }, o.lang);
  ctx.blocked = blocked;
  return ctx;
}
function watch(page, env) {
  const log = { errors: [], failed: [] };
  page.on('pageerror', e => log.errors.push('pageerror: ' + String(e && e.message || e).slice(0, 300)));
  page.on('console', m => {
    if (m.type() !== 'error') return;
    const t = m.text();
    if (IGNORE.some(re => re.test(t))) return;
    if (/ERR_BLOCKED_BY_CLIENT/.test(t)) return; // a blocked outside request (Firebase etc.), not something the page needs offline
    log.errors.push('console: ' + t.slice(0, 300) + ((m.location() || {}).url ? ' @' + m.location().url.replace(env.origin, '') : ''));
  });
  page.on('requestfailed', r => { if (r.url().startsWith(env.origin)) log.failed.push(r.url().replace(env.origin, '') + ' ' + ((r.failure() && r.failure().errorText) || '')); });
  return log;
}
async function settle(page, ms) {
  await page.waitForLoadState('load', { timeout: 20000 }).catch(() => {});
  await page.waitForTimeout(ms);
}

// ---------------------------------------------------------------- PNG / WebP sizes
function pngSize(b) { return b.length > 24 && b.readUInt32BE(12) === 0x49484452 ? [b.readUInt32BE(16), b.readUInt32BE(20)] : null; }
function webpSize(b) {
  if (b.length < 30 || b.toString('ascii', 0, 4) !== 'RIFF' || b.toString('ascii', 8, 12) !== 'WEBP') return null;
  const c = b.toString('ascii', 12, 16);
  if (c === 'VP8X') return [1 + b.readUIntLE(24, 3), 1 + b.readUIntLE(27, 3)];
  if (c === 'VP8 ') return [b.readUInt16LE(26) & 0x3fff, b.readUInt16LE(28) & 0x3fff];
  if (c === 'VP8L') { const n = b.readUInt32LE(21); return [1 + (n & 0x3fff), 1 + ((n >> 14) & 0x3fff)]; }
  return null;
}
const isRel = u => typeof u === 'string' && !/^([a-z]+:)?\/\//i.test(u) && !u.startsWith('/');
const isHex = c => /^#[0-9a-f]{6}$/i.test(c || '');

// ---------------------------------------------------------------- the manifest (static + Chrome's own installability check)
async function manifestChecks(page, env, base) {
  const G = 'manifest' + (base || ' /');
  const scopeUrl = env.origin + base + '/';
  const m = await page.evaluate(async () => {
    const l = document.querySelector('link[rel="manifest"]'); if (!l) return null;
    const r = await fetch(l.href); return { href: l.href, type: r.headers.get('content-type'), json: await r.json() };
  });
  check(G, 'hub links a manifest', !!m);
  if (!m) return;
  const j = m.json, href = m.href;
  check(G, 'served as application/manifest+json', /manifest\+json/.test(m.type || ''), m.type);
  check(G, 'name and short_name (short_name ≤ 12 chars)', j.name && j.short_name && [...j.short_name].length <= 12, j.short_name);
  check(G, 'id, start_url and scope are relative', ['id', 'start_url', 'scope'].every(k => isRel(j[k])), JSON.stringify([j.id, j.start_url, j.scope]));
  const start = new URL(j.start_url, href).href, scope = new URL(j.scope, href).href;
  check(G, 'scope is the site folder, start_url inside it', scope === scopeUrl && start.startsWith(scope), start + ' / ' + scope);
  check(G, 'display standalone, display_override set', j.display === 'standalone' && Array.isArray(j.display_override) && j.display_override.length >= 1, JSON.stringify(j.display_override));
  check(G, 'theme_color and background_color (#rrggbb, same as the dark theme --kb-bg)', isHex(j.theme_color) && isHex(j.background_color) && j.background_color.toLowerCase() === '#1d2a35', j.theme_color + ' ' + j.background_color);
  const hub = await page.evaluate(() => [...document.querySelectorAll('meta[name="theme-color"]')].map(x => [x.getAttribute('media') || '', x.getAttribute('content')]));
  check(G, 'hub theme-color for light and dark (media)', hub.some(([q]) => /light/.test(q)) && hub.some(([q]) => /dark/.test(q)), JSON.stringify(hub));
  const urls = [].concat((j.icons || []).map(i => i.src), (j.shortcuts || []).map(s => s.url), ...(j.shortcuts || []).map(s => (s.icons || []).map(i => i.src)), (j.screenshots || []).map(s => s.src));
  check(G, 'every URL in the manifest is relative', urls.every(isRel), urls.filter(u => !isRel(u)).join(' '));
  const fetchBuf = async u => { const r = await page.request.get(new URL(u, href).href); return { ok: r.ok(), status: r.status(), body: r.ok() ? Buffer.from(await r.body()) : null }; };
  for (const [purpose, size] of [['any', 192], ['any', 512], ['maskable', 192], ['maskable', 512]]) {
    const ic = (j.icons || []).find(i => (i.purpose || 'any').split(/\s+/).includes(purpose) && i.sizes === size + 'x' + size && i.type === 'image/png');
    let real = null;
    if (ic) { const r = await fetchBuf(ic.src); real = r.body && pngSize(r.body); }
    check(G, `icon ${purpose} ${size}×${size} PNG exists with that size`, ic && real && real[0] === size && real[1] === size, ic ? ic.src + ' ' + JSON.stringify(real) : 'missing');
  }
  const sc = j.shortcuts || [];
  check(G, '4 shortcuts to games in the registry', sc.length === 4 && sc.every(s => REG.games.some(g => new URL(s.url, href).href === new URL(g.path, scopeUrl).href)), sc.map(s => s.url).join(' '));
  for (const s of sc) {
    const ic = (s.icons || [])[0]; let real = null;
    if (ic) { const r = await fetchBuf(ic.src); real = r.body && pngSize(r.body); }
    check(G, `shortcut ${s.short_name}: 96×96 PNG icon`, ic && ic.sizes === '96x96' && real && real[0] === 96 && real[1] === 96, ic && ic.src);
  }
  for (const s of j.screenshots || []) {
    const r = await fetchBuf(s.src), real = r.body && webpSize(r.body), [w, h] = (s.sizes || '').split('x').map(Number);
    check(G, `screenshot ${s.form_factor} ${s.sizes}`, real && real[0] === w && real[1] === h && ['narrow', 'wide'].includes(s.form_factor), s.src + ' ' + JSON.stringify(real));
  }
  // Chrome's own check (what Lighthouse's "installable" uses). Needs the page controlled by the service worker
  try {
    const cdp = await page.context().newCDPSession(page);
    const a = await cdp.send('Page.getAppManifest').catch(e => ({ err: e.message }));
    check(G, 'Chrome parses the manifest without errors', a && !a.err && !(a.errors || []).filter(e => e.critical).length, JSON.stringify((a && (a.errors || a.err)) || '').slice(0, 300));
    const ie = await cdp.send('Page.getInstallabilityErrors').catch(e => ({ err: e.message }));
    if (ie && ie.err) check(G, 'Chrome installability check (CDP) available', true, 'not available in this Chromium: ' + ie.err);
    else check(G, 'Chrome: installable (no installability errors)', !(ie.installabilityErrors || []).length, JSON.stringify(ie.installabilityErrors));
    await cdp.detach();
  } catch (e) { check(G, 'CDP manifest check', false, e.message); }
}

// ---------------------------------------------------------------- one base path
async function runBase(browser, base) {
  const env = await startServer(base);
  const G = 'offline' + (base || ' /'), U = 'update' + (base || ' /');
  const site = env.origin + base + '/';
  const L = swLists();
  console.log(`\n${site}  (sw.js BUILD ${L.BUILD}, cache ${L.VERSION})`);
  const ctx = await newContext(browser, env);
  try {
    const page = await ctx.newPage();
    const hubLog = watch(page, env);
    // another site on the same origin (github.io has many) keeps its own cache: the cleanup must not touch it
    await page.goto(site, { waitUntil: 'load' });
    await page.evaluate(() => caches.open('other-site-cache').then(c => c.put('/x', new Response('x'))));
    const reg = await page.evaluate(async () => {
      const r = await navigator.serviceWorker.ready;
      if (r.active.state !== 'activated') await new Promise(res => { r.active.addEventListener('statechange', () => { if (r.active.state === 'activated') res(); }); setTimeout(res, 10000); });
      return { scope: r.scope, state: r.active && r.active.state, preload: r.navigationPreload ? await r.navigationPreload.getState() : null }; });
    check(G, 'service worker active, scope = the site folder', reg.state === 'activated' && reg.scope === site, JSON.stringify(reg));
    check(G, 'navigation preload enabled', reg.preload && reg.preload.enabled === true, JSON.stringify(reg.preload));
    await page.reload({ waitUntil: 'load' });
    check(G, 'the hub is controlled by the worker after a reload', await page.evaluate(() => !!navigator.serviceWorker.controller));
    const cacheKeys = () => page.evaluate(async v => { const c = await caches.open(v); return (await c.keys()).map(r => r.url); }, L.VERSION);
    let keys = await cacheKeys();
    const core = L.CORE.map(u => new URL(u, site).href);
    const missing = core.filter(u => !keys.includes(u));
    check(G, `first visit saves the hub shell and common/ (${core.length} files)`, !missing.length, missing.join(' '));
    const early = keys.filter(u => L.ENGINES.concat(GAMES.map(g => './' + g.path)).some(x => new URL(x, site).href === u));
    check(G, 'first visit does not save game pages or ENGINES', !early.length, early.join(' '));
    // bytes a new visitor downloads (as Firebase Hosting sends them: text gzip-compressed, images as they are)
    {
      const seen = [...new Set(env.state.requests.map(u => u.split('?')[0]))];
      let raw = 0, gz = 0;
      for (const u of seen) {
        const f = resolveFile(base ? u.slice(base.length) : u); if (!f) continue;
        const b = fs.readFileSync(f); raw += b.length; gz += /\.(png|webp|jpg)$/.test(f) ? b.length : require('zlib').gzipSync(b).length;
      }
      firstVisit[base || '/'] = { files: seen.length, raw, gzip: gz };
      console.log(`    first visit: ${seen.length} files, ${(raw / 1e6).toFixed(2)} MB raw, ${(gz / 1e6).toFixed(2)} MB gzip`);
      check(G, 'first visit downloads under 1 MB (gzip)', gz < 1e6, gz);
    }
    check(G, 'no file of the site was saved under a ?query key', keys.filter(u => u.startsWith(site)).every(u => !u.includes('?')), keys.filter(u => u.startsWith(site) && u.includes('?')).join(' '));
    check(G, 'hub online: no errors', !hubLog.errors.length && !hubLog.failed.length, hubLog.errors.concat(hubLog.failed).join(' | '));
    await manifestChecks(page, env, base);

    const openOffline = async (p, label, wantFallback) => {
      const pg = await ctx.newPage();
      const log = watch(pg, env);
      let status = 0;
      try {
        const r = await pg.goto(site + p.path, { waitUntil: 'load', timeout: 30000 });
        status = r ? r.status() : 0;
        await settle(pg, p.three ? 3000 : 1500);
        if (!wantFallback) { await pg.reload({ waitUntil: 'load', timeout: 30000 }); await settle(pg, p.three ? 2500 : 1000); } // offline again, as on a train
      } catch (e) { log.errors.push('navigation: ' + e.message.split('\n')[0]); }
      const dom = await pg.evaluate(() => ({ title: document.title, offlinePage: !!document.querySelector('#retry') && /offline|オフライン/i.test(document.title), home: document.getElementById('home') && document.getElementById('home').href, canvas: document.querySelectorAll('canvas').length, cards: document.querySelectorAll('#games .game, #games a').length, body: (document.body && document.body.innerText || '').length })).catch(() => ({}));
      if (wantFallback) check(G, label, status === 200 && dom.offlinePage && dom.home === site, JSON.stringify(dom));
      else {
        const okDom = p.id === 'hub' ? dom.cards >= REG.games.length : p.id === 'ranking' || p.id === 'profile' ? dom.body > 20 : dom.canvas > 0 || dom.body > 50;
        check(G, label, status === 200 && !dom.offlinePage && okDom && !log.errors.length && !log.failed.length, [JSON.stringify(dom)].concat(log.errors, log.failed).join(' | '));
      }
      await pg.close();
    };
    const pages = [{ id: 'hub', path: '' }, { id: 'ranking', path: 'ranking/' }, { id: 'profile', path: 'profile/' }].concat(GAMES.map(g => ({ id: g.id, path: g.path, three: g.tech === '3d' })));
    // ---- offline before any game was opened: a game shows the offline page
    await ctx.setOffline(true);
    if (GAMES[0]) await openOffline({ id: GAMES[0].id, path: GAMES[0].path }, `offline: ${GAMES[0].id} never opened → offline.html (link to the top)`, true);
    await ctx.setOffline(false);
    // ---- online: open every game (and ranking / profile) once
    for (const p of pages.slice(1)) {
      const pg = await ctx.newPage();
      await pg.goto(site + p.path, { waitUntil: 'load', timeout: 30000 }).catch(() => {});
      await settle(pg, p.three ? 2500 : 1200);
      await pg.close();
    }
    await sleep(5000); // the worker saves each game's ENGINES a few seconds after its page opened
    keys = await cacheKeys();
    for (const g of GAMES) {
      const want = [g.path].concat(L.ENGINES.filter(u => u.startsWith('./' + g.path)).map(u => u.slice(2))).map(u => new URL(u, site).href);
      const miss = want.filter(u => !keys.includes(u));
      check(G, `${g.id} opened once → its page and ENGINES (${want.length - 1}) saved`, !miss.length, miss.join(' '));
    }
    if (GAMES.some(g => g.tech === '3d')) check(G, 'three.js r128 saved on first use (3D games offline)', keys.some(u => /three\.min\.js/.test(u)));
    // ---- offline: every page opened before
    await ctx.setOffline(true);
    for (const p of pages) await openOffline(p, `offline: ${p.id} loads after one visit (no errors, ${p.id === 'hub' ? 'all cards' : 'page content'})`, false);
    // ---- a page that was never saved: the offline page (ja, then en), linking to the top of the site
    {
      const pg = await ctx.newPage();
      const r = await pg.goto(site + 'no-such-page/?x=1', { waitUntil: 'load' }).catch(e => null);
      await pg.waitForLoadState('load').catch(() => {});
      const d = await pg.evaluate(() => ({ h: document.querySelector('h1') && document.querySelector('h1').textContent, home: document.getElementById('home') && document.getElementById('home').href, lang: document.documentElement.lang })).catch(() => ({}));
      check(G, 'unsaved page offline → offline page in Japanese, link to the top of the site', r && r.status() === 200 && d.h === 'オフラインです' && d.home === site && d.lang === 'ja', JSON.stringify(d));
      for (let i = 0; i < 4; i++) { await pg.waitForLoadState('load').catch(() => {}); if (await pg.evaluate(() => { localStorage.setItem('kobo.lang', 'en'); return true; }).catch(() => false)) break; await sleep(500); }
      await pg.goto(site + 'no-such-page/', { waitUntil: 'load' }).catch(e => console.log('    (goto: ' + e.message.split('\n')[0] + ')'));
      // (a late navigation can replace the page while it is read: read again after it settles)
      let e = {};
      for (let i = 0; i < 4; i++) {
        await pg.waitForLoadState('load').catch(() => {});
        e = await pg.evaluate(() => ({ h: document.querySelector('h1') && document.querySelector('h1').textContent, lang: document.documentElement.lang })).catch(x => ({ err: x.message.split('\n')[0] }));
        if (!e.err && e.h) break;
        await sleep(500);
      }
      check(G, 'offline page in English (kobo.lang = en)', e.h === 'You are offline' && e.lang === 'en', JSON.stringify(e));
      await pg.evaluate(() => localStorage.removeItem('kobo.lang')).catch(() => {});
      await pg.close();
    }
    // ---- API calls are never cached or answered by the worker
    {
      const r = await page.evaluate(async () => {
        const c = await caches.keys(), out = [];
        for (const k of c) { const cc = await caches.open(k); for (const q of await cc.keys()) out.push(q.url); }
        return out.filter(u => /googleapis\.com\/(?!css)|firebaseio|firebasedatabase|identitytoolkit|securetoken|\/__\//.test(u));
      });
      check(G, 'no Firebase / API response in any cache', !r.length, r.join(' '));
    }
    await ctx.setOffline(false);

    // ---- update: a new sw.js → waiting → toast → reload only when asked
    env.state.swExtra = '\n// test: a new version ' + Date.now() + '\n';
    const navs = []; page.on('framenavigated', f => { if (f === page.mainFrame()) navs.push(f.url()); });
    await page.goto(site, { waitUntil: 'load' });
    navs.length = 0;
    await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => r.update()));
    const toast = await page.waitForSelector('.kb-toast--update', { timeout: 20000 }).catch(() => null);
    check(U, 'new version waiting → "新しいバージョンがあります" toast with an 更新 button', !!toast && /新しいバージョンがあります/.test(await toast.textContent()) && !!(await toast.$('.kb-toast__btn')), toast && await toast.textContent());
    await sleep(2500);
    check(U, 'no automatic reload while the toast is up', navs.length === 0, navs.join(' '));
    const waiting = await page.evaluate(() => navigator.serviceWorker.getRegistration().then(r => !!r.waiting));
    check(U, 'the new worker waits (does not take over by itself)', waiting);
    // a game in play: the toast waits until the game is idle (KoboGame.isIdle)
    {
      const g2 = await ctx.newPage();
      // in play from the start: both idle checks (KoboCloud.isIdle → KoboGame.isIdle) say busy, whatever order the page registers in
      await g2.addInitScript(() => {
        window.__busy = true;
        for (const name of ['KoboGame', 'KoboCloud']) {
          let cur; Object.defineProperty(window, name, { configurable: true, set(v) { if (v) v.isIdle = () => !window.__busy; cur = v; }, get() { return cur; } });
        }
      });
      await g2.goto(site + 'blocks/', { waitUntil: 'load' });
      await sleep(5000);
      const shownBusy = await g2.$('.kb-toast--update');
      check(U, 'a game in play does not get the toast (KoboGame.isIdle() false)', !shownBusy);
      await g2.evaluate(() => { window.__busy = false; });
      const later = await g2.waitForSelector('.kb-toast--update', { timeout: 12000 }).catch(() => null);
      check(U, '…and gets it once the game is idle', !!later);
      await g2.close();
    }
    const oldKeys = await page.evaluate(() => caches.keys());
    await page.click('.kb-toast--update .kb-toast__btn');
    await page.waitForEvent('load', { timeout: 20000 }).catch(() => {});
    await sleep(1500);
    check(U, '更新 reloads the page once', navs.length >= 1, navs.join(' '));
    const after = await page.evaluate(async () => { const r = await navigator.serviceWorker.getRegistration(); return { waiting: !!r.waiting, keys: await caches.keys() }; });
    check(U, 'the new worker took over (nothing waiting)', !after.waiting, JSON.stringify(after));
    check(U, 'old kobo-v caches removed, the other site\'s cache kept', after.keys.filter(k => k.startsWith('kobo-v')).length === 1 && after.keys.includes('other-site-cache'), JSON.stringify({ before: oldKeys, after: after.keys }));
    // after the update the site still works offline
    await ctx.setOffline(true);
    const pg = await ctx.newPage(); const log = watch(pg, env);
    const r = await pg.goto(site + (GAMES[0] ? GAMES[0].path : ''), { waitUntil: 'load' }).catch(() => null);
    await settle(pg, 1200);
    check(U, 'still works offline after the update', r && r.status() === 200 && !log.errors.length, log.errors.join(' | '));
    await ctx.setOffline(false);
  } finally {
    await ctx.close();
    await env.close();
  }
}

(async () => {
  ensureCdn();
  const browser = await chromium.launch({ headless: !argv.includes('--headed'), args: GL_ARGS });
  try { for (const b of BASES) await runBase(browser, b); }
  catch (e) { check('run', 'finished', false, e && e.stack); }
  finally { await browser.close(); }
  const fail = rows.filter(r => !r.pass);
  fs.mkdirSync(path.join(__dirname, 'out'), { recursive: true });
  fs.writeFileSync(path.join(__dirname, 'out', 'pwa-offline.json'), JSON.stringify({ at: new Date().toISOString(), firstVisit, rows }, null, 1));
  console.log(`\npwa-offline: ${rows.length - fail.length} passed, ${fail.length} failed`);
  process.exit(fail.length ? 1 : 0);
})();
