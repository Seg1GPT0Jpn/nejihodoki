#!/usr/bin/env node
// ゲートランナーの通しプレイ（Playwright、?debug の window.__gates / __kb。3D の道は swiftshader で描く）
//   node tools/tests/gates-play.js [normal,keyboard,missions,fail,touch,compat,english,layouts]   … 全部で約2〜3分
// 1. ふつうの出撃：ステージを始めて勝てる・最大コンボ・ランキング（best）と保存の形
// 2. キーボード：タイトル（Enter・M・B・H）・ステージ選び（← →・Enter・Esc）・ミッション（矢印・Enter・Esc）
// 3. ミッション：一覧と鍵・決まった部隊で出撃・ボットで全12ミッションをクリア・★の保存（kusoge.gates.x）・practice として報告・ふつうの保存（best）は変わらない
// 4. 失敗：全滅・もう一度・一時停止からミッション一覧に戻る
// 5. タッチ：本物のタップでミッション一覧・選ぶ・出撃
// 6. 古い保存：こわれた kusoge.gates.x・古い2D版の保存・v2 の保存が読める
// 7. 英語：日本語が残らない
// 8. 全画面サイズ × ja/en × 明るい/暗い：横スクロールなし・ボタンが画面内
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'gates-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.gates.save', X = 'kusoge.gates.x';
const mkSave = o => JSON.stringify(Object.assign({ v: 2, best: 4, stage: 5, coins: 300, mat: 10, exp: 20, bld: { hq: 3, bar: 2, lab: 2, arm: 2, truck: 2 }, heroes: {}, sel: ['ren', 'mina', 'bulk'], runs: 3, tut: 1, seen: 1 }, o || {}));
const SEED = { [SAVE]: mkSave() };
const E = require('../../gates/engine.js');

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || SEED, isMobile: !!o.touch, hasTouch: !!o.touch });
  if (o.scheme) await s.page.emulateMedia({ colorScheme: o.scheme });
  await s.goto('/gates/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready(), null, { timeout: 30000 });
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const vis = (p, sel) => p.isVisible(sel);
const pageOk = (s, name) => check(name || 'no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
const runOut = p => p.evaluate(() => { for (let k = 0; k < 400 && (__kb.state().screen === 'run'); k++) __kb.step(1); for (let k = 0; k < 4 && __kb.state().screen === 'run'; k++) __kb.step(1); return __kb.state(); });
const hook = p => p.evaluate(() => { window.__evlog = []; if (window.KoboGame) { const e = KoboGame.emit; KoboGame.emit = function (n, d) { window.__evlog.push([n, d && d.mode, d && d.reason]); return e.apply(this, arguments); }; } });
const events = p => p.evaluate(() => window.__evlog || []);

async function normal(env) {
  console.log('1. normal stage still plays');
  const s = await open(env), p = s.page;
  await hook(p);
  let x = await st(p);
  check('opens on the title with the best from the save', x.screen === 'title' && x.best === 4, x);
  check('the title has a Missions button', await vis(p, '#btnMis'), {});
  await p.evaluate(() => __kb.start(3));
  x = await st(p);
  check('a normal run starts (mode normal, no mission, truck bar shown)', x.screen === 'run' && x.mode === 'normal' && x.mission === null && (await vis(p, '#truck')) && !(await vis(p, '#mgoal')), x);
  await p.evaluate(() => __kb.step(8));
  check('the kill combo counts up and shows', (await p.evaluate(() => __gates.R.maxCombo)) >= 1, await st(p));
  await p.evaluate(() => { __gates.R.combo = 12; __gates.R.comboT = 5; __gates.R.maxCombo = 12; __kb.step(0.2); });
  await p.waitForTimeout(400);
  check('the combo chip shows from 5 kills', await vis(p, '#combo') && /12/.test(await p.textContent('#combo')), await p.textContent('#combo'));
  await p.evaluate(() => __gates.setN(60)); await p.evaluate(() => __kb.step(0.1));
  check('crossing 50 soldiers is a milestone (passed without errors)', (await p.evaluate(() => __gates.R.mile)) >= 1, {});
  await p.evaluate(() => __kb.win());
  await p.waitForFunction(() => __kb.state().screen === 'clear', null, { timeout: 8000 }).catch(() => {});
  await p.evaluate(() => __kb.step(3));
  x = await st(p);
  const sv = await stored(p, SAVE);
  check('winning stage 3 gives the normal clear card and keeps best 4', x.screen === 'clear' && sv.best === 4 && sv.v === 2, { x, sv: sv && sv.best });
  const ev = await events(p);
  check('reported as normal play', ev.filter(e => e[0] === 'play_start').every(e => e[1] === 'normal'), ev);
  check('no kusoge.gates.x is created by a normal run', (await stored(p, X)) === null, {});
  pageOk(s); await s.close();
}

async function keyboard(env) {
  console.log('2. keyboard in the menus');
  const s = await open(env), p = s.page;
  await p.keyboard.press('KeyM');
  check('M opens the mission list', (await st(p)).screen === 'mis', await st(p));
  await p.keyboard.press('ArrowRight');
  check('arrows move the selection', (await p.evaluate(() => __gates.xs && document.querySelector('.mc.sel').dataset.i)) === '1', {});
  await p.keyboard.press('ArrowDown');
  check('down moves a row (5th)', (await p.evaluate(() => document.querySelector('.mc.sel').dataset.i)) === '5', {});
  check('a locked mission cannot be started', await p.evaluate(() => document.getElementById('btnMisGo').disabled), {});
  await p.keyboard.press('Enter');
  check('Enter on a locked one does nothing', (await st(p)).screen === 'mis', await st(p));
  await p.keyboard.press('Escape');
  check('Esc goes back to the title', (await st(p)).screen === 'title', await st(p));
  await p.keyboard.press('Enter');
  check('Enter on the title opens stage select', (await st(p)).screen === 'select', await st(p));
  const before = await p.textContent('#stNum');
  await p.keyboard.press('ArrowLeft');
  check('left arrow picks the previous stage', (await p.textContent('#stNum')) !== before, before);
  await p.keyboard.press('Enter');
  check('Enter starts the stage', (await st(p)).screen === 'run', await st(p));
  await p.keyboard.press('Escape');
  check('Esc pauses', (await st(p)).paused, await st(p));
  await p.evaluate(() => { const b = document.querySelector('.kb-layer:not([hidden]) .kb-btn--primary'); if (b) b.click(); });
  check('the pause menu closes and play resumes', !(await st(p)).paused, await st(p));
  await p.evaluate(() => __kb.lose());
  await p.waitForFunction(() => __kb.state().screen === 'fail', null, { timeout: 8000 }).catch(async () => { await p.evaluate(() => __kb.step(3)); });
  check('on the fail screen R retries', await (async () => { await p.keyboard.press('KeyR'); return (await st(p)).screen === 'run'; })(), await st(p));
  pageOk(s); await s.close();
}

async function missions(env) {
  console.log('3. missions: fixed squads, bot clears all 12, stars saved, reported as practice');
  const s = await open(env, { seed: { [SAVE]: mkSave(), [X]: JSON.stringify({ v: 1, s: [0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], t: [] }) } }), p = s.page;
  await hook(p);
  const best0 = (await stored(p, SAVE)).best, coins0 = (await stored(p, SAVE)).coins;
  await p.click('#btnMis');
  const items = await p.evaluate(() => [...document.querySelectorAll('.mc')].map(b => b.style.opacity === '0.45'));
  check('12 missions; only the first is open', items.length === 12 && !items[0] && items.slice(1).every(Boolean), items);
  await shot(p, '3-list');
  await p.click('#btnMisGo');
  let x = await st(p);
  check('mission 1 starts as practice with its own HUD', x.screen === 'run' && x.mode === 'practice' && x.mission === 'm1' && await vis(p, '#mgoal') && !(await vis(p, '#truck')) && /MISSION 1/.test(await p.textContent('#hudStage')), x);
  const sq = await p.evaluate(() => ({ n: __gates.R.n, tier: __gates.R.tier, heroes: __gates.R.heroes.map(h => h.id), stage: __gates.R.stage }));
  check('the squad is the mission\'s fixed one, not the save\'s', sq.n === E.MISSIONS[0].n && sq.tier === E.MISSIONS[0].tier && sq.heroes.join() === E.MISSIONS[0].team.join() && sq.stage === 1, sq);
  const c1 = await p.evaluate(() => __gates.course());
  await p.evaluate(() => __kb.startMission(0));
  check('the course is the same every time', (await p.evaluate(() => __gates.course())) === c1, {});
  await shot(p, '3-hud');
  await p.evaluate(() => __kb.startMission(11));
  const m12 = await p.evaluate(() => ({ L: __gates.R.L, bh: __gates.R.bh }));
  check('mods apply (boss HP ×1.4 in mission 12)', m12.bh === 1.4, m12);
  await p.evaluate(() => __kb.startMission(4));
  const m5 = await p.evaluate(() => ({ L: __gates.R.L, lm: __gates.R.lm }));
  check('the short course is shorter (mission 5)', m5.lm === 0.55 && m5.L < 560 + 18 * 5, m5);
  let wins = 0, info = [];
  for (let i = 0; i < 12; i++) {
    await p.evaluate(i => __kb.startMission(i), i);
    x = await runOut(p);
    const L = await p.evaluate(() => __gates.lastMis && { stars: __gates.lastMis.stars, won: __gates.lastMis.r.won });
    if (L && L.won) wins++; info.push(i + 1 + ':' + (L ? L.stars : '?'));
  }
  check('the steering bot clears every mission (' + info.join(' ') + ')', wins === 12, info);
  const xs = await stored(p, X), sv = await stored(p, SAVE);
  check('kusoge.gates.x holds the stars for all 12 and unlocks them', xs && xs.v === 1 && xs.s.length === 12 && xs.s.every(v => v >= 1 && v <= 3) && xs.t.every(v => v > 0), xs);
  check('the normal save: best and stage unchanged, coins grew from the new stars', sv.best === best0 && sv.v === 2 && sv.coins > coins0 && sv.runs === 3, { best: sv.best, coins: sv.coins });
  const ev = await events(p);
  check('only practice was reported (no normal start/clear, no best)', ev.filter(e => e[0] === 'play_start' || e[0] === 'play_end').every(e => e[1] === 'practice') && !ev.some(e => e[0] === 'best' || e[0] === 'stage_clear'), ev.slice(0, 6));
  // a worse run never lowers the stars
  await p.evaluate(() => __kb.startMission(0)); await p.evaluate(() => { __gates.R.god = false; __kb.lose(); __kb.step(3); });
  check('a failed attempt does not lower the stars', (await stored(p, X)).s[0] === xs.s[0], await stored(p, X));
  // result screen
  await p.evaluate(() => __kb.startMission(2)); await runOut(p);
  check('the result screen lists the goals', await vis(p, '#mrList') && (await p.textContent('#mrList')).includes('★2'), await p.textContent('#mrList'));
  await shot(p, '3-result');
  pageOk(s); await s.close();
}

async function fail(env) {
  console.log('4. failing, retrying, leaving from the pause menu');
  const s = await open(env), p = s.page;
  await p.evaluate(() => __kb.startMission(0));
  await p.evaluate(() => { __kb.lose(); __kb.step(4); });
  let x = await st(p);
  check('wiped out: result with 0 stars, Retry is the main button, Next hidden', x.screen === 'mres' && !x.won && !(await vis(p, '#mrNext')) && /全滅/.test(await p.textContent('#mrTitle')), x);
  check('no stars saved after a loss', ((await stored(p, X)) || { s: [0] }).s[0] === 0, await stored(p, X));
  await p.click('#mrRetry');
  check('Retry starts the same mission', (await st(p)).mission === 'm1' && (await st(p)).screen === 'run', await st(p));
  await p.evaluate(() => __kb.pause());
  check('paused', (await st(p)).paused, {});
  await p.evaluate(() => { const b = [...document.querySelectorAll('.kb-layer .kb-btn')].find(b => /ミッション一覧/.test(b.textContent)); b && b.click(); });
  x = await st(p);
  check('the pause menu leads back to the mission list (no coins taken)', x.screen === 'mis' && x.coins === 300, x);
  pageOk(s); await s.close();
}

async function touch(env) {
  console.log('5. touch');
  const s = await open(env, { touch: true }), p = s.page;
  await p.tap('#btnMis');
  check('tapping Missions opens the list', (await st(p)).screen === 'mis', await st(p));
  await p.tap('.mc[data-i="0"]'); await p.tap('#btnMisGo');
  check('tapping start runs mission 1', (await st(p)).mission === 'm1', await st(p));
  const px = await p.evaluate(() => __gates.R.tpx);
  const box = await p.locator('#stage').boundingBox();
  const cdp = await p.context().newCDPSession(p);
  const mk = (type, x) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: type === 'touchEnd' ? [] : [{ x, y: box.y + box.height * 0.7, id: 1 }] });
  await mk('touchStart', box.x + box.width * 0.5); await mk('touchMove', box.x + box.width * 0.2); await mk('touchEnd');
  check('dragging steers the squad', (await p.evaluate(() => __gates.R.tpx)) < px - 0.5, { px, now: await p.evaluate(() => __gates.R.tpx) });
  pageOk(s); await s.close();
}

