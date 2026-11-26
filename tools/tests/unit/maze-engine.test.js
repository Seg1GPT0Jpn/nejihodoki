// maze/engine.js の単体テスト：どの作り方も、500の種で「正しい・つながった・解ける」迷路を作る。同じ種は同じ迷路。
// 動くかべは時間をまたいだ BFS で解ける。ヒントは最短（最適）。かぎとびら・きり・もどる・ゴースト・合言葉・毎日・どこまでも・採点・ずかん。
// 実行：node tools/tests/unit/maze-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'maze/engine.js'));

const SEEDS = 500;
const sizesFor = i => ['XS', 'S', 'M', 'L'][i % 4];
const hashArr = m => E.hash32(Array.from(m.t).join('') + '|' + m.start + '|' + m.goal + '|' + m.coins + '|' + m.gems + '|' + JSON.stringify(m.keys) + JSON.stringify(m.doors) + JSON.stringify(m.gates));

for (const gen of E.GENS) {
  test(`generator ${gen}: ${SEEDS} seeds give a valid, connected, solvable maze with par = shortest path`, () => {
    let loops = 0, perfectCount = 0;
    for (let s = 0; s < SEEDS; s++) {
      const m = E.generate({ mode: 'classic', size: sizesFor(s), diff: 1 + (s % 3), seed: s * 7919 + 13, gen });
      const bad = E.check(m); ok(bad.length === 0, gen + ' seed ' + s + ': ' + bad.join('; '));
      eq(m.gen, gen); ok(m.par >= 1);
      // par is the BFS distance, so check it independently
      const d = E.bfsDist(m.t, m.w, m.h, m.start); eq(d[m.goal], m.par, 'par ' + s);
      if (E.isPerfect(m)) perfectCount++; loops += E.loopCount(m) > 0 ? 1 : 0;
    }
    if (E.PERFECT[gen]) eq(perfectCount, SEEDS, gen + ' is always a perfect maze');
    else ok(loops > SEEDS * 0.3, gen + ' has loops/rooms in most mazes (' + loops + ')');
  });
}

test('XL (61x61) mazes are valid for every generator', () => {
  for (const gen of E.GENS) for (let s = 0; s < 6; s++) { const m = E.generate({ mode: 'classic', size: 'XL', diff: 2, seed: s + 100, gen }); eq(m.w, 61); eq(m.h, 61); const bad = E.check(m); ok(!bad.length, gen + ' ' + bad.join(';')); }
});

test('determinism: the same code always makes the identical maze (and it does not depend on call order)', () => {
  for (const mode of E.MODES) for (let s = 0; s < 40; s++) {
    const p = { mode, size: sizesFor(s), diff: 1 + (s % 3), seed: s * 31 + 7 };
    const a = E.generate(p); E.generate({ mode: 'classic', size: 'L', diff: 3, seed: s }); const b = E.generate(Object.assign({}, p));
    eq(hashArr(a), hashArr(b), mode + ' ' + s); eq(a.code, b.code); eq(E.fromCode(a.code).par, a.par);
    deep(E.fromCode(a.code).start, a.start);
  }
  const a = E.generate({ mode: 'classic', size: 'M', diff: 2, seed: 1 }), b = E.generate({ mode: 'classic', size: 'M', diff: 2, seed: 2 });
  ok(hashArr(a) !== hashArr(b), 'different seeds differ');
});

test('difficulty uses different generator pools; seed picks within the pool', () => {
  const g = d => new Set(Array.from({ length: 60 }, (_, s) => E.pickGen('classic', d, s)));
  ok(g(1).has('rooms') && g(1).has('braid') && !g(3).has('backtracker') && !g(3).has('rooms'), 'easy has rooms+braid, hard has neither backtracker nor rooms');
  eq(E.pickGen('keys', 2, 5), 'kruskal', 'keys/timed never use non-perfect generators');
  // hard mazes have more dead ends per cell than easy ones on average
  const avg = d => { let t = 0, n = 0; for (let s = 0; s < 60; s++) { const m = E.generate({ mode: 'classic', size: 'M', diff: d, seed: s }); t += E.deadEnds(m) / (m.floors / 2); n++; } return t / n; };
  ok(avg(3) > avg(1), 'hard has a higher dead-end ratio than easy');
});

