#!/usr/bin/env node
// 将棋の通しプレイ（Playwright、?debug の window.__shogi を使う）
//   node tools/tests/shogi-play.js             … 全部（2〜3分。オンラインは Firebase エミュレーターを起動する）
//   node tools/tests/shogi-play.js --no-online … エミュレーターなし
// スクリーンショット：tools/tests/out/shots/shogi-play/
// 1. CPU（入門）と最後まで：人の側は盤のマスを本物のクリックで指す（手はエンジンが選ぶ）→ 詰みで勝ち → 記録・続きの対局が消える
// 2. 待った・成る/成らないの選択・持ち駒を打つ・反転・棋譜（KIF）
// 3. ふたりで対局：交互に指して投了 → 「後手の勝ち」
// 4. 保存と再開：CPU 戦の途中で再読み込み → 「続きから」→ 同じ局面
// 5. 詰将棋：王手でない手は戻される → 正解で記録
// 6. 英語：表記が ☗P-7f、見えている文字に日本語がない
// 7. オンライン（エミュレーター）：友だちのコードで2人 → 指して投了 / 相手の切断 → 待って勝ち
'use strict';
const fs = require('fs');
const path = require('path');
const { chromium } = require('playwright');
const server = require('./lib/server');
const { jpScan } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'shogi-play');
const NO_ONLINE = process.argv.includes('--no-online');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info === undefined ? '' : info).slice(0, 400)}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const E = require('../../shogi/engine.js');

async function open(browser, env, o = {}) {
  const ctx = o.ctx || await browser.newContext({ viewport: o.vp || { width: 390, height: 844 }, deviceScaleFactor: 2, locale: o.lang === 'en' ? 'en-US' : 'ja-JP', serviceWorkers: 'block' });
  await ctx.addInitScript(([lang, seed]) => { try { if (!sessionStorage.getItem('__seeded')) { sessionStorage.setItem('__seeded', '1'); localStorage.setItem('kobo.lang', lang); for (const [k, v] of Object.entries(seed)) localStorage.setItem(k, v); } } catch (e) {} }, [o.lang || 'ja', o.seed || {}]);
  await ctx.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, contentType: 'text/css', body: '' }));
  const p = await ctx.newPage();
  p.errs = [];
  p.on('pageerror', e => p.errs.push(e.message));
  p.on('console', m => { if (m.type() === 'error') p.errs.push(m.text()); });
  await p.goto(env.url + '/shogi/index.html?debug' + (o.query || ''));
  await p.waitForFunction(() => window.__shogi && __shogi.ready());
  p.ctx = ctx;
  return p;
}
const st = p => p.evaluate(() => __shogi.state());
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') });
// play a move like a player: click the source square (or the piece in hand), then the destination; answer the promotion dialog
async function clickMove(p, usi) {
  if (usi[1] === '*') {
    const t = 'PLNSGBR'.indexOf(usi[0]) + 1;
    const side = (await st(p)).side;
    const xy = await p.evaluate(([s, t]) => __shogi.handPoint(s, t), [side, t]);
    await p.mouse.click(xy[0], xy[1]);
  } else {
    const xy = await p.evaluate(s => __shogi.squarePoint(__shogi.usiSquare(s)), usi.slice(0, 2));
    await p.mouse.click(xy[0], xy[1]);
  }
  await sleep(60);
  const to = usi[1] === '*' ? usi.slice(2, 4) : usi.slice(2, 4);
  const xy2 = await p.evaluate(s => __shogi.squarePoint(__shogi.usiSquare(s)), to);
  await p.mouse.click(xy2[0], xy2[1]);
  await sleep(60);
  if (!(await p.evaluate(() => document.getElementById('ovPromo').hidden))) await p.click(usi.endsWith('+') ? '#prYes' : '#prNo');
  await sleep(220);
}
async function waitTurn(p, n) { await p.waitForFunction(n => { const s = __shogi.state(); return s.ended || (s.canAct && (n == null || s.moves.length >= n)); }, n, { timeout: 30000 }); }

