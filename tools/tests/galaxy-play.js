#!/usr/bin/env node
// ぐるぐる星わたりの通しプレイ（Playwright）。キーボード・タッチ（CDP）・ゲームパッドは本物の入力。?debug の window.__kb / __galaxy は状態を読む・
// 「手動の刻み」（__galaxy.manual(true) → hold / stepN：ループを止めて、決まった入力で n フレームだけ進める）だけに使う。
//   node tools/tests/galaxy-play.js [first,hub,keys,proofs,touch,pause,save,gamepad,english,orient,layouts,perf,nogl,settings]
// 1. 初回のあそびかた→ほしみ台  2. ゲートとミッションえらび・ロック  3. 本物のキーで歩く（星の表面にいる）・ジャンプ・スピン・ドスン  4. 保存した証明（ボットの入力）を、
// ページの本物のエンジンで全10ミッション再生  5. タッチのスティック・ボタン・カメラ  6. 一時停止  7. 保存と再読み込み  8. ゲームパッド  9. 英語  10. 画面のむき  11. 画面サイズ×ja/en
// 12. 速さ（FPS・画質の自動調整）  13. WebGL なしの案内  14. せってい（たすけ・うごきをへらす・かるい描画）
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const E = require('../../galaxy/engine.js');
const LV = require('../../galaxy/levels.js');
const PROOFS = require('../../galaxy/proofs.js');

const OUT = path.join(__dirname, 'out', 'shots', 'galaxy-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.galaxy.save', HOWTO = 'kusoge.galaxy.howto', ORI = 'kusoge.galaxy.ori';
const st = p => p.evaluate(() => __kb.state());
const sleep = (p, ms) => p.waitForTimeout(ms);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 15000 });
const dist = (a, b) => Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);

async function open(env, o = {}) {
  const touch = !!o.touch;
  const s = await B.newSession(env, { vp: V.pick(o.vp || 'ip12')[0], lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: touch, hasTouch: touch, initScripts: o.initScripts, noGl: o.noGl });
  await s.goto('/galaxy/?debug' + (o.query || ''));
  if (!o.noGl) await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__galaxy, null, { timeout: 15000 });
  return s;
}
// ミッションを（本物のクリックで）はじめる：タイトル → ほしみ台 → ゲート → ミッション。noIntro=true でフライインを飛ばす
async function startReal(p, gal, mid) {
  const a = await st(p);
  if (a.title) await p.click('#tGo');
  await wait(p, () => __kb.state().mode === 'hub');
  await p.evaluate(g => __galaxy.openSelect(g), gal); await wait(p, () => __kb.state().sel);
  await p.locator(`#selBody .qm[data-m="${mid}"]`).click(); await wait(p, () => __kb.state().mode === 'play');
  await p.keyboard.press('Space'); await wait(p, () => !__kb.state().intro, null, 8000);
}
const holdKeys = async (p, keys, ms) => { for (const k of keys) await p.keyboard.down(k); await sleep(p, ms); for (const k of keys) await p.keyboard.up(k); };

async function first(env) {
  console.log('1. first visit: how to play, then the Stargazer Deck');
  const s = await open(env, { seed: {} }); const p = s.page; let a = await st(p);
  check('starts on the title with the 3D deck behind it', a.title && a.mode === 'title' && a.tris > 100, a);
  await p.click('#tGo'); a = await st(p); check('the first start shows how to play', a.howto, a); await shot(p, 'howto');
  await p.click('#howtoGo'); await wait(p, () => __kb.state().mode === 'hub'); a = await st(p); check('then the hub (Stargazer Deck)', a.mode === 'hub' && a.gid === 'hub' && a.playing, a);
  check('how-to is remembered', (await p.evaluate(k => localStorage.getItem(k), HOWTO)) === '1');
  check('no page errors', !s.log.pageErrors.length && !s.log.consoleErrors.length, [...s.log.pageErrors, ...s.log.consoleErrors].slice(0, 3)); await s.close();
}

