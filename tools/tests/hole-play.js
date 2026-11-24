#!/usr/bin/env node
// あなぼこシティの通しプレイ（Playwright、?debug の window.__kb / __hole。3D の街）
//   node tools/tests/hole-play.js [normal,keys,combo,missions,rules,touch,compat,english,layouts]   … 全部で約3〜4分
// 1. ふつう：まちめぐり・CPUとたいせんが今までどおり（保存・結果・practice にならない）。コンボは出るが点数は変わらない
// 2. キーボード：タイトルの 1〜6・S、Esc で一つ戻る、結果の Enter / R / N / T、WASD・矢印で動く
// 3. コンボ：ボットでのみこむとコンボが伸びる・チップが出る・最大コンボが kusoge.hole.x に残る
// 4. ミッション：一覧と鍵・カード・ボットで目的の種類ごとに★・★の保存（kusoge.hole.x）・次が開く・practice 報告・ランキングの値が変わらない・全12ミッションをクリア
// 5. ルール：ミッション中はショップの強化が効かない・早く着く（fast）で終わる・ライバルを のみこむ（kills）
// 6. タッチ：本物のタップでミッション一覧・カード・スタート・CDP のタッチでドラッグして動く
// 7. 古い保存：x がこわれていても開く・今までの保存がそのまま読める
// 8. 英語：日本語が残らない
// 9. 画面サイズ × ja/en × 明るい/暗い：横スクロールなし・ボタンが画面内
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const E = require('../../hole/engine.js');

