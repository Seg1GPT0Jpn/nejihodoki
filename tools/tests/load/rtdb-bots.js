// 負荷テスト（Realtime Database）：本物の Firebase SDK（firebase-*-compat.js 10.12.2。ブラウザと同じファイル）を node の vm で動かし、
// 1人1つの Firebase アプリ（= RTDB の接続1本・匿名ログイン1つ）で、たくさんの「対戦する人」を同時に動かす。
// それぞれの人は、ゲームのページと同じパス・同じ書き方・同じ間隔で書く（ページの画面はないので、ここで手順をまねる）：
//   vs     common/versus.js：vs/queue/{game} で最大4人の組（2人目から12秒）→ 部屋 → go → 0.4秒ごとに s/{me} → f と res → 部屋を消す
//   hole   hole/index.html：hole/queue（15秒待って足りない席は CPU）→ 部屋 → g → 0.2秒ごとに p（ホストは CPU の穴も）・o の取り合い・k
//   shogi  shogi/index.html：shogi/queue（2人ずつ）→ 部屋 → st → mv/{i} と n → 投了（end の transaction）→ 部屋を消す
// 一部の人は試合の途中でタブを閉じたことにする（goOffline して何もしない）：サーバーの onDisconnect が片付けるか、残った人が片付けるか。
// 試合が終わったら、クライアントと同じく20秒たって goOffline（versus.js・hole・shogi の netIdleWatch）。接続の数を1秒ごとに数える。
// 書き込みの種類の一覧（パスを {me}・$room にしたもの）は、rules/clients.js の REQUIRED（本物のページを2人で動かして記録したもの）と比べる。
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { execFileSync } = require('child_process');

const SDK_V = '10.12.2';
const CACHE = path.join(__dirname, '..', '.cache', 'firebase-' + SDK_V);
const SDK_FILES = ['app', 'auth', 'database'];
function ensureSdk() {
  fs.mkdirSync(CACHE, { recursive: true });
  for (const f of SDK_FILES) {
    const p = path.join(CACHE, `firebase-${f}-compat.js`);
    if (fs.existsSync(p) && fs.statSync(p).size > 10000) continue;
    const url = `https://cdn.jsdelivr.net/npm/firebase@${SDK_V}/firebase-${f}-compat.js`;
    try { execFileSync('curl', ['-sSfL', '--max-time', '60', '-o', p, url], { stdio: 'pipe' }); }
    catch (e) { try { fs.unlinkSync(p); } catch (_) {} throw new Error('could not download ' + url + ' into ' + p + ' (put the file there by hand when offline)'); }
  }
}

const sleep = ms => new Promise(r => setTimeout(r, ms));
const VS_GAMES = ['neji', 'blocks', 'drop', 'raft', 'gates', 'n59049', 'water', 'parking', 'hitsumabushi', 'hitblow'];

// ---------------------------------------------------------------- SDK の入った vm（WebSocket の数と転送量を数える）
function sdkContext(net) {
  class CountingWebSocket extends WebSocket {
    constructor(url, prot) {
      super(url, prot);
      net.opened++; net.open++; net.peak = Math.max(net.peak, net.open);
      this.addEventListener('message', e => { net.rx += typeof e.data === 'string' ? Buffer.byteLength(e.data) : (e.data && e.data.byteLength) || 0; net.frames++; });
      this.addEventListener('close', () => { net.open--; });
    }
    send(d) { net.tx += typeof d === 'string' ? Buffer.byteLength(d) : (d && d.byteLength) || 0; super.send(d); }
  }
  const quiet = { log() {}, info() {}, debug() {}, warn: (...a) => net.warn.push(a.map(String).join(' ').slice(0, 200)), error: (...a) => net.warn.push(a.map(String).join(' ').slice(0, 200)) };
  const ctx = { console: quiet, setTimeout, clearTimeout, setInterval, clearInterval, queueMicrotask, fetch, WebSocket: CountingWebSocket, URL, URLSearchParams,
    TextEncoder, TextDecoder, Headers, Request, Response, AbortController, atob, btoa, crypto: globalThis.crypto, navigator: { userAgent: 'kobo-load-test', onLine: true } };
  vm.createContext(ctx);
  vm.runInContext('var window = this, self = this;', ctx);
  for (const f of SDK_FILES) vm.runInContext(fs.readFileSync(path.join(CACHE, `firebase-${f}-compat.js`), 'utf8'), ctx, { filename: `firebase-${f}-compat.js` });
  return ctx;
}