async function hub(env) {
  console.log('2. gates, galaxy list, locks');
  const s = await open(env); const p = s.page; await p.click('#tGo'); await wait(p, () => __kb.state().mode === 'hub');
  await p.evaluate(() => __galaxy.openSelect('g1')); let a = await st(p); check('the mission list opens', a.sel && a.paused, a);
  check('galaxy 1 lists 5 missions and the Lumi hunt', (await p.locator('#selBody .qm').count()) === 6); check('12 galaxy tabs', (await p.locator('#selTabs button').count()) === 12);
  await p.locator('#selTabs button[data-g="g2"]').click(); check('the ice galaxy is locked at first', (await p.locator('#selBody .qm:disabled').count()) === 5, await p.locator('#selBody').innerText());
  await shot(p, 'select-locked'); await p.click('#selClose'); a = await st(p); check('closing resumes the hub', !a.sel && !a.paused && a.mode === 'hub', a);
  // walk to a gate for real: the gate stands on the deck
  const gate = await p.evaluate(() => { const S = __galaxy.S, i = S.L.ents.findIndex(e => e.k === 'gate'); return { p: S.ep[i], up: __galaxy.E.entUp(S, i) }; });
  await p.evaluate(g => { const S = __galaxy.S, E = __galaxy.E, V = E.vec, pe = E.perp(g.up); __galaxy.setPos(g.p.map((v, k) => v + g.up[k] * 0.6 + pe[k] * 4), g.up); S.cam.fw = E.projT(V.sub(g.p, S.h.x), g.up); S.cam.up = g.up.slice(); }, gate);
  await p.evaluate(() => __galaxy.manual(false)); await p.keyboard.down('KeyW'); try { await wait(p, () => __kb.state().sel, null, 12000); } catch (e) {} await p.keyboard.up('KeyW');
  a = await st(p); check('walking into the gate opens its missions', a.sel, a); await shot(p, 'select-gate');
  await p.locator('#selBody .qm').first().click(); await wait(p, () => __kb.state().mode === 'play'); a = await st(p); check('a mission starts with the fly-in', a.mid === 'g1m1' && a.intro, a);
  await sleep(p, 900); await shot(p, 'flyin'); await p.keyboard.press('Space'); await wait(p, () => !__kb.state().intro);
  check('no page errors', !s.log.pageErrors.length && !s.log.consoleErrors.length, [...s.log.pageErrors, ...s.log.consoleErrors].slice(0, 3)); await s.close();
}

async function keys(env) {
  console.log('3. real keys: walk on the planet, jump, spin, pound');
  const s = await open(env); const p = s.page; await startReal(p, 'g1', 'g1m1'); let a = await st(p);
  const c = LV.compile(E, 'g1').bodies[0]; const x0 = a.x;
  await holdKeys(p, ['KeyW'], 1500); a = await st(p); check('W runs forward and the hero is on the planet surface', dist(a.x, x0) > 3 && a.on >= 0 && Math.abs(Math.hypot(...a.x) - 9.5) < 0.12, { d: dist(a.x, x0), r: Math.hypot(...a.x), on: a.on });
  const up = a.up; await holdKeys(p, ['KeyA'], 700); a = await st(p); check('turning keeps the up-vector on the surface normal', a.up[0] * a.x[0] / Math.hypot(...a.x) + a.up[1] * a.x[1] / Math.hypot(...a.x) + a.up[2] * a.x[2] / Math.hypot(...a.x) > 0.97, a.up);
  const j0 = a.jumps; await p.keyboard.down('Space'); await sleep(p, 120); const mid = await st(p); await p.keyboard.up('Space'); check('Space jumps (leaves the ground, counted)', mid.jumps > j0 && mid.on < 0, mid);
  await wait(p, () => __kb.state().on >= 0); await p.keyboard.down('KeyJ'); await sleep(p, 90); await p.keyboard.up('KeyJ'); await sleep(p, 150); a = await st(p); check('J spins', a.spins >= 1, a);
  await wait(p, () => __kb.state().on >= 0); await p.keyboard.down('Space'); await sleep(p, 250); await p.keyboard.up('Space'); await p.keyboard.down('KeyL'); await sleep(p, 90); await p.keyboard.up('KeyL'); try { await wait(p, () => __kb.state().pounds >= 1, null, 4000); } catch (e) {} a = await st(p); check('L in the air pounds', a.pounds >= 1, a);
  const cam0 = await p.evaluate(() => __galaxy.S.cam.fw.slice()); await holdKeys(p, ['KeyE'], 600); const cam1 = await p.evaluate(() => __galaxy.S.cam.fw.slice()); check('E turns the camera', dist(cam0, cam1) > 0.1, [cam0, cam1]);
  await p.keyboard.press('Escape'); await wait(p, () => __kb.state().pauseOpen); check('Esc opens the pause menu', true); await shot(p, 'pause');
  check('no page errors', !s.log.pageErrors.length && !s.log.consoleErrors.length, [...s.log.pageErrors, ...s.log.consoleErrors].slice(0, 3)); await s.close();
}

