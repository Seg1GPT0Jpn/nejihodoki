// drop/engine.js の単体テスト：ピースの形と出方（デイリーの順番が変わらない）・ライン判定と得点・12ステージ・Sim・ボットが全ステージを解く・進み具合の読み込み。
// 実行：node tools/tests/unit/drop-engine.test.js
'use strict';
const path = require('path');
const { ROOT, fresh, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'drop/engine.js'));

test('shapes, bags and kicks are unchanged (saved games and daily sequences stay valid)', () => {
  eq(Object.keys(E.SHAPES).length, 11); eq(E.BAG.length, 13); eq(E.COLOR_BAG.join(''), '00112233'); eq(E.KICKS.length, 9);
  deep(E.LINE_PTS, [0, 100, 300, 500, 800]); eq(E.SOROI_PTS, 1000); eq(E.COLS, 9); eq(E.H, 18);
  // the first pieces of a fixed seed: if these change every saved daily challenge changes
  const f = E.mulberry32(12345), st = { bag: [], cbag: [] }, a = [];
  for (let i = 0; i < 6; i++) { const q = E.nextSpec(st, f); a.push(q.t + q.c); }
  eq(a.join(), 'X53,V33,O41,S40,I42,V30', 'sequence for seed 12345');
});

test('mulberry32 / hash32 match KoboPlatform', () => {
  const { platform } = fresh({ files: ['games', 'platform'] });
  const P = globalThis.KoboPlatform || platform;
  const f = E.mulberry32(777), g = P.rng(777);
  for (let i = 0; i < 20; i++) eq(f(), g(), 'rng ' + i);
  eq(E.hash32('kobo:drop:20261124'), P.hash32('kobo:drop:20261124'));
});

test('analyze: full rows, Match Clear (one colour) takes the row below, rocks never match', () => {
  const b = E.emptyBoard();
  b[17] = [0, 1, 2, 3, 0, 1, 2, 3, 0]; b[16] = new Array(9).fill(2);
  let a = E.analyze(b, 1); deep(a.full, [16, 17]); deep(a.soroi, [16]); deep(a.extra, []); eq(a.pts, 300 + 1000);
  b[17] = new Array(9).fill(1); b[16] = [-1, 0, 0, 0, 0, 0, 0, 0, 0];
  a = E.analyze(b, 2); deep(a.full, [17]); deep(a.soroi, [17]); eq(a.pts, 100 * 2 + 1000 * 2);
  b[15] = new Array(9).fill(E.STONE); a = E.analyze(b, 1); ok(!a.soroi.includes(15), 'rocks are not a colour');
  const after = E.removeRows(b, [17]); eq(after.length, 18); eq(after[16].join(), b[15].join(), 'rows above drop down');
});

test('12 stages in 3 worlds: ids, goals, rocks, limits and stars are consistent', () => {
  eq(E.STAGES.length, 12); eq(E.WORLDS.length, 3); eq(E.stageById('2-3').index, 6); eq(E.stageById('9-9'), null);
  eq(new Set(E.STAGES.map(s => s.seed)).size, 12, 'seeds');
  for (const s of E.STAGES) {
    ok(['lines', 'score', 'soroi', 'clear'].includes(s.goal.t), s.id);
    ok(s.par3 < s.par2 && s.par2 < s.limit, s.id + ' par3 < par2 < limit');
    ok(!E.analyze(s.board, 1).full.length, s.id + ' no row is full at the start');
    ok(!E.topOut(s.board), s.id + ' not topped out');
    if (s.goal.t === 'clear') ok(E.stoneCount(s.board) > 0, s.id + ' has rocks');
    if (s.garbage && s.garbage.kind === 'stone') ok(E.stoneCount(s.board) > 0);
  }
  ok(E.STAGES[11].level > E.STAGES[0].level, 'speed grows');
  eq(E.starsFor(E.STAGES[0], E.STAGES[0].par3), 3); eq(E.starsFor(E.STAGES[0], E.STAGES[0].par2), 2); eq(E.starsFor(E.STAGES[0], 99), 1);
  eq(E.STAGES.map(s => E.cellCount(s.board)).join(), E.STAGES.map(s => E.cellCount(E.buildStage(E.DEFS[s.index], s.index).board)).join(), 'boards are deterministic');
});