// ---------------------------------------------------------------- 1人
class Bot {
  constructor(env, i, kind) {
    this.env = env; this.i = i; this.kind = kind; this.nick = (kind[0] + i).slice(0, 12);
    this.offs = []; this.timers = []; this.dead = false; this.inv = [];
  }
  async init() {
    const { fb, E, metrics } = this.env;
    this.app = fb.initializeApp({ apiKey: 'fake-api-key', projectId: 'demo-kobo', appId: '1:1:web:1', databaseURL: `http://127.0.0.1:${E.ports.database}/?ns=${E.ns}` }, 'bot' + this.i);
    this.app.auth().useEmulator(`http://127.0.0.1:${E.ports.auth}`, { disableWarnings: true });
    const t = Date.now();
    this.uid = (await this.app.auth().signInAnonymously()).user.uid;
    metrics.add({ api: 'auth', coll: 'signUp', op: 'signUp-anon', ms: Date.now() - t, ok: true, reads: 0, writes: 0 });
    this.db = this.app.database();
    this.TS = fb.database.ServerValue.TIMESTAMP;
    this.off = 0;
    this.db.ref('.info/serverTimeOffset').on('value', s => { this.off = s.val() || 0; });
    await new Promise((res, rej) => {
      const to = setTimeout(() => rej(new Error('connect timeout')), 15000);
      this.db.ref('.info/connected').on('value', s => { if (s.val() === true) { clearTimeout(to); res(); } });
    });
  }
  now() { return Date.now() + this.off; }
  // 書き込み1回：応答までの時間・結果・書き込みの種類（パスを正規化）を記録する
  w(op, ref, promise) {
    const t = Date.now(), p = this.norm(ref);
    this.inv.push(op + ' ' + p);
    return Promise.resolve(promise).then(v => { this.env.metrics.add({ api: 'rtdb', coll: this.kind, path: p, op, ms: Date.now() - t, ok: true }); return v; },
      e => { const code = /permission/i.test(String(e && (e.code || e.message))) ? 'permission-denied' : String((e && e.code) || 'error'); this.env.metrics.add({ api: 'rtdb', coll: this.kind, path: p, op, ms: Date.now() - t, ok: false, code }); if (this.env.verbose) console.log('  rtdb refused', this.kind, op, p, code); });
  }
  norm(ref) {
    let s = decodeURIComponent(new URL(ref.toString()).pathname).replace(/^\//, '');
    s = s.split(this.uid).join('{me}');
    s = s.replace(/^(vs|hole|shogi)\/rooms\/[^/]+/, '$1/rooms/$room').replace(/\/o\/\d+$/, '/o/$gi').replace(/\/k\/-[\w-]+$/, '/k/$kid').replace(/^vs\/queue\/\w+\//, 'vs/queue/blocks/');
    return s;
  }
  on(ref, ev, f) { const cb = s => { if (!this.dead) f(s); }; ref.on(ev, cb, () => {}); this.offs.push(() => ref.off(ev, cb)); }
  every(f, ms) { const id = setInterval(() => { if (!this.dead) f(); }, ms); this.timers.push(id); return id; }
  stop() { this.offs.forEach(f => { try { f(); } catch (e) {} }); this.offs = []; this.timers.forEach(clearInterval); this.timers = []; }
  // タブを閉じた：何も片付けずに切れる（サーバーの onDisconnect だけが動く）
  vanish() { this.dead = true; this.vanished = true; this.stop(); try { this.db.goOffline(); } catch (e) {} }
  // 試合のあと：クライアントの netIdleWatch と同じく、しばらくして接続を閉じる
  async idleOff(ms) { this.stop(); await sleep(ms); if (!this.vanished) { try { this.db.goOffline(); } catch (e) {} } this.dead = true; }
  // 相手に届くまでの時間（同じプロセスの時計）
  sent(key) { this.env.prop.set(key, Date.now()); }
  seen(key, what) { const t = this.env.prop.get(key); if (t != null) { this.env.prop.delete(key); this.env.metrics.add({ api: 'rtdb-prop', coll: this.kind, op: what, ms: Date.now() - t, ok: true }); } }
}

// ---------------------------------------------------------------- vs（common/versus.js）
const VS = { MAX: 4, WAIT2: 12000, CD: 3600, GRACE: 3000, STALE: 45000, HEARTBEAT: 15000, WRITE_MS: 400 };
async function vsPlay(b, o) {
  const game = o.game, db = b.db;
  const t0 = Date.now();
  const qref = db.ref(`vs/queue/${game}/${b.uid}`);
  await b.w('onDisconnect.remove', qref, qref.onDisconnect().remove());
  await b.w('set', qref, qref.set({ n: b.nick, t: b.TS, h: b.TS }));
  let q = {}, phase = 'queue', joined = null;
  b.on(db.ref(`vs/queue/${game}`), 'value', s => { q = s.val() || {}; });
  const hb = b.every(() => { if (phase === 'queue') b.w('update', qref, qref.update({ h: b.TS })); }, VS.HEARTBEAT);
  // matchmaking: the same rule as versus.js qEval
  await new Promise(done => {
    const ev = b.every(() => {
      if (phase !== 'queue') return;
      const now = b.now(), me = b.uid;
      const alive = e => e && typeof e.t === 'number' && now - (typeof e.h === 'number' ? e.h : e.t) < VS.STALE;
      for (const id in q) { const e = q[id]; if (id !== me && alive(e) && e.r && Array.isArray(e.m) && e.m.indexOf(me) >= 0) { phase = 'join'; clearInterval(ev); joined = { rid: e.r, creator: false }; return done(); } }
      const open = Object.keys(q).filter(id => alive(q[id]) && !q[id].r).sort((a, c) => q[a].t - q[c].t || (a < c ? -1 : 1));
      const my = open.indexOf(me); if (my < 0) return;
      const g0 = my - my % VS.MAX, grp = open.slice(g0, g0 + VS.MAX);
      if (grp.length < 2) return;
      const goAt = q[grp[1]].t + VS.WAIT2;
      if (grp[0] === me && (grp.length >= VS.MAX || now >= goAt)) {
        phase = 'creating'; clearInterval(ev);
        const ref = db.ref('vs/rooms').push(), inv = {}; grp.forEach(id => { inv[id] = 1; });
        b.w('set', ref, ref.set({ g: game, at: b.TS, sd: 1 + Math.floor(Math.random() * 2e9), h: me, inv, dur: o.dur, v: 1 }))
          .then(() => b.w('update', qref, qref.update({ r: ref.key, m: grp }))).then(() => { joined = { rid: ref.key, creator: true }; done(); });
      }
    }, 100);
  });
  clearInterval(hb);
  b.stop();
  const drop = () => { b.w('onDisconnect.cancel', qref, qref.onDisconnect().cancel()); b.w('remove', qref, qref.remove()); };
  if (joined.creator) setTimeout(drop, 8000); else drop();
  const rref = db.ref('vs/rooms/' + joined.rid);
  const meta = (await rref.once('value')).val();
  if (!meta || meta.go) return { formed: false };
  const host = meta.h === b.uid, mref = rref.child('m/' + b.uid);
  await b.w('onDisconnect.remove', mref, mref.onDisconnect().remove());
  await b.w('set', mref, mref.set({ n: b.nick, j: b.TS }));
  let room = meta, go = null, goSent = false, res = null;
  const seenS = {};
  b.on(rref, 'value', s => {
    room = s.val();
    if (!room) return;
    if (room.go && !go) go = room.go;
    if (room.res && !res) res = room.res;
    for (const [u, v] of Object.entries(room.s || {})) if (u !== b.uid && seenS[u] !== v) { seenS[u] = v; b.seen(`vs/${joined.rid}/${u}/${v}`, 'score'); }
  });
  // host: go when all invited are in (or 5 s)
  const joinAt = b.now();
  await new Promise(done => {
    const ev = b.every(() => {
      if (go) { clearInterval(ev); return done(); }
      if (!host || goSent || !room) { if (!host && b.now() - joinAt > 15000) { clearInterval(ev); done(); } return; }
      const m = room.m || {}, inv = Object.keys(meta.inv || {});
      if (!m[b.uid] || !(inv.every(id => m[id]) || b.now() >= meta.at + 5000)) return;
      const pres = Object.keys(m); if (pres.length < 2) return;
      goSent = true;
      const pl = pres.sort((x, y) => (m[x].j || 0) - (m[y].j || 0) || (x < y ? -1 : 1)).slice(0, VS.MAX), n = {};
      pl.forEach(id => { n[id] = String(m[id].n || '?'); });
      const g = rref.child('go');
      b.w('set', g, g.set({ pl, n, st: Math.round(b.now() + VS.CD), dur: o.dur }));
    }, 100);
  });
  if (!go) return { formed: false };
  const formedMs = Date.now() - t0;
  b.env.rooms.vs.add(joined.rid);
  // the match
  const end = go.st + o.dur * 1000;
  let score = 0, lastW = -1, lastWAt = 0, nextUp = 0;
  const vanishAt = o.vanish ? go.st + o.dur * 500 : Infinity;
  await new Promise(done => {
    const ev = b.every(() => {
      const now = b.now();
      if (now >= vanishAt) { clearInterval(ev); b.vanish(); return done(); }
      if (now < go.st) return;
      if (now >= nextUp) { score += 10 + Math.floor(Math.random() * 90); nextUp = now + 600 + Math.random() * 1800; }
      if (score !== lastW && Date.now() - lastWAt >= VS.WRITE_MS) {
        lastW = score; lastWAt = Date.now(); const r = rref.child('s/' + b.uid);
        b.sent(`vs/${joined.rid}/${b.uid}/${score}`); b.w('set', r, r.set(score));
      }
      if (now >= end) { clearInterval(ev); done(); }
    }, 100);
  });
  if (b.vanished) return { formed: true, formedMs, vanished: true, rid: joined.rid };
  await b.w('update', rref, rref.update({ ['s/' + b.uid]: score, ['f/' + b.uid]: score }));
  const finalAt = b.now();
  // the deciding player (the first one of pl still here) writes res
  await new Promise(done => {
    const ev = b.every(() => {
      if (res) { clearInterval(ev); return done(); }
      const r = room || {}, m = r.m || {}, f = r.f || {};
      const decider = go.pl.find(id => m[id]);
      const now = b.now();
      if (decider === b.uid && !b.resSent) {
        const allIn = go.pl.filter(id => m[id]).every(id => f[id] != null);
        if (allIn || now >= end + VS.GRACE) {
          b.resSent = true;
          const rows = go.pl.map(u => ({ u, n: String(go.n[u] || '?'), v: Math.floor(Number(u === b.uid ? score : (f[u] != null ? f[u] : (r.s || {})[u])) || 0), x: m[u] ? 0 : 1 }));
          const rr = rref.child('res');
          b.w('set', rr, rr.set({ at: b.TS, r: rows }));
        }
      } else if (now >= end + VS.GRACE + 6000) { clearInterval(ev); done(); }
      if (now - finalAt > 30000) { clearInterval(ev); done(); }
    }, 100);
  });
  // result: leave; the deciding player removes the room 6 s later
  const m = (room && room.m) || {};
  const decider = go.pl.find(id => m[id]) === b.uid || Object.keys(m).every(id => id === b.uid);
  b.stop();
  b.w('onDisconnect.cancel', mref, mref.onDisconnect().cancel());
  if (!decider) b.w('remove', mref, mref.remove());
  else { await sleep(6000); await b.w('remove', rref, rref.remove()); }
  return { formed: true, formedMs, rid: joined.rid, players: go.pl.length };
}

// ---------------------------------------------------------------- hole（hole/index.html）
const HO = { MAX: 4, WAIT: 15000, SEND_MS: 200 };
async function holePlay(b, o) {
  const db = b.db, t0 = Date.now();
  const qref = db.ref('hole/queue/' + b.uid);
  const entry = () => ({ n: b.nick, s: 'basic', t: b.TS, m: ['c10', 'v11111111111111'] });
  await b.w('onDisconnect.remove', qref, qref.onDisconnect().remove());
  await b.w('set', qref, qref.set(entry()));
  let q = {}, joined = null, phase = 'queue';
  b.on(db.ref('hole/queue'), 'value', s => { q = s.val() || {}; });
  await new Promise(done => {
    const ev = b.every(() => {
      if (phase !== 'queue') return;
      const now = b.now(), me = b.uid;
      for (const id in q) { const e = q[id]; if (e && e.r && Array.isArray(e.m) && e.m.indexOf(me) >= 0 && id !== me && now - (e.t || 0) < 90000) { phase = 'join'; clearInterval(ev); joined = { rid: e.r, creator: false }; return done(); } }
      const open = Object.keys(q).filter(id => { const e = q[id]; return e && !e.r && typeof e.t === 'number' && now - e.t < 120000; }).sort((a, c) => q[a].t - q[c].t || (a < c ? -1 : 1));
      const my = open.indexOf(me); if (my < 0) return;
      const g0 = my - my % HO.MAX, grp = open.slice(g0, g0 + HO.MAX);
      const waited = now - q[grp[0]].t - HO.WAIT;
      const lead = waited > 6000 ? Math.min(grp.length - 1, Math.floor(waited / 6000)) : 0;
      if (grp[lead] === me && (grp.length >= HO.MAX || waited >= 0)) {
        phase = 'creating'; clearInterval(ev);
        const ref = db.ref('hole/rooms').push(), inv = {}; grp.forEach(id => { inv[id] = 1; });
        b.w('set', ref, ref.set({ at: b.TS, c: 4, sd: 1 + Math.floor(Math.random() * 2e9), h: me, inv }))
          .then(() => b.w('update', qref, qref.update({ r: ref.key, m: grp }))).then(() => { joined = { rid: ref.key, creator: true }; done(); });
      }
    }, 400);
  });
  b.stop();
  const drop = () => { b.w('onDisconnect.cancel', qref, qref.onDisconnect().cancel()); b.w('remove', qref, qref.remove()); };
  if (joined.creator) setTimeout(drop, 5000); else drop();
  const rref = db.ref('hole/rooms/' + joined.rid);
  const meta = (await rref.once('value')).val();
  if (!meta || meta.g) return { formed: false };
  const host = meta.h === b.uid, mref = rref.child('m/' + b.uid), pref = rref.child('p/' + b.uid);
  await b.w('onDisconnect.remove', mref, mref.onDisconnect().remove());
  await b.w('onDisconnect.remove', pref, pref.onDisconnect().remove());
  await b.w('set', mref, mref.set({ n: b.nick, s: 'basic', j: b.TS }));
  let members = {}, g = null, goSent = false;
  b.on(rref.child('m'), 'value', s => { members = s.val() || {}; });
  b.on(rref.child('g'), 'value', s => { if (s.val() && !g) g = s.val(); });
  await new Promise(done => {
    const ev = b.every(() => {
      if (g) { clearInterval(ev); return done(); }
      if (!host || goSent) { if (b.now() - meta.at > 20000) { clearInterval(ev); done(); } return; }
      const inv = Object.keys(meta.inv || {});
      if (!(inv.every(id => members[id]) || b.now() >= meta.at + 4000) || !members[b.uid]) return;
      goSent = true;
      const pl = Object.keys(members).sort((x, y) => (x === b.uid ? -1 : y === b.uid ? 1 : (members[x].j || 0) - (members[y].j || 0))).slice(0, HO.MAX);
      const gr = rref.child('g');
      b.w('set', gr, gr.set({ pl, b: HO.MAX - pl.length, st: Math.round(b.now() + 3500), len: o.len }));
    }, 250);
  });
  if (!g) return { formed: false };
  const formedMs = Date.now() - t0;
  b.env.rooms.hole.add(joined.rid);
  const seenP = {};
  const onP = s => { const v = s.val(); if (!v || s.key === b.uid) return; if (seenP[s.key] !== v.t) { seenP[s.key] = v.t; b.seen(`hole/${joined.rid}/${s.key}/${v.t}`, 'state'); } };
  b.on(rref.child('p'), 'child_added', onP);
  b.on(rref.child('p'), 'child_changed', onP);
  b.on(rref.child('o'), 'child_added', () => {});
  b.on(rref.child('o'), 'child_changed', () => {});
  b.on(rref.child('k'), 'child_added', () => {});
  const end = g.st + g.len * 1000, bots = host ? g.b : 0;
  const vanishAt = o.vanish ? g.st + g.len * 500 : Infinity;
  let x = Math.random() * 100 - 50, z = Math.random() * 100 - 50, pts = 0, lastClaim = 0, killed = false;
  await new Promise(done => {
    const ev = b.every(() => {
      const now = b.now();
      if (now >= vanishAt) { clearInterval(ev); b.vanish(); return done(); }
      if (now >= end) { clearInterval(ev); return done(); }
      if (now < g.st) return;
      x += Math.random() * 2 - 1; z += Math.random() * 2 - 1; pts += Math.floor(Math.random() * 12);
      const t = Math.round(now), up = { [b.uid]: { x: Math.round(x * 10) / 10, z: Math.round(z * 10) / 10, p: pts, a: 1, v: 0, k: 0, e: 0, i: 0, t } };
      for (let i = 1; i <= bots; i++) up['b' + i] = { x: i * 3, z: -i * 3, p: Math.floor(pts / 2), a: 1, v: 0, k: 0, e: 0, i: 0, t };
      const pr = rref.child('p');
      b.sent(`hole/${joined.rid}/${b.uid}/${t}`);
      b.w('update', pr, pr.update(up));
      // claim an object about every 2 s (CLAIM_WIN rule: free or older than 12 s)
      if (Date.now() - lastClaim > 2000) {
        lastClaim = Date.now();
        const gi = Math.floor(Math.random() * 3000), oref = rref.child('o/' + gi);
        b.w('transaction', oref, oref.transaction(cur => (cur && cur.t > b.now() - 12000 ? undefined : { u: b.uid, t: b.now() }), null, false));
      }
      // one kill report per round (own death, or a CPU hole by the host)
      if (!killed && now > g.st + g.len * 600) {
        killed = true; const k = rref.child('k').push();
        b.w('push', k, k.set({ v: host && bots ? 'b1' : b.uid, b: host && bots ? b.uid : 'b1', p: pts }));
      }
    }, HO.SEND_MS);
  });
  if (b.vanished) return { formed: true, formedMs, vanished: true, rid: joined.rid };
  // netEnd: the host (or the last one left) removes the room a little later; the others remove their own entries
  b.stop();
  // the seat running the CPU holes moves to the first player still here when the host left (netBecomeHost)
  const runsCpu = host || g.pl.find(id => members[id]) === b.uid;
  const last = !Object.keys(members).some(id => id !== b.uid);
  b.w('onDisconnect.cancel', mref, mref.onDisconnect().cancel());
  b.w('onDisconnect.cancel', pref, pref.onDisconnect().cancel());
  if (runsCpu || last) {
    b.w('onDisconnect.remove', rref, rref.onDisconnect().remove());
    await sleep(runsCpu ? 6000 : 1500);
    const h = await rref.child('h').once('value');
    if (h.exists()) await b.w('remove', rref, rref.remove());
  } else { b.w('remove', mref, mref.remove()); b.w('remove', pref, pref.remove()); }
  return { formed: true, formedMs, rid: joined.rid, players: g.pl.length };
}

// ---------------------------------------------------------------- shogi（shogi/index.html）
const LINE = ['7g7f', '3c3d', '2g2f', '8c8d', '2f2e', '8d8e', '6i7h', '4a3b', '2e2d', '2c2d', '2h2d', '8e8f', '8g8f', '8b8f', '2d3d', '2b8h+', '7i8h', 'B*4e', '3d3c+', '3a3b'];
async function shogiPlay(b, o) {
  const db = b.db, t0 = Date.now();
  const qref = db.ref('shogi/queue/' + b.uid);
  await b.w('onDisconnect.remove', qref, qref.onDisconnect().remove());
  await b.w('set', qref, qref.set({ n: b.nick, t: b.TS, c: 1, e: 1500 }));
  let q = {}, joined = null, phase = 'queue';
  b.on(db.ref('shogi/queue'), 'value', s => { q = s.val() || {}; });
  await new Promise(done => {
    const ev = b.every(() => {
      if (phase !== 'queue') return;
      const now = b.now(), me = b.uid;
      for (const id in q) { const e = q[id]; if (e && e.r && id !== me && Array.isArray(e.m) && e.m.indexOf(me) >= 0 && now - (e.t || 0) < 90000) { phase = 'join'; clearInterval(ev); joined = { rid: e.r, creator: false }; return done(); } }
      const open = Object.keys(q).filter(id => { const e = q[id]; return e && !e.r && e.c === 1 && typeof e.t === 'number' && now - e.t < 120000; }).sort((a, c) => q[a].t - q[c].t || (a < c ? -1 : 1));
      const my = open.indexOf(me);
      if (my < 0 || my % 2 !== 0 || !open[my + 1]) return;
      phase = 'creating'; clearInterval(ev);
      const other = open[my + 1];
      shogiRoom(b, other, Math.random() < 0.5)
        .then(rid => b.w('update', qref, qref.update({ r: rid, m: [me, other] })).then(() => { joined = { rid, creator: true }; done(); }));
    }, 500);
  });
  b.stop();
  const drop = () => { b.w('onDisconnect.cancel', qref, qref.onDisconnect().cancel()); b.w('remove', qref, qref.remove()); };
  if (joined.creator) setTimeout(drop, 5000); else drop();
  const g1 = await shogiGame(b, o, joined.rid, t0, o.vanish, o.rematch);
  if (!g1.formed || g1.vanished || !g1.next) return g1;
  // rematch: a new room (colours swapped) that the creator of the finished one made; play a short game there
  const g2 = await shogiGame(b, Object.assign({}, o, { moves: 4 }), g1.next, Date.now(), false, false);
  return Object.assign(g1, { rematch: g2.formed });
}
async function shogiRoom(b, other, iBlack) {
  const ref = b.db.ref('shogi/rooms').push(), me = b.uid;
  await b.w('set', ref, ref.set({ at: b.TS, h: me, inv: { [me]: 1, [other]: 1 }, b: iBlack ? me : other, w: iBlack ? other : me, c: 1, tm: 0, by: 30 }));
  return ref.key;
}
// one game in room rid → { formed, formedMs, vanished, next: the rematch room }
async function shogiGame(b, o, rid, t0, vanish, rematch) {
  const rref = b.db.ref('shogi/rooms/' + rid);
  const meta = (await rref.once('value')).val();
  if (!meta || meta.end) return { formed: false };
  const side = meta.b === b.uid ? 0 : 1, mref = rref.child('m/' + b.uid);
  await b.w('onDisconnect.remove', mref, mref.onDisconnect().remove());
  await b.w('set', mref, mref.set({ n: b.nick, j: b.TS, e: 1500 }));
  let members = {}, st = 0, n = 0, end = null, stSent = false, oppGoneAt = 0, rm = {}, nx = null, endSent = false;
  b.on(rref.child('m'), 'value', s => { members = s.val() || {}; });
  b.on(rref.child('st'), 'value', s => { if (s.val()) st = s.val(); });
  b.on(rref.child('mv'), 'child_added', s => { const v = s.val(); n = Math.max(n, (+s.key) + 1); if (v) b.seen(`shogi/${rid}/${s.key}`, 'move'); });
  b.on(rref.child('end'), 'value', s => { if (s.val()) end = s.val(); });
  b.on(rref.child('rm'), 'value', s => { rm = s.val() || {}; });
  b.on(rref.child('nx'), 'value', s => { if (s.val()) nx = s.val(); });
  const others = () => Object.keys(members).filter(id => id !== b.uid);
  await new Promise(done => {
    const ev = b.every(() => {
      if (st) { clearInterval(ev); return done(); }
      if (meta.h === b.uid && others().length && members[b.uid] && !stSent) { stSent = true; const r = rref.child('st'); b.w('set', r, r.set(b.TS)); }
      if (Date.now() - t0 > 40000) { clearInterval(ev); done(); }
    }, 250);
  });
  if (!st) return { formed: false };
  const formedMs = Date.now() - t0;
  b.env.rooms.shogi.add(rid);
  const moves = Math.min(LINE.length, o.moves);
  let thinkUntil = 0, sentI = -1;
  const vanishAfter = vanish ? Math.floor(moves / 2) : Infinity;
  const endTx = val => { endSent = true; const er = rref.child('end'); b.w('transaction', er, er.transaction(cur => (cur ? undefined : val), null, false)); };
  await new Promise(done => {
    const ev = b.every(() => {
      if (end) { clearInterval(ev); return done(); }
      if (n >= vanishAfter && side === 1) { clearInterval(ev); b.vanish(); return done(); }
      // the opponent closed the tab: after DISC_MS, a win by disconnection
      if (!others().length) { if (!oppGoneAt) oppGoneAt = Date.now(); else if (Date.now() - oppGoneAt > o.discMs && !endSent) endTx({ r: 'disc', w: side ? 'w' : 'b', by: b.uid, t: b.TS, n }); }
      else oppGoneAt = 0;
      if (n >= moves) { if (side === 1 && !endSent) endTx({ r: 'resign', w: 'b', by: b.uid, t: b.TS, n }); return; } // white resigns after the line
      if (n % 2 !== side || sentI >= n) return;
      if (!thinkUntil) { thinkUntil = Date.now() + o.thinkMs * (0.5 + Math.random()); return; }
      if (Date.now() < thinkUntil) return;
      thinkUntil = 0; sentI = n;
      const i = n;
      b.sent(`shogi/${rid}/${i}`);
      b.w('update', rref, rref.update({ ['mv/' + i]: { m: LINE[i], t: b.TS, i }, n: i + 1 }));
    }, 200);
  });
  if (b.vanished) return { formed: true, formedMs, vanished: true, rid };
  // もう一局：both press it (rm/{me}); the room's creator makes the next room (colours swapped) and writes nx
  if (rematch && others().length) {
    const r = rref.child('rm/' + b.uid);
    await b.w('set', r, r.set(1));
    await new Promise(done => {
      const t = Date.now();
      const ev = b.every(() => {
        if (nx) { clearInterval(ev); return done(); }
        if (meta.h === b.uid && Object.keys(rm).length >= 2 && !b.nxSent) {
          b.nxSent = true;
          const other = others()[0];
          shogiRoom(b, other, side === 1).then(k => { const x = rref.child('nx'); return b.w('set', x, x.set(k)); });
        }
        if (Date.now() - t > 15000) { clearInterval(ev); done(); }
      }, 200);
    });
  }
  // done: the first one out removes its member entry, the last one removes the room (netLeave / netJoin of the rematch)
  await sleep(side === 0 ? 1500 : 3000);
  b.stop();
  b.w('onDisconnect.cancel', mref, mref.onDisconnect().cancel());
  const left = (await rref.child('m').once('value')).val() || {};
  if (Object.keys(left).some(id => id !== b.uid)) await b.w('remove', mref, mref.remove());
  else await b.w('remove', rref, rref.remove());
  b.nxSent = false;
  return { formed: true, formedMs, rid, players: 2, next: nx };
}

// ---------------------------------------------------------------- まとめて動かす
// pairs: { vs, hole, shogi } の組の数（1組 = 2人）。vanish: 途中でタブを閉じる人の割合
async function runRtdbLoad(E, metrics, opt = {}) {
  ensureSdk();
  const o = Object.assign({ pairs: { vs: 20, hole: 15, shogi: 15 }, dur: 30, len: 40, moves: 20, thinkMs: 1500, discMs: 10000, vanish: 0.2, ramp: 15000, idleOff: 20000, verbose: false }, opt);
  const net = { opened: 0, open: 0, peak: 0, rx: 0, tx: 0, frames: 0, warn: [] };
  const fb = sdkContext(net).firebase;
  const env = { fb, E, metrics, net, verbose: o.verbose, prop: new Map(), rooms: { vs: new Set(), hole: new Set(), shogi: new Set() } };
  const bots = [];
  let i = 0;
  for (const kind of ['vs', 'hole', 'shogi']) for (let k = 0; k < o.pairs[kind] * 2; k++) bots.push(new Bot(env, i++, kind));
  // sign in and connect everyone first (like pages opened before pressing "online")
  for (let k = 0; k < bots.length; k += 10) await Promise.all(bots.slice(k, k + 10).map(b => b.init()));
  const conn = [];
  const t0 = Date.now();
  const sampler = setInterval(() => conn.push([Date.now() - t0, net.open]), 1000);
  const rx0 = net.rx, tx0 = net.tx;
  // vs players spread over the 10 vs games, two pairs per game queue at most at the same time
  const results = await Promise.all(bots.map((b, k) => sleep(Math.floor(o.ramp * k / bots.length)).then(async () => {
    const kindIdx = bots.filter(x => x.kind === b.kind).indexOf(b);
    const pairNo = Math.floor(kindIdx / 2);
    const vanish = kindIdx % 2 === 1 && (pairNo % Math.round(1 / o.vanish) === 0);
    const run = b.kind === 'vs' ? vsPlay(b, { game: VS_GAMES[pairNo % VS_GAMES.length], dur: o.dur, vanish })
      : b.kind === 'hole' ? holePlay(b, { len: o.len, vanish })
      : shogiPlay(b, { moves: o.moves, thinkMs: o.thinkMs, discMs: o.discMs, vanish, rematch: !vanish });
    let r;
    try { r = await run; } catch (e) { r = { formed: false, error: String(e && e.stack || e) }; }
    r.kind = b.kind; r.bot = b.i;
    if (o.idleOff >= 0) await b.idleOff(o.idleOff); else b.stop();
    return r;
  })));
  const endAt = Date.now();
  await sleep(3000);
  clearInterval(sampler);
  conn.push([Date.now() - t0, net.open]);
  // leftovers (read as the owner through REST)
  const ns = E.ns, base = `http://127.0.0.1:${E.ports.database}`;
  const get = async p => (await (await fetch(`${base}/${p}.json?ns=${ns}&shallow=true`, { headers: { Authorization: 'Bearer owner' } })).json()) || {};
  const left = {
    'vs/queue': 0, 'hole/queue': Object.keys(await get('hole/queue')).length, 'shogi/queue': Object.keys(await get('shogi/queue')).length,
    'vs/rooms': Object.keys(await get('vs/rooms')).length, 'hole/rooms': Object.keys(await get('hole/rooms')).length, 'shogi/rooms': Object.keys(await get('shogi/rooms')).length,
  };
  // vs/queue/{game}: count entries under every game
  const vq = await (await fetch(`${base}/vs/queue.json?ns=${ns}`, { headers: { Authorization: 'Bearer owner' } })).json() || {};
  left['vs/queue'] = Object.values(vq).reduce((s, g) => s + Object.keys(g || {}).length, 0);
  const inventory = {};
  for (const b of bots) for (const k of b.inv) { const key = b.kind + ' ' + k; inventory[key] = (inventory[key] || 0) + 1; }
  for (const b of bots) { try { await b.app.delete(); } catch (e) {} }
  return { o, bots: bots.length, results, net: { opened: net.opened, peak: net.peak, rx: net.rx - rx0, tx: net.tx - tx0, frames: net.frames, warnings: net.warn.length, warnSample: net.warn.slice(0, 5) },
    conn, durationMs: endAt - t0, left, inventory, rooms: { vs: env.rooms.vs.size, hole: env.rooms.hole.size, shogi: env.rooms.shogi.size } };
}

module.exports = { runRtdbLoad, ensureSdk };
