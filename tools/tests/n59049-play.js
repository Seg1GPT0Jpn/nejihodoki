#!/usr/bin/env node
// 59049 の通しプレイ（Playwright、?debug の window.__kb / __n59049。3D は swiftshader で描く）
//   node tools/tests/n59049-play.js [normal,keyboard,stages,mechanics,rush,touch,compat,english,layouts]   … 全部で約2〜3分
// 1. ふつう：ふつうのゲームがこれまでどおり（ベスト・保存・実績のイベント）。x の保存は作られない
// 2. キーボード：M でモード選び・矢印と 1〜4・Esc・ステージ選び・Enter・矢印の寄せ・H（ヒント）・R（やり直し）・U（もどす）
// 3. ステージ：一覧と鍵・ボットで全12ステージをクリア・★の保存（kusoge.n59049.x）・次が開く・ふつうの盤とベストは変わらない・practice として報告
// 4. しくみ：いしは通れない／出ない・もどすで乱数も戻る・手数ぎれ・うごかせない・ヒントの数・やり直し・デイリーから行き来しても保存が壊れない
// 5. ラッシュ：60手・ベストの保存（x.r）・ふつうのベストは変わらない・practice
// 6. タッチ：本物のタップでモード選び・ステージ・ヒント、スワイプで寄せる
// 7. 古い保存：こわれた x・古い形の保存が読める
// 8. 英語：日本語が残らない
// 9. 画面サイズ × ja/en × 明るい/暗い：横スクロールなし・ボタンが画面内
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const E = require('../../n59049/engine.js');

const OUT = path.join(__dirname, 'out', 'shots', 'n59049-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const BEST = 'kusoge.n59049.best', TILE = 'kusoge.n59049.bestTile', STATE = 'kusoge.n59049.state', X = 'kusoge.n59049.x', DAILY = 'kusoge.n59049.daily';
const TUTORIAL = 'kusoge.n59049.tutorial', HOWTO = 'kusoge.n59049.howto';
const board0 = () => { const a = new Array(27).fill(0); a[0] = 1; a[1] = 1; a[10] = 2; a[22] = 3; return a; };
const mkState = o => JSON.stringify(Object.assign({ v: 1, cells: board0(), score: 321, undoLeft: 2, prev: null, won: false, yaw: 25, pitch: 22, t: 1, mv: 9 }, o || {}));
const SEED = { [BEST]: '4321', [TILE]: '243', [STATE]: mkState(), [HOWTO]: '1', [TUTORIAL]: '1' };

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || SEED, isMobile: !!o.touch, hasTouch: !!o.touch });
  if (o.scheme) await s.page.emulateMedia({ colorScheme: o.scheme });
  await s.goto('/n59049/?debug' + (o.query || ''));
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
const playOut = (p, max) => p.evaluate(n => { for (let k = 0; k < n && !__kb.state().over; k++) { if (!__kb.step(1)) break; } return __kb.state(); }, max || 400);
const settle = p => p.waitForTimeout(450);
const key = (p, k) => p.keyboard.press(k);
const wf = p => p.waitForTimeout(130); // the picker moves the focus after a beat

async function normal(env) {
  console.log('1. classic game still plays');
  const s = await open(env), p = s.page;
  await hook(p);
  let x = await st(p);
  check('opens on the saved board with the saved best', x.mode === 'normal' && x.score === 321 && x.best === 4321 && x.undoLeft === 2, x);
  check('the stage hint button is hidden outside the stages', !(await vis(p, '#bHint')), {});
  check('the controls show Undo / Modes / New', await vis(p, '#bUndo') && await vis(p, '#bModes') && await vis(p, '#bNew'), {});
  await p.evaluate(() => __kb.step(6));
  x = await st(p);
  check('moves work (score grows, moves counted)', x.moves >= 6 && x.score >= 321, x);
  await p.evaluate(() => __kb.lose());
  await p.waitForFunction(() => __kb.state().overShown, null, { timeout: 8000 }).catch(() => {});
  x = await st(p);
  check('a stuck board shows the over card with Modes', x.over && x.overShown && await vis(p, '#overModes') && /もう動かせない/.test(await p.textContent('#overTitle')), x);
  const ev = await events(p);
  check('reported as normal play', ev.filter(e => e[0] === 'play_start').every(e => e[1] === 'normal') && ev.some(e => e[0] === 'play_end'), ev);
  check('no kusoge.n59049.x is created by classic play', (await stored(p, X)) === null, await stored(p, X));
  await p.evaluate(() => __kb.normal()); await p.click('#again');
  await p.evaluate(() => __kb.step(3));
  check('Play again starts a fresh classic board', (await st(p)).mode === 'normal' && !(await st(p)).over, await st(p));
  pageOk(s); await s.close();
}

