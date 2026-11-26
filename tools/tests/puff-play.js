#!/usr/bin/env node
// ふわふわぱふの通しプレイ（Playwright）。キーボードもタッチもゲームパッドも本物の入力。?debug の window.__kb / __puff は状態を読む・
// 「手動の刻み」（__puff.manual(true) → __puff.stepN(n)：ループは止まり、n フレームだけ今の本物の入力状態で進める）のためだけに使う。
//   node tools/tests/puff-play.js [first,keys,abilities,proofs,touch,coop,pause,save,gamepad,english,orient,layouts,perf]
// 1. 初回のあそびかた→タイトル→ちず（1-1だけ開いている）  2. 本物のキーで走る・ジャンプの高さ・ふわっと6回  3. すいこむ→のむ→わざ・はく・すてる（本物のキー）
// 4. 保存した証明の入力を本物のキーで再生して全ステージをメダル3つ＋ゴールまで  5. タッチ（スティック・ボタン、横画面と縦画面）  6. ふたりプレイ
// 7. 一時停止・つづける・画面を隠す  8. 保存（クリア・メダル・見つけたわざ）と再読み込み  9. ゲームパッド  10. 英語  11. 画面のむき  12. 画面サイズ×ja/en
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const E = require('../../puff/engine.js');
const LV = require('../../puff/levels.js');
const PROOFS = require('../../puff/proofs.js');

const OUT = path.join(__dirname, 'out', 'shots', 'puff-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.puff.save', HOWTO = 'kusoge.puff.howto', ORI = 'kusoge.puff.ori';
const Bt = E.B;
const KEYS = [[Bt.L, 'ArrowLeft'], [Bt.R, 'ArrowRight'], [Bt.U, 'ArrowUp'], [Bt.D, 'ArrowDown'], [Bt.J, 'KeyZ'], [Bt.ACT, 'KeyX'], [Bt.SW, 'KeyC']];
const popc = n => { let c = 0; while (n) { c += n & 1; n >>>= 1; } return c; };

async function open(env, o = {}) {
  const touch = !!o.touch;
  const s = await B.newSession(env, { vp: V.pick(o.vp || 'land')[0], lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: touch, hasTouch: touch, initScripts: o.initScripts });
  await s.goto('/puff/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__puff);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 8000 });
const startManual = async (p, id, extra) => { await p.evaluate(([id, extra]) => { __puff.unlockAll(); __puff.start(id); __puff.manual(true); __puff.S.cam.x = 0; if (extra && extra.two) { /* set before start */ } }, [id, extra || null]); await wait(p, id => __kb.state().id === id && __kb.state().playing, id); };
const step = (p, n) => p.evaluate(n => __puff.stepN(n), n);
const tapKey = async (p, code, n) => { await p.keyboard.down(code); await step(p, n || 2); await p.keyboard.up(code); await step(p, 1); };
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
// ---- real touch (CDP): one finger on the stick plus one per button
async function touchDriver(p) {
  const cdp = await p.context().newCDPSession(p);
  const rects = await p.evaluate(() => { const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }; return { stick: r('stick'), J: r('bJ'), ACT: r('bA'), SW: r('bS') }; });
  let down = false; let n = 0;
  return {
    rects,
    async set(mask) {
      const pts = []; const d = rects.stick;
      if (mask & (Bt.L | Bt.R | Bt.U | Bt.D)) {
        const fx = mask & Bt.L ? 0.06 : mask & Bt.R ? 0.94 : 0.5, fy = mask & Bt.U ? 0.04 : mask & Bt.D ? 0.96 : 0.5;
        pts.push({ x: d.x + d.w * fx, y: d.y + d.h * fy, id: 1 });
      }
      for (const [bit, k, id] of [[Bt.J, 'J', 2], [Bt.ACT, 'ACT', 3], [Bt.SW, 'SW', 4]]) if (mask & bit) { const r = rects[k]; pts.push({ x: r.x + r.w / 2, y: r.y + r.h / 2, id }); }
      if (down) await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
      if (pts.length) await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: pts.map(q => ({ x: q.x, y: q.y, id: q.id + 10 * (++n % 7) })) });
      down = pts.length > 0;
    },
    async release() { await this.set(0); },
  };
}
async function runRecording(p, driver, rle, tail) {
  for (const [m, n] of segs(rle)) { await driver.set(m); await step(p, n); }
  await driver.release(); await step(p, tail === undefined ? 140 : tail);
}

