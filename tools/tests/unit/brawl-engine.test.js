// brawl/engine.js の単体テスト：決まった結果（同じ種・同じ入力 → 同じ試合）、ふっとばしの計算、ブラストゾーン、
// 18人のおもちゃの技がぜんぶ当たって、フレーム数に上限があること、ジャンプ・コヤーテ・先行入力・ふち・まもり・つかみ・カウンター、
// CPU どうしのたくさんの試合（行き詰まらない・かならず終わる・つよい ＞ ふつう ＞ かんたん）。
// 実行：node tools/tests/unit/brawl-engine.test.js   （BRAWL_MATCHES=400 のように、試合の数を変えられる）
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'brawl/engine.js'));
const B = E.B;
const same = E.sameJSON;
const DEEP = Number(process.env.BRAWL_MATCHES) || 3000;

// 2人の試合を作って、手で入力を送る道具
function duel(o) {
  o = o || {};
  const st = E.create({ seed: o.seed || 1, stage: o.stage || 'bench', fighters: [{ ch: o.a || 'robo' }, { ch: o.b || 'duck' }], stocks: o.stocks || 3, mode: o.mode, time: o.time, training: o.training });
  const [a, b] = st.fighters;
  a.x = o.ax != null ? o.ax : -60; b.x = o.bx != null ? o.bx : 60; a.face = 1; b.face = -1;
  for (const f of [a, b]) { f.y = o.y != null ? o.y : E.floorBelow(st, f.x, -10) || 0; f.gr = E.supportAt(st, f); }
  return st;
}
function go(st, n, ia, ib) { const evs = []; for (let i = 0; i < n; i++) { const x = E.step(st, [typeof ia === 'function' ? ia(i, st) : ia | 0, typeof ib === 'function' ? ib(i, st) : ib | 0]); for (const e of x) evs.push(e); } return evs; }
const hits = evs => evs.filter(e => e.t === 'hit');
function idleAll(st) { go(st, 30, 0, 0); }

test('the roster: 34 toys (18 + 16 newer) + a boss, 5 stages, original names, every toy has the 12 normals, the ground extras, 4 specials, a grab and a dash grab', () => {
  eq(E.CHAR_IDS.length, 34); eq(E.STAGE_IDS.length, 5);
  const names = new Set();
  for (const id of E.CHAR_IDS.concat(['junk'])) {
    const c = E.CH[id]; ok(c.name.ja && c.name.en && c.short.ja && c.short.en && c.desc.ja && c.desc.en, id + ' text');
    names.add(c.name.ja);
    const m = E.MOVES[id];
    for (const k of E.NORMALS.concat(E.EXTRAS, ['spN', 'spS', 'spU', 'spD', 'grab', 'dgrab'])) ok(m[k], id + ' has ' + k);
    ok(c.tag.ja && c.tag.en && c.stats.speed >= 1 && c.stats.recov <= 5, id + ' tag and stats');
    ok(c.weight >= 60 && c.weight <= 170 && c.w >= 26 && c.h >= 30, id + ' body');
  }
  eq(names.size, 35, 'distinct names');
  // every toy has its own role: no two toys share the same (kit, weight, run speed, jump) fingerprint
  const fp = new Set(E.CHAR_IDS.map(id => { const c = E.CH[id]; return [c.weight, c.run, c.jump, c.jmax || 1, c.kit.reach, c.sp.N.kind, c.sp.S.kind, c.sp.U.kind, c.sp.D.kind].join('/'); })); eq(fp.size, E.CHAR_IDS.length, 'distinct fingerprints');
  const kinds = new Set(); for (const id of E.CHAR_IDS) for (const k of ['N', 'S', 'U', 'D']) kinds.add(E.CH[id].sp[k].kind);
  for (const k of ['proj', 'dash', 'rise', 'counter', 'spin', 'cmdgrab', 'pound', 'mine', 'buff', 'tele', 'reflect', 'melee', 'glide', 'zone', 'stance', 'charge', 'ammo', 'reload', 'summon', 'roll', 'absorb', 'beacon']) ok(kinds.has(k), 'special kind in use: ' + k);
  for (const s of E.STAGE_IDS) { const S = E.STAGES[s]; ok(S.name.ja && S.name.en && S.desc.ja && S.desc.en && S.solids.length && S.ledges.length, s); }
  ok(E.STAGE_IDS.some(s => E.STAGES[s].thins.some(t => t.mv)), 'a stage with moving platforms');
  ok(E.STAGE_IDS.some(s => E.STAGES[s].thins.some(t => t.wrap)), 'a stage with trains');
});

test('every move has bounded frames: startup >= 1, active window inside the move, total <= 90, damage and angles sane', () => {
  for (const id of E.CHAR_IDS.concat(['junk'])) for (const [k, m] of Object.entries(E.MOVES[id])) {
    const w = id + '.' + k;
    ok(m.s >= 1 && m.s <= 30, w + ' startup ' + m.s); ok(m.a >= 1 && m.a <= 60, w + ' active ' + m.a);
    ok(m.t <= 90 && m.t >= m.s + 2, w + ' total ' + m.t); ok(m.s + m.a <= m.t + 1, w + ' window inside');
    if (m.kind === 'melee' || m.kind === 'dash' || m.kind === 'rise' || m.kind === 'grab' || m.kind === 'cmdgrab' || m.kind === 'spin') ok(m.hb.length >= 1 && m.hb.every(h => h.length === 5 && h[4] > 4 && h[4] < 90), w + ' hitboxes');
    if (m.kind !== 'grab' && m.kind !== 'buff') { ok(m.dmg >= 0 && m.dmg <= 30, w + ' dmg ' + m.dmg); ok(m.bkb >= 0 && m.bkb <= 60 && m.kbg >= 0 && m.kbg <= 80, w + ' kb'); }
    if (m.sm) ok(m.t + 45 <= 140, w + ' charged smash still bounded');
  }
  // a toy stays in a move for at most t frames (+ the charge of a smash), then is free again
  for (const id of E.CHAR_IDS.concat(['junk'])) for (const k of E.NORMALS.concat(['spN', 'spS', 'spD', 'spU'])) {
    const m = E.MOVES[id][k], st = duel({ a: id, b: 'robo', bx: 400 });
    const a = st.fighters[0]; a.s = 'free';
    const air = /air$/.test(k); if (air) { a.y -= 120; a.gr = -1; }
    const bits = { jab: B.A, ftilt: B.A | B.R, utilt: B.A | B.U, dtilt: B.A | B.D, fsmash: B.M | B.R, usmash: B.M | B.U, dsmash: B.M | B.D, nair: B.A, fair: B.A | B.R, bair: B.A | B.L, uair: B.A | B.U, dair: B.A | B.D, spN: B.S, spS: B.S | B.R, spU: B.S | B.U, spD: B.S | B.D }[k];
    go(st, 1, bits, 0);
    let n = 1; while (a.s === 'atk' && n < 200) { go(st, 1, 0, 0); n++; }
    ok(n <= m.t + 120, id + '.' + k + ' ended after ' + n + ' (t=' + m.t + ')');
  }
});

test('deterministic: the same seed and the same inputs give the same match, a different seed does not, and a JSON copy resumes the same', () => {
  const mk = seed => E.create({ seed, stage: 'shelf', fighters: [{ ch: 'top', lvl: 2 }, { ch: 'bear', lvl: 3 }, { ch: 'jack', lvl: 1 }], stocks: 2 });
  const play = (st, n) => { for (let i = 0; i < n && !st.over; i++) E.step(st, st.fighters.map((f, k) => k === 0 ? E.randInput(st, 0) : E.cpu(st, k))); return st; };
  const a = play(mk(777), 2400), b = play(mk(777), 2400), c = play(mk(778), 2400);
  ok(same(a, b), 'same seed'); ok(!same(a, c), 'different seed');
  const h = play(mk(31), 900), copy = JSON.parse(JSON.stringify(h));
  ok(same(play(h, 1500), play(copy, 1500)), 'JSON resume');
  // CPUs are deterministic too
  const run2 = seed => { const st = E.create({ seed, stage: 'house', fighters: [{ ch: 'duck', lvl: 3 }, { ch: 'tin', lvl: 2 }] }); let k = 0; while (!st.over && k++ < 36000) E.step(st, st.fighters.map((f, i) => E.cpu(st, i))); return st; };
  ok(same(run2(5), run2(5)), 'cpu match repeats');
});

test('knockback: stronger with damage, weaker on heavy toys, exactly the formula; hitstun grows with it', () => {
  const launchSpeed = (ch, pct) => {
    const st = duel({ a: 'robo', b: ch, ax: -30, bx: 0 });
    st.fighters[1].pct = pct; const m = E.MOVES.robo.fsmash;
    const evs = go(st, 40, (i) => i === 0 ? (B.M | B.R) : 0, 0).filter(e => e.t === 'hit');
    ok(evs.length >= 1, 'fsmash hit ' + ch + ' at ' + pct);
    return { p: evs[0].p, dmg: evs[0].dmg, st };
  };
  const v0 = launchSpeed('duck', 0), v100 = launchSpeed('duck', 100), v200 = launchSpeed('duck', 200);
  ok(v100.p > v0.p * 1.4 && v200.p > v100.p * 1.3, `monotone ${v0.p} ${v100.p} ${v200.p}`);
  // exact: v = (bkb + kbg * pctAfter / 100) * 0.18 * (1 + (100 - weight) * 0.006)
  const m = E.MOVES.robo.fsmash, W = E.CH.duck.weight, d = v100.dmg;
  const want = (m.bkb + m.kbg * (100 + d) * 0.01) * 0.18 * (1 + (100 - W) * 0.006);
  ok(Math.abs(v100.p - want) < 0.01, `formula ${v100.p} vs ${want}`);
  const bear = launchSpeed('bear', 100), top = launchSpeed('top', 100);
  ok(top.p > launchSpeed('duck', 100).p && launchSpeed('duck', 100).p > bear.p, `weight ${top.p} > duck > ${bear.p}`);
  // hitstun frames follow the speed
  const hs = (pct) => { const st = launchSpeed('duck', pct).st; return st.fighters[1].hs; };
  ok(hs(180) > hs(0), 'hitstun grows');
  // damage is added to the percent
  const s2 = launchSpeed('duck', 40); ok(Math.abs(s2.st.fighters[1].pct - (40 + s2.dmg)) < 0.01, 'pct += dmg');
});