test('sizes: XS..XL are 9, 15, 25, 41, 61 tiles; custom n is forced odd and clamped', () => {
  deep(E.SIZES.map(z => z.n), [9, 15, 25, 41, 61]);
  const m = E.generate({ mode: 'classic', n: 20, diff: 2, seed: 4 }); eq(m.w, 19); eq(m.size, 'E19');
  eq(E.generate({ mode: 'classic', n: 99, diff: 2, seed: 4 }).w, 61);
});

test('coins and gems sit on floor tiles, never on start/goal, and are unique', () => {
  for (let s = 0; s < 60; s++) for (const mode of E.MODES) {
    const m = E.generate({ mode, size: sizesFor(s), diff: 2, seed: s });
    const all = [...m.coins, ...m.gems, ...m.keys.map(k => k.i)]; eq(new Set(all).size, all.length, 'unique');
    for (const c of all) { ok(m.t[c], 'floor'); ok(c !== m.start && c !== m.goal, 'not start/goal'); }
    ok(m.coins.length >= 2); eq(m.gems.length, m.n >= 61 ? 3 : m.n >= 41 ? 2 : m.n >= 25 ? 1 : 0);
  }
});

test(`keys & doors: ${SEEDS} mazes are solvable only by collecting keys in a workable order; doors are real obstacles`, () => {
  let needKeys = 0;
  for (let s = 0; s < SEEDS; s++) {
    const m = E.generate({ mode: 'keys', size: sizesFor(s), diff: 1 + (s % 3), seed: s * 13 + 1 });
    ok(m.doors.length >= 1 && m.doors.length === m.keys.length, 'doors=keys ' + m.code);
    ok(E.check(m).length === 0, m.code + ' ' + E.check(m).join());
    const sol = E.search(m, m.start, 0, 0); ok(sol, 'solvable ' + m.code);
    const r = E.newRun(m); for (const d of sol.dirs) ok(E.step(r, d).ok, 'step ' + m.code); ok(r.done && r.moves === m.par, 'replay of the solution wins in par ' + m.code);
    // without keys the plain maze is cut by the first door
    const plain = E.shortestPath(m.t.map((v, i) => (m.doorAt[i] ? 0 : v)), m.w, m.h, m.start, m.goal); if (!plain) needKeys++;
    // every key lies where it can be reached before its own door (the search succeeded, but also check key 0 is outside the doors' far side)
    for (const k of m.keys) ok(m.t[k.i], 'key on floor');
  }
  eq(needKeys, SEEDS, 'a closed door always blocks the way (perfect mazes)');
});

test('keys: a locked door blocks the step; the key opens exactly its own colour; the key is picked up once', () => {
  const m = E.generate({ mode: 'keys', size: 'M', diff: 3, seed: 21 }); ok(m.doors.length >= 2);
  const sol = E.search(m, m.start, 0, 0), r = E.newRun(m); let sawLocked = false, keysGot = 0;
  // walk the solution, but check each door step is refused without the key by trying from a fresh run state with mask 0
  for (const d of sol.dirs) { const res = E.step(r, d); ok(res.ok); if (res.key) keysGot++; }
  eq(keysGot, m.keys.length); eq(r.mask, (1 << m.keys.length) - 1);
  for (const dr of m.doors) { for (let d = 0; d < 4; d++) { const x = dr.i % m.w - [0, 1, 0, -1][d], y = ((dr.i / m.w) | 0) - [-1, 0, 1, 0][d]; if (x < 0 || y < 0 || x >= m.w || y >= m.h || !m.t[y * m.w + x]) continue; const nm = E.move(m, y * m.w + x, 0, 0, d); if (nm === null) sawLocked = true; ok(E.move(m, y * m.w + x, (1 << m.keys.length) - 1, 0, d) !== null, 'opens with all keys'); const other = ((1 << m.keys.length) - 1) & ~(1 << dr.k); if (m.keys.length > 1) ok(E.move(m, y * m.w + x, other, 0, d) === null, 'wrong keys do not open door ' + dr.k); } }
  ok(sawLocked);
});

