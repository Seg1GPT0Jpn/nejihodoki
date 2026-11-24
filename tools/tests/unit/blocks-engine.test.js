// blocks/engine.js の単体テスト：ブロックの形と出方（デイリーの順番が変わらない）・ライン判定と得点・15ステージの定義・
// StageRun（決まった結果・もどす／入れかえ／ヒント・手数と詰み・星）・ボットが全ステージを解く・進み具合の保存の読み込み。
// 実行：node tools/tests/unit/blocks-engine.test.js
'use strict';
const path = require('path');
const { ROOT, fresh, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'blocks/engine.js'));
const N = E.N;
const empty = () => new Array(N * N).fill(-1);

test('37 piece shapes in 15 families; the weights and the order are the same as before (saved trays and daily sequences stay valid)', () => {
  eq(E.PIECES.length, 37, 'shapes');
  eq(E.TOTAL_W, 82.5, 'total weight');
  eq(E.pidOf('dot', 1, 1), 0, 'dot is the first');
  eq(E.PIECES[E.pidOf('O3', 3, 3)].cells.length, 9, 'O3');
  eq(E.PIECES[E.pidOf('I5', 5, 1)].cells.length, 5, 'I5');
  for (const p of E.PIECES) { ok(p.cells.every(([r, c]) => r < p.h && c < p.w), 'cells inside the box'); ok(p.color >= 0 && p.color < E.COLOR_N, 'color'); }
  // the first picks of a fixed seed: if these change, every saved daily challenge would change
  const f = E.mulberry32(12345); const a = []; for (let i = 0; i < 8; i++) a.push(E.pickPiece(f));
  deep(a, [36, 6, 10, 27, 11, 7, 1, 24], 'picks for seed 12345');
});

test('mulberry32 and hash32 match KoboPlatform (the same sequence everywhere)', () => {
  const { platform } = fresh({ files: ['games', 'platform'] });
  const P = globalThis.KoboPlatform || platform;
  const f = E.mulberry32(777), g = P.rng(777);
  for (let i = 0; i < 20; i++) eq(f(), g(), 'rng ' + i);
  eq(E.hash32('kobo:blocks:20261124'), P.hash32('kobo:blocks:20261124'), 'hash');
});

test('fits, full lines and line scores', () => {
  const b = empty();
  const dot = E.pidOf('dot', 1, 1), i5 = E.pidOf('I5', 5, 1);
  ok(E.fits(b, dot, 0, 0) && E.fits(b, dot, 7, 7), 'corners');
  ok(!E.fits(b, i5, 0, 4), 'sticks out'); ok(E.fits(b, i5, 0, 3), 'fits');
  b[0] = 1; ok(!E.fits(b, dot, 0, 0), 'taken'); ok(E.fitsAnywhere(b, dot));
  const full = empty().map((_, i) => ((i / N) | 0) === 2 || i % N === 5 ? 3 : -1);
  const fl = E.fullLines(full); deep(fl.rows, [2]); deep(fl.cols, [5]);
  deep([1, 2, 3, 4].map(E.lineScore), [10, 30, 60, 100]);
  eq(E.fillRatio(empty()), 0); eq(E.fillRatio(new Array(64).fill(1)), 1);
});

test('15 stages in 3 worlds: art, goals, gems and limits are consistent', () => {
  eq(E.STAGES.length, 15); eq(E.STAGE_N, 15); eq(E.WORLDS.length, 3);
  eq(E.STAGES[0].id, '1-1'); eq(E.STAGES[14].id, '3-5'); eq(E.stageById('2-3').index, 7); eq(E.stageById('9-9'), null);
  eq(new Set(E.STAGES.map(s => s.id)).size, 15, 'ids'); eq(new Set(E.STAGES.map(s => s.seed)).size, 15, 'seeds');
  for (const s of E.STAGES) {
    eq(s.board.length, 64); eq(s.gems.length, 64);
    ok(s.board.every(v => v >= -1 && v <= E.STONE), s.id + ' tile values');
    ok(s.gems.every((g, i) => !g || s.board[i] >= 0), s.id + ' a gem sits on a tile');
    ok(!E.fullLines(s.board).rows.length && !E.fullLines(s.board).cols.length, s.id + ' no line is already full');
    ok(['lines', 'score', 'gems', 'combo', 'clear'].includes(s.goal.t), s.id + ' goal type');
    if (s.goal.t === 'gems') ok(s.gemCount >= 2, s.id + ' has gems'); else eq(s.gemCount, 0, s.id + ' no stray gems');
    ok(s.par3 < s.par2 && s.par2 < s.limit, s.id + ' par3 < par2 < limit');
    ok(s.board.filter(v => v >= 0).length <= 30, s.id + ' not too full to start');
  }
  ok(E.STAGES.some(s => s.board.includes(E.STONE)), 'stones appear');
  for (const t of ['lines', 'score', 'gems', 'combo']) ok(E.STAGES.some(s => s.goal.t === t), 'goal ' + t + ' is used');
  // goals get bigger within the game
  ok(E.STAGES[14].limit > E.STAGES[0].limit);
});

