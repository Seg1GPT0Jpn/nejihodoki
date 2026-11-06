#!/usr/bin/env node
// からくり工房からの脱出の通しプレイ（Playwright。?debug の window.__escape で「どこを押すか」だけを聞き、押すのは本物のクリック）
//   node tools/tests/escape-play.js            … 全部（約3〜4分）。スクリーンショットは tools/tests/out/shots/escape-play/
// 1. 初回：遊び方 → 物語 → 部屋1のチュートリアル（見回す・拾う・使う・調べる・組み合わせる・ヒント）→ ヒントを3段階見る → 正解の手順で脱出 → 点数にヒントが入る
// 2. 日本語で部屋2〜5を正解の手順（rooms の route）だけで脱出（本物のクリック）。結果・合計・エンディング・記録
// 3. 英語で5部屋をはじめから通す。どの画面でも、画面の文字と canvas に描く文字に日本語が残っていない（KoboI18n.t の訳し漏れを記録）
// 4. 自動保存：部屋3のとちゅうで再読み込み → 「つづきから」で持ち物・状態・時間が戻る → 最後まで
// 5. 一時停止：隠すと時間が止まり、戻ると「つづける」まで止まったまま
// 6. 画面サイズ：全サイズ × ja/en で、部屋の中の ◀ ▼ ▶・ヒント・持ち物が画面内で44px以上、横スクロールなし、場面の絵が十分大きい
// 7. 正解でない手は通らない（ちがう番号・ちがう順番・ちがう歯車）
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'escape-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.escape.save', RUN = 'kusoge.escape.run';
const SEEN = { 'kusoge.escape.howto': '1' };
// records every string the game asks KoboI18n.t for whose answer still has Japanese in it (English only)
const I18N_WATCH = `(() => { let k = null; window.__jpMiss = [];
  Object.defineProperty(window, 'KoboI18n', { configurable: true, get() { return k; }, set(v) {
    k = v; if (!v || !v.t) return; const t = v.t;
    v.t = function (s, vars) { const r = t(s, vars); if (v.lang === 'en' && /[\\u3040-\\u30ff\\u3400-\\u9fff]/.test(r) && !window.__jpMiss.includes(s)) window.__jpMiss.push(s); return r; };
  } }); })();`;

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || {}, isMobile: false, hasTouch: false });
  if (o.lang === 'en') await s.page.addInitScript(I18N_WATCH);
  await s.goto('/escape/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready());
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);

// one action of a route, done with real clicks
async function act(p, a) {
  if (a === 'L') return p.click('#navL');
  if (a === 'R') return p.click('#navR');
  if (a === 'B') return p.click('#navBack');
  if (a.startsWith('w:')) {
    const n = +a.slice(2);
    for (let g = 0; g < 6 && !/^w\d$/.test((await st(p)).view); g++) await p.click('#navBack');
    for (let g = 0; g < 4 && (await st(p)).wall !== n; g++) await p.click('#navR');
    return;
  }
  if (a.startsWith('i:')) return p.click(`#inv .slot[data-item="${a.slice(2)}"]`);
  if (a.startsWith('s:')) {
    const pt = await p.evaluate(id => __escape.where(id), a.slice(2));
    if (!pt) throw new Error('spot not on screen: ' + a + ' in ' + JSON.stringify(await p.evaluate(() => ({ v: __kb.state().view, spots: __escape.spots() }))));
    return p.mouse.click(pt.x, pt.y);
  }
  if (a === 'slide') {
    const moves = await p.evaluate(() => __escape.slideMoves());
    for (const k of moves) { const pt = await p.evaluate(id => __escape.where(id), 'tile' + k); await p.mouse.click(pt.x, pt.y); }
    return;
  }
  throw new Error('unknown action ' + a);
}
async function playRoute(p, ri, from = 0, opt = {}) {
  const route = await p.evaluate(i => __escape.route(i), ri);
  for (let i = from; i < route.length; i++) {
    if (opt.until != null && i >= opt.until) return i;
    await act(p, route[i]);
    if (opt.each) await opt.each(i, route[i]);
  }
  return route.length;
}
async function waitResult(p) { await p.waitForFunction(() => __kb.state().result, null, { timeout: 5000 }); return st(p); }
// from the result card, go on to the next room (real clicks on "next" and "start")
async function nextRoom(p) { await p.click('#rNext'); await p.waitForFunction(() => __kb.state().story); await p.click('#sGo'); }

