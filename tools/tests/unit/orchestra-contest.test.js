// orchestra/contest.js（コンクールモード・他団体との勝負）の単体テスト：
// 曲の表が index.json・楽譜と合っている・きびしい採点（マエストロよりきびしい）・4つの点（拍・テンポ／強弱／入り／表現）が上手さの順に並ぶ・
// 好みのちがう5人の審査員と講評（すべての文に英語がある）・CPU の団体が種つきで決まる（同じ曲なら同じ）・順位表（金/銀/銅・足切り・次へ進める・部門賞）・
// 保存の読み書き・勝負のアダプター（RTDB のルールの形に収まる・手の検査・棄権・CPU 席・ホストがいなくなったときの順位）・配線（sw.js・ページ・ルール）。
// 実行：node tools/tests/unit/orchestra-contest.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'orchestra/engine.js'));
const C = require(path.join(ROOT, 'orchestra/contest.js'));

const rd = f => fs.readFileSync(path.join(ROOT, f), 'utf8');
const INDEX = JSON.parse(rd('orchestra/scores/index.json'));
const loadScore = id => new E.Score(JSON.parse(rd('orchestra/scores/' + id + '.json')));
const json = v => JSON.parse(JSON.stringify(v));

// ---- 人の指揮者をまねる（headless）：拍のゆれ・強弱の追いかけ・入りの出し方をパラメーターで
function play(id, o, round) {
  o = o || {}; const sc = loadScore(id), R = C.ROUND_BY[round || 'q'], ses = new E.Session({ score: sc, diff: C.diffFor(round || 'q'), sink: {} });
  const r = C.rng(o.seed || 7), g = () => C.gauss(r); let t = 1, drift = 0; const times = [t];
  for (let k = 1; k < sc.nBeats + 6; k++) { const gb = sc.bpmAt(Math.min(sc.nBeats - 1, Math.max(0, k - 1))) * (o.tempo || 1); drift = 0.9 * drift + (o.drift || 0) * g(); t += 60 / gb * (1 + drift + (o.jitter || 0) * g()); times.push(t); }
  let i = 0, lvl = 0.5; const hist = new Array(sc.nBeats).fill(null), cued = new Set();
  for (let now = 0; now < times[times.length - 1] + 6; now += 0.025) {
    while (i < times.length && times[i] <= now) { const pos = ses.clock.running ? ses.clock.posAt(now) : 0; lvl += (sc.dynAt(pos + 0.5) - lvl) * (o.follow || 0.8); ses.ictus(times[i], { level: Math.max(0.04, Math.min(1, lvl + (o.lnoise || 0) * g() + (o.lbias || 0))) }); i++; }
    ses.upcoming(now, 3).forEach(u => { if (u.done || cued.has(u.i)) return; if (u.rel < 1.0 + (o.cueJit || 0) * g() && u.rel > -0.5) { cued.add(u.i); if (r() < (o.cueP == null ? 1 : o.cueP)) ses.cue(u.secs[0], now); } });
    ses.tick(now); if (ses.state === 'playing') { const b = Math.floor(ses.clock.posAt(now)); if (b >= 0 && b < hist.length) hist[b] = ses.level; } if (ses.state === 'ended') break;
  }
  return { ses, perf: C.analyse(C.extract(ses.scorer, { hist, pauses: o.pauses || 0 }), { tight: R.tight }), ended: ses.state === 'ended' };
}
const PRO = { jitter: 0.012, drift: 0.004, lnoise: 0.03, follow: 0.85, cueJit: 0.3 }, GOOD = { jitter: 0.025, drift: 0.008, lnoise: 0.06, follow: 0.7, cueJit: 0.5, cueP: 0.95 };
const OKAY = { jitter: 0.05, drift: 0.015, lnoise: 0.09, follow: 0.55, cueJit: 0.7, cueP: 0.85, lbias: 0.03 }, ROUGH = { jitter: 0.09, drift: 0.03, lnoise: 0.14, follow: 0.4, cueJit: 1.0, cueP: 0.6, lbias: 0.06 };

test('the curated pieces: every number in the table matches scores/index.json and the score itself; the rounds only use them', () => {
  for (const id of C.PIECE_IDS) {
    const m = INDEX.pieces.find(p => p.id === id), P = C.PIECES[id]; ok(m, id + ' is in the index');
    eq(P.lv, m.level, id + ' level'); eq(P.min, m.minutes, id + ' minutes'); eq(P.era, m.era, id + ' era'); eq(P.cues, loadScore(id).cues.length, id + ' cues');
    ok(!m.light && !m.sketch && !m.simplified && !m.hold, id + ' is a full piece');
  }
  C.ROUNDS.forEach(R => { ok(C.PIECES[R.compulsory], R.id + ' compulsory'); ok(R.free.length >= 4 && R.free.every(x => C.PIECES[x]), R.id + ' free choices'); ok(C.PIECES[R.compulsory].cues >= 9, R.id + ' the compulsory piece has real cues'); R.rivals.forEach(x => ok(C.ENS_BY[x], x)); });
  ok(C.ROUNDS[0].free.every(x => C.PIECES[x].lv <= 2) && C.ROUNDS[2].free.every(x => C.PIECES[x].lv >= 3), 'the free pieces get harder with the round');
  ok(C.PIECES[C.ROUNDS[0].compulsory].lv <= C.PIECES[C.ROUNDS[1].compulsory].lv && C.PIECES[C.ROUNDS[1].compulsory].lv <= C.PIECES[C.ROUNDS[2].compulsory].lv, 'compulsory pieces get harder');
  eq(C.ROUNDS.map(r => r.id).join(), 'q,f,n');
  ok(C.PIECE_IDS.length <= 99 && C.DUEL_PIECES.length === C.PIECE_IDS.length, 'the duel list fits one number');
});

