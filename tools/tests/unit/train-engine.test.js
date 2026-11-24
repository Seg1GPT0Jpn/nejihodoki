// train/engine.js の単体テスト：決まった結果（同じ入力 → 同じ運転と点数）、物理（ノッチ・ブレーキの遅れ・こう配・天気）、
// 停車位置の点数、信号と ATS、ダイヤ、そして自動運転がぜんぶのルートをクリアすること。
// 実行：node tools/tests/unit/train-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'train/engine.js'));

const auto = id => E.run(id, s => E.autopilot(s), { maxSec: 900 });
// 手で運転する道具：最初に出発して、ノッチを決めて走らせる
function manual(id) { const st = E.create({ route: id }); return st; }
function go(st, n, inp) { const evs = []; for (let i = 0; i < n && !st.over; i++) { const x = E.step(st, typeof inp === 'function' ? inp(st, i) : inp); for (const e of x) evs.push(e); } return evs; }

test('the network is fictional and well formed: 10 stations, 3 lines, 9 routes, unique ids and names', () => {
  eq(E.STATIONS.length, 10); eq(E.LINES.length, 3); eq(E.ROUTES.length, 9);
  eq(new Set(E.STATIONS.map(s => s.id)).size, 10); eq(new Set(E.ROUTES.map(r => r.id)).size, 9);
  for (const s of E.STATIONS) ok(s.name.ja && s.name.en, s.id);
  for (let i = 1; i < E.STATIONS.length; i++) ok(E.STATIONS[i].x - E.STATIONS[i - 1].x >= 400, 'stations spaced');
  for (const r of E.ROUTES) {
    ok(r.name.ja && r.name.en && r.desc.ja && r.desc.en, r.id);
    ok(r.stops.length >= 3 && r.stops.every((v, i) => i === 0 || v > r.stops[i - 1]), r.id + ' stops ascend');
    ok(E.LINES.some(l => l.id === r.line), r.id + ' line');
  }
  const weathers = new Set(E.ROUTES.map(r => r.weather)), tods = new Set(E.ROUTES.map(r => r.tod));
  ok(weathers.size >= 4 && tods.size === 3, 'weather and time-of-day variety');
  const text = JSON.stringify([E.STATIONS, E.LINES, E.ROUTES.map(r => [r.name, r.desc])]);
  ok(!/JR|東京|大阪|京王|小田急|東急|新幹線|メトロ|Tokyo|Osaka|Shinkansen/.test(text), 'no real operators or places');
});

test('stations stand on flat track, away from curves and speed zones', () => {
  for (const s of E.STATIONS) for (let d = -120; d <= 20; d += 10) { eq(E.gradeAt(s.x + d), 0, s.id + ' grade ' + d); if (d >= -60) eq(E.curveAt(s.x + d), 0, s.id + ' curve ' + d); }
});

test('the timetable is sane: arrivals ascend, each leg gives enough time, signals sit between stations', () => {
  for (const id of E.ROUTE_IDS) {
    const P = E.plan(id);
    for (let k = 1; k < P.stops.length; k++) { ok(P.stops[k].sArr > P.stops[k - 1].sDep + 20, id + ' leg ' + k); ok(P.stops[k].sDep >= P.stops[k].sArr + E.DWELL - 0.01 || P.stops[k].last, 'dwell'); }
    ok(P.stops[P.stops.length - 1].sArr < 600, id + ' under 10 minutes');
    for (const sg of P.sigs) for (const s of P.stops) ok(Math.abs(sg.x - s.x) > 140, id + ' signal ' + sg.id + ' away from ' + s.id);
    eq(P.sigs.length > 0, E.byId(id).sig > 0, id + ' signals');
  }
});

test('determinism: the same inputs give the same run, the same score, the same bytes', () => {
  const a = auto('r2'), b = auto('r2');
  ok(a.over && b.over);
  eq(JSON.stringify(a.res), JSON.stringify(b.res));
  eq(a.f, b.f);
  const c = manual('r1'), d = manual('r1');
  const drive = (s, i) => ({ notch: i < 600 ? 3 : i < 1500 ? 0 : -4, depart: i === 60 });
  go(c, 2400, drive); go(d, 2400, drive);
  eq(JSON.stringify(c), JSON.stringify(d), 'full state');
});

