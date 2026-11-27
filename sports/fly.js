// ぽかぽか島スポーツ：3D の島の「ハブ」と「遊覧飛行」。window.SportsFly
//   create(glCanvas, opts) → view | null（WebGL がなければ null：そのときは2D の地図のハブを使う）
//   view.hub：島をまわるカメラ・ランドマークの目印（2D の上描き）・タップで選ぶ
//   view.flightVenue(env)：飛行の「会場」（venues と同じ { start, resize, down, move, up, key, update, draw, button }）
(function (root) {
  'use strict';
  const I = root.SportsIsland, W = root.SportsWorld, GL = root.SportsGL, ART = root.SportsArt, C = root.SportsCore;
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x)), TAU = Math.PI * 2, lerp = (a, b, t) => a + (b - a) * t;
  const NAMES = { town: ['ぽかぽかタウン', 'Pokapoka Town'], lighthouse: ['しろい灯台', 'White Lighthouse'], harbor: ['のんびり港', 'Sleepy Harbor'], airstrip: ['空港（ひこうじょう）', 'Airstrip'], volcano: ['まるい火山', 'Round Volcano'] };
  const spotName = (id, EN) => { if (NAMES[id]) return NAMES[id][EN ? 1 : 0]; const s = C.sportOf(id); return s ? (EN ? s.en : s.ja) : id; };
  const fontPx = (w, h) => Math.round(clamp(Math.min(w, h) * 0.04, 12, 22));

  function create(glCanvas, opts) {
    opts = opts || {}; const world = W.generate(opts.seed || 'sunny-isle-1'); let R = null;
    try { R = GL.create(glCanvas, world, { quality: opts.quality, lowPower: opts.lowPower, hour: opts.hour }); } catch (e) { R = null; }
    if (!R) return null;
    const view = { world, R, hour: opts.hour == null ? 10 : opts.hour, spotName };
    view.setHour = h => { view.hour = h; R.setTime(h, world.weather); };
    view.setHour(view.hour);

    // ---------- ハブ：島を見わたすカメラ ----------
    const hub = view.hub = { yaw: 0.4, auto: true, dist: 1500, h: 900, tx: 0, ty: 20, tz: 0, goal: null, focusT: 0, sel: -1, t: 0, drag: null, tipId: null };
    hub.focus = id => { const m = world.markOf(id); if (!m) return; hub.goal = { x: m.x, y: m.y + 10, z: m.z, dist: id === 'volcano' ? 700 : 260, h: id === 'volcano' ? 380 : 130 }; hub.focusId = id; };
    hub.overview = () => { hub.goal = { x: 0, y: 20, z: 0, dist: 1500, h: 900 }; hub.focusId = null; };
    hub.camera = () => { const cx = hub.tx + Math.sin(hub.yaw) * hub.dist, cz = hub.tz + Math.cos(hub.yaw) * hub.dist, cy = hub.ty + hub.h; const dx = hub.tx - cx, dy = hub.ty - cy, dz = hub.tz - cz; return { x: cx, y: cy, z: cz, yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)), fov: 0.95 }; };
    hub.update = dt => { hub.t += dt; if (hub.auto && !hub.drag && !hub.focusId) hub.yaw += dt * 0.05; if (hub.goal) { const k = Math.min(1, dt * 2.2), g = hub.goal; hub.tx += (g.x - hub.tx) * k; hub.ty += (g.y - hub.ty) * k; hub.tz += (g.z - hub.tz) * k; hub.dist += (g.dist - hub.dist) * k; hub.h += (g.h - hub.h) * k; hub.arrived = Math.hypot(g.x - hub.tx, g.z - hub.tz) < 25; } };
    // ---------- 島のくらし：島の人・いきもの・ふね ----------
    const life = view.life = { items: [], list: [] };
    { const hash = (a, b) => { let k = (Math.imul(a, 374761393) + Math.imul(b, 668265263)) | 0; k = Math.imul(k ^ (k >>> 13), 1274126177); return ((k ^ (k >>> 16)) >>> 0) / 4294967296; };
      const seaPoint = (m, out) => { let x = m.x, z = m.z; const l = Math.hypot(x, z) || 1; for (let k = 0; k < 40 && world.heightAt(x, z) > -1.5; k++) { x += x / l * 12; z += z / l * 12; } return { x: x + (x / l) * out, z: z + (z / l) * out }; };
      I.NPCS.forEach((n, i) => { const m = world.markOf(n.spot); if (!m) return; const a = hash(i, 7) * 6.28, r = (n.spot === 'town' ? 84 : 33) + hash(i, 9) * 8, x = m.x + Math.cos(a) * r, z = m.z + Math.sin(a) * r; life.items.push({ kind: 'npc', id: n.id, i, x, z, y: Math.max(world.heightAt(x, z), 0.3), yaw: a + 3.14, tint: (() => { const c = ART.AVCOL[n.av.c]; const h2 = GL.hex(c[0]); return [h2[0] * 1.1, h2[1] * 1.1, h2[2] * 1.1]; })() }); });
      const lh = world.markOf('lighthouse'), hb = world.markOf('harbor'), ap = world.markOf('airstrip'); const sea1 = seaPoint(hb, 20), sea2 = seaPoint(lh, 70);
      life.sea1 = sea1; life.sea2 = sea2; life.wild = [{ kind: 'wild', id: 'turtle', x: sea1.x, z: sea1.z, y: -0.4 }, { kind: 'wild', id: 'crab', x: hb.x + 24, z: hb.z - 18, y: 0 }, { kind: 'wild', id: 'crab2', crab: 1, x: ap.x - 30, z: ap.z + 22, y: 0 }, { kind: 'wild', id: 'dolphin', x: sea2.x, z: sea2.z, y: -1 }, { kind: 'wild', id: 'gull', x: 0, z: 0, y: 120 }];
    }
    life.update = t => {
      const list = [], items = []; const HALF = world.HALF;
      for (const n of life.items) { const y = n.y + Math.abs(Math.sin(t * 2 + n.i)) * 0.15; list.push({ kind: 'npc', x: n.x, y, z: n.z, yaw: n.yaw + Math.sin(t * 0.6 + n.i) * 0.3, s: 3, tint: n.tint }); items.push({ kind: 'npc', id: n.id, x: n.x, y: y + 9.2, z: n.z }); }
      for (let k = 0; k < 4; k++) { const a = t * (0.018 + k * 0.004) + k * 1.57, r = HALF * (0.8 + (k % 2) * 0.08); const x = Math.cos(a) * r, z = Math.sin(a) * r; list.push({ kind: 'boat', x, y: 0.1 + Math.sin(t * 1.3 + k) * 0.25, z, yaw: Math.atan2(-Math.sin(a), Math.cos(a)) , roll: Math.sin(t * 1.1 + k) * 0.06, s: 4.5, tint: [[1, 1, 1], [1, 0.9, 0.8], [0.9, 1, 1], [1, 0.8, 0.9]][k] }); }
      const hb = world.markOf('harbor'); list.push({ kind: 'boat', x: hb.x + 10, y: 0.05 + Math.sin(t * 1.5) * 0.15, z: hb.z + 26, yaw: 1.2, roll: Math.sin(t) * 0.05, s: 3, tint: [1, 1, 1] });
      for (let k = 0; k < 6; k++) { const a = t * (0.06 + k * 0.01) + k * 1.05, r = 350 + k * 110; list.push({ kind: 'bird', x: Math.cos(a) * r, y: 95 + k * 14 + Math.sin(t * 2 + k) * 4, z: Math.sin(a) * r, yaw: Math.atan2(-Math.sin(a), Math.cos(a)), roll: Math.sin(t * 7 + k) * 0.5, s: 3 }); }
      const g0 = { x: Math.cos(t * 0.07) * 420, y: 112, z: Math.sin(t * 0.07) * 420 }; items.push({ kind: 'wild', id: 'gull', x: g0.x, y: g0.y + 3, z: g0.z });
      const w = life.wild; list.push({ kind: 'turtle', x: w[0].x + Math.sin(t * 0.2) * 5, y: -0.45, z: w[0].z, yaw: t * 0.2, s: 3.2 }); items.push({ kind: 'wild', id: 'turtle', x: w[0].x, y: 4, z: w[0].z });
      for (const c of [w[1], w[2]]) { list.push({ kind: 'crab', x: c.x + Math.sin(t * 0.8 + c.x) * 2, y: 0.2, z: c.z, yaw: 1.57, s: 3 }); items.push({ kind: 'wild', id: 'crab', x: c.x, y: 4, z: c.z }); }
      const jp = (t % 16) / 16; if (jp < 0.2) { const u = jp / 0.2, hh = Math.sin(u * Math.PI) * 9; list.push({ kind: 'dolphin', x: w[3].x + u * 30 - 15, y: hh - 1, z: w[3].z, yaw: 1.57, pitch: Math.cos(u * Math.PI) * 0.9, s: 3 }); items.push({ kind: 'wild', id: 'dolphin', x: w[3].x + u * 30 - 15, y: hh + 6, z: w[3].z }); }
      life.list = list; life.items2 = items;
    };
    hub.render = dt => { life.update(hub.t); R.render(hub.camera(), { list: life.list, wx: world.weather, fog: 5200, far: 5600 }, dt); };
    // 目印（2D の上描き）。items = [{ id, mark, x, y, r }]
    hub.items = []; hub.draw = (g, w, h, o) => {
      hub.items = []; const EN = o.EN; const cam = R.state.cam; const rb = Math.min(w, h);
      for (const m of world.marks) { const p = R.project(m.x, m.y + 22, m.z); if (!p) continue; const sp = C.sportOf(m.id), dist = p.w; let r = clamp(rb * 0.075 * (1300 / Math.max(500, dist)), 16, 36); if (p.x < -r || p.x > w + r || p.y < -r || p.y > h + r) continue;
        hub.items.push({ id: m.id, sport: sp, x: p.x, y: p.y, r, dist }); }
      hub.items.sort((a, b) => b.dist - a.dist);
      for (const it of hub.items) { if (it.sport) { ART.nodeDraw(g, it.sport, it.x, it.y, it.r, o.stars(it.id), { daily: o.daily === it.id, hot: o.sel === it.id, t: hub.t }); } else { g.beginPath(); g.arc(it.x, it.y, it.r * 0.55, 0, TAU); g.fillStyle = 'rgba(255,255,255,.85)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(18,59,87,.8)'; g.stroke(); ART.text(g, it.id === 'airstrip' ? '✈' : it.id === 'town' ? '⌂' : it.id === 'lighthouse' ? '▲' : it.id === 'volcano' ? '▲' : '⚓', it.x, it.y, it.r * 0.7, { color: '#123b57', stroke: false }); } if (o.sel === it.id || (it.dist < 700 && it.r > 24)) { const lw = Math.min(w - 8, 14 * (spotName(it.id, EN).length + 2)); ART.rr(g, clamp(it.x - lw / 2, 4, w - lw - 4), it.y - it.r - 26, lw, 22, 9); g.fillStyle = 'rgba(18,59,87,.82)'; g.fill(); ART.text(g, spotName(it.id, EN), clamp(it.x, lw / 2 + 4, w - lw / 2 - 4), it.y - it.r - 15, 13, { stroke: false }); } }
      life.screen = []; for (const it of life.items2 || []) { const p = R.project(it.x, it.y, it.z); if (!p || p.w > 1100 || p.x < 0 || p.x > w || p.y < 0 || p.y > h) continue; const sc = clamp(900 / p.w, 0.7, 1.5); life.screen.push({ kind: it.kind, id: it.id, x: p.x, y: p.y, r: 17 * sc }); const met = o.met && o.met(it.kind, it.id); g.beginPath(); g.arc(p.x, p.y, 13 * sc, 0, TAU); g.fillStyle = met ? 'rgba(255,255,255,.7)' : '#ffd24d'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(18,59,87,.8)'; g.stroke(); ART.text(g, it.kind === 'npc' ? '…' : '?', p.x, p.y - 1, 14 * sc, { color: '#123b57', stroke: false }); }
      void cam;
    };
    hub.pick = (x, y) => { for (const it of life.screen || []) { if (Math.hypot(it.x - x, it.y - y) < Math.max(it.r * 1.5, 26)) return { kind: it.kind, id: it.id, life: true }; } let best = null, bd = 1e9; for (const it of hub.items) { const d = Math.hypot(it.x - x, it.y - y); if (d < Math.max(it.r * 1.4, 26) && d < bd) { bd = d; best = it; } } return best; };
    hub.rotate = dx => { hub.yaw -= dx * 0.006; };

    // ---------- 遊覧飛行 ----------
    const ringVenue = function (env) {
      const L = env.L; let w = 300, h = 400, f = null, cam = null, ptr = null, p0 = null, stick = { x: 0, y: 0 }, keys = {}, t = 0, flash = 0, pops = [], state = 'fly', rest = 0, camYaw = 0, camPitch = 0, takePhoto = 0, album = env.album, accT = 0, lastRing = 0;
      const mode = env.flightMode || 'ring';
      function start() { f = W.newFlight(world, env.diff, { mode, relaxed: mode === 'free' || env.relaxed }); state = 'fly'; pops = []; camYaw = f.yaw; camPitch = 0; stick = { x: 0, y: 0 }; setBtns(); hud(); env.status(mode === 'free' ? L('ゆったり遊覧：ドラッグで操縦。ランドマークに向けて「さつえい」！', 'Free sightseeing: drag to steer; aim at a landmark and press Photo!') : L('ドラッグで操縦。まず上へ（引き上げ）で離陸。リングを順にくぐって、最後は空港に着陸！', 'Drag to steer; pull up to take off. Fly through the rings, then land on the airstrip!')); }
      function setBtns() { env.setButtons([{ id: 'photo', label: L('さつえい', 'Photo'), main: true }, { id: 'quit', label: mode === 'free' ? L('おわる', 'Finish') : L('やめる', 'Quit') }]); }
      function hud() { env.hud(mode === 'free' ? L('風船 ', 'Balloons ') + f.pops + '/24' : L('リング ', 'Rings ') + f.rings + '/' + world.course.length + '  ' + L('のこり ', 'Time ') + Math.max(0, Math.ceil(f.cfg.time - f.t)) + 's'); }
      function input() { let sx = stick.x, sy = stick.y; const tl = env.tilt(); if (tl.on) { sx += tl.x; sy += tl.y; } sx += (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0); sy += (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0); return [clamp(sx, -1, 1), clamp(sy, -1, 1)]; }
      function snap() {
        const id = W.photoTarget(f); flash = 0.25; env.sfx('tap');
        if (!id) { env.status(L('ランドマークの方へ機首を向けて撮ろう（すこし近づく）', 'Point the nose at a landmark and get a bit closer')); return; }
        R.state.snap = cv => { try { const c = document.createElement('canvas'); c.width = 224; c.height = 140; const x = c.getContext('2d'); x.drawImage(cv, 0, 0, cv.width, cv.height, 0, 0, 224, 140); const url = c.toDataURL('image/jpeg', 0.6); env.photo(id, url); } catch (e) {} };
        env.status(L('パシャ！ ', 'Click! ') + spotName(id, L('', 'x') === 'x'));
      }
      function drain() { for (const e of f.ev) { if (e.type === 'ring') { env.sfx('coin'); env.buzz(15); pops.push({ txt: L('リング ', 'Ring ') + e.n, t: 0 }); } else if (e.type === 'pop') { env.sfx('pop'); env.stat('pops'); pops.push({ txt: L('ポン！', 'Pop!'), t: 0 }); } else if (e.type === 'takeoff') { env.sfx('clear'); pops.push({ txt: L('離陸！', 'Takeoff!'), t: 0 }); } else if (e.type === 'bump' || e.type === 'splash') { env.sfx('fail'); env.buzz(30); pops.push({ txt: e.type === 'splash' ? L('ドボン！', 'Splash!') : L('ごつん！', 'Bump!'), t: 0 }); } else if (e.type === 'touch') env.sfx('ok'); else if (e.type === 'crash') env.sfx('over'); } f.ev.length = 0; }
      return {
        start, resize(a, b) { w = a; h = b; R.resize(a, b); },
        button(id, down) { if (!down) return; if (id === 'photo') snap(); else if (id === 'quit') { state = 'end'; rest = 0; finish(true); } },
        down(x, y, id) { ptr = id; p0 = { x, y }; stick = { x: 0, y: 0 }; }, move(x, y, id) { if (ptr !== id) return; const rr = Math.min(w, h) * 0.16; stick = { x: clamp((x - p0.x) / rr, -1, 1), y: clamp((y - p0.y) / rr, -1, 1) }; p0.cx = x; p0.cy = y; }, up(x, y, id) { if (ptr === id) { ptr = null; stick = { x: 0, y: 0 }; p0 = null; } },
        key(code, down) { keys[code] = down; if (down && (code === 'Space' || code === 'KeyC' || code === 'Enter')) snap(); },
        update(dt) {
          if (!f) return; dt = Math.min(dt, 0.05); t += dt; flash = Math.max(0, flash - dt); for (const p of pops) p.t += dt; pops = pops.filter(p => p.t < 1.3);
          if (state === 'fly') { const [sx, sy] = input(); W.stepFlight(f, dt, sx, sy, 1); drain(); accT += dt; if (accT > 0.25) { accT = 0; hud(); } if (f.done) { state = 'end'; rest = 1.6; env.sfx(f.landed ? 'win' : 'over'); pops.push({ txt: f.landed ? L('着陸せいこう！', 'Landed!') : f.crashed ? L('ぶつかった…', 'Crashed…') : L('タイムアップ', 'Time up'), t: -0.1 }); } }
          else if (state === 'end') { rest -= dt; if (rest <= 0) { state = 'over'; finish(false); } }
          const fw = [Math.sin(f.yaw), 0, Math.cos(f.yaw)]; camYaw += angDiff(f.yaw, camYaw) * Math.min(1, dt * 3.5); camPitch += (f.pitch * 0.55 - 0.1 - camPitch) * Math.min(1, dt * 2.5);
          const d = 15 - Math.sin(f.pitch) * 2.5, cx = f.x - Math.sin(camYaw) * Math.cos(camPitch) * d, cz = f.z - Math.cos(camYaw) * Math.cos(camPitch) * d, cy0 = f.y + 5.5 + Math.sin(camPitch) * -4; const gy = Math.max(world.heightAt(cx, cz), 0) + 3;
          cam = { x: cx, y: Math.max(cy0, gy), z: cz, yaw: camYaw, pitch: -0.12 + (camPitch + 0.1) * 0.6 - (cy0 < gy ? 0 : 0), roll: -f.roll * 0.12, fov: 1.05 }; void fw;
          const list = [{ kind: 'plane', x: f.x, y: f.y, z: f.z, yaw: f.yaw, pitch: f.pitch, roll: f.roll, s: 0.42 }];
          if (mode === 'ring') world.course.forEach((rg, i) => { if (i >= f.next && i < f.next + 3) list.push({ kind: 'ring', x: rg.x, y: rg.y, z: rg.z, r: f.cfg.ring, yaw: Math.atan2(i === 0 ? 1 : world.course[i - 1].x - rg.x, i === 0 ? 1 : world.course[i - 1].z - rg.z) + 0, tint: i === f.next ? [1, 1, 1] : [0.8, 0.8, 0.9] }); });
          for (const b of f.balloons) if (!b.got) list.push({ kind: 'balloon', x: b.x, y: b.y, z: b.z, s: 7, tint: [[1, 0.4, 0.4], [1, 0.85, 0.3], [0.4, 0.8, 1], [0.6, 1, 0.5], [0.9, 0.5, 1]][b.col] });
          const t0 = performance.now(); R.render(cam, { list, wx: world.weather }, dt); R.adapt(dt * 1000); void t0;
        },
        draw(g) {
          g.clearRect(0, 0, w, h); if (!f) return; const fs = fontPx(w, h);
          if (mode === 'ring' && f.next < world.course.length && state === 'fly') { const rg = world.course[f.next], p = R.project(rg.x, rg.y, rg.z); const dist = Math.round(Math.hypot(rg.x - f.x, rg.y - f.y, rg.z - f.z)); if (p && p.x > 20 && p.x < w - 20 && p.y > 40 && p.y < h - 60) { g.beginPath(); g.arc(p.x, p.y, 20, 0, TAU); g.lineWidth = 4; g.strokeStyle = '#ffd24d'; g.stroke(); ART.text(g, dist + 'm', p.x, p.y - 30, fs); } else { const a = (() => { const b = R.state.vw.b, dx = rg.x - f.x, dy = rg.y - f.y, dz = rg.z - f.z; return Math.atan2(dx * b.r[0] + dy * b.r[1] + dz * b.r[2], dx * b.u[0] + dy * b.u[1] + dz * b.u[2]); })(); const ex = w / 2 + Math.sin(a) * w * 0.38, ey = h * 0.45 - Math.cos(a) * h * 0.3; g.save(); g.translate(ex, ey); g.rotate(a); g.fillStyle = '#ffd24d'; g.strokeStyle = '#123b57'; g.lineWidth = 2; g.beginPath(); g.moveTo(0, -18); g.lineTo(13, 12); g.lineTo(0, 6); g.lineTo(-13, 12); g.closePath(); g.fill(); g.stroke(); g.restore(); ART.text(g, dist + 'm', ex, ey + 30, fs); } }
          if (mode === 'ring' && f.next >= world.course.length && !f.done) { const a = world.markOf('airstrip'), p = R.project(a.x, a.y + 30, a.z); ART.text(g, L('空港に着陸しよう！', 'Land on the airstrip!'), w / 2, h * 0.14, fs * 1.3, { color: '#ffd24d' }); if (p) { g.beginPath(); g.arc(p.x, p.y, 16, 0, TAU); g.lineWidth = 4; g.strokeStyle = '#7be0a0'; g.stroke(); } }
          const tgt = W.photoTarget(f); if (tgt && state === 'fly') { ART.text(g, '◎ ' + spotName(tgt, L('', 'x') === 'x'), w / 2, h * 0.22, fs * 1.1, { color: '#fff' }); g.strokeStyle = 'rgba(255,255,255,.8)'; g.lineWidth = 2; const bw = w * 0.5, bh = h * 0.28; g.strokeRect(w / 2 - bw / 2, h * 0.4 - bh / 2, bw, bh); }
          ART.text(g, Math.round(f.v * 3.6) + ' km/h  ' + L('高度 ', 'Alt ') + Math.round(f.alt) + 'm', w / 2, h - 18, fs - 1);
          if (p0 && ptr != null) { const cx = p0.x, cy = p0.y, rr = Math.min(w, h) * 0.16; g.beginPath(); g.arc(cx, cy, rr, 0, TAU); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.55)'; g.stroke(); g.beginPath(); g.arc(cx + stick.x * rr, cy + stick.y * rr, rr * 0.3, 0, TAU); g.fillStyle = 'rgba(255,255,255,.7)'; g.fill(); }
          for (const p of pops) if (p.t >= 0) ART.text(g, p.txt, w / 2, h * 0.32 - p.t * 20, fs * 1.6, { color: '#ffd24d' });
          if (flash > 0) { g.fillStyle = 'rgba(255,255,255,' + flash * 3 + ')'; g.fillRect(0, 0, w, h); }
        },
        flight() { return f; },
      };
      function finish(quit) { env.done({ score: f.score, detail: { rings: f.rings, pops: f.pops, landed: f.landed, mode, crashed: f.crashed, quit: !!quit, time: Math.round(f.t) }, flight: true }); }
      function angDiff(a, b) { let d = a - b; while (d > Math.PI) d -= TAU; while (d < -Math.PI) d += TAU; return d; }
    };

    // ---------- 空のイベント：グライダー／フォーメーション降下／風船バトル ----------
    const AIR = root.SportsAir;
    const airVenue = function (env) {
      const L = env.L, kind = env.flightMode; let w = 300, h = 400, s = null, ptr = null, p0 = null, stick = { x: 0, y: 0 }, keys = {}, t = 0, pops = [], state = 'fly', rest = 0, camYaw = 0, cam = null, accT = 0, shake = 0, mw = [], cx = 0, cz = 0, slow = 0;
      const tints = [[1, 0.5, 0.45], [0.5, 0.8, 1], [1, 0.9, 0.4], [0.6, 1, 0.6], [0.9, 0.6, 1]];
      const helps = { glider: L('エンジンなし！ 上昇気流（空の渦）でのぼって、ゲートを順にくぐろう。上へドラッグ＝ゆっくり、下＝はやく降りる。最後はそっと着陸。', 'No engine! Climb in thermals (the circling birds), fly the gates in order, then land softly. Drag up = slow, down = dive.'), formation: L('自由落下！ 光る輪（あなたの場所）に入って、みんなで形をつくろう。ドラッグで横いどう。低くなるとパラシュートが開くので、島の空港へ降りよう。', 'Free fall! Slide into the glowing ring (your slot) to build the shape with the others. Drag to move. The canopy opens low; land near the airstrip.'), duel: L('しっぽの風船をわりあうバトル！ 相手の風船にタッチ、自分のは守ろう。ドラッグで操縦。', 'Pop each other\'s tail balloons! Touch the rival\'s balloon and protect yours. Drag to steer.') };
      function start() {
        s = kind === 'glider' ? AIR.newGlider(world, env.diff, env.seed || 1) : kind === 'formation' ? AIR.newFormation(world, env.diff, env.seed || 1) : AIR.newDuel(world, env.diff, env.seed || 1);
        state = 'fly'; pops = []; stick = { x: 0, y: 0 }; mw = []; camYaw = s.yaw || 0; env.setButtons([{ id: 'quit', label: L('やめる', 'Quit'), main: false }]); hud(); env.status(helps[kind]);
      }
      function hud() {
        if (!s) return; if (kind === 'glider') env.hud(L('ゲート ', 'Gates ') + s.gates.filter(g => g.got).length + '/' + s.gates.length + '  ' + L('のこり ', 'Time ') + Math.max(0, Math.ceil(s.cfg.time - s.t)) + 's');
        else if (kind === 'formation') env.hud(s.phase === 'fall' ? L('かたち ', 'Shape ') + Math.min(s.shape + 1, 6) + '  ' + L('成功 ', 'Linked ') + s.links : L('着地まで ', 'Landing ') + Math.max(0, Math.round(s.y)) + 'm');
        else env.hud(L('あなた ', 'You ') + '●'.repeat(Math.max(0, s.p.lives)) + '  CPU ' + '●'.repeat(Math.max(0, s.e.lives)) + '  ' + Math.max(0, Math.ceil(s.cfg.time - s.t)) + 's');
      }
      function input() { let sx = stick.x, sy = stick.y; const tl = env.tilt(); if (tl.on) { sx += tl.x; sy += tl.y; } sx += (keys.ArrowRight || keys.KeyD ? 1 : 0) - (keys.ArrowLeft || keys.KeyA ? 1 : 0); sy += (keys.ArrowDown || keys.KeyS ? 1 : 0) - (keys.ArrowUp || keys.KeyW ? 1 : 0); return [clamp(sx, -1, 1), clamp(sy, -1, 1)]; }
      function drain() {
        for (const e of s.ev) {
          if (e.type === 'gate') { env.sfx('coin'); env.buzz(15); pops.push({ txt: L('ゲート ', 'Gate ') + e.n, t: 0 }); } else if (e.type === 'link') { env.sfx('clear'); env.buzz(25); pops.push({ txt: L('つながった！', 'Linked!'), t: 0 }); slow = 0.5; } else if (e.type === 'shape') { env.sfx('tap'); pops.push({ txt: L('つぎのかたち', 'Next shape'), t: 0 }); }
          else if (e.type === 'open') { env.sfx('ok'); pops.push({ txt: L('パラシュート ひらいた！', 'Canopy open!'), t: 0 }); } else if (e.type === 'pop') { env.sfx(e.who === 'e' ? 'pop' : 'fail'); env.buzz(e.who === 'e' ? 20 : 40); env.stat('pops'); pops.push({ txt: e.who === 'e' ? L('ポン！ ナイス！', 'Pop! Nice!') : L('わられた！', 'Popped!'), t: 0 }); shake = e.who === 'p' ? 0.4 : 0; slow = 0.6; if (e.who === 'e') s.lastPop = e; }
          else if (e.type === 'land') { env.sfx('win'); } else if (e.type === 'splash') { env.sfx('fail'); pops.push({ txt: L('ドボン！', 'Splash!'), t: 0 }); } else if (e.type === 'crash') { env.sfx('over'); pops.push({ txt: L('ごつん！', 'Crash!'), t: 0 }); }
        } s.ev.length = 0;
      }
      function finish(quit) { const d = s; env.done({ score: s.score, detail: { air: kind, gates: d.gates ? d.gates.filter(g => g.got).length : 0, links: d.links || 0, pops: d.pops || 0, won: !!d.won, landed: !!d.landed, crashed: !!d.crashed, dist: Math.round(d.dist || d.near || 0), quit: !!quit, time: Math.round(s.t) }, flight: true }); }
      function chase(o, dd, hh, pitch) { const cxx = o.x - Math.sin(camYaw) * dd, czz = o.z - Math.cos(camYaw) * dd, gy = Math.max(world.heightAt(cxx, czz), 0) + 3; return { x: cxx, y: Math.max(o.y + hh, gy), z: czz, yaw: camYaw, pitch, roll: -(o.roll || 0) * 0.12, fov: 1.05 }; }
      return {
        start, resize(a, b) { w = a; h = b; R.resize(a, b); },
        button(id, down) { if (down && id === 'quit') { state = 'end'; rest = 0; finish(true); } },
        down(x, y, id) { ptr = id; p0 = { x, y }; stick = { x: 0, y: 0 }; }, move(x, y, id) { if (ptr !== id) return; const rr = Math.min(w, h) * 0.16; stick = { x: clamp((x - p0.x) / rr, -1, 1), y: clamp((y - p0.y) / rr, -1, 1) }; }, up(x, y, id) { if (ptr === id) { ptr = null; stick = { x: 0, y: 0 }; p0 = null; } },
        key(code, down) { keys[code] = down; },
        update(dt) {
          if (!s) return; dt = Math.min(dt, 0.05); t += dt; shake = Math.max(0, shake - dt); slow = Math.max(0, slow - dt); for (const p of pops) p.t += dt; pops = pops.filter(p => p.t < 1.3);
          const k = slow > 0 ? 0.45 : 1; // 見せ場は すこしスローに
          if (state === 'fly') {
            const [sx, sy] = input(); const wasPhase = s.phase; (kind === 'glider' ? AIR.stepGlider : kind === 'formation' ? AIR.stepFormation : AIR.stepDuel)(s, dt * k, sx, sy);
            if (kind === 'formation' && wasPhase === 'fall' && s.phase === 'canopy') { const b = AIR.formBase(s, s.t); mw = s.mates.map(m => ({ x: b.x + m.x, y: s.y, z: b.z + m.z, vx: (m.x > 0 ? 1 : -1) * 6, vz: (m.z > 0 ? 1 : -1) * 5 })); }
            drain(); accT += dt; if (accT > 0.25) { accT = 0; hud(); }
            if (s.done) { state = 'end'; rest = 1.7; env.sfx(s.ok ? 'win' : 'over'); pops.push({ txt: s.ok ? (kind === 'duel' ? L('しょうり！', 'You win!') : L('着地せいこう！', 'Landed!')) : kind === 'duel' ? L('ざんねん…', 'Not this time') : L('おしまい', 'Finished'), t: -0.1 }); hud(); }
          } else if (state === 'end') { rest -= dt; if (rest <= 0) { state = 'over'; finish(false); } }
          const list = []; let cp;
          if (kind === 'glider') {
            camYaw += AIR.angDiff(s.yaw, camYaw) * Math.min(1, dt * 3.5); cp = chase(s, 17, 6, -0.16 + s.pitch * 0.3);
            list.push({ kind: 'plane', x: s.x, y: s.y, z: s.z, yaw: s.yaw, pitch: s.pitch, roll: s.roll, s: 0.5, tint: [0.9, 0.95, 1.15] });
            s.gates.forEach((g, i) => { if (i >= s.next && i < s.next + 2) { const pr = i === 0 ? world.markOf('volcano') : s.gates[i - 1]; list.push({ kind: 'ring', x: g.x, y: g.y, z: g.z, r: s.cfg.gate, yaw: Math.atan2(pr.x - g.x, pr.z - g.z), tint: i === s.next ? [1, 1, 1] : [0.8, 0.8, 0.9] }); } });
            s.therm.forEach((th, i) => { for (let q = 0; q < 3; q++) { const a = t * 0.7 + q * 2.1 + i, gy = Math.max(0, world.heightAt(th.x, th.z)); list.push({ kind: 'bird', x: th.x + Math.cos(a) * 34, y: gy + 50 + ((t * 9 + q * 70) % 260), z: th.z + Math.sin(a) * 34, yaw: -a + Math.PI, roll: 0.5, s: 2.2 }); } });
          } else if (kind === 'formation') {
            const b = AIR.formBase(s, s.t), sl = AIR.slots(s);
            if (s.phase === 'fall') { cp = { x: s.x, y: s.y + 105, z: s.z - 40, yaw: 0, pitch: -1.15, roll: 0, fov: 1.0 }; list.push({ kind: 'npc', x: s.x, y: s.y, z: s.z, yaw: Math.sin(t * 3) * 0.2, s: 3, tint: [1, 0.85, 0.3] }); s.mates.forEach((m, i) => list.push({ kind: 'npc', x: b.x + m.x, y: s.y + Math.sin(t * 2 + i) * 1.5, z: b.z + m.z, yaw: Math.sin(t * 2 + i) * 0.3, s: 3, tint: tints[i] })); s.slotPts = sl.map(p => ({ x: b.x + p.x, y: s.y, z: b.z + p.z })); }
            else { camYaw = 0; cp = chase(s, 28, 15, -0.38); list.push({ kind: 'npc', x: s.x, y: s.y, z: s.z, yaw: 0, s: 1.4, tint: [1, 0.85, 0.3] }, { kind: 'balloon', x: s.x, y: s.y + 8, z: s.z, s: 9, tint: [1, 0.85, 0.3] }); mw.forEach((m, i) => { m.x += m.vx * dt; m.z += m.vz * dt; m.y -= 7.5 * dt; const gy = Math.max(0, world.heightAt(m.x, m.z)); if (m.y < gy + 1) { m.y = gy + 1; m.vx = m.vz = 0; } list.push({ kind: 'npc', x: m.x, y: m.y, z: m.z, yaw: 0, s: 1.4, tint: tints[i] }, { kind: 'balloon', x: m.x, y: m.y + 8, z: m.z, s: 9, tint: tints[i] }); }); s.slotPts = null; }
          } else {
            camYaw += AIR.angDiff(s.p.yaw, camYaw) * Math.min(1, dt * 3.2); cp = chase(s.p, 17, 6, -0.14 + s.p.pitch * 0.4); if (shake > 0) { cp.x += (Math.sin(t * 90)) * shake * 3; cp.y += Math.cos(t * 77) * shake * 3; }
            list.push({ kind: 'plane', x: s.p.x, y: s.p.y, z: s.p.z, yaw: s.p.yaw, pitch: s.p.pitch, roll: s.p.roll, s: 0.45 }, { kind: 'plane', x: s.e.x, y: s.e.y, z: s.e.z, yaw: s.e.yaw, pitch: s.e.pitch, roll: s.e.roll, s: 0.45, tint: [1.25, 0.55, 0.5] });
            if (s.p.lives > 0 && (s.p.inv <= 0 || Math.floor(t * 12) % 2)) list.push({ kind: 'balloon', x: s.p.tx, y: s.p.ty, z: s.p.tz, s: 6, tint: [0.5, 0.8, 1.1] }); if (s.e.lives > 0 && (s.e.inv <= 0 || Math.floor(t * 12) % 2)) list.push({ kind: 'balloon', x: s.e.tx, y: s.e.ty, z: s.e.tz, s: 6, tint: [1.2, 0.5, 0.45] });
          }
          cam = cp; R.render(cam, { list, wx: world.weather, fog: 5200, far: 5600 }, dt); R.adapt(dt * 1000); void cx; void cz;
        },
        draw(g) {
          g.clearRect(0, 0, w, h); if (!s) return; const fs = fontPx(w, h);
          if (kind === 'glider') {
            const gt = s.gates[s.next]; if (gt && state === 'fly') { const p = R.project(gt.x, gt.y, gt.z), dist = Math.round(Math.hypot(gt.x - s.x, gt.y - s.y, gt.z - s.z)); if (p && p.x > 20 && p.x < w - 20 && p.y > 40 && p.y < h - 60) { g.beginPath(); g.arc(p.x, p.y, 20, 0, TAU); g.lineWidth = 4; g.strokeStyle = '#ffd24d'; g.stroke(); ART.text(g, dist + 'm', p.x, p.y - 30, fs); } else ART.text(g, L('ゲートはあっち →', 'Gate is that way'), w / 2, h * 0.2, fs, { color: '#ffd24d' }); }
            if (state === 'fly') for (const th of s.therm) { const p = R.project(th.x, s.y, th.z); if (p && p.x > 20 && p.x < w - 20 && p.y > 50 && p.y < h - 60 && Math.hypot(th.x - s.x, th.z - s.z) < 600) { g.beginPath(); g.arc(p.x, p.y, 14, 0, TAU); g.lineWidth = 3; g.strokeStyle = 'rgba(160,255,200,.85)'; g.stroke(); ART.text(g, '↑ ' + L('上昇気流', 'Thermal'), p.x, p.y - 24, fs - 2, { color: '#9dffc4' }); } }
            const vs = s.vy; ART.text(g, (vs >= 0 ? '▲ +' : '▼ ') + vs.toFixed(1) + ' m/s   ' + L('高度 ', 'Alt ') + Math.round(s.alt) + 'm', w / 2, h - 18, fs, { color: s.inTherm ? '#9dffc4' : '#ffffff' });
            if (s.alt < 40 && state === 'fly') ART.text(g, L('ゆっくり！ 機首をおこして着陸', 'Easy now: nose up and land'), w / 2, h * 0.3, fs * 1.1, { color: '#ffd24d' });
          } else if (kind === 'formation') {
            if (s.phase === 'fall' && s.slotPts) { s.slotPts.forEach((q, i) => { const p = R.project(q.x, q.y, q.z); if (!p) return; const me = i === 0, rr = (me ? 22 : 14); g.beginPath(); g.arc(p.x, p.y, rr, 0, TAU); g.lineWidth = me ? 5 : 2; g.strokeStyle = me ? (s.dist < s.cfg.tol ? '#7be0a0' : '#ffd24d') : 'rgba(255,255,255,.5)'; g.stroke(); if (me && s.linkT > 0) { g.beginPath(); g.arc(p.x, p.y, rr + 7, -Math.PI / 2, -Math.PI / 2 + TAU * Math.min(1, s.linkT / s.cfg.hold)); g.lineWidth = 4; g.strokeStyle = '#7be0a0'; g.stroke(); } }); ART.text(g, L('光る輪に入ろう', 'Move into the glowing ring'), w / 2, h * 0.16, fs * 1.1, { color: '#ffd24d' }); ART.text(g, L('高度 ', 'Alt ') + Math.round(s.y) + 'm', w / 2, h - 18, fs); }
            else if (s.phase === 'canopy') { const p = R.project(s.pad.x, Math.max(0, world.heightAt(s.pad.x, s.pad.z)) + 4, s.pad.z); const d = Math.round(Math.hypot(s.pad.x - s.x, s.pad.z - s.z)); ART.text(g, L('空港（ひこうじょう）をめざそう ', 'Aim for the airstrip ') + d + 'm', w / 2, h * 0.16, fs * 1.05, { color: '#ffd24d' }); if (p) { g.beginPath(); g.arc(p.x, p.y, 18, 0, TAU); g.lineWidth = 4; g.strokeStyle = '#7be0a0'; g.stroke(); } ART.text(g, L('高度 ', 'Alt ') + Math.round(s.y) + 'm', w / 2, h - 18, fs); }
          } else {
            const f = s.e, p = R.project(f.tx, f.ty, f.tz); if (p && p.x > 10 && p.x < w - 10 && p.y > 30 && p.y < h - 40) { g.beginPath(); g.arc(p.x, p.y, 17, 0, TAU); g.lineWidth = 3; g.strokeStyle = '#ff8a7a'; g.stroke(); } else { const b = R.state.vw.b, dx = f.tx - s.p.x, dy = f.ty - s.p.y, dz = f.tz - s.p.z, a = Math.atan2(dx * b.r[0] + dy * b.r[1] + dz * b.r[2], dx * b.u[0] + dy * b.u[1] + dz * b.u[2]); const ex = w / 2 + Math.sin(a) * w * 0.38, ey = h * 0.45 - Math.cos(a) * h * 0.3; ART.text(g, L('ライバル ', 'Rival ') + (Math.cos(a) > 0 ? '▲' : '▼'), clamp(ex, 50, w - 50), clamp(ey, 50, h - 80), fs, { color: '#ff8a7a' }); }
            ART.text(g, L('あなた ', 'You ') + '●'.repeat(Math.max(0, s.p.lives)) + '   CPU ' + '●'.repeat(Math.max(0, s.e.lives)), w / 2, h - 18, fs);
          }
          if (p0 && ptr != null) { const rr = Math.min(w, h) * 0.16; g.beginPath(); g.arc(p0.x, p0.y, rr, 0, TAU); g.lineWidth = 3; g.strokeStyle = 'rgba(255,255,255,.55)'; g.stroke(); g.beginPath(); g.arc(p0.x + stick.x * rr, p0.y + stick.y * rr, rr * 0.3, 0, TAU); g.fillStyle = 'rgba(255,255,255,.7)'; g.fill(); }
          for (const p of pops) if (p.t >= 0) ART.text(g, p.txt, w / 2, h * 0.32 - p.t * 20, fs * 1.6, { color: '#ffd24d' });
          if (slow > 0) { g.fillStyle = 'rgba(255,255,255,' + Math.min(0.12, slow * 0.2) + ')'; g.fillRect(0, 0, w, h); }
        },
        air() { return s; },
      };
    };
    view.flightVenue = env => (AIR && ['glider', 'formation', 'duel'].includes(env.flightMode)) ? airVenue(env) : ringVenue(env);
    view.airNames = { glider: ['グライダー', 'Glider'], formation: ['フォーメーション降下', 'Formation skydive'], duel: ['風船バトル', 'Balloon duel'] };
    return view;
  }
  root.SportsFly = { create, spotName, NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
