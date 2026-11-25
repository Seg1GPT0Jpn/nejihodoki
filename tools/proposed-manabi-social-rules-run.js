#!/usr/bin/env node
// まなびのソーシャル用ルール案（tools/proposed-manabi-social-rules.txt）を、いまの firestore.rules に足してエミュレーターで試す。
//   node tools/proposed-manabi-social-rules-run.js          （firebase-tools と Java が要る。tools/tests/rules/emulator.js と同じ）
// firestore.rules は書きかえない。案をつないだルールを、エミュレーターにだけ読み込ませる。
'use strict';
const fs = require('fs');
const path = require('path');
const ROOT = path.resolve(__dirname, '..');
const { start, PORTS, PROJECT } = require('./tests/rules/emulator');
const { emulatorTarget, signUp, fsSet, fsGet, fsList, fsDelete, SERVER_TIME } = require('./tests/rules/rest');

function mergedRules() {
  const base = fs.readFileSync(path.join(ROOT, 'firestore.rules'), 'utf8');
  const prop = fs.readFileSync(path.join(__dirname, 'proposed-manabi-social-rules.txt'), 'utf8').split('\n').filter(l => !/^\s*\/\/ ?(-|=)/.test(l) && !/^\/\/ /.test(l) && !/^\/\//.test(l)).join('\n');
  const i = base.lastIndexOf('  }\n}'); // match /databases の閉じかっこの前
  if (i < 0) throw new Error('could not find the end of firestore.rules');
  return base.slice(0, i) + '\n' + prop + '\n' + base.slice(i);
}
const JST = 9 * 3600e3, weekNo = (ms = Date.now()) => Math.floor((ms + JST + 3 * 86400e3) / (7 * 86400e3));

async function cases(T, put) {
  const rows = []; const owner = { token: 'owner' };
  const check = async (name, expect, fn) => {
    let r; try { r = await fn(); } catch (e) { r = { ok: false, status: 'ERR', body: String(e.message) }; }
    const denied = r.status === 403 || r.status === 401; const got = r.ok ? 'allow' : denied ? 'deny' : 'error';
    rows.push({ name, expect, got, pass: got === expect, detail: got === expect ? '' : JSON.stringify(r.body).slice(0, 300) }); return r;
  };
  const A = await signUp(T), B = await signUp(T), C = await signUp(T);
  const wk = weekNo(), room = `w${wk}-t2-1`, now = () => ({ n: 'Taro', x: 40, t: SERVER_TIME });
  // --- リーグ
  await check('league: create a room with only myself', 'allow', () => fsSet(T, `kbLg/${room}`, { wk, m: { [A.uid]: now() } }, A));
  await check('league: read as another signed-in player', 'allow', () => fsGet(T, `kbLg/${room}`, B));
  await check('league: read signed out', 'deny', () => fsGet(T, `kbLg/${room}`, null));
  await check('league: list all rooms', 'deny', () => fsList(T, '', 'kbLg', B, { limit: 5 }));
  await check('league: B joins with only B’s own entry', 'allow', () => fsSet(T, `kbLg/${room}`, { m: { [B.uid]: now() } }, B, { merge: true }));
  await check('league: B writes A’s entry', 'deny', () => fsSet(T, `kbLg/${room}`, { m: { [A.uid]: { n: 'Taro', x: 9000, t: SERVER_TIME } } }, B, { merge: true }));
  await new Promise(r => setTimeout(r, 1200));
  await check('league: C joins then writes xp above the weekly cap', 'deny', () => fsSet(T, `kbLg/${room}`, { m: { [C.uid]: { n: 'Hana', x: 12001, t: SERVER_TIME } } }, C, { merge: true }));
  await check('league: C joins with a negative xp', 'deny', () => fsSet(T, `kbLg/${room}`, { m: { [C.uid]: { n: 'Hana', x: -1, t: SERVER_TIME } } }, C, { merge: true }));
  await check('league: C joins with a 13-character name', 'deny', () => fsSet(T, `kbLg/${room}`, { m: { [C.uid]: { n: 'abcdefghijklm', x: 1, t: SERVER_TIME } } }, C, { merge: true }));
  await check('league: C joins with an extra field', 'deny', () => fsSet(T, `kbLg/${room}`, { m: { [C.uid]: { n: 'Hana', x: 1, t: SERVER_TIME, z: 1 } } }, C, { merge: true }));
  await check('league: A raises xp too quickly (under 60 s since the last write)', 'deny', () => fsSet(T, `kbLg/${room}`, { m: { [A.uid]: { n: 'Taro', x: 50, t: SERVER_TIME } } }, A, { merge: true }));
  await check('league: a room for another week', 'deny', () => fsSet(T, `kbLg/w${wk + 5}-t2-1`, { wk: wk + 5, m: { [A.uid]: now() } }, A));
  await check('league: a malformed room id', 'deny', () => fsSet(T, `kbLg/${room}x`, { wk, m: { [A.uid]: now() } }, A));
  await check('league: tier out of range', 'deny', () => fsSet(T, `kbLg/w${wk}-t9-1`, { wk, m: { [A.uid]: now() } }, A));
  await check('league: create with someone else in it', 'deny', () => fsSet(T, `kbLg/w${wk}-t3-1`, { wk, m: { [A.uid]: now(), [B.uid]: now() } }, A));
  // 30人
  const big = {}; for (let i = 0; i < 30; i++) big['u' + String(i).padStart(2, '0') + 'x'.repeat(24)] = { n: 'Bot' + i, x: i, t: new Date() };
  await put(`kbLg/w${wk}-t4-1`, { wk, m: big });
  await check('league: the 31st member is refused (room full)', 'deny', () => fsSet(T, `kbLg/w${wk}-t4-1`, { m: { [A.uid]: now() } }, A, { merge: true }));
  // --- フィード
  const ev = (ty, tx) => ({ ty, tx, at: Date.now() });
  await check('feed: write my own events', 'allow', () => fsSet(T, `kbFeed/${A.uid}`, { e: { e0: ev('streak', '7日れんぞく！') }, t: SERVER_TIME }, A));
  await check('feed: read another player’s feed (get)', 'allow', () => fsGet(T, `kbFeed/${A.uid}`, B));
  await check('feed: write someone else’s feed', 'deny', () => fsSet(T, `kbFeed/${A.uid}`, { e: { e0: ev('ach', 'x') }, t: SERVER_TIME }, B));
  await check('feed: unknown event type', 'deny', () => fsSet(T, `kbFeed/${B.uid}`, { e: { e0: ev('hack', 'x') }, t: SERVER_TIME }, B));
  await check('feed: text longer than 60', 'deny', () => fsSet(T, `kbFeed/${B.uid}`, { e: { e0: ev('ach', 'x'.repeat(61)) }, t: SERVER_TIME }, B));
  await check('feed: an 11th slot', 'deny', () => fsSet(T, `kbFeed/${B.uid}`, { e: { e10: ev('ach', 'x') }, t: SERVER_TIME }, B));
  await check('feed: list', 'deny', () => fsList(T, '', 'kbFeed', B, { limit: 5 }));
  // --- ペア
  const [lo, hi] = [A.uid, B.uid].sort(), pid = lo + '_' + hi, aIsLo = A.uid === lo, LO = aIsLo ? A : B, HI = aIsLo ? B : A;
  await check('pair: the smaller uid creates the pair doc with only its own xp', 'allow', () => fsSet(T, `kbPairs/${pid}`, { a: lo, b: hi, wk, xa: 30, xb: 0 }, LO));
  await check('pair: the other member reads it', 'allow', () => fsGet(T, `kbPairs/${pid}`, HI));
  await check('pair: an outsider reads it', 'deny', () => fsGet(T, `kbPairs/${pid}`, C));
  await check('pair: the second member writes only its own xp', 'allow', () => fsSet(T, `kbPairs/${pid}`, { xb: 20 }, HI, { merge: true }));
  await check('pair: the second member writes the other side’s xp', 'deny', () => fsSet(T, `kbPairs/${pid}`, { xa: 999 }, HI, { merge: true }));
  await check('pair: xp jumps by more than 2000', 'deny', () => fsSet(T, `kbPairs/${pid}`, { xb: 5000 }, HI, { merge: true }));
  await check('pair: an outsider creates a pair of two others', 'deny', () => fsSet(T, `kbPairs/${[B.uid, A.uid].sort().join('_')}x`, { a: lo, b: hi, wk, xa: 0, xb: 0 }, C));
  await check('pair: list', 'deny', () => fsList(T, '', 'kbPairs', A, { limit: 5 }));
  return rows;
}

(async () => {
  const E = await start({});
  let code = 0;
  try {
    const rules = mergedRules();
    const r = await fetch(`http://127.0.0.1:${PORTS.firestore}/emulator/v1/projects/${PROJECT}:securityRules`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ rules: { files: [{ name: 'firestore.rules', content: rules }] } }) });
    const body = await r.text(); let o = null; try { o = JSON.parse(body); } catch (e) {}
    if (!r.ok || ((o && o.issues) || []).some(i => i.severity === 'ERROR')) throw new Error('proposed rules rejected: ' + body.slice(0, 1500));
    const T = emulatorTarget(PORTS);
    const put = async (p, data) => { const { fsReq } = require('./tests/rules/rest'); }; // placeholder replaced below
    const rest = require('./tests/rules/rest');
    const admin = { token: 'owner' };
    const rows = await cases(T, (p, data) => rest.fsSet(T, p, data, admin));
    for (const x of rows) console.log(`  ${x.pass ? 'ok  ' : 'FAIL'} ${x.name} — expect ${x.expect}, got ${x.got}${x.detail ? ' ' + x.detail : ''}`);
    const bad = rows.filter(x => !x.pass).length; console.log(`\npass ${rows.length - bad}  fail ${bad}`); code = bad ? 1 : 0;
  } catch (e) { console.error(e.message); code = 1; }
  await E.stop(); process.exit(code);
})();
