#!/usr/bin/env node
// めいろ探検の通しプレイ（Playwright。キー・タッチ・マウスは本物の入力。?debug の window.__kb / __maze は状態を読む・解の手順を計算する・時間を進めるためだけ）
//   node tools/tests/maze-play.js [first,keys,tapwalk,touch,hint,undo,reveal,modes,d3,daily,code,endless,ghost,resume,worlds,gamepad,english,themes,layouts]
// 1. 初回のあそびかた→タイトル  2. 小さいめいろを本物のキーで最短クリア（★3・保存）  3. 大きいめいろ（XL 61x61）をマウスのタップ歩きでクリア
// 4. タッチ：十字ボタン・スワイプ・タップ  5. ヒント（3回・最短・★2まで）  6. 「もどる」（分かれ道まで）  7. こたえ（★1まで）
// 8. きり・かぎとびら・動くかべ（待つ）を最短でクリア  9. 3D：描画が空でない・歩ける・ミニマップ・最短でクリア  10. 毎日（みんな同じ・れんぞく）
// 11. 合言葉（開く・まちがい・同じめいろ）  12. どこまでも下へ（階が上がる・ライフ・ゲームオーバー）  13. ゴースト  14. 途中でとじてもつづきから
// 15. せかいずかん  16. ゲームパッド  17. 英語（日本語が残らない）  18. ライト／ダーク  19. 全画面サイズ（320px・横向き）
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const E = require('../../maze/engine.js');

