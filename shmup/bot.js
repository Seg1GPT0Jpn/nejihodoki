// A dodging bot (used by the tests to prove a stage can be cleared, and by the demo hooks). Pure; node or browser.
// It looks ahead a few frames with every bullet moving straight, picks the safest of 18 moves (9 directions x focus on/off)
// and prefers to line up with the nearest enemy. It never reads the future of the RNG.
(function (root) {
  'use strict';
  const E = root.ShmupEngine || require('./engine.js');
  const { IN, W, H } = E;
  const DIRS = [[0, 0, 0], [1, 0, IN.R], [-1, 0, IN.L], [0, 1, IN.D], [0, -1, IN.U], [1, 1, IN.R | IN.D], [1, -1, IN.R | IN.U], [-1, 1, IN.L | IN.D], [-1, -1, IN.L | IN.U]];
  function make(o) {
    o = o || {};
    const look = o.look || 14;
    return function bot(S) {
      const p = S.p;
      let m = IN.SHOOT;
      if (p.dying > 0 && S.bombs > 0) return m | IN.BOMB;
      // targets
      let ty = 135, tx = 80, bd = 1e9;
      for (const e of S.ene) if (e.a && e.x < W - 4 && e.x > p.x) { const d = (e.x - p.x) + Math.abs(e.y - p.y) * 0.5; if (d < bd) { bd = d; ty = e.y; } }
      if (S.ship === 2) tx = 130;
      if (S.boss) { ty = S.boss.y; tx = S.ship === 2 ? 200 : 60; }
      // dangerous things near the ship
      const bl = [];
      for (const b of S.bul) if (b.a && Math.abs(b.x - p.x) < 150 && Math.abs(b.y - p.y) < 110) bl.push(b);
      const en = [];
      for (const e of S.ene) if (e.a && Math.abs(e.x - p.x) < 120 && Math.abs(e.y - p.y) < 110) en.push(e);
      const items = [];
      for (const it of S.itm) if (it.a) items.push(it);
      let best = null, bc = 1e18;
      const focOK = !S.mods.nofocus;
      for (const d of DIRS) for (let f = 0; f < (focOK ? 2 : 1); f++) {
        const sp = (2.3 + 0.38 * S.spd) * (f ? 0.45 : 1) * (d[0] && d[1] ? 0.7071 : 1);
        let x = p.x, y = p.y, risk = 0;
        for (let k = 1; k <= look; k++) {
          x = Math.max(10, Math.min(W - 10, x + d[0] * sp)); y = Math.max(10, Math.min(H - 10, y + d[1] * sp));
          for (const b of bl) {
            const bx = b.x + b.vx * k, by = b.y + b.vy * k, dx = bx - x, dy = by - y, rr = b.r + 6 + (k < 4 ? 3 : 0);
            const d2 = dx * dx + dy * dy;
            if (d2 < rr * rr) risk += 400 / k; else if (d2 < 24 * 24) risk += 12 / k;
          }
          for (const e of en) {
            const ex = e.x + (e.boss ? 0 : (e.d.mv.vx || -1)) * k * 0.7, dx = ex - x, dy = e.y - y, rr = e.r + 8, d2 = dx * dx + dy * dy;
            if (d2 < rr * rr) risk += 300 / k;
          }
          for (const l of S.las) if (l.a && l.t + k >= l.tele - 3 && l.t + k < l.tele + l.dur) { const rx = x - l.x, ry = y - l.y, al = rx * l.dx + ry * l.dy; if (al > 0 && Math.abs(rx * l.dy - ry * l.dx) < l.w / 2 + 10) risk += 250 / k; }
        }
        if (x < 14 || x > W - 14 || y < 14 || y > H - 14) risk += 4;
        let cost = risk * 10 + Math.abs(y - ty) * 0.25 + Math.abs(x - tx) * (S.ship === 2 ? 0.12 : 0.05) + (f ? 0.8 : 0) + (d[2] ? 0 : 0.2);
        for (const it of items) { const dd = Math.abs(it.x - x) + Math.abs(it.y - y); if (dd < 140) cost -= (140 - dd) * 0.05; }
        if (cost < bc) { bc = cost; best = { m: d[2], f }; }
      }
      m |= best.m; if (best.f) m |= IN.FOCUS;
      // spend a bomb when about to be hit anyway
      if (bc > 3000 && S.bombs > 0 && !S.bomb.t) m |= IN.BOMB;
      if (S.over) m |= IN.CONT;
      return m;
    };
  }
  const api = { make };
  root.ShmupBot = api;
  if (typeof module === 'object' && module && module.exports) module.exports = api;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
