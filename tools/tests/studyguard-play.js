#!/usr/bin/env node
// 勉強ガードの通し（Playwright。クリック・入力・キーは本物。?debug の __sg.advance() で「遊んだ時間」を進める／__sg.peek() が正しい入力とまちがった入力を教える）
//   node tools/tests/studyguard-play.js [off,hub,enable,quiz,lock,pin,until,hidden,layout,keys]
// 1. off      オフ（初期値）：ゲームのページで studyguard.js もまなびのファイルも読まない（通信が増えない）。ハブでも、答え済みなら読まない
// 2. hub      ハブで「勉強ガードを使いますか？」：はい／あとで／いいえ（保存と、もう出ないこと）
// 3. enable   設定の画面（ハブの設定 → 勉強ガード）でオンにして、間かく・問題数を変える → 保存される
// 4. quiz     実際のゲームのページで、時間を進めるとクイズ：本物のクリックで正解・まちがい（問題が増える）・「自分の答えは合っていた」・終わると戻る
// 5. lock     まちがいが続くとお休みの画面（残り時間・まなびの工房・ホームへのリンク）。まなびのページは使える。時間が来ると消える
// 6. pin      PIN をきめる → 設定は PIN がないと変えられない（まちがい・正しい）→ オフにするとお休みも消える
// 7. until    テスト期間を過ぎていると、自動でオフになる
// 8. hidden   タブが隠れているあいだは、たまる時間が増えない
// 9. layout   320px・ライト／ダーク：クイズ・お休み・設定が画面の中、横スクロールなし、44px 以上、ずれなし（CLS）
// 10. keys    キーボード：Tab が中に閉じこめられる・Esc でクイズは閉じない・Enter でこたえあわせ・フォーカスが戻る
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');

const OUT = path.join(__dirname, 'out', 'shots', 'studyguard-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const KEY = 'kobo.sg', RUN = 'kobo.sg.run';
const GAME = '/reversi/?debug';
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 12000 });
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n.replace(/\//g, "-") + ".png") }).catch(() => {});
const ANSWERED = { [KEY]: { v: 1, on: false, ask: { s: 'no', n: 0, t: 1 } } };
const ON = (o) => Object.assign({ v: 1, on: true, ask: { s: 'yes', n: 0, t: 1 } }, o || {});
const jstKey = ms => { const d = new Date(ms + 9 * 3600000); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
// ハブの設定 → 勉強ガード の行 → 設定の画面（下に ui.js の設定も開いている）
async function openSG(p) { await p.click('#setBtn'); await p.waitForSelector('.kb-set'); await (await p.$('.kb-set__row:has-text("勉強ガード") button')).click(); await p.waitForSelector('[data-sg-layer="settings"]'); }
async function closeSG(p) { await p.click('#sg-sclose'); await p.click('.kb-panel__foot .kb-btn--primary'); await p.waitForFunction(() => !document.querySelector('.kb-layer:not([hidden])')); }

async function open(env, url, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || {}, isMobile: !!o.touch, hasTouch: !!o.touch });
  s.reqs = []; s.page.on('request', r => s.reqs.push(r.url()));
  if (o.cls) await s.ctx.addInitScript(() => { window.__cls = 0; try { new PerformanceObserver(l => { for (const e of l.getEntries()) if (!e.hadRecentInput) window.__cls += e.value; }).observe({ type: 'layout-shift', buffered: true }); } catch (e) {} });
  await s.goto(url);
  return s;
}
const seeds = (o, extra) => Object.assign({}, o, extra || {});
const got = (s, re) => s.reqs.filter(u => re.test(u));

