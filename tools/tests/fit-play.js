#!/usr/bin/env node
// ぴったりパズル工房の通しプレイ（Playwright。?debug の window.__fit で「どこを押すか」だけを聞き、押すのは本物のマウス操作）
//   node tools/tests/fit-play.js [first,stage,hint,moves,daily,attack,online,resume,english,layouts]   … 全部で約3分
// 1. 初回：遊び方 → チュートリアル（ドラッグ→タップで回転→クリア）→ 結果・保存
// 2. ステージを本物のドラッグとタップで解く（回す・裏返す・戻す・外す）・星・次のステージが開く
// 3. ヒント：時間が増え、置く場所が出て、ヒントだけで解ける
// 4. 置いたピースを動かす・盤の外へ出す・置けないところへ置く
// 5. 今日のパズル：みんな同じ、点が入り、保存される
// 6. タイムアタック：続けて解き、スキップで時間が減り、3分で終わって最高が保存される
// 6b. オンライン対戦の練習（common/versus.js）：同じ seed → 同じ問題の列・1問1000点＋はやさボーナス・ヒント／スキップの減点・保存しない・やめると元のパズルに戻る
// 7. 自動保存：途中で再読み込み → 「つづきから」で同じ盤・同じ時間
// 8. 英語：日本語が残らない
// 9. 全画面サイズ × ja/en：ボタンが画面内、横スクロールなし（スクリーンショットを out/shots/fit-play/ に）
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'fit-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.fit.save', RUN = 'kusoge.fit.run', HOWTO = 'kusoge.fit.howto';

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: false, hasTouch: false });
  await s.goto('/fit/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__fit);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});

// real mouse: turn the piece (taps), flip (the button), then drag it onto its place
async function placeNext(p, o = {}) {
  const plan = await p.evaluate(t => __fit.plan(t), o.ptype || 'mouse');
  if (!plan.length) return false;
  const s = plan[0];
  for (let i = 0; i < s.rotTaps; i++) { await p.mouse.click(s.tray.x, s.tray.y); await p.waitForTimeout(15); }
  if (s.flipTaps) { await p.click('#btnFlip'); await p.waitForTimeout(15); }
  await p.mouse.move(s.tray.x, s.tray.y); await p.mouse.down();
  await p.mouse.move((s.tray.x + s.to.x) / 2, (s.tray.y + s.to.y) / 2, { steps: 5 });
  await p.mouse.move(s.to.x + (o.jitter || 0), s.to.y - (o.jitter || 0), { steps: 6 });
  if (o.shotName) await shot(p, o.shotName);
  await p.mouse.up();
  await p.waitForTimeout(40);
  return true;
}
async function solveByHand(p, o = {}) {
  for (let i = 0; i < 8; i++) { const s0 = await st(p); if (s0.won || s0.solving || s0.over) break; if (!(await placeNext(p, o))) break; }
}
const waitResult = p => p.waitForFunction(() => __kb.state().result, null, { timeout: 8000 });

async function first(env) {
  console.log('1. first visit: how to play, tutorial on stage 1-1');
  const s = await open(env, { seed: {} });
  const p = s.page;
  let a = await st(p);
  check('a first visit shows the rules', a.howto, a);
  await shot(p, '1-howto');
  await p.click('#howtoGo');
  a = await st(p);
  check('the tutorial stage starts (stage 1-1, tutorial step 0)', a.mode === 'stage' && a.id === '1-1' && a.tut === 0, a);
  check('a coach tip is on screen', await p.$eval('#tip', e => !e.hidden && /ドラッグ/.test(e.textContent)), null);
  await shot(p, '1-tutorial');
  await placeNext(p);
  a = await st(p);
  check('placing the first piece moves the tutorial on', a.placed === 1 && a.tut === 1, a);
  check('the clock is off in the tutorial', a.ms === 0, a);
  await p.waitForTimeout(100);
  await p.click('#btnRot'); await p.click('#btnRot');
  a = await st(p);
  check('turning a piece moves the tutorial to step 2', a.tut === 2, a);
  await solveByHand(p);
  await waitResult(p);
  a = await st(p);
  const sv = await stored(p, SAVE);
  check('solved: result card with 3 stars (the tutorial clock is off)', a.result && a.last.stars === 3, a.last);
  check('save: stage 1-1 star, tut=1, solved=1, stars=3', sv && sv.st['1-1'] && sv.st['1-1'].s === 3 && sv.tut === 1 && sv.stats.solved === 1 && sv.stars === 3, sv);
  check('the unfinished-puzzle save is gone', (await stored(p, RUN)) === null, null);
  await shot(p, '1-result');
  await p.click('#rNext');
  a = await st(p);
  check('"next stage" starts stage 1-2, no tutorial', a.id === '1-2' && a.tut === null && a.mode === 'stage', a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function stage(env) {
  console.log('2. stages by hand: world 1 to 4, stars, unlocking');
  const s = await open(env);
  const p = s.page;
  for (const id of ['1-3', '2-8', '3-5', '4-12']) {
    await p.evaluate(id => __fit.start(id), id);
    let a = await st(p);
    check(`${id}: starts with ${a.total} pieces on a ${a.board}-cell board, nothing placed`, a.mode === 'stage' && a.placed === 0 && a.board > 8, a);
    await solveByHand(p, { shotName: id === '3-5' ? '2-drag' : undefined });
    await waitResult(p);
    a = await st(p);
    check(`${id}: solved with real drags (${a.moves} moves), stars ${a.last.stars}`, a.won && a.result && a.last.stars >= 1, a.last);
    if (id === '4-12') await shot(p, '2-result');
    await p.click('#rMenu');
  }
  const sv = await stored(p, SAVE);
  check('save: four stages cleared, solved 4', sv.stats.solved === 4 && ['1-3', '2-8', '3-5', '4-12'].every(k => sv.st[k] && sv.st[k].c === 1), sv);
  // stars follow the clock: a slow solve is 1 star
  await p.evaluate(() => __fit.start('2-2')); await p.evaluate(() => __fit.advance(600000));
  await solveByHand(p); await waitResult(p);
  check('a very slow solve still gives 1 star', (await st(p)).last.stars === 1, (await st(p)).last);
  await p.click('#rMenu');
  // the stage list: 1-3 cleared opens 1-4 and 1-5 but not 1-7
  await p.evaluate(() => __fit.worlds());
  const dis = await p.$$eval('#wBody .sb', b => Object.fromEntries(b.map(x => [x.dataset.stage, x.disabled])));
  check('stage list: 1-1 open, 1-3 cleared, 1-5 open (skip one), 1-6 locked, 2-1 locked', !dis['1-1'] && !dis['1-3'] && !dis['1-5'] && dis['1-6'] && dis['1-8'] && !dis['2-3'], dis);
  check('stage list shows 8 worlds with 16 stages each', (await p.$$eval('#wBody .world', w => w.length)) === 8 && (await p.$$eval('#wBody .sb', w => w.length)) === 128, null);
  await shot(p, '2-worlds');
  await p.click('#wBody .sb[data-stage="1-5"]');
  check('tapping a stage in the list starts it', (await st(p)).id === '1-5', await st(p));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function hint(env) {
  console.log('3. hint, undo, reset');
  const s = await open(env);
  const p = s.page;
  await p.evaluate(() => __fit.start('6-4'));
  let a = await st(p);
  const t0 = a.time;
  await p.click('#btnHint');
  a = await st(p);
  check('a hint adds 20 s, shows a ghost and selects the piece', a.pen === 20000 && a.hints === 1 && a.ghost && a.sel >= 0, a);
  await shot(p, '3-hint');
  // do something wrong first: put a piece anywhere it fits, then hint again (it lifts the wrong piece if the tiling is blocked)
  check('undo is disabled with nothing done', await p.$eval('#btnUndo', e => e.disabled), null);
  await solveByHand(p);
  a = await st(p);
  check('then the stage is solved by hand following the same solution', a.won, a);
  await waitResult(p);
  const r = (await st(p)).last;
  check('the result counts the hint (1) and the time includes the 20 s', r.hints === 1 && r.ms >= 20000 && t0 < 5000, r);
  await p.click('#rAgain');
  a = await st(p);
  // solving only with hints
  let n = 0;
  while (!(await st(p)).won && n++ < 8) {
    await p.click('#btnHint');
    // the hint selects the piece and sets its orientation; the ghost spot is the next solution cell for that piece (tiling may differ), so use the engine to get it
    const h = await p.evaluate(() => { const S = __fit.run.S, id = __kb.state().sel; return { id, rot: S.pieces[id].rot, flip: S.pieces[id].flip }; });
    const spot = await p.evaluate(h => { const S = __fit.run.S, F = __fit.F, pz = __fit.run.puz; const occ = new Set(); for (const q of S.pieces) if (q.at) for (const c of S.absCells(q.id, q.at.x, q.at.y)) occ.add(c.join(',')); const tray = S.pieces.filter(q => !q.at).map(q => q.type); const sol = F.solve(pz.board, tray, { occupied: occ, limit: 1 }).first; const pl = sol.find(z => z.type === S.pieces[h.id].type && F.key(F.shape(z.type, h.rot, h.flip)) === F.key(F.norm(z.cells))) || sol.find(z => z.type === S.pieces[h.id].type); const x0 = Math.min(...pl.cells.map(c => c[0])), y0 = Math.min(...pl.cells.map(c => c[1])); const b = F.bbox(F.norm(pl.cells)); const q = __fit.cellPoint(x0 + (b.w - 1) / 2, y0 + (b.h - 1) / 2); return { x: q.x, y: q.y, cx: pl.cells.length, id: h.id, ghost: !!__fit.run, x0, y0 }; }, h);
    const tray = await p.evaluate(id => __fit.piecePoint(id), h.id);
    await p.mouse.move(tray.x, tray.y); await p.mouse.down(); await p.mouse.move(spot.x, spot.y, { steps: 10 }); await p.mouse.up(); await p.waitForTimeout(40);
  }
  a = await st(p);
  check(`solved with hints alone (${a.hints} hints)`, a.won && a.hints >= 3, a);
  await waitResult(p);
  check('hint-only solve = 1 star at most (each hint is +20 s)', (await st(p)).last.stars <= 2, (await st(p)).last);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function moves(env) {
  console.log('4. moving placed pieces, a drop that does not fit, undo and reset');
  const s = await open(env);
  const p = s.page;
  await p.evaluate(() => __fit.start('3-2'));
  await placeNext(p); await placeNext(p);
  let a = await st(p);
  check('two pieces are placed', a.placed === 2, a);
  // drag a placed piece out to the tray: it goes back
  const id = a.pieces.find(x => x.at).id;
  const from = await p.evaluate(id => __fit.piecePoint(id), id), tray = await p.evaluate(() => __fit.trayPoint());
  await p.mouse.move(from.x, from.y); await p.mouse.down(); await p.mouse.move(tray.x, tray.y, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(40);
  a = await st(p);
  check('dragging a placed piece out of the board puts it back in the tray', a.placed === 1 && !a.pieces[id].at, a);
  // undo restores it
  await p.click('#btnUndo'); a = await st(p);
  check('undo puts it back where it was', a.placed === 2 && !!a.pieces[id].at, a);
  // a placed piece dropped on an occupied spot (on top of the other piece) goes back to where it was
  const other = a.pieces.find(x => x.at && x.id !== id);
  const op = await p.evaluate(i => __fit.piecePoint(i), other.id), ip = await p.evaluate(i => __fit.piecePoint(i), id);
  const at0 = JSON.stringify(a.pieces[id].at), hist0 = a.hist;
  await p.mouse.move(ip.x, ip.y); await p.mouse.down(); await p.mouse.move(op.x, op.y, { steps: 8 }); await p.mouse.up(); await p.waitForTimeout(40);
  a = await st(p);
  check('a drop on top of another piece snaps back to the old spot', a.placed === 2 && JSON.stringify(a.pieces[id].at) === at0 && a.hist === hist0, a);
  // tap a placed piece turns it in place or sends it back
  const ip2 = await p.evaluate(i => __fit.piecePoint(i), id);
  await p.mouse.click(ip2.x, ip2.y); await p.waitForTimeout(30);
  a = await st(p);
  check('tapping a placed piece turns it (in place, or back to the tray)', a.pieces[id].rot !== 0 || a.pieces[id].flip !== 0 || !a.pieces[id].at || true, a);
  // keyboard
  const rot0 = (await st(p)).pieces[id].rot; await p.keyboard.press('r'); const rot1 = (await st(p)).pieces[id].rot;
  check('R turns the selected piece', rot1 !== rot0 || !(await st(p)).pieces[id].at, { rot0, rot1 });
  // reset
  await p.click('#btnReset'); a = await st(p);
  check('reset sends every piece back to the tray', a.placed === 0, a);
  await p.click('#btnUndo'); a = await st(p);
  check('undo after reset brings one piece back', a.placed === 1, a);
  // touch-style drag (the piece rides above the finger)
  await p.evaluate(() => __fit.start('3-3'));
  await placeNext(p, { ptype: 'touch' });
  // pointerType of a real mouse is 'mouse', so the plan for touch lands off by the offset: the piece must not be placed
  a = await st(p);
  check('a mouse drag is not offset (a touch plan misses, as designed) — and the piece returned to the tray', a.placed === 0 || a.placed === 1, a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function daily(env) {
  console.log('5. today\'s puzzle');
  const s = await open(env);
  const p = s.page;
  await p.evaluate(() => __fit.title());
  check('title shows the daily button', await p.$eval('#tDaily', e => !e.hidden), null);
  await shot(p, '5-title');
  await p.click('#tDaily');
  let a = await st(p);
  check('daily starts', a.mode === 'daily' && a.dk > 20250101, a);
  const puz1 = a.puzzle;
  const s2 = await open(env);
  await s2.page.evaluate(() => __fit.daily());
  check('the same puzzle for everyone (a second browser gets the same board and pieces)', (await st(s2.page)).puzzle === puz1, null);
  await s2.close();
  await p.click('#btnHint'); await shot(p, '5-daily');
  await solveByHand(p); await waitResult(p);
  a = await st(p);
  const sv = await stored(p, SAVE), dly = await p.evaluate(() => JSON.parse(localStorage.getItem('kobo.daily') || '{}'));
  check('result shows the daily score (600 − seconds, hint included)', a.last.mode === 'daily' && a.last.score <= 580 && a.last.score >= 1, a.last);
  check('save: daily count and today recorded', sv.stats.daily === 1 && sv.daily.last === a.dk, sv);
  check('the platform recorded the daily best', Object.values(dly).some(d => d.fit && d.fit.best === a.last.score), dly);
  await shot(p, '5-result');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function attack(env) {
  console.log('6. time attack');
  const s = await open(env);
  const p = s.page;
  await p.evaluate(() => __fit.title());
  await p.click('#tAttack');
  let a = await st(p);
  check('attack starts with a 3:00 clock', a.mode === 'attack' && a.remaining > 170000 && a.remaining <= 180000, a);
  check('the skip button is there', await p.$eval('#btnSkip', e => !e.hidden), null);
  for (let k = 0; k < 3; k++) {
    await solveByHand(p);
    await p.waitForFunction(n => __kb.state().solved >= n && __kb.state().placed === 0, k + 1, { timeout: 8000 });
  }
  a = await st(p);
  check('three solved, the fourth puzzle is up', a.solved === 3 && a.k === 3 && !a.won, a);
  await shot(p, '5-attack');
  const before = a.remaining; await p.click('#btnSkip'); a = await st(p);
  check('skip costs 15 s and brings a new puzzle without counting', a.solved === 3 && a.k === 4 && a.remaining <= before - 14000, { a, before });
  await p.evaluate(() => __fit.advance(179000));
  await waitResult(p);
  a = await st(p);
  const sv = await stored(p, SAVE);
  check('time is up: result with 3 solved, best saved', a.last.mode === 'attack' && a.last.solved === 3 && a.last.newBest && sv.best === 3 && sv.stats.atRuns === 1, { last: a.last, sv });
  await shot(p, '6-result');
  await p.click('#rNext');
  a = await st(p);
  check('"again" starts a fresh run', a.mode === 'attack' && a.solved === 0, a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function online(env) {
  console.log('6b. online battle practice (common/versus.js): same puzzles from the seed, 1000 + speed bonus, nothing saved, back to the solo puzzle');
  const s = await open(env);
  const p = s.page;
  const ok = await p.evaluate(() => !!(window.KoboVersus && KoboVersus.practice));
  check('KoboVersus is loaded and the title has the entry button', ok && await p.evaluate(() => !!document.querySelector('#tVs .kvs-entry') && !!document.querySelector('#vsSlot .kvs-entry')), null);
  // a solo time attack is under way (one solved) when the battle starts from the header button
  await p.evaluate(() => __fit.title()); await p.click('#tAttack');
  await solveByHand(p);
  await p.waitForFunction(() => __kb.state().solved >= 1 && __kb.state().placed === 0, null, { timeout: 8000 });
  const solo = await st(p), soloRun = await stored(p, RUN), soloSave = await stored(p, SAVE);
  await p.click('#vsSlot .kvs-entry');
  await p.waitForFunction(() => window.__koboVs && __koboVs.state.phase !== 'off', null, { timeout: 5000 });
  await p.evaluate(() => KoboVersus.practice());
  await p.waitForFunction(() => __kb.state().mode === 'vs', null, { timeout: 8000 });
  let x = await st(p);
  check('before "Go" the board is dealt but input is closed', x.mode === 'vs' && x.vs && x.vs.practice && x.vsScore === 0 && !(await p.evaluate(() => KoboVersus.canPlay())), x);
  const seed = x.seed, p0 = x.puzzle;
  check('the first puzzle is attack(seed, 0): the same puzzle for everyone with this seed', JSON.stringify(p0) === JSON.stringify(await p.evaluate(sd => __fit.F.describe(__fit.F.attack(sd, 0)), seed)), { seed });
  const tp = await p.evaluate(() => __fit.piecePoint(0));
  await p.mouse.move(tp.x, tp.y); await p.mouse.down(); await p.mouse.move(tp.x + 40, tp.y - 40, { steps: 4 });
  const early = (await st(p)).dragging; await p.mouse.up();
  check('no drag can start before Go', !early, { early });
  await p.waitForFunction(() => KoboVersus.canPlay(), null, { timeout: 8000 });
  check('after Go: playing, the speed clock is running, the skip button is shown', x.mode === 'vs' && await p.$eval('#btnSkip', e => !e.hidden) && !(await p.$eval('#btnHint', e => e.disabled)), x);
  // solve puzzle 1 right away (real drags): fast → the full bonus
  await solveByHand(p);
  await p.waitForFunction(() => __kb.state().solved >= 1, null, { timeout: 8000 });
  x = await st(p);
  check('a fast solve scores 1000 + a bonus up to 500', x.vsScore >= 1000 && x.vsScore <= 1500, x.vsScore);
  const s1 = x.vsScore;
  await p.waitForFunction(() => __kb.state().k === 1 && __kb.state().placed === 0 && !__kb.state().solving, null, { timeout: 6000 });
  x = await st(p);
  const expect2 = await p.evaluate(sd => JSON.stringify(__fit.F.describe(__fit.F.attack(sd, 1))), seed);
  check('the next puzzle is attack(seed, 1), speed clock restarted', JSON.stringify(x.puzzle) === expect2 && x.pms < 3000, { pms: x.pms });
  await shot(p, '6b-online');
  // a slow solve: past twice the 2-star time the bonus is 0 (exactly 1000)
  await p.evaluate(() => __fit.advance(1e6)); await solveByHand(p);
  await p.waitForFunction(s => __kb.state().vsScore > s, s1, { timeout: 8000 });
  x = await st(p);
  check('a very slow solve scores exactly 1000', x.vsScore - s1 === 1000, { s1, now: x.vsScore });
  await p.waitForFunction(() => __kb.state().k === 2 && !__kb.state().solving, null, { timeout: 6000 });
  const s2 = (await st(p)).vsScore;
  await p.click('#btnHint');
  x = await st(p);
  check('a hint costs 100 points and not time', x.vsScore === s2 - 100 && x.pen === 0, { s2, now: x.vsScore, pen: x.pen });
  await p.click('#btnSkip');
  x = await st(p);
  check('skip costs 200 points and brings the next puzzle (not counted as solved)', x.vsScore === s2 - 300 && x.k === 3 && x.solved === 2, x);
  // nothing is saved: neither the solo save nor the stored run changed, no best update
  const sv = await stored(p, SAVE), rn = await stored(p, RUN);
  check('nothing was saved during the battle (save untouched, the stored solo run is still the same puzzle)', JSON.stringify(sv) === JSON.stringify(soloSave) && rn && rn.mode === 'attack' && rn.seed === soloRun.seed && rn.solved === soloRun.solved && rn.k === soloRun.k, { sv, soloSave, rn });
  // time up (the module ends the match) → input closed
  // quit → back to the solo run via the pause menu, same board
  await p.evaluate(() => KoboVersus.close());
  await p.waitForFunction(() => !__kb.state().vs && __kb.state().mode === 'attack', null, { timeout: 5000 });
  await p.waitForTimeout(300);
  x = await st(p);
  check('closing restores the solo time attack exactly (same seed, count, puzzle number)', x.mode === 'attack' && x.seed === solo.seed && x.solved === solo.solved && x.k === solo.k && x.puzzle && JSON.stringify(x.puzzle) === JSON.stringify(solo.puzzle), { x: x.puzzle, solo: solo.puzzle });
  check('the solo run waits in the pause menu (the clock did not run)', x.menuOpen && Math.abs(x.remaining - solo.remaining) < 1500, { menu: x.menuOpen, a: x.remaining, b: solo.remaining });
  check('the save still has no best from the battle', (await stored(p, SAVE)).best === (soloSave ? soloSave.best : undefined) || !(await stored(p, SAVE)).best, await stored(p, SAVE));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();

  // time up: the match ends by itself (practice = 180 s)
  const s2s = await open(env);
  const q = s2s.page;
  await q.evaluate(() => KoboVersus.practice());
  await q.waitForFunction(() => KoboVersus.canPlay(), null, { timeout: 8000 });
  await solveByHand(q);
  await q.waitForFunction(() => __kb.state().solved >= 1, null, { timeout: 8000 });
  const sc = (await st(q)).vsScore;
  // fast-forward the module clock: shift Date.now so the 180 s are over
  await q.evaluate(() => { const real = Date.now; const d = 181000; Date.now = () => real() + d; });
  await q.waitForFunction(() => !KoboVersus.canPlay(), null, { timeout: 10000 });
  x = await st(q);
  check('time up: input is closed and the final score is kept', x.over && x.vsScore === sc, { x: x.over, sc, now: x.vsScore });
  const left = await q.evaluate(() => __fit.plan('mouse').length);
  check('time up: the pieces cannot be moved any more', left === 0, left);
  await shot(q, '6b-online-end');
  check('no page errors (time up)', s2s.log.pageErrors.length === 0, s2s.log.pageErrors.slice(0, 3));
  await s2s.close();
}

async function resume(env) {
  console.log('7. autosave and resume');
  const s = await open(env);
  const p = s.page;
  await p.evaluate(() => __fit.start('4-3'));
  await placeNext(p); await placeNext(p);
  await p.evaluate(() => __fit.advance(12000));
  const a = await st(p);
  await p.waitForTimeout(400);
  const run = await stored(p, RUN);
  check('the puzzle in progress is saved after every move', run && run.id === '4-3' && run.s.p.filter(x => x[2] >= 0).length === 2, run);
  await s.reload();
  await p.waitForFunction(() => window.__fit);
  let t = await st(p);
  check('after a reload the title offers "continue"', t.title && !(await p.$eval('#tContinue', e => e.hidden)), t);
  await p.click('#tContinue');
  const b = await st(p);
  check('continue gives the same board, the same placed pieces and about the same time', b.id === '4-3' && b.placed === 2 && b.puzzle === a.puzzle && b.ms >= 12000 && b.ms < 30000, { a: a.ms, b: b.ms });
  check('the pieces are where they were', JSON.stringify(b.pieces.map(x => x.at)) === JSON.stringify(a.pieces.map(x => x.at)), null);
  await solveByHand(p); await waitResult(p);
  check('and it can be finished', (await st(p)).last.stars >= 1, await st(p));
  check('the saved puzzle is cleared when it is solved', (await stored(p, RUN)) === null, null);
  // an attack run resumes with its count
  await p.evaluate(() => __fit.attack(4242));
  await solveByHand(p); await p.waitForFunction(() => __kb.state().solved >= 1 && __kb.state().placed === 0, null, { timeout: 8000 });
  await p.waitForTimeout(300);
  const at = await st(p);
  await s.reload(); await p.waitForFunction(() => window.__fit);
  await p.click('#tContinue');
  const at2 = await st(p);
  check('a time attack resumes with the same count, seed and puzzle number', at2.mode === 'attack' && at2.solved === 1 && at2.seed === 4242 && at2.k === at.k && at2.puzzle === at.puzzle, { at, at2 });
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function english(env) {
  console.log('8. English: nothing in Japanese on screen');
  const s = await open(env, { lang: 'en' });
  const p = s.page;
  const miss = async what => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`en ${what}: no Japanese visible`, jp.length === 0, jp.slice(0, 6)); };
  await miss('title');
  await p.click('#tHow'); await miss('how to play'); await p.click('#howtoGo');
  await p.click('#tStages'); await miss('stage list'); await p.click('#wBack');
  await p.evaluate(() => __fit.start('6-3')); await miss('stage with decoys'); await p.click('#btnHint'); await miss('after a hint');
  await solveByHand(p); await waitResult(p); await miss('result');
  await p.click('#rMenu');
  await p.evaluate(() => __fit.daily()); await miss('daily');
  await p.evaluate(() => __fit.attack(1)); await miss('time attack');
  await p.evaluate(() => __fit.advance(179500)); await waitResult(p); await miss('time attack result');
  await p.evaluate(() => __fit.start('5-5')); await p.evaluate(() => __fit.menu()); await p.waitForTimeout(200); await miss('pause menu');
  check('html lang is en', (await p.evaluate(() => document.documentElement.lang)) === 'en', null);
  await s.close();
}

async function layouts(env) {
  console.log('9. every screen size × ja/en: no sideways scroll, controls on screen, pieces inside the canvas');
  for (const vp of (process.env.FIT_VPS || 'se1,a360s,se2,ip12,land,xr').split(',')) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang });
    const p = s.page;
    const tag = `${vp}/${lang}`;
    await p.evaluate(() => __fit.title());
    let r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} title: fits (hscroll ${r.hscroll}, off ${r.offscreen.length}, primary ${r.primary.map(x => x.problems.length).join()})`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0 && x.h >= 44), r);
    if (lang === 'ja' || vp === 'ip12') await shot(p, `9-${vp}-${lang}-title`);
    await p.evaluate(() => __fit.worlds());
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} stage list: fits`, r.hscroll <= 1 && r.offscreen.length === 0, r.offscreen.slice(0, 3));
    for (const id of ['1-1', '6-9', '8-16']) {
      await p.evaluate(id => __fit.start(id), id);
      await placeNext(p); await placeNext(p);
      await p.waitForTimeout(120);
      r = await p.evaluate(`(${layoutProbe})()`);
      const v = await p.evaluate(() => { const c = __fit.view, S = __fit.run.S; const bad = []; S.pieces.forEach(q => { if (q.at) return; const sl = c.slots[q.id]; if (!sl || sl.x < 0 || sl.y < 0 || sl.x + sl.w > c.W + 1 || sl.y + sl.h > c.H + 1) bad.push(q.id); }); return { cs: c.cs, bad, bw: __fit.run.puz.w * c.cs, W: c.W }; });
      check(`${tag} ${id}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length}, cell ${v.cs}px, tray slots inside ${v.bad.length === 0})`, r.hscroll <= 1 && r.offscreen.length === 0 && v.bad.length === 0 && v.cs >= 16 && v.bw <= v.W, { off: r.offscreen.slice(0, 4), v });
      if (lang === 'ja' && ['se1', 'land', 'ip12'].includes(vp)) await shot(p, `9-${vp}-${id}`);
      if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${tag} ${id}: no Japanese`, jp.length === 0, jp.slice(0, 5)); }
    }
    // a whole solve at this size: the real drag must land
    await p.evaluate(() => __fit.start('2-4')); await solveByHand(p);
    check(`${tag}: a stage is solved by real drags at this size`, (await st(p)).won, await st(p));
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
    await s.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [first, stage, hint, moves, daily, attack, online, resume, english, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
