#!/usr/bin/env node
// おもちゃ大乱闘のオンライン1対1の通し（Playwright。本物のブラウザ2ページ ＋ Firebase エミュレーター ＋ bw/ のルール）。
//   node tools/tests/brawl-online-play.js [lobby,quick,room,devices,forfeit,desync,perf]
// ・ページは ?debug&netlat=…&netjit=…&netloss=… で、受け取る入力にわざと遅れ・ゆれ・取りこぼし（％）を入れる（片道。往復はその2倍）
// ・入力は __bwBot（?debug の試験用）：いまの状態のコピーを CPU に聞く（人のように見えているものに反応する）。devices だけは本物のキー・タッチ・ゲームパッド
// ・見ること：2ページの最後の状態の指紋と勝者が同じ・60フレームごとの指紋が同じ・ロールバックの深さと1フレームの重さ・切断（不戦勝）・ずれ（desync）の検出・
//   もう一度（席のいれかえ）・ルールが許したこと／拒否したことでエラーが出ていない・320px（ja/en・明るい／暗い）
// ルールはリポジトリの database.rules.json の bw（エミュレーターに読み込ませる）。
'use strict';
const path = require('path');
const fs = require('fs');
const server = require('./lib/server');
const B = require('./lib/browser');
const { newPage } = require('./rules/clients');
const { mergedRules } = require('./rules/brawl-rules');

