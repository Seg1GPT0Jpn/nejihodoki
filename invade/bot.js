// ほしぞら守備隊 - a deterministic bot: used by the tests ("every campaign stage is winnable"), the title-screen demo and the tutorial hints.
//   InvadeBot.make(o) -> bot(S, playerIndex) -> { m, x }   m = input mask; o = { skill: 0.5..1 }
// It dodges bullets (look-ahead on a column grid), aims at the lowest alien in a column (healers, divers and bombers first), shoots through the gaps
// between shields, grabs capsules and bombs when there is nowhere safe to stand.
(function (root) {
  'use strict';
  const E = root.InvadeEngine || (typeof require === 'function' ? require('./engine.js') : null);
  const LV = root.InvadeLevels || (typeof require === 'function' ? require('./levels.js') : null);
  const { IN, PY, W, SHY, SCH, CELL, SCW } = E;
  const PRI = [1.0, 1.3, 1.6, 1.2, 3.2, 6, 3, 1, 1.4];

  function make(o) {
    o = o || {}; const look = o.look || 90;
    return function bot(S, pi) {
      const p = S.pl[pi || 0];
      if (!p || p.dead !== 0) return { m: 0, x: undefined };
      const sp = S.spec;
      // danger sources: [x at the base's height, time to get there, half width, weight, half duration]
      const dg = [];
      const slowK = S.slow > 0 ? 0.5 : 1;
      for (const e of S.eb) {
        if (e.y > p.y + 8) continue;
        const vy = e.vy * slowK; if (vy <= 0.01) continue;
        const t = (p.y - e.y - e.h / 2) / vy; if (t > look) continue;
        dg.push([e.x0 + e.vx * slowK * t, Math.max(0, t), e.w / 2 + (e.k === 1 ? 5 : 0) + (e.k === 3 ? 1 : 0), 1, (e.h + 8) / (2 * vy)]);
      }
      for (const a of S.al) if (a.alive && a.st === 1 && a.y < p.y + 6) { const t = (p.y - a.y) / 1.25; if (t < look) dg.push([a.x, Math.max(0, t), 17, 1, 7]); }
      for (const m of S.mn) { const t = (p.y - m.y) / (m.vy || 0.5); if (t > -10 && t < look) dg.push([m.x + m.vx * t, Math.max(0, t), 11, 1, 10]); }
      if (S.bm) { const b = S.bm; if (b.t < 70) dg.push([b.x, Math.max(0, 40 - b.t), b.w / 2 + 8, b.t < 40 ? 0.4 : 4, b.t < 40 ? 30 : 12]); }
      const SPD = p.sp * 0.98;
      const danger = x => {
        let d = 0; const dir = x >= p.x ? 1 : -1, dist = Math.abs(x - p.x);
        for (const g of dg) {
          const w = g[2] + p.hw + 2;
          for (let k = -1; k <= 1; k++) {
            const t = g[1] + k * g[4]; if (t < 0) continue;
            const pos = p.x + dir * Math.min(dist, SPD * t);
            if (Math.abs(g[0] - pos) < w) { d += g[3] * (1 + 6 / (g[1] + 6)); break; }
          }
        }
        return d;
      };
      // targets
      const lead = (t) => { const iv = Math.max(1, S.mt > 0 ? Math.floor(sp.mi + (sp.bi - sp.mi) * Math.max(0, Math.min(1, S.ga / S.gt))) : sp.bi); return S.dir * sp.sx * Math.floor(t / iv) * 0.6; };
      const tg = [];
      const cols = {};
      for (const a of S.al) if (a.alive && a.st !== 2 && a.y > 0) { const k = a.c; if (!cols[k] || a.y > cols[k].y) cols[k] = a; }
      for (const k of Object.keys(cols)) {
        const a = cols[k], t = (p.y - a.y) / 6.2, px = a.st === 0 ? a.x + lead(t) : a.x;
        let v = PRI[a.t] + a.r * 0.15 + Math.max(0, a.y - 100) * 0.02;
        for (const q of S.al) if (q.alive && q.t === 5 && Math.abs(q.c - a.c) <= 1 && Math.abs(q.r - a.r) <= 1) v += 1;
        tg.push([px, v, 5.5]);
      }
      for (const m of S.mn) if (m.y > 20) tg.push([m.x + m.vx * ((p.y - m.y) / 6.2), 2.5 + m.y * 0.01, 7]);
      if (S.sau && S.sau.x > 0 && S.sau.x < W) { const t = (p.y - S.sau.y) / 6.2; tg.push([S.sau.x + S.sau.vx * t, 3.2, 8]); }
      const bo = S.boss;
      if (bo && !bo.dead && bo.y > 20) { const t = (p.y - bo.y) / 6.2; tg.push([bo.x + (S.boss.t > 0 ? Math.cos(bo.t * LV.BOSS[bo.k].spd) * (W / 2 - 34) * LV.BOSS[bo.k].spd * t : 0), 9, 20]); }
      const blocked = x => { for (let y = SHY; y < SHY + SCH * CELL; y += 2) if (E.shAt(S, x, y)) return true; return false; };
      let best = p.x, bc = 1e9, minD = 1e9, bestV = 0;
      const step = 3;
      for (let x = 10; x <= W - 10; x += step) {
        const d = danger(x), blk = blocked(x);
        let v = 0;
        if (!blk) { for (const t of tg) if (Math.abs(t[0] - x) < t[2]) { v = Math.max(v, t[1]); } }
        // capsules
        for (const c of S.caps) if (c.y > p.y - 150 && Math.abs(c.x - x) < 8) v += 5 + (c.y - (p.y - 150)) * 0.02;
        const cost = d * 100 - v * 6 + Math.abs(x - p.x) * 0.12 + (blk ? 1.5 : 0);
        if (d < minD) minD = d;
        if (cost < bc) { bc = cost; best = x; bestV = v; }
      }
      let m = 0;
      const dx = best - p.x;
      if (dx > 1.6) m |= IN.R; else if (dx < -1.6) m |= IN.L;
      if (S.phase === 'play') {
        m |= IN.FIRE;
        // emergency bomb: nowhere to stand, or the invasion line is close
        let low = 0; for (const a of S.al) if (a.alive && a.st === 0 && a.y > low) low = a.y;
        if (p.bb > 0 && p.inv <= 0 && (minD >= 2.2 || low > E.INV - 26 || (bo && !bo.dead && bo.hp < 12 && bo.hp > 3 && S.eb.length > 6))) m |= IN.BOMB;
      }
      return { m, x: undefined };
    };
  }

  // convenience: play a whole game with the bot. Returns { S, frames }.
  function play(S, o) {
    o = o || {}; const bot = make(o), max = o.max || 60 * 60 * 6;
    let n = 0; const one = (S2) => { if (S2.np === 2) { const a = bot(S2, 0), b = bot(S2, 1); E.step(S2, a.m, b.m); } else { const a = bot(S2, 0); E.step(S2, a.m, 0); } };
    while (S.phase !== 'over' && S.phase !== 'done' && n < max) { one(S); S.ev.length = 0; n++; }
    return { S, frames: n };
  }

  const API = { make, play };
  root.InvadeBot = API;
  if (typeof module === 'object' && module.exports) module.exports = API;
})(typeof window !== 'undefined' ? window : globalThis);
