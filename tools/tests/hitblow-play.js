#!/usr/bin/env node
// ヒットアンドブローの通しプレイ（Playwright、?debug の window.__hitblow / __kb を使う）
//   node tools/tests/hitblow-play.js [missions,keysAndTouch,compat,missionsEnglish,…]  … 全部（約3分）。スクリーンショットは tools/tests/out/shots/hitblow-play/
// 1. 初回：遊び方 → チュートリアル（本物のキーのタップ・決定・メモのタブ）→ 当てる → 結果・ベスト・保存
// 2. 負け：キーボードで10回はずす（同じ数字・同じ推理は受け付けない）→ 負けの結果、ベストは変わらない
// 3. デイリー：別の端末（別の context）でも同じ答え、別の日はちがう答え。当てると記録、もう一度開くと「終わりました」
// 4. CPU対戦：3つの強さで最後まで（「おまかせ」で答えを決める。CPUの推理はヒントに合っている。同じ回数ずつ）
// 5. 保存：途中で再読み込み → 「つづきから」で推理・メモ・時間が戻る
// 6. 英語：タイトル・ゲーム・メモ・CPU・結果で日本語が見えない。全部の画面サイズで、ゲーム中のキーと決定が画面内・44px以上
// 7. オンライン対戦の練習（versus.js）：同じ seed の答えの列、当てると点が入る
// 8. ミッション：一覧と鍵・本物のタップで開始・ヒットだけ／ブローだけの表示・はじめからのヒント・ひらめき（★は2まで・H キー）・ボットで全12ミッションをクリア・★と次が開く・practice 報告・ランキングの値が変わらない
// 9. キーボードとタッチ：タイトルからミッション一覧・矢印と Enter・Esc・結果の次のミッション／途中で再読み込みして続き・タッチのタップ
// 10. 古い保存：x がこわれていても開く・今までの保存がそのまま読める・ひとりの連勝（kusoge.hitblow.x の ws / wm）
// 11. ミッションの英語・全部の画面サイズで一覧とミッション中のキーが画面内
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
const SAVE = 'kusoge.hitblow.save', X = 'kusoge.hitblow.x';
const E = require('../../hitblow/engine.js');
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

const hook = p => p.evaluate(() => { window.__evlog = []; if (window.KoboGame) { const e = KoboGame.emit; KoboGame.emit = function (n, d) { window.__evlog.push([n, d && d.mode, d && d.reason]); return e.apply(this, arguments); }; } });
const events = p => p.evaluate(() => window.__evlog || []);