const OUT = path.join(__dirname, 'out', 'shots', 'brawl-online');
fs.mkdirSync(OUT, { recursive: true });
const results = [], metrics = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 700)}`); };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const HOWTO = 'kusoge.brawl.howto';

let emu, T, srv, browser;
async function mk(nick, q, o = {}) {
  const p = await newPage(browser, { url: srv.url }, T, nick, o.vp || { width: 844, height: 390 });
  await p.ctx.addInitScript(([k, l]) => { try { localStorage.setItem(k, '1'); if (l) localStorage.setItem('kobo.lang', l); } catch (e) {} }, [HOWTO, o.lang || 'ja']);
  if (o.init) await p.ctx.addInitScript(o.init);
  await p.goto(srv.url + '/brawl/?debug' + (q || ''));
  await p.waitForFunction(() => window.__kb && __kb.ready() && window.__brawl && __brawl.ON);
  return p;
}
const ons = p => p.evaluate(() => __brawl.ON.state());
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
async function openOnline(p, nick) {
  await p.click('#mOnline');
  await p.waitForSelector('#ovOnline:not([hidden]) #olNick');
  await p.fill('#olNick', nick);
}
const bot = p => p.evaluate(() => { window.__bwBot = (st, me) => { const E = __brawl.E, c = E.clone(st); c.fighters[me].lvl = 2; return E.cpu(c, me); }; });
const waitPhase = (p, ph, ms) => p.waitForFunction(ph => __brawl.ON.state().phase === ph, ph, { timeout: ms || 30000 });
async function pickAndReady(p, ch) {
  if (ch) await p.click(`#olPick [data-id="${ch}"]`);
  await p.click('[data-a="ready"]');
}
// 計測：1フレームぶんの update の時間と、rAF の間隔
async function instrument(p) {
  await p.evaluate(() => {
    window.__upd = []; window.__raf = [];
    const m = __brawl.G.net, o = m.update.bind(m); m.update = dt => { const t = performance.now(); o(dt); window.__upd.push(performance.now() - t); };
    let last = performance.now(); const f = t => { window.__raf.push(t - last); last = t; if (window.__raf.length < 20000) requestAnimationFrame(f); }; requestAnimationFrame(f);
  });
}
const pct = (a, q) => { if (!a.length) return 0; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.floor(s.length * q))]; };
async function collect(p) {
  return p.evaluate(() => {
    const s = __brawl.ON.state(), u = window.__upd || [], r = window.__raf || [];
    return { s, ck: __brawl.ON.checkpoints(), upd: u, raf: r, save: JSON.parse(localStorage.getItem('kusoge.brawl.save') || 'null'), hud: (document.getElementById('olHud') || {}).textContent || '' };
  });
}
function compare(label, A, Bc) {
  const ma = A.s.match, mb = Bc.s.match;
  check(label + ': both finished the same way', ma && mb && ma.done === mb.done && ma.result && mb.result && ma.result.why === mb.result.why, { a: ma && ma.result, b: mb && mb.result });
  check(label + ': same winner', ma.win === mb.win, { a: ma.win, b: mb.win });
  check(label + ': identical final state hash', ma.hash === mb.hash, { a: ma.hash, b: mb.hash });
  const common = Object.keys(A.ck).filter(f => f in Bc.ck);
  const bad = common.filter(f => A.ck[f] !== Bc.ck[f]);
  check(label + ': every 60-frame checkpoint identical (' + common.length + ' compared)', common.length >= 5 && !bad.length, { common: common.length, bad: bad.slice(0, 5) });
}
function report(label, A, Bc, extra) {
  const m = A.s.match, mb = Bc.s.match, up = A.upd.concat(Bc.upd), raf = A.raf.concat(Bc.raf);
  const jank = raf.filter(x => x > 50).length, over = raf.filter(x => x > 25).length;
  const o = { label, frames: m.f, rtt: [m.rtt, mb.rtt], delay: [m.delay, mb.delay], rollbacks: [m.stats.rollbacks, mb.stats.rollbacks], maxRollbackDepth: Math.max(m.stats.maxRb, mb.stats.maxRb), resimFrames: [m.stats.resim, mb.stats.resim],
    waits: [m.stats.stalls, mb.stats.stalls], skips: [m.stats.skips, mb.stats.skips], tickMs: { p50: +pct(up, 0.5).toFixed(2), p95: +pct(up, 0.95).toFixed(2), max: +Math.max(0, ...up).toFixed(2) },
    rafOver25ms: over, rafOver50ms: jank, rafFrames: raf.length, sendFails: [m.sendFails, mb.sendFails], hashWrites: [m.hashWrote, mb.hashWrote] };
  Object.assign(o, extra || {}); metrics.push(o);
  console.log('    [metrics] ' + JSON.stringify(o));
}
// 部屋を出る／消えるときは、ちょうど書いていた入力が1〜2回だけ「もう部屋がない」で拒否されることがある（無害：ルールが守っている）。それだけは許す
const RACE = /FIREBASE WARNING: set at \/bw\/rooms\/[^/]+\/in\/[^ ]+ failed: permission_denied/;
const noErr = (label, ...pages) => {
  const all = pages.flatMap(p => p.errs), race = all.filter(m => RACE.test(m)), e = all.filter(m => !RACE.test(m));
  check(label + ': no page errors / permission errors' + (race.length ? ' (besides ' + race.length + ' input write refused just as the room was removed)' : ''), !e.length && race.length <= 2, e.slice(0, 4).concat(race.length > 2 ? ['race x' + race.length] : []));
};

