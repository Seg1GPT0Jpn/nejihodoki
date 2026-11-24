#!/usr/bin/env node
// おもちゃ大乱闘の通しプレイ（Playwright。キーボードとタッチは本物の入力。?debug の window.__brawl は「状態を読む」「試合を早く終わらせる」ためだけ）
//   node tools/tests/brawl-play.js [first,solo,touch,twop,ladder,training,pause,resume,english,layouts]
// 1. 初回：遊び方 → タイトル（うしろで CPU のデモが動く）  2. ひとりで対戦：本物のキーでいどう・ジャンプ・こうげき・つよい攻撃・まもり・つかみ・KO・結果と保存
// 3. タッチ：左のスティックと右のボタンを同時におす（マルチタッチ）  4. ふたりで1台：1P と 2P のキーが別々に効く
// 5. ラダー：8戦のながれ・おもちゃとステージが開く・負けてコンティニュー・クリア・ベスト  6. れんしゅう：ダミー・コンボ・KO でも終わらない
// 7. 一時停止  8. 保存と再開（ラダー）  9. 英語  10. 全画面サイズ × ja/en（タイトル・設定・試合・結果）
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
  await p.evaluate(() => { __brawl.place(0, -150, 0); __brawl.place(1, 300, 0); });
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

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [first, solo, touch, twop, ladder, training, pause, resume, english, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
