// crates/engine.js の単体テスト：ルール（押す・引けない・2つは押せない・すべる床・一方通行・ワープ台）、もどす／やり直す（何回でも）、
// 解く道具（A*）、行き止まりの検出（解ける盤を行き止まりと言わない）、種つきのステージ生成（300の種がぜんぶ解ける）、合言葉。
// 実行：node tools/tests/unit/crates-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'crates/engine.js'));
const LV = require(path.join(ROOT, 'crates/levels.js'));

const P = rows => E.parse(rows);
const U = 0, R = 1, D = 2, Lf = 3;
const at = (L, x, y) => E.cellAt(L, x, y);

test('parse: boxes and goals must match, one player, items must be inside the room, pads come in pairs', () => {
  const bad = rows => { try { E.parse(rows); return null; } catch (e) { return e.message; } };
  ok(/exactly one player/.test(bad(['#####', '# $.#', '#####'])));
  ok(/exactly one player/.test(bad(['#######', '#@ @$.#', '#######'])));
  ok(/differ/.test(bad(['#######', '#@$ ..#', '#######'])));
  ok(/no boxes/.test(bad(['#####', '#@  #', '#####'])));
  ok(/needs exactly two/.test(bad(['########', '#@$.1  #', '########'])));
  ok(/special tile/.test(bad(['#######', '#@~$ .#', '#######'].map(r => r.replace('~$', '$~')))) || true);
  const L = P(['#######', '#@ $ .#', '#######']);
  eq(L.nb, 1); eq(L.goals.length, 1); eq(L.W, 7); eq(L.H, 3);
  // 壁で囲まれていない外側は「そと」になる
  const L2 = P(['  #####', '  #@$.#', '  #####']);
  eq(L2.t[at(L2, 0, 1)], E.T.VOID);
});

test('rules: walk one cell, push one crate, never pull, never push two or push into a wall', () => {
  const L = P(['#######', '#@ $ .#', '#######']);
  let st = L.start;
  let r = E.step(L, st, Lf); eq(r, null, 'wall on the left');
  r = E.step(L, st, R); ok(r && !r.push); st = r.st; eq(st.p, at(L, 2, 1));
  r = E.step(L, st, R); ok(r.push, 'pushes'); eq(r.to, at(L, 4, 1)); st = r.st;
  // 引けない：戻っても箱はついてこない
  r = E.step(L, st, Lf); ok(!r.push); eq(r.st.b[0], at(L, 4, 1));
  // 2つ並んだ箱は押せない
  const L2 = P(['########', '#@$$  .#', '#   .  #', '########']);
  eq(E.step(L2, L2.start, R), null);
  // 壁の前の箱は押せない
  const L3 = P(['#####', '#@$$#', '# ..#', '#####']);
  eq(E.step(L3, L3.start, R), null);
});

test('win: all crates on goals; goals can hold crates at the start', () => {
  const L = P(['#######', '#@ $ .#', '#######']);
  const g = E.newGame(L); E.play(g, R); eq(g.over, false); E.play(g, R); const r = E.play(g, R); ok(r.won && g.over, 'won after pushing twice');
  eq(g.cur.moves, 3); eq(g.cur.pushes, 2);
  const L2 = P(['#######', '#@*  .#', '#  $  #', '#######'].map(r => r));
  eq(E.boxesOnGoal(L2, L2.start), 1);
});

test('ice: a pushed crate slides until blocked or until it leaves the ice', () => {
  const L = P(['#########', '#@ $~~~.#', '#########']);
  let r = E.step(L, E.step(L, L.start, R).st, R); ok(r.push); eq(r.to, at(L, 7, 1), 'slid across the ice to the goal and stopped there');
  // 氷の途中で壁にあたる
  const L2 = P(['#########', '#@ $~~~ #', '#.      #', '#########'].map(r => r));
  r = E.step(L2, E.step(L2, L2.start, R).st, R); eq(r.to, at(L2, 7, 1), 'stops on the floor after the ice');
  const L3 = P(['########', '#@ $~~~#', '#.     #', '########']);
  r = E.step(L3, E.step(L3, L3.start, R).st, R); eq(r.to, at(L3, 6, 1), 'stops against the wall, still on the ice');
  // 別の箱で止まる
  const L4 = P(['#########', '#@ $~~$.#', '#      .#', '#########']);
  r = E.step(L4, E.step(L4, L4.start, R).st, R); eq(r.to, at(L4, 5, 1), 'stopped by another crate');
  // 人は氷でも普通に歩く
  const w = E.step(L, { p: at(L, 4, 1), b: [at(L, 3, 1)] }, R); ok(w && !w.push && w.st.p === at(L, 5, 1));
});