test('seeded random numbers are deterministic and spread; names and strings are well formed', () => {
  eq(C.hash32('a'), C.hash32('a')); ok(C.hash32('a') !== C.hash32('b'));
  const a = C.rng(5), b = C.rng(5); for (let i = 0; i < 20; i++) eq(a(), b());
  const r = C.rng(9), xs = []; for (let i = 0; i < 4000; i++) xs.push(C.gauss(r)); const m = xs.reduce((p, q) => p + q, 0) / xs.length, sd = Math.sqrt(xs.reduce((p, q) => p + (q - m) * (q - m), 0) / xs.length);
  ok(Math.abs(m) < 0.06 && sd > 0.85 && sd < 1.15, 'gauss mean ' + m + ' sd ' + sd);
  const ids = new Set(); C.ENSEMBLES.forEach(e => { ok(!ids.has(e.id)); ids.add(e.id); ok(e.name.ja && e.name.en && e.note.ja && e.note.en, e.id); ok(e.skill >= 40 && e.skill <= 95); ok(Object.keys(e.pers).join() === 'beat,dyn,cue,expr'); });
  ok(C.ENSEMBLES.length >= 10, 'enough groups with names and personalities');
});

test('the contest difficulty is stricter than the strictest existing one, and rises from round to round', () => {
  const D = C.DIFF, M = E.DIFFS.maestro;
  ok(D.slack < M.slack && D.uncued < M.uncued && D.tol < M.tol && D.steady < M.steady && D.autoCue === false && D.assist === 0, 'tighter windows than maestro');
  ok(D.stars[1] > M.stars[1] && D.stars[2] > M.stars[2], 'higher star lines');
  const t = C.ROUNDS.map(r => C.diffFor(r.id).tol); ok(t[0] > t[1] && t[1] > t[2] && t[2] < M.tol, 'the dynamics window narrows round by round: ' + t);
  ok(C.ROUNDS[0].harsh < C.ROUNDS[1].harsh && C.ROUNDS[1].harsh < C.ROUNDS[2].harsh && C.ROUNDS[0].tight < C.ROUNDS[1].tight && C.ROUNDS[1].tight < C.ROUNDS[2].tight, 'the judging tightens');
  ok(C.ROUNDS[0].medal[0] < C.ROUNDS[2].medal[0] && C.ROUNDS[0].cut < C.ROUNDS[1].cut, 'the cut-off and the gold line rise');
  const ses = new E.Session({ score: loadScore('midsummer'), diff: C.diffFor('f'), sink: {} }); eq(ses.diff.id, 'contest'); near(ses.entranceGain(ses.score.secIndex[ses.score.cues[1].secs[0]], ses.score.cues[1].b), 0.08);
});
const near = (a, b) => ok(Math.abs(a - b) < 1e-9, a + ' vs ' + b);

test('the four sub-scores come from the real engine: better conducting scores higher in all of them, the same input gives the same numbers', () => {
  const lv = [PRO, GOOD, OKAY, ROUGH].map(o => play('beethoven7', o, 'f')); lv.forEach(x => ok(x.ended, 'ended'));
  for (const k of C.CATS) for (let i = 1; i < lv.length; i++) ok(lv[i - 1].perf[k] >= lv[i].perf[k] - 1, k + ' goes down with skill: ' + lv.map(x => x.perf[k]));
  ok(lv[0].perf.beat - lv[3].perf.beat >= 20 && lv[0].perf.dyn - lv[3].perf.dyn >= 20 && lv[0].perf.cue - lv[3].perf.cue >= 15 && lv[0].perf.expr - lv[3].perf.expr >= 8, 'a wide spread');
  eq(JSON.stringify(play('beethoven7', GOOD, 'f').perf), JSON.stringify(lv[1].perf), 'deterministic');
  for (const x of lv) for (const k of ['beat', 'dyn', 'cue', 'expr', 'stab', 'adh', 'cov', 'shape', 'coh']) ok(x.perf[k] >= 0 && x.perf[k] <= 100, k);
  // 工程ごとの理由
  const jit = play('midsummer', { jitter: 0.1, drift: 0.03, follow: 0.8, lnoise: 0.03 }, 'q'), steady = play('midsummer', { jitter: 0.01, follow: 0.8, lnoise: 0.03 }, 'q');
  ok(steady.perf.beat > jit.perf.beat + 25 && steady.perf.stab > jit.perf.stab + 30, 'ragged beats lose beat and tempo points: ' + steady.perf.beat + ' vs ' + jit.perf.beat);
  const flat = play('midsummer', { jitter: 0.01, follow: 0.001, lnoise: 0, lbias: -0.05 }, 'q'); ok(flat.perf.dyn < steady.perf.dyn - 25 && flat.perf.expr < steady.perf.expr - 8, 'flat dynamics lose dynamics and expression: ' + flat.perf.dyn + '/' + flat.perf.expr);
  const nocue = play('midsummer', { jitter: 0.01, follow: 0.8, lnoise: 0.03, cueP: 0 }, 'q'); ok(nocue.perf.cue < 5 && nocue.perf.missed === 9, 'no cues: every entrance missed ' + nocue.perf.missed); ok(steady.perf.cue > 85, 'cues given: ' + steady.perf.cue);
  const tooQuick = play('midsummer', { jitter: 0.01, tempo: 1.35, follow: 0.8 }, 'q'); ok(tooQuick.perf.adh < steady.perf.adh - 25, 'a tempo far from the marked one loses points: ' + tooQuick.perf.adh);
  const stops = play('midsummer', { jitter: 0.01, follow: 0.8, lnoise: 0.03, pauses: 3 }, 'q'); ok(stops.perf.expr < steady.perf.expr - 20 && stops.perf.pauses === 3, 'pausing costs continuity');
  // 同じ人でも、上の部ほどきびしい
  const q = play('beethoven7', GOOD, 'q'), n = play('beethoven7', GOOD, 'n'); ok(q.perf.beat > n.perf.beat, 'the tempo window is tighter in the nationals: ' + q.perf.beat + ' vs ' + n.perf.beat);
  // マエストロの採点より、同じ演奏でも点が低い
  const m = play('beethoven7', OKAY, 'f'); ok(C.judgePiece(m.perf, 'beethoven7', 'f').total <= m.ses.result().total + 6, 'not more generous than the engine: ' + C.judgePiece(m.perf, 'beethoven7', 'f').total + ' vs ' + m.ses.result().total);
});

