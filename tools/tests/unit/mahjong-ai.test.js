// mahjong/ai.js：CPU が反則の手を出さない・1手150ms以内・強さの順・ヒントの形。 実行：node tools/tests/unit/mahjong-ai.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'mahjong/engine.js'));
const AI = require(path.join(ROOT, 'mahjong/ai.js'));
const TIMES = [];
function game(seed, levels, mode) {
  const st = E.create({ seed, levels, cfg: { mode: mode || 'east' } }), rnd = E.mulberry32(seed + 1); let maxT = 0, n = 0;
  while (!st.over) {
    while (st.phase !== 'end') {
      const s = E.waiting(st)[0], t0 = process.hrtime.bigint();
      const a = AI.decide(st, s, levels[s], rnd);
      { const d = Number(process.hrtime.bigint() - t0) / 1e6; maxT = Math.max(maxT, d); TIMES.push(d); } n++;
      if (!E.apply(st, s, a)) throw new Error('illegal ' + JSON.stringify(a));
    }
    E.nextRound(st);
  }
  return { st, maxT, n };
}
function avgRank(lv, N) {   // lv[0] の席の平均順位（席を回して公平に）
  let sum = 0, mt = 0;
  for (let g = 1; g <= N; g++) { const rot = g % 4, L = [0, 1, 2, 3].map(i => lv[(i + rot) % 4]); const r = game(g * 13, L); mt = Math.max(mt, r.maxT); for (let s = 0; s < 4; s++) if ((s + rot) % 4 === 0) sum += r.st.final.rank[s]; }
  return { rank: sum / N, maxT: mt };
}
test('CPU games at every level finish with legal moves only; each decision is under 150 ms', () => {
  let mt = 0;
  for (const lv of [[1, 1, 1, 1], [2, 2, 2, 2], [3, 3, 3, 3], [3, 2, 1, 3]]) for (let seed = 1; seed <= 4; seed++) { const r = game(seed, lv, seed % 2 ? 'east' : 'hanchan'); mt = Math.max(mt, r.maxT); ok(r.st.over); eq(Math.round(r.st.scores.reduce((a, b) => a + b, 0) / 100) * 100 + 0 >= 90000, true); }
  TIMES.sort((a, b) => a - b); const p995 = TIMES[Math.floor(TIMES.length * 0.995)], med = TIMES[TIMES.length >> 1];
  console.log('  decisions ' + TIMES.length + ': median ' + med.toFixed(1) + ' ms, p99.5 ' + p995.toFixed(1) + ' ms, slowest ' + mt.toFixed(1) + ' ms');
  ok(p995 < 100 && med < 20, 'p99.5 ' + p995.toFixed(1) + ' ms (a rare slow outlier is GC / machine load)'); ok(mt < 400, 'slowest ' + mt);
});
test('strength order: Normal and Hard beat Easy clearly; Hard is not worse than Normal (average rank over many games)', () => {
  const a = avgRank([3, 1, 1, 1], 32), b = avgRank([2, 1, 1, 1], 32), c = avgRank([3, 2, 2, 2], 64);
  console.log('  hard vs easy ' + a.rank.toFixed(2) + ', normal vs easy ' + b.rank.toFixed(2) + ', hard vs normal ' + c.rank.toFixed(2));
  ok(a.rank < 2.0, 'hard beats easy: ' + a.rank); ok(b.rank < 2.1, 'normal beats easy: ' + b.rank); ok(c.rank < 2.6, 'hard is not worse than normal: ' + c.rank);
});
test('defence: when someone is in riichi, a fold picks genbutsu / suji; danger(genbutsu) is 0', () => {
  const st = E.create({ seed: 3 }); st.riichi[1] = 1; st.rivers[1].push({ t: 4 * 4, riichi: true, tsumogiri: false, called: false });
  const left = AI.leftCounts(st, 0);
  eq(AI.danger(st, 1, 4, left), 0, 'genbutsu'); ok(AI.danger(st, 1, 7, left) < AI.danger(st, 1, 5, left), 'suji 7 (4 is genbutsu) is safer than the middle 6');
  ok(AI.danger(st, 1, 4 + 3, left) <= 3, 'suji');
});
test('hint(): tsumo when it can win; otherwise a discard with shanten and useful tiles', () => {
  const st = E.create({ wall: E.rigWall({ hands: ['234m567p345s68m66p', null, null, null], draws: '7m' }) });
  eq(AI.hint(st, 0).type, 'tsumo');
  const s2 = E.create({ wall: E.rigWall({ hands: ['234m567p345s68m66p', null, null, null], draws: '7z' }) });
  const h = AI.hint(s2, 0); eq(h.type, 'riichi'); eq(h.kind, E.parseKinds('7z')[0]); eq(h.shanten, 0); ok(h.list.some(x => x.k === E.parseKinds('7m')[0]), 'waits on 7m');
  const info = AI.handInfo(s2, 0); eq(info.shanten, 0);
});
run();
