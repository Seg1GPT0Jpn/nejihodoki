// 保存の回帰テスト（TEST_PLAN.md 7章、オフライン）：
//   fixtures/saves/*.json の保存を入れて開く → エラーなく読め、ベストや到達ステージが下がらない → 再読み込みしても同じ
'use strict';
const { pages } = require('../lib/pages');
const viewports = require('../lib/viewports');
const { newSession } = require('../lib/browser');
const storage = require('../lib/storage');

function plan(opts) {
  const all = pages();
  const allowed = new Set(opts.pages(all).map(p => p.id));
  return storage.fixtures('saves').filter(f => allowed.has(f.page)).map(f => ({
    page: f.page, vp: 'ip12', lang: 'ja', label: f.name, run: (env, t) => one(env, t, f, all.find(p => p.id === f.page)),
  }));
}

const dig = (o, p) => (p ? String(p).split('.') : []).reduce((a, k) => (a == null ? a : a[k]), o);

async function verify(t, s, f, phase) {
  for (const e of f.expect || []) {
    const name = `${f.name}:${phase}:` + (e.key ? e.key + (e.path ? '.' + e.path : '') : 'text ' + e.text);
    const o = { known: e.known || f.known || '' };
    if (e.key) {
      const v = dig(await storage.getJSON(s.page, e.key), e.path);
      if ('eq' in e) t.check(name, JSON.stringify(v) === JSON.stringify(e.eq), `expected ${JSON.stringify(e.eq)}, got ${JSON.stringify(v)}`, o);
      if ('min' in e) t.check(name, Number(v) >= e.min, `expected >= ${e.min}, got ${JSON.stringify(v)}`, o);
    } else if (e.text) {
      // 表示は読み込みの少しあとに書かれることがあるので、合うまで（最大3秒）待つ
      const ok = await s.page.waitForFunction(([sel, eq, re]) => {
        const el = document.querySelector(sel); if (!el) return false;
        const tx = el.textContent.trim();
        return eq != null ? tx === eq : new RegExp(re).test(tx);
      }, [e.text, e.eq != null ? String(e.eq) : null, e.match || null], { timeout: 3000 }).then(() => true, () => false);
      const got = await s.page.evaluate(sel => { const el = document.querySelector(sel); return el ? el.textContent.trim() : null; }, e.text);
      t.check(name, ok, `${e.text} shows ${JSON.stringify(got)}, expected ${e.eq != null ? JSON.stringify(e.eq) : '/' + e.match + '/'}`, o);
    }
  }
}

async function one(env, t, f, p) {
  const s = await newSession(env, { vp: viewports.get('ip12'), lang: 'ja', seed: f.storage });
  try {
    await s.goto(p.path);
    t.check(`${f.name}:load:no-errors`, !s.log.pageErrors.length && !s.log.consoleErrors.length, [...s.log.pageErrors, ...s.log.consoleErrors].slice(0, 4));
    await verify(t, s, f, 'load');
    await s.reload();
    await verify(t, s, f, 'reload');
    t.check(`${f.name}:reload:no-errors`, !s.log.pageErrors.length, s.log.pageErrors.slice(0, 4));
  } finally { await s.close(); }
}

module.exports = { name: 'save', describe: '保存 → 読み込み → 再読み込み。古い形の保存（fixtures/saves）', plan };