// ---------------------------------------------------------------------------------------------------------------- lobby (no second player)
async function lobby() {
  console.log('1. lobby: title button, nickname required, 320px ja/en, light/dark, keyboard, back');
  for (const [lang, scheme] of [['ja', 'dark'], ['en', 'light']]) {
    const p = await mk('', '', { vp: { width: 320, height: 568 }, lang });
    await p.emulateMedia({ colorScheme: scheme });
    await p.evaluate(() => localStorage.removeItem('kobo.nick'));
    check(lang + ': the title has the online button', await p.isVisible('#mOnline'), null);
    await p.click('#mOnline'); await p.waitForSelector('#ovOnline:not([hidden]) #olNick');
    await p.fill('#olNick', ''); await p.click('[data-a="quick"]');
    await p.waitForFunction(() => document.querySelector('#ovOnline .olerr').textContent.length > 0);
    check(lang + ': an empty nickname is refused with a message', true, null);
    const fit = await p.evaluate(() => { const c = document.querySelector('#ovOnline .card'), r = c.getBoundingClientRect(); return { sw: c.scrollWidth, cw: c.clientWidth, l: r.left, rt: r.right, vw: innerWidth, bodyOverflow: document.documentElement.scrollWidth > innerWidth }; });
    check(lang + ' 320px: the card fits the screen (no sideways overflow)', fit.sw <= fit.cw + 1 && fit.l >= 0 && fit.rt <= fit.vw + 1 && !fit.bodyOverflow, fit);
    if (lang === 'en') { const t = await p.textContent('#ovOnline .card'); check('en: texts are English', /Quick match/.test(t) && /Make a room/.test(t) && !/[ぁ-ん]/.test(t.replace(/ホスト/g, '')), t.slice(0, 200)); }
    await shot(p, 'lobby-' + lang + '-' + scheme);
    await p.fill('#olCode', '12'); await p.click('[data-a="join"]');
    await p.waitForFunction(() => { const e = document.querySelector('#ovOnline .olerr'); return e && e.textContent.length > 0; });
    await p.keyboard.press('Escape');
    await p.waitForFunction(() => document.getElementById('ovOnline').hidden && !document.getElementById('ovTitle').hidden, null, { timeout: 5000 });
    check(lang + ': Escape goes back to the title', true, null);
    await p.ctx.close();
  }
  // コードの形がおかしい／ない部屋
  const p = await mk('Aoi', '');
  await openOnline(p, 'Aoi');
  await p.fill('#olCode', '12ab'); await p.click('[data-a="join"]');
  await p.waitForFunction(() => { const e = document.querySelector('#ovOnline .olerr'); return e && /6/.test(e.textContent); });
  check('a code that is not 6 digits is refused', true, null);
  await p.fill('#olCode', '999999'); await p.click('[data-a="join"]');
  await p.waitForFunction(() => { const e = document.querySelector('#ovOnline .olerr'); return e && /見つかりません|not found/i.test(e.textContent); }, null, { timeout: 20000 });
  check('a code with no room says room not found', true, null);
  noErr('lobby', p);
  await p.ctx.close();
}

