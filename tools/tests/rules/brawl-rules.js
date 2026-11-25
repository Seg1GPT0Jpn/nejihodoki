#!/usr/bin/env node
// おもちゃ大乱闘のオンライン対戦（RTDB の bw/ ルール）の許可・拒否のテスト。
// ルールはリポジトリの database.rules.json の "bw" ブロック（エミュレーターが起動時に読み込むものをそのまま確かめる）。
//   node tools/tests/rules/brawl-rules.js          エミュレーターで（REST、匿名のトークン）
// 他のルール（vs / tr / shogi / hole）が壊れていないことの目印のケースも少し入れている。
// tools/tests/rules/run.js の --only bw（と、--only を付けない全部）からは exports.runBrawlCases(T, opt)（cases.js の runCases と同じ形の行を返す）が呼ばれる。
'use strict';
const fs = require('fs');
const path = require('path');
const { emulatorTarget, signUp, rtdb, TS } = require('./rest');
const ROOT = path.resolve(__dirname, '../../..');

const rid = p => p + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
const sleep = ms => new Promise(r => setTimeout(r, ms));

// ルール：リポジトリの database.rules.json（bw が入っていなければ明示的に失敗する）
function mergedRules() {
  const base = JSON.parse(fs.readFileSync(path.join(ROOT, 'database.rules.json'), 'utf8'));
  if (!base.rules.bw) throw new Error('database.rules.json has no "bw" block');
  return { text: JSON.stringify(base), inserted: false };
}

