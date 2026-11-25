// common/turnroom.js — KoboTurnRoom：2〜4人のターン制ゲーム（カード・ボード）のオンライン対戦を、ゲームの外にまとめたもの。
// ---------------------------------------------------------------------------------------------------------------------
// 使うゲーム：colorcards（colorcards/online.js が「アダプター」）・reversi（reversi/online.js。2人だけのゲーム）・gomoku（gomoku/online.js。2人だけ）。cards（ババ抜き・七並べ・大富豪…）も同じアダプターの形で使える。
// 設計：ホスト権限（host-authoritative）。部屋を作った人（ホスト）のページがゲームの中身（engine）を動かし、手をたしかめ、
//       「みんなが見てよい状態 pub」と「その人だけが見てよい状態 priv/{uid}」を RTDB に書く。ゲストは「手」だけを act/{uid} に書く。
//       手札など人に見せない情報はホストのメモリにだけあり、RTDB には priv/{uid}（本人だけが読める）としてしか出ていかない。
//       足りない席はホストが CPU で動かす（CPU の手もホストが書く）。時間切れ・切断の席もホストが代わりに動かす。
// RTDB（database.rules.json の "tr"）：
//   tr/{game}/queue/{uid}        = { n: nick, t: server ms, k: 人数 2..4, f: 1（足りない席はCPUでうめてよい）, r: 部屋 id, m: [uid…]（r を作った人だけ） }
//   tr/{game}/codes/{code}       = { h: ホストの uid, r: 部屋 id, t }                       友だちのコード（6けた）。1つずつ読むだけ（一覧は読めない）
//   tr/{game}/rooms/{room}/
//     meta   = { at, h, n: 席の数 2..4, k: 'q'（クイック）|'c'（コード）, cp: CPU の強さ 1..3, tm: 1手の秒数, fl: 1（CPUでうめる）, inv?: { uid: 1 } }   作るとき1回だけ
//     seats  = { 0: { u, n, j }, 1.. }     席。ホストが 0。あとから入る人が空いている番号に書く（先にとった人の勝ち）。始まったあとは増えない
//     on     = { uid: 1 | 0 }               いる（1）。切れると消える（onDisconnect）。自分から出た人は 0
//     pub    = { v, g, ph: 'play'|'over', tn, dl, sl: 'pcxa..', pu: [席の番号|-1], ev: [{ i, t, … }], pd: {…ゲームごとの公開の状態}, rs?: { r: [順位], w, y } }   ホストだけが書く
//     priv   = { uid: { v, h: [手札], d, x? } }   ホストだけが書く・本人だけが読める
//     act    = { uid: { q, v, a: {…手} } }  ゲストの手（ホストだけが読む）。q は増える数、v は見ていた pub.v（古い手は捨てる）
//     rm     = { uid: 1 }                   もう一度の希望
// 席の状態 sl：p＝いる、d＝切れている（もどれる）、a＝時間切れが続いて離席（CPU が代わり。手を打つともどる）、x＝出た（CPU に交代）、c＝はじめから CPU。
// RTDB の接続は、待ち行列にも部屋にもいない状態が20秒続いたら閉じる（goOffline。versus.js・shogi と同じ）。
//
// アダプター（ホストのページだけが使う）cfg.host = {
//   create({ n, seed, cp, humans: [席…], first }) → state            手札などの全部が入る（JSON にできること）
//   turn(state) → 席 | -1,  isOver(state),
//   apply(state, seat, action) → null（できない手）| { ev: [公開してよい出来事], pv?: { 席: 本人だけに見せる出来事 }, soft?: true（番が進まない手） }
//   cpu(state, seat, lv) → action,  auto(state, seat) → action（時間切れ）,
//   pub(state) → pd,  priv(state, seat) → { h, d, … },  result(state) → { r: [順位], w },
//   fallback(pd) → { r, w }（ホストがいなくなったときの結果。pd だけから）,  ser(state) → json,  de(json) → state }
// ゲーム側の画面は onModel(model) を受け取って描く（ホストも同じ道を通る）。
// 設定（create の cfg）：game, host, onModel …に加えて、2人だけのゲーム（リバーシなど。手札のような隠す情報がないもの）のために：
//   seats: [2]         選べる人数（既定は [2,3,4]。1つだけにすると、ロビーの人数の選びが消えて、いつもその人数）
//   alternate: true    2人のゲームで、もう一度のたびに席（先手・後手）を入れかえる（最初の1回は、どちらが先手かをくじで決める）
//   dealMs: 600        最初の番を待つ時間（配るアニメーションがないゲームは短く。既定 2600。?debug の trdeal が優先）
//   turnSec: 45        1手の秒数（既定 30）
//   create には g（何ゲーム目か。1から）も渡す。
(function (root) {
  'use strict';
  const SDK = 'https://cdn.jsdelivr.net/npm/firebase@10.12.2/';
  const DEBUG = !!(root.location && /[?&]debug\b/.test(root.location.search || ''));
  const qnum = (name, d) => { try { const m = new RegExp('[?&]' + name + '=(\\d+)').exec(root.location.search); return DEBUG && m ? +m[1] : d; } catch (e) { return d; } };
  const clamp = (x, a, b) => Math.max(a, Math.min(b, x));
  const cleanNick = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  const err = c => Object.assign(new Error(c), { code: c });
  const quietly = pr => { if (pr && pr.catch) pr.catch(() => {}); return pr; };
  const sleep = ms => new Promise(r => setTimeout(r, ms));
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const arr = v => (Array.isArray(v) ? v : v && typeof v === 'object' ? Object.keys(v).sort((a, b) => a - b).map(k => v[k]) : []);
  const fmt = (s, p) => String(s).replace(/\{(\w+)\}/g, (m, k) => (p && p[k] != null ? p[k] : m));
  const T = (s, p) => (root.KoboI18n && root.KoboI18n.t ? root.KoboI18n.t(s, p) : fmt(s, p));
  if (root.KoboI18n && root.KoboI18n.add) {
    root.KoboI18n.add({ en: {
      'オンライン対戦': 'Online match', 'クイックマッチ': 'Quick match', '部屋をつくる': 'Make a room', 'コードで入る': 'Join with a code',
      '部屋のコード（6けた）': 'Room code (6 digits)', '入る': 'Join', '人数': 'Players', '足りない席はCPUでうめる': 'Fill empty seats with CPUs',
      '人がいないときも、CPUが入って始められます': 'Starts even when nobody else is online (CPUs join)', 'もどる': 'Back', 'キャンセル': 'Cancel', 'つないでいます…': 'Connecting…',
      '対戦相手をさがしています…': 'Looking for players…', '{n}人が待っています': '{n} waiting', 'あと{n}秒で、いる人だけで始めます': 'Starting with who is here in {n}s',
      'あと{n}秒で、足りない席はCPUで始めます': 'Starting in {n}s (empty seats become CPUs)', '友だちにこのコードを伝えてください': 'Tell your friends this code',
      'みんなが入るまで待ちます。好きなときに始められます': 'Wait for everyone, then start when you like', 'ホストが始めるのを待っています…': 'Waiting for the host to start…',
      'スタート': 'Start', '空席をCPUでうめて、スタート': 'Fill empty seats with CPUs and start', '{n}人で、スタート': 'Start with {n} players', 'あなた': 'You', 'ホスト': 'Host', 'CPU': 'CPU',
      '空き': 'Open', 'ニックネームを決めてください': 'Choose a nickname', '12文字まで': 'Up to 12 characters', '決める': 'OK', 'ニックネームを1文字以上入れてください': 'Please enter a nickname',
      '部屋が見つかりませんでした': 'Room not found', '部屋はもういっぱいです': 'That room is full', '始まっている部屋には入れません': 'That game has already started',
      '部屋が閉じられました': 'The room was closed', 'ゲームに入れませんでした': 'You could not join this game', 'つなげませんでした': 'Could not connect', 'もう一度ためす': 'Try again', '試合にもどる': 'Back to the match', 'つづきがあります': 'A match is waiting',
      'つながりました': 'Connected', '切断': 'Offline', '離席': 'Away', 'CPU交代': 'CPU', '考え中…': 'Thinking…', '席がCPUに交代しました': 'Your seat was taken over by a CPU',
      'ホストが退出したので、ここで終了です': 'The host left, so the match ends here', 'ホストとの接続が切れたので、ここで終了です': 'Lost the host, so the match ends here',
      '部屋を閉じました': 'The room was closed', '相手の準備を待っています…': 'Waiting for the others…', '部屋のコード': 'Room code', 'コピー': 'Copy', 'コピーしました': 'Copied',
    } });
  }

  function create(cfg) {
    const A = cfg.host, game = cfg.game, base = 'tr/' + game;
    // without localStorage (a private window, the bot tests) the same keys live in memory
    const mem = {};
    const store = {
      get(k) { try { return root.localStorage.getItem(k); } catch (e) { return Object.prototype.hasOwnProperty.call(mem, k) ? mem[k] : null; } },
      set(k, v) { try { root.localStorage.setItem(k, v); } catch (e) { mem[k] = v; } },
      del(k) { try { root.localStorage.removeItem(k); } catch (e) { delete mem[k]; } },
    };
    const tim = cfg.timing || {};    // the tests shorten the waits (the pages use ?debug&trtm=…）
    const MAXN = cfg.seatsMax || 4;
    const SEATS = (cfg.seats && cfg.seats.length ? cfg.seats : [2, 3, 4]).filter(n => n >= 2 && n <= MAXN);   // 選べる人数
    const fitN = n => (SEATS.indexOf(n) >= 0 ? n : SEATS.reduce((a, b) => (Math.abs(b - n) < Math.abs(a - n) ? b : a), SEATS[0]));
    const TURN_S = clamp(tim.turnSec || qnum('trtm', cfg.turnSec || 30), 3, 180);
    const SEAT_GRACE = (tim.seatGrace || qnum('trgrace', 60)) * 1000;      // 切れた席がもどれる時間
    const HOST_GRACE = (tim.hostGrace || qnum('trhost', 25)) * 1000;       // ゲストがホストを待つ時間
    const QM_WAIT = (tim.qmWait || qnum('trqm', 8)) * 1000;             // クイック：2人以上いたら待つ時間
    const QM_FILL = (tim.qmFill || qnum('trfill', 12)) * 1000;          // クイック：CPUでうめてよい人だけのとき
    const CPU_MS = tim.cpuMs || qnum('trcpu', 1000);                 // CPU の手のあいだ
    const DEAL_MS = tim.dealMs || qnum('trdeal', cfg.dealMs != null ? cfg.dealMs : 2600);               // 配るアニメーションのあいだ（最初の番は待つ）
    const AWAY_MS = tim.awayMs || 1200, DC_MS = tim.dcMs || 2500, LATE_MS = tim.lateMs || 1200;   // 離席・切断の席を CPU が打つまで／時間切れから打つまでの余裕
    const NET_IDLE_OFF = 20000;
    const KEY = 'kusoge.' + game + '.tr';                // この端末の「入っている部屋」（同期しない）
    const KEY_HOST = KEY + 'host';
    const DEFAULT_CPU = ['CPU 1', 'CPU 2', 'CPU 3', 'CPU 4'];
    const cpuName = k => ((cfg.cpuNames && cfg.cpuNames(k)) || DEFAULT_CPU[k % 4]);

    const S = {
      phase: 'off', gen: 0, db: null, uid: null, TS: null, off: 0, connected: false, connListening: false, onConn: null, dbOff: false, idleAt: 0, idleT: 0,
      nick: '', qref: null, q: null, cref: null, code: null, rid: null, rref: null, meta: null, host: false, idx: -1, seats: {}, on: {}, rm: {}, pub: null, priv: null,
      offs: [], timers: [], bad: new Set(), H: null, attachAt: 0, qn: 0, lastG: 0, lastEvI: 0, emitted: null, hostGoneAt: 0, privWait: 0, overAt: 0,
      opts: { n: 3, fill: true }, fault: null, err: null, started: false,
    };
    const sNow = () => Date.now() + S.off;

    // ------------------------------------------------------------ connection
    function loadJs(src) { return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(err('sdk-load')); document.head.appendChild(s); }); }
    const authReady = au => new Promise(res => { const un = au.onAuthStateChanged(() => { un(); res(); }); });
    function idleWatch() {
      if (S.idleT) return;
      S.idleT = setInterval(() => {
        if (!S.db || S.dbOff || typeof S.db.goOffline !== 'function') return;
        if (S.qref || S.rref || S.cref || ['connecting', 'queue', 'code', 'room', 'play', 'over', 'creating', 'joining'].indexOf(S.phase) >= 0) { S.idleAt = 0; return; }
        if (!S.idleAt) { S.idleAt = Date.now(); return; }
        if (Date.now() - S.idleAt < NET_IDLE_OFF) return;
        S.idleAt = 0; S.dbOff = true; S.connected = false;
        try { S.db.goOffline(); } catch (e) {}
      }, 5000);
      if (S.idleT.unref) S.idleT.unref();
    }
    async function netInit() {
      if (S.db) { if (S.dbOff) { S.dbOff = false; try { S.db.goOnline(); } catch (e) {} } S.idleAt = 0; return; }
      if (cfg.net) { S.db = cfg.net.db; S.uid = cfg.net.uid; S.TS = cfg.net.TS; idleWatch(); return; }
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
    // 接続がもどったら、サーバーが片付けたかもしれない自分の印を書き直す
    function reconnected() {
      if (S.phase === 'queue' && S.qref) { quietly(S.qref.onDisconnect().remove()); quietly(S.qref.set(queueEntry())); }
      if (S.rref && S.idx >= 0 && ['room', 'play', 'over'].indexOf(S.phase) >= 0) setPresence(true);
    }
    function listen(ref, ev, f) {
      const cb = s => { if (S.phase !== 'off') f(s); };
      ref.on(ev, cb, e => { if (S.phase !== 'off') fail(e); });
      S.offs.push(() => ref.off(ev, cb));
    }
    function every(f, ms) { const id = setInterval(f, ms); S.timers.push(id); return id; }
    function stopListening() { S.offs.forEach(f => { try { f(); } catch (e) {} }); S.offs = []; S.timers.forEach(clearInterval); S.timers = []; }
    function setPresence(v) {
      if (!S.rref) return;
      const o = S.rref.child('on/' + S.uid);
      if (v) { quietly(o.onDisconnect().remove()); quietly(o.set(1)); }
    }

    // ------------------------------------------------------------ small helpers for the model
    const seatOf = uid => { for (const k of Object.keys(S.seats || {})) if (S.seats[k] && S.seats[k].u === uid) return +k; return -1; };
    const present = idx => !!(S.seats[idx] && S.on[S.seats[idx].u] === 1);
    const humansIn = () => Object.keys(S.seats || {}).map(Number).filter(i => S.seats[i]).sort((a, b) => a - b);
    function emitPhase(ph, info) { S.phase = ph; if (cfg.onPhase) { try { cfg.onPhase(ph, info || {}); } catch (e) { console.error('KoboTurnRoom onPhase', e); } } ui.render(); }

    // ------------------------------------------------------------ entry points
    function reset(keepErr, keepResume) {
      S.gen++;
      stopListening();
      const q = S.qref, c = S.cref, rref = S.rref, H = S.H;
      if (S.lateQ) { const lq = S.lateQ; S.lateQ = null; quietly(lq.onDisconnect().cancel()); quietly(lq.remove()); }
      if (q) { quietly(q.onDisconnect().cancel()); quietly(q.remove()); }
      if (c) { quietly(c.onDisconnect().cancel()); if (S.codeHost) quietly(c.remove()); }
      if (rref) {
        const me = rref.child('on/' + S.uid);
        quietly(me.onDisconnect().cancel());
        const hostLeaving = S.host;
        if (S.pub && !hostLeaving) quietly(me.set(0));     // 出た（試合の途中なら、席は CPU に。終わったあとなら、もう一度の相手から外れる）
        if (!S.pub && S.idx >= 0) { if (hostLeaving) quietly(rref.remove()); else { quietly(rref.child('seats/' + S.idx).remove()); quietly(me.remove()); } }
        else if (hostLeaving) {
          if (H && S.pub && S.pub.ph === 'play') hostFinalWrite('hl');
          setTimeout(() => quietly(rref.remove()), S.pub && S.pub.ph === 'play' ? 2500 : 0);
        } else if (S.pub) {
          // a guest leaving: the last one out removes the room when the host is gone
          const hostOn = S.meta && S.on[S.meta.h];
          if (!hostOn) quietly(rref.remove());
        }
      }
      if (!keepResume) { store.del(KEY); store.del(KEY_HOST); }
      S.qref = null; S.cref = null; S.rref = null; S.rid = null; S.meta = null; S.host = false; S.idx = -1; S.seats = {}; S.on = {}; S.rm = {}; S.pub = null; S.priv = null; S.H = null;
      S.code = null; S.codeHost = false; S.q = null; S.lastG = 0; S.lastEvI = 0; S.emitted = null; S.hostGoneAt = 0; S.privWait = 0; S.overAt = 0; S.started = false; S.fault = null; S.lastModel = null; S.endedLocal = 0; S.nextGame = false; S.fullAt = 0;
      if (!keepErr) S.err = null;
      S.phase = 'off';
    }
    function fail(e) {
      console.warn('KoboTurnRoom', e);
      const detail = (e && (e.code || e.message)) || 'error';
      reset(); S.err = detail;
      emitPhase('err', { detail });
    }
    async function begin(kind, o) {
      o = o || {};
      reset(false, kind === 'resume');
      const gen = ++S.gen;
      S.opts = Object.assign({}, S.opts, o); S.opts.n = fitN(S.opts.n);
      S.nick = cleanNick(store.get('kobo.nick')) || cleanNick(o.nick) || 'Player';
      S.err = null;
      emitPhase('connecting');
      try { await netInit(); await netConnect(); } catch (e) { if (gen === S.gen) fail(e); return; }
      if (gen !== S.gen) return;
      sweep().catch(() => {});
      if (kind === 'quick') return queueStart(gen);
      if (kind === 'host') return hostRoom(gen);
      if (kind === 'join') return joinByCode(gen, o.code);
      if (kind === 'resume') return resumeRoom(gen);
    }

    // ------------------------------------------------------------ quick match
    const queueEntry = () => ({ n: S.nick, t: S.TS, k: S.opts.n, f: S.opts.fill ? 1 : 0 });
    async function queueStart(gen) {
      S.qref = S.db.ref(base + '/queue/' + S.uid);
      try { await S.qref.onDisconnect().remove(); await S.qref.set(queueEntry()); } catch (e) { if (gen === S.gen) fail(e); return; }
      if (gen !== S.gen) return;
      S.queuedAt = Date.now();
      emitPhase('queue');
      listen(S.db.ref(base + '/queue'), 'value', s => { S.q = s.val() || {}; queueEval(); });
      every(queueEval, 500);
    }
    function queueEval() {
      if (S.phase !== 'queue' || !S.q) return;
      const q = S.q, now = sNow(), me = S.uid;
      for (const id in q) {
        const e = q[id];
        if (e && e.r && id !== me && !S.bad.has(e.r) && Array.isArray(e.m) && e.m.indexOf(me) >= 0 && now - (e.t || 0) < 120000) return joinRoom(S.gen, e.r, 'q');
      }
      const k = S.opts.n;
      const open = Object.keys(q).filter(id => { const e = q[id]; return e && !e.r && e.k === k && typeof e.t === 'number' && now - e.t < 150000; })
        .sort((a, b) => q[a].t - q[b].t || (a < b ? -1 : 1));
      const my = open.indexOf(me);
      if (my < 0) return;
      const g0 = my - my % k, grp = open.slice(g0, g0 + k);
      const waited = now - q[grp[0]].t;
      const allFill = grp.every(id => q[id].f === 1);
      let go = 0, left = 0;
      if (grp.length >= k) go = k;
      else if (allFill) { left = QM_FILL - waited; if (left <= 0) go = k; }
      else if (grp.length >= 2) { left = QM_WAIT - waited; if (left <= 0) go = grp.length; }
      S.qn = open.length; S.qLeft = Math.max(0, Math.ceil(left / 1000)); S.qFill = allFill && grp.length < k; ui.render();
      if (!go) return;
      // the oldest of the group makes the room; if it does not (a sleeping tab) the next one does, every 6 s
      const late = waited - (allFill && grp.length < k ? QM_FILL : grp.length >= k ? 0 : QM_WAIT);
      const lead = late > 6000 ? Math.min(grp.length - 1, Math.floor(late / 6000)) : 0;
      if (grp[lead] === me) createRoom(S.gen, { kind: 'q', n: go, grp, fill: allFill && grp.length < k });
    }

    // ------------------------------------------------------------ rooms
    async function createRoom(gen, o) {
      S.phase = 'creating';
      const ref = S.db.ref(base + '/rooms').push();
      const meta = { at: S.TS, h: S.uid, n: o.n, k: o.kind, cp: clamp(cfg.getCpu ? cfg.getCpu() : 2, 1, 3), tm: TURN_S, fl: o.fill ? 1 : 0 };
      if (o.grp) { meta.inv = {}; o.grp.forEach(id => { meta.inv[id] = 1; }); }
      try {
        await ref.set({ meta, seats: { 0: { u: S.uid, n: S.nick, j: S.TS } } });
        if (gen !== S.gen) { quietly(ref.remove()); return; }
        if (o.kind === 'q' && S.qref) await S.qref.update({ r: ref.key, m: o.grp });
      } catch (e) { if (gen === S.gen) fail(e); return; }
      if (gen !== S.gen) return;
      S.host = true; S.codeHost = false;
      await attach(gen, ref.key);
      return ref.key;
    }
    async function hostRoom(gen) {
      const ok = await createRoom(gen, { kind: 'c', n: S.opts.n, fill: S.opts.fill });
      if (!ok || gen !== S.gen) return;
      let code = '';
      for (let i = 0; i < 6; i++) {
        code = String(100000 + Math.floor(Math.random() * 900000));
        const ref = S.db.ref(base + '/codes/' + code);
        try { await ref.set({ h: S.uid, r: S.rid, t: S.TS }); quietly(ref.onDisconnect().remove()); S.cref = ref; S.code = code; S.codeHost = true; break; } catch (e) { code = ''; }
      }
      if (gen !== S.gen) return;
      if (!code) return fail(err('code'));
      ui.render();
    }
    async function joinByCode(gen, code) {
      let v = null;
      try { v = (await S.db.ref(base + '/codes/' + code).once('value')).val(); } catch (e) { v = null; }
      if (gen !== S.gen) return;
      if (!v || !v.r || !v.h) { reset(); S.err = T('部屋が見つかりませんでした'); return emitPhase('menu'); }
      S.code = code;
      await joinRoom(gen, v.r, 'c');
    }
    async function joinRoom(gen, rid, kind) {
      if (S.phase === 'joining') return;
      S.phase = 'joining';
      const rref = S.db.ref(base + '/rooms/' + rid);
      let meta = null, seats = null, hasPub = false;
      try {
        meta = (await rref.child('meta').once('value')).val();
        seats = (await rref.child('seats').once('value')).val() || {};
        hasPub = (await rref.child('pub').once('value')).exists();
      } catch (e) { if (gen === S.gen) fail(e); return; }
      if (gen !== S.gen) return;
      const bad = msg => { S.bad.add(rid); const q = S.qref; if (kind !== 'q') { reset(); } S.err = msg; if (kind === 'q') { S.phase = 'queue'; ui.render(); } else emitPhase('menu'); void q; };
      if (!meta || !meta.h || meta.h === S.uid) return bad(T('部屋が見つかりませんでした'));
      let idx = Object.keys(seats).find(k => seats[k] && seats[k].u === S.uid);
      idx = idx == null ? -1 : +idx;
      if (idx < 0) {
        if (hasPub) return bad(T('始まっている部屋には入れません'));
        // a free seat, picked at random (several friends come in at the same time); one that was taken a moment ago is refused: the next one
        const free = []; for (let i = 1; i < meta.n; i++) if (!seats[i]) free.push(i);
        for (let i = free.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = free[i]; free[i] = free[j]; free[j] = t; }
        for (const i of free) {
          if (idx >= 0) break;
          try { await rref.child('seats/' + i).set({ u: S.uid, n: S.nick, j: S.TS }); idx = i; } catch (e) { /* taken: the next one */ }
        }
        if (gen !== S.gen) return;
        if (idx < 0) return bad(T('部屋はもういっぱいです'));
      }
      S.host = false;
      const q = S.qref; S.qref = null;
      if (q) { quietly(q.onDisconnect().cancel()); quietly(q.remove()); }
      S.idx = idx;
      await attach(gen, rid, meta);
    }
    // 入っている部屋の見張りを始める（ホストも、ゲストも、もどってきた人も）
    async function attach(gen, rid, meta0) {
      S.rid = rid; S.rref = S.db.ref(base + '/rooms/' + rid); S.attachAt = Date.now();
      try {
        S.meta = meta0 || (await S.rref.child('meta').once('value')).val();
        if (!S.meta) throw err('gone');
        if (S.host) S.idx = 0;
        await S.rref.child('on/' + S.uid).onDisconnect().remove();
        await S.rref.child('on/' + S.uid).set(1);
      } catch (e) { if (gen === S.gen) fail(e); return; }
      if (gen !== S.gen) return;
      // the queue entry stays a few seconds for the others to see the room id
      if (S.qref) { const q = S.qref; S.qref = null; S.lateQ = q; setTimeout(() => { if (S.lateQ === q) { S.lateQ = null; quietly(q.onDisconnect().cancel()); quietly(q.remove()); } }, 5000); }
      saveResume();
      S.pub = null; S.priv = null; S.seats = {}; S.on = {}; S.rm = {}; S.started = false;
      if (S.host) S.H = S.H || null;
      listen(S.rref.child('seats'), 'value', s => { S.seats = s.val() || {}; const i = seatOf(S.uid); if (i >= 0) S.idx = i; ui.render(); recompute(); });
      listen(S.rref.child('on'), 'value', s => { S.on = s.val() || {}; ui.render(); });
      listen(S.rref.child('rm'), 'value', s => { S.rm = s.val() || {}; ui.render(); });
      listen(S.rref.child('pub'), 'value', s => { const v = s.val(); if (S.endedLocal && v && v.g === S.endedLocal && v.ph === 'play') return; S.pub = v; recompute(); });
      listen(S.rref.child('priv/' + S.uid), 'value', s => { S.priv = s.val(); recompute(); });
      listen(S.rref.child('meta'), 'value', s => { if (s.val() == null && S.started) roomGone(); else if (s.val() == null && S.phase === 'room') { reset(); S.err = T('部屋が閉じられました'); emitPhase('menu'); } });
      if (S.host) {
        listen(S.rref.child('act'), 'child_added', s => onAct(s.key, s.val()));
        listen(S.rref.child('act'), 'child_changed', s => onAct(s.key, s.val()));
      }
      every(tick, 200);
      if (S.phase !== 'play' && S.phase !== 'over') emitPhase('room');
    }
    function saveResume() { store.set(KEY, JSON.stringify({ rid: S.rid, host: S.host ? 1 : 0, uid: S.uid, at: Date.now(), code: S.code || '' })); }
    function resumeInfo() {
      try {
        const r = JSON.parse(store.get(KEY) || 'null');
        if (!r || typeof r.rid !== 'string' || !/^[-\w]{1,40}$/.test(r.rid) || Date.now() - r.at > 10 * 60 * 1000) return null;
        return r;
      } catch (e) { return null; }
    }
    async function resumeRoom(gen) {
      const r = resumeInfo();
      if (!r) { reset(); return emitPhase('menu'); }
      const rref = S.db.ref(base + '/rooms/' + r.rid);
      let meta = null, seats = null, pub = null;
      try { meta = (await rref.child('meta').once('value')).val(); seats = (await rref.child('seats').once('value')).val() || {}; pub = (await rref.child('pub').once('value')).val(); } catch (e) { if (gen === S.gen) fail(e); return; }
      if (gen !== S.gen) return;
      const idx = Object.keys(seats).find(k => seats[k] && seats[k].u === S.uid);
      if (!meta || idx == null || r.uid !== S.uid || (pub && pub.ph === 'over')) { reset(); S.err = T('部屋が閉じられました'); return emitPhase('menu'); }
      S.idx = +idx; S.host = meta.h === S.uid; S.code = r.code || null;
      if (S.host) {
        // the host's own copy of the game: used only if it is exactly the state that was published last
        let snap = null; try { snap = JSON.parse(store.get(KEY_HOST) || 'null'); } catch (e) { snap = null; }
        if (pub && (!snap || snap.rid !== r.rid || snap.v !== pub.v)) { reset(); store.del(KEY); store.del(KEY_HOST); S.err = T('部屋が閉じられました'); return emitPhase('menu'); }
        if (snap) restoreHost(snap);
      }
      await attach(gen, r.rid, meta);
      if (S.host && S.code && gen === S.gen) { S.cref = S.db.ref(base + '/codes/' + S.code); S.codeHost = true; }
    }

    // ------------------------------------------------------------ the host: the game itself
    function restoreHost(snap) {
      S.H = { st: A.de(snap.st), g: snap.g, v: snap.v, evq: snap.evq || [], ei: snap.ei || 0, pu: snap.pu, sl: snap.sl.split(''), uids: snap.uids, lastQ: {}, miss: snap.miss || [],
        dcAt: [], dl: 0, resetDl: true, nextAt: Date.now() + 1500, turnSince: Date.now(), over: false, dirty: true, gate: 0, started: true, first: false, sv: snap.v, justStarted: false };
      S.started = true;
    }
    function saveHost() {
      const H = S.H; if (!H) return;
      store.set(KEY_HOST, JSON.stringify({ rid: S.rid, g: H.g, v: H.v, st: A.ser(H.st), evq: H.evq, ei: H.ei, pu: H.pu, sl: H.sl.join(''), uids: H.uids, miss: H.miss }));
    }
    function hostStart(why) {
      if (!S.host || S.H || !S.meta) return;
      const meta = S.meta, idxs = humansIn().filter(i => present(i));
      const fill = meta.fl === 1;
      const N = fill ? meta.n : idxs.length;
      if (N < 2 || idxs.length < 1) return;
      const pu = idxs.slice(0, N);
      while (pu.length < N) pu.push(-1);
      // CPUs sit between the people at random (the host stays at index 0)
      const rest = pu.slice(1);
      for (let i = rest.length - 1; i > 0; i--) { const j = Math.floor(Math.random() * (i + 1)); const t = rest[i]; rest[i] = rest[j]; rest[j] = t; }
      const order = [pu[0]].concat(rest);
      S.H = { st: null, g: 0, v: 0, evq: [], ei: 0, pu: order, sl: order.map(i => (i < 0 ? 'c' : 'p')), uids: order.map(i => (i < 0 ? null : S.seats[i].u)), lastQ: {}, miss: order.map(() => 0),
        dcAt: [], dl: 0, resetDl: true, nextAt: 0, turnSince: 0, over: false, dirty: false, gate: 0, started: true, first: true, sv: 0, justStarted: false };
      S.started = true;
      newGame();
      if (S.cref) { quietly(S.cref.onDisconnect().cancel()); quietly(S.cref.remove()); S.cref = null; S.codeHost = false; }
      void why;
    }
    function newGame() {
      const H = S.H, N = H.pu.length;
      H.g++; H.evq = []; H.over = false; H.first = true; H.resetDl = true;
      // two-seat games with a first player: swap the seats every game (the first game is decided by a coin)
      if (cfg.alternate && N === 2 && (H.g > 1 || Math.random() < 0.5)) {
        H.pu = [H.pu[1], H.pu[0]]; H.sl = [H.sl[1], H.sl[0]]; H.uids = [H.uids[1], H.uids[0]]; H.dcAt = [H.dcAt[1], H.dcAt[0]];
      }
      H.miss = H.pu.map(() => 0);
      H.sl = H.sl.map((c, k) => (H.pu[k] < 0 ? 'c' : c === 'x' ? 'x' : 'p'));
      H.st = A.create({ g: H.g, n: N, seed: (Math.floor(Math.random() * 4294967295) + 1) >>> 0, cp: S.meta.cp, humans: H.pu.map((i, k) => k).filter(k => H.pu[k] >= 0), first: Math.floor(Math.random() * N) });
      H.justStarted = true;
      publish(null, true);
    }
    function pushEv(H, list) {
      for (const e of list || []) { const o = Object.assign({}, e); o.i = ++H.ei; H.evq.push(o); }
      if (H.evq.length > 8) H.evq = H.evq.slice(-8);
    }
    function publish(pv, clearRm, noState) {
      const H = S.H; if (!H || !S.rref) return;
      const now = sNow(), over = A.isOver(H.st), tn = over ? -1 : A.turn(H.st);
      if (H.resetDl) {
        H.resetDl = false; H.turnSince = Date.now();
        H.dl = !over && tn >= 0 && H.sl[tn] === 'p' ? now + TURN_S * 1000 + (H.first ? DEAL_MS : 0) : 0;
        H.first = false;
      }
      if (!over && tn >= 0 && H.sl[tn] !== 'p') H.dl = 0;
      const firstPub = H.justStarted; H.justStarted = false;
      H.v++; H.dirty = false;
      if (!noState) H.sv = H.v;
      const pub = { v: H.v, g: H.g, ph: over ? 'over' : 'play', tn, dl: Math.round(H.dl), sl: H.sl.join(''), pu: H.pu, pd: A.pub(H.st) };
      if (H.evq.length) pub.ev = H.evq;
      if (over) { const r = A.result(H.st); pub.rs = { r: r.r, w: r.w, y: 'w' }; if (!H.over) { H.over = true; S.overAt = Date.now(); } }
      const upd = { pub };
      H.uids.forEach((u, k) => {
        if (!u || H.sl[k] === 'x') return;
        const p = Object.assign({ v: H.v }, A.priv(H.st, k));
        if (pv && pv[k]) p.x = pv[k];
        upd['priv/' + u] = p;
      });
      if (clearRm) upd.rm = null;
      S.rref.update(upd).catch(e => { if (S.phase !== 'off') fail(e); });
      H.nextAt = Date.now() + (firstPub ? DEAL_MS : CPU_MS);
      saveHost();
    }
    // the final word when the host leaves in the middle: ends the game from what everybody can see
    function hostFinalWrite(why) {
      const H = S.H; if (!H || !S.rref || H.over) return;
      const pd = A.pub(H.st), r = A.fallback(pd);
      H.v++;
      const pub = { v: H.v, g: H.g, ph: 'over', tn: -1, dl: 0, sl: H.sl.join(''), pu: H.pu, pd, rs: { r: r.r, w: r.w, y: why } };
      if (H.evq.length) pub.ev = H.evq;
      quietly(S.rref.update({ pub }));
    }
    function onAct(uid, rec) {
      const H = S.H;
      if (!H || !rec || typeof rec.q !== 'number') return;
      if (H.lastQ[uid] != null && rec.q <= H.lastQ[uid]) return;
      H.lastQ[uid] = rec.q;
      const k = H.uids.indexOf(uid);
      if (k < 0 || H.over) return;
      if (rec.v < H.sv) { H.dirty = true; return; }   // a view from before the last move: the sender looks at the new state and tries again
      hostAction(k, rec.a);
    }
    function hostAction(k, a) {
      const H = S.H; if (!H || H.over || H.sl[k] === 'x') return false;
      const r = A.apply(H.st, k, a);
      if (!r) { H.dirty = true; return false; }
      if (H.sl[k] === 'a') H.sl[k] = 'p';
      H.miss[k] = 0;
      pushEv(H, r.ev);
      if (!r.soft) H.resetDl = true;
      publish(r.pv);
      return true;
    }
    // CPU, a seat that left, a seat that timed out: play the whole turn
    function autoTurn(k, how) {
      const H = S.H; let guard = 0, pv = null, any = false;
      while (!A.isOver(H.st) && A.turn(H.st) === k && guard++ < 6) {
        const a = how === 'auto' ? A.auto(H.st, k) : A.cpu(H.st, k, clamp(S.meta.cp, 1, 3));
        const r = A.apply(H.st, k, a);
        if (!r) break;
        any = true; pushEv(H, r.ev);
        if (r.pv) pv = Object.assign(pv || {}, r.pv);
        if (!r.soft) { H.resetDl = true; break; }
      }
      if (any) publish(pv); else { H.dirty = true; H.nextAt = Date.now() + 500; }
    }
    function hostTick() {
      const H = S.H; if (!H) return;
      const now = Date.now();
      let changed = false;
      H.uids.forEach((u, k) => {
        if (!u) return;
        const v = S.on[u], c = H.sl[k];
        if (c === 'x') return;
        if (v === 0) { H.sl[k] = 'x'; changed = true; }
        else if (v === 1) { if (c === 'd') { H.sl[k] = 'p'; changed = true; if (A.turn(H.st) === k) H.resetDl = true; } }
        else if (c === 'p' || c === 'a') { H.sl[k] = 'd'; H.dcAt[k] = now; changed = true; }
        else if (c === 'd' && now - H.dcAt[k] > SEAT_GRACE) { H.sl[k] = 'x'; changed = true; }
      });
      if (changed) H.dirty = true;
      if (H.over) {
        if (H.dirty) publish(null, false, true);
        rematchEval();
        return;
      }
      const tn = A.turn(H.st);
      if (tn >= 0 && now >= H.nextAt) {
        const c = H.sl[tn];
        if (c === 'c' || c === 'x') { autoTurn(tn, 'cpu'); return; }
        if (c === 'a') { if (now - H.turnSince > AWAY_MS) { autoTurn(tn, 'cpu'); return; } }
        else if (c === 'd') { if (now - H.turnSince > DC_MS) { autoTurn(tn, 'cpu'); return; } }
        else if (c === 'p' && H.dl && sNow() >= H.dl + LATE_MS) {
          H.miss[tn]++;
          if (H.miss[tn] >= 2) H.sl[tn] = 'a';
          autoTurn(tn, 'auto'); return;
        }
      }
      if (H.dirty) publish(null, false, true);
    }
    function rematchEval() {
      const H = S.H; if (!H || !H.over) return;
      const wishers = H.uids.map((u, k) => (u && H.sl[k] !== 'x' ? k : -1)).filter(k => k >= 0);
      if (!wishers.length) return;
      if (!wishers.every(k => S.rm[H.uids[k]] === 1)) return;
      if (S.nextGame) return;
      S.nextGame = true;
      Promise.resolve().then(() => { S.nextGame = false; if (S.H === H && H.over) newGame(); });
    }

    // ------------------------------------------------------------ everyone: the lobby clock, the host watch, and the model for the game
    function tick() {
      if (!S.rref) return;
      const now = Date.now();
      if (S.host && !S.H && S.phase === 'room') {
        // quick match: start when everyone invited is in, or after a few seconds; a private room: when the host presses the button (or it is full)
        const idxs = humansIn().filter(i => present(i));
        if (S.meta.k === 'q') {
          const inv = Object.keys(S.meta.inv || {});
          const all = inv.every(u => { const i = seatOf(u); return i >= 0 && present(i); });
          if (idxs.length >= 1 && (all || now - S.attachAt > 8000)) hostStart('q');
        } else if (idxs.length >= S.meta.n && idxs.length >= 2 && now - S.attachAt > 600) {
          if (!S.fullAt) S.fullAt = now;
          if (now - S.fullAt > 1500) hostStart('full');
        } else S.fullAt = 0;
      }
      if (S.host && !S.H && S.phase === 'room' && S.meta && S.meta.k === 'q' && now - S.attachAt > 20000) { reset(); S.err = T('部屋が閉じられました'); emitPhase('menu'); return; }
      if (S.host && S.H) hostTick();
      // a guest in the lobby: the host went away
      if (!S.host && S.phase === 'room' && S.meta) {
        const hostOn = S.on[S.meta.h] === 1;
        if (!hostOn && Object.keys(S.on).length) { if (!S.hostGoneAt) S.hostGoneAt = now; } else S.hostGoneAt = 0;
        if (S.hostGoneAt && now - S.hostGoneAt > 12000) { reset(); S.err = T('部屋が閉じられました'); emitPhase('menu'); return; }
        if (now - S.attachAt > 90000 && !S.pub) { reset(); S.err = T('部屋が閉じられました'); emitPhase('menu'); return; }
      }
      if (S.host && S.phase === 'room' && !S.pub && now - S.attachAt > 15 * 60 * 1000) { reset(); S.err = T('部屋を閉じました'); emitPhase('menu'); return; }
      // a guest in the game: no host for a while → the match ends here, with the result from what we can see
      if (!S.host && S.pub && S.pub.ph === 'play' && S.meta) {
        const hostOn = S.on[S.meta.h] === 1;
        if (!hostOn) { if (!S.hostGoneAt) S.hostGoneAt = now; } else S.hostGoneAt = 0;
        if (S.hostGoneAt && now - S.hostGoneAt > HOST_GRACE) {
          const r = A.fallback(S.pub.pd || {});
          S.pub = Object.assign({}, S.pub, { ph: 'over', tn: -1, dl: 0, rs: { r: r.r, w: r.w, y: 'hg' }, v: S.pub.v + 1 });
          S.hostGoneAt = 0; S.endedLocal = S.pub.g; recompute();
        }
      }
      // nobody wants a rematch: close the room so the connection is not held for nothing
      if (S.overAt && now - S.overAt > 150000 && S.pub && S.pub.ph === 'over') { const cb = cfg.onIdleClose; reset(); emitPhase('off'); if (cb) cb(); return; }
      if (S.phase === 'play' || S.phase === 'over') { if (cfg.onTick) cfg.onTick(model()); }
    }
    function roomGone() {
      if (S.pub && S.pub.ph === 'over') return;
      if (S.pub && S.pub.ph === 'play') { const r = A.fallback(S.pub.pd || {}); S.pub = Object.assign({}, S.pub, { ph: 'over', tn: -1, dl: 0, rs: { r: r.r, w: r.w, y: 'hl' }, v: S.pub.v + 1 }); S.endedLocal = S.pub.g; recompute(); }
    }
    function model() {
      const p = S.pub; if (!p) return null;
      const pu = arr(p.pu), N = pu.length, me = pu.indexOf(S.idx);
      const names = pu.map((i, k) => (i >= 0 && S.seats[i] ? cleanNick(S.seats[i].n) || '?' : cpuName(k)));
      const sl = String(p.sl || '');
      return { gn: p.g, v: p.v, ph: p.ph, me, n: N, host: S.host, uid: S.uid, code: S.code, rid: S.rid, tn: p.tn, dl: p.dl || 0, left: p.dl ? p.dl - sNow() : 0, names, sl, pu,
        pd: p.pd || {}, priv: S.priv || null, rs: p.rs || null, why: p.rs ? p.rs.y : '', ev: arr(p.ev), replaced: me >= 0 && sl[me] === 'x', rm: S.rm, cpu: S.meta ? S.meta.cp : 2, conn: S.connected !== false };
    }
    function recompute() {
      const p = S.pub;
      if (!p) { ui.render(); return; }
      if (!S.rref) return;
      const m0 = model();
      // my private part must belong to this version (they are written together; the check covers the order the events arrive in)
      if (m0.me >= 0 && m0.sl[m0.me] !== 'x' && (!S.priv || S.priv.v !== p.v) && p.rs && p.rs.y !== 'w') { /* ended from outside: show what we have */ }
      else if (m0.me >= 0 && m0.sl[m0.me] !== 'x' && (!S.priv || S.priv.v !== p.v)) {
        if (!S.privWait) S.privWait = Date.now();
        if (Date.now() - S.privWait < 2500) { setTimeout(recompute, 150); return; }
      }
      S.privWait = 0;
      const fresh = S.lastG !== p.g;
      const evs = fresh ? [] : m0.ev.filter(e => e.i > S.lastEvI);
      if (fresh) { S.lastG = p.g; S.lastEvI = m0.ev.length ? m0.ev[m0.ev.length - 1].i : 0; S.nextGame = false; }
      else if (evs.length) S.lastEvI = evs[evs.length - 1].i;
      const m = Object.assign({}, m0, { fresh, ev: evs, all: m0.ev });
      if (S.lastModel && !fresh && S.lastModel.v === m.v && S.lastModel.ph === m.ph && S.lastModel.sl === m.sl) return;
      S.lastModel = m;
      S.started = true;
      store.set(KEY, JSON.stringify({ rid: S.rid, host: S.host ? 1 : 0, uid: S.uid, at: Date.now(), code: S.code || '' }));
      if (S.phase === 'room' || (fresh && S.phase !== 'play')) { S.phase = 'play'; S.hostGoneAt = 0; }
      if (m.ph === 'over') { if (!S.overAt) S.overAt = Date.now(); S.phase = 'over'; store.del(KEY); store.del(KEY_HOST); } else { S.overAt = 0; S.phase = 'play'; }
      if (fresh && cfg.onPhase) { try { cfg.onPhase('play', { fresh: true }); } catch (e) {} }
      ui.render();
      if (cfg.onModel) { try { cfg.onModel(m); } catch (e) { console.error('KoboTurnRoom onModel', e); } }
    }

    // ------------------------------------------------------------ API for the game
    function submit(a) {
      const p = S.pub; if (!p || p.ph !== 'play') return false;
      const me = arr(p.pu).indexOf(S.idx); if (me < 0) return false;
      if (S.host) return hostAction(me, a);
      S.qn2 = Math.max((S.qn2 || 0) + 1, Date.now());
      S.rref.child('act/' + S.uid).set({ q: S.qn2, v: p.v, a }).catch(e => { if (S.phase !== 'off') console.warn('act refused', e && e.code); });
      return true;
    }
    function rematch() {
      if (!S.rref || !S.pub || S.pub.ph !== 'over') return false;
      if (S.pub.rs && S.pub.rs.y !== 'w') return false;      // the room is closing
      quietly(S.rref.child('rm/' + S.uid).set(1));
      return true;
    }
    function leave() { const had = S.phase !== 'off'; reset(); emitPhase('off'); return had; }
    const timeLeft = () => (S.pub && S.pub.dl ? S.pub.dl - sNow() : 0);

    // ------------------------------------------------------------ resume of a stale room, rooms left by this device
    async function sweep() {
      const r = resumeInfo();
      if (!r || r.uid !== S.uid) { store.del(KEY); store.del(KEY_HOST); }
    }

    // ------------------------------------------------------------ the lobby (DOM). Without a document (the bot tests) nothing is drawn.
    const ui = (function () {
      let el = null, last = '';
      const hasDom = typeof document !== 'undefined' && !!document.body && !cfg.headless;
      function css() {
        if (document.getElementById('ktr-css')) return;
        const st = document.createElement('style'); st.id = 'ktr-css';
        st.textContent = `
.ktr-ov{position:fixed;inset:0;z-index:85;display:flex;align-items:center;justify-content:center;box-sizing:border-box;background:var(--kb-scrim,rgba(5,10,20,.8));padding:max(10px,env(safe-area-inset-top,0px)) max(10px,env(safe-area-inset-right,0px)) max(10px,env(safe-area-inset-bottom,0px)) max(10px,env(safe-area-inset-left,0px));overscroll-behavior:contain;font-family:var(--kb-font-body,inherit)}
.ktr-ov[hidden]{display:none}
.ktr-card{width:100%;max-width:440px;max-height:100%;box-sizing:border-box;display:flex;flex-direction:column;background:var(--cc-card,var(--kb-surface,#182742));color:var(--kb-ink,#f2f5fb);border:1px solid var(--kb-line,#33496f);border-radius:22px;padding:14px 14px 10px;text-align:center;box-shadow:var(--kb-shadow,0 12px 40px rgba(0,0,0,.5))}
.ktr-card h2{margin:0 0 4px;font-family:var(--kb-font-display,inherit);font-weight:400;font-size:22px;color:var(--kb-accent-text,#ffd078)}
.ktr-card p{margin:4px 0;font-size:12.5px;line-height:1.5;color:var(--kb-dim,#aab9d3)}
.ktr-body{flex:1 1 auto;min-height:40px;overflow-y:auto;overscroll-behavior:contain;text-align:left}
.ktr-btn{display:flex;align-items:center;justify-content:center;gap:6px;box-sizing:border-box;width:100%;min-height:48px;margin-top:8px;padding:8px 10px;border-radius:16px;border:0;cursor:pointer;background:var(--cc-go,var(--kb-accent,#ffc14d));color:var(--cc-go-ink,var(--kb-accent-ink,#2b1d00));box-shadow:0 3px 0 var(--cc-go-shadow,rgba(0,0,0,.35));font:800 16px var(--kb-font-body,inherit);touch-action:manipulation}
.ktr-btn:active{transform:translateY(2px);box-shadow:0 1px 0 var(--cc-go-shadow,rgba(0,0,0,.35))}
.ktr-btn.sub{background:var(--cc-panel,rgba(255,255,255,.06));color:var(--kb-ink,#f2f5fb);box-shadow:none;border:1px solid var(--kb-line,#33496f);font-size:14px;min-height:44px}
.ktr-btn:disabled{opacity:.45;cursor:default}
.ktr-btn:focus-visible,.ktr-opt:focus-visible,.ktr-in:focus-visible,.ktr-tog:focus-visible{outline:2px solid var(--kb-focus,#ffd98a);outline-offset:2px}
.ktr-row{display:flex;gap:8px}.ktr-row>*{flex:1;min-width:0}
.ktr-lbl{font-size:11.5px;font-weight:800;color:var(--kb-dim,#aab9d3);margin:10px 0 3px 2px}
.ktr-seg{display:flex;gap:4px;padding:3px;border-radius:14px;background:var(--cc-panel,rgba(255,255,255,.06));border:1px solid var(--kb-line,#33496f)}
.ktr-opt{flex:1;min-width:0;min-height:44px;border-radius:11px;border:0;background:transparent;color:var(--kb-dim,#aab9d3);font:800 13px var(--kb-font-body,inherit);cursor:pointer}
.ktr-opt[aria-pressed="true"]{background:var(--kb-surface,#182742);color:var(--kb-ink,#f2f5fb);box-shadow:inset 0 0 0 2px var(--kb-accent,#ffc14d)}
.ktr-tog{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;margin-top:8px;padding:4px 10px;box-sizing:border-box;border-radius:14px;border:1px solid var(--kb-line,#33496f);background:var(--cc-panel,rgba(255,255,255,.06));color:var(--kb-ink,#f2f5fb);font:800 13px var(--kb-font-body,inherit);cursor:pointer;text-align:left}
.ktr-tog span{flex:1}.ktr-tog small{display:block;font-weight:500;font-size:11px;color:var(--kb-dim,#aab9d3)}
.ktr-tog i{flex:none;width:40px;height:24px;border-radius:12px;background:var(--kb-line,#33496f);position:relative}
.ktr-tog i::after{content:"";position:absolute;top:3px;left:3px;width:18px;height:18px;border-radius:50%;background:#fff;transition:transform .15s}
.ktr-tog[aria-checked="true"] i{background:var(--kb-accent,#ffc14d)}.ktr-tog[aria-checked="true"] i::after{transform:translateX(16px)}
.ktr-in{box-sizing:border-box;width:100%;min-height:48px;border-radius:14px;border:1px solid var(--kb-line,#33496f);background:var(--kb-bg,#0f1a2e);color:var(--kb-ink,#f2f5fb);font:800 20px var(--kb-font-body,inherit);letter-spacing:.2em;text-align:center;padding:4px 8px;user-select:text;-webkit-user-select:text}
.ktr-code{display:block;font:400 34px var(--kb-font-display,inherit);letter-spacing:.18em;text-align:center;margin:6px 0;color:var(--kb-ink,#f2f5fb);user-select:text;-webkit-user-select:text}
.ktr-seats{list-style:none;margin:8px 0;padding:0;display:flex;flex-direction:column;gap:4px}
.ktr-seats li{display:flex;align-items:center;gap:8px;padding:6px 8px;border-radius:12px;background:var(--cc-panel,rgba(255,255,255,.06));border:1px solid var(--kb-line,#33496f);font-size:13.5px;font-weight:800}
.ktr-seats li.me{border-color:var(--kb-accent,#ffc14d);background:var(--kb-accent-soft,rgba(255,193,77,.16))}
.ktr-seats li.empty{opacity:.55;font-weight:500}
.ktr-seats .nm{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.ktr-seats .tg{flex:none;font-size:10.5px;padding:1px 7px;border-radius:999px;background:var(--kb-surface,#182742);color:var(--kb-dim,#aab9d3)}
.ktr-spin{display:inline-block;width:14px;height:14px;border-radius:50%;border:2px solid var(--kb-line,#33496f);border-top-color:var(--kb-accent,#ffc14d);animation:ktr-spin 1s linear infinite;vertical-align:-2px;margin-right:6px}
.ktr-err{color:var(--cc-bad,#ff8d7d)!important;font-weight:800}
@keyframes ktr-spin{to{transform:rotate(360deg)}}
@media (prefers-reduced-motion:reduce){.ktr-spin{animation-duration:3s}}
@media (max-height:600px){.ktr-card{padding:10px 12px 8px}.ktr-btn{min-height:46px;margin-top:6px}}`;
        document.head.appendChild(st);
      }
      function mk() {
        css();
        el = document.createElement('div'); el.className = 'ktr-ov'; el.hidden = true;
        el.setAttribute('role', 'dialog'); el.setAttribute('aria-modal', 'true'); el.setAttribute('aria-labelledby', 'ktr-h');
        document.body.appendChild(el);
        el.addEventListener('keydown', e => {
          if (e.key === 'Escape') { const b = el.querySelector('[data-ktr="cancel"],[data-ktr="back"]'); if (b) { e.stopPropagation(); b.click(); } return; }
          if (e.key !== 'Tab') return;
          // a dialog keeps the focus inside (Tab goes round)
          const f = [...el.querySelectorAll('button:not([disabled]), input:not([disabled])')].filter(x => x.offsetParent !== null || x === document.activeElement);
          if (!f.length) { e.preventDefault(); return; }
          const first = f[0], last = f[f.length - 1], cur = document.activeElement;
          if (!el.contains(cur)) { e.preventDefault(); first.focus(); }
          else if (e.shiftKey && cur === first) { e.preventDefault(); last.focus(); }
          else if (!e.shiftKey && cur === last) { e.preventDefault(); first.focus(); }
        });
      }
      function seatList() {
        const meta = S.meta, n = meta ? meta.n : S.opts.n, items = [];
        for (let i = 0; i < n; i++) {
          const sd = S.seats[i];
          if (sd) items.push('<li class="' + (sd.u === S.uid ? 'me' : '') + '"><span class="nm">' + esc(cleanNick(sd.n)) + (sd.u === S.uid ? ' (' + esc(T('あなた')) + ')' : '') + '</span>' +
            (meta && sd.u === meta.h ? '<span class="tg">' + esc(T('ホスト')) + '</span>' : '') + (S.on[sd.u] === 1 ? '' : '<span class="tg">…</span>') + '</li>');
          else items.push('<li class="empty"><span class="nm">' + esc(T('空き')) + '</span>' + (meta && meta.fl ? '<span class="tg">CPU</span>' : '') + '</li>');
        }
        return '<ul class="ktr-seats">' + items.join('') + '</ul>';
      }
      function html() {
        const ph = S.phase, o = S.opts;
        if (ph === 'nick') return { key: 'nick', title: T('ニックネームを決めてください'), body: '<form data-ktr="nickform"><input class="ktr-in" data-ktr="nickin" maxlength="12" autocomplete="nickname" placeholder="' + esc(T('12文字まで')) + '" value="' + esc(cleanNick(store.get('kobo.nick'))) + '" style="letter-spacing:0;font-size:18px"><p class="ktr-err" data-ktr="nickerr"></p><button class="ktr-btn" type="submit" data-ktr="nickok">' + esc(T('決める')) + '</button></form><button class="ktr-btn sub" type="button" data-ktr="back">' + esc(T('もどる')) + '</button>' };
        if (ph === 'menu') {
          const r = resumeInfo();
          const lv = cfg.getCpu ? cfg.getCpu() : 2;
          return { key: 'menu:' + o.n + ':' + o.fill + ':' + (S.err || '') + ':' + (r ? r.rid : ''), title: T('オンライン対戦'),
            body: (r ? '<button class="ktr-btn" type="button" data-ktr="resume">' + esc(T('試合にもどる')) + '</button>' : '') +
              (SEATS.length > 1 ? '<div class="ktr-lbl">' + esc(T('人数')) + '</div><div class="ktr-seg" role="group">' + SEATS.map(n => '<button class="ktr-opt" type="button" data-n="' + n + '" aria-pressed="' + (o.n === n) + '">' + esc(T('{n}人', { n })) + '</button>').join('') + '</div>' : '') +
              '<button class="ktr-tog" type="button" role="switch" data-ktr="fill" aria-checked="' + !!o.fill + '"><span>' + esc(T('足りない席はCPUでうめる')) + '<small>' + esc(T('人がいないときも、CPUが入って始められます')) + (cfg.cpuLabel ? ' · CPU ' + esc(cfg.cpuLabel(lv)) : '') + '</small></span><i></i></button>' +
              '<button class="ktr-btn" type="button" data-ktr="quick" style="margin-top:12px">' + esc(T('クイックマッチ')) + '</button>' +
              '<button class="ktr-btn sub" type="button" data-ktr="make">' + esc(T('部屋をつくる')) + '</button>' +
              '<div class="ktr-lbl">' + esc(T('コードで入る')) + '</div><div class="ktr-row"><input class="ktr-in" data-ktr="code" inputmode="numeric" pattern="[0-9]*" maxlength="6" autocomplete="off" aria-label="' + esc(T('部屋のコード（6けた）')) + '" placeholder="000000"><button class="ktr-btn sub" type="button" data-ktr="join" style="margin-top:0;flex:0 0 38%">' + esc(T('入る')) + '</button></div>' +
              '<p class="ktr-err" data-ktr="menuerr" role="alert">' + esc(S.err || '') + '</p>' +
              '<button class="ktr-btn sub" type="button" data-ktr="back">' + esc(T('もどる')) + '</button>' };
        }
        if (ph === 'connecting' || ph === 'creating' || ph === 'joining') return { key: 'conn', title: T('オンライン対戦'), body: '<p><span class="ktr-spin"></span>' + esc(T('つないでいます…')) + '</p><button class="ktr-btn sub" type="button" data-ktr="cancel">' + esc(T('キャンセル')) + '</button>' };
        if (ph === 'queue') {
          const sub = S.qFill ? T('あと{n}秒で、足りない席はCPUで始めます', { n: S.qLeft }) : S.qLeft ? T('あと{n}秒で、いる人だけで始めます', { n: S.qLeft }) : '';
          return { key: 'queue:' + S.qn + ':' + S.qLeft + ':' + S.qFill, title: T('クイックマッチ'), body: '<p><span class="ktr-spin"></span>' + esc(T('対戦相手をさがしています…')) + '</p><p>' + esc(T('{n}人', { n: o.n })) + ' · ' + esc(T('{n}人が待っています', { n: Math.max(1, S.qn) })) + '</p><p>' + esc(sub) + '</p><button class="ktr-btn sub" type="button" data-ktr="cancel">' + esc(T('キャンセル')) + '</button>' };
        }
        if (ph === 'room') {
          const meta = S.meta, hs = humansIn().filter(i => present(i)).length;
          let btn = '';
          if (S.host && meta && meta.k === 'c') {
            const can = hs >= 2 || meta.fl;
            const label = hs >= meta.n ? T('スタート') : meta.fl ? T('空席をCPUでうめて、スタート') : T('{n}人で、スタート', { n: hs });
            btn = '<button class="ktr-btn" type="button" data-ktr="start"' + (can ? '' : ' disabled') + '>' + esc(label) + '</button>';
          }
          const sub = S.host ? (meta && meta.k === 'c' ? T('みんなが入るまで待ちます。好きなときに始められます') : T('まもなく開始…')) : T('ホストが始めるのを待っています…');
          const code = S.code ? '<div class="ktr-lbl" style="text-align:center">' + esc(T('友だちにこのコードを伝えてください')) + '</div><span class="ktr-code" data-ktr="codeshow">' + esc(S.code) + '</span>' : '';
          return { key: 'room:' + JSON.stringify(S.seats) + JSON.stringify(S.on) + (S.host ? 'h' : 'g') + (S.code || ''), title: T('オンライン対戦'), body: code + seatList() + '<p>' + esc(sub) + '</p>' + btn + '<button class="ktr-btn sub" type="button" data-ktr="cancel">' + esc(T('キャンセル')) + '</button>' };
        }
        if (ph === 'err') return { key: 'err:' + S.err, title: T('つなげませんでした'), body: '<p class="ktr-err" role="alert">' + esc(S.err || '') + '</p><button class="ktr-btn" type="button" data-ktr="retry">' + esc(T('もう一度ためす')) + '</button><button class="ktr-btn sub" type="button" data-ktr="back">' + esc(T('もどる')) + '</button>' };
        return null;
      }
      function bind() {
        const q = s => el.querySelector(s);
        const on = (s, ev, f) => { const b = q(s); if (b) b.addEventListener(ev, f); };
        el.querySelectorAll('[data-n]').forEach(b => b.addEventListener('click', () => { S.opts.n = +b.dataset.n; if (cfg.onOpts) cfg.onOpts({ n: S.opts.n }); render(true); }));
        on('[data-ktr="fill"]', 'click', () => { S.opts.fill = !S.opts.fill; store.set('kusoge.' + game + '.trfill', S.opts.fill ? '1' : '0'); render(true); });
        on('[data-ktr="quick"]', 'click', () => api.begin('quick'));
        on('[data-ktr="make"]', 'click', () => api.begin('host'));
        on('[data-ktr="resume"]', 'click', () => api.begin('resume'));
        const join = () => { const c = String((q('[data-ktr="code"]') || {}).value || '').replace(/\D/g, ''); if (c.length !== 6) { const e = q('[data-ktr="menuerr"]'); if (e) e.textContent = T('部屋のコード（6けた）'); return; } api.begin('join', { code: c }); };
        on('[data-ktr="join"]', 'click', join);
        on('[data-ktr="code"]', 'keydown', e => { if (e.key === 'Enter') { e.preventDefault(); join(); } });
        on('[data-ktr="start"]', 'click', () => hostStart('button'));
        on('[data-ktr="cancel"]', 'click', () => { reset(); emitPhase('menu'); });
        on('[data-ktr="retry"]', 'click', () => api.open());
        on('[data-ktr="back"]', 'click', () => { reset(); emitPhase('off'); if (cfg.onClose) cfg.onClose(); });
        on('[data-ktr="nickform"]', 'submit', e => {
          e.preventDefault();
          const n = cleanNick((q('[data-ktr="nickin"]') || {}).value);
          if (!n) { q('[data-ktr="nickerr"]').textContent = T('ニックネームを1文字以上入れてください'); return; }
          store.set('kobo.nick', n);
          if (root.KoboCloud && root.KoboCloud.setNickname) { try { quietly(root.KoboCloud.setNickname(n)); } catch (e) {} }
          api.open();
        });
        const cs = q('[data-ktr="codeshow"]'); void cs;
      }
      function render(force) {
        if (!hasDom) return;
        const h = ['nick', 'menu', 'connecting', 'creating', 'joining', 'queue', 'room', 'err'].indexOf(S.phase) >= 0 ? html() : null;
        if (!el && h) mk();
        if (!el) return;
        if (!h) { el.hidden = true; el.innerHTML = ''; last = ''; return; }
        if (!force && last === h.key && !el.hidden) return;
        const focused = document.activeElement && document.activeElement.getAttribute ? document.activeElement.getAttribute('data-ktr') : null;
        const codeVal = el.querySelector('[data-ktr="code"]') ? el.querySelector('[data-ktr="code"]').value : '';
        last = h.key; el.hidden = false;
        el.innerHTML = '<div class="ktr-card"><h2 id="ktr-h">' + esc(h.title) + '</h2><div class="ktr-body">' + h.body + '</div></div>';
        bind();
        const ci = el.querySelector('[data-ktr="code"]'); if (ci && codeVal) ci.value = codeVal;
        const f = (focused && el.querySelector('[data-ktr="' + focused + '"]')) || el.querySelector('[data-ktr="resume"],[data-ktr="quick"],[data-ktr="start"],[data-ktr="nickin"],[data-ktr="retry"],[data-ktr="cancel"]');
        if (f && f.focus) { try { f.focus({ preventScroll: true }); } catch (e) {} }
      }
      return { render, hide() { if (el) { el.hidden = true; el.innerHTML = ''; last = ''; } } };
    })();

    // ------------------------------------------------------------ public object
    const api = {
      // the lobby (nickname → menu)
      open(o) {
        reset(false, true);
        S.opts = Object.assign({ n: 3, fill: store.get('kusoge.' + game + '.trfill') !== '0' }, S.opts, o || {});
        if (cfg.getOpts) { const g = cfg.getOpts(); if (g && g.n) S.opts.n = clamp(g.n, 2, MAXN); }
        S.opts.n = fitN(S.opts.n);
        S.err = null;
        if (!cleanNick(store.get('kobo.nick'))) emitPhase('nick'); else emitPhase('menu');
      },
      begin, submit, rematch, leave, timeLeft, model,
      resumable: () => !!resumeInfo(),
      get phase() { return S.phase; },
      get uid() { return S.uid; },
      get isHost() { return S.host; },
      get pub() { return S.pub; },
      sNow,
      _S: S,
    };
    return api;
  }

  root.KoboTurnRoom = { create, VERSION: 1 };
  if (typeof module === 'object' && module && module.exports) module.exports = root.KoboTurnRoom;
})(typeof globalThis !== 'undefined' ? globalThis : this);
