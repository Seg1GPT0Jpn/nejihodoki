// common/games.js（レジストリ）の単体テスト：今のハブ（index.html）・cloud.js・ranking・設計書と食い違わないこと。
// 実行：node tools/tests/unit/registry.test.js
'use strict';
const { fresh, test, eq, ok, deep, run, readText, fixture, FakeStorage } = require('./_kobo-env');
const fs = require('fs');
const path = require('path');

const HUB = readText('index.html');
const IDS = ['neji', 'blocks', 'drop', 'raft', 'gates', 'n59049', 'water', 'parking', 'hole'];

// ---- 今のハブから読み取ったもの
function hubDict() {
  const m = HUB.match(/<script>\s*(KoboI18n\.add\(\{ en: \{[\s\S]*?\} \}\);)\s*<\/script>/);
  const dict = {};
  new Function('KoboI18n', m[1])({ add(d) { Object.assign(dict, d.en); } });
  return dict;
}
function hubCards() {
  const re = /<a class="game" href="(\w+)\/" id="g-(\w+)">\s*(<svg[\s\S]*?<\/svg>)\s*<div><h2><span data-i18n>([^<]+)<\/span><span class="tag" data-i18n>([^<]+)<\/span><\/h2><p data-i18n>([^<]+)<\/p>/g;
  const out = []; let m;
  while ((m = re.exec(HUB))) out.push({ path: m[1] + '/', id: m[2], svg: m[3], title: m[4], tag: m[5], desc: m[6] });
  return out;
}
function hubSync() {
  const m = HUB.match(/KoboCloud\.sync\((\{[\s\S]*?\})\);/);
  return new Function('return (' + m[1] + ')')();
}
// cloud.js の RANK_SOURCES をそのまま取り出して動かす（比べる相手）
function cloudRankSources(storage) {
  const src = readText('common/cloud.js');
  const body = src.slice(src.indexOf('const RANK_SOURCES = {'), src.indexOf('const nick = () =>'));
  const ls = { get: k => storage.getItem(k) };
  return new Function('ls', body + '\nreturn RANK_SOURCES;')(ls);
}
// ハブの refreshRecords をそのまま取り出して動かす
function hubRecords(storage) {
  const start = HUB.indexOf('  const get = (k, d) =>'), end = HUB.indexOf('  refreshRecords();', start);
  const code = HUB.slice(start, end) + '\nrefreshRecords(); return out;';
  const out = {};
  const document = { getElementById: id => ({ set textContent(v) { out[id] = v; } }) };
  const T = (s, v) => String(s).replace(/\{(\w+)\}/g, (x, k) => (v && k in v ? v[k] : x));
  return new Function('localStorage', 'document', 'T', 'const out = arguments[3];' + code)(storage, document, T, out);
}

test('9 games, same ids and order as the hub', () => {
  const { games: R } = fresh();
  deep(R.ids(), IDS);
  deep(hubCards().map(c => c.id), IDS);
  R.games.forEach((g, i) => eq(g.order, i + 1, g.id + ' order'));
  eq(globalThis.KOBO_GAMES, R.games); eq(globalThis.KOBO_GENRES, R.genres);
});

test('titles, descriptions, card tags and icons match the hub exactly (ja + en)', () => {
  const { games: R } = fresh(); const dict = hubDict();
  for (const c of hubCards()) {
    const g = R.byId(c.id);
    eq(g.path, c.path, c.id + ' path');
    eq(g.title.ja, c.title, c.id + ' title.ja'); eq(g.title.en, dict[c.title] || c.title, c.id + ' title.en');
    eq(g.desc.ja, c.desc, c.id + ' desc.ja'); eq(g.desc.en, dict[c.desc], c.id + ' desc.en');
    eq(g.label.ja, c.tag, c.id + ' label.ja'); eq(g.label.en, dict[c.tag], c.id + ' label.en');
    eq(g.iconSvg, c.svg, c.id + ' iconSvg');
    eq(g.iconBg, c.svg.match(/<rect width="72" height="72" fill="(#[0-9a-f]+)"/)[1], c.id + ' iconBg');
    ok(fs.existsSync(path.join(__dirname, '..', '..', '..', g.path, 'index.html')), c.id + ' page exists');
  }
});

test('ranking short names match ranking/index.html', () => {
  const { games: R } = fresh();
  const rk = readText('ranking/index.html');
  for (const g of R.games) {
    ok(new RegExp("\\{ id: '" + g.id + "', name: '" + g.short.ja.replace(/[.*+?^${}()|[\]\\]/g, '\\$&') + "'").test(rk), g.id + ' short.ja ' + g.short.ja);
  }
});