async function missions(env) {
  console.log('8. missions: list, rules, hint, the bot clears all 12');
  const s = await open(env, { seed: Object.assign({ [SAVE]: JSON.stringify({ v: 1, best: 777, bests: { n4: { s: 777, g: 4, t: 60000 } }, tut: 1 }) }, SEEN) });
  const p = s.page;
  await hook(p);
  let x = await st(p);
  check('title shows the mission button (★ 0/36)', await p.isVisible('#tMis') && /0\/36/.test(await p.textContent('#tMis')), await p.textContent('#tMis'));
  await p.click('#tMis');
  x = await st(p);
  check('the list opens; only mission 1 is open', x.missions && await p.locator('#mList .mc').count() === 12 && await p.locator('#mList .mc:not(.lock)').count() === 1, x);
  await shot(p, '8-list');
  await p.click('#mList .mc[data-i="3"]', { force: true });
  x = await st(p);
  check('a locked mission does not start', x.missions && x.kind === null, x);
  await p.click('#mList .mc[data-i="0"]');
  x = await st(p);
  check('mission 1 starts: 3 long, 6 keys, 7 tries, in practice mode', x.mis && x.mis.i === 0 && x.cfg.len === 3 && x.cfg.max === 7 && await p.locator('#pad .sk').count() === 6 && x.mode === 'practice' && await p.isVisible('#misBar'), x);
  await shot(p, '8-m1');
  const ans = await p.evaluate(() => __hitblow.answer());
  const wrong = ['012', '345', '120'].find(g => g !== ans);
  await tapKeys(p, wrong); await p.click('#goBtn');
  x = await st(p);
  check('a guess is judged and counted', x.rows.length === 1 && x.mis.tries === 1, x);
  check('digits above the mission range are refused (key 9)', await p.evaluate(() => { __hitblow.type('9'); return __hitblow.G.cur; }) === '', null);
  // the flash hint: marks the memo, caps the stars at 2
  await p.keyboard.press('h');
  x = await st(p);
  const hp = x.mis.hint;
  check('H key: the flash reveals one place, marks the memo "here", hint bar changes', x.mis.hinted && hp.ch === ans[hp.pos] && x.memo.p[(+hp.ch) * 3 + hp.pos] === 2 && !await p.isVisible('#hintBtn') && /ひらめき/.test(await p.textContent('#misBar')), x.mis);
  await p.evaluate(() => __kb.win()); await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  x = await st(p);
  check('solved with the flash: at most ★2, saved in kusoge.hitblow.x, the next mission opens', x.won && x.mis.stars >= 1 && x.mis.stars <= 2 && x.x.s[0] === x.mis.stars && x.x.b[0] === 2 && await p.isVisible('#rNext'), x);
  await shot(p, '8-result');
  const sv = await stored(p, SAVE);
  check('the ranking value and per-setting bests did not change', sv.best === 777 && sv.bests.n4.s === 777 && !(sv.stats && (sv.stats.plays || sv.stats.wins)), sv);
  let ev = await events(p);
  check('a mission is reported as practice (never normal)', ev.some(e => e[0] === 'play_start' && e[1] === 'practice') && ev.some(e => e[0] === 'play_end' && e[1] === 'practice' && e[2] === 'clear') && !ev.some(e => e[1] === 'normal'), ev);
  await p.click('#rNext');
  x = await st(p);
  check('"next mission" starts mission 2 (colors, 6 shapes)', x.mis && x.mis.i === 1 && x.cfg.sym === 'col' && await p.locator('#pad .sk').count() === 6, x);
  await p.evaluate(() => __hitblow.start('mission', { i: 1 }));
  // bot: every mission within its limit (the engine picks the guesses)
  const out = await p.evaluate(() => {
    const E = __hitblow.E, res = [];
    __hitblow.setX({ v: 1, s: new Array(12).fill(1), b: new Array(12).fill(5) });
    for (let i = 0; i < 12; i++) {
      __hitblow.start('mission', { i, seed: 4242 + i });
      const G = __hitblow.G, fb = E.info(i).fb;
      const given = G.given; let g = 0;
      while (__hitblow.G === G && !G.over && g++ < 30) __hitblow.botStep();
      res.push({ i, won: G.won, tries: G.rows.length - given, fb, given, max: G.cfg.max, stars: G.stars });
    }
    return res;
  });
  check('the bot clears all 12 missions within the tries limit', out.length === 12 && out.every(r => r.won && r.tries <= r.max), out.filter(r => !r.won || r.tries > r.max));
  check('both hidden-clue kinds and given clues were exercised', out.some(r => r.fb === 'hit') && out.some(r => r.fb === 'blow') && out.some(r => r.given > 0), out.map(r => r.fb + r.given));
  x = await st(p);
  check('stars are saved for every mission (and never go down)', x.x.s.every(v => v >= 1) && x.x.b.every(v => v >= 1), x.x);
  ev = await events(p);
  check('still no "normal" play reported by missions', !ev.some(e => e[1] === 'normal'), ev.filter(e => e[1] === 'normal').length);
  await s.close();

  // feedback display for hidden clues
  const t = await open(env, { seed: Object.assign({ [X]: JSON.stringify({ v: 1, s: new Array(12).fill(3), b: new Array(12).fill(3) }) }, SEEN) });
  const q = t.page;
  await q.evaluate(() => { __hitblow.start('mission', { i: 3, seed: 9 }); });
  let y = await st(q);
  check('mission 4 hides the blows: shows only H', y.mis.fb === 'hit' && y.cfg.len === 3, y);
  await q.evaluate(() => { const a = __hitblow.answer(); __hitblow.guess(a[1] + a[0] + a[2]); });
  check('hit-only row: the B badge shows ?', await q.locator('#hist .row:last-child .hb.b.unk').count() === 1 && await q.locator('#hist .row:last-child .hb.h.unk').count() === 0, await q.innerHTML('#hist'));
  await shot(q, '8-hitonly');
  await q.evaluate(() => { __hitblow.start('mission', { i: 6, seed: 9 }); const a = __hitblow.answer(); __hitblow.guess(a[1] + a[0] + a[2]); });
  check('blow-only row: the H badge shows ?', await q.locator('#hist .row:last-child .hb.h.unk').count() === 1, null);
  await q.evaluate(() => { __hitblow.start('mission', { i: 2, seed: 9 }); });
  y = await st(q);
  check('mission 3 starts with 2 free clues that do not count as tries', y.mis.given === 2 && y.rows.length === 2 && y.mis.tries === 0 && await q.locator('#hist .row.giv').count() === 2, y);
  const gv = await q.evaluate(() => __hitblow.G.rows.map(r => r.g));
  check('the free clues are never the answer and judge correctly', gv.every(g => g !== q && true) && await q.evaluate(() => __hitblow.G.rows.every(r => __hitblow.judge(__hitblow.answer(), r.g).h === r.h && r.h < 3)), gv);
  await q.click('#tabMemo');
  check('memo candidates use only the visible clue (a count is shown)', /通り/.test(await q.textContent('#memo')), await q.textContent('#memo'));
  await t.close();
}

