#!/usr/bin/env node
// くるま出しの通しプレイ（Playwright、?debug の window.__kb / __parking。3D は WebGL）
//   node tools/tests/parking-play.js [normal,keyboard,missions,rules,rush,touch,compat,english,layouts]   … 全部で約3分
// 1. ふつう：ふつうのステージがこれまでどおり（保存・★・実績のイベント・進み具合のバー・出庫コンボ）。x の保存は作られない
// 2. キーボード：矢印で車を選ぶ・Enter／Space で発進・N・U・H・R（2回押し）・M・L・数字・Esc
// 3. ミッション：モード選び・一覧と鍵・ボットが全12ミッションを★3でクリア・★の保存（kusoge.parking.x）・次が開く・practice 報告・ふつうの保存は変わらない
// 4. ルール：ヒントなし／戻すなし／道具なし・手数の上限ぎれのカードと戻す
// 5. ラッシュ：時間・ロットが進む・ボーナス時間・時間切れの結果カード・ベストの保存（x.r）・ふつうの保存は変わらない・practice
// 6. タッチ：本物のタップでモード選び・車を走らせる
// 7. 古い保存：level だけの保存・こわれた x・とちゅうの駐車場が読める
// 8. 英語：日本語が残らない
// 9. 画面サイズ × ja/en × 明るい/暗い：横スクロールなし・ボタンが画面内
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const E = require('../../parking/engine.js');

const OUT = path.join(__dirname, 'out', 'shots', 'parking-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.parking.save', X = 'kusoge.parking.x', STATE = 'kusoge.parking.state', HOWTO = 'kusoge.parking.howto', TUT = 'kusoge.parking.tutorial';
const SEED = { [SAVE]: JSON.stringify({ level: 12, best: 14, stars: { 1: 3, 2: 2 } }), [HOWTO]: '1', [TUT]: '1' };

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || SEED, isMobile: !!o.touch, hasTouch: !!o.touch });
  if (o.scheme) await s.page.emulateMedia({ colorScheme: o.scheme });
  await s.goto('/parking/?debug' + (o.query || ''));
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
const waitFor = (p, fn, ms) => p.waitForFunction(fn, null, { timeout: ms || 9000 }).catch(() => {});
const settle = p => p.waitForTimeout(500);
// the cleared-lot card (and the end of the clear delay) shows up about 1.3 s after the last car leaves
const clearLot = async p => { await p.evaluate(() => __kb.win()); await waitFor(p, () => __kb.state().winShown, 6000); };

async function normal(env) {
  console.log('1. regular stages still play');
  const s = await open(env), p = s.page;
  await hook(p);
  let x = await st(p);
  check('opens at the saved stage with its best and stars', x.mode === 'normal' && x.stage === 12 && x.level === 12 && x.best === 14 && x.stars[1] === 3, x);
  check('the progress bar starts empty and the mode bar is hidden', x.alive > 0 && (await p.getAttribute('#prog', 'aria-valuenow')) === '0.00' && !(await vis(p, '#modeBar')), x);
  check('the four tools are there, the last one is Modes', await vis(p, '#undo') && await vis(p, '#hint') && await vis(p, '#restart') && (await p.textContent('#levels')).includes('モード'), {});
  const before = x.alive;
  await p.evaluate(() => __kb.step(4));
  x = await st(p);
  check('driving cars moves the bar and counts moves', x.alive < before && x.moves >= 4 && Number(await p.getAttribute('#prog', 'aria-valuenow')) > 0, x);
  check('cars leaving one after another make a combo', x.comboBest >= 2, x);
  await shot(p, '1-play');
  await p.evaluate(() => __kb.win());
  await waitFor(p, () => __kb.state().winShown);
  x = await st(p);
  check('clearing shows the win card, level goes up, stars are saved', x.winShown && x.level === 13 && x.best === 14 && x.stars[12] >= 1 && x.stars[1] === 3, x);
  check('the card offers Next, Replay and Modes', await vis(p, '#next') && await vis(p, '#again') && await vis(p, '#winModes'), {});
  const ev = await events(p);
  check('reported as normal play with stage_clear', ev.some(e => e[0] === 'stage_clear' && e[1] === 'normal') && ev.filter(e => e[0] === 'play_start').every(e => e[1] === 'normal'), ev);
  check('no kusoge.parking.x is created by regular play', (await stored(p, X)) === null, await stored(p, X));
  await p.click('#next'); await waitFor(p, () => __kb.state().stage === 13 && !__kb.state().winShown);
  check('Next goes to the next stage', (await st(p)).stage === 13, await st(p));
  pageOk(s); await s.close();
}

