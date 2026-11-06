#!/usr/bin/env node
// 負荷テスト（P4）。エミュレーターだけで動かす（本番の neji-5913a には一切つながない。無料プランなので）。リポジトリの一番上で：
//
//   node tools/tests/load/run.js                 Firestore 200人 ＋ RTDB 50組（vs 20・hole 15・shogi 15）。約4〜5分
//   node tools/tests/load/run.js --quick         20人 ＋ 6組（短い試合）。約2分
//   オプション：--only fs|rtdb  --clients N  --pairs vs,hole,shogi（例 20,15,15）  --no-idle-off（試合のあとも接続を閉じない＝前の動き）
//               --verbose  --out <file>（既定 tools/tests/load/out/results.json）  --estimate（保存した結果から見積もりだけ計算し直す）
//
// エミュレーターの起動は rules/run.js と同じ（rules/emulator.js。firebase-tools と Java が要る。プロジェクトは demo-kobo）。
// Firestore：本物の common/*.js を node の vm で1人ずつ動かす（fs-clients.js、SDK の代わりは shim.js）。
// RTDB：本物の Firebase SDK を node で動かし、ゲームと同じ手順の「対戦する人」を同時に動かす（rtdb-bots.js）。
// 出すもの：応答時間の分布（p50/p90/p99/最大）・エラー・ルールの拒否・1人あたりの読み書き・RTDB の接続数と転送量・
//           無料枠（Spark）で1日に何人まで遊べるかの見積もり。結果は JSON（--out）と画面の表。docs/LOAD_TEST.md の数字はここから。
// 合否：ルールの拒否が「想定どおりのもの」（rank.js の5秒ルールのやり直しなど）以外にないこと、RTDB の待ち行列と部屋が残らないこと、
//       本物のページで記録した書き込みの種類（rules/clients.js の REQUIRED）が全部出てくること、クライアントの例外がないこと。
'use strict';
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const vm = require('vm');
const { emulatorTarget } = require('../rules/rest');
const { Metrics } = require('./shim');

const ROOT = path.resolve(__dirname, '../../..');
const argv = process.argv.slice(2);
const has = f => argv.includes(f);
const val = f => { const i = argv.indexOf(f); return i >= 0 ? argv[i + 1] : null; };
const quick = has('--quick');
const only = (val('--only') || 'fs,rtdb').split(',');
const OUT = val('--out') || path.join(__dirname, 'out', 'results.json');

// ---------------------------------------------------------------- 集計の道具
function pct(a, p) { if (!a.length) return null; const s = a.slice().sort((x, y) => x - y); return s[Math.min(s.length - 1, Math.max(0, Math.ceil(p / 100 * s.length) - 1))]; }
function dist(a) { return { n: a.length, p50: pct(a, 50), p90: pct(a, 90), p99: pct(a, 99), max: a.length ? Math.max(...a) : null }; }
function group(ops, key) { const m = new Map(); for (const o of ops) { const k = key(o); if (!m.has(k)) m.set(k, []); m.get(k).push(o); } return m; }
const fmtMs = v => (v == null ? '-' : String(Math.round(v)));
function table(rows, cols) {
  const w = cols.map(c => Math.max(c.length, ...rows.map(r => String(r[c] == null ? '' : r[c]).length)));
  const line = r => cols.map((c, i) => String(r[c] == null ? '' : r[c]).padEnd(w[i])).join('  ');
  return [line(Object.fromEntries(cols.map(c => [c, c]))), cols.map((c, i) => '-'.repeat(w[i])).join('  '), ...rows.map(line)].join('\n');
}

