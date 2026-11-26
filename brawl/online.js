// おもちゃ大乱闘（brawl）：オンライン1対1（ロビー・部屋・クイックマッチ・試合・もう一度）。Firebase Realtime Database だけを使う（Cloud Functions なし）。
// 試合の中身は brawl/netcode.js（ロックステップ＋ロールバック）と brawl/engine.js。ここは「つなぐ・部屋・画面」の係。
// 画面の外側（キー入力・描画・結果のカード・保存）は brawl/index.html が host として渡す。
// ---------------------------------------------------------------------------------------------------------------------
// RTDB（ルールは database.rules.json の "bw"）：
//   bw/queue/{uid}       = { n: nick, t, h: 生存確認, k: 2, v: NETV, r: 部屋 id, m: [uid…]（部屋を作った人だけ） }
//   bw/codes/{code}      = { h: ホストの uid, r: 部屋 id, t }                      6けたのコード。1つずつ読むだけ（一覧は読めない）
//   bw/rooms/{room}/
//     meta  = { at, h, n: 席の数(2), k: 'q'|'c', v: NETV, inv?: { uid: 1 } }       作るとき1回だけ
//     cfg   = { s: ステージ|'rnd', p: 0..3（ストック3・2・5／じかん3分） }          ホストだけが書く
//     seats = { 0: { u, n, c: おもちゃ, tj, j }, 1: … }                              席。自分の席だけ書ける（おもちゃをえらぶ）
//     on / rd / pg = { uid: 1 / 0|1 / { t, e, w } }                                  いる（切れると消える）／じゅんびOK／往復の時間はかり（ロビー）
//     go    = { g: 何試合目, sd: 種, st: 始まる時刻（サーバー ms）, pl: [uid…]（左・右の順。もう一度のたびに入れかえ）, c: [おもちゃ…], tj: […], sg: ステージ, p }   ホストだけ。g は1ずつ増える
//     in/{uid} = netcode.js の「入力のまとめ」msg（約3フレームに1回、同じ場所を上書き。さいきんの8フレームぶんを入れなおす＝取りこぼしに強い）
//     h/{uid}/{0..7} = { g, f, a, b, fin? }                                         状態の指紋（60フレームごと。fin＝最後の状態）
//     res/{g} = { w: 勝った席(-1=なし), y: ko|time|cap|forfeit|desync|abort, f }       1回だけ書ける（ランキングや点には使わない）
// 通信は、待ち行列にも部屋にもいない状態が20秒続いたら閉じる（goOffline。common/versus.js と同じ）。
(function (root) {
  'use strict';
  const NET = root.BrawlNet, E = root.BrawlEngine;
  if (!NET || !E) return;
  const SDK = 'https://cdn.jsdelivr.net/npm/firebase@10.12.2/';
  const DEBUG = /[?&]debug\b/.test((root.location && root.location.search) || '');
  const qnum = (name, d) => { try { const m = new RegExp('[?&]' + name + '=(-?\\d+(?:\\.\\d+)?)').exec(root.location.search); return DEBUG && m ? +m[1] : d; } catch (e) { return d; } };
  const err = c => Object.assign(new Error(c), { code: c });
  const clean = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const pnow = () => (root.performance && performance.now ? performance.now() : Date.now());
  const within = (pr, ms) => new Promise((res, rej) => { const t = setTimeout(() => rej(new Error('timeout')), ms); pr.then(v => { clearTimeout(t); res(v); }, e => { clearTimeout(t); rej(e); }); });
  const quietly = pr => { if (pr && pr.catch) pr.catch(() => {}); return pr; };
  const PRESETS = [{ mode: 'stock', stk: 3, tm: 3 }, { mode: 'stock', stk: 2, tm: 3 }, { mode: 'stock', stk: 5, tm: 3 }, { mode: 'time', stk: 3, tm: 3 }];
  const PRESET_NAME = [['ストック3', 'Stock 3'], ['ストック2', 'Stock 2'], ['ストック5', 'Stock 5'], ['じかん3分', 'Timed 3 min']];
  const START_LEAD = qnum('olLead', 3600);    // ホストが「go」を書いてから試合が始まるまで（ms）
  const QUEUE_STALE = 45000, HEARTBEAT = 15000, IDLE_OFF = 20000;
  // ?debug の試験用：受け取った入力に、わざと遅れ・ゆれ・取りこぼしを入れる（片道 ms）。両方のページに入れれば往復はその2倍
  const DBG = { lat: qnum('netlat', 0), jit: qnum('netjit', 0), loss: qnum('netloss', 0) / 100, seed: qnum('netseed', 1) };
  let dseed = DBG.seed >>> 0 || 1;
  const drand = () => { dseed = (dseed + 0x6D2B79F5) >>> 0; let t = dseed; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; };
  const shape = (fn, lossy) => { if (!DBG.lat && !DBG.jit && !DBG.loss) return fn(); if (lossy && DBG.loss && drand() < DBG.loss) return; setTimeout(fn, Math.max(0, DBG.lat + (DBG.jit ? (drand() * 2 - 1) * DBG.jit : 0))); };

  const I18N = root.KoboI18n;
  const DICT = {
    'オンライン対戦': 'Online match', '1対1です。友だちとはコードで、知らない人とはクイックマッチで。': '1v1. Use a room code with a friend, or quick match with anyone.',
    'クイックマッチ': 'Quick match', '知らない人と': 'with anyone', '部屋をつくる': 'Make a room', '友だちにコードを伝える': 'share the code with a friend', 'コードで入る': 'Join with a code', '入る': 'Join',
    'ニックネーム': 'Nickname', '12文字まで': 'Up to 12 characters', 'もどる': 'Back', 'つないでいます…': 'Connecting…', '対戦相手をさがしています…': 'Looking for an opponent…', 'キャンセル': 'Cancel',
    'コード': 'Code', '友だちにこのコードを伝えてください': 'Tell your friend this code', 'あなた': 'You', 'ホスト': 'Host', '相手を待っています…': 'Waiting for an opponent…', '空き': 'Open',
    'おもちゃをえらぶ': 'Pick your toy', 'ステージ': 'Stage', 'ランダム': 'Random', 'ルール': 'Rules', 'ホストがえらびます': 'The host chooses',
    'ストック3': 'Stock 3', 'ストック2': 'Stock 2', 'ストック5': 'Stock 5', 'じかん3分': 'Timed 3 min',
    'じゅんびOK': 'Ready', 'じゅんび中…': 'Not ready', 'とりけし': 'Not ready', '部屋を出る': 'Leave room', '通信': 'Ping', 'まだ入っていません': 'Not here yet',
    'ニックネームを1文字以上入れてください': 'Please enter a nickname', '部屋が見つかりませんでした': 'Room not found', '部屋はもういっぱいです': 'That room is full', '始まっている部屋には入れません': 'That match has already started',
    'バージョンがちがう人とは対戦できません。ページを読み込みなおしてください。': 'Different game version: reload the page to play together.', 'つながりませんでした': 'Could not connect', 'もう一度ためしてください。': 'Please try again.',
    'コードは6けたの数字です': 'The code is 6 digits', '部屋が閉じられました': 'The room was closed', '相手が出ました': 'Your opponent left',
    '相手を待っています': 'Waiting for the opponent', '通信 {n}ms': 'Ping {n} ms', 'オンライン': 'Online', 'この試合をやめる？': 'Leave this match?', 'やめると、あなたの負けになります。': 'If you leave, you lose.',
    'つづける': 'Keep playing', 'やめる': 'Leave', 'もう一度（席をいれかえ）': 'Rematch (swap sides)', 'あいてを待っています…': 'Waiting for the opponent…', 'ロビーにもどる': 'Back to the room',
    '相手の通信が切れました。あなたの勝ちです。': 'Your opponent disconnected. You win.', 'あなたの通信が切れました。': 'You lost your connection.', 'このあと ずれが見つかったので、結果はなしです。': 'The two games drifted apart, so there is no result.',
    'ずれ（desync）': 'Desync', '勝ち数・試合数だけ記録します（ランキングや点にはなりません）': 'Only wins and matches are recorded (no ranking or points)', 'オンライン {w}勝 / {p}戦': 'Online: {w} wins / {p} matches',
    'ふたりの試合がずれたので、この試合は無効です。': 'The two games drifted apart, so this match does not count.', '勝ち': 'Win', '負け': 'Loss',
    '席': 'Seat', '左': 'left', '右': 'right', '対戦': 'Match', 'もう一度やりなおす': 'Try again',
  };
  if (I18N && I18N.add) I18N.add({ en: DICT });
  const T = (s, v) => (I18N && I18N.t ? I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && v[k] != null ? v[k] : m)));

  const S = {
    phase: 'off', gen: 0, db: null, uid: null, TS: null, off: 0, connected: false, connListening: false, onConn: null, dbOff: false, idleAt: 0, idleT: 0,
    nick: '', qref: null, q: null, cref: null, code: null, rid: null, rref: null, meta: null, host: false, seat: -1, quick: false,
    seats: {}, on: {}, rd: {}, cfg: { s: 'rnd', p: 0 }, go: null, pg: {}, pgT: {}, offs: [], timers: [], err: null, pinger: new NET.Pinger(), startedG: 0, match: null, lastPl: null, ready: 0, joinAt: 0,
    sig: '', code0: '',
  };
  let H = null, ov = null, hudEl = null, askEl = null;
  const sNow = () => Date.now() + S.off;
  const mySeatDoc = () => ({ u: S.uid, n: S.nick, c: S.myChar(), tj: H.tj() ? 1 : 0, j: S.TS });
  S.myChar = () => { const c = H.myChar(); return H.chars().indexOf(c) >= 0 ? c : H.chars()[0]; };

  // ---------------------------------------------------------------- Firebase
  function loadJs(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(err('sdk-load')); document.head.appendChild(s); }); }
  const authReady = au => new Promise(res => { const un = au.onAuthStateChanged(() => { un(); res(); }); });
  function idleWatch() {
    if (S.idleT) return;
    S.idleT = setInterval(() => {
      if (!S.db || S.dbOff || typeof S.db.goOffline !== 'function') return;
      if (S.qref || S.rref || ['connecting', 'queue', 'room', 'play', 'result', 'joining'].indexOf(S.phase) >= 0) { S.idleAt = 0; return; }
      if (!S.idleAt) { S.idleAt = Date.now(); return; }
      if (Date.now() - S.idleAt < IDLE_OFF) return;
      S.idleAt = 0; S.dbOff = true; S.connected = false;
      try { S.db.goOffline(); } catch (e) {}
    }, 5000);
  }
  async function netInit() {
    if (S.db) { if (S.dbOff) { S.dbOff = false; try { S.db.goOnline(); } catch (e) {} } S.idleAt = 0; return; }
    const fc = root.NEJI_FIREBASE;
    if (!fc || !fc.databaseURL) throw err('no-config');
    if (root.KoboCloud && root.KoboCloud.ready) { try { await root.KoboCloud.ready(); } catch (e) {} }
    if (!root.firebase || !root.firebase.apps) await loadJs(SDK + 'firebase-app-compat.js');
    if (!root.firebase.auth) await loadJs(SDK + 'firebase-auth-compat.js');
    if (!root.firebase.database) await loadJs(SDK + 'firebase-database-compat.js');
    const fb = root.firebase;
    if (!fb.apps.length) fb.initializeApp(fc);
    const app = fb.app();
    await authReady(app.auth());
    let u = app.auth().currentUser;
    if (!u && root.KoboCloud && root.KoboCloud.ensureGuest) { try { await root.KoboCloud.ensureGuest(); } catch (e) {} u = app.auth().currentUser; }
    if (!u) u = (await app.auth().signInAnonymously()).user;
    S.uid = u.uid; S.db = app.database(); S.TS = fb.database.ServerValue.TIMESTAMP;
    idleWatch();
  }
  function netConnect() {
    return new Promise((res, rej) => {
      const to = setTimeout(() => rej(err('timeout')), 10000);
      const done = () => { clearTimeout(to); res(); };
      if (S.connListening) { if (S.connected) done(); else S.onConn = done; return; }
      S.connListening = true; S.onConn = done;
      S.db.ref('.info/connected').on('value', s => {
        const was = S.connected; S.connected = s.val() === true;
        if (S.connected) { if (S.onConn) { const f = S.onConn; S.onConn = null; f(); } if (!was) reconnected(); }
      });
      S.db.ref('.info/serverTimeOffset').on('value', s => { S.off = s.val() || 0; });
    });
  }
  // 通信がもどったら、サーバーが片づけたかもしれない自分の印を書きなおす
  function reconnected() {
    if (S.phase === 'queue' && S.qref) { quietly(S.qref.onDisconnect().remove()); quietly(S.qref.update({ n: S.nick, h: S.TS })); }
    if (S.rref && S.seat >= 0 && ['room', 'play', 'result'].indexOf(S.phase) >= 0) { const o = S.rref.child('on/' + S.uid); quietly(o.onDisconnect().remove()); quietly(o.set(1)); }
  }
  function listen(ref, f, ev) {
    const cb = s => { if (S.phase !== 'off') f(s.val(), s); };
    ref.on(ev || 'value', cb, e => { if (S.phase !== 'off') fail(e); });
    S.offs.push(() => ref.off(ev || 'value', cb));
  }
  function every(f, ms) { const id = setInterval(f, ms); S.timers.push(id); return id; }
  function stopListeners() { S.offs.forEach(f => { try { f(); } catch (e) {} }); S.offs = []; S.timers.forEach(clearInterval); S.timers = []; }
  function fail(e) {
    const c = e && (e.code || e.message) || 'error';
    resetNet();
    // データベースのルールに bw（大乱闘のオンライン）がまだ入っていないと PERMISSION_DENIED になる。だまってとまらず、わかるメッセージを出す
    if (/permission[_ -]?denied/i.test(String(c))) S.err = T('オンライン対戦はまだじゅんびちゅうです（サーバーのルールが未設定）') + '（PERMISSION_DENIED）';
    else S.err = T('つながりませんでした') + '（' + String(c).slice(0, 40) + '）';
    setPhase('menu');
  }

  // ---------------------------------------------------------------- 入る・出る
  function resetNet() {
    S.gen++;
    stopListeners();
    if (S.match) { S.match.dispose(); S.match = null; }
    if (S.qref) { const q = S.qref; S.qref = null; try { q.onDisconnect().cancel(); quietly(q.remove()); } catch (e) {} }
    if (S.cref) { const c = S.cref; S.cref = null; try { c.onDisconnect().cancel(); quietly(c.remove()); } catch (e) {} }
    if (S.rref) {
      const r = S.rref; lsSet('kusoge.brawl.olroom', 'null');
      try {
        const o = r.child('on/' + S.uid); o.onDisconnect().cancel();
        if (S.host || S.seat < 0) quietly(r.remove());      // ホストが出たら部屋ごと消す
        else if (S.seats[S.seat]) { quietly(r.child('seats/' + S.seat).remove()); quietly(o.remove()); quietly(r.child('rd/' + S.uid).remove()); }      // 部屋がもう消えていたら（ホストが先に出た）、何も書かない
      } catch (e) {}
    }
    S.rref = null; S.rid = null; S.meta = null; S.host = false; S.seat = -1; S.seats = {}; S.on = {}; S.rd = {}; S.pg = {}; S.go = null; S.code = null; S.q = null; S.startedG = 0; S.lastPl = null; S.ready = 0;
    hideHud(); hideAsk();
  }
  function setPhase(ph) { S.phase = ph; S.sig = ''; render(); }
  async function begin(kind, o) {
    o = o || {};
    resetNet();
    const gen = ++S.gen;
    S.err = null;
    S.nick = clean(o.nick) || clean(lsGet('kobo.nick')) || 'Player';
    lsSet('kobo.nick', S.nick); if (root.KoboCloud && root.KoboCloud.setNickname) { try { quietly(root.KoboCloud.setNickname(S.nick)); } catch (e) {} }
    setPhase('connecting');
    try { await netInit(); await netConnect(); } catch (e) { if (gen === S.gen) fail(e); return; }
    if (gen !== S.gen) return;
    sweep().catch(() => {});
    if (kind === 'quick') return queueStart(gen);
    if (kind === 'make') return makeRoom(gen);
    if (kind === 'join') return joinByCode(gen, o.code);
  }
  const lsGet = k => { try { return localStorage.getItem(k); } catch (e) { return null; } };
  const lsSet = (k, v) => { try { localStorage.setItem(k, v); } catch (e) {} };
  // 古い部屋の片づけ（3時間たった部屋は、だれでも消してよい）。自分のコードが残っていたら消す
  // 前に作って消し忘れた（ページを閉じた）自分の部屋を片づける：この端末が最後にホストだった部屋の id を覚えておいて、次につないだときに消す
  async function sweep() {
    let o = null; try { o = JSON.parse(lsGet('kusoge.brawl.olroom') || 'null'); } catch (e) { o = null; }
    if (o && o.rid && o.host && o.rid !== S.rid) { try { await S.db.ref('bw/rooms/' + o.rid).remove(); } catch (e) {} try { if (o.code) await S.db.ref('bw/codes/' + o.code).remove(); } catch (e) {} }
    if (o) lsSet('kusoge.brawl.olroom', 'null');
  }
  const rememberRoom = () => lsSet('kusoge.brawl.olroom', JSON.stringify(S.host ? { rid: S.rid, host: 1, code: S.code || '' } : null));

  // ---- クイックマッチ
  async function queueStart(gen) {
    S.qref = S.db.ref('bw/queue/' + S.uid);
    try { await S.qref.onDisconnect().remove(); await within(S.qref.set({ n: S.nick, t: S.TS, h: S.TS, k: 2, v: E.NETV }), 12000); } catch (e) { if (gen === S.gen) fail(e); return; }
    if (gen !== S.gen) return;
    setPhase('queue');
    listen(S.db.ref('bw/queue'), v => { S.q = v || {}; queueEval(); });
    every(() => { if (S.qref && S.phase === 'queue') quietly(S.qref.update({ h: S.TS })); queueEval(); }, HEARTBEAT);
  }
  function queueEval() {
    if (S.phase !== 'queue' || !S.q) return;
    const q = S.q, now = sNow(), me = S.uid;
    const alive = e => e && typeof e.t === 'number' && e.v === E.NETV && now - (typeof e.h === 'number' ? e.h : e.t) < QUEUE_STALE;
    for (const id in q) { const e = q[id]; if (id !== me && alive(e) && e.r && Array.isArray(e.m) && e.m.indexOf(me) >= 0) return joinRoom(S.gen, e.r, 'q'); }
    const open = Object.keys(q).filter(id => alive(q[id]) && !q[id].r && q[id].k === 2).sort((a, b) => q[a].t - q[b].t || (a < b ? -1 : 1));
    const my = open.indexOf(me); if (my < 0) return;
    const g0 = my - my % 2, grp = open.slice(g0, g0 + 2);
    if (grp.length >= 2 && grp[0] === me) createRoom(S.gen, { kind: 'q', grp });
  }
  // ---- 部屋
  async function createRoom(gen, o) {
    if (S.phase === 'creating') return;
    S.phase = 'creating';
    const ref = S.db.ref('bw/rooms').push(), meta = { at: S.TS, h: S.uid, n: 2, k: o.kind, v: E.NETV };
    if (o.grp) { meta.inv = {}; o.grp.forEach(id => { meta.inv[id] = 1; }); }
    try {
      await within(ref.set({ meta, seats: { 0: mySeatDoc() }, cfg: { s: 'rnd', p: 0 } }), 12000);
      if (gen !== S.gen) { quietly(ref.remove()); return; }
      if (o.kind === 'q' && S.qref) await S.qref.update({ r: ref.key, m: o.grp });
    } catch (e) { if (gen === S.gen) fail(e); return; }
    if (gen !== S.gen) return;
    S.host = true; S.seat = 0; S.quick = o.kind === 'q';
    await attach(gen, ref.key, meta);
    return ref.key;
  }
  async function makeRoom(gen) {
    const ok = await createRoom(gen, { kind: 'c' });
    if (!ok || gen !== S.gen) return;
    let code = '';
    for (let i = 0; i < 6; i++) {
      code = String(100000 + Math.floor(Math.random() * 900000));
      const ref = S.db.ref('bw/codes/' + code);
      try { await ref.set({ h: S.uid, r: S.rid, t: S.TS }); quietly(ref.onDisconnect().remove()); S.cref = ref; S.code = code; break; } catch (e) { code = ''; }
    }
    if (gen !== S.gen) return;
    if (!code) return fail(err('code'));
    rememberRoom(); S.sig = ''; render();
  }
  async function joinByCode(gen, code) {
    if (!/^[0-9]{6}$/.test(String(code || ''))) { S.err = T('コードは6けたの数字です'); return setPhase('menu'); }
    let v = null;
    try { v = (await S.db.ref('bw/codes/' + code).once('value')).val(); } catch (e) { v = null; }
    if (gen !== S.gen) return;
    if (!v || !v.r || !v.h) { resetNet(); S.err = T('部屋が見つかりませんでした'); return setPhase('menu'); }
    S.code = code;
    await joinRoom(gen, v.r, 'c');
  }
  async function joinRoom(gen, rid, kind) {
    if (S.phase === 'joining') return;
    S.phase = 'joining';
    const rref = S.db.ref('bw/rooms/' + rid);
    let meta = null, seats = null, go = null;
    try { meta = (await rref.child('meta').once('value')).val(); seats = (await rref.child('seats').once('value')).val() || {}; go = (await rref.child('go').once('value')).val(); } catch (e) { if (gen === S.gen) fail(e); return; }
    if (gen !== S.gen) return;
    const bad = msg => { const q = S.qref; if (kind === 'q') { S.phase = 'queue'; render(); return; } resetNet(); S.err = msg; setPhase('menu'); void q; };
    if (!meta || !meta.h || meta.h === S.uid) return bad(T('部屋が見つかりませんでした'));
    if (meta.v !== E.NETV) return bad(T('バージョンがちがう人とは対戦できません。ページを読み込みなおしてください。'));
    if (go) return bad(T('始まっている部屋には入れません'));
    let idx = Object.keys(seats).find(k => seats[k] && seats[k].u === S.uid);
    idx = idx == null ? -1 : +idx;
    if (idx < 0) {
      for (let i = 1; i < meta.n && idx < 0; i++) {
        if (seats[i]) continue;
        try { await rref.child('seats/' + i).set(mySeatDoc()); idx = i; } catch (e) { /* 先にとられた：次の席 */ }
      }
      if (gen !== S.gen) return;
      if (idx < 0) return bad(T('部屋はもういっぱいです'));
    }
    S.host = false; S.seat = idx; S.quick = meta.k === 'q';
    const q = S.qref; S.qref = null; if (q) { quietly(q.onDisconnect().cancel()); quietly(q.remove()); }
    await attach(gen, rid, meta);
  }
  async function attach(gen, rid, meta) {
    S.rid = rid; S.rref = S.db.ref('bw/rooms/' + rid); S.meta = meta; rememberRoom();
    try { const o = S.rref.child('on/' + S.uid); await o.onDisconnect().remove(); await o.set(1); } catch (e) { if (gen === S.gen) fail(e); return; }
    if (gen !== S.gen) return;
    if (S.qref) { const q = S.qref; S.qref = null; setTimeout(() => { quietly(q.onDisconnect().cancel()); quietly(q.remove()); }, 5000); }   // 相手が部屋の場所を読むまで、少し残す
    S.seats = {}; S.on = {}; S.rd = {}; S.pg = {}; S.pgT = {}; S.go = null; S.startedG = 0; S.ready = 0; S.joinAt = Date.now();
    setPhase('room');
    listen(S.rref.child('seats'), v => { S.seats = v || {}; const i = seatOf(S.uid); if (i >= 0) S.seat = i; else if (S.phase !== 'off' && S.seat >= 0 && S.joinAt && Date.now() - S.joinAt > 1500) { kicked(); return; } roomChanged(); });
    listen(S.rref.child('on'), v => { S.on = v || {}; roomChanged(); });
    listen(S.rref.child('rd'), v => { S.rd = v || {}; roomChanged(); });
    listen(S.rref.child('cfg'), v => { if (v) S.cfg = v; roomChanged(); });
    listen(S.rref.child('pg'), v => { S.pg = v || {}; for (const u in S.pg) { const m = S.pg[u]; if (u !== S.uid && m && S.pgT[u] !== m.t) { S.pgT[u] = m.t; shape(() => S.pinger.receive(m, pnow()), true); } } });
    listen(S.rref.child('go'), v => { S.go = v; goChanged(); });
    listen(S.rref.child('meta'), v => { if (v == null && S.phase !== 'off' && S.joinAt && Date.now() - S.joinAt > 1500) closed(); });
    every(roomTick, 1000);
  }
  const seatOf = uid => { for (const k of Object.keys(S.seats)) if (S.seats[k] && S.seats[k].u === uid) return +k; return -1; };
  const peerSeats = () => Object.keys(S.seats).map(Number).filter(i => S.seats[i] && S.seats[i].u !== S.uid);
  function kicked() { const inMatch = !!S.match; if (inMatch) return; resetNet(); S.err = T('相手が出ました'); H.toMenu(); setPhase('menu'); showOnline(); }
  function closed() { if (S.match && !S.match.ended) { S.match.peerLeft(); return; } if (S.phase === 'result') return; const had = S.phase === 'room'; resetNet(); if (had) { S.err = T('部屋が閉じられました'); setPhase('menu'); } }
  function roomChanged() {
    if (S.phase === 'room' || S.phase === 'result') hostMaybeStart();
    if (S.phase === 'room') render();
    if (S.match) S.match.roomChanged();
  }
  function roomTick() {
    if (!S.rref) return;
    if (S.phase === 'room' || S.phase === 'result') { if (peerSeats().length) quietly(S.rref.child('pg/' + S.uid).set(S.pinger.poll(pnow()))); if (S.phase === 'room') render(); }
    hostMaybeStart();
  }

  // ---- 試合のはじまり（ホストが go を書く）
  function hostMaybeStart() {
    if (!S.host || !S.rref || S.starting || (S.match && !S.match.ended)) return;
    if (S.phase !== 'room' && S.phase !== 'result') return;
    const a = S.seats[0], b = S.seats[1]; if (!a || !b || !S.on[a.u] || !S.on[b.u]) return;
    if (S.rd[a.u] !== 1 || S.rd[b.u] !== 1) return;
    if (S.go && S.startedG < S.go.g) return;                    // いまの試合の go はまだ取りこんでいない
    const prev = S.go, g = (prev ? prev.g : 0) + 1;
    const pl = prev && prev.pl ? [prev.pl[1], prev.pl[0]] : [a.u, b.u];      // もう一度のたびに、左右をいれかえる
    const by = {}; by[a.u] = a; by[b.u] = b;
    const cfg = S.cfg || { s: 'rnd', p: 0 }, pool = E.STAGE_IDS.filter(id => H.stages().indexOf(id) >= 0);
    const sg = cfg.s !== 'rnd' && E.STAGES[cfg.s] ? cfg.s : (pool.length ? pool : E.STAGE_IDS)[Math.floor(Math.random() * (pool.length ? pool.length : E.STAGE_IDS.length))];
    const go = { g, sd: 1 + Math.floor(Math.random() * 2147483000), st: sNow() + START_LEAD, pl, c: pl.map(u => by[u].c), tj: pl.map(u => (by[u].tj ? 1 : 0)), sg, p: clampN(cfg.p, 0, 3) };
    S.starting = true;
    S.rref.child('go').set(go).then(() => { S.starting = false; }, () => { S.starting = false; });
  }
  const clampN = (v, a, b) => Math.max(a, Math.min(b, v | 0));
  function goChanged() {
    const go = S.go;
    if (!go || go.g <= S.startedG || (S.phase !== 'room' && S.phase !== 'result')) return;
    if (!go.pl || go.pl.indexOf(S.uid) < 0) return;
    // 古い go（このページが入る前の試合）は無視する：始まる時刻が20秒より前なら取りこまない
    if (go.st < sNow() - 20000) { S.startedG = go.g; return; }
    S.startedG = go.g;
    if (S.match) { S.match.dispose(); S.match = null; }
    startMatch(go);
  }
  function startMatch(go) {
    const me = go.pl.indexOf(S.uid), rtt = S.pinger.rtt;
    const names = go.pl.map(u => { const i = seatOf(u); return i >= 0 ? S.seats[i].n : '?'; });
    const P = PRESETS[clampN(go.p, 0, 3)];
    const create = { seed: go.sd, stage: go.sg, fighters: go.pl.map((u, i) => ({ ch: go.c[i], lvl: 0, name: names[i], tj: go.tj && go.tj[i] === 0 ? 0 : 1 })), mode: P.mode, stocks: qnum('olstk', P.stk), time: P.tm * 60, cap: qnum('olcap', 300) };   // olstk / olcap：?debug の試験用
    quietly(S.rref.child('rd/' + S.uid).set(0));       // 次の試合は、またじゅんびOKから
    S.ready = 0;
    S.phase = 'play'; hideOnline();
    const m = new Match({ go, me, create, names, delay: NET.Session.delayFor(rtt > 0 ? rtt : 120), rtt });
    S.match = m;
    H.beginMatch(m);
  }

  // ---------------------------------------------------------------- 試合
  class Match {
    constructor(o) {
      this.go = o.go; this.me = o.me; this.names = o.names; this.create = o.create;
      this.sess = new NET.Session({ E, create: o.create, me: o.me, delay: o.delay, rtt: o.rtt, g: o.go.g, onEvents: (evs, f, st) => H.events(evs, f, st) });
      this.startPerf = pnow() + (o.go.st - sNow());
      this.phase = 'count'; this.acc = 0; this.ended = false; this.finalAt = 0; this.sentRes = false;
      this.peerUid = o.go.pl[1 - o.me]; this.peerSeat = 1 - o.me;
      this.lastHud = 0; this.lastAdapt = 0; this.calm = 0; this.sendFails = 0; this.disposed = false; this.peerGoneAt = 0; this.lastCount = -1;
      this.hashWrote = 0; this.log = [];
      const r = S.rref;
      this.inRef = r.child('in/' + S.uid); this.hRef = r.child('h/' + S.uid);
      const g = o.go.g;
      // 相手の入力を聞く
      const cb = s => { const v = s.val(); if (v && v.g === g && !this.disposed) shape(() => { if (!this.disposed) this.sess.receive(this.peerSeat, v, pnow()); }, true); };
      const pr = r.child('in/' + this.peerUid); pr.on('value', cb, e => this.netError(e)); this.offs = [() => pr.off('value', cb)];
      const hcb = s => { const v = s.val(); if (!v || this.disposed) return; for (const k of Object.keys(v)) { const h = v[k]; if (h && h.g === g) this.sess.receiveHash(this.peerSeat, h); } };
      const hr = r.child('h/' + this.peerUid); hr.on('value', hcb, e => this.netError(e)); this.offs.push(() => hr.off('value', hcb));
      this.sess.started = 0;
      // 最初のまとめ（g が新しくなる）をすぐ書く：古い試合の入力を相手が読まないように
      this.send(true);
      H.matchPhase && H.matchPhase('count');
    }
    netError(e) { if (!this.ended) this.sendFails++; void e; }
    dispose() { this.disposed = true; for (const f of this.offs || []) { try { f(); } catch (e) {} } this.offs = []; }
    st() { return this.sess.st; }
    roomChanged() { if (!S.on[this.peerUid] && !this.peerGoneAt) this.peerGoneAt = pnow(); else if (S.on[this.peerUid]) this.peerGoneAt = 0; }
    peerLeft() { if (!this.ended && this.phase === 'play') this.peerGoneAt = this.peerGoneAt || pnow(); }
    send(force) {
      if (!S.rref || this.disposed || this.peerGoneAt || !S.seats[S.seat]) return;      // 相手の「いる」印が消えている（部屋ごと消えた／切れた）あいだは書かない
      const m = this.sess.pollSend(pnow(), force);
      if (m) { m.g = this.go.g; quietly(this.inRef.set(m).catch(e => { this.sendFails++; void e; })); this.log.length < 0 && this.log.push(m); }
      let h; while ((h = this.sess.takeHash())) {
        const slot = h.fin ? 7 : ((h.f / NET.CK_EVERY) | 0) % 7, v = { g: this.go.g, f: h.f, a: h.a, b: h.b }; if (h.fin) v.fin = 1;
        quietly(this.hRef.child(String(slot)).set(v)); this.hashWrote++;
      }
    }
    // 毎フレーム呼ぶ（dt は秒）。始まる前の 3-2-1、試合の進行、通信、おわりの見張り
    update(dt) {
      if (this.disposed) return;
      const now = pnow(), sess = this.sess;
      if (this.ended) { if (now - this.endAt < 4000 && S.rref && S.on[this.peerUid]) this.send(false); return; }      // おわったあとも少しだけ送る（相手の最後のフレームがそろうように）
      if (this.phase === 'count') {
        const left = this.startPerf - now, n = Math.ceil(left / 1000);
        if (n !== this.lastCount) { this.lastCount = n; H.count(left > 0 ? Math.min(3, n) : 0); }
        if (left <= 0) { this.phase = 'play'; this.acc = 0; H.count(-1); H.matchPhase && H.matchPhase('play'); }
        else { this.send(false); return; }
      }
      if (this.phase !== 'play') return;
      // 固定刻みで進める（足りないぶんを一気に取りもどさない）
      this.acc = Math.min(this.acc + dt, 0.1);
      let n = 0;
      while (this.acc >= E.DT && n < 4 && !(sess.done && sess.done !== 'over') && !this.ended) {
        this.acc -= E.DT; n++;
        const r = sess.tick(() => H.bits(), now);
        if (r.advanced) H.step(sess.st);
        if (r.waiting || r.skipped) this.acc = Math.min(this.acc, E.DT * 0.5);
        this.send(false);
      }
      if (!n) this.send(false);
      // 切れた相手
      if (!sess.done || sess.done === 'over') {
        const ms = this.peerGoneAt && now - this.peerGoneAt > 1500 ? 1500 : 5000;
        const sl = sess.silent(now, ms);
        if (sl.length) { if (!S.connected) this.finish('lost'); else sess.forfeit(sl[0], now); }
      }
      if (sess.done && sess.done !== 'over' && !this.ended) this.finish();
      if (sess.done === 'over' && !this.ended) {
        if (!this.finalAt) this.finalAt = now;
        if (now - this.finalAt > 1500 && (!H.bannerDone || H.bannerDone())) this.finish();          // 勝負がついて1.5秒：最後の指紋をくらべる時間をとってから結果へ
      }
      // 入力ディレイを、はかった往復の時間に合わせて1つずつ動かす（ふやすのは2秒ごと、へらすのは8秒つづけて小さいとき）
      if (now - this.lastAdapt > 2000 && sess.rttN > 3) {
        this.lastAdapt = now; const want = NET.Session.delayFor(sess.rtt);
        if (want > sess.delay) { sess.setDelay(sess.delay + 1); this.calm = 0; } else if (want < sess.delay) { if (++this.calm >= 4) { sess.setDelay(sess.delay - 1); this.calm = 0; } } else this.calm = 0;
      }
      if (now - this.lastHud > 250) { this.lastHud = now; H.hud(this.hudInfo()); }
    }
    hudInfo() { const i = this.sess.info(pnow()); return { ping: Math.round(i.rtt), rb: i.rb, waiting: i.waiting, delay: i.delay, f: i.f, adv: i.adv, nick: this.names, stalls: this.sess.stats.stalls }; }
    // 結果をきめる
    finish(force) {
      if (this.ended) return;
      const sess = this.sess, st = sess.st;
      let why = force || sess.done, win = -1, res = null;
      if (why === 'over') { win = st.win; res = st.res; why = st.why || 'ko'; }
      else if (why === 'forfeit') { win = sess.result.win; }
      else if (why === 'desync' || why === 'abort' || why === 'lost') { win = -1; }
      this.ended = true; this.endAt = pnow();
      const out = { why, win, me: this.me, peer: this.peerUid, won: win === this.me, lost: win >= 0 && win !== this.me, res, f: st.f, g: this.go.g, names: this.names, st };
      if (why !== 'lost' && !this.sentRes && (S.host || why === 'forfeit') && S.rref && S.seats[S.seat]) {   // 結果の記録は1回だけ書ける：ホストが書く（ホストがいなくなったときは、のこった人）
        this.sentRes = true;
        const y = why === 'ko' ? 'ko' : why === 'time' ? 'time' : why === 'cap' ? 'cap' : why === 'forfeit' ? 'forfeit' : why === 'desync' ? 'desync' : 'abort';
        quietly(S.rref && S.rref.child('res/' + this.go.g).set({ w: win, y, f: st.f }));
      }
      this.send(true);
      S.phase = 'result';
      H.end(out);
    }
    dumpHashes() { return this.sess.mine; }
  }

  // ---------------------------------------------------------------- 外から呼ぶ（結果のカードのボタン）
  function rematch() { if (!S.rref || S.phase !== 'result') return false; S.ready = 1; quietly(S.rref.child('rd/' + S.uid).set(1)); roomChanged(); return true; }
  function toRoom() { if (!S.rref) return false; if (S.match) { S.match.dispose(); S.match = null; } S.phase = 'room'; S.ready = 0; quietly(S.rref.child('rd/' + S.uid).set(0)); H.toMenu(); showOnline(); return true; }
  function leave() { const had = S.phase !== 'off'; if (S.match) S.match.dispose(); resetNet(); S.phase = 'off'; hideOnline(); return had; }
  function waitingPeer() { const p = peerSeats(); return p.length && !!S.rd[S.seats[p[0]].u]; }

  // ---------------------------------------------------------------- 画面（ロビー・部屋）
  function css() {
    if (document.getElementById('olCss')) return;
    const st = document.createElement('style'); st.id = 'olCss';
    st.textContent = `
#ovOnline .card{max-width:460px}
#ovOnline .olin{box-sizing:border-box;width:100%;min-height:46px;border-radius:12px;border:1px solid var(--bw-line);background:var(--kb-sunken);color:var(--kb-ink);font:800 16px var(--kb-font-body);padding:0 12px;text-align:center;-webkit-user-select:text;user-select:text}
#ovOnline .olin.code{letter-spacing:.3em;font-size:20px}
#ovOnline .olcode{font:400 34px var(--kb-font-display);letter-spacing:.2em;color:var(--kb-accent-text);margin:4px 0;-webkit-user-select:text;user-select:text}
#ovOnline .olerr{color:var(--bw-bad);font-weight:800;min-height:1.4em}
#ovOnline .olseat{display:flex;align-items:center;gap:8px;border:1px solid var(--bw-line);background:var(--bw-panel);border-radius:14px;padding:6px 8px;margin-top:6px;text-align:left}
#ovOnline .olseat canvas{width:44px;height:44px;flex:none}
#ovOnline .olseat .nm{flex:1;min-width:0;font-weight:800;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#ovOnline .olseat .nm small{display:block;font-weight:500;font-size:11px;color:var(--kb-dim)}
#ovOnline .olseat .rdy{flex:none;font-weight:800;font-size:12px;padding:3px 8px;border-radius:999px;background:var(--bw-panel);color:var(--kb-dim);border:1px solid var(--bw-line)}
#ovOnline .olseat .rdy.on{background:var(--bw-good);color:#10260f;border-color:transparent}
#ovOnline .olseat.empty{opacity:.65;border-style:dashed}
#ovOnline .olping{font-size:12px;color:var(--kb-dim);margin:6px 0 0}
#ovOnline .olspin{display:inline-block;width:14px;height:14px;margin-right:6px;vertical-align:-2px;border:2px solid var(--kb-dim);border-top-color:var(--kb-accent);border-radius:50%;animation:olspin 1s linear infinite}
@keyframes olspin{to{transform:rotate(360deg)}}
#ovOnline .chips.roster{display:grid;grid-template-columns:repeat(6,minmax(0,1fr));gap:6px}
@media (max-width:380px){#ovOnline .chips.roster{grid-template-columns:repeat(5,minmax(0,1fr))}}
#olHud{position:absolute;z-index:6;left:50%;transform:translateX(-50%);top:calc(var(--kb-sat) + 50px);display:flex;gap:6px;align-items:center;pointer-events:none;font:800 11.5px var(--kb-font-body);color:#fff;white-space:nowrap}
#olHud span{padding:3px 9px;border-radius:999px;background:rgba(15,12,30,.62);border:1px solid rgba(255,255,255,.22);font-variant-numeric:tabular-nums}
#olHud .rb{background:rgba(255,178,63,.85);color:#2a1606;border-color:transparent}
#olHud .wt{background:rgba(255,90,90,.85);color:#fff;border-color:transparent}
#olHud .bad{color:#ffb3a0}
#olAsk{position:absolute;z-index:40;inset:0;display:grid;place-items:center;background:rgba(10,8,20,.55)}
#olAsk .box{width:min(300px,86%);background:var(--bw-card);border:1px solid var(--bw-line);border-radius:18px;padding:14px;text-align:center;color:var(--kb-ink)}
#olAsk h3{margin:0 0 4px;font:400 20px var(--kb-font-display);color:var(--kb-accent-text)}
`;
    document.head.appendChild(st);
  }
  function ensureOv() {
    if (ov) return ov;
    css();
    ov = document.createElement('div'); ov.className = 'overlay'; ov.id = 'ovOnline'; ov.hidden = true; ov.setAttribute('role', 'dialog'); ov.setAttribute('aria-modal', 'true'); ov.setAttribute('aria-labelledby', 'olTitle');
    document.body.appendChild(ov);
    ov.addEventListener('click', onClick);
    ov.addEventListener('submit', e => e.preventDefault());
    ov.addEventListener('keydown', e => { if (e.key === 'Enter' && e.target && e.target.id === 'olCode') { e.preventDefault(); act('join'); } else if (e.key === 'Enter' && e.target && e.target.id === 'olNick') { e.preventDefault(); act('quick'); } else if (e.key === 'Escape') { e.preventDefault(); act('back'); } });
    return ov;
  }
  function showOnline() { ensureOv(); H.showOv('ovOnline'); render(); }
  function hideOnline() { if (ov) ov.hidden = true; }
  function onClick(e) { const b = e.target.closest('[data-a]'); if (!b || b.disabled) return; act(b.dataset.a, b); }
  function nickValue() { const i = ov && ov.querySelector('#olNick'); return i ? clean(i.value) : clean(lsGet('kobo.nick')); }
  function act(a, el) {
    if (H.sfx) H.sfx('tap');
    if (a === 'quick' || a === 'make') { const n = nickValue(); if (!n) { S.err = T('ニックネームを1文字以上入れてください'); S.sig = ''; return render(); } begin(a, { nick: n }); }
    else if (a === 'join') { const n = nickValue(); if (!n) { S.err = T('ニックネームを1文字以上入れてください'); S.sig = ''; return render(); } const c = ov.querySelector('#olCode'); const code = c ? c.value.replace(/\D/g, '') : ''; if (!/^[0-9]{6}$/.test(code)) { S.err = T('コードは6けたの数字です'); S.sig = ''; return render(); } begin('join', { nick: n, code }); }
    else if (a === 'back') { if (S.phase === 'menu' || S.phase === 'off') { leave(); H.toTitle(); } else { leave(); S.phase = 'menu'; showOnline(); } }
    else if (a === 'leave') { leave(); H.toTitle(); }
    else if (a === 'cancel') { resetNet(); S.phase = 'menu'; S.err = null; showOnline(); }
    else if (a === 'ready') { S.ready = S.ready ? 0 : 1; quietly(S.rref.child('rd/' + S.uid).set(S.ready)); S.sig = ''; render(); roomChanged(); }
    else if (a === 'char' && el) { const id = el.dataset.id; H.setMyChar(id); if (S.rref && S.seat >= 0) quietly(S.rref.child('seats/' + S.seat + '/c').set(id)); S.sig = ''; render(); }
    else if (a === 'stage' && el && S.host) { S.cfg = { s: el.dataset.id, p: (S.cfg && S.cfg.p) | 0 }; quietly(S.rref.child('cfg').set(S.cfg)); S.sig = ''; render(); }
    else if (a === 'preset' && el && S.host) { S.cfg = { s: (S.cfg && S.cfg.s) || 'rnd', p: +el.dataset.p }; quietly(S.rref.child('cfg').set(S.cfg)); S.sig = ''; render(); }
  }
  function render() {
    if (!ov || ov.hidden) return;
    const ph = S.phase, seats = S.seats;
    // 画面が変わるときだけ作りなおす（入力中の欄を壊さない）
    const sig = [ph, S.err || '', S.code || '', S.seat, S.ready, JSON.stringify(seats), JSON.stringify(S.on), JSON.stringify(S.rd), JSON.stringify(S.cfg), Math.round(S.pinger.rtt / 10)].join('|');
    if (sig === S.sig) return; S.sig = sig;
    const keep = ov.querySelector('#olNick'), kv = keep ? keep.value : null, cv = ov.querySelector('#olCode') ? ov.querySelector('#olCode').value : null;
    const foc = document.activeElement && ov.contains(document.activeElement) ? (document.activeElement.dataset.id ? 'id:' + document.activeElement.dataset.id : document.activeElement.id || (document.activeElement.dataset.a ? 'a:' + document.activeElement.dataset.a : '')) : '';
    let h = '';
    if (ph === 'menu' || ph === 'off') {
      h = '<h2 id="olTitle">' + esc(T('オンライン対戦')) + '</h2><p>' + esc(T('1対1です。友だちとはコードで、知らない人とはクイックマッチで。')) + '</p>'
        + '<div class="sec"><label for="olNick">' + esc(T('ニックネーム')) + '</label><input class="olin" id="olNick" maxlength="12" autocomplete="off" autocapitalize="off" spellcheck="false" placeholder="' + esc(T('12文字まで')) + '" value="' + esc(clean(lsGet('kobo.nick'))) + '"></div>'
        + '<button class="btn" type="button" data-a="quick"><span class="stk"><span>' + esc(T('クイックマッチ')) + '</span><small>' + esc(T('知らない人と')) + '</small></span></button>'
        + '<button class="btn sub" type="button" data-a="make"><span class="stk"><span>' + esc(T('部屋をつくる')) + '</span><small>' + esc(T('友だちにコードを伝える')) + '</small></span></button>'
        + '<div class="sec"><label for="olCode">' + esc(T('コードで入る')) + '</label><div class="row2"><input class="olin code" id="olCode" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" placeholder="000000"><button class="btn sub" type="button" data-a="join" style="margin-top:0;flex:0 0 38%">' + esc(T('入る')) + '</button></div></div>'
        + '<p class="olerr" role="alert">' + esc(S.err || '') + '</p><button class="btn link" type="button" data-a="back">' + esc(T('もどる')) + '</button>';
    } else if (ph === 'connecting' || ph === 'joining' || ph === 'creating') {
      h = '<h2 id="olTitle">' + esc(T('オンライン対戦')) + '</h2><p><span class="olspin"></span>' + esc(T('つないでいます…')) + '</p><button class="btn link" type="button" data-a="cancel">' + esc(T('キャンセル')) + '</button>';
    } else if (ph === 'queue') {
      h = '<h2 id="olTitle">' + esc(T('クイックマッチ')) + '</h2><p><span class="olspin"></span>' + esc(T('対戦相手をさがしています…')) + '</p><button class="btn link" type="button" data-a="cancel">' + esc(T('キャンセル')) + '</button>';
    } else if (ph === 'room') {
      const chars = H.chars(), my = S.myChar(), stages = H.stages();
      h = '<h2 id="olTitle">' + esc(S.quick ? T('クイックマッチ') : T('部屋')) + '</h2>';
      if (S.code && S.host) h += '<p>' + esc(T('友だちにこのコードを伝えてください')) + '</p><div class="olcode" aria-label="' + esc(T('コード')) + '">' + esc(S.code) + '</div>';
      h += '<div class="scroll">';
      for (let i = 0; i < 2; i++) {
        const sd = seats[i];
        if (!sd) { h += '<div class="olseat empty"><canvas width="44" height="44"></canvas><span class="nm">' + esc(T('相手を待っています…')) + '</span></div>'; continue; }
        const here = !!S.on[sd.u], rdy = S.rd[sd.u] === 1;
        h += '<div class="olseat"><canvas width="44" height="44" data-c="' + esc(sd.c) + '"></canvas><span class="nm">' + esc(sd.n) + (sd.u === S.uid ? ' (' + esc(T('あなた')) + ')' : '') + '<small>' + esc(H.charName(sd.c)) + (i === 0 ? ' · ' + esc(T('ホスト')) : '') + (here ? '' : ' · ' + esc(T('まだ入っていません'))) + '</small></span><span class="rdy' + (rdy ? ' on' : '') + '">' + esc(rdy ? T('じゅんびOK') : T('じゅんび中…')) + '</span></div>';
      }
      h += '<div class="sec"><label>' + esc(T('おもちゃをえらぶ')) + '</label><div class="chips roster" id="olPick">';
      for (const id of chars) h += '<button type="button" class="pk' + (id === my ? ' sel' : '') + '" data-a="char" data-id="' + id + '" aria-label="' + esc(H.charName(id)) + '" aria-pressed="' + (id === my) + '"><canvas width="54" height="54" data-c="' + id + '"></canvas><span class="nm">' + esc(H.charName(id)) + '</span></button>';
      h += '</div></div>';
      const cfg = S.cfg || { s: 'rnd', p: 0 };
      if (S.host) {
        h += '<div class="sec"><label>' + esc(T('ステージ')) + '</label><div class="chips" id="olStages">';
        for (const id of ['rnd'].concat(stages)) h += '<button type="button" class="pk stg' + (cfg.s === id ? ' sel' : '') + '" data-a="stage" data-id="' + id + '" aria-pressed="' + (cfg.s === id) + '" style="min-width:64px"><span class="nm">' + esc(id === 'rnd' ? T('ランダム') : H.stageName(id)) + '</span></button>';
        h += '</div></div><div class="sec"><label>' + esc(T('ルール')) + '</label><div class="seg" id="olPresets">';
        PRESET_NAME.forEach((n, p) => { h += '<button type="button" data-a="preset" data-p="' + p + '" class="' + (cfg.p === p ? 'sel' : '') + '">' + esc(T(n[0])) + '</button>'; });
        h += '</div></div>';
      } else {
        h += '<div class="sec"><label>' + esc(T('ステージ')) + ' / ' + esc(T('ルール')) + ' <small>(' + esc(T('ホストがえらびます')) + ')</small></label><p style="font-weight:800;color:var(--kb-ink)">' + esc(cfg.s === 'rnd' || !E.STAGES[cfg.s] ? T('ランダム') : H.stageName(cfg.s)) + ' · ' + esc(T(PRESET_NAME[clampN(cfg.p, 0, 3)][0])) + '</p></div>';
      }
      h += '<p class="olping">' + esc(S.pinger.rtt > 0 ? T('通信 {n}ms', { n: Math.round(S.pinger.rtt) }) : '') + '</p></div>';
      h += '<button class="btn" type="button" data-a="ready" data-id="ready">' + esc(S.ready ? T('とりけし') : T('じゅんびOK')) + '</button><button class="btn link" type="button" data-a="leave">' + esc(T('部屋を出る')) + '</button>';
    }
    ov.innerHTML = '<div class="card">' + h + '</div>';
    const n2 = ov.querySelector('#olNick'); if (n2 && kv != null) n2.value = kv;
    const c2 = ov.querySelector('#olCode'); if (c2 && cv != null) c2.value = cv;
    for (const c of ov.querySelectorAll('canvas[data-c]')) H.portrait(c, c.dataset.c, { size: c.width });
    if (foc) { const el = foc.startsWith('id:') ? ov.querySelector('[data-id="' + foc.slice(3) + '"]') : foc.startsWith('a:') ? ov.querySelector('[data-a="' + foc.slice(2) + '"]') : ov.querySelector('#' + foc); if (el) try { el.focus({ preventScroll: true }); } catch (e) {} }
    else { const f = ov.querySelector('#olNick, #olPick .sel, .btn:not(.sub):not(.link)'); if (f && ph !== 'room') try { f.focus({ preventScroll: true }); } catch (e) {} }
  }

  // ---------------------------------------------------------------- 試合中の表示（ping・ロールバック・待ち）と「やめる？」
  function showHud(el) { if (!hudEl) { hudEl = document.createElement('div'); hudEl.id = 'olHud'; hudEl.setAttribute('aria-live', 'off'); } css(); if (!hudEl.parentNode) (el || document.body).appendChild(hudEl); hudEl.hidden = false; }
  function hideHud() { if (hudEl) hudEl.hidden = true; }
  function setHud(i) {
    if (!hudEl) return;
    const bad = i.ping > 220;
    hudEl.innerHTML = '<span class="' + (bad ? 'bad' : '') + '">' + esc(T('通信 {n}ms', { n: i.ping })) + '</span>' + (i.rb >= 1 ? '<span class="rb" title="rollback">↺ ' + Math.round(i.rb) + '</span>' : '') + (i.waiting ? '<span class="wt">' + esc(T('相手を待っています')) + '</span>' : '');
  }
  function askLeave(parent) {
    if (askEl && askEl.parentNode) { hideAsk(); return; }
    askEl = document.createElement('div'); askEl.id = 'olAsk'; askEl.setAttribute('role', 'dialog'); askEl.setAttribute('aria-modal', 'true');
    askEl.innerHTML = '<div class="box"><h3>' + esc(T('この試合をやめる？')) + '</h3><p style="margin:4px 0;font-size:12.5px">' + esc(T('やめると、あなたの負けになります。')) + '</p><button class="btn" type="button" data-q="keep">' + esc(T('つづける')) + '</button><button class="btn sub" type="button" data-q="leave">' + esc(T('やめる')) + '</button></div>';
    (parent || document.body).appendChild(askEl);
    askEl.addEventListener('click', e => { const b = e.target.closest('[data-q]'); if (!b) return; if (b.dataset.q === 'keep') hideAsk(); else { hideAsk(); H.confirmedLeave(); } });
    const f = askEl.querySelector('[data-q="keep"]'); if (f) try { f.focus(); } catch (e) {}
  }
  function hideAsk() { if (askEl && askEl.parentNode) askEl.parentNode.removeChild(askEl); askEl = null; }

  // ---------------------------------------------------------------- 公開
  const API = {
    init(host) { H = host; ensureOv(); },
    open() { if (!H) return; H.hideAll && H.hideAll(); if (S.phase === 'off' || S.phase === 'menu') { S.phase = 'menu'; S.err = null; } showOnline(); },
    close: leave, leave, rematch, toRoom, askLeave, hideAsk, showHud, hideHud, setHud,
    active: () => S.phase !== 'off' && S.phase !== 'menu',
    inMatch: () => !!(S.match && !S.match.ended),
    match: () => S.match,
    waitingPeer,
    checkpoints: () => { const o = {}; if (S.match) for (const [f, h] of S.match.sess.mine) o[f] = h[0].toString(16) + ':' + h[1].toString(16); return o; },
    Match, PRESETS,
    state: () => ({ phase: S.phase, rid: S.rid, code: S.code, seat: S.seat, host: S.host, uid: S.uid, go: S.go, seats: S.seats, rd: S.rd, on: S.on, cfg: S.cfg, rtt: Math.round(S.pinger.rtt), err: S.err, connected: S.connected, started: S.startedG,
      match: S.match ? { phase: S.match.phase, ended: S.match.ended, me: S.match.me, f: S.match.sess.st.f, done: S.match.sess.done, delay: S.match.sess.delay, stats: Object.assign({}, S.match.sess.stats), rtt: Math.round(S.match.sess.rtt), hashWrote: S.match.hashWrote, sendFails: S.match.sendFails, hash: E.hashStr(S.match.sess.st), win: S.match.sess.st.win, over: S.match.sess.st.over, result: S.match.sess.result ? { why: S.match.sess.result.why, win: S.match.sess.result.win } : null, ckpts: Array.from(S.match.sess.mine.entries()).slice(-4).map(([f, h]) => f + ':' + h[0].toString(16)) } : null }),
    _S: S,
  };
  root.BrawlOnline = API;
})(typeof window !== 'undefined' ? window : globalThis);
