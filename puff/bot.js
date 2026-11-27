// ふわふわぱふ: a route-following bot. It plays the REAL engine (inputs only) along the `route` each stage carries, so a stage that the bot
// finishes is proven beatable; the recorded inputs are stored in proofs.js. Also used by the play tests as a quick "autoplayer".
//   const bot = PuffBot.create(def); const m = bot.step(S);   // m = input mask for this frame
(function (root) {
  'use strict';
  const E = root.PuffEngine || require('./engine.js');
  const B = E.B, T = E.T, TS = E.TS, DEF = E.DEF;
  const KIND_TILE = { r: T.ROPE, v: T.VINE, n: T.SNOW, k: T.CRACK };
  // how far from the first remaining tile of a gate to stand (px between the hero's right edge and the tile) and how to press the action button
  const STAND = { fire: 6, blade: 8, stone: 8, leaf: 22, bomb: 42, bubble: 20 };
  const TAP = { blade: 1, stone: 1, leaf: 1, bomb: 1, spark: 1, bubble: 1 };

  function create(def) {
    const route = def.route.slice();
    const bot = { deaths: 0, i: 0, stuck: 0, lastKey: '', log: [], fail: null, frames: 0, t: 0 };
    const cx = o => o.x + o.w / 2, cy = o => o.y + o.h / 2;
    function altY(S, it) {
      if (it.y !== undefined) return it.y * TS + 8;
      switch (it.alt) { case 'mid': return 8 * TS + 4; case 'tun': return 9 * TS; case 'high': return 3 * TS + 8; case 'sky': return 2 * TS; default: return null; }
    }
    // steer toward (tx, ty); ty = null: stay on the ground
    function steer(S, p, tx, ty, tol) {
      let m = 0; const dx = tx - cx(p); tol = tol || 5;
      if (Math.abs(dx) > tol) m |= dx > 0 ? B.R : B.L;
      const dir = dx > 0 ? 1 : -1;
      // blocked ahead?
      let blocked = false;
      for (const d of [p.w / 2 + 3, p.w / 2 + 9]) {
        const fx = cx(p) + dir * d, ty0 = Math.floor((p.y - 1) / TS), ty1 = Math.floor((p.y + p.h - 1) / TS);
        for (let y = ty0; y <= ty1; y++) if (E.solid(S, Math.floor(fx / TS), y)) blocked = true;
      }
      if ((ty === null || ty === undefined) && !p.swim && Math.abs(dx) > tol) {          // never walk into a pit: fly over it
        const fy = Math.floor((p.y + p.h + 2) / TS);
        for (const d of [14, 28]) { const t = E.tl(S, Math.floor((cx(p) + dir * d) / TS), fy); if (!E.SOLID[t] && t !== T.ONEWAY && t !== T.WATER && fy < S.L.H) { ty = 8 * TS + 4; break; } }
      }
      let up = blocked && Math.abs(dx) > tol;
      if (ty !== null && ty !== undefined) { if (cy(p) > ty + 5) up = true; }
      if (up && (p.on || p.flaps < E.MAXFLAP || p.swim) && p.vy > -0.9 && (S.f & 1) === 0) m |= B.J;
      if (p.swim && cy(p) > 11 * TS - 8 && p.vy > 0.1 && (S.f & 1) === 0) m |= B.J;
      return m;
    }
    function nearestFoe(S, p, ab) {
      const lim = bot.limitX === undefined ? 1e9 : bot.limitX;
      let best = null, bd = 1e9;
      for (const e of S.en) { if (e.dead || e.k === 'boss' || !DEF[e.k] || DEF[e.k].ab !== ab || e.x > lim) continue; const d = Math.abs(cx(e) - cx(p)) + Math.abs(cy(e) - cy(p)); if (d < bd) { bd = d; best = e; } }
      return best;
    }
    function acquire(S, p, ab) {
      if (p.held) { if (p.held.ab === ab) return (S.f & 1) === 0 ? B.SW : 0; return (S.f & 1) === 0 ? B.ACT : 0; }   // swallow it, or spit the wrong one
      if (p.ab && p.ab !== ab) return (S.f & 1) === 0 ? B.SW : 0;                                                   // drop the wrong ability
      const e = nearestFoe(S, p, ab);
      if (!e) return 0;                                   // its source comes back by itself after a few seconds
      const dx = cx(e) - cx(p), dy = cy(e) - cy(p), dir = dx > 0 ? 1 : -1;
      let m = 0;
      const inRange = Math.abs(dx) < 54 && Math.abs(dy) < 14 + Math.abs(dx) * 0.3;
      if (inRange && p.face !== dir) m = dir > 0 ? B.R : B.L;
      else if (inRange) { m |= B.ACT | (dir > 0 ? B.R : B.L); if (Math.abs(dx) < 16) m &= ~(B.R | B.L); if (p.puff) m &= ~B.ACT; if (p.puff && (S.f & 1) === 0) m |= B.ACT; }
      else { m |= steer(S, p, cx(e) - dir * 36, DEF[e.k].fly ? cy(e) : cy(e) - 2, 6); if (p.on && cy(p) < cy(e) - 14 && !DEF[e.k].fly) m = (m & ~(B.R | B.L)) | (dir > 0 ? B.R : B.L); }
      return m;
    }
    function remaining(S, it) {
      const tile = KIND_TILE[it.kind]; let first = null;
      for (let y = it.y1; y >= it.y0; y--) { let all = true, fx = null; for (let x = it.x0; x <= it.x1; x++) if (E.tl(S, x, y) === tile) { all = false; if (fx === null) fx = x; } if (all) return null; if (y === it.y1) first = fx; }
      return first;
    }
    function fight(S, p, it) {
      const b = S.en.find(e => e.k === 'boss' && !e.dead); if (!b) return 0;
      const want = it.ab[0];
      if (p.ab !== want) return acquire(S, p, want);
      const dx = cx(b) - cx(p), dir = dx > 0 ? 1 : -1;
      const off = { fire: 26, ice: 26, leaf: 40, bubble: 40, bomb: 46, blade: 18, spark: 14, stone: 16 }[want] || 24;
      let m = 0, ty = null;
      const flying = b.bk === 'cloud' || b.bk === 'moon';
      if (flying || b.y + b.h / 2 < p.y - 20) ty = cy(b) + (want === 'leaf' ? 0 : 0);
      if (Math.abs(dx) > off) m |= steer(S, p, cx(b) - dir * off, ty, 4);
      else { m |= dir > 0 ? B.R : B.L; if (ty !== null && cy(p) > ty + 4 && p.vy > -0.9 && (S.f & 1) === 0 && (p.on || p.flaps < E.MAXFLAP)) m |= B.J; }
      if (Math.abs(dx) < off + 20) { if (TAP[want]) { if ((S.f % 8) < 4) m |= B.ACT; } else m |= B.ACT; }
      if (ty !== null && Math.abs(cy(p) - ty) > 20 && want !== 'fire') m &= ~B.ACT;
      return m;
    }
    function useGate(S, p, it) {
      const first = remaining(S, it);
      if (first === null) return -1;
      if (it.ab.indexOf(p.ab) < 0 && p.held && it.ab.indexOf(p.held.ab) >= 0) return (S.f & 1) === 0 ? B.SW : 0;
      if (it.ab.indexOf(p.ab) < 0) { let best = null, bd = 1e9; for (const a of it.ab) { const e = nearestFoe(S, p, a); if (e) { const dd = Math.abs(cx(e) - cx(p)); if (dd < bd) { bd = dd; best = a; } } } if (!best) best = it.ab.find(a => S.en.some(e => e.k !== 'boss' && DEF[e.k] && DEF[e.k].ab === a && e.x <= it.x0 * TS)) || it.ab[0]; return acquire(S, p, best); }
      const a = p.ab, standR = first * TS - STAND[a] - p.w / 2 - 0;       // hero center x
      const dx = standR - cx(p);
      let m = 0;
      if (Math.abs(dx) > 3) { m |= dx > 0 ? B.R : B.L; if (dx > 0 || true) { /* walk */ } if ((p.face > 0) !== (dx > 0)) m |= 0; return m | steer(S, p, standR, null, 3); }
      if (p.face < 0) return B.R;                                           // face the gate
      if (TAP[a]) { if ((S.f % 8) < 4) m |= B.ACT; } else m |= B.ACT;
      return m;
    }
    bot.step = function (S) {
      bot.frames++;
      const p = S.ps[0];
      if (S.deaths !== bot.deaths) { bot.deaths = S.deaths; let k = 0; route.forEach((r, j) => { if (r.t === 'go' && r.x * TS <= p.x + 8) k = j; }); for (let b = 0; b < 3 && k > 0 && route[k].t !== 'get'; b++) if (route[k - 1].t === 'get') { k--; break; } else if (route[k - 1].t === 'go') break; else k--; bot.i = Math.min(bot.i, k); }
      if (p.dead) return 0;
      if (p.hp <= 3 && !p.held) { let h = null, hd = 260; for (const it2 of S.it) if (it2.k === 'heart' && !it2.gone) { const dd = Math.abs(it2.x - p.x); if (dd < hd) { hd = dd; h = it2; } } if (h) return steer(S, p, h.x + 5, h.y + 5, 3); }
      let it = route[bot.i];
      while (it) {
        const key = bot.i + ':' + it.t;
        bot.limitX = (it.t === 'use' || it.t === 'water') ? it.x0 * TS : undefined;
        let m = null;
        if (it.t === 'go') {
          const ty = altY(S, it), tx = it.x * TS + 8;
          if (Math.abs(cx(p) - tx) < 9 && (it.alt !== 'low' || p.on) && (ty === null || !(it.y !== undefined || it.alt === 'high' || it.alt === 'sky') || Math.abs(cy(p) - ty) < 14)) { bot.i++; it = route[bot.i]; continue; }
          m = steer(S, p, tx, ty, 6);
          if (it.vf && cy(p) > ty + 10) m &= ~(B.L | B.R);
          if (it.alt === 'low' && ty === null && !p.on && p.puff) m &= ~B.J;
        } else if (it.t === 'get') {
          if (p.ab === it.ab) { bot.i++; it = route[bot.i]; continue; }
          m = acquire(S, p, it.ab);
        } else if (it.t === 'use') {
          const r = useGate(S, p, it); if (r === -1) { bot.i++; it = route[bot.i]; continue; } m = r;
        } else if (it.t === 'water') {
          const want = it.want || p.ab;
          if (p.ab !== want) m = acquire(S, p, want);
          else if (cx(p) > (it.x1 + 1) * TS + 4) { bot.i++; it = route[bot.i]; continue; }
          else if (want === 'ice') {
            const f = Math.floor((p.x + p.w + 3) / TS);
            if (E.tl(S, f, 11) === T.WATER && E.tl(S, Math.floor((p.x + p.w / 2) / TS), 11) !== T.WATER) m = B.ACT | B.R;
            else m = B.R | (p.on ? 0 : 0);
            if (!p.on && p.puff) m &= ~B.J;
          } else { m = B.R; if (p.swim && cy(p) > (cx(p) > it.x1 * TS - 28 ? 11 * TS - 14 : 11 * TS - 8) && p.vy > 0.1 && (S.f & 1) === 0) m |= B.J; else if (!p.swim && cx(p) < it.x0 * TS && !p.on && cy(p) > 10 * TS && p.vy > 0.3 && (S.f & 1) === 0) m |= B.J; }
        } else if (it.t === 'sock') {
          if (E.tl(S, it.x, it.y) === T.SOCKON) { bot.i++; it = route[bot.i]; continue; }
          if (p.ab !== 'spark') m = acquire(S, p, 'spark');
          else { const sx = it.x * TS + 8, sy = it.y * TS + 8; m = steer(S, p, sx - 14, it.y === 3 ? it.y * TS + 12 : null, 3); if (Math.abs(sx - cx(p)) < 30 && Math.abs(sy - cy(p)) < 24 && (S.f % 8) < 4) m |= B.ACT; }
        } else if (it.t === 'boss') {
          if (S.bossDead) { bot.i++; it = route[bot.i]; continue; }
          m = fight(S, p, it);
        } else { bot.i++; it = route[bot.i]; continue; }
        // stuck watch
        if (bot.lastKey !== key) { bot.lastKey = key; bot.t = 0; } else if (++bot.t > 7000) { bot.fail = 'stuck at ' + bot.i + ' ' + JSON.stringify(it); }
        return m;
      }
      // route finished: go on to the goal
      const gx = (S.L.goal ? S.L.goal.x : 0) * TS + 8;
      return steer(S, p, gx, null, 4);
    };
    return bot;
  }
  const PB = { create };
  if (typeof module === 'object' && module && module.exports) module.exports = PB;
  root.PuffBot = PB;
})(typeof window !== 'undefined' ? window : globalThis);
