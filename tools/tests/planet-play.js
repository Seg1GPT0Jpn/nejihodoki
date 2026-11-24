#!/usr/bin/env node
// わくせいシミュレーターの通しテスト（Playwright、?debug の window.__planet / __kb を使う）
//   node tools/tests/planet-play.js [名前]   … 全部（約4〜6分）。スクリーンショットは tools/tests/out/shots/planet-play/
// 1. はじめて：コーチ（本物の操作：ドラッグで回す → ▶ → 「山」を長おしでなぞる → 降りる → キーで歩いて光の柱 → 上空へ）
// 2. 彫刻：長おしの一筆で山脈（ops がふえ、地形が変わり、地面の高さが上がる）・海をほる・タップの道具
// 3. 地上：降りる → キー（WASD）とタッチ（スティック）で歩く・ジャンプ・地面にぴったり・星を一周（実績）・見つけて図鑑と✦
// 4. 時代：海の時代のタイトル、危機（凍りそう → 火山の提案）
// 5. お題8つ：何もしないと失敗、筋のよい手（sim.js の plan をページの道具で、dawn は歩いて図書館）で勝つ。合計点
// 6. 保存と再開（地形・見つけたもの・わたしの銀河）、共有 URL（同じ地形）、古い保存
// 7. ふしぎな星（小さな月は大きくジャンプ）、まなぶ（章 → やってみる → 3問チェック → 記録。ランキングに入らない）、なぜ？カード
// 8. 英語：日本語が見えない（タイトル・まなぶ・なぜ？・クイズ・地上・結果）／画質と fps
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'planet-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info).slice(0, 600)}`); };
const SAVE = 'kusoge.planet.save', WORLD = 'kusoge.planet.world';
const SEEN = { 'kusoge.planet.howto': '1', 'kusoge.planet.q': 'lo', [SAVE]: { v: 1, sc: {}, total: 0, stats: {}, tut: 1 } };

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || {}, isMobile: !!o.touch, hasTouch: !!o.touch });
  await s.goto('/planet/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready && __kb.ready(), null, { timeout: 30000 });
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') });
const center = p => p.evaluate(() => { const b = document.getElementById('cv').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; });
async function hold(p, key, ms) { await p.keyboard.down(key); await p.waitForTimeout(ms); await p.keyboard.up(key); }
// a point of land (or sea) facing the camera, in page pixels
async function screenPoint(p, land) {
  return p.evaluate(land => {
    const P = __planet, S = P.S, w = P.world, cv = document.getElementById('cv').getBoundingClientRect(); let best = null, bd = 1e9;
    for (let c = 0; c < S.N; c++) { const isLand = w.lf[c] > 0.9; if (isLand !== land) continue; const [lat, lon] = S.cellLL(c), xy = P.project(lat, lon); if (xy[0] < cv.left + 40 || xy[0] > cv.right - 40 || xy[1] < cv.top + 170 || xy[1] > cv.bottom - 220) continue;
      const h = P.pickAt(xy[0], xy[1]); if (!h || S.angDeg(h.lat, h.lon, lat, lon) > 4) continue; const d = Math.hypot(xy[0] - (cv.left + cv.width / 2), xy[1] - (cv.top + cv.height / 2)); if (d < bd) { bd = d; best = [xy[0], xy[1], lat, lon]; } }
    return best;
  }, land);
}
// turn the walker toward a site and walk there with real key presses
async function walkTo(p, siteId, maxMs) {
  const t0 = Date.now();
  while (Date.now() - t0 < (maxMs || 20000)) {
    const r = await p.evaluate(id => { const P = __planet, E = P.E, s = P.S.sites(P.world).find(x => x.id === id); if (!s || s.found) return { done: true };
      const q = P.S.dirOf(s.lat, s.lon), t = new E.p.constructor(q[0] - E.p.x, q[1] - E.p.y, q[2] - E.p.z); t.addScaledVector(E.p, -t.dot(E.p));
      const side = new E.p.constructor().crossVectors(E.p, E.f), ang = Math.atan2(t.dot(side), t.dot(E.f)); return { ang }; }, siteId);
    if (r.done) return true;
    if (Math.abs(r.ang) > 0.25) await hold(p, r.ang > 0 ? 'KeyA' : 'KeyD', Math.min(500, Math.abs(r.ang) / 2.4 * 1000)); else await hold(p, 'KeyW', 900);
  }
  return false;
}

async function coach(env) {
  console.log('1. first visit: the coach, with real input');
  const s = await open(env, { seed: { 'kusoge.planet.q': 'lo' } }); const p = s.page;
  let x = await st(p);
  check('a first visit drops straight into a newborn planet with a coach bubble (no text wall)', x.mode === 'free' && x.t === 0 && x.coach === 0 && x.era === 'molten' && x.overlays.length === 0, [x.mode, x.coach, x.overlays]);
  await shot(p, 'coach-molten');
  const c = await center(p);
  await p.mouse.move(c[0] - 90, c[1]); await p.mouse.down(); await p.mouse.move(c[0] + 90, c[1] + 20, { steps: 10 }); await p.mouse.up();
  x = await st(p); check('dragging turns the globe (step 2)', x.coach === 1, x.coach);
  await p.click('#playBtn'); await p.waitForTimeout(600); await p.click('#playBtn');
  x = await st(p); check('▶ runs time', x.t > 1e6, x.t);
  await p.evaluate(() => __planet.run(1.2e8, { quiet: true, coarse: 5e4 }));
  x = await st(p); check('an ocean forms; the coach moves on to the mountain tool', x.ms.ocean != null && x.coach === 2 && x.tool === 'raise', [x.ms, x.coach, x.tool]);
  check('a new era is announced with a title card', !!x.eraCard && /海/.test(x.eraCard), x.eraCard);
  await shot(p, 'era-ocean');
  const pt = await screenPoint(p, true) || await screenPoint(p, false);
  const ops0 = x.ops, geo0 = x.geoV;
  await p.mouse.move(pt[0], pt[1]); await p.mouse.down(); await p.waitForTimeout(800);
  for (let k = 1; k <= 8; k++) { await p.mouse.move(pt[0] + k * 6, pt[1] - k * 3); await p.waitForTimeout(120); }
  await p.mouse.up();
  x = await st(p);
  check('hold and stroke with the Mountain tool: a range is sculpted (one stroke, many dabs)', x.ops > ops0 && x.geoV > geo0 && x.coach === 3, { ops: [ops0, x.ops], coach: x.coach });
  await shot(p, 'sculpt');
  await p.click('#diveBtn'); await p.waitForFunction(() => __kb.state().view === 'surface', null, { timeout: 15000 });
  x = await st(p); check('“Dive” flies down to the surface; the walker stands on the ground', x.view === 'surface' && x.coach === 4 && Math.abs(x.explorer.r - x.explorer.ground) < 0.003, x.explorer);
  const target = await p.evaluate(() => { const P = __planet, [a, o] = P.E.latLon(); const s = P.S.sites(P.world).filter(q => !q.found).sort((q, r) => P.S.angDeg(a, o, q.lat, q.lon) - P.S.angDeg(a, o, r.lat, r.lon))[0]; return s && s.id; });
  const got = await walkTo(p, target, 40000);
  x = await st(p);
  check('walking with WASD reaches the pillar of light: a discovery, ✦ and the log', got && x.found.includes(target) && x.save.stats.spark > 0 && x.save.dex.length > 0 && x.coach === 5, { got, target, found: x.found, coach: x.coach });
  await p.waitForTimeout(300); await shot(p, 'discovery');
  await p.click('#upBtn'); await p.waitForFunction(() => __kb.state().view === 'orbit', null, { timeout: 15000 });
  x = await st(p); check('“Up” flies back to orbit and the coach is done and remembered', x.view === 'orbit' && x.coach === null && x.save.tut === 1, [x.view, x.coach]);
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
}

async function sculptAndWalk(env) {
  console.log('2–3. sculpting, digging, walking with keys and touch, jumping, round the planet');
  const s = await open(env, { seed: SEEN, touch: true }); const p = s.page;
  await p.evaluate(() => { __planet.earthNow(); __planet.faceTo(10, 30); });
  let x = await st(p);
  const g0 = await p.evaluate(() => { const d = __planet.S.dirOf(10, 30); return __planet.W.groundAt(...d); });
  await p.evaluate(() => { __planet.pick('raise'); for (let k = 0; k < 10; k++) __planet.tool('raise', 10, 30, { cont: k > 0 }); });
  const g1 = await p.evaluate(() => { const d = __planet.S.dirOf(10, 30); return __planet.W.groundAt(...d); });
  check('raising lifts the drawn ground (what you walk on)', g1 > g0 + 0.01, [g0, g1]);
  await p.evaluate(() => { __planet.pick('raise'); __planet.pick('sink'); for (let k = 0; k < 12; k++) __planet.tool('sink', -20, 60, { cont: k > 0 }); });
  const lf = await p.evaluate(() => __planet.world.lf[__planet.S.cellOf(-20, 60)]);
  check('digging makes sea', lf < 0.5, lf);
  await p.evaluate(() => __planet.dive(10, 30)); await p.waitForFunction(() => __kb.state().view === 'surface', null, { timeout: 15000 });
  const a = await st(p);
  await hold(p, 'KeyW', 2500);
  let b = await st(p);
  check('W walks forward over the sphere', b.explorer.walked > a.explorer.walked + 0.02 && Math.abs(b.explorer.r - b.explorer.ground) < 0.004 || b.explorer.swim, [a.explorer, b.explorer]);
  await p.keyboard.down('Space'); await p.waitForTimeout(150);
  x = await st(p); await p.keyboard.up('Space');
  check('Space jumps', x.explorer.jumped >= 1 && x.explorer.alt > 0, x.explorer);
  await p.waitForTimeout(1200);
  // touch: drag the stick up with real touch events
  const zone = await p.evaluate(() => { const r = document.getElementById('stickZone').getBoundingClientRect(); return [r.left + r.width * 0.5, r.top + r.height * 0.6]; });
  const cdp = await p.context().newCDPSession(p);
  const w0 = (await st(p)).explorer.walked;
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchStart', touchPoints: [{ x: zone[0], y: zone[1] }] });
  for (let k = 1; k <= 6; k++) { await cdp.send('Input.dispatchTouchEvent', { type: 'touchMove', touchPoints: [{ x: zone[0], y: zone[1] - k * 9 }] }); await p.waitForTimeout(30); }
  await p.waitForTimeout(2200);
  await cdp.send('Input.dispatchTouchEvent', { type: 'touchEnd', touchPoints: [] });
  x = await st(p); check('touch: the virtual stick walks', x.explorer.walked > w0 + 0.02, [w0, x.explorer.walked]);
  const jb = await p.evaluate(() => { const r = document.getElementById('jumpBtn').getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; });
  const j0 = x.explorer.jumped; await p.touchscreen.tap(jb[0], jb[1]); await p.waitForTimeout(200);
  x = await st(p); check('touch: the jump button jumps', x.explorer.jumped > j0, [j0, x.explorer.jumped]);
  await shot(p, 'surface-walk');
  // all the way round: most of the loop is skipped, the last part is walked for real
  await p.evaluate(() => { __planet.E.walked = 2 * Math.PI - 0.06; });
  await hold(p, 'KeyW', 2500); await p.waitForTimeout(400);
  x = await st(p); check('walking all the way round the planet is noticed (achievement record)', x.save.stats.walk >= 1, x.save.stats);
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
}

async function scenarios(env) {
  console.log('5. challenges: lose by doing nothing, win with a sensible plan (through the page)');
  const s = await open(env, { seed: SEEN }); const p = s.page;
  const ids = await p.evaluate(() => __planet.scenarios());
  check('8 challenges with the saved ids', ids.join() === 'cradle,snow,green,gate,goe,sun,warm,dawn', ids);
  const locked = await p.$$eval('#tList .scard', b => b.map(e => e.classList.contains('locked')));
  check('a new player can open the first two only', locked.join() === 'false,false,true,true,true,true,true,true', locked);
  for (let i = 0; i < ids.length; i++) {
    const r = await p.evaluate(i => { const P = __planet; P.scenario(i); P.begin(); const lim = P.sc.def.limit; for (let k = 0; k < 20 && !P.sc.ended; k++) P.run(lim / 20, { quiet: true, chunk: P.sc.def.civ ? 25 : lim / 20 }); if (!P.sc.ended) P.run(lim, { quiet: true }); const x = __kb.state(); return { ended: x.sc.ended, win: x.sc.win, ov: x.overlays, title: document.getElementById('rTitle').textContent }; }, i);
    check(`${ids[i]}: doing nothing fails`, r.ended && !r.win && r.ov.includes('ovResult') && /失敗/.test(r.title), r);
    const w = await p.evaluate(i => { const P = __planet; P.scenario(i); P.begin(); const lim = P.sc.def.limit; for (let k = 0; k < 20 && !P.sc.ended; k++) { P.strat(k); P.run(lim / 20, { quiet: true, chunk: P.sc.def.civ ? 25 : lim / 20 }); } if (!P.sc.ended) P.run(lim, { quiet: true }); const x = __kb.state(); return { ended: x.sc.ended, win: x.sc.win, score: x.sc.score, best: x.save.sc[x.sc.id] && x.save.sc[x.sc.id].best, title: document.getElementById('rTitle').textContent }; }, i);
    check(`${ids[i]}: the plan wins (${w.score})`, w.ended && w.win && /クリア/.test(w.title) && w.best >= 600, w);
    if (i === 0) await shot(p, 'result');
  }
  const x = await st(p), sum = Object.values(x.save.sc).reduce((a, v) => a + v.best, 0);
  check('the total is the sum of the bests (the ranking value, ≤ 8000)', x.save.total === sum && sum > 4800 && sum <= 8000, [x.save.total, sum]);
  check('KoboPlatform.rankValue reads the total', await p.evaluate(() => KoboPlatform.rankValue('planet')) === x.save.total);
  // the 3-question check after a challenge: optional, does not change the total
  await p.click('#rQuiz'); for (let q = 0; q < 3; q++) { await p.click('#qzA button >> nth=0'); await p.click('#qzNext'); }
  const y = await st(p); check('the 3-question check after a challenge runs and leaves the total alone', y.overlays.includes('ovResult') && y.save.total === x.save.total, [y.overlays, y.save.total]);
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
}

async function snowAndDawnByHand(env) {
  console.log('5b. the snowball by real taps (a great eruption and a comet), the dawn by walking to the libraries');
  const s = await open(env, { seed: SEEN }); const p = s.page;
  await p.evaluate(() => { __planet.scenario(1); __planet.begin(); });
  await p.waitForTimeout(500);
  let x = await st(p); check('a frozen planet: the danger card suggests volcanoes', x.dangerShown && /火山/.test(await p.textContent('#dgGo')), x.danger);
  await shot(p, 'crisis-snowball');
  await p.click('#dgGo');
  const pt = await screenPoint(p, false) || await screenPoint(p, true);
  for (let k = 0; k < 3; k++) await p.mouse.click(pt[0] + k * 3, pt[1]);
  await p.click('.tool[data-k="asteroid"]'); const pt2 = await screenPoint(p, false); await p.mouse.click(pt2[0] - 60, pt2[1] + 40);
  x = await st(p); check('four taps: a great eruption and a comet on the ice', x.sc.actions === 4 && x.combos.includes('super'), [x.sc, x.combos]);
  await p.evaluate(() => __planet.run(2e6, { quiet: true, chunk: 1e5 }));
  x = await st(p); check('…and the snowball thaws: cleared', x.sc.ended && x.sc.win, x.sc);
  await p.evaluate(() => { __planet.closeAll(); __planet.scenario(7); __planet.begin(); });
  const libs = await p.evaluate(() => __planet.S.sites(__planet.world).filter(q => q.k === 'lib').map(q => q.id));
  await p.evaluate(() => __planet.dive()); await p.waitForFunction(() => __kb.state().view === 'surface', null, { timeout: 15000 });
  for (const id of libs) { await p.evaluate(id => { const s = __planet.S.sites(__planet.world).find(q => q.id === id); __planet.teleport(s.lat - 9, s.lon); }, id); await walkTo(p, id, 30000); }
  x = await st(p); check('walking to the three ancient libraries', libs.length === 3 && libs.every(id => x.found.includes(id)), [libs, x.found]);
  await shot(p, 'dawn-library');
  await p.evaluate(() => __planet.run(200, { quiet: true, chunk: 25 }));
  x = await st(p); check('…lifts the civilization into space: cleared', x.sc.ended && x.sc.win, x.sc);
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
}

async function saveShare(env) {
  console.log('6. save and resume, the galaxy, sharing, old saves');
  const s = await open(env, { seed: SEEN }); const p = s.page;
  await p.click('#tNew'); await p.fill('#dzName', 'テスト星'); await p.click('#dzGo');
  await p.evaluate(() => { __planet.run(1.3e8, { quiet: true, coarse: 5e4 }); for (let k = 0; k < 6; k++) __planet.tool('raise', 15, 40 + k * 2, { cont: k > 0 }); __planet.tool('seed', 0, 0); __planet.tool('volcano', 5, 30); __planet.run(2e6, { quiet: true }); });
  const site = await p.evaluate(() => { const s = __planet.S.sites(__planet.world).find(q => !q.found); __planet.S.discover(__planet.world, s.id); return s.id; });
  await p.evaluate(() => __planet.saveWorld());
  const a = await st(p);
  const url = await p.evaluate(() => __planet.shareUrl());
  check('the share URL carries the recipe with the sculpting', /\?p=[A-Za-z0-9_-]+$/.test(url) && (await p.evaluate(u => __planet.readCode(u.split('?p=')[1]).ops.length, url)) === a.ops, url.length);
  await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  let x = await st(p);
  check('after reload: the title offers to continue the named planet', x.mode === 'title' && /テスト星/.test(await p.textContent('#tContinue')), x.overlays);
  await p.click('#tContinue'); x = await st(p);
  check('continue restores the same planet (time, sculpting, finds)', x.mode === 'free' && Math.abs(x.t - a.t) < 1 && x.ops === a.ops && x.found.includes(site), { t: [a.t, x.t], ops: [a.ops, x.ops] });
  await p.evaluate(() => __planet.title()); await p.click('#tNew'); await p.click('#dzGo');
  await p.evaluate(() => __planet.title());
  const shelf = await p.$$eval('#tShelf .pc', l => l.length);
  check('a second planet: the first one waits in “my galaxy”', shelf >= 1, shelf);
  await p.click('#tShelf .pc'); x = await st(p); check('…and can be picked up again', x.mode === 'free' && x.name === 'テスト星', x.name);
  const raw = await p.evaluate(k => localStorage.getItem(k).length, WORLD);
  check('the saved galaxy is small enough to sync (< 150 KB)', raw < 150000, raw);
  const s2 = await open(env, { seed: SEEN, query: '&' + url.split('?')[1] }); const p2 = s2.page;
  let y = await st(p2);
  check('opening the URL shows the shared design with its name', y.overlays.includes('ovDesign') && await p2.isVisible('#dzShared') && await p2.inputValue('#dzName') === 'テスト星', y.overlays);
  await p2.click('#dzGo'); y = await st(p2);
  const same = await p2.evaluate(ops => __planet.world.ops.length === ops, a.ops);
  check('…and the new planet is born with the same sculpted land', y.mode === 'free' && same, [y.ops, a.ops]);
  await shot(p2, 'shared');
  await s2.close();
  // an old ?p= link (before sculpting) still opens
  const old = Buffer.from(JSON.stringify({ v: 1, n: 'Old', d: 1, s: 1, w: 1, seed: 1234 })).toString('base64').replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  const s3 = await open(env, { seed: SEEN, query: '&p=' + old }); y = await st(s3.page);
  check('an old share link still opens the designer', y.overlays.includes('ovDesign') && await s3.page.inputValue('#dzName') === 'Old', y.overlays);
  await s3.close();
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
  // a save from before the redesign
  const legacy = { 'kusoge.planet.howto': '1', 'kusoge.planet.q': 'lo', [SAVE]: { v: 1, sc: { green: { best: 812, stars: 2 }, snow: { best: 905, stars: 3 } }, total: 1717, stats: { life: 1, goe: 1, worlds: 2, clears: 2, maxMyr: 2400 }, tut: 1 },
    [WORLD]: { v: 1, t: 2400000000, p: { dist: 1, size: 1, water: 1, n2: 0.78, co2: 300000, seed: 4242 }, A: 25000, O: 150000, ch4: 300, o2: 0.004, wl: 1, lost: 0, life: { st: 2, prog: 0.2, pre: 1, div: 6, nudge: null, euk: 0, seedT: -1 }, civ: null, ev: [{ t: 600000000, k: 'life' }], flags: { goe: 1 }, hist: { r: [], l: [] }, spd: 6 } };
  const s4 = await open(env, { seed: legacy }); const p4 = s4.page;
  x = await st(p4); check('old records keep their total', x.save.total === 1717 && /1,?717/.test(await p4.textContent('#tTotal')), x.save.total);
  await p4.click('#tContinue'); x = await st(p4);
  check('the old planet continues', x.mode === 'free' && x.stage === 2 && x.t === 2.4e9, [x.mode, x.stage]);
  await p4.evaluate(() => __planet.run(5e7, { quiet: true })); x = await st(p4); check('…and keeps running', x.t > 2.4e9);
  check('no page errors (old save)', !s4.log.pageErrors.length, s4.log.pageErrors);
  await s4.close();
}

async function wondersLearn(env) {
  console.log('7. wonder planets, learn mode, why cards');
  const s = await open(env, { seed: SEEN }); const p = s.page;
  for (const id of ['ring', 'ice', 'lava', 'moon', 'bloom']) { await p.click(`#tWonders .pc[data-w="${id}"]`); await p.waitForTimeout(300); await shot(p, 'wonder-' + id); await p.evaluate(() => __planet.title()); }
  let x = await st(p); check('all five wonder planets can be visited (and are remembered)', x.save.stats.wonders === 5, x.save.stats);
  const jump = async id => { await p.evaluate(id => { __planet.wonder(id); __planet.dive(); }, id); await p.waitForFunction(() => __kb.state().view === 'surface', null, { timeout: 15000 }); await p.waitForTimeout(300); await p.keyboard.down('Space'); let m = 0; for (let k = 0; k < 14; k++) { await p.waitForTimeout(80); const e = (await st(p)).explorer; m = Math.max(m, e.alt / (e.r)); } await p.keyboard.up('Space'); return m; };
  const hMoon = await jump('moon'); await shot(p, 'moon-jump'); const hEarth = await jump('ring');
  check('the tiny moon: jumps go much higher', hMoon > hEarth * 2, [hMoon, hEarth]);
  await p.evaluate(() => __planet.title('learn'));
  const chap = await p.$$eval('#lList .chap', l => l.length); check('learn mode lists 7 chapters', chap === 7, chap);
  await p.click('#lList .chap >> nth=0'); x = await st(p); check('a chapter opens with an explanation', x.overlays.includes('ovLesson') && /46億年/.test(await p.textContent('#lsText')), x.overlays);
  await p.click('#lsGo'); await p.evaluate(() => __planet.run(1.2e8, { quiet: true, coarse: 5e4 })); await p.waitForTimeout(1500);
  x = await st(p); check('trying it on the globe: the ocean forms and the result shows', x.overlays.includes('ovLesson') && x.lesson && x.lesson.phase === 'done', [x.overlays, x.lesson]);
  await shot(p, 'learn-result');
  await p.click('#lsGo'); x = await st(p); check('the 3-question check opens', x.overlays.includes('ovQuiz') && (await p.$$('#qzA button')).length === 3);
  await shot(p, 'quiz');
  for (let q = 0; q < 3; q++) { const right = await p.evaluate(() => { const Q = __planet.L.Q, id = __planet.L.CHAPTERS[0].quiz[__kb.state().quiz.i]; return Q[id].ok; }); await p.click(`#qzA button[data-a="${right}"]`); await p.click('#qzNext'); }
  x = await st(p); check('the chapter is recorded as done (and the ranking total is untouched)', x.save.learn.includes('birth') && x.save.total === 0 && x.mode === 'title', [x.save.learn, x.save.total]);
  // the real Earth: step through 4.6 billion years
  await p.click('#lList .chap >> nth=6'); await p.click('#lsGo'); await shot(p, 'history-0');
  for (let k = 0; k < 11; k++) { await p.click('#hsNext'); if (k === 8) await shot(p, 'history-kpg'); }
  await p.waitForTimeout(1200); x = await st(p); check('“the real Earth” replays 4.6 billion years to today', x.overlays.includes('ovLesson') && x.lesson.phase === 'done', x.lesson);
  await p.evaluate(() => { __planet.closeAll(); __planet.why('snow'); }); x = await st(p);
  check('a “why?” card explains with a curriculum link', x.overlays.includes('ovWhy') && /アルベド/.test(await p.textContent('#whyText')) && /理科/.test(await p.textContent('#whyTopic')), x.overlays);
  await shot(p, 'why');
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
}

async function english(env) {
  console.log('8. English, graphics and fps');
  const s = await open(env, { lang: 'en', seed: { 'kusoge.planet.howto': '1', [SAVE]: SEEN[SAVE] } }); const p = s.page;
  const scan = async label => { const jp = await p.evaluate(`(${jpScan})(true)`); check('en: no Japanese visible — ' + label, jp.length === 0, jp); };
  await scan('title (play)'); await p.click('#tModeLearn'); await scan('title (learn)');
  await p.click('#lList .chap >> nth=2'); await scan('chapter'); await p.click('#lsGo'); await scan('lesson on the globe');
  await p.evaluate(() => __planet.why('impact')); await scan('why card'); await p.evaluate(() => __planet.closeAll());
  await p.evaluate(() => __planet.quiz(['tilt', 'day', 'moon'])); await scan('quiz'); await p.click('#qzA button >> nth=1'); await scan('quiz answered'); await p.evaluate(() => __planet.closeAll());
  await p.evaluate(() => { __planet.earthNow(); __planet.info(); }); await scan('details'); await p.evaluate(() => __planet.closeAll());
  await p.evaluate(() => __planet.dex()); await scan('discovery log'); await p.evaluate(() => __planet.closeAll());
  await p.evaluate(() => __planet.dive()); await p.waitForFunction(() => __kb.state().view === 'surface', null, { timeout: 15000 }); await p.waitForTimeout(700); await scan('surface with a hint');
  await shot(p, 'en-surface');
  await p.evaluate(() => { __planet.ascend(); __planet.scenario(0); }); await scan('challenge intro');
  await p.evaluate(() => { __planet.begin(); __planet.run(4e7, { quiet: true }); }); await scan('challenge result');
  // graphics: high quality by default, light mode by itself when it is slow
  await p.evaluate(() => { __planet.closeAll(); __planet.earthNow(); __planet.play(); });
  await p.waitForTimeout(9000);
  let q = (await st(p)).quality;
  console.log('      orbit, auto quality (swiftshader):', JSON.stringify(q));
  await p.evaluate(() => { __planet.pause(); __planet.dive(); }); await p.waitForFunction(() => __kb.state().view === 'surface', null, { timeout: 15000 });
  await p.keyboard.down('KeyW'); await p.waitForTimeout(6000); await p.keyboard.up('KeyW');
  const q2 = (await st(p)).quality; console.log('      surface walking:', JSON.stringify(q2));
  check('it renders smoothly enough under software GL (falls back to light mode when slow)', (q.q === 'lo' || q.fps >= 24) && q2.fps >= 20, [q, q2]);
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  B.ensureCdn();
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now(), only = process.argv[2];
  for (const f of [coach, sculptAndWalk, scenarios, snowAndDawnByHand, saveShare, wondersLearn, english]) {
    if (only && f.name !== only) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 600)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