test('judges: five different tastes, every judge deterministic, the panel total drops the highest and the lowest', () => {
  eq(C.JUDGES.length, 5); eq(new Set(C.JUDGES.map(j => j.id)).size, 5);
  C.JUDGES.forEach(j => { near(j.w.beat + j.w.dyn + j.w.cue + j.w.expr, 1); ok(j.name.ja && j.name.en && j.role.ja && j.role.en); });
  const mk = o => Object.assign({ beat: 80, dyn: 80, cue: 80, expr: 80, stab: 80, adh: 80, cov: 100, missed: 0, perfect: 8, late: 0, pauses: 0, ratio: 100, bias: 0, shape: 80, coh: 80 }, o);
  const top = (perf, pid) => C.judgePiece(perf, pid || 'beethoven7', 'f'), by = (j, perf, pid) => top(perf, pid).judges.find(x => x.id === j).score;
  ok(by('kirishima', mk({ beat: 95, stab: 95, expr: 60 })) > by('hanazono', mk({ beat: 95, stab: 95, expr: 60 })), 'the pulse judge likes steady beats more than the song judge does');
  ok(by('hanazono', mk({ expr: 95, beat: 65, stab: 65 })) > by('kirishima', mk({ expr: 95, beat: 65, stab: 65 })), 'the song judge likes expression');
  ok(by('shiraishi', mk({ cue: 95, missed: 0 })) - by('shiraishi', mk({ cue: 60, missed: 5 })) > by('kirishima', mk({ cue: 95 })) - by('kirishima', mk({ cue: 60, missed: 5 })), 'the ensemble judge cares most about entrances');
  ok(by('asakura', mk({ bias: 0.2 })) < by('asakura', mk({ bias: 0 })) - 2, 'the classical judge dislikes a loud performance');
  ok(by('asakura', mk(), 'beethoven7') > by('asakura', mk(), 'midsummer') + 1.5, 'and likes classical pieces (era bonus)'); ok(by('hanazono', mk(), 'rossini') > by('hanazono', mk(), 'egmont') + 1.5, 'the song judge likes romantic pieces');
  const a = top(mk({ beat: 70, dyn: 90, expr: 75 })); const sorted = a.judges.map(x => x.score).sort((x, y) => x - y); near(a.total, Math.round((sorted[1] + sorted[2] + sorted[3]) / 3 * 10) / 10);
  ok(new Set(a.judges.map(x => x.score)).size >= 4, 'the judges disagree: ' + a.judges.map(x => x.score));
  ok(new Set(C.JUDGES.map(j => by(j.id, mk({ beat: 60, dyn: 95, cue: 70, expr: 85 })))).size === 5, 'different scores for an uneven performance');
  // 入りのない曲：入りの重みは他へ。入りの点は高くも低くも効かない
  eq(by('shiraishi', mk({ cue: 0 }), 'nachtmusik'), by('shiraishi', mk({ cue: 100 }), 'nachtmusik'), 'a piece without entrances ignores the entrance score'); eq(top(mk(), 'nachtmusik').cats.cue, null);
  eq(top(null).total, 0, 'an absent performance scores zero'); eq(C.comment('aoi', null, 'midsummer', 'q')[0].kind, 'note');
  ok(by('aoi', mk()) > by('kirishima', mk()), 'the overall judge is the gentlest, the pulse judge the strictest'); ok(C.judgePiece(mk(), 'beethoven7', 'n').total < C.judgePiece(mk(), 'beethoven7', 'q').total - 2.5, 'later rounds deduct more');
});

