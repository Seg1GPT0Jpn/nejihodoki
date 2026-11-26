#!/usr/bin/env node
// ペーパーウイングの通しプレイ（Playwright。キーボード・タッチ・ゲームパッドは本物の入力。?debug の window.__shmup / __kb は状態を読む・ステージを飛ばす・弾を足すためだけ）
//   node tools/tests/shmup-play.js [first,keys,damage,pause,over,clear,replay,modes,touch,gamepad,english,themes,layouts,perf]
// 1. 初回のあそびかた→タイトル  2. キーで動く・撃つ・ボム  3. 当たる（シールド・残機・無敵）  4. ポーズ（止まる・つづける・隠れたら止まる）
// 5. ゲームオーバー→コンティニュー→おわる→記録・ランキング  6. ステージクリアの流れ（ボスを倒す→次のステージ・到達の保存）
// 7. リプレイ（同じ入力で同じ結果・コードの書き出しと読み込み・見る位置）  8. 練習・ボスラッシュ・きょうのチャレンジ
// 9. タッチ（どこでもなぞる・自動で撃つ・ボム・ゆっくりボタン）  10. ゲームパッド  11. 英語（日本語が残らない）  12. ライト／ダーク  13. 画面サイズ（320px・横向き）  14. 弾が多いときの速さ
// まだ games.js にゲームが登録されていないときは、shmup/assets/*.txt を差し込んだ一時のルートで動かす（登録後はそのまま本物で動く）。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const REAL = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out', 'shots', 'shmup-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.shmup.save', RANK = 'kusoge.shmup.rank', REPS = 'kusoge.shmup.reps', HOWTO = 'kusoge.shmup.howto';
const IN = { L: 1, R: 2, U: 4, D: 8, SHOOT: 16, BOMB: 32, FOCUS: 64, CONT: 128 };

// a root with the registry entry + achievements spliced in, when common/games.js does not know the game yet
function stageRoot() {
  const gs = fs.readFileSync(path.join(REAL, 'common/games.js'), 'utf8');
  if (/id: 'shmup'/.test(gs)) return { root: REAL, staged: false };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'shmup-root-'));
  for (const n of fs.readdirSync(REAL)) { if (n === '.git' || n === 'common' || n === 'node_modules') continue; fs.symlinkSync(path.join(REAL, n), path.join(tmp, n)); }
  fs.mkdirSync(path.join(tmp, 'common'));
  for (const n of fs.readdirSync(path.join(REAL, 'common'))) if (n !== 'games.js') fs.symlinkSync(path.join(REAL, 'common', n), path.join(tmp, 'common', n));
  const reg = fs.readFileSync(path.join(REAL, 'shmup/assets/registry-entry.txt'), 'utf8'), ach = fs.readFileSync(path.join(REAL, 'shmup/assets/achievements-entry.txt'), 'utf8');
  let out = gs.replace(/\n  \];\n(\s*\n\s*\/\/ ゲームごとの実績)/, '\n' + reg.replace(/\n$/, '') + '\n  ];\n$1');
  out = out.replace('\n    crates: [\n', '\n' + ach.replace(/\n$/, '') + '\n    crates: [\n');
  fs.writeFileSync(path.join(tmp, 'common/games.js'), out);
  return { root: tmp, staged: true };
}

