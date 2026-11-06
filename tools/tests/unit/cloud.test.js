// P1-5 の単体テスト：common/cloud.js（同期の強化）を node の vm の中で、偽の localStorage・偽の Firestore・偽の時計で動かす。
// 2台の端末（同じアカウント）を同じ「クラウド」につないで、R2（書き込みの回数）・R3（削除の同期）・R4（巻き戻らない）・
// R14（遊んでいる最中に再読み込みしない）、マージ関数に渡す ctx、トゥームストーンの期限、匿名ログインとリンクを確かめる。
// 実行：node tools/tests/unit/cloud.test.js   （ネットにはつながない。npm のパッケージは使わない）
'use strict';
const vm = require('vm');
const fs = require('fs');
const path = require('path');
const { ROOT, test, eq, ok, deep, run } = require('./_kobo-env');

const SRC = {
  cloud: fs.readFileSync(path.join(ROOT, 'common/cloud.js'), 'utf8'),
  games: fs.readFileSync(path.join(ROOT, 'common/games.js'), 'utf8'),
  platform: fs.readFileSync(path.join(ROOT, 'common/platform.js'), 'utf8'),
};
const MIN = 60000, DAY = 86400000;
const enc = k => k.replace(/\./g, '~');
const settle = async () => { for (let i = 0; i < 30; i++) await new Promise(r => setImmediate(r)); };

// ---------------------------------------------------------------- virtual clock (shared by all devices)
class Clock {
  constructor(t) { this.t = t || Date.UTC(2026, 10, 4, 3, 0, 0); this.timers = []; this.seq = 0; }
  now() { return this.t; }
  set(fn, ms, owner) { const id = ++this.seq; this.timers.push({ id, at: this.t + Math.max(0, Number(ms) || 0), fn, owner }); return id; }
  clear(id) { this.timers = this.timers.filter(x => x.id !== id); }
  drop(owner) { this.timers = this.timers.filter(x => x.owner !== owner); }
  async tick(ms) {
    const end = this.t + ms;
    await settle();
    for (;;) {
      this.timers.sort((a, b) => a.at - b.at || a.id - b.id);
      const n = this.timers[0];
      if (!n || n.at > end) break;
      this.timers.shift();
      this.t = n.at;
      try { n.fn(); } catch (e) { console.error(e); }
      await settle();
    }
    this.t = end;
    await settle();
  }
}

// ---------------------------------------------------------------- fake Firebase "server" (Firestore + Auth)
const DEL = '__kbtDelete';
class Server {
  constructor(clock) { this.clock = clock; this.docs = {}; this.writes = []; this.reads = 0; this.anonN = 0; this.google = {}; this.denyDelete = { nejiUsers: true }; }
  get(p) { this.reads++; return this.docs[p] === undefined ? undefined : JSON.parse(JSON.stringify(this.docs[p])); }
  set(p, data, merge) {
    data = JSON.parse(JSON.stringify(data));
    const mergeIn = (a, b) => {
      const o = Object.assign({}, a || {});
      for (const k of Object.keys(b)) {
        const v = b[k];
        if (v && typeof v === 'object' && v[DEL]) { delete o[k]; continue; }
        if (v && typeof v === 'object' && !Array.isArray(v) && o[k] && typeof o[k] === 'object' && !Array.isArray(o[k])) o[k] = mergeIn(o[k], v);
        else o[k] = (v && typeof v === 'object' && !Array.isArray(v)) ? mergeIn({}, v) : v;
      }
      return o;
    };
    this.docs[p] = merge ? mergeIn(this.docs[p], data) : mergeIn({}, data);
    this.writes.push({ op: 'set', path: p, at: this.clock.now(), data });
  }
  del(p) {
    const coll = p.split('/')[0];
    if (this.denyDelete[coll]) { const e = new Error('Missing or insufficient permissions.'); e.code = 'permission-denied'; throw e; }
    delete this.docs[p]; this.writes.push({ op: 'delete', path: p, at: this.clock.now() });
  }
  game(uid, k) { const d = this.docs['nejiUsers/' + uid]; const e = d && d.games && d.games[enc(k)]; return e === undefined ? undefined : e; }
  writesTo(prefix, from, to) { return this.writes.filter(w => w.path.startsWith(prefix) && (from == null || w.at >= from) && (to == null || w.at < to)).length; }
}

// a "device": its own localStorage, sessionStorage and persisted sign-in; pages are opened in fresh vm contexts
class Device {
  constructor(server, clock, opts) {
    opts = opts || {};
    this.server = server; this.clock = clock;
    this.store = Object.assign({}, opts.storage || {}); this.session = {};
    this.authUser = opts.user || null; // persisted sign-in (like IndexedDB)
    this.pages = 0; this.page = null;
  }
  open(o) { if (this.page) this.page.close(); this.page = new Page(this, o || {}); return this.page.start(); }
  get ls() { return this.page.ctx.localStorage; }
  clearStorage() { this.store = {}; this.session = {}; }
}

const STORAGE_SRC = `
class Storage {
  constructor(src) { Object.defineProperty(this, '_m', { value: src }); }
  getItem(k) { k = String(k); return Object.prototype.hasOwnProperty.call(this._m, k) ? this._m[k] : null; }
  setItem(k, v) { this._m[String(k)] = String(v); }
  removeItem(k) { delete this._m[String(k)]; }
  clear() { for (const k of Object.keys(this._m)) delete this._m[k]; }
  get length() { return Object.keys(this._m).length; }
  key(i) { return Object.keys(this._m)[i] ?? null; }
}`;