async function proofs(env) {
  console.log('4. the recorded proofs: every mission cleared on the real engine in the page');
  const s = await open(env); const p = s.page;
  for (const g of LV.GALAXIES) for (const m of LV.def(g.id).missions) {
    const rec = E.unrle(PROOFS[m.id].rec);
    const r = await p.evaluate(([gid, mid, rec]) => { __galaxy.resetSave(); __galaxy.manual(true); __galaxy.startMission(gid, mid, { noIntro: true }); __galaxy.skip(); const G0 = __galaxy.G; G0.intro = false; __galaxy.runRec(rec); __galaxy.stepN(130, { sx: 0, sy: 0, b: 0 }); const s0 = __kb.state(); __galaxy.release(); return { ok: s0.ok, over: s0.over, frame: s0.frame, result: s0.resultShown, pts: s0.save.pts }; }, [g.id, m.id, rec]);
    check(`${m.id} (${m.name.en}) is cleared by the recorded inputs; the result opens; the shard (or hunt) is saved`, r.ok && r.over && r.result && r.pts === (m.kind === 'hunt' ? 0 : 1), r);
  }
  await p.evaluate(() => __galaxy.manual(false)); check('no page errors', !s.log.pageErrors.length && !s.log.consoleErrors.length, [...s.log.pageErrors, ...s.log.consoleErrors].slice(0, 3)); await s.close();
}

async function ending(env) {
  console.log('4b. final boss -> result -> ending credits -> hub; the ending can be watched again from the title');
  const s = await open(env); const p = s.page; const rec = E.unrle(PROOFS.g8m3.rec);
  await p.evaluate(([rec]) => { __galaxy.resetSave(); __galaxy.manual(true); __galaxy.startMission('g8', 'g8m3', { noIntro: true }); __galaxy.skip(); __galaxy.G.intro = false; __galaxy.runRec(rec); __galaxy.stepN(130, { sx: 0, sy: 0, b: 0 }); __galaxy.release(); __galaxy.manual(false); }, [rec]);
  let a = await st(p); check('the final boss result shows "to the ending"', a.resultShown && /エンディング/.test(await p.locator('#rNext').innerText()), await p.locator('#rNext').innerText());
  await p.click('#rNext'); await wait(p, () => !document.getElementById('ovEnd').hidden); const txt = await p.locator('#endRoll').innerText(); check('the credits roll (no music) with the player\'s stats', /46/.test(txt) && txt.length > 120, txt.slice(0, 200)); await shot(p, 'ending');
  const sv = JSON.parse(await p.evaluate(k => localStorage.getItem(k), SAVE)); check('final clear is saved (stat) and the shard counted', sv.stats.final === 1 && sv.pts === 1, sv);
  await p.click('#endGo'); await wait(p, () => __kb.state().mode === 'hub'); check('back on the Stargazer Deck', true);
  await p.evaluate(() => __galaxy.showTitle()); check('the title offers to watch the ending again', await p.locator('#tEnd').isVisible());
  check('no page errors', !s.log.pageErrors.length && !s.log.consoleErrors.length, [...s.log.pageErrors, ...s.log.consoleErrors].slice(0, 3)); await s.close();
}

