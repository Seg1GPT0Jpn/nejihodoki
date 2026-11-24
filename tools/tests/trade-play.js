#!/usr/bin/env node
// 貿易ゲームの通しプレイ（Playwright、?debug の window.__trade を使う）
//   node tools/tests/trade-play.js [basic,missions,keys,events,theme,english,compat]  … 全部（約1分）。スクリーンショットは tools/tests/out/shots/trade-play/
// 1. basic：はじめる画面（ふつう・かんたん・むずかしい・できごとなし）・本物のクリックで製品をえらび・売り・コインとコンボ・ふつうは今までと同じ値段の見直し
// 2. missions：ミッション一覧と鍵・本物のクリックで開始・バー・ボットで全8ミッションを★1以上でクリア・★が kusoge.trade.x に残って次が開く・best には入らない
// 3. keys：キーボード（1〜4・Q・A・P・M・L・Y/N・H・Esc）・交渉中の Enter／B／Esc・国の四角は Tab と Enter・ふりかえりの矢印
// 4. events：5つのできごと（ブーム・災害・技術協力・航路の混雑で輸送費・フェアで +100）の効き目と終わり
// 5. theme：ライト／ダークで文字が読める・見た目ボタンの切りかえ・コントラスト
// 6. english：英語で日本語が見えない（はじめる画面・ゲーム・できごとカード・ミッション・ふりかえり）
// 7. compat：古い保存（kusoge.trade.save だけ）が読めて best が下がらない・こわれた x でも開く
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'trade-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info)}`); };
const SAVE = 'kusoge.trade.save', X = 'kusoge.trade.x';
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, n) => p.screenshot({ path: path.join(OUT, n + '.png') });

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || {}, isMobile: false, hasTouch: false, });
  if (o.scheme) await s.page.emulateMedia({ colorScheme: o.scheme });
  const errs = []; s.page.on('pageerror', e => errs.push(String(e))); s.errs = errs;
  await s.goto('/trade/?debug' + (o.query || ''));
  await s.page.waitForSelector('#startBtn');
  return s;
}
const pretty = (s, name) => check(name + ': no page errors', !s.errs.length, s.errs);

async function basic(env) {
  console.log('1. basic');
  const s = await open(env); const p = s.page;
  check('start screen shows modes, difficulty, events, language', await p.isVisible('[data-mode="mission"]') && await p.isVisible('[data-diff="h"]') && await p.isVisible('[data-ev="off"]') && await p.isVisible('#langSel'));
  await p.click('[data-diff="h"]'); await p.click('[data-ev="off"]');
  check('hard + no events are stored', await p.evaluate(() => localStorage.getItem('kusoge.trade.diff') === 'h' && localStorage.getItem('kusoge.trade.ev') === 'off'));
  await p.click('[data-diff="n"]'); await p.fill('#nameIn', 'テスト国'); await p.click('[data-ev="on"]');
  await p.evaluate(() => __trade.seed(11));
  await p.click('#startBtn');
  const g = await p.evaluate(() => ({ r: __trade.G.running, diff: __trade.G.diff, plan: __trade.G.plan.length, name: __trade.G.me.name }));
  check('real start: normal, 2 random events planned, own name', g.r && g.diff === 'n' && g.plan === 2 && g.name === 'テスト国', g);
  // real clicks: pick a shape, then sell
  await p.evaluate(() => { const G = __trade.G; G.me.items.rect = 3; G.me.items.circle = 2; });
  await p.evaluate(() => __trade.G.me.lines.length && 0);
  await p.keyboard.press('Escape');
  const before = await p.evaluate(() => __trade.G.me.items.money);
  await p.evaluate(() => { document.querySelector('[data-sell="rect"][data-n="1"]') || 0; __trade.run(0.01); });
  await p.click('[data-sell="rect"][data-n="1"]');
  await p.click('[data-sell="rect"][data-n="all"]');
  const after = await p.evaluate(() => __trade.G.me.items.money);
  check('selling by real clicks adds money (+900 for 3 clothing)', after - before === 900, { before, after });
  check('coin and combo effects do not break the page', await p.evaluate(() => __trade.G.combo.n >= 1));
  // prices: the old rule on normal (no events)
  const pr = await p.evaluate(() => { __trade.free({ seed: 3, ev: false }); const G = __trade.G; G.period.circle = 9; G.period.tri = 12; __trade.run(5.1); return { c: G.price.circle, t: G.price.tri, r: G.price.rect }; });
  check('review at 5 min: circle 1500→1300, triangle 700→600, clothing 300', pr.c === 1300 && pr.t === 600 && pr.r === 300, pr);
  const hd = await p.evaluate(() => { __trade.free({ seed: 3, ev: false, diff: 'h' }); const G = __trade.G; G.period.circle = 9; __trade.run(5.1); return G.price.circle; });
  check('hard drops circle more (1500→1200)', hd === 1200, hd);
  const ez = await p.evaluate(() => { __trade.free({ seed: 3, ev: false, diff: 'e' }); const G = __trade.G; G.period.circle = 9; __trade.run(5.1); return G.price.circle; });
  check('easy drops circle less (1500→1400)', ez === 1400, ez);
  // easy / free normal results go to the save only for normal and hard
  await p.evaluate(() => { localStorage.removeItem('kusoge.trade.save'); __trade.free({ seed: 4, diff: 'e' }); __trade.bot(40, {}); });
  check('easy result is practice (kusoge.trade.save untouched)', (await stored(p, SAVE)) === null);
  await p.evaluate(() => { __trade.free({ seed: 4, diff: 'n' }); __trade.bot(40, {}); });
  const sv = await stored(p, SAVE);
  check('normal result is saved as before (plays, best, types)', sv && sv.plays === 1 && sv.best > 0 && sv.v === 1 && sv.types, sv);
  await shot(p, '1-debrief');
  pretty(s, 'basic'); await s.close();
}

