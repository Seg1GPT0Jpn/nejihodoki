#!/usr/bin/env node
// リバーシ工房の通しプレイ（Playwright。?debug の window.__reversi は「どこを押すか」を聞くだけで、押すのは本物のマウス・キー・タッチ）
//   node tools/tests/reversi-play.js [first,game,keys,aids,pass,puzzle,resume,english,layouts,lobby,online]   （--no-online：エミュレーターを使う online を省く）
// 1. 初回：ルール → タイトル  2. CPUと1ゲームを最後まで本物のクリックで → 結果・保存（★）  3. キーボード（矢印・Enter・H・U・L・Esc）
// 4. ヒント・もどす・棋譜・★がつかない  5. ふたりで1台  6. 今日のパズル（正解・まちがい・保存・れんしゅう）  7. 途中保存 → つづきから
// 8. 英語  9. 全画面サイズ × ja/en × ライト/ダーク  10. オンラインのロビー（ネットなし）
// 11. オンライン（エミュレーター・本物のルール）：コードの部屋・クイックマッチ・2ページで1ゲーム・もう一度（色が入れかわる）・ページが消える（CPUが席に）・ホストが出る
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'reversi-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.reversi.save', RUN = 'kusoge.reversi.game', HOWTO = 'kusoge.reversi.howto';

async function open(env, o = {}) {
  const touch = !!o.touch;
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: touch, hasTouch: touch });
  await s.goto('/reversi/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__reversi);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const speed = (p, m) => p.evaluate(m => __reversi.setSpeed(m), m);
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 15000 });
// click a board cell with the real mouse (the cell is a div: click its centre)
async function clickCell(p, i) {
  const pt = await p.evaluate(i => __reversi.cellPoint(i), i);
  await p.mouse.click(pt.x, pt.y);
}
// play the human seat to the end: take the plan's cell (first legal; 'cpu' = a sensible one) and click it
async function playOut(p, o = {}) {
  const max = o.max || 400;
  for (let i = 0; i < max; i++) {
    const s = await st(p);
    if (s.result) return s;
    if (!s.human) { await p.waitForTimeout(15); continue; }
    const pl = await p.evaluate(g => __reversi.plan(g), o.good || 'cpu');
    if (!pl) { await p.waitForTimeout(20); continue; }
    await clickCell(p, pl.cell);
    await p.waitForTimeout(8);
  }
  return st(p);
}
async function startCpu(p, o) { await p.evaluate(o => __reversi.start(o), o || {}); await wait(p, () => __kb.state().started); }

