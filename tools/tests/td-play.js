#!/usr/bin/env node
// 工房まもりの通しプレイ（Playwright。?debug の window.__td で「どこを押すか」だけを聞き、押すのは本物のクリック）
//   node tools/tests/td-play.js [first,build,win,lose,endless,daily,resume,pause,english,layouts,perf]   … 全部で約3分
// 1. 初回：遊び方 → マップ1のチュートリアル（光る台座 → くぎ打ちを2回タップ → 開始 → 波1を倒す → 強化 → 早送り）
// 2. 建てる・強化（Lv3 → 分かれ道）・狙い・売る を本物のタップで。コインが足りないと建たない。何もない所をタップすると閉じる
// 3. 自動プレイでマップ1に勝つ → 星・記録・次のマップ・エンドレスが開く
// 4. 負け → 結果 → 「もう一度」で新しいゲーム（波0・部品20）
// 5. エンドレス：マップの「エンドレス」から始め、波を越えて点が入る → 終わるとベストとランキングの値
// 6. 今日のチャレンジ：日替わりの条件で始まり、結果が出る
// 7. 自動保存：波のあいだで再読み込み → 「つづきから」で同じ波・台・コイン
// 8. 一時停止：隠すと時間が止まり、戻ると「つづける」まで止まったまま
// 9. 英語：遊び方・タイトル・リング・台の画面・結果に日本語が残らない
// 10. 全画面サイズ × ja/en：下のボタン・リング・台の画面が画面内で44px以上、横スクロールなし
// 11. 性能：250体と弾で swiftshader の fps を測る
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'td-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.td.save', RUN = 'kusoge.td.run';
const SEEN = { 'kusoge.td.howto': '1' };
const ALL = Object.assign({}, SEEN, { [SAVE]: JSON.stringify({ v: 1, maps: { m1: { st: 1, c: 1 }, m2: { st: 1, c: 1 }, m3: { st: 1, c: 1 }, m4: { st: 1, c: 1 }, m5: { st: 1, c: 1 }, m6: { st: 1, c: 1 }, m7: { st: 1, c: 1 } }, best: 0, stars: 7, stats: {}, tut: 1 }) });
const DONE = Object.assign({}, SEEN, { [SAVE]: JSON.stringify({ v: 1, maps: {}, best: 0, stars: 0, stats: {}, tut: 1 }) });
const I18N_WATCH = `(() => { let k = null; window.__jpMiss = [];
  Object.defineProperty(window, 'KoboI18n', { configurable: true, get() { return k; }, set(v) {
    k = v; if (!v || !v.t) return; const t = v.t;
    v.t = function (s, vars) { const r = t(s, vars); if (v.lang === 'en' && /[\\u3040-\\u30ff\\u3400-\\u9fff]/.test(r) && !window.__jpMiss.includes(s)) window.__jpMiss.push(s); return r; };
  } }); })();`;

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || {}, isMobile: false, hasTouch: false });
  if (o.lang === 'en') await s.page.addInitScript(I18N_WATCH);
  await s.goto('/td/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready());
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const tapSlot = async (p, i) => { const pt = await p.evaluate(i => __td.slotPoint(i), i); await p.mouse.click(pt.x, pt.y); };
const tapTower = async (p, id) => { const pt = await p.evaluate(id => __td.towerPoint(id), id); await p.mouse.click(pt.x, pt.y); };
async function startMap(p, mi, mode) { // through the title: map card → defend / endless (real clicks)
  await p.evaluate(() => __td.title());
  await p.click(`.mc[data-map="${mi}"]`);
  await p.click(mode === 'endless' ? '#mEndless' : '#mGo');
  const dlg = await p.$('.kb-layer .kb-btn--primary-slot');
  if (dlg) await dlg.click();
  await p.waitForFunction(() => __kb.state().mode !== 'title');
}
async function autoUntil(p, cond, max = 4000) { // the auto-player, in chunks, until cond(state)
  for (let i = 0; i < max; i += 40) { await p.evaluate(() => __td.auto(40)); const x = await st(p); if (cond(x)) return x; }
  return st(p);
}

async function first(env) {
  console.log('1. first visit: how to play → tutorial on map 1');
  const s = await open(env);
  const p = s.page;
  let x = await st(p);
  check('first visit shows how to play', x.howto && !x.title, x);
  await shot(p, '1-howto');
  await p.click('#howtoGo');
  x = await st(p);
  check('map 1 starts with the tutorial (step 0: tap the glowing pad)', x.mode === 'normal' && x.map === 0 && x.tut === 0 && /台座/.test(await p.textContent('#tip')), x);
  const ts = await p.evaluate(() => __td.tutSlot());
  await tapSlot(p, ts);
  x = await st(p);
  check('tapping the pad opens the build ring (step 1)', x.ring && x.tut === 1 && x.sel === 'slot:' + ts, x);
  check('the ring points at the Nailer', !!(await p.$('.rb.hint[data-tower="nail"]')), null);
  await shot(p, '1-ring');
  await p.click('.rb[data-tower="nail"]');
  x = await st(p);
  check('one tap selects (nothing built yet)', x.pick === 'nail' && x.towers.length === 0, x);
  await p.click('.rb[data-tower="nail"]');
  x = await st(p);
  check('the second tap builds it, coins go down (step 2)', x.towers.length === 1 && x.towers[0].type === 'nail' && x.gold === 160 - 60 && x.tut === 2 && !x.ring, x);
  await p.click('#nextBtn');
  x = await st(p);
  check('"Start" calls wave 1 (step 3)', x.wave === 1 && x.tut === 3, x);
  for (let i = 0; i < 40 && (await st(p)).cleared < 1; i++) await p.evaluate(() => __td.run(1));
  await p.waitForTimeout(100);
  x = await st(p);
  check('wave 1 stopped, coins earned, then "upgrade" (step 4)', x.cleared >= 1 && x.gold > 100 && x.tut === 4 && x.lives === 20, x);
  await shot(p, '1-wave1');
  await tapTower(p, x.towers[0].id);
  x = await st(p);
  check('tapping the tower opens its panel', x.panel, x);
  await p.click('#pUp');
  x = await st(p);
  check('upgrade to Lv2 (step 5)', x.towers[0].lv === 2 && x.tut === 5, x);
  await p.click('#speedBtn');
  x = await st(p);
  check('speed 2× ends the tutorial (saved)', x.speed === 2 && x.tut == null && x.save.tut === 1, x);
  await s.close();
  // second visit: no how-to
  const s2 = await open(env, { seed: { 'kusoge.td.howto': '1' } });
  check('second visit opens the map select, not the how-to', (await st(s2.page)).title && !(await st(s2.page)).howto, null);
  await s2.close();
}

async function build(env) {
  console.log('2. build, upgrade, branch, aim and sell with real taps');
  const s = await open(env, { seed: DONE });
  const p = s.page;
  await startMap(p, 0);
  await p.evaluate(() => __td.gold(2000));
  const free = await p.evaluate(() => __td.freeSlots());
  await tapSlot(p, free[3]);
  await p.click('.rb[data-tower="spring"]'); await p.click('.rb[data-tower="spring"]');
  let x = await st(p);
  const t = x.towers.find(q => q.slot === free[3]);
  check('a Spring Mortar is built on the tapped pad', t && t.type === 'spring' && x.gold === 2000 - 80, x.towers);
  await tapTower(p, t.id);
  await p.click('#pUp'); await p.click('#pUp');
  x = await st(p);
  check('two upgrades → Lv3', x.towers.find(q => q.id === t.id).lv === 3, x.towers);
  await shot(p, '2-branch');
  check('Lv3 offers two specialties', !!(await p.$('#pBra')) && !!(await p.$('#pBrb')), null);
  await p.click('#pBrb');
  x = await st(p);
  const t4 = x.towers.find(q => q.id === t.id);
  check('choosing the second one → Lv4 branch b (Shaker Shot)', t4.lv === 4 && t4.br === 'b', t4);
  await p.click('#pAim');
  x = await st(p);
  check('aim cycles first → strong', x.towers.find(q => q.id === t.id).target === 'strong', null);
  const gold = x.gold;
  const inv = 80 + 70 + 110 + 220;
  await p.click('#pSell');
  x = await st(p);
  check('selling refunds 70% and frees the pad', x.gold === gold + Math.floor(inv * 0.7) && !x.towers.some(q => q.id === t.id) && !x.panel, { gold: x.gold, before: gold });
  // not enough coins
  await p.evaluate(() => __td.gold(10));
  await tapSlot(p, free[5]);
  await p.click('.rb[data-tower="nail"]'); await p.click('.rb[data-tower="nail"]');
  x = await st(p);
  check('without coins nothing is built (the ring stays, says why)', x.towers.length === 0 && x.ring && /足りない/.test(await p.textContent('#tip')), x);
  const ep = await p.evaluate(() => __td.emptyPoint());
  await p.mouse.click(ep.x, ep.y);
  x = await st(p);
  check('tapping empty ground closes the ring', !x.ring && !x.sel, x);
  // every tower type can be built and upgraded to both branches
  await p.evaluate(() => __td.gold(99999));
  const ok = [];
  for (const [i, type] of ['nail', 'glue', 'copter', 'coil', 'toolbox'].entries()) {
    const fs2 = await p.evaluate(() => __td.freeSlots());
    await tapSlot(p, fs2[i * 2]);
    await p.click(`.rb[data-tower="${type}"]`); await p.click(`.rb[data-tower="${type}"]`);
    const y = await st(p); const q = y.towers[y.towers.length - 1];
    await tapTower(p, q.id); await p.click('#pUp'); await p.click('#pUp'); await p.click(i % 2 ? '#pBra' : '#pBrb');
    const z = (await st(p)).towers.find(w => w.id === q.id);
    ok.push(z.type === type && z.lv === 4);
    await p.click('#pClose');
  }
  check('nailer, glue, copter, coil and toolbox all reach Lv4', ok.every(Boolean), ok);
  await p.click('#nextBtn');
  await p.evaluate(() => __td.run(6));
  await shot(p, '2-towers');
  await s.close();
}

async function win(env) {
  console.log('3. win map 1 with the auto-player');
  const s = await open(env, { seed: DONE });
  const p = s.page;
  await startMap(p, 0);
  let x = await autoUntil(p, y => y.over);
  check('map 1 is won', x.over && x.won && x.stars >= 1, { won: x.won, lives: x.lives, wave: x.wave });
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  await shot(p, '3-win');
  x = await st(p);
  const sv = await stored(p, SAVE);
  check('the result shows the stars and the save keeps them', /★/.test(await p.textContent('#rStars')) && sv.maps.m1.c === 1 && sv.maps.m1.st === x.stars && sv.stars === x.stars, sv);
  check('the run save is gone after the end', (await stored(p, RUN)) === null, null);
  const ev = await p.evaluate(() => (window.KoboPlatform && KoboPlatform.__events || []).map(e => e.type || e.t));
  await p.click('#rNext');
  x = await st(p);
  check('"Next map" opens map 2', x.mapCard && /2\./.test(await p.textContent('#mTitle')), x);
  await p.click('#mBack');
  await p.click('.mc[data-map="0"]');
  check('map 1 now has endless open', !(await p.$eval('#mEndless', b => b.disabled)), ev.slice(-6));
  await s.close();
}

async function lose(env) {
  console.log('4. lose, then try again');
  const s = await open(env, { seed: DONE });
  const p = s.page;
  await startMap(p, 0);
  await p.click('#nextBtn');
  await p.evaluate(() => __td.run(10));
  // no towers: let the toys through
  let x = await (async () => { for (let i = 0; i < 60; i++) { await p.evaluate(() => { const s2 = __kb.state(); if (s2.cd < 0) document.getElementById('nextBtn').click(); return __td.run(5); }); const y = await st(p); if (y.over) return y; } return st(p); })();
  check('with no towers the parts are stolen (lost)', x.over && !x.won && x.lives === 0, { lives: x.lives, wave: x.wave });
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  await shot(p, '4-lose');
  check('the result says so', /盗まれた/.test(await p.textContent('#rTitle')), null);
  await p.click('#rNext');
  x = await st(p);
  check('"Try again" starts fresh (wave 0, 20 parts)', x.mode === 'normal' && !x.over && x.wave === 0 && x.lives === 20 && x.towers.length === 0, x);
  await p.evaluate(() => __kb.lose());
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  check('the debug lose hook ends the game too', (await st(p)).over, null);
  await s.close();
}

async function endless(env) {
  console.log('5. endless on map 1');
  const seed = Object.assign({}, SEEN, { [SAVE]: JSON.stringify({ v: 1, maps: { m1: { st: 2, c: 1, ew: 0, es: 0 } }, best: 0, stars: 2, stats: {}, tut: 1 }) });
  const s = await open(env, { seed });
  const p = s.page;
  await startMap(p, 0, 'endless');
  let x = await st(p);
  check('endless starts with no wave limit', x.mode === 'endless' && x.total === -1, x);
  x = await autoUntil(p, y => y.cleared >= 14, 3000);
  check('the auto-player survives past the campaign length and scores', x.cleared >= 14 && x.score > 0 && !x.over, { cleared: x.cleared, score: x.score });
  await shot(p, '5-endless');
  const score = x.score;
  await p.evaluate(() => __kb.lose());
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  const sv = await stored(p, SAVE);
  check('the best run goes to the save (ranking value)', sv.best >= score && sv.maps.m1.es >= score && sv.maps.m1.ew >= 14, sv);
  const rv = await p.evaluate(() => window.KoboPlatform ? KoboPlatform.rankValue('td') : -1);
  check('KoboPlatform.rankValue reads it', rv === sv.best, rv);
  await shot(p, '5-endless-result');
  await s.close();
}

async function daily(env) {
  console.log('6. today\'s challenge');
  const s = await open(env, { seed: DONE });
  const p = s.page;
  await p.click('#tDaily');
  let x = await st(p);
  check('the daily starts on its map with two modifiers', x.mode === 'daily' && Object.keys(x.mods).length === 2 && x.dk > 20260000, x);
  await shot(p, '6-daily');
  x = await autoUntil(p, y => y.cleared >= 5, 1500);
  await p.evaluate(() => __kb.lose());
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  const rec = await p.evaluate(dk => window.KoboPlatform && KoboPlatform.daily.get(dk, 'td'), x.dk);
  check('the daily result is recorded for today', rec && rec.best > 0, rec);
  await s.close();
  // ?daily opens it directly
  const s2 = await open(env, { seed: DONE, query: '&daily' });
  await s2.page.waitForFunction(() => __kb.state().mode === 'daily', null, { timeout: 4000 }).catch(() => {});
  check('?daily opens today\'s challenge', (await st(s2.page)).mode === 'daily', null);
  await s2.close();
}

async function resume(env) {
  console.log('7. autosave between waves and continue');
  const s = await open(env, { seed: ALL });
  const p = s.page;
  await startMap(p, 2);
  await autoUntil(p, y => y.wave >= 3 && y.quiet && y.cd > 0, 3000);
  await p.waitForTimeout(200);
  const before = await st(p);
  const run = await stored(p, RUN);
  check('a quiet moment between waves is saved', run && run.snap.wave === before.wave && run.snap.towers.length === before.towers.length, run && run.snap);
  await p.reload();
  await p.waitForFunction(() => window.__kb && __kb.ready());
  let x = await st(p);
  check('after reload the title offers "Continue"', x.title && !(await p.$eval('#tContinue', b => b.hidden)), x);
  await shot(p, '7-continue');
  await p.click('#tContinue');
  x = await st(p);
  check('continue restores map, wave, towers, coins and parts', x.map === 2 && x.wave === before.wave && x.towers.length === before.towers.length && x.gold === before.gold && x.lives === before.lives, { x: [x.map, x.wave, x.towers.length, x.gold, x.lives], before: [before.map, before.wave, before.towers.length, before.gold, before.lives] });
  check('a restored game waits for the player to call the next wave', x.cd < 0, x.cd);
  x = await autoUntil(p, y => y.over, 4000);
  check('and plays on to the end', x.over, x);
  await s.close();
}

async function pause(env) {
  console.log('8. pause: hidden → time stops; back → waits for Resume');
  const s = await open(env, { seed: DONE });
  const p = s.page;
  await startMap(p, 0);
  await p.evaluate(() => __td.auto(3));
  await p.click('#nextBtn').catch(() => {});
  await p.waitForTimeout(600);
  const hide = h => p.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await hide(true);
  const a = (await st(p)).time;
  await p.waitForTimeout(1200);
  const b = (await st(p)).time;
  check('hidden: the waves do not move', b - a < 100 && (await st(p)).paused, { a, b });
  await hide(false);
  await p.waitForTimeout(600);
  let x = await st(p);
  check('visible again: the pause menu waits for Resume', x.menuOpen && !!(await p.$('.kb-layer--pause:not([hidden])')), x);
  const c = x.time;
  await p.waitForTimeout(900);
  check('still paused under the menu', (await st(p)).time - c < 100, null);
  await shot(p, '8-pause');
  await p.click('.kb-layer--pause .kb-btn--primary');
  await p.waitForTimeout(1000);
  x = await st(p);
  check('after Resume the game runs again', x.time - c >= 500 && !x.menuOpen, x.time - c);
  await p.click('#pauseBtn');
  check('the ⏸ button opens the same menu', (await st(p)).menuOpen, null);
  await s.close();
}

async function english(env) {
  console.log('9. English: no Japanese on any screen');
  const s = await open(env, { lang: 'en' });
  const p = s.page;
  const scan = async where => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`en ${where}: no Japanese visible`, jp.length === 0, jp.slice(0, 5)); };
  await scan('how to play');
  await p.click('#howtoAlt');
  await scan('map select');
  await shot(p, '9-en-title');
  await p.click('.mc[data-map="0"]');
  await scan('map card');
  await p.click('#mGo');
  const free = await p.evaluate(() => __td.freeSlots());
  await tapSlot(p, free[2]);
  await p.click('.rb[data-tower="coil"]');
  await scan('build ring');
  await p.click('.rb[data-tower="coil"]');
  const t = (await st(p)).towers[0];
  await p.evaluate(() => __td.gold(5000));
  await tapTower(p, t.id); await p.click('#pUp'); await p.click('#pUp');
  await scan('tower panel with the branch choice');
  await shot(p, '9-en-panel');
  await p.click('#pClose');
  await p.click('#preview');
  await scan('next wave info');
  await p.click('#iClose');
  await p.click('#nextBtn');
  await p.evaluate(() => __td.auto(40));
  await p.evaluate(() => __kb.win());
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  await scan('result');
  await shot(p, '9-en-result');
  const miss = await p.evaluate(() => window.__jpMiss || []);
  check('every string asked of KoboI18n.t has an English entry', miss.length === 0, miss.slice(0, 8));
  await s.close();
}