async function firstVisit(env) {
  console.log('1. first visit: how to play → story → tutorial in room 1 → hints → escape');
  const s = await open(env);
  const p = s.page;
  let x = await st(p);
  check('first visit shows how to play', x.howto && !x.title, x);
  await shot(p, '1-howto');
  await p.click('#howtoGo');
  x = await st(p);
  check('then the story of room 1', x.story, x);
  await shot(p, '1-story');
  await p.click('#sGo');
  x = await st(p);
  check('room 1 starts with the tutorial coach (step 0: look around)', x.room === 0 && x.tut === 0 && /◀ ▶/.test(await p.textContent('#msg')), x);
  await p.click('#navR'); await p.click('#navL');
  x = await st(p);
  check('turning advances the tutorial (pick something up next)', x.tut === 1 && x.view === 'w0', x);
  await playRoute(p, 0, 2, { until: 6 }); // letter, apron, pocket
  x = await st(p);
  check('picking up the screwdriver advances it (use an item next)', x.inv.includes('driver') && x.tut === 2, x);
  await shot(p, '1-apron');
  // wrong use first: the screwdriver on the door does nothing
  await act(p, 'B'); await act(p, 'i:driver'); await act(p, 's:door');
  x = await st(p);
  check('a wrong item use is refused (door stays shut, screwdriver kept)', !x.over && x.inv.includes('driver') && x.tut === 2, x);
  await playRoute(p, 0, 7, { until: 8 }); // w:3 (the screwdriver is still selected after the refused use)
  await playRoute(p, 0, 9, { until: 11 }); // vent, card
  x = await st(p);
  check('using the screwdriver on the vent works (inspect next)', x.S.ventOpen === 1 && x.inv.includes('card') && x.tut === 3, x);
  await act(p, 'i:card'); await act(p, 'i:card');
  x = await st(p);
  check('tapping the selected card again inspects it', x.view === 'i:card' && x.tut === 4, x);
  await shot(p, '1-inspect');
  // wrong code: 1-2-3 does not open the drawer
  await act(p, 'B'); await act(p, 'B'); await act(p, 'w:1'); await act(p, 's:drawer');
  for (const id of ['s:d0u', 's:d1u', 's:d1u', 's:d2u', 's:d2u', 's:d2u']) await act(p, id);
  x = await st(p);
  check('a wrong drawer code (1-2-3) stays shut', x.S.drawerOpen === 0 && x.S.dial.join('') === '123', x.S);
  for (const id of ['s:d0d', 's:d1d', 's:d1d', 's:d2d', 's:d2d', 's:d2d']) await act(p, id);
  // hints: open, see all three for the drawer
  await p.click('#hintBtn');
  x = await st(p);
  check('the hint panel lists the open puzzles', x.hint && x.open.includes('drawer') && !x.open.includes('key'), x.open);
  for (let i = 0; i < 3; i++) await p.click('#hList [data-p="drawer"] [data-hint]');
  x = await st(p);
  const htxt = await p.textContent('#hList [data-p="drawer"]');
  check('three progressive hints, the last one gives the answer', x.hints.drawer === 3 && /5・7・2/.test(htxt) && !(await p.$('#hList [data-p="drawer"] [data-hint]')), { h: x.hints, htxt });
  check('the hint button shows the count', (await p.textContent('#hintN')) === '3', await p.textContent('#hintN'));
  await shot(p, '1-hints');
  await p.click('#hClose');
  await act(p, 'B');
  await playRoute(p, 0, 18); // the rest of the intended solution
  x = await waitResult(p);
  check('room 1 escaped → result card', x.over && x.result && x.last.ri === 0, x.last);
  const exp = await p.evaluate(ms => __escape.scoreOf(6 * 60000, ms, 3), x.last.ms);
  check('score = 200 + hints (400 − 3×40) + time; rank shown', x.last.s === exp && x.last.s <= 880 && (await p.textContent('#rRank')).length === 1, { last: x.last, exp });
  const sv = await stored(p, SAVE);
  check('saved: room 1 record, total, tutorial done, run cleared', sv.rooms.r1.s === x.last.s && sv.total === x.last.s && sv.tut === 1 && !(await stored(p, RUN)), sv);
  const ev = await p.evaluate(() => (__kb.events || []).map(e => e.type + ':' + (e.p && e.p.mode || e.mode || '') + ':' + (e.p && e.p.reason || e.reason || '')));
  check('events: play_start, stage_clear, play_end(clear)', ev.includes('play_start:normal:') && ev.some(e => e.startsWith('stage_clear')) && ev.includes('play_end:normal:clear'), ev);
  await shot(p, '1-result');
  // the next rooms in Japanese, from the result card
  console.log('2. rooms 2–5 in Japanese with the intended solutions (real clicks)');
  for (let ri = 1; ri < 5; ri++) {
    await nextRoom(p);
    x = await st(p);
    check(`room ${ri + 1} starts with an empty bag at wall 0`, x.room === ri && x.inv.length === 0 && x.view === 'w0', x);
    await shot(p, `2-room${ri + 1}-start`);
    let mid = null;
    await playRoute(p, ri, 0, { each: async (i, a) => { if (i === 20) { mid = true; await shot(p, `2-room${ri + 1}-mid`); } } });
    x = await waitResult(p);
    check(`room ${ri + 1} escaped with no hints → rank S, 1,000 pts (fast)`, x.last.ri === ri && x.last.hints === 0 && x.last.s === 1000 && x.last.rk === 4, x.last);
    await shot(p, `2-room${ri + 1}-result`);
  }
  check('after room 5: the ending', /エンディング/.test(await p.textContent('#rTitle')) && /一人前/.test(await p.textContent('#rStory')), await p.textContent('#rTitle'));
  const sv2 = await stored(p, SAVE);
  check('all five rooms recorded; total = sum of bests', Object.keys(sv2.rooms).length === 5 && sv2.total === Object.values(sv2.rooms).reduce((a, r) => a + r.s, 0) && sv2.stats.done === 5, sv2);
  const ach = await p.evaluate(() => window.KoboAchievements ? Object.keys(KoboAchievements.unlocked()).filter(id => /^escape\./.test(id)) : null);
  check('achievements: first, rooms, all five, no hints, rank S', ach && ['escape.first', 'escape.r1', 'escape.r3', 'escape.all', 'escape.nohint', 'escape.rankS'].every(id => ach.includes(id)), ach);
  await p.click('#rNext');
  x = await st(p);
  check('title: every room unlocked, total shown', x.title && (await p.$$('#tRooms .room:not(:disabled)')).length === 5 && /\d/.test(await p.textContent('#tTotal')), x);
  await shot(p, '2-title');
  await s.close();
}

