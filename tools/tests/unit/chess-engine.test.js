// chess/engine.js の単体テスト：perft（開始局面 深さ1〜5 = 20・400・8902・197281・4865609、kiwipete など有名な局面）・
// 別のしくみ（わざと遅く書いた全探索）との照らし合わせ・FEN の読み書き・SAN・PGN（往復・コメントや変化つき）・
// キャスリング／アンパッサン／プロモーション／チェックメイト／ステイルメイト／同一局面3回／50手／駒がたりない のふち・make/unmake と ハッシュ・持ち時間。
// 実行：node tools/tests/unit/chess-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'chess/engine.js'));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const deq = (a, b, m) => ok(same(a, b), (m || 'deep equal') + ': ' + JSON.stringify(a).slice(0, 300) + ' vs ' + JSON.stringify(b).slice(0, 300));

// ---- 別のしくみ（盤を文字の2次元配列で持ち、毎回コピーして、効きは全マス見る）。エンジンとは別に書いた perft
const slow = (() => {
  const isW = c => c !== '.' && c === c.toUpperCase(), col = c => (c === '.' ? null : isW(c) ? 'w' : 'b');
  function parse(fen) { const [pl, side, cast, ep] = fen.split(' '); const b = []; pl.split('/').forEach((row, i) => { const r = []; for (const ch of row) { if (/\d/.test(ch)) for (let k = 0; k < +ch; k++) r.push('.'); else r.push(ch); } b[7 - i] = r; }); return { b, side: side === 'w' ? 'w' : 'b', cast, ep: ep === '-' ? null : [ep.charCodeAt(0) - 97, +ep[1] - 1] }; }
  function attacked(b, f, r, by) {
    for (let ff = 0; ff < 8; ff++) for (let rr = 0; rr < 8; rr++) {
      const c = b[rr][ff]; if (c === '.' || col(c) !== by) continue; const t = c.toLowerCase(), df = f - ff, dr = r - rr;
      if (t === 'p') { const d = by === 'w' ? 1 : -1; if (dr === d && Math.abs(df) === 1) return true; }
      else if (t === 'n') { if ((Math.abs(df) === 1 && Math.abs(dr) === 2) || (Math.abs(df) === 2 && Math.abs(dr) === 1)) return true; }
      else if (t === 'k') { if (Math.max(Math.abs(df), Math.abs(dr)) === 1) return true; }
      else {
        const diag = Math.abs(df) === Math.abs(dr) && df !== 0, str = (df === 0) !== (dr === 0);
        if ((t === 'b' && diag) || (t === 'r' && str) || (t === 'q' && (diag || str))) { const sf = Math.sign(df), sr = Math.sign(dr); let x = ff + sf, y = rr + sr, clear = true; while (x !== f || y !== r) { if (b[y][x] !== '.') { clear = false; break; } x += sf; y += sr; } if (clear) return true; }
      }
    }
    return false;
  }
  const kingPos = (b, side) => { const k = side === 'w' ? 'K' : 'k'; for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) if (b[r][f] === k) return [f, r]; };
  function moves(S) {
    const { b, side } = S, out = [], me = side, op = side === 'w' ? 'b' : 'w';
    const add = (f, r, tf, tr, promo, extra) => out.push({ f, r, tf, tr, promo, extra });
    for (let f = 0; f < 8; f++) for (let r = 0; r < 8; r++) {
      const c = b[r][f]; if (c === '.' || col(c) !== me) continue; const t = c.toLowerCase();
      if (t === 'p') {
        const d = me === 'w' ? 1 : -1, sr = me === 'w' ? 1 : 6, pr = me === 'w' ? 7 : 0;
        const pushTo = (tf, tr, extra) => { if (tr === pr) for (const p of 'qrbn') add(f, r, tf, tr, p, extra); else add(f, r, tf, tr, null, extra); };
        if (b[r + d][f] === '.') { pushTo(f, r + d); if (r === sr && b[r + 2 * d][f] === '.') add(f, r, f, r + 2 * d, null, 'dbl'); }
        for (const df of [-1, 1]) { const tf = f + df; if (tf < 0 || tf > 7) continue; const tc = b[r + d][tf]; if (tc !== '.' && col(tc) === op) pushTo(tf, r + d); else if (S.ep && S.ep[0] === tf && S.ep[1] === r + d && tc === '.') add(f, r, tf, r + d, null, 'ep'); }
      } else if (t === 'n') { for (const [a, bb] of [[1, 2], [2, 1], [-1, 2], [-2, 1], [1, -2], [2, -1], [-1, -2], [-2, -1]]) { const tf = f + a, tr = r + bb; if (tf < 0 || tf > 7 || tr < 0 || tr > 7) continue; if (b[tr][tf] === '.' || col(b[tr][tf]) === op) add(f, r, tf, tr); } }
      else if (t === 'k') {
        for (let a = -1; a <= 1; a++) for (let bb = -1; bb <= 1; bb++) { if (!a && !bb) continue; const tf = f + a, tr = r + bb; if (tf < 0 || tf > 7 || tr < 0 || tr > 7) continue; if (b[tr][tf] === '.' || col(b[tr][tf]) === op) add(f, r, tf, tr); }
        const hr = me === 'w' ? 0 : 7;
        if (r === hr && f === 4 && !attacked(b, 4, hr, op)) {
          const ks = me === 'w' ? 'K' : 'k', qs = me === 'w' ? 'Q' : 'q', rk = me === 'w' ? 'R' : 'r';
          if (S.cast.includes(ks) && b[hr][5] === '.' && b[hr][6] === '.' && b[hr][7] === rk && !attacked(b, 5, hr, op) && !attacked(b, 6, hr, op)) add(f, r, 6, hr, null, 'ck');
          if (S.cast.includes(qs) && b[hr][3] === '.' && b[hr][2] === '.' && b[hr][1] === '.' && b[hr][0] === rk && !attacked(b, 3, hr, op) && !attacked(b, 2, hr, op)) add(f, r, 2, hr, null, 'cq');
        }
      } else {
        const dirs = []; if (t !== 'b') dirs.push([1, 0], [-1, 0], [0, 1], [0, -1]); if (t !== 'r') dirs.push([1, 1], [1, -1], [-1, 1], [-1, -1]);
        for (const [a, bb] of dirs) { let tf = f + a, tr = r + bb; while (tf >= 0 && tf < 8 && tr >= 0 && tr < 8) { if (b[tr][tf] === '.') add(f, r, tf, tr); else { if (col(b[tr][tf]) === op) add(f, r, tf, tr); break; } tf += a; tr += bb; } }
      }
    }
    return out;
  }
  function apply(S, m) {
    const b = S.b.map(r => r.slice()), c = b[m.r][m.f]; b[m.r][m.f] = '.'; b[m.tr][m.tf] = m.promo ? (S.side === 'w' ? m.promo.toUpperCase() : m.promo) : c;
    if (m.extra === 'ep') b[m.r][m.tf] = '.'; if (m.extra === 'ck') { b[m.tr][7] = '.'; b[m.tr][5] = S.side === 'w' ? 'R' : 'r'; } if (m.extra === 'cq') { b[m.tr][0] = '.'; b[m.tr][3] = S.side === 'w' ? 'R' : 'r'; }
    let cast = S.cast; const rm = ch => { cast = cast.replace(ch, ''); };
    if (c === 'K') { rm('K'); rm('Q'); } if (c === 'k') { rm('k'); rm('q'); }
    const sq = (f, r) => (f === m.f && r === m.r) || (f === m.tf && r === m.tr);
    if (sq(0, 0)) rm('Q'); if (sq(7, 0)) rm('K'); if (sq(0, 7)) rm('q'); if (sq(7, 7)) rm('k'); if (!cast) cast = '-';
    return { b, side: S.side === 'w' ? 'b' : 'w', cast, ep: m.extra === 'dbl' ? [m.f, (m.r + m.tr) / 2] : null };
  }
  const legal = S => moves(S).filter(m => { const n = apply(S, m), k = kingPos(n.b, S.side); return !attacked(n.b, k[0], k[1], S.side === 'w' ? 'b' : 'w'); });
  function perft(S, d) { if (!d) return 1; let n = 0; for (const m of legal(S)) n += d === 1 ? 1 : perft(apply(S, m), d - 1); return n; }
  // 先手が n 手以内（先手の手の数）に必ずメイトできるか（わざと遅い全探索）
  function mates(S, n) {
    for (const m of legal(S)) {
      const T = apply(S, m), k = kingPos(T.b, T.side), inChk = attacked(T.b, k[0], k[1], S.side), replies = legal(T);
      if (!replies.length) { if (inChk) return true; continue; }
      if (n > 1 && replies.every(r => mates(apply(T, r), n - 1))) return true;
    }
    return false;
  }
  return { parse, perft, legal, mates };
})();
globalThis.__slowChess = slow;

