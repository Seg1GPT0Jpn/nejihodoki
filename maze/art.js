// めいろ探検（maze）の絵：せかい（スキン）の色・かべのもよう（手続きで描く）、上から見た盤、3Dの見かけ（レイキャスト）、ミニマップ。
// すべて canvas に描くだけ。画像ファイルは使わない（もようは種つきの乱数で毎回おなじ）。window.MazeArt
(function (root) {
  'use strict';
  const E = root.MazeEngine;
  const KEYCOL = ['#e5484d', '#3b82f6', '#22b04f'];
  const PI2 = Math.PI * 2;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const hex = h => { h = h.replace('#', ''); return [parseInt(h.slice(0, 2), 16), parseInt(h.slice(2, 4), 16), parseInt(h.slice(4, 6), 16)]; };
  const rgb = (a, al) => 'rgba(' + Math.round(a[0]) + ',' + Math.round(a[1]) + ',' + Math.round(a[2]) + ',' + (al == null ? 1 : al) + ')';
  const mix = (a, b, t) => { const x = hex(a), y = hex(b); return rgb([x[0] + (y[0] - x[0]) * t, x[1] + (y[1] - x[1]) * t, x[2] + (y[2] - x[2]) * t]); };
  const shade = (h, f) => { const c = hex(h); return f < 1 ? rgb([c[0] * f, c[1] * f, c[2] * f]) : rgb([c[0] + (255 - c[0]) * (f - 1), c[1] + (255 - c[1]) * (f - 1), c[2] + (255 - c[2]) * (f - 1)]); };
  const lum = h => { const c = hex(h); return (0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]) / 255; };
  const mk = (w, h) => { const c = document.createElement('canvas'); c.width = w; c.height = h; return c; };

  // ---------------------------------------------------------------- かべのもよう
  function paintTex(pat, wall, seed) {
    const c = mk(64, 64), g = c.getContext('2d'), rnd = E.mulberry32(E.hash32('tex|' + pat + '|' + wall + '|' + seed));
    const dk = shade(wall, 0.7), dk2 = shade(wall, 0.55), lt = shade(wall, 1.25), lt2 = shade(wall, 1.12);
    g.fillStyle = wall; g.fillRect(0, 0, 64, 64);
    const R = (a, b) => a + rnd() * (b - a);
    switch (pat) {
      case 'brick':
        for (let r = 0; r < 4; r++) for (let k = -1; k < 3; k++) { const x = k * 32 + (r % 2) * 16, y = r * 16; g.fillStyle = rnd() < 0.5 ? lt2 : wall; g.fillRect(x + 1, y + 1, 30, 14); g.fillStyle = dk; g.fillRect(x, y, 32, 2); g.fillRect(x, y, 2, 16); }
        break;
      case 'stone':
        for (let i = 0; i < 9; i++) { const x = (i % 3) * 22 - 4 + R(-2, 2), y = ((i / 3) | 0) * 22 - 4 + R(-2, 2); g.fillStyle = rnd() < 0.5 ? lt2 : shade(wall, 0.92); g.beginPath(); g.roundRect ? g.roundRect(x + 2, y + 2, 20, 20, 5) : g.rect(x + 2, y + 2, 20, 20); g.fill(); g.strokeStyle = dk; g.lineWidth = 2; g.stroke(); }
        break;
      case 'hedge':
        for (let i = 0; i < 70; i++) { g.fillStyle = rnd() < 0.5 ? dk : lt; g.beginPath(); g.arc(R(0, 64), R(0, 64), R(3, 7), 0, PI2); g.fill(); }
        break;
      case 'ice':
        g.fillStyle = lt2; for (let i = 0; i < 6; i++) { g.save(); g.translate(R(0, 64), R(0, 64)); g.rotate(-0.7); g.fillRect(-2, -R(8, 24), R(2, 6), R(16, 40)); g.restore(); }
        g.strokeStyle = dk; g.lineWidth = 1.5; for (let i = 0; i < 3; i++) { g.beginPath(); let x = R(0, 64), y = R(0, 20); g.moveTo(x, y); for (let k = 0; k < 4; k++) { x += R(-8, 8); y += R(8, 14); g.lineTo(x, y); } g.stroke(); }
        break;
      case 'sand':
        for (let i = 0; i < 90; i++) { g.fillStyle = rnd() < 0.5 ? dk : lt; g.fillRect(R(0, 64), R(0, 64), 2, 2); }
        g.strokeStyle = dk; g.lineWidth = 1.5; for (let y = 10; y < 64; y += 16) { g.beginPath(); for (let x = 0; x <= 64; x += 4) g.lineTo(x, y + Math.sin(x / 7 + y) * 2.5); g.stroke(); }
        break;
      case 'wood':
        for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? lt2 : wall; g.fillRect(k * 16, 0, 16, 64); g.fillStyle = dk; g.fillRect(k * 16, 0, 2, 64); g.strokeStyle = dk; g.lineWidth = 1; for (let i = 0; i < 4; i++) { const x = k * 16 + R(4, 13); g.beginPath(); g.moveTo(x, 0); g.bezierCurveTo(x + 3, 20, x - 3, 40, x + 1, 64); g.stroke(); } }
        break;
      case 'metal':
        g.fillStyle = lt2; g.fillRect(0, 0, 64, 64); g.strokeStyle = dk; g.lineWidth = 2; g.strokeRect(2, 2, 60, 60); g.beginPath(); g.moveTo(0, 32); g.lineTo(64, 32); g.moveTo(32, 0); g.lineTo(32, 64); g.stroke();
        g.fillStyle = dk2; for (const [x, y] of [[8, 8], [56, 8], [8, 56], [56, 56], [40, 24], [24, 40]]) { g.beginPath(); g.arc(x, y, 2.5, 0, PI2); g.fill(); }
        break;
      case 'crystal':
        for (let i = 0; i < 12; i++) { const x = R(0, 64), y = R(0, 64), s = R(8, 18); g.fillStyle = rnd() < 0.5 ? lt : dk; g.globalAlpha = 0.55; g.beginPath(); g.moveTo(x, y - s); g.lineTo(x + s * 0.7, y + s * 0.6); g.lineTo(x - s * 0.7, y + s * 0.6); g.closePath(); g.fill(); }
        g.globalAlpha = 1; break;
      case 'dots':
        g.fillStyle = lt2; for (let y = 0; y < 4; y++) for (let x = 0; x < 4; x++) { g.beginPath(); g.arc(8 + x * 16 + (y % 2) * 8, 8 + y * 16, 4.5, 0, PI2); g.fill(); }
        break;
      case 'waves':
        g.lineWidth = 3; for (let y = 4; y < 72; y += 12) { g.strokeStyle = (y / 12) % 2 ? lt : dk; g.beginPath(); for (let x = 0; x <= 64; x += 2) g.lineTo(x, y + Math.sin(x / 64 * PI2 * 2) * 3); g.stroke(); }
        break;
      case 'stripes':
        for (let k = 0; k < 4; k++) { g.fillStyle = k % 2 ? lt : wall; g.fillRect(k * 16, 0, 16, 64); }
        break;
      case 'scales':
        for (let y = 0; y < 5; y++) for (let x = -1; x < 5; x++) { const cx = x * 16 + (y % 2) * 8, cy = y * 12; g.fillStyle = (x + y) % 2 ? lt2 : wall; g.beginPath(); g.arc(cx, cy, 12, 0, Math.PI); g.fill(); g.strokeStyle = dk; g.lineWidth = 1.5; g.stroke(); }
        break;
      default: break;
    }
    // ふち（上を明るく下を暗く）
    g.fillStyle = 'rgba(255,255,255,.14)'; g.fillRect(0, 0, 64, 2); g.fillStyle = 'rgba(0,0,0,.22)'; g.fillRect(0, 60, 64, 4);
    return c;
  }
  function doorTex(col) {
    const c = mk(64, 64), g = c.getContext('2d'); g.fillStyle = shade(col, 0.55); g.fillRect(0, 0, 64, 64); g.fillStyle = col; g.fillRect(6, 6, 52, 52);
    g.fillStyle = 'rgba(255,255,255,.25)'; g.fillRect(6, 6, 52, 8); g.fillStyle = '#1b1b22'; g.beginPath(); g.arc(32, 30, 8, 0, PI2); g.fill(); g.fillRect(29, 32, 6, 16); return c;
  }
  function gateTex() {
    const c = mk(64, 64), g = c.getContext('2d'); g.fillStyle = '#2a2a33'; g.fillRect(0, 0, 64, 64); g.fillStyle = '#f2b632';
    for (let k = -64; k < 128; k += 24) { g.beginPath(); g.moveTo(k, 64); g.lineTo(k + 12, 64); g.lineTo(k + 76, 0); g.lineTo(k + 64, 0); g.closePath(); g.fill(); } return c;
  }

  // ---------------------------------------------------------------- スキン（せかいの色の一式）
  const skinCache = {};
  function skin(world, dark) {
    const w = typeof world === 'string' ? E.WORLD_BY_ID[world] : world; if (!w) return skin('forest', dark);
    const key = w.id + (dark ? 'd' : 'l');
    if (skinCache[key]) return skinCache[key];
    const wl = lum(w.floor), f = dark ? (wl < 0.3 ? 1 : wl < 0.5 ? 0.8 : 0.62) : 1, fl = hex(w.floor);
    const s = {
      id: w.id, w, dark, wall: w.wall, floor: shade(w.floor, f), floor2: shade(w.floor, f * (wl > 0.5 ? 0.93 : 1.1)), acc: w.acc, bg: shade(w.floor, dark ? 0.32 : 0.78), fog: dark ? '#05060a' : '#1d1a15',
      ceil: shade(w.wall, dark ? 0.45 : 0.9), floor3d: shade(w.floor, dark ? 0.5 : 0.85), fogRgb: dark ? [6, 8, 14] : [40, 36, 30],
      tex: paintTex(w.pat, w.wall, w.id), door: KEYCOL.map(doorTex), gate: gateTex(), spr: {},
    };
    void fl;
    for (const k of ['coin', 'gem', 'key0', 'key1', 'key2', 'goal', 'ghost']) s.spr[k] = icon(k, s);
    return (skinCache[key] = s);
  }
  // ちいさな絵（3Dのスプライトと2Dの宝物でおなじものを使う）
  function icon(kind, s) {
    const c = mk(64, 64), g = c.getContext('2d'); g.lineJoin = 'round'; g.lineCap = 'round';
    if (kind === 'coin') { g.fillStyle = '#f5c242'; g.strokeStyle = '#a56a08'; g.lineWidth = 4; g.beginPath(); g.arc(32, 32, 20, 0, PI2); g.fill(); g.stroke(); g.fillStyle = '#ffe08a'; g.beginPath(); g.arc(32, 32, 11, 0, PI2); g.fill(); g.strokeStyle = '#a56a08'; g.lineWidth = 3; g.beginPath(); g.moveTo(32, 25); g.lineTo(32, 39); g.stroke(); }
    else if (kind === 'gem') { g.fillStyle = '#5ce1e6'; g.strokeStyle = '#1b7f93'; g.lineWidth = 4; g.beginPath(); g.moveTo(32, 8); g.lineTo(54, 26); g.lineTo(32, 56); g.lineTo(10, 26); g.closePath(); g.fill(); g.stroke(); g.fillStyle = 'rgba(255,255,255,.55)'; g.beginPath(); g.moveTo(32, 12); g.lineTo(44, 24); g.lineTo(32, 24); g.closePath(); g.fill(); g.strokeStyle = '#1b7f93'; g.lineWidth = 2.5; g.beginPath(); g.moveTo(10, 26); g.lineTo(54, 26); g.stroke(); }
    else if (kind.indexOf('key') === 0) { const col = KEYCOL[+kind[3]]; g.strokeStyle = shade(col, 0.5); g.lineWidth = 11; g.beginPath(); g.arc(22, 24, 12, 0, PI2); g.stroke(); g.beginPath(); g.moveTo(31, 33); g.lineTo(52, 54); g.moveTo(43, 45); g.lineTo(50, 38); g.moveTo(50, 52); g.lineTo(56, 46); g.stroke(); g.strokeStyle = col; g.lineWidth = 6; g.beginPath(); g.arc(22, 24, 12, 0, PI2); g.stroke(); g.beginPath(); g.moveTo(31, 33); g.lineTo(52, 54); g.moveTo(43, 45); g.lineTo(50, 38); g.moveTo(50, 52); g.lineTo(56, 46); g.stroke(); }
    else if (kind === 'goal') {
      const gr = g.createRadialGradient(32, 36, 2, 32, 36, 30); gr.addColorStop(0, 'rgba(255,255,255,.95)'); gr.addColorStop(0.35, s.acc); gr.addColorStop(1, 'rgba(255,255,255,0)'); g.fillStyle = gr; g.beginPath(); g.arc(32, 36, 30, 0, PI2); g.fill();
      g.fillStyle = '#fff'; g.strokeStyle = '#333'; g.lineWidth = 3; g.beginPath(); g.moveTo(24, 54); g.lineTo(24, 10); g.stroke(); g.fillStyle = '#e5484d'; g.beginPath(); g.moveTo(24, 10); g.lineTo(48, 20); g.lineTo(24, 30); g.closePath(); g.fill(); g.stroke();
    }
    else if (kind === 'ghost') { g.globalAlpha = 0.6; blob(g, 32, 34, 22, '#9fb4ff', 0, 0); }
    return c;
  }
  // なかま（プレイヤー）：まるいランタン持ち。dir は目の向き
  function blob(g, x, y, r, col, dx, dy, bob) {
    g.save(); g.translate(x, y + (bob || 0)); g.fillStyle = 'rgba(0,0,0,.25)'; g.beginPath(); g.ellipse(0, r * 0.85 - (bob || 0), r * 0.8, r * 0.28, 0, 0, PI2); g.fill();
    g.fillStyle = col; g.strokeStyle = 'rgba(0,0,0,.45)'; g.lineWidth = Math.max(1.5, r * 0.12);
    g.beginPath(); g.moveTo(-r, r * 0.7); g.quadraticCurveTo(-r * 1.05, -r * 0.9, 0, -r); g.quadraticCurveTo(r * 1.05, -r * 0.9, r, r * 0.7); g.closePath(); g.fill(); g.stroke();
    g.fillStyle = '#fff'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * r * 0.36 + dx * r * 0.12, -r * 0.1 + dy * r * 0.1, r * 0.22, 0, PI2); g.fill(); }
    g.fillStyle = '#222'; for (const sx of [-1, 1]) { g.beginPath(); g.arc(sx * r * 0.36 + dx * r * 0.2, -r * 0.1 + dy * r * 0.2, r * 0.1, 0, PI2); g.fill(); }
    g.restore();
  }

  // ---------------------------------------------------------------- 上から見た盤
  // V: { w, h（css px）, ts, cx, cy（左上のタイル座標。小数可）, skin, t, pl:{x,y,dx,dy}, ghost:{x,y}|null, vis, hint:[tile], reveal:[tile], opts }
  function draw2D(ctx, m, run, V) {
    const { w, h, ts, skin: S } = V, W = m.w, H = m.h, fog = m.mode === 'fog';
    ctx.setTransform(V.dpr || 1, 0, 0, V.dpr || 1, 0, 0);
    ctx.fillStyle = S.dark ? '#0b0c12' : '#2a2620'; ctx.fillRect(0, 0, w, h);
    const x0 = Math.max(0, Math.floor(V.cx)), y0 = Math.max(0, Math.floor(V.cy)), x1 = Math.min(W - 1, Math.ceil(V.cx + w / ts)), y1 = Math.min(H - 1, Math.ceil(V.cy + h / ts));
    const px = x => Math.round((x - V.cx) * ts), py = y => Math.round((y - V.cy) * ts), sz = Math.ceil(ts) + 1;
    ctx.imageSmoothingEnabled = ts >= 24;
    const gateNow = (g, tk) => E.gateOpen(g, (tk % m.P));
    const tk = run ? run.tk : 0;
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) {
      const i = y * W + x, X = px(x), Y = py(y);
      if (fog && !run.seen[i]) { ctx.fillStyle = S.fog; ctx.fillRect(X, Y, sz, sz); continue; }
      const gi = m.gateAt[i];
      if (!m.t[i]) { ctx.drawImage(S.tex, 0, 0, 64, 64, X, Y, sz, sz); continue; }
      ctx.fillStyle = (x + y) & 1 ? S.floor2 : S.floor; ctx.fillRect(X, Y, sz, sz);
      if (gi) {
        const g = m.gates[gi - 1], open = gateNow(g, tk), next = E.gateOpen(g, (tk + 1) % m.P);
        if (!open) { ctx.drawImage(S.gate, 0, 0, 64, 64, X, Y, sz, sz); } else { ctx.strokeStyle = next ? '#2fbf71' : '#f08a24'; ctx.lineWidth = Math.max(2, ts * 0.1); ctx.setLineDash([ts * 0.2, ts * 0.12]); ctx.strokeRect(X + ts * 0.1, Y + ts * 0.1, ts * 0.8, ts * 0.8); ctx.setLineDash([]); }
        if (!open) { ctx.strokeStyle = next ? '#2fbf71' : 'rgba(0,0,0,0)'; ctx.lineWidth = Math.max(2, ts * 0.1); if (next) ctx.strokeRect(X + 2, Y + 2, ts - 4, ts - 4); }
      }
      const dr = m.doorAt[i];
      if (dr) { if (run && ((run.mask >> (dr - 1)) & 1)) { ctx.globalAlpha = 0.35; ctx.drawImage(S.door[dr - 1], 0, 0, 64, 64, X, Y, sz, sz); ctx.globalAlpha = 1; } else ctx.drawImage(S.door[dr - 1], 0, 0, 64, 64, X, Y, sz, sz); }
      // あしあと
      if (run && V.opts.trail && run.vis[i] && i !== run.pos) { ctx.fillStyle = rgb(hex(S.acc), 0.45); ctx.beginPath(); ctx.arc(X + ts / 2, Y + ts / 2, Math.max(1.5, ts * 0.11), 0, PI2); ctx.fill(); }
    }
    // 宝・かぎ・ゴール
    const ic = (kind, i, sc, bob) => { const x = i % W, y = (i / W) | 0; if (x < x0 || x > x1 || y < y0 || y > y1) return; if (fog && !run.seen[i]) return; const s = ts * sc; ctx.drawImage(S.spr[kind], 0, 0, 64, 64, px(x) + (ts - s) / 2, py(y) + (ts - s) / 2 + (bob || 0), s, s); };
    const bob = Math.sin((V.t || 0) / 260) * ts * 0.04;
    ic('goal', m.goal, 1.15, bob);
    for (const c of m.coins) if (!run.coins.has(c)) ic('coin', c, 0.6, bob);
    for (const c of m.gems) if (!run.gems.has(c)) ic('gem', c, 0.7, bob);
    for (const k of m.keys) if (!((run.mask >> k.k) & 1)) ic('key' + k.k, k.i, 0.8, bob);
    // ヒント・答え
    const line = (path, col, dash) => { if (!path || path.length < 1) return; ctx.strokeStyle = col; ctx.lineWidth = Math.max(3, ts * 0.22); ctx.lineCap = 'round'; ctx.lineJoin = 'round'; ctx.setLineDash(dash ? [ts * 0.35, ts * 0.3] : []); ctx.beginPath(); ctx.moveTo(px(V.pl.x) + ts / 2, py(V.pl.y) + ts / 2); for (const i of path) ctx.lineTo(px(i % W) + ts / 2, py((i / W) | 0) + ts / 2); ctx.stroke(); ctx.setLineDash([]); };
    line(V.reveal, 'rgba(255,214,64,.85)', true); line(V.hint, 'rgba(70,200,255,.95)', false);
    if (V.walk) line(V.walk, 'rgba(255,255,255,.55)', true);
    // ゴースト・プレイヤー
    if (V.ghost) { ctx.globalAlpha = 0.55; blob(ctx, px(V.ghost.x) + ts / 2, py(V.ghost.y) + ts / 2, ts * 0.36, '#9fb4ff', 0, 0, 0); ctx.globalAlpha = 1; }
    blob(ctx, px(V.pl.x) + ts / 2, py(V.pl.y) + ts / 2 + bob * 0.5, ts * 0.38, S.acc, V.pl.dx || 0, V.pl.dy || 0, 0);
    // きり：いま見えていないところを暗く、プレイヤーのまわりにあかり
    if (fog) {
      for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) { const i = y * W + x; if (run.seen[i] && !V.vis[i]) { ctx.fillStyle = 'rgba(8,10,18,.55)'; ctx.fillRect(px(x), py(y), sz, sz); } }
      const cx = px(V.pl.x) + ts / 2, cy = py(V.pl.y) + ts / 2, r = (m.radius + 0.6) * ts, gr = ctx.createRadialGradient(cx, cy, ts * 0.2, cx, cy, r);
      gr.addColorStop(0, 'rgba(255,214,120,.22)'); gr.addColorStop(1, 'rgba(255,214,120,0)'); ctx.fillStyle = gr; ctx.fillRect(cx - r, cy - r, r * 2, r * 2);
    }
  }

  // ---------------------------------------------------------------- 3D（レイキャスト）
  // cam: { x, y（タイル座標。中心は +0.5）, a（ラジアン。0=右 -π/2=上） }。solid(i) → 0=すすめる 1=かべ 2..4=とびら 5=動くかべ
  function render3D(ctx, W, H, m, cam, S, solid, sprites, t) {
    ctx.setTransform(1, 0, 0, 1, 0, 0);
    const hz = Math.floor(H / 2);
    let gr = ctx.createLinearGradient(0, 0, 0, hz); gr.addColorStop(0, S.ceil); gr.addColorStop(1, S.dark ? '#1a1c28' : '#e9e3d4'); ctx.fillStyle = gr; ctx.fillRect(0, 0, W, hz);
    gr = ctx.createLinearGradient(0, hz, 0, H); gr.addColorStop(0, S.dark ? '#14151d' : '#cfc7b3'); gr.addColorStop(1, S.floor3d); ctx.fillStyle = gr; ctx.fillRect(0, hz, W, H - hz);
    const cols = Math.max(60, Math.min(220, Math.floor(W / 2))), cw = W / cols, dX = Math.cos(cam.a), dY = Math.sin(cam.a), pX = -dY * 0.66, pY = dX * 0.66, zb = new Float32Array(cols), MW = m.w, MH = m.h;
    ctx.imageSmoothingEnabled = false;
    const fr = S.fogRgb;
    for (let c = 0; c < cols; c++) {
      const camX = 2 * c / cols - 1, rdx = dX + pX * camX, rdy = dY + pY * camX;
      let mx = Math.floor(cam.x), my = Math.floor(cam.y); const ddx = Math.abs(1 / (rdx || 1e-9)), ddy = Math.abs(1 / (rdy || 1e-9));
      let sx, sy, sdx, sdy; if (rdx < 0) { sx = -1; sdx = (cam.x - mx) * ddx; } else { sx = 1; sdx = (mx + 1 - cam.x) * ddx; } if (rdy < 0) { sy = -1; sdy = (cam.y - my) * ddy; } else { sy = 1; sdy = (my + 1 - cam.y) * ddy; }
      let side = 0, hit = 0, guard = 0;
      while (!hit && guard++ < 140) { if (sdx < sdy) { sdx += ddx; mx += sx; side = 0; } else { sdy += ddy; my += sy; side = 1; } hit = (mx < 0 || my < 0 || mx >= MW || my >= MH) ? 1 : solid(my * MW + mx); }
      const perp = Math.max(0.05, side === 0 ? sdx - ddx : sdy - ddy); zb[c] = perp;
      const lh = H / perp, y0 = hz - lh / 2;
      let wx = side === 0 ? cam.y + perp * rdy : cam.x + perp * rdx; wx -= Math.floor(wx); let tx = Math.floor(wx * 64); if ((side === 0 && rdx > 0) || (side === 1 && rdy < 0)) tx = 63 - tx;
      const tex = hit >= 2 && hit <= 4 ? S.door[hit - 2] : hit === 5 ? S.gate : S.tex;
      ctx.drawImage(tex, tx, 0, 1, 64, c * cw, y0, cw + 1, lh);
      const a = clamp(perp / 9, 0, 0.88) + (side ? 0.14 : 0); ctx.fillStyle = 'rgba(' + fr[0] + ',' + fr[1] + ',' + fr[2] + ',' + clamp(a, 0, 0.92).toFixed(3) + ')'; ctx.fillRect(c * cw, y0, cw + 1, lh);
    }
    // スプライト（遠い順）
    const inv = 1 / (pX * dY - dX * pY), list = [];
    for (const s of sprites) { const dx = s.x - cam.x, dy = s.y - cam.y, tX = inv * (dY * dx - dX * dy), tY = inv * (-pY * dx + pX * dy); if (tY > 0.12) list.push({ s, tX, tY }); }
    list.sort((a, b) => b.tY - a.tY);
    for (const { s, tX, tY } of list) {
      const sz = H / tY * (s.sc || 0.5), cxs = W / 2 * (1 + tX / tY), top = hz + (H / tY) * (s.lift == null ? 0.18 : s.lift) - sz / 2 + (s.bob ? Math.sin(t / 260) * sz * 0.05 : 0), x0 = cxs - sz / 2, img = S.spr[s.kind];
      const c0 = Math.max(0, Math.floor(x0 / cw)), c1 = Math.min(cols - 1, Math.floor((x0 + sz) / cw));
      const a = clamp(1 - tY / 11, 0.25, 1);
      ctx.globalAlpha = a;
      for (let c = c0; c <= c1; c++) { if (zb[c] < tY) continue; const u = clamp(((c * cw + cw / 2) - x0) / sz, 0, 0.999); ctx.drawImage(img, Math.floor(u * 64), 0, 1, 64, c * cw, top, cw + 1, sz); }
      ctx.globalAlpha = 1;
    }
    return zb;
  }
  // ミニマップ（3Dのとき）。いまの場所のまわり ±r タイル
  function drawMini(ctx, m, run, S, x, y, size, ang, r, path) {
    const W = m.w, n = r * 2 + 1, k = size / n, px = run.pos % W, py = (run.pos / W) | 0;
    ctx.save(); ctx.globalAlpha = 0.82; ctx.fillStyle = 'rgba(8,10,16,.8)'; ctx.fillRect(x - 2, y - 2, size + 4, size + 4); ctx.globalAlpha = 1;
    for (let j = 0; j < n; j++) for (let i = 0; i < n; i++) { const tx = px - r + i, ty = py - r + j; if (tx < 0 || ty < 0 || tx >= W || ty >= m.h) continue; const id = ty * W + tx; ctx.fillStyle = !m.t[id] ? '#555b6e' : run.vis[id] ? S.floor : S.floor2; if (path && path.has(id)) ctx.fillStyle = '#ffd640'; if (id === m.goal) ctx.fillStyle = '#e5484d'; ctx.fillRect(x + i * k, y + j * k, Math.ceil(k), Math.ceil(k)); }
    ctx.translate(x + (r + 0.5) * k, y + (r + 0.5) * k); ctx.rotate(ang); ctx.fillStyle = S.acc; ctx.strokeStyle = '#000'; ctx.lineWidth = 1; ctx.beginPath(); ctx.moveTo(k * 0.7, 0); ctx.lineTo(-k * 0.5, k * 0.45); ctx.lineTo(-k * 0.5, -k * 0.45); ctx.closePath(); ctx.fill(); ctx.stroke();
    ctx.restore();
  }

  // ずかんのカード用：せかいの小さな見本（かべ・床・差し色）
  function preview(ctx, world, w, h, dark) {
    const S = skin(world, dark), n = 7, k = Math.min(w, h) / n, ox = (w - k * n) / 2, oy = (h - k * n) / 2;
    const pat = ['1111111', '1000001', '1011101', '1010001', '1010111', '1000001', '1111111'];
    ctx.imageSmoothingEnabled = true;
    for (let y = 0; y < n; y++) for (let x = 0; x < n; x++) { if (pat[y][x] === '1') ctx.drawImage(S.tex, 0, 0, 64, 64, ox + x * k, oy + y * k, k + 0.6, k + 0.6); else { ctx.fillStyle = (x + y) & 1 ? S.floor2 : S.floor; ctx.fillRect(ox + x * k, oy + y * k, k + 0.6, k + 0.6); } }
    ctx.drawImage(S.spr.coin, 0, 0, 64, 64, ox + 3 * k, oy + 3 * k, k, k); blob(ctx, ox + 1.5 * k, oy + 1.5 * k, k * 0.36, S.acc, 0, 0, 0);
  }

  root.MazeArt = { KEYCOL, skin, draw2D, render3D, drawMini, preview, blob, mix, shade, lum };
})(typeof window !== 'undefined' ? window : globalThis);