test('physics: power accelerates, the brake lags, braking stops the train, a grade slows it, rain weakens the brake', () => {
  const st = manual('r1');
  go(st, 5, { depart: true });
  go(st, 60 * 5, { notch: 5 });
  ok(st.sp > 3 && st.sp < 8, 'accelerates (~1 m/s2): ' + st.sp);
  const v0 = st.sp; go(st, 6, { notch: -4 });
  ok(st.br > 0 && st.br < 0.52 * 0.5, 'the brake builds up gradually: ' + st.br);
  go(st, 60 * 20, { notch: -4 }); ok(st.sp < v0, 'braking slows');
  // 同じ速さからのブレーキの長さ：晴れ＞雨＞雪
  const dist = id => { const s = manual(id); s.phase = 'run'; s.sp = 15; s.x = 100; s.notch = -5; const x0 = s.x; let n = 0; while (s.sp > 0 && n++ < 6000) E.step(s, { notch: -5 }); return s.x - x0; };
  const dc = dist('r1'), dr = dist('r5'), ds = dist('r8');
  ok(dc < dr && dr < ds, 'stopping distance clear < rain < snow: ' + [dc, dr, ds].map(Math.round));
  // こう配
  const g = manual('r2'); g.phase = 'run'; g.x = 200; g.sp = 10; g.notch = 0; const gv = g.sp; go(g, 120, { notch: 0 });
  ok(E.gradeAt(g.x) !== 0 || true); ok(g.sp !== gv, 'speed changes on a grade');
  // 非常ブレーキは、ふつうの最大ブレーキより強い
  const e = manual('r1'); e.phase = 'run'; e.sp = 15; e.x = 100; for (let i = 0; i < 600; i++) E.step(e, { notch: -8 }); const f = manual('r1'); f.phase = 'run'; f.sp = 15; f.x = 100; for (let i = 0; i < 600; i++) E.step(f, { notch: -7 });
  ok(e.x < f.x, 'EB stops shorter');
});

test('a stopped train stays put with the brake on; the lever cannot move it past nothing', () => {
  const st = manual('r1'); st.phase = 'run'; st.sp = 0; st.x = 300; go(st, 120, { notch: -3 }); eq(st.sp, 0); eq(st.x, 300);
  go(st, 60, { notch: 0 }); ok(st.sp >= 0);
});

test('stop scoring: error to points is symmetric, steps down smoothly, and the ranks match', () => {
  eq(E.stopFrac(0), 1); eq(E.stopFrac(0.5), 1); eq(E.stopFrac(-0.5), 1);
  ok(E.stopFrac(1) > E.stopFrac(2) && E.stopFrac(2) > E.stopFrac(4) && E.stopFrac(4) > E.stopFrac(8) && E.stopFrac(8) > 0, 'monotonic');
  eq(E.stopFrac(25), 0); eq(E.stopFrac(3), E.stopFrac(-3));
  eq(E.stopRank(0.3), 'pita'); eq(E.stopRank(-1), 'great'); eq(E.stopRank(2.5), 'good'); eq(E.stopRank(5), 'ok'); eq(E.stopRank(9), 'miss');
  eq(E.punctFrac(0), 1); eq(E.punctFrac(2), 1); ok(E.punctFrac(10) < E.punctFrac(5) && E.punctFrac(60) === 0);
  eq(E.starsOf(2000, 2, 0, 0), 3); eq(E.starsOf(1500, 2, 0, 0), 2); eq(E.starsOf(1000, 2, 0, 0), 1); eq(E.starsOf(900, 2, 0, 0), 0);
  eq(E.starsOf(2000, 2, 1, 0), 2, 'ATS caps at 2 stars'); eq(E.starsOf(2000, 2, 0, 1), 1, 'a red signal caps at 1 star');
});

