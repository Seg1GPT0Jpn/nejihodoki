// node tools/ui-demo/tests/demo.check.js [outDir]
// tools/ui-demo/index.html を 320×568・375×667・414×736 × ライト/ダーク × ja/en で開き、
// はみ出し・44px 未満の操作・コンソールのエラー・英語に残る日本語を調べ、スクリーンショットを撮る。
'use strict';
const http = require('http'), fs = require('fs'), path = require('path');
const { chromium } = require('playwright');
const ROOT = path.resolve(__dirname, '../../..');
const OUT = path.resolve(process.argv[2] || path.join(ROOT, 'tools/ui-demo/out'));
fs.mkdirSync(OUT, { recursive: true });
const TYPES = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.png': 'image/png', '.json': 'application/json', '.webmanifest': 'application/manifest+json' };
const server = http.createServer((req, res) => {
  const u = decodeURIComponent(new URL(req.url, 'http://x').pathname);
  let f = path.join(ROOT, u); if (!f.startsWith(ROOT)) { res.writeHead(403); return res.end(); }
  if (fs.existsSync(f) && fs.statSync(f).isDirectory()) f = path.join(f, 'index.html');
  if (!fs.existsSync(f)) { res.writeHead(404); return res.end(); }
  res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); fs.createReadStream(f).pipe(res);
});
const SIZES = [[320, 568], [375, 667], [414, 736]];
const THEMES = ['dark', 'light'], LANGS = ['ja', 'en'];
const problems = [];
const note = (k, m) => problems.push(`[${k}] ${m}`);

// checks run inside the page; `scope` limits to an open overlay panel when given
function audit(scope) {
  const W = innerWidth, H = innerHeight, out = [];
  const root = scope ? document.querySelector(scope) : document;
  const vis = e => { const r = e.getBoundingClientRect(); const cs = getComputedStyle(e); return r.width > 0 && r.height > 0 && cs.visibility !== 'hidden' && !e.closest('[hidden]'); };
  if (document.documentElement.scrollWidth > W + 1) out.push('horizontal scroll: ' + document.documentElement.scrollWidth + ' > ' + W);
  const ctl = root.querySelectorAll('button, a[href], input, select, [role=switch], [role=tab], [role=radio]');
  for (const e of ctl) {
    if (!vis(e)) continue;
    const r = e.getBoundingClientRect();
    const name = (e.getAttribute('aria-label') || e.textContent || e.className).trim().slice(0, 30);
    if (r.left < -0.5 || r.right > W + 0.5) out.push(`off-screen x: "${name}" ${Math.round(r.left)}..${Math.round(r.right)}`);
    if (scope && (r.top < -0.5 || r.bottom > H + 0.5) && !e.closest('.kb-panel__body')) out.push(`off-screen y: "${name}" ${Math.round(r.top)}..${Math.round(r.bottom)}`);
    const tap = e.matches('input[type=range]') ? r.height : Math.min(r.width, r.height);
    if (tap < 43.5) out.push(`small target ${Math.round(r.width)}x${Math.round(r.height)}: "${name}"`);
    if (!e.matches('input[type=range]') && !e.getAttribute('aria-label') && !e.getAttribute('aria-labelledby') && !e.textContent.trim()) out.push('no accessible name: ' + e.outerHTML.slice(0, 80));
  }
  // text overflowing its box horizontally
  for (const e of root.querySelectorAll('.kb-btn, .kb-seg__opt, .kb-tab, .kb-badge, .kb-list__title, .kb-card__title, .kb-panel__title, .kb-bar__title')) {
    if (!vis(e)) continue;
    if (e.scrollWidth > e.clientWidth + 1 && !e.matches('.kb-bar__title, .kb-seg__opt')) out.push('text overflow: "' + e.textContent.trim().slice(0, 30) + '"');
    if (e.matches('.kb-seg__opt') && e.scrollWidth > e.clientWidth + 1) out.push('segment label clipped: "' + e.textContent.trim() + '"');
  }
  if (scope) {
    const p = document.querySelector(scope);
    if (p) { const r = p.getBoundingClientRect(); if (r.top < -0.5 || r.bottom > H + 0.5) out.push(`panel outside viewport ${Math.round(r.top)}..${Math.round(r.bottom)} / ${H}`); }
  }
  return out;
}
function leftoverJapanese() {
  const JP = /[぀-ヿ一-鿿]/, out = [];
  const w = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
  for (let n = w.nextNode(); n; n = w.nextNode()) {
    const t = n.nodeValue.trim(); if (!t || !JP.test(t)) continue;
    const p = n.parentElement; if (!p || p.closest('[hidden], script, style') || !p.getClientRects().length) continue;
    if (p.closest('[lang="ja"]') || t === '日本語') continue; // language names are shown in their own language
    out.push(t.slice(0, 40));
  }
  for (const e of document.querySelectorAll('[aria-label]')) if (JP.test(e.getAttribute('aria-label')) && e.getClientRects().length) out.push('aria-label: ' + e.getAttribute('aria-label'));
  return out;
}

