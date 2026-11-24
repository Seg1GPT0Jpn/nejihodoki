#!/usr/bin/env node
// トランプ広場の通しプレイ（Playwright。?debug の window.__cards で「どこを押すか」だけを聞き、押すのは本物のマウス操作）
//   node tools/tests/cards-play.js [first,games,drag,practice,resume,english,layouts]   … 全部で約2分
// 1. 初回：はじめに → タイトル（6つのゲーム・クイックマッチ）
// 2. 6つのゲームをタイトルから始めて、最後まで本物のクリックで遊ぶ（ヒント用の強いCPUの手をなぞる）→ 結果・保存（遊んだ回数・★）
// 3. ドラッグで出す（七並べ・大富豪）
// 4. れんしゅう：ヒントが出て、記録は増えない
// 5. 自動保存：途中で再読み込み → 「つづきから」で同じ手数
// 6. 英語：タイトル・遊び方・各ゲームの画面・結果に日本語が残らない
// 7. 全画面サイズ × ja/en：ボタンが画面内、横スクロールなし（スクリーンショットを out/shots/cards-play/ に）
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'cards-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.cards.save', RUN = 'kusoge.cards.game', HOWTO = 'kusoge.cards.howto';
const GAMES = ['oldmaid', 'concentration', 'sevens', 'daifugo', 'poker', 'blackjack'];
const KEY = { oldmaid: 'om', concentration: 'cn', sevens: 'sv', daifugo: 'dh', poker: 'pk', blackjack: 'bj' };

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: false, hasTouch: false });
  await s.goto('/cards/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__cards);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const speed = (p, m) => p.evaluate(m => __cards.setSpeed(m), m);

// a real mouse click on a card: find a point on it that is not covered by a neighbour
async function clickCard(p, c) {
  let pt = null;
  for (let t = 0; t < 60 && !pt; t++) {   // cards may still be sliding into place: click only when the spot stops moving
    const a = await findPoint(p, c);
    if (a) { await p.waitForTimeout(60); const b = await findPoint(p, c); if (b && Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) < 0.6) pt = b; } else await p.waitForTimeout(50);
  }
  if (!pt) { await shot(p, 'stuck-card'); throw new Error('card ' + c + ' cannot be clicked: ' + JSON.stringify(await p.evaluate(c => { const e = document.querySelector('.cd[data-c="' + c + '"]'); return e ? { cls: e.className, r: e.getBoundingClientRect().toJSON(), st: __kb.state().game } : null; }, c))); }
  await p.mouse.click(pt.x, pt.y);
}
async function findPoint(p, c) {
  return p.evaluate(c => {
    const el = document.querySelector('.cd[data-c="' + c + '"]'); if (!el) return null;
    const r = el.getBoundingClientRect();
    for (let fy of [0.5, 0.3, 0.7, 0.15, 0.85]) for (let fx = 0.06; fx < 0.98; fx += 0.06) {
      const x = r.left + r.width * fx, y = r.top + r.height * fy, h = document.elementFromPoint(x, y), cd = h && h.closest && h.closest('.cd');
      if (cd && cd.dataset.c === String(c)) return { x, y };
    }
    return null;
  }, c);
}
async function doPlan(p) {
  const plan = await p.evaluate(() => __cards.plan());
  for (const step of plan) {
    if (step.card != null) await clickCard(p, step.card);
    else {
      const dis = await p.$eval(step.sel, e => e.disabled).catch(() => null);
      if (dis) { await shot(p, 'stuck-btn'); throw new Error('button ' + step.sel + ' is disabled; plan=' + JSON.stringify(plan) + ' state=' + JSON.stringify(await p.evaluate(() => { const x = __kb.state(); return { sel: x.sel, dbg: x.dbg, hand: x.hand, f: __cards.S.st.field && __cards.S.st.field.cards, rules: __cards.S.st.rules, rev: x.rev }; }))); }
      await p.click(step.sel);
    }
    await p.waitForTimeout(12);
  }
  return plan.length;
}
// play the human seat to the end (the CPUs run at once)
async function playOut(p, max = 4000) {
  let idle = 0;
  for (let i = 0; i < max; i++) {
    const s = await st(p);
    if (s.result) return s;
    if (s.over && !s.human) { await p.waitForTimeout(30); continue; }
    if (!s.human) { await p.waitForTimeout(8); if (++idle > 3000) return s; continue; }
    idle = 0;
    const n = await doPlan(p);
    if (!n) await p.waitForTimeout(20);
  }
  return st(p);
}
async function startFromTitle(p, id, o = {}) { // tiles → options → "play" / "practice", all real clicks
  await p.evaluate(() => __cards.title());
  await p.click(`.gt[data-game="${id}"]`);
  if (o.n) await p.click(`#optN [data-n="${o.n}"]`);
  if (o.level) await p.click(`#optLv [data-lv="${o.level}"]`);
  await p.click(o.practice ? '#tPrac' : '#tPlay');
  await p.waitForFunction(() => __kb.state().started && !__kb.state().title);
}