async function carToDrive(p) { return p.evaluate(() => __parking.solve().moves[0].i); }

async function keyboard(env) {
  console.log('2. keyboard');
  const s = await open(env, { seed: { [SAVE]: JSON.stringify({ level: 6, best: 6, stars: {} }), [HOWTO]: '1', [TUT]: '1' } }), p = s.page;
  await key(p, 'ArrowRight');
  let x = await st(p);
  check('an arrow key shows the cursor on a car', x.kbUsed && x.kbSel >= 0, x);
  const first = x.kbSel;
  await key(p, 'ArrowDown'); await key(p, 'ArrowLeft'); await key(p, 'ArrowUp');
  check('arrows move the cursor to other cars', (await st(p)).kbSel >= 0, await st(p));
  await key(p, 'KeyN');
  const seen = new Set([first]);
  for (let i = 0; i < 40; i++) { seen.add((await st(p)).kbSel); await key(p, 'KeyN'); }
  check('N cycles through every car', seen.size === (await st(p)).alive, { n: seen.size, a: (await st(p)).alive });
  const want = await carToDrive(p);
  for (let i = 0; i < 40 && (await st(p)).kbSel !== want; i++) await key(p, 'KeyN');
  check('the cursor can be put on the hinted car', (await st(p)).kbSel === want, await st(p));
  const a0 = (await st(p)).alive;
  await key(p, 'Enter'); await p.evaluate(() => __kb.flush());
  x = await st(p);
  check('Enter drives the car under the cursor', x.moves === 1 && x.alive <= a0, x);
  check('the cursor moved on to another car', x.kbSel !== want && x.kbSel >= 0, x);
  await key(p, 'KeyU');
  x = await st(p);
  check('U undoes it', x.moves === 0 && x.alive === a0 && x.undosLeft === 2, x);
  await key(p, 'KeyH');
  x = await st(p);
  check('H spends a hint and marks a car', x.hintsLeft === 2, x);
  await p.evaluate(() => __kb.step(2)); await settle(p);
  await key(p, 'KeyR');
  check('the first R only asks', (await st(p)).moves >= 1 && /R/.test(await p.textContent('#toast')), { t: await p.textContent('#toast'), s: await st(p) });
  await key(p, 'KeyR'); await p.waitForTimeout(300);
  check('the second R restarts the stage', (await st(p)).moves === 0, await st(p));
  await key(p, 'KeyM');
  check('M opens the mode picker with the key help', (await st(p)).modesShown && await vis(p, '#mdKeys'), await st(p));
  await key(p, 'ArrowDown');
  check('arrows move the focus in the picker', await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('mode-opt') && document.activeElement.id !== 'mdNormal'), await p.evaluate(() => document.activeElement && document.activeElement.id));
  await key(p, 'Escape');
  check('Esc closes the picker', !(await st(p)).modesShown, await st(p));
  await key(p, 'KeyL');
  check('L opens the stage list', (await st(p)).selectShown, await st(p));
  await key(p, 'Escape');
  await key(p, 'KeyM'); await key(p, 'Digit2');
  check('a number key in the picker opens the missions', (await st(p)).misShown, await st(p));
  await key(p, 'Escape');
  check('Esc closes the mission list', !(await st(p)).misShown, await st(p));
  await key(p, 'Escape');
  check('Esc with nothing open opens the menu', await p.evaluate(() => !!document.querySelector('.kb-layer, .kb-pause, [role=dialog]:not([hidden]):not(.overlay)')), {});
  await key(p, 'Escape');
  pageOk(s); await s.close();
}

