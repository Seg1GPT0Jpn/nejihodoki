// ブラウザの中に差し込むもの：計測（WebGL の描画回数、早い時期のエラー）と、Firebase compat SDK の偽物
'use strict';

// どのページにも最初に入れるスクリプト（addInitScript）
function instrumentScript() {
  return `(() => {
  if (window.__kbt) return;
  const K = window.__kbt = { draws: 0, firstDrawAt: 0, t0: performance.now(), glContexts: 0, glFailed: 0 };
  const wrap = proto => {
    if (!proto) return;
    for (const m of ['drawArrays', 'drawElements', 'drawArraysInstanced', 'drawElementsInstanced', 'drawArraysInstancedANGLE', 'drawElementsInstancedANGLE']) {
      const o = proto[m]; if (typeof o !== 'function') continue;
      proto[m] = function () { if (!K.draws) K.firstDrawAt = performance.now() - K.t0; K.draws++; return o.apply(this, arguments); };
    }
  };
  try { wrap(window.WebGLRenderingContext && WebGLRenderingContext.prototype); wrap(window.WebGL2RenderingContext && WebGL2RenderingContext.prototype); } catch (e) {}
  try {
    const gc = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type) {
      const c = gc.apply(this, arguments);
      if (/webgl/i.test(type)) {
        if (c) K.glContexts++; else K.glFailed++;
      }
      return c;
    };
  } catch (e) {}
})();`;
}

// 偽の Firebase（app/auth/firestore の compat API のうち、cloud.js と neji が使う部分だけ）。
// 「クラウド」の中身は sessionStorage['__kbt.fs'] に置き、再読み込みしても残る。
// 初期値は window.__kbtFsInit（テストが addInitScript で入れる）。
function fakeFirebaseSdk() {
  return `(() => {
  if (window.firebase && window.firebase.__fake) return;
  const SKEY = '__kbt.fs';
  const load = () => { try { return JSON.parse(sessionStorage.getItem(SKEY) || 'null'); } catch (e) { return null; } };
  let S = load();
  if (!S) S = { docs: (window.__kbtFsInit && window.__kbtFsInit.docs) || {}, writes: [], reads: 0, user: (window.__kbtFsInit && 'user' in window.__kbtFsInit) ? window.__kbtFsInit.user : { uid: 'kbt-user', displayName: 'Tester', isAnonymous: false } };
  const persist = () => { try { sessionStorage.setItem(SKEY, JSON.stringify(S)); } catch (e) {} };
  persist();
  window.__kbtFs = { get state() { return S; } };
  const clone = v => v === undefined ? undefined : JSON.parse(JSON.stringify(v));
  const SERVER_TS = { __kbtServerTs: 1 };
  const resolveFV = v => {
    if (v && v.__kbtServerTs) return Date.now();
    if (Array.isArray(v)) return v.map(resolveFV);
    if (v && typeof v === 'object') { const o = {}; for (const k in v) o[k] = resolveFV(v[k]); return o; }
    return v;
  };
  const deepMerge = (a, b) => {
    const out = Object.assign({}, a || {});
    for (const k in b) {
      const bv = b[k];
      if (bv && bv.__kbtInc != null) out[k] = (Number(out[k]) || 0) + bv.__kbtInc;
      else if (bv && typeof bv === 'object' && !Array.isArray(bv) && out[k] && typeof out[k] === 'object' && !Array.isArray(out[k])) out[k] = deepMerge(out[k], bv);
      else out[k] = resolveFV(bv);
    }
    return out;
  };
  const snap = (path, data) => ({ id: path.split('/').pop(), exists: data !== undefined, data: () => clone(data), get: f => data && data[f], ref: { path } });
  function docRef(path) {
    return {
      id: path.split('/').pop(), path,
      collection: name => collRef(path + '/' + name),
      get() { S.reads++; persist(); return Promise.resolve(snap(path, S.docs[path])); },
      set(data, opt) { const d = (opt && opt.merge) ? deepMerge(S.docs[path], data) : deepMerge({}, data); S.docs[path] = d; S.writes.push({ op: 'set', path, merge: !!(opt && opt.merge), at: Date.now(), data: clone(resolveFV(data)) }); persist(); return Promise.resolve(); },
      update(data) { if (S.docs[path] === undefined) return Promise.reject(Object.assign(new Error('not-found'), { code: 'not-found' })); return this.set(data, { merge: true }); },
      delete() { delete S.docs[path]; S.writes.push({ op: 'delete', path, at: Date.now() }); persist(); return Promise.resolve(); },
      onSnapshot(cb) { setTimeout(() => cb(snap(path, S.docs[path])), 0); return () => {}; },
    };
  }
  function collRef(path, lim) {
    const q = {
      id: path.split('/').pop(), path,
      doc: id => docRef(path + '/' + (id || Math.random().toString(36).slice(2))),
      add(data) { const r = q.doc(); return r.set(data).then(() => r); },
      limit: n => collRef(path, n), where: () => q, orderBy: () => q, startAfter: () => q,
      get() {
        const pre = path + '/';
        let docs = Object.keys(S.docs).filter(p => p.startsWith(pre) && !p.slice(pre.length).includes('/')).map(p => snap(p, S.docs[p]));
        if (lim) docs = docs.slice(0, lim);
        S.reads += Math.max(1, docs.length); persist();
        return Promise.resolve({ docs, size: docs.length, empty: !docs.length, forEach: f => docs.forEach(f) });
      },
      onSnapshot(cb) { q.get().then(cb); return () => {}; },
    };
    return q;
  }
  const authListeners = [];
  const auth = {
    get currentUser() { return S.user; },
    onAuthStateChanged(cb) { authListeners.push(cb); setTimeout(() => cb(S.user), 0); return () => {}; },
    signInAnonymously() { S.user = { uid: 'kbt-anon', isAnonymous: true, displayName: '' }; persist(); authListeners.forEach(f => f(S.user)); return Promise.resolve({ user: S.user }); },
    signInWithPopup() { return Promise.reject(Object.assign(new Error('popup'), { code: 'auth/popup-closed-by-user' })); },
    signInWithRedirect() { return Promise.resolve(); },
    getRedirectResult() { return Promise.resolve({ user: null }); },
    signOut() { S.user = null; persist(); authListeners.forEach(f => f(null)); return Promise.resolve(); },
    setPersistence() { return Promise.resolve(); },
  };
  const db = { collection: name => collRef(name), doc: p => docRef(p), enablePersistence: () => Promise.resolve(), settings() {} };
  const apps = [];
  const fb = {
    __fake: true, apps, SDK_VERSION: '10.12.2-fake',
    initializeApp(cfg, name) { const a = { name: name || '[DEFAULT]', options: cfg, auth: () => auth, firestore: () => db, database: () => fb.database() }; apps.push(a); return a; },
    app: () => apps[0],
    auth: () => auth,
    firestore: () => db,
    // RTDB はオフラインのテストでは使わない（使われたら分かるように失敗させる）
    database: () => { throw Object.assign(new Error('fake firebase: database() is not available offline'), { code: 'kbt/no-rtdb' }); },
  };
  fb.auth.GoogleAuthProvider = function () {};
  fb.firestore.FieldValue = { serverTimestamp: () => SERVER_TS, increment: n => ({ __kbtInc: n }), delete: () => undefined };
  window.firebase = fb;
})();`;
}

module.exports = { instrumentScript, fakeFirebaseSdk };