// ---------------------------------------------------------------------------------------------------------------- one full match through the lobby
async function playMatch(label, q, o = {}) {
  const A = await mk('Aoi', q), Bp = await mk('Ben', q);
  await openOnline(A, 'Aoi'); await openOnline(Bp, 'Ben');
  let codeText = null;
  if (o.code) {
    await A.click('[data-a="make"]'); await A.waitForSelector('.olcode', { timeout: 30000 });
    codeText = (await A.textContent('.olcode')).trim();
    check(label + ': the room shows a 6-digit code', /^\d{6}$/.test(codeText), codeText);
    await Bp.fill('#olCode', codeText); await Bp.click('[data-a="join"]');
  } else {
    await A.click('[data-a="quick"]'); await sleep(400); await Bp.click('[data-a="quick"]');
  }
  await waitPhase(A, 'room', 40000); await waitPhase(Bp, 'room', 40000);
  await A.waitForFunction(() => Object.keys(__brawl.ON.state().seats).length === 2, null, { timeout: 20000 });
  await Bp.waitForFunction(() => Object.keys(__brawl.ON.state().seats).length === 2, null, { timeout: 20000 });
  const sa = await ons(A), sb = await ons(Bp);
  check(label + ': both are in the same room, exactly one is the host' + (o.code ? ' (the creator)' : ''), sa.rid && sa.rid === sb.rid && sa.host !== sb.host && (!o.code || sa.host), { a: sa.rid, b: sb.rid, ha: sa.host, hb: sb.host });
  const HP = sa.host ? A : Bp, GP = sa.host ? Bp : A;
  // the characters are picked and synced
  await A.click('#olPick [data-id="duck"]'); await Bp.click('#olPick [data-id="bear"]');
  const both = () => { const s = __brawl.ON.state().seats; return s[0] && s[1] && [s[0].c, s[1].c].sort().join() === 'bear,duck'; };
  await A.waitForFunction(both, null, { timeout: 15000 });
  await Bp.waitForFunction(both, null, { timeout: 15000 });
  check(label + ': character picks are synced to both pages', true, null);
  if (o.stage) { await HP.click(`#olStages [data-id="${o.stage}"]`); await GP.waitForFunction(s => __brawl.ON.state().cfg.s === s, o.stage, { timeout: 15000 }); check(label + ': the host\'s stage choice reaches the guest', true, null); }
  check(label + ': the guest cannot choose the stage (no stage buttons)', !(await GP.$('#olStages')), null);
  await sleep(2500); // let the lobby measure the ping
  await shot(A, label + '-room-host'); await shot(Bp, label + '-room-guest');
  const pingA = (await ons(A)).rtt;
  await pickAndReady(A, null); await sleep(300);
  check(label + ': one ready is not enough to start', (await ons(A)).phase === 'room', null);
  await pickAndReady(Bp, null);
  await waitPhase(A, 'play', 30000); await waitPhase(Bp, 'play', 30000);
  await Promise.all([bot(A), bot(Bp)]);
  await A.waitForFunction(() => __brawl.G && __brawl.G.net && __brawl.G.net.phase === 'play', null, { timeout: 20000 });
  await Bp.waitForFunction(() => __brawl.G && __brawl.G.net && __brawl.G.net.phase === 'play', null, { timeout: 20000 });
  await Promise.all([instrument(A), instrument(Bp)]);
  const gA = (await ons(A)).go, gB = (await ons(Bp)).go;
  check(label + ': both pages got the same go (seed, stage, order)', JSON.stringify(gA) === JSON.stringify(gB) && gA.g === 1, { gA, gB });
  const seatsNow = (await ons(A)).seats, chOf = {}; for (const k of Object.keys(seatsNow)) chOf[seatsNow[k].u] = seatsNow[k].c;
  check(label + ': sides: the host is on the left, and each toy follows its player', gA.pl[0] === (sa.host ? sa.uid : sb.uid) && gA.c[0] === chOf[gA.pl[0]] && gA.c[1] === chOf[gA.pl[1]], { gA, chOf });
  await sleep(6000);
  const mid = await collect(A);
  check(label + ': the HUD shows ping' + (q.includes('netlat') ? ' (and some rollback)' : ''), /ms/.test(mid.hud), mid.hud);
  await shot(A, label + '-match-A'); await shot(Bp, label + '-match-B');
  await A.waitForSelector('#ovResult:not([hidden])', { timeout: o.wait || 120000 }); await Bp.waitForSelector('#ovResult:not([hidden])', { timeout: 30000 });
  const [ca, cb] = [await collect(A), await collect(Bp)];
  compare(label, ca, cb);
  report(label, ca, cb, { lobbyPingMs: pingA, reason: ca.s.match.result && ca.s.match.result.why });
  const title = await A.textContent('#rTitle'), titleB = await Bp.textContent('#rTitle');
  check(label + ': one side wins and the other loses (or a draw on both)', ca.s.match.win < 0 ? titleB === title : title !== titleB, { title, titleB });
  check(label + ': online result is counted as plays/wins only; no ladder score or points', ca.save && ca.save.stats.op === 1 && (ca.save.stats.ow | 0) + (cb.save.stats.ow | 0) === (ca.s.match.win >= 0 ? 1 : 0) && ca.save.best === 0 && ca.save.stats.plays === 0 && ca.save.stats.wins === 0, { a: ca.save && ca.save.stats, b: cb.save && cb.save.stats });
  await shot(A, label + '-result-A');
  noErr(label, A, Bp);
  return { A, Bp, ca, cb, codeText };
}