async function missions(env) {
  console.log('3. missions');
  const s = await open(env), p = s.page;
  await hook(p);
  const saveBefore = await stored(p, SAVE);
  await p.click('#levels');
  check('the Modes button opens the picker with four modes', (await st(p)).modesShown && (await p.locator('#modes .mode-opt:visible').count()) === 4, await st(p));
  await shot(p, '3-modes');
  await p.click('#mdMis');
  check('Missions opens the list: only mission 1 is open', (await st(p)).misShown && (await p.locator('#misList .lvbtn.ms:not(.locked)').count()) === 1 && (await p.locator('#misList .lvbtn.ms').count()) === 12, await st(p));
  await shot(p, '3-list');
  await p.click('#misList .lvbtn.ms.locked >> nth=0').catch(() => {});
  check('a locked mission does not start', (await st(p)).mode === 'normal', await st(p));
  await p.click('#misList .lvbtn.ms:not(.locked)');
  let x = await st(p);
  check('mission 1 starts: mode bar, limit, rule', x.mode === 'mis' && x.mis.idx === 0 && await vis(p, '#modeBar') && /上限/.test(await p.textContent('#par')), x);
  const stateBefore = await stored(p, STATE);
  const seen = [];
  for (let i = 0; i < E.MISSION_N; i++) {
    if (i > 0) { await p.evaluate(i => __kb.misStart(i), i); await waitFor(p, i => __kb.state().mis && __kb.state().mis.idx === i && !__kb.state().over, 6000); }
    x = await st(p);
    const info = E.missionInfo(i);
    if (!(x.mode === 'mis' && x.mis.idx === i && x.mis.limit === info.limit && x.par === info.par)) check('mission ' + (i + 1) + ' starts as defined', false, { x, info: { limit: info.limit, par: info.par } });
    await p.evaluate(() => __kb.step(60));
    await waitFor(p, () => __kb.state().winShown, 7000);
    x = await st(p);
    seen.push(x.x.s[i]);
    if (!(x.winShown && x.x.s[i] === 3)) check('mission ' + (i + 1) + ' cleared with 3 stars by the solver', false, x);
  }
  check('the solver clears all 12 missions with 3 stars', seen.length === 12 && seen.every(v => v === 3), seen);
  const xj = await storedJ(p, X);
  check('kusoge.parking.x holds 12 stars and no rush score', xj && xj.v === 1 && xj.s.length === 12 && xj.s.every(v => v === 3) && !xj.r, xj);
  check('the regular save and the stage in progress are untouched', (await stored(p, SAVE)) === saveBefore && (await stored(p, STATE)) === stateBefore, { s: await stored(p, SAVE), t: await stored(p, STATE) });
  const ev = await events(p);
  check('missions are reported as practice, never as stage_clear', ev.some(e => e[0] === 'play_end' && e[1] === 'practice' && e[2] === 'clear') && !ev.some(e => e[0] === 'stage_clear') && ev.filter(e => e[0] === 'play_start').every(e => e[1] === 'practice'), ev.slice(0, 8));
  check('the last mission card says Mission list', (await p.textContent('#next')).includes('一覧'), await p.textContent('#next'));
  await shot(p, '3-win');
  await p.click('#winModes');
  check('the card leads back to the picker', (await st(p)).modesShown && !(await st(p)).winShown, await st(p));
  await p.click('#mdNormal');
  await waitFor(p, () => __kb.state().mode === 'normal');
  check('Regular stages from a mission goes back to the regular game', (await st(p)).mode === 'normal' && (await st(p)).stage === 12, await st(p));
  await key(p, 'KeyM'); await p.click('#mdNormal');
  check('Regular stages while in regular play opens the stage list', (await st(p)).selectShown, await st(p));
  await p.click('#selClose');
  await p.evaluate(() => __kb.normal());
  await waitFor(p, () => __kb.state().mode === 'normal');
  x = await st(p);
  check('back in the regular game at the saved stage', x.mode === 'normal' && x.stage === 12 && x.level === 12, x);
  check('the old saved lot is restored (no new key written by missions)', (await stored(p, STATE)) !== null, {});
  pageOk(s); await s.close();
}

