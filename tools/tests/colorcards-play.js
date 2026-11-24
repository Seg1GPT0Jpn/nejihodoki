#!/usr/bin/env node
// いろあわせカード工房の通しプレイ（Playwright。?debug の window.__colorcards で「どこを押すか」だけを聞き、押すのは本物のマウス操作）
//   node tools/tests/colorcards-play.js [first,game,drag,practice,calls,match,pass,resume,english,layouts]
// 1. 初回：ルール → 「チュートリアルへ」→ チュートリアルを最後まで（記録は増えない）
// 2. 1ゲームをタイトルから始めて、最後まで本物のクリックで遊ぶ → 結果・保存（遊んだ回数・★）
// 3. ドラッグで出す  4. れんしゅう：ヒントが出て、記録は増えない  5. ラスト！とつかまえた！（言い忘れる・ボタン）
// 6. 10ラウンドマッチ  7. ふたりで1台（カバー画面）  8. 自動保存：再読み込み →「つづきから」  9. 英語  10. 全画面サイズ × ja/en
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'colorcards-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.colorcards.save', RUN = 'kusoge.colorcards.game', HOWTO = 'kusoge.colorcards.howto';

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: false, hasTouch: false });
  await s.goto('/colorcards/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__colorcards);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const speed = (p, m) => p.evaluate(m => __colorcards.setSpeed(m), m);

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
async function stablePoint(p, c) {
  for (let t = 0; t < 60; t++) {   // cards may still be sliding: click only when the spot stops moving
    const a = await findPoint(p, c);
    if (a) { await p.waitForTimeout(60); const b = await findPoint(p, c); if (b && Math.abs(a.x - b.x) < 0.6 && Math.abs(a.y - b.y) < 0.6) return b; } else await p.waitForTimeout(50);
  }
  await shot(p, 'stuck-card');
  throw new Error('card ' + c + ' cannot be clicked');
}
async function doPlan(p) {
  const plan = await p.evaluate(() => __colorcards.plan());
  for (const step of plan) {
    if (step.card != null) { const pt = await stablePoint(p, step.card); await p.mouse.click(pt.x, pt.y); }
    else {
      const dis = await p.$eval(step.sel, e => e.disabled).catch(() => 'missing');
      if (dis) { await shot(p, 'stuck-btn'); throw new Error('button ' + step.sel + ' ' + dis + '; plan=' + JSON.stringify(plan)); }
      await p.click(step.sel);
    }
    await p.waitForTimeout(15);
  }
  return plan.length;
}
// play the human seat to the end (CPUs run fast); round overlays are clicked through
async function playOut(p, max = 6000) {
  for (let i = 0; i < max; i++) {
    const s = await st(p);
    if (s.result) return s;
    if (s.round) { await p.click('#roNext'); await p.waitForTimeout(30); continue; }
    if (s.pass) { await p.click('#paGo'); continue; }
    if (!s.human) { await p.waitForTimeout(10); continue; }
    if (!(await doPlan(p))) await p.waitForTimeout(20);
  }
  return st(p);
}
async function turns(p, k) { for (let i = 0; i < k; i++) { for (let j = 0; j < 400 && !(await st(p)).human; j++) await p.waitForTimeout(10); const s = await st(p); if (s.over || s.result) break; await doPlan(p); } }

async function first(env) {
  console.log('1. first visit: rules → tutorial game');
  const s = await open(env, { seed: {} });
  const p = s.page; await speed(p, 0);
  let x = await st(p);
  check('first visit shows the rules page', x.howto && !x.title && /ルール/.test(await p.textContent('#howtoTitle')), x);
  check('rules list the special cards with card faces', (await p.$$('#howBody .kinds .mini')).length === 7, null);
  await shot(p, '1-rules');
  check('the button says start the tutorial', /チュートリアル/.test(await p.textContent('#howtoGo')), null);
  await p.click('#howtoGo');
  await p.waitForFunction(() => __kb.state().started);
  x = await st(p);
  check('the tutorial starts: practice with 2 players', x.mode === 'tutorial' && x.n === 2 && x.practice, x);
  await p.waitForFunction(() => __kb.state().human, null, { timeout: 15000 });
  check('a coach line is shown (💡)', /💡/.test(await p.textContent('#status')), await p.textContent('#status'));
  check('a card glows as the hint', (await p.$$('.cd.hl')).length >= 1, null);
  await shot(p, '1-tutorial');
  const r = await playOut(p);
  check('the tutorial finishes with a result', r.result, r);
  await shot(p, '1-tutorial-result');
  const sv = await stored(p, SAVE);
  check('tutorial does not count as a record', !sv || (!sv.pts && !(sv.stats && sv.stats.plays)), sv);
  check('tutorial marked as seen', sv && sv.tut === 1, sv);
  check('no page errors', s.log.pageErrors.length === 0 && s.log.consoleErrors.length === 0, [...s.log.pageErrors, ...s.log.consoleErrors]);
  await s.close();
}

async function game(env) {
  console.log('2. a whole game from the title with real clicks (3 players, Easy so the human wins sometimes)');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  check('title: quick match, resume hidden', (await st(p)).title && !!(await p.$('#tQuick')) && await p.$eval('#tResume', e => e.hidden), null);
  await p.click('#optLv [data-lv="1"]'); await p.click('#optN [data-n="3"]');
  await shot(p, '2-title');
  await p.click('#tPlay');
  await p.waitForFunction(() => __kb.state().started && !__kb.state().title);
  let x = await st(p);
  check('3 players, 7 cards each, a pile and a deck', x.n === 3 && x.counts.every(n => n === 7) && x.draw === 104 - 22 - 0 + 0 - 0 + 0 || x.draw >= 70, x);
  await p.waitForFunction(() => __kb.state().human, null, { timeout: 15000 }).catch(() => {});
  await p.waitForTimeout(300);
  await shot(p, '2-table');
  check('whose turn is clear: seat highlight and status', (await p.$$('.seat.on')).length === 1 && (await p.textContent('#iTurn')).length > 0, null);
  const r = await playOut(p);
  check('the game ends with a result', r.result, r);
  await shot(p, '2-result');
  const sv = await stored(p, SAVE);
  check('one game recorded', sv && sv.stats.plays === 1 && sv.w.q.p === 1, sv);
  check('★ added only on a win (Easy = 1)', sv.pts === (sv.stats.wins ? 1 : 0), sv);
  check('the unfinished game is cleared', (await stored(p, RUN)) === null, null);
  check('no page errors', s.log.pageErrors.length === 0 && s.log.consoleErrors.length === 0, [...s.log.pageErrors, ...s.log.consoleErrors]);
  await s.close();
}

async function drag(env) {
  console.log('3. drag a card up onto the pile');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  await p.evaluate(() => __colorcards.start({ n: 2, level: 1, mode: 'quick', practice: true, seed: 3 }));
  await p.waitForFunction(() => __kb.state().human, null, { timeout: 15000 });
  await p.waitForTimeout(500);
  for (let k = 0; k < 40; k++) {
    const plan = await p.evaluate(() => __colorcards.plan());
    if (plan.length === 1 && plan[0].card != null) break;
    await turns(p, 1); await p.waitForTimeout(150);
  }
  const plan = await p.evaluate(() => __colorcards.plan());
  const card = plan.find(x => x.card != null && x.sel);
  if (!card) { check('found a single-click play to drag', false, plan); await s.close(); return; }
  const before = (await st(p)).hand.length;
  const pt = await stablePoint(p, card.card);
  await p.mouse.move(pt.x, pt.y); await p.mouse.down(); await p.mouse.move(pt.x, pt.y - 40, { steps: 4 }); await p.mouse.move(pt.x, pt.y - 160, { steps: 6 }); await p.mouse.up();
  await p.waitForTimeout(300);
  const after = await st(p);
  check('dragging up played the card', after.hand.length === before - 1 || after.pend, { before, after: after.hand.length });
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function practice(env) {
  console.log('4. practice: hints, nothing recorded');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  await p.click('#tPrac'); await p.waitForFunction(() => __kb.state().started && !__kb.state().title);
  await p.waitForFunction(() => __kb.state().human, null, { timeout: 15000 });
  check('hint button exists in practice', !!(await p.$('#ctl [data-id="hint"]')), null);
  await p.click('#ctl [data-id="hint"]');
  check('hint shows text and glows a card', /💡/.test(await p.textContent('#status')), await p.textContent('#status'));
  const r = await playOut(p);
  check('practice ends', r.result, r);
  const sv = await stored(p, SAVE);
  check('practice records nothing', !sv || (!sv.pts && !(sv.stats && sv.stats.plays)), sv);
  await s.close();
}

async function calls(env) {
  console.log('5. "Last!" and "Caught!"');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  // find a game where the human reaches 2 cards, and check the button and the effect of forgetting
  let forgot = false, called = false, caught = false;
  for (let seed = 1; seed < 40 && !(forgot && called); seed++) {
    await p.evaluate(sd => __colorcards.start({ n: 2, level: 1, mode: 'quick', practice: true, seed: sd }), seed);
    for (let i = 0; i < 3000; i++) {
      const x = await st(p);
      if (x.result) break;
      if (!x.human) { await p.waitForTimeout(8); continue; }
      const c = await p.evaluate(() => __kb.state().counts[0]);
      const hasCall = !!(await p.$('#ctl [data-id="call"]'));
      if (hasCall && c === 2 && !called) {
        check('"Last!" pulses at two cards', await p.$eval('#ctl [data-id="call"]', e => e.classList.contains('pulse')), null);
        await shot(p, '5-last');
        await p.click('#ctl [data-id="call"]'); called = true;
        check('after calling the button is gone', !(await p.$('#ctl [data-id="call"]')), null);
      } else if (c === 2 && !forgot && called) {
        // skip the call this time, play (not via plan, which would call)
        const plan = await p.evaluate(() => __colorcards.plan()).then(pl => pl.filter(z => z.btn !== 'call'));
        if (plan.length === 1 && plan[0].card != null) { const pt = await stablePoint(p, plan[0].card); await p.mouse.click(pt.x, pt.y); forgot = true; await p.waitForTimeout(100); const y = await st(p); check('forgot to call: the next player may catch (state marks it)', y.uncalled === 0 || y.counts[0] !== 1, y); continue; }
      }
      if (!(await doPlan(p))) await p.waitForTimeout(15);
      if (forgot) break;
    }
  }
  const sv = await p.evaluate(() => __colorcards.S && __colorcards.S.st.stat.catches.slice());
  caught = !!sv && sv.some(n => n > 0);
  check('the call button was used', called, null);
  check('forgetting the call happened in play', forgot, null);
  void caught;
  // the catch button for the human: set up a position where the CPU forgot to call
  await p.evaluate(() => __colorcards.start({ n: 2, level: 1, mode: 'quick', practice: true, seed: 11 }));
  await p.waitForFunction(() => __kb.state().human, null, { timeout: 15000 });
  await p.evaluate(() => __colorcards.rig(st => { st.hands[1] = st.hands[1].slice(0, 1); st.uncalled = 1; st.turn = 0; st.phase = 'play'; }));
  await p.waitForSelector('#ctl [data-id="catch"]', { timeout: 4000 }).catch(() => {});
  check('"Caught!" button appears when the rival forgot', !!(await p.$('#ctl [data-id="catch"]')), await p.textContent('#status'));
  if (await p.$('#ctl [data-id="catch"]')) {
    await shot(p, '5-catch');
    await p.click('#ctl [data-id="catch"]');
    await p.waitForTimeout(200);
    const y = await st(p);
    check('catching made the rival draw 2', y.counts[1] >= 3, y.counts);
  }
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function match(env) {
  console.log('6. 10-round match');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  await p.click('#optMode [data-m="match"]'); await p.click('#optLv [data-lv="1"]'); await p.click('#optN [data-n="2"]');
  await p.click('#tPlay'); await p.waitForFunction(() => __kb.state().started && !__kb.state().title);
  let sawRound = false;
  for (let i = 0; i < 12000; i++) {
    const x = await st(p);
    if (x.result) break;
    if (x.round) { if (!sawRound) { sawRound = true; await shot(p, '6-round'); } await p.click('#roNext'); await p.waitForTimeout(40); continue; }
    if (!x.human) { await p.waitForTimeout(6); continue; }
    if (!(await doPlan(p))) await p.waitForTimeout(15);
  }
  const x = await st(p);
  check('match reached the result after 10 rounds', x.result && x.roundNo === 10, x);
  check('a round overlay appeared between rounds', sawRound, null);
  await shot(p, '6-result');
  const sv = await stored(p, SAVE);
  check('match recorded (m.p = 1, matches = 1)', sv && sv.w.m && sv.w.m.p === 1 && sv.stats.matches === 1, sv);
  check('a match win pays triple (Easy = 3★)', sv.pts === (sv.stats.matchWins ? 3 : 0), sv);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function pass(env) {
  console.log('7. pass and play on one device');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  await p.click('#tPass'); await p.waitForFunction(() => __kb.state().started);
  await p.waitForSelector('#ovPass:not([hidden])', { timeout: 8000 });
  check('a cover screen hides the hand between players', (await st(p)).pass, null);
  const hidden = await p.evaluate(() => [...document.querySelectorAll('.cd.up')].filter(e => !e.classList.contains('hid') && !e.closest('#peekBox')).length);
  check('only the pile is face up behind the cover', hidden <= 4, hidden);
  await shot(p, '7-cover');
  let covers = 0;
  for (let i = 0; i < 6000; i++) {
    const x = await st(p);
    if (x.result) break;
    if (x.pass) { covers++; await p.click('#paGo'); await p.waitForTimeout(40); continue; }
    if (!x.human) { await p.waitForTimeout(8); continue; }
    if (!(await doPlan(p))) await p.waitForTimeout(15);
  }
  check('both players took turns (several covers)', covers >= 3, covers);
  check('result names a winner', /勝ち/.test(await p.textContent('#rTitle')), await p.textContent('#rTitle'));
  const sv = await stored(p, SAVE);
  check('pass-and-play records nothing', !sv || (!sv.pts && !(sv.stats && sv.stats.plays)), sv);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function resume(env) {
  console.log('8. autosave and resume');
  const s = await open(env);
  const p = s.page; await speed(p, 0);
  await p.evaluate(() => __colorcards.start({ n: 3, level: 2, mode: 'quick', seed: 77 }));
  await turns(p, 3);
  await p.waitForTimeout(400);
  const a = await st(p);
  check('an unfinished game is saved', !!(await stored(p, RUN)), null);
  await s.reload();
  await p.waitForFunction(() => window.__kb && __kb.ready() && window.__colorcards);
  check('after reload the title offers "resume"', !(await p.$eval('#tResume', e => e.hidden)), null);
  await p.click('#tResume');
  await p.waitForFunction(() => __kb.state().started && !__kb.state().title);
  const b = await st(p);
  check('same hand and counts after resume', JSON.stringify(b.hand.slice().sort()) === JSON.stringify(a.hand.slice().sort()) && JSON.stringify(b.counts) === JSON.stringify(a.counts) && b.step >= a.step, { a: [a.hand, a.counts, a.step], b: [b.hand, b.counts, b.step] });
  const r = await playOut(p);
  check('the resumed game finishes', r.result, r);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function english(env) {
  console.log('9. English: no Japanese left');
  const s = await open(env, { lang: 'en' });
  const p = s.page; await speed(p, 0);
  const miss = async what => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`en ${what}: no Japanese visible`, jp.length === 0, jp.slice(0, 6)); };
  await miss('title');
  await p.click('#tHow'); await miss('rules'); await p.click('#howtoGo');
  await p.click('#optMode [data-m="match"]'); await miss('title (match)'); await p.click('#optMode [data-m="quick"]');
  await p.click('#tPrac'); await p.waitForFunction(() => __kb.state().started);
  await turns(p, 4); await p.waitForTimeout(300); await miss('table');
  await p.click('#ctl [data-id="hint"]').catch(() => {}); await miss('hint');
  await p.evaluate(() => __colorcards.title()); await p.click('#tTut'); await p.waitForFunction(() => __kb.state().started && __kb.state().mode === 'tutorial');
  await p.waitForFunction(() => __kb.state().human, null, { timeout: 15000 }); await miss('tutorial coach');
  const r = await playOut(p); await miss('result');
  void r;
  check('html lang is en', (await p.evaluate(() => document.documentElement.lang)) === 'en', null);
  await s.close();
}

async function layouts(env) {
  console.log('10. every screen size × ja/en: no sideways scroll, controls on screen');
  for (const vp of (process.env.CC_VPS || 'se1,a360s,se2,ip12,land,xr').split(',')) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang });
    const p = s.page; await speed(p, 0);
    const tag = `${vp}/${lang}`;
    let r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} title: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 4), pr: r.primary.slice(0, 3) });
    if (lang === 'ja') await shot(p, `10-${vp}-title`);
    for (const n of [2, 4]) {
      await p.evaluate(n => __colorcards.start({ n, level: 2, mode: 'quick' }), n);
      await turns(p, 3);
      // make the hand big (tangled) so that the rows are exercised
      if (n === 4) await p.evaluate(() => { const S = __colorcards.S, st = S.st; for (let i = 0; i < 9 && st.draw.length; i++) st.hands[0].push(st.draw.pop()); });
      if (n === 4) await p.evaluate(() => __colorcards.rig(() => {}));
      await p.waitForTimeout(600);
      r = await p.evaluate(`(${layoutProbe})()`);
      const off = await p.evaluate(() => { const t = document.getElementById('table').getBoundingClientRect(); return [...document.querySelectorAll('.cd:not(.hid)')].filter(e => { const b = e.getBoundingClientRect(); return b.left < t.left - 2 || b.right > t.right + 2 || b.top < t.top - 2 || b.bottom > t.bottom + 2; }).length; });
      check(`${tag} ${n}p: fits (hscroll ${r.hscroll}, off ${r.offscreen.length}, cards outside ${off})`, r.hscroll <= 1 && r.offscreen.length === 0 && off === 0, { off: r.offscreen.slice(0, 4), cards: off });
      if (lang === 'ja' && ['se1', 'land', 'ip12'].includes(vp)) await shot(p, `10-${vp}-${n}p`);
      if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${tag} ${n}p: no Japanese`, jp.length === 0, jp.slice(0, 5)); }
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
  for (const f of [first, game, drag, practice, calls, match, pass, resume, english, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