async function compat(env) {
  console.log('6. old / broken saves');
  let s = await open(env, { seed: { [SAVE]: JSON.stringify({ stage: 6, coins: 90, best: 6, up: { men: 3 } }), [X]: '{broken' } }), p = s.page;
  check('the old 2D save and a broken x both load; the missions open empty', (await st(p)).best === 5 && (await p.evaluate(() => { __gates.toMis(); return document.querySelectorAll('.mc').length; })) === 12, await st(p));
  check('and the title still works', await p.evaluate(() => { document.getElementById('btnMisBack').click(); return __kb.state().screen; }) === 'title', {});
  pageOk(s); await s.close();
  s = await open(env, { seed: { [SAVE]: mkSave({ best: 20, stage: 9 }), [X]: JSON.stringify({ v: 1, s: [3, 3, 'x', 9, -1], t: [12], c: 'nope' }) } }); p = s.page;
  await p.evaluate(() => __gates.toMis());
  const o = await p.evaluate(() => ({ stars: document.getElementById('misTotal').textContent, sel: document.querySelector('.mc.sel').dataset.i }));
  check('a damaged x keeps the good part (6 stars), selects the first unfinished', o.stars === '6/36' && o.sel === '2', o);
  check('the ranking value is the same as before', (await p.evaluate(() => __gates.save.best)) === 20, {});
  pageOk(s); await s.close();
}

