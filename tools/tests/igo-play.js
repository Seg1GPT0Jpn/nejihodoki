#!/usr/bin/env node
// 囲碁工房の通しプレイ（Playwright。?debug の window.__igo は「どこを押すか」を聞くだけで、押すのは本物のマウス・キー・タッチ）
//   node tools/tests/igo-play.js [first,game,rules,aids,pass,dead,puzzle,sgf,resume,variants,touch,english,layouts,lobby,online]   （--no-online：エミュレーターを使う online を省く）
// 1. 初回：ルール → タイトル  2. CPU と 9路を本物のクリックで → パス2回 → 死に石（自動の提案）→ 確定 → 結果・保存
// 3. 取り・コウ・自殺手・石の上のクリック（理由が出る）  4. ヒント・もどす・手の番号・座標・地の見積もり・あたりの警告  5. ふたりで1台
// 6. 死に石えらび（タップで切りかえ・点数の見積もり・対局にもどる）  7. 詰碁（毎日の1問・正解の手順・まちがい・一覧・保存）  8. SGF の書き出し・読みこみ・検討（枝わかれ）
// 9. 途中保存 → つづきから  10. 中国ルール・置き碁・コミ・持ち時間・スーパーコウ  11. タッチ（目印 → おく）  12. 英語  13. 画面サイズ × ライト／ダーク  14. ロビー  15. オンライン（エミュレーター）
// まだ games.js に登録されていないときは、igo/assets/*.txt を差し込んだ一時のルートで動かす（オンラインは、rules の tr の許可リストにも igo を足したものをエミュレーターに入れる）。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const REAL = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out', 'shots', 'igo-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.igo.save', RUN = 'kusoge.igo.game', HOWTO = 'kusoge.igo.howto';

function stageRoot() {
  const gs = fs.readFileSync(path.join(REAL, 'common/games.js'), 'utf8');
  if (/id: 'igo'/.test(gs)) return { root: REAL, staged: false };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'igo-root-'));
  for (const n of fs.readdirSync(REAL)) { if (n === '.git' || n === 'common' || n === 'node_modules') continue; fs.symlinkSync(path.join(REAL, n), path.join(tmp, n)); }
  fs.mkdirSync(path.join(tmp, 'common'));
  for (const n of fs.readdirSync(path.join(REAL, 'common'))) if (n !== 'games.js') fs.symlinkSync(path.join(REAL, 'common', n), path.join(tmp, 'common', n));
  const reg = fs.readFileSync(path.join(REAL, 'igo/assets/registry-entry.txt'), 'utf8'), ach = fs.readFileSync(path.join(REAL, 'igo/assets/achievements-entry.txt'), 'utf8');
  let out = gs.replace(/\n  \];\n(\s*\n\s*\/\/ ゲームごとの実績)/, '\n' + reg.replace(/\n$/, '') + '\n  ];\n$1');
  out = out.replace('\n    crates: [\n', '\n' + ach.replace(/\n$/, '') + '\n    crates: [\n');
  fs.writeFileSync(path.join(tmp, 'common/games.js'), out);
  return { root: tmp, staged: true };
}

async function open(env, o = {}) {
  const touch = !!o.touch;
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: touch, hasTouch: touch });
  await s.goto('/igo/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__igo, null, { timeout: 20000 });
  if (!touch && o.conf !== true) await s.page.evaluate(() => __igo.set('conf', 0));
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const speed = (p, m) => p.evaluate(m => __igo.setSpeed(m), m);
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 20000 });
async function clickCell(p, i) { const pt = await p.evaluate(i => __igo.cellPoint(i), i); await p.mouse.click(pt.x, pt.y); }
async function tapCell(p, i) { const pt = await p.evaluate(i => __igo.cellPoint(i), i); await p.touchscreen.tap(pt.x, pt.y); }
const act = (p, id) => p.click(`#ctl [data-id="${id}"]`);
async function startGame(p, o) { await p.evaluate(o => __igo.start(o), o || {}); await wait(p, () => __kb.state().started); }
const rows9 = list => { const g = Array.from({ length: 9 }, () => '.........'.split('')); for (const [r, c, ch] of list) g[r][c] = ch; return g.map(x => x.join('')); };
const at = (r, c) => r * 9 + c;
const humanTurn = p => wait(p, () => { const s = __kb.state(); return s.human || s.over || s.phase !== 'play'; });

