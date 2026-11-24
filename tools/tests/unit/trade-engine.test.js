// trade/engine.js の単体テスト：値段の見直し（ふつうは前と同じ）・できごとの計画・8ミッションの条件と★・保存 kusoge.trade.x の読み込みと記録・
// 英語の辞書（ページの tr('…') が全部 trade/en.js にあること）・ページが engine.js を使っていること
// 実行：node tools/tests/unit/trade-engine.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'trade/engine.js'));

// the original review rule (before the engine split), for the "normal is unchanged" check
function oldReview(sh, price, period) {
  if (sh.drop && period >= sh.limit && price > sh.floor) return Math.max(sh.floor, price - sh.drop);
  if (sh.drop && period <= Math.floor(sh.limit / 3) && price < sh.base) return Math.min(sh.base, price + 100);
  return price;
}
const SH = {
  rect: { base: 300, floor: 300, drop: 0, limit: 99 }, tri: { base: 700, floor: 300, drop: 100, limit: 12 },
  semi: { base: 500, floor: 300, drop: 100, limit: 12 }, circle: { base: 1500, floor: 700, drop: 200, limit: 9 },
};

test('reviewPrice: normal difficulty is exactly the old rule (prices never above base)', () => {
  for (const sh of Object.values(SH)) for (let p = sh.floor; p <= sh.base; p += 100) for (let n = 0; n <= 20; n++) {
    eq(E.reviewPrice(sh, p, n, 1).price, oldReview(sh, p, n));
  }
});

test('reviewPrice: easy drops less, hard drops more, boom fades 100 per review', () => {
  eq(E.reviewPrice(SH.circle, 1500, 9, E.DIFFS.e.drop).price, 1400);
  eq(E.reviewPrice(SH.circle, 1500, 9, E.DIFFS.n.drop).price, 1300);
  eq(E.reviewPrice(SH.circle, 1500, 9, E.DIFFS.h.drop).price, 1200);
  eq(E.reviewPrice(SH.tri, 700, 12, E.DIFFS.h.drop).price, 500);
  eq(E.reviewPrice(SH.tri, 700, 12, E.DIFFS.e.drop).price, 600);
  eq(E.boomPrice(300, 300), 500); eq(E.boomPrice(300, 500), 500);
  deep(E.reviewPrice(SH.rect, 500, 0, 1), { price: 400, kind: 'decay' });
  eq(E.reviewPrice(SH.rect, 300, 5, 1).kind, 'same');
  eq(E.reviewPrice(SH.circle, 1300, 12, 1).price, 1100);   // a drop beats the decay
  eq(E.reviewPrice(SH.circle, 700, 99, 5).price, 700);      // never below the floor
});

test('planEvents: count by difficulty, distinct, sorted, in range, deterministic, off = none', () => {
  for (const d of ['e', 'n', 'h']) for (let sd = 1; sd <= 50; sd++) {
    const p = E.planEvents(E.mkRng(sd), d, true);
    eq(p.length, E.DIFFS[d].events);
    eq(new Set(p.map(e => e.id)).size, p.length);
    p.forEach((e, i) => { ok(e.at >= 6 && e.at <= 36, 'range ' + e.at); ok(E.EVENT_IDS.includes(e.id)); ok(!i || p[i - 1].at <= e.at); ok(Math.abs(e.at - 12) >= 1.4 || e.at > 12, 'near 12'); });
  }
  deep(E.planEvents(E.mkRng(9), 'h', true), E.planEvents(E.mkRng(9), 'h', true));
  eq(E.planEvents(E.mkRng(9), 'h', false).length, 0);
  eq(E.EVENTS.length, 5);
});

test('8 missions: 2 worlds × 4, ids unique, goals ascend, who/diff valid', () => {
  eq(E.MISSIONS.length, 8); eq(new Set(E.MISSIONS.map(m => m.id)).size, 8);
  for (const w of E.WORLDS) eq(E.MISSIONS.filter(m => m.world === w.id).length, 4);
  E.MISSIONS.forEach(m => {
    ok(m.ja && m.desc && E.DIFFS[m.diff]); ok(['A', 'B', 'C', 'D', 'random'].includes(m.who));
    for (const k of ['need', 's2', 's3']) ok(m[k].length >= 1 && m[k].every(c => E.COND_JA[c.m] && c.v > 0));
    m.need.forEach((c, i) => { const hi = m.s3[i].v, mid = m.s2[i].v; if (c.m === 'rank') ok(c.v > mid && mid > hi); else ok(c.v < mid && mid < hi, m.id + ' ' + c.m); });
  });
});

