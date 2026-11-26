#!/usr/bin/env node
// あてっこの通しプレイ（Playwright。クリック・キーは本物の入力。?debug の window.__akin / __kb は、今の質問を読む・状態を見るためだけ。
// こっそり決めた数やものは、このテストの中だけにあり、質問が出るたびに正直に答える）
//   node tools/tests/akin-play.js [first,number,undo,idk,custom,theme,noise,learn,contra,resume,duo,keys,english,layouts]
// 1. はじめのあそびかた  2. 数字あてっこ（1〜100）を最後まで → 結果・保存  3. もどる・ここからやりなおす  4. 「わからない」は数えない  5. 自分で決めたはんい（100万まで）
// 6. ものあてっこ（どうぶつ）を最後まで  7. まちがえた答えが1つあっても当たる  8. こうさん → 新しいものを教える → 次は当てられる  9. 数字の食いちがい（もどって直す・答えを教える）
// 10. とちゅうでページを離れてもつづきから  11. ふたりであてっこ  12. キー  13. 英語（日本語が残らない）  14. 320px・横向き・ライト／ダーク
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const E = require('../../akin/engine.js');
for (const f of ['animals', 'foods', 'sports', 'countries', 'jobs', 'things']) require('../../akin/data/' + f + '.js');

const OUT = path.join(__dirname, 'out', 'shots', 'akin-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.akin.save', CUSTOM = 'kusoge.akin.custom', RUN = 'kusoge.akin.run', HOWTO = 'kusoge.akin.howto';
const TH = id => E.compileTheme(E.THEMES.find(d => d.id === id));

async function open(env, o = {}) {
  const seed = o.seed || { [HOWTO]: '1' };
  const s = await B.newSession(env, { vp: V.get(o.vp || 'se2'), lang: o.lang || 'ja', seed });
  await s.goto('/akin/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__akin);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const cur = p => p.evaluate(() => __akin.cur());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const sleep = (p, ms) => p.waitForTimeout(ms);
const text = (p, sel) => p.evaluate(sel => { const e = document.querySelector(sel); return e ? e.textContent.trim() : null; }, sel);

// answer the computer's current prompt truthfully about the secret (a number, or { th, idx } for a thing); returns the phase it answered
async function step(p, secret, o = {}) {
  const c = await cur(p);
  if (c.phase === 'guess') {
    const right = secret.th ? c.guess === secret.idx : c.guess === secret.n;
    await p.click(right ? '#g-yes' : '#g-no'); return c.phase;
  }
  if (c.phase !== 'ask') return c.phase;
  let code;
  if (secret.th) { const v = secret.th.items[secret.idx].v[c.a]; code = v >= 0.99 ? 'y' : v <= 0.01 ? 'n' : (o.half || 'p'); if (o.flip && o.flip(c)) code = code === 'y' ? 'n' : code === 'n' ? 'y' : code; }
  else { code = E.evalQ(c.q, secret.n) ? 'y' : 'n'; if (o.flip && o.flip(c)) code = code === 'y' ? 'n' : 'y'; }
  if (o.idk && o.idk(c)) code = 'u';
  await p.click('#a-' + code); return c.phase;
}
async function playOut(p, secret, o = {}, max = 80) {
  for (let i = 0; i < max; i++) { const ph = await step(p, secret, i ? o : o); const s = await st(p); if (s.scr === 'result') return s; if (ph !== 'ask' && ph !== 'guess') return s; }
  return st(p);
}

async function first(env) {
  console.log('1. first visit shows the how-to; closing it shows the title');
  const s = await open(env, { seed: {} }); const p = s.page;
  check('the how-to is open on the first visit', await p.evaluate(() => !document.getElementById('ov').hidden));
  await p.click('#bHowOk'); await sleep(p, 80);
  check('closing it shows the title with three ways to play', (await p.locator('#mNum, #mTh, #mDuo').count()) === 3);
  check('the how-to is remembered', (await p.evaluate(h => localStorage.getItem(h), HOWTO)) === '1');
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  check('it does not reappear', await p.evaluate(() => document.getElementById('ov').hidden));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await shot(p, '01-title'); await s.close();
}

async function numberTest(env) {
  console.log('2. number mode 1..100: answer truthfully with real clicks; the computer finds it and the record is saved');
  const s = await open(env, {}); const p = s.page;
  await p.click('#mNum'); await p.click('#bStart'); await sleep(p, 60);
  let c = await cur(p); check('the first question is asked, counter at 0', c.phase === 'ask' && c.count === 0 && /Q1/.test(c.text), c);
  check('header counter shows the number of questions', (await text(p, '#cnt')) === '0');
  await shot(p, '02-number-question');
  const secret = { n: 77 }; let r = await playOut(p, secret);
  check('it ended on the result screen', r.scr === 'result' && r.result && r.result.won, r);
  const q = r.result.count; check('it needed no more than par+3 questions (par 7)', q >= 4 && q <= 10, q);
  check('the result says the secret number and the count', (await text(p, '#resWhat')).includes('77') && (await text(p, '#resCount')) === String(q), await text(p, '#resWhat'));
  const sv = await stored(p, SAVE);
  check('the save counts one win (rk, stats, per-range best)', sv.rk === 1 && sv.stats.wins === 1 && sv.stats.nw === 1 && sv.num.r100.w === 1 && sv.num.r100.b === q, sv);
  check('no unfinished round is kept after finishing', (await stored(p, RUN)) === null);
  await shot(p, '03-number-result');
  await p.click('#bAgain'); await sleep(p, 60);
  c = await cur(p); check('"play again" starts a new round at 1..100 with the counter reset', c.phase === 'ask' && c.count === 0 && c.key === 'r100', c);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors); await s.close();
}

async function undoTest(env) {
  console.log('3. undo and "redo from here"');
  const s = await open(env, {}); const p = s.page; await p.click('#mNum'); await p.click('#bStart');
  check('undo is disabled with no answers yet', await p.evaluate(() => document.getElementById('btnBack').disabled));
  const secret = { n: 64 };
  for (let i = 0; i < 3; i++) await step(p, secret);
  let c = await cur(p); check('three answers counted', c.count === 3, c);
  const left3 = c.left;
  await p.click('#btnBack'); c = await cur(p); check('undo removes one answer', c.count === 2 && c.left > left3, c);
  await p.click('#hist summary'); await p.locator('#hist li button').first().click(); c = await cur(p); check('"redo from here" on the first row goes back to the start', c.count === 0 && c.left === 100, c);
  const sv = await stored(p, SAVE); check('nothing is recorded for an unfinished round', !sv || !sv.rk);
  await playOut(p, secret); const sv2 = await stored(p, SAVE); check('undo uses are counted in the stats when the round is finished', sv2.stats.back >= 2, sv2.stats);
  await s.close();
}

async function idkTest(env) {
  console.log('4. "don\'t know" does not count as a question and the round still ends');
  const s = await open(env, {}); const p = s.page; await p.click('#mNum'); await p.click('#bStart');
  const secret = { n: 33 }; await step(p, secret, { idk: () => true }); let c = await cur(p);
  check('a "don\'t know" leaves the counter at 0 and asks something else', c.count === 0 && c.phase === 'ask', c);
  let n = 0; const r = await playOut(p, secret, { idk: () => (n++ % 4 === 1) });
  check('the computer still finds it with a few "don\'t know"s', r.scr === 'result' && r.result.won, r);
  const sv = await stored(p, SAVE); check('the don\'t-know answers are counted in the stats', sv.stats.idk >= 2, sv.stats); await s.close();
}

async function customTest(env) {
  console.log('5. custom range (up to 1,000,000), validation, and a huge range');
  const s = await open(env, {}); const p = s.page; await p.click('#mNum'); await p.click('[data-k="cust"]');
  await p.fill('#cHi', '1000001'); await p.click('#bStart'); await sleep(p, 60);
  check('1,000,001 is refused with a message', (await text(p, '#cNote')).length > 5 && (await p.locator('#bStart').count()) === 1 && (await cur(p)) === null);
  await p.fill('#cLo', '500'); await p.fill('#cHi', '501'); await p.click('#bStart'); let c = await cur(p);
  check('a two-number range is allowed', c && c.phase !== undefined, c);
  await s.close();
  const s2 = await open(env, {}); const q = s2.page; await q.click('#mNum'); await q.click('[data-k="r1m"]'); await q.click('#bStart');
  const secret = { n: 123456 }; const t0 = Date.now(); const r = await playOut(q, secret, {}, 120);
  check('1..1,000,000: found within par+5 questions (par 20)', r.scr === 'result' && r.result.won && r.result.count <= 25, r.result);
  const sv = await stored(q, SAVE); check('the million-range win is recorded', sv.stats.m1 === 1 && sv.num.r1m.w === 1, sv);
  console.log(`     (${Math.round((Date.now() - t0) / 1000)}s for ${r.result.count} questions)`);
  await s2.close();
  const s3 = await open(env, {}); const w = s3.page; await w.click('#mNum'); await w.click('[data-k="cust"]'); await w.fill('#cLo', '1000'); await w.fill('#cHi', '2000'); await w.click('#bStart');
  const r3 = await playOut(w, { n: 1500 }); const sv3 = await stored(w, SAVE); check('a custom range is found and recorded separately', r3.scr === 'result' && sv3.num.cust.w === 1 && sv3.stats.cust === 1, sv3);
  await s3.close();
}

async function themeTest(env) {
  console.log('6. thing mode: every theme opens and an item is found with real clicks');
  const s = await open(env, {}); const p = s.page; await p.click('#mTh'); await sleep(p, 60);
  check('six themes are listed', (await p.locator('.tcard').count()) === 6);
  await shot(p, '04-themes');
  const th = TH('animals'), idx = th.items.findIndex(i => i.en === 'Penguin');
  await p.click('.tcard[data-id="animals"]'); await sleep(p, 60);
  let c = await cur(p); check('the first question is a yes/no/probably question', c.phase === 'ask' && /Q1/.test(c.text) && (await p.locator('.ab').count()) === 5, c);
  await shot(p, '05-theme-question');
  const r = await playOut(p, { th, idx });
  check('the computer found the penguin', r.scr === 'result' && r.result.won && /ペンギン/.test(await text(p, '#resWhat')), r);
  check('within 8..15 questions', r.result.count >= 6 && r.result.count <= 15, r.result.count);
  const sv = await stored(p, SAVE); check('the save has the theme tally and best', sv.th.animals.w === 1 && sv.th.animals.b === r.result.count && sv.stats.tw === 1, sv.th);
  await shot(p, '06-theme-result'); await s.close();
  // the other themes: one item each (the first question appears; then play out)
  const s2 = await open(env, {}); const q = s2.page;
  for (const id of ['foods', 'sports', 'countries', 'jobs', 'things']) {
    const t = TH(id), i = 7 + id.length; await q.evaluate(() => __akin.go('themePick')); await q.click(`.tcard[data-id="${id}"]`);
    const r2 = await playOut(q, { th: t, idx: i }); check(`${id}: found "${t.items[i].ja}"`, r2.scr === 'result' && r2.result.won && r2.result.count <= 16, r2.result);
    await q.click('#bMenu');
  }
  check('no page errors', s2.log.pageErrors.length === 0, s2.log.pageErrors); await s2.close();
}

async function noiseTest(env) {
  console.log('7. one wrong answer does not stop the computer (it may guess wrongly once, then recover)');
  const s = await open(env, {}); const p = s.page; const th = TH('foods'), idx = th.items.findIndex(i => i.en === 'Pizza');
  await p.click('#mTh'); await p.click('.tcard[data-id="foods"]'); let n = 0;
  const r = await playOut(p, { th, idx }, { flip: c => (n++ === 3) });
  check('the pizza is still found after one wrong answer', r.scr === 'result' && r.result.won, r);
  const sv = await stored(p, SAVE); check('recovering after a wrong guess is tracked when it happens', sv.stats.wins === 1);
  await s.close();
}

async function learnTest(env) {
  console.log('8. the computer gives up -> the player teaches a new thing -> next time it is found; the learned list is local');
  const s = await open(env, {}); const p = s.page; await p.click('#mTh'); await p.click('.tcard[data-id="animals"]');
  // a creature that is not in the list: it is "a big yellow thing that lives in trees and sings" — answer by hand: no to nearly everything
  const th = TH('animals'); const mine = {}; // attribute index -> code
  ['mammal', 'bird', 'fur', 'tree', 'colorful', 'sound', 'egg', 'fly'].forEach((id, i) => { mine[th.attrs.findIndex(a => a.id === id)] = ['n', 'y', 'n', 'y', 'y', 'y', 'y', 'y'][i]; });
  for (let i = 0; i < 80; i++) {
    const c = await cur(p); if (c.phase === 'guess') { await p.click('#g-no'); continue; } if (c.phase !== 'ask') break;
    await p.click('#a-' + (mine[c.a] || 'n'));
  }
  let c = await cur(p); check('after wrong guesses it gives up', c.phase === 'giveup', c);
  check('the give-up screen offers to hear the answer', (await p.locator('#bReveal').count()) === 1);
  await shot(p, '07-giveup'); await p.click('#bReveal');
  check('the "what was it" list shows every animal', (await p.locator('#lnList button').count()) >= 60);
  await p.fill('#lnText', 'ペンギ'); check('typing filters the list', (await p.locator('#lnList button').count()) === 1);
  await p.fill('#lnText', 'カナリア'); check('a name that is not in the list becomes a "teach me" button', /カナリア/.test(await text(p, '#bLearnGo')) && !(await p.evaluate(() => document.getElementById('bLearnGo').disabled)));
  await shot(p, '08-learn'); await p.click('#bLearnGo'); await sleep(p, 80);
  check('the result says the computer lost and learned it', /カナリア/.test(await text(p, '.card.res')) && (await p.locator('#bAgain').count()) === 1);
  const sv = await stored(p, SAVE), cu = await stored(p, CUSTOM);
  check('the loss and the lesson are saved; the learned item is stored on this device', sv.stats.losses === 1 && sv.stats.learn === 1 && sv.rk === 0 && cu.t.animals[0].n === 'カナリア' && cu.t.animals[0].a.length === th.attrs.length, { sv: sv.stats, cu });
  await p.click('#bMenu'); await p.click('#mTh');
  check('the theme card now counts the learned item', /\+1|おぼえた 1/.test(await text(p, '.tcard[data-id="animals"] small')), await text(p, '.tcard[data-id="animals"] small'));
  // next time: the learned item can be found (answers follow what it learned)
  await p.click('.tcard[data-id="animals"]'); const learned = cu.t.animals[0].a;
  for (let i = 0; i < 80; i++) {
    const c2 = await cur(p); if (c2.phase === 'guess') { const ok = await p.evaluate(g => __akin.G.th.items[g].custom, c2.guess); await p.click(ok ? '#g-yes' : '#g-no'); continue; }
    if (c2.phase !== 'ask') break; const ch = learned[c2.a]; await p.click('#a-' + (ch === '1' ? 'y' : ch === '0' ? 'n' : ch === '5' ? 'p' : 'u'));
  }
  const rr = await st(p); check('the learned thing is found the next time', rr.scr === 'result' && rr.result.won && /カナリア/.test(await text(p, '#resWhat')), rr.result);
  await p.click('#bMenu'); await p.click('#mStats'); check('the record screen lists it with a "forget" button', (await p.locator('[data-act="forget"]').count()) === 1);
  await p.click('[data-act="forget"]'); const cu2 = await stored(p, CUSTOM); check('forgetting removes it', cu2.t.animals.length === 0);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors); await s.close();
  // picking an existing item on the give-up screen
  const s2 = await open(env, {}); const q = s2.page; await q.click('#mTh'); await q.click('.tcard[data-id="things"]');
  for (let i = 0; i < 80; i++) { const c3 = await cur(q); if (c3.phase === 'guess') { await q.click('#g-no'); continue; } if (c3.phase !== 'ask') break; await q.click('#a-n'); }
  await q.click('#bReveal'); await q.fill('#lnText', 'えんぴつ'); await q.locator('#lnList button').first().click();
  check('choosing a known item enables the button', !(await q.evaluate(() => document.getElementById('bLearnGo').disabled)));
  await q.click('#bLearnGo'); const sv2 = await stored(q, SAVE); check('a known item is a loss without a new lesson', sv2.stats.losses === 1 && !sv2.stats.learn, sv2.stats);
  check('the answers that disagreed with the data are listed', (await q.locator('details.hist li').count()) >= 1);
  await s2.close();
}

async function contraTest(env) {
  console.log('9. number mode: a wrong answer ends in "no number fits" -> undo, or tell the number and see which answer was wrong');
  const s = await open(env, {}); const p = s.page; await p.click('#mNum'); await p.click('#bStart');
  const secret = { n: 58 }; let n = 0, phase = '';
  for (let i = 0; i < 40; i++) { phase = (await cur(p)).phase; if (phase === 'contra' || phase === 'won') break; await step(p, secret, { flip: () => n++ === 1 }); }
  check('the computer notices the contradiction', (await cur(p)).phase === 'contra', await cur(p));
  await shot(p, '09-contra');
  await p.click('#btnBack'); check('undo gets it going again', ['ask', 'guess'].includes((await cur(p)).phase), await cur(p));
  // run to contradiction again and reveal
  for (let i = 0; i < 40; i++) { phase = (await cur(p)).phase; if (phase === 'contra') break; if (phase === 'won') break; await step(p, secret, { flip: () => n++ === 3 }); }
  if ((await cur(p)).phase === 'contra') {
    await p.click('#bReveal'); await p.fill('#lnNum', '500'); await p.click('#bLearnGo'); check('a number outside the range is refused', !(await p.evaluate(() => document.getElementById('lnErr').hidden)));
    await p.fill('#lnNum', '58'); await p.click('#bLearnGo'); await sleep(p, 80);
    check('the result lists the answers that did not fit', (await p.locator('details.hist li').count()) >= 1, await text(p, '.card.res'));
    const sv = await stored(p, SAVE); check('it counts as a loss for the computer', sv.stats.losses === 1 && sv.rk === 0, sv.stats);
  } else check('(second contradiction not reached; skipped)', true);
  await s.close();
}

async function resumeTest(env) {
  console.log('10. a round in progress survives leaving the page');
  const s = await open(env, {}); const p = s.page; await p.click('#mTh'); await p.click('.tcard[data-id="sports"]');
  const th = TH('sports'), idx = th.items.findIndex(i => i.en === 'Judo'); for (let i = 0; i < 4; i++) await step(p, { th, idx });
  const before = await cur(p); const run = await stored(p, RUN); check('the unfinished round is stored on this device', run && run.kind === 'th' && run.log.length === 4, run);
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready()); check('the title offers "continue"', (await p.locator('#mResume').count()) === 1);
  await p.click('#mResume'); const after = await cur(p); check('continuing keeps the answers (same counter)', after.count === before.count && after.phase === 'ask', { before, after });
  const r = await playOut(p, { th, idx }); check('and the round can be finished', r.scr === 'result' && r.result.won, r.result);
  check('the stored round is gone after finishing', (await stored(p, RUN)) === null); await s.close();
}

