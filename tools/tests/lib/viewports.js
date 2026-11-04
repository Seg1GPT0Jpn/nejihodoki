// 画面サイズの一覧（TEST_PLAN.md 4章）と、ノッチ（safe-area）の値
'use strict';
const VIEWPORTS = {
  se1:   { width: 320, height: 568, dpr: 2, safe: { top: 20, bottom: 0, left: 0, right: 0 }, note: 'いちばん小さい' },
  a360s: { width: 360, height: 560, dpr: 3, safe: { top: 24, bottom: 0, left: 0, right: 0 }, note: 'Android（ツールバーで低い）' },
  a360:  { width: 360, height: 640, dpr: 3, safe: { top: 24, bottom: 0, left: 0, right: 0 }, note: 'Android' },
  se2:   { width: 375, height: 667, dpr: 2, safe: { top: 20, bottom: 0, left: 0, right: 0 } },
  ip12:  { width: 390, height: 844, dpr: 3, safe: { top: 47, bottom: 34, left: 0, right: 0 }, note: 'ノッチ' },
  p8:    { width: 414, height: 736, dpr: 3, safe: { top: 20, bottom: 0, left: 0, right: 0 } },
  xr:    { width: 414, height: 896, dpr: 2, safe: { top: 48, bottom: 34, left: 0, right: 0 }, note: 'ノッチ' },
  land:  { width: 667, height: 375, dpr: 2, safe: { top: 0, bottom: 21, left: 44, right: 44 }, note: '横向き' },
  inapp: { width: 390, height: 700, dpr: 3, safe: { top: 47, bottom: 34, left: 0, right: 0 }, note: 'アプリ内ブラウザ' },
};
const SETS = {
  quick: ['se1', 'ip12', 'p8'],
  core: ['se1', 'a360s', 'se2', 'ip12', 'p8'],
  all: Object.keys(VIEWPORTS),
};
// "--vp quick" / "--vp all" / "--vp se1,land" / "--vp 320x568"
function pick(spec) {
  const out = [];
  for (const s of String(spec || 'core').split(',').map(x => x.trim()).filter(Boolean)) {
    if (SETS[s]) out.push(...SETS[s]);
    else if (VIEWPORTS[s]) out.push(s);
    else {
      const m = /^(\d+)x(\d+)$/.exec(s);
      if (!m) throw new Error('unknown viewport: ' + s);
      const name = s;
      VIEWPORTS[name] = VIEWPORTS[name] || { width: +m[1], height: +m[2], dpr: 2, safe: { top: 0, bottom: 0, left: 0, right: 0 } };
      out.push(name);
    }
  }
  return [...new Set(out)].map(name => Object.assign({ name }, VIEWPORTS[name]));
}
module.exports = { VIEWPORTS, SETS, pick, get: n => Object.assign({ name: n }, VIEWPORTS[n]) };
