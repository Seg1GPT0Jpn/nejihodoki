// chess/puzzles.js（「今日のパズル」120問）の証明：形（5段 × 24問・同じ局面なし・FEN が正しい）・
// メイトの問題は「答えが1つだけ・もっと短いメイトがない」を、全部の合法手を調べるソルバー（ai.js）と、別のしくみの全探索（1手・2手メイト）の両方で確かめ、答えの手順がメイトまで続くこと、
// 駒を取って得をする問題は、読みの深さを変えても最善手が答えで、次点との差が大きいこと・答えの手順が合法なこと・
// 毎日の5問（dailySet）が決まった形で選ばれること・puzzleOk / puzzleReply が問題のとおりに動くこと。
// 実行：node tools/tests/unit/chess-puzzles.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'chess/engine.js'));
global.ChessEngine = E;
const AI = require(path.join(ROOT, 'chess/ai.js'));
const BANK = require(path.join(ROOT, 'chess/puzzles.js'));

// ---- 別のしくみ（engine.test.js と同じ書き方の、わざと遅い全探索）
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
  // 先手が n 手以内で必ずメイトできるか、のうち、最初の手ごとに（その手で n 手以内にメイトになるか）
  function firstMates(S, n) {
    const out = [];
    for (const m of legal(S)) {
      const T = apply(S, m), k = kingPos(T.b, T.side), inChk = attacked(T.b, k[0], k[1], S.side), replies = legal(T);
      const uci = 'abcdefgh'[m.f] + (m.r + 1) + 'abcdefgh'[m.tf] + (m.tr + 1) + (m.promo || '');
      let win = false;
      if (!replies.length) win = inChk; else if (n > 1) win = replies.every(r => mates(apply(T, r), n - 1));
      if (win) out.push(uci);
    }
    return out;
  }
  function mates(S, n) { return firstMates(S, n).length > 0; }
  return { parse, firstMates, mates };
})();