class Page {
  constructor(device, o) {
    this.device = device; this.o = o; this.id = 'p' + (++device.pages);
    this.reloads = 0; this.idle = o.idle !== undefined ? o.idle : true; this.toasts = [];
    this.winL = {}; this.docL = {};
  }
  async start() {
    const d = this.device, clock = d.clock, me = this, o = this.o;
    const ctx = vm.createContext({ console, setImmediate });
    this.ctx = ctx;
    vm.runInContext('var window = this, self = this;' + STORAGE_SRC + '; this.Storage = Storage;', ctx);
    ctx.__now = () => clock.now();
    vm.runInContext('Date.now = () => __now();', ctx);
    ctx.setTimeout = (fn, ms) => clock.set(fn, ms, me.id);
    ctx.clearTimeout = id => clock.clear(id);
    ctx.localStorage = vm.runInContext('new Storage(__src)', Object.assign(ctx, { __src: d.store }));
    ctx.sessionStorage = vm.runInContext('new Storage(__src)', Object.assign(ctx, { __src: d.session }));
    ctx.location = { protocol: o.protocol || 'https:', hostname: o.hostname || 'neji-5913a.web.app', pathname: o.path || '/raft/', reload: () => { me.reloads++; } };
    ctx.addEventListener = (t, f) => { (me.winL[t] = me.winL[t] || []).push(f); };
    ctx.removeEventListener = () => {};
    const body = { children: [], appendChild(el) { this.children.push(el); el.parentNode = body; if (el.className === 'kc-pending') me.toasts.push(el); } };
    const mkEl = tag => ({ tagName: tag, style: {}, kids: [], textContent: '', setAttribute(k, v) { this[k] = v; }, append(...k) { this.kids.push(...k); }, remove() { const i = body.children.indexOf(this); if (i >= 0) body.children.splice(i, 1); } });
    ctx.document = {
      head: { appendChild: el => me.loadScript(el) }, body,
      createElement: mkEl, querySelector: () => null,
      currentScript: { src: 'https://neji-5913a.web.app/common/cloud.js' },
      visibilityState: 'visible',
      addEventListener: (t, f) => { (me.docL[t] = me.docL[t] || []).push(f); },
    };
    if (o.lang === 'en' || o.i18n) {
      const dict = {};
      ctx.KoboI18n = { lang: o.lang || 'ja', add(m) { Object.assign(dict, m.en || {}); }, t(s, v) { const x = o.lang === 'en' && dict[s] != null ? dict[s] : s; return v ? String(x).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : x; }, dict };
    }
    if (o.game) ctx.KoboGame = { isIdle: () => me.idle, info: () => ({ id: o.game }) };
    ctx.NEJI_FIREBASE = { projectId: 'kbt' };
    if (o.cloudOpts) ctx.KOBO_CLOUD_OPTS = o.cloudOpts;
    if (o.preload) for (const f of o.preload) vm.runInContext(SRC[f], ctx, { filename: f + '.js' });
    vm.runInContext(SRC.cloud, ctx, { filename: 'cloud.js' });
    this.K = ctx.KoboCloud;
    if (o.sync) this.K.sync(o.sync, o.syncOpt);
    await clock.tick(50);
    return this;
  }
  loadScript(el) {
    const ctx = this.ctx, src = String(el.src), me = this;
    Promise.resolve().then(() => {
      if (/firebase-app-compat/.test(src)) installFirebase(me);
      else if (/firebase-(auth|firestore)-compat/.test(src)) { /* included above */ }
      else if (/common\/games\.js$/.test(src)) { if (me.o.noRegistry) return el.onerror && el.onerror(new Error('404')); vm.runInContext(SRC.games, ctx); }
      else if (/common\/platform\.js$/.test(src)) { if (me.o.noRegistry) return el.onerror && el.onerror(new Error('404')); vm.runInContext(SRC.platform, ctx); }
      else return el.onerror && el.onerror(new Error('unknown script ' + src));
      el.onload && el.onload();
    });
  }
  fire(t) { (this.winL[t] || []).forEach(f => f({ type: t })); }
  hide() { this.ctx.document.visibilityState = 'hidden'; (this.docL.visibilitychange || []).forEach(f => f({})); }
  set(k, v) { this.ctx.localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v)); }
  get(k) { const v = this.ctx.localStorage.getItem(k); try { return v == null ? null : JSON.parse(v); } catch (e) { return v; } }
  del(k) { this.ctx.localStorage.removeItem(k); }
  close() { this.device.clock.drop(this.id); }
}

function installFirebase(page) {
  const d = page.device, S = d.server, ctx = page.ctx;
  const listeners = [];
  const later = f => Promise.resolve().then(f);
  const clone = v => (v === undefined ? undefined : JSON.parse(JSON.stringify(v)));
  const fire = () => listeners.forEach(f => later(() => f(auth.currentUser)));
  const mkUser = u => {
    if (!u) return null;
    const obj = {
      uid: u.uid, isAnonymous: !!u.isAnonymous, displayName: u.displayName || '',
      linkWithPopup() {
        const taken = S.google.taken;
        if (taken) return Promise.reject(Object.assign(new Error('in use'), { code: 'auth/credential-already-in-use', credential: { googleUid: taken } }));
        obj.isAnonymous = false; obj.displayName = 'Linked'; d.authUser = { uid: obj.uid, isAnonymous: false, displayName: 'Linked' };
        return Promise.resolve({ user: obj, operationType: 'link' });
      },
      linkWithRedirect() { return Promise.resolve(); },
      delete() { return Promise.resolve(); },
    };
    return obj;
  };
  let cur = mkUser(d.authUser);
  const auth = {
    get currentUser() { return cur; },
    onAuthStateChanged(cb) { listeners.push(cb); later(() => cb(cur)); return () => {}; },
    signInAnonymously() { const u = { uid: 'anon-' + (++S.anonN), isAnonymous: true }; d.authUser = u; cur = mkUser(u); fire(); return Promise.resolve({ user: cur }); },
    signInWithCredential(cred) { const u = { uid: cred.googleUid, isAnonymous: false, displayName: 'G' }; d.authUser = u; cur = mkUser(u); fire(); return Promise.resolve({ user: cur }); },
    signInWithPopup() { const u = { uid: S.google.popupUid || 'g-popup', isAnonymous: false, displayName: 'G' }; d.authUser = u; cur = mkUser(u); fire(); return Promise.resolve({ user: cur }); },
    signInWithRedirect() { return Promise.resolve(); },
    getRedirectResult() { return Promise.resolve({ user: null }); },
    signOut() { d.authUser = null; cur = null; fire(); return Promise.resolve(); },
  };
  const doc = p => ({
    get() { return later(() => { const v = S.get(p); return { exists: v !== undefined, data: () => clone(v), id: p.split('/').pop() }; }); },
    set(data, opt) { return later(() => S.set(p, data, !!(opt && opt.merge))); },
    delete() { return later(() => S.del(p)); },
  });
  const coll = (name, lim) => ({
    doc: id => doc(name + '/' + id),
    limit: n => coll(name, n),
    get() { return later(() => { const docs = Object.keys(S.docs).filter(p => p.startsWith(name + '/')).slice(0, lim || 1e9).map(p => ({ id: p.split('/')[1], data: () => clone(S.docs[p]) })); S.reads += Math.max(1, docs.length); return { docs }; }); },
  });
  const db = { collection: n => coll(n) };
  const fb = { apps: [], initializeApp(cfg) { const a = { options: cfg }; fb.apps.push(a); return a; }, auth: () => auth, firestore: () => db };
  fb.auth.GoogleAuthProvider = function () {};
  fb.firestore.FieldValue = { delete: () => ({ [DEL]: 1 }) };
  ctx.firebase = fb;
}

