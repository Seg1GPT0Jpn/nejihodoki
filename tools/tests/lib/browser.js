// Chromium の起動と、テスト用のページを開く補助（ページごとに新しい context）
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const { chromium } = require('playwright');
const { seedScript } = require('./storage');
const { instrumentScript, fakeFirebaseSdk } = require('./fakes');
const httpsOrigin = require('./https-origin');

const GL_ARGS = ['--use-gl=swiftshader', '--enable-unsafe-swiftshader', '--ignore-gpu-blocklist'];
const NOGL_ARGS = ['--disable-gpu', '--disable-software-rasterizer', '--disable-webgl', '--disable-3d-apis'];
const CACHE = path.join(__dirname, '..', '.cache');

// 外部のファイルのうち、手元に置いて返すもの（ネットにつながらなくても動くように）
const CDN = [
  { re: /^https:\/\/cdnjs\.cloudflare\.com\/ajax\/libs\/three\.js\/r128\/three\.min\.js/, file: 'three-r128.min.js', url: 'https://cdnjs.cloudflare.com/ajax/libs/three.js/r128/three.min.js', type: 'text/javascript' },
];
function ensureCdn() {
  fs.mkdirSync(CACHE, { recursive: true });
  for (const c of CDN) {
    const f = path.join(CACHE, c.file);
    if (fs.existsSync(f) && fs.statSync(f).size > 1000) continue;
    try { execFileSync('curl', ['-sSfL', '--max-time', '60', '-o', f, c.url], { stdio: 'pipe' }); }
    catch (e) { try { fs.unlinkSync(f); } catch (_) {} throw new Error('could not download ' + c.url + ' into ' + f + ' (put the file there by hand when offline)'); }
  }
}

// console.error のうち、テストの環境のせいで出るもの（失敗にしない）
const IGNORE_CONSOLE = [
  /Could not reach Cloud Firestore backend/i,
  /Firestore \(.*\): .*offline/i,
  /\[Violation\]/,
];

async function launch(opts = {}) {
  return chromium.launch({ headless: !opts.headed, args: opts.noGl ? NOGL_ARGS : GL_ARGS });
}

// safe-area を CDP で入れられないときの代わり：env(safe-area-inset-*) を数値に置き換えた CSS を入れ直す
function safeAreaCssFallback(safe) {
  return `(() => {
  const S = ${JSON.stringify(safe)};
  const rep = t => t.replace(/env\\(\\s*safe-area-inset-(top|bottom|left|right)\\s*(?:,[^()]*(?:\\([^()]*\\))?[^()]*)?\\)/g, (m, k) => (S[k] || 0) + 'px');
  const fix = () => {
    for (const sh of Array.from(document.styleSheets)) {
      let rules; try { rules = sh.cssRules; } catch (e) { continue; }
      const walk = (list, owner) => { for (let i = list.length - 1; i >= 0; i--) { const r = list[i];
        if (r.cssRules && !r.style) { walk(r.cssRules, r); continue; }
        if (r.cssText && r.cssText.includes('safe-area-inset') && !r.__kbt) { const t = rep(r.cssText); try { owner.deleteRule(i); owner.insertRule(t, i); } catch (e) {} } } };
      walk(rules, sh);
    }
    document.querySelectorAll('[style*="safe-area-inset"]').forEach(el => el.setAttribute('style', rep(el.getAttribute('style'))));
  };
  document.addEventListener('DOMContentLoaded', fix); window.addEventListener('load', fix);
})();`;
}

