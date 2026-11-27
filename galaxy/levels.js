// ぐるぐる星わたり：銀河（ステージ）のデータ。window.GalaxyLevels（node でも使える）
// 体（bodies）・重力ゾーン・もの（ents）・ミッション（missions）を、角度（緯度・経度）で書けるように小さな道具でならべる。
// ミッションの route は、ボット（bot.js）が「本物のエンジンに入力だけを送って」ぜんぶクリアできることを確かめるための道すじ。
(function (root) {
  'use strict';
  const D = Math.PI / 180;
  // 緯度・経度（度）→ 単位ベクトル（y が北）
  const dir = (lat, lon) => [Math.cos(lat * D) * Math.sin(lon * D), Math.sin(lat * D), Math.cos(lat * D) * Math.cos(lon * D)];
  const sub = (a, b) => [a[0] - b[0], a[1] - b[1], a[2] - b[2]];
  const nrm = a => { const l = Math.hypot(a[0], a[1], a[2]) || 1; return [a[0] / l, a[1] / l, a[2] / l]; };
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
  function ringAround(b, bid, dv, rad, n, h) { const d = nrm(dv), t0 = nrm(cr3(d, Math.abs(d[1]) < 0.9 ? [0, 1, 0] : [1, 0, 0])), t1 = cr3(d, t0), R = b.B[bid].r; const o = []; for (let i = 0; i < n; i++) { const a = i / n * Math.PI * 2, k = rad / R; o.push(b.at(bid, [d[0] + (t0[0] * Math.cos(a) + t1[0] * Math.sin(a)) * k, d[1] + (t0[1] * Math.cos(a) + t1[1] * Math.sin(a)) * k, d[2] + (t0[2] * Math.cos(a) + t1[2] * Math.sin(a)) * k], h)); } return o; }

  // ================== ほしみ台（ハブ） ==================
  function hub() {
    const b = Builder('hub', T('ほしみ台', 'Stargazer Deck'), 'hub', { n1: [0.1, 0.14, 0.45], n2: [0.6, 0.3, 0.7], band: [0.3, 0.9, 0.3], sun: [0.5, 0.55, -0.65], sunc: [1, 0.9, 0.7], stars: 1 });
    b.sph('deck', [0, 0, 0], 9, { surf: 'metal' });
    b.sph('moon', [0, 0, 0], 2, { surf: 'stone', mv: [{ t: 'orbit', c: [0, 0, 0], a: [0.3, 1, 0.1], T: 24 }], g: 1 }); b.d.bodies[1].p = [17, 3, 0]; b.d.bodies[1].mv[0].c = [0, 0, 0];
    ['g1', 'g2', 'g3', 'g4', 'g5', 'g6', 'g7', 'g8'].forEach((g, i) => b.ent('gate', 'deck', b.ll('deck', i % 2 ? 4 : 28, i * 45, 0.9), { id: 'gate' + (i + 1), gal: g }));
    for (let i = 0; i < 6; i++) b.ent('coin', 'deck', b.ll('deck', -20 + (i % 3) * 8, 60 + i * 20, 1), {});
    b.ent('coin', 'moon', b.at('moon', [0, 1, 0], 1), {}); b.ent('crystal', 'moon', b.at('moon', [1, 0, 0], 1), {});
    b.ent('crate', 'deck', b.ll('deck', 62, 40, 0.7), { id: 'hc1', drop: 'heart' });
    b.mission({ id: 'free', name: T('ほしみ台', 'Stargazer Deck'), start: { b: 'deck', l: b.ll('deck', 40, 180, 0.5), fw: [0, 0, 1] }, free: 1 });
    b.d.deco = [{ dir: [-0.6, 0.35, -0.7], r: 38, col: [0.95, 0.65, 0.35], ring: 1 }, { dir: [0.7, 0.2, 0.6], r: 24, col: [0.4, 0.7, 0.95] }, { dir: [0.1, 0.8, -0.5], r: 12, col: [0.9, 0.5, 0.7] }];
    return b.d;
  }

  // ================== 1. みどりのポコ星ぐん ==================
  function g1() {
    const b = Builder('g1', T('みどりのポコ星ぐん', 'Meadow Orbit'), 'grass', { n1: [0.08, 0.3, 0.5], n2: [0.45, 0.65, 0.3], band: [0.2, 0.9, 0.4], sun: [0.6, 0.5, -0.5], sunc: [1, 0.95, 0.8], stars: 1 });
    b.sph('home', [0, 0, 0], 7, { surf: 'grass' });
    b.sph('p2', [20, 6, 0], 4.5, { surf: 'moss' });
    b.sph('p3', [34, -2, 12], 3.5, { surf: 'grass' });
    for (let i = 0; i < 4; i++) b.sph('mo' + (i + 1), [-24, 0, -8 * i], 2.4, { surf: 'grass' });
    const U = [0, 1, 0];
    // --- ミッション1：はじめの ひとまわり
    const m1 = ['g1m1']; const E1 = (k, ll, o) => b.ent(k, 'home', b.ll('home', ll[0], ll[1], ll[2] == null ? 1 : ll[2]), Object.assign({ m: m1 }, o || {}));
    E1('coin', [40, 20], { id: 'a1' }); E1('coin', [18, 20], { id: 'a2' }); E1('coin', [-12, 20], { id: 'a3' }); E1('coin', [-34, 20], { id: 'a4' }); E1('crystal', [-50, 20], { id: 'a5' });
    b.ent('walker', 'home', b.ll('home', 0, 20, 0.6), { m: m1, id: 'w1', l0: b.ll('home', 0, 20, 0.6), ax: [0, 1, 0], w: 0.55, ph: 0 });
    E1('shard', [-64, 20], { id: 's1', }); b.d.ents[b.d.ents.length - 1].id = 's1';
    b.mission({ id: 'g1m1', name: T('はじめの ひとまわり', 'Around the Planet'), desc: T('ちいさな星を ぐるっと ひとまわり。うらがわの スターシャードを とろう', 'Run around the little planet and grab the Star Shard on the far side.'), start: { b: 'home', l: b.ll('home', 68, 20, 0.5), fw: [0, 0, 1] }, shard: 's1', route: ['a1', 'a2', 'a3', 'a4', 'a5', 's1'], par: 40 });
    // --- ミッション2：ふわふわ ほしわたり（発射スターで となりの星へ）
    const m2 = ['g1m2'];
    const lPos = b.ll('home', 16.7, 90, 0.9);
    b.ent('launch', 'home', lPos, { m: m2, id: 'L1', mode: 'star', T: 1.3, arc: 6, to: { b: 'p2', l: b.at('p2', b.to('p2', 'home'), 2.4) } });
    b.ent('coin', 'p2', b.at('p2', b.to('p2', 'home'), 1.2), { m: m2, id: 'b1' });
    const l2 = b.at('p2', b.to('p2', 'p3'), 0.9);
    b.ent('walker', 'p2', b.at('p2', [0.2, 1, 0.2], 0.6), { m: m2, id: 'w2', l0: b.at('p2', [0.2, 1, 0.2], 0.6), ax: [0, 0, 1], w: 0.8, ph: 1 });
    b.ent('launch', 'p2', l2, { m: m2, id: 'L2', mode: 'star', T: 1.3, arc: 6, to: { b: 'p3', l: b.at('p3', b.to('p3', 'p2'), 2.4) } });
    b.ent('coin', 'p3', b.at('p3', [0, 1, 0], 1.0), { m: m2, id: 'b2' });
    b.ent('crystal', 'p3', b.at('p3', [0.5, 1, 0], 1.0), { m: m2, id: 'b3' });
    b.ent('shard', 'p3', b.at('p3', b.to('p3', 'home'), 1.0).map((v, i) => v + [0, 0.0, 0][i]), { m: m2, id: 's2' });
    b.d.ents[b.d.ents.length - 1].l = b.at('p3', [0.1, 0.9, -0.2], 1.0);
    b.mission({ id: 'g1m2', name: T('ふわふわ ほしわたり', 'Launch Star Hop'), desc: T('はっしゃスターに のって となりの星へ。2回とんで スターシャードへ', 'Ride the launch stars from planet to planet and reach the Star Shard.'), start: { b: 'home', l: b.ll('home', 5, 50, 0.5), fw: [0, 0, 1] }, shard: 's2', route: [{ to: 'L1', launch: 1 }, 'b1', { to: 'L2', launch: 1 }, 'b2', 's2'], par: 30 });
    // --- ミッション3：ちいさなお月さま ぴょんぴょん
    const m3 = ['g1m3'];
    for (let i = 0; i < 3; i++) {
      const c = 'mo' + (i + 2);
      b.ent('coin', c, b.at(c, [0, 0, 1], 1.0), { m: m3, id: 'h' + (i + 1) });
      b.ent('coin', c, b.at(c, [0, 1, 0], 1.0), { m: m3, id: 't' + (i + 1) });
    }
    b.ent('shard', 'mo4', b.at('mo4', [0, 1, 0], 1.0), { m: m3, id: 's3' });
    b.mission({ id: 'g1m3', name: T('ちいさなお月さま ぴょんぴょん', 'Tiny Moon Hops'), desc: T('ちいさな 4つのお月さまを ジャンプで わたろう。星の よこから とぶのが コツ', 'Hop across four tiny moons. Jump from the side that faces the next moon.'), start: { b: 'mo1', l: b.at('mo1', U, 0.5), fw: [0, 0, -1] }, shard: 's3',
      pts: { f1: { b: 'mo1', l: [0, 0, -2.95] }, g2: { b: 'mo2', l: [0, 0, -2.95] }, g3: { b: 'mo3', l: [0, 0, -2.95] } },
      route: [{ to: 'f1', tol: 0.7 }, { to: 'h1', j: 3.2, land: 1 }, { to: 'g2', tol: 0.7 }, { to: 'h2', j: 3.2, land: 1 }, { to: 'g3', tol: 0.7 }, { to: 'h3', j: 3.2, land: 1 }, 's3'], par: 40 });
    // --- ミッション4：みどりの すいせい（タイムアタック）
    const m4 = ['g1m4'];
    [[-25, 100], [-25, 150], [-25, 200], [-25, 250], [-25, 300], [-25, 350]].forEach((c, i) => b.ent('orb', 'home', b.ll('home', c[0], c[1], 1.0), { m: m4, id: 'o' + (i + 1) }));
    b.ent('launch', 'home', lPos, { m: m4, id: 'L1c', mode: 'star', T: 1.0, arc: 5, to: { b: 'p2', l: b.at('p2', b.to('p2', 'home'), 2.4) } });
    b.ent('shard', 'p2', b.at('p2', b.to('p2', 'home'), 1.0), { m: m4, id: 's4', req: 'orbs' });
    b.mission({ id: 'g1m4', name: T('みどりの すいせい', 'Meadow Comet'), kind: 'comet', desc: T('せいげん時間の なかで、6つの すいせいのかけらを あつめて、となりの星へ！', 'Collect all 6 comet orbs and reach the next planet before time runs out!'), timer: 32, start: { b: 'home', l: b.ll('home', -25, 50, 0.5), fw: [0, 0, 1] }, shard: 's4', route: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', { to: 'L1c', launch: 1 }, 's4'], par: 30 });
    // かくれルミ3つを さがす（ハブからの いきさき：はっしゃスターで3つの星）
    b.d.ents.forEach(e => { if (e.id === 'L1' || e.id === 'L2') e.m = e.m.concat('g1hunt'); });
    b.ent('lumi', 'home', b.ll('home', -50, 200, 1.2), { id: 'lu1', n2: 0 }); b.ent('lumi', 'p2', b.at('p2', [0.2, -1, 0.3], 1.2), { id: 'lu2', n2: 1 }); b.ent('lumi', 'p3', b.at('p3', [0.5, 1, 0.3], 1.3), { id: 'lu3', n2: 2 });
    b.mission({ id: 'g1hunt', kind: 'hunt', lumi: 3, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('3つの星に かくれている ルミを3ひき みつけよう', 'Find the 3 hidden Lumi on the three planets.'), start: { b: 'home', l: b.ll('home', 20, 30, 0.5), fw: [0, 0, 1] }, route: ['lu1', { to: 'L1', launch: 1 }, 'lu2', { to: 'L2', launch: 1 }, 'lu3'], par: 40 });
    // かんばん・すべての ミッションにある もの
    b.ent('cp', 'home', b.ll('home', -20, 250, 0.2), { id: 'cp1' });
    b.ent('crate', 'home', b.ll('home', 30, 200, 0.7), { id: 'c1', drop: 'coin' });
    b.d.deco = [{ dir: [-0.5, 0.3, -0.8], r: 40, col: [0.55, 0.8, 0.45], ring: 0 }, { dir: [0.7, 0.4, -0.5], r: 18, col: [0.95, 0.75, 0.4], ring: 1 }, { dir: [0.2, -0.3, 0.9], r: 26, col: [0.5, 0.65, 0.95] }];
    return b.d;
  }

  // ================== 2. こおりのひんやり星ぐん ==================
  function g2() {
    const b = Builder('g2', T('こおりの ひんやり星ぐん', 'Frost Drift'), 'ice', { n1: [0.06, 0.22, 0.55], n2: [0.55, 0.85, 0.95], band: [0.7, 0.6, 0.2], sun: [-0.5, 0.45, -0.7], sunc: [0.85, 0.95, 1], stars: 1 });
    b.sph('ice1', [0, 0, 0], 9, { surf: 'ice' });
    b.box('slab', [40, 0, 0], [10, 1.5, 10], { rr: 1, surf: 'stone' });
    b.box('ceil', [40, 18, 0], [8, 1, 8], { rr: 0.8, surf: 'stone' });
    b.zone({ s: 'box', c: [40, 10.5, 0], h: [7.5, 7.5, 7.5], m: 'dir', dir: [0, 1, 0] });
    b.sph('ice2', [-30, 10, 12], 6, { surf: 'ice', ring: 1 });
    b.sph('ice3', [-48, -2, -8], 4.5, { surf: 'stone' });
    // --- ミッション1：つるつる スケート
    const m1 = ['g2m1'];
    const E1 = (k, ll, o) => b.ent(k, 'ice1', b.ll('ice1', ll[0], ll[1], ll[2] == null ? 1 : ll[2]), Object.assign({ m: m1 }, o || {}));
    E1('coin', [40, 30], { id: 'a1' }); E1('coin', [15, 30], { id: 'a2' }); E1('coin', [-10, 30], { id: 'a3' }); E1('coin', [-35, 30], { id: 'a4' });
    b.ent('spike', 'ice1', b.ll('ice1', 0, 40, 0.5), { m: m1, id: 'sp1' }); b.ent('spike', 'ice1', b.ll('ice1', -22, 22, 0.5), { m: m1, id: 'sp2' });
    E1('shard', [-58, 30], { id: 's1' });
    b.mission({ id: 'g2m1', name: T('つるつる スケート', 'Slippery Skate'), desc: T('すべる こおりの星。ブレーキは むずかしい！ トゲに ぶつからずに うらがわへ', 'A very slippery planet. Steer around the ice spikes to the shard on the far side.'), start: { b: 'ice1', l: b.ll('ice1', 66, 30, 0.5), fw: [0, 0, 1] }, shard: 's1', route: ['a1', 'a2', 'a3', 'a4', 's1'], par: 40 });
    // --- ミッション2：さかさま ステーション
    const m2 = ['g2m2'];
    b.ent('coin', 'slab', [-4, 2.5, 4], { m: m2, id: 'c1' }); b.ent('coin', 'slab', [0, 2.5, 0], { m: m2, id: 'c2' });
    b.ent('crystal', 'ceil', [3, -2.2, 3], { m: m2, id: 'c3' });
    b.ent('shard', 'ceil', [0, -2.0, -3], { m: m2, id: 's2' });
    b.mission({ id: 'g2m2', name: T('さかさま ステーション', 'Upside-Down Station'), desc: T('ジャンプして 光のゾーンに入ると、重力が さかさまに！ 天井の うらがわを あるこう', 'Jump into the glowing zone: gravity flips and you fall up to the ceiling!'), start: { b: 'slab', l: [-6, 2.0, 6], fw: [1, 0, 0] }, shard: 's2', pts: { jp: { b: 'slab', l: [0, 2.0, 0] } }, route: ['c1', { to: 'jp', tol: 0.8 }, { to: 'c3', j: 99, once: 1 }, 's2'], par: 25 });
    // --- ミッション3：こおりの たび（大砲とパイプ）
    const m3 = ['g2m3'];
    b.ent('launch', 'ice1', b.ll('ice1', 12, 290, 0.9), { m: m3, id: 'C1', mode: 'cannon', T: 1.9, arc: 8, to: { b: 'ice2', l: b.at('ice2', b.to('ice2', 'ice1'), 2.6) } });
    b.ent('coin', 'ice2', b.at('ice2', b.to('ice2', 'ice1'), 1.2), { m: m3, id: 'd1' });
    b.ent('launch', 'ice2', b.at('ice2', b.to('ice2', 'ice3'), 0.9), { m: m3, id: 'P1', mode: 'pipe', T: 1.4, arc: 3, to: { b: 'ice3', l: b.at('ice3', b.to('ice3', 'ice2'), 2.6) } });
    b.ent('crystal', 'ice3', b.at('ice3', b.to('ice3', 'ice2'), 1.2), { m: m3, id: 'd2' });
    b.ent('shard', 'ice3', b.at('ice3', [0, 1, 0.3], 1.0), { m: m3, id: 's3' });
    b.ent('crate', 'ice2', b.at('ice2', [0.3, 1, 0.1], 0.7), { m: m3, id: 'cr1', drop: 'cloud' });
    b.mission({ id: 'g2m3', name: T('こおりの たび', 'Cannon & Pipe'), desc: T('大砲で となりの星へ、パイプで さらに先へ。こおりの星の いちばん奥に スターシャード', 'Blast off from a cannon, take the pipe, and find the shard on the farthest ice world.'), start: { b: 'ice1', l: b.ll('ice1', 12, 250, 0.5), fw: [0, 0, 1] }, shard: 's3', route: [{ to: 'C1', launch: 1 }, 'd1', { to: 'P1', launch: 1 }, 'd2', 's3'], par: 30 });
    b.d.ents.forEach(e => { if (e.id === 'C1' || e.id === 'P1') e.m = e.m.concat('g2hunt'); });
    b.ent('lumi', 'ice1', b.ll('ice1', -20, 100, 1.2), { id: 'lu1', n2: 0 }); b.ent('lumi', 'ice3', b.at('ice3', [-0.4, 0.5, 1], 1.2), { id: 'lu3', n2: 2 });
    b.mission({ id: 'g2hunt', kind: 'hunt', lumi: 3, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('こおりの3つの星に かくれた ルミを みつけよう', 'Find the Lumi hiding on the three ice worlds.'), start: { b: 'ice1', l: b.ll('ice1', 12, 250, 0.5), fw: [0, 0, 1] }, route: ['lu1', { to: 'C1', launch: 1 }, 'lu2', { to: 'P1', launch: 1 }, 'lu3'], par: 40 });
    b.ent('cp', 'ice1', b.ll('ice1', -30, 180, 0.2), { id: 'cp1' });
    b.ent('lumi', 'ice2', b.at('ice2', [0.8, 0.3, 0.5], 1.2), { id: 'lu2', n2: 1 });
    b.d.deco = [{ dir: [-0.4, 0.3, -0.85], r: 46, col: [0.65, 0.85, 0.98], ring: 1 }, { dir: [0.8, 0.3, 0.45], r: 16, col: [0.9, 0.95, 1] }, { dir: [0.0, 0.9, 0.4], r: 22, col: [0.55, 0.7, 0.95] }];
    return b.d;
  }

  // ================== 3. ようがんぐつぐつ星ぐん（ボスつき） ==================
  function g3() {
    const b = Builder('g3', T('ようがん ぐつぐつ星ぐん', 'Magma Simmer'), 'lava', { n1: [0.4, 0.08, 0.08], n2: [0.95, 0.4, 0.1], band: [0.5, 0.7, 0.5], sun: [0.3, 0.6, -0.7], sunc: [1, 0.7, 0.5], stars: 0.8 });
    b.sph('core', [0, 0, 0], 6, { surf: 'lava', g: 0.5, gr: 7 });
    const N = 8, RR = 11.8;
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2, c = [RR * Math.cos(a), RR * Math.sin(a), 0]; b.box('st' + i, c, [2.4, 0.8, 2.4], { rot: [0, 0, a - Math.PI / 2], rr: 0.5, surf: 'stone', gr: 8 }); }
    b.sph('ra', [70, 0, 0], 5, { surf: 'stone' });
    b.sph('rb', [89.5, 0, 0], 5.5, { surf: 'stone' });
    b.sph('arena', [0, 0, 80], 10, { surf: 'stone' });
    // --- ミッション1：ようがんの ぐるぐる
    const m1 = ['g3m1'];
    const top = i => { const a = i / N * Math.PI * 2; return [RR * Math.cos(a), RR * Math.sin(a), 0].map((v, k) => v + [Math.cos(a), Math.sin(a), 0][k] * 1.8); };
    const edge = (i, s) => { const a = i / N * Math.PI * 2, rad = [Math.cos(a), Math.sin(a), 0], tg = [-Math.sin(a), Math.cos(a), 0]; return [0, 1, 2].map(k => (RR + 1.8) * rad[k] + tg[k] * s); };
    // 石の上（ローカル）：箱の軸は (x:接線, y:外向き, z:奥) に回してある
    for (let i = 1; i <= 4; i++) { b.ent('coin', 'st' + i, [0, 1.8, 0], { m: m1, id: 'k' + i }); }
    b.ent('crystal', 'st5', [0, 1.8, 0], { m: m1, id: 'k5' });
    b.ent('shard', 'st6', [0, 1.8, 0], { m: m1, id: 's1' });
    b.ent('cp', 'st3', [0, 1.1, 1.2], { m: m1, id: 'cp1' });
    b.mission({ id: 'g3m1', name: T('ようがんの ぐるぐる', 'Stepping Stones'), desc: T('マグマの星のまわりの 石から石へ ジャンプ！ おちると あっちっち', 'Hop from stone to stone around the lava planet. Don\'t touch the lava!'), start: { b: 'st0', l: [0, 1.0, 0], fw: [0, 1, 0] }, shard: 's1',
      pts: {}, route: [{ to: 'k1', j: 8.4, land: 1 }, { to: 'k2', j: 8.4, land: 1 }, { to: 'k3', j: 8.4, land: 1 }, { to: 'k4', j: 8.4, land: 1 }, { to: 'k5', j: 8.4, land: 1 }, { to: 's1', j: 8.4 }], par: 40 });
    // --- ミッション2：ふわふわ ハチのたび
    const m2 = ['g3m2'];
    b.ent('crate', 'ra', b.at('ra', [1, 0.12, 0], 0.7), { m: m2, id: 'bx', drop: 'bee' });
    b.ent('coin', 'ra', b.at('ra', [0, 1, 0], 1.0), { m: m2, id: 'e1' });
    b.ent('coin', null, [79.6, 0.4, 0], { m: m2, id: 'e2' });
    b.ent('shard', 'rb', b.at('rb', [-1, 0.05, 0], 1.0), { m: m2, id: 's2' });
    b.mission({ id: 'g3m2', name: T('ふわふわ ハチのたび', 'Bee Flight'), desc: T('ハチの箱を スピンでわって、ジャンプボタンを おしっぱなしで ふわふわ とんでいこう', 'Spin the bee crate open, then hold jump to hover across the gap.'), start: { b: 'ra', l: b.at('ra', [0, 1, 0], 0.5), fw: [1, 0, 0] }, shard: 's2', route: ['e1', 'bx', { fly: 'e2' }, { fly: 's2' }], par: 25 });
    // --- ミッション3：ボス グツグツおうさま
    const m3 = ['g3m3'];
    b.ent('boss', 'arena', b.at('arena', [0, 1, 0], 0), { m: m3, id: 'boss', hp: 3, rad: 1.7 });
    b.ent('shard', 'arena', b.at('arena', [0.2, 1, 0.1], 1.0), { m: m3, id: 's3', req: 'boss' });
    b.ent('heart', 'arena', b.at('arena', [-1, 0.2, 0.4], 1.0), { m: m3, id: 'hh1' });
    b.mission({ id: 'g3m3', name: T('ボス グツグツおうさま', 'Boss: King Simmer'), kind: 'boss', desc: T('おうさまが ドスンと おちたら スキだらけ！ スピンか ふみつけで 3かい あてよう', 'When the king slams down he is dazed: hit him 3 times with a spin or stomp!'), start: { b: 'arena', l: b.at('arena', [0, -0.5, 0.9], 0.5), fw: [0, 0, 1] }, shard: 's3', route: [{ boss: 1 }, 's3'], par: 90 });
    b.ent('lumi', 'st2', [0, 1.8, 0], { id: 'lu1', n2: 0 }); b.ent('lumi', 'st4', [0, 1.8, 0], { id: 'lu2', n2: 1 }); b.ent('lumi', 'st6', [0, 1.8, 0], { id: 'lu3', n2: 2 });
    [1, 3, 5].forEach(i => b.ent('coin', 'st' + i, [0, 1.8, 0], { m: ['g3hunt'], id: 'hc' + i }));
    b.mission({ id: 'g3hunt', kind: 'hunt', lumi: 3, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('マグマの石の上に かくれた ルミを3ひき さがそう', 'Hop the stones and find the 3 Lumi.'), start: { b: 'st0', l: [0, 1.0, 0], fw: [0, 1, 0] }, route: [{ to: 'hc1', j: 8.4, land: 1 }, { to: 'lu1', j: 8.4, land: 1 }, { to: 'hc3', j: 8.4, land: 1 }, { to: 'lu2', j: 8.4, land: 1 }, { to: 'hc5', j: 8.4, land: 1 }, { to: 'lu3', j: 8.4, land: 1 }], par: 40 });
    b.d.deco = [{ dir: [0.5, 0.15, -0.8], r: 50, col: [0.95, 0.45, 0.2], ring: 0 }, { dir: [-0.8, 0.4, 0.3], r: 20, col: [0.7, 0.3, 0.3], ring: 1 }, { dir: [0.0, -0.4, -0.9], r: 14, col: [0.95, 0.8, 0.4] }];
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
    b.mission({ id: 'g4m1', name: T('あまあま さんぽ', 'Sweet Stroll'), desc: T('ガミーを スピンで やっつけながら、キャンディの星の うらがわへ', 'Spin the gummy guards away and cross the candy planet.'), start: { b: 'cand1', l: b.ll('cand1', 70, 0, 0.5), fw: [0, 0, 1] }, shard: 's1', route: ['a1', 'a2', 'a3', 'a4', 's1'], par: 40 });
    // m2：ほのおスピンで、アメのトゲの わをとかす
    const m2 = ['g4m2'], sd = b.ll('cand1', -30, 90, 0).map(v => v); const sdir = LVdir(-30, 90);
    b.ent('crate', 'cand1', b.ll('cand1', 40, 90, 0.7), { m: m2, id: 'fc', drop: 'fire' });
    ringAround(b, 'cand1', sdir, 1.5, 6, 0.5).forEach((l, i) => b.ent('spike', 'cand1', l, { m: m2, id: 'sp' + (i + 1) }));
    b.ent('coin', 'cand1', b.ll('cand1', 10, 90, 1), { m: m2, id: 'c1' }); b.ent('shard', 'cand1', b.ll('cand1', -30, 90, 1.0), { m: m2, id: 's2' });
    b.mission({ id: 'g4m2', name: T('ほのおスピンで とかせ！', 'Melt It With Fire Spin'), desc: T('ほのおの箱を スピンでわって、ほのおスピン！ アメのトゲを とかして スターシャードへ', 'Pop the fire crate, then fire-spin to melt the candy spikes around the Star Shard.'), start: { b: 'cand1', l: b.ll('cand1', 66, 90, 0.5), fw: [0, 0, 1] }, shard: 's2', route: ['c1', 'fc', { melt: 'sp1', at: 2.4 }, { melt: 'sp2', at: 2.4 }, { melt: 'sp3', at: 2.4 }, { melt: 'sp4', at: 2.4 }, { melt: 'sp5', at: 2.4 }, { melt: 'sp6', at: 2.4 }, 's2'], par: 40 });
    // m3：スケートで すいせい（大きな星を 1しゅう）
    const m3 = ['g4m3']; b.ent('crate', 'cand3', b.ll('cand3', 0, 10, 0.7), { m: m3, id: 'sk', drop: 'skate' });
    for (let i = 0; i < 8; i++) b.ent('orb', 'cand3', b.ll('cand3', 0, 40 + i * 40, 1.0), { m: m3, id: 'o' + (i + 1) });
    b.ent('shard', 'cand3', b.ll('cand3', 0, 355, 1.0), { m: m3, id: 's3', req: 'orbs' });
    b.mission({ id: 'g4m3', name: T('スケートすいせい', 'Skater Comet'), kind: 'comet', desc: T('スケートの箱で とっても はやく！ 大きな星を 1しゅうして 8つの すいせいのかけらを あつめよう', 'Grab the skate crate and zoom around the big planet to collect 8 comet orbs in time.'), timer: 11, start: { b: 'cand3', l: b.ll('cand3', 0, 0, 0.5), fw: [0, 0, 1] }, shard: 's3', route: ['sk', 'o1', 'o2', 'o3', 'o4', 'o5', 'o6', 'o7', 'o8', 's3'], par: 20 });
    // かくれルミ
    b.ent('lumi', 'cand1', b.ll('cand1', 50, 220, 1.2), { id: 'lu1', n2: 0 }); b.ent('lumi', 'cand1', b.ll('cand1', -55, 20, 1.2), { id: 'lu3', n2: 2 }); b.ent('lumi', 'cand2', b.at('cand2', [-0.3, 1, 0.5], 1.2), { id: 'lu2', n2: 1 });
    b.ent('launch', 'cand1', b.at('cand1', b.to('cand1', 'cand2'), 0.9), { m: ['g4hunt'], id: 'LH', mode: 'cannon', T: 1.6, arc: 6, to: { b: 'cand2', l: b.at('cand2', b.to('cand2', 'cand1'), 2.4) } });
    b.mission({ id: 'g4hunt', kind: 'hunt', lumi: 3, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('キャンディの星と おとなりの星の ルミを みつけよう', 'Find the Lumi hiding on the candy worlds.'), start: { b: 'cand1', l: b.ll('cand1', 20, 150, 0.5), fw: [0, 0, 1] }, route: ['lu1', 'lu3', { to: 'LH', launch: 1 }, 'lu2'], par: 40 });
    b.d.deco = [{ dir: [-0.6, 0.3, -0.7], r: 40, col: [1, 0.6, 0.8], ring: 1 }, { dir: [0.7, 0.4, -0.4], r: 16, col: [0.6, 0.9, 1] }, { dir: [0.1, -0.3, 0.9], r: 24, col: [1, 0.9, 0.5] }];
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
    b.mission({ id: 'g5m1', name: T('あわの パイプめぐり', 'Bubble Pipes'), desc: T('パイプで 星から星へ。いちばん奥の みどりの星に スターシャード', 'Take the pipes from planet to planet to the green bubble at the end.'), start: { b: 'bb1', l: b.ll('bb1', 25, 10, 0.5), fw: [0, 0, 1] }, shard: 's1', route: ['a1', 'a2', { to: 'P1', launch: 1 }, 'a3', { to: 'P2', launch: 1 }, 'a4', 's1'], par: 35 });
    // m2：ゆれる 月の はし
    const m2 = ['g5m2'];
    b.ent('coin', 'mm', b.at('mm', [0, 1, 0], 1.0), { m: m2, id: 'cL' }); b.ent('coin', 'mm', b.at('mm', [1, 0, 0], 1.0), { m: m2, id: 'cR' }); b.ent('coin', 'sb', b.at('sb', [-1, 0, 0], 1.0), { m: m2, id: 'cB' });
    b.ent('shard', 'sb', b.at('sb', [0, 1, 0], 1.0), { m: m2, id: 's2' });
    b.mission({ id: 'g5m2', name: T('ゆれる 月の はし', 'The Swinging Moon'), desc: T('行ったり来たりする ちいさな月に のって、向こうの星へ。タイミングが コツ', 'Ride the little moon that swings back and forth to cross the gap.'), start: { b: 'sa', l: b.at('sa', [0, 1, 0], 0.5), fw: [1, 0, 0] }, shard: 's2', pts: { fA: { b: 'sa', l: [5.5, 0, 0] } }, route: [{ to: 'fA', tol: 0.8 }, { to: 'cL', j: 5.2, land: 1 }, { to: 'cR', tol: 1.2 }, { to: 'cB', j: 4.2, land: 1 }, 's2'], par: 40 });
    // m3：あわの すいせい
    const m3 = ['g5m3'];
    for (let i = 0; i < 6; i++) b.ent('orb', 'bb1', b.ll('bb1', -20, 60 + i * 55, 1.0), { m: m3, id: 'o' + (i + 1) });
    b.ent('launch', 'bb1', b.at('bb1', b.to('bb1', 'bb2'), 0.9), { m: m3, id: 'Lc', mode: 'star', T: 1.0, arc: 5, to: { b: 'bb2', l: b.at('bb2', b.to('bb2', 'bb1'), 2.4) } });
    b.ent('shard', 'bb2', b.at('bb2', b.to('bb2', 'bb1'), 1.0), { m: m3, id: 's3', req: 'orbs' });
    b.mission({ id: 'g5m3', name: T('あわの すいせい', 'Bubble Comet'), kind: 'comet', desc: T('せいげん時間の なかで 6つの すいせいのかけらを あつめて、となりの星へ', 'Collect 6 comet orbs and reach the next bubble before time runs out.'), timer: 30, start: { b: 'bb1', l: b.ll('bb1', -20, 20, 0.5), fw: [0, 0, 1] }, shard: 's3', route: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', { to: 'Lc', launch: 1 }, 's3'], par: 30 });
    b.ent('lumi', 'bb1', b.ll('bb1', -50, 200, 1.2), { id: 'lu1', n2: 0 }); b.ent('lumi', 'bb2', b.at('bb2', [0.3, -1, 0.3], 1.2), { id: 'lu2', n2: 1 }); b.ent('lumi', 'bb3', b.at('bb3', [0.5, 0.6, 1], 1.2), { id: 'lu3', n2: 2 });
    b.mission({ id: 'g5hunt', kind: 'hunt', lumi: 3, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('あわの 3つの星の ルミを みつけよう', 'Find the Lumi on the three bubble planets.'), start: { b: 'bb1', l: b.ll('bb1', 25, 10, 0.5), fw: [0, 0, 1] }, route: ['lu1', { to: 'P1', launch: 1 }, 'lu2', { to: 'P2', launch: 1 }, 'lu3'], par: 40 });
    b.d.deco = [{ dir: [-0.5, 0.2, -0.8], r: 44, col: [0.4, 0.8, 0.95], ring: 0 }, { dir: [0.7, 0.5, -0.4], r: 18, col: [0.8, 1, 0.9], ring: 1 }, { dir: [0.0, -0.4, 0.9], r: 20, col: [0.5, 0.6, 1] }];
    return b.d;
  }

  // ================== 6. ぜんまいの いせき（ボスつき） ==================
  function g6() {
    const b = Builder('g6', T('ぜんまいの いせき', 'Clockwork Ruins'), 'ruins', { n1: [0.3, 0.2, 0.08], n2: [0.95, 0.75, 0.35], band: [0.2, 0.6, 0.7], sun: [0.5, 0.5, -0.6], sunc: [1, 0.9, 0.7], stars: 0.8 });
    b.sph('gr1', [0, 0, 0], 8, { surf: 'ruin' });
    b.cyl('gd1', [22, 2, 0], 5, 0.8, { surf: 'gear', rr: 0.3, mv: [{ t: 'spin', a: [0, 1, 0], T: 30 }] }); b.cyl('gd2', [33, 2, 0], 5, 0.8, { surf: 'gear', rr: 0.3, mv: [{ t: 'spin', a: [0, 1, 0], T: -30 }] });
    const N = 10, RR = 13.5; b.sph('core', [0, 0, 70], 6, { surf: 'ruin', g: 0.5, gr: 7 });
    for (let i = 0; i < N; i++) { const a = i / N * Math.PI * 2; b.box('st' + i, [RR * Math.cos(a), RR * Math.sin(a), 70], [2.4, 0.8, 2.4], { rot: [0, 0, a - Math.PI / 2], rr: 0.5, surf: 'ruin', gr: 8 }); }
    b.sph('arena', [0, 0, 130], 11, { surf: 'ruin' });
    // m1：はぐるまの わたり
    const m1 = ['g6m1'];
    b.ent('launch', 'gr1', b.at('gr1', b.to('gr1', 'gd1'), 0.9), { m: m1.concat('g6hunt'), id: 'L1', mode: 'star', T: 1.4, arc: 6, to: { b: 'gd1', l: [-3.0, 3.2, 0] } });
    b.ent('coin', 'gd1', [3.4, 1.6, 0], { m: m1, id: 'g1c' }); b.ent('coin', 'gd2', [-3.4, 1.6, 0], { m: m1, id: 'g2c' }); b.ent('shard', 'gd2', [0, 1.6, 0], { m: m1, id: 's1' });
    b.mission({ id: 'g6m1', name: T('はぐるまの わたり', 'Gear Crossing'), desc: T('はっしゃスターで まわる はぐるまへ。はぐるまから はぐるまへ ジャンプ！', 'Launch onto the turning gears and hop from gear to gear.'), start: { b: 'gr1', l: b.ll('gr1', 10, 60, 0.5), fw: [0, 0, 1] }, shard: 's1', route: [{ to: 'L1', launch: 1 }, { to: 'g1c', tol: 1.0 }, { to: 'g2c', j: 6.5, land: 1 }, 's1'], par: 40 });
    // m2：ぜんまいの すいせい
    const m2 = ['g6m2'];
    for (let i = 0; i < 6; i++) b.ent('orb', 'gr1', b.ll('gr1', -22, 70 + i * 55, 1.0), { m: m2, id: 'o' + (i + 1) });
    b.ent('launch', 'gr1', b.at('gr1', b.to('gr1', 'gd1'), 0.9), { m: m2, id: 'Lc', mode: 'star', T: 1.4, arc: 6, to: { b: 'gd1', l: [-3.0, 3.2, 0] } });
    b.ent('shard', 'gd1', [0, 1.6, 0], { m: m2, id: 's2', req: 'orbs' });
    b.mission({ id: 'g6m2', name: T('ぜんまいの すいせい', 'Clockwork Comet'), kind: 'comet', desc: T('遺跡の星を まわって 6つの かけらを あつめ、はぐるまへ ワープ', 'Collect 6 orbs around the ruin planet and launch to the gear.'), timer: 30, start: { b: 'gr1', l: b.ll('gr1', -22, 20, 0.5), fw: [0, 0, 1] }, shard: 's2', route: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', { to: 'Lc', launch: 1 }, 's2'], par: 30 });
    // m3：遺跡の 石だたみ
    const m3 = ['g6m3']; for (let i = 1; i <= 4; i++) b.ent('coin', 'st' + i, [0, 1.8, 0], { m: m3, id: 'k' + i }); b.ent('crystal', 'st5', [0, 1.8, 0], { m: m3, id: 'k5' }); b.ent('shard', 'st7', [0, 1.8, 0], { m: m3, id: 's3' }); b.ent('coin', 'st6', [0, 1.8, 0], { m: m3, id: 'k6' });
    b.mission({ id: 'g6m3', name: T('遺跡の 石だたみ', 'Ruin Stepping Stones'), desc: T('こわれた遺跡の 石から石へ。つぎの石まで ジャンプ！', 'Hop across the broken ruin stones.'), start: { b: 'st0', l: [0, 1.0, 0], fw: [0, 1, 0] }, shard: 's3', route: ['k1', 'k2', 'k3', 'k4', 'k5', 'k6', 's3'].map(x => ({ to: x, j: 7.9, land: 1 })), par: 40 });
    // m4：ボス ぜんまいガーディアン
    const m4 = ['g6m4'];
    b.ent('boss', 'arena', b.at('arena', [0, 1, 0], 0), { m: m4, id: 'boss', hp: 4, rad: 1.7, spd: 0.55, rs: 14, dbl: 1, stun: 4.6, look: 'guard' });
    b.ent('shard', 'arena', b.at('arena', [0.2, 1, 0.1], 1.0), { m: m4, id: 's4', req: 'boss' }); b.ent('heart', 'arena', b.at('arena', [-1, 0.2, 0.4], 1.0), { m: m4, id: 'hh1' });
    b.mission({ id: 'g6m4', name: T('ボス ぜんまいガーディアン', 'Boss: Clockwork Guardian'), kind: 'boss', desc: T('2つの衝撃波を ジャンプで よけて、スキだらけの ガーディアンを 4かい たたこう', 'Jump over the double shockwave, then hit the dazed guardian 4 times.'), start: { b: 'arena', l: b.at('arena', [0, -0.5, 0.9], 0.5), fw: [0, 0, 1] }, shard: 's4', route: [{ boss: 1 }, 's4'], par: 120 });
    b.ent('lumi', 'gr1', b.ll('gr1', -50, 220, 1.2), { id: 'lu1', n2: 0 }); b.ent('lumi', 'gd1', [-1.5, 1.5, 3], { id: 'lu2', n2: 1 }); b.ent('lumi', 'gd2', [2.5, 1.5, -2], { id: 'lu3', n2: 2 });
    b.mission({ id: 'g6hunt', kind: 'hunt', lumi: 3, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('遺跡と はぐるまの ルミを みつけよう', 'Find the Lumi in the ruins and on the gears.'), start: { b: 'gr1', l: b.ll('gr1', 10, 60, 0.5), fw: [0, 0, 1] }, route: ['lu1', { to: 'L1', launch: 1 }, 'lu2', { to: 'lu3', j: 6.5, land: 1 }], par: 40 });
    b.d.deco = [{ dir: [0.5, 0.2, -0.8], r: 46, col: [0.9, 0.7, 0.35], ring: 1 }, { dir: [-0.8, 0.4, 0.3], r: 20, col: [0.7, 0.55, 0.3] }, { dir: [0.1, -0.5, -0.85], r: 14, col: [0.95, 0.85, 0.6] }];
    return b.d;
  }

  // ================== 7. おばけ星雲（ちょうちんをともす） ==================
  function g7() {
    const b = Builder('g7', T('おばけ星雲', 'Haunted Nebula'), 'dusk', { n1: [0.1, 0.04, 0.22], n2: [0.5, 0.28, 0.85], band: [0.5, 0.5, 0.7], sun: [-0.4, 0.5, -0.6], sunc: [0.7, 0.6, 1], stars: 1.1, dark: 1 });
    b.sph('hn1', [0, 0, 0], 9, { surf: 'dusk' }); b.sph('hn2', [26, 2, 0], 5, { surf: 'dusk' }); b.sph('hn3', [48, -3, 10], 4, { surf: 'stone' });
    [120, 180, 240].forEach((a, i) => { const r = a * Math.PI / 180; b.cyl('pd' + (i + 1), [9.7 * Math.cos(r), 9.7 * Math.sin(r), 0], 1.3, 0.7, { rot: [0, 0, r - Math.PI / 2], rr: 0.3, surf: 'stone', g: 0 }); });
    const lan = (m, id, ll) => b.ent('lantern', 'hn1', b.ll('hn1', ll[0], ll[1], 0.8), { m, id });
    // m1：ちょうちんを ぜんぶ ともそう（おばけが うろうろ）
    const m1 = ['g7m1']; [[0, 60], [0, 150], [0, 240], [0, 330]].forEach((c, i) => lan(m1, 'ln' + (i + 1), c));
    b.ent('walker', 'hn1', b.ll('hn1', 0, 105, 0.6), { m: m1, id: 'w1', look: 'ghost', l0: b.ll('hn1', 0, 105, 0.6), ax: [0, 1, 0], w: 0.7, ph: 0 }); b.ent('walker', 'hn1', b.ll('hn1', 0, 285, 0.6), { m: m1, id: 'w2', look: 'ghost', l0: b.ll('hn1', 0, 285, 0.6), ax: [0, 1, 0], w: -0.8, ph: 0 });
    b.ent('crate', 'hn1', b.ll('hn1', 60, 300, 0.7), { m: m1, id: 'shc', drop: 'shield' });
    b.ent('shard', 'hn1', b.ll('hn1', 70, 0, 1.0), { m: m1, id: 's1', req: 'lanterns' });
    b.mission({ id: 'g7m1', name: T('ちょうちんを ともせ', 'Light the Lanterns'), desc: T('くらい星の ちょうちん4つに ふれて あかりを ともそう。おばけは スピンで おいはらえる', 'Touch all 4 lanterns on the dark planet. Spin the ghosts away!'), start: { b: 'hn1', l: b.ll('hn1', 40, 0, 0.5), fw: [0, 0, 1] }, shard: 's1', route: ['ln1', 'ln2', 'ln3', 'ln4', 's1'], par: 40 });
    // m2：おばけの だいざ（ちょうちんは だいざの 上）
    const m2 = ['g7m2']; [1, 2, 3].forEach(i => b.ent('lantern', 'pd' + i, [0, 1.6, 0], { m: m2, id: 'pl' + i }));
    b.ent('shard', 'hn1', b.ll('hn1', 75, 200, 1.0), { m: m2, id: 's2', req: 'lanterns' });
    b.mission({ id: 'g7m2', name: T('だいざの ちょうちん', 'Pedestal Lights'), desc: T('石のだいざに ジャンプで のって、上の ちょうちんを ともそう', 'Jump up on the stone pedestals and light the lanterns on top.'), start: { b: 'hn1', l: b.ll('hn1', 0, 80, 0.5), fw: [0, 0, 1] }, shard: 's2', route: [{ to: 'pl1', j: 3.6, land: 1 }, { to: 'pl2', j: 3.6, land: 1 }, { to: 'pl3', j: 3.6, land: 1 }, 's2'], par: 40 });
    // m3：ともしびの すいせい
    const m3 = ['g7m3']; for (let i = 0; i < 5; i++) lan(m3, 'lc' + (i + 1), [-25, 40 + i * 60]);
    b.ent('launch', 'hn1', b.at('hn1', b.to('hn1', 'hn2'), 0.9), { m: m3.concat('g7hunt'), id: 'L1', mode: 'star', T: 1.3, arc: 6, to: { b: 'hn2', l: b.at('hn2', b.to('hn2', 'hn1'), 2.4) } });
    b.ent('walker', 'hn2', b.at('hn2', [0.2, 1, 0.2], 0.6), { m: m3, id: 'w3', look: 'ghost', l0: b.at('hn2', [0.2, 1, 0.2], 0.6), ax: [0, 0, 1], w: 0.9, ph: 1 });
    b.ent('shard', 'hn2', b.at('hn2', b.to('hn2', 'hn1'), 1.0), { m: m3, id: 's3', req: 'lanterns' });
    b.mission({ id: 'g7m3', name: T('ともしびの すいせい', 'Lantern Comet'), kind: 'comet', desc: T('時間内に 5つの ちょうちんを ともして、となりの星へ！', 'Light 5 lanterns in time, then launch to the next planet!'), timer: 30, start: { b: 'hn1', l: b.ll('hn1', -25, 10, 0.5), fw: [0, 0, 1] }, shard: 's3', route: ['lc1', 'lc2', 'lc3', 'lc4', 'lc5', { to: 'L1', launch: 1 }, 's3'], par: 30 });
    b.ent('launch', 'hn2', b.at('hn2', b.to('hn2', 'hn3'), 0.9), { m: ['g7hunt'], id: 'L2', mode: 'pipe', T: 1.4, arc: 4, to: { b: 'hn3', l: b.at('hn3', b.to('hn3', 'hn2'), 2.6) } });
    b.ent('lumi', 'hn1', b.ll('hn1', -50, 200, 1.2), { id: 'lu1', n2: 0 }); b.ent('lumi', 'hn2', b.at('hn2', [0.3, -1, 0.3], 1.2), { id: 'lu2', n2: 1 }); b.ent('lumi', 'hn3', b.at('hn3', [0.5, 0.6, 1], 1.2), { id: 'lu3', n2: 2 });
    b.mission({ id: 'g7hunt', kind: 'hunt', lumi: 3, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('くらやみの 3つの星の ルミを みつけよう', 'Find the Lumi in the dark on the three planets.'), start: { b: 'hn1', l: b.ll('hn1', 20, 150, 0.5), fw: [0, 0, 1] }, route: ['lu1', { to: 'L1', launch: 1 }, 'lu2', { to: 'L2', launch: 1 }, 'lu3'], par: 40 });
    b.d.deco = [{ dir: [-0.4, 0.4, -0.8], r: 44, col: [0.6, 0.45, 0.9], ring: 1 }, { dir: [0.8, 0.2, 0.5], r: 14, col: [0.9, 0.8, 1] }, { dir: [0.0, 0.8, -0.5], r: 22, col: [0.4, 0.35, 0.7] }];
    return b.d;
  }

  // ================== 8. ほしの おうかん（ラスト） ==================
  function g8() {
    const b = Builder('g8', T('ほしの おうかん', 'Crown of Stars'), 'star', { n1: [0.2, 0.1, 0.5], n2: [1, 0.85, 0.4], band: [0.3, 0.8, 0.5], sun: [0.5, 0.6, -0.6], sunc: [1, 0.95, 0.8], stars: 1.2 });
    b.sph('fs1', [0, 0, 0], 8, { surf: 'star' }); b.sph('fs2', [30, 0, 0], 6, { surf: 'star' }); b.sph('fs3', [60, 5, 0], 5, { surf: 'metal' }); b.sph('fs4', [90, 0, 0], 6, { surf: 'star', ring: 1 });
    b.sph('ba', [0, 0, 200], 5, { surf: 'star' }); b.sph('bb', [19.5, 0, 200], 5.5, { surf: 'star' }); b.sph('arena', [0, 0, 300], 12, { surf: 'star' });
    // m1：ほしのみち（ハチで 大きな すきまを わたる）
    const m1 = ['g8m1'];
    b.ent('crate', 'ba', b.at('ba', [1, 0.12, 0], 0.7), { m: m1, id: 'bx', drop: 'bee' }); b.ent('coin', 'ba', b.at('ba', [0, 1, 0], 1.0), { m: m1, id: 'e1' }); b.ent('coin', null, [9.6, 0.4, 200], { m: m1, id: 'e2' });
    b.ent('shard', 'bb', b.at('bb', [-1, 0.05, 0], 1.0), { m: m1, id: 's1' });
    b.mission({ id: 'g8m1', name: T('ほしの みち', 'Star Road'), desc: T('ハチの箱を スピンでわって、ホバリングで 大きな すきまを わたろう', 'Spin open the bee crate and hover across the big gap.'), start: { b: 'ba', l: b.at('ba', [0, 1, 0], 0.5), fw: [1, 0, 0] }, shard: 's1', route: ['e1', 'bx', { fly: 'e2' }, { fly: 's1' }], par: 25 });
    // m2：ぜんぶの 銀河の しれん（ガントレット：すいせいを つなげる。ぜんぶの銀河をクリアしたら）
    const m2 = ['g8m2'], chain = ['fs1', 'fs2', 'fs3', 'fs4']; let ct = 0;
    chain.forEach((id, k) => { for (let i = 0; i < 3; i++) b.ent('orb', id, b.ll(id, k === 0 ? -20 : 20 - i * 5, 120 + i * 80 + k * 20, 1.0), { m: m2, id: 'o' + (++ct) });
      if (k < 3) { const nx = chain[k + 1]; b.ent('launch', id, b.at(id, b.to(id, nx), 0.9), { m: m2.concat('g8hunt'), id: 'L' + (k + 1), mode: k === 1 ? 'cannon' : 'star', T: 1.6, arc: 8, to: { b: nx, l: b.at(nx, b.to(nx, id), 2.4) } }); } });
    b.ent('shard', 'fs4', b.at('fs4', b.to('fs4', 'fs3'), 1.0), { m: m2, id: 's2', req: 'orbs' });
    b.mission({ id: 'g8m2', name: T('ぜんぶの しれん', 'The Grand Gauntlet'), kind: 'comet', desc: T('4つの星を つなぐ ながい すいせいレース！ ぜんぶの銀河の シャードを あつめた人だけの ちょうせん', 'A long comet race across four planets. Only for those who cleared every other galaxy.'), timer: 75, need: 23, start: { b: 'fs1', l: b.ll('fs1', -20, 60, 0.5), fw: [0, 0, 1] }, shard: 's2', route: ['o1', 'o2', 'o3', { to: 'L1', launch: 1 }, 'o4', 'o5', 'o6', { to: 'L2', launch: 1 }, 'o7', 'o8', 'o9', { to: 'L3', launch: 1 }, 'o10', 'o11', 'o12', 's2'], par: 60 });
    // m3：ラスボス ほしのおうさま
    const m3 = ['g8m3'];
    b.ent('boss', 'arena', b.at('arena', [0, 1, 0], 0), { m: m3, id: 'boss', hp: 6, rad: 1.9, spd: 0.48, rs: 12, dblAt: 4, triAt: 2, stun: 5.8, look: 'king' });
    b.ent('shard', 'arena', b.at('arena', [0.2, 1, 0.1], 1.0), { m: m3, id: 's3', req: 'boss' }); b.ent('heart', 'arena', b.at('arena', [-1, 0.2, 0.4], 1.0), { m: m3, id: 'hh1' }); b.ent('heart', 'arena', b.at('arena', [1, -0.2, -0.4], 1.0), { m: m3, id: 'hh2' });
    b.mission({ id: 'g8m3', name: T('ラスボス ほしのおうさま', 'Final Boss: Star King'), kind: 'final', desc: T('3だんかいの しょうげきは。ジャンプで よけて、スキを スピンで 6かい！', 'Three phases of shockwaves. Jump them, then spin the dazed king 6 times!'), start: { b: 'arena', l: b.at('arena', [0, -0.5, 0.9], 0.5), fw: [0, 0, 1] }, shard: 's3', route: [{ boss: 1, max: 7000 }, 's3'], par: 150 });
    b.ent('lumi', 'fs1', b.ll('fs1', 40, 200, 1.2), { id: 'lu1', n2: 0 }); b.ent('lumi', 'fs2', b.at('fs2', [0.3, -1, 0.3], 1.2), { id: 'lu2', n2: 1 }); b.ent('lumi', 'fs3', b.at('fs3', [0.5, 0.6, 1], 1.2), { id: 'lu3', n2: 2 });
    b.mission({ id: 'g8hunt', kind: 'hunt', lumi: 3, name: T('かくれルミを さがせ', 'Hidden Lumi Hunt'), desc: T('さいごの星ぐんの ルミを みつけよう', 'Find the last three Lumi.'), start: { b: 'fs1', l: b.ll('fs1', 20, 150, 0.5), fw: [0, 0, 1] }, route: ['lu1', { to: 'L1', launch: 1 }, 'lu2', { to: 'L2', launch: 1 }, 'lu3'], par: 40 });
    b.d.deco = [{ dir: [0.5, 0.3, -0.8], r: 54, col: [1, 0.85, 0.4], ring: 1 }, { dir: [-0.8, 0.3, 0.4], r: 22, col: [0.6, 0.7, 1] }, { dir: [0.1, -0.5, -0.85], r: 16, col: [1, 0.6, 0.8] }];
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
  ];
  const cache = {};
  function def(id) { if (!cache[id]) cache[id] = id === 'hub' ? hub() : GALAXIES.find(g => g.id === id).build(); return cache[id]; }
  function compile(E, id) { const k = 'c:' + id; if (!cache[k]) cache[k] = E.compile(def(id)); return cache[k]; }
  const G = { GALAXIES, def, compile, ids: ['hub'].concat(GALAXIES.map(g => g.id)), dir, total: () => GALAXIES.reduce((n, g) => n + def(g.id).missions.filter(m => m.kind !== 'hunt').length, 0) };
  if (typeof module !== 'undefined' && module.exports) module.exports = G; else root.GalaxyLevels = G;
})(typeof window !== 'undefined' ? window : globalThis);