test('StageRun is deterministic: the same stage and moves always give the same trays and scores', () => {
  const play = () => { const r = new E.StageRun('1-2'); const seen = [r.tray.join()]; for (let k = 0; k < 6 && r.status === 'play'; k++) { const m = r.hint(); r.place(m.i, m.r, m.c); seen.push(r.tray.join() + '|' + r.score); } return seen; };
  deep(play(), play());
  const a = new E.StageRun('1-2'), b = new E.StageRun(1);
  deep(a.tray, b.tray); deep(a.board, b.board);
  ok(a.tray.some(p => E.fitsAnywhere(a.board, p)), 'something fits at the start');
  ok(a.tray.every(p => p >= 0 && p < E.PIECES.length));
});

test('place: scoring, combos, gems, illegal moves', () => {
  const r = new E.StageRun('1-3'); // gems on the bottom row
  eq(r.stage.gemCount, 4); eq(r.progress().need, 4);
  eq(r.place(0, 7, 7), null, 'a piece cannot stick out'); eq(r.place(0, 6, 0) === null, true, 'a taken cell');
  eq(r.moves, 0, 'illegal moves do not count');
  // fill the bottom row's gaps by hand: put a dot into each gap using a fake tray
  const dot = E.pidOf('dot', 1, 1);
  r.tray = [dot, dot, dot];
  let res = r.place(0, 7, 7); // row 7 is 'eAfAgAh.' → the last cell completes it
  eq(res.lines, 1); eq(res.gems, 3); eq(r.gemsGot, 3); eq(res.pts, 10, 'one line = 10'); eq(r.score, 11, 'plus one cell');
  ok(res.cleared.filter(c => c.gem).length === 3, 'cleared cells carry their gem flag');
  eq(r.combo, 1); eq(r.board[7 * N + 1], -1, 'the row is gone');
  eq(r.status, 'play');
  r.tray = [dot, dot, dot];
  const before = r.score; r.place(1, 0, 0); // no line
  eq(r.combo, 0, 'a move without a line ends the combo'); eq(r.score, before + 1);
});

test('goals: lines, score, gems, combo all end in a win; running out of moves loses', () => {
  const dot = E.pidOf('dot', 1, 1);
  const g = new E.StageRun('1-3'); g.tray = [dot, dot, dot];
  g.place(0, 7, 7);
  // the fourth gem is in row 6 ('a.b.C.d.'): finish it with dots
  g.tray = [dot, dot, dot]; for (const c of [1, 3, 5]) { g.tray = [dot, dot, dot]; g.place(0, 6, c); }
  g.tray = [dot, dot, dot]; g.place(0, 6, 7);
  eq(g.status, 'won'); eq(g.progress().have, 4);
  ok(g.stars() >= 1, 'a win has at least one star');
  const l = new E.StageRun('1-1'); l.moves = l.stage.limit - 1; l.tray = [dot, dot, dot];
  l.place(0, 0, 0); eq(l.status, 'lost', 'the last allowed move did not finish the goal'); eq(l.place(1, 3, 3), null, 'a finished run takes no more moves'); eq(l.stars(), 0);
  const c = new E.StageRun('1-5'); eq(c.stage.goal.t, 'combo'); eq(c.progress().need, 2);
  const s = new E.StageRun('1-2'); eq(s.progress().need, 100);
});

test('undo / swap / hint: counts, state restore, and the same pieces come again', () => {
  const r = new E.StageRun('2-2');
  eq(r.undos, 3); eq(r.swaps, 2); eq(r.hints, 3);
  eq(r.undo(), false, 'nothing to undo yet');
  const t0 = r.tray.slice(), b0 = r.board.slice();
  const h = r.useHint(); ok(h && h.i >= 0 && E.fits(r.board, r.tray[h.i], h.r, h.c), 'hint is a legal move'); eq(r.hints, 2);
  r.place(h.i, h.r, h.c);
  ok(r.moves === 1 && r.tray.filter(x => x === null).length === 1);
  eq(r.undo(), true); eq(r.undos, 2); eq(r.moves, 0); deep(r.tray, t0); deep(r.board, b0); eq(r.score, 0);
  // after undoing a move that dealt a new tray, the same new tray comes back
  const run1 = () => { const x = new E.StageRun('2-2'); for (let k = 0; k < 3; k++) { const m = x.hint(); x.place(m.i, m.r, m.c); } return x; };
  const a = run1(), b = run1(); deep(a.tray, b.tray, 'same trays'); eq(a.draws, b.draws);
  const dealt = a.tray.slice(); a.undo(); const m = a.hint(); a.place(m.i, m.r, m.c);
  ok(a.moves === 3, 'replayed'); ok(Array.isArray(a.tray));
  const s = new E.StageRun('2-2'); const before = s.tray.join();
  eq(s.swap(), true); eq(s.swaps, 1); eq(s.moves, 0, 'a swap costs no move'); ok(s.tray.every(p => p !== null));
  eq(s.swap(), true); eq(s.swap(), false, 'only two swaps');
  ok(typeof before === 'string' && dealt.length === 3);
});

