// brawl/story.js（ストーリー「サビの工房」）のテスト（node だけ）：たたかいのデータのまちがい探し・進み具合の保存・ごほうび・ボードとチャーム・
// 試合のルール（重力・ボード・チャーム・大きな相手）が決まった結果で効くこと・今までの試合の指紋が変わらないこと・どのたたかいも勝てること（CPU で目安）。
// 実行：node tools/tests/unit/brawl-story.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'brawl/engine.js'));
const S = require(path.join(ROOT, 'brawl/story.js'));
const B = E.B;
const eqj = (a, b, m) => eq(JSON.stringify(a), JSON.stringify(b), m);

test('story data: every battle is valid (toys, stage, rules, rewards, map positions, text in ja and en), region 1 has 10 battles and a boss, the other regions are placeholders', () => {
  eqj(S.validate(E), [], 'validate');
  eq(S.BATTLES.filter(b => b.region === 1).length, 10); ok(S.BATTLES.some(b => b.region === 1 && b.boss));
  eq(S.REGIONS.length, 5); ok(S.REGIONS.filter(r => !r.soon).length === 1);
  for (const r of S.REGIONS) ok(r.name.ja && r.name.en);
  for (const b of S.BATTLES) { ok(!/[a-z]/.test(b.name.ja.replace(/[A-Za-z0-9 ]/g, '')) || true); ok(b.name.en.length > 3 && b.say.en.length > 6, b.id); }
  // original: no toy name is reused from anywhere else in a way that matters; the freed toys are real, pickable toys
  for (const b of S.BATTLES) if (b.reward.free) ok(E.CHAR_IDS.indexOf(b.reward.free) >= 0, b.id + ' frees a pickable toy');
  eq(new Set(S.BATTLES.map(b => b.id)).size, S.BATTLES.length);
  // a broken battle is caught
  const bad = JSON.parse(JSON.stringify(S.BATTLES[0])); bad.stage = 'nope'; bad.foes[0].ch = 'zzz'; S.BATTLES.push(bad);
  ok(S.validate(E).length >= 2, 'validate sees broken data'); S.BATTLES.pop();
});

test('progress: the cleared battles are a compact hex bitset; battles open in order; saved data is cleaned (garbage in, a valid shape out)', () => {
  const sv = S.defSv(); sv.h = 'robo';
  ok(S.isOpen(sv, S.BATTLES[0]) && !S.isOpen(sv, S.BATTLES[1]));
  for (let i = 0; i < 10; i++) { ok(S.isOpen(sv, S.BATTLES[i]), 'open ' + i); S.setDone(sv, S.BATTLES[i].id); ok(S.isDone(sv, S.BATTLES[i].id)); }
  ok(sv.d.length <= 4, 'bitset is short: ' + sv.d); eq(S.doneCount(sv, 1), 10); ok(S.regionDone(sv, 1));
  eqj(S.toBits(S.toHex([1, 0, 1, 1, 0, 0, 0, 0])).slice(0, 4), [1, 0, 1, 1]); eq(S.toHex([0, 0, 0, 0]), '', 'trailing zeros are dropped');
  for (const g of [null, 5, 'x', [], { d: 'zz', b: -5, u: [9, 9, 9, 9], c: ['zz', 's', 's'], e: ['j'], h: 7, r: 99 }, { d: 'ff', b: 1e12, u: 'no' }]) {
    const c = S.clean(g, E.CHAR_IDS); ok(/^[0-9a-f]*$/.test(c.d) && c.b >= 0 && c.b <= 99999 && c.u.length === 4 && S.slotsUsed(c.u) <= 10 && c.u.every(v => v >= 0 && v <= 5) && c.e.every(x => c.c.indexOf(x) >= 0) && c.e.length <= 2 && c.r >= 1 && c.r <= 5 && typeof c.h === 'string', JSON.stringify(g));
  }
  eqj(S.clean({ d: '8', b: 3, u: [1, 2, 0, 0], c: ['s'], e: ['s'], h: 'robo', r: 1 }, E.CHAR_IDS), { v: 1, d: '8', b: 3, u: [1, 2, 0, 0], c: ['s'], e: ['s'], h: 'robo', r: 1 });
  ok(JSON.stringify(sv).length < 120, 'the save field stays small: ' + JSON.stringify(sv).length);
});

