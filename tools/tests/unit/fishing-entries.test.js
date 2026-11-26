// fishing/assets/registry-entry.txt と achievements-entry.txt（統合担当が common/games.js に貼る下書き）の検査：
// 登録簿の約束（registry.test.js と同じ）・同期ルールが保存の形に効く（ずかんのビット列は和集合）・ランキングの値・実績の条件が実際の保存の形から読める・ページが使うキーが全部書いてある・フィクスチャが読める
// 実行：node tools/tests/unit/fishing-entries.test.js
'use strict';
const fs = require('fs');
const path = require('path');
const { ROOT, fresh, test, eq, ok, deep, run, readText } = require('./_kobo-env');
const E = require(path.join(ROOT, 'fishing/engine.js'));

const entry = () => (0, eval)('(' + readText('fishing/assets/registry-entry.txt').trim().replace(/,\s*$/, '') + ')');
const ach = () => (0, eval)('({' + readText('fishing/assets/achievements-entry.txt').trim().replace(/,\s*$/, '') + '})').fishing;
const fixture = () => JSON.parse(readText('tools/tests/fixtures/saves/fishing-save.json'));
const saveOf = () => JSON.parse(fixture().storage['kusoge.fishing.save']);

test('registry entry: documented fields, valid genre/tags/flags, icon paths, the SVG icon is the same as fishing/icon.svg, score cap = 150 kinds', () => {
  const g = entry(), { games: R } = fresh(); const genreIds = R.genres.map(x => x.id);
  eq(g.id, 'fishing'); eq(g.path, 'fishing/'); ok(fs.existsSync(path.join(ROOT, 'fishing/index.html')));
  for (const f of ['title', 'short', 'desc', 'label']) ok(g[f].ja && g[f].en, f); ok(!/[぀-ヿ一-龯]/.test(g.title.en + g.short.en + g.desc.en + g.label.en), 'English text has no Japanese');
  ok(/^\d{4}-\d{2}-\d{2}$/.test(g.added)); ok(g.genres.length && g.genres.every(x => genreIds.includes(x)), 'genres');
  const known = new Set(R.games.flatMap(x => x.tags)); ok(g.tags.length && g.tags.every(t => known.has(t)), 'every tag is already used by a registered game: ' + g.tags.filter(t => !known.has(t)));
  ok(g.keywords.ja.length && g.keywords.en.length);
  eq(g.icon, 'img/icons/fishing.svg'); eq(g.thumb, 'img/thumbs/fishing.webp'); eq(g.thumb2x, 'img/thumbs/fishing@2x.webp'); eq(g.tech, '2d');
  eq(g.tech === '3d', /three(\.min)?\.js/.test(readText('fishing/index.html')), 'tech matches the page (2D canvas)');
  for (const f of ['ranking', 'achievements', 'daily', 'versus', 'pause', 'stages']) eq(typeof g.flags[f], 'boolean', f);
  eq(g.flags.versus, false); eq(g.versus, null); eq(g.flags.ranking, true); eq(g.flags.daily, true);
  ok(['desc', 'asc'].includes(g.score.order)); eq(g.score.cap, E.N); eq(g.score.cap, 150);
  const svg = readText('fishing/icon.svg').trim().replace(' xmlns="http://www.w3.org/2000/svg"', '');
  eq(g.iconSvg.replace(' aria-hidden="true"', ''), svg, 'iconSvg = fishing/icon.svg'); ok(/<rect width="72" height="72" fill="#[0-9a-f]+"\/>/.test(g.iconSvg), 'bg rect the registry test reads');
  for (const k of Object.keys(g.sync)) ok(k in g.keys, 'sync key documented ' + k); ok(g.rankSource.key in g.keys && g.record.key in g.keys);
  ok(g.record.tpl.ja && g.record.tpl.en); ok(!/[぀-ヿ一-龯]/.test(g.score.unit.en + g.score.fmt.en + g.record.tpl.en));
});
test('every localStorage key used by the page is documented in keys; the page registers the synced key', () => {
  const g = entry(), page = readText('fishing/index.html'), used = new Set();
  for (const m of page.matchAll(/'((?:kusoge\.[a-z0-9]+|nejihodoki3d)\.[A-Za-z0-9]+)'/g)) used.add(m[1]);
  for (const k of used) if (!/kusoge\.(sound|vs\.)/.test(k)) ok(k in g.keys, 'page uses ' + k); ok(used.has('kusoge.fishing.save') && used.has('kusoge.fishing.howto'));
  ok(/KoboCloud\.sync\(\{ 'kusoge\.fishing\.save': 'newest' \}/.test(page), 'the page registers the synced key');
  ok(/KoboAudio|window\.KoboAudio/.test(page) && !/\.bgm\.play|bgm\./.test(page), 'sound effects only, no BGM');
});
test('sync rule: two devices merge sensibly (book bits are a union, bests max, coins max, gear tiers max, lure bits union, settings newest)', () => {
  const g = entry(), { platform: P } = fresh({ files: ['games', 'platform'] }); const merge = P.merge.make(g.sync['kusoge.fishing.save']);
  const a = E.newSave(), b = E.newSave(); E.recordCatch(a, 1, 300, null, 0); E.recordCatch(a, 40, 200, null, 4); E.recordCatch(b, 1, 450, null, 0); E.recordCatch(b, 90, 500, null, 8); a.coins = 100; b.coins = 700; a.g.r = 2; b.g.r = 1; a.g.u = 1; b.g.u = 4; a.g.a = [0, 5, 0, 0, 0]; b.g.a = [0, 2, 9, 0, 0]; a.set.clk = 1; b.set.clk = 3; a.ts = 5; b.ts = 9; a.tn.w = 1; b.tn.w = 3; a.tn.bt = 4; b.tn.bt = 2; a.aq.d = 1; b.aq.d = 6; a.stats.catches = 10; b.stats.catches = 7; a.lm = 1; b.lm = 256;
  const r = JSON.parse(merge(JSON.stringify(a), JSON.stringify(b), { localT: 2, remoteT: 1 }));
  for (const i of [1, 40, 90]) ok(E.zHas(r, i), 'book has ' + i); eq(r.b[1], 450, 'best size max'); eq(r.b[40], 200); eq(r.b[90], 500); eq(r.coins, 700); eq(r.g.r, 2); eq(r.g.u, 5); deep(r.g.a, [0, 5, 9, 0, 0]); eq(r.set.clk, 1, 'settings follow the newer side'); eq(r.ts, 9); eq(r.tn.w, 3); eq(r.tn.bt, 2); eq(r.aq.d, 7); eq(r.stats.catches, 10); eq(r.lm, 257);
  const clean = E.sanitize(r); eq(clean.zc, 3, 'the merged save is a valid save with 3 kinds');
});
test('rank/record: the ranking value is the number of kinds (zc), read from the real save shape, never above 150', () => {
  const g = entry(), { platform: P } = fresh({ files: ['games', 'platform'] }); const R2 = globalThis.KOBO_REGISTRY, o2 = R2.byId; R2.byId = id => (id === 'fishing' ? g : o2.call(R2, id));
  const raw = k => (k === 'kusoge.fishing.save' ? JSON.stringify(saveOf()) : null);
  eq(P.rankValue('fishing', raw), 28); eq(P.recordValue('fishing', raw), 28); eq(P.rankValue('fishing', () => null), 0);
  const all = E.newSave(); for (let i = 0; i < 150; i++) E.recordCatch(all, i, 100, null, null); eq(P.rankValue('fishing', () => JSON.stringify(all)), 150);
});
test('fixture save: zc equals the bit count, the book has the listed fish, it loads cleanly and nothing is lost on sanitize', () => {
  const s = saveOf(), f = fixture(); eq(E.zCount(s), s.zc); eq(s.zc, 28); const c = E.sanitize(s); eq(c.zc, 28); eq(c.coins, s.coins); deep(c.b, s.b); deep(c.z, s.z);
  for (const k of Object.keys(s.b)) ok(E.zHas(s, +k), 'best size implies the book entry ' + k);
  ok(E.LOCATIONS.filter((l, i) => E.locUnlocked(s, i)).length >= 4, 'several places are open in the fixture'); ok(Array.isArray(f.expect) && f.expect.length >= 3 && f.expect.every(e => e.key || e.text));
});
test('achievements entry: ~20, unique ids <= 24 chars with the fishing. prefix, ja+en, valid tiers and icons, rec keys are documented, every path exists in the real save shape and is reachable', () => {
  const list = ach(), g = entry(), ui = readText('common/ui.js'); const icons = new Set([...ui.matchAll(/^\s{4}(\w+): '</gm)].map(m => m[1]));
  ok(list.length >= 18 && list.length <= 24, 'count ' + list.length); const seen = new Set(), s = saveOf();
  const get = (o, p) => p.split('.').reduce((a, k) => (a == null ? undefined : a[k]), o); const fresh0 = E.newSave();
  for (const d of list) {
    ok(!seen.has(d.id), 'dup ' + d.id); seen.add(d.id); ok(/^fishing\.[A-Za-z0-9]+$/.test(d.id) && d.id.length <= 24, 'id ' + d.id);
    ok(d.title.ja && d.title.en && d.desc.ja && d.desc.en && !/[぀-ヿ一-龯]/.test(d.title.en + d.desc.en), 'texts ' + d.id);
    ok(d.tier >= 1 && d.tier <= 4 && icons.has(d.icon), 'tier/icon ' + d.id); ok(d.when.rec && d.when.rec.key in g.keys && Number.isFinite(d.when.gte) && d.when.gte >= 1, 'condition ' + d.id);
    ok(get(fresh0, d.when.rec.path) !== undefined, 'path is part of the fresh save shape: ' + d.when.rec.path);
  }
  const max = E.newSave(); for (let i = 0; i < 150; i++) E.recordCatch(max, i, FISH_MAX(i), { t: 3, wx: 2, season: 0 }, i % 12); max.lm = 4095; max.g = { r: 4, e: 4, n: 4, u: 31, a: [0, 0, 0, 0, 0], sb: 0, sl: -1 }; max.stats = Object.assign(max.stats, { catches: 999, orders: 99, away: 9 }); max.tn.w = 1; max.coins = 99999; E.derive(max);
  for (const d of list) ok(get(max, d.when.rec.path) >= d.when.gte, 'reachable ' + d.id);
  const got = list.filter(d => (get(s, d.when.rec.path) || 0) >= d.when.gte).length; ok(got >= 2 && got < list.length, 'the fixture unlocks some, not all (' + got + ')');
  ok(list.some(d => d.when.rec.path === 'zc' && d.when.gte === 150), 'complete book'); eq(get(E.newSave(), 'stats.catches'), 0);
});
function FISH_MAX(i) { return E.FISH[i].max * 10; }

run('fishing-entries');
