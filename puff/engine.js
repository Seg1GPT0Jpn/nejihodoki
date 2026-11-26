// ふわふわぱふ (Fluffy Puff) - the pure engine. Runs in node and in the browser: fixed 60 Hz step, no randomness except a seeded LCG.
// Everything here is original: the cloud-creature "ぱふ", its helper "もこ", the creatures, the copy abilities and the bosses.
//
//   PuffEngine.parse(level)            -> L   (static, shared: tiles, spawn list, goal, sockets ...)
//   PuffEngine.newState(L, opts)       -> S   (mutable, plain data; clone() it freely). opts = { players: 1|2, assist: { hearts }, seed }
//   PuffEngine.step(S, in0, in1)       advance one frame. input = bit mask (B.*). S.res is set when the goal is reached. S.ev = this frame's events.
//   PuffEngine.clone(S) / hash(S) / sig(S) / runReplay(L, inputs, opts) / rle(inputs) / unrle(str)
//
// Units: pixels, 16 px tiles, levels are 13 rows high. Positions are the top-left corner of a box.
(function (root) {
  'use strict';
  const TS = 16;
  const B = { L: 1, R: 2, U: 4, D: 8, J: 16, ACT: 32, SW: 64 };
  const T = { AIR: 0, GROUND: 1, ONEWAY: 2, CRACK: 3, ROPE: 4, VINE: 5, SNOW: 6, WATER: 7, SPIKE: 8, SOCKET: 9, SOCKON: 10, DOOR: 11, ICEB: 12, COIN: 13, MEDAL: 14, HEART: 15, GOAL: 16, CP: 17, BRICK: 18 };
  const CH = { '#': T.GROUND, '=': T.ONEWAY, k: T.CRACK, r: T.ROPE, v: T.VINE, n: T.SNOW, '~': T.WATER, '^': T.SPIKE, o: T.SOCKET, D: T.DOOR, i: T.ICEB, c: T.COIN, m: T.MEDAL, h: T.HEART, G: T.GOAL, K: T.CP, b: T.BRICK };
  const SOLID = new Uint8Array(24); [T.GROUND, T.CRACK, T.ROPE, T.VINE, T.SNOW, T.SOCKET, T.SOCKON, T.DOOR, T.ICEB, T.BRICK].forEach(t => { SOLID[t] = 1; });
  const ENEMY_CH = { M: 'mogu', F: 'bobo', Z: 'piri', I: 'kogori', Y: 'kiriri', R: 'goro', L: 'hirari', U: 'puka', X: 'bakuda', T: 'tobi', S: 'togeko', C: 'taiho', W: 'boss' };
  const ABS = ['fire', 'spark', 'ice', 'blade', 'stone', 'leaf', 'bubble', 'bomb'];
  // w,h = box, hp, ab = the copy ability it gives, inh = can be inhaled
  const DEF = {
    mogu: { w: 12, h: 12, hp: 1, inh: 1 }, bobo: { w: 12, h: 12, hp: 1, ab: 'fire', inh: 1 }, piri: { w: 12, h: 12, hp: 1, ab: 'spark', inh: 1, fly: 1 },
    kogori: { w: 12, h: 12, hp: 1, ab: 'ice', inh: 1 }, kiriri: { w: 12, h: 12, hp: 1, ab: 'blade', inh: 1 }, goro: { w: 12, h: 12, hp: 2, ab: 'stone', inh: 1 },
    hirari: { w: 12, h: 10, hp: 1, ab: 'leaf', inh: 1, fly: 1 }, puka: { w: 12, h: 12, hp: 1, ab: 'bubble', inh: 1, fly: 1 }, bakuda: { w: 12, h: 12, hp: 1, ab: 'bomb', inh: 1 },
    tobi: { w: 12, h: 10, hp: 1, inh: 1, fly: 1 }, togeko: { w: 12, h: 12, hp: 3, inh: 0 }, taiho: { w: 16, h: 16, hp: 99, inh: 0 },
    mush: { w: 28, h: 26 }, lava: { w: 30, h: 22 }, snowk: { w: 26, h: 32 }, cloud: { w: 34, h: 22 }, moon: { w: 24, h: 24 },
  };
  const BOSSES = ['mush', 'lava', 'snowk', 'cloud', 'moon'];
  const BOSS_HP = { mush: 12, lava: 12, snowk: 12, cloud: 12, moon: 14 };
  // damage a boss takes from each ability (anything else: 1; a spat star: 2)
  const BOSS_WEAK = { mush: { fire: 3, bomb: 2 }, lava: { ice: 3, bubble: 2 }, snowk: { fire: 3, bomb: 2 }, cloud: { leaf: 3, bubble: 2 }, moon: { blade: 3, bomb: 2, spark: 2 } };
  const PW = 10, PH = 12, MAXHP = 6, MAXFLAP = 6, ACT_R = 300, COOP_SPAN = 230, EPS = 0.001;

  // ---- deterministic sine
  const SIN = new Float64Array(257);
  for (let i = 0; i <= 256; i++) SIN[i] = Math.round(Math.sin(i * Math.PI * 2 / 256) * 1e5) / 1e5;
  function sn(a) { let u = (a / 6.283185307179586) % 1; if (u < 0) u += 1; const f = u * 256, i = f | 0, r = f - i; return SIN[i] + (SIN[i + 1] - SIN[i]) * r; }
  const rnd = S => { S.rng = (Math.imul(S.rng, 1664525) + 1013904223) >>> 0; return S.rng / 4294967296; };
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---- level parsing
  function parse(lv) {
    const rows = lv.rows, H = rows.length, W = Math.max.apply(null, rows.map(r => r.length));
    const L = { id: lv.id, W, H, t: new Uint8Array(W * H), ents: [], start: null, goal: null, cps: [], medals: [], nCoin: 0, nSock: 0, doors: [], doorG: [], sockG: {}, sockN: [], meta: lv, medalAt: {}, boss: lv.boss || null };
    let grp = 0;
    for (let x = 0; x < W; x++) { for (let y = 0; y < H; y++) {
      const c = rows[y][x] || ' ', i = y * W + x;
      if (c === ' ' || c === '.') continue;
      if (CH[c] !== undefined) {
        L.t[i] = CH[c];
        if (c === 'c') L.nCoin++;
        if (c === 'G') L.goal = { x, y };
        if (c === 'K') L.cps.push({ x, y });
        if (c === 'o') { L.nSock++; L.sockG[i] = grp; L.sockN[grp] = (L.sockN[grp] || 0) + 1; }
        if (c === 'D') { if (!L.doorG[grp]) L.doorG[grp] = []; L.doorG[grp].push(i); L.doors.push(i); }
      } else if (c === 'P') L.start = { x, y };
      else if (ENEMY_CH[c]) L.ents.push({ k: c === 'W' ? 'boss' : ENEMY_CH[c], x, y });
    }
      if (L.doorG[grp] && L.doorG[grp].some(i => i % W === x)) grp++;
    }
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (L.t[y * W + x] === T.MEDAL) { L.medalAt[y * W + x] = L.medals.length; L.medals.push({ x, y }); }
    L.cps.sort((a, b) => a.x - b.x);
    for (const e of L.ents) if (e.k === 'taiho') L.t[e.y * W + e.x] = T.BRICK;
    return L;
  }

  // ---- state
  function newPlayer(x, y, id) {
    return { id, x, y, w: PW, h: PH, vx: 0, vy: 0, face: 1, on: false, coy: 0, jh: false, flaps: 0, puff: 0, hp: MAXHP, inv: 0, stun: 0, ab: null, held: null, inh: 0, pm: 0, cd: 0, act: 0, zap: 0,
      slash: 0, stone: 0, dead: 0, swim: false, sx: x, sy: y, gulp: 0, leaf: 0, fire: 0, flash: 0, ci: 0 };
  }
  function newState(L, opts) {
    opts = opts || {};
    const as = opts.assist || {}, np = opts.players === 2 ? 2 : 1;
    const S = { L, f: 0, rng: (hashStr(L.id) ^ (opts.seed | 0)) >>> 0, mod: {}, en: [], pr: [], it: [], ps: [], vw: opts.vw || 320, cam: { x: 0 }, stars: 0, med: 0, hurts: 0, deaths: 0, kills: 0, copies: 0, drops: 0, abGot: 0, inhaled: 0,
      cpIdx: -1, bossDead: 0, res: null, sockOn: 0, sg: [], wipe: 0, ev: [], assist: { hearts: !!as.hearts }, snap: null, np, shake: 0, doorOpen: 0, abUse: {} };
    const st = L.start || { x: 2, y: L.H - 4 };
    for (let i = 0; i < np; i++) S.ps.push(newPlayer(st.x * TS + 3 + i * 12, st.y * TS + 4, i));
    if (opts.ab) S.ps[0].ab = opts.ab;
    spawn(S);
    S.cam.x = camTarget(S);
    S.snap = snapOf(S);
    return S;
  }
  function mkEnemy(k, x, y) {
    const df = DEF[k];
    const e = { k, x: x * TS + (TS - df.w) / 2, y: y * TS + TS - df.h, w: df.w, h: df.h, vx: 0, vy: 0, dir: -1, t: (x * 5) % 40, s: 0, hp: df.hp || 1, dead: 0, rt: 0, fr: 0, hit: 0, pull: -9, on: false, ox: 0, oy: 0, inv: 0, ph: (x % 7) * 0.9 };
    e.ox = e.x; e.oy = e.y;
    if (k === 'taiho') { e.x = x * TS; e.y = y * TS; e.ox = e.x; e.oy = e.y; e.t = 50 + (x * 3) % 40; }
    return e;
  }
  function spawn(S) {
    const L = S.L; S.en = [];
    for (const d of L.ents) {
      if (d.k === 'boss') {
        const bk = L.boss || 'mush', df = DEF[bk];
        const b = { k: 'boss', bk, x: d.x * TS + 8 - df.w / 2, y: d.y * TS + 16 - df.h, w: df.w, h: df.h, vx: 0, vy: 0, dir: -1, s: 0, t: 0, hp: BOSS_HP[bk], max: BOSS_HP[bk], inv: 0, dead: 0, ph: 1, hit: 0, on: false, n: 0, tx: 0, ty: 0, ox: 0, oy: 0, rt: 0, fr: 0, pull: -9 };
        b.ox = b.x; b.oy = b.y; S.en.push(b);
      } else S.en.push(mkEnemy(d.k, d.x, d.y));
    }
  }
  function camTarget(S) {
    const L = S.L, vw = S.vw; let sx = 0, n = 0;
    for (const p of S.ps) if (!p.dead) { sx += p.x + p.w / 2 + p.face * vw * 0.06; n++; }
    if (!n) for (const p of S.ps) { sx += p.x; n++; }
    return Math.max(0, Math.min(L.W * TS - vw, sx / n - vw * 0.5));
  }

  // ---- cloning (the core is plain data; the static level is shared)
  const cl1 = o => { const r = {}; for (const k in o) r[k] = o[k]; if (o.held) r.held = { k: o.held.k, ab: o.held.ab }; return r; };
  const clArr = a => a.map(cl1);
  function snapOf(S) { return { ps: clArr(S.ps), en: clArr(S.en), pr: [], it: clArr(S.it), mod: Object.assign({}, S.mod), stars: S.stars, med: S.med, rng: S.rng, sockOn: S.sockOn, sg: S.sg.slice(), bossDead: S.bossDead, cpIdx: S.cpIdx, doorOpen: S.doorOpen }; }
  function clone(S) {
    return { L: S.L, f: S.f, rng: S.rng, mod: Object.assign({}, S.mod), en: clArr(S.en), pr: clArr(S.pr), it: clArr(S.it), ps: clArr(S.ps), vw: S.vw, cam: { x: S.cam.x }, stars: S.stars, med: S.med, hurts: S.hurts, deaths: S.deaths, kills: S.kills,
      copies: S.copies, drops: S.drops, abGot: S.abGot, inhaled: S.inhaled, cpIdx: S.cpIdx, bossDead: S.bossDead, res: S.res && Object.assign({}, S.res), sockOn: S.sockOn, sg: S.sg.slice(), wipe: S.wipe, ev: [], assist: S.assist, snap: S.snap, np: S.np,
      shake: S.shake, doorOpen: S.doorOpen, abUse: Object.assign({}, S.abUse) };
  }
  function restore(S) {
    const s = S.snap;
    S.ps = clArr(s.ps); S.en = clArr(s.en); S.it = clArr(s.it); S.pr = []; S.mod = Object.assign({}, s.mod); S.stars = s.stars; S.med = s.med; S.rng = s.rng; S.sockOn = s.sockOn; S.sg = s.sg.slice(); S.bossDead = s.bossDead; S.doorOpen = s.doorOpen;
    for (const p of S.ps) { p.hp = MAXHP; p.inv = 90; p.dead = 0; p.vx = 0; p.vy = 0; p.stone = 0; p.zap = 0; p.slash = 0; p.inh = 0; p.held = null; p.puff = 0; p.stun = 0; p.pm = 0; }
    S.wipe = 0; S.cam.x = camTarget(S);
  }

  // ---- tiles
  function tl(S, tx, ty) {
    const L = S.L;
    if (tx < 0 || tx >= L.W) return T.GROUND;
    if (ty < 0) return T.GROUND;
    if (ty >= L.H) return T.AIR;
    const i = ty * L.W + tx, m = S.mod[i];
    return m === undefined ? L.t[i] : m;
  }
  function setTl(S, tx, ty, v) { S.mod[ty * S.L.W + tx] = v; }
  const solid = (S, tx, ty) => SOLID[tl(S, tx, ty)] === 1;
  const ov = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  const ev = (S, t, x, y, a) => { if (S.ev.length < 60) S.ev.push([t, x, y, a]); };
  function eachTile(S, x0, y0, x1, y1, fn) {
    const tx0 = Math.floor(x0 / TS), tx1 = Math.floor((x1 - EPS) / TS), ty0 = Math.floor(y0 / TS), ty1 = Math.floor((y1 - EPS) / TS);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) fn(tx, ty, tl(S, tx, ty));
  }
  // an effect on tiles in a box: kinds = { tileId: replacementTile }
  function affect(S, x0, y0, x1, y1, kinds, evn) {
    let n = 0;
    eachTile(S, x0, y0, x1, y1, (tx, ty, t) => {
      if (kinds[t] !== undefined && tx >= 0 && tx < S.L.W && ty >= 0 && ty < S.L.H) { setTl(S, tx, ty, kinds[t]); n++; if (evn) ev(S, evn, tx * TS + 8, ty * TS + 8, t); }
    });
    return n;
  }
  const K_FIRE = { [T.ROPE]: T.AIR, [T.VINE]: T.AIR, [T.SNOW]: T.AIR }, K_CUT = { [T.VINE]: T.AIR }, K_BOMB = { [T.CRACK]: T.AIR, [T.ROPE]: T.AIR, [T.SNOW]: T.AIR }, K_STONE = { [T.CRACK]: T.AIR }, K_ICE = { [T.WATER]: T.ICEB };

  // ---- collision (shared by hero and creatures)
  function moveX(S, o) {
    o.x += o.vx; let hit = false;
    const ty0 = Math.floor(o.y / TS), ty1 = Math.floor((o.y + o.h - EPS) / TS);
    if (o.vx > 0) { const tx = Math.floor((o.x + o.w - EPS) / TS); for (let ty = ty0; ty <= ty1; ty++) if (solid(S, tx, ty)) { o.x = tx * TS - o.w; hit = true; break; } }
    else if (o.vx < 0) { const tx = Math.floor(o.x / TS); for (let ty = ty0; ty <= ty1; ty++) if (solid(S, tx, ty)) { o.x = (tx + 1) * TS; hit = true; break; } }
    if (hit) o.vx = 0;
    return hit;
  }
  function moveY(S, o, drop) {
    const py = o.y + o.h; o.y += o.vy; o.on = false;
    const tx0 = Math.floor(o.x / TS), tx1 = Math.floor((o.x + o.w - EPS) / TS);
    if (o.vy >= 0) {
      const ty = Math.floor((o.y + o.h - EPS) / TS);
      for (let tx = tx0; tx <= tx1; tx++) { const t = tl(S, tx, ty); if (SOLID[t] || (t === T.ONEWAY && !drop && py <= ty * TS + EPS)) { o.y = ty * TS - o.h; o.vy = 0; o.on = true; break; } }
    } else {
      const ty = Math.floor(o.y / TS);
      for (let tx = tx0; tx <= tx1; tx++) if (solid(S, tx, ty)) { o.y = (ty + 1) * TS; o.vy = 0; return true; }
    }
    return false;
  }

  // ---- helpers
  const cx = o => o.x + o.w / 2, cy = o => o.y + o.h / 2;
  function nearest(S, o) { let b = null, bd = 1e9; for (const p of S.ps) { if (p.dead) continue; const d = Math.abs(cx(p) - cx(o)) + Math.abs(cy(p) - cy(o)) * 0.5; if (d < bd) { bd = d; b = p; } } return b || S.ps[0]; }
  const near = (S, o, r) => S.ps.some(p => !p.dead && Math.abs(cx(p) - cx(o)) < r);
  function hurtP(S, p, src, dmg) {
    if (p.inv > 0 || p.dead || p.stone > 0 || S.res) return false;
    S.hurts++; p.inv = 90; p.stun = 12; p.vy = -2.2; p.vx = (cx(p) < src ? -1.5 : 1.5); p.puff = 0; p.inh = 0; p.zap = 0; p.slash = 0;
    if (!S.assist.hearts) { p.hp -= dmg || 1; if (p.hp <= 0) { p.hp = 0; p.dead = 1; p.held = null; ev(S, 'die', cx(p), cy(p)); } }
    ev(S, 'hurt', cx(p), cy(p));
    return true;
  }
  function spawnIt(S, k, x, y, o) { const it = Object.assign({ k, x, y, w: 10, h: 10, vx: 0, vy: -1.5, t: 0, on: false }, o || {}); S.it.push(it); return it; }
  function addPr(S, k, o) { const pr = Object.assign({ k, own: 0, x: 0, y: 0, w: 8, h: 8, vx: 0, vy: 0, t: 30, dmg: 1, who: 0, g: 0, ab: null, h: 8, hits: 0 }, o); S.pr.push(pr); return pr; }
  function killEnemy(S, e, by) {
    e.dead = 1; e.rt = 0; e.pull = -9; S.kills++; ev(S, 'kill', cx(e), cy(e), e.k);
    if (e.k === 'bakuda' && by !== 'boom') explode(S, cx(e), cy(e), 1, 0);
  }
  function hurtEnemy(S, e, dmg, ab, src) {
    if (e.dead || e.inv > 0) return;
    if (e.k === 'boss') return hurtBoss(S, e, dmg, ab);
    if (e.k === 'taiho') { ev(S, 'clang', cx(e), cy(e)); return; }
    if (ab === 'ice') { if (e.fr <= 0) { e.fr = 150; e.hit = 8; e.inv = 6; ev(S, 'freeze', cx(e), cy(e)); } return; }      // ice freezes (harmless, can be shattered)
    if (e.fr > 0) dmg = Math.max(dmg, e.hp);                                                                        // anything shatters a frozen creature
    e.hp -= dmg; e.hit = 8; e.inv = 6;
    if (e.hp <= 0) killEnemy(S, e, src); else ev(S, 'hit', cx(e), cy(e));
  }
  function hurtBoss(S, b, dmg, ab) {
    if (b.dead || b.inv > 0 || b.s === 9) return;
    const w = BOSS_WEAK[b.bk];
    const d = ab === 'star' ? Math.max(dmg, 2) : (ab && w[ab]) || dmg;
    if (b.bk === 'lava' && b.s === 0 && ab !== 'bubble') { ev(S, 'clang', cx(b), cy(b)); b.inv = 10; return; }       // the shell is hard
    if (b.bk === 'cloud' && ab === 'spark') { ev(S, 'clang', cx(b), cy(b)); b.inv = 10; return; }                   // thunder does not hurt a thundercloud
    b.hp -= d; b.hit = 10; b.inv = 24; ev(S, 'bosshit', cx(b), cy(b), d >= 3 ? 1 : 0);
    const ph = b.hp > b.max * 0.66 ? 1 : b.hp > b.max * 0.33 ? 2 : 3;
    if (b.hp <= 0) { b.dead = 1; S.bossDead = 1; S.kills++; ev(S, 'bossdown', cx(b), cy(b)); spawnIt(S, 'heart', cx(b) - 5, cy(b) - 5); spawnIt(S, 'heart', cx(b) + 10, cy(b) - 5); S.pr = S.pr.filter(p => p.own === 0); S.shake = 30; return; }
    if (ph !== b.ph) { b.ph = ph; b.s = b.bk === 'lava' ? 0 : 0; b.t = 0; ev(S, 'phase', cx(b), cy(b), ph); spawnIt(S, 'heart', cx(b) - 5, b.y - 10); S.shake = 14; }
  }
  function explode(S, x, y, own, ownerId) {
    ev(S, 'boom', x, y); S.shake = Math.max(S.shake, 8);
    affect(S, x - 28, y - 28, x + 28, y + 28, K_BOMB, 'crack');
    for (const e of S.en) if (!e.dead && Math.abs(cx(e) - x) < 30 && Math.abs(cy(e) - y) < 30) hurtEnemy(S, e, 3, 'bomb', 'boom');
    for (const p of S.ps) if (own && !p.dead && Math.abs(cx(p) - x) < 24 && Math.abs(cy(p) - y) < 24) hurtP(S, p, x, 1);
  }
  function checkDoor(S, g) {
    const need = S.L.sockN[g] || 0, ds = S.L.doorG[g];
    if (!ds || !need || (S.sg[g] | 0) < need || (S.doorOpen >> g) & 1) return;
    S.doorOpen |= 1 << g; for (const i of ds) S.mod[i] = T.AIR; ev(S, 'door', (ds[0] % S.L.W) * TS + 8, Math.floor(ds[0] / S.L.W) * TS + 8);
  }

  // ---- the hero
  function mouth(p) { return { x: p.face > 0 ? p.x + p.w : p.x, y: p.y + 3 }; }
  function stepPlayer(S, p) {
    const m = p.in, prev = p.pm; p.pm = m;
    const edge = b => (m & b) && !(prev & b);
    if (p.dead) { p.dead++; p.vy = -0.2; p.vx = 0; p.y = Math.max(-6, p.y + p.vy); return; }
    if (p.inv > 0) p.inv--; if (p.stun > 0) p.stun--; if (p.cd > 0) p.cd--; if (p.gulp > 0) p.gulp--; if (p.flash > 0) p.flash--;
    const L = S.L, W = L.W * TS;
    const cxp = cx(p), cyp = cy(p);
    p.swim = p.ab === 'bubble' && (tl(S, Math.floor(cxp / TS), Math.floor(cyp / TS)) === T.WATER || tl(S, Math.floor(cxp / TS), Math.floor((p.y + p.h - 3) / TS)) === T.WATER);
    const dx = ((m & B.R) ? 1 : 0) - ((m & B.L) ? 1 : 0);
    const busy = p.stone > 0;
    // ---- horizontal
    if (!p.stun && !busy) {
      const slow = p.held ? 0.7 : p.inh > 0 || p.zap > 0 || p.slash > 0 ? 0.5 : 1;
      const mx = (p.puff ? 1.15 : 1.4) * slow, acc = p.on ? 0.22 : 0.12;
      if (dx) { p.vx += dx * acc; if (Math.abs(p.vx) > mx) p.vx -= Math.sign(p.vx) * Math.min(Math.abs(p.vx) - mx, 0.3); if (!p.inh && !p.slash) p.face = dx; }
      else { const fr = p.on ? 0.2 : 0.05; if (Math.abs(p.vx) <= fr) p.vx = 0; else p.vx -= Math.sign(p.vx) * fr; }
    } else if (busy) p.vx *= 0.8;
    // ---- vertical: jump, flap (puff), swim
    if (p.on) { p.coy = 5; p.flaps = 0; p.puff = 0; } else if (p.coy > 0) p.coy--;
    const jp = edge(B.J);
    if (!p.stun && !busy && jp) {
      if (p.coy > 0 && p.vy >= 0 && !p.swim) { p.vy = -3.55; p.jh = true; p.coy = 0; p.on = false; ev(S, 'jump', cxp, p.y + p.h); }
      else if (p.swim) { p.vy = -1.6; ev(S, 'swim', cxp, cyp); }
      else if (!p.held && p.flaps < MAXFLAP) { p.vy = -2.6; p.flaps++; p.puff = 1; p.jh = false; p.inh = 0; ev(S, 'flap', cxp, cyp); }
    }
    if (!(m & B.J)) { if (p.jh && p.vy < -1.4) p.vy *= 0.55; p.jh = false; }
    let g = 0.22, fall = 3.4;
    if (p.swim) { g = 0.06; fall = 0.8; } else if (p.puff) { g = p.vy > 0 ? 0.1 : 0.14; fall = 0.85; if ((m & B.D) && p.vy > 0) { p.puff = 0; } }
    if (busy) { g = 0.55; fall = 5.2; }
    if (p.vy < fall) p.vy = Math.min(fall, p.vy + g); else p.vy = fall;
    // ---- inhale / attack / spit
    if (!p.stun) useAction(S, p, m, edge);
    // ---- swallow / drop
    if (edge(B.SW) && !p.stun) {
      if (p.held) {
        const h = p.held; p.held = null; p.gulp = 14;
        if (h.ab) { p.ab = h.ab; S.copies++; S.abGot |= 1 << ABS.indexOf(h.ab); p.flash = 24; ev(S, 'copy', cxp, cyp, h.ab); } else ev(S, 'gulp', cxp, cyp);
      } else if (p.ab) {
        const a = p.ab; p.ab = null; p.zap = 0; p.slash = 0; p.stone = 0; S.drops++; spawnIt(S, 'candy', cxp - 5 + p.face * 10, p.y - 6, { ab: a, wait: 26, vx: p.face * 0.8 }); ev(S, 'drop', cxp, cyp, a);
      }
    }
    // ---- move
    if (p.stone > 0) { p.stone++; }
    moveX(S, p);
    const wasVy = p.vy;
    moveY(S, p, (m & B.D) && (m & B.J) && !busy);
    if (p.stone > 0 && p.on && wasVy > 1) stoneLand(S, p);
    if (p.stone > 0 && !p.on && wasVy > 0) {                       // crush the cracked block under the feet while falling
      if (affect(S, p.x, p.y + p.h, p.x + p.w, p.y + p.h + 2, K_STONE, 'crack')) { p.vy = wasVy; }
    }
    if (p.stone > 40 || (p.stone > 8 && p.on)) { if (p.on || p.stone > 40) { p.stone = 0; } }
    if (p.x < 0) { p.x = 0; p.vx = 0; } if (p.x + p.w > W) { p.x = W - p.w; p.vx = 0; }
    // ---- remember a safe spot
    if (p.on && p.stone === 0) { const tx = Math.floor(cx(p) / TS), ty = Math.floor((p.y + p.h) / TS); const b = tl(S, tx, ty); if (SOLID[b] && b !== T.ICEB && tl(S, tx, ty - 1) !== T.SPIKE && tl(S, tx - 1, ty) !== T.WATER && tl(S, tx + 1, ty) !== T.WATER) { p.sx = p.x; p.sy = p.y; } }
    // ---- hazards
    let hz = 0;
    eachTile(S, p.x + 1, p.y + 1, p.x + p.w - 1, p.y + p.h - 1, (tx, ty, t) => { if (t === T.SPIKE) hz = 1; else if (t === T.WATER && p.ab !== 'bubble' && p.stone === 0) hz = Math.max(hz, 2); });
    if (hz === 1) hurtP(S, p, cx(p) + (p.vx >= 0 ? 1 : -1) * 6, 1);
    else if (hz === 2 && p.inv < 60) { if (hurtP(S, p, cx(p), 1) || p.inv < 1) { ev(S, 'splash', cx(p), cy(p)); } if (!p.dead) { p.x = p.sx; p.y = p.sy; p.vx = 0; p.vy = 0; p.inv = Math.max(p.inv, 70); } }
    if (p.y > L.H * TS + 14) {
      ev(S, 'fall', cx(p), L.H * TS);
      hurtP(S, p, cx(p), 1); p.inv = 70;
      if (!p.dead) { p.x = p.sx; p.y = p.sy; p.vx = 0; p.vy = 0; }
    }
  }
  function stoneLand(S, p) {
    ev(S, 'quake', cx(p), p.y + p.h); S.shake = Math.max(S.shake, 6);
    const fy = Math.floor((p.y + p.h - 2) / TS);
    affect(S, p.x - 2, p.y + p.h, p.x + p.w + 2, p.y + p.h + 3, K_STONE, 'crack');
    affect(S, p.x - 34, fy * TS, p.x + p.w + 34, fy * TS + TS, K_STONE, 'crack');
    for (const e of S.en) if (!e.dead && Math.abs(cx(e) - cx(p)) < 34 && Math.abs(e.y + e.h - (p.y + p.h)) < 18) hurtEnemy(S, e, e.k === 'boss' ? 2 : 3, 'stone');
    p.stone = Math.max(p.stone, 34);
  }
  function useAction(S, p, m, edge) {
    const held = (m & B.ACT) > 0, ae = edge(B.ACT), mo = mouth(p);
    if (p.stone > 0) return;
    if (p.ab) { p.inh = 0; useAbility(S, p, held, ae, mo); return; }
    if (p.held) { p.inh = 0; if (ae) { addPr(S, 'star', { x: mo.x - 3, y: mo.y, w: 8, h: 8, vx: p.face * 3.4, t: 60, dmg: 2, who: p.id, ab: 'star' }); ev(S, 'spit', mo.x, mo.y, p.held.k); p.held = null; } return; }
    if (p.puff) { p.inh = 0; if (ae) { addPr(S, 'air', { x: mo.x - 3, y: mo.y, w: 10, h: 10, vx: p.face * 2.6, t: 14, dmg: 1, who: p.id, ab: 'air' }); p.puff = 0; p.vy = Math.min(p.vy, 0.5); ev(S, 'puffout', mo.x, mo.y); } return; }
    if (held && p.on !== undefined) {
      p.inh++; if (p.inh === 1) ev(S, 'inhale', mo.x, mo.y);
      const R = 62;
      const x0 = p.face > 0 ? mo.x : mo.x - R, x1 = p.face > 0 ? mo.x + R : mo.x, my = p.y + p.h / 2;
      const grab = (o, inh) => {
        const ox = cx(o), oy = cy(o);
        if (ox < x0 || ox > x1) return false;
        const d = Math.abs(ox - mo.x), reach = 10 + d * 0.35;
        if (Math.abs(oy - my) > reach) return false;
        o.pull = S.f;
        const mx = mo.x - p.face * 2 - ox, my2 = my - oy, len = Math.hypot(mx, my2) || 1, sp = Math.min(len, 1.6 + (R - d) / 40);
        o.x += mx / len * sp; o.y += my2 / len * sp;
        if (len < 9) { p.held = { k: o.k, ab: inh ? (DEF[o.k] && DEF[o.k].ab) || null : null }; S.inhaled++; ev(S, 'gulp', ox, oy, o.k); return true; }
        return false;
      };
      let got = false;
      for (const e of S.en) { if (got) break; if (e.dead || !DEF[e.k] || !DEF[e.k].inh || e.k === 'boss') continue; if (grab(e, true)) { e.dead = 1; e.rt = 0; e.pull = -9; got = true; } }
      for (const q of S.pr) { if (got) break; if (q.own !== 1 || !q.inh) continue; if (grab(q, false)) { q.t = 0; got = true; } }
      for (const it of S.it) { if (got) break; if (it.k === 'ball') continue; }
    } else p.inh = 0;
  }
  function useAbility(S, p, held, ae, mo) {
    const a = p.ab, f = p.face;
    S.abUse[a] = (S.abUse[a] || 0) + (ae ? 1 : 0);
    if (a === 'fire') {
      if (held && p.cd <= 0) {
        if (p.fire === 0) ev(S, 'fire', mo.x, mo.y);
        if (p.fire < 100) { p.fire++; if (p.fire % 3 === 0) addPr(S, 'flame', { x: mo.x - 3 + f * 3, y: mo.y - 1, w: 10, h: 10, vx: f * 1.9, vy: -0.05 * (p.fire % 4), t: 24, dmg: 1, who: p.id, ab: 'fire' }); }
        else { p.cd = 24; p.fire = 0; }
      } else if (!held) { if (p.fire > 0) p.cd = Math.max(p.cd, 8); p.fire = 0; }
    } else if (a === 'ice') {
      if (held && p.cd <= 0) { p.fire++; if (p.fire === 1) ev(S, 'ice', mo.x, mo.y); if (p.fire % 4 === 1) addPr(S, 'icebr', { x: mo.x - 3 + f * 3, y: mo.y, w: 12, h: 10, vx: f * 2.1, t: 20, dmg: 1, who: p.id, ab: 'ice' }); if (p.fire > 100) { p.cd = 24; p.fire = 0; } }
      else if (!held) p.fire = 0;
    } else if (a === 'spark') { if (ae && p.cd <= 0 && p.zap <= 0) { p.zap = 28; p.cd = 8; ev(S, 'zap', cx(p), cy(p)); } }
    else if (a === 'blade') { if (ae && p.cd <= 0) { p.slash = 14; p.cd = 4; ev(S, 'slash', cx(p), cy(p)); } }
    else if (a === 'stone') { if (ae && p.cd <= 0) { p.stone = 1; p.vx = 0; if (p.on) { p.vy = -2.4; } else p.vy = Math.max(p.vy, 2.6); p.cd = 10; ev(S, 'stone', cx(p), cy(p)); } }
    else if (a === 'leaf') { if (ae && p.cd <= 0 && !S.pr.some(q => q.k === 'leaf' && q.who === p.id)) { addPr(S, 'leaf', { x: mo.x - 5, y: mo.y - 2, w: 12, h: 12, vx: f * 2.7, t: 70, dmg: 1, who: p.id, ab: 'leaf', n: 0 }); p.cd = 6; ev(S, 'leaf', mo.x, mo.y); } }
    else if (a === 'bubble') { if (ae && p.cd <= 0) { addPr(S, 'bub', { x: mo.x - 5, y: mo.y - 2, w: 12, h: 12, vx: f * 1.5, vy: -0.25, t: 80, dmg: 2, who: p.id, ab: 'bubble' }); p.cd = 14; ev(S, 'bub', mo.x, mo.y); } }
    else if (a === 'bomb') { if (ae && p.cd <= 0 && S.pr.filter(q => q.k === 'bomb' && q.who === p.id).length < 2) { addPr(S, 'bomb', { x: mo.x - 4, y: mo.y - 4, w: 8, h: 8, vx: f * 1.6 + p.vx * 0.4, vy: -2.3, g: 0.2, t: 55, dmg: 3, who: p.id, ab: 'bomb' }); p.cd = 18; ev(S, 'bombset', mo.x, mo.y); } }
    // ability timers
    if (p.zap > 0) {
      p.zap--;
      const rx = cx(p), ry = cy(p);
      for (const e of S.en) if (!e.dead && Math.hypot(cx(e) - rx, cy(e) - ry) < 28 && (p.zap % 7 === 0)) hurtEnemy(S, e, 1, 'spark');
      eachTile(S, rx - 28, ry - 28, rx + 28, ry + 28, (tx, ty, t) => { if (t === T.SOCKET && Math.hypot(tx * TS + 8 - rx, ty * TS + 8 - ry) < 30) { setTl(S, tx, ty, T.SOCKON); S.sockOn++; const g = S.L.sockG[ty * S.L.W + tx]; S.sg[g] = (S.sg[g] | 0) + 1; ev(S, 'sock', tx * TS + 8, ty * TS + 8); checkDoor(S, g); } });
    }
    if (p.slash > 0) {
      p.slash--;
      const hb = { x: f > 0 ? p.x + p.w - 2 : p.x - 20, y: p.y - 4, w: 22, h: p.h + 8 };
      if (p.slash > 4) {
        for (const e of S.en) if (!e.dead && ov(hb, e)) hurtEnemy(S, e, 2, 'blade');
        affect(S, hb.x, hb.y, hb.x + hb.w, hb.y + hb.h, K_CUT, 'cut');
        for (const q of S.pr) if (q.own === 1 && q.inh && ov(hb, q)) q.t = 0;
      }
    }
  }

  // ---- projectiles
  function stepProjectiles(S) {
    const out = [];
    for (const q of S.pr) {
      const own = S.ps[q.who] || S.ps[0];
      q.t--;
      if (q.pull === S.f) { if (q.t > 0) out.push(q); continue; }
      if (q.g) q.vy += q.g;
      let dead = false;
      if (q.k === 'leaf') {
        q.n++;
        if (q.n < 20) { /* outbound */ } else { const dx = cx(own) - cx(q), dy = cy(own) - cy(q), len = Math.hypot(dx, dy) || 1; q.vx = dx / len * 3; q.vy = dy / len * 3; if (len < 8) dead = true; }
        q.x += q.vx; q.y += q.vy;
        if (q.n < 20 && solid(S, Math.floor(cx(q) / TS), Math.floor(cy(q) / TS))) q.n = 20;
        affect(S, q.x, q.y, q.x + q.w, q.y + q.h, K_CUT, 'cut');
        collectBox(S, own, q);
      } else if (q.k === 'bomb') {
        q.x += q.vx; if (solid(S, Math.floor((q.vx > 0 ? q.x + q.w : q.x) / TS), Math.floor(cy(q) / TS))) { q.x -= q.vx; q.vx = -q.vx * 0.4; }
        const oy = q.y; q.y += q.vy;
        if (q.vy > 0 && solid(S, Math.floor(cx(q) / TS), Math.floor((q.y + q.h) / TS))) { q.y = Math.floor((q.y + q.h) / TS) * TS - q.h; q.vy = -q.vy * 0.35; q.vx *= 0.7; if (Math.abs(q.vy) < 0.5) q.vy = 0; } else if (q.vy < 0 && solid(S, Math.floor(cx(q) / TS), Math.floor(q.y / TS))) { q.y = oy; q.vy = 0; }
        if (q.t <= 0) { explode(S, cx(q), cy(q), 0, q.who); dead = true; }
      } else if (q.k === 'flame' || q.k === 'icebr' || q.k === 'air' || q.k === 'star' || q.k === 'bub') {
        q.x += q.vx; q.y += q.vy;
        if (q.k === 'bub') { q.vy -= 0.004; q.vx *= 0.985; }
        const wall = solid(S, Math.floor((q.vx > 0 ? q.x + q.w : q.x) / TS), Math.floor(cy(q) / TS));
        if (q.k === 'flame') { affect(S, q.x, q.y, q.x + q.w, q.y + q.h, K_FIRE, 'burn'); if (wall) { q.t = 0; affect(S, q.x + q.vx * 4, q.y, q.x + q.w + q.vx * 4, q.y + q.h, K_FIRE, 'burn'); } }
        else if (q.k === 'icebr') { affect(S, q.x - 2, q.y, q.x + q.w + 2, q.y + q.h + 6, K_ICE, 'freeze'); if (wall) q.t = 0; }
        else if (wall) { q.t = 0; if (q.k === 'star') ev(S, 'starpop', cx(q), cy(q)); }
      } else if (q.k === 'spore' || q.k === 'fb' || q.k === 'ball' || q.k === 'pellet' || q.k === 'drop' || q.k === 'spike' || q.k === 'rock') {
        if (q.k === 'ball' && q.roll) {                  // rolls along the floor
          q.vy = Math.min(q.vy + 0.2, 3); q.x += q.vx; q.y += q.vy;
          if (solid(S, Math.floor(cx(q) / TS), Math.floor((q.y + q.h) / TS))) { q.y = Math.floor((q.y + q.h) / TS) * TS - q.h; q.vy = 0; }
          if (solid(S, Math.floor((q.vx > 0 ? q.x + q.w : q.x) / TS), Math.floor(cy(q) / TS))) q.t = 0;
        } else if (q.dly > 0) { q.dly--; if (q.dly === 0) q.vy = 3; }
        else {
          q.x += q.vx; q.y += q.vy;
          if (solid(S, Math.floor(cx(q) / TS), Math.floor(cy(q) / TS))) { if (q.k !== 'spore' || q.vy > 0) q.t = 0; }
        }
      } else if (q.k === 'bolt' || q.k === 'pillar') {
        // a warning, then a column
        if (q.t === q.warn) ev(S, 'bolt', q.x + q.w / 2, q.y);
        q.live = q.t <= q.warn;
      } else { q.x += q.vx; q.y += q.vy; }
      // hits
      if (q.own === 0) {
        if (q.k !== 'leaf' || q.n % 6 === 0 || true) for (const e of S.en) if (!e.dead && e.pull !== S.f && ov(q, e)) {
          if (q.k === 'bub' && e.k !== 'boss' && DEF[e.k] && DEF[e.k].hp <= 2) { hurtEnemy(S, e, q.dmg, 'bubble'); dead = true; ev(S, 'pop', cx(q), cy(q)); break; }
          if (q.k === 'bub' && e.k === 'boss') { hurtEnemy(S, e, 1, 'bubble'); dead = true; ev(S, 'pop', cx(q), cy(q)); break; }
          hurtEnemy(S, e, q.dmg, q.ab);
          if (q.k === 'star' || q.k === 'air') dead = true;
        }
        if (q.k === 'star' || q.k === 'air') for (const r of S.pr) if (r.own === 1 && r.k !== 'bolt' && r.k !== 'pillar' && !r.inh && ov(q, r)) { r.t = 0; dead = true; }
      } else if (q.k === 'bolt' || q.k === 'pillar') {
        if (q.live) for (const p of S.ps) if (!p.dead && ov(q, p)) hurtP(S, p, cx(q), 1);
      } else if (q.pull !== S.f) { for (const p of S.ps) if (!p.dead && ov(q, p)) { if (hurtP(S, p, cx(q), 1)) { if (q.k !== 'spike') dead = true; } } }
      if (q.x < -40 || q.x > S.L.W * TS + 40 || q.y > S.L.H * TS + 40 || q.y < -60) dead = true;
      if (!dead && q.t > 0) out.push(q);
      else if (q.k === 'bomb' && q.t > 0) { /* dead by contact: nothing */ }
    }
    S.pr = out;
  }
  function collectBox(S, p, box) {
    eachTile(S, box.x, box.y, box.x + box.w, box.y + box.h, (tx, ty, t) => { if (t === T.COIN || t === T.MEDAL || t === T.HEART) take(S, p, tx, ty, t); });
    for (const it of S.it) if (!it.gone && it.t >= (it.wait | 0) && ov(box, it)) pickItem(S, p, it);
  }
  function take(S, p, tx, ty, t) {
    const i = ty * S.L.W + tx;
    if (t === T.COIN) { S.mod[i] = T.AIR; S.stars++; ev(S, 'star', tx * TS + 8, ty * TS + 8); }
    else if (t === T.MEDAL) { S.mod[i] = T.AIR; S.med |= 1 << S.L.medalAt[i]; ev(S, 'medal', tx * TS + 8, ty * TS + 8); }
    else if (t === T.HEART) { if (p.hp < MAXHP) { S.mod[i] = T.AIR; p.hp = Math.min(MAXHP, p.hp + 2); ev(S, 'heart', tx * TS + 8, ty * TS + 8); } }
  }
  function pickItem(S, p, it) {
    if (it.k === 'candy') { it.gone = 1; S.stars += 1; p.hp = Math.min(MAXHP, p.hp + 1); ev(S, 'candy', it.x, it.y); }
    else if (it.k === 'heart') { it.gone = 1; for (const q of S.ps) if (!q.dead) q.hp = Math.min(MAXHP, q.hp + 2); ev(S, 'heart', it.x, it.y); }
  }

  // ---- creatures
  function walker(S, e, sp, ledge) {
    e.vy = Math.min(e.vy + 0.22, 3.4);
    e.vx = e.dir * sp;
    const hit = moveX(S, e); moveY(S, e);
    if (hit) e.dir = -e.dir;
    else if (ledge && e.on) { const fx = e.dir > 0 ? e.x + e.w + 1 : e.x - 1, t = tl(S, Math.floor(fx / TS), Math.floor((e.y + e.h + 2) / TS)); if (!SOLID[t] && t !== T.ONEWAY) e.dir = -e.dir; }
  }
  function stepEnemy(S, e) {
    if (e.dead && e.k === 'boss') return;
    if (e.dead) {
      e.rt++;
      if (e.rt > 240 && !near(S, { x: e.ox, y: e.oy, w: 1, h: 1 }, 170)) { const n = mkEnemy(e.k, 0, 0); Object.assign(e, n, { x: e.ox, y: e.oy, ox: e.ox, oy: e.oy, ph: e.ph }); if (e.k === 'taiho') e.t = 60; }
      return;
    }
    if (e.k === 'boss') return stepBoss(S, e);
    if (e.hit > 0) e.hit--; if (e.inv > 0) e.inv--;
    if (e.pull === S.f) return;
    if (!near(S, e, ACT_R)) return;
    if (e.fr > 0) { e.fr--; e.vy = Math.min(e.vy + 0.22, 3.4); if (!DEF[e.k].fly) moveY(S, e); return; }      // frozen
    const p = nearest(S, e), k = e.k, t = ++e.t;
    const fly = DEF[k].fly;
    if (k === 'mogu') walker(S, e, 0.38, true);
    else if (k === 'bobo') { if (e.s === 0) { walker(S, e, 0.3, true); if (t % 130 === 129 && Math.abs(cx(p) - cx(e)) < 130) { e.s = 1; e.n = 0; } } else { e.n++; e.vy = Math.min(e.vy + 0.22, 3.4); moveY(S, e); e.dir = cx(p) < cx(e) ? -1 : 1; if (e.n === 24) addPr(S, 'fb', { own: 1, x: cx(e) - 3 + e.dir * 6, y: cy(e) - 3, w: 7, h: 7, vx: e.dir * 1.3, vy: -0.4, g: 0.025, t: 90 }); if (e.n > 40) e.s = 0; } }
    else if (k === 'kogori') walker(S, e, 0.3, true);
    else if (k === 'goro') walker(S, e, 0.85, true);
    else if (k === 'bakuda') {
      if (e.s === 0) { walker(S, e, 0.28, true); if (Math.abs(cx(p) - cx(e)) < 34 && Math.abs(cy(p) - cy(e)) < 26) { e.s = 1; e.n = 0; } }
      else { e.n++; e.vy = Math.min(e.vy + 0.22, 3.4); moveY(S, e); if (e.n > 46) { killEnemy(S, e, 'self'); return; } }
    }
    else if (k === 'kiriri') {
      e.vy = Math.min(e.vy + 0.22, 3.4);
      if (e.on) { e.vx = 0; if (t % 76 === 0) { e.dir = cx(p) < cx(e) ? -1 : 1; e.vy = -3.1; e.vx = e.dir * 1.0; } }
      const h = moveX(S, e); if (h) e.dir = -e.dir; moveY(S, e);
      if (e.on) e.vx = 0;
    }
    else if (k === 'piri') { e.x += e.dir * 0.3 + (cx(p) < cx(e) ? -0.12 : 0.12); e.y = e.oy + sn(t * 0.05 + e.ph) * 12; if (solid(S, Math.floor((e.x + (e.dir > 0 ? e.w : 0)) / TS), Math.floor(cy(e) / TS))) e.dir = -e.dir; if (t % 150 === 0) e.dir = -e.dir; }
    else if (k === 'hirari') { e.x += e.dir * 0.75; e.y = e.oy + sn(t * 0.05 + e.ph) * 14; if (t % 140 === 0 || solid(S, Math.floor((e.x + (e.dir > 0 ? e.w : 0)) / TS), Math.floor(cy(e) / TS))) e.dir = -e.dir; }
    else if (k === 'puka') { e.y = e.oy + sn(t * 0.03 + e.ph) * 20; e.x += e.dir * 0.22; if (t % 190 === 0 || solid(S, Math.floor((e.x + (e.dir > 0 ? e.w : 0)) / TS), Math.floor(cy(e) / TS))) e.dir = -e.dir; }
    else if (k === 'tobi') { const ddx = cx(p) - cx(e); if (Math.abs(ddx) < 150) { e.x += Math.sign(ddx) * 0.5; } else e.x += e.dir * 0.35; e.y = e.oy + sn(t * 0.07 + e.ph) * 16; if (t % 120 === 0) e.dir = -e.dir; }
    else if (k === 'togeko') walker(S, e, 0.32, true);
    else if (k === 'taiho') {
      if (t % 110 === 0 && Math.abs(cx(p) - cx(e)) < 190) { const d = cx(p) < cx(e) ? -1 : 1; e.dir = d; addPr(S, 'ball', { own: 1, inh: 1, x: cx(e) + d * 9 - 4, y: e.y + 4, w: 8, h: 8, vx: d * 1.1, t: 160 }); ev(S, 'shoot', cx(e), cy(e)); }
    }
    if (k !== 'taiho' && !fly && e.y > S.L.H * TS + 20) { e.dead = 1; e.rt = 0; return; }
    // contact
    if (e.k !== 'taiho' || true) for (const q of S.ps) if (!q.dead && ov(q, e) && e.fr <= 0) { if (q.stone > 0) { hurtEnemy(S, e, 3, 'stone'); } else if (k === 'bakuda' && e.s === 0) { /* harmless until it lights */ } else hurtP(S, q, cx(e), 1); }
  }

  // ---- bosses
  function stepBoss(S, b) {
    if (b.dead) return;
    if (b.inv > 0) b.inv--; if (b.hit > 0) b.hit--;
    const p = nearest(S, b), dirTo = cx(p) < cx(b) ? -1 : 1, ph = b.ph, t = ++b.t, bk = b.bk, W = S.L.W * TS;
    const grav = () => { b.vy = Math.min(b.vy + 0.24, 3.6); };
    if (bk === 'mush') {
      grav();
      if (b.s === 0) { b.vx = dirTo * (0.42 + 0.16 * ph); b.dir = dirTo; if (t > [150, 120, 90][ph - 1]) { b.s = 1; b.t = 0; b.vy = -4.6; b.vx = dirTo * 1.1; ev(S, 'jump', cx(b), b.y + b.h); } }
      moveX(S, b); moveY(S, b);
      if (b.s === 1 && b.on && b.t > 6) {
        b.s = 0; b.t = 0; ev(S, 'quake', cx(b), b.y + b.h); S.shake = 10;
        for (const q of S.ps) if (!q.dead && q.on && Math.abs(cx(q) - cx(b)) < 62) hurtP(S, q, cx(b), 1);
        if (ph >= 2) for (let i = 0; i < ph; i++) addPr(S, 'spore', { own: 1, inh: 1, x: cx(b) - 4, y: b.y - 4, w: 8, h: 8, vx: (i - (ph - 1) / 2) * 1.0 + dirTo * 0.5, vy: -3.2 - i * 0.2, g: 0.12, t: 160 });
      }
    } else if (bk === 'lava') {
      grav();
      if (b.s === 0) {
        if (!b.dir) b.dir = -1;
        b.vx = b.dir * (1.15 + 0.2 * ph);
        if (t > 100) { b.s = 1; b.t = 0; b.vx = 0; b.dir = dirTo; if (ph >= 2) addPr(S, 'fb', { own: 1, x: cx(b) - 3, y: b.y, w: 7, h: 7, vx: dirTo * 1.4, vy: -2.4, g: 0.07, t: 110 }); if (ph >= 3) { const px = Math.max(8, Math.min(W - 24, cx(p) - 8)); addPr(S, 'pillar', { own: 1, x: px, y: S.L.H * TS - 96, w: 16, h: 80, t: 62, warn: 22 }); } }
      } else { b.vx = 0; if (t > 70) { b.s = 0; b.t = 0; } }
      if (moveX(S, b) && b.s === 0) b.dir = -b.dir; moveY(S, b);
    } else if (bk === 'snowk') {
      grav();
      b.dir = dirTo; b.vx = b.s === 0 ? dirTo * 0.2 : b.vx;
      if (b.s === 0 && t % 110 === 100) addPr(S, 'ball', { own: 1, inh: 1, roll: 1, x: cx(b) + dirTo * 16 - 6, y: b.y + b.h - 12, w: 12, h: 12, vx: dirTo * 1.25, t: 240 });
      if (ph >= 2 && t % 150 === 70) { const px = Math.max(8, Math.min(W - 24, cx(p) - 6)); addPr(S, 'spike', { own: 1, x: px, y: 6, w: 12, h: 14, vy: 0, t: 90, warn: 0, fall: 1 }); const pq = S.pr[S.pr.length - 1]; pq.vy = 0; pq.g = 0; pq.dly = 36; }
      if (ph >= 3 && b.s === 0 && t % 170 === 160) { b.s = 1; b.vy = -4.4; b.vx = dirTo * 1.2; b.t = 0; ev(S, 'jump', cx(b), b.y + b.h); }
      moveX(S, b); moveY(S, b);
      if (b.s === 1 && b.on && b.t > 5) { b.s = 0; b.t = 0; ev(S, 'quake', cx(b), b.y + b.h); S.shake = 8; for (const q of S.ps) if (!q.dead && q.on && Math.abs(cx(q) - cx(b)) < 50) hurtP(S, q, cx(b), 1); }
    } else if (bk === 'cloud') {
      const ty = 44 + sn(t * 0.04) * 10;
      if (b.s === 0) {
        b.x += Math.max(-0.7 - 0.2 * ph, Math.min(0.7 + 0.2 * ph, cx(p) - cx(b))) * 0.5 * (Math.abs(cx(p) - cx(b)) > 6 ? 1 : 0); b.y += (ty - b.y) * 0.05;
        if (t % 120 === 100) { const px = Math.max(8, Math.min(W - 24, cx(p) - 8)); addPr(S, 'bolt', { own: 1, x: px, y: b.y + b.h, w: 14, h: S.L.H * TS - (b.y + b.h) - 30, t: 56, warn: 14 }); }
        if (ph >= 2 && t % 70 === 30) addPr(S, 'drop', { own: 1, x: cx(b) - 3 + ((t / 70) % 3 - 1) * 10, y: b.y + b.h, w: 6, h: 8, vy: 1.6, t: 100 });
        if (ph >= 3 && t > 260) { b.s = 1; b.t = 0; b.dir = dirTo; }
      } else { b.y += (112 - b.y) * 0.08; b.x += b.dir * 2.1; if (b.x < 10 || b.x + b.w > W - 10) { b.dir = -b.dir; b.x = Math.max(10, Math.min(W - 10 - b.w, b.x)); } if (t > 130) { b.s = 0; b.t = 0; } }
      for (const q of S.ps) if (!q.dead && ov(q, b)) hurtP(S, q, cx(b), 1);
      b.x = Math.max(8, Math.min(W - 8 - b.w, b.x)); clampBoss(S, b);
      return;
    } else if (bk === 'moon') {
      if (b.s === 0) { b.x += Math.max(-0.8, Math.min(0.8, cx(p) - cx(b) + dirTo * -50)) * 0.6; b.y += (70 + sn(t * 0.05) * 20 - b.y) * 0.05; if (t === 24) addFan(S, b, p, ph); if (t > 90) { b.s = 1; b.t = 0; } }
      else if (b.s === 1) { if (t === 1) ev(S, 'blink', cx(b), cy(b)); b.inv = Math.max(b.inv, 2); if (t > 26) { b.x = Math.max(12, Math.min(W - 12 - b.w, cx(p) - 12 + (t % 2 ? 70 : -70))); b.y = Math.max(24, Math.min(120, cy(p) - 40)); b.s = 2; b.t = 0; b.dir = cx(p) < cx(b) ? -1 : 1; } }
      else if (b.s === 2) { if (t > 26) { b.x += b.dir * (2.0 + ph * 0.2); if (t > 26 + 40) { b.s = 0; b.t = 0; if (ph >= 3 && S.en.length < 14) for (let i = 0; i < 2; i++) { const e2 = mkEnemy('tobi', 0, 0); e2.x = b.x + i * 12; e2.y = b.y; e2.ox = e2.x; e2.oy = e2.y; e2.s = 7; S.en.push(e2); } } } }
      b.x = Math.max(8, Math.min(W - 8 - b.w, b.x));
      for (const q of S.ps) if (!q.dead && b.s !== 1 && ov(q, b)) hurtP(S, q, cx(b), 1);
      clampBoss(S, b);
      return;
    }
    for (const q of S.ps) if (!q.dead && ov(q, b)) hurtP(S, q, cx(b), 1);
    clampBoss(S, b);
  }
  function clampBoss(S, b) { const a = S.L.meta.arena; if (a) { if (b.x < a[0]) { b.x = a[0]; b.dir = 1; if (b.vx < 0) b.vx = 0; } if (b.x + b.w > a[1]) { b.x = a[1] - b.w; b.dir = -1; if (b.vx > 0) b.vx = 0; } } }
  function addFan(S, b, p, ph) {
    const n = 2 + ph, base = Math.atan2(cy(p) - cy(b), cx(p) - cx(b));
    for (let i = 0; i < n; i++) { const a = base + (i - (n - 1) / 2) * 0.35; addPr(S, 'pellet', { own: 1, x: cx(b) - 3, y: cy(b) - 3, w: 7, h: 7, vx: Math.cos(a) * 1.4, vy: Math.sin(a) * 1.4, t: 150 }); }
  }

  // ---- items
  function stepItems(S) {
    const out = [];
    for (const it of S.it) {
      if (it.gone) continue;
      it.t++; it.vy = Math.min(it.vy + 0.14, 2.6); it.vx *= 0.96;
      it.x += it.vx; const oy = it.y; it.y += it.vy; it.on = false;
      if (it.vy > 0 && solid(S, Math.floor((it.x + 5) / TS), Math.floor((it.y + it.h) / TS))) { it.y = Math.floor((it.y + it.h) / TS) * TS - it.h; it.vy = 0; it.on = true; }
      if (it.y > S.L.H * TS) continue;
      for (const p of S.ps) if (!p.dead && it.t >= (it.wait | 0) && ov(p, it)) { pickItem(S, p, it); break; }
      if (!it.gone && it.t < 1500) out.push(it);
    }
    S.it = out;
  }

  // ---- the frame
  function step(S, in0, in1) {
    if (S.res) return;
    S.ev = []; S.f++;
    if (S.shake > 0) S.shake--;
    S.ps[0].in = in0 | 0; if (S.ps[1]) S.ps[1].in = in1 | 0;
    for (const p of S.ps) stepPlayer(S, p);
    // the two heroes stay close: a hero left too far behind pops over to the other
    if (S.np === 2) {
      const a = S.ps[0], b = S.ps[1];
      if (a.dead && !b.dead) { /* revive when the partner is near */ }
      for (const [x, y] of [[a, b], [b, a]]) if (!x.dead && !y.dead && Math.abs(x.x - y.x) > COOP_SPAN) { const lead = x.x > y.x ? x : y, tail = lead === x ? y : x; tail.x = lead.x + (lead.face > 0 ? -14 : 14); tail.y = lead.y - 4; tail.vx = 0; tail.vy = 0; tail.inv = Math.max(tail.inv, 40); ev(S, 'warp', tail.x, tail.y); break; }
      for (const [x, y] of [[a, b], [b, a]]) if (x.dead > 60 && !y.dead && Math.abs(cx(x) - cx(y)) < 36 && Math.abs(cy(x) - cy(y)) < 60) { x.dead = 0; x.hp = 3; x.inv = 100; x.vy = -2; x.pm = 0; ev(S, 'revive', cx(x), cy(x)); }
    }
    stepProjectiles(S);
    for (const e of S.en) stepEnemy(S, e);
    if (S.en.length > 40) S.en = S.en.filter(e => !(e.s === 7 && e.dead));
    stepItems(S);
    // tiles under the heroes
    for (const p of S.ps) {
      if (p.dead) continue;
      eachTile(S, p.x, p.y, p.x + p.w, p.y + p.h, (tx, ty, t) => {
        if (t === T.COIN || t === T.MEDAL || t === T.HEART) take(S, p, tx, ty, t);
        else if (t === T.CP) { const i = S.L.cps.findIndex(c => c.x === tx && c.y === ty); if (i > S.cpIdx) { S.cpIdx = i; ev(S, 'cp', tx * TS + 8, ty * TS + 8); S.snap = snapOf(S); } }
        else if (t === T.GOAL && (!S.L.boss || S.bossDead)) {
          S.res = { frames: S.f, med: S.med, stars: S.stars, hurts: S.hurts, deaths: S.deaths, kills: S.kills, copies: S.copies, ab: S.abGot, drops: S.drops, inhaled: S.inhaled, hp: S.ps.map(q => q.hp) };
          ev(S, 'goal', tx * TS + 8, ty * TS + 8);
        }
      });
      for (const it of S.it) if (!it.gone && it.t >= (it.wait | 0) && ov(p, it)) pickItem(S, p, it);
    }
    // everyone down: back to the checkpoint
    if (S.ps.every(p => p.dead)) { S.wipe++; if (S.wipe > 50) { S.deaths++; restore(S); ev(S, 'restore', 0, 0); } } else S.wipe = 0;
    S.cam.x += (camTarget(S) - S.cam.x) * 0.12;
  }

  // ---- recordings / hashing
  function rle(arr) {
    const out = []; let i = 0;
    while (i < arr.length) { let j = i; while (j < arr.length && arr[j] === arr[i]) j++; out.push(arr[i].toString(36) + ':' + (j - i).toString(36)); i = j; }
    return out.join(',');
  }
  function unrle(s) {
    const out = []; if (!s) return out;
    for (const part of s.split(',')) { const [v, n] = part.split(':'); const m = parseInt(v, 36), c = parseInt(n, 36); for (let i = 0; i < c; i++) out.push(m); }
    return out;
  }
  function hash(S) {
    let h = 0;
    for (const p of S.ps) h += ((p.x / 3) | 0) * 7919 + ((p.y / 3) | 0) * 104729 + ((p.vx * 3) | 0) * 31 + ((p.vy * 2) | 0) * 17 + (p.on ? 1 : 0) + p.hp * 13 + (p.ab ? ABS.indexOf(p.ab) * 101 + 7 : 0) + (p.held ? 301 : 0) + (p.inv > 0 ? 3 : 0);
    h += S.cpIdx * 977 + S.med * 131 + S.stars * 13 + S.sockOn * 71 + S.pr.length * 5;
    for (const e of S.en) if (e.k === 'boss') h += e.hp * 1000003 + e.s * 31;
    return h | 0;
  }
  function sig(S) { return [S.f, S.ps.map(p => [p.x.toFixed(2), p.y.toFixed(2), p.hp, p.ab || '', p.held ? p.held.k : ''].join('/')).join(';'), S.stars, S.med, S.hurts, S.deaths, S.kills, S.cpIdx, S.res ? 1 : 0, Object.keys(S.mod).length, S.en.filter(e => e.dead).length].join('|'); }
  function runReplay(L, inputs, opts) {
    const S = newState(L, opts);
    for (let i = 0; i < inputs.length && !S.res; i++) { step(S, inputs[i]); }
    return S;
  }

  const PE = { TS, B, T, CH, SOLID, DEF, ABS, BOSSES, BOSS_HP, BOSS_WEAK, ENEMY_CH, MAXHP, MAXFLAP, PW, PH, ACT_R, COOP_SPAN, parse, newState, step, clone, restore, hash, sig, rle, unrle, runReplay, camTarget, tl, solid, cx, cy, ov, sn };
  if (typeof module === 'object' && module && module.exports) module.exports = PE;
  root.PuffEngine = PE;
})(typeof window !== 'undefined' ? window : globalThis);