async function keyboard(env) {
  console.log('2. keyboard');
  const s = await open(env), p = s.page;
  await key(p, 'KeyM');
  check('M opens the mode picker', (await st(p)).modesShown && (await p.locator('.mode-opt').count()) >= 3, await st(p));
  check('the picker shows the key help', await vis(p, '#modesKeys'), {});
  await key(p, 'Escape');
  check('Esc closes it', !(await st(p)).modesShown, await st(p));
  await key(p, 'KeyM'); await wf(p); await key(p, 'ArrowDown');
  check('arrows move the focus between modes', await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('mode-opt') && document.activeElement.dataset.mode !== 'normal'), await p.evaluate(() => document.activeElement && document.activeElement.className));
  const ids = await p.evaluate(() => [...document.querySelectorAll('.mode-opt')].map(b => b.dataset.mode));
  await key(p, 'Digit' + (ids.indexOf('stage') + 1));
  check('the number key opens the stage list', await p.evaluate(() => !document.getElementById('modesStages').hidden), ids);
  check('only stage 1 is open on a fresh device', (await p.locator('.stg:not(:disabled)').count()) === 1 && (await p.locator('.stg').count()) === 12, {});
  await shot(p, '2-stage-list');
  await key(p, 'Escape');
  check('Esc in the list goes back to the modes', await p.evaluate(() => document.getElementById('modesStages').hidden && !document.getElementById('modes').hidden), {});
  await key(p, 'Digit' + (ids.indexOf('stage') + 1)); await wf(p); await key(p, 'Enter');
  let x = await st(p);
  check('Enter starts stage 1-1', x.mode === 'stage' && x.stageId === '1-1' && !x.modesShown && x.left === E.STAGES[0].moves && x.hints === 3, x);
  check('the stage bar, hint button and moves-left chip show', await vis(p, '#modeBar') && await vis(p, '#bHint') && (await p.textContent('#goalV')) === String(E.STAGES[0].moves), await p.textContent('#goalV'));
  const b0 = (await st(p)).board.join();
  await key(p, 'KeyH');
  x = await st(p);
  check('H spends a hint and says where to go', x.hints === 2 && /ヒント|Hint/.test(await p.textContent('#toast')), { hints: x.hints, t: await p.textContent('#toast') });
  // follow the hint: the toast names a button or an arrow
  const dir = await p.evaluate(() => { const t = document.getElementById('toast').textContent; return /奥へ/.test(t) ? 'far' : /手前へ/.test(t) ? 'near' : (t.match(/[←→↑↓]/) || [''])[0]; });
  const code = { '←': 'ArrowLeft', '→': 'ArrowRight', '↑': 'ArrowUp', '↓': 'ArrowDown', far: 'KeyW', near: 'KeyS' }[dir];
  await key(p, code); await settle(p);
  x = await st(p);
  check('the hinted key moves the board (' + dir + ')', x.moves === 1 && x.board.join() !== b0, { dir, moves: x.moves });
  await key(p, 'KeyU'); await settle(p);
  x = await st(p);
  check('U undoes the move and the stage is as it was', x.moves >= 0 && x.board.join() === b0 && x.left === E.STAGES[0].moves && x.undoLeft === 2, x);
  await key(p, 'KeyQ'); await key(p, 'KeyE'); await key(p, 'KeyT');
  await p.evaluate(() => __kb.step(2));
  await key(p, 'KeyR'); await settle(p);
  x = await st(p);
  check('R restarts the stage', x.mode === 'stage' && x.left === E.STAGES[0].moves && x.moves === 0 && x.hints === 3, x);
  await key(p, 'KeyM'); check('M in a stage opens the picker', (await st(p)).modesShown, {}); await key(p, 'Escape');
  // the stage card
  await p.evaluate(() => __kb.win());
  await p.waitForFunction(() => __kb.state().stgShown, null, { timeout: 8000 }).catch(() => {});
  x = await st(p);
  check('winning shows the stage card with stars and Next', x.stgShown && x.stageInfo && x.stageInfo.win && await vis(p, '#stgNext') && /ステージクリア/.test(await p.textContent('#stgTitle')), x);
  await shot(p, '2-stage-card');
  await key(p, 'KeyN'); await settle(p);
  check('N goes to the next stage', (await st(p)).stageId === '1-2', await st(p));
  await p.evaluate(() => __kb.lose());
  await p.waitForFunction(() => __kb.state().stgShown, null, { timeout: 8000 }).catch(() => {});
  check('losing shows Retry as the main button', await vis(p, '#stgRetry') && !(await vis(p, '#stgNext')) && /手数ぎれ|うごかせない/.test(await p.textContent('#stgTitle')), await p.textContent('#stgTitle'));
  await key(p, 'KeyR'); await settle(p);
  check('R retries the stage', (await st(p)).stageId === '1-2' && !(await st(p)).over, await st(p));
  await p.evaluate(() => __kb.lose());
  await p.waitForFunction(() => __kb.state().stgShown, null, { timeout: 8000 }).catch(() => {});
  await key(p, 'Escape');
  check('Esc on the card opens the stage list', (await st(p)).modesShown && !(await st(p)).stgShown, await st(p));
  pageOk(s); await s.close();
}

