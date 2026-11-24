#!/usr/bin/env node
// おちものタワーの通しプレイ（Playwright、?debug の window.__kb。ピースを動かすのは本物のキー・マウス・CDP のタッチ）
//   node tools/tests/drop-play.js [classic,keyboard,touch,stages,sprint,compat,english,layouts]   … 全部で約2分
// 1. クラシック：本物のキーで動かす・回す・落とす・ため・途中保存からつづき・ベスト
// 2. キーボード：スタート画面の 1〜4・ステージ一覧を矢印で選ぶ・Esc・M で音
// 3. タッチ：CDP の本物のタッチ（タップで回転・横ドラッグで移動・下へサッと払う）と画面のボタン
// 4. ステージ：一覧（鍵）・ステージを遊んでクリア・★が保存・次が開く・もう一度・ピースぎれ・タワーいっぱい・クラシックの保存がそのまま
// 5. スプリント：20ライン・タイムとベストの保存・失敗
// 6. 古い保存：古いベスト・途中の盤がそのまま読める・こわれた kusoge.drop.x
// 7. 英語：日本語が残らない（スタート・ステージ・結果・ゲーム中）
// 8. 全画面サイズ × ja/en × 明るい/暗い：横スクロールなし・操作が画面内・盤が小さすぎない
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'drop-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const BEST = 'kusoge.drop.best', STATE = 'kusoge.drop.state', X = 'kusoge.drop.x', SEENK = 'kusoge.drop.seen', TUTK = 'kusoge.drop.tut';
const SEEN = { [SEENK]: '1', [TUTK]: '1' };

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || SEEN, isMobile: !!o.touch, hasTouch: !!o.touch });
  if (o.scheme) await s.page.emulateMedia({ colorScheme: o.scheme });
  await s.goto('/drop/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready());
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const vis = (p, sel) => p.isVisible(sel);
const waitOver = p => p.waitForSelector('#ovOver:not([hidden])', { timeout: 6000 });
const startClassic = async p => { await p.click('#startBtn'); await p.waitForFunction(() => __kb.state().phase === 'play'); };
const settleClear = p => p.evaluate(() => { const s = __kb.state(); return s.clearing; });

async function classic(env) {
  console.log('1. classic: real keys, hold, save and continue');
  const s = await open(env), p = s.page;
  let x = await st(p);
  check('starts on the title card with the tower empty', x.phase === 'title' && (await vis(p, '#ovStart')) && x.board.every(r => r === '.........'), x);
  check('the start card has the three modes and daily', (await vis(p, '#stagesBtn')) && (await vis(p, '#sprintBtn')) && (await vis(p, '#dailyBtn')), {});
  await startClassic(p);
  x = await st(p);
  check('playing: a piece is falling, the queue shows next pieces', x.phase === 'play' && !!x.cur && x.queue.length >= 3, x);
  const x0 = x.cur.x;
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft');
  x = await st(p);
  check('the arrow keys move the piece', x.cur.x === x0 - 2, [x0, x.cur.x]);
  const c0 = JSON.stringify(x.cur.cells);
  await p.keyboard.press('ArrowUp');
  x = await st(p);
  check('up rotates it', JSON.stringify(x.cur.cells) !== c0 || x.cur.t === 'O4', x.cur);
  const t0 = x.cur.t;
  await p.keyboard.press('KeyC');
  x = await st(p);
  check('C puts the piece on hold and the next one comes', x.hold && x.hold.t === t0 && x.cur.t !== undefined, x);
  const sc0 = x.score;
  await p.keyboard.press('Space');
  await p.waitForFunction(() => { const s = __kb.state(); return !s.clearing && s.score > 0; });
  x = await st(p);
  check('space drops it hard and scores', x.score > sc0 && x.board.some(r => r !== '.........'), x);
  for (let i = 0; i < 4; i++) await p.keyboard.press('Space');
  await p.evaluate(() => __kb.save());
  const sv = await stored(p, STATE);
  check('the run is saved (v1 normal snap)', sv && sv.v === 1 && sv.normal && sv.normal.board.length === 18 && sv.normal.score > 0, sv && Object.keys(sv));
  const scoreSaved = sv.normal.score;
  await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  check('reload shows Continue with the score', /つづき/.test(await p.textContent('#startLbl')) && (await vis(p, '#startSub')), await p.textContent('#startLbl'));
  await p.click('#startBtn');
  x = await st(p);
  check('continue restores the same score', x.phase === 'play' && x.score === scoreSaved && x.sub === null, x);
  await p.evaluate(() => __kb.step(400));
  await waitOver(p);
  x = await st(p);
  check('the bot plays to the end: game over card, best saved', x.over && (await stored(p, BEST)) > 0 && (await vis(p, '#goBestRow')) && !(await vis(p, '#goStars')), x);
  check('the over card offers modes and daily, not the stage list', (await vis(p, '#goMenu')) && (await vis(p, '#goAlt')) && !(await vis(p, '#goStages')), {});
  await shot(p, '1-over');
  await p.keyboard.press('Enter');
  await p.waitForTimeout(300);
  await p.keyboard.press('Enter');
  x = await st(p);
  check('Enter plays again', x.phase === 'play' && x.score === 0, x);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function keyboard(env) {
  console.log('2. keyboard on the menus');
  const s = await open(env), p = s.page;
  await p.keyboard.press('Digit2');
  check('2 opens the stage list', await vis(p, '#ovStages'), {});
  const f = await p.evaluate(() => document.activeElement && document.activeElement.dataset.i);
  check('focus is on stage 1-1', f === '0', f);
  await p.keyboard.press('ArrowRight');
  const f2 = await p.evaluate(() => document.activeElement.dataset.i);
  await p.keyboard.press('ArrowDown');
  const f3 = await p.evaluate(() => document.activeElement.dataset.i);
  check('the arrows move the focus over the grid', f2 === '1' && f3 === '5', [f2, f3]);
  check('a locked stage tells how to open it', /★/.test(await p.textContent('#stInfo')) && /前/.test(await p.textContent('#stInfo')), await p.textContent('#stInfo'));
  await p.keyboard.press('Enter');
  check('Enter on a locked stage does not start it', (await st(p)).phase === 'title', {});
  await p.keyboard.press('Escape');
  check('Escape goes back to the start card', (await vis(p, '#ovStart')) && !(await vis(p, '#ovStages')), {});
  await p.keyboard.press('Digit3');
  let x = await st(p);
  check('3 starts the sprint', x.phase === 'play' && x.sub === 'sprint', x);
  const muted0 = await p.evaluate(() => KoboAudio.muted);
  await p.keyboard.press('KeyM');
  check('M toggles the sound', (await p.evaluate(() => KoboAudio.muted)) !== muted0, {});
  await p.keyboard.press('KeyM');
  await p.keyboard.press('Escape');
  check('Escape pauses', (await st(p)).paused, {});
  await p.keyboard.press('Escape');
  await p.evaluate(() => __kb.lose());
  await waitOver(p);
  await p.keyboard.press('Escape');
  check('Escape on the result card goes back to the start card', await vis(p, '#ovStart'), {});
  await p.keyboard.press('Digit1');
  check('1 starts classic', (await st(p)).sub === null && (await st(p)).phase === 'play', {});
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function touch(env) {
  console.log('3. touch: real touches (CDP) and the buttons');
  const s = await open(env, { touch: true }), p = s.page;
  const cdp = await s.ctx.newCDPSession(p);
  await startClassic(p);
  const rect = await p.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.x, y: r.y, w: r.width, h: r.height }; });
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const cx = rect.x + rect.w * 0.3, cy = rect.y + rect.h * 0.5;
  // a tap rotates
  await p.evaluate(() => { __kb.setNext([{ t: 'T4', c: 0 }]); });
  let x = await st(p); const c0 = JSON.stringify(x.cur.cells);
  await send('touchStart', cx, cy); await send('touchEnd'); await p.waitForTimeout(60);
  x = await st(p);
  check('a tap rotates the piece', JSON.stringify(x.cur.cells) !== c0, x.cur);
  // a drag moves it
  const x1 = x.cur.x;
  await send('touchStart', cx, cy);
  for (let k = 1; k <= 6; k++) { await send('touchMove', cx + k * 14, cy); await p.waitForTimeout(16); }
  await send('touchEnd'); await p.waitForTimeout(60);
  x = await st(p);
  check('a horizontal drag moves it right', x.cur.x > x1, [x1, x.cur.x]);
  // a quick flick down hard-drops
  const sc = x.score;
  await send('touchStart', cx, cy);
  for (let k = 1; k <= 4; k++) { await send('touchMove', cx, cy + k * 30); await p.waitForTimeout(8); }
  await send('touchEnd'); await p.waitForTimeout(80);
  x = await st(p);
  check('a flick down drops it hard', x.score > sc + 10 && x.board.some(r => r !== '.........'), x.score);
  // the pad
  await p.waitForFunction(() => !__kb.state().clearing && __kb.state().cur);
  const bx = (await st(p)).cur.x;
  const box = await p.locator('#pad button[data-act="left"]').boundingBox();
  await send('touchStart', box.x + box.width / 2, box.y + box.height / 2); await send('touchEnd'); await p.waitForTimeout(60);
  check('the left button moves it', (await st(p)).cur.x === bx - 1, [bx, (await st(p)).cur.x]);
  const bs = await p.evaluate(() => [...document.querySelectorAll('#pad button')].map(b => { const r = b.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  check('every pad button is at least 44px', bs.every(([w, h]) => w >= 44 && h >= 44), bs);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function stages(env) {
  console.log('4. stages: list, play, stars, unlock, fail');
  const s = await open(env), p = s.page;
  await p.click('#stagesBtn');
  check('the stage list shows 12 stages in 3 worlds, only 1-1 open', (await p.locator('.sbtn').count()) === 12 && (await p.locator('.sbtn:not(.locked)').count()) === 1 && (await p.locator('.wtt').count()) === 3, {});
  await shot(p, '4-stages');
  await p.click('.sbtn[data-i="1"]', { force: true });
  check('a locked stage does not start', (await st(p)).phase === 'title' && (await vis(p, '#ovStages')), {});
  await p.click('.sbtn[data-i="0"]');
  let x = await st(p);
  check('1-1 starts: stage mode, goal shown, 24 pieces', x.sub === 'stage' && x.stageIdx === 0 && x.phase === 'play' && x.goal.need === 4 && x.goal.have === 0, x);
  check('the HUD shows the stage, the goal and the pieces left', (await p.textContent('#hBest')) === '1-1' && (await p.textContent('#hLevel')) === '0/4' && (await p.textContent('#hLines')) === '24', [await p.textContent('#hBest'), await p.textContent('#hLevel'), await p.textContent('#hLines')]);
  await shot(p, '4-stage-play');
  await p.keyboard.press('Space');
  await p.waitForFunction(() => __kb.state().placed === 1);
  await p.waitForFunction(() => document.getElementById('hLines').textContent === '23').catch(() => {});
  check('real keys place a piece and the count goes down', (await p.textContent('#hLines')) === '23', await p.textContent('#hLines'));
  // same pieces every time: stage 1-1 always starts with the same piece sequence
  const seq1 = await p.evaluate(() => { const s = __kb.state(); return [s.cur.t + s.cur.c].concat(s.queue.map(q => q.t + q.c)).join(); });
  await p.evaluate(() => __kb.startStage(0));
  const seq0 = await p.evaluate(() => { const s = __kb.state(); return [s.cur.t + s.cur.c].concat(s.queue.map(q => q.t + q.c)).join(); });
  await p.keyboard.press('Space'); await p.evaluate(() => __kb.startStage(0));
  const seq2 = await p.evaluate(() => { const s = __kb.state(); return [s.cur.t + s.cur.c].concat(s.queue.map(q => q.t + q.c)).join(); });
  check('a stage always deals the same pieces', seq0 === seq2 && seq1.length > 0, [seq0, seq2]);
  await p.evaluate(() => __kb.step(60));
  await waitOver(p);
  x = await st(p);
  check('the bot clears 1-1 within the limit: clear card with stars', x.over && (await vis(p, '#goStars')) && /ステージクリア/.test(await p.textContent('#goTitle')) && (await p.locator('#goStars .on').count()) >= 1, x);
  const prog = await stored(p, X);
  check('the stars are saved (kusoge.drop.x) and the next stage opens', prog && prog.v === 1 && prog.s[0] >= 1 && (await p.evaluate(() => __kb.progress().s[0])) === prog.s[0], prog);
  check('the clear card offers next / retry / stage list / modes', (await vis(p, '#againBtn')) && /つぎ/.test(await p.textContent('#againBtn')) && (await vis(p, '#goAlt')) && (await vis(p, '#goStages')) && (await vis(p, '#goMenu')), await p.textContent('#againBtn'));
  await shot(p, '4-stage-clear');
  check('stage play never touches the classic best or save', (await stored(p, BEST)) === null && (await stored(p, STATE)) === null, {});
  await p.keyboard.press('Enter'); await p.waitForTimeout(100); await p.keyboard.press('Enter');
  x = await st(p);
  check('Enter goes to the next stage (1-2)', x.sub === 'stage' && x.stageIdx === 1 && x.phase === 'play', x);
  // run out of pieces
  await p.evaluate(() => __kb.startStage(1));
  for (let i = 0; i < 40; i++) { const r = await p.evaluate(() => { const s = __kb.state(); if (s.phase !== 'play') return false; return s.placed; }); if (r === false) break; await p.keyboard.press('Space'); await p.waitForTimeout(25); }
  await waitOver(p);
  x = await st(p);
  check('dropping every piece in the middle ends the stage (full tower or no pieces)', x.over && /いっぱい|なくなった/.test(await p.textContent('#goTitle')) && !(await vis(p, '#goBestRow')), await p.textContent('#goTitle'));
  check('a failed stage keeps the old stars and offers retry', (await p.evaluate(() => __kb.progress().s[1])) === 0 && /もう一度/.test(await p.textContent('#againBtn')), {});
  await p.click('#goStages');
  check('the stage list opens from the result card with the next stage focused', (await vis(p, '#ovStages')) && (await p.evaluate(() => document.activeElement.dataset.i)) === '1', await p.evaluate(() => document.activeElement && document.activeElement.dataset.i));
  // a stage with rocks and a stage with a colour goal
  await p.evaluate(() => { __kb.setProgress({ s: [3, 3, 3, 3, 3, 3, 1, 1, 1, 1, 1, 1] }); __kb.startStage(6); });
  x = await st(p);
  check('2-3 has rocks (clear-the-rocks goal)', x.board.some(r => /4/.test(r)) && x.goal.need === (await p.evaluate(() => __kb.state().board.join('').split('4').length - 1)), x.goal);
  await shot(p, '4-stage-rocks');
  await p.evaluate(() => __kb.step(60)); await waitOver(p);
  check('the bot clears the rock stage', /ステージクリア/.test(await p.textContent('#goTitle')), await p.textContent('#goTitle'));
  await p.evaluate(() => __kb.startStage(2));
  x = await st(p);
  check('1-3 is a colour-match goal (soroi)', x.goal && x.goal.need === 1, x.goal);
  await p.evaluate(() => __kb.step(60)); await waitOver(p);
  check('the bot makes the Match Clear in 1-3', /ステージクリア/.test(await p.textContent('#goTitle')), await p.textContent('#goTitle'));
  // the classic run in progress is kept while stages are played
  await p.evaluate(() => __kb.showStages()); await p.click('#stBack');
  await startClassic(p); await p.keyboard.press('Space'); await p.evaluate(() => __kb.save());
  const sv = await stored(p, STATE);
  await p.evaluate(() => { __kb.startStage(0); });
  await p.evaluate(() => __kb.save());
  check('the classic save survives playing a stage', JSON.stringify(await stored(p, STATE)) === JSON.stringify(sv) && !!sv.normal, {});
  await p.keyboard.press('KeyP');
  check('pausing a stage shows the pause menu with the stage', (await st(p)).paused && /1-1/.test(await p.textContent('.pinfo')), await p.textContent('.pinfo').catch(() => ''));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function sprint(env) {
  console.log('5. sprint: 20 lines, time and best');
  const s = await open(env), p = s.page;
  await p.click('#sprintBtn');
  let x = await st(p);
  check('sprint starts: 20 lines to go', x.sub === 'sprint' && x.phase === 'play' && (await p.textContent('#hLines')) === '20', x);
  check('the HUD shows best "--" and the time', (await p.textContent('#hBest')) === '--' && /^\d+:\d\d\.\d$/.test(await p.textContent('#hLevel')), await p.textContent('#hLevel'));
  await p.evaluate(() => __kb.step(150));
  await waitOver(p);
  x = await st(p);
  const prog = await stored(p, X);
  check('the bot finishes 20 lines: clear card with a time, the best is saved', /クリア/.test(await p.textContent('#goTitle')) && /^\d+:\d\d\.\d$/.test(await p.textContent('#goScore')) && prog && prog.sp >= 1000, [await p.textContent('#goTitle'), await p.textContent('#goScore'), prog]);
  check('a first sprint is a new record', await vis(p, '#goNew'), {});
  check('sprint does not touch the classic best', (await stored(p, BEST)) === null, {});
  await shot(p, '5-sprint-clear');
  const sp1 = prog.sp;
  await p.evaluate(() => __kb.startSprint());
  await p.evaluate(() => __kb.lose()); await waitOver(p);
  check('losing the sprint shows lines and keeps the best', /いっぱい/.test(await p.textContent('#goTitle')) && (await stored(p, X)).sp === sp1 && /\/20/.test(await p.textContent('#goScore')), await p.textContent('#goScore'));
  await p.click('#goMenu');
  check('the start card shows the sprint best', /ベスト/.test(await p.textContent('#sprintSub')), await p.textContent('#sprintSub'));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function compat(env) {
  console.log('6. old saves');
  let s = await open(env, { seed: Object.assign({}, SEEN, { [BEST]: '8800' }) });
  let p = s.page;
  check('an old best shows on the start card and stays', (await p.textContent('#stBest')).replace(/,/g, '') === '8800' && (await stored(p, BEST)) === 8800, {});
  check('no stage progress: 0 stars, only 1-1 open', /0 \/ 36/.test(await p.textContent('#stagesSub')), await p.textContent('#stagesSub'));
  await s.close();
  // an old mid-game snapshot (the format from before this update)
  const board = Array.from({ length: 18 }, (_, r) => r < 16 ? '.........' : r === 16 ? '0011....2' : '3333.1122');
  const snap = { mode: 'normal', at: 1, board, cur: { t: 'T4', c: 1, x: 3, y: 2, cells: [[1, 0], [0, 1], [1, 1], [2, 1]] }, hold: null, canHold: true,
    queue: [{ t: 'I3', c: 0 }, { t: 'O4', c: 2 }, { t: 'L4', c: 3 }, { t: 'S4', c: 1 }], bag: ['I3', 'V3'], cbag: [0, 1], score: 4321, lines: 12, level: 2, soroi: 1, playMs: 90000 };
  s = await open(env, { seed: Object.assign({}, SEEN, { [STATE]: JSON.stringify({ v: 1, normal: snap, daily: null }), [BEST]: '9000' }) });
  p = s.page;
  check('the start card offers Continue with 4,321', /つづき/.test(await p.textContent('#startLbl')) && /4,321/.test(await p.textContent('#startSub')), await p.textContent('#startSub'));
  await p.click('#startBtn');
  const x = await st(p);
  check('the old snapshot restores board, score and level', x.score === 4321 && x.level === 2 && x.lines === 12 && x.board[17] === '3333.1122' && x.sub === null, x);
  await s.close();
  // a snapshot with a colour out of range is refused (rocks are not in saved games)
  const bad = Object.assign({}, snap, { board: board.map((r, i) => i === 17 ? '3333.4122' : r) });
  s = await open(env, { seed: Object.assign({}, SEEN, { [STATE]: JSON.stringify({ v: 1, normal: bad, daily: null }) }) });
  p = s.page;
  check('a snapshot with an unknown cell is dropped (Start, not Continue)', !/つづき/.test(await p.textContent('#startLbl')), await p.textContent('#startLbl'));
  await s.close();
  s = await open(env, { seed: Object.assign({}, SEEN, { [X]: JSON.stringify({ v: 1, s: [1, 2, 3, 3, 9, -4], sp: 55000, extra: 1 }) }) });
  p = s.page;
  let pr = await p.evaluate(() => __kb.progress());
  check('odd values in the stage save are clamped', JSON.stringify(pr.s.slice(0, 6)) === '[1,2,3,3,0,0]' && pr.sp === 55000, pr);
  await s.close();
  s = await open(env, { seed: Object.assign({}, SEEN, { [X]: '{oops' }) });
  p = s.page;
  pr = await p.evaluate(() => __kb.progress());
  check('a broken save is ignored (all zero, page works)', pr.s.every(v => v === 0) && pr.sp === 0 && s.log.pageErrors.length === 0, pr);
  await s.close();
}

async function english(env) {
  console.log('7. English: no Japanese left');
  const s = await open(env, { lang: 'en' }), p = s.page;
  const scan = async name => { const jp = await p.evaluate(`(${jpScan})(true)`); check(name, jp.length === 0, jp.slice(0, 5)); };
  await scan('start card');
  await p.click('#stagesBtn'); await scan('stage list');
  await p.evaluate(() => __kb.setProgress({ s: [3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 0] }));
  await p.evaluate(() => { document.getElementById('stBack').click(); __kb.showStages(); });
  await scan('stage list with stars');
  await p.evaluate(() => __kb.startStage(5));
  await scan('stage screen');
  await p.evaluate(() => __kb.win()); await waitOver(p); await scan('stage clear card');
  await p.click('#againBtn'); await p.evaluate(() => __kb.lose()); await waitOver(p); await scan('stage failed card');
  await p.click('#goMenu'); await p.evaluate(() => __kb.startSprint()); await scan('sprint screen');
  await p.evaluate(() => __kb.win()); await waitOver(p); await scan('sprint clear card');
  await p.click('#goMenu'); await p.click('#howBtn'); await scan('how to play');
  await p.keyboard.press('Escape');
  await startClassic(p); await p.evaluate(() => __kb.step(3)); await scan('classic screen');
  await p.keyboard.press('KeyP'); await scan('pause');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function layouts(env) {
  console.log('8. every screen size × ja/en × light/dark');
  for (const vp of (process.env.DROP_VPS || 'se1,a360s,se2,ip12,land,xr').split(',')) for (const lang of ['ja', 'en']) {
    const scheme = lang === 'ja' ? 'dark' : 'light';
    const s = await open(env, { vp, lang, scheme }), p = s.page, tag = `${vp}/${lang}/${scheme}`;
    let r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} start card: fits and the Start button reaches`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 3), pr: r.primary.filter(x => x.problems.length).slice(0, 2) });
    await shot(p, `8-${vp}-${lang}-start`);
    await p.click('#stagesBtn');
    r = await p.evaluate(`(${layoutProbe})()`);
    const sb = await p.evaluate(() => [...document.querySelectorAll('.sbtn')].map(b => { const q = b.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)]; }));
    check(`${tag} stage list: fits, buttons >= 44px`, r.hscroll <= 1 && r.offscreen.length === 0 && sb.every(([w, h]) => w >= 44 && h >= 44), { off: r.offscreen.slice(0, 3), sb: sb.slice(0, 2) });
    await shot(p, `8-${vp}-${lang}-stages`);
    await p.evaluate(() => { __kb.setProgress({ s: [3, 2, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1] }); __kb.startStage(8); });
    await p.evaluate(() => __kb.step(3));
    r = await p.evaluate(`(${layoutProbe})()`);
    const g = await p.evaluate(() => { const c = document.getElementById('cv').getBoundingClientRect(), pd = document.getElementById('pad').getBoundingClientRect(); return { cell: __kb.state().cell, padTop: pd.top, padBottom: pd.bottom, H: innerHeight, cvH: c.height }; });
    check(`${tag} stage: pad on screen, cell ${g.cell}px (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0 && g.padBottom <= g.H + 1 && g.cell >= (vp === 'land' ? 10 : 15), { off: r.offscreen.slice(0, 3), g });
    await shot(p, `8-${vp}-${lang}-stage`);
    await p.evaluate(() => __kb.win()); await waitOver(p);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} clear card: main button visible`, r.hscroll <= 1 && r.primary.every(x => x.problems.length === 0), r.primary.filter(x => x.problems.length).slice(0, 2));
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${tag} no Japanese`, jp.length === 0, jp.slice(0, 4)); }
    await shot(p, `8-${vp}-${lang}-clear`);
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
  for (const f of [classic, keyboard, touch, stages, sprint, compat, english, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