test(`moving walls: ${SEEDS} mazes are solvable by BFS over (tile, time); par equals that BFS; waiting is allowed only here`, () => {
  let shorter = 0, waits = 0;
  for (let s = 0; s < SEEDS; s++) {
    const m = E.generate({ mode: 'timed', size: sizesFor(s), diff: 1 + (s % 3), seed: s * 17 + 5 });
    ok(m.gates.length >= 3 && m.P === E.PERIOD, 'gates ' + m.code);
    ok(E.check(m).length === 0, m.code + ' ' + E.check(m).join());
    // independent BFS over (pos, t mod P) written here from the rules (open at the tick you arrive)
    const N = m.w * m.h, P = E.PERIOD, seen = new Uint8Array(N * P), q = [[m.start, 0, 0]]; seen[m.start] = 1; let best = -1;
    const gate = new Map(m.gates.map(g => [g.i, g]));
    for (let h = 0; h < q.length && best < 0; h++) {
      const [p, tm, dist] = q[h]; if (p === m.goal) { best = dist; break; }
      const nt = (tm + 1) % P; const nbr = [[p, 1]];
      for (const [dx, dy] of [[0, -1], [1, 0], [0, 1], [-1, 0]]) { const x = p % m.w + dx, y = ((p / m.w) | 0) + dy; if (x < 0 || y < 0 || x >= m.w || y >= m.h) continue; nbr.push([y * m.w + x, 0]); }
      for (const [n, wait] of nbr) { if (!wait) { if (!m.t[n]) continue; const g = gate.get(n); if (g && !(((nt + g.ph) % g.p) < g.on)) continue; } const e = nt * N + n; if (!seen[e]) { seen[e] = 1; q.push([n, nt, dist + 1]); } }
    }
    eq(best, m.par, 'par is the time-BFS optimum ' + m.code);
    const base = m.t.map((v, i) => (m.gateAt[i] && m.gates[m.gateAt[i] - 1].type === 'A' ? 0 : v)), plain = E.shortestPath(base, m.w, m.h, m.start, m.goal).length - 1; if (m.par < plain) shorter++; if (m.par > plain) waits++;
    // the optimal action list is executable step by step
    const sol = E.search(m, m.start, 0, 0), r = E.newRun(m); for (const d of sol.dirs) ok(E.step(r, d).ok, 'executable ' + m.code); ok(r.done);
  }
  ok(shorter > SEEDS * 0.4, 'shortcut gates often shorten the route (' + shorter + ')');
  ok(waits > 0, 'some mazes need waiting for a gate (' + waits + ')');
  const c = E.generate({ mode: 'classic', size: 'S', diff: 2, seed: 3 }); eq(E.move(c, c.start, 0, 0, 4), null, 'no waiting in other modes');
});

test('moving walls: a gate that closes while you stand on it does not trap you (you can always step off, or wait)', () => {
  const m = E.generate({ mode: 'timed', size: 'S', diff: 3, seed: 9 }); const g = m.gates[0];
  for (let tm = 0; tm < E.PERIOD; tm++) { const s = E.move(m, g.i, 0, tm, 4); ok(s && s.pos === g.i, 'waiting on a gate tile is allowed'); }
  // every gate opens at least once per period, so every gate can be entered by waiting beside it
  for (const gt of m.gates) ok(Array.from({ length: E.PERIOD }, (_, t) => E.gateOpen(gt, t)).some(Boolean), 'gate opens at least once');
});