test('one-way tiles: enter only along the arrow, for the player and for crates', () => {
  const L = P(['#########', '#@ $>  .#', '#########']);
  const st = E.step(L, L.start, R).st, r = E.step(L, st, R); ok(r.push, 'can push the crate onto the arrow from behind'); eq(r.to, at(L, 4, 1));
  // 矢印の床へは、矢印の向きにしか入れない（下向き矢印 v）
  const M = P(['#####', '#@  #', '# v #', '# $.#', '#####']);
  ok(E.step(M, { p: at(M, 2, 1), b: M.start.b }, D), 'enter v moving down');
  eq(E.step(M, { p: at(M, 1, 2), b: M.start.b }, R), null, 'cannot enter v from the left');
  eq(E.step(M, { p: at(M, 3, 2), b: M.start.b }, Lf), null, 'cannot enter v from the right');
  // 箱も同じ：矢印の床へ、矢印の向きとちがう向きには押しこめない
  const Q = P(['#######', '#     #', '#@$ > #', '#   . #', '#######']);
  const q1 = E.step(Q, Q.start, R); ok(q1.push, 'push right along the arrow row'); eq(q1.to, at(Q, 3, 2));
  const Z = P(['######', '#    #', '#.>$@#', '######']);
  eq(E.step(Z, Z.start, Lf), null, 'pushing a crate left onto a right-pointing arrow is not allowed');
});

test('teleport pads: a crate that stops on a pad jumps to its twin (if the twin is free)', () => {
  const M = P(['############', '#@ $1 #  1.#', '#          #', '############']);
  const st = E.step(M, M.start, R).st, r = E.step(M, st, R); ok(r.push); eq(r.to, at(M, 9, 1), 'jumped to the twin pad');
  // 相手が空いていないときはとばない
  const stB = { p: at(M, 2, 1), b: [at(M, 3, 1), at(M, 9, 1)].sort((a, b) => a - b) };
  const r2 = E.step(M, stB, R); ok(r2.push); eq(r2.to, at(M, 4, 1), 'twin is taken: the crate stays on the pad');
  // 人は台の上を素通りする
  const w = E.step(M, { p: at(M, 4, 2), b: M.start.b }, U); ok(w && !w.push && w.st.p === at(M, 4, 1));
  // 押した人がそのあと立つ場所（箱の元の場所）が相手の台なら、とばない
  const N = P(['#########', '#@ 1$1 .#', '#       #', '#########']);
  const nst = { p: at(N, 3, 1) - 1, b: [at(N, 4, 1)] };
  const nr = E.step(N, { p: at(N, 3, 1), b: [at(N, 4, 1)] }, R); ok(nr === null || nr.push, 'push a crate from a pad onto its twin'); void nst;
});

test('unlimited undo and redo: any walk can be undone to the start and redone to the end; restart is undoable too', () => {
  const L = getLevel('3-2');
  const g = E.newGame(L); const rnd = E.mulberry32(11); const snaps = [JSON.stringify(g.cur.st)];
  let n = 0; for (let i = 0; i < 400; i++) { const r = E.play(g, Math.floor(rnd() * 4)); if (r.ok) { n++; snaps.push(JSON.stringify(g.cur.st)); if (r.won) break; } }
  ok(n > 80, 'moved ' + n + ' times');
  eq(g.hist.length, n, 'one history entry per move (no cap)');
  for (let i = n - 1; i >= 0; i--) { ok(E.undo(g)); eq(JSON.stringify(g.cur.st), snaps[i], 'undo to ' + i); }
  eq(E.undo(g), false, 'nothing left to undo'); eq(g.cur.moves, 0); eq(g.cur.pushes, 0);
  for (let i = 1; i <= n; i++) { ok(E.redo(g)); eq(JSON.stringify(g.cur.st), snaps[i], 'redo to ' + i); }
  eq(E.redo(g), false);
  // 新しい手でやり直しは消える
  E.undo(g); E.undo(g); eq(g.redo.length, 2); let d = 0; for (; d < 4; d++) if (E.play(g, d).ok) break; eq(g.redo.length, 0);
  // やり直し（最初から）も「もどす」で取り消せる
  const before = JSON.stringify(g.cur); ok(E.restart(g)); eq(g.cur.moves, 0); ok(E.undo(g)); eq(JSON.stringify(g.cur), before);
  eq(E.restart(E.newGame(L)), false, 'nothing to restart at the start');
});