// ---------------------------------------------------------------- helpers
function world(opts) {
  const clock = new Clock(opts && opts.t0), server = new Server(clock);
  return { clock, server, device: o => new Device(server, clock, o) };
}
const G1 = { uid: 'g1', isAnonymous: false, displayName: 'Tester' };
const RAFT = { 'kusoge.raft.best': 'max', 'kusoge.raft.save': 'newest' };
function seedRemote(server, uid, games) {
  const g = {};
  for (const [k, e] of Object.entries(games)) g[enc(k)] = { v: e.v === null ? null : (typeof e.v === 'string' ? e.v : JSON.stringify(e.v)), t: e.t };
  server.docs['nejiUsers/' + uid] = { games: g, updatedAt: 1 };
}
const remoteVal = (server, uid, k) => { const e = server.game(uid, k); if (!e) return undefined; if (e.v === null) return null; try { return JSON.parse(e.v); } catch (x) { return e.v; } };

// ================================================================= compatibility
test('API surface: every existing export is still there, plus user/ensureGuest/linkGoogle', async () => {
  const w = world(), A = w.device({ user: G1 });
  const p = await A.open({ sync: { 'kusoge.drop.best': 'max' }, path: '/drop/' });
  for (const f of ['sync', 'onChange', 'mountLogin', 'login', 'logout', 'push', 'pull', 'setNickname', 'nickname', 'submitScores', 'loadRanks', 'me', 'ready', 'user', 'ensureGuest', 'linkGoogle'])
    eq(typeof p.K[f], 'function', f);
  eq(await p.K.ready(), true, 'ready() resolves true');
  eq(p.K.me(), 'g1');
  deep(p.K.user(), { uid: 'g1', isAnonymous: false, name: 'Tester' });
});

test("'max' (legacy call): the higher value wins both ways", async () => {
  const w = world(), A = w.device({ user: G1, storage: { 'kusoge.drop.best': '300', 'kobo.syncedUid': 'g1', 'kobo.mtime': '{"kusoge.drop.best":1000}' } });
  seedRemote(w.server, 'g1', { 'kusoge.drop.best': { v: 250, t: 2000 }, 'kusoge.blocks.best': { v: 900, t: 10 } });
  const p = await A.open({ sync: { 'kusoge.drop.best': 'max', 'kusoge.blocks.best': 'max' }, path: '/drop/' });
  await w.clock.tick(100);
  eq(p.get('kusoge.drop.best'), 300); eq(remoteVal(w.server, 'g1', 'kusoge.drop.best'), 300);
  eq(p.get('kusoge.blocks.best'), 900);
});

test('without games.js/platform.js (registry unavailable): newest is whole-blob newest, as before', async () => {
  const w = world(), A = w.device({ user: G1, storage: { 'kusoge.water.save': '{"level":5,"best":9,"stars":{}}', 'kobo.syncedUid': 'g1', 'kobo.mtime': '{"kusoge.water.save":1000}' } });
  seedRemote(w.server, 'g1', { 'kusoge.water.save': { v: { level: 3, best: 7, stars: {} }, t: 2000 } });
  const p = await A.open({ sync: { 'kusoge.water.save': 'newest' }, syncOpt: { reloadOnNewer: true }, path: '/water/', noRegistry: true });
  await w.clock.tick(100);
  eq(p.get('kusoge.water.save').best, 7, 'old behavior: newer blob wins');
  eq(p.reloads, 1, 'reloads once (no input yet → idle)');
  ok(!p.ctx.KoboPlatform, 'no platform loaded');
});

test('registry is loaded on demand and upgrades newest → per-field merge (R4 water)', async () => {
  const w = world(), A = w.device({ user: G1, storage: { 'kusoge.water.save': '{"level":5,"best":9,"stars":{"1":3}}', 'kobo.syncedUid': 'g1', 'kobo.mtime': '{"kusoge.water.save":1000}' } });
  seedRemote(w.server, 'g1', { 'kusoge.water.save': { v: { level: 3, best: 7, stars: { 2: 1 } }, t: 2000 } });
  const p = await A.open({ sync: { 'kusoge.water.save': 'newest' }, path: '/water/' });
  await w.clock.tick(100);
  ok(p.ctx.KoboPlatform && p.ctx.KOBO_REGISTRY, 'registry loaded');
  const v = p.get('kusoge.water.save');
  eq(v.best, 9); eq(v.level, 3, 'level is newest'); deep(v.stars, { 1: 3, 2: 1 });
  eq(remoteVal(w.server, 'g1', 'kusoge.water.save').best, 9);
});

test('legacy first-device rule: the cloud copy of a run wins on the first sync of this account here', async () => {
  const w = world(), A = w.device({ user: G1, storage: { 'kusoge.raft.save': '{"day":1}', 'kobo.mtime': '{"kusoge.raft.save":5000}' } });
  seedRemote(w.server, 'g1', { 'kusoge.raft.save': { v: { day: 40 }, t: 1000 } });
  const p = await A.open({ sync: RAFT });
  await w.clock.tick(100);
  eq(p.get('kusoge.raft.save').day, 40);
  eq(p.get('kobo.syncedUid'), 'g1');
  ok(w.server.writesTo('nejiUsers/') >= 1, 'first sync of a device marks the account (one write)');
});

