// のんびり釣り：エンジン（pure。DOM・Date.now・Math.random を使わない。時刻は引数で受け取る）。
// 乱数は種つきの mulberry32。同じ種・同じ入力なら、あたり・大きさ・引きの流れが毎回同じになる。
(function (root) {
  'use strict';
  const FB = (typeof require === 'function' && typeof module === 'object') ? require('./fish.js') : root.FishingFish;
  const FISH = FB.FISH, N = FISH.length;

  // ---------- 乱数・ハッシュ ----------
  function hash32(s) { s = String(s); let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h >>> 0; }
  function rng(seed) { let a = seed >>> 0; return function () { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));

  // ---------- 場所（FISH の loc は 'PRSEHTKOCDIN' の位置） ----------
  const LOCATIONS = [
    { id: 'pond', ja: 'のどかなため池', en: 'Quiet Pond', unlock: 0, water: 'fresh', ja2: 'はじめの場所。ハスの葉とカエルの声。', en2: 'Where everyone starts. Lily pads and frog songs.' },
    { id: 'river', ja: 'ゆるやかな川', en: 'Lazy River', unlock: 3, water: 'fresh', ja2: 'ゆったり流れる川。川魚がたくさん。', en2: 'A slow, wide river full of river fish.' },
    { id: 'stream', ja: '山の渓流', en: 'Mountain Stream', unlock: 12, water: 'fresh', ja2: '冷たくて澄んだ水。マスの仲間の場所。', en2: 'Cold, clear water: trout country.' },
    { id: 'estuary', ja: '川の河口', en: 'River Mouth', unlock: 16, water: 'brackish', ja2: '川と海がまざる場所。', en2: 'Where river and sea mix.' },
    { id: 'harbour', ja: 'のんびり港', en: 'Sleepy Harbour', unlock: 8, water: 'salt', ja2: '岸壁と小さな船。アジやイワシの群れ。', en2: 'Quays and little boats. Schools of small fish.' },
    { id: 'tide', ja: '潮だまり', en: 'Tide Pools', unlock: 22, water: 'salt', ja2: '引き潮に残る小さな水たまり。', en2: 'Small pools left behind by the tide.' },
    { id: 'rocky', ja: '波の磯', en: 'Rocky Shore', unlock: 30, water: 'salt', ja2: '岩場に波がくだける。強い魚が多い。', en2: 'Waves break on rocks. Strong fish live here.' },
    { id: 'open', ja: '青い沖', en: 'Open Sea', unlock: 56, water: 'salt', ja2: 'どこまでも青い海。大物の場所。', en2: 'Endless blue sea. Big-game waters.' },
    { id: 'reef', ja: 'さんご礁', en: 'Coral Reef', unlock: 70, water: 'salt', ja2: '色とりどりの魚がくらす南の海。', en2: 'A warm sea full of colourful fish.' },
    { id: 'deep', ja: '深海のふち', en: 'Deep Sea Edge', unlock: 85, water: 'salt', ja2: '光のとどかない暗い海。ふしぎな生きもの。', en2: 'Dark water beyond the light. Strange creatures.' },
    { id: 'ice', ja: '氷の穴', en: 'Ice Hole', unlock: 38, water: 'fresh', ja2: '凍った湖にあけた小さな穴。冬の楽しみ。', en2: 'A small hole in a frozen lake. A winter treat.' },
    { id: 'night', ja: '月夜の湖', en: 'Moonlit Lake', unlock: 46, water: 'fresh', ja2: '夜に目をさます、大きな静かな湖。', en2: 'A big, still lake that wakes up at night.' },
  ];
  const LOC_ORDER = [0, 1, 4, 2, 3, 5, 6, 10, 11, 7, 8, 9];

  // ---------- 道具 ----------
  const RODS = [
    { ja: '竹ざお', en: 'Bamboo Rod', power: 1, cast: 1.0, price: 0 }, { ja: 'グラスロッド', en: 'Glass Rod', power: 2, cast: 1.12, price: 300 },
    { ja: 'カーボンロッド', en: 'Carbon Rod', power: 3, cast: 1.25, price: 1200 }, { ja: 'ロングキャスター', en: 'Long Caster', power: 4, cast: 1.42, price: 4000 },
    { ja: '名人のさお', en: "Master's Rod", power: 5, cast: 1.6, price: 12000 },
  ];
  const REELS = [
    { ja: 'ポケットリール', en: 'Pocket Reel', speed: 1.0, price: 0 }, { ja: 'なめらかリール', en: 'Smooth Reel', speed: 1.2, price: 250 },
    { ja: 'しずかリール', en: 'Quiet Reel', speed: 1.45, price: 1000 }, { ja: 'はやまきリール', en: 'Quick Reel', speed: 1.75, price: 3500 }, { ja: 'ゆめのリール', en: 'Dream Reel', speed: 2.1, price: 10000 },
  ];
  const LINES = [
    { ja: 'ふつうの糸', en: 'Basic Line', str: 1.0, price: 0 }, { ja: 'じょうぶな糸', en: 'Sturdy Line', str: 1.25, price: 200 },
    { ja: 'よりあわせ糸', en: 'Braided Line', str: 1.6, price: 900 }, { ja: 'はがね糸', en: 'Steel-core Line', str: 2.1, price: 3000 }, { ja: 'ほしぞら糸', en: 'Starlight Line', str: 2.8, price: 9000 },
  ];
  // えさ（使うと減る。ねりえは無限）。diet 文字ごとの食いつきの倍率
  const BAITS = [
    { ja: 'ねりえ', en: 'Dough Bait', price: 0, pack: 0, m: { o: 1.6, f: 1, b: 0.8, i: 0.7, c: 0.5, p: 0.35, g: 0.3 } },
    { ja: 'ミミズ', en: 'Earthworm', price: 30, pack: 10, m: { o: 1.4, b: 1.8, i: 1.5, c: 0.8, p: 0.7, f: 0.4, g: 0.3 } },
    { ja: 'エビ', en: 'Shrimp', price: 50, pack: 10, m: { c: 2, b: 1.5, p: 1, o: 0.8, i: 0.4, f: 0.4, g: 0.6 } },
    { ja: '小魚', en: 'Minnow', price: 60, pack: 10, m: { p: 2.2, b: 0.8, o: 0.5, c: 0.7, i: 0.3, f: 0.3, g: 0.8 } },
    { ja: 'イカの切り身', en: 'Squid Strip', price: 80, pack: 10, m: { p: 1.6, c: 1.4, g: 2, b: 1, o: 0.5, i: 0.2, f: 0.3 } },
  ];
  // ルアー（買えば何度でも使える。待ち時間が短くなる）
  const LURES = [
    { ja: 'スプーン', en: 'Spoon Lure', price: 150, wait: 0.75, big: 0.04, m: { p: 1.8, o: 0.8, i: 0.6, b: 0.3, c: 0.3, f: 0.3, g: 0.5 } },
    { ja: 'フライ', en: 'Fly Lure', price: 150, wait: 0.8, big: 0.02, m: { i: 2.2, f: 1.1, p: 0.8, o: 0.5, b: 0.3, c: 0.3, g: 0.2 } },
    { ja: 'ジグ', en: 'Jig Lure', price: 400, wait: 0.7, big: 0.06, m: { p: 1.6, b: 1.4, c: 0.8, g: 1.2, o: 0.4, i: 0.3, f: 0.3 } },
    { ja: 'ポッパー', en: 'Popper Lure', price: 700, wait: 0.65, big: 0.08, m: { p: 2, f: 0.6, o: 0.5, i: 0.5, b: 0.2, c: 0.3, g: 0.3 } },
    { ja: 'ひかるルアー', en: 'Glow Lure', price: 1200, wait: 0.6, big: 0.1, m: { g: 2, p: 1.2, f: 1, c: 0.6, o: 0.3, i: 0.3, b: 0.4 } },
  ];
  const DECOR = [
    { ja: '水草', en: 'Water Plants', price: 60 }, { ja: '丸い石', en: 'Round Stones', price: 80 }, { ja: '貝がら', en: 'Seashells', price: 120 }, { ja: 'あわの泡', en: 'Bubble Stream', price: 200 },
    { ja: 'ランプ', en: 'Little Lamp', price: 300 }, { ja: 'おしろ', en: 'Tiny Castle', price: 400 }, { ja: 'たからばこ', en: 'Treasure Chest', price: 500 }, { ja: 'サンゴの木', en: 'Coral Tree', price: 800 },
  ];

  // ---------- 時刻・天気・季節 ----------
  // ms は Date.now()。tz は getTimezoneOffset（分）。clk: 0 実時間 / 1 ゲーム内時計（実1分=ゲーム1時間）/ 2..5 朝・昼・夕・夜に固定。sn: 0 実際の季節 / 1..4 春夏秋冬に固定
  function envAt(ms, o) {
    o = o || {}; const tz = o.tz != null ? o.tz : new Date(ms).getTimezoneOffset();
    const d = new Date(ms - tz * 60000), clk = o.clk | 0, sn = o.sn | 0;
    let hour = d.getUTCHours() + d.getUTCMinutes() / 60 + d.getUTCSeconds() / 3600;
    if (clk === 1) hour = (ms / 60000) % 24; else if (clk >= 2 && clk <= 5) hour = [6.5, 12, 17.5, 22][clk - 2];
    const t = hour >= 5 && hour < 8 ? 0 : hour >= 8 && hour < 16 ? 1 : hour >= 16 && hour < 19 ? 2 : 3;
    const mo = d.getUTCMonth() + 1, season = sn >= 1 && sn <= 4 ? sn - 1 : mo >= 3 && mo <= 5 ? 0 : mo >= 6 && mo <= 8 ? 1 : mo >= 9 && mo <= 11 ? 2 : 3;
    const blk = Math.floor((ms - tz * 60000) / 14400000), wv = hash32('wx:' + blk) % 100;
    const wx = wv < 48 ? 0 : wv < 80 ? 1 : 2;
    return { t, hour, season, wx, snow: wx === 2 && season === 3 };
  }

  // ---------- あたりの表 ----------
  const RW = [0, 100, 50, 22, 8, 2.2];
  function dietMult(f, gear) {
    const g = gear || {}; const src = g.sl != null && g.sl >= 0 ? LURES[g.sl] : BAITS[g.sb | 0] || BAITS[0];
    return src.m[f.diet] != null ? src.m[f.diet] : 0.5;
  }
  function fishWeight(f, env, gear) {
    return RW[f.r] * ((f.time >> env.t) & 1 ? 1 : 0.18) * ((f.wx >> env.wx) & 1 ? 1 : 0.45) * ((f.season >> env.season) & 1 ? 1 : 0.2) * dietMult(f, gear);
  }
  function biteTable(env, loc, gear) {
    const out = []; for (const f of FISH) if (f.loc.includes(loc)) out.push({ i: f.i, w: fishWeight(f, env, gear) });
    return out;
  }
  function pickFish(rnd, env, loc, gear, maxR) {
    const tb = biteTable(env, loc, gear).filter(x => !maxR || FISH[x.i].r <= maxR); let tot = 0; for (const x of tb) tot += x.w;
    let u = rnd() * tot; for (const x of tb) { u -= x.w; if (u <= 0) return x.i; } return tb.length ? tb[tb.length - 1].i : 0;
  }
  // 今この場所で「ぴったり」あう魚（時間・天気・季節がぜんぶあう）の数
  function fitNow(env, loc) { let n = 0; for (const f of FISH) if (f.loc.includes(loc) && (f.time >> env.t & 1) && (f.wx >> env.wx & 1) && (f.season >> env.season & 1)) n++; return n; }
  // 大きさ（cm×10 の整数）。小さめが多く、まれに大物
  function rollSize(rnd, f, bias) {
    let u = (rnd() + rnd() + rnd()) / 3; u = Math.pow(u, 1.45); if (rnd() < 0.03 + (bias || 0)) u = 0.85 + rnd() * 0.15;
    return Math.round((f.min + (f.max - f.min) * clamp(u, 0, 1)) * 10);
  }
  const sizeFrac = (f, cm10) => (f.max > f.min ? clamp((cm10 / 10 - f.min) / (f.max - f.min), 0, 1) : 0.5);
  const BASE_COIN = [0, 6, 14, 35, 90, 260];
  const sellValue = (f, cm10) => Math.max(1, Math.round(BASE_COIN[f.r] * (0.6 + 0.8 * sizeFrac(f, cm10))));

  // ---------- 投げる・待つ・あたり ----------
  const castDistance = (power, rod) => (5 + 20 * clamp(power, 0, 1)) * (RODS[rod | 0] || RODS[0]).cast;
  const HOOKWIN = { n: 1.1, s: 1.8, d: 0.7, y: 0.9 };
  // 1回の投げの全部（魚・大きさ・待ち時間・つんつんの時刻・合わせの窓）を種から決める。同じ種なら同じ。
  function planBite(seed, env, loc, gear, opt) {
    opt = opt || {}; const r = rng(seed >>> 0), g = gear || {};
    const fi = opt.force != null ? opt.force : pickFish(r, env, loc, g), f = FISH[fi];
    const lure = g.sl != null && g.sl >= 0 ? LURES[g.sl] : null;
    const cm10 = opt.cm10 || rollSize(r, f, lure ? lure.big : 0);
    let wait = (2.5 + r() * 6.5) * (lure ? lure.wait : 1) * (1 + 0.1 * (f.r - 1)); wait = Math.max(1.6, wait);
    const wide = opt.wide ? 2 : 1, rodP = (RODS[g.r | 0] || RODS[0]).power;
    const win = (HOOKWIN[f.bite] + 0.08 * (rodP - 1)) * wide;
    let taps = [];
    if (f.bite === 'n') taps = [wait - 1.7, wait - 1.0, wait - 0.45]; else if (f.bite === 'y') taps = [wait - 3, wait - 2.2, wait - 0.9]; else if (f.bite === 's') taps = [wait - 0.5];
    taps = taps.filter(t => t > 0.4);
    return { fi, cm10, wait, taps, winStart: wait, winEnd: wait + win, win, seed: (r() * 4294967296) >>> 0 };
  }
  // 合わせ：t は投げてからの秒。'early'（早すぎ）| 'hook' | 'late'
  function hookResult(plan, t) { if (t < plan.winStart - 0.12) return 'early'; if (t <= plan.winEnd) return 'hook'; return 'late'; }

  // ---------- 引き（テンション・体力・距離） ----------
  const FIGHT = { a: { rest: [0.9, 1.8], warn: 0.45, surge: 0.5, mult: 1.1, leap: 0, drain: 1 }, b: { rest: [1.6, 2.8], warn: 0.6, surge: 1.7, mult: 0.85, leap: 0, drain: 1 },
    c: { rest: [0.5, 1.0], warn: 0.3, surge: 0.6, mult: 0.55, leap: 0, drain: 1.5 }, d: { rest: [1.2, 2.0], warn: 0.5, surge: 1.0, mult: 1.0, leap: 0, drain: 1 }, e: { rest: [1.3, 2.3], warn: 0.4, surge: 0.5, mult: 1.1, leap: 0.6, drain: 1 } };
  const NET_AT = 1.5;
  function fightInit(fi, cm10, gear, seed, opt) {
    opt = opt || {}; const f = FISH[fi], g = gear || {}, rod = RODS[g.r | 0] || RODS[0], reel = REELS[g.e | 0] || REELS[0], line = LINES[g.n | 0] || LINES[0];
    const fr = sizeFrac(f, cm10), p = Math.min(10, f.pow + 1.5 * fr), fp = FIGHT[f.fight], wide = !!opt.wide;
    const d0 = clamp(opt.dist != null ? opt.dist : 12, 4, 40);
    const st = { fi, cm10, p, wide, fight: f.fight, d0, dist: d0, maxDist: d0 * 1.6 + 8, stam: 1, load: 0, T: 0, phase: 'rest', pt: 0, t: 0, slips: 0, slipT: 0, guard: 0, rs: seed >>> 0, status: 'fight', net: null, reelOn: false,
      ls: line.str, rodP: rod.power, speed: 2.3 * reel.speed, reelF: 0.34 + 0.05 * rod.power, restF: 0.08 + 0.02 * p,
      surgeF: (0.28 + 0.1 * p) * (1 - 0.03 * rod.power) * fp.mult * (wide ? 0.88 : 1), runSpeed: 0.5 + 0.2 * p, drain: 0.12 * (1 + 0.12 * rod.power) / (1 + 0.09 * p) * fp.drain, nextRest: true };
    st.pt = 0.8; return st;
  }
  function rnd(st) { st.rs = (st.rs + 0x6D2B79F5) >>> 0; let t = st.rs; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }
  function nextPhase(st, ev) {
    const fp = FIGHT[st.fight];
    if (st.phase === 'rest') { st.phase = 'warn'; st.pt = fp.warn * (st.wide ? 1.8 : 1); ev.push('warn'); }
    else if (st.phase === 'warn') { st.phase = 'surge'; st.pt = fp.surge; ev.push('surge'); }
    else if (st.phase === 'surge' && fp.leap) { st.phase = 'leap'; st.pt = fp.leap; ev.push('leap'); }
    else { st.phase = 'rest'; st.pt = fp.rest[0] + rnd(st) * (fp.rest[1] - fp.rest[0]); ev.push('rest'); }
  }
  // 1コマ進める。held = リールを巻いているか。返り値はイベント名の配列（'warn' 'surge' 'leap' 'rest' 'slip' 'net' 'escape'）
  function fightStep(st, held, dt) {
    const ev = []; if (st.status !== 'fight') return ev;
    st.t += dt; st.pt -= dt; let guard = 0; while (st.pt <= 0 && guard++ < 6) { const over = -st.pt; nextPhase(st, ev); st.pt -= over; }
    if (st.slipT > 0) st.slipT -= dt; if (st.guard > 0) st.guard -= dt;
    const reel = !!held && st.slipT <= 0; st.reelOn = reel;
    const surge = st.phase === 'surge', leap = st.phase === 'leap';
    const pull = surge ? st.surgeF : leap ? 0 : st.phase === 'warn' ? st.restF * 1.3 : st.restF;
    const target = pull + (reel ? (leap ? st.reelF * 0.2 : st.reelF) : 0);
    st.load += (target - st.load) * (1 - Math.exp(-7 * dt));
    if (st.guard > 0) st.load = Math.min(st.load, 0.9 * st.ls);
    st.T = st.load / st.ls;
    if (st.T >= 1) { st.slips++; st.load = 0.3 * st.ls; st.T = 0.3; st.slipT = st.wide ? 0.5 : 0.9; st.guard = 1.2; st.dist += st.wide ? 0.6 : 1.5; st.stam = Math.min(1, st.stam + 0.05); ev.push('slip'); }
    if (reel && !leap) st.dist -= st.speed * (0.3 + 0.7 * (1 - st.stam)) * (surge ? 0.35 : 1) * dt;
    if (surge) st.dist += st.runSpeed * (reel ? 0.55 : 1) * (st.wide ? 0.7 : 1) * dt;
    if (reel && st.T > 0.2 && st.T < 0.92) st.stam = Math.max(0, st.stam - st.drain * (surge ? 1.4 : 1) * dt);
    else if (!reel) st.stam = Math.min(1, st.stam + 0.012 * dt);
    if (st.dist <= NET_AT) { st.dist = NET_AT; st.status = 'net'; const zw = Math.max(0.22, 0.4 - 0.018 * st.p) * (st.wide ? 1.6 : 1); st.net = { pos: 0, dir: 1, c: 0.25 + rnd(st) * 0.5, zw, miss: 0 }; ev.push('net'); }
    else if (!st.wide && st.dist > st.maxDist) { st.status = 'escaped'; ev.push('escape'); }
    else if (st.wide && st.dist > st.maxDist) st.dist = st.maxDist;
    return ev;
  }
  function netTick(st, dt) { const n = st.net; if (!n || st.status !== 'net') return; n.pos += n.dir * 1.25 * dt; if (n.pos >= 1) { n.pos = 1; n.dir = -1; } else if (n.pos <= 0) { n.pos = 0; n.dir = 1; } }
  // たも入れ：'landed' | 'miss'（少し引きもどされる。罰はなし）
  function netPress(st) {
    if (st.status !== 'net') return null; const n = st.net;
    if (Math.abs(n.pos - n.c) <= n.zw / 2 || (st.wide && n.miss >= 2)) { st.status = 'landed'; return 'landed'; }
    n.miss++; st.status = 'fight'; st.dist = NET_AT + 2.5; st.stam = Math.min(1, st.stam + 0.06); st.phase = 'rest'; st.pt = 1.2; return 'miss';
  }
  // テスト・ボット用：安全なときだけ巻く。たも入れは窓の中で押す
  function botHold(st) {
    if (st.status !== 'fight') return false; if (st.phase === 'leap') return false;
    const add = st.phase === 'surge' ? st.surgeF : st.phase === 'warn' ? 0.3 * st.surgeF : st.restF;
    return (add + st.reelF) / st.ls < 0.88 && st.T < 0.8 && !(st.phase === 'warn' && st.pt < 0.25 && (st.surgeF + st.reelF) / st.ls >= 0.9);
  }
  function botFight(fi, cm10, gear, seed, opt) {
    const st = fightInit(fi, cm10, gear, seed, opt), dt = 1 / 30; let t = 0, nets = 0;
    while (t < 240 && st.status !== 'escaped' && st.status !== 'landed') {
      if (st.status === 'net') { netTick(st, dt); if (Math.abs(st.net.pos - st.net.c) < st.net.zw / 2 * 0.6) { netPress(st); nets++; } } else fightStep(st, botHold(st), dt);
      t += dt;
    }
    return { st, t, status: st.status, slips: st.slips };
  }

  // ---------- ずかん（30ビットずつ5つの整数）・保存 ----------
  const ZW = Math.ceil(N / 30);
  const zHas = (s, i) => !!((s.z[(i / 30) | 0] >>> (i % 30)) & 1);
  const zSet = (s, i) => { s.z[(i / 30) | 0] |= 1 << (i % 30); };
  const zCount = s => { let n = 0; for (let i = 0; i < N; i++) if (zHas(s, i)) n++; return n; };
  function newSave() {
    return { v: 1, zc: 0, z: new Array(ZW).fill(0), b: {}, coins: 0, g: { r: 0, e: 0, n: 0, u: 0, a: [0, 0, 0, 0, 0], sb: 0, sl: -1 }, lc: 0, lm: 1,
      q: { k: 0, o: [], p: [], d: [], sp: [] }, tn: { k: 0, loc: 0, r: 0, s: 0, done: 0, w: 0, bt: 0 }, aq: { f: [], d: 0 }, set: { clk: 0, sn: 0, wide: 0, vib: 1, off: 1 }, ts: 0,
      stats: { catches: 0, casts: 0, big: 0, rare: 0, r5: 0, night: 0, rain: 0, orders: 0, earned: 0, away: 0, locs: 1, bought: 0 }, tut: 0 };
  }
  const int = (v, d, lo, hi) => { v = Math.floor(Number(v)); return Number.isFinite(v) ? clamp(v, lo == null ? 0 : lo, hi == null ? 1e9 : hi) : d; };
  function derive(s) {
    s.zc = zCount(s); s.stats.locs = LOCATIONS.reduce((a, _, i) => a + ((s.lm >> i) & 1), 0);
    if (!locUnlocked(s, s.lc)) s.lc = 0; return s;
  }
  const locUnlocked = (s, i) => !!LOCATIONS[i] && s.zc >= LOCATIONS[i].unlock;
  function sanitize(o) {
    const s = newSave(); if (!o || typeof o !== 'object') return derive(s);
    if (Array.isArray(o.z)) for (let i = 0; i < ZW; i++) s.z[i] = int(o.z[i], 0, 0, 0x3fffffff);
    if (o.b && typeof o.b === 'object') for (const k of Object.keys(o.b)) { const i = +k; if (Number.isInteger(i) && i >= 0 && i < N) { const v = int(o.b[k], 0, 0, 1e6); if (v > 0) { s.b[i] = v; zSet(s, i); } } }
    s.coins = int(o.coins, 0, 0, 1e9);
    if (o.g && typeof o.g === 'object') { s.g.r = int(o.g.r, 0, 0, RODS.length - 1); s.g.e = int(o.g.e, 0, 0, REELS.length - 1); s.g.n = int(o.g.n, 0, 0, LINES.length - 1); s.g.u = int(o.g.u, 0, 0, (1 << LURES.length) - 1);
      if (Array.isArray(o.g.a)) for (let i = 0; i < BAITS.length; i++) s.g.a[i] = int(o.g.a[i], 0, 0, 9999);
      s.g.sb = int(o.g.sb, 0, 0, BAITS.length - 1); s.g.sl = int(o.g.sl, -1, -1, LURES.length - 1); if (s.g.sl >= 0 && !((s.g.u >> s.g.sl) & 1)) s.g.sl = -1; }
    s.lc = int(o.lc, 0, 0, LOCATIONS.length - 1); s.lm = int(o.lm, 1, 0, (1 << LOCATIONS.length) - 1) | 1;
    if (o.q && typeof o.q === 'object') { s.q.k = int(o.q.k, 0); for (const f of ['o', 'p', 'd', 'sp']) if (Array.isArray(o.q[f])) s.q[f] = o.q[f].slice(0, 6).map(x => (Array.isArray(x) ? x.map(y => int(y, 0, 0, 1e6)) : int(x, 0, 0, 1e6))); }
    if (o.tn && typeof o.tn === 'object') for (const k of Object.keys(s.tn)) s.tn[k] = int(o.tn[k], 0, 0, 1e9);
    if (o.aq && typeof o.aq === 'object') { s.aq.d = int(o.aq.d, 0, 0, (1 << DECOR.length) - 1); if (Array.isArray(o.aq.f)) s.aq.f = [...new Set(o.aq.f.map(x => int(x, -1, -1, N - 1)).filter(x => x >= 0))].slice(0, 12); }
    if (o.set && typeof o.set === 'object') { s.set.clk = int(o.set.clk, 0, 0, 5); s.set.sn = int(o.set.sn, 0, 0, 4); s.set.wide = o.set.wide ? 1 : 0; s.set.vib = 'vib' in o.set ? (o.set.vib ? 1 : 0) : 1; s.set.off = 'off' in o.set ? (o.set.off ? 1 : 0) : 1; }
    s.ts = int(o.ts, 0, 0, 1e14); s.tut = int(o.tut, 0, 0, 1);
    if (o.stats && typeof o.stats === 'object') for (const k of Object.keys(s.stats)) s.stats[k] = int(o.stats[k], s.stats[k], 0, 1e9);
    s.aq.f = s.aq.f.filter(i => zHas(s, i)); return derive(s);
  }
  const gearOf = s => ({ r: s.g.r, e: s.g.e, n: s.g.n, sb: s.g.a[s.g.sb] > 0 || s.g.sb === 0 ? s.g.sb : 0, sl: s.g.sl });
  // 釣れた魚を保存に入れる。返り値：{ isNew, best（自己ベスト更新）, coins, big }
  function recordCatch(s, fi, cm10, env, loc, sellRate) {
    const f = FISH[fi], isNew = !zHas(s, fi); zSet(s, fi);
    const best = !(s.b[fi] >= cm10); if (best) s.b[fi] = cm10;
    const coins = Math.round(sellValue(f, cm10) * (sellRate == null ? 1 : sellRate)); s.coins += coins; s.stats.earned += coins; s.stats.catches++;
    const big = sizeFrac(f, cm10) >= 0.85; if (big) s.stats.big++; if (f.r >= 4) s.stats.rare++; if (f.r >= 5) s.stats.r5++;
    if (env && env.t === 3) s.stats.night++; if (env && env.wx === 2) s.stats.rain++;
    if (loc != null) s.lm |= 1 << loc; derive(s); return { isNew, best, coins, big };
  }

  // ---------- 店 ----------
  // 返り値 { ok, why }。お金が足りなければ ok:false（何も減らない）
  function buy(s, kind, idx) {
    const t = { rod: RODS, reel: REELS, line: LINES, lure: LURES, bait: BAITS, decor: DECOR }[kind]; if (!t || !t[idx]) return { ok: false, why: 'bad' };
    const it = t[idx];
    if (kind === 'rod' || kind === 'reel' || kind === 'line') { const k = { rod: 'r', reel: 'e', line: 'n' }[kind]; if (idx <= s.g[k]) return { ok: false, why: 'owned' }; if (idx > s.g[k] + 1) return { ok: false, why: 'order' }; if (s.coins < it.price) return { ok: false, why: 'coins' }; s.coins -= it.price; s.g[k] = idx; }
    else if (kind === 'lure') { if ((s.g.u >> idx) & 1) return { ok: false, why: 'owned' }; if (s.coins < it.price) return { ok: false, why: 'coins' }; s.coins -= it.price; s.g.u |= 1 << idx; }
    else if (kind === 'bait') { if (idx === 0) return { ok: false, why: 'free' }; if (s.coins < it.price) return { ok: false, why: 'coins' }; if (s.g.a[idx] >= 990) return { ok: false, why: 'full' }; s.coins -= it.price; s.g.a[idx] += it.pack; }
    else { if ((s.aq.d >> idx) & 1) return { ok: false, why: 'owned' }; if (s.coins < it.price) return { ok: false, why: 'coins' }; s.coins -= it.price; s.aq.d |= 1 << idx; }
    s.stats.bought++; return { ok: true };
  }

  // ---------- 日替わりオーダー ----------
  const ORDER_TYPES = ['catch', 'species', 'big', 'loc', 'rare', 'night', 'new'];
  // [type, need, arg, reward]
  function dailyOrders(dateKey, zc) {
    const r = rng(hash32('fishing:orders:' + dateKey)), types = ORDER_TYPES.slice(), out = [];
    for (let k = 0; k < 3; k++) { const t = types.splice(Math.floor(r() * types.length), 1)[0]; let n = 1, arg = 0, rw = 0;
      if (t === 'catch') { n = 3 + Math.floor(r() * 4); rw = 20 + 12 * n; } else if (t === 'species') { n = 2 + Math.floor(r() * 3); rw = 30 + 20 * n; } else if (t === 'big') { n = 1 + Math.floor(r() * 2); rw = 60 + 40 * n; }
      else if (t === 'loc') { const un = LOCATIONS.map((l, i) => i).filter(i => zc >= LOCATIONS[i].unlock); arg = un[Math.floor(r() * un.length)]; n = 2 + Math.floor(r() * 3); rw = 30 + 16 * n; }
      else if (t === 'rare') { n = 1; arg = 3; rw = 120; } else if (t === 'night') { n = 2 + Math.floor(r() * 2); rw = 40 + 20 * n; } else { n = 1; rw = 100; }
      out.push([ORDER_TYPES.indexOf(t), n, arg, rw]); }
    return out;
  }
  function orderText(o, lang) {
    const t = ORDER_TYPES[o[0]], n = o[1], L = LOCATIONS[o[2]], ja = lang !== 'en';
    switch (t) {
      case 'catch': return ja ? `魚を${n}ひき釣る` : `Catch ${n} fish`;
      case 'species': return ja ? `ちがう種類を${n}しゅ釣る` : `Catch ${n} different kinds today`;
      case 'big': return ja ? `大きな魚（その魚の大きさの上位）を${n}ひき釣る` : `Catch ${n} big fish (top of their size range)`;
      case 'loc': return ja ? `「${L.ja}」で${n}ひき釣る` : `Catch ${n} at ${L.en}`;
      case 'rare': return ja ? 'レア度★3以上の魚を1ひき釣る' : 'Catch one fish of 3 stars or more';
      case 'night': return ja ? `夜に${n}ひき釣る` : `Catch ${n} fish at night`;
      default: return ja ? 'はじめての魚（ずかんにまだない）を1ひき釣る' : 'Catch a kind not yet in your book';
    }
  }
  // 釣れたときの進み。ev = { i, cm10, loc, isNew, t }。s.q を更新。返り値：進んだ番号の配列
  function orderProgress(s, ev) {
    const f = FISH[ev.i], hit = []; const q = s.q; if (!q.o.length) return hit;
    if (!q.sp.includes(ev.i)) q.sp.push(ev.i);
    q.o.forEach((o, k) => { if (q.d[k]) return; const t = ORDER_TYPES[o[0]]; let add = 0;
      if (t === 'catch') add = 1; else if (t === 'species') { if (q.sp.length > (q.p[k] || 0)) { q.p[k] = q.sp.length; hit.push(k); } return; }
      else if (t === 'big') add = sizeFrac(f, ev.cm10) >= 0.6 ? 1 : 0; else if (t === 'loc') add = ev.loc === o[2] ? 1 : 0; else if (t === 'rare') add = f.r >= o[2] ? 1 : 0; else if (t === 'night') add = ev.t === 3 ? 1 : 0; else add = ev.isNew ? 1 : 0;
      if (add) { q.p[k] = Math.min(o[1], (q.p[k] || 0) + 1); hit.push(k); } });
    return hit;
  }
  // 日が変わったら新しいオーダー（受け取り前の進みは捨てる）。返り値：変わったか
  function ensureOrders(s, dateKey) { if (s.q.k === dateKey && s.q.o.length === 3) return false; s.q = { k: dateKey, o: dailyOrders(dateKey, s.zc), p: [0, 0, 0], d: [0, 0, 0], sp: [] }; return true; }
  const orderDone = (s, k) => !!s.q.o[k] && (s.q.p[k] || 0) >= s.q.o[k][1];
  function claimOrder(s, k) { if (!orderDone(s, k) || s.q.d[k]) return 0; s.q.d[k] = 1; const rw = s.q.o[k][3]; s.coins += rw; s.stats.earned += rw; s.stats.orders++; return rw; }

  // ---------- 大会（毎週・ボットと競う） ----------
  const BOTS = [
    { ja: 'ハルじいさん', en: 'Old Haru', skill: 2 }, { ja: 'つり好きレン', en: 'Ren the Angler', skill: 3 }, { ja: 'トキおばあちゃん', en: 'Granny Toki', skill: 4 },
    { ja: 'しずか', en: 'Shizuka', skill: 3 }, { ja: 'ペンギンのポポ', en: 'Popo the Penguin', skill: 5 }, { ja: 'ねこ船長', en: 'Captain Whiskers', skill: 1 },
  ];
  const TOUR_ROUNDS = 8, TOUR_REWARD = [400, 250, 150, 90, 60, 40, 25];
  const dayNum = k => Date.UTC(Math.floor(k / 10000), Math.floor(k / 100) % 100 - 1, k % 100) / 86400000;
  const dayKey = n => { const d = new Date(n * 86400000); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
  const weekKey = dateKey => { const n = dayNum(dateKey), wd = (n + 4) % 7; return dayKey(n - ((wd + 6) % 7)); };
  function tournamentLoc(wk, zc) { const un = LOCATIONS.map((l, i) => i).filter(i => zc >= LOCATIONS[i].unlock); return un[hash32('fishing:tour:' + wk) % un.length]; }
  // ボット5にんの得点（8投ぶん。あたりの表は大会の場所と、週の昼12時の天気）
  function botScores(wk, loc) {
    const env = { t: 1, wx: hash32('tw:' + wk) % 3, season: 0 }; const out = [];
    for (let b = 0; b < BOTS.length; b++) { const r = rng(hash32('fishing:bot:' + wk + ':' + b)); let sc = 0, c = 0;
      for (let k = 0; k < TOUR_ROUNDS; k++) { if (r() < 0.45 + 0.09 * BOTS[b].skill) { const fi = pickFish(r, env, loc, { sb: 0, sl: -1 }, 4), cm10 = rollSize(r, FISH[fi], 0); sc += cm10; c++; } else { r(); r(); } }
      out.push({ b, score: sc, n: c }); }
    return out;
  }
  function tournamentRank(score, bots) { let r = 1; for (const x of bots) if (x.score > score) r++; return r; }
  function finishTournament(s, rank) { s.tn.done = rank; if (rank === 1) s.tn.w++; if (!s.tn.bt || rank < s.tn.bt) s.tn.bt = rank; const rw = TOUR_REWARD[Math.min(rank, TOUR_REWARD.length) - 1]; s.coins += rw; s.stats.earned += rw; return rw; }

  // ---------- るすの間の釣り（正直・上限つき） ----------
  const OFF = { min: 600, cap: 8 * 3600, base: 900, maxN: 32, rareMax: 3, sizeCap: 0.7, sell: 0.5 };
  const offlineInterval = rod => OFF.base - 60 * (rod | 0);
  function offlineCount(gapSec, rod) { if (!(gapSec >= OFF.min)) return 0; return Math.min(OFF.maxN, Math.floor(Math.min(gapSec, OFF.cap) / offlineInterval(rod))); }
  // 結果だけ返す（保存は変えない）。[{ i, cm10, t(ms), loc }]
  function offlineCatches(s, nowMs, opt) {
    opt = opt || {}; if (!s.ts || !s.set.off) return []; const gap = (nowMs - s.ts) / 1000, n = offlineCount(gap, s.g.r); if (!n) return [];
    const iv = offlineInterval(s.g.r) * 1000, out = [], gear = gearOf(s); gear.sb = 0; gear.sl = -1;
    for (let k = 0; k < n; k++) { const t = s.ts + (k + 1) * iv, env = envAt(t, { tz: opt.tz, clk: 0, sn: 0 }), r = rng(hash32('fishing:off:' + s.ts + ':' + k + ':' + s.lc));
      const fi = pickFish(r, env, s.lc, gear, OFF.rareMax), f = FISH[fi]; let cm10 = rollSize(r, f, 0); cm10 = Math.min(cm10, Math.round((f.min + (f.max - f.min) * OFF.sizeCap) * 10)); out.push({ i: fi, cm10, t, loc: s.lc }); }
    return out;
  }
  function applyOffline(s, list) { let coins = 0, fresh = 0; for (const c of list) { const r = recordCatch(s, c.i, c.cm10, null, c.loc, OFF.sell); coins += r.coins; if (r.isNew) fresh++; s.stats.away++; } return { coins, fresh }; }

  const api = { FISH, N, LOCATIONS, LOC_ORDER, RODS, REELS, LINES, BAITS, LURES, DECOR, hash32, rng, clamp, envAt, RW, biteTable, fishWeight, pickFish, fitNow, rollSize, sizeFrac, sellValue, castDistance, planBite, hookResult, HOOKWIN,
    FIGHT, NET_AT, fightInit, fightStep, netTick, netPress, botHold, botFight, zHas, zSet, zCount, ZW, newSave, sanitize, derive, locUnlocked, gearOf, recordCatch, buy, ORDER_TYPES, dailyOrders, orderText, orderProgress, ensureOrders, orderDone, claimOrder,
    BOTS, TOUR_ROUNDS, TOUR_REWARD, weekKey, dayNum, dayKey, tournamentLoc, botScores, tournamentRank, finishTournament, OFF, offlineInterval, offlineCount, offlineCatches, applyOffline };
  if (typeof module === 'object' && module && module.exports) module.exports = api;
  root.FishingEngine = api;
})(typeof globalThis !== 'undefined' ? globalThis : this);