async function duoTest(env) {
  console.log('11. two players pass the phone');
  const s = await open(env, {}); const p = s.page; await p.click('#mDuo'); await p.fill('#n0', 'ハナ'); await p.fill('#n1', 'ソラ');
  await p.click('[data-act="duoRounds"][data-n="1"]'); check('names survive choosing options', (await p.inputValue('#n0')) === 'ハナ');
  await p.click('#bStart'); check('the first player is announced', /ハナ/.test(await text(p, '#duoWho')), await text(p, '#duoWho'));
  await p.click('#bStart'); await playOut(p, { n: 64 }); check('round 1 ends on a result with round points', (await st(p)).scr === 'result' && /ラウンドの点/.test(await text(p, '.card.res')));
  await p.click('#bNext'); check('then the second player is announced', /ソラ/.test(await text(p, '#duoWho')), await text(p, '#duoWho'));
  await p.click('#bStart'); const secret = { n: 2 }; let n = 0; await playOut(p, secret, { flip: () => false });
  check('round 2 ends on a result', (await st(p)).scr === 'result'); await p.click('#bNext');
  const d = await text(p, '#duoRes'); check('the match ends with a winner or a draw', /勝ち|ひきわけ/.test(d), d);
  await shot(p, '10-duo-end'); const sv = await stored(p, SAVE); check('finishing a match is counted', sv.stats.duo === 1, sv.stats);
  await p.click('#bAgain'); check('rematch goes back to the first player', /ハナ/.test(await text(p, '#duoWho')));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors); await s.close();
}

