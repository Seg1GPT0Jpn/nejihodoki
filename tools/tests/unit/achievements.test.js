// P3-3：実績の定義と判定、称号、トースト、公開プロフィール（kbProfiles）の単体テスト。node だけ。
// 実行：node tools/tests/unit/achievements.test.js
'use strict';
const path = require('path');
const fs = require('fs');
const { fresh, test, eq, ok, deep, run, FakeStorage, fixedNow, fixture, readText, COMMON, ROOT } = require('./_kobo-env');

const H = 3600000, DAY = 86400000, MIN = 60000;
const jst = (y, m, d, hh = 0, mm = 0, ss = 0) => Date.UTC(y, m - 1, d, hh, mm, ss) - 9 * H;
const T0 = jst(2026, 11, 4, 12);

function load(init, opt = {}) {
  const storage = init instanceof FakeStorage ? init : new FakeStorage(Object.assign({ 'kobo.dev': 'testdev' }, init || {}));
  const m = fresh({ storage, files: ['games', 'platform'] });
  if (opt.ui) { globalThis.KoboUI = opt.ui; globalThis.document = { body: {} }; } else { delete globalThis.KoboUI; }
  delete require.cache[path.join(COMMON, 'achievements.js')]; delete globalThis.KoboAchievements;
  const A = require(path.join(COMMON, 'achievements.js'));
  return { P: m.platform, R: m.games, A, storage };
}
const ids = o => Object.keys(o).sort();
function play(P, g, o = {}) {
  const t = o.t != null ? o.t : Date.now(), dur = o.dur != null ? o.dur : 60000;
  fixedNow(t - dur);
  P.emit('play_start', { game: g, mode: o.mode || 'normal', t: t - dur, dateKey: o.dateKey });
  if (o.stageClear) P.emit('stage_clear', Object.assign({ game: g }, o.stageClear));
  if (o.progress) P.emit('progress', Object.assign({ game: g }, o.progress));
  fixedNow(t);
  P.emit('play_end', Object.assign({ game: g, mode: o.mode || 'normal', score: o.score || 0, durationMs: dur, wallMs: dur, reason: o.reason || 'over', dateKey: o.dateKey, t }, o.extra || {}));
}

// ------------------------------------------------------------------ 定義
test('definitions: ≥15 global, ≥5 per game (plus the automatic .first), unique ids ≤24 chars, ja+en, tiers, XP', () => {
  const { A, R } = load();
  const all = A.all();
  ok(A.global().length >= 15, 'global ' + A.global().length);
  for (const g of R.games) {
    const own = A.forGame(g.id).filter(d => !d.auto);
    ok(own.length >= 5, g.id + ' has ' + own.length);
    ok(A.def(g.id + '.first'), g.id + '.first');
    eq(g.flags.achievements, true, g.id + ' flags.achievements');
  }
  const seen = new Set();
  for (const d of all) {
    ok(!seen.has(d.id), 'dup ' + d.id); seen.add(d.id);
    ok(/^[a-z0-9]+(\.[A-Za-z0-9]+)+$/.test(d.id) && d.id.length <= 24, 'id ' + d.id);
    ok(d.title && d.title.ja && d.title.en && d.desc && d.desc.ja && d.desc.en, 'texts ' + d.id);
    ok(!/[぀-ヿ一-龯]/.test(d.title.en + d.desc.en), 'english has no Japanese: ' + d.id);
    ok(d.tier >= 1 && d.tier <= 4, 'tier ' + d.id); eq(d.xp, A.TIER_XP[d.tier], 'xp ' + d.id);
    ok(d.when && typeof d.when === 'object', 'when ' + d.id);
    if (d.grantsTitle) ok(d.grantsTitle.ja && d.grantsTitle.en && d.grantsTitle.ja.length <= 24, 'title ' + d.id);
    if (d.game) eq(d.id.split('.')[0], d.game, 'prefix ' + d.id);
  }
  // names the task asked for
  for (const ja of ['はじめの一歩', 'パズルマスター', '挑戦者', '常連プレイヤー', '工房の達人']) ok(all.some(d => d.title.ja === ja), ja);
  ok(all.some(d => d.hidden), 'some secret achievements');
});

