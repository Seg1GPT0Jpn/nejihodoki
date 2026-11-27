// ほしぞら守備隊 (Starfield Guard) - the pure engine. Runs in node and in the browser. Fixed 60 Hz step, seeded RNG.
// A run is fully determined by (opts, input log). Only + - * / sqrt floor imul are used (own sin/cos).
//
//   InvadeEngine.newGame(o) -> S    o: { mode:'classic'|'campaign'|'survival'|'endless'|'daily', level (campaign, 0-based), seed, np:1|2 (co-op), alt, assist, mods, dkey }
//   InvadeEngine.step(S, m0, m1, x0, x1)   m = IN bit mask (L R FIRE BOMB); x = optional drag target (px) that moves the base toward it at up to 4.2 px/frame
//   InvadeEngine.newSession(o) / sessionStep(se, ...)   solo, 'alt' (two alternating games) or 'coop' (np = 2)
//   InvadeEngine.interval(alive, total, spec) = the march interval in frames (the speed-up law): floor(mi + (bi - mi) * alive / total)
//   InvadeEngine.hash(S), dailyFor(dkey)
// Field 240 x 320, origin top-left. The base is at y = 296, the shields at y = 228, the invasion line at y = 262.
(function (root) {
  'use strict';
  const LV = root.InvadeLevels || (typeof require === 'function' ? require('./levels.js') : null);
  const W = 240, H = 320, SPX = 18, SPY = 15, AW = 12, AH = 9, INV = 262, PY = 296, SHY = 228, SCW = 12, SCH = 8, CELL = 2;
  const IN = { L: 1, R: 2, FIRE: 4, BOMB: 8 };
  const SCORE_CAP = 9999999, INTRO = 80, CLEAR = 150;
  const EXT = [20000, 60000, 150000, 300000, 500000, 800000, 1200000, 2000000];
  const TAU = 6.283185307179586, PI = 3.141592653589793;
  const SHAPE = ['.xxxxxxxxxx.', 'xxxxxxxxxxxx', 'xxxxxxxxxxxx', 'xxxxxxxxxxxx', 'xxxxxxxxxxxx', 'xxxx....xxxx', 'xxx......xxx', 'xxx......xxx'];
  const SHT = []; for (let y = 0; y < SCH; y++) for (let x = 0; x < SCW; x++) SHT.push(SHAPE[y][x] === 'x' ? 1 : 0);
  const SHN = SHT.reduce((a, b) => a + b, 0);
  const BSZ = [[2, 6], [3, 6], [3, 5], [6, 9], [2, 8], [4, 4]]; // zap, wiggle, aimed, bomb, rain, orb
  const BSP = [1, 0.85, 1.1, 0.7, 1.35, 1];
  const DAILY = [2, 4, 3, 7, 9, 5];

  function sin(a) {
    a -= TAU * Math.floor(a / TAU + 0.5);
    const x2 = a * a;
    return a * (1 - x2 / 6 * (1 - x2 / 20 * (1 - x2 / 42 * (1 - x2 / 72 * (1 - x2 / 110 * (1 - x2 / 156 * (1 - x2 / 210 * (1 - x2 / 272))))))));
  }
  const cos = a => sin(a + PI / 2);
  function rnd(S) {
    let t = S.rs = (S.rs + 0x6D2B79F5) | 0;
    t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }
  const mkRng = seed => { const S = { rs: seed | 0 }; return () => rnd(S); };
  const clamp = (x, a, b) => (x < a ? a : x > b ? b : x);
  const ri = (S, n) => Math.floor(rnd(S) * n);

  // the speed-up law: fewer aliens left -> shorter march interval
  function interval(alive, total, sp) {
    const r = total > 0 ? clamp(alive / total, 0, 1) : 1;
    return Math.max(1, Math.floor(sp.mi + (sp.bi - sp.mi) * r));
  }

  // ---------------------------------------------------------------- setup
  function newGame(o) {
    o = o || {};
    const mode = ['classic', 'campaign', 'survival', 'endless', 'daily'].indexOf(o.mode) >= 0 ? o.mode : 'classic';
    const np = o.np === 2 ? 2 : 1, mods = (o.mods || []).slice();
    const S = {
      mode, o: { mode, level: o.level | 0, seed: o.seed | 0, np, alt: !!o.alt, assist: o.assist | 0, mods, dkey: o.dkey | 0 },
      rs: (o.seed | 0) || 1, frame: 0, np, alt: !!o.alt, assist: o.assist | 0, mods, rot: o.rot | 0,
      wave: 0, phase: 'intro', pt: 0, spec: null, pl: [], inf: mode === 'endless', hold: 0,
      lives: 3, score: 0, chain: 0, ct: 0, nx: 0, hitW: false, slow: 0, won: false, over: false, stars: 0, mult: 1,
      al: [], ga: 0, gt: 1, fx: 0, fy: 0, dir: 1, mt: 20, stepN: 0, zs: 4, drops: 0, ft: 90, dvT: 300, su: 800, bt: 0,
      pb: [], eb: [], sh: [], shMax: 1, sau: null, caps: [], boss: null, bm: null, mn: [], bag: [], ev: [], bpi: 0, bq: [],
      st: { kills: 0, saucers: 0, caps: 0, capm: 0, bombs: 0, maxChain: 0, perfect: 0, waves: 0, bosses: 0, shots: 0, hits: 0, lost: 0, bonus: 0, rep: 0, heals: 0, splits: 0, dives: 0, gems: 0, pierce: 0 },
    };
    if (mode === 'survival') S.lives = 1;
    if (mods.indexOf('gold') >= 0) S.lives = 2;
    if (mods.indexOf('nosh') >= 0) S.lives += 1;
    if (np === 2) S.lives += 1;
    if (mode === 'campaign') S.lives = 3;
    for (let i = 0; i < np; i++) S.pl.push(newPlayer(S, i));
    startWave(S, 1);
    return S;
  }
  function newPlayer(S, i) {
    const tiny = S.mods.indexOf('tiny') >= 0;
    return { i, x: S.np === 2 ? (i ? W * 0.7 : W * 0.3) : W / 2, y: PY, cd: 0, inv: 0, dead: 0, bb: 1, spr: 0, rap: 0, prc: 0, sh: 0, pbp: 0, hw: tiny ? 5 : 7, hh: 4, fl: 0, sp: tiny ? 2.7 : 2.3, tm: 0 };
  }

  function specFor(S, n) {
    const o = S.o; let sp;
    if (S.mode === 'campaign') sp = LV.campaign(clamp(o.level, 0, LV.CAMPAIGN.length - 1));
    else if (S.mode === 'survival') sp = LV.gen(n, { off: 6, mode: 'survival' });
    else if (S.mode === 'endless') sp = LV.gen(n, { cap: 24, mode: 'endless' });
    else if (S.mode === 'daily') sp = LV.gen(DAILY[Math.min(n, DAILY.length) - 1], { di: 5 + n * 2, mode: 'daily', rot: S.rot });
    else sp = LV.gen(n, { mode: 'classic' });
    applyMods(S, sp);
    return sp;
  }
  function applyMods(S, sp) {
    const m = S.mods;
    if (m.indexOf('fast') >= 0) sp.bi = Math.max(sp.mi + 2, Math.floor(sp.bi * 0.75));
    if (m.indexOf('rain') >= 0) { sp.fi = Math.max(24, Math.floor(sp.fi * 0.65)); sp.mb += 3; }
    if (m.indexOf('nosh') >= 0) sp.sh = 0;
    if (m.indexOf('bigb') >= 0) sp.allb = true;
    if (m.indexOf('zig') >= 0) sp.mask = sp.mask.map(r => r.replace(/b/g, 'z'));
    if (m.indexOf('armor') >= 0) sp.arm = 1;
    if (m.indexOf('moon') >= 0) sp.su = Math.min(sp.su, 360);
    if (m.indexOf('dive') >= 0 && sp.kind === 'wave') { sp.dv = 240; sp.dvAny = true; }
    if (S.assist & 1) { sp.bi = Math.floor(sp.bi * 1.3); sp.bv = Math.round(sp.bv * 80) / 100; sp.fi = Math.floor(sp.fi * 1.25); }
  }

  function startWave(S, n) {
    S.wave = n; const sp = S.spec = specFor(S, n);
    S.phase = 'intro'; S.pt = 0; S.hitW = false; S.pb.length = 0; S.eb.length = 0; S.caps.length = 0; S.mn.length = 0; S.sau = null; S.bm = null; S.boss = null; S.bq.length = 0; S.slow = 0;
    // formation
    const cols = sp.mask.reduce((a, r) => Math.max(a, r.length), 1);
    S.al = []; S.fx = (W - (cols - 1) * SPX) / 2; S.fy = sp.fy - 60; S.dir = 1; S.stepN = 0; S.zs = 4; S.drops = 0;
    for (let r = 0; r < sp.mask.length; r++) for (let c = 0; c < sp.mask[r].length; c++) {
      const ch = sp.mask[r][c]; if (ch === '.') continue;
      const t = LV.CH[ch]; if (t == null) continue;
      let hp = LV.ENEMY[t].hp; if (sp.arm && (t === 0 || t === 1)) hp += 1;
      S.al.push({ t, hp, mh: hp, r, c, x: 0, y: 0, fl: 0, st: 0, alive: true, rv: t === 5 ? 1 : 0, tm: 140 + ((r * 31 + c * 17) % 120), ph: 0, vx: 0, vy: 0 });
    }
    S.ga = S.al.length; S.gt = Math.max(1, S.ga);
    S.mt = sp.bi; S.ft = Math.floor(sp.fi * 1.3) + 40; S.dvT = sp.dv ? sp.dv : 99999; S.su = sp.su || 99999; S.bt = sp.lim || 0;
    place(S);
    if (sp.kind === 'boss') {
      const b = LV.BOSS[sp.boss], cyc = sp.cyc | 0, mh = Math.round(b.hp * (1 + 0.35 * cyc) * (S.np === 2 ? 1.5 : 1));
      S.boss = { k: sp.boss, x: W / 2, y: -30, w: 44, h: 24, hp: mh, mh, ph: 0, t: 0, at: 150, fl: 0, dead: false, cyc };
    }
    buildShields(S, sp);
    for (const p of S.pl) { if (p.dead === 0) p.inv = Math.max(p.inv, 90); if (S.mode === 'survival' || (S.assist & 2)) p.sh = 900; }
  }
  function buildShields(S, sp) {
    const n = sp.sh | 0, fresh = S.sh.length !== n || sp.kind === 'boss' || S.mode === 'campaign' || S.wave === 1;
    if (fresh) {
      S.sh = [];
      for (let i = 0; i < n; i++) S.sh.push({ x: Math.round(W * (i + 0.5) / n - SCW), y: SHY, g: SHT.slice(), n: SHN });
    } else {
      for (const s of S.sh) for (let k = 0; k < s.g.length; k++) if (SHT[k] && !s.g[k] && rnd(S) < 0.55) { s.g[k] = 1; s.n++; }
    }
    S.shMax = Math.max(1, S.sh.length * SHN);
  }
  function shieldRatio(S) { if (!S.sh.length) return 1; let n = 0; for (const s of S.sh) n += s.n; return n / S.shMax; }
  function repairShields(S) { for (const s of S.sh) { s.g = SHT.slice(); s.n = SHN; } }

  function place(S) {
    for (const a of S.al) if (a.st === 0) { a.x = S.fx + a.c * SPX + (a.t === 1 ? S.zs : 0); a.y = S.fy + a.r * SPY; }
  }

  // ---------------------------------------------------------------- helpers
  const ev = (S, t, x, y, a, b) => { if (S.ev.length < 400) S.ev.push({ t, x, y, a, b }); };
  function award(S, base, x, y, noChain) {
    let m = 1;
    if (!noChain) { S.chain++; S.ct = 110; if (S.chain > S.st.maxChain) S.st.maxChain = S.chain; m = 1 + Math.min(4, Math.floor((S.chain - 1) / 5)); }
    S.mult = m;
    let pts = base * m; if (S.mods.indexOf('gold') >= 0) pts = Math.floor(pts * 1.5);
    S.score = Math.min(SCORE_CAP, S.score + pts);
    while (S.nx < EXT.length + 40 && S.score >= (S.nx < EXT.length ? EXT[S.nx] : EXT[EXT.length - 1] + (S.nx - EXT.length + 1) * 1000000)) {
      S.nx++; if (S.lives < 6) { S.lives++; ev(S, 'extend', x, y); } else ev(S, 'extend', x, y, 1);
    }
    ev(S, 'pts', x, y, pts, m);
    return pts;
  }
  function nextCap(S) {
    if (!S.bag.length) { const a = [0, 1, 2, 3, 4, 5, 6]; for (let i = a.length - 1; i > 0; i--) { const j = ri(S, i + 1); const t = a[i]; a[i] = a[j]; a[j] = t; } S.bag = a; }
    return S.bag.pop();
  }
  function dropCap(S, x, y, k) { S.caps.push({ x, y, k: k == null ? nextCap(S) : k, ph: 0 }); ev(S, 'drop', x, y, S.caps[S.caps.length - 1].k); }
  function alivePl(S) { return S.pl.filter(p => p.dead === 0); }

  function shAt(S, x, y) {
    for (const s of S.sh) {
      if (x >= s.x && x < s.x + SCW * CELL && y >= s.y && y < s.y + SCH * CELL) {
        const cx = Math.floor((x - s.x) / CELL), cy = Math.floor((y - s.y) / CELL), k = cy * SCW + cx;
        if (s.g[k]) return { s, k, cx, cy };
      }
    }
    return null;
  }
  function shErode(S, h, r) {
    const s = h.s;
    for (let dy = -r; dy <= r; dy++) for (let dx = -r; dx <= r; dx++) {
      const x = h.cx + dx, y = h.cy + dy; if (x < 0 || y < 0 || x >= SCW || y >= SCH) continue;
      const d2 = dx * dx + dy * dy; const k = y * SCW + x;
      if (!s.g[k]) continue;
      if (d2 <= r * r || (d2 <= r * r + 2 && rnd(S) < 0.5)) { s.g[k] = 0; s.n--; }
    }
  }
  function shBox(S, x0, y0, x1, y1) {
    for (const s of S.sh) {
      if (x1 < s.x || x0 > s.x + SCW * CELL || y1 < s.y || y0 > s.y + SCH * CELL) continue;
      for (let cy = 0; cy < SCH; cy++) for (let cx = 0; cx < SCW; cx++) {
        const k = cy * SCW + cx; if (!s.g[k]) continue;
        const px = s.x + cx * CELL, py = s.y + cy * CELL;
        if (px + CELL > x0 && px < x1 && py + CELL > y0 && py < y1) { s.g[k] = 0; s.n--; }
      }
    }
  }

  // ---------------------------------------------------------------- players
  function maxB(p) { return p.rap > 0 ? 6 : 4; }
  function ownCount(S, i) { let n = 0; for (const b of S.pb) if (b.o === i && !b.dead) n++; return n; }
  function stepPlayer(S, p, m, tx) {
    if (p.fl > 0) p.fl--;
    if (p.spr > 0) p.spr--; if (p.rap > 0) p.rap--; if (p.prc > 0) p.prc--;
    if (p.inv > 0) p.inv--;
    if (p.dead > 0) {
      p.dead--;
      if (p.dead === 0 && S.phase !== 'over') {
        if (S.alt && S.lives > 0 && S.np === 1) { S.hold = 1; ev(S, 'turn', p.x, p.y); p.dead = -1; }
        else respawn(S, p);
      }
      return;
    }
    if (p.dead < 0) return;
    // move
    const sp = p.sp;
    if (tx != null && tx === tx) { const d = clamp(tx - p.x, -4.2, 4.2); p.x += d; }
    else { if (m & IN.L) p.x -= sp; if (m & IN.R) p.x += sp; }
    p.x = clamp(p.x, 9, W - 9);
    if (S.phase !== 'play') { p.pbp = (m & IN.BOMB) ? 1 : 0; return; }
    // fire
    if (p.cd > 0) p.cd--;
    if ((m & IN.FIRE) && p.cd <= 0 && ownCount(S, p.i) < maxB(p)) shoot(S, p);
    // bomb (edge)
    if ((m & IN.BOMB) && !p.pbp && p.bb > 0) bomb(S, p);
    p.pbp = (m & IN.BOMB) ? 1 : 0;
  }
  function respawn(S, p) { p.dead = 0; p.x = S.np === 2 ? (p.i ? W * 0.7 : W * 0.3) : W / 2; p.inv = 130; p.cd = 10; p.spr = p.rap = p.prc = 0; p.sh = (S.assist & 2) ? 900 : (S.mode === 'survival' ? p.sh : 0); p.bb = Math.max(p.bb, 1); }
  function resume(S) { S.hold = 0; for (const p of S.pl) if (p.dead < 0) respawn(S, p); }
  function shoot(S, p) {
    p.cd = p.rap > 0 ? 6 : 12;
    const mk = (vx) => S.pb.push({ x: p.x, y: p.y - 8, vx, vy: -6.2, o: p.i, pr: p.prc > 0, hit: null, dead: false });
    if (p.spr > 0) { mk(-1.5); mk(0); mk(1.5); S.st.shots += 3; } else { mk(0); S.st.shots += 1; }
    ev(S, 'shot', p.x, p.y - 8, p.i);
  }
  function bomb(S, p) {
    p.bb--; S.st.bombs++; ev(S, 'bomb', p.x, p.y);
    S.eb.length = 0; S.bm = null;
    for (const a of S.al) if (a.alive && a.st !== 2 && Math.abs(a.x - p.x) < 66) hurtAlien(S, a, 2, true);
    for (let i = S.mn.length - 1; i >= 0; i--) { const m = S.mn[i]; killMini(S, m, true); S.mn.splice(i, 1); }
    if (S.sau && Math.abs(S.sau.x - p.x) < 80) killSaucer(S);
    if (S.boss && !S.boss.dead && S.boss.y > 0) hurtBoss(S, 10);
    p.inv = Math.max(p.inv, 40);
  }

  function hurtPlayer(S, p, why) {
    if (p.dead !== 0 || p.inv > 0) return false;
    if (p.sh > 0) { p.sh = 0; p.inv = 60; ev(S, 'shield', p.x, p.y); return false; }
    S.hitW = true; S.chain = 0; S.ct = 0; S.st.lost++;
    ev(S, 'pdie', p.x, p.y, p.i, why);
    p.spr = p.rap = p.prc = 0;
    if (S.inf) { p.dead = 50; p.inv = 0; return true; }
    S.lives--;
    p.dead = 105;
    if (S.lives <= 0) { gameOver(S); }
    return true;
  }
  function gameOver(S) { if (S.phase === 'over') return; S.phase = 'over'; S.over = true; S.pt = 0; ev(S, 'over', 0, 0); }

  // ---------------------------------------------------------------- aliens
  function hurtAlien(S, a, d, quiet) {
    if (!a.alive) return false;
    a.hp -= d; a.fl = 6; S.st.hits += quiet ? 0 : 0;
    if (a.hp > 0) { ev(S, 'ping', a.x, a.y, a.t); return false; }
    a.alive = false; S.ga--; S.st.kills++;
    const E = LV.ENEMY[a.t];
    if (a.t === 3) { for (let i = 0; i < 2; i++) S.mn.push({ x: a.x + (i ? 5 : -5), y: a.y, vx: i ? 0.7 : -0.7, vy: 0.5, hp: 1, fl: 0, ph: i * 3 }); S.st.splits++; ev(S, 'split', a.x, a.y); }
    if (a.t === 8) S.st.gems++;
    award(S, E.pts, a.x, a.y);
    ev(S, 'kill', a.x, a.y, a.t);
    return true;
  }
  function killMini(S, m, quiet) {
    S.st.kills++; award(S, 10, m.x, m.y, !!quiet); ev(S, 'kill', m.x, m.y, 7);
  }
  function killSaucer(S) {
    const u = S.sau; if (!u) return; S.sau = null; S.st.saucers++;
    award(S, u.v, u.x, u.y); ev(S, 'sau', u.x, u.y, u.v);
    dropCap(S, u.x, u.y + 6);
  }
  function hurtBoss(S, d) {
    const b = S.boss; if (!b || b.dead) return; b.hp -= d; b.fl = 5;
    if (b.hp > 0) {
      const ph = b.hp > b.mh * 0.66 ? 0 : b.hp > b.mh * 0.33 ? 1 : 2;
      if (ph !== b.ph) { b.ph = ph; S.eb.length = 0; ev(S, 'phase', b.x, b.y, ph); b.at = 70; }
      ev(S, 'bhit', b.x, b.y);
      return;
    }
    b.dead = true; b.hp = 0; S.st.bosses++;
    const B = LV.BOSS[b.k]; award(S, Math.floor(B.sc * (1 + 0.5 * b.cyc)), b.x, b.y, true);
    ev(S, 'boss', b.x, b.y, b.k); S.eb.length = 0; S.bm = null; S.bq.length = 0;
    for (const a of S.al) if (a.alive) { a.alive = false; ev(S, 'kill', a.x, a.y, a.t); }
    S.ga = 0;
    for (const m of S.mn) ev(S, 'kill', m.x, m.y, 7); S.mn.length = 0;
    dropCap(S, b.x - 12, b.y + 14); dropCap(S, b.x + 12, b.y + 14);
  }

  function bottoms(S) {
    const m = {};
    for (const a of S.al) if (a.alive && a.st === 0 && (m[a.c] == null || a.r > m[a.c].r)) m[a.c] = a;
    return Object.keys(m).map(k => m[k]);
  }
  function eshot(S, x, y, k, vx, vy) {
    if (S.spec.allb && k !== 5) k = 3;
    const sz = BSZ[k];
    S.eb.push({ x, y, x0: x, vx: vx || 0, vy: vy != null ? vy : S.spec.bv * BSP[k], k, ph: 0, w: sz[0], h: sz[1], hp: k === 3 ? 2 : 1 });
    ev(S, 'eshot', x, y, k);
  }
  function kindOf(a) { return a.t === 6 ? 3 : a.t === 1 ? 1 : 0; }
  function fireEnemy(S) {
    const sp = S.spec; if (!sp.pat || !sp.pat.length) return;
    let tot = 0; for (const p of sp.pat) tot += p[1];
    let r = rnd(S) * tot, pat = sp.pat[0][0]; for (const p of sp.pat) { r -= p[1]; if (r <= 0) { pat = p[0]; break; } }
    const bs = bottoms(S); if (!bs.length) return;
    const pls = alivePl(S); const px = pls.length ? pls.reduce((s, p) => s + p.x, 0) / pls.length : W / 2;
    if (pat === 'col') {
      let a = bs[ri(S, bs.length)];
      const bo = S.al.filter(q => q.alive && q.st === 0 && q.t === 6);
      if (bo.length && rnd(S) < 0.4) a = bo[ri(S, bo.length)];
      eshot(S, a.x, a.y + 6, kindOf(a));
    } else if (pat === 'aim') {
      let a = bs[0], bd = 1e9; for (const q of bs) { const d = Math.abs(q.x - px); if (d < bd) { bd = d; a = q; } }
      eshot(S, a.x, a.y + 6, kindOf(a));
    } else if (pat === 'burst') {
      let a = bs[ri(S, bs.length)];
      for (const q of bs) if (Math.abs(q.c - a.c) <= 1 && S.eb.length < sp.mb + 3) eshot(S, q.x, q.y + 6, 0);
    } else {
      for (let i = 0; i < 2; i++) { const a = bs[ri(S, bs.length)]; eshot(S, a.x, a.y + 6, 4); }
    }
  }
  function startDive(S) {
    const pool = S.al.filter(a => a.alive && a.st === 0 && (a.t === 4 || S.spec.dvAny));
    if (!pool.length) return;
    const a = pool[ri(S, pool.length)]; a.st = 1; a.vy = 1.25; a.ph = rnd(S) * 6; a.fired = false; S.st.dives++;
    ev(S, 'dive', a.x, a.y);
  }
  function stepDivers(S) {
    const pls = alivePl(S); const px = pls.length ? pls[0].x : W / 2;
    for (const a of S.al) {
      if (!a.alive) continue;
      if (a.st === 1) {
        a.ph += 0.09; a.y += a.vy;
        a.x += sin(a.ph) * 1.1 + clamp((px - a.x) * 0.012, -0.5, 0.5);
        a.x = clamp(a.x, 8, W - 8);
        if (!a.fired && a.y > 150) { a.fired = true; eshot(S, a.x, a.y + 6, 2); }
        if (a.y > H + 10) { a.st = 2; a.y = -12; a.x = S.fx + a.c * SPX; }
      } else if (a.st === 2) {
        a.x = S.fx + a.c * SPX; const ty = S.fy + a.r * SPY;
        if (a.y >= ty) { a.st = 0; } else a.y = Math.min(ty, a.y + 1.8);
      }
    }
  }

  function march(S) {
    const sp = S.spec; let minC = 99, maxC = -1, zig = false, any = false;
    for (const a of S.al) if (a.alive && a.st === 0) { any = true; if (a.c < minC) minC = a.c; if (a.c > maxC) maxC = a.c; if (a.t === 1) zig = true; }
    if (!any) return;
    const pad = 8 + (zig ? 4 : 0), left = S.fx + minC * SPX - pad, right = S.fx + maxC * SPX + pad;
    if ((S.dir > 0 && right + sp.sx > W - 3) || (S.dir < 0 && left - sp.sx < 3)) { S.fy += sp.dy; S.dir = -S.dir; S.drops++; ev(S, 'drop', 0, 0); }
    else S.fx += S.dir * sp.sx;
    S.stepN++; S.zs = -S.zs; place(S);
    ev(S, 'march', 0, 0, S.stepN & 3);
  }
  function invade(S) {
    ev(S, 'invade', 0, 0); S.hitW = true; S.st.lost++; S.chain = 0; S.ct = 0;
    S.eb.length = 0; S.bm = null;
    if (!S.inf) { S.lives--; if (S.lives <= 0) { for (const p of S.pl) { p.dead = Math.max(p.dead, 105); } gameOver(S); return; } }
    S.fy = S.spec.fy; S.fx = (W - ((S.al.reduce((m, a) => Math.max(m, a.c), 0)) * SPX)) / 2; S.dir = 1; S.mt = S.spec.bi; place(S);
    for (const a of S.al) if (a.st !== 0) { a.st = 0; }
    place(S); repairShields(S);
    for (const p of S.pl) { if (p.dead === 0) p.inv = Math.max(p.inv, 120); }
  }

  // ---------------------------------------------------------------- boss
  function stepBoss(S) {
    const b = S.boss, B = LV.BOSS[b.k]; b.t++;
    if (b.fl > 0) b.fl--;
    if (b.y < 58) { b.y += 0.8; b.at = Math.max(b.at, 60); return; }
    b.x = W / 2 + sin(b.t * B.spd) * (W / 2 - 34);
    if (b.ph >= 2) b.y = 58 + sin(b.t * 0.03) * 6;
    // queued aimed orbs
    for (let i = S.bq.length - 1; i >= 0; i--) {
      const q = S.bq[i]; q.t--; if (q.t <= 0) { const pls = alivePl(S), px = pls.length ? pls[0].x : W / 2; const dx = px - b.x, dy = PY - b.y, d = Math.sqrt(dx * dx + dy * dy) || 1; eshot(S, b.x, b.y + 12, 5, dx / d * S.spec.bv * 1.5, dy / d * S.spec.bv * 1.5); S.bq.splice(i, 1); }
    }
    b.at--;
    if (b.at > 0) return;
    const list = B.pats[b.ph], id = list[S.bpi++ % list.length]; b.at = Math.floor(B.iv[b.ph] * (S.np === 2 ? 0.9 : 1));
    const sp = S.spec.bv, pls = alivePl(S); const px = pls.length ? pls[ri(S, pls.length)].x : W / 2;
    ev(S, 'bfire', b.x, b.y, id);
    if (id === 'fan') {
      const n = 5 + b.ph * 2;
      const a0 = (px - b.x) / 240; // aim roughly at the player: angle from straight down
      for (let i = 0; i < n; i++) { const a = a0 + (i - (n - 1) / 2) * 0.17; eshot(S, b.x, b.y + 12, 5, sin(a) * sp * 1.15, cos(a) * sp * 1.15); }
    } else if (id === 'ring') {
      const n = 10 + b.ph * 2, off = S.bpi * 0.37;
      for (let i = 0; i < n; i++) { const a = off + i * TAU / n; eshot(S, b.x, b.y + 4, 5, sin(a) * sp * 0.85, Math.abs(cos(a)) * sp * 0.85 + sp * 0.2); }
    } else if (id === 'rain') {
      const n = 6 + b.ph * 2; for (let i = 0; i < n; i++) eshot(S, 14 + rnd(S) * (W - 28), 20 + rnd(S) * 20, 4);
    } else if (id === 'sum') {
      if (S.mn.length < 6) for (let i = 0; i < 2; i++) S.mn.push({ x: b.x + (i ? 14 : -14), y: b.y + 12, vx: i ? 0.8 : -0.8, vy: 0.6, hp: 1, fl: 0, ph: i * 3 });
    } else if (id === 'beam') {
      S.bm = { x: px, t: 0, w: 14 };
    } else if (id === 'line') {
      for (let i = 0; i < 5; i++) S.bq.push({ t: 4 + i * 8 });
    } else if (id === 'bomb') {
      eshot(S, b.x - 12, b.y + 12, 3); eshot(S, b.x + 12, b.y + 12, 3);
    }
  }

  // ---------------------------------------------------------------- the frame
  function step(S, m0, m1, x0, x1) {
    S.frame++;
    if (S.hold) return;
    const ms = [m0 | 0, m1 | 0], xs = [x0, x1];
    if (S.phase === 'over' || S.phase === 'done') {
      S.pt++;
      for (const p of S.pl) { if (p.dead > 0) p.dead--; }
      decay(S); return;
    }
    S.pt++;
    if (S.slow > 0) S.slow--;
    const en = !(S.slow > 0 && (S.frame & 1));
    if (S.ct > 0 && --S.ct === 0) { if (S.chain >= 5) ev(S, 'chain', 0, 0, S.chain); S.chain = 0; }
    for (let i = 0; i < S.np; i++) stepPlayer(S, S.pl[i], ms[i], xs[i]);
    if (S.phase === 'over') { decay(S); return; }
    const sp = S.spec;
    if (S.phase === 'intro') {
      if (S.fy < sp.fy) { S.fy = Math.min(sp.fy, S.fy + 1); place(S); }
      if (S.boss && S.boss.y < 58) S.boss.y += 0.8;
      if (S.pt >= INTRO) { S.phase = 'play'; S.pt = 0; ev(S, 'go', 0, 0); }
      stepPlayerBullets(S); stepCaps(S); decay(S); return;
    }
    if (S.phase === 'play') {
      if (en) {
        // march
        if (!S.boss || S.ga > 0) {
          if (--S.mt <= 0) {
            march(S);
            S.mt = interval(S.ga, S.gt, sp);
            if (S.phase === 'play') {
              // invasion check
              if (sp.kind !== 'bonus') { for (const a of S.al) if (a.alive && a.st === 0 && a.y + 5 >= INV) { invade(S); break; } }
              else for (const a of S.al) if (a.alive && a.y + 5 >= INV) { a.alive = false; S.ga--; }
            }
          }
        }
        if (S.phase !== 'play') { decay(S); return; }
        // enemy fire
        if (sp.fi > 0 && --S.ft <= 0) {
          const r = S.gt > 0 ? clamp(S.ga / S.gt, 0, 1) : 1;
          if (S.eb.length < sp.mb && S.ga > 0) fireEnemy(S);
          S.ft = Math.max(8, Math.floor(sp.fi * (0.55 + 0.45 * r) * (0.7 + rnd(S) * 0.6)));
        }
        if (sp.dv && --S.dvT <= 0) { startDive(S); S.dvT = Math.floor(sp.dv * (0.7 + rnd(S) * 0.6)); }
        stepDivers(S);
        stepHealers(S);
        stepMinis(S);
        if (S.boss && !S.boss.dead) stepBoss(S);
        stepBeam(S);
      }
      if (sp.kind === 'bonus' && S.bt > 0) S.bt--;
      stepSaucer(S);
      stepPlayerBullets(S);
      if (en) stepEnemyBullets(S);
      stepCaps(S);
      bodyHits(S);
      if (S.phase === 'over') { decay(S); return; }
      if (S.phase === 'play') checkClear(S);
    } else if (S.phase === 'clear') {
      stepPlayerBullets(S); stepCaps(S);
      if (S.pt >= CLEAR) nextWave(S);
    }
    decay(S);
  }
  function decay(S) {
    for (const a of S.al) if (a.fl > 0) a.fl--;
    for (const m of S.mn) if (m.fl > 0) m.fl--;
    if (S.boss && S.boss.fl > 0 && (S.phase === 'over' || S.phase === 'done')) S.boss.fl--;
  }

  function stepHealers(S) {
    for (const a of S.al) {
      if (!a.alive || a.t !== 5 || a.st !== 0) continue;
      if (--a.tm > 0) continue; a.tm = 300;
      let did = false;
      for (const q of S.al) {
        if (q === a || !q.alive || q.st !== 0 || Math.abs(q.c - a.c) > 1 || Math.abs(q.r - a.r) > 1) continue;
        if (q.hp < q.mh) { q.hp = q.mh; did = true; }
      }
      if (!did && a.rv > 0) {
        for (const q of S.al) {
          if (q.alive || q.st !== 0 || q.t === 5 || Math.abs(q.c - a.c) > 1 || Math.abs(q.r - a.r) > 1) continue;
          q.alive = true; q.hp = q.mh; S.ga++; a.rv--; did = true; ev(S, 'revive', q.x, q.y); break;
        }
      }
      if (did) { S.st.heals++; ev(S, 'heal', a.x, a.y); }
    }
  }
  function stepMinis(S) {
    for (let i = S.mn.length - 1; i >= 0; i--) {
      const m = S.mn[i]; m.ph += 0.1; m.x += m.vx + sin(m.ph) * 0.2; m.y += m.vy;
      if (m.x < 6) { m.x = 6; m.vx = Math.abs(m.vx); } if (m.x > W - 6) { m.x = W - 6; m.vx = -Math.abs(m.vx); }
      if (m.y > SHY - 6) shBox(S, m.x - 4, m.y - 3, m.x + 4, m.y + 3);
      if (m.y > H + 8) S.mn.splice(i, 1);
    }
  }
  function stepBeam(S) {
    const b = S.bm; if (!b) return; b.t++;
    if (b.t === 40) ev(S, 'beam', b.x, 0);
    if (b.t >= 40 && b.t < 70) for (const p of S.pl) if (p.dead === 0 && Math.abs(p.x - b.x) < b.w / 2 + p.hw) hurtPlayer(S, p, 'beam');
    if (b.t >= 70) S.bm = null;
  }
  function stepSaucer(S) {
    const sp = S.spec;
    if (S.sau) {
      const u = S.sau; u.x += u.vx;
      if (u.x < -24 || u.x > W + 24) S.sau = null;
    } else if (sp.su && S.phase === 'play') {
      if (--S.su <= 0) {
        const ok = S.ga >= 5 || sp.kind !== 'wave';
        if (ok && !(S.boss && S.boss.dead)) { const dirn = (S.stepN + S.wave) & 1 ? 1 : -1; S.sau = { x: dirn > 0 ? -16 : W + 16, y: 26, vx: dirn * 1.0, v: [50, 100, 150, 300][ri(S, 4)] }; ev(S, 'saucer', S.sau.x, 26); }
        S.su = Math.floor(sp.su * (0.8 + rnd(S) * 0.5));
      }
    }
  }
  function stepCaps(S) {
    for (let i = S.caps.length - 1; i >= 0; i--) {
      const c = S.caps[i]; c.y += 0.75; c.ph++;
      let got = false;
      for (const p of S.pl) if (p.dead === 0 && Math.abs(c.x - p.x) < 12 && Math.abs(c.y - p.y) < 10) { collect(S, p, c.k, c.x, c.y); got = true; break; }
      if (got || c.y > H + 8) S.caps.splice(i, 1);
    }
  }
  function collect(S, p, k, x, y) {
    S.st.caps++; S.st.capm |= (1 << k); ev(S, 'cap', x, y, k);
    if (k === 0) p.spr = 900; else if (k === 1) p.rap = 900; else if (k === 2) p.prc = 700; else if (k === 3) p.sh = 1500;
    else if (k === 4) S.slow = 480; else if (k === 5) p.bb = Math.min(3, p.bb + 1); else if (k === 6) { repairShields(S); S.st.rep++; }
  }

  function stepPlayerBullets(S) {
    for (const b of S.pb) {
      if (b.dead) continue;
      const n = Math.ceil(Math.abs(b.vy) / 3), dx = b.vx / n, dy = b.vy / n;
      for (let s = 0; s < n && !b.dead; s++) {
        b.x += dx; b.y += dy;
        if (b.y < -4 || b.x < -4 || b.x > W + 4) { b.dead = true; break; }
        if (!b.pr) { const h = shAt(S, b.x, b.y); if (h) { h.s.g[h.k] = 0; h.s.n--; if (h.cy > 0 && h.s.g[h.k - SCW]) { h.s.g[h.k - SCW] = 0; h.s.n--; } b.dead = true; ev(S, 'shhit', b.x, b.y); break; } }
        // alien bullets
        for (let j = S.eb.length - 1; j >= 0; j--) {
          const e = S.eb[j];
          if (Math.abs(e.x - b.x) < e.w / 2 + 2 && Math.abs(e.y - b.y) < e.h / 2 + 3) {
            if (e.k === 3 && !b.pr) { e.hp--; if (e.hp > 0) { b.dead = true; ev(S, 'ping', e.x, e.y, 9); break; } }
            S.eb.splice(j, 1); ev(S, 'ecancel', e.x, e.y, e.k); if (!b.pr) { b.dead = true; break; }
          }
        }
        if (b.dead) break;
        // aliens
        let hitSomething = false;
        for (const a of S.al) {
          if (!a.alive || a.st === 2) continue;
          if (Math.abs(b.x - a.x) < AW / 2 + 1 && Math.abs(b.y - a.y) < AH / 2 + 2) {
            if (b.hit && b.hit.indexOf(a) >= 0) continue;
            S.st.hits++; hurtAlien(S, a, 1);
            if (b.pr) { (b.hit = b.hit || []).push(a); S.st.pierce++; } else { b.dead = true; hitSomething = true; break; }
          }
        }
        if (hitSomething) break;
        for (let j = S.mn.length - 1; j >= 0; j--) {
          const m = S.mn[j];
          if (Math.abs(b.x - m.x) < 6 && Math.abs(b.y - m.y) < 6) { S.st.hits++; S.mn.splice(j, 1); killMini(S, m); if (!b.pr) { b.dead = true; break; } }
        }
        if (b.dead) break;
        if (S.sau && Math.abs(b.x - S.sau.x) < 10 && Math.abs(b.y - S.sau.y) < 6) { S.st.hits++; killSaucer(S); if (!b.pr) { b.dead = true; break; } }
        const bo = S.boss;
        if (bo && !bo.dead && bo.y > 0 && Math.abs(b.x - bo.x) < bo.w / 2 && Math.abs(b.y - bo.y) < bo.h / 2) {
          if (!(b.hit && b.hit.indexOf(bo) >= 0)) { S.st.hits++; hurtBoss(S, 1); if (b.pr) (b.hit = b.hit || []).push(bo); else { b.dead = true; break; } }
        }
      }
    }
    for (let i = S.pb.length - 1; i >= 0; i--) if (S.pb[i].dead) S.pb.splice(i, 1);
  }

  function stepEnemyBullets(S) {
    for (let i = S.eb.length - 1; i >= 0; i--) {
      const e = S.eb[i]; e.ph += 0.2;
      let vx = e.vx, vy = e.vy;
      const n = Math.max(1, Math.ceil(Math.max(Math.abs(vx), Math.abs(vy)) / 2));
      let dead = false;
      for (let s = 0; s < n && !dead; s++) {
        e.x0 += vx / n; e.y += vy / n; e.x = e.k === 1 ? e.x0 + sin(e.ph) * 4 : e.x0;
        if (e.y > H + 8 || e.y < -20 || e.x < -10 || e.x > W + 10) { dead = true; break; }
        if (e.y > SHY - 4 && e.y < SHY + SCH * CELL + 6) {
          const fy = e.y + e.h / 2; let h = shAt(S, e.x, fy);
          if (!h && e.w >= 3) h = shAt(S, e.x - 1, fy) || shAt(S, e.x + 1, fy);
          if (h) { shErode(S, h, e.k === 3 ? 3 : e.k === 4 ? 1 : 2); dead = true; ev(S, 'shhit', e.x, fy, e.k); }
        }
      }
      if (!dead) for (const p of S.pl) {
        if (p.dead === 0 && Math.abs(e.x - p.x) < e.w / 2 + p.hw && Math.abs(e.y - p.y) < e.h / 2 + p.hh) { hurtPlayer(S, p, 'bullet'); dead = true; break; }
      }
      if (dead) S.eb.splice(i, 1);
    }
  }

  function bodyHits(S) {
    // aliens that reach the shields erase them; divers and tinies hit the base
    let lowest = 0;
    for (const a of S.al) if (a.alive && a.st !== 2) { if (a.y > lowest) lowest = a.y; }
    if (lowest > SHY - 8) for (const a of S.al) if (a.alive && a.st !== 2 && a.y > SHY - 8) shBox(S, a.x - 6, a.y - 4, a.x + 6, a.y + 4);
    for (const p of S.pl) {
      if (p.dead !== 0) continue;
      for (const a of S.al) if (a.alive && a.st === 1 && Math.abs(a.x - p.x) < 9 + p.hw - 4 && Math.abs(a.y - p.y) < 8) { if (hurtPlayer(S, p, 'dive')) { a.hp = 0; a.alive = false; S.ga--; ev(S, 'kill', a.x, a.y, a.t); } break; }
      for (let j = S.mn.length - 1; j >= 0; j--) { const m = S.mn[j]; if (Math.abs(m.x - p.x) < 5 + p.hw && Math.abs(m.y - p.y) < 8) { if (hurtPlayer(S, p, 'mini')) { S.mn.splice(j, 1); ev(S, 'kill', m.x, m.y, 7); } break; } }
    }
  }

  function checkClear(S) {
    const sp = S.spec; let done = false;
    if (sp.kind === 'boss') done = !!(S.boss && S.boss.dead);
    else if (sp.kind === 'bonus') done = (S.ga <= 0 && S.mn.length === 0) || S.bt <= 0;
    else done = S.ga <= 0 && S.mn.length === 0;
    if (!done) return;
    S.phase = 'clear'; S.pt = 0; S.eb.length = 0; S.bm = null; S.bq.length = 0; S.st.waves++;
    if (sp.kind === 'bonus') { for (const a of S.al) if (a.alive) { a.alive = false; } S.ga = 0; S.st.bonus++; }
    const perfect = !S.hitW, shr = shieldRatio(S);
    let bonus = 500 + 50 * S.wave; if (perfect) { bonus += 1000; S.st.perfect++; } bonus += Math.round(shr * 500);
    S.cb = { bonus, perfect, shr };
    S.score = Math.min(SCORE_CAP, S.score + bonus);
    ev(S, 'clear', 0, 0, bonus, perfect ? 1 : 0);
    if (S.mode === 'campaign') {
      const acc = S.st.shots ? S.st.hits / S.st.shots : 0;
      S.stars = 1 + (S.st.lost === 0 ? 1 : 0) + (S.st.lost === 0 && (S.sh.length ? shr >= 0.5 : acc >= 0.45) ? 1 : 0);
    }
  }
  function nextWave(S) {
    if (S.mode === 'campaign') { S.phase = 'done'; S.won = true; S.pt = 0; ev(S, 'win', 0, 0); return; }
    if (S.mode === 'daily' && S.wave >= DAILY.length) { S.phase = 'done'; S.won = true; S.pt = 0; ev(S, 'win', 0, 0); return; }
    startWave(S, S.wave + 1);
    ev(S, 'wave', 0, 0, S.wave);
  }

  // ---------------------------------------------------------------- sessions (solo / alternating / co-op)
  function newSession(o) {
    o = o || {}; const mp = o.mp === 'alt' ? 'alt' : o.mp === 'coop' ? 'coop' : 'solo';
    if (mp === 'alt') return { mp, cur: 0, g: [newGame(Object.assign({}, o, { alt: true, np: 1 })), newGame(Object.assign({}, o, { alt: true, np: 1, seed: (o.seed | 0) + 7919 }))] };
    return { mp, cur: 0, g: [newGame(Object.assign({}, o, { np: mp === 'coop' ? 2 : 1 }))] };
  }
  const over = S => S.phase === 'over' || S.phase === 'done';
  function sessionStep(se, m0, m1, x0, x1) {
    const S = se.g[se.cur]; step(S, m0, m1, x0, x1);
    if (S.hold) {
      const o = se.g[1 - se.cur];
      if (o && !over(o)) { se.cur = 1 - se.cur; if (o.hold) resume(o); ev(o, 'swap', 0, 0, se.cur); } else resume(S);
    }
    return se.g[se.cur];
  }
  const sessionOver = se => se.g.every(over);
  const sessionScore = se => se.g.map(g => g.score);

  // ---------------------------------------------------------------- daily + hash
  function dailyFor(dkey) {
    const r = mkRng((((dkey | 0) * 2654435761) ^ 0x5bd1e995) | 0); r(); r();
    const n = LV.MODS.length, a = Math.floor(r() * n); let b = Math.floor(r() * (n - 1)); if (b >= a) b++;
    return { dkey: dkey | 0, seed: Math.floor(r() * 2000000000) + 1, mods: [LV.MODS[a].id, LV.MODS[b].id], rot: Math.floor(r() * 30), waves: DAILY.length };
  }
  function hash(S) {
    let h = 2166136261 | 0; const mix = v => { h = Math.imul(h ^ (Math.floor(v * 16) | 0), 16777619); };
    mix(S.frame); mix(S.score); mix(S.rs); mix(S.lives); mix(S.ga); mix(S.fx); mix(S.fy); mix(S.wave);
    for (const a of S.al) { mix(a.alive ? 1 : 0); mix(a.hp); mix(a.x); mix(a.y); }
    for (const b of S.pb) { mix(b.x); mix(b.y); } for (const e of S.eb) { mix(e.x); mix(e.y); }
    for (const p of S.pl) { mix(p.x); mix(p.dead); }
    for (const s of S.sh) mix(s.n);
    return h >>> 0;
  }

  const API = { W, H, SPX, SPY, AW, AH, INV, PY, SHY, SCW, SCH, CELL, SHT, SHN, IN, SCORE_CAP, INTRO, CLEAR, BSZ, DAILY, EXT, sin, cos, rnd, mkRng, interval, newGame, step, resume, newSession, sessionStep, sessionOver, sessionScore, dailyFor, hash,
    shieldRatio, repairShields, hurtPlayer, hurtBoss, shAt, startWave, bottoms, maxB, place, hurtAlien, collect, dropCap, eshot };
  root.InvadeEngine = API;
  if (typeof module === 'object' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