async function english(env) {
  console.log('7. english');
  const s = await open(env, { lang: 'en' }), p = s.page;
  const scan = async name => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${name}: no Japanese`, jp.length === 0, jp.slice(0, 4)); };
  await scan('title');
  await p.evaluate(() => __gates.toMis()); await scan('mission list');
  for (const i of [0, 4, 5, 11]) { await p.evaluate(i => { __gates.misMove(i - Number(document.querySelector('.mc.sel').dataset.i)); }, i); }
  await p.evaluate(() => __kb.startMission(6)); await p.evaluate(() => __kb.step(10));
  check('HUD goal in English', /Best combo/.test(await p.textContent('#mgoal')), await p.textContent('#mgoal'));
  await scan('mission HUD');
  await runOut(p); await scan('mission result');
  pageOk(s); await s.close();
}

async function layouts(env) {
  console.log('8. layouts');
  const seed = { [SAVE]: mkSave(), [X]: JSON.stringify({ v: 1, s: [3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], t: [] }) };
  for (const [vp, lang, scheme] of [['se1', 'ja', 'dark'], ['ip12', 'en', 'light'], ['p8', 'ja', 'light']]) {
    const tag = `${vp}/${lang}/${scheme}`;
    const s = await open(env, { vp, lang, scheme, seed }), p = s.page;
    let r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} title (3 buttons in a row) fits`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 3), h: r.hscroll });
    await p.evaluate(() => __gates.toMis());
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} mission list: reachable`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 3), pr: r.primary.filter(x => x.problems.length).slice(0, 2) });
    await shot(p, `8-${vp}-${lang}-list`);
    await p.evaluate(() => __kb.startMission(1)); await p.evaluate(() => { __kb.step(6); __gates.R.combo = 30; __gates.R.comboT = 4; __kb.step(0.3); });
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} mission HUD fits`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 3) });
    await shot(p, `8-${vp}-${lang}-hud`);
    await runOut(p);
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} result: buttons reachable`, r.hscroll <= 1 && r.primary.every(x => x.problems.length === 0), r.primary.filter(x => x.problems.length).slice(0, 2));
    await shot(p, `8-${vp}-${lang}-result`);
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
  for (const f of [normal, keyboard, missions, fail, touch, compat, english, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const failN = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - failN}  fail ${failN}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(failN ? 1 : 0);
})();
