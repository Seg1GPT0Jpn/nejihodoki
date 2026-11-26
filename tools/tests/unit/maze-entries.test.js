// maze/assets/registry-entry.txt と achievements-entry.txt（統合担当が common/games.js に貼る下書き）の検査：
// 登録簿の約束（registry.test.js と同じ）・同期ルールが保存の形に効く・ランキングの値・実績の条件が実際の保存の形から読める・ページが使うキーが全部書いてある。
// 実行：node tools/tests/unit/maze-entries.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, fresh, test, eq, ok, deep, run, readText, FakeStorage } = require('./_kobo-env');
const E = require(path.join(ROOT, 'maze/engine.js'));

const entry = () => (0, eval)('(' + readText('maze/assets/registry-entry.txt').trim().replace(/,\s*$/, '') + ')');
const ach = () => (0, eval)('({' + readText('maze/assets/achievements-entry.txt').trim().replace(/,\s*$/, '') + '})').maze;
const fixture = () => JSON.parse(readText('tools/tests/fixtures/saves/maze-save.json'));
const saveOf = () => JSON.parse(fixture().storage['kusoge.maze.save']);

test('registry entry: documented fields, valid genre/tags/flags, icon paths, the SVG icon is the same as maze/icon.svg, score cap = the engine\'s max stars', () => {
  const g = entry(), { games: R } = fresh(); const genreIds = R.genres.map(x => x.id);
  eq(g.id, 'maze'); eq(g.path, 'maze/'); ok(fs.existsSync(path.join(ROOT, 'maze/index.html')));
  for (const f of ['title', 'short', 'desc', 'label']) ok(g[f].ja && g[f].en, f); ok(!/[぀-ヿ一-龯]/.test(g.title.en + g.short.en + g.desc.en + g.label.en), 'English text has no Japanese');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(g.added)); ok(g.genres.length && g.genres.every(x => genreIds.includes(x)), 'genres');
  const known = new Set(R.games.flatMap(x => x.tags)); ok(g.tags.length && g.tags.every(t => known.has(t)), 'every tag is already used by a registered game: ' + g.tags.filter(t => !known.has(t)));
  ok(g.keywords.ja.length && g.keywords.en.length);
  eq(g.icon, 'img/icons/maze.svg'); eq(g.thumb, 'img/thumbs/maze.webp'); eq(g.thumb2x, 'img/thumbs/maze@2x.webp'); eq(g.tech, '2d');
  eq(g.tech === '3d', /three(\.min)?\.js/.test(readText('maze/index.html')), 'tech matches the page (a canvas raycaster, no three.js)');
  for (const f of ['ranking', 'achievements', 'daily', 'versus', 'pause', 'stages']) eq(typeof g.flags[f], 'boolean', f);
  eq(g.flags.versus, false); eq(g.versus, null); eq(g.flags.daily, true); eq(g.flags.ranking, true);
  ok(['desc', 'asc'].includes(g.score.order)); eq(g.score.cap, E.MAX_STARS); eq(g.score.cap, 85);
  const svg = readText('maze/icon.svg').trim().replace(' xmlns="http://www.w3.org/2000/svg"', '');
  eq(g.iconSvg.replace(' aria-hidden="true"', ''), svg, 'iconSvg = maze/icon.svg'); ok(/<rect width="72" height="72" fill="#[0-9a-f]+"\/>/.test(g.iconSvg), 'bg rect the registry test reads');
  for (const k of Object.keys(g.sync)) ok(k in g.keys, 'sync key documented ' + k); ok(g.rankSource.key in g.keys && g.record.key in g.keys);
  ok(g.record.tpl.ja && g.record.tpl.en);
});

