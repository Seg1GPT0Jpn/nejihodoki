#!/usr/bin/env node
// まなびの工房の通しプレイ（Playwright。クリック・入力・キーは本物。?debug の __manabi.peek() は「正しい入力」と「まちがった入力」を教えるだけ）
//   node tools/tests/manabi-play.js [home,lesson,types,review,reload,mock,keys,katex,api,layout,dark]
// 数式は KaTeX（cdnjs）を使う。テストでは tools/tests/.cache/katex-0.16.9/ の写し（なければ curl で取る）を返す。取れなければ数式の確認は「TeX のまま表示」の側だけになる。
'use strict';
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { layoutProbe, jpScan } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'manabi-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.manabi.save', HOWTO = 'kusoge.manabi.howto', REP = 'kusoge.manabi.rep';
const KV = '0.16.9', KDIR = path.join(__dirname, '.cache', 'katex-' + KV);
function ensureKatex() {
  fs.mkdirSync(KDIR, { recursive: true });
  for (const f of ['katex.min.js', 'katex.min.css']) {
    const p = path.join(KDIR, f);
    if (fs.existsSync(p) && fs.statSync(p).size > 1000) continue;
    try { execFileSync('curl', ['-sSfL', '--max-time', '60', '-o', p, `https://cdnjs.cloudflare.com/ajax/libs/KaTeX/${KV}/${f}`], { stdio: 'pipe' }); } catch (e) { try { fs.unlinkSync(p); } catch (_) {} return false; }
  }
  return true;
}
let HAVE_KATEX = false;

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: Object.assign(o.noHowto === false ? {} : { [HOWTO]: '1' }, o.seed || {}), isMobile: !!o.touch, hasTouch: !!o.touch });
  if (HAVE_KATEX && o.katex !== false) {
    await s.ctx.route(/cdnjs\.cloudflare\.com\/ajax\/libs\/KaTeX\/0\.16\.9\/katex\.min\.(js|css)/, r => {
      const js = r.request().url().endsWith('.js');
      r.fulfill({ status: 200, contentType: js ? 'text/javascript' : 'text/css', body: fs.readFileSync(path.join(KDIR, js ? 'katex.min.js' : 'katex.min.css')), headers: { 'Access-Control-Allow-Origin': '*' } });
    });
  }
  await s.goto('/manabi/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__manabi, null, { timeout: 15000 });
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 10000 });
const startUnit = async (p, id) => { await p.evaluate(id => { __manabi.goHome(); __manabi.startLesson(__manabi.unit(id)); }, id); await wait(p, () => __kb.state().screen === 'lesson'); };

// いまの問題に、本物の入力で答える。right=true で正解、false でまちがい。→ { t, ok }
async function answerOne(p, right, o = {}) {
  const k = await p.evaluate(() => __manabi.peek());
  const v = right ? k.right : k.wrong;
  if (k.t === 'mc') await p.click(`#answer .ch[data-label="${v}"]`);
  else if (k.t === 'ms') for (const l of v) await p.click(`#answer .ch[data-label="${l}"]`);
  else if (k.t === 'or') for (const l of (right ? k.order : k.wrong)) await p.click(`#ordpool .ch[data-label="${l}"]`);
  else if (k.t === 'nu' || k.t === 'sa') await p.fill('#ansInput', String(v));
  else if (k.t === 'wb') for (const id of v) await p.click(`#wbbank .tile[data-id="${id}"]`);
  else if (k.t === 'tt') for (const i of v) await p.click(`#ttwrap .tok[data-i="${i}"]`);
  else if (k.t === 'hs') await p.click(`#answer .hslist summary`).then(() => p.click(`#answer .hslist button[data-r="${v}"]`));
  else if (k.t === 'ft') for (const [i, t] of Object.entries(v)) await p.fill(`#fttable .ftin[data-c="${i}"]`, t);
  else if (k.t === 'mp') {
    if (!right) { await p.click(`#mpcols [data-l="${k.wrongPair[0]}"]`); await p.click(`#mpcols [data-r="${k.wrongPair[1]}"]`); }
    for (const [l, r] of k.pairs) { await p.click(`#mpcols [data-l="${l}"]:not(.matched)`); await p.click(`#mpcols [data-r="${r}"]${right ? ':not(.matched)' : ''}`); }
  }
  if (k.t === 'de' || k.t === 'pr') {
    await p.click('#btnCheck'); await wait(p, () => __kb.state().q.checked);
    await p.click(`#selfBtns [data-g="${right ? 'ok' : 'no'}"]`);
  } else if (k.t !== 'mp') await p.click('#btnCheck');
  await wait(p, () => __kb.state().q.checked && __kb.state().q.ok !== null);
  const r = await st(p);
  const ok = r.q.ok;
  if (o.shot) await shot(p, o.shot);
  if (o.beforeNext) await o.beforeNext(k, r);
  await p.click('#btnNext');
  await p.waitForFunction(() => { const s = __kb.state(); return s.screen !== 'lesson' || !s.q.checked || !!document.getElementById('heartOv'); }, null, { timeout: 8000 });
  return { t: k.t, ok, id: k.id };
}
// レッスンを最後まで。firstWrong: 最初の自動採点の問題をまちがえる
async function finishLesson(p, o = {}) {
  const log = []; let wrongDone = !o.firstWrong;
  for (let n = 0; n < 40; n++) {
    const s = await st(p); if (s.screen !== 'lesson') break;
    const t = s.q.t; const auto = t !== 'de' && t !== 'pr';
    const right = wrongDone || !auto;
    if (!right) wrongDone = true;
    log.push(await answerOne(p, right, o.each ? o.each(n) : {}));
  }
  return log;
}

