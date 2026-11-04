// localStorage を入れる・読む・空にする。fixtures の読み込み
'use strict';
const fs = require('fs');
const path = require('path');

const FIX = path.join(__dirname, '..', 'fixtures');

// 値は文字列ならそのまま、ほかは JSON にする（ゲームは JSON.parse で読むので、数値も "123" になる）
function toStrings(obj) {
  const out = {};
  for (const [k, v] of Object.entries(obj || {})) out[k] = typeof v === 'string' ? v : JSON.stringify(v);
  return out;
}

// context の最初の読み込みのときだけ、localStorage を空にして seed を入れる（再読み込みでは入れ直さない）
function seedScript(seed) {
  const data = JSON.stringify(toStrings(seed));
  return `(() => { try {
    if (location.protocol === 'about:' || sessionStorage.getItem('__kbt.seeded')) return;
    localStorage.clear();
    const d = ${data};
    for (const k in d) localStorage.setItem(k, d[k]);
    sessionStorage.setItem('__kbt.seeded', '1');
  } catch (e) {} })();`;
}

const dump = page => page.evaluate(() => { const o = {}; for (let i = 0; i < localStorage.length; i++) { const k = localStorage.key(i); o[k] = localStorage.getItem(k); } return o; });
const get = (page, k) => page.evaluate(k => localStorage.getItem(k), k);
const getJSON = async (page, k) => { const v = await get(page, k); try { return v == null ? null : JSON.parse(v); } catch (e) { return v; } };
const clear = page => page.evaluate(() => localStorage.clear());
const set = (page, obj) => page.evaluate(d => { for (const k in d) localStorage.setItem(k, d[k]); }, toStrings(obj));

function fixtures(dir) {
  const d = path.join(FIX, dir);
  if (!fs.existsSync(d)) return [];
  return fs.readdirSync(d).filter(f => f.endsWith('.json')).sort().map(f => Object.assign({ file: path.join(dir, f), name: f.replace(/\.json$/, '') }, JSON.parse(fs.readFileSync(path.join(d, f), 'utf8'))));
}

module.exports = { seedScript, toStrings, dump, get, getJSON, clear, set, fixtures, FIX };
