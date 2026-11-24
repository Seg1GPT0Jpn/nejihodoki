#!/usr/bin/env node
// いろみず分けの通しプレイ（Playwright、?debug の window.__kb / __water。2D の canvas）
//   node tools/tests/water-play.js [normal,keyboard,chal,rules,sprint,marks,touch,compat,english,layouts]   … 全部で約2分
// 1. ふつう：ふつうのステージがこれまでどおり（保存・★・実績のイベント・進み具合のバー）。x の保存は作られない
// 2. キーボード：矢印・Enter・数字で本物のキー操作、U（戻す）・H（ヒント）・X（追加）・R（2回押し）・M（モード）・C（色の目印）・Esc
// 3. チャレンジ：モード選び・一覧と鍵・手数の上限・ボットが全12ステージを★3でクリア・★の保存（kusoge.water.x）・次が開く・practice 報告
// 4. ルール：ヒントなし／追加なし／道具なし・上限ぎれのカード・戻すと手数が戻る
// 5. スプリント：5問・ヒントで+10秒・ベストの保存（x.sp）・ふつうの保存は変わらない・practice
// 6. 色の目印：C と メニューで切り替え・保存・盤の絵が変わる
// 7. タッチ：本物のタップでモード選び・ステージ・注ぐ
// 8. 古い保存：water-level-only・こわれた x・古い形の保存が読める
// 9. 英語：日本語が残らない
// 10. 画面サイズ × ja/en × 明るい/暗い：横スクロールなし・ボタンが画面内
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const E = require('../../water/engine.js');

