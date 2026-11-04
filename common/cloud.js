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
        schedulePush(); scheduleRank();
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
        auth.onAuthStateChanged(u => { user = u; emit(); if (u) { pull(); pullNick(); } });
        return true;
      })
      .catch(e => { console.warn('KoboCloud', e); return false; });
    return readyP;
  }
  function emit(extra) { listeners.forEach(f => { try { f(state(extra)); } catch (e) {} }); }
  function state(extra) {
    return Object.assign({ configured: !!window.NEJI_FIREBASE, ready: !!auth, nick: nick(), user: user ? { name: user.displayName || '', uid: user.uid } : null }, extra || {});
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
      await pullNick();
      submitScores().catch(e => console.warn('rank', e));
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
    el.innerHTML = '<div class="kc-row"><p class="kc-msg"></p><button class="kc-in" hidden>Googleでログイン</button><button class="kc-out" hidden>ログアウト</button></div>' +
      '<form class="kc-nick" hidden><label for="kc-nick-in">ニックネーム（ランキングに表示）</label><div class="kc-row"><input id="kc-nick-in" maxlength="12" autocomplete="nickname" placeholder="1〜12文字"><button type="submit">登録</button></div><p class="kc-note"></p></form>';
    const msg = el.querySelector('.kc-msg'), bi = el.querySelector('.kc-in'), bo = el.querySelector('.kc-out');
    const form = el.querySelector('.kc-nick'), nin = el.querySelector('#kc-nick-in'), note = el.querySelector('.kc-note');
    form.onsubmit = async ev => {
      ev.preventDefault();
      try { const n = await setNickname(nin.value); note.textContent = '「' + n + '」で登録しました。ランキングに記録が載ります。'; }
      catch (e) { note.textContent = e.message === 'empty' ? 'ニックネームを1文字以上入れてください。' : (e.code === 'permission-denied' ? 'ランキングは準備中です（管理者の設定待ち）。ニックネームはこの端末に保存しました。' : '登録できませんでした（' + (e.code || e.message) + '）'); }
    };
    bi.onclick = login; bo.onclick = () => auth && auth.signOut();
    const draw = s => {
      if (!s.configured) { el.hidden = true; return; }
      el.hidden = false;
      if (s.error) msg.textContent = '同期できませんでした（' + s.error + '）。通信状態を確認してください。';
      else if (s.user) msg.textContent = (s.user.name || 'ログイン中') + ' さん：全ゲームの記録をクラウドに自動保存しています。' + (s.synced ? '（同期済み）' : '');
      else if (s.ready) msg.textContent = 'Googleでログインすると、全ゲームの記録をどの端末でも引き継げます。';
      else msg.textContent = 'ログイン機能を読み込み中…';
      bi.hidden = !s.ready || !!s.user; bo.hidden = !s.user;
      form.hidden = !s.user;
      if (s.user && document.activeElement !== nin && !nin.value) nin.value = s.nick || '';
    };
    listeners.push(draw); draw(state()); init().then(() => draw(state()));
  }

  // ---- ranking: public best scores per game, under a nickname ----
  // kusogeRanks/{uid} = { name, scores: { game: number }, updatedAt }  (readable by everyone)
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
  const nick = () => ls.get('kobo.nick') || '';
  function cleanNick(n) { return String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12); }
  async function setNickname(n) {
    n = cleanNick(n);
    if (!n) throw new Error('empty');
    ls.set('kobo.nick', n);
    await submitScores();
    emit();
    return n;
  }
  let rankTimer = 0;
  function scheduleRank() { clearTimeout(rankTimer); rankTimer = setTimeout(() => submitScores().catch(() => {}), 2500); }
  async function submitScores() {
    if (!user || !db || !nick()) return;
    const scores = {};
    for (const [g, f] of Object.entries(RANK_SOURCES)) { const v = f(); if (v > 0) scores[g] = Math.floor(v); }
    await db.collection('kusogeRanks').doc(user.uid).set({ name: nick(), scores, updatedAt: Date.now() });
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

  window.KoboCloud = {
    sync(keys, opt) { Object.assign(tracked, keys || {}); if (opt && opt.reloadOnNewer) reloadOnNewer = true; init(); if (user) pull(); },
    onChange(f) { listeners.push(f); f(state()); },
    mountLogin, login, logout: () => auth && auth.signOut(), push, pull,
    setNickname, nickname: nick, submitScores, loadRanks, me: () => user ? user.uid : null, ready: init,
  };
})();
