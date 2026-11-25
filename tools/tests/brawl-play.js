#!/usr/bin/env node
// おもちゃ大乱闘の通しプレイ（Playwright。キーボードとタッチは本物の入力。?debug の window.__brawl は「状態を読む」「試合を早く終わらせる」ためだけ）
//   node tools/tests/brawl-play.js [first,solo,touch,twop,ladder,training,pause,resume,english,layouts,controls,gamepad,roster,ctlpage,touchflick]
// 1. 初回：遊び方 → タイトル（うしろで CPU のデモが動く）  2. ひとりで対戦：本物のキーでいどう・ジャンプ・こうげき・つよい攻撃・まもり・つかみ・KO・結果と保存
// 3. タッチ：左のスティックと右のボタンを同時におす（マルチタッチ）  4. ふたりで1台：1P と 2P のキーが別々に効く
// 5. ラダー：8戦のながれ・おもちゃとステージが開く・負けてコンティニュー・クリア・ベスト  6. れんしゅう：ダミー・コンボ・KO でも終わらない
// 7. 一時停止  8. 保存と再開（ラダー）  9. 英語  10. 全画面サイズ × ja/en（タイトル・設定・試合・結果）
// 11. controls：本物のキーで ダッシュ・はじきジャンプ・はじき強攻撃・Cスティック・まもり・つかみ/なげ・空中よけ・ふち・うけ身・あいさつ
// 12. gamepad：にせのゲームパッド（navigator.getGamepads）で アナログのはじき・ゆっくり押し・Cスティック・メニュー操作
// 13. roster：18人のえらぶ画面（320px の ja/en・矢印キーで移動・勝ちで開く）  14. ctlpage：操作ページ（4つのタブ・キーの変更・オプション）  15. touchflick：スティックのはじき
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'brawl-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.brawl.save', RUN = 'kusoge.brawl.run', HOWTO = 'kusoge.brawl.howto';

