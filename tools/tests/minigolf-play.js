#!/usr/bin/env node
// ころがし工房ゴルフの通しプレイ（Playwright。?debug の window.__minigolf で「どこを引っぱるか」と保存した答えを聞き、打つのは本物のドラッグ）
//   node tools/tests/minigolf-play.js [first,round,resume,practice,daily,ink,pause,touch,english,layouts,perf]   … 全部で約1〜2分
// 1. 初回：遊び方 → コース1のホール1でチュートリアル（引っぱる手本 → 本物のドラッグで打つ → 次の一言）→ カップイン → 結果
// 2. コース1を9ホール：答えで回り、毎ホールの結果 → 「次のホールへ」（本物のクリック）→ スコアカード（打数・合計・パーとの差）→ 記録・アンダー・コース2が開く
// 3. 自動保存：ホール3の1打目のあとで再読み込み → 「つづきから」で同じ場所・打数。転がっている途中で閉じても、その1打はなかったことにならない
// 4. 練習：好きなホールを選んで遊び、記録に入らない。「もう一度」「次のホール」
// 5. 今日のホール：日替わりのホールが開き、点と今日のベストが出る
// 6. インク：罰打1で打つ前の場所へ（打数と一言）
// 7. 一時停止：転がっている途中で隠すと止まり、戻るとメニュー
// 8. タッチ：本物のタッチの引っぱりで打てる（CDP の touch イベント）。2本目の指でやめる
// 9. 英語：タイトル・練習・結果・スコアカード・遊び方に日本語が残らない
// 10. 全画面サイズ × ja/en：上のバー・下の強さメーター・結果とスコアカードのボタンが画面内で44px以上、盤が大きい、横向きはホールを横にする
// 11. 性能：歯車と定規のあるホールで fps
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const MG = require('../../minigolf/engine.js');
const { HOLES } = require('../../minigolf/holes.js');
const SOL = require('./minigolf-solutions.js');

const OUT = path.join(__dirname, 'out', 'shots', 'minigolf-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.minigolf.save', RUN = 'kusoge.minigolf.run';
const SEEN = { 'kusoge.minigolf.howto': '1' };
const DONE = Object.assign({}, SEEN, { [SAVE]: JSON.stringify({ v: 1, c: {}, under: 0, done: 0, stats: {}, tut: 1 }) });
const ALL = Object.assign({}, SEEN, { [SAVE]: JSON.stringify({ v: 1, c: { c1: { b: 30, r: 1, h: {} }, c2: { b: 32, r: 1, h: {} } }, under: 0, done: 2, stats: {}, tut: 1 }) });
const I18N_WATCH = `(() => { let k = null; window.__jpMiss = [];
  Object.defineProperty(window, 'KoboI18n', { configurable: true, get() { return k; }, set(v) {
    k = v; if (!v || !v.t) return; const t = v.t;
    v.t = function (s, vars) { const r = t(s, vars); if (v.lang === 'en' && /[\\u3040-\\u30ff\\u3400-\\u9fff]/.test(r) && !window.__jpMiss.includes(s)) window.__jpMiss.push(s); return r; };
  } }); })();`;

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || {}, isMobile: !!o.touch, hasTouch: !!o.touch });
  if (o.lang === 'en') await s.page.addInitScript(I18N_WATCH);
  await s.goto('/minigolf/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready());
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
// a real mouse drag: press at the ball, pull back, release
async function drag(p, a, pw, o = {}) {
  const d = await p.evaluate(([a, pw]) => __minigolf.dragFor(a, pw), [a, pw]);
  await p.mouse.move(d.x0, d.y0); await p.mouse.down();
  for (let i = 1; i <= 8; i++) await p.mouse.move(d.x0 + (d.x1 - d.x0) * i / 8, d.y0 + (d.y1 - d.y0) * i / 8);
  const mid = await st(p); mid.meter = await p.textContent('#meterText');
  if (o.cancel) await p.mouse.move(d.x0 + 2, d.y0 + 2);
  await p.mouse.up();
  return mid;
}
const settle = p => p.evaluate(() => __minigolf.settle());
const replay = (p, id) => p.evaluate(s => __minigolf.replay(s), SOL[id]);
const waitResult = p => p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });

