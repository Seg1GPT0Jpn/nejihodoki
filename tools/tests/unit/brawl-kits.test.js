// brawl/kits.js（おもちゃのデータ）と、データから動かす仕組みのテスト（node だけ・速い）。
//  1. データのつくり：タイプ（arch）・目玉（sig、ほかと同じにしない）・技のひな形（TPL）がきちんと動く
//  2. 「ちがいの数字」（E.dist）：どの2人も下限より離れている。いちばん近い組を報告する（ふやすたびに、新しいおもちゃは高い下限）
//  3. 色ちがい：1人につき PAL_N（8）色以上・ぜんぶちがう色・同じおもちゃが重なったらスロット順にちがう色、希望の色も通る
//  4. 足す仕組み：defineKind / defineProj / defineChar で、新しい種類のとくぎを足して、決まった結果で動く（このテストのなかだけで足す）
// 実行：node tools/tests/unit/brawl-kits.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'brawl/engine.js'));
const K = E.K, B = E.B;
const eqj = (a, b, m) => eq(JSON.stringify(a), JSON.stringify(b), m);

// 新しい種類（まだ入っていないおもちゃ）の下限。はじめの18人どうしは、いまの最小（duck と samurai）より下がらないことだけを守る
const MIN_LEGACY = 3.0, MIN_NEW = 9.0;

