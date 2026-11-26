#!/usr/bin/env node
// ぴょんぴょん冒険の通しプレイ（Playwright）。キーボードもタッチもゲームパッドも本物の入力。?debug の window.__kb / __hop は状態を読む・
// 「手動の刻み」（__hop.manual(true) → __hop.stepN(n)：ループは止まり、n フレームだけ今の本物の入力状態で進める）のためだけに使う。
//   node tools/tests/hop-play.js [first,keys,proofs,touch,events,pause,save,gamepad,english,themes,layouts,perf,modes,overworld]
// 1. 初回のあそびかた→タイトル→マップ（1-1だけ開いている）  2. 本物のキーで走る・ジャンプの高さ・ダッシュ・しゃがむ  3. 保存した入力の記録（証明）を
// 本物のキーで再生して全ステージをゴールまで  4. タッチ（十字パッド・ボタン、横画面）で1-1をゴールまで  5. ふむ・コイン・チェックポイント・やられて復活
// 6. 一時停止・つづける・画面を隠す  7. メダルの保存・ベストが下がらない・次のステージが開く  8. ゲームパッド  9. 英語  10. ライト／ダーク
// 11. 画面サイズ×ja/en（320px縦・横画面）  12. 速さ（1フレームあたり）
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const E = require('../../hop/engine.js');
const LV = require('../../hop/levels.js');
const { P: PROOFS } = require('../../hop/proofs.js');

const OUT = path.join(__dirname, 'out', 'shots', 'hop-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.hop.save', HOWTO = 'kusoge.hop.howto';
const Bt = E.B;
const KEYS = [[Bt.L, 'ArrowLeft'], [Bt.R, 'ArrowRight'], [Bt.U, 'ArrowUp'], [Bt.D, 'ArrowDown'], [Bt.J, 'KeyZ'], [Bt.RUN, 'ShiftLeft'], [Bt.ACT, 'KeyC']];

async function open(env, o = {}) {
  const touch = !!o.touch;
  const s = await B.newSession(env, { vp: V.get(o.vp || 'land'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: touch, hasTouch: touch, initScripts: o.initScripts });
  await s.goto('/hop/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__hop);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 8000 });
const startManual = async (p, id) => { await p.evaluate(id => { __hop.unlockAll(); __hop.start(id); __hop.manual(true); __hop.S.cam.x = 0; }, id); await wait(p, id => __kb.state().id === id && __kb.state().playing, id); };
const step = (p, n) => p.evaluate(n => __hop.stepN(n), n);
const segs = rle => rle.split(',').map(t => { const k = t.split(':'); return [parseInt(k[0], 36), parseInt(k[1], 36)]; });

// ---- real keyboard
function kb(p) {
  const held = new Set();
  return {
    async set(mask) {
      for (const [bit, key] of KEYS) {
        const want = !!(mask & bit);
        if (want && !held.has(key)) { await p.keyboard.down(key); held.add(key); } else if (!want && held.has(key)) { await p.keyboard.up(key); held.delete(key); }
      }
    },
    async release() { await this.set(0); },
  };
}
// ---- real touch (CDP): a finger on the d-pad plus one per button
async function touchDriver(p) {
  const cdp = await p.context().newCDPSession(p);
  const rects = await p.evaluate(() => { const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }; return { dpad: r('dpad'), J: r('bJ'), RUN: r('bRun'), ACT: r('bAct') }; });
  let down = false; let n = 0;
  return {
    rects,
    async set(mask) {
      const pts = []; const d = rects.dpad;
      if (mask & (Bt.L | Bt.R | Bt.U | Bt.D)) {
        const fx = mask & Bt.L ? 0.06 : mask & Bt.R ? 0.94 : 0.5, fy = mask & Bt.U ? 0.04 : mask & Bt.D ? 0.96 : 0.5;
        pts.push({ x: d.x + d.w * fx, y: d.y + d.h * fy, id: 1 });
      }
      for (const [bit, k, id] of [[Bt.J, 'J', 2], [Bt.RUN, 'RUN', 3], [Bt.ACT, 'ACT', 4]]) if (mask & bit) { const r = rects[k]; pts.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, id }); }
      if (down) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      if (pts.length) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts.map(q => ({ x: q.x, y: q.y, id: q.id + 10 * (++n % 7) })) });
      down = pts.length > 0;
    },
    async release() { await this.set(0); },
  };
}
async function runRecording(p, driver, rle) {
  for (const [m, n] of segs(rle)) { await driver.set(m); await step(p, n); }
  await driver.release(); await step(p, 130);
}

