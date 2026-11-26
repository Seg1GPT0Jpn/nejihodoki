// ぴょんぴょん冒険 (Hop Hop Adventure) - the pure engine. Runs in node and in the browser, fixed 60 Hz step, no randomness except a seeded LCG.
// Everything here is original: the toy-rabbit "ぴょんた", the patchwork world, its creatures, gear and bosses.
//
//   HopEngine.parse(level)          -> L   (static, shared: tiles, spawn list, burrows, goal ...)
//   HopEngine.newState(L, opts)     -> S   (mutable, plain data; clone() it freely)
//   HopEngine.step(S, input)        advance one frame. input = bit mask (B.*). S.res is set when the goal is reached.
//   HopEngine.clone(S) / hash(S) / sig(S)
//   HopEngine.rle(inputs) / unrle(str)   input recordings (replays, ghosts, proofs)
//
// Units: pixels, 16 px tiles, one tile row = 16 px, levels are 13 rows high. Positions are the top-left corner of a box.
(function (root) {
  'use strict';
  const TS = 16;
  const B = { L: 1, R: 2, U: 4, D: 8, J: 16, RUN: 32, ACT: 64 };
  // tile ids
  const T = { AIR: 0, GROUND: 1, BRICK: 2, QBLK: 3, GBLK: 4, USED: 5, ONEWAY: 6, SPIKE: 7, CSPIKE: 8, WATER: 9, ICE: 10, SPRING: 11, CONVR: 12, CONVL: 13, COIN: 14, MEDAL: 15, GOAL: 16, CP: 17, BURROW: 18, RING: 19, HEART: 20, GATE: 21, FAKE: 22, WIND: 23 };
  const CH = { '#': T.GROUND, B: T.BRICK, '?': T.QBLK, '!': T.GBLK, x: T.USED, '-': T.ONEWAY, '^': T.SPIKE, v: T.CSPIKE, '~': T.WATER, i: T.ICE, S: T.SPRING, '>': T.CONVR, '<': T.CONVL, c: T.COIN, m: T.MEDAL, G: T.GOAL, K: T.CP, o: T.RING, h: T.HEART, g: T.GATE, f: T.FAKE, w: T.WIND };
  const SOLID = new Uint8Array(32); [T.GROUND, T.BRICK, T.QBLK, T.GBLK, T.USED, T.ICE, T.SPRING, T.CONVR, T.CONVL, T.GATE].forEach(t => { SOLID[t] = 1; });
  const BUR_A = 'D([', BUR_B = 'd)]';   // burrow pairs: D<->d  (<->)  [<->]
  const ENEMY_CH = { b: 'bug', n: 'windup', j: 'frog', a: 'bat', p: 'balloon', t: 'cannon', s: 'pin', r: 'roller', y: 'drip', e: 'bird', l: 'pend', u: 'umb' };
  const OBJ_CH = { M: 'platH', N: 'platV', F: 'crumble', Q: 'boots', C: 'cape', R: 'ribbon', X: 'boss' };
  const DEF = {
    bug: { w: 12, h: 12, st: 1 }, windup: { w: 12, h: 12, st: 1 }, frog: { w: 12, h: 12, st: 1 }, bat: { w: 12, h: 10, st: 1 }, balloon: { w: 12, h: 14, st: 1 },
    cannon: { w: 14, h: 14, st: 0 }, pin: { w: 12, h: 12, st: 0 }, roller: { w: 12, h: 12, st: 1 }, drip: { w: 8, h: 10, st: 0 }, bird: { w: 12, h: 10, st: 1 },
    pend: { w: 10, h: 10, st: 0 }, umb: { w: 14, h: 14, st: 0 }, shot: { w: 6, h: 6, st: 0 }, item: { w: 12, h: 12, st: 0 },
    bear: { w: 28, h: 26, st: 1 }, general: { w: 24, h: 26, st: 1 }, duck: { w: 30, h: 24, st: 1 }, owl: { w: 26, h: 24, st: 1 }, mouse: { w: 22, h: 22, st: 1 }, golem: { w: 30, h: 34, st: 1 },
  };
  const BOSS_HP = { bear: 3, general: 3, duck: 3, owl: 3, mouse: 4, golem: 6 };
  const GEAR = { boots: 1, cape: 2, ribbon: 3 };
  const PW = 10, PH = 14, CROUCH_H = 8;
  const ACT_R = 300;               // enemies only move when the player is within this many px (fixed, so the sim never depends on the screen size)

  // ---- deterministic sine (table + linear interpolation; no Math.sin in the sim)
  const SIN = new Float64Array(257);
  for (let i = 0; i <= 256; i++) SIN[i] = Math.round(Math.sin(i * Math.PI * 2 / 256) * 1e5) / 1e5;
  function sn(a) { // a in radians-ish "phase": full turn = 2*PI
    let u = (a / 6.283185307179586) % 1; if (u < 0) u += 1;
    const f = u * 256, i = f | 0, r = f - i;
    return SIN[i] + (SIN[i + 1] - SIN[i]) * r;
  }
  const cs = a => sn(a + 1.5707963267948966);
  const rnd = S => { S.rng = (Math.imul(S.rng, 1664525) + 1013904223) >>> 0; return S.rng / 4294967296; };

  // ---- level parsing
  function parse(lv) {
    const rows = lv.rows, H = rows.length, W = Math.max.apply(null, rows.map(r => r.length));
    const L = { id: lv.id, W, H, t: new Uint8Array(W * H), ents: [], start: null, goal: null, cps: [], bur: [], medals: [], nCoin: 0, meta: lv, burAt: {} };
    const burPos = {};
    for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
      const c = rows[y][x] || ' ', i = y * W + x;
      if (c === ' ' || c === '.') continue;
      if (CH[c] !== undefined) {
        L.t[i] = CH[c];
        if (c === 'c') L.nCoin++;
        if (c === 'G') L.goal = { x, y };
        if (c === 'K') L.cps.push({ x, y });
      } else if (c === 'P') L.start = { x, y };
      else if (ENEMY_CH[c]) L.ents.push({ k: ENEMY_CH[c], x, y });
      else if (OBJ_CH[c]) L.ents.push({ k: OBJ_CH[c], x, y });
      else if (BUR_A.indexOf(c) >= 0 || BUR_B.indexOf(c) >= 0) { L.t[i] = T.BURROW; burPos[c] = { x, y }; }
    }
    // medals: ids by column (left to right)
    for (let x = 0; x < W; x++) for (let y = 0; y < H; y++) if (L.t[y * W + x] === T.MEDAL) L.medals.push({ x, y });
    L.cps.sort((a, b) => a.x - b.x);
    for (let k = 0; k < BUR_A.length; k++) {
      const a = burPos[BUR_A[k]], b = burPos[BUR_B[k]];
      if (a && b) { L.bur.push({ x: a.x, y: a.y, tx: b.x, ty: b.y }, { x: b.x, y: b.y, tx: a.x, ty: a.y }); }
    }
    for (const b of L.bur) L.burAt[b.y * W + b.x] = b;
    // cannons stand on a block of their own
    for (const e of L.ents) if (e.k === 'cannon') L.t[e.y * W + e.x] = T.USED;
    return L;
  }

  // ---- state
  function newState(L, opts) {
    opts = opts || {};
    const as = opts.assist || {};
    const S = {
      L, f: 0, rng: (hashStr(L.id) ^ (opts.seed | 0)) >>> 0, mod: {}, en: [], p: null, cam: { x: 0 }, vw: opts.vw || 320,
      coins: 0, med: 0, hurts: 0, deaths: 0, stomps: 0, maxCombo: 0, pounds: 0, cpIdx: -1, bossDead: 0, res: null, safe: null,
      assist: { hearts: !!as.hearts, auto: !!as.auto, slow: !!as.slow }, maxHearts: 3, prev: 0, ev: [], snap: null, bump: null, shake: 0, gearsUsed: 0, cond: { ribbon: 0, glide: 0, swim: 0, burrow: 0 },
    };
    const st = L.start || { x: 2, y: L.H - 4 };
    S.p = { x: st.x * TS + 3, y: st.y * TS + 2, w: PW, h: PH, vx: 0, vy: 0, face: 1, on: false, coy: 0, buf: 0, jumping: false, crouch: false, pound: 0, inv: 0, gear: opts.gear || 0, hearts: 3, swim: false,
      rope: null, ropeCd: 0, dead: 0, combo: 0, ride: -1, burCd: 0, whiff: 0, hurtT: 0, stand: 0, lastGt: 0, sx: 0, sy: 0, spr: 0 };
    spawn(S);
    S.cam.x = camTarget(S);
    S.safe = { x: S.p.x, y: S.p.y };
    S.snap = snapOf(S);
    return S;
  }
  function spawn(S) {
    const L = S.L; S.en = [];
    for (const d of L.ents) {
      const x = d.x * TS, y = d.y * TS, k = d.k;
      if (k === 'platH') S.en.push({ k: 'plat', sub: 'h', x: x - 4, y: y + 8, w: 40, h: 8, ox: x - 4, oy: y + 8, t: 0, dx: 0, dy: 0, px: 0, py: 0, vx: 0, vy: 0 });
      else if (k === 'platV') S.en.push({ k: 'plat', sub: 'v', x: x - 4, y: y + 8, w: 40, h: 8, ox: x - 4, oy: y + 8, t: 0, dx: 0, dy: 0, px: 0, py: 0, vx: 0, vy: 0 });
      else if (k === 'crumble') S.en.push({ k: 'plat', sub: 'c', x: x - 4, y: y + 8, w: 40, h: 8, ox: x - 4, oy: y + 8, t: 0, s: 0, dx: 0, dy: 0, px: 0, py: 0, vx: 0, vy: 0 });
      else if (GEAR[k]) S.en.push({ k: 'item', sub: GEAR[k], x: x + 2, y: y + 4, w: 12, h: 12, vx: 0, vy: 0, t: 99, dead: 0 });
      else if (k === 'boss') { const bk = S.L.meta.boss || 'bear', df = DEF[bk], m = S.L.meta; S.en.push({ k: 'boss', bk, x: x + 8 - df.w / 2, y: y + 16 - df.h, w: df.w, h: df.h, vx: 0, vy: 0, dir: -1, s: 0, t: 0, hp: BOSS_HP[bk], inv: 0, ox: x, oy: y, awake: 0, dead: 0, ph: 0, bx0: (m.arenaX0 || 0) * TS, bx1: (m.arenaX1 || L.W) * TS, sh: bk === 'golem' ? 1 : 0, cnt: 0, fy: (m.floorRow || 10) * TS, hide: bk === 'mouse' ? 1 : 0, hole: 1 }); if (bk === 'duck') { const b = S.en[S.en.length - 1]; b.y = (m.surfaceRow || 8) * TS - b.h + 10; b.x = x - 8; } if (bk === 'owl') { const b = S.en[S.en.length - 1]; b.y = 3 * TS; } if (bk === 'mouse') { const b = S.en[S.en.length - 1]; b.y = b.fy + 6; } }
      else if (k === 'pend') S.en.push({ k, x: x + 3, y: y + 3, w: 10, h: 10, ax: x + 8, ay: y, len: 88, t: (x * 7) % 64, dead: 0, ph: (x % 5) * 0.8 });
      else if (k === 'cannon') S.en.push({ k, x, y, w: 16, h: 16, t: 60 + (x * 3) % 50, dir: -1, dead: 0, ox: x, oy: y });
      else if (k === 'drip') S.en.push({ k, x: x + 4, y: y + 1, w: 8, h: 10, vx: 0, vy: 0, s: 0, t: 0, dead: 0, ox: x + 4, oy: y + 1 });
      else {
        const df = DEF[k];
        S.en.push({ k, x: x + (16 - df.w) / 2, y: y + 16 - df.h, w: df.w, h: df.h, vx: 0, vy: 0, dir: -1, t: (x * 5) % 40, s: 0, on: false, dead: 0, ox: x + (16 - df.w) / 2, oy: y + 16 - df.h, sh: k === 'umb' ? 1 : 0, ph: (x % 7) * 0.9 });
      }
    }
  }
  function hashStr(s) { let h = 2166136261; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619); } return h >>> 0; }

  // ---- cloning (the core is plain data; the static level is shared)
  function cloneEn(e) { const o = {}; for (const k in e) o[k] = e[k]; if (e.rope) o.rope = e.rope; return o; }
  function cloneP(p) { const o = {}; for (const k in p) o[k] = p[k]; if (p.rope) o.rope = { ax: p.rope.ax, ay: p.rope.ay, len: p.rope.len }; return o; }
  function snapOf(S) { return { p: cloneP(S.p), en: S.en.map(cloneEn), mod: Object.assign({}, S.mod), coins: S.coins, med: S.med, cpIdx: S.cpIdx, bossDead: S.bossDead, rng: S.rng, safe: S.safe && { x: S.safe.x, y: S.safe.y }, gearsUsed: S.gearsUsed }; }
  function clone(S) {
    return { L: S.L, f: S.f, rng: S.rng, mod: Object.assign({}, S.mod), en: S.en.map(cloneEn), p: cloneP(S.p), cam: { x: S.cam.x }, vw: S.vw, coins: S.coins, med: S.med, hurts: S.hurts, deaths: S.deaths, stomps: S.stomps,
      maxCombo: S.maxCombo, pounds: S.pounds, cpIdx: S.cpIdx, bossDead: S.bossDead, res: S.res && Object.assign({}, S.res), safe: S.safe && { x: S.safe.x, y: S.safe.y }, assist: S.assist, maxHearts: S.maxHearts, prev: S.prev, ev: [], snap: S.snap,
      bump: S.bump, shake: S.shake, gearsUsed: S.gearsUsed, cond: Object.assign({}, S.cond) };
  }
  function restore(S) {
    const sn0 = S.snap, c = { p: cloneP(sn0.p), en: sn0.en.map(cloneEn), mod: Object.assign({}, sn0.mod) };
    S.p = c.p; S.en = c.en; S.mod = c.mod; S.coins = sn0.coins; S.med = sn0.med; S.cpIdx = sn0.cpIdx; S.bossDead = sn0.bossDead; S.rng = sn0.rng; S.safe = sn0.safe && { x: sn0.safe.x, y: sn0.safe.y };
    S.gearsUsed = sn0.gearsUsed; S.p.hearts = S.maxHearts; S.p.inv = 90; S.p.dead = 0; S.p.vx = 0; S.p.vy = 0; S.p.rope = null; S.cam.x = camTarget(S); S.bump = null;
  }

  // ---- tiles
  function tl(S, tx, ty) {
    const L = S.L;
    if (tx < 0 || tx >= L.W) return T.GROUND;
    if (ty < 0 || ty >= L.H) return T.AIR;
    const i = ty * L.W + tx, m = S.mod[i];
    return m === undefined ? L.t[i] : m;
  }
  function setTl(S, tx, ty, v) { S.mod[ty * S.L.W + tx] = v; }
  const solid = (S, tx, ty) => SOLID[tl(S, tx, ty)] === 1;
  const EPS = 0.001;

  // move a box along x; returns 1 when blocked
  function moveX(S, b, dx) {
    if (dx === 0) return 0;
    b.x += dx;
    const y0 = Math.floor(b.y / TS), y1 = Math.floor((b.y + b.h - EPS) / TS);
    if (dx > 0) {
      const tx = Math.floor((b.x + b.w - EPS) / TS);
      for (let ty = y0; ty <= y1; ty++) if (solid(S, tx, ty)) { b.x = tx * TS - b.w; return 1; }
    } else {
      const tx = Math.floor(b.x / TS);
      for (let ty = y0; ty <= y1; ty++) if (solid(S, tx, ty)) { b.x = (tx + 1) * TS; return 1; }
    }
    return 0;
  }
  // move along y; returns 0, 1 (landed, moving down), -1 (hit head). info: b.gt = tile stood on, b.hx/hy = the head tile
  function moveY(S, b, dy, prevBottom, drop) {
    if (dy === 0) return 0;
    b.y += dy;
    const x0 = Math.floor(b.x / TS), x1 = Math.floor((b.x + b.w - EPS) / TS);
    if (dy > 0) {
      const ty = Math.floor((b.y + b.h - EPS) / TS);
      for (let tx = x0; tx <= x1; tx++) {
        const t = tl(S, tx, ty);
        if (SOLID[t] || (t === T.ONEWAY && !drop && prevBottom <= ty * TS + 0.01)) { b.y = ty * TS - b.h; b.gt = t; return 1; }
      }
    } else {
      const ty = Math.floor(b.y / TS);
      let best = -1, bd = 1e9;
      for (let tx = x0; tx <= x1; tx++) if (solid(S, tx, ty)) { const d = Math.abs(tx * TS + 8 - (b.x + b.w / 2)); if (d < bd) { bd = d; best = tx; } }
      if (best >= 0) { b.y = (ty + 1) * TS; b.hx = best; b.hy = ty; return -1; }
    }
    return 0;
  }
  const overlap = (a, b) => a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y;
  function hasGround(S, b) { // is there solid ground right under the box?
    const x0 = Math.floor((b.x + 1) / TS), x1 = Math.floor((b.x + b.w - 1 - EPS) / TS), ty = Math.floor((b.y + b.h + 0.5) / TS);
    for (let tx = x0; tx <= x1; tx++) { const t = tl(S, tx, ty); if (SOLID[t] || (t === T.ONEWAY && ((b.y + b.h) % TS) < 1)) return true; }
    return false;
  }
  function ev(S, name, x, y, n) { if (S.ev.length < 60) S.ev.push([name, x === undefined ? 0 : Math.round(x), y === undefined ? 0 : Math.round(y), n || 0]); }

  // ---- the frame
  function step(S, inp) {
    if (S.res) return;
    inp = inp | 0;
    const prev = S.prev; S.prev = inp;
    S.f++;
    if (S.shake > 0) S.shake--;
    const p = S.p;
    if (p.dead) { deadStep(S); return; }
    for (const e of S.en) if (e.k === 'plat') platStep(S, e);
    playerStep(S, inp, prev);
    if (p.dead) { camStep(S); return; }
    for (let i = 0; i < S.en.length; i++) { const e = S.en[i]; if (e.k !== 'plat') enemyStep(S, e); }
    interact(S);
    if (S.en.some(e => e.dead)) S.en = S.en.filter(e => !e.dead);
    camStep(S);
  }

  function camTarget(S) {
    const p = S.p, L = S.L, vw = S.vw;
    let t = p.x + p.w / 2 - vw * 0.45 + p.face * vw * 0.07;
    return Math.max(0, Math.min(L.W * TS - vw, t));
  }
  function camStep(S) {
    const t = camTarget(S);
    if (Math.abs(t - S.cam.x) > 160) S.cam.x = t; else S.cam.x += (t - S.cam.x) * 0.14;
  }

  // ---- moving platforms
  function platStep(S, e) {
    e.px = e.x; e.py = e.y; e.t++;
    if (e.sub === 'h') { e.x = e.ox + (1 - cs(e.t * 0.022)) * 28; }
    else if (e.sub === 'v') { e.y = e.oy - (1 - cs(e.t * 0.02)) * 32; }
    else if (e.sub === 'c') {
      if (e.s === 0 && S.p.ride >= 0 && S.en[S.p.ride] === e) { e.s = 1; e.t = 0; }
      if (e.s === 1 && e.t > 28) { e.s = 2; e.vy = 0; e.t = 0; }
      if (e.s === 2) { e.vy = Math.min(e.vy + 0.35, 5); e.y += e.vy; if (e.t > 200 || e.y > S.L.H * TS + 40) { e.s = 3; e.t = 0; e.y = e.oy; e.x = e.ox; } }
      if (e.s === 3 && e.t > 60) { e.s = 0; e.t = 0; }
    }
    e.dx = e.x - e.px; e.dy = e.y - e.py;
  }
  const platSolid = e => e.sub !== 'c' || e.s < 3;

  // ---- the player
  function playerStep(S, inp, prev) {
    const p = S.p, as = S.assist;
    const l = !!(inp & B.L), r = !!(inp & B.R), u = !!(inp & B.U), d = !!(inp & B.D), jh = !!(inp & B.J), act = !!(inp & B.ACT);
    const run = !!(inp & B.RUN) || as.auto;
    const jp = jh && !(prev & B.J), dp = d && !(prev & B.D), ap = act && !(prev & B.ACT);
    if (p.inv > 0) p.inv--;
    if (p.hurtT > 0) p.hurtT--;
    if (p.ropeCd > 0) p.ropeCd--;
    if (p.burCd > 0) p.burCd--;
    if (p.whiff > 0) p.whiff--;
    // carried by a platform
    if (p.ride >= 0) { const e = S.en[p.ride]; if (e && e.k === 'plat') { moveX(S, p, e.dx); p.y += e.dy; } }
    const cx = Math.floor((p.x + p.w / 2) / TS), cyb = Math.floor((p.y + p.h / 2) / TS);
    p.swim = tl(S, cx, cyb) === T.WATER;
    const gt = p.on ? p.gt : 0;
    const onIce = p.on && gt === T.ICE;
    // ---- ribbon (tether)
    if (p.gear === 3 && ap && !p.rope && p.ropeCd === 0) ribbonFire(S, u);
    else if (p.rope && (ap || jp)) { p.rope = null; p.ropeCd = 12; if (jp) { p.vy = Math.min(p.vy, -3.2); p.jumping = true; } ev(S, 'unrope', p.x, p.y); }
    // ---- horizontal
    const dir = (r ? 1 : 0) - (l ? 1 : 0);
    if (dir) p.face = dir;
    p.crouch = p.on && d && !p.swim && !p.rope;
    if (!p.crouch && p.h !== PH) { // stand up if there is headroom
      const t = { x: p.x, y: p.y + p.h - PH, w: p.w, h: PH };
      if (!boxSolid(S, t)) { p.y = t.y; p.h = PH; } else p.crouch = true;
    }
    if (p.crouch && p.h === PH) { p.y += PH - CROUCH_H; p.h = CROUCH_H; }
    let max = p.swim ? 1.05 : (run ? 2.25 : 1.35), acc, fr;
    if (p.crouch) max = 0.5;
    if (p.on) { acc = onIce ? 0.035 : (run ? 0.14 : 0.11); fr = onIce ? 0.012 : 0.13; if (dir && Math.sign(p.vx) === -dir) acc += onIce ? 0.03 : 0.16; }
    else { acc = p.swim ? 0.06 : 0.085; fr = p.swim ? 0.03 : 0.012; if (dir && Math.sign(p.vx) === -dir) acc += 0.05; }
    const glide = p.gear === 2 && !p.on && !p.swim && !p.rope && p.vy > 0.3 && jh;
    if (glide) max = Math.max(max, 2.6);
    if (p.rope) { acc = 0.05; max = 3.2; }
    if (dir && !(p.crouch && p.on && false)) { if (Math.abs(p.vx) < max || Math.sign(p.vx) !== dir) { p.vx += dir * acc; if (Math.abs(p.vx) > max && Math.sign(p.vx) === dir) p.vx = dir * Math.max(max, Math.abs(p.vx) - 0.1); } else if (Math.abs(p.vx) > max) p.vx -= Math.sign(p.vx) * Math.min(fr + 0.02, Math.abs(p.vx) - max); }
    else if (Math.abs(p.vx) > 0) { const dv = Math.min(fr, Math.abs(p.vx)); p.vx -= Math.sign(p.vx) * dv; }
    if (p.on && !dir) { /* friction above */ }
    // conveyor and wind
    let push = 0;
    if (p.on && gt === T.CONVR) push = 0.65; else if (p.on && gt === T.CONVL) push = -0.65;
    if (tl(S, cx, cyb) === T.WIND || tl(S, cx, Math.floor((p.y + p.h) / TS)) === T.WIND) { p.vy -= 0.62; if (p.vy < -2.3) p.vy = -2.3; p.on = false; p.windT = 6; }
    if (S.L.meta.wind) push += S.L.meta.wind;
    // ---- jump / swim
    // down + jump on a one-way floor drops through it (no jump)
    if (p.on && d && jp && p.gt === T.ONEWAY && p.ride < 0) { p.y += 2; p.on = false; p.coy = 0; p.buf = 0; p.vy = 1; p.crouch = false; }
    else if (jp) p.buf = 7; else if (p.buf > 0) p.buf--;
    if (p.on) p.coy = 6; else if (p.coy > 0) p.coy--;
    if (p.swim) {
      if (jp) { const surface = tl(S, cx, cyb - 1) !== T.WATER; p.vy = surface ? -5.4 : -2.5; ev(S, 'swim', p.x, p.y); S.cond.swim++; p.buf = 0; }   // at the surface a stroke hops you out of the water
      p.vy = Math.min(p.vy + 0.13, 1.5);
      if (p.vy < -6) p.vy = -6;
    } else if (!p.rope) {
      if (p.buf > 0 && p.coy > 0) {
        const bonus = Math.abs(p.vx) * 0.14;
        p.vy = -(6.55 + bonus) * (p.gear === 1 ? 1.24 : 1); p.buf = 0; p.coy = 0; p.jumping = true; p.on = false; p.ride = -1; ev(S, 'jump', p.x, p.y);
      }
      let g = (p.vy < 0 && jh) ? 0.33 : 0.56;
      if (p.vy < 0 && !jh && p.jumping && p.vy < -4) p.vy = -4;
      if (p.vy >= 0) p.jumping = false;
      if (glide) { g = 0.12; if (p.vy > 0.95) p.vy = 0.95; S.cond.glide++; if (S.f % 14 === 0) ev(S, 'glide', p.x, p.y); }
      if (p.pound) { g = 0.9; }
      p.vy += g;
      if (p.vy > (p.pound ? 9 : 8)) p.vy = p.pound ? 9 : 8;
      if (dp && !p.on && !p.swim && !p.pound && p.vy > -2) { p.pound = 1; p.vy = 8; p.vx = 0; ev(S, 'poundstart', p.x, p.y); }
    } else { p.vy += 0.33; }
    // ---- rope physics (the ribbon tether)
    if (p.rope) {
      const ro = p.rope; p.vx += (dir) * 0.045; p.vx *= 0.9985;
      if (moveX(S, p, p.vx)) p.vx *= -0.25;
      const pb0 = p.y + p.h, rr0 = moveY(S, p, p.vy, pb0, false);
      if (rr0 === 1) { p.vy = 0; p.on = true; p.gt = p.gt; } else { if (rr0 === -1) p.vy = 0; p.on = false; }
      const ccx = p.x + p.w / 2, ccy = p.y + p.h / 2, dx = ccx - ro.ax, dy = ccy - ro.ay, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > ro.len && dist > 0) {
        const nx = dx / dist, ny = dy / dist, sx = p.x, sy = p.y;
        p.x = ro.ax + nx * ro.len - p.w / 2; p.y = ro.ay + ny * ro.len - p.h / 2;
        if (boxSolid(S, p)) { p.x = sx; p.y = sy; }                 // a wall or the floor is in the way: stay, and just lose the outward speed
        const vr = p.vx * nx + p.vy * ny; if (vr > 0) { p.vx -= vr * nx; p.vy -= vr * ny; }
      }
      p.ride = -1;
    } else {
      // ---- move
      const vx = p.vx + push * (p.on ? 1 : (S.L.meta.wind ? 1 : 0));
      const hitX = moveX(S, p, p.swim ? vx : vx);
      if (hitX) { p.vx = 0; }
      const pb = p.y + p.h;
      const was = p.on;
      p.on = false;
      const drop = d && !!(inp & B.J) && false;
      let rv = moveY(S, p, p.vy, pb, drop);
      // platforms
      if (p.vy >= 0 && rv !== 1) {
        for (let i = 0; i < S.en.length; i++) {
          const e = S.en[i]; if (e.k !== 'plat' || !platSolid(e)) continue;
          if (p.x + p.w > e.x + 1 && p.x < e.x + e.w - 1 && pb <= e.py + 1.5 && p.y + p.h >= e.y - 0.01 && p.y + p.h <= e.y + 8 + Math.max(0, p.vy)) {
            p.y = e.y - p.h; rv = 1; p.ride = i; p.gt = T.ONEWAY; break;
          }
        }
      }
      if (rv === 1) {
        if (!was || p.vy > 3) { ev(S, 'land', p.x, p.y + p.h); }
        if (p.pound) landPound(S);
        if (p.gt === T.SPRING) { p.vy = -10.4; if (p.gear === 1) p.vy *= 1.1; p.on = false; p.spr = 8; ev(S, 'spring', p.x, p.y + p.h); p.jumping = jh; p.pound = 0; setSpr(S, p); }
        else { p.on = true; p.vy = 0; p.combo = 0; if (p.ride < 0 || !(S.en[p.ride] && S.en[p.ride].k === 'plat')) p.ride = -1; p.pound = 0; }
        if (p.on && p.ride >= 0 && !(S.en[p.ride] && S.en[p.ride].k === 'plat' && Math.abs(S.en[p.ride].y - (p.y + p.h)) < 1)) p.ride = -1;
      } else {
        if (rv === -1) { p.vy = 0; headHit(S, p); }
        if (!p.on) p.ride = -1;
      }
      // a platform you stand on stays under you even when it moved up faster than gravity
      if (p.on && p.ride < 0 && !hasGround(S, p)) { p.on = false; }
      if (p.on) { p.lastGt = p.gt; p.stand++; if (p.stand > 14 && p.gt !== T.SPRING && !hazardNear(S, p)) { S.safe = { x: p.x, y: p.y }; } } else p.stand = 0;
    }
    if (p.spr > 0) p.spr--;
    // pits: lose a heart and come back to the last safe spot
    if (p.y > S.L.H * TS + 24) { fell(S); return; }
    // tile effects
    tileEffects(S, p, dp, jp);
    if (p.on && p.vx === 0 && !dir) { /* idle */ }
    if (S.p.hearts > 0 && p.crouch === false && p.h !== PH) p.h = PH;
  }
  function setSpr(S, p) { const tx = Math.floor((p.x + p.w / 2) / TS), ty = Math.floor((p.y + p.h + 2) / TS); S.sprAt = { x: tx, y: ty, f: S.f }; }
  function boxSolid(S, b) {
    const x0 = Math.floor(b.x / TS), x1 = Math.floor((b.x + b.w - EPS) / TS), y0 = Math.floor(b.y / TS), y1 = Math.floor((b.y + b.h - EPS) / TS);
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) if (solid(S, tx, ty)) return true;
    return false;
  }
  function hazardNear(S, p) {
    const x0 = Math.floor((p.x - 6) / TS), x1 = Math.floor((p.x + p.w + 6) / TS), y = Math.floor((p.y + p.h / 2) / TS);
    for (let tx = x0; tx <= x1; tx++) { const t = tl(S, tx, y); if (t === T.SPIKE || t === T.CSPIKE) return true; }
    return false;
  }
  function headHit(S, p) {
    const tx = p.hx, ty = p.hy, t = tl(S, tx, ty);
    ev(S, 'bump', tx * TS + 8, ty * TS + 8);
    if (t === T.QBLK) { setTl(S, tx, ty, T.USED); S.coins++; ev(S, 'coin', tx * TS + 8, ty * TS - 4); S.bump = { x: tx, y: ty, f: S.f }; }
    else if (t === T.GBLK) {
      setTl(S, tx, ty, T.USED); S.bump = { x: tx, y: ty, f: S.f };
      const sub = (p.gear === 0 && S.L.meta.gear && GEAR[S.L.meta.gear]) ? GEAR[S.L.meta.gear] : 4;
      S.en.push({ k: 'item', sub, x: tx * TS + 2, y: ty * TS - 12, w: 12, h: 12, vx: 0, vy: 0, t: 0, dead: 0 });
      ev(S, 'itemup', tx * TS + 8, ty * TS);
    } else if (t === T.BRICK) {
      if (p.gear > 0) { setTl(S, tx, ty, T.AIR); ev(S, 'break', tx * TS + 8, ty * TS + 8); stunAbove(S, tx, ty); } else { S.bump = { x: tx, y: ty, f: S.f }; stunAbove(S, tx, ty); }
    } else { stunAbove(S, tx, ty); }
  }
  function stunAbove(S, tx, ty) { // bumping a block from below flips the walkers standing on it
    for (const e of S.en) if (!e.dead && DEF[e.k] && DEF[e.k].st && e.k !== 'boss' && e.k !== 'item' && Math.abs(e.x + e.w / 2 - (tx * TS + 8)) < 12 && Math.abs(e.y + e.h - ty * TS) < 3) { kill(S, e, 0); }
  }
  function landPound(S) {
    const p = S.p; S.pounds++; S.shake = 8; ev(S, 'pound', p.x + p.w / 2, p.y + p.h);
    const tx0 = Math.floor((p.x + 1) / TS), tx1 = Math.floor((p.x + p.w - 1 - EPS) / TS), ty = Math.floor((p.y + p.h + 0.5) / TS);
    for (let tx = tx0; tx <= tx1; tx++) if (tl(S, tx, ty) === T.BRICK) { setTl(S, tx, ty, T.AIR); ev(S, 'break', tx * TS + 8, ty * TS + 8); }
    for (const e of S.en) {
      if (e.dead || e.k === 'plat' || e.k === 'item' || e.k === 'shot' || e.k === 'boss' || e.k === 'pend' || e.k === 'cannon' || e.k === 'drip') continue;
      if (Math.abs(e.x + e.w / 2 - (p.x + p.w / 2)) < 34 && Math.abs(e.y + e.h - (p.y + p.h)) < 12) kill(S, e, 1);
    }
  }

  // ---- ribbon: grab a ring and swing, or yank the shield off / pull coins
  function ribbonFire(S, up) {
    const p = S.p, cx = p.x + p.w / 2, cy = p.y + p.h / 2, R = 92;
    let best = null, bd = 1e9;
    const tx0 = Math.floor((cx - R) / TS), tx1 = Math.floor((cx + R) / TS), ty0 = Math.floor((cy - R) / TS), ty1 = Math.floor((cy + R) / TS);
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      if (tl(S, tx, ty) !== T.RING) continue;
      const rx = tx * TS + 8, ry = ty * TS + 8, dx = rx - cx, dy = ry - cy, dist = Math.sqrt(dx * dx + dy * dy);
      if (dist > R || dist < 14 || dy > 10) continue;
      if (dx * p.face < -10) continue;                      // in front (or straight above)
      let score = dist + (dx * p.face < 0 ? 30 : 0) + (up ? Math.abs(dx) * 0.5 : 0);
      if (score < bd) { bd = score; best = { ax: rx, ay: ry, len: dist }; }
    }
    if (best) { p.rope = best; p.on = false; p.ride = -1; p.pound = 0; p.jumping = false; S.cond.ribbon++; ev(S, 'rope', best.ax, best.ay); return; }
    // enemies in front: strip shields, stun, and pull coins
    let hit = false;
    for (const e of S.en) {
      if (e.dead || e.k === 'plat' || e.k === 'item' || e.k === 'shot') continue;
      const dx = (e.x + e.w / 2 - cx) * p.face, dy = e.y + e.h / 2 - cy;
      if (dx > -4 && dx < 76 && Math.abs(dy) < 22) {
        if (e.k === 'umb' && e.sh) { e.sh = 0; e.s = 1; e.t = 0; e.vx = 0; hit = true; ev(S, 'yank', e.x, e.y); S.cond.ribbon++; }
        else if (e.k === 'boss' && e.bk === 'golem' && e.sh) { e.sh = 0; e.s = 6; e.t = 0; hit = true; ev(S, 'yank', e.x, e.y); }
        else if (DEF[e.k] && DEF[e.k].st && e.k !== 'boss') { kill(S, e, 2); hit = true; }
      }
    }
    for (let ty = ty0; ty <= ty1; ty++) for (let tx = tx0; tx <= tx1; tx++) {
      const t = tl(S, tx, ty);
      if (t === T.COIN) { const dx = tx * TS + 8 - cx, dy = ty * TS + 8 - cy; if (dx * dx + dy * dy < 76 * 76) { setTl(S, tx, ty, T.AIR); S.coins++; ev(S, 'coin', tx * TS + 8, ty * TS + 8); hit = true; } }
    }
    ev(S, hit ? 'whip' : 'whiff', cx + p.face * 24, cy); p.ropeCd = hit ? 16 : 22; p.whiff = 10;
  }

  // ---- tiles touched by the player
  function tileEffects(S, p, dp, jp) {
    const x0 = Math.floor((p.x + 1) / TS), x1 = Math.floor((p.x + p.w - 1 - EPS) / TS), y0 = Math.floor((p.y + 1) / TS), y1 = Math.floor((p.y + p.h - 1 - EPS) / TS), L = S.L;
    for (let ty = y0; ty <= y1; ty++) for (let tx = x0; tx <= x1; tx++) {
      const t = tl(S, tx, ty);
      if (t === T.AIR) continue;
      if (t === T.COIN) { setTl(S, tx, ty, T.AIR); S.coins++; ev(S, 'coin', tx * TS + 8, ty * TS + 8); }
      else if (t === T.MEDAL) {
        const id = L.medals.findIndex(m => m.x === tx && m.y === ty);
        setTl(S, tx, ty, T.AIR); if (id >= 0) S.med |= 1 << id; ev(S, 'medal', tx * TS + 8, ty * TS + 8, id);
      } else if (t === T.HEART) { setTl(S, tx, ty, T.AIR); if (p.hearts < S.maxHearts) p.hearts++; ev(S, 'heart', tx * TS + 8, ty * TS + 8); }
      else if (t === T.CP) {
        const ci = L.cps.findIndex(c => c.x === tx && c.y === ty);
        if (ci > S.cpIdx) { S.cpIdx = ci; if (p.hearts < S.maxHearts) p.hearts = Math.min(S.maxHearts, p.hearts + 1); ev(S, 'cp', tx * TS + 8, ty * TS); const sv = clone(S); sv.snap = null; S.snap = snapOf(S); S.snap.p.x = tx * TS + 3; S.snap.p.y = ty * TS + 2; S.snap.p.vx = 0; S.snap.p.vy = 0; S.snap.p.on = false; S.snap.p.crouch = false; S.snap.p.h = PH; S.snap.p.rope = null; S.snap.safe = { x: tx * TS + 3, y: ty * TS + 2 }; }
      } else if (t === T.GOAL) { /* handled below with a tall zone */ }
      else if (t === T.SPIKE) { if (p.y + p.h > ty * TS + 7 && p.inv === 0) { spikeHit(S); return; } }
      else if (t === T.CSPIKE) { if (p.y < ty * TS + 9 && p.inv === 0) { spikeHit(S); return; } }
    }
    // goal: a tall zone above the goal tile
    if (L.goal) {
      const g = L.goal;
      if (p.x + p.w > g.x * TS + 2 && p.x < g.x * TS + 14 && p.y + p.h > (g.y - 3) * TS && p.y < (g.y + 1) * TS && !(g.gated && !S.bossDead)) win(S);
    }
    // burrow
    if (dp && p.on && p.burCd === 0) {
      const tx = Math.floor((p.x + p.w / 2) / TS), ty = Math.floor((p.y + p.h - 1) / TS), b = L.burAt[ty * L.W + tx];
      if (b) { p.x = b.tx * TS + 3; p.y = b.ty * TS + 2; p.vx = 0; p.vy = 0; p.burCd = 30; p.inv = Math.max(p.inv, 12); S.cam.x = camTarget(S); S.safe = { x: p.x, y: p.y }; S.cond.burrow++; ev(S, 'burrow', p.x, p.y); }
    }
    // enter a burrow by pressing down while standing on top of it too (the mouth is the tile you stand in)
  }
  function win(S) {
    if (S.res) return;
    S.res = { frames: S.f, coins: S.coins, med: S.med, hurts: S.hurts, deaths: S.deaths, hearts: S.p.hearts, stomps: S.stomps, maxCombo: S.maxCombo, pounds: S.pounds, cond: S.cond };
    ev(S, 'goal', S.p.x, S.p.y);
  }
  function spikeHit(S) { // forgiving: lose a heart and go back to the last safe spot
    const p = S.p; ev(S, 'hurt', p.x, p.y);
    if (hurtCore(S)) return;
    if (S.safe) { p.x = S.safe.x; p.y = S.safe.y; p.vx = 0; p.vy = 0; p.on = false; p.rope = null; p.pound = 0; }
    p.inv = 90; S.cam.x = camTarget(S);
  }
  function fell(S) {
    const p = S.p; ev(S, 'fall', p.x, S.L.H * TS);
    if (hurtCore(S)) return;
    if (S.safe) { p.x = S.safe.x; p.y = S.safe.y; p.vx = 0; p.vy = 0; p.on = false; p.rope = null; p.pound = 0; }
    p.inv = 90; S.cam.x = camTarget(S);
  }
  // returns true when the hit killed the player
  function hurtCore(S) {
    const p = S.p; S.hurts++;
    if (p.gear > 0) { p.gear = 0; p.rope = null; ev(S, 'gearoff', p.x, p.y); return false; }
    if (!S.assist.hearts) p.hearts--;
    if (p.hearts <= 0) { die(S); return true; }
    return false;
  }
  function hurt(S, srcX) {
    const p = S.p;
    if (p.inv > 0 || p.dead) return;
    ev(S, 'hurt', p.x, p.y);
    if (hurtCore(S)) return;
    p.inv = 100; p.hurtT = 18; p.vy = -3.4; p.vx = (p.x + p.w / 2 < srcX ? -1 : 1) * 1.7; p.on = false; p.pound = 0; p.rope = null; p.ride = -1;
  }
  function die(S) {
    const p = S.p; p.dead = 1; p.vy = -6; p.vx = 0; p.rope = null; p.pound = 0; S.deaths++; p.deadT = 0; ev(S, 'die', p.x, p.y);
  }
  function deadStep(S) {
    const p = S.p; p.deadT++; p.vy = Math.min(p.vy + 0.35, 8); p.y += p.vy;
    if (p.deadT > 70) { restore(S); ev(S, 'respawn', S.p.x, S.p.y); }
  }

  // ---- kill an enemy: how = 0 bump, 1 stomp/pound, 2 ribbon
  function kill(S, e, how) {
    if (e.dead) return;
    e.dead = 1; ev(S, how === 1 ? 'stomp' : 'poof', e.x + e.w / 2, e.y + e.h / 2, e.k.length);
    if (how === 1) { S.stomps++; }
  }

  // ---- enemies
  function enemyStep(S, e) {
    if (e.dead) return;
    const p = S.p;
    if (e.k === 'item') { itemStep(S, e); return; }
    const near = Math.abs(e.x + e.w / 2 - (p.x + p.w / 2)) < ACT_R;
    if (!near && e.k !== 'shot' && !(e.k === 'boss' && e.awake)) return;
    e.t++;
    switch (e.k) {
      case 'bug': walk(S, e, 0.42, false); break;
      case 'windup': walk(S, e, 0.78, true); break;
      case 'pin': walk(S, e, 0.3, true); break;
      case 'umb': umbStep(S, e); break;
      case 'frog': {
        gravity(S, e);
        if (e.on) {
          e.vx = 0;
          if (e.t > 62) { const dir = (p.x > e.x) ? 1 : -1; e.dir = dir; e.vx = dir * 1.05; e.vy = -4.8; e.on = false; e.t = 0; }
        }
        moveBody(S, e, false);
        break;
      }
      case 'bat': e.x = e.ox + sn(e.t * 0.02 + e.ph) * 40; e.y = e.oy + sn(e.t * 0.065 + e.ph) * 16; e.dir = cs(e.t * 0.02 + e.ph) > 0 ? 1 : -1; break;
      case 'balloon': e.y = e.oy + sn(e.t * 0.05 + e.ph) * 26; e.x = e.ox + sn(e.t * 0.025 + e.ph) * 6; break;
      case 'bird': birdStep(S, e); break;
      case 'roller': rollerStep(S, e); break;
      case 'drip': dripStep(S, e); break;
      case 'pend': { const a = sn(e.t * 0.045 + e.ph) * 0.95; e.x = e.ax + sn(a) * e.len - 5; e.y = e.ay + cs(a) * e.len - 5; e.ang = a; break; }
      case 'cannon': {
        const dx = p.x - e.x;
        e.dir = dx < 0 ? -1 : 1;
        if (e.t >= 130 && Math.abs(dx) < 190 && Math.abs(dx) > 20 && Math.abs(p.y - e.y) < 90) { e.t = 0; S.en.push({ k: 'shot', sub: 'pellet', x: e.x + 8 + e.dir * 8 - 3, y: e.y + 5, w: 6, h: 6, vx: e.dir * 1.5, vy: 0, g: 0, life: 200, dead: 0 }); ev(S, 'shoot', e.x, e.y); }
        else if (e.t > 130) e.t = 130;
        break;
      }
      case 'shot': {
        e.life--; if (e.life <= 0) { e.dead = 1; break; }
        if (e.g) e.vy = Math.min(e.vy + e.g, 6);
        e.x += e.vx; e.y += e.vy;
        if (e.sub === 'pellet' || e.sub === 'bubble' || e.sub === 'snow' || e.sub === 'screw') { if (solid(S, Math.floor((e.x + e.w / 2) / TS), Math.floor((e.y + e.h / 2) / TS))) e.dead = 1; }
        if (e.y > S.L.H * TS + 30) e.dead = 1;
        break;
      }
      case 'boss': bossStep(S, e); break;
    }
    if (e.y > S.L.H * TS + 40 && e.k !== 'boss') e.dead = 1;
  }
  function itemStep(S, e) {
    const p = S.p;
    if (e.t < 16) { e.t++; e.y -= 0.75; return; }
    e.t++;
    if (overlap(p, e) && !p.dead) {
      e.dead = 1;
      if (e.sub === 4) { if (p.hearts < S.maxHearts) p.hearts++; ev(S, 'heart', e.x, e.y); }
      else { p.gear = e.sub; S.gearsUsed |= (1 << e.sub); ev(S, 'gear', e.x, e.y, e.sub); }
    }
  }
  function gravity(S, e) { e.vy = Math.min(e.vy + 0.4, 6); }
  // move a ground body; returns flags. On landing e.on = true; wall hit flips dir.
  function moveBody(S, e, turnWall) {
    const hit = moveX(S, e, e.vx);
    if (hit) { if (turnWall) { e.dir = -e.dir; e.vx = -e.vx; } else e.vx = 0; e.wall = 1; } else e.wall = 0;
    const pb = e.y + e.h, r = moveY(S, e, e.vy, pb, false);
    e.on = r === 1; if (r) e.vy = 0;
    return hit;
  }
  function ledgeAhead(S, e) {
    const tx = Math.floor((e.x + (e.dir > 0 ? e.w + 2 : -2)) / TS), ty = Math.floor((e.y + e.h + 2) / TS);
    const t = tl(S, tx, ty); return !(SOLID[t] || t === T.ONEWAY);
  }
  function walk(S, e, sp, ledge) {
    gravity(S, e); e.vx = e.dir * sp;
    const hit = moveBody(S, e, true);
    if (hit) { /* flipped */ } else if (ledge && e.on && ledgeAhead(S, e)) { e.dir = -e.dir; e.vx = -e.vx; }
  }
  function umbStep(S, e) {
    if (e.s === 1) { // stunned (shield pulled off): stays put, then walks bare
      gravity(S, e); e.vx = 0; moveBody(S, e, false); if (e.t > 36) e.s = 2; return;
    }
    walk(S, e, e.s === 2 ? 0.7 : 0.55, true);
  }
  function birdStep(S, e) {
    const p = S.p, dx = p.x - e.x;
    if (e.s === 0) { e.x = e.ox + sn(e.t * 0.018 + e.ph) * 44; e.y = e.oy + sn(e.t * 0.05) * 3; if (e.t > 50 && Math.abs(dx) < 44 && p.y > e.y + 12 && p.y - e.y < 120) { e.s = 1; e.t = 0; e.vx = dx > 0 ? 0.9 : -0.9; e.vy = 2.6; } e.sx = e.x; }
    else if (e.s === 1) { e.x += e.vx; e.y += e.vy; e.vy = Math.min(e.vy + 0.04, 3.2); if (solid(S, Math.floor((e.x + 6) / TS), Math.floor((e.y + 10) / TS)) || e.t > 40) { e.s = 2; e.t = 0; } }
    else { e.y += (e.oy - e.y) * 0.06; e.x += (e.ox - e.x) * 0.03; if (Math.abs(e.y - e.oy) < 1.5 && e.t > 20) { e.s = 0; e.t = 0; } }
  }
  function rollerStep(S, e) {
    const p = S.p;
    gravity(S, e);
    if (e.s === 0) { e.vx = 0; if (Math.abs(p.x - e.x) < 92 && Math.abs(p.y - e.y) < 40) { e.s = 1; e.t = 0; e.dir = p.x > e.x ? 1 : -1; } }
    else if (e.s === 1) { e.vx = 0; if (e.t > 22) { e.s = 2; e.t = 0; } }
    else if (e.s === 2) { e.vx = e.dir * 1.65; if (e.wall && e.t > 4) { e.s = 3; e.t = 0; e.vx = 0; } }
    else { e.vx = 0; if (e.t > 70) { e.s = 0; e.t = 0; } }
    const hit = moveBody(S, e, false);
    if (hit && e.s === 2) { e.wall = 1; }
  }
  function dripStep(S, e) {
    const p = S.p;
    if (e.s === 0) { e.vy = 0; e.y = e.oy + (e.t % 12 < 6 ? 0 : 1); if (Math.abs((p.x + p.w / 2) - (e.x + 4)) < 16 && p.y > e.y && p.y - e.y < 170) { e.s = 1; e.t = 0; } }
    else if (e.s === 1) { e.vy = Math.min(e.vy + 0.32, 5.5); const pb = e.y + e.h; if (moveY(S, e, e.vy, pb, false) === 1) { e.s = 2; e.t = 0; ev(S, 'splat', e.x, e.y + e.h); } }
    else { if (e.t > 140) { e.s = 0; e.t = 0; e.x = e.ox; e.y = e.oy; e.vy = 0; } }
  }

  // ---- bosses
  function bossStep(S, e) {
    const p = S.p;
    if (!e.awake) { if (Math.abs(p.x - e.x) < 190) { e.awake = 1; e.t = 0; ev(S, 'boss', e.x, e.y); } else { if (e.bk === 'bear' || e.bk === 'general' || e.bk === 'golem') { gravity(S, e); moveBody(S, e, false); } return; } }
    if (e.inv > 0) e.inv--;
    const ph = BOSS_HP[e.bk] - e.hp;      // 0.. how many hits it has taken
    const cxp = p.x + p.w / 2, cxe = e.x + e.w / 2;
    bossAI(S, e, ph, cxp, cxe);
    // the arena is closed for the boss: walls count as hits
    if (e.x < e.bx0) { e.x = e.bx0; e.vx = 0; e.wall = 1; if (e.s === 1 && e.bk === 'general') e.bump = 1; }
    else if (e.x + e.w > e.bx1) { e.x = e.bx1 - e.w; e.vx = 0; e.wall = 1; if (e.s === 1 && e.bk === 'general') e.bump = 1; }
  }
  function bossAI(S, e, ph, cxp, cxe) {
    switch (e.bk) {
      case 'bear': {
        if (e.s === 0) { gravity(S, e); e.vx = 0; moveBody(S, e, false); e.dir = cxp > cxe ? 1 : -1; if (e.t > 70 - ph * 16) { e.s = 1; e.vy = -7.6; e.vx = e.dir * (1.15 + ph * 0.3); e.t = 0; e.on = false; ev(S, 'bossjump', e.x, e.y); } }
        else if (e.s === 1) {
          gravity(S, e); moveBody(S, e, true);
          if (e.on && e.t > 6) {
            e.s = 2; e.t = 0; e.vx = 0; S.shake = 14; ev(S, 'quake', e.x + e.w / 2, e.y + e.h);
            S.en.push({ k: 'shot', sub: 'wave', x: cxe - 5, y: e.y + e.h - 7, w: 10, h: 7, vx: 1.35 + ph * 0.2, vy: 0, g: 0, life: 110, dead: 0 });
            S.en.push({ k: 'shot', sub: 'wave', x: cxe - 5, y: e.y + e.h - 7, w: 10, h: 7, vx: -(1.35 + ph * 0.2), vy: 0, g: 0, life: 110, dead: 0 });
          }
        } else { gravity(S, e); e.vx = 0; moveBody(S, e, false); if (e.t > 50 - ph * 8) { e.s = 0; e.t = 0; } }
        break;
      }
      case 'general': {
        if (e.s === 0) { gravity(S, e); e.vx = 0; moveBody(S, e, false); e.dir = cxp > cxe ? 1 : -1; if (e.t > 55 - ph * 10) { e.s = 1; e.t = 0; ev(S, 'bosscharge', e.x, e.y); } }
        else if (e.s === 1) { gravity(S, e); e.vx = e.dir * (1.9 + ph * 0.45); const hit = moveBody(S, e, false) || e.bump; e.bump = 0; if (hit && e.t > 8) { e.s = 2; e.t = 0; e.vx = 0; S.shake = 12; ev(S, 'quake', e.x, e.y); if (ph >= 1) S.en.push({ k: 'bug', x: Math.max(16, Math.min(S.L.W * TS - 32, cxp - 6)), y: 4, w: 12, h: 12, vx: 0, vy: 0, dir: -1, t: 0, s: 0, on: false, dead: 0, ox: 0, oy: 0, sh: 0, ph: 0 }); } }
        else { gravity(S, e); e.vx = 0; moveBody(S, e, false); if (e.t > 110) { e.s = 0; e.t = 0; } }
        break;
      }
      default: bossStep2(S, e, ph, cxp, cxe);
    }
  }
  // bosses 3-6 (kinematic movers: no gravity, they ignore tiles and are kept inside the arena by bx0/bx1)
  function bossStep2(S, e, ph, cxp, cxe) {
    const p = S.p, m = S.L.meta;
    switch (e.bk) {
      case 'duck': { // rubber duck sub: floats on the surface (stomp it), dives, fires bubbles up from the bottom, comes back
        const sy = (m.surfaceRow || 8) * TS - e.h + 10, by = e.fy - e.h;
        if (e.s === 0) { e.y = sy + sn(e.t * 0.08) * 2; e.dir = cxp > cxe ? 1 : -1; e.x += e.dir * (0.5 + ph * 0.12); if (e.t > 150 - ph * 18) { e.s = 1; e.t = 0; } }
        else if (e.s === 1) { e.y += 1.7; if (e.y >= by) { e.y = by; e.s = 2; e.t = 0; for (let k = -1; k <= 1; k++) S.en.push({ k: 'shot', sub: 'bubble', x: cxe - 3 + k * 8, y: e.y - 4, w: 8, h: 8, vx: k * 0.45, vy: -1.15, g: 0, life: 170, dead: 0 }); ev(S, 'shoot', e.x, e.y); } }
        else if (e.s === 2) { if (e.t > 50 - ph * 8) { e.s = 3; e.t = 0; } }
        else { e.y -= 1.3; if (e.y <= sy) { e.y = sy; e.s = 0; e.t = 0; } }
        break;
      }
      case 'owl': { // blizzard owl: hovers and throws snowballs, then swoops to the ground and crashes (dizzy = stomp it)
        const hy = 3 * TS + sn(e.t * 0.05) * 8;
        if (e.s === 0) {
          e.y += (hy - e.y) * 0.08; e.dir = cxp > cxe ? 1 : -1; e.x += e.dir * (0.6 + ph * 0.15);
          if (e.t % (70 - ph * 8) === 0 && e.t > 0) { e.cnt++; const vx = Math.max(-1.3, Math.min(1.3, (cxp - cxe) / 70)); S.en.push({ k: 'shot', sub: 'snow', x: cxe - 3, y: e.y + e.h - 4, w: 7, h: 7, vx, vy: 0.4, g: 0.035, life: 200, dead: 0 }); ev(S, 'shoot', e.x, e.y); }
          if (e.cnt >= 3) { e.s = 1; e.t = 0; e.cnt = 0; e.tx = cxp; }
        } else if (e.s === 1) { e.x += Math.sin(e.t * 1.8) * 0.8; e.y -= 0.5; if (e.t > 28) { e.s = 2; e.t = 0; e.vx = Math.max(-2.2, Math.min(2.2, (e.tx - cxe) / 38)); e.vy = 2.4; } }
        else if (e.s === 2) { e.x += e.vx; e.y += e.vy; e.vy = Math.min(e.vy + 0.12, 5); if (e.y + e.h >= e.fy) { e.y = e.fy - e.h; e.s = 3; e.t = 0; S.shake = 12; ev(S, 'quake', cxe, e.fy); } }
        else if (e.s === 3) { if (e.t > 120 - ph * 10) { e.s = 4; e.t = 0; } }
        else { e.y -= 2; if (e.y <= hy + 2) { e.s = 0; e.t = 0; } }
        break;
      }
      case 'mouse': { // clock mouse: pops out of one of three holes for a moment (that is when you can stomp it), then hides again
        const hx = [e.bx0 + 56, (e.bx0 + e.bx1) / 2 - e.w / 2, e.bx1 - 56 - e.w];
        if (e.s === 0) { e.hide = 1; e.y = e.fy + 6; if (e.t > 55 - ph * 8) { e.hole = (rnd(S) * 3) | 0; if (e.hole === e.lastHole) e.hole = (e.hole + 1) % 3; e.lastHole = e.hole; e.x = hx[e.hole]; e.s = 1; e.t = 0; e.hide = 0; ev(S, 'boss', e.x, e.fy); } }
        else if (e.s === 1) { e.y = Math.max(e.fy - e.h, e.y - 2.2); if (e.t > 84 - ph * 6) { e.s = 2; e.t = 0; } }
        else { e.y += 2.4; if (e.y >= e.fy + 6) { e.s = 0; e.t = 0; e.hide = 1; } }
        break;
      }
      case 'golem': { // screwdriver golem: shielded; stomps (shock waves), flings screws, calls umbrellas. A ground pound or the ribbon breaks the shield (then stomp it)
        if (e.s === 0) { gravity(S, e); e.dir = cxp > cxe ? 1 : -1; e.vx = e.dir * (0.4 + ph * 0.07); moveBody(S, e, false); if (e.t > 120 - ph * 8) { e.s = 1; e.t = 0; e.vy = -6.4; e.vx = 0; e.on = false; } }
        else if (e.s === 1) { gravity(S, e); moveBody(S, e, false); if (e.on && e.t > 6) { e.s = 2; e.t = 0; S.shake = 14; ev(S, 'quake', cxe, e.y + e.h);
            S.en.push({ k: 'shot', sub: 'wave', x: cxe - 5, y: e.y + e.h - 7, w: 10, h: 7, vx: 1.3, vy: 0, g: 0, life: 110, dead: 0 }); S.en.push({ k: 'shot', sub: 'wave', x: cxe - 5, y: e.y + e.h - 7, w: 10, h: 7, vx: -1.3, vy: 0, g: 0, life: 110, dead: 0 });
            if (ph >= 2) S.en.push({ k: 'shot', sub: 'screw', x: cxe - 3, y: e.y, w: 7, h: 7, vx: Math.max(-1.6, Math.min(1.6, (cxp - cxe) / 50)), vy: -3.2, g: 0.13, life: 160, dead: 0 });
            if (ph >= 4 && S.en.filter(q => q.k === 'umb').length < 2) { const sx = cxp < (e.bx0 + e.bx1) / 2 ? e.bx1 - 40 : e.bx0 + 30; S.en.push({ k: 'umb', x: sx, y: e.fy - 14, w: 14, h: 14, vx: 0, vy: 0, dir: -1, t: 0, s: 0, on: false, dead: 0, ox: sx, oy: e.fy - 14, sh: 1, ph: 0 }); } } }
        else if (e.s === 2) { gravity(S, e); e.vx = 0; moveBody(S, e, false); if (e.t > 36) { e.s = 0; e.t = 0; } }
        else if (e.s === 6) { gravity(S, e); e.vx = 0; moveBody(S, e, false); if (e.t > 170) { e.s = 0; e.t = 0; e.sh = 1; } }
        break;
      }
    }
  }
  function bossHit(S, e, pound) {
    // stomped from above. Which states are weak depends on the boss.
    let weak = e.inv === 0;
    const p = S.p;
    if (e.bk === 'golem' && e.sh && pound) { e.sh = 0; e.s = 6; e.t = 0; p.vy = -6; p.on = false; p.pound = 0; p.y = Math.min(p.y, e.y - p.h); S.shake = 12; ev(S, 'yank', e.x + e.w / 2, e.y); return; }
    if (e.bk === 'general' && e.s !== 2) weak = false;
    if (e.bk === 'golem') weak = weak && e.s === 6;
    if (e.bk === 'duck' && e.s !== 0) weak = false;
    if (e.bk === 'owl' && e.s !== 3) weak = false;
    if (e.bk === 'mouse' && e.s !== 1) weak = false;
    p.vy = weak ? -6.5 : -5; p.on = false; p.pound = 0; p.combo = 0; p.jumping = true; p.y = Math.min(p.y, e.y - p.h);
    if (!weak) { ev(S, 'bonk', e.x, e.y); return; }
    e.hp--; e.inv = 70; S.stomps++; S.shake = 10; ev(S, 'bosshit', e.x + e.w / 2, e.y);
    if (e.hp <= 0) { e.dead = 1; S.bossDead = 1; ev(S, 'bossdown', e.x + e.w / 2, e.y + e.h / 2); S.shake = 24;
      const L = S.L; for (let i = 0; i < L.t.length; i++) if (L.t[i] === T.GATE && S.mod[i] === undefined) S.mod[i] = T.AIR; S.coins += 5;
      for (const o of S.en) if (o.k === 'shot') o.dead = 1;
    } else if (e.bk === 'golem') { e.s = 0; e.t = 0; e.sh = 1; }
  }

  // ---- contact between the player and everything else
  function interact(S) {
    const p = S.p; if (p.dead) return;
    for (let i = 0; i < S.en.length; i++) {
      const e = S.en[i];
      if (e.dead || e.k === 'plat' || e.k === 'item') continue;
      if (e.k !== 'shot' && !(e.k === 'boss' && e.awake) && Math.abs(e.x + e.w / 2 - (p.x + p.w / 2)) > ACT_R) continue;
      let hb = e;
      if (e.k === 'cannon') continue;
      if (e.k === 'boss' && (!e.awake || e.hide)) continue;
      if (e.k === 'shot' && e.sub === 'wave') hb = e;
      if (!overlap(p, hb)) continue;
      // stomp?
      const pb = p.y + p.h, falling = p.vy > 0.1 || p.pound;
      const above = pb - e.y < (e.k === 'boss' ? 12 : 9) && p.vy >= -0.5;
      if (e.k === 'shot' || e.k === 'pend' || e.k === 'drip') { hurt(S, e.x + e.w / 2); continue; }
      if (e.k === 'boss') {
        if (above && falling) { bossHit(S, e, p.pound); }
        else hurt(S, e.x + e.w / 2);
        continue;
      }
      if (above && falling) {
        if (e.k === 'pin') { if (p.pound) { kill(S, e, 1); p.vy = -4; continue; } hurt(S, e.x + e.w / 2); continue; }
        if (e.k === 'umb' && e.sh) {
          if (p.pound) { kill(S, e, 1); p.vy = -5; p.pound = 0; p.combo++; continue; }
          p.vy = -6.2; p.on = false; p.jumping = true; p.y = Math.min(p.y, e.y - p.h); ev(S, 'clang', e.x, e.y); continue;
        }
        kill(S, e, 1); p.combo++; if (p.combo > S.maxCombo) S.maxCombo = p.combo;
        const jh = !!(S.prev & B.J);
        p.vy = jh ? -8.2 : -5.4; p.on = false; p.jumping = jh; p.pound = 0; p.ride = -1; p.y = Math.min(p.y, e.y - p.h);
        continue;
      }
      if (e.k === 'balloon' && above) continue;
      if (e.k === 'umb' && e.s === 1) continue;       // stunned: harmless until it recovers
      if (e.k === 'roller' && e.s === 3) continue;
      hurt(S, e.x + e.w / 2);
    }
  }

  // ---- inputs: run-length encoding
  function rle(arr) {
    const out = []; let i = 0;
    while (i < arr.length) { let j = i; while (j < arr.length && arr[j] === arr[i]) j++; out.push(arr[i].toString(36) + ':' + (j - i).toString(36)); i = j; }
    return out.join(',');
  }
  function unrle(s) {
    const out = []; if (!s) return out;
    for (const tok of String(s).split(',')) { const k = tok.split(':'); const m = parseInt(k[0], 36), n = parseInt(k[1], 36); if (!(m >= 0 && n > 0)) continue; for (let i = 0; i < n; i++) out.push(m); }
    return out;
  }
  function runReplay(L, inputs, opts) {
    const S = newState(L, opts);
    for (let i = 0; i < inputs.length && !S.res; i++) { step(S, inputs[i]); S.ev.length = 0; }
    return S;
  }
  // coarse hash (solver de-duplication)
  function hash(S) {
    const p = S.p;
    let h = ((p.x / 3) | 0) * 7919 + ((p.y / 3) | 0) * 104729 + ((p.vx * 3) | 0) * 31 + ((p.vy * 2) | 0) * 17 + (p.on ? 1 : 0) + p.hearts * 5 + p.gear * 11 + S.cpIdx * 977 + S.med * 131 + S.coins * 13 + (p.rope ? 3 : 0) + (p.inv > 0 ? 1 : 0) * 23 + (S.bossDead ? 99999 : 0);
    for (const e of S.en) if (e.k === 'boss') h += e.hp * 1000003 + e.s * 31;
    return h | 0;
  }
  // exact signature (determinism tests)
  function sig(S) {
    let h = 2166136261;
    const add = v => { h ^= Math.round(v * 1000) | 0; h = Math.imul(h, 16777619); };
    const p = S.p; add(p.x); add(p.y); add(p.vx); add(p.vy); add(p.hearts); add(S.coins); add(S.med); add(S.f); add(S.deaths);
    for (const e of S.en) { add(e.x); add(e.y); }
    return (h >>> 0).toString(16);
  }

  const HE = { TS, B, T, CH, DEF, GEAR, PW, PH, BOSS_HP, parse, newState, step, clone, hash, sig, rle, unrle, runReplay, tl, solid, overlap, camTarget, hasGround, bossAI: {}, SOLID };
  if (typeof module === 'object' && module && module.exports) module.exports = HE;
  root.HopEngine = HE;
})(typeof globalThis !== 'undefined' ? globalThis : this);