test('comments are built from the numbers, differ by judge, and every sentence has an English version', () => {
  const mk = o => Object.assign({ beat: 80, dyn: 80, cue: 80, expr: 80, stab: 80, adh: 80, cov: 100, missed: 0, perfect: 8, late: 0, pauses: 0, ratio: 100, bias: 0, shape: 80, coh: 80 }, o);
  const used = new Set(), T = (s, v) => { used.add(s); return String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)); };
  const cases = [mk(), mk({ beat: 95, dyn: 95, cue: 95, expr: 95, stab: 95 }), mk({ beat: 40, dyn: 45, cue: 30, expr: 50, stab: 40, missed: 6, bias: 0.2 }), mk({ expr: 40, bias: -0.2, pauses: 2, missed: 2 }), mk({ expr: 90 })];
  const seen = new Set();
  for (const p of cases) for (const j of C.JUDGES) for (const pid of ['beethoven7', 'midsummer', 'nachtmusik', 'rossini']) {
    const ls = C.comment(j.id, p, pid, 'f', { T }); ok(ls.length >= 2 && ls.length <= 4, j.id + ' ' + ls.length); ls.forEach(l => { ok(['praise', 'note', 'info'].includes(l.kind)); ok(l.text.length > 10 && !/\{\w+\}/.test(l.text), l.text); seen.add(l.text); });
  }
  ok(seen.size >= 25, 'plenty of different sentences: ' + seen.size);
  const bad = [...used].filter(s => !(s in C.EN)); eq(bad.join(' | '), '', 'every Japanese sentence has an English one');
  const a = C.comment('kirishima', cases[2], 'beethoven7', 'f').map(x => x.text).join(), b = C.comment('hanazono', cases[2], 'beethoven7', 'f').map(x => x.text).join(); ok(a !== b, 'judges say different things about the same performance');
  ok(/40|30|50/.test(a), 'the numbers appear in the text: ' + a); eq(C.comment('kirishima', cases[2], 'beethoven7', 'f').map(x => x.text).join(), a, 'deterministic');
  ok(C.comment('shiraishi', cases[2], 'beethoven7', 'f').some(x => /6/.test(x.text)), 'the ensemble judge counts the 6 missed entrances');
  ok(C.comment('shiraishi', mk(), 'nachtmusik', 'q').some(x => /入りが少なく/.test(x.text)), 'and notes a piece without entrances');
});

test('CPU groups: the seeded model gives the same performance every time, different pieces and groups differ, skill orders the results, and the best group is beatable', () => {
  const e = C.ENS_BY.sakura, a = C.cpuPerf(e, 'beethoven7', 'f'), b = C.cpuPerf(e, 'beethoven7', 'f'); eq(JSON.stringify(a), JSON.stringify(b), 'same seed, same performance');
  ok(JSON.stringify(a) !== JSON.stringify(C.cpuPerf(e, 'egmont', 'f')) && JSON.stringify(a) !== JSON.stringify(C.cpuPerf(C.ENS_BY.minato, 'beethoven7', 'f')) && JSON.stringify(a) !== JSON.stringify(C.cpuPerf(e, 'beethoven7', 'n')));
  eq(C.cpuPerf(e, 'nachtmusik', 'q').cue, 0, 'no entrances in a piece without them'); eq(C.cpuPerf(e, 'nachtmusik', 'q').missed, 0);
  C.ENSEMBLES.forEach(x => C.PIECE_IDS.forEach(pid => { const p = C.cpuPerf(x, pid, 'f'); for (const k of C.CATS) ok(p[k] >= 0 && p[k] <= 100, x.id + ' ' + pid + ' ' + k); ok(C.validVec(C.perfToVec(p)), 'fits the wire'); }));
  const avg = x => C.PIECE_IDS.reduce((s, pid) => s + C.judgePiece(C.cpuPerf(x, pid, 'f'), pid, 'f').total, 0) / C.PIECE_IDS.length;
  const lo = avg(C.ENS_BY.hinata), mid = avg(C.ENS_BY.sakura), hi = avg(C.ENS_BY.akatsuki); ok(lo + 8 < mid && mid + 6 < hi, 'skill orders them: ' + [lo, mid, hi].map(Math.round));
  // 一番強い団体でも、うまい人なら勝てる。一番よわい団体は、まあまあの人に負ける
  const best = C.judgePiece(C.cpuPerf(C.ENS_BY.akatsuki, 'beethoven5', 'n'), 'beethoven5', 'n').total, pro = play('beethoven5', PRO, 'n'), good = play('beethoven5', GOOD, 'n'), okay = play('beethoven5', OKAY, 'n');
  ok(C.judgePiece(pro.perf, 'beethoven5', 'n').total > best + 3, 'an expert beats the best group: ' + C.judgePiece(pro.perf, 'beethoven5', 'n').total + ' vs ' + best);
  ok(C.judgePiece(good.perf, 'beethoven5', 'n').total > best - 8, 'a good conductor is in the running: ' + C.judgePiece(good.perf, 'beethoven5', 'n').total + ' vs ' + best);
  ok(C.judgePiece(okay.perf, 'beethoven5', 'n').total < best - 5, 'but not the best group in the nationals with a so-so run');
  const weak = C.judgePiece(C.cpuPerf(C.ENS_BY.hinata, 'midsummer', 'q'), 'midsummer', 'q').total; ok(C.judgePiece(play('midsummer', OKAY, 'q').perf, 'midsummer', 'q').total > weak + 10, 'a so-so conductor beats the weakest group in the qualifier: ' + weak);
});

