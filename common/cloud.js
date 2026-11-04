// ひまつぶし工房：全ゲーム共通のログインとクラウド同期（Firebase Auth + Firestore）
// 使い方（各ゲームの最後）:
//   <script src="../firebase-config.js"></script>
//   <script src="../common/cloud.js"></script>
//   <script>KoboCloud.sync({ 'kusoge.blocks.best': 'max' });</script>
// 同期のしかた: 'max' = 数値の大きいほう / 'newest' = 最後に保存したほう / { merge(localStr, remoteStr, ctx) → str } = 関数でマージ。
//   'newest' のキーは、登録簿（common/games.js + common/platform.js の KoboPlatform.syncMap()）にフィールドごとのマージがあれば、
//   それを使う（R4）。登録簿はページが読み込んでいなければ、このファイルと同じフォルダから読み込む。読めなければ今までどおり。
//   プラットフォームのキー（kobo.history / kobo.xp / kobo.audio など。KoboPlatform.PLATFORM_SYNC）も、登録簿があれば同期する。
// 記録は Firestore の nejiUsers/{uid} の games フィールドに入る（ネジほどきと同じ文書。ルールの変更は不要）。
//   games['kusoge~blocks~best'] = { v: 文字列, t: 端末で変えた時刻 }。削除は v: null（トゥームストーン。R3）。
//   30日より古いトゥームストーンは、端末とクラウドの両方で消えているときだけ片付ける。
// 端末だけのキー：kobo.mtime（キーごとの変えた時刻。値がなく時刻だけあるのは削除のしるし）、kobo.syncedUid、
//   kobo.rankLegacy（kusogeRanks に最後に送った内容 { uid, sig }）。
// 書き込みを減らす（R2）：
//   nejiUsers への push は、変わったキーだけを、前の push から30秒以上あけてまとめて送る（静かなあとの最初の変化は2秒後）。
//   ページを隠したとき（visibilitychange:hidden / pagehide）はすぐ送る。値が同じなら送らない。
//   kusogeRanks は、送る内容（名前とスコア）が変わったときだけ、60秒に1回まで。
// 再読み込み（R14）：reloadOnNewer のページで別の端末の進行を取り込むのは、遊んでいないとき（KoboGame.isIdle()、
//   KoboGame がなければ「ページを開いてからまだ触っていない」）だけ。遊んでいる最中なら端末の保存は書き換えず、
//   トーストで知らせる（次に開いたときに取り込まれる）。
// 認証：KoboCloud.user() → { uid, isAnonymous, name } | null。ensureGuest() は既定のアプリで匿名ログイン。
//   linkGoogle() は匿名のアカウントを Google につなぐ（uid はそのまま）。そのGoogleアカウントがすでに使われていたら、
//   そちらでログインし直して端末の記録をマージで送る。ゲストの nejiUsers への同期はしない（書き込みの節約）。
// 開発用：window.KOBO_CLOUD_OPTS = { localhost: true（http://localhost でも動かす）, guestSync: true（ゲストも同期）,
//   registry: false（登録簿を読み込まない） } を cloud.js より前に置く。
// ログインは同じサイトのどのページでも共有される。ボタンはトップページ（KoboCloud.mountLogin）にある。
(function () {
  'use strict';
  const V = '10.12.2', BASE = 'https://cdn.jsdelivr.net/npm/firebase@' + V + '/';
  const MT = 'kobo.mtime', SYNCED = 'kobo.syncedUid', RANK_SENT = 'kobo.rankLegacy';
  const PUSH_MIN = 30000, PUSH_DEBOUNCE = 2000, PUSH_MAX_WAIT = 5000, RETRY = 60000;
  const RANK_MIN = 60000, RANK_DEBOUNCE = 3000;
  const TOMB_TTL = 30 * 86400000;
  const OPTS = Object.assign({}, window.KOBO_CLOUD_OPTS || {});
  let auth = null, db = null, user = null, readyP = null;
  const tracked = {}; // key -> 'max' | 'newest' | { merge } | function
  const listeners = [];
  let applying = false, reloadOnNewer = false;
  let pulledUid = null, pulling = null, firstHereAtPull = false, linkMerge = false;
  let remote = {};     // nejiUsers/{uid}.games as last seen (pull or our own pushes), decoded keys
  const removeRemote = {}; // expired tombstones to delete from the cloud on the next push
  let pushTimer = 0, firstChangeAt = 0, lastPushAt = 0, chain = Promise.resolve();
  let rankTimer = 0, rankAt = 0, lastRankAt = 0;
  let touched = false, pendingToast = null;

  // ---- i18n（KoboI18n がなければ日本語のまま）
  const I = window.KoboI18n;
  const fill = (s, v) => (v ? String(s).replace(/\{(\w+)\}/g, (m, k) => (k in v ? v[k] : m)) : s);
  const T = (s, v) => (I && I.t ? I.t(s, v) : fill(s, v));
  if (I && I.add) I.add({ en: {
    'Googleでログイン': 'Sign in with Google',
    'ログアウト': 'Sign out',
    'ニックネーム（ランキングに表示）': 'Nickname (shown in the rankings)',
    '1〜12文字': '1–12 characters',
    '登録': 'Save',
    '「{n}」で登録しました。ランキングに記録が載ります。': 'Saved as "{n}". Your records will appear in the rankings.',
    'ニックネームを1文字以上入れてください。': 'Please enter a nickname of at least 1 character.',
    'ランキングは準備中です（管理者の設定待ち）。ニックネームはこの端末に保存しました。': 'Rankings are not ready yet (waiting for admin setup). Your nickname was saved on this device.',
    '登録できませんでした（{n}）': 'Could not save ({n})',
    '同期できませんでした（{n}）。通信状態を確認してください。': 'Could not sync ({n}). Please check your connection.',
    '{name} さん：全ゲームの記録をクラウドに自動保存しています。（同期済み）': '{name}: records for all games are saved to the cloud automatically. (synced)',
    '{name} さん：全ゲームの記録をクラウドに自動保存しています。': '{name}: records for all games are saved to the cloud automatically.',
    'ログイン中': 'Signed in',
    'Googleでログインすると、全ゲームの記録をどの端末でも引き継げます。': 'Sign in with Google to carry your records for all games over to any device.',
    'ログイン機能を読み込み中…': 'Loading sign-in…',
    'このGoogleアカウントの記録と、この端末の記録をまとめました。': 'Merged the records of this Google account with the records on this device.',
    '別の端末の進行があります': 'There is newer progress from another device',
    '再読み込み': 'Reload',
    'とじる': 'Close',
  } });

  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { applying = true; localStorage.setItem(k, v); } catch (e) {} finally { applying = false; } },
    del(k) { try { applying = true; localStorage.removeItem(k); } catch (e) {} finally { applying = false; } },
  };
  const mtimes = () => { try { const o = JSON.parse(ls.get(MT) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } };
  const saveMtimes = m => ls.set(MT, JSON.stringify(m));
  const enc = k => k.replace(/\./g, '~');
  const dec = k => k.replace(/~/g, '.');
  const now = () => Date.now();

  // ---- remember when tracked keys change (set and remove), then push / rank later
  function changed(k) {
    const m = mtimes(); m[k] = now(); saveMtimes(m);
    schedulePush(); scheduleRank();
  }
  try {
    const P = Storage.prototype, origSet = P.setItem, origRemove = P.removeItem;
    P.setItem = function (k, v) {
      const watch = !applying && this === window.localStorage && tracked[k];
      const before = watch ? origGet(this, k) : null;
      origSet.call(this, k, v);
      if (watch && before !== String(v)) changed(k); // the same value again (raft every 4 s) is not a change (R2)
    };
    P.removeItem = function (k) {
      const watch = !applying && this === window.localStorage && tracked[k];
      const before = watch ? origGet(this, k) : null;
      origRemove.call(this, k);
      if (watch && before != null) changed(k); // a tombstone (R3)
    };
  } catch (e) {}
  function origGet(s, k) { try { return Storage.prototype.getItem.call(s, k); } catch (e) { return null; } }

  // ---- loading
  function load(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = rej; document.head.appendChild(s); });
  }
  const SELF = (() => {
    try {
      const c = document.currentScript && document.currentScript.src;
      if (c) return c;
      const s = document.querySelector && document.querySelector('script[src*="common/cloud.js"]');
      return s ? s.src : '';
    } catch (e) { return ''; }
  })();
  // the registry gives per-field merges (R4); pages that don't load it yet get it from here. Failing is fine (old behavior)
  function loadRegistry() {
    if (OPTS.registry === false || !SELF) return Promise.resolve(false);
    const dir = SELF.replace(/[^/]*$/, '');
    return (window.KOBO_REGISTRY ? Promise.resolve() : load(dir + 'games.js'))
      .then(() => (window.KoboPlatform ? null : load(dir + 'platform.js')))
      .then(() => (window.KoboRank ? null : load(dir + 'rank.js').catch(() => null)))
      .then(() => { regCache = null; addPlatformKeys(); return true; })
      .catch(() => false);
  }
  function allowed() {
    if (/^https:$/.test(location.protocol)) return true;
    return !!OPTS.localhost && /^http:$/.test(location.protocol) && /^(localhost|127\.0\.0\.1)$/.test(location.hostname);
  }
  function init() {
    if (readyP) return readyP;
    const cfg = window.NEJI_FIREBASE;
    if (!cfg || !allowed()) return (readyP = Promise.resolve(false));
    const fb = (window.firebase && firebase.apps ? Promise.resolve() : load(BASE + 'firebase-app-compat.js'))
      .then(() => Promise.all([
        firebase.auth ? null : load(BASE + 'firebase-auth-compat.js'),
        firebase.firestore ? null : load(BASE + 'firebase-firestore-compat.js'),
      ]));
    readyP = Promise.all([fb, loadRegistry()])
      .then(() => {
        if (!firebase.apps.length) firebase.initializeApp(cfg);
        auth = firebase.auth(); db = firebase.firestore();
        auth.onAuthStateChanged(onAuth);
        if (auth.getRedirectResult) auth.getRedirectResult().then(r => { if (r && r.operationType === 'link' && r.user) afterLink(r.user); }).catch(e => linkFailed(e));
        return true;
      })
      .catch(e => { console.warn('KoboCloud', e); return false; });
    return readyP;
  }
  function onAuth(u) {
    const prev = user && user.uid;
    if (u && prev === u.uid) { user = u; emit(); return; } // the same account again (ensureGuest + the auth callback, linking)
    user = u;
    if (!u || u.uid !== prev) resetSession();
    emit();
    if (u) { if (canSync()) pull(); pullNick(); }
  }
  function resetSession() {
    pulledUid = null; remote = {}; firstHereAtPull = false;
    for (const k of Object.keys(removeRemote)) delete removeRemote[k];
    clearTimeout(pushTimer); pushTimer = 0; firstChangeAt = 0;
    clearTimeout(rankTimer); rankTimer = 0;
  }
  const canSync = () => !!(user && db && (!user.isAnonymous || OPTS.guestSync));
  function emit(extra) { const s = state(extra); listeners.forEach(f => { try { f(s); } catch (e) {} }); }
  function state(extra) {
    const real = user && !user.isAnonymous;
    return Object.assign({ configured: !!window.NEJI_FIREBASE, ready: !!auth, nick: nick(),
      user: real ? { name: user.displayName || '', uid: user.uid } : null,
      guest: user && user.isAnonymous ? { uid: user.uid } : null }, extra || {});
  }
  const userInfo = () => (user ? { uid: user.uid, isAnonymous: !!user.isAnonymous, name: user.displayName || '' } : null);

  // ---- merge rules
  let regCache = null;
  function registryRules() {
    if (regCache) return regCache;
    const P = window.KoboPlatform;
    try { regCache = (P && P.syncMap && window.KOBO_REGISTRY) ? P.syncMap() : {}; } catch (e) { regCache = {}; }
    return regCache;
  }
  function addPlatformKeys() {
    const P = window.KoboPlatform; if (!P || !P.PLATFORM_SYNC) return [];
    const rules = registryRules(), added = [];
    for (const k of Object.keys(P.PLATFORM_SYNC)) if (!tracked[k]) { tracked[k] = rules[k] || 'newest'; added.push(k); }
    return added;
  }
  // { kind: 'max' | 'newest' | 'fn', fn }
  function ruleFor(k) {
    const own = tracked[k];
    if (typeof own === 'function') return { kind: 'fn', fn: own };
    if (own && typeof own === 'object' && typeof own.merge === 'function') return { kind: 'fn', fn: own.merge };
    if (own === 'max') return { kind: 'max' };
    const r = registryRules()[k];
    if (r && typeof r === 'object' && typeof r.merge === 'function') return { kind: 'fn', fn: r.merge };
    if (typeof r === 'function') return { kind: 'fn', fn: r };
    return { kind: 'newest' };
  }

  // entries: { v: string | null, t } (v null = deleted). null = nothing known
  function localEntry(k) {
    const v = ls.get(k), t = Number(mtimes()[k]) || 0;
    if (v == null) return t ? { v: null, t } : null;
    return { v, t };
  }
  function remoteEntry(e) {
    if (!e || typeof e !== 'object') return null;
    const t = Number(e.t) || 0;
    if (e.v === null) return { v: null, t };
    if (e.v === undefined) return null;
    return { v: typeof e.v === 'string' ? e.v : JSON.stringify(e.v), t };
  }
  // l = this device, r = cloud. firstHere: the first sync of this account on this device (a saved run in the cloud wins)
  function mergeEntries(rule, l, r, firstHere) {
    if (!l) return r; if (!r) return l;
    const lt = l.t || 0, rt = r.t || 0;
    if (l.v == null && r.v == null) return lt >= rt ? l : r;
    if (l.v == null || r.v == null) {
      if (firstHere && r.v != null) return r;
      const tomb = l.v == null ? l : r, val = tomb === l ? r : l;
      return (tomb.t || 0) >= (val.t || 0) ? tomb : val; // deleted later than saved → stays deleted (R3)
    }
    if (rule.kind === 'max') {
      try { const na = Number(JSON.parse(l.v)), nb = Number(JSON.parse(r.v)); return nb > na ? r : l; } catch (e) { return l; }
    }
    if (rule.kind === 'fn') {
      let m;
      try { m = rule.fn(l.v, r.v, { localT: firstHere ? -1 : lt, remoteT: rt, now: now() }); } catch (e) { m = undefined; }
      if (typeof m === 'string') return { v: m, t: Math.max(lt, rt) };
    }
    if (firstHere) return r;
    return rt > lt ? r : l;
  }
  const expired = e => !!e && e.v == null && (e.t || 0) < now() - TOMB_TTL;

  // write a merged value into this device (cloud.js's own writes don't count as changes)
  function applyLocal(k, e) {
    const m = mtimes();
    if (e.v == null || expired(e)) { ls.del(k); if (expired(e)) delete m[k]; else m[k] = e.t; }
    else {
      ls.set(k, e.v); m[k] = e.t || now();
      // the legacy sound flag: audio.js would undo cloud settings if kusoge.sound disagreed
      if (k === 'kobo.audio') { try { const a = JSON.parse(e.v); if (a && typeof a === 'object') ls.set('kusoge.sound', a.mute ? '0' : '1'); } catch (x) {} }
    }
    saveMtimes(m);
    if (k === 'kobo.theme') { try { window.KoboPlatform.theme.apply(); } catch (x) {} }
  }

  // merge keys with the last seen cloud copy. Returns which keys changed here and whether the cloud needs a push
  function reconcile(keys, firstHere, gate) {
    const changes = [];
    let push = false;
    const m = mtimes();
    let mDirty = false;
    for (const k of keys) {
      const rule = ruleFor(k), l = localEntry(k), r = remote[k] || null;
      const e = mergeEntries(rule, l, r, firstHere);
      if (!e) continue;
      if (expired(e)) {
        // both sides agree it's deleted and it's old: forget it
        if (r) { removeRemote[k] = 1; push = true; }
        if (l) { if (l.v != null) ls.del(k); delete m[k]; mDirty = true; }
        continue;
      }
      const lv = l ? l.v : null;
      if (e.v !== lv) changes.push({ k, e, rule });
      if (r ? r.v !== e.v : e.v != null) push = true;
    }
    if (mDirty) saveMtimes(m);
    const reloading = changes.filter(c => c.rule.kind !== 'max');
    let deferred = [];
    if (gate && reloadOnNewer && reloading.length && !idle()) deferred = reloading.map(c => c.k);
    for (const c of changes) if (!deferred.includes(c.k)) applyLocal(c.k, c.e);
    return { changes, reloading: reloading.filter(c => !deferred.includes(c.k)), deferred, push };
  }

  async function pull() {
    if (!canSync() || !Object.keys(tracked).length) return;
    if (pulling) return pulling;
    const uid = user.uid;
    pulling = (async () => {
      try {
        const snap = await db.collection('nejiUsers').doc(uid).get();
        if (!user || user.uid !== uid) return;
        const games = (snap.exists && snap.data().games) || {};
        remote = {};
        for (const [ek, ev] of Object.entries(games)) { const e = remoteEntry(ev); if (e) remote[dec(ek)] = e; }
        // first sync of this account on this device: the cloud copy of a saved run wins,
        // so a fresh run started here before logging in never overwrites real progress (not after linking a guest: merge)
        const firstHere = !linkMerge && ls.get(SYNCED) !== uid;
        linkMerge = false;
        firstHereAtPull = firstHere;
        const res = reconcile(Object.keys(tracked), firstHere, true);
        pulledUid = uid;
        ls.set(SYNCED, uid);
        if (res.push || firstHere) await flush({ initial: true, first: firstHere });
        await pullNick();
        submitScores().catch(e => console.warn('rank', e));
        emit({ synced: now(), pending: res.deferred.length ? res.deferred : undefined });
        if (res.deferred.length) showPending();
        else if (res.reloading.length && reloadOnNewer && !sessionStorage.getItem('kobo.reloaded.' + location.pathname)) {
          sessionStorage.setItem('kobo.reloaded.' + location.pathname, '1');
          location.reload();
        }
      } catch (e) { console.warn('KoboCloud pull', e); emit({ error: (e && e.code) || 'error' }); }
    })();
    try { return await pulling; } finally { pulling = null; }
  }

  // ---- idle (R14)
  function idle() {
    const G = window.KoboGame;
    try {
      if (G && typeof G.isIdle === 'function') {
        const info = typeof G.info === 'function' ? G.info() : null;
        if (!info || info.id) return !!G.isIdle();
      }
    } catch (e) {}
    return !touched; // no game hooks: reloading is harmless only if the player hasn't touched the page yet
  }
  try {
    const mark = () => { touched = true; };
    for (const ev of ['pointerdown', 'keydown', 'touchstart']) window.addEventListener(ev, mark, { capture: true, passive: true });
  } catch (e) {}
  function showPending() {
    if (pendingToast || typeof document === 'undefined' || !document.body || !document.createElement) return;
    try {
      const box = document.createElement('div');
      box.className = 'kc-pending'; box.setAttribute('role', 'status');
      box.style.cssText = 'position:fixed;left:50%;transform:translateX(-50%);bottom:calc(12px + env(safe-area-inset-bottom,0px));z-index:2147483000;' +
        'max-width:calc(100% - 24px);box-sizing:border-box;display:flex;gap:10px;align-items:center;padding:8px 8px 8px 14px;border-radius:14px;' +
        'background:var(--kb-surface,#263744);color:var(--kb-ink,#eef2f4);box-shadow:0 8px 24px rgba(0,0,0,.4);font:600 14px/1.35 system-ui,sans-serif';
      const msg = document.createElement('span'); msg.textContent = T('別の端末の進行があります');
      const b = document.createElement('button'); b.type = 'button'; b.textContent = T('再読み込み');
      b.style.cssText = 'min-height:44px;min-width:44px;padding:0 14px;border:0;border-radius:10px;font:inherit;cursor:pointer;' +
        'background:var(--kb-accent,#f2b33d);color:var(--kb-accent-ink,#2b1d05)';
      b.onclick = () => location.reload();
      const x = document.createElement('button'); x.type = 'button'; x.textContent = '×'; x.setAttribute('aria-label', T('とじる'));
      x.style.cssText = 'min-height:44px;min-width:44px;border:0;background:transparent;color:inherit;font:inherit;font-size:20px;cursor:pointer';
      x.onclick = () => box.remove();
      box.append(msg, b, x);
      document.body.appendChild(box);
      pendingToast = box;
    } catch (e) {}
  }

  // ---- push (R2): only what differs from the cloud, at most every 30 s, right away when the page is hidden
  function schedulePush() {
    if (!canSync() || pulledUid !== user.uid) return; // the next pull merges and pushes these
    const t = now(), earliest = lastPushAt + PUSH_MIN;
    let at;
    if (t >= earliest) {
      if (!firstChangeAt) firstChangeAt = t;
      at = Math.min(t + PUSH_DEBOUNCE, firstChangeAt + PUSH_MAX_WAIT);
    } else {
      if (pushTimer) return; // already waiting for the end of the 30 s window
      at = earliest;
    }
    clearTimeout(pushTimer);
    pushTimer = setTimeout(() => { pushTimer = 0; flush().catch(() => {}); }, Math.max(0, at - t));
  }
  // what the cloud should hold now: this device merged with the last seen cloud copy (never older than what we saw)
  function outgoing() {
    const games = {}, next = {};
    let n = 0;
    for (const k of Object.keys(tracked)) {
      if (removeRemote[k]) continue;
      const r = remote[k] || null, e = mergeEntries(ruleFor(k), localEntry(k), r, false);
      if (!e || expired(e)) { if (r && expired(e)) { removeRemote[k] = 1; } continue; }
      if (r ? r.v === e.v : e.v == null) continue;
      games[enc(k)] = { v: e.v, t: e.t || 0 }; next[k] = { v: e.v, t: e.t || 0 }; n++;
    }
    const del = Object.keys(removeRemote);
    if (del.length) {
      const FV = firebase.firestore && firebase.firestore.FieldValue;
      for (const k of del) { games[enc(k)] = FV && FV.delete ? FV.delete() : null; n++; }
    }
    return { games, next, del, n };
  }
  // one push at a time (each one compares with what the previous one wrote)
  function flush(o) {
    o = o || {};
    if (!o.initial) { clearTimeout(pushTimer); pushTimer = 0; firstChangeAt = 0; }
    const p = chain.then(() => doFlush(o));
    chain = p.catch(() => {});
    return p;
  }
  async function doFlush(o) {
    if (!canSync() || pulledUid !== user.uid) return;
    const out = outgoing();
    const uid = user.uid;
    // the first sync of an account on a device marks the account as active even when nothing differs (once per device)
    if (!out.n) { if (o.first) await db.collection('nejiUsers').doc(uid).set({ updatedAt: now() }, { merge: true }); return; }
    if (!o.initial) lastPushAt = now();
    try {
      await db.collection('nejiUsers').doc(uid).set({ games: out.games, updatedAt: now() }, { merge: true });
      if (user && user.uid === uid) {
        Object.assign(remote, out.next);
        for (const k of out.del) { delete remote[k]; delete removeRemote[k]; }
      }
    } catch (e) {
      console.warn('KoboCloud push', e);
      if (!o.initial) { lastPushAt = now() + RETRY - PUSH_MIN; schedulePush(); }
      throw e;
    }
  }
  async function push() { if (canSync() && pulledUid === user.uid) return flush(); }
  function flushNow() {
    if (pushTimer || (canSync() && pulledUid === user.uid && outgoing().n)) flush().catch(() => {});
    if (rankTimer) { clearTimeout(rankTimer); rankTimer = 0; submitScores().catch(() => {}); }
  }
  try {
    document.addEventListener('visibilitychange', () => { if (document.visibilityState === 'hidden') flushNow(); });
    window.addEventListener('pagehide', flushNow);
  } catch (e) {}

  async function login() {
    if (!(await init()) || !auth) return emit({ error: 'unavailable' });
    if (auth.currentUser && auth.currentUser.isAnonymous) return linkGoogle();
    const prov = new firebase.auth.GoogleAuthProvider();
    try { await auth.signInWithPopup(prov); }
    catch (e) {
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) return auth.signInWithRedirect(prov);
      if (e && e.code !== 'auth/popup-closed-by-user' && e.code !== 'auth/cancelled-popup-request') emit({ error: e.code || 'login' });
    }
  }
  // anonymous sign-in on the default app, only when something needs an account (ranking, play counts)
  async function ensureGuest() {
    if (!(await init()) || !auth) return null;
    if (!auth.currentUser) {
      const r = await auth.signInAnonymously();
      const u = (r && r.user) || auth.currentUser;
      if (u && (!user || user.uid !== u.uid)) onAuth(u);
    }
    return userInfo();
  }
  // anonymous → Google, keeping the uid. If that Google account already exists, sign in to it and merge this device's records
  async function linkGoogle() {
    if (!(await init()) || !auth) { emit({ error: 'unavailable' }); return null; }
    const cur = auth.currentUser;
    if (!cur || !cur.isAnonymous) { if (!cur) await login(); return userInfo(); }
    const prov = new firebase.auth.GoogleAuthProvider();
    try {
      const r = await cur.linkWithPopup(prov);
      await afterLink((r && r.user) || auth.currentUser);
    } catch (e) {
      if (e && (e.code === 'auth/popup-blocked' || e.code === 'auth/operation-not-supported-in-this-environment')) { await cur.linkWithRedirect(prov); return userInfo(); }
      await linkFailed(e);
    }
    return userInfo();
  }
  async function afterLink(u) {
    user = u || (auth && auth.currentUser) || user;
    emit();
    if (canSync()) await pull();
    await submitScores().catch(() => {});
  }
  async function linkFailed(e) {
    const code = e && e.code;
    if (!code) return;
    if (code === 'auth/credential-already-in-use' || code === 'auth/email-already-in-use' || code === 'auth/account-exists-with-different-credential') {
      const GP = firebase.auth.GoogleAuthProvider;
      const cred = e.credential || (GP && GP.credentialFromError ? GP.credentialFromError(e) : null);
      const guest = auth.currentUser && auth.currentUser.isAnonymous ? auth.currentUser.uid : null;
      if (guest) await dropGuest(guest);
      linkMerge = true; // the next pull merges by time instead of letting the cloud win
      try {
        if (cred) await auth.signInWithCredential(cred);
        else await auth.signInWithPopup(new GP());
        emit({ merged: true });
      } catch (x) { linkMerge = false; emit({ error: (x && x.code) || 'login' }); }
      return;
    }
    if (code === 'auth/provider-already-linked') { user = auth.currentUser; emit(); return; }
    if (code !== 'auth/popup-closed-by-user' && code !== 'auth/cancelled-popup-request') emit({ error: code });
  }
  // the abandoned guest account's public rank row (and its synced copy, if guests were synced)
  async function dropGuest(uid) {
    try { const s = JSON.parse(ls.get(RANK_SENT) || 'null'); if (s && s.uid === uid) { await db.collection('kusogeRanks').doc(uid).delete(); ls.del(RANK_SENT); } } catch (e) {}
    if (OPTS.guestSync && pulledUid === uid) {
      const ref = db.collection('nejiUsers').doc(uid);
      try { await ref.delete(); } catch (e) { try { await ref.set({ games: {}, updatedAt: now() }); } catch (x) {} }
    }
  }

  // small login widget for the hub page
  function mountLogin(el) {
    if (!el) return;
    el.innerHTML = '<div class="kc-row"><p class="kc-msg"></p><button class="kc-in" hidden></button><button class="kc-out" hidden></button></div>' +
      '<form class="kc-nick" hidden><label for="kc-nick-in"></label><div class="kc-row"><input id="kc-nick-in" maxlength="12" autocomplete="nickname"><button type="submit"></button></div><p class="kc-note"></p></form>';
    const msg = el.querySelector('.kc-msg'), bi = el.querySelector('.kc-in'), bo = el.querySelector('.kc-out');
    const form = el.querySelector('.kc-nick'), nin = el.querySelector('#kc-nick-in'), note = el.querySelector('.kc-note');
    bi.textContent = T('Googleでログイン'); bo.textContent = T('ログアウト');
    form.querySelector('label').textContent = T('ニックネーム（ランキングに表示）');
    nin.placeholder = T('1〜12文字'); form.querySelector('button').textContent = T('登録');
    form.onsubmit = async ev => {
      ev.preventDefault();
      try { const n = await setNickname(nin.value); note.textContent = T('「{n}」で登録しました。ランキングに記録が載ります。', { n }); }
      catch (e) { note.textContent = e.message === 'empty' ? T('ニックネームを1文字以上入れてください。') : (e.code === 'permission-denied' ? T('ランキングは準備中です（管理者の設定待ち）。ニックネームはこの端末に保存しました。') : T('登録できませんでした（{n}）', { n: e.code || e.message })); }
    };
    bi.onclick = login; bo.onclick = () => auth && auth.signOut();
    const draw = s => {
      if (!s.configured) { el.hidden = true; return; }
      el.hidden = false;
      if (s.error) msg.textContent = T('同期できませんでした（{n}）。通信状態を確認してください。', { n: s.error });
      else if (s.user) msg.textContent = (s.synced ? T('{name} さん：全ゲームの記録をクラウドに自動保存しています。（同期済み）', { name: s.user.name || T('ログイン中') })
        : T('{name} さん：全ゲームの記録をクラウドに自動保存しています。', { name: s.user.name || T('ログイン中') }));
      else if (s.ready) msg.textContent = T('Googleでログインすると、全ゲームの記録をどの端末でも引き継げます。');
      else msg.textContent = T('ログイン機能を読み込み中…');
      if (s.merged) note.textContent = T('このGoogleアカウントの記録と、この端末の記録をまとめました。');
      bi.hidden = !s.ready || !!s.user; bo.hidden = !s.user;
      form.hidden = !s.user;
      if (s.user && document.activeElement !== nin && !nin.value) nin.value = s.nick || '';
    };
    listeners.push(draw); draw(state()); init().then(() => draw(state()));
  }

  // ---- ranking: public best scores per game, under a nickname ----
  // kusogeRanks/{uid} = { name, scores: { game: number }, updatedAt }  (readable by everyone)
  // the registry's rankSource (KoboPlatform.rankValue) when it is there; otherwise the same values computed here
  const RANK_SOURCES = {
    neji:    () => Math.max(0, num(ls.get('nejihodoki3d.maxLevel')) - 1),
    blocks:  () => num(ls.get('kusoge.blocks.best')),
    drop:    () => num(ls.get('kusoge.drop.best')),
    raft:    () => num(ls.get('kusoge.raft.best')),
    gates:   () => pick(ls.get('kusoge.gates.save'), ['best', 'bestStage']),
    n59049:  () => num(ls.get('kusoge.n59049.best')),
    water:   () => Math.max(0, pick(ls.get('kusoge.water.save'), ['best', 'level']) - 1),
    parking: () => Math.max(0, pick(ls.get('kusoge.parking.save'), ['best', 'level']) - 1),
    hole:    () => { try { const o = JSON.parse(ls.get('kusoge.hole.save') || '{}'); return Number((o.best && o.best.matchPts) || 0) || 0; } catch (e) { return 0; } },
  };
  function num(v) { try { const n = Number(JSON.parse(v)); return isFinite(n) ? n : 0; } catch (e) { const n = Number(v); return isFinite(n) ? n : 0; } }
  function pick(raw, fields) {
    try {
      const o = JSON.parse(raw); if (!o || typeof o !== 'object') return num(raw);
      for (const f of fields) { const v = o[f]; if (typeof v === 'number') return v; if (v && typeof v === 'object') { const w = v.score ?? v.size ?? v.value; if (typeof w === 'number') return w; } }
    } catch (e) {}
    return 0;
  }
  function rankScores() {
    const scores = {}, P = window.KoboPlatform, R = window.KOBO_REGISTRY;
    if (P && P.rankValue && R && R.games) {
      for (const g of R.games) {
        if (!g.rankSource || (g.flags && g.flags.ranking === false)) continue;
        let v = 0; try { v = P.rankValue(g.id, k => ls.get(k)); } catch (e) {}
        if (v > 0) scores[g.id] = Math.floor(v);
      }
    } else for (const [g, f] of Object.entries(RANK_SOURCES)) { const v = f(); if (v > 0) scores[g] = Math.floor(v); }
    return scores;
  }
  const nick = () => ls.get('kobo.nick') || '';
  function cleanNick(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12); }
  async function setNickname(n) {
    n = cleanNick(n);
    if (!n) throw new Error('empty');
    ls.set('kobo.nick', n);
    if (tracked['kobo.nick']) changed('kobo.nick');
    await submitScores();
    emit();
    return n;
  }
  function rankSig() { return JSON.stringify([nick(), rankScores()]); }
  function rankSent() { try { return JSON.parse(ls.get(RANK_SENT) || 'null'); } catch (e) { return null; } }
  const rankDirty = () => { const s = rankSent(); return !(s && user && s.uid === user.uid && s.sig === rankSig()); };
  function scheduleRank() {
    if (!user || !db || !nick() || !rankDirty()) return;
    const t = now(), at = Math.max(t + RANK_DEBOUNCE, lastRankAt + RANK_MIN);
    if (rankTimer && rankAt <= at) return;
    clearTimeout(rankTimer); rankAt = at;
    rankTimer = setTimeout(() => { rankTimer = 0; submitScores().catch(() => {}); }, at - t);
  }
  // sends only when the name or a score changed since the last send from this device (R2)
  async function submitScores() {
    if (!user || !db || !nick()) return;
    const scores = rankScores(), sig = JSON.stringify([nick(), scores]), s = rankSent(), uid = user.uid;
    if (s && s.uid === uid && s.sig === sig) return;
    clearTimeout(rankTimer); rankTimer = 0;
    lastRankAt = now();
    await db.collection('kusogeRanks').doc(uid).set({ name: nick(), scores, updatedAt: now() });
    ls.set(RANK_SENT, JSON.stringify({ uid, sig }));
  }
  async function loadRanks() {
    if (!(await init()) || !db) throw Object.assign(new Error('unavailable'), { code: 'unavailable' });
    const snap = await db.collection('kusogeRanks').limit(1000).get();
    return snap.docs.map(d => ({ uid: d.id, ...d.data() }));
  }
  // pick up nickname saved in the cloud when logging in on another device
  async function pullNick() {
    if (!user || !db || nick()) return;
    try { const d = await db.collection('kusogeRanks').doc(user.uid).get(); if (d.exists && d.data().name) { ls.set('kobo.nick', d.data().name); emit(); } } catch (e) {}
  }

  function sync(keys, opt) {
    const fresh = [];
    for (const [k, v] of Object.entries(keys || {})) { if (!tracked[k]) fresh.push(k); tracked[k] = v; }
    if (opt && opt.reloadOnNewer) reloadOnNewer = true;
    if (opt && opt.guestSync) OPTS.guestSync = true;
    init();
    if (!user || !canSync()) return;
    if (pulledUid === user.uid) {
      // keys added after the first sync (versus.js adds its stats later): merge with the cloud copy we already read
      if (fresh.length && reconcile(fresh, firstHereAtPull, false).push) schedulePush();
    } else pull();
  }

  window.KoboCloud = {
    sync,
    onChange(f) { listeners.push(f); f(state()); },
    mountLogin, login, logout: () => auth && auth.signOut(), push, pull,
    setNickname, nickname: nick, submitScores, loadRanks, me: () => user ? user.uid : null, ready: init,
    user: userInfo, ensureGuest, linkGoogle, isIdle: idle,
  };
})();
