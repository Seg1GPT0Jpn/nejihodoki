#!/usr/bin/env node
// わくせいシミュレーターの通しテスト（Playwright、?debug の window.__planet / __kb を使う）
//   node tools/tests/planet-play.js          … 全部（約3〜4分）。スクリーンショットは tools/tests/out/shots/planet-play/
// 1. 初回：遊び方 → チュートリアル（本物の操作：地球儀のドラッグ、▶、道具「火山」で地球儀をタップ、海ができたら「いのち」で海をタップ）
// 2. 気候の物理：CO₂が多いほど暖かい／遠いほど寒い／全球凍結の始まりと、火山のCO₂での脱出（ヒステリシス）／近すぎると暴走温室で海が干上がる／
//    岩の風化がCO₂を元に戻す（サーモスタット）／明るくなる太陽でCO₂が下がる
// 3. シナリオ8本：何もしないと失敗、筋のよい手（sim.js の plan をページの道具で）で勝つ。本物のタップだけで「生命のゆりかご」に勝つ回も1本。
//    ベスト・星・合計点の保存、まだ開いていないシナリオは押せない
// 4. 危険の知らせ（凍りそう → 「火山で暖める」）と、自由モードの危機のカード
// 5. 自由モード：星のデザイン（名前・ひな形）→ 海と生命の節目のお祝い・コンボ図鑑 → 共有URLで同じ星 → 再読み込みで続きから → 古い保存 → 宇宙時代のエンディング
// 6. 英語：タイトル・各タブ・デザイン・共有・図鑑・シナリオ・結果・危機・エンディングで、日本語が見えない
'use strict';
const fs = require('fs');
const path = require('path');
const server = require('./lib/server');
const B = require('./lib/browser');
const V = require('./lib/viewports');
const { jpScan } = require('./lib/layout');

const OUT = path.join(__dirname, 'out', 'shots', 'planet-play');
const results = [];
const check = (name, cond, info) => { results.push({ name, ok: !!cond }); console.log(`  ${cond ? 'ok  ' : 'FAIL'} ${name}${cond ? '' : '  ' + JSON.stringify(info)}`); };
const SAVE = 'kusoge.planet.save', WORLD = 'kusoge.planet.world';
const SEEN = { 'kusoge.planet.howto': '1', [SAVE]: { v: 1, sc: {}, total: 0, stats: {}, tut: 1 } };

async function open(env, o = {}) {
  const s = await B.newSession(env, { vp: V.get(o.vp || 'ip12'), lang: o.lang || 'ja', seed: o.seed || {}, isMobile: false, hasTouch: false });
  await s.goto('/planet/?debug' + (o.query || ''));
  await s.page.waitForFunction(() => window.__kb && __kb.ready && __kb.ready());
  return s;
}
const st = p => p.evaluate(() => __kb.state());
const shot = (p, name) => p.screenshot({ path: path.join(OUT, name + '.png') });
async function canvasCenter(p) { return p.evaluate(() => { const b = document.getElementById('cv').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }); }
// a point of open sea that faces the camera (optionally near lat/lon), in page pixels
async function seaPoint(p, near) {
  return p.evaluate(near => {
    const P = __planet, S = P.S, w = P.world, cv = document.getElementById('cv').getBoundingClientRect();
    let best = null, bd = 1e9;
    for (let c = 0; c < S.N; c++) {
      if (w.lf[c] > 0.05 || !S.habitable(w, c)) continue;
      const [lat, lon] = S.cellLL(c), xy = P.project(lat, lon);
      if (xy[2] > 0.995 || xy[0] < cv.left + 30 || xy[0] > cv.right - 30 || xy[1] < cv.top + 140 || xy[1] > cv.bottom - 90) continue;
      const hit = P.pick(xy[0], xy[1]); if (!hit || w.lf[S.cellOf(hit.lat, hit.lon)] > 0.05) continue;
      const d = near ? S.angDeg(lat, lon, near[0], near[1]) : Math.hypot(xy[0] - (cv.left + cv.width / 2), xy[1] - (cv.top + cv.height / 2));
      if (d < bd) { bd = d; best = [xy[0], xy[1], lat, lon]; }
    }
    return best;
  }, near || null);
}