test('the field: groups, ranking, medals by score, the cut-off and the places that move on, the part awards, and the free-piece bonus', () => {
  const ranks = { q: [], f: [], n: [] };
  C.ROUNDS.forEach(R => {
    const absent = C.field(R.id, { name: 'あなた', comp: null, freeId: R.free[0], free: null });
    eq(absent.n, R.rivals.length + 1); eq(absent.you.total, 0); eq(absent.you.rank, absent.n, 'an absent group is last'); ok(!absent.adv.ok);
    const rows = absent.rows; for (let i = 1; i < rows.length; i++) ok(rows[i - 1].total >= rows[i].total, 'sorted'); rows.forEach((r, i) => eq(r.rank, i + 1));
    rows.filter(r => r.cpu).forEach(r => { ok(R.free.includes(r.freeId), 'CPU free choice is from the list'); ok(r.total > 25 && r.total < 92, R.id + ' ' + r.id + ' ' + r.total); eq(r.medal, C.medalIndex(r.total, R)); ranks[R.id].push(r.total); });
    eq(JSON.stringify(C.field(R.id, { name: 'あなた', comp: null, freeId: R.free[0], free: null }).rows.map(r => r.id)), JSON.stringify(rows.map(r => r.id)), 'the same field every time');
    ok(absent.awards.length === 6 && absent.awards.every(a => a.win && absent.rows.some(r => r.id === a.win.id)), 'six part awards: compulsory, free, and the four categories');
  });
  const top = r => Math.max(...ranks[r]), low = r => Math.min(...ranks[r]);
  ok(top('q') < top('f') + 3 && top('f') < top('n'), 'stronger fields as the rounds go on: ' + [top('q'), top('f'), top('n')]); ok(low('q') < low('n'), 'weakest group of each round');
  ok(top('n') >= C.ROUNDS[2].medal[1] && top('n') < 92, 'the top group in the nationals earns a medal but is not unbeatable');
  // 人が出る：うまい人は予選で金・順位1位・次へ。そこそこの人は銅か銀で進む。下手だと足切り
  const run = (rid, o) => { const R = C.ROUND_BY[rid], c = play(R.compulsory, o, rid), f = play(R.free[1], o, rid); return C.field(rid, { name: 'あなた', comp: c.perf, freeId: R.free[1], free: f.perf }); };
  const g = run('q', GOOD); eq(g.you.rank, 1); eq(g.you.medal, 3); ok(g.adv.ok && g.adv.why === 'ok'); eq(g.you.cats.cue > 50, true);
  const k = run('q', OKAY); ok(k.you.medal >= 1 && k.you.rank <= 4 && k.adv.ok, 'a so-so run still moves on from the qualifier: rank ' + k.you.rank + ' total ' + k.you.total);
  const r = run('q', ROUGH); ok(!r.adv.ok || r.you.rank >= 4, 'a rough run is on the edge: ' + r.you.total + ' rank ' + r.you.rank);
  const bad = C.field('q', { name: 'あなた', comp: play('midsummer', { jitter: 0.2, drift: 0.05, follow: 0.1, lnoise: 0.2, cueP: 0.2 }, 'q').perf, freeId: 'finlandia', free: play('finlandia', { jitter: 0.2, drift: 0.05, follow: 0.1, lnoise: 0.2 }, 'q').perf });
  ok(bad.you.total < 58 && !bad.adv.ok && bad.adv.why === 'score', 'below the cut-off line: ' + bad.you.total + ' ' + bad.adv.why);
  const nat = run('n', PRO); eq(nat.round.id, 'n'); ok(nat.you.rank === 1 && nat.champion, 'an expert wins the nationals: ' + nat.you.total + ' rank ' + nat.you.rank); eq(nat.adv.why, 'last');
  const fin = run('f', GOOD); ok(fin.you.rank <= 2 && fin.adv.ok, 'a good conductor moves on from the semifinal: rank ' + fin.you.rank);
  // 順位でだめ：点は足りていても、上位に入れない
  const mk = t => ({ beat: t, dyn: t, cue: t, expr: t, stab: t, adh: t, cov: 100, missed: 0, perfect: 5, late: 0, pauses: 0, ratio: 100, bias: 0, shape: t, coh: t });
  const edge = C.field('f', { name: 'あなた', comp: mk(66), freeId: 'zauberflote', free: mk(66) }); ok(edge.you.total >= 60 && edge.you.total < 66, 'around the cut: ' + edge.you.total); ok(['rank', 'score'].includes(edge.adv.why) && !edge.adv.ok);
  // 自由曲の難度点：むずかしい曲に挑んで、しっかり弾けたときだけ
  ok(C.freeBonus(C.PIECES.fidelio, 80) > C.freeBonus(C.PIECES.finlandia, 80) && C.freeBonus(C.PIECES.fidelio, 50) === 0 && C.freeBonus(C.PIECES.finlandia, 90) === 0, 'bonus for hard pieces played well');
  const hard = C.field('n', { name: 'x', comp: mk(80), freeId: 'fidelio', free: mk(80) }), easy = C.field('n', { name: 'x', comp: mk(80), freeId: 'dvorak9-3', free: mk(80) }); ok(hard.you.total >= easy.you.total - 1.5, 'bonus is small');
  eq(C.medalIndex(84, C.ROUND_BY.n), 3); eq(C.medalIndex(83.9, C.ROUND_BY.n), 2); eq(C.medalIndex(74, C.ROUND_BY.n), 2); eq(C.medalIndex(64, C.ROUND_BY.n), 1); eq(C.medalIndex(63.9, C.ROUND_BY.n), 0); eq(C.MEDALS[3], '金賞');
  // 同点：人にはきびしい（CPU が上）
  const cpu = C.field('q', { name: 'x', comp: null, freeId: 'nachtmusik', free: null }).rows.find(x => x.cpu); ok(cpu);
});