const POS = {
  start: E.START,
  kiwipete: 'r3k2r/p1ppqpb1/bn2pnp1/3PN3/1p2P3/2N2Q1p/PPPBBPPP/R3K2R w KQkq - 0 1',
  pos3: '8/2p5/3p4/KP5r/1R3p1k/8/4P1P1/8 w - - 0 1',
  pos4: 'r3k2r/Pppp1ppp/1b3nbN/nP6/BBP1P3/q4N2/Pp1P2PP/R2Q1RK1 w kq - 0 1',
  pos4m: 'r2q1rk1/pP1p2pp/Q4n2/bbp1p3/Np6/1B3NBn/pPPP1PPP/R3K2R b KQ - 0 1',
  pos5: 'rnbq1k1r/pp1Pbppp/2p5/8/2B5/8/PPP1NnPP/RNBQK2R w KQ - 1 8',
  pos6: 'r4rk1/1pp1qppp/p1np1n2/2b1p1B1/2B1P1b1/P1NP1N2/1PP1QPPP/R4RK1 w - - 0 10',
};
const PERFT = {
  start: [20, 400, 8902, 197281, 4865609],
  kiwipete: [48, 2039, 97862, 4085603],
  pos3: [14, 191, 2812, 43238, 674624],
  pos4: [6, 264, 9467, 422333],
  pos4m: [6, 264, 9467, 422333],
  pos5: [44, 1486, 62379, 2103487],
  pos6: [46, 2079, 89890, 3894594],
};
for (const k of Object.keys(PERFT)) {
  test('perft ' + k + ': depth 1 to ' + PERFT[k].length + ' = ' + PERFT[k].join(', '), () => {
    const pos = E.fromFen(POS[k]), fen0 = E.toFen(pos);
    PERFT[k].forEach((n, i) => eq(E.perft(pos, i + 1), n, k + ' depth ' + (i + 1)));
    eq(E.toFen(pos), fen0, 'the position is back where it started');
  });
}