async function rules(env) {
  console.log('4. mission rules and the move limit');
  const seed = Object.assign({}, SEED, { [X]: JSON.stringify({ v: 1, s: new Array(12).fill(1), r: 0 }) });
  let s = await open(env, { seed }), p = s.page;
  // mission 2: no hints
  await p.evaluate(() => __kb.misStart(1)); await waitFor(p, () => __kb.state().mis && __kb.state().mis.idx === 1);
  await key(p, 'KeyH');
  let x = await st(p);
  check('no-hint mission: H does nothing and the button is off', x.hintsLeft === 0 && (await p.isDisabled('#hint')) && /使えません/.test(await p.textContent('#toast')), { x, t: await p.textContent('#toast') });
  await p.evaluate(() => __kb.step(2));
  await key(p, 'KeyU');
  x = await st(p);
  check('no-hint mission: undo still works', x.moves === 1 || x.moves === 0, x);
  // mission 4: no undo
  await p.evaluate(() => __kb.misStart(3)); await waitFor(p, () => __kb.state().mis && __kb.state().mis.idx === 3);
  await p.evaluate(() => __kb.step(2));
  const m0 = (await st(p)).moves;
  await key(p, 'KeyU');
  x = await st(p);
  check('no-undo mission: U does nothing and the button is off', x.moves === m0 && (await p.isDisabled('#undo')) && x.hintsLeft === 3, x);
  // mission 12: no tools
  await p.evaluate(() => __kb.misStart(11)); await waitFor(p, () => __kb.state().mis && __kb.state().mis.idx === 11);
  check('no-tools mission: both tools are off', (await p.isDisabled('#undo')) && (await p.isDisabled('#hint')), {});
  // the limit
  await p.evaluate(() => __kb.misStart(0)); await waitFor(p, () => __kb.state().mis && __kb.state().mis.idx === 0);
  await p.evaluate(() => __kb.misLimit(3));
  check('the chip shows the limit', /3/.test(await p.textContent('#par')), await p.textContent('#par'));
  await p.evaluate(() => __kb.step(3));
  await waitFor(p, () => __kb.state().stuckShown, 4000);
  x = await st(p);
  check('using the last allowed move opens the out-of-moves card', x.stuckShown && x.moves === 3 && x.alive > 0, x);
  check('the moves chip warns', (await p.getAttribute('#moves', 'class')) === 'warn', await p.getAttribute('#moves', 'class'));
  await shot(p, '4-stuck');
  await p.evaluate(() => { const a = document.getElementById('stuckUndo'); a.click(); });
  x = await st(p);
  check('Undo gives a move back and closes the card', !x.stuckShown && x.moves === 2, x);
  await p.evaluate(() => __kb.step(1));
  await waitFor(p, () => __kb.state().stuckShown, 4000);
  await key(p, 'KeyR');
  await p.waitForTimeout(300);
  x = await st(p);
  check('R on the card restarts the mission', !x.stuckShown && x.moves === 0 && x.mis.idx === 0, x);
  // a beaten-down limit: the next move is refused
  await p.evaluate(() => __kb.misLimit(1)); await p.evaluate(() => __kb.step(1));
  await waitFor(p, () => __kb.state().stuckShown, 4000);
  await p.evaluate(() => document.getElementById('stuckRestart').click());
  check('stars follow the moves: mission 1 over par gives fewer stars than the solver', E.missionStars(0, E.missionInfo(0).star3) === 3 && E.missionStars(0, E.missionInfo(0).limit) === 1 && E.missionStars(0, E.missionInfo(0).limit + 1) === 0, {});
  pageOk(s); await s.close();
}