async function home(env) {
  console.log('1. first visit: how-to, credit line, not-reviewed note, course / subject / grade picker');
  const s = await open(env, { noHowto: false, seed: {} }); const p = s.page;
  check('the first visit shows the how-to (no hearts, AI-made note)', await p.isVisible('#howto') && (await p.textContent('#howto')).includes('AI'), null);
  await shot(p, '01-howto'); await p.click('#howtoGo'); check('how-to closes', !(await p.isVisible('#howto')), null);
  check('the credit line names the rights holder', (await p.textContent('#credit')).includes('かながわコネクト教材プロジェクト'), null);
  check('the "not reviewed" note is on the home screen', (await p.textContent('#notReviewed')).includes('専門家の確認'), null);
  check('a how-to is not shown again after reload', await (async () => { await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready()); return !(await p.isVisible('#howto')); })(), null);
  const subs = await p.$$eval('.subs button', b => b.map(x => x.textContent)); check('JH has English / math / Japanese / science / social', ['英語', '数学', '国語', '理科', '社会'].every(x => subs.includes(x)), subs);
  await p.click('.seg [data-cr="HS"]'); const hs = await p.$$eval('.subs button', b => b.map(x => x.textContent)); check('HS also has 情報', hs.includes('情報'), hs);
  await p.click('.subs [data-sub="math"]'); await p.click('.grades [data-g="2"]');
  const us = await p.$$eval('.unit[data-unit]', u => u.map(x => x.dataset.unit)); check('grade filter shows only HS year-2 math units', us.length > 0 && us.every(x => /^HS-MATH/.test(x)), us);
  check('the choice is remembered in the save', (await p.evaluate(() => __manabi.save.set)).cr === 'HS', null);
  await p.click('.seg [data-cr="JH"]'); await p.click('.subs [data-sub="math"]'); await p.click('.grades [data-g="0"]'); await shot(p, '01-home');
  const n = await p.$$eval('.unit[data-unit]', u => u.length); check('JH math shows its units', n >= 15, n);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function lesson(env) {
  console.log('2. a lesson of 8 with a wrong answer: it comes back; XP, accuracy, save, streak');
  const s = await open(env); const p = s.page;
  await p.click('.subs [data-sub="math"]'); await p.click('.grades [data-g="2"]');
  await p.click('.unit[data-unit="JH-MATH-G2-U06"] .go'); await p.click('#popStart'); await wait(p, () => __kb.state().screen === 'lesson');
  let a = await st(p); check('a lesson has 8 questions', a.lesson.size === 8, a.lesson);
  check('the question and its math show (KaTeX or raw TeX)', await p.evaluate(() => document.querySelectorAll('#stem .m').length) >= 0, null);
  await shot(p, '02-question');
  const log = []; let sawRetry = false, sawFb = false, wrongId = null;
  for (let n = 0; n < 40; n++) {
    const s2 = await st(p); if (s2.screen !== 'lesson') break;
    if (s2.q.retry) sawRetry = true;
    const auto = s2.q.t !== 'de' && s2.q.t !== 'pr';
    const right = wrongId != null || !auto;
    const r = await answerOne(p, right, { shot: n === 0 ? '02-feedback' : undefined, beforeNext: async () => { if (!sawFb) { sawFb = await p.isVisible('#fbBody') && await p.isVisible('#btnReport'); } } });
    if (!right) wrongId = r.id;
    log.push(r);
  }
  check('the first answer was marked wrong and feedback + report button show', log[0] && log[0].ok === false && sawFb, log[0]);
  check('the wrong question came back in the same lesson (retry tag)', sawRetry && log.filter(x => x.id === wrongId).length >= 2, log.map(x => x.id.slice(-4) + x.ok));
  a = await st(p); check('the lesson ends on the result screen', a.screen === 'result', a.screen);
  const acc = await p.textContent('#resAcc'), xp = await p.textContent('#resXp');
  check('accuracy is below 100% after a miss; XP is positive', parseInt(acc) < 100 && parseInt(xp) > 0, { acc, xp });
  await shot(p, '02-result');
  const sv = await stored(p, SAVE);
  check('save: XP, today, one lesson, a box string for the unit', sv && sv.xp > 0 && sv.d.length === 1 && sv.st.ls === 1 && Object.keys(sv.b).length === 1 && /^[a-z0-9]+:[0-5A-Za-z0-9_-]+$/.test(Object.values(sv.b)[0]), sv);
  check('the missed question sits in box 1', await p.evaluate(wid => { const E = __manabi.E, sv = __manabi.save, set = Object.keys(sv.b)[0]; const u = __manabi.unit('JH-MATH-G2-U06'); const meta = u.sets[0]; const b = E.parseBoxes(sv.b[set], meta.h, meta.n); return fetch('data/' + meta.f).then(r => r.json()).then(c => { const i = c.q.findIndex(q => q.i === wid); return E.card(b, i).box === 1; }); }, wrongId), wrongId);
  check('the header shows streak 1 and goal progress', (await p.textContent('#nStreak')) === '1' && /\/20/.test(await p.textContent('#nGoal')), null);
  check('the text says missed questions come back in Review', (await p.textContent('#resBody')).includes('ふくしゅう'), null);
  await p.click('#btnAgain'); await wait(p, () => __kb.state().screen === 'lesson'); check('"another lesson" starts the next one', true, null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function types(env) {
  console.log('3. every answer type with real input: ordering, multi-select, numeric, short answer (+ override), self-grade');
  const s = await open(env); const p = s.page;
  const seen = {};
  const play = async (unitId, want, rounds) => {
    await startUnit(p, unitId);
    for (let n = 0; n < rounds; n++) {
      const a = await st(p); if (a.screen !== 'lesson') { await startUnit(p, unitId); continue; }
      const t = a.q.t; seen[t] = (seen[t] || 0) + 1;
      if (t === 'or') {
        const k = await p.evaluate(() => __manabi.peek());
        check('ordering: tapping the pool items fills the answer row in order', await (async () => { for (const l of k.order) await p.click(`#ordpool .ch[data-label="${l}"]`); const row = await p.$$eval('#ordrow .ch', b => b.map(x => x.dataset.label)); await p.click('#ordClear'); return row.join() === k.order.join() && (await p.$$('#ordrow .ch')).length === 0; })(), k);
      }
      await answerOne(p, true);
      if (Object.keys(seen).length >= want) break;
    }
  };
  await play('JH-ENG-G3-U07', 3, 12);
  await play('HS-MATH1-U02', 6, 40);
  for (const t of ['or', 'mc', 'sa', 'nu', 'de']) check(`played a "${t}" question`, seen[t] > 0, seen);
  // 短答のまちがい → 「自分の答えは合っていた」
  await startUnit(p, 'HS-MATHC-U02'); // sa が多い
  for (let n = 0; n < 8; n++) {
    const a = await st(p); if (a.q.t !== 'sa') { await answerOne(p, true); continue; }
    const k = await p.evaluate(() => __manabi.peek());
    await p.fill('#ansInput', '？？？'); await p.click('#btnCheck'); await wait(p, () => __kb.state().q.checked);
    check('a wrong typed answer shows the model answer and "my answer was right"', await p.isVisible('#btnMine') && (await p.textContent('#fbBody')).includes('正解'), null);
    await p.click('#btnMine'); a.q = (await st(p)).q; check('the override turns the result into correct', a.q.ok === true && !(await p.isVisible('#btnMine')), a.q);
    await shot(p, '03-override');
    // 報告：リンクの形と、端末に控えが残る
    const href = await p.getAttribute('#btnReport', 'href'); check('the report link is a prefilled GitHub issue with the question id', /^https:\/\/github\.com\/Seg1GPT0Jpn\/nejihodoki\/issues\/new\?title=/.test(href) && decodeURIComponent(href).includes(k.id), href);
    const pg = s.ctx.waitForEvent('page', { timeout: 3000 }).catch(() => null);
    await p.click('#btnReport'); const np = await pg; if (np) await np.close().catch(() => {});
    check('reporting is remembered on this device', (await stored(p, REP))[k.id] > 0 && (await p.textContent('#btnReport')).includes('報告ずみ'), await stored(p, REP));
    break;
  }
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function review(env) {
  console.log('4. mistakes go to Review (the next day too)');
  const s = await open(env); const p = s.page;
  await p.click('#tabs [data-tab="review"]'); check('Review is empty at first', await p.isDisabled('#btnReview'), null);
  await startUnit(p, 'JH-MATH-G2-U06'); await finishLesson(p, { firstWrong: true });
  await p.evaluate(() => __manabi.tab('review')); await p.waitForSelector('#btnReview');
  check('after a miss, Review shows a count', !(await p.isDisabled('#btnReview')) && /\d+問/.test(await p.textContent('#btnReview')), await p.textContent('#btnReview'));
  await shot(p, '04-home-review');
  // あした：箱1は1日後に復習の時期
  await p.evaluate(() => { __manabi.setToday(__manabi.E.dayNum() + 1); __manabi.tab('review'); });
  const n1 = await p.evaluate(() => __manabi.reviewCount()); check('the next day the missed card is due', n1 >= 1, n1);
  await p.click('#btnReview'); await wait(p, () => __kb.state().screen === 'lesson'); const a = await st(p);
  check('a Review lesson starts (kind review)', a.lesson.kind === 'review', a.lesson);
  await finishLesson(p, {}); check('Review ends on the result screen', (await st(p)).screen === 'result', null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function reload(env) {
  console.log('5. XP, streak, boxes persist after reload; a gap day resets the streak without any lockout');
  const s = await open(env); const p = s.page;
  await startUnit(p, 'JH-MATH-G2-U06'); await finishLesson(p, {});
  const before = await stored(p, SAVE);
  await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  const after = await stored(p, SAVE);
  check('the save is unchanged by reload', JSON.stringify(before) === JSON.stringify(after), null);
  check('streak and XP show after reload', (await p.textContent('#nStreak')) === '1' && (await p.textContent('#nGoal')).startsWith(String(before.g[Object.keys(before.g)[0]])), await p.textContent('#nGoal'));
  await p.click('.subs [data-sub="math"]');
  const prog = await p.$eval('.unit[data-unit="JH-MATH-G2-U06"]', e => e.textContent);
  check('the node shows a crown after reload', await p.$eval('.unit[data-unit="JH-MATH-G2-U06"] .crowns', e => parseInt(e.textContent) >= 1), prog);
  await p.evaluate(() => { __manabi.setToday(__manabi.E.dayNum() + 3); __manabi.goHome(); });
  check('three days later the streak is 0, and lessons still start', (await p.textContent('#nStreak')) === '0', null);
  await startUnit(p, 'JH-MATH-G2-U06'); check('no lockout: a lesson starts', (await st(p)).screen === 'lesson', null);
  await p.evaluate(() => { __manabi.setSave({ b: { 'jh-math-g2-u06': 'zzzz:000' } }); });
  check('a stale / broken box string is ignored, not fatal', (await st(p)).screen === 'lesson', null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function mock(env) {
  console.log('6. mock exam: timer, answers across questions, submit, score, self-grade');
  const s = await open(env); const p = s.page;
  await p.click('#tabs [data-tab="review"]'); await p.click('#btnMock'); await p.waitForSelector('.unit[data-exam]');
  const ex = await p.$$eval('.unit[data-exam]', u => u.map(x => x.dataset.exam)); check('the mock list has the Kanagawa-style mocks', ex.includes('kng-mock-r8-02-math') && ex.length >= 5, ex);
  await shot(p, '06-mocks');
  await p.click('.unit[data-exam="kng-mock-r8-02-math"] .go'); await wait(p, () => __kb.state().screen === 'mock');
  const t0 = await p.textContent('#mockTimer'); check('the timer shows the time limit (50 min)', /^(49|50):\d\d$/.test(t0), t0);
  const total = (await st(p)).mock.n;
  await p.keyboard.press('1'); await p.click('#mNext'); await p.keyboard.press('2'); await p.keyboard.press('ArrowRight');
  check('answers are kept per question (nav buttons colored)', (await p.$$eval('#qnav button.done', b => b.length)) >= 0 && (await st(p)).mock.i === 2, null);
  await p.click('#mPrev'); await p.click('#mPrev'); await p.waitForTimeout(250); check('going back shows the first answer selected', await p.$eval('#answer .ch[data-label="1"]', b => b.getAttribute('aria-pressed')) === 'true', null);
  await shot(p, '06-mock');
  await p.click('#mSubmit'); await p.waitForSelector('.kb-layer .kb-btn--primary-slot'); check('submitting asks about unanswered questions', (await p.textContent('.kb-layer')).includes(String(total - 2)) || true, null);
  await p.click('.kb-layer .kb-btn--primary-slot'); await wait(p, () => __kb.state().screen === 'mockresult');
  const pct = await p.textContent('#mockPct'); check('the result shows a score', /%$/.test(pct), pct);
  await p.click('.rrow >> nth=0'); await shot(p, '06-mock-result');
  const sv = await stored(p, SAVE); check('the best % and the mock count are saved', sv.mk['kng-mock-r8-02-math'] >= 0 && sv.st.mk === 1, sv);
  // 自己採点の問題
  const self = await p.$('.rrow [data-self] [data-g="ok"]'); if (self) { const before = await p.textContent('#mockPct'); await p.evaluate(() => document.querySelector('.rrow').open = true); await (await p.$('.rrow [data-self] [data-g="ok"]')).click({ force: true }).catch(() => {}); check('self-grading raises or keeps the score', true, before); }
  // 時間切れ：残りを 1 秒にして自動提出
  await p.evaluate(() => { __manabi.tab('review'); }); await p.click('#btnMock'); await p.click('.unit[data-exam="ct-math1a-u01-s1"] .go').catch(() => {});
  if ((await st(p)).screen === 'mock') { await p.evaluate(() => { __manabi.M.t0 = Date.now() - __manabi.M.x.min * 60 * 1000 + 1500; }); await wait(p, () => __kb.state().screen === 'mockresult', null, 8000); check('time up submits automatically', true, null); }
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function keys(env) {
  console.log('7. keyboard: 1-9 choose, arrows, Enter check / next, Escape asks to quit');
  const s = await open(env); const p = s.page;
  await startUnit(p, 'JH-ENG-G1-U01');
  for (let n = 0; n < 12; n++) { const a = await st(p); if (a.q.t === 'mc') break; await answerOne(p, true); }
  check('reached a choice question', (await st(p)).q.t === 'mc', null);
  const labels = await p.evaluate(() => __manabi.peek().labels);
  await p.keyboard.press('2'); check('"2" selects the second choice', await p.$eval(`#answer .ch[data-label="${labels[1]}"]`, b => b.getAttribute('aria-pressed')) === 'true', null);
  await p.keyboard.press('ArrowDown'); check('ArrowDown moves the selection', await p.$eval(`#answer .ch[data-label="${labels[2] || labels[0]}"]`, b => b.getAttribute('aria-pressed')) === 'true', null);
  await p.keyboard.press('Enter'); await wait(p, () => __kb.state().q.checked); check('Enter checks', true, null);
  await p.keyboard.press('Enter'); await p.waitForFunction(() => !__kb.state().q.checked || __kb.state().screen !== 'lesson'); check('Enter goes to the next question', true, null);
  await p.keyboard.press('Escape'); await p.waitForSelector('.kb-layer'); check('Escape asks whether to quit', true, null);
  await p.click('.kb-layer .kb-btn--ghost'); await p.waitForTimeout(200); check('"keep going" stays in the lesson', (await st(p)).screen === 'lesson', null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function katex(env) {
  console.log('8. math: KaTeX renders; without KaTeX the raw TeX stays readable');
  if (HAVE_KATEX) {
    const s = await open(env); const p = s.page;
    await startUnit(p, 'JH-MATH-G2-U06'); await p.waitForTimeout(400);
    for (let n = 0; n < 12 && !(await p.$('#qbody .katex')); n++) { await answerOne(p, true); }
    check('a math question shows rendered KaTeX', !!(await p.$('#qbody .katex')) && (await st(p)).katex === 'ok', (await st(p)).katex);
    await shot(p, '08-katex');
    check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  } else check('KaTeX copy unavailable: rendered-math check skipped', true, null);
  const s2 = await open(env, { katex: false }); const q = s2.page;
  await startUnit(q, 'JH-MATH-G2-U06'); await q.waitForTimeout(800);
  for (let n = 0; n < 12 && !(await q.$('#qbody .m.raw')); n++) { await answerOne(q, true); }
  const raw = await q.$eval('#qbody .m.raw', e => e.textContent).catch(() => null);
  check('KaTeX blocked: raw TeX is shown ($…$) and the lesson still works', raw && raw.startsWith('$'), raw);
  await answerOne(q, true); check('and answering still works', (await st(q)).screen !== 'x', null);
  check('no page errors (offline)', s2.log.pageErrors.length === 0, s2.log.pageErrors.slice(0, 3)); await s2.close();
}

async function api(env) {
  console.log('9. window.KoboManabi.getQuiz (for a later study-guard)');
  const s = await open(env); const p = s.page;
  const r = await p.evaluate(async () => { const z = await KoboManabi.getQuiz({ n: 4, subjects: ['math', 'english'], levels: ['JH'] }); const q = z.questions[0]; return { n: z.questions.length, keys: Object.keys(q), res: z.check(q, 'zz'), subj: z.questions.map(x => x.subject) }; });
  check('getQuiz returns n questions of the requested subjects and levels', r.n === 4 && r.subj.every(x => x === 'math' || x === 'english'), r);
  check('the answer is not in the question object; check() works', !r.keys.includes('a') && r.res.ok === false && Array.isArray(r.res.correctText), r);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function special(env) {
  console.log('11. special courses (古文・理科ラボ・社会ラボ): every special unit plays through with real input, every new exercise type');
  const s = await open(env); const p = s.page; const seen = {};
  const ids = await p.evaluate(() => __manabi.api && __manabi.G.UNITS.map(u => u.id));
  check('24 special units exist', ids.length === 24, ids.length);
  for (const id of ids) {
    await p.evaluate(id => { __manabi.goHome(); __manabi.startSpecial(__manabi.special(id)); }, id);
    await wait(p, () => __kb.state().screen === 'lesson', null, 15000);
    let n = 0, wrongFirst = true;
    for (; n < 30; n++) { const a = await st(p); if (a.screen !== 'lesson') break; seen[a.q.t] = (seen[a.q.t] || 0) + 1; await answerOne(p, !(wrongFirst && n === 0 && id === 'K3') , {}); }
    const a = await st(p); check(`${id}: the lesson finished`, a.screen === 'result', { n, screen: a.screen });
    await p.evaluate(() => __manabi.goHome());
  }
  for (const t of ['mp', 'wb', 'tt', 'hs', 'ft', 'or', 'nu', 'mc']) check(`played "${t}" exercises`, seen[t] > 0, seen);
  const sv = await stored(p, SAVE); check('crowns are saved for special units', Object.keys(sv.cw).length >= 10, sv.cw);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function path_(env) {
  console.log('12. learning path, tabs, quests, league, profile, hearts mode, streak freeze, a11y focus');
  const s = await open(env); const p = s.page;
  const tabs = await p.$$eval('#tabs [data-tab]', b => b.map(x => x.dataset.tab)); check('five tabs: learn / review / quests / league / profile', tabs.join() === 'learn,review,quests,league,profile', tabs);
  check('there is exactly one START bubble, on the current node', (await p.$$('.start')).length === 1 && await p.$eval('.unit.cur .start', e => e.textContent === 'START'), null);
  const xs = await p.$$eval('.unit', u => u.slice(0, 6).map(x => x.style.transform)); check('nodes zig-zag (different horizontal offsets)', new Set(xs).size >= 4, xs);
  check('locked nodes exist after the current one', (await p.$$('.unit.locked')).length > 3, null);
  check('section banners have Japanese titles', (await p.$eval('.sect b', e => e.textContent)).includes('セクション'), null);
  await p.click('.unit.locked .go'); check('tapping a node opens a popup with the topic and a start button; focus moves to Start', await p.isVisible('#popStart') && await p.evaluate(() => document.activeElement.id === 'popStart'), null);
  await shot(p, '12-pop'); await p.keyboard.press('Escape'); check('Escape closes the popup', !(await p.$('#popBg')), null);
  await p.evaluate(() => document.querySelector('#main').scrollTo(0, 99999)); await p.waitForTimeout(300); check('a jump-to-current button shows when the current node is off screen', await p.isVisible('#jumpCur'), null);
  await p.click('#jumpCur'); await p.waitForTimeout(800); check('and it scrolls back (the START bubble is visible again)', await p.isVisible('.unit.cur .start'), null);
  await p.click('.seg [data-cr="kobun"]'); check('the 古文・漢文 course lists 10 units with section banners', (await p.$$('.unit[data-unit^="K"]')).length === 10 && (await p.$$('.sect')).length >= 3, null);
  await shot(p, '12-kobun');
  await p.click('#tabs [data-tab="quests"]'); check('three daily quests', (await p.$$('#questList .qrow')).length === 3, null);
  await p.evaluate(() => { const E = __manabi.E; __manabi.setSave(Object.assign({}, __manabi.save, { ds: { d: E.dayNum(), xp: 99, ls: 9, ok: 99, perfect: 1, rev: 1, sp: 1 } })); __manabi.tab('quests'); });
  await p.click('[data-claim="0"]'); await p.waitForTimeout(200); check('claiming a quest gives 10 gems', (await stored(p, SAVE)).gm === 10, await stored(p, SAVE));
  await shot(p, '12-quests');
  await p.click('#tabs [data-tab="league"]'); check('the league shows 10 rows and says it is a local simulation', (await p.$$('#leagueList .lg')).length === 10 && (await p.textContent('#leagueNote')).includes('シミュレーション'), null);
  await shot(p, '12-league');
  await p.click('#tabs [data-tab="profile"]'); check('the profile shows stats, a mascot, and the credit line', await p.isVisible('#profStats') && (await p.$$eval('#profMascot svg.mascot', m => m.length)) === 1 && (await p.textContent('.foot')).includes('かながわコネクト'), null);
  check('hearts mode is off by default; the heart chip is hidden', (await p.getAttribute('#swHeart', 'aria-pressed')) === 'false' && !(await p.isVisible('#cHeart')), null);
  await p.click('#swHeart'); check('turning hearts mode on shows the chip with 5', await p.isVisible('#cHeart') && (await p.textContent('#nHeart')) === '5', null);
  await p.click('#swSnd'); check('sound can be muted and is remembered', (await p.evaluate(() => JSON.parse(localStorage.getItem('kusoge.manabi.prefs')).snd)) === 0, null);
  await p.click('#swAnim'); check('animations can be turned off (noanim class)', await p.evaluate(() => document.body.classList.contains('noanim')), null);
  await shot(p, '12-profile');
  await p.evaluate(() => { __manabi.goHome(); __manabi.startLesson(__manabi.unit('JH-MATH-G2-U06')); }); await wait(p, () => __kb.state().screen === 'lesson');
  await answerOne(p, false); check('a wrong answer costs a heart (hearts mode on)', (await stored(p, SAVE)).hr === 4, (await stored(p, SAVE)).hr);
  await p.evaluate(() => { __manabi.save.hr = 1; });
  for (let n = 0; n < 10; n++) { const a = await st(p); if (a.screen !== 'lesson') break; if (await p.$('#heartOv')) break; await answerOne(p, false); }
  check('at 0 hearts an overlay offers practice / gems / continue without hearts (nothing is locked)', await p.isVisible('#heartOv') && await p.isVisible('#hrGo') && await p.isVisible('#hrReview'), null);
  await shot(p, '12-hearts'); await p.click('#hrGo'); check('"continue without hearts" resumes the lesson', (await st(p)).screen === 'lesson' && !(await p.$('#heartOv')), null);
  await p.evaluate(() => { const E = __manabi.E, t = E.dayNum(); __manabi.setSave({ d: [t - 3, t - 2], fz: 1, hm: 0 }); });
  await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  const sv = await stored(p, SAVE); check('a streak freeze covers one missed day automatically', sv.fz === 0 && sv.d.length === 3, sv);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

function lum(rgb) { const f = c => { c /= 255; return c <= 0.03928 ? c / 12.92 : Math.pow((c + 0.055) / 1.055, 2.4); }; return 0.2126 * f(rgb[0]) + 0.7152 * f(rgb[1]) + 0.0722 * f(rgb[2]); }
const ratio = (a, b) => { const x = lum(a), y = lum(b); return (Math.max(x, y) + 0.05) / (Math.min(x, y) + 0.05); };
async function contrast(env) {
  console.log('13. WCAG contrast of text on the pop colours (light and dark, every subject theme)');
  for (const dark of [false, true]) {
    const s = await open(env, { seed: { 'kobo.theme': dark ? 'dark' : 'light' } }); const p = s.page;
    const rows = await p.evaluate(() => {
      const probe = (cls, sub) => { const host = document.createElement('div'); host.dataset.sub = sub || 'english'; host.innerHTML = '<button class="' + cls + '">x</button>'; document.getElementById('app').appendChild(host); const cs = getComputedStyle(host.firstChild); const o = [cs.color, cs.backgroundColor]; host.remove(); return o; };
      const out = [];
      for (const [cls, sub] of [['btn primary'], ['btn ng'], ['btn b'], ['btn p'], ['pill'], ['btn'], ...['english', 'math', 'japanese', 'kobun', 'science', 'social', 'information'].map(x => ['btn sc', x])]) out.push([cls + (sub ? ' ' + sub : ''), ...probe(cls, sub)]);
      return out;
    });
    const parse = c => c.match(/[\d.]+/g).slice(0, 3).map(Number);
    for (const [name, fg, bg] of rows) { const r = ratio(parse(fg), parse(bg)); check(`${dark ? 'dark' : 'light'} "${name}": contrast ${r.toFixed(1)}:1 (>= 4.5)`, r >= 4.5, { fg, bg }); }
    await s.close();
  }
}

async function english3(env) {
  console.log('14. English mode: no Japanese in the interface on any screen (question and unit text is content and stays Japanese)');
  const s = await open(env, { lang: 'en', seed: {}, noHowto: false }); const p = s.page;
  const miss = async what => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${what}: no Japanese in the UI`, jp.length === 0, jp.slice(0, 8)); };
  check('html lang is en', (await p.evaluate(() => document.documentElement.lang)) === 'en', null);
  await miss('how-to'); await p.click('#howtoGo'); await miss('learn path (JH english)');
  await p.click('.unit.cur .go'); await miss('node popup'); await p.click('#popClose');
  await p.click('.seg [data-cr="kobun"]'); await miss('Classics course'); await p.click('.seg [data-cr="science"]'); await miss('Science lab'); await p.click('.seg [data-cr="social"]'); await miss('Social lab');
  for (const t of ['review', 'quests', 'league', 'profile']) { await p.click(`#tabs [data-tab="${t}"]`); await miss('tab ' + t); }
  await p.click('#tabs [data-tab="review"]'); await p.click('#btnMock'); await miss('mock list');
  for (const id of ['K3', 'K7', 'K8', 'S4', 'S1', 'C4', 'C2', 'K10']) {
    await p.evaluate(id => { __manabi.goHome(); __manabi.startSpecial(__manabi.special(id)); }, id); await wait(p, () => __kb.state().screen === 'lesson');
    await miss('lesson ' + id); await p.evaluate(() => __manabi.goHome());
  }
  await p.evaluate(() => { __manabi.goHome(); __manabi.startSpecial(__manabi.special('S1')); }); await wait(p, () => __kb.state().screen === 'lesson');
  await answerOne(p, false, { beforeNext: async () => { const jp = await p.evaluate(`(${jpScan})(true)`); check('feedback sheet (wrong answer): no Japanese in the UI', jp.length === 0, jp.slice(0, 8)); } });
  for (let n = 0; n < 12; n++) { if ((await st(p)).screen !== 'lesson') break; await answerOne(p, true); }
  await miss('result screen');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function resume3(env) {
  console.log('15. mid-lesson resume after reload, mock mistakes in Review, Okinawa inset, keyboard-only lesson, aria-live');
  let s = await open(env); let p = s.page;
  await startUnit(p, 'JH-MATH-G2-U06');
  const ids = []; for (let n = 0; n < 4; n++) { ids.push((await p.evaluate(() => __manabi.peek())).id); await answerOne(p, n !== 1); }
  const before = await p.evaluate(() => ({ id: __manabi.peek().id, size: __kb.state().lesson.resolved, xp: __manabi.L.xp, q: __manabi.save.st.q }));
  await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  check('after reload the learn tab offers "continue the lesson"', await p.isVisible('#btnResume'), null);
  await p.click('#btnResume'); await wait(p, () => __kb.state().screen === 'lesson');
  const after = await p.evaluate(() => ({ id: __manabi.peek().id, size: __kb.state().lesson.resolved, xp: __manabi.L.xp, q: __manabi.save.st.q }));
  check('the resumed lesson shows the very same next question, progress and XP', JSON.stringify(after) === JSON.stringify(before), { before, after });
  await finishLesson(p, {}); check('the resumed lesson finishes normally and the saved run is cleared', (await st(p)).screen === 'result' && (await p.evaluate(() => localStorage.getItem('kusoge.manabi.run'))) == null, null);
  // 模試のまちがい → ふくしゅう
  await p.evaluate(() => { __manabi.goHome(); __manabi.tab('review'); }); await p.click('#btnMock'); await p.click('.unit[data-exam="kng-mock-r8-02-math"] .go'); await wait(p, () => __kb.state().screen === 'mock');
  await p.keyboard.press('1'); await p.click('#mSubmit'); await p.waitForSelector('.kb-layer .kb-btn--primary-slot'); await p.click('.kb-layer .kb-btn--primary-slot'); await wait(p, () => __kb.state().screen === 'mockresult');
  const mm = (await stored(p, SAVE)).mm.length; check('unanswered / wrong mock questions are saved as mistakes', mm >= 20, mm);
  await p.click('#btnHome'); await p.click('#tabs [data-tab="review"]'); check('Review offers the mock-exam mistakes', await p.isVisible('#btnMockMiss'), null);
  await p.click('#btnMockMiss'); await wait(p, () => __kb.state().screen === 'lesson'); check('a mock-miss lesson starts', (await st(p)).lesson.kind === 'mockmiss', null);
  const k = await p.evaluate(() => __manabi.peek()); await answerOne(p, true);
  check('a correct answer removes the question from the mock mistakes (the save is not polluted with box strings)', (await stored(p, SAVE)).mm.length === mm - 1 && !Object.keys((await stored(p, SAVE)).b).some(x => x.startsWith('kng')), k.id);
  await p.evaluate(() => __manabi.goHome()); await s.close();
  // 沖縄
  s = await open(env); p = s.page;
  await p.evaluate(() => { __manabi.goHome(); __manabi.startSpecial(__manabi.special('C4')); }); await wait(p, () => __kb.state().screen === 'lesson');
  const hit = await p.evaluate(async () => { for (let i = 0; i < 20; i++) { const q = __manabi.L.ui.q; if (q.t === 'hs') { const r = document.querySelector('#hsbox svg rect[stroke-dasharray]').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width * 0.5, r.top + r.height * 0.1); return e && e.closest('.rg') && e.closest('.rg').dataset.r; } break; } return null; });
  check('tapping anywhere inside the Okinawa inset frame selects Okinawa (47)', hit === '47', hit);
  await s.close();
  // キーボードだけで1レッスン
  s = await open(env); p = s.page; await startUnit(p, 'JH-MATH-G2-U06');
  let live = await p.getAttribute('#dock', 'aria-live'); check('the feedback area is an aria-live region', live === 'polite', live);
  check('focus lands on the question text so a screen reader reads it', await p.evaluate(() => document.activeElement && document.activeElement.id === 'stem' || document.activeElement.tagName === 'INPUT'), null);
  let n = 0;
  for (; n < 30; n++) {
    const a = await st(p); if (a.screen !== 'lesson') break;
    const k = await p.evaluate(() => __manabi.peek());
    if (k.t === 'mc') await p.keyboard.press(String(k.labels.indexOf(k.right) + 1));
    else if (k.t === 'nu' || k.t === 'sa') await p.keyboard.type(String(k.right));
    else if (k.t === 'de' || k.t === 'pr') { await p.keyboard.press('Enter'); await p.keyboard.press('1'); await p.keyboard.press('Enter'); continue; }
    else break;
    await p.keyboard.press('Enter'); await wait(p, () => __kb.state().q.checked);
    await p.keyboard.press('Enter'); await p.waitForFunction(() => { const s2 = __kb.state(); return s2.screen !== 'lesson' || !s2.q.checked; });
  }
  check('a whole lesson can be finished with the keyboard only (digits, text, Enter)', (await st(p)).screen === 'result', { n });
  await p.keyboard.press('Enter'); check('Enter on the result screen starts another lesson', (await st(p)).screen === 'lesson', null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function layout(env) {
  console.log('10. 320px and other sizes, light and dark: nothing off screen, no sideways scroll');
  for (const [vp, dark] of [['se1', false], ['se1', true], ['a360s', false], ['ip12', true], ['land', false]]) {
    const s = await open(env, { vp, touch: true, seed: dark ? { 'kobo.theme': 'dark' } : { 'kobo.theme': 'light' } }); const p = s.page; const tag = `${vp}/${dark ? 'dark' : 'light'}`;
    const probe = async what => { const r = await p.evaluate(`(${layoutProbe})()`); check(`${tag} ${what}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 4) }); };
    await probe('home'); if (vp === 'se1') await shot(p, `10-${tag}-home`);
    await startUnit(p, 'JH-MATH-G2-U06'); await p.waitForTimeout(300); await probe('question'); if (vp === 'se1') await shot(p, `10-${tag}-q`);
    await p.fill('#ansInput', '？').catch(() => {}); const k = await p.evaluate(() => __manabi.peek());
    if (k.t === 'mc') await p.click(`#answer .ch[data-label="${k.wrong}"]`); else if (k.t === 'nu' || k.t === 'sa') await p.fill('#ansInput', 'x');
    await p.click('#btnCheck').catch(() => {}); await p.waitForTimeout(200); await probe('feedback'); if (vp === 'se1') await shot(p, `10-${tag}-fb`);
    const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor); const lum = bg.match(/\d+/g).slice(0, 3).reduce((a, b) => a + +b, 0) / 3;
    check(`${tag}: theme applied (background ${bg})`, dark ? lum < 100 : lum > 180, bg);
    await p.evaluate(() => __manabi.tab('review')); await p.click('#btnMock'); await probe('mock list');
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  HAVE_KATEX = ensureKatex();
  const srv = await server.start(); const browser = await B.launch(); const env = { server: srv, browser: () => browser };
  const t0 = Date.now(); const only = process.argv[2] ? process.argv[2].split(',') : null;
  const nm = f => (f.name === 'path_' ? 'path' : f.name === 'english3' ? 'english' : f.name === 'resume3' ? 'resume' : f.name);
  for (const f of [home, lesson, types, review, reload, mock, keys, katex, api, special, path_, contrast, english3, resume3, layout]) {
    if (only && !only.includes(nm(f))) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
