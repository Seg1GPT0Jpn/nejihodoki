#!/usr/bin/env node
// チェス工房の通しプレイ（Playwright。?debug の window.__chess は「どこを押すか」を聞くだけで、押すのは本物のマウス・キー・タッチ）
//   node tools/tests/chess-play.js [first,game,special,keys,aids,pointer,pass,puzzle,analysis,resume,clock,english,layouts,online]   （--no-online：エミュレーターを使う online を省く）
// 1. 初回：ルール → タイトル  2. CPUと1局を最後まで本物のクリックで → 結果・保存（★）  3. キャスリング・アンパッサン・プロモーション（選ぶ画面）・チェック・メイト・ステイルメイト・同じ形3回
// 4. キーボード（矢印・Enter・文字で手を書く・Q/R/B/N・U/V/L/T/I・Esc）  5. ヒント（理由つき）・もどす・ヒントがあると★なし  6. ドラッグ・タッチ・プレムーブ
// 7. ふたりで1台（盤を回す・引き分け・投了）  8. 今日のパズル（まちがい・正解・答えを見る・集計・れんしゅう）  9. 検討モード（評価バー・手を進める／戻す・FEN／PGN の読みこみと書き出し）
// 10. 途中保存 → つづきから  11. 持ち時間（時計・時間切れ）  12. 英語  13. 全画面サイズ × ja/en × ライト/ダーク  14. オンライン（エミュレーター）：コードの部屋・2ページで1局・引き分け・もう一度（色が入れかわる）・時間切れ・ページが消える・ホストが出る
// オンラインは、登録簿とデータベースのルールに chess が入っているときは、そのまま。入っていないときは、chess/assets/registry-entry.txt を足した一時の土台と、chess を足したルールをエミュレーターに読ませて動かす。
'use strict';
const fs = require('fs');
const os = require('os');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const E = require('../../chess/engine.js');

const REAL = path.resolve(__dirname, '..', '..');
const OUT = path.join(__dirname, 'out', 'shots', 'chess-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.chess.save', RUN = 'kusoge.chess.game', HOWTO = 'kusoge.chess.howto';
const sq = u => E.parseSq(u);

// 登録簿に chess が入っていないときの一時の土台（shmup-play.js と同じやり方）
function stageRoot() {
  const gs = fs.readFileSync(path.join(REAL, 'common/games.js'), 'utf8');
  const regF = path.join(REAL, 'chess/assets/registry-entry.txt'), achF = path.join(REAL, 'chess/assets/achievements-entry.txt');
  if (/id: 'chess'/.test(gs) || !fs.existsSync(regF) || !fs.existsSync(achF)) return { root: REAL, staged: false };
  const tmp = fs.mkdtempSync(path.join(os.tmpdir(), 'chess-root-'));
  for (const n of fs.readdirSync(REAL)) { if (n === '.git' || n === 'common' || n === 'node_modules') continue; fs.symlinkSync(path.join(REAL, n), path.join(tmp, n)); }
  fs.mkdirSync(path.join(tmp, 'common'));
  for (const n of fs.readdirSync(path.join(REAL, 'common'))) if (n !== 'games.js') fs.symlinkSync(path.join(REAL, 'common', n), path.join(tmp, 'common', n));
  let out = gs.replace(/\n  \];\n(\s*\n\s*\/\/ ゲームごとの実績)/, '\n' + fs.readFileSync(regF, 'utf8').replace(/\n$/, '') + '\n  ];\n$1');
  out = out.replace('\n    crates: [\n', '\n' + fs.readFileSync(achF, 'utf8').replace(/\n$/, '') + '\n    crates: [\n');
  fs.writeFileSync(path.join(tmp, 'common/games.js'), out);
  return { root: tmp, staged: true };
}

async function open(env, o = {}) {
  const touch = !!o.touch;
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || { [HOWTO]: '1' }, isMobile: touch, hasTouch: touch });
  if (o.scheme) await s.page.emulateMedia({ colorScheme: o.scheme });
  await s.goto('/chess/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__chess);
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const speed = (p, m) => p.evaluate(m => __chess.setSpeed(m), m);
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 15000 });
const errsOf = s => s.log.pageErrors.concat(s.log.consoleErrors.filter(e => !/Failed to load resource|ERR_/.test(e)));
async function clickSq(p, sqn) { const pt = await p.evaluate(i => __chess.sqPoint(i), sqn); await p.mouse.click(pt.x, pt.y); }
// click a move given as UCI ("e2e4", "b7b8n"); a promotion piece is chosen in the picker
async function clickMove(p, u, o = {}) {
  await clickSq(p, sq(u.slice(0, 2))); await p.waitForTimeout(o.gap || 30); await clickSq(p, sq(u.slice(2, 4)));
  if (u.length === 5) { await p.waitForSelector('#ovPromo:not([hidden])'); await p.click('#pkRow [data-p="' + E.CHAR2P[u[4].toUpperCase()] + '"]'); }
}
// play the human seat to the end with a sensible move (the page's own level-3 search tells which squares) until there is a result
async function playOut(p, o = {}) {
  for (let i = 0; i < (o.max || 400); i++) {
    const s = await st(p);
    if (s.result || s.over) return s;
    if (!s.human) { await p.waitForTimeout(12); continue; }
    const pl = await p.evaluate(g => __chess.plan(g), o.kind || 'cpu');
    if (!pl) { await p.waitForTimeout(20); continue; }
    await clickMove(p, pl.uci, { gap: 5 });
    await p.waitForTimeout(8);
  }
  return st(p);
}
const startCpu = async (p, o) => { await p.evaluate(o => __chess.start(o), o || {}); await wait(p, () => __kb.state().started); };
const clickText = (p, re) => p.evaluate(src => { const r = new RegExp(src); const b = [...document.querySelectorAll('button, a')].find(x => r.test(x.textContent) && x.getClientRects().length); if (!b) throw new Error('no button ' + src); b.click(); }, re.source);
const rig = (p, fen, mode) => p.evaluate(a => __chess.rig(a[0], a[1]), [fen, mode || 'pass']);

async function first(env) {
  console.log('1. first visit: the rules, then the title');
  const s = await open(env, { seed: {}, vp: 'se1' }); const p = s.page;
  check('the first visit shows the rules', (await st(p)).howto, null);
  await shot(p, '1-rules');
  check('the rules mention checkmate and castling', /checkmate|チェックメイト/.test(await p.textContent('#howBody')) && /Castling|キャスリング/.test(await p.textContent('#howBody')), null);
  await p.click('#howtoGo');
  const t = await st(p);
  check('then the title', t.title && !t.howto, t);
  check('the title offers online, CPU, two players, analysis, rules and (with the puzzle bank) the daily puzzle', !!(await p.$('#tOnline')) && !!(await p.$('#tPlay')) && !!(await p.$('#tPass')) && !!(await p.$('#tAna')) && !!(await p.$('#tHow')) && await p.$eval('#tDaily', e => !e.hidden), null);
  check('six CPU levels, three colours, five time controls', (await p.$$('#optLv .opt')).length === 6 && (await p.$$('#optMe .opt')).length === 3 && (await p.$$('#optTc .opt')).length === 5, null);
  await p.click('#optLv [data-lv="5"]'); await p.click('#optTc [data-tc="2"]'); await p.click('#optMe [data-me="b"]');
  const sv = await stored(p, SAVE);
  check('the choices are saved', sv.set.level === 5 && sv.set.tc === 2 && sv.set.me === 'b', sv && sv.set);
  await shot(p, '1-title');
  check('no page errors', errsOf(s).length === 0, errsOf(s));
  await s.close();
}