async function rush(env) {
  console.log('5. rush');
  const s = await open(env), p = s.page;
  await hook(p);
  const saveBefore = await stored(p, SAVE);
  await p.evaluate(() => __kb.modes()); await p.click('#mdRush');
  let x = await st(p);
  check('Rush starts with 90 s, lot 1, 0 points', x.mode === 'rush' && x.rush.k === 0 && x.rush.score === 0 && Math.round(x.rush.left) === 90 && x.hintsLeft >= 0, x);
  check('the mode bar shows time and score; hints are off', /1:30|1:29/.test(await p.textContent('#modeText')) && (await p.isDisabled('#hint')), await p.textContent('#modeText'));
  await shot(p, '5-rush');
  await p.waitForTimeout(1500);
  check('the clock runs', (await st(p)).rush.left < 89, await st(p));
  await p.evaluate(() => __kb.modes());
  const l0 = (await st(p)).rush.left; await p.waitForTimeout(1200);
  check('the clock waits while the picker is open', Math.abs((await st(p)).rush.left - l0) < 0.2, { a: l0, b: (await st(p)).rush });
  await key(p, 'Escape');
  await p.evaluate(() => __kb.step(60));
  await waitFor(p, () => __kb.state().rush && __kb.state().rush.cleared === 1, 6000);
  x = await st(p);
  check('clearing a lot adds points and time and the next lot loads', x.rush.cleared === 1 && x.rush.score >= 100 && x.rush.left > 90 && x.rush.left <= 105, x);
  await waitFor(p, () => __kb.state().rush.k === 1 && !__kb.state().over, 6000);
  x = await st(p);
  check('lot 2 is a bigger lot', x.rush.k === 1 && x.stage === E.rushLevel(1), x);
  await p.evaluate(() => __kb.rushAdvance(1000));
  await waitFor(p, () => __kb.state().rushShown, 4000);
  x = await st(p);
  check('time up: the result card shows score and saves the best in x.r', x.rushShown && x.rush.done && x.x.r === x.rush.score && x.x.r > 0, x);
  check('the card says new best', await vis(p, '#rresNew'), {});
  await shot(p, '5-result');
  const best = x.x.r;
  const xj = await storedJ(p, X);
  check('kusoge.parking.x has r and keeps the mission stars', xj.v === 1 && xj.r === best && xj.s.length === 12, xj);
  const ev = await events(p);
  check('rush is reported as practice (play_end with the score)', ev.some(e => e[0] === 'play_end' && e[1] === 'practice') && !ev.some(e => e[0] === 'stage_clear') && ev.filter(e => e[0] === 'play_start').every(e => e[1] === 'practice'), ev);
  check('the regular save is untouched', (await stored(p, SAVE)) === saveBefore, await stored(p, SAVE));
  // a worse run does not lower the best
  await p.click('#rresAgain');
  await waitFor(p, () => __kb.state().rush && !__kb.state().rush.done && __kb.state().rush.score === 0);
  await p.evaluate(() => __kb.rushAdvance(1000)); await waitFor(p, () => __kb.state().rushShown, 4000);
  x = await st(p);
  check('a zero run keeps the best and shows no "new best"', x.x.r === best && !(await vis(p, '#rresNew')), x);
  await key(p, 'KeyM');
  check('M on the card opens the picker', (await st(p)).modesShown && !(await st(p)).rushShown, await st(p));
  check('the picker shows the rush best', /\d/.test(await p.textContent('#mdRushS')) && (await p.textContent('#mdRushS')).includes(String(best)), await p.textContent('#mdRushS'));
  pageOk(s); await s.close();
  // the same seed gives the same lots
  const a = E.rushLot(777, 3), b = E.rushLot(777, 3);
  check('a rush seed gives the same lots every time', a.par === b.par && a.cars.length === b.cars.length && a.cars.map(c => c.x + ',' + c.y + ',' + c.d).join() === b.cars.map(c => c.x + ',' + c.y + ',' + c.d).join(), {});
}

async function touch(env) {
  console.log('6. touch');
  const s = await open(env, { touch: true }), p = s.page;
  await p.tap('#levels');
  check('tapping Modes opens the picker', (await st(p)).modesShown, await st(p));
  await p.tap('#mdMis');
  check('tapping Missions opens the list', (await st(p)).misShown, await st(p));
  await p.tap('#misList .lvbtn.ms:not(.locked)'); await waitFor(p, () => __kb.state().mode === 'mis');
  let x = await st(p);
  check('tapping mission 1 starts it', x.mode === 'mis' && x.mis.idx === 0, x);
  const i = await carToDrive(p), c = await p.evaluate(i => __parking.carScreen(i), i);
  await p.touchscreen.tap(c.x, c.y); await p.waitForTimeout(400);
  x = await st(p);
  check('a real tap drives the car', x.moves === 1, x);
  // a tap a little outside the car (a fat finger) still picks the nearest car
  const j = await carToDrive(p), cj = await p.evaluate(i => __parking.carScreen(i), j), ax = await p.evaluate(i => __parking.carAxis(i), j);
  const n = Math.hypot(ax.x, ax.y) || 1;
  await p.touchscreen.tap(cj.x - ax.y / n * 2 + ax.x / n * 3, cj.y + ax.x / n * 2); await p.waitForTimeout(400);
  check('a tap that grazes the car still drives it', (await st(p)).moves === 2, await st(p));
  await p.tap('#undo');
  check('tapping Undo gives the move back', (await st(p)).moves === 1, await st(p));
  await p.tap('#hint');
  check('tapping Hint works', (await st(p)).hintsLeft === 2, await st(p));
  check('no keyboard help on a touch screen', !(await vis(p, '#mdKeys')), {});
  pageOk(s); await s.close();
}