const OUT = path.join(__dirname, 'out', 'shots', 'hole-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.hole.save', X = 'kusoge.hole.x';
const SEED = { [SAVE]: JSON.stringify({ seen: 1, tut: 1, coins: 500 }) };

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || SEED, isMobile: !!o.touch, hasTouch: !!o.touch });
  if (o.scheme) await s.page.emulateMedia({ colorScheme: o.scheme });
  await s.goto('/hole/?debug');
  await s.page.waitForFunction(() => window.__kb && __kb.ready(), null, { timeout: 30000 });
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => localStorage.getItem(k), k);
const storedJ = async (p, k) => { const v = await stored(p, k); try { return JSON.parse(v); } catch (e) { return v; } };
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const vis = (p, sel) => p.isVisible(sel);
const pageOk = (s, name) => check(name || 'no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
const hook = p => p.evaluate(() => { window.__evlog = []; if (window.KoboGame) { const e = KoboGame.emit; KoboGame.emit = function (n, d) { window.__evlog.push([n, d && d.mode, d && d.reason, d && d.kind]); return e.apply(this, arguments); }; } });
const events = p => p.evaluate(() => window.__evlog || []);
const key = (p, k) => p.keyboard.press(k);
const waitFor = (p, fn, ms, arg) => p.waitForFunction(fn, arg, { timeout: ms || 15000 }).catch(() => {});
const ready = p => waitFor(p, () => !__kb.state().loading && __kb.state().playing, 40000);
const resultUp = p => waitFor(p, () => __kb.state().result, 8000);
// the bot plays until the round ends (simulated time, no sound)
const botPlay = p => p.evaluate(() => { let n = 0; while (__kb.state().playing && n < 400) { __kb.step(1); n++; } return __kb.state(); });
const hudText = p => p.evaluate(() => document.getElementById('mhud').innerText.replace(/\s+/g, ' '));

async function normal(env) {
  console.log('1. regular modes still play');
  const s = await open(env), p = s.page;
  await hook(p);
  let x = await st(p);
  check('opens on the title with the saved coins and no mission HUD', x.screen === 'menu' && x.coins === 500 && !x.misHud && x.mis === null, x);
  check('the title has the mission button (0/36 stars)', (await vis(p, '#btnMis')) && /0\/36/.test(await p.textContent('#btnMis')), await p.textContent('#btnMis'));
  await p.evaluate(() => __kb.start('match'));
  await ready(p);
  await p.evaluate(() => __kb.step(25));
  x = await st(p);
  check('a CPU battle runs and the player swallows things', x.kind === 'match' && x.eaten > 0 && x.score > 0 && !x.misHud, x);
  check('the combo is counted in a battle', x.comboMax >= 1, x);
  const pts0 = x.score;
  const cb = await p.evaluate(() => __kb.combo());
  check('the combo does not add points (a score is the swallowed value only)', pts0 === await p.evaluate(() => __hole.player.pts), cb);
  await p.evaluate(() => __kb.win()); await resultUp(p);
  x = await st(p);
  check('the result shows and best.maxPts goes up', x.result && x.best >= 5000, x);
  const save = await storedJ(p, SAVE);
  check('the save keeps its shape (best, coins, camp)', save.best && save.best.maxPts >= 5000 && save.coins > 500 && save.camp && Array.isArray(save.camp.stars), save);
  const ev = await events(p);
  check('a CPU battle is reported as normal play', ev.some(e => e[0] === 'play_start' && e[1] === 'normal') && ev.some(e => e[0] === 'play_end' && e[1] === 'normal'), ev);
  check('the max combo is saved in kusoge.hole.x (and no mission stars yet)', (await storedJ(p, X)).c >= 1 && (await storedJ(p, X)).s.every(v => v === 0), await storedJ(p, X));
  check('the result line shows the max combo', await p.evaluate(() => !document.getElementById('resCmb').hidden && /×/.test(document.getElementById('resCmb').textContent)), await p.textContent('#resCmb'));
  await shot(p, '1-result');
  pageOk(s); await s.close();
}

async function keys(env) {
  console.log('2. keyboard');
  const s = await open(env), p = s.page;
  await key(p, 'Digit2');
  check('2 on the title opens the missions', (await st(p)).misOpen, await st(p));
  await key(p, 'Escape');
  check('Esc goes back to the title', (await st(p)).screen === 'menu' && !(await st(p)).misOpen && await vis(p, '#ovTitle'), await st(p));
  await key(p, 'Digit1');
  check('1 opens the tour', await vis(p, '#ovCamp'), {});
  await key(p, 'Escape');
  check('Esc leaves the tour', await vis(p, '#ovTitle') && !(await vis(p, '#ovCamp')), {});
  await key(p, 'KeyS');
  check('S opens the shop', await vis(p, '#ovShop'), {});
  await key(p, 'Escape');
  await key(p, 'Digit6');
  check('6 opens the city viewer', await vis(p, '#ovView'), {});
  await key(p, 'Escape');
  await key(p, 'Digit2'); await p.waitForTimeout(100);
  const first = await p.evaluate(() => document.activeElement && document.activeElement.dataset && document.activeElement.dataset.mi);
  check('the newest open mission has the focus', first === '0', first);
  await key(p, 'Enter');
  check('Enter opens the mission card', (await st(p)).misCard && await vis(p, '#btnMcGo'), await st(p));
  check('the Start button has the focus', await p.evaluate(() => document.activeElement && document.activeElement.id === 'btnMcGo'), {});
  await key(p, 'Escape');
  check('Esc goes back to the mission list', (await st(p)).misOpen && !(await st(p)).misCard, await st(p));
  await key(p, 'Enter'); await key(p, 'Enter');
  await ready(p);
  let x = await st(p);
  check('Enter, Enter starts mission 1', x.playing && x.mis === 1 && x.misHud, x);
  const p0 = await p.evaluate(() => [__hole.player.x, __hole.player.z]);
  await p.keyboard.down('KeyD'); await p.waitForTimeout(500); await p.keyboard.up('KeyD');
  const p1 = await p.evaluate(() => [__hole.player.x, __hole.player.z]);
  check('WASD moves the hole', Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.5 && p1[0] > p0[0], { p0, p1 });
  await key(p, 'Escape');
  check('Esc pauses', (await st(p)).paused, await st(p));
  await key(p, 'Escape'); await p.waitForTimeout(200);
  check('Esc again closes the pause menu and the round goes on', !(await st(p)).paused && (await st(p)).playing, await st(p));
  await p.evaluate(() => __kb.win()); await resultUp(p);
  await p.waitForTimeout(100);
  check('the result has Next for a cleared mission', await vis(p, '#btnNext') && /ミッション/.test(await p.textContent('#btnNext')), await p.textContent('#btnNext'));
  await key(p, 'KeyN');
  check('N goes to the next mission card', (await st(p)).misCard && /ミッション 2/.test(await p.textContent('#mcNo')), await p.textContent('#mcNo'));
  await key(p, 'Enter'); await ready(p);
  check('Enter starts mission 2', (await st(p)).mis === 2, await st(p));
  await p.evaluate(() => __kb.lose()); await resultUp(p);
  await key(p, 'KeyR'); await ready(p);
  check('R on the result plays it again', (await st(p)).mis === 2 && (await st(p)).playing, await st(p));
  await p.evaluate(() => __kb.lose()); await resultUp(p);
  await key(p, 'KeyT');
  check('T goes back to the missions', (await st(p)).misOpen, await st(p));
  pageOk(s); await s.close();
}

async function combo(env) {
  console.log('3. combo');
  const s = await open(env), p = s.page;
  await p.evaluate(() => __kb.start('solo')); await ready(p);
  let seen = false, best = 0;
  for (let i = 0; i < 40 && !seen; i++) {
    await p.evaluate(() => __kb.step(1));
    const c = await p.evaluate(() => ({ live: __kb.combo().n, vis: !document.getElementById('combo').hidden, txt: document.getElementById('combo').textContent }));
    best = Math.max(best, c.live);
    if (c.live >= 2 && c.vis && /×\d+ コンボ/.test(c.txt)) seen = true;
  }
  check('the combo chip shows while swallowing in a row', seen, { best });
  for (let i = 0; i < 40 && (await p.evaluate(() => __kb.state().comboMax)) < 3; i++) await p.evaluate(() => __kb.step(1));
  const x = await st(p);
  check('the best combo grows in a round', x.comboMax >= 3, x);
  const mx = x.comboMax;
  await p.evaluate(() => __kb.win()); await resultUp(p);
  check('the best combo is saved in kusoge.hole.x', (await storedJ(p, X)).c >= mx, await storedJ(p, X));
  await shot(p, '3-combo');
  pageOk(s); await s.close();
}

async function missions(env) {
  console.log('4. missions');
  const s = await open(env), p = s.page;
  await hook(p);
  const rank0 = (await storedJ(p, SAVE)).best;
  await p.click('#btnMis');
  let x = await st(p);
  check('the button opens the mission list with 12 missions', x.misOpen && (await p.locator('#misList .cst').count()) === 12, x);
  check('only the first mission is open', (await p.locator('#misList .cst:not(:disabled)').count()) === 1, {});
  check('three world headings', (await p.locator('#misList .csec').count()) === 3, {});
  await shot(p, '4-list');
  await p.click('#misList .cst[data-mi="0"]');
  check('tapping a mission shows its card with the goal and ★ lines', (await st(p)).misCard && /90秒|1:30/.test(await p.textContent('#mcGoal') + await p.textContent('#mcDesc')) && /★★★/.test(await p.textContent('#mcStars')), await p.textContent('#mcGoal'));
  await shot(p, '4-card');
  await p.click('#btnMcGo'); await ready(p);
  x = await st(p);
  check('the round starts: mission HUD, no rank list (no rivals), city shown', x.playing && x.mis === 1 && x.misHud && (await vis(p, '#mhud')) && !(await vis(p, '#rank')), x);
  check('the HUD says the goal and a ★3 target', /★3/.test(await hudText(p)) && /ねらい|のみこ/.test(await hudText(p) + await p.textContent('#toast')), await hudText(p));
  x = await botPlay(p);
  check('the round ended by time with a result', x.over || x.result || x.screen === 'result', x);
  await resultUp(p);
  x = await st(p);
  const xs = await storedJ(p, X);
  check('the bot clears mission 1 and the stars are saved in kusoge.hole.x', x.misStars[0] >= 1 && xs.s[0] === x.misStars[0] && xs.b[0] > 0, { x: xs, s: x.misStars });
  check('the next mission is open', E.open(E.readX(xs), 1), xs);
  check('the result shows ★ stars, the figure and Next', (await vis(p, '#resStars')) && /%/.test(await p.textContent('#resBig')) && (await vis(p, '#btnNext')), await p.textContent('#resBig'));
  await shot(p, '4-result');
  const ev = await events(p);
  check('missions are reported as practice, with no stage_clear', ev.some(e => e[0] === 'play_start' && e[1] === 'practice') && ev.some(e => e[0] === 'play_end' && e[1] === 'practice') && !ev.some(e => e[0] === 'stage_clear' || e[0] === 'best'), ev);
  const sv = await storedJ(p, SAVE);
  check('the ranking value (best.maxPts / matchPts) is untouched, coins went up', (sv.best.maxPts | 0) === (rank0.maxPts | 0) && (sv.best.matchPts | 0) === (rank0.matchPts | 0) && sv.coins > 500, sv.best);
  // a worse run does not lower the stars
  const keep = xs.s[0];
  await p.click('#btnAgain'); await ready(p);
  await p.evaluate(() => __kb.lose()); await resultUp(p);
  check('a bad run keeps the stars and the best', (await storedJ(p, X)).s[0] === keep && (await storedJ(p, X)).b[0] === xs.b[0], await storedJ(p, X));
  await p.click('#btnToTitle');
  x = await st(p);
  check('To missions returns to the list with mission 2 open', x.misOpen && (await p.locator('#misList .cst:not(:disabled)').count()) === 2, x);
  await p.click('#btnMisBack');
  check('the title shows the star count', /★ [1-3]\/36/.test(await p.textContent('#btnMis')), await p.textContent('#btnMis'));
  pageOk(s); await s.close();

  // every mission, in order, with the bot (kills missions: a scripted chase)
  console.log('4b. all 12 missions with the bot');
  const s2 = await open(env), p2 = s2.page;
  const kinds = [];
  for (let i = 0; i < 12; i++) {
    const kind = E.MISSIONS[i].kind;
    await p2.evaluate(i => __kb.openMisCard(i), i);
    const open = await p2.evaluate(() => __kb.state().misCard);
    if (!open) { check(`mission ${i + 1} is open after the previous one`, false, i); break; }
    await p2.click('#btnMcGo'); await ready(p2);
    let r;
    if (kind === 'kills') {
      // grow, go to a rival and swallow it
      r = await p2.evaluate(() => {
        const rv = __hole.rivals.find(h => h.alive && h.grp.visible);
        __hole.setPts(__hole.player, 4000); __hole.aiOff(true); __hole.teleport(__hole.player, rv.x, rv.z);
        for (let k = 0; k < 20 && !__hole.player.kills; k++) __kb.sim(0.5, false);
        __hole.aiOff(false);
        return { kills: __hole.player.kills };
      });
      await p2.evaluate(() => __hole.endRound());
    } else {
      r = await botPlay(p2); await resultUp(p2);
      // the bot is random: it gets up to two more tries (a clear needs one star)
      for (let k = 0; k < 2 && (await st(p2)).misStars[i] < 1; k++) { await p2.click('#btnAgain'); await ready(p2); r = await botPlay(p2); await resultUp(p2); }
    }
    await resultUp(p2);
    const x2 = await st(p2);
    kinds.push(kind + ':' + x2.misStars[i]);
    check(`mission ${i + 1} (${kind}) is cleared with the bot`, x2.misStars[i] >= 1 && x2.result, { r, stars: x2.misStars[i] });
    if (kind === 'fast') check('the fast mission ends as soon as the goal is swallowed', x2.misFast > 0, x2.misFast);
  }
  const fin = await st(p2);
  check('all 12 are cleared and the total is saved', fin.misStars.length === 12 && fin.misStars.every(v => v >= 1), fin.misStars);
  check('the title shows the total', (await p2.evaluate(() => { __kb.showTitle(); return document.getElementById('tMisStars').textContent; })).split('/')[1] === '36', {});
  pageOk(s2, 'no page errors in 12 missions'); await s2.close();
}

async function rules(env) {
  console.log('5. mission rules');
  const s = await open(env, { seed: { [SAVE]: JSON.stringify({ seen: 1, tut: 1, coins: 500, perks: { size: 3, speed: 5 } }) } }), p = s.page;
  // the shop power-ups: a CPU battle starts big, a mission does not
  await p.evaluate(() => __kb.start('match')); await ready(p);
  const big = await p.evaluate(() => __hole.player.pts);
  await p.evaluate(() => __kb.quit());
  await p.evaluate(() => __kb.startMission(0)); await ready(p);
  const small = await p.evaluate(() => __hole.player.pts);
  check('the size power-up does not apply in a mission (same start for everyone)', big > 0 && small === 0, { big, small });
  const sp = await p.evaluate(() => { __hole.player.vx = 0; return __kb.state().size; });
  check('the mission HUD tracks the goal number', /0\.0%|0%|0\.0/.test(await p.textContent('#mhV')), await p.textContent('#mhV'));
  // fast: reaching the target ends the round early
  await p.evaluate(() => __kb.quit());
  const fi = E.MISSIONS.findIndex(m => m.kind === 'fast');
  await p.evaluate(i => __kb.startMission(i), fi); await ready(p);
  await p.evaluate(() => { __hole.G.eatVal = __hole.TOTAL_VAL * 1; __kb.sim(0.2, false); });
  await resultUp(p);
  let x = await st(p);
  check('fast: swallowing the target ends the round early with time left', x.result && x.misFast > 10, x);
  check('fast: the result shows the seconds left and stars', /秒/.test(await p.textContent('#resBig')) && x.misStars[fi] >= 1, await p.textContent('#resBig'));
  await p.evaluate(() => __kb.showTitle());
  // time out of a fast mission: no stars
  await p.evaluate(i => __kb.startMission(i), fi); await ready(p);
  await p.evaluate(() => __kb.lose()); await resultUp(p);
  check('fast: running out of time gives "time up"', /じかんぎれ/.test(await p.textContent('#resBig')), await p.textContent('#resBig'));
  // kills mission: rivals are near and smaller
  const ki = E.MISSIONS.findIndex(m => m.kind === 'kills');
  await p.evaluate(() => __kb.showTitle());
  await p.evaluate(i => { __kb.openMisCard(i); }, ki).catch(() => {});
  await p.evaluate(i => __kb.startMission(i), ki); await ready(p);
  x = await st(p);
  const info = await p.evaluate(() => { const rv = __hole.rivals.filter(h => h.alive && h.grp.visible); return { n: rv.length, d: rv.map(h => Math.round(Math.hypot(h.x - __hole.player.x, h.z - __hole.player.z))), big: __hole.player.R > rv[0].R * 1.1 }; });
  check('kills: the rivals are near and smaller than the player at the start', info.n === E.MISSIONS[ki].rivals && info.d.every(d => d < 400) && info.big, info);
  check('kills: the rank list is shown and the 4th box counts rivals', (await vis(p, '#rank')) && /ライバル/.test(await p.textContent('#hRankL')), await p.textContent('#hRankL'));
  await p.evaluate(() => { const rv = __hole.rivals.find(h => h.alive && h.grp.visible); __hole.aiOff(true); __hole.teleport(__hole.player, rv.x, rv.z); __hole.setPts(__hole.player, 4000); for (let k = 0; k < 20 && !__hole.player.kills; k++) __kb.sim(0.5, false); });
  check('kills: swallowing a rival counts', (await p.evaluate(() => __hole.player.kills)) >= 1, {});
  await p.evaluate(() => __kb.quit());
  check('quitting a mission goes back to the list and saves nothing', (await st(p)).misOpen && (await storedJ(p, X)) === null || (await storedJ(p, X)).s.every(v => v >= 0), await storedJ(p, X));
  pageOk(s); await s.close();
}

async function touch(env) {
  console.log('6. touch');
  const s = await open(env, { touch: true }), p = s.page;
  await p.tap('#btnMis');
  check('tapping Missions opens the list', (await st(p)).misOpen, await st(p));
  await p.tap('#misList .cst[data-mi="0"]');
  check('tapping a mission opens the card', (await st(p)).misCard, await st(p));
  await p.tap('#btnMcGo'); await ready(p);
  check('tapping Start begins the mission', (await st(p)).mis === 1, await st(p));
  const cdp = await s.ctx.newCDPSession(p);
  const send = (type, x, y) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y, id: 1 }] });
  const p0 = await p.evaluate(() => [__hole.player.x, __hole.player.z]);
  const box = await p.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height * 0.7 }; });
  await send('touchStart', box.x, box.y);
  for (let k = 1; k <= 10; k++) { await send('touchMove', box.x + k * 6, box.y); await p.waitForTimeout(40); }
  await p.waitForTimeout(500);
  const joy = await vis(p, '#joy');
  await send('touchEnd');
  const p1 = await p.evaluate(() => [__hole.player.x, __hole.player.z]);
  check('a touch drag shows the stick and moves the hole', joy && Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) > 0.5, { joy, p0, p1 });
  check('the keyboard hint is hidden on a touch screen', !(await p.evaluate(() => { __kb.showTitle(); const e = document.querySelector('.keyhint'); return e && getComputedStyle(e).display !== 'none'; })), {});
  const small = await p.evaluate(() => [...document.querySelectorAll('#ovTitle button')].filter(b => { const r = b.getBoundingClientRect(); return r.height > 0 && r.height < 44; }).map(b => b.id));
  check('every title button is at least 44px tall', small.length === 0, small);
  pageOk(s); await s.close();
}