// ふちの局面（アンパッサンのピン・昇格してチェック・キャスリングの禁止 など）：数は、公開されている perft の値と、別のしくみの全探索の両方で確かめる
const EDGE = [
  ['3k4/3p4/8/K1P4r/8/8/8/8 b - - 0 1', 6, 1134888],
  ['8/8/4k3/8/2p5/8/B2P2K1/8 w - - 0 1', 6, 1015133],
  ['8/8/1k6/2b5/2pP4/8/5K2/8 b - d3 0 1', 6, 1440467],
  ['5k2/8/8/8/8/8/8/4K2R w K - 0 1', 6, 661072],
  ['3k4/8/8/8/8/8/8/R3K3 w Q - 0 1', 6, 803711],
  ['r3k2r/1b4bq/8/8/8/8/7B/R3K2R w KQkq - 0 1', 4, 1274206],
  ['r3k2r/8/3Q4/8/8/5q2/8/R3K2R b KQkq - 0 1', 4, 1720476],
  ['8/8/1P2K3/8/2n5/1q6/8/5k2 b - - 0 1', 5, 1004658],
  ['4k3/1P6/8/8/8/8/K7/8 w - - 0 1', 6, 217342],
  ['8/P1k5/K7/8/8/8/8/8 w - - 0 1', 6, 92683],
  ['K1k5/8/P7/8/8/8/8/8 w - - 0 1', 6, 2217],
];
test('perft of the tricky positions (en passant pins, castling through check, promotion with check, stalemates) matches the published numbers', () => {
  for (const [fen, d, n] of EDGE) eq(E.perft(E.fromFen(fen), d), n, fen + ' depth ' + d);
});
test('the move generator agrees with a slow, separately written one on tricky positions (depth 1-3, and more where it is cheap)', () => {
  const list = Object.values(POS).concat(EDGE.map(x => x[0]), ['2K2r2/3P4/8/8/8/8/8/3k4 w - - 0 1', '8/k1P5/8/8/8/8/8/7K w - - 0 1', 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1', '4k3/8/8/2pP4/8/8/8/4K3 w - c6 0 1', 'n1n5/PPPk4/8/8/8/8/4Kppp/5N1N b - - 0 1']);
  for (const fen of list) {
    const pos = E.fromFen(fen), S = slow.parse(fen), d = /^(r3k2r\/p1pp|rnbqkbnr|r4rk1|r3k2r\/Pppp|r2q1rk1|rnbq1k1r)/.test(fen) ? 3 : 4;
    for (let i = 1; i <= d; i++) eq(E.perft(pos, i), slow.perft(S, i), fen + ' depth ' + i);
  }
});
test('perft divide: the per-move counts add up, and every legal move of the start position is listed once', () => {
  const pos = E.fromFen(E.START), dv = E.perftDivide(pos, 3);
  eq(Object.keys(dv).length, 20); eq(Object.values(dv).reduce((a, b) => a + b, 0), 8902); eq(dv.e2e4, 600); eq(dv.b1c3, 440);
});

test('make / unmake restore everything, and the incremental hash always equals the hash computed from scratch (random games, castling, en passant, promotion)', () => {
  let seed = 12345; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  let cast = 0, ep = 0, promo = 0, caps = 0;
  for (let g = 0; g < 60; g++) {
    const pos = E.fromFen(g % 3 === 0 ? POS.kiwipete : g % 3 === 1 ? POS.pos4 : E.START), stack = [];
    for (let i = 0; i < 90; i++) {
      const lg = E.legalMoves(pos); if (!lg.length) break;
      const m = lg[Math.floor(rnd() * lg.length)], fl = m >> 16;
      if (fl & (E.F_KC | E.F_QC)) cast++; if (fl & E.F_EP) ep++; if ((m >> 12) & 15) promo++; if (fl & E.F_CAP) caps++;
      stack.push([m, E.toFen(pos), pos.h1, pos.h2]); pos.make(m);
      const h1 = pos.h1, h2 = pos.h2; pos.hashAll(); eq(pos.h1, h1, 'hash 1 after ' + E.uci(m)); eq(pos.h2, h2, 'hash 2');
    }
    while (stack.length) { const [m, fen, h1, h2] = stack.pop(); pos.unmake(); eq(E.toFen(pos), fen, 'unmake ' + E.uci(m)); eq(pos.h1, h1); eq(pos.h2, h2); }
  }
  ok(cast >= 1 && ep >= 1 && promo > 0 && caps > 200, 'the random games used castling ' + cast + ', en passant ' + ep + ', promotion ' + promo + ', captures ' + caps);
});
test('two different move orders reaching the same position give the same hash (and the en-passant square only counts when it can be used)', () => {
  const a = new E.Game(), b = new E.Game();
  for (const s of ['Nf3', 'Nf6', 'Nc3', 'Nc6']) a.play(s);
  for (const s of ['Nc3', 'Nc6', 'Nf3', 'Nf6']) b.play(s);
  eq(a.pos.h1, b.pos.h1); eq(a.pos.h2, b.pos.h2);
  // e2-e4 gives an en-passant square e3, but no black pawn can use it: the hash ignores it
  const c = new E.Game(); c.play('e4'); c.play('a6'); c.play('Nf3'); const d = new E.Game(); d.play('e3'); d.play('a6'); d.play('e4'); d.play('a5'); eq(c.pos.h1 === d.pos.h1, false, 'a6 vs a5 differ');
  const e1 = new E.Game(); e1.play('e4'); e1.play('d5'); const e2 = new E.Game(); e2.play('e3'); e2.play('d5'); e2.play('e4'); eq(e1.pos.h1 === e2.pos.h1, false, 'e4 d5 has an en-passant square that e5-pawn could use? (here none): the boards equal, so the hash equals');
});

test('FEN: the start position, round trips (including en passant and castling fields), missing fields, and the errors', () => {
  eq(E.toFen(E.fromFen(E.START)), E.START);
  for (const f of Object.values(POS).concat(EDGE.map(x => x[0]))) eq(E.toFen(E.fromFen(f)), f.replace(/^(\S+ \S+ \S+ \S+)$/, '$1 0 1'), f);
  eq(E.toFen(E.fromFen('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR')), 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w - - 0 1', 'missing fields default (white to move, no castling)');
  eq(E.toFen(E.fromFen('rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1')), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1');
  eq(E.toFen(E.fromFen('4k3/8/8/8/8/8/8/R3K2R b KQ e3 0 1')), '4k3/8/8/8/8/8/8/R3K2R b KQ - 0 1', 'an en passant square with no pawn is dropped');
  eq(E.toFen(E.fromFen('4k3/8/8/8/8/8/8/4K2R w KQkq - 0 1')), '4k3/8/8/8/8/8/8/4K2R w K - 0 1', 'castling rights without the rook are dropped');
  const bad = { '': 'fields', 'x': 'rank', '8/8/8/8/8/8/8': 'rank', '9/8/8/8/8/8/8/8': 'char', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNX w': 'char', '8/8/8/8/8/8/8/8 w - - 0 1': 'kings', '4k3/8/8/8/8/8/8/8 w - - 0 1': 'kings', '4k3/8/8/8/8/8/8/3KK3 w - - 0 1': 'kings',
    'P3k3/8/8/8/8/8/8/4K3 w - - 0 1': 'pawns', '4k3/8/8/8/8/8/8/p3K3 w - - 0 1': 'pawns', '4k3/8/8/8/8/8/8/4K3 x - - 0 1': 'side', '4k3/8/8/8/8/8/8/4K3 w KX - 0 1': 'cast', '4k3/8/8/8/8/8/8/4K3 w - e9 0 1': 'ep', '4k3/8/8/8/8/8/8/4K3 w - e4 0 1': 'ep',
    '4k3/4R3/8/8/8/8/8/4K3 w - - 0 1': 'check', 'ppppppppp/8/8/8/8/8/8/4K2k w - - 0 1': 'pawns' };
  for (const [f, code] of Object.entries(bad)) { const r = E.parseFen(f); ok(r.error, 'rejects ' + JSON.stringify(f)); eq(r.error, code, f); }
  eq(E.parseFen('4k3/8/8/8/8/8/8/4K3 w - - 0 1').error, undefined);
  let threw = false; try { E.fromFen('nonsense'); } catch (e) { threw = true; } ok(threw);
  // 9 pawns / 17 pieces
  eq(E.parseFen('4k3/pppppppp/p7/8/8/8/8/4K3 w - - 0 1').error, 'count');
});

test('the squares: names and numbers (a1 = 0, h8 = 63), piece characters', () => {
  eq(E.sqName(0), 'a1'); eq(E.sqName(63), 'h8'); eq(E.sqName(28), 'e4'); for (let i = 0; i < 64; i++) eq(E.parseSq(E.sqName(i)), i);
  eq(E.parseSq('i1'), -1); eq(E.parseSq('a9'), -1); eq(E.pieceChar(1), 'P'); eq(E.pieceChar(14), 'k'); eq(E.pieceChar(0), '');
});

test('SAN: the start-position moves, captures, disambiguation (file, rank, both), castling, promotion, check and mate marks', () => {
  const g = new E.Game(); const sans = g.legal().map(m => E.toSan(g.pos, m)).sort();
  deq(sans, ['Na3', 'Nc3', 'Nf3', 'Nh3', 'a3', 'a4', 'b3', 'b4', 'c3', 'c4', 'd3', 'd4', 'e3', 'e4', 'f3', 'f4', 'g3', 'g4', 'h3', 'h4']);
  const san = (fen, uci) => { const gm = new E.Game(fen); const r = E.parseMove(gm.pos, uci); ok(r.move != null, 'move ' + uci + ' in ' + fen + ' ' + JSON.stringify(r)); return E.toSan(gm.pos, r.move); };
  eq(san('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'e1g1'), 'O-O'); eq(san('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'e1c1'), 'O-O-O'); eq(san('r3k2r/8/8/8/8/8/8/4K3 b kq - 0 1', 'e8g8'), 'O-O');
  eq(san('4k3/8/8/8/8/8/8/R3K2R w KQ - 0 1', 'a1a8'), 'Ra8+');
  eq(san('6k1/5ppp/8/8/8/8/8/R3R2K w - - 0 1', 'a1a8'), 'Ra8#');
  // two rooks can reach d1: by file
  eq(san('4k3/8/8/8/8/8/4K3/R6R w - - 0 1', 'a1d1'), 'Rad1'); eq(san('4k3/8/8/8/8/8/4K3/R6R w - - 0 1', 'h1d1'), 'Rhd1');
  // by rank
  eq(san('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1', 'a1a3'), 'R1a3'); eq(san('4k3/8/8/R7/8/8/8/R3K3 w - - 0 1', 'a5a3'), 'R5a3');
  // three queens: file and rank
  eq(san('7k/8/8/3Q1Q2/8/8/8/K2Q4 w - - 0 1', 'd5d3'), 'Qd5d3', 'three queens reach d3: the file is shared with d1 and the rank with f5, so both are written');
  eq(san('7k/8/8/3Q1Q2/8/8/8/K2Q4 w - - 0 1', 'd1d3'), 'Q1d3'); eq(san('7k/8/8/3Q1Q2/8/8/8/K2Q4 w - - 0 1', 'f5d3'), 'Qfd3');
  eq(san('3k4/8/8/8/8/8/8/Q3Q2K w - - 0 1', 'a1b1'), 'Qab1'); // two queens, file letter
  eq(san('rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1', 'e2e4'), 'e4');
  eq(san('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1', 'b7b8q'), 'b8=Q+'); eq(san('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1', 'b7b8n'), 'b8=N'); eq(san('3rk3/2P5/8/8/8/8/8/4K3 w - - 0 1', 'c7d8q'), 'cxd8=Q+');
  eq(san('4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1', 'e5d6'), 'exd6');
  // Knights: Nbd2 / Nfd2
  eq(san('4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1', 'b1d2'), 'Nbd2'); eq(san('4k3/8/8/8/8/5N2/8/1N2K3 w - - 0 1', 'f3d2'), 'Nfd2');
});
test('SAN is unique: no two legal moves of a position share a SAN (random positions), and parseMove gives every legal move back', () => {
  let seed = 7; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let g = 0; g < 40; g++) {
    const gm = new E.Game(g % 2 ? POS.kiwipete : null);
    for (let i = 0; i < 70 && !gm.status().over; i++) {
      const lg = gm.legal(), sans = lg.map(m => E.toSan(gm.pos, m, lg)); eq(new Set(sans).size, sans.length, 'unique SAN');
      lg.forEach((m, j) => { const r = E.parseMove(gm.pos, sans[j], lg); eq(r.move, m, 'SAN ' + sans[j]); const r2 = E.parseMove(gm.pos, E.uci(m), lg); eq(r2.move, m, 'UCI ' + E.uci(m)); });
      gm.play(lg[Math.floor(rnd() * lg.length)]);
    }
  }
});
test('parseMove is forgiving about notation and strict about illegal moves', () => {
  const gm = new E.Game();
  for (const t of ['e4', 'e2e4', 'e2-e4', ' E4'.trim().toLowerCase(), 'Pe4'.slice(1)]) eq(E.uci(E.parseMove(gm.pos, t).move), 'e2e4', t);
  for (const t of ['Nf3', 'nf3', 'g1f3', 'Ng1f3', 'Ng1-f3', 'N g1f3'.replace(' ', '')]) eq(E.uci(E.parseMove(gm.pos, t).move), 'g1f3', t);
  for (const t of ['e5', 'Ke2', 'Nf4', 'O-O', 'zz', '', 'e2e5', 'a1a2', 'Qd4']) ok(E.parseMove(gm.pos, t).error, 'rejects "' + t + '"');
  const p = new E.Game('r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  for (const t of ['O-O', '0-0', 'o-o'.toUpperCase(), 'e1g1', 'O-O+']) eq(E.uci(E.parseMove(p.pos, t).move), 'e1g1', t);
  for (const t of ['O-O-O', '0-0-0', 'e1c1']) eq(E.uci(E.parseMove(p.pos, t).move), 'e1c1', t);
  const q = new E.Game('4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
  eq(E.uci(E.parseMove(q.pos, 'b8=Q').move), 'b7b8q'); eq(E.uci(E.parseMove(q.pos, 'b8Q').move), 'b7b8q'); eq(E.uci(E.parseMove(q.pos, 'b7b8n').move), 'b7b8n'); eq(E.uci(E.parseMove(q.pos, 'b8=N').move), 'b7b8n'); eq(E.uci(E.parseMove(q.pos, 'b7b8').move), 'b7b8q', 'no piece named: queen');
  const two = new E.Game('4k3/8/8/8/8/8/4K3/R6R w - - 0 1'); eq(E.parseMove(two.pos, 'Rd1').error, 'ambiguous'); eq(E.uci(E.parseMove(two.pos, 'Rad1').move), 'a1d1');
});

// ---- ルールのふち
const play = (fen, ...mv) => { const g = new E.Game(fen); for (const m of mv) { const r = g.play(m); ok(r.ok, 'plays ' + m + ' (' + r.error + ') in ' + g.fen()); } return g; };
const legalHas = (g, u) => g.legal().some(m => E.uci(m) === u);
test('castling: allowed when free; not after the king or that rook has moved; not through, out of or into check; not when a piece is in between; the rook goes to the right square', () => {
  const f = 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1';
  let g = new E.Game(f); ok(legalHas(g, 'e1g1') && legalHas(g, 'e1c1'));
  g.play('O-O'); eq(g.pos.b[E.parseSq('g1')], 6); eq(g.pos.b[E.parseSq('f1')], 4); eq(g.pos.b[E.parseSq('h1')], 0); ok(g.fen().includes(' kq '));
  g.play('O-O-O'); eq(g.pos.b[E.parseSq('c8')], 14); eq(g.pos.b[E.parseSq('d8')], 12); eq(g.pos.b[E.parseSq('a8')], 0);
  g.undo(2); eq(g.fen(), f, 'undo restores the rooks and the rights');
  g = play(f, 'Rh2', 'Ra7'); ok(!legalHas(g, 'e1g1') && legalHas(g, 'e1c1'), 'the h-rook moved: no short castling'); // rook h1-h2: rights K lost
  g = play(f, 'Kd1', 'Kd8', 'Ke1', 'Ke8'); ok(!legalHas(g, 'e1g1') && !legalHas(g, 'e1c1'), 'the king moved and came back: no castling at all');
  g = play(f, 'Rh1h2', 'Rh8h7', 'Rh2h1', 'Rh7h8'); ok(!legalHas(g, 'e1g1') && legalHas(g, 'e1c1'), 'the rook went away and came back: only the other side');
  ok(!legalHas(new E.Game('r3k2r/8/8/8/8/8/8/R3K1NR w KQkq - 0 1'), 'e1g1'), 'a piece between');
  ok(!legalHas(new E.Game('r3k2r/8/8/8/8/8/8/RN2K2R w KQkq - 0 1'), 'e1c1'), 'a piece between (queen side, b-file)');
  ok(!legalHas(new E.Game('r3k2r/8/8/8/8/5r2/8/R3K2R w KQkq - 0 1'), 'e1g1'), 'through check (f1 attacked)');
  ok(legalHas(new E.Game('r3k2r/8/8/8/8/1r6/8/R3K2R w KQkq - 0 1'), 'e1c1'), 'the b-file may be attacked when castling long (the king does not cross it)');
  ok(!legalHas(new E.Game('r3k2r/8/8/8/8/8/3r4/R3K2R w KQkq - 0 1'), 'e1c1'), 'd1 attacked');
  ok(!legalHas(new E.Game('r3k2r/8/8/8/8/8/6r1/R3K2R w KQkq - 0 1'), 'e1g1'), 'into check (g1 attacked)');
  ok(!legalHas(new E.Game('r3k2r/8/8/8/8/4r3/8/R3K2R w KQkq - 0 1'), 'e1g1') && !legalHas(new E.Game('r3k2r/8/8/8/8/4r3/8/R3K2R w KQkq - 0 1'), 'e1c1'), 'out of check');
  // a captured rook takes the right with it
  g = play('r3k2r/8/8/8/8/8/6b1/R3K2R b KQkq - 0 1', 'Bxh1'); ok(!legalHas(g, 'e1g1') && legalHas(g, 'e1c1'), 'the rook on h1 was taken: only long castling is left');
  // castling captures nothing; black castles on its own back rank
  g = play('r3k2r/8/8/8/8/8/8/R3K2R b KQkq - 0 1', 'O-O'); eq(g.pos.b[E.parseSq('g8')], 14); eq(g.pos.b[E.parseSq('f8')], 12);
});
test('en passant: only on the very next move; removes the right pawn; can be undone; not when it would leave the king in check (rank pin)', () => {
  let g = play(E.START, 'e4', 'a6', 'e5', 'd5');
  ok(legalHas(g, 'e5d6'), 'en passant available right after d7-d5');
  g.play('exd6'); eq(g.pos.b[E.parseSq('d5')], 0, 'the d5 pawn is gone'); eq(g.pos.b[E.parseSq('d6')], 1); eq(E.toSan(new E.Game(E.START).pos, E.parseMove(new E.Game(E.START).pos, 'e4').move), 'e4');
  g.undo(1); eq(g.pos.b[E.parseSq('d5')], 9, 'undo puts the pawn back'); eq(g.pos.b[E.parseSq('d6')], 0); eq(g.pos.b[E.parseSq('e5')], 1);
  g = play(E.START, 'e4', 'a6', 'e5', 'd5', 'Nf3', 'a5'); ok(!legalHas(g, 'e5d6'), 'one move later it is too late');
  eq(g.fen().split(' ')[3], '-', 'no en passant square one move later');
  g = play(E.START, 'e4', 'a6', 'e5', 'd5'); ok(g.fen().includes(' d6 '), 'the FEN shows the square');
  // black captures en passant too
  g = play('4k3/8/8/8/3p4/8/4P3/4K3 w - - 0 1', 'e4'); ok(legalHas(g, 'd4e3')); g.play('dxe3'); eq(g.pos.b[E.parseSq('e4')], 0); eq(g.pos.b[E.parseSq('e3')], 9);
  // pinned along the rank: the capture would expose the king
  ok(!legalHas(new E.Game('8/8/8/8/k2pP2R/8/8/4K3 b - e3 0 1'), 'd4e3'), 'the pawn pair on the 4th rank is pinned against the king');
  ok(legalHas(new E.Game('8/8/8/8/k2pP3/8/8/4K3 b - e3 0 1'), 'd4e3'), 'without the rook it is legal');
});
test('promotion: four pieces, by push and by capture; the new piece is the right colour; under-promotion to a knight can give check; undo restores the pawn', () => {
  let g = new E.Game('3r3k/2P5/8/8/8/8/8/4K3 w - - 0 1');
  const m = g.legal().filter(x => ((x & 63) === E.parseSq('c7')));
  eq(m.length, 8, '4 pushes + 4 captures'); eq(new Set(m.map(x => (x >> 12) & 15)).size, 4);
  g.play('c8=N'); eq(g.pos.b[E.parseSq('c8')], 2); g.undo(1); eq(g.pos.b[E.parseSq('c7')], 1);
  g = play('7k/5P2/8/8/8/8/8/4K3 w - - 0 1', 'f8=N'); ok(g.status().check === false); // f8 knight does not attack h8
  g = play('8/5P1k/8/8/8/8/8/4K3 w - - 0 1', 'f8=N'); ok(g.status().check, 'the knight on f8 attacks h7'); eq(g.sans[0], 'f8=N+');
  g = play('4k3/8/8/8/8/8/p7/4K3 b - - 0 1', 'a1=Q'); eq(g.pos.b[E.parseSq('a1')], 13, 'a black queen'); ok(g.status().check, 'the queen on a1 checks along the first rank'); eq(g.sans[0], 'a1=Q+');
});
test('checkmate and stalemate: fool\'s mate, scholar\'s mate, back rank; a stalemate; the result strings', () => {
  let g = play(E.START, 'f3', 'e5', 'g4', 'Qh4#'); let s = g.status(); ok(s.over); eq(s.reason, 'mate'); eq(s.result, '0-1'); eq(s.winner, 1); eq(g.sans[3], 'Qh4#');
  g = play(E.START, 'e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6', 'Qxf7#'); s = g.status(); eq(s.reason, 'mate'); eq(s.result, '1-0'); eq(s.winner, 0); eq(g.legal().length, 0);
  g = new E.Game('7k/5Q2/6K1/8/8/8/8/8 b - - 0 1'); s = g.status(); ok(s.over); eq(s.reason, 'stalemate'); eq(s.result, '1/2-1/2'); eq(s.winner, -1); ok(!s.check);
  g = new E.Game('6k1/5ppp/8/8/8/8/8/R3K3 w - - 0 1'); g.play('Ra8#'); eq(g.status().reason, 'mate');
  g = new E.Game(E.START); s = g.status(); eq(s.over, false); eq(s.result, '*');
  g = play(E.START, 'e4', 'e5', 'Bc4', 'Nc6', 'Qh5', 'Nf6'); ok(g.legal().some(m => E.toSan(g.pos, m) === 'Qxf7#'));
});
test('threefold repetition (knight shuffle) ends the game as a draw on the third occurrence; the five-fold and 75-move rules are automatic; the 50-move rule', () => {
  const g = new E.Game(); const shuf = ['Nf3', 'Nf6', 'Ng1', 'Ng8'];
  for (let i = 0; i < 2; i++) for (const m of shuf) { g.play(m); if (i === 0 || m !== 'Ng8') ok(!g.status().over, 'not yet at ' + g.sans.length); }
  eq(g.repeats(), 3); let s = g.status(); ok(s.over); eq(s.reason, 'repetition'); eq(s.result, '1/2-1/2');
  g.undo(1); ok(!g.status().over, 'undo takes the draw back'); eq(g.repeats(), 2);
  // different castling rights or side to move are different positions
  const h = new E.Game('4k3/8/8/8/8/8/8/R3K3 w Q - 0 1'); for (const m of ['Kd1', 'Kd8', 'Ke1', 'Ke8']) h.play(m); eq(h.repeats(), 1, 'the castling right is gone, so it is a new position');
  // 50 moves without a capture or pawn move: a draw; a capture resets the count
  let f = new E.Game('4k3/8/8/8/8/8/R7/4K3 w - - 99 80'); eq(f.status().over, false); f.play('Ra3'); s = f.status(); ok(s.over); eq(s.reason, 'fifty');
  f = new E.Game('4k3/8/8/8/8/8/R7/4K3 w - - 99 80'); ok(f.legal().length > 0);
  f = new E.Game('4k3/8/8/8/8/8/R6r/4K3 w - - 99 80'); f.play('Rxh2'); eq(f.pos.half, 0); ok(!f.status().over || f.status().reason === 'insufficient' || f.status().reason === 'stalemate' || f.status().reason === 'mate');
  f = new E.Game('4k3/8/8/8/8/8/R7/4K3 w - - 149 90'); f.play('Rb2'); eq(f.status().reason, 'seventyfive');
  f = new E.Game('4k3/8/8/8/8/8/R7/4K3 w - - 99 80'); f.play('Ra1'); eq(f.status().reason, 'fifty');
  // mate on the 100th half-move is still mate
  f = new E.Game('6k1/5ppp/8/8/8/8/8/R3K3 w - - 99 80'); f.play('Ra8#'); eq(f.status().reason, 'mate');
  f = new E.Game(); const cyc = ['Nf3', 'Nf6', 'Ng1', 'Ng8']; for (let i = 0; i < 5; i++) for (const m of cyc) { if (g.status().over) break; f.play(m); } ok(f.status().over);
});
test('insufficient material: K v K, K+B v K, K+N v K, bishops on the same colour; not K+N v K+N, bishops on different colours, any pawn / rook / queen; canMate for the clock rule', () => {
  const insuf = f => E.insufficient(E.fromFen(f));
  for (const f of ['8/8/4k3/8/8/4K3/8/8 w - - 0 1', '8/8/4k3/8/8/4K3/8/5B2 w - - 0 1', '8/8/4k3/8/8/4K3/8/5N2 w - - 0 1', '8/8/4kb2/8/8/4K3/8/5B2 w - - 0 1'.replace('4kb2', '4k3').replace('5B2', '5B2'), '8/8/2b1k3/8/8/4K3/8/5B2 w - - 0 1']) ok(insuf(f), f);

  for (const f of ['8/8/4k3/8/8/4K3/8/5NN1 w - - 0 1', '8/8/4k3/8/8/4K3/4P3/5B2 w - - 0 1', '8/8/4k3/8/8/4K3/8/4R3 w - - 0 1', '8/8/4k3/8/8/4K3/8/4Q3 w - - 0 1', '8/8/2n1k3/8/8/4K3/8/5N2 w - - 0 1', '8/8/4k3/8/8/4K3/8/2B2B2 w - - 0 1', '8/8/4k3/2b5/8/4K3/8/5B2 w - - 0 1', 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1']) ok(!insuf(f), 'enough material: ' + f);
  // two bishops on different colours: g1 (light? ) and c1: opposite colours
  ok(E.canMate(E.fromFen('8/8/4k3/8/8/4K3/8/2B2B2 w - - 0 1'), 0));
  const sq = E.parseSq; const col = s => ((s >> 3) + (s & 7)) & 1; ok(col(sq('c1')) !== col(sq('f1')), 'c1 and f1 are bishops of different colours');
  ok(!insuf('8/8/4k3/8/8/4K3/8/2B2B2 w - - 0 1'), 'c1+f1 are different colours: not a dead position');

  const cm = (f, c) => E.canMate(E.fromFen(f), c);
  ok(!cm('8/8/4k3/8/8/4K3/8/5B2 w - - 0 1', 0)); ok(!cm('8/8/4k3/8/8/4K3/8/5N2 w - - 0 1', 0)); ok(cm('8/8/4k3/8/8/4K3/8/4R3 w - - 0 1', 0)); ok(cm('8/8/4k3/8/8/4K3/4P3/8 w - - 0 1', 0)); ok(cm('8/8/4k3/8/8/4K3/8/2B2B2 w - - 0 1', 0), 'opposite-colour bishops can');
  ok(cm('8/8/4k3/8/8/4K3/8/5NN1 w - - 0 1', 0), 'two knights: a mate is possible with the opponent\'s help');
  ok(cm('8/8/3pk3/8/8/4K3/8/5N2 w - - 0 1', 0), 'a knight against a king with a pawn: a helpmate exists');
  const g = new E.Game('8/8/4k3/8/8/4K3/8/5B2 w - - 0 1'); eq(g.status().reason, 'insufficient'); eq(g.status().result, '1/2-1/2');
  // a position that becomes insufficient by a capture
  const h = new E.Game('8/8/4k3/8/8/4K3/3p4/2B5 w - - 0 1'.replace('3p4', '3n4')); h.play('Bxd2'); eq(h.status().reason, 'insufficient');
});
test('Game: undo / end / fenAt / lastMove / fromUci; an external end (resign, time) wins over the position', () => {
  const g = new E.Game(); g.play('e4'); g.play('e5'); g.play('Nf3');
  eq(g.fenAt(0), E.START); eq(g.fenAt(1), 'rnbqkbnr/pppppppp/8/8/4P3/8/PPPP1PPP/RNBQKBNR b KQkq e3 0 1'); eq(g.fenAt(3), g.fen()); eq(g.list.length, 3);
  eq(g.undo(2), 2); eq(g.list.length, 1); eq(g.fen(), g.fenAt(1)); eq(g.undo(9), 1); eq(g.fen(), E.START);
  const h = E.Game.fromUci(['e2e4', 'e7e5', 'g1f3', 'b8c6', 'f1b5']); eq(h.sans.join(' '), 'e4 e5 Nf3 Nc6 Bb5'); eq(E.uci(h.lastMove()), 'f1b5');
  let threw = false; try { E.Game.fromUci(['e2e5']); } catch (e) { threw = true; } ok(threw);
  const r = h.end('resign', 0); eq(r.result, '1-0'); eq(h.status().reason, 'resign'); eq(h.end('time', -1).result, '1/2-1/2');
  const bad = h.play('zzz'); eq(bad.ok, false);
  const k = new E.Game(); eq(k.play('e5').ok, false); eq(k.play(0).ok, false, 'a number that is not a legal move');
});

// ---- PGN
const GAME_PGN = '[Event "Test"]\n[Site "?"]\n[Date "2026.11.26"]\n[Round "1"]\n[White "Anna"]\n[Black "Ben"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7# 1-0\n';
test('PGN: the Evergreen game parses to its end (mate), and writing it out and reading it again gives the same moves, tags and result', () => {
  const r = E.fromPgn(GAME_PGN); ok(r.game, JSON.stringify(r)); eq(r.game.list.length, 47); eq(r.game.status().reason, 'mate'); eq(r.result, '1-0'); eq(r.tags.White, 'Anna');
  const out = E.toPgn(r.game, { White: 'Anna', Black: 'Ben', Event: 'Test', Date: '2026.11.26', Result: '1-0', Site: '?', Round: '1' });
  ok(out.startsWith('[Event "Test"]')); ok(/\n\n1\. e4 e5 2\. Nf3 Nc6/.test(out)); ok(out.trim().endsWith('1-0'));
  for (const line of out.split('\n')) ok(line.length <= 80 || line.startsWith('['), 'wrapped at 80: ' + line.length);
  const back = E.fromPgn(out); eq(back.game.sans.join(' '), r.game.sans.join(' ')); eq(back.tags.Black, 'Ben'); eq(back.result, '1-0'); eq(back.game.fen(), r.game.fen());
});
test('PGN import: comments, variations (nested), NAGs, move numbers with dots, "0-0", annotation marks, a result inside, a FEN start, lines and BOM; the errors say where', () => {
  const r = E.fromPgn('\uFEFF[Event "x"]\n[SetUp "1"]\n[FEN "4k3/8/8/8/8/8/4P3/4K3 w - - 0 1"]\n\n1. e4 {best by test} Kd7!? ; a line comment\n2. Ke2 $1 (2. Kd2 (2. Kf2 Ke7) Ke7) Ke7 3. Kf3 Kd6 *\n');
  ok(r.game, JSON.stringify(r)); eq(r.game.start, '4k3/8/8/8/8/8/4P3/4K3 w - - 0 1'); eq(r.game.sans.join(' '), 'e4 Kd7 Ke2 Ke7 Kf3 Kd6'); eq(r.game.list.length, 6);
  const c = E.fromPgn('1. e4 e5 2. Nf3 Nc6 3. Bb5 a6 4. O-O Nf6 0-1'); eq(c.game.sans.length, 8); eq(c.result, '0-1');
  const z = E.fromPgn('1. e4 e5 2. 0-0'.replace('2. 0-0', '2. Nf3 Nc6 3. Bc4 Nf6 4. 0-0')); eq(z.game.sans[z.game.sans.length - 1], 'O-O');
  const bad = E.fromPgn('1. e4 e5 2. Nf3 Nf3'); eq(bad.error, 'none'); eq(bad.ply, 4); eq(bad.token, 'Nf3');
  const bad2 = E.fromPgn('[FEN "garbage"]\n[SetUp "1"]\n\n1. e4'); eq(bad2.error, 'fen');
  eq(E.fromPgn('').game.list.length, 0); eq(E.fromPgn('1-0').result, '1-0');
});
test('PGN export of a game from a FEN carries SetUp and FEN; a black-to-move start numbers its first move 1...', () => {
  const g = new E.Game('4k3/8/8/8/8/8/p7/4K3 b - - 0 7'); g.play('a1=Q');
  const out = E.toPgn(g, { White: 'a', Black: 'b' }); ok(out.includes('[SetUp "1"]') && out.includes('[FEN "4k3/8/8/8/8/8/p7/4K3 b - - 0 7"]'), out); ok(/7\.\.\. a1=Q\+/.test(out), out);
  const back = E.fromPgn(out); eq(back.game.sans[0], g.sans[0]);
});
test('PGN round trip over random games (every ply is read back identically, with promotions and castling)', () => {
  let seed = 99; const rnd = () => { seed = (seed * 1664525 + 1013904223) >>> 0; return seed / 4294967296; };
  for (let k = 0; k < 40; k++) {
    const g = new E.Game(k % 4 === 0 ? POS.kiwipete : k % 4 === 1 ? POS.pos4 : null);
    for (let i = 0; i < 100 && !g.status().over; i++) { const lg = g.legal(); g.play(lg[Math.floor(rnd() * lg.length)]); }
    const pgn = E.toPgn(g, {}), back = E.fromPgn(pgn); ok(back.game, 'parses game ' + k + ' ' + JSON.stringify(back).slice(0, 100)); eq(back.game.ucis.join(' '), g.ucis.join(' ')); eq(back.game.fen(), g.fen());
  }
});

// ---- 持ち時間
test('clock: counts down only for the side to move, adds the increment after a move, flags at zero, stops, and casual play has no clock', () => {
  const c = new E.Clock(1, 0); eq(E.TC[1].base, 180); eq(c.left(0, 0), 180000); c.start(0, 0);
  eq(c.left(0, 5000), 175000); eq(c.left(1, 5000), 180000); ok(c.press(0, 5000)); eq(c.rem[0], 177000, '180 - 5 + 2'); eq(c.run, 1);
  ok(c.press(1, 9000)); eq(c.rem[1], 180000 - 4000 + 2000); eq(c.run, 0); eq(c.flagged(9000 + 177000 - 1), -1); eq(c.flagged(9000 + 177000), 0);
  ok(!c.press(0, 9000 + 200000), 'out of time'); eq(c.rem[0], 0);
  const d = new E.Clock(2, 0); d.start(0, 0); d.press(0, 1000); eq(d.rem[0], 299000, 'no increment in 5+0'); d.stop(4000); eq(d.rem[1], 297000); eq(d.run, -1);
  const n = new E.Clock(0, 0); eq(n.on, false); eq(n.left(0, 1e9), Infinity); ok(n.press(0, 1e9)); eq(n.flagged(1e9), -1);
  eq(E.TC.length, 5); deq(E.TC.map(t => [t.base, t.inc]), [[0, 0], [180, 2], [300, 0], [600, 0], [900, 10]]);
});

run();