async function english(env) {
  console.log('3. English: all five rooms; no Japanese on screen or drawn on the canvas');
  const s = await open(env, { lang: 'en' });
  const p = s.page;
  await p.click('#howtoGo'); await p.click('#sGo');
  const seen = new Set();
  for (let ri = 0; ri < 5; ri++) {
    if (ri) await nextRoom(p);
    await playRoute(p, ri, 0, { each: async (i, a) => {
      if (i % 4 === 0) { const jp = await p.evaluate(`(${jpScan})(true)`); jp.forEach(t => seen.add(t)); }
      if (i === 6) await shot(p, `3-en-room${ri + 1}`);
    } });
    // open the hints once per room in English, then close
    const x = await waitResult(p);
    check(`en: room ${ri + 1} escaped`, x.last.ri === ri, x.last);
    const jp = await p.evaluate(`(${jpScan})(true)`); jp.forEach(t => seen.add(t));
  }
  await shot(p, '3-en-ending');
  check('en: no Japanese visible on any screen', seen.size === 0, [...seen].slice(0, 10));
  const watch = await p.evaluate(() => { KoboI18n.t('未翻訳のテスト'); const ok = window.__jpMiss.includes('未翻訳のテスト'); window.__jpMiss = window.__jpMiss.filter(x => x !== '未翻訳のテスト'); return ok; });
  check('en: the translation watcher works (self-check)', watch, null);
  const miss = await p.evaluate(() => window.__jpMiss);
  check('en: every string the game drew had an English translation', miss.length === 0, miss.slice(0, 12));
  await s.close();
  // hints and title in English
  const s2 = await open(env, { lang: 'en', seed: SEEN });
  const p2 = s2.page;
  for (let ri = 0; ri < 5; ri++) {
    await p2.evaluate(i => __escape.jump(i), ri);
    await p2.click('#hintBtn');
    for (const b of await p2.$$('#hList [data-hint]')) { await b.click().catch(() => {}); }
    for (let k = 0; k < 2; k++) for (const b of await p2.$$('#hList [data-hint]')) await b.click().catch(() => {});
    // all hints of every puzzle, through the debug list
    await p2.evaluate(() => { for (const pz of __escape.run.room.puzzles) for (const h of pz.hints) KoboI18n.t(h); for (const pz of __escape.run.room.puzzles) KoboI18n.t(pz.name); KoboI18n.t(__escape.run.room.intro); KoboI18n.t(__escape.run.room.outro); });
    for (const it of Object.values(await p2.evaluate(() => Object.fromEntries(Object.entries(__escape.run.room.items).map(([k, v]) => [k, [v.name, v.desc]]))))) await p2.evaluate(a => a.forEach(s => KoboI18n.t(s)), it);
    const jp = await p2.evaluate(`(${jpScan})(true)`);
    check(`en: hint panel of room ${ri + 1} has no Japanese`, jp.length === 0, jp.slice(0, 5));
    if (ri === 4) await shot(p2, '3-en-hints');
    await p2.click('#hClose');
  }
  const miss2 = await p2.evaluate(() => window.__jpMiss);
  check('en: every hint, puzzle name, item and story has a translation', miss2.length === 0, miss2.slice(0, 12));
  await s2.close();
}

