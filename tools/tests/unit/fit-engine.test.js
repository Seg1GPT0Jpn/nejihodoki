// fit/engine.js の単体テスト：全128ステージが解ける・保存した答えが盤をぴったり敷きつめる・決まった結果（同じ seed → 同じパズル）・
// 世界ごとに難しくなる・ヒント・やり直し・保存と復元・今日のパズルとタイムアタック。
// 実行：node tools/tests/unit/fit-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const F = require(path.join(ROOT, 'fit/engine.js'));

const cellsOf = (type, s) => F.shape(type, s.rot, s.flip).map(c => [c[0] + s.x, c[1] + s.y]);
function checkTiling(p, label) {
  const board = new Set(p.board.map(c => c.join(',')));
  const seen = new Set();
  for (const s of p.solution) {
    eq(p.pieces[s.id].type, s.type, label + ' solution piece type');
    ok(!p.pieces[s.id].decoy, label + ' solution uses a decoy');
    for (const c of cellsOf(s.type, s)) { const k = c.join(','); ok(board.has(k), label + ' cell off board ' + k); ok(!seen.has(k), label + ' overlap ' + k); seen.add(k); }
  }
  eq(seen.size, board.size, label + ' covers the whole board');
  eq(p.solution.length, p.req, label + ' all required pieces used');
  eq(new Set(p.solution.map(s => s.id)).size, p.solution.length, label + ' each piece once');
}

test('18 pieces plus the I-3 … every polyomino has the right size and 8 or fewer distinct orientations', () => {
  eq(F.TYPES.length, 19, 'piece count');
  for (const t of F.TYPES) {
    eq(F.PIECES[t].cells.length, F.PIECES[t].size, t + ' size');
    ok(F.ORI[t].length >= 1 && F.ORI[t].length <= 8, t + ' orientations');
    for (const o of F.ORI[t]) eq(o.cells.length, F.PIECES[t].size, t + ' orientation size');
  }
  eq(F.ORI.x5.length, 1, 'x5 is fully symmetric'); eq(F.ORI.o4.length, 1, 'o4'); eq(F.ORI.f5.length, 8, 'f5'); eq(F.ORI.t4.length, 4, 't4'); eq(F.ORI.l3.length, 4, 'l3');
  // the free polyominoes of sizes 3, 4, 5 are 2 + 5 + 12 = 19, all different
  const keys = new Set(); for (const t of F.TYPES) { const all = new Set(F.ORI[t].map(o => F.key(o.cells))); for (const k of all) { ok(!keys.has(k), 'duplicate shape ' + t); keys.add(k); } }
});

test('128 stages in 8 worlds, ids are stable', () => {
  eq(F.WORLDS.length, 8, 'worlds'); eq(F.STAGES.length, 128, 'stages');
  ok(F.STAGES.length >= 120 && F.WORLDS.length >= 6, 'at least 120 stages in 6 worlds');
  eq(F.STAGES[0].id, '1-1'); eq(F.STAGES[127].id, '8-16'); eq(F.STAGE_BY_ID['3-7'].index, 38);
  eq(new Set(F.STAGES.map(s => s.id)).size, 128, 'unique ids'); eq(new Set(F.STAGES.map(s => s.seed)).size, 128, 'unique seeds');
  eq(F.STAGES[0].seed, F.hash32('fit:stage:1-1'), 'seed is a hash of the id');
});

test('every stage: its stored solution tiles the board exactly, and the solver finds a tiling and reports the count', () => {
  for (const s of F.STAGES) {
    const p = F.stage(s.id);
    checkTiling(p, s.id);
    ok(p.req >= 3 && p.req <= 5, s.id + ' 3 to 5 required pieces');
    ok(p.board.length >= 9 && p.board.length <= 25, s.id + ' board size ' + p.board.length);
    for (const q of p.pieces) { const n = F.PIECES[q.type].size; ok(n >= 3 && n <= 5, s.id + ' piece size'); }
    const area = p.solution.reduce((a, q) => a + F.PIECES[q.type].size, 0); eq(area, p.board.length, s.id + ' area');
    const r = F.solve(p.board, p.pieces.map(q => q.type), { limit: 50 });
    ok(r.count >= 1, s.id + ' solvable'); eq(r.count, p.solutions, s.id + ' the reported solution count');
    ok(!r.capped, s.id + ' solver finished');
    // the board is a real puzzle: not a plain rectangle
    const w = Math.max(...p.board.map(c => c[0])) + 1, h = Math.max(...p.board.map(c => c[1])) + 1;
    ok(w * h !== p.board.length, s.id + ' not a rectangle'); eq(w, p.w); eq(h, p.h);
    // connected
    const set = new Set(p.board.map(c => c.join(','))), st = [p.board[0]], seen = new Set([p.board[0].join(',')]);
    while (st.length) { const c = st.pop(); for (const d of [[1, 0], [-1, 0], [0, 1], [0, -1]]) { const k = (c[0] + d[0]) + ',' + (c[1] + d[1]); if (set.has(k) && !seen.has(k)) { seen.add(k); st.push(k.split(',').map(Number)); } } }
    eq(seen.size, set.size, s.id + ' connected');
  }
});