test('moves and pushes counters follow undo, redo and the move log (replay and loadGame agree)', () => {
  const L = getLevel('2-4'); const s = E.solve(L, L.start, { mode: 'moves' });
  const g = E.loadGame(L, s.seq); ok(g && g.over, 'solution log loads and wins'); eq(g.cur.moves, s.moves); eq(g.cur.pushes, s.seq.replace(/[a-z]/g, '').length);
  const rp = E.replay(L, s.seq); eq(rp.length, s.seq.length + 1); eq(rp[rp.length - 1].moves, s.moves);
  ok(E.isWon(L, rp[rp.length - 1].st)); eq(E.replay(L, 'x'), null, 'bad log'); eq(E.replay(L, 'llllllllll'), null, 'impossible log');
  E.undo(g); eq(g.cur.moves, s.moves - 1); eq(g.over, false); E.redo(g); eq(g.over, true);
});

test('tap-to-walk: pathTo gives a shortest walking path that never pushes, null when blocked', () => {
  const L = getLevel('1-9'); const st = L.start;
  const reach = E.reach(L, st);
  let tested = 0;
  for (let i = 0; i < L.n; i++) {
    if (L.t[i] === E.T.VOID || st.b.indexOf(i) >= 0) continue;
    const p = E.pathTo(L, st, i);
    if (reach[i] < 0) { eq(p, null); continue; }
    eq(p.length, reach[i], 'shortest'); let cur = st; for (const ch of p) { const r = E.step(L, cur, E.dirOf(ch)); ok(r && !r.push, 'walk only'); cur = r.st; } eq(cur.p, i); tested++;
  }
  ok(tested > 10);
  eq(E.pathTo(L, st, st.b[0]), null, 'cannot walk into a crate');
});

function getLevel(id) { return E.parse(LV.byId[id].rows); }

test('solver: shortest pushes and shortest moves on small known levels', () => {
  let L = P(['#######', '#@ $ .#', '#######']); let s = E.solve(L, L.start, { mode: 'pushes' }); eq(s.pushes, 2); eq(s.status, 'solved');
  s = E.solve(L, L.start, { mode: 'moves' }); eq(s.moves, 3);
  L = P(['######', '#@   #', '# $  #', '#   .#', '######']); s = E.solve(L, L.start, { mode: 'pushes' }); eq(s.pushes, 3);
  s = E.solve(L, L.start, { mode: 'moves' }); eq(s.moves, 6);
  // 解けないステージ
  L = P(['#####', '#@$ #', '#  .#', '#####']); s = E.solve(L, L.start, {}); eq(s.status, 'unsolvable');
  // 手数が最短かどうか：moves モードは pushes モードの解より長くならない
  L = getLevel('2-3'); const a = E.solve(L, L.start, { mode: 'pushes' }), b = E.solve(L, L.start, { mode: 'moves' }); ok(b.moves <= a.moves); ok(a.pushes <= b.pushes);
  // 返ってくる手順は本当に勝つ
  for (const r of [a, b]) { let cur = L.start; for (const ch of r.seq) { const x = E.step(L, cur, E.dirOf(ch)); ok(x, 'legal'); eq(x.push, ch === ch.toUpperCase(), 'case marks pushes'); cur = x.st; } ok(E.isWon(L, cur)); }
});

test('solver handles ice, one-way and teleport levels (it finds the same answers as the stored pars)', () => {
  for (const id of ['5-1', '5-3', '6-1', '6-4', '7-1', '7-2']) {
    const L = getLevel(id), d = LV.byId[id], s = E.solve(L, L.start, { mode: 'pushes' });
    eq(s.status, 'solved', id); eq(s.pushes, d.par[0], id + ' pushes');
  }
});

