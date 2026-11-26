// ぴょんぴょん冒険: the daily challenge level. A level for a date is glued from chunks that the solver has proven passable on their own
// (hop/genproofs.js, replayed by tools/tests/unit/hop-gen.test.js), with 5 medals put on safe spots, then checked by the static validator.
//   HopGen.make(dateKey) -> a level definition (same shape as HopLevels.get) ; the same date always gives the same level on every device.
(function (root) {
  'use strict';
  const LV = root.HopLevels || require('./levels.js');
  const POOLS = {
    meadow: ['hill1', 'bugs', 'gap3', 'bugs2', 'frogs', 'springA', 'canyon', 'pits2', 'bats', 'balloons', 'crumbles', 'bridgeH'],
    factory: ['conv1', 'conv2', 'windups', 'spikes', 'spikeRow', 'pend1', 'cannons', 'rollers', 'pins', 'drips', 'birds', 'umbrellas'],
    bath: ['pool1', 'iceRun', 'iceGap', 'iceSpikes', 'iceSpring', 'bridgeH', 'bats', 'balloons'],
    snow: ['snowHill', 'pins', 'birds', 'drips', 'cannons', 'rollers', 'iceRun', 'canyon'],
    night: ['lampHall', 'clockTower', 'drips', 'pendRow', 'rollers', 'windups', 'gap3'],
    atelier: ['springA', 'umbrellas', 'conv1', 'crumbles', 'pend1', 'cannons', 'rollers', 'drips', 'birds'],
  };
  const THEMES = ['meadow', 'factory', 'bath', 'snow', 'night', 'atelier'];
  const NAMES = { meadow: ['のはらの日', 'Meadow Day'], factory: ['こうじょうの日', 'Factory Day'], bath: ['おふろの日', 'Bath Day'], snow: ['ゆきの日', 'Snow Day'], night: ['よるの日', 'Night Day'], atelier: ['アトリエの日', 'Atelier Day'] };
  function rng(seed) { let a = seed >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const pool = () => Object.keys(POOLS).reduce((a, k) => a.concat(POOLS[k]), []).filter((x, i, a) => a.indexOf(x) === i);
  function make(dateKey, salt) {
    const dk = Number(dateKey) || 20260101, r = rng((Math.imul(dk ^ 0x9e3779b9, 2246822519) >>> 0) + (salt | 0) * 977);
    for (let k = 0; k < 12; k++) r();
    const theme = THEMES[Math.floor(r() * THEMES.length)];
    const names = POOLS[theme].filter(n => LV.CHUNKS[n]);
    const parts = ['start2']; let last = '';
    const n = 7 + Math.floor(r() * 3);
    for (let i = 0; i < n; i++) {
      let c; for (let t = 0; t < 8; t++) { c = names[Math.floor(r() * names.length)]; if (c !== last) break; }
      parts.push(c); last = c; if (i === 2) parts.push('cp2');
    }
    parts.push('plain', 'goal');
    const def = { id: 'D' + dk, world: 0, name: { ja: 'きょうのステージ ' + NAMES[theme][0], en: "Today's Level - " + NAMES[theme][1] }, theme, parts, gimmick: { ja: 'きょうだけのステージ', en: 'One level, one day' }, par: 0, daily: dk };
    if (theme === 'night') def.dark = true;
    const lv = LV.assemble(def);
    // medals: five spots on solid floor with clear air above, two or more columns from any creature, spread along the level
    const E = root.HopEngine || require('./engine.js');
    const L = E.parse(lv), spots = [];
    for (let x = 20; x < L.W - 18; x++) {
      if (E.SOLID[L.t[10 * L.W + x]] !== 1 || E.SOLID[L.t[10 * L.W + x + 1]] !== 1 || E.SOLID[L.t[10 * L.W + x - 1]] !== 1) continue;
      let clear = true; for (let y = 3; y < 10 && clear; y++) if (L.t[y * L.W + x]) clear = false;
      if (clear && L.ents.every(e => Math.abs(e.x - x) > 2)) spots.push(x);
    }
    const seg = Math.floor(spots.length / 5), rows = lv.rows.map(s => s.split(''));
    const put = [];
    for (let i = 0; i < 5; i++) { const x = spots[Math.min(spots.length - 1, i * seg + Math.floor(r() * Math.max(1, seg)))]; rows[7][x] = 'm'; put.push(x); }
    lv.rows = rows.map(a => a.join(''));
    return lv;
  }
  const API = { POOLS, THEMES, make, pool };
  if (typeof module === 'object' && module && module.exports) module.exports = API;
  root.HopGen = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
