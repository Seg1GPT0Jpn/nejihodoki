#!/usr/bin/env node
// ナンバー工房の通しプレイ（Playwright。?debug の window.__sudoku は「どこを押すか」「中の状態」を聞くだけで、押すのは本物のマウス・キー・タッチ）
//   node tools/tests/sudoku-play.js [first,play,keys,numfirst,notes,hint,daily,code,variants,resume,pause,touch,loading,online,english,layouts]   … 全部で約2〜3分
//  1. 初回：遊び方 → 9×9 入門が始まる（Worker で作る）
//  2. 本物のクリックで入れる・まちがい（赤・ミス数）・消す・同じ数字でもどる・決まったマスは動かない・やり直し／戻す・最後まで解く → 結果・記録・ベスト・保存
//  3. キーボード：数字・矢印・Backspace・N・Z・Y・H・Esc
//  4. 数字を先に選ぶ（設定）：数字を選んでマスを次々にタップ・なぞって入れる・消す
//  5. メモ：メモモード・自動メモ（候補をそろえる・入れると同じ行列ブロックから消える）・戻す
//  6. ヒント：ワザの名前と理由・「なぜ？」「実行する」・まちがいを先に指す・最後までヒントだけで解ける・ヒントを使うとベストに入らない
//  7. 今日の1問：全員同じ・解いて連続日数とその日のベスト
//  8. コード：コピー・コードで開く（同じパズル）・まちがったコード・?code= の URL
//  9. 4×4・6×6・Xナンバー：本物のクリックで解く
// 10. 途中保存：再読み込み →「つづきから」で同じ盤・メモ・時間・戻す履歴
// 11. 一時停止：メニューで時間が止まり、盤がかくれる
// 12. タッチ：CDP のタップで入れる
// 13. 作るのに時間がかかる問題：読み込み中の表示（Worker）
// 13b. オンライン対戦の練習（common/versus.js）：同じ seed → 同じパズル・正しいマス10点・ミス−15点・完成で5000＋のこり時間・保存しない・終了後に元のパズルへ
// 14. 英語：日本語が残らない
// 15. 全画面サイズ × ja/en × ライト/ダーク：横スクロールなし・ボタンが画面内・盤が正方形
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const E = require('../../sudoku/engine.js');