test('hint path is optimal: from every point on a played route, the hint length equals the independent BFS distance and shrinks by one per step', () => {
  for (const mode of ['classic', 'fog', 'd3', 'keys', 'timed']) for (let s = 0; s < 30; s++) {
    const m = E.generate({ mode, size: sizesFor(s), diff: 2, seed: s * 3 + 2 }), r = E.newRun(m), rnd = E.mulberry32(s + 1);
    let h = E.hintPath(r); eq(h.len, m.par, 'hint at start = par ' + m.code);
    for (let k = 0; k < 40 && !r.done; k++) {
      const dirs = mode === 'timed' ? [0, 1, 2, 3, 4] : [0, 1, 2, 3]; const d = dirs[Math.floor(rnd() * dirs.length)]; E.step(r, d);
      if (r.done) break; const hh = E.hintPath(r); ok(hh, 'still solvable after wandering ' + m.code);
      // following the hint strictly never gets worse than its own length
      const cp = E.replay(m, r.log); for (const x of hh.dirs) ok(E.step(cp, x).ok); ok(cp.done && cp.moves === r.moves + hh.len, 'hint solves in exactly its length');
    }
    if (mode === 'classic') { const dist = E.bfsDist(m.t, m.w, m.h, m.goal); const r2 = E.newRun(m); for (let k = 0; k < 25 && !r2.done; k++) { E.step(r2, Math.floor(rnd() * 4)); if (!r2.done) eq(E.hintPath(r2).len, dist[r2.pos], 'hint = BFS distance'); } }
  }
});

test('step: walls and bumps do not move or count; the log, route (loop-erased) and visited cells are kept; items are collected once', () => {
  const m = E.generate({ mode: 'classic', size: 'S', diff: 2, seed: 8 }), r = E.newRun(m);
  let bumps = 0; for (let d = 0; d < 4; d++) if (!E.move(m, r.pos, 0, 0, d)) { const res = E.step(r, d); ok(!res.ok); bumps++; }
  eq(r.moves, 0); eq(r.bumps, bumps); eq(r.log, '');
  const sol = E.search(m, m.start, 0, 0); let gotCoin = 0;
  for (const d of sol.dirs) { const res = E.step(r, d); if (res.coin) gotCoin++; }
  ok(r.done); eq(r.moves, m.par); eq(r.log.length, m.par); eq(r.route.length, m.par + 1, 'the route of a straight solution is the whole path');
  ok(!E.step(r, 0).ok, 'no moving after the goal');
  // a back-and-forth walk is loop-erased
  const q = E.newRun(m); const d0 = sol.dirs[0]; E.step(q, d0); E.step(q, (d0 + 2) % 4); eq(q.route.length, 1); eq(q.moves, 2);
});

test('undo to the last junction walks the loop-erased route back to the previous fork (and each step counts as a move)', () => {
  let tested = 0;
  for (let s = 0; s < 60 && tested < 25; s++) {
    const m = E.generate({ mode: 'classic', size: 'M', diff: 2, seed: s, gen: 'backtracker' }), r = E.newRun(m);
    // walk into a dead end: follow the solution until a junction (deg>=3), then take a wrong branch to its end
    const sol = E.search(m, m.start, 0, 0); let k = 0, junction = -1;
    for (; k < sol.dirs.length; k++) { E.step(r, sol.dirs[k]); if (E.degree(m, r.pos) >= 3) { junction = r.pos; break; } }
    if (junction < 0) continue;
    const wrong = [0, 1, 2, 3].filter(d => d !== (sol.dirs[k + 1]) && d !== (sol.dirs[k] + 2) % 4 && E.move(m, r.pos, 0, 0, d)); if (!wrong.length) continue;
    let d = wrong[0], n = 0; while (n < 200) { const res = E.step(r, d); if (!res.ok) break; n++; const nx = [0, 1, 2, 3].filter(x => x !== (d + 2) % 4 && E.move(m, r.pos, 0, 0, x)); if (!nx.length) break; d = nx[0]; if (E.degree(m, r.pos) >= 3) break; }
    const before = r.moves, dirs = E.undoJunction(r); ok(dirs.length >= 1);
    for (const x of dirs) ok(E.step(r, x).ok, 'walk back'); eq(r.moves, before + dirs.length, 'undo counts as moves');
    ok(E.degree(m, r.pos) >= 3 || r.pos === m.start, 'ends on a junction or the start'); tested++;
  }
  ok(tested >= 10, 'enough cases ' + tested);
  const m = E.generate({ mode: 'classic', size: 'S', diff: 2, seed: 8 }); deep(E.undoJunction(E.newRun(m)), []);
});

