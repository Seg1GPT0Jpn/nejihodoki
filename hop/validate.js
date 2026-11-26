// ぴょんぴょん冒険: the level validator. Static checks (start, goal, medals, enemies on solid ground, burrow pairs ...) plus a
// physics-based reach analysis: the real engine is run from every standing spot with a family of run/jump scripts, so a medal or the goal
// that no jump arc can ever touch is reported. (The solver in tools/hop-solve.js then proves the goal with a real input recording.)
//   HopValidate.validate(levelDef, { medals: 5 }) -> { errors: [], warnings: [], info: { reach, medals, goal } }
(function (root) {
  'use strict';
  const E = root.HopEngine || require('./engine.js');
  const TS = E.TS, T = E.T, B = E.B;

  function staticChecks(def, o, errors, warnings) {
    const rows = def.rows;
    if (rows.length !== 13) errors.push('rows: expected 13, got ' + rows.length);
    const W = Math.max.apply(null, rows.map(r => r.length));
    rows.forEach((r, i) => { if (r.length !== W) errors.push('row ' + i + ' has width ' + r.length + ', others ' + W); });
    const count = ch => rows.reduce((a, r) => a + (r.split(ch).length - 1), 0);
    if (count('P') !== 1) errors.push('needs exactly one start P (has ' + count('P') + ')');
    if (count('G') !== 1) errors.push('needs exactly one goal G (has ' + count('G') + ')');
    for (const [a, b] of [['D', 'd'], ['(', ')'], ['[', ']']]) if (count(a) !== count(b) || count(a) > 1) errors.push('burrow ' + a + b + ' must be a single pair');
    if (o.medals != null && count('m') !== o.medals) errors.push('needs exactly ' + o.medals + ' medals (has ' + count('m') + ')');
    if (def.boss) { if (count('X') !== 1) errors.push('boss level needs one boss X'); if (count('g') < 3) errors.push('boss level needs a gate'); }
    else if (count('X')) errors.push('X boss in a level without boss');
    return W;
  }

  function entityChecks(L, errors, warnings) {
    const solid = (x, y) => E.SOLID[L.t[y * L.W + x]] === 1 || L.t[y * L.W + x] === T.ONEWAY;
    const at = (x, y) => (x < 0 || x >= L.W || y < 0 || y >= L.H) ? T.AIR : L.t[y * L.W + x];
    const sx = L.start.x, sy = L.start.y;
    if (!solid(sx, sy + 1)) errors.push('start has no ground below');
    if (L.goal && !solid(L.goal.x, L.goal.y + 1)) errors.push('goal has no ground below');
    const walkers = { bug: 1, windup: 1, frog: 1, pin: 1, roller: 1, umb: 1 };
    for (const e of L.ents) {
      const t = at(e.x, e.y);
      if (t !== T.AIR && e.k !== 'cannon') errors.push('entity ' + e.k + ' at ' + e.x + ',' + e.y + ' sits inside tile ' + t);
      if (walkers[e.k] && !solid(e.x, e.y + 1)) errors.push(e.k + ' at ' + e.x + ',' + e.y + ' has no floor below');
      if ((e.k === 'drip') && !solid(e.x, e.y - 1)) warnings.push('drip at ' + e.x + ',' + e.y + ' has no ceiling');
      if (e.k === 'cannon' && e.y < 1) errors.push('cannon at the very top');
    }
    for (const cp of L.cps) if (!solid(cp.x, cp.y + 1)) errors.push('checkpoint at ' + cp.x + ' has no ground');
    if (L.W > 110 && L.cps.length < 1) warnings.push('long level without a checkpoint');
    for (const b of L.bur) if (!solid(b.x, b.y + 1)) errors.push('burrow at ' + b.x + ',' + b.y + ' has no ground');
    // a start closer than 2 tiles to a pit or an enemy is unfair
    for (const e of L.ents) if (Math.abs(e.x - sx) < 3 && e.k !== 'platH' && e.k !== 'platV') warnings.push('entity ' + e.k + ' within 3 tiles of the start');
  }

  // ---- reach analysis (engine-based)
  const SCRIPTS = (() => {
    const out = [];
    for (const dir of [0, 1, -1]) for (const run of [0, 1]) for (const pre of [0, 18, 44]) for (const jf of [0, 5, 9, 15, 24, 60]) {
      if (dir === 0 && (run || pre)) continue; out.push({ dir, run, pre, jf });
    }
    for (const dir of [1, -1]) for (const run of [0, 1]) for (const jf of [24, 60]) for (const stop of [8, 14, 22]) out.push({ dir, run, pre: 14, jf, stop });
    for (const dir of [1, -1, 0]) for (const pre of [0, 18]) for (const jf of [40, 90, 150]) out.push({ dir, run: 0, pre, jf, pulse: 1 });       // swimming strokes
    return out;
  })();
  function inputOf(sc, f, air) {
    let m = 0;
    const dirOn = sc.stop === undefined || f < sc.pre + sc.stop || !air;
    if (sc.dir > 0 && dirOn) m |= B.R; else if (sc.dir < 0 && dirOn) m |= B.L;
    if (sc.run) m |= B.RUN;
    if (f >= sc.pre && f < sc.pre + sc.jf && (!sc.pulse || (f - sc.pre) % 12 < 3)) m |= B.J;
    if (f >= sc.pre + sc.jf && sc.glide && air) m |= B.J;
    return m;
  }
  function prepare(L, gear) {
    const S = E.newState(L, { gear });
    S.en = S.en.filter(e => false);
    // platforms: stand-ins as one-way tiles along their sweep; gates open
    for (const d of L.ents) {
      const x = d.x * TS - 4, y = d.y * TS + 8;
      if (d.k === 'platH') for (let tx = Math.floor(x / TS); tx <= Math.floor((x + 56 + 40) / TS); tx++) S.mod[Math.floor(y / TS) * L.W + tx] = T.ONEWAY;
      else if (d.k === 'platV') for (let ty = Math.floor((y - 32) / TS); ty <= Math.floor(y / TS); ty++) for (let tx = Math.floor(x / TS); tx <= Math.floor((x + 40) / TS); tx++) S.mod[ty * L.W + tx] = T.ONEWAY;
      else if (d.k === 'crumble') for (let tx = Math.floor(x / TS); tx <= Math.floor((x + 40) / TS); tx++) S.mod[Math.floor(y / TS) * L.W + tx] = T.ONEWAY;
    }
    for (let i = 0; i < L.t.length; i++) if (L.t[i] === T.GATE) S.mod[i] = T.AIR;
    return S;
  }
  function reach(L, gear, opts) {
    opts = opts || {};
    const base = prepare(L, gear), nodes = new Map(), q = [];
    let med = 0, goal = false, coins = 0;
    const key = (tx, ty) => ty * L.W + tx;
    const solidBelow = (S, tx, ty) => { const t = E.tl(S, tx, ty + 1); return E.SOLID[t] === 1 || t === T.ONEWAY; };
    function addNode(tx, ty) { const k = key(tx, ty); if (!nodes.has(k)) { nodes.set(k, [tx, ty]); q.push([tx, ty]); } }
    const rings = [];
    for (let y = 0; y < L.H; y++) for (let x = 0; x < L.W; x++) if (L.t[y * L.W + x] === T.RING) rings.push([x, y]);
    const markedRing = new Set();
    function markRing(rg) { // a ring you can grab leads to every ring within a swing and to every spot near it
      const k = key(rg[0], rg[1]); if (markedRing.has(k)) return; markedRing.add(k);
      for (const r2 of rings) if (Math.hypot(r2[0] - rg[0], r2[1] - rg[1]) < 7.5) markRing(r2);
      for (const nd of allStand(L, base)) if (Math.hypot(nd[0] - rg[0], nd[1] - rg[1]) < 8 && nd[1] >= rg[1]) addNode(nd[0], nd[1]);
    }
    addNode(L.start.x, L.start.y);
    while (q.length) {
      const [tx, ty] = q.shift();
      // burrow: stepping onto a burrow mouth leads to its partner
      const bu = L.burAt[ty * L.W + tx]; if (bu) addNode(bu.tx, bu.ty);
      // ribbon: any rings in reach make the nearby spots reachable (optimistic model; the solver proves the real swings)
      if (gear === 3) for (const rg of rings) if (Math.hypot(rg[0] - tx, rg[1] - ty) < 6.2 && rg[1] < ty) markRing(rg);
      for (const sc of SCRIPTS) {
        if (sc.glide === undefined) sc.glide = gear === 2;
        const S = E.clone(base);
        const p = S.p; p.x = tx * TS + 3; p.y = (ty + 1) * TS - p.h; p.vx = 0; p.vy = 0; p.on = true; p.inv = 99999; p.hearts = 99; S.assist.hearts = true;
        let airborne = false, f = 0;
        for (; f < (sc.pulse ? 420 : 260); f++) {
          E.step(S, inputOf(sc, f, airborne)); S.ev.length = 0;
          if (S.res) { goal = true; break; }
          if (p.dead || p.y > L.H * TS + 4) break;
          if (!p.on) airborne = true;
          if (p.on && (airborne || f > 0)) { const ntx = Math.floor((p.x + p.w / 2) / TS), nty = Math.floor((p.y + p.h - 1) / TS); if (solidBelow(S, ntx, nty)) addNode(ntx, nty); if (airborne) break; }
          if (!airborne && f > sc.pre + sc.jf + 20) break;
        }
        med |= S.med; coins = Math.max(coins, S.coins);
        // walking and falling spots that were passed through while airborne are not nodes (only landings)
      }
    }
    return { nodes, med, goal, count: nodes.size };
  }
  const standCache = new WeakMap();
  function allStand(L, S) {
    if (standCache.has(L)) return standCache.get(L);
    const out = [];
    for (let y = 0; y < L.H - 1; y++) for (let x = 0; x < L.W; x++) {
      const t = E.tl(S, x, y), b = E.tl(S, x, y + 1);
      if (!E.SOLID[t] && t !== T.ONEWAY && (E.SOLID[b] === 1 || b === T.ONEWAY)) out.push([x, y]);
    }
    standCache.set(L, out); return out;
  }

  function validate(def, o) {
    o = o || {};
    const errors = [], warnings = [], info = {};
    const W = staticChecks(def, o, errors, warnings);
    if (errors.length) return { errors, warnings, info };
    const L = E.parse(def);
    entityChecks(L, errors, warnings);
    if (errors.length || o.fast) return { errors, warnings, info };
    const gears = [0]; const g = def.gear && E.GEAR[def.gear]; if (g) gears.push(g); else if (def.gear === undefined || def.gear === null) { /* no gear in this level */ }
    let med = 0, goal = false, count = 0;
    for (const gr of gears) { const r = reach(L, gr); med |= r.med; goal = goal || r.goal; count = Math.max(count, r.count); if (gr === 0) info.baseGoal = r.goal; }
    info.medMask = med; info.goal = goal; info.reach = count; info.medals = L.medals.length;
    if (!goal) errors.push('the goal is not reachable by any jump arc (physics analysis)');
    for (let i = 0; i < L.medals.length; i++) if (!((med >> i) & 1)) errors.push('medal ' + i + ' at ' + L.medals[i].x + ',' + L.medals[i].y + ' cannot be touched by any jump arc');
    return { errors, warnings, info };
  }
  const API = { validate, reach, SCRIPTS };
  if (typeof module === 'object' && module && module.exports) module.exports = API;
  root.HopValidate = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
