// ひまつぶしタウンを自動で遊ぶボット（単体テストとバランス確認で使う。ページには入らない）。
// 毎回「いまの町でいちばん得な買いもの」（増える収入 ÷ ねだん）を選び、買えるなら買う。旅人にさわり、研究も買う。
'use strict';
const T = require('../../../town/engine');

function wWood(S) { return S.res.wood < 150 ? 0.3 : S.res.wood < 3000 ? 0.12 : 0.01; }
let WP = 0.03;   // one more resident is worth this many coins per second to the bot (the goal is a bigger town)
const RESEARCH_ORDER = ['wealth', 'tools', 'rest', 'glue', 'grain', 'saw', 'crowd', 'purse'];

function emptyTiles(S) {
  const out = [];
  for (let y = 0; y < T.GRID; y++) for (let x = 0; x < T.GRID; x++) if (T.owned(S, x, y) && !T.isWater(x, y) && !S.g[T.IDX(x, y)]) out.push([x, y]);
  return out;
}
// the best thing to buy now: { kind, type?, x, y, cost, gain, score }
function bestBuy(S) {
  let best = null;
  WP = S.res.coin > 2000 ? 1000 : 0.03;
  const ww = wWood(S);
  const rate = Math.max(0.3, T.coinRate(S));
  const consider = (o) => { o.cost = o.c.c + o.c.w; const wait = Math.max(0, (o.c.c - S.res.coin) / rate, (o.c.w - S.res.wood) / Math.max(0.05, T.rates(S).wood)); o.score = o.gain / Math.max(1, o.cost) * Math.exp(-wait / 150); if (o.gain > 1e-9 && (!best || o.score > best.score)) best = o; };
  const empties = emptyTiles(S);
  for (const type of T.TYPES) {
    if (!T.unlocked(S, type)) continue;
    const c = T.cost(S, type);
    let top = null;
    for (const [x, y] of empties) {
      if (T.BUILDINGS[type].shore && !T.isShore(x, y)) continue;
      const gain = T.gainIfBuilt(S, type, x, y, ww, WP);
      if (!top || gain > top.gain) top = { kind: 'build', type, x, y, gain, c };
    }
    if (top) consider(top);
  }
  for (let y = 0; y < T.GRID; y++) for (let x = 0; x < T.GRID; x++) {
    const b = S.g[T.IDX(x, y)];
    if (!b || T.BUILDINGS[b.b].fixed || b.lv >= T.maxLv(S)) continue;
    consider({ kind: 'up', x, y, gain: T.gainIfUpgraded(S, x, y, ww, WP), c: T.upCost(S, b) });
  }
  // more land is worth about the average gain of a good building; compare it by what the best building we could not place would give
  if (T.canExpand(S) !== 'tier' && T.canExpand(S) !== 'max') {
    const c = T.landCost(S.land + 1);
    const room = empties.length;
    if (room <= 2 || !best) {
      let g = 0;
      for (const type of T.TYPES) if (T.unlocked(S, type)) g = Math.max(g, T.gainIfBuilt(S, type, empties.length ? empties[0][0] : T.PLAZA.x, empties.length ? empties[0][1] : T.PLAZA.y, ww, WP));
      const gain = Math.max(g, best ? best.gain : 0) * 1.2 + 0.05;
      consider({ kind: 'land', gain, c });
    }
  }
  return best;
}

// swap: remove one building and put the best new one in its place (when that is worth more). Does it and returns true.
function bestSwap(S) {
  const ww = wWood(S);
  const cur = T.worth(S, ww, WP);
  let best = null;
  for (let y = 0; y < T.GRID; y++) for (let x = 0; x < T.GRID; x++) {
    const i = T.IDX(x, y), b = S.g[i];
    if (!b || T.BUILDINGS[b.b].fixed) continue;
    S.g[i] = null; T.touch(S);
    const w0 = T.worth(S, ww, WP);
    for (const type of T.TYPES) {
      if (!T.unlocked(S, type) || type === b.b) continue;
      if (T.BUILDINGS[type].shore && !T.isShore(x, y)) continue;
      const c = T.cost(S, type);
      if (!T.affordable(S, { c: c.c - Math.floor(b.c * 0.5), w: c.w - Math.floor(b.w * 0.5) })) continue;
      const net = T.gainIfBuilt(S, type, x, y, ww, WP) + w0 - cur;
      if (net > 0.5 && (!best || net > best.net)) best = { x, y, type, net };
    }
    S.g[i] = b; T.touch(S);
  }
  if (!best) return false;
  T.demolish(S, best.x, best.y);
  return T.build(S, best.type, best.x, best.y) === null;
}