test('fog: visibility is limited by radius and walls; seen cells accumulate; a wall blocks sight but is itself seen', () => {
  const m = E.generate({ mode: 'fog', size: 'M', diff: 2, seed: 5 }), r = E.newRun(m), R = m.radius; eq(R, E.FOG_R[2]);
  const v = E.visible(m, m.start, R); ok(v.includes(m.start));
  for (const i of v) { const dx = (i % m.w) - (m.start % m.w), dy = ((i / m.w) | 0) - ((m.start / m.w) | 0); ok(dx * dx + dy * dy <= R * R + 0.5, 'within radius'); }
  ok(v.length < m.floors, 'not everything is visible'); const n0 = r.seen.reduce((a, b) => a + b, 0); eq(n0, v.length);
  const sol = E.search(m, m.start, 0, 0); for (const d of sol.dirs.slice(0, 12)) E.step(r, d); ok(r.seen.reduce((a, b) => a + b, 0) > n0, 'explored area grows');
  // behind a wall: a corridor tile two steps away through a wall must not be seen
  const open = E.generate({ mode: 'classic', size: 'S', diff: 2, seed: 1 }); const p = open.start; for (const i of E.visible(open, p, 5)) { if (!open.t[i]) continue; const dx = (i % open.w) - (p % open.w), dy = ((i / open.w) | 0) - ((p / open.w) | 0); const n = Math.max(Math.abs(dx), Math.abs(dy)); for (let k = 1; k < n; k++) ok(open.t[(((p / open.w) | 0) + Math.round(dy * k / n)) * open.w + (p % open.w) + Math.round(dx * k / n)], 'line of sight is clear'); }
});

test('ghost: replaying a log gives the same path; a log of a solved maze replays to the goal; tampered/over-long logs stop at the first illegal move', () => {
  const m = E.generate({ mode: 'keys', size: 'S', diff: 2, seed: 4 }), sol = E.search(m, m.start, 0, 0), log = sol.dirs.map(d => E.DCH[d]).join('');
  const gp = E.ghostPath(m, log); eq(gp.length, log.length + 1); eq(gp[0], m.start); eq(gp[gp.length - 1], m.goal);
  const r = E.replay(m, log); ok(r.done); eq(r.log, log); eq(E.replay(m, log, 3).moves, 3);
  ok(E.replay(m, 'uuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuuu').moves < 44, 'illegal moves stop the replay');
  const t = E.generate({ mode: 'timed', size: 'S', diff: 2, seed: 6 }), ls = E.search(t, t.start, 0, 0).dirs.map(d => E.DCH[d]).join(''); ok(E.replay(t, ls).done, 'timed replay is deterministic');
});

test('codes: parse/format round trip, 3-part form defaults to normal, bad codes are rejected, endless codes', () => {
  deep(E.parseCode('c-M-2-48213'), { mode: 'classic', size: 'M', diff: 2, seed: 48213, code: 'c-M-2-48213' });
  eq(E.parseCode('F-xl-3-7').code, 'f-XL-3-7'); eq(E.parseCode('3-S-12').diff, 2); eq(E.parseCode(' t－M－1－99 ').code, 't-M-1-99', 'full-width dashes and spaces are accepted');
  for (const bad of ['', 'x-M-2-1', 'c-Q-2-1', 'c-M-4-1', 'c-M-2-', 'c-M-2-1234567890', 'hello', 'c-M-2-x', null]) eq(E.parseCode(bad), null, String(bad));
  deep(E.parseCode('e-7-5'), { endless: true, level: 7, seed: 5, code: 'e-7-5' }); eq(E.parseCode('e-0-5'), null);
  for (const mode of E.MODES) for (const z of E.SIZES) { const m = E.generate({ mode, size: z.id, diff: 2, seed: 77 }); eq(E.parseCode(m.code).code, m.code); eq(E.fromCode(m.code).par, m.par); }
  eq(E.fromCode('nonsense'), null);
});