// ================================================================= R2: write volume
async function raftSession(changeBest) {
  const w = world(), A = w.device({ user: G1, storage: { 'kobo.syncedUid': 'g1', 'kobo.nick': 'tester', 'kusoge.raft.best': '3' } });
  seedRemote(w.server, 'g1', { 'kusoge.raft.best': { v: 3, t: 1 }, 'kobo.nick': { v: 'tester', t: 0 } });
  const p = await A.open({ sync: RAFT, game: 'raft' });
  await w.clock.tick(5000);
  const t0 = w.clock.now(), u0 = w.server.writesTo('nejiUsers/'), r0 = w.server.writesTo('kusogeRanks/');
  const MINUTES = 10;
  for (let i = 0; i < MINUTES * 15; i++) { // every 4 s
    p.set('kusoge.raft.save', { v: 3, day: Math.floor(i / 5), t: i, hp: 100 - (i % 7) });
    if (changeBest && i % 15 === 14) p.set('kusoge.raft.best', String(3 + (i + 1) / 15));
    await w.clock.tick(4000);
  }
  const perMin = [];
  for (let m = 0; m < MINUTES; m++) perMin.push(w.server.writesTo('nejiUsers/', t0 + m * MIN, t0 + (m + 1) * MIN) + w.server.writesTo('kusogeRanks/', t0 + m * MIN, t0 + (m + 1) * MIN));
  return { w, p, users: w.server.writesTo('nejiUsers/') - u0, ranks: w.server.writesTo('kusogeRanks/') - r0, perMin, minutes: MINUTES };
}
test('R2: raft-like saves every 4 s → at most 2 writes per minute (nejiUsers + kusogeRanks)', async () => {
  const r = await raftSession(false);
  const rate = (r.users + r.ranks) / r.minutes;
  console.log(`    R2 raft 4 s saves, best unchanged: nejiUsers ${r.users}, kusogeRanks ${r.ranks} in ${r.minutes} min → ${rate.toFixed(2)}/min; per minute ${r.perMin.join(',')}`);
  ok(rate <= 2, 'rate ' + rate);
  ok(Math.max(...r.perMin) <= 2, 'max per minute ' + Math.max(...r.perMin));
  eq(r.ranks, 0, 'ranking not re-sent when nothing changed');
  // the cloud has the latest save after the page is hidden
  r.p.hide(); await r.w.clock.tick(10);
  eq(remoteVal(r.w.server, 'g1', 'kusoge.raft.save').t, 149);
});
test('R2: with the best rising once a minute, ranking goes out only on change and stays within budget', async () => {
  const r = await raftSession(true);
  const rate = (r.users + r.ranks) / r.minutes;
  console.log(`    R2 raft 4 s saves, best +1/min: nejiUsers ${r.users}, kusogeRanks ${r.ranks} in ${r.minutes} min → ${(r.users / r.minutes).toFixed(2)} + ${(r.ranks / r.minutes).toFixed(2)}/min`);
  ok(r.users / r.minutes <= 2, 'nejiUsers rate');
  ok(r.ranks <= r.minutes, 'kusogeRanks ≤ 1/min');
  ok(r.ranks >= r.minutes - 1, 'every new best is sent');
});
test('R2: saving the same value again writes nothing; a burst of 10 saves in 1 s is one write', async () => {
  const w = world(), A = w.device({ user: G1, storage: { 'kobo.syncedUid': 'g1', 'kusoge.drop.best': '10', 'kobo.nick': 'n' } });
  seedRemote(w.server, 'g1', { 'kusoge.drop.best': { v: 10, t: 1 }, 'kobo.nick': { v: 'n', t: 0 } });
  const p = await A.open({ sync: { 'kusoge.drop.best': 'max' }, path: '/drop/' });
  await w.clock.tick(70000);
  const u0 = w.server.writesTo('nejiUsers/'), r0 = w.server.writesTo('kusogeRanks/');
  for (let i = 0; i < 10; i++) { p.set('kusoge.drop.best', String(20 + i)); await w.clock.tick(100); }
  await w.clock.tick(8000);
  eq(w.server.writesTo('nejiUsers/') - u0, 1, 'one nejiUsers write');
  eq(w.server.writesTo('kusogeRanks/') - r0, 1, 'one kusogeRanks write');
  p.set('kusoge.drop.best', '29'); await w.clock.tick(70000);
  eq(w.server.writesTo('nejiUsers/') - u0, 1, 'unchanged value: no write');
  eq(w.server.writesTo('kusogeRanks/') - r0, 1, 'unchanged rank: no write');
  // a change inside the 30 s window waits; hiding the page sends it at once
  p.set('kusoge.drop.best', '30'); await w.clock.tick(2500);
  p.set('kusoge.drop.best', '31'); await w.clock.tick(1000);
  const before = w.server.writesTo('nejiUsers/');
  p.hide(); await w.clock.tick(10);
  eq(w.server.writesTo('nejiUsers/'), before + 1, 'hidden → immediate push');
  eq(remoteVal(w.server, 'g1', 'kusoge.drop.best'), 31);
  ok(w.server.writes.filter(x => x.path.startsWith('nejiUsers/')).slice(-1)[0].data.games[enc('kusoge.drop.best')], 'only the changed key is sent');
  eq(Object.keys(w.server.writes.filter(x => x.path.startsWith('nejiUsers/')).slice(-1)[0].data.games).length, 1, 'only the changed key is sent');
});
test('R2: page loads do not re-send the ranking when nothing changed', async () => {
  const w = world(), A = w.device({ user: G1, storage: { 'kobo.syncedUid': 'g1', 'kusoge.drop.best': '10', 'kobo.nick': 'n' } });
  seedRemote(w.server, 'g1', { 'kusoge.drop.best': { v: 10, t: 1 }, 'kobo.nick': { v: 'n', t: 0 } });
  await A.open({ sync: { 'kusoge.drop.best': 'max' }, path: '/drop/' }); await w.clock.tick(5000);
  const r0 = w.server.writesTo('kusogeRanks/'), u0 = w.server.writesTo('nejiUsers/');
  for (let i = 0; i < 5; i++) { await A.open({ sync: { 'kusoge.drop.best': 'max' }, path: '/drop/' }); await w.clock.tick(5000); }
  eq(w.server.writesTo('kusogeRanks/'), r0, 'no rank writes on reload');
  eq(w.server.writesTo('nejiUsers/'), u0, 'no nejiUsers writes on reload');
});

