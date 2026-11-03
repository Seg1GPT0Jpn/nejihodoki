// ひまつぶし工房：全ゲーム共通のログインとクラウド同期（Firebase Auth + Firestore）
// 使い方（各ゲームの最後）:
//   <script src="../firebase-config.js"></script>
//   <script src="../common/cloud.js"></script>
//   <script>KoboCloud.sync({ 'kusoge.blocks.best': 'max' });</script>
// 同期のしかた: 'max' = 数値の大きいほう / 'newest' = 最後に保存したほう。
// 記録は Firestore の nejiUsers/{uid} の games フィールドに入る（ネジほどきと同じ文書。ルールの変更は不要）。
// ログインは同じサイトのどのページでも共有される。ボタンはトップページ（KoboCloud.mountLogin）にある。
(function () {
  'use strict';
  const V = '10.12.2', BASE = 'https://cdn.jsdelivr.net/npm/firebase@' + V + '/';
  const MT = 'kobo.mtime';
  let auth = null, db = null, user = null, readyP = null;
  const tracked = {}; // key -> 'max' | 'newest'
  const listeners = [];
  let pushTimer = 0, applying = false, reloadOnNewer = false;

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const mtimes = () => { try { return JSON.parse(ls.get(MT) || '{}'); } catch (e) { return {}; } };
  const enc = k => k.replace(/\./g, '~');
  const dec = k => k.replace(/~/g, '.');

  // remember when tracked keys change, and push shortly after
  try {
    const orig = Storage.prototype.setItem;
    Storage.prototype.setItem = function (k, v) {
      orig.call(this, k, v);
      if (this === window.localStorage && tracked[k] && !applying) {
        const m = mtimes(); m[k] = Date.now(); orig.call(this, MT, JSON.stringify(m));
        schedulePush();
      }
    };
  } catch (e) {}

  function load(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  function init() {
    if (readyP) return readyP;
    const cfg = window.NEJI_FIREBASE;
    if (!cfg || !/^https:$/.test(location.protocol)) return (readyP = Promise.resolve(false));
    readyP = (window.firebase && firebase.apps ? Promise.resolve() : load(BASE + 'firebase-app-compat.js'))
      .then(() => Promise.all([
        firebase.auth ? null : load(BASE + 'firebase-auth-compat.js'),
        firebase.firestore ? null : load(BASE + 'firebase-firestore-compat.js'),
      ]))
      .then(() => {
        if (!firebase.apps.length) firebase.initializeApp(cfg);
        auth = firebase.auth(); db = firebase.firestore();
        auth.onAuthStateChanged(u => { user = u; emit(); if (u) pull(); });
        return true;
      })
      .catch(e => { console.warn('KoboCloud', e); return false; });
    return readyP;
  }
  function emit(extra) { listeners.forEach(f => { try { f(state(extra)); } catch (e) {} }); }
  function state(extra) {
    return Object.assign({ configured: !!window.NEJI_FIREBASE, ready: !!auth, user: user ? { name: user.displayName || '', uid: user.uid } : null }, extra || {});
  }

  function localEntry(k) { const v = ls.get(k); return v == null ? null : { v, t: mtimes()[k] || 0 }; }
  function better(kind, a, b) { // returns the entry to keep
    if (!a) return b; if (!b) return a;
    if (kind === 'max') { const na = Number(JSON.parse(a.v)), nb = Number(JSON.parse(b.v)); return (nb > na) ? b : a; }
    return (b.t > a.t) ? b : a;
  }
  async function pull() {
    if (!user || !db || !Object.keys(tracked).length) return;
    try {
      const snap = await db.collection('nejiUsers').doc(user.uid).get();
      const remote = (snap.exists && snap.data().games) || {};
      // first sync of this account on this device: the cloud copy of a saved run wins,
      // so a fresh run started here before logging in never overwrites real progress
      const firstHere = ls.get('kobo.syncedUid') !== user.uid;
      let changedNewer = false;
      applying = true;
      for (const [k, kind] of Object.entries(tracked)) {
        const r = remote[enc(k)], l = localEntry(k);
        let keep;
        try { keep = (firstHere && kind === 'newest' && r) ? r : better(kind, l, r); } catch (e) { keep = l || r; }
        if (keep && keep !== l && (!l || keep.v !== l.v)) {
          ls.set(k, keep.v);
          const m = mtimes(); m[k] = keep.t || Date.now(); ls.set(MT, JSON.stringify(m));
          if (kind === 'newest') changedNewer = true;
        }
      }
      applying = false;
      ls.set('kobo.syncedUid', user.uid);
      await push();
      emit({ synced: Date.now() });
      if (changedNewer && reloadOnNewer && !sessionStorage.getItem('kobo.reloaded.' + location.pathname)) {
        sessionStorage.setItem('kobo.reloaded.' + location.pathname, '1');
        location.reload();
      }
    } catch (e) { applying = false; console.warn('KoboCloud pull', e); emit({ error: (e && e.code) || 'error' }); }
  }
  function schedulePush() { clearTimeout(pushTimer); pushTimer = setTimeout(() => push().catch(() => {}), 1500); }
  async function push() {
    if (!user || !db) return;
    const games = {};
    for (const k of Object.keys(tracked)) { const e = localEntry(k); if (e) games[enc(k)] = e; }
    if (!Object.keys(games).length) return;
    await db.collection('nejiUsers').doc(user.uid).set({ games, updatedAt: Date.now() }, { merge: true });
  }

  async function login() {
    if (!(await init()) || !auth) return emit({ error: 'unavailable' });
    const prov = new firebase.auth.GoogleAuthProvider();
    try { await auth.signInWithPopup(prov); }
    catch (e) {
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return auth.signInWithRedirect(prov);
      if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') emit({ error: e.code || 'login' });
    }
  }

  // small login widget for the hub page
  function mountLogin(el) {
    if (!el) return;
    el.innerHTML = '<p class="kc-msg"></p><button class="kc-in" hidden>Googleでログイン</button><button class="kc-out" hidden>ログアウト</button>';
    const msg = el.querySelector('.kc-msg'), bi = el.querySelector('.kc-in'), bo = el.querySelector('.kc-out');
    bi.onclick = login; bo.onclick = () => auth && auth.signOut();
    const draw = s => {
      if (!s.configured) { el.hidden = true; return; }
      el.hidden = false;
      if (s.error) msg.textContent = '同期できませんでした（' + s.error + '）。通信状態を確認してください。';
      else if (s.user) msg.textContent = (s.user.name || 'ログイン中') + ' さん：全ゲームの記録をクラウドに自動保存しています。' + (s.synced ? '（同期済み）' : '');
      else if (s.ready) msg.textContent = 'Googleでログインすると、全ゲームの記録をどの端末でも引き継げます。';
      else msg.textContent = 'ログイン機能を読み込み中…';
      bi.hidden = !s.ready || !!s.user; bo.hidden = !s.user;
    };
    listeners.push(draw); draw(state()); init().then(() => draw(state()));
  }

  window.KoboCloud = {
    sync(keys, opt) { Object.assign(tracked, keys || {}); if (opt && opt.reloadOnNewer) reloadOnNewer = true; init(); if (user) pull(); },
    onChange(f) { listeners.push(f); f(state()); },
    mountLogin, login, logout: () => auth && auth.signOut(), push, pull,
  };
})();