// ---------------------------------------------------------------- Firestore
function summarizeFs(run, metrics) {
  const ops = metrics.ops.filter(o => o.api === 'firestore');
  const rows = [];
  for (const [k, list] of group(ops, o => o.coll + ' ' + o.op + (o.sim ? ' (模擬)' : ''))) {
    const d = dist(list.map(o => o.ms));
    const err = {}; for (const o of list) if (!o.ok) err[o.code] = (err[o.code] || 0) + 1;
    rows.push({ op: k, n: list.length, reads: list.reduce((s, o) => s + o.reads, 0), writes: list.reduce((s, o) => s + o.writes + (o.deletes || 0), 0), p50: fmtMs(d.p50), p90: fmtMs(d.p90), p99: fmtMs(d.p99), max: fmtMs(d.max), errors: Object.entries(err).map(([c, n]) => c + '×' + n).join(' ') });
  }
  rows.sort((a, b) => a.op.localeCompare(b.op));
  const clients = run.clients;
  const per = (filter, field, coll, sim) => {
    const cs = clients.filter(filter); if (!cs.length) return 0;
    return ops.filter(o => (coll ? o.coll === coll : true) && !!o.sim === !!sim && cs.some(c => c.i === o.client)).reduce((s, o) => s + (o[field] || 0), 0) / cs.length;
  };
  // every op carries the index of the client that made it (shim.js)
  const kinds = { google: c => c.google, guest: c => !c.google && !!c.nick, nonick: c => !c.nick, all: () => true };
  const colls = ['nejiUsers', 'kusogeRanks', 'kbBoards/e', 'kbProfiles', 'kbPlays'];
  const perClient = {};
  for (const [kn, f] of Object.entries(kinds)) {
    const n = clients.filter(f).length;
    perClient[kn] = { clients: n };
    for (const c of colls) perClient[kn][c] = { reads: +per(f, 'reads', c).toFixed(2), writes: +per(f, 'writes', c).toFixed(2), sim: c === 'kbPlays' ? +per(f, 'writes', c, true).toFixed(2) : undefined };
  }
  const plays = clients.length * run.opt.plays;
  const boardWrites = ops.filter(o => o.coll === 'kbBoards/e' && /^set/.test(o.op)).length;
  const deniedBoard = ops.filter(o => o.coll === 'kbBoards/e' && o.code === 'permission-denied').length;
  const queries = ops.filter(o => o.coll === 'kbBoards/e' && o.op === 'query');
  const rankViews = clients.filter(c => c.rankReads != null);
  const clientErrors = clients.flatMap(c => c.log.filter(l => l[0] === 'error').map(l => 'P' + c.i + ' ' + l[1]));
  const clientWarns = clients.flatMap(c => c.log.filter(l => l[0] === 'warn').map(l => l[1]));
  const denied = ops.filter(o => o.code === 'permission-denied');
  return {
    rows, perClient, plays, peak: run.peak, clients: clients.length,
    boardWritesPerPlay: +(boardWrites / plays).toFixed(2), deniedBoard,
    readsPerBoardQuery: queries.length ? +(queries.reduce((s, o) => s + o.reads, 0) / queries.length).toFixed(1) : 0,
    rankPage: { views: rankViews.length, readsPerView: rankViews.length ? +(rankViews.reduce((s, c) => s + c.rankReads, 0) / rankViews.length).toFixed(1) : 0, cachedReadsAgain: rankViews.reduce((s, c) => s + (c.rankAgainReads || 0), 0), errors: rankViews.flatMap(c => c.rankErrors || []) },
    deniedByColl: Object.fromEntries([...group(denied, o => o.coll + ' ' + o.op)].map(([k, l]) => [k, l.length])),
    latencyAll: dist(ops.map(o => o.ms)),
    clientErrors: clientErrors.slice(0, 20), clientErrorCount: clientErrors.length,
    clientWarnCount: clientWarns.length, clientWarnSample: [...new Set(clientWarns)].slice(0, 8),
    sessionSec: +(clients.reduce((s, c) => s + (c.ms || 0), 0) / clients.length / 1000).toFixed(1),
  };
}

