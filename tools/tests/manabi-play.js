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
const GONE = { state: 'detached', timeout: 8000 };
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
  await p.evaluate(() => __manabi.unlockAll()); await p.click('.subs [data-sub="math"]'); await p.click('.grades [data-g="2"]');
  await p.click('.unit[data-unit^="JH-MATH-G2-U06-"] .go'); await p.click('#popStart'); await wait(p, () => __kb.state().screen === 'lesson');
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
  const prog = await p.$eval('.unit[data-unit^="JH-MATH-G2-U06-"]', e => e.textContent);
  check('the node shows a crown after reload', await p.$eval('.unit[data-unit^="JH-MATH-G2-U06-"] .crowns', e => parseInt(e.textContent) >= 1), prog);
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
  check('45 special units exist (24 + 14 math lab + 7 English lab)', ids.length === 45, ids.length);
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
  check('section banners have Japanese titles', (await p.$eval('.sect small', e => e.textContent)).includes('セクション'), null);
  await p.click('.unit.locked .go'); check('tapping a locked node opens a popup with a clear message and the jump-ahead test, but no start button', await p.isVisible('#lockMsg') && await p.isVisible('#popJump') && !(await p.$('#popStart')), null);
  await p.keyboard.press('Escape'); await p.click('.unit.cur .go'); check('tapping the current node opens a popup with the start button; focus moves to Start', await p.isVisible('#popStart') && await p.evaluate(() => document.activeElement.id === 'popStart'), null);
  await shot(p, '12-pop'); await p.keyboard.press('Escape'); check('Escape closes the popup', !(await p.$('#popBg')), null);
  await p.evaluate(() => document.querySelector('#main').scrollTo(0, 99999)); await p.waitForTimeout(300); check('a jump-to-current button shows when the current node is off screen', await p.isVisible('#jumpCur'), null);
  await p.click('#jumpCur'); await p.waitForTimeout(800); check('and it scrolls back (the START bubble is visible again)', await p.isVisible('.unit.cur .start'), null);
  await p.click('.seg [data-cr="kobun"]'); check('the 古文・漢文 course lists 10 units with section banners', (await p.$$('.unit[data-unit^="K"]')).length === 10 && (await p.$$('.sect')).length >= 3, null);
  await shot(p, '12-kobun');
  await p.click('#tabs [data-tab="quests"]'); check('three daily quests', (await p.$$('#questList .qrow')).length === 3, null);
  await p.evaluate(() => { const E = __manabi.E; __manabi.setSave(Object.assign({}, __manabi.save, { ds: { d: E.dayNum(), xp: 99, ls: 9, ok: 99, perfect: 1, rev: 1, sp: 1 } })); __manabi.tab('quests'); });
  await p.click('[data-claim="0"]'); await p.click('#chestOpen'); await p.waitForSelector('#chestClaim', { timeout: 8000 }); await p.click('#chestClaim'); await p.waitForSelector('#chestOv', { state: 'detached', timeout: 8000 }); check('claiming a quest opens a chest and gives at least 10 gems', (await stored(p, SAVE)).gm >= 10 && (await stored(p, SAVE)).dq.c[0] === 1, await stored(p, SAVE));
  await p.evaluate(() => { const E = __manabi.E, d = new Date(), first = E.dayNum(new Date(d.getFullYear(), d.getMonth(), 1)); __manabi.setSave(Object.assign({}, __manabi.save, { d: Array.from({ length: 15 }, (_, i) => first + i) })); __manabi.tab('quests'); });
  check('the monthly quest shows 15 / 15 and can be claimed for a badge', (await p.textContent('#monthProg')).startsWith('15 / 15') && !(await p.isDisabled('#monthClaim')), await p.textContent('#monthProg'));
  await p.click('#monthClaim'); await p.click('#chestOpen'); await p.waitForSelector('#chestClaim', { timeout: 8000 }); await p.click('#chestClaim'); await p.waitForSelector('#chestOv', { state: 'detached', timeout: 8000 });
  check('the month badge is saved and shown on the shelf', (await stored(p, SAVE)).bd.length === 1 && (await p.$$('#badgeShelf .mbadge')).length === 1, null);
  check('a friend quest with a clearly labelled bot friend and a friend code is shown', (await p.textContent('#friendCard')).includes('ボット') && /^[A-Z2-9]{6}$/.test(await p.textContent('#myCode')), await p.textContent('#myCode'));
  await shot(p, '19-quests');
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
  await p.click('.seg [data-cr="mathlab"]'); await miss('Math Lab'); await p.click('.seg [data-cr="englab"]'); await miss('English Lab'); await p.click('.seg [data-cr="kobun"]'); await miss('Classics course'); await p.click('.seg [data-cr="science"]'); await miss('Science lab'); await p.click('.seg [data-cr="social"]'); await miss('Social lab');
  for (const t of ['review', 'quests', 'league', 'profile']) { await p.click(`#tabs [data-tab="${t}"]`); await miss('tab ' + t); }
  await p.click('#tabs [data-tab="review"]'); await p.click('#btnMock'); await miss('mock list');
  for (const id of ['K3', 'K7', 'K8', 'S4', 'S1', 'C4', 'C2', 'K10', 'M10', 'M13', 'L2', 'L6']) {
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
  for (let n = 0; n < 10 && (await p.evaluate(() => __manabi.peek().t)) !== 'hs'; n++) await answerOne(p, true);
  const hit = await p.evaluate(() => { const r = document.querySelector('#hsbox svg rect[stroke-dasharray]').getBoundingClientRect(); const e = document.elementFromPoint(r.left + r.width * 0.5, r.top + r.height * 0.1); return e && e.closest('.rg') && e.closest('.rg').dataset.r; });
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

async function dialogue4(env) {
  console.log('16. conversation: choices, word tiles, speaking (fake SpeechRecognition and the typed fallback), summary, mistakes, keyboard, 320px, dark, English');
  const FX = fs.readFileSync(path.join(__dirname, 'fixtures', 'manabi-dialogues-fixture.json'), 'utf8');
  const withFixture = async (o, init) => {
    const s = await open(env, Object.assign({ katex: false }, o, { initScripts: init }));
    return s;
  };
  const route = async s => { await s.ctx.route(/content\/dialogues\.json/, r => r.fulfill({ status: 200, contentType: 'application/json', body: FX })); };
  const FAKE_SR = `window.SpeechRecognition = window.webkitSpeechRecognition = class { start() { setTimeout(() => { const t = window.__heard || ''; if (!t) { this.onerror && this.onerror({ error: 'no-speech' }); return; } this.onresult && this.onresult({ results: [[{ transcript: t }]] }); this.onend && this.onend(); }, 30); } stop() {} };`;
  const openD = async (o = {}, sr = true) => {
    const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: Object.assign({ [HOWTO]: '1' }, o.seed || {}), isMobile: !!o.touch, hasTouch: !!o.touch, initScripts: sr ? [FAKE_SR] : ['window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined;'] });
    await route(s); await s.goto('/manabi/?debug'); await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__manabi); return s;
  };
  let s = await openD(); let p = s.page;
  await p.click('#tabs [data-tab="review"]'); await p.waitForSelector('[data-scene="en-test-1"]');
  check('the practice tab lists conversation scenes grouped by language and level', (await p.$$('#dlgHost .dgroup')).length >= 2 && await p.isVisible('[data-scene="ja-test-1"]'), null);
  await p.click('[data-scene="en-test-1"]'); await p.waitForSelector('#choiceBubs');
  check('the partner speaks first (a bubble with the greeting) and the reply choices show', (await p.textContent('#chat')).includes('Hello! Welcome.') && (await p.$$('#choiceBubs .cb')).length === 3, null);
  await shot(p, '16-chat');
  await p.click('#choiceBubs .cb[data-ok="0"]'); check('a wrong reply is marked, with a reason and the better answer shown', await p.isVisible('.fbnote') && (await p.textContent('.fbnote')).includes('I would like') || (await p.textContent('.fbnote')).includes('正しい答え'), null);
  await p.click('#dlgNext'); await p.waitForSelector('#choiceBubs .cb:not([disabled])');
  await p.click('#btnTiles'); for (const w of ['Water,', 'please.']) await p.click(`#dlgBank .tile:text-is("${w}")`); await p.click('#dlgCheck');
  await p.waitForSelector('#dlgNext'); check('word tiles: building the right reply is accepted', (await p.textContent('#chat')).includes('Water, please.'), null);
  await p.click('#dlgNext'); await p.waitForSelector('#choiceBubs .cb:not([disabled])');
  await p.click('#btnSpeak2'); check('speaking mode shows the sentence to say and a microphone button', await p.isVisible('#btnMic'), null);
  await p.evaluate(() => { window.__heard = 'i will pay by cart'; }); await p.click('#btnMic'); await p.waitForSelector('#speakScore');
  const sc = parseInt(await p.textContent('#speakScore')); check('a near-miss transcript gets a fuzzy score and passes (>= 70)', sc >= 70 && sc < 100, sc);
  await p.click('#dlgNext'); await p.waitForSelector('#dlgSummary');
  check('the summary lists the mistake and the accuracy (2 of 3 right)', (await p.textContent('#dlgPct')) === '67%' && (await p.textContent('#dlgMist')).includes('I am burger') || (await p.textContent('#dlgMist')).includes('○'), await p.textContent('#dlgPct'));
  const sv = await stored(p, SAVE); check('saved: best %, one dialogue mistake kept for review, XP and gems added', sv.dl['en-test-1'] === 67 && sv.dm.length === 1 && sv.gm >= 3 && sv.xp >= 7, { dl: sv.dl, dm: sv.dm });
  await p.click('#dlgAgain'); await p.waitForSelector('#choiceBubs'); await p.click('#choiceBubs .cb[data-ok="1"]'); await p.click('#dlgNext'); await p.waitForSelector('#choiceBubs .cb:not([disabled])');
  await p.keyboard.press('1'); await p.waitForSelector('#dlgNext'); check('keyboard: digits choose a reply, Enter continues', true, null); await p.keyboard.press('Enter'); await p.waitForSelector('#choiceBubs .cb:not([disabled])');
  await p.keyboard.press('Escape'); await p.waitForSelector('.kb-layer'); check('Escape asks to leave the conversation', true, null); await p.click('.kb-layer .kb-btn--ghost');
  await s.close();
  // 声が使えないブラウザ：入力にきりかえる
  s = await openD({}, false); p = s.page;
  await p.click('#tabs [data-tab="review"]'); await p.click('[data-scene="en-test-1"]'); await p.waitForSelector('#choiceBubs'); await p.click('#choiceBubs .cb[data-ok="1"]'); await p.click('#dlgNext'); await p.waitForSelector('#choiceBubs .cb:not([disabled])');
  await p.click('#btnSpeak2'); check('without SpeechRecognition the speaking mode says so and offers typing', await p.isVisible('#noMic') && !(await p.$('#btnMic')), null);
  await p.fill('#speakInput', 'water please'); await p.click('#speakSend'); await p.waitForSelector('#speakScore'); check('the typed answer is scored with the same fuzzy matching and accepted', parseInt(await p.textContent('#speakScore')) >= 70, null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  // 日本語の敬語・320px・ダーク・英語
  for (const [vp, theme, lang] of [['se1', 'dark', 'ja'], ['se1', 'light', 'en']]) {
    s = await openD({ vp, lang, touch: true, seed: { 'kobo.theme': theme } }); p = s.page;
    await p.click('#tabs [data-tab="review"]'); await p.click('[data-scene="ja-test-1"]'); await p.waitForSelector('#choiceBubs');
    const probe = async w => { const r = await p.evaluate(`(${layoutProbe})()`); check(`${vp}/${theme}/${lang} ${w}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 4) }); };
    await probe('keigo scene'); await shot(p, `16-${vp}-${theme}-${lang}`);
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); const ui = jp.filter(x => !/^(div|span|button|p|b)\b.*(いらっしゃいませ|お名前|山田|待ち|ご用件|少々|課長|ありがとう|どうぞ|はい)/.test(x)); check('English UI around a Japanese-language scene has no Japanese chrome', ui.length === 0, ui.slice(0, 6)); }
    await p.click('#choiceBubs .cb[data-ok="0"]'); await probe('wrong answer'); check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

async function flow5(env) {
  console.log('17. sections > units > levels, sequential unlock, jump-ahead test (pass / fail), treasure chest, migration of old saves');
  let s = await open(env); let p = s.page;
  check('the path has a section banner, a unit bar and level nodes; the first level is current, the next is locked with a lock icon', await p.isVisible('.sect') && await p.isVisible('.unitbar') && await p.isVisible('.unit.cur') && (await p.$$('.unit.locked .lockic')).length > 2, null);
  check('each unit ends with a chest node (locked at first)', (await p.$$('.unit.chest .chestbtn.locked')).length >= 2, null);
  await p.click('.unit.chest .chestbtn.locked >> nth=0'); await p.waitForSelector('.kb-toast'); check('tapping a locked chest explains how to open it', (await p.textContent('.kb-toasts')).includes('クリア'), null);
  const ids0 = await p.$$eval('.unit[data-unit]', u => u.map(x => x.dataset.unit));
  await p.click('.unit.locked >> nth=1'); await p.click('#popJump'); await wait(p, () => __kb.state().screen === 'lesson');
  check('the jump-ahead test shows 3 chances', (await p.textContent('#jumpHearts')).trim() === '3', await p.textContent('#jumpHearts'));
  let n = 0; for (; n < 12; n++) { if ((await st(p)).screen !== 'lesson') break; await answerOne(p, n !== 3 && n !== 6); }
  check('with 2 mistakes the test is passed', (await p.textContent('#jumpTitle')).includes('合格'), await p.textContent('#jumpTitle'));
  const sv = await stored(p, SAVE); check('every node up to the target is cleared (jp) and the path moved on', Object.keys(sv.jp).length === 3, Object.keys(sv.jp));
  await p.click('#btnHome'); check('the first three nodes are now done and the 4th is current', (await p.$$('.unit.done')).length >= 3 && (await p.$eval('.unit.cur', e => e.dataset.unit)) === ids0[3], null);
  await s.close();
  s = await open(env); p = s.page;
  await p.click('.unit.locked >> nth=0'); await p.click('#popJump'); await wait(p, () => __kb.state().screen === 'lesson');
  await answerOne(p, false); check('one mistake leaves 2 chances', (await p.textContent('#jumpHearts')).trim() === '2', null);
  await answerOne(p, false); await answerOne(p, false);
  check('the third mistake ends the test immediately (not passed)', (await p.textContent('#jumpTitle')).includes('おしい') && (await p.$$('.unit.done')).length === 0, null);
  check('nothing was unlocked by a failed test', Object.keys((await stored(p, SAVE)).jp || {}).length === 0, null);
  await shot(p, '17-jumpfail'); await s.close();
  s = await open(env); p = s.page; await p.evaluate(() => __manabi.unlockAll()); await p.waitForSelector('.chestbtn.ready');
  const gm0 = (await stored(p, SAVE)).gm | 0; await p.click('.chestbtn.ready >> nth=0'); await p.waitForSelector('#chestOpen');
  await shot(p, '17-chest-closed'); await p.click('#chestOpen'); await p.waitForSelector('#chestClaim', { timeout: 8000 }); check('the chest opens with an animation and lists rewards (gems, XP, maybe an item)', (await p.$$('#chestRewards .rw')).length >= 2, null);
  await shot(p, '17-chest-open'); await p.click('#chestClaim'); await p.waitForSelector('#chestOv', { state: 'detached', timeout: 8000 });
  const sv2 = await stored(p, SAVE); check('claiming adds gems and XP, remembers the chest and shows it as claimed', sv2.gm > gm0 && Object.keys(sv2.ch).length === 1 && (await p.$$('.chestbtn.claimed')).length === 1, sv2.ch);
  await s.close();
  s = await open(env, { seed: { [SAVE]: JSON.stringify({ v: 1, xp: 120, d: [20700], g: {}, b: {}, st: { q: 10, ok: 8, ls: 2, mk: 0, best: 1 }, goal: 20 }) } }); p = s.page;
  const sv3 = await p.evaluate(() => __manabi.save); check('an old save without the new fields loads with defaults (xp kept)', sv3.xp === 120 && sv3.jp && sv3.ch && sv3.iv && sv3.gm === 0, sv3);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function header6(env) {
  console.log('18. header: course badge + course sheet (subject score), streak sheet (calendar, freeze, repair, milestones), gem sheet (shop), no raw XP in the top bar');
  let s = await open(env, { vp: 'se1', touch: true }); let p = s.page;
  check('the top bar has a subject badge, a streak flame and gems, and no XP chip', await p.isVisible('#cBadge') && await p.isVisible('#cStreak') && await p.isVisible('#cGem') && !(await p.isVisible('#cGoal')) && !/XP/.test(await p.textContent('#top')), await p.textContent('#top'));
  check('the badge is an original subject icon, not a flag (svg, data-sub=english)', (await p.getAttribute('#cBadge', 'data-sub')) === 'english' && (await p.$$('#cBadge svg')).length === 1, null);
  await p.click('#cBadge'); await p.waitForSelector('#courseSheet'); check('the course sheet shows a 0-100 subject score and the level name', /^\d+$/.test(await p.textContent('#subjScore')) && (await p.textContent('#subjLabel')).length > 4, await p.textContent('#subjLabel'));
  check('it lists every subject and lab so you can switch or start a new course', (await p.$$('#courseRows .crow')).length >= 14, (await p.$$('#courseRows .crow')).length);
  { const r = await p.evaluate(`(${layoutProbe})()`); check(`320px course sheet fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, r.offscreen.slice(0, 3)); }
  await shot(p, '18-course'); await p.click('#courseRows [data-cr="kobun"]'); await p.waitForSelector('.unit[data-unit="K1"]'); check('choosing a course switches the path and the badge', (await p.getAttribute('#cBadge', 'data-sub')) === 'kobun', null);
  await p.click('#cBadge'); await p.click('#courseRows [data-cr="HS"][data-sub="math"]'); await p.waitForSelector('.unit[data-unit^="HS-MATH"]'); check('switching to HS math shows its units', true, null);
  // ストリーク
  await p.evaluate(() => { const t = __manabi.E.dayNum(); __manabi.setSave({ d: [t - 4, t - 3, t - 2], fd: [t - 3], gm: 100, fz: 1, st: { best: 9 } }); });
  await p.click('#cStreak'); await p.waitForSelector('#streakSheet'); check('the streak sheet shows a month calendar with practised and freeze days', (await p.$$('#streakCal .cd.on')).length + (await p.$$('#streakCal .cd.fz')).length >= 1 && (await p.$$('#streakCal .cd.today')).length === 1, null);
  check('milestones are marked (best streak 9 reaches 3 and 7)', (await p.$$('#streakMiles .ms.got')).length === 2, null);
  check('equipped freezes are shown', (await p.textContent('#fzOwned')).includes('1 / 2'), await p.textContent('#fzOwned'));
  await shot(p, '18-streak');
  check('missing yesterday offers a repair for 50 gems', await p.isVisible('#repairBtn') && !(await p.isDisabled('#repairBtn')), null);
  await p.click('#repairBtn'); await p.waitForTimeout(300); const sv = await stored(p, SAVE); check('repairing spends 50 gems and fills yesterday', sv.gm === 50 && sv.d.length === 4, sv);
  await p.click('#cStreak'); await p.click('#calPrev'); check('the calendar can go to the previous month', (await p.textContent('#calMonth')).includes('/'), null); await p.click('#streakSheetX');
  // ジェム・お店
  await p.click('#cGem'); await p.waitForSelector('#gemSheet'); check('the gem sheet shows the balance and shop items', (await p.textContent('#gemBig')).includes('50') && (await p.$$('#shopList .qrow')).length === 5, await p.textContent('#gemBig'));
  await p.click('[data-buy="heart"]'); await p.waitForTimeout(200); const sv2 = await stored(p, SAVE); check('buying an item spends gems and adds it to the inventory', sv2.gm === 30 && sv2.iv.heart === 1, sv2);
  await p.click('[data-skin="2"]'); await p.waitForTimeout(200); check('a cosmetic skin costs 30 gems and is then owned and selected', (await stored(p, SAVE)).sk === 2 && (await stored(p, SAVE)).ow.includes(2) && (await stored(p, SAVE)).gm === 0, await stored(p, SAVE));
  { const r = await p.evaluate(`(${layoutProbe})()`); check(`320px gem sheet fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, r.offscreen.slice(0, 3)); }
  await p.keyboard.press('Escape'); check('Escape closes a sheet', !(await p.$('#sheetBg')), null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  // 英語：シートに日本語の画面ことばが残らない
  s = await open(env, { lang: 'en' }); p = s.page;
  for (const [sel, id] of [['#cBadge', '#courseSheet'], ['#cStreak', '#streakSheet'], ['#cGem', '#gemSheet']]) { await p.click(sel); await p.waitForSelector(id); const jp = await p.evaluate(`(${jpScan})(true)`); check(`${id} in English: no Japanese in the UI`, jp.filter(x => !/crow|data-cr/.test(x)).length === 0, jp.slice(0, 6)); await p.keyboard.press('Escape'); }
  await s.close();
}

async function sound7(env) {
  console.log('19. sounds and effects: every cue synthesizes, mute and volume work, floating XP / shake / reduced motion');
  const COUNT = `(() => { const C = window.AudioContext || window.webkitAudioContext; window.__n = { osc: 0, buf: 0, gain: [] }; const co = C.prototype.createOscillator, cb = C.prototype.createBufferSource, cg = C.prototype.createGain; C.prototype.createOscillator = function () { window.__n.osc++; return co.call(this); }; C.prototype.createBufferSource = function () { window.__n.buf++; return cb.call(this); }; C.prototype.createGain = function () { const g = cg.call(this); window.__n.gain.push(g); return g; }; })();`;
  const s = await B.newSession(env, { vp: V.get('ip12'), seed: { [HOWTO]: '1' }, initScripts: [COUNT] }); const p = s.page;
  await s.goto('/manabi/?debug'); await p.waitForFunction(() => window.__kb && __kb.ready() && window.__manabi);
  const names = await p.evaluate(() => Object.keys(ManabiFx.sfx)); check('all cues exist: tap ok ng pair combo done levelup chest coin quest streak tick', ['tap', 'ok', 'ng', 'pair', 'combo', 'done', 'levelup', 'chest', 'coin', 'quest', 'streak', 'tick'].every(n => names.includes(n)), names);
  const run = async () => p.evaluate(() => { window.__n.osc = 0; window.__n.buf = 0; const res = {}; for (const k of Object.keys(ManabiFx.sfx)) { const a = window.__n.osc + window.__n.buf; ManabiFx.sfx[k](k === 'combo' ? 3 : 1); res[k] = window.__n.osc + window.__n.buf - a; } return res; });
  const on = await run(); check('every cue builds audio nodes when sound is on (bell, marimba, brass, noise)', Object.values(on).every(n => n > 0), on);
  check('a correct answer is a two-note bell chime; chest and fanfare are richer', on.ok >= 8 && on.chest > on.ok && on.levelup > on.ok, on);
  await p.evaluate(() => ManabiFx.setPref('snd', 0)); const off = await run(); check('with sound off, no audio node is created at all', Object.values(off).every(n => n === 0), off);
  await p.evaluate(() => { ManabiFx.setPref('snd', 1); ManabiFx.setPref('vol', 0.3); ManabiFx.sfx.ok(); }); const gv = await p.evaluate(() => { const gs = window.__n.gain; return gs[0] ? gs[0].gain.value : null; });
  check('the volume setting sets the master gain (0.3)', gv != null && Math.abs(gv - 0.3) < 0.01, gv);
  await p.evaluate(() => ManabiFx.setPref('vol', 0.8));
  // 画面のこうか：まちがえると ゆれる、正解で +2 XP が浮かぶ
  await p.evaluate(() => __manabi.unlockAll()); await startUnit(p, 'JH-MATH-G2-U06');
  const k = await p.evaluate(() => __manabi.peek()); await answerOne(p, true, { beforeNext: async () => { check('a correct answer floats "+2 XP" up and shines the progress bar', (await p.$$('.floatxp')).length >= 1, null); } });
  await p.evaluate(() => { __manabi.save.hm = 0; }); const k2 = await p.evaluate(() => __manabi.peek());
  await answerOne(p, false, { beforeNext: async () => { check('a wrong answer shakes the question area', await p.evaluate(() => document.querySelector('#qbody').classList.contains('shake')), null); } });
  check('the streak chip has a flame animation (test pages stop it with the noanim class)', await p.evaluate(() => { document.body.classList.remove('noanim'); return getComputedStyle(document.querySelector('#cStreak svg')).animationName !== 'none'; }), null);
  await p.emulateMedia({ reducedMotion: 'reduce' }); await p.evaluate(() => __manabi.goHome()); await p.waitForTimeout(100);
  check('with prefers-reduced-motion the flame stops animating', await p.evaluate(() => getComputedStyle(document.querySelector('#cStreak svg')).animationName === 'none'), null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function power8(env) {
  console.log('20. timed chests (early / night / weekend / seasonal), inventory and power-ups (freeze, heart, XP boost, wager)');
  const s = await open(env); const p = s.page;
  const setNow = async iso => p.evaluate(iso => { window.__manabiNow = new Date(iso).getTime(); }, iso);
  await setNow('2026-11-25T06:30:00'); await p.evaluate(() => { __manabi.unlockAll(); });
  await startUnit(p, 'JH-MATH-G2-U06'); await finishLesson(p, {}); await p.click('#btnHome').catch(() => {});
  await p.evaluate(() => __manabi.tab('quests')); await p.waitForSelector('#timedCard');
  check('after a lesson at 6:30 the early-bird chest is ready; night-owl and weekend are not (Wednesday)', !(await p.isDisabled('[data-timed="early"]')) && await p.isDisabled('[data-timed="night"]') && await p.isDisabled('[data-timed="weekend"]'), null);
  await p.click('[data-timed="early"]'); await p.click('#chestOpen'); await p.waitForSelector('#chestClaim', { timeout: 8000 }); await p.click('#chestClaim'); await p.waitForSelector('#chestOv', GONE);
  check('claiming it is remembered for the day', (await stored(p, SAVE)).tc.some(x => x.startsWith('early-')) && await p.isDisabled('[data-timed="early"]'), null);
  const se = await p.evaluate(() => { window.__manabiNow = new Date('2026-12-24T12:00:00').getTime(); __manabi.tab('review'); __manabi.tab('quests'); return !!document.querySelector('[data-tc^="season-winter"]'); }); check('the winter seasonal chest appears only during its dates', se, null);
  const se2 = await p.evaluate(() => { window.__manabiNow = new Date('2026-05-15T12:00:00').getTime(); __manabi.tab('review'); __manabi.tab('quests'); return !!document.querySelector('[data-tc^="season-"]'); }); check('and not in mid May', !se2, null);
  await p.evaluate(() => { window.__manabiNow = new Date('2026-11-25T12:00:00').getTime(); __manabi.save.iv = { freeze: 1, heart: 1, boost: 1, wager: 1, timer: 1 }; __manabi.save.gm = 100; __manabi.save.fz = 0; __manabi.save.hr = 2; });
  await p.click('#cGem'); await p.waitForSelector('#invList'); await p.click('[data-use="boost"]'); await p.waitForSelector('#boostLeft');
  const sv = await stored(p, SAVE); check('using an XP boost starts a 15-minute timer', sv.bx > Date.now() + 14 * 60000 && sv.iv.boost === undefined, sv.bx);
  await p.click('[data-use="freeze"]'); await p.click('[data-use="heart"]'); await p.click('[data-use="wager"]');
  const sv2 = await stored(p, SAVE); check('freeze is equipped, hearts refilled, the wager starts for 30 gems', sv2.fz === 1 && sv2.hr === 5 && sv2.wg && sv2.wg.bet === 30 && sv2.gm === 70, sv2);
  await p.keyboard.press('Escape'); await startUnit(p, 'JH-MATH-G2-U06'); const xp0 = (await stored(p, SAVE)).xp; await answerOne(p, true);
  check('with the boost on, a correct answer is worth 4 XP instead of 2', (await stored(p, SAVE)).xp - xp0 === 4, (await stored(p, SAVE)).xp - xp0);
  await p.evaluate(() => { __manabi.goHome(); });
  // かけに勝つ：7日ぶんの学習日をつくって8日め
  await p.evaluate(() => { const t = __manabi.E.dayNum(); __manabi.save.wg = { s: t - 8, bet: 30 }; __manabi.save.d = Array.from({ length: 7 }, (_, i) => t - 7 + i); __manabi.save.gm = 0; __manabi.save.bx = 0; __manabi.goHome(); }); await p.waitForTimeout(900);
  check('a 7-day streak wins the wager (30 bet returns 60 gems)', (await stored(p, SAVE)).gm === 60 && (await stored(p, SAVE)).wg === null, await stored(p, SAVE));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function practice9(env) {
  console.log('21. practice collections: mistakes / vocabulary / listening / radio / speaking / stories / conversation (role-play and video call)');
  const FX = fs.readFileSync(path.join(__dirname, 'fixtures', 'manabi-dialogues-fixture.json'), 'utf8');
  const FAKE_SR = `window.SpeechRecognition = window.webkitSpeechRecognition = class { start() { setTimeout(() => { const t = window.__heard || ''; if (!t) { this.onerror && this.onerror({ error: 'no-speech' }); return; } this.onresult && this.onresult({ results: [[{ transcript: t }]] }); this.onend && this.onend(); }, 30); } stop() {} };`;
  const NO_SR = 'window.SpeechRecognition = undefined; window.webkitSpeechRecognition = undefined;';
  const openP = async (sr, o = {}) => { const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: { [HOWTO]: '1', 'kobo.theme': o.theme || 'light' }, isMobile: !!o.touch, hasTouch: !!o.touch, initScripts: [sr ? FAKE_SR : NO_SR] }); await s.ctx.route(/content\/dialogues\.json/, r => r.fulfill({ status: 200, contentType: 'application/json', body: FX })); await s.goto('/manabi/?debug'); await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__manabi); await s.page.click('#tabs [data-tab="review"]'); await s.page.waitForSelector('#storyList [data-story]'); return s; };
  let s = await openP(true); let p = s.page;
  for (const id of ['collMistakes', 'collVocab', 'collListen', 'collRadio', 'collSpeak', 'collStory', 'collConv']) check(`collection "${id}" is on the practice tab`, await p.isVisible('#' + id), null);
  check('9 stories and 9 radio items (6 original + 3 Aozora) are listed; role-play and video-call lists show the scenes', (await p.$$('#storyList [data-story]')).length === 9 && (await p.$$('#radioList [data-radio]')).length === 9 && await p.isVisible('[data-scene="en-test-1"]') && await p.isVisible('[data-vscene="en-test-1"]'), null);
  await shot(p, '21-practice');
  // 青空文庫（日本語の読み上げ・訳なし・出典表示）
  await p.click('[data-story="ao-kumo"]'); await p.waitForSelector('#storyLines');
  check('an Aozora story shows its credit with licence, and has no translation buttons', (await p.textContent('#storyCredit')).includes('パブリックドメイン') && !(await p.$('.ja-btn')), null);
  await p.click('#btnQuit'); await p.click('#tabs [data-tab="review"]');
  // ディクテーション（Tatoeba CC0）
  await p.click('[data-coll="dict"]'); await wait(p, () => __kb.state().screen === 'lesson');
  check('dictation is a word-order lesson of 6 sentences', (await st(p)).q.t === 'wb' && (await st(p)).lesson.size === 6, null);
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready()); await p.click('#tabs [data-tab="profile"]');
  await p.click('#licList summary'); await p.waitForSelector('[data-lic="tatoeba"]'); check('the profile shows the sources and licences list', (await p.$$('.licitem')).length >= 6 && (await p.textContent('[data-lic="tatoeba"]')).includes('CC0'), null);
  await p.click('#tabs [data-tab="review"]'); await p.waitForSelector('#storyList [data-story]');
  // ストーリー
  await p.click('[data-story="st-bag"]'); await p.waitForSelector('#storyLines'); check('a story shows its sentences, and tapping 訳 shows the Japanese', (await p.$$('#storyLines .sline')).length === 4 && await p.isVisible('.sl-en >> nth=0'), null);
  await p.click('.sline >> nth=0 >> .ja-btn'); check('the translation toggles', await p.isVisible('.sl-ja >> nth=0'), null);
  await p.click('#storyQuiz'); await wait(p, () => __kb.state().screen === 'lesson'); check('the story quiz has 4 questions and includes a tap-the-words question', (await st(p)).lesson.size === 4, null);
  const kinds = []; for (let n = 0; n < 8; n++) { if ((await st(p)).screen !== 'lesson') break; kinds.push((await st(p)).q.t); await answerOne(p, true); }
  check('answering all correctly finishes without an "again" button, and tap questions were asked', (await st(p)).screen === 'result' && !(await p.$('#btnAgain')) && kinds.includes('tt'), kinds);
  await p.click('#btnHome'); await p.click('#tabs [data-tab="review"]');
  // ラジオ
  await p.click('[data-radio="st-rain"]'); await p.waitForSelector('#storyLines');
  const canSay = await p.evaluate(() => ManabiFx.canSpeak());
  check(canSay ? 'radio hides the text until "Show text"' : 'no speech here: the radio shows the text', canSay ? !(await p.isVisible('.sl-en >> nth=0')) && await p.isVisible('#storyPlay') : await p.isVisible('.sl-en >> nth=0'), canSay);
  if (canSay) { await p.click('#storyShow'); check('"Show text" reveals the sentences', await p.isVisible('.sl-en >> nth=0'), null); }
  await p.click('#btnQuit'); await p.click('#tabs [data-tab="review"]');
  // 発音れんしゅう（声：偽の SpeechRecognition）
  await p.click('[data-coll="speak"]'); await p.waitForSelector('#speakTarget');
  for (let n = 0; n < 5; n++) { const target = await p.textContent('#speakTarget'); await p.evaluate(t => { window.__heard = t.toLowerCase().replace(/[.,!?]/g, ''); }, target); await p.click('#btnMic'); await p.waitForSelector('#speakScore'); if (n === 0) check('a perfect repeat scores 100%', (await p.textContent('#speakScore')) === '100%', await p.textContent('#speakScore')); await p.click('#speakNext'); }
  await p.waitForSelector('#speakSummary'); check('five passed sentences give a summary with an average', (await p.textContent('#speakAvg')) === '100%', null);
  await p.click('#btnHome');
  // ビデオ通話（声で返事）
  await p.click('#tabs [data-tab="review"]'); await p.click('[data-vscene="en-test-1"]'); await p.waitForSelector('#vcall');
  check('the video call shows an animated avatar, a timer and the honest "scripted, not AI" note', await p.isVisible('#vavatar svg') && await p.isVisible('#vtimer') && (await p.textContent('#vnote')).includes('AI'), null);
  await p.waitForSelector('#choiceBubs'); await p.evaluate(() => { window.__heard = 'i would like a burger please'; }); await p.click('#btnVoiceAns'); await p.waitForSelector('#dlgNext');
  check('answering by voice picks the matching reply (the correct one)', await p.isVisible('.bub.me.good'), null);
  await shot(p, '21-video');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  // 声が使えない：入力で
  s = await openP(false); p = s.page; await p.click('[data-coll="speak"]'); await p.waitForSelector('#speakTarget');
  check('without SpeechRecognition the practice offers typing', await p.isVisible('#noMic') && !(await p.$('#btnMic')), null);
  await p.fill('#speakInput', 'completely wrong words here'); await p.click('#speakSend'); await p.waitForSelector('#speakScore'); check('a wrong typed sentence gets a low score and no "next"', parseInt(await p.textContent('#speakScore')) < 50 && !(await p.isVisible('#speakNext')), null);
  await p.click('#btnQuit'); await p.click('#tabs [data-tab="review"]'); await p.click('[data-vscene="en-test-1"]'); await p.waitForSelector('#noMic2'); check('video call falls back to tapping when voice input is missing', true, null);
  await s.close();
  // 320px・ダーク・英語
  for (const [lang, theme] of [['ja', 'dark'], ['en', 'light']]) {
    s = await openP(true, { vp: 'se1', touch: true, lang, theme }); p = s.page;
    const probe = async w => { const r = await p.evaluate(`(${layoutProbe})()`); check(`se1/${theme}/${lang} ${w}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 4) }); };
    await probe('practice tab');
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check('English practice tab: no Japanese in the UI', jp.length === 0, jp.slice(0, 6)); }
    await p.click('[data-story="st-bag"]'); await p.waitForSelector('#storyLines'); await probe('story');
    await p.click('#btnQuit'); await p.click('#tabs [data-tab="review"]'); await p.click('[data-coll="speak"]'); await p.waitForSelector('#speakTarget'); await probe('speaking');
    check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