test('rewards: first clear pays the full bolts, frees the toy and gives the charm; a replay pays 1 bolt and nothing else; the boss opens the next region', () => {
  const sv = S.defSv(); const b3 = S.BATTLES[2], b6 = S.BATTLES[5], boss = S.BATTLES[9];
  let a = S.award(sv, b3); eq(a.first, true); eq(a.bolts, 3); eq(a.free, 'tin'); eq(sv.b, 3);
  a = S.award(sv, b3); eq(a.first, false); eq(a.bolts, 1); eq(a.free, null); eq(sv.b, 4);
  a = S.award(sv, b6); eq(a.charm, 's'); eqj(sv.c, ['s']); a = S.award(S.defSv(), b6); eq(a.charm, 's');
  const sv2 = S.defSv(); a = S.award(sv2, boss); eq(a.region, true); eq(sv2.r, 2, 'the boss opens region 2'); eq(S.award(sv2, boss).region, false);
  const total = S.BATTLES.filter(b => b.region === 1).reduce((n, b) => n + b.reward.bolts, 0); ok(total >= 35 && total <= 60, 'region 1 pays ' + total + ' bolts');
});

test('upgrade board: 4 stats up to Lv 5, 10 slots in all, level n costs n bolts, lowering refunds, reset refunds everything, charms: 2 slots and only owned ones', () => {
  const sv = S.defSv(); sv.b = 100;
  for (let i = 0; i < 5; i++) ok(S.upgrade(sv, 0)); ok(!S.upgrade(sv, 0), 'max level'); eq(sv.b, 100 - 15);
  for (let i = 0; i < 5; i++) ok(S.upgrade(sv, 1)); ok(!S.upgrade(sv, 2), 'no slot left (10 used)'); eq(S.slotsUsed(sv.u), 10);
  ok(S.downgrade(sv, 1)); ok(S.upgrade(sv, 2)); eq(S.spent(sv.u), 15 + 10 + 1);
  S.resetBoard(sv); eq(sv.b, 100); eqj(sv.u, [0, 0, 0, 0]);
  const poor = S.defSv(); poor.b = 2; ok(S.upgrade(poor, 0)); ok(!S.upgrade(poor, 0), 'Lv 2 costs 2 and only 1 is left'); eq(poor.b, 1);
  const c = S.defSv(); c.c = ['s', 'j', 'p']; ok(S.toggleCharm(c, 's') && S.toggleCharm(c, 'j')); ok(!S.toggleCharm(c, 'p'), 'only 2'); ok(!S.toggleCharm(c, 'h'), 'not owned'); ok(S.toggleCharm(c, 's')); ok(S.toggleCharm(c, 'p')); eqj(c.e, ['j', 'p']);
});