// ---------------------------------------------------------------- RTDB
function summarizeRtdb(r, metrics) {
  const ops = metrics.ops.filter(o => o.api === 'rtdb');
  const rows = [];
  for (const [k, list] of group(ops, o => o.coll + ' ' + o.op)) {
    const d = dist(list.map(o => o.ms));
    const err = {}; for (const o of list) if (!o.ok) err[o.code] = (err[o.code] || 0) + 1;
    rows.push({ op: k, n: list.length, p50: fmtMs(d.p50), p90: fmtMs(d.p90), p99: fmtMs(d.p99), max: fmtMs(d.max), errors: Object.entries(err).map(([c, n]) => c + '×' + n).join(' ') });
  }
  rows.sort((a, b) => a.op.localeCompare(b.op));
  const prop = [];
  for (const [k, list] of group(metrics.ops.filter(o => o.api === 'rtdb-prop'), o => o.coll + ' ' + o.op)) { const d = dist(list.map(o => o.ms)); prop.push({ what: k, n: d.n, p50: fmtMs(d.p50), p90: fmtMs(d.p90), p99: fmtMs(d.p99), max: fmtMs(d.max) }); }
  const formed = r.results.filter(x => x.formed);
  const formation = {};
  for (const kind of ['vs', 'hole', 'shogi']) { const l = formed.filter(x => x.kind === kind && !x.vanished).map(x => x.formedMs); formation[kind] = dist(l); }
  const { REQUIRED } = require('../rules/clients');
  const seen = new Set(Object.keys(r.inventory).map(k => k.replace(/^(\w+) /, (m, kind) => (kind === 'vs' ? 'versus' : kind) + ' ')));
  const missing = [];
  for (const [client, list] of Object.entries(REQUIRED)) for (const w of list) if (!seen.has(client + ' ' + w)) missing.push(client + ' ' + w);
  // player-minutes in a match (from the bots' match time) → bytes per player-minute
  const o = r.o, players = r.results.filter(x => x.formed).length;
  const matchMin = { vs: (o.dur + 12) / 60, hole: (o.len + 20) / 60, shogi: (o.moves * o.thinkMs / 1000 + 20) / 60 };
  const playerMin = r.results.filter(x => x.formed).reduce((s, x) => s + matchMin[x.kind], 0);
  const denied = ops.filter(x => x.code === 'permission-denied');
  return {
    rows, prop, formation, players, bots: r.bots, rooms: r.rooms, left: r.left, missing,
    vanished: r.results.filter(x => x.vanished).length, notFormed: r.results.filter(x => !x.formed).length, errors: r.results.filter(x => x.error).map(x => x.error.slice(0, 300)),
    denied: denied.length, deniedSample: denied.slice(0, 5).map(x => x.coll + ' ' + x.op + ' ' + x.path),
    net: r.net, conn: r.conn, durationMs: r.durationMs,
    bytesPerPlayerMin: Math.round((r.net.rx + r.net.tx) / Math.max(1, playerMin)), rxPerPlayerMin: Math.round(r.net.rx / Math.max(1, playerMin)), playerMin: +playerMin.toFixed(1),
    afterIdle: r.conn.length ? r.conn[r.conn.length - 1][1] : null,
    opt: o,
  };
}

