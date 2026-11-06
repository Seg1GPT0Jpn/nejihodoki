#!/usr/bin/env node
// ヒットアンドブローの通しプレイ（Playwright、?debug の window.__hitblow / __kb を使う）
//   node tools/tests/hitblow-play.js            … 全部（約1分）。スクリーンショットは tools/tests/out/shots/hitblow-play/
// 1. 初回：遊び方 → チュートリアル（本物のキーのタップ・決定・メモのタブ）→ 当てる → 結果・ベスト・保存
// 2. 負け：キーボードで10回はずす（同じ数字・同じ推理は受け付けない）→ 負けの結果、ベストは変わらない
// 3. デイリー：別の端末（別の context）でも同じ答え、別の日はちがう答え。当てると記録、もう一度開くと「終わりました」
// 4. CPU対戦：3つの強さで最後まで（「おまかせ」で答えを決める。CPUの推理はヒントに合っている。同じ回数ずつ）
// 5. 保存：途中で再読み込み → 「つづきから」で推理・メモ・時間が戻る
// 6. 英語：タイトル・ゲーム・メモ・CPU・結果で日本語が見えない。全部の画面サイズで、ゲーム中のキーと決定が画面内・44px以上
// 7. オンライン対戦の練習（versus.js）：同じ seed の答えの列、当てると点が入る
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'hitblow-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info)}`); };
const SAVE = 'kusoge.hitblow.save';
const SEEN = { 'kusoge.hitblow.howto': '1' };

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || {}, isMobile: false, hasTouch: false });
  await s.goto('/hitblow/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready());
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') });
// tap the on-screen key for a digit / color index
async function tapKeys(p, code) { for (const ch of code) await p.click(`#pad .sk[data-i="${ch}"]`); }
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);

async function tutorialAndWin(env) {
  console.log('1. first visit: how to play → tutorial → solve it');
  const s = await open(env);
  const p = s.page;
  let x = await st(p);
  check('first visit shows how to play', x.howto && !x.title, x);
  await shot(p, '1-howto');
  await p.click('#howtoGo');
  x = await st(p);
  check('tutorial game: easy, 3 digits, coach step 1', x.kind === 'solo' && x.cfg.len === 3 && x.tut === 0 && await p.isVisible('#coach'), x);
  const ans = await p.evaluate(() => __hitblow.answer());
  // a first guess that is not the answer
  const wrong = ['012', '345', '678'].find(g => g !== ans);
  await tapKeys(p, wrong[0] + wrong[0]); // the same digit twice is refused
  x = await st(p);
  check('a repeated digit is refused (no repeats setting)', x.cur === wrong[0], x.cur);
  await tapKeys(p, wrong.slice(1));
  x = await st(p);
  check('3 digits → coach step 2 (press OK)', x.cur === wrong && x.tut === 1, x);
  await p.click('#goBtn');
  x = await st(p);
  check('the guess is judged (H and B), coach explains H/B', x.rows.length === 1 && x.rows[0][0] === wrong && x.tut === 2, x);
  const j = await p.evaluate(g => __hitblow.judge(__hitblow.answer(), g), wrong);
  check('H and B are right', x.rows[0][1] === j.h && x.rows[0][2] === j.b, { row: x.rows[0], j });
  await shot(p, '1-tutorial');
  await p.click('#coachBtn');
  await p.click('#tabMemo');
  x = await st(p);
  check('the memo tab advances the tutorial', x.tab === 'memo' && x.tut === 4, x);
  await p.click('#memo .ms[data-s="' + wrong[0] + '"]');
  await p.click('#memo .mp[data-s="' + wrong[1] + '"][data-p="0"]'); await p.click('#memo .mp[data-s="' + wrong[1] + '"][data-p="0"]');
  x = await st(p);
  check('memo: symbol ✕ and a "here" cell; the key shows the mark', x.memo.s[+wrong[0]] === 1 && x.memo.p[+wrong[1] * 3] === 2 &&
    await p.getAttribute(`#pad .sk[data-i="${wrong[0]}"]`, 'data-m') === '1', x.memo);
  await shot(p, '1-memo');
  await p.click('#coachBtn');
  x = await st(p);
  check('tutorial finished (save.tut = 1)', x.tut === null && x.save.tut === 1, x);
  await p.click('#tabHist');
  await tapKeys(p, ans);
  await p.click('#goBtn');
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  x = await st(p);
  check('solved → result card with a score', x.over && x.won && x.score > 0 && /正解/.test(await p.textContent('#rTitle')), x);
  check('saved: best, per-setting best, wins', x.save.best === x.score && x.save.bests.n3 && x.save.bests.n3.g === 2 && x.save.stats.wins === 1, x.save);
  const ev = await p.evaluate(() => __kb.events.filter(e => e.type === 'play_end').map(e => e.p));
  check('play_end: normal, clear, score', ev.length === 1 && ev[0].mode === 'normal' && ev[0].reason === 'clear' && ev[0].score === x.score, ev);
  check('the state of the finished game is gone', (await stored(p, 'kusoge.hitblow.state')) === null);
  await shot(p, '1-result');
  await s.close();
}

