#!/usr/bin/env node
// ころころ工房の通しプレイ（Playwright。?debug の window.__physics で「どこを押すか」だけを聞き、押す・引っぱるのは本物のマウス／タッチ）
//   node tools/tests/physics-play.js [first,edit,pinch,solve,stars,resume,pause,english,layouts,perf]   … 全部で約3分
// 1. 初回：遊び方 → 1-1 のチュートリアル（板をトレイから光る場所へドラッグ → まわす → スタート → ゴール → 星3つ）
// 2. 編集：ドラッグで置く・持ち手でまわす・動かす・元に戻す・どける・ガラスの上は置けない・タップで置く・グリッドを切る
// 3. 2本指でまわす（CDP のタッチ）
// 4. 解く：全48レベルの答えをページのエンジンで流し、node と同じハッシュ／3つはスタートを押して本当の時間で解く
// 5. 星：結果の星・タイトルの星・次のレベルが開く・ランキングの値
// 6. 自動保存：置いた部品が再読み込みで戻る・「つづきから」
// 7. 一時停止：隠すと止まり、戻ると「つづける」まで止まったまま
// 8. 英語：遊び方・タイトル・盤・結果に日本語が残らない
// 9. 全画面サイズ × ja/en：トレイ・ボタン・部品の道具が画面内で44px以上、横スクロールなし
// 10. 性能：にぎやかなレベルを動かして swiftshader の fps
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const SOL = require('./physics-solutions.js');
const PE = require('../../physics/engine.js');
const { LEVELS } = require('../../physics/levels.js');

const OUT = path.join(__dirname, 'out', 'shots', 'physics-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.physics.save', RUN = 'kusoge.physics.run';
const SEEN = { 'kusoge.physics.howto': '1' };
const DONE = Object.assign({}, SEEN, { [SAVE]: JSON.stringify({ v: 1, lv: {}, stars: 0, done: 0, stats: {}, tut: 1 }) });
const ALLOPEN = Object.assign({}, SEEN, { [SAVE]: JSON.stringify({ v: 1, lv: Object.fromEntries(LEVELS.map(L => [L.id, { c: 1, g: 0, p: 0, b: 9, t: 9000 }])), stars: 48, done: 48, stats: {}, tut: 1 }) });
const I18N_WATCH = `(() => { let k = null; window.__jpMiss = [];
  Object.defineProperty(window, 'KoboI18n', { configurable: true, get() { return k; }, set(v) {
    k = v; if (!v || !v.t) return; const t = v.t;
    v.t = function (s, vars) { const r = t(s, vars); if (v.lang === 'en' && /[\\u3040-\\u30ff\\u3400-\\u9fff]/.test(r) && !window.__jpMiss.includes(s)) window.__jpMiss.push(s); return r; };
  } }); })();`;
const parts = id => SOL[id].map(q => ({ t: q[0], x: q[1], y: q[2], a: q[3] }));

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || {}, isMobile: !!o.touch, hasTouch: !!o.touch });
  if (o.lang === 'en') await s.page.addInitScript(I18N_WATCH);
  await s.goto('/physics/?debug');
  await s.page.waitForFunction(() => window.__kb && __kb.ready());
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const pt = (p, x, y) => p.evaluate(([x, y]) => __physics.boardPoint(x, y), [x, y]);
async function dragFromTray(p, t, x, y) { // real mouse: press on the tray button, move over the board, release
  const a = await p.evaluate(t => __physics.trayPoint(t), t), b = await pt(p, x, y);
  await p.mouse.move(a.x, a.y); await p.mouse.down();
  await p.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  await p.mouse.move(b.x, b.y, { steps: 6 });
  await p.mouse.up();
}
async function dragTo(p, from, to) { await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(to.x, to.y, { steps: 8 }); await p.mouse.up(); }
async function waitDone(p, ms) { await p.waitForFunction(() => __kb.state().done !== 0, null, { timeout: ms || 30000 }); return st(p); }

