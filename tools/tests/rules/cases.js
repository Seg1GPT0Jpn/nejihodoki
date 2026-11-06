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
    await check(g, 'own write, every game at its cap', 'allow', () => fsSet(T, `kusogeRanks/${A.uid}`, { name: 'cap', scores: Object.assign({}, CAPS), updatedAt: Date.now() }, A));
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