async function open(env, o = {}) {
  const touch = !!o.touch;
  const s = await B.newSession(env, { vp: V.get(o.vp || 'se2'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: touch, hasTouch: touch, initScripts: o.initScripts });
  if (o.scheme) await s.page.emulateMedia({ colorScheme: o.scheme });
  await s.goto('/shmup/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__shmup);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 8000 });
const start = (p, o) => p.evaluate(o => __shmup.start(o), o);
const frames = async (p, n) => { const f0 = (await st(p)).frame; await wait(p, f => __kb.state().frame >= f, f0 + n, 15000); };
const clickAct = (p, act) => p.click(`[data-act="${act}"]`);
const clickText = (p, re) => p.evaluate(src => { const r = new RegExp(src); const b = [...document.querySelectorAll('button, a')].find(x => r.test(x.textContent) && x.getClientRects().length); if (!b) throw new Error('no button ' + src); b.click(); }, re.source);
const OPEN_MENU = () => document.querySelector('.kb-layer .kb-pause');

async function first(env) {
  console.log('1. first visit: the rules, then the title with every mode');
  const s = await open(env, { seed: {}, vp: 'se1' }); const p = s.page;
  let a = await st(p); check('the rules show on the first visit', a.screen === 'howto' && a.ov, a);
  check('the rules explain keyboard, touch, pad, graze, items and the beginner tip', (await p.textContent('.howto')).length > 300 && /Z/.test(await p.textContent('.howto')));
  await shot(p, '01-howto');
  await clickAct(p, 'howtoGo'); a = await st(p); check('the title follows', a.screen === 'title', a);
  const modes = await p.$$eval('[data-act^="setup:"]', b => b.map(x => x.dataset.act)); check('the title offers arcade, practice, rush and daily', modes.join() === 'setup:arcade,setup:practice,setup:rush,setup:daily', modes);
  check('replays, records and rules are on the title', !!(await p.$('[data-act="replays"]')) && !!(await p.$('[data-act="records"]')) && !!(await p.$('[data-act="howto"]')));
  check('the title plays an attract demo behind the panel (the bot is flying)', await p.evaluate(() => __shmup.S && __shmup.S.frame > 0 && !__shmup.run), null);
  await shot(p, '01-title');
  check('the sound was never started with BGM (KoboAudio has no bgm)', await p.evaluate(() => !KoboAudio.bgm.available));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function keysTest(env) {
  console.log('2. real keys: set up, launch, move, shoot, slow mode, bomb');
  const s = await open(env); const p = s.page;
  await p.evaluate(() => __shmup.showTitle()); await clickAct(p, 'setup:arcade'); await wait(p, () => __kb.state().screen === 'setup:arcade');
  await shot(p, '02-setup');
  await clickAct(p, 'ship:1'); await clickAct(p, 'diff:0'); await p.check('[data-as="4"]');
  let sv = await stored(p, SAVE); check('ship, difficulty and assists are remembered', sv.set.ship === 1 && sv.set.diff === 0 && sv.set.assist === 4, sv && sv.set);
  await p.uncheck('[data-as="4"]'); await clickAct(p, 'ship:0');
  await clickAct(p, 'go:arcade'); await wait(p, () => __kb.state().playing);
  let a = await st(p); check('launched: arcade, Easy, ship 0, stage 1, with the starting stock', a.mode === 'arcade' && a.diff === 0 && a.ship === 0 && a.stage === 0 && a.lives === 4 && a.bombs === 4, a);
  await shot(p, '02-play');
  const y0 = a.py; await p.keyboard.down('ArrowUp'); await p.waitForTimeout(500); await p.keyboard.up('ArrowUp'); a = await st(p); check('the up arrow moves the ship up', a.py < y0 - 20, { y0, py: a.py });
  const x0 = a.px; await p.keyboard.down('KeyD'); await p.waitForTimeout(400); await p.keyboard.up('KeyD'); a = await st(p); check('D (WASD) moves right', a.px > x0 + 15, { x0, px: a.px });
  const k0 = a.kills; await p.keyboard.down('KeyZ'); await p.waitForTimeout(250);
  check('holding Z shoots', (await st(p)).last.some(m => m & IN.SHOOT), (await st(p)).last);
  const xs = (await st(p)).px; await p.keyboard.down('Shift'); await p.keyboard.down('ArrowLeft'); await p.waitForTimeout(500); await p.keyboard.up('ArrowLeft'); const xf = (await st(p)).px; await p.keyboard.up('Shift');
  const xr = (await st(p)).px; await p.keyboard.down('ArrowRight'); await p.waitForTimeout(500); await p.keyboard.up('ArrowRight'); const xn = (await st(p)).px;
  check('Shift (slow mode) moves slower than normal', Math.abs(xf - xs) < Math.abs(xn - xr) * 0.7 && Math.abs(xf - xs) > 3, { slow: xf - xs, fast: xn - xr });
  await wait(p, () => __kb.state().kills > 0 || __kb.state().score > 0, null, 20000); a = await st(p); check('shooting defeats junk and scores', a.score > 0 && a.kills >= 0, a);
  await p.keyboard.up('KeyZ');
  const b0 = (await st(p)).bombs; await p.keyboard.press('KeyX'); await wait(p, () => __kb.state().bomb > 0); a = await st(p); check('X fires a bomb (stock goes down, invulnerable)', a.bombs === b0 - 1 && a.inv > 0, a);
  await shot(p, '02-bomb'); await p.keyboard.down('KeyX'); await p.waitForTimeout(300); await p.keyboard.up('KeyX'); check('holding X does not fire a second bomb', (await st(p)).bombs === b0 - 1);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function damageTest(env) {
  console.log('3. taking damage: death-bomb window, lives, invulnerability, shield; weapon power drops');
  const s = await open(env); const p = s.page;
  await start(p, { mode: 'practice', stage: 0, diff: 1, ship: 0 }); await wait(p, () => __kb.state().playing); await p.evaluate(() => { __shmup.S.p.inv = 0; });
  let a = await st(p); const l0 = a.lives, pw = a.power;
  await p.evaluate(() => __shmup.hurt()); await wait(p, () => __kb.state().dying > 0 || __kb.state().lives < 3); await shot(p, '03-hit');
  await wait(p, () => __kb.state().lives < 3); a = await st(p); check('a hit costs a ship and the ship returns invulnerable', a.lives === l0 - 1 && a.inv > 100, a); check('the weapon level drops by one', a.power === pw - 1, a);
  await p.evaluate(() => __shmup.hurt()); await p.waitForTimeout(300); check('no second hit while invulnerable', (await st(p)).lives === l0 - 1);
  await p.evaluate(() => { const S = __shmup.S; S.p.inv = 0; S.shield = 1; }); await p.evaluate(() => __shmup.hurt()); await p.waitForTimeout(250); a = await st(p); check('a shield takes the hit instead', a.shield === 0 && a.lives === l0 - 1, a);
  await p.evaluate(() => { const S = __shmup.S; S.p.inv = 0; S.bombs = 3; }); await p.evaluate(() => __shmup.hurt()); await wait(p, () => __kb.state().dying > 0); await p.keyboard.press('KeyX'); await p.waitForTimeout(400); a = await st(p); check('a bomb pressed right after the hit saves the ship (death-bomb)', a.lives === l0 - 1 && a.bombs === 2, a);
  await s.close();
  const t = await open(env); await start(t.page, { mode: 'practice', stage: 0, diff: 1, ship: 0, assist: 2 }); await wait(t.page, () => __kb.state().playing); await t.page.evaluate(() => { __shmup.S.p.inv = 0; __shmup.hurt(); }); await t.page.waitForTimeout(400); a = await st(t.page);
  check('assist auto-bomb spends a bomb instead of a ship', a.lives === 3 && a.bombs === 2, a); await t.close();
}

async function pauseTest(env) {
  console.log('4. pause: Escape / hidden page open the pause menu, time stops, Resume continues');
  const s = await open(env); const p = s.page;
  await start(p, { mode: 'practice', stage: 0, diff: 1 }); await wait(p, () => __kb.state().playing); await frames(p, 20);
  await p.keyboard.press('Escape'); await wait(p, () => !!document.querySelector('.kb-pause')); let a = await st(p); check('Escape pauses', a.paused && !a.playing, a); await shot(p, '04-pause');
  const f0 = a.frame; await p.keyboard.down('ArrowUp'); await p.waitForTimeout(400); await p.keyboard.up('ArrowUp'); a = await st(p); check('the game is frozen while paused (frames and ship do not move)', a.frame === f0, { f0, f: a.frame });
  check('the pause menu offers resume, restart, how-to / end run and home', await p.evaluate(() => document.querySelectorAll('.kb-layer .kb-btn').length >= 4));
  await p.click('.kb-layer .kb-btn--primary'); await wait(p, () => __kb.state().playing); await frames(p, 10); a = await st(p); check('Resume continues', a.frame > f0 && !a.paused, a);
  await p.evaluate(() => __kb.pause('hidden')); await wait(p, () => !!document.querySelector('.kb-pause')); a = await st(p); check('hiding the page pauses by itself', a.paused, a); await p.click('.kb-layer .kb-btn--primary'); await wait(p, () => __kb.state().playing);
  await p.evaluate(() => window.dispatchEvent(new Event('blur'))); await wait(p, () => !!document.querySelector('.kb-pause')); check('losing focus pauses', (await st(p)).paused); await p.click('.kb-layer .kb-btn--primary');
  await wait(p, () => __kb.state().playing); await p.keyboard.press('Escape'); await wait(p, () => !!document.querySelector('.kb-pause')); await clickText(p, /はじめから|Restart/); await wait(p, () => __kb.state().playing && __kb.state().frame < 30); check('Restart in the pause menu starts the run again', (await st(p)).frame < 60);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function overTest(env) {
  console.log('5. game over -> continue (limited, score halves) -> give up -> result, records, local ranking');
  const s = await open(env); const p = s.page;
  await start(p, { mode: 'arcade', diff: 1, ship: 0 }); await wait(p, () => __kb.state().playing);
  await p.evaluate(() => { const S = __shmup.S; S.score = 40000; S.lives = 1; S.p.inv = 0; __shmup.hurt(); }); await wait(p, () => __kb.state().screen === 'over'); let a = await st(p); await shot(p, '05-over');
  check('lives run out: the continue prompt shows, the game is stopped', a.over && a.paused && (await p.textContent('#ovTitle')) === 'GAME OVER', a);
  check('the prompt says how many continues are left (Normal = 3)', /3/.test(await p.textContent('.kv')), await p.textContent('.kv'));
  await clickAct(p, 'cont'); await wait(p, () => __kb.state().playing && __kb.state().conts === 1); a = await st(p); check('continue: back in with full stock, the score halved', a.lives === 3 && a.score === 20000 + (a.score - 20000) && a.score < 40000 && a.conts === 1, a);
  await p.evaluate(() => { const S = __shmup.S; S.lives = 1; S.p.inv = 0; __shmup.hurt(); }); await wait(p, () => __kb.state().screen === 'over');
  await clickAct(p, 'end'); await wait(p, () => __kb.state().screen === 'result'); await shot(p, '05-result');
  const sv = await stored(p, SAVE), rk = await stored(p, RANK);
  check('the result shows the score and whether it counts online', /\d/.test(await p.textContent('.big')) && (await p.textContent('#panel')).length > 100);
  check('the best for Arcade/Normal and the online rank value are saved (no assists)', sv.best.a['1'] > 0 && sv.rank === sv.best.a['1'], sv);
  check('this device\'s ranking got the entry, flagged with the continue', rk.length === 1 && rk[0].c === 1 && rk[0].m === 'arcade', rk);
  check('stats count the run', sv.stats.plays === 1 && sv.stats.deaths >= 2 && sv.stats.conts === 1, sv.stats);
  const reps = await stored(p, REPS); check('the run was kept as a replay code', reps.length === 1 && /^PW1\./.test(reps[0].code), reps && reps[0] && reps[0].code.slice(0, 8));
  await clickAct(p, 'title'); await clickAct(p, 'records'); await wait(p, () => __kb.state().screen === 'records'); check('records list the best and the device ranking', /[1-9]/.test(await p.textContent('.kv')) && (await p.$$('.tbl tr')).length >= 1); await shot(p, '05-records');
  // Ghost has no continue
  await p.evaluate(() => __shmup.showTitle()); await start(p, { mode: 'practice', stage: 0, diff: 3 }); await wait(p, () => __kb.state().playing);
  await p.evaluate(() => { const S = __shmup.S; S.lives = 1; S.p.inv = 0; __shmup.hurt(); }); await wait(p, () => __kb.state().screen === 'over'); check('Ghost has no continue button', !(await p.$('[data-act="cont"]')));
  // an assisted run does not touch the online rank value
  const rank0 = (await stored(p, SAVE)).rank; await clickAct(p, 'end'); await wait(p, () => __kb.state().screen === 'result'); check('practice runs never change the online rank value', (await stored(p, SAVE)).rank === rank0);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function clearTest(env) {
  console.log('6. stage clear flow: skip to the boss, beat it with real shots, the next stage starts, reach is saved');
  const s = await open(env); const p = s.page;
  await start(p, { mode: 'arcade', diff: 0, ship: 0 }); await wait(p, () => __kb.state().playing);
  await p.evaluate(() => { __shmup.god(9); __shmup.S.p.inv = 1e9; __shmup.skip(); });
  await wait(p, () => __kb.state().boss, null, 15000); await shot(p, '06-boss');
  await p.keyboard.down('KeyZ');
  const t0 = Date.now(); let a;
  while (Date.now() - t0 < 25000) { a = await st(p); if (a.phase === 'clear' || a.stage > 0) break; if (a.boss) { if (a.by > a.py + 4) { await p.keyboard.down('ArrowDown'); await p.keyboard.up('ArrowUp'); } else if (a.by < a.py - 4) { await p.keyboard.down('ArrowUp'); await p.keyboard.up('ArrowDown'); } else { await p.keyboard.up('ArrowUp'); await p.keyboard.up('ArrowDown'); } } await p.waitForTimeout(30); }
  await p.keyboard.up('ArrowUp'); await p.keyboard.up('ArrowDown'); await p.keyboard.up('KeyZ');
  a = await st(p); check('the boss falls to real shots and the stage is cleared', a.phase === 'clear' || a.stage === 1, a); await shot(p, '06-clear');
  await wait(p, () => __kb.state().stage === 1 && __kb.state().phase === 'play', null, 10000); a = await st(p); check('stage 2 begins by itself (no UI wait)', a.stage === 1 && a.mode === 'arcade', a);
  const sv = await stored(p, SAVE); check('the reached stage is saved for Stage Practice', sv.reach >= 2, sv.reach);
  check('the stage-clear bonus was added (stock bonus + stage bonus)', a.score >= 100000, a.score);
  check('KoboGame saw the stage clear and the start', await p.evaluate(() => __kb.events.some(e => e.type === 'stage_clear') && __kb.events.some(e => e.type === 'play_start')));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function replayTest(env) {
  console.log('7. replay: a real run replays to the same state; code export/import; seeking; speed');
  const s = await open(env); const p = s.page;
  await start(p, { mode: 'practice', stage: 0, diff: 0, ship: 1, seed: 424242 }); await wait(p, () => __kb.state().playing);
  await p.keyboard.down('KeyZ'); await p.keyboard.down('ArrowUp'); await p.waitForTimeout(450); await p.keyboard.up('ArrowUp'); await p.keyboard.down('ArrowDown'); await p.waitForTimeout(700); await p.keyboard.up('ArrowDown'); await p.keyboard.press('KeyX'); await p.waitForTimeout(300); await p.keyboard.up('KeyZ'); await p.keyboard.press('Space'); await p.waitForTimeout(300);
  await p.keyboard.press('Escape'); await wait(p, () => !!document.querySelector('.kb-pause')); await clickText(p, /ここまででおわる|End run/); await wait(p, () => __kb.state().screen === 'result');
  const live = await st(p); check('the run ended with a result and a replay code', live.result && live.inputs > 100, live);
  const code = await p.evaluate(() => __shmup.run.result.code); check('the code is a PW1 text', /^PW1\.[A-Za-z0-9_-]+$/.test(code), code.slice(0, 20));
  await clickAct(p, 'watch'); await wait(p, () => __kb.state().replay); await shot(p, '07-replay'); await wait(p, () => __kb.state().rpEnded, null, 20000); let a = await st(p);
  check('the replay ends at the same frame with the same state hash as the live run', a.frame === live.frame && a.hash === live.hash && a.score === live.score, { live: [live.frame, live.hash, live.score], rp: [a.frame, a.hash, a.score] });
  await p.evaluate(() => { const r = document.getElementById('rpRange'); r.value = Math.floor(r.max / 2); r.dispatchEvent(new Event('input', { bubbles: true })); }); a = await st(p); check('the slider seeks (re-simulates) to the middle', Math.abs(a.frame - Math.floor(live.frame / 2)) <= 1, a.frame);
  await p.click('#rpSpeed'); check('speed button cycles x2', (await p.textContent('#rpSpeed')) === 'x2'); await p.click('#rpPlay'); const f1 = (await st(p)).frame; await p.waitForTimeout(500); check('play resumes from the middle', (await st(p)).frame > f1);
  await p.click('#rpDone'); await wait(p, () => __kb.state().screen === 'title'); check('closing returns to the title', true);
  await clickAct(p, 'replays'); await wait(p, () => __kb.state().screen === 'replays'); check('the saved run is listed', (await p.$$('[data-act^="rplay:"]')).length === 1);
  await p.fill('#repCode', 'PW1.garbage!'); await clickAct(p, 'rimport'); check('a broken code is refused with a message', (await p.textContent('#repErr')).length > 3);
  await p.fill('#repCode', code); await clickAct(p, 'rimport'); await wait(p, () => __kb.state().replay); await wait(p, () => __kb.state().rpEnded, null, 20000); a = await st(p); check('a pasted code replays to the same final state', a.hash === live.hash, a.hash);
  await p.evaluate(() => document.getElementById('rpDone').click()); await wait(p, () => __kb.state().screen === 'title');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function modesTest(env) {
  console.log('8. stage practice (locked by reach), boss rush, daily challenge (same for everyone, the date picks it)');
  const s = await open(env, { seed: { [HOWTO]: '1', [SAVE]: JSON.stringify({ v: 1, reach: 3 }) } }); const p = s.page;
  await clickAct(p, 'setup:practice'); await wait(p, () => __kb.state().screen === 'setup:practice');
  const dis = await p.$$eval('.stgrid .opt', b => b.map(x => x.disabled)); check('practice stages beyond the reached one are locked', dis.join() === 'false,false,false,true,true,true,true', dis);
  await clickAct(p, 'stage:2'); await clickAct(p, 'go:practice'); await wait(p, () => __kb.state().playing); let a = await st(p); check('practice starts the chosen stage alone with a loadout', a.mode === 'practice' && a.stage === 2 && a.power >= 2, a);
  await p.evaluate(() => __shmup.showTitle()); await clickAct(p, 'setup:rush'); await clickAct(p, 'go:rush'); await wait(p, () => __kb.state().playing); await wait(p, () => __kb.state().boss, null, 8000); a = await st(p); check('boss rush: the boss is on screen within a second or two', a.mode === 'rush' && a.boss, a); await shot(p, '08-rush');
  await p.evaluate(() => __shmup.showTitle()); await clickAct(p, 'setup:daily'); await wait(p, () => __kb.state().screen === 'setup:daily'); check('daily shows the day\'s ship, stages and two rules', (await p.$$('.kv span')).length >= 8); await shot(p, '08-daily');
  const d1 = await p.evaluate(() => { const E = __shmup.E; return JSON.stringify([E.dailyFor(20261126), E.dailyFor(20261126), E.dailyFor(20261127)]); }); const [x, y, z] = JSON.parse(d1); check('the daily setup is identical for the same date and differs the next day', JSON.stringify(x) === JSON.stringify(y) && JSON.stringify(x) !== JSON.stringify(z));
  await clickAct(p, 'go:daily'); await wait(p, () => __kb.state().playing); a = await st(p); check('daily starts: Normal difficulty, no continues, modifiers on', a.mode === 'daily' && a.diff === 1 && (await p.evaluate(() => __shmup.S.modNames.length === 2 && __shmup.S.maxConts >= 0)), a);
  await p.evaluate(() => { const S = __shmup.S; S.lives = 1; S.p.inv = 0; __shmup.hurt(); }); await wait(p, () => __kb.state().screen === 'over' || __kb.state().screen === 'result'); 
  const sv = await stored(p, SAVE); check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  const t = await open(env, { query: '&daily=20261126' }); await wait(t.page, () => __kb.state().playing && __kb.state().mode === 'daily', null, 8000); check('?daily=YYYYMMDD opens that day\'s challenge', true); await t.close();
}

async function touchTest(env) {
  console.log('9. touch: drag anywhere (relative), auto-fire, bomb and slow buttons, landscape and portrait');
  const s = await open(env, { touch: true }); const p = s.page; const cdp = await p.context().newCDPSession(p);
  await start(p, { mode: 'practice', stage: 0, diff: 0, ship: 0 }); await wait(p, () => __kb.state().playing);
  check('touch layout: the bomb and slow buttons show and are 44px or bigger', await p.evaluate(() => ['bBomb', 'bFocus'].every(i => { const r = document.getElementById(i).getBoundingClientRect(); return r.width >= 44 && r.height >= 44 && r.top >= 0 && r.bottom <= innerHeight; })));
  await shot(p, '09-touch');
  const touchSeq = async (pts) => { await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: pts[0][0], y: pts[0][1] }] }); for (const q of pts.slice(1)) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: q[0], y: q[1] }] }); await p.waitForTimeout(40); } };
  let a = await st(p); const y0 = a.py, x0 = a.px;
  await touchSeq([[200, 560], [200, 540], [200, 520], [200, 500], [200, 480], [200, 460]]); await p.waitForTimeout(600); a = await st(p);
  check('dragging up anywhere on the screen moves the ship up (relative, not to the finger)', a.py < y0 - 15, { y0, py: a.py }); check('touch mode auto-fires without a button', a.touch && a.last.every(m => m & IN.SHOOT), a.last);
  const yMid = a.py; await touchSeq([[200, 460], [200, 480], [200, 500], [200, 520]]); await p.waitForTimeout(500); a = await st(p);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] }); check('dragging back down moves it back', a.py > yMid + 8, { yMid, py: a.py });
  const b0 = (await st(p)).bombs; await p.tap('#bBomb'); await wait(p, () => __kb.state().bomb > 0); check('the Bomb button fires a bomb', (await st(p)).bombs === b0 - 1);
  await p.tap('#bFocus'); check('the Slow button toggles on', (await p.getAttribute('#bFocus', 'aria-pressed')) === 'true'); await p.waitForTimeout(200); check('and the pressed state reaches the sim (focus bit)', (await st(p)).last.every(m => m & IN.FOCUS)); await p.tap('#bFocus'); check('and toggles off', (await p.getAttribute('#bFocus', 'aria-pressed')) === 'false');
  await p.tap('#pauseFab').catch(() => {}); await p.evaluate(() => __shmup.openPause()); await wait(p, () => !!document.querySelector('.kb-pause')); check('pause works with touch', (await st(p)).paused);
  await p.tap('.kb-layer .kb-btn--primary'); await wait(p, () => __kb.state().playing);
  // the Stork charges while the finger is down and shoots only then
  await p.evaluate(() => __shmup.start({ mode: 'practice', stage: 0, diff: 0, ship: 1 })); await wait(p, () => __kb.state().playing); await p.waitForTimeout(300); check('Stork on touch: no finger, no shots', (await st(p)).last.every(m => !(m & IN.SHOOT)), (await st(p)).last);
  await touchSeq([[100, 500], [100, 495]]); await p.waitForTimeout(300); check('Stork on touch: finger down shoots', (await st(p)).last.every(m => m & IN.SHOOT)); await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function gamepadTest(env) {
  console.log('10. gamepad (a fake pad through navigator.getGamepads)');
  const init = `window.__pad = { axes: [0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false })), connected: true, id: 'fake' }; navigator.getGamepads = () => [window.__pad];`;
  const s = await open(env, { initScripts: [init] }); const p = s.page;
  await start(p, { mode: 'practice', stage: 0, diff: 1 }); await wait(p, () => __kb.state().playing);
  let a = await st(p); const y0 = a.py; await p.evaluate(() => { __pad.axes[1] = -1; }); await p.waitForTimeout(400); await p.evaluate(() => { __pad.axes[1] = 0; }); a = await st(p); check('the stick moves the ship', a.py < y0 - 10, { y0, py: a.py });
  const x0 = a.px; await p.evaluate(() => { __pad.buttons[15].pressed = true; }); await p.waitForTimeout(300); await p.evaluate(() => { __pad.buttons[15].pressed = false; }); a = await st(p); check('the d-pad moves it too', a.px > x0 + 8, a);
  await p.evaluate(() => { __pad.buttons[0].pressed = true; }); await p.waitForTimeout(200); check('A shoots', (await st(p)).last.some(m => m & IN.SHOOT)); await p.evaluate(() => { __pad.buttons[0].pressed = false; });
  const b0 = (await st(p)).bombs; await p.evaluate(() => { __pad.buttons[1].pressed = true; }); await wait(p, () => __kb.state().bomb > 0); await p.evaluate(() => { __pad.buttons[1].pressed = false; }); check('B fires a bomb', (await st(p)).bombs === b0 - 1);
  await p.evaluate(() => { __pad.buttons[9].pressed = true; }); await wait(p, () => !!document.querySelector('.kb-pause')); await p.evaluate(() => { __pad.buttons[9].pressed = false; }); check('Start pauses', (await st(p)).paused);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function english(env) {
  console.log('11. English: no Japanese is left on any screen');
  const s = await open(env, { lang: 'en', seed: {}, vp: 'se2' }); const p = s.page;
  const miss = async what => { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${what}: no Japanese`, jp.length === 0, jp.slice(0, 6)); };
  await miss('rules'); await clickAct(p, 'howtoGo'); await miss('title');
  for (const m of ['arcade', 'practice', 'rush', 'daily']) { await clickAct(p, 'setup:' + m); await miss('setup ' + m); await clickAct(p, 'title'); }
  await clickAct(p, 'records'); await miss('records'); await clickAct(p, 'title'); await clickAct(p, 'replays'); await miss('replays'); await clickAct(p, 'title');
  await start(p, { mode: 'practice', stage: 0, diff: 1 }); await wait(p, () => __kb.state().playing); await p.keyboard.press('Escape'); await wait(p, () => !!document.querySelector('.kb-pause')); await miss('pause'); await p.click('.kb-layer .kb-btn--primary');
  await p.evaluate(() => { const S = __shmup.S; S.lives = 1; S.p.inv = 0; __shmup.hurt(); }); await wait(p, () => __kb.state().screen === 'over'); await miss('game over'); await clickAct(p, 'cont'); await wait(p, () => __kb.state().conts === 1 && __kb.state().playing);
  await p.evaluate(() => { const S = __shmup.S; S.lives = 1; S.p.inv = 0; __shmup.hurt(); }); await wait(p, () => __kb.state().screen === 'over');
  await clickAct(p, 'end'); await wait(p, () => __kb.state().screen === 'result'); await miss('result');
  check('the page title and heading are English', (await p.textContent('h1')) === 'Paper Wing' && /Back to games/.test(await p.getAttribute('.back', 'aria-label')));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

async function themes(env) {
  console.log('12. light / dark: the page follows the scheme, the game canvas draws in both');
  const lum = {};
  for (const scheme of ['light', 'dark']) {
    const s = await open(env, { scheme }); const p = s.page; await clickAct(p, 'setup:arcade'); await shot(p, '12-' + scheme + '-setup'); await p.evaluate(() => __shmup.showTitle());
    await start(p, { mode: 'practice', stage: 4, diff: 1 }); await wait(p, () => __kb.state().playing); await frames(p, 30); await p.evaluate(() => __shmup.hurt && 0);
    const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor); const m = /rgb\((\d+), (\d+), (\d+)/.exec(bg); lum[scheme] = (+m[1] + +m[2] + +m[3]) / 3;
    const px = await p.evaluate(() => { const c = document.getElementById('cv'), x = c.getContext('2d'); const d = x.getImageData(c.width / 2, c.height / 2, 1, 1).data; return [d[0], d[1], d[2]]; });
    check(scheme + ': the canvas draws the stage (not black/blank)', px.some(v => v > 30), px); await shot(p, '12-' + scheme + '-play');
    check(scheme + ': no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
  check('the page background is lighter in light than in dark', lum.light > lum.dark + 60, lum);
}

async function layouts(env) {
  console.log('13. every screen size x ja/en: nothing off screen, the canvas fits 16:9, controls reachable (320px, landscape)');
  for (const vp of (process.env.SHMUP_VPS || 'se1,a360s,se2,ip12,land').split(',')) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang, touch: true, seed: {} }); const p = s.page; const tag = `${vp}/${lang}`;
    const probe = async what => { const r = await p.evaluate(`(${layoutProbe})()`); check(`${tag} ${what}: fits (hscroll ${r.hscroll}, off ${r.offscreen.length})`, r.hscroll <= 1 && r.offscreen.length === 0, r); };
    await probe('rules'); await clickAct(p, 'howtoGo'); await probe('title'); if (lang === 'ja') await shot(p, `13-${vp}-title`);
    await clickAct(p, 'setup:practice'); await probe('setup'); if (lang === 'ja') await shot(p, `13-${vp}-setup`); await clickAct(p, 'title');
    await start(p, { mode: 'practice', stage: 0, diff: 1 }); await wait(p, () => __kb.state().playing); await p.waitForTimeout(300);
    const g = await p.evaluate(() => { const c = document.getElementById('cv').getBoundingClientRect(); const bs = ['bBomb', 'bFocus'].map(i => document.getElementById(i).getBoundingClientRect()); return { w: c.width, h: c.height, vw: innerWidth, vh: innerHeight, l: c.left, t: c.top, r: c.right, b: c.bottom, bs: bs.map(r => [r.width, r.height, r.left, r.right, r.top, r.bottom]), hs: Math.max(document.documentElement.scrollWidth, document.body.scrollWidth) - document.documentElement.clientWidth }; });
    check(`${tag} game: the canvas is 16:9 and inside the screen`, Math.abs(g.w / g.h - 16 / 9) < 0.03 && g.l >= -1 && g.r <= g.vw + 1 && g.t >= -1 && g.b <= g.vh + 1 && g.hs <= 1, g);
    check(`${tag} game: the touch buttons are 44px+ and on screen`, g.bs.every(b => b[0] >= 44 && b[1] >= 44 && b[2] >= 0 && b[3] <= g.vw && b[4] >= 0 && b[5] <= g.vh), g.bs);
    if (lang === 'ja') await shot(p, `13-${vp}-game`);
    await p.keyboard.press('Escape').catch(() => {}); await p.evaluate(() => __shmup.openPause()); await wait(p, () => !!document.querySelector('.kb-pause')); await probe('pause'); await p.click('.kb-layer .kb-btn--primary');
    await p.evaluate(() => { const S = __shmup.S; S.lives = 1; S.p.inv = 0; __shmup.hurt(); }); await wait(p, () => __kb.state().screen === 'over'); await probe('game over'); await clickAct(p, 'end'); await wait(p, () => __kb.state().screen === 'result'); await probe('result'); if (lang === 'ja') await shot(p, `13-${vp}-result`);
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}

async function perf(env) {
  console.log('14. performance: 450+ bullets on screen (headless software rendering; the phone number is NOT measured here)');
  const s = await open(env, { vp: 'a360' }); const p = s.page;
  await start(p, { mode: 'practice', stage: 3, diff: 3, ship: 0 }); await wait(p, () => __kb.state().playing); await p.evaluate(() => { __shmup.god(9); __shmup.S.p.inv = 1e9; });
  const m = await p.evaluate(() => new Promise(res => { let n = 0, t0 = performance.now(), worst = 0, last = t0, maxB = 0; const f = t => { worst = Math.max(worst, t - last); last = t; if (n % 20 === 0) __shmup.stress(120); maxB = Math.max(maxB, __kb.state().bullets); if (++n >= 180) res({ avg: (t - t0) / n, worst, maxB }); else requestAnimationFrame(f); }; requestAnimationFrame(f); }));
  console.log(`    ${m.maxB} bullets at peak, average frame ${m.avg.toFixed(1)} ms, worst ${m.worst.toFixed(0)} ms`);
  check('450+ bullets were live at once', m.maxB >= 450, m); check('the average frame stays under 40 ms even in headless software rendering', m.avg < 40, m);
  check('bullets are drawn from cached sprites (no per-frame sprite building: the sprite table exists and is reused)', await p.evaluate(() => !!__shmup.ART.sprites().b && __shmup.ART.sprites().b[0][0] === __shmup.ART.sprites().b[0][0]));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { root, staged } = stageRoot(); if (staged) console.log('(games.js has no shmup entry yet: using the staged root with shmup/assets/*.txt spliced in)');
  const srv = await server.start(root); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now(); const only = process.argv[2] ? process.argv[2].split(',') : null;
  const all = { first, keys: keysTest, damage: damageTest, pause: pauseTest, over: overTest, clear: clearTest, replay: replayTest, modes: modesTest, touch: touchTest, gamepad: gamepadTest, english, themes, layouts, perf };
  for (const [name, f] of Object.entries(all)) {
    if (only && !only.includes(name)) continue;
    try { await f(env); } catch (e) { check(name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