async function touch(env) {
  console.log('5. touch: floating stick, buttons, drag to look (portrait and landscape)');
  for (const vp of ['ip12', 'land']) {
    const s = await open(env, { vp, touch: true }); const p = s.page; const cdp = await s.ctx.newCDPSession(p);
    const tstart = (x, y, id) => cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x, y, id }] });
    const tmove = (pts) => cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: pts });
    const tend = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    await p.tap('#tGo'); await wait(p, () => __kb.state().mode === 'hub');
    await p.evaluate(() => __galaxy.openSelect('g1')); await p.tap('#selBody .qm'); await wait(p, () => __kb.state().mode === 'play'); await p.evaluate(() => __galaxy.skip()); await wait(p, () => !__kb.state().intro, null, 8000);
    let a = await st(p); check(`[${vp}] touch buttons are shown in play`, a.touch && await p.locator('#bJ').isVisible() && await p.locator('#stickz').isVisible(), a);
    const r = await p.evaluate(() => { const q = id => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2, w: b.width, h: b.height, r: b.right, b: b.bottom }; }; const z = document.getElementById('stickz').getBoundingClientRect(); return { J: q('bJ'), S: q('bS'), P: q('bP'), z: { x: z.left, y: z.top, w: z.width, h: z.height }, W: innerWidth, H: innerHeight }; });
    check(`[${vp}] the three buttons are on screen and at least 44px`, [r.J, r.S, r.P].every(b => b.x - b.w / 2 >= 0 && b.r <= r.W + 1 && b.b <= r.H + 1 && Math.min(b.w, b.h) >= 44), r);
    const xd = a.x; await tstart(r.z.x + r.z.w * 0.4, r.z.y + r.z.h * 0.6, 4); await tmove([{ x: r.z.x + r.z.w * 0.4, y: r.z.y + r.z.h * 0.6 - 6, id: 4 }]); await sleep(p, 600); a = await st(p); check(`[${vp}] a tiny stick movement is inside the dead zone (hero stays)`, dist(a.x, xd) < 0.6, dist(a.x, xd)); await tend();
    const x0 = a.x; await tstart(r.z.x + r.z.w * 0.4, r.z.y + r.z.h * 0.6, 1); await tmove([{ x: r.z.x + r.z.w * 0.4, y: r.z.y + r.z.h * 0.6 - 50, id: 1 }]); await sleep(p, 1100); a = await st(p);
    check(`[${vp}] dragging the stick runs the hero`, dist(a.x, x0) > 2.5, { d: dist(a.x, x0) }); await tend();
    const j0 = a.jumps; await tstart(r.J.x, r.J.y, 2); await sleep(p, 150); await tend(); a = await st(p); check(`[${vp}] the jump button jumps`, a.jumps > j0, a);
    await wait(p, () => __kb.state().on >= 0); const f0 = await p.evaluate(() => __galaxy.S.cam.fw.slice());
    await tstart(r.W * 0.8, r.z.y + 20, 3); for (let i = 1; i <= 6; i++) await tmove([{ x: r.W * 0.8 + i * 18, y: r.z.y + 20, id: 3 }]); await sleep(p, 300); await tend(); const f1 = await p.evaluate(() => __galaxy.S.cam.fw.slice());
    check(`[${vp}] dragging the right side turns the camera`, dist(f0, f1) > 0.05, [f0, f1]); await shot(p, 'touch-' + vp);
    check(`[${vp}] no page errors`, !s.log.pageErrors.length && !s.log.consoleErrors.length, [...s.log.pageErrors, ...s.log.consoleErrors].slice(0, 3)); await s.close();
  }
}

async function pause(env) {
  console.log('6. pause, resume, hidden page');
  const s = await open(env); const p = s.page; await startReal(p, 'g1', 'g1m1'); await p.keyboard.press('Escape'); await wait(p, () => __kb.state().pauseOpen);
  const f0 = (await st(p)).frame; await sleep(p, 500); const f1 = (await st(p)).frame; check('the game stands still while paused', f0 === f1, [f0, f1]);
  const items = await p.locator('.kb-modal button, .kb-sheet button, [role=dialog] button').allInnerTexts(); check('the menu has resume, back to the station, settings', items.some(t => /つづける/.test(t)) && items.some(t => /ほしみ台/.test(t)) && items.some(t => /せってい/.test(t)), items);
  await p.locator('[role=dialog] button', { hasText: 'つづける' }).first().click(); await sleep(p, 400); check('resume continues', (await st(p)).frame > f1 && !(await st(p)).paused);
  await p.evaluate(() => { Object.defineProperty(document, 'hidden', { value: true, configurable: true }); Object.defineProperty(document, 'visibilityState', { value: 'hidden', configurable: true }); document.dispatchEvent(new Event('visibilitychange')); });
  await sleep(p, 300); check('hiding the page pauses', (await st(p)).paused);
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors); await s.close();
}