// run a town. opt: { minutes, taps (collect visitors, default true), stopAtPrestige, auto (prestige when possible), log }
function play(S, now0, opt) {
  opt = opt || {};
  const end = now0 + opt.minutes * 60000;
  let now = now0;
  const tl = { quests: [], prestiges: [], pops: [], firstPop: {} };
  let nextDecide = 0, lastLog = 0, nextSwap = 0;
  S.t = now0;
  while (now < end) {
    now += 1000;
    const r = T.advance(S, now);
    if (opt.taps !== false) for (const v of S.vis.slice()) T.tapVisitor(S, v.id);
    for (const q of T.checkQuests(S)) tl.quests.push({ id: q.id, t: (now - now0) / 1000 });
    T.refreshUnlocks(S);
    const pop = Math.floor(S.pop);
    if (!tl.firstPop[pop]) tl.firstPop[pop] = (now - now0) / 1000;
    if (now >= nextDecide) {
      nextDecide = now + 2000;
      // research
      for (const id of RESEARCH_ORDER) { if (T.buyResearch(S, id) === null) break; }
      // a full town: tear down what earns least and build something better there (every 30 s, once rich)
      if (now >= nextSwap && S.res.coin > 2000 && emptyTiles(S).length === 0) { nextSwap = now + 30000; bestSwap(S); }
      // the very first moves (what the tutorial teaches): a cottage, then a farm, then a second cottage
      for (const type of ['house', 'farm', 'house']) {
        const want = type === 'house' ? (T.countOf(S, 'house') < (type === 'house' && T.countOf(S, 'farm') > 0 ? 2 : 1)) : T.countOf(S, 'farm') < 1;
        if (!want) continue;
        if (T.cost(S, type).c > S.res.coin) break;
        const e = emptyTiles(S); let bt = null;
        for (const [x, y] of e) { const g = T.gainIfBuilt(S, type, x, y, 0.3, 0.03); if (!bt || g > bt.g) bt = { x, y, g }; }
        if (bt) T.build(S, type, bt.x, bt.y);
        break;
      }
      // buy things (several per decision when rich)
      for (let k = 0; k < 12; k++) {
        const b = bestBuy(S);
        if (!b) break;
        if (!T.affordable(S, b.c)) break;
        if (b.kind === 'build') T.build(S, b.type, b.x, b.y);
        else if (b.kind === 'up') T.upgrade(S, b.x, b.y);
        else T.expand(S);
      }
      const info = T.prestigeInfo(S);
      if (info.ok && opt.auto) {
        const from = S.tier; T.prestige(S, now);
        tl.prestiges.push({ from, t: (now - now0) / 1000, pop: info.pop, gain: info.gain });
        if (opt.stopAtPrestige) break;
      } else if (info.ok && opt.stopAtPrestige) { tl.prestiges.push({ from: S.tier, t: (now - now0) / 1000, pop: info.pop, gain: info.gain }); break; }
    }
    if (opt.log && now - lastLog >= opt.log * 1000) { lastLog = now; console.log(`  ${Math.round((now - now0) / 60000)}min pop ${Math.floor(S.pop)} coin ${Math.floor(S.res.coin)} wood ${Math.floor(S.res.wood)} food ${Math.floor(S.res.food)} spark ${S.res.spark.toFixed(1)} rate ${T.coinRate(S).toFixed(1)}/s land ${S.land} bld ${S.g.filter(Boolean).length}`); }
  }
  tl.end = (now - now0) / 1000; tl.now = now;
  return tl;
}
module.exports = { play, bestBuy, emptyTiles };