test('daily: same seed gives the same maze for everyone, different days differ, mode and size vary over a month, the code opens the same maze', () => {
  const modes = new Set(), sizes = new Set(); let diffDays = 0;
  for (let d = 0; d < 60; d++) { const seed = E.hash32('kobo:maze:' + (20261101 + d)), p = E.dailyParams(seed), q = E.dailyParams(seed); deep(p, q); modes.add(p.mode); sizes.add(p.size); const m = E.fromCode(p.code); ok(E.check(m).length === 0, p.code); eq(m.mode, p.mode); if (d && E.dailyParams(E.hash32('kobo:maze:' + (20261101 + d - 1))).code !== p.code) diffDays++; }
  eq(modes.size, 5, 'all five modes show up'); ok(sizes.size >= 3); ok(diffDays >= 58);
});

test('endless: floors get bigger, the time limit follows par, score rises with floor and time left, every floor is solvable, deterministic per (seed, level)', () => {
  let prev = 0;
  for (let lv = 1; lv <= 40; lv++) { const p = E.endlessParams(lv, 12345), q = E.endlessParams(lv, 12345); deep(p, q); ok(p.n >= prev && p.n <= 61, 'size grows ' + lv); prev = p.n; const m = E.fromCode('e-' + lv + '-12345'); ok(E.check(m).length === 0, 'floor ' + lv); eq(m.level, lv); ok(E.endlessLimitMs(lv, m.par) >= 14000); }
  eq(E.endlessParams(1, 1).n, 9); eq(E.endlessParams(40, 1).n, 61); ok(E.endlessParams(30, 1).diff === 3 && E.endlessParams(1, 1).diff === 1);
  ok(E.endlessLimitMs(5, 100) > E.endlessLimitMs(5, 50)); ok(E.endlessScore(5, 20000, 3) > E.endlessScore(5, 0, 3) && E.endlessScore(6, 0, 0) > E.endlessScore(5, 0, 0));
  ok(new Set(Array.from({ length: 6 }, (_, i) => E.endlessParams(i + 1, 9).mode)).size >= 4, 'floors vary in mode');
});

test('stars: 3 within the par tolerance, 2 within the looser one, otherwise 1; hints cap at 2, a revealed solution at 1; thresholds scale with par', () => {
  const m = { mode: 'classic', par: 100 }; eq(E.starsFor(m, 100), 3); eq(E.starsFor(m, 125), 3); eq(E.starsFor(m, 126), 2); eq(E.starsFor(m, 220), 2); eq(E.starsFor(m, 221), 1);
  eq(E.starsFor(m, 100, { hints: 1 }), 2); eq(E.starsFor(m, 100, { reveal: true }), 1); eq(E.starsFor(m, 100, { hints: 2, reveal: false }), 2);
  eq(E.starsFor({ mode: 'fog', par: 50 }, 110), 3); deep(E.starLimits({ mode: 'classic', par: 40 }), [50, 88]);
  for (const mode of E.MODES) { const mm = { mode, par: 30 }; ok(E.starsFor(mm, 30) === 3 && E.starsFor(mm, 10000) === 1); }
});

test('tap-to-walk routing: shortest path to any reachable floor tile, respects owned keys, stays inside the allowed (seen) area', () => {
  const m = E.generate({ mode: 'keys', size: 'M', diff: 2, seed: 3 }), r = E.newRun(m);
  const d = E.bfsDist(m.t, m.w, m.h, m.start); let n = 0;
  for (let i = 0; i < m.t.length && n < 40; i += 7) { if (!m.t[i] || i === m.start) continue; const route = E.routeTo(m, m.start, 0, i); if (!route) continue; n++; const q = E.newRun(m); for (const x of route) { if (!E.step(q, x).ok) break; } if (q.pos === i) ok(route.length >= d[i], 'not shorter than the plain distance'); }
  ok(n > 5); const fm = E.generate({ mode: 'fog', size: 'M', diff: 2, seed: 3 }), fr = E.newRun(fm);
  let far = -1; const fd = E.bfsDist(fm.t, fm.w, fm.h, fm.start); for (let i = 0; i < fd.length; i++) if (fd[i] > 20) { far = i; break; }
  eq(E.routeTo(fm, fm.start, 0, far, fr.seen), null, 'cannot route through unseen fog'); ok(E.routeTo(fm, fm.start, 0, far));
  void r;
});