async function keysAndTouch(env) {
  console.log('9. keyboard and touch on the missions');
  const s = await open(env, { seed: Object.assign({ [X]: JSON.stringify({ v: 1, s: [3, 2, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0], b: [3, 4, 5, 0, 0, 0, 0, 0, 0, 0, 0, 0] }) }, SEEN) });
  const p = s.page;
  await p.click('#tMis');
  let x = await st(p);
  check('four missions are open (3 cleared + the next); focus is on the first unfinished one', x.missions && await p.locator('#mList .mc:not(.lock)').count() === 4 && await p.evaluate(() => document.activeElement.dataset.i) === '3', await p.evaluate(() => document.activeElement.className));
  await p.keyboard.press('ArrowUp');
  check('ArrowUp moves the focus', await p.evaluate(() => document.activeElement.dataset.i) === '2', null);
  await p.keyboard.press('Enter');
  x = await st(p);
  check('Enter starts the focused mission', x.mis && x.mis.i === 2 && !x.missions, x);
  await p.evaluate(() => { __hitblow.type('01'); __hitblow.hint(); });
  const before = await st(p);
  await p.keyboard.press('Escape');
  await p.waitForFunction(() => !!document.querySelector('.kb-layer:not([hidden])'), null, { timeout: 3000 }).catch(() => {});
  check('Esc opens the pause menu', await p.evaluate(() => !!document.querySelector('.kb-layer:not([hidden])')), null);
  await p.keyboard.press('Escape'); await p.waitForTimeout(300);

  await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  x = await st(p);
  check('after a reload the title offers "continue" with the mission', x.title && /ミッション 3/.test(await p.textContent('#tPlay')), await p.textContent('#tPlay'));
  await p.click('#tPlay');
  x = await st(p);
  check('continue: same mission, answer, free clues, flash and input', x.mis && x.mis.i === 2 && x.mis.hinted && x.mis.given === before.mis.given && JSON.stringify(x.rows) === JSON.stringify(before.rows) && x.cur === before.cur && await p.evaluate(() => __hitblow.answer()) === await p.evaluate(() => __hitblow.G.secret), { x: x.mis, before: before.mis });
  // giving up from the menu = not cleared, stars do not drop
  await p.evaluate(() => __kb.lose()); await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  x = await st(p);
  check('giving up does not lower the stars', !x.won && x.x.s[2] === 1 && x.x.b[2] === 5, x.x);
  await s.close();
  // touch
  const t = await B.newSession(env, { vp: V.get('ip12'), lang: 'ja', seed: SEEN, isMobile: true, hasTouch: true });
  await t.goto('/hitblow/?debug'); await t.page.waitForFunction(() => window.__kb && __kb.ready());
  const q = t.page;
  await q.tap('#tMis'); await q.tap('#mList .mc[data-i="0"]');
  x = await st(q);
  check('touch: tapping opens the list and starts the mission', x.mis && x.mis.i === 0, x);
  const a = await q.evaluate(() => __hitblow.answer());
  for (const ch of '012') await q.tap(`#pad .sk[data-i="${ch}"]`);
  await q.tap('#slots .slot:nth-child(3)');
  x = await st(q);
  check('touch: keys fill the slots, tapping a slot removes it', x.cur === '01', x.cur);
  await q.tap('#pad .sk[data-i="3"]'); await q.tap('#goBtn');
  x = await st(q);
  check('touch: OK judges the guess', x.rows.length === 1 || x.mis.tries === 1, x);
  await q.tap('#hintBtn');
  check('touch: the flash button works', (await st(q)).mis.hinted, null);
  await t.close();
}

