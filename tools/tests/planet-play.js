#!/usr/bin/env node
// わくせいシミュレーターの通しテスト（Playwright、?debug の window.__planet / __kb を使う）
//   node tools/tests/planet-play.js          … 全部（約2〜3分）。スクリーンショットは tools/tests/out/shots/planet-play/
// 1. 初回：遊び方 → チュートリアル（本物の操作：地球儀のドラッグ、▶、距離のスライダー、火山の道具で地球儀をタップ）
// 2. 気候の物理：CO₂が多いほど暖かい／遠いほど寒い／全球凍結の始まりと、火山のCO₂での脱出（ヒステリシス）／近すぎると暴走温室で海が干上がる／
//    岩の風化がCO₂を元に戻す（サーモスタット）／明るくなる太陽でCO₂が下がる
// 3. シナリオ8本：何もしないと失敗、筋のよい手で勝つ（ボタンとタップで勝つ回も1本）。ベスト・星・合計点の保存
// 4. 保存：自由モードの星と記録が、再読み込みしても続きから
// 5. 英語：タイトル・各タブ・シナリオ・結果・危機の説明で、日本語が見えない
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
async function canvasCenter(p) { const r = await p.evaluate(() => { const b = document.getElementById('cv').getBoundingClientRect(); return [b.left + b.width / 2, b.top + b.height / 2]; }); return r; }