async function first(env) {
  console.log('1. first visit: the rules, then the title');
  const s = await open(env, { seed: {} });
  const p = s.page;
  check('the rules show first', (await st(p)).howto, null);
  check('the rules say what a legal move is (English or Japanese text present)', /はさ/.test(await p.textContent('#howBody')), null);
  await shot(p, '1-howto');
  await p.click('#howtoGo');
  check('closing the rules shows the title', (await st(p)).title, null);
  check('the first-visit mark is saved', (await p.evaluate(k => localStorage.getItem(k), HOWTO)) === '1', null);
  check('the title offers daily puzzle, online, CPU, two players, rules', !!(await p.$('#tDaily')) && !!(await p.$('#tOnline')) && !!(await p.$('#tPlay')) && !!(await p.$('#tPass')) && !!(await p.$('#tHow')), null);
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
  check('a game starts: 8x8, black to move, 4 stones, 4 dots on screen', k.n === 8 && k.turn === 1 && k.black + k.white === 4 && k.dots === 4 && k.legal.length === 4, k);
  check('the board has 64 cells and the page does not scroll sideways', (await p.$$('.cell')).length === 64 && (await p.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)), null);
  // an illegal click is refused (the corner), nothing changes
  await clickCell(p, 0);
  k = await st(p);
  check('clicking an illegal square changes nothing and says why', k.moves === 0 && /置け/.test(k.status), k.status);
  await shot(p, '2-start');
  const t0 = Date.now();
  const end = await playOut(p, { good: 'cpu' });
  check('the game reaches a result', end.result && end.over, end);
  check('a game ends with the board full or nobody able to move', end.black + end.white + end.empty === 64, end);
  await shot(p, '2-result');
  const sv = await stored(p, SAVE);
  check('the record counted a play', sv.stats.plays === 1 && sv.w['8-1'].p === 1, sv);
  const won = end.black > end.white;
  check('a win adds ★ 1 (Easy) once; a loss adds none', sv.pts === (won ? 1 : 0), { pts: sv.pts, won });
  check('the result shows the score and no unfinished game is left', /\d+/.test(await p.textContent('#rSub')) && (await p.evaluate(k => localStorage.getItem(k), RUN)) === null, null);
  check('the game took a sensible time', Date.now() - t0 < 120000, Date.now() - t0);
  // again
  await p.click('#rAgain');
  await wait(p, () => __kb.state().started && !__kb.state().result && __kb.state().moves === 0);
  check('play again starts a fresh game with the same settings', (await st(p)).level === 1, null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function keys(env) {
  console.log('3. keyboard: arrows move the cursor, Enter plays, H hint, U undo, L moves, Esc menu');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  await startCpu(p, { level: 1, me: 'b' });
  await p.keyboard.press('ArrowDown');
  const cur = await p.evaluate(() => __reversi.S.cur);
  check('an arrow key moves the cursor and focuses the cell', (await p.evaluate(() => document.activeElement && document.activeElement.classList.contains('cell'))) && Number.isInteger(cur), cur);
  // move the cursor to a legal square with arrows and press Enter
  const target = (await st(p)).legal[0];
  for (let i = 0; i < 20; i++) {
    const c = await p.evaluate(() => __reversi.S.cur);
    if (c === target) break;
    const dr = Math.floor(target / 8) - Math.floor(c / 8), dc = target % 8 - c % 8;
    await p.keyboard.press(dr > 0 ? 'ArrowDown' : dr < 0 ? 'ArrowUp' : dc > 0 ? 'ArrowRight' : 'ArrowLeft');
  }
  check('the cursor reached the target square', (await p.evaluate(() => __reversi.S.cur)) === target, target);
  await p.keyboard.press('Enter');
  await wait(p, () => __kb.state().moves >= 1);
  check('Enter plays the move under the cursor', (await st(p)).moves >= 1, null);
  await wait(p, () => __kb.state().human);
  await p.keyboard.press('h');
  await wait(p, () => __kb.state().hint >= 0);
  check('H lights up a suggested square', (await st(p)).hint >= 0 && (await st(p)).legal.includes((await st(p)).hint), null);
  await p.keyboard.press('l');
  await wait(p, () => __kb.state().movesOv);
  check('L opens the move list with moves in it', (await p.$$('#mList li')).length >= 2, null);
  await p.keyboard.press('Escape');
  await wait(p, () => !__kb.state().movesOv);
  check('Esc closes the move list', true, null);
  await p.keyboard.press('u');
  await wait(p, () => __kb.state().undone === 1);
  check('U takes the move back', (await st(p)).moves === 0, await st(p));
  await shot(p, '3-keys');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function aids(env) {
  console.log('4. hint, undo and the move list; using them means no ★');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  await startCpu(p, { level: 1, me: 'b' });
  await p.click('#ctl [data-id="hint"]');
  await wait(p, () => __kb.state().hint >= 0);
  const h = (await st(p)).hint;
  check('the hint button highlights a legal square and says so', (await st(p)).legal.includes(h) && /:|：/.test(await p.textContent('#status')) && !!(await p.$('.cell.ht')), null);
  await shot(p, '4-hint');
  check('the undo button is disabled before any move', await p.$eval('#ctl [data-id="undo"]', e => e.disabled), null);
  await clickCell(p, h);
  await wait(p, () => __kb.state().moves >= 2 && __kb.state().human);
  check('after my move and the CPU\'s, undo is enabled', !(await p.$eval('#ctl [data-id="undo"]', e => e.disabled)), null);
  await p.click('#ctl [data-id="undo"]');
  await wait(p, () => __kb.state().undone === 1);
  const k = await st(p);
  check('undo goes back to before my move: 4 stones, black to move, hint cleared', k.moves === 0 && k.black + k.white === 4 && k.turn === 1 && k.hint === -1, k);
  await p.click('#ctl [data-id="moves"]');
  await wait(p, () => __kb.state().movesOv);
  check('the move list is open and says there are no moves yet', /まだ/.test(await p.textContent('#mSub')) || (await p.$$('#mList li')).length === 0, null);
  await p.click('#mClose');
  await wait(p, () => !__kb.state().movesOv);
  // finish the game: no ★ because aids were used
  await speed(p, 0);
  const end = await playOut(p, { good: 'cpu' });
  const sv = await stored(p, SAVE);
  check('a game with hint and undo gives no ★ and says why', sv.pts === 0 && (!(end.black > end.white) || /★/.test(await p.textContent('#rNote'))), { pts: sv.pts, note: await p.textContent('#rNote') });
  // white: the CPU moves first
  await p.click('#rTitleBtn'); await p.waitForSelector('#tPlay');
  await p.click('#optMe [data-me="w"]'); await p.click('#tPlay');
  await wait(p, () => __kb.state().started && __kb.state().moves >= 1);
  const w = await st(p);
  check('playing white: the CPU opened and it is my turn', w.me === 2 && w.turn === 2 && w.human, w);
  // 6x6
  await p.click('#menuBtn'); await p.waitForTimeout(100);
  await p.evaluate(() => __reversi.title()); await p.click('#optN [data-n="6"]'); await p.click('#tPlay');
  await wait(p, () => __kb.state().n === 6);
  check('6x6: 36 cells', (await p.$$('.cell')).length === 36, null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function pass(env) {
  console.log('5. two players on one device');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  await p.click('#tPass'); await wait(p, () => __kb.state().mode === 'pass');
  const a = await st(p);
  check('both sides are human: black first', a.human && a.turn === 1, a);
  await clickCell(p, a.legal[0]);
  await wait(p, () => __kb.state().turn === 2 && __kb.state().human);
  check('then white can play without the CPU', (await st(p)).human, null);
  const end = await playOut(p, { good: 'first' });
  check('the game ends with a result and counts as a two-player game, no ★', end.result && (await stored(p, SAVE)).stats.twop === 1 && (await stored(p, SAVE)).pts === 0, end);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function puzzle(env) {
  console.log('6. the daily puzzle: five positions, a right and a wrong answer, the record, practice');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  const dk = await p.evaluate(() => KoboPlatform.jstDateKey());
  check('the title says what today\'s puzzle is', /5/.test(await p.textContent('#tDailySub')), null);
  await p.click('#tDaily');
  await wait(p, () => __kb.state().mode === 'puzzle' && __kb.state().pz && !__kb.state().title);
  let k = await st(p);
  check('puzzle 1 of 5 shows legal squares as dots and no hint button', k.pz.i === 0 && k.dots >= 3 && !(await p.$('#ctl [data-id="hint"]')), k);
  await shot(p, '6-puzzle');
  // answer 1: the right move — select (click), the OK button is enabled, then confirm by clicking it
  let pl = await p.evaluate(() => __reversi.plan(true));
  check('OK is disabled before choosing', await p.$eval('#ctl [data-id="ok"]', e => e.disabled), null);
  await clickCell(p, pl.cell);
  check('the first tap only selects the square', (await st(p)).sel === pl.cell && !(await st(p)).pz.done, await st(p));
  await p.click('#ctl [data-id="ok"]');
  k = await st(p);
  check('the right move: correct, 200 points, the best square is marked green', k.pz.done && k.pz.ok && k.pz.res[0][2] === 200 && !!(await p.$('.cell.bs')), k.pz);
  await shot(p, '6-correct');
  await p.click('#ctl [data-id="next"]');
  await wait(p, () => __kb.state().pz.i === 1 && !__kb.state().pz.done);
  // answer 2: a wrong move (tap the same square twice to confirm)
  pl = await p.evaluate(() => __reversi.plan(false));
  await clickCell(p, pl.cell); await clickCell(p, pl.cell);
  k = await st(p);
  check('a wrong move: not correct, fewer than 200 points, the best square is shown and the mistake is red', k.pz.done && !k.pz.ok && k.pz.res[1][2] < 200 && !!(await p.$('.cell.bs')) && !!(await p.$('.cell.bad')), k.pz);
  await shot(p, '6-wrong');
  await p.keyboard.press('Enter');
  await wait(p, () => __kb.state().pz.i === 2);
  check('Enter goes to the next puzzle', true, null);
  // the record is kept while playing: reload and continue at puzzle 3
  const sv = await stored(p, SAVE);
  check('progress is saved (2 answers today)', sv.dl.last === dk && sv.dl.r.length === 2, sv.dl);
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready() && window.__reversi);
  check('the title shows today\'s progress', /1\/5/.test(await p.textContent('#tDailySub')), await p.textContent('#tDailySub'));
  await speed(p, 0);
  await p.click('#tDaily'); await wait(p, () => __kb.state().mode === 'puzzle' && __kb.state().pz);
  check('opening it again continues at puzzle 3 (you cannot answer puzzle 1 again)', (await st(p)).pz.i === 2 && (await st(p)).pz.res.length === 2, (await st(p)).pz);
  for (let i = 2; i < 5; i++) {
    pl = await p.evaluate(() => __reversi.plan(true)); await clickCell(p, pl.cell); await p.click('#ctl [data-id="ok"]');
    await p.click('#ctl [data-id="next"]');
  }
  await wait(p, () => __kb.state().result);
  const sv2 = await stored(p, SAVE);
  check('the summary shows 5 rows; 4 of 5 right, total 4×200 + the wrong one', (await p.$$('#rRank li')).length === 5 && sv2.dl.r.filter(x => x[1]).length === 4 && sv2.stats.pz === 4, sv2.dl);
  check('the day is recorded for KoboGame as a daily play with the score', await p.evaluate(dk => { const d = KoboPlatform.daily.get(dk, 'reversi'); return !!d && d.best === (JSON.parse(localStorage.getItem('kusoge.reversi.save')).dl.pts); }, dk), null);
  await shot(p, '6-summary');
  await p.click('#rAgain');
  await wait(p, () => __kb.state().pz && __kb.state().pz.practice && !__kb.state().result);
  pl = await p.evaluate(() => __reversi.plan(false)); await clickCell(p, pl.cell); await clickCell(p, pl.cell);
  const sv3 = await stored(p, SAVE);
  check('practice does not change the record', sv3.dl.pts === sv2.dl.pts && sv3.stats.pz === 4, sv3.dl);
  // a day with all five right
  await p.evaluate(() => { const s = JSON.parse(localStorage.getItem('kusoge.reversi.save')); s.dl = { last: 0, pts: 0, r: [] }; localStorage.setItem('kusoge.reversi.save', JSON.stringify(s)); });
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready() && window.__reversi); await speed(p, 0);
  await p.click('#tDaily'); await wait(p, () => __kb.state().mode === 'puzzle' && !__kb.state().pz.done);
  for (let i = 0; i < 5; i++) { pl = await p.evaluate(() => __reversi.plan(true)); await clickCell(p, pl.cell); await p.click('#ctl [data-id="ok"]'); await p.click('#ctl [data-id="next"]'); }
  await wait(p, () => __kb.state().result);
  const sv4 = await stored(p, SAVE);
  check('all five right: 1000 points and the perfect-day count', sv4.dl.pts === 1000 && sv4.stats.dperf === 1, sv4.dl);
  check('?daily=<date> opens the puzzle straight away', await (async () => { const s2 = await open(env, { query: '&daily=' + dk }); const ok = await s2.page.waitForFunction(() => __kb.state().mode === 'puzzle', null, { timeout: 8000 }).then(() => true).catch(() => false); await s2.close(); return ok; })(), null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function resume(env) {
  console.log('7. the game is saved at every move; reload → Continue');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  await startCpu(p, { level: 2, me: 'b' });
  for (let i = 0; i < 3; i++) { await wait(p, () => __kb.state().human); const pl = await p.evaluate(() => __reversi.plan()); await clickCell(p, pl.cell); await wait(p, () => __kb.state().human || __kb.state().over); }
  const before = await st(p);
  const run = await stored(p, RUN);
  check('the unfinished game is stored with its move list', run && run.moves.length >= 6, run && run.moves.length);
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready() && window.__reversi);
  check('the title offers Continue', !(await p.$eval('#tResume', e => e.hidden)), null);
  await p.click('#tResume');
  await wait(p, () => __kb.state().started && !__kb.state().title);
  const after = await st(p);
  check('the same position comes back (board, turn, level)', JSON.stringify(after.board) === JSON.stringify(before.board) && after.turn === before.turn && after.level === 2, { a: after.board.join(''), b: before.board.join('') });
  await speed(p, 0);
  const end = await playOut(p, { good: 'cpu' });
  check('the resumed game can be finished, and the stored game is cleared', end.result && (await p.evaluate(k => localStorage.getItem(k), RUN)) === null, end);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function english(env) {
  console.log('8. English');
  const s = await open(env, { lang: 'en' });
  const p = s.page; await speed(p, 0);
  let jp = await p.evaluate(`(${jpScan})(true)`);
  check('title: no Japanese on screen', jp.length === 0, jp.slice(0, 5));
  await startCpu(p, { level: 3, me: 'b' });
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('game: no Japanese on screen', jp.length === 0, jp.slice(0, 5));
  await clickCell(p, (await st(p)).legal[0]); await wait(p, () => __kb.state().human);
  await p.click('#ctl [data-id="moves"]'); await wait(p, () => __kb.state().movesOv);
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('move list: no Japanese', jp.length === 0, jp.slice(0, 5));
  await p.click('#mClose');
  await p.evaluate(() => __reversi.howto(false));
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('rules: no Japanese', jp.length === 0, jp.slice(0, 5));
  await p.click('#howtoGo');
  await p.evaluate(() => __reversi.puzzle());
  await wait(p, () => __kb.state().mode === 'puzzle');
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('daily puzzle: no Japanese', jp.length === 0, jp.slice(0, 5));
  const pl = await p.evaluate(() => __reversi.plan(false)); await clickCell(p, pl.cell); await clickCell(p, pl.cell);
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('puzzle answer text: no Japanese', jp.length === 0, jp.slice(0, 5));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function layouts(env) {
  console.log('9. every screen size × ja/en × light/dark: nothing sideways, the board is square and on screen, the controls are reachable');
  for (const vp of (process.env.RV_VPS || 'se1,a360s,se2,ip12,land,xr').split(',')) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang });
    const p = s.page; await speed(p, 0);
    const tag = `${vp}/${lang}`;
    let r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} title: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 4), pr: r.primary.slice(0, 3) });
    if (lang === 'ja') await shot(p, `9-${vp}-title`);
    for (const n of [8, 6]) {
      await startCpu(p, { level: 1, me: 'b', n });
      await wait(p, () => __kb.state().human);
      await clickCell(p, (await st(p)).legal[0]); await wait(p, () => __kb.state().human);
      r = await p.evaluate(`(${layoutProbe})()`);
      const box = await p.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(), c = document.getElementById('ctl').getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), left: b.left, right: b.right, top: b.top, bottom: b.bottom, ctlBottom: c.bottom, ih: innerHeight, iw: innerWidth }; });
      check(`${tag} ${n}x${n}: board is square, inside the window (${box.w}px), the buttons are on screen`, Math.abs(box.w - box.h) <= 1 && box.left >= 0 && box.right <= box.iw && box.bottom <= box.ih && box.ctlBottom <= box.ih + 1 && box.w >= 200, box);
      check(`${tag} ${n}x${n}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 4) });
      if (lang === 'ja' && n === 8 && ['se1', 'land', 'ip12'].includes(vp)) await shot(p, `9-${vp}-game`);
      if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${tag} ${n}x${n}: no Japanese`, jp.length === 0, jp.slice(0, 5)); }
    }
    // the result overlay and the dark theme
    await p.evaluate(() => __reversi.finish()); await wait(p, () => __kb.state().result);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} result: fits, the main button is on screen`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 3), pr: r.primary.slice(0, 2) });
    if (vp === 'se1') {
      for (const th of ['dark', 'light']) {
        await p.evaluate(th => document.documentElement.setAttribute('data-kb-theme', th), th); await p.waitForTimeout(80);
        const lum = await p.evaluate(() => { const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number); return 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]; });
        check(`${tag} ${th} theme: the background is ${th}`, th === 'dark' ? lum < 90 : lum > 160, lum);
        await p.click('#rAgain'); await wait(p, () => !__kb.state().result); await shot(p, `9-${vp}-${lang}-${th}`);
        await p.evaluate(() => __reversi.finish()); await wait(p, () => __kb.state().result);
      }
    }
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
    await s.close();
  }
}

async function lobby(env) {
  console.log('10. online lobby without a network: nickname form, two-seat menu (no player count), keyboard, English');
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
    await shot(p, `10-lobby-${vp}-${lang}`);
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => document.querySelector('.ktr-ov').hidden && !document.getElementById('ovTitle').hidden);
    check(`${vp}/${lang}: Escape goes back to the title`, true, null);
    check(`${vp}/${lang}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
    await s.close();
  }
}