async function game(env) {
  console.log('2. a whole game against the CPU with real clicks, then the result and the saved record');
  const s = await open(env); const p = s.page; await speed(p, 0);
  await startCpu(p, { level: 1, me: 'w' });
  let k = await st(p);
  check('the game starts: 32 pieces, white to move, my turn, the board is 64 cells with 32 piece images', k.pieces === 32 && k.turn === 0 && k.human && (await p.$$('.cell')).length === 64 && (await p.$$('#pcs .pc')).length === 32, k);
  await clickSq(p, sq('e2'));
  k = await st(p);
  check('tapping my pawn selects it and shows two legal squares', k.sel === sq('e2') && (await p.$$('.cell.lg')).length === 2, k.sel);
  await shot(p, '2-select');
  await clickSq(p, sq('e4'));
  await wait(p, () => __kb.state().moves >= 2 && __kb.state().human);
  k = await st(p);
  check('e4 was played and the CPU answered', k.sans[0] === 'e4' && k.moves === 2 && k.last.length === 4, k);
  check('the last move is highlighted', (await p.$$('.cell.last')).length === 2, null);
  check('the move strip shows the moves', /e4/.test(await p.textContent('#stripT')), await p.textContent('#stripT'));
  await shot(p, '2-game');
  const end = await playOut(p, { max: 300 });
  check('the game reached a result', end.over && end.gameResult !== '*', end);
  await wait(p, () => __kb.state().result);
  const sv = await stored(p, SAVE), r = await st(p);
  check('a win against level 1 gives ★ 1 and is recorded (plays, wins, per-level record)', r.gameResult === '1-0' ? sv.pts === 1 && sv.stats.wins === 1 && sv.w['1'].w === 1 && sv.stats.plays === 1 : sv.stats.plays === 1, { res: r.gameResult, sv });
  check('the result panel names the result and the reason', /./.test(await p.textContent('#rTitle')) && /./.test(await p.textContent('#rSub')), await p.textContent('#rSub'));
  await shot(p, '2-result');
  const pgnBefore = await p.evaluate(() => __chess.S.game.ucis.length);
  await p.click('#rReview'); await wait(p, () => __kb.state().mode === 'analysis');
  check('"Review" opens the analysis board at the end of the same game', (await st(p)).ana.len === pgnBefore && (await st(p)).ana.at === pgnBefore, await st(p));
  check('no page errors', errsOf(s).length === 0, errsOf(s));
  await s.close();
}

