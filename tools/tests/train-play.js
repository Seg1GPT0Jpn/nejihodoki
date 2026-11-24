#!/usr/bin/env node
// でんしゃでいこうの通しプレイ（Playwright。キーボードとタッチは本物の入力。?debug の window.__train は「どのノッチにするか」を聞く・
// 結果を早く出す・時間を速く進めるためだけで、押すのは本物のキーとタッチ）
//   node tools/tests/train-play.js [first,drive,touch,ats,routes,pause,english,layouts]
// 1. 初回：遊び方 → タイトル（うしろで自動運転のおてほんが走る）  2. 本物のキーで1ルートを運転：ノッチ・停車・出発・結果・保存
// 3. タッチのレバー（加速・ブレーキ・N・非常・出発）  4. 出しすぎで ATS  5. ルートの開き方（★・路線）と次のルート  6. 一時停止
// 7. 英語  8. 全画面サイズ × ja/en（タイトル・ルート・運転・結果）
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'train-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.train.save', HOWTO = 'kusoge.train.howto';

async function open(env, o = {}) {
  const touch = !!o.touch;
  const s = await B.newSession(env, { vp: V.get(o.vp || 'land'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: touch, hasTouch: touch });
  await s.goto('/train/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__train);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 10000 });
async function startRoute(p, id) {
  await p.evaluate(() => __train.showTitle()); await p.click('#mDrive'); await wait(p, () => __kb.state().routes);
  await p.click(`.rc[data-route="${id}"]`); await p.click('#rsGo'); await wait(p, () => __kb.state().playing);
}
// 本物のキーで運転する：自動運転が勧めるノッチに、キーでレバーを合わせる
async function driveWithKeys(p, o = {}) {
  const t0 = Date.now(); let presses = 0, departs = 0;
  while (Date.now() - t0 < (o.ms || 170000)) {
    const a = await st(p);
    if (a.result || a.over) break;
    const adv = await p.evaluate(() => __train.advice());
    if (!adv) { await p.waitForTimeout(80); continue; }
    if (a.phase === 'dwell') {
      if (adv.depart && a.depart) { await p.keyboard.press('Enter'); departs++; await p.waitForTimeout(100); }
      else await p.waitForTimeout(100);
      continue;
    }
    const target = adv.notch;
    if (target !== a.want) {
      if (target === 0) await p.keyboard.press('Space');
      else if (target <= -8) await p.keyboard.press('KeyB');
      else await p.keyboard.press(target > a.want ? 'ArrowUp' : 'ArrowDown');
      presses++;
    }
    await p.waitForTimeout(40);
  }
  return { presses, departs };
}

async function first(env) {
  console.log('1. first visit: the rules, then the title with a demo run behind it');
  const s = await open(env, { seed: {} }); const p = s.page;
  check('rules show on the first visit', (await st(p)).howto, await st(p));
  await shot(p, '01-howto');
  await p.click('#howtoAlt');
  let a = await st(p); check('title after "just the rules"', a.title, a);
  const x0 = a.x; await p.waitForTimeout(1500); a = await st(p);
  check('a demo run moves behind the title', a.mode === 'demo' && Math.abs(a.x - x0) > 3, { x0, x: a.x, m: a.mode });
  const px = await p.evaluate(() => { const c = document.getElementById('board'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const set = new Set(); for (let i = 0; i < d.length; i += 4 * 211) set.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4)); return set.size; });
  check('the cab view is drawn (not a flat colour)', px > 40, px);
  await shot(p, '01-title');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function drive(env) {
  console.log('2. a whole route (r1) driven with the real keyboard');
  const s = await open(env); const p = s.page;
  await startRoute(p, 'r1');
  let a = await st(p);
  check('route r1 started at the first station, doors open, waiting to depart', a.route === 'r1' && a.phase === 'dwell' && a.x === 0 && a.departShown, a);
  await p.evaluate(() => __train.setSpeed(2));
  // キーの確かめ
  await p.keyboard.press('Space'); await p.keyboard.press('ArrowUp'); a = await st(p); check('ArrowUp raises the notch (P1)', a.want === 1, a.want);
  await p.keyboard.press('KeyW'); a = await st(p); check('W raises it again (P2)', a.want === 2, a.want);
  await p.keyboard.press('ArrowDown'); await p.keyboard.press('KeyS'); await p.keyboard.press('ArrowDown'); a = await st(p); check('ArrowDown / S lower it (B1)', a.want === -1, a.want);
  await p.keyboard.press('Space'); a = await st(p); check('Space is neutral', a.want === 0, a.want);
  await p.keyboard.press('KeyB'); a = await st(p); check('B is the emergency brake', a.want === -8, a.want);
  await p.keyboard.press('Space');
  await shot(p, '02-station');
  const r = await driveWithKeys(p);
  await wait(p, () => __kb.state().result, null, 20000); a = await st(p);
  check('the route ended with the result screen (' + r.presses + ' key presses)', a.result && a.legs === 2, { a: a.res, legs: a.legs });
  const sv = await stored(p, SAVE);
  check('the result is saved: best score, stars, stats', sv && sv.r && sv.r.r1 && sv.r.r1.b > 800 && sv.r.r1.s >= 1 && sv.total === sv.r.r1.b && sv.stats.plays === 1 && sv.stats.stops === 2, sv);
  check('the real keys drove it (not the autopilot): stops are scored where the train stood', sv && a.res && a.res.score > 800, a.res);
  check('2 leg rows shown', await p.evaluate(() => document.querySelectorAll('#rLegs > div').length) === 2, null);
  check('stars shown', (await p.textContent('#rStars')).includes('★'), null);
  await shot(p, '02-result');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function touch(env) {
  console.log('3. touch levers: accel, brake, N, emergency brake and depart');
  const s = await open(env, { touch: true, vp: 'land' }); const p = s.page;
  await startRoute(p, 'r1');
  check('the touch pad is visible while driving', await p.evaluate(() => !document.body.classList.contains('notouch') && document.querySelectorAll('#pad .lv').length === 4), null);
  const rect = sel => p.evaluate(sel => { const r = document.querySelector(sel).getBoundingClientRect(); return { x: r.left + r.width / 2, y: r.top + r.height / 2, w: r.width, h: r.height }; }, sel);
  const sizes = await Promise.all(['.lv.up', '.lv.dn', '.lv.nn', '.lv.eb'].map(rect));
  check('every lever button is a big target (≥ 56px)', sizes.every(b => b.w >= 56 && b.h >= 56), sizes.map(b => b.w + 'x' + b.h));
  const tap = async sel => { const r = await rect(sel); await p.touchscreen.tap(r.x, r.y); await p.waitForTimeout(80); };
  await tap('#departBtn'); await p.waitForTimeout(150); let a = await st(p);
  check('tapping Depart leaves the station', a.phase === 'run', a);
  await tap('.lv.up'); a = await st(p); check('tapping Accel raises the notch', a.want === 1, a.want);
  await tap('.lv.up'); await tap('.lv.up'); a = await st(p); check('three taps: P3', a.want === 3, a.want);
  await p.waitForTimeout(2500); a = await st(p); check('the train accelerates', a.v > 1, a);
  await tap('.lv.nn'); a = await st(p); check('N sets the notch to 0 (coast)', a.want === 0, a.want);
  await tap('.lv.dn'); a = await st(p); check('tapping Brake lowers the notch (B1)', a.want === -1, a.want);
  // 押しつづけるとくりかえす
  const r = await rect('.lv.dn'); const cdp = await s.ctx.newCDPSession(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: r.x, y: r.y, id: 1 }] }); await p.waitForTimeout(1300);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); a = await st(p);
  check('holding Brake keeps lowering the notch', a.want <= -3, a.want);
  await tap('.lv.eb'); a = await st(p); check('EB sets the emergency brake', a.want === -8, a.want);
  await p.waitForTimeout(6000); a = await st(p); check('the train stops under the emergency brake', a.v === 0, a);
  await shot(p, '03-touch');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function ats(env) {
  console.log('4. too fast: the ATS slams on the emergency brake');
  const s = await open(env); const p = s.page;
  await startRoute(p, 'r1'); await p.evaluate(() => __train.setSpeed(4));
  await p.keyboard.press('Enter'); await p.waitForTimeout(100);
  for (let i = 0; i < 5; i++) await p.keyboard.press('ArrowUp');
  await wait(p, () => __kb.state().ats >= 1, null, 20000); let a = await st(p);
  check('the ATS fired (speed far over the limit)', a.ats >= 1 && a.atsOn, a);
  check('a warning toast is shown', /ATS/.test(await p.textContent('#toast')), await p.textContent('#toast'));
  await shot(p, '04-ats');
  await p.evaluate(() => __train.setSpeed(1));
  await p.keyboard.press('ArrowUp'); await wait(p, () => __kb.state().v === 0 || __kb.state().phase === 'dwell', null, 20000); a = await st(p);
  check('it stops the train even though the lever stays on power', a.v === 0, a);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function routes(env) {
  console.log('5. routes and lines open with stars; next route; results');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __train.showTitle()); await p.click('#mDrive'); await wait(p, () => __kb.state().routes);
  const dis = await p.evaluate(() => [...document.querySelectorAll('#lineTabs .ln')].map(b => b.disabled));
  check('at first only the Hinata Main Line is open', dis.join() === 'false,true,true', dis);
  const rc = await p.evaluate(() => [...document.querySelectorAll('#rList .rc')].map(b => b.disabled));
  check('only the first route is open', rc.join() === 'false,true,true', rc);
  check('the timetable shows for the selected route', (await p.textContent('#rInfo')).includes('つくし台'), await p.textContent('#rInfo'));
  await shot(p, '05-routes');
  await p.click('#rsGo'); await wait(p, () => __kb.state().playing);
  await p.evaluate(() => __train.finishRoute()); await wait(p, () => __kb.state().result, null, 10000);
  let a = await st(p); check('finishing r1 shows the result with stars', a.result && a.res.stars >= 2, a.res);
  check('the next-route button shows and the new-best badge', await p.isVisible('#rNext') && await p.isVisible('#rNew'), null);
  await shot(p, '05-result');
  await p.click('#rNext'); await wait(p, () => __kb.state().playing); a = await st(p); check('"next route" starts r2', a.route === 'r2', a.route);
  await p.evaluate(() => __train.setSave(s => { s.r.r2 = { b: 3000, s: 3, p: 1 }; s.r.r3 = { b: 1700, s: 2, p: 1 }; })); // ★ 3+3+2 = 8
  await p.evaluate(() => __train.showTitle()); await p.click('#mDrive'); await wait(p, () => __kb.state().routes);
  check('with 8 stars the Umikaze line opens', await p.evaluate(() => !document.querySelector('#lineTabs .ln[data-line="l2"]').disabled), null);
  check('and the Hoshizora line stays locked (12 stars)', await p.evaluate(() => document.querySelector('#lineTabs .ln[data-line="l3"]').disabled), null);
  await p.click('#lineTabs .ln[data-line="l2"]'); await p.click('.rc[data-route="r4"]'); await p.click('#rsGo'); await wait(p, () => __kb.state().playing);
  a = await st(p); check('a route of the second line starts (r4: 4 stations)', a.route === 'r4' && a.mode === 'run', a);
  await p.evaluate(() => __train.finishRoute()); await wait(p, () => __kb.state().result, null, 10000);
  const sv = await stored(p, SAVE); check('stars and total add up in the save', sv.stars === sv.r.r1.s + sv.r.r2.s + sv.r.r3.s + sv.r.r4.s && sv.total === sv.r.r1.b + sv.r.r2.b + sv.r.r3.b + sv.r.r4.b && sv.un.l2 === 1, sv);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function pause(env) {
  console.log('6. pause and resume');
  const s = await open(env); const p = s.page;
  await startRoute(p, 'r1'); await p.keyboard.press('Enter'); await p.waitForTimeout(200); await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await p.waitForTimeout(2500);
  await p.click('#pauseBtn'); await p.waitForTimeout(300); let a = await st(p); check('the pause menu is open', a.menuOpen, a);
  const x0 = a.x; await p.waitForTimeout(1000); a = await st(p); check('the train does not move while paused', Math.abs(a.x - x0) < 0.01, { x0, x: a.x });
  await shot(p, '06-pause');
  await p.click('.kb-layer .kb-btn--primary'); await p.waitForTimeout(800); a = await st(p); check('resumed: moving again', !a.menuOpen && a.x > x0 + 1, a);
  await p.keyboard.press('KeyP'); await p.waitForTimeout(300); check('P opens the menu', (await st(p)).menuOpen, null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function english(env) {
  console.log('9. English: no Japanese on any screen');
  const s = await open(env, { lang: 'en', seed: {} }); const p = s.page;
  check('html lang is en', (await p.evaluate(() => document.documentElement.lang)) === 'en', null);
  const miss = async what => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${what}: no Japanese`, jp.length === 0, jp.slice(0, 6)); };
  await miss('rules'); await p.click('#howtoAlt'); await miss('title');
  await p.click('#mDrive'); await miss('routes'); await p.click('#rsGo'); await wait(p, () => __kb.state().playing); await p.waitForTimeout(300); await miss('driving');
  await p.evaluate(() => __train.finishRoute()); await wait(p, () => __kb.state().result, null, 10000); await miss('result'); await shot(p, '09-en-result');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function layouts(env) {
  console.log('10. every screen size x ja/en: nothing off screen, no sideways scroll');
  for (const vp of (process.env.TR_VPS || 'se1,a360s,se2,ip12,land,xr').split(',')) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang, touch: true }); const p = s.page; const tag = `${vp}/${lang}`;
    const probe = async what => { const r = await p.evaluate(`(${layoutProbe})()`); check(`${tag} ${what}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 4), h: r.hscroll }); return r; };
    await probe('title'); if (lang === 'ja') await shot(p, `10-${vp}-title`);
    await p.click('#mDrive'); await probe('routes'); if (lang === 'ja') await shot(p, `10-${vp}-routes`);
    await p.click('#rsGo'); await wait(p, () => __kb.state().playing); await p.waitForTimeout(400); await probe('driving'); if (lang === 'ja') await shot(p, `10-${vp}-drive`);
    await p.evaluate(() => { const E = __train.E, g = __train.G.st; for (let i = 0; i < 60 * 40; i++) E.step(g, E.autopilot(g)); }); await p.waitForTimeout(300); await probe('driving 40s'); if (lang === 'ja') await shot(p, `10-${vp}-drive2`);
    await p.evaluate(() => __train.finishRoute()); await wait(p, () => __kb.state().result, null, 10000); await probe('result'); if (lang === 'ja') await shot(p, `10-${vp}-result`);
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
  for (const f of [first, drive, touch, ats, routes, pause, english, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