async function resume(env) {
  console.log('4. autosave: reload in the middle of room 3, continue, finish');
  const s = await open(env, { seed: Object.assign({}, SEEN, { [SAVE]: JSON.stringify({ v: 1, rooms: { r1: { s: 900, t: 300000, r: 4, nh: 1, c: 1 }, r2: { s: 800, t: 500000, r: 3, nh: 1, c: 1 } }, total: 1700, stats: {}, tut: 1 }) }) });
  const p = s.page;
  check('rooms 1–3 unlocked, 4–5 locked', (await p.$$('#tRooms .room:not(:disabled)')).length === 3, null);
  await p.click('#tRooms .room[data-room="2"]'); await p.click('#sGo');
  const stop = await playRoute(p, 2, 0, { until: 19 }); // through the light table (tile in the bag)
  await p.click('#hintBtn'); await p.click('#hList [data-hint]'); await p.click('#hClose');
  await p.evaluate(() => __escape.addMs(42000));
  const before = await st(p);
  await p.evaluate(() => __escape.persist());
  await p.reload();
  await p.waitForFunction(() => window.__kb && __kb.ready());
  let x = await st(p);
  check('after reload: the title offers "continue" (room 3)', x.title && /部屋3/.test(await p.textContent('#tContinue')), await p.textContent('#tContinue'));
  await p.click('#tContinue');
  x = await st(p);
  check('continue restores room, bag, state, view, hints and time', x.room === 2 && JSON.stringify(x.inv) === JSON.stringify(before.inv) && x.S.beamOK === 1 && x.view === before.view && x.hintTotal === 1 && x.ms >= before.ms - 1000, { x: { inv: x.inv, view: x.view, ms: x.ms }, before: { inv: before.inv, view: before.view, ms: before.ms } });
  await playRoute(p, 2, stop);
  x = await waitResult(p);
  check('finished after resuming; the hint and time count', x.last.ri === 2 && x.last.hints === 1 && x.last.ms >= 42000 && x.last.s < 1000, x.last);
  const sv = await stored(p, SAVE);
  check('best of room 3 saved, total grows, the old bests stay', sv.rooms.r3.s === x.last.s && sv.rooms.r1.s === 900 && sv.total === 1700 + x.last.s, sv);
  // replaying a room with a worse score keeps the best
  await p.click('#rAgain'); await p.click('#sGo');
  await p.evaluate(() => __escape.addMs(3 * 3600000));
  await playRoute(p, 2);
  x = await waitResult(p);
  const sv2 = await stored(p, SAVE);
  check('a slower replay does not lower the best', x.last.s < sv.rooms.r3.s && sv2.rooms.r3.s === sv.rooms.r3.s && sv2.rooms.r3.c === 2 && sv2.total === sv.total, { last: x.last, r3: sv2.rooms.r3 });
  await s.close();
}