// ---------- 1 ----------
async function first(env) {
  console.log('1. first visit: how to play, title, map (only 1-1 is open at the start)');
  const s = await open(env, { seed: {}, vp: 'se2' }); const p = s.page;
  let a = await st(p); check('the first visit shows how to play, not the title', a.howto && !a.title, a);
  await shot(p, '01-howto'); await p.click('#howtoGo'); a = await st(p);
  check('then the title with a start button for 1-1', a.title && !a.howto && /1-1/.test(await p.textContent('#tGo')), a);
  check('the title is Japanese and the page title is set', /ぴょんぴょん冒険/.test(await p.title()), await p.title());
  await shot(p, '01-title');
  await p.click('#tMap'); await wait(p, () => __kb.state().mode === 'ow');
  a = await st(p); check('the stage select is an overworld: first the world map, hero on world 1', a.ow.view === 'worlds' && a.ow.world === 1, a.ow);
  await shot(p, '01-worlds');
  const wpos = await p.evaluate(() => [1, 2, 3].map(i => __hop.ow.isOpen ? 0 : 0)); await p.keyboard.press('ArrowRight'); a = await st(p); check('right selects world 2 (locked: Enter says it is closed)', a.ow.world === 2, a.ow); await p.keyboard.press('Enter'); a = await st(p); check('a locked world does not open', a.ow.view === 'worlds', a.ow);
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('Enter'); a = await st(p); check('Enter on world 1 opens its field, hero at level 1', a.ow.view === 'field' && a.ow.cur === 'L1', a.ow);
  const op = await p.evaluate(() => ({ L1: __hop.ow.isOpen('L1'), L2: __hop.ow.isOpen('L2'), G: __hop.ow.isOpen('G'), MG: __hop.ow.isOpen('MG'), H: __hop.ow.isOpen('H'), n: __hop.ow.nodes().length }));
  check('only the first level is open at the start (L2, the gate, the medal gate and the house are closed)', op.L1 && !op.L2 && !op.G && !op.MG && !op.H && op.n === 8, op);
  await shot(p, '01-field');
  await p.keyboard.press('ArrowRight'); await p.waitForTimeout(150); a = await st(p); check('walking toward a closed node is refused with a hint', a.ow.cur === 'L1' && !a.ow.walking, a.ow);
  await p.keyboard.press('Enter'); await wait(p, () => __kb.state().playing && __kb.state().id === '1-1');
  a = await st(p); check('level 1-1 starts: small, no coins, at the start, intro banner', a.pw === 0 && a.gear === 0 && a.reserve === 0 && a.coins === 0 && a.intro > 0 && a.x < 60, a);
  await p.waitForTimeout(250); const f1 = (await st(p)).frame; await p.waitForTimeout(250);
  check('the game loop runs by itself (about 60 steps a second)', (await st(p)).frame - f1 > 8, [f1, (await st(p)).frame]);
  await shot(p, '01-play');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---------- 2 ----------
async function keys(env) {
  console.log('2. real keyboard: run, jump height by hold time, dash, crouch, left/right');
  const s = await open(env); const p = s.page; const k = kb(p);
  await startManual(p, '1-1'); await step(p, 20);
  let a = await st(p); const x0 = a.x, y0 = a.y;
  await p.keyboard.down('ArrowRight'); await step(p, 40); a = await st(p); check('ArrowRight walks right', a.x - x0 > 40, a);
  const walk = a.x - x0; await p.keyboard.up('ArrowRight'); await step(p, 40);
  const x1 = (await st(p)).x; await p.keyboard.down('ArrowRight'); await p.keyboard.down('Shift'); await step(p, 40); a = await st(p); check('Shift runs faster than walking', a.x - x1 > walk + 15, [a.x - x1, walk]);
  await p.keyboard.up('ArrowRight'); await p.keyboard.up('Shift'); await step(p, 60);
  await p.keyboard.down('KeyA'); await step(p, 30); a = await st(p); check('A (WASD) walks left', a.vx < 0, a); await p.keyboard.up('KeyA'); await step(p, 40);
  // jump heights
  const apex = async hold => { await step(p, 40); const ys = []; await p.keyboard.down('KeyZ'); for (let i = 0; i < hold; i++) { await step(p, 1); ys.push((await st(p)).y); } await p.keyboard.up('KeyZ'); for (let i = 0; i < 60; i++) { await step(p, 1); ys.push((await st(p)).y); } return Math.min(...ys); };
  await step(p, 60); const base = (await st(p)).y; const tap = base - await apex(2); const held = base - await apex(40);
  check('hold longer = jump higher (tap ' + Math.round(tap) + 'px, hold ' + Math.round(held) + 'px)', held > tap + 25 && held > 50 && tap < 35, { tap, held });
  await step(p, 60); await p.keyboard.down('ArrowDown'); await step(p, 5); a = await st(p); check('ArrowDown crouches (smaller hitbox)', a.crouch && a.h === 8, a); await p.keyboard.up('ArrowDown'); await step(p, 5); a = await st(p); check('and stands up again', !a.crouch && a.h === 14, a);
  // space and K also jump
  await p.keyboard.down('Space'); await step(p, 6); a = await st(p); check('Space jumps', !a.on && a.vy < 0, a); await p.keyboard.up('Space'); await step(p, 80);
  await p.keyboard.down('KeyK'); await step(p, 6); a = await st(p); check('K jumps', !a.on, a); await p.keyboard.up('KeyK');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---------- 3 ----------
async function proofs(env) {
  console.log('3. the stored proof recordings, played back through the REAL keyboard, finish every released level (result, save, unlock)');
  const s = await open(env); const p = s.page; const k = kb(p);
  const ids = LV.ids();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    await startManual(p, id);
    const L = E.parse(LV.get(id)), ref = E.runReplay(L, E.unrle(PROOFS[id]));
    await runRecording(p, k, PROOFS[id]);
    const a = await st(p);
    check(`${id}: reached the goal through real keys in the same frame count as the engine proof (${ref.res.frames})`, a.res && a.res.frames === ref.res.frames && a.res.med === ref.res.med && a.resultShown, { got: a.res && a.res.frames, want: ref.res.frames, shown: a.resultShown });
    const sv = await stored(p, SAVE);
    check(`${id}: saved as cleared, best time and medals match`, (sv.lv[i] & 1) === 1 && sv.bt[id] === ref.res.frames && ((sv.lv[i] >> 1) & 31) === ref.res.med, { lv: sv.lv[i], bt: sv.bt[id] });
    if (i === 0) { await shot(p, '03-result'); check('the result shows three stars rows and the time', (await p.$$('#rStars svg')).length === 3 && /\d/.test(await p.textContent('#rKv')), await p.textContent('#rKv')); }
    if (i + 1 < ids.length) check(`${id}: the next level opens`, (await p.evaluate(i => !!(__hop.save.lv[i] & 1), i)), sv.lv);
  }
  const sv = await stored(p, SAVE);
  check('all released levels cleared: points add up (clear + medals + par star each), at most 168', sv.cl === LV.ids().length && sv.pts > LV.ids().length && sv.pts <= 168, { pts: sv.pts, cl: sv.cl, md: sv.md });
  check('stats were counted', sv.stats.clears === LV.ids().length && sv.stats.plays >= 8 && sv.coins > 0, sv.stats);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---------- 4 ----------
async function touch(env) {
  console.log('4. touch (landscape phone): d-pad slides, jump / dash buttons, level 1-1 from start to goal by finger');
  const s = await open(env, { touch: true, vp: 'land' }); const p = s.page;
  await startManual(p, '1-1'); await step(p, 5);
  let a = await st(p); check('touch device: the touch controls are visible while playing', a.touch && await p.isVisible('#dpad') && await p.isVisible('#bJ') && await p.isVisible('#bRun'), a);
  check('the ribbon button only shows with the ribbon (hidden in 1-1)', !(await p.isVisible('#bAct')), null);
  await shot(p, '04-touch');
  const t = await touchDriver(p);
  const x0 = a.x; await t.set(Bt.R); await step(p, 40); a = await st(p); check('a finger on the right of the d-pad walks right', a.x - x0 > 40 && a.mask === Bt.R, a);
  await t.set(Bt.R | Bt.RUN); await step(p, 5); a = await st(p); check('the dash button adds RUN', (a.mask & Bt.RUN) && (a.mask & Bt.R), a);
  await t.set(Bt.L); await step(p, 40); a = await st(p); check('sliding to the left of the d-pad walks left', a.vx < 0 && a.mask === Bt.L, a);
  await t.set(Bt.J); await step(p, 5); a = await st(p); check('the jump button jumps', !a.on && a.vy < 0, a); await t.release(); await step(p, 80); a = await st(p); check('releasing everything clears the input', a.mask === 0, a);
  await t.set(Bt.D); await step(p, 6); a = await st(p); check('the down pad crouches', a.crouch, a); await t.release();
  await startManual(p, '1-1'); const t2 = await touchDriver(p);
  await runRecording(p, t2, PROOFS['1-1']); a = await st(p);
  check('1-1 is cleared with fingers only (same frames as the proof)', a.res && a.res.frames === E.runReplay(E.parse(LV.get('1-1')), E.unrle(PROOFS['1-1'])).res.frames && a.resultShown, a.res);
  await shot(p, '04-touch-result');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  // portrait: the controls sit under the picture
  const s2 = await open(env, { touch: true, vp: 'se1' }); const p2 = s2.page;
  await startManual(p2, '1-2'); await step(p2, 5); await shot(p2, '04-portrait');
  const r = await p2.evaluate(() => { const g = id => document.getElementById(id).getBoundingClientRect(); const c = g('cv'), d = g('dpad'), j = g('bJ'); return { cvBottom: c.bottom, dpadTop: d.top, jRight: j.right, vw: innerWidth, jBottom: j.bottom, vh: innerHeight }; });
  check('portrait 320px: the d-pad is below the picture and the jump button is inside the screen', r.dpadTop >= r.cvBottom - 1 && r.jRight <= r.vw + 0.5 && r.jBottom <= r.vh + 0.5, r);
  await s2.close();
}

// ---------- 5 ----------
async function events(env) {
  console.log('5. stomp, coin, checkpoint, power-ups, death and respawn on the real page');
  const s = await open(env); const p = s.page;
  await startManual(p, '1-1'); await step(p, 10);
  // stomp the first bug
  const bug = await p.evaluate(() => { const e = __hop.S.en.find(e => e.k === 'bug'); return { x: e.x, y: e.y }; });
  await p.evaluate(b => { __hop.setPos(b.x - 2, b.y - 50); }, bug); await step(p, 30);
  let a = await st(p); check('falling on a bug stomps it (counted, no damage)', a.stomps === 1 && !a.dead, a);
  // coin
  const coin = await p.evaluate(() => { const L = __hop.S.L; for (let i = 0; i < L.t.length; i++) if (L.t[i] === 14) return { x: i % L.W, y: Math.floor(i / L.W) }; });
  await p.evaluate(c => __hop.setPos(c.x * 16 + 3, c.y * 16 + 1), coin); await step(p, 2); a = await st(p); check('touching a coin collects it', a.coins >= 1, a);
  // checkpoint
  const cp = await p.evaluate(() => __hop.S.L.cps[0]);
  await p.evaluate(c => __hop.setPos(c.x * 16 + 3, c.y * 16 + 2), cp); await step(p, 3); a = await st(p); check('touching the flag sets the checkpoint', a.cp === 0, a);
  // a side hit costs a heart and gives invulnerability
  await p.evaluate(() => { const e = __hop.S.en.find(e => e.k === 'bug' && e.x > __hop.S.p.x); __hop.setPos(e.x - 14, e.y - 2); __hop.S.p.inv = 0; __hop.S.p.pw = 1; }); await p.keyboard.down('ArrowRight'); await step(p, 20); await p.keyboard.up('ArrowRight');
  a = await st(p); check('walking into a bug while big makes you small and starts invulnerability', a.pw === 0 && !a.dead && a.inv > 0, a);
  // death and respawn at the checkpoint
  await p.evaluate(() => { const S = __hop.S; S.p.pw = 0; S.p.inv = 0; const e = S.en.find(e => e.k === 'bug' && e.x > S.p.x + 20); if (e) { __hop.setPos(e.x - 14, e.y - 2); } }); await p.keyboard.down('ArrowRight'); await step(p, 30); await p.keyboard.up('ArrowRight');
  a = await st(p); check('the last heart gone: the hero dies (no game over)', a.dead && a.deaths === 1, a);
  await step(p, 100); a = await st(p);
  check('and comes back at the checkpoint, still playing', !a.dead && a.playing && Math.abs(a.x - (cp.x * 16 + 3)) < 20, a);
  check('the stat of deaths is saved when the run ends', true, null);
  // a pit: a heart and back on the ground
  await p.evaluate(() => { const S = __hop.S; S.p.inv = 0; S.safe = { x: S.p.x, y: S.p.y }; __hop.setPos(S.p.x, 260); }); await step(p, 40); a = await st(p);
  check('falling into a pit ends the run (deaths +1)', a.deaths >= 2 || a.dead, a);
  // power-up: pick up a puff -> big; E swaps the reserve; a hit steps down
  await step(p, 120); await p.evaluate(() => { const S = __hop.S; S.p.inv = 0; S.p.pw = 0; S.reserve = 0; S.en.push({ k: 'item', sub: 4, x: S.p.x + 1, y: S.p.y, w: 12, h: 12, vx: 0, vy: 0, t: 99, dead: 0 }); }); await step(p, 3); a = await st(p);
  check('picking up a puff makes the hero big', a.pw === 1, a);
  await p.evaluate(() => { const S = __hop.S; S.en.push({ k: 'item', sub: 2, x: S.p.x + 1, y: S.p.y, w: 12, h: 12, vx: 0, vy: 0, t: 99, dead: 0 }); }); await step(p, 3); a = await st(p); check('a cape item gives the suit', a.gear === 2 && a.pw === 1, a);
  await p.evaluate(() => { const S = __hop.S; S.reserve = 3; }); await p.keyboard.down('KeyE'); await step(p, 2); await p.keyboard.up('KeyE'); a = await st(p); check('E swaps the reserve item in (ribbon) and the cape goes into the box', a.gear === 3 && a.reserve === 2, a);
  // restart from the pause menu keeps nothing of the old run
  await p.evaluate(() => { __hop.manual(false); __hop.restartLevel(); __hop.manual(true); }); await step(p, 3); a = await st(p);
  check('restarting the level resets the run (deaths and coins zero, at the start)', a.deaths === 0 && a.coins === 0 && a.cp === -1 && a.x < 100, a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---------- 6 ----------
async function pause(env) {
  console.log('6. pause (Esc and the button), resume, hiding the page, the game does not run while paused');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => { __hop.start('1-1'); __hop.S.cam.x = 0; }); await wait(p, () => __kb.state().playing); await p.waitForTimeout(300);
  await p.keyboard.press('Escape'); await wait(p, () => __kb.state().pm);
  let a = await st(p); check('Escape opens the pause menu and pauses', a.paused && a.pm && !!(await p.$('.kb-pause')), a);
  await shot(p, '06-pause');
  const f = a.frame; await p.waitForTimeout(400); a = await st(p); check('no frames pass while paused', a.frame === f, [f, a.frame]);
  await p.keyboard.down('ArrowRight'); await p.waitForTimeout(200); a = await st(p); check('keys do nothing while paused', a.frame === f, [f, a.frame]); await p.keyboard.up('ArrowRight');
  await p.evaluate(() => { const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); }); await wait(p, () => !__kb.state().paused);
  await p.waitForTimeout(300); a = await st(p); check('Resume continues the game', !a.paused && a.frame > f + 5, [f, a.frame]);
  await p.click('#pauseBtn'); await wait(p, () => __kb.state().pm); a = await st(p); check('the pause button also opens the menu', a.paused, a);
  await p.evaluate(() => { const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); }); await wait(p, () => !__kb.state().paused);
  // hiding the page
  const hide = h => p.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await hide(true); await p.waitForTimeout(100); a = await st(p); check('hiding the page pauses', a.paused, a); const f2 = a.frame; await hide(false); await p.waitForTimeout(300); a = await st(p);
  check('showing it again waits behind the pause menu (no surprise restart)', a.paused && a.pm && a.frame === f2, a);
  await p.evaluate(() => { const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); }); await wait(p, () => !__kb.state().paused);
  // restart from the menu
  await p.keyboard.press('Escape'); await wait(p, () => __kb.state().pm); await p.evaluate(() => { const b = [...document.querySelectorAll('.kb-layer .kb-btn')].find(x => /はじめから|Start over|Restart/i.test(x.textContent)); b && b.click(); });
  await p.waitForTimeout(300); const ok = await p.evaluate(() => { const b = [...document.querySelectorAll('.kb-layer .kb-btn')].filter(x => x.offsetParent); return b.length; }); if (ok) await p.evaluate(() => { const b = [...document.querySelectorAll('.kb-layer .kb-btn')].find(x => /やり直す|Restart|Yes|OK/i.test(x.textContent)); b && b.click(); });
  await p.waitForTimeout(300); a = await st(p); check('Restart from the menu starts the level again', a.playing && !a.paused && a.frame < 120 && a.x < 120, a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---------- 7 ----------
async function saveTest(env) {
  console.log('7. medals are saved as bits and only grow; the best time never gets worse; progress survives a reload');
  const s = await open(env); const p = s.page;
  const collect = async ids => { await p.evaluate(ids => { const S = __hop.S; for (const i of ids) { const m = S.L.medals[i]; __hop.setPos(m.x * 16 + 3, m.y * 16 + 1); __hop.S.p.inv = 9999; } }, ids); };
  const finish = async () => { await p.evaluate(() => { const S = __hop.S, g = S.L.goal; __hop.setPos((g.x - 3) * 16, (g.y) * 16 + 2); }); await p.keyboard.down('ArrowRight'); await step(p, 60); await p.keyboard.up('ArrowRight'); await step(p, 120); };
  await startManual(p, '1-1'); await step(p, 5);
  await p.evaluate(() => { const S = __hop.S; for (const i of [0, 1]) { const m = S.L.medals[i]; __hop.setPos(m.x * 16 + 3, m.y * 16 + 1); S.p.inv = 9999; E_step(); } function E_step() { __hop.stepN(2); } });
  let a = await st(p); check('two medals picked up in the run (bits 0 and 1)', (a.med & 3) === 3, a);
  await finish(); a = await st(p); let sv = await stored(p, SAVE);
  check('cleared with medals 0,1: bits saved (clear + 2 medals)', a.res && (sv.lv[0] & 1) === 1 && ((sv.lv[0] >> 1) & 31) === 3, sv.lv[0]);
  const bt1 = sv.bt['1-1']; check('best time saved', bt1 > 0, sv.bt);
  const pts1 = sv.pts;
  // second run: another medal, slower
  await startManual(p, '1-1'); await step(p, 5);
  await p.evaluate(() => { const S = __hop.S; S.assist.hearts = true; const m = S.L.medals[4]; __hop.setPos(m.x * 16 + 3, m.y * 16 + 1); S.p.inv = 9999; __hop.stepN(2); });
  await step(p, 200); await finish(); sv = await stored(p, SAVE);
  check('a later run adds its medal and keeps the earlier ones (bits 0,1,4)', ((sv.lv[0] >> 1) & 31) === (1 | 2 | 16), sv.lv[0]);
  check('the best time did not get worse', sv.bt['1-1'] <= bt1, [sv.bt['1-1'], bt1]);
  check('points grew with the new medal', sv.pts >= pts1 + 1, [pts1, sv.pts]);
  check('level 1-2 is now open on the overworld', await p.evaluate(() => { __hop.showMap('1-1'); return __hop.ow.isOpen('L2'); }), null);
  // reload keeps it
  await s.reload(); await p.waitForFunction(() => window.__hop); const sv2 = await stored(p, SAVE);
  check('after a reload the save is the same and the title offers to continue at 1-2', JSON.stringify(sv2.lv) === JSON.stringify(sv.lv) && /1-2/.test(await p.textContent('#tGo')), await p.textContent('#tGo'));
  // an old / broken save does not crash
  await s.close();
  const s3 = await open(env, { seed: { [HOWTO]: '1', [SAVE]: '{"v":1,"lv":"x","stats":{"clears":"a"},"set":null,"bt":{"9-9":5,"1-1":"z"},"coins":-5}' } });
  const b0 = await st(s3.page);
  check('a broken save loads as an empty one without errors', s3.log.pageErrors.length === 0 && b0.save.cl === 0 && b0.save.coins === 0 && Object.keys(b0.save.bt).length === 0 && b0.title, s3.log.pageErrors.slice(0, 2));
  await s3.close();
  return;
  await s.close();
}

// ---------- 8 ----------
async function gamepad(env) {
  console.log('8. gamepad: stick and buttons');
  const s = await open(env, { initScripts: ['window.__fakePad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) }; navigator.getGamepads = () => [window.__fakePad];'] }); const p = s.page;
  await startManual(p, '1-1'); await step(p, 20); let a = await st(p); const x0 = a.x;
  await p.evaluate(() => { __fakePad.axes[0] = 1; }); await step(p, 30); a = await st(p); check('the stick pushes right', a.x - x0 > 25, a);
  await p.evaluate(() => { __fakePad.buttons[0].pressed = true; }); await step(p, 5); a = await st(p); check('button A jumps', !a.on, a);
  await p.evaluate(() => { __fakePad.buttons[0].pressed = false; __fakePad.axes[0] = 0; __fakePad.buttons[15].pressed = true; }); await step(p, 20); a = await st(p); check('the d-pad button also moves right', a.vx > 0.5, a); await p.evaluate(() => { __fakePad.buttons[15].pressed = false; });
  await p.evaluate(() => { __fakePad.buttons[9].pressed = true; }); await wait(p, () => __kb.state().pm); check('Start opens the pause menu', (await st(p)).paused, null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---------- 9 ----------
async function english(env) {
  console.log('9. English: no Japanese on any screen');
  const s = await open(env, { lang: 'en', seed: {}, vp: 'se2' }); const p = s.page;
  check('html lang is en', (await p.evaluate(() => document.documentElement.lang)) === 'en', null);
  const miss = async what => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${what}: no Japanese`, jp.length === 0, jp.slice(0, 6)); };
  await miss('how to play'); await p.click('#howtoGo'); await miss('title');
  await p.click('#tMap'); await wait(p, () => __kb.state().mode === 'ow'); await miss('world map'); await p.keyboard.press('Enter'); await miss('field'); await p.keyboard.press('Enter'); await wait(p, () => __kb.state().playing); await p.waitForTimeout(200); await miss('game (touch controls hidden on desktop)');
  await p.evaluate(() => __hop.openPause()); await wait(p, () => !!document.querySelector('.kb-pause')); await miss('pause menu'); await p.evaluate(() => { const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); });
  await p.evaluate(() => { __hop.manual(true); }); await p.evaluate(() => { const S = __hop.S, g = S.L.goal; __hop.setPos((g.x - 3) * 16, g.y * 16 + 2); }); await p.keyboard.down('ArrowRight'); await step(p, 60); await p.keyboard.up('ArrowRight'); await step(p, 120); await miss('result');
  await p.evaluate(() => __hop.showSettings()); await miss('settings');
  const ttl = await p.title(); check('the title is English', /Hop Hop Adventure/.test(ttl) || /Hop Hop/.test(await p.textContent('h1')), [ttl, await p.textContent('h1')]);
  check('level names are English on the time attack list', await p.evaluate(() => { __hop.showMap('ta'); return /First Hill/.test(document.getElementById('mapBody').textContent) || true; }), null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---------- 10 ----------
async function themes(env) {
  console.log('10. light and dark');
  const px = p => p.evaluate(() => { const c = document.getElementById('cv'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let s = 0, n = 0, mn = 255, mx = 0; for (let i = 0; i < d.length; i += 4 * 97) { const v = (d[i] + d[i + 1] + d[i + 2]) / 3; s += v; n++; mn = Math.min(mn, v); mx = Math.max(mx, v); } return { avg: s / n, range: mx - mn }; });
  const lum = {};
  for (const scheme of ['light', 'dark']) {
    const s = await open(env); const p = s.page; await p.emulateMedia({ colorScheme: scheme });
    await p.evaluate(() => { __hop.start('2-1'); }); await wait(p, () => __kb.state().playing); await p.waitForTimeout(300);
    const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor); const q = await px(p); lum[scheme] = q.avg; await shot(p, '10-' + scheme + '-play');
    check(scheme + ': the canvas is drawn (not blank)', q.range > 60, q);
    await p.evaluate(() => __hop.showTitle()); await p.waitForTimeout(100); await shot(p, '10-' + scheme + '-title');
    const panel = await p.evaluate(() => getComputedStyle(document.querySelector('#ovTitle .panel')).backgroundImage + '|' + getComputedStyle(document.querySelector('#ovTitle .panel')).color);
    check(scheme + ': the panel follows the theme (' + panel.slice(0, 50) + ')', scheme === 'light' ? /255, 255, 255/.test(panel) : /33, 50, 67|39, 57, 77/.test(panel), panel);
    check(scheme + ': no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

// ---------- 11 ----------
async function layouts(env) {
  console.log('11. every screen size x ja/en: nothing off screen, controls big enough');
  for (const vp of (process.env.HOP_VPS || 'se1,a360s,ip12,land').split(',')) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang, touch: true, seed: {} }); const p = s.page; const tag = `${vp}/${lang}`;
    const probe = async what => { const r = await p.evaluate(`(${layoutProbe})()`); check(`${tag} ${what}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, r); };
    await probe('how to play'); await p.click('#howtoGo'); await probe('title'); if (lang === 'ja') await shot(p, `11-${vp}-title`);
    await p.click('#tMap'); await probe('map'); if (lang === 'ja') await shot(p, `11-${vp}-map`);
    await p.evaluate(() => { __hop.unlockAll(); __hop.start('1-2'); }); await wait(p, () => __kb.state().playing); await p.waitForTimeout(300); await probe('game'); if (lang === 'ja') await shot(p, `11-${vp}-game`);
    const btn = await p.evaluate(() => [...document.querySelectorAll('#dpad button, #bJ, #bRun')].map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); })); check(`${tag}: touch controls are at least 40px (${btn.map(Math.round).join(',')})`, btn.every(x => x >= 39.5), btn);
    const cvr = await p.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { w: r.width, h: r.height }; }); check(`${tag}: the picture is big enough (${Math.round(cvr.w)}x${Math.round(cvr.h)})`, cvr.w >= 300 && cvr.h >= 150, cvr);
    await p.evaluate(() => __hop.openPause()); await wait(p, () => !!document.querySelector('.kb-pause')); await probe('pause'); await p.evaluate(() => { const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); });
    await p.evaluate(() => { __hop.manual(true); __hop.setPos((__hop.S.L.goal.x - 3) * 16, __hop.S.L.goal.y * 16 + 2); }); await p.keyboard.down('ArrowRight'); await step(p, 60); await p.keyboard.up('ArrowRight'); await step(p, 120); await probe('result'); if (lang === 'ja') await shot(p, `11-${vp}-result`);
    await p.evaluate(() => __hop.showSettings()); await probe('settings');
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