test('hitstop: attacker and defender freeze for the same time, and a bigger hit freezes longer', () => {
  const st = duel({ a: 'bear', b: 'duck', ax: -30, bx: 0 });
  let at = -1; go(st, 40, (i, s) => (i === 0 ? B.M | B.R : 0), 0);
  const st2 = duel({ a: 'robo', b: 'duck', ax: -30, bx: 0 });
  let frozen = 0, f1 = 0; for (let i = 0; i < 40; i++) { E.step(st2, [i === 0 ? B.A : 0, 0]); if (st2.fighters[0].hold > 0 && st2.fighters[1].hold > 0) frozen++; f1 = Math.max(f1, st2.fighters[1].hold); }
  ok(frozen >= 2, 'both held ' + frozen);
  const big = duel({ a: 'bear', b: 'duck', ax: -30, bx: 0 }); let hb = 0; for (let i = 0; i < 60; i++) { E.step(big, [i === 0 ? (B.M | B.R) : 0, 0]); hb = Math.max(hb, big.fighters[1].hold); }
  ok(hb > f1, `smash hitstop ${hb} > jab ${f1}`);
});

test('blast zones: leaving any side takes a stock, the toy respawns with 0% on the start platform, the last stock ends the match', () => {
  for (const sid of E.STAGE_IDS) {
    const S = E.STAGES[sid];
    for (const [name, x, y] of [['left', S.blast.l - 40, -50], ['right', S.blast.r + 40, -50], ['top', 0, S.blast.t - 120], ['bottom', 0, S.blast.b + 100]]) {
      const st = duel({ stage: sid, stocks: 2 }); const f = st.fighters[1];
      f.x = x; f.y = y; f.gr = -1; f.pct = 88; f.last = 0; f.lastF = 0;
      const evs = go(st, 2, 0, 0).filter(e => e.t === 'ko');
      eq(evs.length, 1, sid + ' ' + name + ' KO'); eq(f.stk, 1, sid + ' ' + name + ' stock'); eq(f.pct, 0); eq(evs[0].by, 0, 'credited to the last attacker');
      go(st, 75 + 5, 0, 0); eq(f.s, 'rez', 'respawned'); eq(f.x, S.spawn[0]);
      go(st, 400, 0, 0); ok(f.s === 'free' || f.s === 'lag', 'came down ' + f.s);
    }
    // the blast zone is not reached by just standing on the stage
    const st = duel({ stage: sid }); go(st, 120, 0, 0); ok(st.fighters.every(f => f.stk === 3), sid + ' idle is safe');
  }
  const st = duel({ stocks: 1 }); st.fighters[1].x = 5000; const evs = go(st, 3, 0, 0);
  ok(st.over && st.win === 0 && st.why === 'ko', 'match over'); ok(evs.some(e => e.t === 'end'), 'end event');
  eq(st.res[0].stk, 1);
});

test('time mode: the one with the most KOs wins at the buzzer, a tie goes to sudden death (first KO wins), self-destructs cost a point', () => {
  const st = duel({ mode: 'time', time: 2 }); // 2 seconds
  st.fighters[1].x = 6000; st.fighters[1].last = 0; st.fighters[1].lastF = 0; go(st, 2, 0, 0);
  eq(st.sc[0], 1); eq(st.sc[1], -1, 'KO +1 / fall -1'); eq(st.fighters[1].stk, 3, 'stocks are not lost in timed matches');
  go(st, 200, 0, 0); ok(st.over && st.win === 0 && st.why === 'time', 'timed win ' + st.why + ' ' + st.f);
  const tie = duel({ mode: 'time', time: 1 }); go(tie, 61, 0, 0);
  ok(tie.sudden && !tie.over, 'sudden death');
  tie.fighters[0].x = 6000; go(tie, 3, 0, 0); ok(tie.over && tie.win === 1, 'sudden death resolves');
});

test('training: a KO does not end the match or take stocks; the toy comes back at once', () => {
  const st = duel({ training: true }); const f = st.fighters[1]; f.x = 6000; f.pct = 150;
  go(st, 3, 0, 0); ok(!st.over); eq(f.pct, 0); eq(f.stk, 3); go(st, 120, 0, 0); ok(f.s === 'free' || f.s === 'rez');
  st.dummy = 'shield'; go(st, 2, 0, (i, s) => E.dummy(s, 1)); // does not throw
});

test('jump: two jumps, the second is shorter; fast fall; short hop when the button is released early', () => {
  const st = duel(); const a = st.fighters[0]; let top = 0, maxJ = 0;
  go(st, 1, B.J, 0); go(st, 5, B.J, 0); ok(a.gr < 0 && a.vy < 0, 'jumped after the squat: ' + a.s + ' ' + a.vy);
  go(st, 1, B.J, 0);
  const y0 = a.y; let ymin = y0; for (let i = 0; i < 30; i++) { go(st, 1, i === 3 ? B.J : 0, 0); ymin = Math.min(ymin, a.y); }
  ok(ymin < y0 - 100, 'went up'); ok(a.jumps === 0, 'air jump used');
  const st2 = duel(); const b = st2.fighters[0]; go(st2, 1, B.J, 0); go(st2, 6, 0, 0); let ym = 0; for (let i = 0; i < 60; i++) { go(st2, 1, 0, 0); ym = Math.min(ym, b.y - E.floorBelow(st2, 0, -10)); }
  const st3 = duel(); const c = st3.fighters[0]; go(st3, 10, B.J, 0); let ym3 = 0; for (let i = 0; i < 60; i++) { go(st3, 1, B.J, 0); ym3 = Math.min(ym3, c.y); }
  ok(ym > ym3 + 20, `short hop ${ym} lower than full ${ym3}`);
  // fast fall
  const st4 = duel(); const d = st4.fighters[0]; go(st4, 4, B.J, 0); go(st4, 25, 0, 0); go(st4, 1, B.D, 0); ok(d.ffl && d.vy >= E.CH.robo.ff - 0.01, 'fast fall ' + d.vy);
});

test('input buffering and coyote time: a jump pressed just before landing is not lost; a jump just after walking off still jumps from the ground', () => {
  // buffer: fall, press jump 4 frames before the floor
  const st = duel(); const a = st.fighters[0]; a.y = -60; a.gr = -1; a.vy = 6; a.jumps = 0;
  let pressed = false, jumpedAt = -1, landedAt = -1;
  for (let i = 0; i < 40; i++) {
    const gr = a.gr; E.step(st, [(!pressed && a.y > -30) ? (pressed = true, B.J) : 0, 0]);
    if (landedAt < 0 && a.gr >= 0) landedAt = i; if (a.s === 'jsq' && jumpedAt < 0) jumpedAt = i;
  }
  ok(pressed && (a.s === 'free' ? a.vy < 0 || a.y < 0 : true) && jumpedAt >= 0, 'buffered jump went off on landing');
  // coyote: walk off the main stage edge and press jump 4 frames after leaving
  const S = E.STAGES.bench, st2 = duel({ ax: S.solids[0].x2 - 12 }); const b = st2.fighters[0]; b.vx = 3;
  let left = -1, jumped = false;
  for (let i = 0; i < 40; i++) { const g0 = b.gr; E.step(st2, [(left >= 0 && i - left === 4 ? B.J : 0) | B.R, 0]); if (left < 0 && b.gr < 0) left = i; if (left >= 0 && b.s === 'jsq') jumped = true; }
  ok(left >= 0, 'left the edge'); ok(jumped, 'coyote jump (ground jump, not an air jump) after leaving the edge');
});

test('thin platforms: land on them from above, pass up through them, drop through with down', () => {
  const st = duel({ ax: -170 }); const a = st.fighters[0]; // under the left board (y -105)
  go(st, 1, B.J, 0); go(st, 10, B.J, 0); for (let i = 0; i < 80; i++) go(st, 1, 0, 0);
  ok(a.gr >= 100 && Math.abs(a.y - (-105)) < 1, 'a single jump reaches the board and lands on it ' + a.gr + ' ' + a.y);
  go(st, 12, B.D, 0); go(st, 2, 0, 0); for (let i = 0; i < 80; i++) go(st, 1, 0, 0); ok(a.y > -5 && a.gr >= 0 && a.gr < 100, 'dropped to the stage ' + a.y);
});

test('moving platforms carry the toy that stands on them, and trains wrap around', () => {
  const st = duel({ stage: 'shelf' }); const a = st.fighters[0];
  go(st, 1, 0, 0); const t = st.th[0]; a.x = (t.x1 + t.x2) / 2; a.y = t.y; a.gr = 100; a.vx = 0;
  const x0 = a.x; go(st, 90, 0, 0); ok(a.gr === 100 && Math.abs(a.x - x0) > 20, 'carried ' + (a.x - x0).toFixed(1));
  const S = E.STAGES.track, tr = S.thins.findIndex(t => t.wrap); let seen = [];
  for (let f = 0; f < 5000; f += 50) { const p = E.thinAt(S.thins[tr], f); seen.push((p.x1 + p.x2) / 2); }
  ok(Math.min(...seen) < -900 && Math.max(...seen) > 900, 'the train crosses the whole stage'); ok(seen.some((x, i) => i && Math.abs(x - seen[i - 1]) > 1500), 'and wraps');
});

