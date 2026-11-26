// wordwolf/engine.js の単体テスト：配る（同じ種は同じ・ウルフ1〜2人・知っている/知らない）・投票（同数→決選→にげきり・2人に投票）・ウルフの逆転・点数・CPU のヒント（性格・具体さ）とうたがい・記録とランキング。
// 実行：node tools/tests/unit/wordwolf-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'wordwolf/engine.js'));
const W = require(path.join(ROOT, 'wordwolf/words.js'));

test('deal: 3..8 players, 1 wolf (2 only with 5+), the wolf gets the other word of the same pair, everyone else the same word', () => {
  for (let n = 3; n <= 8; n++) for (let s = 0; s < 40; s++) {
    const S = E.newGame({ seed: 's' + s + n, n, humans: n }); eq(S.players.length, n); eq(S.players.filter(p => p.wolf).length, 1); eq(S.k, 1);
    const maj = E.majorityWord(S), wf = E.wolfWord(S); ok(maj.ja !== wf.ja);
    S.players.forEach((p, i) => eq(E.wordOf(S, i).ja, p.wolf ? wf.ja : maj.ja));
    eq(S.order.slice().sort((a, b) => a - b).join(), Array.from({ length: n }, (_, i) => i).join());
    const T = E.newGame({ seed: 'w' + s + n, n, humans: n, wolves: 2 }); eq(T.k, n >= 5 ? 2 : 1); eq(T.players.filter(p => p.wolf).length, T.k); eq(new Set(T.wolves).size, T.k);
  }
  eq(E.newGame({ seed: 1, n: 2 }).n, 3); eq(E.newGame({ seed: 1, n: 99 }).n, 8);
});
test('wolf knows: only then does the wolf know (and only the wolf)', () => {
  const S = E.newGame({ seed: 4, n: 5, humans: 5, wolfKnows: true }), T = E.newGame({ seed: 4, n: 5, humans: 5 });
  S.players.forEach((p, i) => eq(E.knowsWolf(S, i), p.wolf)); T.players.forEach((p, i) => eq(E.knowsWolf(T, i), false));
});
test('determinism: the same seed gives the same deal, the same CPU hints and the same CPU votes', () => {
  const run1 = seed => { const S = E.newGame({ seed, n: 6, humans: 1, wolves: 2 }); const out = [E.pairOf(S).id, S.wolves.join(), S.maj, S.order.join()]; S.order.forEach(p => { if (p) { const t = E.cpuHintTag(S, p, 0); S.hints.push({ p, tag: t, r: 0 }); out.push(t); } }); for (let p = 1; p < 6; p++) out.push(E.cpuVote(S, p, null, 2).join()); return out.join('|'); };
  eq(run1('abc'), run1('abc')); ok(run1('abc') !== run1('abd') || run1('abc') !== run1('xyz'));
});
test('the deal respects difficulty tier, categories and avoids recent pairs', () => {
  for (const lv of [1, 2, 3]) for (let s = 0; s < 30; s++) eq(E.pairOf(E.newGame({ seed: s, n: 4, lv })).lv, lv);
  for (let s = 0; s < 30; s++) ok([2, 5].includes(E.pairOf(E.newGame({ seed: s, n: 4, cats: [2, 5] })).cat));
  const ids = E.pairsOf(W).map(p => p.id); const recent = ids.slice(0, ids.length - 1);
  eq(E.pairOf(E.newGame({ seed: 3, n: 4, recent })).id, ids[ids.length - 1]);
  const seen = new Set(); for (let s = 0; s < 400; s++) seen.add(E.pairOf(E.newGame({ seed: s, n: 4 })).id); ok(seen.size > 150, 'variety ' + seen.size);
});
test('vote counting: the most votes is caught; a tie starts a runoff among the tied; a second tie lets the wolf escape', () => {
  deep(E.tally([1, 0, 0, 2], 4), [2, 1, 1, 0]);
  const r1 = E.resolveVote([2, 2, 0, 1], 4); eq(r1.kind, 'out'); eq(r1.target, 2);
  const r2 = E.resolveVote([1, 0, 3, 2], 4); eq(r2.kind, 'tie'); eq(r2.tied.length, 4);
  const S = E.newGame({ seed: 5, n: 4, humans: 4 });
  let a = E.applyVotes(S, [1, 0, 3, 2]); eq(a.next, 'revote'); deep(S.tied, [0, 1, 2, 3]); eq(S.revote, 1);
  a = E.applyVotes(S, [1, 0, 3, 2]); eq(a.next, 'escaped'); eq(S.executed, -1); deep(S.caught, []);
  const T = E.newGame({ seed: 5, n: 5, humans: 5 }); a = E.applyVotes(T, [1, 0, 1, 0, 3]); eq(a.next, 'revote'); deep(T.tied, [0, 1]); deep(E.ballotRule(T), { slots: 1, cands: [0, 1] });
  a = E.applyVotes(T, [1, 0, 1, 1, 0]); eq(a.next, 'caught'); eq(T.executed, 1);
  const U = E.newGame({ seed: 9, n: 3, humans: 3 }); a = E.applyVotes(U, [1, 1, 1]); eq(a.next, 'caught'); eq(a.target, 1);
  eq(E.tally([5, -1, 0], 3).join(), '1,0,0', 'out-of-range votes are ignored'); eq(E.tally([0], 3).join(), '0,0,0', 'no self vote');
});
test('two wolves: each voter names two players; the top two are caught; boundary ties go to a runoff for the remaining slot', () => {
  const S = E.newGame({ seed: 21, n: 6, humans: 6, wolves: 2 }); eq(S.k, 2); deep(E.ballotRule(S), { slots: 2, cands: null });
  let a = E.applyVotes(S, [[1, 2], [0, 2], [0, 1], [0, 1], [0, 1], [0, 2]]); eq(a.next, 'caught'); deep(a.caught, [0, 1]);
  const T = E.newGame({ seed: 22, n: 6, humans: 6, wolves: 2 });
  a = E.applyVotes(T, [[1, 2], [0, 2], [0, 3], [0, 2], [0, 1], [0, 1]]);   // 0:5 votes, 1:3, 2:3, 3:1 → 0 sure, 1 vs 2 for the last slot
  eq(a.next, 'revote'); deep(T.sure, [0]); deep(T.tied, [1, 2]); eq(T.slots, 1); deep(E.ballotRule(T), { slots: 1, cands: [1, 2] });
  a = E.applyVotes(T, [[1], [2], [1], [1], [1], [2]]); eq(a.next, 'caught'); eq(T.caught.length, 2); ok(T.caught.includes(0));
  const U = E.newGame({ seed: 22, n: 6, humans: 6, wolves: 2 }); E.applyVotes(U, [[1, 2], [0, 2], [0, 3], [0, 2], [0, 1], [0, 1]]);
  a = E.applyVotes(U, [[1], [2], [1], [1], [2], [2]]); eq(a.next, 'caught'); eq(U.caught.length, 1, 'tie again: the free slot stays empty');
});
test('scoring: village win (+2 correct voters, +1 others), counter-win, wrong person, double tie, two wolves (both / one)', () => {
  const mk = () => E.newGame({ seed: 11, n: 5, humans: 5 });
  let S = mk(), w = S.wolf, o = (w + 1) % 5; S.caught = [w]; S.voteLog = [{ votes: S.players.map((_, i) => (i === w ? [o] : (i % 2 ? [w] : [o]))) }];
  let r = E.finish(S, false); eq(r.winner, 'village'); eq(r.how, 'caught'); eq(r.pts[w], 0); S.players.forEach((_, i) => { if (i !== w) eq(r.pts[i], i % 2 ? 2 : 1); });
  S = mk(); w = S.wolf; S.caught = [w]; S.voteLog = [{ votes: S.players.map((_, i) => (i === w ? [(w + 1) % 5] : [w])) }]; r = E.finish(S, true); eq(r.winner, 'wolf'); eq(r.how, 'counter'); eq(r.pts[w], 2); S.players.forEach((_, i) => { if (i !== w) eq(r.pts[i], 1); });
  S = mk(); w = S.wolf; S.caught = [(w + 2) % 5]; S.voteLog = [{ votes: [] }]; r = E.finish(S, false); eq(r.winner, 'wolf'); eq(r.how, 'wrong'); eq(r.pts[w], 3); eq(r.pts.reduce((a, b) => a + b, 0), 3);
  S = mk(); S.caught = []; S.voteLog = []; S.lastVotes = []; r = E.finish(S, false); eq(r.how, 'tie'); eq(r.winner, 'wolf'); eq(r.pts[S.wolf], 3); ok(S.over);
  const T = E.newGame({ seed: 12, n: 6, humans: 6, wolves: 2 }), [a, b] = T.wolves;
  T.caught = [a, b]; T.voteLog = [{ votes: T.players.map(() => [a, (a + 1) % 6 === b ? (b + 1) % 6 : (a + 1) % 6]) }]; r = E.finish(T, false); eq(r.winner, 'village'); eq(r.pts[a], 0);
  const U = E.newGame({ seed: 12, n: 6, humans: 6, wolves: 2 }); U.caught = [U.wolves[0], 0 === U.wolves[0] || 0 === U.wolves[1] ? 5 : 0]; U.voteLog = [{ votes: [] }]; r = E.finish(U, false); ok(['partial', 'wrong'].includes(r.how)); eq(r.winner, 'wolf');
  if (r.how === 'partial') { eq(r.pts[U.wolves[0]], 1); eq(r.pts[U.wolves[1]], 3); }
});
test('wolf counter-chance: 6 options including the real majority word exactly once, never the wolf word, no word containing another', () => {
  for (let s = 0; s < 80; s++) {
    const S = E.newGame({ seed: 'g' + s, n: 4 }), o = E.guessOptions(S); eq(o.length, 6); eq(o.filter(x => x.ok).length, 1); eq(o.find(x => x.ok).ja, E.majorityWord(S).ja);
    ok(!o.some(x => x.ja === E.wolfWord(S).ja)); eq(new Set(o.map(x => x.ja)).size, 6);
    deep(E.guessOptions(S), o);
  }
});
test('CPU hints: from the CPU\'s own word (≥15 candidates), no repeats, real sentences; specific hints grow in later rounds; personalities differ', () => {
  for (let s = 0; s < 60; s++) {
    const S = E.newGame({ seed: 'h' + s, n: 5, humans: 1 });
    for (let r = 0; r < 3; r++) for (const p of S.order) { if (p === 0) continue; const t = E.cpuHintTag(S, p, r); ok(E.wordOf(S, p).all.includes(t), 'hint tag belongs to the word'); ok(!E.hintsBy(S, p).some(h => h.tag === t), 'no repeat'); S.hints.push({ p, tag: t, r }); ok(E.hintText(t, 'ja', W).length > 4 && E.hintText(t, 'en', W).length > 4); }
  }
  let g0 = 0, g2 = 0, n0 = 0, n2 = 0;
  for (let s = 0; s < 300; s++) { const S = E.newGame({ seed: 'sp' + s, n: 5, humans: 1 }); for (const p of S.order) { if (p === 0) continue; const w = E.wordOf(S, p), gen = new Set(w.g); [0, 2].forEach(r => { const t = E.cpuHintTag(S, p, r); if (r === 0) { n0++; if (!gen.has(t)) g0++; } else { n2++; if (!gen.has(t)) g2++; } }); } }
  ok(g2 / n2 > g0 / n0 + 0.05, 'more specific later: ' + g0 / n0 + ' -> ' + g2 / n2);
  const S = E.newGame({ seed: 'p', n: 6, humans: 1 }); eq(new Set(S.players.filter(p => p.cpu).map(p => p.persona)).size, 5, 'five CPUs have five different personalities');
  eq(E.personaOf(S, 1).id.length > 0, true); ok(E.cpuLead(S, 1, 0).ja !== undefined);
});
test('a CPU wolf that knows blends in with what the others said (and the CPU never reads other players\' words)', () => {
  let same = 0, tot = 0;
  for (let s = 0; s < 200; s++) {
    const S = E.newGame({ seed: 'k' + s, n: 5, humans: 1, wolfKnows: true }); if (S.wolf === 0) continue; const P = E.pairOf(S), cm = new Set(P.a.all.filter(t => P.b.all.includes(t)));
    S.players.forEach((p, i) => { if (i && !p.wolf) { const t = E.cpuHintTag(S, i, 0); S.hints.push({ p: i, tag: t, r: 0 }); } });
    const t = E.cpuHintTag(S, S.wolf, 0); tot++; if (cm.has(t)) same++;
  }
  ok(same / tot > 0.55, 'wolf mostly says shared hints: ' + same / tot);
});
test('CPU suspicion finds the wolf clearly better than chance (more so when sharper), and a wolf that mimics is harder to find', () => {
  const rate = skill => {
    let hit = 0, tot = 0;
    for (let s = 0; s < 400; s++) {
      const S = E.newGame({ seed: 'v' + skill + s, n: 5, humans: 1, skill, lv: 0 });
      for (let r = 0; r < 2; r++) for (const p of S.order) { if (p === 0) { const w = E.hintChoices(S, 0); S.hints.push({ p, tag: w[(s + r) % w.length], r }); } else S.hints.push({ p, tag: E.cpuHintTag(S, p, r), r }); }
      for (let p = 1; p < 5; p++) { if (S.players[p].wolf) continue; tot++; if (E.cpuVote(S, p)[0] === S.wolf) hit++; }
    }
    return hit / tot;
  };
  const a = rate(1), b = rate(2), c = rate(3); ok(a > 0.22, 'easy ' + a); ok(c > a + 0.03, 'sharper is better ' + a + ' ' + c); ok(c > 0.33 && c < 0.97, 'sharp ' + c + ' (beatable and not hopeless)'); void b;
  let hit = 0, tot = 0; for (let s = 0; s < 300; s++) {
    const S = E.newGame({ seed: 'm' + s, n: 5, humans: 1, skill: 3 }), P = E.pairOf(S), sb = new Set(P[S.maj].all), shared = E.wordOf(S, S.wolf).all.filter(t => sb.has(t));
    for (let r = 0; r < 2; r++) for (const p of S.order) { if (p === S.wolf) S.hints.push({ p, tag: shared[r % shared.length], r }); else if (p !== 0) S.hints.push({ p, tag: E.cpuHintTag(S, p, r), r }); }
    for (let p = 1; p < 5; p++) if (!S.players[p].wolf) { tot++; if (E.cpuVote(S, p)[0] === S.wolf) hit++; }
  }
  ok(hit / tot < c - 0.04, 'a mimicking wolf is harder: ' + (hit / tot) + ' vs ' + c);
});
test('CPU wolf counter-guess: better than a blind guess of 1/6 after hearing the village', () => {
  let ok1 = 0, n = 0; for (let s = 0; s < 400; s++) {
    const S = E.newGame({ seed: 'c' + s, n: 5, humans: 1 }); for (let r = 0; r < 2; r++) for (const p of S.order) { if (p === 0) continue; S.hints.push({ p, tag: E.cpuHintTag(S, p, r), r }); }
    const o = E.guessOptions(S), gi = E.cpuGuess(S); n++; if (o[gi].ok) ok1++;
  } ok(ok1 / n > 0.3, 'counter rate ' + ok1 / n); ok(ok1 / n < 0.95);
});
test('a whole CPU-only game runs to a result for every size and option', () => {
  for (const n of [3, 4, 5, 6, 7, 8]) for (const wolves of [1, 2]) for (const knows of [false, true]) {
    const S = E.newGame({ seed: 'z' + n + wolves + knows, n, humans: 1, wolves, wolfKnows: knows, rounds: 2 });
    S.order.concat(S.order).forEach((p, i) => S.hints.push({ p, tag: E.cpuHintTag(S, p, Math.floor(i / n)), r: Math.floor(i / n) }));
    for (let g = 0; g < 3; g++) { const r = E.ballotRule(S), v = S.players.map((_, p) => E.cpuVote(S, p, r.cands, r.slots)); const res = E.applyVotes(S, v); if (res.next !== 'revote') break; }
    const all = E.allWolvesCaught(S); const o = E.finish(S, all ? E.guessOptions(S)[E.cpuGuess(S)].ok : false); ok(o.pts.every(x => x >= 0 && x <= 3)); ok(S.over);
  }
});
test('records and ranking value: only solo games count (plays + wins x2), capped at 500; local and online are tallied apart', () => {
  const st = E.newStats(); eq(E.rankValue({ stats: st }), 0);
  let S = E.newGame({ seed: 1, n: 4, humans: 1 }); S.caught = [S.wolf]; S.voteLog = [{ votes: [[S.wolf], [0], [0], [0]] }]; E.finish(S, false); E.record(st, S, S.wolf === 0 ? 1 : 0);
  eq(st.games, 1); eq(st.soloGames, 1);
  S = E.newGame({ seed: 2, n: 4, humans: 4 }); S.caught = []; S.voteLog = []; E.finish(S, false); E.record(st, S, -1); eq(st.games, 2); eq(st.local, 1); eq(st.soloGames, 1);
  eq(E.rankValue({ stats: { games: 400, soloGames: 200, soloWins: 400 } }), 500); eq(E.rankValue(null), 0); eq(E.rankValue({ stats: { games: 30, soloGames: 3, soloWins: 2 } }), 7);
  const t = E.newStats(); S = E.newGame({ seed: 9, n: 8, humans: 8, wolves: 2, wolfKnows: true }); S.caught = [S.wolves[0]]; S.voteLog = []; E.finish(S, false); E.record(t, S, -1); eq(t.big, 1); eq(t.two, 1); eq(t.knows, 1);
  const u = E.newStats(); E.record(u, S, -1, { won: true, hints: 2 }); eq(u.onl, 1); eq(u.onw, 1); eq(u.local, 0);
});
run('wordwolf-engine');