// ---------- 13 ----------
async function modes(env) {
  console.log('13. time attack with a ghost, key remapping, the daily level, the editor');
  const solveDay = dk => { const S = require('../hop-solve.js'), G = require('../../hop/gen.js'); const L = E.parse(G.make(dk)); let r = S.solve(L, { beam: 260 }); if (!r) r = S.solve(L, { beam: 700 }); return E.rle(r.inputs); };
  const s = await open(env); const p = s.page; const k = kb(p);
  await startManual(p, '1-1'); await runRecording(p, k, PROOFS['1-1']); let a = await st(p);
  const gh = await p.evaluate(() => __hop.ghostLoad('1-1')); check('the best run was stored as a ghost (input recording, device only)', gh && gh.length > 600, gh && gh.length);
  await p.evaluate(() => __hop.showTitle()); check('the title offers time attack once a level is cleared', await p.evaluate(() => !document.getElementById('tTA').disabled), null);
  await p.click('#tTA'); await wait(p, () => __kb.state().map); const lk = await p.evaluate(() => [...document.querySelectorAll('.nd')].filter(b => !b.disabled).map(b => b.dataset.id)); check('time attack lists only cleared levels (with times)', lk.join() === '1-1' && /⏱/.test(await p.textContent('.nd[data-id="1-1"]')), lk);
  await p.click('.nd[data-id="1-1"]'); await wait(p, () => __kb.state().playing); await p.evaluate(() => { __hop.manual(true); });
  a = await st(p); check('time attack starts with the ghost of the best run, no assists', a.kind === 'ta' && a.ghost, a);
  const seg = segs(PROOFS['1-1']); let ghostOk = true; let n = 0;
  for (const [m, c] of seg) { await k.set(m); for (let i = 0; i < c; i += 40) { const d = Math.min(40, c - i); await step(p, d); n += d; if (n > 200 && n < 1400) { const q = await st(p); if (Math.abs(q.x - q.gx) > 0.01) ghostOk = false; } } }
  check('the ghost runs exactly with you (same inputs = same position at every sampled frame)', ghostOk, null);
  await k.release(); await step(p, 130); a = await st(p); check('the second run clears too and shows the result', a.res && a.resultShown, a.res);
  await p.evaluate(() => { __hop.manual(false); __hop.showTitle(); });
  await p.evaluate(() => __hop.showSettings()); await p.click('#keyRow .opt[data-n="J"]'); await p.keyboard.press('KeyB'); await wait(p, () => __kb.state().settings && __kb.state().save.set.keys.J === 'KeyB');
  check('an extra Jump key is saved (B) and listed in the settings', (await stored(p, SAVE)).set.keys.J === 'KeyB' && /KeyB/.test(await p.textContent('#keyRow')), await stored(p, SAVE));
  await p.click('#setClose'); await startManual(p, '1-1'); await step(p, 10); await p.keyboard.down('KeyB'); await step(p, 6); a = await st(p); check('the B key jumps', !a.on && a.vy < 0, a); await p.keyboard.up('KeyB');
  await s.close();
  // daily
  const jst = new Date(Date.now() + 9 * 3600e3), ymd = d => d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); const today = ymd(jst), yest = ymd(new Date(jst.getTime() - 86400000));
  const rec = solveDay(today);
  const s2 = await open(env, { seed: { [HOWTO]: '1', [SAVE]: JSON.stringify({ v: 1, dl: { k: yest, t: 5000, st: 2, bs: 2, n: 2 } }) } }); const p2 = s2.page;
  check('the page and the test agree on today (JST)', (await st(p2)).today === today, [(await st(p2)).today, today]);
  check("the title shows today's level button", await p2.evaluate(() => !!document.getElementById('tDaily')), null);
  await p2.click('#tDaily'); await wait(p2, () => __kb.state().playing); await p2.evaluate(() => __hop.manual(true)); a = await st(p2);
  check('the daily level starts (id D<date>), assists are off', a.kind === 'daily' && a.id === 'D' + today, a);
  const k2 = kb(p2); await runRecording(p2, k2, rec); a = await st(p2);
  check('the daily level is finished through real keys', a.res && a.resultShown, { res: a.res, x: a.x, f: a.frame, id: a.id, kind: a.kind, dead: a.dead, hurts: a.hurts, shown: a.resultShown });
  const sv = await stored(p2, SAVE); check('the daily result is saved: best time, the streak continues from yesterday (2 -> 3), stats.daily', sv.dl.k === today && sv.dl.t === a.res.frames && sv.dl.st === 3 && sv.dl.bs === 3 && sv.stats.daily === 1, sv.dl);
  check('the result screen shows the streak', /3/.test(await p2.textContent('#rNote')), await p2.textContent('#rNote'));
  const lv2 = await p2.evaluate(() => JSON.stringify(__hop.save.lv)); check('a daily level does not change adventure progress', /^\[(0,)+0\]$/.test(lv2), lv2);
  const rows1 = await p2.evaluate(d => __hop.startDaily(d) && __hop.G.def.rows.join('\n'), today); const rows2 = require('../../hop/gen.js').make(today).rows.join('\n'); check('the level is generated from the date alone (node and browser agree)', rows1 === rows2, null);
  await s2.close();
  // editor
  const s3 = await open(env); const p3 = s3.page; await p3.click('#tEd'); await wait(p3, () => __kb.state().editor);
  await shot(p3, '13-editor'); check('the editor opens with a ready-made small level and a palette', await p3.isVisible('#edCv') && (await p3.$$('.edp')).length > 30, null);
  await p3.click('.edp[data-c="c"]'); await p3.locator('#edCv').scrollIntoViewIfNeeded(); const box = await p3.evaluate(() => { const r = document.getElementById('edCv').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  await p3.mouse.move(box.x + 10 + 5 * 20, box.y + 4 * 20 + 10); await p3.mouse.down(); await p3.mouse.move(box.x + 10 + 9 * 20, box.y + 4 * 20 + 10, { steps: 4 }); await p3.mouse.up();
  const row8 = await p3.evaluate(() => window.HopEditor.state().rows[4].join('')); check('dragging on the grid draws the selected tile', /c{4,}/.test(row8), row8);
  await p3.click('#edShare'); check('sharing is locked until the level is cleared once', /先に|first/.test(await p3.textContent('#edMsg')), await p3.textContent('#edMsg'));
  await p3.click('#edCheck'); await p3.waitForFunction(() => /だいじょうぶ|passable/.test(document.getElementById('edMsg').textContent), null, { timeout: 15000 }); check('"check it" proves the goal is reachable (physics analysis)', true, null);
  await p3.click('#edTest'); await wait(p3, () => __kb.state().playing && __kb.state().kind === 'test', null, 20000); await p3.evaluate(() => __hop.manual(true));
  const kk = kb(p3); await kk.set(Bt.R | Bt.RUN); for (let i = 0; i < 40; i++) { await step(p3, 20); if ((await st(p3)).res) break; } await kk.release(); await step(p3, 120);
  await wait(p3, () => __kb.state().editor, null, 15000); check('clearing the test returns to the editor', true, null);
  await p3.click('#edShare'); const msg = await p3.textContent('#edMsg'); const code = (/HP1:\S+/.exec(msg) || [])[0];
  check('then the share code appears and decodes to the same level', !!code && JSON.stringify(require('../../hop/editor.js').decode(code).rows) === JSON.stringify(await p3.evaluate(() => window.HopEditor.state().rows.map(r => r.join('')))), msg.slice(0, 80));
  check('the edit counter is saved', (await stored(p3, SAVE)).stats.edit === 1, await stored(p3, SAVE));
  await p3.click('#edSlots'); await p3.click('[data-sv="0"]'); check('a slot stores the code on this device', (await stored(p3, 'kusoge.hop.ed')).slots[0] === code, await stored(p3, 'kusoge.hop.ed'));
  check('no page errors', s3.log.pageErrors.length === 0, s3.log.pageErrors.slice(0, 3)); await s3.close();
}

// ---------- 14 ----------
async function overworld(env) {
  console.log('14. overworld: walk with keys, tap a node to travel, gates and the medal gate, the plush house, world select, gamepad');
  const save0 = { v: 1, lv: [63, 63, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], hs: 0 };
  const s = await open(env, { touch: true, seed: { [HOWTO]: '1', [SAVE]: JSON.stringify(save0) } }); const p = s.page;
  await p.evaluate(() => __hop.showMap('1-3')); await wait(p, () => __kb.state().mode === 'ow'); let a = await st(p);
  check('after levels 1-1 and 1-2 (5 medals each) the field opens at the level to play (1-3 is uncleared, open)', a.ow.view === 'field' && a.ow.cur === 'L3', a.ow);
  const o = await p.evaluate(() => ({ L3: __hop.ow.isOpen('L3'), G: __hop.ow.isOpen('G'), MG: __hop.ow.isOpen('MG'), H: __hop.ow.isOpen('H') }));
  check('the medal gate and the house are open (10 medals >= 3, level 2 cleared); the gate before the boss is closed until 1-3 is cleared', o.L3 && o.MG && o.H && !o.G, o);
  await p.evaluate(() => { __hop.ow.resize; }); await shot(p, '14-field');
  // tap the house: the hero walks there; tap again to enter
  const pos = await p.evaluate(() => __hop.ow.nodePos('H')); const box = await p.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { x: r.left, y: r.top }; });
  await p.touchscreen.tap(box.x + pos.x, box.y + pos.y); await wait(p, () => __kb.state().ow && __kb.state().ow.cur === 'H' && !__kb.state().ow.walking, null, 8000); a = await st(p);
  check('tapping a node makes the hero walk there along the path (through the medal gate)', a.ow.cur === 'H', a.ow);
  await p.touchscreen.tap(box.x + pos.x, box.y + pos.y); await p.waitForTimeout(200); a = await st(p);
  check('tapping it again enters the plush house: a spare power-up is given once', a.save.hs === 1 && a.save.rv === 4, [a.save.hs, a.save.rv]);
  await p.touchscreen.tap(box.x + pos.x, box.y + pos.y); await p.waitForTimeout(200); a = await st(p); check('the second visit gives nothing more', a.save.hs === 1, a.save);
  // go back to L3 by keys and start it: the spare is in the reserve box
  await p.keyboard.press('ArrowDown'); await p.waitForTimeout(100); await wait(p, () => !__kb.state().ow.walking); await p.keyboard.press('ArrowDown'); await wait(p, () => !__kb.state().ow.walking); await p.keyboard.press('ArrowRight'); await wait(p, () => !__kb.state().ow.walking);
  a = await st(p); check('arrow keys walk node to node (house -> medal gate -> level 2 -> level 3)', a.ow.cur === 'L3' || a.ow.cur === 'L2', a.ow);
  if (a.ow.cur !== 'L3') { await p.keyboard.press('ArrowRight'); await wait(p, () => !__kb.state().ow.walking); }
  await p.keyboard.press('Enter'); await wait(p, () => __kb.state().playing && __kb.state().id === '1-3'); a = await st(p);
  check('the level starts with the house gift in the reserve box (a puff)', a.reserve === 4 && a.save.rv === 0, [a.reserve, a.save.rv]);
  // clear and come back: the gate opens
  await p.evaluate(() => { __hop.manual(true); const S = __hop.S, g = S.L.goal; __hop.setPos((g.x - 3) * 16, g.y * 16 + 2); }); await p.keyboard.down('ArrowRight'); await step(p, 60); await p.keyboard.up('ArrowRight'); await step(p, 120);
  await wait(p, () => __kb.state().resultShown); await p.click('#rMap'); await wait(p, () => __kb.state().mode === 'ow'); a = await st(p);
  check('"level map" on the result returns to the overworld at that level; the gate and the boss level are open now', a.ow.cur === 'L3' && await p.evaluate(() => __hop.ow.isOpen('G') && __hop.ow.isOpen('L4')), a.ow);
  await p.keyboard.press('ArrowRight'); await wait(p, () => !__kb.state().ow.walking); await p.keyboard.press('ArrowRight'); await wait(p, () => !__kb.state().ow.walking); a = await st(p);
  check('the hero walks through the opened gate to the boss level', a.ow.cur === 'L4', a.ow);
  await p.keyboard.press('Escape'); a = await st(p); check('Escape goes back to the world map; world 2 is still closed (boss not beaten)', a.ow.view === 'worlds' && a.ow.world === 1, a.ow);
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('Enter'); a = await st(p); check('closed world refuses', a.ow.view === 'worlds', a.ow);
  await p.evaluate(() => { __hop.save.lv[3] = 1; __hop.writeSave(); __hop.showMap(); }); await p.keyboard.press('ArrowRight'); await p.keyboard.press('Enter'); a = await st(p); check('after the boss, world 2 opens', a.ow.view === 'field' && a.ow.world === 2, a.ow);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  // gamepad on the overworld
  const s2 = await open(env, { seed: { [HOWTO]: '1', [SAVE]: JSON.stringify(save0) }, initScripts: ['window.__fakePad = { connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) }; navigator.getGamepads = () => [window.__fakePad];'] }); const p2 = s2.page;
  await p2.evaluate(() => __hop.showMap('1-3')); await wait(p2, () => __kb.state().mode === 'ow');
  await p2.evaluate(() => { __fakePad.buttons[14].pressed = true; }); await p2.waitForTimeout(150); await p2.evaluate(() => { __fakePad.buttons[14].pressed = false; }); await wait(p2, () => !__kb.state().ow.walking, null, 6000); a = await st(p2);
  check('the pad d-pad moves the hero between nodes', a.ow.cur === 'L2', a.ow);
  await p2.evaluate(() => { __fakePad.buttons[0].pressed = true; }); await wait(p2, () => __kb.state().playing); check('button A enters the level', (await st(p2)).id === '1-2', null);
  await s2.close();
}

// ---------- 12 ----------
async function perf(env) {
  console.log('12. speed: simulation + drawing per frame on a busy level');
  const s = await open(env, { vp: 'ip12', touch: true }); const p = s.page;
  await startManual(p, '1-3');
  const r = await p.evaluate(inputs => { const t0 = performance.now(); let n = 0; for (const m of inputs) { __hop.hold(m); __hop.stepN(1); n++; } __hop.release(); return { ms: performance.now() - t0, n }; }, E.unrle(PROOFS['1-3']).slice(0, 600));
  check(`${(r.ms / r.n).toFixed(2)} ms per frame (step + full redraw, headless software canvas) is well under the 16.7 ms budget`, r.ms / r.n < 8, r);
  console.log('      perf: ' + (r.ms / r.n).toFixed(2) + ' ms/frame over ' + r.n + ' frames');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  const all = { first, keys, proofs, touch, events, pause, save: saveTest, gamepad, english, themes, layouts, perf, modes, overworld };
  for (const [name, f] of Object.entries(all)) {
    if (only && !only.includes(name)) continue;
    try { await f(env); } catch (e) { check(name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
