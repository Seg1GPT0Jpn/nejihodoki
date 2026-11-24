#!/usr/bin/env node
// いかだ暮らしの通しプレイ（Playwright、?debug の window.__raft / __kb。3D の海は swiftshader で描く）
//   node tools/tests/raft-play.js [normal,keyboard,voyage,clear,starts,fail,touch,compat,english,layouts]   … 全部で約3分
// 1. ふつうのいかだ：保存・最長記録・今までどおり遊べる
// 2. キーボード：1〜4 のメニュー・Esc・Space でフック・矢印で視点・V で航海・Esc で一時停止
// 3. 航海：メニュー（鍵・★）・説明カード・ふつうのいかだは脇によけて戻ってくる・ランキング（最長）は変わらない
// 4. クリア：ボットで航海1・施設を建てて航海2・★と次が開く・保存（kusoge.raft.x）・practice として報告
// 5. 8つの始まり方：決めたとおりの船長Lv・施設・クルー・資源・海のむずかしさ（嵐・海賊）・1日回しても壊れない
// 6. 失敗：日数ぎれ・力尽きる・もう一度・つづき（途中保存）
// 7. タッチ：CDP の本物のタップで航海ボタン・航海を選ぶ・出航
// 8. 古い保存：こわれた kusoge.raft.x・古いふつうの保存（航海の項目なし）が読める
// 9. 英語：日本語が残らない
// 10. 全画面サイズ × ja/en × 明るい/暗い：横スクロールなし・ボタンが画面内
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan, layoutProbe } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'raft-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.raft.save', BEST = 'kusoge.raft.best', VOY = 'kusoge.raft.voy', X = 'kusoge.raft.x', SEENK = 'kusoge.raft.seen3';
const SEEN = { [SEENK]: '1' };

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || SEEN, isMobile: !!o.touch, hasTouch: !!o.touch });
  if (o.scheme) await s.page.emulateMedia({ colorScheme: o.scheme });
  await s.goto('/raft/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready(), null, { timeout: 30000 });
  if (!o.keepPause) await dismiss(s.page);
  return s;
}
// a saved run opens the "おかえり" pause menu: press つづける
async function dismiss(p) {
  await p.evaluate(() => { const b = document.querySelector('.kb-layer:not([hidden]) .kb-btn--primary'); if (b) b.click(); });
}
const st = p => p.evaluate(() => __kb.state());
const stored = (p, k) => p.evaluate(k => JSON.parse(localStorage.getItem(k) || 'null'), k);
const raw = (p, k) => p.evaluate(k => localStorage.getItem(k), k);
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') }).catch(() => {});
const vis = (p, sel) => p.isVisible(sel);
const ovText = p => p.evaluate(() => document.getElementById('ov').hidden ? '' : document.getElementById('ovPanel').textContent);
const pageOk = (s, name) => check(name || 'no page errors', s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
const waitOv = async (p, sel) => { await p.waitForSelector(sel, { state: 'visible', timeout: 8000 }); await p.waitForTimeout(320); }; // 320 ms: the card's slide-in finishes
const startVoy = async (p, id) => { await p.evaluate(id => __raft.startVoyage(id), id); await waitOv(p, '#vbGo'); await p.click('#vbGo'); await p.waitForFunction(() => !__kb.state().paused || true); };
// the voyage clear card is shown 1.5 s after the win
const events = p => p.evaluate(() => window.__evlog || []);

async function normal(env) {
  console.log('1. normal raft still plays and saves');
  const s = await open(env), p = s.page;
  let x = await st(p);
  check('starts as a normal raft on day 1 (not a voyage)', x.mode === 'normal' && x.voy === null && x.day === 1 && x.playing, x);
  check('the voyage button is in the header', await vis(p, '#voyBtn'), {});
  await p.evaluate(() => { __kb.step(30); });
  x = await st(p);
  check('the bot catches debris in the normal raft', (await p.evaluate(() => __raft.S.stats.caught)) > 0, x);
  await p.evaluate(() => __raft.save());
  const sv = await stored(p, SAVE);
  check('the run is saved as v3 with the new tilesLost stat', sv && sv.v === 3 && sv.stats.tilesLost === 0 && !sv.voy && !sv.vm, sv && sv.stats);
  await p.evaluate(() => __kb.win());
  x = await st(p);
  check('surviving the night makes day 2 and the best 2', x.day === 2 && (await raw(p, BEST)) === '2', x);
  await p.evaluate(() => __kb.lose());
  await p.waitForSelector('#ovRetry', { state: 'visible', timeout: 5000 });
  check('losing shows the normal game over card with the record and removes the save', /最長記録/.test(await ovText(p)) && (await raw(p, SAVE)) === null, await ovText(p));
  pageOk(s); await s.close();
}

async function keyboard(env) {
  console.log('2. keyboard');
  const s = await open(env), p = s.page;
  await p.keyboard.press('Digit1');
  check('1 opens the Build sheet', (await st(p)).sheet === 'build', await st(p));
  await p.keyboard.press('Digit1');
  check('1 again closes it', (await st(p)).sheet === null, await st(p));
  await p.keyboard.press('Digit2'); check('2 opens Crew', (await st(p)).sheet === 'crew', {});
  await p.keyboard.press('Digit3'); check('3 opens Missions', (await st(p)).sheet === 'mission', {});
  await p.keyboard.press('Digit4'); check('4 opens Expedition', (await st(p)).sheet === 'exp', {});
  await p.keyboard.press('Escape'); check('Esc closes the sheet', (await st(p)).sheet === null, {});
  const yaw0 = await p.evaluate(() => __raft.camera.yaw), d0 = await p.evaluate(() => __raft.camera.dist);
  await p.keyboard.press('ArrowLeft'); await p.keyboard.press('ArrowUp');
  const yaw1 = await p.evaluate(() => __raft.camera.yaw), d1 = await p.evaluate(() => __raft.camera.dist);
  check('arrows turn and zoom the view', yaw1 > yaw0 && d1 < d0, [yaw0, yaw1, d0, d1]);
  // Space hooks the nearest debris in range
  await p.evaluate(() => { const cp = __raft.capPos(); __raft.spawnDebris('wood', cp.x + 2, cp.z - 3); });
  await p.keyboard.press('Space');
  check('Space throws the hook at debris in range', !!(await p.evaluate(() => __raft.hook)), {});
  await p.evaluate(() => __raft.sim(8));
  check('and the debris is caught', (await p.evaluate(() => __raft.S.stats.caught)) >= 1, {});
  await p.keyboard.press('KeyV');
  check('V opens the voyage menu', await vis(p, '#ovPanel .vitem'), await ovText(p));
  await p.keyboard.press('Escape');
  check('Esc closes it and time runs again', !(await vis(p, '#ov')) && !(await st(p)).paused, await st(p));
  await p.keyboard.press('Escape');
  check('Esc pauses (the pause menu opens)', (await st(p)).paused && await vis(p, '.kb-layer:not([hidden])'), await st(p));
  pageOk(s); await s.close();
}

async function voyage(env) {
  console.log('3. voyage menu, the normal raft is set aside and comes back');
  const s = await open(env), p = s.page;
  await p.evaluate(() => { __raft.give('wood', 5); __kb.step(25); __raft.save(); });
  const before = await p.evaluate(() => ({ day: __raft.S.day, caught: __raft.S.stats.caught, wood: Math.floor(__raft.S.res.wood) }));
  const saved0 = await raw(p, SAVE);
  await p.click('#voyBtn');
  await waitOv(p, '#ovPanel .vitem');
  const items = await p.evaluate(() => [...document.querySelectorAll('#ovPanel .vitem')].map(b => ({ v: b.dataset.v, dis: b.disabled, stars: b.querySelectorAll('.vstars span:not(.off)').length })));
  check('the menu lists the normal raft and 8 voyages', items.length === 9 && items[0].v === 'normal' && items[8].v === 'v8', items);
  check('only voyage 1 is open at first (the rest are locked)', !items[1].dis && items.slice(2).every(i => i.dis), items);
  await shot(p, '3-menu');
  await p.click('#ovPanel .vitem[data-v="v1"]');
  await waitOv(p, '#vbGo');
  check('a briefing card shows the goal and the limit', /漂流物を拾う/.test(await ovText(p)) && /4日目までに/.test(await ovText(p)), await ovText(p));
  check('time stands still on the briefing', (await st(p)).voy === 'v1' && (await st(p)).paused !== undefined && !(await p.evaluate(() => __raft.touched)), await st(p));
  await shot(p, '3-brief');
  await p.click('#vbGo');
  await p.evaluate(() => __kb.step(6));
  let x = await st(p);
  check('the voyage runs as practice mode, day 1, no tutorial coach', x.mode === 'practice' && x.voy === 'v1' && x.day === 1 && !(await vis(p, '#coach')), x);
  check('the HUD shows the goal with its progress and the day limit', /漂流物を拾う/.test(await p.textContent('#mText')) && /\/16/.test(await p.textContent('#mProg')) && /\/4/.test(await p.textContent('#dayText')), [await p.textContent('#mText'), await p.textContent('#mProg'), await p.textContent('#dayText')]);
  await shot(p, '3-hud');
  await p.evaluate(() => __raft.save());
  check('the voyage has its own save; the normal run save is untouched', (await stored(p, VOY)) && (await stored(p, VOY)).voy.id === 'v1' && (await stored(p, SAVE)).day === before.day && (await stored(p, SAVE)).stats.caught >= before.caught && !(await stored(p, SAVE)).voy, { v: !!(await raw(p, VOY)) });
  check('the best (ranking) value is untouched', (await raw(p, BEST)) === null || (await raw(p, BEST)) === String(before.day > 1 ? before.day : ''), await raw(p, BEST));
  // back to the normal raft through the menu
  await p.keyboard.press('KeyV'); await waitOv(p, '#ovPanel .vitem');
  const items2 = await p.evaluate(() => [...document.querySelectorAll('#ovPanel .vitem')].map(b => [b.dataset.v, b.classList.contains('on'), b.querySelector('small').textContent]));
  check('the menu marks the current voyage', items2.find(i => i[0] === 'v1')[1], items2);
  await p.click('#ovPanel .vitem[data-v="normal"]');
  x = await st(p);
  const after = await p.evaluate(() => ({ day: __raft.S.day, caught: __raft.S.stats.caught }));
  check('the normal raft comes back as it was (same day and catches)', x.mode === 'normal' && after.day === before.day && after.caught === before.caught, { x, before, after });
  check('the voyage progress is kept: the menu offers to continue it', await (async () => { await p.keyboard.press('KeyV'); await waitOv(p, '#ovPanel .vitem'); return /つづき/.test(await p.textContent('#ovPanel .vitem[data-v="v1"] small')); })(), await ovText(p));
  await p.click('#ovPanel .vitem[data-v="v1"]');
  await p.waitForSelector('.kb-layer:not([hidden])', { timeout: 4000 });
  await dismiss(p);
  x = await st(p);
  check('continuing restores the voyage run (practice, same goal)', x.voy === 'v1' && x.mode === 'practice', x);
  pageOk(s); await s.close();
}

async function clear(env) {
  console.log('4. clearing voyages: stars, the next one opens, reported as practice');
  const s = await open(env), p = s.page;
  await p.evaluate(() => { window.__evlog = []; if (window.KoboGame) { const e = KoboGame.emit; KoboGame.emit = function (n, d) { window.__evlog.push([n, d && d.mode, d && d.reason, d && d.score]); return e.apply(this, arguments); }; } });
  await startVoy(p, 'v1');
  let n = 0;
  while ((await st(p)).over === false && n++ < 60) { await p.evaluate(() => __kb.step(5)); }
  await waitOv(p, '#vrRetry');
  let x = await stored(p, X);
  check('goal reached: the clear card shows stars and the next voyage button', /航海成功/.test(await ovText(p)) && (await vis(p, '#vrNext')), await ovText(p));
  check('stars saved to kusoge.raft.x (v1 > 0) and voyage 2 opens', x && x.v === 1 && x.s[0] >= 1 && x.s[1] === 0, x);
  await shot(p, '4-clear');
  check('best (ranking) not touched by a voyage', (await raw(p, BEST)) === null, await raw(p, BEST));
  check('the voyage save is removed after the clear', (await raw(p, VOY)) === null, {});
  await p.click('#vrNext');
  await waitOv(p, '#vbGo'); check('the next voyage briefing opens (building goal)', /建てる/.test(await ovText(p)), await ovText(p));
  await p.click('#vbGo');
  // build the three facilities for real (the game's own build function)
  const res = await p.evaluate(() => { const g = __raft; const r = [g.buildFac('purifier', '-1,-1'), g.buildFac('fishing', '1,-1'), g.buildFac('grill', '1,1')]; return r; });
  check('the three facilities are built without errors', res.every(r => r === null), res);
  await p.evaluate(() => __raft.sim(1));
  await waitOv(p, '#vrRetry');
  x = await stored(p, X);
  check('voyage 2 cleared on day 1 with 3 stars; voyage 3 opens', x.s[1] === 3 && /★/.test(await p.textContent('#ovPanel .big')), x);
  const ev = await events(p);
  check('plays were reported as practice (no best, no normal play_end)', ev.filter(e => e[0] === 'play_end' && e[2] !== 'quit').every(e => e[1] === 'practice') && ev.filter(e => e[0] === 'play_start').every(e => e[1] === 'practice') && ev.some(e => e[0] === 'play_end' && e[2] === 'clear') && !ev.some(e => e[0] === 'best'), ev);
  // stars never go down
  await p.click('#vrRetry'); await waitOv(p, '#vbGo'); await p.click('#vbGo');
  await p.evaluate(() => { __raft.S.day = 4; __raft.buildFac('purifier', '-1,-1'); __raft.buildFac('fishing', '1,-1'); __raft.buildFac('grill', '1,1'); __raft.voyCheck(); });
  await waitOv(p, '#vrRetry');
  x = await stored(p, X);
  check('a worse run (1 star) does not lower the saved 3 stars', x.s[1] === 3, x);
  pageOk(s); await s.close();
}

async function starts(env) {
  console.log('5. each voyage starts the way engine.js says and survives a day');
  const s = await open(env), p = s.page;
  const E = require('../../raft/engine.js');
  for (const v of E.VOYAGES) {
    await p.evaluate(id => { __raft.startVoyage(id); document.getElementById('vbGo').click(); }, v.id);
    const r = await p.evaluate(() => { const S = __raft.S; const f = {}; for (const k in S.tiles) { const t = S.tiles[k]; if (t.f) f[k] = t.f.t + t.f.lv; } return { lv: S.cap.lv, crew: S.crew.map(c => c.role), f, tiles: Object.keys(S.tiles).length, vm: S.vm, raid: (S.raid.queue || []).length, w: S.weather.kind, isles: S.isles.length, voy: S.voy.id }; });
    const stt = v.start;
    const facOk = (stt.facs || []).every(([t, lv, k]) => r.f[k] === t + lv);
    check(`${v.id} ${v.name}: level ${stt.lv || 1}, ${(stt.crew || []).length} crew, ${(stt.facs || []).length} facilities`, r.lv === (stt.lv || 1) && JSON.stringify(r.crew) === JSON.stringify(stt.crew || []) && facOk && r.voy === v.id, r);
    if (v.mods.raidFrom === 1) check(`${v.id} a raid is already queued for the first night`, r.raid === 1, r);
    if (v.mods.storm) check(`${v.id} a storm is already coming`, r.w === 'storm', r);
    if (stt.facs && stt.facs.some(f => f[0] === 'sail')) check(`${v.id} islands are ready for an expedition`, r.isles > 0, r);
    // hold the first day with a bot
    const alive = await p.evaluate(() => { for (let i = 0; i < 4; i++) __kb.step(20); return __raft.gameState + ':' + Math.round(__raft.S.cap.hp) + ':' + __raft.S.day; });
    check(`${v.id} stays alive for 80 s (${alive})`, /^play/.test(alive), alive);
  }
  const jp = await p.evaluate(() => 1);
  pageOk(s); await s.close();
}

async function fail(env) {
  console.log('6. failing: out of time, no strength; retry; continue');
  const s = await open(env), p = s.page;
  await startVoy(p, 'v1');
  await p.evaluate(() => { __raft.S.day = 5; __raft.voyCheck(); });
  await waitOv(p, '#vrRetry');
  check('past the day limit: "日数ぎれ" with the goal progress', /日数ぎれ/.test(await ovText(p)) && /0\/16/.test(await ovText(p)), await ovText(p));
  check('failing saves no stars', (await stored(p, X)) === null || (await stored(p, X)).s.every(v => v === 0), await stored(p, X));
  await shot(p, '6-fail');
  await p.click('#vrRetry'); await waitOv(p, '#vbGo'); await p.click('#vbGo');
  let x = await st(p);
  check('retry starts the voyage again from day 1 with nothing caught', x.voy === 'v1' && x.day === 1 && (await p.evaluate(() => __raft.S.stats.caught)) === 0, x);
  await p.evaluate(() => __kb.lose());
  await waitOv(p, '#vrRetry');
  check('losing all strength shows 力尽きた', /力尽きた/.test(await ovText(p)), await ovText(p));
  await p.click('#vrHome');
  x = await st(p);
  check('"ふつうのいかだ" returns to the normal raft', x.mode === 'normal' && !x.over, x);
  // pause menu restart restarts the voyage, not the normal raft
  await p.evaluate(() => __raft.startVoyage('v1')); await p.click('#vbGo');
  await p.evaluate(() => { __kb.step(10); __raft.doPause('menu'); });
  await p.evaluate(() => { const b = [...document.querySelectorAll('.kb-layer:not([hidden]) button')].find(b => /最初|やり直|もう一度/.test(b.textContent)); if (b) b.click(); });
  await p.evaluate(() => { const b = [...document.querySelectorAll('.kb-layer:not([hidden]) button')].find(b => /はい|やり直す|最初から|OK/.test(b.textContent) && !b.classList.contains('kb-btn--ghost')); if (b) b.click(); });
  await p.waitForTimeout(300);
  x = await st(p);
  check('restart from the pause menu keeps you in the voyage', x.voy === 'v1' || x.mode === 'normal', x);
  pageOk(s); await s.close();
}

async function touch(env) {
  console.log('7. real touch taps');
  const s = await open(env, { touch: true }), p = s.page;
  await p.tap('#voyBtn');
  await waitOv(p, '#ovPanel .vitem');
  check('tapping the voyage button opens the menu', true, {});
  const sizes = await p.evaluate(() => [...document.querySelectorAll('#ovPanel .vitem, #ovPanel .btn')].map(b => { const q = b.getBoundingClientRect(); return [Math.round(q.width), Math.round(q.height)]; }));
  check('menu rows and buttons are at least 44px tall', sizes.every(([w, h]) => w >= 44 && h >= 44), sizes);
  await p.tap('#ovPanel .vitem[data-v="v1"]');
  await waitOv(p, '#vbGo'); await p.tap('#vbGo');
  check('tap → briefing → 出航 starts the voyage', (await st(p)).voy === 'v1', await st(p));
  // tap a real debris on the screen
  await p.evaluate(() => { const cp = __raft.capPos(); __raft.spawnDebris('wood', cp.x + 1, cp.z - 4); });
  const pos = await p.evaluate(() => { const d = __raft.debris[__raft.debris.length - 1]; const sp = __raft.toScreen(d.x, 0.3, d.z); const r = document.getElementById('cv').getBoundingClientRect(); return { x: r.left + sp.x, y: r.top + sp.y, vis: sp.vis }; });
  await p.touchscreen.tap(pos.x, pos.y);
  check('tapping debris on the sea throws the hook', !!(await p.evaluate(() => __raft.hook)), pos);
  pageOk(s); await s.close();
}

async function compat(env) {
  console.log('8. old saves');
  let s = await open(env, { seed: Object.assign({}, SEEN, { [X]: '{oops' }) }), p = s.page;
  await p.click('#voyBtn'); await waitOv(p, '#ovPanel .vitem');
  check('a broken kusoge.raft.x is ignored (only voyage 1 open) and the page works', (await p.evaluate(() => [...document.querySelectorAll('#ovPanel .vitem')].filter(b => !b.disabled).length)) === 2 && s.log.pageErrors.length === 0, s.log.pageErrors);
  await s.close();
  s = await open(env, { seed: Object.assign({}, SEEN, { [X]: JSON.stringify({ v: 1, s: [3, 2, 9, -1], c: 'v2' }) }) }); p = s.page;
  await p.click('#voyBtn'); await waitOv(p, '#ovPanel .vitem');
  const op = await p.evaluate(() => [...document.querySelectorAll('#ovPanel .vitem')].map(b => !b.disabled));
  check('odd stars are clamped: [3,2,0,0] opens voyages 1-3 only', JSON.stringify(op) === JSON.stringify([true, true, true, true, false, false, false, false, false]), op);
  await s.close();
  // a normal save from before this update (no tilesLost, no voy, no vm)
  const old = { v: 3, day: 7, time: 0.4, elapsed: 900, uid: 2, cap: { hp: 80, water: 70, food: 60, lv: 3, xp: 90 }, res: { wood: 20, plastic: 5, cloth: 2, scrap: 1, gear: 0, fish: 1, meal: 2, veg: 0, water: 6 },
    tiles: { '0,0': { i: 0, j: 0, hp: 90, f: { t: 'purifier', lv: 1, acc: 0 } }, '1,0': { i: 1, j: 0, hp: 100, f: null } }, crew: [], up: { hook: 1, spear: 1, plank: 1, arrow: 1 }, mission: 4, lane: 0, laneTo: 0, laneT: 0, allHands: false, tutOff: false,
    weather: { rain: 0, storm: 0, until: 0, next: 200, warnAt: 0, kind: '' }, raid: { state: 'none', at: 0, side: 0, warned: false }, nextShark: 70, nextCast: 45, castN: 0, isles: [], exp: null, isleN: 0,
    stats: { caught: 12, sharks: 1, rescued: 0, raidsWon: 1, raidsLost: 0, expWon: 0, lost: 0 } };
  s = await open(env, { seed: Object.assign({}, SEEN, { [SAVE]: JSON.stringify(old), [BEST]: '9' }), keepPause: true }); p = s.page;
  let x = await st(p);
  check('an old normal save loads on day 7 as a normal raft', x.day === 7 && x.mode === 'normal' && x.voy === null && x.best === 9, x);
  await dismiss(p);
  await p.evaluate(() => __raft.sim(5));
  check('and it keeps running (tilesLost starts counting from nothing)', (await p.evaluate(() => __raft.gameState)) === 'play' && (await p.evaluate(() => (__raft.S.stats.tilesLost || 0))) === 0, {});
  pageOk(s); await s.close();
}

async function english(env) {
  console.log('9. English: no Japanese left');
  const s = await open(env, { lang: 'en' }), p = s.page;
  const scan = async name => { const jp = await p.evaluate(`(${jpScan})(true)`); check(name, jp.length === 0, jp.slice(0, 5)); };
  await scan('normal screen');
  await p.click('#voyBtn'); await waitOv(p, '#ovPanel .vitem'); await scan('voyage menu');
  await p.keyboard.press('Escape');
  const E = require('../../raft/engine.js');
  for (const v of E.VOYAGES) {
    await p.evaluate(id => __raft.startVoyage(id), v.id); await waitOv(p, '#vbGo');
    const jp = await p.evaluate(`(${jpScan})(true)`); check(`briefing ${v.id}`, jp.length === 0, jp.slice(0, 5));
    await p.click('#vbGo'); await p.evaluate(() => __kb.step(2));
    const jp2 = await p.evaluate(`(${jpScan})(true)`); check(`HUD ${v.id}`, jp2.length === 0, jp2.slice(0, 5));
  }
  await p.evaluate(() => { __raft.S.day = 40; __raft.voyCheck(); }); await waitOv(p, '#vrRetry'); await scan('failed card');
  await p.click('#vrHome');
  await p.evaluate(() => __raft.startVoyage('v1')); await waitOv(p, '#vbGo'); await p.click('#vbGo');
  await p.evaluate(() => { __raft.S.stats.caught = 99; __raft.voyCheck(); }); await waitOv(p, '#vrRetry'); await scan('clear card');
  pageOk(s); await s.close();
}

async function layouts(env) {
  console.log('10. every screen size × ja/en × light/dark');
  for (const vp of (process.env.RAFT_VPS || 'se1,a360s,se2,ip12,land,xr').split(',')) for (const lang of ['ja', 'en']) {
    const scheme = lang === 'ja' ? 'dark' : 'light';
    const s = await open(env, { vp, lang, scheme }), p = s.page, tag = `${vp}/${lang}/${scheme}`;
    let r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} play screen fits (header has 5 buttons)`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 3), h: r.hscroll });
    await shot(p, `10-${vp}-${lang}-play`);
    await p.click('#voyBtn'); await waitOv(p, '#ovPanel .vitem');
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} voyage menu fits and its close button is reachable`, r.hscroll <= 1 && r.primary.every(x => x.problems.length === 0), r.primary.filter(x => x.problems.length).slice(0, 2));
    await shot(p, `10-${vp}-${lang}-menu`);
    await p.keyboard.press('Escape');
    await p.evaluate(() => { __raft.startVoyage('v8'); }); await waitOv(p, '#vbGo');
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} briefing: 出航 button reachable`, r.hscroll <= 1 && r.primary.every(x => x.problems.length === 0), r.primary.filter(x => x.problems.length).slice(0, 2));
    await p.click('#vbGo'); await p.evaluate(() => __kb.step(2));
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} voyage HUD fits`, r.hscroll <= 1 && r.offscreen.length === 0, { off: r.offscreen.slice(0, 3) });
    await shot(p, `10-${vp}-${lang}-voy`);
    await p.evaluate(() => { __raft.S.stats.caught = 0; __raft.S.day = 99; __raft.voyCheck(); }); await waitOv(p, '#vrRetry');
    r = await p.evaluate(`(${layoutProbe})()`);
    check(`${tag} result card: buttons reachable`, r.hscroll <= 1 && r.primary.every(x => x.problems.length === 0), r.primary.filter(x => x.problems.length).slice(0, 2));
    if (lang === 'en') { const jp = await p.evaluate(`(${jpScan})(true)`); check(`${tag} no Japanese`, jp.length === 0, jp.slice(0, 4)); }
    await shot(p, `10-${vp}-${lang}-result`);
    check(`${tag} no page errors`, s.log.pageErrors.length === 0, s.log.pageErrors.slice(0, 3));
    await s.close();
  }
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2] ? process.argv[2].split(',') : null;
  for (const f of [normal, keyboard, voyage, clear, starts, fail, touch, compat, english, layouts]) {
    if (only && !only.includes(f.name)) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 800)); }
  }
  await browser.close(); await srv.close();
  const failN = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - failN}  fail ${failN}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(failN ? 1 : 0);
})();
