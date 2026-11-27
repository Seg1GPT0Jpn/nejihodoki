// ぽかぽか島スポーツ：ゴルフの中身（pure。画面・時計・組み込みの乱数に頼らない。UMD：window.SportsGolf / require）。
// 9ホール・18ホールのコース（ドッグレッグ・池ごえ・島グリーン・バンカー・木・高低差・風）、8本のクラブ、ライごとの飛び・バウンド・転がり、
// 風と空気ていこうつきのボールの飛び、グリーンの傾斜とカップ（ふちはずれつき）、スコア（バーディーなどの名前）、キャディーのすすめ、CPU のホール結果。
// 同じ種・同じ入力なら毎回同じ。座標は x = 右、y = 前（メートル）。標高は height()。
(function (root) {
  'use strict';
  const C = (typeof require === 'function' && typeof module === 'object') ? require('./core.js') : root.SportsCore;
  const { rng, hash32, clamp, gauss } = C;
  const G = 9.81, TAU = Math.PI * 2, lerp = (a, b, t) => a + (b - a) * t, sstep = t => t * t * (3 - 2 * t);

  // ---------- クラブ（carry = ふつうに振った空中の距離 m。angle = 打ち出し角、lift = 揚力、roll = 着地後の転がり係数） ----------
  const CLUBS = [
    { id: 'driver', ja: 'ドライバー', en: 'Driver', carry: 215, angle: 13, lift: 0.0016, bounce: 0.5, acc: 1.35 },
    { id: 'wood3', ja: '3ウッド', en: '3 Wood', carry: 190, angle: 15, lift: 0.0017, bounce: 0.45, acc: 1.2 },
    { id: 'iron5', ja: '5アイアン', en: '5 Iron', carry: 162, angle: 20, lift: 0.0018, bounce: 0.38, acc: 1.05 },
    { id: 'iron7', ja: '7アイアン', en: '7 Iron', carry: 138, angle: 25, lift: 0.0019, bounce: 0.3, acc: 0.95 },
    { id: 'iron9', ja: '9アイアン', en: '9 Iron', carry: 114, angle: 31, lift: 0.002, bounce: 0.22, acc: 0.9 },
    { id: 'pw', ja: 'ピッチングウェッジ', en: 'Pitching Wedge', carry: 92, angle: 37, lift: 0.0021, bounce: 0.14, acc: 0.85 },
    { id: 'sw', ja: 'サンドウェッジ', en: 'Sand Wedge', carry: 66, angle: 45, lift: 0.0022, bounce: 0.06, acc: 0.8 },
    { id: 'putter', ja: 'パター', en: 'Putter', carry: 0, putt: true, acc: 0.35 },
  ];
  CLUBS.forEach((c, i) => { c.i = i; c.max = c.putt ? 30 : c.carry; });
  const PUTTER = 7, KD = 0.0021, VPUTT = 6.6;
  // ライごとの性質：dist = 飛ぶ距離の割合、acc = ばらつき、fric = 転がりのていこう m/s²、e = はね返り、h = 地面にそって失う速さ
  const LIE = {
    tee: { ja: 'ティー', en: 'Tee', dist: 1.04, acc: 0.9, fric: 1.7, e: 0.38, h: 0.55 }, fairway: { ja: 'フェアウェイ', en: 'Fairway', dist: 1, acc: 1, fric: 1.7, e: 0.38, h: 0.55 },
    fringe: { ja: 'エッジ', en: 'Fringe', dist: 0.97, acc: 1.1, fric: 1.8, e: 0.3, h: 0.5 }, rough: { ja: 'ラフ', en: 'Rough', dist: 0.8, acc: 1.8, fric: 5.2, e: 0.12, h: 0.28 },
    sand: { ja: 'バンカー', en: 'Bunker', dist: 0.62, acc: 2.2, fric: 22, e: 0, h: 0.05 }, green: { ja: 'グリーン', en: 'Green', dist: 1, acc: 0.8, fric: 0.82, e: 0.3, h: 0.6 }, water: { ja: '池', en: 'Water', dist: 1, acc: 1, fric: 99, e: 0, h: 0 },
  };
  const DIFFS = [{ sig: 0.012, wf: 27, wind: 3.2, put: 0.006, hint: 2 }, { sig: 0.026, wf: 21, wind: 5.2, put: 0.012, hint: 1 }, { sig: 0.042, wf: 16, wind: 7, put: 0.02, hint: 0 }];
  const PARS18 = [4, 3, 5, 4, 4, 3, 4, 5, 4, 4, 3, 5, 4, 3, 4, 4, 5, 4];
  const TYPES = ['par4-gentle', 'par3-island', 'par5-double', 'par4-dogleg', 'par4-carry', 'par3-bunkers', 'par4-alley', 'par5-lake', 'par4-downhill', 'par4-dogleg', 'par3-uphill', 'par5-reach', 'par4-carry', 'par3-island', 'par4-gentle', 'par4-alley', 'par5-double', 'par4-downhill'];

  // ---------- コース ----------
  function noise(seed, x, z) { const ix = Math.floor(x), iz = Math.floor(z), fx = sstep(x - ix), fz = sstep(z - iz), h = (a, b) => { let k = (Math.imul(a, 374761393) + Math.imul(b, 668265263) + seed) | 0; k = Math.imul(k ^ (k >>> 13), 1274126177); return ((k ^ (k >>> 16)) >>> 0) / 4294967296; }; return lerp(lerp(h(ix, iz), h(ix + 1, iz), fx), lerp(h(ix, iz + 1), h(ix + 1, iz + 1), fx), fz); }
  function newCourse(seed, diff, holes) {
    diff = clamp(diff | 0, 0, 2); holes = holes === 18 ? 18 : 9; const cfg = DIFFS[diff], r = rng(hash32('golf2:' + seed)), out = [];
    for (let h = 0; h < holes; h++) out.push(design(TYPES[h], PARS18[h], h, r, cfg, hash32('gh:' + seed + ':' + h)));
    return { seed, diff, cfg, holes: out, n: holes };
  }
  function design(type, par, idx, r, cfg, hs) {
    const wf = cfg.wf, len = par === 3 ? 118 + r() * 55 : par === 4 ? 290 + r() * 90 : 450 + r() * 70; let legs = [[len, 0]];
    const side = r() < 0.5 ? -1 : 1;
    if (type === 'par4-dogleg') legs = [[len * 0.55, 0.0], [len * 0.45, side * (0.7 + r() * 0.4)]]; else if (type === 'par5-double') legs = [[len * 0.36, 0], [len * 0.34, side * 0.55], [len * 0.3, -side * 0.5]]; else if (type === 'par5-lake') legs = [[len * 0.5, 0.0], [len * 0.5, side * 0.35]]; else legs = [[len, (r() - 0.5) * 0.16]];
    const path = [[0, 0]]; let ang = 0, x = 0, y = 0; for (const [l, turn] of legs) { ang += turn; x += Math.sin(ang) * l; y += Math.cos(ang) * l; path.push([x, y]); }
    const hx = x, hy = y, hz = [], trees = [], rg = par === 3 ? 15 : 17;
    const at = d => { let acc = 0; for (let i = 0; i < path.length - 1; i++) { const a = path[i], b = path[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); if (acc + l >= d) { const t = (d - acc) / l; return { x: lerp(a[0], b[0], t), y: lerp(a[1], b[1], t), ang: Math.atan2(b[0] - a[0], b[1] - a[1]) }; } acc += l; } return { x: hx, y: hy, ang: Math.atan2(hx - path[path.length - 2][0], hy - path[path.length - 2][1]) }; };
    const off = (p, lat) => ({ x: p.x + Math.cos(p.ang) * lat, y: p.y - Math.sin(p.ang) * lat });
    const total = path.reduce((s, p, i) => (i ? s + Math.hypot(p[0] - path[i - 1][0], p[1] - path[i - 1][1]) : 0), 0);
    const pond = (d, lat, rad) => { const p = off(at(d), lat); hz.push({ t: 'water', x: p.x, y: p.y, r: rad }); }, bunker = (d, lat, rad) => { const p = off(at(d), lat); hz.push({ t: 'sand', x: p.x, y: p.y, r: rad }); };
    // 高低差：e1 = ホールの標高（ティーが 0）
    let e1 = (r() - 0.5) * 4; if (type.endsWith('uphill')) e1 = 9 + r() * 5; if (type.endsWith('downhill')) e1 = -(8 + r() * 5);
    if (type === 'par3-island') { for (let k = 0; k < 7; k++) { const a = k / 7 * TAU + 0.4; const dx = Math.sin(a), dy = Math.cos(a); if (dy < -0.4 && Math.abs(dx) < 0.5) continue; hz.push({ t: 'water', x: hx + dx * (rg + 7), y: hy + dy * (rg + 7), r: 13 }); } pond(total * 0.45, 0, 20); bunker(total - 5, side * 20, 6); }
    else if (type === 'par3-bunkers') { bunker(total - 4, -17, 7); bunker(total - 4, 17, 7); bunker(total + 8, 0, 6); bunker(total - 22, side * 14, 5); }
    else if (type === 'par3-uphill') { bunker(total - 6, -18, 8); bunker(total - 6, 18, 7); pond(total * 0.5, side * 30, 13); }
    else if (type === 'par4-carry') { pond(160 + r() * 20, 0, 19); pond(160, side * 28, 15); bunker(total - 3, side * 18, 6); bunker(total - 20, -side * 16, 5); }
    else if (type === 'par4-alley') { for (let d = 190; d < 260; d += 35) { bunker(d, -(wf - 2), 6); bunker(d + 14, wf - 2, 6); } bunker(total - 3, 17, 6); bunker(total - 3, -17, 6); }
    else if (type === 'par5-lake') { pond(total * 0.55, side * (wf + 22), 40); pond(total * 0.8, -side * (wf + 26), 26); bunker(total - 4, side * 17, 6); bunker(230, -wf, 7); }
    else if (type === 'par5-double') { bunker(total * 0.36, -side * 12, 7); bunker(total * 0.7, side * 14, 8); bunker(total - 3, -17, 6); bunker(total - 3, 17, 7); }
    else if (type === 'par5-reach') { bunker(235, wf - 2, 8); bunker(300, -(wf - 1), 7); bunker(total - 3, 16, 7); pond(total - 40, -side * 30, 14); }
    else if (type === 'par4-dogleg') { bunker(legs[0][0] + 6, -side * 10, 8); bunker(total - 3, side * 16, 6); bunker(215, side * (wf + 3), 6); }
    else { bunker(225 + r() * 20, side * (wf - 1), 7); bunker(total - 3, side * 17, 6); if (r() < 0.6) pond(total * 0.4, -side * (wf + 20), 18); bunker(total - 3, -side * 17, 5); }
    // 木：フェアウェイのふちにそって。ドッグレッグの内がわはこい
    for (let d = 25; d < total - 30; d += 16 + r() * 16) { const p = at(d); for (const sg of [-1, 1]) { if (r() < 0.78) { const q = off(p, sg * (wf + 7 + r() * 14)); if (!hz.some(z => Math.hypot(z.x - q.x, z.y - q.y) < z.r + 3)) trees.push({ x: q.x, y: q.y, r: 3 + r() * 1.3, h: 11 + r() * 6 }); } } }
    if (type === 'par4-dogleg' || type === 'par5-double') { const b = path[1]; for (let k = 0; k < 7; k++) { const q = { x: b[0] + side * (wf + 6 + k * 3), y: b[1] + (k - 3) * 6 }; trees.push({ x: q.x, y: q.y, r: 3.4, h: 15 }); } }
    const wr = rng(hs); const wind = { s: Math.round(wr() * cfg.wind * 10) / 10, dir: Math.round(wr() * TAU * 100) / 100 };
    const slope = { x: Math.round((wr() - 0.5) * 0.09 * 1000) / 1000, y: Math.round((wr() - 0.5) * 0.09 * 1000) / 1000 };
    const mid = path.length > 2 ? path[1] : [hx * 0.5, hy * 0.5];
    return { idx, type, par, len: Math.round(total), hx, hy, mx: mid[0], my: mid[1], path, hz, trees, wf, rg, wind, slope, e1, ehs: hs, bend: 0 };
  }
  // 標高（m）。ティー 0 → ホール e1 のなだらかな変化に、うねりと、グリーンの傾斜
  function height(h, x, y) {
    const tx = h.hx, ty = h.hy, L = Math.hypot(tx, ty) || 1, u = clamp((x * tx + y * ty) / (L * L), 0, 1);
    let e = lerp(0, h.e1, sstep(u)) + (noise(h.ehs, x / 48, y / 48) - 0.5) * 3.2; const d = Math.hypot(x - tx, y - ty);
    const gz = h.e1 + h.slope.x * (x - tx) + h.slope.y * (y - ty); if (d < h.rg * 1.9) e = lerp(gz, e, sstep(clamp((d - h.rg * 0.9) / (h.rg * 1.0), 0, 1)));
    if (Math.hypot(x, y) < 9) e = lerp(0, e, sstep(Math.hypot(x, y) / 9));
    return e;
  }
  const grad = (h, x, y) => [(height(h, x + 0.6, y) - height(h, x - 0.6, y)) / 1.2, (height(h, x, y + 0.6) - height(h, x, y - 0.6)) / 1.2];
  function distSeg(px, py, ax, ay, bx, by) { const dx = bx - ax, dy = by - ay, l2 = dx * dx + dy * dy; let u = l2 > 0 ? ((px - ax) * dx + (py - ay) * dy) / l2 : 0; u = clamp(u, 0, 1); return Math.hypot(px - (ax + dx * u), py - (ay + dy * u)); }
  function terrain(h, x, y) {
    for (const z of h.hz) if (z.t === 'water' && Math.hypot(x - z.x, y - z.y) < z.r) return 'water';
    const d = Math.hypot(x - h.hx, y - h.hy); if (d < h.rg) return 'green'; if (d < h.rg + 2.8) return 'fringe';
    for (const z of h.hz) if (z.t === 'sand' && Math.hypot(x - z.x, y - z.y) < z.r) return 'sand';
    if (Math.hypot(x, y) < 6) return 'tee';
    let m = 1e9; for (let i = 0; i < h.path.length - 1; i++) m = Math.min(m, distSeg(x, y, h.path[i][0], h.path[i][1], h.path[i + 1][0], h.path[i + 1][1])); return m < h.wf ? 'fairway' : 'rough';
  }
  const treeAt = (h, x, y, alt) => { for (const t of h.trees) { if (Math.hypot(x - t.x, y - t.y) < t.r && alt < height(h, t.x, t.y) + t.h) return t; } return null; };

  // ---------- 打ち出し（クラブごとの初速。静かな空気で carry になるように二分探索） ----------
  const V0 = {};
  function flatCarry(c, v) { const a = c.angle * Math.PI / 180; let x = 0, z = 0, vx = v * Math.cos(a), vz = v * Math.sin(a), t = 0; for (let k = 0; k < 800; k++) { const sp = Math.hypot(vx, vz); vx += (-KD * sp * vx + c.lift * vx * vx * 0) * 0.02; vz += (-G - KD * sp * vz + c.lift * vx * vx) * 0.02; x += vx * 0.02; z += vz * 0.02; t += 0.02; if (z < 0 && t > 0.1) break; } return x; }
  function v0(c) { if (V0[c.id]) return V0[c.id]; let lo = 8, hi = 120; for (let i = 0; i < 40; i++) { const m = (lo + hi) / 2; if (flatCarry(c, m) < c.carry) lo = m; else hi = m; } return (V0[c.id] = (lo + hi) / 2); }

  // ---------- 1打（input = { dir, power 0..1, club, curve -1..1 }）。noise=false で、ばらつきなしの予想 ----------
  function simulate(run, from, input, noise_) {
    const h = run.course.holes[run.hole], club = CLUBS[clamp(input.club | 0, 0, 7)], lie = terrain(h, from.x, from.y), L = LIE[lie] || LIE.fairway;
    const r = rng(hash32('gs2:' + run.seed + ':' + run.hole + ':' + run.strokes + ':' + run.pen)), cfg = run.course.cfg; let power = clamp(input.power, 0, 1), dir = input.dir, curve = clamp(input.curve || 0, -1, 1), nice = false;
    if (noise_) {
      const sig = (club.putt ? cfg.put : cfg.sig * club.acc) * L.acc * (0.55 + 0.6 * power); nice = !club.putt && power >= 0.9 && power <= 1; dir += gauss(r) * sig * (nice ? 0.6 : 1) * (club.putt ? 1 : 1.6); curve += gauss(r) * sig * (club.putt ? 0 : 5); power *= 1 + gauss(r) * (club.putt ? 0.025 : 0.035) * (cfg.sig / 0.026);
    }
    const path = [{ x: from.x, y: from.y, h: 0, t: 0 }]; const out = { from: { x: from.x, y: from.y }, club, lie, path, water: false, holed: false, nice, tree: false, carry: 0, power };
    let x = from.x, y = from.y, t = 0;
    const a0 = height(h, x, y);
    if (!club.putt) {
      const sp = v0(club) * Math.sqrt(clamp(power, 0.02, 1.15) * L.dist), ang = club.angle * Math.PI / 180 * (lie === 'sand' ? 1.2 : 1); let vh = sp * Math.cos(ang), vz = sp * Math.sin(ang); let vx = Math.sin(dir) * vh, vy = Math.cos(dir) * vh, z = a0 + 0.05; const wv = [Math.sin(h.wind.dir) * h.wind.s * 1.6, Math.cos(h.wind.dir) * h.wind.s * 1.6]; let landed = false;
      for (let k = 0; k < 900; k++) {
        const wf = Math.min(1, (z - a0) / 12) * 0.5 + 0.5, rx = vx - wv[0] * wf, ry = vy - wv[1] * wf, sp2 = Math.hypot(rx, ry, vz), hv = Math.hypot(vx, vy) || 1;
        const side = curve * 0.05 * hv * (k * 0.02 < 0.4 ? 0.3 : 1);
        vx += (-KD * sp2 * rx + (-vy / hv) * side) * 0.02; vy += (-KD * sp2 * ry + (vx / hv) * side) * 0.02; vz += (-G - KD * sp2 * vz + club.lift * (vx * vx + vy * vy)) * 0.02;
        x += vx * 0.02; y += vy * 0.02; z += vz * 0.02; t += 0.02; const gh = height(h, x, y);
        if (k % 2 === 0) path.push({ x, y, h: Math.max(0, z - gh), t });
        if (!out.tree) { const tr = treeAt(h, x, y, z); if (tr && z - height(h, x, y) > 0.5) { out.tree = true; vx *= 0.12; vy *= 0.12; vz = Math.min(vz, 0); } }
        if (z <= gh && k > 2) { landed = true; z = gh; break; }
      }
      out.carry = Math.hypot(x - from.x, y - from.y); const te = terrain(h, x, y); path.push({ x, y, h: 0, t });
      if (te === 'water') { out.water = true; out.end = { x, y }; return out; }
      // バウンド（3回まで）：はね返りと、地面でうしろにひく力（バックスピン）
      const LL = LIE[te] || LIE.fairway; let bn = 0; const back = club.putt ? 0 : (1 - club.bounce) * 0.5;
      while (bn < 3 && vz < -1.2 && landed) { vz = -vz * LL.e * (te === 'sand' ? 0 : 1); const k0 = LL.h * (1 - back * 0.5) * (1 - clamp(club.angle - 30, 0, 20) * 0.012); vx *= k0; vy *= k0; if (te === 'sand' || LL.e === 0) { vx = vy = 0; break; } let tt = 0, zz = 0, vzz = vz; const sx = vx, sy = vy; while ((zz > 0 || vzz > 0) && tt < 3) { vzz -= G * 0.02; zz += vzz * 0.02; tt += 0.02; x += sx * 0.02; y += sy * 0.02; if (Math.round(tt / 0.02) % 2 === 0) path.push({ x, y, h: Math.max(0, zz), t: t + tt }); } t += tt; bn++; if (terrain(h, x, y) === 'water') { out.water = true; out.end = { x, y }; return out; } vz = -vzz * 0.4; if (Math.abs(vz) < 1) break; }
            return roll(h, out, x, y, vx, vy, t, noise_);
    }
    const sp = power * VPUTT; return roll(h, out, x, y, Math.sin(dir) * sp, Math.cos(dir) * sp, t, noise_);
  }
  // 転がり：地面のていこう・傾斜・カップ・池
  function roll(h, out, x, y, vx, vy, t, noise_) {
    const dt = 1 / 60; const path = out.path; let k = 0;
    for (; k < 3000; k++) {
      const te = terrain(h, x, y); if (te === 'water') { out.water = true; out.end = { x, y }; path.push({ x, y, h: 0, t }); return out; }
      const L = LIE[te] || LIE.fairway, gr = grad(h, x, y), ax = -G * 0.7 * gr[0], ay = -G * 0.7 * gr[1], sp = Math.hypot(vx, vy);
      if (sp < 0.06 && Math.hypot(ax, ay) < L.fric * 0.45) break;
      let nx = x + vx * dt, ny = y + vy * dt;
      if (te === 'green' || te === 'fringe') {
        const dd = distSeg(h.hx, h.hy, x, y, nx, ny), CUP = 0.054;
        if (dd < CUP * 1.25 && sp < 1.9 * (1.15 - dd / (CUP * 1.25) * 0.5)) { out.holed = true; out.end = { x: h.hx, y: h.hy }; path.push({ x: h.hx, y: h.hy, h: -0.05, t: t + 0.1 }); return out; }
        else if (dd < CUP + 0.045 && sp >= 1.2 && !out.lip) { out.lip = true; const sg = ((h.hx - x) * vy - (h.hy - y) * vx) > 0 ? 1 : -1, tilt = sg * (0.5 + 0.3 * (dd / CUP)); const c = Math.cos(tilt), s = Math.sin(tilt), ovx = vx; vx = vx * c - vy * s; vy = ovx * s + vy * c; vx *= 0.8; vy *= 0.8; }
      }
      const nsp = Math.max(0, sp - L.fric * dt); if (sp > 1e-9) { vx *= nsp / sp; vy *= nsp / sp; } vx += ax * dt; vy += ay * dt; x = nx; y = ny; t += dt; if (k % 4 === 0) path.push({ x, y, h: 0, t });
      if (Math.abs(x) > 700 || Math.abs(y) > 900) break;
    }
    path.push({ x, y, h: 0, t }); out.end = { x, y }; return out;
  }

  // ---------- ラン ----------
  function newRun(diff, seed, opts) {
    opts = opts || {}; const course = newCourse(seed, diff, opts.holes);
    return { kind: 'golf', diff: clamp(diff | 0, 0, 2), seed, course, hole: 0, ball: { x: 0, y: 0 }, strokes: 0, results: [], total: 0, done: false, holed: false, pen: 0, holes: course.n, last: null, shots: [] };
  }
  const MAXSTROKES = 8;
  function holePoints(par, strokes) { return Math.max(0, 10 + 5 * (par - strokes)); }
  function scoreName(par, strokes, hio) { if (hio) return { ja: 'ホールインワン！', en: 'HOLE IN ONE!', d: strokes - par }; const d = strokes - par; return d <= -3 ? { ja: 'アルバトロス！', en: 'Albatross!', d } : d === -2 ? { ja: 'イーグル！', en: 'Eagle!', d } : d === -1 ? { ja: 'バーディー！', en: 'Birdie!', d } : d === 0 ? { ja: 'パー', en: 'Par', d } : d === 1 ? { ja: 'ボギー', en: 'Bogey', d } : d === 2 ? { ja: 'ダブルボギー', en: 'Double bogey', d } : d === 3 ? { ja: 'トリプルボギー', en: 'Triple bogey', d } : { ja: 'ざんねん…', en: 'Pick up…', d }; }
  const lieOf = (run, p) => terrain(run.course.holes[run.hole], (p || run.ball).x, (p || run.ball).y);
  const autoClub = (h, x, y) => { const te = terrain(h, x, y), d = Math.hypot(h.hx - x, h.hy - y); if ((te === 'green') || (te === 'fringe' && d < 22)) return PUTTER; if (te === 'tee' && h.par > 3) return 0; for (let i = 0; i < 7; i++) if (CLUBS[i].carry * LIE[te].dist >= d * 0.98 && (i === 6 || CLUBS[i + 1].carry * LIE[te].dist < d * 0.98)) return i; return 0; };
  // 1打を打つ。結果 { path, end, lie, club, holed, water, penalty, carry, strokes, pts?, pickup?, tree, nice }
  function shoot(run, input) {
    if (run.done || run.holed) return null; const h = run.course.holes[run.hole], from = { x: run.ball.x, y: run.ball.y };
    const o = simulate(run, from, Object.assign({ club: autoClub(h, from.x, from.y) }, input), true); run.strokes++; o.penalty = 0; o.strokes = run.strokes;
    if (o.water) { o.penalty = 1; run.strokes++; run.pen++; o.end = { x: from.x, y: from.y }; o.path.push({ x: from.x, y: from.y, h: 0, t: o.path[o.path.length - 1].t + 0.6, water: true }); o.strokes = run.strokes; }
    run.ball = { x: o.end.x, y: o.end.y }; run.last = o; run.shots.push({ hole: run.hole, club: o.club.id, from, end: o.end });
    if (o.holed) { run.holed = true; o.pts = finishHole(run, true); } else if (run.strokes >= MAXSTROKES) { o.pts = finishHole(run, false); o.pickup = true; }
    return o;
  }
  function predict(run, input, from) { const h = run.course.holes[run.hole]; return simulate(run, from || run.ball, Object.assign({ club: autoClub(h, run.ball.x, run.ball.y) }, input), false); }
  function finishHole(run, holed) { const h = run.course.holes[run.hole], strokes = holed ? run.strokes : MAXSTROKES, pts = holePoints(h.par, strokes); const nm = scoreName(h.par, strokes, holed && strokes === 1); run.results.push({ par: h.par, strokes, pts, hio: holed && strokes === 1, name: nm }); run.total += pts; run.holed = true; if (run.results.length >= run.holes) run.done = true; return pts; }
  function nextHole(run) { if (run.done) return false; run.hole++; run.ball = { x: 0, y: 0 }; run.strokes = 0; run.pen = 0; run.holed = false; run.last = null; return true; }

  // ---------- キャディー（ボット共通）：予想で安全な選択肢をえらぶ ----------
  function dirTo(from, x, y) { return Math.atan2(x - from.x, y - from.y); }
  function pathTarget(h, from, dist) { // フェアウェイの中心線の上で、いまの位置から dist のところ
    let best = { x: h.hx, y: h.hy }, bd = 1e9; for (let i = 0; i < h.path.length - 1; i++) { const a = h.path[i], b = h.path[i + 1], l = Math.hypot(b[0] - a[0], b[1] - a[1]); for (let s = 0; s <= l; s += 4) { const p = { x: lerp(a[0], b[0], s / l), y: lerp(a[1], b[1], s / l) }, dd = Math.hypot(p.x - from.x, p.y - from.y); if (Math.abs(dd - dist) < bd && p.y * 0 + 1 && (p.x - from.x) * (h.hx - from.x) + (p.y - from.y) * (h.hy - from.y) > 0) { bd = Math.abs(dd - dist); best = p; } } }
    if (Math.hypot(h.hx - from.x, h.hy - from.y) <= dist) best = { x: h.hx, y: h.hy }; return best;
  }
  function advise(run, quiet) {
    const h = run.course.holes[run.hole], from = { x: run.ball.x, y: run.ball.y }, te = terrain(h, from.x, from.y), dHole = Math.hypot(h.hx - from.x, h.hy - from.y);
    if (te === 'green' || (te === 'fringe' && dHole < 24)) return advisePutt(run, from);
    let best = null; const cand = [];
    for (let ci = 0; ci < 7; ci++) for (const pw of (dHole < 95 ? [0.2, 0.3, 0.4, 0.5, 0.6, 0.7, 0.8, 0.9, 1] : [1, 0.85, 0.7])) {
      const club = CLUBS[ci]; const reach = club.carry * LIE[te].dist * (pw) * 1.08; if (reach < 8) continue; const tgt = pathTarget(h, from, Math.min(reach, dHole)); let dir = dirTo(from, tgt.x, tgt.y), o = null;
      for (let it = 0; it < 2; it++) { o = predict(run, { club: ci, power: pw, dir }); const dx = o.end.x - from.x, dy = o.end.y - from.y, d1 = Math.hypot(dx, dy) || 1, want = dirTo(from, tgt.x, tgt.y), got = Math.atan2(dx, dy); let e = want - got; while (e > Math.PI) e -= TAU; while (e < -Math.PI) e += TAU; dir += e * 0.9; }
      o = predict(run, { club: ci, power: pw, dir }); const et = terrain(h, o.end.x, o.end.y); let sc = Math.hypot(h.hx - o.end.x, h.hy - o.end.y);
      if (o.water || et === 'water') continue; if (et === 'rough') sc += 22; if (et === 'sand') sc += 45; if (o.tree) sc += 40; if (et === 'green') sc -= 20; if (et === 'fringe') sc -= 8;
      // ほかの池が近い（まちがえても入りにくい）ほうを好む
      for (const z of h.hz) if (z.t === 'water') { const dz = Math.hypot(z.x - o.end.x, z.y - o.end.y) - z.r; if (dz < 14) sc += (14 - dz) * 1.5; }
      cand.push({ club: ci, power: pw, dir, sc, end: o.end, lie: et }); if (!best || sc < best.sc) best = cand[cand.length - 1];
    }
    return best || { club: 6, power: 0.6, dir: dirTo(from, h.hx, h.hy), sc: 0, end: from, lie: te };
  }
  function advisePutt(run, from) {
    const h = run.course.holes[run.hole], d = Math.hypot(h.hx - from.x, h.hy - from.y), base = dirTo(from, h.hx, h.hy); let best = null;
    const pmax = Math.min(1, Math.sqrt(2 * 0.82 * (d + 3)) / VPUTT * 1.2 + 0.05), pmin = Math.max(0.03, Math.sqrt(2 * 0.82 * Math.max(0.1, d - 1.5)) / VPUTT * 0.7);
    for (let a = -0.12; a <= 0.1201; a += 0.016) for (let pw = pmin; pw <= pmax; pw += (pmax - pmin) / 14) { const o = predict(run, { club: PUTTER, power: pw, dir: base + a }); let sc = o.holed ? -1000 + pw * 30 : Math.hypot(h.hx - o.end.x, h.hy - o.end.y) + (o.water ? 99 : 0); if (!best || sc < best.sc) best = { club: PUTTER, power: pw, dir: base + a, sc, holed: o.holed, end: o.end }; }
    return best;
  }
  // CPU のホール結果（ボットがそのホールを打つ）。skill = ばらつきの倍率（大きいほど下手）
  function cpuHole(course, seed, hole, skill) {
    const fake = { seed: 'cpu:' + seed, course: Object.assign({}, course, { cfg: Object.assign({}, course.cfg, { sig: course.cfg.sig * skill, put: course.cfg.put * skill }) }), hole, ball: { x: 0, y: 0 }, strokes: 0, pen: 0, holed: false, done: false, results: [], holes: 99, total: 0, shots: [] };
    const er = rng(hash32('cpuerr:' + seed + ':' + hole)); let g = 0;
    while (!fake.holed && g++ < 12) { const a = advise(fake), pt = a.club === PUTTER; shoot(fake, { club: a.club, power: clamp(a.power * (1 + gauss(er) * (pt ? 0.11 : 0.06) * skill), 0.02, 1), dir: a.dir + gauss(er) * (pt ? 0.022 : 0.03) * skill }); if (fake.strokes >= MAXSTROKES && !fake.holed) break; } return fake.holed ? fake.results[0].strokes : MAXSTROKES;
  }
  function matchStatus(me, cpu) { let w = 0, l = 0; for (let i = 0; i < me.length; i++) { if (me[i] < cpu[i]) w++; else if (me[i] > cpu[i]) l++; } return { up: w - l, won: w, lost: l, halved: me.length - w - l }; }

  const api = { CLUBS, PUTTER, LIE, DIFFS, PARS18, TYPES, MAXSTROKES, newCourse, newRun, shoot, predict, advise, advisePutt, cpuHole, matchStatus, terrain, height, grad, autoClub, holePoints, scoreName, finishHole, nextHole, lieOf, v0, treeAt, VPUTT };
  api.holePoints = holePoints; if (typeof module === 'object' && module.exports) module.exports = api; else root.SportsGolf = api;
})(typeof window !== 'undefined' ? window : globalThis);
