// ぽかぽか島スポーツ：ゴルフの「会場」（3D のコース・スイング・カメラ・スコアカード・CPU とのマッチプレー）。window.SportsVenues.golf
// 中身（コース・クラブ・ボールの飛び・グリーン・スコア・キャディー）は golf.js。3D は gl.js でホールごとにコースを作って描く。
// WebGL が使えないときは、真上から見た2Dの図にきりかわる（操作は同じ）。
(function (root) {
  'use strict';
  const A = root.SportsArt, G = root.SportsGolf, GL = root.SportsGL, V = root.SportsVenues = root.SportsVenues || {};
  const { PAL, text, rr, circ } = A, { Gesture } = V.util;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), TAU = Math.PI * 2, lerp = (a, b, t) => a + (b - a) * t;
  const wrap = a => { while (a > Math.PI) a -= TAU; while (a < -Math.PI) a += TAU; return a; };
  const fontPx = (w, h) => Math.round(clamp(Math.min(w, h) * 0.04, 12, 22));
  const hex = GL.hex;

  V.golf = function (env) {
    const L = env.L, EN = L('', 'x') === 'x'; const opts = env.opts || {}, HOLES = opts.holes === 18 ? 18 : 9, CPU = !!opts.cpu;
    let w = 300, h = 400, run = null, st = 'aim', R = null, wd = null, kt = 0, cam = null, ball = { x: 0, y: 0, z: 0 }, aim = { dir: 0, club: -1, curve: 0 }, power = 0, ptr = null, zone = '', y0 = 0, x0 = 0, lastX = 0, pull = 0;
    let shot = null, ft = 0, speed = 1, banners = [], fx = [], trail = [], keys = {}, kcharge = 0, holeT = 0, introT = 0, rest = 0, rec = null, cpuStr = [], cpuCur = 0, myStr = [], replayT = 0, preview = null, previewT = 0, hit1 = false, landedFx = false;
    const SKILL = [3.2, 2.4, 1.8];

    // ---------- ホールの3Dの世界 ----------
    function buildWorld() {
      const hl = run.course.holes[run.hole]; let minx = 0, maxx = 0, miny = 0, maxy = 0; const pts = hl.path.concat(hl.hz.map(z => [z.x, z.y]), hl.trees.map(t => [t.x, t.y]));
      for (const p of pts) { minx = Math.min(minx, p[0]); maxx = Math.max(maxx, p[0]); miny = Math.min(miny, p[1]); maxy = Math.max(maxy, p[1]); }
      const cx = (minx + maxx) / 2, cy = (miny + maxy) / 2, SZ = Math.max(maxx - minx, maxy - miny) + 150, N = 192, CELL = SZ / N, HALF = SZ / 2, H = new Float32Array((N + 1) * (N + 1)); let hmin = 1e9;
      const gs = []; for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++) { const gx = cx + i * CELL - HALF, gy = cy + j * CELL - HALF, te = G.terrain(hl, gx, gy), e = G.height(hl, gx, gy); gs.push(te === 'water' ? null : e); if (te !== 'water') hmin = Math.min(hmin, e); }
      const off = 2.6 - hmin; let q = 0; for (let j = 0; j <= N; j++) for (let i = 0; i <= N; i++, q++) H[j * (N + 1) + i] = gs[q] == null ? -1.8 : gs[q] + off;
      const stripe = (gx, gy) => { const ux = hl.hx, uy = hl.hy, l = Math.hypot(ux, uy) || 1; return Math.floor((gx * ux + gy * uy) / l / 5.5) & 1; };
      const cols = { fairway: [hex('#6fd06a'), hex('#62c35f')], rough: [hex('#3f9650'), hex('#3a8c4a')], sand: [hex('#f1d896'), hex('#ead08a')], green: [hex('#8fe388'), hex('#86da80')], fringe: [hex('#78d172'), hex('#78d172')], tee: [hex('#a8e8a0'), hex('#a8e8a0')], water: [hex('#2b7d8f'), hex('#2b7d8f')] };
      const trees = hl.trees.map((t, i) => ({ x: t.x - cx, z: t.y - cy, y: G.height(hl, t.x, t.y) + off, s: t.h / 8.5, k: i % 3 ? 1 : 0 }));
      const clouds = []; for (let i = 0; i < 8; i++) clouds.push({ x: (i - 4) * 180, y: 230 + (i % 3) * 50, z: ((i * 97) % 500) - 250, s: 50 });
      wd = { N, SZ, CELL, HALF, H, marks: [], trees, palms: [], clouds, weather: 0, waveAmp: 0.12, cx, cy, off, colorAt(x, z, ah, sl, jt) { const gx = x + cx, gy = z + cy, te = G.terrain(hl, gx, gy), c = (cols[te] || cols.rough)[te === 'fairway' || te === 'green' ? stripe(gx, gy) : 0]; let k = 0.97 + jt * 0.06; if (te === 'rough' && sl > 0.5) k *= 0.9; return [c[0] * k, c[1] * k, c[2] * k]; } };
      if (R) { try { R.free(); } catch (e) {} R = null; }
      R = GL.create(env.glCanvas, wd, { quality: env.set.lp ? 0 : 2, lowPower: !!env.set.lp, hour: 14 }); if (R) { R.resize(w, h); }
    }
    const gy = (x, y) => G.height(run.course.holes[run.hole], x, y) + (wd ? wd.off : 0);
    const W3 = (x, y, hh) => ({ x: x - wd.cx, y: gy(x, y) + (hh || 0), z: y - wd.cy });
    const dirTo = (a, b) => Math.atan2(b.x - a.x, b.y - a.y);
    const curHole = () => run.course.holes[run.hole];
    const clubIdx = () => (aim.club >= 0 ? aim.club : G.autoClub(curHole(), run.ball.x, run.ball.y));
    const isPutt = () => clubIdx() === G.PUTTER;

    // ---------- はじめ・次のホール ----------
    function start() {
      run = G.newRun(env.diff, env.seed, { holes: HOLES }); myStr = []; cpuStr = []; cpuCur = 0; banners = []; fx = []; beginHole(true); setBtns();
    }
    function beginHole(first) {
      const hl = curHole(); if (env.gl3d) buildWorld(); aim = { dir: dirTo(run.ball, { x: hl.hx, y: hl.hy }), club: -1, curve: 0 }; power = 0; rec = null; preview = null; shot = null; trail = []; st = 'intro'; introT = 0; hit1 = false;
      if (CPU) cpuStr[run.hole] = G.cpuHole(run.course, env.seed, run.hole, SKILL[env.diff]);
      hudUpdate(); env.status(L('ホールを見わたしてから、はじまります（タップでスキップ）', 'A quick flyover first (tap to skip)'));
      banner(L('ホール ' + (run.hole + 1), 'Hole ' + (run.hole + 1)) + '  ' + L('パー', 'Par ') + hl.par + '  ' + hl.len + 'm', '#fff', 2.2);
    }
    function hudUpdate() {
      const hl = curHole(), d = Math.round(Math.hypot(hl.hx - run.ball.x, hl.hy - run.ball.y)), c = G.CLUBS[clubIdx()], lie = G.LIE[G.lieOf(run)];
      env.hud(L('H', 'H') + (run.hole + 1) + '/' + HOLES + '  ' + L('パー', 'Par ') + hl.par + '  ' + (run.strokes + 1) + L('打め  ', ' stroke  ') + d + 'm  ' + L(c.ja, c.en) + ' · ' + L(lie.ja, lie.en) + (CPU ? '  ' + matchText() : ''));
    }
    function matchText() { const done = Math.min(myStr.length, cpuStr.length), m = G.matchStatus(myStr.slice(0, done), cpuStr.slice(0, done)); return m.up === 0 ? L('オールスクエア', 'All square') : m.up > 0 ? L(m.up + 'UP', m.up + ' UP') : L(-m.up + 'DOWN', -m.up + ' DOWN'); }
    function setBtns() { env.setButtons([{ id: 'caddie', label: L('キャディー', 'Caddie'), main: true }, { id: 'cm', label: L('クラブ ▼', 'Club ▼') }, { id: 'cp', label: L('クラブ ▲', 'Club ▲') }, { id: 'curve', label: curveLabel() }, { id: 'replay', label: L('リプレイ', 'Replay') }, { id: 'card', label: L('スコア', 'Card') }]); }
    const curveLabel = () => aim.curve < -0.1 ? L('ドロー ◀', 'Draw ◀') : aim.curve > 0.1 ? L('▶ フェード', 'Fade ▶') : L('ストレート', 'Straight');
    function banner(txt, col, dur) { banners.push({ txt, col: col || '#fff', t: 0, dur: dur || 1.6 }); if (banners.length > 3) banners.shift(); }

    // ---------- ボタン ----------
    function caddie() {
      if (st !== 'aim') return; const a = G.advise(run); aim.club = a.club; aim.dir = a.dir; rec = a.power; aim.curve = 0; power = 0; setBtns(); hudUpdate(); preview = null;
      const c = G.CLUBS[a.club]; env.sfx('select'); banner(L('キャディー：', 'Caddie: ') + L(c.ja, c.en) + L('で ', ' at ') + Math.round(a.power * 100) + '%', '#ffd24d', 2.2); env.status(L('メーターの金色の線が おすすめの強さ', 'The gold line on the meter is the suggested power'));
    }
    function selectClub(d) { if (st !== 'aim') return; const cur = clubIdx(); let n = cur + d; n = ((n % 8) + 8) % 8; aim.club = n; rec = null; env.sfx('tap'); hudUpdate(); preview = null; }
    function cycleCurve() { aim.curve = aim.curve < -0.1 ? 0 : aim.curve > 0.1 ? -0.55 : 0.55; if (aim.curve === 0.55 && false) aim.curve = 0; setBtns(); preview = null; env.sfx('tap'); }
    function card() {
      const rows = run.results.map((r, i) => { const d = r.strokes - r.par; return '<tr><td>' + (i + 1) + '</td><td>' + r.par + '</td><td style="color:' + (d < 0 ? '#ffd24d' : d > 0 ? '#ff9a8a' : 'inherit') + ';font-weight:800">' + r.strokes + '</td>' + (CPU ? '<td>' + (cpuStr[i] == null ? '–' : cpuStr[i]) + '</td>' : '') + '<td>' + r.pts + '</td></tr>'; }).join('');
      const tp = run.results.reduce((a, r) => a + r.par, 0), ts = run.results.reduce((a, r) => a + r.strokes, 0);
      env.panel('<h2>' + L('スコアカード', 'Scorecard') + '</h2><div class="scroll"><table class="rec"><tr><th>' + L('ホール', 'Hole') + '</th><th>' + L('パー', 'Par') + '</th><th>' + L('あなた', 'You') + '</th>' + (CPU ? '<th>CPU</th>' : '') + '<th>' + L('点', 'Pts') + '</th></tr>' + rows + '<tr><td>' + L('合計', 'Total') + '</td><td>' + tp + '</td><td>' + ts + '</td>' + (CPU ? '<td>' + cpuStr.slice(0, run.results.length).reduce((a, b) => a + b, 0) + '</td>' : '') + '<td>' + run.total + '</td></tr></table>' + (CPU ? '<p>' + matchText() + '</p>' : '') + '</div>');
    }
    function replay() { if (!run.last || st !== 'aim' || !shot) return; st = 'replay'; ft = 0; replayT = 0; speed = 0.7; env.sfx('select'); }

    // ---------- スイング ----------
    const meterH = () => Math.min(h * 0.3, 190);
    function swingPower() { return clamp(pull / (Math.min(w, h) * 0.34), 0, 1.0); }
    function doShot(pw) {
      if (st !== 'aim') return; const club = clubIdx(), input = { dir: aim.dir, power: pw, club, curve: aim.curve }; shot = G.shoot(run, input); if (!shot) return;
      st = 'fly'; ft = 0; speed = Math.max(1, shot.path[shot.path.length - 1].t / 7.5); trail = []; hit1 = false; landedFx = false; rec = null; preview = null; hit = 0; env.sfx(shot.club.putt ? 'tap' : 'drop'); env.noise(0.1, { vol: 0.08, freq: shot.club.putt ? 1200 : 2600 }); env.buzz(12);
      if (shot.nice) { banner(L('ナイスショット！', 'Nice shot!'), '#ffd24d', 1.2); env.sfx('ok'); }
      myHole = true; hudUpdate();
    }
    let hit = 0, myHole = false;
    function afterShot() {
      const s = shot, hl = curHole();
      if (s.water) { env.sfx('fail'); banner(L('ポチャン！ ペナルティ +1打', 'Splash! Penalty +1'), '#9ee7ff', 2); }
      else if (s.tree) banner(L('木に当たった！', 'Hit a tree!'), '#fff', 1.2);
      if (s.holed || s.pickup) {
        const r = run.results[run.results.length - 1], nm = r.name; myStr.push(r.strokes); if (r.hio) { env.stat('hio'); if (env.highlight) env.highlight(L('ホールインワン！', 'HOLE IN ONE!')); } else if (r.strokes < r.par && env.highlight) env.highlight(r.strokes - r.par <= -2 ? L('イーグル！', 'EAGLE!') : L('バーディ！', 'BIRDIE!')); if (r.strokes < r.par) env.stat('birdie'); env.sfx(r.strokes < r.par ? 'win' : s.holed ? 'clear' : 'fail');
        banner(L(nm.ja, nm.en) + (s.holed ? '' : ''), r.strokes < r.par ? '#ffd24d' : '#fff', 2.6); if (CPU) banner(L('CPU ', 'CPU ') + cpuStr[run.hole] + L('打 → ', ' → ') + matchText(), '#9ee7ff', 2.6);
        st = 'holed'; rest = 2.8; env.status(L(nm.ja, nm.en) + '  +' + r.pts + L('点', ' pts')); void hl;
      } else { st = 'aim'; const nh = curHole(); aim.dir = dirTo(run.ball, { x: nh.hx, y: nh.hy }); aim.club = -1; aim.curve = 0; power = 0; setBtns(); hudUpdate(); preview = null; if (G.lieOf(run) === 'green' && !hit1) banner(L('ナイスオン！', 'On the green!'), '#7be0a0', 1.4); env.status(L('つぎの1打。上でむきを、下でひっぱって強さを決めよう', 'Next shot: swipe the top to aim, pull down to set power')); }
    }
    function finishHoleFlow() {
      if (run.done) { st = 'over'; const ss = run.results; env.done({ score: run.total, detail: { strokes: ss.reduce((a, r) => a + r.strokes, 0), par: ss.reduce((a, r) => a + r.par, 0), card: ss.map(r => r.strokes), hio: ss.some(r => r.hio), holes: HOLES, cpu: CPU ? { str: cpuStr.slice(0, HOLES), up: G.matchStatus(myStr, cpuStr.slice(0, myStr.length)).up } : null } }); return; }
      G.nextHole(run); beginHole(false); setBtns();
    }

    // ---------- カメラ ----------
    function camAim() { const b = run.ball, p = isPutt(), d = aim.dir, B = W3(b.x, b.y, 0), back = p ? 3.4 : 12, up = p ? 1.1 : 3.8, ahead = p ? 8 : 48; const T = { x: b.x + Math.sin(d) * ahead, y: b.y + Math.cos(d) * ahead }; const t3 = W3(T.x, T.y, 0); const cx = B.x - Math.sin(d) * back, cz = B.z - Math.cos(d) * back, cy = Math.max(B.y + up, gy(b.x - Math.sin(d) * back, b.y - Math.cos(d) * back) + 1.2 + 0.001); const ty = p ? B.y + 0.1 : lerp(B.y, t3.y, 0.6) + 4; return { x: cx, y: cy, z: cz, yaw: d, pitch: Math.atan2(ty - cy, Math.hypot(t3.x - cx, t3.z - cz) * (p ? 0.7 : 1)) * (p ? 1 : 0.8), fov: p ? 0.8 : 0.95 }; }
    function setCam(t, k) { if (!cam) { cam = Object.assign({}, t); return; } cam.x += (t.x - cam.x) * k; cam.y += (t.y - cam.y) * k; cam.z += (t.z - cam.z) * k; cam.yaw += wrap(t.yaw - cam.yaw) * k; cam.pitch += (t.pitch - cam.pitch) * k; cam.fov = lerp(cam.fov || 0.95, t.fov || 0.95, k); }
    function ballAt(tm) { const P = shot.path; let i = 0; while (i < P.length - 1 && P[i + 1].t < tm) i++; const a = P[i], b = P[Math.min(P.length - 1, i + 1)], f = b.t > a.t ? clamp((tm - a.t) / (b.t - a.t), 0, 1) : 1; return { x: lerp(a.x, b.x, f), y: lerp(a.y, b.y, f), h: lerp(a.h, b.h, f), water: !!b.water }; }

    // ---------- 更新 ----------
    function update(dt) {
      if (!run) return; kt += dt; dt = Math.min(dt, 0.05); for (const b of banners) b.t += dt; banners = banners.filter(b => b.t < b.dur); for (const f of fx) f.t += dt; fx = fx.filter(f => f.t < 1.2);
      const hl = curHole();
      if (st === 'intro') {
        introT += dt; const u = clamp(introT / 2.6, 0, 1); if (R) { const g3 = W3(hl.hx, hl.hy, 0), t3 = W3(0, 0, 0), e = u * u * (3 - 2 * u); const px = lerp(g3.x, t3.x, e) - Math.sin(aim.dir) * 30, pz = lerp(g3.z, t3.z, e) - Math.cos(aim.dir) * 30; cam = { x: px, y: lerp(g3.y + 90, t3.y + 30, e), z: pz, yaw: aim.dir, pitch: lerp(-0.5, -0.16, e), fov: 1 }; }
        if (u >= 1) { st = 'aim'; cam = null; hudUpdate(); env.status(L('上のほうを左右になぞって むきを決め、下でひっぱって はなすと打てます', 'Swipe the upper area to aim; pull down and release to swing')); }
      } else if (st === 'aim') {
        if (keys.ArrowLeft) aim.dir -= dt * 0.5; if (keys.ArrowRight) aim.dir += dt * 0.5; if (keys.Space) { kcharge = Math.min(1, kcharge + dt * 0.9); power = kcharge; } if (R) setCam(camAim(), Math.min(1, dt * 4.5));
        previewT -= dt; if (previewT <= 0 && !ptr) { previewT = 0.25; try { if (env.diff < 2 || isPutt()) preview = G.predict(run, { dir: aim.dir, power: ptr ? power : (rec != null ? rec : (isPutt() ? 0.35 : 1)), club: clubIdx(), curve: aim.curve }); else preview = null; } catch (e) { preview = null; } }
      } else if (st === 'fly' || st === 'replay') {
        const s = st === 'replay' ? 0.7 : speed; ft += dt * s; const end = shot.path[shot.path.length - 1].t; const bp = ballAt(Math.min(ft, end));
        if (st === 'replay') { replayT += dt; } ball = bp; trail.push({ x: bp.x, y: bp.y, h: bp.h }); if (trail.length > 22) trail.shift();
        if (!hit1 && ft > 0.35 && bp.h < 0.05) { hit1 = true; env.noise(0.07, { vol: 0.09, freq: 700 }); if (!shot.water) { const lt = G.terrain(hl, bp.x, bp.y); if (lt === 'sand') fx.push({ k: 'puff', x: bp.x, y: bp.y, t: 0 }); } }
        if (R) { const b3 = W3(bp.x, bp.y, bp.h); const vx = Math.sin(aim.dir), vz = Math.cos(aim.dir); let dir = aim.dir; const P = shot.path; const a2 = ballAt(Math.max(0, ft - 0.1)), n2 = ballAt(ft + 0.1); const dx = n2.x - a2.x, dy = n2.y - a2.y; if (Math.hypot(dx, dy) > 0.2) dir = Math.atan2(dx, dy); void vx; void vz; void P;
          if (st === 'fly') { const back = shot.club.putt ? 3 : 15, up = shot.club.putt ? 1.3 : 4.5; setCam({ x: b3.x - Math.sin(dir) * back, y: b3.y + up, z: b3.z - Math.cos(dir) * back, yaw: dir, pitch: Math.atan2(-up * 0.55, back), fov: 0.95 }, Math.min(1, dt * 2.6)); }
          else { const side = 30; setCam({ x: b3.x + Math.cos(dir) * side, y: b3.y + 8, z: b3.z - Math.sin(dir) * side, yaw: Math.atan2(b3.x - (b3.x + Math.cos(dir) * side), b3.z - (b3.z - Math.sin(dir) * side)), pitch: -0.12, fov: 0.8 }, Math.min(1, dt * 3)); } }
        if (shot.water && ft >= end - 0.7 && !landedFx) { landedFx = true; const q = shot.path[shot.path.length - 2]; fx.push({ k: 'splash', x: q.x, y: q.y, t: 0 }); env.noise(0.35, { vol: 0.14, freq: 900 }); }
        if (ft >= end + 0.3) { if (st === 'replay') { st = 'aim'; speed = 1; } else afterShot(); }
      } else if (st === 'holed') { rest -= dt; if (R && cam) { cam.yaw += dt * 0.25; } if (rest <= 0) finishHoleFlow(); }
      if (R && (st === 'fly' || st === 'aim' || st === 'replay' || st === 'intro' || st === 'holed') && cam) renderGL(dt);
    }
    function renderGL(dt) {
      const hl = curHole(), list = [], f3 = W3(hl.hx, hl.hy, 0); list.push({ kind: 'flag', x: f3.x, y: f3.y, z: f3.z, yaw: 0 });
      const b = (st === 'fly' || st === 'replay') ? ball : { x: run.ball.x, y: run.ball.y, h: 0 }, b3 = W3(b.x, b.y, (b.h || 0) + 0.04); const dist = Math.hypot(b3.x - cam.x, b3.y - cam.y, b3.z - cam.z);
      if (!(st === 'holed' && shot && shot.holed)) list.push({ kind: 'ball', x: b3.x, y: b3.y, z: b3.z, s: 0.2 + dist * 0.007, tint: [1, 1, 1] });
      for (let i = 0; i < trail.length - 1; i += 2) { const q = W3(trail[i].x, trail[i].y, trail[i].h + 0.05); list.push({ kind: 'ball', x: q.x, y: q.y, z: q.z, s: 0.06 + dist * 0.003, tint: [1, 1, 0.8] }); }
      if (st === 'aim' && preview && !ptr) { const P = preview.path; for (let i = 2; i < P.length; i += 2) { const q = W3(P[i].x, P[i].y, P[i].h + 0.05), dd = Math.hypot(q.x - cam.x, q.z - cam.z); if (env.diff === 2 && i > 12 && !isPutt()) break; list.push({ kind: 'ball', x: q.x, y: q.y, z: q.z, s: 0.08 + dd * 0.004, tint: [1, 0.85, 0.2] }); } }
      R.render(cam, { list, wx: 0 }, dt); R.adapt(dt * 1000);
    }

    // ---------- 入力 ----------
    return {
      start, update, resize(a, b) { w = a; h = b; if (R) R.resize(a, b); },
      button(id, down) { if (!down) return; if (id === 'caddie') caddie(); else if (id === 'cm') selectClub(-1); else if (id === 'cp') selectClub(1); else if (id === 'curve') cycleCurve(); else if (id === 'replay') replay(); else if (id === 'card') card(); },
      down(x, y, id, e) { if (st === 'intro') { introT = 99; return; } if (st === 'holed') { rest = Math.min(rest, 0.2); return; } if (st !== 'aim') return; ptr = id; x0 = lastX = x; y0 = y; zone = y < h * 0.5 ? 'aim' : 'swing'; pull = 0; power = 0; if (zone === 'swing') hit = 1; },
      move(x, y, id) { if (ptr !== id) return; if (zone === 'aim') { aim.dir += (x - lastX) * 0.0042 * env.set.sens; lastX = x; preview = null; } else { pull = Math.max(0, y - y0); power = swingPower(); } },
      up(x, y, id) { if (ptr !== id) return; ptr = null; if (zone === 'swing' && pull > 14) { const p = power; power = 0; pull = 0; doShot(p); } else { power = 0; pull = 0; } },
      key(code, down) { keys[code] = down; if (!down) { if (code === 'Space' && st === 'aim' && kcharge > 0.05) { const p = kcharge; kcharge = 0; power = 0; doShot(p); } return; } if (st === 'aim') { if (code === 'ArrowUp') selectClub(1); if (code === 'ArrowDown') selectClub(-1); if (code === 'KeyC') caddie(); if (code === 'KeyR') replay(); if (code === 'KeyX') cycleCurve(); if (code === 'Tab') card(); } if (st === 'intro') introT = 99; if (st === 'holed') rest = Math.min(rest, 0.2); },
      draw(g) {
        g.clearRect(0, 0, w, h); if (!run) return; const hl = curHole(), fs = fontPx(w, h);
        if (!R) draw2D(g);
        else { overlay3D(g, hl, fs); }
        hudOverlay(g, hl, fs);
      },
      dispose() { if (R) { try { R.free(); } catch (e) {} R = null; } },
    };

    // ---------- 3D の上に描くもの ----------
    function overlay3D(g, hl, fs) {
      if (!cam) return; const f3 = W3(hl.hx, hl.hy, 4.6), pf = R.project(f3.x, f3.y, f3.z);
      if (pf && st !== 'intro') { const d = Math.round(Math.hypot(hl.hx - (st === 'fly' ? ball.x : run.ball.x), hl.hy - (st === 'fly' ? ball.y : run.ball.y))); text(g, d + 'm', pf.x, Math.max(fs * 2.4, pf.y - 14), fs * 1.1); }
      if (st === 'aim' && preview && !ptr) { const e = preview.end, p = R.project(...Object.values(W3(e.x, e.y, 0.2))); if (p) { g.beginPath(); g.arc(p.x, p.y, 9, 0, TAU); g.lineWidth = 3; g.strokeStyle = '#ffd24d'; g.stroke(); text(g, Math.round(Math.hypot(e.x - run.ball.x, e.y - run.ball.y)) + 'm', p.x, p.y - 18, fs - 1, { color: '#ffd24d' }); } }
      // グリーンの傾斜の矢印
      const lie = G.lieOf(run); if ((lie === 'green' || lie === 'fringe' || Math.hypot(hl.hx - run.ball.x, hl.hy - run.ball.y) < 40) && (st === 'aim' || st === 'fly')) { for (let i = -3; i <= 3; i++) for (let j = -3; j <= 3; j++) { const gx = hl.hx + i * 4.2, gyy = hl.hy + j * 4.2; if (Math.hypot(i, j) * 4.2 > hl.rg - 1.5) continue; const gr = G.grad(hl, gx, gyy), m = Math.hypot(gr[0], gr[1]); const p = R.project(...Object.values(W3(gx, gyy, 0.15))); if (!p) continue; const q = R.project(...Object.values(W3(gx - gr[0] * 60, gyy - gr[1] * 60, 0.15))); if (!q) continue; const ax = q.x - p.x, ay = q.y - p.y, l = Math.hypot(ax, ay) || 1, len = clamp(m * 700, 5, 22); g.strokeStyle = 'rgba(255,255,255,.75)'; g.lineWidth = 2; g.beginPath(); g.moveTo(p.x - ax / l * len / 2, p.y - ay / l * len / 2); g.lineTo(p.x + ax / l * len / 2, p.y + ay / l * len / 2); g.stroke(); g.beginPath(); g.arc(p.x + ax / l * len / 2, p.y + ay / l * len / 2, 2.4, 0, TAU); g.fillStyle = '#fff'; g.fill(); } }
      for (const f of fx) { const e = W3(f.x, f.y, 0.2), p = R.project(e.x, e.y, e.z); if (!p) continue; const u = f.t / 1.2; if (f.k === 'splash') { for (let i = 0; i < 9; i++) { const a = i / 9 * TAU; g.fillStyle = 'rgba(190,240,255,' + (1 - u) + ')'; g.beginPath(); g.arc(p.x + Math.cos(a) * 30 * u * 1.4, p.y - Math.sin(u * 3) * 40 * (1 - u) + Math.sin(a) * 8 * u, 4 * (1 - u) + 1, 0, TAU); g.fill(); } g.strokeStyle = 'rgba(255,255,255,' + (1 - u) + ')'; g.lineWidth = 2; g.beginPath(); g.ellipse(p.x, p.y, 40 * u, 12 * u, 0, 0, TAU); g.stroke(); } else { for (let i = 0; i < 8; i++) { const a = i / 8 * TAU; g.fillStyle = 'rgba(241,216,150,' + (1 - u) + ')'; g.beginPath(); g.arc(p.x + Math.cos(a) * 26 * u, p.y - 10 * u + Math.sin(a) * 10 * u, 5 * (1 - u) + 1, 0, TAU); g.fill(); } } }
    }
    function hudOverlay(g, hl, fs) {
      // 左上：ホール情報、右上：風、下：メーター
      rr(g, 6, 6, Math.min(w * 0.5, 190), fs * 3.3, 10); g.fillStyle = 'rgba(18,59,87,.78)'; g.fill(); text(g, L('ホール ', 'Hole ') + (run.hole + 1) + '  ' + L('パー', 'Par ') + hl.par, 14, 6 + fs * 0.95, fs, { align: 'left', stroke: false }); text(g, hl.len + 'm' + (hl.e1 > 3 ? ' ' + L('のぼり', 'uphill') : hl.e1 < -3 ? ' ' + L('くだり', 'downhill') : ''), 14, 6 + fs * 2.3, fs - 1, { align: 'left', stroke: false, color: '#bfe8ff' });
      const wx = w - 46, wy = 46, wa = hl.wind.dir - aim.dir; rr(g, w - 88, 6, 82, fs * 3.9, 10); g.fillStyle = 'rgba(18,59,87,.78)'; g.fill(); g.save(); g.translate(wx + 14, wy - 4); g.rotate(wa); g.strokeStyle = '#ffd24d'; g.fillStyle = '#ffd24d'; g.lineWidth = 3; const L2 = 10 + hl.wind.s * 2.8; g.beginPath(); g.moveTo(0, L2); g.lineTo(0, -L2); g.stroke(); g.beginPath(); g.moveTo(0, -L2 - 6); g.lineTo(6, -L2 + 4); g.lineTo(-6, -L2 + 4); g.fill(); g.restore(); text(g, hl.wind.s.toFixed(1) + 'm/s', w - 47, 6 + fs * 3.2, fs - 2, { stroke: false });
      if (st === 'aim' || st === 'fly') { const mh = meterH(), mx = w - 38, my = h - mh - 14; rr(g, mx - 11, my - 4, 22, mh + 8, 11); g.fillStyle = 'rgba(0,0,0,.4)'; g.fill(); const pp = st === 'aim' ? power : 0; g.fillStyle = pp > 0.9 && pp <= 1 ? '#7be0a0' : pp > 0 ? '#ffd24d' : 'rgba(255,255,255,.2)'; const fh = mh * pp; rr(g, mx - 8, my + mh - fh, 16, fh, 8); g.fill(); g.fillStyle = 'rgba(120,255,160,.55)'; g.fillRect(mx - 12, my, 24, mh * 0.1); if (rec != null) { g.fillStyle = '#ffd24d'; g.fillRect(mx - 14, my + mh * (1 - rec), 28, 3); } const c = G.CLUBS[clubIdx()]; text(g, c.putt ? Math.round(pp * G.VPUTT * G.VPUTT / (2 * 0.82)) + 'm' : Math.round(pp * c.carry) + 'm', mx, my - 12, fs - 1); }
      const lie = G.LIE[G.lieOf(run)]; text(g, L(lie.ja, lie.en) + ' · ' + Math.round(Math.hypot(hl.hx - run.ball.x, hl.hy - run.ball.y)) + 'm', 12, h - 18, fs, { align: 'left' });
      // バナー
      banners.forEach((b, i) => { const u = clamp(b.t / 0.25, 0, 1), sc = 0.6 + 0.4 * u + Math.sin(u * Math.PI) * 0.15, a = clamp((b.dur - b.t) / 0.4, 0, 1); g.save(); g.globalAlpha = a; g.translate(w / 2, h * 0.28 + i * fs * 2.4); g.scale(sc, sc); text(g, b.txt, 0, 0, fs * 1.9, { color: b.col }); g.restore(); });
    }

    // ---------- WebGL がないときの、真上から見た図 ----------
    function draw2D(g) {
      const hl = curHole(), b = (st === 'fly' || st === 'replay') && ball ? ball : run.ball, rot = (st === 'aim' ? aim.dir : dirTo(run.ball, { x: hl.hx, y: hl.hy })), d = Math.max(30, Math.hypot(hl.hx - run.ball.x, hl.hy - run.ball.y)), sc = clamp(h * 0.62 / d, 0.7, 14), cx = lerp(run.ball.x, hl.hx, 0.4), cy = lerp(run.ball.y, hl.hy, 0.4);
      const s2 = (x, y) => { const dx = x - cx, dy = y - cy, c = Math.cos(rot), s = Math.sin(rot); return { x: w / 2 + (dx * c - dy * s) * sc, y: h * 0.5 - (dx * s + dy * c) * sc }; };
      g.fillStyle = '#3f9650'; g.fillRect(0, 0, w, h); g.lineCap = 'round'; g.lineJoin = 'round'; g.strokeStyle = '#6fd06a'; g.lineWidth = hl.wf * 2 * sc; g.beginPath(); hl.path.forEach((p, i) => { const q = s2(p[0], p[1]); if (i) g.lineTo(q.x, q.y); else g.moveTo(q.x, q.y); }); g.stroke();
      const hp = s2(hl.hx, hl.hy); circ(g, hp.x, hp.y, hl.rg * sc, '#8fe388'); for (const z of hl.hz) { const q = s2(z.x, z.y); circ(g, q.x, q.y, z.r * sc, z.t === 'water' ? '#3aa3d9' : '#f1d896'); } for (const t of hl.trees) { const q = s2(t.x, t.y); circ(g, q.x, q.y, Math.max(2, t.r * sc * 0.8), '#2c7a43'); }
      g.strokeStyle = '#fff'; g.lineWidth = 2; g.beginPath(); g.moveTo(hp.x, hp.y); g.lineTo(hp.x, hp.y - 22); g.stroke(); circ(g, hp.x, hp.y, 3, '#222');
      const bp = s2(b.x, b.y); if (st === 'aim') { const a = aim.dir - rot, pw = power > 0 ? power : (rec != null ? rec : 0.6), len = (G.CLUBS[clubIdx()].putt ? 20 : G.CLUBS[clubIdx()].carry) * pw * sc; g.setLineDash([5, 6]); g.strokeStyle = '#fff'; g.lineWidth = 3; g.beginPath(); g.moveTo(bp.x, bp.y); g.lineTo(bp.x + Math.sin(a) * len, bp.y - Math.cos(a) * len); g.stroke(); g.setLineDash([]); }
      circ(g, bp.x, bp.y - (b.h || 0) * 0.3, 4, '#fff', PAL.ink, 1.5);
    }
  };
})(typeof window !== 'undefined' ? window : globalThis);