test('every localStorage key used by the page is documented in keys', () => {
  const g = entry(), page = readText('maze/index.html'), used = new Set();
  for (const m of page.matchAll(/'((?:kusoge\.[a-z0-9]+|nejihodoki3d)\.[A-Za-z0-9]+)'/g)) used.add(m[1]);
  for (const k of used) if (!/kusoge\.(sound|vs\.)/.test(k)) ok(k in g.keys, 'page uses ' + k);
  ok(used.has('kusoge.maze.save') && used.has('kusoge.maze.run') && used.has('kusoge.maze.ghost') && used.has('kusoge.maze.howto'));
  ok(!(('kusoge.maze.run') in g.sync) && !(('kusoge.maze.ghost') in g.sync), 'run and ghost stay on this device');
  ok(/KoboCloud\.sync\(\{ 'kusoge\.maze\.save': 'newest' \}/.test(page), 'the page registers the synced key');
});

test('sync rule makes a sensible merge of two devices (stars max, fastest time kept, streak max, counters max, setup newest)', () => {
  const g = entry(), { platform: P } = fresh({ files: ['games', 'platform'] });
  const merge = P.merge.make(g.sync['kusoge.maze.save']);
  const a = { v: 1, stars: 9, b: { 'classic.XS': { s: 2, t: 30000, m: 20, n: 2 }, 'fog.S': { s: 1, t: 0, m: 0, n: 0 } }, dl: { k: 20261120, t: 61000, m: 88, s: 2, st: 3, bs: 3, n: 3 }, en: { best: 5, score: 820, runs: 2 }, coins: 37, gems: 2, wz: { forest: 1 }, world: 'forest', stats: { clears: 9, three: 1 }, set: { pad: 0 }, tut: 1 };
  const b = { v: 1, stars: 12, b: { 'classic.XS': { s: 3, t: 21400, m: 14, n: 1 }, 'classic.S': { s: 1, t: 50000, m: 40, n: 1 } }, dl: { k: 20261121, t: 40000, m: 70, s: 3, st: 4, bs: 4, n: 4 }, en: { best: 8, score: 500, runs: 1 }, coins: 10, gems: 5, wz: { castle: 1 }, world: 'castle', stats: { clears: 4, three: 3 }, set: { pad: 1 }, tut: 1 };
  const r = JSON.parse(merge(JSON.stringify(a), JSON.stringify(b), { localT: 2, remoteT: 1 }));
  eq(r.stars, 12); eq(r.b['classic.XS'].s, 3); eq(r.b['classic.XS'].t, 21400, 'fastest time kept'); eq(r.b['classic.XS'].m, 14); eq(r.b['classic.XS'].n, 2);
  eq(r.b['classic.S'].s, 1); eq(r.b['fog.S'].s, 1); eq(r.b['fog.S'].t, 0, 'zero means "no time", it never beats a real one');
  eq(r.en.best, 8); eq(r.en.score, 820); eq(r.dl.bs, 4); eq(r.dl.k, 20261121); eq(r.coins, 37); eq(r.gems, 5); eq(r.stats.clears, 9); eq(r.stats.three, 3); eq(r.wz.forest, 1); eq(r.wz.castle, 1);
  eq(r.set.pad, 0, 'the settings follow the newer side (local)');
});

test('rank/record: the ranking value is the stars total (capped by the rules at 85), read from the real save shape', () => {
  const g = entry(), { games: R } = fresh(); const orig = R.byId; R.byId = id => (id === 'maze' ? g : orig.call(R, id));
  const { platform: P } = fresh({ files: ['games', 'platform'] }); const R2 = globalThis.KOBO_REGISTRY, o2 = R2.byId; R2.byId = id => (id === 'maze' ? g : o2.call(R2, id));
  const raw = k => (k === 'kusoge.maze.save' ? JSON.stringify(saveOf()) : null);
  eq(P.rankValue('maze', raw), 9); eq(P.recordValue('maze', raw), 9); eq(P.rankValue('maze', () => null), 0);
  ok(P.rankValue('maze', k => JSON.stringify({ stars: 999 })) >= 85, 'the cap is enforced by firestore.rules, not here');
});

test('fixture save: its stars total is what the engine derives from b / en / dl (so the hub card and ranking agree)', () => {
  const s = saveOf(); eq(E.totalStars(s), s.stars); eq(E.WORLDS.filter(w => E.worldUnlocked(s, w)).length, s.stats.worlds);
  for (const k of Object.keys(s.b)) { const [m, z] = k.split('.'); ok(E.MODES.includes(m) && E.sizeById(z), 'slot key ' + k); }
});

test('achievements entry: ~15-20, unique ids <= 24 chars with the maze. prefix, ja+en, valid tiers and icons, rec keys are documented, every path exists in the real save shape', () => {
  const list = ach(), g = entry(), ui = readText('common/ui.js'); const icons = new Set([...ui.matchAll(/^\s{4}(\w+): '</gm)].map(m => m[1]));
  ok(list.length >= 15 && list.length <= 24, 'count ' + list.length); const seen = new Set(), s = saveOf();
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o);
  // the fields a fresh save has (everything else is a counter that appears on first use)
  const fresh0 = { stars: 0, coins: 0, gems: 0, dl: { n: 0, bs: 0 }, en: { best: 0 }, stats: { clears: 0, hints: 0, undos: 0, three: 0, xl: 0, worlds: 0, fog: 0, d3: 0, keys: 0, timed: 0, classic: 0 } };
  for (const d of list) {
    ok(!seen.has(d.id), 'dup ' + d.id); seen.add(d.id); ok(/^maze\.[A-Za-z0-9]+$/.test(d.id) && d.id.length <= 24, 'id ' + d.id);
    ok(d.title.ja && d.title.en && d.desc.ja && d.desc.en && !/[぀-ヿ一-龯]/.test(d.title.en + d.desc.en), 'texts ' + d.id);
    ok(d.tier >= 1 && d.tier <= 4 && icons.has(d.icon), 'tier/icon ' + d.id);
    ok(d.when.rec && d.when.rec.key in g.keys && Number.isFinite(d.when.gte) && d.when.gte >= 1, 'condition ' + d.id);
    ok(get(fresh0, d.when.rec.path) !== undefined, 'path is part of the fresh save shape: ' + d.when.rec.path);
  }
  // reachable: a maxed-out save satisfies every condition, the fixture some of them but not all
  const max = { stars: 85, coins: 999, gems: 99, dl: { n: 30, bs: 30 }, en: { best: 40 }, stats: { clears: 999, hints: 9, undos: 99, three: 99, xl: 9, worlds: 40, fog: 9, d3: 9, keys: 9, timed: 9, classic: 9 } };
  for (const d of list) ok(get(max, d.when.rec.path) >= d.when.gte, 'reachable ' + d.id);
  const got = list.filter(d => (get(s, d.when.rec.path) || 0) >= d.when.gte).length; ok(got >= 3 && got < list.length, 'the fixture unlocks some, not all (' + got + ')');
  ok(list.some(d => d.when.rec.path === 'stats.fog') && list.some(d => d.when.rec.path === 'stats.d3') && list.some(d => d.when.rec.path === 'dl.bs'), 'modes and the streak have achievements');
});

run('maze-entries');
