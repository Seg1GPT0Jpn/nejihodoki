#!/usr/bin/env node
// テストの実行役。使い方は README.md を見てください。
//   node tools/tests/run.js                      … 全部（live を除く）
//   node tools/tests/run.js --game blocks        … 1つのページだけ（hub, ranking, 各ゲームの id。カンマで複数）
//   node tools/tests/run.js --suite smoke,save   … スイートを選ぶ
//   node tools/tests/run.js --vp quick --lang en … 画面サイズ（quick|core|all|se1,ip12|320x568）と言語
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const server = require('./lib/server');
const browserLib = require('./lib/browser');
const viewports = require('./lib/viewports');
const pagesLib = require('./lib/pages');
const { Recorder, table, summarize, writeReports, where } = require('./lib/assert');

const SUITES = ['smoke', 'viewport', 'i18n', 'save', 'sync'].map(n => require('./suites/' + n));
const DEFAULT_SUITES = ['smoke', 'viewport', 'i18n', 'save', 'sync'];
// TEST_PLAN.md にあるが、まだ書いていないもの（必要なものができてから足す）
const PLANNED = {
  'game-flow': 'needs window.__kb hooks (Phase 2)', pause: 'needs window.__kb hooks (Phase 2)', perf: 'not written yet',
  'webgl-lost': 'needs KoboGame context-lost handling (Phase 2)', sw: 'needs https origin + service worker (P1-7)',
  'sync-merge': 'merge functions arrive with P1-5; R2/R3/R4 regressions are in the "sync" suite', platform: 'needs common/platform.js (P1-2)',
  live: 'use --live (not written yet)',
};

function parseArgs(argv) {
  const o = { suite: null, game: null, vp: 'core', lang: 'ja,en', jobs: Math.max(1, Math.min(4, os.cpus().length)), dpr: null, out: path.join(__dirname, 'out'), headed: false, list: false, live: false, timeout: 90 };
  for (let i = 0; i < argv.length; i++) {
    const a = argv[i]; const nx = () => { const v = argv[++i]; if (v == null) throw new Error(a + ' needs a value'); return v; };
    if (a === '--suite' || a === '-s') o.suite = nx();
    else if (a === '--game' || a === '--page' || a === '-g') o.game = nx();
    else if (a === '--vp') o.vp = nx();
    else if (a === '--lang') o.lang = nx();
    else if (a === '--jobs' || a === '-j') o.jobs = Math.max(1, parseInt(nx(), 10) || 1);
    else if (a === '--dpr') o.dpr = parseFloat(nx()) || null;
    else if (a === '--out') o.out = path.resolve(nx());
    else if (a === '--timeout') o.timeout = parseInt(nx(), 10) || 90;
    else if (a === '--headed') o.headed = true;
    else if (a === '--list') o.list = true;
    else if (a === '--live') o.live = true;
    else if (a === '--update-shots') o.updateShots = true;
    else if (a === '--help' || a === '-h') o.help = true;
    else if (/^--\w/.test(a) && a.includes('=')) { const [k, v] = a.split('='); argv.splice(i + 1, 0, v); argv[i] = k; i--; }
    else throw new Error('unknown argument: ' + a);
  }
  return o;
}

function findSuite(name) { return SUITES.find(s => s.name === name || (s.aliases || []).includes(name)); }

async function pool(items, n, fn) {
  let i = 0;
  await Promise.all(Array.from({ length: Math.min(n, items.length) }, async () => { while (i < items.length) { const k = i++; await fn(items[k], k); } }));
}
const withTimeout = (p, ms, what) => Promise.race([p, new Promise((_, rej) => setTimeout(() => rej(new Error(`timed out after ${ms / 1000}s: ${what}`)), ms).unref())]);

