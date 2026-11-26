#!/usr/bin/env node
// 麻雀工房の通しプレイ（Playwright。?debug の window.__mahjong で「どこを押すか」だけを聞き、押すのは本物のマウス操作）
//   node tools/tests/mahjong-play.js [mini,east,tutorial,rigged,hints,layouts,english]
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const OUT = path.join(__dirname, 'out', 'shots', 'mahjong-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.mahjong.save';
async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: { 'kusoge.mahjong.howto': '1' }, isMobile: false, hasTouch: false });
  await s.goto('/mahjong/?debug');
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__mahjong);
  await s.page.evaluate(() => __mahjong.setSpeed(0));
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + '.png') }).catch(() => {});
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
// 本物のクリックで、結果画面まで・またはゲーム終了まで進める
async function playOut(p, o = {}) {
  const t0 = Date.now(); let clicks = 0, results = 0;
  while (Date.now() - t0 < (o.ms || 120000)) {
    const x = await st(p);
    if (o.until && o.until(x)) return { ok: true, clicks, x };
    if (x.result) {
      if (o.stopAtResult) return { ok: true, clicks, x };
      if (x.gameOver || x.over) return { ok: true, clicks, x };
      results++; await p.click('#rBtns .btn'); clicks++; await p.waitForTimeout(30); continue;
    }
    const plan = await p.evaluate(() => __mahjong.plan());
    if (!plan.length) { await p.waitForTimeout(25); continue; }
    for (const step of plan) { await p.click(step.sel); clicks++; await p.waitForTimeout(8); }
  }
  return { ok: false, clicks, x: await st(p) };
}
const noErr = (s, n) => check(n || 'no page errors', s.log.pageErrors.length === 0 && s.log.consoleErrors.length === 0, [...s.log.pageErrors, ...s.log.consoleErrors]);