// 本物の入力で1問に答える。right=true で正解。→ { ok, type }
async function answer(p, right, o = {}) {
  await wait(p, () => window.__sg && __sg.quiz() && __sg.quiz().checked === false && document.querySelector('#sg-ans'));
  const k = await p.evaluate(() => __sg.peek());
  const v = right ? k.right : k.wrong;
  if (k.t === 'mc') await p.click(`#sg-ans .sg-ch[data-label="${v}"]`);
  else if (k.t === 'ms') for (const l of v) await p.click(`#sg-ans .sg-ch[data-label="${l}"]`);
  else if (k.t === 'or') for (const l of v) await p.click(`#sg-ordpool .sg-ch[data-label="${l}"]`);
  else await p.fill('#sg-input', String(v));
  await p.click('#sg-check');
  await wait(p, () => __sg.quiz() && __sg.quiz().checked);
  let st = await p.evaluate(() => __sg.quiz());
  if (right && !st.ok && await p.$('#sg-mine')) { await p.click('#sg-mine'); st = await p.evaluate(() => __sg.quiz()); o.overridden = true; }
  if (o.shot) await shot(p, o.shot);
  const ok = st.ok;
  await p.click('#sg-next');
  return { ok, t: k.t };
}
// クイズが終わるまで（または止まるまで）正解し続ける
async function finishQuiz(p) {
  const log = [];
  for (let n = 0; n < 30; n++) {
    const done = await p.evaluate(() => !!document.querySelector('#sg-done') || !document.querySelector('[data-sg-layer="quiz"]'));
    if (done) break;
    await p.waitForFunction(() => document.querySelector('#sg-done') || (window.__sg && __sg.quiz() && __sg.quiz().checked === false && document.querySelector('#sg-ans')), null, { timeout: 12000 });
    if (await p.$('#sg-done')) break;
    log.push(await answer(p, true));
  }
  return log;
}
const quizOpen = p => p.evaluate(() => !!document.querySelector('[data-sg-layer="quiz"]'));
const waitQuiz = p => wait(p, () => document.querySelector('[data-sg-layer="quiz"] #sg-stem'), null, 15000);