async function saveTest(env) {
  console.log('7. save and reload');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __galaxy.resetSave()); const rec = E.unrle(PROOFS.g1m1.rec);
  await p.evaluate(([rec]) => { __galaxy.manual(true); __galaxy.startMission('g1', 'g1m1', { noIntro: true }); __galaxy.skip(); __galaxy.G.intro = false; __galaxy.runRec(rec); __galaxy.stepN(130, { sx: 0, sy: 0, b: 0 }); __galaxy.release(); }, [rec]);
  let a = await st(p); check('the result shows the shard count', a.resultShown && /1 \/ 46/.test(await p.locator('#rKv').innerText()), await p.locator('#rKv').innerText());
  const sv = JSON.parse(await p.evaluate(k => localStorage.getItem(k), SAVE)); check('saved: shard bit, pts, best time, coins', sv.pts === 1 && (sv.sh.g1 & 1) === 1 && sv.bt.g1m1 > 0 && sv.cn >= 5 && sv.stats.clears === 1, sv);
  await s.reload(); await p.waitForFunction(() => window.__galaxy); a = await st(p); check('after reload the progress is still there', a.save.pts === 1 && a.hud.shard.includes("1/46"), a.save);
  // a saved best never goes up when a slower run follows
  const bt = sv.bt.g1m1; await p.evaluate(() => { __galaxy.manual(true); __galaxy.startMission('g1', 'g1m1', { noIntro: true }); __galaxy.skip(); __galaxy.G.intro = false; for (let i = 0; i < 600; i++) __galaxy.stepN(1, { sx: i < 300 ? 0 : 1, sy: 0, b: 0 }); __galaxy.release(); __galaxy.manual(false); });
  check('a quit mission does not change the best time', JSON.parse(await p.evaluate(k => localStorage.getItem(k), SAVE)).bt.g1m1 === bt);
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors); await s.close();
}

async function gamepad(env) {
  console.log('8. gamepad');
  const init = `(() => { const pad = { id: 'Fake Pad', index: 0, connected: true, mapping: 'standard', axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), timestamp: 1 }; window.__pad = pad; navigator.getGamepads = () => [pad, null, null, null]; })();`;
  const s = await open(env, { initScripts: [init] }); const p = s.page; await startReal(p, 'g1', 'g1m1'); let a = await st(p); const x0 = a.x;
  await p.evaluate(() => { __pad.axes[1] = -1; }); await sleep(p, 1200); await p.evaluate(() => { __pad.axes[1] = 0; }); a = await st(p); check('the left stick runs the hero', dist(a.x, x0) > 3, a);
  await p.evaluate(() => { __pad.buttons[0].pressed = true; }); await sleep(p, 200); await p.evaluate(() => { __pad.buttons[0].pressed = false; }); a = await st(p); check('A jumps', a.jumps >= 1, a);
  await wait(p, () => __kb.state().on >= 0); await p.evaluate(() => { __pad.buttons[2].pressed = true; }); await sleep(p, 150); await p.evaluate(() => { __pad.buttons[2].pressed = false; }); a = await st(p); check('X spins', a.spins >= 1, a);
  const f0 = await p.evaluate(() => __galaxy.S.cam.fw.slice()); await p.evaluate(() => { __pad.axes[2] = 1; }); await sleep(p, 500); await p.evaluate(() => { __pad.axes[2] = 0; }); const f1 = await p.evaluate(() => __galaxy.S.cam.fw.slice()); check('the right stick turns the camera', dist(f0, f1) > 0.1);
  await p.evaluate(() => { __pad.buttons[9].pressed = true; }); await wait(p, () => __kb.state().pauseOpen); check('Start pauses', true);
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors); await s.close();
}

