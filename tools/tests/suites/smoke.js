// スモークテスト（TEST_PLAN.md 8章）：全ページを空の localStorage で開き、エラーが0件で、主な要素があること
'use strict';
const { pages, games } = require('../lib/pages');
const viewports = require('../lib/viewports');
const { newSession } = require('../lib/browser');

const VP = 'ip12';

function plan(opts) {
  const list = opts.pages(pages());
  const tasks = [];
  for (const p of list) {
    tasks.push({ page: p.id, vp: VP, lang: 'ja', run: (env, t) => smokeOne(env, t, p) });
    if (p.three) tasks.push({ page: p.id, vp: VP, lang: 'ja', label: 'no-webgl', run: (env, t) => noWebgl(env, t, p) });
  }
  return tasks;
}

async function smokeOne(env, t, p) {
  const s = await newSession(env, { vp: viewports.get(VP), lang: 'ja' });
  try {
    await s.goto(p.path);
    const { page, log } = s;
    if (p.kind === 'hub') {
      const n = await page.locator('a.game').count();
      const want = games().length;
      t.check('main-elements', n === want, `hub has ${n} game cards, registry has ${want}`);
      t.check('ranking-link', await page.locator('a[href="ranking/"]').count() > 0, 'no link to ranking/');
      t.check('profile-link', await page.locator('a[href="profile/"]').count() > 0, 'no link to profile/');
    } else if (p.kind === 'ranking') {
      const ok = await page.evaluate(() => !!document.getElementById('list') && !!document.getElementById('tabs') && !!document.querySelector('h1'));
      t.check('main-elements', ok, 'missing #list / #tabs / h1');
    } else if (p.kind === 'profile') {
      const info = await page.evaluate(() => ({ lv: (document.getElementById('lv') || {}).textContent || '', ach: document.querySelectorAll('#achBox .a').length,
        games: document.querySelectorAll('#glist .grow').length, del: !!document.getElementById('delBtn'), h1: !!document.querySelector('h1') }));
      t.check('main-elements', info.h1 && /\d/.test(info.lv) && info.ach >= 15 && info.games === games().length && info.del, info);
    } else {
      const info = await page.evaluate(() => ({ canvas: document.querySelectorAll('canvas').length, home: !!document.querySelector('a[href="../"]') }));
      t.check('main-elements', info.canvas > 0 && info.home, info);
    }
    if (p.three) {
      // 最初の描画が5秒以内（WebGL の draw 呼び出しを数える。__kb.ready() があればそれも）
      const ok = await page.waitForFunction(() => window.__kbt && window.__kbt.draws > 0, null, { timeout: 5000 }).then(() => true, () => false);
      const at = await page.evaluate(() => window.__kbt && Math.round(window.__kbt.firstDrawAt));
      t.check('first-draw-5s', ok, `no WebGL draw call within 5s of load (glContexts=${await page.evaluate(() => window.__kbt.glContexts)})`, { passDetail: at + 'ms' });
    }
    t.check('no-page-errors', log.pageErrors.length === 0, log.pageErrors.slice(0, 5));
    t.check('no-console-errors', log.consoleErrors.length === 0, log.consoleErrors.slice(0, 5));
    t.check('no-failed-requests', log.failed.length === 0, log.failed.slice(0, 5));
    // ← ホーム のリンクで / に戻れる
    if (p.kind !== 'hub') {
      const has = await page.locator('a[href="../"]').count();
      if (!has) t.check('home-link', false, 'no a[href="../"]');
      else {
        const href = await page.evaluate(() => document.querySelector('a[href="../"]').href);
        await Promise.all([page.waitForURL(u => u.toString() === s.base + '/', { timeout: 10000 }), page.evaluate(() => document.querySelector('a[href="../"]').click())]).catch(() => {});
        t.check('home-link', page.url() === s.base + '/', `href=${href}, after click url=${page.url()}`);
      }
    }
  } finally { await s.close(); }
}

// WebGL が使えないときの案内が出ること（--disable-gpu --disable-software-rasterizer で起動）
async function noWebgl(env, t, p) {
  const s = await newSession(env, { vp: viewports.get(VP), lang: 'ja', noGl: true });
  try {
    await s.goto(p.path);
    const { page, log } = s;
    const glAvail = await page.evaluate(() => { const c = document.createElement('canvas'); return !!(c.getContext('webgl') || c.getContext('experimental-webgl')); });
    if (glAvail) { t.skip('nogl-message', 'WebGL could not be disabled in this Chromium'); return; }
    const text = await page.evaluate(() => {
      const out = [];
      const tw = document.createTreeWalker(document.body, NodeFilter.SHOW_TEXT);
      for (let n; (n = tw.nextNode());) { const el = n.parentElement; if (el && el.checkVisibility && el.checkVisibility({ opacityProperty: true, visibilityProperty: true }) && n.nodeValue.trim()) out.push(n.nodeValue.trim()); }
      return out.join(' ');
    });
    t.check('nogl-message', /WebGL|3D|グラフィック|表示できません|対応していません|ブラウザ/i.test(text), 'no visible notice mentioning WebGL/3D when WebGL is unavailable; uncaught: ' + JSON.stringify(log.pageErrors.slice(0, 2)));
    t.check('nogl-no-uncaught', log.pageErrors.length === 0, log.pageErrors.slice(0, 3));
  } finally { await s.close(); }
}

module.exports = { name: 'smoke', describe: '全ページ：開いてエラーが0件、主な要素、最初の描画、← ホーム、WebGL なしの案内', plan };