async function tutorial(env) {
  console.log('1. first visit: how to play → tutorial with real input');
  const s = await open(env); const p = s.page;
  let x = await st(p);
  check('first visit shows how to play', x.overlays.includes('howto'), x.overlays);
  await p.click('#howtoGo');
  x = await st(p);
  check('a new planet starts at its birth with the tutorial', x.mode === 'free' && x.tutorial === 0 && x.t === 0 && x.overlays.length === 0 && !!x.name, x);
  const c = await canvasCenter(p);
  await p.mouse.move(c[0] - 80, c[1]); await p.mouse.down(); await p.mouse.move(c[0] + 80, c[1] + 20, { steps: 12 }); await p.mouse.up();
  x = await st(p); check('dragging the globe turns it (step 2)', x.tutorial === 1, x.tutorial);
  await p.click('#playBtn'); await p.waitForTimeout(700);
  x = await st(p); check('▶ runs time at 10 million years a second', x.running && x.t > 2e6 && x.speedYps === 1e7 && x.tutorial === 2, { t: x.t, sp: x.speedYps, tut: x.tutorial });
  await p.click('#playBtn');
  check('step 3 opens the tools', x.tab === 'tools', x.tab);
  await p.click('.tl[data-k="volcano"]');
  const c2 = await canvasCenter(p); await p.mouse.click(c2[0], c2[1]);
  x = await st(p); check('Volcano → tap the globe erupts, with effects on the globe (step 3)', x.events.includes('volcano') && x.tutorial === 3 && x.fx > 0, { ev: x.events, tut: x.tutorial, fx: x.fx });
  await p.waitForTimeout(400); await shot(p, 'tutorial-volcano');
  await p.evaluate(() => __planet.run(1.3e8, { quiet: true }));
  x = await st(p); check('an ocean forms and the journey celebrates it', x.ms.ocean != null && x.water > 0.5, x.ms);
  await p.click('.tl[data-k="seed"]');
  const sp = await seaPoint(p);
  if (sp) await p.mouse.click(sp[0], sp[1]);
  x = await st(p);
  check('Life → tap the sea starts life there (step 4)', x.stage === 1 && x.reachOn && x.tutorial === 4, { st: x.stage, tut: x.tutorial, sp });
  await p.waitForTimeout(300);
  x = await st(p); check('a celebration shows on the globe', !!x.celeb, x.celeb);
  await shot(p, 'tutorial-life');
  await p.click('#tutNext');
  x = await st(p); check('the tutorial finishes and is remembered; the journey takes over', x.tutorial === null && x.save.tut === 1 && !!x.journey, x);
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
}