async function lose(env) {
  console.log('2. lose: 10 wrong guesses from the keyboard');
  const s = await open(env, { seed: Object.assign({}, SEEN, { [SAVE]: JSON.stringify({ v: 1, best: 900, bests: { n4: { s: 900, g: 6, t: 99000 } }, tut: 1 }) }) });
  const p = s.page;
  await p.evaluate(() => __hitblow.start('solo', { sym: 'num', d: 'n', seed: 4242 }));
  const ans = await p.evaluate(() => __hitblow.answer());
  const all = await p.evaluate(() => __hitblow.allCodes(__hitblow.mkCfg('num', 'n', false)).filter(c => c !== __hitblow.answer()).slice(0, 10));
  await p.keyboard.type(all[0]); await p.keyboard.press('Enter');
  await p.keyboard.type(all[0]); await p.keyboard.press('Enter');
  let x = await st(p);
  check('the same guess twice is refused', x.rows.length === 1, x.rows);
  await p.keyboard.press('Backspace'); await p.keyboard.press('Delete');
  x = await st(p);
  check('Backspace / Delete edit the guess', x.cur === '', x.cur);
  for (const g of all.slice(1)) { await p.keyboard.type(g); await p.keyboard.press('Enter'); }
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  x = await st(p);
  check('10 misses → lost', x.over && !x.won && x.rows.length === 10 && /ざんねん/.test(await p.textContent('#rTitle')), x);
  check('the answer is shown', (await p.textContent('#rAns')).replace(/\D/g, '') === ans, ans);
  check('best unchanged, a loss counted', x.save.best === 900 && x.save.bests.n4.s === 900 && x.save.stats.losses === 1, x.save);
  await shot(p, '2-lost');
  // seeded answers repeat
  const a1 = await p.evaluate(() => { __hitblow.start('solo', { seed: 77 }); return __hitblow.answer(); });
  const a2 = await p.evaluate(() => { __hitblow.start('solo', { seed: 77 }); return __hitblow.answer(); });
  check('setSeed gives the same answer', a1 === a2, [a1, a2]);
  await s.close();
}

async function daily(env) {
  console.log('3. daily: the same answer for everyone per JST day');
  const s1 = await open(env, { seed: SEEN }), s2 = await open(env, { seed: SEEN, lang: 'en' });
  const today = await s1.page.evaluate(() => KoboPlatform.jstDateKey());
  const a = await s1.page.evaluate(() => { __hitblow.start('daily'); return __hitblow.answer(); });
  const b = await s2.page.evaluate(() => { __hitblow.start('daily'); return __hitblow.answer(); });
  const other = await s1.page.evaluate(dk => __hitblow.dailySecret(KoboPlatform.addDays(dk, -1)).secret, today);
  check('two devices get the same daily answer', a && a === b, [a, b]);
  check('another day has another answer', other !== a, [other, a]);
  let x = await st(s1.page);
  check('daily is digits × 4, mode daily, dateKey today', x.mode === 'daily' && x.cfg.len === 4 && !x.cfg.dup && x.dk === today, x);
  await s2.close();
  // solve it with sensible guesses
  const p = s1.page;
  await p.evaluate(() => __hitblow.solve());
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  x = await st(p);
  const rec = await p.evaluate(() => KoboPlatform.daily.get(KoboPlatform.jstDateKey(), 'hitblow'));
  check('daily solved and recorded in kobo.daily', x.won && rec && rec.best === x.score && rec.clearedAt > 0, { x: x.won, rec });
  check('daily keeps the normal best and counts a streak', x.save.best === 0 && x.save.daily.streak === 1 && x.save.daily.res.dk === today, x.save);
  check('the share text has one line per guess', (await p.evaluate(() => __hitblow.shareText(__hitblow.save.daily.res))).split('\n').length === x.rows.length + 1);
  await shot(p, '3-daily');
  await s1.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  await p.evaluate(() => __hitblow.start('daily'));
  x = await st(p);
  check('opening today again shows it is done (one try per day)', x.result && /終わりました/.test(await p.textContent('#rTitle')) && x.kind === null, x);
  // the hub link ?daily=YYYYMMDD opens the daily
  await s1.close();
  const s3 = await open(env, { seed: SEEN, query: '&daily=' + today });
  await s3.page.waitForTimeout(100);
  x = await st(s3.page);
  check('?daily=today opens today\'s challenge', x.mode === 'daily' && x.dk === today && await s3.page.evaluate(() => __hitblow.answer()) === a, x);
  await s3.close();
}

