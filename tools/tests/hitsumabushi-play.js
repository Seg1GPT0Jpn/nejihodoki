#!/usr/bin/env node
// ひつまぶし工房の通しプレイ（Playwright、?debug の window.__hitsu / __kb を使う）
//   node tools/tests/hitsumabushi-play.js            … 全部（約1分）。スクリーンショットは tools/tests/out/shots/hitsumabushi-play/
// 1. 初回：遊び方 → チュートリアルの1皿を、本物の操作（ボタン・フリック・なぞる・ドラッグ・タップ）で作って出す
// 2. 1営業日をまるごと（ボットが注文どおりに作る）→ 結果 → 保存（日・ベスト・お金・在庫）→ 再読み込みしても同じ
// 3. 採点：完璧な皿・焦げ・器ちがい・わさび抜き違反・急いで・常連の「いつもの」
// 4. 厳しさ B→C→A：B は焦げも出せる / C のこだわり客は作り直し / A は焦げを出せず、待たせると怒って帰る
// 5. 仕込み（仕入れ・改装・メニュー）が保存されること、デイリーはベストを変えないこと、英語で日本語が見えないこと
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'hitsumabushi-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info)}`); };
const SAVE = 'kusoge.hitsumabushi.save';

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || {}, isMobile: false, hasTouch: false });
  await s.goto('/hitsumabushi/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready());
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') });

// the real gestures on the canvas
async function drag(p, from, to, steps = 8) { await p.mouse.move(from[0], from[1]); await p.mouse.down(); await p.mouse.move(to[0], to[1], { steps }); await p.mouse.up(); }

async function tutorial(env) {
  console.log('1. first visit: how to play → tutorial dish with real input');
  const s = await open(env);
  const p = s.page;
  let x = await st(p);
  check('first visit shows how to play', x.howto && !x.shop);
  await p.click('#howtoGo');
  x = await st(p);
  check('tutorial day starts (step 1)', x.mode === 'normal' && x.tutorial === 0 && !x.howto, x);
  await p.evaluate(() => __hitsu.advance(0.2)); // the tutorial customer sits down
  await p.click('#addBtn');
  await p.evaluate(() => __hitsu.advance(0.05));
  x = await st(p);
  check('+ eel puts a fillet on the grill', x.grills[0] && x.tutorial === 1, x.grills);
  check('the clock waits during the tutorial', x.time === 0, x.time);
  await p.evaluate(() => __hitsu.advance(15)); // the down side browns
  x = await st(p);
  check('the side on the coals browns', x.grills[0].side[1] > 0.7 && x.grills[0].side[0] < 0.1, x.grills[0].side);
  const a = await p.evaluate(() => __hitsu.lanePoint(0, 0.5, 0.5));
  await drag(p, a, [a[0], a[1] - 60], 4); // flick up
  await p.evaluate(() => __hitsu.advance(0.5));
  x = await st(p);
  check('a flick turns the eel', x.grills[0].flips === 1 && x.grills[0].down === 0, x.grills[0]);
  for (let i = 0; i < 3; i++) { // trace left and right to brush the tare
    const l = await p.evaluate(() => __hitsu.lanePoint(0, 0.02, 0.5)), r = await p.evaluate(() => __hitsu.lanePoint(0, 0.98, 0.5));
    await drag(p, i % 2 ? r : l, i % 2 ? l : r, 30);
  }
  x = await st(p);
  check('tracing brushes tare evenly (avg ~1)', x.grills[0].tare > 0.8 && x.grills[0].tare < 1.4, x.grills[0].tare);
  for (let i = 0; i < 40 && (await st(p)).grills[0].side[0] < 0.76; i++) await p.evaluate(() => __hitsu.advance(0.5));
  await shot(p, '1-grill');
  x = await st(p);
  check('both sides in the sweet spot', x.grills[0].side.every(v => v > 0.68 && v < 0.98), x.grills[0].side);
  await p.click('#upBtn');
  x = await st(p);
  check('take off → the board, plate view', x.board && x.view === 'plate' && x.tutorial === 4, x);
  // chop on the beat: tap the board, then tap once per beat
  const bd = await p.evaluate(() => __hitsu.rect('board'));
  const bc = [bd.x + bd.w / 2, bd.y + bd.h / 2];
  await p.mouse.click(bc[0], bc[1]);
  await p.evaluate(() => __hitsu.advance(0.42)); // the count-in beat
  for (let i = 1; i <= 7; i++) { await p.evaluate(() => __hitsu.advance(0.42)); await p.mouse.click(bc[0], bc[1]); }
  await p.evaluate(() => __hitsu.advance(0.6));
  x = await st(p);
  check('7 cuts on the beat, chop done', x.board && x.board.done && x.board.cuts.length === 7, x.board);
  const even = x.board.cuts.every((c, i) => Math.abs(c - (i + 1) / 8) < 0.03);
  check('the cuts are even', even, x.board.cuts);
  await p.mouse.click(...(await p.evaluate(() => __hitsu.chipPoint('ohitsu'))));
  const tub = await p.evaluate(() => __hitsu.rect('tub')), vc = await p.evaluate(() => __hitsu.rect('vCenter'));
  const vr = await p.evaluate(() => __hitsu.D && { rx: 0 }) && await p.evaluate(() => { const r = __hitsu.rect('vessel'); return r; });
  for (const dx of [-0.3, 0, 0.3]) await drag(p, [tub.x + tub.w / 2, tub.y + tub.h / 2], [vc.x + dx * vr.w, vc.y], 6);
  x = await st(p);
  check('3 scoops of rice dragged into the ohitsu', x.plate.vessel === 'ohitsu' && x.plate.rice.length === 3, x.plate);
  await drag(p, bc, [vc.x, vc.y], 8);
  x = await st(p);
  check('the chopped eel dragged onto the rice', x.plate.eel && !x.board, x.plate);
  for (const k of ['chawan', 'negi', 'wasabi', 'nori']) await p.mouse.click(...(await p.evaluate(k => __hitsu.chipPoint(k), k)));
  x = await st(p);
  await p.evaluate(() => __hitsu.advance(0.1)); x = await st(p);
  check('condiments for 薬味で', ['chawan', 'negi', 'wasabi', 'nori'].every(k => x.plate.acc.includes(k)) && x.tutorial === 9, [x.plate.acc, x.tutorial]);
  await shot(p, '1-plate');
  await p.click('#serveBtn');
  x = await st(p);
  const pts = x.served[0] && x.served[0].pts;
  check('served: a careful first dish scores well (≥75)', pts >= 75, x.served);
  check('tutorial finished, saved, the day runs', x.tutorial === null && x.save.tut === 1 && x.sched > 0, { t: x.tutorial, tut: x.save.tut, sched: x.sched });
  await p.evaluate(() => __hitsu.advance(1));
  x = await st(p);
  check('the clock runs after the tutorial', x.time > 0, x.time);
  check('no page errors (tutorial)', !s.log.pageErrors.length && !s.log.consoleErrors.length, [s.log.pageErrors, s.log.consoleErrors]);
  await s.close();
}

const BASE = { v: 1, day: 2, best: 0, money: 20000, stock: 12, rep: 10, rank: 0, up: { grills: 1, seats: 1, coal: 0, look: 0 }, menu: ['hitsu', 'don', 'kimo'], regs: {}, stats: {}, story: 0, tut: 1 };
const seedOf = save => ({ 'kusoge.hitsumabushi.howto': '1', [SAVE]: save });

async function fullDay(env) {
  console.log('2. a full business day (bot) → result → save → reload');
  const s = await open(env, { seed: seedOf(BASE) });
  const p = s.page;
  let x = await st(p);
  check('returning player sees the shop', x.shop && !x.howto, x);
  await p.click('#openBtn');
  x = await st(p);
  check('day 2 opens with 2 grills, B strictness', x.mode === 'normal' && x.day === 2 && x.grills.length === 2 && x.strict === 'B', x);
  let guard = 0;
  while (!(x = await st(p)).over && guard++ < 600) {
    if (x.cust.some(c => c.state === 'seat')) await p.evaluate(() => __kb.step(1));
    await p.evaluate(() => __hitsu.advance(2));
  }
  const pts = x.served.map(d => d.pts);
  check('the day closes by itself (3–5 min of game time)', x.over && x.dur >= 180 && x.dur <= 300, x.dur);
  check('several dishes served, all good (bot)', pts.length >= 4 && pts.every(v => v >= 75), pts);
  check('the result card shows', x.result, x);
  await shot(p, '2-result');
  x = await st(p);
  check('saved: next day, best = day score, money up, stock used', x.save.day === 3 && x.save.best === x.score && x.save.money > BASE.money && x.save.stock < BASE.stock,
    { day: x.save.day, best: x.save.best, score: x.score, money: x.save.money, stock: x.save.stock });
  const ev = await p.evaluate(() => __kb.events.map(e => e.type + ':' + (e.p.mode || '')));
  check('events: play_start → best → stage_clear → play_end (normal)', ['play_start:normal', 'best:', 'stage_clear:', 'play_end:normal'].every(e => ev.some(x => x.startsWith(e.replace(/:$/, '')))), ev);
  await p.click('#dNext');
  // the shop: buy an eel pack and a seat
  const before = (await st(p)).save;
  await p.evaluate(() => { __hitsu.buy('eel', 3); __hitsu.buy('up', 'seats'); });
  await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  x = await st(p);
  check('after reload: shop, day 3, best kept, purchases kept', x.shop && x.save.day === 3 && x.save.best === before.best && x.save.stock === before.stock + 3 && x.save.up.seats === before.up.seats + 1, x.save);
  check('open button names the day', /3/.test(await p.textContent('#openBtn')));
  check('no page errors (full day)', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
}

async function scoring(env) {
  console.log('3. scoring');
  const s = await open(env, { seed: seedOf(Object.assign({}, BASE, { menu: ['hitsu', 'don', 'kimo', 'shira'], rank: 1, rep: 30 })) });
  const p = s.page;
  const r = await p.evaluate(() => {
    const H = __hitsu, mk = (o) => Object.assign({ dish: 'hitsu', style: 1, req: [], side: null, wait: 10, pat: 90, usual: false, asked: false }, o);
    const fil = (s0, s1, tare) => ({ side: [s0, s1], tare: new Array(14).fill(tare), glaze: 1 });
    const plate = (o) => Object.assign({ vessel: 'ohitsu', rice: [-0.66, 0, 0.66], eel: { f: fil(0.82, 0.82, 1.05), cuts: [1, 2, 3, 4, 5, 6, 7].map(i => i / 8), dx: 0, dy: 0 }, acc: { chawan: true, negi: true, wasabi: true, nori: true }, side: {} }, o);
    const setup = { look: 0 };
    const j = (c, pl) => H.judge(mk(c), plate(pl), setup);
    return {
      perfect: j({}, {}).pts,
      burnt: j({}, { eel: { f: fil(1.35, 0.8, 1.05), cuts: [1, 2, 3, 4, 5, 6, 7].map(i => i / 8), dx: 0, dy: 0 } }).pts,
      raw: j({}, { eel: { f: fil(0.3, 0.3, 1.05), cuts: [1, 2, 3, 4, 5, 6, 7].map(i => i / 8), dx: 0, dy: 0 } }).pts,
      vessel: j({}, { vessel: 'don' }),
      noWasabi: j({ req: ['noWasabi'] }, {}),
      noWasabiOk: j({ req: ['noWasabi'] }, { acc: { chawan: true, negi: true, nori: true } }).pts,
      chazukeNoDashi: j({ style: 2 }, {}).pts, chazukeOk: j({ style: 2 }, { acc: { chawan: true, negi: true, wasabi: true, nori: true, dashi: true } }).pts,
      uneven: j({}, { eel: { f: fil(0.82, 0.82, 1.05), cuts: [0.1, 0.15, 0.2], dx: 0, dy: 0 } }).pts,
      messy: j({}, { rice: [0.9], eel: { f: fil(0.82, 0.82, 1.05), cuts: [1, 2, 3, 4, 5, 6, 7].map(i => i / 8), dx: 0.9, dy: 0.6 } }).pts,
      hurryFast: j({ req: ['hurry'], wait: 5, pat: 55 }, {}).pts, hurrySlow: j({ req: ['hurry'], wait: 50, pat: 55 }, {}).pts,
      tareMoreThin: j({ req: ['tareMore'] }, {}).parts.tare, tareMoreOk: j({ req: ['tareMore'] }, { eel: { f: fil(0.82, 0.82, 1.55), cuts: [1, 2, 3, 4, 5, 6, 7].map(i => i / 8), dx: 0, dy: 0 } }).parts.tare,
      shiraTare: H.judge(mk({ dish: 'shira', style: 0 }), plate({ vessel: 'sara', rice: [], eel: { f: fil(0.82, 0.82, 1.0), cuts: [1 / 3, 2 / 3], dx: 0, dy: 0 }, acc: { wasabi: true } }), setup).parts.tare,
      shiraOk: H.judge(mk({ dish: 'shira', style: 0 }), plate({ vessel: 'sara', rice: [], eel: { f: fil(0.82, 0.82, 0), cuts: [1 / 3, 2 / 3], dx: 0, dy: 0 }, acc: { wasabi: true } }), setup).pts,
      usual: j({ usual: true, reg: 'hana', req: ['noWasabi', 'tareMore'] }, { acc: { chawan: true, negi: true, nori: true }, eel: { f: fil(0.82, 0.82, 1.55), cuts: [1, 2, 3, 4, 5, 6, 7].map(i => i / 8), dx: 0, dy: 0 } }),
      usualAsked: j({ usual: true, asked: true, reg: 'hana', req: ['noWasabi', 'tareMore'] }, { acc: { chawan: true, negi: true, nori: true }, eel: { f: fil(0.82, 0.82, 1.55), cuts: [1, 2, 3, 4, 5, 6, 7].map(i => i / 8), dx: 0, dy: 0 } }).pts,
      side: j({ side: 'kimo' }, {}).pts, sideOk: j({ side: 'kimo' }, { side: { kimo: 1 } }).pts,
      tip: j({}, {}).tip,
    };
  });
  check('a perfect dish ≥ 90 (極上) with a tip', r.perfect >= 90 && r.tip > 0, r);
  check('burnt and undercooked score much lower', r.burnt < r.perfect - 12 && r.raw < r.perfect - 15, [r.burnt, r.raw]);
  check('wrong vessel costs points and is noted', r.vessel.pts <= r.perfect - 10 && r.vessel.notes.includes('器がちがう'), r.vessel);
  check('wasabi for a わさび抜き order is punished', r.noWasabi.pts < r.noWasabiOk - 8 && r.noWasabi.notes.includes('わさび抜きなのに'), [r.noWasabi, r.noWasabiOk]);
  check('eating style: chazuke needs dashi', r.chazukeNoDashi < r.chazukeOk, [r.chazukeNoDashi, r.chazukeOk]);
  check('uneven cuts and messy plating lose points', r.uneven < r.perfect - 5 && r.messy < r.perfect - 8, [r.uneven, r.messy]);
  check('急いで: speed matters a lot', r.hurryFast > r.hurrySlow + 15, [r.hurryFast, r.hurrySlow]);
  check('タレ多め wants more tare', r.tareMoreOk > r.tareMoreThin, [r.tareMoreThin, r.tareMoreOk]);
  check('白焼き must not have tare', r.shiraTare < 5 && r.shiraOk >= 85, [r.shiraTare, r.shiraOk]);
  check('a remembered "usual" gets a bonus, asking does not', r.usual.remembered && r.usual.pts >= r.usualAsked + 9, [r.usual.pts, r.usualAsked]);
  check('an ordered side dish counts', r.sideOk > r.side, [r.side, r.sideOk]);
  check('no page errors (scoring)', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
}

async function strictness(env) {
  console.log('4. strictness B → C → A');
  const s = await open(env, { seed: seedOf(BASE) });
  const p = s.page;
  const out = await p.evaluate(() => {
    const H = __hitsu, D = () => H.D;
    const burntDish = (c) => { // a burnt eel, otherwise right
      H.D.sel = c.id; if (!H.addEel(0)) { H.D.grills[0] = null; H.addEel(0); }
      H.cook(0, 1.4, 0.9); H.brush(0, 1.05); H.takeOff(0); H.chopNow([1, 2, 3, 4, 5, 6, 7].map(i => i / 8).slice(0, ({ hitsu: 7, don: 2, shira: 2 })[c.dish]));
      H.chooseVessel(({ hitsu: 'ohitsu', don: 'don', shira: 'sara' })[c.dish]);
      if (c.dish !== 'shira') for (const x of [-0.6, 0, 0.6]) H.dropRice(x);
      H.dropEel(0, 0); for (const k of H.required(c)) H.D.plate.acc[k] = true;
      return H.serve();
    };
    const seated = () => D().cust.find(c => c.state === 'seat');
    const waitSeat = () => { for (let i = 0; i < 200 && !seated(); i++) H.advance(0.5); return seated(); };
    const res = {};
    // B
    H.startDay('normal'); let c = waitSeat();
    const b = burntDish(c); res.B = { accepted: !!(b && b.result && !b.refused), pts: b && b.result && b.result.pts };
    c = waitSeat(); c.wait = c.pat + 1; H.advance(0.2); res.Bwait = c.state;
    // C: a picky customer sends it back
    H.startDay('normal'); H.setup({ strict: 'C', rank: 2 }); c = waitSeat(); c.strict = true;
    const r1 = burntDish(c); res.C = { refused: !!(r1 && r1.refused), still: c.state, refusedCount: D().refused };
    c = seated(); c.strict = false; const r2 = burntDish(c); res.Cnormal = !!(r2 && r2.result && !r2.refused);
    c = waitSeat(); c.strict = true; c.wait = c.pat + 1; H.advance(0.2); res.CstrictLeaves = c.state;
    // A: burnt cannot be served at all; waiting too long → angry
    H.startDay('normal'); H.setup({ strict: 'A', rank: 3 }); c = waitSeat(); c.strict = false;
    const r3 = burntDish(c); res.A = { blocked: !!(r3 && r3.blocked), plateKept: !!D().plate.eel, served: D().served.length };
    H.trash(true);
    c.wait = c.pat + 1; H.advance(0.2); res.Aangry = { state: c.state, angry: D().angry };
    H.advance(3); res.Agone = !D().cust.includes(c);
    return res;
  });
  check('B: a burnt dish can still be served, with a low score', out.B.accepted && out.B.pts < 85, out.B);
  check('B: a customer kept too long stays', out.Bwait === 'seat', out.Bwait);
  check('C: a picky customer refuses burnt eel and keeps waiting', out.C.refused && out.C.still === 'seat' && out.C.refusedCount === 1, out.C);
  check('C: an ordinary customer still accepts', out.Cnormal, out.Cnormal);
  check('C: a picky customer kept too long leaves', out.CstrictLeaves === 'angry', out.CstrictLeaves);
  check('A: burnt eel cannot be served (remake)', out.A.blocked && out.A.plateKept && out.A.served === 0, out.A);
  check('A: kept too long → leaves angry', out.Aangry.state === 'angry' && out.Aangry.angry === 1 && out.Agone, out);
  const x = await st(p);
  check('quitting days did not change the save', x.save.day === BASE.day, x.save.day);
  await s.close();
}

async function dailyAndEnglish(env) {
  console.log('5. daily challenge, side dish, regulars, English');
  const s = await open(env, { lang: 'en', seed: seedOf(Object.assign({}, BASE, { best: 500, day: 7, regs: { hana: { visits: 2, known: true } } })) });
  const p = s.page;
  let jp = await p.evaluate(`(${jpScan})(true)`);
  check('en: no Japanese visible in the shop', jp.length === 0, jp);
  for (const tab of ['up', 'menu', 'regs']) { await p.click(`#shopTabs [data-tab="${tab}"]`); jp = await p.evaluate(`(${jpScan})(true)`); check('en: shop tab ' + tab + ' has no Japanese', jp.length === 0, jp); }
  await shot(p, '5-shop-en');
  await p.click('#shopDaily');
  let x = await st(p);
  check('daily: fixed setup (2 grills, all menus, C)', x.mode === 'daily' && x.grills.length === 2 && x.strict === 'C', x);
  await p.evaluate(() => __hitsu.advance(8));
  // the side dish mini game: liver soup, poured to the line
  await p.evaluate(() => { __hitsu.setView('plate'); __hitsu.chooseVessel('ohitsu'); __hitsu.openMini('kimo'); __hitsu.miniDown(); __hitsu.advance(1.55); __hitsu.miniUp(); });
  x = await st(p);
  check('liver soup poured near the line → good side', x.plate.side.kimo >= 0.8, x.plate.side);
  await p.evaluate(() => { __hitsu.trash(true); __hitsu.openMini('umaki'); for (let i = 0; i < 3; i++) { __hitsu.advance(0.9); __hitsu.miniDown(); } });
  x = await st(p);
  check('umaki rolled on time ×3 → good side', x.plate.side.umaki >= 0.8, x.plate.side);
  await p.evaluate(() => __hitsu.trash(true));
  await p.evaluate(() => __hitsu.setView('grill'));
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('en: no Japanese visible during the day', jp.length === 0, jp);
  await shot(p, '5-daily-en');
  let guard = 0;
  while (!(x = await st(p)).over && guard++ < 600) { if (x.cust.some(c => c.state === 'seat')) await p.evaluate(() => __kb.step(1)); await p.evaluate(() => __hitsu.advance(2)); }
  check('daily finished with dishes served', x.over && x.served.length >= 4, x.served.length);
  const rec = await p.evaluate(() => { const P = KoboPlatform; return P.daily.get(P.jstDateKey(), 'hitsumabushi'); });
  check('daily recorded in kobo.daily, normal best untouched', rec && rec.best === x.score && x.save.best === 500 && x.save.day === 7, { rec, best: x.save.best });
  jp = await p.evaluate(`(${jpScan})(true)`);
  check('en: no Japanese on the result card', jp.length === 0, jp);
  await s.close();
  // a regular's "usual" in the normal shop (ja)
  const s2 = await open(env, { seed: seedOf(Object.assign({}, BASE, { day: 7, regs: { hana: { visits: 2, known: true } } })) });
  const r = await s2.page.evaluate(() => {
    const H = __hitsu; H.startDay('normal');
    const D = H.D; const all = D.sched.concat(D.cust); const hana = all.find(c => c.reg === 'hana');
    return hana ? { usual: hana.usual, req: hana.req } : { none: true, n: all.length };
  });
  check('regulars: the 3rd visit says "the usual" (or did not come today)', r.none || (r.usual && r.req.includes('noWasabi')), r);
  await s2.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  B.ensureCdn();
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  for (const f of [tutorial, fullDay, scoring, strictness, dailyAndEnglish]) {
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 600)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