test('every entry has the documented fields with valid values', () => {
  const { games: R } = fresh();
  const genreIds = R.genres.map(x => x.id);
  for (const g of R.games) {
    for (const f of ['title', 'short', 'desc', 'label']) ok(g[f].ja && g[f].en, g.id + ' ' + f);
    ok(/^\d{4}-\d{2}-\d{2}$/.test(g.added), g.id + ' added');
    ok(g.genres.length && g.genres.every(x => genreIds.includes(x)), g.id + ' genres');
    ok(Array.isArray(g.tags) && g.tags.length, g.id + ' tags');
    ok(g.keywords.ja.length && g.keywords.en.length, g.id + ' keywords');
    eq(g.icon, 'img/icons/' + g.id + '.svg'); eq(g.thumb, 'img/thumbs/' + g.id + '.webp'); eq(g.thumb2x, 'img/thumbs/' + g.id + '@2x.webp');
    ok(g.tech === '2d' || g.tech === '3d', g.id + ' tech');
    for (const f of ['ranking', 'achievements', 'daily', 'versus', 'pause', 'stages']) eq(typeof g.flags[f], 'boolean', g.id + ' flags.' + f);
    ok(['desc', 'asc'].includes(g.score.order) && g.score.cap > 0, g.id + ' score');
    ok(g.rankSource && g.rankSource.key && g.record && g.record.tpl.ja && g.record.tpl.en, g.id + ' rank/record');
    for (const k of Object.keys(g.sync)) ok(k in g.keys, g.id + ' sync key documented: ' + k);
    ok(g.rankSource.key in g.keys && g.record.key in g.keys, g.id + ' rank/record keys documented');
  }
});

test('flags reflect what the pages have today', () => {
  const { games: R } = fresh();
  for (const g of R.games) {
    const page = readText(g.path + 'index.html');
    eq(g.tech === '3d', /three(\.min)?\.js/.test(page), g.id + ' tech');
    eq(g.flags.versus, true, g.id + ' versus');
    eq(g.versus, /KoboVersus\.init/.test(page) ? 'common' : 'own', g.id + ' versus impl');
  }
  eq(R.games.filter(g => g.flags.daily).map(g => g.id).join(), 'neji,blocks,drop,n59049', 'games with a daily today');
  eq(R.games.filter(g => g.flags.pause).map(g => g.id).join(), 'drop,raft,gates,hole', 'realtime games (AUDIT 3)');
  ok(R.games.every(g => !g.flags.achievements), 'no achievements yet (P3-3)');
});