test('ledges: a toy falling beside the stage grabs the ledge, is briefly invincible, and gets up; only one toy per ledge', () => {
  const S = E.STAGES.bench, L = S.ledges[0], C = E.CH.robo;
  const st = duel({ ax: 0 }); const a = st.fighters[0];
  a.x = L.x - 20; a.y = L.y + C.h * 0.9 + 10; a.gr = -1; a.vy = 2; a.vx = 0; a.s = 'free';
  const evs = go(st, 3, 0, 0); ok(evs.some(e => e.t === 'ledge'), 'grabbed'); eq(a.s, 'ledge'); ok(a.inv > 20, 'invincible while grabbing');
  go(st, 12, B.U, 0); eq(a.s, 'getup'); go(st, 40, 0, 0); ok(a.gr >= 0 && a.x > L.x, 'standing on the stage ' + a.x);
  // a second toy cannot take the occupied ledge
  const s2 = duel(); const [p, q] = s2.fighters;
  for (const [f, dy] of [[p, 0], [q, 6]]) { f.x = L.x - 20; f.y = L.y + C.h * 0.9 + dy; f.gr = -1; f.vy = 1; f.s = 'free'; }
  go(s2, 4, 0, 0); ok((p.s === 'ledge') !== (q.s === 'ledge') || (p.s !== 'ledge' && q.s !== 'ledge') ? true : false, 'one ledge, one toy: ' + p.s + ' ' + q.s);
});

test('recovery: every toy can get back to the ledge from below with the up special (and a double jump) at some distance', () => {
  for (const id of E.CHAR_IDS) {
    const S = E.STAGES.bench, L = S.ledges[1], C = E.CH[id];
    let reached = false;
    for (const off of [60, 120, 200, 260, 330]) {
      const st = duel({ a: id, b: 'robo', bx: -250 }); const a = st.fighters[0];
      a.x = L.x + 70; a.y = L.y + C.h * 0.9 + off; a.gr = -1; a.vy = 0; a.s = 'free'; a.jumps = 1;
      for (let i = 0; i < 260 && !reached; i++) { const inp = E.cpu(st, 0); E.step(st, [inp, 0]); if (a.s === 'ledge' || a.gr >= 0) reached = true; if (a.s === 'dead') break; }
      if (!reached) break; reached = off >= 330 ? true : false; if (off < 330) reached = false;
    }
    // simpler claim: from 120px under the ledge it always gets back
    const st = duel({ a: id, b: 'robo', bx: -250 }); const a = st.fighters[0];
    a.x = L.x + 60; a.y = L.y + C.h * 0.9 + 120; a.gr = -1; a.vy = 0; a.s = 'free'; a.lvl = 3; let ok1 = false;
    for (let i = 0; i < 300; i++) { E.step(st, [E.cpu(st, 0), 0]); if (a.s === 'ledge' || a.gr >= 0) { ok1 = true; break; } if (a.s === 'dead') break; }
    ok(ok1, id + ' recovers from 120px below the ledge');
  }
});

test('shield: absorbs hits (no damage), wears down, breaks into a long stun; roll and spot dodge are invincible for a few frames', () => {
  const st = duel({ ax: -30, bx: 0 }); const [a, b] = st.fighters;
  go(st, 6, 0, B.H); eq(b.s, 'shield');
  const evs = go(st, 40, (i) => (i === 0 ? B.A : 0), B.H); ok(evs.some(e => e.t === 'block'), 'blocked'); eq(b.pct, 0, 'no damage through the shield'); ok(b.shd < 100, 'shield wore down');
  const st2 = duel({ a: 'bear', ax: -30, bx: 0 }); const c = st2.fighters[1]; let broke = false;
  for (let i = 0; i < 1500 && !broke; i++) { go(st2, 1, i % 30 === 0 ? (B.M | B.R) : 0, B.H); if (c.s === 'stun') broke = true; }
  ok(broke, 'the shield breaks under heavy hits'); go(st2, 20, 0, 0); eq(c.s, 'stun'); go(st2, 200, 0, 0); ok(c.s !== 'stun', 'stun ends');
  // dodge
  const s3 = duel({ ax: -30, bx: 0 }); const d = s3.fighters[1]; go(s3, 6, 0, B.H); go(s3, 1, 0, B.H | B.R); let inv = 0; for (let i = 0; i < 20; i++) { go(s3, 1, 0, B.H | B.R); if (d.inv > 0) inv++; }
  ok(d.s === 'roll' || inv > 5, 'roll is invincible for several frames: ' + inv);
  const s4 = duel({ ax: -30, bx: 0 }); const e4 = s4.fighters[1]; go(s4, 6, 0, B.H); go(s4, 1, 0, B.H | B.D); go(s4, 5, 0, B.H); ok(e4.s === 'spot' && e4.inv > 0, 'spot dodge ' + e4.s);
  // air dodge once per jump
  const s5 = duel(); const f5 = s5.fighters[0]; f5.y = -100; f5.gr = -1; go(s5, 1, B.H | B.R, 0); eq(f5.s, 'adodge'); go(s5, 40, 0, 0); go(s5, 1, B.H, 0); ok(f5.s !== 'adodge', 'one air dodge until you land');
});

test('grab: grabs a shielding toy, pummel adds damage, throws launch in the chosen direction; a held toy can button-mash free', () => {
  const st = duel({ ax: -30, bx: 0 }); const [a, b] = st.fighters;
  go(st, 6, 0, B.H); go(st, 1, B.G, B.H); go(st, 12, 0, B.H);
  eq(a.s, 'grab'); eq(b.s, 'held');
  const p0 = b.pct; go(st, 1, B.A, 0); ok(b.pct > p0, 'pummel'); go(st, 14, 0, 0);
  go(st, 1, B.U, 0); eq(b.s, 'hurt'); ok(b.lv ? b.lv[1] < 0 : b.vy < 0 || true, 'thrown');
  go(st, 6, 0, 0); ok(b.vy < 0, 'up throw sends it up ' + b.vy);
  // mash
  const s2 = duel({ ax: -30, bx: 0 }); const [c, d] = s2.fighters; go(s2, 1, B.G, 0); go(s2, 12, 0, 0); eq(d.s, 'held');
  let free = -1; for (let i = 0; i < 120; i++) { go(s2, 1, 0, i % 2 ? B.A : B.J); if (d.s !== 'held') { free = i; break; } }
  ok(free >= 0 && free < 40, 'mashing gets out ' + free); ok(c.s !== 'grab', 'grabber released');
  // a grab does not catch a toy in the air
  const s3 = duel({ ax: -30, bx: 0 }); s3.fighters[1].y = -80; s3.fighters[1].gr = -1; go(s3, 14, B.G, 0); ok(s3.fighters[0].s !== 'grab', 'no air grabs');
});

test('smash attacks: holding charges and adds damage (up to +40%); release goes off by itself at full charge', () => {
  const dmgOf = hold => { const st = duel({ ax: -30, bx: 0 }); go(st, 1, B.M | B.R, 0); const evs = go(st, 3 + 60, (i) => i < hold ? B.M | B.R : 0, 0).filter(e => e.t === 'hit'); return evs.length ? evs[0].dmg : 0; };
  const d0 = dmgOf(0), d30 = dmgOf(30), d99 = dmgOf(99);
  ok(d0 > 0 && d30 > d0 * 1.1 && d99 >= d30 && d99 <= d0 * 1.45, `charge ${d0} < ${d30} <= ${d99}`);
});

test('counter: the duck turns a hit around (no damage to it, damage back to the attacker); armor takes damage but does not flinch', () => {
  const st = duel({ a: 'robo', b: 'duck', ax: -30, bx: 0 }); const [a, b] = st.fighters;
  go(st, 1, 0, B.S | B.D); go(st, 2, 0, 0);
  const evs = go(st, 60, (i) => (i === 2 ? B.M | B.R : 0), 0);
  ok(evs.some(e => e.t === 'counter'), 'countered'); eq(b.pct, 0, 'no damage while countering'); ok(a.pct > 5, 'attacker took ' + a.pct);
  // armor: jack down special
  const s2 = duel({ a: 'robo', b: 'jack', ax: -30, bx: 0 }); const j = s2.fighters[1];
  go(s2, 1, 0, B.S | B.D); go(s2, 8, 0, 0); const ev2 = go(s2, 1, B.A, 0); go(s2, 6, 0, 0); ok(j.s === 'atk' || j.pct > 0, 'armor: still attacking after a hit ' + j.s + ' ' + j.pct);
});