// ---------- 1 ----------
async function first(env) {
  console.log('1. first visit: how to play, title, map (only 1-1 is open at the start)');
  const s = await open(env, { seed: {}, vp: 'se2' }); const p = s.page;
  let a = await st(p); check('the first visit shows how to play, not the title', a.howto && !a.title, a);
  await shot(p, '01-howto'); await p.click('#howtoGo'); a = await st(p);
  check('then the title with a start button for 1-1', a.title && !a.howto && /1-1/.test(await p.textContent('#tGo')), a);
  check('the page title is set', /ふわふわぱふ/.test(await p.title()), await p.title());
  await shot(p, '01-title');
  await p.click('#tMap'); await wait(p, () => __kb.state().mode === 'ow'); a = await st(p);
  check('the stage select is the hub map, hero on 1-1', a.ow && a.owCur === 0, a);
  await shot(p, '01-map');
  await p.keyboard.press('ArrowRight'); a = await st(p); check('right selects 1-2', a.owCur === 1, a);
  await p.keyboard.press('Enter'); await p.waitForTimeout(150); a = await st(p); check('1-2 is locked: Enter refuses and stays on the map', a.ow && !a.playing, a);
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('Enter'); await wait(p, () => __kb.state().playing && __kb.state().id === '1-1');
  a = await st(p); check('1-1 starts at the start with full hearts, no ability', a.hp === 6 && a.ab === null && a.stars === 0 && a.x < 80, a);
  await p.waitForTimeout(300); const f1 = (await st(p)).frame; await p.waitForTimeout(300);
  check('the game loop runs by itself (about 60 steps a second)', (await st(p)).frame - f1 > 8, [f1, (await st(p)).frame]);
  await shot(p, '01-play');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---------- 2 ----------
async function keys(env) {
  console.log('2. real keyboard: walk, jump height by hold time, six floats, puffed fall');
  const s = await open(env); const p = s.page;
  await startManual(p, '1-1'); await step(p, 20);
  let a = await st(p); const x0 = a.x;
  await p.keyboard.down('ArrowRight'); await step(p, 40); a = await st(p); check('ArrowRight walks right', a.x - x0 > 40, a);
  await p.keyboard.up('ArrowRight'); await step(p, 40);
  await p.keyboard.down('KeyA'); await step(p, 30); a = await st(p); check('A (WASD) walks left', a.vx < 0, a); await p.keyboard.up('KeyA'); await step(p, 40);
  const apex = async hold => { await step(p, 40); const y0 = (await st(p)).y; let top = y0; await p.keyboard.down('KeyZ'); for (let i = 0; i < 40; i++) { if (i === hold) await p.keyboard.up('KeyZ'); await step(p, 1); top = Math.min(top, (await st(p)).y); } await p.keyboard.up('KeyZ'); return y0 - top; };
  const tap = await apex(2), held = await apex(30);
  check('hold longer = jump higher (tap ' + Math.round(tap) + 'px, hold ' + Math.round(held) + 'px)', held > tap + 5 && held > 20, { tap, held });
  await step(p, 80); await p.keyboard.down('Space'); await step(p, 6); a = await st(p); await p.keyboard.up('Space'); check('Space jumps', !a.on && a.vy < 0, a);
  await step(p, 80);
  // float: tap jump repeatedly in the air -> at most 6 flaps
  await p.keyboard.down('KeyZ'); await step(p, 2); await p.keyboard.up('KeyZ'); await step(p, 2);
  let maxFlaps = 0; for (let i = 0; i < 12; i++) { await p.keyboard.down('KeyZ'); await step(p, 2); await p.keyboard.up('KeyZ'); await step(p, 3); maxFlaps = Math.max(maxFlaps, (await st(p)).flaps); }
  check('tapping jump in the air floats up to 6 times (flaps ' + maxFlaps + ')', maxFlaps === 6, maxFlaps);
  a = await st(p); check('puffed: the fall is slow', a.puff === 1 && a.vy <= 0.9, a);
  await step(p, 400); a = await st(p); check('it comes back to the ground', a.on, a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---------- 3 ----------
async function abilities(env) {
  console.log('3. real keys: inhale -> swallow = copy, spit a star, use the ability, drop it for a candy');
  const s = await open(env); const p = s.page; const k = kb(p);
  await startManual(p, '1-1'); await step(p, 5);
  const place = kind => p.evaluate(kind => { const S = __puff.S, e = S.en.find(q => q.k === kind && !q.dead); const pl = S.ps[0]; pl.x = e.x - 44; pl.y = e.y + e.h - pl.h; pl.vx = 0; pl.vy = 0; pl.face = 1; pl.inv = 9999; S.cam.x = Math.max(0, pl.x - 80); return e.x; }, kind);
  await place('mogu'); await step(p, 20);
  await p.keyboard.down('KeyX'); let a; for (let i = 0; i < 80; i++) { await step(p, 1); a = await st(p); if (a.held) break; } await p.keyboard.up('KeyX');
  check('holding X inhales the mogu into the mouth', a.held === 'mogu', a);
  await shot(p, '03-held');
  await tapKey(p, 'KeyC'); a = await st(p); check('C swallows a plain creature: nothing is copied', !a.held && a.ab === null, a);
  const kills0 = a.kills;
  await place('mogu'); await step(p, 10); await p.keyboard.down('KeyX'); for (let i = 0; i < 80; i++) { await step(p, 1); a = await st(p); if (a.held) break; } await p.keyboard.up('KeyX'); await step(p, 2);
  await tapKey(p, 'KeyX'); check('X again spits a star', (await p.evaluate(() => __puff.S.pr.some(q => q.k === 'star'))) && !(await st(p)).held, await st(p));
  await step(p, 80);
  // copy fire from a bobo
  await place('bobo'); await step(p, 10); await p.keyboard.down('KeyX'); for (let i = 0; i < 120; i++) { await step(p, 1); a = await st(p); if (a.held) break; } await p.keyboard.up('KeyX');
  check('a bobo goes into the mouth with its power', a.held === 'bobo', a);
  await tapKey(p, 'KeyC'); a = await st(p);
  check('C swallows it: Fire is copied (HUD, save counters after the stage, the book)', a.ab === 'fire', a);
  await shot(p, '03-fire');
  await step(p, 30); await p.keyboard.down('KeyX'); await step(p, 20); const fl = await p.evaluate(() => __puff.S.pr.filter(q => q.k === 'flame').length); await p.keyboard.up('KeyX');
  check('X now breathes fire (flames fly)', fl > 0, fl);
  await step(p, 20); await tapKey(p, 'KeyC'); a = await st(p);
  check('C drops the ability: it is gone and a candy appears', a.ab === null && (await p.evaluate(() => __puff.S.it.some(i => i.k === 'candy'))), a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); void kills0; await s.close();
}

// ---------- 4 ----------
async function proofs(env) {
  console.log('4. the stored proofs, played back through the REAL keyboard, finish all 25 stages with all three medals (result, save, unlock)');
  const s = await open(env); const p = s.page; const k = kb(p);
  const ids = LV.ids(); const t0 = Date.now();
  for (let i = 0; i < ids.length; i++) {
    const id = ids[i];
    await startManual(p, id);
    const ref = E.runReplay(E.parse(LV.get(id)), E.unrle(PROOFS[id]));
    await runRecording(p, k, PROOFS[id]);
    const a = await st(p);
    check(`${id}: reached the goal with real keys, same frame count as the engine (${ref.res.frames}), 3 medals`, a.over && a.result && a.result.frames === ref.res.frames && popc(a.result.med) === 3, { over: a.over, frames: a.result && a.result.frames, med: a.result && a.result.med });
    const sv = await stored(p, SAVE);
    check(`${id}: saved as cleared with 3 medals`, (sv.lv[i] & 1) === 1 && ((sv.lv[i] >> 1) & 7) === 7, sv.lv[i]);
    if (i === 0) { await shot(p, '04-result'); check('the result shows three star rows and the time', (await p.$$('#rStars svg')).length === 3 && /\d:\d\d/.test(await p.textContent('#rKv')), await p.textContent('#rKv')); }
    if (id === '1-5') await shot(p, '04-boss-clear');
    if (id === '5-5') await shot(p, '04-final-clear');
  }
  const sv = await stored(p, SAVE);
  check('all 25 cleared with all 75 medals: 25 + 75 + no-hit stars, at most 125 points', sv.cl === 25 && sv.md === 75 && sv.all3 === 25 && sv.pts >= 100 && sv.pts <= 125, { pts: sv.pts, cl: sv.cl, md: sv.md });
  check('all eight abilities were found', sv.ab === 255 && sv.abn === 8, { ab: sv.ab, abn: sv.abn });
  check('every world counted five clears', [1, 2, 3, 4, 5].every(w => sv.wc[w] === 5), sv.wc);
  check('stats were counted (copies, inhales, puzzles)', sv.stats.copies >= 40 && sv.stats.inhaled >= 40 && sv.stats.burn > 0 && sv.stats.cut > 0 && sv.stats.crack > 0 && sv.stats.sock > 0 && sv.stats.ice > 0 && sv.stats.boss === 5, sv.stats);
  console.log('      proofs through real keys took ' + Math.round((Date.now() - t0) / 1000) + 's');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---------- 5 ----------
async function touch(env) {
  console.log('5. real touch (stick + three buttons): 1-1 to the goal in landscape and 1-3 on a small portrait phone');
  for (const [vp, id] of [['land', '1-1'], ['se1', '1-3'], ['ip12', '1-2']]) {
    const s = await open(env, { vp, touch: true }); const p = s.page; await startManual(p, id);
    await p.waitForTimeout(150);
    const body = await p.evaluate(() => document.body.className);
    check(`${vp}: the touch controls are shown while playing`, /touch/.test(body) && /playing/.test(body), body);
    const d = await touchDriver(p);
    const r = d.rects; const vw = V.pick(vp)[0];
    check(`${vp}: stick and buttons are inside the screen and big enough`, [r.stick, r.J, r.ACT, r.SW].every(q => q.x >= -1 && q.y >= -1 && q.x + q.w <= vw.width + 1 && q.y + q.h <= vw.height + 1) && r.stick.w >= 90 && r.J.w >= 60 && r.ACT.w >= 56 && r.SW.w >= 36, r);
    await shot(p, `05-touch-${vp}`);
    await d.set(Bt.R); await step(p, 40); let a = await st(p); check(`${vp}: the stick moves the hero right`, a.x > 50, a);
    await d.set(Bt.J); await step(p, 8); a = await st(p); check(`${vp}: the jump button jumps`, !a.on, a); await d.release(); await step(p, 60);
    await startManual(p, id);
    await runRecording(p, d, PROOFS[id]); a = await st(p);
    check(`${vp}: ${id} cleared with touch only (stick + buttons)`, a.over && a.result && popc(a.result.med) === 3, { over: a.over, res: a.result });
    const lab = await p.evaluate(() => [document.getElementById('bA').textContent, document.getElementById('bS').textContent]); check(`${vp}: button labels follow the state (${lab.join('/')})`, lab[0].length > 0 && lab[1].length > 0, lab);
    check(`${vp}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

// ---------- 6 ----------
async function coop(env) {
  console.log('6. two players: the setting, both heroes move with their own keys, own hearts, partner revive');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __puff.showSettings()); await wait(p, () => __kb.state().settings);
  await p.click('#setBody .seg[data-k="two"] .opt[data-v="1"]');
  let sv = await stored(p, SAVE); check('the setting is saved', sv && sv.set.two === 1, sv);
  await p.click('#setClose'); await startManual(p, '1-1'); await step(p, 20);
  let a = await st(p); check('two heroes in the stage', a.np === 2, a);
  await shot(p, '06-coop');
  const pos = () => p.evaluate(() => __puff.S.ps.map(q => [q.x, q.vx, q.hp]));
  const x0 = await pos();
  await p.keyboard.down('KeyD'); await step(p, 40); await p.keyboard.up('KeyD'); let x1 = await pos();
  check('WASD (D) moves player 1 only', x1[0][0] > x0[0][0] + 30 && Math.abs(x1[1][0] - x0[1][0]) < 5, [x0, x1]);
  await p.keyboard.down('ArrowLeft'); await step(p, 20); await p.keyboard.up('ArrowLeft'); const x2 = await pos();
  check('the arrow keys move player 2 only', x2[1][0] < x1[1][0] - 8 && Math.abs(x2[0][0] - x1[0][0]) < 30, [x1, x2]);
  await p.evaluate(() => { const S = __puff.S; S.ps[1].hp = 2; S.ps[1].inv = 0; }); const hp = await pos(); check('each hero has its own hearts', hp[0][2] === 6 && hp[1][2] === 2, hp);
  await p.evaluate(() => { const S = __puff.S; S.ps[1].hp = 0; S.ps[1].dead = 1; S.ps[1].x = S.ps[0].x + 6; S.ps[1].y = S.ps[0].y; }); await step(p, 110);
  const rv = await pos(); check('the fallen partner is revived when the other hero is near', rv[1][2] > 0 && (await p.evaluate(() => __puff.S.ps[1].dead)) === 0, rv);
  // finish the stage in two-player mode and check the counter
  await startManual(p, '1-1'); await p.evaluate(() => { const S = __puff.S, g = S.L.goal; __puff.setPos((g.x - 3) * 16, g.y * 16 + 2, 0); __puff.setPos((g.x - 4) * 16, g.y * 16 + 2, 1); }); await p.keyboard.down('KeyD'); await step(p, 60); await p.keyboard.up('KeyD'); await step(p, 120);
  sv = await stored(p, SAVE); check('a two-player clear is counted (stats.coop)', sv.stats.coop === 1 && (sv.lv[0] & 1) === 1, sv.stats);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---------- 7 ----------
async function pause(env) {
  console.log('7. pause menu, resume, hiding the page, restart');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => { __puff.start('1-1'); __puff.S.cam.x = 0; }); await wait(p, () => __kb.state().playing); await p.waitForTimeout(300);
  await p.keyboard.press('Escape'); await wait(p, () => __kb.state().pauseOpen);
  let a = await st(p); check('Escape opens the pause menu and pauses', a.paused && a.pauseOpen && !!(await p.$('.kb-pause')), a);
  await shot(p, '07-pause');
  const f = a.frame; await p.waitForTimeout(400); a = await st(p); check('no frames pass while paused', a.frame === f, [f, a.frame]);
  await p.keyboard.down('ArrowRight'); await p.waitForTimeout(200); a = await st(p); check('keys do nothing while paused', a.frame === f, [f, a.frame]); await p.keyboard.up('ArrowRight');
  await p.evaluate(() => { const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); }); await wait(p, () => !__kb.state().paused);
  await p.waitForTimeout(300); a = await st(p); check('Resume continues the game', !a.paused && a.frame > f + 5, [f, a.frame]);
  await p.click('#pauseBtn'); await wait(p, () => __kb.state().pauseOpen); a = await st(p); check('the pause button also opens the menu', a.paused, a);
  await p.evaluate(() => { const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); }); await wait(p, () => !__kb.state().paused);
  const hide = h => p.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await hide(true); await p.waitForTimeout(100); a = await st(p); check('hiding the page pauses', a.paused, a); const f2 = a.frame; await hide(false); await p.waitForTimeout(300); a = await st(p);
  check('showing it again waits behind the pause menu (no surprise restart)', a.paused && a.pauseOpen && a.frame === f2, a);
  await p.evaluate(() => { const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); }); await wait(p, () => !__kb.state().paused);
  await p.keyboard.press('Escape'); await wait(p, () => __kb.state().pauseOpen);
  const restart = await p.evaluate(() => { const b = [...document.querySelectorAll('.kb-layer .kb-btn')].find(x => /はじめから|Start over|Restart/i.test(x.textContent)); if (b) { b.click(); return true; } return false; });
  await p.waitForTimeout(300); await p.evaluate(() => { const b = [...document.querySelectorAll('.kb-layer .kb-btn')].filter(x => x.offsetParent && /やり直す|Restart/.test(x.textContent))[0]; b && b.click(); });
  await p.waitForTimeout(300); a = await st(p); check('Restart from the menu starts the stage again', restart && a.playing && !a.paused && a.frame < 150, a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---------- 8 ----------
async function saveTest(env) {
  console.log('8. save: clear bits and medals only grow, found abilities stay, progress and the next stage survive a reload');
  const s = await open(env); const p = s.page;
  const finish = async () => { await p.evaluate(() => { const S = __puff.S, g = S.L.goal; __puff.setPos((g.x - 3) * 16, g.y * 16 + 2); __puff.S.ps[0].inv = 9999; }); await p.keyboard.down('ArrowRight'); await step(p, 60); await p.keyboard.up('ArrowRight'); await step(p, 120); };
  await startManual(p, '1-1'); await step(p, 5);
  await p.evaluate(() => { const S = __puff.S; for (const i of [0, 1]) { const m = S.L.medals[i]; __puff.setPos(m.x * 16 + 2, m.y * 16 + 1); S.ps[0].inv = 9999; __puff.stepN(2); } });
  let a = await st(p); check('two medals picked up in the run', (a.med & 3) === 3, a);
  await finish(); a = await st(p); let sv = await stored(p, SAVE);
  check('cleared with medals 0,1: bits saved (clear + 2 medals; a hit-free clear gets bit 4)', a.over && (sv.lv[0] & 1) === 1 && ((sv.lv[0] >> 1) & 7) === 3, sv.lv[0]);
  const pts1 = sv.pts; check('points = clear 1 + 2 medals (+1 if untouched)', pts1 >= 3 && pts1 <= 4, pts1);
  await startManual(p, '1-1'); await step(p, 5);
  await p.evaluate(() => { const S = __puff.S; const m = S.L.medals[2]; __puff.setPos(m.x * 16 + 2, m.y * 16 + 1); S.ps[0].inv = 9999; __puff.stepN(2); });
  await finish(); sv = await stored(p, SAVE);
  check('a later run adds its medal and keeps the earlier ones (bits 1,2,3)', ((sv.lv[0] >> 1) & 7) === 7 && sv.pts >= pts1 + 1, { lv: sv.lv[0], pts: sv.pts });
  await startManual(p, '1-1'); await step(p, 5); await finish(); const sv2 = await stored(p, SAVE);
  check('a worse run never takes anything away', ((sv2.lv[0] >> 1) & 7) === 7 && sv2.pts >= sv.pts && sv2.md === 3, sv2);
  await startManual(p, '1-1'); await step(p, 5);
  await p.evaluate(() => { __puff.give('fire'); __puff.S.abGot |= 1; }); await finish(); sv = await stored(p, SAVE);
  check('found abilities are remembered (bit mask) and counted', (sv.ab & 1) === 1 && sv.abn >= 1, { ab: sv.ab, abn: sv.abn });
  // reload
  await s.reload(); await p.waitForFunction(() => window.__puff); a = await st(p);
  check('after a reload the save is back and 1-2 is open', a.save.cl === 1 && a.save.lv[0] === sv.lv[0], a.save);
  await p.evaluate(() => __puff.showTitle()); await wait(p, () => __kb.state().title);
  check('the title continues from the next stage (1-2)', /1-2/.test(await p.textContent('#tGo')), await p.textContent('#tGo'));
  await p.click('#tGo'); await wait(p, () => __kb.state().mode === 'ow'); a = await st(p); check('the map opens on 1-2', a.owCur === 1, a);
  await p.keyboard.press('Enter'); await wait(p, () => __kb.state().playing && __kb.state().id === '1-2'); a = await st(p); check('Enter starts 1-2', a.id === '1-2', a);
  // book
  await p.evaluate(() => __puff.showBook()); await wait(p, () => __kb.state().book); const book = await p.textContent('#bkBody'); check('the copy book lists the found ability and hides the rest', /ほのお/.test(book) && /？？？/.test(book), book.slice(0, 200));
  await shot(p, '08-book');
  // an old/partial save never crashes the page
  const s2 = await open(env, { seed: { [HOWTO]: '1', [SAVE]: '{"v":1,"pts":3,"lv":[3]}' } }); const a2 = await st(s2.page);
  check('a partial save is read (missing fields default) without errors', a2.save.cl === 1 && s2.log.pageErrors.length === 0, a2.save); await s2.close();
  const s3 = await open(env, { seed: { [HOWTO]: '1', [SAVE]: 'not json' } }); check('a broken save is ignored without errors', (await st(s3.page)).save.cl === 0 && s3.log.pageErrors.length === 0, s3.log.pageErrors); await s3.close();
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---------- 9 ----------
async function gamepad(env) {
  console.log('9. gamepad: stick/d-pad, A jump, X inhale, Y swallow, start pauses; two pads for two players');
  const init = 'window.__fakePads = [0, 1].map(() => ({ connected: true, axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })) })); navigator.getGamepads = () => window.__fakePads;';
  const s = await open(env, { initScripts: [init] }); const p = s.page;
  await startManual(p, '1-1'); await step(p, 10);
  const x0 = (await st(p)).x; await p.evaluate(() => { __fakePads[0].axes[0] = 1; }); await step(p, 30); let a = await st(p); check('the pad stick moves the hero', a.x > x0 + 20, a); await p.evaluate(() => { __fakePads[0].axes[0] = 0; }); await step(p, 30);
  await p.evaluate(() => { __fakePads[0].buttons[15].pressed = true; }); await step(p, 20); a = await st(p); check('the d-pad moves too', a.x > x0 + 30, a); await p.evaluate(() => { __fakePads[0].buttons[15].pressed = false; }); await step(p, 30);
  await p.evaluate(() => { __fakePads[0].buttons[0].pressed = true; }); await step(p, 6); a = await st(p); check('button A jumps', !a.on, a); await p.evaluate(() => { __fakePads[0].buttons[0].pressed = false; }); await step(p, 80);
  await p.evaluate(() => { __puff.give('fire'); __fakePads[0].buttons[2].pressed = true; }); await step(p, 15); const fl = await p.evaluate(() => __puff.S.pr.filter(q => q.k === 'flame').length); check('button X uses the ability', fl > 0, fl); await p.evaluate(() => { __fakePads[0].buttons[2].pressed = false; }); await step(p, 20);
  await p.evaluate(() => { __fakePads[0].buttons[3].pressed = true; }); await step(p, 3); a = await st(p); check('button Y drops the ability', a.ab === null, a); await p.evaluate(() => { __fakePads[0].buttons[3].pressed = false; });
  await p.evaluate(() => { __fakePads[0].buttons[9].pressed = true; }); await step(p, 2); await p.waitForTimeout(200); a = await st(p); check('Start pauses', a.paused, a); await p.evaluate(() => { __fakePads[0].buttons[9].pressed = false; const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); });
  // two players, two pads
  await p.evaluate(() => { __puff.showSettings(); }); await p.click('#setBody .seg[data-k="two"] .opt[data-v="1"]'); await p.click('#setClose'); await startManual(p, '1-1'); await step(p, 10);
  const q0 = await p.evaluate(() => __puff.S.ps.map(q => q.x)); await p.evaluate(() => { __fakePads[1].axes[0] = 1; }); await step(p, 30); const q1 = await p.evaluate(() => __puff.S.ps.map(q => q.x));
  check('with two players, pad 2 moves player 2 only', q1[1] > q0[1] + 20 && Math.abs(q1[0] - q0[0]) < 3, [q0, q1]);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  // the map with a pad
  const s2 = await open(env, { initScripts: [init] }); const p2 = s2.page;
  await p2.evaluate(() => { __puff.showOverworld(); }); await wait(p2, () => __kb.state().mode === 'ow'); await p2.evaluate(() => { __puff.unlockAll(); __fakePads[0].buttons[15].pressed = true; }); await p2.waitForTimeout(120); await p2.evaluate(() => { __fakePads[0].buttons[15].pressed = false; });
  check('the pad d-pad moves along the map', (await st(p2)).owCur === 1, await st(p2));
  await p2.evaluate(() => { __fakePads[0].buttons[0].pressed = true; }); await wait(p2, () => __kb.state().playing); check('A starts the stage', (await st(p2)).id === '1-2', null); await s2.close();
}

// ---------- 10 ----------
async function english(env) {
  console.log('10. English: no Japanese on any screen');
  const s = await open(env, { lang: 'en', seed: {}, vp: 'se2' }); const p = s.page;
  check('html lang is en', (await p.evaluate(() => document.documentElement.lang)) === 'en', null);
  const miss = async what => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${what}: no Japanese`, jp.length === 0, jp.slice(0, 6)); };
  await miss('how to play'); await p.click('#howtoGo'); await miss('title');
  await p.click('#tMap'); await wait(p, () => __kb.state().mode === 'ow'); await miss('map'); await p.keyboard.press('Enter'); await wait(p, () => __kb.state().playing); await p.waitForTimeout(300); await miss('stage (HUD in the canvas is not scanned)');
  const hud = await p.evaluate(() => { __puff.give('stone'); return __puff.G.def.name.en; }); check('stage name in English', /First Float/.test(hud), hud);
  await p.evaluate(() => __puff.openPause()); await wait(p, () => !!document.querySelector('.kb-pause')); await miss('pause menu'); await p.evaluate(() => { const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); });
  await p.evaluate(() => { __puff.manual(true); const S = __puff.S, g = S.L.goal; __puff.setPos((g.x - 3) * 16, g.y * 16 + 2); }); await p.keyboard.down('ArrowRight'); await step(p, 60); await p.keyboard.up('ArrowRight'); await step(p, 140);
  await wait(p, () => __kb.state().resultShown); await miss('result');
  await p.evaluate(() => __puff.showSettings()); await miss('settings'); await p.evaluate(() => { document.getElementById('setClose').click(); });
  await p.evaluate(() => __puff.showBook()); await miss('copy book');
  const btn = await p.evaluate(() => { __puff.showTitle(); return document.getElementById('tGo').textContent; }); check('title button is English', /Continue|Start|1-2/.test(btn), btn);
  check('the page title is the English name or the Japanese one', true, await p.title());
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---------- 11 ----------
async function orient(env) {
  console.log('11. screen orientation: forced landscape on a portrait phone (390x844), ja/en; auto is unchanged; settings has the three choices');
  const O = require('../../common/orient.js');
  for (const lang of ['ja', 'en']) {
    const s = await B.newSession(env, { vp: V.get('ip12'), lang, seed: { [HOWTO]: '1', [ORI]: 'land' }, isMobile: true, hasTouch: true });
    const p = s.page; await s.goto('/puff/?debug');
    await p.waitForFunction(() => document.getElementById('ko'), null, { timeout: 8000 });
    const fr = () => p.frames().find(f => f !== p.mainFrame());
    for (let i = 0; i < 60 && !fr(); i++) await p.waitForTimeout(100);
    await fr().waitForFunction(() => window.__kb && __kb.ready() && window.__puff, null, { timeout: 10000 });
    const L = lang + ': ';
    const box = await p.evaluate(() => { const r = document.getElementById('ko').getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height, iw: innerWidth, ih: innerHeight }; });
    check(L + 'the rotated game fills the whole phone screen', Math.abs(box.x) < 1.5 && Math.abs(box.y) < 1.5 && Math.abs(box.w - box.iw) < 1.5 && Math.abs(box.h - box.ih) < 1.5, box);
    const inner = await fr().evaluate(() => ({ w: innerWidth, h: innerHeight, land: matchMedia('(orientation: landscape)').matches }));
    check(L + 'inside, the page sees a landscape screen (844x390) so its landscape layout is used', inner.w === 844 && inner.h === 390 && inner.land, inner);
    const W = box.iw, H = box.ih;
    const dev = (x, y) => O.unmapPoint(x, y, { dir: 'cw', W, H });
    const tap = async sel => { const c = await fr().evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; }, sel); const d = dev(c.x, c.y); await p.touchscreen.tap(d.x, d.y); };
    await fr().evaluate(() => __puff.showTitle()); await p.waitForTimeout(300);
    check(L + 'no page scroll on the phone', await p.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1 && document.documentElement.scrollHeight <= innerHeight + 1));
    await tap('#tMap'); const opened = await fr().waitForFunction(() => __kb.state().mode === 'ow', null, { timeout: 5000 }).then(() => true, () => false);
    check(L + 'tapping a menu item at its rotated position opens the map', opened);
    await shot(p, '11-orient-map-' + lang);
    await tap('#owGo'); await fr().waitForFunction(() => __kb.state().playing, null, { timeout: 8000 });
    await fr().evaluate(() => { __puff.manual(true); }); await p.waitForTimeout(150);
    const rects = await fr().evaluate(() => { const r = id => { const b = document.getElementById(id).getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; }; return { stick: r('stick'), J: r('bJ'), A: r('bA') }; });
    check(L + 'the touch controls are shown inside the rotated page', rects.stick.w > 60 && rects.J.w > 50, rects);
    const cdp = await s.ctx.newCDPSession(p);
    const touchTo = async (id, x, y) => { const d = dev(x, y); await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: d.x, y: d.y, id }] }); };
    const touchEnd = () => cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
    const x0 = (await fr().evaluate(() => __kb.state())).x;
    await touchTo(1, rects.stick.x + rects.stick.w * 0.94, rects.stick.y + rects.stick.h * 0.5); await fr().evaluate(() => __puff.stepN(40)); const x1 = (await fr().evaluate(() => __kb.state())).x; await touchEnd();
    check(L + 'dragging the stick toward the content right moves the hero right', x1 > x0 + 30, { x0, x1 });
    await touchTo(2, rects.J.x + rects.J.w / 2, rects.J.y + rects.J.h / 2); await fr().evaluate(() => __puff.stepN(8)); const air = (await fr().evaluate(() => __kb.state())).on; await touchEnd();
    check(L + 'the jump button works through the rotation', air === false);
    await shot(p, '11-orient-play-' + lang);
    await fr().evaluate(() => __puff.showSettings()); const segs2 = await fr().evaluate(() => Array.from(document.querySelectorAll('#oOri button')).map(b => b.textContent));
    check(L + 'settings has the three orientation choices', segs2.length === 3, segs2);
    check(L + 'no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
  const s = await B.newSession(env, { vp: V.get('ip12'), lang: 'ja', seed: { [HOWTO]: '1' }, isMobile: true, hasTouch: true }); const p = s.page; await s.goto('/puff/?debug');
  await p.waitForFunction(() => window.__kb && __kb.ready() && window.__puff, null, { timeout: 10000 });
  check('auto: the page is the plain game (no shell frame)', await p.evaluate(() => !document.getElementById('ko') && innerWidth === 390));
  await p.evaluate(() => { __puff.start('1-1'); }); await p.waitForTimeout(400);
  const lf = await p.evaluate(() => { const t = document.getElementById('landTip'), b = document.getElementById('landGo'); return { shown: !t.hidden, w: b.getBoundingClientRect().width, tw: t.getBoundingClientRect().width, tl: t.getBoundingClientRect().left }; });
  check('auto + portrait phone: a tip suggests landscape, with a button inside the screen', lf.shown && lf.w >= 44 && lf.tw <= 390 && lf.tl >= 0, lf);
  await shot(p, '11-orient-tip');
  await p.click('#landGo'); const sw = await p.waitForFunction(() => document.getElementById('ko'), null, { timeout: 8000 }).then(() => true, () => false);
  check('the tip button switches to forced landscape', sw); check('the choice is saved on this device', (await p.evaluate(k => localStorage.getItem(k), ORI)) === 'land');
  await s.close();
  const s2 = await B.newSession(env, { vp: V.get('land'), lang: 'ja', seed: { [HOWTO]: '1', [ORI]: 'land' }, isMobile: true, hasTouch: true }); const p2 = s2.page; await s2.goto('/puff/?debug');
  await p2.waitForFunction(() => document.getElementById('ko'), null, { timeout: 8000 });
  const b2 = await p2.evaluate(() => { const r = document.getElementById('ko').getBoundingClientRect(); return { w: r.width, h: r.height, iw: innerWidth, ih: innerHeight, t: getComputedStyle(document.getElementById('ko')).transform }; });
  check('a device that is already landscape: forced landscape does not rotate', Math.abs(b2.w - b2.iw) < 2 && (b2.t === 'none' || /matrix\(1, 0, 0, 1, 0, 0\)/.test(b2.t)), b2);
  await s2.close();
}