test('every localStorage key the pages use is listed in the registry', () => {
  const { games: R } = fresh();
  for (const g of R.games) {
    const page = readText(g.path + 'index.html');
    const used = new Set();
    for (const m of page.matchAll(/'((?:kusoge\.[a-z0-9]+|nejihodoki3d)\.[A-Za-z0-9]+)'/g)) used.add(m[1]);
    if (g.id === 'neji') for (const m of page.matchAll(/store\.(?:get|set)\('([A-Za-z]+)'/g)) used.add('nejihodoki3d.' + m[1]);
    for (const k of used) if (!/kusoge\.(sound|vs\.)/.test(k)) ok(k in g.keys, g.id + ' uses ' + k + ' but the registry does not list it');
  }
});

test('hub sync keys are all in the registry; legacy strategies are identical to the hub', () => {
  const { platform: P } = fresh();
  const hub = hubSync(), legacy = P.syncMap({ legacy: true, platform: false });
  for (const [k, v] of Object.entries(hub)) eq(legacy[k], v, k);
  // additions on top of the hub (AUDIT 2, ARCH 12)
  for (const k of ['kusoge.n59049.bestTile', 'nejihodoki3d.maxLevel', 'kusoge.vs.stats']) ok(k in legacy, 'adds ' + k);
  // the whole-blob saves get real merge functions (R4)
  const full = P.syncMap({ platform: false });
  for (const k of ['kusoge.gates.save', 'kusoge.water.save', 'kusoge.parking.save', 'kusoge.hole.save', 'kusoge.vs.stats', 'nejihodoki3d.stars', 'nejihodoki3d.daily'])
    eq(typeof (full[k] && full[k].merge), 'function', k + ' has merge');
  for (const k of ['kusoge.raft.save', 'kusoge.blocks.state', 'kusoge.n59049.state']) eq(full[k], 'newest', k + ' stays newest (one run)');
});

test('rankValue equals cloud.js RANK_SOURCES for 8 games; hole uses best points (R10)', () => {
  const cases = [
    {},
    { 'nejihodoki3d.maxLevel': '12', 'kusoge.blocks.best': '4321', 'kusoge.drop.best': '8800', 'kusoge.raft.best': '23', 'kusoge.n59049.best': '12000',
      'kusoge.water.save': '{"level":5,"best":9,"stars":{}}', 'kusoge.parking.save': '{"level":6,"best":8,"stars":{}}',
      'kusoge.gates.save': '{"v":2,"best":14,"stage":15}', 'kusoge.hole.save': '{"best":{"matchRank":1,"matchPts":520}}' },
    { 'nejihodoki3d.maxLevel': '1', 'kusoge.water.save': '{"level":7}', 'kusoge.parking.save': '{"best":1}', 'kusoge.gates.save': '{"stage":7,"best":6}', 'kusoge.blocks.best': 'garbage{' },
    { 'kusoge.water.save': '3', 'kusoge.gates.save': '{"bestStage":{"score":4}}', 'kusoge.drop.best': '-5', 'kusoge.hole.save': 'null' },
  ];
  for (const c of cases) {
    const st = new FakeStorage(c);
    const { platform: P } = fresh({ storage: st });
    const old = cloudRankSources(st);
    for (const id of IDS) {
      if (id === 'hole') continue;
      const expect = Math.max(0, Math.floor(old[id]()));
      eq(P.rankValue(id), expect, id + ' ' + JSON.stringify(c));
    }
  }
  const st = new FakeStorage({ 'kusoge.hole.save': '{"best":{"matchRank":1,"matchPts":520,"maxPts":900}}' });
  const { platform: P } = fresh({ storage: st });
  eq(P.rankValue('hole'), 900, 'hole: maxPts when present');
  eq(P.rankValue('hole', k => '{"best":{"matchRank":2,"matchPts":300}}'), 300, 'hole: old save falls back to matchPts');
  eq(P.rankValue('hole', k => '{"best":{"matchRank":1,"matchPts":700,"maxPts":650}}'), 700, 'hole: never lower than a real match score');
  eq(P.rankValue('nope'), 0);
});

test('recordText reproduces the hub cards (refreshRecords) and fixes hole (R9)', () => {
  const fx = fixture('saves/hub-records.json');
  const st = new FakeStorage(fx.storage);
  const { platform: P } = fresh({ storage: st });
  const hub = hubRecords(st);
  const T = (s, v) => String(s).replace(/\{(\w+)\}/g, (x, k) => (v && k in v ? v[k] : x));
  for (const id of IDS) {
    if (id === 'hole') continue;
    eq(P.recordText(id, T), hub['r-' + id], id);
  }
  ok(/^ベスト 520 点$/.test(P.recordText('hole', T)), 'hole shows best points: ' + P.recordText('hole', T));
  for (const e of fx.expect) if (!e.known) ok(new RegExp(e.match).test(e.text === '#r-hole' ? P.recordText('hole', T) : P.recordText(e.text.slice(3), T)), e.text);
  // nothing stored → nothing shown (same thresholds as the hub)
  const empty = new FakeStorage({ 'nejihodoki3d.maxLevel': '1', 'kusoge.water.save': '{"level":1,"best":1}' });
  const r2 = fresh({ storage: empty }).platform; const h2 = hubRecords(empty);
  for (const id of IDS) eq(r2.recordText(id, T) || undefined, h2['r-' + id], id + ' empty');
  // English templates come from the hub dictionary
  const dict = hubDict();
  for (const g of r2.games()) eq(g.record.tpl.en, dict[g.record.tpl.ja], g.id + ' record.en');
});

test('score units/caps match ranking and the rules draft (ARCH 8.1)', () => {
  const { games: R } = fresh();
  const arch = readText('docs/SYSTEM_ARCHITECTURE.md');
  const gamesList = arch.match(/function games\(\) \{ return \[([^\]]+)\]/)[1].match(/'(\w+)'/g).map(s => s.slice(1, -1));
  deep(gamesList, IDS, 'firestore games()');
  const caps = {}; for (const m of arch.match(/function caps\(\)[\s\S]*?\}; \}/)[0].matchAll(/'(\w+)': (\d+)/g)) caps[m[1]] = Number(m[2]);
  for (const g of R.games) eq(g.score.cap, caps[g.id], g.id + ' cap');
  const rk = readText('ranking/index.html');
  for (const g of R.games) {
    const line = rk.split('\n').find(l => l.includes("{ id: '" + g.id + "'"));
    if (g.score.fmt) ok(line.includes(g.score.fmt.ja.replace('{n}', '').trim()) || line.includes("'" + g.score.fmt.ja + "'"), g.id + ' fmt ' + line);
    else ok(line.includes("unit: '" + g.score.unit.ja + "'"), g.id + ' unit ' + line);
  }
});

test('genres cover every hub tag word and each game', () => {
  const { games: R } = fresh();
  const used = new Set(R.games.flatMap(g => g.genres));
  deep([...used].sort(), R.genres.map(x => x.id).sort());
  for (const x of R.genres) ok(x.ja && x.en, x.id);
});

test('registry is plain data: no functions, JSON round-trips (safe for the SW importScripts)', () => {
  const { games: R } = fresh();
  const s = JSON.stringify({ games: R.games, genres: R.genres, shared: R.sharedSync });
  deep(JSON.parse(s).games, R.games);
  const walk = (o) => { for (const v of Object.values(o)) { ok(typeof v !== 'function', 'function in registry'); if (v && typeof v === 'object') walk(v); } };
  walk(R.games);
  // loads in a worker-like global without window/document
  const vm = require('vm');
  const ctx = { self: {} }; ctx.self = ctx; vm.createContext(ctx);
  vm.runInContext(readText('common/games.js'), ctx);
  eq(ctx.KOBO_GAMES.length, 9, 'worker global');
});

run('registry');