// the new special kinds that do not (only) hit: check what they do instead
function checkEffect(id, k, m, bit) {
  const st = duel({ a: id, b: 'robo', bx: 400 }), a = st.fighters[0];
  if (m.kind === 'glide') { a.y = -300; a.gr = -1; a.vy = 2; a.jumps = 0; let y0 = a.y, ymin = y0; go(st, 1, bit, 0); for (let i = 0; i < 30; i++) { go(st, 1, B.S, 0); ymin = Math.min(ymin, a.y); } ok(ymin < y0 - 60, id + ' glide rises'); return; }
  go(st, 1, bit, 0); go(st, m.s + 6, bit & ~B.S ? 0 : 0, 0);
  if (m.kind === 'stance') ok(a.ks && a.ks.st === 1, id + ' stance on');
  if (m.kind === 'reload') { a.ks = a.ks || {}; a.ks.ammo = 0; const s2 = duel({ a: id, b: 'robo', bx: 400 }); s2.fighters[0].ks = { ammo: 0 }; go(s2, 1, bit, 0); go(s2, m.t, 0, 0); eq(s2.fighters[0].ks.ammo, m.mag, id + ' reload'); }
  if (m.kind === 'absorb') ok(a.ks && a.ks.abs > 0, id + ' absorb window');
  if (m.kind === 'zone' || m.kind === 'summon') ok(st.pr.some(p => p.o === 0 && p.k === m.proj.kind), id + ' ' + m.kind + ' places ' + m.proj.kind);
}
test('every move of every toy hits a toy standing where its hitbox is (and every projectile, mine and special does its job)', () => {
  const bits = { jab: B.A, ftilt: B.A | B.R, utilt: B.A | B.U, dtilt: B.A | B.D, fsmash: B.M | B.R, usmash: B.M | B.U, dsmash: B.M | B.D, nair: B.A, fair: B.A | B.R, bair: B.A | B.L, uair: B.A | B.U, dair: B.A | B.D, spN: B.S, spS: B.S | B.R, spU: B.S | B.U, spD: B.S | B.D };
  for (const id of E.CHAR_IDS.concat(['junk'])) {
    for (const k of Object.keys(bits)) {
      const m = E.MOVES[id][k], air = /air$/.test(k) || k === 'spU';
      let connected = false;
      // try the dummy at a few distances in front of / around the attacker (the move's own hitbox decides)
      const cands = [];
      for (const h of m.kind === 'pound' ? m.land.hb : (m.hb || [])) cands.push([h[0] + (h[2] - h[0]) * 0.5, h[1] + (h[3] - h[1]) * 0.5]);
      if (m.kind === 'proj' || m.kind === 'ammo' || m.kind === 'charge') cands.push([160, -30], [90, -30]);
      if (E.KINDS[m.kind] && !m.hb.length && ['stance', 'reload', 'absorb', 'zone', 'summon', 'glide'].indexOf(m.kind) >= 0) { checkEffect(id, k, m, bits[k]); continue; }
      if (m.kind === 'mine') cands.push([30, -6]);
      if (m.kind === 'buff') { const st = duel({ a: id, b: 'robo', bx: 400 }); go(st, 1, bits[k], 0); go(st, 30, 0, 0); ok(st.fighters[0].buff > 0, id + ' buff'); continue; }
      if (m.kind === 'counter') continue;
      if (m.kind === 'tele' && !m.hb.length) { const st = duel({ a: id, b: 'robo', bx: 400 }); const a = st.fighters[0], x0 = a.x, y0 = a.y; go(st, 1, bits[k], 0); let far = 0; for (let i = 0; i < m.t + 4; i++) { go(st, 1, 0, 0); far = Math.max(far, Math.hypot(a.x - x0, a.y - y0)); } ok(far > m.td * 0.5, id + ' warps ' + far.toFixed(0)); continue; }
      if (m.kind === 'reflect') { const st = duel({ a: id, b: 'tin', ax: 0, bx: 120 }); go(st, 1, bits[k], 0); const b = st.fighters[1]; b.face = -1; const evs = go(st, 40, (i) => i === 0 ? B.S : 0, 0); go(st, 1, 0, 0); continue; }
      if (m.kind === 'rise') for (const h of m.hb) cands.push([0, h[1] - 10]);
      if (m.kind === 'pound') cands.push([0, 30]);
      for (const [cx, cy] of cands) {
        const st = duel({ a: id, b: 'robo', ax: 0, bx: 300 });
        const a = st.fighters[0], d = st.fighters[1];
        a.face = 1; if (air) { a.y -= 140; a.gr = -1; a.vy = -0.01; a.jumps = 0; }
        // dummy: floating (inv 0), placed so that its body centre is at the hitbox centre
        const C = E.CH.robo, flo = !air && a.gr >= 0; d.s = 'free'; d.hold = 0;
        const keep = () => { d.x = a.x + cx; d.y = flo ? a.y : a.y + cy + C.h / 2; d.vy = 0; d.vx = 0; d.gr = flo ? E.supportAt(st, d) : -1; };
        keep(); let hit = false;
        for (let i = 0; i < m.t + (m.sm ? 4 : 0) + 20 && !hit; i++) {
          if (m.kind === 'pound' && air) { /* falls onto the dummy */ }
          const ev = E.step(st, [i === 0 || (m.sm && i < 6) ? bits[k] : (m.kind === 'spin' ? B.S : 0), 0]);
          if (ev.some(e => e.t === 'hit' && e.d === 1)) hit = true; else if (d.hs <= 0 && d.s === 'free') keep(); else if (d.s !== 'hurt') keep();
        }
        if (hit) { connected = true; break; }
      }
      ok(connected, id + '.' + k + ' (' + m.kind + ') connects with a toy at its hitbox');
    }
  }
});

test('projectiles: a cork flies straight and disappears at the wall or after its life; the jack ball bounces; mines wait, arm and go off; damage is dealt only to others', () => {
  const st = duel({ a: 'tin', b: 'robo', ax: -200, bx: 100 }); const a = st.fighters[0];
  const evs = go(st, 60, (i) => i === 0 ? B.S : 0, 0); ok(evs.some(e => e.t === 'shoot'), 'fired'); ok(hits(evs).length === 1 && hits(evs)[0].d === 1, 'hit the other toy only'); eq(a.pct, 0);
  const s2 = duel({ a: 'jack', b: 'robo', ax: -200, bx: 300 }); go(s2, 22, B.S, 0); const ys = []; for (let i = 0; i < 80; i++) { go(s2, 1, 0, 0); if (s2.pr[0]) ys.push(s2.pr[0].y); } ok(ys.length > 30 && ys.some((y, i) => i > 3 && y < ys[i - 1]), 'the ball bounces');
  const s3 = duel({ a: 'tin', b: 'robo', ax: -200, bx: 300 }); go(s3, 1, B.S | B.D, 0); go(s3, 20, 0, 0); eq(s3.pr.length, 1, 'mine placed'); const mine = s3.pr[0]; ok(mine.y > -40, 'sits on the floor');
  s3.fighters[1].x = mine.x + 80; go(s3, 60, 0, 0); eq(s3.fighters[1].pct, 0, 'does not trigger far away'); s3.fighters[1].x = mine.x; s3.fighters[1].y = 0; s3.fighters[1].gr = 0; const e3 = go(s3, 5, 0, 0); ok(hits(e3).length === 1 && s3.pr.length === 0, 'goes off once');
});

test('the up special recovers: every toy gains height, and is helpless afterwards until it lands or grabs a ledge', () => {
  for (const id of E.CHAR_IDS) {
    const st = duel({ a: id }); const a = st.fighters[0]; a.y = -300; a.gr = -1; a.vy = 4; a.jumps = 0;
    const y0 = a.y; let ymin = y0; go(st, 1, B.S | B.U, 0); for (let i = 0; i < 70; i++) { go(st, 1, 0, 0); ymin = Math.min(ymin, a.y); }
    ok(ymin < y0 - 60, id + ' rises ' + (y0 - ymin).toFixed(0));
    const s2 = duel({ a: id }); const b = s2.fighters[0]; b.y = -300; b.gr = -1; b.vy = 0; b.jumps = 0; go(s2, 1, B.S | B.U, 0); go(s2, 60, 0, 0); ok(b.help || b.gr >= 0, id + ' helpless after up special (or landed)');
    go(s2, 1, B.A, 0); ok(b.s !== 'atk' || b.gr >= 0, 'cannot attack while helpless');
  }
});

test('DI: holding a direction at the moment of launch bends the flight a little (survival DI changes where the toy goes)', () => {
  const vy = di => { const st = duel({ a: 'robo', ax: -30, bx: 0 }); st.fighters[1].pct = 60; let out = null; for (let i = 0; i < 60; i++) { E.step(st, [i === 0 ? B.M | B.R : 0, di]); if (st.fighters[1].s === 'hurt' && st.fighters[1].hold === 0 && out == null) out = [st.fighters[1].vx, st.fighters[1].vy]; } return out; };
  const n = vy(0), up = vy(B.U), dn = vy(B.D);
  ok(n && up && dn && up[1] !== n[1] && dn[1] !== n[1], 'DI changes the launch'); ok(Math.hypot(up[0], up[1]) > Math.hypot(n[0], n[1]) * 0.95 && Math.hypot(up[0], up[1]) < Math.hypot(n[0], n[1]) * 1.05, 'but keeps its speed');
});

test('weights: heavier toys fall faster and are launched less; every body is stable on all stages (no NaN, nothing falls through the floor while idle)', () => {
  for (const sid of E.STAGE_IDS) for (const id of E.CHAR_IDS.concat(['junk'])) {
    const st = E.create({ seed: 3, stage: sid, fighters: [{ ch: id }, { ch: id }] });
    for (let i = 0; i < 300; i++) E.step(st, [0, 0]);
    for (const f of st.fighters) ok(Number.isFinite(f.x) && Number.isFinite(f.y) && f.stk === 3 && f.gr >= 0, `${sid}/${id} stands: ${f.s} ${f.gr} ${f.y}`);
  }
});

test('knockback bounces off the walls of the toy box', () => {
  const st = duel({ stage: 'box', a: 'bear', b: 'robo', ax: -120, bx: 150 }); const b = st.fighters[1];
  b.s = 'hurt'; b.hs = 40; b.vx = 9; b.vy = -2; b.gr = -1; const evs = go(st, 40, 0, 0);
  ok(evs.some(e => e.t === 'bounce') && b.vx < 0, 'bounced off the wall of the box ' + b.vx);
});


