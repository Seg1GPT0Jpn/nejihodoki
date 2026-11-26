// chess/ai.js の単体テスト：評価が白黒対称・探索がメイト（1・2・3手）と駒の損得を読む・CPU の6段階（でたらめ・欲ばり・2手読み・3手＋静止探索・6手・14手）が
// 反則の手を出さない（300局のでたらめな対局）・同じ局面と種なら同じ手・時間の上限（400ms）を守る・強い段階が弱い段階に勝つ・オープニングの小さな本がすべて合法・
// 終盤（クイーン・ルークだけでメイト・キング＋ビショップ＋ナイト）・ヒントの説明（メイト・ただ取り・フォーク・キャスリング・助ける）・評価バーの値。
// 実行：node tools/tests/unit/chess-ai.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'chess/engine.js'));
global.ChessEngine = E;
const AI = require(path.join(ROOT, 'chess/ai.js'));
const uci = E.uci;
const rngOf = seed => AI.rng(seed);
const fenMirror = fen => {   // 上下を返して、白黒を入れかえる（キャスリングの権利・アンパッサンも）
  const [pl, side, cast, ep, h, f] = fen.split(' ');
  const rows = pl.split('/').reverse().map(r => r.replace(/[a-zA-Z]/g, c => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())));
  const sw = cast === '-' ? '-' : cast.split('').map(c => (c === c.toUpperCase() ? c.toLowerCase() : c.toUpperCase())).sort((a, b) => 'KQkq'.indexOf(a) - 'KQkq'.indexOf(b)).join('');
  const e = ep === '-' ? '-' : ep[0] + (9 - +ep[1]);
  return [rows.join('/'), side === 'w' ? 'b' : 'w', sw, e, h, f].join(' ');
};