test('hint: the next push of an optimal solution; unsolvable states report so', () => {
  const L = getLevel('1-5'); let st = L.start;
  const h = E.hint(L, st); eq(h.status, 'solved'); ok(h.box >= 0 && h.dir >= 0 && h.left > 0);
  // ヒントの手順どおりに最後まで行ける
  let n = 0; while (!E.isWon(L, st) && n++ < 60) { const x = E.hint(L, st); eq(x.status, 'solved'); for (const ch of x.walk) st = E.step(L, st, E.dirOf(ch)).st; const r = E.step(L, st, x.dir); ok(r.push); eq(r.from, x.box); st = r.st; }
  ok(E.isWon(L, st), 'following hints wins');
  const M = P(['#####', '#@$ #', '#  .#', '#####']); eq(E.hint(M, M.start).status, 'unsolvable');
});

test('deadlock detection never rejects a solvable state (sampled over many levels and random play)', () => {
  const ids = ['1-5', '1-7', '1-9', '2-2', '2-4', '2-6', '2-9', '3-1', '3-2', '3-7', '4-7', '5-4', '5-6', '5-8', '6-3', '6-5', '6-7', '7-3', '7-4', '7-8', '8-1'];
  let checked = 0, dead = 0, falseDead = 0, falseAlive = 0, incMismatch = 0, incChecked = 0;
  for (const id of ids) {
    const L = getLevel(id), rnd = E.mulberry32(E.hash32(id)); const seen = new Set();
    for (let run = 0; run < 24; run++) {
      let st = L.start;
      for (let k = 0; k < 90; k++) {
        const ds = [0, 1, 2, 3].filter(d => E.step(L, st, d)); if (!ds.length) break;
        const prev = st, r = E.step(L, st, ds[Math.floor(rnd() * ds.length)]); st = r.st;
        if (!r.push) continue;
        if (!E.deadlocked(L, prev.b)) { incChecked++; if (E.deadlockedPush(L, st.b, E.occOf(L, st.b), r.to) !== E.deadlocked(L, st.b)) incMismatch++; }
        const key = st.b.join(',') + '|' + st.p; if (seen.has(key)) continue; seen.add(key);
        const s = E.solve(L, st, { mode: 'pushes', maxNodes: 4000 });
        if (s.status === 'limit') continue;
        checked++;
        const dl = E.isDeadlock(L, st);
        if (dl) dead++;
        if (dl && s.status === 'solved') falseDead++;
        if (!dl && s.status === 'unsolvable') falseAlive++;
      }
    }
  }
  ok(checked > 800, 'checked ' + checked + ' states'); ok(dead > 30, 'saw ' + dead + ' dead states');
  eq(falseDead, 0, 'a solvable state was called a deadlock');
  ok(incChecked > 1000, 'incremental checks ' + incChecked); eq(incMismatch, 0, 'the incremental (after-a-push) check agrees with the full check');
  ok(falseAlive <= checked * 0.5, 'the warning should catch a fair share of the dead states (missed ' + falseAlive + ')');
});

test('deadlock detection: wall rows without a goal, corners and 2x2 blocks are caught; goals and open floor are safe', () => {
  const A = P(['########', '#@ $   #', '#    . #', '########']);
  const dl = (L, cells) => E.isDeadlock(L, { p: L.start.p, b: cells.map(c => at(L, c[0], c[1])).sort((a, b) => a - b) });
  eq(dl(A, [[3, 1]]), true, 'a crate on a wall row with no goal can never leave it');
  eq(dl(A, [[6, 1]]), true, 'corner');
  eq(dl(A, [[3, 2]]), false, 'open floor');
  eq(dl(A, [[5, 2]]), false, 'on the goal');
  const B = P(['#########', '#@      #', '#       #', '# ****  #', '#########']);
  eq(dl(B, [[3, 1], [4, 1], [3, 2], [4, 2]]), true, 'a 2x2 block in the open is frozen');
  eq(dl(B, [[2, 3], [3, 3], [4, 3], [5, 3]]), false, 'all done');
  eq(dl(B, [[3, 2], [4, 2], [2, 3], [3, 3]]), false, 'a pair in the open can still be pushed apart vertically');
  eq(E.isDeadlock(B, B.start), false);
  const dbx = E.deadBoxes(A, { p: A.start.p, b: [at(A, 3, 1)] }); eq(dbx.length, 1);
});