async function quick() {
  console.log('2. quick match, 80 ms one way (rtt ~160), jitter 15, KO or time up');
  const q = '&netlat=80&netjit=15&olstk=1&olcap=35&netseed=7';
  const r = await playMatch('quick80', q, { wait: 150000 });
  // rematch with swapped sides
  const { A, Bp } = r;
  const g1 = (await ons(A)).go;
  await A.click('#rNext'); await sleep(500);
  check('rematch: the first click shows waiting', /待って|Waiting/.test(await A.textContent('#rNext')), await A.textContent('#rNext'));
  await Bp.click('#rNext');
  await A.waitForFunction(() => __brawl.ON.state().go.g === 2 && __brawl.G.net && __brawl.G.net.phase !== undefined && __brawl.ON.state().phase === 'play', null, { timeout: 30000 });
  await Bp.waitForFunction(() => __brawl.ON.state().go.g === 2 && __brawl.ON.state().phase === 'play', null, { timeout: 30000 });
  const g2 = (await ons(A)).go;
  check('rematch: game 2 swaps the sides', g2.g === 2 && g2.pl[0] === g1.pl[1] && g2.pl[1] === g1.pl[0] && g2.c[0] === g1.c[1], { g1, g2 });
  await Promise.all([bot(A), bot(Bp)]); await Promise.all([instrument(A), instrument(Bp)]);
  await A.waitForSelector('#ovResult:not([hidden])', { timeout: 150000 }); await Bp.waitForSelector('#ovResult:not([hidden])', { timeout: 30000 });
  const [ca, cb] = [await collect(A), await collect(Bp)];
  compare('rematch', ca, cb); report('rematch', ca, cb);
  check('rematch: plays counted twice', ca.save.stats.op === 2 && cb.save.stats.op === 2, { a: ca.save.stats, b: cb.save.stats });
  // the first quit leaves cleanly: the other sees the opponent left
  await A.click('#rMenu');
  await A.waitForSelector('#ovTitle:not([hidden])', { timeout: 10000 });
  await Bp.waitForFunction(() => { const b = document.getElementById('rNext'); return /出ました|left/.test(b.textContent) && b.disabled; }, null, { timeout: 15000 });
  check('leaving: the other side sees "opponent left" and cannot rematch', true, null);
  await Bp.click('#rMenu'); await Bp.waitForSelector('#ovTitle:not([hidden])', { timeout: 10000 });
  noErr('rematch', A, Bp);
  await A.ctx.close(); await Bp.ctx.close();
}
async function room() {
  console.log('3. room code, 150 ms one way (rtt ~300), jitter 40, 5% of the opponent\'s inputs dropped');
  const q = '&netlat=150&netjit=40&netloss=5&olstk=1&olcap=30&netseed=11';
  const r = await playMatch('room150', q, { code: true, stage: 'box', wait: 150000 });
  // the room is cleaned up when the host leaves
  const rid = (await ons(r.A)).rid;
  await r.A.click('#rMenu'); await r.A.waitForSelector('#ovTitle:not([hidden])', { timeout: 10000 }); await sleep(1500);
  const left = await r.Bp.evaluate(async rid => { const v = (await firebase.database().ref('bw/rooms/' + rid + '/meta').once('value')).val(); return v; }, rid);
  check('when the host leaves, the room is removed from the database', left === null, left);
  const codeLeft = await r.Bp.evaluate(async code => (await firebase.database().ref('bw/codes/' + code).once('value')).val(), r.codeText);
  check('and its code is removed', codeLeft === null, codeLeft);
  await r.Bp.ctx.close(); await r.A.ctx.close();
}