async function tutorial(env) {
  console.log('1. first visit: how to play → tutorial with real input');
  const s = await open(env); const p = s.page;
  let x = await st(p);
  check('first visit shows how to play', x.overlays.includes('howto'), x.overlays);
  await p.click('#howtoGo');
  x = await st(p);
  check('a new planet starts at its birth with the tutorial', x.mode === 'free' && x.tutorial === 0 && x.t === 0 && x.overlays.length === 0, x);
  const c = await canvasCenter(p);
  await p.mouse.move(c[0] - 80, c[1]); await p.mouse.down(); await p.mouse.move(c[0] + 80, c[1] + 20, { steps: 12 }); await p.mouse.up();
  x = await st(p); check('dragging the globe turns it (step 2)', x.tutorial === 1, x.tutorial);
  await p.click('#playBtn'); await p.waitForTimeout(700);
  x = await st(p); check('▶ runs time at 1 million years a second', x.running && x.t > 2e5 && x.speedYps === 1e6 && x.tutorial === 2, { t: x.t, sp: x.speedYps, tut: x.tutorial });
  await p.click('#playBtn');
  await p.click('#tutNext');
  x = await st(p); check('step 4 opens the Planet tab', x.tutorial === 3 && x.tab === 'planet', x);
  const before = (await st(p)).dist;
  await p.$eval('#s_dist', el => { el.value = '1.2'; el.dispatchEvent(new Event('input', { bubbles: true })); });
  x = await st(p); check('the distance slider moves the planet (step 5)', x.dist === 1.2 && before === 1 && x.tutorial === 4, { d: x.dist, tut: x.tutorial });
  await p.evaluate(() => __planet.set('dist', 1));
  await p.click('.tl[data-k="volcano"]');
  const c2 = await canvasCenter(p); await p.mouse.click(c2[0], c2[1]);
  x = await st(p); check('Land → Volcano → tap the globe erupts (step 6)', x.events.includes('volcano') && x.tutorial === 5, { ev: x.events, tut: x.tutorial });
  await shot(p, 'tutorial');
  await p.click('#tutNext'); await p.click('#tutNext');
  x = await st(p); check('the tutorial finishes and is remembered', x.tutorial === null && x.save.tut === 1, x);
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
    // CO2 → temperature (held CO2)
    const w = earth(); out.t280 = w.d.Tg; out.ice280 = w.d.ice; out.t560 = eqT(w, 560); out.t1120 = eqT(w, 1120); out.t140 = eqT(w, 140);
    // distance → temperature
    const a = earth({ p: { dist: 1.03 } }), b = earth({ p: { dist: 0.97 } }); out.tFar = a.d.Tg; out.tNear = b.d.Tg;
    // snowball: dim the star, then bring it back — the planet stays frozen (hysteresis) until volcanic CO2 builds up
    const sb = earth({ t: 4.0e9 }); S.setParam(sb, 'co2', 900); S.advance(sb, 2e5); out.preT = sb.d.Tg;
    S.setParam(sb, 'dist', 1.12); S.advance(sb, 6e4); out.snowOn = !!sb.flags.snow; out.snowIce = sb.d.ice;
    S.setParam(sb, 'dist', 1.0); S.advance(sb, 5e4); out.stillFrozen = !!sb.flags.snow && sb.d.ice > 0.8; out.co2a = sb.A; out.W = sb.d.Wl; out.V = sb.d.V;
    for (let k = 0; k < 4; k++) S.tools.volcano(sb, 0, k * 90);
    let yrs = 0; while (sb.flags.snow && yrs < 2e7) { S.advance(sb, 1e5); yrs += 1e5; }
    out.thawYrs = yrs; out.thawed = !sb.flags.snow; out.co2b = sb.A; out.thawEv = sb.ev.some(e => e.k === 'thaw');
    // natural escape (no help): longer
    const sn = earth({ t: 4.0e9 }); S.setParam(sn, 'co2', 900); S.advance(sn, 2e5); S.setParam(sn, 'dist', 1.12); S.advance(sn, 6e4); S.setParam(sn, 'dist', 1.0);
    yrs = 0; while (sn.flags.snow && yrs < 3e7) { S.advance(sn, 2.5e5); yrs += 2.5e5; } out.thawNatural = yrs; out.thawedNatural = !sn.flags.snow;
    // runaway greenhouse: too close → boiling oceans → dry planet
    const rg = earth(); S.setParam(rg, 'dist', 0.86); S.advance(rg, 1e5); out.rgT = rg.d.Tg; out.rgBoil = rg.ev.some(e => e.k === 'boil');
    S.advance(rg, 3e8, { coarse: 5e4 }); out.rgWater = rg.wl; out.rgDry = rg.ev.some(e => e.k === 'dry'); out.rgDead = !!rg.flags.dead || rg.life.st === 0;
    // weathering thermostat: a CO2 spike is drawn back down; a CO2 drop is refilled
    const th = earth(); S.advance(th, 1e6); out.base = th.A; S.setParam(th, 'co2', 2000); S.advance(th, 1e3); out.spikeT = th.d.Tg; S.advance(th, 1e6); out.afterSpike = th.A; out.afterSpikeT = th.d.Tg;
    S.setParam(th, 'co2', 100); S.advance(th, 1e6); out.afterDrop = th.A;
    // the brightening star: the thermostat lowers CO2 over a billion years
    const br = earth(); S.advance(br, 1e6); out.co2Now = br.A; S.advance(br, 8e8, { coarse: 5e4 }); out.co2Later = br.A; out.lumLater = S.lum(br.t);
    return out;
  });
  const f = (x, d) => +Number(x).toFixed(d == null ? 1 : d);
  console.log('     ', JSON.stringify(Object.fromEntries(Object.entries(r).map(([k, v]) => [k, typeof v === 'number' ? f(v, Math.abs(v) < 1 ? 3 : 1) : v]))));
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
  console.log('3. scenarios: lose by doing nothing, win with a sensible plan');
  const s = await open(env, { seed: SEEN }); const p = s.page;
  const ids = await p.evaluate(() => __planet.scenarios());
  check('8 scenarios', ids.length === 8, ids);
  for (let i = 0; i < ids.length; i++) {
    const r = await p.evaluate(async ([i, plan]) => {
      const P = __planet; P.scenario(i); P.begin();
      const lim = P.sc.def.limit;
      for (let k = 0; k < 20 && !P.sc.ended; k++) { if (plan) P.strat(k); P.run(lim / 20, { quiet: true }); }
      const x = __kb.state();
      return { ended: x.sc.ended, overlays: x.overlays, best: x.save.sc[x.sc.id] ? x.save.sc[x.sc.id].best : 0, total: x.save.total, title: document.getElementById('rTitle').textContent, score: document.getElementById('rScore').textContent, why: document.getElementById('rWhy').textContent };
    }, [i, false]);
    check(`${ids[i]}: doing nothing fails`, r.ended && r.overlays.includes('ovResult') && r.best === 0 && /失敗/.test(r.title), r);
    const w = await p.evaluate(async ([i, plan]) => {
      const P = __planet; P.scenario(i); P.begin();
      const lim = P.sc.def.limit;
      for (let k = 0; k < 20 && !P.sc.ended; k++) { if (plan) P.strat(k); P.run(lim / 20, { quiet: true }); }
      const x = __kb.state();
      return { ended: x.sc.ended, best: x.save.sc[x.sc.id] ? x.save.sc[x.sc.id].best : 0, stars: x.save.sc[x.sc.id] ? x.save.sc[x.sc.id].stars : 0, total: x.save.total, title: document.getElementById('rTitle').textContent, used: x.sc.used, limit: x.sc.limit };
    }, [i, true]);
    check(`${ids[i]}: the plan wins (score ${w.best}, ${w.stars}★)`, w.ended && /クリア/.test(w.title) && w.best >= 600 && w.best <= 1000 && w.stars >= 1, w);
    if (i === 2) await shot(p, 'result');
  }
  const x = await st(p);
  const sum = Object.values(x.save.sc).reduce((a, v) => a + v.best, 0);
  check('the scenario total is the sum of the bests (ranking value)', x.save.total === sum && sum > 4800, [x.save.total, sum]);
  const rank = await p.evaluate(() => KoboPlatform.rankValue('planet'));
  check('KoboPlatform.rankValue reads the total', rank === x.save.total, rank);
  // one win by real buttons and taps: escape the snowball with volcanoes
  await p.evaluate(() => __planet.scenario(2));
  await p.click('#inGo');
  await p.click('#playBtn'); // pause again; we place volcanoes first
  const tabSel = await st(p); if (tabSel.tab !== 'land') await p.click('#tabs [data-tab="land"]');
  await p.click('.tl[data-k="volcano"]');
  const c = await canvasCenter(p);
  for (let k = 0; k < 12; k++) { await p.mouse.click(c[0] + ((k % 4) - 1.5) * 30, c[1] + ((k >> 2) - 1) * 25); }
  const mid = await st(p);
  check('tapping the globe with the volcano tool erupts 12 times', mid.events.filter(e => e === 'volcano').length >= 12, mid.events);
  await p.click('#playBtn');
  await p.waitForFunction(() => __kb.state().sc.ended, null, { timeout: 60000 }).catch(() => {});
  const fin = await st(p);
  check('...and the snowball scenario is won in real time', fin.sc.ended && fin.overlays.includes('ovResult') && /クリア/.test(await p.textContent('#rTitle')), fin.sc);
  await shot(p, 'snowball-win');
  check('no page errors', !s.log.pageErrors.length, s.log.pageErrors);
  await s.close();
}