async function physics(env) {
  console.log('2. climate physics (energy balance + carbon cycle)');
  const s = await open(env, { seed: SEEN }); const p = s.page;
  const r = await p.evaluate(() => {
    const S = __planet.S, out = {};
    const earth = (o) => { o = o || {}; const w = S.create({ t: o.t || 4.57e9, p: Object.assign({ seed: 7, co2: 280 }, o.p || {}) }); w.noCiv = true; w.wl = 1; S.seaLevel(w); w.life.st = 6; w.life.euk = 1; w.o2 = 1; w.life.div = 70; S.settle(w, 2e5, o.co2 || 280); return w; };
    const eqT = (w, co2, yrs) => { S.settle(w, yrs || 1e5, co2); return w.d.Tg; };
    const w = earth(); out.t280 = w.d.Tg; out.ice280 = w.d.ice; out.t560 = eqT(w, 560); out.t1120 = eqT(w, 1120); out.t140 = eqT(w, 140);
    const a = earth({ p: { dist: 1.03 } }), b = earth({ p: { dist: 0.97 } }); out.tFar = a.d.Tg; out.tNear = b.d.Tg;
    const sb = earth({ t: 4.0e9 }); S.setParam(sb, 'co2', 900); S.advance(sb, 2e5); out.preT = sb.d.Tg;
    S.setParam(sb, 'dist', 1.12); S.advance(sb, 6e4); out.snowOn = !!sb.flags.snow; out.snowIce = sb.d.ice;
    S.setParam(sb, 'dist', 1.0); S.advance(sb, 5e4); out.stillFrozen = !!sb.flags.snow && sb.d.ice > 0.8; out.co2a = sb.A; out.W = sb.d.Wl; out.V = sb.d.V;
    for (let k = 0; k < 4; k++) S.tools.volcano(sb, 0, k * 90);
    let yrs = 0; while (sb.flags.snow && yrs < 2e7) { S.advance(sb, 1e5); yrs += 1e5; }
    out.thawYrs = yrs; out.thawed = !sb.flags.snow; out.co2b = sb.A; out.thawEv = sb.ev.some(e => e.k === 'thaw');
    const sn = earth({ t: 4.0e9 }); S.setParam(sn, 'co2', 900); S.advance(sn, 2e5); S.setParam(sn, 'dist', 1.12); S.advance(sn, 6e4); S.setParam(sn, 'dist', 1.0);
    yrs = 0; while (sn.flags.snow && yrs < 3e7) { S.advance(sn, 2.5e5); yrs += 2.5e5; } out.thawNatural = yrs; out.thawedNatural = !sn.flags.snow;
    const rg = earth(); S.setParam(rg, 'dist', 0.86); S.advance(rg, 1e5); out.rgT = rg.d.Tg; out.rgBoil = rg.ev.some(e => e.k === 'boil');
    S.advance(rg, 3e8, { coarse: 5e4 }); out.rgWater = rg.wl; out.rgDry = rg.ev.some(e => e.k === 'dry'); out.rgDead = !!rg.flags.dead || rg.life.st === 0;
    const th = earth(); S.advance(th, 1e6); out.base = th.A; S.setParam(th, 'co2', 2000); S.advance(th, 1e3); out.spikeT = th.d.Tg; S.advance(th, 1e6); out.afterSpike = th.A; out.afterSpikeT = th.d.Tg;
    S.setParam(th, 'co2', 100); S.advance(th, 1e6); out.afterDrop = th.A;
    const br = earth(); S.advance(br, 1e6); out.co2Now = br.A; S.advance(br, 8e8, { coarse: 5e4 }); out.co2Later = br.A; out.lumLater = S.lum(br.t);
    return out;
  });
  check('present-day Earth: about 15 °C with ice caps', r.t280 > 11 && r.t280 < 19 && r.ice280 > 0.05 && r.ice280 < 0.25, [r.t280, r.ice280]);
  check('more CO2 → warmer (140 < 280 < 560 < 1120 ppm)', r.t140 < r.t280 && r.t280 < r.t560 && r.t560 < r.t1120, [r.t140, r.t280, r.t560, r.t1120]);
  check('CO2 doubling warms 2–6 °C (sensitivity incl. ice-albedo feedback)', r.t560 - r.t280 > 2 && r.t560 - r.t280 < 6, r.t560 - r.t280);
  check('farther from the star → colder, closer → warmer', r.tFar < r.t280 && r.tNear > r.t280, [r.tFar, r.t280, r.tNear]);
  check('dimming the star sets off a snowball (ice-albedo runaway)', r.snowOn && r.snowIce > 0.9, [r.snowOn, r.snowIce]);
  check('hysteresis: back at 1 AU the planet stays frozen', r.stillFrozen, r.stillFrozen);
  check('in a snowball weathering stops while volcanoes keep going', r.W < r.V * 0.4, [r.W, r.V]);
  check('volcanic CO2 builds up and the snowball thaws', r.thawed && r.thawEv && r.co2b > r.co2a, [r.thawed, r.co2a, r.co2b, r.thawYrs]);
  check('without help it also thaws, but later', r.thawedNatural && r.thawNatural > r.thawYrs, [r.thawNatural, r.thawYrs]);
  check('too close → runaway greenhouse (oceans boil)', r.rgBoil && r.rgT > 65, [r.rgBoil, r.rgT]);
  check('the oceans escape and life ends', r.rgDry && r.rgWater < 0.05 && r.rgDead, [r.rgDry, r.rgWater, r.rgDead]);
  check('weathering draws a CO2 spike back down (thermostat)', r.spikeT > r.t280 + 3 && r.afterSpike < r.base * 1.6, [r.base, r.afterSpike, r.spikeT]);
  check('and refills CO2 after a drop', r.afterDrop > 160, r.afterDrop);
  check('brightening star: the thermostat lowers CO2', r.co2Later < r.co2Now * 0.6 && r.lumLater > 1.05, [r.co2Now, r.co2Later]);
  await s.close();
}

