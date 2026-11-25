// colorcards/online.js（オンライン対戦のアダプター）の単体テスト：ホストが公開するもの（pub・priv・出来事）に他の人の手札や山札が入らないこと、
// 手の形のたしかめ（できない手・形のおかしい手は null）、見かけの状態（view）が手札の枚数と合うこと・伏せ札の番号が重ならないこと、
// 保存して読み戻せること、ホストがいなくなったときの順位。common/turnroom.js の中の rules や通信は rules/turnroom-bots.js が見る。
// 実行：node tools/tests/unit/colorcards-online.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run, readText } = require('./_kobo-env');
globalThis.ColorCardsEngine = require(path.join(ROOT, 'colorcards/engine.js'));
const E = globalThis.ColorCardsEngine;
const O = require(path.join(ROOT, 'colorcards/online.js'));
const same = E.sameJSON;
const json = v => JSON.parse(JSON.stringify(v));         // what the database would hold (arrays stay arrays here)
const H = O.host;

// one whole game through the adapter (as the host does), checking what leaves the host at every step
function game(seed, n, check) {
  const humans = []; for (let k = 0; k < n; k++) humans.push(k);
  const st = H.create({ n, seed, cp: 2, humans, first: seed % n });
  const ctxs = humans.map(() => O.newCtx());
  let guard = 0, ei = 0, first = true;
  while (!H.isOver(st) && guard++ < 4000) {
    const k = H.turn(st), a = H.cpu(st, k, 1 + (guard % 3));
    const r = H.apply(st, k, a);
    if (!r) throw new Error('adapter refused a CPU move ' + JSON.stringify(a));
    const evs = r.ev.map(e => Object.assign({ i: ++ei }, e));
    const pd = json(H.pub(st));
    humans.forEach(s => {
      const m = { gn: 1, v: guard, ph: H.isOver(st) ? 'over' : 'play', me: s, n, tn: H.turn(st), pd, priv: json(Object.assign({ v: guard }, H.priv(st, s), r.pv && r.pv[s] ? { x: r.pv[s] } : {})), ev: evs, fresh: first, cpu: 2, names: [] };
      check(st, s, m, O.view(m, ctxs[s]), r);
    });
    first = false;
  }
  ok(H.isOver(st), 'the game finished');
  return st;
}

test('what the host publishes has no hidden card in it: pub = counts + the top 4 of the pile; events carry only played cards', () => {
  for (let seed = 1; seed <= 60; seed++) for (const n of [2, 3, 4]) {
    game(seed, n, (st, s, m, v, r) => {
      const pd = m.pd, flat = JSON.stringify(pd);
      eq(pd.dc, st.draw.length);
      eq(Object.keys(pd).filter(k => !['co', 'dr', 'tp', 'dc', 'hc', 'wd', 'cl', 'uc', 'pp', 'wn', 'pt'].includes(k)).length, 0, 'only the known public keys');
      ok(O.arr(pd.tp).length <= 4 && O.arr(pd.tp).join() === st.disc.slice(-4).join(), 'tp = the last 4 of the pile');
      ok(!('h' in pd) && !flat.includes('hands'), 'no hands in pub');
      for (const e of m.ev) {
        ok(/^[a-z]{2}$/.test(e.t), 'event type is 2 letters: ' + e.t);
        ok(!('cards' in e) && !('hand' in e), 'no card lists in events');
        for (const k of Object.keys(e)) ok(['i', 't', 's', 'w', 'c', 'k', 'n', 'x', 'd'].includes(k), 'unknown event field ' + k);
        if (e.t === 'pk') ok(!('c' in e), 'a peek event does not say what was seen');
      }
    });
  }
});

test('priv: only the owner\'s hand (and the card just drawn); a peek result goes to the peeker only', () => {
  let peeks = 0;
  for (let seed = 1; seed <= 80; seed++) {
    const st = H.create({ n: 3, seed, cp: 3, humans: [0, 1, 2], first: 0 });
    let g = 0;
    while (!H.isOver(st) && g++ < 3000) {
      const k = H.turn(st), a = H.cpu(st, k, 3), r = H.apply(st, k, a);
      for (let s = 0; s < 3; s++) { const p = H.priv(st, s); ok(same(p.h, st.hands[s]), 'hand of ' + s); ok(Object.keys(p).sort().join() === 'd,h', 'priv keys'); ok(p.d === -1 || (st.turn === s && st.phase === 'drawn' && p.d === st.drawn), 'drawn card only for the one who drew'); }
      if (r.pv) { peeks++; ok(Object.keys(r.pv).length === 1 && r.pv[k] && r.pv[k].c.length === st.hands[r.pv[k].t].length, 'the peek result goes to the peeker with the target\'s whole hand'); }
    }
  }
  ok(peeks > 5, 'peeks happened in the test games: ' + peeks);
});