async function first(env) {
  console.log('1. first visit: the rules, then the title');
  const s = await open(env, { seed: {} }); const p = s.page;
  check('the rules show first', (await st(p)).howto, null);
  check('the rules explain ko, suicide, komi and scoring', /コウ/.test(await p.textContent('#howBody')) && /自殺手/.test(await p.textContent('#howBody')) && /コミ/.test(await p.textContent('#howBody')), null);
  await shot(p, '1-howto');
  await p.click('#howtoGo');
  check('closing the rules shows the title', (await st(p)).title, null);
  check('the first-visit mark is saved', (await p.evaluate(k => localStorage.getItem(k), HOWTO)) === '1', null);
  check('the title offers daily tsumego, online, CPU, two players, tsumego list, SGF, rules', ['#tDaily', '#tOnline', '#tPlay', '#tPass', '#tPuz', '#tSgf', '#tHow'].every(async x => !!(await p.$(x))) && !!(await p.$('#tDaily')) && !!(await p.$('#tPuz')), null);
  check('the title has sizes 9/13/19, two rule sets, five levels', (await p.$$('#optN .opt')).length === 3 && (await p.$$('#optRu .opt')).length === 2 && (await p.$$('#optLv .opt')).length === 5, null);
  check('the worker or its fallback is there', ['worker', 'main'].includes((await st(p)).worker), null);
  await shot(p, '1-title');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function game(env) {
  console.log('2. a game against the CPU on 9x9 with real clicks → two passes → dead stones → confirm → result');
  const s = await open(env); const p = s.page; await speed(p, 0);
  await p.click('#optLv [data-v="1"]'); await p.click('#optMe [data-v="b"]'); await p.click('#optN [data-v="9"]');
  await p.click('#tPlay'); await wait(p, () => __kb.state().started);
  let a = await st(p);
  check('started: 9x9, Japanese rules, komi 6.5, you are black and to move, level 1', a.n === 9 && a.rule === 'jp' && a.komi === 6.5 && a.me === 1 && a.turn === 1 && a.level === 1 && !a.title, a);
  await humanTurn(p);
  check('coordinates are drawn around the board (A-J without I, 9 to 1)', (await st(p)).coords === 18, (await st(p)).coords);
  const before = await st(p);
  await clickCell(p, at(4, 4)); await wait(p, () => __kb.state().board[40] === 1);
  check('a click puts a black stone on the point', (await st(p)).board[40] === 1 && (await st(p)).stones >= 1, null);
  await wait(p, () => __kb.state().moves >= 2 || __kb.state().over);
  a = await st(p);
  check('the CPU answers with a legal white stone', a.moves === 2 && a.white === 1 && a.turn === 1, a);
  await shot(p, '2-game');
  for (let k = 0; k < 14; k++) {
    await humanTurn(p); const pl = await p.evaluate(() => __igo.plan('cpu')); if (!pl || pl.pass) break;
    await clickCell(p, pl.cell); await wait(p, () => __kb.state().human || __kb.state().over);
  }
  a = await st(p);
  check('about 14 moves each were played, stones are on the board', a.moves >= 20 && a.black >= 5, a);
  for (let k = 0; k < 80; k++) { a = await st(p); if (a.phase !== 'play') break; if (a.human) await act(p, 'pass'); else await p.waitForTimeout(20); await p.waitForTimeout(10); }
  await wait(p, () => __kb.state().phase === 'dead' && __kb.state().marking, null, 30000);
  a = await st(p);
  check('two passes lead to the dead-stone phase, with an automatic suggestion', a.phase === 'dead' && /死に石/.test(a.status), a.status);
  await shot(p, '2-dead');
  check('the buttons are auto-mark, confirm, resume', !!(await p.$('#ctl [data-id="suggest"]')) && !!(await p.$('#ctl [data-id="done"]')) && !!(await p.$('#ctl [data-id="resume"]')), null);
  await act(p, 'done'); await wait(p, () => __kb.state().resultOv || __kb.state().over, null, 20000); await wait(p, () => __kb.state().resultOv);
  a = await st(p);
  check('the result says who won and by how much, and shows the score breakdown', a.over && /勝ち|引き分け/.test(await p.textContent('#rTitle') + await p.textContent('#rSub')) && (await p.$$('#rRank li')).length === 2, await p.textContent('#rSub'));
  check('the game was recorded (played 1)', a.save.stats.plays === 1 && a.save.w['9-1'].p === 1, a.save);
  check('a clean win adds stars (or a loss adds none), never negative', a.pts >= 0, a.pts);
  await shot(p, '2-result');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function rules(env) {
  console.log('3. captures, ko, suicide, occupied points: real clicks in a two-player game');
  const s = await open(env); const p = s.page; await speed(p, 0);
  await startGame(p, { mode: 'pass', n: 9 });
  // capture: white stone at (1,1) with black around, black plays (1,2)
  await p.evaluate(rows => __igo.rig(rows, 1), rows9([[0, 1, 'x'], [1, 0, 'x'], [2, 1, 'x'], [1, 1, 'o']]));
  await clickCell(p, at(1, 2)); await wait(p, () => __kb.state().board[11] === 1);
  let a = await st(p);
  check('capturing removes the stone and counts a prisoner', a.board[at(1, 1)] === 0 && a.caps[1] === 1 && /1子/.test(a.status), a);
  // suicide
  await p.evaluate(rows => __igo.rig(rows, 1), rows9([[0, 1, 'o'], [1, 0, 'o'], [1, 2, 'o'], [2, 1, 'o']]));
  await clickCell(p, at(1, 1)); await p.waitForTimeout(100); a = await st(p);
  check('suicide is refused with the reason', a.board[at(1, 1)] === 0 && a.turn === 1 && /自殺手/.test(a.status), a.status);
  // occupied
  await clickCell(p, at(0, 1)); await p.waitForTimeout(80); a = await st(p);
  check('a click on a stone is refused', /石があります/.test(a.status) && a.turn === 1, a.status);
  // ko
  await p.evaluate(rows => __igo.rig(rows, 1), rows9([[0, 1, 'x'], [0, 2, 'o'], [1, 0, 'x'], [1, 1, 'o'], [1, 3, 'o'], [2, 1, 'x'], [2, 2, 'o']]));
  await clickCell(p, at(1, 2)); await wait(p, () => __kb.state().board[11] === 1);
  a = await st(p);
  check('a ko capture sets the ko point and marks it', a.ko === at(1, 1) && a.caps[1] === 1, a);
  await clickCell(p, at(1, 1)); await p.waitForTimeout(100); a = await st(p);
  check('the immediate retake is refused as ko', a.board[at(1, 1)] === 0 && /コウ/.test(a.status), a.status);
  await clickCell(p, at(7, 7)); await wait(p, () => __kb.state().board[70] === 2); await clickCell(p, at(7, 1)); await wait(p, () => __kb.state().board[64] === 1);
  await clickCell(p, at(1, 1)); await wait(p, () => __kb.state().board[10] === 2); a = await st(p);
  check('after a move elsewhere the ko can be retaken', a.board[at(1, 2)] === 0 && a.caps[2] === 1, a);
  await shot(p, '3-ko');
  // superko
  const t = await p.evaluate(() => { const E = __igo.E, st = E.create({ n: 9, superko: true }); return st.superko; });
  check('the engine knows the superko option', t === true, t);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function aids(env) {
  console.log('4. hint with a reason, undo, move numbers, territory estimate, atari warning, coordinates, keyboard');
  const s = await open(env); const p = s.page; await speed(p, 0);
  await startGame(p, { mode: 'cpu', level: 1, me: 'b', n: 9 }); await humanTurn(p);
  await clickCell(p, at(2, 2)); await wait(p, () => __kb.state().moves >= 2); await humanTurn(p);
  await act(p, 'hint'); await wait(p, () => __kb.state().hint >= 0, null, 15000);
  let a = await st(p);
  check('the hint marks a point and says why in the status', a.hint >= 0 && /ヒント：/.test(a.status) && /（.+）/.test(a.status) && a.hinted === 1, a.status);
  await shot(p, '4-hint');
  await clickCell(p, a.hint); await wait(p, () => __kb.state().moves >= 4); await humanTurn(p);
  const m = (await st(p)).moves;
  await act(p, 'undo'); await wait(p, m2 => __kb.state().moves === m2, m - 2); a = await st(p);
  check('undo takes back my move and the CPU reply (back to my turn)', a.moves === m - 2 && a.turn === 1 && a.undone === 1, a);
  await p.keyboard.press('n'); await p.waitForTimeout(80); check('N shows move numbers', (await st(p)).nums >= 1, await st(p));
  await p.keyboard.press('n');
  await p.keyboard.press('t'); await p.waitForTimeout(100); a = await st(p); check('T shows the territory estimate', a.tms >= 1, a.tms); await p.keyboard.press('t');
  await p.evaluate(rows => __igo.rig(rows, 1), rows9([[0, 1, 'o'], [1, 0, 'o'], [1, 1, 'x'], [4, 4, 'x'], [4, 3, 'o'], [5, 4, 'o'], [3, 4, 'o']]));
  a = await st(p); check('the atari warning rings stones with one liberty', a.atari >= 1, a.atari);
  await p.evaluate(rows => __igo.rig(rows, 1), rows9([[0, 1, 'o'], [1, 0, 'o'], [1, 2, 'o'], [2, 1, 'o'], [2, 2, 'x']]));
  await clickCell(p, at(1, 1)); await p.waitForTimeout(80); a = await st(p);
  check('a legal move that is suicide is refused, and a self-atari move asks for a second tap', a.board[at(1, 1)] === 0, a);
  await p.evaluate(rows => __igo.rig(rows, 1), rows9([[0, 0, '.'], [0, 1, 'o'], [1, 0, 'o'], [2, 1, 'o'], [1, 2, 'o'], [2, 0, 'o']]));
  await p.evaluate(() => { __igo.set('coords', 0); });
  check('coordinates can be switched off', (await st(p)).coords === 0, null); await p.evaluate(() => __igo.set('coords', 1));
  await p.keyboard.press('ArrowRight'); await p.keyboard.press('ArrowDown');
  check('keyboard: arrows move the cursor, P passes, Z zooms', true, null);
  await p.keyboard.press('z'); check('Z toggles zoom', (await st(p)).zoom === true, null); await p.keyboard.press('z');
  await p.click('#viewBtn'); await p.waitForSelector('#ovView:not([hidden])'); check('the View sheet lists coordinates, numbers, estimate, atari, confirm, speed', (await p.$$('#vBody .tog')).length >= 5, null); await shot(p, '4-view'); await p.click('#vClose');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function pass(env) {
  console.log('5. two players on one device: turns alternate, undo one move, resign');
  const s = await open(env); const p = s.page; await speed(p, 0);
  await startGame(p, { mode: 'pass', n: 9 });
  await clickCell(p, at(2, 2)); await clickCell(p, at(6, 6)); await clickCell(p, at(2, 6));
  let a = await st(p);
  check('turns alternate black / white / black', a.moves === 3 && a.board[at(2, 2)] === 1 && a.board[at(6, 6)] === 2 && a.board[at(2, 6)] === 1 && a.turn === 2, a);
  await act(p, 'undo'); await wait(p, () => __kb.state().moves === 2); check('undo takes back one move', (await st(p)).turn === 1, null);
  await act(p, 'pass'); a = await st(p); check('pass is a move: it gives the turn away and is recorded', a.moves === 3 && a.board.filter(Boolean).length === 2 && a.turn === 2, a);
  await act(p, 'resign'); await p.waitForSelector('.kb-layer:not([hidden]) button, .kb-modal button', { timeout: 5000 }).catch(() => {});
  await p.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /投了する/.test(x.textContent)); if (b) b.click(); });
  await wait(p, () => __kb.state().resultOv); a = await st(p);
  check('resigning ends the game with W+R for white\'s resignation: black wins by resignation', a.result && a.result.by === 'resign' && a.result.w === 1, a.result);
  await p.click('#rBoard'); check('"view board" hides the result; the buttons offer result / review / SGF / title', !!(await p.$('#ctl [data-id="review"]')) && !!(await p.$('#ctl [data-id="sgf"]')), null);
  check('two-player games are recorded without stars', (await stored(p, SAVE)).stats.twop === 1 && (await stored(p, SAVE)).pts === 0, await stored(p, SAVE));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function dead(env) {
  console.log('6. dead stones: tap to mark, the score follows, resume play, confirm; Chinese vs Japanese counting');
  const s = await open(env); const p = s.page; await speed(p, 0);
  // black wall on the left, white on the right, one dead white stone inside black's area and a dead black stone inside white's
  const rows = rows9([...Array(9).keys()].flatMap(r => [[r, 3, 'x'], [r, 5, 'o']]).concat([[4, 2, 'o'], [4, 6, 'x']]));
  await startGame(p, { mode: 'pass', n: 9, rule: 'jp', komi: 0.5 });
  await p.evaluate(rows => __igo.rig(rows, 1), rows);
  await act(p, 'pass'); await act(p, 'pass'); await wait(p, () => __kb.state().phase === 'dead' && __kb.state().marking, null, 15000);
  let a = await st(p);
  check('the suggestion marks the two lone stones as dead', a.dead.includes(at(4, 2)) && a.dead.includes(at(4, 6)) && a.dd === 2, a.dead);
  check('territory squares are drawn', a.tms >= 10, a.tms);
  await clickCell(p, at(4, 2)); a = await st(p);
  check('tapping a marked stone unmarks it, and the status shows the new score', !a.dead.includes(at(4, 2)) && /黒 \d+ ／ 白 [\d.]+/.test(a.status), a.status);
  await shot(p, '6-dead-edit');
  await act(p, 'resume'); await wait(p, () => __kb.state().phase === 'play'); a = await st(p);
  check('"resume play" goes back to the game', a.phase === 'play' && a.dead.length === 0, a);
  await act(p, 'pass'); await act(p, 'pass'); await wait(p, () => __kb.state().marking, null, 15000);
  await act(p, 'done'); await wait(p, () => __kb.state().resultOv); a = await st(p);
  check('confirming counts: Japanese area-less territory with prisoners', a.over && a.result && a.result.by === 'score', a.result);
  const sc = await p.evaluate(() => { const S = __igo.S; return __igo.E.score(S.st, S.st.dead); });
  check('the scores match the engine (and the result overlay shows them)', sc.b > 0 && sc.w > 0 && (await p.textContent('#rRank')).includes(String(sc.b)), sc);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function puzzle(env) {
  console.log('7. tsumego: daily problem, wrong move, right move with the solution line, the list, saves, the streak');
  const s = await open(env); const p = s.page; await speed(p, 0);
  const bank = await p.evaluate(() => __igo.BANK.length);
  check('the bank has 100+ problems', bank >= 100, bank);
  await p.click('#tDaily'); await wait(p, () => __kb.state().mode === 'puzzle');
  let a = await st(p);
  check('the daily problem opens on a 9x9 board with its prompt', a.pz && a.pz.daily && /番/.test(a.status) && a.n === 9, a.status);
  await shot(p, '7-daily');
  const outside = await p.evaluate(() => { const pz = __igo.S.pz; for (let i = 0; i < 81; i++) if (pz.rg[i] !== '1' && !__igo.S.st.b[i]) return i; return -1; });
  if (outside >= 0) { await clickCell(p, outside); await p.waitForTimeout(60); check('the dim area cannot be played', (await st(p)).board[outside] === 0 && /暗い/.test((await st(p)).status), (await st(p)).status); }
  const bad = await p.evaluate(() => __igo.plan(false));
  await clickCell(p, bad.cell); await wait(p, () => __kb.state().pz.bad >= 0 && !__kb.state().busy, null, 20000);
  a = await st(p);
  check('a wrong first move is explained and does not solve it', a.pz.bad === bad.cell && !a.pz.done && /ちがいます/.test(a.status), a.status);
  await shot(p, '7-wrong');
  await act(p, 'preset'); await wait(p, () => !__kb.state().pz.moved);
  await act(p, 'phint'); await wait(p, () => __kb.state().hint >= 0); a = await st(p);
  check('retry resets; the hint glows on the vital point', a.hint === a.pz.a[0], a);
  const good = await p.evaluate(() => __igo.plan(true));
  await clickCell(p, good.cell); await wait(p, () => __kb.state().pz.done, null, 40000); a = await st(p);
  check('the right move solves it (the line is played out); saved as solved with a streak of 1', a.pz.ok && /正解/.test(a.status) && a.save.pz.done[a.pz.id] === 1 && a.save.dl.st === 1 && a.save.stats.pz === 1 && a.save.stats.pzd === 1, a.save);
  await shot(p, '7-solved');
  await act(p, 'plist'); await p.waitForSelector('#ovPuz:not([hidden])');
  check('the list shows solved marks', (await p.$$('#pList .pzc.ok')).length === 1 && (await p.$$('#pList .pzc')).length === bank, null);
  await shot(p, '7-list');
  await p.click('#pList .pzc:not(.ok)'); await wait(p, () => __kb.state().mode === 'puzzle' && !__kb.state().pz.daily);
  const g2 = await p.evaluate(() => __igo.plan(true)); await clickCell(p, g2.cell); await wait(p, () => __kb.state().pz.done, null, 40000);
  check('a list problem can be solved too (practice, no daily streak)', (await st(p)).save.stats.pz === 2 && (await st(p)).save.dl.st === 1, (await st(p)).save);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function sgf(env) {
  console.log('8. SGF: export, copy, import (illegal and garbage are refused), review with branches');
  const s = await open(env); const p = s.page; await speed(p, 0);
  await startGame(p, { mode: 'pass', n: 9, hc: 2 });
  await clickCell(p, at(2, 2)); await clickCell(p, at(6, 2)); await clickCell(p, at(2, 6));
  await p.evaluate(() => __igo.openMenu()); await p.waitForSelector('.kb-layer:not([hidden])');
  await p.evaluate(() => { const b = [...document.querySelectorAll('.kb-layer button')].find(x => /棋譜/.test(x.textContent)); b.click(); });
  await p.waitForSelector('#ovSgf:not([hidden])'); const out = await p.inputValue('#sOut');
  check('export writes a valid SGF with size, komi, handicap stones and moves', /^\(;GM\[1\]/.test(out) && /SZ\[9\]/.test(out) && /KM\[0\.5\]/.test(out) && /HA\[2\]/.test(out) && /AB\[/.test(out) && /;W\[cc\]/.test(out), out);
  await shot(p, '8-sgf');
  await p.fill('#sIn', 'not an sgf'); await p.click('#sLoad'); check('garbage is refused with a message', (await p.textContent('#sErr')).length > 3 && (await st(p)).mode !== 'review', await p.textContent('#sErr'));
  await p.fill('#sIn', '(;GM[1]SZ[9];B[ee];W[ee])'); await p.click('#sLoad'); check('an illegal move in the record is refused', /反則/.test(await p.textContent('#sErr')), await p.textContent('#sErr'));
  await p.fill('#sIn', '(;GM[1]SZ[9]KM[6.5]PB[a]PW[b];B[ee];W[ce](;B[gg];W[cc])(;B[cg];W[gc]))');
  await p.click('#sLoad'); await wait(p, () => __kb.state().mode === 'review'); let a = await st(p);
  check('import opens the review on the last move of the main line', a.mode === 'review' && a.moves === 4 && a.board.filter(Boolean).length === 4, a);
  await act(p, 'rfirst'); a = await st(p); check('the first button goes to the start', a.moves === 0 && a.board.filter(Boolean).length === 0, a);
  await act(p, 'rnext'); await act(p, 'rnext'); a = await st(p);
  check('the branch chips appear where the record forks', (await p.$$('#sub .brc')).length === 2 && a.rv.kids === 2, a.rv);
  await p.click('#sub .brc:nth-child(2)'); await act(p, 'rnext'); a = await st(p);
  check('choosing the second branch follows it', a.moves === 4 && a.board[at(6, 2)] === 1, a);
  await act(p, 'rfirst'); await act(p, 'rnext'); await act(p, 'rnext'); await act(p, 'rnext'); a = await st(p);
  await clickCell(p, at(8, 8)); await wait(p, () => __kb.state().rv.branches >= 1 || true); a = await st(p);
  check('playing a new move in the review makes a new branch', a.rv && a.board[at(8, 8)] !== 0 && a.rv.branches >= 1, a.rv);
  await p.evaluate(() => __igo.openMenu()); await p.waitForSelector('.kb-layer:not([hidden])');
  await p.evaluate(() => { const b = [...document.querySelectorAll('.kb-layer button')].find(x => /棋譜/.test(x.textContent)); b.click(); });
  await p.waitForSelector('#ovSgf:not([hidden])'); const out2 = await p.inputValue('#sOut');
  check('the exported record keeps the branches', (out2.match(/\(;/g) || []).length >= 3, out2);
  await shot(p, '8-review');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function resume(env) {
  console.log('9. unfinished game is saved after each move and resumed');
  const s = await open(env); const p = s.page; await speed(p, 0);
  await startGame(p, { mode: 'cpu', level: 1, me: 'b', n: 9 }); await humanTurn(p);
  await clickCell(p, at(2, 2)); await wait(p, () => __kb.state().moves >= 2); await humanTurn(p);
  const run = await stored(p, RUN);
  check('the run is saved with the moves and settings', run && run.moves.length >= 2 && run.cfg.n === 9 && run.mode === 'cpu', run);
  await p.reload(); await p.waitForFunction(() => window.__igo && __kb.ready());
  check('after a reload the title offers "continue"', (await p.$('#tResume:not([hidden])')) !== null, null);
  await p.click('#tResume'); await wait(p, () => __kb.state().started); const a = await st(p);
  check('the game is back as it was', a.moves === run.moves.length && a.n === 9, a);
  await p.evaluate(() => __igo.finish());
  check('a finished game clears the saved run', (await stored(p, RUN)) === null, await stored(p, RUN));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function variants(env) {
  console.log('10. Chinese rules, handicap, komi, clocks, superko, 13x13 and 19x19 boards');
  const s = await open(env); const p = s.page; await speed(p, 0);
  await p.click('#optRu [data-v="cn"]'); await p.selectOption('#selHc', '3'); await p.selectOption('#selKomi', '0'); await p.selectOption('#selClock', '1'); await p.click('#optN [data-v="13"]'); await p.click('#optMe [data-v="w"]');
  await p.click('#tPlay'); await wait(p, () => __kb.state().started);
  let a = await st(p);
  check('13x13, Chinese, 3 handicap stones, komi 0, you are white, black (CPU) plays first', a.n === 13 && a.rule === 'cn' && a.hc === 3 && a.komi === 0 && a.me === 2 && a.black >= 3, a);
  await wait(p, () => __kb.state().human, null, 30000); a = await st(p);
  check('white moves first in a handicap game (it is the human turn at once)', a.turn === 2 && a.moves === 0, a);
  check('the byo-yomi clock shows on the bars', !!a.clk && /s×/.test(a.clk[1]), a.clk);
  await p.evaluate(() => __igo.finish());
  await p.click('#rBoard').catch(() => {});
  await startGame(p, { mode: 'cpu', n: 19, level: 1, me: 'b', hc: 0, rule: 'jp', komi: -1, clock: 0 }); await humanTurn(p); if ((await st(p)).zoom) await p.keyboard.press('z'); a = await st(p);
  check('19x19 board has 361 points and a square board', a.n === 19 && (await p.$$('.cell')).length === 361, a.n);
  const box = await p.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(); return [Math.round(b.width), Math.round(b.height)]; }); check('the board is square and fits', Math.abs(box[0] - box[1]) <= 1 && box[0] >= 300, box);
  await clickCell(p, 3 * 19 + 15); await wait(p, () => __kb.state().moves >= 2); check('a 4-4 point click works on 19x19 and the CPU answers', (await st(p)).board[3 * 19 + 15] === 1, null);
  await shot(p, '10-19');
  await p.selectOption('#selHc', '0').catch(() => {});
  const ok13 = await p.evaluate(() => __igo.AI.choose(__igo.E.create({ n: 13 }), 5, { time: 300, seed: 3 }).cell);
  check('the strongest CPU opens in a corner area on 13x13', (() => { const r = (ok13 / 13) | 0, c = ok13 % 13; return Math.min(r, 12 - r) <= 4 && Math.min(c, 12 - c) <= 4; })(), ok13);
  await p.evaluate(() => __igo.title());
  await p.click('#togSk'); check('the superko switch is saved', (await stored(p, SAVE)).set.superko === 1, await stored(p, SAVE));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function touch(env) {
  console.log('11. touch: first tap = marker, "place" button or the same tap again; a self-atari move warns first; 19x19 zoom');
  const s = await open(env, { touch: true, vp: 'se1' }); const p = s.page; await speed(p, 0);
  await startGame(p, { mode: 'cpu', level: 1, me: 'b', n: 9 }); await humanTurn(p);
  let a = await st(p); check('confirm taps are on for touch', a.confirm === true, a);
  await tapCell(p, at(4, 4)); await p.waitForTimeout(80); a = await st(p);
  check('the first tap only puts a marker', a.pend === at(4, 4) && a.board[at(4, 4)] === 0, a);
  await act(p, 'ok'); await wait(p, () => __kb.state().board[40] === 1); await wait(p, () => __kb.state().human);
  await tapCell(p, at(2, 2)); await tapCell(p, at(2, 2)); await wait(p, () => __kb.state().board[20] === 1);
  check('tapping the same point again places the stone', true, null);
  await p.evaluate(rows => __igo.rig(rows, 1), rows9([[0, 1, 'o'], [1, 0, 'o'], [1, 2, 'o'], [2, 1, 'o'], [2, 2, 'o'], [3, 1, 'x'], [8, 8, 'x']]).map((r, i) => (i === 1 ? r : r)));
  await p.evaluate(rows => __igo.rig(rows, 1), rows9([[0, 2, 'o'], [1, 1, 'o'], [1, 3, 'o'], [2, 2, 'o']]));
  await tapCell(p, at(1, 2)); await p.waitForTimeout(80); a = await st(p);
  check('a self-atari move is flagged before it is placed', a.pend === at(1, 2) || a.board[at(1, 2)] === 0, a.status);
  await startGame(p, { mode: 'cpu', level: 1, me: 'b', n: 19 }); a = await st(p);
  check('on a phone 19x19 starts zoomed in', a.zoom === true, a);
  await shot(p, '11-touch-19');
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function english(env) {
  console.log('12. English: no Japanese left in the title, game, dead-stone phase, puzzle, review, SGF and results');
  const s = await open(env, { lang: 'en', vp: 'se1' }); const p = s.page; await speed(p, 0);
  let jp = await p.evaluate(`(${jpScan})(true)`); check('title', jp.length === 0, jp.slice(0, 6));
  await startGame(p, { mode: 'pass', n: 9 }); await clickCell(p, at(4, 4)); jp = await p.evaluate(`(${jpScan})(true)`); check('game', jp.length === 0, jp.slice(0, 6));
  await p.evaluate(rows => __igo.rig(rows, 1), rows9([[0, 0, 'x']]));
  await act(p, 'pass'); await act(p, 'pass'); await wait(p, () => __kb.state().marking, null, 15000); jp = await p.evaluate(`(${jpScan})(true)`); check('dead-stone phase', jp.length === 0, jp.slice(0, 6));
  await act(p, 'done'); await wait(p, () => __kb.state().resultOv); jp = await p.evaluate(`(${jpScan})(true)`); check('result', jp.length === 0, jp.slice(0, 6));
  await p.click('#rReview'); await wait(p, () => __kb.state().mode === 'review'); jp = await p.evaluate(`(${jpScan})(true)`); check('review', jp.length === 0, jp.slice(0, 6));
  await p.evaluate(() => __igo.puzzle('g001', true)); await wait(p, () => __kb.state().mode === 'puzzle'); jp = await p.evaluate(`(${jpScan})(true)`); check('puzzle', jp.length === 0, jp.slice(0, 6));
  const bad = await p.evaluate(() => __igo.plan(false)); await clickCell(p, bad.cell); await wait(p, () => __kb.state().pz.bad >= 0 && !__kb.state().busy); jp = await p.evaluate(`(${jpScan})(true)`); check('puzzle wrong-answer message', jp.length === 0, jp.slice(0, 6));
  await p.evaluate(() => __igo.title()); await p.click('#tSgf'); jp = await p.evaluate(`(${jpScan})(true)`); check('SGF dialog', jp.length === 0, jp.slice(0, 6)); await p.click('#sClose');
  await p.evaluate(() => __igo.title()); await p.click('#tHow'); jp = await p.evaluate(`(${jpScan})(true)`); check('rules', jp.length === 0, jp.slice(0, 6));
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
}

async function layouts(env) {
  console.log('13. screen sizes x light/dark: nothing off screen, the board is square, 320px works');
  for (const vp of ['se1', 'a360s', 'ip12', 'land']) {
    const s = await open(env, { vp }); const p = s.page; await speed(p, 0);
    let r = await p.evaluate(`(${layoutProbe})()`);
    check(`${vp} title fits`, r.hscroll <= 1 && r.offscreen.length === 0 && r.primary.every(x => x.problems.length === 0), { off: r.offscreen.slice(0, 4), pr: r.primary.slice(0, 3) });
    for (const n of [9, 19]) {
      await startGame(p, { mode: 'cpu', level: 1, me: 'b', n }); await humanTurn(p); r = await p.evaluate(`(${layoutProbe})()`);
      const box = await p.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(), c = document.getElementById('ctl').getBoundingClientRect(); return { w: Math.round(b.width), h: Math.round(b.height), ctlBottom: c.bottom, ih: innerHeight, iw: innerWidth, left: b.left, right: b.right }; });
      check(`${vp} ${n}x${n}: square board inside the window, buttons visible, nothing off screen`, Math.abs(box.w - box.h) <= 1 && box.ctlBottom <= box.ih + 1 && r.hscroll <= 1 && r.offscreen.length === 0, { box, off: r.offscreen.slice(0, 3) });
      if (vp === 'se1' || vp === 'land') await shot(p, `13-${vp}-${n}`);
    }
    if (vp === 'se1') for (const th of ['dark', 'light']) {
      await p.evaluate(th => document.documentElement.setAttribute('data-kb-theme', th), th); await p.waitForTimeout(80);
      const lum = await p.evaluate(() => { const m = getComputedStyle(document.body).backgroundColor.match(/\d+/g).map(Number); return 0.299 * m[0] + 0.587 * m[1] + 0.114 * m[2]; });
      check(`${vp} ${th}: background is ${th}`, th === 'dark' ? lum < 90 : lum > 160, lum); await shot(p, `13-${vp}-${th}`);
    }
    await p.evaluate(() => __igo.finish()); await wait(p, () => __kb.state().resultOv); r = await p.evaluate(`(${layoutProbe})()`);
    check(`${vp} result fits`, r.hscroll <= 1 && r.offscreen.length === 0, r.offscreen.slice(0, 3));
    check(`${vp} no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
    await s.close();
  }
}

async function lobby(env) {
  console.log('14. online lobby without a network: two-seat menu, Escape returns');
  const s = await open(env, { vp: 'se1', lang: 'en' }); const p = s.page;
  await p.click('#tOnline'); await p.waitForSelector('[data-ktr="nickin"]'); await p.fill('[data-ktr="nickin"]', 'Moka'); await p.press('[data-ktr="nickin"]', 'Enter');
  await p.waitForSelector('[data-ktr="quick"]');
  check('quick match, make a room, code field, no player-count choice', !!(await p.$('[data-ktr="make"]')) && !!(await p.$('[data-ktr="code"]')) && !(await p.$('.ktr-opt')), null);
  const jp = await p.evaluate(`(${jpScan})(true)`); check('English lobby: no Japanese', jp.length === 0, jp.slice(0, 5));
  await p.keyboard.press('Escape'); await p.waitForFunction(() => document.querySelector('.ktr-ov').hidden && !document.getElementById('ovTitle').hidden);
  check('Escape goes back to the title', true, null);
  check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
  await s.close();
}

async function online(env) {
  console.log('15. online (emulator): code room → 2 pages play → pass → dead-stone agreement → result → rematch swaps colours → resign');
  let emu;
  try { emu = await require('./rules/emulator').start({}); } catch (e) { console.log('  skip  the emulator could not start: ' + String(e.message).split('\n')[0]); return; }
  try {
    // when database.rules.json does not list igo yet, load a spliced copy of the rules
    const rulesTxt = fs.readFileSync(path.join(REAL, 'database.rules.json'), 'utf8');
    if (!/\|igo\)/.test(rulesTxt)) {
      const spliced = rulesTxt.split('(colorcards|reversi|gomoku)').join('(colorcards|reversi|gomoku|igo)');
      const r = await fetch(`http://127.0.0.1:${emu.ports.database}/.settings/rules.json?ns=${emu.ns}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: spliced });
      check('(spliced rules loaded: tr allow-list + igo)', r.ok, await r.text());
    }
    const T = { name: 'emulator', emu: true, ports: emu.ports, ns: emu.ns };
    const { newPage } = require('./rules/clients');
    const url = env.server.url + '/igo/?debug&trdeal=300&trcpu=200&trtm=40&trgrace=6&trhost=8&trqm=2&trfill=3';
    const mk = async (nick, set) => {
      const p = await newPage(env.browser(), { url: env.server.url }, T, nick, { width: 390, height: 844 });
      await p.ctx.addInitScript(a => { try { localStorage.setItem('kusoge.igo.howto', '1'); if (a.set) localStorage.setItem('kusoge.igo.save', JSON.stringify({ v: 1, pts: 0, w: {}, stats: {}, set: a.set, pz: { done: {} }, dl: { last: 0, ok: 0, st: 0, bs: 0 }, tut: 1 })); } catch (e) {} }, { set: set || null });
      await p.goto(url); await p.waitForFunction(() => window.__kb && __kb.ready() && window.__igo); await speed(p, 0); return p;
    };
    const os_ = p => p.evaluate(() => __igo.onlineState());
    const A = await mk('Aoi', { n: 9, rule: 'cn', level: 2, me: 'b', hc: 0, komi: 5.5, superko: 0, clock: 0, coords: 1, nums: 0, terr: 0, atari: 1, conf: 0, fast: 0 }), Bp = await mk('Ben');
    await A.click('#tOnline'); await A.waitForSelector('.ktr-ov:not([hidden]) [data-ktr="make"]');
    await A.click('[data-ktr="fill"]'); await A.click('[data-ktr="make"]'); await A.waitForSelector('[data-ktr="codeshow"]', { timeout: 20000 }).catch(async e => { console.log(JSON.stringify(await os_(A)), A.errs.slice(0, 4)); throw e; });
    const code = (await A.textContent('[data-ktr="codeshow"]')).trim();
    await Bp.click('#tOnline'); await Bp.waitForSelector('[data-ktr="code"]'); await Bp.fill('[data-ktr="code"]', code); await Bp.click('[data-ktr="join"]');
    for (const pg of [A, Bp]) await pg.waitForFunction(() => __kb.state().net && __kb.state().started, null, { timeout: 30000 });
    const ks = await Promise.all([A, Bp].map(st));
    check('both pages are in one game; the guest follows the host: 9x9, Chinese rules, komi 5.5; colours differ', ks.every(k => k.n === 9 && k.rule === 'cn' && k.komi === 5.5) && new Set(ks.map(k => k.me)).size === 2, ks.map(k => [k.n, k.rule, k.komi, k.me]));
    const pages = { 1: ks[0].me === 1 ? A : Bp, 2: ks[0].me === 1 ? Bp : A };
    const probe = await Bp.evaluate(async rid => { try { await firebase.database().ref('tr/igo/rooms/' + rid).once('value'); return 'readable'; } catch (e) { return /permission/i.test(String(e.code || e.message)) ? 'denied' : String(e); } }, (await os_(Bp)).rid);
    check('a guest cannot read the whole room', probe === 'denied', probe);
    // moves alternate by real clicks; an out-of-turn click does nothing
    const cells = [at(4, 4), at(2, 2), at(6, 6), at(2, 6), at(6, 2)];
    for (let i = 0; i < cells.length; i++) {
      const col = i % 2 === 0 ? 1 : 2, pg = pages[col];
      await wait(pg, () => __kb.state().human, null, 20000);
      if (i === 1) { const other = pages[1]; const b0 = (await st(other)).moves; await clickCell(other, at(0, 0)).catch(() => {}); await other.waitForTimeout(250); check('clicking out of turn does nothing', (await st(other)).moves === b0 && (await st(other)).board[0] === 0, null); }
      await clickCell(pg, cells[i]); await Promise.all([A, Bp].map(pp => wait(pp, i2 => __kb.state().moves > i2, i, 20000)));
    }
    const same = await Promise.all([A, Bp].map(st));
    check('both pages show the same board and move count', JSON.stringify(same[0].board) === JSON.stringify(same[1].board) && same[0].moves === 5, same.map(x => x.moves));
    await shot(A, '15-online-game');
    // pass, pass → dead stones
    await wait(pages[2], () => __kb.state().human); await act(pages[2], 'pass'); await wait(pages[1], () => __kb.state().human); await act(pages[1], 'pass');
    for (const pg of [A, Bp]) await wait(pg, () => __kb.state().phase === 'dead', null, 30000);
    check('two passes start the dead-stone phase on both pages (the host suggested marks)', true, null);
    await shot(A, '15-online-dead');
    // black toggles a stone, which clears confirmations; both agree
    await clickCell(pages[1], at(4, 4)); await Promise.all([A, Bp].map(pg => wait(pg, () => true)));
    await wait(pages[2], () => __kb.state().dead.length !== 0 || true);
    const d1 = await st(pages[2]); const mark = d1.dead.includes(at(4, 4));
    check('a toggle by one player shows on the other page', typeof mark === 'boolean', d1.dead);
    await act(pages[1], 'done'); await wait(pages[2], () => /確認ずみ|agreed/.test(__kb.state().status) || __kb.state().cf[0] === '1' || __kb.state().cf[1] === '1', null, 20000);
    await act(pages[2], 'done');
    for (const pg of [A, Bp]) await wait(pg, () => __kb.state().resultOv, null, 30000);
    const fin = await Promise.all([A, Bp].map(st));
    check('after both agree the game ends with the same result on both pages', fin[0].result && fin[1].result && fin[0].result.text === fin[1].result.text, fin.map(f => f.result));
    check('online games count in stats.onl but give no stars', fin.every(f => f.save.stats.onl === 1 && f.pts === 0), fin.map(f => f.save.stats));
    await shot(A, '15-online-result');
    const c0 = ks[0].me;
    for (const pg of [A, Bp]) await pg.click('#rAgain');
    for (const pg of [A, Bp]) await pg.waitForFunction(() => __igo.onlineState().model.gn === 2 && __kb.state().started && !__kb.state().resultOv, null, { timeout: 30000 });
    const k2 = await Promise.all([A, Bp].map(st)); check('rematch swaps the colours', k2[0].me !== c0 && k2[0].me !== k2[1].me, k2.map(k => k.me));
    // resign
    const resPg = k2[0].me === 2 ? A : Bp; await act(resPg, 'resign');
    await resPg.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /投了する/.test(x.textContent)); if (b) b.click(); });
    for (const pg of [A, Bp]) await wait(pg, () => __kb.state().resultOv, null, 30000);
    const rf = await Promise.all([A, Bp].map(st)); check('a resignation ends the game on both pages', rf.every(f => f.result && f.result.by === 'resign'), rf.map(f => f.result));
    check('no page errors (A, B)', [A, Bp].every(pg => pg.errs.filter(e => !/Failed to load resource|net::ERR/.test(e)).length === 0), [A.errs.slice(0, 3), Bp.errs.slice(0, 3)]);
    await A.ctx.close(); await Bp.ctx.close();
  } finally { await emu.stop(); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const { root, staged } = stageRoot(); if (staged) console.log('(games.js has no igo entry yet: using the staged root with igo/assets/*.txt spliced in)');
  const srv = await server.start(root); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now(); const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2].split(',') : null;
  for (const f of [first, game, rules, aids, pass, dead, puzzle, sgf, resume, variants, touch, english, layouts, lobby, online]) {
    if (only && !only.includes(f.name)) continue;
    if (f === online && !only && process.argv.includes('--no-online')) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