// ================================================================= R3: deletes
test('R3: a deleted save stays deleted across devices (tombstone)', async () => {
  const w = world();
  const A = w.device({ user: G1, storage: { 'kobo.syncedUid': 'g1' } }), B = w.device({ user: G1, storage: { 'kobo.syncedUid': 'g1' } });
  const pa = await A.open({ sync: RAFT, game: 'raft' });
  pa.set('kusoge.raft.save', { day: 12 }); await w.clock.tick(5000);
  eq(remoteVal(w.server, 'g1', 'kusoge.raft.save').day, 12);
  const pb = await B.open({ sync: RAFT, game: 'raft' }); await w.clock.tick(1000);
  eq(pb.get('kusoge.raft.save').day, 12, 'B got the run');
  await w.clock.tick(60000);
  pa.del('kusoge.raft.save'); // the raft sank on A
  await w.clock.tick(5000);
  eq(remoteVal(w.server, 'g1', 'kusoge.raft.save'), null, 'cloud holds a tombstone');
  // B reopens (it still has the old run locally)
  const pb2 = await B.open({ sync: RAFT, game: 'raft' }); await w.clock.tick(1000);
  eq(pb2.get('kusoge.raft.save'), null, 'B: the dead run is gone');
  await w.clock.tick(60000);
  // A reopens: nothing comes back
  const pa2 = await A.open({ sync: RAFT, game: 'raft' }); await w.clock.tick(1000);
  eq(pa2.get('kusoge.raft.save'), null, 'A: still deleted');
  eq(remoteVal(w.server, 'g1', 'kusoge.raft.save'), null, 'cloud: still a tombstone');
  // a new run after the delete wins over the tombstone
  pa2.set('kusoge.raft.save', { day: 1 }); await w.clock.tick(5000);
  const pb3 = await B.open({ sync: RAFT, game: 'raft' }); await w.clock.tick(1000);
  eq(pb3.get('kusoge.raft.save').day, 1, 'B gets the new run');
});
test('R3: the audit case — blocks state deleted locally (mtime only), older cloud copy does not return', async () => {
  const w = world(), n = w.clock.now() - 3 * DAY;
  const A = w.device({ user: G1, storage: { 'kusoge.blocks.best': '500', 'kobo.syncedUid': 'g1', 'kobo.mtime': JSON.stringify({ 'kusoge.blocks.best': n + 3000, 'kusoge.blocks.state': n + 3000 }) } });
  seedRemote(w.server, 'g1', { 'kusoge.blocks.best': { v: 500, t: n + 3000 }, 'kusoge.blocks.state': { v: { v: 1, score: 120 }, t: n + 2000 } });
  const p = await A.open({ sync: { 'kusoge.blocks.best': 'max', 'kusoge.blocks.state': 'newest' }, syncOpt: { reloadOnNewer: true }, path: '/blocks/' });
  await w.clock.tick(1000);
  eq(p.get('kusoge.blocks.state'), null, 'not restored');
  eq(p.reloads, 0, 'no reload');
  eq(remoteVal(w.server, 'g1', 'kusoge.blocks.state'), null, 'tombstone pushed');
});
test('tombstones expire after 30 days only when both sides agree', async () => {
  const w = world(), now = w.clock.now();
  const A = w.device({ user: G1, storage: { 'kobo.syncedUid': 'g1', 'kobo.mtime': JSON.stringify({ 'kusoge.blocks.state': now - 31 * DAY, 'kusoge.raft.save': now - 5 * DAY }) } });
  seedRemote(w.server, 'g1', { 'kusoge.blocks.state': { v: null, t: now - 31 * DAY }, 'kusoge.raft.save': { v: null, t: now - 5 * DAY }, 'kusoge.n59049.state': { v: null, t: now - 40 * DAY } });
  const p = await A.open({ sync: { 'kusoge.blocks.state': 'newest', 'kusoge.raft.save': 'newest', 'kusoge.n59049.state': 'newest' } });
  await w.clock.tick(1000);
  eq(w.server.game('g1', 'kusoge.blocks.state'), undefined, 'old tombstone removed from the cloud');
  eq(w.server.game('g1', 'kusoge.n59049.state'), undefined, 'old remote-only tombstone removed');
  deep(w.server.game('g1', 'kusoge.raft.save'), { v: null, t: now - 5 * DAY }, 'young tombstone kept');
  const m = p.get('kobo.mtime');
  ok(!('kusoge.blocks.state' in m), 'local mtime entry dropped'); ok('kusoge.raft.save' in m, 'young local tombstone kept');
  // an expired tombstone in the cloud still beats an older value on a device, then gets cleaned up
  const w2 = world(), n2 = w2.clock.now();
  const B = w2.device({ user: G1, storage: { 'kobo.syncedUid': 'g1', 'kusoge.raft.save': '{"day":3}', 'kobo.mtime': JSON.stringify({ 'kusoge.raft.save': n2 - 50 * DAY }) } });
  seedRemote(w2.server, 'g1', { 'kusoge.raft.save': { v: null, t: n2 - 40 * DAY } });
  const pb = await B.open({ sync: RAFT, game: 'raft' }); await w2.clock.tick(1000);
  eq(pb.get('kusoge.raft.save'), null, 'older local save deleted');
  eq(w2.server.game('g1', 'kusoge.raft.save'), undefined, 'and the tombstone is cleaned up');
});