(async () => {
  await new Promise(r => server.listen(0, '127.0.0.1', r));
  const base = `http://127.0.0.1:${server.address().port}/tools/ui-demo/`;
  const browser = await chromium.launch();
  let shots = 0, combos = 0;
  for (const [w, h] of SIZES) for (const theme of THEMES) for (const lang of LANGS) {
    combos++;
    const tag = `${w}x${h}-${theme}-${lang}`;
    const ctx = await browser.newContext({ viewport: { width: w, height: h }, deviceScaleFactor: 2, hasTouch: true, isMobile: true, colorScheme: 'dark' });
    await ctx.addInitScript(([l, t]) => { try { localStorage.setItem('kobo.lang', l); localStorage.setItem('kobo.theme', t); } catch (e) {} }, [lang, theme]);
    // Google Fonts may be unreachable from the sandbox; stub it so it never shows up as an error
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    const page = await ctx.newPage();
    const errs = [];
    page.on('pageerror', e => errs.push('pageerror: ' + e.message));
    page.on('console', m => { if (m.type() === 'error') errs.push('console: ' + m.text()); });
    await page.goto(base, { waitUntil: 'load' });
    const info = await page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-kb-theme'), bg: getComputedStyle(document.body).backgroundColor, lang: document.documentElement.lang, meta: document.querySelector('meta[name=theme-color]').content }));
    const wantBg = theme === 'light' ? 'rgb(244, 241, 234)' : 'rgb(29, 42, 53)';
    if (info.attr !== theme || info.bg !== wantBg || info.lang !== lang) note(tag, 'theme/lang not applied: ' + JSON.stringify(info));
    for (const p of await page.evaluate(audit, null)) note(tag, p);
    if (lang === 'en') for (const p of await page.evaluate(leftoverJapanese)) note(tag, 'japanese left: ' + p);
    await page.screenshot({ path: path.join(OUT, `${tag}-top.png`) }); shots++;
    await page.screenshot({ path: path.join(OUT, `${tag}-full.png`), fullPage: true }); shots++;
    // overlays
    const overlays = [['#openSheet', 'sheet'], ['#openSettings', 'settings'], ['#openPause', 'pause'], ['#openConfirm', 'confirm']];
    for (const [sel, name] of overlays) {
      await page.click(sel);
      await page.waitForSelector('.kb-layer:not([hidden]) .kb-panel');
      await page.waitForTimeout(350);
      for (const p of await page.evaluate(audit, '.kb-layer:not([hidden]) .kb-panel')) note(`${tag} ${name}`, p);
      if (lang === 'en') for (const p of await page.evaluate(leftoverJapanese)) note(`${tag} ${name}`, 'japanese left: ' + p);
      const focusIn = await page.evaluate(() => !!document.activeElement.closest('.kb-panel'));
      if (!focusIn) note(`${tag} ${name}`, 'focus not moved into the dialog');
      await page.screenshot({ path: path.join(OUT, `${tag}-${name}.png`) }); shots++;
      if (name === 'pause') {
        await page.keyboard.press('Escape'); // Escape = resume
      } else await page.keyboard.press('Escape');
      await page.waitForTimeout(50);
      const left = await page.evaluate(() => document.querySelectorAll('.kb-layer:not([hidden])').length);
      if (left) note(`${tag} ${name}`, 'Escape did not close the layer');
    }
    // toast
    await page.click('#openToast'); await page.waitForSelector('.kb-toast');
    for (const p of await page.evaluate(() => { const r = document.querySelector('.kb-toast').getBoundingClientRect(); return r.left < 0 || r.right > innerWidth ? ['toast off-screen'] : []; })) note(tag, p);
    for (const e of errs) note(tag, e);
    await ctx.close();
  }

  // behaviour checks (one viewport)
  {
    const ctx = await browser.newContext({ viewport: { width: 375, height: 667 }, colorScheme: 'light', reducedMotion: 'reduce' });
    await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
    await ctx.addInitScript(() => {
      window.__osc = 0;
      const AC = window.AudioContext; if (!AC) return;
      const orig = AC.prototype.createOscillator;
      AC.prototype.createOscillator = function () { window.__osc++; return orig.call(this); };
    });
    const page = await ctx.newPage(); const errs = [];
    page.on('pageerror', e => errs.push(e.message)); page.on('console', m => { if (m.type() === 'error') errs.push(m.text()); });
    await page.goto(base, { waitUntil: 'load' });
    // system theme + OS light → light via CSS media query, no attribute
    let r = await page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-kb-theme'), pref: document.documentElement.getAttribute('data-kb-theme-pref'), bg: getComputedStyle(document.body).backgroundColor }));
    if (r.attr !== null || r.pref !== 'system' || r.bg !== 'rgb(244, 241, 234)') note('behaviour', 'system theme on light OS: ' + JSON.stringify(r));
    // switch theme with the quick panel
    await page.click('#quick [role=radio][data-value="dark"]');
    r = await page.evaluate(() => ({ attr: document.documentElement.getAttribute('data-kb-theme'), ls: localStorage.getItem('kobo.theme'), meta: document.querySelector('meta[name=theme-color]').content }));
    if (r.attr !== 'dark' || r.ls !== 'dark' || r.meta !== '#1d2a35') note('behaviour', 'theme switch: ' + JSON.stringify(r));
    // sounds: unlock with a gesture, play, then mute → no oscillator
    await page.click('[data-sfx=clear]'); await page.waitForTimeout(100);
    const played = await page.evaluate(() => ({ osc: window.__osc, unlocked: KoboAudio.unlocked }));
    if (!played.unlocked || played.osc < 1) note('behaviour', 'audio did not play after gesture: ' + JSON.stringify(played));
    await page.evaluate(() => { KoboAudio.set({ mute: true }); window.__osc = 0; });
    for (const n of ['tap', 'clear', 'win']) await page.click(`[data-sfx=${n}]`);
    const muted = await page.evaluate(() => ({ osc: window.__osc, ks: localStorage.getItem('kusoge.sound'), ka: JSON.parse(localStorage.getItem('kobo.audio')) }));
    if (muted.osc !== 0 || muted.ks !== '0' || !muted.ka.mute) note('behaviour', 'mute not respected: ' + JSON.stringify(muted));
    // the settings panel shows master + SE + mute, BGM row exists but hidden
    const rows = await page.evaluate(() => { const p = document.querySelectorAll('.kb-set')[2]; return { sliders: [...p.querySelectorAll('input[type=range]')].filter(i => i.getClientRects().length).length, bgm: !!p.querySelector('[data-kb-reserved=bgm][hidden]'), sw: !!p.querySelector('[role=switch]') }; });
    if (rows.sliders !== 2 || !rows.bgm || !rows.sw) note('behaviour', 'settings rows: ' + JSON.stringify(rows));
    // slider changes volume
    await page.evaluate(() => KoboAudio.set({ mute: false }));
    await page.evaluate(() => { const i = document.querySelectorAll('.kb-set')[2].querySelector('input[type=range]'); i.value = '40'; i.dispatchEvent(new Event('input', { bubbles: true })); });
    const mv = await page.evaluate(() => KoboAudio.get().master);
    if (Math.abs(mv - 0.4) > 1e-9) note('behaviour', 'master slider → ' + mv);
    // hidden tab suspends the context
    await page.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); document.dispatchEvent(new Event('visibilitychange')); });
    await page.waitForTimeout(100);
    const hid = await page.evaluate(() => ({ st: KoboAudio.ctx() && KoboAudio.ctx().state, can: KoboAudio.canPlay() }));
    if (hid.can) note('behaviour', 'can play while hidden: ' + JSON.stringify(hid));
    // pause menu: backdrop does not close, restart asks for confirmation
    await page.evaluate(() => { delete document.visibilityState; });
    await page.click('#openPause');
    await page.mouse.click(5, 5);
    if (!(await page.evaluate(() => !!document.querySelector('.kb-layer--pause:not([hidden])')))) note('behaviour', 'pause closed by backdrop');
    await page.click('.kb-layer--pause .kb-btn--ghost >> nth=0');
    await page.waitForSelector('[role=alertdialog]');
    await page.keyboard.press('Escape'); // cancel confirm; pause menu must stay
    if (!(await page.evaluate(() => !!document.querySelector('.kb-layer--pause:not([hidden])')))) note('behaviour', 'Escape on confirm also closed the pause menu');
    await page.click('.kb-layer--pause .kb-btn--primary');
    await page.waitForSelector('.kb-toast');
    // tabs keyboard
    await page.focus('[role=tab][aria-selected=true]'); await page.keyboard.press('ArrowRight');
    if ((await page.evaluate(() => document.activeElement.getAttribute('aria-selected'))) !== 'true') note('behaviour', 'tab arrow key');
    for (const e of errs) note('behaviour', e);
    await page.screenshot({ path: path.join(OUT, 'behaviour-375-reduced-motion.png') }); shots++;
    await ctx.close();
  }
  await browser.close(); server.close();
  console.log(`combos ${combos}, screenshots ${shots} → ${OUT}`);
  if (problems.length) { console.log(problems.length + ' problems:\n' + problems.join('\n')); process.exit(1); }
  console.log('no problems');
})().catch(e => { console.error(e); process.exit(2); });