async function saving(env) {
  console.log('4. save and continue');
  const s = await open(env, { seed: SEEN }); const p = s.page;
  await p.evaluate(() => { __planet.newPlanet(); __planet.run(9e8, { quiet: true }); __planet.saveWorld(); });
  const a = await st(p);
  check('a free planet grows: oceans and life within 900 Myr', a.water > 0.5 && a.stage >= 1 && a.events.includes('life'), { w: a.water, st: a.stage, ev: a.events });
  check('milestones go into the records (life)', a.save.stats.life >= 1, a.save.stats);
  await s.reload(); await p.waitForFunction(() => window.__kb && __kb.ready());
  let x = await st(p);
  check('after reload: the title offers to continue', x.mode === 'title' && x.overlays.includes('ovTitle') && await p.isVisible('#tContinue'), x.overlays);
  await p.click('#tContinue');
  x = await st(p);
  check('continue restores the same planet (time, stage, CO2)', x.mode === 'free' && Math.abs(x.t - a.t) < 1 && x.stage === a.stage && Math.abs(x.co2 / a.co2 - 1) < 0.02, { t: [a.t, x.t], st: [a.stage, x.stage], co2: [a.co2, x.co2] });
  check('the graph history came back too', x.hist > 1 && x.histL > 1, [x.hist, x.histL]);
  await p.click('#playBtn'); await p.waitForTimeout(1500); await p.click('#playBtn');
  const y = await st(p);
  check('time keeps running after loading', y.t > x.t, [x.t, y.t]);
  const raw = await p.evaluate(k => localStorage.getItem(k).length, WORLD);
  check('the saved planet is small enough to sync (< 120 KB)', raw < 120000, raw);
  const fps = await p.evaluate(async () => { __planet.speed(6); __planet.play(); await new Promise(r => setTimeout(r, 4500)); const q = __kb.state().quality; __planet.pause(); return q; });
  console.log('      fps while running at 1 Myr/s (swiftshader):', JSON.stringify(fps));
  check('it renders while running', fps.fps == null || fps.fps > 5, fps);
  await s.close();
}

async function english(env) {
  console.log('5. English');
  const s = await open(env, { lang: 'en', seed: SEEN }); const p = s.page;
  const scan = async label => { const jp = await p.evaluate(`(${jpScan})(true)`); check('en: no Japanese visible — ' + label, jp.length === 0, jp); };
  await scan('title');
  await p.evaluate(() => __planet.earthNow());
  for (const t of ['planet', 'land', 'life', 'civ', 'graph']) { await p.evaluate(t => __planet.tab(t), t); await scan('tab ' + t); }
  await p.evaluate(() => __planet.mech()); await scan('how it works'); await p.evaluate(() => __planet.closeAll());
  await p.evaluate(() => { __planet.set('dist', 0.85); __planet.run(2e5); }); await B.frames(p, 2);
  let x = await st(p);
  check('en: the runaway greenhouse explains itself', x.overlays.includes('ovEvent') && /boil/i.test(await p.textContent('#evTitle')), x.overlays);
  await scan('crisis card'); await shot(p, 'en-crisis');
  await p.evaluate(() => __planet.scenario(1)); await scan('scenario intro');
  await p.evaluate(() => { __planet.begin(); __planet.run(300, { quiet: true }); });
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
  for (const f of [tutorial, physics, scenarios, saving, english]) {
    try { await f(env); } catch (e) { check(f.name + ' crashed', false, String(e && e.stack || e).slice(0, 600)); }
  }
  await browser.close(); await srv.close();
  const fail = results.filter(r => !r.ok).length;
  console.log(`\npass ${results.length - fail}  fail ${fail}  (${Math.round((Date.now() - t0) / 1000)}s)  shots: ${path.relative(process.cwd(), OUT)}`);
  process.exit(fail ? 1 : 0);
})();