// ---------------------------------------------------------------------------------------------------------------- real keyboard, touch and gamepad inside an online match
async function devices() {
  console.log('4. keyboard, touch and gamepad drive the fighter in an online match (no latency)');
  const fakePad = () => { window.__pad = { axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), connected: true, id: 'fake', index: 0 }; navigator.getGamepads = () => [window.__pad]; };
  const A = await mk('Aoi', '&olstk=1&olcap=60&olLead=2200', { init: fakePad }), Bp = await mk('Ben', '&olstk=1&olcap=60&olLead=2200');
  await openOnline(A, 'Aoi'); await openOnline(Bp, 'Ben');
  await A.click('[data-a="make"]'); await A.waitForSelector('.olcode', { timeout: 30000 });
  const code = (await A.textContent('.olcode')).trim(); await Bp.fill('#olCode', code); await Bp.click('[data-a="join"]');
  await Bp.waitForFunction(() => Object.keys(__brawl.ON.state().seats).length === 2, null, { timeout: 30000 });
  await A.waitForFunction(() => Object.keys(__brawl.ON.state().seats).length === 2, null, { timeout: 30000 });
  await pickAndReady(A); await pickAndReady(Bp);
  await waitPhase(A, 'play', 30000); await waitPhase(Bp, 'play', 30000);
  await A.waitForFunction(() => __brawl.G.net.phase === 'play', null, { timeout: 20000 });
  await Bp.waitForFunction(() => __brawl.G.net.phase === 'play', null, { timeout: 20000 });
  await sleep(1200); // fall to the floor
  const fx = p => p.evaluate(() => { const s = __brawl.G.net.st(); return s.fighters.map(f => ({ x: Math.round(f.x), y: Math.round(f.y), face: f.face, s: f.s, pct: Math.round(f.pct) })); });
  const x0 = (await fx(A))[0].x;
  await A.keyboard.down('KeyD'); await sleep(900); await A.keyboard.up('KeyD'); await sleep(300);
  const x1 = (await fx(A))[0].x, xb1 = (await fx(Bp))[0].x;
  check('keyboard: holding D moves my fighter right (and the other page sees the same position)', x1 > x0 + 30 && Math.abs(x1 - xb1) <= 0, { x0, x1, xb1 });
  await A.keyboard.down('KeyA'); await sleep(700); await A.keyboard.up('KeyA'); await sleep(300);
  const x2 = (await fx(A))[0].x; check('keyboard: A moves back left', x2 < x1 - 20, { x1, x2 });
  // touch: the left stick zone
  await A.evaluate(() => { document.body.classList.remove('notouch'); });
  const zone = await A.evaluate(() => { const r = document.querySelector('.zone.l').getBoundingClientRect(); return { x: r.left + 60, y: r.top + r.height * 0.6 }; });
  const x3 = (await fx(A))[0].x;
  await A.mouse.move(zone.x, zone.y); await A.mouse.down(); await A.mouse.move(zone.x + 70, zone.y, { steps: 4 }); await sleep(800); await A.mouse.up(); await sleep(300);
  const x4 = (await fx(A))[0].x; check('touch: dragging the stick right moves my fighter right', x4 > x3 + 20, { x3, x4 });
  // gamepad: analog stick left
  const x5 = (await fx(A))[0].x;
  await A.evaluate(() => { __pad.axes[0] = -1; }); await sleep(800); await A.evaluate(() => { __pad.axes[0] = 0; }); await sleep(300);
  const x6 = (await fx(A))[0].x; check('gamepad: the analog stick moves my fighter', x6 < x5 - 20, { x5, x6 });
  // the guest does nothing: its fighter stays (the opponent\'s moves did not leak into it)
  const xb = (await fx(Bp))[1].x, xb0 = (await fx(A))[1].x; check('the other fighter has not moved on either page (and both agree)', Math.abs(xb - xb0) <= 1, { xb, xb0 });
  // Escape asks to leave; "keep playing" goes on
  await A.keyboard.press('Escape'); await A.waitForSelector('#olAsk');
  const f1 = (await ons(A)).match.f; await sleep(500); const f2 = (await ons(A)).match.f;
  check('the leave dialog does not pause the match', f2 > f1 + 15, { f1, f2 });
  await shot(A, 'devices-ask');
  await A.click('[data-q="keep"]'); await A.waitForFunction(() => !document.getElementById('olAsk'));
  check('"keep playing" closes the dialog', true, null);
  // forfeit by leaving: A leaves through the dialog, B wins
  await A.keyboard.press('Escape'); await A.waitForSelector('#olAsk'); await A.click('[data-q="leave"]');
  await A.waitForSelector('#ovTitle:not([hidden])', { timeout: 10000 });
  await Bp.waitForSelector('#ovResult:not([hidden])', { timeout: 20000 });
  const sb = await ons(Bp), tb = await Bp.textContent('#rTitle');
  check('forfeit: the other page wins by forfeit when a player leaves', sb.match.result.why === 'forfeit' && sb.match.result.win === sb.match.me && /かち|Victory/.test(tb), { r: sb.match.result, tb });
  const sv = await Bp.evaluate(() => JSON.parse(localStorage.getItem('kusoge.brawl.save'))); check('forfeit win counts as an online win', sv.stats.ow === 1 && sv.stats.op === 1, sv.stats);
  noErr('devices', A, Bp);
  await A.ctx.close(); await Bp.ctx.close();
}
async function forfeit() {
  console.log('5. a page is closed in the middle of the match: the other wins by forfeit within ~2-6 s');
  const A = await mk('Aoi', '&olstk=3&olcap=60&olLead=2200&netlat=40'), Bp = await mk('Ben', '&olstk=3&olcap=60&olLead=2200&netlat=40');
  await openOnline(A, 'Aoi'); await openOnline(Bp, 'Ben');
  await A.click('[data-a="quick"]'); await sleep(300); await Bp.click('[data-a="quick"]');
  await waitPhase(A, 'room', 40000); await waitPhase(Bp, 'room', 40000);
  await pickAndReady(A); await pickAndReady(Bp);
  await waitPhase(A, 'play', 30000); await waitPhase(Bp, 'play', 30000);
  await Promise.all([bot(A), bot(Bp)]);
  await A.waitForFunction(() => __brawl.G.net.phase === 'play' && __brawl.G.net.st().f > 200, null, { timeout: 30000 });
  const t0 = Date.now();
  await Bp.close({ runBeforeUnload: false });
  await A.waitForSelector('#ovResult:not([hidden])', { timeout: 30000 });
  const dt = Date.now() - t0, s = await ons(A), title = await A.textContent('#rTitle');
  check('page closed: the other side gets a forfeit win in ' + dt + ' ms', s.match.result.why === 'forfeit' && /かち|Victory/.test(title) && dt < 9000, { r: s.match.result, title, dt });
  const sub = await A.textContent('#rSub'); check('the result says the opponent disconnected', /切れ|disconnect/i.test(sub), sub);
  noErr('forfeit', A);
  await A.ctx.close();
}
async function desync() {
  console.log('6. a drifting state is detected: both pages end as "desync" with no result, nothing is counted');
  const A = await mk('Aoi', '&olstk=3&olcap=60&olLead=2200&netlat=30'), Bp = await mk('Ben', '&olstk=3&olcap=60&olLead=2200&netlat=30');
  await openOnline(A, 'Aoi'); await openOnline(Bp, 'Ben');
  await A.click('[data-a="quick"]'); await sleep(300); await Bp.click('[data-a="quick"]');
  await waitPhase(A, 'room', 40000); await waitPhase(Bp, 'room', 40000);
  await pickAndReady(A); await pickAndReady(Bp);
  await waitPhase(A, 'play', 30000); await waitPhase(Bp, 'play', 30000);
  await Promise.all([bot(A), bot(Bp)]);
  await A.waitForFunction(() => __brawl.G.net.phase === 'play' && __brawl.G.net.st().f > 150, null, { timeout: 30000 });
  await Bp.evaluate(() => { const s = __brawl.G.net.sess; s.st.fighters[0].pct += 7; for (const sn of s.snap) if (sn && sn.f >= s.st.f - 31) sn.st.fighters[0].pct += 7; });
  await A.waitForSelector('#ovResult:not([hidden])', { timeout: 30000 }); await Bp.waitForSelector('#ovResult:not([hidden])', { timeout: 30000 });
  const [sa, sb] = [await ons(A), await ons(Bp)];
  check('desync: both pages found it and ended with no winner', sa.match.result.why === 'desync' && sb.match.result.why === 'desync' && sa.match.result.win === -1, { a: sa.match.result, b: sb.match.result });
  const ta = await A.textContent('#rTitle'); check('the result card says the match is void', /ずれ|drift/.test(ta), ta);
  const sv = await A.evaluate(() => JSON.parse(localStorage.getItem('kusoge.brawl.save'))); const so = (sv && sv.stats) || {}; check('a desync is not counted as a match or a win', (so.op | 0) === 0 && (so.ow | 0) === 0, so);
  await A.ctx.close(); await Bp.ctx.close();
}