async function compat(env) {
  console.log('10. old / broken saves and the win streak');
  const s = await open(env, { seed: Object.assign({ [X]: '{broken', [SAVE]: JSON.stringify({ v: 1, best: 1200, bests: { n4: { s: 1200, g: 3, t: 50000 } }, stats: { plays: 5, wins: 4 }, set: { sym: 'num', d: 'n', dup: false, cpu: 2 }, tut: 1 }) }, SEEN) });
  const p = s.page;
  let x = await st(p);
  check('a broken kusoge.hitblow.x still opens (all zero)', x.title && x.x.s.every(v => v === 0) && x.x.ws === 0, x.x);
  check('the old save is read as before', x.save.best === 1200 && x.save.bests.n4.g === 3 && x.save.stats.plays === 5, x.save);
  await p.evaluate(() => __hitblow.setX({ v: 1, s: [9, -4, 'x'], b: 'no', ws: 3, wm: 1 }));
  x = await st(p);
  check('odd x values are clamped (stars 0–3, best tries 0, streak max ≥ streak)', x.x.s[0] === 3 && x.x.s[1] === 0 && x.x.s[2] === 0 && x.x.b.every(v => v === 0) && x.x.wm === 3, x.x);
  await p.evaluate(k => { localStorage.removeItem(k); __hitblow.setX({}); }, X);
  // solo wins make a streak, a loss resets it; the ranking value still comes from the old save
  for (let i = 0; i < 2; i++) { await p.evaluate(() => { __hitblow.start('solo', { d: 'e' }); }); await p.evaluate(() => __kb.win()); await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 }); await p.evaluate(() => __hitblow.title()); }
  x = await st(p);
  check('two solo wins: streak 2, saved in x', x.x.ws === 2 && x.x.wm === 2 && /2連勝/.test(await p.textContent('#tStreak')), x.x);
  await p.evaluate(() => { __hitblow.start('solo', { d: 'e' }); }); await p.evaluate(() => __kb.lose()); await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  x = await st(p);
  check('a loss resets the streak but keeps the best streak', x.x.ws === 0 && x.x.wm === 2 && x.save.best >= 1200, x.x);
  await p.evaluate(() => { __hitblow.start('daily', { practice: true }); }); await p.evaluate(() => __kb.win()); await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  check('practice does not change the streak', (await st(p)).x.wm === 2, null);
  await s.close();
}

