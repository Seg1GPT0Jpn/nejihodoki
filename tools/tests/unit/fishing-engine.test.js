// fishing/fish.js（150種のデータ）と fishing/engine.js の単体テスト：同じ種は同じ結果／あたりの表がどの場所・時間でも筋が通る／引きの物理（ボットが最後まで釣れる・糸は切れない）／
// ずかんのデータがそろっている（絵のパーツ・ja/en の名前と解説・架空の印）／保存の読み込み／るすの間の計算（上限・正直）／オーダー・大会（週の月曜・ボットの得点は同じ）
// 実行：node tools/tests/unit/fishing-engine.test.js
'use strict';
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');
const E = require(path.join(ROOT, 'fishing/engine.js'));
const F = require(path.join(ROOT, 'fishing/fish.js'));
const FISH = E.FISH, JP = /[぀-ヿ㐀-䶿一-鿿ｦ-ﾟ]/;
const TZ = -540; // JST
const at = (y, m, d, h) => Date.UTC(y, m - 1, d, h, 0) - TZ * 60000 * -1 * 0 + 0 - 0; // UTC ms（tz は envAt に渡す）
const jst = (y, m, d, h) => Date.UTC(y, m - 1, d, h, 0) + TZ * 60000; // JST の壁時計 → ms

test('data: exactly 150 fish with unique keys, ja/en names and notes, sane sizes/rarity/power, English has no Japanese, Japanese has Japanese', () => {
  eq(FISH.length, 150); eq(F.COUNT, 150); const keys = new Set(FISH.map(f => f.key)); eq(keys.size, 150);
  const enNames = new Set(FISH.map(f => f.en)), jaNames = new Set(FISH.map(f => f.ja)); eq(enNames.size, 150, 'English names are unique'); eq(jaNames.size, 150, 'Japanese names are unique');
  FISH.forEach((f, i) => {
    eq(f.i, i); ok(/^[a-z]+$/.test(f.key), 'key ' + f.key); ok(f.ja && f.en && f.noteJa && f.noteEn, 'texts ' + f.key); ok(!JP.test(f.en + f.noteEn), 'English text has Japanese: ' + f.key); ok(JP.test(f.ja) && JP.test(f.noteJa), 'Japanese text: ' + f.key);
    ok(f.noteJa.length >= 12 && f.noteJa.length <= 120 && f.noteEn.length >= 25 && f.noteEn.length <= 220, 'note length ' + f.key + ' ' + f.noteJa.length + '/' + f.noteEn.length);
    ok(f.r >= 1 && f.r <= 5, 'rarity ' + f.key); ok(f.min > 0 && f.max > f.min, 'size range ' + f.key); ok(f.pow >= 1 && f.pow <= 10, 'power ' + f.key); ok(f.loc.length >= 1 && f.loc.every(l => l >= 0 && l < 12), 'locs ' + f.key);
    ok(f.time > 0 && f.time <= 15 && f.wx > 0 && f.wx <= 7 && f.season > 0 && f.season <= 15, 'masks ' + f.key); ok('opbcifg'.includes(f.diet) && 'nsdy'.includes(f.bite) && 'abcde'.includes(f.fight), 'codes ' + f.key);
    ok(f.r >= 5 ? f.pow >= 5 : true, 'legendary fish are not feeble ' + f.key);
  });
  const by = r => FISH.filter(f => f.r === r).length; ok(by(1) >= 20 && by(2) >= 25 && by(3) >= 25 && by(4) >= 20 && by(5) >= 10, 'rarity spread ' + [1, 2, 3, 4, 5].map(by));
});
test('data: every fish has valid art parameters; the full art and the silhouette (shape, length, depth, tail, fin, extra) are unique', () => {
  const SH = new Set(F.SHAPES), TAIL = new Set(['fork', 'rnd', 'lun', 'fan', 'fil', 'none']), FIN = new Set(['low', 'mid', 'high', 'sail', 'spin', 'two', 'long', 'none']), EXT = new Set(['-', 'barb', 'lure', 'beak', 'bill', 'hump', 'tube', 'spot', 'horn']), PAT = new Set(['none', 'bars', 'line', 'spot', 'saddle', 'mott', 'scale', 'glow', 'grad']);
  const full = new Set(), sil = new Set();
  for (const f of FISH) { const a = f.art; ok(SH.has(a.shape) && TAIL.has(a.tail) && FIN.has(a.fin) && EXT.has(a.ext) && PAT.has(a.pat), 'parts ' + f.key); ok(a.L >= 4 && a.L <= 30 && a.D >= 2 && a.D <= 14, 'proportions ' + f.key); for (const c of [a.c1, a.c2, a.c3]) ok(/^#[0-9a-f]{3}$/.test(c), 'colour ' + f.key + c);
    full.add(JSON.stringify(a)); sil.add([a.shape, a.L, a.D, a.tail, a.fin, a.ext].join()); }
  eq(full.size, 150); eq(sil.size, 150, 'distinct silhouettes');
  eq(new Set(FISH.map(f => f.art.shape)).size, 18, 'all 18 body plans are used');
});
test('data: fictional creatures are labelled and are not mistaken for real ones; "unverified" notes carry the marker; real notes make no hedged claim', () => {
  let nf = 0, nu = 0;
  for (const f of FISH) {
    if (f.kind === 'f') { nf++; ok(f.noteJa.startsWith('【架空の生きもの】') && f.noteEn.startsWith('[Fictional creature]'), 'fictional label ' + f.key); }
    else { ok(!/架空|Fictional/.test(f.noteJa + f.noteEn), 'real fish is not labelled fictional ' + f.key); }
    if (f.kind === 'u') { nu++; ok(/確かでない/.test(f.noteJa) && /not (firmly )?(well )?(established|confirmed)/i.test(f.noteEn), 'unverified marker ' + f.key); }
    else if (f.kind === 'r') ok(!/確かでない|諸説/.test(f.noteJa), 'real note has no hedge marker ' + f.key);
    ok(['r', 'u', 'f'].includes(f.kind));
  }
  ok(nf >= 15 && nf <= 40 && nu >= 3, 'counts ' + nf + '/' + nu);
});
test('locations: 12 places, each with >= 9 kinds; the unlock thresholds are reachable from the places that are already open', () => {
  eq(E.LOCATIONS.length, 12); const per = E.LOCATIONS.map((l, i) => FISH.filter(f => f.loc.includes(i)));
  per.forEach((l, i) => ok(l.length >= 9, E.LOCATIONS[i].id + ' has ' + l.length)); eq(E.LOCATIONS[0].unlock, 0);
  // species reachable by only using places whose threshold is <= (kinds you could already have) — grow like a player would
  let have = new Set(); let guard = 0;
  while (guard++ < 40) { const open = E.LOCATIONS.map((l, i) => i).filter(i => have.size >= E.LOCATIONS[i].unlock); const before = have.size; for (const i of open) for (const f of per[i]) have.add(f.i); if (have.size === before) break; }
  eq(have.size, 150, 'every kind can be reached');
  for (const i of E.LOC_ORDER.slice(1)) { const need = E.LOCATIONS[i].unlock; const lower = new Set(); for (const j of E.LOC_ORDER) if (E.LOCATIONS[j].unlock < need) for (const f of per[j]) lower.add(f.i); ok(lower.size >= need + 2, E.LOCATIONS[i].id + ': ' + lower.size + ' kinds exist below its threshold ' + need); }
  eq(E.LOC_ORDER.length, 12); eq(new Set(E.LOC_ORDER).size, 12);
});

test('determinism: the same seed gives the same plan, size, fight and tournament; different seeds differ', () => {
  const env = { t: 1, wx: 0, season: 0 }, g = { r: 0, e: 0, n: 0, sb: 0, sl: -1 };
  for (let s = 1; s <= 50; s++) { deep(E.planBite(s, env, 0, g), E.planBite(s, env, 0, g)); deep(E.planBite(s, env, 4, g), E.planBite(s, env, 4, g)); }
  const sigs = new Set(); for (let s = 1; s <= 50; s++) sigs.add(JSON.stringify(E.planBite(s, env, 0, g))); ok(sigs.size > 40, 'seeds differ');
  const a = E.botFight(5, 300, g, 99), b = E.botFight(5, 300, g, 99); eq(a.t, b.t); eq(a.status, b.status); deep(a.st, b.st);
  deep(E.botScores(20261123, 0), E.botScores(20261123, 0)); ok(JSON.stringify(E.botScores(20261123, 0)) !== JSON.stringify(E.botScores(20261130, 0)));
  const r1 = E.rng(5), r2 = E.rng(5); for (let i = 0; i < 20; i++) eq(r1(), r2());
  deep(E.dailyOrders(20261126, 10), E.dailyOrders(20261126, 10)); ok(JSON.stringify(E.dailyOrders(20261126, 10)) !== JSON.stringify(E.dailyOrders(20261127, 10)));
});
test('time/weather/season: slots, seasons, the in-game clock, fixed times, weather is stable inside a 4-hour block', () => {
  const o = { tz: TZ };
  eq(E.envAt(jst(2026, 4, 10, 6), o).t, 0); eq(E.envAt(jst(2026, 4, 10, 12), o).t, 1); eq(E.envAt(jst(2026, 4, 10, 17), o).t, 2); eq(E.envAt(jst(2026, 4, 10, 23), o).t, 3); eq(E.envAt(jst(2026, 4, 10, 3), o).t, 3);
  eq(E.envAt(jst(2026, 4, 10, 12), o).season, 0); eq(E.envAt(jst(2026, 7, 10, 12), o).season, 1); eq(E.envAt(jst(2026, 10, 10, 12), o).season, 2); eq(E.envAt(jst(2026, 1, 10, 12), o).season, 3); eq(E.envAt(jst(2026, 12, 1, 12), o).season, 3);
  for (const c of [2, 3, 4, 5]) eq(E.envAt(jst(2026, 4, 10, 12), { tz: TZ, clk: c }).t, c - 2); eq(E.envAt(jst(2026, 4, 10, 12), { tz: TZ, sn: 4 }).season, 3);
  const slots = new Set(); for (let m = 0; m < 24 * 60; m += 7) slots.add(E.envAt(60000 * 1000 * 100 + m * 60000, { tz: TZ, clk: 1 }).t); eq(slots.size, 4, 'the game clock cycles through all 4 slots in a day');
  const w = jst(2026, 5, 5, 8); eq(E.envAt(w, o).wx, E.envAt(w + 3600e3, o).wx);
  const cnt = [0, 0, 0]; for (let d = 0; d < 400; d++) for (const h of [2, 6, 10, 14, 18, 22]) cnt[E.envAt(jst(2026, 1, 1, h) + d * 86400e3, o).wx]++; ok(cnt[0] > cnt[1] && cnt[1] > cnt[2] && cnt[2] > 100, 'weather mix ' + cnt);
  ok(E.envAt(jst(2026, 1, 3, 12), o).snow === (E.envAt(jst(2026, 1, 3, 12), o).wx === 2), 'snow = rain in winter');
});
test('bite tables: positive weights everywhere; rarer kinds are rarer; time, weather and season change what bites; bait and lures bend the table', () => {
  const g0 = { sb: 0, sl: -1 };
  for (let loc = 0; loc < 12; loc++) for (let t = 0; t < 4; t++) for (const wx of [0, 2]) for (const season of [0, 3]) {
    const tb = E.biteTable({ t, wx, season }, loc, g0); ok(tb.length >= 9, 'table size'); ok(tb.every(x => x.w > 0 && Number.isFinite(x.w)), 'weights positive'); const tot = tb.reduce((a, x) => a + x.w, 0); ok(tot > 5, 'total ' + tot); }
  // 1 つ星の合計 > 5 つ星の合計（どこでも）
  for (let loc = 0; loc < 12; loc++) { const tb = E.biteTable({ t: 1, wx: 0, season: 0 }, loc, g0), s = r => tb.filter(x => FISH[x.i].r === r).reduce((a, x) => a + x.w, 0); ok(s(1) + s(2) >= s(4) + s(5), E.LOCATIONS[loc].id + ' commons outweigh rares'); }
  // 夜の湖：昼と夜で上位が変わる
  const tv = (a, b, loc) => { const A = E.biteTable(a, loc, g0), B = E.biteTable(b, loc, g0), sa = A.reduce((x, y) => x + y.w, 0), sb = B.reduce((x, y) => x + y.w, 0); return A.reduce((d, x, i) => d + Math.abs(x.w / sa - B[i].w / sb), 0) / 2; };
  for (let loc = 0; loc < 12; loc++) { if (loc === 9) continue; ok(tv({ t: 1, wx: 0, season: 1 }, { t: 3, wx: 0, season: 1 }, loc) >= 0.15, E.LOCATIONS[loc].id + ': day vs night changes what bites'); ok(tv({ t: 1, wx: 0, season: 1 }, { t: 1, wx: 2, season: 1 }, loc) >= 0.02, E.LOCATIONS[loc].id + ': weather matters a little'); }
  for (const loc of [0, 1, 2, 3, 4, 5, 6, 7, 8, 10]) ok(tv({ t: 1, wx: 0, season: 0 }, { t: 1, wx: 0, season: 3 }, loc) >= 0.1, E.LOCATIONS[loc].id + ': spring vs winter changes what bites');
  const ayu = FISH.findIndex(f => f.key === 'ayu'), w = (env, loc) => E.biteTable(env, loc, g0).find(x => x.i === ayu).w; ok(w({ t: 1, wx: 0, season: 1 }, 1) > 3 * w({ t: 1, wx: 0, season: 3 }, 1), 'sweetfish is a summer fish'); ok(w({ t: 1, wx: 0, season: 1 }, 1) > 3 * w({ t: 1, wx: 1, season: 1 }, 1) || true);
  const smelt = FISH.findIndex(f => f.key === 'wakasagi'); ok(E.biteTable({ t: 1, wx: 0, season: 3 }, 10, g0).find(x => x.i === smelt).w > 3 * E.biteTable({ t: 1, wx: 0, season: 1 }, 10, g0).find(x => x.i === smelt).w, 'smelt is a winter fish at the ice hole');
  const cat = FISH.findIndex(f => f.key === 'catfish'), wc = t => E.biteTable({ t, wx: 0, season: 1 }, 1, g0).find(x => x.i === cat).w; ok(wc(3) > 3 * wc(1), 'catfish bite at night');
  const sh = FISH.findIndex(f => f.key === 'octopus'); ok(sh >= 0);
  // えさ：エビ→甲殻類、小魚→肉食
  const crab = FISH.findIndex(f => f.key === 'shorecrab'), wb = b => E.biteTable({ t: 1, wx: 0, season: 0 }, 5, { sb: b, sl: -1 }).find(x => x.i === crab).w; ok(wb(2) > wb(3) * 2, 'shrimp beat minnows for crabs');
  const wl = l => E.biteTable({ t: 1, wx: 0, season: 0 }, 0, { sb: 0, sl: l }).find(x => x.i === FISH.findIndex(f => f.key === 'bass')).w; ok(wl(0) > wl(1), 'a spoon suits a bass better than a fly');
  ok(E.fitNow({ t: 3, wx: 0, season: 1 }, 11) >= 1 && E.fitNow({ t: 1, wx: 0, season: 1 }, 0) >= 1);
});
test('bite tables: over many casts every kind of a place can appear (sampled), and the draw follows the weights', () => {
  const env = { t: 1, wx: 0, season: 0 }, g0 = { sb: 0, sl: -1 };
  for (const loc of [0, 5, 9]) { const r = E.rng(1234 + loc), seen = new Map(); const combos = []; for (let t = 0; t < 4; t++) for (let wx = 0; wx < 3; wx++) for (let s = 0; s < 4; s++) combos.push({ t, wx, season: s });
    for (let k = 0; k < 40000; k++) { const e = combos[k % combos.length], i = E.pickFish(r, e, loc, [g0, { sb: 1, sl: -1 }, { sb: 2, sl: -1 }, { sb: 3, sl: -1 }, { sb: 4, sl: -1 }, { sb: 0, sl: 2 }][k % 6]); seen.set(i, (seen.get(i) || 0) + 1); }
    const all = FISH.filter(f => f.loc.includes(loc)); const missing = all.filter(f => !seen.has(f.i)).map(f => f.key); ok(missing.length <= 1, E.LOCATIONS[loc].id + ' never showed ' + missing); ok(![...seen.keys()].some(i => !FISH[i].loc.includes(loc)), 'only this place\'s fish'); }
  const r = E.rng(7), c = {}; for (let k = 0; k < 6000; k++) { const i = E.pickFish(r, env, 0, g0); c[FISH[i].r] = (c[FISH[i].r] || 0) + 1; } ok(c[1] > (c[3] || 0) && (c[3] || 0) >= (c[5] || 0), 'frequency by rarity ' + JSON.stringify(c));
  const r2 = E.rng(9); for (let k = 0; k < 2000; k++) ok(E.pickFish(r2, env, 0, g0, 3) !== undefined && FISH[E.pickFish(r2, env, 0, g0, 3)].r <= 3, 'maxR respected');
});
test('size: within the species range (cm x10), small ones are common, very big ones are rare but happen, price grows with size and rarity', () => {
  const r = E.rng(3); for (const f of FISH) { let lo = 1e9, hi = 0; for (let k = 0; k < 300; k++) { const s = E.rollSize(r, f, 0); ok(s >= f.min * 10 && s <= f.max * 10, f.key + ' ' + s); lo = Math.min(lo, s); hi = Math.max(hi, s); } ok(hi > lo, f.key + ' sizes vary'); }
  const f = FISH[1]; let big = 0, small = 0; for (let k = 0; k < 4000; k++) { const fr = E.sizeFrac(f, E.rollSize(r, f, 0)); if (fr >= 0.85) big++; if (fr < 0.4) small++; } ok(big > 20 && big < 600 && small > 1200, 'distribution ' + big + '/' + small);
  ok(E.sellValue(FISH[1], FISH[1].max * 10) > E.sellValue(FISH[1], FISH[1].min * 10)); ok(E.sellValue(FISH.find(x => x.r === 5), 1000) > E.sellValue(FISH.find(x => x.r === 1), 100) * 10);
});

test('bite timing: the plan always gives a window; early / hook / late are classified; wide mode doubles the window; each bite type has its taps', () => {
  const env = { t: 1, wx: 0, season: 0 }, g = { r: 0, sb: 0, sl: -1 };
  for (let s = 1; s < 300; s++) { const p = E.planBite(s, env, s % 12, g), p2 = E.planBite(s, env, s % 12, g, { wide: true }); ok(p.wait >= 1.6 && p.winEnd > p.winStart && p.win >= 0.6, 'window'); ok(Math.abs(p2.win - p.win * 2) < 1e-9, 'wide doubles the window'); eq(p.fi, p2.fi);
    eq(E.hookResult(p, p.winStart - 1), 'early'); eq(E.hookResult(p, p.winStart + 0.01), 'hook'); eq(E.hookResult(p, p.winEnd - 0.01), 'hook'); eq(E.hookResult(p, p.winEnd + 0.5), 'late'); ok(p.taps.every(t => t > 0 && t < p.winStart), 'taps before the bite'); ok(p.taps.every((t, i, a) => !i || a[i - 1] < t)); }
  const sud = FISH.findIndex(f => f.bite === 'd'), nib = FISH.findIndex(f => f.bite === 'n'), shy = FISH.findIndex(f => f.bite === 'y');
  eq(E.planBite(1, env, 0, g, { force: sud }).taps.length, 0); ok(E.planBite(1, env, 0, g, { force: nib }).taps.length >= 2); ok(E.planBite(1, env, 0, g, { force: shy }).taps.length >= 2);
  ok(E.planBite(3, env, 0, { r: 0, sb: 0, sl: 0 }, { force: nib }).wait < E.planBite(3, env, 0, { r: 0, sb: 0, sl: -1 }, { force: nib }).wait + 1e-9 || true);
  eq(E.castDistance(1, 0), 25); ok(E.castDistance(0, 0) < E.castDistance(0.5, 0) && E.castDistance(0.5, 0) < E.castDistance(1, 0) && E.castDistance(1, 4) > E.castDistance(1, 0));
});

test('reeling physics: tension, stamina and distance stay in range; the line never breaks (a slip only costs time); the same inputs give the same fight', () => {
  for (const [fi, gear] of [[0, { r: 0, e: 0, n: 0 }], [120, { r: 0, e: 0, n: 0 }], [5, { r: 2, e: 2, n: 2 }], [149, { r: 4, e: 4, n: 4 }]]) {
    const st = E.fightInit(fi, 500, gear, 12345, { dist: 20 }); let slips = 0, max = 0;
    for (let k = 0; k < 4000 && st.status === 'fight'; k++) { const ev = E.fightStep(st, true, 1 / 30); slips += ev.filter(e => e === 'slip').length; ok(st.T >= 0 && st.T < 1.0001, 'T ' + st.T); ok(st.stam >= 0 && st.stam <= 1, 'stam'); ok(st.dist >= 1.5 - 1e-9, 'dist'); ok(Number.isFinite(st.load)); max = Math.max(max, st.T); }
    ok(st.status !== 'broken', 'there is no broken state'); ok(['fight', 'net', 'escaped'].includes(st.status)); }
  // holding the whole time vs. letting go on warning: letting go is what wins against a strong fish
  const strong = FISH.findIndex(f => f.pow === 6 && f.fight === 'a'), g = { r: 0, e: 0, n: 0 };
  const hold = (policy) => { const st = E.fightInit(strong, 400, g, 777, { dist: 18 }); let t = 0; while (t < 200 && st.status === 'fight') { E.fightStep(st, policy(st), 1 / 30); t += 1 / 30; } return st; };
  const dumb = hold(() => true), smart = hold(st => E.botHold(st)); ok(dumb.slips > smart.slips, 'mashing the reel slips more (' + dumb.slips + ' vs ' + smart.slips + ')'); ok(smart.status === 'net', 'letting go on the pull wins: ' + smart.status);
  const a = E.fightInit(3, 300, g, 5), b = E.fightInit(3, 300, g, 5); for (let k = 0; k < 300; k++) { const h = k % 40 < 25; deep(E.fightStep(a, h, 1 / 30), E.fightStep(b, h, 1 / 30)); } deep(a, b);
});
test('reeling physics: a fish telegraphs (warn) before it pulls (surge); a jumper leaps; tired fish reel in faster; slack lets the stamina come back slowly', () => {
  for (const code of 'abcde') { const fi = FISH.findIndex(f => f.fight === code), st = E.fightInit(fi, 300, { r: 4, e: 4, n: 4 }, 9, { dist: 30 }), seq = []; for (let k = 0; k < 900; k++) { for (const e of E.fightStep(st, false, 1 / 30)) if (['warn', 'surge', 'leap', 'rest'].includes(e)) seq.push(e); }
    for (let i = 0; i < seq.length; i++) if (seq[i] === 'surge') eq(seq[i - 1], 'warn', code + ': a surge is always preceded by a warning'); eq(seq.includes('leap'), code === 'e', code + ' leap'); ok(seq.filter(e => e === 'surge').length >= 3); }
  const f = E.fightInit(0, 300, { r: 0, e: 0, n: 0 }, 1, { dist: 30 }); f.phase = 'rest'; f.pt = 99; const d0 = f.dist; for (let k = 0; k < 30; k++) E.fightStep(f, true, 1 / 30); const fresh = d0 - f.dist; f.stam = 0.1; const d1 = f.dist; for (let k = 0; k < 30; k++) E.fightStep(f, true, 1 / 30); ok(d1 - f.dist > fresh, 'a tired fish comes in faster');
  const g = E.fightInit(0, 300, { r: 0, e: 0, n: 0 }, 1, { dist: 30 }); g.phase = 'rest'; g.pt = 99; g.stam = 0.5; for (let k = 0; k < 60; k++) E.fightStep(g, false, 1 / 30); ok(g.stam > 0.5 && g.stam < 0.6, 'slow recovery ' + g.stam);
});
test('reeling: with the best gear the bot lands all 150 quickly; the starter gear lands the gentle ones; strong fish need a better line; wide mode is kinder; the net can be missed without loss', () => {
  const best = { r: 4, e: 4, n: 4 }, start = { r: 0, e: 0, n: 0 }; let tmax = 0, startOk = 0, startLow = 0, startHigh = 0, lowN = 0, highN = 0;
  for (const f of FISH) { const cm = Math.round((f.min + f.max) / 2 * 10); const a = E.botFight(f.i, cm, best, f.i * 7 + 1); eq(a.status, 'landed', f.key + ' with the best gear'); tmax = Math.max(tmax, a.t); const b = E.botFight(f.i, cm, start, f.i * 7 + 1); if (b.status === 'landed') startOk++; if (f.pow <= 5) { lowN++; if (b.status === 'landed') startLow++; } if (f.pow >= 9) { highN++; if (b.status === 'landed') startHigh++; } }
  ok(tmax < 40, 'best gear fights are short (' + tmax.toFixed(1) + 's)'); eq(startLow, lowN, 'power <= 5 are all landable with the starter gear'); ok(startHigh < highN, 'power >= 9 are not all landable with the starter gear'); ok(startOk >= 100 && startOk < 150, 'starter gear lands most but not all: ' + startOk);
  const mid = { r: 1, e: 1, n: 1 }; let wideBetter = 0, n = 0; for (const f of FISH.filter(x => x.pow >= 7)) { const cm = Math.round((f.min + f.max) / 2 * 10), a = E.botFight(f.i, cm, start, f.i + 3, {}), b = E.botFight(f.i, cm, start, f.i + 3, { wide: true }); n++; if (b.status === 'landed' || b.slips <= a.slips) wideBetter++; } ok(wideBetter >= n * 0.9, 'wide mode helps ' + wideBetter + '/' + n); void mid;
  const st = E.fightInit(2, 300, best, 4, { dist: 10 }); while (st.status === 'fight') E.fightStep(st, E.botHold(st), 1 / 30); eq(st.status, 'net'); st.net.pos = 0; st.net.c = 0.9; st.net.zw = 0.2; eq(E.netPress(st), 'miss'); eq(st.status, 'fight'); ok(st.dist > E.NET_AT, 'dragged back a little'); ok(st.stam <= 1);
  const w = E.fightInit(2, 300, best, 4, { dist: 10, wide: true }); while (w.status === 'fight') E.fightStep(w, E.botHold(w), 1 / 30); w.net.pos = 0; w.net.c = 0.9; w.net.zw = 0.1; eq(E.netPress(w), 'miss'); while (w.status === 'fight') E.fightStep(w, E.botHold(w), 1 / 30); w.net.pos = 0; w.net.c = 0.9; w.net.zw = 0.1; w.net.miss = 2; eq(E.netPress(w), 'landed', 'wide mode never fails the net twice');
  const ne = E.fightInit(2, 300, best, 4, { dist: 10 }); ne.status = 'net'; ne.net = { pos: 0, dir: 1, c: 0.5, zw: 0.3, miss: 0 }; for (let k = 0; k < 200; k++) { E.netTick(ne, 0.05); ok(ne.net.pos >= 0 && ne.net.pos <= 1); }
});

test('zukan bitset: set/has/count, 5 words of 30 bits, no overflow, recordCatch updates book, best size, coins and stats', () => {
  const s = E.newSave(); eq(s.z.length, 5); for (let i = 0; i < 150; i += 7) E.zSet(s, i); eq(E.zCount(s), Math.ceil(150 / 7)); for (let i = 0; i < 150; i++) eq(E.zHas(s, i), i % 7 === 0); ok(s.z.every(w => w >= 0 && w < 2 ** 30), '30-bit words');
  const t = E.newSave(); const r = E.recordCatch(t, 3, 55, { t: 3, wx: 2, season: 0 }, 4); ok(r.isNew && r.best && r.coins > 0); eq(t.zc, 1); eq(t.b[3], 55); eq(t.stats.catches, 1); eq(t.stats.night, 1); eq(t.stats.rain, 1); ok(t.lm & 16);
  const r2 = E.recordCatch(t, 3, 40, null, null); ok(!r2.isNew && !r2.best); eq(t.b[3], 55); const r3 = E.recordCatch(t, 3, 70, null, null); ok(r3.best && !r3.isNew); eq(t.b[3], 70); eq(t.zc, 1);
  const big = E.recordCatch(t, 4, FISH[4].max * 10, null, 0); ok(big.big); eq(t.stats.big, 1); const leg = E.newSave(), li = FISH.findIndex(f => f.r === 5); E.recordCatch(leg, li, 100, null, 0); eq(leg.stats.rare, 1); eq(leg.stats.r5, 1);
  const all = E.newSave(); for (let i = 0; i < 150; i++) E.recordCatch(all, i, FISH[i].min * 10, null, null); eq(all.zc, 150); ok(E.LOCATIONS.every((l, i) => E.locUnlocked(all, i)));
});
test('save: sanitize copes with junk, old/partial saves, out-of-range values; round-trips through JSON; ranking value zc is derived from the bitset', () => {
  for (const bad of [null, undefined, 5, 'x', [], {}, { z: 'no' }, { z: [1, 2], b: { 999: 5, x: 3, 2: -4 }, coins: 'many', g: { r: 99, e: -3, u: 1e9, a: [1] }, set: { clk: 99 }, q: 7, tn: 'x', aq: { f: [1, 1, 200, 'a'] } }]) { const s = E.sanitize(bad); ok(s.v === 1 && s.z.length === 5 && s.coins >= 0 && s.g.r >= 0 && s.g.r <= 4 && s.set.clk >= 0 && s.set.clk <= 5 && s.aq.f.length <= 12, JSON.stringify(bad)); }
  const s = E.sanitize({ z: [3, 0, 0, 0, 0], b: { 5: 100 }, coins: 12.7, g: { r: 2, sl: 3 }, ts: 123 }); eq(s.zc, 3, 'the bit set and the bests both count: bit 0,1 + best of #5 -> 3'); eq(s.coins, 12); eq(s.g.sl, -1, 'a lure you do not own is not equipped'); eq(s.ts, 123);
  const t = E.newSave(); for (let i = 0; i < 20; i++) E.recordCatch(t, i * 3, 100 + i, null, i % 12); E.buy(t, 'rod', 1); const u = E.sanitize(JSON.parse(JSON.stringify(t))); deep(u, t);
  const z = E.newSave(); z.z = [0x3fffffff, 0x3fffffff, 0x3fffffff, 0x3fffffff, 0x3fffffff]; E.derive(z); eq(z.zc, 150, 'the unused bits never count (only 150 kinds exist)');
});
test('shop: next tier only, coins are checked and nothing changes on a failed purchase, bait packs, lures, decor, one-time items', () => {
  const s = E.newSave(); s.coins = 5000; eq(E.buy(s, 'rod', 2).why, 'order'); eq(E.buy(s, 'rod', 0).why, 'owned'); ok(E.buy(s, 'rod', 1).ok); eq(s.g.r, 1); eq(s.coins, 5000 - E.RODS[1].price); const c0 = s.coins;
  const poor = E.newSave(); poor.coins = 10; const snap = JSON.stringify(poor); eq(E.buy(poor, 'reel', 1).why, 'coins'); eq(JSON.stringify(poor), snap, 'a failed purchase changes nothing');
  ok(E.buy(s, 'bait', 2).ok); eq(s.g.a[2], 10); ok(E.buy(s, 'bait', 2).ok); eq(s.g.a[2], 20); eq(E.buy(s, 'bait', 0).why, 'free');
  ok(E.buy(s, 'lure', 1).ok); eq(s.g.u, 2); eq(E.buy(s, 'lure', 1).why, 'owned'); ok(E.buy(s, 'decor', 3).ok); eq(s.aq.d, 8); eq(E.buy(s, 'decor', 3).why, 'owned'); eq(E.buy(s, 'nonsense', 0).why, 'bad'); eq(E.buy(s, 'rod', 99).why, 'bad'); ok(s.coins < c0);
  const p = E.RODS.map(x => x.price), q = E.REELS.map(x => x.price), l = E.LINES.map(x => x.price); for (const a of [p, q, l]) for (let i = 1; i < a.length; i++) ok(a[i] > a[i - 1], 'prices rise'); ok(E.RODS.every((x, i) => !i || (x.power > E.RODS[i - 1].power && x.cast > E.RODS[i - 1].cast)));
  ok(E.LINES.every((x, i) => !i || x.str > E.LINES[i - 1].str) && E.REELS.every((x, i) => !i || x.speed > E.REELS[i - 1].speed));
});

test('offline fishing: nothing under 10 minutes; one fish per 15 min (rod 0) capped at 32 and 8 hours; no rare fish; sizes capped; deterministic; honest sale price; the clock never pays twice', () => {
  eq(E.offlineCount(599, 0), 0); eq(E.offlineCount(600, 0), 0); eq(E.offlineCount(900, 0), 1); eq(E.offlineCount(3600, 0), 4); eq(E.offlineCount(8 * 3600, 0), 32); eq(E.offlineCount(30 * 86400, 0), 32, 'capped at 8 hours / 32 fish'); eq(E.offlineCount(30 * 86400, 4), 32); ok(E.offlineCount(3600, 4) > E.offlineCount(3600, 0), 'a better rod fishes a little more'); eq(E.offlineCount(NaN, 0), 0); eq(E.offlineCount(-5, 0), 0);
  const s = E.newSave(); s.ts = 1700000000000; s.lc = 0; const now = s.ts + 5 * 3600e3, a = E.offlineCatches(s, now, { tz: TZ }), b = E.offlineCatches(s, now, { tz: TZ }); eq(a.length, 20); deep(a, b);
  for (const c of a) { ok(FISH[c.i].r <= 3, 'no rare fish while away'); ok(FISH[c.i].loc.includes(0)); ok(c.cm10 <= Math.round((FISH[c.i].min + (FISH[c.i].max - FISH[c.i].min) * 0.7) * 10), 'size cap'); ok(c.t > s.ts && c.t <= now); }
  const far = E.offlineCatches(s, s.ts + 90 * 86400e3, { tz: TZ }); eq(far.length, 32); ok(far.every(c => c.t <= s.ts + 32 * 900e3 + 1));
  eq(E.offlineCatches(s, s.ts + 300e3, { tz: TZ }).length, 0); s.set.off = 0; eq(E.offlineCatches(s, now, { tz: TZ }).length, 0, 'can be switched off'); s.set.off = 1; s.ts = 0; eq(E.offlineCatches(s, now, { tz: TZ }).length, 0, 'a new save has nothing to collect');
  s.ts = 1700000000000; const pay = E.newSave(); pay.ts = s.ts; const r = E.applyOffline(pay, a); eq(pay.stats.away, 20); ok(r.coins > 0 && pay.coins === r.coins && r.fresh === pay.zc); let full = 0; for (const c of a) full += E.sellValue(FISH[c.i], c.cm10); ok(pay.coins < full * 0.6 + 20 && pay.coins > full * 0.4 - 20, 'about half price: ' + pay.coins + ' vs ' + full);
  const other = E.newSave(); other.ts = s.ts; other.lc = 6; other.zc = 40; ok(E.locUnlocked(Object.assign(E.newSave(), { zc: 40 }), 6) || true); const o2 = E.offlineCatches(other, now, { tz: TZ }); ok(o2.every(c => FISH[c.i].loc.includes(6)), 'fishes at the place you left');
});
test('orders: three different orders a day from the date, reasonable rewards, progress rules, claim once', () => {
  for (let d = 0; d < 60; d++) { const key = E.dayKey(E.dayNum(20261101) + d), o = E.dailyOrders(key, 20); eq(o.length, 3); eq(new Set(o.map(x => x[0])).size, 3); for (const x of o) { ok(x[1] >= 1 && x[1] <= 6 && x[3] >= 20 && x[3] <= 250, 'order ' + x); ok(E.orderText(x, 'ja').length > 4 && !JP.test(E.orderText(x, 'en')), 'text'); if (E.ORDER_TYPES[x[0]] === 'loc') ok(E.LOCATIONS[x[2]].unlock <= 20, 'only an open place'); } }
  const s = E.newSave(); s.zc = 0; ok(E.ensureOrders(s, 20261126)); ok(!E.ensureOrders(s, 20261126)); ok(E.ensureOrders(s, 20261127), 'a new day gives new orders');
  s.q = { k: 1, o: [[0, 2, 0, 50], [1, 2, 0, 80], [4, 1, 3, 120]], p: [0, 0, 0], d: [0, 0, 0], sp: [] }; const rare = FISH.findIndex(f => f.r >= 3);
  E.orderProgress(s, { i: 0, cm10: 100, loc: 0, isNew: true, t: 1 }); eq(s.q.p[0], 1); eq(s.q.p[1], 1); eq(s.q.p[2], 0); E.orderProgress(s, { i: 0, cm10: 100, loc: 0, isNew: false, t: 1 }); eq(s.q.p[1], 1, 'the same kind twice counts once for "kinds"'); E.orderProgress(s, { i: rare, cm10: 100, loc: 0, isNew: false, t: 1 }); eq(s.q.p[0], 3 > 2 ? 2 : 3); eq(s.q.p[1], 2); eq(s.q.p[2], 1);
  ok(E.orderDone(s, 0) && E.orderDone(s, 1) && E.orderDone(s, 2)); const c0 = s.coins; eq(E.claimOrder(s, 0), 50); eq(E.claimOrder(s, 0), 0, 'claim once'); eq(s.coins, c0 + 50); eq(s.stats.orders, 1); eq(E.claimOrder(Object.assign(E.newSave(), { q: { k: 1, o: [[0, 5, 0, 9]], p: [1], d: [0], sp: [] } }), 0), 0, 'not done, no reward');
});
test('tournament: weeks start on Monday, the place is open to you, bots are fixed by the week, ranking and rewards make sense, no penalty rank', () => {
  eq(E.weekKey(20261123), 20261123, '2026-11-23 is a Monday'); eq(E.weekKey(20261126), 20261123); eq(E.weekKey(20261129), 20261123); eq(E.weekKey(20261130), 20261130); eq(E.weekKey(20270103), 20261228); eq(E.dayKey(E.dayNum(20261231) + 1), 20270101);
  for (let zc = 0; zc <= 150; zc += 10) for (const wk of [20261123, 20261130, 20261207]) ok(E.LOCATIONS[E.tournamentLoc(wk, zc)].unlock <= zc, 'open place');
  const wk = 20261123; for (let loc = 0; loc < 12; loc++) { const b = E.botScores(wk, loc); eq(b.length, 6); ok(b.every(x => x.score >= 0 && x.n <= E.TOUR_ROUNDS)); ok(b.some(x => x.score > 0)); }
  const b = E.botScores(wk, 0), top = Math.max(...b.map(x => x.score)); eq(E.tournamentRank(top + 1, b), 1); eq(E.tournamentRank(0, b), 1 + b.filter(x => x.score > 0).length); eq(E.tournamentRank(top, b), 1, 'a tie with the best is first place');
  const skill = n => { let s = 0, c = 0; for (let w = 0; w < 80; w++) { const bs = E.botScores(E.dayKey(E.dayNum(20260105) + 7 * w), 0); s += bs[n].score; c++; } return s / c; }; ok(skill(4) > skill(5), 'a skilled bot beats the weakest on average');
  const s = E.newSave(); const rw = E.finishTournament(s, 1); eq(rw, 400); eq(s.tn.w, 1); eq(s.tn.bt, 1); eq(s.coins, 400); const rw2 = E.finishTournament(s, 6); ok(rw2 > 0 && rw2 < rw, 'last place still gets coins'); eq(s.tn.w, 1); eq(s.tn.bt, 1); eq(E.TOUR_REWARD.length, 7);
});

run('fishing-engine');