async function open(env, o = {}) {
  const touch = !!o.touch;
  const s = await B.newSession(env, { vp: V.get(o.vp || 'land'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: touch, hasTouch: touch });
  await s.goto('/brawl/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__brawl);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 8000 });
async function startSolo(p) {
  await p.evaluate(() => __brawl.showTitle()); await p.click('#mSolo'); await p.click('#sGo');
  await wait(p, () => __kb.state().playing); await p.evaluate(() => __brawl.skipCount()); await wait(p, () => __kb.state().count === 0 && __kb.state().frame > 3);
}
const F = (p, i) => p.evaluate(i => __kb.state().fighters[i], i);
async function hold(p, key, ms) { await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key); }

async function first(env) {
  console.log('1. first visit: the rules, then the title with a demo match behind it');
  const s = await open(env, { seed: {} }); const p = s.page;
  check('rules show on the first visit', (await st(p)).howto, await st(p));
  await shot(p, '01-howto');
  await p.click('#howtoAlt');
  let a = await st(p); check('title after "just the rules"', a.title, a);
  const f0 = a.frame; await p.waitForTimeout(700); a = await st(p);
  check('a demo match runs behind the title', a.mode === 'demo' && a.frame > f0, { f0, f: a.frame, m: a.mode });
  const px = await p.evaluate(() => { const c = document.getElementById('board'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; let n = 0, last = -1; for (let i = 0; i < d.length; i += 4 * 97) { const v = d[i] * 65536 + d[i + 1] * 256 + d[i + 2]; if (v !== last) n++; last = v; } return n; });
  check('the board is drawn (not a flat colour)', px > 60, px);
  await shot(p, '01-title');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function solo(env) {
  console.log('2. a solo match with the real keyboard');
  const s = await open(env); const p = s.page;
  await startSolo(p);
  let a = await st(p); check('a solo match started: you vs a CPU, 3 stocks each', a.fighters.length === 2 && a.fighters[0].lvl === 0 && a.fighters[1].lvl === 2 && a.fighters[0].stk === 3, a.fighters);
  await p.evaluate(() => { __brawl.freeze(); __brawl.place(0, -200, 0); __brawl.place(1, 250, 0); });
  const x0 = (await F(p, 0)).x; await hold(p, 'KeyD', 500); const x1 = (await F(p, 0)).x; check('D moves you right', x1 > x0 + 40, { x0, x1 });
  await hold(p, 'KeyA', 500); check('A moves you left', (await F(p, 0)).x < x1 - 20, await F(p, 0));
  await p.keyboard.down('Space'); await p.waitForTimeout(150); const air = (await F(p, 0)); await p.keyboard.up('Space'); check('Space jumps', air.y < -10, air);
  await p.waitForTimeout(900);
  await p.keyboard.press('Space'); await p.waitForTimeout(120); await p.keyboard.press('Space'); await p.waitForTimeout(300);
  let atk = false; await p.keyboard.down('KeyJ'); for (let i = 0; i < 6 && !atk; i++) { await p.waitForTimeout(15); atk = (await F(p, 0)).s === 'atk'; } await p.keyboard.up('KeyJ');
  check('J attacks', atk);
  await p.waitForTimeout(500);
  await p.evaluate(() => { __brawl.place(0, 0, 0); __brawl.place(1, 300, 0); });
  atk = false; await p.keyboard.down('KeyK'); for (let i = 0; i < 6 && !atk; i++) { await p.waitForTimeout(15); const f = await F(p, 0); atk = f.s === 'atk' && /sp/.test(f.mv); } await p.keyboard.up('KeyK'); check('K uses a special', atk);
  await p.waitForTimeout(700);
  let ch = false; await p.keyboard.down('KeyU'); await p.keyboard.down('KeyD'); await p.waitForTimeout(250); ch = (await F(p, 0)).mv === 'fsmash'; await p.keyboard.up('KeyU'); await p.keyboard.up('KeyD');
  check('U (held) charges a smash attack', ch, await F(p, 0)); await p.waitForTimeout(900);
  await p.keyboard.down('KeyL'); await p.waitForTimeout(200); check('L shields', (await F(p, 0)).s === 'shield', await F(p, 0)); await p.keyboard.up('KeyL');
  // a real fight: stand next to the CPU and hit it until it takes damage
  await p.waitForTimeout(300); await p.evaluate(() => { __brawl.place(0, -20, 0); __brawl.place(1, 30, 0); __brawl.G.st.fighters[0].face = 1; });
  let dmg = 0; for (let i = 0; i < 20 && !dmg; i++) { await p.keyboard.press('KeyJ'); await p.waitForTimeout(160); dmg = (await F(p, 1)).pct; }
  check('your attacks hurt the CPU (damage % rises)', dmg > 0, dmg); await shot(p, '02-fight');
  // a KO: send the CPU out
  await p.evaluate(() => __brawl.place(1, 5000, 0)); await p.waitForTimeout(300); a = await st(p);
  check('a toy past the blast zone loses a stock', a.fighters[1].stk === 2, a.fighters[1]);
  await p.evaluate(() => __brawl.finish(0)); await wait(p, () => __kb.state().result, null, 6000); a = await st(p);
  check('the result is shown: victory', a.result && /かち|Victory/.test(await p.textContent('#rTitle')), await p.textContent('#rTitle'));
  const sv = await stored(p, SAVE); check('the win is saved (plays, wins)', sv && sv.stats.plays === 1 && sv.stats.wins === 1 && sv.stats.falls === 0, sv && sv.stats); await shot(p, '02-result');
  await p.click('#rNext'); await wait(p, () => __kb.state().playing && __kb.state().frame < 30); check('"rematch" starts a new match', true);
  await p.evaluate(() => __brawl.lose()); await wait(p, () => __kb.state().result, null, 6000); check('losing shows defeat', /まけ|Defeat/.test(await p.textContent('#rTitle')), await p.textContent('#rTitle'));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// CDP multi-touch
function touchApi(cdp) {
  const pts = new Map();
  const send = type => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: [...pts].map(([id, p]) => ({ x: p.x, y: p.y, id })) });
  return { down: async (id, x, y) => { pts.set(id, { x, y }); await send('touchStart'); }, move: async (id, x, y) => { pts.set(id, { x, y }); await send('touchMove'); }, up: async id => { pts.delete(id); await send(pts.size ? 'touchEnd' : 'touchEnd'); } };
}
async function touch(env) {
  console.log('3. touch controls: the left stick and the right buttons, at the same time');
  const s = await open(env, { touch: true, vp: 'land' }); const p = s.page; const cdp = await s.ctx.newCDPSession(p); const T = touchApi(cdp);
  await startSolo(p);
  check('the touch pad is visible in a match', await p.evaluate(() => !document.body.classList.contains('notouch') && document.querySelectorAll('#pad .tb').length === 6), null);
  const btn = k => p.evaluate(k => { const r = document.querySelector('#pad .tb[data-k="' + k + '"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, k);
  const sizes = await Promise.all(['A', 'S', 'J', 'M', 'H', 'G'].map(btn)); check('every button is at least 46px (generous hit areas)', sizes.every(b => b.w >= 46 && b.h >= 46), sizes.map(b => b.w + 'x' + b.h));
  await p.evaluate(() => { __brawl.freeze(); __brawl.place(0, -200, 0); __brawl.place(1, 300, 0); });
  const vp = V.get('land'); const sx = 90, sy = vp.height - 90;
  const x0 = (await F(p, 0)).x; await T.down(1, sx, sy); await T.move(1, sx + 60, sy); await p.waitForTimeout(500); const x1 = (await F(p, 0)).x;
  check('dragging the stick right moves you right', x1 > x0 + 30, { x0, x1 });
  const j = await btn('J'); await T.down(2, j.x, j.y); await p.waitForTimeout(150); const f = await F(p, 0);
  check('stick + jump button at once (multi-touch): moving and in the air', f.y < -10 && f.vx > 0.5, f); await T.up(2);
  await p.waitForTimeout(900);
  const a = await btn('A'); await T.down(3, a.x, a.y); let atk = false; for (let i = 0; i < 8 && !atk; i++) { await p.waitForTimeout(15); atk = (await F(p, 0)).s === 'atk'; } await T.up(3);
  check('the attack button attacks', atk); await T.up(1);
  await p.waitForTimeout(1200); const x2 = (await F(p, 0)).x; await p.waitForTimeout(300); check('releasing the stick stops you', Math.abs((await F(p, 0)).x - x2) < 25, null);
  await shot(p, '03-touch'); check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function twop(env) {
  console.log('4. two players on one keyboard');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __brawl.showTitle()); await p.click('#mTwo'); await p.click('#sGo'); await wait(p, () => __kb.state().playing); await p.evaluate(() => __brawl.skipCount()); await wait(p, () => __kb.state().count === 0 && __kb.state().frame > 3);
  let a = await st(p); check('two humans', a.humans === 2 && a.fighters[0].lvl === 0 && a.fighters[1].lvl === 0, a.fighters);
  await p.evaluate(() => { __brawl.place(0, -250, 0); __brawl.place(1, 250, 0); });
  const [a0, b0] = [await F(p, 0), await F(p, 1)];
  await p.keyboard.down('KeyD'); await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(500); await p.keyboard.up('KeyD'); await p.keyboard.up('ArrowLeft');
  const [a1, b1] = [await F(p, 0), await F(p, 1)]; check('P1 (D) goes right and P2 (arrow left) goes left, at once', a1.x > a0.x + 30 && b1.x < b0.x - 30, { a0: a0.x, a1: a1.x, b0: b0.x, b1: b1.x });
  await p.keyboard.press('KeyF'); await p.waitForTimeout(40); check('P1 F attacks', (await F(p, 0)).s === 'atk', await F(p, 0));
  await p.waitForTimeout(700); await p.evaluate(() => { __brawl.place(0, -300, 0); __brawl.place(1, 200, 0); }); await p.waitForTimeout(500); await p.keyboard.press('Period'); await p.waitForTimeout(40); check('P2 "." attacks', (await F(p, 1)).s === 'atk', await F(p, 1));
  await p.evaluate(() => __brawl.finish(1)); await wait(p, () => __kb.state().result, null, 6000); check('the result names the winner', /P2/.test(await p.textContent('#rTitle')), await p.textContent('#rTitle'));
  const sv = await stored(p, SAVE); check('twop is counted', sv && sv.stats.twop === 1, sv && sv.stats); await s.close();
}

async function ladder(env) {
  console.log('5. the ladder: 8 fights, unlocks, continue, clear, best score');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __brawl.showTitle()); await p.click('#mLad'); check('ladder setup opens', (await st(p)).setup, await st(p));
  await p.click('#sGo'); await wait(p, () => __kb.state().ladder); let a = await st(p); check('the ladder card shows, run saved at fight 1', a.run && a.run.idx === 0 && a.run.cont === 2, a.run);
  check('8 rows in the ladder', await p.evaluate(() => document.querySelectorAll('#lList > div').length) === 8, null); await shot(p, '05-ladder');
  await p.click('#lGo'); await wait(p, () => __kb.state().playing); a = await st(p); check('fight 1: one CPU, Easy', a.fighters.length === 2 && a.fighters[1].lvl === 1, a.fighters);
  await p.evaluate(() => __brawl.skipCount()); await p.waitForTimeout(300);
  await p.evaluate(() => __brawl.finish(0)); await wait(p, () => __kb.state().result, null, 6000);
  check('victory shows points and the next button', (await p.textContent('#rPts')).length > 5 && /つぎ|Next/.test(await p.textContent('#rNext')), await p.textContent('#rNext'));
  a = await st(p); check('the run advanced and keeps the score', a.run.idx === 1 && a.run.score > 1000, a.run); check('stage "shelf" unlocked by fight 1', a.save.un.s.shelf === 1, a.save.un);
  await p.click('#rNext'); await wait(p, () => __kb.state().ladder); await p.click('#lGo'); await wait(p, () => __kb.state().playing); await p.evaluate(() => __brawl.skipCount());
  await p.evaluate(() => __brawl.finish(0)); await wait(p, () => __kb.state().result, null, 6000); a = await st(p); check('fight 2 won: toy "tin" unlocked', a.save.un.c.tin === 1, a.save.un);
  // lose with continues
  await p.click('#rNext'); await wait(p, () => __kb.state().ladder); await p.click('#lGo'); await wait(p, () => __kb.state().playing); await p.evaluate(() => __brawl.skipCount());
  await p.evaluate(() => __brawl.lose()); await wait(p, () => __kb.state().result, null, 6000);
  check('losing offers a continue', /コンティニュー|Continue/.test(await p.textContent('#rNext')), await p.textContent('#rNext'));
  const sc0 = (await st(p)).run.score; await p.click('#rNext'); await wait(p, () => __kb.state().playing); a = await st(p); check('a continue replays the same fight, costs 1000 and one continue', a.run.idx === 2 && a.run.cont === 1 && a.run.score === Math.max(0, sc0 - 1000), a.run);
  // the boss and the clear
  await p.evaluate(() => { localStorage.setItem('kusoge.brawl.run', JSON.stringify({ v: 1, ch: 'robo', diff: 2, idx: 7, score: 9000, cont: 1, seed: 5, kos: 10 })); });
  await p.evaluate(() => __brawl.showTitle()); await p.click('#mCont'); await wait(p, () => __kb.state().ladder); await p.click('#lGo'); await wait(p, () => __kb.state().playing);
  a = await st(p); check('fight 8 is the boss (Junk King), a heavy toy with 4 stocks', a.fighters[1].ch === 'junk' && a.fighters[1].stk === 4, a.fighters);
  await p.evaluate(() => __brawl.skipCount()); await shot(p, '05-boss'); await p.evaluate(() => __brawl.finish(0)); await wait(p, () => __kb.state().result, null, 6000);
  a = await st(p); const sv = a.save; check('clearing the ladder: clears 1, best score saved, run removed, Hard unlocked, boss counted', sv.cl === 1 && sv.best > 9000 && a.run === null && sv.stats.boss === 1, { cl: sv.cl, best: sv.best, run: a.run });
  check('"new best" and the Hard unlock are announced', !(await p.$eval('#rNew', e => e.hidden)) && /つよい|Hard/.test(await p.textContent('#rUnl')), await p.textContent('#rUnl')); await shot(p, '05-clear');
  await p.click('#rNext'); await wait(p, () => __kb.state().title); check('back at the title with the best score', /9,?\d{3}|1\d,\d{3}/.test(await p.textContent('#tBest')), await p.textContent('#tBest'));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function training(env) {
  console.log('6. training: a dummy, combos, KOs do not end it');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __brawl.showTitle()); await p.click('#mTrain'); await p.click('#sGo'); await wait(p, () => __kb.state().playing && __kb.state().mode === 'train');
  await p.evaluate(() => __brawl.skipCount()); await wait(p, () => __kb.state().count === 0 && __kb.state().frame > 3);
  await p.click('#trBtn'); check('the training panel opens', await p.isVisible('#train'), null);
  await p.click('#trMode button:nth-child(2)'); check('dummy set to "shield"', (await p.evaluate(() => __brawl.G.st.dummy)) === 'shield', null);
  await p.click('#trMode button:nth-child(1)'); await p.click('#trBtn');
  await p.evaluate(() => { __brawl.place(0, -20, 0); __brawl.place(1, 30, 0); __brawl.G.st.fighters[0].face = 1; });
  for (let i = 0; i < 6; i++) { await p.keyboard.press('KeyJ'); await p.waitForTimeout(150); }
  const d = await F(p, 1); check('hits add damage on the dummy', d.pct > 3, d); await shot(p, '06-training');
  await p.click('#trBtn'); await p.click('#trReset'); check('"reset damage" works', (await F(p, 1)).pct === 0, await F(p, 1)); await p.click('#trBtn');
  await p.evaluate(() => __brawl.place(1, 6000, 0)); await p.waitForTimeout(300); const a = await st(p);
  check('a KO does not end training or take a stock', a.playing && a.fighters[1].stk === 3 && !a.over, a.fighters[1]);
  await p.click('#trBtn'); await p.click('#trBoxes'); await p.waitForTimeout(100); await shot(p, '06-boxes');
  await p.click('#trFrames'); await p.waitForTimeout(150); const fd = await p.textContent('#trData'); check('training can show frame data (state, move frame, inv, stun, inputs)', await p.isVisible('#trData') && /YOU/.test(fd) && /inv/.test(fd) && /in:/.test(fd), fd); await shot(p, '06-frames');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function pause(env) {
  console.log('7. pause: the menu stops the match');
  const s = await open(env); const p = s.page; await startSolo(p);
  await p.keyboard.press('KeyP'); await p.waitForTimeout(300); let a = await st(p); check('P opens the pause menu', a.menuOpen, a);
  const f0 = a.frame; await p.waitForTimeout(500); check('the match is frozen', (await st(p)).frame === f0, null); await shot(p, '07-pause');
  await p.getByRole('button', { name: /つづける|Resume/ }).first().click(); await p.waitForTimeout(500); a = await st(p); check('resuming runs the match again', !a.menuOpen && a.frame > f0, { f0, f: a.frame, m: a.menuOpen });
  await s.close();
}

async function resume(env) {
  console.log('8. save and resume: the ladder survives a reload');
  const s = await open(env, { seed: { [HOWTO]: '1', [RUN]: { v: 1, ch: 'duck', diff: 2, idx: 3, score: 4200, cont: 1, seed: 9, kos: 4 } } }); const p = s.page;
  let a = await st(p); check('the title offers "continue ladder (fight 4)"', a.title && await p.isVisible('#mCont') && /4/.test(await p.textContent('#mCont')), await p.textContent('#mCont'));
  await p.click('#mCont'); await wait(p, () => __kb.state().ladder); check('the ladder card resumes at fight 4 with the score', /4,?200/.test(await p.textContent('#lNote')), await p.textContent('#lNote'));
  await p.click('#lGo'); await wait(p, () => __kb.state().playing); a = await st(p); check('fight 4 is a 3-way (two CPUs)', a.fighters.length === 3 && a.fighters[0].ch === 'duck', a.fighters);
  await s.close();
  const s2 = await open(env, { seed: { [HOWTO]: '1', [SAVE]: { v: 1, best: 7777, lw: 3, cl: 0, un: { c: { robo: 1, duck: 1, bear: 1, tin: 1 }, s: { bench: 1, box: 1, shelf: 1 } }, stats: { plays: 4, wins: 3 } } } });
  await s2.page.click('#mSolo'); const chips = await s2.page.evaluate(() => [...document.querySelectorAll('#pickP1 .pk')].map(b => b.disabled));
  check('unlocked toys are restored (tin open, top and jack locked)', chips[2] === false && chips[4] === true && chips[5] === true, chips);
  check('best score shown on the title', /7,?777/.test(await s2.page.evaluate(() => document.getElementById('tBest').textContent)), null); await s2.close();
}

async function english(env) {
  console.log('9. English');
  const s = await open(env, { lang: 'en', seed: {} }); const p = s.page;
  check('html lang is en', (await p.evaluate(() => document.documentElement.lang)) === 'en', null);
  const miss = async (what) => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${what}: no Japanese`, jp.length === 0, jp.slice(0, 6)); };
  await miss('rules'); await p.click('#howtoAlt'); await miss('title');
  await p.click('#mSolo'); await miss('setup'); await p.click('#sGo'); await wait(p, () => __kb.state().playing); await p.evaluate(() => __brawl.skipCount()); await p.waitForTimeout(400); await miss('match');
  await p.evaluate(() => __brawl.finish(0)); await wait(p, () => __kb.state().result, null, 6000); await miss('result'); await shot(p, '09-en-result');
  await p.click('#rMenu'); await p.click('#mLad'); await miss('ladder setup'); await p.click('#sGo'); await miss('ladder card'); await shot(p, '09-en-ladder');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function layouts(env) {
  console.log('10. every screen size x ja/en: nothing off screen, no sideways scroll');
  for (const vp of (process.env.BW_VPS || 'se1,a360s,se2,ip12,land,xr').split(',')) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang, touch: true }); const p = s.page; const tag = `${vp}/${lang}`;
    const probe = async (what) => { const r = await p.evaluate(`(${layoutProbe})()`); check(`${tag} ${what}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 4), pr: r.primary.filter(x => x.problems.length) }); };
    await probe('title'); if (lang === 'ja') await shot(p, `10-${vp}-title`);
    await p.click('#mSolo'); await probe('setup'); if (lang === 'ja') await shot(p, `10-${vp}-setup`);
    await p.click('#sGo'); await wait(p, () => __kb.state().playing); await p.evaluate(() => __brawl.skipCount()); await p.waitForTimeout(500);
    await probe('match'); if (lang === 'ja') await shot(p, `10-${vp}-match`);
    await p.evaluate(() => __brawl.finish(0)); await wait(p, () => __kb.state().result, null, 6000); await probe('result'); if (lang === 'ja') await shot(p, `10-${vp}-result`);
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${tag} result: no Japanese`, jp.length === 0, jp.slice(0, 5)); }
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

// ---- 11. the platform-fighter controls with the real keyboard
const poll = async (p, fn, ms = 600, step = 12) => { const src = `(function () { const fighter0 = () => __kb.state().fighters[0]; return (${fn.toString()})(); })()`; const t0 = Date.now(); let last = null; while (Date.now() - t0 < ms) { last = await p.evaluate(src); if (last) return last; await p.waitForTimeout(step); } return last; };
const fighter0 = () => __kb.state().fighters[0]; // (used inside page functions through poll)
async function controls(env) {
  console.log('11. platform-fighter controls: dash, flick jump, flick smash, C-stick, shield, grab and throw, air dodge, ledge, tech, taunt');
  const s = await open(env); const p = s.page; await startSolo(p);
  const reset = (x = -200, cx = 300) => p.evaluate(([x, cx]) => { __brawl.freeze(); const G = __brawl.G; for (const f of G.st.fighters) { f.s = 'free'; f.mv = ''; f.hold = 0; f.inv = 0; f.vx = f.vy = 0; f.mm = 0; f.fkt = 0; f.lag = 0; f.jumps = 1; f.adUsed = false; f.pct = 0; f.hs = 0; } __brawl.place(0, x, 0); __brawl.place(1, cx, 0); G.st.fighters[0].face = 1; G.st.fighters[1].face = -1; }, [x, cx]);
  await reset(); await p.waitForTimeout(150);
  // walk (hold) vs dash (double tap)
  await p.keyboard.down('KeyD'); const w = await poll(p, () => { const f = fighter0(); return f.mm === 1 ? 'dash' : null; }, 90); await p.keyboard.up('KeyD'); check('a single press is a walk, not a dash', w !== 'dash', w);
  await p.waitForTimeout(400); await reset();
  await p.keyboard.down('KeyD'); await p.waitForTimeout(30); await p.keyboard.up('KeyD'); await p.waitForTimeout(30); await p.keyboard.down('KeyD');
  const dash = await poll(p, () => { const f = fighter0(); return f.mm === 1 ? f : null; }, 300); check('double-tapping D dashes (flick)', !!dash, dash);
  const run = await poll(p, () => { const f = fighter0(); return f.mm === 2 ? f : null; }, 500); check('holding it on runs', !!run, run); await p.keyboard.up('KeyD');
  await p.waitForTimeout(500); await reset();
  // hold-to-run without a double tap
  await p.keyboard.down('KeyD'); const hr = await poll(p, () => { const f = fighter0(); return f.mm === 2 ? f : null; }, 600); await p.keyboard.up('KeyD'); check('"hold to run" mode: holding a direction runs', !!hr, hr);
  await p.waitForTimeout(400); await reset();
  // flick jump = double-tap up
  await p.keyboard.press('KeyW'); await p.waitForTimeout(250); const noj = await F(p, 0); check('a single up press does not jump', noj.y >= -2, noj);
  await p.waitForTimeout(300);
  await p.keyboard.down('KeyW'); await p.waitForTimeout(25); await p.keyboard.up('KeyW'); await p.waitForTimeout(25); await p.keyboard.down('KeyW');
  const fj = await poll(p, () => { const f = fighter0(); return f.y < -12 ? f : null; }, 600); await p.keyboard.up('KeyW'); check('double-tapping up (a flick) jumps', !!fj, fj);
  await p.waitForTimeout(1100); await reset();
  // tilt vs flick smash vs C-stick vs smash key
  await p.keyboard.down('KeyD'); await p.keyboard.down('KeyF'); const tl = await poll(p, () => { const f = fighter0(); return f.s === 'atk' ? f.mv : null; }, 200); await p.keyboard.up('KeyF'); await p.keyboard.up('KeyD'); check('direction + attack pressed together is a tilt', tl === 'ftilt', tl);
  await p.waitForTimeout(700); await reset();
  await p.keyboard.down('KeyD'); await p.waitForTimeout(25); await p.keyboard.up('KeyD'); await p.waitForTimeout(25); await p.keyboard.down('KeyD'); await p.keyboard.down('KeyF');
  const sm = await poll(p, () => { const f = fighter0(); return f.s === 'atk' ? f.mv : null; }, 250); await p.keyboard.up('KeyF'); await p.keyboard.up('KeyD'); check('flick (double-tap) + attack is a forward smash', sm === 'fsmash', sm);
  await p.waitForTimeout(800); await reset();
  await p.keyboard.down('ArrowLeft'); const cs = await poll(p, () => { const f = fighter0(); return f.s === 'atk' ? f : null; }, 250); await p.keyboard.up('ArrowLeft'); check('the C-stick (arrow key) smashes that way and turns you', cs && cs.mv === 'fsmash' && cs.face === -1, cs);
  await p.waitForTimeout(800); await reset();
  await p.keyboard.down('KeyW'); await p.waitForTimeout(40); await p.keyboard.down('KeyR'); const us = await poll(p, () => { const f = fighter0(); return f.s === 'atk' ? f.mv : null; }, 250); await p.keyboard.up('KeyR'); await p.keyboard.up('KeyW'); check('smash key + up is an up smash', us === 'usmash', us);
  await p.waitForTimeout(800); await reset();
  // shield, perfect window, spot dodge, roll
  await p.keyboard.down('KeyV'); const sh = await poll(p, () => { const f = fighter0(); return f.s === 'shield' ? f : null; }, 200); check('V shields, and the first frames are the perfect-shield window', sh && sh.pst >= 0, sh);
  await p.waitForTimeout(120); await p.keyboard.press('KeyS'); const sp = await poll(p, () => { const f = fighter0(); return f.s === 'spot' ? f.s : null; }, 300); check('shield + down: spot dodge', sp === 'spot', sp); await p.keyboard.up('KeyV');
  await p.waitForTimeout(500); await reset();
  await p.keyboard.down('KeyV'); await p.waitForTimeout(120); await p.keyboard.press('KeyD'); const rl = await poll(p, () => { const f = fighter0(); return f.s === 'roll' ? f.s : null; }, 300); await p.keyboard.up('KeyV'); check('shield + a direction: roll', rl === 'roll', rl);
  await p.waitForTimeout(700); await reset(-20, 22);
  // grab and throw
  await p.keyboard.press('KeyT'); const gr = await poll(p, () => { const a = __kb.state().fighters; return a[0].s === 'grab' && a[1].s === 'held' ? 1 : null; }, 500); check('T grabs the toy in front of you', gr === 1, [await F(p, 0), await F(p, 1)]);
  const pm0 = (await F(p, 1)).pct; await p.keyboard.press('KeyF'); await p.waitForTimeout(80); check('attack while holding = pummel (damage)', (await F(p, 1)).pct > pm0, await F(p, 1));
  await p.waitForTimeout(250); await p.keyboard.press('KeyA'); const th = await poll(p, () => { const f = __kb.state().fighters[1]; return f.s === 'hurt' ? 1 : null; }, 400); check('a direction throws (back throw)', th === 1, await F(p, 1));
  await p.waitForTimeout(900); await reset();
  // air dodge, fast fall
  await p.keyboard.press('Space'); await poll(p, () => fighter0().y < -30, 600); await p.keyboard.down('KeyV'); const ad = await poll(p, () => { const f = fighter0(); return f.s === 'adodge' ? f.s : null; }, 250); await p.keyboard.up('KeyV'); check('shield in the air: air dodge', ad === 'adodge', await F(p, 0));
  await p.waitForTimeout(1500); await reset();
  // ledge: hang, then the get-up attack
  const hang = async () => { await p.evaluate(() => { const E = __brawl.E, L = E.STAGES.bench.ledges[0], C = E.CH[__kb.state().fighters[0].ch]; const f = __brawl.G.st.fighters[0]; f.s = 'free'; f.x = L.x - 20; f.y = L.y + C.h * 0.9 + 10; f.gr = -1; f.vy = 2; f.vx = 0; f.lcd = 0; f.lgN = 0; }); return poll(p, () => fighter0().s === 'ledge' ? 1 : null, 400); };
  check('falling beside the stage grabs the ledge', await hang() === 1, await F(p, 0)); await p.waitForTimeout(200);
  await p.keyboard.press('KeyF'); const la = await poll(p, () => { const f = fighter0(); return f.s === 'getup' && f.gk === 'atk' ? 1 : null; }, 300); check('attack on the ledge: get-up attack', la === 1, await F(p, 0));
  await p.waitForTimeout(800); await reset(); await hang(); await p.waitForTimeout(200); await p.keyboard.press('KeyV'); const lr = await poll(p, () => { const f = fighter0(); return f.s === 'getup' && f.gk === 'roll' ? 1 : null; }, 300); check('shield on the ledge: roll up', lr === 1, await F(p, 0));
  await p.waitForTimeout(900); await reset(); await hang(); await p.waitForTimeout(200); await p.keyboard.press('Space'); const lj = await poll(p, () => { const f = fighter0(); return f.s === 'free' && f.vy < -3 ? 1 : null; }, 300); check('jump on the ledge: ledge jump', lj === 1, await F(p, 0));
  await p.waitForTimeout(1200); await reset();
  // tech: pressing shield just before landing
  await p.evaluate(() => { const f = __brawl.G.st.fighters[0]; f.s = 'hurt'; f.hs = 70; f.y = -70; f.gr = -1; f.vy = 7; f.vx = 0; f.lv = null; });
  await p.keyboard.press('KeyV'); const tc = await poll(p, () => { const f = fighter0(); return f.s === 'tech' || f.s === 'roll' ? f.s : null; }, 600); check('shield just before landing while launched: tech', tc === 'tech', await F(p, 0));
  await p.waitForTimeout(700); await reset();
  await p.evaluate(() => { const f = __brawl.G.st.fighters[0]; f.s = 'hurt'; f.hs = 70; f.y = -70; f.gr = -1; f.vy = 7; f.vx = 0; f.lv = null; f.tl = 0; f.tq = 0; });
  await p.waitForTimeout(400); const ms = await F(p, 0); check('no tech press: the toy lies on the floor', ms.s === 'down' || ms.s === 'hurt' || ms.s === 'free', ms);
  await p.waitForTimeout(700); await reset();
  // taunt
  await p.keyboard.press('KeyY'); const tn = await poll(p, () => fighter0().s === 'taunt' ? 1 : null, 300); check('Y taunts', tn === 1, await F(p, 0));
  await shot(p, '11-controls'); check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---- 12. a (fake) gamepad: analog stick, C-stick, buttons, menu navigation
async function gamepad(env) {
  console.log('12. gamepad: analog tilt vs full push, flick, C-stick, buttons, and moving through the menus');
  const s = await B.newSession(env, { vp: V.get('land'), lang: 'ja', seed: { [HOWTO]: '1' } });
  await s.ctx.addInitScript(() => { window.__pad = { connected: true, id: 'fake', index: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })) }; navigator.getGamepads = () => [window.__pad]; });
  await s.goto('/brawl/?debug'); const p = s.page; await p.waitForFunction(() => window.__kb && __kb.ready() && window.__brawl);
  const axes = (a) => p.evaluate(a => { __pad.axes = a; }, a), btn = (i, v) => p.evaluate(([i, v]) => { __pad.buttons[i] = { pressed: v, value: v ? 1 : 0 }; }, [i, v]);
  // the menus: d-pad moves the focus, A presses, B goes back
  check('the page sees the pad', (await st(p)).pads, null);
  await p.evaluate(() => __brawl.showTitle()); await p.waitForTimeout(200);
  const f0 = await p.evaluate(() => document.activeElement && document.activeElement.id); await btn(13, true); await p.waitForTimeout(80); await btn(13, false); await p.waitForTimeout(60); const f1 = await p.evaluate(() => document.activeElement && document.activeElement.id);
  check('d-pad down moves the focus in the menu', !!f1 && f1 !== f0, [f0, f1]);
  await btn(0, true); await p.waitForTimeout(80); await btn(0, false); await p.waitForTimeout(250); check('A presses the focused button (opens the next screen)', (await st(p)).setup, await st(p));
  await btn(1, true); await p.waitForTimeout(80); await btn(1, false); await p.waitForTimeout(250); check('B goes back', (await st(p)).title, await st(p));
  // a match: choose "solo" with the pad
  await p.click('#mSolo'); await p.click('#sGo'); await wait(p, () => __kb.state().playing); await p.evaluate(() => __brawl.skipCount()); await wait(p, () => __kb.state().count === 0 && __kb.state().frame > 3);
  const reset = (x = -200) => p.evaluate(x => { __brawl.freeze(); const G = __brawl.G; for (const f of G.st.fighters) { f.s = 'free'; f.mv = ''; f.hold = 0; f.inv = 0; f.vx = f.vy = 0; f.mm = 0; f.fkt = 0; f.lag = 0; f.jumps = 1; } __brawl.place(0, x, 0); __brawl.place(1, 300, 0); G.st.fighters[0].face = 1; }, x);
  await reset(); await p.waitForTimeout(150);
  await axes([0.55, 0, 0, 0]); const wk = await poll(p, () => { const f = fighter0(); return f.mm === 1 ? 'dash' : null; }, 250); const wv = await F(p, 0); check('a light stick tilt walks (no dash)', wk !== 'dash' && wv.vx > 0.5 && wv.vx < 2.8, wv);
  await axes([1, 0, 0, 0]); const rn = await poll(p, () => { const f = fighter0(); return f.mm === 2 ? f : null; }, 600); check('then pushing it all the way slowly runs (not a flick)', !!rn, rn);
  await axes([0, 0, 0, 0]); await p.waitForTimeout(500); await reset();
  await axes([1, 0, 0, 0]); const fl = await poll(p, () => { const f = fighter0(); return f.mm === 1 ? f : null; }, 250); check('a sudden full push (flick) dashes', !!fl, fl);
  await axes([0, 0, 0, 0]); await p.waitForTimeout(500); await reset();
  await axes([1, 0, 0, 0]); await btn(2, true); const fs = await poll(p, () => { const f = fighter0(); return f.s === 'atk' ? f.mv : null; }, 250); await btn(2, false); check('flick + the attack button: forward smash', fs === 'fsmash', fs);
  await axes([0, 0, 0, 0]); await p.waitForTimeout(800); await reset();
  await axes([0, 0, 0, -1]); const cu = await poll(p, () => { const f = fighter0(); return f.s === 'atk' ? f.mv : null; }, 250); await axes([0, 0, 0, 0]); check('C-stick up (right stick): up smash', cu === 'usmash', cu);
  await p.waitForTimeout(800); await reset();
  await axes([0, -1, 0, 0]); const fj = await poll(p, () => { const f = fighter0(); return f.y < -12 ? f : null; }, 600); await axes([0, 0, 0, 0]); check('flicking the stick up jumps', !!fj, fj);
  await p.waitForTimeout(1200); await reset();
  await btn(0, true); await p.waitForTimeout(40); await btn(0, false); const jb = await poll(p, () => fighter0().y < -10 ? 1 : null, 400); check('A (bottom button) jumps', jb === 1, await F(p, 0));
  await p.waitForTimeout(1000); await reset();
  await btn(5, true); await p.waitForTimeout(30); await btn(5, false); await p.waitForTimeout(50); check('RB grabs (a grab starts)', (await F(p, 0)).mv === 'grab' || (await F(p, 0)).s === 'atk', await F(p, 0));
  await p.waitForTimeout(600); await reset();
  await btn(4, true); const sh = await poll(p, () => fighter0().s === 'shield' ? 1 : null, 250); await btn(4, false); check('LB shields', sh === 1, await F(p, 0));
  await p.waitForTimeout(400); await btn(10, true); await p.waitForTimeout(40); await btn(10, false); const tn = await poll(p, () => fighter0().s === 'taunt' ? 1 : null, 300); check('stick click taunts', tn === 1, await F(p, 0));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

// ---- 13. the roster screen: 18 toys, 320px, ja/en, keyboard navigation, wins unlock more
async function roster(env) {
  console.log('13. roster screen: 18 toys, fits at 320px (ja/en), arrow keys, locked toys and unlocking by wins');
  const ALL = { v: 1, best: 0, lw: 0, cl: 1, un: { c: { robo: 1, duck: 1, bear: 1 }, s: { bench: 1, box: 1 } }, stats: { wins: 90, plays: 90 } };
  for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp: 'se1', lang, touch: true, seed: { [HOWTO]: '1', [SAVE]: ALL } }); const p = s.page;
    await p.click('#mSolo'); await p.waitForTimeout(250);
    const chips = await p.evaluate(() => [...document.querySelectorAll('#pickP1 .pk')].map(b => { const r = b.getBoundingClientRect(); return { dis: b.disabled, w: Math.round(r.width), h: Math.round(r.height), x: Math.round(r.left), nm: b.querySelector('.nm').textContent }; }));
    check(`${lang}: 18 toys, all open once the ladder was cleared`, chips.length === 18 && chips.every(c => !c.dis), chips.length);
    check(`${lang}: each tile is at least 44px at 320px wide`, chips.every(c => c.w >= 44 && c.h >= 44), chips.slice(0, 2));
    const cols = new Set(chips.map(c => c.x)).size; check(`${lang}: several columns at 320px (${cols})`, cols >= 4, cols);
    const r = await p.evaluate(`(${layoutProbe})()`); check(`${lang}: the roster fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 4), pr: r.primary.filter(x => x.problems.length) });
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check('en roster: no Japanese', jp.length === 0, jp.slice(0, 6)); }
    // keyboard: focus one tile, arrows move along the grid, the focus shows the toy
    await p.focus('#pickP1 .pk[data-id="robo"]'); await p.keyboard.press('ArrowRight'); const a1 = await p.evaluate(() => document.activeElement.dataset.id); check(`${lang}: arrow right moves to the next toy`, a1 === 'duck', a1);
    await p.keyboard.press('ArrowDown'); const a2 = await p.evaluate(() => document.activeElement.dataset.id); check(`${lang}: arrow down moves a row down`, a2 && a2 !== 'duck' && E_ORDER.indexOf(a2) > 1 + 2, a2);
    await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowUp'); const a3 = await p.evaluate(() => document.activeElement.dataset.id); check(`${lang}: arrow up and left move back`, a3 === 'robo' || a3 === 'duck', a3);
    await p.focus('#pickP1 .pk[data-id="ninja"]'); const info = await p.textContent('#charInfo'); check(`${lang}: focusing a toy shows its name and description`, /Origa|オリガ/.test(info) && info.length > 40, info);
    await p.click('#pickP1 .pk[data-id="penguin"]'); check(`${lang}: clicking selects (saved on start)`, await p.evaluate(() => document.querySelector('#pickP1 .pk.sel').dataset.id) === 'penguin', null);
    await shot(p, `13-roster-${lang}`);
    await p.click('#sGo'); await wait(p, () => __kb.state().playing); const ff = await F(p, 0); check(`${lang}: the chosen new toy plays`, ff.ch === 'penguin', ff);
    check(`${lang}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
  // locked toys and unlocking by wins
  const s = await open(env, { vp: 'se1', touch: true }); const p = s.page;
  await p.click('#mSolo'); await p.waitForTimeout(200);
  const dis = await p.evaluate(() => [...document.querySelectorAll('#pickP1 .pk')].map(b => b.disabled)); check('a new player has 3 toys open and 15 locked', dis.filter(x => !x).length === 3 && dis.length === 18, dis);
  check('a note says how far the next toy is', /あと 2 勝/.test(await p.textContent('#rNote')), await p.textContent('#rNote'));
  await p.click('#sGo'); await wait(p, () => __kb.state().playing); await p.evaluate(() => __brawl.skipCount()); await p.evaluate(() => __brawl.finish(0)); await wait(p, () => __kb.state().result, null, 6000);
  let a = await st(p); check('one win: no new toy yet', Object.keys(a.save.un.c).length === 3, a.save.un.c);
  await p.click('#rNext'); await wait(p, () => __kb.state().playing); await p.evaluate(() => __brawl.skipCount()); await p.evaluate(() => __brawl.finish(0)); await wait(p, () => __kb.state().result, null, 6000);
  a = await st(p); check('the second win unlocks the next toy (ninja) and says so', a.save.un.c.ninja === 1 && /オリガ/.test(await p.textContent('#rUnl')), { c: a.save.un.c, u: await p.textContent('#rUnl') }); await shot(p, '13-unlock');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}
const E_ORDER = ['robo', 'duck', 'tin', 'bear', 'top', 'jack', 'ninja', 'wiz', 'cat', 'tank', 'giraffe', 'ball', 'crab', 'snail', 'kaiju', 'samurai', 'balloon', 'penguin'];

// ---- 14. the controls page
async function ctlpage(env) {
  console.log('14. controls page: tabs, remapping keys, options (ja/en)');
  for (const lang of ['ja', 'en']) {
    const s = await open(env, { lang, vp: 'se1', touch: true }); const p = s.page;
    await p.click('#mCtl'); await p.waitForTimeout(200);
    check(`${lang}: the controls page opens from the title`, await p.isVisible('#ovCtl'), null);
    check(`${lang}: four tabs`, await p.evaluate(() => document.querySelectorAll('#cTabs button').length) === 4, null);
    check(`${lang}: a row per action (15) with a P1 and a P2 key`, await p.evaluate(() => document.querySelectorAll('#cBody .kbtn').length) === 30, null);
    const rr = await p.evaluate(`(${layoutProbe})()`); check(`${lang}: fits at 320px`, rr.hscroll <= 1 && rr.offscreen.length === 0, { off: rr.offscreen.slice(0, 4) });
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check('en keys tab: no Japanese', jp.length === 0, jp.slice(0, 6)); }
    for (const tab of ['pad', 'touch', 'moves']) {
      await p.click(`#cTabs button[data-tab="${tab}"]`); await p.waitForTimeout(100);
      const txt = await p.textContent('#cBody'); check(`${lang}: ${tab} tab has text`, txt.length > 200, txt.length);
      const r2 = await p.evaluate(`(${layoutProbe})()`); check(`${lang}: ${tab} tab fits`, r2.hscroll <= 1 && r2.offscreen.length === 0, { off: r2.offscreen.slice(0, 4) });
      if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`en ${tab} tab: no Japanese`, jp.length === 0, jp.slice(0, 6)); }
      if (tab === 'moves') { for (const w of lang === 'ja' ? ['はじき', 'ジャストガード', 'うけ身', 'ピボット', 'ダッシュダンス', 'オートキャンセル', 'ふち', 'あいさつ'] : ['flick', 'perfect shield', 'tech', 'pivot', 'dash dance', 'auto-cancel', 'Ledges', 'Taunt']) check(`${lang}: the moves guide covers "${w}"`, new RegExp(w, 'i').test(txt), null); }
      if (tab === 'pad') { check(`${lang}: the gamepad tab covers the C-stick`, /Cスティック|C-stick/.test(txt), null); }
    }
    await shot(p, `14-ctl-${lang}`);
    await p.click('#cTabs button[data-tab="keys"]');
    // remap: Attack of P1 from F to H
    const btn = '#cBody .kbtn[data-p="1"][data-a="A"]'; check(`${lang}: Attack is F by default`, (await p.textContent(btn)) === 'F', await p.textContent(btn));
    await p.click(btn); await p.keyboard.press('KeyH'); await p.waitForTimeout(100);
    check(`${lang}: pressing a key remaps it (saved)`, (await p.textContent(btn)) === 'H' && (await st(p)).ctl.keys.p1.A === 'KeyH', (await st(p)).ctl);
    await p.click('#cBody .kbtn[data-p="1"][data-a="L"]'); await p.keyboard.press('Escape'); check(`${lang}: Esc cancels a remap`, (await p.textContent('#cBody .kbtn[data-p="1"][data-a="L"]')) === 'A', await p.textContent('#cBody .kbtn[data-p="1"][data-a="L"]'));
    await p.click('#cBody .kbtn[data-p="1"][data-a="J"]'); await p.keyboard.press('KeyD'); await p.waitForTimeout(80);
    const sw = await p.evaluate(() => [...document.querySelectorAll('#cBody .kbtn[data-p="1"]')].map(b => b.dataset.a + ':' + b.textContent).join(' ')); check(`${lang}: a key already in use is swapped, never duplicated`, /J:D/.test(sw) && /R:Space/.test(sw), sw);
    // options
    await p.click('#oTj button:nth-child(2)'); check(`${lang}: flick jump can be switched off`, (await st(p)).ctl.tj === 0, (await st(p)).ctl);
    await p.click('#oRun button:nth-child(2)'); check(`${lang}: keyboard running can be set to double-tap`, (await st(p)).ctl.run === 'tap', (await st(p)).ctl);
    await p.click('#cClose'); check(`${lang}: closing returns to the title`, (await st(p)).title, await st(p));
    // the new binding works in a match, flick jump off reaches the engine
    await p.evaluate(() => __brawl.showTitle()); await p.click('#mSolo'); await p.click('#sGo'); await wait(p, () => __kb.state().playing); await p.evaluate(() => __brawl.skipCount()); await wait(p, () => __kb.state().count === 0 && __kb.state().frame > 3);
    check(`${lang}: the fighter has flick jump off`, await p.evaluate(() => __brawl.G.st.fighters[0].opt.tj) === 0, null);
    await p.evaluate(() => { __brawl.freeze(); __brawl.place(0, -200, 0); __brawl.place(1, 300, 0); });
    await p.keyboard.press('KeyF'); await p.waitForTimeout(60); check(`${lang}: the old attack key (F) does nothing now`, (await F(p, 0)).s !== 'atk', await F(p, 0));
    await p.keyboard.press('KeyH'); await p.waitForTimeout(40); check(`${lang}: the new attack key (H) attacks`, (await F(p, 0)).s === 'atk', await F(p, 0));
    // reset
    await p.evaluate(() => __brawl.showTitle()); await p.click('#mCtl'); await p.click('#oReset'); check(`${lang}: reset restores the keys`, (await p.textContent('#cBody .kbtn[data-p="1"][data-a="A"]')) === 'F', null);
    check(`${lang}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

// ---- 15. touch flick
async function touchflick(env) {
  console.log('15. touch: a quick swipe on the stick is a flick (dash, flick jump); a slow drag walks');
  const s = await open(env, { touch: true, vp: 'land' }); const p = s.page; const cdp = await s.ctx.newCDPSession(p); const T = touchApi(cdp);
  await startSolo(p);
  const reset = () => p.evaluate(() => { __brawl.freeze(); const G = __brawl.G; for (const f of G.st.fighters) { f.s = 'free'; f.mv = ''; f.hold = 0; f.inv = 0; f.vx = f.vy = 0; f.mm = 0; f.fkt = 0; f.lag = 0; f.jumps = 1; } __brawl.place(0, -200, 0); __brawl.place(1, 300, 0); G.st.fighters[0].face = 1; });
  const vp = V.get('land'); const sx = 90, sy = vp.height - 90;
  await reset(); await p.waitForTimeout(150);
  await T.down(1, sx, sy); for (let i = 1; i <= 6; i++) { await T.move(1, sx + i * 6, sy); await p.waitForTimeout(40); } const wk = await F(p, 0); check('a slow drag (light tilt) walks, no dash', wk.mm !== 1 && wk.vx > 0.4, wk); await T.up(1);
  await p.waitForTimeout(500); await reset(); await p.waitForTimeout(100);
  await T.down(1, sx, sy); await T.move(1, sx + 80, sy); const fl = await poll(p, () => { const f = fighter0(); return f.mm === 1 ? f : null; }, 250); check('a quick swipe to the edge (flick) dashes', !!fl, fl); await T.up(1);
  await p.waitForTimeout(500); await reset(); await p.waitForTimeout(100);
  await T.down(1, sx, sy); await T.move(1, sx, sy - 80); const fj = await poll(p, () => { const f = fighter0(); return f.y < -12 ? f : null; }, 600); check('a quick swipe up (flick jump) jumps', !!fj, fj); await T.up(1);
  await p.waitForTimeout(1200); await reset(); await p.waitForTimeout(100);
  const a = await p.evaluate(() => { const r = document.querySelector('#pad .tb[data-k="A"]').getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2 }; });
  await T.down(1, sx, sy); await T.move(1, sx + 80, sy); await T.down(3, a.x, a.y); const sm = await poll(p, () => { const f = fighter0(); return f.s === 'atk' ? f.mv : null; }, 250); await T.up(3); await T.up(1); check('flick + the attack button: forward smash', sm === 'fsmash', sm);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [first, solo, touch, twop, ladder, training, pause, resume, english, layouts, controls, gamepad, roster, ctlpage, touchflick]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