test('the save: a clean read of anything, round records keep the bests and unlock the next round, duel records count wins and losses', () => {
  const d = C.defStore(); eq(JSON.stringify(C.readStore(null)), JSON.stringify(d)); eq(JSON.stringify(C.readStore('{bad')), JSON.stringify(d)); eq(JSON.stringify(C.readStore('[1]')), JSON.stringify(d));
  const dirty = C.readStore(JSON.stringify({ r: { q: { s: 999, m: 9, b: -5, n: 'x', c: 1 }, zz: { s: 5 } }, hist: [{ r: 'q', s: 70, m: 2, k: 2 }, { r: 'nope' }, 7], stats: { entries: -4, gold: '3', wins: 2.7 }, duel: { midsummer: { w: 2, l: 1, d: 0, b: 80 }, nope: {} }, set: { free: { q: 'finlandia', f: 'finlandia' }, rival: 'x', piece: 'egmont' } }));
  eq(dirty.r.q.s, 100); eq(dirty.r.q.m, 3); eq(dirty.r.q.b, 0); eq(dirty.r.q.n, 0); eq(dirty.r.q.c, 1); ok(!dirty.r.zz); eq(dirty.hist.length, 1); eq(dirty.stats.entries, 0); eq(dirty.stats.gold, 3); eq(dirty.stats.wins, 2);
  ok(dirty.duel.midsummer.w === 2 && !dirty.duel.nope); eq(dirty.set.free.q, 'finlandia'); ok(!dirty.set.free.f, 'a free piece from another round is dropped'); eq(dirty.set.rival, ''); eq(dirty.set.piece, 'egmont');
  eq(C.unlockedRounds(d).join(), 'q');
  const mkf = (rid, medal, rank, ok2) => ({ n: 8, you: { total: 60 + medal * 10, medal, rank, comp: { total: 61 }, free: { total: 59 }, freeId: 'nachtmusik' }, adv: { ok: ok2 }, champion: false });
  let r = C.recordRound(d, 'q', mkf('q', 2, 3, true), 100); ok(r.isBest && r.unlocked); let st = r.store; eq(st.r.q.m, 2); eq(st.r.q.b, 5); eq(st.r.q.n, 1); eq(st.r.q.c, 1); eq(st.stats.silver, 1); eq(st.stats.passed, 1); eq(C.unlockedRounds(st).join(), 'q,f'); eq(st.set.free.q, 'nachtmusik');
  r = C.recordRound(st, 'q', mkf('q', 1, 6, false), 101); ok(!r.isBest && !r.unlocked); st = r.store; eq(st.r.q.m, 2, 'the best medal stays'); eq(st.r.q.b, 5); eq(st.r.q.c, 1, 'once moved on, always unlocked'); eq(st.r.q.n, 2); eq(st.stats.bronze, 1); eq(st.stats.entries, 2);
  const nat = mkf('n', 3, 1, false); nat.champion = true; st = C.recordRound(st, 'n', nat, 102).store; eq(st.stats.cups, 1); eq(st.stats.grand, 1); eq(st.stats.gold, 1);
  for (let i = 0; i < 30; i++) st = C.recordRound(st, 'q', mkf('q', 0, 7, false), 200 + i).store; eq(st.hist.length, C.HIST_MAX); eq(st.hist[0].t, 229);
  eq(JSON.stringify(C.readStore(JSON.stringify(st))), JSON.stringify(st), 'writes and reads back the same');
  const v = C.verdict('midsummer', C.cpuPerf(C.ENS_BY.sakura, 'midsummer', 'd'), C.cpuPerf(C.ENS_BY.hinata, 'midsummer', 'd')); eq(v.win, 0);
  let s2 = C.recordDuel(C.defStore(), 'midsummer', v, 0).store; eq(s2.stats.wins, 1); eq(s2.duel.midsummer.w, 1); eq(s2.set.piece, 'midsummer'); ok(s2.duel.midsummer.b > 0);
  s2 = C.recordDuel(s2, 'midsummer', v, 1).store; eq(s2.stats.losses, 1); eq(s2.stats.duels, 2); eq(s2.duel.midsummer.l, 1);
  s2 = C.recordDuel(s2, 'midsummer', { a: v.a, b: v.b, win: -1 }, 0).store; eq(s2.stats.draws, 1);
  eq(JSON.stringify(C.readStore(JSON.stringify(s2))), JSON.stringify(s2));
});

// ---- 勝負のアダプター ----
const RULES = JSON.parse(rd('database.rules.json')).rules.tr.$game.rooms.$room;
const H = C.duel.host;
function pdFits(pd) {
  const bad = [], scalar = x => typeof x === 'boolean' || (typeof x === 'number' && x >= -1e6 && x <= 1e6) || (typeof x === 'string' && x.length <= 24);
  for (const [k, val] of Object.entries(pd)) {
    if (!/^[a-z]{1,4}$/.test(k)) bad.push('pd key ' + k);
    if (Array.isArray(val)) { if (val.length > 99) bad.push('long ' + k); val.forEach((x, i) => { if (!scalar(x)) bad.push(k + i); }); } else if (!scalar(val)) bad.push('value ' + k);
  }
  return bad;
}
const actFits = a => /^[a-z]{2,8}$/.test(a.t) && Object.keys(a).every(k => ['t', 'c', 'k', 'w', 'x', 'r'].includes(k)) && (a.c == null || (a.c >= -1 && a.c <= 255)) && (a.r == null || (Array.isArray(a.r) && a.r.length <= 16 && a.r.every(x => Number.isInteger(x) && x >= 0 && x <= 255)));
const goodPerf = pid => C.cpuPerf(C.ENS_BY.shirasagi, pid, 'd'), badPerf = pid => C.cpuPerf(C.ENS_BY.hinata, pid, 'd');