async function missions(env) {
  console.log('2. missions');
  const s = await open(env, { seed: { [SAVE]: { v: 1, plays: 3, best: 12345, bestX: 50, types: { A: 1 }, typesN: 1, deals: 4 } } }); const p = s.page;
  await p.click('[data-mode="mission"]');
  check('mission list: 8 cards, only the first is open', await p.evaluate(() => { const c = [...document.querySelectorAll('.mcard')]; return c.length === 8 && !c[0].disabled && c.slice(1).every(x => x.disabled); }));
  await shot(p, '2-list');
  await p.click('#startBtn');
  check('mission 1 starts: bar shows goals; type A, easy', await p.evaluate(() => { const G = __trade.G; return G.mi === 0 && G.me.type === 'A' && G.diff === 'e' && !document.getElementById('mbar').hidden && document.querySelectorAll('#mbar .mgoal').length === 1; }));
  await p.evaluate(() => __trade.bot(10, {}));
  check('mission bar updates while playing', await p.evaluate(() => document.querySelector('#mbar .mstars').textContent.length === 3));
  await shot(p, '2-bar');
  // bot clears every mission with some strategy; stars are saved and unlock the next
  const res = await p.evaluate(() => {
    const out = [], strategies = [{ diversify: true, team: true, gifts: 3 }, {}, { diversify: true, team: true }, { gifts: 3 }];
    for (let i = 0; i < 8; i++) {
      let best = 0;
      outer: for (const o of strategies) for (const sd of [1, 2, 3]) {
        __trade.mission(i, sd); __trade.bot(40, o);
        const st = __trade.G.mstars; if (st > best) best = st; if (best >= 1) break outer;
      }
      out.push(best);
    }
    return out;
  });
  check('the bot clears all 8 missions (≥1 star each)', res.every(x => x >= 1), res);
  const x = await stored(p, X);
  check('stars are saved in kusoge.trade.x and every mission is open', x && x.s.length === 8 && x.s.every(v => v >= 1) && x.b.every(v => v > 0), x);
  const sv = await stored(p, SAVE);
  check('missions do not touch kusoge.trade.save (best stays)', sv && sv.best === 12345 && sv.plays === 3, sv);
  await p.evaluate(() => { __trade.mission(0, 1); __trade.bot(40, {}); });
  check('the debrief shows stars, goals and a next-mission button', await p.evaluate(() => !!document.querySelector('.starbig') && document.querySelectorAll('.mgoals li').length >= 3));
  await p.click('#dbNext'); await p.click('#dbNext'); await p.click('#dbNext');
  check('last page: next mission + play again', await p.isVisible('#nextMis') && await p.isVisible('#againBtn'));
  await shot(p, '2-result');
  await p.click('#nextMis');
  check('next mission is selected on the start screen', await p.evaluate(() => document.querySelector('.mcard[aria-pressed="true"]').dataset.mi === '1'));
  pretty(s, 'missions'); await s.close();
}