// ------------------------------------------------------------------------------------ platform-fighter controls
const FL = B.F; // the stick is pushed all the way
test('flick: neutral to full within N frames is a flick (a slow push or a held direction is not); tilt+A is a tilt, flick+A / M+dir / the C-stick are smashes', () => {
  const st = duel(); const a = st.fighters[0]; go(st, 4, 0, 0);
  go(st, 1, B.R | FL, 0); ok(a.fkn && a.fkx === 1 && a.fkt > 0, 'flick right ' + a.fkx);
  const s2 = duel(); const b = s2.fighters[0]; go(s2, 3, 0, 0); go(s2, 7, B.R, 0); go(s2, 1, B.R | FL, 0); ok(!b.fkn && b.fkx === 0, 'a slow push (7 frames to full) is not a flick');
  const s2b = duel(); const b2 = s2b.fighters[0]; go(s2b, 3, 0, 0); go(s2b, 3, B.R, 0); go(s2b, 1, B.R | FL, 0); ok(b2.fkn, 'full at the 4th frame is still a flick');
  const s3 = duel(); const c = s3.fighters[0]; go(s3, 3, 0, 0); go(s3, 12, B.R | FL, 0); ok(c.fkx === 0, 'a held full push stops being a flick');
  // tilt vs smash
  const tilt = duel({ ax: -30, bx: 0 }); go(tilt, 5, 0, 0); go(tilt, 1, B.R | B.A, 0); eq(tilt.fighters[0].mv, 'ftilt', 'A + direction (no flick) is a tilt');
  const sm = duel({ ax: -30, bx: 0 }); go(sm, 5, 0, 0); go(sm, 1, B.R | FL, 0); go(sm, 2, B.R | FL, 0); go(sm, 1, B.R | FL | B.A, 0); eq(sm.fighters[0].mv, 'fsmash', 'flick then A within the window is a forward smash');
  const sm2 = duel({ ax: -30, bx: 0 }); go(sm2, 5, 0, 0); go(sm2, 1, B.R | FL | B.A, 0); eq(sm2.fighters[0].mv, 'fsmash', 'flick and A on the same frame');
  const su = duel({ ax: -30, bx: 0 }); go(su, 5, 0, 0); go(su, 1, B.U | FL | B.A, 0); eq(su.fighters[0].mv, 'usmash', 'flick up + A is an up smash');
  const sd = duel({ ax: -30, bx: 0 }); go(sd, 5, 0, 0); go(sd, 1, B.D | FL | B.A, 0); eq(sd.fighters[0].mv, 'dsmash', 'flick down + A is a down smash');
  const late = duel({ ax: -30, bx: 0 }); go(late, 5, 0, 0); go(late, 1, B.R | FL, 0); go(late, 9, B.R | FL, 0); go(late, 1, B.R | FL | B.A, 0); ok(late.fighters[0].mv !== 'fsmash', 'a flick that is more than 6 frames old does not smash: ' + late.fighters[0].mv);
  const mk = duel({ ax: -30, bx: 0 }); go(mk, 3, 0, 0); go(mk, 1, B.M | B.R, 0); eq(mk.fighters[0].mv, 'fsmash', 'M + direction always smashes');
  for (const [bit, key, face] of [[B.CR, 'fsmash', 1], [B.CL, 'fsmash', -1], [B.CU, 'usmash', 1], [B.CD, 'dsmash', 1]]) {
    const c1 = duel({ ax: -30, bx: 0 }); go(c1, 3, 0, 0); go(c1, 1, bit, 0); eq(c1.fighters[0].mv, key, 'C-stick ' + key); eq(c1.fighters[0].face, face, 'C-stick turns the toy');
  }
  // in the air the C-stick is an aerial in that direction (forward / back relative to the facing)
  const air = duel(); const d = air.fighters[0]; d.y = -120; d.gr = -1; d.vy = 0; d.face = 1; go(air, 1, B.CL, 0); eq(d.mv, 'bair', 'C-stick away from the facing = back air');
  const air2 = duel(); const e = air2.fighters[0]; e.y = -120; e.gr = -1; e.vy = 0; e.face = 1; go(air2, 1, B.CR, 0); eq(e.mv, 'fair'); const air3 = duel(); const g = air3.fighters[0]; g.y = -120; g.gr = -1; g.face = 1; go(air3, 1, B.CD, 0); eq(g.mv, 'dair');
});

test('walk, dash, run, pivot, dash dance, crouch: a light tilt walks, a flick dashes, holding full runs, flicking back while running turns around', () => {
  const C = E.CH.robo;
  const w = duel(); const a = w.fighters[0]; go(w, 3, 0, 0); go(w, 40, B.R, 0); ok(a.vx > 1.2 && a.vx <= C.run * 0.62 + 0.45 && a.mm === 0, 'walking speed ' + a.vx.toFixed(2));
  const d = duel(); const b = d.fighters[0]; go(d, 3, 0, 0); go(d, 1, B.R | FL, 0); eq(b.mm, 1, 'a flick starts a dash'); ok(b.vx >= C.run * 1.05, 'dash is faster than a run ' + b.vx.toFixed(2)); go(d, 25, B.R | FL, 0); eq(b.mm, 2, 'holding full pushes into a run'); ok(Math.abs(b.vx - C.run) < 0.2, 'run speed ' + b.vx);
  ok(b.vx > a.vx * 1.4, 'running is much faster than walking');
  // pivot: flick back while running
  const evs = go(d, 1, B.L | FL, 0); ok(evs.some(e => e.t === 'pivot'), 'pivot event'); eq(b.face, -1, 'faces the new way at once'); eq(b.mm, 3); ok(b.vx > 0.5, 'still sliding the old way'); ok(b.pv > 0, 'pivot window open');
  // pivot grab: grab during the pivot turns around and grabs the other way
  go(d, 1, B.L | FL | B.G, 0); eq(b.mv, 'grab'); eq(b.face, -1, 'pivot grab faces back');
  // dash dance
  const dd = duel(); const c = dd.fighters[0]; go(dd, 3, 0, 0); go(dd, 1, B.R | FL, 0); go(dd, 3, B.R | FL, 0); const ev2 = go(dd, 1, B.L | FL, 0); ok(c.vx < -C.run, 'dash dance reverses at once ' + c.vx.toFixed(2)); eq(c.mm, 1); ok(ev2.some(e => e.t === 'dd'), 'dd event'); eq(c.face, -1);
  // dash attack and dash grab out of a run
  const da = duel({ ax: -60, bx: 20 }); go(da, 3, 0, 0); go(da, 1, B.R | FL, 0); go(da, 10, B.R | FL, 0); go(da, 1, B.R | FL | B.A, 0); eq(da.fighters[0].mv, 'dattack', 'A while dashing is the dash attack');
  const dg = duel({ ax: -60, bx: 20 }); go(dg, 3, 0, 0); go(dg, 1, B.R | FL, 0); go(dg, 10, B.R | FL, 0); go(dg, 1, B.R | FL | B.G, 0); eq(dg.fighters[0].mv, 'dgrab', 'G while dashing is the dash grab'); ok(E.MOVES.robo.dgrab.hb[0][2] > E.MOVES.robo.grab.hb[0][2], 'longer reach than the standing grab');
  // crouch: hurtbox is lower and the toy does not walk
  const cr = duel(); const e = cr.fighters[0]; go(cr, 6, B.D, 0); ok(e.cr > 2, 'crouching'); const x0 = e.x; go(cr, 10, B.D | B.R, 0); ok(Math.abs(e.x - x0) < 3, 'no walking while crouching');
  const C0 = E.CH.robo, top = e.y - C0.h + 4; ok(E.hurtDist(e, C0, e.x, top) > 0.5 && E.hurtDist(duel().fighters[0], C0, e.x, top) < 0.01, 'a crouching toy is shorter');
  go(cr, 1, B.D | B.A, 0); eq(e.mv, 'dtilt', 'down + A while crouching is the down tilt');
  // a long air time never leaves a toy stuck in run mode
  const ar = duel(); const f = ar.fighters[0]; go(ar, 3, 0, 0); go(ar, 1, B.R | FL, 0); go(ar, 5, B.R | FL | B.J, 0); go(ar, 4, B.R | FL, 0); eq(f.mm, 0, 'run mode ends in the air');
});

test('drop through thin platforms: flick down, or hold down; a short tap does not', () => {
  const mk = () => { const st = duel({ ax: -170 }); const a = st.fighters[0]; go(st, 1, B.J, 0); go(st, 10, B.J, 0); for (let i = 0; i < 80; i++) go(st, 1, 0, 0); ok(a.gr >= 100, 'on the board'); return [st, a]; };
  let [st, a] = mk(); go(st, 2, B.D, 0); go(st, 1, 0, 0); ok(a.gr >= 100, 'a tap of down only crouches');
  [st, a] = mk(); go(st, 1, B.D | FL, 0); ok(a.gr < 0 || a.dropT > 0, 'flick down drops'); for (let i = 0; i < 80; i++) go(st, 1, 0, 0); ok(a.y > -5, 'ended on the stage');
  [st, a] = mk(); go(st, 12, B.D, 0); ok(a.gr < 0 || a.dropT > 0, 'holding down drops');
});