test('duel adapter: pick -> both conduct -> results are posted -> the verdict; odd or early or doubled moves are refused', () => {
  const st = H.create({ g: 1, n: 2, seed: 77, cp: 2, humans: [0, 1], first: 0 });
  eq(H.turn(st), 0, 'the host picks'); ok(!H.isOver(st)); eq(H.apply(st, 1, C.duel.pickWire(2)), null, 'the guest cannot pick'); eq(H.apply(st, 0, { t: 'pick', c: 99 }), null); eq(H.apply(st, 0, { t: 'pick', c: 1.5 }), null); eq(H.apply(st, 0, { t: 'pick' }), null);
  eq(H.apply(st, 0, C.duel.toWire(goodPerf('midsummer'))), null, 'no result before the piece is chosen');
  const idx = C.DUEL_PIECES.indexOf('midsummer'); let r = H.apply(st, 0, C.duel.pickWire(idx)); ok(r && r.ev[0].t === 'pk'); eq(H.turn(st), -1, 'no turn clock while the piece is played'); eq(H.apply(st, 0, C.duel.pickWire(idx)), null, 'picking twice');
  eq(H.pub(st).p, idx); eq(H.pub(st).ph, 1); ok(!('ra' in H.pub(st)) && !('rb' in H.pub(st)));
  const bad = C.duel.toWire(badPerf('midsummer')), good = C.duel.toWire(goodPerf('midsummer'));
  eq(H.apply(st, 1, { t: 'done', r: [1, 2, 3] }), null, 'short vectors'); eq(H.apply(st, 1, { t: 'done', r: good.r.map(x => x + 300) }), null, 'out of range'); eq(H.apply(st, 1, { t: 'done', r: good.r.map(x => x + 0.5) }), null, 'not integers'); eq(H.apply(st, 1, { t: 'done', r: [0].concat(good.r.slice(1)) }), null, 'status must say done');
  r = H.apply(st, 1, bad); ok(r && r.ev[0].t === 'dn' && r.ev[0].s === 1); eq(H.apply(st, 1, bad), null, 'one result per seat'); ok(!H.isOver(st)); ok('rb' in H.pub(st) && !('ra' in H.pub(st)));
  r = H.apply(st, 0, good); ok(r); ok(H.isOver(st)); eq(H.turn(st), -1); eq(H.apply(st, 0, good), null, 'after the end');
  const res = H.result(st); eq(res.w, 0); eq(res.r.join(), '1,2'); eq(H.fallback(H.pub(st)).w, 0); eq(JSON.stringify(H.fallback(json(H.pub(st)))), JSON.stringify(res));
  eq(JSON.stringify(H.de(H.ser(st))), JSON.stringify(st), 'saves and loads');
  eq(H.cpu(st, 0).t, 'pick'); eq(H.auto(st, 0).c, H.auto(st, 0).c); ok(H.auto(st, 0).c < C.DUEL_PIECES.length, 'a host who does not choose gets a seeded piece');
});

test('duel adapter: forfeits, quitting, a CPU seat that fills the room, and what happens when the host is gone', () => {
  const idx = C.DUEL_PIECES.indexOf('egmont'), mk = () => { const s = H.create({ g: 1, n: 2, seed: 5, cp: 2, humans: [0, 1], first: 0 }); H.apply(s, 0, C.duel.pickWire(idx)); return s; };
  let st = mk(); ok(H.apply(st, 0, C.duel.toWire(goodPerf('egmont')))); eq(H.apply(st, 1, C.duel.forfWire()), null, 'a guest cannot forfeit the host'); ok(H.apply(st, 0, C.duel.forfWire())); ok(H.isOver(st)); eq(H.result(st).w, 0, 'the one who played wins'); eq(H.pub(st).rb[0], 2, 'marked as a forfeit');
  st = mk(); ok(H.apply(st, 1, { t: 'quit' })); eq(H.apply(st, 1, { t: 'quit' }), null); ok(!H.isOver(st)); ok(H.apply(st, 0, C.duel.toWire(badPerf('egmont')))); ok(H.isOver(st)); eq(H.result(st).w, 0, 'the one who stayed wins even with a poor run');
  st = mk(); H.apply(st, 0, { t: 'quit' }); H.apply(st, 1, { t: 'quit' }); ok(H.isOver(st)); eq(H.result(st).w, -1, 'both quit: nobody wins'); eq(H.result(st).r.join(), '1,1');
  // the host is gone: only what is in pd
  st = mk(); H.apply(st, 1, C.duel.toWire(goodPerf('egmont'))); const pd = json(H.pub(st)); eq(H.fallback(pd).w, 1, 'the guest had posted a result, the host had not'); eq(H.fallback({ p: -1, ph: 0 }).w, -1); eq(H.fallback(null).w, -1);
  // a CPU seat is filled in when the piece is chosen
  const c = H.create({ g: 1, n: 2, seed: 9, cp: 2, humans: [0], first: 0 }); H.apply(c, 0, C.duel.pickWire(idx)); ok(c.res[1] && c.res[1].s === 1 && C.validVec(c.res[1].v), 'the CPU group has played'); eq(JSON.stringify(vecOf(H.pub(c).rb)), JSON.stringify(C.vecToPerf(C.perfToVec(C.cpuPerf(C.ENS_BY[C.DUEL_CPU[1]], 'egmont', 'd')))), 'it is that group\'s seeded performance');
  ok(!H.isOver(c)); H.apply(c, 0, C.duel.toWire(goodPerf('egmont'))); ok(H.isOver(c)); ok(H.result(c).w === 0 || H.result(c).w === 1 || H.result(c).w === -1);
});
const vecOf = v => C.vecToPerf(v);