test('evalMission: stars 0..3 and progress', () => {
  const f = E.MISSIONS.findIndex(m => m.id === 'first');
  eq(E.evalMission(f, { x: 3 }).stars, 0); eq(E.evalMission(f, { x: 4 }).stars, 1);
  eq(E.evalMission(f, { x: 10 }).stars, 2); eq(E.evalMission(f, { x: 25 }).stars, 3);
  const c = E.MISSIONS.findIndex(m => m.id === 'catch');
  eq(E.evalMission(c, { rank: 5 }).stars, 0); eq(E.evalMission(c, { rank: 4 }).stars, 1); eq(E.evalMission(c, { rank: 3 }).stars, 2); eq(E.evalMission(c, { rank: 2 }).stars, 3);
  const t = E.MISSIONS.findIndex(m => m.id === 'team');
  eq(E.evalMission(t, { x: 20, deals: 5 }).stars, 0); eq(E.evalMission(t, { x: 3, deals: 6 }).stars, 1); eq(E.evalMission(t, { x: 20, deals: 14 }).stars, 3);
  ok(E.progressOf(f, { x: 2 }) > 0 && E.progressOf(f, { x: 2 }) < 1); eq(E.progressOf(f, { x: 99 }), 1); eq(E.evalMission(99, {}), null);
});

test('gini', () => { eq(E.gini([5, 5, 5, 5]), 0); ok(E.gini([0, 0, 0, 100]) > 0.7); });

test('kusoge.trade.x: reads anything, records only upward, unlocks in order', () => {
  deep(E.readX(null).s, [0, 0, 0, 0, 0, 0, 0, 0]);
  deep(E.readX('{bad').b, [0, 0, 0, 0, 0, 0, 0, 0]);
  const x = E.readX({ s: [3, 9, -2, 'a', 1], b: [10, 20] });
  deep(x.s, [3, 3, 0, 0, 1, 0, 0, 0]); deep(x.b.slice(0, 3), [10, 20, 0]);
  ok(E.isOpen(null, 0) && !E.isOpen(null, 1));
  let y = E.recordX(null, 0, 1, 30); ok(E.isOpen(y, 1) && !E.isOpen(y, 2));
  y = E.recordX(y, 0, 0, 10); eq(y.s[0], 1); eq(y.b[0], 30);
  y = E.recordX(y, 1, 3, 99); y = E.recordX(y, 0, 2, 5); eq(E.totalStars(y), 5); ok(E.isOpen(y, 2));
  eq(E.recordX(y, 8, 3, 1).s.length, 8);
  // an old save with a different shape still loads
  eq(E.readX({ v: 1, s: 'x' }).s.length, 8);
});

test('English dictionary covers every tr() key in the page, engine texts and tables', () => {
  const html = fs.readFileSync(path.join(ROOT, 'trade/index.html'), 'utf8');
  let D = null; globalThis.KoboI18n = { add: o => { D = o.en; } };
  new Function(fs.readFileSync(path.join(ROOT, 'trade/en.js'), 'utf8'))();
  const need = new Set(); let m;
  const re = /\btr\('((?:[^'\\]|\\.)*)'/g; while ((m = re.exec(html))) need.add(m[1].replace(/\\'/g, "'"));
  const blk = html.slice(html.indexOf('var TYPES = loc('), html.indexOf('function applyTheme'));
  const re2 = /'((?:[^'\\]|\\.)*)'/g; while ((m = re2.exec(blk))) if (/[぀-ヿ一-鿿]/.test(m[1])) need.add(m[1]);
  E.MISSIONS.forEach(x => { need.add(x.ja); need.add(x.desc); }); E.WORLDS.forEach(w => need.add(w.ja)); Object.values(E.COND_JA).forEach(v => need.add(v)); Object.values(E.DIFFS).forEach(d => need.add(d.ja));
  const miss = [...need].filter(k => !(k in D));
  ok(!miss.length, 'missing: ' + miss.slice(0, 5).join(' | '));
  // placeholders agree
  for (const k of Object.keys(D)) { const a = (k.match(/\{\w+\}/g) || []).sort().join(), b = (D[k].match(/\{\w+\}/g) || []).sort().join(); eq(b, a, k); }
  ok(!Object.values(D).some(v => /[぀-ヿ一-鿿]/.test(v)), 'Japanese left in English text');
  delete globalThis.KoboI18n;
});

test('the page uses engine.js and the cache lists the engine and dictionary; ranking value unchanged', () => {
  const html = fs.readFileSync(path.join(ROOT, 'trade/index.html'), 'utf8');
  ok(/<script src="engine\.js"><\/script>/.test(html) && /<script src="en\.js"><\/script>/.test(html));
  ok(!/function gini\(/.test(html));
  const sw = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  ok(/'\.\/trade\/engine\.js'/.test(sw) && /'\.\/trade\/en\.js'/.test(sw));
  const reg = fs.readFileSync(path.join(ROOT, 'common/games.js'), 'utf8');
  ok(/rankSource: \{ key: 'kusoge\.trade\.save', paths: \['best'\]/.test(reg));
  ok(/'kusoge\.trade\.save'/.test(html) && /sv\.best = Math\.max\(sv\.best \|\| 0, me\.items\.money\)/.test(html));
});

run();
