// ほしぞら守備隊 (Starfield Guard) - level data and wave generation. Pure data + deterministic functions (node and browser).
//
//   InvadeLevels.CAMPAIGN         45 designed stages (30 waves, 9 boss stages every 5th, 6 bonus stages)
//   InvadeLevels.spec(mode, n, o) the spec of wave n (1-based) for 'classic' | 'survival' | 'endless' | 'daily'
//   InvadeLevels.campaign(i)      the spec of campaign stage i (0-based)
//   InvadeLevels.ENEMY / BOSS / POWER   names, scores, colours
//
// A spec is plain JSON: { id, kind:'wave'|'boss'|'bonus', name, tip, mask:[rows], paint, cols, rows, ov, bi, mi, sx, dy, fy, fi, mb, bv, pat, dv, su, sh, boss, lim }
//   mask rows hold one char per column: '.' empty, 'b' Purun, 'z' Zig, 's' Helm, 'p' Twin, 'd' Diver, 'h' Medic, 'm' Boomer, 'g' gem
(function (root) {
  'use strict';

  const ENEMY = [
    { id: 0, ch: 'b', hp: 1, pts: 10, ja: 'ぷるん', en: 'Purun', col: '#5ef2c0' },
    { id: 1, ch: 'z', hp: 1, pts: 20, ja: 'ジグ', en: 'Zig', col: '#ffd75e' },
    { id: 2, ch: 's', hp: 2, pts: 30, ja: 'カブト', en: 'Helm', col: '#7fb4ff' },
    { id: 3, ch: 'p', hp: 1, pts: 20, ja: 'ふたご', en: 'Twin', col: '#ff8fc4' },
    { id: 4, ch: 'd', hp: 1, pts: 40, ja: 'ダイバー', en: 'Diver', col: '#ff9a5e' },
    { id: 5, ch: 'h', hp: 2, pts: 50, ja: 'メディ', en: 'Medi', col: '#b9a2ff' },
    { id: 6, ch: 'm', hp: 1, pts: 40, ja: 'ドカン', en: 'Boomer', col: '#ff6a6a' },
    { id: 7, ch: '', hp: 1, pts: 10, ja: 'ちび', en: 'Tiny', col: '#ffb3d9' },
    { id: 8, ch: 'g', hp: 1, pts: 50, ja: 'きらり', en: 'Gem', col: '#8ff0ff' },
  ];
  const CH = {}; ENEMY.forEach(e => { if (e.ch) CH[e.ch] = e.id; });

  const POWER = [
    { id: 0, ja: 'スプレッド', en: 'Spread', col: '#ffd75e', g: 'S' },
    { id: 1, ja: 'ラピッド', en: 'Rapid', col: '#5ef2c0', g: 'R' },
    { id: 2, ja: 'つらぬき', en: 'Pierce', col: '#ff8fc4', g: 'P' },
    { id: 3, ja: 'バリア', en: 'Barrier', col: '#7fb4ff', g: 'B' },
    { id: 4, ja: 'スロー', en: 'Slow', col: '#b9a2ff', g: 'T' },
    { id: 5, ja: 'ボム', en: 'Bomb', col: '#ff9a5e', g: 'X' },
    { id: 6, ja: 'シールドなおし', en: 'Repair', col: '#9bff7a', g: '+' },
  ];

  // ---------------------------------------------------------------- shapes (return rows of 'x' and '.')
  const grid = (c, r, f) => { const a = []; for (let i = 0; i < r; i++) { let s = ''; for (let j = 0; j < c; j++) s += f(i, j, c, r) ? 'x' : '.'; a.push(s); } return a; };
  const cen = (i, c, w) => { const l = Math.floor((c - w) / 2); return [l, l + w - 1]; };
  const rowW = (c, w) => { w = Math.max(1, Math.min(c, Math.round(w))); if ((c - w) % 2) w = Math.min(c, w + ((c - w) % 2 ? 1 : 0)); if ((c - w) % 2) w -= 1; return w; };
  const SHAPES = {
    block: (c, r) => grid(c, r, () => true),
    pyramid: (c, r) => grid(c, r, (i, j) => { const w = rowW(c, c * (i + 1) / r); const [l, h] = cen(i, c, w); return j >= l && j <= h; }),
    invpyr: (c, r) => grid(c, r, (i, j) => { const w = rowW(c, c * (r - i) / r); const [l, h] = cen(i, c, w); return j >= l && j <= h; }),
    diamond: (c, r) => grid(c, r, (i, j) => { const m = (r - 1) / 2, f = 1 - Math.abs(i - m) / (m + 0.5); const w = rowW(c, c * f); const [l, h] = cen(i, c, w); return j >= l && j <= h; }),
    checker: (c, r) => grid(c, r, (i, j) => (i + j) % 2 === 0),
    ring: (c, r) => grid(c, r, (i, j) => i === 0 || j === 0 || i === r - 1 || j === c - 1),
    frame: (c, r) => grid(c, r, (i, j) => i === 0 || j === 0 || i === r - 1 || j === c - 1 || (i === (r >> 1) && j === (c >> 1))),
    cross: (c, r) => grid(c, r, (i, j) => i === (r >> 1) || j === (c >> 1) || j === ((c - 1) >> 1)),
    ex: (c, r) => grid(c, r, (i, j) => Math.abs(j - (c - 1) / 2 - (i - (r - 1) / 2) * (c / r) / 1.2) < 1.1 || Math.abs(j - (c - 1) / 2 + (i - (r - 1) / 2) * (c / r) / 1.2) < 1.1),
    wave: (c, r) => grid(c, r, (i, j) => { const k = [0, 1, 2, 1, 0, -1, -2, -1][j % 8]; const mid = (r - 1) / 2; return Math.abs(i - mid - k * 0.5) < 1.2; }),
    cols: (c, r) => grid(c, r, (i, j) => j % 2 === 0),
    cols3: (c, r) => grid(c, r, (i, j) => j % 3 !== 2),
    arrow: (c, r) => grid(c, r, (i, j) => { if (i < r - 2) { const w = rowW(c, 1 + 2 * i); const [l, h] = cen(i, c, w); return j >= l && j <= h; } return j >= ((c - 3) >> 1) && j <= ((c + 1) >> 1); }),
    stairs: (c, r) => grid(c, r, (i, j) => j <= Math.round((i + 1) * (c - 1) / r)),
    rstairs: (c, r) => grid(c, r, (i, j) => j >= c - 1 - Math.round((i + 1) * (c - 1) / r)),
    vee: (c, r) => grid(c, r, (i, j) => { const k = Math.round((r - 1 - i) * (c - 1) / (2 * (r - 1 || 1))); return j === k || j === c - 1 - k || j === k + 1 && i < r - 1 && c > 6 && false; }),
    hourglass: (c, r) => grid(c, r, (i, j) => { const m = (r - 1) / 2, f = Math.abs(i - m) / (m || 1); const w = rowW(c, Math.max(1, c * (0.25 + 0.75 * f))); const [l, h] = cen(i, c, w); return j >= l && j <= h; }),
    comb: (c, r) => grid(c, r, (i, j) => i === 0 || (j % 2 === 0)),
    twin: (c, r) => grid(c, r, (i, j) => j < (c >> 1) - 1 || j > ((c + 1) >> 1)),
    dots: (c, r) => grid(c, r, (i, j) => i % 2 === 0 && j % 2 === 0),
    zig: (c, r) => grid(c, r, (i, j) => (i % 2 === 0 ? j < c - 1 : j > 0)),
    towers: (c, r) => grid(c, r, (i, j) => { const k = [r, r - 2, r - 1, r - 3][((j >> 1) % 4)] || r; return i >= r - k; }),
    heart: (c, r) => grid(c, r, (i, j) => { const x = (j - (c - 1) / 2) / (c / 2), y = (i - (r - 1) / 2) / (r / 2); return Math.pow(x * x + y * y - 1, 3) - x * x * y * y * y <= 0.02 ? true : false; }),
    star: (c, r) => grid(c, r, (i, j) => { const m = (r - 1) / 2, cc = (c - 1) / 2; return (Math.abs(j - cc) <= 0.6 + (r - 1 - i) * 0.25 && i < r - 1) || i === (r >> 1) || (i === r - 1 && Math.abs(j - cc) >= cc * 0.5); }),
    smile: (c, r) => grid(c, r, (i, j) => { const cc = (c - 1) / 2; return (i === 0 && (j === 1 || j === c - 2)) || (i === 1 && (j === 1 || j === c - 2)) || (i >= r - 2 && Math.abs(j - cc) <= cc - 1 && (i === r - 1 ? j > 1 && j < c - 2 : true)); }),
    bricks: (c, r) => grid(c, r, (i, j) => (i % 2 === 0 ? j % 3 !== 2 : (j + 1) % 3 !== 2)),
  };

  // paint: one letter per row (cycles); 'x' cells take the row's letter. ov: [row, col, letter] overrides.
  function build(shape, c, r, paint, ov) {
    const m = SHAPES[shape](c, r).map(s => s.split(''));
    for (let i = 0; i < r; i++) for (let j = 0; j < c; j++) if (m[i][j] === 'x') {
      const ch = paint[i % paint.length];
      m[i][j] = ch === 'h' ? (j % 4 === 1 ? 'h' : 's') : ch === 'm' ? (j % 2 === 0 ? 'm' : 'z') : ch;
    }
    (ov || []).forEach(o => { if (m[o[0]] && m[o[0]][o[1]] && m[o[0]][o[1]] !== '.') m[o[0]][o[1]] = o[2]; });
    return m.map(a => a.join(''));
  }

  // ---------------------------------------------------------------- bosses
  const BOSS = [
    { id: 0, ja: 'おおぷるん', en: 'Big Purun', hp: 34, spd: 0.011, pats: [['fan'], ['fan', 'rain'], ['fan', 'rain']], iv: [130, 105, 90], col: '#5ef2c0', sc: 3000 },
    { id: 1, ja: 'ジグザグ女王', en: 'Zigzag Queen', hp: 42, spd: 0.016, pats: [['line'], ['line', 'fan'], ['line', 'ring']], iv: [120, 100, 80], col: '#ffd75e', sc: 4000 },
    { id: 2, ja: 'カブト大将', en: 'General Helm', hp: 54, spd: 0.010, pats: [['fan'], ['fan', 'bomb'], ['ring', 'bomb']], iv: [120, 100, 85], col: '#7fb4ff', sc: 5000 },
    { id: 3, ja: 'ふたごの母', en: 'Twin Mother', hp: 58, spd: 0.012, pats: [['sum'], ['sum', 'fan'], ['sum', 'rain']], iv: [150, 120, 100], col: '#ff8fc4', sc: 6000 },
    { id: 4, ja: 'ドカン大王', en: 'King Boomer', hp: 66, spd: 0.012, pats: [['bomb'], ['bomb', 'rain'], ['bomb', 'ring']], iv: [110, 90, 75], col: '#ff6a6a', sc: 7000 },
    { id: 5, ja: 'ダイブ提督', en: 'Admiral Dive', hp: 72, spd: 0.018, pats: [['sum', 'line'], ['sum', 'fan'], ['line', 'ring']], iv: [110, 90, 70], col: '#ff9a5e', sc: 8000 },
    { id: 6, ja: 'メディ博士', en: 'Dr. Medi', hp: 80, spd: 0.013, pats: [['fan', 'beam'], ['beam', 'ring'], ['beam', 'rain']], iv: [130, 105, 85], col: '#b9a2ff', sc: 9000 },
    { id: 7, ja: 'くろあな号', en: 'Black Hole', hp: 90, spd: 0.015, pats: [['ring', 'beam'], ['ring', 'line'], ['beam', 'line', 'bomb']], iv: [110, 90, 70], col: '#9a7bff', sc: 10000 },
    { id: 8, ja: 'マザーコメット', en: 'Mother Comet', hp: 110, spd: 0.016, pats: [['fan', 'ring', 'beam'], ['sum', 'line', 'bomb'], ['beam', 'ring', 'rain', 'bomb']], iv: [105, 85, 62], col: '#8ff0ff', sc: 15000 },
  ];

  // ---------------------------------------------------------------- difficulty curve (di = 0 at the very first wave)
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  function curve(di) {
    return {
      bi: clamp(36 - Math.floor(di * 0.5), 18, 36), mi: 3, sx: 4, dy: 8,
      fi: clamp(86 - Math.floor(di * 1.1), 30, 86), mb: clamp(3 + Math.floor(di / 6), 3, 10),
      bv: Math.round((1.25 + di * 0.012) * 100) / 100, su: clamp(1100 - di * 8, 600, 1100),
    };
  }
  const PAT = {
    easy: [['col', 3], ['aim', 1]], mid: [['col', 3], ['aim', 2], ['burst', 1]], hard: [['col', 2], ['aim', 2], ['burst', 2], ['rain', 1]],
  };

  // ---------------------------------------------------------------- the 45 designed stages
  // [ja, en, shape, cols, rows, paint, overrides, extras]
  const D = [
    ['はじめの一歩', 'First Steps', 'block', 7, 2, 'b', [], { sh: 4 }],
    ['ならんでね', 'In a Row', 'block', 8, 3, 'b', [], {}],
    ['ジグザグ登場', 'Enter Zig', 'pyramid', 9, 4, 'bbzz', [], { tip: 'z' }],
    ['ボーナス：きらきら', 'Bonus: Sparkle', 'heart', 9, 6, 'g', [], { kind: 'bonus' }],
    ['ボス：おおぷるん', 'Boss: Big Purun', 'block', 8, 2, 'b', [], { kind: 'boss', b: 0 }],
    ['ひしがた', 'Diamond', 'diamond', 9, 5, 'bzbzb', [], {}],
    ['カブト登場', 'Enter Helm', 'block', 9, 4, 'bzss', [], { tip: 's' }],
    ['はしご', 'Ladder', 'cols', 11, 5, 'zbsbz', [], { sh: 4 }],
    ['ふたご登場', 'Enter Twin', 'checker', 10, 5, 'bpzpb', [], { tip: 'p' }],
    ['ボス：ジグザグ女王', 'Boss: Zigzag Queen', 'block', 9, 2, 'z', [], { kind: 'boss', b: 1 }],
    ['ドカン登場', 'Enter Boomer', 'pyramid', 11, 5, 'mzbsb', [], { tip: 'm' }],
    ['ならぶ塔', 'Twin Towers', 'towers', 10, 6, 'bzsbzs', [], {}],
    ['ボーナス：おほしさま', 'Bonus: Starry', 'star', 9, 7, 'g', [], { kind: 'bonus' }],
    ['リング', 'The Ring', 'ring', 11, 6, 'szbpzb', [], {}],
    ['ボス：カブト大将', 'Boss: General Helm', 'block', 8, 2, 's', [], { kind: 'boss', b: 2 }],
    ['ダイバー登場', 'Enter Diver', 'invpyr', 11, 5, 'bzdsb', [], { tip: 'd', dv: 520 }],
    ['メディ登場', 'Enter Medi', 'block', 10, 5, 'bzssb', [[1, 4, 'h'], [1, 5, 'h']], { tip: 'h' }],
    ['ばつ印', 'The Cross-out', 'ex', 11, 7, 'bzspbzs', [], {}],
    ['ボーナス：スマイル', 'Bonus: Smile', 'smile', 11, 6, 'g', [], { kind: 'bonus' }],
    ['ボス：ふたごの母', 'Boss: Twin Mother', 'block', 9, 3, 'pbp', [], { kind: 'boss', b: 3 }],
    ['いなずま', 'Zigzag Rows', 'zig', 10, 6, 'zbzdsb', [], { dv: 480 }],
    ['さかさピラミッド', 'Upside Down', 'invpyr', 11, 6, 'zsbpzd', [], { dv: 460 }],
    ['くし', 'The Comb', 'comb', 11, 6, 'mbzspb', [], {}],
    ['まんなか守れ', 'Guard the Middle', 'frame', 11, 6, 'zszbbp', [[2, 5, 'h'], [3, 5, 'h']], {}],
    ['ボス：ドカン大王', 'Boss: King Boomer', 'block', 9, 3, 'mbm', [], { kind: 'boss', b: 4 }],
    ['なみなみ', 'Ocean Waves', 'wave', 11, 7, 'zbzbzbz', [], { dv: 440 }],
    ['ボーナス：ハート', 'Bonus: Hearts', 'heart', 11, 7, 'g', [], { kind: 'bonus' }],
    ['しかく3つ', 'Three Squares', 'cols3', 11, 6, 'bsdpmh', [], { dv: 420 }],
    ['のぼり階段', 'Staircase', 'stairs', 11, 7, 'szbmpdh', [], {}],
    ['ボス：ダイブ提督', 'Boss: Admiral Dive', 'block', 10, 3, 'ddb', [], { kind: 'boss', b: 5 }],
    ['くだり階段', 'Down Stairs', 'rstairs', 11, 7, 'mzhspbd', [], { dv: 400 }],
    ['ひしがた2', 'Double Diamond', 'diamond', 11, 7, 'zshbpdm', [[3, 5, 'h']], { dv: 400 }],
    ['ボーナス：きらきら2', 'Bonus: Gemstorm', 'diamond', 11, 7, 'g', [], { kind: 'bonus' }],
    ['ひしめく', 'Crowded', 'block', 11, 6, 'szhdpm', [], { dv: 380 }],
    ['ボス：メディ博士', 'Boss: Dr. Medi', 'block', 10, 3, 'hsh', [], { kind: 'boss', b: 6 }],
    ['ブイの字', 'The V', 'vee', 11, 7, 'bzspdhm', [], { sh: 3 }],
    ['モグラたたき', 'Whack-a-Mole', 'dots', 11, 7, 'dpmhdpm', [], { sh: 3, dv: 360 }],
    ['レンガの壁', 'Brick Wall', 'bricks', 11, 7, 'ssmzhpd', [], { sh: 3 }],
    ['アロー', 'Arrow', 'arrow', 11, 7, 'mzsdhpb', [[4, 5, 'h']], { sh: 3, dv: 340 }],
    ['ボス：くろあな号', 'Boss: Black Hole', 'block', 10, 3, 'zsz', [], { kind: 'boss', b: 7 }],
    ['砂時計', 'Hourglass', 'hourglass', 11, 7, 'hmdspzb', [], { sh: 3, dv: 320 }],
    ['ボーナス：星ぞら', 'Bonus: Constellation', 'star', 11, 7, 'g', [], { kind: 'bonus' }],
    ['ふたつのかたまり', 'Two Camps', 'twin', 11, 7, 'mdhspzz', [], { sh: 3, dv: 320 }],
    ['おおあらし', 'The Great Storm', 'block', 11, 7, 'mdhspsz', [[3, 3, 'h'], [3, 7, 'h']], { sh: 3, dv: 300 }],
    ['ボス：マザーコメット', 'Boss: Mother Comet', 'block', 10, 2, 'zs', [], { kind: 'boss', b: 8 }],
  ];

  function tipFor(ch) {
    const e = ENEMY[CH[ch]];
    return {
      b: { ja: 'ぷるん：いちばん ふつうの なかま。', en: 'Purun: the most common crew member.' },
      z: { ja: 'ジグ：ジグザグに ゆれながら すすむよ。', en: 'Zig: weaves left and right as it marches.' },
      s: { ja: 'カブト：2かい あてないと たおせない。', en: 'Helm: takes two hits.' },
      p: { ja: 'ふたご：たおすと、2ひきの ちびに わかれる。', en: 'Twin: splits into two Tinies when hit.' },
      m: { ja: 'ドカン：おおきな ばくだんを おとす。シールドが ごっそり へる。', en: 'Boomer: drops big bombs that chew through shields.' },
      d: { ja: 'ダイバー：れつから とびだして たいあたり！', en: 'Diver: breaks out of line and dives at you!' },
      h: { ja: 'メディ：まわりを なおして、たおした なかまも よびもどす。さきに たおそう！', en: 'Medi: heals neighbours and revives fallen ones. Take it out first!' },
    }[e.ch];
  }

  function normSpec(i) {
    const d = D[i], kind = d[7].kind || 'wave', di = i;
    const cv = curve(di);
    const mask = build(d[2], d[3], d[4], d[5], d[6]);
    const sp = {
      id: 'c' + (i + 1), n: i + 1, kind, name: { ja: d[0], en: d[1] }, mask, cols: d[3], rows: d[4], shape: d[2], paint: d[5],
      bi: cv.bi, mi: cv.mi, sx: cv.sx, dy: cv.dy, fy: 40 + Math.min(3, Math.floor(di / 10)) * 6, fi: cv.fi, mb: cv.mb, bv: cv.bv, su: cv.su,
      pat: (di < 8 ? PAT.easy : di < 22 ? PAT.mid : PAT.hard), dv: d[7].dv || 0, sh: d[7].sh == null ? 4 : d[7].sh, di,
    };
    if (kind === 'bonus') { Object.assign(sp, { pat: [], fi: 0, mb: 0, bi: 16, su: 300, lim: 1620, dv: 0, di }); }
    if (kind === 'boss') { sp.boss = d[7].b; sp.escort = escortFor(i); sp.mask = sp.escort; sp.rows = sp.escort.length; sp.pat = PAT.easy; sp.fi = Math.max(60, sp.fi + 20); sp.mb = Math.min(sp.mb, 5); sp.su = 900; sp.fy = 130; sp.bi = Math.max(sp.bi, 26); }
    if (d[7].tip) sp.tip = tipFor(d[7].tip);
    return sp;
  }
  // a boss's escort: a thin line of the boss's own kind (the mask in the table is the escort)
  function escortFor(i) { const d = D[i]; return build(d[2], d[3], d[4], d[5], d[6]); }

  const CAMPAIGN = D.map((_, i) => normSpec(i));

  // ---------------------------------------------------------------- endless generation
  const NORMAL = CAMPAIGN.filter(s => s.kind === 'wave');
  const BONUSES = CAMPAIGN.filter(s => s.kind === 'bonus');
  const clone = o => JSON.parse(JSON.stringify(o));
  const UP = { b: 'z', z: 's', s: 'h', p: 'm', d: 'm', h: 'm', m: 'd' };
  function upgrade(mask, n) {
    return mask.map((row, ri) => row.split('').map((c, ci) => (c !== '.' && ((ri * 7 + ci * 3 + n) % 5 === 0) && UP[c]) ? UP[c] : c).join(''));
  }
  const nNormal = w => w - Math.floor(w / 5) - Math.floor((w + 2) / 5);
  function waveKind(w) { return w % 5 === 0 ? 'boss' : w % 5 === 3 ? 'bonus' : 'wave'; }
  // di is the pressure of the wave; w the wave number (1-based)
  function gen(w, o) {
    o = o || {}; const off = o.off || 0, cap = o.cap || 99;
    const di = o.di != null ? o.di : Math.min(cap, w - 1 + off), kind = waveKind(w), cv = curve(di);
    let sp;
    if (kind === 'boss') {
      const cyc = Math.floor((w / 5 - 1) / 9), k = (w / 5 - 1) % 9;
      const base = CAMPAIGN[4 + 5 * k];
      sp = clone(base); sp.boss = k; sp.cyc = cyc;
      Object.assign(sp, { bi: Math.max(cv.bi, 26), fi: Math.max(60, cv.fi + 20), mb: Math.min(cv.mb, 6), bv: cv.bv });
      sp.mask = upgrade(sp.escort, cyc + w); sp.rows = sp.mask.length;
    } else if (kind === 'bonus') {
      sp = clone(BONUSES[Math.floor((w - 3) / 5) % BONUSES.length]); sp.bi = Math.max(12, 18 - Math.floor(di / 8));
    } else {
      const n = nNormal(w) - 1, cyc = Math.floor(n / NORMAL.length);
      sp = clone(NORMAL[(n + (o.rot || 0)) % NORMAL.length]);
      if (cyc > 0) sp.mask = upgrade(sp.mask, cyc * 3 + w);
      Object.assign(sp, { bi: cv.bi, fi: cv.fi, mb: cv.mb, bv: cv.bv, su: cv.su });
      sp.pat = di < 8 ? PAT.easy : di < 22 ? PAT.mid : PAT.hard;
      sp.dv = di >= 15 ? Math.max(300, 560 - di * 6) : (sp.dv || 0);
      sp.sh = di > 30 ? 3 : 4;
    }
    sp.id = (o.mode || 'w') + w; sp.n = w; sp.di = di; sp.kind = kind;
    sp.name = { ja: kind === 'boss' ? 'ボス：' + BOSS[sp.boss].ja : kind === 'bonus' ? 'ボーナスウェーブ' : 'ウェーブ ' + w, en: kind === 'boss' ? 'Boss: ' + BOSS[sp.boss].en : kind === 'bonus' ? 'Bonus Wave' : 'Wave ' + w };
    delete sp.tip;
    return sp;
  }

  // ---------------------------------------------------------------- daily modifiers
  const MODS = [
    { id: 'fast', ja: 'はやあるき', en: 'Brisk March', dja: 'ぜんぶの れつが 25% はやい', den: 'Every formation marches 25% faster' },
    { id: 'rain', ja: 'たまのあめ', en: 'Bullet Rain', dja: 'てきのたまが ふえる', den: 'More enemy bullets' },
    { id: 'nosh', ja: 'シールドなし', en: 'No Shields', dja: 'シールドが ない。そのかわり ライフ+1', den: 'No shields, but +1 life' },
    { id: 'bigb', ja: 'おおだま', en: 'Big Bombs', dja: 'てきのたまが ぜんぶ ばくだんに', den: 'Every enemy shot is a bomb' },
    { id: 'tiny', ja: 'こがた砲台', en: 'Tiny Cannon', dja: 'じぶんが ちいさく すばやい', den: 'Your base is smaller and quicker' },
    { id: 'gold', ja: 'ゴールドラッシュ', en: 'Gold Rush', dja: 'スコア1.5ばい、ライフは2つだけ', den: '1.5x score, but only 2 lives' },
    { id: 'zig', ja: 'ジグだらけ', en: 'All Zig', dja: 'ぷるんが ぜんぶ ジグに', den: 'Every Purun becomes a Zig' },
    { id: 'armor', ja: 'かたいてき', en: 'Tough Crew', dja: 'ぷるん・ジグが 2かい', den: 'Purun and Zig take two hits' },
    { id: 'moon', ja: 'おつきバスびより', en: 'Moon Bus Day', dja: 'おつきバスが ひんぱんに くる', den: 'Moon Buses come often' },
    { id: 'dive', ja: 'ダイブのひ', en: 'Dive Day', dja: 'ダイバーが ひんぱんに とびだす', den: 'Divers break out often' },
  ];

  root.InvadeLevels = { ENEMY, CH, POWER, BOSS, SHAPES, build, curve, PAT, CAMPAIGN, NORMAL, BONUSES, MODS, gen, waveKind, nNormal, upgrade, clone,
    campaign: i => clone(CAMPAIGN[i]) };
  if (typeof module === 'object' && module.exports) module.exports = root.InvadeLevels;
})(typeof window !== 'undefined' ? window : globalThis);