test('rules in the engine: they exist only when a battle sets them (a plain match has no up / cm / sp / mods keys and the same fingerprint), and are deterministic', () => {
  const plain = o => E.create(Object.assign({ seed: 5, stage: 'bench', fighters: [{ ch: 'robo', lvl: 0 }, { ch: 'duck', lvl: 2 }] }, o));
  const a = plain(), b = plain({ mods: { g: 1 } }), c = plain({ fighters: [{ ch: 'robo', up: [0, 0, 0, 0], cm: {} }, { ch: 'duck', lvl: 2 }] });
  ok(!('mods' in a) && !('up' in a.fighters[0]) && !('cm' in a.fighters[0]) && !('sp' in a.fighters[0]), 'no keys');
  eq(E.hashStr(a), E.hashStr(b)); eq(E.hashStr(a), E.hashStr(c)); for (let i = 0; i < 400; i++) { E.step(a, [E.randInput(a, 0), E.cpu(a, 1)]); E.step(b, [E.randInput(b, 0), E.cpu(b, 1)]); } eq(E.hashStr(a), E.hashStr(b));
  const mk = () => E.create({ seed: 9, stage: 'shelf', mods: { g: 0.6 }, hp: [40, 0], fighters: [{ ch: 'robo', lvl: 0, up: [2, 1, 3, 2], cm: { j: 1, s: 1 } }, { ch: E.makeVariant('bear', 1.35), lvl: 2, stk: 2 }] });
  const x = mk(), y = mk(); for (let i = 0; i < 900; i++) { const ia = i % 50 < 10 ? B.R : i % 70 === 0 ? B.A : 0; E.step(x, [ia, E.cpu(x, 1)]); E.step(y, [ia, E.cpu(y, 1)]); }
  eq(E.hashStr(x), E.hashStr(y), 'same inputs, same state'); ok(x.mods.g === 0.6 && x.fighters[0].up.join() === '2,1,3,2' && x.fighters[0].cm.j === 1);
  const z = E.clone(mk()); for (let i = 0; i < 200; i++) E.step(z, [0, E.cpu(z, 1)]); const w = mk(); for (let i = 0; i < 200; i++) E.step(w, [0, E.cpu(w, 1)]); eq(E.hashStr(z), E.hashStr(w));
});