async function stages(env) {
  console.log('3. stages: bot clears all 12, stars saved, next unlocks, classic untouched, reported as practice');
  const s = await open(env), p = s.page;
  await hook(p);
  const state0 = await storedJ(p, STATE);
  let x;
  await p.evaluate(() => __kb.modes('stages'));
  const lock = await p.evaluate(() => [...document.querySelectorAll('.stg')].map(b => b.disabled));
  check('12 stages in 3 worlds; only the first is open', lock.length === 12 && !lock[0] && lock.slice(1).every(Boolean) && (await p.locator('.stage-world').count()) === 3, lock);
  await p.evaluate(() => __kb.stageStart(5));
  check('a locked stage cannot be started', (await st(p)).mode === 'normal', await st(p));
  const info = [];
  let wins = 0;
  for (let i = 0; i < 12; i++) {
    await p.evaluate(i => __kb.stageStart(i), i);
    let x = await st(p);
    if (i === 0) check('stage 1-1 started: its aim in the bar, the start board and no spare tiles', x.stageId === '1-1' && x.board.join() === E.STAGES[0].start.join(), x);
    const r = await p.evaluate(() => { for (let k = 0; k < 400 && !__kb.state().over; k++) if (!__kb.step(1)) break; return __kb.state(); });
    if (r.stageInfo && r.stageInfo.win) wins++;
    info.push((i + 1) + ':' + (r.stageInfo ? r.stageInfo.stars : '?'));
    if (i === 0) { await p.waitForFunction(() => __kb.state().stgShown, null, { timeout: 8000 }).catch(() => {}); await shot(p, '3-card'); }
  }
  check('the bot clears every stage (' + info.join(' ') + ')', wins === 12, info);
  const xs = await storedJ(p, X);
  check('kusoge.n59049.x holds the stars for all 12', xs && xs.v === 1 && xs.s.length === 12 && xs.s.every(v => v >= 1 && v <= 3), xs);
  const localStorage_state = await stored(p, STATE);
  check('the classic best, tile and board are untouched', (await stored(p, BEST)) === '4321' && (await stored(p, TILE)) === '243' && (() => { const n = JSON.parse(localStorage_state); return n.score === state0.score && n.cells.join() === state0.cells.join(); })(), { best: await stored(p, BEST) });
  const ev = await events(p);
  check('only practice was reported (no best, no normal play)', ev.filter(e => e[0] === 'play_start' || e[0] === 'play_end').every(e => e[1] === 'practice') && !ev.some(e => e[0] === 'best' || e[0] === 'progress'), ev.slice(0, 6));
  await p.evaluate(() => __kb.modes('stages'));
  const open12 = await p.evaluate(() => [...document.querySelectorAll('.stg')].every(b => !b.disabled));
  check('every stage is open now and the total shows', open12 && /★/.test(await p.textContent('#stageTotal')), await p.textContent('#stageTotal'));
  await shot(p, '3-list-done');
  await p.evaluate(() => __kb.modes());
  const sub = await p.evaluate(() => [...document.querySelectorAll('.mode-opt small')].map(e => e.textContent));
  check('the picker shows the star total', sub.some(t => /★/.test(t)), sub);
  // a worse run never lowers the stars
  const before = (await storedJ(p, X)).s.slice();
  await p.evaluate(() => __kb.stageStart(0)); await p.evaluate(() => __kb.lose());
  check('a failed attempt does not lower the stars', (await storedJ(p, X)).s.join() === before.join(), await storedJ(p, X));
  // back to the classic board
  await p.evaluate(() => __kb.normal());
  x = await st(p);
  check('going back to Classic restores the saved board and score', x.mode === 'normal' && x.score === 321 && x.best === 4321 && x.board.join() === board0().join(), x);
  pageOk(s); await s.close();
}