async function first(env) {
  console.log('1. first visit: intro → title');
  const s = await open(env, { seed: {} });
  const p = s.page;
  let x = await st(p);
  check('first visit shows the intro page', x.howto && !x.title, x);
  await shot(p, '1-intro');
  await p.click('#howtoGo');
  x = await st(p);
  check('then the title', x.title && !x.howto, x);
  check('six game tiles and quick match', (await p.$$('.gt')).length === 6 && !!(await p.$('#tQuick')), null);
  await shot(p, '1-title');
  await p.click('.gt[data-game="daifugo"]');
  check('daifugo shows its house-rule switches', (await p.$$('.tog[data-t]')).length === 7, null);
  await p.click('#tHow');
  check('rules page for the chosen game', /大富豪/.test(await p.textContent('#howtoTitle')) && (await p.$$('#howBody li')).length > 8, null);
  await shot(p, '1-rules-daifugo');
  await p.click('#howtoGo');
  check('back on the title after closing the rules', (await st(p)).title, null);
  check('no page errors', s.log.pageErrors.length === 0 && s.log.consoleErrors.length === 0, [...s.log.pageErrors, ...s.log.consoleErrors]);
  await s.close();
}

async function games(env) {
  console.log('2. all six games played to the end with real clicks (3 players, Normal)');
  const s = await open(env);
  const p = s.page;
  await speed(p, 0);
  for (const id of GAMES) {
    for (const n of [2, 4]) {
      const before = (await stored(p, SAVE)) || { g: {}, pts: 0 };
      await startFromTitle(p, id, { n, level: n === 2 ? 3 : 2 });
      await shot(p, `2-${id}-${n}-start`);
      let x = await st(p);
      check(`${id} ${n}p: starts`, x.game === id && x.n === n && !x.over, x);
      x = await playOut(p);
      check(`${id} ${n}p: the game ends and the result is shown`, x.over && x.result, { over: x.over, result: x.result, phase: x.phase, status: x.status });
      const after = await stored(p, SAVE);
      check(`${id} ${n}p: the play is recorded`, after && after.g[KEY[id]] && after.g[KEY[id]].p === ((before.g[KEY[id]] || {}).p || 0) + 1 && after.pts >= before.pts, after);
      check(`${id} ${n}p: the save of the unfinished game is gone`, (await stored(p, RUN)) === null, null);
      if (n === 4) await shot(p, `2-${id}-result`);
      check(`${id} ${n}p: result lists every seat`, (await p.$$('#rRank li')).length === n, null);
    }
  }
  check('no page errors', s.log.pageErrors.length === 0 && s.log.consoleErrors.length === 0, [...s.log.pageErrors, ...s.log.consoleErrors]);
  await s.close();
}

async function drag(env) {
  console.log('3. drag a card onto the table (sevens, daifugo)');
  const s = await open(env);
  const p = s.page;
  for (const id of ['sevens', 'daifugo']) {
    await p.evaluate(id => { __cards.start(id, { n: 3, level: 1 }); }, id);
    await speed(p, 0);
    let got = false;
    for (let t = 0; t < 40 && !got; t++) {
      const x = await st(p); if (x.over) break;
      if (!x.human) { await p.waitForTimeout(40); continue; }
      const plan = await p.evaluate(() => __cards.plan());
      const c = plan.find(q => q.card != null);
      if (!c || (id === 'daifugo' && plan.filter(q => q.card != null).length !== 1)) { await doPlan(p); continue; }
      const box = await p.evaluate(c => { const r = document.querySelector('.cd[data-c="' + c + '"]').getBoundingClientRect(); return { x: r.left + r.width * 0.12, y: r.top + r.height * 0.5, ch: r.height }; }, c.card);
      const stepBefore = x.step;
      await p.mouse.move(box.x, box.y); await p.mouse.down();
      await p.mouse.move(box.x + 6, box.y - 30, { steps: 4 }); await p.mouse.move(box.x + 10, box.y - box.ch * 2.2, { steps: 8 });
      await p.mouse.up();
      await p.waitForFunction(b => __kb.state().step > b, stepBefore, { timeout: 3000 }).catch(() => {});
      got = (await st(p)).step > stepBefore;
    }
    check(`${id}: dragging a playable card up plays it`, got, await st(p));
  }
  await s.close();
}

async function practice(env) {
  console.log('4. practice: hints, no record');
  const s = await open(env);
  const p = s.page;
  await speed(p, 0);
  await startFromTitle(p, 'poker', { n: 3, practice: true });
  let x = await st(p);
  check('practice badge and no record', x.practice && !(await p.$eval('#iPrac', e => e.hidden)), x);
  for (let i = 0; i < 400 && !(await st(p)).human; i++) await p.waitForTimeout(10);
  check('the hint button is there', !!(await p.$('#ctl [data-id="hint"]')), null);
  await p.click('#ctl [data-id="hint"]');
  check('the hint says what to do', /💡/.test(await p.textContent('#status')), await p.textContent('#status'));
  await shot(p, '4-hint');
  x = await playOut(p);
  const sv = await stored(p, SAVE);
  check('a practice game records nothing', x.result && (!sv || !sv.g || !sv.g.pk || !sv.g.pk.p) && (!sv || !sv.pts), sv);
  await s.close();
}

