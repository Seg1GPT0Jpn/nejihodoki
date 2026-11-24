// hitblow/engine.js の単体テスト：判定（H・B）・ヒットだけ／ブローだけの見え方・点数（ランキングの値）・12のミッション（条件・★）・
// 強いボットが全ミッションを回数の上限内で解く・保存（kusoge.hitblow.x）の読み込みと記録・ページが engine.js を使っていること
// 実行：node tools/tests/unit/hitblow-engine.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'hitblow/engine.js'));

test('judge: hits and blows (with and without repeats)', () => {
  deep(E.judge('4719', '4123'), { h: 1, b: 1 });
  deep(E.judge('1234', '1234'), { h: 4, b: 0 });
  deep(E.judge('1234', '4321'), { h: 0, b: 4 });
  deep(E.judge('1123', '1111'), { h: 2, b: 0 });
  deep(E.judge('1123', '2211'), { h: 0, b: 3 });
  eq(E.hb('012', '021'), 12);
});

test('fbKey: what the player sees of a clue', () => {
  eq(E.fbKey('full', 21), 21); eq(E.fbKey('hit', 21), 2); eq(E.fbKey('blow', 21), 1);
  const rows = [{ g: '012', h: 1, b: 1 }];
  const all = E.allCodes(E.mkCfg('num', 'e', false));
  ok(E.filterBy(all, rows, 'full').length < E.filterBy(all, rows, 'hit').length);
  ok(E.filterBy(all, rows, 'hit').length < all.length);
  eq(E.filterBy(all, rows).length, E.filterBy(all, rows, 'full').length);
});

test('rules and score are unchanged (the ranking value)', () => {
  eq(E.allCodes(E.mkCfg('num', 'n', false)).length, 5040);
  eq(E.allCodes(E.mkCfg('col', 'e', false)).length, 336);
  eq(E.allCodes(E.mkCfg('num', 'e', true)).length, 1000);
  const n4 = E.mkCfg('num', 'n', false);
  eq(E.scoreOf(n4, 1, 0), Math.round((1000 + 240) * 2));
  eq(E.scoreOf(E.mkCfg('col', 'h', true), 12, 999999), Math.round(100 * 3 * 1.5));
  const r = E.mkRng(7), s = E.makeSecret(n4, r);
  ok(E.validCode(n4, s) && !E.validCode(n4, '1123') && !E.validCode(n4, '12') && E.validCode(E.mkCfg('num', 'n', true), '1123'));
});

test('12 missions: 3 worlds × 4, sane setups, stars ascend', () => {
  eq(E.MISSIONS.length, 12); eq(new Set(E.MISSIONS.map(m => m.id)).size, 12);
  E.MISSIONS.forEach((m, i) => {
    const c = E.cfgOf(i);
    ok(m.name && m.desc, m.id + ' text');
    ok(['full', 'hit', 'blow'].includes(m.fb), m.id + ' fb');
    ok(m.len >= 3 && m.len <= 6 && m.n >= m.len - (m.dup ? 99 : 0) && m.n <= (m.sym === 'col' ? 8 : 10), m.id + ' size');
    if (!m.dup) ok(m.n >= m.len, m.id + ' enough symbols');
    ok(m.par[0] > m.par[1] && m.par[1] >= 2 && m.max > m.par[0], m.id + ' par/max');
    eq(c.max, m.max); eq(c.n, m.n);
  });
  for (let w = 0; w < 3; w++) eq(E.MISSIONS.filter(m => m.world === w).length, 4);
  ok(new Set(E.MISSIONS.map(m => m.fb)).size === 3 && E.MISSIONS.some(m => m.given > 0) && E.MISSIONS.some(m => m.dup) && E.MISSIONS.some(m => m.sym === 'col'));
  eq(E.info(12), null);
});

test('build: valid answer, free clues are real and never the answer, the flash matches', () => {
  for (let i = 0; i < 12; i++) for (let sd = 1; sd <= 5; sd++) {
    const b = E.build(i, E.mkRng(sd * 31 + i)), m = E.MISSIONS[i];
    ok(E.validCode(b.cfg, b.secret));
    eq(b.given.length, m.given);
    for (const g of b.given) { ok(E.validCode(b.cfg, g) && g !== b.secret); ok(E.judge(b.secret, g).h < b.cfg.len); }
    eq(new Set(b.given).size, b.given.length);
    eq(b.hint.ch, b.secret[b.hint.pos]);
  }
});

