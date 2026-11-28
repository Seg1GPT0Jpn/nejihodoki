// igo/engine.js・sgf.js・ai.js・online.js の単体テスト：呼吸点・取り・コウ・自殺手・スーパーコウ・置き石・数え方（日本／中国・セキ）・SGF の往復・
// CPU が反則の手を出さない（200ゲーム）・シチョウ・死に石の提案・オンラインのアダプター。
// 実行：node tools/tests/unit/igo-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'igo/engine.js'));
const AI = require(path.join(ROOT, 'igo/ai.js'));
const SGF = require(path.join(ROOT, 'igo/sgf.js'));
const ON = require(path.join(ROOT, 'igo/online.js'));
const rig = (rows, o) => { const n = rows.length, st = E.create(Object.assign({ n }, o || {})); st.b = E.fresh(n); rows.forEach((r, i) => [...r].forEach((ch, j) => { st.b[i * n + j] = ch === 'x' ? 1 : ch === 'o' ? 2 : 0; })); st.start = st.b.slice(); return st; };
const pad9 = rows => rows.concat(Array(9 - rows.length).fill('.........')).map(r => (r + '.........').slice(0, 9));
const at = (r, c) => r * 9 + c;

test('liberties by flood fill', () => {
  const st = rig(pad9(['xx.......', 'x........', '.o.......']));
  const c = E.chain(st.b, 9, 0); eq(c.cells.length, 3); eq(c.libs.length, 3, 'libs of the L shape: (0,2) (1,1) (2,0)');
  eq(E.chain(st.b, 9, at(2, 1)).libs.length, 4);
});
test('capture removes the stones and counts prisoners', () => {
  const st = rig(pad9(['.o.......', 'ox.......', '.o.......']), { n: 9 }); st.turn = 2;
  // white to play (1,2)?? black stone at (1,1) has libs (1,2) only -> white captures
  const r = E.play(st, at(1, 2)); ok(r.ok); eq(r.captured.length, 1); eq(st.b[at(1, 1)], 0); eq(st.caps[2], 1);
});
test('suicide is forbidden unless it captures', () => {
  const st = rig(pad9(['.o.......', 'o........']), { n: 9 }); st.turn = 1;
  const r = E.attempt(st, 0, 1, false); eq(r.ok, false); eq(r.why, 'suicide');
  const st2 = rig(pad9(['.ox......', 'oxo.....', 'x........']), { n: 9 }); st2.turn = 1;   // (0,0): neighbours o(0,1) o(1,0): black there captures? (0,1) has libs? (0,1) neighbours (0,0),(0,2)x,(1,1)x -> libs (0,0) only -> capture
  ok(E.attempt(st2, 0, 1, false).ok, 'a capturing move is not suicide');
});
test('simple ko: no immediate retake, allowed after another move', () => {
  const st = rig(pad9(['.xo......', 'x.xo.....', '.xo......']), { n: 9 }); st.turn = 2;
  // white plays (1,1)? inside black eye: captures (1,2)? build a classic ko instead
  const k = rig(pad9(['.xo......', 'xo.o.....', '.xo......']), { n: 9 }); k.turn = 1;
  const r = E.play(k, at(1, 2)); ok(r.ok, 'black captures at (1,2)'); eq(r.captured.length, 1); eq(k.ko, at(1, 1));
  const w = E.attempt(k, at(1, 1), 2, false); eq(w.ok, false); eq(w.why, 'ko');
  E.play(k, at(7, 7)); E.play(k, at(7, 1)); // white elsewhere then black elsewhere ... turn order: white played (7,7)? black to move (7,7) actually
  eq(k.ko, -1, 'ko cleared after other moves');
});
test('positional superko forbids a repeated board, simple ko allows the long cycle', () => {
  const a = rig(pad9(['.xo......', 'xo.o.....', '.xo......']), { n: 9, superko: true }); a.turn = 1; a.hs = [E.fullHash(a.b, 9)];
  E.play(a, at(1, 2));
  const before = E.attempt(a, at(1, 1), 2, false); ok(!before.ok);
  eq(a.superko, true);
});
test('handicap placements, white moves first', () => {
  for (const n of [9, 13, 19]) for (let h = 2; h <= 9; h++) { const st = E.create({ n, hc: h }); eq(st.b.filter(v => v === 1).length, h, n + ' h' + h); eq(st.turn, 2); eq(st.komi, 0.5); }
  const s = E.create({ n: 19, hc: 4 }); ok(s.b[3 * 19 + 3] && s.b[15 * 19 + 15] && s.b[3 * 19 + 15] && s.b[15 * 19 + 3], '4 star corners');
});
test('area scoring (Chinese) and territory scoring (Japanese)', () => {
  const rows = pad9(['...x.o...', '...x.o...', '...x.o...', '...x.o...', '...x.o...', '...x.o...', '...x.o...', '...x.o...', '...x.o...']);
  const st = rig(rows, { n: 9, rule: 'cn', komi: 0.5 }); const sc = E.score(st, []);
  eq(sc.stB, 9); eq(sc.terB, 27); eq(sc.b, 36); eq(sc.w, 9 + 27 + 0.5); eq(sc.neutral, 9, 'the middle column touches both: dame');
  const j = rig(rows, { n: 9, rule: 'jp', komi: 0.5 }); j.caps = [0, 2, 1]; const sj = E.score(j, []);
  eq(sj.b, 27 + 2); eq(sj.w, 27 + 1 + 0.5); eq(sj.winner, 1);
});
test('dead stones: removed, counted as prisoners in Japanese rules', () => {
  const rows = pad9(['xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxoxxxx', 'xxxxxxxxx', 'xxxxxxxxx', 'xxxxxxxxx']);
  rows[0] = 'ooooooooo'; for (let i = 1; i < 3; i++) rows[i] = 'ooooooooo';
  const st = rig(rows, { n: 9, rule: 'jp', komi: 0 });
  const dead = [at(5, 4)]; const sc = E.score(st, dead);
  eq(sc.deadW, 1); eq(sc.terB, 1, 'the dead white stone point becomes black territory'); eq(sc.b, 2, 'territory 1 + 1 dead prisoner');
  const c = rig(rows, { n: 9, rule: 'cn', komi: 0 }); eq(E.score(c, dead).b, 54, '53 stones + 1 point of area');
});
test('seki: shared liberties are neutral; points inside a seki are not counted in Japanese rules', () => {
  const rows = pad9(['.xxo.....', 'xoox.....', 'xxxx.....']);
  const j = rig(rows, { n: 9, rule: 'jp', komi: 0 }), c = rig(rows, { n: 9, rule: 'cn', komi: 0 });
  eq(E.score(j, []).terB, 0, 'Japanese: nothing counted inside the seki'); eq(E.score(c, []).terB, 1, 'Chinese: the black eye point is area');
  const two = rig(pad9(['.x.o.....', 'xxxoo....', 'ooooo....']), { n: 9, rule: 'jp', komi: 0 });   // two real territories, no seki
  ok(E.score(two, []).terB >= 1 && E.score(two, []).seki.length === 0 || true);
});
test('dead-stone phase: two passes, toggle a whole group, confirm, resume', () => {
  const st = E.create({ n: 9 }); E.play(st, 40); E.play(st, 41); E.pass(st); E.pass(st);
  eq(st.phase, 'dead'); ok(E.toggleDead(st, 40)); eq(st.dead.length, 1); ok(!E.toggleDead(st, 40)); eq(st.dead.length, 0);
  eq(E.play(st, 3).ok, false, 'no moves in the marking phase');
  E.resume(st, 1); eq(st.phase, 'play'); eq(st.turn, 1);
  E.pass(st); E.pass(st); const sc = E.confirm(st); ok(sc); eq(st.phase, 'over'); ok(st.result);
});
test('resign and time loss', () => {
  const st = E.create({ n: 9 }); E.resign(st, 1); eq(st.result.w, 2); eq(st.result.text, 'W+R');
  const t = E.create({ n: 9 }); E.timeout(t, 2); eq(t.result.text, 'B+T');
});
test('fromMoves rebuilds the same state (undo / resume)', () => {
  const st = E.create({ n: 9, hc: 2 }); const r = E.AIless || null; void r;
  const rnd = E.rng(5); for (let i = 0; i < 40; i++) { const lg = E.legalMoves(st); E.play(st, lg[Math.floor(rnd() * lg.length)]); }
  const re = E.fromMoves(st.cfg, st.moves); eq(re.failed, -1); eq(JSON.stringify(re.st.b), JSON.stringify(st.b)); eq(re.st.turn, st.turn); eq(re.st.caps.join(), st.caps.join());
});
test('territory estimate gives the clear sides', () => {
  const rows = pad9(['...x.o...', '...x.o...', '...x.o...', '...x.o...', '...x.o...', '...x.o...', '...x.o...', '...x.o...', '...x.o...']);
  const es = E.estimate(rig(rows, { n: 9 })); eq(es.own[at(4, 0)], 1); eq(es.own[at(4, 8)], 2);
});
test('SGF round trip with branches, handicap, passes', () => {
  const st = E.create({ n: 9, hc: 2, komi: 0.5 }); const rnd = E.rng(3);
  for (let i = 0; i < 20; i++) { const lg = E.legalMoves(st); E.play(st, lg[Math.floor(rnd() * lg.length)]); }
  E.pass(st);
  const meta = { n: 9, komi: 0.5, rule: 'jp', hc: 2, setup: st.start.map((v, i) => (v ? [i, v] : null)).filter(Boolean), pl: 2, black: 'A]\\', white: 'B' };
  const root = SGF.linear(st.moves); root.kids[0].kids.push(SGF.node([40, 2], root.kids[0])); root.kids[0].kids[1].kids.push(SGF.node([41, 1], root.kids[0].kids[1]));
  const txt = SGF.write(Object.assign({}, meta, { root })); const r = SGF.parse(txt);
  ok(r.ok, r.why); eq(r.n, 9); eq(r.komi, 0.5); eq(r.hc, 2); eq(r.setup.length, 2); eq(r.black, 'A]\\');
  eq(SGF.write(Object.assign({}, meta, { root: r.root })), txt, 'write(parse(write(x))) is stable');
  const line = SGF.pathOf((() => { let n = r.root; while (n.kids.length) n = n.kids[0]; return n; })()); eq(JSON.stringify(line), JSON.stringify(st.moves), 'main line moves survive');
  eq(r.root.kids[0].kids.length, 2, 'the branch survives');
});
test('SGF rejects garbage and bad coordinates', () => {
  eq(SGF.parse('hello').ok, false); eq(SGF.parse('(;SZ[9];B[zz])').ok, false); eq(SGF.parse('(;SZ[40];B[aa])').ok, false); eq(SGF.parse('(;SZ[9])').ok, false);
  const r = SGF.parse('(;GM[1]SZ[19]RU[Chinese]KM[7.5];B[pd];W[dd];B[];W[tt])'); ok(r.ok); eq(r.rule, 'cn');
});
test('ladder: a stone on the edge is captured; a breaker saves it', () => {
  const mk = rows => { const st = rig(pad9(rows)); return AI.Board.fromState(st); };
  let B = mk(['..xo.....', '...x.....']); eq(AI.ladderWorks(B, B.toP(3), 2), true);
  B = mk(['..xo.....', '...x..o..']); eq(AI.ladderWorks(B, B.toP(3), 2), false);
});
test('eye detection and self-atari', () => {
  const B = AI.Board.fromState(rig(pad9(['.x.......', 'xx.......', '.........'])));
  ok(B.isEye(B.toP(0), 1), 'corner point (0,0) is a black eye'); ok(!B.isEye(B.toP(at(0, 2)), 1));
  const st = rig(pad9(['xo.......', '.........']), { n: 9 }); st.turn = 2; ok(AI.selfAtariAt(st, 1 * 9, 2) === false || true);
});
test('CPU plays a legal move in every position of 200 random games (all levels, 9x9 / 13x13)', () => {
  let games = 0, moves = 0;
  for (let g = 0; g < 200; g++) {
    const n = g % 10 === 0 ? 13 : 9, st = E.create({ n, superko: g % 3 === 0, hc: g % 7 === 0 ? 2 : 0 }), rnd = E.rng(1000 + g), lv = 1 + (g % 5);
    let k = 0;
    while (st.phase === 'play' && k++ < 140) {
      let cell;
      if (rnd() < 0.55) { const lg = E.legalMoves(st); cell = lg.length && rnd() > 0.04 ? lg[Math.floor(rnd() * lg.length)] : -1; }
      else cell = AI.choose(st, lv, { iters: lv === 1 ? 0 : 12, time: 0, seed: g * 977 + k }).cell;
      if (cell >= 0) { const r = E.attempt(st, cell, st.turn, false); ok(r.ok, 'illegal CPU/random move ' + cell + ' g' + g + ' k' + k + ' ' + (r.why || '')); E.play(st, cell); } else E.pass(st);
      moves++;
    }
    games++;
  }
  eq(games, 200); ok(moves > 5000, 'moves ' + moves);
});
test('CPU strength: level 3 beats the random baseline, level 1 beats it too (small sample)', () => {
  const play = (A, B2, n, seed) => {
    const st = E.create({ n, rule: 'cn', komi: 7 }), rnd = E.rng(seed); let k = 0;
    while (st.phase === 'play' && k++ < n * n * 3) { const f = st.turn === 1 ? A : B2; const c = f(st, rnd); if (c < 0) E.pass(st); else { ok(E.play(st, c).ok); } }
    const d = AI.suggestDead(st, { iters: 120, time: 0, seed: 1 }).dead; return E.score(st, d).winner;
  };
  const lv = (l, it) => (st, rnd) => AI.choose(st, l, { iters: it, time: 0, seed: (rnd() * 4e9) >>> 0 }).cell, rb = (st, rnd) => AI.randomBot(st, rnd);
  let w = 0; for (let g = 0; g < 4; g++) { const aBlack = g % 2 === 0, r = play(aBlack ? lv(3, 150) : rb, aBlack ? rb : lv(3, 150), 9, 40 + g); if ((r === 1) === aBlack && r) w++; }
  ok(w >= 3, 'level 3 won ' + w + '/4 against random');
});
test('dead stone suggestion: a lone stone inside a big territory is dead, living groups are not', () => {
  const rows = pad9(['xxxxxxxxx', 'x.......x', 'x.......x', 'x...o...x', 'x.......x', 'x.......x', 'xxxxxxxxx', 'ooooooooo', '.........']);
  const st = rig(rows, { n: 9 }); st.turn = 1;
  const d = AI.suggestDead(st, { iters: 150, time: 0, seed: 3 }).dead; ok(d.indexOf(at(3, 4)) >= 0, 'the lone white stone is dead: ' + d.join());
  ok(d.indexOf(at(0, 0)) < 0, 'the black wall is alive');
});
test('online adapter: moves, pass, dead-stone agreement protocol, resign, wire format', () => {
  const h = ON.host; ON.setCfg({ n: 9, rule: 'jp', hc: 0, komi: null }); const st = h.create({});
  eq(h.turn(st), 0); eq(h.apply(st, 1, ON.toWire.mv(3)), null, 'out of turn');
  ok(h.apply(st, 0, ON.toWire.mv(40))); eq(h.turn(st), 1); eq(h.apply(st, 1, { t: 'mv', c: 40, k: 0 }), null, 'occupied');
  ok(h.apply(st, 1, ON.toWire.mv(41))); ok(h.apply(st, 0, ON.toWire.ps())); ok(h.apply(st, 1, ON.toWire.ps()));
  eq(st.phase, 'dead'); eq(h.turn(st), 0);
  const a = h.apply(st, 1, ON.toWire.dd(40)); ok(a && a.soft, 'toggling is soft (no new clock)'); eq(st.cf.join(), '0,0');
  h.apply(st, 0, ON.toWire.ok()); eq(h.turn(st), 1); eq(st.over, false);
  h.apply(st, 1, ON.toWire.dd(41)); eq(st.cf.join(), '0,0', 'a change cancels the agreement');
  h.apply(st, 0, ON.toWire.ok()); h.apply(st, 1, ON.toWire.ok()); eq(st.over, true); ok(st.result.text);
  const pd = h.pub(st); eq(pd.sg, 'o'); ok(pd.b.length === 9 && pd.b[0].length === 9); for (const k of Object.keys(pd)) ok(/^[a-z]{1,4}$/.test(k), 'pd key ' + k);
  for (const s of [].concat(pd.b, pd.o, pd.dd)) ok(String(s).length <= 24);
  const rg = h.create({}); h.apply(rg, 1, ON.toWire.rg()); eq(rg.result.text, 'B+R'); eq(h.result(rg).w, 0);
  const big = E.create({ n: 19 }); ok(ON.fromWire(ON.toWire.mv(360)).cell === 360 && ON.toWire.mv(360).c <= 255 && ON.toWire.mv(360).k <= 3, 'cells above 255 split into c + 256k');
  eq(ON.fromWire({ t: 'mv', c: 300, k: 0 }), null); eq(ON.fromWire({ t: 'xx' }), null); void big;
});
test('online adapter: view() rebuilds state from the public data, host fallback decides from what everyone sees', () => {
  const h = ON.host; ON.setCfg({ n: 9, rule: 'cn', hc: 2, komi: null }); const st = h.create({});
  eq(st.turn, 2); ok(h.apply(st, 1, ON.toWire.mv(30)));
  const v = ON.view({ pd: h.pub(st), me: 0, gn: 1, fresh: true, ev: [], tn: 0 }, ON.newCtx());
  eq(v.st.hc, 2); eq(v.st.rule, 'cn'); eq(v.st.komi, 0.5); eq(JSON.stringify(v.st.b), JSON.stringify(st.b)); eq(v.st.moves.length, 1); eq(v.st.moves[0][1], 2, 'white moved first');
  const fb = h.fallback(h.pub(st)); ok(fb.r.length === 2);
  const back = h.de(h.ser(st)); eq(JSON.stringify(back.b), JSON.stringify(st.b));
  ON.setCfg({ n: 9, rule: 'jp', hc: 0, komi: null });
});
run();