async function compat(env) {
  console.log('7. old / broken saves');
  let s = await open(env, { seed: { [SAVE]: JSON.stringify({ level: 7 }), [HOWTO]: '1', [TUT]: '1' } }), p = s.page;
  let x = await st(p);
  check('a save with only level still loads (best >= level) and x is empty', x.level === 7 && x.best >= 7 && x.x.s.every(v => v === 0) && x.x.r === 0, x);
  pageOk(s); await s.close();
  s = await open(env, { seed: Object.assign({}, SEED, { [X]: '{broken' }) }); p = s.page;
  x = await st(p);
  check('a broken x loads as empty and the regular game is intact', x.best === 14 && x.x.s.every(v => v === 0), x);
  await p.evaluate(() => __kb.misList());
  check('only mission 1 is open', (await p.locator('#misList .lvbtn.ms:not(.locked)').count()) === 1, {});
  pageOk(s); await s.close();
  s = await open(env, { seed: Object.assign({}, SEED, { [X]: JSON.stringify({ v: 1, s: [3, 2, 'x', 9, -1], r: 'oops', extra: 1 }) }) }); p = s.page;
  x = await st(p);
  check('a damaged x keeps its good part and ignores the rest', x.x.s.slice(0, 5).join() === '3,2,0,0,0' && x.x.r === 0, x.x);
  await p.evaluate(() => __kb.misList());
  check('mission 3 is open (mission 2 has stars), mission 4 is not', (await p.evaluate(() => [...document.querySelectorAll('#misList .lvbtn.ms')].map(b => !b.classList.contains('locked')).join())).startsWith('true,true,true,false,false'), {});
  await p.evaluate(() => __kb.misStart(1)); await waitFor(p, () => __kb.state().mis && __kb.state().mis.idx === 1);
  await p.evaluate(() => __kb.win()); await waitFor(p, () => __kb.state().winShown);
  const xj = await storedJ(p, X);
  check('clearing writes a clean x without lowering the old stars', xj.v === 1 && xj.s[0] === 3 && xj.s[1] >= 2 && xj.s.length === 12 && !('extra' in xj), xj);
  pageOk(s); await s.close();
  // the saved lot in progress of the regular game is picked up as before
  const lv = E.generate(5), stt = []; lv.cars.forEach(c => stt.push(c.x, c.y, c.d));
  stt[0] = -1;
  s = await open(env, { seed: { [SAVE]: JSON.stringify({ level: 5, best: 5, stars: {} }), [STATE]: JSON.stringify({ v: 1, n: 5, st: stt, moves: 1, undosLeft: 2, hintsLeft: 1 }), [HOWTO]: '1', [TUT]: '1' } }); p = s.page;
  x = await st(p);
  check('the saved regular lot in progress is restored (1 car gone, 1 move)', x.moves === 1 && x.alive === lv.cars.length - 1 && x.undosLeft === 2 && x.hintsLeft === 1, x);
  pageOk(s); await s.close();
  s = await open(env, { seed: {} }); p = s.page;
  check('a first visit still shows the how-to', (await st(p)).howto, await st(p));
  pageOk(s); await s.close();
}

