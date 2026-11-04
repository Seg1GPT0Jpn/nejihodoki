// ?debug のフック（window.__kb、__neji、__hole）を呼ぶ補助。Phase 2 で各ゲームに __kb が入るまでは、ある時だけ使う。
'use strict';
const HOOKS = ['__kb', '__neji', '__hole'];
const available = page => page.evaluate(names => names.filter(n => window[n] != null), HOOKS);
async function call(page, hook, fn, ...args) {
  return page.evaluate(([h, f, a]) => {
    const o = window[h]; if (!o || typeof o[f] !== 'function') throw new Error(h + '.' + f + ' is not available');
    return o[f](...a);
  }, [hook, fn, args]);
}
// __kb.ready() があれば、それが true になるまで待つ（なければすぐ返す）
async function waitReady(page, timeout = 5000) {
  const has = await page.evaluate(() => !!(window.__kb && typeof window.__kb.ready === 'function'));
  if (!has) return false;
  await page.waitForFunction(() => !!window.__kb.ready(), null, { timeout });
  return true;
}
module.exports = { HOOKS, available, call, waitReady };