async function mechanics(env) {
  console.log('4. mechanics: stones, undo + seeded spawns, running out of moves, hints, switching modes');
  const s = await open(env), p = s.page;
  // stones
  await p.evaluate(() => __kb.setProgress({ v: 1, s: new Array(12).fill(1) }));
  await p.evaluate(() => __kb.stageStart(4)); // 2-1: a stone in the middle (13)
  const stones = await p.evaluate(() => __n59049.stones());
  check('stage 2-1 has its stone and 3D draws it', stones[13] === 1 && stones.filter(Boolean).length === 1, stones);
  await p.evaluate(() => __kb.step(30));
  const bd = await p.evaluate(() => __kb.state().board);
  check('no tile ever stands on a stone (30 bot moves)', bd[13] === 0, bd);
  // undo restores the seeded spawn sequence
  await p.evaluate(() => __kb.stageStart(2));
  await p.evaluate(() => __kb.step(3));
  const a = await st(p);
  await p.evaluate(() => { __kb.move('+X'); });
  const first = await st(p);
  if (first.moves === a.moves) await p.evaluate(() => { __kb.move('-X') || __kb.move('+Y') || __kb.move('-Y'); });
  const moved = await st(p);
  await p.evaluate(() => __kb.undo());
  const back = await st(p);
  check('Undo puts back the board, the score and the moves left', moved.moves > a.moves && back.board.join() === a.board.join() && back.score === a.score && back.left === a.left, { a: a.left, back: back.left });
  await p.evaluate(() => { const d = ['+X', '-X', '+Y', '-Y', '+Z', '-Z']; for (const k of d) if (__kb.move(k)) break; });
  const again = await st(p);
  check('the same move after Undo gives the same board (the spawns are seeded)', again.board.join() === moved.board.join(), { moved: moved.board.join(), again: again.board.join() });
  // hints run out
  await p.evaluate(() => __kb.stageStart(0));
  for (let i = 0; i < 4; i++) await p.evaluate(() => __kb.hint());
  let x = await st(p);
  check('hints are limited to 3 and then the button is disabled', x.hints === 0 && await p.evaluate(() => document.getElementById('bHint').disabled), x);
  // out of moves
  await p.evaluate(() => __kb.stageStart(0));
  await p.evaluate(() => __kb.lose());
  await p.waitForFunction(() => __kb.state().stgShown, null, { timeout: 8000 }).catch(() => {});
  x = await st(p);
  check('running out of moves ends the stage (no stars)', x.over && x.stageInfo && !x.stageInfo.win && x.stageInfo.stars === 0, x);
  const xs0 = await storedJ(p, X);
  check('a loss changes no stars', xs0 && xs0.s[0] === 1 && xs0.s[1] === 1, xs0);
  // moves are blocked after the end
  const mv = await p.evaluate(() => __kb.move('+X') || __kb.move('-X'));
  check('no move once the stage is over', mv === false, mv);
  // daily <-> stage <-> classic keep their own saves
  await p.evaluate(() => __kb.daily());
  const dkey = await p.evaluate(() => __kb.state().daily && __kb.state().daily.dateKey);
  await p.evaluate(() => __kb.step(3));
  const dailyBoard = (await st(p)).board.join();
  await p.evaluate(() => __kb.stageStart(1));
  x = await st(p);
  check('from the daily to a stage', x.mode === 'stage' && x.daily === null, x);
  await p.evaluate(() => __kb.daily());
  x = await st(p);
  check('back to the daily: the try continues where it was', x.mode === 'daily' && x.board.join() === dailyBoard, { mode: x.mode });
  await p.evaluate(() => __kb.normal());
  x = await st(p);
  check('and the classic board is still the saved one', x.mode === 'normal' && x.score === 321, x);
  // restart toast / double press in a stage
  await p.evaluate(() => __kb.stageStart(0)); await p.evaluate(() => __kb.step(2));
  await p.click('#bNew');
  check('New in a stage asks once', (await st(p)).moves === 2 && /もう一度|Tap again/.test(await p.textContent('#toast')), await p.textContent('#toast'));
  await p.click('#bNew'); await settle(p);
  check('and restarts the second time', (await st(p)).moves === 0 && (await st(p)).left === E.STAGES[0].moves, await st(p));
  // the menu offers the modes
  await p.evaluate(() => __kb.menu());
  const items = await p.evaluate(() => [...document.querySelectorAll('.kb-layer .kb-btn')].map(b => b.textContent.trim()));
  check('the pause menu lists the mode picker and a way back to Classic', items.some(t => /モードをえらぶ/.test(t)) && items.some(t => /ふつうのゲームに戻る/.test(t)), items);
  pageOk(s); await s.close();
}