// ================================================================= R4: two devices, interleaved edits
test('R4: gates coins/stages and hole skins/best do not roll back with interleaved edits on two devices', async () => {
  const w = world();
  const sync = { 'kusoge.gates.save': 'newest', 'kusoge.hole.save': 'newest' };
  const A = w.device({ user: G1, storage: { 'kobo.syncedUid': 'g1' } }), B = w.device({ user: G1, storage: { 'kobo.syncedUid': 'g1' } });
  const gates = (o) => Object.assign({ v: 2, best: 1, stage: 1, coins: 0, mat: 0, exp: 0, bld: {}, heroes: {}, sel: [], runs: 0 }, o);
  const hole = (o) => Object.assign({ best: { matchRank: 0, matchPts: 0, soloPct: 0, soloStars: 0, maxSize: 0 }, coins: 0, skins: { owned: ['kuro'], sel: 'kuro' }, perks: { size: 0, speed: 0 }, wins: 0 }, o);
  let pa = await A.open({ sync, path: '/gates/' });
  pa.set('kusoge.gates.save', gates({ best: 5, stage: 5, coins: 200, bld: { wall: 2 }, heroes: { h1: { lv: 3, star: 1, cards: 4 } }, runs: 5 }));
  pa.set('kusoge.hole.save', hole({ best: { matchRank: 2, matchPts: 300, soloPct: 0, soloStars: 0, maxSize: 5 }, coins: 50, skins: { owned: ['kuro', 'sora'], sel: 'sora' }, wins: 1 }));
  await w.clock.tick(5000);
  // B was offline with an old copy and played on it (stale base, later timestamp)
  B.store['kusoge.gates.save'] = JSON.stringify(gates({ best: 3, stage: 3, coins: 40, bld: { wall: 1, tower: 1 }, heroes: { h1: { lv: 2, star: 1, cards: 1 }, h2: { lv: 1, star: 0, cards: 0 } }, runs: 3 }));
  B.store['kusoge.hole.save'] = JSON.stringify(hole({ best: { matchRank: 3, matchPts: 100, soloPct: 10, soloStars: 1, maxSize: 4 }, coins: 80, skins: { owned: ['kuro', 'ichigo'], sel: 'ichigo' } }));
  B.store['kobo.mtime'] = JSON.stringify({ 'kusoge.gates.save': w.clock.now() + 1000, 'kusoge.hole.save': w.clock.now() + 1000 });
  await w.clock.tick(2000);
  let pb = await B.open({ sync, path: '/gates/' }); await w.clock.tick(1000);
  let g = pb.get('kusoge.gates.save'), h = pb.get('kusoge.hole.save');
  eq(g.best, 5, 'best stage kept'); deep(g.bld, { wall: 2, tower: 1 }); eq(g.heroes.h1.lv, 3); eq(g.heroes.h2.lv, 1); eq(g.runs, 5);
  eq(g.coins, 40, 'coins: newest edit (B)');
  deep(h.skins.owned.slice().sort(), ['ichigo', 'kuro', 'sora'], 'skins: union');
  eq(h.best.matchRank, 2); eq(h.best.matchPts, 300, 'rank/points kept as a pair'); eq(h.best.soloPct, 10); eq(h.wins, 1);
  // B spends coins (newer); A, already open, edits later without reloading; then each reloads
  await w.clock.tick(40000);
  pb.set('kusoge.gates.save', Object.assign(pb.get('kusoge.gates.save'), { coins: 10, stage: 6, best: 6 }));
  await w.clock.tick(40000);
  pa.set('kusoge.gates.save', Object.assign(pa.get('kusoge.gates.save'), { coins: 260, heroes: { h1: { lv: 4, star: 2, cards: 0 } } }));
  await w.clock.tick(40000);
  pb = await B.open({ sync, path: '/gates/' }); await w.clock.tick(1000);
  pa = await A.open({ sync, path: '/gates/' }); await w.clock.tick(1000);
  for (const [n, p] of [['A', pa], ['B', pb]]) {
    g = p.get('kusoge.gates.save');
    eq(g.best, 6, n + ' best'); eq(g.heroes.h1.lv, 4, n + ' hero lv'); eq(g.heroes.h2.lv, 1, n + ' hero h2'); eq(g.bld.tower, 1, n + ' bld');
    eq(g.coins, 260, n + ' coins = latest edit');
  }
  const rg = remoteVal(w.server, 'g1', 'kusoge.gates.save');
  eq(rg.best, 6); eq(rg.coins, 260); eq(rg.heroes.h1.lv, 4);
});

// ================================================================= merge ctx
test('merge functions get (localStr, remoteStr, { localT, remoteT }) in that order, on pull and push', async () => {
  const w = world(), calls = [];
  const A = w.device({ user: G1, storage: { 'kobo.syncedUid': 'g1', 'x.k': '"L"', 'kobo.mtime': '{"x.k":111}' } });
  seedRemote(w.server, 'g1', { 'x.k': { v: '"R"', t: 222 } });
  const p = await A.open({ path: '/hub/', noRegistry: true });
  // idempotent merge (set of letters), as merge functions must be
  const merge = (l, r, ctx) => { calls.push({ l, r, lt: ctx.localT, rt: ctx.remoteT }); return JSON.stringify([...new Set(JSON.parse(l) + JSON.parse(r))].sort().join('')); };
  p.K.sync({ 'x.k': { merge } });
  await w.clock.tick(1000);
  deep(calls[0], { l: '"L"', r: '"R"', lt: 111, rt: 222 });
  eq(p.get('x.k'), 'LR');
  eq(remoteVal(w.server, 'g1', 'x.k'), 'LR');
  eq(w.server.game('g1', 'x.k').t, 222, 'merged entry keeps the newer time');
  // on push: (this device, last seen cloud copy) with this device's change time
  await w.clock.tick(60000);
  calls.length = 0;
  p.set('x.k', '"LRZ"'); await w.clock.tick(5000);
  const c = calls[calls.length - 1];
  eq(c.l, '"LRZ"'); eq(c.r, '"LR"'); eq(c.lt, w.clock.now() - 5000); eq(c.rt, 222);
  eq(remoteVal(w.server, 'g1', 'x.k'), 'LRZ');
  // first sync on a device: local counts as older than the cloud (localT = -1)
  const w2 = world(), c2 = [];
  const B = w2.device({ user: G1, storage: { 'x.k': '"L"', 'kobo.mtime': '{"x.k":999}' } });
  seedRemote(w2.server, 'g1', { 'x.k': { v: '"R"', t: 5 } });
  const pb = await B.open({ path: '/hub/', noRegistry: true });
  pb.K.sync({ 'x.k': (l, r, ctx) => { c2.push(ctx); return r; } });
  await w2.clock.tick(1000);
  eq(c2[0].localT, -1); eq(c2[0].remoteT, 5);
});