async function main() {
  const o = parseArgs(process.argv.slice(2));
  if (o.help) { console.log(fs.readFileSync(__filename, 'utf8').split('\n').slice(1, 7).map(l => l.replace(/^\/\/ ?/, '')).join('\n')); return 0; }
  const wanted = (o.suite ? o.suite.split(',') : DEFAULT_SUITES).map(s => s.trim()).filter(Boolean);
  if (o.live && !wanted.includes('live')) wanted.push('live');
  const langs = o.lang.split(',').map(s => s.trim()).filter(Boolean);
  const vpList = viewports.pick(o.vp);
  const opts = {
    langs, dpr: o.dpr,
    viewports: () => vpList,
    pages: list => pagesLib.filter(list, o.game),
  };
  pagesLib.filter(pagesLib.pages(), o.game); // 名前の間違いを先に知らせる

  const rec = new Recorder();
  const tasks = [];
  for (const name of wanted) {
    const s = findSuite(name);
    if (!s) {
      if (PLANNED[name]) { console.log(`- suite "${name}": not implemented yet (${PLANNED[name]})`); rec.scope({ suite: name, page: '-', vp: '', lang: '' }).skip('not-implemented', PLANNED[name]); continue; }
      throw new Error('unknown suite: ' + name + ' (known: ' + SUITES.map(x => x.name).join(', ') + ')');
    }
    for (const t of s.plan(opts)) tasks.push(Object.assign({ suite: s.name }, t));
  }
  if (o.list) { for (const t of tasks) console.log([t.suite, t.page, t.vp, t.lang, t.label || ''].join('\t')); console.log(tasks.length + ' tasks'); return 0; }

  browserLib.ensureCdn();
  fs.rmSync(path.join(o.out, 'shots', 'viewport'), { recursive: true, force: true });
  fs.mkdirSync(o.out, { recursive: true });
  const srv = await server.start();
  const browsers = {};
  const env = {
    server: srv, out: o.out, opts: o,
    browser(noGl) { const k = noGl ? 'nogl' : 'gl'; return browsers[k]; },
  };
  browsers.gl = await browserLib.launch({ headed: o.headed });
  if (tasks.some(t => t.label === 'no-webgl')) browsers.nogl = await browserLib.launch({ headed: o.headed, noGl: true });

  const t0 = Date.now();
  console.log(`running ${tasks.length} tasks (${wanted.join(', ')}) with ${o.jobs} workers, viewports: ${vpList.map(v => v.name).join(',')}, langs: ${langs.join(',')}, server ${srv.url}`);
  let done = 0;
  // 重い 3D のページが同時に集まらないよう、ページの順を混ぜる
  const order = tasks.map((t, i) => [t, i]).sort((a, b) => (a[1] % 7) - (b[1] % 7) || a[1] - b[1]).map(x => x[0]);
  await pool(order, o.jobs, async task => {
    const scope = rec.scope({ suite: task.suite, page: task.page, vp: task.vp || '', lang: task.lang || '' });
    const ts = Date.now();
    try { await withTimeout(task.run(env, scope), o.timeout * 1000, `${task.suite} ${task.page} ${task.vp} ${task.lang} ${task.label || ''}`); }
    catch (e) { scope.check((task.label ? task.label + ':' : '') + 'task-error', false, String(e && e.message || e).split('\n')[0].slice(0, 300)); }
    const mine = scope.mine;
    const f = mine.filter(r => r.status === 'fail').length;
    done++;
    console.log(`[${String(done).padStart(3)}/${tasks.length}] ${f ? 'FAIL' : 'ok  '} ${task.suite.padEnd(8)} ${where(task).padEnd(22)} ${(task.label || '').padEnd(22)} ${((Date.now() - ts) / 1000).toFixed(1)}s${f ? '  ' + mine.filter(r => r.status === 'fail').map(r => r.check).join(', ') : ''}`);
  });

  for (const b of Object.values(browsers)) await b.close().catch(() => {});
  await srv.close();
  const seconds = Math.round((Date.now() - t0) / 1000);
  const counts = rec.counts();
  const meta = { started: new Date(t0).toISOString(), seconds, argv: 'node tools/tests/run.js ' + process.argv.slice(2).join(' '), counts, shots: path.relative(process.cwd(), path.join(o.out, 'shots')) || '.' };
  writeReports(o.out, rec.results, meta);

  console.log('\n' + table(summarize(rec.results).map(s => [s.suite, s.page, s.pass, s.fail, s.warn, s.skip]), ['suite', 'page', 'pass', 'fail', 'warn', 'skip']));
  const fails = rec.results.filter(r => r.status === 'fail');
  if (fails.length) {
    console.log('\nFAILURES');
    for (const r of fails) console.log(`- ${r.suite} ${where(r)}  ${r.check}${r.known ? ' [known ' + r.known + ']' : ''}: ${String(r.detail).slice(0, 240)}`);
  }
  console.log(`\npass ${counts.pass}  fail ${counts.fail}  warn ${counts.warn}  skip ${counts.skip}  (${seconds}s)  report: ${path.join(o.out, 'report.md')}`);
  return counts.fail ? 1 : 0;
}

main().then(code => process.exit(code), e => { console.error(e && e.stack || e); process.exit(2); });