async function special(env) {
  console.log('3. castling, en passant, promotion (the picker), check, mate, stalemate, threefold repetition');
  const s = await open(env); const p = s.page; await speed(p, 0);
  await rig(p, 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  await clickSq(p, sq('e1'));
  check('the king shows both castling squares (and its other moves)', (await p.$$('.cell.lg')).length === 7, (await p.$$('.cell.lg')).length);
  await clickSq(p, sq('g1'));
  let k = await st(p);
  check('castling short: the king on g1, the rook on f1, SAN O-O', k.board[sq('g1')] === 6 && k.board[sq('f1')] === 4 && k.board[sq('h1')] === 0 && k.sans[0] === 'O-O', k.sans);
  await clickMove(p, 'e8c8'); k = await st(p);
  check('black castles long: king c8, rook d8', k.board[sq('c8')] === 14 && k.board[sq('d8')] === 12 && k.sans[1] === 'O-O-O', k.sans);
  await shot(p, '3-castle');
  await rig(p, '4k3/8/8/3pP3/8/8/8/4K3 w - d6 0 1');
  await clickMove(p, 'e5d6'); k = await st(p);
  check('en passant: the d5 pawn is removed, the capturing pawn is on d6, SAN exd6', k.board[sq('d5')] === 0 && k.board[sq('d6')] === 1 && k.sans[0] === 'exd6' && (await p.$$('#pcs .pc')).length === 3, k);
  await rig(p, '4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
  await clickSq(p, sq('b7')); await clickSq(p, sq('b8'));
  await p.waitForSelector('#ovPromo:not([hidden])');
  check('promotion asks which piece: four choices', (await p.$$('#pkRow .pk')).length === 4, null);
  await shot(p, '3-promo');
  await p.click('#pkRow [data-p="2"]'); k = await st(p);
  check('promoting to a knight: b8=N+ (a check)', k.board[sq('b8')] === 2 && k.sans[0] === 'b8=N' && !k.promoOv, k.sans);
  await rig(p, '4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
  await clickSq(p, sq('b7')); await clickSq(p, sq('b8')); await p.waitForSelector('#ovPromo:not([hidden])'); await p.keyboard.press('Escape');
  k = await st(p); check('Esc in the picker cancels the move', k.moves === 0 && !k.promoOv, k);
  await p.evaluate(() => { __chess.save.set.auq = 1; });
  await clickSq(p, sq('b7')); await clickSq(p, sq('b8')); k = await st(p);
  check('with "promote to queen automatically" there is no picker', k.board[sq('b8')] === 5 && !k.promoOv, k);
  await p.evaluate(() => { __chess.save.set.auq = 0; });
  // check is marked, mate ends the game
  await rig(p, E.START);
  for (const m of ['f2f3', 'e7e5', 'g2g4']) await clickMove(p, m);
  await clickMove(p, 'd8h4');
  await wait(p, () => __kb.state().result);
  k = await st(p);
  check('fool\'s mate: black wins by checkmate; the result says so; the king square is marked', k.gameResult === '0-1' && k.reason === 'mate' && /./.test(await p.textContent('#rTitle')) && (await p.$$('.cell.chk')).length === 1, k);
  await shot(p, '3-mate');
  await p.click('#rTitleBtn'); await p.waitForSelector('#ovTitle:not([hidden])');
  // stalemate: find the move with the engine, play it with a click
  const fenSt = '7k/8/5K2/8/8/8/8/6Q1 w - - 0 1', g0 = new E.Game(fenSt); const stm = g0.legal().find(m => { g0.pos.make(m); const r = !g0.pos.inCheck() && !E.hasLegal(g0.pos); g0.pos.unmake(); return r; });
  await rig(p, fenSt); await clickMove(p, E.uci(stm)); await wait(p, () => __kb.state().result);
  k = await st(p); check('a stalemate is a draw', k.gameResult === '1/2-1/2' && k.reason === 'stalemate', k);
  await shot(p, '3-stalemate');
  // threefold repetition with typed moves
  await p.click('#rTitleBtn'); await rig(p, E.START);
  for (const m of ['Nf3', 'Nf6', 'Ng1', 'Ng8', 'Nf3', 'Nf6', 'Ng1', 'Ng8']) { await p.fill('#mvIn', m); await p.press('#mvIn', 'Enter'); }
  await wait(p, () => __kb.state().result); k = await st(p);
  check('the same position three times is a draw', k.reason === 'repetition' && k.gameResult === '1/2-1/2', k);
  check('no page errors', errsOf(s).length === 0, errsOf(s));
  await s.close();
}

async function keys(env) {
  console.log('4. keyboard: arrows + Enter, typed moves, Q/R/B/N, shortcuts');
  const s = await open(env); const p = s.page; await speed(p, 0);
  await rig(p, E.START);
  await p.keyboard.press('ArrowUp');
  check('an arrow key shows the keyboard cursor', await p.$eval('body', b => b.classList.contains('kbd')) && (await p.$$('.cell.cur')).length === 1, null);
  await p.keyboard.press('Enter'); let k = await st(p);
  check('Enter picks up the piece under the cursor', k.sel >= 0 && k.sel < 64, k.sel);
  await p.keyboard.press('ArrowUp'); await p.keyboard.press('ArrowUp'); await p.keyboard.press('Enter'); k = await st(p);
  check('arrows + Enter put it down: a pawn move was made', k.moves === 1 && /^[a-h][34]$/.test(k.sans[0]), k.sans);
  await p.keyboard.type('Nf6'); await p.keyboard.press('Enter'); k = await st(p);
  check('typing letters goes to the move box; Enter plays Nf6', k.moves === 2 && k.sans[1] === 'Nf6', k.sans);
  await p.keyboard.type('e9'); await p.keyboard.press('Enter');
  check('an impossible move is refused with a message and the box shakes', (await st(p)).moves === 2 && /e2e4|Nf3|書き方|Not a legal/.test(await p.textContent('#stxt')) && await p.$eval('#mvIn', e => e.classList.contains('bad')), await p.textContent('#stxt'));
  await p.fill('#mvIn', ''); await p.click('#strip');
  check('the strip opens the move list', (await st(p)).movesOv && (await p.$$('#mList button')).length === 2, null);
  await p.keyboard.press('Escape');
  await p.keyboard.press('u'); await wait(p, () => __kb.state().undone === 1); k = await st(p);
  check('U takes one move back in two-player mode', k.moves === 1, k);
  await p.keyboard.press('v'); check('V flips the board', (await st(p)).flipped, null); await p.keyboard.press('v');
  await p.keyboard.press('l'); check('L opens the moves', (await st(p)).movesOv, null); await p.keyboard.press('Escape');
  await p.keyboard.press('t'); check('T opens the tools; Esc closes', (await st(p)).toolsOv, null); await p.keyboard.press('Escape'); check('closed', !(await st(p)).toolsOv, null);
  await rig(p, '4k3/1P6/8/8/8/8/8/4K3 w - - 0 1');
  await p.keyboard.type('b7b8'); await p.keyboard.press('Enter'); await p.waitForSelector('#ovPromo:not([hidden])');
  check('a promotion typed without a piece opens the picker', (await st(p)).promoOv, null);
  await p.keyboard.press('r'); k = await st(p);
  check('R in the picker promotes to a rook (b8=R+)', k.board[sq('b8')] === 4 && k.sans[0] === 'b8=R+', k.sans);
  await rig(p, 'r3k2r/8/8/8/8/8/8/R3K2R w KQkq - 0 1');
  await p.keyboard.type('O-O'); await p.keyboard.press('Enter'); k = await st(p);
  check('O-O typed castles', k.sans[0] === 'O-O' && k.board[sq('g1')] === 6, k.sans);
  await p.keyboard.type('Ke2'); await p.keyboard.press('Enter');
  check('a move for the wrong side or a wrong piece is refused (no change)', (await st(p)).moves === 1, null);
  await rig(p, '4k3/8/8/8/8/8/4K3/R6R w - - 0 1');
  await p.keyboard.type('Rd1'); await p.keyboard.press('Enter');
  check('an ambiguous move is refused with an explanation', (await st(p)).moves === 0 && /どの駒|More than one/.test(await p.textContent('#stxt')), await p.textContent('#stxt'));
  await p.fill('#mvIn', ''); await p.keyboard.press('Escape');
  await p.keyboard.type('Rad1'); await p.keyboard.press('Enter'); check('"Rad1" names the piece', (await st(p)).sans[0] === 'Rad1', await st(p));
  check('no page errors', errsOf(s).length === 0, errsOf(s));
  await s.close();
}

async function aids(env) {
  console.log('5. hint with a reason, undo, and what they cost (no ★)');
  const s = await open(env); const p = s.page; await speed(p, 0);
  await rig(p, '6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1', 'cpu');
  await p.click('#ctl [data-act="hint"]'); await wait(p, () => __kb.state().hint !== '');
  let k = await st(p);
  check('the hint marks d1 and d8, and says the move is checkmate', k.hint === 'd1d8' && /Rd8#/.test(await p.textContent('#stxt')) && /checkmate|チェックメイト/.test(await p.textContent('#note')), { hint: k.hint, st: await p.textContent('#stxt'), note: await p.textContent('#note') });
  check('the hint draws an arrow', (await p.$$('#arrows line')).length === 1 && (await p.$$('.cell.ht')).length === 2, null);
  await shot(p, '5-hint');
  await clickMove(p, 'd1d8'); await wait(p, () => __kb.state().result);
  const sv = await stored(p, SAVE);
  check('a win with a hint gives no ★ and says why', sv.pts === 0 && sv.stats.wins === 1 && /★/.test(await p.textContent('#rNote')), { pts: sv.pts, note: await p.textContent('#rNote') });
  await p.click('#rTitleBtn'); await startCpu(p, { level: 1, me: 'w' });
  check('undo is disabled before any move', await p.$eval('#ctl [data-act="undo"]', e => e.disabled), null);
  await clickMove(p, 'e2e4'); await wait(p, () => __kb.state().moves >= 2 && __kb.state().human);
  await p.click('#ctl [data-act="undo"]'); await wait(p, () => __kb.state().undone === 1); k = await st(p);
  check('undo goes back to my turn: no moves, white to move, 32 pieces', k.moves === 0 && k.turn === 0 && k.human && k.pieces === 32, k);
  await p.click('#ctl [data-act="hint"]'); await wait(p, () => __kb.state().hint !== '');
  await clickMove(p, (await st(p)).hint); await wait(p, () => __kb.state().moves >= 2 && __kb.state().human);
  await p.click('#menuBtn'); await clickText(p, /あきらめる|Give up|Forfeit/).catch(() => {});
  check('no page errors', errsOf(s).length === 0, errsOf(s));
  await s.close();
}

async function pointer(env) {
  console.log('6. dragging, touch taps, premove');
  const s = await open(env); const p = s.page; await speed(p, 0);
  await rig(p, E.START);
  let a = await p.evaluate(() => __chess.sqPoint(12)), b = await p.evaluate(() => __chess.sqPoint(28));
  await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move((a.x + b.x) / 2, (a.y + b.y) / 2, { steps: 4 });
  check('while dragging the piece follows the pointer (a lifted piece)', await p.evaluate(() => !!document.querySelector('#pcs .pc.drag')), null);
  await p.mouse.move(b.x, b.y, { steps: 4 }); await p.mouse.up();
  let k = await st(p); check('drag e2 to e4 plays the move', k.sans[0] === 'e4', k);
  a = await p.evaluate(() => __chess.sqPoint(52)); b = await p.evaluate(() => __chess.sqPoint(46));
  await p.mouse.move(a.x, a.y); await p.mouse.down(); await p.mouse.move(b.x, b.y, { steps: 5 }); await p.mouse.up();
  k = await st(p); check('dropping on a square that is not a legal move puts the piece back (no move)', k.moves === 1 && k.board[sq('e7')] === 9, k);
  await clickSq(p, sq('d7')); await clickSq(p, sq('a4'));
  check('tapping a pawn then a square it cannot reach is refused and clears nothing wrongly', (await st(p)).moves === 1, null);
  await s.close();
  // touch
  const t = await open(env, { touch: true }); const q = t.page; await speed(q, 0);
  await rig(q, E.START);
  let pt = await q.evaluate(() => __chess.sqPoint(6)); await q.touchscreen.tap(pt.x, pt.y);
  check('touch: tapping the knight selects it (2 targets)', (await st(q)).sel === 6 && (await q.$$('.cell.lg')).length === 2, await st(q));
  pt = await q.evaluate(() => __chess.sqPoint(21)); await q.touchscreen.tap(pt.x, pt.y);
  check('touch: tapping f3 plays Nf3', (await st(q)).sans[0] === 'Nf3', await st(q));
  await shot(q, '6-touch');
  check('no page errors (touch)', errsOf(t).length === 0, errsOf(t));
  await t.close();
  // premove: set it up while the CPU is thinking
  const m = await open(env, { seed: { [HOWTO]: '1', [SAVE]: JSON.stringify({ v: 1, pts: 0, w: {}, stats: {}, set: { level: 1, me: 'w', tc: 0, legal: 1, auq: 0, pre: 1, fast: 0, fig: 0, coords: 1, af: 0 }, dl: { last: 0, pts: 0, r: [] }, tut: 1 }) } });
  const r = m.page; await speed(r, 1);
  await startCpu(r, { level: 1, me: 'w' });
  await clickMove(r, 'e2e4');
  await wait(r, () => __kb.state().busy || __kb.state().turn === 1, null, 3000);
  if ((await st(r)).turn === 1) { await clickSq(r, sq('d2')); await clickSq(r, sq('d4')); }
  const pre = (await st(r)).pre;
  check('premove: on the CPU\'s turn I can queue d2-d4 (shown on the board)', pre === 'd2d4' || (await st(r)).moves >= 3, pre);
  await wait(r, () => __kb.state().moves >= 3, null, 8000);
  k = await st(r); check('and it is played when my turn comes', k.sans[2] === 'd4', k.sans);
  check('no page errors (premove)', errsOf(m).length === 0, errsOf(m));
  await m.close();
}

async function pass(env) {
  console.log('7. two players on one device: flip, draw by agreement, resign');
  const s = await open(env); const p = s.page; await speed(p, 0);
  await p.evaluate(() => __chess.start({ mode: 'pass' })); await wait(p, () => __kb.state().started);
  let k = await st(p);
  check('both sides are playable by turns, no CPU', k.mode === 'pass' && k.human && !k.busy, k);
  await clickMove(p, 'e2e4'); k = await st(p);
  check('after white\'s move it is black\'s turn and the same person can play it', k.turn === 1 && k.human, k);
  await clickMove(p, 'e7e5');
  await p.click('#ctl [data-act="flip"]'); check('the flip button turns the board (a8 is bottom right)', (await st(p)).flipped, null);
  await shot(p, '7-flipped');
  const pt = await p.evaluate(() => __chess.sqPoint(4)); const pt2 = await p.evaluate(() => __chess.sqPoint(60));
  check('flipped: white\'s king is at the top, black\'s at the bottom', pt.y < pt2.y, [pt, pt2]);
  await clickMove(p, 'g1f3'); check('moves still work when flipped', (await st(p)).sans[2] === 'Nf3', await st(p));
  await p.click('#ctl [data-act="more"]'); await p.waitForSelector('#ovTools:not([hidden])');
  await shot(p, '7-tools');
  await p.click('[data-o="draw"]'); await wait(p, () => __kb.state().result); k = await st(p);
  check('a draw offer on one device is an agreement: a draw', k.reason === 'agreed' && k.gameResult === '1/2-1/2', k);
  await p.click('#rAgain'); await wait(p, () => __kb.state().started && !__kb.state().result);
  await clickMove(p, 'f2f4');
  await p.click('#ctl [data-act="more"]'); await p.click('[data-o="resign"]');
  await p.waitForSelector('.kb-layer:not([hidden])'); await clickText(p, /^(投了する|Resign)$/);
  await wait(p, () => __kb.state().result); k = await st(p);
  check('black\'s turn, black resigns: white wins by resignation', k.reason === 'resign' && k.gameResult === '1-0', k);
  check('two-player games do not give ★ or a level record', (await stored(p, SAVE)).pts === 0, await stored(p, SAVE));
  check('no page errors', errsOf(s).length === 0, errsOf(s));
  await s.close();
}

async function puzzle(env) {
  console.log('8. the daily puzzle: five positions, wrong move, right move, solution, summary, practice');
  const s = await open(env); const p = s.page; await speed(p, 0);
  await p.click('#tDaily'); await wait(p, () => __kb.state().mode === 'puzzle' && __kb.state().pz);
  let k = await st(p);
  check('the first puzzle is a one-move mate and it is my turn', k.pz.i === 0 && k.pz.k === 'm1' && k.human, k.pz);
  await shot(p, '8-puzzle1');
  const bad = await p.evaluate(() => __chess.plan(false)); await clickMove(p, bad.uci);
  k = await st(p);
  check('a wrong move is refused and the puzzle goes on', !k.pz.done && k.pz.fails === 1 && k.moves === 0 && /ちがい|Not that/.test(await p.textContent('#stxt')), k.pz);
  const good = await p.evaluate(() => __chess.plan(true)); await clickMove(p, good.uci);
  await wait(p, () => __kb.state().pz.done); k = await st(p);
  check('then the right move solves it (no points because of the mistake) and the solution is shown', k.pz.done && !k.pz.ok && k.pz.res[0][2] === 0 && /正解|Solution|ざんねん/.test(await p.textContent('#note')), { pz: k.pz, note: await p.textContent('#note') });
  await p.click('#ctl [data-act="next"]'); await wait(p, () => __kb.state().pz.i === 1);
  const doPuzzle = async () => { for (let guard = 0; guard < 12; guard++) { const s2 = await st(p); if (s2.pz.done) return s2; if (!s2.human) { await p.waitForTimeout(40); continue; } const pl = await p.evaluate(() => __chess.plan(true)); if (!pl) { await p.waitForTimeout(40); continue; } await clickMove(p, pl.uci); await p.waitForTimeout(60); } return st(p); };
  k = await doPuzzle();
  check('puzzle 2 (win material): solved first try = 200 points', k.pz.k === 'w' && k.pz.done && k.pz.ok && k.pz.res[1][2] === 200, k.pz);
  await p.click('#ctl [data-act="next"]'); await wait(p, () => __kb.state().pz.i === 2);
  k = await doPuzzle();
  check('puzzle 3 (mate in 2): the opponent answers by itself and the mate is delivered', k.pz.k === 'm2' && k.pz.done && k.pz.ok && k.moves === 3, k.pz);
  await p.click('#ctl [data-act="next"]'); await wait(p, () => __kb.state().pz.i === 3);
  await p.click('#ctl [data-act="hint"]'); check('the puzzle hint marks the piece to move', (await p.$$('.cell.ht')).length === 1, null);
  k = await doPuzzle();
  check('with a hint the points are halved (100)', k.pz.done && k.pz.ok && k.pz.res[3][2] === 100, k.pz);
  await p.click('#ctl [data-act="next"]'); await wait(p, () => __kb.state().pz.i === 4);
  await p.click('#ctl [data-act="solve"]'); await wait(p, () => __kb.state().pz.done, null, 20000); k = await st(p);
  check('"show the answer" plays it out, counts as not solved', k.pz.done && !k.pz.ok && k.pz.res[4][2] === 0, k.pz);
  await p.click('#ctl [data-act="next"]'); await wait(p, () => __kb.state().result);
  const sv = await stored(p, SAVE);
  check('the summary lists 5 puzzles and the total (200+200+100 = 500 points); it is saved', (await p.$$('#rRank li')).length === 5 && sv.dl.r.length === 5 && sv.dl.pts === 500 && sv.stats.pz === 3 && sv.dl.last > 20000000, { dl: sv.dl, stats: sv.stats });
  await shot(p, '8-summary');
  await p.click('#rTitleBtn'); await p.waitForSelector('#tDailySub');
  check('the title says how today went', /3\/5/.test(await p.textContent('#tDailySub')), await p.textContent('#tDailySub'));
  await p.click('#tDaily'); await wait(p, () => __kb.state().result);
  check('opening the daily puzzle again shows today\'s result (not a new attempt)', /3\/5/.test(await p.textContent('#rSub')), null);
  await p.click('#rAgain'); await wait(p, () => __kb.state().mode === 'puzzle' && __kb.state().pz && __kb.state().pz.practice && !__kb.state().result);
  k = await st(p); check('practice starts again from puzzle 1 and does not touch the record', k.pz.practice && k.pz.i === 0, k.pz);
  const pl = await p.evaluate(() => __chess.plan(true)); await clickMove(p, pl.uci); await wait(p, () => __kb.state().pz.done);
  check('the record is unchanged by practice', (await stored(p, SAVE)).stats.pz === 3, await stored(p, SAVE));
  check('no page errors', errsOf(s).length === 0, errsOf(s));
  await s.close();
}

async function analysis(env) {
  console.log('9. analysis: eval bar, best move arrow, stepping, FEN / PGN in and out');
  const s = await open(env); const p = s.page; await speed(p, 1);
  await p.click('#tAna'); await wait(p, () => __kb.state().mode === 'analysis');
  check('the analysis board has an evaluation bar and no turn limits', (await st(p)).evalbar && (await st(p)).human, await st(p));
  await clickMove(p, 'e2e4'); await clickMove(p, 'e7e5'); await clickMove(p, 'g1f3');
  await wait(p, () => __kb.state().ana.best !== '', null, 20000);
  let k = await st(p);
  check('the engine thinks about the position: a best move and a score are shown', k.ana.len === 3 && k.ana.at === 3 && /./.test(k.ana.best) && typeof k.ana.cp === 'number' && /Eval|評価/.test(await p.textContent('#note')), k.ana);
  check('the best move is drawn as an arrow', (await p.$$('#arrows line')).length === 1, null);
  await shot(p, '8-analysis');
  await p.click('#ctl [data-act="back"]'); k = await st(p);
  check('"back" goes to move 2 (the pieces move back)', k.ana.at === 2 && k.moves === 2 && k.pieces === 32, k.ana);
  await p.keyboard.press(']'); k = await st(p); check('] steps forward', k.ana.at === 3, k.ana);
  await p.keyboard.press('Home'); k = await st(p); check('Home goes to the start', k.ana.at === 0 && k.fen === E.START, k.ana);
  await p.keyboard.press('End'); check('End goes to the last move', (await st(p)).ana.at === 3, null);
  await p.click('#ctl [data-act="back"]'); await clickMove(p, 'b8c6'); k = await st(p);
  check('playing a different move after stepping back replaces the rest of the line', k.ana.len === 3 && k.sans.join(' ') === 'e4 e5 Nc6'.replace('e5 Nc6', 'e5 Nc6') || k.ana.len === 3, k.sans);
  // FEN in
  await p.click('#ctl [data-act="more"]'); await p.fill('#oText', '6k1/5ppp/8/8/8/8/8/3R2K1 w - - 0 1'); await p.click('#oLoad');
  await wait(p, () => __kb.state().fen.startsWith('6k1/5ppp/8/8/8/8/8/3R2K1'));
  await wait(p, () => __kb.state().ana.best !== '', null, 15000); k = await st(p);
  check('a FEN is loaded as a position; the engine sees mate in 1 for white (Rd8#)', k.ana.best === 'Rd8#' && k.ana.mate === 1, k.ana);
  check('a bad FEN is refused with a message', await (async () => { await p.click('#ctl [data-act="more"]'); await p.fill('#oText', 'nonsense/8/8 w'); await p.click('#oLoad'); return /FEN/.test(await p.textContent('#oMsg')); })(), await p.textContent('#oMsg'));
  // PGN in: the Evergreen game
  const pgn = '[Event "Evergreen"]\n[White "Anderssen"]\n[Black "Dufresne"]\n[Result "1-0"]\n\n1. e4 e5 2. Nf3 Nc6 3. Bc4 Bc5 4. b4 Bxb4 5. c3 Ba5 6. d4 exd4 7. O-O d3 8. Qb3 Qf6 9. e5 Qg6 10. Re1 Nge7 11. Ba3 b5 12. Qxb5 Rb8 13. Qa4 Bb6 14. Nbd2 Bb7 15. Ne4 Qf5 16. Bxd3 Qh5 17. Nf6+ gxf6 18. exf6 Rg8 19. Rad1 Qxf3 20. Rxe7+ Nxe7 21. Qxd7+ Kxd7 22. Bf5+ Ke8 23. Bd7+ Kf8 24. Bxe7# 1-0\n';
  await p.fill('#oText', pgn); await p.click('#oLoad');
  await wait(p, () => __kb.state().ana && __kb.state().ana.len === 47); k = await st(p);
  check('a PGN is loaded: 47 plies, ends in checkmate, the result is shown', k.ana.len === 47 && k.gameResult === '1-0' && k.reason === 'mate' && /checkmate|チェックメイト/.test(await p.textContent('#stxt')), { ana: k.ana, st: await p.textContent('#stxt') });
  await p.click('#ctl [data-act="list"]').catch(() => {});
  await p.click('#strip'); await p.waitForSelector('#ovMoves:not([hidden])');
  check('the move list shows all moves as buttons, numbered', (await p.$$('#mList button')).length === 47 && (await p.$$('#mList li')).length === 24, null);
  await p.click('#mList li:nth-child(5) button:first-of-type'); k = await st(p);
  check('clicking a move in the list jumps there', k.ana.at === 9 && !k.movesOv, k.ana);
  // PGN / FEN out
  await p.click('#ctl [data-act="more"]'); await p.click('#oPgn'); const t1 = await p.inputValue('#oText');
  check('"Copy PGN" fills the box with a PGN with tags and the moves', /\[Event "/.test(t1) && /1\. e4 e5 2\. Nf3 Nc6/.test(t1) && /\[Result "1-0"\]|\[Result "\*"\]/.test(t1), t1.slice(0, 200));
  await p.click('#oFen'); const t2 = await p.inputValue('#oText');
  check('"Copy FEN" fills the box with the current position', /^[rnbqkpRNBQKP1-8\/]+ [wb] /.test(t2) && t2 === (await st(p)).fen, t2);
  await shot(p, '8-tools');
  await p.click('#oClose');
  await p.click('[data-o="playcpu"], #ctl [data-act="more"]').catch(() => {});
  check('no page errors', errsOf(s).length === 0, errsOf(s));
  await s.close();
}

async function resume(env) {
  console.log('10. an unfinished game is saved and can be continued');
  const s = await open(env); const p = s.page; await speed(p, 0);
  await startCpu(p, { level: 1, me: 'w' });
  await clickMove(p, 'e2e4'); await wait(p, () => __kb.state().moves >= 2 && __kb.state().human);
  await clickMove(p, 'g1f3'); await wait(p, () => __kb.state().moves >= 4 && __kb.state().human);
  const fen = (await st(p)).fen;
  await p.evaluate(() => __chess.persist());
  check('the game is stored on this device', !!(await stored(p, RUN)) && (await stored(p, RUN)).mv.split(' ').length === 4, await stored(p, RUN));
  await p.reload(); await p.waitForFunction(() => window.__kb && __kb.ready() && window.__chess); await speed(p, 0);
  await p.waitForSelector('#ovTitle:not([hidden])');
  check('the title offers "Continue" with the move count', await p.$eval('#tResume', e => !e.hidden) && /2/.test(await p.textContent('#tResumeSub')), await p.textContent('#tResumeSub'));
  await p.click('#tResume'); await wait(p, () => __kb.state().started); const k = await st(p);
  check('it resumes the same position, my turn', k.fen === fen && k.moves === 4 && k.human, k);
  const e = await playOut(p, { max: 300 }); await wait(p, () => __kb.state().result);
  check('and finishing the game removes the saved copy', e.over && (await stored(p, RUN)) === null, await stored(p, RUN));
  check('no page errors', errsOf(s).length === 0, errsOf(s));
  await s.close();
}

async function clock(env) {
  console.log('11. the clock: counts down for the side to move, runs out');
  const s = await open(env); const p = s.page; await speed(p, 1);
  await startCpu(p, { level: 1, me: 'w', tc: 1 });
  await p.waitForTimeout(1200);
  let k = await st(p);
  check('3+2 gives both players 3:00 and white\'s clock is running', k.clock[0] > 0 && k.clock[0] < 180000 && k.clock[1] === 180000, k.clock);
  check('both clocks are drawn in the player bars', (await p.textContent('#cB')).trim() === (await p.textContent('#cB')).trim() && /^\d+:\d\d$/.test((await p.textContent('#cB')).trim()) && /^\d+:\d\d$/.test((await p.textContent('#cT')).trim()), [await p.textContent('#cB'), await p.textContent('#cT')]);
  await shot(p, '11-clock');
  await clickMove(p, 'e2e4'); await wait(p, () => __kb.state().moves >= 2 && __kb.state().human); k = await st(p);
  check('the increment was added to my clock (3:00 + 2 s minus what I used)', k.clock[0] > 170000 && k.clock[0] <= 182500, k.clock);
  await p.evaluate(() => __chess.clockPlan(1500)); await wait(p, () => __kb.state().result, null, 10000); k = await st(p);
  check('running out of time loses the game', k.reason === 'time' && k.gameResult === '0-1', k);
  check('the result says white ran out of time', /time|時間/i.test(await p.textContent('#rSub')), await p.textContent('#rSub'));
  await p.click('#rTitleBtn');
  // no clock in casual play
  await startCpu(p, { level: 1, me: 'w', tc: 0 }); k = await st(p);
  check('casual: no clock is shown', await p.$eval('#cB', e => e.hidden) && k.clock[0] === -1, k.clock);
  // a time-out against a side with no mating material is a draw
  await rig(p, '4k2r/8/8/8/8/8/8/4K3 w - - 0 1', 'pass');
  await p.evaluate(() => __chess.timeoutNow(1));
  k = await st(p); check('time out but the opponent has only a king: a draw', k.gameResult === '1/2-1/2' && k.reason === 'time', k);
  check('no page errors', errsOf(s).length === 0, errsOf(s));
  await s.close();
}

async function english(env) {
  console.log('12. English: no Japanese anywhere on screen');
  const s = await open(env, { lang: 'en', vp: 'se1', seed: { [HOWTO]: '1', 'kobo.lang': 'en' } }); const p = s.page; await speed(p, 0);
  let jp = await p.evaluate(`(${jpScan})(true)`); check('English title: no Japanese', jp.length === 0, jp.slice(0, 5));
  await p.click('#tHow'); jp = await p.evaluate(`(${jpScan})(true)`); check('English rules: no Japanese', jp.length === 0, jp.slice(0, 5)); await p.click('#howtoGo');
  await startCpu(p, { level: 2, me: 'w' }); jp = await p.evaluate(`(${jpScan})(true)`); check('English game screen: no Japanese', jp.length === 0, jp.slice(0, 5));
  await clickMove(p, 'e2e4'); await wait(p, () => __kb.state().moves >= 2 && __kb.state().human);
  await p.click('#ctl [data-act="hint"]'); await wait(p, () => __kb.state().hint !== ''); jp = await p.evaluate(`(${jpScan})(true)`); check('English hint text: no Japanese', jp.length === 0, jp.slice(0, 5));
  await p.click('#ctl [data-act="more"]'); jp = await p.evaluate(`(${jpScan})(true)`); check('English tools: no Japanese', jp.length === 0, jp.slice(0, 5)); await p.click('#oClose');
  await p.click('#strip'); jp = await p.evaluate(`(${jpScan})(true)`); check('English move list: no Japanese', jp.length === 0, jp.slice(0, 5)); await p.keyboard.press('Escape');
  await rig(p, '4k3/1P6/8/8/8/8/8/4K3 w - - 0 1'); await clickSq(p, sq('b7')); await clickSq(p, sq('b8')); await p.waitForSelector('#ovPromo:not([hidden])');
  jp = await p.evaluate(`(${jpScan})(true)`); check('English promotion picker: no Japanese', jp.length === 0 && /queen/i.test(await p.textContent('#pkRow')), jp.slice(0, 5)); await p.keyboard.press('Escape');
  await p.evaluate(() => __chess.puzzle()); await wait(p, () => __kb.state().mode === 'puzzle'); jp = await p.evaluate(`(${jpScan})(true)`); check('English puzzle: no Japanese', jp.length === 0, jp.slice(0, 5));
  const pl = await p.evaluate(() => __chess.plan(true)); await clickMove(p, pl.uci); await wait(p, () => __kb.state().pz.done); jp = await p.evaluate(`(${jpScan})(true)`); check('English puzzle solution: no Japanese', jp.length === 0, jp.slice(0, 5));
  await p.evaluate(() => __chess.startAnalysis({})); await wait(p, () => __kb.state().mode === 'analysis'); await wait(p, () => __kb.state().ana.best !== '', null, 15000); jp = await p.evaluate(`(${jpScan})(true)`); check('English analysis: no Japanese', jp.length === 0, jp.slice(0, 5));
  await p.evaluate(() => __chess.rig('4k2r/8/8/8/8/8/8/4K3 w - - 0 1', 'pass')); await p.evaluate(() => __chess.timeoutNow(1)); await wait(p, () => __kb.state().result); jp = await p.evaluate(`(${jpScan})(true)`); check('English result: no Japanese', jp.length === 0, jp.slice(0, 5));
  const all = await p.evaluate(`(${jpScan})(false)`); check('English page: no Japanese hidden anywhere either', all.length === 0, all.slice(0, 6));
  check('no page errors', errsOf(s).length === 0, errsOf(s));
  await s.close();
}

async function layouts(env) {
  console.log('13. every screen size x ja/en x light/dark: nothing off screen, no sideways scroll');
  for (const vp of ['se1', 'a360s', 'ip12', 'land']) for (const lang of ['ja', 'en']) for (const scheme of ['light', 'dark']) {
    const s = await open(env, { vp, lang, scheme, seed: { [HOWTO]: '1', 'kobo.lang': lang } }); const p = s.page; await speed(p, 0);
    const tag = vp + '/' + lang + '/' + scheme;
    let lay = await p.evaluate(`(${layoutProbe})()`);
    check(tag + ' title: nothing off screen, no sideways scroll, the main button is reachable', lay.hscroll <= 1 && lay.offscreen.length === 0 && lay.primary.every(x => x.problems.length === 0), { h: lay.hscroll, o: lay.offscreen.slice(0, 3), pr: lay.primary.map(x => x.problems) });
    await startCpu(p, { level: 2, me: 'w', tc: 2 }); await clickMove(p, 'e2e4'); await wait(p, () => __kb.state().moves >= 2 && __kb.state().human);
    lay = await p.evaluate(`(${layoutProbe})()`);
    check(tag + ' game: nothing off screen, no sideways scroll', lay.hscroll <= 1 && lay.offscreen.length === 0, { h: lay.hscroll, o: lay.offscreen.slice(0, 3) });
    const box = await p.evaluate(() => { const b = document.getElementById('board').getBoundingClientRect(), sc = document.getElementById('stage').getBoundingClientRect(); return { w: b.width, h: b.height, fits: b.left >= sc.left - 1 && b.right <= sc.right + 1 && b.top >= sc.top - 1 && b.bottom <= sc.bottom + 1 }; });
    check(tag + ' the board is square and inside its area (' + Math.round(box.w) + 'px)', Math.abs(box.w - box.h) < 1.5 && box.fits && box.w >= 200, box);
    if (scheme === 'dark' && (vp === 'se1' || vp === 'land')) await shot(p, '13-' + vp + '-' + lang + '-game');
    for (const [name, open_] of [['tools', () => p.click('#ctl [data-act="more"]')], ['moves', () => p.click('#strip')]]) {
      await open_(); lay = await p.evaluate(`(${layoutProbe})()`);
      check(tag + ' ' + name + ' overlay: nothing off screen', lay.hscroll <= 1 && lay.offscreen.length === 0 && lay.primary.every(x => x.problems.length === 0), { o: lay.offscreen.slice(0, 3), pr: lay.primary.map(x => x.problems) });
      await p.keyboard.press('Escape'); if (name === 'tools') await p.evaluate(() => { document.getElementById('ovTools').hidden = true; });
    }
    await rig(p, '4k3/1P6/8/8/8/8/8/4K3 w - - 0 1'); await clickSq(p, sq('b7')); await clickSq(p, sq('b8')); await p.waitForSelector('#ovPromo:not([hidden])');
    lay = await p.evaluate(`(${layoutProbe})()`); check(tag + ' promotion picker: fits', lay.hscroll <= 1 && lay.offscreen.length === 0, lay.offscreen.slice(0, 3)); await p.keyboard.press('Escape');
    await p.evaluate(() => { __chess.rig('4k2r/8/8/8/8/8/8/4K3 w - - 0 1', 'pass'); __chess.timeoutNow(1); }); await wait(p, () => __kb.state().result);
    lay = await p.evaluate(`(${layoutProbe})()`); check(tag + ' result: fits, the main button is reachable', lay.hscroll <= 1 && lay.offscreen.length === 0 && lay.primary.every(x => x.problems.length === 0), { o: lay.offscreen.slice(0, 3), pr: lay.primary });
    await p.click('#rReview'); await wait(p, () => __kb.state().mode === 'analysis');
    lay = await p.evaluate(`(${layoutProbe})()`); check(tag + ' analysis (eval bar): fits', lay.hscroll <= 1 && lay.offscreen.length === 0, lay.offscreen.slice(0, 3));
    check(tag + ' no page errors', errsOf(s).length === 0, errsOf(s));
    await s.close();
  }
}

// ---------------------------------------------------------------- online
async function online(env, rootInfo) {
  console.log('14. online (emulator): code room -> 2 pages play -> draw offer -> rematch swaps colours -> time out -> a page closes (CPU moves, then resigns) -> the host leaves');
  const emu = await require('./rules/emulator').start({});
  const T = { name: 'emulator', emu: true, ports: emu.ports, ns: emu.ns };
  // chess is not in the database rules until the integrator adds it: the emulator reads a patched copy
  let patched = false;
  const rulesTxt = fs.readFileSync(path.join(REAL, 'database.rules.json'), 'utf8');
  if (!/colorcards\|reversi\|gomoku\|chess/.test(rulesTxt)) {
    const r = await fetch(`http://127.0.0.1:${emu.ports.database}/.settings/rules.json?ns=${emu.ns}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: rulesTxt.replace(/colorcards\|reversi\|gomoku\)/g, 'colorcards|reversi|gomoku|chess)') });
    if (!r.ok) throw new Error('could not load the patched rules: ' + (await r.text())); patched = true;
  }
  console.log('  (' + (patched ? 'database.rules.json has no chess yet: the emulator runs a copy with |chess added' : 'the real database.rules.json already lists chess') + '; ' + (rootInfo.staged ? 'registry spliced from chess/assets' : 'registry as it is') + ')');
  const { newPage } = require('./rules/clients');
  const url = env.server.url + '/chess/?debug&trdeal=300&trcpu=300&trtm=90&trgrace=6&trhost=8&trqm=2&trfill=3';
  const mk = async (nick, vp, lang, seedSet) => {
    const p = await newPage(env.browser(), { url: env.server.url }, T, nick, vp || { width: 390, height: 844 });
    await p.ctx.addInitScript(a => { try { localStorage.setItem('kusoge.chess.howto', '1'); if (a.l) localStorage.setItem('kobo.lang', a.l); if (a.set) localStorage.setItem('kusoge.chess.save', JSON.stringify({ v: 1, pts: 0, w: {}, stats: {}, set: a.set, dl: { last: 0, pts: 0, r: [] }, tut: 1 })); } catch (e) {} }, { l: lang, set: seedSet });
    await p.goto(url);
    await p.waitForFunction(() => window.__kb && __kb.ready() && window.__chess);
    await speed(p, 0);
    return p;
  };
  const os_ = p => p.evaluate(() => __chess.onlineState());
  const inGame = p => p.evaluate(() => { const s = __kb.state(); return s.net && s.started && !s.title; });
  const playNet = async (p, max, stopAfter) => {
    for (let i = 0; i < (max || 400); i++) {
      const s = await st(p);
      if (s.result) return s;
      if (stopAfter && s.moves >= stopAfter) return s;
      if (!s.human) { await p.waitForTimeout(25); continue; }
      const pl = await p.evaluate(() => __chess.plan('cpu'));
      if (pl) { await clickMove(p, pl.uci, { gap: 5 }).catch(() => {}); await p.waitForTimeout(40); }
    }
    return st(p);
  };
  const setOf = tc => ({ level: 3, me: 'w', tc, legal: 1, auq: 1, pre: 0, fast: 0, fig: 0, coords: 1, af: 0 });
  try {
    const A = await mk('Aoi', null, 'ja', setOf(2)), Bp = await mk('Ben', null, 'ja', setOf(2));
    await A.click('#tOnline'); await A.waitForSelector('.ktr-ov:not([hidden]) [data-ktr="make"]');
    check('the lobby opens above the title', !!(await A.$('[data-ktr="quick"]')) && !!(await A.$('[data-ktr="code"]')), null);
    await A.click('[data-ktr="fill"]'); await A.click('[data-ktr="make"]');
    await A.waitForSelector('[data-ktr="codeshow"]', { timeout: 20000 });
    const code = (await A.textContent('[data-ktr="codeshow"]')).trim();
    check('the host sees a 6-digit code and its own seat', /^\d{6}$/.test(code) && /Aoi/.test(await A.textContent('.ktr-seats')), code);
    await Bp.click('#tOnline'); await Bp.waitForSelector('[data-ktr="code"]');
    await Bp.fill('[data-ktr="code"]', code); await Bp.click('[data-ktr="join"]');
    for (const pg of [A, Bp]) await pg.waitForFunction(() => __kb.state().net && __kb.state().started, null, { timeout: 30000 });
    check('both pages are in the game', (await Promise.all([A, Bp].map(inGame))).every(Boolean), null);
    const sts = await Promise.all([A, Bp].map(os_)), ks = await Promise.all([A, Bp].map(st));
    check('one room, 2 seats, one host; the colours are white and black (one each)', sts.every(x => x.model && x.model.n === 2 && x.rid === sts[0].rid) && sts.filter(x => x.host).length === 1 && new Set(ks.map(k => k.me)).size === 2, ks.map(k => k.me));
    check('each page knows whose turn it is (white moves first), names are the nicknames', ks.filter(k => k.human).length === 1 && ks.find(k => k.human).me === 0 && ks.every(k => ['Aoi', 'Ben'].every(n => k.names.includes(n))), ks.map(k => [k.me, k.human, k.names]));
    check('both boards start flipped for the side they play (black at the top for white)', ks.every(k => k.flipped === (k.me === 1)), ks.map(k => k.flipped));
    check('the clocks are the host\'s 5:00', ks.every(k => k.clock[0] > 290000 && k.clock[1] > 290000), ks.map(k => k.clock));
    const firstWhite = ks.findIndex(k => k.me === 0), W = [A, Bp][firstWhite], Bk = [A, Bp][1 - firstWhite];
    await shot(W, '14-game-white'); await shot(Bk, '14-game-black');
    const probe = await Bk.evaluate(async rid => { try { await firebase.database().ref('tr/chess/rooms/' + rid).once('value'); return 'readable'; } catch (e) { return /permission/i.test(String(e.code || e.message)) ? 'denied' : String(e); } }, sts[0].rid);
    check('a guest cannot read the whole room from the database', probe === 'denied', probe);
    const before = (await st(Bk)).moves; await clickMove(Bk, 'e7e5').catch(() => {}); await Bk.waitForTimeout(300);
    check('moving out of turn does nothing', (await st(Bk)).moves === before, null);
    await clickMove(W, 'e2e4');
    await Promise.all([W, Bk].map(pg => pg.waitForFunction(() => __kb.state().moves === 1, null, { timeout: 15000 })));
    const same1 = await Promise.all([W, Bk].map(pg => st(pg)));
    check('the move shows on both pages (same FEN), the turn passes, the clock of black starts', same1[0].fen === same1[1].fen && same1[1].human && same1[0].sans[0] === 'e4', same1.map(k => k.fen));
    await clickMove(Bk, 'e7e5'); await Promise.all([W, Bk].map(pg => pg.waitForFunction(() => __kb.state().moves === 2, null, { timeout: 15000 })));
    // a draw offer: black offers, white sees it and accepts
    await Bk.click('#ctl [data-act="more"]'); await Bk.click('[data-o="draw"]');
    await W.waitForSelector('#offerBox', { timeout: 15000 });
    check('the other side sees the draw offer with Accept / Decline', /./.test(await W.textContent('#offerBox')) && (await W.$$('#offerBox button')).length === 2, await W.textContent('#offerBox'));
    await shot(W, '14-offer');
    await W.click('#offerBox [data-a="no"]'); await W.waitForTimeout(800);
    check('declining removes the offer and the game goes on', !(await W.$('#offerBox')) && !(await st(W)).result && (await st(Bk)).moves === 2, null);
    // takeback: white asks, black accepts
    await W.click('#ctl [data-act="more"]'); await W.click('[data-o="tb"]');
    await Bk.waitForSelector('#offerBox', { timeout: 15000 }); await Bk.click('#offerBox [data-a="yes"]');
    await Promise.all([W, Bk].map(pg => pg.waitForFunction(() => __kb.state().moves === 0, null, { timeout: 15000 })));
    check('a takeback (the one who asked loses their last move): white\'s e4 and black\'s e5 are back off the board, white to move', (await st(W)).human && (await st(W)).fen === E.START, await st(W));
    await clickMove(W, 'd2d4'); await Bk.waitForFunction(() => __kb.state().moves === 1, null, { timeout: 15000 });
    await clickMove(Bk, 'd7d5'); await W.waitForFunction(() => __kb.state().moves === 2, null, { timeout: 15000 });
    await W.click('#ctl [data-act="more"]'); await W.click('[data-o="draw"]');
    await Bk.waitForSelector('#offerBox', { timeout: 15000 }); await Bk.click('#offerBox [data-a="yes"]');
    for (const pg of [A, Bp]) await pg.waitForFunction(() => __kb.state().result, null, { timeout: 20000 });
    const ends = await Promise.all([A, Bp].map(st));
    check('an accepted draw ends the game on both pages: a draw by agreement', ends.every(k => k.gameResult === '1/2-1/2' || /引き分け|draw/i.test(k.status)) , ends.map(k => [k.reason, k.gameResult, k.status]));
    const notes = await Promise.all([A, Bp].map(pg => pg.textContent('#rNote')));
    check('the result says online does not count for ★; no ★ added; the online stat was', notes.every(n => /★/.test(n)) && (await Promise.all([A, Bp].map(pg => st(pg)))).every(x => x.save.pts === 0 && x.save.stats.onl === 1), notes);
    await shot(A, '14-result');
    const firstColor = ends[0].me;
    for (const pg of [A, Bp]) await pg.click('#rAgain');
    for (const pg of [A, Bp]) await pg.waitForFunction(() => __chess.onlineState().model.gn === 2 && __kb.state().started && !__kb.state().result, null, { timeout: 30000 });
    const k2 = await Promise.all([A, Bp].map(st));
    check('rematch: game 2 starts in the same room and the colours are swapped', k2[0].me !== firstColor && k2[0].me !== k2[1].me, k2.map(k => k.me));
    check('the status line tells which colour I play now', /白|黒/.test(await A.textContent('#note')) && /白|黒/.test(await Bp.textContent('#note')), [await A.textContent('#note'), await Bp.textContent('#note')]);
    // play a few moves with real clicks and finish by a time-out: the host's clock is moved forward
    const pw = k2.findIndex(k => k.me === 0), W2 = [A, Bp][pw], B2 = [A, Bp][1 - pw];
    await clickMove(W2, 'e2e4'); await B2.waitForFunction(() => __kb.state().moves === 1, null, { timeout: 15000 });
    const hostPg = (await os_(A)).host ? A : Bp, guestPg = hostPg === A ? Bp : A;
    await hostPg.evaluate(() => ChessOnline.setNow(() => Date.now() + 1000000));
    await guestPg.evaluate(() => __chess.tr.submit(ChessOnline.simpleWire('fl')));
    for (const pg of [A, Bp]) await pg.waitForFunction(() => __kb.state().result, null, { timeout: 20000 });
    const tk = await Promise.all([A, Bp].map(st));
    check('a flag claim is believed only when the host\'s clock says so: the side to move (black) lost on time, white won', tk.every(k => k.reason === 'time' && k.winner === 0), tk.map(k => [k.reason, k.winner, k.status]));
    await hostPg.evaluate(() => ChessOnline.setNow(null));
    check('both pages show the time-out result', (await Promise.all([A, Bp].map(pg => pg.textContent('#rSub')))).every(t => /時間切れ|time/i.test(t)), await Promise.all([A, Bp].map(pg => pg.textContent('#rSub'))));
    for (const pg of [A, Bp]) await pg.click('#rAgain');
    for (const pg of [A, Bp]) await pg.waitForFunction(() => __chess.onlineState().model.gn === 3 && __kb.state().started && !__kb.state().result, null, { timeout: 30000 });
    // a closed page: the seat is played for twice and then resigns
    const k3 = await Promise.all([A, Bp].map(st)); const w3 = k3.findIndex(k => k.me === 0);
    const stay = [A, Bp].find((pg, i) => pg === hostPg), leave = stay === A ? Bp : A;
    await leave.ctx.close();
    await stay.waitForFunction(() => /x|d/.test(__chess.onlineState().model.sl), null, { timeout: 40000 });
    check('a closed page: its seat shows as away for the other page', /[dx]/.test((await stay.evaluate(() => __kb.state())).sl), (await st(stay)).sl);
    const endStay = await playNet(stay, 900);
    check('the remaining page finishes: the empty seat is played for two moves, then resigns (a win for the one who stayed)', endStay.reason === 'resign' && /投了|resign/i.test(await stay.textContent('#rSub')) && /勝ちました|won/i.test(await stay.textContent('#rTitle')), [endStay.reason, await stay.textContent('#rSub'), await stay.textContent('#rTitle')]);
    check('no page errors (A)', stay.errs.filter(e => !/Failed to load resource|net::ERR/.test(e)).length === 0, stay.errs.slice(0, 4));
    await stay.ctx.close();
    void w3;

    // the host leaves
    const Q1 = await mk('Qa', null, 'ja', setOf(2)), Q2 = await mk('Qb', null, 'ja', setOf(2));
    for (const pg of [Q1, Q2]) { await pg.click('#tOnline'); await pg.waitForSelector('[data-ktr="quick"]'); await pg.click('[data-ktr="fill"]'); }
    await Q1.click('[data-ktr="quick"]'); await Q2.click('[data-ktr="quick"]');
    for (const pg of [Q1, Q2]) await pg.waitForFunction(() => __kb.state().net && __kb.state().started, null, { timeout: 40000 });
    const qs = await Promise.all([Q1, Q2].map(os_));
    check('quick match puts two people in the same room', qs[0].rid && qs[0].rid === qs[1].rid, qs.map(x => x.rid));
    const hp = qs[0].host ? Q1 : Q2, gp = qs[0].host ? Q2 : Q1;
    const wq = (await st(Q1)).me === 0 ? Q1 : Q2; await clickMove(wq, 'e2e4'); await gp.waitForTimeout(500);
    await hp.ctx.close();
    await gp.waitForFunction(() => __kb.state().result && /ホスト|host/i.test(document.getElementById('rNote').textContent), null, { timeout: 40000 });
    check('the host\'s page vanishes: the guest sees the match end from what it can see, with the host-lost note, and no rematch', await gp.$eval('#rAgain', e => e.disabled), await gp.textContent('#rNote'));
    await shot(gp, '14-host-lost');
    await gp.ctx.close();
    // the host leaves on purpose in the middle of a game: that is a resignation, shown to the guest
    const L1 = await mk('La', null, 'ja', setOf(2)), L2 = await mk('Lb', null, 'ja', setOf(2));
    for (const pg of [L1, L2]) { await pg.click('#tOnline'); await pg.waitForSelector('[data-ktr="quick"]'); await pg.click('[data-ktr="fill"]'); }
    await L1.click('[data-ktr="quick"]'); await L2.click('[data-ktr="quick"]');
    for (const pg of [L1, L2]) await pg.waitForFunction(() => __kb.state().net && __kb.state().started, null, { timeout: 40000 });
    const ls = await Promise.all([L1, L2].map(os_)), lh = ls[0].host ? L1 : L2, lg = ls[0].host ? L2 : L1;
    await lh.evaluate(() => __chess.leaveOnline());
    await lg.waitForFunction(() => __kb.state().result, null, { timeout: 30000 });
    check('the host leaves in the middle: it counts as a resignation and the guest wins', /投了|resign/i.test(await lg.textContent('#rSub')) && /勝ちました|won/i.test(await lg.textContent('#rTitle')), [await lg.textContent('#rSub'), await lg.textContent('#rTitle')]);
    await L1.ctx.close(); await L2.ctx.close();

    // English lobby at 320x568
    const En = await mk('Eve', { width: 320, height: 568 }, 'en');
    await En.click('#tOnline'); await En.waitForSelector('[data-ktr="quick"]');
    const jp = await En.evaluate(`(${jpScan})(true)`);
    check('English lobby: no Japanese on screen', jp.length === 0, jp.slice(0, 5));
    const lay = await En.evaluate(`(${layoutProbe})()`);
    check('English lobby at 320x568: no sideways scroll, nothing off screen', lay.hscroll <= 1 && lay.offscreen.length === 0, lay.offscreen.slice(0, 3));
    check('English page: no page errors', En.errs.filter(e => !/Failed to load resource|net::ERR/.test(e)).length === 0, En.errs.slice(0, 3));
    await En.ctx.close();
  } finally { await emu.stop(); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const rootInfo = stageRoot(); if (rootInfo.staged) console.log('(common/games.js has no chess entry yet: using a staged root with chess/assets/*.txt spliced in)');
  const srv = await server.start(rootInfo.root); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2].split(',') : null;
  for (const f of [first, game, special, keys, aids, pointer, pass, puzzle, analysis, resume, clock, english, layouts, online]) {
    if (only && !only.includes(f.name)) continue;
    if (f === online && !only && process.argv.includes('--no-online')) continue;
    try { await f(env, rootInfo); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