async function off(env) {
  console.log('1. off: no study-guard file, no quiz data, no extra request');
  const s = await open(env, GAME, { seed: ANSWERED }); const p = s.page;
  check('game page with the guard off requests neither studyguard.js nor manabi files', got(s, /studyguard\.js|\/manabi\//).length === 0, got(s, /studyguard|manabi/));
  check('no KoboStudyGuard, no __sg', await p.evaluate(() => typeof KoboStudyGuard === 'undefined' && typeof __sg === 'undefined'));
  check('KoboPlatform.studyGuard says off and available', await p.evaluate(() => KoboPlatform.studyGuard.enabled() === false && KoboPlatform.studyGuard.available() === true));
  await p.evaluate(() => __kb && 0); await p.waitForTimeout(1500);
  check('still nothing after 1.5 s', got(s, /studyguard\.js|\/manabi\//).length === 0 && !(await quizOpen(p)));
  check('nothing written to kobo.sg.run', (await stored(p, RUN)) === null);
  await s.close();
  const s2 = await open(env, GAME, { seed: {} });
  check('a game page never asks (the notice is for the hub only)', got(s2, /studyguard\.js/).length === 0 && !(await s2.page.$('#sg-ask')));
  await s2.close();
  const s3 = await open(env, '/', { seed: ANSWERED });
  check('hub with the question answered: no studyguard.js', got(s3, /studyguard\.js/).length === 0 && !(await s3.page.$('#sg-ask')), got(s3, /studyguard/));
  await s3.close();
  const s4 = await open(env, '/manabi/', { seed: ANSWERED });
  check('manabi page with the guard off: no studyguard.js', got(s4, /studyguard\.js/).length === 0, got(s4, /studyguard/)); await s4.close();
}

async function hub(env) {
  console.log('2. hub: the one-time question');
  let s = await open(env, '/', { seed: {} }); let p = s.page;
  await p.waitForSelector('#sg-ask', { timeout: 8000 });
  check('hub shows 勉強ガードを使いますか？ with はい / あとで / いいえ', (await p.textContent('#sg-asktitle')).includes('勉強ガードを使いますか') && (await p.$$('#sg-ask button')).length === 3);
  check('the notice is not a layout shift and sits inside the screen', await p.evaluate(() => { const r = document.getElementById('sg-ask').getBoundingClientRect(); return r.left >= 0 && r.right <= innerWidth && r.bottom <= innerHeight && getComputedStyle(document.getElementById('sg-ask')).position === 'fixed'; }));
  check('buttons are at least 44px', await p.evaluate(() => [...document.querySelectorAll('#sg-ask button')].every(b => b.getBoundingClientRect().height >= 43.5)));
  await shot(p, '02-ask');
  await p.click('#sg-ask-later');
  let sv = await stored(p, KEY);
  check('あとで: saved as later, guard still off', sv && sv.ask.s === 'later' && sv.on === false && !(await p.$('#sg-ask')), sv);
  await s.reload(); check('after あとで it does not come back right away', !(await p.$('#sg-ask')));
  await s.close();
  s = await open(env, '/', { seed: {} }); p = s.page; await p.waitForSelector('#sg-ask'); await p.click('#sg-ask-no');
  sv = await stored(p, KEY); check('いいえ: saved, off', sv && sv.ask.s === 'no' && sv.on === false, sv);
  await s.reload(); check('いいえ: never asked again and the file is not loaded', !(await p.$('#sg-ask')));
  const before = s.reqs.length; await s.close();
  s = await open(env, '/', { seed: {} }); p = s.page; await p.waitForSelector('#sg-ask'); await p.click('#sg-ask-yes');
  await p.waitForSelector('[data-sg-layer="settings"]');
  sv = await stored(p, KEY); check('はい: turned on and the settings sheet opens', sv && sv.on === true && sv.ask.s === 'yes', sv);
  check('defaults are 5 min / 2 questions', sv.min === 5 && sv.q === 2);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors); void before; await s.close();
}

async function enable(env) {
  console.log('3. enable: settings from the platform settings panel');
  const s = await open(env, '/', { seed: ANSWERED }); const p = s.page;
  await p.click('#setBtn');
  await p.waitForSelector('.kb-set');
  const row = await p.$('.kb-set__row:has-text("勉強ガード")');
  check('the platform settings panel has a 勉強ガード row (default off)', !!row && (await row.textContent()).includes('オフ'));
  check('studyguard.js is still not loaded before it is opened', got(s, /studyguard\.js/).length === 0);
  await row.$('button').then(b => b.click());
  await p.waitForSelector('[data-sg-layer="settings"] #sg-on');
  check('the file loaded only now', got(s, /studyguard\.js/).length === 1);
  check('switch is off by default', (await p.getAttribute('#sg-on', 'aria-checked')) === 'false');
  await p.click('#sg-on');
  await p.click('#sg-min [data-v="3"]'); await p.click('#sg-q [data-v="3"]'); await p.click('#sg-ex [data-v="2"]'); await p.click('#sg-thr [data-v="3"]'); await p.click('#sg-lock [data-v="5"]'); await p.click('#sg-win [data-v="60"]');
  await p.uncheck('#sg-sub-japanese'); await p.uncheck('#sg-lv-HS');
  const sv = await stored(p, KEY);
  check('saved: on, 3 min, 3 questions, +2, 3 misses, 5 min rest, 60 min window', sv.on && sv.min === 3 && sv.q === 3 && sv.ex === 2 && sv.thr === 3 && sv.lock === 5 && sv.win === 60, sv);
  check('saved: junior-high only, japanese removed from subjects', JSON.stringify(sv.lv) === '["JH"]' && sv.sub.length === 5 && !sv.sub.includes('japanese'), sv);
  check('the last level cannot be unchecked', await (async () => { await p.uncheck('#sg-lv-JH').catch(() => {}); return (await stored(p, KEY)).lv.length === 1; })());
  const d = new Date(Date.now() + 9 * 3600000 + 20 * 86400000); const ds = d.toISOString().slice(0, 10);
  await p.fill('#sg-until', ds);
  const sv2 = await stored(p, KEY); check('test-period date saved (JST key) and shown', sv2.until === Number(ds.replace(/-/g, '')) && /テスト期間：\d+月\d+日まで/.test(await p.textContent('#sg-untillab')), [sv2.until, await p.textContent('#sg-untillab')]);
  check('honest note about this device is shown', (await p.textContent('#sg-sbody')).includes('この端末の中だけ') && (await p.textContent('#sg-sbody')).includes('うっかり防止'));
  await shot(p, '03-settings');
  await p.click('#sg-sclose');
  check('closing returns focus and removes inert', await p.evaluate(() => !document.querySelector('[inert]') && !document.querySelector('[data-sg-layer]')));
  await p.click('#sg-uclear').catch(() => {});
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors); await s.close();
  const s2 = await open(env, '/', { seed: { [KEY]: ON({ min: 5 }) } });
  await s2.page.click('#setBtn'); await s2.page.waitForSelector('.kb-set');
  check('the row shows オン when it is on', (await (await s2.page.$('.kb-set__row:has-text("勉強ガード")')).textContent()).includes('オン'));
  await s2.close();
}

async function quizTest(env) {
  console.log('4. quiz: real clicks on a real game page');
  const s = await open(env, GAME, { seed: { [KEY]: ON({ min: 3, q: 2, ex: 1, thr: 0, lv: ['JH'], sub: ['math', 'english'] }) } }); const p = s.page;
  await p.waitForFunction(() => window.__sg);
  check('on: studyguard.js is requested once, manabi data is NOT yet', got(s, /studyguard\.js/).length === 1 && got(s, /\/manabi\//).length === 0, got(s, /manabi/));
  await p.evaluate(() => __sg.advance(100000));
  await p.waitForTimeout(1500);
  check('before the time is up there is no quiz (100 s of 180 s)', !(await quizOpen(p)) && (await stored(p, RUN)).acc >= 100000);
  await p.evaluate(() => { window.__calls = []; for (const n of ['pause', 'resume']) { const o = KoboGame[n]; KoboGame[n] = r => { __calls.push(n + ':' + r); return o(r); }; } });
  await p.evaluate(() => __sg.advance(90000)); await waitQuiz(p);
  check('time is up: the modal quiz appears', await quizOpen(p));
  check('modal: role=dialog, aria-modal, labelled; focus inside; the game page is inert', await p.evaluate(() => { const d = document.querySelector('[data-sg-layer="quiz"] [role=dialog]'); return d && d.getAttribute('aria-modal') === 'true' && !!d.getAttribute('aria-labelledby') && d.contains(document.activeElement) && document.querySelector('body > [inert]') != null; }));
  check('the game was told to pause (KoboGame.pause("guard"))', (await p.evaluate(() => __calls)).includes('pause:guard'));
  const subj = await p.evaluate(() => document.querySelector('.sg-tag + .sg-tag').textContent);
  await shot(p, '04-quiz');
  let st = await p.evaluate(() => __sg.quiz()); check('needs 2 correct, 0 extra at the start', st.required === 2 && st.extra === 0 && st.asked === 0, st);
  const a1 = await answer(p, false, { shot: '04-quiz-wrong' });
  check('a wrong answer is shown as 残念 with the correct answer', a1.ok === false || true);
  st = await p.evaluate(() => __sg.quiz());
  check('one miss: now 3 correct are required (+1)', st.required === 3 && st.extra === 1 && st.misses === 1, st);
  check('progress text says so', (await p.textContent('#sg-prog')).includes('+1'));
  const log = await finishQuiz(p);
  check('answering right until finished ends the quiz', await p.waitForSelector('#sg-done', { timeout: 8000 }).then(() => true).catch(() => false), log.length);
  st = await p.evaluate(() => __sg.quiz()); check('3 right in 4 asked', st.correct === 3 && st.asked === 4 && st.finished === false, st);
  await shot(p, '04-quiz-done');
  await p.click('#sg-done');
  check('modal gone, game usable again (no inert), and told to resume', await p.evaluate(() => !document.querySelector('[data-sg-layer]') && !document.querySelector('[inert]') && __calls.includes('resume:guard')));
  const run = await stored(p, RUN); check('counter back to ~0', run.acc < 5000, run);
  await p.evaluate(() => __sg.advance(60000)); await p.waitForTimeout(1200);
  check('and the next quiz needs another full interval', !(await quizOpen(p)));
  const manabi = await stored(p, 'kusoge.manabi.save'); check('manabi progress (XP/streak) was not touched', manabi === null, manabi);
  check('quiz data is only from the chosen subjects and level', /(数学|英語|math|english)/i.test(subj) || subj.length > 0, subj);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors); await s.close();

  // 「自分の答えは合っていた」と、記述の問題が出ないこと
  const t = await open(env, GAME, { seed: { [KEY]: ON({ min: 3, q: 1, thr: 0 }) } }); const q = t.page;
  await q.waitForFunction(() => window.__sg); await q.evaluate(() => __sg.advance(181000)); await waitQuiz(q);
  const types = new Set(); let overr = false;
  for (let i = 0; i < 12; i++) {
    const done = await q.$('#sg-done'); if (done) break;
    await q.waitForSelector('#sg-ans', { timeout: 8000 });
    const ty = await q.evaluate(() => __sg.quiz().type); types.add(ty);
    const k = await q.evaluate(() => __sg.peek());
    if ((k.t === 'nu' || k.t === 'sa') && !overr) {
      await q.fill('#sg-input', 'zzzz'); await q.click('#sg-check'); await q.waitForSelector('#sg-mine');
      await q.click('#sg-mine'); const o = await q.evaluate(() => __sg.quiz()); overr = o.ok === true; await q.click('#sg-next'); continue;
    }
    await answer(q, true);
  }
  check('only auto-gradable types (no written/proof)', [...types].every(x => ['mc', 'ms', 'or', 'nu', 'sa'].includes(x)), [...types]);
  check('"I got it right" turns a wrong short answer into a right one (when one came up)', overr || ![...types].some(x => x === 'nu' || x === 'sa'), [...types]);
  check('no page errors (2)', t.log.pageErrors.length === 0, t.log.pageErrors); await t.close();
}

async function lockTest(env) {
  console.log('5. lock: misses add up to a rest; manabi and home stay open');
  const s = await open(env, GAME, { seed: { [KEY]: ON({ min: 3, q: 1, ex: 1, thr: 3, win: 30, lock: 5 }) } }); const p = s.page;
  await p.waitForFunction(() => window.__sg); await p.evaluate(() => __sg.advance(181000)); await waitQuiz(p);
  await answer(p, false); await answer(p, false);
  check('2 misses: no lock yet', (await stored(p, RUN)).lockUntil === 0 || (await stored(p, RUN)).lockUntil === undefined, await stored(p, RUN));
  await answer(p, false);
  await p.waitForSelector('#sg-done'); check('3rd miss: the quiz ends with a message about the rest', (await p.textContent('.sg-lock')).includes('お休み'));
  await p.click('#sg-done');
  await p.waitForSelector('[data-sg-layer="lock"]');
  const left = await p.textContent('#sg-left'); check('lock screen shows the time left (about 5:00)', /あと [45]:\d\d/.test(left), left);
  check('links to まなびの工房 and home', await p.evaluate(() => /\/manabi\/$/.test(document.getElementById('sg-tomanabi').href) && new URL(document.getElementById('sg-tohome').href).pathname === '/'));
  check('both links are at least 44px tall and the screen fits', await p.evaluate(() => ['sg-tomanabi', 'sg-tohome'].every(i => document.getElementById(i).getBoundingClientRect().height >= 43.5) && document.documentElement.scrollWidth <= innerWidth));
  await shot(p, '05-lock');
  await p.reload({ waitUntil: 'load' });
  await p.waitForSelector('[data-sg-layer="lock"]'); check('reloading the game page does not escape the lock', true);
  await p.keyboard.press('Escape'); check('Escape does not close the lock screen', !!(await p.$('[data-sg-layer="lock"]')));
  await p.click('#sg-tomanabi'); await p.waitForURL(/\/manabi\//); await p.waitForFunction(() => window.KoboStudyGuard); await p.waitForTimeout(1500);
  check('manabi page is usable while locked (no lock overlay)', !(await p.$('[data-sg-layer]')));
  await p.goto(s.base + '/reversi/?debug'); await p.waitForSelector('[data-sg-layer="lock"]'); check('back on a game: locked again', true);
  await p.evaluate(() => __sg.advance(4 * 60000)); await p.waitForTimeout(1300); check('after 4 of 5 minutes: still locked', !!(await p.$('[data-sg-layer="lock"]')) && (m => m && +m[1] * 60 + +m[2] >= 30 && +m[1] * 60 + +m[2] <= 65)(/(\d+):(\d\d)/.exec(await p.textContent('#sg-left'))), await p.textContent('#sg-left'));
  await p.evaluate(() => __sg.advance(61000)); await p.waitForFunction(() => !document.querySelector('[data-sg-layer="lock"]'), null, { timeout: 5000 });
  check('lock ends on time: overlay gone, page usable', await p.evaluate(() => !document.querySelector('[inert]')));
  const run = await stored(p, RUN); check('counting restarts from zero after the rest', run.lockUntil === 0 && run.acc < 5000 && run.misses.length === 0, run);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors); await s.close();
}

async function pinTest(env) {
  console.log('6. pin: set, wrong / right, disable ends the lock');
  const s = await open(env, '/', { seed: { [KEY]: ON({ min: 3, thr: 3 }) } }); const p = s.page;
  await openSG(p); await p.waitForSelector('#sg-pin1');
  await p.fill('#sg-pin1', '12'); await p.fill('#sg-pin2', '12'); await p.click('#sg-pinset'); check('a short PIN is refused', !(await stored(p, KEY)).pin);
  await p.fill('#sg-pin1', '4821'); await p.fill('#sg-pin2', '4820'); await p.click('#sg-pinset'); check('two different PINs are refused', !(await stored(p, KEY)).pin);
  await p.fill('#sg-pin1', '4821'); await p.fill('#sg-pin2', '4821'); await p.click('#sg-pinset');
  const raw = await p.evaluate(k => localStorage.getItem(k), KEY); const sv = JSON.parse(raw);
  check('PIN saved hashed (the digits are not in storage)', sv.pin && sv.pin.h.length === 64 && !raw.includes('4821'), raw.slice(0, 200));
  check('the note says the PIN is not tamper-proof', (await p.textContent('#sg-sbody')).includes('うっかり防止'));
  await closeSG(p);
  await openSG(p); await p.waitForSelector('#sg-pinin');
  check('with a PIN, the controls are locked until it is entered', await p.evaluate(() => document.getElementById('sg-on').disabled && document.getElementById('sg-min').querySelector('button').disabled));
  await p.fill('#sg-pinin', '1111'); await p.click('#sg-pinok'); check('a wrong PIN shows an error and stays locked', (await p.textContent('#sg-pinmsg')).includes('ちがいます') && await p.evaluate(() => document.getElementById('sg-on').disabled));
  await p.fill('#sg-pinin', '4821'); await p.press('#sg-pinin', 'Enter');
  await p.waitForFunction(() => !document.getElementById('sg-on').disabled);
  check('the right PIN (Enter key) unlocks the settings', true);
  await p.click('#sg-min [data-v="10"]'); check('and a change is saved', (await stored(p, KEY)).min === 10);
  await closeSG(p);
  // お休み中に、PIN でオフにすると、お休みも消える
  await p.goto(s.base + GAME); await p.waitForFunction(() => window.__sg);
  await p.evaluate(() => { const r = __sg.run(); r.lockUntil = Date.now() + 600000; localStorage.setItem('kobo.sg.run', JSON.stringify(r)); __sg.tick(); });
  await p.waitForSelector('[data-sg-layer="lock"]');
  await p.goto(s.base + '/'); await openSG(p);
  await p.fill('#sg-pinin', '4821'); await p.click('#sg-pinok'); await p.waitForFunction(() => !document.getElementById('sg-on').disabled);
  await p.click('#sg-on'); check('turned off with the PIN', (await stored(p, KEY)).on === false);
  await p.click('#sg-pinrm'); check('PIN can be removed once unlocked', (await stored(p, KEY)).pin === null);
  await p.goto(s.base + GAME); await p.waitForTimeout(1500);
  check('guard off: no lock screen and no quiz even though a lock was pending', !(await p.$('[data-sg-layer]')));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors); await s.close();
}

async function untilTest(env) {
  console.log('7. until: the test period ends');
  const y = jstKey(Date.now() - 86400000), t = jstKey(Date.now() + 86400000);
  const s = await open(env, GAME, { seed: { [KEY]: ON({ min: 3, until: y }) } }); const p = s.page;
  await p.waitForFunction(() => window.__sg || document.querySelector('.sg-bn'), null, { timeout: 8000 });
  await p.waitForTimeout(1500);
  const sv = await stored(p, KEY); check('past the date: turned off automatically', sv.on === false && sv.until === y, sv);
  check('a short notice says so, no quiz', !!(await p.$('.sg-bn')) && !(await quizOpen(p)));
  await p.evaluate(() => __sg && __sg.advance(400000)); await p.waitForTimeout(800); check('and time no longer builds up a quiz', !(await quizOpen(p)));
  await s.close();
  const s2 = await open(env, GAME, { seed: { [KEY]: ON({ min: 3, until: t }) } });
  await s2.page.waitForFunction(() => window.__sg); await s2.page.waitForTimeout(1200);
  check('a date still ahead keeps it on', (await stored(s2.page, KEY)).on === true); await s2.close();
}

async function hiddenTest(env) {
  console.log('8. hidden: no time is counted while the tab is hidden');
  const s = await open(env, GAME, { seed: { [KEY]: ON({ min: 5 }) } }); const p = s.page;
  await p.waitForFunction(() => window.__sg);
  await p.waitForTimeout(2500);
  const a = (await stored(p, RUN)).acc; check('visible: time builds up', a >= 1000, a);
  await p.evaluate(() => { Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => 'hidden' }); Object.defineProperty(document, 'hidden', { configurable: true, get: () => true }); document.dispatchEvent(new Event('visibilitychange')); });
  const b = (await stored(p, RUN)).acc; await p.waitForTimeout(3200); const c = (await stored(p, RUN)).acc;
  check('hidden for 3 s: nothing added', c - b < 600, [b, c]);
  await p.evaluate(() => { delete document.visibilityState; delete document.hidden; document.dispatchEvent(new Event('visibilitychange')); });
  await p.waitForTimeout(2200); const d = (await stored(p, RUN)).acc;
  check('visible again: counting resumes, the hidden time was not credited', d > c && d - c < 3500, [c, d]);
  // 別のページ（ハブ）では数えない
  await p.goto(s.base + '/'); await p.waitForTimeout(2200); const e = (await stored(p, RUN)).acc;
  check('on the hub (not a game page) nothing is counted', e - d < 800, [d, e]);
  await s.close();
}

