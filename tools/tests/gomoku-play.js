#!/usr/bin/env node
// 五目ならべ工房の通しプレイ（Playwright。?debug の window.__gomoku は「どこを押すか」を聞くだけで、押すのは本物のマウス・キー・タッチ）
//   node tools/tests/gomoku-play.js [first,game,keys,aids,forbid,touch,pass,puzzle,resume,english,layouts,lobby,online]   （--no-online：エミュレーターを使う online を省く）
// 1. 初回：ルール → タイトル  2. CPUと1ゲームを最後まで本物のクリックで → 結果・保存（★）  3. キーボード（矢印・Enter・H・U・L・N・Z・Esc）
// 4. ヒント・もどす・棋譜・手の番号・勝った並びの光り・★がつかない  5. 連珠ふうの禁じ手（×・置けない・理由）  6. タッチ：目印→「おく」／もう一度タップ・拡大・誤タップ防止
// 7. ふたりで1台  8. 今日のパズル（正解・まちがい・保存・れんしゅう）  9. 途中保存 → つづきから  10. 英語  11. 全画面サイズ × ja/en × ライト/ダーク
// 12. オンラインのロビー（ネットなし）  13. オンライン（エミュレーター・本物のルール）：コードの部屋・クイックマッチ・2ページで1ゲーム・もう一度（色が入れかわる）・ページが消える（CPUが席に）・ホストが出る
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'gomoku-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.gomoku.save', RUN = 'kusoge.gomoku.game', HOWTO = 'kusoge.gomoku.howto';

async function open(env, o = {}) {
  const touch = !!o.touch;
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: touch, hasTouch: touch });
  await s.goto('/gomoku/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__gomoku);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const speed = (p, m) => p.evaluate(m => __gomoku.setSpeed(m), m);
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 15000 });
// click a board cell with the real mouse (the cell is a div: click its centre)
async function clickCell(p, i) {
  const pt = await p.evaluate(i => __gomoku.cellPoint(i), i);
  await p.mouse.click(pt.x, pt.y);
}
async function tapCell(p, i) {
  const pt = await p.evaluate(i => __gomoku.cellPoint(i), i);
  await p.touchscreen.tap(pt.x, pt.y);
}
// play the human seat to the end: take the plan's cell (first free cell near the middle; 'cpu' = a sensible one) and click it
async function playOut(p, o = {}) {
  const max = o.max || 400;
  for (let i = 0; i < max; i++) {
    const s = await st(p);
    if (s.result) return s;
    if (!s.human) { await p.waitForTimeout(15); continue; }
    const pl = await p.evaluate(g => __gomoku.plan(g), o.good || 'cpu');
    if (!pl) { await p.waitForTimeout(20); continue; }
    await clickCell(p, pl.cell);
    await p.waitForTimeout(8);
  }
  return st(p);
}
async function startCpu(p, o) { await p.evaluate(o => __gomoku.start(o), o || {}); await wait(p, () => __kb.state().started); }
const rowsOf = (n, stones) => { const g = Array.from({ length: n }, () => '.'.repeat(n).split('')); for (const [r, c, ch] of stones) g[r][c] = ch; return g.map(x => x.join('')); };

