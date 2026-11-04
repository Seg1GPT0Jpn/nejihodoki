// P1-2 の単体テストの共通部品：小さなテストの実行役、偽の localStorage、common/*.js を新しく読み込み直す補助。
// ブラウザは使わない（node だけ）。npm のパッケージは使わない。
'use strict';
const path = require('path');
const fs = require('fs');

const ROOT = path.resolve(__dirname, '..', '..', '..');
const COMMON = path.join(ROOT, 'common');

class FakeStorage {
  constructor(init) { this._m = new Map(); this.throwOnSet = false; this.writes = 0; if (init) for (const [k, v] of Object.entries(init)) this._m.set(k, typeof v === 'string' ? v : JSON.stringify(v)); }
  get length() { return this._m.size; }
  key(i) { return [...this._m.keys()][i] ?? null; }
  getItem(k) { return this._m.has(String(k)) ? this._m.get(String(k)) : null; }
  setItem(k, v) { if (this.throwOnSet) { const e = new Error('QuotaExceededError'); e.name = 'QuotaExceededError'; throw e; } this.writes++; this._m.set(String(k), String(v)); }
  removeItem(k) { this._m.delete(String(k)); }
  clear() { this._m.clear(); }
  dump() { return Object.fromEntries(this._m); }
}

// 小さなイベントの的（document と window の代わり）
class FakeTarget {
  constructor() { this._l = {}; }
  addEventListener(t, f) { (this._l[t] = this._l[t] || []).push(f); }
  removeEventListener(t, f) { const a = this._l[t] || []; const i = a.indexOf(f); if (i >= 0) a.splice(i, 1); }
  dispatch(t, ev) { const e = Object.assign({ type: t, defaultPrevented: false, preventDefault() { this.defaultPrevented = true; } }, ev || {}); (this._l[t] || []).slice().forEach(f => f(e)); return e; }
  count(t) { return (this._l[t] || []).length; }
}

const GLOBALS = ['KOBO_GAMES', 'KOBO_GENRES', 'KOBO_SHARED_SYNC', 'KOBO_REGISTRY', 'KoboPlatform', 'KoboGame', 'localStorage', 'document', 'location', '__kb', 'matchMedia', 'addEventListener', 'removeEventListener', 'KoboI18n'];
// 新しい環境で common のファイルを読み込む。opts.storage: FakeStorage | 'throw' | null、opts.files: ['games', 'platform', 'game']
function fresh(opts) {
  opts = opts || {};
  for (const g of GLOBALS) { try { delete globalThis[g]; } catch (e) { globalThis[g] = undefined; } }
  for (const f of ['games', 'platform', 'game']) delete require.cache[path.join(COMMON, f + '.js')];
  if (opts.storage === 'throw') Object.defineProperty(globalThis, 'localStorage', { configurable: true, get() { throw new Error('SecurityError'); } });
  else if (opts.storage !== null) globalThis.localStorage = opts.storage || new FakeStorage();
  if (opts.location) globalThis.location = opts.location;
  if (opts.window) {
    const w = opts.window;
    globalThis.addEventListener = w.addEventListener.bind(w);
    globalThis.removeEventListener = w.removeEventListener.bind(w);
  }
  if (opts.document) globalThis.document = opts.document;
  const out = {};
  for (const f of opts.files || ['games', 'platform']) out[f] = require(path.join(COMMON, f + '.js'));
  return out;
}

// ---- tiny runner
const results = { pass: 0, fail: 0, failures: [] };
const queue = [];
function test(name, fn) { queue.push({ name, fn }); }
function eq(a, b, msg) { if (!Object.is(a, b)) throw new Error((msg ? msg + ': ' : '') + 'expected ' + JSON.stringify(b) + ', got ' + JSON.stringify(a)); }
function ok(v, msg) { if (!v) throw new Error(msg || 'expected truthy'); }
function deep(a, b, msg) {
  const s = x => JSON.stringify(sortKeys(x));
  if (s(a) !== s(b)) throw new Error((msg ? msg + ': ' : '') + 'expected ' + s(b) + '\n           got ' + s(a));
}
function sortKeys(x) {
  if (Array.isArray(x)) return x.map(sortKeys);
  if (x && typeof x === 'object') { const o = {}; for (const k of Object.keys(x).sort()) o[k] = sortKeys(x[k]); return o; }
  return x;
}
function throws(fn, msg) { let t = false; try { fn(); } catch (e) { t = true; } if (!t) throw new Error(msg || 'expected throw'); }
async function run(label) {
  const realNow = Date.now;
  for (const t of queue) {
    try { await t.fn(); results.pass++; }
    catch (e) { results.fail++; results.failures.push(t.name + '\n    ' + (e && e.stack || e).toString().split('\n').slice(0, 3).join('\n    ')); }
    finally { Date.now = realNow; }
  }
  const tz = process.env.TZ || Intl.DateTimeFormat().resolvedOptions().timeZone;
  for (const f of results.failures) console.log('  FAIL ' + f);
  console.log(`${label} [TZ=${tz}]: ${results.pass} passed, ${results.fail} failed`);
  process.exitCode = results.fail ? 1 : 0;
  return results;
}
function readText(rel) { return fs.readFileSync(path.join(ROOT, rel), 'utf8'); }
function fixture(rel) { return JSON.parse(readText(path.join('tools/tests/fixtures', rel))); }
function fixedNow(ms) { Date.now = () => ms; }

module.exports = { ROOT, COMMON, FakeStorage, FakeTarget, fresh, test, eq, ok, deep, throws, run, readText, fixture, fixedNow };