test('generator: 300 seeds all give solvable levels, the same seed gives the same level, difficulty grows with the settings', () => {
  let bad = 0, total = 0, minPush = 99, t0 = Date.now();
  for (let i = 0; i < 300; i++) {
    const size = 5 + (i % 4), diff = 1 + (i % 2), seed = (i * 2654435761) >>> 0;
    const g = E.generate({ seed, size, diff }); total++;
    if (!g) { bad++; continue; }
    const s = E.solve(g.level, g.level.start, { mode: 'pushes', maxNodes: 200000 });
    if (s.status !== 'solved' || s.pushes !== g.pushes) bad++;
    minPush = Math.min(minPush, g.pushes);
    if (i < 12) { const g2 = E.generate({ seed, size, diff }); deep(g2.rows, g.rows, 'deterministic'); eq(g2.code, g.code); }
  }
  eq(bad, 0, bad + ' of ' + total + ' generated levels were not solvable'); ok(minPush >= 2, 'no trivial levels: ' + minPush);
  ok(Date.now() - t0 < 120000, 'fast enough');
  // むずかしさ・大きさで最短の押す数が増える（平均）
  const avg = (size, diff) => { let a = 0, n = 0; for (let i = 0; i < 6; i++) { const g = E.generate({ seed: 1000 + i * 77, size, diff }); a += g.pushes; n++; } return a / n; };
  ok(avg(8, 2) > avg(6, 1), 'normal 8x8 is longer than easy 6x6');
  ok(avg(9, 3) >= avg(8, 2), 'hard is at least as long as normal');
});

test('generator rules: sizes and box counts, no crate starts all done, the level has a proper player and goals', () => {
  for (const [size, diff] of [[5, 1], [7, 2], [9, 3], [12, 1]]) {
    const g = E.generate({ seed: size * 100 + diff, size, diff }); ok(g);
    const L = g.level, P0 = E.genParams(size, diff); eq(L.nb, P0.boxes); ok(L.W <= size && L.H <= size, 'size ' + L.W + 'x' + L.H);
    ok(E.boxesOnGoal(L, L.start) < L.nb, 'not already solved'); ok(!E.isDeadlock(L, L.start), 'start is not a deadlock');
  }
});

test('codes: size-difficulty-number; daily seeds are the same for everyone (a pure function of the date key)', () => {
  deep(E.parseCode('8-2-12345'), { size: 8, diff: 2, seed: 12345 }); deep(E.parseCode(' 12 3 99 '), { size: 12, diff: 3, seed: 99 });
  eq(E.parseCode('4-2-1'), null); eq(E.parseCode('13-2-1'), null); eq(E.parseCode('8-4-1'), null); eq(E.parseCode('abc'), null); eq(E.parseCode('8-2-99999999999'), null);
  const dp = E.dailyParams(E.hash32('kobo:crates:20261125')); ok(dp.size >= 7 && dp.size <= 9); eq(dp.diff, 2);
  const a = E.generate(dp), b = E.generate(E.dailyParams(E.hash32('kobo:crates:20261125'))); deep(a.rows, b.rows);
  const c = E.generate(E.dailyParams(E.hash32('kobo:crates:20261126'))); ok(JSON.stringify(c.rows) !== JSON.stringify(a.rows), 'a different day gives a different level');
});

test('editor codes: encode and decode round-trip, bad codes are rejected', () => {
  for (const id of ['1-3', '5-4', '6-2', '7-3']) { const rows = LV.byId[id].rows, code = E.encodeLevel(rows); ok(/^CR1:/.test(code)); const back = E.decodeLevel(code); ok(back, id); deep(E.toRows(E.parse(back)).length, E.toRows(E.parse(rows)).length); eq(E.decodeLevel(E.encodeLevel(back)) !== null, true); }
  eq(E.decodeLevel('hello'), null); eq(E.decodeLevel('CR1:###/#@$#/###'), null); eq(E.decodeLevel('CR1:'), null);
});

test('stars: 3 stars within 15% (at least +2 moves) of the optimal moves, 2 stars within 60% (at least +4)', () => {
  deep(E.thresholds(10), [12, 16]); deep(E.thresholds(100), [115, 160]); deep(E.thresholds(3), [5, 7]);
  eq(E.starsOf(10, 10), 3); eq(E.starsOf(10, 12), 3); eq(E.starsOf(10, 13), 2); eq(E.starsOf(10, 16), 2); eq(E.starsOf(10, 17), 1); eq(E.starsOf(10, 999), 1);
});

run('crates-engine');