async function rush(env) {
  console.log('5. rush: 60 moves, best saved apart from the classic best');
  const s = await open(env), p = s.page;
  await hook(p);
  await p.evaluate(() => __kb.rushStart(7));
  let x = await st(p);
  check('rush starts with 60 moves and 2 tiles', x.mode === 'rush' && x.left === 60 && x.board.filter(Boolean).length === 2 && !(await vis(p, '#bHint')) && await p.evaluate(() => document.getElementById('bUndo').disabled), x);
  await shot(p, '5-rush');
  x = await playOut(p, 100);
  await p.waitForFunction(() => __kb.state().overShown, null, { timeout: 8000 }).catch(() => {});
  x = await st(p);
  check('after 60 moves the card shows the rush result with Modes', x.over && x.overShown && x.moves === 60 && /ラッシュ終了/.test(await p.textContent('#overTitle')) && await vis(p, '#overModes') && !(await vis(p, '#overUndo')), x);
  const xs = await storedJ(p, X);
  check('the rush best is saved in x.r (the card shows it)', xs && xs.r === x.score && xs.r > 0 && (await p.textContent('#overBest')).replace(/,/g, '') === String(xs.r), { xs, score: x.score });
  check('new rush best is celebrated', await vis(p, '#overNew'), {});
  check('classic best untouched', (await stored(p, BEST)) === '4321', await stored(p, BEST));
  const ev = await events(p);
  check('reported as practice only', ev.filter(e => e[0] === 'play_start' || e[0] === 'play_end').every(e => e[1] === 'practice') && !ev.some(e => e[0] === 'best'), ev);
  await p.click('#again'); await settle(p);
  x = await st(p);
  check('Play again starts another rush', x.mode === 'rush' && x.left === 60 && !x.over, x);
  // a worse run does not lower the best
  const r0 = (await storedJ(p, X)).r;
  await p.evaluate(() => __kb.lose());
  check('a worse rush keeps the best', (await storedJ(p, X)).r === r0, await storedJ(p, X));
  pageOk(s); await s.close();
}