const OUT = path.join(__dirname, 'out', 'shots', 'water-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.water.save', X = 'kusoge.water.x', MARKS = 'kusoge.water.marks', HOWTO = 'kusoge.water.howto', TUT = 'kusoge.water.tut', CUR = 'kusoge.water.cur';
const SEED = { [SAVE]: JSON.stringify({ level: 5, best: 9, stars: { 1: 3, 2: 2 } }), [HOWTO]: '1', [TUT]: '1' };

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || SEED, isMobile: !!o.touch, hasTouch: !!o.touch });
  if (o.scheme) await s.page.emulateMedia({ colorScheme: o.scheme });
  await s.goto('/water/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready(), null, { timeout: 30000 });
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => localStorage.getItem(k), k);
const storedJ = async (p, k) => { const v = await stored(p, k); try { return JSON.parse(v); } catch (e) { return v; } };
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const vis = (p, sel) => p.isVisible(sel);
const pageOk = (s, name) => check(name || 'no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
const hook = p => p.evaluate(() => { window.__evlog = []; if (window.KoboGame) { const e = KoboGame.emit; KoboGame.emit = function (n, d) { window.__evlog.push([n, d && d.mode, d && d.reason]); return e.apply(this, arguments); }; } });
const events = p => p.evaluate(() => window.__evlog || []);
const key = (p, k) => p.keyboard.press(k);
const settle = p => p.waitForTimeout(900);
const waitFor = (p, fn, ms) => p.waitForFunction(fn, null, { timeout: ms || 9000 }).catch(() => {});
const cvHash = p => p.evaluate(() => { const c = document.getElementById('cv'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let h = 0; for (let i = 0; i < d.length; i += 7) h = (h * 31 + d[i]) | 0; return h; });
// the next solver move of the current puzzle: [from, to]
const nextMove = p => p.evaluate(() => { const h = __water.Engine.hintMove(__water.G); return h.move || null; });

async function normal(env) {
  console.log('1. regular stages still play');
  const s = await open(env), p = s.page;
  await hook(p);
  let x = await st(p);
  check('opens at the saved stage with its best and stars', x.mode === 'normal' && x.level === 5 && x.best === 9 && x.stars[1] === 3 && x.stage === 5, x);
  check('the progress bar is shown and starts empty', await vis(p, '#prog') && x.progress === 0, x);
  check('the stage list button and three tools are there', await vis(p, '#lvBtn') && await vis(p, '#hintBtn') && await vis(p, '#extraBtn') && !(await vis(p, '#modeBar')), {});
  await p.evaluate(() => __kb.step(8));
  await waitFor(p, () => !__kb.state().busy);
  x = await st(p);
  check('moves work and the bar follows the sorted tubes', x.moves === 8 || x.over, x);
  await p.evaluate(() => __kb.win());
  await waitFor(p, () => __kb.state().winShown);
  x = await st(p);
  check('clearing shows the win card with stars, level goes up', x.winShown && x.level === 6 && x.best === 9 && x.stars[5] >= 1 && x.stars[1] === 3, x);
  check('the card offers Next, Replay and Modes', await vis(p, '#nextBtn') && await vis(p, '#replayBtn') && await vis(p, '#winModes'), {});
  await shot(p, '1-win');
  const ev = await events(p);
  check('reported as normal play with stage_clear', ev.some(e => e[0] === 'stage_clear') && ev.filter(e => e[0] === 'play_start').every(e => e[1] === 'normal'), ev);
  check('no kusoge.water.x is created by regular play', (await stored(p, X)) === null, await stored(p, X));
  await p.click('#nextBtn'); await waitFor(p, () => __kb.state().stage === 6);
  check('Next goes to the next stage', (await st(p)).stage === 6, await st(p));
  pageOk(s); await s.close();
}

async function keyboard(env) {
  console.log('2. keyboard');
  const s = await open(env, { seed: { [SAVE]: JSON.stringify({ level: 3, best: 3, stars: {} }), [HOWTO]: '1', [TUT]: '1' } }), p = s.page;
  await key(p, 'ArrowRight');
  let x = await st(p);
  check('an arrow key shows the cursor', x.kbUsed && x.kc === 0, x);
  await key(p, 'ArrowRight'); await key(p, 'ArrowRight');
  check('arrows move it (and wrap with ArrowLeft)', (await st(p)).kc === 2, await st(p));
  await key(p, 'ArrowLeft'); await key(p, 'ArrowLeft'); await key(p, 'ArrowLeft');
  check('ArrowLeft wraps around', (await st(p)).kc === (await st(p)).tubes.length - 1, await st(p));
  const mv = await nextMove(p);
  await key(p, 'Digit' + (mv[0] + 1));
  x = await st(p);
  check('a number key lifts that tube', x.sel === mv[0], x);
  await key(p, 'Digit' + (mv[1] + 1)); await settle(p);
  x = await st(p);
  check('a second number key pours into the hinted tube', x.net === 1 && x.sel === -1, x);
  await key(p, 'KeyU');
  x = await st(p);
  check('U undoes the pour', x.net === 0, x);
  const mv2 = await nextMove(p);
  for (let i = 0; i < 12; i++) { if ((await st(p)).kc === mv2[0]) break; await key(p, 'ArrowRight'); }
  await key(p, 'Enter');
  check('Enter lifts the tube under the cursor', (await st(p)).sel === mv2[0], await st(p));
  for (let i = 0; i < 12; i++) { if ((await st(p)).kc === mv2[1]) break; await key(p, 'ArrowRight'); }
  await key(p, 'Space'); await settle(p);
  check('Space pours it', (await st(p)).net === 1, await st(p));
  await key(p, 'KeyU');
  await key(p, 'KeyH');
  check('H spends a hint', (await st(p)).hints === 1 && /ヒント|矢印/.test(await p.textContent('#toast')), { t: await p.textContent('#toast'), s: await st(p) });
  await key(p, 'KeyX');
  check('X adds the extra tube (once)', (await st(p)).extra === 1 && (await st(p)).tubes.length === E.generate(3).tubes.length + 1, await st(p));
  await key(p, 'KeyX');
  check('a second X does nothing', (await st(p)).tubes.length === E.generate(3).tubes.length + 1, {});
  await p.evaluate(() => __kb.step(2)); await settle(p);
  await key(p, 'KeyR');
  check('the first R only asks', (await st(p)).net === 2 && /R/.test(await p.textContent('#toast')), await st(p));
  await key(p, 'KeyR'); await waitFor(p, () => __kb.state().net === 0 && __kb.state().tubes);
  check('the second R restarts the stage', (await st(p)).net === 0 && (await st(p)).extra === 0, await st(p));
  await key(p, 'KeyM');
  check('M opens the mode picker with the key help', (await st(p)).modesShown && await vis(p, '#mdKeys'), await st(p));
  await key(p, 'ArrowDown');
  check('arrows move the focus in the picker', await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('mode-opt') && document.activeElement.id !== 'mdNormal'), await p.evaluate(() => document.activeElement && document.activeElement.id));
  await key(p, 'Escape');
  check('Esc closes the picker', !(await st(p)).modesShown, await st(p));
  await key(p, 'KeyC');
  check('C turns the color marks on and saves it', (await st(p)).marks === true && (await stored(p, MARKS)) === '1', await stored(p, MARKS));
  await key(p, 'KeyC');
  check('C again turns them off', (await st(p)).marks === false && (await stored(p, MARKS)) === '0', await stored(p, MARKS));
  await key(p, 'Escape');
  check('Esc with nothing open opens the menu', await p.evaluate(() => !!document.querySelector('.kb-layer')), {});
  await key(p, 'Escape');
  pageOk(s); await s.close();
}

async function chal(env) {
  console.log('3. challenge: bot clears all 12, stars saved, next unlocks, regular save untouched, reported as practice');
  const s = await open(env), p = s.page;
  await hook(p);
  const save0 = await stored(p, SAVE);
  await key(p, 'KeyM');
  check('the mode picker lists 4 modes with the challenge total', (await p.locator('.mode-opt').count()) === 4 && /0 \/ 36/.test(await p.textContent('#mdChalS')), await p.textContent('#mdChalS'));
  await shot(p, '3-modes');
  await key(p, 'Digit2');
  check('the number 2 opens the challenge list', (await st(p)).chalShown && (await p.locator('#chalList .lv.ch').count()) === 12, await st(p));
  check('only stage 1 is open on a fresh device', (await p.locator('#chalList .lv.ch:not(.locked)').count()) === 1, {});
  await shot(p, '3-list');
  await p.locator('#chalList .lv.ch.locked').first().click({ force: true });
  check('a locked stage only tells why', !(await st(p)).chal && /前のステージ/.test(await p.textContent('#toast')), await st(p));
  await p.click('#chalList .lv.ch:not(.locked)'); await waitFor(p, () => __kb.state().chal && __kb.state().tubes);
  let x = await st(p);
  const info = E.stageInfo(0);
  check('stage 1 starts: limit, par, mode bar and counter chip', x.mode === 'chal' && x.chal.idx === 0 && x.chal.limit === info.limit && x.chal.par === info.par && await vis(p, '#modeBar') && (await p.textContent('#chips')).includes('0 / ' + info.limit), x);
  await shot(p, '3-stage1');
  for (let i = 0; i < E.STAGE_N; i++) {
    x = await st(p);
    if (!(x.mode === 'chal' && x.chal.idx === i)) { check('stage ' + (i + 1) + ' is running', false, x); break; }
    await p.evaluate(() => __kb.win());
    await waitFor(p, () => __kb.state().winShown);
    x = await st(p);
    if (!(x.winShown && x.x.s[i] === 3 && x.net === E.stageInfo(i).par)) check('stage ' + (i + 1) + ' cleared with 3 stars in par moves', false, x);
    if (i === 0) {
      check('stage 1: win card shows stars, moves vs par and the unlock note', x.winShown && /ステージ1/.test(await p.textContent('#winText')) && /開いた/.test(await p.textContent('#winText')), await p.textContent('#winText'));
      await shot(p, '3-win');
      const sv = await stored(p, SAVE);
      check('the regular save is untouched by the challenge', sv === save0, sv);
    }
    if (i < E.STAGE_N - 1) { await p.click('#nextBtn'); await waitFor(p, n => __kb.state().chal && __kb.state().chal.idx === n && __kb.state().tubes && !__kb.state().winShown, 9000); await p.waitForFunction(n => __kb.state().chal && __kb.state().chal.idx === n && __kb.state().tubes, i + 1, { timeout: 9000 }).catch(() => {}); }
  }
  x = await st(p);
  const xj = await storedJ(p, X);
  check('all 12 stages cleared: x.s is all 3 in storage', xj && xj.v === 1 && xj.s.length === 12 && xj.s.every(v => v === 3), xj);
  check('the last stage card goes back to the list', /一覧/.test(await p.textContent('#nextBtn')), await p.textContent('#nextBtn'));
  const ev = await events(p);
  check('reported as practice only (no stage_clear, no best)', ev.filter(e => e[0] === 'play_start' || e[0] === 'play_end').every(e => e[1] === 'practice') && !ev.some(e => e[0] === 'stage_clear' || e[0] === 'best') && ev.filter(e => e[0] === 'play_end' && e[2] === 'clear').length === 12, ev.slice(0, 8));
  check('classic save still identical', (await stored(p, SAVE)) === save0, await stored(p, SAVE));
  await p.click('#nextBtn');
  check('Next on the last stage opens the list', (await st(p)).chalShown && (await p.locator('#chalList .lv.ch:not(.locked)').count()) === 12, await st(p));
  await key(p, 'Escape');
  pageOk(s); await s.close();
}

async function rules(env) {
  console.log('4. rules: tools off, move limit, undo gives moves back');
  const all = JSON.stringify({ v: 1, s: new Array(12).fill(1), sp: 0 });
  const s = await open(env, { seed: Object.assign({}, SEED, { [X]: all }) }), p = s.page;
  await p.evaluate(() => __kb.chalStart(1)); await waitFor(p, () => __kb.state().tubes && __kb.state().chal && __kb.state().chal.idx === 1);
  check('stage 2 (no extra tube): the + button is off and says so', await p.evaluate(() => document.getElementById('extraBtn').disabled) && !(await p.evaluate(() => document.getElementById('hintBtn').disabled)), await p.textContent('#extraLeft'));
  await key(p, 'KeyX');
  check('X does nothing there', (await st(p)).extra === 0, {});
  await p.evaluate(() => __kb.chalStart(3)); await waitFor(p, () => __kb.state().chal && __kb.state().chal.idx === 3 && __kb.state().tubes);
  check('stage 4 (no hints): the hint button is off', await p.evaluate(() => document.getElementById('hintBtn').disabled) && !(await p.evaluate(() => document.getElementById('extraBtn').disabled)), {});
  await key(p, 'KeyH');
  check('H spends nothing there', (await st(p)).hints === 0, await st(p));
  await p.evaluate(() => __kb.chalStart(11)); await waitFor(p, () => __kb.state().chal && __kb.state().chal.idx === 11 && __kb.state().tubes);
  check('stage 12 (no tools): both are off', await p.evaluate(() => document.getElementById('hintBtn').disabled && document.getElementById('extraBtn').disabled), {});
  // move limit
  await p.evaluate(() => __kb.chalStart(0)); await waitFor(p, () => __kb.state().chal && __kb.state().chal.idx === 0 && __kb.state().tubes);
  await p.evaluate(() => __kb.chalLimit(3));
  await p.evaluate(() => __kb.step(2)); await settle(p);
  let x = await st(p);
  check('2 pours: 2 / 3 in the chip and the chip is highlighted', x.net === 2 && (await p.textContent('#chips')).includes('2 / 3') && await p.evaluate(() => !!document.querySelector('#chips .chip.g')), await p.textContent('#chips'));
  await key(p, 'KeyU'); await key(p, 'KeyU');
  check('undo gives the moves back (net 0)', (await st(p)).net === 0, await st(p));
  await p.evaluate(() => __kb.step(3)); await waitFor(p, () => __kb.state().stuckShown, 4000);
  x = await st(p);
  check('using the last move shows the out-of-moves card', x.net === 3 && x.stuckShown && /手数ぎれ/.test(x.stuckTitle) && !(await vis(p, '#stExtra')), x);
  await shot(p, '4-limit');
  await p.click('#stClose');
  await p.evaluate(() => { const m = __water.Engine.hintMove(__water.G).move; __water.tap(m[0]); __water.tap(m[1]); });
  check('a 4th pour is refused', (await st(p)).net === 3 && /上限/.test(await p.textContent('#toast')), { net: (await st(p)).net, t: await p.textContent('#toast') });
  await p.click('#stUndo').catch(() => {}); await key(p, 'KeyU');
  check('after undo it can go on', (await st(p)).net <= 2, await st(p));
  await p.evaluate(() => __kb.lose());
  await p.click('#stRestart');
  await waitFor(p, () => __kb.state().chal && __kb.state().net === 0 && __kb.state().tubes);
  check('Restart rebuilds the stage with its real limit', (await st(p)).chal.limit === E.stageInfo(0).limit && (await st(p)).net === 0, await st(p));
  pageOk(s); await s.close();
}

async function sprint(env) {
  console.log('5. sprint: 5 puzzles, hint +10 s, best saved apart from the regular save');
  const s = await open(env), p = s.page;
  await hook(p);
  const save0 = await stored(p, SAVE);
  await key(p, 'KeyM');
  check('the picker shows "no record yet"', /まだ記録なし/.test(await p.textContent('#mdSprintS')), await p.textContent('#mdSprintS'));
  await key(p, 'Digit3'); await waitFor(p, () => __kb.state().mode === 'sprint' && __kb.state().tubes);
  let x = await st(p);
  check('sprint starts at puzzle 1 / 5 with the clock bar', x.mode === 'sprint' && x.sprint.idx === 0 && await vis(p, '#modeBar') && /\/ 5/.test(await p.textContent("#lvBtn")) && !(await vis(p, '#mstars')), x);
  await shot(p, '5-sprint');
  await key(p, 'KeyH');
  check('a hint costs +10 s (shown on the hint button)', (await st(p)).sprint.hints === 1 && /10/.test(await p.textContent('#hintLeft')), await p.textContent('#hintLeft'));
  for (let i = 0; i < 5; i++) {
    await p.evaluate(() => __kb.win());
    if (i < 4) { await p.waitForFunction(n => __kb.state().sprint && __kb.state().sprint.idx === n + 1 && __kb.state().tubes && !__kb.state().won, i, { timeout: 9000 }).catch(() => {}); }
  }
  await waitFor(p, () => __kb.state().sprintShown, 9000);
  x = await st(p);
  check('after the 5th puzzle the result card shows', x.sprintShown && x.sprint.done && x.sprint.idx === 5, x);
  const xj = await storedJ(p, X);
  check('the time (with the +10 s) is the best in x.sp and the card shows it', xj && xj.sp === x.sprint.total && x.sprint.total >= 10000 && (await p.textContent('#spBest')).length > 0, { xj, x: x.sprint });
  check('new best is celebrated', await vis(p, '#spNew'), {});
  await shot(p, '5-result');
  const ev = await events(p);
  check('reported as practice only', ev.filter(e => e[0] === 'play_start' || e[0] === 'play_end').every(e => e[1] === 'practice') && !ev.some(e => e[0] === 'stage_clear' || e[0] === 'best'), ev);
  check('regular save untouched', (await stored(p, SAVE)) === save0, await stored(p, SAVE));
  const best1 = xj.sp;
  await p.click('#spAgain'); await waitFor(p, () => __kb.state().sprint && __kb.state().sprint.idx === 0 && __kb.state().tubes && !__kb.state().sprintShown);
  await key(p, 'KeyX'); await key(p, 'KeyH'); await key(p, 'KeyH');
  check('a second try starts over with fresh counts', (await st(p)).sprint.idx === 0 && (await st(p)).sprint.hints === 2 && (await st(p)).sprint.extra === 1, await st(p));
  for (let i = 0; i < 5; i++) {
    await p.evaluate(() => __kb.win());
    if (i < 4) await p.waitForFunction(n => __kb.state().sprint && __kb.state().sprint.idx === n + 1 && __kb.state().tubes && !__kb.state().won, i, { timeout: 9000 }).catch(() => {});
  }
  await waitFor(p, () => __kb.state().sprintShown, 9000);
  x = await st(p);
  check('a slower run (2 hints + extra tube = +35 s) keeps the old best', x.sprint.total > best1 && (await storedJ(p, X)).sp === best1 && !(await vis(p, '#spNew')), { x: x.sprint, best1 });
  await p.click('#spModes');
  check('Modes from the result card opens the picker', (await st(p)).modesShown, await st(p));
  pageOk(s); await s.close();
}

async function marksTest(env) {
  console.log('6. color marks');
  const s = await open(env), p = s.page;
  await p.evaluate(() => __kb.step(3)); await settle(p);
  const h0 = await cvHash(p);
  await key(p, 'KeyC'); await p.waitForTimeout(150);
  const h1 = await cvHash(p);
  check('marks change what is drawn', h0 !== h1, { h0, h1 });
  await shot(p, '6-marks');
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready(), null, { timeout: 30000 });
  check('the setting survives a reload', (await st(p)).marks === true, await st(p));
  await p.evaluate(() => __kb.menu());
  await p.click('.kb-layer button:has-text("色の目印")');
  check('the menu entry turns them off', (await st(p)).marks === false && (await stored(p, MARKS)) === '0', await stored(p, MARKS));
  pageOk(s); await s.close();
}