async function pause(env) {
  console.log('5. pause: hidden → the clock stops; back → stays paused until Resume');
  const s = await open(env, { seed: SEEN });
  const p = s.page;
  await p.evaluate(() => __escape.jump(1));
  await p.waitForTimeout(1200);
  const hide = h => p.evaluate(h => { Object.defineProperty(document, 'hidden', { configurable: true, get: () => h }); Object.defineProperty(document, 'visibilityState', { configurable: true, get: () => (h ? 'hidden' : 'visible') }); document.dispatchEvent(new Event('visibilitychange')); }, h);
  await hide(true);
  const a = (await st(p)).ms;
  await p.waitForTimeout(1500);
  const b = (await st(p)).ms;
  check('hidden: the time does not run', b - a < 300 && (await st(p)).paused, { a, b });
  await hide(false);
  await p.waitForTimeout(800);
  let x = await st(p);
  check('visible again: the pause menu waits for Resume', x.menuOpen && !!(await p.$('.kb-layer--pause:not([hidden])')), x);
  const c = x.ms;
  await p.waitForTimeout(1000);
  check('still paused under the menu', (await st(p)).ms - c < 300, null);
  await p.click('.kb-layer--pause .kb-btn--primary');
  await p.waitForTimeout(1200);
  x = await st(p);
  check('after Resume the time runs again', x.ms - c >= 700 && !x.menuOpen, x.ms - c);
  await s.close();
}

