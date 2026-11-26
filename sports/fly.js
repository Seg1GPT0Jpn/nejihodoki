// ぽかぽか島スポーツ：3D の島の「ハブ」と「遊覧飛行」。window.SportsFly
//   create(glCanvas, opts) → view | null（WebGL がなければ null：そのときは2D の地図のハブを使う）
//   view.hub：島をまわるカメラ・ランドマークの目印（2D の上描き）・タップで選ぶ
//   view.flightVenue(env)：飛行の「会場」（venues と同じ { start, resize, down, move, up, key, update, draw, button }）
(function (root) {
  'use strict';
  const W = root.SportsWorld, GL = root.SportsGL, ART = root.SportsArt, C = root.SportsCore;
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
    const hub = view.hub = { yaw: 0.4, auto: true, dist: 2300, h: 1250, tx: 0, ty: 20, tz: 0, goal: null, focusT: 0, sel: -1, t: 0, drag: null, tipId: null };
    hub.focus = id => { const m = world.markOf(id); if (!m) return; hub.goal = { x: m.x, y: m.y + 10, z: m.z, dist: id === 'volcano' ? 700 : 260, h: id === 'volcano' ? 380 : 130 }; hub.focusId = id; };
    hub.overview = () => { hub.goal = { x: 0, y: 20, z: 0, dist: 2300, h: 1250 }; hub.focusId = null; };
    hub.camera = () => { const cx = hub.tx + Math.sin(hub.yaw) * hub.dist, cz = hub.tz + Math.cos(hub.yaw) * hub.dist, cy = hub.ty + hub.h; const dx = hub.tx - cx, dy = hub.ty - cy, dz = hub.tz - cz; return { x: cx, y: cy, z: cz, yaw: Math.atan2(dx, dz), pitch: Math.atan2(dy, Math.hypot(dx, dz)), fov: 0.95 }; };
    hub.update = dt => { hub.t += dt; if (hub.auto && !hub.drag && !hub.focusId) hub.yaw += dt * 0.05; if (hub.goal) { const k = Math.min(1, dt * 2.2), g = hub.goal; hub.tx += (g.x - hub.tx) * k; hub.ty += (g.y - hub.ty) * k; hub.tz += (g.z - hub.tz) * k; hub.dist += (g.dist - hub.dist) * k; hub.h += (g.h - hub.h) * k; hub.arrived = Math.hypot(g.x - hub.tx, g.z - hub.tz) < 25; } };
    hub.render = dt => R.render(hub.camera(), { list: [], wx: world.weather }, dt);
    // 目印（2D の上描き）。items = [{ id, mark, x, y, r }]
    hub.items = []; hub.draw = (g, w, h, o) => {
      hub.items = []; const EN = o.EN; const cam = R.state.cam; const rb = Math.min(w, h);
      for (const m of world.marks) { const p = R.project(m.x, m.y + 22, m.z); if (!p) continue; const sp = C.sportOf(m.id), dist = p.w; let r = clamp(rb * 0.075 * (1300 / Math.max(500, dist)), 16, 36); if (p.x < -r || p.x > w + r || p.y < -r || p.y > h + r) continue;
        hub.items.push({ id: m.id, sport: sp, x: p.x, y: p.y, r, dist }); }
      hub.items.sort((a, b) => b.dist - a.dist);
      for (const it of hub.items) { if (it.sport) { ART.nodeDraw(g, it.sport, it.x, it.y, it.r, o.stars(it.id), { daily: o.daily === it.id, hot: o.sel === it.id, t: hub.t }); } else { g.beginPath(); g.arc(it.x, it.y, it.r * 0.55, 0, TAU); g.fillStyle = 'rgba(255,255,255,.85)'; g.fill(); g.lineWidth = 2; g.strokeStyle = 'rgba(18,59,87,.8)'; g.stroke(); ART.text(g, it.id === 'airstrip' ? '✈' : it.id === 'town' ? '⌂' : it.id === 'lighthouse' ? '▲' : it.id === 'volcano' ? '▲' : '⚓', it.x, it.y, it.r * 0.7, { color: '#123b57', stroke: false }); } if (o.sel === it.id || (it.dist < 700 && it.r > 24)) { const lw = Math.min(w - 8, 14 * (spotName(it.id, EN).length + 2)); ART.rr(g, clamp(it.x - lw / 2, 4, w - lw - 4), it.y - it.r - 26, lw, 22, 9); g.fillStyle = 'rgba(18,59,87,.82)'; g.fill(); ART.text(g, spotName(it.id, EN), clamp(it.x, lw / 2 + 4, w - lw / 2 - 4), it.y - it.r - 15, 13, { stroke: false }); } }
      void cam;
    };
    hub.pick = (x, y) => { let best = null, bd = 1e9; for (const it of hub.items) { const d = Math.hypot(it.x - x, it.y - y); if (d < Math.max(it.r * 1.4, 26) && d < bd) { bd = d; best = it; } } return best; };
    hub.rotate = dx => { hub.yaw -= dx * 0.006; };

    // ---------- 遊覧飛行 ----------
    view.flightVenue = function (env) {
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
          const list = [{ kind: 'plane', x: f.x, y: f.y, z: f.z, yaw: f.yaw, pitch: f.pitch, roll: f.roll, s: 0.5 }];
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
    return view;
  }
  root.SportsFly = { create, spotName, NAMES };
})(typeof window !== 'undefined' ? window : globalThis);
