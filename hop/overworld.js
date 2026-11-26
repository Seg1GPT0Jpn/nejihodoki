// ぴょんぴょん冒険: the overworld. A world-select map (six islands on a winding path) and one walkable field per world: Pyonta walks along
// paths between level nodes; a gate opens when a level is cleared, a medal gate opens when enough medals are collected and leads to a
// stuffed-toy house (ぬいぐるみの家) that hands out a spare power-up once. Keyboard / touch (tap a node to travel) / gamepad.
// All drawing is procedural (art.js helpers). The page gives this module a small host object (see create()).
(function (root) {
  'use strict';
  const FW = 320, FH = 208;
  const TAU = Math.PI * 2;
  const HOUSE_ITEMS = [4, 1, 2, 3, 4, 2];           // what the house of world 1..6 gives: puff, boots, cape, ribbon, puff, cape
  const MEDAL_GATE = 3;                             // medals needed in a world to open the way to its house

  // ---- the graph of a world (positions in the 320 x 208 field)
  function graph(w, levelIds) {
    const flip = w % 2 === 0, mx = w % 3 === 0;
    const P = (x, y) => ({ x: mx ? FW - x : x, y: flip ? FH - y : y });
    const has = n => levelIds.indexOf(w + '-' + n) >= 0;
    const nodes = [
      Object.assign({ id: 'S', type: 'start' }, P(30, 150)),
      Object.assign({ id: 'L1', type: 'level', lv: w + '-1' }, P(80, 116)),
      Object.assign({ id: 'L2', type: 'level', lv: w + '-2' }, P(132, 150)),
      Object.assign({ id: 'L3', type: 'level', lv: w + '-3' }, P(186, 118)),
      Object.assign({ id: 'G', type: 'gate', req: 'L3' }, P(226, 84)),
      Object.assign({ id: 'L4', type: 'level', lv: w + '-4', boss: true }, P(274, 52)),
      Object.assign({ id: 'MG', type: 'medalgate', req: 'L2' }, P(120, 96)),
      Object.assign({ id: 'H', type: 'house', w }, P(160, 48)),
    ].filter(n => n.type !== 'level' || has(+n.lv.split('-')[1]));
    const ids = new Set(nodes.map(n => n.id));
    const edges = [['S', 'L1'], ['L1', 'L2'], ['L2', 'L3'], ['L3', 'G'], ['G', 'L4'], ['L2', 'MG'], ['MG', 'H']].filter(e => ids.has(e[0]) && ids.has(e[1]));
    return { nodes, edges, by: Object.fromEntries(nodes.map(n => [n.id, n])) };
  }
  const WORLD_POS = [[40, 150], [95, 105], [150, 150], [200, 100], [245, 145], [285, 70]];

  // host: { L, ART, E, LV, save (live object), unlocked(levelIndex), lvIndex(id), popc, startLevel(id), grantHouse(w, item) -> bool(first time), toast(msg), worldOpen(w), exit() }
  function create(host) {
    const { ART, LV, L } = host;
    let view = 'worlds', world = 1, g = null, cur = 'S', walk = null, t = 0, hold = 0, wcur = 1, msg = '', msgT = 0, sc = 1, ox = 0, oy = 0, cw = 320, ch = 208;
    const levelIds = () => LV.ids();
    const cleared = id => !!(host.save.lv[host.lvIndex(id)] & 1);
    const worldMedals = w => { let n = 0; for (let i = (w - 1) * 4; i < w * 4; i++) n += host.popc((host.save.lv[i] >> 1) & 31); return n; };
    const worldAvail = w => levelIds().some(id => id.indexOf(w + '-') === 0);
    function isOpen(n) {
      if (!g) return false;
      if (n.type === 'start') return true;
      if (n.type === 'level') return host.unlocked(host.lvIndex(n.lv));
      if (n.type === 'gate') return cleared(g.by[n.req].lv);
      if (n.type === 'medalgate') return cleared(g.by[n.req].lv) && worldMedals(world) >= MEDAL_GATE;
      if (n.type === 'house') return isOpen(g.by.MG);
      return false;
    }
    const reqText = n => n.type === 'gate' ? L('ここの前のステージをクリアすると開く', 'Clear the level before it to open') : n.type === 'medalgate' ? L('メダルを' + MEDAL_GATE + 'こ集めて、2つ目のステージをクリアすると開く（いま ' + worldMedals(world) + '）', 'Collect ' + MEDAL_GATE + ' medals here and clear level 2 to open (now ' + worldMedals(world) + ')') : n.type === 'house' ? L('メダルの門のむこう', 'Beyond the medal gate') : L('ひとつ前のステージをクリアすると開く', 'Clear the previous level first');
    function say(s, n) { msg = s; msgT = n || 160; host.toast && host.toast(s); }
    function firstTarget() { for (const id of ['L1', 'L2', 'L3', 'L4']) { const n = g.by[id]; if (n && isOpen(n) && !cleared(n.lv)) return id; } const last = ['L4', 'L3', 'L2', 'L1'].find(id => g.by[id] && isOpen(g.by[id])); return last || 'S'; }
    function open(w, node) {
      if (w === 'worlds' || !w) { view = 'worlds'; wcur = Math.max(1, Math.min(6, world)); g = null; walk = null; return; }
      view = 'field'; world = w; g = graph(w, levelIds()); cur = node && g.by[node] ? node : firstTarget(); walk = null;
    }
    function openAtLevel(id) { const w = +id.split('-')[0], g2 = graph(w, levelIds()); const n = g2.nodes.find(n => n.lv === id); open(w, n ? n.id : null); }
    const pos = n => ({ x: n.x, y: n.y });
    const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);
    function neighbors(id) { const out = []; for (const e of g.edges) { if (e[0] === id) out.push(e[1]); else if (e[1] === id) out.push(e[0]); } return out; }
    function pathTo(from, to) { // BFS over open nodes
      const q = [[from]], seen = new Set([from]);
      while (q.length) { const p = q.shift(), last = p[p.length - 1]; if (last === to) return p; for (const nb of neighbors(last)) if (!seen.has(nb) && isOpen(g.by[nb])) { seen.add(nb); q.push(p.concat(nb)); } }
      return null;
    }
    function startWalk(path) { if (!path || path.length < 2) return; walk = { path, seg: 0, d: 0 }; }
    // ---- input
    function dir(dx, dy) {
      if (!walk && view === 'worlds') { const nw = pickWorld(dx, dy); if (nw) { wcur = nw; } return; }
      if (walk || !g) return;
      let best = null, bs = 0.35; const c = g.by[cur];
      for (const nb of neighbors(cur)) { const n = g.by[nb], vx = n.x - c.x, vy = n.y - c.y, l = Math.hypot(vx, vy) || 1, s = (vx * dx + vy * dy) / l; if (s > bs) { bs = s; best = nb; } }
      if (!best) return;
      if (!isOpen(g.by[best])) { say(reqText(g.by[best])); return; }
      startWalk([cur, best]);
    }
    function pickWorld(dx, dy) { // worlds are in a row: left/right (or up/down) step to the neighbour
      const step = dx > 0 || dy < 0 ? 1 : -1, n = wcur + step; if (n < 1 || n > 6) return 0; return n;
    }
    function activate() {
      if (view === 'worlds') { if (worldAvail(wcur) && host.worldOpen(wcur)) open(wcur); else say(L('まだ入れません（前のワールドのボスをたおそう）', 'Not open yet (beat the previous boss)')); return; }
      if (!g || walk) return; const n = g.by[cur];
      if (n.type === 'level') host.startLevel(n.lv);
      else if (n.type === 'house') { const first = host.grantHouse(world, HOUSE_ITEMS[world - 1]); say(first ? L('ぬいぐるみの家：予備のどうぐをもらった！ つぎのステージで左上の箱に入っているよ', 'Plush house: you got a spare power-up! It waits in the box next level') : L('ぬいぐるみの家：「また来てね」', 'Plush house: "Come again!"')); }
      else if (n.type === 'start') say(L('スタート地点', 'The starting point'));
    }
    function back() { if (view === 'field') { open('worlds'); wcur = world; } else host.exit(); }
    function tap(px, py) { // CSS px relative to the canvas
      const x = (px - ox) / sc, y = (py - oy) / sc; let best = null, bd = 22;
      if (view === 'worlds') { for (let i = 0; i < 6; i++) { const d = Math.hypot(WORLD_POS[i][0] - x, WORLD_POS[i][1] - y); if (d < bd) { bd = d; best = i + 1; } } if (best) { if (best === wcur) activate(); else wcur = best; } return; }
      if (!g) return;
      for (const n of g.nodes) { const d = Math.hypot(n.x - x, n.y - y); if (d < bd) { bd = d; best = n; } }
      if (!best || walk) return;
      if (best.id === cur) { activate(); return; }
      if (!isOpen(best)) { say(reqText(best)); return; }
      const p = pathTo(cur, best.id); if (p) startWalk(p); else say(reqText(best));
    }
    // ---- update + draw
    function update() {
      t++; if (msgT > 0) msgT--;
      if (walk) {
        const a = g.by[walk.path[walk.seg]], b = g.by[walk.path[walk.seg + 1]], len = dist(a, b); walk.d += 1.9;
        if (walk.d >= len) { walk.seg++; walk.d = 0; cur = walk.path[walk.seg]; if (walk.seg >= walk.path.length - 1) { walk = null; } }
      }
    }
    function heroPos() { if (walk) { const a = g.by[walk.path[walk.seg]], b = g.by[walk.path[walk.seg + 1]], k = Math.min(1, walk.d / dist(a, b)); return { x: a.x + (b.x - a.x) * k, y: a.y + (b.y - a.y) * k, face: b.x >= a.x ? 1 : -1, walking: true }; } const n = g.by[cur]; return { x: n.x, y: n.y, face: 1, walking: false }; }
    function resize(w, h) { cw = w; ch = h; sc = Math.min(w / FW, h / FH); ox = (w - FW * sc) / 2; oy = (h - FH * sc) / 2; }
    function deco(c, th, w, f) { // theme decorations scattered on the field
      const h = (i, k) => { let x = (i * 374761393 + k * 668265263 + w * 1274126177) | 0; x = (x ^ (x >>> 13)) * 1274126177 | 0; return ((x ^ (x >>> 16)) >>> 0) / 4294967296; };
      for (let i = 0; i < 26; i++) {
        const x = 8 + h(i, 1) * (FW - 16), y = 14 + h(i, 2) * (FH - 28), ph = h(i, 3) * TAU;
        if (th.deco === 'flower') { c.fillStyle = ['#ff8fb0', '#ffe27a', '#fff'][i % 3]; c.beginPath(); c.arc(x, y, 2 + Math.sin(f * 0.05 + ph) * 0.3, 0, TAU); c.fill(); c.fillStyle = '#4aa84e'; c.fillRect(x - 0.5, y + 2, 1, 3); }
        else if (th.deco === 'gear') { c.save(); c.globalAlpha = 0.35; c.fillStyle = '#4e5a6c'; c.translate(x, y); c.rotate(f * 0.01 * (i % 2 ? 1 : -1)); c.beginPath(); for (let k = 0; k < 8; k++) { const a = k / 8 * TAU; c.lineTo(Math.cos(a) * 5, Math.sin(a) * 5); c.lineTo(Math.cos(a + 0.2) * 3.5, Math.sin(a + 0.2) * 3.5); } c.fill(); c.restore(); }
        else if (th.deco === 'bubble') { c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1; c.beginPath(); c.arc(x + Math.sin(f * 0.03 + ph) * 3, (y - f * 0.2 * (0.5 + h(i, 4)) % (FH - 20) + (FH - 20)) % (FH - 20) + 10, 2 + h(i, 5) * 3, 0, TAU); c.stroke(); }
        else if (th.deco === 'snow') { c.fillStyle = '#fff'; c.beginPath(); c.arc((x + Math.sin(f * 0.02 + ph) * 6 + FW) % FW, (y + f * 0.35 * (0.5 + h(i, 4))) % FH, 1.4, 0, TAU); c.fill(); }
        else if (th.deco === 'star') { c.fillStyle = '#ffe27a'; c.globalAlpha = 0.4 + 0.6 * Math.abs(Math.sin(f * 0.04 + ph)); c.fillRect(x, y, 1.6, 1.6); c.globalAlpha = 1; }
        else { c.fillStyle = '#d4856a'; c.globalAlpha = 0.5; c.fillRect(x, y, 3, 1.2); c.fillRect(x + 1, y - 1, 1, 3); c.globalAlpha = 1; }
      }
    }
    function nodeIcon(c, n, th, open, done, f) {
      const r = 12;
      c.save(); c.translate(n.x, n.y);
      if (n.type === 'level') {
        c.beginPath(); c.arc(0, 0, r, 0, TAU); c.fillStyle = done ? '#7be0a0' : open ? '#ffd23f' : '#9aa6b4'; c.fill(); c.lineWidth = 2; c.strokeStyle = th.ink; c.stroke();
        if (open && !done) { c.strokeStyle = 'rgba(255,255,255,.8)'; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 0, r + 3 + Math.sin(f * 0.1) * 1.5, 0, TAU); c.stroke(); }
        c.fillStyle = th.ink; c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(n.lv.split('-')[1], 0, 1);
        if (n.boss) { c.fillStyle = '#e24d4d'; c.beginPath(); c.moveTo(-6, -r - 1); c.lineTo(-4, -r - 7); c.lineTo(-1.5, -r - 3); c.lineTo(0, -r - 8); c.lineTo(1.5, -r - 3); c.lineTo(4, -r - 7); c.lineTo(6, -r - 1); c.closePath(); c.fill(); }
        if (!open) { c.fillStyle = th.ink; c.fillRect(-4, -1, 8, 6); c.strokeStyle = th.ink; c.lineWidth = 1.5; c.beginPath(); c.arc(0, -1, 3, Math.PI, 0); c.stroke(); }
      } else if (n.type === 'start') { c.fillStyle = '#fff'; c.strokeStyle = th.ink; c.lineWidth = 2; c.beginPath(); c.arc(0, 0, 7, 0, TAU); c.fill(); c.stroke(); c.fillStyle = '#ff6fa0'; c.beginPath(); c.moveTo(-2, -3); c.lineTo(3, 0); c.lineTo(-2, 3); c.fill(); }
      else if (n.type === 'gate' || n.type === 'medalgate') {
        c.strokeStyle = th.ink; c.lineWidth = 2; c.fillStyle = open ? 'rgba(255,255,255,.0)' : (n.type === 'medalgate' ? '#ffe27a' : '#b78a5a');
        if (open) { c.beginPath(); c.moveTo(-9, 7); c.lineTo(-9, -4); c.quadraticCurveTo(0, -12, 9, -4); c.lineTo(9, 7); c.stroke(); }
        else { c.fillRect(-9, -8, 18, 15); c.strokeRect(-9, -8, 18, 15); c.beginPath(); for (let i = -6; i <= 6; i += 4) { c.moveTo(i, -8); c.lineTo(i, 7); } c.stroke(); if (n.type === 'medalgate') { ART.starPath(c, 0, 0, 5, 2.4, 5); c.fillStyle = '#fff'; c.fill(); c.stroke(); } else { c.fillStyle = th.ink; c.fillRect(-3, -1, 6, 5); } }
      } else if (n.type === 'house') {
        const taken = host.save.hs & (1 << (n.w - 1));
        c.fillStyle = open ? '#ffb3c6' : '#b9bfcb'; c.strokeStyle = th.ink; c.lineWidth = 2; c.fillRect(-9, -3, 18, 11); c.strokeRect(-9, -3, 18, 11); c.beginPath(); c.moveTo(-11, -3); c.lineTo(0, -12); c.lineTo(11, -3); c.closePath(); c.fillStyle = open ? '#e8836b' : '#9aa6b4'; c.fill(); c.stroke();
        c.fillStyle = '#fff4e6'; c.fillRect(-2.5, 1, 5, 7); c.strokeRect(-2.5, 1, 5, 7);
        if (open && !taken) { c.fillStyle = '#ffe27a'; ART.starPath(c, 10, -10 + Math.sin(f * 0.15) * 2, 3.4, 1.6, 5); c.fill(); }
        if (!open) { c.fillStyle = th.ink; c.fillRect(-3, -1, 6, 5); }
      }
      c.restore();
    }
    function draw(c, dpr) {
      c.setTransform(dpr, 0, 0, dpr, 0, 0);
      const wi = view === 'worlds' ? wcur : world, W = LV.WORLDS[wi - 1], th = ART.THEMES[W.theme];
      c.save(); ART.sky(c, th, cw, ch, t * 0.25, t, W.theme === 'night');
      c.translate(ox, oy); c.scale(sc, sc);
      c.beginPath(); ART.rr(c, 4, 6, FW - 8, FH - 12, 26); c.fillStyle = th.far; c.globalAlpha = 0.75; c.fill(); c.globalAlpha = 1; c.lineWidth = 3; c.strokeStyle = th.ink; c.globalAlpha = 0.3; c.stroke(); c.globalAlpha = 1;
      deco(c, th, wi, t);
      c.lineCap = 'round'; c.lineJoin = 'round';
      if (view === 'worlds') {
        for (let i = 0; i < 5; i++) { const a = WORLD_POS[i], b = WORLD_POS[i + 1], ok = host.worldOpen(i + 2) && worldAvail(i + 2); c.strokeStyle = th.ink; c.lineWidth = ok ? 7 : 5; c.globalAlpha = 0.9; c.beginPath(); c.moveTo(a[0], a[1]); c.quadraticCurveTo((a[0] + b[0]) / 2, (a[1] + b[1]) / 2 - 14, b[0], b[1]); c.stroke(); c.strokeStyle = ok ? '#f6e6c4' : '#cdd3dc'; c.lineWidth = ok ? 4.5 : 2.5; if (!ok) c.setLineDash([3, 4]); c.stroke(); c.setLineDash([]); c.globalAlpha = 1; }
        for (let i = 0; i < 6; i++) {
          const p = WORLD_POS[i], w2 = LV.WORLDS[i], th2 = ART.THEMES[w2.theme], avail = worldAvail(i + 1), op = avail && host.worldOpen(i + 1), sel = wcur === i + 1;
          const cl = [1, 2, 3, 4].filter(n => LV.ids().indexOf((i + 1) + '-' + n) >= 0 && cleared((i + 1) + '-' + n)).length, tot = [1, 2, 3, 4].filter(n => LV.ids().indexOf((i + 1) + '-' + n) >= 0).length;
          c.save(); c.translate(p[0], p[1] + (sel ? Math.sin(t * 0.1) * 1.5 : 0)); c.beginPath(); c.arc(0, 0, sel ? 19 : 15, 0, TAU); c.fillStyle = op ? th2.top : '#9aa6b4'; c.fill(); c.lineWidth = 3; c.strokeStyle = th.ink; c.stroke();
          c.beginPath(); c.arc(0, 4, sel ? 15 : 11, 0, Math.PI); c.fillStyle = op ? th2.gTop : '#b9c2cc'; c.fill();
          c.fillStyle = th.ink; c.font = 'bold ' + (sel ? 13 : 11) + 'px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(i + 1), 0, -2);
          if (!op) { c.fillStyle = th.ink; c.fillRect(-4, 5, 8, 6); c.strokeStyle = th.ink; c.lineWidth = 1.5; c.beginPath(); c.arc(0, 5, 3, Math.PI, 0); c.stroke(); }
          else if (cl === tot && tot) { c.fillStyle = '#ffd23f'; ART.starPath(c, 14, -14, 5, 2.4, 5); c.fill(); c.strokeStyle = th.ink; c.lineWidth = 1; c.stroke(); }
          c.restore();
        }
        c.fillStyle = th.ink; c.font = 'bold 12px sans-serif'; c.textAlign = 'center'; c.fillText(L(W.name.ja, W.name.en), FW / 2, 22);
        const h = WORLD_POS[wcur - 1], hp = { x: h[0], y: h[1] - 24 }; drawHero(c, hp.x, hp.y + 22, 1, false);
        c.restore(); return;
      }
      // field: paths first
      for (const e of g.edges) {
        const a = g.by[e[0]], b = g.by[e[1]], ok = isOpen(a) && isOpen(b);
        c.strokeStyle = th.ink; c.lineWidth = ok ? 8 : 6; c.globalAlpha = 0.85; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(b.x, b.y); c.stroke();
        c.strokeStyle = ok ? '#f6e6c4' : '#cdd3dc'; c.lineWidth = ok ? 5 : 3; if (!ok) c.setLineDash([3, 4]); c.stroke(); c.setLineDash([]); c.globalAlpha = 1;
      }
      for (const n of g.nodes) {
        const open = isOpen(n), done = n.type === 'level' && cleared(n.lv); nodeIcon(c, n, th, open, done, t);
        if (n.type === 'level') { const i = host.lvIndex(n.lv), b = host.save.lv[i] | 0; const m = host.popc((b >> 1) & 31);
          c.fillStyle = th.ink; c.font = 'bold 6.5px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle';
          for (let k = 0; k < 3; k++) { const on = k === 0 ? b & 1 : k === 1 ? m === 5 : b & 64; ART.starPath(c, n.x - 7 + k * 7, n.y + 19, 3.2, 1.5, 5); c.fillStyle = on ? '#ffd23f' : 'rgba(40,40,50,.35)'; c.fill(); }
          for (let k = 0; k < 5; k++) { c.beginPath(); c.arc(n.x - 8 + k * 4, n.y + 25.5, 1.4, 0, TAU); c.fillStyle = (b >> (1 + k)) & 1 ? '#ffd23f' : 'rgba(40,40,50,.3)'; c.fill(); }
        }
      }
      const hp = heroPos(); drawHero(c, hp.x, hp.y - 2, hp.face, hp.walking);
      // the info label of the node the hero stands on
      const n = g.by[cur]; c.font = 'bold 10px sans-serif'; c.textAlign = 'center'; c.textBaseline = 'middle'; const lab = infoText(n);
      if (lab) { const wd = c.measureText(lab).width + 14; c.fillStyle = 'rgba(20,30,45,.78)'; ART.rr(c, FW / 2 - wd / 2, FH - 22, wd, 15, 7); c.fill(); c.fillStyle = '#fff'; c.fillText(lab, FW / 2, FH - 14); }
      c.fillStyle = th.ink; c.font = 'bold 12px sans-serif'; c.fillText(L(W.name.ja, W.name.en), FW / 2, 16);
      c.restore();
    }
    function drawHero(c, x, y, face, walking) {
      const p = { x: x - 5, y: y - 14 - (walking ? Math.abs(Math.sin(t * 0.3)) * 3 : 0), w: 10, h: 14, vx: walking ? 1.5 : 0, vy: 0, face, on: !walking || true, pw: 0, gear: 0, inv: 0, hurtT: 0, rope: null, crouch: false, pound: 0, dead: 0, spr: 0 };
      c.save(); c.translate(0, 0); c.scale(1, 1); ART.drawPlayer(c, p, t, { prev: 0 }); c.restore();
    }
    function infoText(n) {
      if (n.type === 'level') { const i = host.lvIndex(n.lv), b = host.save.lv[i] | 0, tm = host.save.bt[n.lv]; const d = LV.LEVELS.find(l => l.id === n.lv); return n.lv + ' ' + L(d.name.ja, d.name.en) + (tm ? '  ⏱ ' + host.fmtT(tm) : ''); }
      if (n.type === 'house') return L('ぬいぐるみの家', 'Plush house');
      if (n.type === 'start') return L('スタート', 'Start');
      return '';
    }
    return { open, openAtLevel, dir, activate, back, tap, update, draw, resize,
      get view() { return view; }, get world() { return view === 'worlds' ? wcur : world; }, get cur() { return cur; }, get walking() { return !!walk; }, get msg() { return msgT > 0 ? msg : ''; },
      nodePos(id) { if (view === 'worlds') { const p = WORLD_POS[+id - 1]; return { x: ox + p[0] * sc, y: oy + p[1] * sc }; } const n = g && g.by[id]; return n ? { x: ox + n.x * sc, y: oy + n.y * sc } : null; },
      isOpen: id => !!(g && g.by[id] && isOpen(g.by[id])), nodes: () => (g ? g.nodes.map(n => n.id) : []), graph: () => g, houseItem: w => HOUSE_ITEMS[w - 1] };
  }
  const API = { create, graph, FW, FH, HOUSE_ITEMS, MEDAL_GATE, WORLD_POS };
  if (typeof module === 'object' && module && module.exports) module.exports = API;
  root.HopOverworld = API;
})(typeof globalThis !== 'undefined' ? globalThis : this);