async function scenarios(env) {
  console.log('3. scenarios: lose by doing nothing, win with a sensible plan (through the page)');
  const s = await open(env, { seed: SEEN }); const p = s.page;
  const ids = await p.evaluate(() => __planet.scenarios());
  check('8 scenarios', ids.length === 8, ids);
  let x = await st(p);
  const locked = await p.$$eval('#tList .scard', b => b.map(e => e.classList.contains('locked')));
  check('a new player can open the first two scenarios only', locked.join() === 'false,false,true,true,true,true,true,true', locked);
  await p.click('#tList .scard:nth-child(5)');
  x = await st(p); check('a locked scenario does not start', x.mode === 'title' && x.overlays.includes('ovTitle'), x.mode);
  for (let i = 0; i < ids.length; i++) {
    const r = await p.evaluate(async i => {
      const P = __planet; P.scenario(i); P.begin();
      const lim = P.sc.def.limit;
      for (let k = 0; k < 20 && !P.sc.ended; k++) P.run(lim / 20, { quiet: true, chunk: P.sc.def.civ ? 25 : lim / 20 });
      if (!P.sc.ended) P.run(lim, { quiet: true });
      const x = __kb.state();
      return { ended: x.sc.ended, overlays: x.overlays, best: x.save.sc[x.sc.id] ? x.save.sc[x.sc.id].best : 0, title: document.getElementById('rTitle').textContent, why: document.getElementById('rWhy').textContent };
    }, i);
    check(`${ids[i]}: doing nothing fails`, r.ended && r.overlays.includes('ovResult') && r.best === 0 && /失敗/.test(r.title), r);
    const w = await p.evaluate(async i => {
      const P = __planet; P.scenario(i); P.begin();
      const lim = P.sc.def.limit;
      for (let k = 0; k < 20 && !P.sc.ended; k++) { P.strat(k); P.run(lim / 20, { quiet: true, chunk: P.sc.def.civ ? 25 : lim / 20 }); }
      if (!P.sc.ended) P.run(lim, { quiet: true });
      const x = __kb.state();
      return { ended: x.sc.ended, best: x.save.sc[x.sc.id] ? x.save.sc[x.sc.id].best : 0, stars: x.save.sc[x.sc.id] ? x.save.sc[x.sc.id].stars : 0, total: x.save.total, title: document.getElementById('rTitle').textContent, used: x.sc.used, actions: x.sc.actions };
    }, i);
    check(`${ids[i]}: the plan wins (score ${w.best}, ${w.stars}★, ${w.actions} tools)`, w.ended && /クリア/.test(w.title) && w.best >= 600 && w.best <= 1000 && w.stars >= 1, w);
    if (i === 0) await shot(p, 'result');
  }
  x = await st(p);
  const sum = Object.values(x.save.sc).reduce((a, v) => a + v.best, 0);
  check('the scenario total is the sum of the bests (ranking value)', x.save.total === sum && sum > 4800 && sum <= 8000, [x.save.total, sum]);
  const rank = await p.evaluate(() => KoboPlatform.rankValue('planet'));
  check('KoboPlatform.rankValue reads the total', rank === x.save.total, rank);
  await s.close();
}