const OUT = path.join(__dirname, 'out', 'shots', 'sudoku-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 700)}`); };
const SAVE = 'kusoge.sudoku.save', RUN = 'kusoge.sudoku.run', HOWTO = 'kusoge.sudoku.howto', DC = 'kusoge.sudoku.dc';

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: !!o.touch, hasTouch: !!o.touch });
  if (o.dark !== undefined) await s.page.emulateMedia({ colorScheme: o.dark ? 'dark' : 'light' });
  await s.goto('/sudoku/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__sudoku);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const startPuzzle = async (p, spec, mode) => { await p.evaluate(([s, m]) => __sudoku.start(s, m), [spec, mode || 'normal']); await p.waitForFunction(() => __kb.state().playing, null, { timeout: 15000 }); await p.waitForFunction(() => document.getElementById('ovLoading').hidden); };
const cellPt = (p, i) => p.evaluate(i => __sudoku.api.cellPoint(i), i);
async function clickCell(p, i) { const pt = await cellPt(p, i); await p.mouse.click(pt.x, pt.y); }
async function putDigit(p, i, d) { await clickCell(p, i); await p.click('#pk' + d); }
const cellCls = (p, i) => p.$eval('#c' + i, e => e.className);
const empties = s => { const o = []; for (let i = 0; i < s.vals.length; i++) if (s.vals[i] === '0') o.push(i); return o; };
async function solveByClicks(p, o = {}) {
  let s = await st(p);
  for (const i of empties(s)) { if (o.leave != null && i === o.leave) continue; await putDigit(p, i, +s.solution[i]); }
}
const waitResult = p => p.waitForFunction(() => __kb.state().result, null, { timeout: 8000 });
const SPEC1 = { size: 9, variant: 'n', level: 1, seed: 101 };

async function first(env) {
  console.log('1. first visit: how to play, then a 9x9 beginner puzzle');
  const s = await open(env, { seed: {} });
  const p = s.page;
  let a = await st(p);
  check('a first visit shows the rules', a.howto, a);
  await shot(p, '1-howto');
  await p.click('#howtoGo');
  await p.waitForFunction(() => __kb.state().playing, null, { timeout: 15000 });
  a = await st(p);
  check('the first puzzle is 9x9 beginner, nothing filled by the player', a.size === 9 && a.level === 1 && a.variant === 'n' && a.vals === a.givens, a);
  check('a beginner puzzle has plenty of clues (36)', a.clues === 36, a.clues);
  check('the board has 81 cells', (await p.$$('#board .c')).length === 81, null);
  check('the pad has 9 digits with counts left', (await p.$$('#pad .pk')).length === 9, null);
  // the page and the node engine agree (the Worker runs the same file)
  const node = E.generate({ size: 9, variant: 'n', level: 1, seed: a.seed });
  check('the Worker made the same puzzle as the node engine for that seed', a.givens === node.givens.join(''), { page: a.givens, node: node.givens.join('') });
  check('no page errors', s.log.pageErrors.length === 0 && s.log.consoleErrors.length === 0, [s.log.pageErrors, s.log.consoleErrors].flat().slice(0, 3));
  await shot(p, '1-first-puzzle');
  await s.close();
}

async function play(env) {
  console.log('2. real clicks: put digits, mistakes, erase, solve, result and saved records');
  const s = await open(env);
  const p = s.page;
  await startPuzzle(p, SPEC1);
  let a = await st(p);
  const E1 = empties(a), i0 = E1[0], i1 = E1[1];
  const right0 = +a.solution[i0], wrong0 = right0 % 9 + 1;
  await clickCell(p, i0);
  check('clicking a cell selects it (and lights its row, column and box)', (await st(p)).sel === i0 && /\bsel\b/.test(await cellCls(p, i0)), await st(p));
  const peer = [...Array(81).keys()].find(c => c !== i0 && (Math.floor(c / 9) === Math.floor(i0 / 9)));
  check('peers of the selected cell are tinted', /\bpe\b/.test(await cellCls(p, peer)), await cellCls(p, peer));
  await p.click('#pk' + wrong0);
  a = await st(p);
  check('a pad digit goes into the selected cell', a.vals[i0] === String(wrong0), a.vals[i0]);
  check('a wrong digit is shown red and counted as a mistake', a.mistakes === 1 && /\bwr\b/.test(await cellCls(p, i0)), { m: a.mistakes, cls: await cellCls(p, i0) });
  await p.click('#pk' + wrong0);
  a = await st(p);
  check('pressing the same digit again takes it out', a.vals[i0] === '0', a.vals[i0]);
  await p.click('#pk' + right0);
  a = await st(p);
  check('the right digit is accepted, no new mistake', a.vals[i0] === String(right0) && a.mistakes === 1 && !/\bwr\b/.test(await cellCls(p, i0)), a);
  const left = await p.$eval('#pk' + right0 + ' small', e => e.textContent);
  check('the pad shows how many of that digit are left', +left === 9 - [...a.vals].filter(c => c === String(right0)).length || left === '', left);
  // a given cell cannot be changed
  const g0 = [...a.givens].findIndex(c => c !== '0');
  await clickCell(p, g0); await p.click('#pk5');
  a = await st(p);
  check('a given digit cannot be changed', a.vals[g0] === a.givens[g0], a);
  // erase button, undo, redo
  await clickCell(p, i0); await p.click('#btnErase');
  a = await st(p); check('the erase button clears the cell', a.vals[i0] === '0', a);
  await p.click('#btnUndo'); a = await st(p); check('undo brings it back', a.vals[i0] === String(right0), a);
  await p.click('#btnRedo'); a = await st(p); check('redo erases it again', a.vals[i0] === '0', a);
  check('redo is disabled when there is nothing to redo', await p.$eval('#btnRedo', e => e.disabled), null);
  // many moves, then undo them all
  for (const i of E1.slice(0, 12)) await putDigit(p, i, +a.solution[i]);
  a = await st(p); const nUndo = a.undo; check('every move is one undo step (no limit)', nUndo >= 12, nUndo);
  for (let k = 0; k < nUndo; k++) await p.click('#btnUndo');
  a = await st(p); check('undo all the way back to the start', a.vals === a.givens && a.undo === 0, a);
  check('the timer runs', a.ms >= 0, a.ms);
  // solve it: leave one cell, then fill it with a real click
  const last = (await st(p)).vals.indexOf('0');
  await solveByClicks(p, { leave: last });
  a = await st(p);
  check('one cell left, not solved yet', empties(a).length === 1 && a.playing && !a.result, a);
  await shot(p, '2-almost');
  await p.evaluate(() => __sudoku.api.advance(65000));
  await putDigit(p, last, +a.solution[last]);
  await waitResult(p);
  a = await st(p);
  check('solving shows the result with time, mistakes and hints', a.result && a.last && a.last.mistakes === 1 && a.last.ms >= 65000, a.last);
  check('a puzzle that had a mistake still counts as solved', a.save.stats.solved === 1 && a.save.st['9n-1'].n === 1, a.save);
  check('the best time is saved only without hints (none used)', a.save.st['9n-1'].b >= 65000 && a.last.newBest, a.save.st);
  check('points for a clean 9x9 solve (level 1)', a.save.pts === 1, a.save.pts);
  check('the code for this puzzle is shown', (await p.$eval('#rCode', e => e.textContent)) === a.code && /^SD9N1-/.test(a.code), a.code);
  await shot(p, '2-result');
  const rec = await stored(p, SAVE);
  check('the record is in localStorage (kusoge.sudoku.save)', rec && rec.stats.solved === 1 && rec.stats.l1 === 1, rec);
  check('the puzzle in progress is cleared once solved', (await stored(p, RUN)) === null, null);
  await p.click('#rNext');
  await p.waitForFunction(() => __kb.state().playing && !__kb.state().result, null, { timeout: 15000 });
  a = await st(p); check('"next puzzle" starts another one of the same level', a.level === 1 && a.seed !== SPEC1.seed && a.vals === a.givens, a);
  // a second, faster clean solve updates the best; a slower one does not
  await p.evaluate(() => __sudoku.api.advance(20000));
  await solveByClicks(p); await waitResult(p);
  a = await st(p); check('a faster solve lowers the best time', a.save.st['9n-1'].b < 65000 && a.last.newBest && a.save.st['9n-1'].n === 2, a.save.st);
  check('no page errors', s.log.pageErrors.length === 0 && s.log.consoleErrors.length === 0, [s.log.pageErrors, s.log.consoleErrors].flat().slice(0, 3));
  await s.close();
}

async function keys(env) {
  console.log('3. keyboard: digits, arrows, Backspace, N, Z, Y, H, Esc');
  const s = await open(env);
  const p = s.page;
  await startPuzzle(p, SPEC1);
  let a = await st(p); const E1 = empties(a); const i0 = E1[0];
  await clickCell(p, i0);
  const right = +a.solution[i0];
  await p.keyboard.press(String(right));
  a = await st(p); check('a digit key puts the digit', a.vals[i0] === String(right), a.vals[i0]);
  await p.keyboard.press('Backspace');
  a = await st(p); check('Backspace erases', a.vals[i0] === '0', a.vals[i0]);
  await p.keyboard.press('z'); a = await st(p); check('Z undoes', a.vals[i0] === String(right), a.vals[i0]);
  await p.keyboard.press('y'); a = await st(p); check('Y redoes', a.vals[i0] === '0', a.vals[i0]);
  await p.keyboard.press('ArrowRight'); a = await st(p); check('arrow keys move the selection', a.sel === i0 + 1 || a.sel === i0 - 8, a.sel);
  await p.keyboard.press('ArrowDown'); const s2 = (await st(p)).sel; check('ArrowDown moves down a row', s2 === (a.sel + 9) % 81, s2);
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowUp'); check('and back', (await st(p)).sel === i0, await st(p));
  await p.keyboard.press('n'); a = await st(p); check('N switches to notes', a.notesMode, a.notesMode);
  await p.keyboard.press('3'); a = await st(p); check('a digit in notes mode writes a note, not a value', a.vals[i0] === '0' && (a.notes[i0] & 4) === 4, a.notes[i0]);
  await p.keyboard.press('3'); a = await st(p); check('the same digit again removes the note', a.notes[i0] === 0, a.notes[i0]);
  await p.keyboard.press('n'); a = await st(p); check('N again leaves notes mode', !a.notesMode, a.notesMode);
  await p.keyboard.press('h'); a = await st(p); check('H shows a hint', !!a.hint && a.hint.stage === 1, a.hint);
  await p.keyboard.press('Escape'); a = await st(p); check('Esc closes the hint', !a.hint, a.hint);
  await p.keyboard.press('Escape'); await p.waitForTimeout(150);
  a = await st(p); check('Esc with nothing open opens the pause menu', a.menuOpen, a);
  await p.click('.kb-layer--pause .kb-btn--primary'); await p.waitForTimeout(350);
  a = await st(p); check('"resume" closes the menu', !a.menuOpen && a.playing, a);
  await s.close();
}

async function numfirst(env) {
  console.log('4. number-first input (settings): pick a digit, tap or drag over cells');
  const s = await open(env);
  const p = s.page;
  await startPuzzle(p, SPEC1);
  await p.click('#setBtn'); await p.waitForSelector('#ovSet:not([hidden])');
  check('the settings sheet has the switches', (await p.$$('#ovSet .sw')).length >= 4, null);
  await shot(p, '4-settings');
  await p.click('#swNum');
  check('the number-first switch turns on', (await p.getAttribute('#swNum', 'aria-checked')) === 'true', null);
  await p.click('#setClose');
  let a = await st(p);
  check('settings close and the puzzle goes on', a.playing && !a.settings, a);
  const sol = a.solution; const E1 = empties(a);
  // pick the digit of the first empty cell, then tap every cell that wants it
  const d = +sol[E1[0]]; const mine = E1.filter(i => +sol[i] === d);
  await p.click('#pk' + d);
  a = await st(p); check('a pad digit is armed (highlighted), nothing placed yet', a.armed === d && a.vals === a.givens, a);
  check('the armed key looks pressed', (await p.getAttribute('#pk' + d, 'aria-pressed')) === 'true', null);
  for (const i of mine) await clickCell(p, i);
  a = await st(p); check('tapping cells places the armed digit in each, one after another', mine.every(i => a.vals[i] === String(d)), a.vals);
  check('tapping a cell that already has the digit takes it out', (await (async () => { await clickCell(p, mine[0]); return (await st(p)).vals[mine[0]] === '0'; })()), null);
  await clickCell(p, mine[0]);
  // drag fill with another digit: press on a cell and move over its row-mates
  const d2 = +sol[(await st(p)).vals.indexOf('0')];
  await p.click('#pk' + d); await p.click('#pk' + d2); // switch the armed digit
  a = await st(p); check('another digit can be armed', a.armed === d2, a.armed);
  const row = E1.filter(i => +sol[i] === d2);
  if (row.length >= 2) {
    const p1 = await cellPt(p, row[0]); await p.mouse.move(p1.x, p1.y); await p.mouse.down();
    for (const i of row.slice(1)) { const q = await cellPt(p, i); await p.mouse.move(q.x, q.y, { steps: 4 }); }
    await p.mouse.up();
    a = await st(p); check('dragging across cells fills them all (fast fill)', row.every(i => a.vals[i] === String(d2)), row.map(i => a.vals[i]));
  } else check('dragging across cells fills them all (skipped: one place only)', true, null);
  // erase mode
  await p.click('#btnErase'); a = await st(p); check('in number-first mode the erase key arms erasing', a.armed === 0, a.armed);
  await clickCell(p, row[0]); a = await st(p); check('erase mode clears the tapped cell', a.vals[row[0]] === '0', a.vals[row[0]]);
  // 'same digit' highlight
  await p.click('#btnErase'); await p.click('#pk' + d2);
  const hl = await p.$$eval('#board .c.same', e => e.length); check('cells with the armed digit are highlighted', hl >= 1, hl);
  await p.keyboard.press('f'); a = await st(p); check('F switches back to cell-first (key)', a.cfg.numfirst === 0 && a.armed === null, a.cfg);
  check('the choice is saved', (await stored(p, SAVE)).cfg.numfirst === 0, await stored(p, SAVE));
  await s.close();
}

async function notes(env) {
  console.log('5. notes: notes mode, auto notes, peers cleaned, undo');
  const s = await open(env);
  const p = s.page;
  await startPuzzle(p, { size: 9, variant: 'n', level: 2, seed: 202 });
  let a = await st(p); const E1 = empties(a); const i0 = E1[0];
  await p.click('#btnNotes');
  check('the notes button is pressed', (await p.getAttribute('#btnNotes', 'aria-pressed')) === 'true', null);
  await clickCell(p, i0); await p.click('#pk2'); await p.click('#pk7');
  a = await st(p); check('notes are written (2 and 7)', a.notes[i0] === ((1 << 1) | (1 << 6)) && a.vals[i0] === '0', a.notes[i0]);
  const txt = await p.$eval('#c' + i0 + ' .nt', e => e.textContent.replace(/\s/g, ''));
  check('notes show in the cell as small digits', txt === '27', txt);
  await p.click('#btnNotes');
  await p.click('#btnAuto');
  a = await st(p);
  check('auto notes fills every empty cell with its candidates', a.auto && E1.every(i => a.notes[i] > 0), a.notes.slice(0, 20));
  // every empty cell's notes contain the true digit
  check('the true digit is always among the candidates', E1.every(i => a.notes[i] & (1 << (+a.solution[i] - 1))), null);
  const i1 = E1.find(i => a.notes[i] & (1 << (+a.solution[i] - 1))); const dgt = +a.solution[i1];
  const peerWith = [...Array(81).keys()].find(c => c !== i1 && a.vals[c] === '0' && (a.notes[c] & (1 << (dgt - 1))) && (Math.floor(c / 9) === Math.floor(i1 / 9) || c % 9 === i1 % 9));
  await putDigit(p, i1, dgt);
  a = await st(p);
  check('placing a digit removes it from the notes of its row, column and box', peerWith == null || !(a.notes[peerWith] & (1 << (dgt - 1))), a.notes[peerWith]);
  await p.click('#btnUndo'); a = await st(p);
  check('undo brings the digit and the removed notes back', a.vals[i1] === '0' && (peerWith == null || (a.notes[peerWith] & (1 << (dgt - 1)))), a.notes[peerWith]);
  await p.click('#btnAuto'); a = await st(p); check('auto notes can be switched off', !a.auto, a.auto);
  await p.click('#btnUndo'); await p.click('#btnUndo');
  a = await st(p);
  // pause menu: clear all notes
  await p.click('#pauseBtn'); await p.waitForSelector('.kb-layer--pause');
  const clr = await p.$$eval('.kb-layer--pause button', b => b.map(x => x.textContent.trim()));
  check('the menu offers clearing / filling all notes', clr.some(t => /メモをぜんぶ/.test(t)), clr);
  await p.keyboard.press('Escape').catch(() => {});
  await s.close();
}

async function hints(env) {
  console.log('6. hints that explain why: technique, cells, step by step, mistake first, hints-only solve');
  const s = await open(env);
  const p = s.page;
  await startPuzzle(p, { size: 9, variant: 'n', level: 4, seed: 7 });
  let a = await st(p);
  await p.click('#btnHint');
  a = await st(p);
  check('a hint names the technique and highlights cells (stage 1)', a.hint && a.hint.stage === 1 && (await p.$$('#hintBox .tag')).length === 1, a.hint);
  const tag1 = await p.$eval('#hintBox .tag', e => e.textContent), body1 = await p.$eval('#hintBox p', e => e.textContent);
  check('stage 1 gives a short pointer, not the answer', body1.length > 6 && !(await p.$('#hintBox b')), body1);
  const hl = await p.$$eval('#board .c.h1, #board .c.h2, #board .c.h3, #board .c.hh', e => e.length);
  check('cells are highlighted on the board', hl >= 1, hl);
  check('the digit pad gives way to the hint box', !(await p.$eval('#pad', e => e.offsetParent !== null)), null);
  await shot(p, '6-hint1');
  await p.click('#hbGo');
  a = await st(p);
  const body2 = await p.$eval('#hintBox p', e => e.textContent), act = await p.$eval('#hintBox b', e => e.textContent);
  check('"why?" gives the reasoning and the action (stage 2)', a.hint.stage === 2 && body2.length > body1.length && act.length > 3, { body2, act });
  check('revealing counts as a hint used', a.hr === 1, a.hr);
  await shot(p, '6-hint2');
  const before = await st(p);
  await p.click('#hbGo');
  a = await st(p);
  check('"do it" applies the step (a digit or removed candidates) and closes the box', !a.hint && (a.vals !== before.vals || JSON.stringify(a.notes) !== JSON.stringify(before.notes)), a.vals === before.vals);
  // follow hints (real clicks on the buttons) until solved; every placement must be the true digit
  const seen = new Set(); let steps = 0;
  while ((await st(p)).playing && steps < 400) {
    await p.click('#btnHint'); a = await st(p);
    if (!a.hint) break;
    seen.add(a.hint.tech);
    await p.click('#hbGo'); await p.click('#hbGo');
    steps++;
  }
  a = await st(p);
  check('following the hints solves the puzzle', a.result || !a.playing, { steps, hint: a.hint });
  check('hints used means no best time and no clean flag', a.last && a.last.clean === false && a.save.st['9n-4'].b === 0 && a.save.st['9n-4'].c === 0, a.save.st);
  check('no points for a solve with hints', a.save.pts === 0 && a.save.stats.clean === 0 && a.save.stats.learn >= 1, a.save);
  console.log('    techniques shown: ' + [...seen].join(', '));
  check('the hints taught more than one kind of technique', seen.size >= 3, [...seen]);
  // a mistake is named first
  await p.click('#rMenu');
  await startPuzzle(p, SPEC1);
  a = await st(p); const i0 = empties(a)[3]; const wrong = +a.solution[i0] % 9 + 1;
  await putDigit(p, i0, wrong);
  await p.click('#btnHint'); a = await st(p);
  check('a wrong digit is named first as a mistake', a.hint && a.hint.tech === 'mistake' && a.hint.cells.includes(i0), a.hint);
  await p.click('#hbGo'); a = await st(p);
  check('"erase the mistakes" clears it', a.vals[i0] === '0' && !a.hint, a);
  // a hint can be closed without using it
  await p.click('#btnHint'); await p.click('#hbClose'); a = await st(p);
  check('closing a hint leaves the board alone and costs nothing', !a.hint && a.hr === 1, a);
  await s.close();
}

async function daily(env) {
  console.log('7. daily puzzle: the same for everyone, best time per day, streak');
  const s1 = await open(env); const s2 = await open(env);
  const today = await s1.page.evaluate(() => KoboPlatform.jstDateKey());
  const ev = (p) => p.evaluate(() => { __sudoku.daily(); }); await ev(s1.page); await ev(s2.page);
  await s1.page.waitForFunction(() => __kb.state().playing, null, { timeout: 15000 }); await s2.page.waitForFunction(() => __kb.state().playing, null, { timeout: 15000 });
  const a = await st(s1.page), b = await st(s2.page);
  check('two players get the same daily puzzle', a.givens === b.givens && a.givens.length === 81 && a.dk === today && a.mode === 'daily', { a: a.givens, b: b.givens });
  const want = E.generate(E.dailySpec(today));
  check('and it is the engine\'s puzzle for that date and weekday level', a.givens === want.givens.join('') && a.level === E.dailySpec(today).level, { lv: a.level });
  check('the daily is cached for the day', (await stored(s1.page, DC)).dk === today, await stored(s1.page, DC));
  await s2.close();
  const p = s1.page;
  await p.evaluate(() => __sudoku.api.advance(100000));
  await solveByClicks(p); await waitResult(p);
  let r = await st(p);
  check('solving the daily records today\'s time and a 1-day streak', r.save.daily.days[today] >= 100000 && r.save.daily.streak === 1 && r.save.daily.last === today && r.save.stats.daily === 1, r.save.daily);
  check('the result card shows the streak and today\'s best', (await p.$eval('#rRows', e => e.textContent)).includes('1日'), await p.$eval('#rRows', e => e.textContent));
  await shot(p, '7-daily-result');
  await p.click('#rMenu');
  check('the title shows today\'s result', (await p.$eval('#tDaily', e => e.textContent)).includes('1:4'), await p.$eval('#tDaily', e => e.textContent));
  // a faster replay lowers the day's best; a slower one does not
  await p.evaluate(() => __sudoku.daily()); await p.waitForFunction(() => __kb.state().playing);
  await solveByClicks(p); await waitResult(p);
  r = await st(p);
  check('a faster replay improves the day\'s best, the streak is not counted twice', r.save.daily.days[today] < 100000 && r.save.daily.streak === 1 && r.save.stats.daily === 1, r.save.daily);
  await s1.close();
  // yesterday's streak continues; a gap resets it
  for (const [gap, want2] of [[1, 4], [3, 1]]) {
    const y = E.addDays(today, -gap);
    const s = await open(env, { seed: { [HOWTO]: '1', [SAVE]: JSON.stringify({ v: 1, daily: { last: y, streak: 3, max: 3, days: { [y]: 90000 } } }) } });
    await s.page.evaluate(() => __sudoku.daily()); await s.page.waitForFunction(() => __kb.state().playing);
    await solveByClicks(s.page); await waitResult(s.page);
    const q = await st(s.page);
    check(gap === 1 ? 'a streak continues from yesterday (3 -> 4)' : 'a missed day starts the streak again', q.save.daily.streak === want2 && q.save.daily.max >= 3, q.save.daily);
    await s.close();
  }
  // an old daily (?daily=past date) does not touch the streak
  const s3 = await open(env, { seed: { [HOWTO]: '1', [SAVE]: JSON.stringify({ v: 1, daily: { last: 0, streak: 0, max: 0, days: {} } }) } });
  await s3.page.evaluate(k => __sudoku.daily(k), E.addDays(today, -5)); await s3.page.waitForFunction(() => __kb.state().playing);
  const old = await st(s3.page);
  check('a past date opens that day\'s puzzle', old.dk === E.addDays(today, -5) && old.givens === E.generate(E.dailySpec(E.addDays(today, -5))).givens.join(''), old.dk);
  await solveByClicks(s3.page); await waitResult(s3.page);
  const q3 = await st(s3.page);
  check('and a past daily does not count for the streak', q3.save.daily.streak === 0 && q3.save.daily.days[E.addDays(today, -5)] > 0, q3.save.daily);
  await s3.close();
  // ?daily= in the URL
  const s4 = await open(env, { query: '&daily' });
  await s4.page.waitForFunction(() => __kb.state().playing, null, { timeout: 15000 });
  check('?daily opens today\'s puzzle', (await st(s4.page)).mode === 'daily', await st(s4.page));
  await s4.close();
}

async function code(env) {
  console.log('8. share and open by code');
  const s = await open(env);
  const p = s.page;
  await s.ctx.grantPermissions(['clipboard-read', 'clipboard-write']).catch(() => {});
  await startPuzzle(p, { size: 9, variant: 'n', level: 3, seed: 424242 });
  let a = await st(p);
  const want = E.generate({ size: 9, variant: 'n', level: 3, seed: 424242 });
  check('the code is level + seed: ' + a.code, a.code === want.code && a.code === 'SD9N3-' + (424242).toString(36).toUpperCase().padStart(7, '0'), a.code);
  await p.click('#pauseBtn'); await p.waitForSelector('.kb-layer--pause');
  const copyBtn = await p.$('.kb-layer--pause button:has-text("SD9N3")');
  check('the pause menu offers "copy code" with the code on it', !!copyBtn, null);
  await copyBtn.click(); await p.waitForTimeout(300);
  const clip = await p.evaluate(() => navigator.clipboard.readText().catch(() => null));
  check('the code was copied (or the fallback ran)', clip === a.code || (await stored(p, SAVE)).stats.shared >= 1, clip);
  await p.click('.kb-layer--pause .kb-btn--primary'); await p.waitForTimeout(350);
  await p.evaluate(() => __sudoku.title());
  await p.click('#tCode'); await p.waitForSelector('#ovCode:not([hidden])');
  await shot(p, '8-code');
  await p.fill('#codeIn', 'HELLO'); await p.click('#codeGo');
  check('a wrong code is refused with a message', (await p.$eval('#codeErr', e => e.textContent)).length > 3 && (await st(p)).code2, await p.$eval('#codeErr', e => e.textContent));
  await p.fill('#codeIn', ' sd4n2-000000z '); await p.keyboard.press('Enter');
  // the puzzle in progress is saved, so opening another asks first
  await p.waitForSelector('.kb-layer .kb-btn--primary', { timeout: 3000 });
  check('opening a puzzle by code asks before leaving the one in progress', (await p.$$('.kb-layer')).length === 1, null);
  await p.click('.kb-layer .kb-btn--primary');
  await p.waitForFunction(() => __kb.state().playing && __kb.state().size === 4, null, { timeout: 15000 }).catch(() => {});
  a = await st(p);
  check('a valid code (lower case, spaces) opens that puzzle', a.size === 4 && a.level === 2 && a.seed === 35 && a.mode === 'code' && a.givens === E.generate({ size: 4, variant: 'n', level: 2, seed: 35 }).givens.join(''), a);
  check('opening by code is counted', (await st(p)).save.stats.codes >= 1, null);
  await s.close();
  // ?code= in the URL
  const s2 = await open(env, { query: '&code=SD9X2-00000AB' });
  await s2.page.waitForFunction(() => __kb.state().playing, null, { timeout: 15000 });
  const b = await st(s2.page);
  check('?code= opens the puzzle straight away', b.size === 9 && b.variant === 'x' && b.level === 2 && b.givens === E.generate(E.decodeCode('SD9X2-00000AB')).givens.join(''), b);
  await s2.close();
}

async function variants(env) {
  console.log('9. 4x4, 6x6 and X number-place from the title, solved with real clicks');
  const s = await open(env);
  const p = s.page;
  await p.evaluate(() => __sudoku.title());
  await p.click('#tSize button[data-board="4n"]');
  check('choosing 4x4 offers 3 kid levels', (await p.$$('#tLevels button')).length === 3, null);
  await p.click('#tLevels button[data-level="2"]'); await p.click('#tStart');
  await p.waitForFunction(() => __kb.state().playing, null, { timeout: 15000 });
  let a = await st(p);
  check('4x4 level 2 starts: 16 cells, digits 1-4', a.size === 4 && a.level === 2 && a.vals.length === 16 && (await p.$$('#board .c')).length === 16 && (await p.$$('#pad .pk')).length === 4, a);
  await shot(p, '9-4x4');
  await solveByClicks(p); await waitResult(p);
  a = await st(p); check('a 4x4 puzzle is solved and saved under its own board/level', a.save.st['4n-2'].n === 1 && a.save.stats.kids === 1 && a.save.pts === 0, a.save);
  await p.click('#rMenu');
  await p.click('#tSize button[data-board="6n"]'); await p.click('#tLevels button[data-level="1"]'); await p.click('#tStart');
  await p.waitForFunction(() => __kb.state().playing && __kb.state().size === 6, null, { timeout: 15000 });
  a = await st(p); check('6x6 has 36 cells and boxes 2x3', a.vals.length === 36 && (await p.$$('#board .c.rb')).length > 0, a);
  await shot(p, '9-6x6');
  await solveByClicks(p); await waitResult(p);
  a = await st(p); check('a 6x6 puzzle is solved', a.save.st['6n-1'].n === 1 && a.save.stats.kids === 2, a.save);
  await p.click('#rMenu');
  await p.click('#tSize button[data-board="9x"]'); await p.click('#tLevels button[data-level="3"]'); await p.click('#tStart');
  await p.waitForFunction(() => __kb.state().playing && __kb.state().variant === 'x', null, { timeout: 15000 });
  a = await st(p);
  check('X number-place marks the two diagonals', (await p.$$('#board .c.dg')).length === 17, await p.$$eval('#board .c.dg', e => e.length));
  await shot(p, '9-x');
  // a repeated digit on a diagonal is a conflict
  const g = a.givens, dgCells = [...Array(9).keys()].map(k => k * 10);
  const emptyDiag = dgCells.find(c => g[c] === '0'), otherDiag = dgCells.find(c => g[c] !== '0');
  await putDigit(p, emptyDiag, +g[otherDiag]);
  check('a repeated digit on a diagonal turns red', /\b(bd|wr)\b/.test(await cellCls(p, emptyDiag)), await cellCls(p, emptyDiag));
  await p.click('#btnUndo');
  await solveByClicks(p); await waitResult(p);
  a = await st(p); check('an X puzzle is solved and counted as X (and as a 9x9 for points)', a.save.st['9x-3'].n === 1 && a.save.stats.xs === 1 && a.save.stats.l3 === 1, a.save);
  check('no page errors', s.log.pageErrors.length === 0 && s.log.consoleErrors.length === 0, [s.log.pageErrors, s.log.consoleErrors].flat().slice(0, 3));
  await s.close();
}

async function resume(env) {
  console.log('10. autosave and resume');
  const s = await open(env);
  const p = s.page;
  await startPuzzle(p, { size: 9, variant: 'n', level: 3, seed: 9090 });
  let a = await st(p); const E1 = empties(a);
  for (const i of E1.slice(0, 8)) await putDigit(p, i, +a.solution[i]);
  await p.click('#btnAuto');
  await p.click('#btnNotes'); await clickCell(p, E1[10]); await p.click('#pk4');
  await p.evaluate(() => __sudoku.api.advance(31000));
  await p.click('#btnUndo');
  a = await st(p); await p.waitForTimeout(450);
  const run = await stored(p, RUN);
  check('the puzzle in progress is saved after every move', run && run.spec.seed === 9090 && run.g.vals === a.vals && run.ms >= 31000, run && { seed: run.spec.seed });
  await s.reload();
  await p.waitForFunction(() => window.__sudoku);
  let t = await st(p);
  check('after a reload the title offers "continue"', t.title && !(await p.$eval('#tContinue', e => e.hidden)), t.title);
  await shot(p, '10-continue');
  await p.click('#tContinue');
  await p.waitForFunction(() => __kb.state().playing);
  const b = await st(p);
  check('continue gives the same puzzle, digits, notes and a time of about the same', b.seed === 9090 && b.vals === a.vals && JSON.stringify(b.notes) === JSON.stringify(a.notes) && b.ms >= 31000 && b.ms < 60000, { a: a.ms, b: b.ms });
  check('the notes mode, auto notes and the undo history are kept', b.auto === a.auto && b.undo === a.undo && b.redo === a.redo && b.redo >= 1, { a: [a.auto, a.undo, a.redo], b: [b.auto, b.undo, b.redo] });
  await p.click('#btnRedo'); await p.click('#btnUndo');
  check('redo/undo still work after resuming', (await st(p)).vals === a.vals, null);
  check('notes mode is remembered too', (await st(p)).notesMode === true, await st(p));
  await p.click('#btnNotes');
  await solveByClicks(p); await waitResult(p);
  check('it can be finished, and the saved puzzle is cleared', (await stored(p, RUN)) === null && (await st(p)).save.st['9n-3'].n === 1, null);
  // a broken run is ignored
  await p.evaluate(() => localStorage.setItem('kusoge.sudoku.run', '{"v":1,"mode":"normal","spec":{"size":9,"variant":"n","level":1,"seed":1},"puz":{"g":"12","s":"34"},"g":{}}'));
  await s.reload(); await p.waitForFunction(() => window.__sudoku);
  t = await st(p); check('a broken saved puzzle is ignored (no crash, no continue button)', t.title && (await p.$eval('#tContinue', e => e.hidden)) && s.log.pageErrors.length === 0, s.log.pageErrors);
  await p.evaluate(() => localStorage.setItem('kusoge.sudoku.save', '{broken'));
  await s.reload(); await p.waitForFunction(() => window.__sudoku);
  check('a broken record is replaced by a fresh one', (await st(p)).save.stats.solved === 0 && s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
  // a start with a quit in the middle asks before throwing the puzzle away
  const s2 = await open(env);
  await startPuzzle(s2.page, SPEC1);
  const q = await st(s2.page); await putDigit(s2.page, empties(q)[0], +q.solution[empties(q)[0]]);
  await s2.page.evaluate(() => __sudoku.title()); await s2.page.click('#tStart');
  await s2.page.waitForSelector('.kb-layer', { timeout: 3000 }).catch(() => {});
  check('starting a new puzzle with one in progress asks first', (await s2.page.$$('.kb-layer')).length > 0, null);
  await s2.close();
}

async function pause(env) {
  console.log('11. pause: the clock stops and the board is hidden');
  const s = await open(env);
  const p = s.page;
  await startPuzzle(p, SPEC1);
  await p.waitForTimeout(700);
  await p.click('#timeChip'); await p.waitForSelector('.kb-layer--pause');
  const t0 = (await st(p)).ms;
  check('the board is covered while paused', await p.$eval('#board', e => e.classList.contains('cover')), null);
  await p.waitForTimeout(900);
  const t1 = (await st(p)).ms;
  check('the clock stands still in the menu', t1 - t0 < 100 && (await st(p)).menuOpen, { t0, t1 });
  await shot(p, '11-pause');
  const labels = await p.$$eval('.kb-layer--pause button, .kb-layer--pause a', b => b.map(x => x.textContent.trim()));
  check('the menu has resume, restart, settings, how to, title, home', labels.length >= 5, labels);
  await p.click('.kb-layer--pause button:has-text("つづける")').catch(() => p.keyboard.press('Escape'));
  await p.waitForTimeout(300);
  const t2 = (await st(p)).ms; await p.waitForTimeout(600);
  check('the clock runs again after resuming', (await st(p)).ms > t2 && !(await st(p)).menuOpen && !(await p.$eval('#board', e => e.classList.contains('cover'))), await st(p));
  // hidden tab: the page pauses and offers the menu on return
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const h0 = (await st(p)).ms; await p.waitForTimeout(500);
  check('a hidden page does not count time', (await st(p)).ms - h0 < 100, null);
  await s.close();
}

async function touch(env) {
  console.log('12. touch: taps on cells and the big pad');
  const s = await open(env, { touch: true, vp: 'se1' });
  const p = s.page;
  await startPuzzle(p, SPEC1);
  let a = await st(p); const i0 = empties(a)[0], d = +a.solution[i0];
  const pt = await cellPt(p, i0); await p.touchscreen.tap(pt.x, pt.y);
  check('a tap selects a cell', (await st(p)).sel === i0, await st(p));
  const pk = await p.evaluate(d => __sudoku.api.padPoint(d), d); await p.touchscreen.tap(pk.x, pk.y);
  check('a tap on the pad puts the digit', (await st(p)).vals[i0] === String(d), (await st(p)).vals[i0]);
  const sizes = await p.$$eval('#pad .pk, #bar .tb', e => e.map(x => { const r = x.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
  check('pad and toolbar keys are big enough to tap (>= 44px)', sizes.every(([w, h]) => w >= 40 && h >= 44), sizes);
  // number-first by touch: arm and drag
  await p.evaluate(() => { __sudoku.setSave(Object.assign({}, __sudoku.save, { cfg: Object.assign({}, __sudoku.save.cfg, { numfirst: 1 }) })); });
  await s.close();
}

async function loading(env) {
  console.log('13. a slow puzzle shows a loading state, and the page stays alive (Worker)');
  const s = await open(env);
  const p = s.page;
  await p.evaluate(() => { window.__sawLoading = false; new MutationObserver(() => { if (!document.getElementById('ovLoading').hidden) window.__sawLoading = true; }).observe(document.getElementById('ovLoading'), { attributes: true }); });
  const t0 = Date.now();
  await p.evaluate(() => { __sudoku.start({ size: 9, variant: 'n', level: 4, seed: 90 }); });
  await p.waitForFunction(() => __kb.state().playing, null, { timeout: 20000 });
  const dt = Date.now() - t0;
  const a = await st(p);
  check('level 4 seed 90 (slow in node: ~0.4 s) is made and starts', a.givens === E.generate({ size: 9, variant: 'n', level: 4, seed: 90 }).givens.join(''), dt);
  check('a loading card showed while it was being made', await p.evaluate(() => window.__sawLoading), dt);
  console.log('    level 4 seed 90 took ' + dt + ' ms in the page');
  // every level is made fast enough in the page (headless on this machine)
  const times = [];
  for (let lv = 1; lv <= 6; lv++) {
    const t = Date.now();
    await p.evaluate(lv => { __sudoku.start({ size: 9, variant: 'n', level: lv, seed: 31 + lv }); }, lv);
    await p.waitForFunction(lv => __kb.state().playing && __kb.state().level === lv, lv, { timeout: 20000 });
    times.push(Date.now() - t);
  }
  console.log('    page generation ms by level: ' + times.join(' '));
  check('the hardest level is made in under 1.5 s here', times[5] < 1500, times);
  check('the easy levels are made in under 300 ms here', times.slice(0, 3).every(x => x < 300), times);
  check('no page errors', s.log.pageErrors.length === 0 && s.log.consoleErrors.length === 0, [s.log.pageErrors, s.log.consoleErrors].flat().slice(0, 3));
  await s.close();
}

async function online(env) {
  console.log('13b. online battle practice (common/versus.js): same puzzle from the seed, score by correct cells, finishing bonus, nothing saved, back to the solo puzzle');
  const s = await open(env);
  const p = s.page;
  check('KoboVersus is loaded and the title has the entry button', await p.evaluate(() => !!(window.KoboVersus && KoboVersus.practice) && !!document.querySelector('#tVs .kvs-entry') && !!document.querySelector('#vsSlot .kvs-entry')), null);
  // a solo puzzle is under way when the battle starts
  await startPuzzle(p, { size: 9, variant: 'n', level: 3, seed: 5150 });
  let a = await st(p); const E0 = empties(a);
  for (const i of E0.slice(0, 5)) await putDigit(p, i, +a.solution[i]);
  await p.waitForTimeout(400);
  const solo = await st(p), soloRun = await stored(p, RUN), soloSave = await stored(p, SAVE);
  await p.click('#vsSlot .kvs-entry');
  await p.waitForFunction(() => window.__koboVs && __koboVs.state.phase !== 'off', null, { timeout: 5000 });
  await p.evaluate(() => KoboVersus.practice());
  await p.waitForFunction(() => __kb.state().mode === 'vs', null, { timeout: 8000 });
  let x = await st(p);
  check('before "Go" the board is dealt but input is closed', x.mode === 'vs' && x.vs && x.vs.practice && x.vsScore === 0 && !(await p.evaluate(() => KoboVersus.canPlay())), x.vs);
  const seed = x.seed;
  check('the puzzle is generate(9x9, level 2, seed): the same for everyone with this seed', x.givens === E.generate({ size: 9, variant: 'n', level: 2, seed }).givens.join('') && x.level === 2, { seed });
  await p.keyboard.press('1');
  check('no digit can go in before Go', (await st(p)).vals === x.givens, null);
  await p.waitForFunction(() => KoboVersus.canPlay(), null, { timeout: 8000 });
  await shot(p, '13b-online');
  check('after Go the hint button is off (no hints in a battle)', await p.$eval('#btnHint', e => e.disabled), null);
  const E1 = empties(x), c0 = E1[0], c1 = E1[1], c2 = E1[2];
  await putDigit(p, c0, +x.solution[c0]);
  check('a correct cell is worth 10', (await st(p)).vsScore === 10, (await st(p)).vsScore);
  await putDigit(p, c1, +x.solution[c1] % 9 + 1);
  check('a mistake costs 15 and the score never goes below 0', (await st(p)).vsScore === 0, (await st(p)).vsScore);
  await p.click('#btnUndo'); await putDigit(p, c1, +x.solution[c1]); await putDigit(p, c2, +x.solution[c2]);
  check('two more correct cells: 30 minus the 15 for the mistake', (await st(p)).vsScore === 15, (await st(p)).vsScore);
  // nothing is saved while it runs
  const sv = await stored(p, SAVE), rn = await stored(p, RUN);
  check('nothing was saved during the battle (save untouched, the stored solo run is the same puzzle)', JSON.stringify(sv) === JSON.stringify(soloSave) && rn && rn.spec.seed === soloRun.spec.seed && rn.g.vals === soloRun.g.vals, { rn: rn && rn.spec });
  await p.evaluate(() => __sudoku.api.advance(100000));
  await solveByClicks(p);
  x = await st(p);
  check('finishing the grid scores 5000 + the time left (100 s used of 420: about 8200)', x.vsDone >= 8100 && x.vsDone <= 8200 && x.vsScore === x.vsDone && x.over, { done: x.vsDone });
  // closing restores the solo puzzle exactly, waiting in the pause menu
  await p.evaluate(() => KoboVersus.close());
  await p.waitForFunction(() => !__kb.state().vs && __kb.state().mode === 'normal', null, { timeout: 5000 });
  await p.waitForTimeout(300);
  x = await st(p);
  check('closing restores the solo puzzle (same seed, same digits, same time)', x.seed === 5150 && x.vals === solo.vals && Math.abs(x.ms - solo.ms) < 1500, { x: x.seed, solo: solo.seed });
  check('the solo puzzle waits in the pause menu', x.menuOpen, x.menuOpen);
  check('the board is the solo size again', (await p.$$('#board .c')).length === 81 && x.size === 9, null);
  check('no battle result was written to the save', (await stored(p, SAVE)) === null || (await stored(p, SAVE)).stats.solved === 0, await stored(p, SAVE));
  check('no page errors', s.log.pageErrors.length === 0 && s.log.consoleErrors.length === 0, [s.log.pageErrors, s.log.consoleErrors].flat().slice(0, 3));
  await s.close();
  // a battle can start from the title with no solo puzzle, and returns to the title
  const s3 = await open(env); const r = s3.page;
  await r.evaluate(() => __sudoku.title());
  await r.evaluate(() => KoboVersus.practice());
  await r.waitForFunction(() => KoboVersus.canPlay(), null, { timeout: 9000 });
  await r.evaluate(() => KoboVersus.close());
  await r.waitForFunction(() => !__kb.state().vs, null, { timeout: 5000 });
  check('from the title: the battle opens and closing returns to the title', (await st(r)).title, await st(r));
  await s3.close();
  // time up: the module ends the match; the score so far is kept
  const s2 = await open(env); const q = s2.page;
  await q.evaluate(() => KoboVersus.practice());
  await q.waitForFunction(() => KoboVersus.canPlay(), null, { timeout: 9000 });
  const y = await st(q); const yy = empties(y);
  await putDigit(q, yy[0], +y.solution[yy[0]]); await putDigit(q, yy[1], +y.solution[yy[1]]);
  await q.evaluate(() => { const real = Date.now; const d = 421000; Date.now = () => real() + d; });
  await q.waitForFunction(() => !KoboVersus.canPlay(), null, { timeout: 12000 });
  x = await st(q);
  check('time up: input is closed and the score is kept (20)', x.over && x.vsScore === 20, { over: x.over, sc: x.vsScore });
  await putDigit(q, yy[2], +y.solution[yy[2]]);
  check('time up: the board cannot be changed any more', (await st(q)).vsScore === 20, (await st(q)).vsScore);
  await shot(q, '13b-online-end');
  check('no page errors (time up)', s2.log.pageErrors.length === 0, s2.log.pageErrors.slice(0, 3));
  await s2.close();
}

async function english(env) {
  console.log('14. English: nothing in Japanese on screen');
  const s = await open(env, { lang: 'en' });
  const p = s.page;
  const miss = async what => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`en ${what}: no Japanese visible`, jp.length === 0, jp.slice(0, 6)); };
  await p.evaluate(() => __sudoku.title()); await miss('title');
  await p.click('#tHow'); await miss('how to play'); await p.click('#howtoGo');
  await p.click('#tStats'); await miss('stats'); await p.click('#stClose');
  await p.click('#tCode'); await p.fill('#codeIn', 'x'); await p.click('#codeGo'); await miss('code dialog with an error'); await p.click('#codeBack');
  for (const b of ['9n', '9x', '6n', '4n']) { await p.click(`#tSize button[data-board="${b}"]`); await miss('title ' + b); }
  await startPuzzle(p, { size: 9, variant: 'n', level: 5, seed: 17 }); await miss('a 9x9 puzzle');
  await p.click('#setBtn'); await miss('settings'); await p.click('#setClose');
  // every kind of hint, in English
  const kinds = new Set(); let steps = 0;
  while ((await st(p)).playing && steps < 300) {
    await p.click('#btnHint'); const a = await st(p); if (!a.hint) break;
    if (!kinds.has(a.hint.tech)) { kinds.add(a.hint.tech); await miss('hint stage 1 ' + a.hint.tech); await p.click('#hbGo'); await miss('hint stage 2 ' + a.hint.tech); await p.click('#hbGo'); }
    else { await p.click('#hbGo'); await p.click('#hbGo'); }
    steps++;
  }
  console.log('    hint kinds checked in English: ' + [...kinds].join(', '));
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 }).catch(() => {}); await miss('result');
  await p.click('#rMenu');
  await startPuzzle(p, { size: 9, variant: 'n', level: 6, seed: 5 });
  kinds.clear(); steps = 0;
  while ((await st(p)).playing && steps < 300) {
    await p.click('#btnHint'); const a = await st(p); if (!a.hint) break;
    if (!kinds.has(a.hint.tech)) { kinds.add(a.hint.tech); await p.click('#hbGo'); await miss('hint stage 2 ' + a.hint.tech); await p.click('#hbGo'); }
    else { await p.click('#hbGo'); await p.click('#hbGo'); }
    steps++;
  }
  console.log('    more hint kinds in English: ' + [...kinds].join(', '));
  await p.click('#rMenu').catch(() => {});
  await startPuzzle(p, SPEC1); await p.click('#pauseBtn'); await p.waitForSelector('.kb-layer--pause'); await miss('pause menu');
  await p.keyboard.press('Escape').catch(() => {});
  await p.click('.kb-layer--pause .kb-btn--primary').catch(() => {});
  await p.evaluate(() => KoboVersus.practice());
  await p.waitForFunction(() => KoboVersus.canPlay(), null, { timeout: 9000 }); await miss('online battle');
  await p.evaluate(() => KoboVersus.close());
  check('html lang is en', (await p.evaluate(() => document.documentElement.lang)) === 'en', null);
  await s.close();
}

async function layouts(env) {
  console.log('15. every screen size × ja/en × light/dark: no sideways scroll, controls on screen, a square board');
  for (const vp of (process.env.SUDOKU_VPS || 'se1,a360s,se2,ip12,land,xr').split(',')) for (const lang of ['ja', 'en']) {
    const dark = lang === 'en';
    const s = await open(env, { vp, lang, dark });
    const p = s.page; const tag = `${vp}/${lang}/${dark ? 'dark' : 'light'}`;
    await p.evaluate(() => __sudoku.title());
    let r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} title: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0 && x.h >= 44), r);
    if (vp === 'se1' || vp === 'ip12' || vp === 'land') await shot(p, `15-${vp}-${lang}-title`);
    await startPuzzle(p, { size: 9, variant: 'n', level: 4, seed: 3 });
    const a0 = await st(p);
    for (const i of empties(a0).slice(0, 3)) await putDigit(p, i, +a0.solution[i]);
    r = await p.evaluate(`(${layoutProbe})()`);
    const geom = await p.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(), w = document.getElementById('boardWrap').getBoundingClientRect(); const c = document.getElementById('c0').getBoundingClientRect(); return { bw: b.width, bh: b.height, ww: w.width, wh: w.height, cell: c.width, top: b.top, bottom: b.bottom, left: b.left, right: b.right, W: innerWidth, H: innerHeight }; });
    check(`${tag} play: fits (hscroll ${r.hscroll}, off ${r.offscreen.length}), board square ${Math.round(geom.bw)}px, cell ${geom.cell.toFixed(1)}px`, r.hscroll <= 1 && r.offscreen.length === 0 && Math.abs(geom.bw - geom.bh) < 1.5 && geom.cell >= 20 && geom.left >= 0 && geom.right <= geom.W + 1 && geom.top >= 0 && geom.bottom <= geom.H + 1, { r: r.offscreen.slice(0, 4), geom });
    if (vp === 'se1' || vp === 'ip12' || vp === 'land') await shot(p, `15-${vp}-${lang}-play`);
    await p.click('#btnHint');
    await p.click('#hbGo');
    r = await p.evaluate(`(${layoutProbe})()`);
    const geom2 = await p.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(); const h = document.getElementById('hintBox').getBoundingClientRect(); return { bw: b.width, hintBottom: h.bottom, H: innerHeight, hintTop: h.top }; });
    check(`${tag} hint open: fits, the board is still ${Math.round(geom2.bw)}px`, r.hscroll <= 1 && r.offscreen.length === 0 && geom2.bw >= 170 && geom2.hintBottom <= geom2.H + 1, { off: r.offscreen.slice(0, 4), geom2 });
    if (vp === 'se1' || vp === 'land') await shot(p, `15-${vp}-${lang}-hint`);
    await p.click('#hbClose');
    await p.evaluate(() => __sudoku.api.solveNow()); await waitResult(p);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} result card: fits`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), r);
    await p.click('#rMenu');
    await p.evaluate(() => __sudoku.stats()); r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} stats: fits`, r.hscroll <= 1 && r.offscreen.length === 0, r.offscreen.slice(0, 3));
    await p.click('#stClose'); await p.click('#tHow'); r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} how to play: fits`, r.hscroll <= 1 && r.offscreen.length === 0, r.offscreen.slice(0, 3));
    await p.click('#howtoGo');
    await p.click('#tCode'); r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} code dialog: fits`, r.hscroll <= 1 && r.offscreen.length === 0, r.offscreen.slice(0, 3));
    if (vp === 'se1' || vp === 'land' || vp === 'ip12') {
      await p.click('#codeBack'); await p.evaluate(() => KoboVersus.practice());
      await p.waitForFunction(() => KoboVersus.canPlay(), null, { timeout: 9000 });
      r = await p.evaluate(`(${layoutProbe})()`);
      check(`${tag} online battle: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, r.offscreen.slice(0, 4));
      if (vp === 'se1') await shot(p, `15-${vp}-${lang}-battle`);
      await p.evaluate(() => KoboVersus.close()); await p.waitForFunction(() => !__kb.state().vs, null, { timeout: 5000 });
      await p.evaluate(() => __sudoku.title()); await p.click('#tCode');
    }
    await p.click('#codeBack'); await p.click('#tSet'); r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} settings: fits`, r.hscroll <= 1 && r.offscreen.length === 0, r.offscreen.slice(0, 3));
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${tag}: no Japanese`, jp.length === 0, jp.slice(0, 5)); }
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0 && s.log.consoleErrors.length === 0, [s.log.pageErrors, s.log.consoleErrors].flat().slice(0, 3));
    await s.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [first, play, keys, numfirst, notes, hints, daily, code, variants, resume, pause, touch, loading, online, english, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 900)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
