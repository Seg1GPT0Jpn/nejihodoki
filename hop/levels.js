// ぴょんぴょん冒険: level data. Each level is a list of chunks (ASCII tile maps, 13 rows high) glued left to right.
// A chunk = a floor profile (one char per column, rows 10-12) plus the rows above it (row 9 is the row the hero stands in).
//   floor: '#' ground  '.' pit  '~' water  'i' ice  '>' '<' conveyors  '^' spikes  'S' spring  '_' ground with no grass
//   tile chars: see HopEngine (c coin, m medal, ? ! B blocks, - one-way, S spring, K checkpoint, G goal, D/d burrow pair, o ring, w updraft, f fake wall ...)
//   enemy chars: b bug, n windup, j frog, a bat, p balloon, t cannon, s pin cushion, r roller, y drip, e bird, l pendulum, u umbrella; M N F platforms; Q C R gear; X boss
// The same chunks feed the daily generator (every chunk is proven passable by the solver, see tools/tests/unit/hop-levels.test.js).
(function (root) {
  'use strict';
  const H = 13;
  const CHUNKS = {};
  function ch(name, floor, rows, o) {
    const W = floor.length;
    const out = [];
    for (let y = 0; y < 10; y++) out.push((((rows && rows[y]) || '') + ' '.repeat(W)).slice(0, W));
    const f = [[], [], []];
    for (const c of floor) {
      const col = c === '#' ? ['#', '#', '#'] : c === '_' ? ['#', '#', '#'] : c === '.' ? [' ', ' ', ' '] : c === '~' ? ['~', '~', '#'] : c === 'i' ? ['i', '#', '#'] : c === '>' ? ['>', '#', '#'] : c === '<' ? ['<', '#', '#']
        : c === '^' ? ['^', '#', '#'] : c === 'S' ? ['S', '#', '#'] : ['#', '#', '#'];
      for (let k = 0; k < 3; k++) f[k].push(col[k]);
    }
    const fl = f.map(a => a.join(''));
    for (let k = 0; k < 3; k++) { const ov = rows && rows[10 + k]; if (ov) fl[k] = fl[k].split('').map((c, i) => (ov[i] && ov[i] !== ' ' ? ov[i] : c)).join(''); }
    CHUNKS[name] = { name, rows: out.concat(fl), w: W, opt: o || {} };
  }
  function raw(name, rows, o) { const W = Math.max.apply(null, rows.map(r => r.length)); CHUNKS[name] = { name, rows: rows.map(r => (r + ' '.repeat(W)).slice(0, W)), w: W, opt: o || {} }; }

  // =============================== world 1: patchwork meadow ===============================
  ch('start', '##############', { 8: '    c c c', 9: '  P' });
  ch('goal', '################', { 7: '           c', 9: '           G' });
  ch('plain', '############', { 8: '  c c c c' });
  ch('hill1', '####################', { 8: '    c c         c c', 9: '        ###  b' });
  ch('bugs', '######################', { 8: '    c c c', 9: '     b     b     b' });
  ch('gap3', '#####...#####', { 7: '      c', 8: '     c c' });
  ch('gap4', '######....######', { 5: '      m', 7: '       c c', 8: '      c   c' });
  ch('qrow', '####################', { 4: '    m', 6: '     ?B?B?', 9: '            b' });
  ch('cp', '##########', { 9: '    K' });
  ch('stairs', '################', { 5: '       m', 7: '      ###', 8: '     ####', 9: '    #####' });
  ch('pitplat', '#####...#####...#####', { 7: '      c       c', 8: '      -       -', 9: '    m' });
  ch('fakewall', '################', { 7: '      ####', 8: '      ffff', 9: '      fmff' });
  ch('bugs2', '##################', { 8: '   c c c c', 9: '    b  b    b' });
  // world 1-2: spring valley
  ch('springA', '#####S#########', { 3: '   c       c c', 5: '  c         c' });
  ch('springUp', '###########', { 4: '  m', 7: '       ###' });
  ch('frogs', '########################', { 8: '   c c', 9: '       j        j' });
  ch('springGap', '####S.......#####', { 5: '       c c c' });
  ch('boots', '##############', { 6: '   ?!?', 9: '       b' });
  ch('burrowA', '############', { 9: '  D' });
  ch('tallwall', '######################', { 4: '          m', 7: '          ##', 8: '   c c    ##  c', 9: '    c  b  ##   j' });
  ch('pits2', '####..####..####', { 8: '   c    c' });
  ch('canyon', '###..###..###..###', { 8: '  c   c   c', 9: '   c   c' });
  raw('secretA', ['##############', '##############', '##############', '##############', '##############', '##############', '#            #', '#     c c c  #', '#  m   m     #', '# d      c   #', '##############', '##############', '##############'], { secret: 1 });
  // world 1-3: patch bridge
  ch('bridgeH', '###........###', { 7: '   c   c', 9: '    M' });
  ch('bats', '####################', { 6: '     a       a', 8: '   c c   c c' });
  ch('balloons', '######..######..######', { 6: '       p', 7: '', 8: '        p', 9: '  c' });
  ch('crumbles', '####.......####', { 9: '    F   F' });

  // =============================== world 2: toy factory ===============================
  ch('start2', '################', { 8: '    c c c', 9: '  P' });
  ch('startR', '################', { 8: '    c c c', 9: '  P     R' });
  ch('conv1', '######>>>>>>>>######', { 8: '   c c c c', 9: '        n      b' });
  ch('conv2', '####<<<<<<<<####', { 6: '      ?B?', 8: ' c      c', 9: '            b' });
  ch('convGap', '#####>>>>...>>>>#####', { 6: '          m', 8: '         c c' });
  ch('windups', '######################', { 8: '    c c', 9: '      n       n' });
  ch('spikes', '####^^^^####', { 7: '      c c' });
  ch('spikeRow', '###^^^####^^^###', { 7: '    c  c' });
  ch('pend1', '##################', { 3: '         l', 8: '   c c   c c' });
  ch('cannons', '########################', { 6: '           ?', 9: '         t   #   t' });
  ch('pendRow', '##########################', { 3: '      l      l', 4: '                   l' });
  ch('rollers', '######################', { 8: '   c c', 9: '              r' });
  ch('pins', '######################', { 8: '   c c   c c', 9: '     s    b    s' });
  ch('updraft', '####...........####', { 2: '        www', 3: '        www', 4: '        www', 5: '        www', 6: '        www', 7: '        www', 8: '        www', 9: '        www', 10: '', 11: '', 12: '' });
  ch('capeBlock', '############', { 6: '  ?!?', 9: '    b' });
  ch('ribbonGap', '####..........####', { 4: '      o     o' });
  ch('umbrellas', '######################', { 8: '    c c', 9: '      u       u' });
  ch('drips', '######################', { 2: '    ############', 3: '    y  y  y', 8: '    c  c  c' });
  ch('birds', '######################', { 6: '      e     e' });
  ch('cp2', '############', { 9: '    K' });

  // boss arenas (a gate closes the exit until the boss is down)
  const arena = (r9) => ['####################################', '####################################', '####################################', '                                    ', '                                    ', '                                    ', '                                    ', '                                    ', '                                    ', r9, '####################################', '####################################', '####################################'];
  raw('arenaBear', arena('                    X               '), { arena: 1 });
  raw('arenaGeneral', arena('                    X               '), { arena: 1 });


  // =============================== world 3: bathtub bay (water, ice, soap boats) ===============================
  ch('pool1', '####~~~~~~####', { 7: '     p', 8: '       c c' });
  ch('pool2', '###~~~~~~~~~~###', { 9: '      --  --', 11: '        m' });
  ch('iceRun', 'iiiiiiiiiiiiiiii', { 9: '           n' });
  ch('iceGap', '####iii...iii####', { 8: '        c' });
  ch('iceSpring', 'iiiiSiiiiiiiii', { 4: '    c c', 9: '          n' });
  ch('iceSpikes', 'iii^^^iii^^^iii', { 7: '   c   c   c' });
  ch('startQ', '################', { 8: '    c c c', 9: '  P     Q' });
  ch('liftA', '###.......###', { 7: '          ###', 8: '          ###', 9: '    N     ###' });
  raw('arenaDuck', ['####################################', '####################################', '####################################', '                    X               ', '                                    ', '                                    ', '     ----                  ----     ', '                                    ', '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~', '~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~~', '####################################', '####################################', '####################################'], { arena: 1 });
  // =============================== world 4: snowglobe peaks (wind, ice, icicles, the owl) ===============================
  raw('arenaOwl', arena('                    X               '), { arena: 1 });
  ch('snowHill', '####################', { 8: '    c c         c c', 9: '        ###  s' });
  // =============================== world 5: midnight toybox (dark) ===============================
  ch('lampHall', '####################', { 6: '    a     a', 8: '   c  c  c  c' });
  ch('clockTower', '########################', { 3: ' l      l      l', 9: '   b          b' });
  ch('burrowP', '############', { 9: '  (' });
  raw('secretB', ['##############', '##############', '##############', '##############', '##############', '##############', '#            #', '#   c c c    #', '#  m     m   #', '# )      c   #', '##############', '##############', '##############'], { secret: 1 });
  raw('arenaMouse', arena('                    X               '), { arena: 1 });
  // =============================== world 6: the toymaker's atelier ===============================
  raw('arenaGolem', arena('                    X               '), { arena: 1 });
  ch('windGap', '####...........####', { 2: '        www', 3: '        www', 4: '        www', 5: '        www', 6: '        www', 7: '        www', 8: '        www', 9: '        www' });

  // ===== the level list =====
  // parts: chunk names. A part can also be an array [name, replace-map] for the daily generator.
  const LEVELS = [];
  const PENDING = [];    // levels still being proven by the solver; they move into LEVELS when done
  function lvlP(id, world, name, theme, parts, o) { PENDING.push(Object.assign({ id, world, name, theme, parts }, o || {})); }
  function lvl(id, world, name, theme, parts, o) { LEVELS.push(Object.assign({ id, world, name, theme, parts }, o || {})); }
  lvl('1-1', 1, { ja: 'はじめの丘', en: 'First Hill' }, 'meadow', ['start', 'hill1', 'bugs', 'gap3', 'qrow', 'cp', 'stairs', 'pitplat', 'fakewall', 'bugs2', 'gap4', 'plain', 'goal'], { par: 40, gimmick: { ja: 'はしって、とんで、ふむ', en: 'Run, jump, stomp' }, gear: null });
  lvl('1-2', 1, { ja: 'ばねの谷', en: 'Spring Valley' }, 'meadow', ['start', 'boots', 'springA', 'frogs', 'cp', 'springGap', 'burrowA', 'springUp', 'tallwall', 'canyon', 'plain', 'goal', 'secretA'], { par: 35, gimmick: { ja: 'ばね・ばねぐつ・かくしあな', en: 'Springs, boots and a hidden burrow' }, gear: 'boots', put: [[9, 9, 6, 'm']] });
  lvl('1-3', 1, { ja: 'つぎはぎ橋', en: 'Patchwork Bridge' }, 'meadow', ['start', 'bats', 'bridgeH', 'balloons', 'cp', 'crumbles', 'bridgeH', 'bats', 'plain', 'goal'], { par: 30, gimmick: { ja: 'うごく足場・こうもり', en: 'Moving platforms and bats' }, gear: null, put: [[1, 14, 7, 'm'], [2, 7, 6, 'm'], [3, 7, 5, 'm'], [5, 6, 7, 'm'], [7, 15, 7, 'm']] });
  lvl('1-4', 1, { ja: 'ツギハギぐまのしろ', en: 'Patchbear Castle' }, 'meadow', ['start', 'bugs', 'gap4', 'cp', 'arenaBear', 'goal'], { par: 25, gimmick: { ja: 'ボス：ツギハギぐま', en: 'Boss: Patchbear' }, boss: 'bear', put: [[0, 8, 7, 'm'], [1, 9, 7, 'm'], [3, 5, 7, 'm'], [4, 6, 6, 'm']] });
  lvl('2-1', 2, { ja: 'ベルトコンベア工場', en: 'Conveyor Works' }, 'factory', ['start2', 'conv1', 'conv2', 'convGap', 'cp2', 'windups', 'spikes', 'conv1', 'plain', 'goal'], { par: 30, gimmick: { ja: 'ベルトコンベア', en: 'Conveyor belts' }, put: [[1, 9, 6, 'm'], [2, 8, 4, 'm'], [5, 7, 6, 'm'], [6, 6, 7, 'm']] });
  lvl('2-2', 2, { ja: 'ふりこの回廊', en: 'Pendulum Hall' }, 'factory', ['start2', 'pend1', 'cannons', 'capeBlock', 'updraft', 'cp2', 'pendRow', 'spikeRow', 'plain', 'goal'], { par: 55, gimmick: { ja: 'ふりこ・大砲・マント', en: 'Pendulums, cannons and the cape' }, gear: 'cape', put: [[1, 9, 7, 'm'], [2, 11, 4, 'm'], [4, 9, 2, 'm'], [6, 16, 8, 'm'], [7, 8, 6, 'm']] });
  lvl('2-3', 2, { ja: 'リボンの吊り橋', en: 'Ribbon Rigging' }, 'factory', ['startR', 'umbrellas', 'ribbonGap', 'cp2', 'rollers', 'pins', 'drips', 'plain', 'goal'], { par: 30, gimmick: { ja: 'リボン・かさもち', en: 'The ribbon and umbrella-bugs' }, gear: 'ribbon', put: [[1, 10, 6, 'm'], [2, 8, 6, 'm'], [4, 8, 7, 'm'], [5, 10, 7, 'm'], [6, 8, 6, 'm']] });
  lvl('2-4', 2, { ja: 'ぜんまいたいしょうの間', en: 'Windup General' }, 'factory', ['start2', 'conv1', 'cp2', 'arenaGeneral', 'goal'], { par: 50, gimmick: { ja: 'ボス：ぜんまいたいしょう', en: 'Boss: Windup General' }, boss: 'general', put: [[0, 9, 7, 'm'], [1, 10, 6, 'm'], [2, 5, 7, 'm'], [3, 8, 6, 'm'], [4, 5, 6, 'm']] });

  lvl('3-1', 3, { ja: 'あわあわの浅瀬', en: 'Bubble Shallows' }, 'bath', ['start2', 'bugs', 'pool1', 'plain', 'cp', 'pool2', 'frogs', 'pool1', 'balloons', 'plain', 'goal'], { par: 35, gimmick: { ja: 'およげる水・あわ', en: 'Swimming and bubbles' }, put: [[1, 10, 7, 'm'], [2, 6, 11, 'm'], [7, 6, 11, 'm'], [8, 7, 5, 'm']] });
  lvl('3-2', 3, { ja: 'つるつるタイル', en: 'Slippery Tiles' }, 'bath', ['start2', 'iceRun', 'iceGap', 'iceSpring', 'cp', 'iceSpikes', 'windups', 'iceRun', 'plain', 'goal'], { par: 30, gimmick: { ja: 'すべる氷のタイル', en: 'Slippery ice tiles' }, put: [[2, 8, 6, 'm'], [3, 5, 3, 'm'], [5, 7, 6, 'm'], [6, 8, 7, 'm'], [7, 10, 7, 'm']] });
  lvl('3-3', 3, { ja: 'せっけんの船', en: 'Soap Boats' }, 'bath', ['startQ', 'bridgeH', 'bats', 'liftA', 'cp', 'crumbles', 'cannons', 'bridgeH', 'plain', 'goal'], { par: 30, gimmick: { ja: 'うごくせっけん・ばね靴', en: 'Moving soap bars and spring boots' }, gear: 'boots', put: [[1, 7, 6, 'm'], [2, 10, 7, 'm'], [3, 7, 5, 'm'], [5, 6, 7, 'm'], [6, 11, 4, 'm']] });
  lvl('3-4', 3, { ja: 'ゴムあひるの入り江', en: 'Rubber Duck Cove' }, 'bath', ['start2', 'bugs', 'pool1', 'cp', 'arenaDuck', 'goal'], { par: 30, gimmick: { ja: 'ボス：ゴムあひる', en: 'Boss: Rubber Duck Sub' }, boss: 'duck', surfaceRow: 8, put: [[0, 8, 7, 'm'], [1, 9, 7, 'm'], [2, 6, 11, 'm'], [3, 5, 7, 'm'], [4, 6, 5, 'm']] });
  lvl('4-1', 4, { ja: 'ふぶきの尾根', en: 'Blizzard Ridge' }, 'snow', ['start2', 'snowHill', 'gap4', 'pins', 'birds', 'cp', 'canyon', 'snowHill', 'pitplat', 'plain', 'goal'], { par: 40, wind: -0.07, gimmick: { ja: 'ふきつける風', en: 'A blowing wind' }, put: [[1, 10, 6, 'm'], [3, 11, 7, 'm'], [4, 9, 6, 'm']] });
  lvl('4-2', 4, { ja: 'こおりのはしご', en: 'Frozen Ladders' }, 'snow', ['start2', 'iceRun', 'liftA', 'springUp', 'cp', 'iceGap', 'liftA', 'frogs', 'iceSpikes', 'plain', 'goal'], { par: 30, gimmick: { ja: '氷とのぼるせっけん', en: 'Ice and rising platforms' }, put: [[1, 8, 7, 'm'], [2, 11, 5, 'm'], [5, 8, 6, 'm'], [8, 8, 6, 'm']] });
  lvl('4-3', 4, { ja: 'つららのほら穴', en: 'Icicle Cavern' }, 'snow', ['start2', 'drips', 'cannons', 'rollers', 'cp', 'drips', 'pins', 'cannons', 'plain', 'goal'], { par: 35, gimmick: { ja: 'つらら・ゆきだま大砲', en: 'Icicles and snowball cannons' }, put: [[1, 14, 7, 'm'], [2, 11, 4, 'm'], [3, 9, 7, 'm'], [6, 11, 7, 'm'], [7, 11, 4, 'm']] });
  lvl('4-4', 4, { ja: 'ふぶきフクロウの山頂', en: 'Blizzard Owl Summit' }, 'snow', ['start2', 'bugs', 'cp', 'arenaOwl', 'goal'], { par: 35, gimmick: { ja: 'ボス：ふぶきフクロウ', en: 'Boss: Blizzard Owl' }, boss: 'owl', put: [[0, 8, 7, 'm'], [1, 10, 7, 'm'], [2, 5, 7, 'm'], [3, 6, 6, 'm'], [3, 28, 6, 'm']] });
  lvl('5-1', 5, { ja: 'くらやみの廊下', en: 'Lampless Hall' }, 'night', ['start2', 'lampHall', 'gap3', 'lampHall', 'cp', 'drips', 'pitplat', 'lampHall', 'plain', 'goal'], { par: 35, dark: true, gimmick: { ja: 'くらやみ（光はぴょんたのまわりだけ）', en: 'Darkness: only a small light around you' }, put: [[1, 6, 7, 'm'], [3, 12, 7, 'm'], [5, 12, 6, 'm'], [7, 5, 7, 'm']] });
  lvl('5-2', 5, { ja: 'ふりこ時計の塔', en: 'Pendulum Clock Tower' }, 'night', ['start2', 'clockTower', 'liftA', 'springUp', 'cp', 'pendRow', 'clockTower', 'plain', 'goal'], { par: 30, dark: true, gimmick: { ja: 'ふりこ時計・のぼる足場', en: 'Clock pendulums and rising platforms' }, put: [[1, 8, 7, 'm'], [2, 11, 5, 'm'], [5, 13, 7, 'm'], [6, 12, 7, 'm']] });
  lvl('5-3', 5, { ja: 'ぬいぐるみの穴ぐら', en: 'Plushie Burrows' }, 'night', ['start2', 'burrowA', 'lampHall', 'burrowP', 'cp', 'rollers', 'windups', 'plain', 'goal', 'secretA', 'secretB'], { par: 30, dark: true, gimmick: { ja: 'つながる穴ぐら', en: 'A web of burrows' }, put: [[2, 8, 7, 'm']] });
  lvl('5-4', 5, { ja: 'とけいネズミの間', en: 'Clock Mouse Chamber' }, 'night', ['start2', 'lampHall', 'cp', 'arenaMouse', 'goal'], { par: 50, dark: true, boss: 'mouse', gimmick: { ja: 'ボス：とけいネズミ', en: 'Boss: Clock Mouse' }, put: [[0, 8, 7, 'm'], [1, 10, 7, 'm'], [2, 5, 7, 'm'], [3, 10, 6, 'm'], [3, 26, 6, 'm']] });
  lvl('6-1', 6, { ja: 'ネジの森', en: 'Screw Forest' }, 'atelier', ['startR', 'springA', 'umbrellas', 'ribbonGap', 'cp', 'frogs', 'ribbonGap', 'plain', 'goal'], { par: 30, gear: 'ribbon', gimmick: { ja: 'リボンのわっか・ばね', en: 'Ribbon rings and springs' }, put: [[1, 8, 3, 'm'], [2, 10, 7, 'm'], [3, 9, 6, 'm'], [5, 12, 7, 'm'], [6, 9, 6, 'm']] });
  lvl('6-2', 6, { ja: 'ぎこぎこ工房', en: 'Creaking Workshop' }, 'atelier', ['startQ', 'conv1', 'crumbles', 'pend1', 'cp', 'convGap', 'cannons', 'plain', 'goal'], { par: 30, gear: 'boots', gimmick: { ja: 'ベルト・くずれる足場・大砲', en: 'Belts, crumbling floors and cannons' }, put: [[1, 9, 6, 'm'], [2, 6, 7, 'm'], [3, 9, 7, 'm'], [6, 11, 4, 'm']] });
  lvl('6-3', 6, { ja: 'そらとぶ工房', en: 'Sky Workshop' }, 'atelier', ['start2', 'capeBlock', 'updraft', 'birds', 'cp', 'liftA', 'windGap', 'birds', 'plain', 'goal'], { par: 50, gear: 'cape', wind: 0.05, gimmick: { ja: '上昇風とマント', en: 'Updrafts and the cape' }, put: [[1, 8, 7, 'm'], [2, 9, 2, 'm'], [3, 9, 6, 'm'], [6, 9, 2, 'm'], [7, 9, 7, 'm']] });
  lvl('6-4', 6, { ja: 'ネジまわしゴーレムの間', en: 'Screwdriver Golem Hall' }, 'atelier', ['startR', 'conv1', 'cp', 'arenaGolem', 'goal'], { par: 30, gear: 'ribbon', boss: 'golem', gimmick: { ja: 'ボス：ネジまわしゴーレム', en: 'Boss: Screwdriver Golem' }, put: [[0, 9, 7, 'm'], [1, 10, 6, 'm'], [2, 5, 7, 'm'], [3, 6, 6, 'm'], [3, 28, 6, 'm']] });

  // Worlds not released yet stay in PENDING (they are built and proven, but the map, the counters and the tests only see LEVELS). Stage 2 = set RELEASED_WORLDS to 6.
  const RELEASED_WORLDS = (typeof process !== 'undefined' && process.env && Number(process.env.HOP_WORLDS)) || 6;
  for (let i = LEVELS.length - 1; i >= 0; i--) if (LEVELS[i].world > RELEASED_WORLDS) PENDING.unshift(LEVELS.splice(i, 1)[0]);
  // ---- assemble
  function assemble(def) {
    const rows = []; for (let y = 0; y < H; y++) rows.push('');
    let x = 0, secrets = [], goalX = -1;
    const list = def.parts.slice();
    for (const part of list) {
      const c = CHUNKS[typeof part === 'string' ? part : part[0]];
      if (!c) throw new Error('unknown chunk ' + part + ' in ' + def.id);
      if (c.opt.secret) { for (let y = 0; y < H; y++) rows[y] += c.rows[y]; x += c.w; continue; }
      for (let y = 0; y < H; y++) rows[y] += c.rows[y];
      x += c.w;
    }
    // overlays: [part index, col in chunk, row, char]
    const offs = []; { let o = 0; for (const part of list) { offs.push(o); o += CHUNKS[typeof part === 'string' ? part : part[0]].w; } }
    for (const q of (def.put || [])) { const X = offs[q[0]] + q[1]; rows[q[2]] = rows[q[2]].slice(0, X) + q[3] + rows[q[2]].slice(X + 1); }
    // gates and walls for boss levels: close the arena exit
    const lv = Object.assign({}, def, { rows, W: x });
    if (def.boss) {
      // gate: the 'g' column is the last two columns of the arena; ceiling stays solid
      let xx = 0;
      for (const part of list) { const c = CHUNKS[typeof part === 'string' ? part : part[0]]; if (c.opt.arena) { const gx = xx + c.w - 2; for (let y = 3; y <= 9; y++) rows[y] = rows[y].slice(0, gx) + 'g' + rows[y].slice(gx + 1); lv.gateX = gx; lv.arenaX0 = xx; lv.arenaX1 = gx; } xx += c.w; }
    }
    return lv;
  }
  const cache = {};
  function get(id) { if (!cache[id]) { const d = LEVELS.find(l => l.id === id) || PENDING.find(l => l.id === id); if (!d) return null; cache[id] = assemble(d); } return cache[id]; }
  const WORLDS = [
    { id: 1, theme: 'meadow', name: { ja: 'パッチワークの野原', en: 'Patchwork Meadow' }, boss: { ja: 'ツギハギぐま', en: 'Patchbear' } },
    { id: 2, theme: 'factory', name: { ja: 'ぜんまい工場', en: 'Windup Factory' }, boss: { ja: 'ぜんまいたいしょう', en: 'Windup General' } },
    { id: 3, theme: 'bath', name: { ja: 'おふろの入り江', en: 'Bathtub Bay' }, boss: { ja: 'ゴムあひる', en: 'Rubber Duck Sub' } },
    { id: 4, theme: 'snow', name: { ja: 'スノードームの峰', en: 'Snowglobe Peaks' }, boss: { ja: 'ふぶきフクロウ', en: 'Blizzard Owl' } },
    { id: 5, theme: 'night', name: { ja: 'まよなかのおもちゃ箱', en: 'Midnight Toybox' }, boss: { ja: 'とけいネズミ', en: 'Clock Mouse' } },
    { id: 6, theme: 'atelier', name: { ja: 'おもちゃ職人のアトリエ', en: "The Toymaker's Atelier" }, boss: { ja: 'ネジまわしゴーレム', en: 'Screwdriver Golem' } },
  ];
  const API = { WORLDS, CHUNKS, LEVELS, PENDING, allIds: () => LEVELS.concat(PENDING).map(l => l.id), ids: () => LEVELS.map(l => l.id), get, assemble, ch, raw, H };
  if (typeof module === 'object' && module && module.exports) module.exports = API;
  root.HopLevels = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