test('difficulty ramps: bigger boards, decoys later, fewer solutions, awkward shapes', () => {
  const by = w => F.STAGES.filter(s => s.world === w).map(s => F.stage(s.id));
  const avg = (a, f) => a.reduce((x, p) => x + f(p), 0) / a.length;
  const cells = [1, 2, 3, 4, 5, 6, 7, 8].map(w => avg(by(w), p => p.board.length));
  ok(cells[0] < cells[2] && cells[2] < cells[5], 'boards grow ' + cells.map(x => x.toFixed(1)).join());
  const nodes = [1, 2, 3, 4, 5, 6, 7, 8].map(w => avg(by(w), p => p.nodes));
  ok(nodes[0] < nodes[3] && nodes[3] < nodes[6] && nodes[1] < nodes[7], 'search effort grows ' + nodes.map(x => x.toFixed(0)).join());
  for (const w of [1, 2, 3, 4]) ok(by(w).every(p => p.decoys === 0), 'no decoys in world ' + w);
  for (const w of [5, 6, 7, 8]) ok(by(w).every(p => p.decoys >= 1), 'decoys in world ' + w);
  ok(by(7).every(p => p.solutions <= 2) && by(8).every(p => p.solutions === 1), 'the last worlds are (nearly) unique');
  ok(avg(by(8), p => p.awk) >= 3 && avg(by(1), p => p.awk) < 1, 'awkward pieces late');
  ok(by(1).every(p => p.req === 3) && by(6).every(p => p.req === 5), 'piece counts');
  // decoys really are extra: the board area equals the required pieces
  for (const p of by(8)) eq(p.pieces.length, p.req + p.decoys);
});

// a digest of the whole campaign: if the generator changes, every stage changes. Update it on purpose (HANDOFF.md says why).
test('determinism: the same seed gives the same puzzle, and the campaign matches its digest', () => {
  for (const id of ['1-1', '4-9', '8-16']) {
    const a = F.stage(id), b = F.generate(F.STAGE_BY_ID[id].seed, F.stageSpec(F.STAGE_BY_ID[id].world, F.STAGE_BY_ID[id].n - 1));
    eq(F.describe(a), F.describe(b), id + ' regenerated'); eq(JSON.stringify(a.solution), JSON.stringify(b.solution), id + ' solution');
  }
  eq(F.describe(F.daily(12345)), F.describe(F.daily(12345)), 'daily'); ok(F.describe(F.daily(12345)) !== F.describe(F.daily(54321)), 'different days differ');
  eq(F.describe(F.attack(7, 3)), F.describe(F.attack(7, 3)), 'attack'); ok(F.describe(F.attack(7, 3)) !== F.describe(F.attack(8, 3)), 'different runs differ');
  let h = 0; for (const s of F.STAGES) { const d = F.describe(F.stage(s.id)); for (let i = 0; i < d.length; i++) h = (Math.imul(h, 31) + d.charCodeAt(i)) >>> 0; }
  eq(h, DIGEST, 'campaign digest (the stage list changed; saves stay valid but every stage is a different puzzle)');
});
const DIGEST = 3919978253;