async function cradleByHand(env) {
  console.log('3b. the cradle, won with real taps only (volcanoes, then life in the thawed sea)');
  const s = await open(env, { seed: SEEN }); const p = s.page;
  await p.click('#tList .scard:nth-child(1)');
  let x = await st(p); check('the intro shows the goal, the chain and the tools', x.overlays.includes('ovIntro') && /🌋/.test(await p.textContent('#inChain')) && /8/.test(await p.textContent('#inTools')), x.overlays);
  await p.click('#inGo'); await p.click('#playBtn'); // pause: we act first
  await p.click('.tl[data-k="volcano"]');
  for (let k = 0; k < 3; k++) { const pt = await seaPoint(p); await p.mouse.click(pt[0] + (k - 1) * 18, pt[1]); }
  x = await st(p);
  check('three taps: three eruptions, the budget counts down', x.sc.actions === 3 && x.sc.left === 5 && /のこり\s*5/.test(await p.textContent('#budget')), x.sc);
  await p.evaluate(() => __planet.run(1e6, { quiet: true }));
  const v = await p.evaluate(() => { const vs = __planet.world.volcs; return [vs[vs.length - 1].lat, vs[vs.length - 1].lon]; });
  await p.click('.tl[data-k="seed"]');
  const sp = await seaPoint(p, v); await p.mouse.click(sp[0], sp[1]);
  x = await st(p);
  check('life sown next to the volcano: the hot-spring combo', x.stage === 1 && x.combos.includes('vent'), { st: x.stage, c: x.combos });
  await p.waitForTimeout(250); await shot(p, 'cradle-combo');
  await p.click('#playBtn'); await p.click('#fastBtn');
  await p.waitForFunction(() => __kb.state().sc.ended, null, { timeout: 90000 }).catch(() => {});
  x = await st(p);
  check('...and the cradle is won in real time', x.sc.ended && x.sc.win && /クリア/.test(await p.textContent('#rTitle')), x.sc);
  check('the combo is in the result and in the combo book', /熱水のゆりかご/.test(await p.textContent('#rWhy')) && x.save.cmb.includes('vent'), x.save.cmb);
  await shot(p, 'cradle-win');
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
}

async function danger(env) {
  console.log('4. danger: warnings that suggest a verb, and crisis cards');
  const s = await open(env, { seed: SEEN }); const p = s.page;
  await p.evaluate(() => { __planet.scenario(0); __planet.begin(); });
  let shown = false;
  for (let k = 0; k < 20 && !shown; k++) { await p.evaluate(() => __planet.run(2.5e5, { quiet: true })); shown = (await st(p)).dangerShown; }
  let x = await st(p);
  check('the cradle warns before it freezes', shown && x.danger.k === 'snow' && !x.sc.ended, x.danger);
  await shot(p, 'danger');
  await p.click('#dgGo');
  x = await st(p); check('“Warm it with volcanoes” picks the volcano tool', x.tool === 'volcano' && x.tab === 'tools', [x.tool, x.tab]);
  await p.evaluate(() => { __planet.earthNow(); __planet.set('dist', 0.85); __planet.run(2e5); });
  x = await st(p);
  check('free mode: the runaway greenhouse explains itself and offers a fix', x.overlays.includes('ovEvent') && /沸騰/.test(await p.textContent('#evTitle')) && await p.isVisible('#evAct'), x.overlays);
  await p.click('#evAct');
  x = await st(p); check('the fix opens the planet settings', x.tab === 'planet' && !x.overlays.includes('ovEvent'), x.tab);
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
}