test('duel adapter: what is posted fits the database rules (pd keys, array sizes; act fields incl. r), and the page-side view reads it', () => {
  const st = H.create({ g: 2, n: 2, seed: 3, cp: 2, humans: [0, 1], first: 1 }); H.apply(st, 0, C.duel.pickWire(C.DUEL_PIECES.length - 1));
  H.apply(st, 0, C.duel.toWire(goodPerf('fidelio'))); H.apply(st, 1, { t: 'quit' });
  for (const a of [C.duel.pickWire(15), C.duel.toWire(goodPerf('egmont')), C.duel.quitWire(), C.duel.forfWire()]) ok(actFits(a), JSON.stringify(a));
  eq(JSON.stringify(pdFits(H.pub(st))), '[]'); eq(JSON.stringify(pdFits(H.pub(H.create({ g: 1, n: 2, seed: 1, cp: 2, humans: [0, 1], first: 0 })))), '[]');
  const evs = [{ t: 'pk', c: 3 }, { t: 'dn', s: 1 }, { t: 'qt', s: 0 }, { t: 'ff', s: 1 }]; evs.forEach(e => ok(/^[a-z]{2}$/.test(e.t)));
  const ruleAct = RULES.act.$uid.a; ok(ruleAct.r && ruleAct.r.$i, 'database.rules.json allows act.a.r (the result vector)'); ok(/\[0-9\]\|1\[0-5\]/.test(ruleAct.r.$i['.validate']) && /<= 255/.test(ruleAct.r.$i['.validate']), 'index 0..15, value 0..255');
  const v = C.duel.view({ me: 1, names: ['A', 'B'], pd: json(H.pub(st)), ph: 'over' }); eq(v.piece, C.DUEL_PIECES[C.DUEL_PIECES.length - 1]); eq(v.me, 1); eq(v.op, 0); ok(v.theirs && !v.mine && v.meForfeit && !v.oppForfeit); eq(v.ph, 2);
  const pd2 = { p: 0, ph: 2, ra: C.perfToVec(goodPerf('midsummer')), rb: C.perfToVec(badPerf('midsummer')) }; const v2 = C.duel.view({ me: 0, names: ['A', 'B'], pd: pd2 }), v3 = C.duel.view({ me: 1, names: ['A', 'B'], pd: pd2 });
  ok(v2.verdict && v2.won && !v3.won && !v2.draw && v2.verdict.tally[0] >= 3, 'seen from either seat'); eq(v2.verdict.a.total, v3.verdict.a.total); eq(C.duel.view({ me: 0, pd: { p: -1, ph: 0 } }).piece, '');
});

test('wiring: the page loads contest.js, sw.js caches it, the registry documents the new key with a sync rule and achievements, the rules know orchestra and the English covers the pages\' strings', () => {
  const html = rd('orchestra/index.html'), sw = rd('sw.js'), games = rd('common/games.js'), rules = rd('database.rules.json');
  ok(/<script src="contest\.js"><\/script>/.test(html) && html.indexOf('src="engine.js"') < html.indexOf('src="contest.js"'), 'script tag after engine.js'); ok(/<script src="\.\.\/common\/turnroom\.js"><\/script>/.test(html), 'the shared room helper');
  ok(sw.includes("'./orchestra/contest.js'"), 'ENGINES in sw.js'); ok(/window\.OrchContest/.test(html) && /Object\.assign\(\{\}, CT\.EN/.test(html), 'the page adds the English of contest.js');
  ok(games.includes("'kusoge.orchestra.contest'"), 'registry key'); const G = require(path.join(ROOT, 'common/games.js')); const g = (G.games || G.GAMES || []).find(x => x.id === 'orchestra');
  ok(g && g.keys['kusoge.orchestra.contest'] && g.sync['kusoge.orchestra.contest'], 'documented and synced'); ok(/KoboCloud\.sync\(\{[^}]*'kusoge\.orchestra\.contest': 'newest'/.test(html), 'the page syncs the key');
  ok(g.achievements.filter(a => /^orchestra\.(contest|duel)/.test(a.id)).length >= 3, 'achievements for the contest and the duel');
  ok(/\(colorcards\|reversi\|gomoku\|[a-z|]*orchestra[a-z|]*\)/.test(rules), 'orchestra is in the game lists of tr/');
  eq((rules.match(/orchestra/g) || []).length, (rules.match(/gomoku/g) || []).length, 'orchestra appears wherever gomoku does');
});

run('orchestra-contest');