// ================================================================= R14: idle-gated reload
test('R14: reloadOnNewer reloads only when the game is idle; otherwise the save is left alone and a toast offers a reload', async () => {
  const mk = async idle => {
    const w = world(), A = w.device({ user: G1, storage: { 'kobo.syncedUid': 'g1', 'kusoge.raft.save': '{"day":2}', 'kobo.mtime': '{"kusoge.raft.save":1000}' } });
    seedRemote(w.server, 'g1', { 'kusoge.raft.save': { v: { day: 9 }, t: 2000 } });
    const p = await A.open({ sync: RAFT, syncOpt: { reloadOnNewer: true }, game: 'raft', idle });
    await w.clock.tick(1000);
    return { w, p };
  };
  const busy = await mk(false);
  eq(busy.p.reloads, 0, 'no reload while playing');
  eq(busy.p.get('kusoge.raft.save').day, 2, 'running game save untouched');
  eq(busy.p.toasts.length, 1, 'toast shown');
  eq(busy.w.server.game('g1', 'kusoge.raft.save').t, 2000, 'cloud copy kept (not overwritten by the older local)');
  // the next load applies it
  const p2 = await busy.p.device.open({ sync: RAFT, syncOpt: { reloadOnNewer: true }, game: 'raft', idle: true });
  await busy.w.clock.tick(1000);
  eq(p2.get('kusoge.raft.save').day, 9, 'applied on next load');
  const calm = await mk(true);
  eq(calm.p.reloads, 1, 'idle → reload'); eq(calm.p.get('kusoge.raft.save').day, 9);
});
test('R14: without KoboGame, a page the player already touched is not reloaded', async () => {
  const w = world(), A = w.device({ user: G1, storage: { 'kobo.syncedUid': 'g1', 'kusoge.raft.save': '{"day":2}', 'kobo.mtime': '{"kusoge.raft.save":1000}' } });
  seedRemote(w.server, 'g1', { 'kusoge.raft.save': { v: { day: 9 }, t: 2000 } });
  // touch the page before the sync finishes
  const D = new Device(w.server, w.clock, { user: G1 }); void D;
  const p = new Page(A, { sync: RAFT, syncOpt: { reloadOnNewer: true } });
  A.page = p;
  const started = p.start();
  p.fire('pointerdown');
  await started; await w.clock.tick(1000);
  eq(p.reloads, 0); eq(p.get('kusoge.raft.save').day, 2); eq(p.toasts.length, 1);
});

// ================================================================= platform keys, audio
test('platform keys sync too; kobo.audio from the cloud also writes kusoge.sound', async () => {
  const w = world(), A = w.device({ user: G1, storage: { 'kobo.syncedUid': 'g1', 'kusoge.sound': '1', 'kobo.audio': '{"v":1,"master":0.8,"se":1,"bgm":0.6,"mute":false}', 'kobo.mtime': '{"kobo.audio":10}' } });
  seedRemote(w.server, 'g1', { 'kobo.audio': { v: { v: 1, master: 0.5, se: 1, bgm: 0.6, mute: true }, t: 20 }, 'kobo.history': { v: [{ g: 'blocks', t: 5 }], t: 5 } });
  const p = await A.open({ sync: { 'kusoge.drop.best': 'max' }, path: '/drop/' });
  await w.clock.tick(1000);
  eq(p.get('kobo.audio').mute, true); eq(p.ctx.localStorage.getItem('kusoge.sound'), '0', 'legacy flag follows');
  eq(p.get('kobo.history').length, 1);
});
test('keys added after the first sync (versus.js) merge from the cached cloud copy without another read', async () => {
  const w = world(), A = w.device({ user: G1, storage: { 'kobo.syncedUid': 'g1', 'kusoge.vs.stats': '{"blocks":{"plays":3,"wins":1,"best":10}}', 'kobo.mtime': '{"kusoge.vs.stats":50}' } });
  seedRemote(w.server, 'g1', { 'kusoge.vs.stats': { v: { blocks: { plays: 5, wins: 0, best: 20 } }, t: 10 } });
  const p = await A.open({ sync: { 'kusoge.blocks.best': 'max' }, path: '/blocks/' });
  await w.clock.tick(1000);
  const reads = w.server.reads;
  p.K.sync({ 'kusoge.vs.stats': 'newest' });
  await w.clock.tick(10000);
  eq(w.server.reads, reads, 'no extra read');
  deep(p.get('kusoge.vs.stats'), { blocks: { plays: 5, wins: 1, best: 20 } });
  deep(remoteVal(w.server, 'g1', 'kusoge.vs.stats'), { blocks: { plays: 5, wins: 1, best: 20 } });
});