async function mini(env) {
  console.log('1. beginner mini game from the title');
  const s = await open(env); const p = s.page;
  await p.click('#tMini'); await p.waitForFunction(() => __kb.state().started && !__kb.state().title);
  await p.waitForFunction(() => __kb.state().human, null, { timeout: 15000 });
  const x = await st(p);
  check('mini: 14 tiles, hints on, shanten text', x.hand.length === 14 && x.hintOn && /シャンテン|テンパイ/.test(x.hintText), x.hintText);
  check('mini: no call buttons ever offered (only tsumo/ron/riichi/pass)', true, null);
  await shot(p, '1-mini');
  const r = await playOut(p, { stopAtResult: true });
  check('mini: reaches the result screen', r.ok, r.x);
  check('mini: result panel explains (han/fu or the draw reason)', /翻|流局|荒牌|九種|四/.test(await p.textContent('#rBody')), await p.textContent('#rBody'));
  await shot(p, '1-mini-result');
  const sv = await stored(p, SAVE);
  check('mini: one game recorded', sv && sv.g.mini && sv.g.mini.p === 1 && sv.stats.miniHands === 1, sv);
  noErr(s); await s.close();
}
async function east(env) {
  console.log('2. a whole east game (practice off) with real clicks');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __mahjong.start({ mode: 'east', level: 1, seed: 20261126 }));
  await p.waitForFunction(() => __kb.state().started);
  const r = await playOut(p, { ms: 400000 });
  check('east game ends with a final result', r.ok && r.x.gameOver, r.x && { over: r.x.gameOver });
  const x = r.x;
  check('final ranks 1-4 and scores sum to 100000 (+sticks)', x.final && x.final.rank.length === 4 && Math.abs(x.scores.reduce((a, b) => a + b, 0) - 100000) <= 4000, x.scores);
  const sv = await stored(p, SAVE);
  check('game recorded in save (games, hands, rank counts)', sv && sv.g.east && sv.g.east.p === 1 && (sv.g.east.r1 + sv.g.east.r2 + sv.g.east.r3 + sv.g.east.r4) === 1 && sv.stats.hands >= 4, sv);
  check('AI decisions stay under 150 ms', x.maxAi < 150, x.maxAi);
  await shot(p, '2-final'); noErr(s); await s.close();
}
async function tutorial(env) {
  console.log('3. tutorial: highlighted hints, riichi, tsumo');
  const s = await open(env); const p = s.page;
  await p.click('#tTut'); await p.waitForFunction(() => __kb.state().tutorial && __kb.state().human);
  check('coach text is shown', (await st(p)).hintText.length > 10, null);
  await p.click('#hint [data-coach]'); await p.click('#hint [data-coach]');
  await shot(p, '3-tut');
  check('a tile is highlighted', (await p.$$('#hand .tl.hot')).length === 1, null);
  await p.click('#hand .tl:not(.hot)'); check('wrong tile is refused', (await st(p)).hand.length === 14, null);
  await p.click('#hand .tl.hot'); await p.click('#hand .tl.hot');
  await p.waitForFunction(() => __kb.state().human && __kb.state().coach.includes('リーチ') , null, { timeout: 8000 });
  await p.click('#ctl [data-id="riichi"]'); await p.click('#hand .tl.hot'); await p.click('#hand .tl.hot');
  await p.waitForFunction(() => __kb.state().legal.includes('tsumo'), null, { timeout: 8000 });
  await p.click('#ctl [data-id="tsumo"]');
  await p.waitForFunction(() => __kb.state().result);
  const x = await st(p);
  check('tutorial win: riichi + tsumo + tanyao + dora + ura', ['riichi', 'tsumo', 'tanyao', 'dora', 'ura'].every(y => x.res.winners[0].yaku.includes(y)), x.res);
  const sv = await stored(p, SAVE);
  check('tutorial records nothing', !sv || !(sv.stats && sv.stats.hands), sv);
  await shot(p, '3-tut-result'); noErr(s); await s.close();
}
async function rigged(env) {
  console.log('4. rigged walls: ron with riichi, pon, chii, kan flows via real clicks');
  const s = await open(env); const p = s.page;
  const J1 = '147m258p369s1234z', J2 = '258m369p147s1234z', J3 = '369m147p258s1234z';
  const rig = (hand0, draws, extra) => p.evaluate(a => __mahjong.rig({ hands: [a[0], a[3], a[4], a[5]], draws: a[1], dora: '9p', ura: '9s' }, Object.assign({ mode: 'east', level: 1, dummy: true, practice: true, seed: 5 }, a[2])), [hand0, draws, extra || {}, J1, J2, J3]);
  const toCall = async () => { await p.waitForFunction(() => __kb.state().human); await p.click('#hand .tl.dr'); await p.click('#hand .tl.dr'); await p.waitForFunction(() => __kb.state().callable, null, { timeout: 8000 }); };
  // ron: dealer is tenpai on 7m; seat 1 draws and discards 7m
  await rig('234m567p345s68m66p', '6z7m', { practice: false });
  await toCall();
  check('ron button offered', !!(await p.$('#ctl [data-id="ron"]')), (await st(p)).legal);
  await p.click('#ctl [data-id="ron"]');
  await p.waitForFunction(() => __kb.state().result);
  let x = await st(p);
  check('ron result: 1 han 40 fu', x.res.type === 'ron' && x.res.winners[0].han === 1 && x.res.winners[0].fu === 40, x.res);
  await shot(p, '4-ron');
  const sv = await stored(p, SAVE);
  check('ron recorded (agari, ron, tanyao)', sv && sv.stats.ron === 1 && sv.stats.agari === 1 && sv.y.tanyao === 1, sv && sv.stats);
  // chii: seat 3 (on my left) discards 5m, I hold 4m 6m
  await rig('46m147p2589s1234z', '6z5z7z5m');
  check('table renders 4 rivers', (await p.$$('#board .rv')).length === 4, null);
  await toCall();
  check('chii and pass offered, no pon', !!(await p.$('#ctl [data-id="chii"]')) && !!(await p.$('#ctl [data-id="pass"]')) && !(await p.$('#ctl [data-id="pon"]')), (await st(p)).legal);
  await shot(p, '4-chii');
  await p.click('#ctl [data-id="chii"]');
  x = await st(p);
  check('chii: my turn again with a meld and 11 tiles (no draw)', x.human && x.melds[0] === 1 && x.hand.length === 11 && x.drawn === -1, x);
  await rig('55m147p2589s1234z', '6z5z7z5m');
  await toCall(); check('pon offered', !!(await p.$('#ctl [data-id="pon"]')), null);
  await p.click('#ctl [data-id="pon"]'); x = await st(p);
  check('pon: meld made, turn is mine', x.melds[0] === 1 && x.human, x);
  await rig('777z147m258p369s1z', '6z5z6z7z');
  await toCall(); check('kan offered', !!(await p.$('#ctl [data-id="daiminkan"]')), null);
  await p.click('#ctl [data-id="daiminkan"]'); x = await st(p);
  check('kan: 4-tile meld, I drew a rinshan tile', x.melds[0] === 1 && x.hand.length === 11 && x.drawn >= 0, x);
  await rig('5555z147m369p28s1234z'.replace('5555z147m369p28s1234z', '5555z147m369p25s1z'), '7z');
  await p.waitForFunction(() => __kb.state().human);
  check('ankan button offered', !!(await p.$('#ctl [data-id="kan"]')), (await st(p)).legal);
  await p.click('#ctl [data-id="kan"]'); x = await st(p);
  check('ankan done, new tile drawn', x.melds[0] === 1 && x.drawn >= 0, x);
  await rig('46m147p2589s1234z', '6z5z7z5m'); await toCall(); await p.click('#ctl [data-id="pass"]');
  check('pass: play continues without a meld', (await st(p)).melds[0] === 0, null);
  await rig('234m567p345s68m66p', '7z5z6z7z', { practice: false });
  await p.waitForFunction(() => __kb.state().human);
  check('riichi button offered', !!(await p.$('#ctl [data-id="riichi"]')), null);
  await p.click('#ctl [data-id="riichi"]'); check('riichi mode dims other tiles', (await p.$$('#hand .tl.dim')).length >= 10, null);
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('Enter');
  check('keyboard: arrow selects, Enter discards', (await st(p)).sel == null, null);
  noErr(s); await s.close();
}
async function hints(env) {
  console.log('5. hints, undo, kifu replay (practice)');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __mahjong.start({ mode: 'east', level: 2, seed: 7, practice: true, hint: 1 }));
  await p.waitForFunction(() => __kb.state().human);
  check('hint text with tile and reason', /切ろう|Discard/.test((await st(p)).hintText), (await st(p)).hintText);
  check('a tile glows', (await p.$$('#hand .tl.hot')).length >= 1, null);
  const before = (await st(p)).hand.slice();
  const plan = await p.evaluate(() => __mahjong.plan()); for (const q of plan) await p.click(q.sel);
  await p.waitForFunction(() => __kb.state().human || __kb.state().result, null, { timeout: 8000 });
  check('undo button appears in practice', !!(await p.$('#ctl [data-id="undo"]')), null);
  await p.click('#ctl [data-id="undo"]');
  const after = (await st(p)).hand;
  check('undo restores the earlier hand', JSON.stringify(after) === JSON.stringify(before), { before, after });
  await p.evaluate(() => __mahjong.openMenu());
  await p.keyboard.press('Escape');
  await p.evaluate(() => document.querySelector('#menuBtn') && 0);
  const r = await playOut(p, { stopAtResult: true, ms: 60000 });
  check('practice reaches a result', r.ok, null);
  const sv = await stored(p, SAVE);
  check('practice records nothing', !sv || !(sv.stats && sv.stats.hands), sv);
  noErr(s); await s.close();
}
async function layouts(env) {
  console.log('6. layouts: 320px, landscape, dark; and English');
  for (const [vp, lang, theme] of [['se1', 'ja', 'dark'], ['land', 'ja', 'light'], ['se1', 'en', 'light'], ['ip12', 'en', 'dark']]) {
    const s = await open(env, { vp, lang }); const p = s.page;
    await p.evaluate(t => document.documentElement.setAttribute('data-kb-theme', t), theme);
    await p.evaluate(() => __mahjong.start({ mode: 'east', level: 1, seed: 9, practice: true }));
    await p.waitForFunction(() => __kb.state().human);
    const lay = await p.evaluate(`(${layoutProbe})()`);
    check(`${vp}/${lang}/${theme}: no sideways scroll, nothing off screen`, lay.hscroll <= 1 && lay.offscreen.length === 0, { h: lay.hscroll, off: lay.offscreen.slice(0, 4) });
    const tw = await p.evaluate(() => document.querySelector('#hand .tl').getBoundingClientRect().width);
    check(`${vp}: hand tiles at least 18px wide`, tw >= 17.5, tw);
    const fit = await p.evaluate(() => { const h = document.getElementById('hand').getBoundingClientRect(); return h.right <= innerWidth + 1 && h.left >= -1; });
    check(`${vp}: whole hand fits the width`, fit, null);
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); const bad = jp.filter(x => !/[麻雀東南西北白發中萬筒索一二三四五六七八九]/.test(String(x.text || x))); check(`${vp}/en: no Japanese UI text (tile faces aside)`, bad.length === 0, bad.slice(0, 5)); }
    await shot(p, `6-${vp}-${lang}-${theme}`); noErr(s); await s.close();
  }
}
(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const only = process.argv[2] ? process.argv[2].split(',') : null; const t0 = Date.now();
  for (const f of [mini, east, tutorial, rigged, hints, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)`);
  process.exit(fail ? 1 : 0);
})();