// 1ページぶんの context を作る
// opts: { vp, lang, seed, https, fakeFirebase, fsInit, notch, initScripts, offline }
async function newSession(env, opts = {}) {
  const vp = opts.vp;
  const lang = opts.lang || 'ja';
  const ctx = await env.browser(opts.noGl).newContext({
    viewport: { width: vp.width, height: vp.height }, screen: { width: vp.width, height: vp.height },
    deviceScaleFactor: opts.dpr || vp.dpr || 2, isMobile: opts.isMobile !== false, hasTouch: opts.hasTouch !== false,
    locale: lang === 'en' ? 'en-US' : 'ja-JP', timezoneId: 'Asia/Tokyo',
    serviceWorkers: 'block', ignoreHTTPSErrors: true,
  });
  const log = { pageErrors: [], consoleErrors: [], consoleWarnings: [], blocked: [], requests: 0, failed: [] };
  const blockedUrls = new Set();
  const root = env.server.root;

  await ctx.route('**/*', async route => {
    const url = route.request().url();
    log.requests++;
    if (url.startsWith(env.server.url + '/') || url.startsWith('data:') || url.startsWith('blob:')) return route.continue();
    if (opts.https && httpsOrigin.isOrigin(url)) return httpsOrigin.serveLocal(route, root);
    for (const c of CDN) if (c.re.test(url)) return route.fulfill({ status: 200, contentType: c.type, body: fs.readFileSync(path.join(CACHE, c.file)), headers: { 'Access-Control-Allow-Origin': '*' } });
    if (/^https:\/\/fonts\.googleapis\.com\//.test(url)) return route.fulfill({ status: 200, contentType: 'text/css', body: '/* fonts are stubbed in tests */' });
    if (opts.fakeFirebase && /^https:\/\/(cdn\.jsdelivr\.net\/npm\/firebase@|www\.gstatic\.com\/firebasejs\/)/.test(url)) {
      const body = /firebase-app(-compat)?\.js/.test(url) ? fakeFirebaseSdk() : '/* fake firebase: included in app-compat */';
      return route.fulfill({ status: 200, contentType: 'text/javascript', body });
    }
    blockedUrls.add(url); log.blocked.push(url);
    return route.abort('blockedbyclient');
  });

  await ctx.addInitScript(instrumentScript());
  const seed = Object.assign({}, opts.seed || {});
  if (lang && !('kobo.lang' in seed)) seed['kobo.lang'] = lang;
  await ctx.addInitScript(seedScript(seed));
  if (opts.fsInit) await ctx.addInitScript(`window.__kbtFsInit = ${JSON.stringify(opts.fsInit)};`);
  for (const s of opts.initScripts || []) await ctx.addInitScript(s);

  const page = await ctx.newPage();
  page.setDefaultTimeout(opts.timeout || 15000);
  page.on('pageerror', e => log.pageErrors.push(String((e && e.stack) || e).split('\n').slice(0, 3).join(' | ')));
  page.on('console', m => {
    const type = m.type();
    if (type !== 'error' && type !== 'warning') return;
    const text = m.text(); const loc = m.location() || {};
    if (type === 'warning') { log.consoleWarnings.push(text); return; }
    // 遮断した外部のリクエストの失敗は数えない
    if (/Failed to load resource|ERR_BLOCKED_BY_CLIENT/.test(text) && (blockedUrls.has(loc.url) || /ERR_BLOCKED_BY_CLIENT/.test(text))) return;
    if (IGNORE_CONSOLE.some(re => re.test(text))) return;
    log.consoleErrors.push(text.slice(0, 300) + (loc.url ? ' @' + loc.url.replace(env.server.url, '').replace(httpsOrigin.ORIGIN, '') + ':' + (loc.lineNumber + 1) : ''));
  });
  page.on('requestfailed', r => { if (!blockedUrls.has(r.url())) log.failed.push(r.url() + ' ' + ((r.failure() && r.failure().errorText) || '')); });

  // ノッチ（safe-area）
  let notch = 'none';
  const safe = vp.safe || {};
  if (opts.notch !== false && (safe.top || safe.bottom || safe.left || safe.right)) {
    try {
      const cdp = await ctx.newCDPSession(page);
      await cdp.send('Emulation.setSafeAreaInsetsOverride', { insets: { top: safe.top || 0, bottom: safe.bottom || 0, left: safe.left || 0, right: safe.right || 0 } });
      notch = 'cdp';
    } catch (e) {
      await page.addInitScript(safeAreaCssFallback(safe));
      notch = 'css';
    }
  }

  const base = opts.https ? httpsOrigin.ORIGIN : env.server.url;
  const s = {
    ctx, page, log, base, notch, vp, lang,
    url: p => base + p,
    async goto(p, o = {}) {
      await page.goto(base + p, { waitUntil: 'load', timeout: o.timeout || 20000 });
      await settle(page, o);
    },
    async reload(o = {}) { await page.reload({ waitUntil: 'load' }); await settle(page, o); },
    close: () => ctx.close().catch(() => {}),
  };
  return s;
}

// 読み込みのあと、通信が静まり、2フレーム描かれるまで待つ（固定の sleep は使わない）
async function settle(page, o = {}) {
  await page.waitForLoadState('networkidle', { timeout: o.idleTimeout || 6000 }).catch(() => {});
  await page.evaluate(() => document.fonts && document.fonts.ready).catch(() => {});
  await frames(page, 2);
}
const frames = (page, n = 1) => page.evaluate(n => new Promise(r => { let i = 0; const f = () => (++i >= n ? r() : requestAnimationFrame(f)); requestAnimationFrame(f); }), n).catch(() => {});

module.exports = { launch, newSession, settle, frames, ensureCdn, GL_ARGS, NOGL_ARGS, IGNORE_CONSOLE };