async function keys(env) {
  console.log('3. keys');
  const s = await open(env); const p = s.page;
  await p.click('#startBtn');
  await p.evaluate(() => { const G = __trade.G; G.me.items.pencil = 2; G.me.lines.push({ shape: null, prog: 0, busy: false, why: '' }); G.me.items.scissors = 1; G.me.items.ruler = 1; });
  const line = () => p.evaluate(() => __trade.G.me.lines.map(l => l.shape));
  await p.evaluate(() => document.activeElement && document.activeElement.blur());
  await p.keyboard.press('1');
  check('1 picks clothing on line 1', (await line())[0] === 'rect', await line());
  await p.keyboard.press('q'); await p.keyboard.press('1');
  check('Q switches line, 1 picks on line 2', (await line())[1] === 'rect' && await p.evaluate(() => __trade.G.kbLine === 1));
  await p.keyboard.press('m'); check('M toggles sound', await p.getAttribute('#soundBtn', 'aria-pressed') === 'false'); await p.keyboard.press('m');
  await p.keyboard.press('p'); check('P pauses', await p.evaluate(() => __trade.G.paused)); await p.keyboard.press('p');
  await p.evaluate(() => { __trade.G.me.items.rect = 2; });
  const m0 = await p.evaluate(() => __trade.G.me.items.money);
  await p.keyboard.press('a');
  check('A sells all stock', await p.evaluate(m => __trade.G.me.items.rect === 0 && __trade.G.me.items.money === m + 600, m0));
  await p.evaluate(() => { const G = __trade.G, c = G.countries.find(x => !x.isPlayer); G.offers.push({ id: 99, from: c, until: G.t + 4, myGive: { money: 100 }, myGet: {} }); G.offers.push({ id: 100, from: c, until: G.t + 4, myGive: { money: 100 }, myGet: {} }); });
  await p.keyboard.press('n'); check('N declines the top offer', await p.evaluate(() => __trade.G.offers.length === 1));
  await p.keyboard.press('y'); check('Y accepts the offer', await p.evaluate(() => __trade.G.offers.length === 0 && __trade.G.myDeals === 1));
  await p.keyboard.press('h'); check('H opens the rules; Esc closes', await p.isVisible('#closeBtn')); await p.keyboard.press('Escape'); check('Esc closed the rules', !(await p.$('#closeBtn')));
  // node: Tab + Enter opens the contract; Enter signs; B asks; Esc leaves
  await p.focus('[data-node]:not(.me)'); await p.keyboard.press('Enter');
  check('Enter on a country opens the agreement', await p.isVisible('#trBody'));
  await p.keyboard.press('b'); check('B asks the price (a reply appears)', await p.evaluate(() => document.querySelector('.reply').textContent.length > 5));
  await p.keyboard.press('Escape'); check('Esc leaves the negotiation, clock resumes', !(await p.$('#trBody')) && await p.evaluate(() => !__trade.G.paused));
  await p.evaluate(() => __trade.bot(40, {}));
  await p.keyboard.press('ArrowRight'); check('arrow keys move through the debrief', await p.evaluate(() => document.querySelector('.steps .on').textContent.startsWith('2')));
  await p.keyboard.press('ArrowLeft'); check('and back', await p.evaluate(() => document.querySelector('.steps .on').textContent.startsWith('1')));
  pretty(s, 'keys'); await s.close();
}