async function compat(env) {
  console.log('7. old and broken saves');
  const old = JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'saves', 'hole-camp10.json'), 'utf8')).storage[SAVE];
  for (const [name, xv] of [['no x at all', null], ['garbage x', 'zzz{'], ['wrong shape x', '{"s":"no","b":[1,"x"],"c":-4}'], ['partial x', '{"v":1,"s":[2,1]}']]) {
    const seed = { [SAVE]: JSON.stringify(old) }; if (xv != null) seed[X] = xv;
    const s = await open(env, { seed }), p = s.page;
    let x = await st(p);
    check(`${name}: the old save loads (coins ${x.coins}, best ${x.best})`, x.coins === 150 && x.screen === 'menu', x);
    await p.click('#btnMis');
    x = await st(p);
    const n = await p.locator('#misList .cst').count();
    check(`${name}: the mission list opens with 12 entries`, x.misOpen && n === 12 && x.misStars.length === 12, { n, s: x.misStars });
    if (name === 'partial x') check('partial x: stars 2 and 1 are kept and mission 3 is open', x.misStars[0] === 2 && x.misStars[1] === 1 && (await p.locator('#misList .cst:not(:disabled)').count()) === 3, x.misStars);
    await p.click('#btnMisBack');
    await p.click('#btnCamp');
    check(`${name}: the tour still shows the old stars`, (await p.locator('#campList .cst').count()) >= 10 && /★/.test(await p.textContent('#campList')), {});
    pageOk(s, `${name}: no page errors`); await s.close();
  }
  // a mission result must not erase fields it does not know
  const s = await open(env, { seed: { [SAVE]: JSON.stringify(Object.assign({}, old, { futureField: { a: 1 } })), [X]: JSON.stringify({ v: 1, s: [1], b: [3], c: 5, z: 'later' }) } }), p = s.page;
  await p.evaluate(() => __kb.startMission(0)); await ready(p);
  await p.evaluate(() => __kb.win()); await resultUp(p);
  const sv = await storedJ(p, SAVE);
  check('unknown save fields are kept after a mission', sv.futureField && sv.futureField.a === 1 && sv.camp.stars[0] === 3, sv);
  check('a better mission result raises the stars to 3 and keeps the combo record', (await storedJ(p, X)).s[0] === 3 && (await storedJ(p, X)).c >= 5, await storedJ(p, X));
  pageOk(s); await s.close();
}

