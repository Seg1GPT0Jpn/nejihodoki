// ひまつぶしタウン (Idle Town) — pure logic, runs in the browser and in node (tools/tests/unit/town-engine.test.js, town-balance.js).
// A small grid town that earns while you are away. Nothing here touches the DOM, Date, Math.random or Math.sin:
// time comes in as a number (`now`, ms since epoch) and the random numbers come from a seeded counter kept in the state,
// so the same actions at the same times always give the same town.
//
// Clock rules (there are no Cloud Functions, so the clock can not be trusted; the damage is limited, not removed):
//   - gains only ever come from time after state.t (the latest time seen). A clock set back gives nothing and the town waits
//     (state.t is never lowered, so going back and forth does not pay twice).
//   - one away period pays at most the offline cap (8 h, up to 12 h with research). The rest of the gap is dropped.
//   - a gap of more than 60 days is treated as a broken clock and pays nothing.
(function (root) {
  'use strict';

  // ---------------------------------------------------------------- numbers you can tune
  const GRID = 10;                 // the biggest map is 10 x 10; the town starts as 5 x 5 in the middle
  const START_LAND = 5;
  const PLAZA = { x: 4, y: 4 };
  const WATER = [[3, 6], [4, 6], [5, 6]];   // a little pond at the bottom of the first land (the harbor needs the shore)
  const ACTIVE_MAX = 20;           // seconds: a longer gap is "away" (no visitors, no events)
  const OFFLINE_BASE_H = 8;
  const MAX_JUMP_MS = 60 * 86400000;
  const MIN_CLOCK = 1577836800000; // 2020-01-01: an earlier clock is a broken clock
  const FOOD_USE = 0.02;           // food per resident per second
  const LV_MUL = 1.65;             // output of a level-n building = base x LV_MUL^(n-1)
  const K = { up: 3, gAdd: 0, land: 4 };   // price growth: per level of a building / extra per building of one kind / per land ring
  const RENOWN_MUL = 0.25;         // every renown adds this to the permanent multiplier
  const PRESTIGE_NEED = [80, 220, 420, 600];       // population needed to open the town again (tier 0, 1, 2); later +100 each
  const START_RES = { coin: 40, wood: 0, food: 20, spark: 0 };
  const TAP_SECONDS = 15;          // a visitor pays this many seconds of the coin income (at least 15 coins)

  // ---------------------------------------------------------------- buildings
  // c / w: price in coins / wood for the first one, times g for every one already built.  out: per second at level 1.
  const BUILDINGS = {
    plaza:    { fixed: true, coin: 0.36, name: { ja: 'まちの広場', en: 'Town Square' } },
    house:    { c: 20, w: 0, g: 1.31, cap: 3, tax: 0.0105, name: { ja: 'すまい', en: 'Cottage' }, tip: { ja: '住む人をふやす。人は税（コイン）をおさめる', en: 'Houses residents. They pay tax in coins' } },
    lumber:   { c: 30, w: 0, g: 1.35, wood: 0.25, name: { ja: 'きこり小屋', en: 'Woodcutter' }, tip: { ja: '木材をつくる', en: 'Makes wood' } },
    farm:     { c: 35, w: 0, g: 1.35, food: 0.7, name: { ja: 'はたけ', en: 'Farm' }, tip: { ja: '食べものをつくる。風車小屋のとなりで多くとれる', en: 'Makes food. Better next to a mill' } },
    park:     { c: 120, w: 30, g: 1.4, need: { peak: 10 }, name: { ja: 'こうえん', en: 'Park' }, tip: { ja: 'となりのすまいに住む人がふえて税も多くなる。旅人もよく来る', en: 'Neighbouring cottages fit more people and pay more tax. Visitors come more often' } },
    mill:     { c: 200, w: 50, g: 1.4, coin: 0.18, need: { peak: 14 }, name: { ja: '風車小屋', en: 'Windmill' }, tip: { ja: 'コインをつくる。はたけのとなりでおたがいに多くなる', en: 'Makes coins. Farms next to it grow better, and it earns more next to farms' } },
    workshop: { c: 400, w: 100, g: 1.45, coin: 0.43, need: { peak: 24 }, name: { ja: 'こうぼう', en: 'Workshop' }, tip: { ja: 'コインをつくる。きこり小屋のとなりで多くなる', en: 'Makes coins. Better next to woodcutters' } },
    market:   { c: 900, w: 200, g: 1.47, coin: 0.86, need: { peak: 36 }, name: { ja: 'いちば', en: 'Market' }, tip: { ja: 'コインをたくさん。すまい・風車小屋・こうぼうのとなりで多くなる', en: 'Makes lots of coins. Better next to cottages, windmills and workshops' } },
    harbor:   { c: 900, w: 250, g: 1.45, coin: 2.3, spark: 0.001, need: { tier: 1 }, shore: true, name: { ja: 'みなと', en: 'Harbor' }, tip: { ja: '池のほとりにだけ建つ。コインと、ときどき ひらめき', en: 'Only on the shore of the pond. Coins, and a little spark' } },
    library:  { c: 700, w: 200, g: 1.45, spark: 0.003, need: { tier: 1 }, name: { ja: 'としょかん', en: 'Library' }, tip: { ja: 'ひらめき（研究に使う）をつくる。すまい・こうえんのとなりで多くなる', en: 'Makes spark (for research). Better next to cottages and parks' } },
    tower:    { c: 2500, w: 700, g: 1.55, need: { tier: 2 }, name: { ja: '見はり塔', en: 'Lookout Tower' }, tip: { ja: 'まわり8マスの建物が、1つにつき +30%', en: 'Every building in the 8 tiles around it makes +30%' } },
    well:     { c: 6000, w: 1500, g: 1.65, spark: 0.006, need: { tier: 3 }, name: { ja: 'ねがいの井戸', en: 'Wishing Well' }, tip: { ja: 'ひらめきをたくさん。としょかんのとなりで多くなる', en: 'Lots of spark. Better next to a library' } },
  };
  const TYPES = ['house', 'lumber', 'farm', 'park', 'mill', 'workshop', 'market', 'harbor', 'library', 'tower', 'well'];
  // what a building likes next to it (the 4 sides): [neighbour, bonus]
  const ADJ = {
    farm: [['mill', 0.5]],
    mill: [['farm', 0.35]],
    workshop: [['lumber', 0.4]],
    market: [['house', 0.2], ['mill', 0.3], ['workshop', 0.2]],
    house: [['park', 0.35], ['market', 0.15]],
    harbor: [['market', 0.5], ['workshop', 0.3]],
    library: [['house', 0.25], ['park', 0.4]],
    well: [['library', 0.5]],
  };
  const PARK_CAP = 2;              // a park next to a cottage: room for this many more people
  const TOWER_BONUS = 0.3;

  // ---------------------------------------------------------------- research (bought with spark, kept after the town is opened again)
  const RESEARCH = [
    { id: 'rest', max: 4, cost: [2, 3, 5, 8], name: { ja: 'ふかふかの寝どこ', en: 'Cozy Beds' }, desc: { ja: 'るすの間にかせぐ時間の上限が +1時間', en: 'The most away-time that pays: +1 hour' } },
    { id: 'wealth', max: 5, cost: [3, 5, 8, 12, 18], name: { ja: 'おおきな財布', en: 'Bigger Purses' }, desc: { ja: 'コインのもうけが +10%', en: 'Coin income +10%' } },
    { id: 'grain', max: 4, cost: [3, 4, 6, 9], name: { ja: 'こえた土', en: 'Rich Soil' }, desc: { ja: '食べものが +20%', en: 'Food +20%' } },
    { id: 'saw', max: 3, cost: [2, 4, 7], name: { ja: 'よく切れるのこぎり', en: 'Sharp Saws' }, desc: { ja: '木材が +25%', en: 'Wood +25%' } },
    { id: 'tools', max: 4, cost: [3, 5, 8, 12], name: { ja: 'じょうぶな道具', en: 'Sturdy Tools' }, desc: { ja: '建てる・育てるねだんが −6%', en: 'Building and upgrade prices −6%' } },
    { id: 'glue', max: 3, cost: [4, 7, 11], name: { ja: 'となり近所づきあい', en: 'Good Neighbours' }, desc: { ja: 'となり合わせのボーナスが +20%', en: 'Neighbour bonuses +20%' } },
    { id: 'crowd', max: 3, cost: [2, 4, 7], name: { ja: 'にぎやか通り', en: 'Busy Street' }, desc: { ja: '旅人がよく来る（間が −15%）', en: 'Visitors come more often (−15% wait)' } },
    { id: 'purse', max: 3, cost: [2, 4, 7], name: { ja: 'おみやげ上手', en: 'Souvenirs' }, desc: { ja: '旅人のおみやげが +50%', en: 'Visitor gifts +50%' } },
  ];
  const RESEARCH_BY_ID = {}; RESEARCH.forEach(r => { RESEARCH_BY_ID[r.id] = r; });

  // ---------------------------------------------------------------- random (a counter kept in the state)
  function rand(S) {
    S.rn = (S.rn + 0x6D2B79F5) >>> 0;
    let t = S.rn; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  function hash2(x, y, k) {
    let h = (Math.imul(x + 17, 374761393) ^ Math.imul(y + 31, 668265263) ^ Math.imul(k + 7, 2147483647)) >>> 0;
    h = Math.imul(h ^ (h >>> 13), 1274126177) >>> 0;
    return ((h ^ (h >>> 16)) >>> 0) / 4294967296;
  }

  // ---------------------------------------------------------------- map
  const IDX = (x, y) => y * GRID + x;
  const inGrid = (x, y) => x >= 0 && y >= 0 && x < GRID && y < GRID;
  const lo = s => Math.floor((GRID - s) / 2);
  const owned = (S, x, y) => { const a = lo(S.land); return x >= a && y >= a && x < a + S.land && y < a + S.land; };
  const isWater = (x, y) => WATER.some(w => w[0] === x && w[1] === y);
  const N4 = [[0, -1], [1, 0], [0, 1], [-1, 0]];
  const N8 = N4.concat([[1, -1], [1, 1], [-1, 1], [-1, -1]]);
  const isShore = (x, y) => !isWater(x, y) && N4.some(d => isWater(x + d[0], y + d[1]));
  // trees / flowers / rocks for the tiles that are not built on (looks only)
  function decor(x, y) { const h = hash2(x, y, 3); return h < 0.2 ? 1 : h < 0.34 ? 2 : h < 0.4 ? 3 : 0; }
  const maxLand = S => Math.min(GRID, 7 + S.tier);
  const landCost = s => ({ c: Math.round(150 * Math.pow(K.land, s - START_LAND)), w: s > START_LAND ? Math.round(20 * Math.pow(3, s - START_LAND - 1)) : 0 });
  const maxLv = S => 5 + Math.min(S.tier, 7);
  const offlineCapH = S => OFFLINE_BASE_H + rl(S, 'rest');
  function rl(S, id) { return Math.max(0, Math.min(RESEARCH_BY_ID[id].max, (S.rs && S.rs[id]) | 0)); }
  const dayNum = ms => Math.floor((ms + 9 * 3600000) / 86400000);   // Japan time

  // ---------------------------------------------------------------- quests (done once, kept forever; one current goal at a time)
  // kind: build (n buildings of a type) / pop / lv (a building of this level) / land / taps (visitors tapped, all time) / pair (a: next to b) / types (kinds of building) / prestige / rate (coins per second)
  const Q = (id, tier, kind, p, reward, big) => Object.assign({ id, tier, kind, reward: reward || {}, big: !!big }, p);
  const QUESTS = [
    Q('h1', 0, 'build', { type: 'house', n: 1 }, { coin: 25 }),
    Q('f1', 0, 'build', { type: 'farm', n: 1 }, { coin: 30 }),
    Q('p3', 0, 'pop', { n: 3 }, { coin: 40 }),
    Q('t1', 0, 'taps', { n: 1 }, { coin: 40 }),
    Q('l1', 0, 'build', { type: 'lumber', n: 1 }, { coin: 50 }),
    Q('p10', 0, 'pop', { n: 10 }, { coin: 80, wood: 20 }, true),
    Q('h3', 0, 'build', { type: 'house', n: 3 }, { coin: 60 }),
    Q('pk1', 0, 'build', { type: 'park', n: 1 }, { coin: 100, wood: 20 }),
    Q('m1', 0, 'build', { type: 'mill', n: 1 }, { coin: 120, wood: 30 }),
    Q('fm', 0, 'pair', { a: 'farm', b: 'mill' }, { coin: 150, spark: 1 }),
    Q('p20', 0, 'pop', { n: 20 }, { coin: 200, wood: 40 }, true),
    Q('lv3', 0, 'lv', { n: 3 }, { coin: 200, wood: 40 }),
    Q('w1', 0, 'build', { type: 'workshop', n: 1 }, { coin: 250, wood: 50 }),
    Q('ld6', 0, 'land', { n: 6 }, { coin: 300, spark: 1 }),
    Q('p35', 0, 'pop', { n: 35 }, { coin: 400, wood: 80 }, true),
    Q('mk1', 0, 'build', { type: 'market', n: 1 }, { coin: 500, wood: 100 }),
    Q('t8', 0, 'taps', { n: 8 }, { coin: 400, spark: 1 }),
    Q('h8', 0, 'build', { type: 'house', n: 8 }, { coin: 600, wood: 120 }),
    Q('p55', 0, 'pop', { n: 55 }, { coin: 900, wood: 200, spark: 1 }, true),
    Q('ld7', 0, 'land', { n: 7 }, { coin: 1200, spark: 1 }),
    Q('pre1', 0, 'pop', { n: 80 }, { coin: 2000, spark: 2 }, true),
    // second town
    Q('p30b', 1, 'pop', { n: 30 }, { coin: 500, spark: 1 }),
    Q('hb', 1, 'build', { type: 'harbor', n: 1 }, { coin: 1500, wood: 300 }, true),
    Q('lb', 1, 'build', { type: 'library', n: 1 }, { coin: 1500, wood: 300, spark: 1 }),
    Q('ld8', 1, 'land', { n: 8 }, { coin: 3000, spark: 1 }),
    Q('p100', 1, 'pop', { n: 100 }, { coin: 3000, wood: 600 }, true),
    Q('lv5', 1, 'lv', { n: 5 }, { coin: 4000, wood: 800, spark: 1 }),
    Q('mk4', 1, 'build', { type: 'market', n: 4 }, { coin: 6000, wood: 1000 }),
    Q('p180', 1, 'pop', { n: 180 }, { coin: 9000, wood: 1500, spark: 2 }, true),
    Q('t30', 1, 'taps', { n: 30 }, { coin: 6000, spark: 2 }),
    Q('pre2', 1, 'pop', { n: 300 }, { coin: 20000, spark: 3 }, true),
    // third town
    Q('p100c', 2, 'pop', { n: 100 }, { coin: 8000, spark: 1 }),
    Q('tw', 2, 'build', { type: 'tower', n: 1 }, { coin: 20000, wood: 4000 }, true),
    Q('ld9', 2, 'land', { n: 9 }, { coin: 30000, spark: 2 }),
    Q('p450', 2, 'pop', { n: 450 }, { coin: 50000, wood: 8000 }, true),
    Q('ty9', 2, 'types', { n: 9 }, { coin: 60000, spark: 3 }),
    Q('pre3', 2, 'pop', { n: 900 }, { coin: 150000, spark: 4 }, true),
    // fourth town and beyond
    Q('p300d', 3, 'pop', { n: 300 }, { coin: 80000, spark: 2 }),
    Q('wl', 3, 'build', { type: 'well', n: 1 }, { coin: 200000, wood: 40000 }, true),
    Q('ld10', 3, 'land', { n: 10 }, { coin: 400000, spark: 3 }),
    Q('p1500', 3, 'pop', { n: 1500 }, { coin: 800000, wood: 100000 }, true),
    Q('p2500', 3, 'pop', { n: 2500 }, { coin: 2000000, spark: 5 }, true),
  ];
  const QUEST_BY_ID = {}; QUESTS.forEach(q => { QUEST_BY_ID[q.id] = q; });

  // ---------------------------------------------------------------- state
  function emptyGrid() { const g = new Array(GRID * GRID).fill(null); g[IDX(PLAZA.x, PLAZA.y)] = { b: 'plaza', lv: 1, c: 0, w: 0 }; return g; }
  function newState(now, seed) {
    const S = {
      v: 1, rn: (seed == null ? 12345 : seed) >>> 0,
      // permanent (the part that is synced)
      best: 0, tier: 0, renown: 0, rs: {}, qd: {}, un: {},
      stats: { built: 0, upgrades: 0, taps: 0, gifts: 0, prestiges: 0, research: 0, returns: 0, awayMax: 0, kinds: 0, expands: 0, events: 0, peakRate: 0 },
      daily: { last: 0, streak: 0 }, tut: 0,
      // this town
      t: now || 0, land: START_LAND, g: emptyGrid(), res: Object.assign({}, START_RES), pop: 0, peak: 0, born: now || 0,
      ev: null, en: 120, vn: 18, vis: [], vid: 0, age: 0, kinds: {},
      _rev: 1, _rc: null,
    };
    return S;
  }
  const touch = S => { S._rev++; S._rc = null; };

  // ---------------------------------------------------------------- how much every tile makes
  // returns { tiles: [{ coin, wood, food, spark, cap, bonus: [...] }], coin, wood, food, spark, cap, taxPerPop, foodCap, parks, houses, mult }
  function rates(S) {
    if (S._rc && S._rc.rev === S._rev) return S._rc;
    const g = S.g, glue = 1 + 0.2 * rl(S, 'glue');
    const mRenown = 1 + RENOWN_MUL * S.renown;
    const mCoin = mRenown * (1 + 0.1 * rl(S, 'wealth')), mWood = mRenown * (1 + 0.25 * rl(S, 'saw')), mFood = mRenown * (1 + 0.2 * rl(S, 'grain'));
    const ev = S.ev ? S.ev.type : '';
    const R = { rev: S._rev, tiles: new Array(GRID * GRID).fill(null), coin: 0, wood: 0, food: 0, spark: 0, cap: 0, taxW: 0, foodCap: 100, parks: 0, houses: 0, counts: {}, mCoin, mWood, mFood };
    const at = (x, y) => (inGrid(x, y) ? g[IDX(x, y)] : null);
    let capSum = 0, taxSum = 0;
    for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
      const b = g[IDX(x, y)];
      if (!b) continue;
      const def = BUILDINGS[b.b];
      R.counts[b.b] = (R.counts[b.b] || 0) + 1;
      const lvm = Math.pow(LV_MUL, b.lv - 1);
      // neighbour bonuses (4 sides) and the tower's ring (8 sides)
      let adj = 0; const bonus = [];
      for (const rule of ADJ[b.b] || []) {
        let n = 0;
        for (const d of N4) { const nb = at(x + d[0], y + d[1]); if (nb && nb.b === rule[0]) n++; }
        if (n) { adj += n * rule[1] * glue; bonus.push({ with: rule[0], n, pct: Math.round(n * rule[1] * glue * 100) }); }
      }
      let towers = 0;
      for (const d of N8) { const nb = at(x + d[0], y + d[1]); if (nb && nb.b === 'tower') towers++; }
      if (towers) { adj += towers * TOWER_BONUS; bonus.push({ with: 'tower', n: towers, pct: Math.round(towers * TOWER_BONUS * 100) }); }
      const m = (1 + adj) * lvm;
      const t = { coin: 0, wood: 0, food: 0, spark: 0, cap: 0, mul: m, bonus, tax: 0 };
      if (b.b === 'house') {
        let parks = 0; for (const d of N4) { const nb = at(x + d[0], y + d[1]); if (nb && nb.b === 'park') parks++; }
        t.cap = 3 + 2 * (b.lv - 1) + PARK_CAP * parks;
        t.tax = def.tax * (1 + adj) * (ev === 'fest' ? 1.5 : 1) * (ev === 'wind' ? 1.5 : 1);   // per resident (not per level: levels give room)
        capSum += t.cap; taxSum += t.cap * t.tax; R.houses++;
      } else if (b.b === 'park') R.parks++;
      else {
        if (def.coin) t.coin = def.coin * m * mCoin * (ev === 'wind' ? 1.5 : 1) * (ev === 'fest' && b.b === 'market' ? 2 : 1) * (ev === 'ship' && b.b === 'harbor' ? 3 : 1);
        if (def.wood) t.wood = def.wood * m * mWood;
        if (def.food) t.food = def.food * m * mFood * (ev === 'rain' ? 2 : 1);
        if (def.spark) t.spark = def.spark * (1 + adj) * (1 + 0.25 * (b.lv - 1));
        if (b.b === 'farm') R.foodCap += 80;
      }
      R.coin += t.coin; R.wood += t.wood; R.food += t.food; R.spark += t.spark;
      R.tiles[IDX(x, y)] = t;
    }
    R.cap = capSum;
    R.taxW = capSum > 0 ? taxSum / capSum : 0;                    // average tax per resident (before the permanent multipliers)
    R.taxPerPop = R.taxW * mCoin;
    // houses show their share at the current population
    return (S._rc = R);
  }
  // coin per second the town makes right now (tax counted at the current population)
  function coinRate(S) { const R = rates(S); return R.coin + R.taxPerPop * S.pop * (S.res.food > 0 ? 1 : 0.5); }
  function foodNet(S) { const R = rates(S); return R.food - FOOD_USE * S.pop; }

  // ---------------------------------------------------------------- one step of the economy (dt <= about 5 s)
  function step(S, dt) {
    const R = rates(S), r = S.res;
    const hungry = r.food <= 0;
    r.coin += (R.coin + R.taxPerPop * S.pop * (hungry ? 0.5 : 1)) * dt;
    r.wood += R.wood * dt;
    r.spark += R.spark * dt;
    r.food = Math.min(R.foodCap, Math.max(0, r.food + (R.food - FOOD_USE * S.pop) * dt));
    if (S.pop > R.cap) S.pop = Math.max(R.cap, S.pop - 4 * dt);
    else if (S.pop < R.cap && r.food > 0) S.pop = Math.min(R.cap, S.pop + (0.3 + 0.012 * R.cap) * dt);
    if (S.pop > S.peak) S.peak = S.pop;
    const p = Math.floor(S.pop + 1e-9);
    if (p > S.best) S.best = p;
  }
  // visitors and events only run while somebody is actually playing
  function stepActive(S, dt, out) {
    S.age += dt;
    if (S.ev) { S.ev.left -= dt; if (S.ev.left <= 0) { S.ev = null; touch(S); } }
    for (const v of S.vis) v.ttl -= dt;
    S.vis = S.vis.filter(v => v.ttl > 0);
    S.vn -= dt;
    if (S.vn <= 0) {
      if (S.vis.length < 2) { S.vis.push({ id: ++S.vid, ttl: 24, life: 24, kind: Math.floor(rand(S) * 4), lane: rand(S) }); if (out) out.push({ type: 'visitor' }); }
      S.vn = 48 * (0.75 + rand(S) * 0.5) * Math.pow(0.85, rl(S, 'crowd')) * (1 - Math.min(0.3, 0.05 * rates(S).parks));
    }
    S.en -= dt;
    if (S.en <= 0 && !S.ev) {
      const R = rates(S), kinds = ['wind'];
      if (R.counts.farm) kinds.push('rain'); if (R.counts.market || R.houses > 2) kinds.push('fest'); if (R.counts.harbor) kinds.push('ship');
      const type = kinds[Math.floor(rand(S) * kinds.length)];
      S.ev = { type, left: 45, life: 45 }; S.stats.events++; touch(S);
      S.en = 90 + rand(S) * 80;
      if (out) out.push({ type: 'event', kind: type });
    }
  }

  // ---------------------------------------------------------------- the clock
  // advance(S, now): bring the town up to `now`. Returns what happened.
  function advance(S, now, opt) {
    const res = { mode: 'none', clock: 'ok', dt: 0, raw: 0, capped: false, events: [], gains: null };
    if (!(now >= MIN_CLOCK) || !isFinite(now)) { res.clock = 'bad'; return res; }
    if (!(S.t >= MIN_CLOCK)) { S.t = now; S.born = S.born || now; return res; }
    const dms = now - S.t;
    if (dms <= 0) { if (dms < -1000) res.clock = 'back'; return res; }    // a clock that went back: no gain, and S.t stays where it was
    res.raw = dms / 1000;
    if (dms > MAX_JUMP_MS) { S.t = now; res.clock = 'jump'; return res; }
    const capMs = offlineCapH(S) * 3600000;
    const eff = Math.min(dms, capMs);
    res.capped = dms > capMs;
    S.t = now;
    const dt = eff / 1000; res.dt = dt;
    if (dt <= ACTIVE_MAX) {
      res.mode = 'active';
      let left = dt;
      while (left > 1e-9) { const h = Math.min(left, 1); step(S, h); stepActive(S, h, res.events); left -= h; }
      return res;
    }
    // away: income only (the town works, but nobody comes by and nothing happens)
    res.mode = 'away';
    const r0 = Object.assign({}, S.res), p0 = Math.floor(S.pop);
    S.ev = null; S.vis = []; touch(S);
    let left = dt;
    while (left > 1e-9) { const h = Math.min(left, 5); step(S, h); left -= h; }
    S.vn = Math.max(S.vn, 8); S.en = Math.max(S.en, 60);
    res.gains = { coin: S.res.coin - r0.coin, wood: S.res.wood - r0.wood, food: S.res.food - r0.food, spark: S.res.spark - r0.spark, pop: Math.floor(S.pop) - p0 };
    if (dt >= 3600) S.stats.returns++;
    S.stats.awayMax = Math.max(S.stats.awayMax, Math.floor(dt));
    return res;
  }

  // ---------------------------------------------------------------- prices
  function discount(S) { return 1 - 0.06 * rl(S, 'tools'); }
  function countOf(S, type) { let n = 0; for (const b of S.g) if (b && b.b === type) n++; return n; }
  function cost(S, type) {
    const d = BUILDINGS[type], n = countOf(S, type), k = Math.pow(d.g + K.gAdd, n) * discount(S);
    return { c: Math.ceil(d.c * k), w: Math.ceil(d.w * k) };
  }
  function upCost(S, b) {
    const d = BUILDINGS[b.b], k = Math.pow(K.up, b.lv - 1) * discount(S) * 2;
    return { c: Math.ceil(d.c * k), w: b.lv >= 2 ? Math.ceil(Math.max(d.w, d.c * 0.3) * k * 0.5) : 0 };
  }
  function affordable(S, c) { return S.res.coin >= c.c && S.res.wood >= c.w; }
  function pay(S, c) { S.res.coin -= c.c; S.res.wood -= c.w; }
  function unlocked(S, type) {
    if (S.un[type]) return true;
    const n = BUILDINGS[type].need;
    if (!n) return true;
    return (n.tier == null || S.tier >= n.tier) && (n.peak == null || S.peak >= n.peak);
  }
  function refreshUnlocks(S) {
    const added = [];
    for (const t of TYPES) if (!S.un[t] && unlocked(S, t)) { S.un[t] = 1; added.push(t); }
    return added;
  }

  // ---------------------------------------------------------------- actions (each returns null when it worked, or a reason)
  function canBuild(S, type, x, y) {
    const d = BUILDINGS[type];
    if (!d || d.fixed) return 'type';
    if (!inGrid(x, y) || !owned(S, x, y)) return 'land';
    if (isWater(x, y)) return 'water';
    if (S.g[IDX(x, y)]) return 'taken';
    if (!unlocked(S, type)) return 'locked';
    if (d.shore && !isShore(x, y)) return 'shore';
    if (!affordable(S, cost(S, type))) return 'money';
    return null;
  }
  function build(S, type, x, y) {
    const why = canBuild(S, type, x, y); if (why) return why;
    const c = cost(S, type); pay(S, c);
    S.g[IDX(x, y)] = { b: type, lv: 1, c: c.c, w: c.w };
    S.stats.built++; if (!S.kinds[type]) { S.kinds[type] = 1; } S.stats.kinds = Math.max(S.stats.kinds, Object.keys(S.kinds).length);
    touch(S); return null;
  }
  function canUpgrade(S, x, y) {
    const b = inGrid(x, y) ? S.g[IDX(x, y)] : null;
    if (!b || BUILDINGS[b.b].fixed) return 'none';
    if (b.lv >= maxLv(S)) return 'max';
    if (!affordable(S, upCost(S, b))) return 'money';
    return null;
  }
  function upgrade(S, x, y) {
    const why = canUpgrade(S, x, y); if (why) return why;
    const b = S.g[IDX(x, y)], c = upCost(S, b); pay(S, c);
    b.lv++; b.c += c.c; b.w += c.w; S.stats.upgrades++; touch(S); return null;
  }
  function demolish(S, x, y) {
    const b = inGrid(x, y) ? S.g[IDX(x, y)] : null;
    if (!b || BUILDINGS[b.b].fixed) return 'none';
    S.res.coin += Math.floor(b.c * 0.5); S.res.wood += Math.floor(b.w * 0.5);
    S.g[IDX(x, y)] = null; touch(S); return null;
  }
  function canExpand(S) {
    if (S.land >= maxLand(S)) return S.land >= GRID ? 'max' : 'tier';
    if (!affordable(S, landCost(S.land + 1))) return 'money';
    return null;
  }
  function expand(S) {
    const why = canExpand(S); if (why) return why;
    pay(S, landCost(S.land + 1)); S.land++; S.stats.expands++; touch(S); return null;
  }
  function buyResearch(S, id) {
    const r = RESEARCH_BY_ID[id]; if (!r) return 'none';
    const lv = rl(S, id); if (lv >= r.max) return 'max';
    const c = r.cost[lv]; if (S.res.spark < c) return 'money';
    S.res.spark -= c; S.rs[id] = lv + 1; S.stats.research++; touch(S); return null;
  }

  // ---------------------------------------------------------------- visitors, the daily gift
  function visitorReward(S) {
    const R = rates(S), c = coinRate(S), purse = 1 + 0.5 * rl(S, 'purse');
    const coin = Math.round(Math.max(10, TAP_SECONDS * c) * purse);
    const wood = Math.round(TAP_SECONDS * 0.35 * R.wood * purse);
    const spark = rand(S) < 0.07 + 0.01 * Math.min(5, R.parks) ? 1 : 0;
    return { coin, wood, spark };
  }
  function tapVisitor(S, id) {
    const i = S.vis.findIndex(v => v.id === id); if (i < 0) return null;
    S.vis.splice(i, 1);
    const g = visitorReward(S);
    S.res.coin += g.coin; S.res.wood += g.wood; S.res.spark += g.spark; S.stats.taps++;
    return g;
  }
  function giftReady(S, now) { return now >= S.t - 5000 && dayNum(now) > S.daily.last; }
  function claimGift(S, now) {
    if (!giftReady(S, now)) return null;
    const day = dayNum(now);
    S.daily.streak = (S.daily.last && day === S.daily.last + 1) ? Math.min(99, S.daily.streak + 1) : 1;
    S.daily.last = day;
    const g = { coin: Math.round(Math.max(60, 600 * coinRate(S))), wood: Math.round(300 * rates(S).wood), spark: S.daily.streak % 7 === 0 ? 2 : 1, streak: S.daily.streak };
    S.res.coin += g.coin; S.res.wood += g.wood; S.res.spark += g.spark; S.stats.gifts++;
    return g;
  }

  // ---------------------------------------------------------------- goals
  function questProgress(S, q) {
    switch (q.kind) {
      case 'build': { const n = countOf(S, q.type); return { v: n, goal: q.n }; }
      case 'pop': return { v: Math.floor(S.pop + 1e-9), goal: q.n };
      case 'lv': { let m = 0; for (const b of S.g) if (b && !BUILDINGS[b.b].fixed) m = Math.max(m, b.lv); return { v: m, goal: q.n }; }
      case 'land': return { v: S.land, goal: q.n };
      case 'taps': return { v: S.stats.taps, goal: q.n };
      case 'types': return { v: Object.keys(S.kinds).length, goal: q.n };
      case 'rate': return { v: Math.floor(coinRate(S)), goal: q.n };
      case 'pair': {
        let n = 0;
        for (let y = 0; y < GRID; y++) for (let x = 0; x < GRID; x++) {
          const b = S.g[IDX(x, y)]; if (!b || b.b !== q.a) continue;
          for (const d of N4) { const nb = inGrid(x + d[0], y + d[1]) ? S.g[IDX(x + d[0], y + d[1])] : null; if (nb && nb.b === q.b) { n++; break; } }
        }
        return { v: n, goal: 1 };
      }
      default: return { v: 0, goal: 1 };
    }
  }
  function currentQuest(S) { for (const q of QUESTS) if (q.tier <= S.tier && !S.qd[q.id]) return q; return null; }
  // the goal after the last written one: the next round population
  function nextPopGoal(S) { const need = prestigeNeed(S); const p = Math.floor(S.pop); const step = Math.max(10, Math.pow(10, Math.floor(Math.log10(Math.max(10, p)))) / 2); return Math.max(p + step - (p % step), need); }
  // completes every goal that is reached (one after the other) and pays the rewards; returns what was completed
  function checkQuests(S) {
    const done = [];
    for (let i = 0; i < 6; i++) {
      const q = currentQuest(S); if (!q) break;
      const pr = questProgress(S, q);
      if (pr.v < pr.goal) break;
      S.qd[q.id] = 1;
      const rw = q.reward;
      S.res.coin += rw.coin || 0; S.res.wood += rw.wood || 0; S.res.spark += rw.spark || 0;
      done.push(q);
    }
    return done;
  }

  // ---------------------------------------------------------------- prestige: open the town again
  function prestigeNeed(S) { return S.tier < PRESTIGE_NEED.length ? PRESTIGE_NEED[S.tier] : PRESTIGE_NEED[PRESTIGE_NEED.length - 1] + 100 * (S.tier - PRESTIGE_NEED.length + 1); }
  function prestigeInfo(S) {
    const need = prestigeNeed(S), pop = Math.floor(S.pop + 1e-9);
    const gain = pop >= need ? Math.max(1, Math.floor(pop / need * (2 + S.tier))) : 0;
    const t2 = S.tier + 1;
    const unlocks = TYPES.filter(t => BUILDINGS[t].need && BUILDINGS[t].need.tier === t2);
    return { ok: pop >= need, need, pop, gain, mulNow: 1 + RENOWN_MUL * S.renown, mulNext: 1 + RENOWN_MUL * (S.renown + gain), nextTier: t2, unlocks, land: Math.min(GRID, 7 + t2), maxLv: 5 + Math.min(t2, 7) };
  }
  function prestige(S, now) {
    const info = prestigeInfo(S); if (!info.ok) return null;
    S.renown += info.gain; S.tier++; S.stats.prestiges++;
    S.best = Math.max(S.best, Math.floor(S.pop));
    const spark = S.res.spark;
    S.land = START_LAND; S.g = emptyGrid(); S.res = Object.assign({}, START_RES, { spark, coin: START_RES.coin + 60 * S.tier, wood: 20 * S.tier });
    S.pop = 0; S.peak = 0; S.ev = null; S.en = 100; S.vn = 15; S.vis = []; S.age = 0; S.kinds = {}; S.t = now || S.t; S.born = S.t;
    refreshUnlocks(S); touch(S);
    return info;
  }

  // ---------------------------------------------------------------- what would happen if I built here (for the little bubbles on the map)
  // value of a town in "coins per second": coins + 0.6 x wood + the tax of a full town (food counted as a limit)
  function worth(S, wWood, wPop) {
    const R = rates(S);
    if (wWood == null) wWood = 0.35;
    const full = R.taxPerPop * R.cap;
    const foodOk = R.food >= FOOD_USE * R.cap ? 1 : Math.max(0.35, R.food / Math.max(1e-9, FOOD_USE * R.cap));
    return R.coin + full * foodOk + wWood * R.wood + 6 * R.spark + (wPop || 0) * R.cap;
  }
  // gain in worth (per second) if `type` were built at x,y (the state is put back afterwards)
  function gainIfBuilt(S, type, x, y, ww, wp) {
    const w0 = worth(S, ww, wp), keep = S._rc, rev = S._rev;
    S.g[IDX(x, y)] = { b: type, lv: 1, c: 0, w: 0 }; S._rc = null; S._rev = rev + 1;
    const w1 = worth(S, ww, wp);
    S.g[IDX(x, y)] = null; S._rc = keep; S._rev = rev;
    return w1 - w0;
  }
  function gainIfUpgraded(S, x, y, ww, wp) {
    const w0 = worth(S, ww, wp), keep = S._rc, rev = S._rev, b = S.g[IDX(x, y)];
    b.lv++; S._rc = null; S._rev = rev + 1;
    const w1 = worth(S, ww, wp);
    b.lv--; S._rc = keep; S._rev = rev;
    return w1 - w0;
  }

  // ---------------------------------------------------------------- saving
  const num = (v, d, lo2, hi) => { v = Number(v); if (!isFinite(v)) return d; return Math.min(hi == null ? Infinity : hi, Math.max(lo2 == null ? -Infinity : lo2, v)); };
  // the synced part (records only grow) and this device's town
  function packMeta(S) {
    return { v: 1, best: S.best | 0, tier: S.tier | 0, renown: S.renown | 0, rs: Object.assign({}, S.rs), qd: Object.assign({}, S.qd), un: Object.assign({}, S.un), stats: Object.assign({}, S.stats), daily: { last: S.daily.last, streak: S.daily.streak }, tut: S.tut | 0 };
  }
  function packRun(S) {
    return { v: 1, t: S.t, born: S.born, land: S.land, g: S.g.map(b => (b ? [b.b, b.lv, Math.round(b.c), Math.round(b.w)] : 0)), res: S.res, pop: S.pop, peak: S.peak, ev: S.ev, en: S.en, vn: S.vn, vid: S.vid, rn: S.rn, age: S.age, kinds: S.kinds, tier: S.tier };
  }
  // build a state from what was stored (anything may be missing or broken). `now` is used when there is no time in the run.
  function unpack(meta, run, now) {
    const S = newState(now || 0, 12345);
    const m = meta && typeof meta === 'object' && !Array.isArray(meta) ? meta : {};
    S.best = num(m.best, 0, 0, 1e6) | 0; S.tier = num(m.tier, 0, 0, 99) | 0; S.renown = num(m.renown, 0, 0, 1e7) | 0; S.tut = num(m.tut, 0, 0, 1) | 0;
    for (const k of Object.keys(m.rs && typeof m.rs === 'object' ? m.rs : {})) if (RESEARCH_BY_ID[k]) S.rs[k] = Math.min(RESEARCH_BY_ID[k].max, num(m.rs[k], 0, 0, 99) | 0);
    for (const k of Object.keys(m.qd && typeof m.qd === 'object' ? m.qd : {})) if (QUEST_BY_ID[k] && m.qd[k]) S.qd[k] = 1;
    for (const k of Object.keys(m.un && typeof m.un === 'object' ? m.un : {})) if (BUILDINGS[k] && m.un[k]) S.un[k] = 1;
    if (m.stats && typeof m.stats === 'object') for (const k of Object.keys(S.stats)) S.stats[k] = num(m.stats[k], 0, 0, 1e12);
    if (m.daily && typeof m.daily === 'object') { S.daily.last = num(m.daily.last, 0, 0, 1e7) | 0; S.daily.streak = num(m.daily.streak, 0, 0, 999) | 0; }
    const r = run && typeof run === 'object' && !Array.isArray(run) && run.v === 1 ? run : null;
    if (r) {
      S.t = num(r.t, 0, 0, 1e15); S.born = num(r.born, S.t, 0, 1e15); S.rn = num(r.rn, 12345, 0, 4294967295) >>> 0;
      S.land = num(r.land, START_LAND, START_LAND, GRID) | 0;
      if (Array.isArray(r.g)) for (let i = 0; i < GRID * GRID; i++) {
        const b = r.g[i]; if (!Array.isArray(b) || !BUILDINGS[b[0]] || BUILDINGS[b[0]].fixed) continue;
        const x = i % GRID, y = Math.floor(i / GRID);
        if (isWater(x, y) || !owned(S, x, y)) continue;
        S.g[i] = { b: b[0], lv: num(b[1], 1, 1, 12) | 0, c: num(b[2], 0, 0, 1e15), w: num(b[3], 0, 0, 1e15) };
      }
      if (r.res && typeof r.res === 'object') for (const k of ['coin', 'wood', 'food', 'spark']) S.res[k] = num(r.res[k], START_RES[k], 0, 1e18);
      S.pop = num(r.pop, 0, 0, 1e7); S.peak = Math.max(S.pop, num(r.peak, 0, 0, 1e7));
      if (r.ev && typeof r.ev === 'object' && ['rain', 'fest', 'wind', 'ship'].includes(r.ev.type)) S.ev = { type: r.ev.type, left: num(r.ev.left, 0, 0, 600), life: 45 };
      S.en = num(r.en, 100, 0, 1000); S.vn = num(r.vn, 20, 0, 1000); S.vid = num(r.vid, 0, 0, 1e9) | 0; S.age = num(r.age, 0, 0, 1e12);
      if (r.kinds && typeof r.kinds === 'object') for (const k of Object.keys(r.kinds)) if (BUILDINGS[k]) S.kinds[k] = 1;
    } else {
      if (now) { S.t = now; S.born = now; }
      if (S.tier > 0) { S.res.coin = START_RES.coin + 60 * S.tier; S.res.wood = 20 * S.tier; S.en = 100; S.vn = 15; }
    }
    S.stats.kinds = Math.max(S.stats.kinds, Object.keys(S.kinds).length);
    S.best = Math.max(S.best, Math.floor(S.pop));
    refreshUnlocks(S); touch(S);
    return S;
  }

  const Town = {
    K, GRID, START_LAND, PLAZA, WATER, ACTIVE_MAX, OFFLINE_BASE_H, MAX_JUMP_MS, MIN_CLOCK, FOOD_USE, RENOWN_MUL, PRESTIGE_NEED, START_RES, TAP_SECONDS,
    BUILDINGS, TYPES, ADJ, RESEARCH, RESEARCH_BY_ID, QUESTS, QUEST_BY_ID, N4, N8, PARK_CAP, TOWER_BONUS,
    rand, hash2, IDX, inGrid, owned, lo, isWater, isShore, decor, maxLand, landCost, maxLv, offlineCapH, rl, dayNum,
    newState, touch, rates, coinRate, foodNet, step, stepActive, advance,
    cost, upCost, affordable, unlocked, refreshUnlocks, countOf, canBuild, build, canUpgrade, upgrade, demolish, canExpand, expand, buyResearch,
    visitorReward, tapVisitor, giftReady, claimGift,
    questProgress, currentQuest, checkQuests, nextPopGoal, prestigeNeed, prestigeInfo, prestige, worth, gainIfBuilt, gainIfUpgraded,
    packMeta, packRun, unpack,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = Town; else root.TownEngine = Town;
})(typeof window !== 'undefined' ? window : globalThis);