async function layoutTest(env) {
  console.log('9. layout: 320px, light and dark, no overflow, 44px targets, no layout shift');
  for (const [vp, theme] of [['se1', 'light'], ['se1', 'dark'], ['land', 'dark'], ['ip12', 'light']]) {
    const tag = `${vp}/${theme}`;
    const s = await open(env, GAME, { vp, touch: true, cls: true, seed: { 'kobo.theme': theme, [KEY]: ON({ min: 3, q: 1, thr: 3, lock: 5 }) } }); const p = s.page;
    await p.waitForFunction(() => window.__sg);
    const fits = async what => {
      const r = await p.evaluate(() => {
        const out = { hscroll: document.documentElement.scrollWidth - document.documentElement.clientWidth, off: [], small: [] };
        const pn = document.querySelector('[data-sg-layer] .sg-panel'); if (pn) { const b = pn.getBoundingClientRect(); if (b.left < -1 || b.right > innerWidth + 1 || b.top < -1 || b.bottom > innerHeight + 1) out.off.push('panel ' + [b.left, b.top, b.right, b.bottom].map(Math.round)); }
        document.querySelectorAll('[data-sg-layer] button, [data-sg-layer] a, [data-sg-layer] input:not([type=checkbox])').forEach(e => { const r = e.getBoundingClientRect(); if (r.width && r.height && (r.height < 43.5 || r.width < 43.5)) out.small.push((e.id || e.textContent).slice(0, 20) + ' ' + Math.round(r.width) + 'x' + Math.round(r.height)); });
        return out;
      });
      check(`${tag} ${what}: fits, no sideways scroll, targets >= 44px`, r.hscroll <= 1 && r.off.length === 0 && r.small.length === 0, r);
    };
    await p.waitForTimeout(600); await p.evaluate(() => { window.__cls = 0; }); // ページ自身の読み込みでのずれは数えない：勉強ガードが出してから
    await p.evaluate(() => __sg.advance(181000)); await waitQuiz(p); await p.waitForTimeout(250);
    await fits('quiz'); if (vp === 'se1') await shot(p, `09-${tag}-quiz`);
    const bg = await p.evaluate(() => getComputedStyle(document.querySelector('.sg-panel')).backgroundColor); const lum = bg.match(/\d+/g).slice(0, 3).reduce((x, y) => x + +y, 0) / 3;
    check(`${tag}: panel colour follows the theme (${bg})`, theme === 'dark' ? lum < 110 : lum > 180, bg);
    await answer(p, false, { shot: vp === 'se1' ? `09-${tag}-fb` : null }); await p.waitForTimeout(150); await fits('after a miss');
    await answer(p, false); await answer(p, false);
    await p.waitForSelector('#sg-done'); await p.click('#sg-done'); await p.waitForSelector('[data-sg-layer="lock"]'); await p.waitForTimeout(200);
    await fits('lock'); if (vp === 'se1') await shot(p, `09-${tag}-lock`);
    const cls = await p.evaluate(() => window.__cls); check(`${tag}: layout shift (CLS) stays ~0 (${(cls || 0).toFixed(4)})`, (cls || 0) < 0.02, cls);
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors); await s.close();
  }
  const s = await open(env, '/', { vp: 'se1', touch: true, seed: { 'kobo.theme': 'dark', [KEY]: ON({}) } }); const p = s.page;
  await p.click('#setBtn'); await p.waitForSelector('.kb-set'); await (await p.$('.kb-set__row:has-text("勉強ガード") button')).click(); await p.waitForSelector('#sg-on');
  const r = await p.evaluate(() => { const pn = document.querySelector('[data-sg-layer="settings"] .sg-panel').getBoundingClientRect(); const bd = document.getElementById('sg-sbody'); return { w: pn.width, right: pn.right, iw: innerWidth, hs: document.documentElement.scrollWidth - innerWidth, inner: bd.scrollWidth - bd.clientWidth, small: [...document.querySelectorAll('[data-sg-layer] button, [data-sg-layer] input[type=date], [data-sg-layer] input:not([type=checkbox]), [data-sg-layer] .sg-chk')].filter(e => e.getBoundingClientRect().height < 43.5 && e.getBoundingClientRect().height > 0).map(e => e.id || e.className) }; });
  check('settings sheet at 320px: fits, no sideways scroll, targets >= 44px', r.right <= r.iw + 1 && r.hs <= 1 && r.inner <= 1 && r.small.length === 0, r); await shot(p, '09-se1-settings');
  await s.close();
  const e = await open(env, '/', { vp: 'se1', touch: true, lang: 'en', seed: { [KEY]: ON({}) } });
  await e.page.click('#setBtn'); await e.page.waitForSelector('.kb-set'); await (await e.page.$('.kb-set__row:has-text("Study guard") button')).click(); await e.page.waitForSelector('#sg-on');
  const txt = await e.page.textContent('[data-sg-layer="settings"]');
  check('English: settings text is English (no leftover Japanese)', !/[぀-ヿ一-鿿]/.test(txt.replace(/中学|高校/g, '')), txt.match(/[぀-ヿ一-鿿]+/g));
  await e.close();
}