async function freeMode(env) {
  console.log('5. free mode: design, milestones, sharing, saving, the ending');
  const s = await open(env, { seed: SEEN }); const p = s.page;
  await p.click('#tNew');
  let x = await st(p); check('“Make your own planet” opens the designer', x.overlays.includes('ovDesign'), x.overlays);
  await p.fill('#dzName', 'テスト星'); await p.click('#dzPreset [data-k="ocean"]');
  const wv = await p.$eval('#dz_water', e => +e.value); check('a preset sets the sliders (water world)', wv > 2, wv);
  await shot(p, 'design');
  await p.click('#dzGo');
  x = await st(p); check('the planet is born with its name', x.mode === 'free' && x.name === 'テスト星' && x.t === 0 && /テスト星/.test(await p.textContent('#iEra')), [x.mode, x.name]);
  await p.evaluate(() => { __planet.run(1.3e8, { quiet: true, coarse: 5e4 }); __planet.tool('volcano', 5, 30); });
  await p.evaluate(() => __planet.tool('seed', 5, 33));
  await p.evaluate(() => __planet.run(1e9, { quiet: true, coarse: 5e4 }));
  x = await st(p);
  check('milestones: ocean, then life', x.ms.ocean != null && x.ms.life != null && x.ms.life >= x.ms.ocean, x.ms);
  check('the journey points to the next milestone', /つぎ/.test(x.journey || ''), x.journey);
  check('milestones go into the records', x.save.stats.life >= 1 && x.save.stats.ms >= 2, x.save.stats);
  await p.evaluate(() => __planet.combos());
  const book = await p.$$eval('#cbList li', l => l.map(e => e.className));
  check('the combo book lists 5 combos, the found one first-class', book.length === 5 && book.filter(c => c === 'found').length >= 1, book);
  await shot(p, 'combo-book');
  await p.click('#cbClose');
  const url = await p.evaluate(() => __planet.shareUrl());
  check('the share URL carries the recipe', /\?p=[A-Za-z0-9_-]+$/.test(url), url);
  const s2 = await open(env, { seed: SEEN, query: '&' + url.split('?')[1] }); const p2 = s2.page;
  let y = await st(p2);
  check('opening it shows the shared design with the same name', y.overlays.includes('ovDesign') && await p2.isVisible('#dzShared') && await p2.inputValue('#dzName') === 'テスト星', y.overlays);
  await p2.click('#dzGo');
  y = await st(p2);
  const same = await p2.evaluate(seed => __planet.world.seed === seed, await p.evaluate(() => __planet.world.seed));
  check('…and grows the same planet (same seed and recipe)', y.mode === 'free' && same && Math.abs(y.dist - x.dist) < 1e-6, [same, y.dist, x.dist]);
  await s2.close();
  await p.evaluate(() => __planet.saveWorld());
  const a = await st(p);
  await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  x = await st(p);
  check('after reload: the title offers to continue the named planet', x.mode === 'title' && await p.isVisible('#tContinue') && /テスト星/.test(await p.textContent('#tContinue')), x.overlays);
  await p.click('#tContinue');
  x = await st(p);
  check('continue restores the same planet (time, stage, life map, milestones)', x.mode === 'free' && Math.abs(x.t - a.t) < 1 && x.stage === a.stage && x.reachOn && Math.abs(x.seaLife - a.seaLife) < 0.05 && x.ms.life === a.ms.life, { t: [a.t, x.t], st: [a.stage, x.stage] });
  check('the graph history came back too', x.hist > 1 && x.histL > 1, [x.hist, x.histL]);
  await p.click('#playBtn'); await p.waitForTimeout(1500); await p.click('#playBtn');
  const z = await st(p);
  check('time keeps running after loading', z.t > x.t, [x.t, z.t]);
  const raw = await p.evaluate(k => localStorage.getItem(k).length, WORLD);
  check('the saved planet is small enough to sync (< 120 KB)', raw < 120000, raw);
  const fps = await p.evaluate(async () => { __planet.speed(7); __planet.play(); await new Promise(r => setTimeout(r, 4500)); const q = __kb.state().quality; __planet.pause(); return q; });
  console.log('      fps while running at 10 Myr/s (swiftshader):', JSON.stringify(fps));
  check('it renders while running', fps.fps == null || fps.fps > 5, fps);
  // a surprise: a solar flare lights up the auroras
  await p.evaluate(() => { const w = __planet.world; w.nextSurp = w.t + 1; __planet.run(2e6, { quiet: true }); });
  x = await st(p); check('surprises happen on a free planet', x.events.includes('surprise'), x.events.slice(-6));
  // the ending: a civilization reaches space
  await p.evaluate(() => { __planet.earthNow({ civ: true, stage: 7 }); __planet.run(3, { quiet: true }); const c = __planet.world.civ; c.tech = 99.95; c.pol = { en: 2, rs: 2, env: 1 }; __planet.run(5, { quiet: true }); });
  await p.waitForFunction(() => __kb.state().overlays.includes('ovEnd'), null, { timeout: 8000 }).catch(() => {});
  x = await st(p);
  check('reaching space ends the story with a timeline', x.overlays.includes('ovEnd') && /物語/.test(await p.textContent('#endTitle')) && (await p.$$('#endList li')).length >= 3 && x.save.stats.ends >= 1, x.overlays);
  await shot(p, 'ending');
  await p.click('#endGo');
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
}