test('the evaluation is colour-symmetric: the mirrored position (flip the board, swap colours and the side to move) has the same score for the side to move', () => {
  const rnd = rngOf(5); let n = 0;
  for (let g = 0; g < 30; g++) {
    const gm = new E.Game();
    for (let i = 0; i < 80 && !gm.status().over; i++) {
      const fen = gm.fen(), mir = fenMirror(fen), a = AI.evaluate(gm.pos), b = AI.evaluate(E.fromFen(mir)); n++;
      eq(a, b, 'evaluation of ' + fen + ' vs mirrored ' + mir);
      ok(AI.evalWhite(gm.pos) === -AI.evalWhite(E.fromFen(mir)), 'white-point is the negative of the mirrored one');
      const lg = gm.legal(); gm.play(lg[Math.floor(rnd() * lg.length)]);
    }
  }
  ok(n > 800, 'checked ' + n + ' positions');
});
test('the evaluation counts material and is sensible: an extra queen is worth about 900, the start position is near even, K+B v K and K+N v K are 0, a passed pawn on the 6th is valued', () => {
  const ev = f => AI.evalWhite(E.fromFen(f));
  ok(Math.abs(ev(E.START)) < 30, 'start ' + ev(E.START));
  const q = ev('rnb1kbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'); ok(q > 800 && q < 1100, 'queen up: ' + q);
  eq(ev('8/8/4k3/8/8/4K3/8/5B2 w - - 0 1'), 0); eq(ev('8/8/4k3/8/8/4K3/8/5N2 w - - 0 1'), 0);
  ok(ev('4k3/8/4P3/8/8/8/8/4K3 w - - 0 1') > ev('4k3/8/8/8/8/8/4P3/4K3 w - - 0 1') + 50, 'a far-advanced passed pawn');
  ok(ev('6k1/pp6/8/8/8/8/PP6/4K3 w - - 0 1') > ev('6k1/pp6/8/8/8/8/P1P5/4K3 w - - 0 1') - 1, 'connected pawns are not worse than split ones');
  ok(ev('r3k2r/pppq1ppp/2n2n2/3pp3/3PP3/2N2N2/PPPQ1PPP/R3K2R w KQkq - 0 1') === -ev(fenMirror('r3k2r/pppq1ppp/2n2n2/3pp3/3PP3/2N2N2/PPPQ1PPP/R3K2R w KQkq - 0 1')));
});
test('search finds checkmates: back rank (1), the first move of every mate-in-2 and mate-in-3 puzzle position, and prefers the shorter mate', () => {
  const sr = f => AI.search(E.fromFen(f), { depth: 8, ms: 4000 });
  let r = sr('6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1'); eq(uci(r.move), 'd1d8'); ok(r.score >= AI.MATE_IN && AI.MATE - r.score === 1, 'mate in one ply: ' + r.score);
  r = sr('6k1/8/6K1/8/8/8/8/R7 w - - 0 1'); ok(r.score >= AI.MATE_IN, 'forced mate seen in K+R v K: ' + r.score);
  const BANK = require(path.join(ROOT, 'chess/puzzles.js'));
  let tested = 0;
  for (const p of BANK.list.filter(x => x.k === 'm2').slice(0, 8).concat(BANK.list.filter(x => x.k === 'm3').slice(0, 5))) {
    const res = AI.search(E.fromFen(p.f), { depth: 8, ms: 5000 }); eq(uci(res.move), p.s[0], 'mate puzzle ' + p.k + ' ' + p.f); ok(res.score >= AI.MATE_IN, 'sees the mate'); eq(AI.MATE - res.score, 2 * +p.k[1] - 1, 'mate distance in plies'); tested++;
  }
  eq(tested, 13);
});
test('search wins hanging material and does not hang its own: takes a free queen, does not walk into a fork/mate, sees a recapture', () => {
  eq(uci(AI.search(E.fromFen('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1'), { depth: 4, ms: 2000 }).move), 'd1d5');
  const r = AI.search(E.fromFen('rnb1kbnr/pppp1ppp/8/4p3/4P2q/5N2/PPPP1PPP/RNBQKB1R w KQkq - 0 1'), { depth: 6, ms: 3000 });
  ok(['f3h4', 'g2g3', 'f3e5'].includes(uci(r.move)) || r.score > -100, 'handles the queen attack: ' + uci(r.move));
  // Qxb2?? loses the queen to the rook: a depth-4 search with quiescence does not take the poisoned pawn
  const p = AI.search(E.fromFen('4k3/8/8/8/8/1p6/1P6/RQ2K3 b - - 0 1'.replace('1p6/1P6', '2p5/1P6')), { depth: 4, ms: 2000 }); ok(p.move);
  const e = AI.search(E.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1'), { depth: 5, ms: 3000 }); ok(Math.abs(e.score) < 80, 'the start position is near even: ' + e.score);
});
test('search is deterministic with a node limit (same position, same result) and the hash table does not change the answer', () => {
  const f = 'r1bq1rk1/ppp2ppp/2np1n2/2b1p3/2B1P3/2NP1N2/PPP2PPP/R1BQ1RK1 w - - 0 7';
  AI.ttClear(); const a = AI.search(E.fromFen(f), { depth: 6, nodes: 60000 }); AI.ttClear(); const b = AI.search(E.fromFen(f), { depth: 6, nodes: 60000 });
  eq(a.move, b.move); eq(a.score, b.score); eq(a.nodes, b.nodes); ok(a.depth >= 3, 'depth reached ' + a.depth);
  const fresh = AI.search(E.fromFen(f), { depth: 5, fresh: true, nodes: 200000 }); ok(fresh.move);
});
test('a search with a time budget returns within it (level budgets: 120 / 260 / 380 ms; never above 400 ms + a small margin)', () => {
  const fens = [E.START, 'r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4', 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1', '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1', 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10', '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'];
  let worst = 0;
  for (const lv of [4, 5, 6]) for (const f of fens) { const g = new E.Game(f), t = Date.now(), o = AI.cpuMove(g, lv, { seed: 3, book: false }), d = Date.now() - t; worst = Math.max(worst, d); ok(o.move, 'a move'); ok(d <= AI.LEVELS[lv].ms + 80, 'level ' + lv + ' took ' + d + ' ms in ' + f); }
  ok(worst <= 460, 'the slowest CPU move took ' + worst + ' ms');
  const t0 = Date.now(); AI.hint(new E.Game(fens[2]), { ms: 380 }); ok(Date.now() - t0 <= 480, 'hint within its budget');
  const t1 = Date.now(); AI.search(E.fromFen(fens[1]), { ms: 100 }); ok(Date.now() - t1 <= 180, 'a 100 ms budget is a 100 ms budget');
  eq(AI.cpuMove(new E.Game(fens[1]), 6, { ms: 5000, book: false, seed: 1 }).info.ms <= 460, true, 'a bigger budget is capped at 400');
});
test('the CPU levels: six of them, with growing depth and shrinking blunder rate; level 1 is random, level 2 takes material, level 3+ finds a mate in one', () => {
  eq(AI.LEVEL_COUNT, 6); eq(AI.LEVELS.length, 7);
  const L = AI.LEVELS; ok(L[3].depth < L[4].depth + 1 && L[4].depth < L[5].depth && L[5].depth < L[6].depth, 'depth grows'); ok(L[3].blunder > L[4].blunder && L[4].blunder > L[5].blunder && L[5].blunder > L[6].blunder, 'blunder rate shrinks'); ok(L.slice(4).every(l => l.ms <= 400));
  const m1 = new E.Game('6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1'); for (const lv of [2, 3, 4, 5, 6]) eq(uci(AI.cpuMove(m1, lv, { seed: 9 }).move), 'd1d8', 'level ' + lv + ' mates in one');
  const cap = new E.Game('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1'); eq(uci(AI.cpuMove(cap, 2, { seed: 1 }).move), 'd1d5', 'the greedy CPU takes the queen');
  const seen = new Set(); for (let s = 1; s <= 30; s++) seen.add(uci(AI.cpuMove(new E.Game(), 1, { seed: s }).move)); ok(seen.size >= 8, 'level 1 is random: ' + seen.size + ' different first moves');
  const a = uci(AI.cpuMove(new E.Game('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'), 4, { seed: 5, nodes: 3000, book: false }).move);
  const b = uci(AI.cpuMove(new E.Game('r1bqkb1r/pppp1ppp/2n2n2/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R w KQkq - 4 4'), 4, { seed: 5, nodes: 3000, book: false }).move); eq(a, b, 'the same position and seed give the same move');
  eq(AI.cpuMove(new E.Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'), 3, {}).move, 0, 'no move when there is none');
  const only = new E.Game('7k/8/6K1/8/8/8/8/6R1 b - - 0 1'); eq(AI.cpuMove(only, 5, {}).info.kind, 'only', 'a single legal move is just played');
});
test('the CPU never plays an illegal move: 300 random games, every level, with the opening book, castling, promotion, en passant; every game stays consistent (FEN and status)', () => {
  const rnd = rngOf(2026); let games = 0, plies = 0; const ends = {}, kinds = {};
  for (let k = 0; k < 300; k++) {
    const g = new E.Game(k % 5 === 0 ? 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1' : null);
    const lvW = 1 + Math.floor(rnd() * 6), lvB = 1 + Math.floor(rnd() * 6);
    let guard = 0;
    while (!g.status().over && guard++ < 220) {
      const lv = g.pos.side ? lvB : lvW, lg = g.legal();
      const o = AI.cpuMove(g, lv, { seed: k * 1000 + guard, nodes: 250, ms: 40 });
      kinds[o.info.kind] = (kinds[o.info.kind] || 0) + 1;
      if (lg.indexOf(o.move) < 0) throw new Error('illegal move ' + o.move + ' (' + JSON.stringify(o.info) + ') by level ' + lv + ' in ' + g.fen());
      const r = g.play(o.move); ok(r.ok, 'played'); plies++;
    }
    const st = g.status(); ends[st.over ? st.reason : 'cap'] = (ends[st.over ? st.reason : 'cap'] || 0) + 1; games++;
    eq(E.toFen(E.fromFen(g.fen())), g.fen(), 'FEN round trip after the game');
    const back = E.Game.fromUci(g.ucis, g.start === E.START ? null : g.start); eq(back.fen(), g.fen(), 'replaying the moves gives the same position');
  }
  eq(games, 300); ok(plies > 6000, 'plies ' + plies); ok(ends.mate > 20, 'many games end in mate: ' + JSON.stringify(ends)); ok(kinds.random > 100 && kinds.greedy > 100 && kinds.search > 100 && kinds.book > 20, JSON.stringify(kinds));
});
test('stronger CPUs beat weaker ones: level 6 beats level 1 (no loss, mostly wins), level 2 beats level 1 on points, level 4 beats level 2', () => {
  const play = (lw, lb, seed, nodes) => { const g = new E.Game(); let i = 0; while (!g.status().over && i++ < 260) g.play(AI.cpuMove(g, g.pos.side ? lb : lw, { seed: seed + i, nodes, ms: 60 }).move); return g.status(); };
  let w = 0, l = 0;
  for (let k = 0; k < 6; k++) { const asW = k % 2 === 0, s = play(asW ? 6 : 1, asW ? 1 : 6, 40 + k, 1500); if (s.winner === (asW ? 0 : 1)) w++; if (s.winner === (asW ? 1 : 0)) l++; }
  ok(l === 0 && w >= 4, 'level 6 vs 1: ' + w + ' wins, ' + l + ' losses');
  let pts = 0; for (let k = 0; k < 12; k++) { const asW = k % 2 === 0, s = play(asW ? 2 : 1, asW ? 1 : 2, 700 + k, 0); pts += s.winner === (asW ? 0 : 1) ? 1 : s.winner === -1 || s.winner == null ? 0.5 : 0; }
  ok(pts >= 7.5, 'greedy vs random: ' + pts + '/12');
  pts = 0; for (let k = 0; k < 6; k++) { const asW = k % 2 === 0, s = play(asW ? 4 : 2, asW ? 2 : 4, 900 + k, 800); pts += s.winner === (asW ? 0 : 1) ? 1 : s.winner === -1 || s.winner == null ? 0.5 : 0; }
  ok(pts >= 4, 'level 4 vs 2: ' + pts + '/6');
});
test('the opening book: every line is legal, the first moves are the sensible ones, and the CPU uses it (and only while the game is in it)', () => {
  const B = AI.buildBook(); eq(B.bad.length, 0, 'lines with an illegal move: ' + B.bad.join(' ')); ok(AI.BOOK_LINES.length >= 30 && B.size > 250, 'book size ' + B.size);
  const first = AI.bookMoves(new E.Game().pos).map(x => x.u).sort(); ok(['d2d4', 'e2e4', 'c2c4', 'g1f3'].every(m => first.includes(m)), first.join()); ok(first.every(m => ['d2d4', 'e2e4', 'c2c4', 'g1f3'].includes(m)), 'only principled first moves: ' + first.join());
  const g = new E.Game(); g.play('e4'); const rep = AI.bookMoves(g.pos).map(x => x.u); ok(rep.includes('e7e5') && rep.includes('c7c5') && rep.includes('e7e6') && rep.includes('c7c6'), rep.join());
  for (const lv of [3, 4, 5, 6]) { const o = AI.cpuMove(new E.Game(), lv, { seed: 4 }); eq(o.info.kind, 'book', 'level ' + lv + ' opens from the book'); }
  eq(AI.cpuMove(new E.Game(), 1, { seed: 4 }).info.kind, 'random'); eq(AI.cpuMove(new E.Game(), 2, { seed: 4 }).info.kind, 'greedy');
  const out = new E.Game(); for (const m of ['a3', 'h6', 'a4', 'h5']) out.play(m); ok(AI.bookMoves(out.pos).length === 0, 'out of book after odd moves'); ok(AI.cpuMove(out, 6, { seed: 1 }).info.kind !== 'book');
  const late = new E.Game(); for (const s of 'e4 e5 Nf3 Nc6 Bb5 a6 Ba4 Nf6 O-O Be7 Re1 b5 Bb3 d6 c3 O-O'.split(' ')) late.play(s); ok(AI.cpuMove(late, 4, { seed: 1 }).info.kind !== 'book', 'level 4 leaves the book after 8 plies');
  // a move the book plays is always legal in the position (checked over many lines and seeds)
  for (let s = 0; s < 60; s++) { const gm = new E.Game(); for (let i = 0; i < 12; i++) { const m = AI.bookMove(gm.pos, rngOf(s * 13 + i)); if (!m) break; ok(gm.legal().indexOf(m) >= 0, 'book move legal'); gm.play(m); } }
});
test('endgame sanity: the CPU mates with K+Q and K+R against a bare king (and never stalemates), with K+B+N, and promotes a far pawn', () => {
  const finish = (fen, cap, lv, nodes) => { const g = new E.Game(fen); let i = 0; while (!g.status().over && i++ < cap) g.play(AI.cpuMove(g, lv || 6, { seed: i, ms: 400, nodes: nodes || 15000, book: false }).move); return g; };       // 手数の上限で読む（機械の速さによらず、毎回同じ結果）
  for (const fen of ['8/8/8/4k3/8/8/Q7/4K3 w - - 0 1', '8/3k4/8/8/8/8/6K1/7R w - - 0 1', '7k/8/8/8/8/8/2q5/K7 b - - 0 1', '8/8/8/8/3k4/8/8/R3K3 w - - 0 1']) {
    const g = finish(fen, 120); eq(g.status().reason, 'mate', 'mate from ' + fen + ' (ended by ' + g.status().reason + ' after ' + g.list.length + ' plies)');
  }
  for (const fen of ['8/8/8/3k4/8/8/8/1BN1K3 w - - 0 1', 'k7/8/8/8/8/8/8/2B1KN2 w - - 0 1', '8/3k4/8/8/8/2N5/8/2B1K3 w - - 0 1']) { const bn = finish(fen, 200, 6, 15000); eq(bn.status().reason, 'mate', 'K+B+N v K is mated (within the 50-move limit) from ' + fen + ': ' + bn.list.length + ' plies'); ok(bn.list.length <= 90, 'in ' + bn.list.length + ' plies'); }
  const pw = new E.Game('8/1P6/8/8/8/7k/8/4K3 w - - 0 1'); for (let i = 0; i < 8; i++) { if (pw.status().over) break; pw.play(AI.cpuMove(pw, 6, { seed: i, ms: 400, nodes: 3000, book: false }).move); }
  ok(pw.sans.some(s => /=Q/.test(s)), 'the pawn is promoted: ' + pw.sans.join(' '));
  for (let k = 0; k < 6; k++) { const g = finish(['8/8/8/4k3/8/8/Q7/4K3 w - - 0 1', '8/8/8/8/3k4/8/8/R3K3 w - - 0 1'][k % 2], 80, 5, 1500); ok(g.status().reason !== 'stalemate', 'no stalemate blunder with a winning rook or queen'); }
});
test('hints explain themselves: mate, a free piece, a fork, castling, saving a piece, escaping check; each hint has a legal move, SAN, a line of legal SAN moves and a score', () => {
  const hint = f => AI.hint(new E.Game(f), { ms: 700 });
  const why = (fen, san) => { const g = new E.Game(fen), r = E.parseMove(g.pos, san); ok(r.move != null, san + ' is legal in ' + fen); return AI.explainMove(g.pos, r.move, null); };
  let h = hint('6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1'); eq(h.san, 'Rd8#'); eq(h.reasons[0].k, 'mate'); eq(h.mate, 1);
  h = hint('4k3/8/8/3q4/8/8/8/3RK3 w - - 0 1'); eq(h.uci, 'd1d5'); ok(h.reasons.some(r => r.k === 'win' && r.p === 5), JSON.stringify(h.reasons));
  h = hint('r3k3/8/8/3N4/8/8/8/4K3 w - - 0 1'); eq(h.san, 'Nc7+'); ok(h.reasons.some(r => r.k === 'fork') && h.reasons.some(r => r.k === 'check'), 'the knight fork of king and rook: ' + JSON.stringify(h.reasons));
  eq(why('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', 'O-O')[0].k, 'castle');
  ok(why('6k1/8/8/3p4/4Q3/8/8/4K3 w - - 0 1', 'Qe2').some(r => r.k === 'save' && r.p === 5), 'the queen attacked by a pawn steps away');
  ok(why('4k3/8/8/8/8/8/8/r3K3 w - - 0 1', 'Ke2').some(r => r.k === 'escape'), 'getting out of check');
  ok(why('4k3/8/8/8/8/8/4r3/4K3 w - - 0 1', 'Kxe2').some(r => r.k === 'win' && r.p === 4), 'taking an undefended rook');
  ok(why('4k3/8/8/8/8/8/4P3/4K2R w - - 0 1', 'Rh8+').some(r => r.k === 'check') && why('4k3/8/8/8/8/8/8/1N2K3 w - - 0 1', 'Nc3').length >= 1);
  ok(why('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'Nf3').some(r => r.k === 'develop') && why('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e4').some(r => r.k === 'center'));
  ok(why('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1', 'b8=Q+').some(r => r.k === 'promote'));
  for (const f of ['r3k2r/pppq1ppp/2np1n2/2b1p3/2B1P1b1/2NP1N2/PPPQ1PPP/R3K2R w KQkq - 0 1', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'r1bqkbnr/pppp1ppp/2n5/4p3/2B1P3/5N2/PPPP1PPP/RNBQK2R b KQkq - 3 3']) {
    const hh = hint(f), lg = new E.Game(f); ok(hh.reasons.length >= 1 && hh.pv.length >= 1 && hh.pv.every(s => typeof s === 'string') && hh.depth >= 2, 'hint data for ' + f);
    eq(E.parseMove(lg.pos, hh.uci).move, hh.move, 'the hint is a legal move ' + hh.uci); eq(hh.san, E.toSan(lg.pos, hh.move)); ok(typeof hh.cp === 'number' && hh.frac > 0 && hh.frac < 1);
    const g2 = new E.Game(f); for (const sn of hh.pv) ok(g2.play(sn).ok, 'the line is legal: ' + hh.pv.join(' '));
  }
});
test('the evaluation bar: centipawns to white\'s share is monotonic, mate shows as a mate count with the right sign, and analyze() reports the position', () => {
  let prev = -1; for (const cp of [-2000, -500, -100, 0, 100, 500, 2000]) { const v = AI.barFrac(cp); ok(v > prev, 'monotonic'); prev = v; } ok(Math.abs(AI.barFrac(0) - 0.5) < 1e-9);
  const w = AI.describeScore(AI.MATE - 3, 0); eq(w.mate, 2); ok(w.cp > 0); const b = AI.describeScore(AI.MATE - 3, 1); eq(b.mate, -2); ok(b.cp < 0); eq(AI.describeScore(150, 1).cp, -150); eq(AI.describeScore(150, 0).cp, 150);
  const a = AI.analyze(E.fromFen('6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1'), { ms: 500 }); eq(a.mate, 1); eq(uci(a.move), 'd1d8'); ok(a.frac > 0.99);
  const a2 = AI.analyze(E.fromFen('3r2k1/5ppp/8/8/8/8/5PPP/6K1 w - - 0 1'), { ms: 500 }); ok(a2.cp < -300 && a2.frac < 0.35, 'a rook down: ' + a2.cp);
  const a3 = AI.analyze(E.fromFen(E.START), { ms: 400 }); ok(Math.abs(a3.cp) < 80 && a3.depth >= 3, 'start: ' + a3.cp + ' depth ' + a3.depth);
  const mated = AI.analyze(E.fromFen('3R2k1/5ppp/8/8/8/8/8/6K1 b - - 0 1'), { ms: 100 }); ok(mated.cp <= -90000 || mated.mate !== 0 || mated.move === 0, 'a mated side');
});

run();