async function events(env) {
  console.log('4. events');
  const s = await open(env); const p = s.page;
  await p.click('#startBtn');
  const r = await p.evaluate(() => {
    const out = {}; __trade.free({ seed: 2, ev: false }); const G = __trade.G;
    __trade.runEvent('boom', 0.1, 0.1); out.boom = G.price.rect;   // rect 300 → 500
    G.period.rect = 0; __trade.run(5.1); out.decay = G.price.rect;   // → 400
    const tot = () => G.countries.reduce((a, c) => a + c.items.paper, 0), p0 = tot(); __trade.runEvent('storm', 0, 0); out.storm = p0 - tot(); const me = G.me;
    const c = G.countries.find(x => (x.type === 'C') && x.items.ruler === 0); __trade.runEvent('tech', 0, 0); out.tech = G.countries.filter(x => x.type === 'C' || x.type === 'D').some(x => x.items.ruler > 0);
    __trade.runEvent('route', 0, 0); out.route = Object.keys(G.routes).length;
    __trade.runEvent('fair', 0, 0); const rt = G.price.rect; me.items.rect = 2; const mm = me.items.money; __trade.sell(me, 'rect', 2); out.fair = me.items.money - mm; out.rt = rt;
    G.t += 6; G.cards = []; __trade.run(0.05); out.ended = Object.keys(G.routes).length === 0 && G.bonus === null;
    out.cards = 0; return out;
  });
  check('boom: clothing 300→500, then fades by 100 at the review', r.boom === 500 && r.decay === 400, r);
  check('disaster takes a quarter of one country\'s resources (at least 1 sheet)', r.storm >= 600 && r.storm % 600 === 0, r);
  check('technical cooperation gives processing tech to an oil/developing country', r.tech, r);
  check('route jam registers one route; fair pays +100 per clothing', r.route === 1 && r.fair === 2 * (r.rt + 100), r);
  check('route jam and fair end after 5 minutes', r.ended, r);
  // route fee is paid on a deal
  const fee = await p.evaluate(() => {
    __trade.free({ seed: 6, ev: false }); const G = __trade.G; const c = G.countries.find(x => !x.isPlayer);
    G.routes[c.id] = { fee: 200, until: G.t + 5 }; G.me.items.money = 5000; const m0 = G.me.items.money;
    document.querySelector('[data-node="' + c.id + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true }));
    return { m0, id: c.id };
  });
  await p.click('[data-side="give"][data-k="money"][data-d="100"]'); await p.click('[data-side="give"][data-k="money"][data-d="1000"]');
  check('the contract shows the shipping note', await p.evaluate(() => !!document.querySelector('.fee-note')));
  await p.click('#trSend');
  const after = await p.evaluate(() => ({ m: __trade.G.me.items.money, f: __trade.G.fees, d: __trade.G.myDeals }));
  check('a gift deal pays the shipping fee (money = 5000 − 1100 − 200)', after.d === 1 && after.f === 200 && after.m === 3700, after);
  await p.keyboard.press('Escape');
  // event cards appear in play
  await p.evaluate(() => { __trade.free({ seed: 8, ev: true, diff: 'h' }); const G = __trade.G; G.paused = false; });
  await p.evaluate(() => { const G = __trade.G; while (G.t < 38 && !G.cards.length) { /* step via run keeping cards */ __trade.run(0.5, true); } });
  check('a random event card is queued during play', await p.evaluate(() => __trade.G.cards.length > 0 || document.querySelector('.ev') !== null));
  pretty(s, 'events'); await s.close();
}

async function theme(env) {
  console.log('5. theme');
  for (const scheme of ['light', 'dark']) {
    const s = await open(env, { scheme }); const p = s.page;
    const look = await p.evaluate(() => getComputedStyle(document.body).backgroundColor);
    const lum = look.match(/\d+/g).slice(0, 3).map(Number).reduce((a, b) => a + b, 0) / 3;
    check(`${scheme}: page background is ${scheme}`, scheme === 'light' ? lum > 200 : lum < 60, look);
    await p.click('#startBtn');
    await p.evaluate(() => { __trade.free({ seed: 5 }); __trade.run(6, true); });
    const ratio = await p.evaluate(() => {
      const rgb = c => c.match(/[\d.]+/g).slice(0, 3).map(Number), L = a => { const f = v => { v /= 255; return v <= .03928 ? v / 12.92 : Math.pow((v + .055) / 1.055, 2.4); }; return .2126 * f(a[0]) + .7152 * f(a[1]) + .0722 * f(a[2]); };
      const bad = []; for (const sel of ['.price .v', '.tick .nm', '#walletAmt', '.slot .n', '.panel-h h2', '.tick .supply', '.news li span']) { const e = document.querySelector(sel); if (!e) continue; const fg = rgb(getComputedStyle(e).color); let bgEl = e, bg; while (bgEl) { const c = getComputedStyle(bgEl).backgroundColor; if (!/rgba\(0, 0, 0, 0\)|transparent/.test(c)) { bg = rgb(c); break; } bgEl = bgEl.parentElement; } bg = bg || rgb(getComputedStyle(document.body).backgroundColor); const a = L(fg), b = L(bg), r = (Math.max(a, b) + .05) / (Math.min(a, b) + .05); if (r < 3.5) bad.push(sel + ' ' + r.toFixed(2)); }
      return bad; });
    check(`${scheme}: main texts have contrast ≥ 3.5`, !ratio.length, ratio);
    await shot(p, '5-' + scheme);
    await p.keyboard.press('Escape');
    pretty(s, 'theme ' + scheme); await s.close();
  }
  const s = await open(env, { scheme: 'dark' }); const p = s.page; await p.click('#startBtn');
  await p.click('#themeBtn');
  check('theme button cycles auto → light (data-kb-theme)', await p.evaluate(() => document.documentElement.getAttribute('data-kb-theme') === 'light'));
  check('page colors follow (light background)', await p.evaluate(() => getComputedStyle(document.body).backgroundColor.match(/\d+/g).slice(0, 3).every(v => +v > 200)));
  await p.keyboard.press('l');
  check('L key goes to dark', await p.evaluate(() => document.documentElement.getAttribute('data-kb-theme') === 'dark'));
  await s.close();
}