async function touch(env) {
  console.log('7. touch');
  const s = await open(env, { touch: true }), p = s.page;
  await p.tap('#lvBtn');
  check('tapping the stage button opens the list', (await st(p)).levelsShown, await st(p));
  await p.tap('#lvModes');
  check('the list has a way to the modes', (await st(p)).modesShown, await st(p));
  await p.tap('#mdChal');
  check('tapping Challenge opens its list', (await st(p)).chalShown, await st(p));
  await p.tap('#chalList .lv.ch:not(.locked)'); await waitFor(p, () => __kb.state().chal && __kb.state().tubes);
  let x = await st(p);
  check('tapping stage 1 starts it', x.mode === 'chal' && x.chal.idx === 0, x);
  const mv = await nextMove(p);
  const a = await p.evaluate(i => __kb.tubeXY(i), mv[0]), b = await p.evaluate(i => __kb.tubeXY(i), mv[1]);
  await p.touchscreen.tap(a[0], a[1]);
  check('a tap lifts the tube', (await st(p)).sel === mv[0], await st(p));
  await p.touchscreen.tap(b[0], b[1]); await settle(p);
  check('a second tap pours', (await st(p)).net === 1, await st(p));
  await p.tap('#undoBtn');
  check('tapping Undo gives the move back', (await st(p)).net === 0, await st(p));
  await p.tap('#hintBtn');
  check('tapping Hint works', (await st(p)).hints === 1, await st(p));
  await p.tap('#lvBtn');
  check('in a challenge the stage button opens the challenge list', (await st(p)).chalShown, await st(p));
  pageOk(s); await s.close();
}