// ---------- 12 ----------
async function layouts(env) {
  console.log('12. every screen size x ja/en: nothing off screen, controls big enough');
  for (const vp of (process.env.PUFF_VPS || 'se1,a360s,ip12,p8,land').split(',').concat(['320x568', '768x1024', '1024x768'])) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang, touch: true, seed: {} }); const p = s.page; const tag = `${vp}/${lang}`;
    const probe = async what => { const r = await p.evaluate(`(${layoutProbe})()`); check(`${tag} ${what}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, r); };
    await probe('how to play'); await p.click('#howtoGo'); await probe('title'); if (lang === 'ja') await shot(p, `12-${vp}-title`);
    await p.click('#tMap'); await probe('map'); if (lang === 'ja') await shot(p, `12-${vp}-map`);
    await p.evaluate(() => { __puff.unlockAll(); __puff.start('1-2'); }); await wait(p, () => __kb.state().playing); await p.waitForTimeout(300); await probe('game'); if (lang === 'ja') await shot(p, `12-${vp}-game`);
    const btn = await p.evaluate(() => [...document.querySelectorAll('#stick, #bJ, #bA, #bS')].map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); })); check(`${tag}: touch controls are at least 40px (${btn.map(Math.round).join(',')})`, btn.every(x => x >= 40), btn);
    const cvr = await p.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(); return { w: r.width, h: r.height }; }); check(`${tag}: the picture is big enough (${Math.round(cvr.w)}x${Math.round(cvr.h)})`, cvr.w >= 300 && cvr.h >= 150, cvr);
    await p.evaluate(() => __puff.openPause()); await wait(p, () => !!document.querySelector('.kb-pause')); await probe('pause'); await p.evaluate(() => { const b = document.querySelector('.kb-layer .kb-btn--primary'); b && b.click(); });
    await p.evaluate(() => { __puff.manual(true); __puff.setPos((__puff.S.L.goal.x - 3) * 16, __puff.S.L.goal.y * 16 + 2); __puff.S.ps[0].inv = 9999; }); await p.keyboard.down('ArrowRight'); await step(p, 60); await p.keyboard.up('ArrowRight'); await step(p, 140); await wait(p, () => __kb.state().resultShown); await probe('result');
    await p.evaluate(() => __puff.showSettings()); await probe('settings');
    await p.evaluate(() => { document.getElementById('setClose').click(); __puff.showBook(); }); await probe('copy book');
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

// ---------- 13 ----------
async function perf(env) {
  console.log('13. speed: simulation + drawing per frame on a busy stage');
  const s = await open(env, { vp: 'ip12', touch: true }); const p = s.page;
  await startManual(p, '4-4');
  const r = await p.evaluate(inputs => { const t0 = performance.now(); let n = 0; for (const m of inputs) { __puff.hold(m); __puff.stepN(1); n++; if (n >= 1500) break; } __puff.release(); return { ms: performance.now() - t0, n }; }, E.unrle(PROOFS['4-4']));
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
  const all = { first, keys, abilities, proofs, touch, coop, pause, save: saveTest, gamepad, english, orient, layouts, perf };
  for (const [name, f] of Object.entries(all)) {
    if (only && !only.includes(name)) continue;
    try { await f(env); } catch (e) { check(name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
