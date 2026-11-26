// ふわふわぱふ: the worlds and stages. Stages are composed from hand-made segments (a small builder), and every stage carries a `route`:
// the plan a bot follows to finish it (and to pick up all three medals). tools/puff-solve.js plays that route on the real engine and stores
// the input recording in puff/proofs.js; the unit tests replay those recordings, so every stage is proven beatable.
//
// Tiles:  # ground  = one-way  b brick  k cracked block (stone / bomb)  r rope net (fire / bomb)  v vine (blade / leaf / fire)
//         n snow or ash heap (fire / bomb)  ~ water (ice freezes it, bubble swims in it)  ^ spikes  o socket (spark)  D door (opens when all sockets are on)
//         c star  m medal  h heart  K checkpoint  G goal  P start
// Creatures: M mogu  F bobo (fire)  Z piri (spark)  I kogori (ice)  Y kiriri (blade)  R goro (stone)  L hirari (leaf)  U puka (bubble)  X bakuda (bomb)  T tobi  S togeko  C taiho  W boss
(function (root) {
  'use strict';
  const H = 13;
  const PROV = { fire: 'F', spark: 'Z', ice: 'I', blade: 'Y', stone: 'R', leaf: 'L', bubble: 'U', bomb: 'X' };
  const GATE_AB = { r: ['fire', 'bomb'], v: ['blade', 'leaf', 'fire'], n: ['fire', 'bomb'], k: ['stone', 'bomb'], '~': ['ice', 'bubble'] };

  function Builder() { this.cols = []; this.route = []; this.x = 0; this.hasStart = false; this.cps = 0; this.goalX = -1; }
  const P = Builder.prototype;
  // add w columns; fn(set, rect, w) draws in local coordinates (x 0..w-1, y 0..12); the default column is open sky over a two-tile floor
  P.seg = function (w, fn, floor) {
    const base = this.cols.length, cols = [];
    for (let i = 0; i < w; i++) { const c = new Array(H).fill(' '); if (floor !== false) { c[11] = '#'; c[12] = '#'; } cols.push(c); }
    const set = (x, y, ch) => { if (x >= 0 && x < w && y >= 0 && y < H) cols[x][y] = ch; };
    const rect = (x0, y0, x1, y1, ch) => { for (let x = x0; x <= x1; x++) for (let y = y0; y <= y1; y++) set(x, y, ch); };
    fn && fn(set, rect, w);
    for (const c of cols) this.cols.push(c);
    this.x = base + w; return base;
  };
  P.row = function (set, y, s, x0) { for (let i = 0; i < s.length; i++) if (s[i] !== ' ' && s[i] !== '.') set((x0 || 0) + i, y, s[i]); };
  P.go = function (x, alt) { this.route.push({ t: 'go', x, alt: alt || 'mid' }); };
  P.get = function (ab) { this.route.push({ t: 'get', ab }); };
  P.start = function (w) { w = w || 9; const x0 = this.seg(w, (set) => { set(3, 10, 'P'); }); this.hasStart = true; this.start0 = x0; this.go(x0 + w - 1); };
  P.run = function (w, r10, r8, r6) { const x0 = this.seg(w, (set) => { this.row(set, 10, r10 || ''); if (r8) this.row(set, 8, r8); if (r6) this.row(set, 6, r6); }); this.go(x0 + w - 1); return x0; };
  P.pit = function (w, gap, r10, med) {
    const a = Math.floor((w - gap) / 2);
    const x0 = this.seg(w, (set, rect) => { rect(a, 11, a + gap - 1, 12, ' '); let k = 0; for (let i = 0; i < (r10 || '').length; i++) { const ch = r10[i]; if (ch === ' ') continue; if (i >= a && i < a + gap && /[A-Z]/.test(ch)) set(a + gap + 1 + (k++), 10, ch); else set(i, 10, ch); } for (let i = 0; i < gap; i++) set(a + i, 8 - Math.round(Math.sin(i / (gap - 1 || 1) * Math.PI) * 2), 'c'); if (med) set(a + (gap >> 1), 8, 'm'); });
    if (med) { this.go(x0 + a - 2, 'low'); this.route.push({ t: 'go', x: x0 + a + (gap >> 1), alt: 'mid', y: 8 }); }
    this.go(x0 + w - 1); return x0;
  };
  // hs: a digit per column = how many tiles the ground rises there; r: creatures on top (char per column)
  P.hill = function (w, hs, r) {
    const x0 = this.seg(w, (set, rect) => { for (let i = 0; i < w; i++) { const h = +(hs[i] || 0); if (h > 0) rect(i, 11 - h, i, 10, '#'); const ch = r && r[i]; if (ch && ch !== ' ') set(i, 10 - h, ch); } });
    this.go(x0 + w - 1); return x0;
  };
  // floating one-way platforms: list of [dx, row, len, chars-above]
  P.plat = function (w, list, r10) {
    const x0 = this.seg(w, (set) => { this.row(set, 10, r10 || ''); for (const [dx, y, len, above] of list) { for (let i = 0; i < len; i++) set(dx + i, y, '='); if (above) this.row(set, y - 1, above, dx); } });
    this.go(x0 + w - 1); return x0;
  };
  P.sky = function (w, spots) {   // a medal high up with a trail of stars
    const x0 = this.seg(w, (set) => { for (let i = 0; i < w; i++) if (i > 1 && i < w - 1) set(i, 7 - Math.round(Math.sin(i / w * Math.PI) * 3), 'c'); set(Math.floor(w / 2), 2, 'm'); set(Math.floor(w / 2) - 2, 4, 'c'); set(Math.floor(w / 2) + 2, 4, 'c'); this.row(set, 10, spots || ''); });
    const mx = x0 + Math.floor(w / 2);
    this.route.push({ t: 'go', x: mx, alt: 'sky', y: 2 }); this.go(x0 + w - 1); return x0;
  };
  P.cp = function () { const x0 = this.seg(5, (set) => { set(2, 10, 'K'); }); this.go(x0 + 4); };
  P.tun = function (w, r10) { const x0 = this.seg(w, (set, rect) => { rect(0, 0, w - 1, 6, '#'); this.row(set, 10, r10 || ''); }); this.go(x0 + w - 1, 'tun'); return x0; };
  // an approach with the creature that gives the ability, then a tunnel closed by a 2-wide gate
  P.gate = function (kind, ab, o) {
    o = o || {}; const app = o.app || 11, tw = 10;
    const a0 = this.seg(app, (set) => { set(2, 10, PROV[ab]); if (o.prov2) set(5, 10, PROV[o.prov2]); this.row(set, 8, o.coins || '   c c c'); if (o.hazard) this.row(set, 10, o.hazard); });
    this.go(a0 + 1); this.get(ab);
    const t0 = this.seg(tw, (set, rect) => { rect(0, 0, tw - 1, 6, '#'); rect(4, 7, 5, 10, kind); this.row(set, 9, o.inside || '', 6); });
    this.go(t0 + 2, 'low');
    this.route.push({ t: 'use', kind, ab: GATE_AB[kind], x0: t0 + 4, x1: t0 + 5, y0: 7, y1: 10, dir: 1 });
    this.go(t0 + tw - 1, 'tun'); return t0;
  };
  // water crossing: a long lake under a low ceiling. kind: 'ice' (freeze it) or 'bubble' (swim)
  P.water = function (ab, o) {
    o = o || {}; const app = 10, wl = o.len || 18;
    const a0 = this.seg(app, (set) => { set(2, 10, PROV[ab]); this.row(set, 8, '   c c c'); });
    this.go(a0 + 1); this.get(ab);
    const w0 = this.seg(wl + 3, (set, rect) => { rect(0, 0, wl + 2, 9, '#'); rect(2, 11, wl + 1, 12, '~'); for (let i = 4; i < wl; i += 3) set(2 + i, 10, 'c'); }, true);
    this.go(w0 + 1, 'low');
    this.route.push({ t: 'water', x0: w0 + 2, x1: w0 + wl + 1, ab: ['ice', 'bubble'], want: ab });
    this.go(w0 + wl + 2, 'low'); return w0;
  };
  // a totem with a socket, and a tunnel closed by a door that opens when every socket is on
  P.sock = function (o) {
    o = o || {}; const app = 11, tw = 9;
    const a0 = this.seg(app, (set, rect) => { set(2, 10, 'Z'); rect(7, 10, 8, 10, '#'); set(7, 9, 'o'); this.row(set, 8, '    c c', 0); if (o.two) { rect(4, 4, 4, 5, '#'); set(4, 3, 'o'); set(3, 2, 'c'); } });
    this.go(a0 + 1); this.get('spark');
    const sx = [{ x: a0 + 7, y: 9 }]; if (o.two) sx.push({ x: a0 + 4, y: 3 });
    for (const s of sx) { this.route.push({ t: 'go', x: s.x - 1, alt: s.y === 9 ? 'low' : 'sky', y: s.y === 9 ? 10 : 3 }); this.route.push({ t: 'sock', x: s.x, y: s.y }); }
    const t0 = this.seg(tw, (set, rect) => { rect(0, 0, tw - 1, 6, '#'); rect(4, 7, 4, 10, 'D'); });
    this.go(t0 + 1, 'low'); this.go(t0 + tw - 1, 'tun'); return t0;
  };
  // a closed little room holding a medal; its door is a gate (the creature that gives the ability stands outside)
  P.nook = function (kind, ab) {
    const a0 = this.seg(5, (set) => { set(1, 10, PROV[ab]); });
    const r0 = this.seg(8, (set, rect) => { rect(0, 6, 7, 6, '#'); rect(0, 7, 0, 8, '#'); rect(0, 9, 0, 10, kind); rect(7, 7, 7, 10, '#'); set(4, 10, 'm'); set(3, 9, 'c'); set(5, 9, 'c'); });
    this.go(a0 + 1, 'low'); this.get(ab); this.go(r0 - 3, 'low');
    this.route.push({ t: 'use', kind, ab: GATE_AB[kind], x0: r0, x1: r0, y0: 9, y1: 10, dir: 1 });
    this.go(r0 + 4, 'low'); this.go(r0 - 3, 'low'); this.route.push({ t: 'go', x: r0 - 3, alt: 'high', vf: 1 }); this.go(r0 + 9, 'high');
    const e0 = this.seg(3); this.go(e0 + 1);
  };
  P.goal = function (w) { w = w || 10; const x0 = this.seg(w, (set) => { set(Math.floor(w / 2), 10, 'G'); set(Math.floor(w / 2) - 2, 10, 'c'); set(Math.floor(w / 2) + 2, 10, 'c'); }); this.goalX = x0 + Math.floor(w / 2); this.go(this.goalX, 'low'); };
  // a boss room: the creatures at the edges give the abilities the boss is weak to
  P.boss = function (bk, provs, o) {
    o = o || {};
    const w = 38, x0 = this.seg(w, (set, rect) => {
      rect(w - 2, 0, w - 1, 10, '#'); set(3, 10, 'K'); set(5, 10, PROV[provs[0]]); set(9, 10, PROV[provs[1] || provs[0]]); set(w - 8, 10, PROV[provs[provs.length - 1]]);
      set(w - 5, 10, 'G'); set(20, 10, 'h');
      for (const [dx, y, len] of (o.plats || [[6, 7, 5], [w - 12, 7, 5], [16, 5, 6]])) for (let i = 0; i < len; i++) set(dx + i, y, '=');
      set(8, 4, 'c'); set(9, 4, 'c'); set(w - 11, 4, 'c'); set(18, 3, 'm');
      if (bk !== 'cloud') set(w - 7, 10, 'W'); else set(w - 9, 5, 'W');
    });
    this.bossX = x0; this.arena = [x0 * 16, (x0 + w - 2) * 16]; this.goalX = x0 + w - 5;
    this.go(x0 + 6, 'low');
    this.route.push({ t: 'boss', ab: provs, bk }); this.route.push({ t: 'go', x: x0 + 18, alt: 'sky', y: 3 }); this.go(this.goalX, 'low');
    return x0;
  };
  P.finish = function () {
    // clamp the ceiling (all stage columns share the same 13 rows)
    const rows = []; for (let y = 0; y < H; y++) rows.push(this.cols.map(c => c[y]).join(''));
    return { rows, route: this.route, goalX: this.goalX, arena: this.arena };
  };

  // medals: the builder places them in the segments; route items 'go' on the way pick up the rest. To make sure every medal is collected the
  // proof visits each medal in order (see tools/puff-solve.js, which reads them from the rows).

  const WORLDS = [
    { id: 1, theme: 'meadow', name: { ja: 'わたあめ平原', en: 'Cotton Meadow' }, boss: 'mush', abs: ['fire', 'blade', 'stone', 'bubble'] },
    { id: 2, theme: 'volcano', name: { ja: 'ぐつぐつ火山', en: 'Simmer Volcano' }, boss: 'lava', abs: ['bomb', 'ice', 'fire', 'spark'] },
    { id: 3, theme: 'ice', name: { ja: 'つるつる氷の湖', en: 'Slippery Frost Lake' }, boss: 'snowk', abs: ['ice', 'fire', 'spark', 'blade'] },
    { id: 4, theme: 'sky', name: { ja: 'ゴロゴロ雲の上', en: 'Rumble Sky' }, boss: 'cloud', abs: ['spark', 'leaf', 'bomb', 'bubble'] },
    { id: 5, theme: 'castle', name: { ja: 'おやつ月のお城', en: 'Snack Moon Castle' }, boss: 'moon', abs: ['blade', 'bomb', 'spark', 'stone'] },
  ];

  const DEFS = [];
  function stage(id, theme, name, gimmick, fn, extra) {
    const b = new Builder(); fn(b);
    const r = b.finish();
    const def = Object.assign({ id, theme, name, gimmick, rows: r.rows, route: r.route }, r.arena ? { arena: r.arena } : {}, extra || {});
    DEFS.push(def); return def;
  }
  const N = (ja, en) => ({ ja, en });

  // ================= World 1: Cotton Meadow =================
  stage('1-1', 'meadow', N('ふわっと はじめて', 'First Float'), N('ジャンプ中にもう一度ジャンプで、ふわっとうく。Aボタンで すいこもう', 'Jump again in the air to float. Hold the action button to inhale.'), b => {
    b.start(10); b.run(14, '     c  M    c', '  c c'); b.pit(12, 4, '   M', true); b.run(12, '   M   F   c', ' c c c');
    b.cp(); b.gate('r', 'fire', { app: 12 }); b.nook('v', 'blade'); b.run(10, '  M   c  c'); b.sky(12); b.run(10, '    M   M'); b.pit(12, 5);
    b.run(8, '  M  c'); b.goal(10);
  });
  stage('1-2', 'meadow', N('ひなたの丘', 'Sunny Hills'), N('ツタは きりさきで ばっさり', 'Cut the vines with a blade'), b => {
    b.start(9); b.hill(16, '0001122211122200', '   M   M  Y   M '); b.run(10, ' c c Y c c', '  c c');
    b.nook('v', 'blade'); b.pit(12, 5, '  c M', true); b.cp(); b.gate('v', 'blade', { app: 12 }); b.hill(14, '00112332211000', '    M  Y  M   '); b.sky(12);
    b.run(12, '  M  F  M   c', ' c c c'); b.goal(10);
  });
  stage('1-3', 'meadow', N('ごろごろ洞くつ', 'Rumble Cave'), N('いしに なって われたブロックを くだこう', 'Turn to stone to smash cracked blocks'), b => {
    b.start(9); b.run(12, '   M  R   c', '  c c'); b.gate('k', 'stone', { app: 12 }); b.hill(14, '00011222110000', '  M   R  M   M'); b.cp();
    b.nook('k', 'stone'); b.pit(12, 5, ' M  c', true); b.run(10, '  c  c c', '   c'); b.sky(12); b.gate('k', 'stone', { app: 10 }); b.run(10, '  M   M'); b.goal(10);
  });
  stage('1-4', 'meadow', N('ぷかぷか小川', 'Bobbing Brook'), N('あぶくの力で みずの中を およげる', 'A bubble lets you swim'), b => {
    b.start(9); b.run(12, '   M   U   c', ' c c c'); b.water('bubble'); b.run(10, '  c M  c'); b.cp(); b.nook('r', 'fire'); b.hill(14, '00122332210000', '   M  F   M  M ');
    b.sky(12); b.pit(14, 6, '   M', true); b.run(10, '   M  c'); b.water('bubble', { len: 18 }); b.goal(10);
  });
  stage('1-5', 'meadow', N('きのこ大将', 'General Mushroom'), N('ボスは ほのおに よわい', 'The boss is weak to fire'), b => {
    b.start(9); b.run(10, '    c c c', ' c c'); b.pit(12, 4, '  c', true); b.sky(12); b.run(10, '  F  c'); b.boss('mush', ['fire', 'bomb']);
  }, { boss: 'mush' });

  // ================= World 2: Simmer Volcano =================
  stage('2-1', 'volcano', N('ぐつぐつの入口', 'Simmer Gate'), N('ばくだんで こわせる', 'Bombs blow things up'), b => {
    b.start(9); b.run(12, '   M  X   c', '  c c'); b.gate('k', 'bomb', { app: 12 }); b.hill(14, '00011222110000', '  F   M  X  M '); b.cp();
    b.nook('r', 'bomb'); b.pit(12, 5, '  F  c', true); b.sky(12); b.run(10, '  X  M  c'); b.gate('r', 'bomb', { app: 11 }); b.goal(10);
  });
  stage('2-2', 'volcano', N('あつあつ溶岩川', 'Hot Lava River'), N('こおりのいきで 溶岩を かためよう', 'Freeze the lava into a path'), b => {
    b.start(9); b.run(12, '   F   I    c', ' c c c'); b.water('ice'); b.run(10, '  M  F  c'); b.cp(); b.hill(14, '00112332211000', '  X   F  M  I  ');
    b.nook('n', 'fire'); b.sky(12); b.water('ice', { len: 18 }); b.run(8, '  F c'); b.pit(12, 5, '  c', true); b.goal(10);
  });
  stage('2-3', 'volcano', N('はいの山', 'Ash Hill'), N('はいの山は ほのおで とかせる。ソケットは ビリビリで', 'Burn the ash heap; zap the socket'), b => {
    b.start(9); b.run(12, '   X  F   c', '  c c'); b.gate('n', 'fire', { app: 12 }); b.hill(12, '001222211000', '  X  M  F   '); b.cp();
    b.sock(); b.pit(12, 5, '  X  c', true); b.nook('v', 'blade'); b.sky(12); b.run(10, '  F  M  c'); b.goal(10);
  });
  stage('2-4', 'volcano', N('けむりの道', 'Smoky Trail'), N('いろんな しかけを つかいわけよう', 'Use the right ability for each puzzle'), b => {
    b.start(9); b.hill(14, '00122332210000', '  M  F  X  M  '); b.gate('v', 'leaf', { app: 12 }); b.run(10, '  X  c  c'); b.cp();
    b.water('bubble', { len: 18 }); b.hill(12, '001232232100', '  F   X  M  '); b.nook('k', 'stone'); b.sky(12); b.gate('r', 'fire', { app: 10 }); b.run(10, '  M  F'); b.pit(12, 5, '  c', true); b.goal(10);
  });
  stage('2-5', 'volcano', N('溶岩ガメ', 'Lava Turtle'), N('甲らの中は かたい。顔を出したときが チャンス', 'Hit it while its head is out. Ice is best'), b => {
    b.start(9); b.run(10, '    c c c'); b.pit(12, 4, '  c', true); b.sky(12); b.run(10, '  I  c'); b.boss('lava', ['ice', 'bubble']);
  }, { boss: 'lava' });

  // ================= World 3: Slippery Frost Lake =================
  stage('3-1', 'ice', N('ひんやり入口', 'Chilly Start'), N('こおりの 湖を わたろう', 'Cross the frozen lake'), b => {
    b.start(9); b.run(12, '   I   M   c', '  c c c'); b.water('ice'); b.hill(14, '00011222110000', '  I   M  M  I  '); b.cp();
    b.nook('n', 'fire'); b.pit(12, 5, '  I c', true); b.sky(12); b.run(10, '  M  I  c'); b.water('ice', { len: 18 }); b.goal(10);
  });
  stage('3-2', 'ice', N('ぐるぐる氷の洞くつ', 'Spiral Ice Cave'), N('とげと ソケットの とびら', 'Spikes and a socket door'), b => {
    b.start(9); b.run(12, '   I  Z   c^^  c', '  c c'); b.sock({ two: false }); b.hill(14, '00122332210000', '  I  Y  M  I  '); b.cp();
    b.gate('v', 'blade', { app: 12 }); b.pit(12, 5, '  Y c', true); b.nook('k', 'stone'); b.sky(12); b.run(10, '  I  Y  c'); b.goal(10);
  });
  stage('3-3', 'ice', N('ふぶきの森', 'Blizzard Woods'), N('雪の山は ほのおで とかす', 'Melt the snow heaps'), b => {
    b.start(9); b.hill(14, '00112221100000', '  S   I  M  F '); b.gate('n', 'fire', { app: 12 }); b.run(10, '  I  c  c'); b.cp();
    b.water('ice', { len: 18 }); b.hill(12, '001222211000', '  I  S  F   '); b.nook('v', 'leaf'); b.sky(12); b.gate('n', 'fire', { app: 10 }); b.run(8, '  I  c'); b.pit(12, 5, '  c', true); b.goal(10);
  });
  stage('3-4', 'ice', N('ぴかぴか氷の宮でん', 'Glitter Palace'), N('ソケットが 2つの とびら', 'A door with two sockets'), b => {
    b.start(9); b.run(12, '   I  S   c', '  c c'); b.sock({ two: true }); b.hill(14, '00122332210000', '  I  M  F  Y  '); b.cp();
    b.gate('v', 'blade', { app: 12 }); b.pit(14, 6, '  I   S', true); b.nook('n', 'fire'); b.sky(12); b.water('bubble', { len: 18 }); b.run(8, '  I c'); b.goal(10);
  });
  stage('3-5', 'ice', N('雪だるま王', 'King Snowman'), N('雪だるまは ほのおに よわい', 'Fire melts the snowman king'), b => {
    b.start(9); b.run(10, '    c c c'); b.pit(12, 4, '  c', true); b.sky(12); b.run(10, '  F  c'); b.boss('snowk', ['fire', 'bomb']);
  }, { boss: 'snowk' });

  // ================= World 4: Rumble Sky =================
  stage('4-1', 'sky', N('ふわふわ雲の道', 'Fluffy Cloud Path'), N('はっぱブーメランで とおくまで とどく', 'The leaf boomerang reaches far'), b => {
    b.start(9); b.plat(14, [[2, 8, 4, ' c c'], [8, 6, 4, ' c  c']], '    L   c'); b.gate('v', 'leaf', { app: 12 }); b.hill(12, '001222211000', '  L  M  T   '); b.cp();
    b.nook('v', 'leaf'); b.pit(14, 6, '  L  T', true); b.sky(12); b.run(10, '  T  L  c'); b.goal(10);
  });
  stage('4-2', 'sky', N('でんでんの塔', 'Zap Tower'), N('ビリビリで ソケットをつけて とびらを ひらく', 'Zap sockets to open doors'), b => {
    b.start(9); b.run(12, '   Z  T   c', '  c c'); b.sock({ two: true }); b.hill(14, '00122332210000', '  Z  T  L  Z  '); b.cp();
    b.sock(); b.pit(12, 5, '  Z  c', true); b.nook('r', 'bomb'); b.sky(12); b.run(10, '  L  T  c'); b.goal(10);
  });
  stage('4-3', 'sky', N('風のはっぱ道', 'Leaf Wind Road'), N('みずたまりも あぶくで およごう', 'Swim through the pools'), b => {
    b.start(9); b.run(12, '   U   T   c', ' c c c'); b.water('bubble', { len: 18 }); b.hill(14, '00011222110000', '  L  T  X  L  '); b.cp();
    b.gate('r', 'bomb', { app: 12 }); b.nook('v', 'leaf'); b.pit(14, 6, '  T  L', true); b.sky(12); b.run(10, '  X  T  c'); b.goal(10);
  });
  stage('4-4', 'sky', N('かみなり橋', 'Thunder Bridge'), N('大砲の玉は すいこんで うちかえせる', 'Inhale cannonballs and fire them back'), b => {
    b.start(9); b.run(12, '   C  Z   c', '  c c'); b.gate('k', 'stone', { app: 12 }); b.hill(14, '00122332210000', '  L  C  T  X  '); b.cp();
    b.sock(); b.water('ice', { len: 18 }); b.nook('n', 'fire'); b.sky(12); b.run(10, '  C  T  c'); b.pit(12, 5, '  c', true); b.goal(10);
  });
  stage('4-5', 'sky', N('かみなり雲', 'Thundercloud'), N('はっぱブーメランが とどく。ビリビリは きかない', 'Leaves reach it. Sparks do nothing'), b => {
    b.start(9); b.run(10, '    c c c'); b.pit(12, 4, '  c', true); b.sky(12); b.run(10, '  L  c'); b.boss('cloud', ['leaf', 'bubble']);
  }, { boss: 'cloud' });

  // ================= World 5: Snack Moon Castle =================
  stage('5-1', 'castle', N('おやつの門', 'Snack Gate'), N('これまでの わざの ふくしゅう', 'A review of everything'), b => {
    b.start(9); b.run(12, '   Y   S   c', '  c c'); b.gate('v', 'blade', { app: 12 }); b.hill(14, '00112332211000', '  M  Y  X  Z  '); b.cp();
    b.sock(); b.nook('k', 'bomb'); b.pit(12, 5, '  Y  c', true); b.sky(12); b.gate('r', 'bomb', { app: 11 }); b.goal(10);
  });
  stage('5-2', 'castle', N('キャンディの回廊', 'Candy Corridor'), N('とげの回廊を ふわふわ すすむ', 'Float along the spiky halls'), b => {
    b.start(9); b.run(12, '   X  S   c^^^  c', '  c c'); b.water('ice', { len: 18 }); b.hill(14, '00122332210000', '  Y  S  Z  X  '); b.cp();
    b.gate('n', 'fire', { app: 12 }); b.nook('v', 'blade'); b.sky(12); b.sock({ two: true }); b.run(10, '  S  Y  c'); b.pit(12, 5, '  c', true); b.goal(10);
  });
  stage('5-3', 'castle', N('ねむれない時計塔', 'Sleepless Clock Tower'), N('いしで ブロックを くだいて すすめ', 'Smash through the blocks'), b => {
    b.start(9); b.hill(14, '00122332210000', '  R  S  X  Y  '); b.gate('k', 'stone', { app: 12 }); b.run(10, '  S  C  c'); b.cp();
    b.water('bubble', { len: 18 }); b.gate('v', 'blade', { app: 11 }); b.nook('r', 'fire'); b.sky(12); b.pit(14, 6, '  S  Z', true); b.sock(); b.goal(10);
  });
  stage('5-4', 'castle', N('星のひろま', 'Star Plaza'), N('すべてのわざを つかいこなそう', 'Master every ability'), b => {
    b.start(9); b.run(12, '   Z  S   c', '  c c'); b.gate('r', 'fire', { app: 12 }); b.water('ice', { len: 18 }); b.hill(12, '001232232100', '  Y  X  S  '); b.cp();
    b.sock({ two: true }); b.gate('k', 'stone', { app: 11 }); b.nook('v', 'leaf'); b.sky(12); b.pit(14, 6, '  T  X', true); b.gate('n', 'bomb', { app: 10 }); b.run(8, '  S c'); b.goal(10);
  });
  stage('5-5', 'castle', N('ムーン王', 'King Moon'), N('三つのすがた。きりさきと ばくだんが こうかてき', 'Three forms. Blades and bombs work best'), b => {
    b.start(9); b.run(10, '    c c c'); b.pit(12, 4, '  c', true); b.sky(12); b.run(10, '  Y  c'); b.boss('moon', ['blade', 'bomb', 'spark']);
  }, { boss: 'moon' });

  const LEVELS = DEFS;
  const LV = {
    WORLDS, LEVELS, H,
    get(id) { return LEVELS.find(l => l.id === id) || null; },
    ids() { return LEVELS.map(l => l.id); },
    world(id) { return WORLDS[(+String(id).split('-')[0]) - 1] || null; },
    index(id) { const m = /^(\d+)-(\d+)$/.exec(id); return m ? (m[1] - 1) * 5 + (m[2] - 1) : -1; },
    idOf(i) { return (Math.floor(i / 5) + 1) + '-' + ((i % 5) + 1); },
  };
  if (typeof module === 'object' && module && module.exports) module.exports = LV;
  root.PuffLevels = LV;
})(typeof window !== 'undefined' ? window : globalThis);