async function compat(env) {
  console.log('8. old / broken saves');
  let s = await open(env, { seed: { [SAVE]: JSON.stringify({ level: 7 }), [HOWTO]: '1', [TUT]: '1' } }), p = s.page;
  let x = await st(p);
  check('a save with only level still loads (best >= level) and x is empty', x.level === 7 && x.best >= 7 && x.x.s.every(v => v === 0) && x.x.sp === 0, x);
  check('the ranking value is as before', (await storedJ(p, SAVE)).best >= 7, await stored(p, SAVE));
  pageOk(s); await s.close();
  s = await open(env, { seed: Object.assign({}, SEED, { [X]: '{broken' }) }); p = s.page;
  x = await st(p);
  check('a broken x loads as empty and the regular game is intact', x.best === 9 && x.x.s.every(v => v === 0), x);
  await p.evaluate(() => __kb.chalList());
  check('only stage 1 is open', (await p.locator('#chalList .lv.ch:not(.locked)').count()) === 1, {});
  pageOk(s); await s.close();
  s = await open(env, { seed: Object.assign({}, SEED, { [X]: JSON.stringify({ v: 1, s: [3, 2, 'x', 9, -1], sp: 'oops', extra: 1 }) }) }); p = s.page;
  x = await st(p);
  check('a damaged x keeps its good part and ignores the rest', x.x.s.slice(0, 5).join() === '3,2,0,0,0' && x.x.sp === 0, x.x);
  await p.evaluate(() => __kb.chalList());
  check('stage 3 is open (stage 2 has stars), stage 4 is not', (await p.evaluate(() => [...document.querySelectorAll('#chalList .lv.ch')].map(b => !b.classList.contains('locked')).join())) === 'true,true,true,false,false,false,false,false,false,false,false,false', {});
  await p.evaluate(() => __kb.chalStart(1)); await waitFor(p, () => __kb.state().chal && __kb.state().tubes);
  await p.evaluate(() => __kb.win()); await waitFor(p, () => __kb.state().winShown);
  const xj = await storedJ(p, X);
  check('clearing writes a clean x without lowering the old stars', xj.v === 1 && xj.s[0] === 3 && xj.s[1] >= 2 && xj.s.length === 12 && !('extra' in xj), xj);
  pageOk(s); await s.close();
  // the saved in-progress stage of the regular game is picked up as before
  const cur = { v: 1, L: 4, log: '' };
  s = await open(env, { seed: Object.assign({}, SEED, { [SAVE]: JSON.stringify({ level: 4, best: 4, stars: {} }), [CUR]: JSON.stringify(Object.assign(cur, { log: (() => { const pz = E.generate(4), g = E.newGame(pz); E.pour(g, pz.sol[0][0], pz.sol[0][1]); return g.log; })() })) }) }); p = s.page;
  check('the saved regular stage in progress is restored (1 pour)', (await st(p)).net === 1, await st(p));
  pageOk(s); await s.close();
  s = await open(env, { seed: {} }); p = s.page;
  check('a first visit still shows the how-to', (await st(p)).howto, await st(p));
  pageOk(s); await s.close();
}