async function english(env) {
  console.log('9. English: no Japanese left on any screen');
  const s = await open(env, { lang: 'en', seed: { [HOWTO]: '1' } }); const p = s.page; const scan = async name => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`English ${name}: no Japanese visible`, jp.length === 0, jp.slice(0, 6)); };
  await scan('title'); await p.click('#tHow'); await scan('how to play'); await p.click('#howtoGo'); await wait(p, () => __kb.state().mode === 'hub' || __kb.state().title);
  if ((await st(p)).title) await p.click('#tGo'); await wait(p, () => __kb.state().mode === 'hub'); await scan('hub');
  await p.evaluate(() => __galaxy.openSelect('g3')); await scan('mission list'); await p.click('#selClose'); await p.evaluate(() => __galaxy.showSettings()); await scan('settings'); await p.click('#setClose'); await sleep(p, 200);
  await p.evaluate(() => { __galaxy.unlockAll(); __galaxy.manual(true); __galaxy.startMission('g1', 'g1m4', { noIntro: false }); }); await scan('mission start banner'); await p.evaluate(() => { __galaxy.skip(); __galaxy.G.intro = false; __galaxy.stepN(5); });
  await sleep(p, 300); await scan('hud');
  await p.evaluate(rec => { __galaxy.startMission('g1', 'g1m4', { noIntro: true }); __galaxy.skip(); __galaxy.G.intro = false; __galaxy.runRec(rec); __galaxy.stepN(130, { sx: 0, sy: 0, b: 0 }); __galaxy.release(); }, E.unrle(PROOFS.g1m4.rec)); await scan('result with rank');
  const html = await p.evaluate(() => document.documentElement.lang); check('html lang is en', html === 'en');
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors); await s.close();
}

async function orient(env) {
  console.log('10. screen orientation preference');
  const s = await B.newSession(env, { vp: V.pick('ip12')[0], lang: 'ja', seed: { [HOWTO]: '1', [ORI]: 'land' }, isMobile: true, hasTouch: true }); await s.goto('/galaxy/?debug'); const p = s.page; await sleep(p, 1500);
  const fr = p.frames(); check('"landscape" mode runs the game inside the rotating shell', fr.length >= 2, fr.map(f => f.url()));
  const f = fr.find(x => /\/galaxy\//.test(x.url()) && x !== p.mainFrame()) || p.mainFrame(); const ok = await f.evaluate(() => !!document.getElementById('cv') && innerWidth > innerHeight).catch(() => false); check('the game sees a landscape screen', ok);
  await s.close();
  const s2 = await open(env, { vp: 'ip12', touch: true, seed: { [HOWTO]: '1' } }); await s2.page.click('#tSet'); check('settings has the orientation choice', (await s2.page.locator('#oOri .opt').count()) === 3); await s2.close();
}

async function layouts(env) {
  console.log('11. layouts 320px to tablet, ja and en');
  for (const spec of ['se1', 'a360', 'ip12', 'land', '768x1024', '1024x768']) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp: spec, lang, touch: !/^\d+x/.test(spec) }); const p = s.page; const tag = `[${spec} ${lang}]`;
    let r = await p.evaluate(`(${layoutProbe})()`); check(`${tag} title: no sideways scroll, primary button visible and 44px`, r.hscroll <= 1 && r.primary.every(x => !x.problems.length && x.h >= 44), r);
    await p.click('#tGo'); await wait(p, () => __kb.state().mode === 'hub'); await sleep(p, 300);
    r = await p.evaluate(`(${layoutProbe})()`); check(`${tag} hub: controls reachable`, r.hscroll <= 1 && r.offscreen.length === 0, r.offscreen);
    const box = await p.evaluate(() => { const o = {}; for (const id of ['bJ', 'bS', 'bP', 'pauseBtn', 'hud']) { const e = document.getElementById(id), b = e.getBoundingClientRect(); o[id] = { l: b.left, r: b.right, t: b.top, b: b.bottom, vis: !!(e.offsetWidth || e.offsetHeight) }; } return { o, W: innerWidth, H: innerHeight }; });
    const inside = Object.entries(box.o).filter(([k, b]) => b.vis).every(([k, b]) => b.l >= -1 && b.r <= box.W + 1 && b.t >= -1 && b.b <= box.H + 1); check(`${tag} HUD and pause button are on screen`, inside, box);
    await p.evaluate(() => __galaxy.openSelect('g1')); r = await p.evaluate(`(${layoutProbe})()`); check(`${tag} mission list: primary visible, reachable`, r.offscreen.length === 0 && r.primary.every(x => !x.problems.length), r);
    await shot(p, `layout-${spec}-${lang}`); check(`${tag} no page errors`, !s.log.pageErrors.length && !s.log.consoleErrors.length, [...s.log.pageErrors, ...s.log.consoleErrors].slice(0, 3)); await s.close();
  }
}