test('starsFor: solved 1, par 2 and 3; the flash caps at 2; too many tries = 0', () => {
  const m = E.MISSIONS[0];
  eq(E.starsFor(0, 0, false), 0); eq(E.starsFor(0, m.max + 1, false), 0);
  eq(E.starsFor(0, m.max, false), 1); eq(E.starsFor(0, m.par[0], false), 2); eq(E.starsFor(0, m.par[1], false), 3); eq(E.starsFor(0, 1, false), 3);
  eq(E.starsFor(0, m.par[1], true), 2); eq(E.starsFor(0, m.max, true), 1); eq(E.starsFor(99, 3, false), 0);
  eq(E.progress(0, m.max + 1), 0); eq(E.progress(0, m.par[1]), 1); ok(E.progress(0, m.max) > 0 && E.progress(0, m.max) < 1);
});

test('a strong bot clears every mission within its limit (many seeds, 3 stars is reachable)', () => {
  for (let i = 0; i < 12; i++) {
    const m = E.MISSIONS[i]; let best = 99;
    for (let sd = 1; sd <= 12; sd++) {
      const r = E.mkRng(sd * 977 + i * 13), b = E.build(i, r), cfg = b.cfg;
      const rows = b.given.map(g => ({ g, h: E.judge(b.secret, g).h, b: E.judge(b.secret, g).b }));
      let cand = E.filterBy(E.allCodes(cfg), rows, m.fb); const tried = new Set(b.given); let n = 0, won = false;
      while (n < m.max) {
        const c = cand.filter(x => !tried.has(x));
        const g = c.length <= 2 ? c[0] : E.minimax(c, cfg, tried, r, m.fb);
        n++; tried.add(g); const j = E.judge(b.secret, g);
        if (j.h === cfg.len) { won = true; break; }
        cand = E.filterBy(cand, [{ g, h: j.h, b: j.b }], m.fb);
      }
      ok(won, m.id + ' seed ' + sd + ' solved within ' + m.max);
      best = Math.min(best, n);
    }
    ok(best <= m.par[1], m.id + ' 3 stars reachable (best ' + best + ' vs ' + m.par[1] + ')');
  }
});

test('kusoge.hitblow.x: reads broken saves, unlocks in order, records only improvements, streak', () => {
  for (const bad of [null, undefined, '', '{broken', '[]', 5, { s: 'x', b: 7 }]) { const x = E.readX(bad); eq(x.s.length, 12); ok(x.s.every(v => v === 0) && x.ws === 0); }
  const x = E.readX({ s: [9, -1, 2.7, 'a'], b: [4, 4, 3, 3], ws: 3, wm: 1 });
  deep(x.s.slice(0, 4), [3, 0, 2, 0]); deep(x.b.slice(0, 4), [4, 0, 3, 0]); eq(x.wm, 3);
  const y = E.readX(JSON.stringify({ v: 1, s: [1], b: [5] }));
  ok(E.open(y, 0) && E.open(y, 1) && !E.open(y, 2) && !E.open(y, 12) && !E.open(y, -1));
  ok(E.recordMission(y, 1, 2, 6) && y.s[1] === 2 && y.b[1] === 6);
  ok(!E.recordMission(y, 1, 1, 7) && y.s[1] === 2 && y.b[1] === 6);
  ok(E.recordMission(y, 1, 1, 5) && y.s[1] === 2 && y.b[1] === 5, 'fewer tries improves the best');
  ok(!E.recordMission(y, 1, 0, 0) && E.open(y, 2));
  eq(E.totalStars(y), 3);
  const z = E.readX(); E.recordSolo(z, true); E.recordSolo(z, true); eq(z.ws, 2); E.recordSolo(z, false); eq(z.ws, 0); eq(z.wm, 2);
});

test('the page uses engine.js (no second copy of the rules) and the cache lists it', () => {
  const html = fs.readFileSync(path.join(ROOT, 'hitblow/index.html'), 'utf8');
  ok(/<script src="engine\.js"><\/script>/.test(html));
  ok(!/function hb\(a, b\)/.test(html) && !/function allCodes\(/.test(html));
  ok(/'\.\/hitblow\/engine\.js'/.test(fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8')));
});

run();