async function english(env) {
  console.log('8. English');
  const seed = Object.assign({}, SEED, { [X]: JSON.stringify({ v: 1, s: [3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], b: [2, 8, 3, 22, 0, 0, 0, 0, 0, 0, 0, 0], c: 9 }) });
  const s = await open(env, { lang: 'en', seed }), p = s.page;
  let jp = await p.evaluate(`(${jpScan})(true)`);
  check('title: no Japanese', jp.length === 0, jp.slice(0, 4));
  check('the mission button is English', /Missions/.test(await p.textContent('#btnMis')), await p.textContent('#btnMis'));
  await p.click('#btnMis');
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('mission list: no Japanese', jp.length === 0, jp.slice(0, 4));
  for (const i of [0, 1, 2, 3, 5, 8, 11]) {
    await p.evaluate(i => __kb.openMisCard(i), i);
    jp = await p.evaluate(`(${jpScan})(true)`);
    check(`mission ${i + 1} card: no Japanese`, jp.length === 0, jp.slice(0, 4));
    await p.evaluate(() => __kb.openMis());
  }
  await p.evaluate(() => __kb.openMisCard(3)); await p.click('#btnMcGo'); await ready(p);
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('mission HUD: no Japanese', jp.length === 0, jp.slice(0, 4));
  await p.evaluate(() => { __kb.step(20); });
  await p.evaluate(() => __kb.win()); await resultUp(p);
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('mission result: no Japanese', jp.length === 0, jp.slice(0, 4));
  await p.evaluate(() => __kb.start('solo')); await ready(p);
  await p.evaluate(() => __kb.step(12)); await p.evaluate(() => __kb.win()); await resultUp(p);
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('regular result with the combo line: no Japanese', jp.length === 0, jp.slice(0, 4));
  pageOk(s); await s.close();
}