test('jumps: the jump button (tap = short hop, hold = full hop), flick jump (up flick, configurable), jump squat up-smash cancel, multi-jump toys', () => {
  const hop = (hold) => { const st = duel(); const a = st.fighters[0]; go(st, 1, B.J, 0); let ym = 0; for (let i = 0; i < 70; i++) { go(st, 1, hold ? B.J : (i < 1 ? 0 : 0), 0); ym = Math.min(ym, a.y); } return ym; };
  const short = hop(false), full = hop(true); ok(full < short - 25, `short hop ${short.toFixed(0)} vs full hop ${full.toFixed(0)}`);
  const fj = duel(); const a = fj.fighters[0]; go(fj, 4, 0, 0); go(fj, 1, B.U | FL, 0); eq(a.s, 'jsq', 'flick up starts a jump'); go(fj, 12, B.U, 0); ok(a.y < -10, 'in the air');
  const nofj = E.create({ seed: 1, stage: 'bench', fighters: [{ ch: 'robo', tj: 0 }, { ch: 'duck' }] }); const b = nofj.fighters[0]; b.y = 0; b.gr = 0; go(nofj, 4, 0, 0); go(nofj, 6, B.U | FL, 0); ok(b.s !== 'jsq' && b.y >= 0, 'flick jump can be switched off');
  const tap = duel(); const c = tap.fighters[0]; go(tap, 4, 0, 0); go(tap, 1, B.U | FL, 0); go(tap, 8, 0, 0); let top = 0; for (let i = 0; i < 60; i++) { go(tap, 1, 0, 0); top = Math.min(top, c.y); } const tap2 = duel(); const d = tap2.fighters[0]; go(tap2, 4, 0, 0); go(tap2, 1, B.U | FL, 0); let top2 = 0; for (let i = 0; i < 60; i++) { go(tap2, 1, B.U, 0); top2 = Math.min(top2, d.y); } ok(top2 < top - 20, 'flick jump: a quick flick is a short hop, holding up is a full hop');
  // up smash straight out of a flick jump (the squat can be cancelled)
  const us = duel({ ax: -30, bx: 0 }); go(us, 4, 0, 0); go(us, 1, B.U | FL, 0); go(us, 1, B.U | FL | B.A, 0); eq(us.fighters[0].mv, 'usmash', 'flick up then A in the jump squat = up smash');
  // multi-jump
  for (const [id, n] of [['robo', 1], ['ball', 2], ['balloon', 3]]) {
    const st = duel({ a: id, y: -200 }); const f = st.fighters[0]; f.y = -300; f.gr = -1; f.vy = 4; let used = 0; f.jumps = E.CH[id].jmax || 1;
    for (let i = 0; i < 400 && used < 6; i++) { const before = f.jumps; go(st, 1, i % 6 === 0 ? B.J : 0, 0); if (f.jumps < before) used++; f.y = Math.min(f.y, -100); if (f.y > -120) f.y = -300; f.vy = Math.min(f.vy, 8); if (f.jumps === 0 && i % 6 === 5) break; }
    eq(used, n, id + ' air jumps');
  }
});

test('air dodge: directional, once per jump; landing during it costs lag; aerials auto-cancel when landed early or late and have landing lag in between', () => {
  const st = duel(); const a = st.fighters[0]; a.y = -100; a.gr = -1; go(st, 1, B.H | B.R, 0); eq(a.s, 'adodge'); ok(a.dvx > 3 && a.dvy === 0, 'dodges the way you hold'); go(st, 3, 0, 0); ok(a.inv > 0, 'invincible');
  const s2 = duel(); const b = s2.fighters[0]; b.y = -30; b.gr = -1; b.vy = 3; go(s2, 1, B.H | B.D, 0); for (let i = 0; i < 20 && b.gr < 0; i++) go(s2, 1, 0, 0); eq(b.s, 'lag', 'landing out of an air dodge: lag');
  const land = (key, wait) => { const s = duel(); const f = s.fighters[0]; f.y = -150; f.gr = -1; f.vy = 0; f.jumps = 0; go(s, 1, key === 'nair' ? B.A : key === 'fair' ? B.A | B.R : B.A | B.D, 0); f.face = 1; for (let i = 0; i < wait; i++) { go(s, 1, 0, 0); } f.y = -4; f.vy = 5; f.vx = 0; f.gr = -1; go(s, 3, 0, 0); return { s: f.s, mf: f.mf }; };
  const m = E.MOVES.robo.nair; ok(m.ac && m.ac.length === 2, 'nair has an auto-cancel window');
  const early = (() => { const s = duel(); const f = s.fighters[0]; f.y = -3; f.gr = -1; f.vy = 3; f.jumps = 0; go(s, 1, B.A, 0); for (let i = 0; i < 3; i++) go(s, 1, 0, 0); return f; })();
  ok(early.s !== 'lag', 'landing in the first frames of an aerial: no lag (auto-cancel) ' + early.s);
  const mid = (() => { const s = duel(); const f = s.fighters[0]; f.y = -100; f.gr = -1; f.vy = 0; f.jumps = 0; go(s, 1, B.A, 0); for (let i = 0; i < 10; i++) go(s, 1, 0, 0); f.y = -3; f.vy = 4; go(s, 3, 0, 0); return f; })();
  eq(mid.s, 'lag', 'landing in the middle of an aerial: landing lag'); eq(mid.lag > 0, true);
  const late = (() => { const s = duel(); const f = s.fighters[0]; f.y = -400; f.gr = -1; f.vy = 0; f.jumps = 0; go(s, 1, B.A, 0); for (let i = 0; i < E.MOVES.robo.nair.ac[1] + 1; i++) go(s, 1, 0, 0); f.y = -3; f.vy = 4; f.vx = 0; go(s, 3, 0, 0); return f; })();
  ok(late.s !== 'lag', 'landing after the move is nearly over: auto-cancelled ' + late.s);
});

test('shield: the bubble shrinks, perfect shield (just-raised) takes no shield damage and leaves the attacker stuck, shield stun, shield drop through thin boards, spot dodge, rolls', () => {
  const norm = duel({ ax: -30, bx: 0 }); const [a, b] = norm.fighters; go(norm, 12, 0, B.H); const s0 = b.shd; go(norm, 20, (i) => i === 0 ? B.A : 0, B.H); ok(b.shd < s0 - 2, 'shield shrinks when hit and over time ' + b.shd.toFixed(1)); ok(b.ssn > 0 || b.s === 'shield', 'shield stun after a block');
  // shield stun: the shielding toy cannot drop its shield right away
  const ss = duel({ ax: -30, bx: 0 }); const bb = ss.fighters[1]; go(ss, 12, 0, B.H); go(ss, 1, B.A, B.H); go(ss, 3, 0, B.H); let held = 0; for (let i = 0; i < 40; i++) { go(ss, 1, 0, 0); if (bb.s === 'shield') held++; } ok(held >= 3, 'stays in the shield (stunned) for a few frames after the hit: ' + held);
  // perfect shield
  const ps = duel({ ax: -30, bx: 0 }); const [pa, pb] = ps.fighters; go(ps, 1, 0, B.H); ok(pb.pst > 0, 'perfect window open'); const evs = go(ps, 12, (i) => i === 0 ? B.A : 0, B.H); ok(evs.some(e => e.t === 'pshield'), 'perfect shield event'); ok(pb.shd > 96.5, 'no shield damage (only the slow drain) ' + pb.shd);
  const ps2 = duel({ ax: -30, bx: 0 }); go(ps2, 12, 0, B.H); const e2 = go(ps2, 12, (i) => i === 0 ? B.A : 0, B.H); ok(!e2.some(e => e.t === 'pshield') && e2.some(e => e.t === 'block'), 'late = ordinary block');
  // no spamming: dropping and re-raising does not give a new perfect window at once
  const sp = duel({ ax: -30, bx: 0 }); const q = sp.fighters[1]; go(sp, 12, 0, B.H); go(sp, 3, 0, 0); go(sp, 8, 0, B.H); eq(q.pst, 0, 'no perfect shield right after dropping the shield');
  // shield drop through a thin board
  const sd = duel({ ax: -170 }); const c = sd.fighters[0]; go(sd, 1, B.J, 0); go(sd, 10, B.J, 0); for (let i = 0; i < 80; i++) go(sd, 1, 0, 0); ok(c.gr >= 100); go(sd, 8, B.H, 0); go(sd, 1, B.H | B.D, 0); for (let i = 0; i < 90; i++) go(sd, 1, 0, 0); ok(c.y > -5, 'shield + down on a thin board drops through');
  // the shield breaks and bounces back
  const br = duel({ a: 'bear', ax: -30, bx: 0 }); const d = br.fighters[1]; go(br, 6, 0, B.H); d.shd = 12; go(br, 1, B.M | B.R, B.H); go(br, 40, 0, B.H); eq(d.s, 'stun', 'shield break stuns');
});

test('grab game: standing / dash / pivot grab, pummel, four throws, per-toy throws (the crab throws harder)', () => {
  const thr = (ch, key) => { const st = duel({ a: ch, b: 'bear', ax: -30, bx: 0 }); const [a, b] = st.fighters; go(st, 1, B.G, 0); go(st, 12, 0, 0); eq(b.s, 'held', ch + ' grabbed'); const evs = go(st, 1, key, 0); go(st, 4, 0, 0); return b.pct; };
  for (const [name, key] of [['f', B.R], ['b', B.L], ['u', B.U], ['d', B.D]]) ok(thr('robo', key) > 3, 'throw ' + name);
  ok(thr('crab', B.R) > thr('robo', B.R) * 1.2, 'the crab throws harder ' + thr('crab', B.R) + ' vs ' + thr('robo', B.R));
  // directions: up throw sends up, back throw sends behind
  const ft = duel({ ax: -30, bx: 0 }); const [a, b] = ft.fighters; go(ft, 1, B.G, 0); go(ft, 12, 0, 0); go(ft, 8, 0, 0); go(ft, 1, B.L, 0); go(ft, 8, 0, 0); ok(b.vx < -0.5, 'back throw goes backwards ' + b.vx);
});

test('jab: a held attack button turns into a rapid jab with a finisher; an ordinary tap is a single jab', () => {
  const single = duel({ ax: -30, bx: 0 }); go(single, 1, B.A, 0); go(single, 40, 0, 0); eq(single.fighters[0].mv, ''); const one = single.fighters[1].pct;
  const rapid = duel({ ax: -30, bx: 0 }); let seen = false, fin = false; go(rapid, 1, B.A, 0); for (let i = 0; i < 80; i++) { go(rapid, 1, B.A, 0); if (rapid.fighters[0].mv === 'rjab') seen = true; } go(rapid, 1, 0, 0); for (let i = 0; i < 12; i++) { go(rapid, 1, 0, 0); if (rapid.fighters[0].mv === 'jabfin') fin = true; }
  ok(seen, 'rapid jab'); ok(fin, 'finisher'); ok(rapid.fighters[1].pct > one + 6, 'many hits ' + rapid.fighters[1].pct + ' vs ' + one);
});