async function missionsEnglish(env) {
  console.log('11. missions in English, and every screen size');
  const full = { [X]: JSON.stringify({ v: 1, s: new Array(12).fill(2), b: new Array(12).fill(4), ws: 2, wm: 3 }) };
  const s = await open(env, { seed: Object.assign({}, full, SEEN), lang: 'en' });
  const p = s.page;
  let jp = await p.evaluate(`(${jpScan})(true)`);
  check('en: title (with the mission button and streak) has no Japanese', jp.length === 0, jp);
  await p.click('#tMis');
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('en: mission list has no Japanese', jp.length === 0, jp);
  await shot(p, '11-list-en');
  for (let i = 0; i < 12; i++) {
    await p.evaluate(i => __hitblow.start('mission', { i, seed: 3 }), i);
    await p.evaluate(() => { __hitblow.G.cur = ''; __kb.step(1); });
    jp = await p.evaluate(`(${jpScan})(true)`);
    if (jp.length) { check(`en: mission ${i + 1} has no Japanese`, false, jp); break; }
  }
  check('en: all 12 missions have no Japanese', true);
  await p.evaluate(() => { __hitblow.start('mission', { i: 7 }); __hitblow.hint(); });
  await p.click('#tabMemo'); jp = await p.evaluate(`(${jpScan})(true)`);
  check('en: mission memo has no Japanese', jp.length === 0, jp);
  await p.evaluate(() => { __hitblow.setTab('hist'); __kb.win(); });
  await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 });
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('en: mission result has no Japanese', jp.length === 0, jp);
  await shot(p, '11-result-en');
  await s.close();
  for (const vp of Object.keys(V.VIEWPORTS)) {
    for (const lang of ['ja', 'en']) {
      for (const scheme of ['dark', 'light']) {
        if (scheme === 'light' && !(vp === 'se1' || vp === 'ip12')) continue;
        const t = await B.newSession(env, { vp: V.get(vp), lang, seed: Object.assign({}, full, SEEN), isMobile: false, hasTouch: false });
        await t.page.emulateMedia({ colorScheme: scheme });
        await t.goto('/hitblow/?debug'); await t.page.waitForFunction(() => window.__kb && __kb.ready());
        const q = t.page;
        const lay = async name => {
          const r = await q.evaluate(`(${layoutProbe})()`);
          check(`layout ${vp} ${lang} ${scheme} ${name}: nothing off screen, no sideways scroll`, r.offscreen.length === 0 && r.hscroll <= 1, { off: r.offscreen.slice(0, 3), h: r.hscroll });
        };
        await lay('title');
        const tb = await q.evaluate(() => [...document.querySelectorAll('#ovTitle button, #ovTitle a')].filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return { id: b.id, bottom: r.bottom, h: r.height }; }));
        const H = q.viewportSize().height;
        check(`layout ${vp} ${lang} ${scheme}: title buttons inside the screen`, tb.every(b => b.bottom <= H + 1 || b.id === 'optDup'), tb.filter(b => b.bottom > H + 1));
        await q.click('#tMis'); await q.waitForTimeout(450); await lay('list');
        const mc = await q.evaluate(() => { const l = document.getElementById('mList'); const b = document.getElementById('mBack').getBoundingClientRect(); return { sc: l.scrollHeight > l.clientHeight, back: b.bottom, h: b.height, ch: l.clientHeight }; });
        check(`layout ${vp} ${lang} ${scheme}: mission list scrolls inside the card, the back button is on screen`, mc.back <= H + 1 && mc.h >= 44 && mc.ch >= 60, mc);
        for (const mi of [3, 11]) {
          await q.evaluate(mi => { __hitblow.start('mission', { i: mi, seed: 1 }); __kb.step(3); }, mi);
          await lay('mission ' + (mi + 1));
          const keys = await q.evaluate(() => [...document.querySelectorAll('#right button, #misBar button')].filter(b => b.offsetParent).map(b => { const r = b.getBoundingClientRect(); return { id: b.id || b.className, top: r.top, bottom: r.bottom, h: r.height, w: r.width }; }));
          const bad = keys.filter(k => k.bottom > H + 1 || k.top < 0 || k.h < 44 || k.w < 40);
          const main = await q.evaluate(() => document.getElementById('main').getBoundingClientRect().height);
          check(`layout ${vp} ${lang} ${scheme} mission ${mi + 1}: keys + OK + flash on screen, ≥44px; notebook visible (${Math.round(main)}px)`, !bad.length && main >= 60, { bad, main });
        }
        if (lang === 'en' && (vp === 'se1' || vp === 'land')) await shot(q, `11-${vp}-${lang}-${scheme}-mission`);
        await t.close();
      }
    }
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  B.ensureCdn();
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [tutorialAndWin, lose, daily, cpu, reload, english, online, missions, keysAndTouch, compat, missionsEnglish]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 600)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