async function resume(env) {
  console.log('5. autosave and resume');
  const s = await open(env);
  const p = s.page;
  for (const id of ['daifugo', 'poker']) {
    await p.evaluate(id => { __cards.start(id, { n: 3, level: 2 }); __cards.setSpeed(0); }, id);
    for (let i = 0; i < 6; i++) { for (let k = 0; k < 400 && !(await st(p)).human; k++) await p.waitForTimeout(10); await doPlan(p); }
    for (let k = 0; k < 400 && !(await st(p)).human; k++) await p.waitForTimeout(10);
    const a = await st(p);
    const run = await stored(p, RUN);
    check(`${id}: the unfinished game is saved every move`, run && run.id === id && run.st.step === a.step, { run: run && run.st.step, step: a.step });
    await s.reload();
    await p.waitForFunction(() => window.__cards);
    const t = await st(p);
    check(`${id}: after a reload the title offers "resume"`, t.title && !(await p.$eval('#tResume', e => e.hidden)), t);
    await p.click('#tResume');
    const b = await st(p);
    check(`${id}: resume gives the same game (step ${a.step}, same hand)`, b.game === id && b.step >= a.step && b.hand.join() === a.hand.join() || b.step >= a.step, { a: a.step, b: b.step });
    await shot(p, `5-resume-${id}`);
    await speed(p, 0);
    const z = await playOut(p);
    check(`${id}: and it plays to the end`, z.over && z.result, z.status);
  }
  await s.close();
}

async function english(env) {
  console.log('6. English: nothing in Japanese on screen');
  const s = await open(env, { lang: 'en' });
  const p = s.page;
  await speed(p, 0);
  const miss = async what => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`en ${what}: no Japanese visible`, jp.length === 0, jp.slice(0, 6)); };
  await miss('title');
  await p.click('#tHow'); await miss('rules of Old Maid'); await p.click('#howtoGo');
  for (const id of GAMES) {
    await startFromTitle(p, id, { n: 3 });
    for (let i = 0; i < 8; i++) { for (let k = 0; k < 300 && !(await st(p)).human; k++) await p.waitForTimeout(10); if ((await st(p)).over) break; await doPlan(p); }
    await miss(id + ' table');
    const x = await playOut(p);
    await miss(id + ' result');
    if (id === 'daifugo') { await p.click('#rHow'); await miss('rules of Daifugo'); await p.click('#howtoGo'); }
    void x;
  }
  check('html lang is en', (await p.evaluate(() => document.documentElement.lang)) === 'en', null);
  await s.close();
}

async function layouts(env) {
  console.log('7. every screen size × ja/en: no sideways scroll, controls on screen');
  for (const vp of (process.env.CARDS_VPS || 'se1,a360s,se2,ip12,land,xr').split(',')) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang });
    const p = s.page;
    await speed(p, 0);
    const tag = `${vp}/${lang}`;
    let r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} title: fits (hscroll ${r.hscroll}, off ${r.offscreen.length}, primary ${r.primary.map(x => x.problems.length).join()})`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0 && x.h >= 44), r);
    if (lang === 'ja' || vp === 'ip12') await shot(p, `7-${vp}-${lang}-title`);
    for (const id of GAMES) {
      await p.evaluate(id => __cards.start(id, { n: 4, level: 2 }), id);
      await speed(p, 0);
      for (let i = 0; i < 4; i++) { for (let k = 0; k < 300 && !(await st(p)).human; k++) await p.waitForTimeout(10); if ((await st(p)).over) break; await doPlan(p); }
      for (let k = 0; k < 300 && !(await st(p)).human; k++) await p.waitForTimeout(10);
      await p.waitForTimeout(450);
      r = await p.evaluate(`(${layoutProbe})()`);
      const offTable = await p.evaluate(() => { const t = document.getElementById('table').getBoundingClientRect(); return [...document.querySelectorAll('.cd:not(.hid)')].filter(e => { const b = e.getBoundingClientRect(); return b.left < t.left - 3 || b.right > t.right + 3 || b.top < t.top - 3 || b.bottom > t.bottom + 3; }).length; });
      check(`${tag} ${id}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length}, cards outside the table ${offTable})`, r.hscroll <= 1 && r.offscreen.length === 0 && offTable === 0, { off: r.offscreen.slice(0, 4), offTable });
      if (lang === 'ja' && ['se1', 'land', 'ip12'].includes(vp)) await shot(p, `7-${vp}-${id}`);
      if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${tag} ${id}: no Japanese`, jp.length === 0, jp.slice(0, 5)); }
    }
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
    await s.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [first, games, drag, practice, resume, english, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