async function cpu(env) {
  console.log('4. CPU battle to the end (weak, normal, strong)');
  const s = await open(env, { seed: SEEN });
  const p = s.page;
  await p.evaluate(() => __hitblow.setCpuDelay(0));
  for (const level of [1, 2, 3]) {
    await p.evaluate(l => __hitblow.start('cpu', { sym: l === 2 ? 'col' : 'num', d: 'n', level: l }), level);
    let x = await st(p);
    check(`L${level}: starts by choosing your answer`, x.kind === 'cpu' && x.cpu.phase === 'secret' && await p.isVisible('#setBar'), x.cpu);
    if (level === 1) await shot(p, '4-cpu-secret');
    await p.click('#setRand'); await p.click('#goBtn');
    x = await st(p);
    check(`L${level}: your answer is set, you go first`, x.cpu.phase === 'play' && x.cpu.mine.length === 4 && x.rows.length === 0, x.cpu);
    for (let i = 0; i < 30 && !(x = await st(p)).over; i++) await p.evaluate(() => __kb.step(1));
    await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
    x = await st(p);
    check(`L${level}: the battle ends with a result`, x.over && ['win', 'lose', 'draw'].includes(x.cpu.result), x.cpu);
    check(`L${level}: equal turns (you first, CPU answers each)`, x.cpu.rows.length === x.rows.length, [x.rows.length, x.cpu.rows.length]);
    const cons = await p.evaluate(() => { const G = __hitblow.G, c = G.cpu; return c.rows.every((r, i) => c.rows.slice(0, i).every(q => { const j = __hitblow.judge(r.g, q.g); return j.h === q.h && j.b === q.b; })); });
    // the strong CPU may spend a guess outside the candidates when it splits them better (minimax), so only Normal is checked here
    if (level === 2) check(`L${level}: every CPU guess fits its earlier clues`, cons);
    const fb = await p.evaluate(() => { const G = __hitblow.G; return G.cpu.rows.every(r => { const j = __hitblow.judge(G.cpu.mine, r.g); return j.h === r.h && j.b === r.b; }); });
    check(`L${level}: the CPU's clues are judged on your answer`, fb);
    const ev = await p.evaluate(() => __kb.events.filter(e => e.type === 'play_end').slice(-1)[0].p);
    check(`L${level}: play_end mode versus (never ranked)`, ev.mode === 'versus', ev);
    console.log(`     L${level}: ${x.cpu.result} in ${x.rows.length} turns`);
    if (level === 3) { await shot(p, '4-cpu-result'); await p.evaluate(() => { document.getElementById('ovResult').hidden = true; __hitblow.setTab('cpu'); }); await shot(p, '4-cpu-board'); }
  }
  const sv = await stored(p, SAVE);
  check('CPU plays are saved, the best is not touched', sv.stats.cpuPlays === 3 && sv.best === 0, sv.stats);
  // the strong CPU against a fixed answer: it should usually finish within 7 guesses on 4 digits
  const turns = await p.evaluate(() => {
    const out = [];
    for (const mine of ['0123', '9876', '5038', '2741']) {
      __hitblow.start('cpu', { sym: 'num', d: 'n', level: 3 }); const G = __hitblow.G;
      G.cpu.rnd = Math.random; __hitblow.type(mine); __hitblow.submit();
      for (let i = 0; i < 12 && !G.over; i++) { const c = G.cpu; G.cur = ''; const w = __hitblow.allCodes(G.cfg).find(x => x !== G.secret && !G.rows.some(r => r.g === x)); __hitblow.type(w); __hitblow.submit(); }
      out.push(G.cpu.rows.length + (G.cpu.result === 'lose' ? '' : '!'));
    }
    return out;
  });
  check('strong CPU solves 4 digits in ≤ 8 guesses', turns.every(t => /^\d+$/.test(t) && +t <= 8), turns);
  await s.close();
}