async function cpuToMate(browser, env) {
  console.log('1. CPU (beginner) to the end, moves clicked on the board');
  const p = await open(browser, env);
  await p.click('#tCpu');
  await p.click('#cpuLv button:nth-child(1)');
  await p.click('#cpuSide button:nth-child(1)');
  await p.click('#cpuGo');
  let s = await st(p);
  check('a CPU game starts, you are black at the bottom', s.mode === 'cpu' && !s.flipped && s.canAct);
  let plies = 0;
  while (plies < 300) {
    await waitTurn(p);
    s = await st(p);
    if (s.ended) break;
    const g = E.Game.fromMoves(E.START, s.moves);
    const r = E.search(g.pos, { level: 4, timeMs: 150, history: g.keys.slice(0, -1) });
    await clickMove(p, r.usi);
    plies++;
    if (plies === 6) await shot(p, 'cpu-midgame');
  }
  await p.waitForFunction(() => !document.getElementById('ovResult').hidden, null, { timeout: 10000 }).catch(() => {});
  s = await st(p);
  check('the game ends by checkmate, you win', s.result && s.result.reason === 'mate' && s.result.winner === 0, s.result);
  check('result card says you win', (await p.textContent('#resBig')) === 'あなたの勝ち');
  await shot(p, 'cpu-result');
  const save = await p.evaluate(() => __shogi.save);
  check('record: one win against level 1', save.cpu.l1.w === 1, save.cpu);
  check('the finished game is not offered to resume', await p.evaluate(() => localStorage.getItem('kusoge.shogi.game') === null));
  const kif = await p.evaluate(() => __shogi.kifText());
  check('KIF: header, moves and the result line', /手合割：平手/.test(kif) && /   1 ７六歩\(77\)|   1 /.test(kif) && /まで\d+手で先手の勝ち/.test(kif), kif.slice(-120));
  check('no page errors', !p.errs.length, p.errs);
  await p.ctx.close();
}

async function controls(browser, env) {
  console.log('2. undo, promotion choice, drops, flip, kifu');
  const p = await open(browser, env);
  await p.evaluate(() => __shogi.newCpu({ lv: 2, human: 0 }));
  await clickMove(p, '7g7f');
  await waitTurn(p, 2);
  await p.click('#bUndo');
  let s = await st(p);
  check('待った takes back your move and the CPU reply', s.moves.length === 0 && s.canAct, s.moves);
  check('the game is marked as taken back', await p.evaluate(() => __shogi.cfg.undo === true));
  // two players: the bishop exchange with a promotion choice, then a drop
  await p.evaluate(() => __shogi.new2p());
  for (const u of ['7g7f', '3c3d']) await clickMove(p, u);
  let xy = await p.evaluate(() => __shogi.squarePoint(__shogi.usiSquare('8h')));
  await p.mouse.click(xy[0], xy[1]);
  s = await st(p);
  check('legal targets are highlighted (bishop: 6 squares, two at 2b)', s.targets.includes('8h2b+') && s.targets.includes('8h2b'), s.targets);
  xy = await p.evaluate(() => __shogi.squarePoint(__shogi.usiSquare('2b')));
  await p.mouse.click(xy[0], xy[1]);
  check('promotion dialog opens', !(await p.evaluate(() => document.getElementById('ovPromo').hidden)));
  await shot(p, 'promotion');
  await p.click('#prYes');
  await sleep(250);
  for (const u of ['3a2b']) await clickMove(p, u);
  s = await st(p);
  check('promoted and recaptured: 8h2b+ 3a2b', s.moves.join() === '7g7f,3c3d,8h2b+,3a2b', s.moves);
  await clickMove(p, 'B*4e');
  s = await st(p);
  check('drop from the hand', s.moves[4] === 'B*4e', s.moves);
  const ml = await p.textContent('#mlist');
  check('move list: ▲7六歩 … △同銀 … ▲4五角', /▲7六歩/.test(ml) && /△同銀/.test(ml) && /▲4五角/.test(ml), ml);
  // drag a piece
  const a = await p.evaluate(() => __shogi.squarePoint(__shogi.usiSquare('4a'))), b2 = await p.evaluate(() => __shogi.squarePoint(__shogi.usiSquare('3b')));
  await p.mouse.move(a[0], a[1]); await p.mouse.down(); await p.mouse.move(b2[0], b2[1] + 20, { steps: 6 }); await p.mouse.up();
  await sleep(250);
  s = await st(p);
  check('drag and drop a piece (4a3b)', s.moves[5] === '4a3b', s.moves);
  await p.click('#bFlip');
  check('flip the board', (await st(p)).flipped);
  await shot(p, 'flipped');
  await p.click('#bKif');
  const txt = await p.inputValue('#kifText');
  check('kifu sheet with KIF text', /４五角打/.test(txt) && /同　銀\(31\)/.test(txt), txt);
  await shot(p, 'kifu');
  await p.click('#kifClose');
  // 3. two players: resign
  console.log('3. two players: resign');
  await p.evaluate(() => __shogi.new2p());
  for (const u of ['2g2f', '8c8d', '2f2e', '8d8e']) await clickMove(p, u);
  await p.click('#bResign'); await sleep(200); await p.click('.kb-layer .kb-btn--danger');
  await p.waitForFunction(() => !document.getElementById('ovResult').hidden, null, { timeout: 5000 });
  check('black resigns in a 2-player game → White wins', (await p.textContent('#resBig')) === '後手の勝ち');
  check('no page errors', !p.errs.length, p.errs);
  await p.ctx.close();
}

