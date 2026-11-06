// 負荷テスト用：Firebase の compat SDK（firebase.auth() / firebase.firestore()）と同じ呼び方で、エミュレーターの REST に送る小さな代わり。
// 本物のクライアント（common/cloud.js・rank.js・achievements.js）を node の vm の中で、このまま動かすために使う。
// 1回の呼び出しごとに { api, coll, op, ms, ok, code, reads, writes } を metrics に記録する（課金の数え方：get は1件、
// クエリは返した件数（0件でも1）、書き込みは1文書1件）。ルールで拒否されたもの（403）は code: 'permission-denied'。
// SDK の中のキャッシュや再送はまねしない（1回の呼び出し = 1回の REST）。本物の SDK も、オフラインの永続化を使っていなければ同じ数になる。
'use strict';

const SERVER_TIME = { __kbt: 'serverTime' };
const DELETE = { __kbt: 'delete' };
const incr = n => ({ __kbt: 'increment', n });
const isSentinel = v => !!v && typeof v === 'object' && typeof v.__kbt === 'string';

// ---------------------------------------------------------------- 値の変換（Firestore REST の Value）
function enc(v) {
  if (v === null || v === undefined) return { nullValue: null };
  if (typeof v === 'boolean') return { booleanValue: v };
  if (typeof v === 'number') return Number.isInteger(v) ? { integerValue: String(v) } : { doubleValue: v };
  if (typeof v === 'string') return { stringValue: v };
  if (v instanceof Date) return { timestampValue: v.toISOString() };
  if (Array.isArray(v)) return { arrayValue: { values: v.map(enc) } };
  if (typeof v === 'object') return { mapValue: { fields: encFields(v) } };
  throw new Error('cannot encode ' + typeof v);
}
function encFields(o) {
  const f = {};
  for (const [k, v] of Object.entries(o)) if (!isSentinel(v)) f[k] = enc(v);
  return f;
}
const ts = ms => ({ toMillis: () => ms, seconds: Math.floor(ms / 1000), toDate: () => new Date(ms) });
function dec(v) {
  if ('nullValue' in v) return null;
  if ('booleanValue' in v) return v.booleanValue;
  if ('integerValue' in v) return Number(v.integerValue);
  if ('doubleValue' in v) return v.doubleValue;
  if ('stringValue' in v) return v.stringValue;
  if ('timestampValue' in v) return ts(Date.parse(v.timestampValue));
  if ('arrayValue' in v) return (v.arrayValue.values || []).map(dec);
  if ('mapValue' in v) { const o = {}; for (const [k, x] of Object.entries(v.mapValue.fields || {})) o[k] = dec(x); return o; }
  return null;
}
const fp = parts => parts.map(p => '`' + String(p).replace(/[`\\]/g, m => '\\' + m) + '`').join('.');

// set(data, { merge }) → 1 件の Write（update / updateMask / updateTransforms）
function toWrite(name, data, merge) {
  const transforms = [], mask = [];
  (function walk(o, pre) {
    for (const [k, v] of Object.entries(o)) {
      const path = pre.concat([k]);
      if (isSentinel(v)) {
        if (v.__kbt === 'serverTime') transforms.push({ fieldPath: fp(path), setToServerValue: 'REQUEST_TIME' });
        else if (v.__kbt === 'increment') transforms.push({ fieldPath: fp(path), increment: enc(v.n) });
        else if (v.__kbt === 'delete') mask.push(fp(path));
        continue;
      }
      if (merge && v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) && Object.keys(v).length) walk(v, path);
      else if (merge) mask.push(fp(path));
      else if (v && typeof v === 'object' && !Array.isArray(v)) walk(v, path); // transforms nested in a plain set
    }
  })(data, []);
  const w = { update: { name, fields: stripSentinels(data) } };
  if (merge) w.updateMask = { fieldPaths: mask };
  if (transforms.length) w.updateTransforms = transforms;
  return w;
}
function stripSentinels(o) {
  const f = {};
  for (const [k, v] of Object.entries(o)) {
    if (isSentinel(v)) continue;
    f[k] = v && typeof v === 'object' && !Array.isArray(v) && !(v instanceof Date) ? { mapValue: { fields: stripSentinels(v) } } : enc(v);
  }
  return f;
}

// ---------------------------------------------------------------- 計測
class Metrics {
  constructor() { this.ops = []; this.t0 = Date.now(); }
  add(o) { o.at = Date.now() - this.t0; this.ops.push(o); }
}
function errOf(status, body) {
  const msg = body && body.error ? body.error.message || body.error.status : String(body).slice(0, 200);
  const st = body && body.error ? body.error.status : '';
  const code = status === 403 || st === 'PERMISSION_DENIED' ? 'permission-denied'
    : status === 404 ? 'not-found' : st === 'FAILED_PRECONDITION' ? 'failed-precondition' : st === 'INVALID_ARGUMENT' ? 'invalid-argument'
    : status === 429 || st === 'RESOURCE_EXHAUSTED' ? 'resource-exhausted' : status >= 500 ? 'unavailable' : 'unknown';
  return Object.assign(new Error(msg || code), { code, status });
}

// T: emulatorTarget()（rules/rest.js）。who(): 今のユーザー（{ uid, token } | null）
function makeFirestore(T, metrics, who, client) {
  const base = `${T.fsBase}/v1/projects/${T.project}/databases/(default)/documents`;
  const docName = p => `projects/${T.project}/databases/(default)/documents/${p}`;
  const coll = p => p.split('/').filter((x, i) => i % 2 === 0).join('/');
  async function req(api, path, op, method, url, body, count) {
    const u = who(), h = { 'Content-Type': 'application/json' };
    if (u && u.token) h.Authorization = 'Bearer ' + u.token;
    const t = Date.now();
    let status = 0, j = null;
    try {
      const r = await fetch(url, { method, headers: h, body: body === undefined ? undefined : JSON.stringify(body) });
      status = r.status;
      const text = await r.text();
      try { j = JSON.parse(text); } catch (e) { j = text; }
    } catch (e) {
      metrics.add({ api, client, coll: coll(path), path, op, ms: Date.now() - t, ok: false, code: 'network', reads: 0, writes: 0 });
      throw Object.assign(new Error('network: ' + e.message), { code: 'unavailable' });
    }
    const ms = Date.now() - t;
    let ok = status >= 200 && status < 300;
    if (ok && Array.isArray(j) && j.some(x => x && x.error)) { ok = false; const e = j.find(x => x.error); status = e.error.code === 7 ? 403 : 400; j = e; }
    const c = count(ok, j, status);
    const rec = { api, client, coll: coll(path), path, op, ms, ok: ok || (op === 'get' && status === 404), code: ok ? null : errOf(status, j).code, reads: c.reads || 0, writes: c.writes || 0, deletes: c.deletes || 0 };
    if (!rec.ok) { rec.msg = errOf(status, j).message.slice(0, 300); if (process.env.KBT_DEBUG) rec.body = JSON.stringify(body).slice(0, 600); }
    metrics.add(rec);
    if (!rec.ok) throw errOf(status, j);
    return { status, body: j };
  }
  function docSnap(path, body) {
    const data = body && body.fields ? dec({ mapValue: { fields: body.fields } }) : undefined;
    return { id: path.split('/').pop(), exists: data !== undefined, data: () => (data === undefined ? undefined : clone(data)) };
  }
  function clone(d) {
    // keep timestamp objects (toMillis) while copying
    if (Array.isArray(d)) return d.map(clone);
    if (d && typeof d === 'object') { if (typeof d.toMillis === 'function') return d; const o = {}; for (const k of Object.keys(d)) o[k] = clone(d[k]); return o; }
    return d;
  }
  class DocRef {
    constructor(path) { this.path = path; this.id = path.split('/').pop(); }
    collection(name) { return new Query(this.path + '/' + name); }
    async get() {
      const r = await req('firestore', this.path, 'get', 'GET', base + '/' + this.path, undefined, () => ({ reads: 1 })).catch(e => { if (e.code === 'not-found') return { status: 404, body: null }; throw e; });
      return docSnap(this.path, r.status === 404 ? null : r.body);
    }
    async set(data, opt) {
      const w = toWrite(docName(this.path), data, !!(opt && opt.merge));
      await req('firestore', this.path, opt && opt.merge ? 'set-merge' : 'set', 'POST', base + ':commit', { writes: [w] }, ok => ({ writes: 1 }));
    }
    async update(data) { return this.set(data, { merge: true }); }
    async delete() { await req('firestore', this.path, 'delete', 'POST', base + ':commit', { writes: [{ delete: docName(this.path) }] }, () => ({ deletes: 1 })); }
  }
  const OPS = { '==': 'EQUAL', 'in': 'IN', '>': 'GREATER_THAN', '>=': 'GREATER_THAN_OR_EQUAL', '<': 'LESS_THAN', '<=': 'LESS_THAN_OR_EQUAL' };
  class Query {
    constructor(path, q) { this.path = path; this.q = q || { where: [], order: [], limit: 0 }; }
    doc(id) { return new DocRef(this.path + '/' + id); }
    where(f, op, v) { return new Query(this.path, Object.assign({}, this.q, { where: this.q.where.concat([[f, op, v]]) })); }
    orderBy(f, dir) { return new Query(this.path, Object.assign({}, this.q, { order: this.q.order.concat([[f, dir || 'asc']]) })); }
    limit(n) { return new Query(this.path, Object.assign({}, this.q, { limit: n })); }
    async get() {
      const parts = this.path.split('/'), cid = parts.pop(), parent = parts.join('/');
      const sq = { from: [{ collectionId: cid }] };
      const filters = this.q.where.map(([f, op, v]) => ({ fieldFilter: { field: { fieldPath: f }, op: OPS[op], value: enc(v) } }));
      if (filters.length === 1) sq.where = filters[0];
      else if (filters.length > 1) sq.where = { compositeFilter: { op: 'AND', filters } };
      if (this.q.order.length) sq.orderBy = this.q.order.map(([f, d]) => ({ field: { fieldPath: f }, direction: d === 'desc' ? 'DESCENDING' : 'ASCENDING' }));
      if (this.q.limit) sq.limit = this.q.limit;
      const url = base + (parent ? '/' + parent : '') + ':runQuery';
      const r = await req('firestore', this.path + '/*', 'query', 'POST', url, { structuredQuery: sq }, (ok, j) => ({ reads: ok && Array.isArray(j) ? Math.max(1, j.filter(x => x.document).length) : 1 }));
      const docs = (Array.isArray(r.body) ? r.body : []).filter(x => x.document).map(x => docSnap(x.document.name.split('/documents/')[1], x.document));
      return { docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) };
    }
  }
  const db = {
    collection: name => new Query(name),
    doc: p => new DocRef(p),
    terminate: async () => {},
  };
  return db;
}

// ---------------------------------------------------------------- Auth（エミュレーターの identitytoolkit）
async function signUp(T, metrics, body) {
  const t = Date.now();
  const r = await fetch(`${T.authBase}/v1/accounts:signUp?key=${T.apiKey}`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body || { returnSecureToken: true }) });
  const j = await r.json();
  metrics.add({ api: 'auth', coll: 'signUp', path: 'signUp', op: body && body.email ? 'signUp-email' : 'signUp-anon', ms: Date.now() - t, ok: !!j.idToken, code: j.idToken ? null : 'auth', reads: 0, writes: 0 });
  if (!j.idToken) throw new Error('signUp failed: ' + JSON.stringify(j).slice(0, 200));
  return { uid: j.localId, token: j.idToken };
}