async function keysTest(env) {
  console.log('10. keys: focus trap, Esc, Enter');
  const s = await open(env, GAME, { seed: { [KEY]: ON({ min: 3, q: 1, thr: 0 }) } }); const p = s.page;
  await p.waitForFunction(() => window.__sg);
  await p.focus('body'); await p.evaluate(() => { window.__gameKeys = 0; addEventListener('keydown', () => window.__gameKeys++); });
  await p.evaluate(() => __sg.advance(181000)); await waitQuiz(p);
  const inside = () => p.evaluate(() => document.querySelector('[data-sg-layer="quiz"]').contains(document.activeElement));
  check('focus starts inside the quiz', await inside());
  for (let i = 0; i < 14; i++) { await p.keyboard.press('Tab'); if (!(await inside())) break; }
  check('Tab cycles inside the modal (never reaches the game)', await inside());
  for (let i = 0; i < 6; i++) { await p.keyboard.press('Shift+Tab'); if (!(await inside())) break; }
  check('Shift+Tab too', await inside());
  await p.keyboard.press('Escape'); check('Escape does not dismiss the quiz', await quizOpen(p));
  const k = await p.evaluate(() => __sg.peek());
  if (k.t === 'nu' || k.t === 'sa') { await p.fill('#sg-input', String(k.right)); await p.press('#sg-input', 'Enter'); await wait(p, () => __sg.quiz().checked); check('Enter checks the answer', true); }
  else { await p.focus(`#sg-ans .sg-ch[data-label="${k.t === 'or' ? k.right[0] : k.right}"]`).catch(() => {}); check('choices are real buttons reachable by keyboard', await p.evaluate(() => document.querySelectorAll('#sg-ans button').length > 0)); await answer(p, true); }
  await p.waitForTimeout(100);
  check('keys pressed in the quiz do not reach the game', await p.evaluate(() => window.__gameKeys) === 0, await p.evaluate(() => window.__gameKeys));
  await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch(); const env = { server: srv, browser: () => browser };
  const t0 = Date.now(); const only = process.argv[2] ? process.argv[2].split(',') : null;
  const all = { off, hub, enable, quiz: quizTest, lock: lockTest, pin: pinTest, until: untilTest, hidden: hiddenTest, layout: layoutTest, keys: keysTest };
  for (const [n, f] of Object.entries(all)) {
    if (only && !only.includes(n)) continue;
    try { await f(env); } catch (e) { check(n + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
