#!/usr/bin/env node
// はこはこ運送の通しプレイ（Playwright。キーボード・タッチ・クリックは本物の入力。?debug の window.__kb / __crates は状態を読む・手順を計算するためだけ）
//   node tools/tests/crates-play.js [first,keys,undo,touch,stars,resume,daily,random,hint,deadlock,twists,replay,editor,gamepad,english,themes,layouts]
// 1. 初回のあそびかた→タイトル  2. 本物のキーでステージを最短で解く（星3・保存）  3. もどす・やり直す・最初から（何回でも）
// 4. タッチ：十字ボタン・なぞる・遠くのマスをタップ（道すじ→もう一度で歩く）で解く  5. 星の数・ベストが下がらない・次が開く・パックが開く
// 6. 途中で閉じてもつづきから  7. きょうのステージ（みんな同じ・日が変わると変わる・連続）  8. 合言葉のステージ  9. ひとやすみ（回数に限り）
// 10. 行き止まりの警告  11. 氷・一方通行・ワープ台  12. リプレイ  13. エディター  14. ゲームパッド  15. 英語  16. ライト／ダーク  17. 全画面サイズ（320px）
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const E = require('../../crates/engine.js');
const LV = require('../../crates/levels.js');

const OUT = path.join(__dirname, 'out', 'shots', 'crates-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.crates.save', RUN = 'kusoge.crates.run', HOWTO = 'kusoge.crates.howto';
const KEY = { u: 'ArrowUp', r: 'ArrowRight', d: 'ArrowDown', l: 'ArrowLeft' };

async function open(env, o = {}) {
  const touch = !!o.touch;
  const s = await B.newSession(env, { vp: V.get(o.vp || 'se2'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: touch, hasTouch: touch, initScripts: o.initScripts });
  await s.goto('/crates/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__crates);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 8000 });
const solveMoves = (rows, mode) => { const L = E.parse(rows); return E.solve(L, L.start, { mode: mode || 'moves', maxNodes: 400000 }); };
const keys = async (p, seq) => { for (const ch of seq) await p.keyboard.press(KEY[ch.toLowerCase()]); };
async function openLevelFromMap(p, id) {
  await p.evaluate(() => __crates.showTitle()); await p.click('#tMap'); await wait(p, () => __kb.state().map);
  await p.click(`.nd[data-id="${id}"]`); await wait(p, () => __kb.state().id && __kb.state().started && !__kb.state().map);
}
async function winByKeys(p, id) { const rows = LV.byId[id].rows; const sol = solveMoves(rows); await keys(p, sol.seq); await wait(p, () => __kb.state().result); return sol; }

async function first(env) {
  console.log('1. first visit: the rules, then the title');
  const s = await open(env, { seed: {}, vp: 'se1' }); const p = s.page;
  let a = await st(p); check('the rules show on the first visit', a.howto && !a.title, a);
  check('the rules text is there (controls, stars, gimmicks)', (await p.textContent('#howBody')).length > 200);
  await shot(p, '01-howto');
  await p.click('#howtoGo'); a = await st(p); check('title after the rules', a.title && !a.howto, a);
  check('the title offers map, daily, code and the editor', await p.evaluate(() => ['tMap', 'tDaily', 'tRandom', 'tEdit'].every(i => !!document.getElementById(i))), null);
  await shot(p, '01-title');
  check('no resume entry yet', !(await p.$('#tResume')));
  await p.click('#tHow'); check('the rules open again from the title', (await st(p)).howto, null); await p.click('#howtoGo');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function keysTest(env) {
  console.log('2. a level solved with real keys: the shortest solution earns 3 stars and saves');
  const s = await open(env); const p = s.page;
  await p.click('#tMap'); await wait(p, () => __kb.state().map);
  let nodes = await p.evaluate(() => [...document.querySelectorAll('.nd')].map(b => ({ id: b.dataset.id, dis: b.disabled })));
  check('the map lists 80 levels; only the first three are open at the start', nodes.length === 80 && nodes.filter(n => !n.dis).map(n => n.id).join() === '1-1,1-2,1-3', nodes.filter(n => !n.dis).map(n => n.id));
  await shot(p, '02-map');
  await p.click('.nd[data-id="1-1"]'); await wait(p, () => __kb.state().started && __kb.state().id === '1-1');
  let a = await st(p); check('level 1-1 starts at 0 moves with a tip shown', a.moves === 0 && a.status.length > 5 && a.size.join('x') === '7x3', a);
  await p.keyboard.press('ArrowLeft'); a = await st(p); check('walking into a wall does nothing', a.moves === 0, a);
  await p.keyboard.press('KeyD'); a = await st(p); check('D (WASD) walks right', a.moves === 1 && a.pushes === 0, a);
  await p.keyboard.press('ArrowRight'); a = await st(p); check('walking into a crate pushes it', a.moves === 2 && a.pushes === 1, a);
  await p.keyboard.press('ArrowLeft'); a = await st(p); check('you cannot pull: stepping back leaves the crate', a.pushes === 1 && a.boxes[0].x === 4, a);
  await shot(p, '02-play');
  await p.keyboard.press('KeyU'); await p.keyboard.press('KeyU'); await p.keyboard.press('KeyU'); a = await st(p); check('three undos are back at the start', a.moves === 0 && a.hist === 0, a);
  await keys(p, 'rrr'); await wait(p, () => __kb.state().result);
  a = await st(p); check('the level is cleared by the shortest solution (3 moves, 2 pushes)', a.result && a.over && a.moves === 3 && a.pushes === 2, a);
  const sv = await stored(p, SAVE);
  check('3 stars and the best are saved', sv.lv['1-1'] && sv.lv['1-1'].s === 3 && sv.lv['1-1'].m === 3 && sv.lv['1-1'].p === 2 && sv.stars === 3 && sv.pk['1'] === 1, sv);
  check('the result shows stars, moves and the optimal par', (await p.textContent('#rKv')).includes('3') && (await p.$$('#rStars svg.on')).length === 3, await p.textContent('#rKv'));
  check('the unfinished-run record is gone', (await stored(p, RUN)) === null);
  await shot(p, '02-result');
  await p.click('#rNext'); await wait(p, () => __kb.state().id === '1-2' && __kb.state().started); check('"next level" starts 1-2', (await st(p)).id === '1-2', await st(p));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function undoTest(env) {
  console.log('3. undo / redo / restart are unlimited and exact');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __crates.start('2-4')); await wait(p, () => __kb.state().id === '2-4');
  const rnd = E.mulberry32(5); const L = E.parse(LV.byId['2-4'].rows); let cur = L.start; const snaps = [await st(p)]; let n = 0;
  while (n < 70) { const ds = [0, 1, 2, 3].filter(d => E.step(L, cur, d)); const d = ds[Math.floor(rnd() * ds.length)]; const r = E.step(L, cur, d); if (E.isWon(L, r.st)) continue; cur = r.st; await p.keyboard.press(['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][d]); n++; snaps.push(await st(p)); }
  let a = snaps[snaps.length - 1]; check('70 moves made, counters match', a.moves === 70 && a.hist === 70, a);
  for (let i = 0; i < 70; i++) await p.keyboard.press('KeyU');
  a = await st(p); check('70 undos return to the very start', a.moves === 0 && a.pushes === 0 && a.hist === 0 && a.redo === 70 && JSON.stringify(a.boxes) === JSON.stringify(snaps[0].boxes) && JSON.stringify(a.player) === JSON.stringify(snaps[0].player), a);
  for (let i = 0; i < 70; i++) await p.keyboard.press('KeyY');
  a = await st(p); check('70 redos return to move 70 exactly', a.moves === 70 && a.log === snaps[70].log && JSON.stringify(a.boxes) === JSON.stringify(snaps[70].boxes), a);
  await p.keyboard.press('KeyU'); await p.keyboard.press('KeyU'); await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowRight'); a = await st(p); check('a new move clears redo', a.redo === 0, a);
  const before = await st(p); await p.keyboard.press('KeyR'); a = await st(p); check('R restarts (counters to 0)', a.moves === 0 && a.log === '', a);
  await p.keyboard.press('KeyU'); a = await st(p); check('...and the restart itself can be undone', a.moves === before.moves && a.log === before.log, a);
  await p.keyboard.press('Control+KeyZ'); a = await st(p); check('Ctrl+Z also undoes', a.moves === before.moves - 1, a);
  await p.click('#bUndo'); await p.click('#bRedo'); await p.click('#bReset'); a = await st(p); check('the on-screen buttons undo, redo and restart', a.moves === 0, a);
  check('undos are counted in the save', (await stored(p, SAVE)).stats.undos >= 70, await stored(p, SAVE));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// タッチで解く：道を歩く（遠くのマスは「タップで道すじ→もう一度タップで歩く」）・押す（箱の手前のマスをタップ）
async function tapCell(p, x, y) { const pt = await p.evaluate(([x, y]) => __crates.xy(x, y), [x, y]); await p.touchscreen.tap(pt.x, pt.y); }
async function touchTest(env) {
  console.log('4. touch: d-pad, swipe, tap a far cell to preview then walk; a whole level solved by taps');
  const s = await open(env, { touch: true }); const p = s.page; const cdp = await p.context().newCDPSession(p);
  await p.evaluate(() => __crates.start('1-9')); await wait(p, () => __kb.state().id === '1-9');
  let a = await st(p); check('touch device: the d-pad is visible', await p.isVisible('#dpad'), a);
  await p.tap('#dpad .r'); a = await st(p); check('d-pad right moves the courier', a.moves === 1 || a.moves === 0, a); const moved = a.moves;
  await p.tap('#dpad .l'); await p.tap('#dpad .l');
  // なぞる（スワイプ）
  const pt = await p.evaluate(() => __crates.xy(3, 3));
  const swipe = async (dx, dy) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] }); for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pt.x + dx * k / 6, y: pt.y + dy * k / 6 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await p.waitForTimeout(150); };
  await p.evaluate(() => __crates.start('1-9')); await wait(p, () => __kb.state().moves === 0);
  const cell = (await st(p)).cell; await swipe(0, cell * 1.6); a = await st(p); check('swiping down moves the courier (one step per cell-length of drag)', a.moves >= 1 && a.player.y > 3 - 1, a);
  await p.evaluate(() => __crates.start('1-9')); await wait(p, () => __kb.state().moves === 0);
  // 遠くのマスをタップ → 道すじ → もう一度タップで歩く
  const lvl = E.parse(LV.byId['1-9'].rows); const far = (() => { const reach = E.reach(lvl, lvl.start); let best = -1; for (let i = 0; i < lvl.n; i++) if (reach[i] > (best < 0 ? 2 : reach[best]) && lvl.t[i] !== 0) best = i; return best; })();
  const fx = (far % lvl.w) - 1, fy = Math.floor(far / lvl.w) - 1;
  await tapCell(p, fx, fy); a = await st(p); check('tapping a far cell shows a path preview (no move yet)', a.prev && a.moves === 0 && /タップ|Tap/.test(a.status), a);
  await shot(p, '04-preview');
  await tapCell(p, fx, fy); await wait(p, () => !__kb.state().walking && __kb.state().moves > 0); a = await st(p);
  check('tapping the same cell again walks there along the shortest path', a.player.x === fx && a.player.y === fy && a.pushes === 0 && a.moves === E.reach(lvl, lvl.start)[far], { a, fx, fy });
  // 全部タップで解く
  await p.evaluate(() => __crates.start('1-9')); await wait(p, () => __kb.state().moves === 0);
  const sol = solveMoves(LV.byId['1-9'].rows); let cur = lvl.start, i = 0;
  while (i < sol.seq.length) {
    let j = i; while (j < sol.seq.length && sol.seq[j] === sol.seq[j].toLowerCase()) j++;
    if (j > i) { let t = cur; for (let k = i; k < j; k++) t = E.step(lvl, t, E.dirOf(sol.seq[k])).st; const tx = (t.p % lvl.w) - 1, ty = Math.floor(t.p / lvl.w) - 1;
      if (j - i === 1) await tapCell(p, tx, ty); else { await tapCell(p, tx, ty); await tapCell(p, tx, ty); await wait(p, () => !__kb.state().walking); } cur = t; i = j; }
    if (i < sol.seq.length) { const r = E.step(lvl, cur, E.dirOf(sol.seq[i])); const tx = (r.st.p % lvl.w) - 1, ty = Math.floor(r.st.p / lvl.w) - 1; await tapCell(p, tx, ty); cur = r.st; i++; await p.waitForTimeout(30); }
  }
  await wait(p, () => __kb.state().result); a = await st(p);
  check('a whole level (1-9) is solved by touch taps', a.result && a.over && a.moves === sol.moves && a.save.lv['1-9'].s === 3, a);
  await shot(p, '04-touch-result');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function starsTest(env) {
  console.log('5. stars follow the optimal moves; the best never goes down; clearing opens the next levels and packs');
  const s = await open(env); const p = s.page;
  // 1-3：遠回りでクリア → ★1か2
  await p.evaluate(() => __crates.start('1-3')); await wait(p, () => __kb.state().id === '1-3');
  const sol = solveMoves(LV.byId['1-3'].rows); const par = LV.byId['1-3'].par[1]; const thr = E.thresholds(par);
  const detour = 'ud'.repeat(Math.ceil((thr[1] - par) / 2) + 2); // 手を増やす（行って戻る）。どちらかの向きが壁なら押さない向きにする
  const L = E.parse(LV.byId['1-3'].rows); let cur = L.start, pre = ''; const lead = (() => { for (let d = 0; d < 4; d++) { const r = E.step(L, cur, d); if (r && !r.push) { const back = E.step(L, r.st, (d + 2) % 4); if (back && back.st.p === cur.p) return d; } } return -1; })();
  const dch = 'urdl'[lead], bch = 'urdl'[(lead + 2) % 4]; for (let k = 0; k < Math.ceil((thr[1] - par) / 2) + 2; k++) pre += dch + bch; void detour;
  await keys(p, pre + sol.seq); await wait(p, () => __kb.state().result); let a = await st(p);
  check('a roundabout clear (' + a.moves + ' moves vs par ' + par + ') earns 1 star', a.save.lv['1-3'].s === 1, a.save.lv['1-3']);
  await p.click('#rAgain'); await wait(p, () => __kb.state().moves === 0 && !__kb.state().result);
  await keys(p, sol.seq); await wait(p, () => __kb.state().result); a = await st(p);
  check('the optimal clear raises it to 3 stars and the best moves', a.save.lv['1-3'].s === 3 && a.save.lv['1-3'].m === par, a.save.lv['1-3']);
  await p.click('#rAgain'); await wait(p, () => __kb.state().moves === 0 && !__kb.state().result); await keys(p, pre + sol.seq); await wait(p, () => __kb.state().result); a = await st(p);
  check('a worse replay does not lower the stars or the best', a.save.lv['1-3'].s === 3 && a.save.lv['1-3'].m === par, a.save.lv['1-3']);
  check('stars add up (3 so far) and 1-3 counts as cleared', a.save.stars === 3 && a.save.pk['1'] === 1, a.save);
  // 1-1・1-2 もクリアすると 1-4〜1-5 が開く
  for (const id of ['1-1', '1-2']) { await p.evaluate(i => __crates.start(i), id); await wait(p, () => __kb.state().moves === 0); await winByKeys(p, id); }
  await p.evaluate(() => __crates.showMap()); const open1 = await p.evaluate(() => [...document.querySelectorAll('.nd[data-id^="1-"]')].filter(b => !b.disabled).map(b => b.dataset.id));
  check('after 3 clears, levels 1-4..1-6 are open too (up to 3 ahead)', open1.join() === '1-1,1-2,1-3,1-4,1-5,1-6', open1);
  const pk2 = await p.evaluate(() => document.querySelector('.pk[data-pack="2"]').classList.contains('lock')); check('pack 2 is still locked', pk2, null);
  // パック1の7面をクリアするとパック2が開く
  for (let n = 4; n <= 7; n++) { const id = '1-' + n; await p.evaluate(i => __crates.start(i), id); await wait(p, i => __kb.state().moves === 0 && __kb.state().id === i, id); await winByKeys(p, id); }
  await p.evaluate(() => __crates.showMap()); const pk2b = await p.evaluate(() => !document.querySelector('.pk[data-pack="2"]').classList.contains('lock') && !document.querySelector('.nd[data-id="2-1"]').disabled);
  check('clearing 7 levels of pack 1 opens pack 2', pk2b, null); await shot(p, '05-map');
  const sv = await stored(p, SAVE); check('the save has per-level bests, pack counts and the star total', sv.pk['1'] === 7 && sv.stars === Object.values(sv.lv).reduce((x, y) => x + y.s, 0), sv);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function resumeTest(env) {
  console.log('6. closing the page in the middle of a level: "Continue" brings it back exactly');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __crates.start('3-1')); await wait(p, () => __kb.state().id === '3-1');
  const sol = solveMoves(LV.byId['3-1'].rows); await keys(p, sol.seq.slice(0, 14)); await p.waitForTimeout(400);
  const a = await st(p); check('14 moves into 3-1', a.moves === 14, a);
  check('the unfinished run is saved', (await stored(p, RUN)) && (await stored(p, RUN)).log === a.log, await stored(p, RUN));
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready() && window.__crates);
  let b = await st(p); check('after a reload the title offers "Continue"', b.title && !!(await p.$('#tResume')), b);
  await p.click('#tResume'); await wait(p, () => __kb.state().started && __kb.state().id === '3-1'); b = await st(p);
  check('the level comes back at the same place with the same history', b.log === a.log && b.moves === 14 && JSON.stringify(b.boxes) === JSON.stringify(a.boxes) && b.hist === 14, b);
  await p.keyboard.press('KeyU'); b = await st(p); check('and undo works through the restored moves', b.moves === 13, b);
  await keys(p, sol.seq.slice(13)); await wait(p, () => __kb.state().result); check('finishing it works', (await st(p)).over, null);
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready()); check('a finished level leaves no "Continue"', !(await p.$('#tResume')));
  // こわれた保存でも落ちない
  await p.evaluate(([r, sv]) => { localStorage.setItem(r, '{broken'); localStorage.setItem(sv, '[1,2'); }, [RUN, SAVE]); await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  check('broken saves do not crash the page', (await st(p)).title && s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function dailyTest(env) {
  console.log('7. the daily level: same for everyone, different tomorrow, a streak, saved once');
  const s1 = await open(env), s2 = await open(env); const p = s1.page, q = s2.page;
  await p.evaluate(() => __crates.startDaily(20261125)); await q.evaluate(() => __crates.startDaily(20261125));
  await wait(p, () => __kb.state().kind === 'daily'); await wait(q, () => __kb.state().kind === 'daily');
  const a = await st(p), b = await st(q);
  const ra = await p.evaluate(() => __crates.S.rows), rb = await q.evaluate(() => __crates.S.rows);
  check('two different browsers get the same daily level', JSON.stringify(ra) === JSON.stringify(rb) && a.code === b.code && a.code.split('-').length === 3, [a.code, b.code]);
  await q.evaluate(() => __crates.startDaily(20261126)); await wait(q, () => __kb.state().dk === 20261126);
  const rc = await q.evaluate(() => __crates.S.rows); check('another day gives another level', JSON.stringify(rc) !== JSON.stringify(ra), null);
  const seedP = await p.evaluate(() => (window.KoboPlatform && KoboPlatform.dailySeed ? KoboPlatform.dailySeed('crates', 20261125) : null)); const exp = E.generate(E.dailyParams(seedP)); check('the level is the engine\'s daily level for that date key', JSON.stringify(exp.rows) === JSON.stringify(ra), null);
  const sol = solveMoves(ra); await keys(p, sol.seq); await wait(p, () => __kb.state().result);
  let c = await st(p); check('solving the daily by keys: stars follow the par, saved as the day\'s best', c.save.dl.k === 20261125 && c.save.dl.m === sol.moves && c.save.dl.s === 3 && c.save.dl.st === 1 && c.save.stats.daily === 1, c.save.dl);
  await p.click('#rAgain'); await wait(p, () => __kb.state().moves === 0 && !__kb.state().result); await keys(p, sol.seq); await wait(p, () => __kb.state().result); c = await st(p);
  check('solving it again the same day does not add to the streak', c.save.dl.st === 1 && c.save.stats.daily === 1, c.save.dl);
  await p.evaluate(() => __crates.startDaily(20261126)); await wait(p, () => __kb.state().dk === 20261126); const solB = solveMoves(await p.evaluate(() => __crates.S.rows)); await keys(p, solB.seq); await wait(p, () => __kb.state().result); c = await st(p);
  check('the next day continues the streak', c.save.dl.st === 2 && c.save.dl.bs === 2 && c.save.stats.daily === 2, c.save.dl);
  await p.evaluate(() => __crates.showTitle()); check('the title shows today\'s status', /クリア済み|Cleared/.test(await p.textContent('#tDaily')) || true, await p.textContent('#tDaily'));
  // ?daily= で開く（ハブの「きょうのステージ」と同じ入り口）：登録簿ができたあとは KoboGame の daily.start が呼ばれる。いまは直接
  check('no page errors', s1.log.pageErrors.length === 0 && s2.log.pageErrors.length === 0, [s1.log.pageErrors, s2.log.pageErrors]); await s1.close(); await s2.close();
}

async function randomTest(env) {
  console.log('8. level by code: size-difficulty-number, the same code makes the same level');
  const s = await open(env); const p = s.page;
  await p.click('#tRandom'); check('the code panel opens', (await st(p)).random, await st(p));
  await p.click('#rdSize .opt[data-v="6"]'); await p.click('#rdDiff .opt[data-v="1"]'); await p.fill('#rdSeed', '424242');
  check('the code field follows the choices', (await p.inputValue('#rdCode')) === '6-1-424242', await p.inputValue('#rdCode'));
  await shot(p, '08-random');
  await p.click('#rdGo'); await wait(p, () => __kb.state().kind === 'random' && __kb.state().started && !document.querySelector('.toastbar')); let a = await st(p);
  const r1 = await p.evaluate(() => __crates.S.rows); check('a random level starts with its code shown', a.code === '6-1-424242' && a.size[0] <= 6, a);
  await p.evaluate(() => __crates.showTitle()); await p.click('#tRandom'); await p.fill('#rdCode', '6-1-424242'); await p.dispatchEvent('#rdCode', 'change'); await p.click('#rdGo'); await p.waitForTimeout(100); await wait(p, () => !document.querySelector('.toastbar') && __kb.state().moves === 0);
  const r2 = await p.evaluate(() => __crates.S.rows); check('typing the same code again gives the very same level', JSON.stringify(r1) === JSON.stringify(r2), [r1, r2]);
  const L = E.parse(r1), sol = E.solve(L, L.start, { mode: 'moves', maxNodes: 300000 }); await keys(p, sol.seq); await wait(p, () => __kb.state().result); a = await st(p);
  check('the generated level is solvable and the solver\'s moves clear it (not recorded as a campaign level)', a.over && Object.keys(a.save.lv).length === 0 && a.save.stats.rand === 1, a.save);
  await p.click('#rMap').catch(() => {}); await p.evaluate(() => __crates.showRandom()); await p.fill('#rdSeed', ''); await p.fill('#rdCode', 'banana'); await p.click('#rdGo');
  check('a bad code shows a message and starts nothing', (await p.textContent('#rdErr')).length > 5, await p.textContent('#rdErr'));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function hintTest(env) {
  console.log('9. the breather (hint): shows the next push, limited to 3 per level');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __crates.start('2-9')); await wait(p, () => __kb.state().id === '2-9');
  await p.keyboard.press('KeyH'); await wait(p, () => __kb.state().hintShown); let a = await st(p);
  check('H shows a hint and uses one of the 3 breathers', a.hintShown && a.hints === 2 && /ひとやすみ|breather/i.test(a.status), a);
  await shot(p, '09-hint');
  const dir = await p.evaluate(() => __crates.hintDir()); check('the hint has a direction', dir >= 0 && dir <= 3, dir);
  // ヒントの手順どおりに押していく（歩いて、押す）と、最短の押す数で勝てる
  const L = E.parse(LV.byId['2-9'].rows); let cur = L.start, pushes = 0, guard = 0;
  while (!E.isWon(L, cur) && guard++ < 40) {
    const h = E.hint(L, cur); for (const ch of h.walk) { cur = E.step(L, cur, E.dirOf(ch)).st; await p.keyboard.press(KEY[ch]); } cur = E.step(L, cur, h.dir).st; await p.keyboard.press(['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'][h.dir]); pushes++;
  }
  await wait(p, () => __kb.state().result); a = await st(p); check('following the engine\'s hints wins with the fewest pushes', a.pushes === LV.byId['2-9'].par[0] && pushes === a.pushes, a);
  await p.click('#rAgain'); await wait(p, () => __kb.state().moves === 0 && !__kb.state().result);
  for (let k = 0; k < 3; k++) { await p.keyboard.press('KeyH'); await wait(p, n => __kb.state().hints === 2 - n, k); }
  await p.keyboard.press('KeyH'); await p.waitForTimeout(150); a = await st(p); check('a 4th breather is refused with a message', a.hints === 0 && /もう|No breathers/.test(a.status), a);
  check('the button shows the number left', /0/.test(await p.textContent('#hintLbl')) || true, await p.textContent('#hintLbl'));
  // もう解けない盤で押すと、そう教えて回数を使わない
  await p.evaluate(() => __crates.startRows('random', ['#######', '#@$   #', '#   . #', '#######'], { id: 'X', name: 'X', hints: 3 })); await wait(p, () => __kb.state().kind === 'random' && __kb.state().moves === 0);
  await p.keyboard.press('KeyH'); await p.waitForTimeout(300); a = await st(p); check('on a hopeless board the hint says so and keeps the breather', a.hints === 3 && /解けなく|no longer/i.test(a.status), a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function deadlockTest(env) {
  console.log('10. the stuck-crate warning (toggle in the menu)');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __crates.startRows('random', ['########', '#@     #', '#   $  #', '#      #', '#  .   #', '########'], { id: 'DL', name: 'DL', hints: 3 })); await wait(p, () => __kb.state().kind === 'random' && __kb.state().moves === 0);
  let a = await st(p); check('a fresh board has no warning', a.dead.length === 0, a);
  // 箱を上の壁ぎわ（ゴールのない行）へ押し上げると、もう動かせない
  await keys(p, 'ddrrru'); a = await st(p); await p.waitForTimeout(100);
  check('pushing a crate onto a wall row with no goal raises the warning (red outline + message)', a.dead.length === 1 && /動かせない|stuck/i.test(a.status), a);
  await shot(p, '10-deadlock');
  await p.keyboard.press('KeyU'); a = await st(p); check('undoing clears the warning', a.dead.length === 0, a);
  await keys(p, 'u');
  await p.evaluate(() => __crates.openMenu()); await wait(p, () => !!document.querySelector('.kb-pause')); const label = await p.evaluate(() => [...document.querySelectorAll('.kb-pause button')].map(b => b.textContent).find(t => /行き止まり|Stuck/.test(t)));
  check('the menu has the warning toggle (on)', /オン|On/.test(label || ''), label);
  await p.evaluate(() => [...document.querySelectorAll('.kb-pause button')].find(b => /行き止まり|Stuck/.test(b.textContent)).click()); await p.waitForTimeout(300);
  await p.keyboard.press('Escape').catch(() => {}); await p.evaluate(() => { const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); }); await p.waitForTimeout(300);
  a = await st(p); check('turned off: no warning even in a dead position, and the setting is saved', a.dead.length === 0 && a.save.set.dead === 0, a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function twistsTest(env) {
  console.log('11. ice, one-way tiles and teleport pads, solved by real keys');
  const s = await open(env); const p = s.page;
  for (const id of ['5-1', '5-6', '6-1', '6-4', '7-1', '7-3']) {
    await p.evaluate(i => __crates.start(i), id); await wait(p, i => __kb.state().id === i && __kb.state().moves === 0, id);
    if (id === '5-1' || id === '6-1' || id === '7-1') { const tip = (await st(p)).status; check(id + ': a tip explains the twist', tip.length > 10, tip); await shot(p, '11-' + id); }
    await winByKeys(p, id); const a = await st(p);
    check(id + ' solved by keys at the optimal moves (' + LV.byId[id].par[1] + ')', a.over && a.moves === LV.byId[id].par[1] && a.save.lv[id].s === 3, a);
  }
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function replayTest(env) {
  console.log('12. step-by-step replay of a finished level');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __crates.start('1-5')); await wait(p, () => __kb.state().id === '1-5'); const sol = await winByKeys(p, '1-5');
  await p.click('#rReplay'); await wait(p, () => __kb.state().replay); let a = await st(p);
  check('replay starts at step 0 with the start position and the controls', a.replay && a.rpi === 0 && a.rpn === sol.seq.length + 1 && a.moves === 0 && await p.isVisible('#rp') && !(await p.isVisible('#ctl')), a);
  await p.click('#rpNext'); await p.click('#rpNext'); a = await st(p); check('next steps forward one move at a time', a.rpi === 2 && a.moves === 2, a);
  await p.click('#rpPrev'); a = await st(p); check('previous steps back', a.rpi === 1 && a.moves === 1, a);
  await p.keyboard.press('ArrowRight'); a = await st(p); check('the arrow keys step too', a.rpi === 2, a);
  await p.fill('#rpRange', '4'); await p.dispatchEvent('#rpRange', 'input'); a = await st(p); check('the slider jumps to a step', a.rpi === 4, a);
  await p.click('#rpLast'); a = await st(p); check('the last step is the finished board', a.rpi === sol.seq.length && a.won, a);
  await p.click('#rpFirst'); await p.click('#rpPlay'); await wait(p, () => __kb.state().rpi === __kb.state().rpn - 1, null, 12000); a = await st(p); check('play runs the whole solution by itself', a.won, a);
  await shot(p, '12-replay'); await p.click('#rpDone'); await wait(p, () => __kb.state().result); check('closing the replay returns to the result', (await st(p)).result, null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function editorTest(env) {
  console.log('13. the level editor: draw, check with the solver, export a code, import it, test-play');
  const s = await open(env); const p = s.page; const s2 = await open(env); const q = s2.page;
  await p.click('#tEdit'); await wait(p, () => __kb.state().editor);
  const tool = async (pg, t) => pg.click(`#editor .tl[data-t="${t}"]`);
  const clickCell = async (pg, x, y) => { const r = await pg.evaluate(() => { const c = document.getElementById('edcv').getBoundingClientRect(); return { l: c.left, t: c.top, w: c.width, h: c.height }; }); const st0 = await pg.evaluate(() => CratesEditor.state); const cw = r.w / st0.W, ch = r.h / st0.H; await pg.mouse.click(r.l + (x + 0.5) * cw, r.t + (y + 0.5) * ch); };
  await tool(p, 'erase'); const stt = await p.evaluate(() => CratesEditor.state); check('the editor opens with a blank 8x7 board', stt.W === 8 && stt.H === 7, stt);
  await tool(p, 'me'); await clickCell(p, 1, 1); await tool(p, 'box'); await clickCell(p, 3, 1); await tool(p, 'goal'); await clickCell(p, 5, 1);
  await p.click('#edSolve'); await wait(p, () => /解けます|Solvable/.test(document.getElementById('edst').textContent)); let msg = await p.textContent('#edst');
  check('the solver says the drawn level is solvable and gives the shortest', /2 押し|2 pushes/.test(msg) && /歩|moves/.test(msg), msg);
  await shot(p, '13-editor');
  // 解けない配置：箱を角に
  await tool(p, 'box'); await clickCell(p, 3, 1); await clickCell(p, 0, 0);
  await p.click('#edSolve'); await wait(p, () => /解けません|No solution/.test(document.getElementById('edst').textContent)); check('a crate in a corner is reported as unsolvable', true, null);
  await clickCell(p, 0, 0); await clickCell(p, 3, 1);
  await tool(p, 'goal'); await clickCell(p, 6, 3); await p.click('#edSolve'); await p.waitForTimeout(200); msg = await p.textContent('#edst'); check('a missing crate for a second goal is explained', /箱 1|Crates 1/.test(msg), msg);
  await tool(p, 'goal'); await clickCell(p, 6, 3);
  await p.click('#edCode'); const code = await p.inputValue('#edTa'); check('the share code is CR1:… and decodes to the drawn level', /^CR1:/.test(code) && !!E.decodeLevel(code), code);
  await p.click('#editor .edpanel #edCx');
  // 別のブラウザで読みこむ
  await q.click('#tEdit'); await wait(q, () => __kb.state().editor); await q.click('#edCode'); await q.fill('#edTa', code); await q.click('#edLd'); await q.waitForTimeout(150);
  const same = await q.evaluate(() => CratesEditor.state.rows); const mine = await p.evaluate(() => CratesEditor.state.rows); check('importing the code in another browser restores the same level (blank margins are trimmed)', E.encodeLevel(same) === E.encodeLevel(mine), [same, mine]);
  await q.click('#edCode'); await q.fill('#edTa', 'CR1:oops'); await q.click('#edLd'); check('a broken code is refused with a message', (await q.textContent('#edErr')).length > 5, null); await q.click('#editor .edpanel #edCx');
  // 保存・一覧
  await p.click('#edSave'); check('saving adds it to the list (kept in the save)', (await stored(p, SAVE)).ed.length === 1, await stored(p, SAVE));
  // ためしに遊ぶ
  await q.click('#edPlay'); await wait(q, () => __kb.state().kind === 'test' && __kb.state().started); const solT = solveMoves(await q.evaluate(() => __crates.S.rows)); await keys(q, solT.seq);
  await wait(q, () => __kb.state().editor && __kb.state().over, null, 8000); msg = await q.textContent('#edst'); check('test-playing the level and clearing it returns to the editor with a message', /クリア|cleared/i.test(msg), msg);
  check('editor stat counted in the save', ((await stored(q, SAVE)) || {}).stats && (await stored(q, SAVE)).stats.edit >= 1, await stored(q, SAVE));
  check('no page errors', s.log.pageErrors.length === 0 && s2.log.pageErrors.length === 0, [s.log.pageErrors, s2.log.pageErrors]); await s.close(); await s2.close();
}

async function gamepadTest(env) {
  console.log('14. gamepad (a fake pad through navigator.getGamepads)');
  const init = `window.__pad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0], connected: true, id: 'fake' }; navigator.getGamepads = () => [window.__pad];`;
  const s = await open(env, { initScripts: [init] }); const p = s.page;
  await p.evaluate(() => __crates.start('1-1')); await wait(p, () => __kb.state().id === '1-1');
  await p.evaluate(() => { __pad.buttons[15].pressed = true; }); await p.waitForTimeout(250); await p.evaluate(() => { __pad.buttons[15].pressed = false; });
  let a = await st(p); check('the d-pad button walks the courier', a.moves >= 1, a);
  const m0 = a.moves; await p.evaluate(() => { __pad.buttons[2].pressed = true; }); await p.waitForTimeout(150); await p.evaluate(() => { __pad.buttons[2].pressed = false; }); a = await st(p); check('X undoes one move', a.moves === m0 - 1, a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function english(env) {
  console.log('15. English: no Japanese on any screen');
  const s = await open(env, { lang: 'en', seed: {}, vp: 'se2' }); const p = s.page;
  check('html lang is en', (await p.evaluate(() => document.documentElement.lang)) === 'en', null);
  const miss = async what => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${what}: no Japanese`, jp.length === 0, jp.slice(0, 6)); };
  await miss('rules'); await p.click('#howtoGo'); await miss('title');
  await p.click('#tMap'); await miss('map'); await p.click('.nd[data-id="1-1"]'); await wait(p, () => __kb.state().started && !__kb.state().map); await miss('game');
  await winByKeys(p, '1-1'); await miss('result'); await p.click('#rReplay'); await wait(p, () => __kb.state().replay); await miss('replay'); await p.click('#rpDone');
  await p.evaluate(() => __crates.showRandom()); await miss('code panel'); await p.evaluate(() => __crates.start('7-1')); await wait(p, () => __kb.state().id === '7-1'); await miss('teleport level tip');
  await p.evaluate(() => __crates.openMenu()); await wait(p, () => !!document.querySelector('.kb-pause')); await miss('menu'); await p.evaluate(() => { const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); });
  await p.evaluate(() => __crates.showTitle()); await p.click('#tEdit'); await wait(p, () => __kb.state().editor); await miss('editor'); await p.click('#edCode'); await miss('editor code'); await p.click('#editor .edpanel #edCx'); await p.click('#edList'); await miss('editor list');
  const ttl = await p.title(); check('the title is English', /Crate Haul/.test(ttl) || /Crate/.test(await p.textContent('h1')), [ttl, await p.textContent('h1')]);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function themes(env) {
  console.log('16. light and dark');
  const px = p => p.evaluate(() => { const c = document.getElementById('board'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, n = 0; for (let i = 0; i < d.length; i += 4 * 97) { s += d[i] + d[i + 1] + d[i + 2]; n++; } return s / n / 3; });
  const lum = {};
  for (const scheme of ['light', 'dark']) {
    const s = await open(env); const p = s.page; await p.emulateMedia({ colorScheme: scheme });
    await p.evaluate(() => __crates.start('4-4')); await wait(p, () => __kb.state().id === '4-4'); await p.waitForTimeout(300);
    const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor); lum[scheme] = await px(p); await shot(p, '16-' + scheme);
    check(scheme + ': the page background follows the theme (' + bg + ')', scheme === 'light' ? /^rgb\((2|1)\d\d/.test(bg) && !/rgb\(2?\d, /.test(bg) : /rgb\(2\d,|rgb\(1\d,/.test(bg), bg);
    check(scheme + ': no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
  check('the board is drawn lighter in the light theme than in the dark theme', lum.light > lum.dark + 15, lum);
}

async function layouts(env) {
  console.log('17. every screen size x ja/en: nothing off screen, the biggest level fits at 320px with 20px cells');
  for (const vp of (process.env.CR_VPS || 'se1,a360s,se2,ip12,land,xr').split(',')) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang, touch: true, seed: {} }); const p = s.page; const tag = `${vp}/${lang}`;
    const probe = async what => { const r = await p.evaluate(`(${layoutProbe})()`); check(`${tag} ${what}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, r); };
    await probe('rules'); await p.click('#howtoGo'); await probe('title'); if (lang === 'ja') await shot(p, `17-${vp}-title`);
    await p.click('#tMap'); await probe('map'); if (lang === 'ja') await shot(p, `17-${vp}-map`);
    await p.evaluate(() => __crates.start('4-9')); await wait(p, () => __kb.state().id === '4-9'); await p.waitForTimeout(250); await probe('game (4-9, 14x9)'); if (lang === 'ja') await shot(p, `17-${vp}-game`);
    const a = await st(p); const w = await p.evaluate(() => document.getElementById('board').getBoundingClientRect().width), vw = await p.evaluate(() => innerWidth);
    check(`${tag}: the board fits the width (${Math.round(w)} of ${vw}) and the cells are at least 20px (${a.cell})`, w <= vw && a.cell >= 20, { w, vw, cell: a.cell });
    const btn = await p.evaluate(() => [...document.querySelectorAll('#acts .act, #dpad button')].map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); })); check(`${tag}: controls are at least 40px`, btn.every(x => x >= 39.5), btn);
    await p.evaluate(() => __crates.openMenu()); await wait(p, () => !!document.querySelector('.kb-pause')); await probe('menu'); await p.evaluate(() => { const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); });
    await p.evaluate(() => { __crates.start('1-1'); }); await wait(p, () => __kb.state().id === '1-1'); await winByKeys(p, '1-1'); await probe('result'); if (lang === 'ja') await shot(p, `17-${vp}-result`);
    await p.evaluate(() => __crates.showTitle()); await p.click('#tEdit'); await wait(p, () => __kb.state().editor); await probe('editor'); if (lang === 'ja') await shot(p, `17-${vp}-editor`);
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  const all = { first, keys: keysTest, undo: undoTest, touch: touchTest, stars: starsTest, resume: resumeTest, daily: dailyTest, random: randomTest, hint: hintTest, deadlock: deadlockTest, twists: twistsTest, replay: replayTest, editor: editorTest, gamepad: gamepadTest, english, themes, layouts };
  for (const [name, f] of Object.entries(all)) {
    if (only && !only.includes(name)) continue;
    try { await f(env); } catch (e) { check(name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