async function touch(env) {
  console.log('6. touch');
  const s = await open(env, { touch: true }), p = s.page;
  await p.tap('#bModes');
  check('tapping Modes opens the picker', (await st(p)).modesShown, await st(p));
  await p.tap('.mode-opt[data-mode="stage"]');
  await p.tap('.stg:not(:disabled)');
  let x = await st(p);
  check('tapping a stage starts it', x.mode === 'stage' && x.stageId === '1-1', x);
  await p.tap('#bHint');
  check('tapping the hint button spends one', (await st(p)).hints === 2, await st(p));
  // a real swipe on the canvas
  const box = await p.locator('#cv').boundingBox();
  const cdp = await p.context().newCDPSession(p);
  const mk = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const b0 = (await st(p)).moves;
  let moved = false;
  for (const [dx, dy] of [[130, 0], [-130, 0], [0, -130], [0, 130]]) {
    const cx = box.x + box.width / 2, cy = box.y + box.height / 2;
    await mk('touchStart', cx, cy); await mk('touchMove', cx + dx / 2, cy + dy / 2); await mk('touchMove', cx + dx, cy + dy); await mk('touchEnd');
    await p.waitForTimeout(450);
    if ((await st(p)).moves > b0) { moved = true; break; }
  }
  check('a swipe on the cube moves the tiles', moved, await st(p));
  await p.tap('#bUndo');
  check('tapping Undo works in a stage', (await st(p)).moves >= 0 && (await st(p)).undoLeft === 2, await st(p));
  await p.tap('#bModes'); await p.tap('.mode-opt[data-mode="rush"]');
  check('tapping Rush starts it', (await st(p)).mode === 'rush', await st(p));
  pageOk(s); await s.close();
}

async function compat(env) {
  console.log('7. old / broken saves');
  let s = await open(env, { seed: { [BEST]: '999', [STATE]: mkState({ score: 50 }), [X]: '{broken' } }), p = s.page;
  check('a broken x loads as empty and classic is intact', (await st(p)).best === 999 && (await st(p)).score === 50 && (await st(p)).stars.every(v => v === 0), await st(p));
  await p.evaluate(() => __kb.modes('stages'));
  check('only stage 1 is open', (await p.locator('.stg:not(:disabled)').count()) === 1, {});
  pageOk(s); await s.close();
  s = await open(env, { seed: { [BEST]: '12000', [TILE]: '2187', [HOWTO]: '1', [TUTORIAL]: 'old', [X]: JSON.stringify({ v: 1, s: [3, 2, 'x', 9, -1], r: 'oops', c: 99 }) } }); p = s.page;
  const x = await st(p);
  check('a damaged x keeps its good part (5 stars) and ignores the rest', x.stars.slice(0, 5).join() === '3,2,0,0,0' && x.rush === 0, x);
  check('the ranking value (best) is the same as before', (await p.evaluate(() => localStorage.getItem('kusoge.n59049.best'))) === '12000' && x.best === 12000, x);
  await p.evaluate(() => __kb.modes('stages'));
  check('stage 3 is open (stage 2 has stars), stage 4 is not', await p.evaluate(() => [...document.querySelectorAll('.stg')].map(b => !b.disabled).join()) === 'true,true,true,false,false,false,false,false,false,false,false,false', {});
  pageOk(s); await s.close();
  // a first visit still shows the how-to, not the picker
  s = await open(env, { seed: {} }); p = s.page;
  check('a first visit shows the how-to', (await st(p)).howto && !(await st(p)).modesShown, await st(p));
  pageOk(s); await s.close();
}

