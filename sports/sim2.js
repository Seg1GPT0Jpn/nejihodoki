// ぽかぽか島スポーツ：リアルタイムの種目の中身（pure。画面・時計・組み込みの乱数に頼らない）。
// チャンバラ・カヌー・ラリー（卓球とテニス）・サイクリング。step(dt) を進めて、入力は関数で渡す。
// 同じ種・同じ入力なら毎回同じ。ブラウザは window.SportsSim2、node は require。
(function (root) {
  'use strict';
  const C = (typeof require === 'function' && typeof module === 'object') ? require('./core.js') : root.SportsCore;
  const { rng, hash32, clamp, gauss } = C;
  const G = 9.81, lerp = (a, b, t) => a + (b - a) * t;

  // =====================================================================================
  // チャンバラ：4方向のスワイプ（0 = ←, 1 = →, 2 = ↑, 3 = ↓）。敵のふりかぶり（矢印）と同じ向きで受け流し、すきに切りこむ
  // =====================================================================================
  const KCFG = [
    { wind: 1.35, idle: [1.1, 1.9], stag: 1.9, ehp: [3, 3, 4], perfect: 0.38 },
    { wind: 0.98, idle: [0.9, 1.6], stag: 1.6, ehp: [3, 4, 4], perfect: 0.3 },
    { wind: 0.7, idle: [0.7, 1.3], stag: 1.35, ehp: [4, 4, 5], perfect: 0.24 },
  ];
  const Kendo = {
    CFG: KCFG, DIRS: ['L', 'R', 'U', 'D'], LIMIT: 110, PHP: 5, NB: 3,
    newRun(diff, seed) {
      const cfg = KCFG[clamp(diff | 0, 0, 2)], r = rng(hash32('kendo:' + seed));
      const m = { kind: 'kendo', diff: clamp(diff | 0, 0, 2), seed, cfg, r, t: 0, bout: 0, php: Kendo.PHP, ehp: cfg.ehp[0], emax: cfg.ehp[0], score: 0, st: 'idle', tt: 0, idleDur: 0, guard: 0, gt: 0, atk: 0, wnd: 0, parried: false, whiffed: false, cd: 0, stun: 0, hits: 0, parries: 0, perfects: 0, cleared: 0, done: false, won: false, ev: [], stagPerfect: false, combo: 0 };
      Kendo._idle(m); return m;
    },
    _idle(m) { m.st = 'idle'; m.tt = 0; m.gt = 0; m.guard = (m.r() * 4) | 0; m.idleDur = m.cfg.idle[0] + m.r() * (m.cfg.idle[1] - m.cfg.idle[0]); },
    _push(m, type, extra) { m.ev.push(Object.assign({ type, t: m.t }, extra || {})); },
    step(m, dt) {
      if (m.done) return; m.t += dt; m.cd = Math.max(0, m.cd - dt); m.stun = Math.max(0, m.stun - dt); m.tt += dt;
      if (m.t >= Kendo.LIMIT) { m.done = true; Kendo._push(m, 'timeup'); return; }
      if (m.st === 'idle') {
        m.gt += dt; if (m.gt >= 0.75) { m.gt = 0; m.guard = (m.guard + 1 + ((m.r() * 3) | 0)) % 4; }
        if (m.tt >= m.idleDur) { m.st = 'windup'; m.tt = 0; let a = (m.r() * 4) | 0; if (a === m.atk && m.r() < 0.6) a = (a + 1 + ((m.r() * 3) | 0)) % 4; m.atk = a; m.wnd = m.cfg.wind * (1 - 0.05 * m.bout); m.parried = false; m.whiffed = false; Kendo._push(m, 'windup', { dir: a }); }
      } else if (m.st === 'windup') {
        if (m.tt >= m.wnd) {
          m.php--; m.stun = 0.7; m.combo = 0; Kendo._push(m, 'hurt', { php: m.php });
          if (m.php <= 0) { m.done = true; m.won = false; Kendo._push(m, 'lose'); return; }
          m.st = 'recover'; m.tt = 0;
        }
      } else if (m.st === 'recover') { if (m.tt >= 0.55) Kendo._idle(m); }
      else if (m.st === 'stagger') { if (m.tt >= (m.stagPerfect ? m.cfg.stag * 1.3 : m.cfg.stag)) Kendo._idle(m); }
      else if (m.st === 'ko') {
        if (m.tt >= 1.3) {
          if (m.bout >= Kendo.NB) { m.done = true; m.won = true; Kendo._push(m, 'win'); return; }
          m.ehp = m.emax = m.cfg.ehp[Math.min(2, m.bout)] + (m.bout > 2 ? 1 : 0); Kendo._idle(m); Kendo._push(m, 'bout', { bout: m.bout });
        }
      }
    },
    // スワイプ。dir 0〜3。返す値：'parry' | 'perfect' | 'hit' | 'clank' | 'whiff' | 'wrong' | 'cd' | ''
    input(m, dir) {
      if (m.done || m.st === 'ko') return ''; if (m.stun > 0 || m.cd > 0) return 'cd'; m.cd = 0.2; dir = dir | 0;
      if (m.st === 'windup') {
        if (m.whiffed || m.parried) return 'whiff';
        if (m.tt < Math.min(0.12, m.wnd * 0.12)) { m.whiffed = true; Kendo._push(m, 'early'); return 'whiff'; }
        if (dir !== m.atk) { m.whiffed = true; Kendo._push(m, 'wrong', { dir }); return 'wrong'; }
        const perfect = m.wnd - m.tt <= m.cfg.perfect; m.parried = true; m.parries++; m.score += perfect ? 100 : 50; if (perfect) m.perfects++;
        m.st = 'stagger'; m.tt = 0; m.stagPerfect = perfect; Kendo._push(m, perfect ? 'perfect' : 'parry'); return perfect ? 'perfect' : 'parry';
      }
      if (m.st === 'idle') { if (dir === m.guard) { m.stun = 0.5; Kendo._push(m, 'clank', { dir }); return 'clank'; } return Kendo._hit(m, 1, dir); }
      if (m.st === 'recover') return Kendo._hit(m, 1, dir);
      if (m.st === 'stagger') return Kendo._hit(m, m.stagPerfect ? 2 : 1, dir);
      return '';
    },
    _hit(m, dmg, dir) {
      m.ehp = Math.max(0, m.ehp - dmg); m.hits++; m.combo++; m.score += 100 * dmg + 20 * Math.min(m.combo - 1, 4); Kendo._push(m, 'hit', { dir, dmg, ehp: m.ehp });
      if (m.ehp <= 0) { m.cleared++; m.bout++; m.score += 250 + 60 * m.php; m.st = 'ko'; m.tt = 0; Kendo._push(m, 'ko', { bout: m.bout }); }
      return 'hit';
    },
    // ボット：ちょうどよいタイミングで受けて、すきを切る
    bot(m, skill) {
      skill = skill == null ? 1 : skill;
      if (m.st === 'windup' && !m.parried && !m.whiffed && m.wnd - m.tt <= m.cfg.perfect * (0.7 + 0.25 * (1 - skill)) + 0.02) return Kendo.input(m, m.atk);
      if (m.st === 'stagger' || m.st === 'recover') return Kendo.input(m, (m.hits + m.bout) & 3);
      if (m.st === 'idle' && m.tt > 0.4 && m.stun <= 0) return Kendo.input(m, (m.guard + 1 + (m.hits & 1)) & 3);
      return '';
    },
  };

  // チャンバラ「れんぞくぎり」（たくさんの敵）と「たけ切り」：矢印の向きにすばやくスワイプして切る。切りそこねると、敵ならハートがへり、竹ならコンボが切れる
  const WCFG = [{ w0: 1.6, w1: 0.95, gap: 0.45 }, { w0: 1.25, w1: 0.7, gap: 0.38 }, { w0: 1.0, w1: 0.52, gap: 0.3 }];
  const Wave = {
    LIMIT: [60, 55, 50], HEARTS: 3,
    newRun(diff, seed, opts) { diff = clamp(diff | 0, 0, 2); const bamboo = !!(opts && opts.bamboo), r = rng(hash32('wave:' + seed + (bamboo ? 'b' : ''))); const m = { kind: 'kendowave', diff, seed, bamboo, cfg: WCFG[diff], r, t: 0, limit: Wave.LIMIT[diff], hearts: bamboo ? 99 : Wave.HEARTS, score: 0, combo: 0, maxCombo: 0, cuts: 0, miss: 0, idx: 0, foe: null, gap: 0.5, cd: 0, done: false, ev: [], perfect: 0 }; return m; },
    _spawn(m) { const k = m.idx++, dbl = k > 2 && k % 6 === 5, f = Math.min(1, m.t / m.limit), wnd = lerp(m.cfg.w0, m.cfg.w1, f) * (dbl ? 1.5 : 1); m.foe = { need: dbl ? [(m.r() * 4) | 0, (m.r() * 4) | 0] : [(m.r() * 4) | 0], got: 0, wnd, t: 0, kind: k % 4, dbl }; m.ev.push({ type: 'foe', dir: m.foe.need[0], dbl }); },
    step(m, dt) {
      if (m.done) return; m.t += dt; m.cd = Math.max(0, m.cd - dt); if (m.t >= m.limit) { m.done = true; m.ev.push({ type: 'timeup' }); return; }
      if (!m.foe) { m.gap -= dt; if (m.gap <= 0) Wave._spawn(m); return; }
      m.foe.t += dt; if (m.foe.t >= m.foe.wnd) { m.miss++; m.combo = 0; if (!m.bamboo) { m.hearts--; m.ev.push({ type: 'hurt', hearts: m.hearts }); if (m.hearts <= 0) { m.done = true; m.ev.push({ type: 'lose' }); } } else m.ev.push({ type: 'miss' }); m.foe = null; m.gap = m.cfg.gap; }
    },
    input(m, dir) {
      if (m.done || !m.foe) return ''; if (m.cd > 0) return 'cd'; const f = m.foe; if ((dir | 0) !== f.need[f.got]) { m.combo = 0; m.cd = 0.28; m.ev.push({ type: 'wrong' }); return 'wrong'; }
      f.got++; if (f.got < f.need.length) { f.t = Math.max(0, f.t - 0.25 * f.wnd); m.ev.push({ type: 'half', dir: f.need[f.got] }); return 'half'; }
      const fast = 1 - f.t / f.wnd, perfect = fast > 0.62; m.combo++; m.maxCombo = Math.max(m.maxCombo, m.combo); m.cuts++; m.score += 60 + 4 * Math.min(m.combo - 1, 10) + Math.round(fast * 40) + (f.dbl ? 50 : 0); if (perfect) m.perfect++; m.ev.push({ type: perfect ? 'perfect' : 'cut', combo: m.combo }); m.foe = null; m.gap = m.cfg.gap; return perfect ? 'perfect' : 'cut';
    },
    bot(m, skill) { skill = skill == null ? 1 : skill; if (m.foe && m.cd <= 0 && m.foe.t >= m.foe.wnd * (0.12 + 0.5 * (1 - skill))) return Wave.input(m, m.foe.need[m.foe.got]); return ''; },
  };
  Kendo.Wave = Wave;

  // =====================================================================================
  // カヌー：左右を交互にたたいて漕ぐ。リズムが合うほど力が出る。岩をよけ、CPU とレース（人が1〜2人）
  // =====================================================================================
  const CCFG = [{ len: 240, tc: 0.7, cpu: [0.62, 0.7, 0.78], rocks: 5 }, { len: 300, tc: 0.6, cpu: [0.78, 0.86, 0.93], rocks: 7 }, { len: 360, tc: 0.52, cpu: [0.9, 0.96, 1.02], rocks: 9 }];
  const Canoe = {
    CFG: CCFG, DRAG: 0.55, KICK: 1.7,
    newRun(diff, seed, humans) {
      diff = clamp(diff | 0, 0, 2); humans = clamp(humans | 0 || 1, 1, 2); const cfg = CCFG[diff], r = rng(hash32('canoe:' + seed)), rocks = [];
      let s = 38; for (let i = 0; i < cfg.rocks; i++) { s += 22 + r() * 30; if (s > cfg.len - 25) break; rocks.push({ s, x: Math.round((r() * 1.4 - 0.7) * 100) / 100 }); }
      const boats = [];
      for (let i = 0; i < 4; i++) boats.push({ i, human: i < humans, x: (i - 1.5) * 0.0, s: 0, v: 0, last: -9, lastSide: 0, q: 0, strokes: 0, fin: null, hits: 0, cs: cfg.cpu[(i - humans + 3) % 3] * (0.96 + r() * 0.08), next: 0.6 + r() * 0.5, cside: 1, perf: 0 });
      return { kind: 'canoe', diff, seed, cfg, r, t: -1.5, rocks, boats, humans, done: false, ph: r() * 6.28, ev: [], results: null };
    },
    // 人の1こぎ。side = -1（左）| 1（右）
    tap(m, i, side) {
      const b = m.boats[i]; if (!b || !b.human || b.fin != null || m.t < 0) return 0;
      const dt = m.t - b.last; if (dt < 0.14) return 0;
      const alt = b.lastSide !== 0 && side !== b.lastSide, tc = m.cfg.tc, qr = b.last < 0 ? 0.7 : clamp(1 - Math.abs(dt - tc) / (0.65 * tc), 0, 1);
      b.combo = alt && qr > 0.8 ? (b.combo || 0) + 1 : alt ? Math.max(0, (b.combo || 0) - 2) : 0; const p = Canoe.KICK * (alt ? 0.45 + 0.55 * qr : 0.3 * (0.4 + 0.6 * qr)) * (1 + Math.min(0.3, 0.03 * b.combo));
      b.v += p; b.x += -side * (alt ? 0.05 : 0.2); b.last = m.t; b.lastSide = side; b.q = qr; b.strokes++; if (qr > 0.8 && alt) b.perf++;
      m.ev.push({ type: 'stroke', boat: i, side, q: qr, alt, combo: b.combo }); return qr;
    },
    step(m, dt) {
      if (m.done) return; m.t += dt;
      if (m.t < 0) return;
      for (const b of m.boats) {
        if (b.fin != null) continue;
        if (!b.human) { // CPU：決まったリズムでこぐ
          b.next -= dt; if (b.next <= 0) { const tc = m.cfg.tc * (1.02 + (m.r() - 0.5) * 0.14); b.next += tc; b.cside = -b.cside; b.v += Canoe.KICK * (0.45 + 0.55 * clamp(b.cs - 0.1 + (m.r() - 0.5) * 0.3, 0, 1)); b.x += -b.cside * 0.05; }
          b.x += (-b.x * 0.35 + (m.r() - 0.5) * 0.6) * dt;
        }
        b.v -= Canoe.DRAG * b.v * dt; b.s += b.v * dt;
        b.x += 0.03 * Math.sin(b.s / 25 + m.ph) * dt * 2.5;
        if (b.x > 1) { b.x = 1; b.v *= 1 - 0.7 * dt * 3; } if (b.x < -1) { b.x = -1; b.v *= 1 - 0.7 * dt * 3; }
        for (const rk of m.rocks) if (b.s - b.v * dt < rk.s && b.s >= rk.s && Math.abs(b.x - rk.x) < 0.27) { b.v *= 0.45; b.hits++; m.ev.push({ type: 'rock', boat: b.i }); }
        if (b.s >= m.cfg.len) { b.fin = m.t; m.ev.push({ type: 'finish', boat: b.i, t: m.t }); }
      }
      if (m.boats.filter(b => b.human).every(b => b.fin != null) || m.t > 160) { Canoe._finish(m); }
    },
    _finish(m) {
      m.done = true;
      const est = b => (b.fin != null ? b.fin : m.t + (m.cfg.len - b.s) / Math.max(1.5, b.v));
      const order = m.boats.map(b => ({ i: b.i, t: est(b) })).sort((a, b) => a.t - b.t);
      m.results = m.boats.map(b => { const place = order.findIndex(o => o.i === b.i) + 1, T = est(b); return { i: b.i, human: b.human, time: Math.round(T * 10) / 10, place, score: Canoe.scoreOf(T, place) }; });
    },
    scoreOf(T, place) { return Math.round(12000 / Math.max(20, T)) + (place === 1 ? 40 : place === 2 ? 20 : place === 3 ? 10 : 0); },
    // ボット：リズムどおりに左右
    bot(m, i, skill) {
      const b = m.boats[i]; if (!b || b.fin != null || m.t < 0) return 0; skill = skill == null ? 1 : skill;
      const want = m.cfg.tc * (1 + (1 - skill) * 0.25); if (m.t - b.last >= want - 1e-9) {
        let side = -b.lastSide || 1; if (Math.abs(b.x) > 0.55 && skill > 0.5) side = b.x > 0 ? 1 : -1;
        // 岩がすぐ前なら、同じ側を2回たたいて横にずれる
        const rk = m.rocks.find(r => r.s > b.s + 2 && r.s < b.s + 12 && Math.abs(r.x - b.x) < 0.3);
        if (rk) side = rk.x > b.x ? 1 : -1; return Canoe.tap(m, i, side);
      } return 0;
    },
  };

  // =====================================================================================
  // ラリー（卓球とテニス）：ボールの3D の動き。スワイプで打ち返す。CPU と、または ふたりで
  // 座標：x = 横、y = 奥行き（y>0 が人（下）、y<0 が相手（上））、z = 高さ。ネットは y=0
  // =====================================================================================
  const RALLY = {
    pingpong: { W: 1.525, L: 2.74, netH: 0.1525, r: 0.02, rest: 0.9, hStar: 0.45, hTol: 0.5, zMax: 0.95, yStar: 1.0, yTol: 1.0, zone: [0.1, 2.0], run: 2.6, reach: 0.42, Tmin: 0.34, Tmax: 0.8, err: 0.3, errMin: 0.025, serveZ: 0.25, floor: -0.76, srvY: 0.55 },
    tennis: { W: 8.23, L: 23.77, netH: 0.914, r: 0.033, rest: 0.78, hStar: 0.9, hTol: 1.2, zMax: 2.2, yStar: 1.6, yTol: 3.0, zone: [-0.8, 4.2], run: 5.2, reach: 1.7, Tmin: 0.62, Tmax: 1.45, err: 3.0, errMin: 0.18, serveZ: 2.3, floor: 0, srvY: 0.8, box: 6.4 },
  };
  const RDIFF = [
    { pc: 0.9, ec: 1.9, sp: [0.2, 0.62], mv: 0.8, hv: 1.3 }, { pc: 0.96, ec: 1.15, sp: [0.25, 0.8], mv: 1.0, hv: 1.05 }, { pc: 0.995, ec: 0.7, sp: [0.3, 0.95], mv: 1.25, hv: 0.9 },
  ];
  // CPU の性格（卓球・テニス）：steady = まもり、power = つよい球でこうげき、spin = スピンと コースのうちわけ、allround = ふつう
  const PERS = { allround: {}, steady: { pcAdd: 0.03, sp: [0.2, 0.5], ecMul: 0.8, sa: 0.25 }, power: { pcAdd: -0.02, sp: [0.6, 0.98], ecMul: 1.35, sa: 0.3 }, spin: { pcAdd: 0, sp: [0.3, 0.72], ecMul: 1.0, sa: 1.4, wide: 1 } };
  const Rally = {
    P: RALLY, RD: RDIFF, PERS,
    // sport: 'pingpong' | 'tennis'。opts = { two: ふたりで }
    newMatch(sport, diff, seed, opts) {
      diff = clamp(diff | 0, 0, 2); const P = RALLY[sport], r = rng(hash32('rally:' + sport + ':' + seed));
      const target = sport === 'pingpong' ? [5, 7, 9][diff] : [2, 2, 3][diff];
      const opp = PERS[opts && opts.opp] ? opts.opp : 'allround', pr = PERS[opp], base = RDIFF[diff]; const D = { pc: clamp(base.pc + (pr.pcAdd || 0) + (opts && opts.doubles ? 0.02 : 0), 0.1, 0.996), ec: base.ec * (pr.ecMul || 1), sp: pr.sp || base.sp, mv: base.mv * (opts && opts.doubles ? 1.12 : 1), hv: base.hv, sa: pr.sa == null ? 1 : pr.sa, wide: !!pr.wide };
      const m = { kind: sport, sport, diff, opp, doubles: !!(opts && opts.doubles), net: [false, false], volleys: 0, seed, P, D, r, t: 0, target, two: !!(opts && opts.two), pts: [0, 0], games: [0, 0], gp: [0, 0], first: 0, server: 0, state: 'serve', st0: 0, ball: null, hitter: 0, bounces: 0, serveNo: 1, ev: [], rally: 0, longest: 0, done: false, winner: -1, aces: 0, px: [0, 0], whiff: [0, 0], cpuPlan: null, lastPoint: null, wonRallies: 0, pp: [0, 0] };
      Rally.prepServe(m); return m;
    },
    // サーバーの手元にボールを置く
    prepServe(m) {
      const P = m.P, s = m.server, y = (s === 0 ? 1 : -1) * (P.L / 2 + P.srvY);
      m.state = 'serve'; m.st0 = m.t; m.ball = { x: 0, y, z: P.serveZ, vx: 0, vy: 0, vz: 0, spin: 0, held: true }; m.bounces = 0; m.rally = 0; m.hitter = s; m.cpuPlan = null;
    },
    // ボールを打つ速度を決める：いまの位置 (x,y,z) から、(tx,ty) に T 秒でバウンドする。ネットをこえる T をさがす（power=1 で最短）
    solve(m, b, tx, ty, power, spin) {
      const P = m.P, g = G; const T0 = (P.Tmax - power * (P.Tmax - P.Tmin)) * (m.sport === 'pingpong' ? 1 - Math.min(0.2, (m.rally || 0) * 0.012) : 1); const sgn = b.y > 0 ? 1 : -1;
      const sh = (spin || 0) * (P.W * 0.045); // カーブで流れる分、先にずらして打つ（ボールは曲がって戻る）
      for (let T = T0, k = 0; k < 40; T += 0.03, k++) {
        const vx = (tx - sh - b.x) / T, vy = (ty - b.y) / T, vz = (P.r - b.z + 0.5 * g * T * T) / T;
        const tn = (0 - b.y) / vy; const zn = b.z + vz * tn - 0.5 * g * tn * tn;
        if (tn > 0 && tn < T && zn > P.netH + P.r + (m.sport === 'tennis' ? 0.12 : 0.025)) return { vx, vy, vz, T, spin: spin || 0, clear: true };
        if (!(tn > 0 && tn < T)) return { vx, vy, vz, T, spin: spin || 0, clear: true };
      }
      const T = P.Tmax + 0.2; return { vx: (tx - b.x) / T, vy: (ty - b.y) / T, vz: (P.r - b.z + 0.5 * g * T * T) / T, T, spin: 0, clear: false };
    },
    // 人（side=0 下、1 上）が打つ。aim = { ax（-1〜1 横）, s（0〜1 つよさ）, spin（-1〜1）}。返す値：'serve' | 'hit' | 'whiff' | ''
    swipe(m, side, aim) {
      if (m.done) return ''; const P = m.P, a = { ax: clamp(aim.ax || 0, -1, 1), s: clamp(aim.s == null ? 0.5 : aim.s, 0, 1), spin: clamp(aim.spin || 0, -1, 1), top: clamp(aim.top || 0, -1, 1) };
      if (m.state === 'serve') {
        if (m.server !== side || !m.ball.held) return ''; return Rally.doServe(m, side, a, 1);
      }
      if (m.state !== 'rally') return '';
      const vo = {}, q = Rally.quality(m, side, vo); if (q < 0) { m.whiff[side] = m.t; return 'whiff'; }
      if (vo.v) a.s = Math.min(a.s, 0.85); return Rally.doHit(m, side, a, q, 0, !!vo.v);
    },
    // いま打てるか：打てるなら 0〜1 の「ちょうどよさ」、打てないなら -1
    quality(m, side, volleyOut) {
      const P = m.P, b = m.ball; if (m.state !== 'rally' || m.hitter === side) return -1;
      if (m.bounces === 0 && m.sport === 'tennis' && m.net[side] && m.crossed && Math.sign(b.y || 1) === (side === 0 ? 1 : -1) && Math.abs(b.y) < 6.2 && b.z > 0.35 && b.z < 2.5 && Math.abs(b.x - m.pp[side]) <= P.reach * 1.6 * (m.doubles ? 1.45 : 1)) { if (volleyOut) volleyOut.v = true; return 0.5 + 0.4 * (1 - clamp(Math.abs(b.z - 1.1) / 1.4, 0, 1)); }
      if (m.bounces !== 1 || Math.sign(b.y || 1) !== (side === 0 ? 1 : -1)) return -1;
      const ay = Math.abs(b.y) - P.L / 2; if (ay < P.zone[0] || ay > P.zone[1] || b.z > P.zMax) return -1;
      const rch = P.reach * (m.doubles && side === 0 ? 1.45 : 1), g = Math.abs(b.x - m.pp[side]); if (g > rch * 1.6) return -1;
      const qh = 1 - clamp(Math.abs(b.z - P.hStar) / P.hTol, 0, 1), qy = 1 - clamp(Math.abs(ay - P.yStar) / P.yTol, 0, 1); return (0.6 * qh + 0.4 * qy) * (1 - 0.45 * clamp(g / (rch * 1.6), 0, 1));
    },
    doServe(m, side, a, tries) {
      const P = m.P, b = m.ball, sgn = side === 0 ? -1 : 1, depth = P.box ? P.box * (0.45 + 0.5 * a.s) : P.L / 2 * (0.35 + 0.55 * a.s);
      const e = P.errMin * 2 * (side === 1 && !m.two ? m.D.ec : 1);
      const tx = a.ax * P.W / 2 * 0.85 + gauss(m.r) * e, ty = sgn * depth + gauss(m.r) * e * 1.1;
      b.held = false; const sol = Rally.solve(m, b, tx, ty, a.s * 0.5, a.spin); Object.assign(b, { vx: sol.vx, vy: sol.vy, vz: sol.vz, spin: sol.spin, T: sol.T, top: a.top || 0 }); m.state = 'rally'; m.hitter = side; m.bounces = 0; m.serving = true; m.rally = 1; m.crossed = false;
      m.ev.push({ type: 'serve', side }); return 'serve';
    },
    doHit(m, side, a, q, cpu, volley) {
      const P = m.P, b = m.ball, sgn = side === 0 ? -1 : 1; const dfrac = 0.28 + 0.66 * a.s, e = (P.errMin + (1 - q) * P.err) * (0.5 + a.s) * (side === 1 && !m.two ? m.D.ec : 1);
      const tx = clamp(a.ax * P.W / 2 * 0.92, -P.W / 2 * 0.98, P.W / 2 * 0.98) + gauss(m.r) * e * 2.2, ty = sgn * (dfrac * P.L / 2) + gauss(m.r) * e * 2.4;
      const sol = Rally.solve(m, b, tx, ty, a.s, a.spin); Object.assign(b, { vx: sol.vx, vy: sol.vy, vz: sol.vz, spin: sol.spin, T: sol.T, top: a.top || 0 });
      if (m.sport === 'tennis' && !m.two) { m.net[side] = dfrac < 0.42 && side === 0 && !volley; } if (volley) m.volleys++; if (volley) m.net[side] = true;
      m.px[side] = b.x; m.hitter = side; m.bounces = 0; m.rally++; m.serving = false; m.crossed = false; m.longest = Math.max(m.longest, m.rally); m.ev.push({ type: 'hit', side, q, power: a.s }); m.cpuPlan = null; return 'hit';
    },
    inBounds(m, x, y) { return Math.abs(x) <= m.P.W / 2 + m.P.r && Math.abs(y) <= m.P.L / 2 + m.P.r; },
    step(m, dt) {
      if (m.done) return; m.t += dt; const P = m.P;
      if (m.state === 'between') { if (m.t - m.st0 > 1.15) Rally.prepServe(m); return; }
      if (m.state === 'serve') { // CPU サーブ
        if (m.server === 1 && !m.two && m.t - m.st0 > 0.9) Rally.doServe(m, 1, { ax: (m.r() - 0.5) * 1.5, s: 0.35 + m.r() * 0.4, spin: (m.r() - 0.5) * 0.8 }, 1);
        return;
      }
      Rally._move(m, dt);
      const b = m.ball, sub = 2; dt /= sub;
      for (let k = 0; k < sub; k++) { if (m.state !== 'rally') return; Rally._phys(m, b, dt); }
      if (m.state === 'rally' && !m.two) Rally._cpu(m);
      if (m.state === 'rally' && m.t - m.st0 > 40) Rally._point(m, m.hitter ^ 1, 'timeout');
    },
    // 選手が横にうごく（人も CPU も、ボールを追いかける）
    _move(m, dt) {
      const P = m.P, b = m.ball;
      for (let side = 0; side < 2; side++) {
        const toward = m.state === 'rally' && m.hitter !== side && Math.sign(b.y || 1) === (side === 0 ? 1 : -1) || (m.state === 'rally' && m.hitter !== side && b.vy * (side === 0 ? 1 : -1) > 0);
        const tgt = toward ? clamp(b.x + b.vx * 0.15, -P.W / 2, P.W / 2) : 0, sp = P.run * (side === 0 || m.two ? m.D.hv : m.D.mv);
        const d = tgt - m.pp[side]; m.pp[side] += clamp(d, -sp * dt, sp * dt);
      }
    },
    _phys(m, b, dt) {
      const P = m.P; const py = b.y, side = b.y >= 0 ? 0 : 1;
      b.vz -= G * dt; if (b.spin && m.bounces === 0) b.vx += b.spin * P.W * 0.045 * 2 / (b.T * b.T) * dt; b.x += b.vx * dt; b.y += b.vy * dt; b.z += b.vz * dt;
      // ネット
      if (py * b.y < 0 && !m.crossed) { m.crossed = true; if (b.z < P.netH + P.r * 0.5) { m.ev.push({ type: 'net' }); Rally._point(m, m.hitter ^ 1, 'net'); return; } }
      // バウンド（コートの上）
      if (b.z <= P.r && b.vz < 0) {
        const inb = Rally.inBounds(m, b.x, b.y), s2 = b.y >= 0 ? 0 : 1;
        if (!inb && m.sport === 'pingpong') { if (b.z > P.floor) return; }
        if (inb) { const tp = b.top || 0; b.z = P.r; b.vz = -b.vz * P.rest * (1 - 0.14 * tp); b.vx *= 0.96; b.vy *= 0.96 * (1 + 0.15 * tp); m.ev.push({ type: 'bounce', x: b.x, y: b.y, side: s2 }); }
        if (m.bounces === 0) {
          if (!inb) { m.ev.push({ type: 'out' }); Rally._point(m, m.hitter ^ 1, 'out'); return; }
          if (s2 === m.hitter) { Rally._point(m, m.hitter ^ 1, 'ownside'); return; }
          if (m.serving && P.box && Math.abs(b.y) > P.box) { m.ev.push({ type: 'fault' }); if (m.serveNo === 1) { m.serveNo = 2; Rally.prepServe(m); m.ev.push({ type: 'second' }); return; } Rally._point(m, m.hitter ^ 1, 'double'); return; }
          m.bounces = 1;
        } else { Rally._point(m, m.hitter, 'winner'); return; }
        if (!inb) { b.z = P.r; b.vz = Math.abs(b.vz) * P.rest; }
      }
      if (b.z < -3 || Math.abs(b.y) > P.L + 12 || Math.abs(b.x) > P.W + 12) Rally._point(m, m.hitter, 'gone');
    },
    // CPU（上）の返球：バウンドしたあと、自分の打つ線をこえたら決める
    _cpu(m) {
      const P = m.P, b = m.ball, D = m.D; if (m.hitter === 1 || m.bounces !== 1 || b.y >= 0) return;
      const ay = -b.y - P.L / 2; if (ay < P.yStar) return; // まだ線の手前
      if (!m.cpuPlan) {
        const p = m.cpuPlan = { ok: true }, sp = Math.hypot(b.vx, b.vy) / (P.L * 2.4 / (P.Tmin + P.Tmax)), wide = Math.abs(b.x - m.pp[1]) / (P.reach * 1.6);
        const ph = clamp(D.pc - 0.07 * sp - 0.15 * wide - (wide > 1 ? 1 : 0) - (m.rally > 10 ? 0.02 * (m.rally - 10) : 0), 0.15, 0.995);
        p.ok = m.r() < ph; p.q = clamp(0.35 + 0.65 * m.r() * (D.pc > 0.99 ? 1 : D.pc), 0.3, 1); p.s = D.sp[0] + m.r() * (D.sp[1] - D.sp[0]); p.ax = clamp((m.px[0] > 0 ? -1 : 1) * (0.25 + m.r() * 0.7) * (m.r() < 0.75 ? 1 : -0.6), -1, 1); p.spin = (m.r() - 0.5) * 2 * (D.sa == null ? 0.5 : D.sa * 0.5); p.top = D.sp[1] > 0.9 ? 0.5 : D.wide ? -0.3 : 0;
      }
      if (m.cpuPlan.ok && b.z <= P.zMax + 0.1) { Rally.doHit(m, 1, { ax: m.cpuPlan.ax, s: m.cpuPlan.s, spin: m.cpuPlan.spin, top: m.cpuPlan.top }, m.cpuPlan.q, 1); } else if (!m.cpuPlan.ok && ay < P.yStar - 1.2) { /* 見送り */ }
    },
    _point(m, winner, why) {
      if (m.state === 'between' || m.state === 'done') return;
      m.net = [false, false]; const rallyLen = m.rally; m.lastPoint = { winner, why, rally: rallyLen }; m.ev.push({ type: 'point', winner, why, rally: rallyLen });
      if (winner === 0 && m.serving && rallyLen <= 1 && why === 'winner') m.aces++;
      if (winner === 0) m.wonRallies++;
      if (m.sport === 'pingpong') {
        m.pts[winner]++; const w = C.ttDone(m.pts[0], m.pts[1], m.target); if (w >= 0) { m.done = true; m.winner = w; m.state = 'done'; m.ev.push({ type: 'match', winner: w }); return; }
        m.server = C.ttServer(m.pts[0], m.pts[1], m.first, m.target);
      } else {
        m.gp[winner]++; m.pts[winner]++; const gw = C.tennisGameWinner(m.gp[0], m.gp[1]);
        if (gw >= 0) { m.games[gw]++; m.gp = [0, 0]; m.ev.push({ type: 'game', winner: gw }); const sw = C.tennisSetWinner(m.games[0], m.games[1], m.target); if (sw >= 0) { m.done = true; m.winner = sw; m.state = 'done'; m.ev.push({ type: 'match', winner: sw }); return; } m.server = C.tennisServer(m.games[0] + m.games[1], m.first); }
      }
      m.serveNo = 1; m.state = 'between'; m.st0 = m.t;
    },
    // 得点の表示用
    label(m) {
      if (m.sport === 'pingpong') return { a: String(m.pts[0]), b: String(m.pts[1]), text: '' };
      const l = C.tennisLabel(m.gp[0], m.gp[1]); return { a: l.a, b: l.b, text: l.text, ga: m.games[0], gb: m.games[1] };
    },
    // 1人用のスコア
    scoreOf(m) {
      const won = m.winner === 0;
      if (m.sport === 'pingpong') return 12 * m.pts[0] + (won ? 60 : 0) + Math.min(40, 4 * m.longest);
      return 3 * m.pts[0] + 25 * m.games[0] + (won ? 50 : 0) + Math.min(30, 3 * m.longest);
    },
    // ボット（人の側）：打てる位置に来たらスワイプ
    bot(m, side, skill, r) {
      skill = skill == null ? 1 : skill; r = r || m.r; const P = m.P, b = m.ball;
      if (m.state === 'serve') { if (m.server === side && m.t - m.st0 > 0.5) return Rally.swipe(m, side, { ax: (r() - 0.5) * 1.4, s: 0.4 + r() * 0.3, spin: 0 }); return ''; }
      const q = Rally.quality(m, side); if (q < 0) return '';
      const ay = Math.abs(b.y) - P.L / 2;
      if (q >= 0.2 + 0.58 * skill + (r() - 0.5) * 0.2 || ay > P.zone[1] - 0.3) return Rally.swipe(m, side, { ax: (r() - 0.5) * (1.1 + (1 - skill)), s: 0.35 + r() * (0.5 + (1 - skill) * 0.15), spin: (r() - 0.5) * 0.6 });
      return '';
    },
  };

  // =====================================================================================
  // サイクリング：道（カーブ）・すすみ・横のゆれ。カーブでふくらむ。ブーストとコースの上の物。CPU 3人とレース
  // =====================================================================================
  const CYCFG = [{ len: 700, curv: 0.55, vmax: 11.5, cpu: [0.8, 0.86, 0.92] }, { len: 900, curv: 0.8, vmax: 12.5, cpu: [0.9, 0.95, 1.0] }, { len: 1100, curv: 1.05, vmax: 13.2, cpu: [1.0, 1.06, 1.12] }];
  const Cycling = {
    CFG: CYCFG, HALF: 1.0,
    newRun(diff, seed, opts) {
      diff = clamp(diff | 0, 0, 2); const jet = !!(opts && opts.jet), c0 = CYCFG[diff], cfg = jet ? Object.assign({}, c0, { vmax: c0.vmax * 1.22, curv: c0.curv * 1.15, len: Math.round(c0.len * 1.1) }) : c0, r = rng(hash32((jet ? 'jet:' : 'cyc:') + seed)), segs = [], obs = [];
      let s = 0; while (s < cfg.len + 120) { const l = 60 + r() * 90, c = r() < 0.32 ? 0 : (r() * 2 - 1) * cfg.curv; segs.push({ s0: s, s1: s + l, c: Math.round(c * 100) / 100, h: (r() - 0.5) * 2 }); s += l; }
      let o = 40; while (o < cfg.len - 30) { o += 18 + r() * 30; const k = r(), kind = k < 0.4 ? 'cone' : k < 0.62 ? 'puddle' : k < 0.82 ? 'boost' : 'bottle'; obs.push({ s: o, x: Math.round((r() * 1.7 - 0.85) * 100) / 100, kind, hit: false }); }
      const riders = [{ i: 0, human: true, s: 0, x: 0, v: 0, en: 0.5, boost: 0, fin: null, hits: 0, off: 0, picks: 0 }];
      for (let i = 1; i < 4; i++) riders.push({ i, human: false, s: -i * 1.2, x: 0, v: 0, fin: null, sk: cfg.cpu[i - 1] * (0.97 + r() * 0.06), ph: r() * 6.28 });
      return { kind: 'cycling', jet, draft: false, diff, seed, cfg, r, segs, obs, riders, t: -2, done: false, ev: [], results: null, u: 0, bst: false };
    },
    curvAt(m, s) { for (let i = 0; i < m.segs.length; i++) if (s < m.segs[i].s1) return m.segs[i]; return m.segs[m.segs.length - 1]; },
    // u = ハンドル（-1〜1）、boost = ブーストをおしているか
    step(m, dt, u, boost) {
      if (m.done) return; m.t += dt; if (m.t < 0) return; u = clamp(u || 0, -1, 1);
      const h = m.riders[0], cfg = m.cfg;
      if (h.fin == null) {
        const seg = Cycling.curvAt(m, h.s), off = Math.abs(h.x) > Cycling.HALF; const grade = seg.h * 0.5; let vt = cfg.vmax * (off ? 0.55 : 1) * (1 - 0.1 * grade); m.draft = false; for (let i = 1; i < 4; i++) { const c = m.riders[i], d = c.s - h.s; if (c.fin == null && d > 1.5 && d < 14 && Math.abs(c.x - h.x) < 0.6) m.draft = true; } if (m.draft) vt *= 1.08;
        const bst = !!boost && h.en > 0.02; if (bst) { vt *= 1.28; h.en = Math.max(0, h.en - 0.42 * dt); } else h.en = Math.min(1, h.en + (0.1 + (m.draft ? 0.05 : 0) + (grade < -0.2 ? 0.06 : 0)) * dt);
        if (h.boost > 0) { h.boost -= dt; vt *= 1.22; }
        h.v += (vt - h.v) * Math.min(1, dt * 1.1); const sp = h.v / cfg.vmax;
        h.x += (u * 1.7 * (0.45 + 0.55 * sp) - seg.c * h.v * 0.085) * dt; h.x = clamp(h.x, -1.45, 1.45); if (off) h.off += dt;
        const s0 = h.s; h.s += h.v * dt; m.u = u; m.bst = bst;
        for (const o of m.obs) if (!o.hit && s0 < o.s && h.s >= o.s && Math.abs(h.x - o.x) < (o.kind === 'puddle' ? 0.3 : 0.24)) {
          o.hit = true;
          if (o.kind === 'cone') { h.v *= 0.55; h.hits++; m.ev.push({ type: 'cone' }); } else if (o.kind === 'puddle') { h.v *= 0.8; h.x += (m.r() - 0.5) * 0.3; m.ev.push({ type: 'puddle' }); }
          else if (o.kind === 'boost') { h.boost = 1.6; h.v += 2; m.ev.push({ type: 'boost' }); } else { h.en = Math.min(1, h.en + 0.35); h.picks++; m.ev.push({ type: 'pick' }); }
        }
        if (h.s >= cfg.len) { h.fin = m.t; m.ev.push({ type: 'finish', boat: 0, t: m.t }); }
      }
      for (let i = 1; i < 4; i++) {
        const c = m.riders[i]; if (c.fin != null) continue; const seg = Cycling.curvAt(m, c.s);
        const vt = cfg.vmax * c.sk * (1 - 0.18 * Math.abs(seg.c) / cfg.curv) * (1 + 0.04 * Math.sin(c.s / 40 + c.ph)); c.v += (vt - c.v) * Math.min(1, dt * 1.1); c.s += c.v * dt; c.x = Math.sin(c.s / 31 + c.ph) * 0.5;
        if (c.s >= cfg.len) c.fin = m.t;
      }
      if (h.fin != null || m.t > 200) Cycling._finish(m);
    },
    _finish(m) {
      m.done = true; const cfg = m.cfg, est = (b, i) => (b.fin != null ? b.fin : m.t + Math.max(0, cfg.len - b.s) / Math.max(2, b.v || 2));
      // 人がゴールしたあと、CPU がゴールまでにかかる時間を、いまの速さで見積もる
      const t = m.riders.map((b, i) => ({ i, t: est(b, i) })).sort((a, b) => a.t - b.t);
      m.results = m.riders.map(b => { const place = t.findIndex(o => o.i === b.i) + 1, T = est(b); return { i: b.i, human: b.human, time: Math.round(T * 10) / 10, place, score: Cycling.scoreOf(T, place) }; });
    },
    scoreOf(T, place) { return Math.round(14000 / Math.max(30, T)) + (place === 1 ? 50 : place === 2 ? 30 : place === 3 ? 15 : 0); },
    // ボット：まんなかを走り、カーブのぶんを打ち消し、物をよけ、ブーストはカーブの外でつかう
    bot(m, skill) {
      skill = skill == null ? 1 : skill; const h = m.riders[0], seg = Cycling.curvAt(m, h.s + 8); let tx = 0;
      for (const o of m.obs) if (!o.hit && o.s > h.s + 1 && o.s < h.s + 14 && (o.kind === 'cone' || o.kind === 'puddle')) { if (Math.abs(o.x - tx) < 0.35) tx = o.x > 0 ? o.x - 0.5 : o.x + 0.5; }
      for (const o of m.obs) if (!o.hit && o.s > h.s + 1 && o.s < h.s + 14 && (o.kind === 'boost' || o.kind === 'bottle') && Math.abs(o.x) < 0.8 && skill > 0.5) { tx = o.x; break; }
      const need = seg.c * h.v * 0.085 / (1.7 * (0.45 + 0.55 * h.v / m.cfg.vmax)); return { u: clamp((tx - h.x) * 2.4 + need * skill, -1, 1), boost: h.en > 0.35 && Math.abs(seg.c) < 0.3 };
    },
  };

  const api = { Kendo, Canoe, Rally, Cycling, Wave };
  if (typeof module === 'object' && module.exports) module.exports = api; else root.SportsSim2 = api;
})(typeof window !== 'undefined' ? window : globalThis);