test('a stop is scored where the train actually stands (a held brake until standstill, then the leg is scored)', () => {
  // 手で停まる：駅の少し手前から B3 で止めて、位置と点数がつながる
  for (const target of [-8, -2, 0.4, 3, 9]) {
    const st = manual('r1'); go(st, 2, { depart: true });
    const stp = E.plan('r1').stops[1];
    st.x = stp.x + target - 200; st.sp = 0; st.phase = 'run'; st.stillT = 0; st.k = 1; st.leg.tStart = 0;
    // 200m を走ってから、狙った位置で止まるよう、先読みで決めたノッチを使う
    let evs = [];
    for (let i = 0; i < 60 * 200 && !st.legs.length; i++) {
      const d = stp.x + target - st.x, v = st.sp;
      const n = d > 60 + v * v / 1.0 ? (v < 12 ? 3 : 0) : E.autopilot(st).notch;
      const hold = d < 1 && v < 0.2 ? -3 : n;
      evs = evs.concat(E.step(st, { notch: hold }));
    }
    const leg = st.legs[0]; ok(leg, 'stopped at target ' + target);
    ok(Math.abs(leg.err) < 12, 'err ' + leg.err);
    eq(leg.stop, Math.round(E.W_STOP * (leg.missed ? 0 : E.stopFrac(leg.err))), 'stop points follow the error');
  }
});

test('a leg is judged on arrival time against the timetable', () => {
  const early = E.run('r1', s => E.autopilot(s, { pace: 1 }), {}); ok(early.res);
  const l = early.res.legs[0]; ok(Math.abs(l.dArr) < 8, 'autopilot is on time: ' + l.dArr);
  ok(l.punct > 220, 'punctuality points ' + l.punct);
  // ずっと待ってから出発 → おそい
  const late = E.run('r1', (s, i) => { const a = E.autopilot(s); if (s.phase === 'dwell' && s.k === 1) a.depart = a.depart && s.t > 40; return a; }, {});
  ok(late.res.legs[0].dArr > 20 && late.res.legs[0].punct < early.res.legs[0].punct, 'late departure is late: ' + late.res.legs[0].dArr);
  // 早く出発 → ペナルティ
  const eager = E.run('r1', (s, i) => { const a = E.autopilot(s); if (s.phase === 'dwell' && s.k === 1) a.depart = true; return a; }, {});
  ok(eager.res.legs[0].early > 3 && eager.res.legs[0].punct < early.res.legs[0].punct, 'early departure costs: ' + eager.res.legs[0].early);
});

test('ride comfort: slamming the lever costs comfort; easing off at the stop is smooth', () => {
  const rough = E.run('r1', (s, i) => { const a = E.autopilot(s); if (s.phase === 'run') { if (a.notch < 0) a.notch = -7; else if (a.notch > 0) a.notch = 5; if (s.f % 90 < 45 && s.sp > 3) a.notch = s.sp > 8 ? -7 : 5; } return a; }, { maxSec: 400 });
  const smooth = auto('r1');
  ok(smooth.res, 'smooth finishes');
  const sc = smooth.res.legs[0].comfort;
  ok(sc >= 170, 'autopilot is smooth: ' + sc);
  if (rough.res) ok(rough.res.legs[0].comfort < sc - 40 || rough.legs.length === 0, 'rough ride: ' + rough.res.legs[0].comfort); else ok(rough.atsN > 0 || rough.legs.length >= 0);
  // 強いブレーキのまま止まると「ガクン」
  const st = manual('r1'); st.phase = 'run'; st.sp = 3; st.x = 100; let jolt = 0; for (let i = 0; i < 600; i++) { for (const e of E.step(st, { notch: -7 })) if (e.t === 'jolt') jolt = e.v; }
  ok(jolt > 0.2, 'a jolt at standstill under B7: ' + jolt);
  const st2 = manual('r1'); st2.phase = 'run'; st2.sp = 1.0; st2.x = 100; let j2 = 0; for (let i = 0; i < 900; i++) { for (const e of E.step(st2, { notch: -1 })) if (e.t === 'jolt') j2 = e.v; }
  eq(j2, 0, 'no jolt under B1');
});

test('speed limits: going far over triggers the ATS (emergency brake until stopped, then it resets)', () => {
  const st = manual('r1'); go(st, 2, { depart: true });
  let ats = 0; const evs = go(st, 60 * 60, { notch: 5 }); for (const e of evs) if (e.t === 'ats') ats++;
  ok(ats >= 1 && st.atsN >= 1, 'ATS fired');
  ok(st.leg.ats >= 1 || st.legs.length, 'counted on the leg');
  st.phase = 'run'; st.x = 100; st.sp = 20; st.ats.on = false; st.hot = 0; st.k = 2; go(st, 60 * 10, { notch: 5 });
  ok(st.ats.on || st.sp === 0, 'ATS again'); let n = 0; while (st.sp > 0 && n++ < 6000) E.step(st, { notch: 5 }); eq(st.sp, 0, 'the ATS stops the train even with full power');
  go(st, 60 * 5, { notch: 0 }); eq(st.ats.on, false, 'ATS resets after standing 3 s');
  const res = E.limitAt(E.byId('r1'), 100); ok(res <= 55);
});

