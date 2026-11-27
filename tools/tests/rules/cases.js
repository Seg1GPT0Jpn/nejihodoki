// 許可と拒否のテスト（REST、匿名のトークン）。エミュレーターでも本番（--live）でも同じものを流す。
// 本番では、作ったものを最後に消す（ランキングの行・部屋・待ち行列）。kbPlays は消せないので、本番では拒否のテストだけ。
'use strict';
const { signUp, rtdb, TS, SERVER_TIME, fsSet, fsDelete, fsGet, fsList } = require('./rest');
const { CAPS } = require('./spec');

const JST = 9 * 3600e3;
const dayKey = (ms = Date.now()) => { const d = new Date(ms + JST); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); };
const weekNo = (ms = Date.now()) => Math.floor((ms + JST + 3 * 86400e3) / (7 * 86400e3));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);

async function runCases(T, opt = {}) {
  const results = [];
  const live = T.name === 'live';
  const cleanup = [];
  async function check(group, name, expect, fn) {
    let r;
    try { r = await fn(); } catch (e) { r = { ok: false, status: 'ERR', body: String(e && e.message || e) }; }
    // 拒否は「ルールで拒否された」ときだけ数える（Firestore 403 PERMISSION_DENIED、RTDB 401 Permission denied）。
    // 400 などの形の誤りは、テストの書き方の誤りとして不合格にする。
    const denied = r.status === 403 || r.status === 401 || (r.ok === false && Array.isArray(r.body) && /PERMISSION_DENIED/.test(JSON.stringify(r.body)));
    const got = r.ok ? 'allow' : denied ? 'deny' : 'error';
    const row = { group, name, expect, got, pass: got === expect, status: r.status };
    if (!row.pass || opt.verbose) row.detail = JSON.stringify(r.body).slice(0, 300);
    results.push(row);
    if (opt.log) opt.log(row);
    return r;
  }

  const A = await signUp(T), B = await signUp(T), C = await signUp(T);
  const anon = null;

  // ================================================================ Firestore: nejiUsers
  {
    const g = 'fs:nejiUsers';
    const now = Date.now();
    // cloud.js（P1-5 の版も同じ形）：set({ games, updatedAt }, { merge: true })
    await check(g, 'own push (cloud.js games map, merge)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~blocks~best': { v: '120', t: now }, 'kusoge~hole~save': { v: JSON.stringify({ best: { matchPts: 10 } }), t: now }, 'kobo~audio': { v: '{"mute":false}', t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'own tombstone { v: null, t }', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~blocks~state': { v: null, t: now } }, updatedAt: now }, A, { merge: true }));
    // neji/index.html：set({ level, maxLevel, stars, daily, name, updatedAt }, { merge: true })
    await check(g, 'own push (neji top-level fields, merge)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { level: 5, maxLevel: 7, stars: { 1: 3, 2: 2 }, daily: { 20261104: 3 }, name: 'Taro Yamada', updatedAt: now }, A, { merge: true }));
    await check(g, 'own unknown legacy top-level field (kept on purpose)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { oldField: 1 }, A, { merge: true }));
    await check(g, 'own read', 'allow', () => fsGet(T, `nejiUsers/${A.uid}`, A));
    await check(g, 'other user read', 'deny', () => fsGet(T, `nejiUsers/${A.uid}`, B));
    await check(g, 'signed-out read', 'deny', () => fsGet(T, `nejiUsers/${A.uid}`, anon));
    await check(g, 'other user write', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: {}, updatedAt: now }, B, { merge: true }));
    await check(g, 'list all users', 'deny', () => fsList(T, '', 'nejiUsers', A, { limit: 5 }));
    await check(g, 'known key entry not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~blocks~best': '120' } }, A, { merge: true }));
    await check(g, 'known key entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~drop~best': { v: 5, t: now } } }, A, { merge: true }));
    await check(g, 'known key entry without t', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~drop~best': { v: '5' } } }, A, { merge: true }));
    await check(g, 'entry v over 300,000 chars', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~raft~save': { v: 'x'.repeat(300001), t: now } } }, A, { merge: true }));
    await check(g, 'entry v 200,000 chars (big raft save)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~raft~save': { v: 'x'.repeat(200000), t: now } } }, A, { merge: true }));
    // からくり工房からの脱出（escape）：記録 kusoge.escape.save だけを同期する（とちゅうの部屋 kusoge.escape.run は端末だけ）
    await check(g, 'own push escape save (records per room)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~escape~save': { v: JSON.stringify({ v: 1, rooms: { r1: { s: 960, t: 250000, r: 4, nh: 1, c: 1 } }, total: 960 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'escape save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~escape~save': { v: 960, t: now } } }, A, { merge: true }));
    await check(g, 'escape save entry with an extra field', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~escape~save': { v: '{}', t: now, a: 1, b: 2, c: 3 } } }, A, { merge: true }));
    // 工房まもり（td）：記録 kusoge.td.save だけを同期する（とちゅうのゲーム kusoge.td.run は端末だけ）
    await check(g, 'own push td save (records per map)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~td~save': { v: JSON.stringify({ v: 1, maps: { m1: { st: 3, c: 1, ew: 12, es: 1500 } }, best: 1500, stars: 3 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'td save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~td~save': { v: 1500, t: now } } }, A, { merge: true }));
    // ころころ工房（physics）：記録 kusoge.physics.save だけを同期する（置きかけの部品と答えは端末だけ）
    await check(g, 'own push physics save (records per level)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~physics~save': { v: JSON.stringify({ v: 1, lv: { '1-1': { c: 1, g: 1, p: 1, b: 1, t: 3300 } }, stars: 3, done: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'physics save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~physics~save': { v: 3, t: now } } }, A, { merge: true }));
    // ころがし工房ゴルフ（minigolf）：記録 kusoge.minigolf.save だけを同期する（とちゅうのラウンドは端末だけ）
    await check(g, 'own push minigolf save (records per course)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~minigolf~save': { v: JSON.stringify({ v: 1, c: { c1: { b: 22, r: 1, h: { 1: 1 } } }, under: 3, done: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'minigolf save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~minigolf~save': { v: 3, t: now } } }, A, { merge: true }));
    // トランプ広場（cards）：記録 kusoge.cards.save だけを同期する（とちゅうのゲーム kusoge.cards.game は端末だけ）
    await check(g, 'own push cards save (stars and per-game records)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~cards~save': { v: JSON.stringify({ v: 1, pts: 7, g: { om: { p: 4, w: 2, l: 1 }, pk: { p: 3, w: 1, l: 0 } }, stats: { plays: 7, wins: 3, hard: 1, rev: 2 }, set: { game: 'poker', n: 3, level: 2 } }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'cards save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~cards~save': { v: 7, t: now } } }, A, { merge: true }));
    // ぴったりパズル工房（fit）：記録 kusoge.fit.save だけを同期する（とちゅうのパズル kusoge.fit.run は端末だけ）
    await check(g, 'own push fit save (stage stars and best time attack)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~fit~save': { v: JSON.stringify({ v: 1, st: { '1-1': { s: 3, t: 9000, c: 2 }, '2-4': { s: 1, t: 61000, c: 1 } }, best: 12, stars: 4, stats: { solved: 9, perfect: 1, noHint: 7 }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'fit save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~fit~save': { v: 7, t: now } } }, A, { merge: true }));
    // ひまつぶしタウン（town）：記録 kusoge.town.save だけを同期する（いまの町 kusoge.town.run は端末だけ）
    await check(g, 'own push town save (best population, renown, research, goals)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~town~save': { v: JSON.stringify({ v: 1, best: 120, tier: 1, renown: 2, rs: { rest: 1, wealth: 2 }, qd: { h1: 1, f1: 1, p4: 1 }, un: { house: 1, farm: 1, harbor: 1 }, stats: { built: 40, upgrades: 12, taps: 9, gifts: 3, prestiges: 1, research: 3, returns: 2, awayMax: 30000, kinds: 7 }, daily: { last: 20800, streak: 3 }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'town save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~town~save': { v: 7, t: now } } }, A, { merge: true }));
    // いろあわせカード工房（colorcards）：記録 kusoge.colorcards.save だけを同期する（とちゅうのゲーム kusoge.colorcards.game は端末だけ）
    await check(g, 'own push colorcards save (stars, wins, stats)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~colorcards~save': { v: JSON.stringify({ v: 1, pts: 9, w: { q: { p: 6, w: 4 }, m: { p: 1, w: 1 } }, stats: { plays: 7, wins: 5, swap: 2, calls: 8 }, set: { n: 3, level: 2, mode: 'quick', fast: 0 }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'colorcards save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~colorcards~save': { v: 7, t: now } } }, A, { merge: true }));
    // おもちゃ大乱闘（brawl）：記録 kusoge.brawl.save だけを同期する（とちゅうのラダー kusoge.brawl.run は端末だけ）
    await check(g, 'own push brawl save (best ladder score, unlocks, stats)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~brawl~save': { v: JSON.stringify({ v: 1, best: 9800, lw: 5, cl: 1, un: { c: { robo: 1, duck: 1, bear: 1, tin: 1 }, s: { bench: 1, box: 1, shelf: 1 } }, cp: { robo: 6 }, stats: { plays: 9, wins: 6, kos: 22, maxCmb: 4 }, set: { n: 1, lvl: 2, stage: 'bench', mode: 'stock', stk: 3, tm: 3, c1: 'robo', c2: 'duck', diff: 2 }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'brawl save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~brawl~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'brawl save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~brawl~save': 'x' } }, A, { merge: true }));
    await check(g, 'brawl save entry with an extra field', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~brawl~save': { v: '{}', t: now, a: 1, b: 2, c: 3 } } }, A, { merge: true }));
    // でんしゃでいこう（train）：記録 kusoge.train.save だけを同期する（途中保存はない）
    await check(g, 'own push train save (total, stars, per-route bests, stats)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~train~save': { v: JSON.stringify({ v: 1, total: 5400, stars: 6, r: { r1: { b: 1900, s: 3, p: 2 }, r2: { b: 3500, s: 3, p: 1 } }, un: { l2: 1 }, stats: { plays: 3, clears: 2, pita: 2, stops: 6 }, set: { route: 'r2' }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'train save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~train~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'train save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~train~save': 'x' } }, A, { merge: true }));
    // リバーシ工房（reversi）：記録 kusoge.reversi.save だけを同期する（とちゅうのゲーム kusoge.reversi.game は端末だけ）
    await check(g, 'own push reversi save (stars, per-level wins, stats, today\'s puzzle)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~reversi~save': { v: JSON.stringify({ v: 1, pts: 9, w: { '8-2': { p: 6, w: 4 } }, stats: { plays: 6, wins: 4, pz: 3 }, set: { level: 2, me: 'b', n: 8, start: 'std', fast: 0, dots: 1 }, dl: { last: 20261125, pts: 600, r: [[19, 1, 200]] }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'reversi save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~reversi~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'reversi save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~reversi~save': 'x' } }, A, { merge: true }));
    // 五目ならべ工房（gomoku）：記録 kusoge.gomoku.save だけを同期する（とちゅうのゲーム kusoge.gomoku.game は端末だけ）
    await check(g, 'own push gomoku save (stars, per-size wins, stats, settings, today\'s puzzle)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~gomoku~save': { v: JSON.stringify({ v: 1, pts: 9, w: { '15-2': { p: 6, w: 4 } }, stats: { plays: 6, wins: 4, pz: 3, fork: 2 }, set: { level: 2, me: 'b', n: 15, rule: 'renju', nums: 0, fbd: 1, conf: 2, fast: 0 }, dl: { last: 20261125, pts: 600, r: [[112, 1, 200]] }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'gomoku save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~gomoku~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'gomoku save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~gomoku~save': 'x' } }, A, { merge: true }));
    // ナンバー工房（sudoku）：記録 kusoge.sudoku.save だけを同期する（とちゅうのパズル kusoge.sudoku.run・今日の1問のキャッシュ kusoge.sudoku.dc は端末だけ）
    await check(g, 'own push sudoku save (points, per-board bests, stats, daily, settings)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~sudoku~save': { v: JSON.stringify({ v: 1, pts: 47, st: { '9n-1': { n: 12, b: 161000, c: 10 } }, stats: { solved: 33, clean: 20, daily: 5, kids: 2 }, daily: { last: 20261125, streak: 3, max: 5, days: { 20261125: 241000 } }, cfg: { size: 9, variant: 'n', level: 2, auto: 1 }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'sudoku save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~sudoku~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'sudoku save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~sudoku~save': 'x' } }, A, { merge: true }));
    // はこはこ運送（crates）：記録 kusoge.crates.save だけを同期する（とちゅうのステージ .run・エディターの書きかけ .draft は端末だけ）
    await check(g, 'own push crates save (stars, per-level bests, packs, stats, daily, editor codes)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~crates~save': { v: JSON.stringify({ v: 1, stars: 6, lv: { '1-1': { m: 3, p: 2, s: 3, pf: 1 }, '1-2': { m: 9, p: 2, s: 2 } }, pk: { 1: 3 }, stats: { plays: 5, clears: 3, pushes: 12, moves: 19 }, dl: { k: 20261125, m: 40, p: 12, s: 2, st: 1, bs: 1 }, ed: ['CR1:abc'], tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'crates save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~crates~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'crates save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~crates~save': 'x' } }, A, { merge: true }));
    // ぴょんぴょん冒険（hop）：記録 kusoge.hop.save だけを同期する（あそびかた kusoge.hop.howto は端末だけ）
    await check(g, 'own push hop save (levels as bit sets, medals, best frames, stats, settings)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~hop~save': { v: JSON.stringify({ v: 1, pts: 12, lv: [79, 63, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], bt: { '1-1': 1500 }, coins: 150, stats: { plays: 9, clears: 3, deaths: 12, stomps: 14 }, cl: 3, md: 8, all5: 1, par: 1, wc: { 1: 3 }, set: { slow: 0, hearts: 0, auto: 0, tc: 'auto' }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'hop save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~hop~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'hop save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~hop~save': 'x' } }, A, { merge: true }));
    // めいろ探検（maze）：記録 kusoge.maze.save だけを同期する（とちゅうのめいろ .run・ゴースト .ghost・あそびかた .howto は端末だけ）
    await check(g, 'own push maze save (stars, per-slot bests, descend, daily, stats, settings)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~maze~save': { v: JSON.stringify({ v: 1, stars: 9, b: { 'classic.S': { s: 3, t: 41000, m: 52, n: 2 }, 'fog.M': { s: 2, t: 90000, m: 80, n: 1 } }, en: { best: 4, score: 120, runs: 2 }, dl: { k: 20261126, t: 30000, m: 40, s: 3, st: 2, bs: 2, n: 3 }, coins: 12, gems: 1, wz: { forest: 1 }, world: 'forest', stats: { clears: 5, hints: 1, three: 1 }, set: { trail: 1 }, tut: 1 }), t: now } } }, A, { merge: true }));
    await check(g, 'maze save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~maze~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'maze save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~maze~save': 'x' } }, A, { merge: true }));
    // ペーパーウイング（shmup）：記録 kusoge.shmup.save だけを同期する（ランキング .rank・リプレイ .reps・あそびかた .howto は端末だけ）
    await check(g, 'own push shmup save (rank, bests per difficulty, daily, clears, stats, setup)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~shmup~save': { v: JSON.stringify({ v: 1, rank: 1234500, best: { a: { 0: 820000, 1: 1234500 }, r: { 1: 402000 }, p: { 0: 150000 } }, dl: { k: 20261125, s: 310000 }, reach: 5, cl: { a0: 1, rush: 0 }, stats: { plays: 14, kills: 812, graze: 640, bombs: 21, deaths: 30, bosses: 15, bossn: 4, maxChain: 42, stages: 9, conts: 3, nomiss: 2, items: 55, daily: 2, clr1: 0, shipn: 2, secs: 3100 }, ships: 3, set: { ship: 1, diff: 1, assist: 0, core: 0, gain: 13 }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'shmup save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~shmup~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'shmup save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~shmup~save': 'x' } }, A, { merge: true }));
    // のんびり釣り（fishing）：記録 kusoge.fishing.save だけを同期する（あそびかた .howto は端末だけ）
    await check(g, 'own push fishing save (book bit sets, bests, coins, gear, orders, tournament, aquarium, stats)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~fishing~save': { v: JSON.stringify({ v: 1, zc: 28, z: [107971199, 537983020, 1, 0, 0], b: { 0: 166, 1: 438 }, coins: 350, g: { r: 0, e: 0, n: 0, u: 0, a: [0, 0, 0, 0, 0], sb: 0, sl: -1 }, lc: 0, lm: 15, q: { k: 20261126, o: [], p: [], d: [], sp: [] }, tn: { k: 0, loc: 0, r: 0, s: 0, done: 0, w: 0, bt: 0 }, aq: { f: [], d: 0 }, set: { clk: 0, sn: 0, wide: 0, vib: 1, off: 1 }, ts: 0, stats: { catches: 28, casts: 40, big: 6, rare: 0, r5: 0, night: 0, rain: 0, orders: 0, earned: 347, away: 0, locs: 4, bought: 0 }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'fishing save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~fishing~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'fishing save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~fishing~save': 'x' } }, A, { merge: true }));
    // 麻雀工房（mahjong）：記録 kusoge.mahjong.save だけを同期する（とちゅうの対局 .run・あそびかた .howto は端末だけ）
    await check(g, 'own push mahjong save (best, per-mode tallies, stats, yaku counts, settings)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~mahjong~save': { v: JSON.stringify({ v: 1, best: 45000, g: { east: { p: 3, w: 1, r1: 1, r2: 1, r3: 1, r4: 0, b: 45000 } }, stats: { games: 5, hands: 30, agari: 12, tsumo: 5, ron: 7, 'mangan+': 1 }, y: { riichi: 4, tanyao: 5 }, set: { lv: 2, mode: 'east', aka: 1, uma: '10-20' }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'mahjong save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~mahjong~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'mahjong save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~mahjong~save': 'x' } }, A, { merge: true }));
    // チェス工房（chess）：記録 kusoge.chess.save だけを同期する（とちゅうのゲーム .game・ルールを見た .howto は端末だけ）
    await check(g, 'own push chess save (stars, per-level tallies, stats, settings, today\'s puzzle)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~chess~save': { v: JSON.stringify({ v: 1, pts: 28, cs: 2, w: { 1: { p: 3, w: 3, d: 0 }, 4: { p: 5, w: 3, d: 0 } }, stats: { plays: 17, wins: 12, draws: 2, losses: 3, l1: 3, l4: 3, castle: 9, ep: 1, promo: 5, mates: 10, hint: 2, undo: 3, wsb: 4, pz: 14, dperf: 1, onl: 0, onw: 0 }, set: { level: 4, me: 'r', tc: 2, legal: 1, auq: 0, pre: 0, fast: 0, fig: 1, coords: 1, af: 0 }, dl: { last: 20261125, pts: 700, r: [['g5c1', 1, 200], ['g2g7', 0, 0]] }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'chess save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~chess~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'chess save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~chess~save': 'x' } }, A, { merge: true }));
    // ワードウルフ（wordwolf）：記録 kusoge.wordwolf.save だけを同期する（あそびかた .howto は端末だけ）
    await check(g, 'own push wordwolf save (rank, stats, settings, recent pairs)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~wordwolf~save': { v: JSON.stringify({ v: 1, rank: 14, stats: { games: 12, wins: 4, soloGames: 6, soloWins: 4, local: 3, onl: 1, onw: 0, hints: 40, perfect: 2, maxpts: 3, bs: 3, two: 1, knows: 1, big: 1 }, set: { n: 6, lv: 0, minutes: 3, reveal: 'hold', rounds: 2, cpus: 4, skill: 2, cats: [], wolves: 2, knows: true }, recent: [3, 40, 77] }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'wordwolf save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~wordwolf~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'wordwolf save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~wordwolf~save': 'x' } }, A, { merge: true }));
    // ふわふわぱふ（puff）：記録 kusoge.puff.save だけを同期する（あそびかた .howto・画面のむき .ori・ヒント .tip は端末だけ）
    await check(g, 'own push puff save (stages as bit sets, medals, found abilities, stats, settings)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~puff~save': { v: JSON.stringify({ v: 1, pts: 9, lv: [31, 15, 1, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0, 0], stars: 140, stats: { plays: 8, clears: 3, deaths: 4, kills: 30, inhaled: 22, copies: 9, drops: 2, burn: 3, cut: 2, coop: 1 }, ab: 21, abn: 3, cl: 3, md: 6, all3: 0, nh: 1, wc: { 1: 3 }, set: { hearts: 0, two: 1, tc: 'auto' }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'puff save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~puff~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'puff save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~puff~save': 'x' } }, A, { merge: true }));
    // ぽかぽか島スポーツ（sports）：記録 kusoge.sports.save だけを同期する（あそびかた .howto・フォトアルバム .album は端末だけ）
    await check(g, 'own push sports save (bests per level, stats, flight record, bit sets, settings)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~sports~save': { v: JSON.stringify({ v: 1, pts: 13, b: { archery: [82, 50, 0], golf: [90, 0, 0] }, x: {}, dl: { k: 20261126, id: 'golf', sc: 70, st: 1 }, stats: { plays: 14, daily: 1, photos: 3 }, set: { sens: 1, tilt: 0, vib: 1, who: 1, lp: 0, last: { golf: 1 } }, fl: { b: [120, 0, 0], ph: 5, n: 2 }, tm: 33, tu: 33, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'sports save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~sports~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'sports save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~sports~save': 'x' } }, A, { merge: true }));
    // ぐるぐる星わたり（galaxy）：記録 kusoge.galaxy.save だけを同期する（あそびかた .howto・画面のむき .ori・ヒント .tip は端末だけ）
    await check(g, 'own push galaxy save (shard bits, best times, lumi bits, stats, settings)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~galaxy~save': { v: JSON.stringify({ v: 1, pts: 4, sh: { g1: 15, g2: 0 }, lm: { g1: 1 }, bt: { g1m1: 2400 }, cn: 120, cr: 3, stats: { plays: 9, clears: 6, jumps: 300 }, set: { sens: 1, ac: 1, rm: 0 }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'galaxy save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~galaxy~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'galaxy save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~galaxy~save': 'x' } }, A, { merge: true }));
    // ほしぞら守備隊（invade）：記録 kusoge.invade.save だけを同期する（ハイスコア .rank・あそびかた .howto・画面のむき .ori は端末だけ）
    await check(g, 'own push invade save (bests, wave bests, stars per stage, daily, stats, item and boss bits, settings)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~invade~save': { v: JSON.stringify({ v: 1, rank: 48210, best: { classic: 48210, survival: 9000 }, bw: { classic: 12, survival: 6 }, cs: [3, 2, 1, 0], cl: 3, st: 6, dl: { k: 20261127, s: 5200 }, stats: { plays: 14, kills: 640, saucers: 6, maxChain: 22 }, capm: 127, capn: 7, bossm: 3, bossn: 2, set: { auto: 2, fx: 0, shake: 1, tc: 'auto', gain: 12, pl: 0, assist: 0 }, tut: 31 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'invade save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~invade~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'invade save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~invade~save': 'x' } }, A, { merge: true }));
    // あてっこ（akin）：記録 kusoge.akin.save だけを同期する（おぼえたもの .custom・とちゅうの1問 .run・あそびかた .howto は端末だけ）
    await check(g, 'own push akin save (guesses = ranking, per-range and per-theme tallies, stats, settings)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~akin~save': { v: JSON.stringify({ v: 1, rk: 12, num: { r100: { p: 6, w: 5, b: 7 }, r1k: { p: 2, w: 2, b: 11 } }, th: { animals: { p: 4, w: 4, b: 8 }, foods: { p: 2, w: 1, b: 10 } }, stats: { plays: 15, wins: 12, losses: 3, nw: 7, tw: 5, fast: 1, m1: 0, cust: 0, quick: 1, recover: 1, learn: 2, back: 2, idk: 6, duo: 1 }, set: { hard: 0, peek: 1, sc: 3 }, tut: 1 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'akin save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~akin~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'akin save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~akin~save': 'x' } }, A, { merge: true }));
    // まなびの工房（manabi）：記録 kusoge.manabi.save だけを同期する（設定 prefs・howto・rep はこの端末だけ）
    await check(g, 'own push manabi save (xp, days, boxes, stats, quests, league)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~manabi~save': { v: JSON.stringify({ v: 1, xp: 1250, d: [20406, 20407], g: { 20407: 30 }, goal: 20, b: { 'ct-eng-u01': 'ab12:0112' }, st: { q: 150, ok: 127, ls: 12, mk: 1, best: 8 }, mk: { 'x-1': 62 }, set: { cr: 'JH', g: 0 }, tut: 1, gm: 40, fz: 1, hm: 0, hr: 5, cw: { S1: 2 }, ds: { d: 20407, xp: 30 }, dq: { d: 20407, c: [1, 0, 0] }, lg: { w: 2915, t: 1 }, sk: 0 }), t: now } }, updatedAt: now }, A, { merge: true }));
    await check(g, 'manabi save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~manabi~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'manabi save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~manabi~save': 'x' } }, A, { merge: true }));
    // 指揮者ゲーム（orchestra）：記録 kusoge.orchestra.save だけを同期する（設定 prefs・howto はこの端末だけ）
    await check(g, 'own push orchestra save (best scores, stars, stats)', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~orchestra~save': { v: JSON.stringify({ v: 1, total: 268, stars: 7, p: { beethoven5: { n: 3, b0: 80, s0: 3, b1: 71, s1: 2, b2: 0, s2: 0 } }, stats: { plays: 9, finishes: 8, cues: 61, perfect: 26, beats: 540, three: 2 }, set: { diff: 'normal', piece: 'beethoven5' }, tut: 1 }), t: now } } }, A, { merge: true }));
    await check(g, 'orchestra save entry v is a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~orchestra~save': { v: 7, t: now } } }, A, { merge: true }));
    await check(g, 'orchestra save entry is not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: { 'kusoge~orchestra~save': 'x' } }, A, { merge: true }));
    // 式の数の上限（1回の書き込みで1000）の確認。ルールは「この書き込みで変わるキー」だけを確かめる（firestore.rules の okEnt の上のコメント）。
    // 以前は、すでにあるキーも毎回ぜんぶ確かめていたので、キーが15個ほどになった人の書き込みが拒否されていた。
    {
      const keys = [...require('fs').readFileSync(require('path').join(__dirname, '../../../firestore.rules'), 'utf8').matchAll(/\(!\('([^']+)' in ch\)/g)].map(m => m[1]);
      const part = (a, b, v) => { const o = {}; for (const k of keys.slice(a, b)) o[k] = { v: v || '{"v":1}', t: now }; return o; };
      const U = await signUp(T);
      const N = keys.length;
      await check(g, `a new doc with 8 known keys in one write (the largest write common/cloud.js sends)`, 'allow', () => fsSet(T, `nejiUsers/${U.uid}`, { games: part(0, 8), updatedAt: now, level: 5, name: 'Taro Yamada' }, U, {}));
      let firstBad = -1;
      for (let i = 8; i < N; i += 8) {
        const r = await fsSet(T, `nejiUsers/${U.uid}`, { games: part(i, Math.min(N, i + 8)), updatedAt: now }, U, { merge: true });
        if (!r.ok && firstBad < 0) firstBad = i;
      }
      results.push({ group: g, name: `the doc grows to all ${N} known keys, 8 at a time (every write also carries all the keys already there)`, expect: 'allow', got: firstBad < 0 ? 'allow' : 'deny', pass: firstBad < 0, status: firstBad < 0 ? 200 : 403, detail: firstBad < 0 ? undefined : 'failed at key #' + firstBad });
      await check(g, `a full doc (${N} keys): change 8 keys at once`, 'allow', () => fsSet(T, `nejiUsers/${U.uid}`, { games: part(0, 8, '{"v":2}'), updatedAt: now + 1 }, U, { merge: true }));
      await check(g, `a full doc (${N} keys): change 1 key`, 'allow', () => fsSet(T, `nejiUsers/${U.uid}`, { games: { [keys[N - 1]]: { v: '{"v":3}', t: now + 2 } }, updatedAt: now + 2 }, U, { merge: true }));
      await check(g, `a full doc (${N} keys): a bad entry among the changed keys is still denied`, 'deny', () => fsSet(T, `nejiUsers/${U.uid}`, { games: Object.assign(part(0, 3), { 'kusoge~brawl~save': { v: 5, t: now } }), updatedAt: now }, U, { merge: true }));
      await check(g, `a full doc (${N} keys): an entry with an extra field is still denied`, 'deny', () => fsSet(T, `nejiUsers/${U.uid}`, { games: { 'kusoge~cards~save': { v: '{}', t: now, x: 1 } }, updatedAt: now }, U, { merge: true }));
      await check(g, `a new doc: an entry without v is denied`, 'deny', async () => { const V = await signUp(T); return fsSet(T, `nejiUsers/${V.uid}`, { games: { 'kusoge~fit~save': { t: now } } }, V, {}); });
      await check(g, `a full doc (${N} keys): an entry with v as a list is still denied`, 'deny', () => fsSet(T, `nejiUsers/${U.uid}`, { games: { 'kusoge~town~save': { v: ['x'], t: now } }, updatedAt: now }, U, { merge: true }));
      await check(g, `a full doc (${N} keys): a tombstone { v: null, t } for one key`, 'allow', () => fsSet(T, `nejiUsers/${U.uid}`, { games: { [keys[2]]: { v: null, t: now + 3 } }, updatedAt: now + 3 }, U, { merge: true }));
      await check(g, `a new doc with a bad entry among 3 good ones`, 'deny', async () => { const V = await signUp(T); return fsSet(T, `nejiUsers/${V.uid}`, { games: Object.assign(part(0, 3), { 'kusoge~town~save': { v: 1, t: now } }) }, V, {}); });
      await check(g, `games over 300 keys is still denied on an existing doc`, 'deny', () => { const m = {}; for (let i = 0; i < 301; i++) m['kobo~k' + i] = { v: '1', t: now }; return fsSet(T, `nejiUsers/${U.uid}`, { games: m }, U, { merge: true }); });
    }
    const many = {}; for (let i = 0; i < 301; i++) many['kobo~k' + i] = { v: '1', t: now };
    await check(g, 'games map with 301 keys', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: many }, A, { merge: true }));
    await check(g, 'level not a number', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { level: 'x' }, A, { merge: true }));
    await check(g, 'games not a map', 'deny', () => fsSet(T, `nejiUsers/${A.uid}`, { games: 'x' }, A, { merge: true }));
    await check(g, 'own reset (cloud.js fallback: set { games: {}, updatedAt })', 'allow', () => fsSet(T, `nejiUsers/${A.uid}`, { games: {}, updatedAt: now }, A));
    await check(g, 'other user delete', 'deny', () => fsDelete(T, `nejiUsers/${A.uid}`, B));
    await check(g, 'own delete (R24)', 'allow', () => fsDelete(T, `nejiUsers/${A.uid}`, A));
  }

  // ================================================================ Firestore: kusogeRanks（旧ランキング）
  {
    const g = 'fs:kusogeRanks';
    const ok = () => ({ name: 'ルールテスト', scores: { blocks: 900, hole: 1767 }, updatedAt: Date.now() });
    cleanup.push(() => fsDelete(T, `kusogeRanks/${A.uid}`, A), () => fsDelete(T, `kusogeRanks/${B.uid}`, B));
    await check(g, 'own write (cloud.js submitScores)', 'allow', () => fsSet(T, `kusogeRanks/${A.uid}`, ok(), A));
    await check(g, 'own write, guest (anonymous) with nickname', 'allow', () => fsSet(T, `kusogeRanks/${B.uid}`, { name: 'ゲスト', scores: {}, updatedAt: Date.now() }, B));
    // 旧ランキングは、前からあるゲームだけ（legacyGames()）。新しいゲーム（shmup・fishing 以降）は入れない。
    const NEW_AFTER_LEGACY = ['shmup', 'fishing', 'mahjong', 'chess', 'igo', 'akin', 'werewolf', 'wordwolf', 'puff', 'sports', 'galaxy', 'invade'];
    const LEGACY_CAPS = Object.fromEntries(Object.entries(CAPS).filter(([k]) => !NEW_AFTER_LEGACY.includes(k)));
    await check(g, 'own write, every legacy game at its cap', 'allow', () => fsSet(T, `kusogeRanks/${A.uid}`, { name: 'cap', scores: Object.assign({}, LEGACY_CAPS), updatedAt: Date.now() }, A));
    await check(g, 'own write, a game added after the legacy period is refused', 'deny', () => fsSet(T, `kusogeRanks/${A.uid}`, { name: 'cap', scores: { shmup: 1 }, updatedAt: Date.now() }, A));
    await check(g, 'own write, serverTimestamp updatedAt', 'allow', () => fsSet(T, `kusogeRanks/${A.uid}`, Object.assign(ok(), { updatedAt: SERVER_TIME }), A));
    await check(g, 'own write, 12-char name', 'allow', () => fsSet(T, `kusogeRanks/${A.uid}`, Object.assign(ok(), { name: 'あいうえおかきくけこさし' }), A));
    await check(g, 'public read (signed out)', 'allow', () => fsGet(T, `kusogeRanks/${A.uid}`, anon));
    await check(g, 'public list (old ranking page, limit 1000)', 'allow', () => fsList(T, '', 'kusogeRanks', anon, { limit: 1000 }));
    await check(g, 'other user write', 'deny', () => fsSet(T, `kusogeRanks/${A.uid}`, ok(), B));
    await check(g, 'signed-out write', 'deny', () => fsSet(T, `kusogeRanks/${C.uid}`, ok(), anon));
    await check(g, 'empty name', 'deny', () => fsSet(T, `kusogeRanks/${A.uid}`, Object.assign(ok(), { name: '' }), A));
    await check(g, '13-char name', 'deny', () => fsSet(T, `kusogeRanks/${A.uid}`, Object.assign(ok(), { name: 'あいうえおかきくけこさしす' }), A));
    for (const [game, cap] of Object.entries(CAPS)) {
      await check(g, `${game} over cap (${cap + 1})`, 'deny', () => fsSet(T, `kusogeRanks/${A.uid}`, Object.assign(ok(), { scores: { [game]: cap + 1 } }), A));
    }
    await check(g, 'negative score', 'deny', () => fsSet(T, `kusogeRanks/${A.uid}`, Object.assign(ok(), { scores: { blocks: -1 } }), A));
    await check(g, 'score as string', 'deny', () => fsSet(T, `kusogeRanks/${A.uid}`, Object.assign(ok(), { scores: { blocks: '900' } }), A));
    await check(g, 'unknown game id', 'deny', () => fsSet(T, `kusogeRanks/${A.uid}`, Object.assign(ok(), { scores: { tetris: 1 } }), A));
    await check(g, 'extra field', 'deny', () => fsSet(T, `kusogeRanks/${A.uid}`, Object.assign(ok(), { admin: true }), A));
    await check(g, 'missing updatedAt', 'deny', () => fsSet(T, `kusogeRanks/${A.uid}`, { name: 'x', scores: {} }, A));
    await check(g, 'updatedAt 2 hours old', 'deny', () => fsSet(T, `kusogeRanks/${A.uid}`, Object.assign(ok(), { updatedAt: Date.now() - 7200e3 }), A));
    await check(g, 'updatedAt 2 hours ahead', 'deny', () => fsSet(T, `kusogeRanks/${A.uid}`, Object.assign(ok(), { updatedAt: Date.now() + 7200e3 }), A));
    await check(g, 'updatedAt 10 minutes off (clock skew allowed)', 'allow', () => fsSet(T, `kusogeRanks/${A.uid}`, Object.assign(ok(), { updatedAt: Date.now() - 600e3 }), A));
    await check(g, 'other user delete', 'deny', () => fsDelete(T, `kusogeRanks/${A.uid}`, B));
    await check(g, 'own delete', 'allow', () => fsDelete(T, `kusogeRanks/${A.uid}`, A));
  }

  // ================================================================ Firestore: kbBoards（新しいランキング。P1-6 が使う）
  {
    const g = 'fs:kbBoards';
    const d = dayKey(), w = weekNo();
    const ent = (u, s, extra) => Object.assign({ u: u.uid, n: 'ルールテスト', s, t: SERVER_TIME }, extra || {});
    const boards = ['blocks~all', `blocks~d${d}`, `blocks~w${w}`, `water~c${d}`];
    for (const b of boards) cleanup.push(() => fsDelete(T, `kbBoards/${b}/e/${A.uid}`, A));
    cleanup.push(() => fsDelete(T, `kbBoards/blocks~all/r/${A.uid}`, A));
    await check(g, 'create own entry (all)', 'allow', () => fsSet(T, `kbBoards/blocks~all/e/${A.uid}`, ent(A, 500, { m: { dur: 180000, v: 1 } }), A));
    await check(g, `create own entry (today d${d})`, 'allow', () => fsSet(T, `kbBoards/blocks~d${d}/e/${A.uid}`, ent(A, 500), A));
    await check(g, `create own entry (this week w${w})`, 'allow', () => fsSet(T, `kbBoards/blocks~w${w}/e/${A.uid}`, ent(A, 500), A));
    await check(g, `create own entry (daily challenge c${d})`, 'allow', () => fsSet(T, `kbBoards/water~c${d}/e/${A.uid}`, ent(A, 99000), A));
    await check(g, 'old day board', 'deny', () => fsSet(T, `kbBoards/blocks~d20200101/e/${A.uid}`, ent(A, 500), A));
    await check(g, 'old week board', 'deny', () => fsSet(T, `kbBoards/blocks~w${w - 2}/e/${A.uid}`, ent(A, 500), A));
    await check(g, 'unknown game board', 'deny', () => fsSet(T, `kbBoards/tetris~all/e/${A.uid}`, ent(A, 500), A));
    await check(g, 'over cap', 'deny', () => fsSet(T, `kbBoards/hole~all/e/${A.uid}`, ent(A, CAPS.hole + 1), A));
    await check(g, 'zero score', 'deny', () => fsSet(T, `kbBoards/hole~all/e/${A.uid}`, ent(A, 0), A));
    await check(g, 'float score', 'deny', () => fsSet(T, `kbBoards/hole~all/e/${A.uid}`, ent(A, 1.5), A));
    await check(g, 'u is someone else', 'deny', () => fsSet(T, `kbBoards/hole~all/e/${A.uid}`, Object.assign(ent(A, 5), { u: B.uid }), A));
    await check(g, 'client clock t instead of server time', 'deny', () => fsSet(T, `kbBoards/hole~all/e/${A.uid}`, Object.assign(ent(A, 5), { t: new Date() }), A));
    await check(g, 'write someone else\'s entry', 'deny', () => fsSet(T, `kbBoards/blocks~all/e/${A.uid}`, ent(A, 900), B));
    await check(g, 'update lower score', 'deny', () => fsSet(T, `kbBoards/blocks~all/e/${A.uid}`, ent(A, 400), A));
    await check(g, 'update higher score within 5 s', 'deny', () => fsSet(T, `kbBoards/blocks~all/e/${A.uid}`, ent(A, 600), A));
    await sleep(5500);
    await check(g, 'update higher score after 5 s', 'allow', () => fsSet(T, `kbBoards/blocks~all/e/${A.uid}`, ent(A, 600), A));
    await check(g, 'get (signed out)', 'allow', () => fsGet(T, `kbBoards/blocks~all/e/${A.uid}`, anon));
    await check(g, 'list top 30', 'allow', () => fsList(T, 'kbBoards/blocks~all', 'e', anon, { limit: 30, orderBy: 's' }));
    await check(g, 'list without limit', 'deny', () => fsList(T, 'kbBoards/blocks~all', 'e', anon, {}));
    await check(g, 'list limit 51', 'deny', () => fsList(T, 'kbBoards/blocks~all', 'e', anon, { limit: 51 }));
    await check(g, 'replay create', 'allow', () => fsSet(T, `kbBoards/blocks~all/r/${A.uid}`, { d: 'abc', t: SERVER_TIME, v: 1 }, A));
    await check(g, 'replay over 20,000 chars', 'deny', () => fsSet(T, `kbBoards/blocks~all/r/${A.uid}`, { d: 'x'.repeat(20001), t: SERVER_TIME }, A));
    await check(g, 'replay list', 'deny', () => fsList(T, 'kbBoards/blocks~all', 'r', anon, { limit: 3 }));
    await check(g, 'other user delete entry', 'deny', () => fsDelete(T, `kbBoards/blocks~all/e/${A.uid}`, B));
  }

  // ================================================================ Firestore: kbProfiles / kbCodes / kbPlays / その他
  {
    const g = 'fs:kbProfiles';
    cleanup.push(() => fsDelete(T, `kbProfiles/${A.uid}`, A));
    const prof = extra => Object.assign({ n: 'ルールテスト', icon: 'hole', title: 'はじめて', lv: 3, xpw: 120, wk: weekNo(), t: SERVER_TIME }, extra || {});
    await check(g, 'create own profile', 'allow', () => fsSet(T, `kbProfiles/${A.uid}`, prof(), A));
    await check(g, 'update within 60 s', 'deny', () => fsSet(T, `kbProfiles/${A.uid}`, prof({ xpw: 130 }), A));
    await check(g, 'other user write', 'deny', () => fsSet(T, `kbProfiles/${B.uid}`, prof(), A));
    await check(g, 'xpw over 12000', 'deny', () => fsSet(T, `kbProfiles/${B.uid}`, prof({ xpw: 12001 }), B));
    await check(g, 'wrong week', 'deny', () => fsSet(T, `kbProfiles/${B.uid}`, prof({ wk: weekNo() - 1 }), B));
    await check(g, 'list top 30', 'allow', () => fsList(T, '', 'kbProfiles', anon, { limit: 30 }));

    const g2 = 'fs:kbCodes';
    const code = 'Z' + Array.from({ length: 7 }, () => '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'[Math.floor(Math.random() * 32)]).join('');
    cleanup.push(() => fsDelete(T, `kbCodes/${code}`, A));
    await check(g2, 'create own code', 'allow', () => fsSet(T, `kbCodes/${code}`, { u: A.uid, t: SERVER_TIME }, A));
    await check(g2, 'create code for someone else', 'deny', () => fsSet(T, `kbCodes/Z2345678`, { u: B.uid, t: SERVER_TIME }, A));
    await check(g2, 'bad code format', 'deny', () => fsSet(T, `kbCodes/abc`, { u: A.uid, t: SERVER_TIME }, A));
    await check(g2, 'get', 'allow', () => fsGet(T, `kbCodes/${code}`, B));
    await check(g2, 'list', 'deny', () => fsList(T, '', 'kbCodes', B, { limit: 5 }));
    await check(g2, 'overwrite (update) existing code', 'deny', () => fsSet(T, `kbCodes/${code}`, { u: B.uid, t: SERVER_TIME }, B));
    await check(g2, 'other user delete', 'deny', () => fsDelete(T, `kbCodes/${code}`, B));

    const g3 = 'fs:kbPlays';
    const wk = 'w' + weekNo();
    if (!live) {
      await check(g3, 'create this week +1', 'allow', () => fsSet(T, `kbPlays/${wk}`, { blocks: 1 }, A));
      await check(g3, 'update +1 one game', 'allow', () => fsSet(T, `kbPlays/${wk}`, { blocks: 2 }, B, { merge: true }));
    }
    if (!live) await check(g3, 'escape +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { escape: 1 }, A, { merge: true }));
    if (!live) await check(g3, 'td +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { td: 1 }, A, { merge: true }));
    if (!live) await check(g3, 'physics +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { physics: 1 }, A, { merge: true }));
    await check(g3, 'physics +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { physics: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'minigolf +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { minigolf: 1 }, A, { merge: true }));
    await check(g3, 'minigolf +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { minigolf: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'cards +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { cards: 1 }, A, { merge: true }));
    await check(g3, 'cards +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { cards: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'fit +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { fit: 1 }, A, { merge: true }));
    await check(g3, 'fit +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { fit: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'town +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { town: 1 }, A, { merge: true }));
    await check(g3, 'town +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { town: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'colorcards +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { colorcards: 1 }, A, { merge: true }));
    await check(g3, 'colorcards +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { colorcards: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'brawl +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { brawl: 1 }, A, { merge: true }));
    await check(g3, 'brawl +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { brawl: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'train +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { train: 1 }, A, { merge: true }));
    await check(g3, 'train +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { train: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'reversi +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { reversi: 1 }, A, { merge: true }));
    await check(g3, 'reversi +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { reversi: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'gomoku +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { gomoku: 1 }, A, { merge: true }));
    await check(g3, 'gomoku +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { gomoku: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'sudoku +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { sudoku: 1 }, A, { merge: true }));
    await check(g3, 'sudoku +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { sudoku: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'crates +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { crates: 1 }, A, { merge: true }));
    await check(g3, 'crates +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { crates: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'hop +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { hop: 1 }, A, { merge: true }));
    await check(g3, 'hop +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { hop: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'maze +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { maze: 1 }, A, { merge: true }));
    await check(g3, 'maze +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { maze: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'shmup +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { shmup: 1 }, A, { merge: true }));
    await check(g3, 'shmup +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { shmup: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'fishing +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { fishing: 1 }, A, { merge: true }));
    await check(g3, 'fishing +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { fishing: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'mahjong +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { mahjong: 1 }, A, { merge: true }));
    await check(g3, 'mahjong +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { mahjong: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'chess +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { chess: 1 }, A, { merge: true }));
    await check(g3, 'chess +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { chess: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'wordwolf +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { wordwolf: 1 }, A, { merge: true }));
    await check(g3, 'wordwolf +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { wordwolf: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'puff +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { puff: 1 }, A, { merge: true }));
    await check(g3, 'puff +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { puff: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'sports +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { sports: 1 }, A, { merge: true }));
    await check(g3, 'sports +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { sports: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'galaxy +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { galaxy: 1 }, A, { merge: true }));
    await check(g3, 'galaxy +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { galaxy: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'invade +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { invade: 1 }, A, { merge: true }));
    await check(g3, 'invade +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { invade: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'akin +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { akin: 1 }, A, { merge: true }));
    await check(g3, 'akin +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { akin: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'manabi +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { manabi: 1 }, A, { merge: true }));
    await check(g3, 'manabi +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { manabi: 9 }, A, { merge: true }));
    if (!live) await check(g3, 'orchestra +1 (new game in the list)', 'allow', () => fsSet(T, `kbPlays/${wk}`, { orchestra: 1 }, A, { merge: true }));
    await check(g3, 'orchestra +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { orchestra: 9 }, A, { merge: true }));
    await check(g3, 'td +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { td: 9 }, A, { merge: true }));
    await check(g3, 'escape +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { escape: 9 }, A, { merge: true }));
    await check(g3, 'update +2', 'deny', () => fsSet(T, `kbPlays/${wk}`, { blocks: 999999 }, B, { merge: true }));
    await check(g3, 'two games at once', 'deny', () => fsSet(T, `kbPlays/w${weekNo()}`, { drop: 1, raft: 1 }, B, { merge: true }));
    await check(g3, 'wrong week', 'deny', () => fsSet(T, `kbPlays/w${weekNo() - 1}`, { drop: 1 }, B));
    await check(g3, 'signed out', 'deny', () => fsSet(T, `kbPlays/${wk}`, { drop: 1 }, anon, { merge: true }));
    await check(g3, 'get', 'allow', () => fsGet(T, `kbPlays/${wk}`, anon));

    const g4 = 'fs:other';
    await check(g4, 'write unknown collection', 'deny', () => fsSet(T, `whatever/${A.uid}`, { x: 1 }, A));
    await check(g4, 'read unknown collection', 'deny', () => fsGet(T, `whatever/${A.uid}`, A));
  }

  // ================================================================ RTDB: vs（common/versus.js）
  {
    const g = 'rtdb:vs';
    const game = 'blocks';
    const room = rid('-rulestest');
    cleanup.push(() => rtdb(T, 'DELETE', `vs/queue/${game}/${A.uid}`, undefined, A), () => rtdb(T, 'DELETE', `vs/queue/${game}/${B.uid}`, undefined, B), () => rtdb(T, 'DELETE', `vs/rooms/${room}`, undefined, A));
    await check(g, 'queue: own set { n, t, h }', 'allow', () => rtdb(T, 'PUT', `vs/queue/${game}/${A.uid}`, { n: 'ライブA', t: TS, h: TS }, A));
    await check(g, 'queue: own heartbeat update { h }', 'allow', () => rtdb(T, 'PATCH', `vs/queue/${game}/${A.uid}`, { h: TS }, A));
    await check(g, 'queue: reconnect update { n, h } after removal', 'allow', () => rtdb(T, 'PATCH', `vs/queue/${game}/${B.uid}`, { n: 'LiveB', h: TS }, B));
    await check(g, 'queue: read the game queue', 'allow', () => rtdb(T, 'GET', `vs/queue/${game}`, undefined, C));
    await check(g, 'queue: read signed out', 'deny', () => rtdb(T, 'GET', `vs/queue/${game}`, undefined, anon));
    await check(g, 'queue: read all games at once', 'deny', () => rtdb(T, 'GET', `vs/queue`, undefined, C));
    await check(g, 'queue: write someone else\'s entry', 'deny', () => rtdb(T, 'PATCH', `vs/queue/${game}/${A.uid}`, { h: TS }, B));
    await check(g, 'queue: unknown game id', 'deny', () => rtdb(T, 'PUT', `vs/queue/tetris/${A.uid}`, { n: 'x', t: TS, h: TS }, A));
    await check(g, 'queue: 13-char nick', 'deny', () => rtdb(T, 'PUT', `vs/queue/${game}/${C.uid}`, { n: 'あいうえおかきくけこさしす', t: TS }, C));
    await check(g, 'queue: extra field', 'deny', () => rtdb(T, 'PATCH', `vs/queue/${game}/${A.uid}`, { x: 1 }, A));
    await check(g, 'queue: t in the future', 'deny', () => rtdb(T, 'PATCH', `vs/queue/${game}/${A.uid}`, { t: Date.now() + 3600e3 }, A));

    const meta = h => ({ g: game, at: TS, sd: 12345, h: h.uid, inv: { [A.uid]: 1, [B.uid]: 1 }, dur: 20, v: 1 });
    await check(g, 'room: create as someone else (h != me)', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}`, meta(A), C));
    await check(g, 'room: create with members pre-filled', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}`, Object.assign(meta(A), { m: { [C.uid]: { n: 'x' } } }), A));
    await check(g, 'room: create with unknown game', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}`, Object.assign(meta(A), { g: 'tetris' }), A));
    await check(g, 'room: create (versus.js create)', 'allow', () => rtdb(T, 'PUT', `vs/rooms/${room}`, meta(A), A));
    await check(g, 'queue: creator marks room { r, m }', 'allow', () => rtdb(T, 'PATCH', `vs/queue/${game}/${A.uid}`, { r: room, m: [A.uid, B.uid] }, A));
    await check(g, 'room: overwrite whole existing room', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}`, meta(A), A));
    await check(g, 'room: change seed after creation (creator)', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/sd`, 1, A));
    await check(g, 'room: change inv after creation (outsider)', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/inv/${C.uid}`, 1, C));
    await check(g, 'room: read', 'allow', () => rtdb(T, 'GET', `vs/rooms/${room}`, undefined, B));
    await check(g, 'room: list all rooms', 'deny', () => rtdb(T, 'GET', `vs/rooms`, undefined, B));
    await check(g, 'member: creator joins m/{me} { n, j }', 'allow', () => rtdb(T, 'PUT', `vs/rooms/${room}/m/${A.uid}`, { n: 'ライブA', j: TS }, A));
    await check(g, 'member: invited joins m/{me}', 'allow', () => rtdb(T, 'PUT', `vs/rooms/${room}/m/${B.uid}`, { n: 'LiveB', j: TS }, B));
    await check(g, 'member: reconnect update { n }', 'allow', () => rtdb(T, 'PATCH', `vs/rooms/${room}/m/${B.uid}`, { n: 'LiveB' }, B));
    await check(g, 'member: not invited joins', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/m/${C.uid}`, { n: 'C', j: TS }, C));
    await check(g, 'member: write someone else\'s m', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/m/${A.uid}`, { n: 'evil', j: TS }, B));
    await check(g, 'member: remove someone else\'s m', 'deny', () => rtdb(T, 'DELETE', `vs/rooms/${room}/m/${A.uid}`, undefined, B));
    const go = { pl: [A.uid, B.uid], n: { [A.uid]: 'ライブA', [B.uid]: 'LiveB' }, st: Date.now() + 3600, dur: 20 };
    await check(g, 'go: by non-creator', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/go`, go, B));
    await check(g, 'go: by creator (start signal)', 'allow', () => rtdb(T, 'PUT', `vs/rooms/${room}/go`, go, A));
    await check(g, 'go: second time', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/go`, go, A));
    await check(g, 's: own live score', 'allow', () => rtdb(T, 'PUT', `vs/rooms/${room}/s/${B.uid}`, 120, B));
    await check(g, 's+f: own final score (multi-path update)', 'allow', () => rtdb(T, 'PATCH', `vs/rooms/${room}`, { [`s/${A.uid}`]: 300, [`f/${A.uid}`]: 300 }, A));
    await check(g, 's: someone else\'s score', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/s/${A.uid}`, 0, B));
    await check(g, 'f: someone else\'s final', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/f/${A.uid}`, 0, B));
    await check(g, 's: negative', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/s/${B.uid}`, -5, B));
    await check(g, 's: string', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/s/${B.uid}`, '120', B));
    await check(g, 's: over 1e9', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/s/${B.uid}`, 1e9 + 1, B));
    await check(g, 's: outsider', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/s/${C.uid}`, 1, C));
    const res = { at: TS, r: [{ u: A.uid, n: 'ライブA', v: 300, x: 0 }, { u: B.uid, n: 'LiveB', v: 120, x: 0 }] };
    await check(g, 'res: outsider', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/res`, res, C));
    await check(g, 'res: member (deciding player)', 'allow', () => rtdb(T, 'PUT', `vs/rooms/${room}/res`, res, B));
    await check(g, 'res: overwrite', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/res`, res, A));
    await check(g, 'room: delete by outsider (fresh room)', 'deny', () => rtdb(T, 'DELETE', `vs/rooms/${room}`, undefined, C));
    await check(g, 'member: own leave (remove m/{me})', 'allow', () => rtdb(T, 'DELETE', `vs/rooms/${room}/m/${B.uid}`, undefined, B));
    await check(g, 'room: delete by a member (cleanup after the match)', 'allow', () => rtdb(T, 'DELETE', `vs/rooms/${room}`, undefined, B));
    await check(g, 'member: own m remove after room is gone', 'allow', () => rtdb(T, 'DELETE', `vs/rooms/${room}/m/${B.uid}`, undefined, B));
    await check(g, 'member: write into a deleted room', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/m/${B.uid}`, { n: 'LiveB' }, B));
    await check(g, 's: write into a deleted room', 'deny', () => rtdb(T, 'PUT', `vs/rooms/${room}/s/${B.uid}`, 1, B));
    const room2 = rid('-rulestest');
    await check(g, 'room: create then creator removes it (gen changed)', 'allow', async () => { const r = await rtdb(T, 'PUT', `vs/rooms/${room2}`, meta(A), A); if (!r.ok) return r; return rtdb(T, 'DELETE', `vs/rooms/${room2}`, undefined, A); });
    const room3 = rid('-rulestest');
    cleanup.push(() => rtdb(T, 'DELETE', `vs/rooms/${room3}`, undefined, A));
    await rtdb(T, 'PUT', `vs/rooms/${room3}`, Object.assign(meta(A), { at: Date.now() - 2 * 3600e3 }), A);
    await check(g, 'room: anyone removes a room older than 30 min (R13)', 'allow', () => rtdb(T, 'DELETE', `vs/rooms/${room3}`, undefined, C));
    await check(g, 'queue: own remove', 'allow', () => rtdb(T, 'DELETE', `vs/queue/${game}/${A.uid}`, undefined, A));
    await check(g, 'queue: remove someone else\'s', 'deny', () => rtdb(T, 'DELETE', `vs/queue/${game}/${B.uid}`, undefined, A));

    // fit (ぴったりパズル工房) joins the battle games: its queue and its rooms are accepted like any other game's
    const fit = 'fit', roomFit = rid('-rulestest');
    cleanup.push(() => rtdb(T, 'DELETE', `vs/queue/${fit}/${A.uid}`, undefined, A), () => rtdb(T, 'DELETE', `vs/rooms/${roomFit}`, undefined, A));
    await check(g, 'fit: queue own set { n, t, h }', 'allow', () => rtdb(T, 'PUT', `vs/queue/${fit}/${A.uid}`, { n: 'ライブA', t: TS, h: TS }, A));
    await check(g, 'fit: read the game queue', 'allow', () => rtdb(T, 'GET', `vs/queue/${fit}`, undefined, C));
    await check(g, 'fit: room create with g = fit', 'allow', () => rtdb(T, 'PUT', `vs/rooms/${roomFit}`, Object.assign(meta(A), { g: fit }), A));
    await check(g, 'fit: a look-alike id (fitx) is still unknown', 'deny', () => rtdb(T, 'PUT', `vs/queue/fitx/${A.uid}`, { n: 'x', t: TS, h: TS }, A));
    await check(g, 'fit: queue own remove', 'allow', () => rtdb(T, 'DELETE', `vs/queue/${fit}/${A.uid}`, undefined, A));
    await check(g, 'fit: room delete by the creator', 'allow', () => rtdb(T, 'DELETE', `vs/rooms/${roomFit}`, undefined, A));

    // minigolf (ころがし工房ゴルフ) joins the battle games: its queue and its rooms are accepted like any other game's
    const golf = 'minigolf', roomGolf = rid('-rulestest');
    cleanup.push(() => rtdb(T, 'DELETE', `vs/queue/${golf}/${A.uid}`, undefined, A), () => rtdb(T, 'DELETE', `vs/rooms/${roomGolf}`, undefined, A));
    await check(g, 'minigolf: queue own set { n, t, h }', 'allow', () => rtdb(T, 'PUT', `vs/queue/${golf}/${A.uid}`, { n: 'ライブA', t: TS, h: TS }, A));
    await check(g, 'minigolf: read the game queue', 'allow', () => rtdb(T, 'GET', `vs/queue/${golf}`, undefined, C));
    await check(g, 'minigolf: room create with g = minigolf', 'allow', () => rtdb(T, 'PUT', `vs/rooms/${roomGolf}`, Object.assign(meta(A), { g: golf }), A));
    await check(g, 'minigolf: a look-alike id (minigolfx) is still unknown', 'deny', () => rtdb(T, 'PUT', `vs/queue/minigolfx/${A.uid}`, { n: 'x', t: TS, h: TS }, A));
    await check(g, 'minigolf: queue own remove', 'allow', () => rtdb(T, 'DELETE', `vs/queue/${golf}/${A.uid}`, undefined, A));
    await check(g, 'minigolf: room delete by the creator', 'allow', () => rtdb(T, 'DELETE', `vs/rooms/${roomGolf}`, undefined, A));

    // sudoku (ナンバー工房) joins the battle games: its queue and its rooms are accepted like any other game's
    const sdk = 'sudoku', roomSdk = rid('-rulestest');
    cleanup.push(() => rtdb(T, 'DELETE', `vs/queue/${sdk}/${A.uid}`, undefined, A), () => rtdb(T, 'DELETE', `vs/rooms/${roomSdk}`, undefined, A));
    await check(g, 'sudoku: queue own set { n, t, h }', 'allow', () => rtdb(T, 'PUT', `vs/queue/${sdk}/${A.uid}`, { n: 'ライブA', t: TS, h: TS }, A));
    await check(g, 'sudoku: read the game queue', 'allow', () => rtdb(T, 'GET', `vs/queue/${sdk}`, undefined, C));
    await check(g, 'sudoku: room create with g = sudoku', 'allow', () => rtdb(T, 'PUT', `vs/rooms/${roomSdk}`, Object.assign(meta(A), { g: sdk }), A));
    await check(g, 'sudoku: a look-alike id (sudokux) is still unknown', 'deny', () => rtdb(T, 'PUT', `vs/queue/sudokux/${A.uid}`, { n: 'x', t: TS, h: TS }, A));
    await check(g, 'sudoku: queue own remove', 'allow', () => rtdb(T, 'DELETE', `vs/queue/${sdk}/${A.uid}`, undefined, A));
    await check(g, 'sudoku: room delete by the creator', 'allow', () => rtdb(T, 'DELETE', `vs/rooms/${roomSdk}`, undefined, A));

    // planet (わくせいシミュレーター) joins the battle games: its queue and its rooms are accepted like any other game's
    const planet = 'planet', roomPlanet = rid('-rulestest');
    cleanup.push(() => rtdb(T, 'DELETE', `vs/queue/${planet}/${A.uid}`, undefined, A), () => rtdb(T, 'DELETE', `vs/rooms/${roomPlanet}`, undefined, A));
    await check(g, 'planet: queue own set { n, t, h }', 'allow', () => rtdb(T, 'PUT', `vs/queue/${planet}/${A.uid}`, { n: 'ライブA', t: TS, h: TS }, A));
    await check(g, 'planet: read the game queue', 'allow', () => rtdb(T, 'GET', `vs/queue/${planet}`, undefined, C));
    await check(g, 'planet: room create with g = planet', 'allow', () => rtdb(T, 'PUT', `vs/rooms/${roomPlanet}`, Object.assign(meta(A), { g: planet }), A));
    await check(g, 'planet: a look-alike id (planetx) is still unknown', 'deny', () => rtdb(T, 'PUT', `vs/queue/planetx/${A.uid}`, { n: 'x', t: TS, h: TS }, A));
    await check(g, 'planet: queue own remove', 'allow', () => rtdb(T, 'DELETE', `vs/queue/${planet}/${A.uid}`, undefined, A));
    await check(g, 'planet: room delete by the creator', 'allow', () => rtdb(T, 'DELETE', `vs/rooms/${roomPlanet}`, undefined, A));
  }

  // ================================================================ RTDB: hole（hole/index.html）
  {
    const g = 'rtdb:hole';
    const room = rid('-rulestest');
    cleanup.push(() => rtdb(T, 'DELETE', `hole/queue/${A.uid}`, undefined, A), () => rtdb(T, 'DELETE', `hole/queue/${B.uid}`, undefined, B), () => rtdb(T, 'DELETE', `hole/rooms/${room}`, undefined, A));
    await check(g, 'queue: own set { n, s, t }', 'allow', () => rtdb(T, 'PUT', `hole/queue/${A.uid}`, { n: 'Aoi', s: 'kuro', t: TS }, A));
    await check(g, 'queue: creator marks room { r, m }', 'allow', () => rtdb(T, 'PATCH', `hole/queue/${A.uid}`, { r: room, m: [A.uid, B.uid] }, A));
    await check(g, 'queue: reconnect update { n, s }', 'allow', () => rtdb(T, 'PATCH', `hole/queue/${B.uid}`, { n: 'Ben', s: 'kuro' }, B));
    await check(g, 'queue: read', 'allow', () => rtdb(T, 'GET', `hole/queue`, undefined, C));
    await check(g, 'queue: someone else\'s entry', 'deny', () => rtdb(T, 'PATCH', `hole/queue/${A.uid}`, { n: 'evil' }, B));
    await check(g, 'queue: extra field', 'deny', () => rtdb(T, 'PATCH', `hole/queue/${A.uid}`, { x: 1 }, A));
    await check(g, 'queue: m with 5 entries', 'deny', () => rtdb(T, 'PATCH', `hole/queue/${A.uid}`, { m: ['a', 'b', 'c', 'd', 'e'] }, A));
    const meta = { at: TS, c: 3, sd: 777, h: A.uid, inv: { [A.uid]: 1, [B.uid]: 1 } };
    await check(g, 'room: create as someone else', 'deny', () => rtdb(T, 'PUT', `hole/rooms/${room}`, Object.assign({}, meta, { h: A.uid }), C));
    await check(g, 'room: create with city out of range', 'deny', () => rtdb(T, 'PUT', `hole/rooms/${room}`, Object.assign({}, meta, { c: 500 }), A));
    await check(g, 'room: create with start signal pre-filled', 'deny', () => rtdb(T, 'PUT', `hole/rooms/${room}`, Object.assign({}, meta, { g: { pl: [A.uid], b: 3, st: 1 } }), A));
    await check(g, 'room: create (netCreate)', 'allow', () => rtdb(T, 'PUT', `hole/rooms/${room}`, meta, A));
    await check(g, 'room: change city after creation', 'deny', () => rtdb(T, 'PUT', `hole/rooms/${room}/c`, 1, A));
    await check(g, 'room: unknown child', 'deny', () => rtdb(T, 'PUT', `hole/rooms/${room}/lt`, { d: 1 }, A));
    await check(g, 'member: creator joins { n, s, j }', 'allow', () => rtdb(T, 'PUT', `hole/rooms/${room}/m/${A.uid}`, { n: 'Aoi', s: 'kuro', j: TS }, A));
    await check(g, 'member: invited joins', 'allow', () => rtdb(T, 'PUT', `hole/rooms/${room}/m/${B.uid}`, { n: 'Ben', s: 'kuro', j: TS }, B));
    await check(g, 'member: reconnect update { n, s }', 'allow', () => rtdb(T, 'PATCH', `hole/rooms/${room}/m/${B.uid}`, { n: 'Ben', s: 'kuro' }, B));
    await check(g, 'member: not invited', 'deny', () => rtdb(T, 'PUT', `hole/rooms/${room}/m/${C.uid}`, { n: 'C', s: 'kuro', j: TS }, C));
    const gs = { pl: [A.uid, B.uid], b: 2, st: Date.now() + 3500, len: 120 };
    await check(g, 'g: start signal by non-creator', 'deny', () => rtdb(T, 'PUT', `hole/rooms/${room}/g`, gs, B));
    await check(g, 'g: start signal by creator', 'allow', () => rtdb(T, 'PUT', `hole/rooms/${room}/g`, gs, A));
    await check(g, 'g: second start signal', 'deny', () => rtdb(T, 'PUT', `hole/rooms/${room}/g`, gs, A));
    const st = p => ({ x: 12.3, z: -40.1, p, a: 1, v: 0, k: 0, e: 3, i: 0, t: Date.now() });
    await check(g, 'p: host sends own + CPU holes b1,b2 (one update)', 'allow', () => rtdb(T, 'PATCH', `hole/rooms/${room}/p`, { [A.uid]: st(10), b1: st(5), b2: st(7) }, A));
    await check(g, 'p: guest sends own state', 'allow', () => rtdb(T, 'PATCH', `hole/rooms/${room}/p`, { [B.uid]: st(8) }, B));
    await check(g, 'p: guest who became host sends CPU holes', 'allow', () => rtdb(T, 'PATCH', `hole/rooms/${room}/p`, { [B.uid]: st(9), b1: st(6) }, B));
    await check(g, 'p: someone else\'s hole', 'deny', () => rtdb(T, 'PATCH', `hole/rooms/${room}/p`, { [A.uid]: st(0) }, B));
    await check(g, 'p: own + someone else\'s in one update (all-or-nothing)', 'deny', () => rtdb(T, 'PATCH', `hole/rooms/${room}/p`, { [B.uid]: st(9), [A.uid]: st(0) }, B));
    await check(g, 'p: outsider', 'deny', () => rtdb(T, 'PATCH', `hole/rooms/${room}/p`, { [C.uid]: st(1) }, C));
    await check(g, 'p: unknown CPU id b9', 'deny', () => rtdb(T, 'PATCH', `hole/rooms/${room}/p`, { b9: st(1) }, A));
    await check(g, 'p: negative points', 'deny', () => rtdb(T, 'PATCH', `hole/rooms/${room}/p`, { [B.uid]: st(-1) }, B));
    await check(g, 'p: points over 1e6', 'deny', () => rtdb(T, 'PATCH', `hole/rooms/${room}/p`, { [B.uid]: st(1e6 + 1) }, B));
    await check(g, 'p: extra field', 'deny', () => rtdb(T, 'PATCH', `hole/rooms/${room}/p`, { [B.uid]: Object.assign(st(1), { hack: 1 }) }, B));
    await check(g, 'o: claim an object (transaction)', 'allow', () => rtdb(T, 'PUT', `hole/rooms/${room}/o/17`, { u: B.uid, t: Date.now() }, B));
    await check(g, 'o: host claims for a CPU hole', 'allow', () => rtdb(T, 'PUT', `hole/rooms/${room}/o/18`, { u: 'b1', t: Date.now() }, A));
    await check(g, 'o: steal a fresh claim', 'deny', () => rtdb(T, 'PUT', `hole/rooms/${room}/o/17`, { u: A.uid, t: Date.now() }, A));
    await check(g, 'o: claim in someone else\'s name', 'deny', () => rtdb(T, 'PUT', `hole/rooms/${room}/o/19`, { u: A.uid, t: Date.now() }, B));
    await check(g, 'o: outsider', 'deny', () => rtdb(T, 'PUT', `hole/rooms/${room}/o/20`, { u: C.uid, t: Date.now() }, C));
    await check(g, 'o: remove a claim', 'deny', () => rtdb(T, 'DELETE', `hole/rooms/${room}/o/17`, undefined, B));
    await check(g, 'k: victim reports own death (push)', 'allow', () => rtdb(T, 'POST', `hole/rooms/${room}/k`, { v: B.uid, b: A.uid, p: 20 }, B));
    await check(g, 'k: host reports a CPU hole\'s death', 'allow', () => rtdb(T, 'POST', `hole/rooms/${room}/k`, { v: 'b2', b: B.uid, p: 14 }, A));
    await check(g, 'k: report someone else\'s death', 'deny', () => rtdb(T, 'POST', `hole/rooms/${room}/k`, { v: A.uid, b: B.uid, p: 999 }, B));
    await check(g, 'k: outsider', 'deny', () => rtdb(T, 'POST', `hole/rooms/${room}/k`, { v: C.uid, b: A.uid, p: 1 }, C));
    await check(g, 'k: bonus over 1e6', 'deny', () => rtdb(T, 'POST', `hole/rooms/${room}/k`, { v: B.uid, b: A.uid, p: 2e6 }, B));
    await check(g, 'member: own leave (remove m and p)', 'allow', async () => { const r = await rtdb(T, 'DELETE', `hole/rooms/${room}/m/${B.uid}`, undefined, B); if (!r.ok) return r; return rtdb(T, 'DELETE', `hole/rooms/${room}/p/${B.uid}`, undefined, B); });
    await check(g, 'room: delete by outsider', 'deny', () => rtdb(T, 'DELETE', `hole/rooms/${room}`, undefined, C));
    await check(g, 'room: delete by the host after the round', 'allow', () => rtdb(T, 'DELETE', `hole/rooms/${room}`, undefined, A));
    await check(g, 'member: own m/p remove after room is gone (netLeave)', 'allow', async () => { const r = await rtdb(T, 'DELETE', `hole/rooms/${room}/m/${A.uid}`, undefined, A); if (!r.ok) return r; return rtdb(T, 'DELETE', `hole/rooms/${room}/p/${A.uid}`, undefined, A); });
    await check(g, 'p: write into a deleted room', 'deny', () => rtdb(T, 'PATCH', `hole/rooms/${room}/p`, { [B.uid]: st(1) }, B));
    await check(g, 'queue: own remove', 'allow', () => rtdb(T, 'DELETE', `hole/queue/${A.uid}`, undefined, A));
  }

  // ================================================================ RTDB: shogi（shogi/index.html）
  {
    const g = 'rtdb:shogi';
    const room = rid('-rulestest'), code = String(100000 + Math.floor(Math.random() * 900000));
    cleanup.push(() => rtdb(T, 'DELETE', `shogi/queue/${A.uid}`, undefined, A), () => rtdb(T, 'DELETE', `shogi/rooms/${room}`, undefined, A), () => rtdb(T, 'DELETE', `shogi/codes/${code}`, undefined, A));
    await check(g, 'queue: own set { n, t, c, e }', 'allow', () => rtdb(T, 'PUT', `shogi/queue/${A.uid}`, { n: 'Aoi', t: TS, c: 1, e: 1500 }, A));
    await check(g, 'queue: creator marks room { r, m }', 'allow', () => rtdb(T, 'PATCH', `shogi/queue/${A.uid}`, { r: room, m: [A.uid, B.uid] }, A));
    await check(g, 'queue: read', 'allow', () => rtdb(T, 'GET', `shogi/queue`, undefined, C));
    await check(g, 'queue: someone else\'s entry', 'deny', () => rtdb(T, 'PATCH', `shogi/queue/${A.uid}`, { n: 'evil' }, B));
    await check(g, 'queue: unknown time control', 'deny', () => rtdb(T, 'PATCH', `shogi/queue/${A.uid}`, { c: 7 }, A));
    await check(g, 'queue: extra field', 'deny', () => rtdb(T, 'PATCH', `shogi/queue/${A.uid}`, { x: 1 }, A));
    // friend codes
    await check(g, 'code: create as someone else', 'deny', () => rtdb(T, 'PUT', `shogi/codes/${code}`, { h: A.uid, t: TS, c: 0 }, B));
    await check(g, 'code: not 6 digits', 'deny', () => rtdb(T, 'PUT', `shogi/codes/12ab56`, { h: A.uid, t: TS, c: 0 }, A));
    await check(g, 'code: create (host)', 'allow', () => rtdb(T, 'PUT', `shogi/codes/${code}`, { h: A.uid, t: TS, c: 0 }, A));
    await check(g, 'code: overwrite an existing code', 'deny', () => rtdb(T, 'PUT', `shogi/codes/${code}`, { h: C.uid, t: TS, c: 0 }, C));
    await check(g, 'code: read one code', 'allow', () => rtdb(T, 'GET', `shogi/codes/${code}`, undefined, B));
    await check(g, 'code: list all codes', 'deny', () => rtdb(T, 'GET', `shogi/codes`, undefined, B));
    await check(g, 'code: guest writes g in someone else\'s name', 'deny', () => rtdb(T, 'PUT', `shogi/codes/${code}/g`, C.uid, B));
    await check(g, 'code: guest joins (g = me)', 'allow', () => rtdb(T, 'PUT', `shogi/codes/${code}/g`, B.uid, B));
    await check(g, 'code: a second guest', 'deny', () => rtdb(T, 'PUT', `shogi/codes/${code}/g`, C.uid, C));
    await check(g, 'code: guest writes the room id', 'deny', () => rtdb(T, 'PUT', `shogi/codes/${code}/r`, room, B));
    await check(g, 'code: host writes the room id', 'allow', () => rtdb(T, 'PUT', `shogi/codes/${code}/r`, room, A));
    await check(g, 'code: outsider removes it', 'deny', () => rtdb(T, 'DELETE', `shogi/codes/${code}`, undefined, C));
    await check(g, 'code: guest removes it', 'allow', () => rtdb(T, 'DELETE', `shogi/codes/${code}`, undefined, B));
    // the room
    const meta = { at: TS, h: A.uid, inv: { [A.uid]: 1, [B.uid]: 1 }, b: A.uid, w: B.uid, c: 1, tm: 0, by: 30 };
    await check(g, 'room: create as someone else', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}`, meta, C));
    await check(g, 'room: black is not invited', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}`, Object.assign({}, meta, { b: C.uid }), A));
    await check(g, 'room: black == white', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}`, Object.assign({}, meta, { w: A.uid }), A));
    await check(g, 'room: create with moves pre-filled', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}`, Object.assign({}, meta, { n: 1, mv: { 0: { m: '7g7f', t: TS, i: 0 } } }), A));
    await check(g, 'room: byoyomi over 60 s', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}`, Object.assign({}, meta, { by: 600 }), A));
    await check(g, 'room: create (netCreate)', 'allow', () => rtdb(T, 'PUT', `shogi/rooms/${room}`, meta, A));
    await check(g, 'room: overwrite whole existing room', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}`, meta, A));
    await check(g, 'room: change colours after creation', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/b`, B.uid, A));
    await check(g, 'room: unknown child', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/x`, 1, A));
    await check(g, 'room: list all rooms', 'deny', () => rtdb(T, 'GET', `shogi/rooms`, undefined, B));
    await check(g, 'member: creator joins { n, j, e }', 'allow', () => rtdb(T, 'PUT', `shogi/rooms/${room}/m/${A.uid}`, { n: 'Aoi', j: TS, e: 1500 }, A));
    await check(g, 'member: invited joins', 'allow', () => rtdb(T, 'PUT', `shogi/rooms/${room}/m/${B.uid}`, { n: 'Ben', j: TS, e: 1480 }, B));
    await check(g, 'member: not invited', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/m/${C.uid}`, { n: 'C', j: TS }, C));
    const mv = (i, m) => ({ [`mv/${i}`]: { m, t: TS, i }, n: i + 1 });
    await check(g, 'move: before the start', 'deny', () => rtdb(T, 'PATCH', `shogi/rooms/${room}`, mv(0, '7g7f'), A));
    await check(g, 'st: outsider starts the clock', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/st`, TS, C));
    await check(g, 'st: client clock instead of server time', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/st`, Date.now(), A));
    await check(g, 'st: member starts the clock (server time)', 'allow', () => rtdb(T, 'PUT', `shogi/rooms/${room}/st`, TS, A));
    await check(g, 'st: second time', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/st`, TS, A));
    await check(g, 'move: white moves first', 'deny', () => rtdb(T, 'PATCH', `shogi/rooms/${room}`, mv(0, '3c3d'), B));
    await check(g, 'move: outsider', 'deny', () => rtdb(T, 'PATCH', `shogi/rooms/${room}`, mv(0, '7g7f'), C));
    await check(g, 'move: without the counter', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/mv/0`, { m: '7g7f', t: TS, i: 0 }, A));
    await check(g, 'move: counter without the move', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/n`, 1, A));
    await check(g, 'move: wrong index (skips 0)', 'deny', () => rtdb(T, 'PATCH', `shogi/rooms/${room}`, { 'mv/1': { m: '7g7f', t: TS, i: 1 }, n: 2 }, A));
    await check(g, 'move: client clock', 'deny', () => rtdb(T, 'PATCH', `shogi/rooms/${room}`, { 'mv/0': { m: '7g7f', t: Date.now(), i: 0 }, n: 1 }, A));
    await check(g, 'move: not a move string', 'deny', () => rtdb(T, 'PATCH', `shogi/rooms/${room}`, mv(0, 'hello'), A));
    await check(g, 'move: black plays move 0', 'allow', () => rtdb(T, 'PATCH', `shogi/rooms/${room}`, mv(0, '7g7f'), A));
    await check(g, 'move: black again (not its turn)', 'deny', () => rtdb(T, 'PATCH', `shogi/rooms/${room}`, mv(1, '2g2f'), A));
    await check(g, 'move: rewrite move 0', 'deny', () => rtdb(T, 'PATCH', `shogi/rooms/${room}`, { 'mv/0': { m: '2g2f', t: TS, i: 0 }, n: 1 }, A));
    await check(g, 'move: third user plays for white', 'deny', () => rtdb(T, 'PATCH', `shogi/rooms/${room}`, mv(1, '3c3d'), C));
    await check(g, 'move: white plays move 1', 'allow', () => rtdb(T, 'PATCH', `shogi/rooms/${room}`, mv(1, '3c3d'), B));
    await check(g, 'move: delete a move', 'deny', () => rtdb(T, 'DELETE', `shogi/rooms/${room}/mv/1`, undefined, B));
    await check(g, 'move: counter back to 0', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/n`, 0, A));
    await check(g, 'rm: own rematch wish', 'allow', () => rtdb(T, 'PUT', `shogi/rooms/${room}/rm/${A.uid}`, 1, A));
    await check(g, 'rm: in someone else\'s name', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/rm/${B.uid}`, 1, A));
    const end = by => ({ r: 'resign', w: 'b', by: by.uid, t: TS, n: 2 });
    await check(g, 'end: outsider', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/end`, end(C), C));
    await check(g, 'end: in someone else\'s name', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/end`, end(A), B));
    await check(g, 'end: unknown reason', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/end`, Object.assign(end(B), { r: 'cheat' }), B));
    await check(g, 'end: member (white resigns)', 'allow', () => rtdb(T, 'PUT', `shogi/rooms/${room}/end`, end(B), B));
    await check(g, 'end: overwrite', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/end`, Object.assign(end(A), { w: 'w' }), A));
    await check(g, 'move: after the end', 'deny', () => rtdb(T, 'PATCH', `shogi/rooms/${room}`, mv(2, '2g2f'), A));
    await check(g, 'nx: outsider', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/nx`, '-next', C));
    await check(g, 'nx: member points to the rematch room', 'allow', () => rtdb(T, 'PUT', `shogi/rooms/${room}/nx`, '-next', A));
    await check(g, 'nx: second time', 'deny', () => rtdb(T, 'PUT', `shogi/rooms/${room}/nx`, '-other', B));
    await check(g, 'member: own leave', 'allow', () => rtdb(T, 'DELETE', `shogi/rooms/${room}/m/${B.uid}`, undefined, B));
    await check(g, 'room: delete by outsider', 'deny', () => rtdb(T, 'DELETE', `shogi/rooms/${room}`, undefined, C));
    await check(g, 'room: delete by a player after the game', 'allow', () => rtdb(T, 'DELETE', `shogi/rooms/${room}`, undefined, A));
    await check(g, 'move: into a deleted room', 'deny', () => rtdb(T, 'PATCH', `shogi/rooms/${room}`, mv(0, '7g7f'), A));
    const room3 = rid('-rulesold');
    cleanup.push(() => rtdb(T, 'DELETE', `shogi/rooms/${room3}`, undefined, A));
    await rtdb(T, 'PUT', `shogi/rooms/${room3}`, Object.assign({}, meta, { at: Date.now() - 4 * 3600e3 }), A);
    await check(g, 'room: anyone removes a room older than 3 h', 'allow', () => rtdb(T, 'DELETE', `shogi/rooms/${room3}`, undefined, C));
    await check(g, 'queue: own remove', 'allow', () => rtdb(T, 'DELETE', `shogi/queue/${A.uid}`, undefined, A));
  }

  // ================================================================ RTDB: tr（common/turnroom.js。いまは colorcards のオンライン対戦）
  // ホスト権限：ホストだけが pub（みんなに見える状態）と priv/{uid}（本人だけが読める手札）を書く。ゲストは自分の手 act/{uid} だけ。
  {
    const g = 'rtdb:tr';
    const D = await signUp(T), F = await signUp(T);
    const room = rid('-trtest'), room2 = rid('-trinv'), room3 = rid('-trold'), code = String(100000 + Math.floor(Math.random() * 900000));
    const P = `tr/colorcards`;
    cleanup.push(() => rtdb(T, 'DELETE', `${P}/queue/${A.uid}`, undefined, A), () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, A), () => rtdb(T, 'DELETE', `${P}/rooms/${room2}`, undefined, A),
      () => rtdb(T, 'DELETE', `${P}/codes/${code}`, undefined, A), () => rtdb(T, 'DELETE', `${P}/rooms/${room3}`, undefined, A));
    // ---- quick match queue
    await check(g, 'queue: own set { n, t, k, f }', 'allow', () => rtdb(T, 'PUT', `${P}/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 3, f: 1 }, A));
    await check(g, 'queue: creator marks room { r, m }', 'allow', () => rtdb(T, 'PATCH', `${P}/queue/${A.uid}`, { r: room, m: [A.uid, B.uid] }, A));
    await check(g, 'queue: read', 'allow', () => rtdb(T, 'GET', `${P}/queue`, undefined, C));
    await check(g, 'queue: someone else\'s entry', 'deny', () => rtdb(T, 'PATCH', `${P}/queue/${A.uid}`, { n: 'evil' }, B));
    await check(g, 'queue: 5 players', 'deny', () => rtdb(T, 'PATCH', `${P}/queue/${A.uid}`, { k: 5 }, A));
    await check(g, 'queue: extra field', 'deny', () => rtdb(T, 'PATCH', `${P}/queue/${A.uid}`, { x: 1 }, A));
    await check(g, 'queue: client clock instead of server time', 'deny', () => rtdb(T, 'PATCH', `${P}/queue/${A.uid}`, { t: Date.now() + 99999 }, A));
    await check(g, 'queue: a game that does not use it', 'deny', () => rtdb(T, 'PUT', `tr/hack/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 3 }, A));
    await check(g, 'queue: read another game\'s queue', 'deny', () => rtdb(T, 'GET', `tr/hack/queue`, undefined, C));
    // ---- the room (made by the host)
    const meta = { at: TS, h: A.uid, n: 3, k: 'c', cp: 2, tm: 30, fl: 1 };
    const body = (m, extra) => Object.assign({ meta: m || meta, seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, extra || {});
    await check(g, 'code: create before the room exists', 'deny', () => rtdb(T, 'PUT', `${P}/codes/${code}`, { h: A.uid, r: room, t: TS }, A));
    await check(g, 'room: create as someone else', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, body(), C));
    await check(g, 'room: seat 0 is not the creator', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, { meta, seats: { 0: { u: B.uid, n: 'Ben', j: TS } } }, A));
    await check(g, 'room: 5 seats', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, body(Object.assign({}, meta, { n: 5 })), A));
    await check(g, 'room: 1 seat', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, body(Object.assign({}, meta, { n: 1 })), A));
    await check(g, 'room: unknown kind', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, body(Object.assign({}, meta, { k: 'x' })), A));
    await check(g, 'room: turn time over 180 s', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, body(Object.assign({}, meta, { tm: 500 })), A));
    await check(g, 'room: CPU strength 9', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, body(Object.assign({}, meta, { cp: 9 })), A));
    await check(g, 'room: create with a pub already in it', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, body(null, { pub: { v: 1, g: 1, ph: 'play', tn: 0, dl: 0, sl: 'pp', pu: [0, 1], pd: { hc: [7, 7] } } }), A));
    await check(g, 'room: create with a hand already in it', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, body(null, { priv: { [B.uid]: { v: 1, h: [1, 2] } } }), A));
    await check(g, 'room: a game that does not use it', 'deny', () => rtdb(T, 'PUT', `tr/hack/rooms/${room}`, body(), A));
    await check(g, 'room: create (turnroom createRoom)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, body(), A));
    await check(g, 'room: overwrite the whole existing room', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, body(), A));
    await check(g, 'room: unknown child', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/x`, 1, A));
    await check(g, 'room: list all rooms', 'deny', () => rtdb(T, 'GET', `${P}/rooms`, undefined, B));
    await check(g, 'room: read the whole room (would show the hands)', 'deny', () => rtdb(T, 'GET', `${P}/rooms/${room}`, undefined, A));
    await check(g, 'meta: read', 'allow', () => rtdb(T, 'GET', `${P}/rooms/${room}/meta`, undefined, B));
    await check(g, 'meta: the host changes the seat count', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/meta/n`, 4, A));
    await check(g, 'meta: the host changes the host', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/meta/h`, B.uid, A));
    // ---- friend code
    await check(g, 'code: create for somebody else\'s room', 'deny', () => rtdb(T, 'PUT', `${P}/codes/${code}`, { h: B.uid, r: room, t: TS }, B));
    await check(g, 'code: not 6 digits', 'deny', () => rtdb(T, 'PUT', `${P}/codes/12ab56`, { h: A.uid, r: room, t: TS }, A));
    await check(g, 'code: create (host)', 'allow', () => rtdb(T, 'PUT', `${P}/codes/${code}`, { h: A.uid, r: room, t: TS }, A));
    await check(g, 'code: overwrite an existing code', 'deny', () => rtdb(T, 'PUT', `${P}/codes/${code}`, { h: A.uid, r: room, t: TS }, A));
    await check(g, 'code: read one code', 'allow', () => rtdb(T, 'GET', `${P}/codes/${code}`, undefined, B));
    await check(g, 'code: list all codes', 'deny', () => rtdb(T, 'GET', `${P}/codes`, undefined, B));
    await check(g, 'code: outsider removes it', 'deny', () => rtdb(T, 'DELETE', `${P}/codes/${code}`, undefined, C));
    // ---- seats
    const seat = (u, n) => ({ u: u.uid, n: n || 'Ben', j: TS });
    await check(g, 'seat: guest takes seat 1', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/1`, seat(B), B));
    await check(g, 'seat: a taken seat', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/1`, seat(C), C));
    await check(g, 'seat: in somebody else\'s name', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/2`, seat(B), C));
    await check(g, 'seat: a second seat for the same user', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/2`, seat(B), B));
    await check(g, 'seat: nickname over 12 characters', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/2`, seat(C, 'ABCDEFGHIJKLM'), C));
    await check(g, 'seat: extra field', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/2`, Object.assign(seat(C), { x: 1 }), C));
    await check(g, 'seat: beyond the seat count (3 seats: no seat 3)', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/3`, seat(C), C));
    await check(g, 'seat: not 0..3', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/7`, seat(C), C));
    await check(g, 'seat: guest takes seat 2', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/2`, seat(C, 'Cy'), C));
    await check(g, 'seat: a full room', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/3`, seat(D), D));
    await check(g, 'seat: someone else removes a seat', 'deny', () => rtdb(T, 'DELETE', `${P}/rooms/${room}/seats/2`, undefined, B));
    await check(g, 'seat: leave before the start (own seat)', 'allow', () => rtdb(T, 'DELETE', `${P}/rooms/${room}/seats/2`, undefined, C));
    await check(g, 'seat: take it again', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/2`, seat(C, 'Cy'), C));
    // an invited-only (quick match) room
    await check(g, 'room: create with an invite list', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room2}`, { meta: Object.assign({}, meta, { k: 'q', n: 2, inv: { [A.uid]: 1, [B.uid]: 1 } }), seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, A));
    await check(g, 'seat: not invited', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room2}/seats/1`, seat(C), C));
    await check(g, 'seat: invited', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room2}/seats/1`, seat(B), B));
    // ---- presence
    await check(g, 'on: host', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/on/${A.uid}`, 1, A));
    await check(g, 'on: guest', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/on/${B.uid}`, 1, B));
    await check(g, 'on: guest 2', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/on/${C.uid}`, 1, C));
    await check(g, 'on: not seated', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/on/${D.uid}`, 1, D));
    await check(g, 'on: in somebody else\'s name', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/on/${B.uid}`, 0, A));
    await check(g, 'on: a value other than 0 / 1', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/on/${B.uid}`, 2, B));
    // ---- the public state: only the host
    const pub = (v, o) => Object.assign({ v, g: 1, ph: 'play', tn: 0, dl: 0, sl: 'ppp', pu: [0, 1, 2], pd: { co: 1, dr: 1, tp: [10], dc: 80, hc: [7, 7, 7], wd: [0, 0, 0], cl: [0, 0, 0], uc: -1, pp: 0, wn: -1 }, ev: [{ i: 1, t: 'pl', s: 0, c: 10, k: 1 }] }, o || {});
    await check(g, 'pub: a guest writes it', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1), B));
    await check(g, 'pub: an outsider writes it', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1), D));
    await check(g, 'pub: unknown field', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1, { hands: [[1, 2]] }), A));
    await check(g, 'pub: phase other than play / over', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1, { ph: 'x' }), A));
    await check(g, 'pub: bad seat states', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1, { sl: 'PPP' }), A));
    await check(g, 'pub: a public key that is not lower case', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1, { pd: { Hands: 1 } }), A));
    await check(g, 'pub: a nested object in the public state', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1, { pd: { hc: { a: { b: 1 } } } }), A));
    await check(g, 'pub: a long string in the public state', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1, { pd: { name: 'x'.repeat(40) } }), A));
    await check(g, 'pub: an event with an unknown field', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1, { ev: [{ i: 1, t: 'pl', hand: 5 }] }), A));
    await check(g, 'pub: an event with a long type', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1, { ev: [{ i: 1, t: 'play' }] }), A));
    await check(g, 'pub: a 9th event', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1, { ev: Array.from({ length: 9 }, (x, i) => ({ i: i + 1, t: 'pl', s: 0, c: 1, k: 0 })) }), A));
    await check(g, 'pub: a card number over 255', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1, { ev: [{ i: 1, t: 'pl', c: 999 }] }), A));
    await check(g, 'pub: the host publishes the start', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1), A));
    await check(g, 'pub: the same version again', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1), A));
    await check(g, 'pub: an older version', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(0), A));
    await check(g, 'pub: the host publishes the next version', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(2, { tn: 1 }), A));
    await check(g, 'pub: the host publishes the result', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(3, { ph: 'over', tn: -1, rs: { r: [1, 2, 3], w: 0, y: 'w' } }), A));
    await check(g, 'pub: a bad result', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(4, { ph: 'over', rs: { r: [1, 2, 9], w: 0, y: 'w' } }), A));
    await check(g, 'pub: a guest deletes it', 'deny', () => rtdb(T, 'DELETE', `${P}/rooms/${room}/pub`, undefined, B));
    await check(g, 'pub: read', 'allow', () => rtdb(T, 'GET', `${P}/rooms/${room}/pub`, undefined, D));
    await check(g, 'pub: read in a game that does not use it', 'deny', () => rtdb(T, 'GET', `tr/hack/rooms/${room}/pub`, undefined, D));
    await check(g, 'seat: take a seat after the start', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/3`, seat(D), D));
    await check(g, 'seat: leave after the start (the seat stays)', 'deny', () => rtdb(T, 'DELETE', `${P}/rooms/${room}/seats/1`, undefined, B));
    // ---- the hands: written by the host, read by the owner only
    await check(g, 'priv: the host writes a guest\'s hand', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/priv/${B.uid}`, { v: 2, h: [1, 2, 3, 4, 5, 6, 7], d: -1 }, A));
    await check(g, 'priv: the host writes a peek result', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/priv/${C.uid}`, { v: 2, h: [8, 9], d: 12, x: { s: 5, t: 1, c: [1, 2, 3] } }, A));
    await check(g, 'priv: the owner reads it', 'allow', () => rtdb(T, 'GET', `${P}/rooms/${room}/priv/${B.uid}`, undefined, B));
    await check(g, 'priv: another guest reads it', 'deny', () => rtdb(T, 'GET', `${P}/rooms/${room}/priv/${B.uid}`, undefined, C));
    await check(g, 'priv: the host reads it back through the database (not needed: it keeps the game itself)', 'deny', () => rtdb(T, 'GET', `${P}/rooms/${room}/priv/${B.uid}`, undefined, A));
    await check(g, 'priv: an outsider reads it', 'deny', () => rtdb(T, 'GET', `${P}/rooms/${room}/priv/${B.uid}`, undefined, D));
    await check(g, 'priv: list all hands', 'deny', () => rtdb(T, 'GET', `${P}/rooms/${room}/priv`, undefined, B));
    await check(g, 'priv: the owner writes its own hand', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/priv/${B.uid}`, { v: 9, h: [1] }, B));
    await check(g, 'priv: a guest writes another guest\'s hand', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/priv/${C.uid}`, { v: 9, h: [1] }, B));
    await check(g, 'priv: a card number over 255', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/priv/${B.uid}`, { v: 3, h: [300] }, A));
    await check(g, 'priv: a hand of 100 cards', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/priv/${B.uid}`, { v: 3, h: Object.fromEntries(Array.from({ length: 100 }, (x, i) => [i, 1])) }, A));
    await check(g, 'priv: an unknown field', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/priv/${B.uid}`, { v: 3, h: [1], secret: 'x' }, A));
    // ---- the guests' moves
    const act = (q, a, v) => ({ q, v: v == null ? 2 : v, a });
    await check(g, 'act: a guest plays a card', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, act(1, { t: 'play', c: 5, k: 1 }), B));
    await check(g, 'act: the same move number again', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, act(1, { t: 'draw' }), B));
    await check(g, 'act: the next move', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, act(2, { t: 'draw' }), B));
    await check(g, 'act: a guest moves for another guest', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${C.uid}`, act(1, { t: 'draw' }), B));
    await check(g, 'act: an outsider', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${D.uid}`, act(1, { t: 'draw' }), D));
    await check(g, 'act: a move that is not a word', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${C.uid}`, act(1, { t: 'DRAW!' }), C));
    await check(g, 'act: an unknown field in the move', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${C.uid}`, act(1, { t: 'play', c: 5, hand: [1, 2] }), C));
    await check(g, 'act: a card number over 255', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${C.uid}`, act(1, { t: 'play', c: 999 }), C));
    await check(g, 'act: without the move', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${C.uid}`, { q: 1, v: 2 }, C));
    await check(g, 'act: the host reads the moves', 'allow', () => rtdb(T, 'GET', `${P}/rooms/${room}/act`, undefined, A));
    await check(g, 'act: a guest reads the moves', 'deny', () => rtdb(T, 'GET', `${P}/rooms/${room}/act`, undefined, C));
    await check(g, 'act: a guest reads its own move', 'deny', () => rtdb(T, 'GET', `${P}/rooms/${room}/act/${B.uid}`, undefined, B));
    // ---- rematch wishes
    await check(g, 'rm: own wish', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/rm/${B.uid}`, 1, B));
    await check(g, 'rm: in somebody else\'s name', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/rm/${C.uid}`, 1, B));
    await check(g, 'rm: an outsider', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/rm/${D.uid}`, 1, D));
    await check(g, 'rm: a value other than 1', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/rm/${B.uid}`, 5, B));
    await check(g, 'rm: a guest clears all wishes', 'deny', () => rtdb(T, 'DELETE', `${P}/rooms/${room}/rm`, undefined, B));
    await check(g, 'rm: the host clears all wishes (new game)', 'allow', () => rtdb(T, 'DELETE', `${P}/rooms/${room}/rm`, undefined, A));
    await check(g, 'on: leaving on purpose (0)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/on/${C.uid}`, 0, C));
    // ---- cleaning up
    await check(g, 'room: delete by an outsider', 'deny', () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, D));
    await check(g, 'room: delete by a guest while the host is there', 'deny', () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, B));
    await check(g, 'on: the host disconnects (the server removes it)', 'allow', () => rtdb(T, 'DELETE', `${P}/rooms/${room}/on/${A.uid}`, undefined, A));
    await check(g, 'room: delete by a guest once the host is gone', 'allow', () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, B));
    await check(g, 'code: the host removes it', 'allow', () => rtdb(T, 'DELETE', `${P}/codes/${code}`, undefined, A));
    await check(g, 'room: delete by the host', 'allow', () => rtdb(T, 'DELETE', `${P}/rooms/${room2}`, undefined, A));
    await rtdb(T, 'PUT', `${P}/rooms/${room3}`, { meta: Object.assign({}, meta, { at: Date.now() - 4 * 3600e3 }), seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, A);
    await check(g, 'room: anyone removes a room older than 3 h', 'allow', () => rtdb(T, 'DELETE', `${P}/rooms/${room3}`, undefined, D));
    await check(g, 'queue: own remove', 'allow', () => rtdb(T, 'DELETE', `${P}/queue/${A.uid}`, undefined, A));
    void F;
  }

  // ================================================================ RTDB: tr/reversi（2人だけ。盤は pd.b の64個の数、手は { t: 'mv', c }、隠す手札はない）
  {
    const g = 'rtdb:tr-reversi';
    const P = `tr/reversi`, room = rid('-rvtest'), code = String(100000 + Math.floor(Math.random() * 900000));
    cleanup.push(() => rtdb(T, 'DELETE', `${P}/queue/${A.uid}`, undefined, A), () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, A), () => rtdb(T, 'DELETE', `${P}/codes/${code}`, undefined, A));
    await check(g, 'queue: own set (2 players)', 'allow', () => rtdb(T, 'PUT', `${P}/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 2, f: 1 }, A));
    await check(g, 'queue: someone else\'s entry', 'deny', () => rtdb(T, 'PATCH', `${P}/queue/${A.uid}`, { n: 'evil' }, B));
    await check(g, 'queue: a game that is not in the list', 'deny', () => rtdb(T, 'PUT', `tr/reverso/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 2 }, A));
    const meta = { at: TS, h: A.uid, n: 2, k: 'c', cp: 2, tm: 45, fl: 0 };
    await check(g, 'room: create (2 seats, 45 s turns)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, { meta, seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, A));
    await check(g, 'room: a game that is not in the list', 'deny', () => rtdb(T, 'PUT', `tr/reverso/rooms/${room}`, { meta, seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, A));
    await check(g, 'code: create (host)', 'allow', () => rtdb(T, 'PUT', `${P}/codes/${code}`, { h: A.uid, r: room, t: TS }, A));
    await check(g, 'seat: guest takes seat 1', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/1`, { u: B.uid, n: 'Ben', j: TS }, B));
    await check(g, 'seat: a third person (2 seats)', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/2`, { u: C.uid, n: 'Cy', j: TS }, C));
    await check(g, 'on: both', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/on/${A.uid}`, 1, A));
    const board = Array.from({ length: 64 }, (x, i) => (i === 27 || i === 36 ? 2 : i === 28 || i === 35 ? 1 : 0));
    const pub = (v, o) => Object.assign({ v, g: 1, ph: 'play', tn: 0, dl: 0, sl: 'pp', pu: [0, 1], pd: { b: board, bk: 2, wh: 2, lm: -1, mc: 0 }, ev: [{ i: 1, t: 'mv', s: 0, c: 19, n: 1 }, { i: 2, t: 'pa', s: 1 }] }, o || {});
    await check(g, 'pub: a guest writes it', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1), B));
    await check(g, 'pub: the host publishes a 64-square board', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1), A));
    await check(g, 'pub: a board of 101 squares (index over 99)', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(2, { pd: { b: Array.from({ length: 101 }, () => 0), bk: 2, wh: 2 } }), A));
    await check(g, 'pub: a square that is not a number', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(2, { pd: { b: Array.from({ length: 64 }, () => 'xxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxxx'), bk: 2, wh: 2 } }), A));
    await check(g, 'pub: a pass event and a move event with the allowed fields', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(2, { tn: 1 }), A));
    await check(g, 'pub: a move event with a hidden field', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(3, { ev: [{ i: 1, t: 'mv', s: 0, c: 19, flips: [1, 2] }] }), A));
    await check(g, 'pub: the host publishes a draw result', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(3, { ph: 'over', tn: -1, rs: { r: [1, 1], w: -1, y: 'w' } }), A));
    await check(g, 'act: a guest moves { t: mv, c: 19 }', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 1, v: 3, a: { t: 'mv', c: 19 } }, B));
    await check(g, 'act: a move on someone else\'s account', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${A.uid}`, { q: 1, v: 3, a: { t: 'mv', c: 19 } }, B));
    await check(g, 'act: a square over 255', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 2, v: 3, a: { t: 'mv', c: 900 } }, B));
    await check(g, 'priv: the host writes the (empty) private part', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/priv/${B.uid}`, { v: 3 }, A));
    await check(g, 'priv: another guest reads it', 'deny', () => rtdb(T, 'GET', `${P}/rooms/${room}/priv/${B.uid}`, undefined, C));
    await check(g, 'room: list all rooms', 'deny', () => rtdb(T, 'GET', `${P}/rooms`, undefined, B));
    await check(g, 'room: delete by the host', 'allow', () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, A));
    await check(g, 'code: the host removes it', 'allow', () => rtdb(T, 'DELETE', `${P}/codes/${code}`, undefined, A));
    await check(g, 'queue: own remove', 'allow', () => rtdb(T, 'DELETE', `${P}/queue/${A.uid}`, undefined, A));
  }

  // ================================================================ RTDB: tr/gomoku（2人だけ。盤は pd.b の「行ごとの文字列」n 個（225マスは配列の添字99・文字列24文字の制限を超えるため）、手は { t: 'mv', c }、隠す手札はない）
  {
    const g = 'rtdb:tr-gomoku';
    const P = `tr/gomoku`, room = rid('-gktest'), code = String(100000 + Math.floor(Math.random() * 900000));
    cleanup.push(() => rtdb(T, 'DELETE', `${P}/queue/${A.uid}`, undefined, A), () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, A), () => rtdb(T, 'DELETE', `${P}/codes/${code}`, undefined, A));
    await check(g, 'queue: own set (2 players)', 'allow', () => rtdb(T, 'PUT', `${P}/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 2, f: 1 }, A));
    await check(g, 'queue: someone else\'s entry', 'deny', () => rtdb(T, 'PATCH', `${P}/queue/${A.uid}`, { n: 'evil' }, B));
    await check(g, 'queue: a game that is not in the list', 'deny', () => rtdb(T, 'PUT', `tr/gomokus/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 2 }, A));
    const meta = { at: TS, h: A.uid, n: 2, k: 'c', cp: 2, tm: 45, fl: 0 };
    await check(g, 'room: create (2 seats, 45 s turns)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, { meta, seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, A));
    await check(g, 'room: a game that is not in the list', 'deny', () => rtdb(T, 'PUT', `tr/gomokus/rooms/${room}`, { meta, seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, A));
    await check(g, 'code: create (host)', 'allow', () => rtdb(T, 'PUT', `${P}/codes/${code}`, { h: A.uid, r: room, t: TS }, A));
    await check(g, 'seat: guest takes seat 1', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/1`, { u: B.uid, n: 'Ben', j: TS }, B));
    await check(g, 'seat: a third person (2 seats)', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/2`, { u: C.uid, n: 'Cy', j: TS }, C));
    await check(g, 'on: both', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/on/${A.uid}`, 1, A));
    const rowsOk = Array.from({ length: 15 }, (x, r) => (r === 7 ? '000000012000000' : '000000000000000'));
    const pub = (v, o) => Object.assign({ v, g: 1, ph: 'play', tn: 0, dl: 0, sl: 'pp', pu: [0, 1], pd: { n: 15, ru: 'free', b: rowsOk, o: ['77'], lm: 112, mc: 1 }, ev: [{ i: 1, t: 'mv', s: 0, c: 112, n: 1 }] }, o || {});
    await check(g, 'pub: a guest writes it', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1), B));
    await check(g, 'pub: the host publishes a 15x15 board (15 row strings) with the move list', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1), A));
    await check(g, 'pub: a board of 101 row strings (index over 99)', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(2, { pd: { n: 15, ru: 'free', b: Array.from({ length: 101 }, () => '0'), lm: -1, mc: 0 } }), A));
    await check(g, 'pub: a row string of 25 characters', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(2, { pd: { n: 15, ru: 'free', b: ['0000000000000000000000000'], lm: -1, mc: 0 } }), A));
    await check(g, 'pub: the next move with the allowed event fields', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(2, { tn: 1 }), A));
    await check(g, 'pub: a move event with a hidden field', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(3, { ev: [{ i: 1, t: 'mv', s: 0, c: 112, flips: [1, 2] }] }), A));
    await check(g, 'pub: the host publishes a draw result', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(3, { ph: 'over', tn: -1, rs: { r: [1, 1], w: -1, y: 'w' } }), A));
    await check(g, 'act: a guest moves { t: mv, c: 112 }', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 1, v: 3, a: { t: 'mv', c: 112 } }, B));
    await check(g, 'act: a move on someone else\'s account', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${A.uid}`, { q: 1, v: 3, a: { t: 'mv', c: 112 } }, B));
    await check(g, 'act: a square over 255', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 2, v: 3, a: { t: 'mv', c: 900 } }, B));
    await check(g, 'priv: the host writes the (empty) private part', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/priv/${B.uid}`, { v: 3 }, A));
    await check(g, 'priv: another guest reads it', 'deny', () => rtdb(T, 'GET', `${P}/rooms/${room}/priv/${B.uid}`, undefined, C));
    await check(g, 'room: list all rooms', 'deny', () => rtdb(T, 'GET', `${P}/rooms`, undefined, B));
    await check(g, 'room: delete by the host', 'allow', () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, A));
    await check(g, 'code: the host removes it', 'allow', () => rtdb(T, 'DELETE', `${P}/codes/${code}`, undefined, A));
    await check(g, 'queue: own remove', 'allow', () => rtdb(T, 'DELETE', `${P}/queue/${A.uid}`, undefined, A));
  }

  // ================================================================ RTDB: tr/chess（2人だけ。隠す情報はない。pd は m（手の文字列・8手で1つ・100個まで）・mc・ck（時計 [白, 黒]）・tb・ti・of・rz・rw、手は { t: 'mv', c: from, k, w, x（to を2ビットずつ）}・昇格は t: 'pq' など・投了などは { t: 'rs' }）
  {
    const g = 'rtdb:tr-chess';
    const P = `tr/chess`, room = rid('-chtest'), code = String(100000 + Math.floor(Math.random() * 900000));
    cleanup.push(() => rtdb(T, 'DELETE', `${P}/queue/${A.uid}`, undefined, A), () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, A), () => rtdb(T, 'DELETE', `${P}/codes/${code}`, undefined, A));
    await check(g, 'queue: own set (2 players)', 'allow', () => rtdb(T, 'PUT', `${P}/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 2, f: 1 }, A));
    await check(g, 'queue: someone else\'s entry', 'deny', () => rtdb(T, 'PATCH', `${P}/queue/${A.uid}`, { n: 'evil' }, B));
    await check(g, 'queue: a game that is not in the list', 'deny', () => rtdb(T, 'PUT', `tr/chesss/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 2 }, A));
    const meta = { at: TS, h: A.uid, n: 2, k: 'c', cp: 2, tm: 180, fl: 0 };
    await check(g, 'room: create (2 seats, 180 s turns)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, { meta, seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, A));
    await check(g, 'room: a game that is not in the list', 'deny', () => rtdb(T, 'PUT', `tr/chesss/rooms/${room}`, { meta, seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, A));
    await check(g, 'code: create (host)', 'allow', () => rtdb(T, 'PUT', `${P}/codes/${code}`, { h: A.uid, r: room, t: TS }, A));
    await check(g, 'seat: guest takes seat 1', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/1`, { u: B.uid, n: 'Ben', j: TS }, B));
    await check(g, 'seat: a third person (2 seats)', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/2`, { u: C.uid, n: 'Cy', j: TS }, C));
    await check(g, 'on: both', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/on/${A.uid}`, 1, A));
    const pub = (v, o) => Object.assign({ v, g: 1, ph: 'play', tn: 1, dl: 0, sl: 'pp', pu: [0, 1], pd: { m: ['EMNbmV-'], mc: 1, ck: [1800, 1800], tb: 180, ti: 2, of: 0, rz: '', rw: -2 }, ev: [{ i: 1, t: 'mv', s: 0, c: 12, n: 28 }] }, o || {});
    await check(g, 'pub: a guest writes it', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1), B));
    await check(g, 'pub: the host publishes the move list (strings of 24 characters), the clocks and the offer', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1), A));
    await check(g, 'pub: a move string of 25 characters', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(2, { pd: { m: ['EMNbmV-EMNbmV-EMNbmV-EMNbmV-'.slice(0, 25)], mc: 1 } }), A));
    await check(g, 'pub: 101 move strings (index over 99)', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(2, { pd: { m: Array.from({ length: 101 }, () => 'EMN'), mc: 800 } }), A));
    await check(g, 'pub: a pd key in capitals', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(2, { pd: { M: ['EMN'], mc: 1 } }), A));
    await check(g, 'pub: the next move with a capture/check/promotion event', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(2, { tn: 0, ev: [{ i: 2, t: 'mv', s: 1, c: 52, n: 8000 }] }), A));
    await check(g, 'pub: an event with a hidden field', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(3, { ev: [{ i: 3, t: 'mv', s: 0, c: 12, n: 28, hand: [1, 2] }] }), A));
    await check(g, 'pub: the host publishes a resignation result', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(3, { ph: 'over', tn: -1, pd: { m: ['EMNbmV-'], mc: 1, ck: [1800, 1790], tb: 180, ti: 2, of: 0, rz: 'resign', rw: 0 }, ev: [{ i: 3, t: 'rs', s: 1 }], rs: { r: [1, 2], w: 0, y: 'w' } }), A));
    await check(g, 'act: a guest moves { t: mv, c, k, w, x }', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 1, v: 3, a: { t: 'mv', c: 52, k: 0, w: 1, x: 2 } }, B));
    await check(g, 'act: a promotion { t: pq }', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 2, v: 3, a: { t: 'pq', c: 52, k: 0, w: 3, x: 3 } }, B));
    await check(g, 'act: resign { t: rs }', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 3, v: 3, a: { t: 'rs' } }, B));
    await check(g, 'act: a move on someone else\'s account', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${A.uid}`, { q: 1, v: 3, a: { t: 'mv', c: 52, k: 0, w: 1, x: 2 } }, B));
    await check(g, 'act: a square over 255', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 4, v: 3, a: { t: 'mv', c: 900, k: 0, w: 0, x: 0 } }, B));
    await check(g, 'act: a "to" part over 7 (the range is 0-7 since the 8-seat wordwolf)', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 5, v: 3, a: { t: 'mv', c: 12, k: 8, w: 0, x: 0 } }, B));
    await check(g, 'priv: the host writes the (empty) private part', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/priv/${B.uid}`, { v: 3 }, A));
    await check(g, 'priv: another guest reads it', 'deny', () => rtdb(T, 'GET', `${P}/rooms/${room}/priv/${B.uid}`, undefined, C));
    await check(g, 'room: list all rooms', 'deny', () => rtdb(T, 'GET', `${P}/rooms`, undefined, B));
    await check(g, 'room: delete by the host', 'allow', () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, A));
    await check(g, 'code: the host removes it', 'allow', () => rtdb(T, 'DELETE', `${P}/codes/${code}`, undefined, A));
    await check(g, 'queue: own remove', 'allow', () => rtdb(T, 'DELETE', `${P}/queue/${A.uid}`, undefined, A));
  }

  // ================================================================ RTDB: tr/mahjong（4席。みんなが見る状態 pd は数・短い文字列・数の配列だけ、手牌は priv/{uid} にだけ、手は { t: 'discard', c: 牌の id, k: 0|1 } など）
  {
    const g = 'rtdb:tr-mahjong';
    const P = `tr/mahjong`, room = rid('-mjtest'), code = String(100000 + Math.floor(Math.random() * 900000));
    cleanup.push(() => rtdb(T, 'DELETE', `${P}/queue/${A.uid}`, undefined, A), () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, A), () => rtdb(T, 'DELETE', `${P}/codes/${code}`, undefined, A));
    await check(g, 'queue: own set (4 players)', 'allow', () => rtdb(T, 'PUT', `${P}/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 4, f: 1 }, A));
    await check(g, 'queue: someone else\'s entry', 'deny', () => rtdb(T, 'PATCH', `${P}/queue/${A.uid}`, { n: 'evil' }, B));
    await check(g, 'queue: a game that is not in the list', 'deny', () => rtdb(T, 'PUT', `tr/mahjongs/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 4 }, A));
    const meta = { at: TS, h: A.uid, n: 4, k: 'c', cp: 2, tm: 30, fl: 0 };
    await check(g, 'room: create (4 seats)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, { meta, seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, A));
    await check(g, 'room: a game that is not in the list', 'deny', () => rtdb(T, 'PUT', `tr/mahjongs/rooms/${room}`, { meta, seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, A));
    await check(g, 'code: create (host)', 'allow', () => rtdb(T, 'PUT', `${P}/codes/${code}`, { h: A.uid, r: room, t: TS }, A));
    await check(g, 'seat: guest takes seat 1', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/1`, { u: B.uid, n: 'Ben', j: TS }, B));
    await check(g, 'seat: a third person takes seat 2 (4 seats)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/2`, { u: C.uid, n: 'Cy', j: TS }, C));
    const pd = { dr: 4, ds: 52, sc: [25000, 25000, 25000, 25000], rv: [0, 0, 0, 0], hc: [13, 13, 13, 13], rn: 'e1' };
    const pub = (v, o) => Object.assign({ v, g: 1, ph: 'play', tn: 0, dl: 0, sl: 'pppp', pu: [0, 1, 2, 3], pd, ev: [{ i: 1, t: 'dc', s: 0, c: 12, d: 0 }] }, o || {});
    await check(g, 'pub: a guest writes it', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1), B));
    await check(g, 'pub: the host publishes the public state (scores, wall count, hand sizes)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1), A));
    await check(g, 'pub: a pd value that is a nested array', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(2, { pd: { hc: [[1, 2]] } }), A));
    await check(g, 'pub: a discard event with a hidden field', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(3, { ev: [{ i: 1, t: 'dc', s: 0, c: 12, hand: [1, 2] }] }), A));
    await check(g, 'act: a guest discards { t: discard, c: 12, k: 0 }', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 1, v: 1, a: { t: 'discard', c: 12, k: 0 } }, B));
    await check(g, 'act: a guest declares riichi on the discard (k: 1)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 2, v: 1, a: { t: 'discard', c: 13, k: 1 } }, B));
    await check(g, 'act: a move on someone else\'s account', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${A.uid}`, { q: 1, v: 1, a: { t: 'discard', c: 12, k: 0 } }, B));
    await check(g, 'act: a tile over 255', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 3, v: 1, a: { t: 'discard', c: 900, k: 0 } }, B));
    await check(g, 'priv: the host writes a guest\'s 13 tiles', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/priv/${B.uid}`, { v: 1, h: [0, 5, 9, 14, 20, 27, 33, 40, 48, 55, 61, 70, 77], d: 90, x: { s: 0, t: 0, c: [] } }, A));
    await check(g, 'priv: the owner reads it', 'allow', () => rtdb(T, 'GET', `${P}/rooms/${room}/priv/${B.uid}`, undefined, B));
    await check(g, 'priv: another guest reads it', 'deny', () => rtdb(T, 'GET', `${P}/rooms/${room}/priv/${B.uid}`, undefined, C));
    await check(g, 'priv: a tile number over 255', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/priv/${B.uid}`, { v: 2, h: [300] }, A));
    await check(g, 'room: list all rooms', 'deny', () => rtdb(T, 'GET', `${P}/rooms`, undefined, B));
    await check(g, 'room: delete by the host', 'allow', () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, A));
    await check(g, 'code: the host removes it', 'allow', () => rtdb(T, 'DELETE', `${P}/codes/${code}`, undefined, A));
    await check(g, 'queue: own remove', 'allow', () => rtdb(T, 'DELETE', `${P}/queue/${A.uid}`, undefined, A));
  }

  // ================================================================ RTDB: tr/orchestra（指揮者ゲームの他団体との勝負。2人。結果は16個の 0..255 の並び＝ act の r、pd の ra / rb）
  {
    const g = 'rtdb:tr-orchestra';
    const P = `tr/orchestra`, room = rid('-octest'), code = String(100000 + Math.floor(Math.random() * 900000));
    cleanup.push(() => rtdb(T, 'DELETE', `${P}/queue/${A.uid}`, undefined, A), () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, A), () => rtdb(T, 'DELETE', `${P}/codes/${code}`, undefined, A));
    await check(g, 'queue: own set (2 players)', 'allow', () => rtdb(T, 'PUT', `${P}/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 2, f: 1 }, A));
    await check(g, 'queue: a game that is not in the list', 'deny', () => rtdb(T, 'PUT', `tr/orchestras/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 2 }, A));
    const meta = { at: TS, h: A.uid, n: 2, k: 'c', cp: 2, tm: 120, fl: 0 };
    await check(g, 'room: create (2 seats, 120 s to pick the piece)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, { meta, seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, A));
    await check(g, 'code: create (host)', 'allow', () => rtdb(T, 'PUT', `${P}/codes/${code}`, { h: A.uid, r: room, t: TS }, A));
    await check(g, 'seat: guest takes seat 1', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/1`, { u: B.uid, n: 'Ben', j: TS }, B));
    await check(g, 'on: the host', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/on/${A.uid}`, 1, A));
    const vec = [1, 80, 72, 90, 66, 75, 82, 98, 1, 20, 2, 0, 100, 130, 70, 85];
    const pub = (v, pd, o) => Object.assign({ v, g: 1, ph: 'play', tn: -1, dl: 0, sl: 'pp', pu: [0, 1], pd, ev: [{ i: 1, t: 'pk', c: 3 }] }, o || {});
    await check(g, 'pub: a guest writes it', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1, { p: 3, ph: 1 }), B));
    await check(g, 'pub: the host publishes the chosen piece and one posted result (16 numbers)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1, { p: 3, ph: 1, ra: vec }), A));
    await check(g, 'pub: both results with the final ranks', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(2, { p: 3, ph: 2, ra: vec, rb: vec }, { ph: 'over', rs: { r: [1, 1], w: -1, y: 'w' }, ev: [{ i: 2, t: 'dn', s: 1 }] }), A));
    await check(g, 'pub: a result vector with a nested array', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(3, { p: 3, ph: 1, ra: [[1, 2]] }), A));
    await check(g, 'act: a guest picks nothing but posts { t: done, r: [16 numbers] }', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 1, v: 2, a: { t: 'done', r: vec } }, B));
    await check(g, 'act: a result on someone else\'s account', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${A.uid}`, { q: 1, v: 2, a: { t: 'done', r: vec } }, B));
    await check(g, 'act: a result number over 255', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 2, v: 2, a: { t: 'done', r: vec.map((x, i) => (i === 1 ? 300 : x)) } }, B));
    await check(g, 'act: a result with 17 numbers', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 3, v: 2, a: { t: 'done', r: vec.concat([1]) } }, B));
    await check(g, 'act: a result with an unknown field', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 4, v: 2, a: { t: 'done', r: vec, z: 1 } }, B));
    await check(g, 'act: a guest quits { t: quit }', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 5, v: 2, a: { t: 'quit' } }, B));
    await check(g, 'room: delete by the host', 'allow', () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, A));
    await check(g, 'code: the host removes it', 'allow', () => rtdb(T, 'DELETE', `${P}/codes/${code}`, undefined, A));
    await check(g, 'queue: own remove', 'allow', () => rtdb(T, 'DELETE', `${P}/queue/${A.uid}`, undefined, A));
  }

  // ================================================================ RTDB: tr/wordwolf（3〜8席。pd は数・短い文字列・数の配列だけ。ウルフ・ことばは結果まで pd に出ない（priv/{uid} に自分のことばの番号だけ）。手は { t: hn, c } ヒント・{ t: vt, c, k } 投票・{ t: gs, c } 逆転）
  {
    const g = 'rtdb:tr-wordwolf';
    const P = `tr/wordwolf`, room = rid('-wwtest'), code = String(100000 + Math.floor(Math.random() * 900000));
    cleanup.push(() => rtdb(T, 'DELETE', `${P}/queue/${A.uid}`, undefined, A), () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, A), () => rtdb(T, 'DELETE', `${P}/codes/${code}`, undefined, A));
    await check(g, 'queue: own set (8 players)', 'allow', () => rtdb(T, 'PUT', `${P}/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 8, f: 1 }, A));
    await check(g, 'queue: 9 players', 'deny', () => rtdb(T, 'PUT', `${P}/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 9, f: 1 }, A));
    await check(g, 'queue: the room\'s member list may name 8 seats', 'allow', () => rtdb(T, 'PUT', `${P}/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 8, f: 1, r: room, m: [A.uid, B.uid, C.uid, A.uid, B.uid, C.uid, A.uid, B.uid] }, A));
    await check(g, 'queue: a game that is not in the list', 'deny', () => rtdb(T, 'PUT', `tr/wordwolfs/queue/${A.uid}`, { n: 'Aoi', t: TS, k: 4 }, A));
    const meta = { at: TS, h: A.uid, n: 8, k: 'c', cp: 2, tm: 30, fl: 1 };
    await check(g, 'room: create (8 seats, 30 s turns)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}`, { meta, seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, A));
    await check(g, 'room: a game that is not in the list', 'deny', () => rtdb(T, 'PUT', `tr/wordwolfs/rooms/${room}`, { meta, seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, A));
    await check(g, 'room: 9 seats', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}x`, { meta: Object.assign({}, meta, { n: 9 }), seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, A));
    await check(g, 'room: another game cannot have 8 seats', 'deny', () => rtdb(T, 'PUT', `tr/gomoku/rooms/${room}z`, { meta: Object.assign({}, meta, { tm: 45 }), seats: { 0: { u: A.uid, n: 'Aoi', j: TS } } }, A));
    await check(g, 'code: create (host)', 'allow', () => rtdb(T, 'PUT', `${P}/codes/${code}`, { h: A.uid, r: room, t: TS }, A));
    await check(g, 'seat: guest takes seat 4 (8-seat room)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/4`, { u: B.uid, n: 'Ben', j: TS }, B));
    await check(g, 'seat: the same person takes a second seat', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/5`, { u: B.uid, n: 'Ben', j: TS }, B));
    await check(g, 'seat: guest takes seat 7', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/7`, { u: C.uid, n: 'Cy', j: TS }, C));
    await check(g, 'seat: seat 8 does not exist', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/seats/8`, { u: C.uid, n: 'Cy', j: TS }, C));
    await check(g, 'on: a seated guest (seat 4) says it is here', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/on/${B.uid}`, 1, B));
    await check(g, 'on: host', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/on/${A.uid}`, 1, A));
    const pd0 = { ph: 'h', n: 8, rd: 2, kk: 2, kn: 0, hi: 1, hp: [3], ht: [412] };
    const pub = (v, o) => Object.assign({ v, g: 1, ph: 'play', tn: 7, dl: 0, sl: 'pppppppp', pu: [0, 1, 2, 3, 4, 5, 6, 7], pd: pd0 }, o || {});
    await check(g, 'pub: a guest writes it', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1), B));
    await check(g, 'pub: the host publishes the hint phase (8 seats, turn on seat 7)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(1), A));
    await check(g, 'pub: the vote phase with the voted flags and the last tally', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(2, { tn: 2, pd: { ph: 'v', n: 8, rd: 2, kk: 2, kn: 1, hi: 16, hp: [0, 1], ht: [5, 9], vd: [1, 1, 0, 0, 0, 0, 0, 0], rv: 0, sl: 2, cd: [], lw: 2, lc: [0, 1, 2, 0, 0, 3, 0, 0], lb: [1, 2, 0, 2, 0, 1, 3, 4] } }), A));
    await check(g, 'pub: 9 seats in the state string', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(3, { sl: 'ppppppppp' }), A));
    await check(g, 'pub: a turn on seat 8', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(3, { tn: 8 }), A));
    await check(g, 'pub: a pd key in capitals', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(3, { pd: { PH: 'h' } }), A));
    await check(g, 'pub: a nested array in pd', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(3, { pd: { hp: [[1, 2]] } }), A));
    await check(g, 'pub: 101 hint entries (index over 99)', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(3, { pd: { hp: Array.from({ length: 101 }, () => 1) } }), A));
    await check(g, 'pub: the result (8 ranks, the winner seat, wolves, points, the word pair)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(4, { ph: 'over', tn: -1, pd: { ph: 'e', n: 8, rd: 2, kk: 2, kn: 1, hi: 16, hp: [0], ht: [5], cg: [1, 3], go: [10, 11, 12, 13, 14, 15], pi: 333, mj: 1, wl: [1, 3], pt: [2, 0, 1, 1, 1, 1, 2, 1], ow: 0, wn: 0, gp: 2, gk: 0 }, rs: { r: [2, 5, 1, 1, 1, 1, 2, 1], w: -1, y: 'w' } }), A));
    await check(g, 'pub: a rank of 9', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/pub`, pub(5, { ph: 'over', tn: -1, rs: { r: [9, 1, 1, 1, 1, 1, 1, 1], w: 0, y: 'w' } }), A));
    await check(g, 'act: a guest picks hint card 3 { t: hn, c }', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 1, v: 4, a: { t: 'hn', c: 3 } }, B));
    await check(g, 'act: a vote for two players { t: vt, c, k }', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 2, v: 4, a: { t: 'vt', c: 6, k: 7 } }, B));
    await check(g, 'act: a guess { t: gs, c }', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${C.uid}`, { q: 1, v: 4, a: { t: 'gs', c: 5 } }, C));
    await check(g, 'act: a vote on someone else\'s account', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${A.uid}`, { q: 3, v: 4, a: { t: 'vt', c: 6, k: 7 } }, B));
    await check(g, 'act: a second target over 7', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 4, v: 4, a: { t: 'vt', c: 6, k: 8 } }, B));
    await check(g, 'act: free text', 'deny', () => rtdb(T, 'PUT', `${P}/rooms/${room}/act/${B.uid}`, { q: 5, v: 4, a: { t: 'hn', c: 1, msg: 'hello' } }, B));
    await check(g, 'priv: the host writes the seat\'s own word number (x.s)', 'allow', () => rtdb(T, 'PUT', `${P}/rooms/${room}/priv/${B.uid}`, { v: 4, x: { s: 1333 } }, A));
    await check(g, 'priv: another guest reads it', 'deny', () => rtdb(T, 'GET', `${P}/rooms/${room}/priv/${B.uid}`, undefined, C));
    await check(g, 'priv: the owner reads it', 'allow', () => rtdb(T, 'GET', `${P}/rooms/${room}/priv/${B.uid}`, undefined, B));
    await check(g, 'room: list all rooms', 'deny', () => rtdb(T, 'GET', `${P}/rooms`, undefined, B));
    await check(g, 'room: delete by the host', 'allow', () => rtdb(T, 'DELETE', `${P}/rooms/${room}`, undefined, A));
    await check(g, 'code: the host removes it', 'allow', () => rtdb(T, 'DELETE', `${P}/codes/${code}`, undefined, A));
    await check(g, 'queue: own remove', 'allow', () => rtdb(T, 'DELETE', `${P}/queue/${A.uid}`, undefined, A));
  }

  // ================================================================ RTDB: その他
  {
    const g = 'rtdb:other';
    await check(g, 'write outside vs/ and hole/', 'deny', () => rtdb(T, 'PUT', `whatever/${A.uid}`, 1, A));
    await check(g, 'read the root', 'deny', () => rtdb(T, 'GET', ``, undefined, A));
  }

  for (const f of cleanup) { try { await f(); } catch (e) {} }
  return results;
}

module.exports = { runCases, dayKey, weekNo };
