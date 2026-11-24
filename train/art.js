// でんしゃでいこう（train）の絵：運転席から見た線路（擬似3D）・景色・信号と標識・ホーム・天気と夜・運転台の計器。ぜんぶ Canvas 2D のベクター描き（自作）。
// 中身（engine.js）は絵のことを知らない。ここは状態を読むだけ。window.TrainArt
(function (root) {
  'use strict';
  const TAU = Math.PI * 2;
  let E = null, CFG = { dark: false, en: false, reduced: false, T: s => s };
  const clamp = (v, a, b) => v < a ? a : v > b ? b : v;
  const lerp = (a, b, t) => a + (b - a) * t;
  const FONT = '"M PLUS Rounded 1c", "Hiragino Maru Gothic ProN", "Hiragino Sans", "Yu Gothic", sans-serif';
  const hash = (a, b) => { let h = (a * 374761393 + b * 668265263) | 0; h = (h ^ (h >>> 13)) * 1274126177 | 0; return ((h ^ (h >>> 16)) >>> 0) / 4294967296; };

  // ------------------------------------------------------------------ 色
  const cc = new Map();
  function rgb(c) {
    let v = cc.get(c); if (v) return v;
    if (c[0] === '#') { const n = c.length === 4 ? c.slice(1).split('').map(x => parseInt(x + x, 16)) : [parseInt(c.slice(1, 3), 16), parseInt(c.slice(3, 5), 16), parseInt(c.slice(5, 7), 16)]; v = n; }
    else v = [128, 128, 128];
    cc.set(c, v); return v;
  }
  const h2 = n => { n = Math.round(clamp(n, 0, 255)); return (n < 16 ? '0' : '') + n.toString(16); };
  function mix(a, b, t) { if (t <= 0) return a; const A = rgb(a), B = rgb(b); return '#' + h2(lerp(A[0], B[0], t)) + h2(lerp(A[1], B[1], t)) + h2(lerp(A[2], B[2], t)); }
  const mixCache = new Map();
  // 時間帯と天気にあわせた色（景色のものは、ぜんぶこれをとおす）
  let LK = { to: '#000', k: 0, gray: '#888', g: 0 };
  function lit(c) {
    const key = c + LK.to + LK.k + LK.g;
    let v = mixCache.get(key); if (v) return v;
    v = mix(mix(c, LK.gray, LK.g), LK.to, LK.k);
    if (mixCache.size > 3000) mixCache.clear();
    mixCache.set(key, v); return v;
  }
  function setLook(R) {
    const tod = R.tod, w = R.weather;
    LK = { to: tod === 'night' ? '#070d24' : tod === 'dusk' ? '#6a3a56' : '#000', k: tod === 'night' ? 0.74 : tod === 'dusk' ? 0.3 : 0,
      gray: w === 'snow' ? '#dfe6ee' : w === 'fog' ? '#aab4bd' : '#8d9aa5', g: w === 'rain' ? 0.3 : w === 'snow' ? 0.4 : w === 'fog' ? 0.5 : w === 'cloud' ? 0.15 : 0 };
    if (tod === 'night' && w === 'fog') LK.gray = '#2a3550';
    if (tod === 'night' && w === 'snow') LK.gray = '#8d9bb8';
  }

  // ------------------------------------------------------------------ カーブ（先の道がどれだけ横にずれて見えるか）
  const STEP = 5, NS = 170;
  const OFF = new Float32Array(NS + 2), HEAD = new Float32Array(NS + 2);
  function buildCurve(x0) {
    let slope = 0, off = 0;
    for (let i = 0; i <= NS; i++) {
      OFF[i] = off; HEAD[i] = slope;
      const k = E.curveAt(x0 + i * STEP);
      slope += k * 0.00028 * STEP; off += slope * STEP;
    }
  }
  const shiftAt = z => { const f = clamp(z / STEP, 0, NS - 0.001), i = Math.floor(f); return OFF[i] + (OFF[i + 1] - OFF[i]) * (f - i); };

  // ------------------------------------------------------------------ 画面の組み立て
  const R = { st: null, W: 0, H: 0, hy: 0, f: 0, cx: 0, camH: 2.7, x0: 0, view: 800, fogD: 800, rain: [], dashH: 0, sceneH: 0, tick: 0, flash: 0, sway: 0, route: null, th: 'meadow', inTunnel: null };
  function proj(z, lat, hgt) { const s = R.f / z; return { x: R.cx + (lat - shiftAt(z) + R.sway) * s, y: R.hy + (R.camH - hgt) * s, s }; }
  const fogA = z => { const k = clamp(z / R.fogD, 0, 1); return 1 - k * k * (CFGW.fog ? 0.96 : 0.55); };
  let CFGW = { fog: false };

  // ---- 空
  function sky(c, W, hy, tod, w, t, st) {
    const g = c.createLinearGradient(0, 0, 0, hy);
    let a, b;
    if (tod === 'night') { a = '#04091c'; b = '#1b2c5a'; }
    else if (tod === 'dusk') { a = '#37407f'; b = '#ffad66'; }
    else { a = '#5eb6ee'; b = '#d9f1ff'; }
    if (w === 'rain' || w === 'snow') { a = mix(a, tod === 'night' ? '#10162c' : '#7d8794', 0.55); b = mix(b, tod === 'night' ? '#2a3350' : '#b9c0c8', 0.6); }
    if (w === 'cloud') { a = mix(a, '#8c98a6', 0.3); b = mix(b, '#e3e8ee', 0.4); }
    if (w === 'fog') { a = tod === 'night' ? '#141b30' : '#aab4bd'; b = tod === 'night' ? '#222b44' : '#d6dce1'; }
    g.addColorStop(0, a); g.addColorStop(1, b); c.fillStyle = g; c.fillRect(0, 0, W, hy + 2);
    const head = HEAD[Math.min(NS, 60)] * 600;
    // 星
    if (tod === 'night' && w !== 'fog' && w !== 'snow') {
      for (let i = 0; i < 60; i++) {
        const sx = ((hash(i, 1) * W * 1.4 - head * 0.2) % (W * 1.4) + W * 1.4) % (W * 1.4) - W * 0.2, sy = hash(i, 2) * hy * 0.85;
        const tw = 0.5 + 0.5 * Math.sin(t * 0.002 * (1 + hash(i, 3)) + i);
        c.globalAlpha = (w === 'rain' ? 0.25 : 0.9) * (0.5 + 0.5 * tw); c.fillStyle = '#fff'; c.fillRect(sx, sy, 1.6, 1.6);
      }
      c.globalAlpha = 1;
      if (w !== 'rain') { const mx = W * 0.2 - head * 0.2, my = hy * 0.3; c.fillStyle = '#f5f1d8'; c.beginPath(); c.arc(mx, my, 12, 0, TAU); c.fill(); c.fillStyle = '#1a2a52'; c.beginPath(); c.arc(mx + 5, my - 3, 11, 0, TAU); c.fill(); }
    } else if (tod === 'dusk') {
      const sx = W * 0.68 - head * 0.2, sy = hy * 0.82;
      const rg = c.createRadialGradient(sx, sy, 2, sx, sy, hy * 0.7); rg.addColorStop(0, 'rgba(255,230,160,.95)'); rg.addColorStop(0.2, 'rgba(255,170,90,.55)'); rg.addColorStop(1, 'rgba(255,150,80,0)');
      c.fillStyle = rg; c.fillRect(0, 0, W, hy); c.fillStyle = '#fff1c4'; c.beginPath(); c.arc(sx, sy, 15, 0, TAU); c.fill();
    } else if (tod === 'day' && w === 'clear') { const sx = W * 0.75 - head * 0.2; c.fillStyle = '#fff6c0'; c.beginPath(); c.arc(sx, hy * 0.3, 16, 0, TAU); c.fill(); c.fillStyle = 'rgba(255,246,192,.3)'; c.beginPath(); c.arc(sx, hy * 0.3, 26, 0, TAU); c.fill(); }
    // 雲
    if (w !== 'fog') {
      const n = w === 'clear' ? 4 : 7;
      for (let i = 0; i < n; i++) {
        const cxp = ((hash(i, 7) * W * 1.6 - head * 0.3 - t * 0.003 * (1 + hash(i, 8))) % (W * 1.6) + W * 1.6) % (W * 1.6) - W * 0.3, cyp = hy * (0.1 + 0.4 * hash(i, 9)), cw = 40 + 70 * hash(i, 10);
        const col = tod === 'night' ? (w === 'clear' ? '#1c2a52' : '#262f4a') : tod === 'dusk' ? '#f5a77f' : (w === 'rain' || w === 'snow') ? '#9ca3ac' : '#ffffff';
        c.globalAlpha = tod === 'night' && w === 'clear' ? 0.5 : 0.85; c.fillStyle = col;
        c.beginPath(); c.ellipse(cxp, cyp, cw, cw * 0.18, 0, 0, TAU); c.ellipse(cxp - cw * 0.35, cyp + 3, cw * 0.5, cw * 0.14, 0, 0, TAU); c.ellipse(cxp + cw * 0.4, cyp + 2, cw * 0.55, cw * 0.15, 0, 0, TAU); c.fill();
      }
      c.globalAlpha = 1;
    }
  }
  // 遠くの山と丘
  function hills(c, W, hy, th, st) {
    const head = HEAD[Math.min(NS, 90)] * 900;
    const layers = th === 'mountain' ? [['#6a7d99', 0.5, 90, 0.011, 0.5], ['#3f5a56', 0.8, 55, 0.02, 1.3]] : th === 'sea' ? [['#7fa6b8', 0.55, 40, 0.012, 0.3], ['#5b9a6a', 0.9, 24, 0.02, 1]] : [['#8fb7c4', 0.5, 46, 0.011, 0.4], ['#6bb26a', 0.85, 28, 0.018, 2]];
    layers.forEach((L, li) => {
      c.beginPath(); c.moveTo(0, hy + 1);
      for (let px = 0; px <= W; px += 8) {
        const u = (px - head * (0.35 + li * 0.2)) * L[3] + L[4] * 7 + li * 13;
        const hgt = L[2] * (0.45 + 0.35 * Math.sin(u) + 0.2 * Math.sin(u * 2.7 + 1.3) + (th === 'mountain' && li === 0 ? 0.35 * Math.abs(Math.sin(u * 1.7)) : 0));
        c.lineTo(px, hy - hgt * (1 - 0.0 * li));
      }
      c.lineTo(W, hy + 1); c.closePath(); c.fillStyle = lit(L[0]); c.fill();
      if (th === 'mountain' && li === 0) { c.fillStyle = lit('#f4f7fb'); c.globalAlpha = 0.9; c.beginPath(); for (let px = 0; px <= W; px += 8) { const u = (px - head * 0.35) * L[3] + L[4] * 7; const hgt = L[2] * (0.45 + 0.35 * Math.sin(u) + 0.2 * Math.sin(u * 2.7 + 1.3) + 0.35 * Math.abs(Math.sin(u * 1.7))); if (hgt > L[2] * 0.82) c.rect(px, hy - hgt, 8, 6); } c.fill(); c.globalAlpha = 1; }
    });
    // 遠くの街のあかり
    if (R.route.tod === 'night' && th !== 'mountain') { c.fillStyle = 'rgba(255,214,120,.8)'; for (let i = 0; i < 22; i++) { const px = ((hash(i, 21) * W * 1.3 - head * 0.5) % (W * 1.3) + W * 1.3) % (W * 1.3) - W * 0.15; c.fillRect(px, hy - 2 - hash(i, 22) * 5, 1.6, 1.6); } }
  }

  // ---- 地面と線路（1ラインずつ）
  function ground(c, W, H, hy, x0, th, t) {
    const night = R.route.tod === 'night';
    const grassA = lit(th === 'mountain' ? '#4f7a4a' : th === 'sea' ? '#78b05c' : '#5aa845'), grassB = lit(th === 'mountain' ? '#477143' : th === 'sea' ? '#6fa655' : '#52a03f');
    const bal = lit('#8d867b'), sl = lit('#5b4a3c'), rail = lit('#cfd5db'), railDk = lit('#7e8790');
    c.fillStyle = grassA; c.fillRect(0, hy, W, H - hy);
    const sea = th === 'sea';
    const step = 2;
    for (let y = H; y > hy + 1; y -= step) {
      const dy = y - hy, z = R.f * R.camH / dy;
      if (z > R.view) continue;
      const s = R.f / z, sh = shiftAt(z), cx = R.cx + (R.sway - sh) * s;
      const k = Math.floor((x0 + z) / 12) & 1;
      if (k) { c.fillStyle = grassB; c.fillRect(0, y - step, W, step); }
      // 海（右がわ）
      if (sea) {
        const wx = cx + 14 * s; if (wx < W) {
          const wob = Math.sin((x0 + z) * 0.35 + t * 0.003) > 0.6 ? 1 : 0;
          c.fillStyle = lit(wob ? '#6cc5ea' : '#3f9fd4'); c.fillRect(Math.max(0, wx), y - step, W - Math.max(0, wx), step);
          if (wx > 0) { c.fillStyle = lit('#e8d9a3'); c.fillRect(wx - 3 * s, y - step, 3 * s, step); }
        }
      }
      // 土手とバラスト、まくら木、レール
      const bw = 2.3 * s, bx = cx - bw;
      c.fillStyle = lit('#74705f'); c.fillRect(bx - 0.7 * s, y - step, 2 * bw + 1.4 * s, step);
      c.fillStyle = bal; c.fillRect(bx, y - step, 2 * bw, step);
      if (z < 90) { const m = Math.floor((x0 + z) / 0.72) & 1; if (m) { c.fillStyle = sl; c.fillRect(cx - 1.3 * s, y - step, 2.6 * s, step); } }
      const rw = Math.max(1, 0.09 * s);
      c.fillStyle = rail; c.fillRect(cx - 0.72 * s - rw, y - step, rw * 2, step); c.fillRect(cx + 0.72 * s - rw, y - step, rw * 2, step);
      if (z < 60) { c.fillStyle = railDk; c.fillRect(cx - 0.72 * s + rw, y - step, rw * 0.8, step); }
    }
    // 近くのレールのつや
    if (!night) {
      const g = c.createLinearGradient(0, hy, 0, H); g.addColorStop(0, 'rgba(255,255,255,.0)'); g.addColorStop(1, 'rgba(255,255,255,.0)');
    }
  }

  // ------------------------------------------------------------------ 景色（すこしずつ手前へ描く）
  function drawTree(c, p, size, kind, th) {
    const s = p.s * size; if (s < 0.4) return;
    const trunk = lit('#6a4a2d');
    if (kind === 0 || th === 'mountain') { // とがった木
      c.fillStyle = trunk; c.fillRect(p.x - 0.12 * s, p.y - 1.1 * s, 0.24 * s, 1.1 * s);
      c.fillStyle = lit(th === 'mountain' ? '#2f5d45' : '#3a8a46');
      for (let i = 0; i < 3; i++) { const w = (1.1 - i * 0.28) * s, yy = p.y - (0.7 + i * 1.0) * s; c.beginPath(); c.moveTo(p.x - w, yy); c.lineTo(p.x + w, yy); c.lineTo(p.x, yy - 1.5 * s); c.fill(); }
      if (R.route.weather === 'snow') { c.fillStyle = lit('#ffffff'); for (let i = 0; i < 3; i++) { const w = (1.1 - i * 0.28) * s, yy = p.y - (0.7 + i * 1.0) * s; c.beginPath(); c.moveTo(p.x - w * 0.5, yy - 0.7 * s); c.lineTo(p.x + w * 0.5, yy - 0.7 * s); c.lineTo(p.x, yy - 1.5 * s); c.fill(); } }
    } else { // まるい木
      c.fillStyle = trunk; c.fillRect(p.x - 0.15 * s, p.y - 1.8 * s, 0.3 * s, 1.8 * s);
      c.fillStyle = lit(kind === 1 ? '#4aa04c' : '#6dba54'); c.beginPath(); c.arc(p.x, p.y - 2.6 * s, 1.5 * s, 0, TAU); c.arc(p.x - 0.9 * s, p.y - 2.1 * s, 1.0 * s, 0, TAU); c.arc(p.x + 0.9 * s, p.y - 2.1 * s, 1.0 * s, 0, TAU); c.fill();
    }
  }
  function drawHouse(c, p, size, idx, night) {
    const s = p.s * size; if (s < 0.5) return;
    const wall = ['#f3e2c0', '#e9c9a4', '#d9e6ee', '#f2c9c0'][idx & 3], roof = ['#b8553b', '#5a6d9a', '#7a5a3b', '#3f7a5a'][(idx >> 2) & 3];
    c.fillStyle = lit(wall); c.fillRect(p.x - 2 * s, p.y - 2.6 * s, 4 * s, 2.6 * s);
    c.fillStyle = lit(roof); c.beginPath(); c.moveTo(p.x - 2.5 * s, p.y - 2.6 * s); c.lineTo(p.x, p.y - 4.2 * s); c.lineTo(p.x + 2.5 * s, p.y - 2.6 * s); c.fill();
    c.fillStyle = night ? '#ffd770' : lit('#7aa6c8'); c.fillRect(p.x - 1.4 * s, p.y - 2.0 * s, 0.9 * s, 0.9 * s); c.fillRect(p.x + 0.5 * s, p.y - 2.0 * s, 0.9 * s, 0.9 * s);
    if (R.route.weather === 'snow') { c.fillStyle = lit('#fff'); c.beginPath(); c.moveTo(p.x - 2.5 * s, p.y - 2.6 * s); c.lineTo(p.x, p.y - 4.2 * s); c.lineTo(p.x + 2.5 * s, p.y - 2.6 * s); c.lineTo(p.x + 2.1 * s, p.y - 2.6 * s); c.lineTo(p.x, p.y - 3.9 * s); c.lineTo(p.x - 2.1 * s, p.y - 2.6 * s); c.fill(); }
  }
  function drawPole(c, z, night) { // でんちゅうと架線
    const a = proj(z, -3.1, 0), b = proj(z, -3.1, 6.2), m = proj(z, 0, 5.4);
    if (a.s < 0.3) return;
    const w = Math.max(1, 0.16 * a.s);
    c.fillStyle = lit('#7c858e'); c.fillRect(a.x - w / 2, b.y, w, a.y - b.y);
    c.strokeStyle = lit('#6a727a'); c.lineWidth = Math.max(1, 0.1 * a.s); c.beginPath(); c.moveTo(b.x, b.y + 0.1 * a.s); c.lineTo(m.x, m.y); c.stroke();
  }
  function drawLamp(c, p, size, night) {
    const s = p.s * size; if (s < 0.6) return;
    c.fillStyle = lit('#6b737b'); c.fillRect(p.x - 0.07 * s, p.y - 5 * s, 0.14 * s, 5 * s);
    c.fillStyle = night ? '#fff0b0' : lit('#d7dde2'); c.fillRect(p.x - 0.5 * s, p.y - 5.2 * s, 1.0 * s, 0.25 * s);
    if (night) { const g = c.createRadialGradient(p.x, p.y - 5 * s, 0, p.x, p.y - 5 * s, 3 * s); g.addColorStop(0, 'rgba(255,240,170,.55)'); g.addColorStop(1, 'rgba(255,240,170,0)'); c.fillStyle = g; c.fillRect(p.x - 3 * s, p.y - 8 * s, 6 * s, 6 * s); }
  }
  function drawSignal(c, z, a, kind, night) {
    const p = proj(z, 2.6, 0), top = proj(z, 2.6, 5.2);
    const s = p.s; if (s < 0.35) return;
    c.fillStyle = lit('#58606a'); c.fillRect(p.x - 0.1 * s, top.y, 0.2 * s, p.y - top.y);
    const hx = p.x - 0.55 * s, hy = top.y - 0.3 * s, hw = 1.1 * s, hh = 2.7 * s;
    c.fillStyle = '#20252b'; c.fillRect(hx, hy, hw, hh);
    const cols = [['r', '#ff3b30', '#4a1512'], ['y', '#ffc928', '#4a3a10'], ['g', '#3ddc6a', '#12401f']];
    cols.forEach((L, i) => {
      const on = a === L[0], cy = hy + hh * (0.2 + i * 0.3), rr = Math.max(0.8, 0.3 * s);
      c.fillStyle = on ? L[1] : L[2]; c.beginPath(); c.arc(p.x, cy, rr, 0, TAU); c.fill();
      if (on) { const g = c.createRadialGradient(p.x, cy, 0, p.x, cy, rr * (night ? 4.5 : 3)); g.addColorStop(0, L[1] + 'cc'); g.addColorStop(1, L[1] + '00'); c.fillStyle = g; c.fillRect(p.x - rr * 5, cy - rr * 5, rr * 10, rr * 10); }
    });
  }
  function drawLimitSign(c, z, kmh, up) {
    const p = proj(z, 3.1, 0), top = proj(z, 3.1, 3.6), s = p.s; if (s < 0.4) return;
    c.fillStyle = lit('#69727b'); c.fillRect(p.x - 0.07 * s, top.y, 0.14 * s, p.y - top.y);
    const r = 0.8 * s, cy = top.y - r * 0.2;
    c.fillStyle = '#fff'; c.beginPath(); c.arc(p.x, cy, r, 0, TAU); c.fill();
    c.strokeStyle = up ? '#2a7de0' : '#d8342c'; c.lineWidth = Math.max(1, r * 0.22); c.beginPath(); c.arc(p.x, cy, r * 0.88, 0, TAU); c.stroke();
    if (r > 3.5) { c.fillStyle = '#222'; c.font = '800 ' + Math.round(r * 1.05) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(kmh), p.x, cy + r * 0.04); }
  }
  // ホームと停止位置
  function drawStation(c, S, x0, night, tick) {
    const z0 = S.x - x0, name = CFG.en ? S.name.en : S.name.ja;
    const zNear = Math.max(z0 - 110, 3.5), zFar = z0 + 6;
    if (zFar < 3.5 || zNear > R.view) return;
    const lo = -1.9, hi = -6.0, hh = 1.05;
    const A = proj(zNear, lo, hh), B = proj(zNear, hi, hh), C = proj(zFar, hi, hh), D = proj(zFar, lo, hh);
    const A0 = proj(zNear, lo, 0), D0 = proj(zFar, lo, 0);
    c.globalAlpha = fogA(z0);
    c.fillStyle = lit('#7f8790'); c.beginPath(); c.moveTo(A0.x, A0.y); c.lineTo(A.x, A.y); c.lineTo(D.x, D.y); c.lineTo(D0.x, D0.y); c.fill();
    c.fillStyle = lit(S.stop ? '#c9c2b3' : '#bdb7aa'); c.beginPath(); c.moveTo(A.x, A.y); c.lineTo(B.x, B.y); c.lineTo(C.x, C.y); c.lineTo(D.x, D.y); c.fill();
    // 点字ブロックの黄色い線
    const Ay = proj(zNear, lo - 0.6, hh), Dy = proj(zFar, lo - 0.6, hh), Ay2 = proj(zNear, lo - 1.0, hh), Dy2 = proj(zFar, lo - 1.0, hh);
    c.fillStyle = lit('#e8c43a'); c.beginPath(); c.moveTo(Ay.x, Ay.y); c.lineTo(Dy.x, Dy.y); c.lineTo(Dy2.x, Dy2.y); c.lineTo(Ay2.x, Ay2.y); c.fill();
    // 屋根の柱と屋根
    for (let zz = zFar - 8; zz > zNear; zz -= 18) {
      if (zz < 3.5) break;
      const a = proj(zz, -5.6, hh), b = proj(zz, -5.6, 4.2);
      c.fillStyle = lit('#8a929a'); c.fillRect(a.x - 0.1 * a.s, b.y, 0.2 * a.s, a.y - b.y);
    }
    const zr = Math.max(zNear, 16), r1 = proj(zr, -1.6, 4.4), r2 = proj(zr, -6.2, 4.4), r3 = proj(zFar - 2, -6.2, 4.4), r4 = proj(zFar - 2, -1.6, 4.4);
    c.fillStyle = lit(S.stop ? '#d9533f' : '#8f99a3'); if (zFar - 2 > zr + 2) { c.beginPath(); c.moveTo(r1.x, r1.y); c.lineTo(r2.x, r2.y); c.lineTo(r3.x, r3.y); c.lineTo(r4.x, r4.y); c.fill(); }
    // ひとびと
    for (let i = 0; i < 9; i++) {
      const zz = z0 - 6 - i * 11 - hash(S.x, i) * 6; if (zz < 3.5 || zz > R.view) continue;
      const p = proj(zz, -2.5 - hash(S.x, i + 20) * 2.2, hh), s = p.s; if (s < 0.5) continue;
      c.fillStyle = lit(['#e0603a', '#3a7ac8', '#4aa86a', '#d9b43a', '#8a5ac8'][i % 5]); c.fillRect(p.x - 0.22 * s, p.y - 1.1 * s, 0.44 * s, 0.8 * s);
      c.fillStyle = lit('#f0cfa8'); c.beginPath(); c.arc(p.x, p.y - 1.3 * s, 0.2 * s, 0, TAU); c.fill();
      c.fillStyle = lit('#3a3a48'); c.fillRect(p.x - 0.17 * s, p.y - 0.3 * s, 0.34 * s, 0.3 * s);
    }
    // 駅名の看板（ホームのはし）
    const sp = proj(Math.max(z0 - 4, 3.6), -3.8, 3.3), sw = 4.2 * sp.s;
    if (sp.s > 0.6) {
      c.fillStyle = lit('#1f5f9a'); c.fillRect(sp.x - sw / 2, sp.y - 0.5 * sp.s, sw, 1.0 * sp.s);
      c.fillStyle = '#fff'; c.font = '800 ' + Math.max(7, Math.round(0.62 * sp.s)) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(name, sp.x, sp.y + 0.02 * sp.s, sw * 0.94);
    }
    c.globalAlpha = 1;
    // 停止位置のマーク（止まる駅だけ）
    if (S.stop) {
      const p = proj(Math.max(z0, 3.4), -2.2, 0), top = proj(Math.max(z0, 3.4), -2.2, 2.4), s = p.s;
      if (s > 0.2) {
        const pulse = 0.65 + 0.35 * Math.sin(tick * 0.008);
        c.fillStyle = lit('#cfd3d8'); c.fillRect(p.x - 0.06 * s, top.y, 0.12 * s, p.y - top.y);
        c.fillStyle = '#ffffff'; c.fillRect(p.x - 0.55 * s, top.y - 0.6 * s, 1.1 * s, 1.3 * s);
        c.fillStyle = '#e53a30'; c.fillRect(p.x - 0.5 * s, top.y - 0.55 * s, 1.0 * s, 0.5 * s);
        c.fillStyle = '#222'; c.fillRect(p.x - 0.5 * s, top.y + 0.05 * s, 1.0 * s, 0.55 * s);
        if (s > 5) { c.fillStyle = '#fff'; c.font = '800 ' + Math.round(0.4 * s) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(CFG.en ? 'STOP' : '停', p.x, top.y - 0.3 * s); }
        // 線路の上のライン
        const q1 = proj(Math.max(z0 - 0.35, 3.4), -0.6, 0), q2 = proj(Math.max(z0 - 0.35, 3.4), 0.6, 0);
        if (z0 > 3.5) { c.globalAlpha = pulse; c.fillStyle = '#ffd23f'; c.fillRect(q1.x, q1.y - 1, q2.x - q1.x, Math.max(2, 0.18 * q1.s)); c.globalAlpha = 1; }
      }
    }
  }

  function drawWorld(c, W, H, st, t) {
    const x0 = R.x0, night = R.route.tod === 'night', th = R.th, P = E.plan(st.route);
    const items = [];
    const cell = 22, n0 = Math.floor(x0 / cell) - 1, n1 = Math.ceil((x0 + R.view) / cell);
    for (let n = n1; n >= n0; n--) {
      const z = n * cell + cell / 2 - x0; if (z < 3.2) continue;
      const th2 = E.themeAt(n * cell);
      for (let side = -1; side <= 1; side += 2) {
        const r = hash(n, side + 5), r2 = hash(n, side * 3 + 11);
        const lat = side * (7 + r2 * 26);
        if (side > 0 && th2 === 'sea' && lat > 12) continue;
        if (r < 0.34) items.push({ z, lat, kind: 'tree', k: Math.floor(r2 * 3) % 3, sz: 1 + r * 0.7, th: th2 });
        else if (r < 0.46 && Math.abs(lat) > 9 && th2 !== 'mountain') items.push({ z, lat, kind: 'house', k: Math.floor(r2 * 16), sz: 1.1 + r2 * 0.5 });
        else if (r < 0.55 && th2 === 'mountain') items.push({ z, lat: side * (6 + r2 * 12), kind: 'tree', k: 0, sz: 1.4 + r2, th: th2 });
        else if (r > 0.94) items.push({ z, lat: side * 4.2, kind: 'lamp' });
      }
      if (n % 3 === 0) items.push({ z: n * cell + cell / 2 - x0 + 0.01, lat: 0, kind: 'pole' });
    }
    for (const sg of P.sigs) { const z = sg.x - x0; if (z > 3.2 && z < R.view) items.push({ z, kind: 'sig', a: E.aspect(sg, st.t), sk: sg.kind }); }
    const ah = E.ahead(st, R.view);
    for (const L of ah.limits) { const z = L.x - x0; if (z > 3.2) items.push({ z, kind: 'lim', kmh: L.kmh, up: L.up }); }
    for (const S of ah.stations) { const z = S.x - x0; items.push({ z: z + 1, kind: 'stn', S }); }
    items.sort((a, b) => b.z - a.z);
    for (const it of items) {
      const z = it.z; if (z < 3.2 || z > R.view) continue;
      const fa = fogA(z); c.globalAlpha = fa;
      if (it.kind === 'tree') drawTree(c, proj(z, it.lat, 0), it.sz, it.k, it.th);
      else if (it.kind === 'house') drawHouse(c, proj(z, it.lat, 0), it.sz, it.k, night);
      else if (it.kind === 'lamp') drawLamp(c, proj(z, it.lat, 0), 1, night);
      else if (it.kind === 'pole') drawPole(c, z, night);
      else if (it.kind === 'sig') drawSignal(c, z, it.a, it.sk, night);
      else if (it.kind === 'lim') drawLimitSign(c, z, it.kmh, it.up);
      else if (it.kind === 'stn') { c.globalAlpha = 1; drawStation(c, it.S, x0, night, t); }
      c.globalAlpha = 1;
    }
    // 架線
    c.strokeStyle = lit('#2b2f33'); c.lineWidth = 1; c.beginPath(); let first = true;
    for (let z = 4; z < Math.min(R.view, 420); z += 12) { const p = proj(z, 0, 5.4); if (first) { c.moveTo(p.x, p.y); first = false; } else c.lineTo(p.x, p.y); }
    c.stroke();
  }

  // ---- 天気
  function weather(c, W, H, hy, st, t) {
    const w = R.route.weather, v = st.sp || 0;
    if (w === 'rain') {
      c.strokeStyle = 'rgba(210,225,245,.55)'; c.lineWidth = 1; c.beginPath();
      for (let i = 0; i < 90; i++) {
        const xx = (hash(i, 31) * W + (t * 0.02 * (1 + hash(i, 33)) * 0)) % W, yy = ((hash(i, 32) * H + t * (0.9 + hash(i, 34) * 0.6)) % (H + 20)) - 10;
        c.moveTo(xx, yy); c.lineTo(xx - 3 - v * 0.15, yy + 14 + v * 0.3);
      }
      c.stroke();
      c.fillStyle = 'rgba(200,220,245,.35)';
      for (let i = 0; i < 14; i++) { const xx = hash(i, 41) * W, yy = hy * 0.7 + hash(i, 42) * (H - hy), life = ((t * 0.0006 + hash(i, 43)) % 1); c.beginPath(); c.ellipse(xx, yy + life * 16, 2.2 * (1 - life * 0.5), 3.4 * (1 - life * 0.5), 0, 0, TAU); c.fill(); }
    } else if (w === 'snow') {
      c.fillStyle = 'rgba(255,255,255,.9)';
      for (let i = 0; i < 80; i++) {
        const sz = 1 + hash(i, 51) * 2, xx = ((hash(i, 52) * W + Math.sin(t * 0.0012 + i) * 14 - v * 0.8 * (sz / 3) * 0) % W + W) % W, yy = (hash(i, 53) * H + t * (0.05 + sz * 0.025) + v * 3) % H;
        c.beginPath(); c.arc(xx, yy, sz, 0, TAU); c.fill();
      }
    } else if (w === 'fog') {
      const g = c.createLinearGradient(0, hy - 60, 0, hy + 110); const col = R.route.tod === 'night' ? '20,28,48' : '195,205,214';
      g.addColorStop(0, 'rgba(' + col + ',0)'); g.addColorStop(0.45, 'rgba(' + col + ',.85)'); g.addColorStop(1, 'rgba(' + col + ',0)'); c.fillStyle = g; c.fillRect(0, hy - 60, W, 170);
    }
  }
  // 夜のヘッドライト
  function headlight(c, W, H, hy) {
    if (R.route.tod === 'day' && R.route.weather !== 'fog') return;
    const night = R.route.tod === 'night';
    const g = c.createRadialGradient(R.cx, hy + (H - hy) * 0.55, 4, R.cx, hy + (H - hy) * 0.55, (H - hy) * 1.2);
    g.addColorStop(0, night ? 'rgba(255,248,210,.42)' : 'rgba(255,248,210,.12)'); g.addColorStop(1, 'rgba(255,248,210,0)');
    c.save(); c.globalCompositeOperation = 'lighter'; c.fillStyle = g; c.fillRect(0, hy, W, H - hy); c.restore();
  }
  // トンネル
  function tunnel(c, W, H, hy, st) {
    const x0 = R.x0, T = E.TUNNELS;
    let inside = null;
    for (const z of T) if (x0 >= z.a && x0 < z.b) inside = z;
    // 入口と出口の枠
    for (const z of T) {
      for (const edge of [z.a, z.b]) {
        const d = edge - x0; if (d < 4 || d > R.view) continue;
        const a = proj(d, -4.2, 0), b = proj(d, 4.2, 0), top = proj(d, 0, 6.6);
        c.fillStyle = lit('#8d8a82'); c.beginPath(); c.moveTo(a.x - 1.2 * a.s, a.y); c.lineTo(a.x - 1.2 * a.s, top.y + 1.5 * a.s); c.quadraticCurveTo((a.x + b.x) / 2, top.y - 3.5 * a.s, b.x + 1.2 * a.s, top.y + 1.5 * a.s); c.lineTo(b.x + 1.2 * a.s, b.y); c.lineTo(b.x, b.y); c.lineTo(b.x, top.y + 2.5 * a.s); c.quadraticCurveTo((a.x + b.x) / 2, top.y - 1 * a.s, a.x, top.y + 2.5 * a.s); c.lineTo(a.x, a.y); c.fill();
        if (edge === z.a) { c.fillStyle = '#05060a'; c.beginPath(); c.moveTo(a.x, a.y); c.lineTo(a.x, top.y + 2.5 * a.s); c.quadraticCurveTo((a.x + b.x) / 2, top.y - 1 * a.s, b.x, top.y + 2.5 * a.s); c.lineTo(b.x, b.y); c.fill(); }
      }
    }
    if (inside) {
      // 中：暗いかべと天井、あかりの列
      c.fillStyle = '#0b0c10'; c.fillRect(0, 0, W, hy);
      const far = Math.min(inside.b - x0, R.view);
      for (let z = 24 + (x0 % 14 ? 14 - (x0 % 14) : 0); z < far; z += 14) {
        const p = proj(z, -2.6, 4.6), q = proj(z, 2.6, 4.6);
        c.fillStyle = 'rgba(255,214,140,.9)'; c.fillRect(p.x - 0.4 * p.s, p.y, 0.8 * p.s, 0.25 * p.s); c.fillRect(q.x - 0.4 * p.s, q.y, 0.8 * p.s, 0.25 * p.s);
      }
      c.fillStyle = 'rgba(8,9,14,.55)'; c.fillRect(0, hy, W, H - hy);
    }
  }

  // ------------------------------------------------------------------ 運転台
  function cabFrame(c, W, H, sceneH, t) {
    c.fillStyle = '#12151b'; c.beginPath(); c.moveTo(0, 0); c.lineTo(W * 0.045, 0); c.lineTo(W * 0.015, sceneH); c.lineTo(0, sceneH); c.fill();
    c.beginPath(); c.moveTo(W, 0); c.lineTo(W * 0.955, 0); c.lineTo(W * 0.985, sceneH); c.lineTo(W, sceneH); c.fill();
    c.fillStyle = '#12151b'; c.fillRect(0, 0, W, Math.max(3, H * 0.012));
  }
  function arcGauge(c, cx, cy, r, v, vmax, lim) {
    const a0 = Math.PI * 0.8, a1 = Math.PI * 2.2;
    c.lineCap = 'round';
    c.lineWidth = Math.max(5, r * 0.16); c.strokeStyle = '#2a303a'; c.beginPath(); c.arc(cx, cy, r, a0, a1); c.stroke();
    const f = clamp(v / vmax, 0, 1);
    c.strokeStyle = v > lim + 2 ? '#ff5a4a' : '#43d27a'; c.beginPath(); c.arc(cx, cy, r, a0, a0 + (a1 - a0) * f); c.stroke();
    const al = a0 + (a1 - a0) * clamp(lim / vmax, 0, 1);
    c.strokeStyle = '#ffd23f'; c.lineWidth = Math.max(3, r * 0.1); c.beginPath(); c.moveTo(cx + Math.cos(al) * (r - r * 0.2), cy + Math.sin(al) * (r - r * 0.2)); c.lineTo(cx + Math.cos(al) * (r + r * 0.2), cy + Math.sin(al) * (r + r * 0.2)); c.stroke();
    c.lineCap = 'butt';
  }
  const NOTCHES = [-8, -7, -6, -5, -4, -3, -2, -1, 0, 1, 2, 3, 4, 5];
  const notchName = n => n === -8 ? 'EB' : n < 0 ? 'B' + (-n) : n === 0 ? 'N' : 'P' + n;
  function fmtT(s) { s = Math.max(0, Math.round(s)); return Math.floor(s / 60) + ':' + ('0' + (s % 60)).slice(-2); }
  function dashboard(c, W, H, st, o) {
    const T = CFG.T, dh = R.dashH, y0 = H - dh;
    const inL = o.inset ? o.inset.l : 0, inR = o.inset ? o.inset.r : 0;
    const g = c.createLinearGradient(0, y0, 0, H); g.addColorStop(0, '#222833'); g.addColorStop(1, '#10131a'); c.fillStyle = g; c.fillRect(0, y0, W, dh);
    c.fillStyle = '#3b4352'; c.fillRect(0, y0, W, 2);
    const aw = W - inL - inR, ax = inL;
    const kmh = Math.round(st.sp * 3.6), lim = E.limitNow(st), P = E.plan(st.route);
    const cyc = y0 + dh * 0.56;
    // 速度計
    const gr = Math.min(dh * 0.42, aw * 0.12), gx = ax + gr * 1.35;
    arcGauge(c, gx, cyc + gr * 0.18, gr, kmh, 110, lim);
    c.fillStyle = kmh > lim + 2 ? '#ff7a6a' : '#fff'; c.font = '800 ' + Math.round(gr * 0.9) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(kmh), gx, cyc + gr * 0.08);
    c.fillStyle = '#9aa6b8'; c.font = '700 ' + Math.max(9, Math.round(gr * 0.28)) + 'px ' + FONT; c.fillText('km/h', gx, cyc + gr * 0.68);
    // ノッチ
    const nameW = Math.max(34, dh * 0.62), nx0 = gx + gr * 1.35, nx = nx0 + nameW, nw = Math.max(60, Math.min(aw - (nx - ax) - 4, aw * 0.5)), cw = nw / NOTCHES.length, ny = y0 + dh * 0.16;
    const cur = st.ats && st.ats.on ? -8 : st.notch;
    for (let i = 0; i < NOTCHES.length; i++) {
      const n = NOTCHES[i], on = n === st.notch, eff = n === cur;
      const hgt = dh * (0.18 + 0.2 * Math.abs(n) / 8 * (n < 0 ? 1 : 0.6) * (n === 0 ? 0 : 1));
      const px = nx + i * cw + 1;
      c.fillStyle = n === 0 ? (on ? '#e8edf5' : '#394252') : n < 0 ? (on ? (n === -8 ? '#ff4a3a' : '#ff9a3a') : '#3f3430') : (on ? '#4ad98a' : '#243c33');
      if (!on && eff) c.fillStyle = '#ff4a3a';
      c.fillRect(px, ny + dh * 0.38 - hgt, Math.max(2, cw - 2), hgt + dh * 0.02);
    }
    c.fillStyle = '#e8edf5'; c.font = '800 ' + Math.max(14, Math.round(dh * 0.3)) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle';
    c.fillText(st.ats && st.ats.on ? 'EB' : notchName(st.notch), nx0 + nameW / 2 - 2, y0 + dh * 0.4);
    c.fillStyle = '#7d889b'; c.font = '700 ' + Math.max(8, Math.round(dh * 0.14)) + 'px ' + FONT; c.textBaseline = 'alphabetic';
    c.textAlign = 'left'; c.fillText(T('ブレーキ'), nx, y0 + dh * 0.82); c.textAlign = 'right'; c.fillText(T('力行'), nx + nw, y0 + dh * 0.82);
    c.textAlign = 'center'; c.fillText(T('切'), nx + 8.5 * cw, y0 + dh * 0.82);
    // ブレーキ圧のようす
    c.fillStyle = '#394252'; c.fillRect(nx, y0 + dh * 0.08, nw, 3);
    c.fillStyle = st.br > 0.05 ? '#ff9a3a' : '#4ad98a'; const bf = st.br > 0.05 ? clamp(st.br / 1.25, 0, 1) : clamp(st.tr / 1.05, 0, 1);
    c.fillRect(nx, y0 + dh * 0.08, nw * bf, 3);
  }

  // ---- 画面の上の表示（制限・信号・つぎの駅・ダイヤ）
  function hud(c, W, H, st, o) {
    const T = CFG.T, P = E.plan(st.route), top = o.top || 0, dh = R.dashH;
    const lim = E.limitNow(st), kmh = st.sp * 3.6;
    const inL = o.inset ? o.inset.l : 0, inR = o.inset ? o.inset.r : 0;
    const narrow = W < 520;
    const bw = narrow ? W - 20 : Math.min(W - 24, 360), bx = narrow ? 10 : W - bw - 10 - (o.hudR || 0), by = top + 6;
    const r = clamp(Math.min(W, H) * 0.075, 22, 30), lx = (o.hudL || 12) + r, ly = narrow ? by + 56 + r + 4 : top + r + 6;
    c.fillStyle = '#fff'; c.beginPath(); c.arc(lx, ly, r, 0, TAU); c.fill();
    c.strokeStyle = kmh > lim + 2 ? '#ff2a1a' : '#d8342c'; c.lineWidth = r * 0.2; c.beginPath(); c.arc(lx, ly, r * 0.87, 0, TAU); c.stroke();
    c.fillStyle = '#1b1b1b'; c.font = '800 ' + Math.round(r * 0.95) + 'px ' + FONT; c.textAlign = 'center'; c.textBaseline = 'middle'; c.fillText(String(lim), lx, ly + 1);
    const ah = E.ahead(st, 400); const nl = ah.limits[0];
    if (nl) {
      const nx = lx + r + 8; const txt = T('あと {n}m で {k}', { n: Math.round(nl.d / 10) * 10, k: nl.kmh }); c.font = '800 ' + Math.round(r * 0.5) + 'px ' + FONT;
      const tw = c.measureText(txt).width + 12; c.fillStyle = 'rgba(8,10,16,.66)'; c.fillRect(nx, ly - r * 0.4, tw, r * 0.8); c.fillStyle = nl.up ? '#9be0ff' : '#ffd0a0'; c.textAlign = 'left'; c.fillText(txt, nx + 6, ly + 1);
    }
    // つぎの駅
    const stp = P.stops[Math.min(st.k, P.stops.length - 1)];
    const dS = stp.x - st.x;
    c.fillStyle = 'rgba(8,10,16,.7)'; roundRect(c, bx, by, bw, 50, 10); c.fill();
    const nm = CFG.en ? stp.name.en : stp.name.ja;
    c.fillStyle = '#9fb0c8'; c.font = '700 11px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'alphabetic';
    c.fillText(st.phase === 'dwell' ? T('いま：{n}', { n: CFG.en ? P.stops[st.k - 1].name.en : P.stops[st.k - 1].name.ja }) : T('つぎ：{n}', { n: nm }), bx + 10, by + 16);
    c.fillStyle = '#fff'; c.font = '800 20px ' + FONT;
    if (st.phase === 'run') c.fillText(dS >= 0 ? Math.max(0, Math.round(dS)) + ' m' : '+' + Math.round(-dS) + ' m', bx + 10, by + 40); else c.fillText(T('発車 {t}', { t: fmtT(stp.sDep) }), bx + 10, by + 40);
    if (o.asst != null && st.phase === 'run') {
      const a = o.asst, txt = Math.abs(a) < 1 ? T('B4 でぴたり') : a < 0 ? T('B4 だと {n}m 手前', { n: Math.round(-a) }) : T('B4 だと {n}m のりすごし', { n: Math.round(a) });
      c.font = '700 11px ' + FONT; c.fillStyle = Math.abs(a) < 1.5 ? '#7be0a0' : a > 0 ? '#ff9a8a' : '#8ac8ff'; c.textAlign = 'right'; c.fillText(txt, bx + bw - 10, by + 44 - (narrow ? 0 : 0));
    }
    // 進み具合のバー
    const prev = P.stops[Math.max(0, st.k - 1)], span = Math.max(1, stp.x - prev.x), pf = clamp((st.x - prev.x) / span, 0, 1.02);
    const px = bx + bw * 0.4, pw = bw * 0.56;
    c.fillStyle = '#3a4252'; c.fillRect(px, by + 24, pw, 5); c.fillStyle = '#43d27a'; c.fillRect(px, by + 24, pw * Math.min(1, pf), 5);
    c.fillStyle = '#fff'; c.beginPath(); c.arc(px + pw * Math.min(1, pf), by + 26.5, 5, 0, TAU); c.fill();
    c.fillStyle = '#ffd23f'; c.fillRect(px + pw - 2, by + 19, 3, 15);
    // ダイヤとのずれ
    if (st.phase === 'run') {
      const delta = st.t - E.timeAt(st.route, st.x), ok = Math.abs(delta) <= 5;
      const txt = (CFG.en ? 'Time ' : 'ダイヤ ') + (delta >= 0 ? '+' : '') + Math.round(delta) + (CFG.en ? 's' : '秒');
      c.font = '800 12px ' + FONT; c.textAlign = 'right'; c.fillStyle = ok ? '#7be0a0' : delta > 0 ? '#ff9a8a' : '#8ac8ff'; c.fillText(txt, bx + bw - 10, by + 16);
    }
    // 時計と信号
    c.textAlign = 'left'; c.fillStyle = '#fff';
    const sg = E.nextSignal(st);
    if (sg && sg.d < 400 && st.phase === 'run') {
      const sx = lx - r, sy = ly + r + 8; c.fillStyle = 'rgba(8,10,16,.62)'; roundRect(c, sx, sy, 92, 24, 8); c.fill();
      const col = sg.a === 'r' ? '#ff3b30' : sg.a === 'y' ? '#ffc928' : '#3ddc6a'; c.fillStyle = col; c.beginPath(); c.arc(sx + 13, sy + 12, 7, 0, TAU); c.fill();
      c.fillStyle = '#fff'; c.font = '800 12px ' + FONT; c.textAlign = 'left'; c.textBaseline = 'middle'; c.fillText(T('信号 {n}m', { n: Math.round(sg.d / 10) * 10 }), sx + 25, sy + 13);
    }
  }
  function roundRect(c, x, y, w, h, r) { r = Math.min(r, w / 2, h / 2); c.beginPath(); c.moveTo(x + r, y); c.arcTo(x + w, y, x + w, y + h, r); c.arcTo(x + w, y + h, x, y + h, r); c.arcTo(x, y + h, x, y, r); c.arcTo(x, y, x + w, y, r); c.closePath(); }

  // ------------------------------------------------------------------ 全体
  function draw(c, W, H, st, o) {
    o = o || {}; const t = o.t || 0;
    const rt = E.byId(st.route); R.route = rt; R.st = st; R.W = W; R.H = H; R.tick = t;
    setLook(rt); CFGW.fog = rt.weather === 'fog';
    const dash = o.noDash ? 0 : clamp(H * 0.25, 60, 118); R.dashH = dash;
    const sceneH = H - dash; R.sceneH = sceneH;
    const v = st.sp || 0, x = st.x;
    R.x0 = x; R.th = E.themeAt(x); R.cx = W / 2; R.f = Math.min(W * 0.72, sceneH * 1.7); R.camH = 2.7;
    R.view = rt.weather === 'fog' ? 260 : rt.weather === 'snow' ? 420 : rt.weather === 'rain' ? 520 : 780; R.fogD = R.view;
    const bob = CFG.reduced ? 0 : Math.sin(x * 1.7) * 0.9 * Math.min(1, v / 14) + Math.sin(x * 0.53) * 0.5 * Math.min(1, v / 20);
    R.sway = CFG.reduced ? 0 : Math.sin(x * 0.21) * 0.05 * Math.min(1, v / 16);
    R.hy = sceneH * 0.42 + bob + E.gradeAt(x) * sceneH * 1.6;
    buildCurve(x);
    c.save();
    c.beginPath(); c.rect(0, 0, W, sceneH); c.clip();
    sky(c, W, R.hy, rt.tod, rt.weather, t, st);
    hills(c, W, R.hy, R.th, st);
    ground(c, W, sceneH, R.hy, x, R.th, t);
    drawWorld(c, W, sceneH, st, t);
    tunnel(c, W, sceneH, R.hy, st);
    headlight(c, W, sceneH, R.hy);
    weather(c, W, sceneH, R.hy, st, t);
    // ATS・夜のかげ
    if (st.ats && st.ats.on) { c.fillStyle = 'rgba(255,40,30,' + (0.12 + 0.08 * Math.sin(t * 0.02)) + ')'; c.fillRect(0, 0, W, sceneH); }
    cabFrame(c, W, H, sceneH, t);
    c.restore();
    if (!o.noDash) dashboard(c, W, H, st, o);
    if (!o.noHud) hud(c, W, H, st, o);
  }
  root.TrainArt = {
    init(o) { E = o.E; if (o.cfg) Object.assign(CFG, o.cfg); },
    setCfg(o) { Object.assign(CFG, o); },
    draw, notchName, fmtT, mix,
  };
})(typeof window !== 'undefined' ? window : globalThis);
