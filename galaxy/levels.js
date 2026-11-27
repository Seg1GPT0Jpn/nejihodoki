// ぐるぐる星わたり：銀河（ステージ）のデータ。window.GalaxyLevels（node でも使える）
// 体（bodies）・重力ゾーン・もの（ents）・ミッション（missions）を、角度（緯度・経度）で書けるように小さな道具でならべる。
// ミッションの route は、ボット（bot.js）が「本物のエンジンに入力だけを送って」ぜんぶクリアできることを確かめるための道すじ。
(function (root) {
  'use strict';
  // 決まった答えを出す sin/cos/exp/acos（Node と Chromium で Math.sin・Math.cos・Math.exp の最後のけたがずれて、記録したプレイが再生でずれるのを防ぐ。足し算・かけ算だけで作る）
  const sinD = x => { const PI = 3.141592653589793; x -= 6.283185307179586 * Math.round(x / 6.283185307179586); if (x > PI / 2) x = PI - x; else if (x < -PI / 2) x = -PI - x; const x2 = x * x; let t = x, s = x; for (let n = 1; n <= 11; n++) { t = -t * x2 / ((2 * n) * (2 * n + 1)); s += t; } return s; };
  const cosD = x => sinD(x + 1.5707963267948966);
  const expD = x => { const n = Math.round(x / 0.6931471805599453), r = x - n * 0.6931471805599453; let t = 1, s = 1; for (let k = 1; k <= 16; k++) { t = t * r / k; s += t; } let p = 1; const m = Math.abs(n); for (let i = 0; i < m; i++) p *= 2; return n >= 0 ? s * p : s / p; };
  const atanD = x => { let neg = x < 0; if (neg) x = -x; let inv = x > 1; if (inv) x = 1 / x; x = x / (1 + Math.sqrt(1 + x * x)); x = x / (1 + Math.sqrt(1 + x * x)); const x2 = x * x; let t = x, s = x; for (let n = 1; n <= 12; n++) { t = -t * x2; s += t / (2 * n + 1); } s *= 4; if (inv) s = 1.5707963267948966 - s; return neg ? -s : s; };
  const acosD = x => x >= 1 ? 0 : x <= -1 ? 3.141592653589793 : 2 * atanD(Math.sqrt((1 - x) / (1 + x)));
  const hypotD = (a, b, c) => Math.sqrt(a * a + b * b + (c === undefined ? 0 : c * c));
  const D = Math.PI / 180;
  // 緯度・経度（度）→ 単位ベクトル（y が北）
  const dir = (lat, lon) => [cosD(lat * D) * sinD(lon * D), sinD(lat * D), cosD(lat * D) * cosD(lon * D)];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const nrm = a => { const l = hypotD(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
  const mulv = (a, s) => [a[0] * s, a[1] * s, a[2] * s];
  const r3 = a => a.map(v => Math.round(v * 1000) / 1000);

  function Builder(id, name, theme, sky) {
    const d = { id, name, theme, sky, bodies: [], zones: [], ents: [], missions: [], deco: [] }, B = {};
    const P = {};
    const me = {
      d,
      body(id, k, p, size, o) { const b = Object.assign({ id, k, p }, size, o || {}); d.bodies.push(b); B[id] = b; return me; },
      sph(id, p, r, o) { return me.body(id, 's', p, { r }, o); },
      box(id, p, h, o) { return me.body(id, 'b', p, { h }, o); },
      cyl(id, p, r, hh, o) { return me.body(id, 'y', p, { r, hh }, o); },
      cap(id, p, r, hl, o) { return me.body(id, 'p', p, { r, hl }, o); },
      zone(z) { d.zones.push(z); return me; },
      // 球の上の点（ローカル）：向き dv の、表面から h
      at(bid, dv, h) { return r3(mulv(nrm(dv), B[bid].r + (h == null ? 1 : h))); },
      ll(bid, lat, lon, h) { return me.at(bid, dir(lat, lon), h); },
      // a から b へ向かう向き（星が動かないとき、ローカルの向きと同じ）
      to(a, b) { return nrm(sub(B[b].p, B[a].p)); },
      ent(k, bid, l, o) { const e = Object.assign({ k }, o || {}); if (bid) { e.b = bid; e.l = l; } else e.p = l; d.ents.push(e); return e; },
      mission(m) { d.missions.push(m); return me; },
      B,
    };
    return me;
  }
  const T = (ja, en) => ({ ja, en });
  const cr3 = (a, b) => [a[1] * b[2] - a[2] * b[1], a[2] * b[0] - a[0] * b[2], a[0] * b[1] - a[1] * b[0]];
  // 球の上の点 dv のまわりに、半径 rad の輪になるローカル座標を n こ
  function ringAround(b, bid, dv, rad, n, h) { const d = nrm(dv), t0 = nrm(cr3(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t1 = cr3(d, t0), R = b.B[bid].r; const o = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = rad / R; o.push(b.at(bid, [d[0] + (t0[0] * cosD(a) + t1[0] * sinD(a)) * k, d[1] + (t0[1] * cosD(a) + t1[1] * sinD(a)) * k, d[2] + (t0[2] * cosD(a) + t1[2] * sinD(a)) * k], h)); } return o; }

  // ================== ほしみ台（ハブ） ==================
  function hub() {
    const b = Builder('hub', T('ほしみ台', 'Stargazer Deck'), 'hub', { n1: [0.1, 0.14, 0.45], n2: [0.6, 0.3, 0.7], band: [0.3, 0.9, 0.3], sun: [0.5, 0.55, -0.65], sunc: [1, 0.9, 0.7], stars: 1 });
    b.sph('deck', [0, 0, 0], 12, { surf: 'metal' });
    b.sph('moon', [0, 0, 0], 2, { surf: 'stone', mv: [{ t: 'orbit', c: [0, 0, 0], a: [0.3, 1, 0.1], T: 24 }], g: 1 }); b.d.bodies[1].p = [17, 3, 0]; b.d.bodies[1].mv[0].c = [0, 0, 0];
    ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8', 'g9', 'g10', 'g11', 'g12'].forEach((g, i) => { const row = Math.floor(i / 4), col = i % 4; b.ent('gate', 'deck', b.ll('deck', [36, 8, -22][row], col * 90 + row * 30, 0.9), { id: 'gate' + (i + 1), gal: g }); });
    [[62, 50], [-45, 200], [20, 330]].forEach((c, i) => b.ent('npc', 'deck', b.ll('deck', c[0], c[1], 0.5), { id: 'npc' + i, hint: i }));
    for (let i = 0; i < 6; i++) b.ent('coin', 'deck', b.ll('deck', -20 + (i % 3) * 8, 60 + i * 20, 1), {});
    b.ent('coin', 'moon', b.at('moon', [0, 1, 0], 1), {}); b.ent('crystal', 'moon', b.at('moon', [1, 0, 0], 1), {});
    b.ent('crate', 'deck', b.ll('deck', 62, 40, 0.7), { id: 'hc1', drop: 'heart' });
    b.mission({ id: 'free', name: T('ほしみ台', 'Stargazer Deck'), start: { b: 'deck', l: b.ll('deck', 40, 180, 0.5), fw: [0, 0, 1] }, free: 1 });
    b.d.deco = [{ dir: [-0.6, 0.35, -0.7], r: 38, col: [0.95, 0.65, 0.35], ring: 1 }, { dir: [0.7, 0.2, 0.6], r: 24, col: [0.4, 0.7, 0.95] }, { dir: [0.1, 0.8, -0.5], r: 12, col: [0.9, 0.5, 0.7] }];
    return b.d;
  }

  // ================== 長いコース（セクションをつなぐ） ==================
  // 星のかたまり（セクション）をいくつも ならべ、あいだを「星のレーン」（長い はっしゃスター）でつなぐ。
  // 体（星）には m（そのミッションだけ）をつけるので、ほかのミッションの星は 出ない・描かない。
  //   course(b, mid, specs, meta) → ミッションを1つ足す。spec = { k: 'walk'|'hop'|'stones'|'pods', r, laps, w, n, ... }
  function course(b, mid, specs, meta) {
    const hz = meta.hz || 0, M = [mid], O = k => [k * 80, 0, 0], secs = [], pts = {}, route = [];
    const surf = meta.surf || 'grass', ent = (k, bid, l, o) => b.ent(k, bid, l, Object.assign({ m: M }, o || {}));
    specs.forEach((sp, k) => {
      const T = mid + 's' + k, o = O(k), P = (x, y, z) => [o[0] + x, o[1] + y, o[2] + z], r = sp.r || 8, S = sp.surf || surf, rt = [];
      let entry, endL, endB, jEnd, laneReq, endReq;
      if (sp.k === 'walk') {
        const id = T + 'p', n = (sp.laps || 3) * 10; b.sph(id, P(0, 0, 0), r, { surf: S, m: M });
        for (let i = 0; i < n; i++) { const lat = 62 - 118 * i / (n - 1), lon = i * (360 * (sp.laps || 3) / (n - 1)); ent(sp.orb ? 'orb' : 'coin', id, b.ll(id, lat, lon, 1.0), { id: T + 'c' + i }); rt.push(T + 'c' + i); if (i === (sp.li || 12) && sp.lumi != null) { ent('lumi', id, b.ll(id, lat + 7, lon + 12, 1.2), { id: T + 'lu', n2: sp.lumi }); rt.push(T + 'lu'); } }
        const nw = (sp.w || 0) + Math.round(hz * 3);
        for (let j = 0; j < nw; j++) { const lat = -42 + 84 * (j + 0.5) / nw, l0 = b.ll(id, lat, j * 97 + 30, 0.6); ent('walker', id, l0, { id: T + 'w' + j, l0, ax: [0, 1, 0], w: (j % 2 ? -1 : 1) * (0.5 + 0.12 * (j % 3) + (sp.ws || 0) + hz * 0.3), ph: j }); }
        entry = { b: id, l: b.ll(id, 76, 0, 0.5) }; endB = id; endL = b.ll(id, -80, 40, 0.9);
        if (sp.crate) ent('crate', id, b.ll(id, 40, 200, 0.7), { id: T + 'cr', drop: sp.crate });
      } else if (sp.k === 'hop') {
        const nm = sp.n || 5; for (let i = 0; i < nm; i++) b.sph(T + 'm' + i, P(0, 0, -8 * i), 2.4, { surf: S, m: M });
        entry = { b: T + 'm0', l: b.at(T + 'm0', [0, 1, 0], 0.5) }; pts[T + 'f'] = { b: T + 'm0', l: [0, 0, -2.95] }; rt.push({ to: T + 'f', tol: 0.7 });
        for (let i = 0; i < nm - 1; i++) { const c = T + 'm' + (i + 1); ent('coin', c, b.at(c, [0, 0, 1], 1.0), { id: T + 'h' + i }); pts[T + 'a' + i] = { b: c, l: [0, 0, 2.95] }; rt.push({ to: T + 'a' + i, tol: 1.0, j: 3.4, land: 1 }); if (i < nm - 2) { pts[T + 'g' + i] = { b: c, l: [0, 0, -2.95] }; rt.push({ to: T + 'g' + i, tol: 0.7 }); } }
        endB = T + 'm' + (nm - 1); endL = b.at(endB, [0, 1, 0], 0.9);
      } else if (sp.k === 'stones') {
        const N = sp.n || 10, RR = sp.RR || 13.5, id = T + 'c'; b.sph(id, P(0, 0, 0), 6, { surf: sp.core || S, g: 0.5, gr: 7, m: M });
        for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; b.box(T + 't' + i, P(RR * cosD(a), RR * sinD(a), 0), [2.4, 0.8, 2.4], { rot: [0, 0, a - Math.PI / 2], rr: 0.5, surf: S, gr: 8, m: M }); }
        entry = { b: T + 't0', l: [0, 1.0, 0] };
        for (let i = 1; i < N - 1; i++) { ent('coin', T + 't' + i, [0, 1.8, 0], { id: T + 'k' + i }); pts[T + 'q' + i] = { b: T + 't' + i, l: [0, 1.3, 0] }; rt.push({ to: T + 'q' + i, tol: 1.1, j: sp.j || 7.9, land: 1 }); }
        endB = T + 't' + (N - 1); endL = [0, 1.8, 0];
        jEnd = sp.j || 7.9;
      } else if (sp.k === 'flip') { // さかさま：ジャンプで光のゾーンに入ると、重力がさかさまに
        const sl = T + 'sl', ce = T + 'ce'; b.box(sl, P(0, 0, 0), [10, 1.5, 10], { rr: 1, surf: 'stone', m: M }); b.box(ce, P(0, 18, 0), [8, 1, 8], { rr: 0.8, surf: 'stone', m: M });
        b.zone({ s: 'box', c: P(0, 10.5, 0), h: [7.5, 7.5, 7.5], m: 'dir', dir: [0, 1, 0], ms: M });
        ent('coin', sl, [-4, 2.5, 4], { id: T + 'c1' }); ent('crystal', ce, [3, -2.2, 3], { id: T + 'c3' }); pts[T + 'jp'] = { b: sl, l: [0, 2.0, 0] };
        entry = { b: sl, l: [-9, 2.0, 6] }; rt.push(T + 'c1', { to: T + 'jp', tol: 0.8 }, { to: T + 'c3', j: 99, once: 1 }); endB = ce; endL = [0, -2.0, -3];
      } else if (sp.k === 'kite') { // ハチ：ハチの箱をわって、ホバリングで大きなすきまをわたる
        const ra = T + 'a', rb = T + 'b'; b.sph(ra, P(0, 0, 0), 5, { surf: S, m: M }); b.sph(rb, P(19.5, 0, 0), 5.5, { surf: S, m: M });
        ent('crate', ra, b.at(ra, [1, 0.12, 0], 0.7), { id: T + 'bx', drop: 'kite' }); ent('coin', ra, b.at(ra, [0, 1, 0], 1.0), { id: T + 'e1' }); ent('coin', null, P(9.8, 5.9, 0), { id: T + 'e2' }); ent('coin', rb, b.at(rb, [-0.45, 1, 0], 1.0), { id: T + 'e3' });
        entry = { b: ra, l: b.at(ra, [0, 1, 0], 0.5) }; rt.push(T + 'e1', T + 'bx', { fly: T + 'e2' }, { fly: T + 'e3' }); endB = rb; endL = b.at(rb, [0.15, 1, 0], 0.9);
      } else if (sp.k === 'melt') { // ほのおスピン：アメのトゲの わをとかす
        const id = T + 'p'; b.sph(id, P(0, 0, 0), 9, { surf: S, m: M }); const sd = dir(-30, 90);
        ent('crate', id, b.ll(id, 40, 90, 0.7), { id: T + 'fc', drop: 'fire' }); ent('coin', id, b.ll(id, 10, 90, 1), { id: T + 'c1' });
        ringAround(b, id, sd, 1.5, 6, 0.5).forEach((l, i) => ent('spike', id, l, { id: T + 'sp' + (i + 1) }));
        entry = { b: id, l: b.ll(id, 66, 90, 0.5) }; rt.push(T + 'c1', T + 'fc'); for (let i = 1; i <= 6; i++) rt.push({ melt: T + 'sp' + i, at: 2.4 }); endB = id; endL = b.ll(id, -30, 90, 0.9);
        for (let j = 0; j < (sp.w || 0); j++) { const l0 = b.ll(id, 20 - j * 20, 150 + j * 60, 0.6); ent('walker', id, l0, { id: T + 'w' + j, l0, ax: [0, 1, 0], w: (j % 2 ? -1 : 1) * 0.7, ph: j }); }
      } else if (sp.k === 'swing') { // ゆれる月の はし
        const sa = T + 'a', sb = T + 'b', mm = T + 'mm'; b.sph(sa, P(0, 0, 0), 5, { surf: S, m: M }); b.sph(sb, P(22, 0, 0), 5, { surf: S, m: M }); b.sph(mm, P(8.5, 0, 0), 2.4, { surf: 'moss', m: M, mv: [{ t: 'lin', d: [6, 0, 0], T: sp.T || 7 }] });
        ent('coin', mm, b.at(mm, [0, 1, 0], 1.0), { id: T + 'cL' }); ent('coin', mm, b.at(mm, [1, 0, 0], 1.0), { id: T + 'cR' }); ent('coin', sb, b.at(sb, [-1, 0, 0], 1.0), { id: T + 'cB' });
        pts[T + 'fA'] = { b: sa, l: [5.5, 0, 0] }; entry = { b: sa, l: b.at(sa, [0, 1, 0], 0.5) }; rt.push({ to: T + 'fA', tol: 0.8 }, { to: T + 'cL', j: 5.2, land: 1 }, { to: T + 'cR', tol: 1.2 }, { to: T + 'cB', j: 4.2, land: 1 }); endB = sb; endL = b.at(sb, [0.2, 1, 0], 0.9);
      } else if (sp.k === 'gears') { // まわる はぐるまの わたり
        const gr = T + 'r', g1 = T + 'g1', g2 = T + 'g2'; b.sph(gr, P(0, 0, 0), 8, { surf: S, m: M }); b.cyl(g1, P(22, 2, 0), 5, 0.8, { surf: 'gear', rr: 0.3, m: M, mv: [{ t: 'spin', a: [0, 1, 0], T: 30 }] }); b.cyl(g2, P(33, 2, 0), 5, 0.8, { surf: 'gear', rr: 0.3, m: M, mv: [{ t: 'spin', a: [0, 1, 0], T: -30 }] });
        ent('launch', gr, b.at(gr, b.to(gr, g1), 0.9), { id: T + 'L1', mode: 'star', T: 1.4, arc: 6, to: { b: g1, l: [-3.0, 3.2, 0] } }); ent('coin', g1, [3.4, 1.6, 0], { id: T + 'g1c' }); ent('coin', g2, [-3.4, 1.6, 0], { id: T + 'g2c' });
        entry = { b: gr, l: b.ll(gr, 10, 60, 0.5) }; rt.push({ to: T + 'L1', launch: 1 }, { to: T + 'g1c', tol: 1.0 }, { to: T + 'g2c', j: 6.5, land: 1 }); endB = g2; endL = [0, 1.6, 0];
      } else if (sp.k === 'lamp') { // くらやみの ちょうちん（おばけつき）
        const id = T + 'p'; b.sph(id, P(0, 0, 0), r, { surf: 'dusk', m: M }); const nl = sp.n || 4;
        for (let i = 0; i < nl; i++) { ent('lantern', id, b.ll(id, 0, 60 + i * (300 / (nl - 1 || 1)), 0.8), { id: T + 'ln' + i, grp: T }); rt.push(T + 'ln' + i); }
        for (let j = 0; j < (sp.w || 2); j++) { const l0 = b.ll(id, -20 + j * 40, 105 + j * 120, 0.6); ent('walker', id, l0, { id: T + 'w' + j, look: 'ghost', l0, ax: [0, 1, 0], w: (j % 2 ? -1 : 1) * 0.75, ph: j }); }
        entry = { b: id, l: b.ll(id, -55, 0, 0.5) }; endB = id; endL = b.ll(id, 72, 200, 0.9); laneReq = 'lanterns' + T;
      } else if (sp.k === 'ped') { // だいざの ちょうちん
        const id = T + 'p'; b.sph(id, P(0, 0, 0), 9, { surf: 'dusk', m: M });
        [120, 180, 240].forEach((a, i) => { const rr = a * Math.PI / 180; b.cyl(T + 'pd' + i, P(9.7 * cosD(rr), 9.7 * sinD(rr), 0), 1.3, 0.7, { rot: [0, 0, rr - Math.PI / 2], rr: 0.3, surf: 'stone', g: 0, m: M }); ent('lantern', T + 'pd' + i, [0, 1.6, 0], { id: T + 'pl' + i, grp: T }); rt.push({ to: T + 'pl' + i, j: 3.6, land: 1 }); });
        entry = { b: id, l: b.ll(id, 0, 80, 0.5) }; endB = id; endL = b.ll(id, 75, 200, 0.9); laneReq = 'lanterns' + T;
      } else if (sp.k === 'crumble') { // 崩れる足場・ひっこむ足場（ph）：とまっていると おちる。リズムで すすむ
        const sa = T + 'sa', sb = T + 'sb', nd = sp.n || 5; b.box(sa, P(0, 0, 0), [8, 1.5, 5], { rr: 0.6, surf: 'stone', m: M });
        for (let i = 0; i < nd; i++) { const id = T + 'd' + i, ex = sp.phase ? { ph: { T: 5, d: 0.75, o: -(i % 3) * 0.25 } } : { cr: 0.9, back: 3 }; b.cyl(id, P(12.4 + i * 6.4, 0, 0), 2.2, 1.5, Object.assign({ rr: 0.4, surf: S, m: M }, ex)); pts[T + 'q' + i] = { b: id, l: [0, 2.0, 0] }; rt.push({ to: T + 'q' + i, tol: 1.3, j: 5.4, land: 1, win: sp.phase ? 2.4 : 0 }); ent('coin', id, [0, 2.6, 0], { id: T + 'cc' + i }); }
        const ex2 = 12.4 + (nd - 1) * 6.4 + 2.2 + 2 + 8; b.box(sb, P(ex2, 0, 0), [8, 1.5, 5], { rr: 0.6, surf: 'stone', m: M }); pts[T + 'qe'] = { b: sb, l: [0, 2.0, 0] }; rt.push({ to: T + 'qe', tol: 1.8, j: 5.4, land: 1, win: sp.phase ? 2.4 : 0 }); entry = { b: sa, l: [-4, 2.0, 0] }; endB = sb; endL = [3, 2.4, 0];
      } else if (sp.k === 'updraft') { // 風の柱：ふきあげにのって 空の島へ（風はリズムで ふいたり とまったり）
        const A = T + 'a', Bi = T + 'b'; b.sph(A, P(0, 0, 0), 8, { surf: S, m: M }); b.sph(Bi, P(0, 28, 0), 5, { surf: S, m: M });
        b.zone({ s: 'box', c: P(0, 16, 0), h: [2.4, 10, 2.4], m: 'wind', acc: [0, 40, 0], drag: 1, gust: { T: 6, d: 0.7 }, ms: M }); pts[T + 'cl'] = { b: A, l: [0, 8.5, 0] }; pts[T + 'bs'] = { b: Bi, l: [0, -5.5, 0] };
        entry = { b: A, l: [2.5, 8.2, 0] }; rt.push({ to: T + 'bs', tol: 1.3, max: 1600 }); endB = Bi; endL = b.at(Bi, [0.1, 1, 0], 0.9);
      } else if (sp.k === 'bridge') { // スイッチで はしが出る（はしは リズムで ひっこむ）
        const sa = T + 'sa', sb = T + 'sb', br = T + 'br'; b.box(sa, P(0, 0, 0), [6, 1.5, 5], { rr: 0.6, surf: 'stone', m: M }); b.box(sb, P(30, 0, 0), [6, 1.5, 5], { rr: 0.6, surf: 'stone', m: M });
        b.box(br, P(15, 0, 0), [10, 1.5, 2], { rr: 0.4, surf: S, m: M, sw: ent('switch', sa, [-2, 2.0, 3], { id: T + 'sw', n2: 0 }) && (mid.length * 7 + k) % 90 + 10, ph: { T: 7, d: 0.78, o: 0 } });
        b.d.ents.find(e => e.id === T + 'sw').n2 = b.d.bodies.find(x => x.id === br).sw; pts[T + 'b0'] = { b: br, l: [-8.5, 2.0, 0] }; pts[T + 'b1'] = { b: sb, l: [0, 2.0, 0] };
        entry = { b: sa, l: [-4, 2.0, -3] }; rt.push(T + 'sw', { to: T + 'b0', tol: 1.3, win: 4 }, { to: T + 'b1', tol: 1.6 }); endB = sb; endL = [3, 2.4, 0];
      } else if (sp.k === 'rail') { // せまい道：マグマの上の 細いパイプ
        const sa = T + 'sa', sb = T + 'sb', cr = T + 'core', tb = T + 'tube'; b.box(sa, P(0, 0, 0), [6, 1.5, 5], { rr: 0.6, surf: 'stone', m: M }); b.box(sb, P(30, 0, 0), [6, 1.5, 5], { rr: 0.6, surf: 'stone', m: M }); b.sph(cr, P(15, -9, 0), 5, { surf: 'lava', g: 0.6, gr: 14, m: M });
        b.cap(tb, P(15, 0.6, 0), 0.9, 10, { rot: [0, 0, Math.PI / 2], g: 1, gr: 8, surf: 'metal', m: M }); pts[T + 'r1'] = P(9, 2.0, 0); pts[T + 'r2'] = P(15, 2.0, 0); pts[T + 'r3'] = P(21, 2.0, 0); pts[T + 'r4'] = { b: sb, l: [0, 2.0, 0] };
        entry = { b: sa, l: [-3, 2.0, 0] }; rt.push({ to: T + 'r1', tol: 1.0 }, { to: T + 'r2', tol: 1.0 }, { to: T + 'r3', tol: 1.0 }, { to: T + 'r4', tol: 1.8 }); endB = sb; endL = [3, 2.4, 0];
      } else if (sp.k === 'roll') { // ころがり：岩の力で ころがって てきをはね飛ばす
        const id = T + 'p'; b.sph(id, P(0, 0, 0), sp.r || 10, { surf: S, m: M }); const n = 20, rr = sp.r || 10;
        ent('crate', id, b.ll(id, 66, 14, 0.7), { id: T + 'rc', drop: 'drill' });
        for (let i = 0; i < n; i++) { const lat = 60 - 112 * i / (n - 1), lon = i * (360 * 2 / (n - 1)); ent('coin', id, b.ll(id, lat, lon, 1.0), { id: T + 'c' + i }); rt.push(T + 'c' + i); }
        for (let j = 0; j < (sp.w || 6); j++) { const l0 = b.ll(id, -40 + j * 14, 40 + j * 61, 0.6); ent('walker', id, l0, { id: T + 'w' + j, l0, ax: [0, 1, 0], w: (j % 2 ? -1 : 1) * (0.6 + hz * 0.3), ph: j }); }
        entry = { b: id, l: b.ll(id, 76, 0, 0.5) }; endB = id; endL = b.ll(id, -80, 40, 0.9);
      } else if (sp.k === 'leap') { // スケートのジャンプ：スケートがないと とどかない すきま
        const sa = T + 'sa', sb = T + 'sb'; b.box(sa, P(0, 0, 0), [24, 1.5, 5], { rr: 0.6, surf: S, m: M }); b.box(sb, P(62, 0, 0), [24, 1.5, 5], { rr: 0.6, surf: S, m: M });
        ent('crate', sa, [-19, 2.3, 0], { id: T + 'sk', drop: 'skate' }); [-14, -9, -4, 1].forEach((x, q) => ent(sp.orb === false ? 'coin' : 'orb', sa, [x, 2.4, 0], { id: T + 'o' + q })); ent('coin', sb, [-21, 2.4, 0], { id: T + 'bc' }); pts[T + 'bc'] = { b: sb, l: [-21, 2.0, 0] };
        entry = { b: sa, l: [-22, 2.0, 0] }; rt.push(T + 'sk', T + 'o0', T + 'o1', T + 'o2', T + 'o3', { to: T + 'bc', j: 18.0, land: 1, hold: 1, tol: 1.6 }); endB = sb; endL = [6, 2.4, 0];
      } else if (sp.k === 'pullgap') { // ひっぱる星の場：すきまに入ると むこうの足場へ ひっぱられる
        const sa = T + 'sa', sb = T + 'sb'; b.box(sa, P(0, 0, 0), [10, 1.5, 5], { rr: 0.6, surf: S, m: M }); b.box(sb, P(36, 0, 0), [10, 1.5, 5], { rr: 0.6, surf: S, m: M });
        b.zone({ s: 'box', c: P(18, 4, 0), h: [8, 5, 4], m: 'wind', to: P(36, 3.5, 0), str: 36, drag: 0.5, ms: M }); ent('coin', null, P(18, 5, 0), { id: T + 'pc' });
        pts[T + 'pb'] = { b: sb, l: [-4, 2.0, 0] }; entry = { b: sa, l: [-8, 2.0, 0] }; rt.push({ to: T + 'pb', tol: 1.8, j: 24.5, land: 1, hold: 1 }); endB = sb; endL = [6, 2.4, 0];
      } else if (sp.k === 'dashgap') { // コメットダッシュ：ジャンプだけでは とどかない ひろいすきま
        const sa = T + 'sa', sb = T + 'sb'; b.box(sa, P(0, 0, 0), [10, 1.5, 5], { rr: 0.6, surf: S, m: M }); b.box(sb, P(30, 0, 0), [10, 1.5, 5], { rr: 0.6, surf: S, m: M });
        ent('crate', sa, [-6, 2.3, 0], { id: T + 'dc', drop: 'dash' }); ent('coin', sa, [3, 2.4, 0], { id: T + 'c1' }); ent('coin', sb, [-6, 2.4, 0], { id: T + 'c2' }); pts[T + 'bc'] = { b: sb, l: [-5, 2.0, 0] };
        entry = { b: sa, l: [-8, 2.0, 3] }; rt.push(T + 'dc', T + 'c1', { to: T + 'bc', j: 16.5, once: 1, land: 1, dash: 1, tol: 1.6 }); endB = sb; endL = [6, 2.4, 0];
      } else if (sp.k === 'jellytower') { // ゼリーバウンス：着地のたびに ちょうどよく ジャンプして、うえの星へ
        const ra = T + 'a', rb = T + 'b'; b.sph(ra, P(0, 0, 0), 6, { surf: S, m: M }); b.sph(rb, P(2, 19.5, 0), 6, { surf: S, m: M });
        ent('crate', ra, b.at(ra, [-1, 0.12, 0.2], 0.7), { id: T + 'jc', drop: 'jelly' }); ent('coin', ra, b.at(ra, [0, 1, 0], 1.0), { id: T + 'e1' }); ent('coin', rb, b.at(rb, [0, -1, 0], 1.0), { id: T + 'e2' }); pts[T + 'bt'] = { b: rb, l: b.at(rb, [0, -1, 0], 1.0) };
        entry = { b: ra, l: b.at(ra, [0.3, 1, 0.3], 0.5) }; rt.push(T + 'jc', T + 'e1', { to: T + 'bt', tol: 1.7, bounce: 1, max: 3000 }); endB = rb; endL = b.at(rb, [0.4, -1, 0.3], 0.9);
      } else if (sp.k === 'drillgate') { // ドリル：てつの はこの かべは ドリルでしか こわせない
        const id = T + 'p', R9 = sp.r || 9; b.sph(id, P(0, 0, 0), R9, { surf: S, m: M }); const tgt = dir(-62, 200);
        ent('crate', id, b.ll(id, 62, 20, 0.7), { id: T + 'dr', drop: 'drill' }); for (let q = 0; q < 3; q++) ringAround(b, id, tgt, 1.7, 6, 0.7 + q * 1.4).forEach((l, i) => ent('crate', id, l, { id: T + 'ir' + q + i, iron: 1 }));
        for (let i = 0; i < 8; i++) { const lat = 60 - 120 * i / 7, lon = i * 70; ent('coin', id, b.ll(id, lat, lon, 1.0), { id: T + 'c' + i }); }
        for (let j = 0; j < (sp.w || 3); j++) { const l0 = b.ll(id, -30 + j * 25, 40 + j * 97, 0.6); ent('walker', id, l0, { id: T + 'w' + j, l0, ax: [0, 1, 0], w: (j % 2 ? -1 : 1) * (0.6 + hz * 0.3), ph: j }); }
        entry = { b: id, l: b.ll(id, 76, 0, 0.5) }; rt.push(T + 'dr', T + 'c0', T + 'c1', T + 'c2', T + 'c3', T + 'c4'); endB = id; endL = b.at(id, tgt, 0.9);
      } else if (sp.k === 'boss') { // ボスのアリーナ
        const id = T + 'arena'; b.sph(id, P(0, 0, 0), sp.r || 11, { surf: S, m: M });
        ent('boss', id, b.at(id, [0, 1, 0], 0), Object.assign({ id: T + 'boss', rad: 1.7 }, sp.boss || {})); ent('heart', id, b.at(id, [-1, 0.2, 0.4], 1.0), { id: T + 'hh1' }); ent('heart', id, b.at(id, [1, -0.2, -0.4], 1.0), { id: T + 'hh2' });
        entry = { b: id, l: b.at(id, [0, -0.5, 0.9], 0.5) }; rt.push({ boss: 1, max: 9000 }); endB = id; endL = b.at(id, [0.2, 1, 0.1], 1.0); endReq = 'boss';
      } else { // pods（modes: はっしゃスター・大砲・パイプ）
        const A = T + 'a', Bd = T + 'b', C = T + 'c', md = sp.modes || ['star', 'star'], tm = { star: [1.3, 6], cannon: [1.9, 8], pipe: [1.4, 3] }; b.sph(A, P(0, 0, 0), 6, { surf: S, m: M }); b.sph(Bd, P(20, 5, 0), 4.5, { surf: S, m: M }); b.sph(C, P(34, -2, 12), 3.5, { surf: S, m: M });
        ent('launch', A, b.at(A, b.to(A, Bd), 0.9), { id: T + 'L1', mode: md[0], T: tm[md[0]][0], arc: tm[md[0]][1], to: { b: Bd, l: b.at(Bd, b.to(Bd, A), 2.4 + (md[0] === 'star' ? 0 : 0.2)) } });
        ent('coin', Bd, b.at(Bd, b.to(Bd, A), 1.2), { id: T + 'b1' }); ent('walker', Bd, b.at(Bd, [0.2, 1, 0.2], 0.6), { id: T + 'w', l0: b.at(Bd, [0.2, 1, 0.2], 0.6), ax: [0, 0, 1], w: 0.8 + (sp.ws || 0), ph: 1 });
        ent('launch', Bd, b.at(Bd, b.to(Bd, C), 0.9), { id: T + 'L2', mode: md[1], T: tm[md[1]][0], arc: tm[md[1]][1], to: { b: C, l: b.at(C, b.to(C, Bd), 2.4 + (md[1] === 'star' ? 0 : 0.2)) } }); ent('coin', C, b.at(C, [0, 1, 0], 1.0), { id: T + 'b2' });
        entry = { b: A, l: b.ll(A, 5, 50, 0.5) }; rt.push({ to: T + 'L1', launch: 1 }, T + 'b1', { to: T + 'L2', launch: 1 }, T + 'b2'); endB = C; endL = b.at(C, [0.2, -1, 0.1], 0.9);
      }
      if (k > 0) rt.unshift({ wait: 30 });
      secs.push({ entry, endB, endL, rt, T, jEnd, laneReq, endReq });
    });
    // つなぎ：レーン（あいだの長い はっしゃスター）と、セクションのはじめのチェックポイント
    secs.forEach((sc, k) => {
      route.push(...sc.rt);
      if (k > 0) b.ent('cp', sc.entry.b, sc.entry.l.map(v => v * 0.999), { m: M, id: sc.T + 'cp' });
      if (k < secs.length - 1) { const nx = secs[k + 1], id = sc.T + 'endlane'; if (!b.d.ents.some(e => e.id === id)) b.ent('launch', sc.endB, sc.endL, Object.assign({ m: M, id, mode: 'star', T: 2.6, arc: 14, lane: 1, to: { b: nx.entry.b, l: nx.entry.l, lift: 1.5 } }, sc.laneReq ? { req: sc.laneReq } : {})); route.push(sc.jEnd ? { to: id, launch: 1, j: sc.jEnd } : { to: id, launch: 1 }); }
      else if (meta.kind !== 'hunt') { b.ent('shard', sc.endB, sc.endL, Object.assign({ m: M, id: mid + 's' }, sc.endReq ? { req: sc.endReq } : meta.kind === 'comet' ? { req: 'orbs' } : {})); route.push(mid + 's'); }
    });
    b.mission({ id: mid, name: meta.name, desc: meta.desc, kind: meta.kind, timer: meta.timer, need: meta.need, lumi: meta.kind === 'hunt' ? 3 : undefined, start: { b: secs[0].entry.b, l: secs[0].entry.l, fw: [0, 0, 1] }, shard: meta.kind === 'hunt' ? undefined : mid + 's', pts, route, par: meta.par || 150, long: meta.kind === 'comet' || meta.kind === 'hunt' ? 0 : 1 });
  }

  // ================== 1. みどりのポコ星ぐん ==================
  function g1() {
    const b = Builder('g1', T('みどりのポコ星ぐん', 'Meadow Orbit'), 'grass', { n1: [0.08, 0.3, 0.5], n2: [0.45, 0.65, 0.3], band: [0.2, 0.9, 0.4], sun: [0.6, 0.5, -0.5], sunc: [1, 0.95, 0.8], stars: 1 });
    const LG = ['_x'];
    b.sph('home', [0, 0, 0], 7, { surf: 'grass', m: LG }); b.sph('p2', [20, 6, 0], 4.5, { surf: 'moss', m: LG }); b.sph('p3', [34, -2, 12], 3.5, { surf: 'grass', m: LG });
    for (let i = 0; i < 4; i++) b.sph('mo' + (i + 1), [-24, 0, -8 * i], 2.4, { surf: 'grass', m: LG });
    course(b, 'g1m1', [{ k: 'walk', r: 9, laps: 3, w: 3 }, { k: 'hop', n: 5 }, { k: 'pods' }, { k: 'walk', r: 10, laps: 3, w: 4, surf: 'moss' }, { k: 'stones', n: 10 }, { k: 'walk', r: 8, laps: 2, w: 2 }, { k: 'pods', surf: 'moss' }, { k: 'walk', r: 11, laps: 4, w: 4 }], { name: T('はじめの たび', 'The First Journey'), desc: T('6つの星を レーンでつないで、ながい たび。ちいさな星を ぐるぐる、月を ぴょんぴょん、石を ジャンプ！', 'A long trip over six sections joined by star lanes: spiral around planets, hop tiny moons, jump stones.'), par: 150 });
    course(b, 'g1m2', [{ k: 'pods' }, { k: 'walk', r: 10, laps: 4, w: 4 }, { k: 'stones', n: 10, surf: 'moss' }, { k: 'hop', n: 6 }, { k: 'pods', surf: 'moss' }, { k: 'walk', r: 9, laps: 3, w: 3 }, { k: 'hop', n: 6 }, { k: 'walk', r: 11, laps: 4, w: 4 }], { name: T('ふわふわ ほしわたり', 'Launch Star Hop'), desc: T('はっしゃスターと レーンで ほしを つなぐ ながい コース', 'A long course linked by launch stars and star lanes.'), par: 160 });
    course(b, 'g1m3', [{ k: 'hop', n: 7 }, { k: 'walk', r: 9, laps: 3, w: 3 }, { k: 'stones', n: 8, RR: 11.8, j: 8.4 }, { k: 'pods' }, { k: 'hop', n: 6 }, { k: 'walk', r: 10, laps: 3, w: 4, surf: 'moss' }, { k: 'stones', n: 10 }, { k: 'walk', r: 11, laps: 4, w: 4 }], { name: T('ちいさなお月さま ぴょんぴょん', 'Tiny Moon Hops'), desc: T('ちいさな月を ぴょんぴょん わたる 長い コース', 'A long course of tiny moon hops and more.'), par: 160 });
    // m4：みどりの すいせい（みじかい「すいせい」。じかんぎれはなく、はやいほど ランクが よい）
    const m4 = ['g1m4'];
    [[-25, 100], [-25, 150], [-25, 200], [-25, 250], [-25, 300], [-25, 350]].forEach((c, i) => b.ent('orb', 'home', b.ll('home', c[0], c[1], 1.0), { m: m4, id: 'o' + (i + 1) }));
    b.ent('launch', 'home', b.ll('home', 16.7, 90, 0.9), { m: m4.concat('g1hunt'), id: 'L1c', mode: 'star', T: 1.0, arc: 5, to: { b: 'p2', l: b.at('p2', b.to('p2', 'home'), 2.4) } });
    b.ent('shard', 'p2', b.at('p2', b.to('p2', 'home'), 1.0), { m: m4, id: 's4', req: 'orbs' });
    // かくれルミ3つを さがす
    b.ent('launch', 'home', b.ll('home', 16.7, 90, 0.9), { m: ['g1hunt'], id: 'L1', mode: 'star', T: 1.3, arc: 6, to: { b: 'p2', l: b.at('p2', b.to('p2', 'home'), 2.4) } });
    b.ent('launch', 'p2', b.at('p2', b.to('p2', 'p3'), 0.9), { m: ['g1hunt'], id: 'L2', mode: 'star', T: 1.3, arc: 6, to: { b: 'p3', l: b.at('p3', b.to('p3', 'p2'), 2.4) } });
    b.ent('lumi', 'home', b.ll('home', -50, 200, 1.2), { id: 'lu1', n2: 0 }); b.ent('lumi', 'p2', b.at('p2', [0.2, -1, 0.3], 1.2), { id: 'lu2', n2: 1 }); b.ent('lumi', 'p3', b.at('p3', [0.5, 1, 0.3], 1.3), { id: 'lu3', n2: 2 });
    b.d.deco = [{ dir: [-0.5, 0.3, -0.8], r: 40, col: [0.55, 0.8, 0.45], ring: 0 }, { dir: [0.7, 0.4, -0.5], r: 18, col: [0.95, 0.75, 0.4], ring: 1 }, { dir: [0.2, -0.3, 0.9], r: 26, col: [0.5, 0.65, 0.95] }];
    course(b, 'g1m4', [{ k: 'walk', r: 9, laps: 2, w: 1, orb: 1 }, { k: 'pods' }, { k: 'walk', r: 9, laps: 2, w: 1, orb: 1 }, { k: 'walk', r: 8, laps: 2, orb: 1 }], { kind: 'comet', timer: 90, name: T('みどりの すいせい', 'Meadow Comet'), desc: T('すいせいのかけらを あつめて ゴールへ。はやいほど ランクが アップ（じかんぎれは ありません）', 'Collect the comet orbs and reach the goal. Faster means a better rank (no time limit).'), par: 90 });
    course(b, 'g1hunt', [{ k: 'walk', r: 9, laps: 3, w: 2, lumi: 0 }, { k: 'hop', n: 5 }, { k: 'walk', r: 9, laps: 3, w: 2, lumi: 1 }, { k: 'pods' }, { k: 'stones', n: 10 }, { k: 'walk', r: 9, laps: 3, w: 2 }, { k: 'walk', r: 10, laps: 4, w: 3, lumi: 2, li: 26 }], { kind: 'hunt', name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('星々に かくれている ルミを3ひき みつけよう', 'Find the 3 hidden Lumi across the planets.'), par: 150 });
    return b.d;
  }

  // ================== 2. こおりのひんやり星ぐん ==================
  function g2() {
    const b = Builder('g2', T('こおりの ひんやり星ぐん', 'Frost Drift'), 'ice', { n1: [0.06, 0.22, 0.55], n2: [0.55, 0.85, 0.95], band: [0.7, 0.6, 0.2], sun: [-0.5, 0.45, -0.7], sunc: [0.85, 0.95, 1], stars: 1, aur: [0.3, 1, 0.7] });
    b.sph('ice1', [0, 0, 0], 9, { surf: 'ice' });
    b.box('slab', [40, 0, 0], [10, 1.5, 10], { rr: 1, surf: 'stone' });
    b.box('ceil', [40, 18, 0], [8, 1, 8], { rr: 0.8, surf: 'stone' });
    b.sph('ice2', [-30, 10, 12], 6, { surf: 'ice', ring: 1 });
    b.sph('ice3', [-48, -2, -8], 4.5, { surf: 'stone' });
    // --- ミッション1：つるつる スケート
    const m1 = ['g2m1'];
    const E1 = (k, ll, o) => b.ent(k, 'ice1', b.ll('ice1', ll[0], ll[1], ll[2] == null ? 1 : ll[2]), Object.assign({ m: m1 }, o || {}));
    E1('coin', [40, 30], { id: 'a1' }); E1('coin', [15, 30], { id: 'a2' }); E1('coin', [-10, 30], { id: 'a3' }); E1('coin', [-35, 30], { id: 'a4' });
    b.ent('spike', 'ice1', b.ll('ice1', 0, 40, 0.5), { m: m1, id: 'sp1' }); b.ent('spike', 'ice1', b.ll('ice1', -22, 22, 0.5), { m: m1, id: 'sp2' });
    E1('shard', [-58, 30], { id: 's1' });
    // --- ミッション2：さかさま ステーション
    const m2 = ['g2m2'];
    b.ent('coin', 'slab', [-4, 2.5, 4], { m: m2, id: 'c1' }); b.ent('coin', 'slab', [0, 2.5, 0], { m: m2, id: 'c2' });
    b.ent('crystal', 'ceil', [3, -2.2, 3], { m: m2, id: 'c3' });
    b.ent('shard', 'ceil', [0, -2.0, -3], { m: m2, id: 's2' });
    // --- ミッション3：こおりの たび（大砲とパイプ）
    const m3 = ['g2m3'];
    b.ent('launch', 'ice1', b.ll('ice1', 12, 290, 0.9), { m: m3, id: 'C1', mode: 'cannon', T: 1.9, arc: 8, to: { b: 'ice2', l: b.at('ice2', b.to('ice2', 'ice1'), 2.6) } });
    b.ent('coin', 'ice2', b.at('ice2', b.to('ice2', 'ice1'), 1.2), { m: m3, id: 'd1' });
    b.ent('launch', 'ice2', b.at('ice2', b.to('ice2', 'ice3'), 0.9), { m: m3, id: 'P1', mode: 'pipe', T: 1.4, arc: 3, to: { b: 'ice3', l: b.at('ice3', b.to('ice3', 'ice2'), 2.6) } });
    b.ent('crystal', 'ice3', b.at('ice3', b.to('ice3', 'ice2'), 1.2), { m: m3, id: 'd2' });
    b.ent('shard', 'ice3', b.at('ice3', [0, 1, 0.3], 1.0), { m: m3, id: 's3' });
    b.ent('crate', 'ice2', b.at('ice2', [0.3, 1, 0.1], 0.7), { m: m3, id: 'cr1', drop: 'dash' });
    b.d.ents.forEach(e => { if (e.id === 'C1' || e.id === 'P1') e.m = e.m.concat('g2hunt'); });
    b.ent('lumi', 'ice1', b.ll('ice1', -20, 100, 1.2), { id: 'lu1', n2: 0 }); b.ent('lumi', 'ice3', b.at('ice3', [-0.4, 0.5, 1], 1.2), { id: 'lu3', n2: 2 });
    b.ent('cp', 'ice1', b.ll('ice1', -30, 180, 0.2), { id: 'cp1' });
    b.ent('lumi', 'ice2', b.at('ice2', [0.8, 0.3, 0.5], 1.2), { id: 'lu2', n2: 1 });
    b.d.deco = [{ dir: [-0.4, 0.3, -0.85], r: 46, col: [0.65, 0.85, 0.98], ring: 1 }, { dir: [0.8, 0.3, 0.45], r: 16, col: [0.9, 0.95, 1] }, { dir: [0.0, 0.9, 0.4], r: 22, col: [0.55, 0.7, 0.95] }];
    const scope = (ids, m) => b.d.bodies.forEach(bd => { if (ids.indexOf(bd.id) >= 0) bd.m = (bd.m || []).concat(m); });
    scope(['ice1', 'ice2', 'ice3'], ['_x']); scope(['slab', 'ceil'], ['_x']);
    course(b, 'g2m1', [{ k: 'walk', r: 10, laps: 3, w: 2 }, { k: 'pods', modes: ['cannon', 'pipe'] }, { k: 'walk', r: 9, laps: 3, w: 3 }, { k: 'stones', n: 10, surf: 'stone' }, { k: 'walk', r: 10, laps: 4, w: 3 }, { k: 'flip' }, { k: 'pods' }], { hz: 0.15, surf: 'ice', name: T('つるつる スケート', 'Slippery Skate'), desc: T('すべる こおりの星を めぐる ながい たび。ブレーキは むずかしい！', 'A long trip over slippery ice worlds. Braking is hard!'), par: 160 });
    course(b, 'g2m2', [{ k: 'flip' }, { k: 'walk', r: 10, laps: 3, w: 2 }, { k: 'flip' }, { k: 'hop', n: 6, surf: 'stone' }, { k: 'stones', n: 10, surf: 'stone' }, { k: 'flip' }, { k: 'walk', r: 10, laps: 4, w: 3 }], { hz: 0.15, surf: 'ice', name: T('さかさま ステーション', 'Upside-Down Station'), desc: T('ジャンプして 光のゾーンに入ると、重力が さかさまに！ 天井を あるいて すすむ ながい コース', 'Jump into glowing zones to flip gravity and walk on ceilings, over a long course.'), par: 160 });
    course(b, 'g2m3', [{ k: 'pods', modes: ['cannon', 'pipe'] }, { k: 'walk', r: 10, laps: 3, w: 3 }, { k: 'pods', modes: ['pipe', 'cannon'] }, { k: 'stones', n: 10, surf: 'stone' }, { k: 'hop', n: 6, surf: 'stone' }, { k: 'flip' }, { k: 'walk', r: 9, laps: 4, w: 3 }], { hz: 0.15, surf: 'ice', name: T('こおりの たび', 'Cannon & Pipe'), desc: T('大砲とパイプで 星から星へ。こおりの星ぐんを ぐるっと 長い たび', 'A long journey by cannon and pipe through the ice worlds.'), par: 165 });
    course(b, 'g2hunt', [{ k: 'walk', r: 9, laps: 3, w: 2, lumi: 0 }, { k: 'pods', modes: ['cannon', 'pipe'] }, { k: 'walk', r: 9, laps: 3, w: 2, lumi: 1 }, { k: 'flip' }, { k: 'stones', n: 10, surf: 'stone' }, { k: 'walk', r: 9, laps: 3, w: 2 }, { k: 'walk', r: 10, laps: 4, w: 3, lumi: 2, li: 26 }], { kind: 'hunt', surf: 'ice', hz: 0.15, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('こおりの星々に かくれた ルミを みつけよう', 'Find the Lumi hiding on the ice worlds.'), par: 150 });
    return b.d;
  }

  // ================== 3. ようがんぐつぐつ星ぐん（ボスつき） ==================
  function g3() {
    const b = Builder('g3', T('ようがん ぐつぐつ星ぐん', 'Magma Simmer'), 'lava', { n1: [0.4, 0.08, 0.08], n2: [0.95, 0.4, 0.1], band: [0.5, 0.7, 0.5], sun: [0.3, 0.6, -0.7], sunc: [1, 0.7, 0.5], stars: 0.8 });
    b.sph('core', [0, 0, 0], 6, { surf: 'lava', g: 0.5, gr: 7 });
    const N = 8, RR = 11.8;
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, c = [RR * cosD(a), RR * sinD(a), 0]; b.box('st' + i, c, [2.4, 0.8, 2.4], { rot: [0, 0, a - Math.PI / 2], rr: 0.5, surf: 'stone', gr: 8 }); }
    b.sph('ra', [70, 0, 0], 5, { surf: 'stone' });
    b.sph('rb', [89.5, 0, 0], 5.5, { surf: 'stone' });
    b.sph('arena', [0, 0, 80], 10, { surf: 'stone' });
    // --- ミッション1：ようがんの ぐるぐる
    const m1 = ['g3m1'];
    const top = i => { const a = i / N * Math.PI * 2; return [RR * cosD(a), RR * sinD(a), 0].map((v, k) => v + [cosD(a), sinD(a), 0][k] * 1.8); };
    const edge = (i, s) => { const a = i / N * Math.PI * 2, rad = [cosD(a), sinD(a), 0], tg = [-sinD(a), cosD(a), 0]; return [0, 1, 2].map(k => (RR + 1.8) * rad[k] + tg[k] * s); };
    // 石の上（ローカル）：箱の軸は (x:接線, y:外向き, z:奥) に回してある
    for (let i = 1; i <= 4; i++) { b.ent('coin', 'st' + i, [0, 1.8, 0], { m: m1, id: 'k' + i }); }
    b.ent('crystal', 'st5', [0, 1.8, 0], { m: m1, id: 'k5' });
    b.ent('shard', 'st6', [0, 1.8, 0], { m: m1, id: 's1' });
    b.ent('cp', 'st3', [0, 1.1, 1.2], { m: m1, id: 'cp1' });
    // --- ミッション2：ふわふわ ハチのたび
    const m2 = ['g3m2'];
    b.ent('crate', 'ra', b.at('ra', [1, 0.12, 0], 0.7), { m: m2, id: 'bx', drop: 'kite' });
    b.ent('coin', 'ra', b.at('ra', [0, 1, 0], 1.0), { m: m2, id: 'e1' });
    b.ent('shard', 'rb', b.at('rb', [-1, 0.05, 0], 1.0), { m: m2, id: 's2' });
    // --- ミッション3：ボス グツグツおうさま
    const m3 = ['g3m3'];
    b.ent('boss', 'arena', b.at('arena', [0, 1, 0], 0), { m: m3, id: 'boss', hp: 3, rad: 1.7 });
    b.ent('shard', 'arena', b.at('arena', [0.2, 1, 0.1], 1.0), { m: m3, id: 's3', req: 'boss' });
    b.ent('heart', 'arena', b.at('arena', [-1, 0.2, 0.4], 1.0), { m: m3, id: 'hh1' });
    b.ent('lumi', 'st2', [0, 1.8, 0], { id: 'lu1', n2: 0 }); b.ent('lumi', 'st4', [0, 1.8, 0], { id: 'lu2', n2: 1 }); b.ent('lumi', 'st6', [0, 1.8, 0], { id: 'lu3', n2: 2 });
    [1, 3, 5].forEach(i => b.ent('coin', 'st' + i, [0, 1.8, 0], { m: ['g3hunt'], id: 'hc' + i }));
    b.d.deco = [{ dir: [0.5, 0.15, -0.8], r: 50, col: [0.95, 0.45, 0.2], ring: 0 }, { dir: [-0.8, 0.4, 0.3], r: 20, col: [0.7, 0.3, 0.3], ring: 1 }, { dir: [0.0, -0.4, -0.9], r: 14, col: [0.95, 0.8, 0.4] }];
    const scope = (ids, m) => b.d.bodies.forEach(bd => { if (ids.indexOf(bd.id) >= 0) bd.m = (bd.m || []).concat(m); });
    scope(['core'], ['_x']); for (let i = 0; i < 8; i++) scope(['st' + i], ['_x']); scope(['ra', 'rb', 'arena'], ['_x']);
    course(b, 'g3m1', [{ k: 'stones', n: 8, RR: 11.8, j: 8.4, core: 'lava' }, { k: 'dashgap' }, { k: 'stones', n: 8, RR: 11.8, j: 8.4, core: 'lava' }, { k: 'pods' }, { k: 'stones', n: 8, RR: 11.8, j: 8.4, core: 'lava' }, { k: 'walk', r: 10, laps: 3, w: 4 }, { k: 'kite' }, { k: 'walk', r: 10, laps: 4, w: 4 }, { k: 'rail' }], { hz: 0.3, surf: 'stone', name: T('ようがんの ぐるぐる', 'Stepping Stones'), desc: T('マグマの星の まわりの 石から石へ ジャンプ！ ながい たび', 'Hop stone to stone around lava worlds, over a long course.'), par: 160 });
    course(b, 'g3m2', [{ k: 'walk', r: 9, laps: 3, w: 3 }, { k: 'kite' }, { k: 'stones', n: 8, RR: 11.8, j: 8.4, core: 'lava' }, { k: 'hop', n: 6 }, { k: 'kite' }, { k: 'walk', r: 10, laps: 4, w: 4 }, { k: 'pods' }, { k: 'stones', n: 8, RR: 11.8, j: 8.4, core: 'lava' }, { k: 'walk', r: 10, laps: 3, w: 4 }, { k: 'rail' }, { k: 'roll' }], { hz: 0.3, surf: 'stone', name: T('ふわふわ カイトのたび', 'Kite Flight'), desc: T('カイトの力で すきまを グライド。ダッシュや ゼリーの そなえも ひつよう！ 長い たび', 'Glide over gaps with the kite suit; dash, jelly and drill suits help too. A long trip.'), par: 160 });
    course(b, 'g3m3', [{ k: 'stones', n: 8, RR: 11.8, j: 8.4, core: 'lava' }, { k: 'drillgate' }, { k: 'kite' }, { k: 'pods' }, { k: 'stones', n: 8, RR: 11.8, j: 8.4, core: 'lava' }, { k: 'hop', n: 6 }, { k: 'walk', r: 10, laps: 4, w: 4 }, { k: 'stones', n: 8, RR: 11.8, j: 8.4, core: 'lava' }, { k: 'walk', r: 10, laps: 3, w: 4 }, { k: 'rail' }, { k: 'crumble', n: 5 }, { k: 'boss', r: 10, boss: { hp: 3 } }], { hz: 0.3, surf: 'stone', kind: 'boss', name: T('ボス グツグツおうさま', 'Boss: King Simmer'), desc: T('マグマの道を こえて おうさまの アリーナへ。ドスンと おちたら スキだらけ！ スピンか ふみつけで 3かい', 'Cross the magma road to the arena. When the king slams down he is dazed: hit him 3 times.'), par: 200 });
    course(b, 'g3hunt', [{ k: 'walk', r: 9, laps: 3, w: 2, lumi: 0 }, { k: 'stones', n: 8, RR: 11.8, j: 8.4, core: 'lava' }, { k: 'walk', r: 9, laps: 3, w: 2, lumi: 1 }, { k: 'rail' }, { k: 'kite' }, { k: 'walk', r: 9, laps: 3, w: 2 }, { k: 'walk', r: 10, laps: 4, w: 3, lumi: 2, li: 26 }], { kind: 'hunt', surf: 'stone', hz: 0.3, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('マグマの星々に かくれた ルミを みつけよう', 'Find the Lumi on the magma worlds.'), par: 150 });
    return b.d;
  }


  // ================== 4. あまあまキャンディ星ぐん ==================
  function g4() {
    const b = Builder('g4', T('あまあま キャンディ星ぐん', 'Sugar Sprinkle'), 'candy', { n1: [0.5, 0.12, 0.38], n2: [1, 0.55, 0.8], band: [0.4, 0.8, 0.4], sun: [0.4, 0.55, -0.7], sunc: [1, 0.92, 0.9], stars: 0.9 });
    b.sph('cand1', [0, 0, 0], 9, { surf: 'candy' }); b.sph('cand2', [26, 4, 0], 5, { surf: 'candy' }); b.sph('cand3', [70, 0, 0], 14, { surf: 'candy', ring: 1 });
    // m1：あまあま さんぽ（てきの ガミーが うろうろ）
    const m1 = ['g4m1'], E1 = (k, ll, o) => b.ent(k, 'cand1', b.ll('cand1', ll[0], ll[1], ll[2] == null ? 1 : ll[2]), Object.assign({ m: m1 }, o || {}));
    E1('coin', [40, 0], { id: 'a1' }); E1('coin', [14, 0], { id: 'a2' }); E1('crystal', [-14, 0], { id: 'a3' }); E1('coin', [-38, 0], { id: 'a4' }); E1('shard', [-66, 0], { id: 's1' });
    b.ent('walker', 'cand1', b.ll('cand1', 26, 0, 0.6), { m: m1, id: 'w1', l0: b.ll('cand1', 26, 0, 0.6), ax: [0, 0, 1], w: 0.7, ph: 0 });
    b.ent('walker', 'cand1', b.ll('cand1', -26, 0, 0.6), { m: m1, id: 'w2', l0: b.ll('cand1', -26, 0, 0.6), ax: [0, 0, 1], w: -0.8, ph: 2 });
    // m2：ほのおスピンで、アメのトゲの わをとかす
    const m2 = ['g4m2'], sd = b.ll('cand1', -30, 90, 0).map(v => v); const sdir = LVdir(-30, 90);
    b.ent('crate', 'cand1', b.ll('cand1', 40, 90, 0.7), { m: m2, id: 'fc', drop: 'fire' });
    ringAround(b, 'cand1', sdir, 1.5, 6, 0.5).forEach((l, i) => b.ent('spike', 'cand1', l, { m: m2, id: 'sp' + (i + 1) }));
    b.ent('coin', 'cand1', b.ll('cand1', 10, 90, 1), { m: m2, id: 'c1' }); b.ent('shard', 'cand1', b.ll('cand1', -30, 90, 1.0), { m: m2, id: 's2' });
    // m3：スケートで すきまを とびこえる（スケートがないと とどかない：ちから＝足の速さ）
    const m3 = ['_x']; b.box('sa', [0, 0, 300], [24, 1.5, 6], { rr: 0.6, surf: 'candy', m: m3 }); b.box('sb', [62, 0, 300], [24, 1.5, 6], { rr: 0.6, surf: 'candy', m: m3 });
    b.ent('crate', 'sa', [-19, 2.3, 0], { m: m3, id: 'sk', drop: 'skate' });
    [-14, -9, -4, 1].forEach((x, i) => b.ent('orb', 'sa', [x, 2.4, 0], { m: m3, id: 'o' + (i + 1) }));
    b.ent('coin', 'sb', [-21, 2.4, 0], { m: m3, id: 'bc' }); b.ent('shard', 'sb', [0, 2.4, 0], { m: m3, id: 's3', req: 'orbs' });
    // かくれルミ
    b.ent('lumi', 'cand1', b.ll('cand1', 50, 220, 1.2), { id: 'lu1', n2: 0 }); b.ent('lumi', 'cand1', b.ll('cand1', -55, 20, 1.2), { id: 'lu3', n2: 2 }); b.ent('lumi', 'cand2', b.at('cand2', [-0.3, 1, 0.5], 1.2), { id: 'lu2', n2: 1 });
    b.ent('launch', 'cand1', b.at('cand1', b.to('cand1', 'cand2'), 0.9), { m: ['g4hunt'], id: 'LH', mode: 'cannon', T: 1.6, arc: 6, to: { b: 'cand2', l: b.at('cand2', b.to('cand2', 'cand1'), 2.4) } });
    b.d.deco = [{ dir: [-0.6, 0.3, -0.7], r: 40, col: [1, 0.6, 0.8], ring: 1 }, { dir: [0.7, 0.4, -0.4], r: 16, col: [0.6, 0.9, 1] }, { dir: [0.1, -0.3, 0.9], r: 24, col: [1, 0.9, 0.5] }];
    const scope = (ids, m) => b.d.bodies.forEach(bd => { if (ids.indexOf(bd.id) >= 0) bd.m = (bd.m || []).concat(m); });
    scope(['cand1', 'cand2'], ['_x']); scope(['cand3'], ['_x']);
    course(b, 'g4m1', [{ k: 'jellytower' }, { k: 'melt', w: 1 }, { k: 'hop', n: 5, surf: 'stone' }, { k: 'walk', r: 10, laps: 3, w: 4 }, { k: 'pods' }, { k: 'melt', w: 2 }, { k: 'stones', n: 10, surf: 'stone' }, { k: 'walk', r: 9, laps: 3, w: 3 }, { k: 'roll' }, { k: 'crumble', n: 5 }], { hz: 0.4, surf: 'candy', name: T('あまあま さんぽ', 'Sweet Stroll'), desc: T('ガミーを スピンで やっつけて、アメのトゲを とかしながら すすむ ながい たび', 'A long trip: spin the gummy guards and melt the candy spikes.'), par: 170 });
    course(b, 'g4m2', [{ k: 'melt' }, { k: 'jellytower' }, { k: 'melt', w: 1 }, { k: 'stones', n: 10, surf: 'stone' }, { k: 'hop', n: 6, surf: 'stone' }, { k: 'melt', w: 2 }, { k: 'walk', r: 10, laps: 4, w: 4 }, { k: 'pods' }, { k: 'walk', r: 10, laps: 3, w: 4 }, { k: 'crumble', n: 5 }, { k: 'roll' }], { hz: 0.4, surf: 'candy', name: T('ほのおスピンで とかせ！', 'Melt It With Fire Spin'), desc: T('ほのおの箱を スピンでわって、トゲの わを とかしていく ながい コース', 'A long course melting rings of candy spikes with fire spin.'), par: 170 });
    course(b, 'g4m3', [{ k: 'walk', r: 9, laps: 2, w: 1, orb: 1 }, { k: 'leap', surf: 'candy' }, { k: 'walk', r: 9, laps: 2, w: 2, orb: 1 }], { kind: 'comet', timer: 90, surf: 'candy', name: T('スケートで ジャンプ！', 'Skate Leap'), desc: T('スケートの箱で はやく走って、ふつうでは とどかない すきまを とびこえよう。はやいほど ランクが アップ', 'Grab the skate crate and leap the gap that normal jumps cannot cross. Faster means a better rank.'), par: 100 });
    course(b, 'g4hunt', [{ k: 'walk', r: 9, laps: 3, w: 2, lumi: 0 }, { k: 'melt' }, { k: 'walk', r: 9, laps: 3, w: 2, lumi: 1 }, { k: 'crumble', n: 5 }, { k: 'roll' }, { k: 'walk', r: 9, laps: 3, w: 2 }, { k: 'walk', r: 10, laps: 4, w: 3, lumi: 2, li: 26 }], { kind: 'hunt', surf: 'candy', hz: 0.4, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('おかしの星々に かくれた ルミを みつけよう', 'Find the Lumi hiding on the candy worlds.'), par: 160 });
    return b.d;
  }
  const LVdir = dir;

  // ================== 5. ぷかぷかあわ星ぐん ==================
  function g5() {
    const b = Builder('g5', T('ぷかぷか あわ星ぐん', 'Bubble Bay'), 'ocean', { n1: [0.04, 0.28, 0.55], n2: [0.25, 0.85, 0.85], band: [0.6, 0.7, 0.3], sun: [0.3, 0.65, -0.6], sunc: [0.9, 1, 1], stars: 0.9 });
    b.sph('bb1', [0, 0, 0], 8, { surf: 'water' }); b.sph('bb2', [24, 6, 0], 5, { surf: 'water' }); b.sph('bb3', [44, -4, 8], 4, { surf: 'moss' });
    b.sph('sa', [0, 0, 60], 5, { surf: 'water' }); b.sph('sb', [22, 0, 60], 5, { surf: 'water' }); b.sph('mm', [8.5, 0, 60], 2.4, { surf: 'moss', mv: [{ t: 'lin', d: [6, 0, 0], T: 7 }] });
    // m1：あわの パイプめぐり
    const m1 = ['g5m1'];
    b.ent('launch', 'bb1', b.at('bb1', b.to('bb1', 'bb2'), 0.9), { m: m1.concat('g5hunt'), id: 'P1', mode: 'pipe', T: 1.4, arc: 4, to: { b: 'bb2', l: b.at('bb2', b.to('bb2', 'bb1'), 2.6) } });
    b.ent('launch', 'bb2', b.at('bb2', b.to('bb2', 'bb3'), 0.9), { m: m1.concat('g5hunt'), id: 'P2', mode: 'pipe', T: 1.4, arc: 4, to: { b: 'bb3', l: b.at('bb3', b.to('bb3', 'bb2'), 2.6) } });
    b.ent('coin', 'bb1', b.ll('bb1', 30, 30, 1), { m: m1, id: 'a1' }); b.ent('coin', 'bb1', b.ll('bb1', 20, 60, 1), { m: m1, id: 'a2' }); b.ent('coin', 'bb2', b.at('bb2', b.to('bb2', 'bb1'), 1.2), { m: m1, id: 'a3' }); b.ent('crystal', 'bb3', b.at('bb3', b.to('bb3', 'bb2'), 1.2), { m: m1, id: 'a4' });
    b.ent('walker', 'bb2', b.at('bb2', [0.1, 1, 0.1], 0.6), { m: m1, id: 'w1', l0: b.at('bb2', [0.1, 1, 0.1], 0.6), ax: [0, 0, 1], w: 0.7, ph: 1 });
    b.ent('shard', 'bb3', b.at('bb3', [0, 1, 0.2], 1.0), { m: m1, id: 's1' });
    // m2：ゆれる 月の はし
    const m2 = ['g5m2'];
    b.ent('coin', 'mm', b.at('mm', [0, 1, 0], 1.0), { m: m2, id: 'cL' }); b.ent('coin', 'mm', b.at('mm', [1, 0, 0], 1.0), { m: m2, id: 'cR' }); b.ent('coin', 'sb', b.at('sb', [-1, 0, 0], 1.0), { m: m2, id: 'cB' });
    b.ent('shard', 'sb', b.at('sb', [0, 1, 0], 1.0), { m: m2, id: 's2' });
    // m3：あわの すいせい
    const m3 = ['g5m3'];
    for (let i = 0; i < 6; i++) b.ent('orb', 'bb1', b.ll('bb1', -20, 60 + i * 55, 1.0), { m: m3, id: 'o' + (i + 1) });
    b.ent('launch', 'bb1', b.at('bb1', b.to('bb1', 'bb2'), 0.9), { m: m3, id: 'Lc', mode: 'star', T: 1.0, arc: 5, to: { b: 'bb2', l: b.at('bb2', b.to('bb2', 'bb1'), 2.4) } });
    b.ent('shard', 'bb2', b.at('bb2', b.to('bb2', 'bb1'), 1.0), { m: m3, id: 's3', req: 'orbs' });
    b.ent('lumi', 'bb1', b.ll('bb1', -50, 200, 1.2), { id: 'lu1', n2: 0 }); b.ent('lumi', 'bb2', b.at('bb2', [0.3, -1, 0.3], 1.2), { id: 'lu2', n2: 1 }); b.ent('lumi', 'bb3', b.at('bb3', [0.5, 0.6, 1], 1.2), { id: 'lu3', n2: 2 });
    b.d.deco = [{ dir: [-0.5, 0.2, -0.8], r: 44, col: [0.4, 0.8, 0.95], ring: 0 }, { dir: [0.7, 0.5, -0.4], r: 18, col: [0.8, 1, 0.9], ring: 1 }, { dir: [0.0, -0.4, 0.9], r: 20, col: [0.5, 0.6, 1] }];
    const scope = (ids, m) => b.d.bodies.forEach(bd => { if (ids.indexOf(bd.id) >= 0) bd.m = (bd.m || []).concat(m); });
    scope(['bb1', 'bb2', 'bb3'], ['_x']); scope(['sa', 'sb', 'mm'], ['_x']);
    course(b, 'g5m1', [{ k: 'pods', modes: ['pipe', 'pipe'] }, { k: 'kite' }, { k: 'swing' }, { k: 'hop', n: 6, surf: 'stone' }, { k: 'pods', modes: ['pipe', 'pipe'] }, { k: 'walk', r: 10, laps: 3, w: 4 }, { k: 'stones', n: 10, surf: 'stone' }, { k: 'swing' }, { k: 'walk', r: 10, laps: 3, w: 4 }, { k: 'bridge' }, { k: 'updraft' }], { hz: 0.5, surf: 'water', name: T('あわの パイプめぐり', 'Bubble Pipes'), desc: T('パイプと ゆれる月で あわの星ぐんを めぐる ながい たび', 'A long trip through pipes and swinging moons.'), par: 165 });
    course(b, 'g5m2', [{ k: 'swing' }, { k: 'kite' }, { k: 'pods', modes: ['pipe', 'star'] }, { k: 'swing', T: 6 }, { k: 'hop', n: 6, surf: 'stone' }, { k: 'walk', r: 10, laps: 4, w: 4 }, { k: 'stones', n: 10, surf: 'stone' }, { k: 'pods', modes: ['pipe', 'pipe'] }, { k: 'walk', r: 9, laps: 3, w: 4 }, { k: 'updraft' }, { k: 'bridge' }], { hz: 0.5, surf: 'water', name: T('ゆれる 月の はし', 'The Swinging Moon'), desc: T('行ったり来たりする 小さな月に のって 向こうの星へ。ながい コース', 'Ride the swinging little moons across a long course.'), par: 170 });
    course(b, 'g5m3', [{ k: 'walk', r: 9, laps: 2, w: 1, orb: 1 }, { k: 'pods', modes: ['pipe', 'pipe'] }, { k: 'swing' }, { k: 'walk', r: 9, laps: 2, w: 2, orb: 1 }], { kind: 'comet', timer: 100, surf: 'water', hz: 0.5, name: T('あわの すいせい', 'Bubble Comet'), desc: T('すいせいのかけらを あつめて ゴールへ。はやいほど ランクが アップ', 'Collect the comet orbs and reach the goal. Faster means a better rank.'), par: 100 });
    course(b, 'g5hunt', [{ k: 'walk', r: 9, laps: 3, w: 2, lumi: 0 }, { k: 'swing' }, { k: 'walk', r: 9, laps: 3, w: 2, lumi: 1 }, { k: 'bridge' }, { k: 'updraft' }, { k: 'walk', r: 9, laps: 3, w: 2 }, { k: 'walk', r: 10, laps: 4, w: 3, lumi: 2, li: 26 }], { kind: 'hunt', surf: 'water', hz: 0.5, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('あわの星々に かくれた ルミを みつけよう', 'Find the Lumi in the bubble worlds.'), par: 160 });
    return b.d;
  }

  // ================== 6. ぜんまいの いせき（ボスつき） ==================
  function g6() {
    const b = Builder('g6', T('ぜんまいの いせき', 'Clockwork Ruins'), 'ruins', { n1: [0.3, 0.2, 0.08], n2: [0.95, 0.75, 0.35], band: [0.2, 0.6, 0.7], sun: [0.5, 0.5, -0.6], sunc: [1, 0.9, 0.7], stars: 0.8 });
    b.sph('gr1', [0, 0, 0], 8, { surf: 'ruin' });
    b.cyl('gd1', [22, 2, 0], 5, 0.8, { surf: 'gear', rr: 0.3, mv: [{ t: 'spin', a: [0, 1, 0], T: 30 }] }); b.cyl('gd2', [33, 2, 0], 5, 0.8, { surf: 'gear', rr: 0.3, mv: [{ t: 'spin', a: [0, 1, 0], T: -30 }] });
    const N = 10, RR = 13.5; b.sph('core', [0, 0, 70], 6, { surf: 'ruin', g: 0.5, gr: 7 });
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; b.box('st' + i, [RR * cosD(a), RR * sinD(a), 70], [2.4, 0.8, 2.4], { rot: [0, 0, a - Math.PI / 2], rr: 0.5, surf: 'ruin', gr: 8 }); }
    b.sph('arena', [0, 0, 130], 11, { surf: 'ruin' });
    // m1：はぐるまの わたり
    const m1 = ['g6m1'];
    b.ent('launch', 'gr1', b.at('gr1', b.to('gr1', 'gd1'), 0.9), { m: m1.concat('g6hunt'), id: 'L1', mode: 'star', T: 1.4, arc: 6, to: { b: 'gd1', l: [-3.0, 3.2, 0] } });
    b.ent('coin', 'gd1', [3.4, 1.6, 0], { m: m1, id: 'g1c' }); b.ent('coin', 'gd2', [-3.4, 1.6, 0], { m: m1, id: 'g2c' }); b.ent('shard', 'gd2', [0, 1.6, 0], { m: m1, id: 's1' });
    // m2：ぜんまいの すいせい
    const m2 = ['g6m2'];
    for (let i = 0; i < 6; i++) b.ent('orb', 'gr1', b.ll('gr1', -22, 70 + i * 55, 1.0), { m: m2, id: 'o' + (i + 1) });
    b.ent('launch', 'gr1', b.at('gr1', b.to('gr1', 'gd1'), 0.9), { m: m2, id: 'Lc', mode: 'star', T: 1.4, arc: 6, to: { b: 'gd1', l: [-3.0, 3.2, 0] } });
    b.ent('shard', 'gd1', [0, 1.6, 0], { m: m2, id: 's2', req: 'orbs' });
    // m3：遺跡の 石だたみ
    const m3 = ['g6m3']; for (let i = 1; i <= 4; i++) b.ent('coin', 'st' + i, [0, 1.8, 0], { m: m3, id: 'k' + i }); b.ent('crystal', 'st5', [0, 1.8, 0], { m: m3, id: 'k5' }); b.ent('shard', 'st7', [0, 1.8, 0], { m: m3, id: 's3' }); b.ent('coin', 'st6', [0, 1.8, 0], { m: m3, id: 'k6' });
    // m4：ボス ぜんまいガーディアン
    const m4 = ['g6m4'];
    b.ent('boss', 'arena', b.at('arena', [0, 1, 0], 0), { m: m4, id: 'boss', hp: 4, rad: 1.7, spd: 0.55, rs: 14, dbl: 1, stun: 4.6, look: 'guard' });
    b.ent('shard', 'arena', b.at('arena', [0.2, 1, 0.1], 1.0), { m: m4, id: 's4', req: 'boss' }); b.ent('heart', 'arena', b.at('arena', [-1, 0.2, 0.4], 1.0), { m: m4, id: 'hh1' });
    b.ent('lumi', 'gr1', b.ll('gr1', -50, 220, 1.2), { id: 'lu1', n2: 0 }); b.ent('lumi', 'gd1', [-1.5, 1.5, 3], { id: 'lu2', n2: 1 }); b.ent('lumi', 'gd2', [2.5, 1.5, -2], { id: 'lu3', n2: 2 });
    b.d.deco = [{ dir: [0.5, 0.2, -0.8], r: 46, col: [0.9, 0.7, 0.35], ring: 1 }, { dir: [-0.8, 0.4, 0.3], r: 20, col: [0.7, 0.55, 0.3] }, { dir: [0.1, -0.5, -0.85], r: 14, col: [0.95, 0.85, 0.6] }];
    const scope = (ids, m) => b.d.bodies.forEach(bd => { if (ids.indexOf(bd.id) >= 0) bd.m = (bd.m || []).concat(m); });
    scope(['gr1', 'gd1', 'gd2'], ['_x']); scope(['core'], ['_x']); for (let i = 0; i < 10; i++) scope(['st' + i], ['_x']); scope(['arena'], ['_x']);
    course(b, 'g6m1', [{ k: 'gears' }, { k: 'dashgap' }, { k: 'stones', n: 10 }, { k: 'gears' }, { k: 'hop', n: 6 }, { k: 'pods' }, { k: 'walk', r: 10, laps: 3, w: 4 }, { k: 'gears' }, { k: 'walk', r: 10, laps: 3, w: 4 }, { k: 'crumble', n: 5, phase: 1 }, { k: 'bridge' }], { hz: 0.6, surf: 'ruin', name: T('はぐるまの わたり', 'Gear Crossing'), desc: T('まわる はぐるまと 遺跡の星を つなぐ ながい たび', 'A long trip over turning gears and ruin planets.'), par: 170 });
    course(b, 'g6m3', [{ k: 'stones', n: 10 }, { k: 'gears' }, { k: 'drillgate' }, { k: 'hop', n: 6 }, { k: 'stones', n: 10 }, { k: 'gears' }, { k: 'walk', r: 10, laps: 4, w: 5 }, { k: 'crumble', n: 5, phase: 1 }, { k: 'rail' }], { hz: 0.6, surf: 'ruin', name: T('遺跡の 石だたみ', 'Ruin Stepping Stones'), desc: T('こわれた遺跡の 石から石へ。はぐるまも わたる ながい コース', 'Hop broken ruin stones and cross gears on a long course.'), par: 170 });
    course(b, 'g6m4', [{ k: 'gears' }, { k: 'stones', n: 10 }, { k: 'walk', r: 10, laps: 3, w: 5 }, { k: 'hop', n: 6 }, { k: 'pods' }, { k: 'walk', r: 10, laps: 4, w: 5 }, { k: 'gears' }, { k: 'stones', n: 10 }, { k: 'hop', n: 6 }, { k: 'walk', r: 10, laps: 3, w: 5 }, { k: 'crumble', n: 5, phase: 1 }, { k: 'updraft' }, { k: 'boss', r: 11, boss: { hp: 4, spd: 0.55, rs: 14, dbl: 1, stun: 4.6, look: 'guard', charge: 1 } }], { hz: 0.6, surf: 'ruin', kind: 'boss', name: T('ボス ぜんまいガーディアン', 'Boss: Clockwork Guardian'), desc: T('遺跡を こえて アリーナへ。2つの衝撃波を ジャンプでよけて、スキだらけの ガーディアンを 4かい たたこう', 'Cross the ruins to the arena, jump the double shockwave and hit the dazed guardian 4 times.'), par: 220 });
    course(b, 'g6m2', [{ k: 'walk', r: 9, laps: 2, w: 2, orb: 1 }, { k: 'gears' }, { k: 'walk', r: 9, laps: 2, w: 3, orb: 1 }], { kind: 'comet', timer: 100, surf: 'ruin', hz: 0.6, name: T('ぜんまいの すいせい', 'Clockwork Comet'), desc: T('遺跡を まわって すいせいのかけらを あつめよう。はやいほど ランクが アップ', 'Collect comet orbs around the ruins. Faster means a better rank.'), par: 100 });
    course(b, 'g6hunt', [{ k: 'walk', r: 9, laps: 3, w: 2, lumi: 0 }, { k: 'gears' }, { k: 'walk', r: 9, laps: 3, w: 2, lumi: 1 }, { k: 'crumble', n: 5, phase: 1 }, { k: 'bridge' }, { k: 'walk', r: 9, laps: 3, w: 2 }, { k: 'walk', r: 10, laps: 4, w: 3, lumi: 2, li: 26 }], { kind: 'hunt', surf: 'ruin', hz: 0.6, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('遺跡と はぐるまの ルミを みつけよう', 'Find the Lumi in the ruins and on the gears.'), par: 160 });
    return b.d;
  }

  // ================== 7. おばけ星雲（ちょうちんをともす） ==================
  function g7() {
    const b = Builder('g7', T('おばけ星雲', 'Haunted Nebula'), 'dusk', { n1: [0.1, 0.04, 0.22], n2: [0.5, 0.28, 0.85], band: [0.5, 0.5, 0.7], sun: [-0.4, 0.5, -0.6], sunc: [0.7, 0.6, 1], stars: 1.1, dark: 1 });
    b.sph('hn1', [0, 0, 0], 9, { surf: 'dusk' }); b.sph('hn2', [26, 2, 0], 5, { surf: 'dusk' }); b.sph('hn3', [48, -3, 10], 4, { surf: 'stone' });
    [120, 180, 240].forEach((a, i) => { const r = a * Math.PI / 180; b.cyl('pd' + (i + 1), [9.7 * cosD(r), 9.7 * sinD(r), 0], 1.3, 0.7, { rot: [0, 0, r - Math.PI / 2], rr: 0.3, surf: 'stone', g: 0 }); });
    const lan = (m, id, ll) => b.ent('lantern', 'hn1', b.ll('hn1', ll[0], ll[1], 0.8), { m, id });
    // m1：ちょうちんを ぜんぶ ともそう（おばけが うろうろ）
    const m1 = ['g7m1']; [[0, 60], [0, 150], [0, 240], [0, 330]].forEach((c, i) => lan(m1, 'ln' + (i + 1), c));
    b.ent('walker', 'hn1', b.ll('hn1', 0, 105, 0.6), { m: m1, id: 'w1', look: 'ghost', l0: b.ll('hn1', 0, 105, 0.6), ax: [0, 1, 0], w: 0.7, ph: 0 }); b.ent('walker', 'hn1', b.ll('hn1', 0, 285, 0.6), { m: m1, id: 'w2', look: 'ghost', l0: b.ll('hn1', 0, 285, 0.6), ax: [0, 1, 0], w: -0.8, ph: 0 });
    b.ent('crate', 'hn1', b.ll('hn1', 60, 300, 0.7), { m: m1, id: 'shc', drop: 'shield' });
    b.ent('shard', 'hn1', b.ll('hn1', 70, 0, 1.0), { m: m1, id: 's1', req: 'lanterns' });
    // m2：おばけの だいざ（ちょうちんは だいざの 上）
    const m2 = ['g7m2']; [1, 2, 3].forEach(i => b.ent('lantern', 'pd' + i, [0, 1.6, 0], { m: m2, id: 'pl' + i }));
    b.ent('shard', 'hn1', b.ll('hn1', 75, 200, 1.0), { m: m2, id: 's2', req: 'lanterns' });
    // m3：ともしびの すいせい
    const m3 = ['g7m3']; for (let i = 0; i < 5; i++) lan(m3, 'lc' + (i + 1), [-25, 40 + i * 60]);
    b.ent('launch', 'hn1', b.at('hn1', b.to('hn1', 'hn2'), 0.9), { m: m3.concat('g7hunt'), id: 'L1', mode: 'star', T: 1.3, arc: 6, to: { b: 'hn2', l: b.at('hn2', b.to('hn2', 'hn1'), 2.4) } });
    b.ent('walker', 'hn2', b.at('hn2', [0.2, 1, 0.2], 0.6), { m: m3, id: 'w3', look: 'ghost', l0: b.at('hn2', [0.2, 1, 0.2], 0.6), ax: [0, 0, 1], w: 0.9, ph: 1 });
    b.ent('shard', 'hn2', b.at('hn2', b.to('hn2', 'hn1'), 1.0), { m: m3, id: 's3', req: 'lanterns' });
    b.ent('launch', 'hn2', b.at('hn2', b.to('hn2', 'hn3'), 0.9), { m: ['g7hunt'], id: 'L2', mode: 'pipe', T: 1.4, arc: 4, to: { b: 'hn3', l: b.at('hn3', b.to('hn3', 'hn2'), 2.6) } });
    b.ent('lumi', 'hn1', b.ll('hn1', -50, 200, 1.2), { id: 'lu1', n2: 0 }); b.ent('lumi', 'hn2', b.at('hn2', [0.3, -1, 0.3], 1.2), { id: 'lu2', n2: 1 }); b.ent('lumi', 'hn3', b.at('hn3', [0.5, 0.6, 1], 1.2), { id: 'lu3', n2: 2 });
    b.d.deco = [{ dir: [-0.4, 0.4, -0.8], r: 44, col: [0.6, 0.45, 0.9], ring: 1 }, { dir: [0.8, 0.2, 0.5], r: 14, col: [0.9, 0.8, 1] }, { dir: [0.0, 0.8, -0.5], r: 22, col: [0.4, 0.35, 0.7] }];
    const scope = (ids, m) => b.d.bodies.forEach(bd => { if (ids.indexOf(bd.id) >= 0) bd.m = (bd.m || []).concat(m); });
    scope(['hn1', 'hn2', 'hn3'], ['_x']); scope(['pd1', 'pd2', 'pd3'], ['_x']);
    course(b, 'g7m1', [{ k: 'lamp', n: 4, w: 3 }, { k: 'ped' }, { k: 'lamp', n: 5, w: 4 }, { k: 'hop', n: 6 }, { k: 'lamp', n: 5, w: 4 }, { k: 'stones', n: 10 }, { k: 'ped' }, { k: 'dashgap' }, { k: 'ped' }, { k: 'updraft' }, { k: 'rail' }, { k: 'crumble', n: 5 }], { hz: 1.8, surf: 'dusk', name: T('ちょうちんを ともせ', 'Light the Lanterns'), desc: T('くらやみの星々の ちょうちんに あかりを ともして すすむ ながい たび。おばけは スピンで おいはらえる', 'A long trip through the dark, lighting lanterns. Spin the ghosts away!'), par: 180 });
    course(b, 'g7m2', [{ k: 'ped' }, { k: 'lamp', n: 5, w: 4 }, { k: 'hop', n: 6 }, { k: 'ped' }, { k: 'lamp', n: 6, w: 4 }, { k: 'stones', n: 10 }, { k: 'drillgate' }, { k: 'lamp', n: 5, w: 4 }, { k: 'ped' }, { k: 'bridge' }, { k: 'crumble', n: 5, phase: 1 }, { k: 'rail' }], { hz: 1.8, surf: 'dusk', name: T('だいざの ちょうちん', 'Pedestal Lights'), desc: T('石のだいざに ジャンプで のって ちょうちんを ともす ながい コース', 'Jump onto pedestals and light lanterns on a long course.'), par: 180 });
    course(b, 'g7m3', [{ k: 'walk', r: 9, laps: 2, w: 2, orb: 1 }, { k: 'lamp', n: 4, w: 3 }, { k: 'walk', r: 9, laps: 2, w: 3, orb: 1 }], { kind: 'comet', timer: 100, surf: 'dusk', hz: 0.8, name: T('ともしびの すいせい', 'Lantern Comet'), desc: T('ちょうちんを ともしながら すいせいのかけらを あつめよう。はやいほど ランクが アップ', 'Light lanterns and collect comet orbs. Faster means a better rank.'), par: 100 });
    course(b, 'g7hunt', [{ k: 'walk', r: 9, laps: 3, w: 2, lumi: 0 }, { k: 'lamp', n: 4, w: 3 }, { k: 'walk', r: 9, laps: 3, w: 2, lumi: 1 }, { k: 'updraft' }, { k: 'ped' }, { k: 'walk', r: 9, laps: 3, w: 2 }, { k: 'walk', r: 10, laps: 4, w: 3, lumi: 2, li: 26 }], { kind: 'hunt', surf: 'dusk', hz: 0.8, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('くらやみの星々の ルミを みつけよう', 'Find the Lumi in the dark worlds.'), par: 160 });
    return b.d;
  }

  // ================== 8. ほしの おうかん（ラスト） ==================
  function g8() {
    const b = Builder('g8', T('ほしの おうかん', 'Crown of Stars'), 'star', { n1: [0.2, 0.1, 0.5], n2: [1, 0.85, 0.4], band: [0.3, 0.8, 0.5], sun: [0.5, 0.6, -0.6], sunc: [1, 0.95, 0.8], stars: 1.2, lens: [0.1, 0.35, 0.93, 0.22] });
    b.sph('fs1', [0, 0, 0], 8, { surf: 'star' }); b.sph('fs2', [30, 0, 0], 6, { surf: 'star' }); b.sph('fs3', [60, 5, 0], 5, { surf: 'metal' }); b.sph('fs4', [90, 0, 0], 6, { surf: 'star', ring: 1 });
    b.sph('ba', [0, 0, 200], 5, { surf: 'star' }); b.sph('bb', [19.5, 0, 200], 5.5, { surf: 'star' }); b.sph('arena', [0, 0, 300], 12, { surf: 'star' });
    // m1：ほしのみち（ハチで 大きな すきまを わたる）
    const m1 = ['g8m1'];
    b.ent('crate', 'ba', b.at('ba', [1, 0.12, 0], 0.7), { m: m1, id: 'bx', drop: 'kite' }); b.ent('coin', 'ba', b.at('ba', [0, 1, 0], 1.0), { m: m1, id: 'e1' }); b.ent('coin', null, [9.6, 0.4, 200], { m: m1, id: 'e2' });
    b.ent('shard', 'bb', b.at('bb', [-1, 0.05, 0], 1.0), { m: m1, id: 's1' });
    // m2：ぜんぶの 銀河の しれん（ガントレット：すいせいを つなげる。ぜんぶの銀河をクリアしたら）
    const m2 = ['g8m2'], chain = ['fs1', 'fs2', 'fs3', 'fs4']; let ct = 0;
    chain.forEach((id, k) => { for (let i = 0; i < 3; i++) b.ent('orb', id, b.ll(id, k === 0 ? -20 : 20 - i * 5, 120 + i * 80 + k * 20, 1.0), { m: m2, id: 'o' + (++ct) });
      if (k < 3) { const nx = chain[k + 1]; b.ent('launch', id, b.at(id, b.to(id, nx), 0.9), { m: m2.concat('g8hunt'), id: 'L' + (k + 1), mode: k === 1 ? 'cannon' : 'star', T: 1.6, arc: 8, to: { b: nx, l: b.at(nx, b.to(nx, id), 2.4) } }); } });
    b.ent('shard', 'fs4', b.at('fs4', b.to('fs4', 'fs3'), 1.0), { m: m2, id: 's2', req: 'orbs' });
    // m3：ラスボス ほしのおうさま
    const m3 = ['g8m3'];
    b.ent('boss', 'arena', b.at('arena', [0, 1, 0], 0), { m: m3, id: 'boss', hp: 6, rad: 1.9, spd: 0.48, rs: 12, dblAt: 4, triAt: 2, stun: 5.8, look: 'king' });
    b.ent('shard', 'arena', b.at('arena', [0.2, 1, 0.1], 1.0), { m: m3, id: 's3', req: 'boss' }); b.ent('heart', 'arena', b.at('arena', [-1, 0.2, 0.4], 1.0), { m: m3, id: 'hh1' }); b.ent('heart', 'arena', b.at('arena', [1, -0.2, -0.4], 1.0), { m: m3, id: 'hh2' });
    b.ent('lumi', 'fs1', b.ll('fs1', 40, 200, 1.2), { id: 'lu1', n2: 0 }); b.ent('lumi', 'fs2', b.at('fs2', [0.3, -1, 0.3], 1.2), { id: 'lu2', n2: 1 }); b.ent('lumi', 'fs3', b.at('fs3', [0.5, 0.6, 1], 1.2), { id: 'lu3', n2: 2 });
    b.d.deco = [{ dir: [0.5, 0.3, -0.8], r: 54, col: [1, 0.85, 0.4], ring: 1 }, { dir: [-0.8, 0.3, 0.4], r: 22, col: [0.6, 0.7, 1] }, { dir: [0.1, -0.5, -0.85], r: 16, col: [1, 0.6, 0.8] }];
    const scope = (ids, m) => b.d.bodies.forEach(bd => { if (ids.indexOf(bd.id) >= 0) bd.m = (bd.m || []).concat(m); });
    scope(['fs1', 'fs2', 'fs3', 'fs4'], ['_x']); scope(['ba', 'bb', 'arena'], ['_x']);
    course(b, 'g8m1', [{ k: 'kite' }, { k: 'jellytower' }, { k: 'flip' }, { k: 'stones', n: 10 }, { k: 'kite' }, { k: 'hop', n: 7 }, { k: 'pods' }, { k: 'walk', r: 10, laps: 4, w: 5 }, { k: 'updraft' }, { k: 'crumble', n: 5, phase: 1 }, { k: 'rail' }, { k: 'bridge' }], { hz: 2.0, surf: 'star', name: T('ほしの みち', 'Star Road'), desc: T('カイト・重力・石・月…ぜんぶの ちからを つかう ながい ほしの みち', 'A long star road that uses every power.'), par: 190 });
    course(b, 'g8m3', [{ k: 'kite' }, { k: 'flip' }, { k: 'stones', n: 10 }, { k: 'dashgap' }, { k: 'melt', w: 2 }, { k: 'hop', n: 7 }, { k: 'gears' }, { k: 'stones', n: 10 }, { k: 'walk', r: 10, laps: 4, w: 6 }, { k: 'hop', n: 7 }, { k: 'flip' }, { k: 'walk', r: 10, laps: 3, w: 6 }, { k: 'updraft' }, { k: 'crumble', n: 5, phase: 1 }, { k: 'rail' }, { k: 'bridge' }, { k: 'crumble', n: 5 }, { k: 'boss', r: 12, boss: { hp: 6, spd: 0.48, rs: 12, dblAt: 4, triAt: 2, stun: 5.8, look: 'king', charge: 1 } }], { hz: 2.0, surf: 'star', kind: 'final', name: T('ラスボス ほしのおうさま', 'Final Boss: Star King'), desc: T('これまでの ちからを ぜんぶ つかって アリーナへ。3だんかいの しょうげきを よけて、スキを スピンで 6かい！', 'Use every power to reach the arena, jump three phases of shockwaves, then spin the dazed king 6 times.'), par: 260 });
    course(b, 'g8m2', [{ k: 'walk', r: 9, laps: 2, w: 3, orb: 1 }, { k: 'pods', modes: ['cannon', 'star'] }, { k: 'walk', r: 9, laps: 2, w: 3, orb: 1 }, { k: 'gears' }, { k: 'walk', r: 9, laps: 2, w: 4, orb: 1 }, { k: 'kite' }, { k: 'walk', r: 9, laps: 2, w: 4, orb: 1 }], { kind: 'comet', timer: 150, need: 38, surf: 'star', hz: 1, name: T('ぜんぶの しれん', 'The Grand Gauntlet'), desc: T('ながい すいせいレース！ ぜんぶの銀河の シャードを あつめた人だけの ちょうせん。はやいほど ランクが アップ', 'A long comet race for those who cleared every other galaxy. Faster means a better rank.'), par: 150 });
    course(b, 'g8hunt', [{ k: 'walk', r: 9, laps: 3, w: 2, lumi: 0 }, { k: 'kite' }, { k: 'walk', r: 9, laps: 3, w: 2, lumi: 1 }, { k: 'flip' }, { k: 'rail' }, { k: 'crumble', n: 5, phase: 1 }, { k: 'walk', r: 9, laps: 3, w: 2 }, { k: 'walk', r: 10, laps: 4, w: 3, lumi: 2, li: 26 }], { kind: 'hunt', surf: 'star', hz: 1, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('さいごの星ぐんの ルミを みつけよう', 'Find the last three Lumi.'), par: 170 });
    return b.d;
  }

  function g9() {
    const b = Builder('g9', T('そらとぶ しまじま', 'Sky Isles'), 'grass', { n1: [0.1, 0.35, 0.7], n2: [0.7, 0.9, 1], band: [0.3, 0.8, 0.5], sun: [0.4, 0.7, -0.5], sunc: [1, 0.97, 0.85], stars: 0.7 });
    course(b, 'g9m1', [{ k: 'walk', r: 9, laps: 3, w: 3 }, { k: 'updraft' }, { k: 'pullgap' }, { k: 'walk', r: 10, laps: 3, w: 4 }, { k: 'swing' }, { k: 'updraft' }, { k: 'kite' }, { k: 'walk', r: 10, laps: 4, w: 4 }], { surf: 'grass', hz: 0.9, name: T('うきしまの ふきあげ', 'Updraft Isles'), desc: T('風の柱に のって 空の島へ。ひっぱる星の場も わたる ながい たび', 'Ride the wind columns and pull fields across floating isles.'), par: 170 });
    course(b, 'g9m2', [{ k: 'pods' }, { k: 'pullgap' }, { k: 'dashgap' }, { k: 'bridge' }, { k: 'pullgap' }, { k: 'crumble', n: 5 }, { k: 'walk', r: 10, laps: 4, w: 4 }, { k: 'updraft' }, { k: 'walk', r: 10, laps: 3, w: 4 }], { surf: 'grass', hz: 0.9, name: T('ひっぱる ほしの みち', 'Pull-Star Road'), desc: T('ひっぱる星の場に とびこんで 向こうの足場へ。ながい みち', 'Leap into pull fields and be drawn across the gaps.'), par: 170 });
    course(b, 'g9m3', [{ k: 'updraft' }, { k: 'swing' }, { k: 'walk', r: 10, laps: 3, w: 4 }, { k: 'pullgap' }, { k: 'kite' }, { k: 'walk', r: 10, laps: 4, w: 5 }, { k: 'bridge' }, { k: 'crumble', n: 5 }, { k: 'updraft' }, { k: 'walk', r: 10, laps: 3, w: 4 }, { k: 'pods' }, { k: 'boss', r: 11, boss: { hp: 3, spd: 0.5, rs: 13, stun: 6, look: 'guard', chain: 1 } }], { surf: 'grass', hz: 0.9, kind: 'boss', name: T('ボス ストームロック', 'Boss: Storm Roc'), desc: T('つづけて 3かい ドスンと おちてくる！ ストームロックの スキを スピンで 4かい', 'The Storm Roc slams down three times in a row. Spin it 4 times when it is dazed.'), par: 230 });
    course(b, 'g9m4', [{ k: 'walk', r: 9, laps: 2, w: 2, orb: 1 }, { k: 'updraft' }, { k: 'walk', r: 9, laps: 2, w: 3, orb: 1 }, { k: 'pullgap' }, { k: 'walk', r: 8, laps: 2, w: 3, orb: 1 }], { kind: 'comet', timer: 100, surf: 'grass', hz: 0.9, name: T('そらの すいせい', 'Sky Comet'), desc: T('風にのって すいせいのかけらを あつめよう。はやいほど ランクが アップ', 'Ride the wind and collect comet orbs. Faster means a better rank.'), par: 100 });
    course(b, 'g9hunt', [{ k: 'walk', r: 9, laps: 3, w: 2, lumi: 0 }, { k: 'updraft' }, { k: 'walk', r: 9, laps: 3, w: 2, lumi: 1 }, { k: 'pullgap' }, { k: 'walk', r: 9, laps: 3, w: 2 }, { k: 'walk', r: 10, laps: 3, w: 3 }, { k: 'walk', r: 9, laps: 3, w: 3 }, { k: 'walk', r: 10, laps: 4, w: 3, lumi: 2, li: 26 }, { k: 'walk', r: 10, laps: 3, w: 3 }], { kind: 'hunt', surf: 'grass', hz: 0.9, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('空の島の ルミを みつけよう', 'Find the 3 hidden Lumi in this galaxy.'), par: 160 });
    b.d.deco = [{ dir: [-0.6, 0.15, -0.8], r: 60, col: [0.5, 0.8, 1], ring: 1 }, { dir: [0.7, 0.3, -0.6], r: 26, col: [1, 0.9, 0.6] }, { dir: [0.1, -0.5, 0.8], r: 30, col: [0.6, 0.95, 0.7] }];
    return b.d;
  }

  function g10() {
    const b = Builder('g10', T('すなの さばく', 'Dune Sea'), 'sand', { n1: [0.45, 0.25, 0.1], n2: [1, 0.75, 0.35], band: [0.6, 0.5, 0.4], sun: [0.3, 0.5, -0.8], sunc: [1, 0.85, 0.6], stars: 0.6 });
    course(b, 'g10m1', [{ k: 'roll' }, { k: 'drillgate' }, { k: 'crumble', n: 5 }, { k: 'roll' }, { k: 'hop', n: 6, surf: 'stone' }, { k: 'walk', r: 10, laps: 4, w: 5 }, { k: 'roll' }, { k: 'walk', r: 10, laps: 3, w: 4 }], { surf: 'sand', hz: 0.9, name: T('さばくの ころがり', 'Dune Roller'), desc: T('岩の力で ころがって さばくの てきを はね飛ばす ながい たび', 'Roll through the desert foes with the rock power.'), par: 170 });
    course(b, 'g10m2', [{ k: 'walk', r: 10, laps: 3, w: 4 }, { k: 'crumble', n: 5 }, { k: 'melt' }, { k: 'roll' }, { k: 'crumble', n: 5, phase: 1 }, { k: 'walk', r: 10, laps: 4, w: 5 }, { k: 'bridge' }], { surf: 'sand', hz: 0.9, name: T('ながれる すな', 'Shifting Sands'), desc: T('くずれる すなの足場と トゲの わを こえる ながい コース', 'Cross crumbling sand platforms and rings of spikes.'), par: 170 });
    course(b, 'g10m3', [{ k: 'roll' }, { k: 'crumble', n: 5 }, { k: 'walk', r: 10, laps: 3, w: 5 }, { k: 'hop', n: 6, surf: 'stone' }, { k: 'melt' }, { k: 'walk', r: 10, laps: 4, w: 5 }, { k: 'crumble', n: 5 }, { k: 'walk', r: 10, laps: 3, w: 5 }, { k: 'crumble', n: 5, phase: 1 }, { k: 'boss', r: 11, boss: { hp: 4, spd: 0.5, rs: 13, stun: 5, look: 'guard', charge: 2 } }], { surf: 'sand', hz: 0.9, kind: 'boss', name: T('ボス サンドワーム', 'Boss: Sand Worm'), desc: T('すなの下から 突進してくる！ ねらいを よく見て よけて、スキを 4かい', 'The Sand Worm charges at you. Dodge the aimed dash and hit it 4 times.'), par: 230 });
    course(b, 'g10m4', [{ k: 'walk', r: 9, laps: 2, w: 2, orb: 1 }, { k: 'roll' }, { k: 'walk', r: 9, laps: 2, w: 3, orb: 1 }, { k: 'crumble', n: 5 }, { k: 'walk', r: 8, laps: 2, w: 3, orb: 1 }], { kind: 'comet', timer: 100, surf: 'sand', hz: 0.9, name: T('さばくの すいせい', 'Desert Comet'), desc: T('さばくを かけぬけて すいせいのかけらを あつめよう。はやいほど ランクが アップ', 'Dash across the desert collecting comet orbs. Faster means a better rank.'), par: 100 });
    course(b, 'g10hunt', [{ k: 'walk', r: 9, laps: 3, w: 2, lumi: 0 }, { k: 'crumble', n: 5 }, { k: 'walk', r: 9, laps: 3, w: 2, lumi: 1 }, { k: 'roll' }, { k: 'walk', r: 9, laps: 3, w: 2 }, { k: 'walk', r: 10, laps: 3, w: 3 }, { k: 'walk', r: 9, laps: 3, w: 3 }, { k: 'walk', r: 10, laps: 4, w: 3, lumi: 2, li: 26 }, { k: 'walk', r: 10, laps: 3, w: 3 }], { kind: 'hunt', surf: 'sand', hz: 0.9, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('さばくの ルミを みつけよう', 'Find the 3 hidden Lumi in this galaxy.'), par: 160 });
    b.d.deco = [{ dir: [0.5, 0.2, -0.8], r: 70, col: [1, 0.7, 0.35], ring: 0 }, { dir: [-0.8, 0.3, -0.4], r: 22, col: [0.9, 0.6, 0.4], ring: 1 }, { dir: [0.0, -0.4, 0.9], r: 28, col: [0.95, 0.85, 0.5] }];
    return b.d;
  }

  function g11() {
    const b = Builder('g11', T('きらきら すいしょうの どうくつ', 'Crystal Cavern'), 'ice', { n1: [0.25, 0.1, 0.45], n2: [0.4, 0.9, 0.9], band: [0.5, 0.4, 0.7], sun: [-0.3, 0.5, -0.7], sunc: [0.7, 0.8, 1], stars: 1, dark: 1, aur: [0.6, 0.4, 1] });
    course(b, 'g11m1', [{ k: 'flip' }, { k: 'dashgap' }, { k: 'flip' }, { k: 'pullgap' }, { k: 'bridge' }, { k: 'walk', r: 10, laps: 4, w: 5 }, { k: 'flip' }, { k: 'walk', r: 10, laps: 4, w: 5 }, { k: 'bridge' }], { surf: 'crystal', hz: 2.0, name: T('どうくつの さかさま', 'Upside-Down Cavern'), desc: T('重力が さかさまになる ゾーンと ひっぱる場の ながい どうくつ', 'A long cavern of gravity-flip zones and pull fields.'), par: 170 });
    course(b, 'g11m2', [{ k: 'lamp', n: 5, w: 4 }, { k: 'bridge' }, { k: 'pullgap' }, { k: 'lamp', n: 5, w: 4 }, { k: 'rail' }, { k: 'flip' }, { k: 'jellytower' }, { k: 'walk', r: 10, laps: 4, w: 5 }, { k: 'pullgap' }, { k: 'lamp', n: 5, w: 4 }], { surf: 'crystal', hz: 2.0, name: T('きらめく ちょうちん', 'Glittering Lanterns'), desc: T('くらい どうくつで ちょうちんを ともして すすむ ながい たび', 'Light lanterns through the dark crystal cave.'), par: 170 });
    course(b, 'g11m3', [{ k: 'flip' }, { k: 'bridge' }, { k: 'lamp', n: 5, w: 4 }, { k: 'pullgap' }, { k: 'crumble', n: 5, phase: 1 }, { k: 'walk', r: 10, laps: 4, w: 5 }, { k: 'rail' }, { k: 'flip' }, { k: 'walk', r: 10, laps: 4, w: 5 }, { k: 'boss', r: 11, boss: { hp: 5, spd: 0.5, rs: 12, dblAt: 3, triAt: 2, stun: 5.2, look: 'king', charge: 1 } }], { surf: 'crystal', hz: 1, kind: 'boss', name: T('ボス クリスタルゴーレム', 'Boss: Crystal Golem'), desc: T('衝撃波が だんだん ふえて、突進もしてくる！ スキを スピンで 5かい', 'Shockwaves multiply and it charges too. Spin it 5 times when it is dazed.'), par: 240 });
    course(b, 'g11m4', [{ k: 'walk', r: 9, laps: 2, w: 2, orb: 1 }, { k: 'flip' }, { k: 'walk', r: 9, laps: 2, w: 3, orb: 1 }, { k: 'pullgap' }, { k: 'walk', r: 8, laps: 2, w: 3, orb: 1 }], { kind: 'comet', timer: 100, surf: 'crystal', hz: 1, name: T('どうくつの すいせい', 'Cavern Comet'), desc: T('さかさまの どうくつで すいせいのかけらを あつめよう。はやいほど ランクが アップ', 'Collect comet orbs in the upside-down cavern. Faster means a better rank.'), par: 100 });
    course(b, 'g11hunt', [{ k: 'walk', r: 9, laps: 3, w: 2, lumi: 0 }, { k: 'flip' }, { k: 'walk', r: 9, laps: 3, w: 2, lumi: 1 }, { k: 'pullgap' }, { k: 'walk', r: 9, laps: 3, w: 2 }, { k: 'walk', r: 10, laps: 3, w: 3 }, { k: 'walk', r: 9, laps: 3, w: 3 }, { k: 'walk', r: 10, laps: 4, w: 3, lumi: 2, li: 26 }, { k: 'walk', r: 10, laps: 3, w: 3 }], { kind: 'hunt', surf: 'crystal', hz: 1, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('どうくつの ルミを みつけよう', 'Find the 3 hidden Lumi in this galaxy.'), par: 160 });
    b.d.deco = [{ dir: [-0.5, 0.3, -0.8], r: 55, col: [0.55, 0.85, 1], ring: 1 }, { dir: [0.7, 0.2, -0.5], r: 20, col: [0.8, 0.6, 1] }, { dir: [0.0, 0.7, 0.6], r: 26, col: [0.5, 1, 0.85] }];
    return b.d;
  }

  function g12() {
    const b = Builder('g12', T('ふかい うみの みぞ', 'Deep Trench'), 'ocean', { n1: [0.02, 0.12, 0.35], n2: [0.15, 0.6, 0.8], band: [0.6, 0.6, 0.3], sun: [0.2, 0.8, -0.5], sunc: [0.7, 0.95, 1], stars: 0.8, dark: 1, lens: [-0.7, 0.3, 0.65, 0.2] });
    course(b, 'g12m1', [{ k: 'swing' }, { k: 'jellytower' }, { k: 'updraft' }, { k: 'pods', modes: ['pipe', 'pipe'] }, { k: 'swing' }, { k: 'crumble', n: 5, phase: 1 }, { k: 'walk', r: 10, laps: 4, w: 5 }, { k: 'bridge' }], { surf: 'water', hz: 5, name: T('うずまく みぞ', 'Whirling Trench'), desc: T('ゆれる月と ふきあげで ふかい うみの みぞを すすむ ながい たび', 'Swinging moons and updrafts in a deep ocean trench.'), par: 170 });
    course(b, 'g12m2', [{ k: 'pods', modes: ['pipe', 'pipe'] }, { k: 'bridge' }, { k: 'swing' }, { k: 'updraft' }, { k: 'pullgap' }, { k: 'crumble', n: 5, phase: 1 }, { k: 'drillgate' }, { k: 'rail' }, { k: 'walk', r: 10, laps: 4, w: 5 }, { k: 'swing' }], { surf: 'water', hz: 5, name: T('ふかい あわの みち', 'Deep Bubble Road'), desc: T('パイプと ひっぱる場で あわの みちを めぐる ながい コース', 'Pipes and pull fields along a long bubble road.'), par: 170 });
    course(b, 'g12m3', [{ k: 'swing' }, { k: 'updraft' }, { k: 'pods', modes: ['pipe', 'pipe'] }, { k: 'bridge' }, { k: 'walk', r: 10, laps: 3, w: 5 }, { k: 'pullgap' }, { k: 'walk', r: 10, laps: 4, w: 5 }, { k: 'crumble', n: 5, phase: 1 }, { k: 'updraft' }, { k: 'boss', r: 12, boss: { hp: 4, spd: 0.5, rs: 12, dblAt: 3, triAt: 2, stun: 6, look: 'king' } }], { surf: 'water', hz: 5, kind: 'boss', name: T('ボス リヴァイアサン', 'Boss: Leviathan'), desc: T('つづけて ドスンが 4かい！ 衝撃波も 2つ。スキを スピンで 5かい', 'It slams four times in a row with double shockwaves. Spin it 5 times when it is dazed.'), par: 250 });
    course(b, 'g12m4', [{ k: 'walk', r: 9, laps: 2, w: 2, orb: 1 }, { k: 'swing' }, { k: 'walk', r: 9, laps: 2, w: 3, orb: 1 }, { k: 'updraft' }, { k: 'walk', r: 8, laps: 2, w: 3, orb: 1 }], { kind: 'comet', timer: 100, surf: 'water', hz: 5, name: T('うみの すいせい', 'Trench Comet'), desc: T('ふかい うみで すいせいのかけらを あつめよう。はやいほど ランクが アップ', 'Collect comet orbs in the deep sea. Faster means a better rank.'), par: 100 });
    course(b, 'g12hunt', [{ k: 'walk', r: 9, laps: 3, w: 2, lumi: 0 }, { k: 'swing' }, { k: 'walk', r: 9, laps: 3, w: 2, lumi: 1 }, { k: 'updraft' }, { k: 'walk', r: 9, laps: 3, w: 2 }, { k: 'walk', r: 10, laps: 3, w: 3 }, { k: 'walk', r: 9, laps: 3, w: 3 }, { k: 'walk', r: 10, laps: 4, w: 3, lumi: 2, li: 26 }, { k: 'walk', r: 10, laps: 3, w: 3 }], { kind: 'hunt', surf: 'water', hz: 5, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('ふかい うみの ルミを みつけよう', 'Find the 3 hidden Lumi in this galaxy.'), par: 160 });
    b.d.deco = [{ dir: [-0.4, 0.3, -0.85], r: 62, col: [0.3, 0.75, 0.95], ring: 0 }, { dir: [0.8, 0.4, -0.4], r: 22, col: [0.6, 1, 0.9], ring: 1 }, { dir: [0.0, -0.5, 0.85], r: 30, col: [0.4, 0.5, 1] }];
    return b.d;
  }

  const GALAXIES = [
    { id: 'g1', build: g1, need: 0, theme: 'grass', col: '#7fdc79', icon: 'ポ' },
    { id: 'g2', build: g2, need: 3, theme: 'ice', col: '#8fd8ff', icon: 'ひ' },
    { id: 'g3', build: g3, need: 6, theme: 'lava', col: '#ff8a4a', icon: 'ぐ' },
    { id: 'g4', build: g4, need: 8, theme: 'candy', col: '#ff9ad0', icon: 'あ' },
    { id: 'g5', build: g5, need: 12, theme: 'ocean', col: '#6fe3ff', icon: 'ぷ' },
    { id: 'g6', build: g6, need: 16, theme: 'ruins', col: '#e0b860', icon: 'ぜ' },
    { id: 'g7', build: g7, need: 18, theme: 'dusk', col: '#b48cf0', icon: 'お' },
    { id: 'g8', build: g8, need: 22, theme: 'star', col: '#ffd24a', icon: 'ほ' },
    { id: 'g9', build: g9, need: 24, theme: 'grass', col: '#8fe0ff', icon: 'そ' },
    { id: 'g10', build: g10, need: 29, theme: 'sand', col: '#ffc060', icon: 'す' },
    { id: 'g11', build: g11, need: 33, theme: 'ice', col: '#c8a0ff', icon: 'き' },
    { id: 'g12', build: g12, need: 37, theme: 'ocean', col: '#5fc0ff', icon: 'ふ' },
  ];
  const cache = {};
  function def(id) { if (!cache[id]) cache[id] = applyPar(id === 'hub' ? hub() : GALAXIES.find(g => g.id === id).build()); return cache[id]; }
  function compile(E, id) { const k = 'c:' + id; if (!cache[k]) cache[k] = E.compile(def(id)); return cache[k]; }
  // ボットの記録からつくる、ミッションごとの「さいたん時間」（tools/galaxy-proofs.js が par.js に書く）。せいげん時間はこれより短くならない
  const PAR = (typeof GalaxyPar !== 'undefined' ? GalaxyPar : (typeof require !== 'undefined' ? (() => { try { return require('./par.js'); } catch (e) { return {}; } })() : {}));
  const TIER = { hub: 0, g1: 1, g2: 1, g3: 1, g4: 2, g5: 2, g6: 2, g7: 3, g8: 3, g9: 2, g10: 2, g11: 3, g12: 3 };
  function applyPar(d) { for (const m of d.missions) m.dif = TIER[d.id] == null ? 3 : TIER[d.id]; (d.deco || []).forEach((x, i) => { if (i === 0 && !x.big) { x.r *= 2.4; x.big = 1; } }); return d; }
  const G = { GALAXIES, def, compile, ids: ['hub'].concat(GALAXIES.map(g => g.id)), dir, total: () => GALAXIES.reduce((n, g) => n + def(g.id).missions.filter(m => m.kind !== 'hunt').length, 0) };
  if (typeof module !== 'undefined' && module.exports) module.exports = G; else root.GalaxyLevels = G;
})(typeof window !== 'undefined' ? window : globalThis);