test('the bank: 120 puzzles in 5 tiers of 24 (1-move mate, win material, 2-move mate, win material (deeper), 3-move mate), all positions different and legal', () => {
  eq(BANK.list.length, 120); eq(BANK.tiers, 5);
  const kinds = ['m1', 'w', 'm2', 'w', 'm3'], seen = new Set();
  BANK.list.forEach((p, i) => {
    const t = Math.floor(i / 24); eq(p.k, kinds[t], 'puzzle ' + i + ' is in tier ' + (t + 1));
    const r = E.parseFen(p.f); ok(!r.error, 'FEN ' + i + ' ' + r.error); ok(r.pos && !r.pos.inCheck(), 'the side to move is not in check ' + i);
    const key = p.f.split(' ').slice(0, 2).join(' '); ok(!seen.has(key), 'duplicate ' + i); seen.add(key);
    ok(Array.isArray(p.s) && p.s.length >= 1 && p.n === E.legalMoves(r.pos).length, 'solution and move count of ' + i);
  });
});
test('every solution line is legal move by move; the mate lines end in checkmate with the right length (1, 2 or 3 of your moves)', () => {
  BANK.list.forEach((p, i) => {
    const g = new E.Game(p.f);
    for (const u of p.s) { const r = g.play(u); ok(r.ok, 'puzzle ' + i + ' move ' + u + ': ' + r.error); }
    if (p.k !== 'w') {
      const n = +p.k[1]; eq(g.status().reason, 'mate', 'puzzle ' + i + ' ends in mate'); eq(p.s.length, 2 * n - 1, 'puzzle ' + i + ' has ' + n + ' of your moves'); eq(g.status().winner, new E.Game(p.f).turn(), 'the side to move mates');
    }
  });
});
test('mate puzzles (the engine\'s exhaustive solver): the first move is the only move that forces mate within the stated number, and no shorter mate exists', () => {
  BANK.list.forEach((p, i) => {
    if (p.k === 'w') return;
    const n = +p.k[1], pos = E.fromFen(p.f);
    const ms = AI.matingMoves(pos, n).map(E.uci); eq(ms.length, 1, 'puzzle ' + i + ' unique: ' + ms.join(',')); eq(ms[0], p.s[0], 'puzzle ' + i + ' answer');
    if (n > 1) ok(!AI.attackerMates(pos, n - 1), 'puzzle ' + i + ' has no mate in ' + (n - 1));
  });
});
test('mate in 1 and mate in 2 puzzles agree with a separately written slow search (the same unique first move; no shorter mate)', () => {
  BANK.list.forEach((p, i) => {
    if (p.k !== 'm1' && p.k !== 'm2') return;
    const n = +p.k[1], S = slow.parse(p.f), fm = slow.firstMates(S, n);
    eq(JSON.stringify(fm), JSON.stringify([p.s[0]]), 'puzzle ' + i + ' slow unique first move');
    if (n === 2) eq(slow.firstMates(S, 1).length, 0, 'puzzle ' + i + ' no mate in 1');
  });
});
test('win-material puzzles: the answer is the best move at every depth that is checked (tier 2: 3 and 5; tier 4: 6 and 7), with a clear gap to the second best, and it gains material over the quiet moves', () => {
  BANK.list.forEach((p, i) => {
    if (p.k !== 'w') return;
    const pos = E.fromFen(p.f), base = AI.materialOnly(pos), hard = i >= 72;
    let last = null;
    for (const d of hard ? [6, 7] : [3, 5]) {
      AI.ttClear(); const sc = AI.scoreMoves(pos, d, { ms: 60000 }); ok(sc.length >= 2); last = sc;
      eq(E.uci(sc[0].move), p.s[0], 'puzzle ' + i + ' depth ' + d + ' best');
      ok(sc[0].score - sc[1].score >= (hard && d === 6 ? 250 : 200), 'puzzle ' + i + ' depth ' + d + ' gap ' + (sc[0].score - sc[1].score));
    }
    ok(last[0].score - base >= 200, 'puzzle ' + i + ' wins material: ' + (last[0].score - base));
    ok(p.g >= 200, 'recorded gain ' + p.g);
  });
});
test('the harder win-material tier is not solved by a shallow search (tier 4 needs to look further than tier 2)', () => {
  let easyAtD2 = 0, hardAtD2 = 0;
  BANK.list.forEach((p, i) => { if (p.k !== 'w') return; const sc = AI.scoreMoves(E.fromFen(p.f), 2, {}); const ok2 = E.uci(sc[0].move) === p.s[0] && sc[0].score - sc[1].score >= 150; if (i < 48) easyAtD2 += ok2 ? 1 : 0; else hardAtD2 += ok2 ? 1 : 0; });
  ok(easyAtD2 >= 20, 'tier 2: ' + easyAtD2 + '/24 are found at depth 2'); ok(hardAtD2 <= easyAtD2 - 6, 'tier 4 is harder: ' + hardAtD2 + ' vs ' + easyAtD2);
});
test('dailySet: five puzzles, one from each tier, the same for the same seed, different across days; every index is in range', () => {
  const a = AI.dailySet(123456, BANK), b = AI.dailySet(123456, BANK); eq(JSON.stringify(a), JSON.stringify(b)); eq(a.length, 5);
  a.forEach((idx, t) => { ok(idx >= t * 24 && idx < (t + 1) * 24, 'tier ' + t + ' index ' + idx); });
  const days = new Set(); for (let d = 0; d < 60; d++) days.add(JSON.stringify(AI.dailySet(1000 + d * 7919, BANK))); ok(days.size > 50, 'different sets over 60 days: ' + days.size);
  eq(AI.dailySet(1, { list: [] }).length, 0);
});
test('puzzleOk / puzzleReply follow a mate-in-2 puzzle through: a wrong first move is refused, the right one is answered, the finishing move is accepted (also any other mating move)', () => {
  const p = BANK.list.find(x => x.k === 'm2'); const g = new E.Game(p.f), lg = g.legal();
  const wrong = lg.find(m => E.uci(m) !== p.s[0]); ok(!AI.puzzleOk(p, g.pos, wrong, 0), 'a wrong move');
  const right = lg.find(m => E.uci(m) === p.s[0]); ok(AI.puzzleOk(p, g.pos, right, 0));
  const reply = AI.puzzleReply(p, g.pos, right, 0); eq(E.uci(reply), p.s[1], 'the stored best defence');
  g.play(right); g.play(reply);
  for (const m of g.legal()) { const mates = (g.pos.make(m), g.pos.inCheck() && !E.hasLegal(g.pos)); g.pos.unmake(); eq(AI.puzzleOk(p, g.pos, m, 1), mates, 'only mating moves are accepted at step 1: ' + E.uci(m)); }
  const q = BANK.list.find(x => x.k === 'm1'), g1 = new E.Game(q.f); eq(AI.puzzleReply(q, g1.pos, g1.legal().find(m => E.uci(m) === q.s[0]), 0), 0, 'mate in 1: nothing to answer');
  const w = BANK.list.find(x => x.k === 'w'), gw = new E.Game(w.f); ok(AI.puzzleOk(w, gw.pos, gw.legal().find(m => E.uci(m) === w.s[0]), 0)); ok(!AI.puzzleOk(w, gw.pos, gw.legal().find(m => E.uci(m) !== w.s[0]), 0));
});
test('the explanation of a puzzle answer gives at least one reason (so the page can say why)', () => {
  BANK.list.filter(p => p.k === 'w').forEach((p, i) => { const g = new E.Game(p.f), m = g.legal().find(x => E.uci(x) === p.s[0]), rs = AI.explainMove(g.pos, m, null); ok(rs.length >= 1 && rs.every(r => typeof r.k === 'string'), 'reasons for ' + i); });
});

run();
