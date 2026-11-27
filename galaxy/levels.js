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

  // ================== ほしみ台（ハブ） ==================
  function hub() {
    const b = Builder('hub', T('ほしみ台', 'Stargazer Deck'), 'hub', { n1: [0.1, 0.14, 0.45], n2: [0.6, 0.3, 0.7], band: [0.3, 0.9, 0.3], sun: [0.5, 0.55, -0.65], sunc: [1, 0.9, 0.7], stars: 1 });
    b.sph('deck', [0, 0, 0], 9, { surf: 'metal' });
    b.sph('moon', [0, 0, 0], 2, { surf: 'stone', mv: [{ t: 'orbit', c: [0, 0, 0], a: [0.3, 1, 0.1], T: 24 }], g: 1 }); b.d.bodies[1].p = [17, 3, 0]; b.d.bodies[1].mv[0].c = [0, 0, 0];
    b.ent('gate', 'deck', b.ll('deck', 18, 0, 0.9), { id: 'gate1', gal: 'g1' });
    b.ent('gate', 'deck', b.ll('deck', 18, 120, 0.9), { id: 'gate2', gal: 'g2' });
    b.ent('gate', 'deck', b.ll('deck', 18, 240, 0.9), { id: 'gate3', gal: 'g3' });
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
    b.ent('shard', 'mo4', b.at('mo4', [0, 1, 0], 1.0), { m: m3, id: 's3' }); b.ent('lumi', 'mo3', b.at('mo3', [1, 0.3, 0], 1.2), { id: 'lu1', n2: 0 });
    b.mission({ id: 'g1m3', name: T('ちいさなお月さま ぴょんぴょん', 'Tiny Moon Hops'), desc: T('ちいさな 4つのお月さまを ジャンプで わたろう。星の よこから とぶのが コツ', 'Hop across four tiny moons. Jump from the side that faces the next moon.'), start: { b: 'mo1', l: b.at('mo1', U, 0.5), fw: [0, 0, -1] }, shard: 's3',
      pts: { f1: { b: 'mo1', l: [0, 0, -2.95] }, g2: { b: 'mo2', l: [0, 0, -2.95] }, g3: { b: 'mo3', l: [0, 0, -2.95] } },
      route: [{ to: 'f1', tol: 0.7 }, { to: 'h1', j: 3.2, land: 1 }, { to: 'g2', tol: 0.7 }, { to: 'h2', j: 3.2, land: 1 }, { to: 'g3', tol: 0.7 }, { to: 'h3', j: 3.2, land: 1 }, 's3'], par: 40 });
    // --- ミッション4：みどりの すいせい（タイムアタック）
    const m4 = ['g1m4'];
    [[-25, 100], [-25, 150], [-25, 200], [-25, 250], [-25, 300], [-25, 350]].forEach((c, i) => b.ent('orb', 'home', b.ll('home', c[0], c[1], 1.0), { m: m4, id: 'o' + (i + 1) }));
    b.ent('launch', 'home', lPos, { m: m4, id: 'L1c', mode: 'star', T: 1.0, arc: 5, to: { b: 'p2', l: b.at('p2', b.to('p2', 'home'), 2.4) } });
    b.ent('shard', 'p2', b.at('p2', b.to('p2', 'home'), 1.0), { m: m4, id: 's4', req: 'orbs' });
    b.mission({ id: 'g1m4', name: T('みどりの すいせい', 'Meadow Comet'), kind: 'comet', desc: T('せいげん時間の なかで、6つの すいせいのかけらを あつめて、となりの星へ！', 'Collect all 6 comet orbs and reach the next planet before time runs out!'), timer: 32, start: { b: 'home', l: b.ll('home', -25, 50, 0.5), fw: [0, 0, 1] }, shard: 's4', route: ['o1', 'o2', 'o3', 'o4', 'o5', 'o6', { to: 'L1c', launch: 1 }, 's4'], par: 30 });
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
    b.sph('ice2', [-30, 10, 12], 6, { surf: 'ice' });
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
    b.d.deco = [{ dir: [0.5, 0.15, -0.8], r: 50, col: [0.95, 0.45, 0.2], ring: 0 }, { dir: [-0.8, 0.4, 0.3], r: 20, col: [0.7, 0.3, 0.3], ring: 1 }, { dir: [0.0, -0.4, -0.9], r: 14, col: [0.95, 0.8, 0.4] }];
    return b.d;
  }

  const GALAXIES = [
    { id: 'g1', build: g1, need: 0, theme: 'grass', col: '#7fdc79', icon: 'ポ' },
    { id: 'g2', build: g2, need: 3, theme: 'ice', col: '#8fd8ff', icon: 'ひ' },
    { id: 'g3', build: g3, need: 6, theme: 'lava', col: '#ff8a4a', icon: 'ぐ' },
  ];
  const cache = {};
  function def(id) { if (!cache[id]) cache[id] = id === 'hub' ? hub() : GALAXIES.find(g => g.id === id).build(); return cache[id]; }
  function compile(E, id) { const k = 'c:' + id; if (!cache[k]) cache[k] = E.compile(def(id)); return cache[k]; }
  const G = { GALAXIES, def, compile, ids: ['hub'].concat(GALAXIES.map(g => g.id)), dir, total: () => GALAXIES.reduce((n, g) => n + def(g.id).missions.length, 0) };
  if (typeof module !== 'undefined' && module.exports) module.exports = G; else root.GalaxyLevels = G;
})(typeof window !== 'undefined' ? window : globalThis);