async function runBrawlCases(T, opt = {}) {
  const results = [];
  async function check(group, name, expect, fn) {
    let r;
    try { r = await fn(); } catch (e) { r = { ok: false, status: 'ERR', body: String(e && e.message || e) }; }
    const denied = r.status === 403 || r.status === 401 || (r.ok === false && Array.isArray(r.body) && /PERMISSION_DENIED/.test(JSON.stringify(r.body))) || (r.ok === false && r.body && /Permission denied/i.test(JSON.stringify(r.body)));
    const got = r.ok ? 'allow' : denied ? 'deny' : 'error';
    const row = { group, name, expect, got, pass: got === expect, status: r.status };
    if (!row.pass || opt.verbose) row.detail = JSON.stringify(r.body).slice(0, 300);
    results.push(row);
    if (opt.log) opt.log(row);
    return r;
  }
  const A = await signUp(T), B = await signUp(T), C = await signUp(T), D = await signUp(T);
  const put = (p, v, u) => rtdb(T, 'PUT', p, v, u);
  const get = (p, u) => rtdb(T, 'GET', p, undefined, u);
  const del = (p, u) => rtdb(T, 'DELETE', p, undefined, u);
  const seat = (u, n, c) => ({ u: u.uid, n: n || 'Aoi', c: c || 'robo', tj: 1, j: TS });
  const roomVal = (u, o) => Object.assign({ meta: { at: TS, h: u.uid, n: 2, k: 'c', v: 1 }, seats: { 0: seat(u, 'Host') }, cfg: { s: 'rnd', p: 0 } }, o || {});
  // 部屋を作って、ホストが「いる」印をつける（ほかの人はまだ入っていない）
  async function mk(host, o) { const id = rid('r'); const r = await put('bw/rooms/' + id, roomVal(host, o), host); if (!r.ok) throw new Error('setup: room refused ' + JSON.stringify(r.body)); await put(`bw/rooms/${id}/on/${host.uid}`, 1, host); return id; }
  async function mk2(host, guest, o) { const id = await mk(host, o); const r = await put(`bw/rooms/${id}/seats/1`, seat(guest, 'Guest', 'duck'), guest); if (!r.ok) throw new Error('setup: guest seat refused ' + JSON.stringify(r.body)); await put(`bw/rooms/${id}/on/${guest.uid}`, 1, guest); return id; }
  const batch = (extra) => Object.assign({ g: 1, f: 120, s: 123, b: 116, d: 'AAAAAAAAAAAAAAAAAAAAAAAA', a: '120,118', t: 123456, e: 123400, w: 12 }, extra || {});

  // ================================================================ queue
  { const g = 'bw:queue';
    await check(g, 'own entry (quick match)', 'allow', () => put('bw/queue/' + A.uid, { n: 'Aoi', t: TS, h: TS, k: 2, v: 1 }, A));
    await check(g, 'own heartbeat update', 'allow', () => rtdb(T, 'PATCH', 'bw/queue/' + A.uid, { h: TS }, A));
    await check(g, 'room pointer { r, m }', 'allow', () => rtdb(T, 'PATCH', 'bw/queue/' + A.uid, { r: 'abc123', m: [A.uid, B.uid] }, A));
    await check(g, 'someone else writes my entry', 'deny', () => put('bw/queue/' + A.uid, { n: 'Evil', t: TS, k: 2 }, B));
    await check(g, 'someone else deletes my entry', 'deny', () => del('bw/queue/' + A.uid, B));
    await check(g, 'signed-out write', 'deny', () => put('bw/queue/' + A.uid, { n: 'x', t: TS, k: 2 }, null));
    await check(g, 'no nickname', 'deny', () => put('bw/queue/' + B.uid, { t: TS, k: 2 }, B));
    await check(g, 'nickname over 12 chars', 'deny', () => put('bw/queue/' + B.uid, { n: '1234567890123', t: TS, k: 2 }, B));
    await check(g, 'players k out of range', 'deny', () => put('bw/queue/' + B.uid, { n: 'Ben', t: TS, k: 5 }, B));
    await check(g, 'time in the future', 'deny', () => put('bw/queue/' + B.uid, { n: 'Ben', t: Date.now() + 600000, k: 2 }, B));
    await check(g, 'unknown field', 'deny', () => put('bw/queue/' + B.uid, { n: 'Ben', t: TS, k: 2, evil: 1 }, B));
    await check(g, 'read the queue (signed in)', 'allow', () => get('bw/queue', B));
    await check(g, 'read the queue (signed out)', 'deny', () => get('bw/queue', null));
    await check(g, 'own entry removed (cancel / onDisconnect)', 'allow', () => del('bw/queue/' + A.uid, A));
  }
  // ================================================================ rooms
  { const g = 'bw:rooms';
    const id = rid('room');
    await check(g, 'host creates a room (meta, seat 0, cfg)', 'allow', () => put('bw/rooms/' + id, roomVal(A), A));
    await check(g, 'host marks presence on/{uid}', 'allow', () => put(`bw/rooms/${id}/on/${A.uid}`, 1, A));
    await check(g, 'read meta (signed in)', 'allow', () => get(`bw/rooms/${id}/meta`, B));
    await check(g, 'read meta (signed out)', 'deny', () => get(`bw/rooms/${id}/meta`, null));
    await check(g, 'read the whole room node (rooms cannot be listed or scraped)', 'deny', () => get(`bw/rooms/${id}`, B));
    await check(g, 'list all rooms', 'deny', () => get('bw/rooms', B));
    await check(g, 'create over an existing room', 'deny', () => put('bw/rooms/' + id, roomVal(B), B));
    await check(g, 'meta rewritten by a guest', 'deny', () => put(`bw/rooms/${id}/meta/h`, B.uid, B));
    await check(g, 'create: meta.h is someone else', 'deny', () => put('bw/rooms/' + rid('r'), roomVal(B, { meta: { at: TS, h: A.uid, n: 2, k: 'c', v: 1 } }), B));
    await check(g, 'create: seat 0 belongs to someone else', 'deny', () => put('bw/rooms/' + rid('r'), roomVal(B, { seats: { 0: seat(A) } }), B));
    await check(g, 'create: seat 0 missing', 'deny', () => put('bw/rooms/' + rid('r'), { meta: { at: TS, h: B.uid, n: 2, k: 'c', v: 1 } }, B));
    await check(g, 'create: players n = 5', 'deny', () => put('bw/rooms/' + rid('r'), roomVal(B, { meta: { at: TS, h: B.uid, n: 5, k: 'c', v: 1 } }), B));
    await check(g, 'create: kind not q/c', 'deny', () => put('bw/rooms/' + rid('r'), roomVal(B, { meta: { at: TS, h: B.uid, n: 2, k: 'x', v: 1 } }), B));
    await check(g, 'create: unknown meta field', 'deny', () => put('bw/rooms/' + rid('r'), roomVal(B, { meta: { at: TS, h: B.uid, n: 2, k: 'c', v: 1, evil: 1 } }), B));
    await check(g, 'create: already holding a go / in / res', 'deny', () => put('bw/rooms/' + rid('r'), roomVal(B, { go: { g: 1 } }), B));
    await check(g, 'create: unknown top-level child', 'deny', () => put('bw/rooms/' + rid('r'), roomVal(B, { evil: 1 }), B));
    await check(g, 'create: signed out', 'deny', () => put('bw/rooms/' + rid('r'), roomVal(B), null));
    await check(g, 'quick-match room with invitation list', 'allow', () => put('bw/rooms/' + rid('r'), roomVal(B, { meta: { at: TS, h: B.uid, n: 2, k: 'q', v: 1, inv: { [B.uid]: 1, [C.uid]: 1 } } }), B));
    await check(g, 'delete by a stranger while the host is here', 'deny', () => del('bw/rooms/' + id, C));
    await check(g, 'delete by the host', 'allow', () => del('bw/rooms/' + id, A));
    // ホストが消えていて（on がない）、席にいる人は片づけてよい
    const id2 = await mk2(A, B);
    await check(g, 'guest cannot delete while the host is present', 'deny', () => del('bw/rooms/' + id2, B));
    await del(`bw/rooms/${id2}/on/${A.uid}`, A);
    await check(g, 'guest deletes the room once the host is gone (on/{host} missing)', 'allow', () => del('bw/rooms/' + id2, B));
    const id3 = rid('old');
    await put('bw/rooms/' + id3, roomVal(A, { meta: { at: Date.now() - 4 * 3600e3, h: A.uid, n: 2, k: 'c', v: 1 } }), A);
    await check(g, 'anyone sweeps a room older than 3 hours', 'allow', () => del('bw/rooms/' + id3, D));
    const id4 = await mk(A);
    await check(g, 'anyone cannot sweep a fresh room', 'deny', () => del('bw/rooms/' + id4, D));
    await del('bw/rooms/' + id4, A);
  }
  // ================================================================ codes
  { const g = 'bw:codes';
    const id = await mk(A), other = await mk(B);
    const code = String(100000 + Math.floor(Math.random() * 899999));
    await check(g, 'host registers a code for their own room', 'allow', () => put('bw/codes/' + code, { h: A.uid, r: id, t: TS }, A));
    await check(g, 'read one code', 'allow', () => get('bw/codes/' + code, B));
    await check(g, 'list the codes', 'deny', () => get('bw/codes', B));
    await check(g, 'take over an existing code', 'deny', () => put('bw/codes/' + code, { h: B.uid, r: other, t: TS }, B));
    await check(g, 'register a code that points at someone else’s room', 'deny', () => put('bw/codes/' + String(+code + 1), { h: C.uid, r: id, t: TS }, C));
    await check(g, 'code with h of someone else', 'deny', () => put('bw/codes/' + String(+code + 2), { h: A.uid, r: other, t: TS }, B));
    await check(g, 'code that is not 6 digits', 'deny', () => put('bw/codes/12ab56', { h: A.uid, r: id, t: TS }, A));
    await check(g, 'unknown field in a code', 'deny', () => put('bw/codes/' + String(+code + 3), { h: A.uid, r: id, t: TS, x: 1 }, A));
    await check(g, 'someone else deletes the code', 'deny', () => del('bw/codes/' + code, B));
    await check(g, 'host deletes the code', 'allow', () => del('bw/codes/' + code, A));
    await del('bw/rooms/' + id, A); await del('bw/rooms/' + other, B);
  }
  // ================================================================ seats / cfg / presence / ready / rematch
  { const g = 'bw:seats';
    const id = await mk(A);
    await check(g, 'guest sits in seat 1', 'allow', () => put(`bw/rooms/${id}/seats/1`, seat(B, 'Guest', 'duck'), B));
    await check(g, 'a third person takes seat 1', 'deny', () => put(`bw/rooms/${id}/seats/1`, seat(C), C));
    await check(g, 'a third person takes seat 2 of a 2-player room', 'deny', () => put(`bw/rooms/${id}/seats/2`, seat(C), C));
    await check(g, 'sit in seat 0 (taken by the host)', 'deny', () => put(`bw/rooms/${id}/seats/0`, seat(C), C));
    await check(g, 'seat index 4', 'deny', () => put(`bw/rooms/${id}/seats/4`, seat(C), C));
    await check(g, 'guest takes a second seat', 'deny', () => put(`bw/rooms/${id}/seats/2`, seat(B), B));
    await check(g, 'seat for someone else (u is not me)', 'deny', () => put(`bw/rooms/${id}/seats/3`, seat(A), C));
    await check(g, 'guest changes own character', 'allow', () => put(`bw/rooms/${id}/seats/1`, seat(B, 'Guest', 'tin'), B));
    await check(g, 'someone else changes my character', 'deny', () => put(`bw/rooms/${id}/seats/1/c`, 'bear', C));
    await check(g, 'the host changes the guest’s character', 'deny', () => put(`bw/rooms/${id}/seats/1/c`, 'bear', A));
    await check(g, 'character id that is not a toy name shape', 'deny', () => put(`bw/rooms/${id}/seats/1`, seat(B, 'Guest', 'ROBO!'), B));
    await check(g, 'nickname over 12 characters', 'deny', () => put(`bw/rooms/${id}/seats/1`, seat(B, '1234567890123', 'duck'), B));
    await check(g, 'tap-jump flag out of range', 'deny', () => put(`bw/rooms/${id}/seats/1`, Object.assign(seat(B), { tj: 2 }), B));
    await check(g, 'unknown seat field', 'deny', () => put(`bw/rooms/${id}/seats/1`, Object.assign(seat(B), { evil: 1 }), B));
    await check(g, 'stranger removes the guest', 'deny', () => del(`bw/rooms/${id}/seats/1`, C));
    await check(g, 'the host removes the guest (kick)', 'allow', () => del(`bw/rooms/${id}/seats/1`, A));
    await check(g, 'guest sits again', 'allow', () => put(`bw/rooms/${id}/seats/1`, seat(B, 'Guest', 'duck'), B));
    await check(g, 'guest leaves (removes own seat)', 'allow', () => del(`bw/rooms/${id}/seats/1`, B));
    await check(g, 'guest cannot remove the host’s seat', 'deny', () => del(`bw/rooms/${id}/seats/0`, B));
    await put(`bw/rooms/${id}/seats/1`, seat(B, 'Guest', 'duck'), B);
    // cfg
    await check(g, 'cfg: host sets stage and preset', 'allow', () => put(`bw/rooms/${id}/cfg`, { s: 'track', p: 2 }, A));
    await check(g, 'cfg: guest cannot', 'deny', () => put(`bw/rooms/${id}/cfg`, { s: 'box', p: 1 }, B));
    await check(g, 'cfg: unknown stage', 'deny', () => put(`bw/rooms/${id}/cfg`, { s: 'moon', p: 1 }, A));
    await check(g, 'cfg: preset 4', 'deny', () => put(`bw/rooms/${id}/cfg`, { s: 'rnd', p: 4 }, A));
    await check(g, 'cfg: unknown field', 'deny', () => put(`bw/rooms/${id}/cfg`, { s: 'rnd', p: 1, x: 1 }, A));
    // presence / ready / ping
    await check(g, 'on: own presence', 'allow', () => put(`bw/rooms/${id}/on/${B.uid}`, 1, B));
    await check(g, 'on: someone else’s presence', 'deny', () => put(`bw/rooms/${id}/on/${A.uid}`, 1, B));
    await check(g, 'on: a stranger (no seat)', 'deny', () => put(`bw/rooms/${id}/on/${C.uid}`, 1, C));
    await check(g, 'on: value 2', 'deny', () => put(`bw/rooms/${id}/on/${B.uid}`, 2, B));
    await check(g, 'rd: ready flag', 'allow', () => put(`bw/rooms/${id}/rd/${B.uid}`, 1, B));
    await check(g, 'rd: someone else’s flag', 'deny', () => put(`bw/rooms/${id}/rd/${A.uid}`, 1, B));
    await check(g, 'rd: a stranger', 'deny', () => put(`bw/rooms/${id}/rd/${C.uid}`, 1, C));
    await check(g, 'rd: value 2', 'deny', () => put(`bw/rooms/${id}/rd/${B.uid}`, 2, B));
    await check(g, 'pg: ping probe { t, e, w }', 'allow', () => put(`bw/rooms/${id}/pg/${B.uid}`, { t: 1234, e: 1200, w: 10 }, B));
    await check(g, 'pg: someone else’s', 'deny', () => put(`bw/rooms/${id}/pg/${A.uid}`, { t: 1 }, B));
    await check(g, 'pg: unknown field', 'deny', () => put(`bw/rooms/${id}/pg/${B.uid}`, { t: 1, x: 1 }, B));
    await check(g, 'pg: stranger', 'deny', () => put(`bw/rooms/${id}/pg/${C.uid}`, { t: 1 }, C));
    // room that already started: nobody new sits
    await put(`bw/rooms/${id}/seats/1`, seat(B, 'Guest', 'duck'), B);
    await del('bw/rooms/' + id, A);
    const id5 = await mk(A, {}); await put(`bw/rooms/${id5}/go`, { g: 1, sd: 5, st: TS, pl: [A.uid, B.uid], c: ['robo', 'duck'], sg: 'bench', p: 0 }, A);
    await check(g, 'no one new can sit after the match has started (go exists)', 'deny', () => put(`bw/rooms/${id5}/seats/1`, seat(C), C));
    await del('bw/rooms/' + id5, A);
    // quick-match invitation
    const idq = await mk(A, { meta: { at: TS, h: A.uid, n: 2, k: 'q', v: 1, inv: { [A.uid]: 1, [B.uid]: 1 } } });
    await check(g, 'quick-match room: an uninvited player cannot sit', 'deny', () => put(`bw/rooms/${idq}/seats/1`, seat(C), C));
    await check(g, 'quick-match room: the invited player sits', 'allow', () => put(`bw/rooms/${idq}/seats/1`, seat(B, 'Ben'), B));
    await del('bw/rooms/' + idq, A);
    // 4-seat room
    const id4 = await mk(A, { meta: { at: TS, h: A.uid, n: 4, k: 'c', v: 1 } });
    await check(g, '4-player room: seat 3 is open to a guest', 'allow', () => put(`bw/rooms/${id4}/seats/3`, seat(D), D));
    await del('bw/rooms/' + id4, A);
  }
  // ================================================================ go (start of a game)
  { const g = 'bw:go';
    const id = await mk2(A, B);
    const go = (o) => Object.assign({ g: 1, sd: 1234567, st: TS, pl: [A.uid, B.uid], c: ['robo', 'duck'], tj: [1, 1], sg: 'bench', p: 0 }, o || {});
    await check(g, 'guest cannot start the game', 'deny', () => put(`bw/rooms/${id}/go`, go(), B));
    await check(g, 'stranger cannot start the game', 'deny', () => put(`bw/rooms/${id}/go`, go(), C));
    await check(g, 'first game must be g = 1 (g = 2)', 'deny', () => put(`bw/rooms/${id}/go`, go({ g: 2 }), A));
    await check(g, 'seed 0', 'deny', () => put(`bw/rooms/${id}/go`, go({ sd: 0 }), A));
    await check(g, 'start time far in the future', 'deny', () => put(`bw/rooms/${id}/go`, go({ st: Date.now() + 120000 }), A));
    await check(g, 'start time far in the past', 'deny', () => put(`bw/rooms/${id}/go`, go({ st: Date.now() - 120000 }), A));
    await check(g, 'stage name that does not exist', 'deny', () => put(`bw/rooms/${id}/go`, go({ sg: 'moon' }), A));
    await check(g, '"rnd" is not a stage (the host must pick one)', 'deny', () => put(`bw/rooms/${id}/go`, go({ sg: 'rnd' }), A));
    await check(g, 'unknown field', 'deny', () => put(`bw/rooms/${id}/go`, go({ evil: 1 }), A));
    await check(g, 'five players in pl', 'deny', () => put(`bw/rooms/${id}/go`, go({ pl: [A.uid, B.uid, C.uid, D.uid, 'x'] }), A));
    await check(g, 'host starts game 1', 'allow', () => put(`bw/rooms/${id}/go`, go(), A));
    await check(g, 'restart game 1 again', 'deny', () => put(`bw/rooms/${id}/go`, go(), A));
    await check(g, 'skip to game 3', 'deny', () => put(`bw/rooms/${id}/go`, go({ g: 3 }), A));
    await check(g, 'guest rewrites go', 'deny', () => put(`bw/rooms/${id}/go/sd`, 99, B));
    await check(g, 'host starts game 2 (rematch)', 'allow', () => put(`bw/rooms/${id}/go`, go({ g: 2, pl: [B.uid, A.uid], c: ['duck', 'robo'] }), A));
    await del('bw/rooms/' + id, A);
  }
  // ================================================================ in (the input stream) / h (state hashes) / res
  { const g = 'bw:in';
    const id = await mk2(A, B);
    await put(`bw/rooms/${id}/go`, { g: 1, sd: 5, st: TS, pl: [A.uid, B.uid], c: ['robo', 'duck'], sg: 'bench', p: 0 }, A);
    const inp = u => `bw/rooms/${id}/in/${u.uid}`;
    await check(g, 'seat holder writes own input batch', 'allow', () => put(inp(A), batch(), A));
    await check(g, 'next batch (frame goes forward)', 'allow', () => put(inp(A), batch({ f: 123, s: 126, b: 119 }), A));
    await check(g, 'the same frame again (resend)', 'allow', () => put(inp(A), batch({ f: 123, s: 126, b: 119 }), A));
    await check(g, 'the frame goes backwards in the same game', 'deny', () => put(inp(A), batch({ f: 100 }), A));
    await check(g, 'a new game (g = 2) may start again from frame 0', 'allow', () => put(inp(A), batch({ g: 2, f: 0, s: 6, b: 1, d: 'AAAAAAAAAAAAAAAAAA' }), A));
    await check(g, 'writing the opponent’s input stream', 'deny', () => put(inp(B), batch(), A));
    await check(g, 'a stranger writes own stream (no seat)', 'deny', () => put(inp(C), batch(), C));
    await check(g, 'a stranger writes a seat holder’s stream', 'deny', () => put(inp(B), batch(), C));
    await check(g, 'signed-out write', 'deny', () => put(inp(B), batch(), null));
    await check(g, 'the opponent’s stream is readable (signed in)', 'allow', () => get(inp(A), B));
    await check(g, 'the stream is not readable signed out', 'deny', () => get(inp(A), null));
    await check(g, 'input data with characters outside the alphabet', 'deny', () => put(inp(B), batch({ d: 'AA AA<>' }), B));
    await check(g, 'input data over 200 characters', 'deny', () => put(inp(B), batch({ d: 'A'.repeat(201) }), B));
    await check(g, 'input data 200 characters (the most a 64-frame batch needs is 192)', 'allow', () => put(inp(B), batch({ d: 'A'.repeat(192) }), B));
    await check(g, 'frame number 10 million', 'deny', () => put(inp(B), batch({ f: 1e7 }), B));
    await check(g, 'game number 0', 'deny', () => put(inp(B), batch({ g: 0 }), B));
    await check(g, 'ack string with letters', 'deny', () => put(inp(B), batch({ a: 'abc' }), B));
    await check(g, 'ack string too long', 'deny', () => put(inp(B), batch({ a: '1,'.repeat(30) }), B));
    await check(g, 'missing data field', 'deny', () => put(inp(B), { g: 1, f: 1, s: 1, b: 1 }, B));
    await check(g, 'an extra field', 'deny', () => put(inp(B), batch({ evil: 'x'.repeat(5000) }), B));
    await check(g, 'a string where a number belongs', 'deny', () => put(inp(B), batch({ f: '120' }), B));
    await check(g, 'a deep object under the stream', 'deny', () => put(inp(B) + '/zz/yy', { a: 1 }, B));
    await check(g, 'the stream is removed by its owner', 'allow', () => del(inp(B), B));
    // hashes
    const hh = (u, s) => `bw/rooms/${id}/h/${u.uid}/${s}`;
    await check(g, 'h: own state hash { g, f, a, b }', 'allow', () => put(hh(A, 3), { g: 1, f: 180, a: 4000000000, b: 12 }, A));
    await check(g, 'h: final hash with fin = 1', 'allow', () => put(hh(A, 4), { g: 1, f: 1234, a: 1, b: 2, fin: 1 }, A));
    await check(g, 'h: slot 8', 'deny', () => put(hh(A, 8), { g: 1, f: 180, a: 1, b: 2 }, A));
    await check(g, 'h: someone else’s hash', 'deny', () => put(hh(A, 3), { g: 1, f: 180, a: 1, b: 2 }, B));
    await check(g, 'h: a stranger', 'deny', () => put(hh(C, 3), { g: 1, f: 180, a: 1, b: 2 }, C));
    await check(g, 'h: value over 32 bits', 'deny', () => put(hh(B, 3), { g: 1, f: 180, a: 4294967296, b: 2 }, B));
    await check(g, 'h: negative', 'deny', () => put(hh(B, 3), { g: 1, f: 180, a: -1, b: 2 }, B));
    await check(g, 'h: opponent can read it', 'allow', () => get(`bw/rooms/${id}/h/${A.uid}`, B));
    // result
    const rs = n => `bw/rooms/${id}/res/${n}`;
    await check(g, 'res: a seat holder writes the result of game 1', 'allow', () => put(rs(1), { w: 0, y: 'ko', f: 3000 }, A));
    await check(g, 'res: the second writer cannot change it', 'deny', () => put(rs(1), { w: 1, y: 'ko', f: 3000 }, B));
    await check(g, 'res: the writer cannot change it either', 'deny', () => put(rs(1), { w: 1, y: 'ko', f: 3000 }, A));
    await check(g, 'res: a stranger writes a result', 'deny', () => put(rs(2), { w: 0, y: 'ko', f: 1 }, C));
    await check(g, 'res: winner seat 5', 'deny', () => put(rs(2), { w: 5, y: 'ko', f: 1 }, B));
    await check(g, 'res: unknown reason', 'deny', () => put(rs(2), { w: 0, y: 'cheat', f: 1 }, B));
    await check(g, 'res: desync with no winner (w = -1)', 'allow', () => put(rs(2), { w: -1, y: 'desync', f: 600 }, B));
    await check(g, 'res: forfeit', 'allow', () => put(rs(3), { w: 0, y: 'forfeit', f: 900 }, B));
    await check(g, 'res: game number 4 digits', 'deny', () => put(rs(1000), { w: 0, y: 'ko', f: 1 }, B));
    await del('bw/rooms/' + id, A);
  }
  // ================================================================ the rest of the tree
  { const g = 'bw:tree';
    await check(g, 'a made-up child of bw', 'deny', () => put('bw/anything/x', 1, A));
    await check(g, 'bw root read', 'deny', () => get('bw', A));
    await check(g, 'bw root write', 'deny', () => put('bw', null, A));
    // 他のルールが壊れていない目印
    await check(g, 'unchanged: vs queue entry (blocks)', 'allow', () => put('vs/queue/blocks/' + A.uid, { n: 'Aoi', t: TS, h: TS }, A));
    await check(g, 'unchanged: vs queue entry of someone else', 'deny', () => put('vs/queue/blocks/' + A.uid, { n: 'x', t: TS }, B));
    await del('vs/queue/blocks/' + A.uid, A);
    await check(g, 'unchanged: vs queue for an unknown game', 'deny', () => put('vs/queue/brawl/' + A.uid, { n: 'Aoi', t: TS }, A));
    await check(g, 'unchanged: root read', 'deny', () => get('', A));
  }
  const cleanup = [];
  void cleanup; void sleep;
  return results;
}

