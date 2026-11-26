#!/usr/bin/env node
// ワードウルフの通しプレイ（Playwright。?debug の window.__wordwolf / __kb.state() は「いまの状態」を聞くだけで、押すのは本物のマウス・タッチ）
//   node tools/tests/wordwolf-play.js [first,solo,local,two,english,layouts,online]   （--no-online：エミュレーターを使う online を省く）
// 1. 初回：ルール → タイトル  2. ひとりで（CPU）：ことば → ヒントカード → 投票 → 結果・保存  3. 1台をまわす4人：おして見る → 話題カード → タイマー → 1人ずつ投票 → 逆転 → 点数
// 4. ウルフ2人＋「ウルフは知っている」（ひとり・みんなで）  5. 英語  6. 画面サイズ（はみ出し・日本語のこり）  7. オンライン（エミュレーター）：コードの部屋に2人＋CPU → 1ゲーム → もう一回
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');

const OUT = path.join(__dirname, 'out', 'shots', 'wordwolf-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.wordwolf.save', HOWTO = 'kusoge.wordwolf.howto';
const st = p => p.evaluate(() => __kb.state());
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 15000 });
async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed === undefined ? { [HOWTO]: '1' } : o.seed, isMobile: true, hasTouch: false });
  await s.goto('/wordwolf/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__wordwolf);
  return s;
}
const setSet = (p, o) => p.evaluate(o => __wordwolf.setSet(o), o);
const phase = p => p.evaluate(() => __kb.state().phase);
// hold the word card with the real mouse, read it, release
async function holdAndRead(p) {
  const box = await (await p.$('#wcard')).boundingBox();
  await p.mouse.move(box.x + box.width / 2, box.y + box.height / 2); await p.mouse.down();
  const txt = await p.textContent('#wcard'); const open = await p.$eval('#wcard', e => e.classList.contains('open'));
  await p.mouse.up();
  const hidden = await p.$eval('#wcard', e => !e.classList.contains('open'));
  return { txt, open, hidden };
}
// one vote screen: pick `need` buttons (first ones that are not disabled) and confirm
async function voteOne(p, prefer) {
  const need = await p.evaluate(() => __wordwolf.G.need);
  const btns = await p.$$('#vpick .pk');
  const picks = prefer && prefer.length ? prefer : [];
  let n = 0;
  for (const b of btns) { if (n >= need) break; const i = +(await b.getAttribute('data-i')); if (picks.length && !picks.includes(i)) continue; await b.click(); n++; }
  for (const b of btns) { if (n >= need) break; const pr = await b.getAttribute('aria-pressed'); if (pr === 'true') continue; await b.click(); n++; }
  await p.click('[data-act="voteOk"]');
}