async function english(env) {
  console.log('8. english');
  const s = await open(env, { lang: 'en', seed: Object.assign({}, SEED, { [X]: JSON.stringify({ v: 1, s: [3, 2, 1], r: 300 }) }) }), p = s.page;
  const scan = async name => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${name}: no Japanese`, jp.length === 0, jp.slice(0, 4)); };
  await scan('classic');
  await p.evaluate(() => __kb.modes()); await scan('mode picker');
  await p.evaluate(() => __kb.modes('stages')); await scan('stage list');
  for (const i of [0, 4, 5, 7, 11, 2, 3]) {
    await p.evaluate(i => { __kb.setProgress({ v: 1, s: new Array(12).fill(1), r: 300 }); __kb.stageStart(i); }, i);
    if (i === 0) await p.evaluate(() => __kb.hint());
    await scan('stage ' + (i + 1) + ' HUD' + (i === 0 ? ' + hint' : ''));
  }
  await p.evaluate(() => { __kb.stageStart(0); __kb.win(); });
  await p.waitForFunction(() => __kb.state().stgShown, null, { timeout: 8000 }).catch(() => {});
  await scan('stage clear card');
  await p.evaluate(() => { __kb.stageStart(0); __kb.lose(); });
  await p.waitForFunction(() => __kb.state().stgShown, null, { timeout: 8000 }).catch(() => {});
  await scan('stage fail card');
  await p.evaluate(() => __kb.rushStart(3)); await scan('rush HUD');
  await p.evaluate(() => __kb.win());
  await p.waitForFunction(() => __kb.state().overShown, null, { timeout: 8000 }).catch(() => {});
  await scan('rush result');
  pageOk(s); await s.close();
}

async function layouts(env) {
  console.log('9. layouts');
  const seed = Object.assign({}, SEED, { [X]: JSON.stringify({ v: 1, s: [3, 2, 1], r: 300 }) });
  for (const [vp, lang, scheme] of [['se1', 'ja', 'dark'], ['ip12', 'en', 'light'], ['p8', 'ja', 'light'], ['land', 'en', 'dark']]) {
    const tag = `${vp}/${lang}/${scheme}`;
    const s = await open(env, { vp, lang, scheme, seed }), p = s.page;
    let r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} classic: fits (3-button row)`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 3), h: r.hscroll });
    await p.evaluate(() => __kb.modes());
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} mode picker: reachable`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 3), pr: r.primary.filter(x => x.problems.length).slice(0, 2) });
    await shot(p, `9-${vp}-${lang}-picker`);
    await p.evaluate(() => __kb.modes('stages'));
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} stage list: reachable`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 3), pr: r.primary.filter(x => x.problems.length).slice(0, 2) });
    await shot(p, `9-${vp}-${lang}-stages`);
    await p.evaluate(() => __kb.stageStart(1)); await p.evaluate(() => { __kb.step(4); __kb.hint(); });
    await p.waitForTimeout(500);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} stage HUD fits`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 3) });
    const small = r.small.filter(t => !/kvs-entry/.test(t));
    check(`${tag} stage HUD: every control is at least 44px`, small.length === 0, small.slice(0, 4));
    await shot(p, `9-${vp}-${lang}-stage`);
    await p.evaluate(() => __kb.win());
    await p.waitForFunction(() => __kb.state().stgShown, null, { timeout: 8000 }).catch(() => {});
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} stage card: buttons reachable`, r.hscroll <= 1 && r.primary.every(x => x.problems.length === 0), r.primary.filter(x => x.problems.length).slice(0, 2));
    await shot(p, `9-${vp}-${lang}-card`);
    await p.evaluate(() => __kb.rushStart(2)); await p.evaluate(() => __kb.step(5));
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} rush HUD fits`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 3) });
    await p.evaluate(() => __kb.win());
    await p.waitForFunction(() => __kb.state().overShown, null, { timeout: 8000 }).catch(() => {});
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} rush result: buttons reachable`, r.hscroll <= 1 && r.primary.every(x => x.problems.length === 0), r.primary.filter(x => x.problems.length).slice(0, 2));
    await shot(p, `9-${vp}-${lang}-rush`);
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
  for (const f of [normal, keyboard, stages, mechanics, rush, touch, compat, english, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const failN = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - failN}  fail ${failN}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(failN ? 1 : 0);
})();
