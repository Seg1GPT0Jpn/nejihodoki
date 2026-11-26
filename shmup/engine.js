// ペーパーウイング (Paper Wing) - the pure engine. Runs in node and in the browser. Fixed 60 Hz step, seeded RNG, input = bit mask per frame.
// A run is fully determined by (opts, input log): that is what replays, the daily challenge and the tests rely on.
// Only + - * / sqrt floor imul are used for the simulation (own sin/cos), so a replay reproduces on any device.
//
//   ShmupEngine.newGame(opts) -> S      opts: { mode:'arcade'|'practice'|'rush'|'daily', diff:0..3, ship:0..2, seed, stage, assist, mods:[names], dkey }
//   ShmupEngine.step(S, input)          input: bit mask IN.*   (S.ev collects events for sound/particles; the caller clears it)
//   ShmupEngine.hash(S)                 a number summarising the whole state
//   ShmupEngine.replay.* / dailyFor(dateKey) / PAT (bullet pattern generators)
// Field: 480 x 270, origin top-left, the player faces right, enemies come from the right.
(function (root) {
  'use strict';
  const D = root.ShmupData || (typeof require === 'function' ? require('./stages.js') : null);
  const { W, H, DIFF, MODS, EN, BOSS, STAGES } = D;
  const IN = { L: 1, R: 2, U: 4, D: 8, SHOOT: 16, BOMB: 32, FOCUS: 64, CONT: 128 };
  const SCORE_CAP = 99999999;
  const TAU = 6.283185307179586, PI = 3.141592653589793;
  const MAXB = 1100, MAXE = 64, MAXS = 200, MAXI = 40, MAXL = 12;
  const EXT = [200000, 600000, 1500000, 3000000, 5000000, 8000000];
  const DROPSEQ = [0, 2, 0, 3, 1, 0, 4, 2, 0, 3, 1, 4];

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
  const mk = (n, f) => { const a = []; for (let i = 0; i < n; i++) a.push(f()); return a; };
  const dist2 = (ax, ay, bx, by) => (ax - bx) * (ax - bx) + (ay - by) * (ay - by);

  // ---------------------------------------------------------------- setup
  function newGame(o) {
    o = o || {};
    const mode = ['arcade', 'practice', 'rush', 'daily'].indexOf(o.mode) >= 0 ? o.mode : 'arcade';
    const di = Math.max(0, Math.min(3, o.diff == null ? 1 : o.diff | 0)), diff = DIFF[di];
    const mods = {}; const modNames = (o.mods || []).filter(n => MODS[n]);
    for (const n of modNames) { const m = MODS[n]; for (const k of Object.keys(m)) if (k !== 'ja' && k !== 'en') mods[k] = k === 'sm' || k === 'bsp' || k === 'dens' || k === 'ehp' || k === 'thin' || k === 'hit' ? (mods[k] || 1) * m[k] : m[k]; }
    let list = [0, 1, 2, 3, 4, 5, 6];
    if (mode === 'practice') list = [Math.max(0, Math.min(6, o.stage | 0))];
    else if (mode === 'daily') list = (o.list && o.list.length ? o.list : [0, 2, 4]).map(x => Math.max(0, Math.min(6, x | 0)));
    const ship = Math.max(0, Math.min(2, o.ship | 0));
    const S = {
      v: 1, frame: 0, rs: (o.seed | 0) || 1, mode, di, ship, assist: o.assist | 0, mods, modNames, dkey: o.dkey | 0, seed: (o.seed | 0) || 1,
      list, li: 0, stage: list[0], sf: 0, script: null, si: 0, boss: null, phase: 'play', ct: 0,
      bsp: diff.bsp * (mods.bsp || 1), dens: diff.dens * (mods.dens || 1), ehp: diff.ehp * (mods.ehp || 1), sm: diff.sc * (mods.sm || 1),
      score: 0, lives: mods.lives || diff.lives, bombs: diff.bombs + (mods.lives ? (mods.bombs || 0) - diff.bombs : 0), shield: mods.shield || 0,
      power: mods.power || 0, spd: mods.speed || 0, opt: mods.opt || 0,
      chain: 0, chainT: 0, ex: 0, dq: 0, conts: 0, maxConts: mods.lives ? 0 : diff.cont, cleared: false, over: false,
      pin: 0, gz: 0, smiss: 0, hitr: 2.2 * (mods.hit || 1),
      st: { kills: 0, graze: 0, bombs: 0, deaths: 0, maxChain: 0, conts: 0, stages: 0, bosses: 0, nomiss: 0, items: 0, maxScoreMult: 0 },
      p: { x: 60, y: 135, inv: 120, dying: 0, fcd: 0, mcd: 0, charge: 0, wasShoot: 0, ang: 0, hx: new Float64Array(64), hy: new Float64Array(64), hi: 0 },
      bomb: { t: 0, x: 0, y: 0 },
      bul: mk(MAXB, () => ({ a: 0, x: 0, y: 0, vx: 0, vy: 0, r: 3, k: 0, c: 0, g: 0, tr: 0, sp: 0, life: 0 })),
      ene: mk(MAXE, () => ({ a: 0 })),
      sht: mk(MAXS, () => ({ a: 0, x: 0, y: 0, vx: 0, vy: 0, dmg: 1, r: 3, pi: 0, life: 0, k: 0, hm: 0, h0: 0, h1: 0 })),
      itm: mk(MAXI, () => ({ a: 0, x: 0, y: 0, k: 0, t: 0 })),
      las: mk(MAXL, () => ({ a: 0, x: 0, y: 0, dx: -1, dy: 0, tele: 0, dur: 0, w: 6, t: 0, sw: 0, o: null })),
      bc: 0, ev: [], in: 0,
    };
    if (mode === 'practice') { S.power = Math.max(S.power, 2); S.spd = Math.max(S.spd, 1); S.opt = Math.max(S.opt, 1); }
    if (mode === 'rush') { S.power = 3; S.spd = 2; S.opt = 2; S.shield = Math.max(S.shield, 1); }
    startStage(S);
    return S;
  }

  function ev(S, t, x, y, s) { if (S.ev.length < 400) S.ev.push({ t, x, y, s }); }
  function sfx(S, n) { if (S.ev.length < 400) S.ev.push({ t: 'sfx', s: n }); }

  function startStage(S) {
    S.stage = S.list[S.li]; S.sf = 0; S.si = 0; S.boss = null; S.phase = 'play'; S.ct = 0; S.smiss = 0;
    for (const b of S.bul) b.a = 0; for (const e of S.ene) e.a = 0; for (const s of S.sht) s.a = 0; for (const l of S.las) l.a = 0; for (const i of S.itm) i.a = 0;
    S.bomb.t = 0;
    const rng = mkRng((S.seed ^ Math.imul(S.stage + 1, 0x9E3779B1)) | 0);
    S.script = D.buildScript(S.stage, rng, S.mods.thin || 1, S.mode === 'rush');
    S.p.x = 60; S.p.y = 135; S.p.inv = Math.max(S.p.inv, 90); S.p.dying = 0;
    ev(S, 'stage', 0, 0, S.stage);
  }

  // ---------------------------------------------------------------- pools
  function addBullet(S, x, y, vx, vy, k, c, o) {
    const a = S.bul;
    for (let n = 0; n < MAXB; n++) {
      const i = (S.bc + n) % MAXB, b = a[i];
      if (b.a) continue;
      S.bc = (i + 1) % MAXB;
      b.a = 1; b.x = x; b.y = y; b.vx = vx; b.vy = vy; b.k = k; b.c = c; b.g = 0; b.r = k === 1 ? 5 : k === 2 ? 2.6 : k === 3 ? 4 : 3;
      b.tr = o && o.tr || 0; b.sp = o && o.sp || 0; b.life = o && o.life || 0;
      return b;
    }
    return null;
  }
  function addShot(S, x, y, vx, vy, dmg, r, pi, life, k, hm) {
    for (const s of S.sht) if (!s.a) { s.a = 1; s.x = x; s.y = y; s.vx = vx; s.vy = vy; s.dmg = dmg; s.r = r; s.pi = pi; s.life = life; s.k = k; s.hm = hm; s.h0 = 0; s.h1 = 0; return s; }
    return null;
  }
  function addItem(S, x, y, k) { for (const it of S.itm) if (!it.a) { it.a = 1; it.x = x; it.y = y; it.k = k; it.t = 0; return it; } return null; }
  function addLaser(S, e, ux, uy, tele, dur, w, sw) {
    for (const l of S.las) if (!l.a) { l.a = 1; l.o = e; l.x = e.x; l.y = e.y; l.dx = ux; l.dy = uy; l.tele = tele; l.dur = dur; l.w = w; l.t = 0; l.sw = sw || 0; return l; }
    return null;
  }

  // ---------------------------------------------------------------- bullet pattern generators (PAT). (S, enemy, spec)
  const dn = (S, n) => Math.max(1, Math.round(n * S.dens));
  function aimVec(S, e) {
    let dx = S.p.x - e.x, dy = S.p.y - e.y; const l = Math.sqrt(dx * dx + dy * dy);
    if (l < 1) return [-1, 0];
    return [dx / l, dy / l];
  }
  const PAT = {
    aimed(S, e, s) {
      const u = aimVec(S, e), n = dn(S, s.n || 1), sp = s.sp * S.bsp, sd = s.sprd || 0.2;
      for (let i = 0; i < n; i++) {
        const off = (i - (n - 1) / 2) * sd, c = cos(off), sn = sin(off);
        addBullet(S, e.x, e.y, (u[0] * c - u[1] * sn) * sp, (u[0] * sn + u[1] * c) * sp, s.k || 0, s.c || 0);
      }
    },
    ring(S, e, s) {
      const n = dn(S, s.n || 8), sp = s.sp * S.bsp, base = (s.off || 0) + (e.ra || 0);
      for (let i = 0; i < n; i++) { const a = base + i * TAU / n; addBullet(S, e.x, e.y, cos(a) * sp, sin(a) * sp, s.k || 0, s.c || 1); }
      e.ra = (e.ra || 0) + (s.rot || 0);
    },
    spiral(S, e, s) {
      const arms = dn(S, s.arms || 2), sp = s.sp * S.bsp;
      for (let i = 0; i < arms; i++) { const a = (e.sa || 0) + i * TAU / arms; addBullet(S, e.x, e.y, cos(a) * sp, sin(a) * sp, s.k || 0, s.c || 2); }
      e.sa = (e.sa || 0) + (s.step || 0.15);
    },
    curtain(S, e, s) {
      const gap = s.gap || 20, cnt = Math.floor(H / gap) + 1, sp = s.sp * S.bsp;
      const hole = Math.max(1, (s.hole || 3) + Math.round((1 - S.dens) * 3));
      const hc = Math.round((S.p.y + (rnd(S) - 0.5) * 24) / gap);
      for (let i = 0; i < cnt; i++) { if (Math.abs(i - hc) <= hole - 1) continue; addBullet(S, e.x - 8, i * gap + gap / 2 - 4, -sp, 0, 0, 3); }
    },
    homing(S, e, s) {
      const n = dn(S, s.n || 2), sp = s.sp * S.bsp;
      for (let i = 0; i < n; i++) {
        const a = PI + (i - (n - 1) / 2) * 0.7 + (rnd(S) - 0.5) * 0.3;
        addBullet(S, e.x, e.y, cos(a) * sp, sin(a) * sp, 3, 0, { tr: s.turn || 0.03, sp, life: s.life || 200 });
      }
    },
    laser(S, e, s) {
      let u = aimVec(S, e);
      if (u[0] > -0.25) u = [-1, 0];
      const tele = (s.tele || 45) + Math.round((1 - Math.min(1, S.dens)) * 25);
      addLaser(S, e, u[0], u[1], tele, s.dur || 35, (s.w || 7) * (0.7 + 0.3 * Math.min(1, S.dens)), s.sweep || 0);
      sfx(S, 'laser');
    },
    rain(S, e, s) {
      const n = dn(S, s.n || 1), sp = s.sp * S.bsp;
      for (let i = 0; i < n; i++) {
        const x = e.boss ? 150 + rnd(S) * 320 : e.x + (rnd(S) - 0.5) * 16;
        addBullet(S, x, -4, -0.3 - rnd(S) * 0.5, sp, e.boss ? 2 : 0, e.boss ? 1 : 3);
      }
    },
  };

  // ---------------------------------------------------------------- enemies
  function spawnEnemy(S, type, y, o) {
    const d = EN[type]; if (!d) return null;
    for (const e of S.ene) if (!e.a) {
      o = o || {};
      e.a = 1; e.type = type; e.d = d; e.boss = 0; e.x = W + 20 + (o.dx || 0); e.y = y; e.y0 = y; e.t = 0; e.hv = 0; e.fl = 0; e.inv = 0; e.ra = 0; e.sa = 0;
      e.r = d.r; e.ph = o.ph || 0; e.dy = o.dy || (y < H / 2 ? 1 : -1); e.tx = o.tx || 330; e.vy = d.mv.vy || 0; e.cx = e.x; e.fx = 0;
      e.hp = Math.max(1, Math.round(d.hp * S.ehp)); e.maxhp = e.hp; e.bp = 0; e.pt = 0; e.kvx = 0; e.kvy = 0; e.drop = d.drop ? 1 : 0; e.mid = d.mid ? 1 : 0;
      if (d.mv.k === 'fall') { e.x = o.fx || 300; e.y = -14; }
      if (d.mv.k === 'loop') { e.y0 = Math.max(d.mv.R + 14, Math.min(H - d.mv.R - 14, y)); }
      if (d.mv.k === 'bounce') e.vy = (y < H / 2 ? 1 : -1) * d.mv.vy;
      return e;
    }
    return null;
  }
  function spawnBoss(S) {
    const bi = STAGES[S.stage].boss, d = BOSS[bi];
    for (const e of S.ene) if (!e.a) {
      e.a = 1; e.type = 'boss'; e.d = null; e.boss = 1; e.bi = bi; e.x = W + 50; e.y = H / 2; e.y0 = H / 2; e.t = 0; e.fl = 0; e.inv = 1; e.ra = 0; e.sa = 0; e.r = d.r;
      e.bp = 0; e.pt = 0; e.mt = 0; e.en = 0; e.ti = 0; e.hp = Math.round(d.hp[0] * S.ehp); e.maxhp = e.hp; e.drop = 0; e.mid = 0; e.fx = 0; e.hv = 0;
      S.boss = e; ev(S, 'boss', 0, 0, bi); sfx(S, 'boss');
      return;
    }
  }
  function moveEnemy(S, e) {
    const mv = e.d.mv, t = e.t;
    switch (mv.k) {
      case 'line': e.x += mv.vx; break;
      case 'sine': e.x += mv.vx; e.y = e.y0 + mv.amp * sin(t * mv.fq + e.ph); break;
      case 'dive': e.x += mv.vx; e.y += e.dy * mv.vy; break;
      case 'stat': e.x += mv.vx; break;
      case 'loop': e.cx += mv.vx; e.x = e.cx + mv.R * cos(t * mv.w); e.y = e.y0 + mv.R * sin(t * mv.w); break;
      case 'bounce': e.x += mv.vx; e.y += e.vy; if (e.y < 14) { e.y = 14; e.vy = Math.abs(e.vy); } else if (e.y > H - 14) { e.y = H - 14; e.vy = -Math.abs(e.vy); } break;
      case 'hover':
        if (e.x > e.tx && e.hv === 0) e.x += mv.vx;
        else { e.hv++; if (e.hv < mv.hold) e.y = e.y0 + 10 * sin(e.hv * 0.05); else e.x += mv.lv; }
        break;
      case 'fall': if (t >= 40) e.y += 4.6; e.inv = t < 40 ? 1 : 0; break;
      case 'kami':
        if (t < 40) e.x -= 1.2;
        else { if (t === 40) { const u = aimVec(S, e); e.kvx = u[0] * 4; e.kvy = u[1] * 4; } e.x += e.kvx; e.y += e.kvy; }
        break;
    }
  }
  function moveBoss(S, e) {
    const mv = BOSS[e.bi].ph[e.bp].mv;
    if (!e.en) { e.x -= 1.6; e.y += (H / 2 - e.y) * 0.05; if (e.x <= mv.tx + 3) { e.en = 1; e.inv = 0; } return; }
    e.mt++;
    e.x += (mv.tx - e.x) * 0.05;
    e.y += (H / 2 + mv.A * sin(e.mt * mv.w) - e.y) * 0.1;
  }
  function fireSpecs(S, e, specs, t) {
    for (const s of specs) {
      if (t < s.at) continue;
      if (s.ev ? (t - s.at) % s.ev !== 0 : t !== s.at) continue;
      if (s.cyc && (t % s.cyc[0]) >= s.cyc[1]) continue;
      PAT[s.p](S, e, s);
      if (s.die) { e.a = 0; ev(S, 'boom', e.x, e.y, e.r); return; }
    }
  }
  function killEnemy(S, e, byBomb) {
    const d = e.d; e.a = 0;
    S.st.kills++; S.chain++; if (S.chain > S.st.maxChain) S.st.maxChain = S.chain;
    S.chainT = 150;
    const mp = 100 + Math.min(S.chain, 100) * 4;
    addScore(S, Math.floor(d.sc * mp / 100));
    ev(S, 'boom', e.x, e.y, d.r); sfx(S, d.r >= 12 ? 'boom2' : 'boom');
    if (e.drop) { const k = nextDrop(S); addItem(S, e.x, e.y, k); }
    if (d.death) PAT[d.death.p](S, e, d.death);
    else if (DIFF[S.di].ret && !byBomb && e.x < W - 10 && d.r < 15) PAT.aimed(S, e, { n: 1, sp: 1.6, c: 1 });
  }
  function nextDrop(S) {
    for (let n = 0; n < DROPSEQ.length; n++) {
      const k = DROPSEQ[(S.dq + n) % DROPSEQ.length];
      if ((k === 0 && S.power >= 4) || (k === 1 && S.spd >= 3) || (k === 2 && S.opt >= 3) || (k === 3 && S.shield >= 2)) continue;
      S.dq = (S.dq + n + 1) % DROPSEQ.length; return k;
    }
    S.dq = (S.dq + 1) % DROPSEQ.length; return 4;
  }
  function addScore(S, pts) {
    pts = Math.floor(pts * S.sm);
    if (pts <= 0) return;
    S.score = Math.min(SCORE_CAP, S.score + pts);
    while (S.ex < EXT.length && S.score >= EXT[S.ex]) { S.ex++; if (S.lives < 8) { S.lives++; ev(S, 'extend', 0, 0, 0); sfx(S, 'extend'); } }
  }
  function cancelBullets(S, per, evmax) {
    let n = 0;
    for (const b of S.bul) if (b.a) { b.a = 0; n++; if (n <= (evmax == null ? 20 : evmax)) ev(S, 'spark', b.x, b.y, 0); }
    for (const l of S.las) l.a = 0;
    if (n && per) addScore(S, Math.min(n, 300) * per);
    return n;
  }
  function hurtEnemy(S, e, d, byBomb) {
    if (e.inv || e.x > W + 4) return false;
    e.hp -= d; e.fl = 3;
    if (e.hp <= 0) {
      if (e.boss) bossDown(S, e); else killEnemy(S, e, byBomb);
    }
    return true;
  }
  function bossDown(S, e) {
    const d = BOSS[e.bi];
    cancelBullets(S, 30);
    if (e.bp < d.ph.length - 1) {
      e.bp++; e.pt = 0; e.hp = Math.round(d.hp[e.bp] * S.ehp); e.maxhp = e.hp; e.inv = 1; e.ti = 70; e.ra = 0; e.sa = 0;
      ev(S, 'phase', e.x, e.y, e.bp); sfx(S, 'phase');
      return;
    }
    e.a = 0; S.boss = null; S.st.bosses |= 1 << e.bi;
    S.chain++; if (S.chain > S.st.maxChain) S.st.maxChain = S.chain;
    addScore(S, d.sc * (100 + Math.min(S.chain, 100) * 4) / 100);
    for (const o of S.ene) if (o.a && !o.boss) { o.a = 0; ev(S, 'boom', o.x, o.y, o.r); }
    ev(S, 'bossdie', e.x, e.y, d.r); sfx(S, 'bossdie');
    S.phase = 'clear'; S.ct = 0;
  }

  // ---------------------------------------------------------------- player
  function optPos(S, i, out) {
    const p = S.p;
    if (S.ship === 2) {
      const n = S.opt, a = p.ang + i * TAU / n, rr = (S.in & IN.FOCUS) ? 15 : 24;
      out[0] = p.x + cos(a) * rr; out[1] = p.y + sin(a) * rr; return;
    }
    if ((S.in & IN.FOCUS) && !S.mods.nofocus) {
      const off = [[-10, -13], [-10, 13], [-19, 0]][i]; out[0] = p.x + off[0]; out[1] = p.y + off[1]; return;
    }
    const lag = 7 * (i + 1), k = (p.hi - lag + 64 * 4) & 63;
    out[0] = p.hx[k] - 4; out[1] = p.hy[k] + (i === 1 ? 6 : i === 2 ? -6 : 0);
  }
  const OP = [0, 0];
  function playerFire(S, shoot) {
    const p = S.p, sh = S.ship, foc = (S.in & IN.FOCUS) && !S.mods.nofocus, L = S.power;
    if (p.fcd > 0) p.fcd--;
    if (p.mcd > 0) p.mcd--;
    if (sh === 1) {
      if (shoot) p.charge = Math.min(60, p.charge + 1);
      else {
        if (p.wasShoot && p.charge >= 30) {
          const full = p.charge >= 60;
          addShot(S, p.x + 10, p.y, 7, 0, full ? 80 : 36, full ? 22 : 14, 99, 70, 4, 0); sfx(S, 'charge');
        }
        p.charge = 0;
      }
    }
    p.wasShoot = shoot ? 1 : 0;
    if (!shoot) return;
    if (p.fcd <= 0) {
      if (sh === 0) {
        p.fcd = 5; sfx(S, 'shot');
        const A = [[[0, 0]], [[0, -4], [0, 4]], [[0, 0], [-0.1, -2], [0.1, 2]], [[0, -4], [0, 4], [-0.18, -6], [0.18, 6]], [[0, 0], [-0.1, -3], [0.1, 3], [-0.22, -6], [0.22, 6]]][L];
        for (const a of A) { const an = a[0] * (foc ? 0.3 : 1); addShot(S, p.x + 10, p.y + a[1] * (foc ? 0.5 : 1), cos(an) * 9, sin(an) * 9, 3, 3, 0, 60, 0, 0); }
      } else if (sh === 1) {
        p.fcd = 4; sfx(S, 'shot');
        const A = [[0], [-4, 4], [-6, 0, 6], [-8, -3, 3, 8], [-10, -4, 4, 10]][L], pi = L >= 4 ? 2 : L >= 3 ? 1 : 0;
        for (const y of A) addShot(S, p.x + 10, p.y + y * (foc ? 0.5 : 1), 12, 0, 2.4, 2.5, pi, 40, 1, 0);
      } else {
        p.fcd = 6; sfx(S, 'shot');
        const n = 3 + L, spread = foc ? 0.09 : 0.34;
        for (let i = 0; i < n; i++) { const an = n === 1 ? 0 : (i / (n - 1) * 2 - 1) * spread; addShot(S, p.x + 8, p.y, cos(an) * 7.5, sin(an) * 7.5, 3.2, 3.5, 0, 34, 3, 0); }
      }
    }
    // options
    for (let i = 0; i < S.opt; i++) {
      optPos(S, i, OP);
      if (sh === 0) { if (p.mcd <= 0 && i === 0) { /* missiles: one per option, staggered */ } if (((S.frame + i * 7) % 22) === 0) addShot(S, OP[0], OP[1], 5, (i - 1) * 0.8, 4, 3.5, 0, 90, 2, 1); }
      else if (sh === 1) { if (((S.frame + i * 3) % 8) === 0) addShot(S, OP[0] + 6, OP[1], 12, 0, 1.6, 2.2, 0, 40, 1, 0); }
      else if (((S.frame + i * 3) % 10) === 0) addShot(S, OP[0] + 4, OP[1], 9, 0, 2, 3, 0, 50, 0, 0);
    }
  }
  function startBomb(S) {
    const p = S.p;
    S.bombs--; S.st.bombs++; S.bomb.t = 1; S.bomb.x = p.x; S.bomb.y = p.y; p.inv = Math.max(p.inv, 120); p.dying = 0;
    ev(S, 'bomb', p.x, p.y, S.ship); sfx(S, 'bomb');
  }
  function stepBomb(S) {
    const b = S.bomb; if (!b.t) return;
    const p = S.p, t = b.t;
    let cx = b.x, cy = b.y, hit = null, dmg = 4;
    if (S.ship === 0) { const R = t * 7; hit = (x, y, r) => dist2(x, y, cx, cy) < (R + r) * (R + r); if (t > 70) { b.t = 0; return; } dmg = 4; }
    else if (S.ship === 1) { const hh = Math.min(80, 20 + t * 2); cx = p.x; cy = p.y; hit = (x, y, r) => x > cx - 10 && Math.abs(y - cy) < hh + r; if (t > 80) { b.t = 0; return; } dmg = 5; }
    else { cx = p.x; cy = p.y; const R = 70; hit = (x, y, r) => dist2(x, y, cx, cy) < (R + r) * (R + r); if (t > 110) { b.t = 0; return; } dmg = 3; }
    p.inv = Math.max(p.inv, 2);
    for (const bu of S.bul) if (bu.a && hit(bu.x, bu.y, bu.r)) { bu.a = 0; addScore(S, 10); if ((t & 1) === 0) ev(S, 'spark', bu.x, bu.y, 0); }
    for (const l of S.las) if (l.a && l.t >= l.tele && hit(p.x + 40, p.y, 0)) { /* lasers pause while the bomb is out */ }
    for (const e of S.ene) if (e.a && hit(e.x, e.y, e.r)) hurtEnemy(S, e, e.boss ? dmg * 0.35 : dmg, true);
    b.t++;
  }
  function playerHit(S) {
    const p = S.p;
    if (p.inv > 0 || p.dying > 0) return;
    if (S.assist & 2 && S.bombs > 0 && !S.bomb.t) { startBomb(S); return; }
    if (S.shield > 0) { S.shield--; p.inv = 100; ev(S, 'shield', p.x, p.y, 0); sfx(S, 'shield'); for (const b of S.bul) if (b.a && dist2(b.x, b.y, p.x, p.y) < 3600) b.a = 0; return; }
    p.dying = 9; ev(S, 'hit', p.x, p.y, 0); sfx(S, 'hit');
  }
  function playerDie(S) {
    const p = S.p;
    S.lives--; S.st.deaths++; S.smiss++; S.chain = 0; S.chainT = 0;
    ev(S, 'die', p.x, p.y, 0); sfx(S, 'die');
    S.power = Math.max(0, S.power - 1); S.opt = Math.max(0, S.opt - 1);
    S.bombs = Math.max(S.bombs, DIFF[S.di].bombs);
    cancelBullets(S, 0, 10);
    if (S.lives <= 0) { S.lives = 0; S.phase = 'over'; S.over = true; ev(S, 'over', 0, 0, 0); sfx(S, 'over'); return; }
    p.x = 60; p.y = 135; p.inv = 170; p.dying = 0; p.charge = 0;
  }

  // ---------------------------------------------------------------- the frame
  function step(S, input) {
    input |= 0; S.in = input;
    if (S.phase === 'done') return S;
    S.frame++;
    if (S.phase === 'over') {
      if ((input & IN.CONT) && S.conts < S.maxConts) {
        S.conts++; S.st.conts++; S.over = false; S.phase = 'play'; S.lives = DIFF[S.di].lives; S.bombs = DIFF[S.di].bombs; S.score = Math.floor(S.score / 2);
        S.p.x = 60; S.p.y = 135; S.p.inv = 200; S.p.dying = 0; S.power = Math.max(S.power, 1); cancelBullets(S, 0, 0);
        ev(S, 'continue', 0, 0, S.conts);
      }
      return S;
    }
    const p = S.p;
    // ---- player move
    if (S.phase !== 'clear' || S.ct < 100) {
      const foc = (input & IN.FOCUS) && !S.mods.nofocus;
      let dx = ((input & IN.R) ? 1 : 0) - ((input & IN.L) ? 1 : 0), dy = ((input & IN.D) ? 1 : 0) - ((input & IN.U) ? 1 : 0);
      if (dx && dy) { dx *= 0.7071; dy *= 0.7071; }
      const sp = (2.3 + 0.38 * S.spd) * (foc ? 0.45 : 1);
      p.x = Math.max(10, Math.min(W - 10, p.x + dx * sp)); p.y = Math.max(10, Math.min(H - 10, p.y + dy * sp));
    } else { p.x += 3; }
    p.hi = (p.hi + 1) & 63; p.hx[p.hi] = p.x; p.hy[p.hi] = p.y;
    p.ang += (input & IN.FOCUS) ? 0.045 : 0.075;
    if (p.inv > 0) p.inv--;
    // ---- bomb / death bomb
    const bombEdge = (input & IN.BOMB) && !(S.pin & IN.BOMB);
    if (bombEdge && S.bombs > 0 && !S.bomb.t && S.phase !== 'clear') startBomb(S);
    if (p.dying > 0) { p.dying--; if (p.dying === 0) playerDie(S); if (S.phase === 'over') { S.pin = input; return S; } }
    // ---- shoot
    if (S.phase !== 'clear') playerFire(S, !!(input & IN.SHOOT));
    S.pin = input;
    stepBomb(S);
    // ---- stage script
    if (S.phase === 'play') {
      S.sf++;
      const sc = S.script;
      while (S.si < sc.length && sc[S.si].t <= S.sf) { const s = sc[S.si++]; spawnEnemy(S, s.type, s.y, s.o); }
      if (!S.boss && S.si >= sc.length) {
        const bossT = S.mode === 'rush' ? 50 : STAGES[S.stage].len;
        if (S.sf >= bossT) {
          let busy = 0; for (const e of S.ene) if (e.a && e.x > 0) busy++;
          if (S.mode === 'rush' || busy === 0 || S.sf >= bossT + 600) spawnBoss(S);
        }
      }
    }
    // ---- enemies
    let nearHit = false;
    for (let i = 0; i < MAXE; i++) {
      const e = S.ene[i]; if (!e.a) continue;
      if (e.fl > 0) e.fl--;
      if (e.boss) {
        moveBoss(S, e);
        if (e.en) { if (e.ti > 0) { e.ti--; if (e.ti === 0) e.inv = 0; } else { e.pt++; fireSpecs(S, e, BOSS[e.bi].ph[e.bp].atk, e.pt); } }
      } else {
        e.t++;
        moveEnemy(S, e);
        if (e.d.fire && e.x < W - 6 && e.x > 4) fireSpecs(S, e, e.d.fire, e.t);
        if (!e.a) continue;
        if (e.hp <= 0 && e.a) { killEnemy(S, e, false); continue; }
        if (e.x < -40 || e.y > H + 30 || e.y < -40) { e.a = 0; continue; }
      }
      if (e.a && p.dying === 0 && p.inv === 0 && e.inv === 0 && dist2(e.x, e.y, p.x, p.y) < (e.r * 0.75 + S.hitr) * (e.r * 0.75 + S.hitr) && e.x < W) nearHit = true;
    }
    if (nearHit) playerHit(S);
    // ---- player shots
    for (let i = 0; i < MAXS; i++) {
      const s = S.sht[i]; if (!s.a) continue;
      if (s.hm) {
        let best = null, bd = 1e9;
        for (const e of S.ene) if (e.a && e.x > s.x - 20 && e.x < W) { const d = dist2(e.x, e.y, s.x, s.y); if (d < bd) { bd = d; best = e; } }
        if (best) {
          const dx = best.x - s.x, dy = best.y - s.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
          s.vx += dx / l * 0.7; s.vy += dy / l * 0.7;
          const vl = Math.sqrt(s.vx * s.vx + s.vy * s.vy) || 1; s.vx = s.vx / vl * 5.5; s.vy = s.vy / vl * 5.5;
        }
      }
      s.x += s.vx; s.y += s.vy; s.life--;
      if (s.life <= 0 || s.x > W + 20 || s.x < -20 || s.y < -20 || s.y > H + 20) { s.a = 0; continue; }
      for (let j = 0; j < MAXE; j++) {
        const e = S.ene[j]; if (!e.a) continue;
        const rr = e.r + s.r;
        if (dist2(e.x, e.y, s.x, s.y) < rr * rr) {
          if (e.x > W + 4) continue;
          if (e.inv) { if (s.pi < 50) s.a = 0; break; }
          const bit = 1 << (j & 31), w = j < 32 ? 'h0' : 'h1';
          if (s[w] & bit) continue;
          s[w] |= bit;
          hurtEnemy(S, e, s.dmg, false);
          if (s.pi >= 50) continue;
          if (s.pi > 0) s.pi--; else { s.a = 0; break; }
        }
      }
    }
    // ---- enemy bullets
    const px = p.x, py = p.y, hr = S.hitr;
    let hit = false;
    for (let i = 0; i < MAXB; i++) {
      const b = S.bul[i]; if (!b.a) continue;
      if (b.tr) {
        if (b.life > 0) {
          b.life--;
          const dx = px - b.x, dy = py - b.y, l = Math.sqrt(dx * dx + dy * dy) || 1;
          b.vx += (dx / l * b.sp - b.vx) * b.tr; b.vy += (dy / l * b.sp - b.vy) * b.tr;
          const vl = Math.sqrt(b.vx * b.vx + b.vy * b.vy) || 1; b.vx = b.vx / vl * b.sp; b.vy = b.vy / vl * b.sp;
        }
      }
      b.x += b.vx; b.y += b.vy;
      if (b.x < -24 || b.x > W + 24 || b.y < -24 || b.y > H + 24) { b.a = 0; continue; }
      const dx = b.x - px, dy = b.y - py, d2 = dx * dx + dy * dy, rr = b.r + hr;
      if (d2 < rr * rr) { hit = true; b.a = 0; }
      else if (!b.g) { const gr = b.r + 11; if (d2 < gr * gr) { b.g = 1; S.st.graze++; S.gz++; addScore(S, 30); S.chainT = Math.min(150, S.chainT + 6); if ((S.gz & 3) === 0) sfx(S, 'graze'); } }
    }
    if (hit) playerHit(S);
    // ---- lasers
    for (const l of S.las) {
      if (!l.a) continue;
      if (!l.o || !l.o.a) { l.a = 0; continue; }
      l.x = l.o.x; l.y = l.o.y; l.t++;
      if (l.sw) { const c = cos(l.sw), sn = sin(l.sw), nx = l.dx * c - l.dy * sn, ny = l.dx * sn + l.dy * c; l.dx = nx; l.dy = ny; }
      if (l.t >= l.tele + l.dur) { l.a = 0; continue; }
      if (l.t >= l.tele && p.dying === 0 && p.inv === 0) {
        const rx = px - l.x, ry = py - l.y, along = rx * l.dx + ry * l.dy;
        if (along > 0 && Math.abs(rx * l.dy - ry * l.dx) < l.w / 2 + hr) playerHit(S);
      }
    }
    // ---- items
    for (const it of S.itm) {
      if (!it.a) continue;
      it.t++; it.x -= 0.7; it.y += 0.25 * sin(it.t * 0.08);
      const mag = (S.assist & 4) ? 80 : 0;
      if (mag) { const dx = px - it.x, dy = py - it.y, l = Math.sqrt(dx * dx + dy * dy); if (l < mag && l > 1) { it.x += dx / l * 3.2; it.y += dy / l * 3.2; } }
      if (it.x < -12) { it.a = 0; continue; }
      if (dist2(it.x, it.y, px, py) < 15 * 15) { it.a = 0; pick(S, it.k); }
    }
    // ---- chain
    if (S.chainT > 0) { S.chainT--; if (S.chainT === 0) { if (S.chain >= 10) ev(S, 'chainbreak', 0, 0, S.chain); S.chain = 0; } }
    // ---- clear / next stage
    if (S.phase === 'clear') {
      S.ct++;
      if (S.ct === 1) {
        const st = STAGES[S.stage], nm = S.smiss === 0;
        const bonus = Math.floor((20000 * (S.stage + 1) + (nm ? 100000 : 0) + S.lives * 20000 + S.bombs * 5000) * S.sm);
        S.score = Math.min(SCORE_CAP, S.score + bonus); S.st.stages++; if (nm) S.st.nomiss++;
        S.lastClear = { stage: S.stage, bonus, nomiss: nm };
        cancelBullets(S, 0, 0); p.inv = 400;
        ev(S, 'stageclear', 0, 0, S.stage); sfx(S, 'clear');
        while (S.ex < EXT.length && S.score >= EXT[S.ex]) { S.ex++; if (S.lives < 8) S.lives++; }
      }
      if (S.ct >= 220) {
        if (S.li + 1 < S.list.length) {
          S.li++; startStage(S);
          if (S.mode === 'rush') { S.bombs = Math.max(S.bombs, DIFF[S.di].bombs); }
        } else { S.phase = 'done'; S.cleared = true; S.score = Math.min(SCORE_CAP, S.score + (S.mode === 'arcade' ? Math.floor(S.lives * 50000 * S.sm) : 0)); ev(S, 'allclear', 0, 0, 0); }
      }
    }
    return S;
  }
  function pick(S, k) {
    S.st.items++; addScore(S, 1000); sfx(S, 'item'); ev(S, 'pick', S.p.x, S.p.y, k);
    if (k === 0) { if (S.power < 4) S.power++; else addScore(S, 4000); }
    else if (k === 1) { if (S.spd < 3) S.spd++; else addScore(S, 2000); }
    else if (k === 2) { if (S.opt < 3) S.opt++; else addScore(S, 4000); }
    else if (k === 3) { if (S.shield < 2) S.shield++; else addScore(S, 3000); }
    else { if (S.bombs < 6) S.bombs++; else addScore(S, 3000); }
  }

  // ---------------------------------------------------------------- hash and helpers
  function hash(S) {
    let h = 2166136261 >>> 0;
    const mix = v => { h = Math.imul(h ^ (v | 0), 16777619) >>> 0; };
    mix(S.frame); mix(S.score); mix(S.lives); mix(S.bombs); mix(S.rs); mix(S.chain); mix(S.power); mix(S.opt); mix(S.spd); mix(S.shield); mix(S.stage); mix(S.sf);
    mix(Math.round(S.p.x * 64)); mix(Math.round(S.p.y * 64)); mix(S.p.inv); mix(S.p.dying);
    for (const b of S.bul) if (b.a) { mix(Math.round(b.x * 16)); mix(Math.round(b.y * 16)); mix(b.k); }
    for (const e of S.ene) if (e.a) { mix(Math.round(e.x * 16)); mix(Math.round(e.y * 16)); mix(Math.round(e.hp * 8)); }
    for (const s of S.sht) if (s.a) { mix(Math.round(s.x * 16)); mix(Math.round(s.y * 16)); }
    for (const i of S.itm) if (i.a) { mix(Math.round(i.x * 16)); mix(i.k); }
    for (const l of S.las) if (l.a) { mix(l.t); mix(Math.round(l.dx * 1000)); }
    mix(S.st.kills); mix(S.st.graze); mix(S.st.bombs); mix(S.st.deaths);
    return h >>> 0;
  }
  const count = arr => { let n = 0; for (const x of arr) if (x.a) n++; return n; };

  // ---------------------------------------------------------------- daily challenge: the same for everyone on a date
  function dailyFor(dateKey) {
    const r = mkRng((dateKey | 0) * 2654435761 | 0);
    const names = Object.keys(MODS), picks = [];
    while (picks.length < 2) { const m = names[Math.floor(r() * names.length)]; if (picks.indexOf(m) < 0) picks.push(m); }
    const a = Math.floor(r() * 3), b = 3 + Math.floor(r() * 2), c = 5 + Math.floor(r() * 2);
    return { dkey: dateKey | 0, seed: Math.floor(r() * 2147483647) + 1, ship: Math.floor(r() * 3), list: [a, b, c], mods: picks, diff: 1 };
  }

  // ---------------------------------------------------------------- replays: header + run-length coded input -> a text code anyone can paste
  const replay = {
    MAXFRAMES: 400000,
    rle(inputs) { const out = []; for (let i = 0; i < inputs.length; i++) { const m = inputs[i] & 255, l = out[out.length - 1]; if (l && l[0] === m && l[1] < 65535) l[1]++; else out.push([m, 1]); } return out; },
    unrle(runs) { const out = []; for (const r of runs) for (let i = 0; i < r[1]; i++) out.push(r[0]); return out; },
    make(opts, inputs, extra) { return Object.assign({ v: 1, mode: opts.mode, diff: opts.diff | 0, ship: opts.ship | 0, seed: opts.seed | 0, stage: opts.stage | 0, assist: opts.assist | 0, mods: opts.mods || [], dkey: opts.dkey | 0, list: opts.list || null, frames: inputs.length, runs: replay.rle(inputs) }, extra || {}); },
    optsOf(rec) { return { mode: rec.mode, diff: rec.diff, ship: rec.ship, seed: rec.seed, stage: rec.stage, assist: rec.assist, mods: rec.mods, dkey: rec.dkey, list: rec.list }; },
    run(rec, upto) { const S = newGame(replay.optsOf(rec)); const inputs = replay.unrle(rec.runs); const n = Math.min(inputs.length, upto == null ? inputs.length : upto); for (let i = 0; i < n; i++) { step(S, inputs[i]); S.ev.length = 0; } return S; },
    validate(rec) {
      if (!rec || typeof rec !== 'object' || rec.v !== 1) throw new Error('bad replay');
      if (['arcade', 'practice', 'rush', 'daily'].indexOf(rec.mode) < 0) throw new Error('bad mode');
      if (!(rec.diff >= 0 && rec.diff <= 3) || !(rec.ship >= 0 && rec.ship <= 2)) throw new Error('bad setup');
      if (!Array.isArray(rec.runs) || rec.runs.length > 200000) throw new Error('bad runs');
      let n = 0; for (const r of rec.runs) { if (!Array.isArray(r) || r.length !== 2 || !(r[0] >= 0 && r[0] <= 255) || !(r[1] >= 1 && r[1] <= 65535)) throw new Error('bad run'); n += r[1]; }
      if (n > replay.MAXFRAMES) throw new Error('too long');
      rec.frames = n; return rec;
    },
    // text code: "PW1." + base64url of  [json header][0][runs: mask byte, varint len]...
    encode(rec) {
      const head = JSON.stringify({ v: 1, mode: rec.mode, diff: rec.diff, ship: rec.ship, seed: rec.seed, stage: rec.stage, assist: rec.assist, mods: rec.mods, dkey: rec.dkey, list: rec.list, score: rec.score, t: rec.t });
      const bytes = []; for (const c of unescape(encodeURIComponent(head))) bytes.push(c.charCodeAt(0));
      bytes.push(0);
      for (const r of rec.runs) { bytes.push(r[0]); let n = r[1]; while (n >= 128) { bytes.push((n & 127) | 128); n >>= 7; } bytes.push(n); }
      return 'PW1.' + b64(bytes);
    },
    decode(str) {
      str = String(str || '').replace(/\s+/g, '');
      if (str.slice(0, 4) !== 'PW1.') throw new Error('not a replay code');
      const bytes = unb64(str.slice(4)); let i = 0, hs = '';
      while (i < bytes.length && bytes[i] !== 0) hs += String.fromCharCode(bytes[i++]);
      if (i >= bytes.length) throw new Error('bad replay');
      i++;
      const head = JSON.parse(decodeURIComponent(escape(hs))), runs = [];
      while (i < bytes.length) { const m = bytes[i++]; let n = 0, sh = 0, c; do { if (i >= bytes.length) throw new Error('bad replay'); c = bytes[i++]; n |= (c & 127) << sh; sh += 7; } while (c & 128 && sh < 28); runs.push([m, n]); }
      head.runs = runs; return replay.validate(head);
    },
  };
  const B64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-_';
  function b64(by) { let s = ''; for (let i = 0; i < by.length; i += 3) { const a = by[i], b = by[i + 1], c = by[i + 2], n = (a << 16) | ((b || 0) << 8) | (c || 0); s += B64[n >> 18 & 63] + B64[n >> 12 & 63] + (b === undefined ? '' : B64[n >> 6 & 63]) + (c === undefined ? '' : B64[n & 63]); } return s; }
  function unb64(s) { const out = []; for (let i = 0; i < s.length; i += 4) { const v = [0, 1, 2, 3].map(k => (i + k < s.length ? B64.indexOf(s[i + k]) : -2)); if (v.some(x => x === -1)) throw new Error('bad replay'); const n = (v[0] << 18) | ((v[1] < 0 ? 0 : v[1]) << 12) | ((v[2] < 0 ? 0 : v[2]) << 6) | (v[3] < 0 ? 0 : v[3]); out.push(n >> 16 & 255); if (v[2] >= 0) out.push(n >> 8 & 255); if (v[3] >= 0) out.push(n & 255); } return out; }

  const api = { W, H, IN, SCORE_CAP, EXT, newGame, step, hash, PAT, replay, dailyFor, sin, cos, mkRng, count, optPos, spawnEnemy, addBullet, addLaser, startStage, cancelBullets, D };
  root.ShmupEngine = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