async function reload(env) {
  console.log('5. save / reload in the middle of a game');
  const s = await open(env, { seed: SEEN });
  const p = s.page;
  await p.evaluate(() => { __hitblow.start('solo', { sym: 'col', d: 'h', dup: true, seed: 99 }); __hitblow.addMs(42000); });
  const ans = await p.evaluate(() => __hitblow.answer());
  const g1 = ans.split('').reverse().join('') === ans ? '01234' : ans.split('').reverse().join('');
  await p.evaluate(g => __hitblow.guess(g), g1 === ans ? '01234' : g1);
  await p.evaluate(() => __hitblow.guess('77777'));
  await p.evaluate(() => { __hitblow.type('12'); __hitblow.G.memo.s[3] = 2; __hitblow.api.state(); });
  await p.click('#tabMemo'); await p.click('#memo .ms[data-s="5"]');
  let x = await st(p);
  const before = { rows: x.rows, cur: x.cur, ms: x.ms, memo: x.memo };
  await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  x = await st(p);
  check('after reload: the title offers "continue"', x.title && /つづきから/.test(await p.textContent('#tPlay')), x);
  await shot(p, '5-continue');
  await p.click('#tPlay');
  x = await st(p);
  check('continue: same answer, guesses, input and memo', await p.evaluate(() => __hitblow.answer()) === ans && JSON.stringify(x.rows) === JSON.stringify(before.rows) && x.cur === before.cur &&
    JSON.stringify(x.memo) === JSON.stringify(before.memo), { x, before });
  check('continue: the clock is kept', x.ms >= 42000 && x.ms <= before.ms + 2000, [x.ms, before.ms]);
  check('colors · hard · repeats: 5 slots, 8 color keys', x.cfg.len === 5 && x.cfg.dup && await p.locator('#pad .sk').count() === 8);
  await p.evaluate(() => __kb.win());
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  x = await st(p);
  check('solved after reload: hard × repeats scores more (×3 ×1.5)', x.won && x.save.bests.c5x && x.score === await p.evaluate(() => __hitblow.scoreOf(__hitblow.G.cfg, __hitblow.G.rows.length, __hitblow.G.ms)) && x.save.stats.win5 === 1 && x.save.stats.winDup === 1, x);
  await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  x = await st(p);
  check('records survive a reload', x.save.best > 0 && x.save.bests.c5x.s === x.save.best && /ひとりで/.test(await p.textContent('#tPlay')), x.save);
  // settings are remembered
  await p.click('#optSym .opt[data-v="col"]'); await p.click('#optDiff .opt[data-v="e"]');
  await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  x = await st(p);
  check('title settings are saved', x.save.set.sym === 'col' && x.save.set.d === 'e' && await p.getAttribute('#optDiff .opt[data-v="e"]', 'aria-pressed') === 'true', x.save.set);
  await s.close();
}

