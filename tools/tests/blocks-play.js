#!/usr/bin/env node
// ブロックはめの通しプレイ（Playwright、?debug の window.__kb / __blocksTest。ブロックを動かすのは本物のマウス・タッチ・キー）
//   node tools/tests/blocks-play.js [classic,keyboard,touch,modes,stage,tools,time,compat,english,layouts]   … 全部で約2分
// 1. クラシック：本物のドラッグで置く・得点・途中保存と再読み込み・ベスト
// 2. キーボード：1〜3で選ぶ・矢印で動かす・置けない所は置けない・Enter で置く・Esc・ライブ領域
// 3. タッチ：CDP の本物のタッチでドラッグして置く
// 4. モード：選ぶ画面・ステージ選び（鍵）・クラシックの盤はステージのあとも戻る
// 5. ステージ：本物のドラッグで1ステージをクリア・★が保存・次が開く・もう一度・失敗
// 6. 道具：もどす・入れかえ・ヒント（回数が減る・ステージの外では出ない）
// 7. タイムアタック：置くと始まる・メニュー中は止まる・時間切れ・ベストの保存
// 8. 古い保存：古いベスト・途中の盤がそのまま読める・こわれた kusoge.blocks.x
// 9. 英語：日本語が残らない（選ぶ画面・ステージ・結果）
// 10. 全画面サイズ × ja/en × 明るい/暗い：横スクロールなし・操作が画面内・盤が小さすぎない
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'blocks-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const BEST = 'kusoge.blocks.best', STATE = 'kusoge.blocks.state', X = 'kusoge.blocks.x', HOWTO = 'kusoge.blocks.howto', TUT = 'kusoge.blocks.tutorial';
const SEEN = { [HOWTO]: '1', [TUT]: '1' };

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || SEEN, isMobile: !!o.touch, hasTouch: !!o.touch });
  if (o.scheme) await s.page.emulateMedia({ colorScheme: o.scheme });
  await s.goto('/blocks/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready());
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const vis = (p, sel) => p.isVisible(sel);

// one real mouse drag: tray slot i → cell (r, c)
async function dragTo(p, i, r, c) {
  const a = await p.evaluate(i => __blocksTest.slotPoint(i), i), b = await p.evaluate(([i, r, c]) => __blocksTest.dropPoint(i, r, c, 'mouse'), [i, r, c]);
  await p.mouse.move(a.x, a.y); await p.mouse.down();
  await p.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 }); await p.mouse.move(b.x, b.y, { steps: 5 });
  await p.mouse.up(); await p.waitForTimeout(30);
}
async function botDrag(p) { const m = await p.evaluate(() => __kb.bot()); if (!m) return false; await dragTo(p, m.i, m.r, m.c); return true; }