async function resume(browser, env) {
  console.log('4. save and resume a CPU game');
  const p = await open(browser, env);
  await p.evaluate(() => __shogi.newCpu({ lv: 3, human: 1 }));
  await waitTurn(p, 1);
  let s = await st(p);
  check('as white, the CPU moves first and the board is flipped', s.moves.length === 1 && s.flipped);
  await clickMove(p, '3c3d');
  await waitTurn(p, 3);
  const before = (await st(p)).moves;
  await p.reload();
  await p.waitForFunction(() => window.__shogi && __shogi.ready());
  check('title offers 続きから', await p.isVisible('#tResume'));
  await shot(p, 'title-resume');
  await p.click('#tResume');
  s = await st(p);
  check('the same position, your turn, still white', s.moves.join() === before.join() && s.canAct && s.flipped, [s.moves, before]);
  check('no page errors', !p.errs.length, p.errs);
  await p.ctx.close();
}

async function tsume(browser, env) {
  console.log('5. tsume');
  const p = await open(browser, env);
  await p.click('#tTsume');
  await shot(p, 'tsume-list');
  await p.click('#tsumeList button:nth-child(3)'); // problem 3 (mate in 3)
  await sleep(300);
  // a quiet move is not allowed
  const pos = await st(p);
  const quiet = new E.Position(pos.sfen).legal().find(u => { const q = new E.Position(pos.sfen); q.play(u); return !q.inCheck(); });
  await clickMove(p, quiet);
  await sleep(1200);
  let s = await st(p);
  check('a move that is not check is taken back', s.moves.length === 0, s.moves);
  const r = E.solveMate(new E.Position(pos.sfen), 3);
  await clickMove(p, r.pv[0]);
  await p.waitForFunction(() => __shogi.state().moves.length === 2 && __shogi.state().canAct, null, { timeout: 10000 });
  s = await st(p);
  const g = new E.Game(pos.sfen); g.play(s.moves[0]); g.play(s.moves[1]);
  const fin = E.solveMate(g.pos, 1);
  await clickMove(p, fin.pv[0]);
  await p.waitForFunction(() => !document.getElementById('ovResult').hidden, null, { timeout: 5000 });
  check('solved: 正解！', (await p.textContent('#resBig')) === '正解！');
  check('saved as solved', (await p.evaluate(() => __shogi.save.mate.s)).includes('t3'));
  await shot(p, 'tsume-solved');
  await p.ctx.close();
}

async function english(browser, env) {
  console.log('6. English');
  const p = await open(browser, env, { lang: 'en', vp: { width: 360, height: 560 } });
  await p.click('#tCpu'); await p.click('#cpuGo');
  await clickMove(p, '7g7f');
  await sleep(300);
  const ml = await p.textContent('#mlist');
  check('English notation ☗P-7f', /☗P-7f/.test(ml), ml);
  await waitTurn(p, 2);
  const jp = await p.evaluate(`(${jpScan})(true)`);
  check('no Japanese visible in the game screen', jp.length === 0, jp);
  await shot(p, 'en-game');
  await p.click('#menuBtn'); await p.click('#mHowto');
  await p.evaluate(() => { const b = document.getElementById('howtoBody'); b.scrollTop = b.scrollHeight; });
  const jp2 = await p.evaluate(`(${jpScan})(true)`);
  check('how to play: only the piece kanji are Japanese (lang=ja)', jp2.length === 0, jp2);
  await shot(p, 'en-howto');
  for (const [w, h, n] of [[320, 568, 'se1'], [667, 375, 'land']]) {
    await p.setViewportSize({ width: w, height: h }); await sleep(200);
    if (await p.isVisible('#howtoOk')) { await p.click('#howtoOk'); await p.click('#mGuide'); await p.click('#mResume'); }
    await sleep(300);
    const ok = await p.evaluate(() => { const r = document.getElementById('cv').getBoundingClientRect(), c = document.getElementById('ctrl').getBoundingClientRect();
      return r.top >= 0 && r.bottom <= innerHeight + 1 && r.right <= innerWidth + 1 && c.bottom <= innerHeight + 1 && c.right <= innerWidth + 1 && document.documentElement.scrollWidth <= innerWidth; });
    check('board and buttons fit at ' + w + '×' + h, ok);
    await shot(p, 'en-' + n);
  }
  await p.ctx.close();
}