test('Sim is deterministic and plays by the rules (score, lines, limit, fail)', () => {
  const run1 = () => { const s = new E.Sim('1-2'); const seen = []; for (let i = 0; i < 8 && s.status === 'play'; i++) { s.botStep(); seen.push(s.score + ':' + s.lines + ':' + s.cur.t + s.cur.c); } return seen; };
  deep(run1(), run1());
  const s = new E.Sim('1-1');
  eq(s.cur.t + s.cur.c, new E.Sim(0).cur.t + new E.Sim(0).cur.c, 'id and index are the same stage');
  eq(s.place([[0, 0]], -3), null, 'out of the well');
  const m = s.bot(); ok(m && E.collidesOn(s.board, m.cells, m.x, E.makePiece(s.cur).y) === false);
  const r = s.place(m.cells, m.x); ok(r && s.placed === 1 && s.score > 0);
  const lim = new E.Sim('1-1'); lim.placed = lim.stage.limit - 1; const mm = lim.bot(); lim.place(mm.cells, mm.x);
  eq(lim.status, 'lost', 'the last piece did not finish the goal'); eq(lim.place(mm.cells, mm.x), null); eq(lim.stars(), 0);
  const top = new E.Sim({ seed: 3, level: 1 }); for (let i = 0; i < 60 && top.status === 'play'; i++) top.place(E.makePiece(top.cur).cells, 4);
  eq(top.status, 'lost', 'stacking in one column tops out');
});

test('the bot clears every stage within its limit, and the pars are reachable', () => {
  for (const st of E.STAGES) {
    const r = E.botPlay(st.id, st.limit + 5);
    eq(r.status, 'won', st.id + ' won by the bot (placed ' + r.placed + ')');
    ok(r.placed <= st.par2, st.id + ' the bot gets at least 2 stars: ' + r.placed + ' <= ' + st.par2);
    ok(r.stars() >= 2);
  }
});

test('goal progress for each goal type', () => {
  const g = id => E.stageById(id);
  deep(E.goalProgress(g('1-1'), { lines: 2, soroi: 0, score: 0, stones: 0 }), { have: 2, need: 4, done: false });
  eq(E.goalProgress(g('1-3'), { lines: 0, soroi: 1, score: 0, stones: 0 }).done, true);
  eq(E.goalProgress(g('1-4'), { lines: 0, soroi: 0, score: 1500, stones: 0 }).done, true);
  const c = g('2-3'), tot = E.stoneCount(c.board);
  eq(E.goalProgress(c, { lines: 0, soroi: 0, score: 0, stones: tot }).have, 0); eq(E.goalProgress(c, { lines: 0, soroi: 0, score: 0, stones: 0 }).done, true);
});

test('saved progress: reading is forgiving, writing is compact, unlocking follows stars', () => {
  deep(E.readProgress(null).s, new Array(12).fill(0)); eq(E.readProgress('{oops').sp, 0); eq(E.readProgress({ v: 2, s: [3] }).s[0], 0);
  const p = E.readProgress({ v: 1, s: [1, 2, 3, 3, 9, -4, 'x'], sp: 61234.9, extra: 1 });
  deep(p.s.slice(0, 7), [1, 2, 3, 3, 0, 0, 0]); eq(p.sp, 61234);
  eq(E.readProgress({ v: 1, s: [], sp: 5 }).sp, 0, 'implausibly fast times are dropped');
  eq(JSON.parse(E.writeProgress({ s: p.s, sp: 0 })).sp, undefined); eq(JSON.parse(E.writeProgress(p)).sp, 61234);
  ok(E.unlocked(p, 0) && E.unlocked(p, 4) && !E.unlocked(p, 5));
});

run('drop-engine');