test('daily puzzles and time attack puzzles are solvable, with an increasing level', () => {
  for (let d = 0; d < 40; d++) { const p = F.daily(F.hash32('kobo:fit:' + (20261101 + d))); checkTiling(p, 'daily ' + d); ok(p.decoys >= 1 && p.world >= 4, 'daily level'); ok(F.solve(p.board, p.pieces.map(q => q.type), { limit: 5 }).count >= 1, 'daily solvable'); }
  let first = 0, late = 0;
  for (let seed = 1; seed <= 6; seed++) for (let k = 0; k < 30; k++) { const p = F.attack(seed, k); checkTiling(p, 'attack ' + seed + ':' + k); if (k < 3) first += p.board.length; if (k >= 20) late += p.board.length; }
  ok(late / 6 / 10 > first / 6 / 3 + 5, 'time attack gets harder: ' + (first / 18).toFixed(1) + ' → ' + (late / 60).toFixed(1));
});

test('solver: counts tilings, honours pieces left out (decoys) and a partly filled board', () => {
  const sq = []; for (let y = 0; y < 2; y++) for (let x = 0; x < 2; x++) sq.push([x, y]);
  eq(F.solve(sq, ['o4']).count, 1); eq(F.solve(sq, ['l3']).count, 0, 'wrong size'); eq(F.solve(sq, ['o4', 'i5']).count, 1, 'a decoy may stay out');
  const row = [[0, 0], [1, 0], [2, 0], [3, 0], [4, 0], [5, 0]];
  eq(F.solve(row, ['i3', 'i3']).count, 1); eq(F.solve(row, ['i3', 'i3', 'i3']).count, 1, 'spare piece'); eq(F.solve(row, ['i3']).count, 0, 'not enough');
  const L = [[0, 0], [0, 1], [1, 1], [2, 1]]; // an L tetromino: 3 + 1 cannot tile it with an i3 only
  eq(F.solve(L, ['l4']).count, 1); eq(F.solve(L, ['i3', 'i3']).count, 0);
  eq(F.solve(row, ['i3', 'i3'], { occupied: new Set(['0,0', '1,0', '2,0']), limit: 5 }).count, 1, 'three cells are left: one i3 fits, the other stays out');
  eq(F.solve(row, ['i3', 'i3'], { occupied: new Set(['0,0', '1,0']), limit: 5 }).count, 0, 'four cells left cannot be tiled by i3s');
});

test('session: place / lift / turn / flip / undo / reset, solved detection and the decoy rule', () => {
  const p = F.stage('2-3'), S = F.newSession(p);
  ok(!S.solved(), 'starts unsolved');
  const s0 = p.solution[0];
  const pc = S.pieces[s0.id]; pc.rot = s0.rot; pc.flip = s0.flip;
  ok(S.canPlace(s0.id, s0.x, s0.y), 'solution spot fits'); ok(!S.canPlace(s0.id, -1, 0), 'off the board'); ok(!S.canPlace(s0.id, 50, 50), 'far away');
  ok(S.place(s0.id, s0.x, s0.y), 'placed'); eq(S.filled(), F.PIECES[s0.type].size);
  // another piece cannot overlap it
  const other = p.solution[1]; const q = S.pieces[other.id]; q.rot = other.rot; q.flip = other.flip;
  ok(!S.canPlace(other.id, s0.x, s0.y) || F.shape(other.type, other.rot, other.flip).every(c => !cellsOf(s0.type, s0).some(d => d[0] === c[0] + s0.x && d[1] === c[1] + s0.y)), 'no overlap');
  ok(S.undo(), 'undo'); ok(!S.pieces[s0.id].at, 'back in the tray'); ok(!S.undo(), 'nothing more to undo');
  for (const s of p.solution) { const z = S.pieces[s.id]; z.rot = s.rot; z.flip = s.flip; ok(S.place(s.id, s.x, s.y), 'place ' + s.id); }
  ok(S.solved(), 'solved'); eq(S.usedDecoys(), 0);
  S.reset(); eq(S.filled(), 0); ok(!S.solved(), 'reset'); ok(S.undo(), 'reset can be undone one piece at a time');
  // turning a placed piece turns it in place if it fits, otherwise back to the tray
  const T = F.newSession(F.stage('1-1')); const t0 = F.stage('1-1').solution[0];
  T.pieces[t0.id].rot = t0.rot; T.pieces[t0.id].flip = t0.flip; T.place(t0.id, t0.x, t0.y);
  const r = T.turn(t0.id, 'rot', 1); ok(['placed', 'lifted'].includes(r), 'turn result ' + r); T.turn(t0.id, 'rot', -1);
  // four turns come back to the start
  const U = F.newSession(F.stage('3-1')); const id = U.pieces[0].id, o = U.shapeOf(id).join('|'); for (let i = 0; i < 4; i++) U.turn(id, 'rot', 1); eq(U.shapeOf(id).join('|'), o, '4 turns'); U.turn(id, 'flip'); U.turn(id, 'flip'); eq(U.shapeOf(id).join('|'), o, '2 flips');
  // drop = a piece picked up from the board and put down elsewhere is one undo step
  const D = F.newSession(F.stage('1-1')); const d0 = F.stage('1-1').solution[0]; D.pieces[d0.id].rot = d0.rot; D.pieces[d0.id].flip = d0.flip; D.place(d0.id, d0.x, d0.y);
  const orig = { rot: D.pieces[d0.id].rot, flip: D.pieces[d0.id].flip, at: { x: d0.x, y: d0.y } }; D.pieces[d0.id].at = null;
  ok(D.drop(d0.id, d0.x, d0.y, orig), 'drop back'); ok(D.undo(), 'undo drop'); eq(D.pieces[d0.id].at.x, d0.x);
});

