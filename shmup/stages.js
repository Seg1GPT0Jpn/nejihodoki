// ペーパーウイング (Paper Wing) - data: the junk fleet (enemies), the seven bosses and the seven stage scripts. Pure data + a script builder; no DOM.
// Everything is original: a squadron of toy paper planes against a rusty junk fleet.
(function (root) {
  'use strict';
  const W = 480, H = 270;

  // Difficulty: bsp = bullet speed, dens = bullet count, ehp = enemy hp, sc = score multiplier, ret = ghost fires back when an enemy dies
  const DIFF = [
    { id: 'easy', ja: 'やさしい', en: 'Easy', bsp: 0.72, dens: 0.6, ehp: 0.8, lives: 4, bombs: 4, cont: 5, sc: 0.6, ret: 0 },
    { id: 'normal', ja: 'ふつう', en: 'Normal', bsp: 1, dens: 1, ehp: 1, lives: 3, bombs: 3, cont: 3, sc: 1, ret: 0 },
    { id: 'hard', ja: 'むずかしい', en: 'Hard', bsp: 1.2, dens: 1.35, ehp: 1.1, lives: 3, bombs: 2, cont: 1, sc: 1.4, ret: 0 },
    { id: 'ghost', ja: 'ゆうれい', en: 'Ghost', bsp: 1.38, dens: 1.7, ehp: 1.2, lives: 2, bombs: 2, cont: 0, sc: 1.8, ret: 1 },
  ];

  // Daily modifiers (scoped by seed). Each tweaks the sim through S.m
  const MODS = {
    fast: { ja: 'はやだま', en: 'Quick Shots', bsp: 1.2, sm: 1.15 },
    dense: { ja: 'たまだらけ', en: 'Bullet Storm', dens: 1.3, sm: 1.2 },
    tough: { ja: 'かたいてき', en: 'Tough Junk', ehp: 1.4, sm: 1.1 },
    glass: { ja: 'ひとつきり', en: 'One Life', lives: 1, bombs: 2, sm: 1.4 },
    tiny: { ja: 'ちいさな芯', en: 'Tiny Core', hit: 0.6, sm: 0.9 },
    big: { ja: 'おおきな芯', en: 'Big Core', hit: 1.5, sm: 1.3 },
    nofocus: { ja: 'ゆっくり禁止', en: 'No Slow Mode', nofocus: 1, sm: 1.25 },
    rich: { ja: 'フル装備', en: 'Fully Loaded', power: 3, opt: 2, speed: 2, sm: 0.8 },
    swarm: { ja: 'ぞろぞろ', en: 'Swarm', thin: 0.7, sm: 1.2 },
    lucky: { ja: 'おまもり', en: 'Charmed', shield: 2, sm: 0.85 },
  };

  // ---------------------------------------------------------------- the junk fleet
  // mv: movement kind + params (see engine.moveEnemy). fire: patterns (see engine.PAT). cyc [period,on] = only while (t % period) < on.
  const EN = {
    rivet: { hp: 2, r: 7, sc: 100, mv: { k: 'line', vx: -1.7 } },
    gull: { hp: 3, r: 8, sc: 160, mv: { k: 'sine', vx: -1.2, amp: 36, fq: 0.045 }, fire: [{ p: 'aimed', at: 60, ev: 100, n: 1, sp: 1.7 }] },
    bolt: { hp: 2, r: 6, sc: 140, mv: { k: 'dive', vx: -2.2, vy: 1.3 } },
    pod: { hp: 9, r: 11, sc: 400, mv: { k: 'sine', vx: -0.8, amp: 16, fq: 0.03 }, drop: 1 },
    spring: { hp: 5, r: 8, sc: 220, mv: { k: 'bounce', vx: -0.9, vy: 1.8 }, fire: [{ p: 'ring', at: 50, ev: 110, n: 6, sp: 1.3 }] },
    gear: { hp: 16, r: 13, sc: 600, mv: { k: 'hover', vx: -1.4, hold: 360, lv: -1.2 }, fire: [{ p: 'spiral', at: 30, ev: 5, arms: 2, sp: 1.5, step: 0.19, cyc: [110, 60] }] },
    turret: { hp: 6, r: 8, sc: 200, mv: { k: 'stat', vx: -0.9 }, fire: [{ p: 'aimed', at: 40, ev: 80, n: 3, sprd: 0.16, sp: 1.8 }] },
    kettle: { hp: 18, r: 13, sc: 700, mv: { k: 'hover', vx: -1.3, hold: 320, lv: -1 }, fire: [{ p: 'curtain', at: 60, ev: 120, sp: 1.5, gap: 20, hole: 3 }] },
    magnet: { hp: 12, r: 11, sc: 500, mv: { k: 'hover', vx: -1.3, hold: 300, lv: -1 }, fire: [{ p: 'homing', at: 50, ev: 150, n: 2, sp: 1.5, turn: 0.03, life: 200 }] },
    lamp: { hp: 14, r: 11, sc: 650, mv: { k: 'hover', vx: -1.5, hold: 420, lv: -1 }, fire: [{ p: 'laser', at: 60, ev: 200, tele: 45, dur: 35, w: 7 }] },
    spool: { hp: 3, r: 7, sc: 130, mv: { k: 'sine', vx: -1.5, amp: 46, fq: 0.07 }, fire: [{ p: 'aimed', at: 40, ev: 140, n: 1, sp: 1.5 }] },
    umbrella: { hp: 4, r: 9, sc: 180, mv: { k: 'dive', vx: -2.6, vy: 0.4 }, fire: [{ p: 'aimed', at: 20, ev: 0, n: 3, sprd: 0.25, sp: 2 }] },
    crab: { hp: 42, r: 16, sc: 1500, mv: { k: 'hover', vx: -1, hold: 600, lv: -0.8 }, fire: [{ p: 'aimed', at: 40, ev: 90, n: 5, sprd: 0.2, sp: 1.8 }, { p: 'ring', at: 100, ev: 200, n: 14, sp: 1.2 }] },
    prop: { hp: 4, r: 8, sc: 200, mv: { k: 'loop', vx: -0.7, R: 44, w: 0.06 }, fire: [{ p: 'aimed', at: 50, ev: 110, n: 1, sp: 1.8 }] },
    mine: { hp: 6, r: 9, sc: 250, mv: { k: 'line', vx: -0.8 }, death: { p: 'ring', n: 10, sp: 1.4 } },
    cannon: { hp: 160, r: 20, sc: 5000, mid: 1, mv: { k: 'hover', vx: -1.2, hold: 1200, lv: -1 }, fire: [{ p: 'aimed', at: 40, ev: 70, n: 3, sprd: 0.2, sp: 2 }, { p: 'ring', at: 120, ev: 220, n: 18, sp: 1.3, rot: 0.2 }, { p: 'curtain', at: 200, ev: 300, sp: 1.6, gap: 18, hole: 3 }] },
    jelly: { hp: 8, r: 10, sc: 260, mv: { k: 'sine', vx: -0.7, amp: 14, fq: 0.03 }, fire: [{ p: 'rain', at: 40, ev: 30, n: 1, sp: 1.6 }] },
    icicle: { hp: 5, r: 7, sc: 200, mv: { k: 'fall' } },
    rocket: { hp: 3, r: 6, sc: 180, mv: { k: 'dive', vx: -3, vy: 0 }, fire: [{ p: 'ring', at: 55, ev: 0, n: 12, sp: 1.4, die: 1 }] },
    wisp: { hp: 6, r: 9, sc: 320, mv: { k: 'sine', vx: -1.6, amp: 70, fq: 0.03 }, fire: [{ p: 'aimed', at: 30, ev: 70, n: 2, sprd: 0.4, sp: 1.4 }] },
    wasp: { hp: 4, r: 7, sc: 200, mv: { k: 'kami' } },
  };
  const EN_IDS = Object.keys(EN);

  // ---------------------------------------------------------------- the seven bosses (3 phases each, the king has 4)
  const sw = (tx, A, w) => ({ k: 'sway', tx, A, w });
  const BOSS = [
    { id: 'tin', ja: 'ブリキ大将', en: 'Tin General', r: 26, hp: [420, 520, 620], sc: 30000, ph: [
      { ja: 'ぜんしん！', en: 'Full March', mv: sw(370, 60, 0.018), atk: [{ p: 'aimed', at: 40, ev: 70, n: 3, sprd: 0.2, sp: 1.9 }, { p: 'ring', at: 90, ev: 160, n: 10, sp: 1.3 }] },
      { ja: 'ぜんそくぜんしん', en: 'Wind-up Frenzy', mv: sw(360, 80, 0.026), atk: [{ p: 'spiral', at: 30, ev: 6, arms: 2, sp: 1.6, step: 0.17, cyc: [180, 100] }, { p: 'aimed', at: 40, ev: 90, n: 5, sprd: 0.16, sp: 2 }] },
      { ja: 'ネジきれ', en: 'Spring Snap', mv: sw(350, 90, 0.032), atk: [{ p: 'curtain', at: 50, ev: 130, sp: 1.7, gap: 18, hole: 3 }, { p: 'ring', at: 80, ev: 120, n: 16, sp: 1.4, rot: 0.17 }, { p: 'aimed', at: 60, ev: 60, n: 1, sp: 2.4 }] },
    ] },
    { id: 'crane', ja: 'クレーンじいさん', en: 'Old Crane Hulk', r: 28, hp: [560, 680, 800], sc: 40000, ph: [
      { ja: 'つりばり', en: 'Hook Drop', mv: sw(380, 70, 0.02), atk: [{ p: 'rain', at: 30, ev: 14, n: 2, sp: 2 }, { p: 'aimed', at: 60, ev: 90, n: 3, sprd: 0.22, sp: 1.9 }] },
      { ja: 'ワイヤーなぎ', en: 'Wire Sweep', mv: sw(370, 80, 0.024), atk: [{ p: 'laser', at: 50, ev: 170, tele: 50, dur: 40, w: 8, sweep: 0.012 }, { p: 'ring', at: 100, ev: 140, n: 12, sp: 1.4 }] },
      { ja: 'おもりの雨', en: 'Ballast Rain', mv: sw(360, 90, 0.03), atk: [{ p: 'rain', at: 20, ev: 10, n: 2, sp: 2.2 }, { p: 'curtain', at: 80, ev: 150, sp: 1.7, gap: 18, hole: 3 }, { p: 'homing', at: 120, ev: 200, n: 2, sp: 1.6, turn: 0.03, life: 220 }] },
    ] },
    { id: 'heap', ja: 'ガラクタ巨人', en: 'Junk Colossus', r: 32, hp: [700, 800, 950], sc: 50000, ph: [
      { ja: 'がれきの腕', en: 'Rubble Arms', mv: sw(380, 60, 0.016), atk: [{ p: 'ring', at: 40, ev: 100, n: 14, sp: 1.4, rot: 0.13 }, { p: 'aimed', at: 70, ev: 80, n: 3, sprd: 0.25, sp: 2 }] },
      { ja: 'ホーミングくず', en: 'Homing Scrap', mv: sw(370, 80, 0.022), atk: [{ p: 'homing', at: 40, ev: 110, n: 3, sp: 1.7, turn: 0.035, life: 240 }, { p: 'curtain', at: 90, ev: 160, sp: 1.7, gap: 17, hole: 3 }] },
      { ja: 'くずれおちる', en: 'Collapse', mv: sw(350, 95, 0.03), atk: [{ p: 'spiral', at: 30, ev: 5, arms: 3, sp: 1.6, step: 0.15, cyc: [200, 120] }, { p: 'rain', at: 60, ev: 20, n: 2, sp: 2.1 }, { p: 'aimed', at: 50, ev: 70, n: 1, sp: 2.6 }] },
    ] },
    { id: 'gearq', ja: '歯車の女王', en: 'Gear Queen', r: 28, hp: [850, 950, 1100], sc: 60000, ph: [
      { ja: 'まわるおどり', en: 'Spinning Waltz', mv: sw(370, 70, 0.02), atk: [{ p: 'spiral', at: 30, ev: 5, arms: 4, sp: 1.5, step: 0.12, cyc: [220, 140] }, { p: 'aimed', at: 60, ev: 100, n: 5, sprd: 0.18, sp: 1.9 }] },
      { ja: 'ギアレーザー', en: 'Gear Lasers', mv: sw(360, 85, 0.024), atk: [{ p: 'laser', at: 40, ev: 130, tele: 45, dur: 35, w: 8 }, { p: 'laser', at: 100, ev: 190, tele: 45, dur: 35, w: 8 }, { p: 'ring', at: 80, ev: 150, n: 16, sp: 1.4, rot: 0.2 }] },
      { ja: 'ぜんぶ回せ', en: 'Everything Turns', mv: sw(350, 100, 0.03), atk: [{ p: 'spiral', at: 20, ev: 4, arms: 3, sp: 1.8, step: 0.21, cyc: [160, 90] }, { p: 'curtain', at: 80, ev: 140, sp: 1.8, gap: 17, hole: 3 }, { p: 'homing', at: 60, ev: 220, n: 2, sp: 1.8, turn: 0.04, life: 240 }] },
    ] },
    { id: 'snow', ja: 'ゆきだるまロボ', en: 'Snow Robo', r: 30, hp: [950, 1100, 1250], sc: 70000, ph: [
      { ja: 'つららのあめ', en: 'Icicle Shower', mv: sw(380, 70, 0.02), atk: [{ p: 'rain', at: 20, ev: 8, n: 2, sp: 2.4 }, { p: 'aimed', at: 60, ev: 80, n: 3, sprd: 0.2, sp: 2 }] },
      { ja: 'ふぶき', en: 'Blizzard', mv: sw(365, 85, 0.026), atk: [{ p: 'curtain', at: 40, ev: 110, sp: 1.9, gap: 16, hole: 3 }, { p: 'ring', at: 70, ev: 130, n: 20, sp: 1.3, rot: 0.15 }] },
      { ja: 'ゆきだま大決戦', en: 'Great Snowball Fight', mv: sw(350, 100, 0.032), atk: [{ p: 'spiral', at: 20, ev: 5, arms: 3, sp: 1.8, step: 0.17, cyc: [180, 100] }, { p: 'aimed', at: 40, ev: 50, n: 1, sp: 2.8 }, { p: 'rain', at: 100, ev: 14, n: 2, sp: 2.3 }] },
    ] },
    { id: 'carousel', ja: 'まよなかのメリーゴーランド', en: 'Midnight Carousel', r: 30, hp: [1100, 1250, 1400], sc: 80000, ph: [
      { ja: 'まわるうま', en: 'Galloping Ring', mv: sw(375, 75, 0.022), atk: [{ p: 'ring', at: 30, ev: 70, n: 12, sp: 1.5, rot: 0.26 }, { p: 'aimed', at: 60, ev: 90, n: 3, sprd: 0.22, sp: 2 }] },
      { ja: 'ひとだまパレード', en: 'Wisp Parade', mv: sw(360, 90, 0.028), atk: [{ p: 'homing', at: 30, ev: 90, n: 3, sp: 1.7, turn: 0.04, life: 260 }, { p: 'spiral', at: 40, ev: 6, arms: 3, sp: 1.6, step: 0.2, cyc: [200, 100] }] },
      { ja: 'おわらない夜', en: 'Endless Night', mv: sw(350, 105, 0.034), atk: [{ p: 'laser', at: 40, ev: 150, tele: 40, dur: 35, w: 8 }, { p: 'ring', at: 70, ev: 100, n: 18, sp: 1.6, rot: 0.19 }, { p: 'curtain', at: 90, ev: 170, sp: 1.9, gap: 16, hole: 3 }, { p: 'aimed', at: 40, ev: 60, n: 1, sp: 2.8 }] },
    ] },
    { id: 'king', ja: 'ジャンク大王', en: 'Junk King', r: 34, hp: [1200, 1350, 1500, 1800], sc: 150000, ph: [
      { ja: 'おうさまのごあいさつ', en: 'Royal Greeting', mv: sw(380, 70, 0.02), atk: [{ p: 'aimed', at: 40, ev: 60, n: 5, sprd: 0.18, sp: 2 }, { p: 'ring', at: 80, ev: 120, n: 16, sp: 1.5, rot: 0.15 }] },
      { ja: 'がらくた行進', en: 'Scrap Parade', mv: sw(365, 90, 0.026), atk: [{ p: 'homing', at: 30, ev: 100, n: 3, sp: 1.8, turn: 0.04, life: 260 }, { p: 'curtain', at: 70, ev: 130, sp: 1.8, gap: 16, hole: 3 }, { p: 'rain', at: 50, ev: 22, n: 2, sp: 2.2 }] },
      { ja: 'おうごんの歯車', en: 'Golden Gears', mv: sw(355, 100, 0.03), atk: [{ p: 'spiral', at: 20, ev: 4, arms: 4, sp: 1.7, step: 0.14, cyc: [220, 130] }, { p: 'laser', at: 60, ev: 180, tele: 45, dur: 35, w: 8 }, { p: 'aimed', at: 40, ev: 80, n: 3, sprd: 0.2, sp: 2.4 }] },
      { ja: 'ジャンク大王の逆襲', en: 'The Junk King Strikes Back', mv: sw(345, 110, 0.036), atk: [{ p: 'spiral', at: 20, ev: 5, arms: 3, sp: 1.9, step: 0.19, cyc: [180, 110] }, { p: 'ring', at: 60, ev: 90, n: 20, sp: 1.6, rot: 0.17 }, { p: 'curtain', at: 90, ev: 150, sp: 2, gap: 16, hole: 3 }, { p: 'homing', at: 70, ev: 170, n: 2, sp: 2, turn: 0.045, life: 260 }, { p: 'aimed', at: 40, ev: 50, n: 1, sp: 3 }] },
    ] },
  ];

  // ---------------------------------------------------------------- stages
  // sec: [from, to, gap, pool]  pool: [type, form, n, weight]   fix: [t, type, form, n, y]   len = frames until the boss arrives
  const STAGES = [
    { id: 0, ja: 'おもちゃ箱の空', en: 'Toy Box Sky', len: 3000, boss: 0, bg: 'toysky', sec: [
      [0, 900, 130, [['rivet', 'line', 4, 3], ['gull', 'snake', 4, 2]]],
      [900, 2000, 115, [['rivet', 'line', 5, 2], ['gull', 'snake', 4, 2], ['bolt', 'pincer', 4, 2], ['spring', 'single', 1, 1]]],
      [2000, 2900, 105, [['gull', 'snake', 5, 2], ['bolt', 'pincer', 4, 2], ['turret', 'single', 1, 1], ['spring', 'single', 1, 1]]],
    ], fix: [[420, 'pod', 'single', 1, 135], [1300, 'pod', 'single', 1, 80], [1900, 'pod', 'single', 1, 190], [2500, 'pod', 'single', 1, 135]] },
    { id: 1, ja: 'さびた港', en: 'Rusty Harbor', len: 3300, boss: 1, bg: 'harbor', sec: [
      [0, 1000, 110, [['umbrella', 'vee', 5, 2], ['gull', 'snake', 5, 2], ['mine', 'single', 1, 1]]],
      [1000, 2200, 100, [['umbrella', 'vee', 5, 2], ['wasp', 'rand', 3, 2], ['mine', 'single', 1, 1], ['magnet', 'single', 1, 1]]],
      [2200, 3200, 95, [['wasp', 'rand', 4, 2], ['bolt', 'pincer', 6, 2], ['magnet', 'single', 1, 1], ['turret', 'single', 1, 1]]],
    ], fix: [[350, 'pod', 'single', 1, 100], [1400, 'pod', 'single', 1, 170], [2100, 'pod', 'single', 1, 80], [2800, 'pod', 'single', 1, 190]] },
    { id: 2, ja: 'ガラクタやま', en: 'Scrap Mountain', len: 3500, boss: 2, bg: 'scrap', sec: [
      [0, 1100, 105, [['spool', 'snake', 6, 2], ['prop', 'single', 1, 2], ['turret', 'single', 1, 2]]],
      [1100, 2300, 100, [['gear', 'single', 1, 2], ['prop', 'col', 3, 1], ['spool', 'snake', 6, 2], ['mine', 'single', 1, 1]]],
      [2300, 3400, 95, [['crab', 'single', 1, 1], ['gear', 'single', 1, 2], ['prop', 'col', 3, 2], ['umbrella', 'vee', 5, 1]]],
    ], fix: [[300, 'pod', 'single', 1, 135], [1500, 'pod', 'single', 1, 70], [2200, 'pod', 'single', 1, 200], [3000, 'pod', 'single', 1, 135]] },
    { id: 3, ja: '雲の上の工場', en: 'Cloud Factory', len: 3700, boss: 3, bg: 'factory', mid: [1900, 'cannon'], sec: [
      [0, 1300, 100, [['kettle', 'single', 1, 2], ['lamp', 'single', 1, 2], ['spool', 'snake', 6, 2], ['umbrella', 'vee', 5, 1]]],
      [1300, 1800, 100, [['bolt', 'pincer', 6, 2], ['wasp', 'rand', 3, 1]]],
      [2400, 3600, 90, [['lamp', 'single', 1, 2], ['gear', 'single', 1, 2], ['kettle', 'single', 1, 2], ['magnet', 'single', 1, 1], ['prop', 'col', 3, 1]]],
    ], fix: [[300, 'pod', 'single', 1, 135], [1500, 'pod', 'single', 1, 90], [2600, 'pod', 'single', 1, 180], [3200, 'pod', 'single', 1, 110]] },
    { id: 4, ja: 'こおりのおもちゃ屋', en: 'Frozen Toy Shop', len: 3800, boss: 4, bg: 'frozen', sec: [
      [0, 1200, 95, [['icicle', 'rain', 4, 3], ['jelly', 'single', 1, 2], ['umbrella', 'vee', 5, 1]]],
      [1200, 2500, 90, [['icicle', 'rain', 5, 3], ['jelly', 'col', 2, 2], ['wisp', 'snake', 4, 2], ['crab', 'single', 1, 1]]],
      [2500, 3700, 85, [['icicle', 'rain', 6, 2], ['wisp', 'snake', 5, 2], ['crab', 'single', 1, 1], ['magnet', 'single', 1, 1], ['lamp', 'single', 1, 1]]],
    ], fix: [[300, 'pod', 'single', 1, 135], [1400, 'pod', 'single', 1, 80], [2300, 'pod', 'single', 1, 190], [3100, 'pod', 'single', 1, 135]] },
    { id: 5, ja: 'まよなかの遊園地', en: 'Midnight Carnival', len: 4000, boss: 5, bg: 'carnival', mid: [2000, 'cannon'], sec: [
      [0, 1300, 90, [['rocket', 'rand', 4, 3], ['wisp', 'snake', 5, 2], ['spring', 'single', 1, 1]]],
      [1300, 1900, 85, [['rocket', 'rand', 5, 2], ['wisp', 'snake', 5, 2], ['jelly', 'col', 3, 1]]],
      [2600, 3900, 80, [['rocket', 'rand', 5, 2], ['wisp', 'snake', 6, 2], ['lamp', 'single', 1, 2], ['spring', 'single', 1, 1], ['kettle', 'single', 1, 1]]],
    ], fix: [[300, 'pod', 'single', 1, 135], [1500, 'pod', 'single', 1, 90], [2700, 'pod', 'single', 1, 180], [3400, 'pod', 'single', 1, 120]] },
    { id: 6, ja: 'ジャンクのおしろ', en: 'Junk King Castle', len: 4300, boss: 6, bg: 'castle', mid: [2200, 'cannon'], sec: [
      [0, 1400, 85, [['umbrella', 'vee', 6, 2], ['wasp', 'rand', 4, 2], ['gear', 'single', 1, 2], ['lamp', 'single', 1, 1], ['turret', 'single', 1, 1]]],
      [1400, 2100, 80, [['bolt', 'pincer', 6, 2], ['prop', 'col', 3, 1], ['crab', 'single', 1, 1]]],
      [2700, 4200, 75, [['crab', 'single', 1, 2], ['kettle', 'single', 1, 2], ['magnet', 'single', 1, 1], ['rocket', 'rand', 5, 2], ['wisp', 'snake', 5, 2], ['lamp', 'single', 1, 2], ['gear', 'single', 1, 1]]],
    ], fix: [[300, 'pod', 'single', 1, 135], [1500, 'pod', 'single', 1, 80], [2500, 'pod', 'single', 1, 190], [3300, 'pod', 'single', 1, 110], [3900, 'pod', 'single', 1, 160]] },
  ];

  // formations -> individual spawns [{t, y, o}]
  function expand(form, t, n, y, rnd) {
    const out = [];
    const clampY = v => Math.max(24, Math.min(H - 24, v));
    if (form === 'single') out.push({ t, y: clampY(y), o: {} });
    else if (form === 'line') for (let i = 0; i < n; i++) out.push({ t: t + i * 18, y: clampY(y), o: {} });
    else if (form === 'snake') for (let i = 0; i < n; i++) out.push({ t: t + i * 14, y: clampY(y), o: { ph: i * 0.55 } });
    else if (form === 'col') for (let i = 0; i < n; i++) out.push({ t, y: clampY(y + (i - (n - 1) / 2) * 38), o: { dx: i * 6 } });
    else if (form === 'vee') { const m = (n - 1) / 2; for (let i = 0; i < n; i++) out.push({ t: t + Math.round(Math.abs(i - m) * 12), y: clampY(y + (i - m) * 26), o: {} }); }
    else if (form === 'pincer') for (let i = 0; i < n; i++) { const top = i % 2 === 0; out.push({ t: t + (i >> 1) * 16, y: top ? 22 : H - 22, o: { dy: top ? 1 : -1 } }); }
    else if (form === 'rain') for (let i = 0; i < n; i++) out.push({ t: t + i * 16, y: 20, o: { fx: Math.floor(rnd() * 300) + 150 } });
    else for (let i = 0; i < n; i++) out.push({ t: t + i * 20, y: clampY(24 + Math.floor(rnd() * (H - 48))), o: {} });  // 'rand'
    return out;
  }

  // The script of a stage: a sorted list of spawns. rnd = seeded () => [0,1). thin < 1 packs waves closer (daily "swarm").
  function buildScript(stageIdx, rnd, thin, bossOnly) {
    const st = STAGES[stageIdx], out = [];
    if (bossOnly) return out;
    thin = thin || 1;
    for (const sec of st.sec) {
      const t1 = sec[1], gap = sec[2], pool = sec[3];
      let tot = 0; for (const p of pool) tot += p[3];
      let t = sec[0];
      while (t < t1) {
        let r = rnd() * tot, pick = pool[0];
        for (const p of pool) { r -= p[3]; if (r <= 0) { pick = p; break; } }
        const y = 30 + Math.floor(rnd() * (H - 60));
        for (const s of expand(pick[1], t, pick[2], y, rnd)) { s.type = pick[0]; out.push(s); }
        t += Math.round(gap * (0.8 + rnd() * 0.4) * thin);
      }
    }
    for (const f of st.fix) for (const s of expand(f[2], f[0], f[3], f[4], rnd)) { s.type = f[1]; out.push(s); }
    if (st.mid) out.push({ t: st.mid[0], type: st.mid[1], y: 135, o: {} });
    for (let i = 0; i < out.length; i++) {
      out[i].i = i;
      const d = EN[out[i].type];
      if (d.mv.k === 'hover') out[i].o.tx = 300 + Math.floor(rnd() * 120);
    }
    out.sort((a, b) => a.t - b.t || a.i - b.i);
    return out;
  }

  const SHIPS = [
    { id: 'swallow', ja: 'ツバメごう', en: 'Swallow', dja: 'ひろがる弾と追いかけミサイル。まず選ぶならこれ。', den: 'Spread shots and homing missiles. A friendly first pick.', bja: 'かみふぶき（画面をひろがる波）', ben: 'Paper Storm (an expanding wave)' },
    { id: 'stork', ja: 'コウノトリごう', en: 'Stork', dja: 'まっすぐ強い針。長押しでため撃ち。', den: 'Straight, strong needles. Hold to charge a piercing blast.', bja: 'インクふき（前方を払う帯）', ben: 'Ink Sweep (a wide band ahead)' },
    { id: 'firefly', ja: 'ホタルごう', en: 'Firefly', dja: '近くに強い扇の弾。まわる灯りが守る。', den: 'A strong short-range fan. Orbiting lanterns guard you.', bja: 'ひかりのヴェール（まもる光の球）', ben: 'Lantern Veil (a protective bubble)' },
  ];

  const api = { W, H, DIFF, MODS, EN, EN_IDS, BOSS, STAGES, SHIPS, buildScript, expand };
  root.ShmupData = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
