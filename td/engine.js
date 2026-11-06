// 工房まもり — the simulation (no DOM). The page (td/index.html) draws it; tools/tests/td-balance.js runs it headless.
// Everything is deterministic: a fixed time step (TD.DT), a seeded random generator whose state is saved with the run,
// and swap-remove pools in a fixed order. The same input sequence gives the same game on every device and in node.
//
//   const G = TD.create({ map: 0, mode: 'normal' | 'endless' | 'daily', mods: [], snap })
//   G.step()                      one tick of TD.DT seconds
//   G.build(slot, type) / G.upgrade(tower, branch?) / G.sell(tower) / G.setTarget(tower, mode) / G.callWave()
//   G.quiet()                     no enemy on the field and nothing left to spawn (autosave point)
//   G.snapshot()                  plain JSON of a quiet game (TD.create({ snap }) restores it)
//   G.events                      ring buffer the renderer reads (G.evN counts every event ever written)
//   TD.bot(G, plan).think()       the auto-player (balance simulation and the ?debug hook)
(function (root) {
  'use strict';
  const DT = 1 / 60;
  const COLS = 9, ROWS = 14;
  const START_LIVES = 20;
  const WAVE_GAP = 16;          // seconds between the last spawn of a wave and the next wave
  const SELL = 0.7;             // refund
  const MAXE = 640, MAXS = 640, EVN = 512;
  const TUNE = { hp: 1 };

  // ------------------------------------------------------------------ random (mulberry32; the state is one uint32)
  function hash32(str) { let h = 1779033703 ^ str.length; for (let i = 0; i < str.length; i++) { h = Math.imul(h ^ str.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); } h = Math.imul(h ^ (h >>> 16), 2246822507); h = Math.imul(h ^ (h >>> 13), 3266489909); return (h ^= h >>> 16) >>> 0; }
  function Rng(s) { this.s = s >>> 0; }
  Rng.prototype.next = function () { let t = (this.s = (this.s + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  Rng.prototype.int = function (n) { return Math.floor(this.next() * n); };

  // ------------------------------------------------------------------ towers
  // lv[0] = build, lv[1], lv[2] = upgrades, br.a / br.b = the last upgrade (a choice). cost of an entry = price of reaching it.
  // kinds: shot (homing, single), ball (lobbed, splash), glue (homing, slows), copter (homing, air), zap (instant chain), buff (no attack)
  const TOWERS = {
    nail: { kind: 'shot', ground: 1, air: 1, color: '#c9a36a',
      name: { ja: 'くぎ打ち', en: 'Nailer' }, desc: { ja: '速い単発。空にも届く。傘には弱い', en: 'Fast single shots. Hits flyers too. Weak on umbrellas' },
      lv: [{ cost: 60, dmg: 7, rate: 1.8, range: 2.3, shieldX: 0.4 }, { cost: 55, dmg: 9, rate: 2.0, range: 2.5, shieldX: 0.4 }, { cost: 95, dmg: 13, rate: 2.2, range: 2.6, shieldX: 0.4 }],
      br: { a: { cost: 200, dmg: 11, rate: 5.5, range: 2.7, shieldX: 0.4, name: { ja: '連射くぎ', en: 'Rapid Nailer' }, desc: { ja: 'とても速く撃つ', en: 'Fires very fast' } },
            b: { cost: 230, dmg: 56, rate: 0.75, range: 3.6, pierce: 1, shieldX: 0.4, name: { ja: '長くぎ', en: 'Long Nail' }, desc: { ja: '遠くまで届き、よろいを貫く', en: 'Long range, pierces armor' } } } },
    spring: { kind: 'ball', ground: 1, air: 0, color: '#d9634a',
      name: { ja: 'ばね砲', en: 'Spring Mortar' }, desc: { ja: '弾がはねて周りもまとめて。地上だけ', en: 'Lobbed shots hit an area. Ground only' },
      lv: [{ cost: 80, dmg: 18, rate: 0.75, range: 2.7, splash: 0.9 }, { cost: 70, dmg: 30, rate: 0.8, range: 2.8, splash: 0.95 }, { cost: 110, dmg: 48, rate: 0.85, range: 3.0, splash: 1.05 }],
      br: { a: { cost: 240, dmg: 82, rate: 0.8, range: 3.2, splash: 1.35, name: { ja: '大ばね', en: 'Big Spring' }, desc: { ja: '大きな爆発', en: 'A big blast' } },
            b: { cost: 220, dmg: 55, rate: 1.0, range: 3.0, splash: 1.0, stun: 0.55, name: { ja: 'ゆれ玉', en: 'Shaker Shot' }, desc: { ja: '当たった相手をしばらく止める', en: 'Stops what it hits for a moment' } } } },
    glue: { kind: 'glue', ground: 1, air: 0, color: '#7fc8a8',
      name: { ja: 'のり吹き', en: 'Glue Sprayer' }, desc: { ja: 'のりで足を遅くする。地上だけ', en: 'Glue slows enemies down. Ground only' },
      lv: [{ cost: 70, dmg: 3, rate: 1.2, range: 2.2, slow: 0.35, dur: 2 }, { cost: 50, dmg: 5, rate: 1.3, range: 2.4, slow: 0.42, dur: 2.2 }, { cost: 80, dmg: 8, rate: 1.4, range: 2.6, slow: 0.5, dur: 2.4 }],
      br: { a: { cost: 170, dmg: 10, rate: 1.4, range: 2.8, slow: 0.55, dur: 2.5, splash: 0.95, name: { ja: 'のり池', en: 'Glue Pool' }, desc: { ja: '周りもまとめて遅くする', en: 'Slows a whole area' } },
            b: { cost: 170, dmg: 10, rate: 1.5, range: 2.8, slow: 0.7, dur: 2.6, dot: 14, name: { ja: '固めのり', en: 'Quick-set Glue' }, desc: { ja: 'とても遅くして、じわじわ削る', en: 'Strong slow and damage over time' } } } },
    copter: { kind: 'copter', ground: 0, air: 1, color: '#e8c25a',
      name: { ja: '竹とんぼ台', en: 'Copter Pad' }, desc: { ja: '空の敵に強い。地上は狙わない', en: 'Strong against flyers. Ignores the ground' },
      lv: [{ cost: 80, dmg: 24, rate: 1.2, range: 3.1 }, { cost: 60, dmg: 38, rate: 1.25, range: 3.3 }, { cost: 100, dmg: 58, rate: 1.3, range: 3.5 }],
      br: { a: { cost: 200, dmg: 50, rate: 1.5, range: 3.7, multi: 3, name: { ja: 'とんぼの群れ', en: 'Copter Swarm' }, desc: { ja: '3つの敵を同時に狙う', en: 'Aims at 3 enemies at once' } },
            b: { cost: 220, dmg: 140, rate: 1.0, range: 3.7, groundToo: 0.6, name: { ja: '大とんぼ', en: 'Big Copter' }, desc: { ja: '一撃が重く、地上にも届く', en: 'Heavy hits, reaches the ground too' } } } },
    coil: { kind: 'zap', ground: 1, air: 0, color: '#7fb4f0',
      name: { ja: '電池コイル', en: 'Spark Coil' }, desc: { ja: '電気が地面を伝って次々に飛び移る。傘に強い。地上だけ', en: 'Sparks jump along the ground between enemies. Good on shields. Ground only' },
      lv: [{ cost: 120, dmg: 13, rate: 0.85, range: 2.3, jumps: 2, decay: 0.7, shieldX: 2 }, { cost: 80, dmg: 21, rate: 0.9, range: 2.4, jumps: 3, decay: 0.72, shieldX: 2 }, { cost: 130, dmg: 32, rate: 0.95, range: 2.5, jumps: 4, decay: 0.75, shieldX: 2 }],
      br: { a: { cost: 240, dmg: 40, rate: 1.1, range: 2.7, jumps: 8, decay: 0.86, shieldX: 2, name: { ja: '長い鎖', en: 'Long Chain' }, desc: { ja: 'たくさん飛び移る', en: 'Jumps many times' } },
            b: { cost: 240, dmg: 72, rate: 1.0, range: 2.6, jumps: 3, decay: 0.8, shieldX: 4, stun: 0.3, name: { ja: '過電流', en: 'Overload' }, desc: { ja: 'しびれさせ、傘を壊す', en: 'Stuns and smashes shields' } } } },
    toolbox: { kind: 'buff', ground: 0, air: 0, color: '#b48ad8',
      name: { ja: '道具箱', en: 'Toolbox' }, desc: { ja: '近くの台を強くする', en: 'Powers up nearby towers' },
      lv: [{ cost: 100, range: 1.6, bd: 0.15, br: 0 }, { cost: 80, range: 1.6, bd: 0.22, br: 0.08 }, { cost: 120, range: 1.7, bd: 0.3, br: 0.12 }],
      br: { a: { cost: 220, range: 1.7, bd: 0.5, br: 0.15, name: { ja: '砥石', en: 'Whetstone' }, desc: { ja: '攻撃をぐんと強く', en: 'A big damage boost' } },
            b: { cost: 200, range: 1.8, bd: 0.3, br: 0.15, bank: 40, name: { ja: '貯金箱', en: 'Piggy Bank' }, desc: { ja: '波ごとにコイン +40', en: '+40 coins every wave' } } } },
  };
  const TOWER_IDS = ['nail', 'spring', 'glue', 'copter', 'coil', 'toolbox'];
  const TARGETS = ['first', 'strong', 'near'];

  // ------------------------------------------------------------------ enemies
  // hp, sp (tiles/s), armor (flat, per hit), shield (absorbs first; regenerates when not hit), lives (cost of a leak)
  const ENEMIES = {
    b: { id: 'soldier', hp: 32, sp: 0.95, bounty: 5, size: 0.3, name: { ja: 'ねじまき兵', en: 'Windup Soldier' }, desc: { ja: 'ふつうの人形', en: 'An ordinary toy' } },
    f: { id: 'bunny', hp: 22, sp: 1.9, bounty: 5, size: 0.27, name: { ja: 'ばねウサギ', en: 'Spring Bunny' }, desc: { ja: '足が速い', en: 'Fast' } },
    t: { id: 'turtle', hp: 80, sp: 0.65, armor: 8, bounty: 9, size: 0.34, name: { ja: 'ブリキ亀', en: 'Tin Turtle' }, desc: { ja: 'よろいで弱い攻撃をはじく', en: 'Armor shrugs off weak hits' } },
    h: { id: 'oiler', hp: 55, sp: 0.85, heal: 0.04, healR: 1.5, bounty: 10, size: 0.3, name: { ja: '油さし', en: 'Oil Can' }, desc: { ja: '近くの仲間を直す', en: 'Repairs nearby toys' } },
    s: { id: 'doll', hp: 50, sp: 0.85, split: 'm', bounty: 6, size: 0.34, name: { ja: '入れ子人形', en: 'Nesting Doll' }, desc: { ja: 'こわすと2つに分かれる', en: 'Splits in two when broken' } },
    m: { id: 'doll2', hp: 24, sp: 1.15, bounty: 3, size: 0.24, name: { ja: '中の人形', en: 'Inner Doll' }, desc: { ja: '小さくて少し速い', en: 'Smaller and a little faster' } },
    a: { id: 'balloon', hp: 40, sp: 1.05, air: 1, bounty: 7, size: 0.32, name: { ja: '風船ぐま', en: 'Balloon Bear' }, desc: { ja: '空を飛んでまっすぐ来る', en: 'Flies straight over everything' } },
    u: { id: 'umbrella', hp: 45, sp: 0.95, shield: 60, bounty: 9, size: 0.31, name: { ja: '傘こぞう', en: 'Umbrella Kid' }, desc: { ja: '傘がこわれるまでは本体に当たらない', en: 'Its umbrella soaks up hits first' } },
    k: { id: 'engine', hp: 400, sp: 0.5, armor: 6, lives: 3, bounty: 25, size: 0.42, name: { ja: 'ブリキ機関車', en: 'Tin Engine' }, desc: { ja: 'とても丈夫。もれると3つ盗む', en: 'Very tough. Steals 3 if it gets through' } },
    K: { id: 'king', hp: 1400, sp: 0.36, armor: 6, shield: 200, lives: 10, bounty: 200, size: 0.5, slowRes: 0.5, summon: 4, boss: 1, name: { ja: 'ぜんまい大王', en: 'Clockwork King' }, desc: { ja: '親玉。手下を呼ぶ', en: 'The boss. Calls in minions' } },
  };
  const ENEMY_KEYS = Object.keys(ENEMIES);
  const GAP = { b: 0.8, f: 0.5, t: 1.1, h: 1.3, s: 1.2, a: 0.9, u: 0.9, k: 2.6, K: 1, m: 0.5 };

  // ------------------------------------------------------------------ maps
  // routes: polylines in tile units (centres are .5). ent: the routes of each entrance (an entrance with two routes forks).
  // air: the flyers' lines. waves: groups "<count><type>[/gap][@entrance]" (one after another).
  const MAPS = [
    { id: 'm1', name: { ja: '土間の通り道', en: 'The Earthen Floor' }, hp: 0.8, mul: 1.0, gold: 160, ground: '#6f8f4e', tone: 0,
      desc: { ja: 'まずはここから。曲がり角の内側が狙い目', en: 'Start here. The inside of a bend covers the most path' },
      routes: [[[4, -1], [4, 2], [1, 2], [1, 6], [7, 6], [7, 10], [4, 10], [4, 13.6]]],
      waves: ['5b', '8b', '6b 4f', '10b', '6f 6b', '3t 6b', '4a 8b', '10f 3t', '12b 5a', '5t 10b 6f'] },
    { id: 'm2', name: { ja: '材木置き場', en: 'Lumber Yard' }, hp: 0.95, mul: 1.15, gold: 170, ground: '#7a8a48', tone: 1,
      desc: { ja: '長いジグザグ。傘こぞうが初めて来る', en: 'A long zigzag. Umbrella Kids show up' },
      routes: [[[1, -1], [1, 3], [7, 3], [7, 6], [1, 6], [1, 9], [7, 9], [7, 12], [4, 12], [4, 13.6]]],
      waves: ['8b', '6b 4u', '10f', '6u 6b', '4t 8b', '6a 6u', '12f 4t', '8u 8b', '6t 6a', '10u 6f', '6t 6u 6a', '1k 10b 6u'] },
    { id: 'm3', name: { ja: 'ばね倉庫', en: 'Spring Storehouse' }, hp: 1.0, mul: 1.3, gold: 180, ground: '#5f8a6a', tone: 2,
      desc: { ja: '入れ子人形と油さし。まとめて叩こう', en: 'Nesting Dolls and Oil Cans. Hit them in groups' },
      routes: [[[-1, 1], [2, 1], [2, 4], [6, 4], [6, 8], [2, 8], [2, 11], [6, 11], [6, 13.6]]],
      waves: ['8b', '4s', '6b 2h 6b', '10f', '6s', '4t 2h 6u', '8a', '8s 2h', '12f 4u', '6t 3h 6b', '8s 6a', '2k 4h 10b'] },
    { id: 'm4', name: { ja: 'ふたまた廊下', en: 'Forked Hallway' }, hp: 0.86, mul: 1.45, gold: 200, ground: '#6a7f9a', tone: 3,
      desc: { ja: '道が2つに分かれる。どちらを通るかは運しだい', en: 'The path forks. Toys pick a side at random' },
      routes: [[[4, -1], [4, 2], [1, 2], [1, 9], [4, 9], [4, 13.6]], [[4, -1], [4, 2], [7, 2], [7, 5], [5, 5], [5, 7], [7, 7], [7, 9], [4, 9], [4, 13.6]]], ent: [[0, 1]],
      waves: ['10b', '8f', '6b 4u', '6s 2h', '8a 6b', '6t 8b', '10u 2h', '14f 4t', '8s 6a', '6t 6u 3h', '1k 10f', '10a 6u', '8t 8s 3h', '2k 12a 8f'] },
    { id: 'm5', name: { ja: 'ふたつの戸口', en: 'Two Doorways' }, hp: 1.05, mul: 1.6, gold: 220, ground: '#8a7a52', tone: 4,
      desc: { ja: '左右の戸口から同時に来る。合流の先を固めよう', en: 'Toys come through two doors. Guard where they meet' },
      routes: [[[-1, 2], [3, 2], [3, 7], [4, 7], [4, 10], [7, 10], [7, 13.6]], [[9, 4], [6, 4], [6, 7], [4, 7], [4, 10], [7, 10], [7, 13.6]]], ent: [[0], [1]],
      waves: ['6b@0 6b@1', '6f@0 6f@1', '4u@0 4t@1', '6s', '8a', '6t 6u 4h', '1k@0 1k@1', '12f 8b', '8s 3h 6a', '6t 8u', '2k 10f', '10a 8s', '8t 4h 8u', '3k 12b', '10a 10f 6t'] },
    { id: 'm6', name: { ja: '屋根裏の風穴', en: 'Drafty Attic' }, hp: 1.25, mul: 1.75, gold: 260, ground: '#7a6a8a', tone: 5,
      desc: { ja: '穴から風船ぐまが次々に。空の守りが要', en: 'Balloon Bears pour in through the roof. Guard the sky' },
      routes: [[[1, -1], [1, 4], [4, 4], [4, 1], [7, 1], [7, 8], [2, 8], [2, 11], [5, 11], [5, 13.6]]], air: [[[8.6, -0.8], [5.5, 13.6]], [[-0.8, 5], [5.5, 13.6]]],
      waves: ['8b', '6a', '8f 4a', '6u 6a', '10a', '6t 6s', '12a 4u', '2h 8s 6a', '14a', '1k 8a 8f', '8t 10a', '6u 12a 3h', '2k 12a', '16a 8u', '1K 10a'] },
    { id: 'm7', name: { ja: '歯車の迷路', en: 'Gear Maze' }, hp: 1.15, mul: 1.9, gold: 300, ground: '#6a8a7f', tone: 6,
      desc: { ja: '2つの入口と分かれ道。全部を見渡せる場所を探そう', en: 'Two entrances and a fork. Find spots that see it all' },
      routes: [[[2, -1], [2, 3], [6, 3], [6, 6], [3, 6], [3, 9], [6, 9], [6, 13.6]], [[2, -1], [2, 3], [6, 3], [6, 6], [3, 6], [3, 12], [6, 12], [6, 13.6]],
               [[-1, 6], [3, 6], [3, 9], [6, 9], [6, 13.6]], [[-1, 6], [3, 6], [3, 12], [6, 12], [6, 13.6]]], ent: [[0, 1], [2, 3]],
      waves: ['8b@0 6b@1', '6f@0 6f@1', '6b@0 4u@1', '8a', '6t@0 6s@1', '3h 10b 6u', '12f 6a', '8s 8s', '1k 6u 3h', '10a 6t', '14f@1 10b@0', '2k 8s', '12u 8a', '10u 4h 8s 2k', '1K 12b 10a'] },
    { id: 'm8', name: { ja: '親方の作業台', en: "The Master's Bench" }, hp: 1.1, mul: 2.1, gold: 320, ground: '#8a6a52', tone: 7,
      desc: { ja: '最後の戦い。ぜんまい大王が2度やって来る', en: 'The last stand. The Clockwork King comes twice' },
      routes: [[[1, -1], [1, 5], [4, 5], [4, 2], [7, 2], [7, 9], [5, 9], [5, 12], [2, 12], [2, 13.6]], [[-1, 7], [3, 7], [3, 10], [5, 10], [5, 12], [2, 12], [2, 13.6]]], ent: [[0], [1]], air: [[[8.6, -0.8], [2.5, 13.6]]],
      waves: ['10b', '8f 6b', '4u 4s', '10a', '8t 6u', '1k 10f', '8s 3h', '12a 8u', '2k 10a', '10t 10f', '1K 10b', '12u 8s 4h', '14a 8t', '4k 12f', '16a 10u', '1K@0 1K@1 12b 8a'] },
  ];

  // ------------------------------------------------------------------ geometry
  function mkRoute(pts) {
    const P = pts.map(p => ({ x: p[0] + 0.5, y: p[1] + 0.5 }));
    const cum = [0];
    for (let i = 1; i < P.length; i++) cum.push(cum[i - 1] + Math.hypot(P[i].x - P[i - 1].x, P[i].y - P[i - 1].y));
    return { P, cum, len: cum[cum.length - 1] };
  }
  // position at distance d; si = a hint (segment index, only grows)
  function posAt(R, d, si, out) {
    const P = R.P, cum = R.cum, n = P.length - 1;
    if (si < 0) si = 0;
    while (si < n - 1 && cum[si + 1] <= d) si++;
    const a = P[si], b = P[si + 1], L = cum[si + 1] - cum[si] || 1, f = Math.max(0, Math.min(1, (d - cum[si]) / L));
    out.x = a.x + (b.x - a.x) * f; out.y = a.y + (b.y - a.y) * f; out.si = si;
    out.dx = (b.x - a.x) / L; out.dy = (b.y - a.y) / L;
    return out;
  }
  // tiles the ground routes cover, and the build slots next to them (no two slots side by side, so every tap is clear)
  const mapCache = {};
  function mapInfo(mi) {
    if (mapCache[mi]) return mapCache[mi];
    const M = MAPS[mi];
    const routes = M.routes.map(mkRoute);
    const air = (M.air || [[M.routes[0][0], M.routes[0][M.routes[0].length - 1]]]).map(mkRoute);
    const ent = M.ent || [M.routes.map((_, i) => i)];
    const path = new Uint8Array(COLS * ROWS);
    for (const r of M.routes) for (let i = 1; i < r.length; i++) {
      const [x0, y0] = r[i - 1], [x1, y1] = r[i];
      const n = Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0)));
      for (let k = 0; k <= n; k++) {
        const x = Math.round(x0 + (x1 - x0) * k / n), y = Math.round(y0 + (y1 - y0) * k / n);
        if (x >= 0 && x < COLS && y >= 0 && y < ROWS) path[y * COLS + x] = 1;
      }
    }
    // coverage of a tile: how much ground path is within 2.6 tiles (used to order the candidates)
    const samples = [];
    routes.forEach((R, ri) => { for (let d = 0; d < R.len; d += 0.25) { const o = posAt(R, d, 0, {}); if (o.x > 0 && o.x < COLS && o.y > 0 && o.y < ROWS) samples.push(o.x, o.y, ri); } });
    const cands = [], gx = routes[0].P[routes[0].P.length - 1].x;
    for (let y = 0; y < ROWS; y++) for (let x = 0; x < COLS; x++) {
      if (path[y * COLS + x]) continue;
      if (Math.abs(x + 0.5 - gx) < 1.6 && y >= ROWS - 1) continue; // the workbench
      let near = false;
      for (let dy = -1; dy <= 1 && !near; dy++) for (let dx = -1; dx <= 1; dx++) { const X = x + dx, Y = y + dy; if (X >= 0 && X < COLS && Y >= 0 && Y < ROWS && path[Y * COLS + X]) { near = true; break; } }
      if (!near) continue;
      let c = 0; for (let i = 0; i < samples.length; i += 3) { const ddx = samples[i] - x - 0.5, ddy = samples[i + 1] - y - 0.5; if (ddx * ddx + ddy * ddy <= 2.6 * 2.6) c++; }
      cands.push({ x, y, c });
    }
    cands.sort((a, b) => b.c - a.c || a.y - b.y || a.x - b.x);
    const taken = new Uint8Array(COLS * ROWS), slots = [];
    for (const c of cands) {
      const i = c.y * COLS + c.x;
      if ((c.x > 0 && taken[i - 1]) || (c.x < COLS - 1 && taken[i + 1]) || (c.y > 0 && taken[i - COLS]) || (c.y < ROWS - 1 && taken[i + COLS])) continue;
      taken[i] = 1; slots.push({ x: c.x, y: c.y, cx: c.x + 0.5, cy: c.y + 0.5 });
    }
    slots.sort((a, b) => a.y - b.y || a.x - b.x);
    const end = routes[0].P[routes[0].P.length - 1];
    return (mapCache[mi] = { M, routes, air, ent, path, slots, samples, goal: { x: end.x, y: Math.min(ROWS - 0.5, end.y) } });
  }

  // ------------------------------------------------------------------ waves
  function parseWave(str) {
    const out = [];
    for (const g of String(str).trim().split(/\s+/)) {
      const m = /^(\d+)([a-zA-Z])(?:\/([\d.]+))?(?:@(\d))?$/.exec(g);
      if (!m || !ENEMIES[m[2]]) continue;
      out.push({ n: +m[1], k: m[2], gap: m[3] ? +m[3] : GAP[m[2]], ent: m[4] != null ? +m[4] : -1 });
    }
    return out;
  }
  // waves beyond the map's list (endless and daily): generated from the map and the wave number only
  const POOL = ['b', 'f', 't', 'u', 's', 'h', 'a', 'k'];
  const COSTW = { b: 1, f: 0.9, t: 2.2, u: 1.7, s: 2.4, h: 2, a: 1.4, k: 9 };
  function genWave(mi, w, mods) {
    const r = new Rng(hash32('td:' + MAPS[mi].id + ':' + w));
    const L = MAPS[mi].waves.length;
    let budget = 18 + 1.6 * w;
    const groups = [];
    if ((w + 1) % 10 === 0) { groups.push({ n: 1 + Math.floor((w + 1) / 30), k: 'K', gap: 1.5, ent: -1 }); budget *= 0.5; }
    const kinds = 2 + r.int(2);
    for (let i = 0; i < kinds; i++) {
      let k = POOL[r.int(POOL.length)];
      if (mods && mods.skies && i === 0 && w % 3 === 2) k = 'a';
      if (k === 'k' && w < L) k = 't';
      const n = Math.max(1, Math.round(budget / kinds / COSTW[k]));
      groups.push({ n: Math.min(40, n), k, gap: Math.max(0.25, GAP[k] * (w > 30 ? 0.7 : 1)), ent: -1 });
    }
    return groups;
  }
  function waveGroups(mi, w, mods) {
    const L = MAPS[mi].waves;
    const g = w < L.length ? parseWave(L[w]) : genWave(mi, w, mods);
    if (mods && mods.skies && w < L.length && w % 3 === 2 && w > 0) g.push({ n: 3 + (w >> 1), k: 'a', gap: 0.8, ent: -1 });
    return g;
  }
  function hpScale(mi, w) { const L = MAPS[mi].waves.length; let s = TUNE.hp * MAPS[mi].hp * (1 + 0.1 * w + 0.002 * w * w); if (w >= L) s *= Math.pow(1.045, w - L + 1); return s; }

  // ------------------------------------------------------------------ daily modifiers
  const MODS = {
    tough: { mul: 1.3, name: { ja: '頑丈：敵の体力 +25%', en: 'Tough: enemy HP +25%' } },
    swift: { mul: 1.2, name: { ja: '早足：敵の速さ +15%', en: 'Swift: enemies 15% faster' } },
    thrifty: { mul: 1.2, name: { ja: '節約：はじめのコイン −20%', en: 'Thrifty: 20% fewer starting coins' } },
    armor: { mul: 1.2, name: { ja: '鉄板：敵のよろい +2', en: 'Plated: enemy armor +2' } },
    skies: { mul: 1.15, name: { ja: '大空：風船ぐまが多い', en: 'Open Skies: extra Balloon Bears' } },
    ban: { mul: 1.2, name: { ja: '使えない台：{t}', en: 'No {t} today' } },
  };
  const MOD_IDS = ['tough', 'swift', 'thrifty', 'armor', 'skies', 'ban'];
  const BANNABLE = ['nail', 'spring', 'glue', 'coil'];
  function dailySetup(seed) {
    const r = new Rng(seed >>> 0);
    const map = r.int(MAPS.length);
    let a = r.int(MOD_IDS.length), b = r.int(MOD_IDS.length - 1); if (b >= a) b++;
    const mods = {};
    // a banned tower and tougher toys together are too much for one day: the second becomes open skies
    if ((MOD_IDS[a] === 'ban' && MOD_IDS[b] === 'tough') || (MOD_IDS[a] === 'tough' && MOD_IDS[b] === 'ban')) { if (MOD_IDS[a] === 'tough') a = MOD_IDS.indexOf('skies'); else b = MOD_IDS.indexOf('skies'); }
    for (const i of [a, b]) { const k = MOD_IDS[i]; mods[k] = k === 'ban' ? BANNABLE[r.int(BANNABLE.length)] : 1; }
    return { map, mods };
  }
  function modMul(mods) { let m = 1; for (const k in mods || {}) if (MODS[k]) m *= MODS[k].mul; return m; }

  // ------------------------------------------------------------------ the game
  function create(o) {
    o = o || {};
    const snap = o.snap || null;
    const mi = Math.max(0, Math.min(MAPS.length - 1, (snap ? snap.map : o.map) | 0));
    const I = mapInfo(mi), M = I.M;
    const mode = (snap ? snap.mode : o.mode) || 'normal';
    const mods = Object.assign({}, (snap ? snap.mods : o.mods) || {});
    const endless = mode !== 'normal';
    const scoreMul = M.mul * modMul(mods);
    const out = { x: 0, y: 0, si: 0, dx: 0, dy: 0 };

    const G = {
      map: mi, M, I, mode, mods, endless, scoreMul,
      t: 0, gold: Math.round(M.gold * (mode === 'daily' ? 1.3 : 1) * (mods.thrifty ? 0.8 : 1)), lives: START_LIVES,
      wave: 0,                 // number of waves started
      total: endless ? Infinity : M.waves.length,
      cd: -1,                  // countdown to the next wave (seconds); -1 = waiting for the player
      cleared: 0, score: 0, over: false, won: false, stars: 0,
      rng: new Rng(o.seed != null ? o.seed : hash32('run:' + M.id + ':' + mode)),
      en: [], ne: 0, pool: [], uid: 1,
      sh: [], ns: 0, spool: [],
      tw: [], slotTw: new Array(I.slots.length).fill(null), tuid: 1,
      q: [], qi: 0,            // pending spawns [{ t, k, r, air, w }] sorted by t
      left: [],                // per wave: spawns pending + alive
      stats: { kills: 0, leaks: 0, early: 0, built: 0, boss: 0, earned: 0, spent: 0 },
      events: [], evN: 0,
      dirty: true,             // towers changed (buffs need a recount; the renderer redraws)
    };
    for (let i = 0; i < MAXE; i++) G.pool.push({ alive: false });
    for (let i = 0; i < MAXS; i++) G.spool.push({ alive: false });
    for (let i = 0; i < EVN; i++) G.events.push({ k: 0, x: 0, y: 0, x2: 0, y2: 0, a: 0, b: 0 });

    function ev(k, x, y, x2, y2, a, b) { const e = G.events[G.evN % EVN]; G.evN++; e.k = k; e.x = x; e.y = y; e.x2 = x2 || 0; e.y2 = y2 || 0; e.a = a || 0; e.b = b || 0; return e; }

    // ---------- towers
    function stats(t) {
      const D = TOWERS[t.type];
      return t.lv <= 3 ? D.lv[t.lv - 1] : D.br[t.br];
    }
    function nextCost(t, br) { const D = TOWERS[t.type]; if (t.lv < 3) return D.lv[t.lv].cost; if (t.lv === 3) return D.br[br || 'a'].cost; return Infinity; }
    function recount() {
      for (const t of G.tw) { t.bd = 0; t.brn = 0; }
      for (const b of G.tw) {
        if (b.type !== 'toolbox') continue;
        const s = stats(b);
        for (const t of G.tw) {
          if (t === b || t.type === 'toolbox') continue;
          const dx = t.x - b.x, dy = t.y - b.y;
          if (dx * dx + dy * dy <= s.range * s.range + 1e-6) { t.bd = Math.max(t.bd, s.bd); t.brn = Math.max(t.brn, s.br); }
        }
      }
      for (const t of G.tw) { const s = stats(t); t.s = s; t.range = (s.range || 0) * (1 + (t.brn || 0)); t.dmg = (s.dmg || 0) * (1 + (t.bd || 0)); }
      G.dirty = true;
    }
    function canBuild(slot, type) {
      const D = TOWERS[type];
      return !!D && !G.over && slot >= 0 && slot < I.slots.length && !G.slotTw[slot] && G.gold >= D.lv[0].cost && mods.ban !== type;
    }
    G.build = function (slot, type) {
      if (!canBuild(slot, type)) return null;
      const D = TOWERS[type], S = I.slots[slot], c = D.lv[0].cost;
      const t = { id: G.tuid++, type, slot, x: S.cx, y: S.cy, lv: 1, br: null, target: 'first', cd: 0.2, inv: c, kills: 0, aim: -Math.PI / 2, fire: 0, s: null, range: 0, dmg: 0, bd: 0, brn: 0, built: G.wave };
      G.gold -= c; G.stats.spent += c; G.stats.built++;
      G.tw.push(t); G.slotTw[slot] = t; recount();
      ev(10, t.x, t.y, 0, 0, t.id, 0);
      return t;
    };
    G.canUpgrade = function (t, br) { return !!t && !G.over && t.lv < 4 && (t.lv < 3 || br === 'a' || br === 'b') && G.gold >= nextCost(t, br); };
    G.upgrade = function (t, br) {
      if (!G.canUpgrade(t, br)) return false;
      const c = nextCost(t, br);
      G.gold -= c; G.stats.spent += c; t.inv += c;
      if (t.lv === 3) t.br = br;
      t.lv++; recount();
      ev(11, t.x, t.y, 0, 0, t.id, t.lv);
      return true;
    };
    G.sellValue = t => Math.floor(t.inv * SELL);
    G.sell = function (t) {
      const i = G.tw.indexOf(t); if (i < 0 || G.over) return 0;
      const v = G.sellValue(t);
      G.gold += v; G.tw.splice(i, 1); G.slotTw[t.slot] = null; recount();
      ev(12, t.x, t.y, 0, 0, t.id, v);
      return v;
    };
    G.setTarget = function (t, m) { if (t && TARGETS.includes(m)) { t.target = m; G.dirty = true; } };
    G.nextCost = nextCost; G.stats = G.stats; G.towerStats = stats;
    G.canBuild = canBuild;

    // ---------- waves
    G.earlyBonus = function () { return G.cd > 0 && G.wave > 0 ? Math.floor(G.cd) * (2 + (G.wave >> 2)) : 0; };
    G.canCall = function () { return !G.over && G.wave < G.total && (G.cd > 0 || (G.cd < 0 && G.qi >= G.q.length)); };
    G.callWave = function () {
      if (!G.canCall()) return false;
      const b = G.earlyBonus();
      if (b > 0) { G.gold += b; G.stats.early++; G.stats.earned += b; ev(21, 0, 0, 0, 0, b, 0); }
      startWave();
      return true;
    };
    G.groups = w => waveGroups(mi, w, mods);
    function startWave() {
      const w = G.wave++;
      const groups = waveGroups(mi, w, mods);
      let t0 = G.t + 0.4, gi = 0, n = 0;
      const nE = I.ent.length;
      const list = [];
      for (const g of groups) {
        const E = ENEMIES[g.k];
        const ent = g.ent >= 0 && g.ent < nE ? g.ent : gi % nE;
        for (let i = 0; i < g.n; i++) {
          list.push({ t: t0 + i * g.gap, k: g.k, ent, air: !!E.air, ai: (gi + i) % I.air.length, w });
          n++;
        }
        t0 += g.n * g.gap + 0.6; gi++;
      }
      // merge into the queue (keep it sorted by time; ties keep their order)
      const rest = G.q.slice(G.qi).concat(list);
      rest.sort((a, b) => a.t - b.t);
      G.q = rest; G.qi = 0;
      G.left[w] = (G.left[w] || 0) + n;
      G.cd = 0;
      ev(20, 0, 0, 0, 0, w, 0);
    }

    // ---------- enemies
    function spawnE(k, w, R, d, air) {
      if (G.ne >= MAXE) return null;
      let e = null;
      for (let i = 0; i < MAXE; i++) { const c = G.pool[(G.uid + i) % MAXE]; if (!c.alive) { e = c; break; } }
      if (!e) return null;
      const E = ENEMIES[k];
      const hs = (E.boss ? Math.pow(hpScale(mi, w), 0.7) : hpScale(mi, w)) * (mods.tough ? 1.25 : 1) * (mode === 'daily' ? 0.9 : 1);
      e.alive = true; e.uid = G.uid++; e.k = k; e.E = E; e.w = w;
      e.maxhp = E.hp * hs; e.hp = e.maxhp;
      e.armor = (E.armor || 0) + (mods.armor ? 2 : 0) + (E.armor ? Math.floor(w / 6) : 0);
      e.maxShield = (E.shield || 0) * hs; e.shield = e.maxShield; e.shT = 9;
      e.sp = E.sp * (mods.swift ? 1.15 : 1);
      e.slow = 0; e.slowT = 0; e.stun = 0; e.dot = 0; e.dotT = 0; e.flash = 0; e.healCd = 1; e.sumCd = E.summon || 0;
      e.R = R; e.d = d; e.si = 0; e.air = !!air; e.lives = E.lives || 1;
      e.bounty = Math.round(E.bounty * 1.6 * (1 + 0.02 * w));
      posAt(R, d, 0, out); e.x = out.x; e.y = out.y; e.si = out.si; e.dx = out.dx; e.dy = out.dy;
      G.en[G.ne++] = e;
      return e;
    }
    function routeFor(ent, air, ai) {
      if (air) return I.air[ai % I.air.length];
      const rs = I.ent[ent];
      return I.routes[rs.length > 1 ? rs[G.rng.int(rs.length)] : rs[0]];
    }
    function removeAt(i) { const e = G.en[i]; e.alive = false; G.ne--; G.en[i] = G.en[G.ne]; G.en[G.ne] = null; return e; }
    function waveDone(w) {
      G.left[w]--;
      if (G.left[w] === 0) {
        G.cleared++;
        const bonus = 12 + 3 * Math.min(w, 30);
        let bank = 0; for (const t of G.tw) if (t.type === 'toolbox' && t.br === 'b') bank += t.s.bank;
        G.gold += bonus + bank; G.stats.earned += bonus + bank;
        if (G.endless) G.score += Math.round(10 * (w + 1) * scoreMul);
        ev(22, 0, 0, 0, 0, w, bonus + bank);
      }
    }
    function damage(e, amt, pierce, shieldX, tw) {
      if (!e.alive || amt <= 0) return;
      e.shT = 0;
      if (e.shield > 0) {
        const s = amt * (shieldX || 1);
        if (s <= e.shield) { e.shield -= s; e.flash = 0.06; return; }
        amt = (s - e.shield) / (shieldX || 1); e.shield = 0;
        ev(32, e.x, e.y, 0, 0, 0, 0);
      }
      if (!pierce && e.armor > 0) amt = Math.max(amt * 0.2, amt - e.armor);
      e.hp -= amt; e.flash = 0.08;
      if (e.hp <= 0) kill(e, tw);
    }
    function kill(e, tw) {
      if (!e.alive) return;
      const i = G.en.indexOf(e);
      if (i < 0) return;
      removeAt(i);
      G.gold += e.bounty; G.stats.kills++; G.stats.earned += e.bounty;
      if (tw) tw.kills++;
      if (e.E.boss) G.stats.boss++;
      ev(30, e.x, e.y, 0, 0, ENEMY_KEYS.indexOf(e.k), e.bounty);
      if (e.E.split) {
        for (let j = 0; j < 2; j++) {
          const c = spawnE(e.E.split, e.w, e.R, Math.max(0, e.d - (j ? 0.25 : 0.05)), e.air);
          if (c) { G.left[e.w]++; c.stun = 0.15; }
        }
        ev(33, e.x, e.y, 0, 0, 0, 0);
      }
      waveDone(e.w);
    }
    G.damage = damage;

    // ---------- shots (pooled)
    function shot(kind, tw, tx, ty, e, dmg) {
      if (G.ns >= MAXS) return null;
      let s = null;
      for (let i = 0; i < MAXS; i++) { const c = G.spool[(G.evN + i) % MAXS]; if (!c.alive) { s = c; break; } }
      if (!s) return null;
      s.alive = true; s.kind = kind; s.tw = tw; s.x = tw.x; s.y = tw.y; s.sx = tw.x; s.sy = tw.y; s.tx = tx; s.ty = ty;
      s.e = e; s.uid = e ? e.uid : 0; s.dmg = dmg; s.t = 0; s.T = 0; s.vx = 0; s.vy = 0;
      G.sh[G.ns++] = s;
      return s;
    }
    function removeShot(i) { const s = G.sh[i]; s.alive = false; G.ns--; G.sh[i] = G.sh[G.ns]; G.sh[G.ns] = null; }
    function splash(x, y, r, dmg, pierce, tw, slow, dur, stun) {
      const r2 = r * r;
      for (let i = G.ne - 1; i >= 0; i--) {
        const e = G.en[i]; if (!e || e.air) continue;
        const dx = e.x - x, dy = e.y - y;
        if (dx * dx + dy * dy <= r2) {
          if (slow) applySlow(e, slow, dur);
          if (stun) applyStun(e, stun);
          damage(e, dmg, pierce, 1, tw);
        }
      }
    }
    function applySlow(e, s, dur) { s *= 1 - (e.E.slowRes || 0); if (s >= e.slow) { e.slow = s; e.slowT = Math.max(e.slowT, dur); } else if (e.slowT < dur * 0.5) { e.slowT = dur * 0.5; } }
    function applyStun(e, d) { e.stun = Math.max(e.stun, d * (e.E.boss ? 0.25 : 1)); }

    // ---------- targeting
    function pick(tw, wantAir, wantGround, skipSlowed) {
      const r2 = tw.range * tw.range;
      let best = null, bv = -Infinity, alt = null, av = -Infinity;
      for (let i = 0; i < G.ne; i++) {
        const e = G.en[i];
        if (e.air ? !wantAir : !wantGround) continue;
        const dx = e.x - tw.x, dy = e.y - tw.y, d2 = dx * dx + dy * dy;
        if (d2 > r2) continue;
        let v;
        if (tw.target === 'strong') v = e.hp + e.shield + (e.d / 1000);
        else if (tw.target === 'near') v = -d2;
        else v = e.d - e.R.len;
        if (skipSlowed && e.slowT > 0.6 && e.slow >= skipSlowed - 0.01) { if (v > av) { av = v; alt = e; } continue; }
        if (v > bv) { bv = v; best = e; }
      }
      return best || alt;
    }
    function pickMulti(tw, n, outArr) {
      outArr.length = 0;
      for (let k = 0; k < n; k++) {
        const r2 = tw.range * tw.range;
        let best = null, bv = -Infinity;
        for (let i = 0; i < G.ne; i++) {
          const e = G.en[i]; if (!e.air || outArr.indexOf(e) >= 0) continue;
          const dx = e.x - tw.x, dy = e.y - tw.y, d2 = dx * dx + dy * dy; if (d2 > r2) continue;
          const v = tw.target === 'strong' ? e.hp + e.shield : tw.target === 'near' ? -d2 : e.d - e.R.len;
          if (v > bv) { bv = v; best = e; }
        }
        if (!best) break;
        outArr.push(best);
      }
      return outArr;
    }
    const multi = [], chain = [];

    function fireTower(tw) {
      const s = tw.s, D = TOWERS[tw.type];
      if (D.kind === 'buff') return false;
      if (D.kind === 'copter' && s.multi) {
        pickMulti(tw, s.multi, multi);
        if (!multi.length) {
          if (s.groundToo) return false;
          return false;
        }
        for (const e of multi) { const p = shot(4, tw, e.x, e.y, e, tw.dmg); if (p) p.T = 0; }
        aimAt(tw, multi[0]);
        return true;
      }
      const wantAir = !!D.air, wantGround = !!D.ground || !!s.groundToo;
      const e = pick(tw, wantAir, wantGround, D.kind === 'glue' ? s.slow : 0);
      if (!e) return false;
      aimAt(tw, e);
      if (D.kind === 'shot') { shot(1, tw, e.x, e.y, e, tw.dmg); }
      else if (D.kind === 'ball') {
        const fl = 0.55;
        const v = e.stun > 0 ? 0 : e.sp * (1 - (e.slowT > 0 ? e.slow : 0));
        posAt(e.R, Math.min(e.R.len, e.d + v * fl), e.si, out);
        const p = shot(2, tw, out.x, out.y, null, tw.dmg); if (p) p.T = fl;
      } else if (D.kind === 'glue') { shot(3, tw, e.x, e.y, e, tw.dmg); }
      else if (D.kind === 'copter') { shot(4, tw, e.x, e.y, e, tw.dmg * (e.air ? 1 : s.groundToo)); }
      else if (D.kind === 'zap') zap(tw, e);
      return true;
    }
    function aimAt(tw, e) { tw.aim = Math.atan2(e.y - tw.y, e.x - tw.x); tw.fire = 0.12; }
    function zap(tw, first) {
      const s = tw.s;
      chain.length = 0; chain.push(first);
      let cur = first;
      for (let j = 0; j < s.jumps; j++) {
        let best = null, bd = 1.6 * 1.6;
        for (let i = 0; i < G.ne; i++) {
          const e = G.en[i]; if (e.air || chain.indexOf(e) >= 0) continue;
          const dx = e.x - cur.x, dy = e.y - cur.y, d2 = dx * dx + dy * dy;
          if (d2 < bd) { bd = d2; best = e; }
        }
        if (!best) break;
        chain.push(best); cur = best;
      }
      let px = tw.x, py = tw.y, dmg = tw.dmg;
      for (let j = 0; j < chain.length; j++) {
        const e = chain[j];
        ev(40, px, py, e.x, e.y, j, 0);
        px = e.x; py = e.y;
        if (s.stun) applyStun(e, s.stun);
        damage(e, dmg, false, s.shieldX, tw);
        dmg *= s.decay;
      }
    }

    // ---------- one tick
    G.step = function () {
      if (G.over) return;
      const dt = DT;
      G.t += dt;
      // spawns
      while (G.qi < G.q.length && G.q[G.qi].t <= G.t) {
        const q = G.q[G.qi++];
        const R = routeFor(q.ent, q.air, q.ai);
        if (!spawnE(q.k, q.w, R, 0, q.air)) G.left[q.w]--;
      }
      if (G.qi >= G.q.length && G.q.length) { G.q.length = 0; G.qi = 0; if (G.wave < G.total) G.cd = WAVE_GAP; }
      if (G.cd > 0) { G.cd -= dt; if (G.cd <= 0) { G.cd = 0; startWave(); } }
      // enemies
      for (let i = G.ne - 1; i >= 0; i--) {
        const e = G.en[i];
        if (e.flash > 0) e.flash -= dt;
        if (e.slowT > 0) { e.slowT -= dt; if (e.slowT <= 0) e.slow = 0; }
        if (e.dotT > 0) { e.dotT -= dt; damage(e, e.dot * dt, true, 1, null); if (!e.alive) continue; }
        if (e.maxShield > 0) { e.shT += dt; if (e.shT > 2.5 && e.shield < e.maxShield) e.shield = Math.min(e.maxShield, e.shield + e.maxShield * 0.3 * dt); }
        if (e.E.heal) {
          e.healCd -= dt;
          if (e.healCd <= 0) {
            e.healCd = 1;
            const r2 = e.E.healR * e.E.healR;
            for (let j = 0; j < G.ne; j++) { const o2 = G.en[j]; if (o2.air !== e.air) continue; const dx = o2.x - e.x, dy = o2.y - e.y; if (dx * dx + dy * dy <= r2 && o2.hp < o2.maxhp) o2.hp = Math.min(o2.maxhp, o2.hp + o2.maxhp * e.E.heal); }
            ev(34, e.x, e.y, 0, 0, 0, 0);
          }
        }
        if (e.sumCd > 0) {
          e.sumCd -= dt;
          if (e.sumCd <= 0) { e.sumCd = e.E.summon; for (let j = 0; j < 2; j++) { const c = spawnE(j ? 'f' : 'b', e.w, e.R, Math.max(0, e.d - 0.3 - j * 0.3), false); if (c) G.left[e.w]++; } ev(35, e.x, e.y, 0, 0, 0, 0); }
        }
        if (e.stun > 0) { e.stun -= dt; continue; }
        e.d += e.sp * (1 - e.slow) * dt;
        if (e.d >= e.R.len) {
          removeAt(i);
          G.lives -= e.lives; G.stats.leaks += e.lives;
          ev(31, e.x, e.y, 0, 0, ENEMY_KEYS.indexOf(e.k), e.lives);
          waveDone(e.w);
          if (G.lives <= 0) { G.lives = 0; finish(false); return; }
          continue;
        }
        posAt(e.R, e.d, e.si, out); e.x = out.x; e.y = out.y; e.si = out.si; e.dx = out.dx; e.dy = out.dy;
      }
      // towers
      for (let i = 0; i < G.tw.length; i++) {
        const tw = G.tw[i];
        if (tw.fire > 0) tw.fire -= dt;
        if (tw.cd > 0) { tw.cd -= dt; continue; }
        if (fireTower(tw)) tw.cd += 1 / tw.s.rate; else tw.cd = 0.05;
      }
      // shots
      for (let i = G.ns - 1; i >= 0; i--) {
        const s = G.sh[i];
        s.t += dt;
        if (s.kind === 2) { // lobbed: lands at the aimed point
          const f = Math.min(1, s.t / s.T);
          s.x = s.sx + (s.tx - s.sx) * f; s.y = s.sy + (s.ty - s.sy) * f;
          if (f >= 1) { const st = s.tw.s; splash(s.tx, s.ty, st.splash, s.dmg, false, s.tw, 0, 0, st.stun || 0); ev(41, s.tx, s.ty, 0, 0, st.splash * 100, 0); removeShot(i); }
          continue;
        }
        let e = s.e;
        if (e && (!e.alive || e.uid !== s.uid)) {
          e = null; s.e = null;
          if (s.kind === 4) { // copters look for a new target
            const tw = s.tw; const n = pick({ x: s.x, y: s.y, range: 2.5, target: 'near' }, true, !!(tw.s && tw.s.groundToo), 0);
            if (n) { s.e = e = n; s.uid = n.uid; }
          }
        }
        if (e) { s.tx = e.x; s.ty = e.y; }
        const sp = s.kind === 1 ? 13 : s.kind === 3 ? 8 : 7.5;
        const dx = s.tx - s.x, dy = s.ty - s.y, dist = Math.sqrt(dx * dx + dy * dy), stp = sp * dt;
        if (dist <= stp + 0.12) {
          if (e) {
            const st = s.tw.s;
            if (s.kind === 3) {
              if (st.splash) splash(e.x, e.y, st.splash, s.dmg, false, s.tw, st.slow, st.dur, 0);
              else { applySlow(e, st.slow, st.dur); if (st.dot) { e.dot = Math.max(e.dot, st.dot * (1 + (s.tw.bd || 0))); e.dotT = st.dur; } damage(e, s.dmg, false, 1, s.tw); }
              ev(43, e.x, e.y, 0, 0, 0, 0);
            } else {
              damage(e, s.dmg, !!st.pierce, st.shieldX || 1, s.tw);
              ev(42, s.tx, s.ty, 0, 0, s.kind, 0);
            }
          }
          removeShot(i);
          continue;
        }
        if (s.t > 3) { removeShot(i); continue; }
        s.vx = dx / dist; s.vy = dy / dist;
        s.x += s.vx * stp; s.y += s.vy * stp;
      }
      if (!G.endless && G.wave >= G.total && G.qi >= G.q.length && G.ne === 0 && G.q.length === 0) finish(true);
    };
    function finish(won) {
      if (G.over) return;
      G.over = true; G.won = won;
      G.stars = won ? (G.lives >= 18 ? 3 : G.lives >= 10 ? 2 : 1) : 0;
      ev(won ? 50 : 51, 0, 0, 0, 0, 0, 0);
    }
    G.quiet = () => !G.over && G.ne === 0 && G.qi >= G.q.length;
    G.forceWin = () => { for (let i = G.ne - 1; i >= 0; i--) removeAt(i); G.q.length = 0; G.qi = 0; if (G.endless) { finish(false); } else { G.wave = G.total; finish(true); } };
    G.forceLose = () => { G.lives = 0; finish(false); };
    G.snapshot = function () {
      return { v: 1, map: mi, mode, mods, gold: G.gold, lives: G.lives, wave: G.wave, cleared: G.cleared, score: G.score, rng: G.rng.s, t: Math.round(G.t * 10) / 10,
        towers: G.tw.map(t => [t.type, t.slot, t.lv, t.br, TARGETS.indexOf(t.target), t.inv, t.kills, t.built]), stats: Object.assign({}, G.stats) };
    };
    G.preview = function (w) { // the groups of wave w, merged by type, in order
      if (w >= G.total) return [];
      const g = waveGroups(mi, w, mods), m = [];
      for (const x of g) { const f = m.find(y => y.k === x.k); if (f) f.n += x.n; else m.push({ k: x.k, n: x.n }); }
      return m;
    };
    G.slotAt = function (x, y, r) { // nearest slot within r tiles
      let best = -1, bd = r * r;
      for (let i = 0; i < I.slots.length; i++) { const s = I.slots[i], dx = s.cx - x, dy = s.cy - y, d2 = dx * dx + dy * dy; if (d2 < bd) { bd = d2; best = i; } }
      return best;
    };

    if (snap) {
      G.gold = snap.gold | 0; G.lives = snap.lives | 0; G.wave = snap.wave | 0; G.cleared = snap.cleared | 0; G.score = snap.score | 0;
      G.rng.s = snap.rng >>> 0; G.t = +snap.t || 0;
      Object.assign(G.stats, snap.stats || {});
      for (let w = 0; w < G.wave; w++) G.left[w] = 0;
      for (const a of snap.towers || []) {
        const [type, slot, lv, br, tg, inv, kills, built] = a;
        if (!TOWERS[type] || slot < 0 || slot >= I.slots.length || G.slotTw[slot]) continue;
        const S = I.slots[slot];
        const t = { id: G.tuid++, type, slot, x: S.cx, y: S.cy, lv: Math.max(1, Math.min(4, lv | 0)), br: lv >= 4 ? (br === 'b' ? 'b' : 'a') : null, target: TARGETS[tg] || 'first', cd: 0.2, inv: inv | 0, kills: kills | 0, aim: -Math.PI / 2, fire: 0, s: null, range: 0, dmg: 0, bd: 0, brn: 0, built: built | 0 };
        G.tw.push(t); G.slotTw[slot] = t;
      }
      recount();
      G.cd = -1;
    } else recount();
    return G;
  }

  // ------------------------------------------------------------------ the auto-player
  // plan: {} = a reasonable mixed strategy (what a careful first-time player does: mix the towers, answer flyers with
  //       copters, slow with glue, put a toolbox among the others, keep building early and upgrade later);
  //       { only: 'nail', br: 'a' } = spam one tower type (the balance check: this must not be enough);
  //       { early: true } also calls waves early when the field is calm.
  function bot(G, plan) {
    plan = plan || {};
    const I = G.I;
    const covCache = {};
    function cov(si, range, air) {
      const key = si + ':' + range.toFixed(2) + ':' + (air ? 1 : 0);
      if (key in covCache) return covCache[key];
      const S = I.slots[si];
      let c = 0;
      if (air) {
        for (const R of I.air) for (let d = 0; d < R.len; d += 0.25) { const o = posAt(R, d, 0, {}); if ((o.x - S.cx) ** 2 + (o.y - S.cy) ** 2 <= range * range) c++; }
        c = c * 0.25 / I.air.length;
      } else {
        const sm = I.samples;
        for (let i = 0; i < sm.length; i += 3) { const dx = sm[i] - S.cx, dy = sm[i + 1] - S.cy; if (dx * dx + dy * dy <= range * range) c++; }
        c = c * 0.25 / I.routes.length;
      }
      return (covCache[key] = c);
    }
    function threat() {
      let hp = 0, air = 0, arm = 0, sh = 0;
      for (let w = G.wave; w < Math.min(G.total, G.wave + 2); w++) for (const g of G.groups(w)) {
        const E = ENEMIES[g.k], h = E.hp * g.n * (E.split ? 1.9 : 1) * (w === G.wave ? 1 : 0.5);
        hp += h; if (E.air) air += h; arm += h * (E.armor || 0); sh += (E.shield || 0) * g.n;
      }
      hp = hp || 1;
      return { air: air / hp, armor: arm / hp, shield: sh / hp };
    }
    const CYCLE = ['nail', 'spring', 'nail', 'coil', 'glue', 'spring', 'nail', 'coil', 'spring', 'nail', 'glue', 'coil', 'spring'];
    let ci = 0;
    function count(type) { let n = 0; for (const t of G.tw) if (t.type === type) n++; return n; }
    function bestSlot(type) {
      const D = TOWERS[type], s = D.lv[0];
      let best = -1, bv = -1;
      for (let si = 0; si < I.slots.length; si++) {
        if (G.slotTw[si]) continue;
        let v;
        if (type === 'toolbox') { v = 0; const S = I.slots[si]; for (const o of G.tw) if (o.type !== 'toolbox' && (o.x - S.cx) ** 2 + (o.y - S.cy) ** 2 <= s.range * s.range) v += o.inv; }
        else if (type === 'copter') v = cov(si, s.range, true) + 0.2 * cov(si, s.range, false);
        else v = cov(si, s.range, false) + (D.air ? 0.3 * cov(si, s.range, true) : 0);
        if (v > bv) { bv = v; best = si; }
      }
      return bv > 0 ? best : -1;
    }
    function nextType(th) {
      if (plan.only) return plan.only;
      const n = G.tw.length;
      const anti = count('copter') * 2 + count('nail') * 0.5;
      if (th.air > 0.12 && n >= 2 && anti < 1 + th.air * 8 && !(G.mods.ban === 'copter')) return 'copter';
      if (n >= 6 && G.wave >= 5 && count('toolbox') < Math.floor(n / 6)) return 'toolbox';
      for (let g = 0; g < CYCLE.length && G.mods.ban === CYCLE[ci % CYCLE.length]; g++) ci++;
      return CYCLE[ci % CYCLE.length];
    }
    function branch(t, th) {
      if (plan.br) return plan.br;
      if (t.type === 'nail') return th.armor > 2.5 ? 'b' : 'a';
      if (t.type === 'coil') return th.shield > 0.25 ? 'b' : 'a';
      if (t.type === 'copter') return 'a';
      if (t.type === 'glue') return 'a';
      return 'a';
    }
    let wait = 0;
    return {
      think() {
        if (G.over) return null;
        if (wait > 0) { wait--; return null; }
        wait = 6;
        const th = threat();
        let did = null;
        for (let k = 0; k < 3; k++) {
          const want = 2 + Math.floor(G.wave * 0.8);
          let act = null;
          const free = I.slots.some((s, i) => !G.slotTw[i]);
          if ((G.tw.length < want && free) || !G.tw.length) {
            const type = nextType(th), slot = bestSlot(type);
            if (slot >= 0) act = { a: 'build', type, slot, cost: TOWERS[type].lv[0].cost };
          }
          if (!act) { // upgrade: the lowest level first, the most covering among them
            let bt = null, bk = Infinity;
            for (const t of G.tw) {
              if (t.lv >= 4) continue;
              const key = t.lv * 4 - cov(t.slot, t.range || 1, t.type === 'copter') + (t.type === 'toolbox' ? 3 : 0) + (t.type === 'glue' && t.lv >= 3 ? 6 : 0);
              if (key < bk) { bk = key; bt = t; }
            }
            if (bt) { const br = bt.lv === 3 ? branch(bt, th) : undefined; act = { a: 'up', t: bt, br, cost: G.nextCost(bt, br) }; }
            else if (free) { const type = nextType(th), slot = bestSlot(type); if (slot >= 0) act = { a: 'build', type, slot, cost: TOWERS[type].lv[0].cost }; }
          }
          if (!act || act.cost > G.gold) break;
          if (act.a === 'build') { if (G.build(act.slot, act.type)) { did = act; if (!plan.only && act.type === CYCLE[ci % CYCLE.length]) ci++; } else break; }
          else if (G.upgrade(act.t, act.br)) did = act; else break;
        }
        if (G.cd < 0 && G.canCall() && (G.tw.length || G.gold < 50)) G.callWave();
        else if (plan.early && G.cd > 0 && G.ne < 3) G.callWave();
        return did;
      },
    };
  }
  // play a whole game headless; returns the result
  function simulate(o) {
    const G = create(o);
    const B = bot(G, o.plan);
    let n = 0;
    const max = (o.maxSeconds || 3600) / DT;
    while (!G.over && n < max) { if (n % 3 === 0) B.think(); G.step(); n++; if (o.maxWaves && G.cleared >= o.maxWaves) break; }
    return { won: G.won, over: G.over, lives: G.lives, stars: G.stars, wave: G.wave, cleared: G.cleared, score: G.score, gold: G.gold, towers: G.tw.map(t => t.type + t.lv + (t.br || '')), t: Math.round(G.t), stats: G.stats };
  }

  const TD = { TUNE, DT, COLS, ROWS, START_LIVES, WAVE_GAP, TOWERS, TOWER_IDS, TARGETS, ENEMIES, ENEMY_KEYS, MAPS, MODS, MOD_IDS, create, bot, simulate, mapInfo, posAt, hpScale, waveGroups, dailySetup, modMul, hash32, Rng };
  if (typeof module !== 'undefined' && module.exports) module.exports = TD;
  else root.TDEngine = TD;
})(typeof self !== 'undefined' ? self : this);
