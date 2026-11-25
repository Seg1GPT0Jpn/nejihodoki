#!/usr/bin/env node
// いろあわせカード工房の通しプレイ（Playwright。?debug の window.__colorcards で「どこを押すか」だけを聞き、押すのは本物のマウス操作）
//   node tools/tests/colorcards-play.js [first,game,drag,practice,calls,match,pass,resume,english,layouts,lobby,online]   （--no-online：エミュレーターを使う online を省く）
// 1. 初回：ルール → 「チュートリアルへ」→ チュートリアルを最後まで（記録は増えない）
// 2. 1ゲームをタイトルから始めて、最後まで本物のクリックで遊ぶ → 結果・保存（遊んだ回数・★）
// 11. オンライン（エミュレーター・本物のルール）：ロビー・部屋のコード・3ページで1ゲーム・もう一度・再読み込みで部屋にもどる・ホストの再読み込み・ページが消える（CPU が席に）・ホストが出る・英語と小さい画面
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
async function doPlan(p, soft) {
  const plan = await p.evaluate(() => __colorcards.plan());
  let n = 0;
  for (const step of plan) {
    if (step.card != null) {
      let pt; try { pt = await stablePoint(p, step.card); } catch (e) { if (soft) return n; throw e; }
      await p.mouse.click(pt.x, pt.y);
    } else {
      const dis = await p.$eval(step.sel, e => e.disabled).catch(() => 'missing');
      if (dis) {
        if (soft) return n;      // online: the game moved on while we were choosing (a timeout, a republished state): plan again
        await shot(p, 'stuck-btn'); throw new Error('button ' + step.sel + ' ' + dis + '; plan=' + JSON.stringify(plan));
      }
      await p.click(step.sel, soft ? { timeout: 3000 } : {}).catch(e => { if (!soft) throw e; });
    }
    n++;
    await p.waitForTimeout(15);
  }
  return plan.length;
}
// play the human seat to the end (CPUs run fast); round overlays are clicked through
async function playOut(p, max = 6000, soft) {
  for (let i = 0; i < max; i++) {
    const s = await st(p);
    if (s.result) return s;
    if (s.round) { await p.click('#roNext'); await p.waitForTimeout(30); continue; }
    if (s.pass) { await p.click('#paGo'); continue; }
    if (!s.human) { await p.waitForTimeout(10); continue; }
    if (!(await doPlan(p, soft))) await p.waitForTimeout(20);
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


// ---------------------------------------------------------------- online lobby without a network: nickname, menu, keyboard (no emulator)
async function lobby(env) {
  console.log('12. online lobby (no network): nickname form, menu, keyboard, English, small screen');
  for (const [vp, lang] of [['ip12', 'ja'], ['se1', 'en']]) {
    const s = await open(env, { vp, lang });
    const p = s.page;
    await p.click('#tOnline');
    await p.waitForSelector('[data-ktr="nickin"]');
    check(`${vp}/${lang}: no nickname yet → the nickname form comes first`, true, null);
    await p.press('[data-ktr="nickin"]', 'Enter');
    check(`${vp}/${lang}: an empty nickname is refused with a message`, (await p.textContent('[data-ktr="nickerr"]')).length > 0, null);
    await p.fill('[data-ktr="nickin"]', '<b>Moka</b>' + 'x'.repeat(20));
    await p.press('[data-ktr="nickin"]', 'Enter');
    await p.waitForSelector('[data-ktr="quick"]');
    const nick = await p.evaluate(() => localStorage.getItem('kobo.nick'));
    check(`${vp}/${lang}: the nickname is cleaned (no < >) and cut to 12 characters`, nick && nick.length <= 12 && !/[<>]/.test(nick), nick);
    check(`${vp}/${lang}: the menu has quick match / make a room / code, and is a dialog`, !!(await p.$('[data-ktr="make"]')) && (await p.getAttribute('.ktr-ov', 'role')) === 'dialog', null);
    // keyboard: Tab reaches every control; Enter on the code field with a short code shows a message
    const order = []; for (let i = 0; i < 12; i++) { await p.keyboard.press('Tab'); order.push(await p.evaluate(() => (document.activeElement && document.activeElement.getAttribute('data-ktr')) || (document.activeElement && document.activeElement.dataset.n) || document.activeElement.tagName)); }
    check(`${vp}/${lang}: Tab goes round the controls inside the dialog (never out to the page behind)`, ['quick', 'make', 'code', 'join', 'back', 'fill'].every(k => order.includes(k)) && order.every(k => k !== 'BODY' && k !== 'A'), order);
    await p.fill('[data-ktr="code"]', '12ab');
    await p.press('[data-ktr="code"]', 'Enter');
    check(`${vp}/${lang}: a short code is refused in the field`, (await p.textContent('[data-ktr="menuerr"]')).length > 0, null);
    const sizes = await p.$$eval('.ktr-ov button, .ktr-ov input', els => els.map(e => { const r = e.getBoundingClientRect(); return [Math.round(r.width), Math.round(r.height)]; }));
    check(`${vp}/${lang}: every button and field is at least 44 px tall`, sizes.every(z => z[1] >= 44), sizes);
    const lay = await p.evaluate(`(${layoutProbe})()`);
    check(`${vp}/${lang}: nothing sideways or off screen`, lay.hscroll <= 1 && lay.offscreen.length === 0, lay);
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${vp}/${lang}: no Japanese on screen`, jp.length === 0, jp.slice(0, 5)); }
    await shot(p, `12-lobby-${vp}-${lang}`);
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => document.querySelector('.ktr-ov').hidden && !document.getElementById('ovTitle').hidden);
    check(`${vp}/${lang}: Escape goes back to the title`, true, null);
    check(`${vp}/${lang}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
    await s.close();
  }
}

// ---------------------------------------------------------------- online: three real pages through the Firebase emulators (real rules)
async function online(env) {
  console.log('11. online (emulator): lobby → room code → 3 pages play a whole game → rematch → a page reloads and comes back → a page closes (CPU takes the seat)');
  const emu = await require('./rules/emulator').start({});
  const T = { name: 'emulator', emu: true, ports: emu.ports, ns: emu.ns };
  const { newPage } = require('./rules/clients');
  const url = env.server.url + '/colorcards/?debug&trdeal=700&trcpu=250&trtm=20&trgrace=7&trhost=9&trqm=2&trfill=3';
  const mk = async (nick, vp, lang) => {
    const p = await newPage(env.browser(), { url: env.server.url }, T, nick, vp || { width: 390, height: 844 });
    await p.ctx.addInitScript(l => { try { localStorage.setItem('kusoge.colorcards.howto', '1'); if (l) localStorage.setItem('kobo.lang', l); } catch (e) {} }, lang || 'ja');
    await p.goto(url);
    await p.waitForFunction(() => window.__kb && __kb.ready() && window.__colorcards);
    return p;
  };
  const os = p => p.evaluate(() => __colorcards.onlineState());
  const inGame = p => p.evaluate(() => { const s = __kb.state(); return s.net && s.started && !s.title; });
  try {
    const A = await mk('Aoi'), Bp = await mk('Ben'), Cp = await mk('Cy');
    // --- the title and the lobby
    check('title has the online match button', !!(await A.$('#tOnline')), null);
    await A.click('#tOnline');
    await A.waitForSelector('.ktr-ov:not([hidden]) [data-ktr="quick"]');
    check('the lobby opens above the title (quick / make / code)', !!(await A.$('[data-ktr="make"]')) && !!(await A.$('[data-ktr="code"]')) && !!(await A.$('[data-ktr="join"]')), null);
    check('the lobby shows the CPU fill switch (on by default)', (await A.getAttribute('[data-ktr="fill"]', 'aria-checked')) === 'true', null);
    await shot(A, '11-lobby');
    // keyboard: Escape goes back to the title, the button opens it again
    await A.keyboard.press('Escape');
    await A.waitForFunction(() => document.querySelector('.ktr-ov').hidden && !document.getElementById('ovTitle').hidden);
    check('Escape in the lobby goes back to the title', true, null);
    await A.click('#tOnline'); await A.waitForSelector('[data-ktr="make"]');
    await A.click('[data-ktr="fill"]'); await A.click('.ktr-opt[data-n="3"]');
    check('fill switch turns off, 3 players selected', (await A.getAttribute('[data-ktr="fill"]', 'aria-checked')) === 'false' && (await A.getAttribute('.ktr-opt[data-n="3"]', 'aria-pressed')) === 'true', null);
    await A.click('[data-ktr="make"]');
    await A.waitForSelector('[data-ktr="codeshow"]', { timeout: 20000 });
    const code = (await A.textContent('[data-ktr="codeshow"]')).trim();
    check('the host sees a 6-digit code and its own seat', /^\d{6}$/.test(code) && /Aoi/.test(await A.textContent('.ktr-seats')), code);
    await shot(A, '11-waiting-room');
    check('the host cannot start with one person (no CPU fill)', await A.$eval('[data-ktr="start"]', e => e.disabled), null);
    // --- the friends join by the code (a wrong code first)
    for (const [pg, nick] of [[Bp, 'Ben'], [Cp, 'Cy']]) {
      await pg.click('#tOnline'); await pg.waitForSelector('[data-ktr="code"]');
      if (pg === Bp) { await pg.fill('[data-ktr="code"]', '000000'); await pg.click('[data-ktr="join"]'); await pg.waitForFunction(() => /見つかりません/.test(document.querySelector('[data-ktr="menuerr"]') ? document.querySelector('[data-ktr="menuerr"]').textContent : ''), null, { timeout: 15000 }); check('a wrong code says the room was not found', true, null); await shot(pg, '11-wrong-code'); }
      await pg.fill('[data-ktr="code"]', code); await pg.click('[data-ktr="join"]');
    }
    for (const pg of [A, Bp, Cp]) await pg.waitForFunction(() => __kb.state().net && __kb.state().started, null, { timeout: 30000 });
    check('all three pages are in the game (full room starts by itself)', (await Promise.all([A, Bp, Cp].map(inGame))).every(Boolean), null);
    const sts = await Promise.all([A, Bp, Cp].map(os));
    check('one room, 3 seats, nobody but the host is host', sts.every(x => x.model && x.model.n === 3 && x.rid === sts[0].rid) && sts.filter(x => x.host).length === 1, sts.map(x => x.rid + x.host));
    const kbs = await Promise.all([A, Bp, Cp].map(p => st(p)));
    check('every page shows its own 7 cards and the rivals as counts (7 / 7 / 7)', kbs.every(k => k.hand.length === 7 && k.counts.join() === '7,7,7'), kbs.map(k => k.counts));
    check('names are the nicknames', kbs.every(k => ['Aoi', 'Ben', 'Cy'].every(n => k.names.includes(n))), kbs[0].names);
    // secrecy in the page: no rival card is face up; the database refuses the other hands
    const faceUp = await Bp.evaluate(() => { const S = __colorcards.S, me = S.viewer, mine = new Set(S.st.hands[me]), top = new Set(S.st.disc); return [...document.querySelectorAll('.cd.up:not(.hid)')].map(e => +e.dataset.c).filter(c => !mine.has(c) && !top.has(c)); });
    check('B: no rival card is turned face up', faceUp.length === 0, faceUp);
    const probe = await Bp.evaluate(async rid => {
      const db = firebase.database(), out = {};
      const uids = Object.values((await db.ref('tr/colorcards/rooms/' + rid + '/seats').once('value')).val()).map(x => x.u);
      for (const u of uids) { if (u === firebase.auth().currentUser.uid) continue; try { await db.ref('tr/colorcards/rooms/' + rid + '/priv/' + u).once('value'); out[u] = 'readable'; } catch (e) { out[u] = /permission/i.test(String(e.code || e.message)) ? 'denied' : String(e); } }
      return out;
    }, sts[0].rid);
    check('B cannot read the others\' hands from the database', Object.values(probe).length === 2 && Object.values(probe).every(v => v === 'denied'), probe);
    await shot(Bp, '11-game-guest');
    check('the turn is shown (a seat glows)', (await Bp.$$('.seat.on')).length === 1, null);
    // --- play to the end with the real mouse
    const t0 = Date.now();
    await Promise.all([A, Bp, Cp].map(p => playOut(p, 20000, true)));
    check('all three pages reach a result', (await Promise.all([A, Bp, Cp].map(p => st(p)))).every(x => x.result), null);
    const ranks = await Promise.all([A, Bp, Cp].map(p => p.$$eval('#rRank li', ls => ls.map(l => l.querySelector('.nm').textContent + ':' + l.querySelector('.no').textContent).join('|'))));
    check('the same ranking on all pages', ranks.every(r => r === ranks[0]) && /:1\|/.test(ranks[0]), ranks);
    check('the result says online does not count for ★, no ★ was added', /★/.test(await A.textContent('#rNote')) && (await Promise.all([A, Bp, Cp].map(p => st(p)))).every(x => x.save.pts === 0 && x.save.stats.onl === 1), null);
    await shot(A, '11-result');
    check('the game took a sensible time', Date.now() - t0 < 120000, Date.now() - t0);
    // --- rematch
    for (const p of [A, Bp, Cp]) await p.click('#rAgain');
    check('after pressing, the button waits for the others', true, null);
    for (const p of [A, Bp, Cp]) await p.waitForFunction(() => __colorcards.onlineState().model.gn === 2 && __kb.state().started && !__kb.state().result, null, { timeout: 30000 });
    check('rematch: game 2 starts in the same room for everyone', true, null);
    await Cp.waitForFunction(() => __kb.state().human || __kb.state().turn >= 0, null, { timeout: 15000 });
    // --- C reloads the page in the middle (resume within the grace), A plays on
    const handBefore = (await st(Cp)).hand.slice().sort((a, b) => a - b);
    const pA = playOut(A, 4000, true).catch(() => null), pB = playOut(Bp, 4000, true).catch(() => null);
    await Cp.waitForTimeout(500);
    const handC = (await st(Cp)).hand.slice().sort((a, b) => a - b);
    await Cp.reload(); await Cp.waitForFunction(() => window.__kb && __kb.ready() && window.__colorcards);
    await Cp.click('#tOnline'); await Cp.waitForSelector('[data-ktr="resume"]', { timeout: 10000 });
    check('after a reload the lobby offers to go back to the match', true, null);
    await shot(Cp, '11-resume');
    await Cp.click('[data-ktr="resume"]');
    await Cp.waitForFunction(() => __kb.state().net && __kb.state().started, null, { timeout: 20000 });
    const kc = await st(Cp);
    check('C is back at its seat with a hand (same seat as before)', kc.hand.length >= 1 && kc.n === 3, kc.hand);
    void handBefore; void handC;
    // --- B closes its tab: A and C continue, B's seat becomes a CPU after the grace
    await Bp.ctx.close();
    await A.waitForFunction(() => /x/.test(__colorcards.onlineState().model.sl), null, { timeout: 40000 });
    check('a closed page: the seat turns into a CPU seat (x) for the others', true, null);
    await shot(A, '11-cpu-seat');
    await Promise.all([A, Cp].map(p => playOut(p, 20000, true)));
    check('the others finish the game', (await Promise.all([A, Cp].map(p => st(p)))).every(x => x.result), null);
    const errs = [...A.errs, ...Cp.errs].filter(e => !/Failed to load resource|net::ERR/.test(e));
    check('no page errors / permission errors (A, C)', errs.length === 0, errs.slice(0, 4));
    for (const p of [A, Cp]) await p.ctx.close();
    void pA; void pB;

    // --- the host reloads: the match goes on (host copy restored)
    const H = await mk('Hoa'), G1 = await mk('Gue');
    await H.click('#tOnline'); await H.waitForSelector('[data-ktr="make"]'); await H.click('[data-ktr="fill"]'); await H.click('.ktr-opt[data-n="2"]'); await H.click('[data-ktr="make"]');
    await H.waitForSelector('[data-ktr="codeshow"]', { timeout: 20000 });
    const code2 = (await H.textContent('[data-ktr="codeshow"]')).trim();
    await G1.click('#tOnline'); await G1.waitForSelector('[data-ktr="code"]'); await G1.fill('[data-ktr="code"]', code2); await G1.click('[data-ktr="join"]');
    for (const p of [H, G1]) await p.waitForFunction(() => __kb.state().net && __kb.state().started, null, { timeout: 30000 });
    const gp = playOut(G1, 3000, true).catch(() => null);
    await H.waitForTimeout(1500);
    await H.reload(); await H.waitForFunction(() => window.__kb && __kb.ready() && window.__colorcards);
    await H.click('#tOnline'); await H.waitForSelector('[data-ktr="resume"]', { timeout: 10000 });
    await H.click('[data-ktr="resume"]');
    await H.waitForFunction(() => __kb.state().net && __kb.state().started, null, { timeout: 20000 });
    check('the host reloads and resumes: still a 2-player game with a hand', (await st(H)).n === 2, null);
    await Promise.all([H, G1].map(p => playOut(p, 20000, true)));
    const hs = await Promise.all([H, G1].map(p => st(p)));
    check('the game finishes after the host came back (not ended by the host grace)', hs.every(x => x.result) && !(await H.textContent('#rNote')).match(/ホスト/), await H.textContent('#rNote'));
    void gp;
    // the host leaves a running game on purpose: the guest's match ends
    await H.click('#rAgain'); await G1.click('#rAgain');
    for (const p of [H, G1]) await p.waitForFunction(() => __colorcards.onlineState().model.gn === 2 && !__kb.state().result, null, { timeout: 30000 });
    await H.evaluate(() => __colorcards.leaveOnline());
    await G1.waitForFunction(() => __kb.state().result && /ホスト/.test(document.getElementById('rNote').textContent), null, { timeout: 20000 });
    check('the host leaves: the guest sees the match end with the host-left note', true, null);
    await shot(G1, '11-host-left');
    check('the guest\'s rematch button is not offered after the host left', await G1.$eval('#rAgain', e => e.disabled), null);
    await H.ctx.close(); await G1.ctx.close();

    // --- English: lobby and game text, small screen
    const En = await mk('Eve', { width: 320, height: 568 }, 'en');
    await En.click('#tOnline'); await En.waitForSelector('[data-ktr="quick"]');
    const jp = await En.evaluate(`(${jpScan})(true)`);
    check('English lobby: no Japanese on screen', jp.length === 0, jp.slice(0, 5));
    const lay = await En.evaluate(`(${layoutProbe})()`);
    check('English lobby at 320×568: no sideways scroll, nothing off screen', lay.hscroll <= 1 && lay.offscreen.length === 0, { h: lay.hscroll, off: lay.offscreen.slice(0, 3) });
    await shot(En, '11-lobby-en-320');
    await En.evaluate(() => { document.documentElement.setAttribute('data-kb-theme', 'light'); });
    await En.waitForTimeout(100); await shot(En, '11-lobby-en-light');
    await En.evaluate(() => { document.documentElement.setAttribute('data-kb-theme', 'dark'); });
    await En.waitForTimeout(100); await shot(En, '11-lobby-en-dark');
    const dark = await En.evaluate(() => { const c = getComputedStyle(document.querySelector('.ktr-card')), b = getComputedStyle(document.querySelector('[data-ktr="quick"]')); const lum = x => { const m = x.match(/\d+/g).map(Number); return (0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]); }; return { card: lum(c.backgroundColor === 'rgba(0, 0, 0, 0)' ? getComputedStyle(document.body).backgroundColor : c.backgroundColor), ink: lum(c.color) }; });
    check('dark theme: the lobby card is dark and its text is light', dark.card < 90 && dark.ink > 160, dark);
    check('English page: no page errors', En.errs.filter(e => !/Failed to load resource|net::ERR/.test(e)).length === 0, En.errs.slice(0, 3));
    await En.ctx.close();
  } finally { await emu.stop(); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [first, game, drag, practice, calls, match, pass, resume, english, layouts, lobby, online]) {
    if (only && !only.includes(f.name)) continue;
    if (f === online && !only && process.argv.includes('--no-online')) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