async function layouts(env) {
  console.log('6. every screen size × ja/en: controls inside the screen, 44 px, scene large enough');
  for (const vp of Object.keys(V.VIEWPORTS)) for (const lang of ['ja', 'en']) {
    const s = await open(env, { vp, lang, seed: SEEN });
    const p = s.page;
    await p.evaluate(() => __escape.jump(1));
    await playRoute(p, 1, 0, { until: 8 }); // a few items in the bag, at the rug wall
    await p.waitForTimeout(150);
    const r = await p.evaluate(`(${layoutProbe})()`);
    const m = await p.evaluate(() => {
      const box = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
      const ids = ['navL', 'navBack', 'navR', 'hintBtn', 'menuBtn', 'sndBtn'];
      const els = ids.map(id => [id, box(document.getElementById(id))]).concat([...document.querySelectorAll('#inv .slot')].map((e, i) => ['slot' + i, box(e)]));
      return { els, cv: box(document.getElementById('scene')), W: innerWidth, H: innerHeight };
    });
    const bad = m.els.filter(([id, b]) => b.x < -1 || b.y < -1 || b.x + b.w > m.W + 1 || b.y + b.h > m.H + 1 || b.w < 44 || b.h < 44).map(([id, b]) => id + ' ' + JSON.stringify(b));
    check(`${vp} ${lang}: controls on screen and ≥44 px, no sideways scroll`, !bad.length && r.hscroll <= 1 && r.offscreen.length === 0, { bad, h: r.hscroll, off: r.offscreen.slice(0, 3) });
    const big = m.cv.w >= Math.min(300, m.W * 0.5) && m.cv.h >= 200 && m.cv.y >= 0 && m.cv.y + m.cv.h <= m.H + 1;
    check(`${vp} ${lang}: the scene is big and fully visible (${Math.round(m.cv.w)}×${Math.round(m.cv.h)})`, big, m.cv);
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${vp} en: no Japanese`, jp.length === 0, jp.slice(0, 4)); }
    await shot(p, `6-${vp}-${lang}`);
    // the result card fits too
    await p.evaluate(() => __kb.win());
    await p.waitForFunction(() => __kb.state().result, null, { timeout: 4000 });
    const rr = await p.evaluate(`(${layoutProbe})()`);
    const pb = rr.primary.filter(x => x.problems.length || x.h < 44);
    check(`${vp} ${lang}: result card buttons visible`, !pb.length, pb.slice(0, 3));
    if (vp === 'se1' || vp === 'land') await shot(p, `6-${vp}-${lang}-result`);
    await s.close();
  }
}

async function fairness(env) {
  console.log('7. only the intended answers work');
  const s = await open(env, { seed: SEEN });
  const p = s.page;
  // room 2: wrong cabinet order, wrong gears
  await p.evaluate(() => __escape.jump(1));
  for (const a of ['w:3', 's:cab', 's:b_moon', 's:b_star', 's:b_cloud', 's:b_sun']) await act(p, a);
  let x = await st(p);
  check('room 2: a wrong button order resets', !x.S.cabOpen && x.S.seq.length === 0, x.S);
  for (const a of ['s:b_star', 's:b_sun', 's:b_cloud', 's:b_moon', 's:gearM', 's:ckey', 'B', 'w:2', 's:desk', 's:drawer', 's:gearS', 'B', 's:rug', 'w:1', 's:board', 'i:gearS', 's:pegA', 'i:gearL', 's:pegB', 'i:gearM', 's:pegE', 's:crank']) await act(p, a);
  x = await st(p);
  check('room 2: gears in the wrong places do not turn', !x.S.gearsDone && x.inv.length === 1, x.S);
  await shot(p, '7-gears-wrong');
  // room 4: weights that do not balance
  await p.evaluate(() => __escape.jump(3));
  for (const a of ['w:3', 's:boots', 's:toolbox', 'w:1', 's:scale', 'i:w5', 's:rpan', 'i:w2', 's:rpan']) await act(p, a);
  x = await st(p);
  check('room 4: 5 + 2 does not balance 13', !x.S.scaleOK && x.S.pan.length === 2, x.S);
  await act(p, 's:rpan');
  x = await st(p);
  check('room 4: tapping the pan gives the weights back', x.S.pan.length === 0 && x.inv.includes('w5') && x.inv.includes('w2'), x.inv);
  // room 5: a wrong music box code
  await p.evaluate(() => __escape.jump(4));
  for (const a of ['w:2', 's:box', 's:c0u', 's:c1u', 's:c2u', 's:c3u']) await act(p, a);
  x = await st(p);
  check('room 5: a wrong code (1111) keeps the lid shut', !x.S.lidOpen, x.S.code);
  await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  B.ensureCdn();
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [firstVisit, english, resume, pause, layouts, fairness]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