async function english(env) {
  console.log('6. English, and every screen size during a game');
  const s = await open(env, { seed: SEEN, lang: 'en' });
  const p = s.page;
  let jp = await p.evaluate(`(${jpScan})(true)`);
  check('en: title has no Japanese', jp.length === 0, jp);
  await shot(p, '6-title-en');
  await p.evaluate(() => { __hitblow.start('solo', { sym: 'col', d: 'n', seed: 5 }); __hitblow.guess('0123'); __hitblow.guess('4567'); __hitblow.type('02'); });
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('en: game screen has no Japanese', jp.length === 0, jp);
  await shot(p, '6-game-en');
  await p.click('#tabMemo');
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('en: memo has no Japanese', jp.length === 0, jp);
  await p.evaluate(() => __kb.lose()); await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('en: result has no Japanese', jp.length === 0, jp);
  await p.evaluate(() => { __hitblow.setCpuDelay(0); __hitblow.start('cpu', { level: 2 }); });
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('en: CPU setup has no Japanese', jp.length === 0, jp);
  await p.click('#setRand'); await p.click('#goBtn'); await p.evaluate(() => __kb.step(2));
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('en: CPU battle has no Japanese', jp.length === 0, jp);
  await shot(p, '6-cpu-en');
  await p.evaluate(() => __hitblow.howto());
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('en: how to play has no Japanese', jp.length === 0, jp);
  await s.close();
  // layout during play on every size: keys and OK inside the screen and ≥ 44px
  for (const vp of Object.keys(V.VIEWPORTS)) {
    for (const lang of ['ja', 'en']) {
      const t = await open(env, { vp, lang, seed: SEEN });
      const q = t.page;
      for (const mode of [{ sym: 'num', d: 'h' }, { sym: 'col', d: 'h', dup: true }, { cpu: true }]) {
        await q.evaluate(m => { __hitblow.setCpuDelay(0); if (m.cpu) { __hitblow.start('cpu', { d: 'h', level: 3 }); __hitblow.type('01234'); __hitblow.submit(); __kb.step(9); } else { __hitblow.start('solo', m); __kb.step(6); } }, mode);
        const r = await q.evaluate(`(${layoutProbe})()`);
        const keys = await q.evaluate(() => [...document.querySelectorAll('#right button')].filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return { id: b.id || b.className, top: r.top, bottom: r.bottom, h: r.height, w: r.width }; }));
        const H = q.viewportSize().height;
        const bad = keys.filter(k => k.bottom > H + 1 || k.top < 0 || k.h < 44 || k.w < 40);
        const main = await q.evaluate(() => document.getElementById('main').getBoundingClientRect().height);
        const tag = `${vp} ${lang} ${mode.cpu ? 'cpu' : mode.sym}`;
        check(`layout ${tag}: keypad + OK on screen, ≥44px; notebook visible (${Math.round(main)}px)`, !bad.length && r.offscreen.length === 0 && r.hscroll <= 1 && main >= 60, { bad, off: r.offscreen.slice(0, 3), main });
        if (lang === 'en' && !mode.cpu) { const j = await q.evaluate(`(${jpScan})(true)`); if (j.length) check(`en ${tag}: no Japanese`, false, j); }
        if (mode.cpu || (vp === 'se1' || vp === 'land')) await shot(q, `6-${vp}-${lang}-${mode.cpu ? 'cpu' : mode.sym}`);
      }
      await t.close();
    }
  }
}

async function online(env) {
  console.log('7. online battle practice (common/versus.js): same answers from the seed, points for a solve');
  const s = await open(env, { seed: SEEN });
  const p = s.page;
  const ok = await p.evaluate(() => !!(window.KoboVersus && KoboVersus.practice));
  if (!ok) { check('KoboVersus.practice exists', false); await s.close(); return; }
  await p.evaluate(() => KoboVersus.practice());
  await p.waitForFunction(() => __kb.state().kind === 'vs', null, { timeout: 8000 });
  await p.waitForFunction(() => KoboVersus.canPlay(), null, { timeout: 8000 });
  let x = await st(p);
  check('practice match: kind vs, puzzle 1', x.kind === 'vs' && x.vs.idx === 1 && x.mode === 'practice', x);
  const seed = await p.evaluate(() => __hitblow.G.seed);
  const first = await p.evaluate(() => __hitblow.answer());
  const expect = await p.evaluate(sd => { const r = KoboPlatform.rng(sd >>> 0); const cfg = __hitblow.mkCfg('num', 'n', false); const pool = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9]; let s = ''; for (let i = 0; i < 4; i++) { const j = Math.floor(r() * pool.length); s += pool[j]; pool.splice(j, 1); } return s; }, seed);
  check('the first answer comes from the shared seed', first === expect, [first, expect]);
  await p.evaluate(() => __kb.step(12));
  await p.waitForFunction(() => __kb.state().vs.idx === 2, null, { timeout: 4000 }).catch(() => {});
  x = await st(p);
  check('solving gives points and the next puzzle', x.vs.score > 0 && x.vs.solved === 1 && x.vs.idx === 2, x.vs);
  await shot(p, '7-online');
  await p.evaluate(() => KoboVersus.close && KoboVersus.close());
  await p.waitForTimeout(300);
  x = await st(p);
  check('closing the match returns to the title', x.kind !== 'vs', x);
  await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  B.ensureCdn();
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  for (const f of [tutorialAndWin, lose, daily, cpu, reload, english, online]) {
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 600)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