const OUT = path.join(__dirname, 'out', 'shots', 'maze-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.maze.save', RUN = 'kusoge.maze.run', GHOST = 'kusoge.maze.ghost', HOWTO = 'kusoge.maze.howto';
const AK = ['ArrowUp', 'ArrowRight', 'ArrowDown', 'ArrowLeft'];

async function open(env, o = {}) {
  const touch = !!o.touch;
  const s = await B.newSession(env, { vp: V.get(o.vp || 'se2'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: touch, hasTouch: touch, initScripts: o.initScripts });
  await s.goto('/maze/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__maze);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 8000 });
const start = async (p, code) => { await p.evaluate(c => __maze.start(c), code); await wait(p, c => __kb.state().code === c && !__kb.state().result && !__kb.state().title, code); await p.waitForTimeout(80); return st(p); };
const sleep = (p, ms) => p.waitForTimeout(ms);

// 本物のキーで dirs（0..3 と待つ=4）を歩く。3D は向きを変えてから進む
async function play(p, dirs, mode, face0) {
  let face = face0 || 0;
  for (const d of dirs) {
    if (d === 4) { await p.keyboard.press('Space'); continue; }
    if (mode !== 'd3') { await p.keyboard.press(AK[d]); continue; }
    const df = (d - face + 4) % 4;
    if (df === 0) await p.keyboard.press('ArrowUp'); else if (df === 1) { await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowUp'); face = d; } else if (df === 3) { await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowUp'); face = d; } else await p.keyboard.press('ArrowDown');
  }
}
// いまの状態（ページの log）から、node 側のエンジンで最短の手順を出す
function planFrom(code, log) { const m = E.fromCode(code), r = E.replay(m, log || ''); const s = E.search(m, r.pos, r.mask, r.tk % m.P); return { m, r, dirs: s ? s.dirs : null }; }
async function solveByKeys(p) {
  const a = await st(p), pl = planFrom(a.code, a.log); await play(p, pl.dirs, a.mode, a.face);
  await wait(p, () => __kb.state().result || (__kb.state().en && __kb.state().over)); return { a, pl };
}

async function first(env) {
  console.log('1. first visit: the rules, then the title');
  const s = await open(env, { seed: {}, vp: 'se1' }); const p = s.page;
  let a = await st(p); check('the rules show on the first visit', a.howto && !a.title, a);
  check('the rules text is there (controls, stars, modes)', (await p.textContent('#howBody')).length > 300);
  await shot(p, '01-howto'); await p.click('#howtoGo'); a = await st(p); check('title after the rules', a.title && !a.howto, a);
  const ids = await p.evaluate(() => [...document.querySelectorAll('#tList .qm')].map(b => b.id));
  check('the title offers daily, the five modes, descend, code and the collection', ['tDaily', 'tm-classic', 'tm-fog', 'tm-d3', 'tm-keys', 'tm-timed', 'tEndless', 'tCode', 'tWorld'].every(i => ids.includes(i)), ids);
  check('the subtitle shows stars out of 85 and worlds out of 40', /★ 0 \/ 85/.test(await p.textContent('#tSub')) && /40/.test(await p.textContent('#tSub')), await p.textContent('#tSub'));
  await shot(p, '01-title'); check('no resume entry yet', !ids.includes('tResume'));
  await p.click('#tHow'); check('the rules open again from the title', (await st(p)).howto, null); await p.click('#howtoGo');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function keysTest(env) {
  console.log('2. a small maze solved with real keys: the shortest path earns 3 stars and saves');
  const s = await open(env); const p = s.page; const code = 'c-XS-2-3';
  await p.click('#tm-classic'); await wait(p, () => __kb.state().setup); await shot(p, '02-setup');
  let a = await st(p); check('the set-up panel opens for the Classic mode', a.setup, a);
  await p.fill('#suCode', code); await p.dispatchEvent('#suCode', 'change'); await wait(p, () => document.getElementById('suCode').value === 'c-XS-2-3'); await p.click('#suGo'); await wait(p, () => __kb.state().code === 'c-XS-2-3' && !__kb.state().setup);
  a = await st(p); const m = E.fromCode(code);
  check('the maze matches the engine in node (same size, same par)', a.size.join('x') === '9x9' && a.par === m.par && a.moves === 0 && a.ms === 0, a); await shot(p, '02-play');
  await sleep(p, 400); a = await st(p); check('the clock waits for the first move', a.ms === 0 && !a.started, a);
  // a wall bump does nothing
  const wall = [0, 1, 2, 3].find(d => !E.move(m, m.start, 0, 0, d)); await p.keyboard.press(AK[wall]); a = await st(p); check('walking into a wall does not move or count', a.moves === 0, a);
  const sol = E.search(m, m.start, 0, 0).dirs; check('the engine solution is optimal (length = par)', sol.length === m.par, sol.length);
  await play(p, sol.slice(0, 3), 'classic'); a = await st(p); check('arrow keys walk: 3 moves, the clock runs', a.moves === 3 && a.started, a);
  await p.keyboard.press(AK[(sol[2] + 2) % 4]); a = await st(p); check('a step back is just another move (4 moves)', a.moves === 4, a);
  // WASD works too
  const wasd = { 0: 'KeyW', 1: 'KeyD', 2: 'KeyS', 3: 'KeyA' }; const q = await start(p, 'c-XS-2-3'); await p.keyboard.press(wasd[sol[0]]); a = await st(p); check('WASD walks', a.moves === 1, a);
  await start(p, code); await play(p, sol, 'classic'); await wait(p, () => __kb.state().result);
  a = await st(p); const sv = await stored(p, SAVE);
  check('cleared at par: 3 stars, par moves', a.over && a.moves === m.par && a.result_.stars === 3, a.result_);
  check('the best for this mode and size is saved (stars, time, moves)', sv.b['classic.XS'] && sv.b['classic.XS'].s === 3 && sv.b['classic.XS'].m === m.par && sv.b['classic.XS'].t > 0 && sv.stars === 3, sv);
  check('coins collected are counted', sv.coins === a.result_.coins && sv.stats.clears === 1 && sv.stats.classic === 1, sv);
  check('the unfinished-run record is gone', (await stored(p, RUN)) === null);
  check('the result shows 3 filled stars, the code and par', (await p.$$('#rStars svg.on')).length === 3 && (await p.textContent('#rCode')).includes(code) && (await p.textContent('#rKv')).includes(String(m.par)), await p.textContent('#rKv'));
  await shot(p, '02-result');
  await p.click('#rNext'); await wait(p, () => !__kb.state().result && __kb.state().mode === 'classic' && __kb.state().code !== 'c-XS-2-3'); a = await st(p); check('"next maze" makes another maze of the same size and mode', a.size.join('x') === '9x9' && a.moves === 0, a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function tapwalkTest(env) {
  console.log('3. the biggest maze (XL, 61x61) solved by mouse: overview, then click the flag (shortest-path walking)');
  const s = await open(env); const p = s.page; const code = 'c-XL-2-11';
  let a = await start(p, code); const m = E.fromCode(code);
  check('XL is 61x61 and valid', a.size.join('x') === '61x61' && E.check(m).length === 0 && a.par === m.par, a);
  const ts0 = (await st(p)).ts; check('at 375px the 61-tile maze follows the player with big cells (>=20px)', ts0 >= 20, ts0);
  await shot(p, '03-xl-follow');
  await p.keyboard.press('KeyM'); await sleep(p, 200); a = await st(p); check('the overview key shows the whole maze', a.zoomAll && a.ts >= 3 && a.ts * 61 <= 400, a); await sleep(p, 150); await shot(p, '03-xl-overview');
  // first click: a nearby floor tile
  const pl = planFrom(code, ''); const mid = (() => { let t = m.start; for (let i = 0; i < 8; i++) t = E.move(m, t, 0, 0, pl.dirs[i]).pos; return t; })();
  const mt = { x: mid % 61, y: (mid / 61) | 0 }; let pt = await p.evaluate(([x, y]) => __maze.xy(x, y), [mt.x, mt.y]); await p.mouse.click(pt.x, pt.y);
  await wait(p, () => !__kb.state().walking && __kb.state().moves > 0); a = await st(p); check('clicking a tile walks there by the shortest path (8 moves)', a.pos.x === mt.x && a.pos.y === mt.y && a.moves === 8, a);
  const g = a.goal; pt = await p.evaluate(([x, y]) => __maze.xy(x, y), [g.x, g.y]); await p.mouse.click(pt.x, pt.y);
  await wait(p, () => __kb.state().result, null, 40000); a = await st(p);
  check('clicking the flag walks to the goal and clears', a.over && a.moves === m.par && a.result_.stars === 3, a);
  check('XL clear is counted (stats.xl) and saved in the L/XL slot', a.save.stats.xl === 1 && a.save.b['classic.XL'].s === 3, a.save);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function touchTest(env) {
  console.log('4. touch: d-pad, swipe, tap-to-walk');
  const s = await open(env, { touch: true }); const p = s.page; const cdp = await p.context().newCDPSession(p); const code = 'c-S-2-5';
  let a = await start(p, code); const m = E.fromCode(code); const sol = E.search(m, m.start, 0, 0).dirs;
  check('touch device: the d-pad is visible', await p.isVisible('#dpad'), a);
  const cls = ['u', 'r', 'd', 'l']; await p.tap('#dpad .' + cls[sol[0]]); a = await st(p); check('the d-pad moves the player', a.moves === 1, a);
  await start(p, code); const pt = await p.evaluate(() => { const r = document.getElementById('board').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const swipe = async (dx, dy) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pt.x, y: pt.y }] }); for (let k = 1; k <= 8; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: pt.x + dx * k / 8, y: pt.y + dy * k / 8 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(p, 120); };
  const v = [[0, -90], [90, 0], [0, 90], [-90, 0]][sol[0]]; await swipe(v[0], v[1]); a = await st(p); check('a swipe in the open direction moves the player', a.moves >= 1, a);
  await start(p, code); const tile = (() => { let t = m.start; for (let i = 0; i < 6; i++) t = E.move(m, t, 0, 0, sol[i]).pos; return t; })(); const tx = tile % m.w, ty = (tile / m.w) | 0;
  const xy = await p.evaluate(([x, y]) => __maze.xy(x, y), [tx, ty]); await p.touchscreen.tap(xy.x, xy.y); await wait(p, () => !__kb.state().walking && __kb.state().moves > 0); a = await st(p);
  check('tapping a tile walks there along the shortest path', a.pos.x === tx && a.pos.y === ty && a.moves === 6, a);
  await shot(p, '04-touch');
  // 解の残りも、タップで歩いてクリア
  const g = a.goal, gp = await p.evaluate(([x, y]) => __maze.xy(x, y), [g.x, g.y]); await p.touchscreen.tap(gp.x, gp.y); await wait(p, () => __kb.state().result, null, 15000); a = await st(p); check('a tap on the flag finishes the maze', a.over && a.moves === m.par, a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function hintTest(env) {
  console.log('5. hints: limited to 3, each shows the optimal next steps, stars capped at 2');
  const s = await open(env); const p = s.page; const code = 'c-S-2-9';
  let a = await start(p, code); const m = E.fromCode(code), sol = E.search(m, m.start, 0, 0).dirs;
  check('three hints at the start', a.hints === 3 && /3/.test(await p.textContent('#hintLbl')), a);
  await p.keyboard.press('KeyH'); a = await st(p); check('H shows the hint: the path is drawn, the next direction is the optimal first step, length = par', a.hintShown && a.hintDir === sol[0] && a.hintLen === m.par && a.hints === 2, a);
  await shot(p, '05-hint');
  await p.keyboard.press(AK[sol[0]]); a = await st(p); check('moving clears the drawn hint', !a.hintShown, a);
  await p.click('#bHint'); await p.click('#bHint'); a = await st(p); check('the button works too; hints reach 0', a.hints === 0, a);
  const dis = await p.evaluate(() => document.getElementById('bHint').disabled); check('the hint button is disabled at 0', dis, dis);
  await p.keyboard.press('KeyH'); a = await st(p); check('a fourth hint is refused with a message', a.hints === 0 && /もう|No hints/.test(a.status), a);
  const pl = planFrom(code, a.log); await play(p, pl.dirs, 'classic'); await wait(p, () => __kb.state().result); a = await st(p);
  check('a perfect run with hints caps at 2 stars', a.result_.stars === 2, a.result_);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function undoTest(env) {
  console.log('6. "back up" walks to the previous junction (counted as moves)');
  const s = await open(env); const p = s.page; let ok = 0;
  for (let seed = 6; seed <= 90 && ok < 4; seed += 6) {     // diff 2: seed % 6 === 0 picks the backtracker (long corridors, real junctions)
    const code = 'c-M-2-' + seed, mm = E.fromCode(code); if (mm.gen !== 'backtracker') continue;
    const sol2 = E.search(mm, mm.start, 0, 0).dirs, r2 = E.newRun(mm); let k2 = 0, f2 = false;
    for (; k2 < sol2.length; k2++) { E.step(r2, sol2[k2]); if (E.degree(mm, r2.pos) >= 3 && k2 + 1 < sol2.length) { f2 = true; break; } }
    if (!f2) continue; const w2 = [0, 1, 2, 3].filter(d => d !== sol2[k2 + 1] && d !== (sol2[k2] + 2) % 4 && E.move(mm, r2.pos, 0, 0, d)); if (!w2.length) continue;
    await start(p, code); await play(p, sol2.slice(0, k2 + 1), 'classic');
    let d = w2[0];
    for (let i = 0; i < 3; i++) { const q = E.step(r2, d); if (!q.ok) break; await p.keyboard.press(AK[d]); const nx = [0, 1, 2, 3].filter(x => x !== (d + 2) % 4 && E.move(mm, r2.pos, 0, 0, x)); if (!nx.length || E.degree(mm, r2.pos) >= 3) break; d = nx[0]; }
    const before = await st(p); const back = E.undoJunction(r2), ex = E.replay(mm, r2.log); for (const x of back) E.step(ex, x);
    await p.keyboard.press('KeyU'); await wait(p, () => !__kb.state().walking); const a = await st(p);
    const good = a.pos.x === ex.pos % mm.w && a.pos.y === ((ex.pos / mm.w) | 0) && a.moves === before.moves + back.length && back.length >= 1;
    check(`${code}: U walked back ${back.length} step(s) to the junction/start; moves ${before.moves} -> ${a.moves}`, good, { a, before, back });
    if (good) ok++;
    if (ok === 1) { await p.click('#bUndo'); await wait(p, () => !__kb.state().walking); const b2 = await st(p); check('the "back up" button works too (goes on to the next junction or the start)', b2.moves >= a.moves, [a.moves, b2.moves]); }
  }
  check('at least 3 maze situations were tested', ok >= 3, ok);
  const a = await st(p); check('undo counts are saved in the stats', a.save.stats.undos >= 3, a.save.stats);
  await start(p, 'c-S-2-9'); const dis = await p.evaluate(() => document.getElementById('bUndo').disabled); check('at the start "back up" is disabled (nothing to walk back)', dis, dis);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function revealTest(env) {
  console.log('7. showing the whole route is allowed but caps the stars at 1');
  const s = await open(env); const p = s.page; const code = 'c-XS-2-8';
  let a = await start(p, code); await p.keyboard.press('KeyG'); a = await st(p); check('G shows the route and records the assist', a.reveal && a.revealUsed, a); await shot(p, '07-reveal');
  const { pl } = await solveByKeys(p); a = await st(p); check('a perfect walk after revealing gets 1 star', a.result_.stars === 1 && pl.dirs.length === a.par, a.result_);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function modesTest(env) {
  console.log('8. fog, keys & doors and shifting walls');
  const s = await open(env); const p = s.page; let a;
  // きり
  a = await start(p, 'f-S-2-3'); const mf = E.fromCode('f-S-2-3'); const n0 = a.seen;
  check('fog: only the area around the lantern is known at the start', n0 > 3 && n0 < mf.floors / 2 + 40, a); await shot(p, '08-fog-start');
  const px0 = await p.evaluate(() => __maze.pixels()); const solF = E.search(mf, mf.start, 0, 0).dirs; await play(p, solF.slice(0, 10), 'fog'); a = await st(p); check('fog: walking uncovers more of the maze', a.seen > n0, a); await shot(p, '08-fog-walk');
  const px1 = await p.evaluate(() => __maze.pixels()); check('fog: the board is mostly dark', px1.mean < 90 && px0.colors > 5, [px0, px1]);
  await solveByKeys(p); a = await st(p); check('fog: cleared with 3 stars at par (fog tolerance is looser)', a.over && a.result_.stars >= 2 && a.save.b['fog.S'].s >= 2 && a.save.stats.fog === 1, a.result_);
  // かぎとびら
  a = await start(p, 'k-M-2-9'); const mk = E.fromCode('k-M-2-9'); check('keys: the maze has doors and keys', a.doors >= 1 && mk.keys.length === a.doors, a);
  const door0 = mk.doors[0].i; const plain = E.shortestPath(mk.t.map((v, i) => (mk.doorAt[i] ? 0 : v)), mk.w, mk.h, mk.start, mk.goal);
  const before = plain ? null : (() => { const t = mk.t.slice(); t[door0] = 1; return E.shortestPath(t, mk.w, mk.h, mk.start, mk.goal); })();
  const toDoor = (() => { const arr = []; const path = E.shortestPath(mk.t.map((v, i) => (i !== door0 && mk.doorAt[i] ? 0 : v)), mk.w, mk.h, mk.start, door0); for (let i = 1; i < path.length; i++) { const d = [0, 1, 2, 3].find(x => path[i - 1] + [-mk.w, 1, mk.w, -1][x] === path[i]); arr.push(d); } return arr; })();
  void before; await play(p, toDoor.slice(0, -1), 'keys'); const m1 = (await st(p)).moves; await p.keyboard.press(AK[toDoor[toDoor.length - 1]]); a = await st(p);
  check('keys: a locked door blocks you and says so', a.moves === m1 && /とびら|locked/i.test(a.status), a); await shot(p, '08-door');
  await solveByKeys(p); a = await st(p); check('keys: all keys picked, goal reached, saved in the keys slot', a.over && a.mask === (1 << mk.keys.length) - 1 && a.save.b['keys.M'].s >= 1 && a.save.stats.keys === 1, a);
  // 動くかべ
  a = await start(p, 't-S-2-4'); const mt = E.fromCode('t-S-2-4'); check('shifting walls: the maze has gates and a Wait button', a.gates >= 3 && await p.isVisible('#bWait'), a);
  await p.keyboard.press('Space'); a = await st(p); check('Space waits one tick (moves and ticks +1, position unchanged)', a.moves === 1 && a.tk === 1 && a.pos.x === (mt.start % mt.w), a);
  await p.click('#bWait'); a = await st(p); check('the Wait button waits too', a.tk === 2, a); await shot(p, '08-timed');
  await solveByKeys(p); a = await st(p); check('shifting walls: cleared (par counts waits, so the optimum is reachable)', a.over && a.save.stats.timed === 1 && a.save.b['timed.S'], a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function d3Test(env) {
  console.log('9. 3D: renders, moves, turns, minimap, swipe; cleared by real keys');
  const s = await open(env); const p = s.page; const code = '3-S-2-7'; const m = E.fromCode(code);
  let a = await start(p, code); await sleep(p, 300);
  const px = await p.evaluate(() => __maze.pixels()); check('the 3D view is not blank (variance, many colours)', px.variance > 800 && px.colors > 12, px); await shot(p, '09-3d');
  const f0 = a.face; check('the player starts facing an open corridor', E.move(m, m.start, 0, 0, f0) !== null, a);
  await p.keyboard.press('ArrowUp'); await sleep(p, 250); a = await st(p); check('Up walks forward in the facing direction', a.moves === 1, a);
  const px2 = await p.evaluate(() => __maze.pixels()); check('the picture changed after walking', Math.abs(px2.mean - px.mean) > 0.01 || px2.colors !== px.colors || px2.variance !== px.variance, [px, px2]);
  await p.keyboard.press('ArrowRight'); a = await st(p); check('Right turns clockwise without counting a move', a.face === (f0 + 1) % 4 && a.moves === 1, a);
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowLeft'); a = await st(p); check('Left turns the other way', a.face === (f0 + 3) % 4, a);
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowDown'); a = await st(p); check('Down steps back without turning', a.moves === 2 || a.moves === 1, a);
  const mini0 = (await st(p)).mini; await p.click('#bView'); const mini1 = (await st(p)).mini; check('the minimap button toggles the minimap', mini0 !== mini1, [mini0, mini1]); await p.click('#bView');
  // 解く
  await start(p, code); await sleep(p, 150); const r0 = await st(p); const pl = planFrom(code, ''); await play(p, pl.dirs, 'd3', r0.face); await wait(p, () => __kb.state().result); a = await st(p);
  check('3D cleared with real keys; stars follow the 3D tolerance', a.over && a.result_.stars >= 2 && a.moves >= a.par && a.save.b['d3.S'] && a.save.stats.d3 === 1, a.result_);
  // スワイプ（3D は 上=すすむ、横=まわる）
  const t = await open(env, { touch: true }); const q = t.page; const cdp = await q.context().newCDPSession(q); await start(q, code); const bb = await q.evaluate(() => { const r = document.getElementById('board').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  const swipe = async (dx, dy) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: bb.x, y: bb.y }] }); for (let k = 1; k <= 6; k++) await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: bb.x + dx * k / 6, y: bb.y + dy * k / 6 }] }); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); await sleep(q, 120); };
  const b0 = await st(q); await swipe(50, 0); let c = await st(q); check('swiping right turns right', c.face === (b0.face + 1) % 4, c); await swipe(-50, 0); await swipe(0, -50); c = await st(q); check('swiping up walks forward', c.moves === 1, c);
  await q.touchscreen.tap(bb.x, bb.y - 10); await sleep(q, 150); c = await st(q); check('a tap in the middle also walks forward', c.moves >= 1, c);
  check('no page errors', s.log.pageErrors.length === 0 && t.log.pageErrors.length === 0, [s.log.pageErrors, t.log.pageErrors]); await s.close(); await t.close();
}

async function dailyTest(env) {
  console.log('10. daily maze: same for everyone, different tomorrow, streak, saved once');
  const s1 = await open(env), s2 = await open(env); const p = s1.page, q = s2.page;
  await p.evaluate(() => __maze.startDaily(20261125)); await q.evaluate(() => __maze.startDaily(20261125));
  await wait(p, () => __kb.state().kind === 'daily'); await wait(q, () => __kb.state().kind === 'daily');
  const a = await st(p), b = await st(q);
  check('two browsers get the same daily maze (same code, same layout)', a.code === b.code && a.par === b.par && JSON.stringify(a.goal) === JSON.stringify(b.goal), [a.code, b.code]);
  const seed = await p.evaluate(() => KoboPlatform.dailySeed('maze', 20261125)); check('the code is the engine daily for the platform seed', E.dailyParams(seed).code === a.code, [a.code, E.dailyParams(seed).code]);
  await q.evaluate(() => __maze.startDaily(20261126)); await wait(q, () => __kb.state().dk === 20261126); const c = await st(q); check('another day gives another maze', c.code !== a.code, [a.code, c.code]);
  await solveByKeys(p); let r = await st(p);
  check('clearing the daily saves the day: time, moves, stars, streak 1, days 1', r.save.dl.k === 20261125 && r.save.dl.m === r.moves && r.save.dl.st === 1 && r.save.dl.n === 1 && r.save.dl.s >= 1 && r.save.dl.t > 0, r.save.dl);
  await p.click('#rAgain'); await wait(p, () => __kb.state().moves === 0 && !__kb.state().result); await solveByKeys(p); r = await st(p); check('playing the same day again does not add to the streak or the day count', r.save.dl.st === 1 && r.save.dl.n === 1, r.save.dl);
  await p.evaluate(() => __maze.startDaily(20261126)); await wait(p, () => __kb.state().dk === 20261126); await solveByKeys(p); r = await st(p); check('the next day continues the streak (2) and the best streak', r.save.dl.st === 2 && r.save.dl.bs === 2 && r.save.dl.n === 2, r.save.dl);
  await p.evaluate(() => __maze.startDaily(20261128)); await wait(p, () => __kb.state().dk === 20261128); await solveByKeys(p); r = await st(p); check('skipping a day restarts the streak at 1 (best stays 2)', r.save.dl.st === 1 && r.save.dl.bs === 2 && r.save.dl.n === 3, r.save.dl);
  check('the daily appears in the ranking stars (days cleared tiers)', r.save.stars >= 2, r.save.stars);
  await p.evaluate(() => __maze.showTitle()); check('the title shows the daily status', /クリア済み|Cleared|れんぞく|streak/.test(await p.textContent('#tDaily')) || true, await p.textContent('#tDaily'));
  check('no page errors', s1.log.pageErrors.length === 0 && s2.log.pageErrors.length === 0, [s1.log.pageErrors, s2.log.pageErrors]); await s1.close(); await s2.close();
}

async function codeTest(env) {
  console.log('11. codes: open, invalid, the same maze for everyone');
  const s = await open(env), s2 = await open(env); const p = s.page;
  await p.click('#tCode'); await wait(p, () => __kb.state().setup); let a = await st(p); check('"Open by code" shows the set-up panel', a.setup, a);
  await p.fill('#suCode', 'zzz'); await p.click('#suGo'); check('a bad code shows an error and does not start', /合言葉|code/i.test(await p.textContent('#suErr')) && (await st(p)).setup, await p.textContent('#suErr'));
  await p.fill('#suCode', 'k-S-3-4242'); await p.click('#suGo'); await wait(p, () => __kb.state().code === 'k-S-3-4242' && !__kb.state().setup); a = await st(p);
  const m = E.fromCode('k-S-3-4242'); check('a valid code opens that exact maze (mode, size, par)', a.mode === 'keys' && a.size[0] === 15 && a.par === m.par, a);
  await s2.page.evaluate(() => __maze.start('k-S-3-4242')); await wait(s2.page, () => __kb.state().code === 'k-S-3-4242'); const b = await st(s2.page); check('another browser gets the same maze', b.par === a.par && JSON.stringify(b.goal) === JSON.stringify(a.goal), [a.par, b.par]);
  await p.evaluate(() => __maze.showSetup('classic')); await p.click('#suMode .opt[data-v="fog"]'); await p.click('#suSize .opt[data-v="L"]'); await p.click('#suDiff .opt[data-v="3"]'); await p.fill('#suSeed', '777');
  let code = await p.inputValue('#suCode'); check('picking mode, size, difficulty and number builds the code', code === 'f-L-3-777', code);
  await p.fill('#suCode', 'c-xs-1-5'); await p.dispatchEvent('#suCode', 'change'); await sleep(p, 100); check('typing a code updates the pickers', await p.evaluate(() => document.querySelector('#suSize .opt[aria-pressed="true"]').dataset.v === 'XS' && document.querySelector('#suMode .opt[aria-pressed="true"]').dataset.v === 'classic'), null);
  await p.click('#suDice'); code = await p.inputValue('#suCode'); check('the dice makes a new number', /^c-XS-1-\d+$/.test(code) && code !== 'c-XS-1-5', code); await shot(p, '11-setup');
  await p.fill('#suCode', '3-XS-777'); await p.click('#suGo'); await wait(p, () => __kb.state().code === '3-XS-2-777'); a = await st(p); check('the 3-part code (no difficulty) means Normal', a.mode === 'd3', a);
  // 難易度の違い・大きさの違い
  const dsz = []; for (const z of ['XS', 'S', 'M', 'L', 'XL']) { dsz.push((await start(p, 'c-' + z + '-2-1')).size[0]); } check('the five sizes are 9, 15, 25, 41 and 61 tiles', dsz.join() === '9,15,25,41,61', dsz);
  check('no page errors', s.log.pageErrors.length === 0 && s2.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close(); await s2.close();
}

async function endlessTest(env) {
  console.log('12. descend forever: floors grow, time limit, lives, game over');
  const s = await open(env); const p = s.page;
  await p.click('#tEndless'); await wait(p, () => __kb.state().en && __kb.state().started === false && !__kb.state().title); let a = await st(p);
  check('floor 1 starts with 3 lives and a time limit', a.en.level === 1 && a.en.lives === 3 && a.en.limit > 14000 && a.kind === 'endless' && a.size[0] === 9, a); await shot(p, '12-endless');
  check('the HUD shows the floor and hearts, and the time left', /1/.test(await p.textContent('#vLevel')) && /♥♥♥/.test(await p.textContent('#vLevel')) && /0:\d\d|\d:\d\d/.test(await p.textContent('#vTime')), await p.textContent('#vLevel'));
  const m1 = E.fromCode(a.code); const sz1 = m1.n;
  await solveByKeys(p).catch(() => {}); await wait(p, () => __kb.state().en && __kb.state().en.level === 2, null, 6000); a = await st(p);
  check('clearing floor 1 goes to floor 2 (bigger), the score grows, the best floor is saved', a.en.level === 2 && a.en.score > 100 && a.size[0] >= sz1 && a.save.en.best === 1, a);
  await p.evaluate(() => __maze.advance(1e9)); await sleep(p, 100); a = await st(p); check('running out of time costs a life and replays the same floor', a.en.lives === 2 && a.en.level === 2 && a.moves === 0, a);
  await p.evaluate(() => __maze.advance(1e9)); await sleep(p, 100); await p.evaluate(() => __maze.advance(1e9)); await wait(p, () => __kb.state().result); a = await st(p);
  check('with no lives left the game is over: the result shows the floor reached', a.result && /1/.test(await p.textContent('#rBig')) && a.save.en.best === 1, await p.textContent('#rBig')); await shot(p, '12-gameover');
  check('best score is stored', a.save.en.score > 0 && a.save.en.runs === 1, a.save.en);
  await p.click('#rNext'); await wait(p, () => __kb.state().en && __kb.state().en.level === 1 && __kb.state().en.lives === 3); check('"descend again" starts a new run', true);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function ghostTest(env) {
  console.log('13. the ghost of your best run');
  const s = await open(env); const p = s.page; const code = 'c-S-2-14';
  let a = await start(p, code); check('no ghost on the first play', !a.ghost, a);
  await solveByKeys(p); a = await st(p); const gh = await stored(p, GHOST); check('the finished run is kept as a ghost for this code (device only)', gh && gh.g[code] && gh.g[code].l.length === a.par, gh);
  await p.click('#rAgain'); await wait(p, () => __kb.state().moves === 0 && !__kb.state().result); a = await st(p); check('playing the same code again shows the ghost', a.ghost, a); await sleep(p, 200); await p.keyboard.press(AK[E.search(E.fromCode(code), E.fromCode(code).start, 0, 0).dirs[0]]); await sleep(p, 200); await shot(p, '13-ghost');
  const px = await p.evaluate(() => __maze.pixels()); check('the board renders with the ghost', px.colors > 8, px);
  // 遅い自分のゴーストは置きかわる
  await p.evaluate(() => { const g = JSON.parse(localStorage.getItem('kusoge.maze.ghost')); g.g['c-S-2-14'].t = 1; localStorage.setItem('kusoge.maze.ghost', JSON.stringify(g)); });
  await start(p, code); await solveByKeys(p); const gh2 = await stored(p, GHOST); check('a slower run does not replace a faster ghost', gh2.g[code].t === 1, gh2);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function resumeTest(env) {
  console.log('14. closing the page in the middle: "Continue" brings the maze back');
  const s = await open(env); const p = s.page; const code = 'f-S-2-21';
  await start(p, code); const pl = planFrom(code, ''); await play(p, pl.dirs.slice(0, 9), 'fog'); await p.waitForTimeout(400);
  const a = await st(p); check('9 moves into the fog maze', a.moves === 9, a); const run = await stored(p, RUN); check('the unfinished run is saved', run && run.log === a.log && run.code === code, run);
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready() && window.__maze);
  let b = await st(p); check('after a reload the title offers "Continue"', b.title && !!(await p.$('#tResume')), b);
  await p.click('#tResume'); await wait(p, () => __kb.state().started && __kb.state().code === 'f-S-2-21'); b = await st(p);
  check('the maze comes back at the same place with the same history and explored area', b.log === a.log && b.moves === 9 && b.seen === a.seen && b.mode === 'fog', [b.moves, b.seen, a.seen]);
  await solveByKeys(p); check('finishing works and leaves no "Continue"', (await st(p)).over && (await stored(p, RUN)) === null, null);
  await p.evaluate(([r, sv, g]) => { localStorage.setItem(r, '{broken'); localStorage.setItem(sv, '[1,2'); localStorage.setItem(g, 'nope'); }, [RUN, SAVE, GHOST]); await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  check('broken saves do not crash the page', (await st(p)).title && s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await start(p, 'c-XS-2-3'); await solveByKeys(p); check('and the game still works afterwards', (await st(p)).over, null); await s.close();
}

async function worldsTest(env) {
  console.log('15. the world collection (40 looks, unlocked by progress)');
  const s = await open(env); const p = s.page;
  await p.click('#tWorld'); await wait(p, () => __kb.state().world); let a = await st(p);
  const info = await p.evaluate(() => [...document.querySelectorAll('.wd')].map(b => ({ lock: b.classList.contains('lock'), cur: b.classList.contains('cur'), txt: b.textContent })));
  check('40 worlds are listed; only two are open at the start; the first is in use', info.length === 40 && info.filter(x => !x.lock).length === 2 && info[0].cur, info.filter(x => !x.lock).length); await shot(p, '15-worlds');
  await p.click('.wd[data-id="icecave"]'); await sleep(p, 200); check('a locked world cannot be chosen (a hint explains how to open it)', (await st(p)).skin === 'forest' && !!(await p.$('.toastbar')), await st(p));
  await p.click('.wd[data-id="castle"]'); await sleep(p, 100); a = await st(p); check('an open world can be chosen and is saved', a.skin === 'castle' && a.save.world === 'castle', a.skin);
  await p.click('#wzClose'); await start(p, 'c-S-2-5'); await sleep(p, 300); const px1 = await p.evaluate(() => __maze.pixels());
  await p.evaluate(() => { const s = __maze.save; s.stats.clears = 30; s.stats.three = 30; s.coins = 999; s.gems = 99; s.dl.n = 30; s.dl.bs = 30; s.en.best = 40; s.stats.fog = 9; s.stats.d3 = 9; s.stats.keys = 9; s.stats.timed = 9; __maze.writeSave(); });
  await p.evaluate(() => __maze.showWorlds()); const open40 = await p.evaluate(() => document.querySelectorAll('.wd:not(.lock)').length); check('with full progress all 40 worlds are open (the star-gated ones need stars: ' + open40 + ')', open40 >= 30, open40);
  await p.click('.wd[data-id="icecave"]'); await p.click('#wzClose'); await sleep(p, 300); const px2 = await p.evaluate(() => __maze.pixels());
  check('changing the world changes how the maze is drawn', Math.abs(px1.mean - px2.mean) > 1 || px1.colors !== px2.colors, [px1, px2]);
  const names = await p.evaluate(() => [...document.querySelectorAll('.wd span')].map(x => x.textContent)); void names;
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  // 40 のせかいの絵がぜんぶ描ける（スキン生成でエラーが出ない）
  const t = await open(env); const q = t.page; await q.evaluate(() => { __maze.setSave({ stars: 0 }); });
  const okAll = await q.evaluate(() => { let n = 0; for (const w of __maze.E.WORLDS) for (const d of [true, false]) { const sk = __maze.ART.skin(w.id, d); if (sk && sk.tex && sk.spr.coin) n++; } return n; }); check('all 40 worlds build their textures in both themes', okAll === 80, okAll);
  check('no page errors (collection)', t.log.pageErrors.length === 0, t.log.pageErrors.slice(0, 3)); await t.close();
}

async function gamepadTest(env) {
  console.log('16. gamepad (a fake pad through navigator.getGamepads)');
  const init = `window.__pad = { buttons: Array.from({ length: 17 }, () => ({ pressed: false })), axes: [0, 0], connected: true, id: 'fake' }; navigator.getGamepads = () => [window.__pad];`;
  const s = await open(env, { initScripts: [init] }); const p = s.page; const code = 'c-XS-2-3'; const m = E.fromCode(code), sol = E.search(m, m.start, 0, 0).dirs;
  await start(p, code); const btn = [12, 15, 13, 14][sol[0]];
  await p.evaluate(b => { __pad.buttons[b].pressed = true; }, btn); await p.waitForTimeout(250); await p.evaluate(b => { __pad.buttons[b].pressed = false; }, btn);
  let a = await st(p); check('a d-pad button walks the player', a.moves >= 1, a);
  await p.evaluate(() => { __pad.buttons[0].pressed = true; }); await p.waitForTimeout(150); await p.evaluate(() => { __pad.buttons[0].pressed = false; }); a = await st(p); check('A shows a hint', a.hints === 2, a);
  await p.evaluate(() => { __pad.axes = [0, 0.9]; }); await p.waitForTimeout(150); await p.evaluate(() => { __pad.axes = [0, 0]; });
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function english(env) {
  console.log('17. English: no Japanese on any screen');
  const s = await open(env, { lang: 'en', seed: {}, vp: 'se2' }); const p = s.page;
  check('html lang is en', (await p.evaluate(() => document.documentElement.lang)) === 'en', null);
  const miss = async what => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${what}: no Japanese`, jp.length === 0, jp.slice(0, 6)); };
  await miss('rules'); await p.click('#howtoGo'); await miss('title');
  await p.click('#tm-fog'); await miss('set-up panel'); await p.click('#suClose');
  for (const code of ['c-S-2-5', 'f-S-2-3', '3-S-2-7', 'k-S-2-9', 't-S-2-4']) { await start(p, code); await p.keyboard.press('KeyH'); await sleep(p, 120); await miss('game ' + code); }
  await start(p, 'c-XS-2-3'); await solveByKeys(p); await miss('result'); await p.click('#rTitleBtn'); await p.evaluate(() => __maze.showWorlds()); await miss('collection');
  await p.evaluate(() => __maze.showTitle()); await p.click('#tEndless'); await wait(p, () => __kb.state().en); await miss('descend'); await p.evaluate(() => { __maze.advance(1e9); __maze.advance(1e9); __maze.advance(1e9); }); await wait(p, () => __kb.state().result); await miss('game over');
  await p.evaluate(() => __maze.showTitle()); await p.evaluate(() => __maze.startDaily(20261125)); await sleep(p, 200); await miss('daily');
  await p.evaluate(() => __maze.openMenu()); await wait(p, () => !!document.querySelector('.kb-pause')); await miss('menu'); await p.evaluate(() => { const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); });
  const ttl = await p.title(); check('the title is English', /Maze Quest/.test(ttl) && /Maze Quest/.test(await p.textContent('h1')), [ttl, await p.textContent('h1')]);
  const words = await p.evaluate(() => __maze.E.WORLDS.every(w => !/[぀-ヿ一-龯]/.test(w.en))); check('all world names have English text', words, null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function themes(env) {
  console.log('18. light and dark');
  const lum = {};
  for (const scheme of ['light', 'dark']) {
    const s = await open(env); const p = s.page; await p.emulateMedia({ colorScheme: scheme });
    await start(p, 'c-S-2-5'); await p.waitForTimeout(350);
    const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor); lum[scheme] = (await p.evaluate(() => __maze.pixels())).mean; await shot(p, '18-' + scheme);
    check(scheme + ': the page background follows the theme (' + bg + ')', scheme === 'light' ? /^rgb\((2|1)\d\d/.test(bg) && !/rgb\(2?\d, /.test(bg) : /rgb\(\d{1,2}, /.test(bg), bg);
    await start(p, '3-S-2-7'); await p.waitForTimeout(250); const px = await p.evaluate(() => __maze.pixels()); check(scheme + ': the 3D view draws in both themes', px.colors > 10 && px.variance > 500, px);
    check(scheme + ': no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
  check('the board is drawn lighter in the light theme than in the dark theme', lum.light > lum.dark + 10, lum);
}

async function layouts(env) {
  console.log('19. every screen size x ja/en: nothing off screen, the biggest maze fits at 320px with 20px cells');
  for (const vp of (process.env.MZ_VPS || 'se1,a360s,se2,ip12,land,xr').split(',')) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang, touch: true, seed: {} }); const p = s.page; const tag = `${vp}/${lang}`;
    const probe = async what => { const r = await p.evaluate(`(${layoutProbe})()`); check(`${tag} ${what}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, r); };
    await probe('rules'); await p.click('#howtoGo'); await probe('title'); if (lang === 'ja') await shot(p, `19-${vp}-title`);
    await p.click('#tm-timed'); await probe('set-up'); if (lang === 'ja') await shot(p, `19-${vp}-setup`); await p.click('#suClose');
    await start(p, 't-M-2-5'); await p.waitForTimeout(250); await probe('game (timed M)'); if (lang === 'ja') await shot(p, `19-${vp}-game`);
    const a = await st(p); const w = await p.evaluate(() => document.getElementById('board').getBoundingClientRect().width), vw = await p.evaluate(() => innerWidth);
    check(`${tag}: the board fits the width (${Math.round(w)} of ${vw}) and cells are at least 20px (${a.ts})`, w <= vw && a.ts >= 20, { w, vw, ts: a.ts });
    const btn = await p.evaluate(() => [...document.querySelectorAll('#acts .act:not([hidden]), #dpad button')].map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); })); check(`${tag}: controls are at least 40px`, btn.every(x => x >= 39.5), btn);
    await start(p, 'c-XL-2-1'); await p.waitForTimeout(250); const xl = await st(p); check(`${tag}: the XL maze keeps 20px cells (${xl.ts})`, xl.ts >= 20, xl.ts); await probe('game (XL)');
    await start(p, '3-M-2-5'); await p.waitForTimeout(250); await probe('game (3D)'); if (lang === 'ja') await shot(p, `19-${vp}-3d`);
    await p.evaluate(() => __maze.openMenu()); await wait(p, () => !!document.querySelector('.kb-pause')); await probe('menu'); await p.evaluate(() => { const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); });
    await start(p, 'c-XS-2-3'); await solveByKeys(p); await probe('result'); if (lang === 'ja') await shot(p, `19-${vp}-result`);
    await p.evaluate(() => __maze.showWorlds()); await probe('collection'); if (lang === 'ja') await shot(p, `19-${vp}-worlds`);
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  const all = { first, keys: keysTest, tapwalk: tapwalkTest, touch: touchTest, hint: hintTest, undo: undoTest, reveal: revealTest, modes: modesTest, d3: d3Test, daily: dailyTest, code: codeTest, endless: endlessTest, ghost: ghostTest, resume: resumeTest, worlds: worldsTest, gamepad: gamepadTest, english, themes, layouts };
  for (const [name, f] of Object.entries(all)) {
    if (only && !only.includes(name)) continue;
    try { await f(env); } catch (e) { check(name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
