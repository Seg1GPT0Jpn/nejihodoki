// 英語のとき、ページの中（隠れているオーバーレイや属性も含む）に日本語が残っていないこと
'use strict';
const { pages } = require('../lib/pages');
const viewports = require('../lib/viewports');
const { newSession } = require('../lib/browser');
const { jpScan } = require('../lib/layout');

function plan(opts) {
  return opts.pages(pages()).map(p => ({ page: p.id, vp: 'ip12', lang: 'en', run: (env, t) => one(env, t, p) }));
}
async function one(env, t, p) {
  const s = await newSession(env, { vp: viewports.get('ip12'), lang: 'en' });
  try {
    await s.goto(p.path);
    t.eq('html-lang-en', await s.page.evaluate(() => document.documentElement.lang), 'en');
    const jp = await s.page.evaluate(`(${jpScan})(false)`);
    // 隠れている要素の文字は、表示するときに JS が t() で書き直すことが多いので「注意」にとどめる（見えている文字は viewport スイートで不合格にする）
    t.check('en-no-japanese-dom', jp.length === 0, `${jp.length} strings: ` + jp.slice(0, 10).join(' | '), { severity: 'warn' });
  } finally { await s.close(); }
}
module.exports = { name: 'i18n', describe: '英語で、ページの中（隠れた部分と属性も）に日本語が残っていない', plan };