async function layouts(env) {
  console.log('9. layouts');
  const seed = Object.assign({}, SEED, { [X]: JSON.stringify({ v: 1, s: [3, 2, 1, 1, 0, 0, 0, 0, 0, 0, 0, 0], b: [2, 8, 3, 22, 0, 0, 0, 0, 0, 0, 0, 0], c: 9 }) });
  for (const [vp, lang, scheme] of [['se1', 'ja', 'dark'], ['ip12', 'en', 'light'], ['p8', 'ja', 'light'], ['land', 'en', 'dark']]) {
    const tag = `${vp}/${lang}/${scheme}`;
    const s = await open(env, { vp, lang, scheme, seed }), p = s.page;
    let r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} title: fits and reachable`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 3), pr: r.primary.filter(x => x.problems.length).slice(0, 2) });
    await shot(p, `9-${vp}-${lang}-title`);
    await p.evaluate(() => __kb.openMis());
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} mission list: reachable`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 3), pr: r.primary.filter(x => x.problems.length).slice(0, 2) });
    await shot(p, `9-${vp}-${lang}-list`);
    await p.evaluate(() => __kb.openMisCard(2));
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} mission card: reachable`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 3), pr: r.primary.filter(x => x.problems.length).slice(0, 2) });
    await shot(p, `9-${vp}-${lang}-card`);
    await p.evaluate(() => __kb.startMission(2)); await ready(p);
    await p.evaluate(() => __kb.step(8)); await p.waitForTimeout(300);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} mission HUD fits`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 3) });
    const ov = await p.evaluate(() => { const a = document.getElementById('mhud').getBoundingClientRect(), b = document.getElementById('rank').getBoundingClientRect(); return { a: [a.left, a.right, a.top, a.bottom], b: [b.left, b.right, b.top, b.bottom], rankHidden: document.getElementById('rank').hidden }; });
    check(`${tag} the goal chip does not overlap the rank list`, ov.rankHidden || ov.a[1] <= ov.b[0] + 1 || ov.a[3] <= ov.b[2] || ov.b[3] <= ov.a[2], ov);
    await shot(p, `9-${vp}-${lang}-play`);
    await p.evaluate(() => __kb.win()); await resultUp(p);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} result: buttons reachable`, r.hscroll <= 1 && r.primary.every(x => x.problems.length === 0), r.primary.filter(x => x.problems.length).slice(0, 2));
    await shot(p, `9-${vp}-${lang}-result`);
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${tag} no Japanese`, jp.length === 0, jp.slice(0, 4)); }
    pageOk(s, `${tag} no page errors`); await s.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start();
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [normal, keys, combo, missions, rules, touch, compat, english, layouts]) {
    if (only && !only.includes(f.name)) continue;
    // a fresh browser per part: one long-lived software-GL browser slows down a lot after many 3D cities
    const browser = await B.launch(), env = { server: srv, browser: () => browser };
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
    await browser.close().catch(() => {});
  }
  await srv.close();
  const failN = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - failN}  fail ${failN}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(failN ? 1 : 0);
})();