async function oldSave(env) {
  console.log('5b. a save from before the redesign');
  const old = { 'kusoge.planet.howto': '1', [SAVE]: { v: 1, sc: { green: { best: 812, stars: 2 }, snow: { best: 905, stars: 3 } }, total: 1717, stats: { life: 1, goe: 1, worlds: 2, clears: 2, maxMyr: 2400 }, tut: 1 },
    [WORLD]: { v: 1, t: 2400000000, p: { dist: 1, size: 1, water: 1, n2: 0.78, co2: 300000, seed: 4242 }, A: 25000, O: 150000, ch4: 300, o2: 0.004, wl: 1, lost: 0, life: { st: 2, prog: 0.2, pre: 1, div: 6, nudge: null, euk: 0, seedT: -1 }, civ: null, ev: [{ t: 600000000, k: 'life' }, { t: 2300000000, k: 'goe' }], flags: { goe: 1 }, hist: { r: [], l: [] }, spd: 6 } };
  const s = await open(env, { seed: old }); const p = s.page;
  let x = await st(p);
  check('old records keep their total', x.save.total === 1717 && /1,?717/.test(await p.textContent('#tTotal')), x.save.total);
  const locked = await p.$$eval('#tList .scard', b => b.filter(e => e.classList.contains('locked')).length);
  check('two clears open four scenarios', locked === 4, locked);
  await p.click('#tContinue');
  x = await st(p);
  check('the old planet continues: life everywhere, its milestones known, no fanfare', x.mode === 'free' && x.stage === 2 && x.seaLife > 0.5 && x.ms.life != null && !x.celeb, { st: x.stage, ms: x.ms, c: x.celeb });
  await p.evaluate(() => __planet.run(5e7, { quiet: true }));
  x = await st(p); check('…and keeps running', x.t > 2.4e9, x.t);
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
}

async function english(env) {
  console.log('6. English');
  const s = await open(env, { lang: 'en', seed: SEEN }); const p = s.page;
  const scan = async label => { const jp = await p.evaluate(`(${jpScan})(true)`); check('en: no Japanese visible — ' + label, jp.length === 0, jp); };
  await scan('title');
  await p.evaluate(() => __planet.design(null)); await scan('designer'); await p.click('#dzGo');
  await p.evaluate(() => __planet.finishTutorial());
  await p.evaluate(() => { __planet.run(1.3e8, { quiet: true, coarse: 5e4 }); __planet.tool('volcano', 0, 0); __planet.tool('seed', 0, 3); });
  await scan('free mode with a celebration');
  for (const t of ['tools', 'planet', 'life', 'civ', 'graph']) { await p.evaluate(t => __planet.tab(t), t); await scan('tab ' + t); }
  await p.evaluate(() => __planet.combos()); await scan('combo book'); await p.evaluate(() => __planet.closeAll());
  await p.evaluate(() => { document.getElementById('shareBtn') || __planet.tab('planet'); document.getElementById('shareBtn').click(); }); await scan('share'); await p.evaluate(() => __planet.closeAll());
  await p.evaluate(() => __planet.mech()); await scan('how it works'); await p.evaluate(() => __planet.closeAll());
  await p.evaluate(() => { __planet.earthNow(); __planet.set('dist', 0.85); __planet.run(2e5); }); await B.frames(p, 2);
  let x = await st(p);
  check('en: the runaway greenhouse explains itself', x.overlays.includes('ovEvent') && /boil/i.test(await p.textContent('#evTitle')), x.overlays);
  await scan('crisis card'); await shot(p, 'en-crisis');
  await p.evaluate(() => __planet.ending(false, null)); await scan('ending'); await p.evaluate(() => __planet.closeAll());
  await p.evaluate(() => __planet.scenario(0)); await scan('scenario intro');
  await p.evaluate(() => { __planet.begin(); __planet.run(2.5e6, { quiet: true }); }); await B.frames(p, 2); await scan('danger warning');
  await p.evaluate(() => __planet.run(4e7, { quiet: true }));
  await scan('scenario result'); await shot(p, 'en-result');
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
}

(async () => {
  fs.mkdirSync(OUT, { recursive: true });
  B.ensureCdn();
  const srv = await server.start(); const browser = await B.launch();
  const env = { server: srv, browser: () => browser };
  const t0 = Date.now();
  const only = process.argv[2];
  for (const f of [tutorial, physics, scenarios, cradleByHand, danger, freeMode, oldSave, english]) {
    if (only && f.name !== only) continue;
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 600)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