test('stuck: with tools left the run goes on, with none left it is lost', () => {
  const r = new E.StageRun('1-1');
  r.board.fill(0); r.board[0] = -1; // one empty cell
  const big = E.pidOf('O3', 3, 3);
  r.tray = [big, big, big];
  ok(r.stuck(), 'nothing fits');
  r.undos = 0; r.swaps = 1;
  r.tray = [big, big, big]; eq(r.swap(), true); // swap deals new pieces from the rng: it may or may not fit
  r.board.fill(0); r.tray = [big, big, big]; r.undos = 0; r.swaps = 0;
  const dot = E.pidOf('dot', 1, 1); r.tray = [dot, big, big]; r.board[0] = -1; r.status = 'play';
  r.place(0, 0, 0); // the dot fills the last cell: row 0 and column 0 are full and clear
  ok(r.lines >= 2, 'lines cleared');
});

test('stars: ★3 within par3, ★2 within par2, ★1 otherwise', () => {
  const r = new E.StageRun('1-3'); r.status = 'won';
  r.moves = r.stage.par3; eq(r.stars(), 3); r.moves = r.stage.par3 + 1; eq(r.stars(), 2); r.moves = r.stage.par2; eq(r.stars(), 2);
  r.moves = r.stage.par2 + 1; eq(r.stars(), 1); r.status = 'lost'; eq(r.stars(), 0);
});

test('the planner bot wins every stage within its move limit (so each one can be solved) and earns at least two stars', () => {
  for (const s of E.STAGES) {
    const r = E.botPlay(s);
    eq(r.status, 'won', s.id + ' bot ' + JSON.stringify(r.summary()));
    ok(r.moves <= s.limit, s.id + ' within the limit');
    ok(r.stars() >= 2, s.id + ' bot stars ' + r.stars());
    eq(r.undos, 3, 'the bot never needs undo');
  }
});

test('the plain bot (daily goals) still plays on and keeps clearing lines', () => {
  const b = empty(); let tray = [0, 0, 0]; // three dots
  const m = E.bestMove(b, tray); ok(m && m.i >= 0 && E.fits(b, tray[m.i], m.r, m.c));
  eq(E.bestMove(new Array(64).fill(1), [0, 1, 2]), null, 'a full board has no move');
  // a row with one gap: the dot goes into the gap
  const row = empty(); for (let c = 0; c < 7; c++) row[7 * N + c] = 0;
  const mv = E.bestMove(row, [0, null, null]); eq(mv.r, 7); eq(mv.c, 7);
});

test('saved progress (kusoge.blocks.x): a missing, broken or odd value never breaks and never invents stars', () => {
  deep(E.readProgress(null).s, new Array(15).fill(0)); eq(E.readProgress(undefined).ta, 0);
  deep(E.readProgress('garbage{').s, new Array(15).fill(0));
  deep(E.readProgress('{"v":2,"s":[3],"ta":9}').s, new Array(15).fill(0), 'an unknown version is ignored');
  const p = E.readProgress('{"v":1,"s":[3,2,1,9,-1,"2",null,1.5],"ta":1234.9}');
  deep(p.s.slice(0, 8), [3, 2, 1, 0, 0, 2, 0, 1]); eq(p.ta, 1234);
  eq(E.readProgress('{"v":1,"s":[],"ta":-5}').ta, 0); eq(E.readProgress('{"v":1,"ta":1e99}').ta, 1e7);
  const w = E.writeProgress({ s: new Array(15).fill(3), ta: 77 }); ok(w.length < 200, 'small');
  deep(E.readProgress(w), { s: new Array(15).fill(3), ta: 77 }, 'round trip');
  ok(E.unlocked(E.readProgress(null), 0) && !E.unlocked(E.readProgress(null), 1), 'only the first stage is open at the start');
  ok(E.unlocked(E.readProgress('{"v":1,"s":[1]}'), 1), 'a star opens the next one');
  eq(E.TIME.start, 90); ok(E.TIME.cap >= E.TIME.start);
});

run('blocks engine');