async function first(env) {
  console.log('1. first visit: how to play → tutorial on 1-1 with real drags and clicks');
  const s = await open(env);
  const p = s.page;
  let x = await st(p);
  check('first visit shows how to play', x.howto && !x.title, x);
  await shot(p, '1-howto');
  await p.click('#howtoGo');
  x = await st(p);
  check('1-1 opens with the tutorial (step 0: drag the board)', x.level === '1-1' && x.tut === 0 && /板/.test(x.tip), x);
  check('the tray points at the board', !!(await p.$('.tp.hint[data-part="plank"]')));
  const g = (await p.evaluate(() => __physics.LV[0].tut[0]));
  await shot(p, '1-tut0');
  await dragFromTray(p, 'plank', g.x + 0.3, g.y - 0.2);
  x = await st(p);
  check('dropped near the ghost: it snaps onto it, tutorial step 1 (tilt it)', x.parts.length === 1 && x.parts[0].x === g.x && x.parts[0].y === g.y && x.parts[0].a === 0 && x.tut === 1 && x.ptools, x);
  check('tray count went down', /0/.test(await p.textContent('.tp[data-part="plank"] b')));
  await shot(p, '1-tut1');
  // the rotate button turns it 15°: the ghost is at -15°
  await p.click('#rotR');
  x = await st(p);
  check('rotate right → -15°, step 2 (press Start)', x.parts[0].a === -15 && x.tut === 2, x);
  await p.click('#goBtn');
  x = await st(p);
  check('Start runs the simulation (step 3)', x.mode === 'run' && x.tut === 3, x);
  await p.click('#ffBtn');
  x = await waitDone(p);
  check('the yarn ball reaches the basket', x.won, x);
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  x = await st(p);
  check('result: 3 stars (goal, gears, parts)', x.last && x.last.r.n === 3 && (await p.$$('#rStars i.on')).length === 3, x.last);
  check('tutorial done and saved', x.tut === null && x.save.tut === 1 && x.save.lv['1-1'].c === 1 && x.save.stars === 3, x.save);
  await shot(p, '1-result');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
  // a second visit: no how-to, the title
  const s2 = await open(env, { seed: SEEN });
  x = await st(s2.page);
  check('second visit: no how to play, the title', !x.howto && x.title, x);
  await s2.close();
}