// ---------------------------------------------------------------- Hosting（sw.js がはじめに保存するファイルの大きさ）
function precache() {
  const src = fs.readFileSync(path.join(ROOT, 'sw.js'), 'utf8');
  const reg = require(path.join(ROOT, 'common/games.js'));
  const self = { KOBO_REGISTRY: reg, registration: { scope: 'https://x/' }, addEventListener() {} };
  const ctx = { self, importScripts() {}, location: { origin: 'https://x' }, URL, Request: function () {}, Response: function () {}, caches: {}, fetch() {} };
  vm.createContext(ctx);
  vm.runInContext(src + '\n;this.__lists = { CORE, ENGINES, PAGES, IMAGES };', ctx);
  const L = ctx.__lists;
  let raw = 0, gz = 0, files = 0;
  const all = [...new Set([].concat(L.CORE, L.PAGES, L.ENGINES, L.IMAGES))];
  for (const u of all) {
    let f = path.join(ROOT, u.replace(/^\.\//, ''));
    if (u === './' || u.endsWith('/')) f = path.join(f, 'index.html');
    if (!fs.existsSync(f)) continue;
    const b = fs.readFileSync(f); files++; raw += b.length;
    gz += /\.(png|webp|jpg)$/.test(f) ? b.length : zlib.gzipSync(b, { level: 6 }).length;
  }
  const three = path.join(__dirname, '..', '.cache', 'three-r128.min.js');
  return { files, raw, gzip: gz, threeFromCdn: fs.existsSync(three) ? fs.statSync(three).size : 0 };
}

// ---------------------------------------------------------------- 無料枠の見積もり
// 1回あたりの値（このテストで測ったもの：ボード1つを見ると何件読むか、1回遊ぶと kbBoards に何件書くか、1回開くと nejiUsers に
// 何件書くか…）に、1日の遊び方（下の3つの型）をかけて、1人1日あたりの読み書きにする。型の混ぜ方は 60% / 30% / 10%。
const SCENARIOS = {
  light:   { share: 0.6, sessions: 1, plays: 3,  games: 1, boardViews: 0,  overall: 0, pagesPerSession: 2, onlineMin: 0 },
  typical: { share: 0.3, sessions: 2, plays: 6,  games: 2, boardViews: 2,  overall: 0, pagesPerSession: 3, onlineMin: 6 },
  heavy:   { share: 0.1, sessions: 4, plays: 20, games: 3, boardViews: 12, overall: 2, pagesPerSession: 4, onlineMin: 30 },
};
const GOOGLE = 0.4; // signed in with Google (synced to nejiUsers); the others play as guests
function estimate(F, R, H) {
  const out = { scenarios: {}, quota: { reads: 50000, writes: 20000, deletes: 20000, rtdbConnections: 100, rtdbStoredGB: 1, rtdbDownloadGBMonth: 10, hostingMBDay: 360 } };
  if (F) {
    const g = F.perClient.google, gu = F.perClient.guest;
    const P = F.plays / F.clients;                                   // plays per measured session
    const unit = {
      readsPerBoardView: F.readsPerBoardQuery,                          // kbBoards top 30 (5-minute cache)
      readsPerOverall: F.perClient.all.kbProfiles.reads,               // kbProfiles top 30
      readsPerGooglePage: g.nejiUsers.reads / 2,                       // nejiUsers get when a page opens (2 pages per measured session)
      readsPopular: 2,                                                 // kbPlays this week + last week (6-hour cache)
      boardWritesPerPlay: F.boardWritesPerPlay,
      legacyWritesPerSession: GOOGLE * g.kusogeRanks.writes + (1 - GOOGLE) * gu.kusogeRanks.writes, // until 2026-12-02
      nejiWritesPerSession: g.nejiUsers.writes,                        // Google users only (30-second batching)
      profileWritesPerSession: (g.kbProfiles.writes + gu.kbProfiles.writes) / 2, // at most 4 a day
      measuredPlaysPerSession: P,
    };
    out.unit = unit;
    let mixR = 0, mixW = 0, mixWNoLegacy = 0;
    for (const [name, sc] of Object.entries(SCENARIOS)) {
      const reads = sc.boardViews * unit.readsPerBoardView + sc.overall * unit.readsPerOverall
        + GOOGLE * sc.sessions * sc.pagesPerSession * unit.readsPerGooglePage + unit.readsPopular * Math.min(sc.sessions, 2);
      const wBoards = Math.min(40, sc.plays * unit.boardWritesPerPlay);
      const wLegacy = unit.legacyWritesPerSession * sc.sessions * Math.min(1, sc.plays / sc.sessions / P);
      const wNeji = GOOGLE * unit.nejiWritesPerSession * sc.sessions;
      const wProf = Math.min(4, unit.profileWritesPerSession * sc.sessions);
      const writes = wBoards + wLegacy + wNeji + wProf;
      const r1 = x => Math.round(x * 10) / 10;
      out.scenarios[name] = { share: sc.share, reads: r1(reads), writes: r1(writes), writesAfterLegacyEnd: r1(writes - wLegacy), kbPlaysIfSent: sc.games,
        parts: { wBoards: r1(wBoards), wLegacy: r1(wLegacy), wNeji: r1(wNeji), wProf: r1(wProf) },
        dauIfEveryoneLikeThis: Math.floor(Math.min(50000 / reads, 20000 / writes)) };
      mixR += sc.share * reads; mixW += sc.share * writes; mixWNoLegacy += sc.share * (writes - wLegacy);
    }
    out.firestore = { readsPerDau: +mixR.toFixed(1), writesPerDau: +mixW.toFixed(1), writesPerDauAfterLegacyEnd: +mixWNoLegacy.toFixed(1), deletesPerDau: 0,
      dauByReads: Math.floor(50000 / mixR), dauByWrites: Math.floor(20000 / mixW), dauByWritesAfterLegacyEnd: Math.floor(20000 / mixWNoLegacy) };
    out.firestore.dau = Math.min(out.firestore.dauByReads, out.firestore.dauByWrites);
  }
  if (R) {
    const peakHourShare = 0.15;          // the busiest hour has 15% of a day's play
    const onlineMinPerDau = Object.values(SCENARIOS).reduce((s, sc) => s + sc.share * sc.onlineMin, 0);
    // with goOffline (this change): connected only while matching / playing. Before: from the first match until the page closed
    const connectedMinBefore = Object.values(SCENARIOS).reduce((s, sc) => s + sc.share * (sc.onlineMin ? sc.onlineMin + 20 : 0), 0);
    const concurrent = m => m * peakHourShare / 60;
    const rxGBMonth = R.rxPerPlayerMin * onlineMinPerDau * 30 / 1e9; // the plan counts data downloaded from the database
    out.rtdb = {
      onlineMinPerDau: +onlineMinPerDau.toFixed(2), bytesPerPlayerMin: R.bytesPerPlayerMin, rxPerPlayerMin: R.rxPerPlayerMin,
      dauByConnections: Math.floor(100 / concurrent(onlineMinPerDau)), dauByConnectionsBefore: Math.floor(100 / concurrent(connectedMinBefore)),
      gbPerMonthPerDau: +rxGBMonth.toFixed(5), dauByTransfer: Math.floor(10 / rxGBMonth), storedAfterRun: R.left,
    };
  }
  if (H) {
    // Firebase Hosting (Spark): 360 MB/day. A new visitor downloads the precache (gzip; images as they are); an update only re-checks (304)
    out.hosting = { precacheGzipMB: +(H.gzip / 1e6).toFixed(2), newVisitorsPerDayOnWebApp: Math.floor(360e6 / H.gzip), note: 'GitHub Pages (seg1gpt0jpn.github.io) has no daily cap' };
  }
  const caps = [out.firestore && out.firestore.dau, out.rtdb && out.rtdb.dauByConnections, out.rtdb && out.rtdb.dauByTransfer].filter(x => x > 0);
  out.dau = caps.length ? Math.min(...caps) : null;
  return out;
}

// ---------------------------------------------------------------- main
(async () => {
  // --estimate: only recompute the estimate from a saved results file (no emulators)
  if (has('--estimate')) {
    const r = JSON.parse(fs.readFileSync(OUT, 'utf8'));
    r.hosting = precache(); r.estimate = estimate(r.fs, r.rtdb, r.hosting);
    fs.writeFileSync(OUT, JSON.stringify(r, null, 1));
    console.log(JSON.stringify(r.estimate, null, 1));
    return;
  }
  const report = { at: new Date().toISOString(), quick };
  let emu = null, fail = [];
  try {
    console.log('starting the Firebase emulators…');
    emu = await require('../rules/emulator').start({ verbose: has('--verbose') });
    const T = emulatorTarget(emu.ports);
    if (only.includes('fs')) {
      const { runFirestoreLoad } = require('./fs-clients');
      const metrics = new Metrics();
      const n = +(val('--clients') || (quick ? 20 : 200));
      console.log(`Firestore: ${n} clients (real common/*.js in vm, REST to the emulator)…`);
      const run = await runFirestoreLoad(T, metrics, quick ? { clients: n, ramp: 4000, plays: 3, playMs: 4000, tailMs: 22000 } : { clients: n });
      report.fs = summarizeFs(run, metrics);
      report.fs.raw = metrics.ops.length;
      console.log(table(report.fs.rows, ['op', 'n', 'reads', 'writes', 'p50', 'p90', 'p99', 'max', 'errors']));
      console.log(`  peak ${report.fs.peak} clients at once, ${report.fs.plays} plays, session ${report.fs.sessionSec} s; kbBoards writes/play ${report.fs.boardWritesPerPlay}; reads/board query ${report.fs.readsPerBoardQuery}; ranking page ${report.fs.rankPage.readsPerView} reads/visit (again: ${report.fs.rankPage.cachedReadsAgain})`);
      console.log('  denied:', JSON.stringify(report.fs.deniedByColl), ' client errors:', report.fs.clientErrorCount, ' warnings:', report.fs.clientWarnCount);
      const unexpected = Object.entries(report.fs.deniedByColl).filter(([k]) => !/^kbBoards\/e set/.test(k));
      if (unexpected.length) fail.push('Firestore: unexpected rule denials ' + JSON.stringify(unexpected));
      if (report.fs.deniedBoard > report.fs.plays * 0.2) fail.push('Firestore: too many refused kbBoards writes (' + report.fs.deniedBoard + ')');
      if (report.fs.clientErrorCount) fail.push('Firestore: client errors ' + report.fs.clientErrors.slice(0, 3).join(' / '));
      if (report.fs.rankPage.errors.length) fail.push('Firestore: ranking read errors ' + report.fs.rankPage.errors.slice(0, 3).join(','));
      if (report.fs.rankPage.cachedReadsAgain) fail.push('Firestore: the ranking cache did not hold (' + report.fs.rankPage.cachedReadsAgain + ' reads)');
      const other = report.fs.rows.filter(r => r.errors && !/permission-denied/.test(r.errors));
      if (other.length) fail.push('Firestore: errors ' + other.map(r => r.op + ' ' + r.errors).join(', '));
      await emu.clearData();
    }
    if (only.includes('rtdb')) {
      const { runRtdbLoad } = require('./rtdb-bots');
      const metrics = new Metrics();
      const pv = (val('--pairs') || (quick ? '2,2,2' : '20,15,15')).split(',').map(Number);
      const pairs = { vs: pv[0], hole: pv[1] != null ? pv[1] : pv[0], shogi: pv[2] != null ? pv[2] : pv[0] };
      console.log(`RTDB: ${pairs.vs + pairs.hole + pairs.shogi} pairs (vs ${pairs.vs}, hole ${pairs.hole}, shogi ${pairs.shogi}) with the real Firebase SDK…`);
      const r = await runRtdbLoad(emu, metrics, Object.assign({ pairs, verbose: has('--verbose'), idleOff: has('--no-idle-off') ? -1 : 20000 }, quick ? { dur: 15, len: 25, moves: 12, thinkMs: 800, discMs: 6000, ramp: 3000, vanish: 0.5 } : {}));
      report.rtdb = summarizeRtdb(r, metrics);
      const R = report.rtdb;
      console.log(table(R.rows, ['op', 'n', 'p50', 'p90', 'p99', 'max', 'errors']));
      console.log('  delivery to the other players (ms):'); console.log(table(R.prop, ['what', 'n', 'p50', 'p90', 'p99', 'max']));
      console.log(`  players ${R.players}/${R.bots} in a match (rooms vs ${R.rooms.vs}, hole ${R.rooms.hole}, shogi ${R.rooms.shogi}), closed the tab mid-match ${R.vanished}, not matched ${R.notFormed}`);
      console.log(`  match found in (ms): vs p50 ${fmtMs(R.formation.vs.p50)} / hole p50 ${fmtMs(R.formation.hole.p50)} / shogi p50 ${fmtMs(R.formation.shogi.p50)}`);
      console.log(`  connections: peak ${R.net.peak}, opened ${R.net.opened}, open after the idle timeout ${R.afterIdle}; transfer rx ${(R.net.rx / 1e6).toFixed(2)} MB tx ${(R.net.tx / 1e6).toFixed(2)} MB → ${R.bytesPerPlayerMin} B per player-minute`);
      console.log('  left behind:', JSON.stringify(R.left), ' denied:', R.denied, ' missing write kinds:', R.missing.length ? R.missing.join(', ') : 'none');
      if (Object.values(R.left).some(n => n > 0)) fail.push('RTDB: left behind ' + JSON.stringify(R.left));
      if (R.denied) fail.push('RTDB: rule denials ' + R.deniedSample.join(' / '));
      if (R.missing.length) fail.push('RTDB: write kinds not seen ' + R.missing.join(', '));
      if (R.errors.length) fail.push('RTDB: errors ' + R.errors.slice(0, 2).join(' / '));
      if (R.notFormed > R.bots * 0.1) fail.push('RTDB: ' + R.notFormed + ' players were never matched');
      if (!has('--no-idle-off') && R.afterIdle > 0) fail.push('RTDB: ' + R.afterIdle + ' connections still open after the idle timeout');
    }
    report.hosting = precache();
    report.estimate = estimate(report.fs, report.rtdb, report.hosting);
    console.log('\nestimate (Spark plan):', JSON.stringify(report.estimate, null, 1));
  } catch (e) {
    console.error(e); fail.push('crashed: ' + (e && e.message));
  } finally {
    if (emu) await emu.stop();
  }
  report.fail = fail;
  fs.mkdirSync(path.dirname(OUT), { recursive: true });
  const slim = JSON.parse(JSON.stringify(report));
  fs.writeFileSync(OUT, JSON.stringify(slim, null, 1));
  console.log('\nwrote ' + path.relative(process.cwd(), OUT));
  console.log(fail.length ? 'FAIL\n  ' + fail.join('\n  ') : 'PASS');
  process.exit(fail.length ? 1 : 0);
})();
