#!/usr/bin/env node
// ほしぞら守備隊の通しプレイ（Playwright。キーボード・ドラッグ・ボタン・ゲームパッドは本物の入力。?debug の window.__invade / __kb は状態を読む・ウェーブを飛ばす・やられるためだけ）
//   node tools/tests/invade-play.js [first,keys,touch,pad,modes,campaign,pause,settings,layouts,orient,english,perf]
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const ROOT = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out', 'shots', 'invade-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 500)}`); };
const SAVE = 'kusoge.invade.save', HOWTO = 'kusoge.invade.howto';

async function open(env, o = {}) {
  const touch = !!o.touch;
  const s = await B.newSession(env, { vp: V.pick(o.vp || 'se2')[0], lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: touch, hasTouch: touch, initScripts: o.initScripts });
  await s.goto('/invade/?debug' + (o.query || ''));
  if (!o.shell) await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__invade);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 8000 });
const start = (p, o) => p.evaluate(o => __invade.start(o), o);
const act = (p, a) => p.click(`[data-act="${a}"]`);
const intoPlay = async (p, o) => { await start(p, o); await wait(p, () => __kb.state().phase === 'play', null, 6000); };

async function first(env) {
  console.log('1. first visit: the rules, then the title with every mode');
  const s = await open(env, { seed: {}, vp: 'se1' }); const p = s.page;
  let a = await st(p); check('the rules show on the first visit', a.screen === 'howto' && a.ov, a);
  const t = await p.textContent('.howto'); check('rules explain controls, the crew, the Moon Bus and the power-ups', t.length > 600 && /Space/.test(t) && /ぷるん/.test(t) && /おつきバス/.test(t) && /スプレッド/.test(t));
  check('rule icons are drawn on canvases', (await p.$$('.howto canvas[data-ic]')).length >= 15);
  await act(p, 'howtoGo'); a = await st(p); check('the title follows', a.screen === 'title', a);
  const acts = await p.$$eval('[data-act]', b => b.map(x => x.dataset.act)); check('title offers campaign, classic, survival, endless, daily, records', ['camp', 'setup:classic', 'setup:survival', 'setup:endless', 'setup:daily', 'records'].every(x => acts.includes(x)), acts);
  check('an attract demo plays behind the title', await p.evaluate(() => __invade.S && __invade.S.frame > 0 && !__invade.run));
  check('no BGM exists', await p.evaluate(() => !KoboAudio.bgm.available));
  await shot(p, '01-title'); check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function keysTest(env) {
  console.log('2. keyboard: move, shoot, bomb, pause');
  const s = await open(env); const p = s.page;
  await act(p, 'setup:classic'); await act(p, 'go:classic'); await wait(p, () => __kb.state().phase === 'play', null, 6000);
  const x0 = (await st(p)).px; await p.keyboard.down('ArrowRight'); await p.waitForTimeout(400); await p.keyboard.up('ArrowRight');
  const x1 = (await st(p)).px; check('the right arrow moves the cannon right', x1 > x0 + 15, { x0, x1 });
  await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(300); await p.keyboard.up('ArrowLeft'); check('the left arrow moves it back', (await st(p)).px < x1 - 10);
  const sh0 = (await st(p)).shots; await p.keyboard.down('Space'); await p.waitForTimeout(700); await p.keyboard.up('Space'); check('Space fires', (await st(p)).shots > sh0 + 1, await st(p));
  await p.evaluate(() => __invade.giveCap(5)); const b0 = (await st(p)).bb; await p.keyboard.press('KeyX'); await p.waitForTimeout(100); check('X fires a bomb', (await st(p)).bb === b0 - 1, await st(p));
  // play for real: hold fire and sweep until something dies
  await p.keyboard.down('Space'); let k = 0; for (let i = 0; i < 40 && k === 0; i++) { await p.keyboard.down(i % 2 ? 'ArrowLeft' : 'ArrowRight'); await p.waitForTimeout(250); await p.keyboard.up(i % 2 ? 'ArrowLeft' : 'ArrowRight'); k = (await st(p)).kills; } await p.keyboard.up('Space');
  check('real shooting kills aliens and scores', k > 0 && (await st(p)).score > 0, await st(p));
  await shot(p, '02-play');
  await p.keyboard.press('Escape'); await wait(p, () => !!document.querySelector('.kb-pause')); a(await st(p), 'pause');
  async function a(x, n) { check('Escape pauses the game (' + n + ')', x.paused, x); }
  const f0 = (await st(p)).frame; await p.waitForTimeout(400); check('the game is frozen while paused', (await st(p)).frame === f0);
  await p.click('.kb-layer .kb-btn--primary'); await p.waitForTimeout(300); check('Resume continues', (await st(p)).frame > f0 && (await st(p)).playing);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function touchTest(env) {
  console.log('3. touch: drag anywhere, auto-fire, buttons, tap-to-fire');
  const s = await open(env, { touch: true, vp: 'ip12' }); const p = s.page;
  await act(p, 'setup:classic'); await act(p, 'go:classic'); await wait(p, () => __kb.state().phase === 'play', null, 6000);
  let a = await st(p); check('touch layout shows the buttons and auto-fire is on', await p.evaluate(() => document.body.classList.contains('touch')) && a.auto, a);
  const r = await p.evaluate(() => { const c = document.getElementById('cv').getBoundingClientRect(); return { x: c.left, y: c.top, w: c.width, h: c.height }; });
  const y = r.y + r.h * 0.7, x0 = r.x + r.w * 0.5; const px0 = (await st(p)).px;
  await p.mouse.move(x0, y); await p.mouse.down(); await p.mouse.move(x0 + 70, y, { steps: 8 }); await p.waitForTimeout(250);
  const px1 = (await st(p)).px; check('dragging right moves the cannon right', px1 > px0 + 30, { px0, px1 });
  await p.waitForTimeout(500); check('auto-fire shoots while touching', (await st(p)).shots > 0, await st(p)); await p.mouse.up();
  const b = id => p.evaluate(id => { const e = document.getElementById(id).getBoundingClientRect(); return { x: e.left + e.width / 2, y: e.top + e.height / 2, w: e.width }; }, id);
  const L = await b('bL'); const px2 = (await st(p)).px; await p.mouse.move(L.x, L.y); await p.mouse.down(); await p.waitForTimeout(350); await p.mouse.up(); check('the left button moves the cannon', (await st(p)).px < px2 - 10);
  check('the move buttons are big (60px+)', L.w >= 60, L);
  await p.click('#bAuto'); a = await st(p); check('the Auto button toggles auto-fire off', !a.auto, a); const sh = a.shots;
  await p.mouse.click(r.x + r.w / 2, y); await p.waitForTimeout(300); check('with auto-fire off a tap on the field fires', (await st(p)).shots > sh, await st(p));
  const F = await b('bFire'); const sh2 = (await st(p)).shots; await p.mouse.move(F.x, F.y); await p.mouse.down(); await p.waitForTimeout(500); await p.mouse.up(); check('holding the Fire button fires', (await st(p)).shots > sh2 + 1);
  await shot(p, '03-touch'); check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function padTest(env) {
  console.log('4. gamepad: stick moves, A fires, Start pauses');
  const init = `(() => { window.__pad = { axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), connected: true, id: 'test', index: 0 }; navigator.getGamepads = () => [window.__pad]; })();`;
  const s = await open(env, { initScripts: [init] }); const p = s.page;
  await act(p, 'setup:classic'); await act(p, 'go:classic'); await wait(p, () => __kb.state().phase === 'play', null, 6000);
  const x0 = (await st(p)).px; await p.evaluate(() => { __pad.axes[0] = 1; }); await p.waitForTimeout(350); await p.evaluate(() => { __pad.axes[0] = 0; }); check('the stick moves the cannon', (await st(p)).px > x0 + 15);
  const sh = (await st(p)).shots; await p.evaluate(() => { __pad.buttons[0].pressed = true; }); await p.waitForTimeout(500); await p.evaluate(() => { __pad.buttons[0].pressed = false; }); check('A fires', (await st(p)).shots > sh);
  await p.evaluate(() => { __pad.buttons[9].pressed = true; }); await p.waitForTimeout(200); check('Start pauses', (await st(p)).paused); await p.evaluate(() => { __pad.buttons[9].pressed = false; });
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function modesTest(env) {
  console.log('5. modes: classic, survival, endless, daily, take turns, co-op, boss and bonus waves, power-ups');
  const s = await open(env); const p = s.page;
  await intoPlay(p, { mode: 'survival', mp: 'solo' }); let a = await st(p); check('survival has one life', a.lives === 1, a);
  await p.evaluate(() => { __invade.S.pl[0].sh = 0; __invade.S.pl[0].inv = 0; __invade.hurt(); }); await wait(p, () => __kb.state().screen === 'result', null, 9000); check('losing the only life ends the run with a result', true);
  await shot(p, '05-result'); check('the result shows the score and Again', !!(await p.$('[data-act="retry"]')));
  const sv = await stored(p, SAVE); check('the run was saved (plays, best wave)', sv.stats.plays >= 1 && sv.bw.survival >= 1, sv);
  await act(p, 'title'); await start(p, { mode: 'endless', mp: 'solo' }); await wait(p, () => __kb.state().phase === 'play'); await p.evaluate(() => { __invade.S.pl[0].inv = 0; __invade.hurt(); }); await p.waitForTimeout(400); a = await st(p); check('endless never loses a life', a.lives === 3 && a.phase !== 'over', a);
  await start(p, { mode: 'classic', mp: 'solo' }); await wait(p, () => __kb.state().phase === 'intro' || __kb.state().phase === 'play'); await p.evaluate(() => __invade.wave(5)); await p.waitForTimeout(1500); a = await st(p); check('wave 5 is a boss wave', a.boss, a); await shot(p, '05-boss');
  await p.evaluate(() => __invade.clearWave()); await wait(p, () => __kb.state().phase === 'clear'); await p.waitForTimeout(100); check('defeating the boss clears the wave', true);
  await p.evaluate(() => { __invade.wave(3); }); await p.waitForTimeout(600); check('wave 3 is a bonus wave of gems', await p.evaluate(() => __invade.S.spec.kind === 'bonus' && __invade.S.al.every(x => x.t === 8)));
  await p.evaluate(() => { __invade.wave(1); __invade.dropCap(0); }); await p.waitForTimeout(100);
  await p.evaluate(() => __invade.saucer()); await p.waitForTimeout(100); check('a Moon Bus can be on screen', await p.evaluate(() => !!__invade.S.sau));
  await start(p, { mode: 'daily', dkey: 20261127 }); await wait(p, () => __kb.state().phase === 'intro' || __kb.state().phase === 'play'); a = await st(p); check('the daily challenge starts, solo with two rules', a.mode === 'daily' && (await p.evaluate(() => __invade.S.mods.length)) === 2, a);
  await start(p, { mode: 'classic', mp: 'alt' }); await wait(p, () => __kb.state().phase === 'play'); await p.evaluate(() => { __invade.S.pl[0].inv = 0; __invade.hurt(); }); await wait(p, () => __kb.state().cur === 1, null, 9000); check('take turns: player 2 is up after a lost life', true);
  await shot(p, '05-alt');
  await start(p, { mode: 'classic', mp: 'coop' }); await wait(p, () => __kb.state().phase === 'play'); a = await st(p); check('co-op puts two cannons on screen with shared lives', a.np === 2 && a.lives === 4, a); await shot(p, '05-coop');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function campaignTest(env) {
  console.log('6. campaign: stage grid, locked stages, clear → stars saved → next stage');
  const s = await open(env); const p = s.page;
  await act(p, 'camp'); let a = await st(p); check('the stage grid opens', a.screen === 'camp', a);
  const off = await p.$$eval('.lv:disabled', b => b.length); check('44 stages are locked at first', off === 44, off); await shot(p, '06-camp');
  await act(p, 'lv:0'); await wait(p, () => __kb.state().phase === 'intro' || __kb.state().phase === 'play'); await p.waitForTimeout(500);
  check('stage 1 shows the tutorial hint', (await st(p)).hint.length > 3, await st(p)); await wait(p, () => __kb.state().phase === 'play', null, 6000);
  await p.evaluate(() => __invade.clearWave()); await wait(p, () => __kb.state().screen === 'result', null, 9000); a = await st(p);
  check('clearing gives 3 stars and saves them', a.save.cs[0] === 3 && a.save.cl === 1 && a.save.st === 3, a.save.cs.slice(0, 3));
  check('Next stage is offered', !!(await p.$('[data-act="next"]'))); await act(p, 'next'); await wait(p, () => __kb.state().playing || __kb.state().phase === 'intro'); a = await st(p); check('stage 2 starts', a.mode === 'campaign' && a.wave === 1, a);
  await p.evaluate(() => __invade.showCamp()); const off2 = await p.$$eval('.lv:disabled', b => b.length); check('stage 3 unlocked only after stage 2 is cleared (43 locked)', off2 === 43, off2);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function settingsTest(env) {
  console.log('7. settings: CRT look is off by default, scanlines and glow apply, saved');
  const s = await open(env); const p = s.page;
  check('the CRT look is off by default', (await st(p)).fx === 0);
  await act(p, 'settings'); await p.click('.seg[data-k="fx"] [data-v="2"]'); let a = await st(p); check('CRT + glow is applied and saved', a.fx === 2 && a.save.set.fx === 2 && await p.evaluate(() => document.getElementById('cv').classList.contains('glow')), a.save.set);
  await p.click('.seg[data-k="auto"] [data-v="1"]'); check('auto-fire setting saved', (await stored(p, SAVE)).set.auto === 1);
  await p.click('[data-act="setClose"]'); await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready()); check('settings survive a reload', (await st(p)).fx === 2);
  await s.close();
}

async function layouts(env) {
  console.log('8. screen sizes x ja/en, portrait and landscape: the field fits, buttons on screen');
  for (const vp of ['se1', 'a360', 'ip12', 'land', '768x1024', '1024x768']) for (const lang of ['ja', 'en']) {
    const touch = vp !== '1024x768' && vp !== '768x1024' ? true : vp === '768x1024';
    const s = await open(env, { vp, lang, touch, seed: {} }); const p = s.page; const tag = vp + '/' + lang;
    const probe = async what => { const r = await p.evaluate(`(${layoutProbe})()`); check(`${tag} ${what}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, r); };
    await probe('rules'); await act(p, 'howtoGo'); await probe('title'); await act(p, 'camp'); await probe('stages'); await act(p, 'title');
    await act(p, 'setup:classic'); await probe('setup'); await act(p, 'go:classic'); await wait(p, () => __kb.state().playing); await p.waitForTimeout(300);
    const g = await p.evaluate(() => { const r = id => { const e = document.getElementById(id).getBoundingClientRect(); return [e.left, e.top, e.right, e.bottom, e.width, e.height]; }; const c = r('cv'); const vis = id => document.getElementById(id).getClientRects().length > 0; return { c, vw: innerWidth, vh: innerHeight, touch: document.body.classList.contains('touch'), btns: ['bL', 'bR', 'bFire', 'bBomb'].filter(vis).map(r) }; });
    check(`${tag} game: canvas is 3:4 and inside the screen`, Math.abs(g.c[4] / g.c[5] - 0.75) < 0.03 && g.c[0] >= -1 && g.c[2] <= g.vw + 1 && g.c[1] >= -1 && g.c[3] <= g.vh + 1, g);
    if (g.touch) check(`${tag} game: touch buttons are 52px+ and on screen`, g.btns.length === 4 && g.btns.every(b => b[4] >= 50 && b[0] >= 0 && b[2] <= g.vw && b[1] >= 0 && b[3] <= g.vh), g.btns);
    if (lang === 'ja') await shot(p, `08-${vp.replace('x', '_')}-game`);
    await p.evaluate(() => __invade.openPause()); await wait(p, () => !!document.querySelector('.kb-pause')); await probe('pause'); await p.click('.kb-layer .kb-btn--primary');
    await p.evaluate(() => { __invade.S.lives = 1; __invade.S.pl[0].inv = 0; __invade.S.pl[0].sh = 0; __invade.hurt(); }); await wait(p, () => __kb.state().screen === 'result', null, 9000); await probe('result');
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

