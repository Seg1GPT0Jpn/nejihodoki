// 画面サイズのテスト（TEST_PLAN.md の layout）：全ページ × 画面サイズ × 言語
//  - 横スクロールが出ない
//  - 見えている操作は、画面の中にあるか、スクロールできる入れ物の中で届く
//  - 開いているオーバーレイの主なボタンが、スクロールしなくても見えていて押せる。高さ44px以上
//  - 英語のとき、見えている文字に日本語が残っていない
//  - スクリーンショット（out/shots/viewport/<page>/<size>-<lang>.png）
'use strict';
const fs = require('fs');
const path = require('path');
const { pages } = require('../lib/pages');
const { newSession } = require('../lib/browser');
const { layoutProbe, jpScan } = require('../lib/layout');

function plan(opts) {
  const tasks = [];
  for (const p of opts.pages(pages())) for (const vp of opts.viewports()) for (const lang of opts.langs)
    tasks.push({ page: p.id, vp: vp.name, lang, run: (env, t) => one(env, t, p, vp, lang) });
  return tasks;
}

async function one(env, t, p, vp, lang) {
  const s = await newSession(env, { vp, lang, dpr: env.opts.dpr });
  try {
    await s.goto(p.path);
    const { page, log } = s;
    if (p.three) await page.waitForFunction(() => window.__kbt && window.__kbt.draws > 0, null, { timeout: 8000 }).catch(() => {});
    const r = await page.evaluate(`(${layoutProbe})()`);
    t.check('no-hscroll', r.hscroll <= 1, `page scrolls sideways by ${r.hscroll}px`);
    t.check('controls-reachable', r.offscreen.length === 0, r.offscreen.slice(0, 6).join('; ') + (r.offscreen.length > 6 ? ` (+${r.offscreen.length - 6})` : ''), { passDetail: r.controls + ' controls' });
    const bad = r.primary.filter(x => x.problems.length);
    t.check('primary-visible', bad.length === 0, bad.map(x => `${x.overlay} → ${x.button}: ${x.problems.join(', ')}`).join('; '), { passDetail: r.primary.map(x => x.button).join(', ') || 'no overlay open' });
    const short = r.primary.filter(x => x.h < 44);
    t.check('primary-44px', short.length === 0, short.map(x => `${x.button} is ${x.w}x${x.h}`).join('; '));
    t.check('tap-size', r.small.length === 0, `${r.small.length} controls under 44px: ` + r.small.slice(0, 6).join('; '), { severity: 'warn' });
    if (lang === 'en') {
      const jp = await page.evaluate(`(${jpScan})(true)`);
      t.check('en-no-japanese-visible', jp.length === 0, jp.slice(0, 8).join(' | ') + (jp.length > 8 ? ` (+${jp.length - 8})` : ''));
    }
    t.check('no-page-errors', log.pageErrors.length === 0, log.pageErrors.slice(0, 3));
    if (s.notch === 'css') t.check('notch-emulation', true, '', { passDetail: 'css fallback' });
    const dir = path.join(env.out, 'shots', 'viewport', p.id);
    fs.mkdirSync(dir, { recursive: true });
    await page.screenshot({ path: path.join(dir, `${vp.name}-${lang}.png`), timeout: 15000 });
  } finally { await s.close(); }
}

module.exports = { name: 'viewport', aliases: ['layout'], describe: '全ページ × 画面サイズ × 言語：画面内のボタン、横スクロール、主なボタン、英語の残り', plan };