async function english(env) {
  console.log('9. english');
  const s = await open(env, { lang: 'en', seed: Object.assign({}, SEED, { [X]: JSON.stringify({ v: 1, s: new Array(12).fill(2), sp: 61234 }) }) }), p = s.page;
  const scan = async name => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${name}: no Japanese`, jp.length === 0, jp.slice(0, 4)); };
  await scan('regular');
  await p.evaluate(() => __kb.modes()); await scan('mode picker');
  await p.evaluate(() => __kb.chalList()); await scan('challenge list');
  for (const i of [0, 1, 3, 11]) {
    await p.evaluate(i => __kb.chalStart(i), i); await waitFor(p, i => __kb.state().chal && __kb.state().chal.idx === i && __kb.state().tubes, 9000);
    await scan('stage ' + (i + 1) + ' HUD');
  }
  await p.evaluate(() => { __kb.chalStart(0); }); await waitFor(p, () => __kb.state().chal && __kb.state().tubes);
  await p.evaluate(() => __kb.win()); await waitFor(p, () => __kb.state().winShown); await scan('stage clear card');
  await p.evaluate(() => { __kb.chalStart(0); }); await waitFor(p, () => __kb.state().chal && __kb.state().tubes && !__kb.state().winShown);
  await p.evaluate(() => { __kb.chalLimit(1); __kb.step(1); }); await waitFor(p, () => __kb.state().stuckShown, 4000); await scan('out-of-moves card');
  await p.evaluate(() => __kb.sprintStart()); await waitFor(p, () => __kb.state().sprint && __kb.state().tubes); await scan('sprint HUD');
  for (let i = 0; i < 5; i++) { await p.evaluate(() => __kb.win()); if (i < 4) await p.waitForFunction(n => __kb.state().sprint.idx === n + 1 && __kb.state().tubes && !__kb.state().won, i, { timeout: 9000 }).catch(() => {}); }
  await waitFor(p, () => __kb.state().sprintShown, 9000); await scan('sprint result');
  await key(p, 'KeyC');
  pageOk(s); await s.close();
}

async function layouts(env) {
  console.log('10. layouts');
  const seed = Object.assign({}, SEED, { [X]: JSON.stringify({ v: 1, s: [3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], sp: 61234 }) });
  for (const [vp, lang, scheme] of [['se1', 'ja', 'dark'], ['ip12', 'en', 'light'], ['p8', 'ja', 'light'], ['land', 'en', 'dark']]) {
    const tag = `${vp}/${lang}/${scheme}`;
    const s = await open(env, { vp, lang, scheme, seed }), p = s.page;
    let r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} regular: fits`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 3), h: r.hscroll });
    await p.evaluate(() => __kb.modes());
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} mode picker: reachable`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 3), pr: r.primary.filter(x => x.problems.length).slice(0, 2) });
    await shot(p, `10-${vp}-${lang}-picker`);
    await p.evaluate(() => __kb.chalList());
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} challenge list: reachable`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 3), pr: r.primary.filter(x => x.problems.length).slice(0, 2) });
    await shot(p, `10-${vp}-${lang}-list`);
    await p.evaluate(() => __kb.chalStart(2)); await waitFor(p, () => __kb.state().chal && __kb.state().tubes);
    await p.evaluate(() => { __kb.step(3); }); await p.waitForTimeout(900);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} challenge HUD fits`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 3) });
    const small = r.small.filter(t => !/kvs-entry/.test(t));
    check(`${tag} challenge HUD: every control is at least 44px`, small.length === 0, small.slice(0, 4));
    await shot(p, `10-${vp}-${lang}-stage`);
    await p.evaluate(() => __kb.win()); await waitFor(p, () => __kb.state().winShown);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} win card: buttons reachable`, r.hscroll <= 1 && r.primary.every(x => x.problems.length === 0), r.primary.filter(x => x.problems.length).slice(0, 2));
    await shot(p, `10-${vp}-${lang}-card`);
    await p.evaluate(() => __kb.sprintStart()); await waitFor(p, () => __kb.state().sprint && __kb.state().tubes);
    await p.evaluate(() => __kb.step(2)); await p.waitForTimeout(900);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} sprint HUD fits`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 3) });
    for (let i = 0; i < 5; i++) { await p.evaluate(() => __kb.win()); if (i < 4) await p.waitForFunction(n => __kb.state().sprint.idx === n + 1 && __kb.state().tubes && !__kb.state().won, i, { timeout: 9000 }).catch(() => {}); }
    await waitFor(p, () => __kb.state().sprintShown, 9000);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} sprint result: buttons reachable`, r.hscroll <= 1 && r.primary.every(x => x.problems.length === 0), r.primary.filter(x => x.problems.length).slice(0, 2));
    await shot(p, `10-${vp}-${lang}-sprint`);
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${tag} no Japanese`, jp.length === 0, jp.slice(0, 4)); }
    pageOk(s, `${tag} no page errors`); await s.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [normal, keyboard, chal, rules, sprint, marksTest, touch, compat, english, layouts]) {
    const nm = f === marksTest ? 'marks' : f.name;
    if (only && !only.includes(nm)) continue;
    try { await f(env); } catch (e) { check(nm + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const failN = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - failN}  fail ${failN}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(failN ? 1 : 0);
})();