test('view: my real hand, rivals as face-down cards of the right count, no id used twice, in every game of every size', () => {
  let games = 0;
  for (let seed = 1; seed <= 40; seed++) for (const n of [2, 3, 4]) {
    games++;
    game(seed, n, (st, s, m, v) => {
      const all = [].concat(...v.st.hands);
      eq(new Set(all).size, all.length, 'no duplicate id (seed ' + seed + ' n ' + n + ')');
      v.st.hands.forEach((h, q) => eq(h.length, st.hands[q].length, 'hand size of seat ' + q));
      ok(same(v.st.hands[s].slice().sort((a, b) => a - b), st.hands[s].slice().sort((a, b) => a - b)), 'my hand is the real one');
      for (const q of v.st.hands.keys()) if (q !== s) ok(!v.st.hands[q].some(c => v.st.disc.includes(c)), 'a rival\'s face-down card does not share an id with the pile');
      eq(v.st.disc[v.st.disc.length - 1], st.disc[st.disc.length - 1], 'top of the pile');
      eq(v.st.color, st.color); eq(v.st.dir, st.dir); eq(v.st.turn, st.over ? v.st.turn : st.turn); eq(v.st.draw.length, st.draw.length);
      eq(v.st.phase, st.over ? 'over' : st.phase); eq(v.st.uncalled, st.uncalled);
      ok(same(v.st.ward, st.ward) && same(v.st.called, st.called), 'ward and called');
    });
  }
  ok(games === 120);
});

test('view: the engine\'s own CPU / legal() / hint() work on the view of the player whose turn it is, and its move is legal on the host', () => {
  for (let seed = 1; seed <= 30; seed++) {
    const n = 2 + seed % 3, st = H.create({ n, seed, cp: 2, humans: [0, 1, 2, 3].slice(0, n), first: 0 }), ctxs = [...Array(n)].map(() => O.newCtx());
    let g = 0, first = true;
    while (!H.isOver(st) && g++ < 3000) {
      const k = H.turn(st);
      const m = { gn: 1, v: g, ph: 'play', me: k, n, tn: k, pd: json(H.pub(st)), priv: json(Object.assign({ v: g }, H.priv(st, k))), ev: [], fresh: first, cpu: 2, names: [] };
      first = false;
      const v = O.view(m, ctxs[k]);
      const mv = E.cpu(v.st);                                     // what a bot / the hint helper does with the view
      ok(E.legal(v.st).some(x => same(x, mv)), 'legal on the view');
      const hint = E.hint(v.st); ok(hint === null || E.legal(v.st).some(x => same(x, hint)), 'hint is legal on the view');
      const r = H.apply(st, k, O.toWire(mv));
      ok(r, 'the host accepts the move the view produced: ' + JSON.stringify(mv));
      // feed the events to the view of everyone else the way the pages get them
      for (let s = 0; s < n; s++) if (s !== k) { const m2 = { gn: 1, v: g, ph: 'play', me: s, n, tn: H.turn(st), pd: json(H.pub(st)), priv: json(Object.assign({ v: g }, H.priv(st, s))), ev: r.ev.map((e, i) => Object.assign({ i: g * 10 + i }, e)), fresh: false, cpu: 2 }; O.view(m2, ctxs[s]); }
    }
  }
});

test('apply refuses what is not legal: wrong seat, card not in hand, cards that cannot be played, bad shapes, bad numbers', () => {
  const st = H.create({ n: 3, seed: 9, cp: 2, humans: [0, 1, 2], first: 0 });
  const k = H.turn(st), other = (k + 1) % 3;
  const snap = JSON.stringify(st);
  const bad = [undefined, null, 5, 'play', {}, { t: 'fly' }, { t: 'play' }, { t: 'play', c: 'x' }, { t: 'play', c: 1.5 }, { t: 'play', c: -1 }, { t: 'play', c: 104 }, { t: 'play', c: 9999 }, { t: 'play', c: st.hands[k][0], k: 9 },
    { t: 'play', c: st.hands[k][0], w: 'a' }, { t: 'play', c: st.hands[k][0], x: 7 }, { t: 'draw', c: 3 }, { t: ['play'] }, { t: 'catch' }, { t: '__proto__' }];
  for (const a of bad) { const r = (() => { try { return H.apply(st, k, a); } catch (e) { return 'threw ' + e.message; } })(); ok(r === null, 'refused: ' + JSON.stringify(a) + ' → ' + JSON.stringify(r)); }
  const notMine = st.hands[other][0];
  ok(H.apply(st, k, { t: 'play', c: notMine }) === null, 'a card from another hand');
  ok(H.apply(st, other, O.toWire(E.cpu(json(st)))) === null, 'a move by the wrong seat');
  const unplayable = st.hands[k].find(c => !E.playable(st, c));
  if (unplayable != null) ok(H.apply(st, k, { t: 'play', c: unplayable }) === null, 'an unplayable card');
  ok(H.apply(st, k, { t: 'keep' }) === null, 'keep without a drawn card');
  eq(JSON.stringify(st), snap, 'a refused move changes nothing');
  // a legal move still works afterwards
  ok(H.apply(st, k, O.toWire(E.cpu(st))), 'a legal move is accepted');
});