async function first(env) {
  console.log('1. first visit: how to play → tutorial on hole 1-1 → a real drag');
  const s = await open(env);
  const p = s.page;
  let x = await st(p);
  check('first visit shows how to play', x.howto && !x.title, x);
  await shot(p, '1-howto');
  await p.click('#howtoGo');
  await p.evaluate(() => __minigolf.freeze(true));
  x = await st(p);
  check('course 1 starts on hole 1-1 with the tutorial (step 0)', x.mode === 'course' && x.hole === '1-1' && x.tut === 0 && /引っぱって/.test(x.tip), x);
  await shot(p, '1-tutorial');
  const mid = await drag(p, -90, 0.45);
  check('while pulling: the aim and the power meter follow the finger', mid.aim && Math.abs(mid.aim.a + 90) <= 1.5 && Math.abs(mid.aim.p - 0.45) <= 0.03 && /45%/.test(mid.meter), [mid.aim, mid.meter]);
  x = await st(p);
  check('releasing shoots: 1 stroke, the ball rolls, tutorial step 1', x.strokes === 1 && x.st === 'roll' && x.tut === 1 && Math.abs(x.shots[0][1] + 90) <= 1.5, x);
  x = await settle(p);
  const exp = MG.play(HOLES[0], [[0, x.shots[0][1], x.shots[0][2]]]);
  check('the page rolls exactly like the headless engine', Math.abs(x.x - exp.x) < 1e-9 && Math.abs(x.y - exp.y) < 1e-9, { page: [x.x, x.y], node: [exp.x, exp.y] });
  check('the stroke is in the HUD', /1/.test(await p.textContent('#strokeChip')), await p.textContent('#strokeChip'));
  // a short pull cancels
  await drag(p, -90, 0.3, { cancel: true });
  x = await st(p);
  check('sliding back to the start cancels (no stroke)', x.strokes === 1 && x.st === 'rest', x);
  // finish the hole with a short putt from where it stopped (search the engine for one)
  const G0 = MG.restore(HOLES[0], { tick: x.tick, x: x.x, y: x.y, strokes: 1, lx: x.x, ly: x.y });
  let putt = null;
  for (let a = -180; a < 180 && !putt; a += 0.5) for (let pw = 0.05; pw <= 1 && !putt; pw += 0.01) { const r = MG.play(HOLES[0], [[0, a, pw]], { snap: G0.snap() }); if (r.sunk) putt = [a, pw]; }
  await p.evaluate(([a, pw]) => __minigolf.shoot(a, pw), putt);
  await settle(p);
  await waitResult(p);
  x = await st(p);
  check('holed out: result card, tutorial done, record saved', x.result && x.won && x.tut === null && x.save.tut === 1 && x.save.stats.holes === 1, x);
  check('result shows the strokes and a scorecard', /2/.test(await p.textContent('#hSub')) && (await p.$$('#hCard table.sc')).length === 1, await p.textContent('#hSub'));
  await shot(p, '1-result');
  await p.click('#hNext');
  x = await st(p);
  check('"Next hole" opens 1-2 with the card so far', x.hole === '1-2' && x.card.length === 1 && x.strokes === 0, x);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function round(env) {
  console.log('2. a full round of course 1 with the stored answers, through the real buttons');
  const s = await open(env, { seed: DONE });
  const p = s.page;
  let x = await st(p);
  check('title with 3 courses, only the first open', x.title && (await p.$$('.ct')).length === 3 && (await p.$$('.ct:disabled')).length === 2, x);
  await p.click('.ct[data-course="0"]');
  await p.evaluate(() => __minigolf.freeze(true));
  const card = [];
  for (let i = 0; i < 9; i++) {
    const h = HOLES[i];
    x = await st(p);
    if (x.hole !== h.id) { check('hole ' + h.id + ' is open', false, x); break; }
    x = await replay(p, h.id);
    const exp = MG.play(h, SOL[h.id]);
    card.push(exp.strokes);
    check(h.id + ': sunk in ' + exp.strokes + ' (par ' + h.par + ') like the engine', x.won && x.strokes === exp.strokes, x);
    await waitResult(p);
    if (i === 4) { await p.click('#cardBtn').catch(() => {}); }
    await p.click('#hNext');
  }
  x = await st(p);
  const total = card.reduce((a, b) => a + b, 0), par = HOLES.slice(0, 9).reduce((a, h) => a + h.par, 0);
  check('round card: shown after the 9th hole', x.card2 && /ラウンド終了/.test(await p.textContent('#cTitle')), x);
  const cells = await p.$$eval('#cTable tr:nth-child(3) td', tds => tds.map(t => t.textContent));
  check('scorecard: 9 strokes and the total', JSON.stringify(cells.slice(0, 9).map(Number)) === JSON.stringify(card) && Number(cells[9]) === total, { cells, card });
  check('total against par in the heading', (await p.textContent('#cSub')).includes(String(total)), await p.textContent('#cSub'));
  await shot(p, '2-scorecard');
  x = await st(p);
  const sv = x.save;
  check('records: round counted, best = total, under = par − total', sv.c.c1.r === 1 && sv.c.c1.b === total && sv.under === Math.max(0, par - total) && sv.done === 1, sv);
  check('per-hole bests are kept', Object.keys(sv.c.c1.h).length === 9, sv.c.c1.h);
  check('the round in progress is gone', (await stored(p, RUN)) === null, await stored(p, RUN));
  const ach = await p.evaluate(() => { try { return Object.keys(JSON.parse(localStorage.getItem('kobo.ach') || '{}').u || JSON.parse(localStorage.getItem('kobo.ach') || '{}')); } catch (e) { return []; } });
  check('achievements: first putt and a round on Ruler Bench', JSON.stringify(ach).includes('minigolf.h1') && JSON.stringify(ach).includes('minigolf.r1'), ach);
  await p.click('#cAlt');
  check('course 2 is open now', (await p.$$('.ct:disabled')).length === 1, null);
  check('rank value equals the saved under-par total', await p.evaluate(() => KoboPlatform.rankValue('minigolf')) === sv.under, sv.under);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function resume(env) {
  console.log('3. autosave: reload mid-hole, and mid-roll');
  const s = await open(env, { seed: DONE });
  const p = s.page;
  await p.click('.ct[data-course="0"]');
  await p.evaluate(() => __minigolf.freeze(true));
  for (const id of ['1-1', '1-2']) { await replay(p, id); await waitResult(p); await p.click('#hNext'); }
  await drag(p, -95, 0.3);
  let x = await settle(p);
  const before = { x: x.x, y: x.y, strokes: x.strokes, tick: x.tick, card: x.card };
  check('hole 1-3 after one stroke, 2 holes on the card', x.hole === '1-3' && x.strokes === 1 && x.card.length === 2, x);
  await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  check('title offers "continue: hole 3, stroke 2"', /ホール 3・2 打目/.test(await p.textContent('#tContinue')), await p.textContent('#tContinue'));
  await p.click('#tContinue');
  await p.evaluate(() => __minigolf.freeze(true));
  x = await st(p);
  check('continue: same hole, ball, strokes and card', x.hole === '1-3' && x.x === before.x && x.y === before.y && x.strokes === 1 && x.tick === before.tick && JSON.stringify(x.card) === JSON.stringify(before.card), { x, before });
  // a stroke, then the page closes while the ball is still rolling
  await p.evaluate(() => __minigolf.shoot(-90, 0.5));
  const run = await stored(p, RUN);
  check('the rolling stroke is saved with the position it was hit from', run && run.pend && run.snap.strokes === 1 && run.snap.x === before.x, run);
  const G = MG.restore(HOLES[2], run.snap); G.shoot(-90, 0.5); MG.settle(G);
  await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  await p.click('#tContinue');
  x = await st(p);
  check('after the reload the stroke counts and the ball is where it stopped', x.strokes === G.strokes && Math.abs(x.x - G.x) < 1e-9 && Math.abs(x.y - G.y) < 1e-9, { page: x, node: { s: G.strokes, x: G.x, y: G.y, st: G.st } });
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function practice(env) {
  console.log('4. practice: any hole, not recorded');
  const s = await open(env, { seed: ALL });
  const p = s.page;
  await p.click('#tPractice');
  check('practice: 3 course tabs and 9 holes', (await p.$$('.tab')).length === 3 && (await p.$$('.hb')).length === 9, null);
  await p.click('.tab[data-course="1"]');
  await shot(p, '4-practice');
  await p.click('.hb[data-hole="2-3"]');
  await p.evaluate(() => __minigolf.freeze(true));
  let x = await st(p);
  check('practice opens 2-3, no scorecard button', x.mode === 'practice' && x.hole === '2-3' && await p.isHidden('#cardBtn'), x);
  x = await replay(p, '2-3');
  await waitResult(p);
  check('sunk in practice: not counted in the records', x.won && !(x.save.stats.holes > 0), x.save.stats);
  await p.click('#hNext');
  x = await st(p);
  check('"Play again" restarts the same hole', x.hole === '2-3' && x.strokes === 0 && x.mode === 'practice', x);
  await p.evaluate(() => __kb.win()); await waitResult(p);
  await p.click('#hAlt');
  x = await st(p);
  check('"Next hole" goes to 2-4', x.hole === '2-4', x);
  check('practice leaves no saved round', (await stored(p, RUN)) === null, null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function daily(env) {
  console.log("5. today's hole");
  const s = await open(env, { seed: DONE });
  const p = s.page;
  const info = await p.evaluate(() => __minigolf.dailyInfo());
  const h = HOLES[info.hi];
  check("title shows today's hole", (await p.textContent('#tDaily')).includes(h.id), await p.textContent('#tDaily'));
  await p.click('#tDaily');
  await p.evaluate(() => __minigolf.freeze(true));
  let x = await st(p);
  check("today's hole opens " + h.id, x.mode === 'daily' && x.hole === h.id && x.dk === info.dk, x);
  x = await replay(p, h.id);
  await waitResult(p);
  const pts = Math.max(10, 100 * (h.par + 4 - x.strokes));
  check('points for the strokes, and today\'s best', (await p.textContent('#hSub')).includes(String(pts)) && (await p.textContent('#hNote')).includes(String(pts)), [await p.textContent('#hSub'), await p.textContent('#hNote')]);
  const rec = await p.evaluate(dk => KoboPlatform.daily.get(dk, 'minigolf'), info.dk);
  check('the platform recorded the daily', rec && rec.best === pts, rec);
  // another seed day gives the same hole for everyone
  const other = await p.evaluate(() => __minigolf.dailyInfo(20261225));
  check('the daily hole comes from the date seed', other.hi === (other.seed >>> 0) % HOLES.length, other);
  await shot(p, '5-daily');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function ink(env) {
  console.log('6. ink: one-stroke penalty, back to the start');
  const s = await open(env, { seed: ALL });
  const p = s.page;
  await p.evaluate(() => __minigolf.practice('3-1'));
  await p.evaluate(() => __minigolf.freeze(true));
  await drag(p, -90, 0.35);
  let x = await settle(p);
  check('ink: 2 strokes, back on the tee, a message', x.strokes === 2 && x.pen === 1 && x.x === HOLES[18].tee[0] && x.y === HOLES[18].tee[1] && /インク/.test(x.tip), x);
  await shot(p, '6-ink');
  await s.close();
}

async function pause(env) {
  console.log('7. pause while rolling');
  const s = await open(env, { seed: DONE });
  const p = s.page;
  await p.evaluate(() => __minigolf.course(0));
  await p.evaluate(() => __minigolf.shoot(-90, 0.9));
  await p.waitForTimeout(150);
  await p.evaluate(() => { KoboGame.pause('hidden'); });
  const a = await st(p); await p.waitForTimeout(400); const b = await st(p);
  check('hidden: the ball stops moving', a.st === 'roll' && a.tick === b.tick, [a.tick, b.tick, a.st]);
  await p.evaluate(() => { KoboGame.resume('hidden'); });
  await p.waitForTimeout(200);
  const c = await st(p);
  check('back: the menu waits for "Resume"', c.menuOpen && c.tick === b.tick, c);
  await p.click('.kb-layer .kb-btn--primary').catch(async () => { await p.keyboard.press('Escape'); });
  await p.waitForTimeout(300);
  const d = await st(p);
  check('after Resume it rolls on', d.tick > c.tick || d.st !== 'roll', [c.tick, d.tick, d.st]);
  await s.close();
}

async function touch(env) {
  console.log('8. touch: a real finger pull');
  const s = await open(env, { seed: DONE, touch: true, vp: 'se2' });
  const p = s.page;
  await p.evaluate(() => __minigolf.course(0));
  await p.evaluate(() => __minigolf.freeze(true));
  const cdp = await s.ctx.newCDPSession(p);
  const d = await p.evaluate(() => __minigolf.dragFor(-80, 0.5));
  const tp = (x, y, id = 1) => ({ x, y, id, radiusX: 4, radiusY: 4, force: 1 });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(d.x0, d.y0)] });
  for (let i = 1; i <= 6; i++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(d.x0 + (d.x1 - d.x0) * i / 6, d.y0 + (d.y1 - d.y0) * i / 6)] });
  const mid = await st(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  let x = await st(p);
  check('touch pull aims and shoots', mid.aim && Math.abs(mid.aim.a + 80) <= 2 && x.strokes === 1 && Math.abs(x.shots[0][1] + 80) <= 2 && Math.abs(x.shots[0][2] - 0.5) <= 0.04, { mid: mid.aim, shots: x.shots });
  await settle(p);
  // a second finger cancels
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(d.x0, d.y0)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(d.x0 + 30, d.y0 + 80)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(d.x0 + 30, d.y0 + 80), tp(d.x0 - 60, d.y0, 2)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  x = await st(p);
  check('a second finger cancels the shot', x.strokes === 1, x);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function english(env) {
  console.log('9. English: no Japanese anywhere we show');
  const s = await open(env, { lang: 'en', seed: ALL });
  const p = s.page;
  const scan = async (where) => { const jp = await p.evaluate(`(${jpScan})(true)`); check('en ' + where + ': no Japanese visible', jp.length === 0, jp.slice(0, 5)); };
  await scan('title'); await shot(p, '9-en-title');
  await p.click('#tPractice'); await scan('practice');
  await p.click('#pBack');
  await p.click('.ct[data-course="2"]');
  await p.evaluate(() => __minigolf.freeze(true));
  await scan('hole 3-1');
  await replay(p, '3-1'); await waitResult(p); await scan('hole result'); await shot(p, '9-en-result');
  await p.click('#hNext');
  await p.click('#cardBtn'); await scan('scorecard'); await shot(p, '9-en-card');
  await p.click('#cNext');
  await p.evaluate(() => __minigolf.howto()); await scan('how to play');
  await p.click('#howtoGo');
  await p.evaluate(() => __minigolf.menu()); await scan('menu');
  const miss = await p.evaluate(() => window.__jpMiss);
  check('every string through T() has an English entry', miss.length === 0, miss);
  await s.close();
}

async function layouts(env) {
  console.log('10. every screen size × ja/en');
  for (const vp of Object.keys(V.VIEWPORTS)) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang, seed: ALL });
    const p = s.page;
    await p.evaluate(() => __minigolf.course(1));
    await p.evaluate(() => __minigolf.freeze(true));
    await p.waitForTimeout(150);
    const mid = await drag(p, -90, 0.6);
    const m = await p.evaluate(() => {
      const r = el => { const b = document.getElementById(el).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height, r: b.right, b: b.bottom }; };
      return { W: innerWidth, H: innerHeight, bar: r('bar'), meter: r('meter'), card: r('cardBtn'), menu: r('menuBtn'), cv: r('board'), rot: __kb.state().rot, ps: __minigolf.view.s };
    });
    const inside = q => q.x >= -1 && q.y >= -1 && q.r <= m.W + 1 && q.b <= m.H + 1;
    check(`${vp} ${lang}: bar, meter, scorecard and menu on screen, ≥44 px`, [m.meter, m.card, m.menu].every(q => inside(q) && q.h >= 44) && m.card.w >= 44, m);
    check(`${vp} ${lang}: a real drag shoots`, mid.aim && Math.abs(mid.aim.a + 90) <= 1.5 && (await st(p)).strokes === 1, mid.aim);
    check(`${vp} ${lang}: the hole is big (${Math.round(m.ps)} px per unit${m.rot ? ', on its side' : ''})`, m.ps >= 24 && (m.W > m.H * 1.12 ? m.rot : !m.rot), m);
    const r = await p.evaluate(`(${layoutProbe})()`);
    check(`${vp} ${lang}: no sideways scroll, nothing off screen`, r.hscroll <= 1 && r.offscreen.length === 0, { h: r.hscroll, off: r.offscreen.slice(0, 3) });
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${vp} en: no Japanese`, jp.length === 0, jp.slice(0, 4)); }
    await shot(p, `10-${vp}-${lang}`);
    await settle(p);
    await p.evaluate(() => { __minigolf.G.strokes = 3; __kb.win(); });
    await waitResult(p); await p.waitForTimeout(450); // the card fades in
    let rr = await p.evaluate(`(${layoutProbe})()`);
    let pb = rr.primary.filter(x => x.problems.length || x.h < 44);
    check(`${vp} ${lang}: hole result buttons visible`, !pb.length && rr.primary.length > 0, pb.slice(0, 3));
    await p.click('#hNext');
    await p.click('#cardBtn'); await p.waitForTimeout(450);
    rr = await p.evaluate(`(${layoutProbe})()`);
    pb = rr.primary.filter(x => x.problems.length || x.h < 44);
    const tbl = await p.evaluate(() => { const t = document.querySelector('#cTable table').getBoundingClientRect(), c = document.querySelector('#ovCard .card').getBoundingClientRect(); return t.right <= c.right + 1 && t.left >= c.left - 1; });
    check(`${vp} ${lang}: scorecard fits and its button is visible`, !pb.length && tbl, pb.slice(0, 3));
    if (vp === 'se1' || vp === 'land') await shot(p, `10-${vp}-${lang}-card`);
    await s.close();
  }
}

async function perf(env) {
  console.log('11. performance on a hole with gears, rulers and pipes');
  const s = await open(env, { seed: ALL, vp: 'ip12' });
  const p = s.page;
  await p.evaluate(() => __minigolf.practice('3-9'));
  await p.evaluate(() => __minigolf.shoot(-80, 0.9));
  const fps = await p.evaluate(() => __minigolf.fps(2500));
  check(`3-9 rolling at ${fps} fps (swiftshader)`, fps >= 30, fps);
  await shot(p, '11-perf');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [first, round, resume, practice, daily, ink, pause, touch, english, layouts, perf]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