async function online(env) {
  console.log('11. online (emulator): code room → 2 pages play → rematch swaps colours → quick match → a page closes (CPU takes the seat) → the host leaves');
  const emu = await require('./rules/emulator').start({});
  const T = { name: 'emulator', emu: true, ports: emu.ports, ns: emu.ns };
  const { newPage } = require('./rules/clients');
  const url = env.server.url + '/reversi/?debug&trdeal=300&trcpu=200&trtm=20&trgrace=6&trhost=8&trqm=2&trfill=3';
  const mk = async (nick, vp, lang) => {
    const p = await newPage(env.browser(), { url: env.server.url }, T, nick, vp || { width: 390, height: 844 });
    await p.ctx.addInitScript(l => { try { localStorage.setItem('kusoge.reversi.howto', '1'); if (l) localStorage.setItem('kobo.lang', l); } catch (e) {} }, lang || 'ja');
    await p.goto(url);
    await p.waitForFunction(() => window.__kb && __kb.ready() && window.__reversi);
    await speed(p, 0);
    return p;
  };
  const os = p => p.evaluate(() => __reversi.onlineState());
  const inGame = p => p.evaluate(() => { const s = __kb.state(); return s.net && s.started && !s.title; });
  const playNet = async (p, max) => {
    for (let i = 0; i < (max || 400); i++) {
      const s = await st(p);
      if (s.result) return s;
      if (!s.human) { await p.waitForTimeout(25); continue; }
      const pl = await p.evaluate(() => __reversi.plan('cpu'));
      if (pl) { await clickCell(p, pl.cell).catch(() => {}); await p.waitForTimeout(40); }
    }
    return st(p);
  };
  try {
    const A = await mk('Aoi'), Bp = await mk('Ben');
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
    check('names are the nicknames and each page knows whose turn it is', ks.every(k => ['Aoi', 'Ben'].every(n => k.names.includes(n))) && ks.filter(k => k.human).length === 1, ks.map(k => k.names + ':' + k.human));
    const firstColor = ks[0].me;
    await shot(A, '11-game-host'); await shot(Bp, '11-game-guest');
    const probe = await Bp.evaluate(async rid => { try { await firebase.database().ref('tr/reversi/rooms/' + rid).once('value'); return 'readable'; } catch (e) { return /permission/i.test(String(e.code || e.message)) ? 'denied' : String(e); } }, sts[0].rid);
    check('a guest cannot read the whole room from the database', probe === 'denied', probe);
    // the guest tries to move out of turn with a real click: nothing happens
    const waiting = (await Promise.all([A, Bp].map(st))).findIndex(k => !k.human);
    const wp = [A, Bp][waiting];
    const before = (await st(wp)).moves;
    await clickCell(wp, 19).catch(() => {}); await wp.waitForTimeout(300);
    check('clicking out of turn does nothing', (await st(wp)).moves <= before + 1, null);
    const t0 = Date.now();
    const ends = await Promise.all([playNet(A), playNet(Bp)]);
    check('both pages reach a result', ends.every(x => x.result && x.over), ends.map(x => x.status));
    const same = await Promise.all([A, Bp].map(pg => pg.evaluate(() => { const k = __kb.state(); return k.black + ':' + k.white; })));
    check('the same score on both pages', same[0] === same[1], same);
    const notes = await Promise.all([A, Bp].map(pg => pg.textContent('#rNote')));
    check('the result says online does not count for ★, no ★ was added, the online stat was', notes.every(n => /★/.test(n)) && (await Promise.all([A, Bp].map(pg => st(pg)))).every(x => x.save.pts === 0 && x.save.stats.onl === 1), notes);
    await shot(A, '11-result');
    check('the game took a sensible time', Date.now() - t0 < 120000, Date.now() - t0);
    // rematch: colours swap
    for (const pg of [A, Bp]) await pg.click('#rAgain');
    for (const pg of [A, Bp]) await pg.waitForFunction(() => __reversi.onlineState().model.gn === 2 && __kb.state().started && !__kb.state().result, null, { timeout: 30000 });
    const k2 = await Promise.all([A, Bp].map(st));
    check('rematch: game 2 starts in the same room and the colours are swapped', k2[0].me !== firstColor && k2[0].me !== k2[1].me, k2.map(k => k.me));
    check('the status tells which colour I play now', /くろ|しろ/.test(await A.textContent('#status')), await A.textContent('#status'));
    // Bp closes its tab: A's opponent seat turns into a CPU
    await Bp.ctx.close();
    await A.waitForFunction(() => /x/.test(__reversi.onlineState().model.sl), null, { timeout: 40000 });
    check('a closed page: the seat turns into a CPU seat for the other page', true, null);
    const endA = await playNet(A, 600);
    check('the remaining page finishes the game against the CPU', endA.result, endA.status);
    check('no page errors / permission errors (A)', A.errs.filter(e => !/Failed to load resource|net::ERR/.test(e)).length === 0, A.errs.slice(0, 4));
    await A.ctx.close();

    // quick match of two pages
    const Q1 = await mk('Qa'), Q2 = await mk('Qb');
    for (const pg of [Q1, Q2]) { await pg.click('#tOnline'); await pg.waitForSelector('[data-ktr="quick"]'); await pg.click('[data-ktr="fill"]'); }
    await Q1.click('[data-ktr="quick"]'); await Q2.click('[data-ktr="quick"]');
    for (const pg of [Q1, Q2]) await pg.waitForFunction(() => __kb.state().net && __kb.state().started, null, { timeout: 40000 });
    const qs = await Promise.all([Q1, Q2].map(os));
    check('quick match puts two people in the same room', qs[0].rid && qs[0].rid === qs[1].rid, qs.map(x => x.rid));
    // the host leaves a running game on purpose: the guest's match ends
    const hostPg = qs[0].host ? Q1 : Q2, guestPg = qs[0].host ? Q2 : Q1;
    await hostPg.evaluate(() => __reversi.leaveOnline());
    await guestPg.waitForFunction(() => __kb.state().result && /ホスト/.test(document.getElementById('rNote').textContent), null, { timeout: 25000 });
    check('the host leaves: the guest sees the match end with the host-left note, and no rematch', await guestPg.$eval('#rAgain', e => e.disabled), null);
    await shot(guestPg, '11-host-left');
    await Q1.ctx.close(); await Q2.ctx.close();

    // English lobby at 320x568, dark
    const En = await mk('Eve', { width: 320, height: 568 }, 'en');
    await En.click('#tOnline'); await En.waitForSelector('[data-ktr="quick"]');
    const jp = await En.evaluate(`(${jpScan})(true)`);
    check('English lobby: no Japanese on screen', jp.length === 0, jp.slice(0, 5));
    const lay = await En.evaluate(`(${layoutProbe})()`);
    check('English lobby at 320×568: no sideways scroll, nothing off screen', lay.hscroll <= 1 && lay.offscreen.length === 0, lay.offscreen.slice(0, 3));
    await En.evaluate(() => document.documentElement.setAttribute('data-kb-theme', 'dark')); await En.waitForTimeout(80); await shot(En, '11-lobby-en-dark');
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
  for (const f of [first, game, keys, aids, pass, puzzle, resume, english, layouts, lobby, online]) {
    if (only && !only.includes(f.name)) continue;
    if (f === online && !only && process.argv.includes('--no-online')) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