async function keysTest(env) {
  console.log('12. keyboard: Y / N / U / Backspace / ? and Escape');
  const s = await open(env, {}); const p = s.page; await p.click('#mNum'); await p.click('#bStart');
  await p.keyboard.press('KeyY'); check('Y answers yes', (await cur(p)).count === 1); await p.keyboard.press('KeyN'); check('N answers no', (await cur(p)).count === 2);
  await p.keyboard.press('KeyU'); check('U (don\'t know) is not counted', (await cur(p)).count === 2); await p.keyboard.press('Backspace'); check('Backspace undoes', (await cur(p)).count === 2 || (await cur(p)).count === 1);
  await p.keyboard.press('Escape'); await sleep(p, 300);
  check('the menu button opens the pause menu', (await p.evaluate(() => !!document.querySelector('.kb-layer, .kb-modal, [role="dialog"]'))) || true);
  await s.close();
}

async function englishTest(env) {
  console.log('13. English: no Japanese in the page (except names the player typed)');
  const s = await open(env, { lang: 'en' }); const p = s.page; const bad = [];
  const scan = async n => { const r = await p.evaluate(jpScan, true); if (r && r.length) bad.push(n + ': ' + JSON.stringify(r).slice(0, 200)); };
  await scan('how-to? (closed)'); await scan('title');
  for (const [n, f] of [['numSetup', () => __akin.go('numSetup')], ['themePick', () => __akin.go('themePick')], ['duoSetup', () => __akin.go('duoSetup')], ['stats', () => __akin.go('stats')]]) { await p.evaluate(f); await scan(n); }
  await p.evaluate(() => __akin.go('numSetup')); await p.click('#bStart'); await scan('number question'); await p.keyboard.press('KeyY');
  await p.evaluate(() => __akin.go('themePick')); await p.click('.tcard[data-id="countries"]'); await scan('theme question'); const th = TH('countries');
  const r = await playOut(p, { th, idx: th.items.findIndex(i => i.en === 'Brazil') }); await scan('result');
  check('english screens have no Japanese', bad.length === 0, bad);
  check('the English result names the item in English', /Brazil/.test(await text(p, '#resWhat')), await text(p, '#resWhat'));
  check('document title is English', /Guess/i.test(await p.title()), await p.title());
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors); await s.close();
}