async function first(env) {
  console.log('1. first visit: the rules, then the title');
  const s = await open(env, { seed: {} });
  const p = s.page;
  check('the rules show first', (await st(p)).howto, null);
  check('the rules explain the three rule sets and the forbidden moves', /三三/.test(await p.textContent('#howBody')) && /ちょうど5/.test(await p.textContent('#howBody')), null);
  await shot(p, '1-howto');
  await p.click('#howtoGo');
  check('closing the rules shows the title', (await st(p)).title, null);
  check('the first-visit mark is saved', (await p.evaluate(k => localStorage.getItem(k), HOWTO)) === '1', null);
  check('the title offers daily puzzle, online, CPU, two players, rules', !!(await p.$('#tDaily')) && !!(await p.$('#tOnline')) && !!(await p.$('#tPlay')) && !!(await p.$('#tPass')) && !!(await p.$('#tHow')), null);
  check('the title has board sizes 15/13/9 and the three rule sets', (await p.$$('#optN .opt')).length === 3 && (await p.$$('#optRu .opt')).length === 3, null);
  await shot(p, '1-title');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function game(env) {
  console.log('2. a whole game against the CPU with real clicks');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  await p.click('#optLv [data-lv="1"]');
  await p.click('#tPlay');
  await wait(p, () => __kb.state().started && !__kb.state().title);
  let k = await st(p);
  check('a game starts: 15x15, black to move, an empty board, 225 crossings', k.n === 15 && k.turn === 1 && k.black + k.white === 0 && k.moves === 0 && (await p.$$('.cell')).length === 225, k);
  check('the page does not scroll sideways', await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1), null);
  const mid = 112;
  await clickCell(p, mid);
  await wait(p, () => __kb.state().moves >= 1);
  k = await st(p);
  check('a click on the middle crossing puts a black stone there', k.board[mid] === 1 && k.stones >= 1, k);
  await wait(p, () => __kb.state().human);
  await clickCell(p, mid);
  check('clicking a crossing that has a stone changes nothing and says so', (await st(p)).moves === 2 && /石/.test((await st(p)).status), (await st(p)).status);
  await shot(p, '2-start');
  const t0 = Date.now();
  const end = await playOut(p, { good: 'cpu' });
  check('the game reaches a result', end.result && end.over, end);
  check('there is a winner or the board is full', end.winner > 0 || end.black + end.white === 225, end);
  await shot(p, '2-result');
  const sv = await stored(p, SAVE);
  check('the record counted a play', sv.stats.plays === 1 && sv.w['15-1'].p === 1, sv);
  const won = end.winner === 1;
  check('a win adds ★ 1 (Easy) once; a loss adds none', sv.pts === (won ? 1 : 0), { pts: sv.pts, won });
  check('the winning five is marked on the board', end.winner === 0 || (end.line.length >= 5 && end.marks.win === end.line.length), end.marks);
  check('the result shows who won and no unfinished game is left', /\d+/.test(await p.textContent('#rSub')) && (await p.evaluate(k => localStorage.getItem(k), RUN)) === null, null);
  check('the game took a sensible time', Date.now() - t0 < 120000, Date.now() - t0);
  await p.click('#rAgain');
  await wait(p, () => __kb.state().started && !__kb.state().result && __kb.state().moves === 0);
  check('play again starts a fresh game with the same settings', (await st(p)).level === 1, null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function keys(env) {
  console.log('3. keyboard: arrows move the cursor, Enter plays, H hint, U undo, L moves, N numbers, Z zoom, Esc menu');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  await startCpu(p, { level: 1, me: 'b' });
  await p.keyboard.press('ArrowDown');
  const cur = await p.evaluate(() => __gomoku.S.cur);
  check('an arrow key moves the cursor from the middle and focuses the cell', (await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('cell'))) && cur === 112 + 15, cur);
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft');
  check('the cursor is on the crossing two to the left', (await p.evaluate(() => __gomoku.S.cur)) === 112 + 15 - 2, null);
  await p.keyboard.press('Enter');
  await wait(p, () => __kb.state().moves >= 1);
  check('Enter plays the move under the cursor', (await st(p)).board[112 + 15 - 2] === 1, null);
  await wait(p, () => __kb.state().human);
  await p.keyboard.press('h');
  await wait(p, () => __kb.state().hint >= 0);
  check('H lights up a suggested crossing that is empty', (await st(p)).board[(await st(p)).hint] === 0 && !!(await p.$('.cell.ht')), null);
  await p.keyboard.press('l');
  await wait(p, () => __kb.state().movesOv);
  check('L opens the move list with moves in it', (await p.$$('#mList li')).length >= 2, null);
  await p.keyboard.press('Escape');
  await wait(p, () => !__kb.state().movesOv);
  check('Esc closes the move list', true, null);
  await p.keyboard.press('n');
  check('N shows move numbers on every stone', (await st(p)).nums === (await st(p)).stones && (await st(p)).stones >= 2, await st(p));
  await shot(p, '3-numbers');
  await p.keyboard.press('z');
  check('Z zooms the board in (the board is bigger than its window and can scroll)', await p.evaluate(() => { const s = document.getElementById('stage'), b = document.getElementById('board'); return __kb.state().zoom && b.getBoundingClientRect().width > s.clientWidth + 20 && (s.scrollWidth > s.clientWidth); }), null);
  await shot(p, '3-zoom');
  await p.keyboard.press('z');
  check('Z again shows the whole board', !(await st(p)).zoom, null);
  await p.keyboard.press('u');
  await wait(p, () => __kb.state().undone === 1);
  check('U takes the move back', (await st(p)).moves === 0, await st(p));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function aids(env) {
  console.log('4. hint, undo, move numbers and the winning line; using hint/undo means no ★');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  await startCpu(p, { level: 1, me: 'b' });
  await p.click('#ctl [data-id="hint"]');
  await wait(p, () => __kb.state().hint >= 0);
  const h = (await st(p)).hint;
  check('the hint button highlights an empty crossing and says so', (await st(p)).board[h] === 0 && /:|：/.test(await p.textContent('#status')), null);
  await shot(p, '4-hint');
  check('the undo button is disabled before any move', await p.$eval('#ctl [data-id="undo"]', e => e.disabled), null);
  await clickCell(p, h);
  await wait(p, () => __kb.state().moves >= 2 && __kb.state().human);
  check('after my move and the CPU\'s, undo is enabled', !(await p.$eval('#ctl [data-id="undo"]', e => e.disabled)), null);
  await p.click('#ctl [data-id="undo"]');
  await wait(p, () => __kb.state().undone === 1);
  const k = await st(p);
  check('undo goes back to before my move: empty board, black to move, hint cleared', k.moves === 0 && k.black + k.white === 0 && k.turn === 1 && k.hint === -1, k);
  await p.click('#numBtn');
  check('the number button turns move numbers on (saved) and again off', (await stored(p, SAVE)).set.nums === 1);
  await p.click('#numBtn');
  // a position one move from five: click the fifth stone, the winning line glows and the game ends
  await p.evaluate(rows => __gomoku.rig(rows, 1), rowsOf(15, [[7, 3, 'x'], [7, 4, 'x'], [7, 5, 'x'], [7, 6, 'x'], [5, 5, 'o'], [5, 6, 'o'], [5, 7, 'o'], [9, 2, 'o']]));
  await clickCell(p, 7 * 15 + 7);
  await wait(p, () => __kb.state().over);
  const e = await st(p);
  check('the fifth stone wins: black, five cells in a row', e.winner === 1 && e.line.length === 5 && e.line.join() === [7 * 15 + 3, 7 * 15 + 4, 7 * 15 + 5, 7 * 15 + 6, 7 * 15 + 7].join(), e.line);
  check('the five stones glow', e.marks.win === 5, e.marks);
  await shot(p, '4-win');
  await wait(p, () => __kb.state().result);
  const sv = await stored(p, SAVE);
  check('a game with hint and undo gives no ★ and says why', sv.pts === 0 && /★/.test(await p.textContent('#rNote')), { pts: sv.pts, note: await p.textContent('#rNote') });
  // white: the CPU moves first
  await p.click('#rTitleBtn'); await p.waitForSelector('#tPlay');
  await p.click('#optMe [data-me="w"]'); await p.click('#tPlay');
  await wait(p, () => __kb.state().started && __kb.state().moves >= 1);
  const w = await st(p);
  check('playing white: the CPU opened in the middle and it is my turn', w.me === 2 && w.turn === 2 && w.human && w.board[112] === 1, w);
  // 9x9 and 13x13
  await p.evaluate(() => __gomoku.title()); await p.click('#optN [data-n="9"]'); await p.click('#tPlay');
  await wait(p, () => __kb.state().n === 9);
  check('9x9: 81 crossings', (await p.$$('.cell')).length === 81, null);
  await p.evaluate(() => __gomoku.title()); await p.click('#optN [data-n="13"]'); await p.click('#tPlay');
  await wait(p, () => __kb.state().n === 13);
  check('13x13: 169 crossings', (await p.$$('.cell')).length === 169, null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function forbid(env) {
  console.log('5. Renju-style: black\'s forbidden points show a ×, cannot be played, and say why; five beats a forbidden shape; white is free');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  await p.click('#optRu [data-ru="renju"]');
  await p.click('#tPass'); await wait(p, () => __kb.state().mode === 'pass');
  check('the game runs the renju rule', (await st(p)).rule === 'renju', null);
  // double three at (7,7): (7,5),(7,6) and (5,7),(6,7)
  await p.evaluate(rows => __gomoku.rig(rows, 1), rowsOf(15, [[7, 5, 'x'], [7, 6, 'x'], [5, 7, 'x'], [6, 7, 'x'], [2, 2, 'o'], [12, 12, 'o'], [2, 12, 'o']]));
  let k = await st(p);
  check('the double-three point (and only the forbidden ones) shows a × on screen', k.forb.includes(7 * 15 + 7) && k.marks.fb === k.forb.length, k.forb);
  await shot(p, '5-forbidden');
  const before = k.moves;
  await clickCell(p, 7 * 15 + 7);
  k = await st(p);
  check('clicking it plays nothing and says it is a forbidden double three', k.board[7 * 15 + 7] === 0 && k.turn === 1 && /禁じ手/.test(k.status) && /三三/.test(k.status), k.status);
  void before;
  // overline
  await p.evaluate(rows => __gomoku.rig(rows, 1), rowsOf(15, [[7, 3, 'x'], [7, 4, 'x'], [7, 5, 'x'], [7, 7, 'x'], [7, 8, 'x'], [2, 2, 'o']]));
  k = await st(p);
  check('an overline (six in a row) point is forbidden for black', k.forb.includes(7 * 15 + 6), k.forb);
  await clickCell(p, 7 * 15 + 6);
  check('and the click says it is an overline', /長連/.test((await st(p)).status), (await st(p)).status);
  // double four
  await p.evaluate(rows => __gomoku.rig(rows, 1), rowsOf(15, [[7, 4, 'x'], [7, 5, 'x'], [7, 6, 'x'], [4, 7, 'x'], [5, 7, 'x'], [6, 7, 'x'], [2, 2, 'o']]));
  check('a double-four point is forbidden', (await st(p)).forb.includes(7 * 15 + 7), (await st(p)).forb);
  // a five wins even though the shape also looks like a double three
  await p.evaluate(rows => __gomoku.rig(rows, 1), rowsOf(15, [[7, 3, 'x'], [7, 4, 'x'], [7, 5, 'x'], [7, 6, 'x'], [5, 8, 'x'], [6, 8, 'x'], [2, 2, 'o'], [12, 12, 'o']]));
  check('a point that makes exactly five is not forbidden', !(await st(p)).forb.includes(7 * 15 + 7), (await st(p)).forb);
  await clickCell(p, 7 * 15 + 7);
  await wait(p, () => __kb.state().over);
  check('and it wins', (await st(p)).winner === 1, await st(p));
  // white may do what black may not
  await p.evaluate(rows => __gomoku.rig(rows, 2), rowsOf(15, [[7, 5, 'o'], [7, 6, 'o'], [5, 7, 'o'], [6, 7, 'o'], [1, 1, 'x'], [13, 13, 'x'], [1, 13, 'x']]));
  const w0 = await st(p);
  check('white has no forbidden points and no × on the board', w0.forb.length === 0 || w0.turn === 2, w0.forb);
  // the switch hides the marks
  await p.evaluate(() => __gomoku.set('fbd', 0));
  await p.evaluate(rows => __gomoku.rig(rows, 1), rowsOf(15, [[7, 5, 'x'], [7, 6, 'x'], [5, 7, 'x'], [6, 7, 'x'], [2, 2, 'o']]));
  check('with the "mark forbidden points" switch off, no × is drawn (the move is still refused)', (await st(p)).marks.fb === 0 && (await st(p)).forb.includes(112), (await st(p)).marks);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function touch(env) {
  console.log('6. touch: a marker first, then Place or a second tap; a tap elsewhere moves the marker; zoom; no stray moves');
  const s = await open(env, { touch: true, vp: 'se1' });
  const p = s.page; await speed(p, 0);
  await startCpu(p, { level: 1, me: 'b' });
  let k = await st(p);
  check('on a touch screen "confirm taps" is on by itself and the Place button is there', k.confirm && !!(await p.$('#ctl [data-id="ok"]')) && await p.$eval('#ctl [data-id="ok"]', e => e.disabled), k.confirm);
  await tapCell(p, 112);
  k = await st(p);
  check('the first tap only puts a marker (no stone), and Place is enabled', k.pv === 112 && k.moves === 0 && k.board[112] === 0 && k.marks.pv === 1 && !(await p.$eval('#ctl [data-id="ok"]', e => e.disabled)), k);
  await shot(p, '6-preview');
  await tapCell(p, 112 + 16);
  k = await st(p);
  check('a tap on another crossing moves the marker', k.pv === 112 + 16 && k.moves === 0 && k.marks.pv === 1, k.pv);
  await p.click('#ctl [data-id="ok"]');
  await wait(p, () => __kb.state().moves >= 1);
  k = await st(p);
  check('Place plays the marked crossing and clears the marker', k.board[112 + 16] === 1 && k.pv === -1, k);
  await wait(p, () => __kb.state().human);
  await tapCell(p, 5); await tapCell(p, 5);
  await wait(p, () => __kb.state().moves >= 3);
  check('a second tap on the same crossing plays it', (await st(p)).board[5] === 1, null);
  await wait(p, () => __kb.state().human);
  // zoom: the board gets big enough to tap exactly
  await p.click('#ctl [data-id="zoom"]');
  const z = await p.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(), s = document.getElementById('stage'); return { zoom: __kb.state().zoom, bw: b.width, sw: s.clientWidth, cell: document.querySelector('.cell').getBoundingClientRect().width }; });
  check('zoom makes a crossing at least 28px wide on a 320px phone', z.zoom && z.cell >= 28, z);
  await shot(p, '6-zoom');
  const target = (await p.evaluate(() => { const lg = __kb.state().board; for (let i = 0; i < lg.length; i++) if (!lg[i] && i % 15 > 3 && i % 15 < 11 && Math.floor(i / 15) > 3 && Math.floor(i / 15) < 11) return i; return -1; }));
  await p.evaluate(i => { const c = document.querySelector('.cell[data-i="' + i + '"]'); c.scrollIntoView({ block: 'center', inline: 'center' }); }, target);
  await tapCell(p, target); await tapCell(p, target);
  await wait(p, t => __kb.state().board[t] === 1, target);
  check('in zoom a double tap plays the crossing under the finger', true, null);
  await p.click('#ctl [data-id="zoom"]');
  check('zoom out again', !(await st(p)).zoom, null);
  // the switch: off → one tap plays at once
  await p.evaluate(() => __gomoku.set('conf', 0));
  await wait(p, () => __kb.state().human);
  const free = (await st(p)).board.findIndex((v, i) => !v && i > 100 && i < 110);
  await tapCell(p, free);
  await wait(p, t => __kb.state().board[t] === 1, free);
  check('with "confirm taps" off a single tap plays', true, null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function pass(env) {
  console.log('7. two players on one device');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  await p.click('#tPass'); await wait(p, () => __kb.state().mode === 'pass');
  const a = await st(p);
  check('both sides are human: black first', a.human && a.turn === 1, a);
  await clickCell(p, 112);
  await wait(p, () => __kb.state().turn === 2 && __kb.state().human);
  check('then white can play without the CPU', (await st(p)).human, null);
  const end = await playOut(p, { good: 'cpu' });
  check('the game ends with a result and counts as a two-player game, no ★', end.result && (await stored(p, SAVE)).stats.twop === 1 && (await stored(p, SAVE)).pts === 0, end);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function puzzle(env) {
  console.log('8. the daily puzzle: five positions, chain fours to make five; a wrong move shows the answer; the record; practice');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  const dk = await p.evaluate(() => KoboPlatform.jstDateKey());
  check('the title says what today\'s puzzle is', /5/.test(await p.textContent('#tDailySub')), null);
  await p.click('#tDaily');
  await wait(p, () => __kb.state().mode === 'puzzle' && __kb.state().pz && !__kb.state().title);
  let k = await st(p);
  check('puzzle 1 of 5 has stones on it, no hint button, and says how many moves', k.pz.i === 0 && k.stones >= 6 && !(await p.$('#ctl [data-id="hint"]')) && k.pz.m >= 2 && /黒番/.test(k.status), k.pz);
  await shot(p, '8-puzzle');
  // solve puzzle 1 by clicking the chain of moves
  const solve = async () => {
    for (let guard = 0; guard < 12; guard++) {
      const s0 = await st(p); if (s0.pz.done) return s0;
      const pl = await p.evaluate(() => __gomoku.plan(true));
      await clickCell(p, pl.cell);
      await p.waitForFunction(() => { const q = __kb.state(); return !q.busy && (q.pz.done || q.human === false); }, null, { timeout: 5000 }).catch(() => {});
    }
    return st(p);
  };
  k = await solve();
  check('the chain of fours wins: correct, 200 points', k.pz.done && k.pz.ok && k.pz.res[0][1] === 1 && k.pz.res[0][2] === 200 && k.winner === 1, k.pz);
  check('the five is marked on the board', k.marks.win >= 5, k.marks);
  await shot(p, '8-correct');
  await p.click('#ctl [data-id="next"]');
  await wait(p, () => __kb.state().pz.i === 1 && !__kb.state().pz.done);
  // answer 2: a wrong move
  const pl = await p.evaluate(() => __gomoku.plan(false));
  await clickCell(p, pl.cell);
  k = await st(p);
  check('a wrong move: not correct, 0 points, the answer is drawn with numbers', k.pz.done && !k.pz.ok && k.pz.res[1][2] === 0 && k.nums >= 3, k.pz);
  await shot(p, '8-wrong');
  await p.keyboard.press('Enter');
  await wait(p, () => __kb.state().pz.i === 2);
  check('Enter goes to the next puzzle', true, null);
  const sv = await stored(p, SAVE);
  check('progress is saved (2 answers today)', sv.dl.last === dk && sv.dl.r.length === 2, sv.dl);
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready() && window.__gomoku);
  check('the title shows today\'s progress', /1\/5/.test(await p.textContent('#tDailySub')), await p.textContent('#tDailySub'));
  await speed(p, 0);
  await p.click('#tDaily'); await wait(p, () => __kb.state().mode === 'puzzle' && __kb.state().pz);
  check('opening it again continues at puzzle 3', (await st(p)).pz.i === 2 && (await st(p)).pz.res.length === 2, (await st(p)).pz);
  for (let i = 2; i < 5; i++) { await solve(); await p.click('#ctl [data-id="next"]'); if (i < 4) await wait(p, j => __kb.state().pz.i === j + 1 && !__kb.state().pz.done, i); }
  await wait(p, () => __kb.state().result);
  const sv2 = await stored(p, SAVE);
  check('the summary shows 5 rows; 4 of 5 right', (await p.$$('#rRank li')).length === 5 && sv2.dl.r.filter(x => x[1]).length === 4 && sv2.stats.pz === 4, sv2.dl);
  check('the day is recorded for KoboGame as a daily play with the score', await p.evaluate(dk => { const d = KoboPlatform.daily.get(dk, 'gomoku'); return !!d && d.best === (JSON.parse(localStorage.getItem('kusoge.gomoku.save')).dl.pts); }, dk), null);
  await shot(p, '8-summary');
  await p.click('#rAgain');
  await wait(p, () => __kb.state().pz && __kb.state().pz.practice && !__kb.state().result);
  const pl3 = await p.evaluate(() => __gomoku.plan(false)); await clickCell(p, pl3.cell);
  const sv3 = await stored(p, SAVE);
  check('practice does not change the record', sv3.dl.pts === sv2.dl.pts && sv3.stats.pz === 4, sv3.dl);
  // a day with all five right
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('kusoge.gomoku.save')); s.dl = { last: 0, pts: 0, r: [] }; localStorage.setItem('kusoge.gomoku.save', JSON.stringify(s)); });
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready() && window.__gomoku); await speed(p, 0);
  await p.click('#tDaily'); await wait(p, () => __kb.state().mode === 'puzzle' && !__kb.state().pz.done);
  for (let i = 0; i < 5; i++) { await solve(); await p.click('#ctl [data-id="next"]'); if (i < 4) await wait(p, j => __kb.state().pz.i === j + 1 && !__kb.state().pz.done, i); }
  await wait(p, () => __kb.state().result);
  const sv4 = await stored(p, SAVE);
  check('all five right: 1000 points and the perfect-day count', sv4.dl.pts === 1000 && sv4.stats.dperf === 1, sv4.dl);
  check('?daily=<date> opens the puzzle straight away', await (async () => { const s2 = await open(env, { query: '&daily=' + dk }); const ok = await s2.page.waitForFunction(() => __kb.state().mode === 'puzzle', null, { timeout: 8000 }).then(() => true).catch(() => false); await s2.close(); return ok; })(), null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function resume(env) {
  console.log('9. the game is saved at every move; reload → Continue');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  await startCpu(p, { level: 2, me: 'b', rule: 'std', n: 13 });
  for (let i = 0; i < 3; i++) { await wait(p, () => __kb.state().human); const pl = await p.evaluate(() => __gomoku.plan()); await clickCell(p, pl.cell); await wait(p, () => __kb.state().human || __kb.state().over); }
  const before = await st(p);
  const run = await stored(p, RUN);
  check('the unfinished game is stored with its move list, size and rule', run && run.moves.length >= 6 && run.n === 13 && run.rule === 'std', run && [run.moves.length, run.n, run.rule]);
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready() && window.__gomoku);
  check('the title offers Continue', !(await p.$eval('#tResume', e => e.hidden)), null);
  await p.click('#tResume');
  await wait(p, () => __kb.state().started && !__kb.state().title);
  const after = await st(p);
  check('the same position comes back (board, turn, level, size, rule)', JSON.stringify(after.board) === JSON.stringify(before.board) && after.turn === before.turn && after.level === 2 && after.n === 13 && after.rule === 'std', { a: after.board.join('').slice(0, 60), b: before.board.join('').slice(0, 60) });
  await speed(p, 0);
  const end = await playOut(p, { good: 'cpu' });
  check('the resumed game can be finished, and the stored game is cleared', end.result && (await p.evaluate(k => localStorage.getItem(k), RUN)) === null, end);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function english(env) {
  console.log('10. English');
  const s = await open(env, { lang: 'en' });
  const p = s.page; await speed(p, 0);
  let jp = await p.evaluate(`(${jpScan})(true)`);
  check('title: no Japanese on screen', jp.length === 0, jp.slice(0, 5));
  await startCpu(p, { level: 3, me: 'b' });
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('game: no Japanese on screen', jp.length === 0, jp.slice(0, 5));
  await clickCell(p, 112); await wait(p, () => __kb.state().human);
  await p.evaluate(() => __gomoku.openMenu()); await p.waitForTimeout(150);
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('menu: no Japanese', jp.length === 0, jp.slice(0, 5));
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  await p.keyboard.press('l'); await wait(p, () => __kb.state().movesOv);
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('move list: no Japanese', jp.length === 0, jp.slice(0, 5));
  await p.click('#mClose');
  await p.evaluate(() => __gomoku.howto(false));
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('rules: no Japanese', jp.length === 0, jp.slice(0, 5));
  await p.click('#howtoGo');
  await p.evaluate(() => __gomoku.puzzle());
  await wait(p, () => __kb.state().mode === 'puzzle');
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('daily puzzle: no Japanese', jp.length === 0, jp.slice(0, 5));
  const pl = await p.evaluate(() => __gomoku.plan(false)); await clickCell(p, pl.cell);
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('puzzle answer text: no Japanese', jp.length === 0, jp.slice(0, 5));
  await p.evaluate(() => __gomoku.start({ mode: 'pass', rule: 'renju' }));
  await p.evaluate(rows => __gomoku.rig(rows, 1), rowsOf(15, [[7, 5, 'x'], [7, 6, 'x'], [5, 7, 'x'], [6, 7, 'x'], [2, 2, 'o']]));
  await clickCell(p, 112);
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('forbidden-move message: no Japanese', jp.length === 0 && /Forbidden/.test(await p.textContent('#status')), jp.slice(0, 5));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function layouts(env) {
  console.log('11. every screen size × ja/en × light/dark: nothing sideways, the board is square and on screen, the controls are reachable');
  for (const vp of (process.env.GK_VPS || 'se1,a360s,se2,ip12,land,xr').split(',')) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang });
    const p = s.page; await speed(p, 0);
    const tag = `${vp}/${lang}`;
    let r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} title: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 4), pr: r.primary.slice(0, 3) });
    if (lang === 'ja') await shot(p, `11-${vp}-title`);
    for (const n of [15, 9]) {
      await startCpu(p, { level: 1, me: 'b', n, rule: n === 15 ? 'renju' : 'free' });
      await wait(p, () => __kb.state().human);
      await clickCell(p, (await p.evaluate(() => __gomoku.plan('first'))).cell); await wait(p, () => __kb.state().human);
      r = await p.evaluate(`(${layoutProbe})()`);
      const box = await p.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(), c = document.getElementById('ctl').getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), left: b.left, right: b.right, top: b.top, bottom: b.bottom, ctlBottom: c.bottom, ih: innerHeight, iw: innerWidth, cell: document.querySelector('.cell').getBoundingClientRect().width }; });
      check(`${tag} ${n}x${n}: board is square, inside the window (${box.w}px, ${box.cell.toFixed(1)}px per crossing), the buttons are on screen`, Math.abs(box.w - box.h) <= 1 && box.left >= 0 && box.right <= box.iw && box.bottom <= box.ih && box.ctlBottom <= box.ih + 1 && box.w >= 200, box);
      check(`${tag} ${n}x${n}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 4) });
      if (lang === 'ja' && n === 15 && ['se1', 'land', 'ip12'].includes(vp)) await shot(p, `11-${vp}-game`);
      if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${tag} ${n}x${n}: no Japanese`, jp.length === 0, jp.slice(0, 5)); }
    }
    await p.evaluate(() => __gomoku.finish()); await wait(p, () => __kb.state().result);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} result: fits, the main button is on screen`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 3), pr: r.primary.slice(0, 2) });
    if (vp === 'se1') {
      for (const th of ['dark', 'light']) {
        await p.evaluate(th => document.documentElement.setAttribute('data-kb-theme', th), th); await p.waitForTimeout(80);
        const lum = await p.evaluate(() => { const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number); return 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]; });
        check(`${tag} ${th} theme: the background is ${th}`, th === 'dark' ? lum < 90 : lum > 160, lum);
        await p.click('#rAgain'); await wait(p, () => !__kb.state().result); await shot(p, `11-${vp}-${lang}-${th}`);
        await p.evaluate(() => __gomoku.finish()); await wait(p, () => __kb.state().result);
      }
    }
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
    await s.close();
  }
}

async function lobby(env) {
  console.log('12. online lobby without a network: nickname form, two-seat menu (no player count), keyboard, English');
  for (const [vp, lang] of [['ip12', 'ja'], ['se1', 'en']]) {
    const s = await open(env, { vp, lang });
    const p = s.page;
    await p.click('#tOnline');
    await p.waitForSelector('[data-ktr="nickin"]');
    await p.fill('[data-ktr="nickin"]', 'Moka'); await p.press('[data-ktr="nickin"]', 'Enter');
    await p.waitForSelector('[data-ktr="quick"]');
    check(`${vp}/${lang}: the menu has quick match, make a room and a code field`, !!(await p.$('[data-ktr="make"]')) && !!(await p.$('[data-ktr="code"]')), null);
    check(`${vp}/${lang}: there is no player-count choice (two seats only)`, !(await p.$('.ktr-opt')), null);
    check(`${vp}/${lang}: the CPU-fill switch is there`, !!(await p.$('[data-ktr="fill"]')), null);
    const lay = await p.evaluate(`(${layoutProbe})()`);
    check(`${vp}/${lang}: nothing sideways or off screen`, lay.hscroll <= 1 && lay.offscreen.length === 0, lay.offscreen.slice(0, 3));
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${vp}/${lang}: no Japanese`, jp.length === 0, jp.slice(0, 5)); }
    await shot(p, `12-lobby-${vp}-${lang}`);
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => document.querySelector('.ktr-ov').hidden && !document.getElementById('ovTitle').hidden);
    check(`${vp}/${lang}: Escape goes back to the title`, true, null);
    check(`${vp}/${lang}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
    await s.close();
  }
}

async function online(env) {
  console.log('13. online (emulator): code room → 2 pages play → rematch swaps colours → quick match → a page closes (CPU takes the seat) → the host leaves');
  const emu = await require('./rules/emulator').start({});
  const T = { name: 'emulator', emu: true, ports: emu.ports, ns: emu.ns };
  const { newPage } = require('./rules/clients');
  const url = env.server.url + '/gomoku/?debug&trdeal=300&trcpu=200&trtm=20&trgrace=6&trhost=8&trqm=2&trfill=3';
  const mk = async (nick, vp, lang, seedSet) => {
    const p = await newPage(env.browser(), { url: env.server.url }, T, nick, vp || { width: 390, height: 844 });
    await p.ctx.addInitScript(a => { try { localStorage.setItem('kusoge.gomoku.howto', '1'); if (a.l) localStorage.setItem('kobo.lang', a.l); if (a.set) localStorage.setItem('kusoge.gomoku.save', JSON.stringify({ v: 1, pts: 0, w: {}, stats: {}, set: a.set, dl: { last: 0, pts: 0, r: [] }, tut: 1 })); } catch (e) {} }, { l: lang || 'ja', set: seedSet || null });
    await p.goto(url);
    await p.waitForFunction(() => window.__kb && __kb.ready() && window.__gomoku);
    await speed(p, 0);
    return p;
  };
  const os = p => p.evaluate(() => __gomoku.onlineState());
  const inGame = p => p.evaluate(() => { const s = __kb.state(); return s.net && s.started && !s.title; });
  const playNet = async (p, max) => {
    for (let i = 0; i < (max || 500); i++) {
      const s = await st(p);
      if (s.result) return s;
      if (!s.human) { await p.waitForTimeout(25); continue; }
      const pl = await p.evaluate(() => __gomoku.plan('cpu'));
      if (pl) { await clickCell(p, pl.cell).catch(() => {}); await p.waitForTimeout(40); }
    }
    return st(p);
  };
  try {
    // the host plays on a 13x13 board with the "exactly five" rule: the guest follows what the host decided
    const A = await mk('Aoi', null, 'ja', { level: 2, me: 'b', n: 13, rule: 'std', nums: 0, fbd: 1, conf: 0, fast: 0 }), Bp = await mk('Ben');
    await A.click('#tOnline'); await A.waitForSelector('.ktr-ov:not([hidden]) [data-ktr="make"]');
    check('the lobby opens above the title', !!(await A.$('[data-ktr="quick"]')) && !!(await A.$('[data-ktr="code"]')), null);
    await A.click('[data-ktr="fill"]');
    await A.click('[data-ktr="make"]');
    await A.waitForSelector('[data-ktr="codeshow"]', { timeout: 20000 });
    const code = (await A.textContent('[data-ktr="codeshow"]')).trim();
    check('the host sees a 6-digit code and its own seat, and cannot start alone (no CPU fill)', /^\d{6}$/.test(code) && /Aoi/.test(await A.textContent('.ktr-seats')) && (await A.$$('.ktr-seats li')).length === 2 && await A.$eval('[data-ktr="start"]', e => e.disabled), code);
    await Bp.click('#tOnline'); await Bp.waitForSelector('[data-ktr="code"]');
    await Bp.fill('[data-ktr="code"]', code); await Bp.click('[data-ktr="join"]');
    for (const pg of [A, Bp]) await pg.waitForFunction(() => __kb.state().net && __kb.state().started, null, { timeout: 30000 });
    check('both pages are in the game (a full room starts by itself)', (await Promise.all([A, Bp].map(inGame))).every(Boolean), null);
    const sts = await Promise.all([A, Bp].map(os)), ks = await Promise.all([A, Bp].map(st));
    check('one room, 2 seats, one host; the colours are black and white (one each)', sts.every(x => x.model && x.model.n === 2 && x.rid === sts[0].rid) && sts.filter(x => x.host).length === 1 && new Set(ks.map(k => k.me)).size === 2, ks.map(k => k.me));
    check('the guest\'s board follows the host\'s choice: 13x13, exactly-five rule', ks.every(k => k.n === 13 && k.rule === 'std' && (k.board.length === 169)), ks.map(k => k.n + k.rule));
    check('names are the nicknames and each page knows whose turn it is', ks.every(k => ['Aoi', 'Ben'].every(n => k.names.includes(n))) && ks.filter(k => k.human).length === 1, ks.map(k => k.names + ':' + k.human));
    const firstColor = ks[0].me;
    await shot(A, '13-game-host'); await shot(Bp, '13-game-guest');
    const probe = await Bp.evaluate(async rid => { try { await firebase.database().ref('tr/gomoku/rooms/' + rid).once('value'); return 'readable'; } catch (e) { return /permission/i.test(String(e.code || e.message)) ? 'denied' : String(e); } }, sts[0].rid);
    check('a guest cannot read the whole room from the database', probe === 'denied', probe);
    // the page whose turn it is not tries to move with a real click: nothing happens
    const waiting = (await Promise.all([A, Bp].map(st))).findIndex(k => !k.human);
    const wp = [A, Bp][waiting];
    const before = (await st(wp)).moves;
    await clickCell(wp, 6 * 13 + 6).catch(() => {}); await wp.waitForTimeout(300);
    check('clicking out of turn does nothing', (await st(wp)).board[6 * 13 + 6] === 0 || (await st(wp)).moves > before, null);
    const t0 = Date.now();
    const ends = await Promise.all([playNet(A), playNet(Bp)]);
    check('both pages reach a result', ends.every(x => x.result && x.over), ends.map(x => x.status));
    const same = await Promise.all([A, Bp].map(pg => pg.evaluate(() => { const k = __kb.state(); return k.winner + ':' + k.moves + ':' + k.line.join(','); })));
    check('the same winner, move count and winning line on both pages', same[0] === same[1], same);
    const notes = await Promise.all([A, Bp].map(pg => pg.textContent('#rNote')));
    check('the result says online does not count for ★, no ★ was added, the online stat was', notes.every(n => /★/.test(n)) && (await Promise.all([A, Bp].map(pg => st(pg)))).every(x => x.save.pts === 0 && x.save.stats.onl === 1), notes);
    await shot(A, '13-result');
    check('the game took a sensible time', Date.now() - t0 < 150000, Date.now() - t0);
    for (const pg of [A, Bp]) await pg.click('#rAgain');
    for (const pg of [A, Bp]) await pg.waitForFunction(() => __gomoku.onlineState().model.gn === 2 && __kb.state().started && !__kb.state().result, null, { timeout: 30000 });
    const k2 = await Promise.all([A, Bp].map(st));
    check('rematch: game 2 starts in the same room and the colours are swapped', k2[0].me !== firstColor && k2[0].me !== k2[1].me, k2.map(k => k.me));
    check('the status tells which colour I play now', /くろ|しろ/.test(await A.textContent('#status')), await A.textContent('#status'));
    await Bp.ctx.close();
    await A.waitForFunction(() => /x/.test(__gomoku.onlineState().model.sl), null, { timeout: 40000 });
    check('a closed page: the seat turns into a CPU seat for the other page', true, null);
    const endA = await playNet(A, 700);
    check('the remaining page finishes the game against the CPU', endA.result, endA.status);
    check('no page errors / permission errors (A)', A.errs.filter(e => !/Failed to load resource|net::ERR/.test(e)).length === 0, A.errs.slice(0, 4));
    await A.ctx.close();

    // quick match of two pages
    const Q1 = await mk('Qa'), Q2 = await mk('Qb');
    for (const pg of [Q1, Q2]) { await pg.click('#tOnline'); await pg.waitForSelector('[data-ktr="quick"]'); await pg.click('[data-ktr="fill"]'); }
    await Q1.click('[data-ktr="quick"]'); await Q2.click('[data-ktr="quick"]');
    for (const pg of [Q1, Q2]) await pg.waitForFunction(() => __kb.state().net && __kb.state().started, null, { timeout: 40000 });
    const qs = await Promise.all([Q1, Q2].map(os));
    check('quick match puts two people in the same room (15x15)', qs[0].rid && qs[0].rid === qs[1].rid && (await st(Q1)).n === 15, qs.map(x => x.rid));
    const hostPg = qs[0].host ? Q1 : Q2, guestPg = qs[0].host ? Q2 : Q1;
    await hostPg.evaluate(() => __gomoku.leaveOnline());
    await guestPg.waitForFunction(() => __kb.state().result && /ホスト/.test(document.getElementById('rNote').textContent), null, { timeout: 25000 });
    check('the host leaves: the guest sees the match end with the host-left note, and no rematch', await guestPg.$eval('#rAgain', e => e.disabled), null);
    await shot(guestPg, '13-host-left');
    await Q1.ctx.close(); await Q2.ctx.close();

    // English lobby at 320x568, dark
    const En = await mk('Eve', { width: 320, height: 568 }, 'en');
    await En.click('#tOnline'); await En.waitForSelector('[data-ktr="quick"]');
    const jp = await En.evaluate(`(${jpScan})(true)`);
    check('English lobby: no Japanese on screen', jp.length === 0, jp.slice(0, 5));
    const lay = await En.evaluate(`(${layoutProbe})()`);
    check('English lobby at 320×568: no sideways scroll, nothing off screen', lay.hscroll <= 1 && lay.offscreen.length === 0, lay.offscreen.slice(0, 3));
    await En.evaluate(() => document.documentElement.setAttribute('data-kb-theme', 'dark')); await En.waitForTimeout(80); await shot(En, '13-lobby-en-dark');
    check('English page: no page errors', En.errs.filter(e => !/Failed to load resource|net::ERR/.test(e)).length === 0, En.errs.slice(0, 3));
    await En.ctx.close();
  } finally { await emu.stop(); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2].split(',') : null;
  for (const f of [first, game, keys, aids, forbid, touch, pass, puzzle, resume, english, layouts, lobby, online]) {
    if (only && !only.includes(f.name)) continue;
    if (f === online && !only && process.argv.includes('--no-online')) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