async function english(env) {
  console.log('8. english');
  const s = await open(env, { lang: 'en', seed: Object.assign({}, SEED, { [X]: JSON.stringify({ v: 1, s: new Array(12).fill(2), r: 640 }) }) }), p = s.page;
  const scan = async name => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${name}: no Japanese`, jp.length === 0, jp.slice(0, 4)); };
  await scan('regular');
  await p.evaluate(() => __kb.modes()); await scan('mode picker');
  await p.evaluate(() => __kb.misList()); await scan('mission list');
  for (const i of [0, 1, 3, 11]) {
    await p.evaluate(i => __kb.misStart(i), i); await waitFor(p, i => __kb.state().mis && __kb.state().mis.idx === i, 9000);
    await scan('mission ' + (i + 1) + ' HUD');
  }
  await p.evaluate(() => __kb.misStart(0)); await p.evaluate(() => __kb.win()); await waitFor(p, () => __kb.state().winShown); await scan('mission clear card');
  await p.evaluate(() => { __kb.misStart(0); }); await waitFor(p, () => __kb.state().mis && !__kb.state().winShown);
  await p.evaluate(() => { __kb.misLimit(1); __kb.step(1); }); await waitFor(p, () => __kb.state().stuckShown, 4000); await scan('out-of-moves card');
  await p.evaluate(() => __kb.rushStart(5)); await waitFor(p, () => __kb.state().rush); await scan('rush HUD');
  await p.evaluate(() => { __kb.step(60); }); await waitFor(p, () => __kb.state().rush.cleared === 1, 6000);
  await p.evaluate(() => __kb.rushAdvance(1000)); await waitFor(p, () => __kb.state().rushShown, 4000); await scan('rush result');
  await p.evaluate(() => __kb.daily()); await waitFor(p, () => __kb.state().mode === 'daily'); await scan('daily');
  pageOk(s); await s.close();
}

async function layouts(env) {
  console.log('9. layouts');
  const seed = Object.assign({}, SEED, { [X]: JSON.stringify({ v: 1, s: [3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], r: 640 }) });
  for (const [vp, lang, scheme] of [['se1', 'ja', 'dark'], ['ip12', 'en', 'light'], ['p8', 'ja', 'light'], ['land', 'en', 'dark']]) {
    const tag = `${vp}/${lang}/${scheme}`;
    const s = await open(env, { vp, lang, scheme, seed }), p = s.page;
    let r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} regular: fits`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 3), h: r.hscroll });
    await p.evaluate(() => __kb.modes());
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} mode picker: reachable`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 3), pr: r.primary.filter(x => x.problems.length).slice(0, 2) });
    await shot(p, `9-${vp}-${lang}-picker`);
    await p.evaluate(() => __kb.misList());
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} mission list: reachable`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 3), pr: r.primary.filter(x => x.problems.length).slice(0, 2) });
    await shot(p, `9-${vp}-${lang}-list`);
    await p.evaluate(() => __kb.misStart(2)); await waitFor(p, () => __kb.state().mis && __kb.state().mis.idx === 2);
    await p.evaluate(() => { __kb.step(3); }); await p.waitForTimeout(900);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} mission HUD fits`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 3) });
    const small = r.small.filter(t => !/kvs-entry/.test(t));
    check(`${tag} mission HUD: every control is at least 44px`, small.length === 0, small.slice(0, 4));
    await shot(p, `9-${vp}-${lang}-mission`);
    await p.evaluate(() => __kb.misLimit(3)); await p.evaluate(() => __kb.step(1)); await waitFor(p, () => __kb.state().stuckShown, 4000);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} out-of-moves card: buttons reachable`, r.hscroll <= 1 && r.primary.every(x => x.problems.length === 0), r.primary.filter(x => x.problems.length).slice(0, 2));
    await p.evaluate(() => document.getElementById('stuckRestart').click());
    await p.evaluate(() => __kb.win()); await waitFor(p, () => __kb.state().winShown);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} win card: buttons reachable`, r.hscroll <= 1 && r.primary.every(x => x.problems.length === 0), r.primary.filter(x => x.problems.length).slice(0, 2));
    await shot(p, `9-${vp}-${lang}-card`);
    await p.evaluate(() => __kb.rushStart(9)); await waitFor(p, () => __kb.state().rush);
    await p.evaluate(() => __kb.step(2)); await p.waitForTimeout(900);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} rush HUD fits`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 3) });
    await shot(p, `9-${vp}-${lang}-rush`);
    await p.evaluate(() => __kb.rushAdvance(1000)); await waitFor(p, () => __kb.state().rushShown, 4000);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} rush result: buttons reachable`, r.hscroll <= 1 && r.primary.every(x => x.problems.length === 0), r.primary.filter(x => x.problems.length).slice(0, 2));
    await shot(p, `9-${vp}-${lang}-result`);
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
  for (const f of [normal, keyboard, missions, rules, rush, touch, compat, english, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const failN = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - failN}  fail ${failN}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(failN ? 1 : 0);
})();
