// ひまつぶし工房：オンラインのスコア対戦（全ゲーム共通。Firebase Realtime Database）
// ---------------------------------------------------------------------------------
// 2〜4人が同じ seed（同じピースの順番）で同時にスタートし、決まった時間内のスコアを競う。
// 読み込み: <head> で i18n.js の後に <script src="../common/versus.js"></script>
//           （firebase-config.js / cloud.js はページの最後でよい。SDK はこのモジュールが必要なときに読む）
//
//   KoboVersus.init({
//     game: 'blocks',            // 必須。RTDB のパス vs/queue/{game} に使う英数字
//     title: T('ブロックはめ'),   // カードに出すゲーム名
//     duration: 180,             // 1試合の秒数
//     unit: T('点'),             // 結果のスコアの単位（省略可）
//     theme: { accent, accentBg, accentInk, accentShadow, card, line, ink, dim, hud, display }, // 省略可。ゲームの見た目に合わせる色・字体
//     hudCover: () => el,        // 省略可。試合中、この要素（ゲームのヘッダーなど）の下端まで HUD で覆う
//     onOpen() {},               // 対戦の画面が開いた（ひとりプレイを一時停止する）
//     onStart({ seed, startAt, endAt, duration, players, practice }) {},
//                                // 試合が決まった。seed（32bit 整数）で新しいゲームを作る。入力はまだ受け付けない
//                                // startAt / endAt はこの端末の Date.now() 基準（サーバー時計で全員そろえてある）
//     onGo() {},                 // 3-2-1 が終わった。ここから入力を受け付ける（KoboVersus.canPlay() が true になる）
//     getScore() { return score; },   // 0.1秒ごとに読む（または KoboVersus.reportScore(n) で知らせる）
//     onEnd() {},                // 時間切れ。入力を止める（結果カードはモジュールが出す）
//     onExit() {},               // 対戦の画面を閉じた。onStart が呼ばれていたら、ひとりプレイの状態に戻す
//   });
//   KoboVersus.button(el, { compact })  // el の中に「オンライン対戦」ボタンを置く（compact: 小さい「対戦」）
//   KoboVersus.open() / .practice() / .close()
//   KoboVersus.canPlay()   // 試合中で操作してよいとき true（ゲームの入力・更新処理で確認する）
//   KoboVersus.active()    // 対戦の画面か試合が開いているとき true（ひとりプレイのキー操作を止める）
//   KoboVersus.rng(seed)   // 0〜1 を返す決まった乱数（mulberry32）。同じ seed なら全員同じ順番
//   KoboVersus.reportScore(n)
//
// 新しいゲームに入れる手順:
//   1. 乱数を差し替えられるようにする（let rnd = Math.random → onStart で rnd = KoboVersus.rng(seed)）。
//      盤の状態で乱数の使い方が変わる処理（置けるまで引き直す等）は、対戦中は通さない（全員同じ順番にするため）。
//   2. onStart でひとりプレイの状態を覚えておき、新しい試合を始める。対戦中は保存（localStorage）とベスト更新をしない。
//   3. 入力と時間の進行は KoboVersus.canPlay() のときだけ。ゲームオーバーは「盤をリセットして続ける」にする。
//   4. onExit で覚えておいた状態に戻す。
//
// RTDB（ルールは database.rules.json）:
//   vs/queue/{game}/{uid} = { n: nick, t: 来た時刻, h: 生存確認 }  (+ r: room, m: [uids] 部屋を作った人だけ)
//   vs/rooms/{room}       = { g: game, at, sd: seed, h: 作った人, inv: { uid: 1 }, dur,
//                             m: { uid: { n, j } }             いまいる人（切断で自動的に消える）
//                             go: { pl: [uids], n: { uid: nick }, st: 開始時刻(サーバー ms), dur }
//                             s: { uid: score }  f: { uid: 最終スコア }  res: { at, r: [{ u, n, v, x(切断) }] } }
// 部屋を作るのは列の中でいちばん古い人。4人そろうか、2人目が来て12秒たったら始まる。
// 試合のあと、残っている先頭の人（作った人が抜けたら次の人）が res を書き、少し後に部屋を消す。
(function () {
  'use strict';
  const SDK = 'https://cdn.jsdelivr.net/npm/firebase@10.12.2/';
  const MAX = 4, WAIT2 = 12000, CD = 3600, GRACE = 3000, STALE = 45000, HEARTBEAT = 15000, WRITE_MS = 400;
  const STATS = 'kusoge.vs.stats';
  const DEBUG = location.protocol === 'file:' || /[?&]debug\b/.test(location.search);
  const I18N = window.KoboI18n;
  if (I18N) I18N.add({ en: {
    'オンライン対戦': 'Online battle', '対戦': 'VS', 'つないでいます…': 'Connecting…',
    '対戦相手を さがしています…': 'Looking for opponents…', '相手が来るまで このまま待ちます': 'Waiting here until someone joins',
    'あと {n}秒で スタート': 'Starting in {n}s', '対戦相手が 見つかりました！': 'Opponents found!', 'まもなく スタート…': 'Starting soon…',
    'キャンセル': 'Cancel', 'ひとりで練習': 'Practice solo', 'もどる': 'Back', '決定': 'OK',
    'ニックネーム': 'Nickname', '対戦で表示する名前（1〜12文字）': 'Name shown to opponents (1–12 characters)',
    'ニックネームを1文字以上入れてください': 'Please enter at least 1 character',
    'オンライン対戦は準備中です': 'Online battle is not available yet', 'しばらくしてから もう一度ためしてください。': 'Please try again later.',
    'つながりが切れました': 'Connection lost', 'のこり': 'Time', 'スタート！': 'Go!', 'タイムアップ！': 'Time up!',
    'けっかを 集計中…': 'Tallying results…', '結果': 'Results', 'あなた': 'you', '切断': 'left',
    'もう一度': 'Play again', 'やめる': 'Quit', 'もう一度押すと やめる': 'Tap again to quit',
    'オンライン {w}勝 / {p}戦 ・ ベスト {b}': 'Online · wins {w} / games {p} · best {b}',
    '練習': 'Practice', '練習の記録は残りません': 'Practice scores are not saved',
    '2〜4人で {t} のスコア勝負。全員に同じ順番で同じピースが出ます。': '2–4 players, {t} score battle. Everyone gets the same pieces in the same order.',
    '2〜4人で {t} のスコア勝負。全員に同じ問題が同じ順番で出ます。': '2–4 players, {t} score battle. Everyone gets the same puzzles in the same order.',
    '2〜4人で {t} のスコア勝負。全員に同じステージが同じ順番で出ます。': '2–4 players, {t} score battle. Everyone gets the same stages in the same order.',
    '2〜4人で {t} のスコア勝負。全員が同じコースを走ります。': '2–4 players, {t} score battle. Everyone runs the same course.',
    '2〜4人で {t} のスコア勝負。全員が同じ海、同じいかだから始めます。': '2–4 players, {t} score battle. Everyone starts on the same sea with the same raft.',
    '{m}分': '{m} min', '{s}秒': '{s} s', '{m}分{s}秒': '{m} min {s} s', '{n}位': '#{n}', 'スコア': 'Score',
  } });
  const T = (s, v) => (I18N ? I18N.t(s, v) : String(s).replace(/\{(\w+)\}/g, (m, k) => (v && k in v ? v[k] : m)));
  const ls = {
    get(k) { try { return localStorage.getItem(k); } catch (e) { return null; } },
    set(k, v) { try { localStorage.setItem(k, v); } catch (e) {} },
  };
  const cleanNick = n => String(n || '').replace(/[\u0000-\u001f<>]/g, '').trim().slice(0, 12);
  const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  const fmt = n => (Number(n) || 0).toLocaleString('ja-JP');
  const err = c => Object.assign(new Error(c), { code: c });
  const reduced = () => !!(window.matchMedia && matchMedia('(prefers-reduced-motion: reduce)').matches);
  const ordinal = n => {
    if (!I18N || I18N.lang === 'ja') return n + '位';
    const s = (n % 100 >= 11 && n % 100 <= 13) ? 'th' : ({ 1: 'st', 2: 'nd', 3: 'rd' }[n % 10] || 'th');
    return n + s;
  };
  function durText(sec) {
    const m = Math.floor(sec / 60), s = sec % 60;
    return m && s ? T('{m}分{s}秒', { m, s }) : m ? T('{m}分', { m }) : T('{s}秒', { s });
  }
  function rng(seed) {
    let a = (seed >>> 0) || 1;
    return function () {
      a = (a + 0x6D2B79F5) >>> 0; let t = a;
      t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }

  // ---------------------------------------------------------------- styles
  const CSS = `
.kvs-ov{position:fixed;inset:0;z-index:60;display:flex;align-items:center;justify-content:center;box-sizing:border-box;
  padding:max(12px,env(safe-area-inset-top,0px)) max(12px,env(safe-area-inset-right,0px)) max(12px,env(safe-area-inset-bottom,0px)) max(12px,env(safe-area-inset-left,0px));
  background:rgba(8,5,12,.72);-webkit-backdrop-filter:blur(3px);backdrop-filter:blur(3px);color:var(--kvs-ink);font-family:inherit;
  -webkit-user-select:none;user-select:none;touch-action:manipulation}
.kvs-card{width:min(340px,100%);max-height:100%;display:flex;flex-direction:column;box-sizing:border-box;background:var(--kvs-card);
  border:1px solid var(--kvs-line);border-radius:20px;box-shadow:0 14px 40px rgba(0,0,0,.5);overflow:hidden;animation:kvs-rise .3s ease-out}
.kvs-body{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:16px 16px 4px;text-align:center}
.kvs-act{flex:none;display:grid;gap:8px;padding:8px 16px 16px}
.kvs-kick{margin:0;font-size:12px;font-weight:800;color:var(--kvs-dim);letter-spacing:.08em}
.kvs-card h2{margin:2px 0 8px;font-family:var(--kvs-display);font-weight:400;font-size:22px;line-height:1.25;overflow-wrap:anywhere}
.kvs-p{margin:6px 0;font-size:13px;line-height:1.55;color:var(--kvs-ink);overflow-wrap:anywhere}
.kvs-sub{margin:6px 0;font-size:12px;color:var(--kvs-dim);overflow-wrap:anywhere}
.kvs-names{list-style:none;margin:8px 0;padding:0;display:grid;gap:4px}
.kvs-names li{background:rgba(255,255,255,.07);border-radius:10px;padding:5px 10px;font-weight:800;font-size:14px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kvs-spin{display:inline-block;width:14px;height:14px;margin-right:6px;vertical-align:-2px;border:2px solid var(--kvs-dim);border-top-color:var(--kvs-accent);border-radius:50%;animation:kvs-spin 1s linear infinite}
.kvs-btn{display:block;width:100%;box-sizing:border-box;margin:0;border:0;border-radius:14px;padding:12px;cursor:pointer;font:800 16px/1.2 inherit;font-family:inherit;
  background:var(--kvs-accent-bg);color:var(--kvs-accent-ink);box-shadow:0 4px 0 var(--kvs-accent-shadow)}
.kvs-btn:active{transform:translateY(3px);box-shadow:0 1px 0 var(--kvs-accent-shadow)}
.kvs-btn.sub{background:rgba(255,255,255,.08);color:var(--kvs-ink);box-shadow:none;border:1px solid var(--kvs-line);font-size:14px;padding:10px}
.kvs-btn:focus-visible,.kvs-entry:focus-visible,.kvs-quit:focus-visible,.kvs-in:focus-visible{outline:2px solid var(--kvs-accent);outline-offset:2px}
.kvs-in{width:100%;box-sizing:border-box;margin:6px 0 2px;padding:10px 12px;border-radius:12px;border:1px solid var(--kvs-line);background:rgba(0,0,0,.25);
  color:var(--kvs-ink);font:800 16px inherit;font-family:inherit;text-align:center;-webkit-user-select:text;user-select:text}
.kvs-note{min-height:1.2em;margin:4px 0 0;font-size:12px;color:var(--kvs-accent)}
.kvs-rank{font-family:var(--kvs-display);font-size:40px;line-height:1.1;color:var(--kvs-accent);margin:2px 0}
.kvs-res{list-style:none;margin:8px 0;padding:0;display:grid;gap:4px;text-align:left}
.kvs-res li{display:flex;align-items:center;gap:8px;background:rgba(255,255,255,.07);border-radius:10px;padding:6px 10px;font-size:14px;font-weight:800}
.kvs-res li.me{outline:2px solid var(--kvs-accent);outline-offset:-2px}
.kvs-res li.x{opacity:.6}
.kvs-res i{font-style:normal;min-width:2.4em;color:var(--kvs-dim)}
.kvs-res span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kvs-res b{font-family:var(--kvs-display);font-weight:400;font-variant-numeric:tabular-nums}
.kvs-res small,.kvs-lb small{font-size:10px;font-weight:800;color:var(--kvs-dim);white-space:nowrap}
.kvs-tag{display:inline-block;font-size:10px;font-weight:800;border-radius:999px;padding:1px 6px;background:rgba(255,255,255,.14);color:var(--kvs-ink);margin-left:4px;vertical-align:1px}
.kvs-hud{position:fixed;top:0;left:0;right:0;z-index:55;display:flex;align-items:center;gap:8px;box-sizing:border-box;
  padding:calc(env(safe-area-inset-top,0px) + 4px) max(8px,env(safe-area-inset-right,0px)) 4px max(8px,env(safe-area-inset-left,0px));
  background:var(--kvs-hud);border-bottom:1px solid var(--kvs-line);color:var(--kvs-ink);font-family:inherit;-webkit-user-select:none;user-select:none}
.kvs-time{flex:none;min-width:50px;text-align:center;line-height:1}
.kvs-time small{display:block;font-size:10px;font-weight:800;color:var(--kvs-dim)}
.kvs-time b{display:block;font-family:var(--kvs-display);font-weight:400;font-size:21px;font-variant-numeric:tabular-nums;margin-top:2px}
.kvs-time.low b{color:var(--kvs-accent)}
.kvs-lb{flex:1;min-width:0;display:grid;grid-template-columns:1fr;gap:1px 8px;margin:0;padding:0;list-style:none}
.kvs-lb.c2{grid-template-columns:1fr 1fr}
.kvs-lb li{display:flex;align-items:center;gap:4px;min-width:0;font-size:12px;line-height:18px;font-weight:800}
.kvs-lb li i{font-style:normal;color:var(--kvs-dim);flex:none}
.kvs-lb li span{flex:1;min-width:0;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
.kvs-lb li b{font-variant-numeric:tabular-nums;flex:none}
.kvs-lb li.me span,.kvs-lb li.me b{color:var(--kvs-accent)}
.kvs-lb li.x{opacity:.55}
.kvs-quit{flex:none;width:34px;height:34px;border-radius:10px;border:1px solid var(--kvs-line);background:rgba(255,255,255,.07);color:var(--kvs-ink);
  font:800 16px inherit;font-family:inherit;cursor:pointer;padding:0;position:relative}
.kvs-quit.armed{background:var(--kvs-accent-bg);color:var(--kvs-accent-ink)}
.kvs-tip{position:fixed;z-index:56;right:max(8px,env(safe-area-inset-right,0px));background:rgba(0,0,0,.85);color:#fff;font-size:12px;font-weight:800;
  padding:5px 10px;border-radius:999px;pointer-events:none;white-space:nowrap}
.kvs-cd{position:fixed;inset:0;z-index:58;display:flex;align-items:center;justify-content:center;pointer-events:none;
  font-family:var(--kvs-display);font-size:clamp(48px,22vw,110px);color:var(--kvs-ink);text-shadow:0 4px 0 rgba(0,0,0,.45),0 0 24px rgba(0,0,0,.6);text-align:center;padding:0 12px}
.kvs-cd.small{font-size:clamp(30px,11vw,56px)}
.kvs-cd span{animation:kvs-pop .5s ease-out}
.kvs-entry{display:inline-flex;align-items:center;justify-content:center;gap:4px;box-sizing:border-box;cursor:pointer;border-radius:14px;
  border:1px solid var(--kvs-line);background:rgba(255,255,255,.08);color:var(--kvs-ink);font:800 15px inherit;font-family:inherit;padding:11px 14px;width:100%;margin-top:10px}
.kvs-entry.compact{width:auto;margin:0;height:36px;padding:0 9px;border-radius:12px;font-size:13px;flex:none;white-space:nowrap}
.kvs-entry svg{width:16px;height:16px;flex:none}
@keyframes kvs-rise{from{opacity:0;transform:translateY(18px) scale(.96)}}
@keyframes kvs-pop{from{opacity:0;transform:scale(1.5)}}
@keyframes kvs-spin{to{transform:rotate(360deg)}}
@media (max-height:600px){.kvs-card h2{font-size:19px;margin-bottom:4px}.kvs-body{padding-top:12px}.kvs-rank{font-size:32px}.kvs-btn{padding:10px}}
@media (prefers-reduced-motion:reduce){.kvs-card,.kvs-cd span{animation:none}.kvs-spin{animation-duration:3s}}
`;
  function injectCss(theme) {
    const th = Object.assign({ accent: '#ffcf4a', accentInk: '#2b1a00', accentShadow: 'rgba(0,0,0,.35)', card: 'linear-gradient(#34283f,#231a2c)',
      line: 'rgba(255,255,255,.18)', ink: '#fff8ef', dim: '#c8b8c8', hud: 'rgba(20,12,24,.94)', display: 'inherit' }, theme || {});
    let st = document.getElementById('kvs-css');
    if (!st) { st = document.createElement('style'); st.id = 'kvs-css'; (document.head || document.documentElement).appendChild(st); }
    st.textContent = `:root{--kvs-accent:${th.accent};--kvs-accent-bg:${th.accentBg || th.accent};--kvs-accent-ink:${th.accentInk};--kvs-accent-shadow:${th.accentShadow};--kvs-card:${th.card};` +
      `--kvs-line:${th.line};--kvs-ink:${th.ink};--kvs-dim:${th.dim};--kvs-hud:${th.hud};--kvs-display:${th.display}}` + CSS;
  }

  // ---------------------------------------------------------------- state
  let O = null; // options from init()
  const S = {
    phase: 'off', // off | nick | connecting | queue | room | countdown | play | final | result | err
    gen: 0, practice: false, started: false,
    db: null, uid: null, TS: null, off: 0, connected: false, connListening: false, onConn: null,
    nick: '', qref: null, q: null, rid: null, rref: null, room: null, meta: null, go: null, host: false, goSent: false, joinAt: 0,
    offs: [], timers: [], tick: 0,
    seed: 0, st: 0, end: 0, dur: 180, pl: [], names: {}, myScore: 0, reported: 0, lastW: null, lastWAt: 0, resSent: false, finalAt: 0,
  };
  const sNow = () => Date.now() + S.off;
  const game = () => O.game;
  const duration = () => {
    const m = DEBUG && /[?&]vsdur=(\d+)/.exec(location.search); // test hook: shorter matches
    return Math.max(5, Math.min(900, m ? +m[1] : (+O.duration || 180)));
  };
  function call(name, arg) { try { if (O && typeof O[name] === 'function') return O[name](arg); } catch (e) { console.error('KoboVersus ' + name, e); } }
  function score() {
    const v = O && typeof O.getScore === 'function' ? call('getScore') : S.reported;
    return Math.max(0, Math.floor(Number(v) || 0));
  }

  // ---------------------------------------------------------------- firebase
  function loadJs(src) {
    return new Promise((res, rej) => { const s = document.createElement('script'); s.src = src; s.onload = res; s.onerror = () => rej(err('sdk-load')); document.head.appendChild(s); });
  }
  const authReady = au => new Promise(res => { const un = au.onAuthStateChanged(() => { un(); res(); }); });
  async function netInit() {
    if (S.db) return;
    if (DEBUG && window.__koboVsFake) { const f = await window.__koboVsFake(); S.db = f.db; S.uid = f.uid; S.TS = f.TIMESTAMP; return; }
    const cfg = window.NEJI_FIREBASE;
    if (!cfg || !cfg.databaseURL) throw err('no-config');
    // common/cloud.js may be loading the same SDK right now (https only): wait for it first
    if (window.KoboCloud && KoboCloud.ready) { try { await KoboCloud.ready(); } catch (e) {} }
    if (!window.firebase || !firebase.apps) await loadJs(SDK + 'firebase-app-compat.js');
    if (!firebase.auth) await loadJs(SDK + 'firebase-auth-compat.js');
    if (!firebase.database) await loadJs(SDK + 'firebase-database-compat.js');
    if (!firebase.apps.length) firebase.initializeApp(cfg);
    let app = firebase.app();
    await authReady(app.auth());
    let u = app.auth().currentUser;
    if (!u || u.isAnonymous) {
      // not signed in with Google: anonymous sign-in on a separate app, so the hub's login state is not touched
      app = firebase.apps.find(a => a.name === 'kobo-vs') || firebase.initializeApp(cfg, 'kobo-vs');
      await authReady(app.auth());
      u = app.auth().currentUser || (await app.auth().signInAnonymously()).user;
    }
    S.uid = u.uid; S.db = app.database(); S.TS = firebase.database.ServerValue.TIMESTAMP;
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
  // after a network drop the server may have run our onDisconnect handlers: put our entries back
  function reconnected() {
    if (S.phase === 'queue' && S.qref) { S.qref.onDisconnect().remove(); S.qref.update({ n: S.nick, h: S.TS }).catch(() => {}); }
    if (S.rref && ['room', 'countdown', 'play', 'final'].includes(S.phase)) {
      const m = S.rref.child('m/' + S.uid); m.onDisconnect().remove(); m.update({ n: S.nick }).catch(() => {});
    }
  }
  function listen(ref, f) {
    const cb = s => f(s.val());
    ref.on('value', cb, e => { if (S.phase !== 'off') fail(e); });
    S.offs.push(() => ref.off('value', cb));
  }
  function every(f, ms) { S.timers.push(setInterval(f, ms)); }
  function stopListeners() {
    S.offs.forEach(f => { try { f(); } catch (e) {} }); S.offs = [];
    S.timers.forEach(clearInterval); S.timers = [];
  }
  // leave the queue / room (scores already written stay, so a leaver's score freezes)
  function leaveNet() {
    S.gen++;
    stopListeners();
    if (S.qref) { const q = S.qref; S.qref = null; try { q.onDisconnect().cancel(); q.remove().catch(() => {}); } catch (e) {} }
    if (S.rref) {
      const r = S.rref, room = S.room || {}, m = room.m || {};
      try {
        const me = r.child('m/' + S.uid); me.onDisconnect().cancel();
        const others = Object.keys(m).filter(id => id !== S.uid);
        // nobody else here (or the room never started and I made it): remove the whole room
        if (!others.length || (S.phase === 'room' && S.host)) r.remove().catch(() => {});
        else me.remove().catch(() => {});
      } catch (e) {}
    }
    S.rref = null; S.rid = null; S.room = null; S.meta = null; S.host = false; S.goSent = false; S.q = null;
  }

  // ---------------------------------------------------------------- UI
  let root = null, hud = null, cdEl = null, tipEl = null, cdTimer = 0, hudLast = 0;
  function ui() {
    if (root) return;
    root = document.createElement('div'); root.className = 'kvs-ov'; root.hidden = true;
    root.setAttribute('role', 'dialog'); root.setAttribute('aria-modal', 'true'); root.setAttribute('aria-labelledby', 'kvs-h');
    hud = document.createElement('div'); hud.className = 'kvs-hud'; hud.hidden = true;
    hud.innerHTML = '<div class="kvs-time" aria-live="off"><small></small><b>0:00</b></div><ol class="kvs-lb" aria-label=""></ol><button type="button" class="kvs-quit">×</button>';
    hud.querySelector('.kvs-quit').addEventListener('click', quitTap);
    cdEl = document.createElement('div'); cdEl.className = 'kvs-cd'; cdEl.hidden = true; cdEl.setAttribute('aria-live', 'assertive');
    document.body.append(root, hud, cdEl);
    window.addEventListener('resize', fitHud);
  }
  // card: { kick, title, html, buttons: [{ label, sub, on }], focus }
  function card(o) {
    ui();
    root.hidden = false;
    root.innerHTML = '<div class="kvs-card"><div class="kvs-body"><p class="kvs-kick">' + esc(o.kick || O.title || '') + '</p><h2 id="kvs-h">' + esc(o.title) + '</h2>' +
      (o.html || '') + '</div><div class="kvs-act"></div></div>';
    const act = root.querySelector('.kvs-act');
    (o.buttons || []).forEach((b, i) => {
      const el = document.createElement('button'); el.type = 'button'; el.className = 'kvs-btn' + (b.sub ? ' sub' : ''); el.textContent = b.label;
      if (b.id) el.dataset.kvs = b.id;
      el.addEventListener('click', e => { e.stopPropagation(); b.on(); });
      act.appendChild(el);
      if (i === 0 && o.focus !== false) setTimeout(() => { if (el.isConnected) el.focus({ preventScroll: true }); }, 30);
    });
    return root;
  }
  function hideCard() { if (root) { root.hidden = true; root.innerHTML = ''; } }
  function lobbyCard() {
    card({ title: T('オンライン対戦'),
      html: '<p class="kvs-p kvs-stat"><span class="kvs-spin"></span><span></span></p><ul class="kvs-names"></ul><p class="kvs-sub kvs-left"></p>' +
        '<p class="kvs-sub">' + esc(T((O && O.sameText) || '2〜4人で {t} のスコア勝負。全員に同じ順番で同じピースが出ます。', { t: durText(duration()) })) + '</p>',
      buttons: [{ id: 'cancel', label: T('キャンセル'), on: close }, { id: 'practice', label: T('ひとりで練習'), sub: true, on: practice }] });
  }
  function lobby(stat, names, sub) {
    if (!root || root.hidden || !root.querySelector('.kvs-stat')) lobbyCard();
    root.querySelector('.kvs-stat span:last-child').textContent = stat;
    const ul = root.querySelector('.kvs-names'), key = JSON.stringify(names || []);
    if (ul.dataset.k !== key) {
      ul.dataset.k = key; ul.textContent = '';
      (names || []).forEach(n => { const li = document.createElement('li'); li.textContent = n; ul.appendChild(li); });
    }
    root.querySelector('.kvs-left').textContent = sub || '';
  }
  function nickCard() {
    S.phase = 'nick';
    card({ title: T('ニックネーム'),
      html: '<form class="kvs-nick" novalidate><label class="kvs-sub" for="kvs-nick-in">' + esc(T('対戦で表示する名前（1〜12文字）')) + '</label>' +
        '<input class="kvs-in" id="kvs-nick-in" maxlength="12" autocomplete="nickname" enterkeyhint="done"><p class="kvs-note" aria-live="polite"></p></form>',
      buttons: [{ label: T('決定'), on: submitNick }, { label: T('もどる'), sub: true, on: close }], focus: false });
    const f = root.querySelector('form'), inp = root.querySelector('input');
    inp.value = cleanNick(ls.get('kobo.nick'));
    f.addEventListener('submit', e => { e.preventDefault(); submitNick(); });
    setTimeout(() => inp.focus({ preventScroll: true }), 30);
  }
  function submitNick() {
    const inp = root.querySelector('#kvs-nick-in'); if (!inp) return;
    const n = cleanNick(inp.value);
    if (!n) { root.querySelector('.kvs-note').textContent = T('ニックネームを1文字以上入れてください'); return; }
    ls.set('kobo.nick', n);
    if (window.KoboCloud && KoboCloud.setNickname) KoboCloud.setNickname(n).catch(() => {});
    open();
  }
  function errCard(e) {
    const mid = S.started && S.phase !== 'result';
    S.phase = 'err';
    hideHud();
    const code = (e && (e.code || e.message)) || 'error';
    card({ title: mid ? T('つながりが切れました') : T('オンライン対戦は準備中です'),
      html: '<p class="kvs-p">' + esc(T('しばらくしてから もう一度ためしてください。')) + '</p><p class="kvs-sub">(' + esc(code) + ')</p>',
      buttons: [{ label: T('もどる'), on: close }, { label: T('ひとりで練習'), sub: true, on: practice }] });
  }
  function fail(e) {
    console.warn('KoboVersus', e && (e.code || e.message || e));
    leaveNet();
    errCard(e);
  }

  // ---- HUD + countdown
  function fitHud() {
    if (!hud || hud.hidden) return;
    let h = 0;
    try { const el = O.hudCover && O.hudCover(); if (el) h = el.getBoundingClientRect().bottom; } catch (e) {}
    hud.style.minHeight = h > 0 ? Math.round(h) + 'px' : '';
  }
  function showHud() {
    ui(); hud.hidden = false;
    hud.querySelector('.kvs-time small').textContent = T('のこり');
    const q = hud.querySelector('.kvs-quit'); q.setAttribute('aria-label', T('やめる')); q.classList.remove('armed');
    hud.querySelector('.kvs-lb').setAttribute('aria-label', T('スコア'));
    fitHud(); renderHud(true);
  }
  function hideHud() { if (hud) hud.hidden = true; if (tipEl) { tipEl.remove(); tipEl = null; } }
  let quitArmed = 0;
  function quitTap(e) {
    const b = e.currentTarget, now = Date.now();
    if (now - quitArmed < 2500) { quitArmed = 0; close(); return; }
    quitArmed = now; b.classList.add('armed'); b.blur();
    if (!tipEl) { tipEl = document.createElement('div'); tipEl.className = 'kvs-tip'; document.body.appendChild(tipEl); }
    tipEl.textContent = T('もう一度押すと やめる'); tipEl.style.top = Math.round(hud.getBoundingClientRect().bottom + 6) + 'px';
    setTimeout(() => { if (Date.now() - quitArmed >= 2400) { b.classList.remove('armed'); if (tipEl) { tipEl.remove(); tipEl = null; } } }, 2600);
  }
  function standings() {
    const room = S.room || {}, m = room.m || {}, s = room.s || {}, f = room.f || {};
    const list = S.pl.map((u, i) => {
      const me = u === S.me;
      const v = me ? S.myScore : Math.max(0, Math.floor(Number(f[u] != null ? f[u] : s[u]) || 0));
      return { u, i, n: S.names[u] || '?', v, me, x: !S.practice && !me && !m[u] };
    });
    list.sort((a, b) => b.v - a.v || a.i - b.i);
    list.forEach(p => { p.rank = 1 + list.filter(q => q.v > p.v).length; });
    return list;
  }
  function renderHud(force) {
    if (!hud || hud.hidden) return;
    const now = performance.now();
    if (!force && now - hudLast < 480) return;
    hudLast = now;
    const left = S.phase === 'countdown' ? S.dur * 1000 : Math.max(0, S.end - sNow());
    const sec = Math.ceil(left / 1000), tb = hud.querySelector('.kvs-time');
    tb.querySelector('b').textContent = Math.floor(sec / 60) + ':' + String(sec % 60).padStart(2, '0');
    tb.classList.toggle('low', sec <= 10 && S.phase === 'play');
    const ol = hud.querySelector('.kvs-lb'), list = standings();
    ol.classList.toggle('c2', list.length > 2);
    const html = list.map(p => '<li class="' + (p.me ? 'me' : '') + (p.x ? ' x' : '') + '"><i>' + p.rank + '</i><span>' + esc(p.n) + '</span>' +
      (p.x ? '<small>' + esc(T('切断')) + '</small>' : '') + '<b>' + fmt(p.v) + '</b></li>').join('');
    if (ol.dataset.h !== html) { ol.dataset.h = html; ol.innerHTML = html; }
  }
  function countdown(text, small, ms) {
    ui(); clearTimeout(cdTimer);
    if (cdEl.dataset.t !== text) { cdEl.dataset.t = text; cdEl.innerHTML = '<span>' + esc(text) + '</span>'; }
    cdEl.classList.toggle('small', !!small); cdEl.hidden = false;
    if (ms) cdTimer = setTimeout(() => { cdEl.hidden = true; cdEl.dataset.t = ''; }, ms);
  }
  function hideCountdown() { if (cdEl) { clearTimeout(cdTimer); cdEl.hidden = true; cdEl.dataset.t = ''; } }

  // ---------------------------------------------------------------- flow
  function ensureTick() { if (!S.tick) S.tick = setInterval(tick, 100); }
  function opening() { if (S.phase === 'off') { ui(); call('onOpen'); } }
  function open() {
    if (!O) return;
    opening();
    leaveNet(); hideHud(); hideCountdown();
    S.practice = false;
    const nick = cleanNick(ls.get('kobo.nick'));
    if (!nick) return nickCard();
    S.nick = nick;
    const gen = S.gen;
    S.phase = 'connecting'; ensureTick();
    lobbyCard(); lobby(T('つないでいます…'), [nick]);
    netInit().then(netConnect).then(() => { if (gen === S.gen) queue(gen); }, e => { if (gen === S.gen) fail(e); });
  }
  function close() {
    if (S.phase === 'off') return;
    leaveNet();
    clearInterval(S.tick); S.tick = 0;
    S.phase = 'off'; S.started = false; S.practice = false;
    hideCard(); hideHud(); hideCountdown();
    call('onExit');
  }
  function practice() {
    if (!O) return;
    opening();
    leaveNet();
    S.practice = true; S.nick = cleanNick(ls.get('kobo.nick')) || T('あなた');
    const me = S.uid || 'me';
    startMatch({ seed: 1 + Math.floor(Math.random() * 2e9), st: Math.round(sNow() + CD), dur: duration(), pl: [me], names: { [me]: S.nick }, me });
  }

  // ---- matchmaking
  async function queue(gen) {
    S.phase = 'queue';
    S.qref = S.db.ref('vs/queue/' + game() + '/' + S.uid);
    try {
      await S.qref.onDisconnect().remove();
      await S.qref.set({ n: S.nick, t: S.TS, h: S.TS });
    } catch (e) { if (gen === S.gen) fail(e); return; }
    if (gen !== S.gen) return;
    lobby(T('対戦相手を さがしています…'), [S.nick + ' (' + T('あなた') + ')'], T('相手が来るまで このまま待ちます'));
    listen(S.db.ref('vs/queue/' + game()), v => { S.q = v || {}; qEval(); });
    every(() => { if (S.qref && S.phase === 'queue') S.qref.update({ h: S.TS }).catch(() => {}); }, HEARTBEAT);
  }
  function qEval() {
    if (S.phase !== 'queue' || !S.q) return;
    const q = S.q, now = sNow(), me = S.uid;
    const alive = e => e && typeof e.t === 'number' && now - (typeof e.h === 'number' ? e.h : e.t) < STALE;
    // someone formed a room with me in it
    for (const id in q) {
      const e = q[id];
      if (id !== me && alive(e) && e.r && Array.isArray(e.m) && e.m.indexOf(me) >= 0) return join(e.r, false);
    }
    const open = Object.keys(q).filter(id => alive(q[id]) && !q[id].r).sort((a, b) => q[a].t - q[b].t || (a < b ? -1 : 1));
    const my = open.indexOf(me);
    if (my < 0) return;
    const g0 = my - my % MAX, grp = open.slice(g0, g0 + MAX);
    const names = grp.map(id => cleanNick(q[id].n) + (id === me ? ' (' + T('あなた') + ')' : ''));
    if (grp.length < 2) { lobby(T('対戦相手を さがしています…'), names, T('相手が来るまで このまま待ちます')); return; }
    const goAt = q[grp[1]].t + WAIT2;
    lobby(T('対戦相手を さがしています…'), names, T('あと {n}秒で スタート', { n: Math.max(0, Math.ceil((goAt - now) / 1000)) }));
    // the oldest player of each group forms the room (everyone sorts the same way, so only one does it)
    if (grp[0] === me && (grp.length >= MAX || now >= goAt)) create(grp);
  }
  async function create(grp) {
    S.phase = 'creating';
    const gen = S.gen, ref = S.db.ref('vs/rooms').push(), inv = {};
    grp.forEach(id => { inv[id] = 1; });
    try {
      await ref.set({ g: game(), at: S.TS, sd: 1 + Math.floor(Math.random() * 2e9), h: S.uid, inv, dur: duration(), v: 1 });
      if (gen !== S.gen) { ref.remove().catch(() => {}); return; }
      await S.qref.update({ r: ref.key, m: grp });
    } catch (e) { if (gen === S.gen) fail(e); return; }
    if (gen !== S.gen) return;
    join(ref.key, true);
  }
  async function join(rid, creator) {
    const gen = S.gen;
    stopListeners();
    S.phase = 'room'; S.rid = rid; S.rref = S.db.ref('vs/rooms/' + rid); S.goSent = false; S.joinAt = sNow(); S.room = null;
    const qref = S.qref; S.qref = null;
    if (qref) {
      const drop = () => { try { qref.onDisconnect().cancel(); qref.remove().catch(() => {}); } catch (e) {} };
      if (creator) setTimeout(drop, 8000); else drop(); // the creator's entry tells the others where the room is
    }
    try {
      const meta = (await S.rref.once('value')).val();
      if (gen !== S.gen) return;
      if (!meta || meta.g !== game() || meta.go) { S.rref = null; return requeue(); } // gone or already started
      S.meta = meta; S.host = meta.h === S.uid; S.room = meta;
      const m = S.rref.child('m/' + S.uid);
      await m.onDisconnect().remove();
      await m.set({ n: S.nick, j: S.TS });
    } catch (e) { if (gen === S.gen) fail(e); return; }
    if (gen !== S.gen) return;
    lobby(T('対戦相手が 見つかりました！'), [S.nick + ' (' + T('あなた') + ')'], T('まもなく スタート…'));
    listen(S.rref, roomValue);
  }
  function requeue() {
    leaveNet();
    const gen = S.gen;
    setTimeout(() => { if (gen === S.gen && S.db) queue(gen); }, 300);
  }
  function roomValue(v) {
    if (!v) {
      if (S.phase === 'room') requeue();
      else if (S.phase === 'final') showResult(buildRes());
      return; // during a match keep the last copy and finish locally
    }
    S.room = v;
    if (S.phase === 'room') {
      const m = v.m || {};
      lobby(T('対戦相手が 見つかりました！'), Object.keys(m).map(id => cleanNick(m[id].n) + (id === S.uid ? ' (' + T('あなた') + ')' : '')), T('まもなく スタート…'));
      if (v.go) startOnline(v.go);
    } else if (S.phase === 'final' && v.res) showResult(v.res);
  }
  function roomWait(now) {
    const r = S.room; if (!r || !S.meta) return;
    const m = r.m || {}, at = typeof S.meta.at === 'number' ? S.meta.at : S.joinAt;
    if (!S.host) { if (now - S.joinAt > 15000) requeue(); return; } // the room never started
    if (S.goSent || !m[S.uid]) return;
    const inv = Object.keys(S.meta.inv || {});
    if (!(inv.every(id => m[id]) || now >= at + 5000)) return;
    const pres = Object.keys(m);
    if (pres.length < 2) { if (now >= at + 8000) requeue(); return; }
    S.goSent = true;
    const pl = pres.sort((a, b) => (m[a].j || 0) - (m[b].j || 0) || (a < b ? -1 : 1)).slice(0, MAX), n = {};
    pl.forEach(id => { n[id] = cleanNick(m[id].n) || '?'; });
    S.rref.child('go').set({ pl, n, st: Math.round(now + CD), dur: S.meta.dur || duration() }).catch(fail);
  }
  function startOnline(go) {
    if (!Array.isArray(go.pl) || go.pl.indexOf(S.uid) < 0) return requeue();
    S.go = go;
    startMatch({ seed: S.meta.sd >>> 0, st: +go.st, dur: Math.max(5, Math.min(900, +go.dur || duration())), pl: go.pl.slice(0, MAX), names: go.n || {}, me: S.uid });
  }

  // ---- the match (online and practice)
  function startMatch(o) {
    S.started = true; S.phase = 'countdown'; S.seed = o.seed; S.st = o.st; S.dur = o.dur; S.end = o.st + o.dur * 1000;
    S.me = o.me; S.pl = o.pl; S.names = Object.assign({}, o.names); S.names[o.me] = S.nick;
    S.myScore = 0; S.reported = 0; S.lastW = null; S.lastWAt = 0; S.resSent = false;
    if (S.practice) S.room = null;
    hideCard(); showHud();
    const players = S.pl.map(u => ({ uid: u, nick: S.names[u] || '?', me: u === o.me }));
    call('onStart', { seed: S.seed, startAt: S.st - S.off, endAt: S.end - S.off, duration: S.dur, players, practice: S.practice });
    S.myScore = 0;
    ensureTick(); tick();
  }
  function tick() {
    const now = sNow();
    switch (S.phase) {
      case 'queue': qEval(); break;
      case 'room': roomWait(now); break;
      case 'countdown': {
        const left = S.st - now;
        if (left > 0) { countdown(left > 3000 ? '…' : String(Math.ceil(left / 1000))); break; }
        S.phase = 'play'; countdown(T('スタート！'), true, 700); call('onGo');
      } // falls through
      case 'play': {
        S.myScore = score();
        if (!S.practice && S.rref && S.myScore !== S.lastW && performance.now() - S.lastWAt >= WRITE_MS) {
          S.lastW = S.myScore; S.lastWAt = performance.now();
          S.rref.child('s/' + S.uid).set(S.myScore).catch(() => {});
        }
        if (now >= S.end) finish();
        break;
      }
      case 'final': finalWait(now); break;
    }
    if (S.phase === 'countdown' || S.phase === 'play' || S.phase === 'final') renderHud(false);
  }
  function finish() {
    S.myScore = score();
    S.phase = 'final'; S.finalAt = sNow();
    call('onEnd');
    countdown(T('タイムアップ！'), true);
    renderHud(true);
    if (S.practice) { const gen = S.gen; setTimeout(() => { if (gen === S.gen && S.phase === 'final') showResult(buildRes()); }, 1300); return; }
    if (S.rref) S.rref.update({ ['s/' + S.uid]: S.myScore, ['f/' + S.uid]: S.myScore }).catch(() => {});
  }
  function hostId() { const m = (S.room && S.room.m) || {}; return S.pl.find(id => m[id]) || null; }
  function finalWait(now) {
    if (S.practice) return;
    const r = S.room || {};
    if (r.res) return showResult(r.res);
    if (now - S.finalAt > 900) countdown(T('けっかを 集計中…'), true);
    const m = r.m || {}, f = r.f || {};
    if (hostId() === S.uid && !S.resSent) {
      const allIn = S.pl.filter(id => m[id]).every(id => f[id] != null);
      if (allIn || now >= S.end + GRACE) {
        S.resSent = true;
        const res = buildRes();
        S.rref.child('res').set(Object.assign({ at: S.TS }, res)).catch(() => showResult(res));
      }
    } else if (now >= S.end + GRACE + 6000) showResult(buildRes()); // the deciding player vanished
  }
  function buildRes() { return { r: standings().map(p => ({ u: p.u, n: p.n, v: p.v, x: p.x ? 1 : 0 })) }; }
  function showResult(res) {
    if (S.phase === 'result') return;
    S.phase = 'result';
    hideCountdown(); hideHud();
    const rows = (res && Array.isArray(res.r) ? res.r : []).map(p => ({ u: p.u, n: cleanNick(p.n) || '?', v: Math.max(0, Math.floor(+p.v || 0)), x: !!p.x }));
    rows.forEach(p => { p.rank = 1 + rows.filter(q => q.v > p.v).length; });
    const mine = rows.find(p => p.u === S.me) || { rank: 1, v: S.myScore };
    // leave the room; the deciding player (or the last one here) removes it a little later
    if (!S.practice && S.rref) {
      const rref = S.rref, m = (S.room && S.room.m) || {}, host = hostId() === S.uid || Object.keys(m).every(id => id === S.uid);
      stopListeners();
      try { const me = rref.child('m/' + S.uid); me.onDisconnect().cancel(); if (!host) me.remove().catch(() => {}); } catch (e) {}
      if (host) setTimeout(() => rref.remove().catch(() => {}), 6000);
      S.rref = null; S.rid = null; S.host = false;
      saveStats(mine.rank, rows.length, mine.v);
    }
    const unit = O.unit ? '<small> ' + esc(O.unit) + '</small>' : '';
    const list = '<ol class="kvs-res">' + rows.map(p => '<li class="' + (p.u === S.me ? 'me' : '') + (p.x ? ' x' : '') + '"><i>' + esc(ordinal(p.rank)) + '</i><span>' + esc(p.n) +
      (p.u === S.me ? ' (' + esc(T('あなた')) + ')' : '') + (p.x ? '<em class="kvs-tag">' + esc(T('切断')) + '</em>' : '') + '</span><b>' + fmt(p.v) + '</b>' + unit + '</li>').join('') + '</ol>';
    const st = readStats()[game()] || { plays: 0, wins: 0, best: 0 };
    card({ kick: O.title + ' ・ ' + (S.practice ? T('練習') : T('オンライン対戦')), title: T('結果'),
      html: (S.practice ? '<div class="kvs-rank">' + fmt(mine.v) + unit + '</div><p class="kvs-sub">' + esc(T('練習の記録は残りません')) + '</p>'
        : '<div class="kvs-rank">' + esc(ordinal(mine.rank)) + '</div>' + list +
          '<p class="kvs-sub">' + esc(T('オンライン {w}勝 / {p}戦 ・ ベスト {b}', { w: st.wins, p: st.plays, b: fmt(st.best) })) + '</p>'),
      buttons: [{ id: 'again', label: T('もう一度'), on: () => (S.practice ? practice() : open()) }, { id: 'quit', label: T('やめる'), sub: true, on: close }] });
  }

  // ---- stats: kusoge.vs.stats = { [game]: { plays, wins, best } }
  function readStats() { try { const o = JSON.parse(ls.get(STATS) || '{}'); return o && typeof o === 'object' ? o : {}; } catch (e) { return {}; } }
  function saveStats(rank, n, v) {
    const all = readStats(), g = Object.assign({ plays: 0, wins: 0, best: 0 }, all[game()]);
    g.plays++; if (n >= 2 && rank === 1) g.wins++; g.best = Math.max(g.best || 0, v);
    all[game()] = g; ls.set(STATS, JSON.stringify(all));
  }

  // ---------------------------------------------------------------- public API
  function init(opts) {
    O = Object.assign({ duration: 180 }, opts || {});
    if (!O.game || !/^[a-z0-9_-]+$/i.test(O.game)) throw new Error('KoboVersus.init: game id required');
    injectCss(O.theme);
    const sync = () => { if (window.KoboCloud && KoboCloud.sync) KoboCloud.sync({ [STATS]: 'newest' }); };
    if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', sync); else setTimeout(sync, 0);
    window.addEventListener('pagehide', () => { if (S.phase !== 'off') leaveNet(); });
  }
  function button(el, o) {
    if (!el) return null;
    o = o || {};
    const b = document.createElement('button');
    b.type = 'button'; b.className = 'kvs-entry' + (o.compact ? ' compact' : '');
    b.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">' +
      '<circle cx="8" cy="8" r="3"/><circle cx="16" cy="8" r="3"/><path d="M2.5 19c.6-3 2.8-5 5.5-5s4.9 2 5.5 5M13 14.5c.9-.3 1.9-.5 3-.5 2.7 0 4.9 2 5.5 5"/></svg><span></span>';
    b.querySelector('span').textContent = o.compact ? T('対戦') : T('オンライン対戦');
    b.setAttribute('aria-label', T('オンライン対戦'));
    b.addEventListener('click', e => { e.stopPropagation(); e.preventDefault(); open(); });
    b.addEventListener('pointerdown', e => e.stopPropagation());
    el.appendChild(b);
    return b;
  }
  window.KoboVersus = {
    init, button, open, practice, close, rng,
    canPlay: () => S.phase === 'play',
    active: () => S.phase !== 'off',
    reportScore(n) { S.reported = Math.max(0, Math.floor(Number(n) || 0)); },
    stats: () => readStats(),
  };
  if (DEBUG) window.__koboVs = { get state() { return { phase: S.phase, seed: S.seed, uid: S.uid, rid: S.rid, pl: S.pl.slice(), names: S.names, room: S.room, myScore: S.myScore, practice: S.practice, st: S.st, end: S.end, off: S.off }; }, sNow };
})();