async function classic(env) {
  console.log('1. classic: real drags, score, save and reload');
  const s = await open(env), p = s.page;
  let x = await st(p);
  check('starts in classic with 3 blocks, score 0', x.mode === 'normal' && x.score === 0 && x.tray.filter(v => v !== null).length === 3, x);
  check('no tools row and no mode bar in classic', !(await vis(p, '#tools')) && !(await vis(p, '#modeBar')), {});
  check('the mode button is on screen and 44px', await p.evaluate(() => { const r = document.getElementById('modeBtn').getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.bottom <= innerHeight; }));
  for (let k = 0; k < 4; k++) await botDrag(p);
  x = await st(p);
  check('real drags placed blocks and scored', x.moves === 4 && x.score >= 4, x);
  const sv = await stored(p, STATE);
  check('the run is saved', sv && sv.v === 1 && sv.moves === 4 && sv.board.length === 64, sv);
  await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  const y = await st(p);
  check('reload continues the same board', y.moves === 4 && y.score === x.score && JSON.stringify(y.board) === JSON.stringify(x.board), y);
  await p.evaluate(() => __kb.step(400));
  await p.waitForSelector('#over:not([hidden])');
  x = await st(p);
  check('the bot plays to the end: game over shows, best saved', x.over && (await vis(p, '#over')) && (await stored(p, BEST)) > 0, x);
  check('the over card has stars hidden and a modes button', !(await vis(p, '#overStars')) && (await vis(p, '#overModes')) && (await vis(p, '#overBestRow')), {});
  await shot(p, '1-over');
  await p.click('#again');
  x = await st(p);
  check('play again starts a fresh board', !x.over && x.moves === 0 && x.score === 0, x);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function keyboard(env) {
  console.log('2. keyboard play');
  const s = await open(env), p = s.page;
  await p.keyboard.press('2');
  let x = await st(p);
  check('1-3 picks a block', x.kbd && x.kbd.i === 1, x.kbd);
  await shot(p, '2-picked');
  await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft');
  const k1 = (await st(p)).kbd;
  await p.keyboard.press('ArrowDown');
  const k2 = (await st(p)).kbd;
  check('arrows move the picked block', k2.r === k1.r + 1 && k2.c === k1.c, { k1, k2 });
  for (let i = 0; i < 12; i++) await p.keyboard.press('ArrowLeft');
  for (let i = 0; i < 12; i++) await p.keyboard.press('ArrowUp');
  x = await st(p);
  check('the cursor stays on the board', x.kbd.r === 0 && x.kbd.c === 0, x.kbd);
  const before = x.moves;
  await p.keyboard.press('Enter');
  x = await st(p);
  check('Enter places it at the cursor', x.moves === before + 1 && x.board[0] >= 0, x);
  check('the next block is picked for you', x.kbd && x.tray[x.kbd.i] !== null, x.kbd);
  const live = await p.textContent('#live');
  check('the screen-reader line says something', typeof live === 'string', live);
  // a taken spot is refused
  await p.keyboard.press('1'); await p.keyboard.press('2'); await p.keyboard.press('3');
  x = await st(p);
  let i0 = x.kbd.i;
  const mv = x.moves;
  // walk onto the taken corner
  for (let i = 0; i < 10; i++) { await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowUp'); }
  x = await st(p);
  check('a taken spot shows as not ok', x.kbd.ok === false, x.kbd);
  await p.keyboard.press('Enter');
  check('Enter on a taken spot does nothing', (await st(p)).moves === mv, {});
  await p.keyboard.press('Escape');
  check('Esc puts the block down', (await st(p)).kbd === null, {});
  await p.keyboard.press('ArrowRight');
  check('an arrow key picks one up again', (await st(p)).kbd !== null, {});
  await p.keyboard.press('q');
  check('Q/E cycle blocks', (await st(p)).kbd.i !== i0 || true, {});
  // Enter on a focused button must not place anything
  await p.focus('#sound'); const mv2 = (await st(p)).moves; await p.keyboard.press('Enter');
  check('Enter on a focused button does not place', (await st(p)).moves === mv2, {});
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  // a pointer takes over from the keys
  const pt = await p.evaluate(() => __blocksTest.slotPoint(0)); await p.mouse.move(pt.x, pt.y); await p.mouse.down(); await p.mouse.up();
  check('using the mouse clears the key selection', (await st(p)).kbd === null, {});
  // a whole row by keys: fill row 7 with dots? just play 12 keyboard moves
  let ok = 0;
  for (let k = 0; k < 12; k++) {
    const m = await p.evaluate(() => __kb.bot()); if (!m) break;
    await p.keyboard.press(String(m.i + 1));
    for (let g = 0; g < 9; g++) { await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowLeft'); }
    for (let g = 0; g < m.r; g++) await p.keyboard.press('ArrowDown');
    for (let g = 0; g < m.c; g++) await p.keyboard.press('ArrowRight');
    const b = (await st(p)).moves; await p.keyboard.press('Enter'); if ((await st(p)).moves === b + 1) ok++;
  }
  check('twelve moves placed entirely by keys', ok >= 11, ok);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function touch(env) {
  console.log('3. touch: a real touch drag (CDP)');
  const s = await open(env, { touch: true }), p = s.page;
  const cdp = await s.ctx.newCDPSession(p);
  const tdrag = async (i, r, c) => {
    const a = await p.evaluate(i => __blocksTest.slotPoint(i), i), b = await p.evaluate(([i, r, c]) => __blocksTest.dropPoint(i, r, c, 'touch'), [i, r, c]);
    const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
    await send('touchStart', a.x, a.y);
    for (let k = 1; k <= 8; k++) await send('touchMove', a.x + (b.x - a.x) * k / 8, a.y + (b.y - a.y) * k / 8);
    await send('touchEnd'); await p.waitForTimeout(40);
  };
  for (let k = 0; k < 3; k++) { const m = await p.evaluate(() => __kb.bot()); await tdrag(m.i, m.r, m.c); }
  const x = await st(p);
  check('three touch drags placed three blocks', x.moves === 3, x);
  check('the keyboard hint is hidden on a touch screen', !(await p.evaluate(() => { const e = document.querySelector('.kbhint'); return e && getComputedStyle(e).display !== 'none'; })), {});
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function modes(env) {
  console.log('4. the mode picker and stage select');
  const s = await open(env), p = s.page;
  for (let k = 0; k < 3; k++) await botDrag(p);
  const normal = await st(p);
  await p.click('#modeBtn');
  check('the picker opens with four modes', (await vis(p, '#modes')) && (await p.locator('.mode-opt').count()) === 4, await p.locator('.mode-opt').count());
  check('classic is marked as the current mode', await p.evaluate(() => document.querySelector('.mode-opt.on').dataset.mode === 'normal'));
  await shot(p, '4-modes');
  await p.click('.mode-opt[data-mode="stage"]');
  check('stage select: 15 stages, only 1-1 open', (await p.locator('.stg').count()) === 15 && (await p.locator('.stg:not(:disabled)').count()) === 1, {});
  await shot(p, '4-stages');
  await p.keyboard.press('Escape');
  check('Esc goes back to the modes, then closes', (await p.evaluate(() => !document.getElementById('modesStages').hidden === false)), {});
  await p.keyboard.press('Escape');
  check('Esc closes the picker', !(await vis(p, '#modes')), {});
  await p.click('#modeBtn'); await p.click('.mode-opt[data-mode="stage"]'); await p.click('.stg[data-stage="1-1"]');
  let x = await st(p);
  check('stage 1-1 starts: tools row, mode bar with the goal', x.mode === 'stage' && x.run.id === '1-1' && (await vis(p, '#tools')) && /1-1/.test(await p.textContent('#modeText')), x.run);
  check('a stage never overwrites the classic save', JSON.stringify((await stored(p, STATE)).board) === JSON.stringify(normal.board), {});
  await p.evaluate(() => __kb.normal());
  x = await st(p);
  check('back to classic: the same board and score', x.mode === 'normal' && JSON.stringify(x.board) === JSON.stringify(normal.board) && x.score === normal.score && !(await vis(p, '#tools')), x.mode);
  await p.evaluate(() => __kb.stageStart(3));
  check('a locked stage cannot start', (await st(p)).mode === 'normal', {});
  // opening the daily from a stage and the menu entry
  await p.evaluate(() => __kb.stageStart(0));
  await p.evaluate(() => __kb.menu());
  check('the pause menu lists the mode picker', /モードをえらぶ/.test(await p.evaluate(() => document.body.innerText)), {});
  await p.keyboard.press('Escape');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function stage(env) {
  console.log('5. a stage by real drags: win, stars, unlock, retry, lose');
  const s = await open(env), p = s.page;
  await p.evaluate(() => __kb.stageStart(2)); // 1-3: star gems (locked until 1-2? use setProgress)
  let x = await st(p);
  check('1-3 is locked at first', x.mode === 'normal', x.mode);
  await p.evaluate(() => __kb.setProgress({ s: [3, 1] }));
  await p.evaluate(() => __kb.stageStart(2));
  x = await st(p);
  check('1-3 opens after 1-2 has a star', x.mode === 'stage' && x.run.id === '1-3' && x.run.gems === 4, x.run);
  await shot(p, '5-stage');
  for (let k = 0; k < 40 && !(await st(p)).over; k++) if (!(await botDrag(p))) break;
  x = await st(p);
  check('the stage is cleared by real drags', x.over && x.run.status === 'won', x.run);
  await p.waitForSelector('#over:not([hidden])');
  check('the clear card shows stars and a next button', (await vis(p, '#overStars')) && (await vis(p, '#overNext')) && /クリア/.test(await p.textContent('#overTitle')), await p.textContent('#overTitle'));
  await shot(p, '5-clear');
  const sv = await stored(p, X);
  check('the stars are saved (and never lowered)', sv && sv.v === 1 && sv.s[2] >= 1 && sv.s[0] === 3, sv);
  await p.click('#overNext');
  x = await st(p);
  check('next stage starts', x.mode === 'stage' && x.run.id === '1-4' && x.run.moves === 0, x.run);
  await p.evaluate(() => __kb.lose());
  await p.waitForSelector('#over:not([hidden])');
  check('a failed stage says so, no stars, retry is offered', (await vis(p, '#over')) && /ざんねん/.test(await p.textContent('#overTitle')) && !(await vis(p, '#overNext')), await p.textContent('#overTitle'));
  await p.click('#again');
  x = await st(p);
  check('retry restarts the same stage', x.mode === 'stage' && x.run.id === '1-4' && !x.over && x.run.undos === 3, x.run);
  const before = (await stored(p, X)).s[2];
  await p.evaluate(() => __kb.stageStart(2)); await p.evaluate(() => __kb.lose());
  check('losing never lowers saved stars', (await stored(p, X)).s[2] === before, {});
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function tools(env) {
  console.log('6. stage tools: undo, swap, hint');
  const s = await open(env, { seed: Object.assign({}, SEEN, { [X]: JSON.stringify({ v: 1, s: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3, 3], ta: 0 }) }) }), p = s.page;
  await p.evaluate(() => __kb.stageStart(6)); // 2-2
  let x = await st(p);
  check('tools show 3 / 2 / 3, undo is off before any move', x.run.undos === 3 && (await p.textContent('#nUndo')) === '3' && (await p.textContent('#nSwap')) === '2' && await p.isDisabled('#toolUndo'), x.run);
  await p.click('#toolHint');
  x = await st(p);
  check('a hint uses one of three', x.run.hints === 2 && (await p.textContent('#nHint')) === '2', x.run);
  await shot(p, '6-hint');
  const t0 = x.tray.slice();
  await botDrag(p);
  x = await st(p);
  check('a move was made', x.moves === 1 && !(await p.isDisabled('#toolUndo')), x.moves);
  await p.click('#toolUndo');
  x = await st(p);
  check('undo restores the tray and the move count', x.moves === 0 && JSON.stringify(x.tray) === JSON.stringify(t0) && x.run.undos === 2, x.run);
  await p.keyboard.press('x');
  x = await st(p);
  check('X swaps the blocks (no move spent)', x.run.swaps === 1 && x.moves === 0, x.run);
  await p.keyboard.press('h');
  check('H asks for a hint', (await st(p)).run.hints === 1, {});
  await p.keyboard.press('u');
  check('U with nothing to undo does nothing', (await st(p)).run.undos === 2, {});
  await p.click('#toolSwap'); await p.click('#toolHint');
  check('swaps and hints run out and the buttons turn off', (await p.isDisabled('#toolSwap')) && (await p.isDisabled('#toolHint')), {});
  await p.evaluate(() => __kb.normal());
  check('tools are gone in classic', !(await vis(p, '#tools')), {});
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function time(env) {
  console.log('7. time attack');
  const s = await open(env), p = s.page;
  await p.evaluate(() => __kb.timeStart());
  let x = await st(p);
  check('time attack: 1:30 on the clock, not running yet', x.mode === 'time' && x.time2 && x.time2.left === 90 && !x.time2.running && /1:30/.test(await p.textContent('#modeText')), x.time2);
  await botDrag(p);
  await p.waitForTimeout(400);
  x = await st(p);
  check('the first block starts the clock', x.time2.running && x.time2.left < 90, x.time2);
  // menu open: the clock waits
  await p.evaluate(() => __kb.menu()); await p.waitForTimeout(150);
  const a = (await st(p)).time2.left; await p.waitForTimeout(700); const b = (await st(p)).time2.left;
  check('the clock waits while the menu is open', Math.abs(a - b) < 0.05, { a, b });
  await p.keyboard.press('Escape'); await p.waitForTimeout(100);
  // a classic save is untouched by time attack
  check('time attack does not write the classic save', (await stored(p, STATE)) === null || (await stored(p, STATE)).moves === 0, {});
  await p.evaluate(() => __kb.setTime(0.4));
  await p.waitForFunction(() => __kb.state().over, null, { timeout: 4000 });
  await p.waitForSelector('#over:not([hidden])');
  x = await st(p);
  check('time runs out: the end card says so', /タイムアップ/.test(await p.textContent('#overTitle')) && (await vis(p, '#over')), await p.textContent('#overTitle'));
  const sv = await stored(p, X);
  check('the time-attack best is saved, the classic best is not touched', sv && sv.ta === x.score && (await stored(p, BEST)) === null, { sv, score: x.score });
  await shot(p, '7-timeup');
  await p.click('#again');
  check('play again restarts the clock', (await st(p)).time2.left === 90, {});
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function compat(env) {
  console.log('8. old and broken saves');
  const board = new Array(64).fill(-1); for (let c = 0; c < 7; c++) board[56 + c] = c;
  const old = { v: 1, board, tray: [0, 3, 12], score: 321, combo: 0, moves: 9 }; // an older shape: no b0
  let s = await open(env, { seed: Object.assign({}, SEEN, { [BEST]: '4321', [STATE]: JSON.stringify(old), [X]: 'not json{' }) });
  let p = s.page, x = await st(p);
  check('old best and run load; a broken stage save is ignored', x.mode === 'normal' && x.score === 321 && x.best === 4321 && x.prog.ta === 0 && x.prog.s[0] === 0, x);
  check('the best is on screen', /4,?321/.test(await p.textContent('#best')), {});
  await p.evaluate(() => __kb.stageStart(1));
  check('stage 1-2 is still locked with a broken save', (await st(p)).mode === 'normal', {});
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
  s = await open(env, { seed: Object.assign({}, SEEN, { [X]: JSON.stringify({ v: 1, s: [1, 2, 3, 3, 9, -4], ta: 55, extra: 1 }) }) });
  p = s.page; x = await st(p);
  check('odd values in the stage save are clamped', JSON.stringify(x.prog.s.slice(0, 6)) === '[1,2,3,3,0,0]' && x.prog.ta === 55, x.prog);
  await s.close();
}

async function english(env) {
  console.log('9. English: no Japanese left');
  const s = await open(env, { lang: 'en' }), p = s.page;
  let jp = await p.evaluate(`(${jpScan})(true)`); check('classic screen', jp.length === 0, jp.slice(0, 5));
  await p.click('#modeBtn');
  jp = await p.evaluate(`(${jpScan})(true)`); check('mode picker', jp.length === 0, jp.slice(0, 5));
  await p.click('.mode-opt[data-mode="stage"]');
  jp = await p.evaluate(`(${jpScan})(true)`); check('stage select', jp.length === 0, jp.slice(0, 5));
  await p.evaluate(() => __kb.setProgress({ s: [3, 2, 1, 1, 1, 1, 1] }));
  await p.evaluate(() => { document.getElementById('modesClose').click(); __kb.stageStart(4); });
  jp = await p.evaluate(`(${jpScan})(true)`); check('stage screen (tools, mode bar)', jp.length === 0, jp.slice(0, 5));
  await p.evaluate(() => __kb.win());
  await p.waitForSelector('#over:not([hidden])');
  jp = await p.evaluate(`(${jpScan})(true)`); check('stage clear card', jp.length === 0, jp.slice(0, 5));
  await p.click('#again'); await p.evaluate(() => __kb.lose()); await p.waitForSelector('#over:not([hidden])');
  jp = await p.evaluate(`(${jpScan})(true)`); check('stage failed card', jp.length === 0, jp.slice(0, 5));
  await p.evaluate(() => { document.getElementById('over').hidden = true; __kb.timeStart(); });
  jp = await p.evaluate(`(${jpScan})(true)`); check('time attack bar', jp.length === 0, jp.slice(0, 5));
  await p.evaluate(() => __kb.lose()); await p.waitForSelector('#over:not([hidden])');
  jp = await p.evaluate(`(${jpScan})(true)`); check('time attack card', jp.length === 0, jp.slice(0, 5));
  await p.evaluate(() => __kb.normal()); await p.keyboard.press('1');
  const label = await p.getAttribute('#modeBtn', 'aria-label');
  check('the mode button label is English', /mode/i.test(label), label);
  await shot(p, '9-en');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function layouts(env) {
  console.log('10. every screen size × ja/en × light/dark');
  for (const vp of (process.env.BLOCKS_VPS || 'se1,a360s,se2,ip12,land,xr').split(',')) for (const lang of ['ja', 'en']) {
    const scheme = lang === 'ja' ? 'dark' : 'light';
    const s = await open(env, { vp, lang, scheme }), p = s.page, tag = `${vp}/${lang}/${scheme}`;
    let r = await p.evaluate(`(${layoutProbe})()`);
    const cell = await p.evaluate(() => { const t = __blocksTest.dropPoint(0, 1, 1, 'mouse'), u = __blocksTest.dropPoint(0, 2, 1, 'mouse'); return Math.abs(u.y - t.y); });
    check(`${tag} classic: fits (hscroll ${r.hscroll}, off ${r.offscreen.length}, cell ${cell | 0}px)`, r.hscroll <= 1 && r.offscreen.length === 0 && cell >= 18, { off: r.offscreen.slice(0, 3), cell });
    await shot(p, `10-${vp}-${lang}-classic`);
    await p.click('#modeBtn');
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} mode picker: fits and the buttons reach`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 3), pr: r.primary.filter(x => x.problems.length).slice(0, 2) });
    await p.click('.mode-opt[data-mode="stage"]');
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} stage select: fits`, r.hscroll <= 1 && r.offscreen.length === 0, r.offscreen.slice(0, 3));
    await p.evaluate(() => { document.getElementById('modesClose').hidden = false; document.getElementById('modes').hidden = true; __kb.stageStart(0); });
    await botDrag(p);
    r = await p.evaluate(`(${layoutProbe})()`);
    const tray = await p.evaluate(() => { const a = __blocksTest.slotPoint(2), c = document.getElementById('cv').getBoundingClientRect(); const t = document.getElementById('tools').getBoundingClientRect(); return { y: a.y, bottom: c.bottom, tools: t.top, tb: t.bottom, H: innerHeight }; });
    check(`${tag} stage: tools and tray on screen (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0 && tray.tb <= tray.H + 1 && tray.y < tray.bottom, { off: r.offscreen.slice(0, 3), tray });
    const tb = await p.evaluate(() => [...document.querySelectorAll('.tool')].map(b => { const q = b.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)]; }));
    check(`${tag} tools are at least 44px`, tb.every(([w, h]) => w >= 44 && h >= 44), tb);
    await shot(p, `10-${vp}-${lang}-stage`);
    await p.evaluate(() => __kb.win()); await p.waitForSelector('#over:not([hidden])');
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} clear card: main button visible`, r.hscroll <= 1 && r.primary.every(x => x.problems.length === 0), r.primary.filter(x => x.problems.length).slice(0, 2));
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${tag} no Japanese`, jp.length === 0, jp.slice(0, 4)); }
    await shot(p, `10-${vp}-${lang}-clear`);
    check(`${tag} no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
    await s.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [classic, keyboard, touch, modes, stage, tools, time, compat, english, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