module.exports = { runBrawlCases, mergedRules };

if (require.main === module) {
  (async () => {
    const verbose = process.argv.includes('--verbose');
    const { start } = require('./emulator');
    console.log('starting the Firebase emulators…');
    const emu = await start({});
    let rows = [], code = 0;
    try {
      const m = mergedRules();
      const r = await fetch(`http://127.0.0.1:${emu.ports.database}/.settings/rules.json?ns=${emu.ns}`, { method: 'PUT', headers: { Authorization: 'Bearer owner' }, body: m.text });
      if (!r.ok) throw new Error('the emulator rejected the merged rules: ' + (await r.text()));
      console.log('rules: database.rules.json (bw)');
      const T = Object.assign(emulatorTarget(emu.ports), { emu: true, ports: emu.ports, ns: emu.ns });
      rows = await runBrawlCases(T, { verbose, log: row => { if (!row.pass || verbose) console.log(`  ${row.pass ? 'ok  ' : 'FAIL'} [${row.group}] ${row.name} — expect ${row.expect}, got ${row.got}${row.status ? ' (' + row.status + ')' : ''}${row.detail && !row.pass ? ' ' + row.detail : ''}`); } });
    } catch (e) { console.error(e); code = 1; }
    await emu.stop();
    const bad = rows.filter(r => !r.pass);
    console.log(`bw rules: ${rows.length - bad.length} / ${rows.length} as expected (${rows.filter(r => r.expect === 'allow').length} allow cases, ${rows.filter(r => r.expect === 'deny').length} deny cases)`);
    process.exit(code || (bad.length ? 1 : 0));
  })();
}