async function edit(env) {
  console.log('2. editing with the mouse: place, rotate by the handle, move, undo, remove, glass, tap to place, grid');
  const s = await open(env, { seed: ALLOPEN });
  const p = s.page;
  await p.click('.lv[data-level="1-1"]').catch(() => {});
  await p.evaluate(() => __physics.open('1-2', []));
  await dragFromTray(p, 'plank', 6, 8);
  let x = await st(p);
  check('drag from the tray places a board (selected, tools shown)', x.parts.length === 1 && x.sel === 0 && x.ptools && x.parts[0].x === 6 && x.parts[0].y === 8, x.parts);
  // the handle
  const h = await p.evaluate(() => __physics.handlePoint(0));
  const c = await pt(p, 6, 8);
  const to = { x: c.x + (h.x - c.x) * 0.7, y: c.y - Math.abs(h.x - c.x) * 0.7 }; // up and to the right: +45°
  await dragTo(p, h, to);
  x = await st(p);
  check('dragging the handle rotates it (snapped to 15°)', x.parts[0].a === 45, x.parts[0]);
  // move it
  await dragTo(p, c, await pt(p, 4, 9));
  x = await st(p);
  check('dragging a part moves it', x.parts[0].x === 4 && x.parts[0].y === 9, x.parts[0]);
  await p.click('#undoBtn');
  x = await st(p);
  check('undo puts it back', x.parts[0].x === 6 && x.parts[0].y === 8, x.parts[0]);
  await p.click('#undoBtn');
  x = await st(p);
  check('undo again → angle 0', x.parts[0].a === 0, x.parts[0]);
  await p.mouse.click(c.x, c.y);
  await p.click('#delBtn');
  x = await st(p);
  check('🗑 removes it', x.parts.length === 0, x.parts);
  // a drop that just overlaps the wall is nudged next to it
  await dragFromTray(p, 'plank', 2.3, 5.2);
  x = await st(p);
  check('a drop onto the wall is nudged to a free spot next to it', x.parts.length === 1 && Math.abs(x.parts[0].y - 5.2) <= 0.75 && !(await p.evaluate(() => __physics.PE.validate(__physics.LV[1], __kb.state().parts))), x.parts);
  await p.click('#delBtn');
  // glass (1-3)
  await p.evaluate(() => __physics.open('1-3', []));
  const z = await p.evaluate(() => __physics.LV.find(L => L.id === '1-3').glass[0]);
  await dragFromTray(p, 'short', z[0] + z[2] / 2, z[1] + z[3] / 2);
  x = await st(p);
  check('dropping on glass is refused', x.parts.length === 0 && /ガラス/.test(x.tip), x);
  await shot(p, '2-glass');
  // a tap on a tray button places the part somewhere free
  await p.click('.tp[data-part="short"]');
  x = await st(p);
  check('a tap on the tray places it somewhere free', x.parts.length === 1 && !(await p.evaluate(() => __physics.PE.validate(__physics.LV.find(L => L.id === '1-3'), __kb.state().parts))), x.parts);
  check('the tray is empty now (button disabled)', await p.$eval('.tp[data-part="short"]', b => b.disabled));
  // grid off → free positions
  await p.click('#gridBtn');
  const q0 = (await st(p)).parts[0];
  const from = await pt(p, q0.x, q0.y), dest = await pt(p, q0.x + 0.37, q0.y + 1.13);
  await dragTo(p, from, dest);
  x = await st(p);
  check('grid off: placed off the 0.25 grid', !x.grid && Math.abs(x.parts[0].x * 4 - Math.round(x.parts[0].x * 4)) > 0.01, x.parts[0]);
  // clear (with the confirm when there are 2+ parts: one part goes at once)
  await p.click('#clearBtn');
  x = await st(p);
  check('clear removes everything', x.parts.length === 0, x.parts);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function pinch(env) {
  console.log('3. two fingers rotate the selected part (touch through CDP)');
  const s = await open(env, { seed: ALLOPEN, touch: true });
  const p = s.page;
  await p.evaluate(() => __physics.open('1-2', [{ t: 'plank', x: 6, y: 8, a: 0 }]));
  const c = await pt(p, 6, 8);
  await p.touchscreen.tap(c.x, c.y);
  let x = await st(p);
  check('a tap selects the part', x.sel === 0, x);
  const cdp = await p.context().newCDPSession(p);
  const R = 50, ang = d => d * Math.PI / 180;
  const tp = (a, id) => ({ x: c.x + Math.cos(ang(a)) * R * (id ? 1 : -1), y: c.y + Math.sin(ang(a)) * R * (id ? 1 : -1), id });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(0, 0)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [tp(0, 0), tp(0, 1)] });
  for (let a = 0; a >= -30; a -= 5) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [tp(a, 0), tp(a, 1)] });
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  await p.waitForTimeout(100);
  x = await st(p);
  check('two fingers turned it by 30° (counter-clockwise on screen)', x.parts[0].a === 30, x.parts[0]);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function solve(env) {
  console.log('4. every stored solution in the page engine (same hash as node); three solved in real time');
  const s = await open(env, { seed: ALLOPEN });
  const p = s.page;
  const node = {};
  for (const L of LEVELS) node[L.id] = PE.run(L, parts(L.id));
  const page = await p.evaluate(sol => { const out = {}; for (const id in sol) out[id] = __physics.headless(id, sol[id].map(q => ({ t: q[0], x: q[1], y: q[2], a: q[3] }))); return out; }, SOL);
  const diff = LEVELS.filter(L => !page[L.id] || page[L.id].hash !== node[L.id].hash || !page[L.id].win || page[L.id].n !== 3).map(L => L.id);
  check(`all ${LEVELS.length} solutions win with 3 stars in the browser, identical to node`, diff.length === 0, diff);
  for (const id of ['2-1', '3-2', '4-6']) {
    await p.evaluate(([id, ps]) => __physics.open(id, ps), [id, parts(id)]);
    await p.click('#goBtn'); await p.click('#ffBtn'); await p.click('#ffBtn');
    const x = await waitDone(p, 40000);
    check(`${id} solved by pressing Start (real time, 3× speed)`, x.won && x.gears === (LEVELS.find(L => L.id === id).gears.length), x);
    await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
    await shot(p, '4-' + id);
    await p.click('#rAgain');
  }
  // a miss returns to editing with the parts kept
  await p.evaluate(() => __physics.open('2-1', []));
  await p.click('#goBtn'); await p.click('#ffBtn');
  let x = await waitDone(p, 40000);
  check('no parts: it fails', x.done === -1, x);
  await p.waitForFunction(() => __kb.state().mode === 'edit', null, { timeout: 5000 });
  x = await st(p);
  check('a miss says so and goes back to editing', x.mode === 'edit' && /うまくいかなかった/.test(x.tip), x.tip);
  // stop in the middle puts everything back
  await p.evaluate(ps => __physics.load(ps), parts('2-1'));
  await p.click('#goBtn');
  await p.waitForTimeout(500);
  await p.click('#goBtn');
  x = await st(p);
  check('Stop puts the parts back where they were', x.mode === 'edit' && JSON.stringify(x.parts) === JSON.stringify(parts('2-1')), x.parts);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function stars(env) {
  console.log('5. stars: result, title, unlocking, ranking value, the best solution');
  const s = await open(env, { seed: DONE });
  const p = s.page;
  let x = await st(p);
  check('only 1-1 is open at first', !(await p.$eval('.lv[data-level="1-1"]', b => b.disabled)) && (await p.$eval('.lv[data-level="1-2"]', b => b.disabled)), null);
  await p.evaluate(() => __physics.open('1-2', []));
  // two stars: goal + gears, but too many parts? use the solution minus nothing → 3; then a worse run must not lower it
  await p.evaluate(ps => __physics.load(ps), parts('1-2'));
  x = await p.evaluate(() => __physics.finish());
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  x = await st(p);
  check('1-2: 3 stars recorded', x.save.lv['1-2'] && x.save.stars === 3 && x.save.done === 1, x.save);
  check('the solution is kept on this device', x.sols['1-2'] && x.sols['1-2'].n === 3, x.sols);
  await p.click('#rNext');
  x = await st(p);
  check('"Next level" opens 1-3', x.level === '1-3' && x.mode === 'edit', x);
  await p.evaluate(() => __physics.title());
  check('1-3 and 1-4 are open now (one level may be skipped)', !(await p.$eval('.lv[data-level="1-3"]', b => b.disabled)) && !(await p.$eval('.lv[data-level="1-4"]', b => b.disabled)) && (await p.$eval('.lv[data-level="1-5"]', b => b.disabled)));
  check('title shows the stars', /3/.test(await p.textContent('#tStars')) && /3\/36/.test(await p.textContent('.wt[data-world="0"]')));
  check('workshop 2 is locked', await p.$eval('.wt[data-world="1"]', b => b.disabled));
  const rank = await p.evaluate(() => window.KoboPlatform && KoboPlatform.rankValue ? KoboPlatform.rankValue('physics', k => localStorage.getItem(k)) : -1);
  check('ranking value = total stars', rank === 3, rank);
  await shot(p, '5-title');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function resume(env) {
  console.log('6. autosave: parts come back after a reload; continue');
  const s = await open(env, { seed: ALLOPEN });
  const p = s.page;
  await p.evaluate(() => __physics.open('2-6', []));
  await dragFromTray(p, 'spring', 3, 3);
  await dragFromTray(p, 'short', 8, 9);
  const before = (await st(p)).parts;
  await p.waitForTimeout(400);
  const run = await stored(p, RUN);
  check('the parts are saved for the level', run && run.cur === '2-6' && run.drafts['2-6'].length === 2, run);
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  let x = await st(p);
  check('after a reload: the title with "Continue 2-6"', x.title && /2-6/.test(await p.textContent('#tContinue')), x);
  await p.click('#tContinue');
  x = await st(p);
  check('continue: the same level with the same parts', x.level === '2-6' && JSON.stringify(x.parts) === JSON.stringify(before), { a: x.parts, b: before });
  await shot(p, '6-resume');
  await s.close();
}

async function pause(env) {
  console.log('7. pause: hidden → the simulation stops; back → waits for Resume');
  const s = await open(env, { seed: ALLOPEN });
  const p = s.page;
  await p.evaluate(ps => __physics.open('3-10', ps), parts('3-10'));
  await p.click('#goBtn');
  await p.waitForTimeout(400);
  const hide = h => p.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await hide(true);
  const a = (await st(p)).time;
  await p.waitForTimeout(1000);
  const b = (await st(p)).time;
  check('hidden: the simulation does not move', b - a < 50 && (await st(p)).paused, { a, b });
  await hide(false);
  await p.waitForTimeout(500);
  let x = await st(p);
  check('visible again: the pause menu waits for Resume', x.menuOpen && !!(await p.$('.kb-layer--pause:not([hidden])')), x);
  const c = x.time;
  await p.waitForTimeout(800);
  check('still stopped under the menu', (await st(p)).time - c < 50);
  await p.click('.kb-layer--pause:not([hidden]) .kb-btn--primary');
  await p.waitForTimeout(700);
  x = await st(p);
  check('Resume → it moves again', !x.menuOpen && x.time > c, x);
  await s.close();
}

async function english(env) {
  console.log('8. English: no Japanese on any screen');
  const s = await open(env, { lang: 'en' });
  const p = s.page;
  const scan = async where => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`en ${where}: no Japanese visible`, jp.length === 0, jp.slice(0, 5)); };
  await scan('how to play');
  await p.click('#howtoGo');
  await scan('tutorial');
  await shot(p, '8-en-tut');
  await p.evaluate(() => __physics.open('4-12', []));
  await p.click('.tp[data-part="magnet"]');
  await scan('level with a selected part');
  await dragFromTray(p, 'plank', 0.4, 6);
  await scan('a refused drop');
  await p.evaluate(ps => __physics.load(ps), parts('4-12'));
  await p.evaluate(() => __physics.finish());
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  await scan('result');
  await shot(p, '8-en-result');
  await p.click('#rLevels');
  await scan('level select');
  const miss = await p.evaluate(() => window.__jpMiss);
  check('every T() call had an English entry', miss.length === 0, miss);
  await s.close();
}