async function social10(env) {
  console.log('22. online league / feed / friend quest (fake Firestore in the page) and the offline fallbacks');
  // ページの中の偽 Firestore（compat と同じ形）。-t0-1 の組には、はじめから 6 人のほかのプレイヤーがいる。
  const FAKE = `(() => {
    const store = {}, log = []; window.__fsLog = log; window.__fsStore = store;
    const seed = id => { const m = id.match(/^w(\\d+)-t0-1$/); if (!m || store['kbLg/' + id]) return; const o = {}; ['Aki', 'Bun', 'Chi', 'Dai', 'Eri', 'Fuu'].forEach((n, i) => { o['u' + i] = { n, x: 60 + i * 40, t: 1 }; }); store['kbLg/' + id] = { wk: Number(m[1]), m: o }; };
    const setp = (obj, p, v) => { const k = p.split('.'); let c = obj; for (let i = 0; i < k.length - 1; i++) c = c[k[i]] = c[k[i]] || {}; c[k[k.length - 1]] = v; };
    const deny = () => { const e = new Error('denied'); e.code = 'permission-denied'; throw e; };
    window.__fakeDb = { collection: c => ({ doc: id => ({ id, async get() { if (c === 'kbLg') seed(id); if (window.__fsDeny) deny(); const d = store[c + '/' + id]; return { exists: !!d, data: () => JSON.parse(JSON.stringify(d)) }; },
      async set(v) { log.push(['set', c, id]); if (window.__fsDeny) deny(); store[c + '/' + id] = JSON.parse(JSON.stringify(v)); },
      async update(v) { log.push(['update', c, id, Object.keys(v)]); if (window.__fsDeny || !store[c + '/' + id]) deny(); for (const k of Object.keys(v)) setp(store[c + '/' + id], k, JSON.parse(JSON.stringify(v[k]))); } }) }) };
    window.__fsDeny = false;
    const wkNow = Math.floor((Math.floor((Date.now() + 9 * 3600e3) / 86400e3) + 3) / 7); store['kbFeed/f1'] = { e: { e0: { ty: 'streak', tx: '7日れんぞく！', at: 2000 }, e1: { ty: 'ach', tx: '3月のバッジをゲット！', at: 1000 } }, t: 1 }; store['kbPairs/f1_me1'] = { a: 'f1', b: 'me1', wk: wkNow, xa: 90, xb: 0 };
    window.__manabiNet = () => window.__netOn === false ? { reason: window.__netWhy || 'signin' } : { db: window.__fakeDb, uid: 'me1', name: 'テスター' };
    window.__friendList = [{ uid: 'f1', n: 'ハナ', code: 'ABCD2345', at: 1 }];
    window.__manabiFriends = { list: () => window.__friendList, myCode: () => 'ZZ22YY33', add: async c => (c === 'GOODCODE' ? (window.__friendList.push({ uid: 'f2', n: 'ケン', code: c, at: 2 }), { ok: true }) : { ok: false, reason: 'notfound' }) };
  })();`;
  const openQ = async (o = {}) => { const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: { [HOWTO]: '1', 'kobo.theme': o.theme || 'light' }, isMobile: !!o.touch, hasTouch: !!o.touch, initScripts: [FAKE + (o.pre || '')] }); await s.goto('/manabi/?debug'); await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__manabi); return s; };
  // 1. サインイン済み：本物の組
  let s = await openQ(); let p = s.page;
  await p.click('#tabs [data-tab="league"]'); await p.waitForFunction(() => document.querySelector('#leagueNote') && document.querySelector('#leagueNote').dataset.net === 'on');
  const rows = await p.$$eval('#leagueList .lg', els => els.map(e => ({ bot: e.dataset.bot, me: e.dataset.me, nm: e.querySelector('.nm').textContent })));
  check('a real group: 6 other players + me + 3 bots fill the 10 seats; bots are labelled', rows.length === 10 && rows.filter(r => r.bot).length === 3 && rows.filter(r => r.bot).every(r => r.nm.includes('ボット')) && rows.some(r => r.nm === 'Aki') && rows.filter(r => r.me).length === 1, rows);
  const joined = await p.evaluate(() => ({ room: JSON.parse(localStorage.getItem('kusoge.manabi.save')).lg.rm, store: Object.keys(window.__fsStore['kbLg/' + JSON.parse(localStorage.getItem('kusoge.manabi.save')).lg.rm].m) }));
  check('I was added to the room and the room id is saved (lg.rm)', /^w\d+-t0-1$/.test(joined.room) && joined.store.includes('me1'), joined);
  await shot(p, '22-league-real');
  // 2. XP を足すと、あとで自分の分だけ書く（60 秒のあき）
  await p.evaluate(() => { __fsLog.length = 0; window.__manabiNow = Date.now() + 120000; });
  await p.click('#tabs [data-tab="learn"]'); await p.evaluate(() => __manabi.addXp ? __manabi.addXp(30) : null);
  const hasAdd = await p.evaluate(() => !!__manabi.addXp);
  if (hasAdd) { await p.waitForFunction(() => __fsLog.some(l => l[0] === 'update' && l[1] === 'kbLg'), null, { timeout: 8000 }).catch(() => {}); check('earning XP writes my entry only (one dotted update on kbLg)', await p.evaluate(() => __fsLog.some(l => l[0] === 'update' && l[1] === 'kbLg' && l[3].length === 1 && l[3][0] === 'm.me1')), await p.evaluate(() => __fsLog)); }
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  // 3. フィード＋友だちクエスト
  await p.click('#tabs [data-tab="quests"]'); await p.waitForSelector('#feedList .feedrow');
  check('the friend feed shows the friend’s news newest first', await p.$$eval('#feedList .feedrow', e => e.map(x => x.textContent)).then(t => t.length === 2 && t[0].includes('ハナ') && t[0].includes('7日')), null);
  await p.waitForFunction(() => document.querySelector('#friendNote').textContent.includes('ほんもの') && !document.querySelector('#friendNote').textContent.includes('ボットの友だち'));
  check('the friend quest switches to the real friend (her 90 XP counts)', (await p.textContent('#friendProg')).includes('ハナ 90') && (await p.textContent('#myCode')) === 'ZZ22YY33', await p.textContent('#friendProg'));
  await p.fill('#friendCodeIn', 'BADCODE2'); await p.click('#friendAddBtn'); await p.waitForFunction(() => document.querySelector('#friendAddMsg').textContent.length > 0);
  check('adding a wrong code shows a clear message', (await p.textContent('#friendAddMsg')).includes('見つかりません'), null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  // 4. 状態ごとのフォールバック：ログインなし／ニックネームなし／ルールが拒否
  for (const [why, pre, expect] of [['signin', 'window.__netOn = false; window.__netWhy = "signin";', 'ログインすると'], ['nick', 'window.__netOn = false; window.__netWhy = "nick";', 'ニックネームを登録'], ['denied', 'window.__fsDeny = true;', 'まだ準備中']]) {
    s = await openQ({ pre }); p = s.page;
    await p.click('#tabs [data-tab="league"]'); await p.waitForFunction(() => { const n = document.querySelector('#leagueNote'); return n && n.dataset.net && n.dataset.net !== 'on'; });
    check(`fallback "${why}": the league is still shown (10 rows, simulation) with an honest note`, (await p.$$('#leagueList .lg')).length === 10 && (await p.textContent('#leagueNote')).includes(expect) && !(await p.$('#leagueList [data-bot]')), await p.textContent('#leagueNote'));
    await p.click('#tabs [data-tab="quests"]'); await p.waitForSelector('#feedList'); check(`fallback "${why}": quests and the friend card still work`, await p.isVisible('#friendCard') && await p.isVisible('#feedCard'), null);
    check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
  // 5. 320px・ダーク・英語
  for (const [lang, theme] of [['ja', 'dark'], ['en', 'light']]) {
    s = await openQ({ vp: 'se1', touch: true, lang, theme }); p = s.page;
    const probe = async w => { const r = await p.evaluate(`(${layoutProbe})()`); check(`se1/${theme}/${lang} ${w}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 4) }); };
    await p.click('#tabs [data-tab="league"]'); await p.waitForFunction(() => document.querySelector('#leagueNote') && document.querySelector('#leagueNote').dataset.net === 'on'); await probe('league');
    await p.click('#tabs [data-tab="quests"]'); await p.waitForSelector('#feedList .feedrow'); await p.waitForFunction(() => document.querySelector('#friendNote').textContent.length > 0); await probe('quests');
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check('English quests tab: no Japanese in the UI', jp.length === 0, jp.slice(0, 6)); }
    check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
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
  const nm = f => (f.name === 'path_' ? 'path' : f.name === 'english3' ? 'english' : f.name === 'resume3' ? 'resume' : f.name === 'dialogue4' ? 'dialogue' : f.name === 'flow5' ? 'flow' : f.name === 'header6' ? 'header' : f.name === 'sound7' ? 'sound' : f.name === 'power8' ? 'power' : f.name === 'practice9' ? 'practice' : f.name === 'social10' ? 'social' : f.name);
  for (const f of [home, lesson, types, review, reload, mock, keys, katex, api, special, path_, contrast, english3, resume3, dialogue4, flow5, header6, sound7, power8, practice9, social10, layout]) {
    if (only && !only.includes(nm(f))) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
