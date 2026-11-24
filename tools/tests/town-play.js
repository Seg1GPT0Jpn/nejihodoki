#!/usr/bin/env node
// ひまつぶしタウンの通しプレイ（Playwright。?debug の window.__town は「どこを押すか」と時計だけ。押すのは本物のマウス）
//   node tools/tests/town-play.js [first,build,visitor,away,prestige,resume,english,layouts]
// 1. 初回：遊び方 → チュートリアル（すまいを建てる）→ 目標たっせい・保存
// 2. 建てる・そだてる・こわす・土地をひろげる（カードとマスを本物のクリックで）
// 3. 旅人：空の旅人をクリックしてごほうび
// 4. るす番：?debug の時計を進める → 「おかえりなさい」。時計を戻してももらえない。上限
// 5. 町をひらきなおす：ほまれ・土地・新しい建物
// 6. 保存と再開（再読み込み）
// 7. 英語：日本語が残らない
// 8. 全画面サイズ × ja/en × ライト/ダーク
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'town-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.town.save', RUN = 'kusoge.town.run', HOWTO = 'kusoge.town.howto';

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: false, hasTouch: false, colorScheme: o.scheme });
  await s.goto('/town/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__town);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
// real clicks: the card, then the tile
async function buildAt(p, type, x, y) {
  await p.click(`.bcard[data-type="${type}"]`);
  const pt = await p.evaluate(([x, y]) => __town.cellPoint(x, y), [x, y]);
  await p.mouse.click(pt.x, pt.y);
  await p.waitForTimeout(40);
  if ((await st(p)).armed === type) await p.click(`.bcard[data-type="${type}"]`);   // put the brush down
}
async function buildBest(p, type) {
  const t = await p.evaluate(type => __town.bestTile(type), type);
  await buildAt(p, type, t.x, t.y);
  return t;
}

async function first(env) {
  console.log('1. first visit: how to play, tutorial');
  const s = await open(env, { seed: {} }); const p = s.page;
  let a = await st(p);
  check('a first visit shows the rules', a.howto, a);
  await shot(p, '1-howto');
  await p.click('#howtoGo');
  a = await st(p);
  check('a new town: 40 coins, pop 0, goal h1, tutorial on', Math.floor(a.res.coin) === 40 && a.pop === 0 && a.quest === 'h1' && a.tut === 0 && a.built === 0, a);
  check('the coach tip is on screen', await p.$eval('#tip', e => !e.hidden && /すまい/.test(e.textContent)), null);
  await shot(p, '1-tutorial');
  const t = await buildBest(p, 'house');
  a = await st(p);
  check('a real tap builds a cottage and pays 20 coins', a.built === 1 && a.counts.house === 1 && a.quest === 'f1' && a.res.coin >= 40 - 20, a);
  await p.waitForTimeout(500);
  await buildBest(p, 'farm');
  a = await st(p);
  check('the farm goal is done too (next: pop 3)', a.counts.farm === 1 && a.quest === 'p3', a);
  await p.waitForFunction(() => __kb.state().pop >= 3, null, { timeout: 30000 });
  await p.waitForTimeout(500);
  a = await st(p);
  check('residents move in and the goal list moves on', a.pop >= 3 && a.quests >= 3, a);
  await shot(p, '1-first-goals');
  const sv = await stored(p, SAVE), run = await stored(p, RUN);
  check('saved: records in kusoge.town.save, the town in kusoge.town.run', sv && sv.qd.h1 === 1 && sv.stats.built === 2 && run && run.g.filter(Boolean).length === 3, { sv, run });
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function build(env) {
  console.log('2. build, upgrade, demolish, expand');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __town.grant({ coin: 5000, wood: 2000 }));
  for (const t of ['house', 'house', 'farm', 'lumber']) await buildBest(p, t);
  let a = await st(p);
  check('four more buildings by real clicks', a.built === 4 && a.counts.house === 2, a);
  // armed mode: tap a card, the map shows bubbles, then tap a tile
  await p.evaluate(() => __town.closeOv());
  await p.click('.bcard[data-type="house"]');
  a = await st(p); check('a card arms the building', a.armed === 'house', a);
  await shot(p, '2-armed');
  const t = await p.evaluate(() => __town.bestTile('house')); const pt = await p.evaluate(([x, y]) => __town.cellPoint(x, y), [t.x, t.y]);
  await p.mouse.click(pt.x, pt.y); await p.waitForTimeout(40);
  a = await st(p); check('then a tile builds it (and it stays armed)', a.counts.house === 3 && a.armed === 'house', a);
  await p.click('.bcard[data-type="house"]'); // unarm
  // water is not buildable
  const wp = await p.evaluate(() => __town.cellPoint(4, 6)); await p.click('.bcard[data-type="farm"]'); await p.mouse.click(wp.x, wp.y);
  a = await st(p); check('a pond tile refuses', a.counts.farm === 1, a);
  await p.click('.bcard[data-type="farm"]');
  // select a building -> info -> upgrade
  const house = await p.evaluate(() => { const g = __town.S.g; for (let i = 0; i < g.length; i++) if (g[i] && g[i].b === 'house') return [i % 10, Math.floor(i / 10)]; });
  const hp = await p.evaluate(([x, y]) => __town.cellPoint(x, y), house);
  await p.mouse.click(hp.x, hp.y); await p.waitForTimeout(80);
  check('tapping a building shows its panel', await p.$eval('#info', e => !e.hidden && /Lv1/.test(e.textContent)), null);
  await shot(p, '2-info');
  const c0 = (await st(p)).res.coin; await p.click('#iUp'); a = await st(p);
  check('upgrade: Lv2, coins paid, goal counted', a.res.coin < c0 && a.stats.upgrades === 1, a);
  await p.click('#iDel'); a = await st(p); check('demolish needs a second tap', a.counts.house === 3, a);
  await p.click('#iDel'); a = await st(p); check('second tap demolishes with a refund', a.counts.house === 2, a);
  // expand
  await p.click('.bcard[data-type="land"]'); a = await st(p);
  check('the land grows to 6x6', a.land === 6, a);
  await p.waitForTimeout(900); await shot(p, '2-land6');
  // a locked building says why
  await p.click('.bcard[data-type="harbor"]');
  check('a locked building shows the reason', await p.$eval('#toast', e => /開く|Opens|new town/.test(e.textContent)), null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function visitor(env) {
  console.log('3. visitors');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __town.spawnVisitor());
  await p.waitForTimeout(250);
  const v = await p.evaluate(() => __town.visitorPoint());
  const c0 = (await st(p)).res.coin;
  await shot(p, '3-visitor');
  await p.mouse.click(v.x, v.y); await p.waitForTimeout(100);
  const a = await st(p);
  check('tapping the visitor pays coins and counts it', a.stats.taps === 1 && a.res.coin > c0 && a.vis === 0, a);
  await p.evaluate(() => __town.setEvent('fest')); await p.waitForTimeout(300);
  check('an event shows its banner', await p.$eval('#ev', e => !e.hidden), null);
  await shot(p, '3-festival');
  await s.close();
}

async function away(env) {
  console.log('4. away: the clock hook');
  const s = await open(env); const p = s.page;
  await buildBest(p, 'house'); await buildBest(p, 'farm');
  await p.evaluate(() => __town.setPop(3));
  const a0 = await st(p);
  await p.evaluate(() => __town.skip(3 * 3600 * 1000));
  await p.waitForFunction(() => __kb.state().welcome, null, { timeout: 5000 });
  let a = await st(p);
  check('after 3 h away the welcome card shows', a.welcome && /3/.test(a.welcomeText), a.welcomeText);
  check('coins grew by about 3 h of income', a.res.coin > a0.res.coin + a0.rate * 3 * 3600 * 0.7, { before: a0.res.coin, after: a.res.coin, rate: a0.rate });
  await shot(p, '4-welcome');
  await p.click('#wOk'); a = await st(p);
  check('collect closes the card', !a.welcome, a);
  const c1 = a.res.coin;
  await p.evaluate(() => __town.skip(40 * 3600 * 1000));
  await p.waitForFunction(() => __kb.state().welcome, null, { timeout: 5000 });
  a = await st(p);
  const gain = a.res.coin - c1;
  check('a 40 h gap pays only the 8 h cap (note says so)', gain < a0.rate * 9 * 3600 * 1.5 + 100 && /8/.test(await p.$eval('#wNote', e => e.textContent)), { gain, rate: a0.rate });
  await p.click('#wOk');
  // a clock set back gives nothing
  const c2 = (await st(p)).res.coin;
  await p.evaluate(() => __town.skip(-30 * 3600 * 1000)); await p.waitForTimeout(600);
  a = await st(p);
  check('a clock set back: no welcome, no coins beyond normal play', !a.welcome && a.res.coin < c2 + a0.rate * 3 + 20, { c2, now: a.res.coin });
  check('the town clock never goes back', a.t >= (await stored(p, RUN)).t - 2000, null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function prestige(env) {
  console.log('5. open a new town (prestige)');
  const s = await open(env); const p = s.page;
  await buildBest(p, 'house');
  await p.evaluate(() => __town.setPop(110));
  await p.waitForTimeout(700);
  check('the Town button shows a dot when it is possible', await p.$eval('#townDot', e => !e.hidden), null);
  await p.click('#btnTown');
  check('the card offers it with the renown gain', await p.$eval('#tPrestige', e => /\+2/.test(e.textContent)) && await p.$eval('#tGo', e => !e.hidden), null);
  await shot(p, '5-town');
  await p.click('#tGo');
  check('first tap only asks to confirm', (await st(p)).tier === 0, await st(p));
  await p.click('#tGo'); await p.waitForTimeout(300);
  let a = await st(p);
  check('tier 1, renown 2, land back to 5, empty town, best kept', a.tier === 1 && a.renown === 2 && a.land === 5 && a.built === 0 && a.best >= 110, a);
  check('harbor and library are now open', a.cards.includes('harbor') && a.cards.includes('library'), a.cards);
  await shot(p, '5-new-town');
  // opening again needs 220
  await p.evaluate(() => __town.setPop(100)); await p.click('#btnTown');
  check('the next one needs 220', await p.$eval('#tPrestige', e => /220/.test(e.textContent)) && await p.$eval('#tGo', e => e.hidden), null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function resume(env) {
  console.log('6. save and resume');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __town.grant({ coin: 900, wood: 300 }));
  await buildBest(p, 'house'); await buildBest(p, 'farm'); await buildBest(p, 'lumber');
  const a = await st(p);
  await p.waitForTimeout(300); await p.evaluate(() => __town.persist());
  await s.reload(); await p.waitForFunction(() => window.__town && __kb.ready());
  const b = await st(p);
  check('after a reload the same buildings, goals and land', b.built === a.built && b.quests === a.quests && b.land === a.land && JSON.stringify(b.counts) === JSON.stringify(a.counts), { a: a.counts, b: b.counts });
  const dl = (await stored(p, SAVE)).stats.built;
  check('records survive (built count)', dl === 3, dl);
  // broken saves do not crash
  await p.evaluate(() => { __town.noSave(); localStorage.setItem('kusoge.town.run', '{"v":1,"g":5,"res":{"coin":"x"}}'); localStorage.setItem('kusoge.town.save', '[1,2]'); });
  await s.reload(); await p.waitForFunction(() => window.__town && __kb.ready());
  check('broken saves load as a fresh town', (await st(p)).built === 0, await st(p));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function english(env) {
  console.log('7. English: nothing in Japanese on screen');
  const s = await open(env, { lang: 'en' }); const p = s.page;
  const miss = async what => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`en ${what}: no Japanese visible`, jp.length === 0, jp.slice(0, 6)); };
  await p.evaluate(() => __town.grant({ coin: 99999, wood: 99999, spark: 20 }));
  await miss('start');
  await p.click('#btnQuests'); await miss('goal list'); await p.click('#qClose');
  await p.click('#btnResearch'); await miss('research'); await p.click('#rClose');
  await p.click('#btnGift'); await miss('gift'); await p.click('#gOpen'); await miss('gift opened'); await p.click('#gClose');
  await p.click('#btnTown'); await miss('town'); await p.click('#tClose');
  await buildBest(p, 'house'); await buildBest(p, 'park'); await buildBest(p, 'farm');
  await p.click('.bcard[data-type="house"]'); await miss('armed');
  const hp = await p.evaluate(() => { const g = __town.S.g; for (let i = 0; i < g.length; i++) if (g[i] && g[i].b === 'house') return __town.cellPoint(i % 10, Math.floor(i / 10)); });
  await p.mouse.click(hp.x, hp.y); await miss('building panel');
  await p.evaluate(() => __town.setPop(90)); await p.click('#btnTown'); await miss('town with a new town ready'); await p.click('#tClose');
  await p.evaluate(() => __town.skip(2 * 3600 * 1000)); await p.waitForFunction(() => __kb.state().welcome); await miss('welcome back'); await p.click('#wOk');
  await p.evaluate(() => __town.setEvent('rain')); await p.waitForTimeout(200); await miss('event');
  await p.evaluate(() => __town.howto()); await miss('how to play');
  check('html lang is en', (await p.evaluate(() => document.documentElement.lang)) === 'en', null);
  await s.close();
}

async function layouts(env) {
  console.log('8. every screen size × ja/en × light/dark: nothing off screen, no sideways scroll');
  for (const vp of (process.env.TOWN_VPS || 'se1,a360s,se2,ip12,land,xr').split(',')) for (const lang of ['ja', 'en']) {
    const scheme = lang === 'ja' ? 'light' : 'dark';
    const s = await open(env, { vp, lang, scheme }); const p = s.page; const tag = `${vp}/${lang}/${scheme}`;
    await p.evaluate(() => { __town.grant({ coin: 99999, wood: 9999 }); });
    for (const t of ['house', 'farm', 'house', 'park', 'lumber']) await buildBest(p, t);
    await p.evaluate(() => { __town.setLand(7); __town.spawnVisitor(); });
    await p.waitForTimeout(900);
    let r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} map: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, r.offscreen.slice(0, 4));
    if (['se1', 'land', 'ip12'].includes(vp)) await shot(p, `8-${vp}-${lang}-${scheme}`);
    const a = await st(p); check(`${tag}: tile width ${Math.round(a.tw)}px is tappable`, a.tw >= 26, a.tw);
    const house = await p.evaluate(() => { const g = __town.S.g; for (let i = 0; i < g.length; i++) if (g[i] && g[i].b === 'house') return __town.cellPoint(i % 10, Math.floor(i / 10)); });
    await p.mouse.click(house.x, house.y); await p.waitForTimeout(100);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} building panel: fits`, r.hscroll <= 1 && r.offscreen.length === 0, r.offscreen.slice(0, 4));
    for (const [btn, id] of [['#btnQuests', 'ovQuests'], ['#btnResearch', 'ovResearch'], ['#btnGift', 'ovGift'], ['#btnTown', 'ovTown']]) {
      await p.click(btn); await p.waitForTimeout(80);
      r = await p.evaluate(`(${layoutProbe})()`);
      check(`${tag} ${id}: fits`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 3), pr: r.primary.filter(x => x.problems.length).slice(0, 2) });
      if (id === 'ovTown' && vp === 'se1') await shot(p, `8-${vp}-${lang}-town`);
      await p.evaluate(() => __town.closeOv());
    }
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
    await s.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [first, build, visitor, away, prestige, resume, english, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