test('definitions use real data: rec keys are registry keys, icons exist in KoboUI, event fields are emitted by the page', () => {
  const { A, R } = load();
  const ui = readText('common/ui.js');
  const icons = new Set([...ui.matchAll(/^\s{4}(\w+): '</gm)].map(m => m[1]));
  const walk = (w, f) => { if (!w) return; if (w.any || w.all) (w.any || w.all).forEach(x => walk(x, f)); else f(w); };
  for (const d of A.all()) {
    ok(icons.has(d.icon), d.id + ' icon ' + d.icon);
    walk(d.when, w => {
      if (w.rec) {
        const g = d.game ? R.byId(d.game) : null;
        ok(!g || Object.prototype.hasOwnProperty.call(g.keys, w.rec.key), d.id + ' key ' + w.rec.key);
      }
      if (w.ev && d.game) {
        const page = readText(R.byId(d.game).path + 'index.html');
        ok(page.includes("'" + w.ev + "'"), d.id + ' page emits ' + w.ev);
        if (w.field && w.field.startsWith('stats.')) ok(new RegExp('stats[^\\n]*\\b' + w.field.slice(6) + '\\b').test(page), d.id + ' page reports ' + w.field);
        if (w.key) ok(page.includes("'" + w.key + "'"), d.id + ' progress key ' + w.key);
      }
    });
  }
});

// ------------------------------------------------------------------ さかのぼり（9本の fixtures）
const FIX = {
  'neji-maxlevel-only.json': { has: ['neji.first', 'neji.lv10', 'all.first'], not: ['neji.lv30'] },
  'blocks-best.json': { has: ['blocks.first', 'blocks.s1k'], not: ['blocks.s10k'] },
  'drop-best.json': { has: ['drop.first', 'drop.s5k'], not: ['drop.s30k'] },
  'raft-best.json': { has: ['raft.first', 'raft.d5', 'raft.d15'], not: ['raft.d30'] },
  'gates-v2.json': { has: ['gates.first', 'gates.st5', 'gates.star1'], not: ['gates.runs50', 'gates.st15', 'gates.hq5', 'gates.hero10'] },
  'gates-2d-old.json': { has: ['gates.first', 'gates.st5'], not: ['gates.st15'] },
  'n59049-best.json': { has: ['n59049.first', 'n59049.s10k', 'n59049.t243'], not: ['n59049.t2187', 'n59049.s100k'] },
  'water-save.json': { has: ['water.first', 'water.star3'], not: ['water.st10', 'water.stars20'] },
  'water-level-only.json': { has: ['water.first'], not: ['water.st10'] },
  'parking-save.json': { has: ['parking.first', 'parking.star3'], not: ['parking.st10', 'parking.stars20'] },
  'hole-no-camp.json': { has: ['hole.first', 'hole.win1'], not: ['hole.win10', 'hole.camp10', 'hole.skins4', 'hole.pts1k'] },
  'hitsumabushi-save.json': { has: ['hitsumabushi.first', 'hitsumabushi.day1', 'hitsumabushi.s300', 'hitsumabushi.perfect', 'hitsumabushi.rank2'], not: ['hitsumabushi.s1k', 'hitsumabushi.dish100', 'hitsumabushi.usual3', 'hitsumabushi.rank4'] },
  'planet-save.json': { has: ['planet.first', 'planet.life', 'planet.goe', 'planet.sc1'], not: ['planet.civ', 'planet.space', 'planet.sc8', 'planet.pts5k', 'planet.thaw'] },
  'hitblow-save.json': { has: ['hitblow.first', 'hitblow.win1', 'hitblow.fast4', 'hitblow.cpu3', 'hitblow.streak3'], not: ['hitblow.win5', 'hitblow.dup', 'hitblow.lucky', 'hitblow.wins30', 'hitblow.s3k'] },
  'shogi-save.json': { has: ['shogi.first', 'shogi.win1', 'shogi.lv3', 'shogi.top1', 'shogi.on1', 'shogi.mate1'], not: ['shogi.lv4', 'shogi.on10', 'shogi.mate8'] },
  'escape-save.json': { has: ['escape.first', 'escape.r1', 'escape.nohint', 'escape.rankS'], not: ['escape.r3', 'escape.all', 'escape.fast3', 'escape.t4k'] },
  'hub-records.json': { has: ['all.variety6', 'all.varietyAll', 'neji.lv10', 'blocks.s1k', 'raft.d15', 'n59049.s10k', 'gates.st5', 'hole.first', 'hitsumabushi.first', 'planet.first', 'hitblow.first', 'shogi.first', 'escape.first'], not: ['water.st10', 'hole.win1'] },
};
test('retroactive: fixture saves for every game unlock exactly what the records show, once, marked as retroactive', () => {
  const games = new Set();
  for (const [file, exp] of Object.entries(FIX)) {
    const fx = fixture('saves/' + file);
    const { P, A } = load(fx.storage);
    fixedNow(T0);
    const got = A.retro();
    const u = A.unlocked();
    for (const id of exp.has) ok(u[id] > 0, file + ': ' + id);
    for (const id of exp.not) ok(!u[id], file + ': not ' + id);
    exp.has.forEach(id => { const g = id.split('.')[0]; if (g !== 'all') games.add(g); });
    eq(got.length, Object.keys(u).length, file + ' all from this run');
    const x = P.store.get('kobo.xp');
    for (const id of Object.keys(u)) { eq(x.r[id], 1, file + ' retro flag ' + id); ok(x.a[id] > 0, file + ' xp ' + id); }
    const sum = Object.keys(u).reduce((s, id) => s + A.def(id).xp, 0);
    eq(P.xp.total(T0), sum, file + ' total XP = achievement XP'); eq(P.xp.totals(T0).week, 0, file + ' not in weekly XP');
    // idempotent: again (retro and live) → nothing new, nothing changes
    const before = JSON.stringify([P.store.get('kobo.ach'), P.store.get('kobo.xp')]);
    eq(A.retro().length, 0); eq(A.evaluate({ live: true }).length, 0); eq(A.evaluate({}).length, 0);
    eq(JSON.stringify([P.store.get('kobo.ach'), P.store.get('kobo.xp')]), before, file + ' idempotent');
    ok(P.migrations.done('ach-retro-1'));
  }
  eq(games.size, require(path.join(COMMON, 'games.js')).ids().length, 'all games covered: ' + [...games].join());
});

test('retroactive: richer saves (stars, camp, heroes, daily streak, vs stats, history)', () => {
  const stars = {}; for (let i = 1; i <= 25; i++) stars[i] = 3;
  const nd = { 20261028: 2, 20261029: 3, 20261030: 1, 20261031: 1, 20261101: 2, 20261102: 3, 20261103: 1 };
  const { P, A } = load({
    'nejihodoki3d.maxLevel': 101, 'nejihodoki3d.stars': stars, 'nejihodoki3d.daily': nd,
    'kusoge.water.save': { level: 60, best: 61, stars },
    'kusoge.parking.save': { level: 3, best: 12, stars: { 1: 3, 2: 2 } },
    'kusoge.gates.save': { v: 2, best: 31, stage: 31, bld: { hq: 6 }, heroes: { ren: { lv: 11, star: 1, cards: 0 }, mina: { lv: 2, star: 0, cards: 0 } }, runs: 60 },
    'kusoge.hole.save': { best: { matchRank: 1, matchPts: 900, maxPts: 1500, maxSize: 14 }, skins: { owned: ['kuro', 'sakura', 'mint', 'lemon'], sel: 'mint' }, wins: 12, camp: { open: 10, stars: [3, 3, 3, 3, 3, 3, 3, 3, 3, 3], best: [] }, online: { plays: 4, wins: 1 } },
    'kusoge.n59049.bestTile': '59049', 'kusoge.n59049.best': '2000000',
    'kusoge.vs.stats': { blocks: { plays: 7, wins: 6, best: 1 }, drop: { plays: 3, wins: 3 } },
    'kobo.history': [{ g: 'blocks', t: jst(2026, 11, 3, 2, 30), d: 40 * MIN, s: 60000, m: 'normal' }],
  });
  fixedNow(T0);
  A.retro();
  const u = A.unlocked();
  for (const id of ['neji.lv100', 'neji.perfect20', 'neji.stars50', 'neji.daily7', 'all.streak7', 'all.daily1', 'water.st50', 'water.stars20', 'water.star3',
    'parking.st10', 'parking.star3', 'gates.st30', 'gates.hq5', 'gates.hero10', 'gates.star1', 'gates.runs50', 'hole.win10', 'hole.pts1k', 'hole.size12',
    'hole.camp10', 'hole.camp30', 'hole.skins4', 'hole.online1', 'n59049.t59049', 'n59049.s1m', 'all.vs1', 'all.vsWin10', 'blocks.s50k', 'all.night', 'all.marathon', 'all.ach10'])
    ok(u[id] > 0, id);
  ok(!u['water.st100'] && !u['all.streak7x'], 'thresholds respected');
  ok(!u['all.dailyAll'], 'neji alone is not every daily');
});

// ------------------------------------------------------------------ 遊んでいるとき（live）
test('live: events unlock achievements (counted in weekly XP), stats-based ones from the payload, no double awards', () => {
  const { P, A } = load();
  fixedNow(T0); A.retro();
  const seen = []; A.on(x => seen.push(x.id)); const pe = []; P.on('achievement', x => pe.push(x.id));
  play(P, 'blocks', { t: T0, dur: 2 * MIN, score: 1200, extra: { stats: { maxCombo: 6, lines: 12 } } });
  for (const id of ['all.first', 'blocks.first', 'blocks.s1k', 'blocks.combo5']) ok(A.has(id), id);
  ok(!A.has('blocks.lines50'));
  deep(seen.slice().sort(), pe.slice().sort());
  const x = P.store.get('kobo.xp'); ok(!x.r['blocks.combo5'], 'live, not retro');
  const wk = P.xp.totals(T0).week; ok(wk >= 10 + 10 + 10 + 25 + 11, 'weekly XP includes live achievements: ' + wk);
  const n = seen.length;
  play(P, 'blocks', { t: T0 + 5 * MIN, dur: 2 * MIN, score: 1300, extra: { stats: { maxCombo: 7, lines: 1 } } });
  eq(seen.length, n, 'nothing twice');
  // versus does not count for score achievements, but counts as a play
  play(P, 'drop', { t: T0 + 10 * MIN, dur: 2 * MIN, mode: 'versus', score: 999999 });
  ok(!A.has('drop.s5k')); ok(A.has('drop.first'));
  // stage_clear with ★3 (water) and the 59049 progress event (n59049)
  play(P, 'water', { t: T0 + 20 * MIN, dur: 40000, reason: 'clear', stageClear: { stage: 1, stars: 3 } });
  ok(A.has('water.star3'));
  play(P, 'n59049', { t: T0 + 30 * MIN, dur: 5 * MIN, progress: { key: 'tile59049', value: 1 } });
  ok(A.has('n59049.t59049'));
  play(P, 'n59049', { t: T0 + 40 * MIN, dur: 5 * MIN, mode: 'practice', progress: { key: 'tile59049', value: 1 } });
});

test('live: daily streak across JST days, all-dailies-in-one-day, level and meta achievements', () => {
  const { P, A } = load();
  let t = jst(2026, 11, 1, 23, 0);
  for (let i = 0; i < 3; i++) { const dk = P.jstDateKey(t); play(P, 'blocks', { t, dur: MIN, mode: 'daily', dateKey: dk, score: 5 }); t += DAY; }
  ok(A.has('all.daily1')); ok(A.has('all.streak3')); ok(!A.has('all.streak7'));
  const dk = P.jstDateKey(t);
  for (const g of ['neji', 'blocks', 'drop', 'n59049', 'water', 'parking', 'hitsumabushi', 'hitblow']) play(P, g, { t: t += MIN, dur: MIN, mode: 'daily', dateKey: dk, score: 5, reason: 'clear' });
  ok(A.has('all.dailyAll'));
  ok(A.has('all.ach10'), 'meta achievement after 10 unlocks');
  ok(P.xp.info(t).lv >= 2);
});

test('determinism: the same saves give the same unlocks in any order of loading', () => {
  const init = fixture('saves/hub-records.json').storage;
  const a = load(init); fixedNow(T0); a.A.retro(); const ua = ids(a.A.unlocked());
  const b = load(init); fixedNow(T0 + DAY); b.A.evaluate({ live: false }); b.A.evaluate({ live: false }); const ub = ids(b.A.unlocked());
  deep(ua, ub);
});

test('multi-device: unlocks merge as a union (earliest time), XP from them once, retro on a second device is not re-awarded', () => {
  const A1 = load({ 'kobo.dev': 'device1', 'kusoge.blocks.best': '15000' }); fixedNow(T0); A1.A.retro();
  const snapA = { ach: A1.storage.getItem('kobo.ach'), xp: A1.storage.getItem('kobo.xp') };
  const B1 = load({ 'kobo.dev': 'device2', 'kusoge.drop.best': '6000' }); fixedNow(T0 + H); B1.A.retro();
  const m = B1.P.merge;
  const ach = m.ach(snapA.ach, B1.storage.getItem('kobo.ach')), xp = m.xp(snapA.xp, B1.storage.getItem('kobo.xp'));
  const C = load({ 'kobo.dev': 'device3', 'kusoge.blocks.best': '15000', 'kusoge.drop.best': '6000', 'kobo.ach': ach, 'kobo.xp': xp });
  fixedNow(T0 + 2 * H);
  const got = C.A.retro().map(x => x.id);
  ok(!got.includes('blocks.s10k') && !got.includes('drop.s5k') && !got.includes('all.first'), 'already unlocked elsewhere: ' + got);
  eq(C.A.unlocked()['all.first'], T0, 'earliest time');
  const expect = ids(C.A.unlocked()).reduce((s, id) => s + C.A.def(id).xp, 0);
  eq(C.P.xp.total(T0 + 2 * H), expect, 'each achievement counted once');
});

// ------------------------------------------------------------------ 表示・称号・進み具合
test('hidden achievements show ??? until unlocked; names and descriptions in ja and en', () => {
  const { P, A } = load();
  eq(A.name('all.night', 'ja'), '？？？'); eq(A.desc('all.night'), 'ひみつの実績');
  eq(A.name('all.first', 'en'), 'First Step'); eq(A.desc('blocks.s10k', 'ja'), '1回で10,000点');
  P.store.set('kobo.ach', { 'all.night': T0 });
  eq(A.name('all.night', 'ja'), '夜ふかし'); eq(A.name('all.night', 'en'), 'Night Owl');
});

test('titles: rank names by level plus grantsTitle from achievements; setTitle only accepts owned titles', () => {
  const { P, A } = load({ 'nejihodoki3d.maxLevel': 101 });
  fixedNow(T0); A.retro();
  const t = A.titles().map(x => x.id);
  ok(t.includes('lv:1')); ok(t.includes('neji.lv100'), 'Screw Master title');
  eq(A.titleText('neji.lv100', 'en'), 'Screw Master'); eq(A.titleText('lv:1', 'ja'), '見習い');
  eq(A.setTitle('all.master'), false, 'not owned');
  eq(A.setTitle('neji.lv100'), true); eq(A.title().id, 'neji.lv100'); eq(P.store.get('kobo.profile').title, 'neji.lv100');
  ok(A.titles().every(x => x.id.length <= 24), 'fits kbProfiles.title (24)');
});

test('progress(): value and goal for the profile page', () => {
  const { A } = load({ 'kusoge.raft.best': '23' });
  deep(A.progress('raft.d30'), { value: 23, goal: 30, done: false });
  const p = A.progress('all.varietyAll'); eq(p.goal, require(path.join(COMMON, 'games.js')).ids().length); eq(p.value, 1);
  eq(A.summary().total, A.all().length);
});

// ------------------------------------------------------------------ トースト
test('toasts via KoboUI: one per unlock (max 2 + "n more"), level-up toast, a single summary on the first retro run', () => {
  const calls = [];
  const ui = { toast: (msg, o) => calls.push([msg, o && o.type]) };
  const { P, A } = load({ 'kusoge.blocks.best': '60000', 'kusoge.drop.best': '6000' }, { ui });
  fixedNow(T0);
  A.retro(); A._flushToasts();
  eq(calls.length, 1, 'single summary'); ok(/これまでの記録から、実績を \d+ 個/.test(calls[0][0]), calls[0][0]);
  calls.length = 0;
  play(P, 'blocks', { t: T0 + MIN, dur: 2 * MIN, score: 10, extra: { stats: { maxCombo: 9, lines: 60 } } });
  A._flushToasts();
  ok(calls.some(c => /実績「連続消し」を獲得！ \+25 XP/.test(c[0])), JSON.stringify(calls));
  ok(calls.some(c => /実績「50列そうじ」/.test(c[0])));
  calls.length = 0;
  eq(A.toast('all.master'), true); ok(/工房の達人/.test(calls[0][0]));
  eq(A.toastLevel(10), true); ok(/Lv10（腕きき）/.test(calls[1][0]));
  A.toasts(false); calls.length = 0;
  P.xp.grantAchievement('zzz.manual', 10); A.evaluate({ live: true }); A._flushToasts(); eq(calls.length, 0, 'auto toasts off');
});

// ------------------------------------------------------------------ 公開プロフィール kbProfiles
function fakeCloud(o = {}) {
  const writes = [], st = { user: o.user === undefined ? { uid: 'u1', isAnonymous: false } : o.user, guestMade: 0, fail: o.fail || null };
  const db = { collection: c => ({ doc: id => ({ set: (data, opt) => { writes.push({ c, id, data, opt }); return st.fail ? Promise.reject(st.fail) : Promise.resolve(); } }) }) };
  const cloud = { user: () => st.user, ensureGuest: () => { st.guestMade++; st.user = { uid: 'g1', isAnonymous: true }; return Promise.resolve(st.user); }, ready: () => Promise.resolve(true) };
  return { writes, st, env: { cloud: () => cloud, db: () => Promise.resolve(db), serverTime: () => '__ST__' } };
}
const RULE_KEYS = ['n', 'icon', 'title', 'lv', 'xpw', 'wk', 'code', 't'];
test('profile: payload fits firestore.rules (keys, types, ranges); merge:true keeps other fields; skip when nothing changed', async () => {
  const { P, A } = load({ 'kobo.nick': 'たろう', 'kobo.profile': { v: 1, icon: 'cat', created: 1 } });
  const clock = { t: T0 }; const f = fakeCloud(); A._env(Object.assign({ now: () => clock.t }, f.env));
  fixedNow(T0); play(P, 'blocks', { t: T0, dur: 2 * MIN });
  const r = await A.profile.publish();
  eq(r.ok, true, JSON.stringify(r)); eq(f.writes.length, 1);
  const w = f.writes[0]; eq(w.c, 'kbProfiles'); eq(w.id, 'u1'); deep(w.opt, { merge: true });
  ok(Object.keys(w.data).every(k => RULE_KEYS.includes(k)), Object.keys(w.data).join());
  for (const k of ['n', 'lv', 'xpw', 'wk', 't']) ok(k in w.data, k);
  eq(w.data.n, 'たろう'); ok(Number.isInteger(w.data.lv) && w.data.lv >= 1 && w.data.lv <= 999);
  ok(Number.isInteger(w.data.xpw) && w.data.xpw >= 0 && w.data.xpw <= 12000); eq(w.data.xpw, P.xp.totals(T0).week);
  eq(w.data.wk, P.jstWeekKey(T0)); eq(w.data.t, '__ST__'); eq(w.data.icon, 'cat'); ok(w.data.title.length <= 24);
  clock.t += H;
  eq((await A.profile.publish()).reason, 'same', 'unchanged → no write'); eq(f.writes.length, 1);
});

test('profile: at most 4 writes per JST day per device and 30 minutes apart; the budget resets at 00:00 JST', async () => {
  const { P, A } = load({ 'kobo.nick': 'hanako' });
  const clock = { t: jst(2026, 11, 4, 0, 30) }; const f = fakeCloud(); A._env(Object.assign({ now: () => clock.t }, f.env));
  let wrote = 0;
  for (let i = 0; i < 40; i++) {
    clock.t += 10 * MIN; fixedNow(clock.t);
    play(P, ['blocks', 'drop', 'raft', 'gates', 'n59049', 'water', 'parking', 'hole', 'neji'][i % 9], { t: clock.t, dur: 2 * MIN });
    const r = await A.profile.publish(); if (r.ok) wrote++;
    else ok(['gap', 'budget'].includes(r.reason), r.reason);
  }
  eq(wrote, 4); eq(f.writes.length, 4);
  eq(A.profile.status().left, 0);
  clock.t = jst(2026, 11, 5, 0, 1); fixedNow(clock.t); play(P, 'blocks', { t: clock.t, dur: 2 * MIN });
  eq((await A.profile.publish()).ok, true, 'new JST day'); eq(A.profile.status().today, 1);
});

test('profile: no nickname → nothing; guest is created only when there is weekly XP; permission-denied backs off 6 h; week edge skipped', async () => {
  let { P, A } = load();
  let f = fakeCloud({ user: null }); A._env(Object.assign({ now: () => T0 }, f.env));
  eq((await A.profile.publish()).reason, 'nick');
  ({ P, A } = load({ 'kobo.nick': 'x' }));
  f = fakeCloud({ user: null }); A._env(Object.assign({ now: () => T0 }, f.env));
  eq((await A.profile.publish()).reason, 'signin', 'xpw 0 → no guest'); eq(f.st.guestMade, 0);
  fixedNow(T0); play(P, 'drop', { t: T0, dur: 2 * MIN });
  eq((await A.profile.publish()).ok, true); eq(f.st.guestMade, 1); eq(f.writes[0].id, 'g1');
  // rules not yet pasted
  ({ P, A } = load({ 'kobo.nick': 'y' }));
  const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied';
  const clock = { t: T0 }; f = fakeCloud({ fail: e }); A._env(Object.assign({ now: () => clock.t }, f.env));
  fixedNow(T0); play(P, 'drop', { t: T0, dur: 2 * MIN });
  eq((await A.profile.publish()).reason, 'denied');
  clock.t += 3 * H; eq((await A.profile.publish({ force: true })).reason, 'backoff', 'backing off');
  eq(f.writes.length, 1);
  // a few minutes around Monday 00:00 JST the rule's week number may differ from ours
  ({ P, A } = load({ 'kobo.nick': 'z' }));
  f = fakeCloud(); const mon = jst(2026, 11, 9, 0, 1); A._env(Object.assign({ now: () => mon }, f.env));
  fixedNow(mon); play(P, 'drop', { t: mon, dur: 2 * MIN });
  eq((await A.profile.publish()).reason, 'week-edge');
});

test('platform.js loads achievements.js from its own folder in the browser (no page changes needed)', () => {
  const src = readText('common/platform.js');
  ok(/achievements\.js/.test(src) && /currentScript/.test(src));
  ok(fs.existsSync(path.join(ROOT, 'common/achievements.js')));
});

run('achievements (P3-3)');