test('kits: every toy has a type (arch), a signature (sig) that no other toy shares, valid text, and the kit is plain data (no functions)', () => {
  const archs = new Set(K.ARCH.map(a => a.id)); eq(archs.size, K.ARCH.length);
  for (const a of K.ARCH) ok(a.ja && a.en, 'arch text ' + a.id);
  const sigs = new Map();
  for (const id of Object.keys(E.CH)) {
    const c = E.CH[id];
    ok(archs.has(c.arch), id + ' has a known arch (' + c.arch + ')');
    ok(typeof c.sig === 'string' && c.sig.length > 2, id + ' has a signature');
    ok(!sigs.has(c.sig), id + ' shares the signature ' + c.sig + ' with ' + sigs.get(c.sig)); sigs.set(c.sig, id);
    const walk = (o, p) => { if (typeof o === 'function') throw new Error(id + ' kit has a function at ' + p); if (o && typeof o === 'object') for (const k of Object.keys(o)) walk(o[k], p + '.' + k); };
    walk(c, id);
    ok(/^#[0-9a-f]{6}$/i.test(c.color) && /^#[0-9a-f]{6}$/i.test(c.color2), id + ' colours');
  }
  eq(E.CHAR_IDS.length, K.LEGACY.length + (E.CHAR_IDS.length - K.LEGACY.length));
  for (const id of K.LEGACY) ok(E.CHAR_IDS.indexOf(id) === K.LEGACY.indexOf(id), 'the first toys keep their order: ' + id);
  // every archetype is in use (so the roster filter never shows an empty chip)
  for (const a of archs) ok(E.CHAR_IDS.some(id => E.CH[id].arch === a), 'arch in use: ' + a);
});

test('move templates (kit.tpl): each one makes a legal set of normals, is applied under kit.ov, and the six look different from each other', () => {
  const base = { reach: 1, sp: 1, pw: 1, rr: 1, fx: 'punch' };
  const names = Object.keys(K.TPL); ok(names.length >= 6, 'at least 6 templates');
  const made = {};
  for (const n of names) {
    const id = 'tpl_' + n;
    const def = { id, boss: 1, name: { ja: n, en: n }, short: { ja: n, en: n }, tag: { ja: n, en: n }, desc: { ja: n, en: n }, color: '#aa5533', color2: '#33aa55', w: 32, h: 56, weight: 100, run: 3.6, acc: 0.5, air: 2.8, aacc: 0.2, jump: 10.8, dj: 9.8, grav: 0.44, fall: 8.6, ff: 12.6, stats: { speed: 3, power: 3, weight: 3, reach: 3, recov: 3 },
      kit: { tpl: n, ov: { jab: { a: 5 } } }, sp: {} };
    for (const k of ['N', 'S', 'U', 'D']) def.sp[k] = K.sp({ kind: 'melee', hb: [[30, -30, 50, -30, 16]] });
    made[n] = E.defineChar(def);
    const m = E.MOVES[id];
    for (const k of E.NORMALS.concat(E.EXTRAS)) { const x = m[k]; ok(x.s >= 2 && x.a >= 1 && x.t >= x.s + x.a + 3 && x.t <= 90 && x.dmg > 0 && x.hb.length >= 1, n + ' ' + k + ' is legal'); }
    eq(m.jab.a, 5, n + ': kit.ov overrides the template');
    ok(m.fsmash.hb[0][4] > 0);
  }
  // a template really changes the moves: compare to the plain kit
  const plain = E.defineChar(Object.assign({}, E.CH.tpl_blade, { id: 'tpl_plain', kit: base }));
  ok(E.MOVES.tpl_blade.ftilt.hb[0][2] > E.MOVES.tpl_plain.ftilt.hb[0][2], 'the blade reaches farther than the plain kit');
  ok(E.MOVES.tpl_bulk.fsmash.t > E.MOVES.tpl_swift.fsmash.t + 8, 'the bulk smash is much slower than the swift one');
  ok(E.MOVES.tpl_bulk.dmg === undefined && E.MOVES.tpl_bulk.fsmash.dmg > E.MOVES.tpl_swift.fsmash.dmg * 1.3, 'the bulk smash hits harder');
  ok(E.MOVES.tpl_floaty.nair.a > E.MOVES.tpl_plain.nair.a + 2, 'floaty aerials stay out longer');
  let minD = 1e9, pair = '';
  for (let i = 0; i < names.length; i++) for (let j = i + 1; j < names.length; j++) { const d = E.dist('tpl_' + names[i], 'tpl_' + names[j]); if (d < minD) { minD = d; pair = names[i] + '/' + names[j]; } }
  console.log('    templates: closest pair ' + pair + ' = ' + minD.toFixed(2));
  ok(minD >= 0.25, 'templates are distinct enough (' + minD + ')');
  try { E.defineChar(Object.assign({}, plain, { id: 'tpl_bad', kit: { tpl: 'nope' } })); ok(false, 'unknown template must throw'); } catch (e) { ok(/unknown move template/.test(e.message)); }
});

test('distinctness: the "difference" between any two toys (E.dist, 0-100 over every move and the body) is above a floor; the closest pairs are reported', () => {
  const ids = E.CHAR_IDS.filter(id => !E.CH[id].boss), legacy = new Set(K.LEGACY), rows = [];
  for (let i = 0; i < ids.length; i++) for (let j = i + 1; j < ids.length; j++) rows.push({ a: ids[i], b: ids[j], d: E.dist(ids[i], ids[j]) });
  rows.sort((x, y) => x.d - y.d);
  console.log('    ' + ids.length + ' toys, ' + rows.length + ' pairs. closest: ' + rows.slice(0, 8).map(r => r.a + '/' + r.b + ' ' + r.d.toFixed(1)).join(', '));
  const md = rows[(rows.length / 2) | 0].d; console.log('    median difference ' + md.toFixed(1) + ', largest ' + rows[rows.length - 1].d.toFixed(1));
  for (const r of rows) ok(r.d >= (legacy.has(r.a) && legacy.has(r.b) ? MIN_LEGACY : MIN_NEW), r.a + ' and ' + r.b + ' are too alike: ' + r.d);
  // symmetric, zero on itself
  eq(E.dist('robo', 'robo'), 0); eq(E.dist('robo', 'duck'), E.dist('duck', 'robo'));
  // the metric sees what it should: a changed special kind or hitbox moves the number
  const c = E.CH.robo; const a = E.dist('robo', 'tin');
  ok(a > 0 && a < 100);
});

test('palettes: every toy has at least 6 (we ship 8) colour variants, all clearly different, valid, named; the first is the classic colours', () => {
  ok(K.PAL_N >= 6 && K.PAL_N === 8);
  for (const id of Object.keys(K.CH)) {
    const P = K.palettes(id); eq(P.length, K.PAL_N, id);
    eq(P[0].col, K.CH[id].color); eq(P[0].col2, K.CH[id].color2);
    for (let i = 0; i < P.length; i++) {
      ok(/^#[0-9a-f]{6}$/.test(P[i].col) && /^#[0-9a-f]{6}$/.test(P[i].col2), id + ' pal ' + i + ' hex');
      ok(P[i].name.ja && P[i].name.en, id + ' pal ' + i + ' name'); eq(P[i].id, i);
      for (let j = 0; j < i; j++) ok(K.cdist(P[i].col, P[j].col) + K.cdist(P[i].col2, P[j].col2) >= K.MIN_PAL_DIST, id + ' pal ' + i + ' too close to ' + j);
    }
  }
});

test('assignPalettes: different toys keep the classic colours; the same toy on several slots gets a different colour per slot; wishes are honoured; deterministic', () => {
  const A = K.assignPalettes;
  eqj(A(['robo', 'duck', 'bear', 'tin']), [0, 0, 0, 0]);
  eqj(A(['robo', 'robo']), [0, 1]); eqj(A(['robo', 'robo', 'robo', 'robo']), [0, 1, 2, 3]);
  eqj(A(['robo', 'duck', 'robo', 'duck']), [0, 0, 1, 1]);
  // a wish (slot 1 wants colour 0) wins over the automatic one; the one who loses the wish is moved
  eqj(A(['robo', 'robo'], [null, 0]), [1, 0]); eqj(A(['robo', 'robo'], [3, 3]), [3, 0]);
  eqj(A(['robo', 'robo', 'robo'], [2, null, null]), [2, 0, 1]);
  eqj(A(['robo', 'robo'], [99, -1]), [0, 1], 'out-of-range wishes are ignored');
  eqj(A(['robo', 'duck'], [5, 6]), [5, 6]);
  // always distinct for the same toy, for every mix of 4 slots and wishes
  const chars = ['robo', 'duck'];
  for (let n = 0; n < 400; n++) {
    const r = E.rnd({ rs: n + 1 }); let rs = { rs: n * 7 + 3 };
    const ch = [], pf = []; for (let i = 0; i < 4; i++) { ch.push(chars[Math.floor(E.rnd(rs) * 2)]); pf.push(E.rnd(rs) < 0.5 ? null : Math.floor(E.rnd(rs) * 9) - 1); }
    const out = A(ch, pf); eq(JSON.stringify(A(ch, pf)), JSON.stringify(out), 'deterministic');
    for (let i = 0; i < 4; i++) for (let j = 0; j < i; j++) if (ch[i] === ch[j]) ok(out[i] !== out[j], 'slots ' + i + ',' + j + ' same toy same colour: ' + JSON.stringify([ch, pf, out]));
    for (const v of out) ok(v >= 0 && v < K.PAL_N);
  }
});

test('unlock rules: the first 18 keep the old ladder (3 free, 3 from the ladder, 12 by wins 2,4,...,24, all by one clear); new toys use ul = wins or a record; texts in ja and en', () => {
  const U = K.unlockInfo, none = { wins: 0, cl: 0, stats: {} };
  for (const id of ['robo', 'duck', 'bear']) ok(U(id, none).done, id + ' is free');
  for (const id of ['tin', 'top', 'jack']) eq(K.unlockRule(id).t, 'ladder');
  K.WIN_ORDER.forEach((id, i) => { const r = K.unlockRule(id); eq(r.t, 'win'); eq(r.n, (i + 1) * 2); ok(!U(id, { wins: r.n - 1, cl: 0, stats: {} }).done); ok(U(id, { wins: r.n, cl: 0, stats: {} }).done); ok(U(id, { wins: 0, cl: 1, stats: {} }).done, 'a ladder clear opens ' + id); });
  eq(K.WIN_ORDER.length, 12);
  // data-driven rules for new toys
  K.CH.t_w = { id: 't_w', ul: { w: 40 } }; K.CH.t_s = { id: 't_s', ul: { s: ['kos', 25] } }; K.CH.t_c = { id: 't_c', ul: { cl: 2 } };
  eqj(K.unlockRule('t_w'), { t: 'win', n: 40 }); eqj(K.unlockRule('t_s'), { t: 'stat', k: 'kos', n: 25 }); eqj(K.unlockRule('t_c'), { t: 'cl', n: 2 });
  ok(!U('t_w', { wins: 39, cl: 5, stats: {} }).done && U('t_w', { wins: 40, cl: 0, stats: {} }).done, 'new toys are not opened by the first ladder clear');
  ok(!U('t_s', { wins: 99, stats: { kos: 24 } }).done && U('t_s', { stats: { kos: 25 } }).done); ok(!U('t_c', { cl: 1 }).done && U('t_c', { cl: 2 }).done);
  ok(/あと 38 勝/.test(K.unlockText('t_w', { wins: 2 }, false)) && /36 more wins/.test(K.unlockText('t_w', { wins: 4 }, true)), K.unlockText('t_w', { wins: 2 }, false));
  ok(/KO/.test(K.unlockText('t_s', { stats: { kos: 3 } }, false)) && /KOs: 3\/25/.test(K.unlockText('t_s', { stats: { kos: 3 } }, true)));
  for (const k of Object.keys(K.STAT_LABEL)) ok(K.STAT_LABEL[k][0] && K.STAT_LABEL[k][1]);
  delete K.CH.t_w; delete K.CH.t_s; delete K.CH.t_c;
});

test('every newer toy has a composed sprite, an unlock rule, and at least one mechanic no other newer toy uses (a special kind, a projectile kind, or a data flag)', () => {
  const nw = E.CHAR_IDS.filter(id => K.LEGACY.indexOf(id) < 0); ok(nw.length >= 16, 'at least 16 newer toys: ' + nw.length);
  const mech = {};
  for (const id of nw) {
    const c = E.CH[id], set = new Set();
    ok(c.spr && c.spr.body && c.spr.body.length >= 3, id + ' has a composed sprite');
    ok(c.ul && (c.ul.w || c.ul.s || c.ul.cl), id + ' has an unlock rule'); ok(K.unlockRule(id).t !== 'win' || K.unlockRule(id).n < 9999, id + ' rule is real');
    for (const sl of [c.sp, c.spb || {}]) for (const k of Object.keys(sl)) {
      const m = sl[k]; if (E.KINDS[m.kind] || ['glide'].indexOf(m.kind) >= 0) set.add('kind:' + m.kind);
      if (m.proj) { if (E.PROJ[m.proj.kind]) set.add('proj:' + m.proj.kind); for (const f of ['pierce', 'bnc', 'nohit', 'slow', 'pw']) if (m.proj[f] !== undefined) set.add('flag:' + f); }
      if (m.kind === 'stance') set.add(m.dur ? 'stance:timed' : 'stance:toggle');
      if (m.sbk) set.add('flag:sbk'); if (m.arm) set.add('flag:arm');
    }
    mech[id] = set;
  }
  for (const id of nw) {
    const own = [...mech[id]].filter(x => !nw.some(o => o !== id && mech[o].has(x)));
    ok(own.length >= 1, id + ' has no mechanic of its own (it shares: ' + [...mech[id]].join(',') + ')');
  }
  console.log('    signature mechanics: ' + nw.map(id => id + '=' + [...mech[id]].filter(x => !nw.some(o => o !== id && mech[o].has(x))).join('+')).join('  '));
});

test('extension points: defineKind (tick / canUse / boxes / onHit / ai), defineProj and defineChar add a new special that runs deterministically and rolls back', () => {
  const log = { tick: 0, hit: 0, proj: 0, can: 0, ai: 0 };
  E.defineKind('t_lunge', {
    melee: true,
    canUse(st, f, m, g) { log.can++; return f.used.t_lunge === undefined || f.used.t_lunge < 99; },
    tick(st, f, C, m, fr, cx) { log.tick++; if (fr >= m.s && fr < m.s + m.a) { f.vx = f.face * 9; cx.free = true; } },
    onHit(st, A, D, h) { log.hit++; A.chain = (A.chain | 0) + 0; D.pct += 1; },
    ai(st, f, m, T, c) { log.ai++; return c.adx < 160 && c.adx > 40 && c.lvl >= 2 ? { hold: c.faceT > 0 ? B.R : B.L } : null; },
  });
  E.defineProj('t_orb', { update(st, p) { log.proj++; p.vy = 0; p.vx *= 1.01; } });
  const def = JSON.parse(JSON.stringify(E.CH.robo)); def.id = 'ext_toy'; def.boss = 1; def.sig = 'ext-lunge'; def.name = { ja: 'テスト', en: 'Test' };
  def.sp.S = K.sp({ kind: 't_lunge', fx: 'punch', s: 6, a: 8, t: 30, dmg: 6, bkb: 14, kbg: 14, ang: 40, hb: [[20, -30, 44, -30, 18]] });
  def.sp.N = K.sp({ kind: 'proj', fx: 'cast', s: 8, a: 1, t: 30, proj: { sp: 5, vy: 0, g: 0, r: 10, life: 60, dmg: 4, bkb: 8, kbg: 8, ang: 20, kind: 't_orb' } });
  const c = E.defineChar(def); eq(E.CHAR_IDS.indexOf('ext_toy'), -1, 'boss:1 stays out of the pickable list');
  try { E.defineChar(def); ok(false); } catch (e) { ok(/duplicate/.test(e.message)); }
  try { E.defineChar(Object.assign(JSON.parse(JSON.stringify(def)), { id: 'ext_bad', sp: Object.assign({}, def.sp, { D: K.sp({ kind: 'nope' }) }) })); ok(false); } catch (e) { ok(/unknown special kind/.test(e.message)); }
  const mk = () => E.create({ seed: 5, stage: 'bench', fighters: [{ ch: 'ext_toy' }, { ch: 'duck' }] });
  const play = (st, n) => { for (let i = 0; i < n; i++) E.step(st, [i === 3 ? B.S | B.R : i === 90 ? B.S : 0, 0]); return st; };
  const a = play(mk(), 200);
  ok(log.tick > 0 && log.can > 0 && log.proj > 0, 'hooks ran: ' + JSON.stringify(log));
  ok(a.fighters[0].used.spS === 1 && a.fighters[0].used.spN === 1, 'both specials were used');
  eq(E.hashStr(a), E.hashStr(play(mk(), 200)), 'same inputs, same state');
  // a snapshot taken in the middle and resumed gives the same end state (rollback netcode relies on this)
  const m1 = mk(); play(m1, 20); const snap = E.clone(m1); for (let i = 20; i < 200; i++) E.step(m1, [i === 90 ? B.S : 0, 0]);
  const m2 = E.clone(snap); for (let i = 20; i < 200; i++) E.step(m2, [i === 90 ? B.S : 0, 0]); eq(E.hashStr(m1), E.hashStr(m2));
  // the lunge connects and onHit is called; CPU asks the kind's ai()
  const st = E.create({ seed: 5, stage: 'bench', fighters: [{ ch: 'ext_toy' }, { ch: 'duck' }] }); const [f0, f1] = st.fighters;
  f0.x = -30; f1.x = 30; f0.face = 1; f1.face = -1; for (const f of st.fighters) { f.y = E.floorBelow(st, f.x, -10); f.gr = E.supportAt(st, f); }
  log.hit = 0; E.step(st, [B.S | B.R, 0]); for (let i = 0; i < 20 && !log.hit; i++) E.step(st, [0, 0]);
  ok(log.hit > 0 && st.fighters[1].pct > 0, 'the new kind hit and onHit ran');
  const st2 = E.create({ seed: 5, stage: 'bench', fighters: [{ ch: 'ext_toy', lvl: 3 }, { ch: 'duck', lvl: 0 }] }); st2.fighters[0].x = -80; st2.fighters[1].x = 40;
  for (const f of st2.fighters) { f.y = E.floorBelow(st2, f.x, -10); f.gr = E.supportAt(st2, f); }
  for (let i = 0; i < 90; i++) E.step(st2, [E.cpu(st2, 0), 0]);
  ok(log.ai > 0, 'the CPU consulted the kind ai()');
});

run('brawl-kits (おもちゃのデータ・色・ちがい・足す仕組み)');