test('hint: always names a placement that still allows a full tiling; blocked boards lift the wrong pieces', () => {
  for (const id of ['1-4', '3-8', '5-2', '6-10', '8-3']) {
    const p = F.stage(id), S = F.newSession(p);
    // put a wrong piece somewhere legal first
    let wrong = null;
    outer: for (const q of S.pieces) for (let x = 0; x < p.w; x++) for (let y = 0; y < p.h; y++) for (let r = 0; r < 4; r++) { q.rot = r; if (S.canPlace(q.id, x, y)) { const sol = p.solution.find(s => s.id === q.id); if (!sol || sol.x !== x || sol.y !== y || sol.rot !== r) { S.place(q.id, x, y); wrong = q.id; break outer; } } }
    let guard = 0, hints = 0;
    while (!S.solved() && guard++ < 20) {
      const h = S.hint(); ok(h, id + ' hint exists'); hints++;
      const q = S.pieces[h.id]; q.rot = h.rot; q.flip = h.flip;
      ok(S.place(h.id, h.x, h.y), id + ' the hinted spot is free');
      const left = S.pieces.filter(z => !z.at).map(z => z.type), occ = new Set(); for (const z of S.pieces) if (z.at) for (const c of S.absCells(z.id, z.at.x, z.at.y)) occ.add(c.join(','));
      if (!S.solved()) ok(F.solve(p.board, left, { occupied: occ, limit: 1 }).count >= 1, id + ' a tiling is still possible after the hint');
    }
    ok(S.solved(), id + ' solved by hints alone (' + hints + ' hints, wrong piece ' + wrong + ')'); eq(S.hints, hints);
  }
});

test('snapshot / restore round trip, and a corrupt save falls back to an empty tray', () => {
  const p = F.stage('4-5'), S = F.newSession(p), s = p.solution[0];
  S.pieces[s.id].rot = s.rot; S.pieces[s.id].flip = s.flip; S.place(s.id, s.x, s.y);
  const snap = JSON.parse(JSON.stringify(S.snapshot())), R = new F.Session(p, snap);
  eq(JSON.stringify(R.snapshot()), JSON.stringify(snap), 'same snapshot'); ok(R.undo(), 'history survives');
  const bad = JSON.parse(JSON.stringify(snap)); bad.p[s.id][2] = 99; bad.p[s.id][3] = 99;
  const B = new F.Session(p, bad); ok(B.pieces.every(z => !z.at), 'corrupt save → tray');
  eq(new F.Session(p, { p: [] }).filled(), 0, 'wrong length is ignored');
});

test('stars and daily score', () => {
  const p = F.stage('2-1'); const a = p.par.three * 1000;
  eq(F.starsFor(p, a), 3); eq(F.starsFor(p, a + 1), 2); eq(F.starsFor(p, p.par.two * 1000), 2); eq(F.starsFor(p, p.par.two * 1000 + 1), 1);
  ok(p.par.three < p.par.two, 'par'); eq(F.dailyScore(0), 600); eq(F.dailyScore(60000), 540); eq(F.dailyScore(9e9), 1);
  ok(F.dailyScore(0) <= 1000, 'under the ranking cap');
});

run();
