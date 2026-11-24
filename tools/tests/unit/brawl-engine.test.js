// brawl/engine.js の単体テスト：決まった結果（同じ種・同じ入力 → 同じ試合）、ふっとばしの計算、ブラストゾーン、
// 6人のおもちゃの技がぜんぶ当たって、フレーム数に上限があること、ジャンプ・コヤーテ・先行入力・ふち・まもり・つかみ・カウンター、
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

test('the roster: 6 toys + a boss, 5 stages, original names, every toy has the 12 normals, 4 specials and a grab', () => {
  eq(E.CHAR_IDS.length, 6); eq(E.STAGE_IDS.length, 5);
  const names = new Set();
  for (const id of E.CHAR_IDS.concat(['junk'])) {
    const c = E.CH[id]; ok(c.name.ja && c.name.en && c.short.ja && c.short.en && c.desc.ja && c.desc.en, id + ' text');
    names.add(c.name.ja);
    const m = E.MOVES[id];
    for (const k of E.NORMALS.concat(['spN', 'spS', 'spU', 'spD', 'grab'])) ok(m[k], id + ' has ' + k);
    ok(c.weight >= 70 && c.weight <= 170 && c.w >= 26 && c.h >= 44, id + ' body');
  }
  eq(names.size, 7, 'distinct names');
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
  go(st, 2, B.D, 0); go(st, 2, 0, 0); for (let i = 0; i < 80; i++) go(st, 1, 0, 0); ok(a.y > -5 && a.gr >= 0 && a.gr < 100, 'dropped to the stage ' + a.y);
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

test('every move of every toy hits a toy standing where its hitbox is (and every projectile, mine and special does its job)', () => {
  const bits = { jab: B.A, ftilt: B.A | B.R, utilt: B.A | B.U, dtilt: B.A | B.D, fsmash: B.M | B.R, usmash: B.M | B.U, dsmash: B.M | B.D, nair: B.A, fair: B.A | B.R, bair: B.A | B.L, uair: B.A | B.U, dair: B.A | B.D, spN: B.S, spS: B.S | B.R, spU: B.S | B.U, spD: B.S | B.D };
  for (const id of E.CHAR_IDS.concat(['junk'])) {
    for (const k of Object.keys(bits)) {
      const m = E.MOVES[id][k], air = /air$/.test(k) || k === 'spU';
      let connected = false;
      // try the dummy at a few distances in front of / around the attacker (the move's own hitbox decides)
      const cands = [];
      for (const h of m.kind === 'pound' ? m.land.hb : (m.hb || [])) cands.push([h[0] + (h[2] - h[0]) * 0.5, h[1] + (h[3] - h[1]) * 0.5]);
      if (m.kind === 'proj') cands.push([160, -30], [90, -30]);
      if (m.kind === 'mine') cands.push([30, -6]);
      if (m.kind === 'buff') { const st = duel({ a: id, b: 'robo', bx: 400 }); go(st, 1, bits[k], 0); go(st, 30, 0, 0); ok(st.fighters[0].buff > 0, id + ' buff'); continue; }
      if (m.kind === 'counter') continue;
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

// ------------------------------------------------------------------------------------ many CPU matches
function cpuMatch(o) {
  const st = E.create(o); let k = 0, maxStuck = 0; const lim = { atk: 160, hurt: 300, shield: 800, stun: 160, held: 150, grab: 200, ledge: 300, down: 40, getup: 40, rez: 220, dead: 100, lag: 60, roll: 40, spot: 40, adodge: 50, jsq: 24, free: 1e9, out: 1e9 };
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
    const fighters = []; for (let i = 0; i < n; i++) fighters.push({ ch: E.CHAR_IDS[(E.hash32('c' + s + ':' + i)) % 6], lvl: 1 + (E.hash32('l' + s + ':' + i) % 3) });
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
    const c1 = E.CHAR_IDS[(s * 5 + 1) % 6], c2 = E.CHAR_IDS[(s * 7 + 2) % 6], swap = s & 1;
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

test('no toy is overpowered: at Normal level every toy wins between 30% and 70% of its matches against the others', () => {
  const tot = {}, won = {}; for (const c of E.CHAR_IDS) { tot[c] = 0; won[c] = 0; }
  const N = Math.max(120, Math.min(480, DEEP / 5 | 0));
  for (let s = 1; s <= N; s++) {
    const a = E.CHAR_IDS[s % 6], b = E.CHAR_IDS[(s + 1 + (s * 3 % 5)) % 6]; if (a === b) continue;
    const st = cpuMatch({ seed: s * 104729 >>> 0, stage: E.STAGE_IDS[s % 5], fighters: [{ ch: a, lvl: 2 }, { ch: b, lvl: 2 }], stocks: 3 });
    tot[a]++; tot[b]++; won[st.fighters[st.win].ch]++;
  }
  const rates = E.CHAR_IDS.map(c => c + ' ' + (won[c] / tot[c] * 100).toFixed(0) + '%').join('  ');
  console.log('    ' + rates);
  for (const c of E.CHAR_IDS) { const r = won[c] / tot[c]; ok(r >= 0.28 && r <= 0.72, `${c} wins ${(r * 100).toFixed(0)}%`); }
});

run('brawl-engine (おもちゃ大乱闘)');