async function layouts(env) {
  console.log('10. every screen size × ja/en: bar, ring and panel on screen and ≥44 px');
  for (const vp of Object.keys(V.VIEWPORTS)) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang, seed: ALL });
    const p = s.page;
    await startMap(p, 3);
    await p.evaluate(() => __td.gold(5000));
    const free = await p.evaluate(() => __td.freeSlots());
    const box = () => p.evaluate(() => {
      const b = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
      const els = [...document.querySelectorAll('#bar button, header .icon, header .back, #ring:not([hidden]) .rb, #panel:not([hidden]) button')].map(e => [e.id || e.className, b(e)]);
      return { els, cv: b(document.getElementById('stageWrap')), W: innerWidth, H: innerHeight };
    });
    const bad = m => m.els.filter(([id, b]) => b.x < -1 || b.y < -1 || b.x + b.w > m.W + 1 || b.y + b.h > m.H + 1 || b.w < 44 || b.h < 44).map(([id, b]) => id + ' ' + JSON.stringify(b));
    // ring at a corner pad and at a middle pad
    let worst = [];
    for (const i of [free[0], free[Math.floor(free.length / 2)], free[free.length - 1]]) { await tapSlot(p, i); await p.waitForTimeout(400); const m = await box(); worst = worst.concat(bad(m)); }
    await p.click('.rb[data-tower="nail"]'); await p.click('.rb[data-tower="nail"]');
    const tw = (await st(p)).towers[0];
    await tapTower(p, tw.id); await p.click('#pUp'); await p.click('#pUp'); await p.waitForTimeout(300);
    const m = await box();
    worst = worst.concat(bad(m));
    const r = await p.evaluate(`(${layoutProbe})()`);
    check(`${vp} ${lang}: controls, ring and panel on screen and ≥44 px`, !worst.length && r.hscroll <= 1 && r.offscreen.length === 0, { worst: worst.slice(0, 4), h: r.hscroll, off: r.offscreen.slice(0, 3) });
    const big = m.cv.w >= Math.min(280, m.W * 0.5) && m.cv.h >= 200;
    check(`${vp} ${lang}: the board is big (${Math.round(m.cv.w)}×${Math.round(m.cv.h)})`, big, m.cv);
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${vp} en: no Japanese`, jp.length === 0, jp.slice(0, 4)); }
    await shot(p, `10-${vp}-${lang}`);
    await p.evaluate(() => __kb.win());
    await p.waitForFunction(() => __kb.state().result, null, { timeout: 4000 });
    const rr = await p.evaluate(`(${layoutProbe})()`);
    const pb = rr.primary.filter(x => x.problems.length || x.h < 44);
    check(`${vp} ${lang}: result card buttons visible`, !pb.length, pb.slice(0, 3));
    if (vp === 'se1' || vp === 'land') await shot(p, `10-${vp}-${lang}-result`);
    await s.close();
  }
}

async function perf(env) {
  console.log('11. performance: 250 toys plus shots under swiftshader');
  const s = await open(env, { seed: ALL, vp: 'ip12' });
  const p = s.page;
  await startMap(p, 6);
  await p.evaluate(() => __td.gold(99999));
  // a full defense, then a flood
  await p.evaluate(() => { const G = __td.G, T = __td.TD; const types = ['nail', 'spring', 'coil', 'copter', 'glue', 'nail', 'spring', 'coil']; G.I.slots.forEach((s2, i) => { if (i % 2) G.build(i, types[(i >> 1) % types.length]); }); });
  await p.click('#nextBtn');
  await p.evaluate(() => __td.stress(260, 40));
  await p.evaluate(() => __td.setSpeed(1));
  await p.waitForTimeout(5500);
  const x = await st(p);
  const fps = await p.evaluate(() => __td.fps(3000));
  const y = await st(p);
  check(`busy field: ${y.enemies} toys and ${y.shots} shots at ${fps} fps (swiftshader)`, x.enemies + x.shots >= 150 && fps >= 24, { fps, enemies: x.enemies, shots: x.shots });
  await shot(p, '11-perf');
  await p.evaluate(() => __td.setSpeed(3));
  const fps3 = await p.evaluate(() => __td.fps(3000));
  const z = await st(p);
  check(`3× speed stays playable: ${fps3} fps with ${z.enemies} toys`, fps3 >= 20, fps3);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [first, build, win, lose, endless, daily, resume, pause, english, layouts, perf]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