async function perf(env) {
  console.log('12. speed: frame rate, draw cost, automatic quality');
  const s = await open(env, { vp: 'ip12', touch: true }); const p = s.page; await startReal(p, 'g1', 'g3' === 'x' ? '' : 'g1m3');
  const r = await p.evaluate(() => new Promise(res => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 > 2500) res({ fps: n / ((performance.now() - t0) / 1000), st: __kb.state() }); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  console.log(`      headless software GL: ${r.fps.toFixed(1)} fps, draw ${r.st.ms} ms, ${r.st.tris} tris, quality ${r.st.q}`);
  check('the loop keeps drawing (software GL, a few fps at least) and the scene is light', r.fps > 4 && r.st.tris < 60000, r); check('quality is within 0..2', r.st.q >= 0 && r.st.q <= 2, r.st); check('off-screen planets are culled (the culling counter exists)', await p.evaluate(() => typeof __galaxy.R.state.culled === 'number'));
  await p.evaluate(() => { __galaxy.R.setQuality(2, false); for (let i = 0; i < 400; i++) __galaxy.R.adapt(60); }); check('slow frames lower the quality automatically', (await st(p)).q < 2, await st(p));
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors); await s.close();
}

async function nogl(env) {
  console.log('13. no WebGL: a friendly message');
  for (const lang of ['ja', 'en']) {
    const s = await open(env, { noGl: true, lang }); const p = s.page; await sleep(p, 500);
    const t = await p.evaluate(() => (document.getElementById('ovNoGl').hidden ? '' : document.getElementById('ovNoGl').innerText)); check(`[${lang}] the needs-WebGL screen is shown`, /WebGL/.test(t), t);
    check(`[${lang}] a way back to the games list`, (await p.locator('#ngHome').getAttribute('href')) === '../'); if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check('[en] no Japanese', jp.length === 0, jp); }
    check(`[${lang}] no page errors`, !s.log.pageErrors.length, s.log.pageErrors); await s.close();
  }
}

async function settings(env) {
  console.log('14. settings: assists, reduce motion, light graphics');
  const s = await open(env); const p = s.page; await p.click('#tSet');
  const set = async (k, v) => p.locator(`.seg[data-k="${k}"] .opt[data-v="${v}"]`).click();
  await set('ahp', 1); await set('anf', 1); await set('asl', 1); await set('rm', 1); await set('lp', 1); await set('sens', 1.5); await set('tc', 'on');
  const sv = JSON.parse(await p.evaluate(k => localStorage.getItem(k), SAVE)); check('settings are saved', sv.set.ahp === 1 && sv.set.anf === 1 && sv.set.asl === 1 && sv.set.rm === 1 && sv.set.lp === 1 && sv.set.sens === 1.5 && sv.set.tc === 'on', sv.set);
  check('reduce motion adds a body class', await p.evaluate(() => document.body.classList.contains('rm')));
  await p.click('#setClose'); await p.click('#tGo'); await wait(p, () => __kb.state().mode === 'hub'); await p.evaluate(() => __galaxy.openSelect('g1')); await p.locator('#selBody .qm[data-m="g1m4"]').click(); await wait(p, () => __kb.state().mode === 'play');
  const a = await st(p); check('6 hearts and a 1.6x comet clock with the assists', a.hud.hearts.length === 6 && a.tl > 45, a); check('light graphics fixes the quality at the lowest', a.q === 0, a.q);
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors); await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch(); let noglBrowser = null;
  const env = { server: srv, browser: noGl => { if (!noGl) return browser; return noglBrowser; } };
  noglBrowser = await B.launch({ noGl: true });
  const t0 = Date.now(); const only = process.argv[2] ? process.argv[2].split(',') : null;
  const all = { first, hub, keys, proofs, ending, touch, pause, save: saveTest, gamepad, english, orient, layouts, perf, nogl, settings };
  for (const [name, f] of Object.entries(all)) {
    if (only && !only.includes(name)) continue;
    try { await f(env); } catch (e) { check(name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await noglBrowser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