// ---------------------------------------------------------------- online through the Firebase emulators
async function online(browser, env) {
  console.log('7. online (emulator): friend code → moves → resign; disconnect → win after the wait');
  const emu = await require('./rules/emulator').start({});
  const T = { name: 'emulator', emu: true, ports: emu.ports, ns: emu.ns };
  const { newPage } = require('./rules/clients');
  try {
    const mk = async nick => { const p = await newPage(browser, env, T, nick, { width: 390, height: 844 }); await p.goto(env.url + '/shogi/index.html?debug&disc=4'); await p.waitForFunction(() => window.__shogi && __shogi.ready()); return p; };
    const A = await mk('Aoi'), Bp = await mk('Ben');
    await A.click('#tOnline'); await A.click('#onTc button:nth-child(1)'); await A.click('#onHost');
    await A.waitForFunction(() => __shogi.net.code, null, { timeout: 20000 });
    const code = await A.evaluate(() => __shogi.net.code);
    check('host gets a 6-digit room code', /^\d{6}$/.test(code), code);
    await shot(A, 'online-code');
    await Bp.click('#tOnline'); await Bp.fill('#onCode', code); await Bp.click('#onJoin');
    for (const p of [A, Bp]) await p.waitForFunction(() => __shogi.net.phase === 'play', null, { timeout: 30000 });
    const sa = await st(A), sb = await st(Bp);
    check('both in the same room, one black and one white', sa.net.rid === sb.net.rid && sa.net.side !== sb.net.side);
    const black = sa.net.side === 0 ? A : Bp, white = black === A ? Bp : A;
    for (const [i, u] of ['7g7f', '3c3d', '6g6f', '8c8d'].entries()) {
      const p = i % 2 ? white : black;
      await waitTurn(p, i);
      await clickMove(p, u);
    }
    await black.waitForFunction(() => __shogi.state().moves.length === 4, null, { timeout: 10000 });
    await sleep(2200); // black to move: its clock runs
    const clk = await black.textContent('#cBot');
    check('10-minute clock is shown and running', /^[0-9]+:[0-9]{2}$/.test(clk) && clk !== '10:00', clk);
    await shot(black, 'online-game');
    await black.click('#bResign'); await sleep(200); await black.click('.kb-layer .kb-btn--danger');
    for (const p of [A, Bp]) await p.waitForFunction(() => !document.getElementById('ovResult').hidden, null, { timeout: 15000 });
    check('white wins by resignation on both pages', (await white.textContent('#resBig')) === 'あなたの勝ち' && (await black.textContent('#resBig')) === 'あなたの負け');
    const rs = await Promise.all([A, Bp].map(p => p.evaluate(() => __shogi.save.on)));
    check('online records and ratings updated', rs.some(o => o.w === 1 && o.r > 1500) && rs.some(o => o.l === 1 && o.r < 1500), rs);
    await shot(white, 'online-result');
    // rematch, then black disconnects (closes the page) → white wins after the wait (?disc=4)
    for (const p of [A, Bp]) { await p.click('#resAgain'); await sleep(300); }
    for (const p of [A, Bp]) await p.waitForFunction(() => __shogi.net.phase === 'play' && __shogi.state().moves.length === 0, null, { timeout: 30000 });
    const s2 = await st(A);
    const black2 = s2.net.side === 0 ? A : Bp, white2 = black2 === A ? Bp : A;
    check('rematch: colours swapped', black2 === white);
    await black2.ctx.close();
    await white2.waitForFunction(() => /接続/.test(__shogi.state().status), null, { timeout: 20000 });
    await shot(white2, 'online-disconnect');
    await white2.waitForFunction(() => !document.getElementById('ovResult').hidden, null, { timeout: 20000 });
    const why = await white2.textContent('#resWhy');
    check('opponent gone → win by disconnection', (await white2.textContent('#resBig')) === 'あなたの勝ち' && /接続切れ/.test(why), why);
    check('no page errors on the remaining page', !white2.errs.some(e => /pageerror|permission/i.test(e)), white2.errs);
    await white2.ctx.close();
  } finally { await emu.stop(); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const env = await server.start();
  const browser = await chromium.launch();
  try {
    if (!process.argv.includes('--only-online')) {
    await cpuToMate(browser, env);
    await controls(browser, env);
    await resume(browser, env);
    await tsume(browser, env);
    await english(browser, env);
    }
    if (!NO_ONLINE) await online(browser, env);
  } catch (e) { check('run finished', false, String(e && e.stack || e)); }
  finally { await browser.close(); await env.close(); }
  const bad = results.filter(r => !r.ok).length;
  console.log(`\nshogi-play: ${results.length - bad} ok, ${bad} failed. shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(bad ? 1 : 0);
})();