test('toWire / fromWire round-trip every legal move (also the choice moves: colour, swap partner, peek target)', () => {
  let kinds = new Set();
  for (let seed = 1; seed <= 200; seed++) {
    const st = E.create({ seed, n: 2 + seed % 3, humans: [] });
    for (let g = 0; g < 40 && !st.over; g++) {
      for (const m of E.legal(st)) { const w = O.toWire(m), back = O.fromWire(json(w)); ok(back && same(back, m), 'round trip ' + JSON.stringify(m) + ' ' + JSON.stringify(back)); kinds.add(m.t + (m.color != null ? 'k' : '') + (m.with != null ? 'w' : '') + (m.target != null ? 'x' : '')); }
      E.apply(st, E.cpu(st));
    }
  }
  ok(['playk', 'playw', 'playx', 'play', 'draw', 'call'].every(k => kinds.has(k)), [...kinds].join());
});

test('a timed-out turn (auto) and a CPU turn always produce a legal move; auto is the weakest play', () => {
  for (let seed = 1; seed <= 100; seed++) {
    const st = H.create({ n: 4, seed, cp: 3, humans: [0, 1, 2, 3], first: 0 });
    for (let g = 0; g < 2000 && !H.isOver(st); g++) { const k = H.turn(st); const a = g % 2 ? H.auto(st, k) : H.cpu(st, k, 3); ok(H.apply(st, k, a), 'legal ' + JSON.stringify(a)); }
    ok(st.levels.every(l => l === 3), 'auto puts the level back');
  }
});

test('ser / de: a game saved by the host can be continued (same moves → same game)', () => {
  const a = H.create({ n: 3, seed: 31, cp: 2, humans: [0, 1], first: 1 });
  for (let i = 0; i < 25; i++) H.apply(a, H.turn(a), H.cpu(a, H.turn(a), 2));
  const b = H.de(H.ser(a));
  ok(same(a, b), 'round trip');
  for (let i = 0; i < 20 && !H.isOver(a); i++) { const x = H.turn(a), y = H.cpu(a, x, 2), z = H.cpu(b, x, 2); ok(same(y, z), 'same CPU choice'); H.apply(a, x, y); H.apply(b, x, z); }
  ok(same(a, b), 'still the same');
});

test('fallback (the host is gone): ranks from the visible hand counts, fewest first, ties by seat; result() ranks 1..n', () => {
  eq(JSON.stringify(H.fallback({ hc: [5, 2, 2, 9] }).r), '[3,1,2,4]');
  eq(JSON.stringify(H.fallback({ hc: { 0: 3, 1: 1 } }).r), '[2,1]');
  const st = game(5, 4, () => {});
  const r = H.result(st);
  eq(JSON.stringify(r.r.slice().sort()), '[1,2,3,4]'); ok(r.w >= 0 && r.r[r.w] === 1, 'the winner is rank 1');
});

test('the page wiring: index.html loads online.js and turnroom.js, registry says versus: own, sw.js lists both files', () => {
  const html = readText('colorcards/index.html'), sw = readText('sw.js');
  ok(/<script src="online.js">/.test(html) && /<script src="\.\.\/common\/turnroom\.js">/.test(html), 'scripts');
  ok(sw.includes("'./colorcards/online.js'") && sw.includes("'./common/turnroom.js'"), 'sw.js');
  const R = require(path.join(ROOT, 'common/games.js')), g = R.games.find(x => x.id === 'colorcards');
  eq(g.versus, 'own'); ok(g.flags.versus, 'flag'); ok(g.tags.includes('online') && g.tags.includes('versus'), 'tags');
  ok(g.score.cap === 100000 && g.rankSource.paths.join() === 'pts', 'the ranking source did not change');
});

run();