// firebase（compat）の代わり。persisted: 前からログインしている人（Google のつもり。メールのアカウントで作る）
function makeFirebase(T, metrics, opt = {}) {
  let cur = opt.persisted || null, appInit = false;
  const listeners = [];
  const mkUser = (u, anon, name) => u && ({ uid: u.uid, isAnonymous: !!anon, displayName: name || '', token: u.token, getIdToken: async () => u.token,
    linkWithPopup: async () => { throw Object.assign(new Error('not in load test'), { code: 'auth/operation-not-supported-in-this-environment' }); } });
  let user = cur ? mkUser(cur, !!cur.anon, cur.name) : null;
  const fire = () => listeners.slice().forEach(f => Promise.resolve().then(() => f(user)));
  const auth = {
    get currentUser() { return user; },
    onAuthStateChanged(cb) { listeners.push(cb); Promise.resolve().then(() => cb(user)); return () => { const i = listeners.indexOf(cb); if (i >= 0) listeners.splice(i, 1); }; },
    async signInAnonymously() { const u = await signUp(T, metrics); user = mkUser(u, true); fire(); return { user }; },
    async getRedirectResult() { return { user: null }; },
    async signOut() { user = null; fire(); },
    async signInWithPopup() { throw Object.assign(new Error('no popup'), { code: 'auth/popup-blocked' }); },
  };
  const db = makeFirestore(T, metrics, () => user, opt.client);
  const firestore = () => db;
  firestore.FieldValue = { serverTimestamp: () => SERVER_TIME, delete: () => DELETE, increment: n => incr(n) };
  const authFn = () => auth;
  authFn.GoogleAuthProvider = function GoogleAuthProvider() {};
  const fb = {
    apps: [],
    initializeApp(cfg) { if (!appInit) { appInit = true; fb.apps.push({ name: '[DEFAULT]', options: cfg }); } return fb.apps[0]; },
    app: () => fb.apps[0],
    auth: authFn,
    firestore,
  };
  return fb;
}

module.exports = { makeFirebase, makeFirestore, signUp, Metrics, SERVER_TIME, DELETE, incr, enc, dec, toWrite };
