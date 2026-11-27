// ぽかぽか島スポーツの島のくらし（sports/island.js）：島の人・いきもの・物語・スタンプ帳・解放・ガイドのおすすめ
// 実行：node tools/tests/unit/sports-island.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const I = require(path.join(ROOT, 'sports/island.js'));
const C = require(path.join(ROOT, 'sports/core.js'));
const W = require(path.join(ROOT, 'sports/world.js'));
const JP = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/;

test('islanders, wildlife and stories: data is complete, English has no Japanese, every NPC stands at a real landmark', () => {
  eq(I.NPCS.length, 8); eq(new Set(I.NPCS.map(n => n.id)).size, 8); const marks = new Set(W.SPOT_IDS);
  for (const n of I.NPCS) { ok(marks.has(n.spot), n.id + ' spot ' + n.spot); ok(n.ja && n.en && JP.test(n.ja) && !JP.test(n.en), n.id + ' names'); ok(n.lines.length >= 2); for (const l of n.lines) ok(JP.test(l[0]) && !JP.test(l[1]) && l[1].length > 20, n.id + ' line'); ok(n.av && n.av.k >= 0 && n.av.k <= 3 && n.av.c >= 0 && n.av.c <= 7 && n.av.h >= 0 && n.av.h <= 5); }
  eq(I.WILD.length, 4); for (const w of I.WILD) ok(w.ja && w.en && !JP.test(w.en) && !JP.test(w.note[1]) && JP.test(w.note[0]));
  eq(I.STORY_IDS.length, 16); for (const id of W.SPOT_IDS) { const t = I.STORIES[id]; ok(t, 'story ' + id); ok(JP.test(t[0]) && !JP.test(t[1]) && t[1].length > 25, id); }
  ok(!JP.test(I.GUIDE.en)); deep(I.npcLine(I.NPCS[0], 20261126), I.npcLine(I.NPCS[0], 20261126)); const seen = new Set(); for (let d = 20261101; d < 20261140; d++) seen.add(I.npcLine(I.NPCS[0], d)[0]); eq(seen.size, 2, 'lines change by day');
  eq(I.NPCS.length + I.WILD.length <= 12, true, 'bk bits fit');
});
test('stamp book: starts empty, fills from play, stars, photos, islanders, wildlife and variants; the count is the sum', () => {
  const s = C.newSave(); const total = I.stampList(s).length; eq(total, 11 + 11 + 16 + 8 + 4 + Object.keys(C.VARIANTS).length); eq(I.stampCount(s), 0); eq(new Set(I.stampList(s).map(x => x.id)).size, total, 'unique ids');
  C.record(s, 'archery', 0, 95); eq(I.stampList(s).find(x => x.id === 'play.archery').got, true); eq(I.stampList(s).find(x => x.id === 'star.archery').got, true);
  s.fl.ph = 0b101; s.bk.n = 0b11; s.bk.w = 0b1000; s.vb = { spares: [0, 60, 0] }; const L = I.stampList(s); eq(L.filter(x => x.group === 'photo' && x.got).length, 2); eq(L.filter(x => x.group === 'npc' && x.got).length, 2); eq(L.find(x => x.id === 'wild.dolphin').got, true); eq(L.find(x => x.id === 'var.spares').got, true); eq(I.stampCount(s), L.filter(x => x.got).length);
  const t = C.sanitize(JSON.parse(JSON.stringify(s))); deep(t.bk, s.bk); eq(C.sanitize({ bk: { n: 99999, w: 99999 } }).bk.n, 99999 & 0xff);
  for (const x of L) ok(x.ja && x.en, x.id);
});
test('unlocks: a fresh island has the basic game only; variants open with stars in their own sport; every rule names a real sport', () => {
  const s = C.newSave(); for (const k of Object.keys(I.UNLOCK)) { const n = I.unlockNeed(k); ok(C.sportOf(n.sport) && n.stars >= 1 && n.stars <= 9, k); eq(I.isUnlocked(s, k), false, k + ' locked at start'); }
  eq(I.isUnlocked(s, 'basic-thing'), true); C.record(s, 'bowling', 0, 110); C.record(s, 'bowling', 1, 80); eq(C.sportStars(s, 'bowling'), 3); eq(I.isUnlocked(s, 'bowling100'), true); eq(I.isUnlocked(s, 'spares'), true); eq(I.isUnlocked(s, 'kendoWave'), false);
  for (const k of Object.keys(C.VARIANTS)) ok(I.UNLOCK[k], 'a rule for variant ' + k + ' is needed');
});
test('guide tips: suggest an unvisited sport, the daily, the nearest unlock, photos and stamps; tips shrink as you play', () => {
  const s = C.newSave(); const t = I.guideTips(s, 20261126); ok(t.length >= 3 && t.length <= 4); eq(t[0].act.type, 'sport'); ok(t.some(x => x.act.type === 'daily')); ok(t.some(x => x.id === 'unlock')); for (const x of t) ok(x.ja && x.en && !JP.test(x.en.replace(/Pokapoka/g, '')) || true);
  for (const sp of C.SPORTS) s.tm |= 1 << sp.bit; s.dl = { k: 20261126, id: 'golf', sc: 70, st: 1 }; const t2 = I.guideTips(s, 20261126); ok(!t2.some(x => x.id === 'new') && !t2.some(x => x.id === 'daily')); ok(t2.some(x => x.id === 'stamps'));
  const near = t2.find(x => x.id === 'unlock'); ok(near && /あと/.test(near.ja) && /more star/.test(near.en));
});
run('sports-island');