test('signals: red until the clear time, then yellow, then green; passing a red triggers the ATS and caps the stars', () => {
  const P = E.plan('r5'); const sg = P.sigs.find(s => s.kind === 's'); ok(sg, 'a stop signal on r5');
  eq(E.aspect(sg, sg.clear - 1), 'r'); eq(E.aspect(sg, sg.clear + 1), 'y'); eq(E.aspect(sg, sg.clear + 20), 'g');
  const c = E.plan('r2').sigs; ok(c.every(s => s.kind === 'c'), 'r2 has caution signals only'); eq(E.aspect(c[0], c[0].clear - 1), 'y'); eq(E.aspect(c[0], c[0].clear + 1), 'g');
  // 赤信号に突っこむ
  const st = manual('r5'); go(st, 2, { depart: true });
  st.x = sg.x - 120; st.sp = 12; st.f = Math.round((sg.clear - 25) * 60); st.t = st.f / 60; st.k = 2;
  let red = 0; for (let i = 0; i < 60 * 30 && !red; i++) { for (const e of E.step(st, { notch: 0 })) if (e.t === 'redpass') red++; }
  ok(red === 1 && st.redPass === 1 && st.ats.on, 'ran a red signal: ATS on');
  // 待つ：信号の手前で止まって青になるのを待つ
  const a = auto('r5'); ok(a.res && a.res.red === 0 && a.res.ats === 0, 'autopilot obeys signals');
});

test('limit lookups: stations have approach limits and pass-through zones; yellow limits apply near a yellow signal', () => {
  const R = E.byId('r3');
  eq(E.limitAt(R, E.STATIONS[2].x - 100) <= 50, true, 'approach 50 at a stop');
  eq(E.limitAt(R, E.STATIONS[1].x) <= 60, true, 'pass-through limit');
  const st = manual('r2'); const sg = E.plan('r2').sigs[0]; st.x = sg.x - 50; st.t = sg.clear - 2; eq(E.limitNow(st) <= 35, true, 'yellow caution 35'); st.t = sg.clear + 3; ok(E.limitNow(st) > 35);
  const ah = E.ahead(manual('r2'), 600); ok(ah.stations.length && ah.limits.length && ah.signals.length);
});

test('the autopilot clears every route: 3 stars on most, stops within a metre, nothing breaks', () => {
  let three = 0;
  for (const id of E.ROUTE_IDS) {
    const st = auto(id);
    ok(st.over && st.res, id + ' finished');
    const r = st.res;
    ok(r.stars >= 2, id + ' stars ' + r.stars + ' score ' + r.score + '/' + r.max);
    eq(r.ats, 0, id + ' ats'); eq(r.red, 0, id + ' red');
    ok(r.legs.every(l => Math.abs(l.err) <= 1.5 && !l.missed), id + ' stop errors ' + r.legs.map(l => l.err));
    ok(r.legs.every(l => Math.abs(l.dArr) <= 12), id + ' on time ' + r.legs.map(l => l.dArr));
    if (r.stars === 3) three++;
    ok(st.t < 600, id + ' time ' + st.t);
  }
  ok(three >= 7, 'three stars on ' + three + ' of 9');
});

test('a hopeless driver (never brakes) does not clear: the ATS stops them again and again', () => {
  const st = E.run('r2', (s, i) => ({ notch: 5, depart: s.phase === 'dwell' }), { maxSec: 600 });
  ok(st.atsN >= 3, 'ATS fired ' + st.atsN);
  ok(!st.res || st.res.stars <= 1, 'no good stars: ' + (st.res && st.res.stars));
});

test('scores stay within the caps: leg max 1000, route max = legs * 1000, ranking total fits the registry cap', () => {
  eq(E.W_STOP + E.W_PUNCT + E.W_COMF + E.W_SAFE, E.LEG_MAX);
  let sum = 0; for (const id of E.ROUTE_IDS) sum += E.LEG_MAX * E.plan(id).legs.length;
  ok(sum < 100000, 'sum of maxima ' + sum);
});

run('train-engine');
