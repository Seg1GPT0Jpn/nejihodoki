#!/usr/bin/env node
// のんびり釣りの通しプレイ（Playwright。タッチ・マウス・キーは本物の入力。?debug の window.__fishing / __kb は、状態を読む・次の魚を決める・時間を速めるためだけ）
//   node tools/tests/fishing-play.js [first,cast,mouse,touch,keys,zukan,shop,orders,aquarium,away,english,themes,layouts]
// 1. 初回のあそびかた  2. キーで投げる→待つ→合わせる→巻く（引いたらはなす）→たも→ずかんに登録（決めた魚）  3. マウスのドラッグではじいて投げる
// 4. タッチ（はじく・長押しで巻く・タップで合わせる）  5. キー（矢印・Space・Esc・Z/B/M）  6. ずかんが開く・絞り込み・詳細  7. 買い物（コイン・次のさおだけ・えさ）
// 8. オーダーと大会  9. 水そう  10. るすの間の釣り（正直・上限）  11. 英語（日本語が残らない）  12. ライト／ダーク  13. 320px・横向き
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');
const E = require('../../fishing/engine.js');

const OUT = path.join(__dirname, 'out', 'shots', 'fishing-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + String(JSON.stringify(info)).slice(0, 600)}`); };
const SAVE = 'kusoge.fishing.save', HOWTO = 'kusoge.fishing.howto';
const FIX = () => JSON.parse(fs.readFileSync(path.join(__dirname, 'fixtures', 'saves', 'fishing-save.json'), 'utf8')).storage;

async function open(env, o = {}) {
  const touch = !!o.touch;
  const seed = o.seed || Object.assign({}, FIX(), { [HOWTO]: '1' });
  const s = await B.newSession(env, { vp: V.get(o.vp || 'se2'), lang: o.lang || 'ja', seed, isMobile: touch, hasTouch: touch, initScripts: o.initScripts });
  await s.goto('/fishing/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready() && window.__fishing);
  await s.page.evaluate(() => { __fishing.env({ t: 1, hour: 12, season: 0, wx: 0 }); __fishing.seed(7); });
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const wait = (p, f, arg, t) => p.waitForFunction(f, arg, { timeout: t || 20000 });
const sleep = (p, ms) => p.waitForTimeout(ms);

// 本物の入力で1ぴき釣る。how: 'keys' | 'mouse' | 'touch'。魚は debug で決める（正体は決めるだけで、動きは本物のゲームのまま）
async function catchOne(s, how, fi, speed) {
  const p = s.page; await p.evaluate(([f, k]) => { __fishing.force(f); __fishing.speed(k); }, [fi, speed || 4]);
  let a = await st(p); if (a.st !== 'idle') { await p.evaluate(() => __fishing.reelBack()); }
  const box = await p.locator('#scene').boundingBox(), cx = box.x + box.width / 2, by = box.y + box.height * 0.85;
  if (how === 'keys') { await p.keyboard.press('ArrowRight'); await p.keyboard.down('Space'); await sleep(p, 300); await p.keyboard.up('Space'); }
  else if (how === 'mouse') { await p.mouse.move(cx, by); await p.mouse.down(); await p.mouse.move(cx + 30, by - box.height * 0.25, { steps: 6 }); await p.mouse.move(cx + 40, by - box.height * 0.4, { steps: 4 }); await p.mouse.up(); }
  else { await p.touchscreen.tap(cx, box.y + box.height * 0.5); }
  await wait(p, () => __kb.state().st === 'bite' || __kb.state().st === 'wait', null, 8000);
  await wait(p, () => __kb.state().st === 'bite', null, 40000);
  const hook = async () => { if (how === 'keys') await p.keyboard.press('Space'); else if (how === 'mouse') { await p.mouse.move(cx, box.y + box.height * 0.5); await p.mouse.down(); await p.mouse.up(); } else await p.touchscreen.tap(cx, box.y + box.height * 0.5); };
  await hook(); await wait(p, () => __kb.state().st === 'fight', null, 4000);
  // 巻く：引き（warn〜surge）と、強すぎるときははなす。押しつづけ＝巻く
  let cdp = null, holding = false; const t0 = Date.now(); const press = async on => { if (on === holding) return; holding = on;
    if (how === 'keys') on ? await p.keyboard.down('Space') : await p.keyboard.up('Space');
    else if (how === 'mouse') { if (on) { await p.mouse.move(cx, box.y + box.height * 0.5); await p.mouse.down(); } else await p.mouse.up(); }
    else { cdp = cdp || await p.context().newCDPSession(p); await cdp.send('Input.dispatchTouchEvent', { type: on ? 'touchStart' : 'touchEnd', touchPoints: on ? [{ x: cx, y: box.y + box.height * 0.5 }] : [] }); } };
  while (Date.now() - t0 < 120000) {
    const a2 = await st(p); if (a2.st !== 'fight') break; const f = a2.fight; const safe = f.phase === 'rest' || f.phase === 'leap' || (f.phase === 'surge' && false);
    await press(f.phase === 'rest' && f.T < 0.8); await sleep(p, 40);
  }
  await press(false);
  const t1 = Date.now(); while (Date.now() - t1 < 15000) { const a3 = await st(p); if (a3.st !== 'net') break; const n = a3.fight && a3.fight.net; if (n && Math.abs(n.pos - n.c) < n.zw / 2 * 0.55) { if (how === 'keys') await p.keyboard.press('Space'); else if (how === 'mouse') { await p.mouse.move(cx, box.y + box.height * 0.5); await p.mouse.down(); await p.mouse.up(); } else await p.touchscreen.tap(cx, box.y + box.height * 0.5); await sleep(p, 100); } else await sleep(p, 20); }
  await wait(p, () => __kb.state().ov === 'catch', null, 15000);
  await p.evaluate(() => __fishing.speed(1));
  return st(p);
}
const closeCatch = async p => { await p.keyboard.press('Enter'); await wait(p, () => __kb.state().ov === '', null, 4000); };

async function first(env) {
  console.log('1. first visit: the rules, then the scene');
  const s = await open(env, { seed: {}, vp: 'se1' }); const p = s.page; let a = await st(p);
  check('the rules show on the first visit', a.howto, a); check('the rules text is there (controls, what bites)', (await p.textContent('#howBody')).length > 300);
  await shot(p, '01-howto'); await p.click('#howtoGo'); a = await st(p); check('game is ready after the rules', !a.howto && a.st === 'idle' && a.loc === 0, a);
  check('the canvas painted something (not blank)', await p.evaluate(() => { const c = document.getElementById('scene'), g = c.getContext('2d'); const d = g.getImageData(0, 0, c.width, c.height).data; const seen = new Set(); for (let i = 0; i < d.length; i += 4 * 97) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4)); return seen.size > 25; }));
  await shot(p, '01-scene'); check('no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}
async function oneCatch(env, how, label, vp, touch) {
  console.log(`2. ${label}: cast, wait, hook, reel (let go when it pulls), net, book entry`);
  const s = await open(env, { vp, touch }); const p = s.page; const fi = E.FISH.findIndex(f => f.key === 'tench');
  let a = await st(p); const z0 = a.zc;
  a = await catchOne(s, how, fi); check(`${how}: a catch card shows`, a.ov === 'catch' && a.last && a.last.fi === fi, a.last);
  check(`${how}: the book has a new entry`, a.zc === z0 + 1 && a.last.isNew, { z0, zc: a.zc });
  check(`${how}: coins were paid`, a.coins > 0, a.coins);
  await shot(p, `02-${how}-catch`); await closeCatch(p); a = await st(p); check(`${how}: back to ready after the card`, a.st === 'idle', a.st);
  const sv = await stored(p, SAVE); check(`${how}: the save has the fish (best size)`, sv && sv.b && sv.b[fi] > 0 && sv.z.some(x => x > 0), sv && sv.b);
  check(`${how}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
}
async function castTest(env) {
  console.log('3. too early / too late are harmless');
  const s = await open(env, {}); const p = s.page; await p.evaluate(() => { __fishing.speed(4); });
  await p.keyboard.press('Space'); await wait(p, () => __kb.state().st === 'wait', null, 6000); await sleep(p, 100); const a = await st(p);
  check('waiting after a cast', a.st === 'wait' && a.plan && a.plan.wait > 1, a);
  await p.keyboard.press('Space'); await sleep(p, 100); const b = await st(p);
  check('pressing too early reels back with no penalty', b.st === 'idle' && /早すぎ/.test(b.status), b);
  await p.keyboard.press('Space'); await wait(p, () => __kb.state().st === 'bite', null, 30000); await wait(p, () => __kb.state().st === 'wait' || __kb.state().st === 'idle', null, 8000);
  const c = await st(p); check('missing the bite window waits again, nothing lost', (c.st === 'wait') && c.coins === a.coins, c); await s.close();
}
async function zukanTest(env) {
  console.log('6. the book opens, filters and shows details');
  const s = await open(env, {}); const p = s.page; await p.click('#nZk'); let a = await st(p);
  check('book opens', a.ov === 'zukan', a.ov); const cards = await p.locator('#zkGrid .card').count(); check('150 cards in the book', cards === 150, cards);
  const unk = await p.locator('#zkGrid .card.unk').count(); check('fixture shows caught and unknown cards', unk > 0 && unk < 150, unk);
  await shot(p, '06-zukan'); await p.selectOption('#zkSel', '0'); const c0 = await p.locator('#zkGrid .card').count(); check('filter by place narrows the list', c0 > 5 && c0 < 150, c0);
  await p.locator('#zkGrid .card:not(.unk)').first().click(); check('a card opens its detail', (await p.textContent('#ovPanel')).length > 60 && await p.locator('#cDet').count() === 1);
  await shot(p, '06-detail'); await p.click('#dBack'); check('back to the book', await p.locator('#zkGrid').count() === 1);
  await p.keyboard.press('Escape'); a = await st(p); check('Esc closes the book', a.ov === '', a.ov); await s.close();
}
async function shopTest(env) {
  console.log('7. shop: coins, the next rod only, bait');
  const s = await open(env, {}); const p = s.page; await p.evaluate(() => { const sv = __fishing.save; sv.coins = 700; __fishing.writeSave(); }); await p.click('#nSh');
  check('shop opens', (await st(p)).ov === 'shop');
  const before = (await st(p)).save; await p.locator('[data-buy="rod:2"]').click({ force: true }).catch(() => {}); let a = (await st(p)).save; check('cannot skip a rod tier', a.g.r === before.g.r && a.coins === 700, a.g);
  await p.locator('[data-buy="rod:1"]').click(); a = (await st(p)).save; check('buying the next rod spends coins and equips it', a.g.r === 1 && a.coins === 700 - E.RODS[1].price, a.g);
  await p.click('[data-tab="bait"]'); await p.locator('[data-buy="bait:1"]').click(); a = (await st(p)).save; check('bait pack adds 10', a.g.a[1] === 10 && a.coins === 700 - E.RODS[1].price - E.BAITS[1].price, a.g.a);
  await p.locator('[data-use="b:1"]').click(); a = (await st(p)).save; check('bait can be chosen', a.g.sb === 1 && a.g.sl === -1, a.g);
  await shot(p, '07-shop'); await p.keyboard.press('Escape');
  const sv = await stored(p, SAVE); check('purchase is saved', sv.g.r === 1 && sv.g.a[1] === 10, sv.g); await s.close();
}
async function ordersTest(env) {
  console.log('8. orders and the tournament');
  const s = await open(env, {}); const p = s.page; await p.click('#nOr'); check('orders open', (await st(p)).ov === 'orders');
  check('three orders are listed', await p.locator('#ovPanel .row').count() >= 3); await shot(p, '08-orders');
  check('the tournament entry button is there', await p.locator('#tnGo').count() === 1);
  await p.click('#tnGo'); let a = await st(p); check('tournament starts (panel closes, rounds counted)', a.ov === '' && a.tour && a.tour.r === 0, a.tour);
  const fi = E.FISH.findIndex(f => f.key === 'crucian'); for (let k = 0; k < 2; k++) { a = await catchOne(s, 'keys', fi); await closeCatch(p); }
  a = await st(p); check('catches count as rounds and add to the score', a.tour && a.tour.r === 2 && a.tour.s > 0, a.tour);
  await p.evaluate(() => { __fishing.S.tour.r = 7; }); a = await catchOne(s, 'keys', fi); await sleep(p, 700); a = await st(p);
  check('the last round ends the tournament with a rank and reward', a.ov === 'tourend' || a.save.tn.done > 0, a.save.tn); await shot(p, '08-tour');
  await s.close();
}
async function aquariumTest(env) {
  console.log('9. aquarium');
  const s = await open(env, {}); const p = s.page; await p.click('#nAq'); check('aquarium opens', (await st(p)).ov === 'aquarium');
  const n = await p.locator('#aqGrid .card').count(); check('caught fish are listed', n > 0, n); await p.locator('#aqGrid .card').first().click(); const a = (await st(p)).save;
  check('a fish can be put in the tank', a.aq.f.length === 1, a.aq); await sleep(p, 500);
  check('the tank is drawn', await p.evaluate(() => { const c = document.getElementById('tank'); const d = c.getContext('2d').getImageData(0, 0, c.width, c.height).data; const seen = new Set(); for (let i = 0; i < d.length; i += 4 * 53) seen.add((d[i] >> 4) * 256 + (d[i + 1] >> 4) * 16 + (d[i + 2] >> 4)); return seen.size > 8; }));
  await shot(p, '09-aquarium'); await s.close();
}
async function awayTest(env) {
  console.log('10. away fishing is capped and honest');
  const day = 24 * 3600e3, past = Date.now() - 3 * day;
  const seed = Object.assign({}, FIX(), { [HOWTO]: '1' }); const sv = JSON.parse(seed[SAVE]); sv.ts = past; seed[SAVE] = JSON.stringify(sv);
  const s = await open(env, { seed }); const p = s.page; await sleep(p, 300); let a = await st(p);
  check('the welcome-back panel shows', a.ov === 'away', a.ov); const n = await p.locator('#awGrid .card').count(); check('shows at most 12 cards (cap 32 fish)', n > 0 && n <= 12, n);
  const txt = await p.textContent('#ovPanel'); check('says it is an estimate with limits', /8|目安/.test(txt) && /half|半分/.test(txt), txt.slice(0, 200));
  check('the save was credited at most the cap', a.save.stats.away <= E.OFF.maxN && a.save.stats.away > 0, a.save.stats.away); await shot(p, '10-away'); await p.keyboard.press('Escape');
  await p.evaluate(() => __fishing.persist()); await p.reload(); await p.waitForFunction(() => window.__fishing); a = await st(p); check('reloading does not pay twice', a.ov === '' , a.ov); await s.close();
}
async function english(env) {
  console.log('11. English: no Japanese remains');
  const s = await open(env, { lang: 'en', vp: 'se1' }); const p = s.page; const bad = [];
  const scan = async n => { const r = await p.evaluate(jpScan, true); if (r && r.length) bad.push(n + ': ' + JSON.stringify(r).slice(0, 200)); };
  await scan('scene'); for (const [k, f] of [['book', () => __fishing.showZukan()], ['detail', () => { __fishing.showZukan(); document.querySelector('#zkGrid .card:not(.unk)').click(); }], ['shop', () => __fishing.showShop()], ['bait', () => { __fishing.showShop('bait'); }], ['decor', () => __fishing.showShop('decor')], ['map', () => __fishing.showMap()], ['orders', () => __fishing.showOrders()], ['aquarium', () => __fishing.showAquarium()], ['options', () => __fishing.showOptions()], ['howto', () => __fishing.showHowto(false)]]) {
    await p.evaluate(f); await sleep(p, 120); await scan(k); await p.evaluate(() => { __fishing.closeOv(); document.getElementById('howto').hidden = true; }); }
  check('no Japanese in English UI (scene, book, detail, shop, map, orders, tank, options, rules)', bad.length === 0, bad);
  const names = await p.evaluate(() => __fishing.E.FISH.map(f => f.en + f.noteEn).join('')); check('English data has no Japanese', !/[぀-ヿ㐀-䶿一-鿿]/.test(names));
  await shot(p, '11-en'); await s.close();
}
async function themes(env) {
  console.log('12. light / dark');
  for (const th of ['dark', 'light']) { const s = await open(env, { seed: Object.assign({}, FIX(), { [HOWTO]: '1', 'kobo.theme': th }) }); const p = s.page; await p.evaluate(t => document.documentElement.setAttribute('data-kb-theme', t), th); await sleep(p, 150);
    const bg = await p.evaluate(() => getComputedStyle(document.body).backgroundColor); const lum = bg.match(/\d+/g).slice(0, 3).reduce((a, b) => a + +b, 0) / 3; check(`${th}: page background is ${th}`, th === 'dark' ? lum < 90 : lum > 160, bg);
    await p.click('#nZk'); await sleep(p, 150); await shot(p, '12-' + th + '-book'); const ink = await p.evaluate(() => getComputedStyle(document.querySelector('#ovPanel h2')).color); check(`${th}: panel text readable`, !!ink, ink); await s.close(); }
}
async function layouts(env) {
  console.log('13. 320px portrait and landscape');
  for (const vp of ['se1', 'land']) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang }); const p = s.page; const tag = `${vp}/${lang}`;
    const probe = async name => { const r = await p.evaluate(layoutProbe); check(`${tag}: ${name} has no horizontal scroll / offscreen controls`, r.hscroll <= 1 && r.offscreen.length === 0, { h: r.hscroll, off: r.offscreen.slice(0, 3) }); };
    await probe('scene'); if (lang === 'ja') await shot(p, `13-${vp}-scene`);
    const ab = await p.evaluate(() => { const r = document.getElementById('stage').getBoundingClientRect(); return { w: r.width, h: r.height }; }); check(`${tag}: the water view is big enough (${Math.round(ab.w)}x${Math.round(ab.h)})`, ab.h >= 120 && ab.w >= 180, ab);
    const sm = await p.evaluate(() => [...document.querySelectorAll('#act, #nav .nb')].map(b => { const r = b.getBoundingClientRect(); return Math.min(r.width, r.height); })); check(`${tag}: touch targets are at least 40px`, sm.every(x => x >= 40), sm);
    for (const [n, f] of [['book', () => __fishing.showZukan()], ['shop', () => __fishing.showShop()], ['map', () => __fishing.showMap()], ['orders', () => __fishing.showOrders()], ['options', () => __fishing.showOptions()]]) { await p.evaluate(f); await sleep(p, 100); await probe(n); if (lang === 'ja') await shot(p, `13-${vp}-${n}`); await p.evaluate(() => __fishing.closeOv()); }
    await p.evaluate(() => { __fishing.force(0); __fishing.speed(6); }); await p.keyboard.press('Space'); await wait(p, () => __kb.state().st === 'bite', null, 30000); await p.keyboard.press('Space'); await wait(p, () => __kb.state().st === 'fight', null, 4000); await sleep(p, 300); await probe('fight HUD'); if (lang === 'ja') await shot(p, `13-${vp}-fight`);
    check(`${tag}: no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3)); await s.close();
  }
}
async function keysTest(env) {
  console.log('5. keyboard shortcuts');
  const s = await open(env, {}); const p = s.page; await p.keyboard.press('KeyZ'); check('Z opens the book', (await st(p)).ov === 'zukan'); await p.keyboard.press('Escape'); await p.keyboard.press('KeyB'); check('B opens the shop', (await st(p)).ov === 'shop'); await p.keyboard.press('Escape');
  await p.keyboard.press('KeyM'); check('M opens places', (await st(p)).ov === 'map'); await p.keyboard.press('Escape'); await p.keyboard.press('KeyO'); check('O opens orders', (await st(p)).ov === 'orders'); await p.keyboard.press('Escape');
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowUp'); const a = await st(p); check('arrow keys aim and set power', a.aim < 0 && a.power > 0.6, a); await p.keyboard.press('Escape'); await sleep(p, 300); check('Esc opens the pause menu', await p.locator('.kb-pause').count() === 1); await s.close();
}
async function mapTest(env) {
  console.log('7b. places: locked ones stay locked, unlocked can be chosen');
  const s = await open(env, {}); const p = s.page; await p.click('#nMp'); const n = await p.locator('#ovPanel .row').count(); check('12 places are listed', n === 12, n);
  const dis = await p.locator('#ovPanel [data-loc]:not([disabled])').count(); check('some are open and some locked', dis >= 1 && dis < 12, dis);
  const k = await p.locator('#ovPanel [data-loc]:not([disabled])').first().getAttribute('data-loc'); await p.locator('#ovPanel [data-loc]:not([disabled])').first().click(); const a = await st(p); check('choosing a place changes it', a.loc === +k && a.ov === '', a.loc); await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  const all = { first, keys: keysTest, cast: castTest, mouse: e => oneCatch(e, 'mouse', 'mouse (drag up to cast, click to hook, hold to reel)', 'se2', false), touch: e => oneCatch(e, 'touch', 'touch (tap, hold)', 'se1', true), kbcatch: e => oneCatch(e, 'keys', 'keyboard', 'se2', false), zukan: zukanTest, shop: shopTest, map: mapTest, orders: ordersTest, aquarium: aquariumTest, away: awayTest, english, themes, layouts };
  for (const [name, f] of Object.entries(all)) {
    if (only && !only.includes(name)) continue;
    try { await f(env); } catch (e) { check(name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
