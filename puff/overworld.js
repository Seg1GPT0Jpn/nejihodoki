// ふわふわぱふ: the hub map. Five worlds side by side, five stops each (the fifth is the boss); the cloud-creature hops along the path.
//   const OW = PuffOverworld.create({ ART, LV, get save(), unlocked(i), popc(n), L(ja,en), startLevel(id), exit(), toast(msg) })
//   OW.open(id) / OW.resize(w,h) / OW.draw(ctx,dpr) / OW.update() / OW.tap(x,y) / OW.dir(dx,dy) / OW.activate() / OW.back()
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  const WW = 340, VH = 232, N = 25;
  const pos = i => { const w = Math.floor(i / 5), k = i % 5; return { x: w * WW + 52 + k * 58 + (k === 4 ? 8 : 0), y: 118 + Math.sin(k * 1.25 + w * 0.9) * 38 + (k === 4 ? -6 : 0) }; };

  function create(o) {
    const ART = o.ART, LV = o.LV, L = o.L;
    const OW = { cur: 0, camx: 0, w: 320, h: 200, sc: 1, t: 0, hop: 0, nodes: [] };
    for (let i = 0; i < N; i++) OW.nodes.push(pos(i));
    OW.resize = (w, h) => { OW.w = w; OW.h = h; OW.sc = Math.max(0.5, Math.min(h / VH, w / 250)); };
    OW.open = id => { const i = id ? LV.index(id) : -1; OW.cur = i >= 0 ? i : firstOpen(); OW.camx = target(); OW.hop = 0; };
    function firstOpen() { let n = 0; const s = o.save; for (let i = 0; i < N; i++) { if (o.unlocked(i)) n = i; if (!(s.lv[i] & 1) && o.unlocked(i)) return i; } return n; }
    const target = () => Math.max(0, Math.min(N / 5 * WW - OW.w / OW.sc, OW.nodes[OW.cur].x - OW.w / OW.sc / 2));
    OW.info = () => { const i = OW.cur, id = LV.idOf(i), d = LV.get(id), b = o.save.lv[i] | 0, un = o.unlocked(i); return { i, id, def: d, name: L(d.name.ja, d.name.en), gimmick: L(d.gimmick.ja, d.gimmick.en), un, cleared: !!(b & 1), medals: o.popc((b >> 1) & 7), nohurt: !!(b & 16), boss: !!d.boss }; };
    OW.dir = (dx, dy) => { const n = Math.max(0, Math.min(N - 1, OW.cur + (dx || dy)));  if (n !== OW.cur) { OW.cur = n; OW.hop = 14; if (o.onMove) o.onMove(); } };
    OW.activate = () => { const f = OW.info(); if (!f.un) { o.toast(L('まえのステージをクリアしよう', 'Clear the previous stage first')); return; } o.startLevel(f.id); };
    OW.back = () => o.exit();
    OW.tap = (x, y) => {
      const wx = x / OW.sc + OW.camx, wy = (y - Math.max(0, (OW.h - VH * OW.sc) / 2)) / OW.sc; let best = -1, bd = 26;
      for (let i = 0; i < N; i++) { const d = Math.hypot(OW.nodes[i].x - wx, OW.nodes[i].y - wy); if (d < bd) { bd = d; best = i; } }
      if (best < 0) return;
      if (best === OW.cur) OW.activate(); else { OW.cur = best; OW.hop = 14; if (o.onMove) o.onMove(); }
    };
    OW.update = () => { OW.t++; if (OW.hop > 0) OW.hop--; OW.camx += (target() - OW.camx) * 0.14; };
    OW.draw = (c, dpr) => {
      const th = i => ART.THEMES[LV.WORLDS[i].theme], t = OW.t, sc = OW.sc, vw = OW.w / sc, oy = Math.max(0, (OW.h - VH * sc) / 2);
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const wv = Math.max(0, Math.min(4, Math.floor((OW.camx + vw / 2) / WW)));
      const g = c.createLinearGradient(0, 0, 0, OW.h); g.addColorStop(0, th(wv).sky[0]); g.addColorStop(1, th(wv).sky[1]); c.fillStyle = g; c.fillRect(0, 0, OW.w, OW.h);
      c.save(); c.translate(0, oy); c.scale(sc, sc); c.translate(-OW.camx, 0);
      for (let w = 0; w < 5; w++) {
        const x0 = w * WW - 6, T = th(w); if (x0 > OW.camx + vw || x0 + WW < OW.camx) continue;
        const gr = c.createLinearGradient(0, 0, 0, VH); gr.addColorStop(0, T.sky[0]); gr.addColorStop(1, T.sky[1]); c.fillStyle = gr; c.fillRect(x0, 0, WW, VH);
        c.fillStyle = T.far; c.beginPath(); c.moveTo(x0, VH); for (let x = 0; x <= WW; x += 10) c.lineTo(x0 + x, 150 - (Math.sin((x0 + x) * 0.03 + w) * 0.5 + 0.5) * 34); c.lineTo(x0 + WW, VH); c.closePath(); c.fill();
        c.fillStyle = T.far2; c.beginPath(); c.moveTo(x0, VH); for (let x = 0; x <= WW; x += 10) c.lineTo(x0 + x, 176 - (Math.sin((x0 + x) * 0.05 + w * 2) * 0.5 + 0.5) * 22); c.lineTo(x0 + WW, VH); c.closePath(); c.fill();
        c.fillStyle = T.top; c.fillRect(x0, 200, WW, VH - 200); c.fillStyle = T.top2; c.fillRect(x0, 200, WW, 3);
        if (w === 4) { c.fillStyle = '#fff'; for (let i = 0; i < 24; i++) { c.globalAlpha = 0.4 + 0.5 * Math.abs(Math.sin(t * 0.04 + i)); c.fillRect(x0 + (i * 53) % WW, (i * 29) % 90, 1.4, 1.4); } c.globalAlpha = 1; }
        if (w === 1) { c.fillStyle = 'rgba(255,150,60,.25)'; for (let i = 0; i < 4; i++) { c.beginPath(); c.arc(x0 + 40 + i * 80, 160 + Math.sin(t * 0.03 + i) * 4, 22, 0, TAU); c.fill(); } }
        c.fillStyle = T.cloud; c.globalAlpha = 0.85; for (let i = 0; i < 3; i++) { const cx = x0 + 40 + i * 110 + Math.sin(t * 0.01 + i) * 6, cy = 28 + i * 14; c.beginPath(); c.arc(cx, cy, 9, 0, TAU); c.arc(cx + 10, cy + 2, 7, 0, TAU); c.arc(cx - 9, cy + 3, 6, 0, TAU); c.fill(); } c.globalAlpha = 1;
        c.font = '800 13px sans-serif'; c.textAlign = 'left'; c.fillStyle = 'rgba(30,30,50,.72)'; c.fillText(String(w + 1) + '  ' + L(LV.WORLDS[w].name.ja, LV.WORLDS[w].name.en), x0 + 14, 18);
      }
      // path
      c.lineCap = 'round'; c.lineWidth = 5; c.strokeStyle = 'rgba(255,255,255,.7)'; c.beginPath(); for (let i = 0; i < N; i++) { const p = OW.nodes[i]; c[i ? 'lineTo' : 'moveTo'](p.x, p.y); } c.stroke();
      c.lineWidth = 2; c.setLineDash([2, 6]); c.strokeStyle = 'rgba(90,60,80,.55)'; c.stroke(); c.setLineDash([]);
      for (let i = 0; i < N; i++) {
        const p = OW.nodes[i], b = o.save.lv[i] | 0, un = o.unlocked(i), boss = i % 5 === 4, r = boss ? 13 : 9, sel = i === OW.cur;
        c.save(); c.translate(p.x, p.y);
        if (sel) { c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.arc(0, 0, r + 6 + Math.sin(t * 0.15) * 1.5, 0, TAU); c.fill(); }
        c.fillStyle = !un ? '#9a9aa8' : (b & 1) ? '#7be0a0' : boss ? '#ff9a7a' : '#ffd23f'; c.strokeStyle = ART.OUT; c.lineWidth = 1.6; c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fill(); c.stroke();
        if (boss) { c.fillStyle = '#ffd23f'; c.beginPath(); c.moveTo(-8, -r - 1); c.lineTo(-6, -r - 8); c.lineTo(-2, -r - 3); c.lineTo(0, -r - 10); c.lineTo(2, -r - 3); c.lineTo(6, -r - 8); c.lineTo(8, -r - 1); c.closePath(); c.fill(); c.stroke(); }
        c.fillStyle = '#4a3040'; c.font = '800 10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(un ? String(i % 5 + 1) : '', 0, 1);
        if (!un) { c.strokeStyle = '#4a4a58'; c.lineWidth = 1.6; c.strokeRect(-4, -2, 8, 6); c.beginPath(); c.arc(0, -2, 3, Math.PI, 0); c.stroke(); }
        const m = o.popc((b >> 1) & 7); for (let k = 0; k < 3; k++) { c.fillStyle = (b >> (1 + k)) & 1 ? '#ffd23f' : 'rgba(40,30,50,.35)'; c.beginPath(); c.arc((k - 1) * 5, r + 6, 2, 0, TAU); c.fill(); } void m;
        c.restore();
      }
      // the hero on the current node
      const p = OW.nodes[OW.cur], hop = OW.hop > 0 ? Math.sin((14 - OW.hop) / 14 * Math.PI) * 12 : Math.sin(t * 0.12) * 1.5;
      c.save(); c.translate(p.x - 5, p.y - 24 - hop); ART.drawHeroBody(c, { on: true, vx: 0, vy: 0, face: 1, puff: 0, ab: null, held: null, stun: 0, inh: 0, zap: 0, slash: 0, stone: 0, flash: 0 }, t, {}, false); c.restore();
      c.restore();
    };
    OW.open(null);
    return OW;
  }
  const PO = { create, pos, WW, VH };
  if (typeof module === 'object' && module && module.exports) module.exports = PO;
  root.PuffOverworld = PO;
})(typeof window !== 'undefined' ? window : globalThis);
