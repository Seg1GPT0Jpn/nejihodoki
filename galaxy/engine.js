// ぐるぐる星わたり：ルール本体（純粋。ブラウザでも node でも動く）。window.GalaxyEngine
// ---------------------------------------------------------------------------------
// 小さな丸い星・四角い星・まるい筒の星の上を、「星の中心（または一番ちかい面）にむかう重力」で歩く・とぶ・まわる・ドスンと落ちる・かべをける。
// 決まった刻み（1/60秒）で進み、状態 S は JSON にできる（clone は JSON のうつし）。乱数は種つき。
//   const L = E.compile(def);  const S = E.create(L, missionId, { assist });  E.step(S, { sx, sy, b, lx, ly });
//   入力：sx（右+）・sy（前+）は -1〜1、b はボタンのビット（B.J ジャンプ・B.S スピン・B.P ドスン）、lx・ly は視点の回転（-1〜1）
//   当たりは「ぜんぶ解析的」：球・箱（丸み rr つき）・筒・カプセルの符号つき距離 sdf。主人公は半径 HR の球。
(function (root) {
  'use strict';
  const DT = 1 / 60, HR = 0.5, TAU = Math.PI * 2;
  const B = { J: 1, S: 2, P: 4 };
  const K = {
    G0: 26, RUN: 7.4, ACC_G: 70, FRIC: 55, ACC_A: 24, JUMP: 11, MAXFALL: 40, SKIN: 0.03, COYOTE: 0.12, BUFFER: 0.14,
    SPIN_T: 0.42, SPIN_R: 2.0, SPIN_CD: 0.18, POUND_V: 32, POUND_STUN: 0.3, POUND_R: 3.2, KICK_H: 8, KICK_V: 10, WALL_T: 0.14,
    INV: 1.6, VOID: 34, HOVER: 3.0, POWER_T: 28, ENEMY_R: 1.05,
  };
  // むずかしさ 0 やさしい（いままで）/ 1 ふつう / 2 むずかしい / 3 たつじん
  const DIF = { hp: [3, 3, 3, 3], inv: [1.6, 1.4, 1.2, 1.1], timer: [1, 1, 1, 1], wk: [1, 1.25, 1.5, 1.8], launchR: [1.55, 1.5, 1.45, 1.4], pick: [1, 1, 0.97, 0.95], coyote: [0.12, 0.11, 0.1, 0.1], buf: [0.14, 0.13, 0.12, 0.12], boss: [1, 1.2, 1.4, 1.6], stun: [1, 0.75, 0.6, 0.5], tele: [1, 0.8, 0.65, 0.55], bhp: [0, 0, 1, 1], er: [0, 0.1, 0.2, 0.3], sp: [0, 0.05, 0.1, 0.15], crum: [1, 0.8, 0.65, 0.5], lives: [99, 99, 99, 99], cp: [1, 1, 0, 0], vd: [0, 1, 1, 2] };
  const SURF = { grass: { fr: 1 }, sand: { fr: 0.9 }, ice: { fr: 0.1 }, dusk: { fr: 1 }, star: { fr: 1 }, water: { fr: 0.9 }, ruin: { fr: 1 }, gear: { fr: 1 }, lava: { fr: 1, hurt: 1 }, candy: { fr: 0.85 }, stone: { fr: 1 }, metal: { fr: 1 }, moss: { fr: 1 } };

  // ---------- ベクトル・行列（9要素の行優先） ----------
  const add = (a, b) => [a[0] + b[0], a[1] + b[1], a[2] + b[2]];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const mul = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const dot = (a, b) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const cross = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  const len = a => Math.hypot(a[0], a[1], a[2]);
  const norm = a => { const l = len(a); return l > 1e-9 ? [a[0] / l, a[1] / l, a[2] / l] : [0, 0, 0]; };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const rodr = (v, a, ang) => { const c = Math.cos(ang), s = Math.sin(ang), d = dot(a, v) * (1 - c), x = cross(a, v); return [v[0] * c + x[0] * s + a[0] * d, v[1] * c + x[1] * s + a[1] * d, v[2] * c + x[2] * s + a[2] * d]; };
  const axM = (a, ang) => { const e = [rodr([1, 0, 0], a, ang), rodr([0, 1, 0], a, ang), rodr([0, 0, 1], a, ang)]; return [e[0][0], e[1][0], e[2][0], e[0][1], e[1][1], e[2][1], e[0][2], e[1][2], e[2][2]]; };
  const mulM = (A, Bm) => { const o = new Array(9); for (let i = 0; i < 3; i++) for (let j = 0; j < 3; j++) o[i * 3 + j] = A[i * 3] * Bm[j] + A[i * 3 + 1] * Bm[3 + j] + A[i * 3 + 2] * Bm[6 + j]; return o; };
  const mv = (M, v) => [M[0] * v[0] + M[1] * v[1] + M[2] * v[2], M[3] * v[0] + M[4] * v[1] + M[5] * v[2], M[6] * v[0] + M[7] * v[1] + M[8] * v[2]];
  const mtv = (M, v) => [M[0] * v[0] + M[3] * v[1] + M[6] * v[2], M[1] * v[0] + M[4] * v[1] + M[7] * v[2], M[2] * v[0] + M[5] * v[1] + M[8] * v[2]];
  const IDM = [1, 0, 0, 0, 1, 0, 0, 0, 1];
  const eulerM = r => mulM(axM([0, 0, 1], r[2] || 0), mulM(axM([0, 1, 0], r[1] || 0), axM([1, 0, 0], r[0] || 0)));
  const slerpN = (a, b, k) => {
    const d = clamp(dot(a, b), -1, 1), ang = Math.acos(d); if (ang < 1e-4) return b.slice();
    let ax = cross(a, b); const l = len(ax); ax = l > 1e-6 ? mul(ax, 1 / l) : perp(a);
    return norm(rodr(a, ax, ang * k));
  };
  const perp = a => { const t = Math.abs(a[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0]; return norm(cross(a, t)); };
  // 種つき乱数（mulberry32）。状態は S.rs
  function rnd(S) { let t = (S.rs = (S.rs + 0x6D2B79F5) >>> 0); t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }

  // ---------- 形：符号つき距離とそこでの外向きの向き（ローカル座標） ----------
  //  k: 's' 球 {r} / 'b' 箱 {h:[hx,hy,hz], rr} / 'y' 筒（軸はローカルY） {r, hh, rr} / 'p' カプセル（軸はY） {r, hl}
  function sdf(b, q) {
    const x = q[0], y = q[1], z = q[2];
    switch (b.k) {
      case 's': { const l = Math.hypot(x, y, z) || 1e-9; return [l - b.r, x / l, y / l, z / l]; }
      case 'b': {
        const rr = b.rr || 0, h = b.h, ax = Math.abs(x) - (h[0] - rr), ay = Math.abs(y) - (h[1] - rr), az = Math.abs(z) - (h[2] - rr);
        const ox = Math.max(ax, 0), oy = Math.max(ay, 0), oz = Math.max(az, 0), ol = Math.hypot(ox, oy, oz);
        if (ol > 0) return [ol - rr, Math.sign(x || 1) * ox / ol, Math.sign(y || 1) * oy / ol, Math.sign(z || 1) * oz / ol];
        const m = Math.max(ax, ay, az);
        if (m === ax) return [m - rr, Math.sign(x || 1), 0, 0]; if (m === ay) return [m - rr, 0, Math.sign(y || 1), 0]; return [m - rr, 0, 0, Math.sign(z || 1)];
      }
      case 'y': {
        const rr = b.rr || 0, rho = Math.hypot(x, z), dx = rho - (b.r - rr), dy = Math.abs(y) - (b.hh - rr), ox = Math.max(dx, 0), oy = Math.max(dy, 0), ol = Math.hypot(ox, oy), cr = rho > 1e-9 ? x / rho : 1, sr = rho > 1e-9 ? z / rho : 0;
        if (ol > 0) return [ol - rr, cr * ox / ol, Math.sign(y || 1) * oy / ol, sr * ox / ol];
        if (dx > dy) return [dx - rr, cr, 0, sr]; return [dy - rr, 0, Math.sign(y || 1), 0];
      }
      default: { // 'p'
        const c = clamp(y, -b.hl, b.hl), vy = y - c, l = Math.hypot(x, vy, z) || 1e-9; return [l - b.r, x / l, vy / l, z / l];
      }
    }
  }
  const boundR = b => (b.k === 's' ? b.r : b.k === 'b' ? Math.hypot(b.h[0], b.h[1], b.h[2]) : b.k === 'y' ? Math.hypot(b.r, b.hh) : b.hl + b.r);
  const sizeOf = b => (b.k === 's' ? b.r : b.k === 'b' ? Math.max(b.h[0], b.h[1], b.h[2]) : b.k === 'y' ? Math.max(b.r, b.hh) : b.hl + b.r);

  // ---------- コンパイル（定義 → 実行用） ----------
  const copy = o => JSON.parse(JSON.stringify(o));
  function compile(def) {
    const L = { id: def.id, def, name: def.name, theme: def.theme, sky: def.sky, deco: def.deco || [], bodies: [], zones: [], ents: [], missions: {}, mlist: [], idx: {}, eidx: {} };
    (def.bodies || []).forEach((b0, i) => {
      const b = copy(b0); b.i = i; b.R0 = eulerM(b.rot || [0, 0, 0]); b.g = b.g == null ? 1 : b.g; b.br = boundR(b); b.sz = sizeOf(b);
      if (b.gr == null) b.gr = clamp(5 + b.sz * 0.5, 6, 18);
      b.surf = b.surf || 'grass'; b.fr = (SURF[b.surf] || SURF.grass).fr; b.mv = (b.mv || []).map(m => Object.assign({ ph: 0 }, m, m.a ? { a: norm(m.a) } : {}));
      b.p = b.p.slice(); L.bodies.push(b); if (b.id) L.idx[b.id] = i;
    });
    (def.zones || []).forEach(z0 => { const z = copy(z0); if (typeof z.b === 'string') z.b = L.idx[z.b]; if (z.dir) z.dir = norm(z.dir); L.zones.push(z); });
    const S0 = { L, xf: L.bodies.map(b => xfAt(b, 0)), bOn: L.bodies.map(() => true) };
    (def.ents || []).forEach((e0, i) => {
      const e = copy(e0); e.i = i; e.bi = e.b == null ? -1 : (typeof e.b === 'string' ? L.idx[e.b] : e.b); e.m = e.m || null;
      if (e.bi < 0 && e.p == null) e.p = [0, 0, 0];
      if (e.to && typeof e.to.b === 'string') e.to.b = L.idx[e.to.b];
      if (e.to && e.to.lift && e.to.b != null) { const r = sdf(L.bodies[e.to.b], e.to.l); e.to.l = [e.to.l[0] + r[1] * e.to.lift, e.to.l[1] + r[2] * e.to.lift, e.to.l[2] + r[3] * e.to.lift]; }
      if (e.ax) e.ax = norm(e.ax);
      // 面の外向き（ローカル or 世界）
      if (e.bi >= 0) { const l0 = e.l0 || e.l; const r = sdf(L.bodies[e.bi], l0); e.n = [r[1], r[2], r[3]]; } else { const g = gravAt(S0, e.p, -1); e.n = g.up || [0, 1, 0]; }
      if (e.id) L.eidx[e.id] = i; L.ents.push(e);
    });
    (def.missions || []).forEach((m0, i) => { const m = copy(m0); m.idx = i; L.missions[m.id] = m; L.mlist.push(m); });
    return L;
  }
  function xfAt(b, t) {
    let p = b.p, R = b.R0;
    for (const m of b.mv) {
      const ph = t / m.T + m.ph;
      if (m.t === 'orbit') { const ang = TAU * ph; p = add(m.c, rodr(sub(b.p, m.c), m.a, ang)); if (m.lock) R = mulM(axM(m.a, ang), R); }
      else if (m.t === 'spin') R = mulM(axM(m.a, TAU * ph), R);
      else if (m.t === 'lin') p = add(p, mul(m.d, 0.5 - 0.5 * Math.cos(TAU * ph)));
    }
    return { p, R };
  }
  // 世界座標の符号つき距離（i 番の体の。x は世界座標）
  function sdfW(S, i, x) {
    const b = S.L.bodies[i], f = S.xf[i], q = mtv(f.R, sub(x, f.p)), r = sdf(b, q), n = mv(f.R, [r[1], r[2], r[3]]);
    return [r[0], n[0], n[1], n[2], q];
  }
  function inZone(z, x) {
    if (z.s === 'sphere') return len(sub(x, z.c)) < z.r;
    const d = sub(x, z.c), q = z.R ? mtv(z.R, d) : d; return Math.abs(q[0]) < z.h[0] && Math.abs(q[1]) < z.h[1] && Math.abs(q[2]) < z.h[2];
  }
  // 重力：{ i（重力を決める体）, d（面までの距離）, up（上向きの単位ベクトル）, gm（大きさ）, zone }
  function gravAt(S, x, hint) {
    const L = S.L; let best = -1, bs = 1e9, hs = 1e9, bn = null, bd = 0, hn = null, hd = 0;
    for (let i = 0; i < L.bodies.length; i++) {
      const b = L.bodies[i]; if (b.g <= 0) continue;
      if (!S.bOn[i]) continue; const f = S.xf[i]; if (len(sub(x, f.p)) - b.br > b.gr + 0.5) continue;
      const r = sdfW(S, i, x); if (r[0] > b.gr) continue;
      const sc = r[0] / b.gr; if (i === hint) { hs = sc; hn = [r[1], r[2], r[3]]; hd = r[0]; }
      if (sc < bs) { bs = sc; best = i; bn = [r[1], r[2], r[3]]; bd = r[0]; }
    }
    if (hint >= 0 && hn && best !== hint && hd - bd < 0.35) { best = hint; bn = hn; bd = hd; }
    let up = bn, gm = best >= 0 ? K.G0 * L.bodies[best].g : 0, zone = -1;
    for (let zi = 0; zi < L.zones.length; zi++) {
      const z = L.zones[zi]; if (!inZone(z, x)) continue;
      if (z.m === 'dir') { up = mul(z.dir, -1); gm = K.G0 * (z.g == null ? 1 : z.g); zone = zi; }
      else if (z.m === 'inv' && bn) { up = mul(bn, -1); zone = zi; }
      else if (z.m === 'body' && z.b >= 0) { const r = sdfW(S, z.b, x); up = [r[1], r[2], r[3]]; best = z.b; bd = r[0]; gm = K.G0 * L.bodies[z.b].g; zone = zi; }
      else if (z.m === 'zero') { gm = 0; zone = zi; }
      break;
    }
    return { i: best, d: bd, up, gm, zone };
  }

  // ---------- 状態 ----------
  function create(L, mid, opt) {
    opt = opt || {}; const as = opt.assist || {}; 
    const m = L.missions[mid] || L.mlist[0]; const dif = clamp(opt.dif != null ? opt.dif | 0 : (m.dif == null ? 0 : m.dif), 0, 3);
    const S = { f: 0, t: 0, id: L.id, mid: m.id, rs: (opt.seed == null ? 12345 : opt.seed) >>> 0, as: { hp: as.hp ? 1 : 0, nofall: as.nofall ? 1 : 0, slow: as.slow ? 1 : 0 },
      pb: 0, ev: [], e: new Array(L.ents.length).fill(0), flag: {}, cnt: { coin: 0, crystal: 0, orb: 0, kill: 0, stomp: 0, lumi: 0, die: 0, jump: 0, spin: 0, pound: 0, wk: 0, launch: 0, hurt: 0, hit: 0 }, lumi: 0, cp: -1, res: null, over: 0, gate: -1, bnr: null,
      cam: { fw: [0, 0, -1], up: [0, 1, 0], pitch: 0.4, man: 0 }, boss: null, need: { orb: 0, lan: 0 }, lit: [], tl: 0, hpMax: DIF.hp[dif] + (as.hp ? 3 : 0), bsig: 0, dif, wk: DIF.wk[dif], lives: DIF.lives[dif] + (as.hp ? 2 : 0) };
    Object.defineProperty(S, 'L', { value: L, writable: true, enumerable: false });
    Object.defineProperty(S, 'xf', { value: L.bodies.map(b => xfAt(b, 0)), writable: true, enumerable: false });
    Object.defineProperty(S, 'xp', { value: L.bodies.map(b => xfAt(b, 0)), writable: true, enumerable: false });
    Object.defineProperty(S, 'ep', { value: [], writable: true, enumerable: false });
    Object.defineProperty(S, 'bOn', { value: L.bodies.map(b => !b.m || b.m.indexOf(m.id) >= 0), writable: true, enumerable: false });
    S.act = []; L.ents.forEach((e, i) => { if ((!e.m || e.m.indexOf(m.id) >= 0) && !(e.bi >= 0 && !S.bOn[e.bi])) { S.act.push(i); if (e.k === 'orb') S.need.orb++; if (e.k === 'lantern') S.need.lan++; } });
    S.tl = m.timer ? Math.max(m.timer * DIF.timer[dif], (m.tmin || 0)) * (S.as.slow ? 1.6 : 1) : m.limit ? m.limit * (S.as.slow ? 1.6 : 1) : 0;
    const bs = L.ents.findIndex((e, i) => e.k === 'boss' && S.act.indexOf(i) >= 0);
    if (bs >= 0) { const e = L.ents[bs]; S.boss = { i: bs, hp: (e.hp || 3) + DIF.bhp[dif], hp0: (e.hp || 3) + DIF.bhp[dif], xh: DIF.bhp[dif], st: 'walk', t: 2, d: norm(e.l), tg: norm(e.l), ring: -1, rt: 0, flash: 0, off: 0 }; }
    const st = m.start || { p: [0, 0, 0] };
    S.h = { x: [0, 0, 0], v: [0, 0, 0], up: [0, 1, 0], fw: [0, 0, -1], on: -1, gb: -1, gn: [0, 1, 0], wn: [0, 0, 0], wt: 0, cy: 0, jb: 0, hp: S.hpMax, inv: 0, spin: 0, scd: 0, pound: 0, pt: 0, lau: null, lcd: 0, pw: null, hov: 0, aj: 0, as: 0, dead: 0, jh: 0, air: 0, sp: 0, la: -1, vis: 1 };
    S.stCfg = st;
    place(S, st); S.cp = -1; S.h.up = (gravAt(S, S.h.x, -1).up || [0, 1, 0]).slice(); S.h.gb = gravAt(S, S.h.x, -1).i;
    S.cam.up = S.h.up.slice(); S.cam.fw = st.fw ? projT(st.fw, S.h.up) : [0, 0, 0]; if (len(S.cam.fw) < 0.5) S.cam.fw = perp(S.h.up);
    S.h.fw = S.cam.fw.slice();
    refreshEnts(S, 0); return S;
  }
  function projT(v, up) { return norm(sub(v, mul(up, dot(v, up)))); }
  function place(S, st) {
    const L = S.L; let p;
    if (st.b != null) { const bi = typeof st.b === 'string' ? L.idx[st.b] : st.b; const f = S.xf[bi]; p = add(f.p, mv(f.R, st.l)); } else p = st.p.slice();
    S.h.x = p; S.h.v = [0, 0, 0]; S.h.on = -1;
  }
  function clone(S) {
    const o = JSON.parse(JSON.stringify(S));
    Object.defineProperty(o, 'L', { value: S.L, writable: true, enumerable: false });
    Object.defineProperty(o, 'xf', { value: S.xf.map(f => ({ p: f.p.slice(), R: f.R.slice() })), writable: true, enumerable: false });
    Object.defineProperty(o, 'xp', { value: S.xp.map(f => ({ p: f.p.slice(), R: f.R.slice() })), writable: true, enumerable: false });
    Object.defineProperty(o, 'bOn', { value: S.bOn.slice(), writable: true, enumerable: false });
    Object.defineProperty(o, 'ep', { value: S.ep.map(p => p && p.slice()), writable: true, enumerable: false });
    return o;
  }
  function hash(S) {
    let h = 2166136261 >>> 0; const mix = n => { h = Math.imul(h ^ (Math.round(n * 1000) | 0), 16777619) >>> 0; };
    mix(S.f); for (const k of S.h.x) mix(k); for (const k of S.h.v) mix(k); mix(S.h.hp); mix(S.cnt.coin); mix(S.cnt.crystal); mix(S.cnt.kill); mix(S.over); mix(S.res ? (S.res.ok ? 1 : 2) : 0);
    for (const e of S.e) mix(e); mix(S.lit.length); if (S.boss) { mix(S.boss.hp); mix(S.boss.t); } return h >>> 0;
  }

  // ---------- 動くもの ----------
  function bodyAt(S, i, q) { const f = S.xf[i]; return add(f.p, mv(f.R, q)); }
  function entLocal(e, t) { if (e.k === 'walker') return rodr(e.l0, e.ax, (e.ph || 0) + e.w * t); return e.l; }
  function entPos(S, i) { const e = S.L.ents[i]; if (e.bi >= 0) return bodyAt(S, e.bi, entLocal(e, S.t * (e.k === 'walker' ? S.wk : 1))); return e.p; }
  function entUp(S, i) { const e = S.L.ents[i]; if (e.bi >= 0) { const n = e.n; if (e.k === 'walker') return mv(S.xf[e.bi].R, norm(entLocal(e, S.t * S.wk))); return mv(S.xf[e.bi].R, n); } return e.n; }
  function refreshEnts(S, dt) {
    S.ep.length = S.L.ents.length;
    for (const i of S.act) S.ep[i] = S.e[i] ? null : entPos(S, i);
  }
  function bossPos(S) {
    const bo = S.boss, e = S.L.ents[bo.i], R = S.L.bodies[e.bi].r, q = mul(norm(bo.d), R + (e.rad || 1.5) + bo.off); return bodyAt(S, e.bi, q);
  }
  const isOn = (S, e) => { if (S.e[e.i]) return false; if (e.req && !S.flag[e.req]) return false; return true; };

  // ---------- 衝突（主人公は半径 HR の球） ----------
  function collide(S, x, v, fv, ct, crs) {
    const L = S.L, bodies = L.bodies;
    for (let it = 0; it < 3; it++) {
      let moved = false;
      for (let i = 0; i < bodies.length; i++) {
        const b = bodies[i], f = S.xf[i]; if (!S.bOn[i]) continue;
        if (len(sub(x, f.p)) > b.br + HR + 0.6) continue;
        const r = sdfW(S, i, x), d = r[0]; if (d >= HR + K.SKIN) continue;
        const n = [r[1], r[2], r[3]];
        if (d < HR) { x[0] += n[0] * (HR - d); x[1] += n[1] * (HR - d); x[2] += n[2] * (HR - d); moved = true; }
        // 体の点の速度（hero の座標の型に合わせた相対）
        const bv = bodyVelAt(S, i, r[4]), rel = sub(v, sub(bv, fv)), vn = dot(rel, n);
        if (vn < 0) { v[0] -= n[0] * vn; v[1] -= n[1] * vn; v[2] -= n[2] * vn; }
        if (it === 0) ct.push({ i, n, d });
      }
      for (const c of crs) { // こわせる箱（動かない球として）
        const d0 = len(sub(x, c.p)) - c.r; if (d0 >= HR) continue; const n = norm(sub(x, c.p)); if (!len(n)) continue;
        x[0] += n[0] * (HR - d0); x[1] += n[1] * (HR - d0); x[2] += n[2] * (HR - d0); moved = true; const vn = dot(v, n); if (vn < 0) { v[0] -= n[0] * vn; v[1] -= n[1] * vn; v[2] -= n[2] * vn; } if (it === 0) ct.push({ i: -1, n, d: d0 });
      }
      if (!moved) break;
    }
  }
  function bodyVelAt(S, i, q) {
    const a = S.xp[i], b = S.xf[i]; if (a === b || (a.p === b.p)) return [0, 0, 0];
    const p0 = add(a.p, mv(a.R, q)), p1 = add(b.p, mv(b.R, q)); return mul(sub(p1, p0), 1 / DT);
  }

  // ---------- 1ステップ ----------
  function hurt(S, from, lethal) {
    const h = S.h; if (h.inv > 0 || h.dead || h.lau || S.over) return false;
    if (h.pw && h.pw.k === 'shield') { h.pw = null; h.inv = 1.0; S.ev.push(['shield', h.x[0], h.x[1], h.x[2]]); return false; }
    h.hp -= (S.dif >= 3 && lethal ? 9 : 1); h.inv = DIF.inv[S.dif]; S.cnt.hurt++; S.ev.push(['hurt', h.x[0], h.x[1], h.x[2]]);
    const away = from ? norm(sub(h.x, from)) : [0, 0, 0], u = h.up;
    const hz = norm(sub(away, mul(u, dot(away, u))));
    h.v = add(mul(hz, 6.5), mul(u, 8)); h.on = -1; h.pound = 0; h.spin = 0;
    if (h.hp <= 0) { h.dead = 1.1; S.cnt.die++; S.ev.push(['die', h.x[0], h.x[1], h.x[2]]); }
    return true;
  }
  function respawn(S) {
    const h = S.h, L = S.L;
    if (S.cp >= 0) { const e = L.ents[S.cp], p = entPos(S, S.cp), up = entUp(S, S.cp); h.x = add(p, mul(up, 1.2)); h.up = up.slice(); }
    else { place(S, S.stCfg); }
    h.v = [0, 0, 0]; h.on = -1; h.lau = null; h.pound = 0; h.spin = 0; h.dead = 0; h.inv = DIF.inv[S.dif]; if (h.hp <= 0) h.hp = S.hpMax;
    const g = gravAt(S, h.x, -1); h.gb = g.i; if (g.up) h.up = g.up.slice(); S.ev.push(['respawn', h.x[0], h.x[1], h.x[2]]);
  }
  const magR = S => (S.h.pw && S.h.pw.k === 'magnet' ? 3.6 : 0);
  // ランク：パータイム・ノーダメージ・ルミ全部で点をつけ、S/A/B/C
  function rank(m, res, lumiAll) { let p = 0; const par = (m.par || 60) * 60; if (res.f <= par * 0.75) p += 2; else if (res.f <= par * 1.15) p += 1; if (res.die === 0 && res.hurt === 0) p += 1; if (lumiAll) p += 1; return p >= 4 ? 3 : p >= 3 ? 2 : p >= 2 ? 1 : 0; }
  const RANK_REWARD = [5, 15, 30, 50];
  function camFrame(S) {
    const up = S.h.up, f = projT(S.cam.fw, up); const fw = len(f) > 0.3 ? f : perp(up); return { f: fw, r: cross(fw, up), u: up };
  }
  function finish(S, ok, why) {
    if (S.over) return; S.over = 1;
    S.res = { ok: !!ok, why: why || '', f: S.f, t: S.f * DT, coin: S.cnt.coin, crystal: S.cnt.crystal, die: S.cnt.die, hurt: S.cnt.hurt, hp: S.h.hp, lumi: S.lumi, dif: S.dif };
    S.ev.push([ok ? 'done' : 'fail', S.h.x[0], S.h.x[1], S.h.x[2]]);
  }
  function step(S, inp) {
    inp = inp || {}; const L = S.L, h = S.h; S.ev = []; S.f++;
    if (S.over) { S.t += DT; moveBodies(S); refreshEnts(S, DT); camStep(S, inp, 0); return S; }
    const sx = clamp(inp.sx || 0, -1, 1), sy = clamp(inp.sy || 0, -1, 1), bt = inp.b | 0;
    const jp = (bt & B.J) && !(S.pb & B.J), sp = (bt & B.S) && !(S.pb & B.S), po = (bt & B.P) && !(S.pb & B.P), jh = !!(bt & B.J);
    S.pb = bt;
    // 体を動かす
    const hadGround = h.on >= 0, q0 = hadGround ? mtv(S.xf[h.on].R, sub(h.x, S.xf[h.on].p)) : null, R0 = hadGround ? S.xf[h.on].R : null;
    moveBodies(S);
    let gv = [0, 0, 0];
    if (hadGround) { // 乗っている体といっしょに動く
      const f = S.xf[h.on], nx = add(f.p, mv(f.R, q0)); gv = mul(sub(nx, h.x), 1 / DT); h.x = nx;
      const rel = mulM(f.R, [R0[0], R0[3], R0[6], R0[1], R0[4], R0[7], R0[2], R0[5], R0[8]]); h.fw = norm(mv(rel, h.fw)); h.v = mv(rel, h.v); S.cam.fw = norm(mv(rel, S.cam.fw)); S.cam.up = norm(mv(rel, S.cam.up));
    }
    S.t += DT; refreshEnts(S, DT);
    // 時計
    if (S.tl > 0 && !S.res) S.tl = Math.max(0, S.tl - DT); // ランクのための目安の時計。0になっても失敗にはならない
    h.inv = Math.max(0, h.inv - DT); h.scd = Math.max(0, h.scd - DT); h.lcd = Math.max(0, h.lcd - DT); h.wt = Math.max(0, h.wt - DT); h.jb = Math.max(0, h.jb - DT);
    if (h.pw) { h.pw.t -= DT; if (h.pw.t <= 0) h.pw = null; }
    if (jp) h.jb = DIF.buf[S.dif];
    if (h.dead) { h.dead -= DT; if (h.dead <= 0) { if (S.cnt.die >= S.lives && !S.res) { finish(S, false, 'ko'); } else respawn(S); } camStep(S, inp, 0); return S; }
    // ---- 打ち上げ中 ----
    if (h.lau) { launchStep(S, h.lau); pickups(S); camStep(S, inp, 0); S.h.sp = len(h.v); return S; }
    // ---- 重力 ----
    const g = gravAt(S, h.x, h.gb); h.gb = g.i;
    const gu = g.up || h.up;
    if (!g.up) { // 重力の外
      const dd = nearestD(S, h.x);
      if (dd > K.VOID) { voidOut(S); camStep(S, inp, 0); return S; }
    }
    const k = 1 - Math.exp(-(h.on >= 0 ? 14 : 7) * DT);
    h.up = slerpN(h.up, gu, k); if (!len(h.up)) h.up = gu.slice();
    // ---- 入力 → 向き ----
    const fr = camFrame(S), mag = Math.min(1, Math.hypot(sx, sy)), mag2 = mag < 0.08 ? 0 : mag;
    let dirW = add(mul(fr.f, sy), mul(fr.r, sx)); dirW = mag2 ? mul(norm(dirW), mag2) : [0, 0, 0];
    const grounded0 = h.on >= 0;
    if (h.pound === 2) { h.pt -= DT; if (h.pt <= 0) h.pound = 0; dirW = [0, 0, 0]; }
    // ---- 速度 ----
    const n0 = grounded0 ? h.gn : gu;
    let v = h.v.slice();
    const speed = K.RUN * (h.pw && h.pw.k === 'spring' ? 1.05 : h.pw && h.pw.k === 'skate' ? 1.6 : 1);
    if (grounded0) {
      let dsr = sub(dirW, mul(n0, dot(dirW, n0))); dsr = mul(dsr, speed);
      const vn = dot(v, n0), vt = sub(v, mul(n0, vn)), surf = L.bodies[h.on].fr * (h.pw && h.pw.k === 'skate' ? 0.55 : 1);
      let diff = sub(dsr, vt); const dl = len(diff), lim = (mag2 ? K.ACC_G : K.FRIC) * surf * DT;
      const nv = dl <= lim ? dsr : add(vt, mul(diff, lim / dl));
      v = add(nv, mul(n0, Math.min(vn, 0)));
    } else if (h.pound !== 1) {
      const vu = dot(v, gu), vh = sub(v, mul(gu, vu)); let want = mul(sub(dirW, mul(gu, dot(dirW, gu))), speed);
      if (mag2) { const diff = sub(want, vh), dl = len(diff), lim = K.ACC_A * DT; v = add(add(dl <= lim ? want : add(vh, mul(diff, lim / dl)), mul(gu, vu)), [0, 0, 0]); }
    }
    // 向き（顔）
    if (mag2) { const t = projT(dirW, gu); if (len(t)) { const f2 = projT(slerpN(h.fw, t, 1 - Math.exp(-18 * DT)), gu); h.fw = len(f2) ? f2 : t; } } else { const t = projT(h.fw, gu); h.fw = len(t) ? t : perp(gu); }
    // 重力
    if (g.gm > 0) v = sub(v, mul(gu, g.gm * DT * (h.pound === 1 ? 0 : 1)));
    else v = mul(v, 1 - 0.35 * DT);
    // ジャンプ・スピン・ドスン
    h.cy = grounded0 ? DIF.coyote[S.dif] : Math.max(0, h.cy - DT);
    const canJump = h.cy > 0;
    let jumped = false;
    if (h.jb > 0 && canJump && h.pound !== 2) {
      const sprg = h.pw && h.pw.k === 'spring'; const jv = K.JUMP * (sprg ? 1.5 : 1);
      const vu = dot(v, gu); v = add(sub(v, mul(gu, vu)), mul(gu, jv)); if (grounded0) v = add(v, gv); h.on = -1; h.cy = 0; h.jb = 0; jumped = true; h.jh = 1; h.as = 0; h.aj = 0; S.cnt.jump++; S.ev.push(['jump', h.x[0], h.x[1], h.x[2], sprg ? 1 : 0]);
    } else if (jp && !grounded0 && h.wt > 0 && h.pound !== 1) { // かべキック
      const wn = norm(h.wn); v = add(mul(wn, K.KICK_H), mul(gu, K.KICK_V)); h.fw = projT(wn, gu); h.wt = 0; h.jb = 0; h.as = 0; h.aj = 0; S.cnt.wk++; S.ev.push(['wk', h.x[0], h.x[1], h.x[2]]);
    } else if (jp && !grounded0 && h.pw && h.pw.k === 'cloud' && h.aj < 3 && h.pound !== 1) { // くもでもう一回
      const vu = dot(v, gu); v = add(sub(v, mul(gu, vu)), mul(gu, 9.5)); h.aj++; h.jb = 0; S.ev.push(['puff', h.x[0], h.x[1], h.x[2]]);
    }
    if (!grounded0 && !jumped && h.jh && !jh && dot(v, gu) > 4.5 && h.pound !== 1) { v = sub(v, mul(gu, dot(v, gu) * 0.5)); h.jh = 0; } // ボタンを離すと低く
    if (!jh) h.jh = 0;
    if (sp && h.scd <= 0 && h.pound === 0) {
      const fire = h.pw && h.pw.k === 'fire'; h.spin = K.SPIN_T * (fire ? 1.3 : 1); h.scd = h.spin + K.SPIN_CD; S.cnt.spin++; S.ev.push(['spin', h.x[0], h.x[1], h.x[2]]);
      if (!grounded0 && !h.as) { h.as = 1; const vu = dot(v, gu); if (vu < 3.5) v = add(sub(v, mul(gu, vu)), mul(gu, 3.5)); }
    }
    if (h.spin > 0) h.spin = Math.max(0, h.spin - DT);
    if (po && !grounded0 && h.pound === 0) { h.pound = 1; S.cnt.pound++; v = mul(gu, -K.POUND_V); S.ev.push(['poundgo', h.x[0], h.x[1], h.x[2]]); }
    if (h.pound === 1) { v = mul(gu, -K.POUND_V); }
    // ハチ：ホバリング
    if (h.pw && h.pw.k === 'bee' && !grounded0 && jh && h.hov > 0 && h.pound === 0 && !jumped) { v = add(v, mul(gu, g.gm * DT)); const vu = dot(v, gu); const tgt = 1.8; v = add(sub(v, mul(gu, vu)), mul(gu, vu + (tgt - vu) * Math.min(1, 10 * DT))); h.hov -= DT; }
    if (grounded0) h.hov = K.HOVER;
    // 落ちる速さ
    const vu2 = dot(v, gu); if (vu2 < -K.MAXFALL && h.pound !== 1) v = add(sub(v, mul(gu, vu2)), mul(gu, -K.MAXFALL));
    // かべすべり
    if (h.wt > 0 && !grounded0 && dot(v, gu) < -4 && h.pound !== 1) v = add(sub(v, mul(gu, dot(v, gu))), mul(gu, -4));
    // ---- 動かす ----
    let x = h.x.slice(); const mvLen = len(v) * DT, nsub = clamp(Math.ceil(mvLen / 0.3), 1, 16), hh = DT / nsub, ct = [];
    const crs = []; for (const i of S.act) { const e = L.ents[i]; if (e.k === 'crate' && !S.e[i]) crs.push({ p: S.ep[i], r: 0.7, i }); }
    const fv = grounded0 && !jumped ? gv : [0, 0, 0];
    for (let s = 0; s < nsub; s++) { x[0] += v[0] * hh; x[1] += v[1] * hh; x[2] += v[2] * hh; collide(S, x, v, fv, ct, crs); }
    // 接触の整理
    let ground = null, wall = null, ceil = false, lava = false;
    for (const c of ct) {
      const du = dot(c.n, gu);
      if (du > 0.55) { if (!ground || du > ground.du) ground = { i: c.i, n: c.n, du }; }
      else if (du > -0.4) { wall = c; }
      else ceil = true;
      if (c.i >= 0 && SURF[L.bodies[c.i].surf] && SURF[L.bodies[c.i].surf].hurt) lava = true;
    }
    if (jumped) ground = null;
    // 地面にくっつく（なだらかに曲がった面・角をまわる）
    if (!ground && grounded0 && !jumped && dot(v, gu) < 3) {
      const r = sdfW(S, h.on, x), gap = r[0] - HR;
      if (gap > K.SKIN && gap < 0.32) { const n = [r[1], r[2], r[3]]; x = sub(x, mul(n, gap)); if (dot(n, gu) > 0.3) ground = { i: h.on, n, du: dot(n, gu) }; }
    }
    h.x = x;
    if (ground && ground.i >= 0) {
      const landed = h.on < 0, hv = h.pound === 1;
      if (h.on !== ground.i) { // 着地、または別の体へ：その体の速さを引く（前の体の速さは足す）
        if (h.on >= 0) v = add(v, gv); const gvl = bodyVelAt(S, ground.i, sdfW(S, ground.i, x)[4]); v = sub(v, gvl); }
      if (landed) {
        h.aj = 0; h.as = 0; h.jh = 0;
        const imp = h.air; if (imp > 0.15) S.ev.push(['land', x[0], x[1], x[2], imp]);
        if (hv) { h.pound = 2; h.pt = K.POUND_STUN; S.cnt.pound++; S.ev.push(['pound', x[0], x[1], x[2]]); poundHit(S); }
      }
      h.on = ground.i; h.gn = ground.n; h.air = 0;
    } else {
      if (h.on >= 0) { v = add(v, gv); } // 歩いて落ちた：勢いはそのまま
      h.on = -1; h.air += DT;
      if (ground && ground.i < 0) { h.cy = K.COYOTE; h.air = 0; h.aj = 0; h.as = 0; }
      if (h.pound === 1 && ct.length && !ground) h.pound = 0; // かべにあたった
    }
    if (ceil && dot(v, gu) > 0) v = sub(v, mul(gu, dot(v, gu)));
    if (wall && !ground) { h.wn = wall.n; h.wt = K.WALL_T; }
    h.v = v; h.sp = len(v);
    h.hov = h.on >= 0 ? K.HOVER : h.hov;
    if (lava && h.inv <= 0) { hurt(S, null, true); h.v = add(h.v, mul(gu, 9)); }
    // 何かに当たる・ひろう
    pickups(S);
    { S.gate = -1; for (const i of S.act) { const e = L.ents[i]; if (e.k === 'gate' && h.on >= 0 && len(sub(h.x, S.ep[i])) < 2.4) { S.gate = i; break; } } }
    if (h.spin > 0) spinHit(S);
    if (S.boss) bossStep(S);
    // 空に出てしまった
    { const dd = nearestD(S, h.x); if (dd > K.VOID) voidOut(S); }
    camStep(S, inp, mag2);
    return S;
  }
  function moveBodies(S) { for (let i = 0; i < S.L.bodies.length; i++) { S.xp[i] = S.xf[i]; S.xf[i] = S.L.bodies[i].mv.length ? xfAt(S.L.bodies[i], S.t + DT) : S.xf[i]; } }
  function nearestD(S, x) { let d = 1e9; for (let i = 0; i < S.L.bodies.length; i++) { if (!S.bOn[i]) continue; const f = S.xf[i], b = S.L.bodies[i]; const c = len(sub(x, f.p)) - b.br; if (c > d + 60) continue; const r = sdfW(S, i, x)[0]; if (r < d) d = r; } return d; }
  function voidOut(S) {
    const h = S.h; S.ev.push(['void', h.x[0], h.x[1], h.x[2]]);
    if (!S.as.nofall) { h.hp -= 1 + (S.dif >= 3 ? 9 : 0); S.cnt.hurt++; }
    if (h.hp <= 0) { h.hp = S.hpMax; S.cnt.die++; if (S.cnt.die >= S.lives) { finish(S, false, 'ko'); return; } }
    respawn(S);
  }
  // 打ち上げ（星・大砲・パイプ）
  function startLaunch(S, i) {
    const e = S.L.ents[i], h = S.h, p0 = S.ep[i], up = entUp(S, i);
    let tp = e.to.p; if (e.to.b != null) tp = e.to.b;
    h.lau = { i, t: 0, p0: p0.slice(), u: up.slice(), T: e.T || 1.4, pre: e.mode === 'cannon' ? 0.55 : e.mode === 'pipe' ? 0.25 : 0.12, arc: e.arc == null ? 7 : e.arc, last: p0.slice() };
    h.x = p0.slice(); h.v = [0, 0, 0]; h.on = -1; h.pound = 0; h.spin = 0; h.lcd = 1.0; S.cnt.launch++; S.ev.push(['launch', p0[0], p0[1], p0[2], e.mode === 'cannon' ? 1 : e.mode === 'pipe' ? 2 : 0]);
  }
  function launchTarget(S, e) { if (e.to.b != null) return bodyAt(S, e.to.b, e.to.l); return e.to.p; }
  function launchStep(S, lau) {
    const h = S.h, e = S.L.ents[lau.i]; lau.t += DT; h.inv = Math.max(h.inv, 0.2);
    const sRaw = (lau.t - lau.pre) / lau.T, s = clamp(sRaw, 0, 1);
    if (sRaw < 0) { h.x = lau.p0.slice(); h.v = [0, 0, 0]; h.vis = e.mode === 'pipe' ? 0 : 1; return; }
    const tp = launchTarget(S, e), ease = s * s * (3 - 2 * s), np = add(add(lau.p0, mul(sub(tp, lau.p0), ease)), mul(lau.u, lau.arc * 4 * s * (1 - s)));
    h.v = mul(sub(np, h.x), 1 / DT); h.x = np; h.vis = 1; h.on = -1;
    const g = gravAt(S, h.x, h.gb); h.gb = g.i; if (g.up) h.up = slerpN(h.up, g.up, 1 - Math.exp(-8 * DT));
    if (s >= 1) { h.lau = null; h.lcd = 0.8; h.v = mul(h.v, 0.6); h.inv = Math.max(h.inv, 0.5); }
  }
  function spinHit(S) {
    const h = S.h, L = S.L;
    const fire = h.pw && h.pw.k === 'fire', R0 = K.SPIN_R * (fire ? 1.6 : 1);
    for (const i of S.act) {
      const e = L.ents[i]; if (S.e[i]) continue;
      if (e.k === 'walker' || e.k === 'crate') { const p = S.ep[i]; if (len(sub(p, h.x)) < R0 + (e.k === 'crate' ? 0.5 : 0.2)) hitEnt(S, i, 'spin'); }
      else if (e.k === 'spike' && fire && S.ep[i] && len(sub(S.ep[i], h.x)) < R0 + 0.4) { S.e[i] = 1; S.ev.push(['melt', S.ep[i][0], S.ep[i][1], S.ep[i][2]]); }
    }
    if (S.boss && S.boss.st === 'stun') { const bp = bossPos(S); if (len(sub(bp, h.x)) < R0 + 1.6) bossHit(S); }
  }
  function poundHit(S) {
    const h = S.h, L = S.L;
    for (const i of S.act) { const e = L.ents[i]; if (S.e[i]) continue; if (e.k === 'walker' || e.k === 'crate') { if (len(sub(S.ep[i], h.x)) < K.POUND_R) hitEnt(S, i, 'pound'); } }
    if (S.boss && S.boss.st === 'stun') { const bp = bossPos(S); if (len(sub(bp, h.x)) < K.POUND_R + 1.6) bossHit(S); }
  }
  function hitEnt(S, i, how) {
    const e = S.L.ents[i], p = S.ep[i]; S.e[i] = 1;
    if (e.k === 'walker') { S.cnt.kill++; S.cnt.coin += 1; S.ev.push(['kill', p[0], p[1], p[2], how === 'stomp' ? 1 : 0]); }
    else if (e.k === 'crate') {
      S.ev.push(['crate', p[0], p[1], p[2]]);
      if (e.drop === 'heart') { S.h.hp = Math.min(S.hpMax, S.h.hp + 1); S.ev.push(['heart', p[0], p[1], p[2]]); }
      else if (e.drop === 'bee' || e.drop === 'spring' || e.drop === 'cloud' || e.drop === 'skate' || e.drop === 'fire' || e.drop === 'shield') givePower(S, e.drop, p);
      else { S.cnt.coin += 3; S.ev.push(['coin', p[0], p[1], p[2]]); }
    }
  }
  function givePower(S, k, p) { const ck = 'p' + k.slice(0, 2); S.cnt[ck] = (S.cnt[ck] || 0) + 1; S.h.pw = { k, t: K.POWER_T }; S.h.hov = K.HOVER; S.h.aj = 0; S.ev.push(['power', p[0], p[1], p[2], k]); }
  function pickups(S) {
    const h = S.h, L = S.L;
    for (const i of S.act) {
      if (S.e[i]) continue; const e = L.ents[i]; if (e.req && !S.flag[e.req]) continue;
      const p = S.ep[i]; if (!p) continue; const d = len(sub(p, h.x));
      switch (e.k) {
        case 'coin': if (d < 1.15 * DIF.pick[S.dif] + magR(S)) { S.e[i] = 1; S.cnt.coin++; S.ev.push(['coin', p[0], p[1], p[2]]); } break;
        case 'crystal': if (d < 1.3 * DIF.pick[S.dif] + magR(S)) { S.e[i] = 1; S.cnt.crystal++; S.cnt.coin += 5; S.ev.push(['crystal', p[0], p[1], p[2]]); } break;
        case 'heart': if (d < 1.3) { S.e[i] = 1; h.hp = Math.min(S.hpMax, h.hp + 1); S.ev.push(['heart', p[0], p[1], p[2]]); } break;
        case 'orb': if (d < 1.5 * DIF.pick[S.dif] + magR(S)) { S.e[i] = 1; S.cnt.orb++; S.ev.push(['orb', p[0], p[1], p[2]]); if (S.cnt.orb >= S.need.orb) { S.flag.orbs = 1; S.ev.push(['banner', 'orbs']); } } break;
        case 'lumi': if (d < 1.5 * DIF.pick[S.dif] + magR(S)) { S.e[i] = 1; S.cnt.lumi++; S.lumi |= 1 << (e.n2 || 0); S.ev.push(['lumi', p[0], p[1], p[2], e.n2 || 0]); const m = L.missions[S.mid]; if (m.kind === 'hunt' && S.cnt.lumi >= (m.lumi || 3)) finish(S, true, 'lumi'); } break;
        case 'lantern': if (d < 1.7 && S.lit.indexOf(i) < 0) { S.lit.push(i); S.ev.push(['lantern', p[0], p[1], p[2]]); if (S.lit.length >= S.need.lan) { S.flag.lanterns = 1; S.ev.push(['banner', 'lanterns']); } } break;
        case 'power': if (d < 1.5) { S.e[i] = 1; givePower(S, e.type, p); } break;
        case 'cp': if (DIF.cp[S.dif] && d < 1.8 && S.cp !== i) { S.cp = i; S.ev.push(['cp', p[0], p[1], p[2]]); } break;
        case 'shard': if (d < 1.7) { S.e[i] = 1; S.ev.push(['shard', p[0], p[1], p[2]]); const m = L.missions[S.mid]; if (m.kind !== 'hunt' && (!m.shard || m.shard === e.id)) finish(S, true, 'shard'); } break;
        case 'launch': if (d < DIF.launchR[S.dif] && !h.lau && h.lcd <= 0 && S.h.dead === 0) startLaunch(S, i); break;
        case 'pad': if (d < 1.4 && h.lcd <= 0) { const up = entUp(S, i), v = h.v; h.v = add(sub(v, mul(up, dot(v, up))), mul(up, e.power || 20)); h.on = -1; h.lcd = 0.3; h.jh = 0; S.ev.push(['pad', p[0], p[1], p[2]]); } break;
        case 'spike': if (d < 0.95 + DIF.sp[S.dif]) hurt(S, p, true); break;
        case 'walker': if (d < K.ENEMY_R + 0.2 + DIF.er[S.dif]) {
          const up = h.up, rel = dot(sub(h.x, p), up), vu = dot(h.v, up);
          if (h.spin > 0 || h.pound === 1) hitEnt(S, i, h.spin > 0 ? 'spin' : 'pound');
          else if (rel > 0.45 && vu < -1) { hitEnt(S, i, 'stomp'); S.cnt.stomp++; h.v = add(sub(h.v, mul(up, vu)), mul(up, (S.pb & B.J) ? 11 : 8)); h.on = -1; h.aj = 0; h.as = 0; }
          else hurt(S, p);
        } break;
        default: break;
      }
    }
  }
  // ---------- ボス：グツグツおうさま ----------
  function bossHit(S) {
    const bo = S.boss; if (bo.st !== 'stun') return; bo.hp--; bo.flash = 0.7; bo.st = bo.hp <= 0 ? 'dead' : 'hurt'; bo.t = bo.hp <= 0 ? 2.2 : 0.9; S.cnt.hit++;
    const p = bossPos(S); S.ev.push([bo.hp <= 0 ? 'boom' : 'bosshit', p[0], p[1], p[2]]);
    if (bo.hp <= 0) { S.flag.boss = 1; S.ev.push(['banner', 'boss']); }
  }
  function geod(a, b) { return Math.acos(clamp(dot(a, b), -1, 1)); }
  function bossStep(S) {
    const bo = S.boss, h = S.h, L = S.L, e = L.ents[bo.i], b = L.bodies[e.bi], R = b.r;
    bo.t -= DT; bo.flash = Math.max(0, bo.flash - DT);
    const hq = norm(mtv(S.xf[e.bi].R, sub(h.x, S.xf[e.bi].p)));
    const slow = 1;
    if (bo.st === 'walk') {
      bo.off = 0; const ang = geod(bo.d, hq), step = Math.min(ang, ((e.spd || 0.42) * DIF.boss[S.dif] + (e.spd ? 0.025 : 0.12) * (bo.hp0 - bo.hp)) * DT * slow);
      if (ang > 1e-4) bo.d = norm(add(mul(bo.d, Math.cos(step)), mul(norm(sub(hq, mul(bo.d, dot(hq, bo.d)))), Math.sin(step))));
      if (bo.t <= 0) { bo.st = 'jump'; bo.t = 1.15 * DIF.tele[S.dif]; bo.t0 = bo.t; bo.from = bo.d.slice(); bo.tg = hq.slice(); S.ev.push(['bosswarn']); }
    } else if (bo.st === 'jump') {
      const s = 1 - bo.t / bo.t0, ang = geod(bo.from, bo.tg), sn = Math.sin(ang) || 1e-6;
      const w0 = Math.sin((1 - s) * ang) / sn, w1 = Math.sin(s * ang) / sn; bo.d = ang > 1e-4 ? norm(add(mul(bo.from, w0), mul(bo.tg, w1))) : bo.from.slice(); bo.off = 7 * 4 * s * (1 - s);
      if (bo.t <= 0) { bo.st = 'land'; bo.t = 0.9; bo.off = 0; bo.ring = 0; bo.d = bo.tg.slice(); const p = bossPos(S); S.ev.push(['bosslang', p[0], p[1], p[2]]); }
    } else if (bo.st === 'land') {
      const lost = bo.hp0 - bo.hp, eh = bo.hp - bo.xh; bo.nr = 1 + (e.dblAt != null && eh <= e.dblAt ? 1 : 0) + (e.triAt != null && eh <= e.triAt ? 1 : 0) + (e.dbl ? 1 : 0); if (bo.nr > 3) bo.nr = 3; bo.ring += (e.rs || 12) * DIF.boss[S.dif] * (1 + 0.04 * lost) * DT;
      { const rr = len(sub(h.x, S.xf[e.bi].p)) || R, dist = geod(bo.d, hq) * rr, height = rr - R - HR;
        let hit = false; for (let k = 0; k < bo.nr; k++) if (bo.ring - 5 * k > 0.4 && Math.abs(dist - (bo.ring - 5 * k)) < 0.9) hit = true; if (hit && height < 0.8) hurt(S, bossPos(S)); }
      if (bo.t <= 0) { bo.st = 'stun'; bo.t = Math.max(1.6, ((e.stun || 5) - 0.25 * lost) * DIF.stun[S.dif]); bo.ring = -1; }
    } else if (bo.st === 'stun') {
      if (bo.t <= 0) { bo.st = 'walk'; bo.t = 3.2 + rnd(S) * 1.2; }
    } else if (bo.st === 'hurt') {
      if (bo.t <= 0) { bo.st = 'walk'; bo.t = 2.4 + rnd(S); }
    } else if (bo.st === 'dead') {
      if (bo.t <= 0) bo.st = 'gone';
    }
    // 歩きまわっているあいだに、体にふれる
    if (bo.st === 'walk' || bo.st === 'jump') { const p = bossPos(S); if (len(sub(p, h.x)) < 1.6 + HR + 0.2) hurt(S, p); }
    else if (bo.st === 'land') { const p = bossPos(S); if (len(sub(p, h.x)) < 1.5 + HR) hurt(S, p); }
    // 気絶中にふんづける
    if (bo.st === 'stun' && h.pound === 0) { const p = bossPos(S); if (len(sub(p, h.x)) < 1.6 + HR + 0.2 && dot(sub(h.x, p), h.up) > 0.9 && dot(h.v, h.up) < -1) { bossHit(S); h.v = add(sub(h.v, mul(h.up, dot(h.v, h.up))), mul(h.up, 11)); h.on = -1; } }
  }
  // ---------- カメラ ----------
  function camStep(S, inp, mag) {
    const c = S.cam, h = S.h; const lx = inp.lx || 0, ly = inp.ly || 0;
    c.up = slerpN(c.up, h.up, 1 - Math.exp(-5 * DT));
    let fw = projT(c.fw, c.up); if (!len(fw)) fw = perp(c.up);
    if (Math.abs(lx) > 0.01) { fw = rodr(fw, c.up, -lx * 2.6 * DT * (inp.sens || 1)); c.man = 1.2; }
    if (Math.abs(ly) > 0.01) { c.pitch = clamp(c.pitch + ly * 1.5 * DT * (inp.sens || 1), -0.12, 1.25); c.man = 1.2; }
    c.man = Math.max(0, c.man - DT);
    if (c.man <= 0) c.pitch += (0.42 - c.pitch) * Math.min(1, 0.6 * DT);
    if (c.man <= 0 && inp.auto !== 0 && h.on >= 0 && !h.lau && mag > 0.35 && Math.abs(inp.sx || 0) < 0.55) { // 進む向きにゆっくりむく
      const hv = projT(h.v, c.up); if (len(hv) && len(h.v) > 2) { const a = Math.acos(clamp(dot(fw, hv), -1, 1)); if (a > 0.02) { const sgn = dot(cross(fw, hv), c.up) >= 0 ? 1 : -1; fw = rodr(fw, c.up, sgn * Math.min(a, a * 1.3 * DT + 0.2 * DT)); } }
    }
    c.fw = fw;
  }
  // カメラの位置（まわりの体にめりこまないよう手前にひく）
  function camPose(S, dist, pitch) {
    const c = S.cam, h = S.h, up = c.up, fw = projT(c.fw, up), p = pitch == null ? c.pitch : pitch;
    const dir = add(mul(fw, -Math.cos(p)), mul(up, Math.sin(p))); const tgt = add(h.x, mul(up, 0.7));
    let dd = dist || 7.5;
    // 手前からカメラの位置まで、少しずつ進んで、体にぶつかる手前でとめる（めりこまない・遮られない）
    for (let t = 0.8; t <= dd; t += 0.35) { const pos = add(tgt, mul(dir, t)); let hit = false; for (let i = 0; i < S.L.bodies.length; i++) { if (!S.bOn[i]) continue; const f = S.xf[i], b = S.L.bodies[i]; if (len(sub(pos, f.p)) > b.br + 3) continue; if (sdfW(S, i, pos)[0] < 0.6) { hit = true; break; } } if (hit) { dd = Math.max(1.8, t - 0.5); break; } }
    return { pos: add(tgt, mul(dir, dd)), tgt, fw: norm(sub(tgt, add(tgt, mul(dir, dd)))), up, dist: dd };
  }
  // スティックの「あそび」と曲がり：dz 以下は 0、そこから 1 までをなめらかに（小さく倒すとゆっくり歩く）
  function stickCurve(x, y, dz) { dz = dz == null ? 0.12 : dz; const m = Math.hypot(x, y); if (m <= dz) return [0, 0]; const k = Math.pow(Math.min(1, (m - dz) / (1 - dz)), 1.25) / m; return [x * k, y * k]; }
  // 入力の記録（B をビット、sx・sy を -8〜8 の整数に）
  function quant(inp) { return { sx: Math.round(clamp(inp.sx || 0, -1, 1) * 8) / 8, sy: Math.round(clamp(inp.sy || 0, -1, 1) * 8) / 8, b: inp.b | 0, lx: 0, ly: 0 }; }
  function pack(inp) { return ((Math.round(clamp(inp.sx || 0, -1, 1) * 8) + 8) | ((Math.round(clamp(inp.sy || 0, -1, 1) * 8) + 8) << 5) | ((inp.b & 7) << 10)); }
  function unpack(n) { return { sx: ((n & 31) - 8) / 8, sy: (((n >> 5) & 31) - 8) / 8, b: (n >> 10) & 7 }; }
  function rle(a) { const o = []; for (let i = 0; i < a.length;) { let j = i; while (j < a.length && a[j] === a[i]) j++; o.push(a[i].toString(36) + ':' + (j - i).toString(36)); i = j; } return o.join(','); }
  function unrle(s) { const o = []; if (!s) return o; for (const t of s.split(',')) { const p = t.split(':'), v = parseInt(p[0], 36), n = parseInt(p[1], 36); for (let i = 0; i < n; i++) o.push(v); } return o; }
  function replay(L, mid, rec, opt) { const S = create(L, mid, opt); for (let i = 0; i < rec.length && !S.over; i++) step(S, unpack(rec[i])); return S; }

  const E = { DT, HR, B, K, DIF, rank, RANK_REWARD, SURF, compile, create, clone, hash, step, sdf, sdfW, xfAt, gravAt, entPos, entUp, bossPos, camFrame, camPose, stickCurve, quant, pack, unpack, rle, unrle, replay, projT, perp, nearestD, hurt, respawn, finish, geod, vec: { add, sub, mul, dot, cross, len, norm, rodr, mv, mtv, axM, mulM, clamp, slerpN }, isOn };
  if (typeof module !== 'undefined' && module.exports) module.exports = E; else root.GalaxyEngine = E;
})(typeof window !== 'undefined' ? window : globalThis);