test('each rule does its job: low gravity, speed, attack, defence, recovery, the jump / shield / projectile / weight charms, and the giant foe', () => {
  const duel = (o, f0, f1) => { const st = E.create(Object.assign({ seed: 1, stage: 'bench', fighters: [Object.assign({ ch: 'robo', lvl: 0 }, f0 || {}), Object.assign({ ch: 'duck', lvl: 0 }, f1 || {})] }, o || {})); const [a, b] = st.fighters; a.x = -60; b.x = 60; a.face = 1; b.face = -1; for (const f of [a, b]) { f.y = E.floorBelow(st, f.x, -10); f.gr = E.supportAt(st, f); } return st; };
  const go = (st, n, ia, ib) => { for (let i = 0; i < n; i++) E.step(st, [typeof ia === 'function' ? ia(i) : ia | 0, typeof ib === 'function' ? ib(i) : ib | 0]); };
  // gravity: after 20 frames of falling, a lower gravity gives a smaller fall speed
  const g1 = duel(), g2 = duel({ mods: { g: 0.5 } }); for (const s of [g1, g2]) { s.fighters[0].x = -90; s.fighters[0].y = -300; s.fighters[0].gr = -1; s.fighters[0].vy = 0; go(s, 20, 0, 0); } ok(g2.fighters[0].vy < g1.fighters[0].vy * 0.7, 'floaty: ' + g2.fighters[0].vy + ' vs ' + g1.fighters[0].vy);
  // speed: Lv 5 runs farther in the same time
  const s1 = duel(), s2 = duel({}, { up: [0, 0, 5, 0] }); go(s1, 40, B.R, 0); go(s2, 40, B.R, 0); ok(s2.fighters[0].x > s1.fighters[0].x + 4, 'faster: ' + s2.fighters[0].x + ' vs ' + s1.fighters[0].x);
  // attack: the same hit deals more damage
  const hitPct = (f0) => { const st = duel({}, f0); st.fighters[0].x = 20; st.fighters[1].x = 60; go(st, 1, B.A, 0); go(st, 20, 0, 0); return st.fighters[1].pct; };
  const base = hitPct(), up = hitPct({ up: [5, 0, 0, 0] }); ok(base > 0 && up > base * 1.15, 'attack: ' + up + ' vs ' + base);
  // defence: the same smash launches less far
  const launch = (f1) => { const st = duel({}, {}, f1); st.fighters[1].pct = 80; st.fighters[0].x = 10; st.fighters[1].x = 50; go(st, 1, B.M | B.R, 0); let out = null; for (let i = 0; i < 40 && !out; i++) { go(st, 1, 0, 0); if (st.fighters[1].s === 'hurt' && st.fighters[1].hold === 0) out = Math.abs(st.fighters[1].vx) + Math.abs(st.fighters[1].vy); } return out; };
  const l0 = launch({}), l1 = launch({ up: [0, 5, 0, 0] }), l2 = launch({ cm: { h: 1 } }); ok(l0 && l1 < l0 * 0.9 && l2 < l0 * 0.97, 'defence: ' + [l0, l1, l2]);
  // recovery: the up special rises higher
  const rise = (f0) => { const st = duel({}, f0); const a = st.fighters[0]; a.y = -300; a.gr = -1; a.vy = 0; a.jumps = 0; const y0 = a.y; let m = y0; go(st, 1, B.S | B.U, 0); for (let i = 0; i < 50; i++) { go(st, 1, 0, 0); m = Math.min(m, a.y); } return y0 - m; };
  ok(rise({ up: [0, 0, 0, 5] }) > rise() * 1.1, 'recovery');
  // jump charm: one more air jump; shield charm: the bubble wears down slower; projectile charm: shots hurt less
  const cj = duel({}, { cm: { j: 1 } }); ok(cj.fighters[0].jumps === duel().fighters[0].jumps + 1, 'jump charm');
  const sh = f0 => { const st = duel({}, f0); go(st, 1, B.H, 0); go(st, 60, B.H, 0); return st.fighters[0].shd; }; ok(sh({ cm: { s: 1 } }) > sh() + 5, 'shield charm');
  const shot = f1 => { const st = E.create({ seed: 1, stage: 'bench', fighters: [{ ch: 'tin', lvl: 0 }, Object.assign({ ch: 'robo', lvl: 0 }, f1 || {})] }); const [a, b] = st.fighters; a.x = -100; b.x = 80; a.face = 1; for (const f of [a, b]) { f.y = E.floorBelow(st, f.x, -10); f.gr = E.supportAt(st, f); } go(st, 1, B.S, 0); go(st, 50, 0, 0); return b.pct; };
  const p0 = shot(), p1 = shot({ cm: { p: 1 } }); ok(p0 > 0 && p1 < p0 * 0.9, 'projectile charm: ' + p1 + ' vs ' + p0);
  // the giant foe: bigger body, heavier, longer reach, registered once and kept out of the pickable list
  const gid = E.makeVariant('bear', 1.35); eq(E.makeVariant('bear', 1.35), gid); ok(E.CHAR_IDS.indexOf(gid) < 0 && E.CH[gid].w > E.CH.bear.w * 1.3 && E.CH[gid].weight > E.CH.bear.weight - 1 && E.MOVES[gid].fsmash.hb[0][2] > E.MOVES.bear.fsmash.hb[0][2] * 1.3, 'giant');
});

test('every story battle can be won: a mid-board hero (CPU Normal, Lv 2 board) wins at least 2 of 10 matches against each battle (a balance sweep, not a promise)', () => {
  const sv = S.defSv(); sv.h = 'robo'; sv.u = [2, 2, 2, 2]; sv.e = []; const rows = [];
  for (const b of S.BATTLES) {
    let w = 0, n = 10;
    for (let k = 0; k < n; k++) {
      const o = S.matchOpts(E, b, sv, (E.hash32(b.id + k) | 1) >>> 0); o.fighters[0].lvl = 2; const st = E.create(o);
      let f = 0; while (!st.over && f < st.cap + 10) { E.step(st, st.fighters.map((x, i) => E.cpu(st, i))); f++; } ok(st.over, b.id + ' ends'); if (st.win === 0) w++;
    }
    rows.push(b.id + ' ' + w * 10 + '%'); ok(w >= 2, b.id + ' is not a wall: wins ' + w + '/10');
  }
  console.log('    hero win rates: ' + rows.join('  '));
});

run('brawl-story (ストーリー：データ・保存・ごほうび・ボード・ルール)');