async function perf() {
  console.log('7. cost on a slow device: CPU throttled 4x and 6x (CDP), one-way 150 ms + jitter 40 + 5% drop (the deepest rollbacks)');
  for (const rate of [4, 6]) {
    const q = '&netlat=150&netjit=40&netloss=5&olstk=1&olcap=20&olLead=2500&netseed=' + rate;
    const A = await mk('Aoi', q), Bp = await mk('Ben', q);
    for (const p of [A, Bp]) { const c = await p.ctx.newCDPSession(p); await c.send('Emulation.setCPUThrottlingRate', { rate }); }
    await openOnline(A, 'Aoi'); await openOnline(Bp, 'Ben');
    await A.click('[data-a="quick"]'); await sleep(300); await Bp.click('[data-a="quick"]');
    await waitPhase(A, 'room', 60000); await waitPhase(Bp, 'room', 60000);
    await pickAndReady(A); await pickAndReady(Bp);
    await waitPhase(A, 'play', 60000); await waitPhase(Bp, 'play', 60000);
    await Promise.all([bot(A), bot(Bp)]);
    await A.waitForFunction(() => __brawl.G.net.phase === 'play', null, { timeout: 30000 }); await Bp.waitForFunction(() => __brawl.G.net.phase === 'play', null, { timeout: 30000 });
    await Promise.all([instrument(A), instrument(Bp)]);
    await A.waitForSelector('#ovResult:not([hidden])', { timeout: 120000 }); await Bp.waitForSelector('#ovResult:not([hidden])', { timeout: 60000 });
    const [ca, cb] = [await collect(A), await collect(Bp)];
    compare('cpu x' + rate, ca, cb); report('cpu x' + rate, ca, cb, { throttle: rate });
    await A.ctx.close(); await Bp.ctx.close();
  }
}

(async () => {
  const only = process.argv[2] && !process.argv[2].startsWith('-') ? process.argv[2].split(',') : null;
  emu = await require('./rules/emulator').start({});
  const m = mergedRules();
  const r = await fetch(`http://127.0.0.1:${emu.ports.database}/.settings/rules.json?ns=${emu.ns}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: m.text });
  if (!r.ok) { console.error('rules rejected', await r.text()); process.exit(2); }
  console.log('rules: database.rules.json (bw)');
  T = { name: 'emulator', emu: true, ports: emu.ports, ns: emu.ns };
  srv = await server.start(); browser = await B.launch();
  const t0 = Date.now();
  for (const f of [lobby, quick, room, devices, forfeit, desync, perf]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 900)); }
  }
  await browser.close(); await srv.close(); await emu.stop();
  fs.writeFileSync(path.join(OUT, 'metrics.json'), JSON.stringify(metrics, null, 1));
  const fail = results.filter(x => !x.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