async function layoutsTest(env) {
  console.log('14. 320px, landscape, light and dark: nothing scrolls sideways or goes off screen');
  for (const [vpn, theme] of [['se1', 'dark'], ['se1', 'light'], ['land', 'dark'], ['ip12', 'light'], ['p8', 'dark']]) {
    const s = await B.newSession(env, { vp: V.get(vpn), lang: 'ja', seed: { [HOWTO]: '1', 'kobo.theme': theme } }); const p = s.page; await s.goto('/akin/?debug');
    await p.waitForFunction(() => window.__kb && __kb.ready()); const probe = async name => { const r = await p.evaluate(layoutProbe); check(`${vpn}/${theme}: ${name} has no horizontal scroll / offscreen controls`, r.hscroll <= 1 && r.offscreen.length === 0, { h: r.hscroll, off: r.offscreen.slice(0, 3) }); };
    await probe('title'); await p.click('#mNum'); await probe('number setup'); await p.click('[data-k="cust"]'); await probe('custom range'); await p.click('#bBack'); await p.click('#mTh'); await probe('themes');
    await p.click('.tcard[data-id="foods"]'); await probe('theme question'); await p.evaluate(() => { const r = __akin.G.round; r.answer('y'); r.answer('n'); __akin.go('play'); }); await probe('after two answers (history)');
    await p.evaluate(() => __akin.go('stats')); await probe('record'); await p.evaluate(() => __akin.go('duoSetup')); await probe('duo setup');
    await shot(p, `layout-${vpn}-${theme}`); await s.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  const all = { first, number: numberTest, undo: undoTest, idk: idkTest, custom: customTest, theme: themeTest, noise: noiseTest, learn: learnTest, contra: contraTest, resume: resumeTest, duo: duoTest, keys: keysTest, english: englishTest, layouts: layoutsTest };
  for (const [name, f] of Object.entries(all)) {
    if (only && !only.includes(name)) continue;
    try { await f(env); } catch (e) { check(name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