// ================================================================= auth: guest and linking
test('ensureGuest signs in anonymously; guests are not synced to nejiUsers by default; state.user stays null', async () => {
  const w = world(), A = w.device({ storage: { 'kusoge.drop.best': '50' } });
  const p = await A.open({ sync: { 'kusoge.drop.best': 'max' }, path: '/drop/' });
  const states = []; p.K.onChange(s => states.push(s));
  const u = await p.K.ensureGuest(); await w.clock.tick(5000);
  eq(u.isAnonymous, true); ok(/^anon-/.test(u.uid));
  eq(w.server.writesTo('nejiUsers/'), 0, 'no guest sync');
  const last = states[states.length - 1];
  eq(last.user, null, 'hub widget still offers Google sign-in'); eq(last.guest.uid, u.uid);
  eq(p.K.me(), u.uid);
  // a guest with a nickname can be ranked
  p.set('kobo.nick', 'guest'); await p.K.submitScores();
  eq(w.server.docs['kusogeRanks/' + u.uid].scores.drop, 50);
  eq((await p.K.ensureGuest()).uid, u.uid, 'idempotent');
});
test('ensureGuest: calls at the same moment make one anonymous account, not two (P4 load test)', async () => {
  const w = world(), A = w.device({});
  const p = await A.open({ sync: { 'kusoge.drop.best': 'max' }, path: '/drop/' });
  const au = p.ctx.firebase.auth(), orig = au.signInAnonymously;
  // the real sign-in takes a network round trip: rank.js, achievements.js and versus.js can all ask before it answers
  au.signInAnonymously = () => new Promise(r => setImmediate(r)).then(() => orig.call(au));
  const us = await Promise.all([p.K.ensureGuest(), p.K.ensureGuest(), p.K.ensureGuest()]);
  eq(w.server.anonN, 1, 'one account');
  ok(us.every(u => u && u.uid === us[0].uid), 'same uid for every caller');
  eq((await p.K.ensureGuest()).uid, us[0].uid, 'later calls reuse it');
  eq(w.server.anonN, 1);
});
test('kusogeRanks (legacy) is not written after the rules close it (2026-12-02 JST)', async () => {
  const w = world({ t0: Date.UTC(2026, 11, 1, 15, 0, 1) }), A = w.device({ user: G1, storage: { 'kusoge.drop.best': '50', 'kobo.nick': 'late' } });
  const p = await A.open({ sync: { 'kusoge.drop.best': 'max' }, path: '/drop/' });
  await w.clock.tick(5000); p.set('kusoge.drop.best', '60'); await w.clock.tick(120000); await p.K.submitScores();
  eq(w.server.writesTo('kusogeRanks/'), 0);
});
test('linkGoogle keeps the uid and starts syncing; login() on a guest links', async () => {
  const w = world(), A = w.device({ storage: { 'kusoge.drop.best': '70' } });
  const p = await A.open({ sync: { 'kusoge.drop.best': 'max' }, path: '/drop/' });
  const g = await p.K.ensureGuest(); await w.clock.tick(100);
  await p.K.login(); await w.clock.tick(1000);
  const u = p.K.user();
  eq(u.uid, g.uid, 'same uid'); eq(u.isAnonymous, false);
  eq(remoteVal(w.server, g.uid, 'kusoge.drop.best'), 70, 'synced after linking');
});
test('linkGoogle with credential-already-in-use: switches to that account and merges this device\'s records', async () => {
  const w = world();
  seedRemote(w.server, 'gOld', { 'kusoge.water.save': { v: { level: 8, best: 8, stars: { 1: 1 } }, t: 100 }, 'kusoge.drop.best': { v: 900, t: 100 } });
  w.server.google.taken = 'gOld';
  const A = w.device({ storage: { 'kusoge.water.save': '{"level":3,"best":3,"stars":{"2":3}}', 'kusoge.drop.best': '50', 'kobo.nick': 'me', 'kobo.mtime': '{"kusoge.water.save":500}' } });
  const p = await A.open({ sync: { 'kusoge.water.save': 'newest', 'kusoge.drop.best': 'max' }, path: '/water/' });
  const g = await p.K.ensureGuest(); await w.clock.tick(100);
  await p.K.submitScores(); ok(w.server.docs['kusogeRanks/' + g.uid], 'guest rank row');
  const states = []; p.K.onChange(s => states.push(s));
  await p.K.linkGoogle(); await w.clock.tick(2000);
  eq(p.K.me(), 'gOld');
  const v = p.get('kusoge.water.save');
  eq(v.best, 8, 'cloud best kept'); deep(v.stars, { 1: 1, 2: 3 }, 'stars merged'); eq(v.level, 3, 'level: this device is newer (merged by time, not cloud-wins)');
  eq(p.get('kusoge.drop.best'), 900);
  deep(remoteVal(w.server, 'gOld', 'kusoge.water.save').stars, { 1: 1, 2: 3 });
  ok(!w.server.docs['kusogeRanks/' + g.uid], 'abandoned guest rank row removed');
  ok(states.some(s => s.merged), 'merged state emitted');
});

// ================================================================= i18n, http
test('UI strings go through KoboI18n (English dictionary is registered)', async () => {
  const w = world(), A = w.device({});
  const p = await A.open({ lang: 'en', path: '/' });
  const d = p.ctx.KoboI18n.dict;
  for (const k of ['Googleでログイン', 'ログアウト', '別の端末の進行があります', '再読み込み', '{name} さん：全ゲームの記録をクラウドに自動保存しています。', 'ログイン機能を読み込み中…'])
    ok(d[k] && !/[぀-ヿ一-鿿]/.test(d[k]), 'en for ' + k);
  // every Japanese string literal in the code (not comments) has an English entry
  const code = SRC.cloud.split('\n').filter(l => !/^\s*\/\//.test(l)).map(l => l.replace(/\s\/\/ .*$/, '')).join('\n');
  const lits = [...code.matchAll(/'((?:[^'\\\n]|\\.)*)'/g)].map(m => m[1]).filter(x => /[぀-ヿ一-鿿]/.test(x));
  ok(lits.length > 10, 'found literals');
  for (const x of lits) ok(d[x] != null, 'no English for: ' + x);
});
test('http pages stay offline (as before) unless KOBO_CLOUD_OPTS.localhost is set on localhost', async () => {
  const w = world();
  const p = await w.device({ user: G1 }).open({ protocol: 'http:', hostname: 'localhost', sync: { 'kusoge.drop.best': 'max' } });
  eq(await p.K.ready(), false);
  const q = await w.device({ user: G1 }).open({ protocol: 'http:', hostname: 'localhost', cloudOpts: { localhost: true }, sync: { 'kusoge.drop.best': 'max' } });
  eq(await q.K.ready(), true);
  const r = await w.device({ user: G1 }).open({ protocol: 'http:', hostname: 'example.com', cloudOpts: { localhost: true } });
  eq(await r.K.ready(), false);
});

run('cloud (P1-5)');