async function layouts(env) {
  console.log('9. every screen size × ja/en: tray, controls and part tools on screen and ≥44 px');
  for (const vp of Object.keys(V.VIEWPORTS)) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang, seed: ALLOPEN });
    const p = s.page;
    await p.evaluate(() => __physics.open('4-12', [{ t: 'plank', x: 6, y: 11.2, a: 0 }, { t: 'spring', x: 1.2, y: 1.2, a: 0 }]));
    const box = () => p.evaluate(() => {
      const b = el => { const r = el.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; };
      const els = [...document.querySelectorAll('#ctrl button, header .icon, header .back, #ptools:not([hidden]) button:not([hidden])')].map(e => [e.id || e.className, b(e)]);
      const tray = [...document.querySelectorAll('.tp')].map(e => b(e)), tb = b(document.getElementById('tray'));
      return { els, tray, tb, cv: b(document.getElementById('board')), W: innerWidth, H: innerHeight };
    });
    const bad = m => m.els.filter(([id, b]) => b.x < -1 || b.y < -1 || b.x + b.w > m.W + 1 || b.y + b.h > m.H + 1 || b.w < 44 || b.h < 44).map(([id, b]) => id + ' ' + JSON.stringify(b));
    let worst = [];
    for (const [x, y] of [[6, 11.2], [1.2, 1.2]]) { const c = await pt(p, x, y); await p.mouse.click(c.x, c.y); await p.waitForTimeout(150); worst = worst.concat(bad(await box())); }
    const m = await box();
    const trayOk = m.tray.every(t => t.w >= 44 && t.h >= 44) && m.tb.y + m.tb.h <= m.H + 1 && m.tb.x >= -1;
    const r = await p.evaluate(`(${layoutProbe})()`);
    check(`${vp} ${lang}: controls, tray and tools on screen and ≥44 px`, !worst.length && trayOk && r.hscroll <= 1, { worst: worst.slice(0, 4), trayOk, h: r.hscroll });
    check(`${vp} ${lang}: the board is big (${Math.round(m.cv.w)}×${Math.round(m.cv.h)})`, m.cv.w >= Math.min(250, m.W * 0.45) && m.cv.y >= -1 && m.cv.y + m.cv.h <= m.H + 1, m.cv);
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${vp} en: no Japanese`, jp.length === 0, jp.slice(0, 4)); }
    await shot(p, `9-${vp}-${lang}`);
    await p.evaluate(() => __kb.win());
    await p.waitForFunction(() => __kb.state().result, null, { timeout: 4000 });
    await p.waitForTimeout(500);
    const rr = await p.evaluate(`(${layoutProbe})()`);
    const rb = await p.evaluate(() => [...document.querySelectorAll('#ovResult .btn')].map(e => { const r = e.getBoundingClientRect(); return r.top >= 0 && r.bottom <= innerHeight + 1 && r.height >= 44; }));
    check(`${vp} ${lang}: result buttons visible`, rb.every(Boolean) && rr.hscroll <= 1, rb);
    await s.close();
  }
}

async function perf(env) {
  console.log('10. performance: a busy level running under swiftshader');
  const s = await open(env, { seed: ALLOPEN, vp: 'ip12' });
  const p = s.page;
  await p.evaluate(ps => __physics.open('4-12', ps), parts('4-12'));
  // a crowd: every tray part placed somewhere, plus the solution
  await p.evaluate(() => __physics.open('3-12', [{ t: 'domino', x: 2, y: 1.3, a: 0 }, { t: 'domino', x: 2.8, y: 1.3, a: 0 }, { t: 'belt', x: 4, y: 7.6, a: 0 }, { t: 'spring', x: 9, y: 1, a: 0 }, { t: 'plank', x: 8, y: 10.5, a: 10 }]));
  await p.click('#goBtn');
  const fps = await p.evaluate(() => __physics.fps(2500));
  check(`running at ${fps} fps (swiftshader; 60 on phones)`, fps >= 30, fps);
  const t0 = Date.now(); await p.evaluate(() => { for (const L of __physics.LV) __physics.headless(L.id, []); });
  const ms = Date.now() - t0;
  check(`48 levels simulated headless in the page in ${ms} ms`, ms < 20000, ms);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [first, edit, pinch, solve, stars, resume, pause, english, layouts, perf]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