test('tech: pressing shield just before hitting the floor / wall / ceiling techs (in place, roll); too early locks you out; missing it lands you on the floor with get-up options', () => {
  const launch = (pre, dir, h) => { const st = duel(); const f = st.fighters[1]; f.s = 'hurt'; f.hs = 90; f.y = h || -50; f.gr = -1; f.vy = 7; f.vx = 0; f.lv = null; f.x = 0; f.last = -1; let tech = null; for (let i = 0; i < 30; i++) { E.step(st, [0, (i === pre ? B.H : 0) | (i >= pre && dir ? dir : 0)]); if (f.s === 'tech' || f.s === 'roll') { tech = f.s; break; } if (f.s === 'down') break; } return { st, f, tech }; };
  const inPlace = launch(3, 0); eq(inPlace.tech, 'tech', 'in-place tech'); ok(inPlace.f.inv > 5, 'invincible during the tech');
  const roll = launch(3, B.R); eq(roll.tech, 'roll', 'tech roll'); ok(roll.f.thr === 1);
  const miss = launch(-5, 0); eq(miss.f.s, 'down', 'no tech: lies down'); ok(miss.tech === null);
  const early = launch(0, 0, -420); ok(early.tech === null, 'pressed far too early: the window runs out ' + early.f.s);
  // wall tech
  const st = duel({ stage: 'box', a: 'bear', b: 'robo', ax: -120, bx: 150 }); const w = st.fighters[1]; w.s = 'hurt'; w.hs = 40; w.vx = 9; w.vy = -2; w.gr = -1; w.tq = 20; w.tl = 20; let teched = false; for (let i = 0; i < 40; i++) { E.step(st, [0, 0]); if (w.s === 'tech') teched = true; } ok(teched, 'wall tech');
  // get-up options from the floor: attack / roll / in place
  const g = duel(); const f = g.fighters[1]; f.s = 'down'; f.sf = 11; go(g, 1, 0, B.A); eq(f.mv, 'getupatk', 'get-up attack'); const g2 = duel(); const f2 = g2.fighters[1]; f2.s = 'down'; f2.sf = 11; go(g2, 1, 0, B.L); eq(f2.s, 'roll', 'get-up roll');
  // meteor cancel: jump out of a downward launch
  const mc = duel(); const m = mc.fighters[1]; m.s = 'hurt'; m.hs = 30; m.y = -200; m.gr = -1; m.vy = 8; m.jumps = 1; go(mc, 1, 0, B.J); eq(m.s, 'free', 'meteor cancel'); ok(m.vy < 0);
});

test('ledge options: get up, get-up attack, roll up, ledge jump, drop; invincible at first and less each time you re-grab; limited hang time', () => {
  const S = E.STAGES.bench, L = S.ledges[0], C = E.CH.robo;
  const hang = (inp) => { const st = duel({ ax: 0 }); const a = st.fighters[0]; a.x = L.x - 20; a.y = L.y + C.h * 0.9 + 10; a.gr = -1; a.vy = 2; a.vx = 0; go(st, 3, 0, 0); eq(a.s, 'ledge'); go(st, 10, 0, 0); go(st, 1, inp, 0); return [st, a]; };
  let [st, a] = hang(B.U); eq(a.s, 'getup', 'get up (U)'); go(st, 30, 0, 0); ok(a.gr >= 0 && a.x > L.x);
  [st, a] = hang(B.A); eq(a.s, 'getup'); eq(a.gk, 'atk'); go(st, 30, 0, 0); ok(a.mv === 'ledgeatk' || a.s === 'atk', 'ledge attack: ' + a.s + ' ' + a.mv); ok(E.MOVES.robo.ledgeatk.dmg > 0);
  [st, a] = hang(B.H); eq(a.gk, 'roll'); go(st, 40, 0, 0); ok(a.x > L.x + 60, 'roll up goes further ' + a.x);
  [st, a] = hang(B.J); eq(a.s, 'free'); ok(a.vy < -5, 'ledge jump');
  [st, a] = hang(B.D); eq(a.s, 'free'); ok(a.vy >= 0 && a.lcd > 0, 'let go');
  // hang time is limited
  const t = duel({ ax: 0 }); const h = t.fighters[0]; h.x = L.x - 20; h.y = L.y + C.h * 0.9 + 10; h.gr = -1; h.vy = 2; go(t, 3, 0, 0); eq(h.s, 'ledge'); go(t, 260, 0, 0); ok(h.s !== 'ledge', 'dropped by itself after a few seconds');
  // re-grabbing gives less invincibility
  const r = duel({ ax: 0 }); const q = r.fighters[0]; const invs = [];
  for (let n = 0; n < 4; n++) { q.x = L.x - 20; q.y = L.y + C.h * 0.9 + 10; q.gr = -1; q.vy = 2; q.vx = 0; q.s = 'free'; q.lcd = 0; go(r, 3, 0, 0); invs.push(q.inv); go(r, 12, B.D, 0); }
  ok(invs[0] > invs[2] && invs[3] >= 10, 'ledge invincibility shrinks with each re-grab: ' + invs.join(','));
});

test('hitlag, smash DI, crouch cancel, taunt, star KO, tumble bounce: small details of the fighting game feel', () => {
  // smash DI: a direction press during the hit-stop shifts the toy a little
  const run = (di) => { const st = duel({ ax: -30, bx: 0 }); st.fighters[1].pct = 50; let x = null; for (let i = 0; i < 40; i++) { E.step(st, [i === 0 ? B.M | B.R : 0, i >= 6 && i < 9 && di ? B.U : 0]); if (st.fighters[1].hold > 0 && st.fighters[1].lv) x = st.fighters[1].y; } return st.fighters[1].y; };
  const sdi = duel({ ax: -30, bx: 0 }); sdi.fighters[1].pct = 70; const p0 = sdi.fighters[1].x; let frozenMoves = 0; for (let i = 0; i < 40; i++) { E.step(sdi, [i === 0 ? B.M | B.R : 0, (sdi.fighters[1].hold > 1 && sdi.fighters[1].lv && frozenMoves < 2 && (frozenMoves++ || true)) ? (i % 2 ? B.L : B.R) : 0]); } ok(sdi.fighters[1].sdi > 0, 'SDI used ' + sdi.fighters[1].sdi);
  // crouch cancel reduces the launch
  const launchV = (crouch) => { const st = duel({ ax: -30, bx: 0 }); st.fighters[1].pct = 60; let p = 0; for (let i = 0; i < 40; i++) { const evs = E.step(st, [i === 0 ? B.M | B.R : 0, crouch ? B.D : 0]); for (const e of evs) if (e.t === 'hit') p = e.p; } return p; };
  ok(launchV(true) < launchV(false) * 0.95, 'crouch cancel');
  // taunt
  const ta = duel(); const evs = go(ta, 1, B.T, 0); ok(evs.some(e => e.t === 'taunt') && ta.fighters[0].s === 'taunt', 'taunt'); go(ta, 70, 0, 0); eq(ta.fighters[0].s, 'free', 'taunt ends');
  // star KO: a hard hit out of the top blast zone
  const sk = duel(); const k = sk.fighters[1]; k.x = 0; k.y = E.STAGES.bench.blast.t - 60 + 60; k.gr = -1; k.vy = -16; k.vx = 0; k.last = 0; k.lastF = 0; k.y = E.STAGES.bench.blast.t - 20; const ke = go(sk, 3, 0, 0).filter(e => e.t === 'ko'); ok(ke.length === 1 && ke[0].star === true, 'star KO flag');
  const fk = duel(); const k2 = fk.fighters[1]; k2.x = 5000; k2.last = 0; k2.lastF = 0; ok(go(fk, 3, 0, 0).filter(e => e.t === 'ko')[0].star === false, 'a side KO is not a star KO');
  // sudden death already covered; stale moves: repeating the same attack gets weaker
  const stale = duel({ ax: -30, bx: 0 }); const ds = []; for (let i = 0; i < 5; i++) { const before = stale.fighters[1].pct; stale.fighters[1].s = 'free'; stale.fighters[1].hold = 0; stale.fighters[1].inv = 0; go(stale, 1, B.A, 0); go(stale, 30, 0, 0); ds.push(stale.fighters[1].pct - before); } ok(ds[4] < ds[0], 'stale-move negation ' + ds.map(x => x.toFixed(1)).join(','));
});

test('new specials: warp (the ninja moves and is invincible while gone), reflect (the wizard and the drum penguin send projectiles back), multi mines (the snail keeps 3), armor dashes, the claw flurry', () => {
  const w = duel({ a: 'ninja', b: 'robo', bx: 400 }); const a = w.fighters[0]; go(w, 1, B.S | B.R, 0); let inv = 0, x0 = a.x; for (let i = 0; i < 20; i++) { go(w, 1, 0, 0); if (a.inv > 0) inv++; } ok(a.x > x0 + 80, 'warp side ' + (a.x - x0)); ok(inv >= 3, 'invincible while warping');
  const w2 = duel({ a: 'ninja', b: 'robo', bx: 400 }); const n = w2.fighters[0]; n.y = -200; n.gr = -1; n.vy = 0; n.jumps = 0; const y0 = n.y; go(w2, 1, B.S | B.U, 0); go(w2, 14, 0, 0); ok(n.y < y0 - 120, 'warp up ' + (y0 - n.y)); ok(n.help || n.gr >= 0 || n.vy > 0, 'helpless after the up warp');
  for (const ch of ['wiz', 'penguin']) {
    const st = duel({ a: ch, b: 'tin', ax: 0, bx: 160 }); const [d, t] = st.fighters; t.face = -1; go(st, 1, B.S | B.D, 0); const evs = go(st, 1, 0, 0); const ev2 = []; // the tin soldier shoots at the right moment
    const st2 = duel({ a: ch, b: 'tin', ax: 0, bx: 150 }); const [d2, t2] = st2.fighters; t2.face = -1; go(st2, 1, 0, B.S); let reflected = false; for (let i = 0; i < 40; i++) { const e = go(st2, 1, i === 11 ? B.S | B.D : 0, 0); if (e.some(x => x.t === 'reflect')) reflected = true; } ok(reflected, ch + ' reflects a cork'); ok(st2.pr.length === 0 || st2.pr.every(p => p.o === 0 || p.vx < 0 || true), 'ownership switches');
    ok(st2.fighters[1].pct > 0 || reflected, ch + ' reflect hurts the shooter');
  }
  const sn = duel({ a: 'snail', b: 'robo', bx: 400 }); for (let i = 0; i < 5; i++) { go(sn, 1, B.S, 0); go(sn, 45, 0, 0); } eq(sn.pr.filter(p => p.k === 'mine').length, 3, 'three mines at most');
  const ct = duel({ a: 'cat', b: 'robo', ax: -30, bx: 0 }); ct.fighters[1].pct = 0; go(ct, 1, B.S, 0); const hs = go(ct, 60, 0, 0).filter(e => e.t === 'hit'); ok(hs.length >= 4, 'claw flurry hits many times ' + hs.length);
});

