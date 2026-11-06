// shogi/engine.js の単体テスト：指し手の数（perft）、駒ごとの動き、成り、打つ駒の決まり（二歩・打ち歩詰め・行き所のない駒）、
// 王手放置、詰み、千日手と連続王手の千日手、入玉宣言、表記（▲7六歩・KIF・英語）、CPU、詰将棋の問題（shogi/index.html の PROBLEMS）
// 実行：node tools/tests/unit/shogi-engine.test.js   （perft の深さ5まで。数秒かかる）
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run, readText } = require('./_kobo-env');
const E = require(path.join(ROOT, 'shogi/engine.js'));

const sorted = a => a.slice().sort();
const P = sfen => new E.Position(sfen);

test('perft from the initial position: 30 / 900 / 25470 / 719731 / 19861490', () => {
  const p = P();
  eq(p.perft(1), 30); eq(p.perft(2), 900); eq(p.perft(3), 25470); eq(p.perft(4), 719731);
  eq(p.perft(5), 19861490);
  eq(p.sfen(), E.START, 'make/unmake leaves the position as it was');
});
test('perft of known positions (most legal moves = 593; a middle game)', () => {
  eq(P('R8/2K1S1SSk/4B4/9/9/9/9/9/1L1L1L3 b RBGSNLP3g3n17p 1').perft(1), 593);
  const mid = P('l6nl/5+P1gk/2np1S3/p1p4Pp/3P2Sp1/1PPb2P1P/P5GS1/R8/LN4bKL w RGgsn5p 1');
  eq(mid.perft(1), 207); eq(mid.perft(2), 28684); eq(mid.perft(3), 4809015);
});
test('sfen round trip and hashing are consistent after make/unmake', () => {
  const g = E.Game.fromMoves(E.START, ['7g7f', '3c3d', '8h2b+', '3a2b', 'B*4e']);
  eq(g.moves.length, 5);
  const p2 = P(g.pos.sfen());
  eq(p2.key(), g.pos.key(), 'same hash from scratch');
  eq(g.pos.sfen(false), 'lnsgkg1nl/1r5s1/pppppp1pp/6p2/5B3/2P6/PP1PPPPPP/7R1/LNSGKGSNL w b 1');
});
test('each piece moves the way it should (sente, empty board with kings)', () => {
  const at = (sfen, from) => sorted(P(sfen).legal().filter(u => u.startsWith(from)));
  deep(at('4k4/9/9/9/4G4/9/9/9/K8 b - 1', '5e'), sorted(['5e4d', '5e5d', '5e6d', '5e4e', '5e6e', '5e5f']));
  deep(at('4k4/9/9/9/4S4/9/9/9/K8 b - 1', '5e'), sorted(['5e4d', '5e5d', '5e6d', '5e4f', '5e6f']));
  deep(at('4k4/9/9/9/4N4/9/9/9/K8 b - 1', '5e'), sorted(['5e4c', '5e6c', '5e4c+', '5e6c+']));
  deep(at('k8/9/9/9/4L4/9/9/9/K8 b - 1', '5e'), sorted(['5e5d', '5e5c', '5e5c+', '5e5b', '5e5b+', '5e5a+']), 'lance');
  eq(at('8k/9/9/9/4B4/9/9/9/K8 b - 1', '5e').filter(u => !u.endsWith('+')).length, 15, 'bishop (the 9i ray stops before the own king)');
  eq(at('k8/9/9/9/4R4/9/9/9/8K b - 1', '5e').filter(u => !u.endsWith('+')).length, 16, 'rook');
  deep(at('4k4/9/9/9/4+R4/9/9/9/K8 b - 1', '5e').filter(u => /5e[46][df]/.test(u)).sort(), ['5e4d', '5e4f', '5e6d', '5e6f'], 'dragon steps diagonally');
  // gote moves the other way
  deep(sorted(P('k8/9/9/9/4g4/9/9/9/8K w - 1').legal().filter(u => u.startsWith('5e'))), sorted(['5e4f', '5e5f', '5e6f', '5e4e', '5e6e', '5e5d']));
});
test('promotion: optional in the zone, forced where the piece could not move again', () => {
  const l = P('4k4/9/9/4P4/9/9/9/9/K8 b - 1').legal();
  ok(l.includes('5d5c+') && l.includes('5d5c'), 'pawn entering the zone may choose');
  const n = P('k8/9/9/4N4/9/9/9/9/8K b - 1').legal().filter(u => u.startsWith('5d'));
  deep(sorted(n), sorted(['5d4b+', '5d6b+']), 'knight to the 2nd rank must promote');
  const pa = P('k8/4P4/9/9/9/9/9/9/8K b - 1').legal().filter(u => u.startsWith('5b'));
  deep(pa, ['5b5a+'], 'pawn to the last rank must promote');
  const s = P('k8/9/4S4/9/9/9/9/9/8K b - 1').legal().filter(u => u.startsWith('5c'));
  ok(s.includes('5c4d+') && s.includes('5c4d'), 'moving out of the zone may promote too');
  ok(!P('k8/9/9/9/4G4/9/9/9/8K b - 1').legal().some(u => u.endsWith('+')), 'gold never promotes');
});
test('drops: 二歩, dead squares, and 打ち歩詰め', () => {
  const l = P('k8/9/9/9/9/9/4P4/9/8K b P 1').legal();
  ok(!l.some(u => u.startsWith('P*5')), '二歩：no pawn drop on the 5th file');
  ok(!l.includes('P*4a'), 'no pawn drop on the last rank');
  ok(l.includes('P*4b'));
  const k = P('k8/9/9/9/9/9/9/9/8K b NL 1').legal();
  ok(!k.includes('N*4b') && !k.includes('N*4a') && k.includes('N*4c'), 'knight not on the last two ranks');
  ok(!k.includes('L*4a') && k.includes('L*4b'), 'lance not on the last rank');
  // promoted pawns do not count for 二歩
  ok(P('k8/9/9/4+P4/9/9/9/9/8K b P 1').legal().includes('P*5e'));
  // 打ち歩詰め: the pawn would mate → illegal; the same drop that only checks is fine
  const uf = P('kn7/9/1G7/9/9/9/9/9/8K b P 1');
  ok(!uf.legal().includes('P*9b'), 'pawn-drop mate is not allowed');
  const uf2 = P('k8/9/1G7/9/9/9/9/9/8K b P 1');
  ok(uf2.legal().includes('P*9b'), 'pawn-drop check that can be answered is fine');
  // pushing a pawn for mate is fine
  const push = P('kn7/9/PG7/9/9/9/9/9/8K b - 1');
  ok(push.legal().includes('9c9b'), 'mate by moving a pawn is allowed');
  // gote: pieces in hand
  ok(P('8k/9/9/9/9/9/9/9/K8 w p 1').legal().includes('P*5e'), 'gote drops are written with capitals in USI');
});
test('王手放置：a move that leaves the king in check is illegal; pinned pieces stay', () => {
  const p = P('4k4/9/9/9/4r4/9/4G4/9/4K4 b - 1');
  ok(p.legal().filter(u => u.startsWith('5g')).every(u => u === '5g5f' || u === '5g5h'), 'the pinned gold may only move along the file');
  ok(!p.legal().includes('5g4g'));
  ok(p.legal().includes('5g5f'));
  const c = P('4k4/9/9/9/9/9/9/4r4/4K4 b - 1');
  eq(c.inCheck(), true);
  ok(c.legal().every(u => u.startsWith('5i')), 'in check: only king moves or captures');
  ok(c.legal().includes('5i5h'), 'capture the checking rook');
});
test('Game: checkmate, resign, timeout', () => {
  const g = E.Game.fromMoves('4k4/9/4P4/9/9/9/9/9/4K4 b G 1', []);
  const r = g.play('G*5b');
  eq(r.check, true); deep(g.result, { winner: 0, reason: 'mate' });
  eq(r.ja, '▲5二金', 'notation: no 打 when no board gold could go there');
  const g2 = new E.Game(); g2.play('7g7f'); g2.resign(); deep(g2.result, { winner: 0, reason: 'resign' });
  const g3 = new E.Game(); g3.timeout(0); deep(g3.result, { winner: 1, reason: 'time' });
  eq(g3.play('7g7f'), null, 'no moves after the end');
});
test('千日手 (draw) and 連続王手の千日手 (the checking side loses)', () => {
  const g = new E.Game();
  const cyc = ['5i5h', '5a5b', '5h5i', '5b5a'];
  for (let i = 0; i < 3; i++) for (const m of cyc) { ok(!g.result, 'no result yet ' + i); g.play(m); }
  deep(g.result, { winner: -1, reason: 'sennichite' });
  // perpetual check: gote's king walks 9a↔8a, sente's rook checks every time from 9i / 8i
  const g3 = new E.Game('k8/9/9/9/9/9/9/9/R7K w - 1');
  eq(g3.pos.inCheck(), true);
  for (let i = 0; i < 3 && !g3.result; i++) for (const u of ['9a8a', '9i8i', '8a9a', '8i9i']) if (!g3.result) ok(g3.play(u), u);
  deep(g3.result, { winner: 1, reason: 'perpetual' }, 'sente checked every move → sente loses');
});
test('入玉宣言 (27-point rule)', () => {
  // sente king on 5c, 10 pieces in the camp: rook, bishop (5 each) + 8 pawns… plus hand
  const sf = '+P+P+P+P+P+P+P+P1/1+R+B6/4K4/9/9/9/9/9/k8 b 2G2S2N2L10P 1';
  const g = new E.Game(sf);
  const d = g.declareInfo();
  eq(d.pieces, 10); eq(d.king, true);
  ok(d.points >= 28, 'points ' + d.points);
  ok(d.ok); deep(g.declare(), { winner: 0, reason: 'declare' });
  const g2 = new E.Game('+P+P+P+P1+P+P2/1+R+B6/4K4/9/9/9/9/9/k8 b - 1');
  ok(!g2.declareInfo().ok, 'not enough pieces / points');
  eq(g2.declare(), null);
});
test('notation: ▲7六歩, 同, 打, 成/不成, 右/左/直, KIF, English', () => {
  const g = new E.Game();
  eq(g.play('7g7f').ja, '▲7六歩'); eq(g.play('3c3d').ja, '△3四歩');
  eq(g.play('8h2b+').ja, '▲2二角成'); eq(g.play('3a2b').ja, '△同銀');
  eq(g.play('B*4e').ja, '▲4五角');
  eq(g.notation(0, 'en'), '☗P-7f'); eq(g.notation(2, 'en'), '☗Bx2b+'); eq(g.notation(4, 'en'), '☗B*4e');
  // two golds can reach 5h from 6i and 4i → 右 / 左
  const p = new E.Game('4k4/9/9/9/9/9/9/9/3GKG3 b - 1');
  eq(E.kanji(p.pos, p.pos.parse('4i5h'), 0), '▲5八金右');
  eq(E.kanji(p.pos, p.pos.parse('6i5h'), 0), '▲5八金左');
  // 直: a gold straight up while another could also go there
  const q = new E.Game('4k4/9/9/9/9/9/9/3GG4/5K3 b - 1');
  eq(E.kanji(q.pos, q.pos.parse('5h5g'), 0), '▲5七金直');
  eq(E.kanji(q.pos, q.pos.parse('6h5g'), 0), '▲5七金左');
  // drop with a board piece able to go there → 打
  const d = new E.Game('4k4/9/9/9/9/9/9/4G4/4K4 b G 1');
  eq(E.kanji(d.pos, d.pos.parse('G*5g'), 0), '▲5七金打');
  // 不成
  const n = new E.Game('4k4/9/9/9/4S4/9/9/9/4K4 b - 1');
  n.play('5e5d'); n.play('5a4a');
  eq(n.play('5d5c').ja, '▲5三銀不成');
  const k = E.kif(g, { black: 'A', white: 'B' });
  ok(/手合割：平手/.test(k) && /   1 ７六歩\(77\)/.test(k) && /   4 同　銀\(31\)/.test(k) && /   5 ４五角打/.test(k), k);
  g.resign(); ok(/まで5手で先手の勝ち/.test(E.kif(g, {})), 'result line');
});
test('handicap positions: 上手 (gote) moves first', () => {
  for (const [k, sf] of Object.entries(E.HANDICAPS)) {
    const g = new E.Game(sf);
    eq(g.pos.side, k === 'hirate' ? 0 : 1, k);
    ok(g.pos.legal().length > 0, k);
  }
});
test('CPU: finds a mate in one, takes a free rook, answers checks; every level returns a legal move', () => {
  const m1 = E.search(P('4k4/9/4P4/9/9/9/9/9/4K4 b G 1'), { level: 5, timeMs: 500 });
  eq(m1.usi, 'G*5b');
  const free = E.search(P('4k4/9/9/9/9/4r4/4G4/9/4K4 b - 1'), { level: 4, timeMs: 400 });
  eq(free.usi, '5g5f', 'gold takes the rook');
  const g = new E.Game();
  for (let lv = 1; lv <= 5; lv++) { const r = E.search(g.pos, { level: lv, timeMs: 200 }); ok(g.pos.legal().includes(r.usi), 'level ' + lv + ' ' + r.usi); }
  // weak level still never misses a mate in one
  let hits = 0;
  for (let i = 0; i < 10; i++) if (E.search(P('4k4/9/4P4/9/9/9/9/9/4K4 b G 1'), { level: 1 }).usi === 'G*5b') hits++;
  eq(hits, 10);
});
test('stronger level beats the beginner level (2 games, short time)', () => {
  let wins = 0;
  for (let i = 0; i < 2; i++) {
    const g = new E.Game(), strong = i % 2;
    while (!g.result && g.moves.length < 260) {
      const lv = g.pos.side === strong ? 3 : 1;
      g.play(E.search(g.pos, { level: lv, timeMs: 150, history: g.keys.slice(0, -1) }).usi);
    }
    if (g.result && g.result.winner === strong) wins++;
  }
  eq(wins, 2);
});
// the problems shipped in shogi/index.html: each has a mate of exactly the stated length, with one first move
test('詰将棋：the page\'s problems are sound (mate length exact, unique first move)', () => {
  const html = readText('shogi/index.html');
  const m = /const PROBLEMS = (\[[\s\S]*?\]);/.exec(html);
  ok(m, 'PROBLEMS in shogi/index.html');
  const list = new Function('return ' + m[1])(); // plain data literal
  ok(list.length >= 6, list.length + ' problems');
  for (const pr of list) {
    const p = P(pr.sfen);
    eq(p.inCheck(1), false, pr.id + ': defender not in check at the start');
    const r = E.solveMate(p, pr.n);
    ok(r, pr.id + ' has a mate');
    eq(r.mate, pr.n, pr.id + ' length');
    eq(r.firsts.length, 1, pr.id + ' unique first move: ' + r.firsts);
    eq(r.firsts[0], pr.first, pr.id + ' first move');
    if (pr.n > 1) eq(E.solveMate(p, pr.n - 2), null, pr.id + ' no shorter mate');
  }
});

run('shogi-engine');