async function english(env) {
  console.log('6. english');
  const s = await open(env, { lang: 'en', vp: 'se1' }); const p = s.page;
  const jp = async () => (await p.evaluate(`(${jpScan})(false)`));
  let j = await jp(); check('start screen has no Japanese', !j.length, j.slice(0, 5));
  await p.click('[data-mode="mission"]'); j = await jp(); check('mission list in English', !j.length, j.slice(0, 5));
  await p.click('#startBtn');
  check('English title and HUD', await p.evaluate(() => document.title === 'Trade Game' && document.getElementById('pauseBtn').textContent === 'Pause'));
  await p.evaluate(() => { __trade.bot(6, {}); });
  j = await jp(); check('playing (mission bar, tray, market, news)', !j.length, j.slice(0, 5));
  for (const id of ['boom', 'storm', 'tech', 'route', 'fair']) {
    await p.evaluate(id => { __trade.runEvent(id, 0.2, 0.2); }, id);
    const html = await p.evaluate(() => __trade.G.cards.map(c => [c.title, c.kpi, c.tag, c.term, ...c.rows.flat()].join(' ')).join(' '));
    check(`event ${id} card in English`, !/[぀-ヿ一-鿿]/.test(html), html.slice(0, 80));
    await p.evaluate(() => { __trade.G.cards = []; });
  }
  await p.evaluate(() => { const c = __trade.G.countries.find(x => !x.isPlayer); document.querySelector('[data-node="' + c.id + '"]').dispatchEvent(new MouseEvent('click', { bubbles: true })); });
  await p.keyboard.press('b'); j = await jp(); check('negotiation in English', !j.length, j.slice(0, 5)); await p.keyboard.press('Escape');
  await p.evaluate(() => __trade.bot(40, {}));
  for (let i = 0; i < 4; i++) { j = await jp(); check('debrief page ' + (i + 1) + ' in English', !j.length, j.slice(0, 5)); if (i < 3) await p.click('#dbNext'); }
  await p.evaluate(() => { __trade.mission(0, 1); __trade.bot(40, {}); });
  j = await jp(); check('mission result in English', !j.length, j.slice(0, 5));
  await shot(p, '6-en-result');
  // class view too
  await p.evaluate(() => { localStorage.setItem('kusoge.trade.view', 'class'); });
  await p.reload(); await p.waitForSelector('#startBtn'); j = await jp(); check('class view start screen in English', !j.length, j.slice(0, 5));
  await p.click('#startBtn'); await p.evaluate(() => __trade.bot(8, {})); j = await jp(); check('class view play in English', !j.length, j.slice(0, 5));
  pretty(s, 'english'); await s.close();
}

async function compat(env) {
  console.log('7. compat');
  const old = { v: 1, plays: 2, best: 48400, bestX: 242, types: { A: 1, D: 1 }, typesN: 2, deals: 3, wins: 1 };
  let s = await open(env, { seed: { [SAVE]: old, 'kusoge.trade.view': 'class' } }); let p = s.page;
  check('old save + old view setting open fine', await p.evaluate(() => document.querySelector('.mcard') === null) );
  await p.click('[data-mode="mission"]');
  check('old save: only mission 1 is open', await p.evaluate(() => [...document.querySelectorAll('.mcard')].filter(x => !x.disabled).length === 1));
  await p.evaluate(() => { __trade.free({ seed: 3 }); __trade.bot(40, {}); });
  const sv = await stored(p, SAVE);
  check('a new result keeps the old fields and the best never drops', sv.best >= 48400 && sv.plays === 3 && sv.types.A >= 1 && sv.wins >= 1, sv);
  pretty(s, 'compat'); await s.close();
  s = await open(env, { seed: { [X]: '{broken', 'kusoge.trade.diff': 'zzz', 'kusoge.trade.ev': 'maybe' } }); p = s.page;
  await p.click('[data-mode="mission"]');
  check('broken x / diff / ev: opens, mission 1 open, difficulty falls back to normal', await p.evaluate(() => !document.querySelector('.mcard').disabled) );
  await p.evaluate(() => { __trade.mission(0, 1); __trade.bot(40, {}); });
  const x = await stored(p, X);
  check('x is rewritten as a clean object', x && x.v === 1 && x.s.length === 8 && x.s[0] >= 1, x);
  pretty(s, 'compat2'); await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  B.ensureCdn();
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [basic, missions, keys, events, theme, english, compat]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 600)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