async function first(env) {
  console.log('1. first visit: the rules, then the title');
  const s = await open(env, { seed: null }); const p = s.page;
  check('the how-to is shown the first time', !!(await p.$('.howto')) && /ルール/.test(await p.textContent('.howto')), null);
  await p.click('[data-act="howGo"]');
  check('the title offers solo, pass-the-phone, online and the rules', !!(await p.$('#mSolo')) && !!(await p.$('#mLocal')) && !!(await p.$('#mOnline')) && !!(await p.$('#mHow')), null);
  check('the how-to is remembered', await p.evaluate(k => localStorage.getItem(k), HOWTO) === '1', null);
  await shot(p, '01-title'); await s.close();
}
async function solo(env) {
  console.log('2. solo vs CPUs: word card → hint cards → vote → result → saved');
  const s = await open(env); const p = s.page;
  await setSet(p, { cpus: 4, rounds: 2, skill: 2, wolves: 1, knows: false, lv: 0, cats: [] });
  await p.click('#mSolo'); await p.click('[data-act="start"]'); await wait(p, () => __kb.state().phase === 'word');
  const r = await holdAndRead(p); const sv = await st(p);
  check('holding the card shows the word and releasing hides it', r.open && r.hidden && r.txt.includes(sv.words[0]), r);
  await p.click('[data-act="wordDone"]'); await wait(p, () => __kb.state().phase === 'hints');
  check('5 players: 4 CPUs with personality tags, 1 or more wolves', sv.n === 5 && sv.k === 1, sv);
  let guard = 0, cards = 0;
  while ((await phase(p)) === 'hints' && guard++ < 40) {
    if (await p.$('[data-act="myHint"]')) {
      const n = (await p.$$('[data-act="myHint"]')).length; cards = Math.max(cards, n);
      if (guard === 2) { const t0 = await p.textContent('#hintPick'); await p.click('[data-act="moreCards"]'); check('"show other cards" swaps the hint cards', t0 !== await p.textContent('#hintPick'), null); }
      await (await p.$('[data-act="myHint"]')).click();
    } else if (await p.$('[data-act="cpuNext"]')) await p.click('[data-act="cpuNext"]');
    else if (await p.$('[data-act="toVote"]')) break;
    await p.waitForTimeout(20);
  }
  check('hint cards are offered (up to 8 at a time, never free text)', cards >= 5 && cards <= 8 && !(await p.$('textarea')), cards);
  check('CPU lines carry personality tags', (await p.$$('.ptag')).length >= 4, null);
  await shot(p, '02-hints');
  await p.click('[data-act="toVote"]'); await wait(p, () => __kb.state().phase === 'vote');
  await voteOne(p); await wait(p, () => __kb.state().phase === 'tally');
  check('the tally lists every voter', (await p.$$('#view .kv span')).length >= 3 * 6, null);
  await p.click('[data-act="afterTally"]');
  for (let i = 0; i < 6 && (await phase(p)) !== 'result'; i++) {
    const ph = await phase(p);
    if (ph === 'vote') { await voteOne(p); await wait(p, () => __kb.state().phase === 'tally'); await p.click('[data-act="afterTally"]'); }
    else if (ph === 'guess') { await (await p.$('#gpick .pk')).click(); await p.click('[data-act="guessOk"]'); }
    else await p.waitForTimeout(100);
  }
  await wait(p, () => __kb.state().phase === 'result');
  const e = await st(p);
  check('a result with both words and a score table', !!(await p.$('.w2')) && !!(await p.$('#score')) && e.outcome && ['village', 'wolf'].includes(e.outcome.winner), e.outcome);
  check('stats and rank were saved (solo game counts)', e.stats.games === 1 && e.stats.soloGames === 1 && e.rank >= 1 && await p.evaluate(k => !!localStorage.getItem(k), SAVE), e.stats);
  await shot(p, '02-result'); await p.click('[data-act="again"]'); await wait(p, () => __kb.state().phase === 'word');
  check('"play again" deals a new game', true, null); await s.close();
}
async function local(env) {
  console.log('3. pass the phone, 4 players: hold to reveal → topic card → timer → one vote each → runoff/guess → points');
  const s = await open(env); const p = s.page;
  await setSet(p, { n: 4, minutes: 2, reveal: 'hold', wolves: 1, knows: false, lv: 0, cats: [] });
  await p.click('#mLocal'); await p.click('[data-act="start"]'); await wait(p, () => __kb.state().phase === 'pass');
  const sv = await st(p), seen = [];
  for (let i = 0; i < 4; i++) {
    check('cover screen names player ' + (i + 1) + ' and shows no word', (await phase(p)) === 'pass' && !(await p.textContent('#view')).includes(sv.words[i]), null);
    await p.click('[data-act="passOk"]'); await wait(p, () => __kb.state().phase === 'word');
    check('the word is hidden before holding', !(await p.textContent('#wcard')).includes(sv.words[i]), null);
    const r = await holdAndRead(p); seen.push(r.txt.includes(sv.words[i]));
    await p.click('[data-act="wordDone"]');
  }
  check('each player saw their own word while holding', seen.every(Boolean), seen);
  await wait(p, () => __kb.state().phase === 'talk');
  await p.click('[data-act="tmCard"]'); const t1 = await p.textContent('#topic'); check('a topic card appears', t1.length > 5, t1);
  await p.click('[data-act="tmCard"]'); check('another card differs', (await p.textContent('#topic')) !== t1, null);
  await p.click('[data-act="tmPlus"]'); await p.click('#tmPause'); const l1 = (await st(p)).timer.left; await p.waitForTimeout(400); check('pause freezes the timer', (await st(p)).timer.left === l1 && (await st(p)).timer.paused, null);
  await p.click('#tmPause'); await p.evaluate(() => __wordwolf.shiftTimer(1e9)); check('the timer rings at zero', /時間/.test(await p.textContent('.prompt')), null);
  await shot(p, '03-talk');
  await p.click('[data-act="toVote"]');
  for (let r = 0; r < 3; r++) {
    for (let i = 0; i < 4; i++) { await wait(p, () => __kb.state().phase === 'pass'); await p.click('[data-act="passOk"]'); await wait(p, () => __kb.state().phase === 'vote'); await voteOne(p); }
    await wait(p, () => __kb.state().phase === 'tally'); await p.click('[data-act="afterTally"]');
    const ph = await phase(p); if (ph !== 'pass' && ph !== 'vote') break; if (ph === 'vote') break;
    const s2 = await st(p); if (s2.cands == null && !(s2.res && s2.res.next === 'revote')) break;
  }
  for (let i = 0; i < 10 && (await phase(p)) !== 'result'; i++) {
    const ph = await phase(p);
    if (ph === 'pass') { await p.click('[data-act="passOk"]'); await p.waitForTimeout(60); }
    else if (ph === 'guess') { await (await p.$('#gpick .pk')).click(); await p.click('[data-act="guessOk"]'); }
    else if (ph === 'vote') { await voteOne(p); await p.waitForTimeout(60); }
    else if (ph === 'tally') await p.click('[data-act="afterTally"]');
    else await p.waitForTimeout(100);
  }
  await wait(p, () => __kb.state().phase === 'result'); const e = await st(p);
  check('the score table sums into a session total', e.session && e.session.total.some(x => x > 0) && e.session.games === 1, e.session);
  check('local games do not count for the ranking', e.stats.local === 1 && e.stats.soloGames === 0 && e.rank === 0, e.stats);
  await shot(p, '03-result'); await p.click('[data-act="again"]'); await wait(p, () => __kb.state().phase === 'pass');
  check('"next round" keeps the same members', (await st(p)).session.total.some(x => x > 0), null); await s.close();
}
async function two(env) {
  console.log('4. two wolves + "the wolf knows": 6 players pass-the-phone, a solo game with 2 wolves');
  const s = await open(env); const p = s.page;
  await setSet(p, { n: 6, wolves: 2, knows: true, minutes: 1, reveal: 'hold', lv: 0, cats: [] });
  await p.click('#mLocal'); await p.click('[data-act="start"]'); await wait(p, () => __kb.state().phase === 'pass');
  const sv = await st(p); check('two wolves are dealt and "knows" is on', sv.k === 2 && sv.wolves.length === 2 && sv.knows, sv);
  const notes = [];
  for (let i = 0; i < 6; i++) { await p.click('[data-act="passOk"]'); await wait(p, () => __kb.state().phase === 'word'); await holdAndRead(p).catch(() => {}); const box = await (await p.$('#wcard')).boundingBox(); await p.mouse.move(box.x + 5, box.y + 5); await p.mouse.down(); notes.push(!!(await p.$('.wfnote'))); await p.mouse.up(); await p.click('[data-act="wordDone"]'); if (i < 5) await wait(p, () => __kb.state().phase === 'pass'); }
  check('only the two wolves are told they are wolves', notes.filter(Boolean).length === 2 && sv.wolves.every(w => notes[w]), notes);
  await wait(p, () => __kb.state().phase === 'talk'); await p.click('[data-act="toVote"]');
  await wait(p, () => __kb.state().phase === 'pass'); await p.click('[data-act="passOk"]'); await wait(p, () => __kb.state().phase === 'vote');
  check('with 2 wolves the ballot asks for 2 names', await p.evaluate(() => __wordwolf.G.need) === 2 && /2/.test(await p.textContent('.card .big')), null);
  const bs = await p.$$('#vpick .pk'); await bs[0].click(); await bs[1].click(); await bs[2].click();
  check('picking a third replaces the oldest (still 2 chosen)', (await p.$$('#vpick .pk[aria-pressed="true"]')).length === 2, null); await shot(p, '04-two-wolves');
  await s.close();
  const s2 = await open(env); const q = s2.page; await setSet(q, { cpus: 5, wolves: 2, knows: false, rounds: 1, lv: 0, cats: [] });
  await q.click('#mSolo'); await q.click('[data-act="start"]'); await wait(q, () => __kb.state().phase === 'word');
  const v2 = await st(q); check('solo: 6 players, 2 wolves', v2.n === 6 && v2.k === 2, v2); await s2.close();
}
async function english(env) {
  console.log('5. English');
  const s = await open(env, { lang: 'en' }); const p = s.page;
  check('title in English', /Word Wolf/.test(await p.textContent('h1')) && /Solo vs CPUs/.test(await p.textContent('#view')), null);
  await setSet(p, { cpus: 3, rounds: 1, lv: 0, cats: [] }); await p.click('#mSolo'); check('setup shows wolves and "knows" options', /wolves/i.test(await p.textContent('#view')) && /know/i.test(await p.textContent('#view')), null);
  await p.click('[data-act="start"]'); await wait(p, () => __kb.state().phase === 'word'); const r = await holdAndRead(p); const sv = await st(p);
  check('the word card shows the English gloss', r.open && !/[぀-ヿ一-龯]/.test(r.txt.replace(/\s/g, '')), r.txt);
  await p.click('[data-act="wordDone"]'); await wait(p, () => __kb.state().phase === 'hints'); const txt = await p.textContent('#view'); check('hints screen has no Japanese', !/[぀-ヿ一-龯]/.test(txt), txt.slice(0, 200)); void sv;
  await s.close();
}
async function layouts(env) {
  console.log('6. screen sizes: nothing overflows sideways, no clipped buttons');
  for (const vp of ['se1', 'ip12', 'land']) {
    let vpo; try { vpo = V.get(vp); } catch (e) { continue; }
    const s = await open(env, { vp }); const p = s.page;
    await setSet(p, { cpus: 5, rounds: 1, n: 8, lv: 0, cats: [], wolves: 2 });
    for (const act of ['mSolo', 'mLocal', 'mOnline']) {
      await p.click('#' + act); const o = await p.evaluate(() => { const v = document.getElementById('view'); return { sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth, vw: v.scrollWidth, vc: v.clientWidth }; });
      check(`${vp} ${act} setup: no sideways overflow`, o.sw <= o.cw + 1 && o.vw <= o.vc + 1, o); await p.click('[data-act="toTitle"]');
    }
    await p.click('#mSolo'); await p.click('[data-act="start"]'); await wait(p, () => __kb.state().phase === 'word'); await holdAndRead(p);
    const o2 = await p.evaluate(() => ({ sw: document.documentElement.scrollWidth, cw: document.documentElement.clientWidth })); check(`${vp} word screen: no sideways overflow`, o2.sw <= o2.cw + 1, o2);
    await s.close();
  }
}
async function online(env) {
  console.log('7. online (emulator): code room, 2 pages + CPUs, one full game with hint cards and votes, rematch');
  const emu = await require('./rules/emulator').start({});
  const T = { name: 'emulator', emu: true, ports: emu.ports, ns: emu.ns };
  const { newPage } = require('./rules/clients');
  const url = env.server.url + '/wordwolf/?debug&trdeal=300&trcpu=150&trtm=12&trgrace=6&trhost=8';
  const mk = async nick => {
    const p = await newPage(env.browser(), { url: env.server.url }, T, nick, { width: 390, height: 844 });
    await p.ctx.addInitScript(() => { try { localStorage.setItem('kusoge.wordwolf.howto', '1'); localStorage.setItem('kusoge.wordwolf.save', JSON.stringify({ v: 1, stats: {}, set: { n: 5, rounds: 1, wolves: 1, knows: false, cpus: 3 }, recent: [] })); } catch (e) {} });
    await p.goto(url); await p.waitForFunction(() => window.__kb && __kb.ready() && window.__wordwolf); return p;
  };
  const os = p => p.evaluate(() => __wordwolf.onlineState());
  // a page plays its own turns with real clicks: a hint card on its turn, a vote in the vote phase, a guess if it is the wolf
  const playNet = async (p, until) => {
    for (let i = 0; i < 600; i++) {
      const o = await os(p); if (o.ph === 'e') return o;
      if (await p.$('[data-act="oHint"]')) await (await p.$('[data-act="oHint"]')).click().catch(() => {});
      else if (await p.$('[data-act="oVoteFor"]')) { const bs = await p.$$('[data-act="oVoteFor"]'); await bs[0].click().catch(() => {}); if (await p.$('[data-act="oVoteOk"]:not([disabled])')) await p.click('[data-act="oVoteOk"]').catch(() => {}); else if (bs[1]) { await bs[1].click().catch(() => {}); await p.click('[data-act="oVoteOk"]').catch(() => {}); } }
      else if (await p.$('[data-act="oGuess"]')) await (await p.$('[data-act="oGuess"]')).click().catch(() => {});
      await p.waitForTimeout(40);
    }
    return os(p);
  };
  try {
    const A = await mk('Aoi'), Bp = await mk('Ben');
    await A.click('#mOnline'); await A.click('[data-act="start"]'); await A.waitForSelector('.ktr-ov:not([hidden]) [data-ktr="make"]');
    check('the lobby offers 3-8 players (no 2)', await A.$$eval('.ktr-seg .ktr-opt', bs => bs.map(b => b.dataset.n).join()) === '3,4,5,6,7,8', null);
    await A.click('[data-n="4"]'); await A.click('[data-ktr="make"]'); await A.waitForSelector('[data-ktr="codeshow"]', { timeout: 20000 });
    const code = (await A.textContent('[data-ktr="codeshow"]')).trim();
    await Bp.click('#mOnline'); await Bp.click('[data-act="start"]'); await Bp.waitForSelector('[data-ktr="code"]'); await Bp.fill('[data-ktr="code"]', code); await Bp.click('[data-ktr="join"]');
    await A.waitForFunction(() => document.querySelectorAll('.ktr-seats li:not(.empty)').length >= 2, null, { timeout: 20000 });
    await A.click('[data-ktr="start"]');
    for (const pg of [A, Bp]) await pg.waitForFunction(() => __wordwolf.onlineState().ph === 'h', null, { timeout: 30000 });
    const sts = await Promise.all([A, Bp].map(os));
    check('one room with 4 seats (2 people + 2 CPUs)', sts.every(x => x.names.length === 4 && x.rid === sts[0].rid) && sts.filter(x => x.host).length === 1, sts.map(x => x.names));
    check('each page has a tap-to-show word card and no free text input', !!(await A.$('.owc')) && !!(await Bp.$('.owc')) && !(await A.$('textarea')) && !(await A.$('input[type="text"]')), null);
    await A.click('.owc'); check('tapping the card shows the word', await A.$eval('.owc', e => e.classList.contains('open')), null);
    const probe = await Bp.evaluate(async rid => { try { await firebase.database().ref('tr/wordwolf/rooms/' + rid).once('value'); return 'readable'; } catch (e) { return /permission/i.test(String(e.code || e.message)) ? 'denied' : String(e); } }, sts[0].rid);
    check('a guest cannot read the whole room (words stay with the host)', probe === 'denied', probe);
    await shot(A, '07-hint'); await Promise.all([playNet(A), playNet(Bp)]); for (const pg of [A, Bp]) await pg.waitForFunction(() => __wordwolf.onlineState().ph === 'e', null, { timeout: 40000 }).catch(() => {}); const ends = await Promise.all([A, Bp].map(os));
    check('both pages reach the result', ends.every(x => x.ph === 'e'), ends.map(x => x.ph));
    const txt = await Promise.all([A, Bp].map(pg => pg.textContent('#score')));
    check('the result shows every player and a running total', txt.every(t => /Aoi/.test(t) && /Ben/.test(t)) && (await Promise.all([A, Bp].map(pg => pg.$$('.badge.wolf')))).every(b => b.length >= 1), txt);
    const stt = await Promise.all([A, Bp].map(pg => st(pg))); check('the online game was tallied (stats.onl, not the ranking)', stt.every(x => x.stats.onl === 1 && x.stats.soloGames === 0 && x.rank === 0), stt.map(x => x.stats));
    await shot(A, '07-result');
    await A.click('[data-act="oAgain"]'); await Bp.click('[data-act="oAgain"]');
    for (const pg of [A, Bp]) await pg.waitForFunction(() => __wordwolf.onlineState().gn === 2 && __wordwolf.onlineState().ph === 'h', null, { timeout: 30000 });
    check('"play again" starts game 2 on both pages', true, null);
    await A.close(); await Bp.close();
  } finally { await emu.stop(); }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] && !process.argv[2].startsWith('--') ? process.argv[2].split(',') : null;
  for (const f of [first, solo, local, two, english, layouts, online]) {
    if (only && !only.includes(f.name)) continue;
    if (f === online && !only && process.argv.includes('--no-online')) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