async function orient(env) {
  console.log('9. orientation: Landscape force turns a portrait phone and the game still plays');
  const s = await open(env, { vp: 'ip12', touch: true, seed: { [HOWTO]: '1', 'kusoge.invade.ori': 'land' }, shell: true }); const p = s.page;
  await p.waitForTimeout(800); const fr = p.frames().find(f => /\/invade\//.test(f.url()) && f !== p.mainFrame());
  check('the page runs inside the rotating shell', !!fr, p.frames().map(f => f.url()));
  if (fr) { await fr.waitForFunction(() => window.__kb && __kb.ready(), null, { timeout: 8000 }); const w = await fr.evaluate(() => ({ w: innerWidth, h: innerHeight })); check('inside the shell the screen is landscape', w.w > w.h, w); await fr.evaluate(() => __invade.start({ mode: 'classic' })); await fr.waitForFunction(() => __kb.state().playing, null, { timeout: 8000 }); check('a game starts in landscape-forced mode', true); }
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function english(env) {
  console.log('10. English: no Japanese left on any screen');
  const s = await open(env, { lang: 'en', seed: {} }); const p = s.page;
  const scan = async w => { const jp = await p.evaluate(`(${jpScan})(true)`); check('English ' + w + ': no Japanese', jp.length === 0, jp.slice(0, 6)); };
  await scan('rules'); await act(p, 'howtoGo'); await scan('title'); await act(p, 'camp'); await scan('stages'); await act(p, 'title'); await act(p, 'setup:daily'); await scan('daily'); await act(p, 'title'); await act(p, 'records'); await scan('records'); await act(p, 'title'); await act(p, 'settings'); await scan('settings'); await p.click('[data-act="setClose"]');
  await start(p, { mode: 'classic' }); await wait(p, () => __kb.state().phase === 'play'); await scan('game'); await p.evaluate(() => { __invade.S.lives = 1; __invade.S.pl[0].inv = 0; __invade.S.pl[0].sh = 0; __invade.hurt(); }); await wait(p, () => __kb.state().screen === 'result', null, 9000); await scan('result');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function perf(env) {
  console.log('11. performance: a busy screen in headless software rendering (the phone number is NOT measured here)');
  const s = await open(env, { vp: 'a360' }); const p = s.page;
  await intoPlay(p, { mode: 'classic' }); await p.evaluate(() => { __invade.wave(25); __invade.god(9); }); await p.waitForTimeout(3500);
  const fps = await p.evaluate(() => window.__fps || 0); check('the page keeps over 15 fps even in software rendering', fps > 15, fps);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(ROOT); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now(); const only = process.argv[2] ? process.argv[2].split(',') : null;
  const all = { first, keys: keysTest, touch: touchTest, pad: padTest, modes: modesTest, campaign: campaignTest, settings: settingsTest, layouts, orient, english, perf };
  for (const [name, f] of Object.entries(all)) {
    if (only && !only.includes(name)) continue;
    try { await f(env); } catch (e) { check(name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