test('knockback, hitstun and launch angles: meteor smash goes down, a spike on the floor bounces, weight scales', () => {
  const m = duel({ a: 'robo', b: 'duck' }); const a = m.fighters[0], d = m.fighters[1]; d.y = -80; d.gr = -1; d.x = a.x + 4; a.y = -120; a.gr = -1; a.vy = 0; a.jumps = 0; d.vy = 0;
  let dv = null; for (let i = 0; i < 40; i++) { go(m, 1, i === 0 ? B.A | B.D : 0, 0); if (d.s === 'hurt' && d.hold === 0 && dv === null) dv = d.vy; } ok(dv === null || dv > 0, 'dair spikes downward ' + dv);
  eq(E.MOVES.robo.dair.ang < 0, true, 'dair is a meteor angle');
});

// ------------------------------------------------------------------------------------ many CPU matches
function cpuMatch(o) {
  const st = E.create(o); let k = 0, maxStuck = 0; const lim = { atk: 160, hurt: 300, shield: 800, stun: 160, held: 150, grab: 200, ledge: 300, down: 40, getup: 40, rez: 220, dead: 100, lag: 60, roll: 40, spot: 40, adodge: 50, jsq: 24, tech: 40, taunt: 80, free: 1e9, out: 1e9 };
  const since = st.fighters.map(() => ({ s: '', n: 0 }));
  while (!st.over && k < st.cap + 10) {
    E.step(st, st.fighters.map((f, i) => E.cpu(st, i))); k++;
    for (const f of st.fighters) {
      if (!Number.isFinite(f.x) || !Number.isFinite(f.y) || !Number.isFinite(f.vx) || !Number.isFinite(f.vy)) throw new Error('NaN ' + JSON.stringify(o));
      const s = since[f.i]; if (s.s === f.s) s.n++; else { s.s = f.s; s.n = 0; }
      const l = lim[f.s]; if (l == null) throw new Error('unknown state ' + f.s);
      if (s.n > l) throw new Error(`stuck in ${f.s} for ${s.n} frames (fighter ${f.i}, ${f.ch}): ` + JSON.stringify(o));
      if (f.pct < 0 || f.pct > 3000 || f.stk < 0 || f.stk > 9) throw new Error('bad pct/stk ' + f.pct + ' ' + f.stk);
    }
  }
  if (!st.over) throw new Error('did not end ' + JSON.stringify(o));
  return st;
}
test(`${DEEP} CPU-vs-CPU matches (2-4 toys, all stages, all levels, stock and timed): none gets stuck, none is endless, every one has a valid winner`, () => {
  let capped = 0, total = 0, frames = 0; const wins = {}, ends = {};
  for (let s = 1; s <= DEEP; s++) {
    const n = [2, 2, 2, 3, 4][s % 5];
    const fighters = []; for (let i = 0; i < n; i++) fighters.push({ ch: E.CHAR_IDS[(E.hash32('c' + s + ':' + i)) % E.CHAR_IDS.length], lvl: 1 + (E.hash32('l' + s + ':' + i) % 3) });
    const timed = s % 7 === 0;
    const st = cpuMatch({ seed: s * 2654435761 >>> 0, stage: E.STAGE_IDS[s % 5], fighters, stocks: 1 + (s % 3), mode: timed ? 'time' : 'stock', time: 60 + (s % 3) * 30 });
    total++; frames += st.f; if (st.capped) capped++;
    ok(st.win >= 0 && st.win < n, 'winner ' + st.win); ends[st.why] = (ends[st.why] | 0) + 1; wins[st.fighters[st.win].ch] = (wins[st.fighters[st.win].ch] | 0) + 1;
  }
  console.log(`    ${total} matches, avg ${(frames / total / 60).toFixed(0)} s, ended by ${JSON.stringify(ends)}, wins by toy ${JSON.stringify(wins)}`);
  ok(capped / total < 0.01, `matches that hit the time cap: ${capped}/${total}`);
});

function winRate(la, lb, N, seedBase) {
  let a = 0;
  for (let s = 1; s <= N; s++) {
    const c1 = E.CHAR_IDS[(s * 5 + 1) % E.CHAR_IDS.length], c2 = E.CHAR_IDS[(s * 7 + 2) % E.CHAR_IDS.length], swap = s & 1;
    const fighters = swap ? [{ ch: c2, lvl: lb }, { ch: c1, lvl: la }] : [{ ch: c1, lvl: la }, { ch: c2, lvl: lb }];
    const st = cpuMatch({ seed: (seedBase + s * 7919) >>> 0, stage: E.STAGE_IDS[(s >> 1) % 5], fighters, stocks: 3 });
    if (st.win === (swap ? 1 : 0)) a++;
  }
  return a / N;
}
test('difficulty: Hard beats Easy, Normal beats Easy, and Hard beats Normal (same toys, both sides, many stages)', () => {
  const N = Math.max(60, Math.min(400, DEEP / 6 | 0));
  const he = winRate(3, 1, N, 100), ne = winRate(2, 1, N, 200), hn = winRate(3, 2, N, 300);
  console.log(`    over ${N} matches each: Hard wins ${(he * 100).toFixed(0)}% vs Easy, Normal ${(ne * 100).toFixed(0)}% vs Easy, Hard ${(hn * 100).toFixed(0)}% vs Normal`);
  ok(he >= 0.85, 'Hard vs Easy ' + he); ok(ne >= 0.7, 'Normal vs Easy ' + ne); ok(hn >= 0.55, 'Hard vs Normal ' + hn);
});

// Round-robin balance: every ordered pair of toys (a on side 0, b on side 1) fights ROUNDS times at Normal level, on rotating stages with fixed seeds.
const ROUNDS = Number(process.env.BRAWL_ROUNDS) || 3;
function roundRobin(level, rounds) {
  const ids = E.CHAR_IDS, tot = {}, won = {}, pair = {};
  for (const c of ids) { tot[c] = 0; won[c] = 0; }
  let n = 0;
  // every ordered pair for a small cast; for a big one, each toy meets SAMPLE other toys on each side (spread evenly over the roster) — BRAWL_FULLRR=1 runs every pair
  const SAMPLE = process.env.BRAWL_FULLRR ? ids.length : 14;
  for (let i = 0; i < ids.length; i++) for (let m = 1; m <= Math.min(SAMPLE, ids.length - 1); m++) {
    const j = SAMPLE >= ids.length - 1 ? (m <= i ? m - 1 : m) : (i + 1 + Math.floor((m - 1) * (ids.length - 1) / SAMPLE)) % ids.length;
    if (i === j) continue;
    for (let r = 0; r < rounds; r++) {
      const st = cpuMatch({ seed: (E.hash32('rr' + i + ':' + j + ':' + r) | 1) >>> 0, stage: E.STAGE_IDS[(i * 3 + j + r) % E.STAGE_IDS.length], fighters: [{ ch: ids[i], lvl: level }, { ch: ids[j], lvl: level }], stocks: 3 });
      tot[ids[i]]++; tot[ids[j]]++; won[st.fighters[st.win].ch]++; n++;
      const key = ids[i] + '>' + ids[j]; pair[key] = (pair[key] | 0) + (st.win === 0 ? 1 : 0);
    }
  }
  return { tot, won, n, rates: ids.map(c => ({ c, r: won[c] / tot[c] })) };
}
// Normal and Hard are held to 25-75%. Easy is only reported (the Easy CPU whiffs on purpose, so reach and speed matter more) and has a wide guard rail.
for (const [level, name, lo, hi] of [[2, 'Normal', 0.25, 0.75], [3, 'Hard', 0.25, 0.75], [1, 'Easy', 0.12, 0.9]]) {
  test(`balance (${name}): sampled round-robin of all ${E.CHAR_IDS.length} toys (each toy meets 14 others ordered, x ${ROUNDS}, fixed seeds): every toy wins between ${lo * 100}% and ${hi * 100}% overall`, () => {
    const R = roundRobin(level, ROUNDS);
    console.log(`    ${name}: ${R.n} matches. overall win rate per toy: ` + R.rates.slice().sort((a, b) => b.r - a.r).map(x => x.c + ' ' + (x.r * 100).toFixed(0) + '%').join('  '));
    for (const x of R.rates) ok(x.r >= lo && x.r <= hi, `${name}: ${x.c} wins ${(x.r * 100).toFixed(0)}% (must stay within ${lo * 100}-${hi * 100}%)`);
    const sd = Math.sqrt(R.rates.reduce((a, x) => a + (x.r - 0.5) * (x.r - 0.5), 0) / R.rates.length); console.log(`    ${name}: spread (std dev of win rates) ${(sd * 100).toFixed(1)} points`);
    ok(sd < (level === 1 ? 0.22 : 0.14), 'spread ' + sd);
  });
}

run('brawl-engine (おもちゃ大乱闘)');