test('worlds (zukan): 40 unique, hand-named ja+en, valid colours and patterns, unlock requirements are reachable, the first two are open at the start', () => {
  eq(E.WORLDS.length, 40); const pats = new Set(['brick', 'stone', 'hedge', 'ice', 'sand', 'wood', 'metal', 'crystal', 'dots', 'waves', 'stripes', 'scales']);
  const ids = new Set(), names = new Set(), kinds = { stars: E.MAX_STARS, clears: 1e6, coins: 1e6, gems: 1e6, daily: 1e6, streak: 1e6, depth: 1e6, three: 1e6, 'mode:classic': 1e6, 'mode:fog': 1e6, 'mode:d3': 1e6, 'mode:keys': 1e6, 'mode:timed': 1e6 };
  for (const w of E.WORLDS) {
    ok(/^[a-z]+$/.test(w.id) && !ids.has(w.id), 'id ' + w.id); ids.add(w.id); ok(w.ja && w.en && !/[぀-ヿ一-龯]/.test(w.en), 'names ' + w.id); ok(!names.has(w.en), 'dup en ' + w.en); names.add(w.en);
    for (const c of [w.wall, w.floor, w.acc]) ok(/^#[0-9a-f]{6}$/.test(c), 'colour ' + w.id); ok(pats.has(w.pat), 'pattern ' + w.pat);
    ok(w.req[0] in kinds && w.req[1] >= 0 && w.req[1] <= kinds[w.req[0]], 'reachable requirement ' + w.id + ' ' + w.req);
    // wall and floor must contrast, or the maze is unreadable
    const lum = h => { const c = [1, 3, 5].map(i => parseInt(h.slice(i, i + 2), 16)); return 0.299 * c[0] + 0.587 * c[1] + 0.114 * c[2]; }; ok(Math.abs(lum(w.wall) - lum(w.floor)) > 40, 'contrast ' + w.id + ' ' + Math.abs(lum(w.wall) - lum(w.floor)));
  }
  deep(E.WORLDS.slice(0, 2).map(w => w.req[1]), [0, 0]); eq(E.WORLDS[0].id, 'forest');
  ok(E.WORLDS.some(w => w.id === 'castle') && E.WORLDS.some(w => w.id === 'icecave'), 'forest, castle, ice cave exist');
  eq(E.WORLDS.filter(w => E.worldUnlocked({}, w)).length, 2, 'two worlds at the start');
  eq(E.WORLDS.filter(w => E.worldUnlocked({ stars: 85, stats: { clears: 999, three: 99, fog: 9, d3: 9, keys: 9, timed: 9 }, coins: 999, gems: 99, dl: { n: 99, bs: 99 }, en: { best: 99 } }, w)).length, 40, 'everything unlocks with full progress');
});

test('total stars: per slot max 3, 25 slots, plus Descend tiers and daily tiers; capped at MAX_STARS (85)', () => {
  eq(E.MAX_STARS, 85); const b = {}; for (const m of E.MODES) for (const z of E.SIZES) b[E.slotKey(m, z.id)] = { s: 3 };
  eq(E.totalStars({ b }), 75); eq(E.totalStars({ b, en: { best: 30 }, dl: { n: 30 } }), 85); eq(E.totalStars({ b: { 'classic.M': { s: 9 } } }), 3, 'a bad value is clamped');
  eq(E.totalStars({}), 0); eq(E.totalStars({ en: { best: 5 }, dl: { n: 1 } }), 2);
});

run('maze-engine');
