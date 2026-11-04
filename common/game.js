// ひまつぶし工房：ゲーム側の約束事 KoboGame（全ゲーム共通）
// ---------------------------------------------------------------------------------
// 読み込み：</body> の前、ゲーム本体の後（SYSTEM_ARCHITECTURE.md 1章）。platform.js がなくても動く
//           （そのときイベントはこのファイルの中だけで配る）。各ゲームは window.KoboGame && KoboGame.register(...) と確かめて呼ぶ。
//
//   KoboGame.register({
//     id: 'blocks',                          必須。common/games.js の ID
//     pause(reason) {},                      止める（入力・時間・音）。何度呼ばれてもよいこと
//     resume(reason) {},                     再開できるようにする（実際の再開はプレイヤーが「つづける」を押したとき）
//     dispose() {},                          WebGL・AudioNode・タイマー・リスナーを解放する
//     isIdle() { return !playing; },         遊んでいないなら true（cloud.js が自動で再読み込みしてよいか）
//     save() {},                             任意。手番制（flags.pause:false）のゲームで、隠れたときに保存する
//     restore() {},                          任意。WebGL の context が戻ったときに作り直す（ないときは保存して再読み込み）
//     daily: { start({ seed, dateKey }) {} }, flags.daily のゲームだけ。?daily=YYYYMMDD で開いたときに呼ぶ
//     menu: { extra: [] },                   共通メニューに足す項目（任意。ui.js が読む）
//   }) → KoboGame
//   KoboGame.emit(type, payload) / KoboGame.report(type, payload)   'play_start' | 'play_end' | 'best' | 'stage_clear' | 'progress'
//        game と t は自動で足す。play_end の durationMs がなければ、play_start からの実時間を入れる（wallMs は常に入れる）
//   KoboGame.on(type, f) → off()            'achievement' などを受け取る（platform.js があればそのバス）
//   KoboGame.pause(reason) / resume(reason) / dispose() / isIdle() / paused() / playing()
//   KoboGame.menuOpened() / menuClosed()    共通メニューを開いた・閉じた（pause / resume）
//   KoboGame.watchGL(canvas, { onLost, onRestored })   webglcontextlost / restored を扱う（R15）
//   KoboGame.info() → { id, def, launch, paused, playing }
// 自動で止めるとき：visibilitychange（hidden）、pagehide、共通メニュー、対戦の画面（versus の onOpen で KoboGame.pause('versus')）。
// 戻ったとき（visible、pageshow）は resume() を呼ぶ。resume は「つづける」を出すだけにして、勝手に時間を進めないこと。
// 自動の resume は、同じ種類の理由で止めたときだけ（メニューで止めたなら、隠して戻ってもメニューを閉じるまで止まったまま）。
// flags.pause:false（手番制）のゲームは pause/resume を呼ばず、隠れたときに save() だけを呼ぶ。
(function (root) {
  'use strict';

  var EVENTS = ['play_start', 'play_end', 'best', 'stage_clear', 'progress'];
  var MODES = ['normal', 'daily', 'versus', 'practice'];
  var hooks = null, def = null, gameId = null, launchInfo = null;
  var isPaused = false, isPlaying = false, isDisposed = false, startWall = 0, startMode = 'normal';
  var bound = [], localBus = {};
  var log = [];

  var P = function () { return root.KoboPlatform || null; };
  var now = function () { return Date.now(); };
  var isObj = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };
  function call(name, arg) {
    if (!hooks || typeof hooks[name] !== 'function') return undefined;
    try { return hooks[name](arg); } catch (e) { if (root.console) console.warn('KoboGame.' + name, e); return undefined; }
  }
  function listen(target, type, f, opt) {
    if (!target || typeof target.addEventListener !== 'function') return;
    target.addEventListener(type, f, opt);
    bound.push(function () { try { target.removeEventListener(type, f, opt); } catch (e) {} });
  }

  // ------------------------------------------------------------------ events
  function localOn(type, f) {
    (localBus[type] = localBus[type] || []).push(f);
    return function () { var a = localBus[type] || [], i = a.indexOf(f); if (i >= 0) a.splice(i, 1); };
  }
  function localEmit(type, p) {
    (localBus[type] || []).concat(localBus['*'] || []).forEach(function (f) { try { f(p, type); } catch (e) {} });
  }
  function on(type, f) {
    if (typeof f !== 'function') return function () {};
    var pl = P();
    return pl ? pl.on(type, f) : localOn(type, f);
  }
  function emit(type, payload) {
    var p = Object.assign({}, isObj(payload) ? payload : {});
    if (!p.game) p.game = gameId;
    p.t = now();
    if (EVENTS.indexOf(type) >= 0 && !p.game) { if (root.console) console.warn('KoboGame.emit before register:', type); return p; }
    if (type === 'play_start') {
      p.mode = MODES.indexOf(p.mode) >= 0 ? p.mode : 'normal';
      if (p.mode === 'daily' && p.dateKey == null && launchInfo && launchInfo.daily) p.dateKey = launchInfo.daily;
      isPlaying = true; startWall = p.t; startMode = p.mode;
    } else if (type === 'play_end') {
      if (!p.mode) p.mode = isPlaying ? startMode : 'normal';
      p.wallMs = isPlaying ? p.t - startWall : null;
      if (p.durationMs == null && p.wallMs != null) p.durationMs = p.wallMs;
      if (['over', 'clear', 'quit'].indexOf(p.reason) < 0) p.reason = 'over';
      p.score = Number(p.score) || 0;
      isPlaying = false;
    }
    if (log.length > 200) log.shift();
    log.push({ type: type, p: p });
    var pl = P();
    if (pl) pl.emit(type, p); else localEmit(type, p);
    return p;
  }

  // ------------------------------------------------------------------ pause plumbing
  function flagPause() { return !def || !def.flags || def.flags.pause !== false; }
  // 自動で止めた理由と、それを戻してよい理由の組。メニューを開いたまま隠して戻っても、メニューは開いたまま
  var RESUMES = { visible: ['hidden', 'pagehide'], pageshow: ['hidden', 'pagehide'], menu: ['menu'] };
  var pauseReason = null;
  function pause(reason) {
    if (!hooks || isDisposed) return false;
    reason = reason || 'api';
    // 手番制のゲーム（flags.pause:false）は止めるものがないので、保存するだけ
    if (!flagPause()) { call('save', reason); return false; }
    if (isPaused) return false;
    isPaused = true; pauseReason = reason;
    call('pause', reason);
    localEmit('pause', { game: gameId, reason: reason });
    return true;
  }
  function resume(reason) {
    if (!hooks || isDisposed || !flagPause() || !isPaused) return false;
    reason = reason || 'api';
    if (RESUMES[reason] && RESUMES[reason].indexOf(pauseReason) < 0) return false;
    isPaused = false; pauseReason = null;
    call('resume', reason);
    localEmit('resume', { game: gameId, reason: reason });
    return true;
  }
  function dispose() {
    if (!hooks || isDisposed) return;
    isDisposed = true;
    call('dispose');
    bound.splice(0).forEach(function (f) { f(); });
  }
  function isIdle() {
    if (!hooks || isDisposed) return true;
    if (typeof hooks.isIdle === 'function') { var v = call('isIdle'); return v === undefined ? !isPlaying : !!v; }
    return !isPlaying;
  }

  // ------------------------------------------------------------------ WebGL context lost (R15)
  function watchGL(canvas, opt) {
    opt = opt || {};
    if (!canvas || typeof canvas.addEventListener !== 'function') return function () {};
    var lost = function (e) {
      if (e && e.preventDefault) e.preventDefault(); // これがないと restored が来ない
      pause('gl-lost');
      if (typeof opt.onLost === 'function') { try { opt.onLost(e); } catch (x) {} }
    };
    var restored = function (e) {
      if (typeof opt.onRestored === 'function') { try { opt.onRestored(e); } catch (x) {} return; }
      if (hooks && typeof hooks.restore === 'function') { call('restore'); return; }
      call('save', 'gl-restored');
      try { root.location.reload(); } catch (x) {}
    };
    listen(canvas, 'webglcontextlost', lost, false);
    listen(canvas, 'webglcontextrestored', restored, false);
    return function () {
      try { canvas.removeEventListener('webglcontextlost', lost, false); canvas.removeEventListener('webglcontextrestored', restored, false); } catch (e) {}
    };
  }

  // ------------------------------------------------------------------ register
  function register(h) {
    if (!h || typeof h.id !== 'string' || !h.id) throw new Error('KoboGame.register: id required');
    if (hooks && !isDisposed) {
      if (root.console) console.warn('KoboGame.register: already registered', gameId, '→', h.id);
      bound.splice(0).forEach(function (f) { f(); });
    }
    hooks = h; gameId = h.id; isDisposed = false; isPaused = false; pauseReason = null;
    var pl = P();
    def = pl ? pl.game(gameId) : (root.KOBO_REGISTRY ? root.KOBO_REGISTRY.byId(gameId) : null);
    if (!def && root.console) console.warn('KoboGame.register: unknown game id', gameId);
    launchInfo = pl ? pl.launch() : { daily: null, stage: null, code: null };

    var doc = root.document;
    listen(doc, 'visibilitychange', function () {
      if (doc.visibilityState === 'hidden' || doc.hidden === true) pause('hidden'); else resume('visible');
    });
    listen(root, 'pagehide', function () { pause('pagehide'); });
    listen(root, 'pageshow', function (e) { if (e && e.persisted) resume('pageshow'); });

    if (pl && pl.migrations) { try { pl.migrations.run(); } catch (e) {} }

    // ?daily=YYYYMMDD で開いたとき
    if (launchInfo.daily && def && def.flags && def.flags.daily && h.daily && typeof h.daily.start === 'function') {
      var dk = launchInfo.daily;
      var seed = pl ? pl.dailySeed(gameId, dk) : 0;
      var go = function () { try { h.daily.start({ seed: seed, dateKey: dk }); } catch (e) { if (root.console) console.warn('KoboGame daily.start', e); } };
      setTimeout(go, 0);
    }

    // テストのためのフック（?debug のときだけ）
    try {
      if (root.location && /[?&]debug\b/.test(root.location.search || '')) {
        root.__kb = { game: gameId, pause: pause, resume: resume, dispose: dispose, isIdle: isIdle,
          paused: function () { return isPaused; }, playing: function () { return isPlaying; }, events: log };
      }
    } catch (e) {}
    return KoboGame;
  }

  var KoboGame = {
    EVENTS: EVENTS.slice(),
    register: register,
    emit: emit, report: emit, on: on,
    pause: pause, resume: resume, dispose: dispose, isIdle: isIdle,
    paused: function () { return isPaused; },
    playing: function () { return isPlaying; },
    menuOpened: function () { return pause('menu'); },
    menuClosed: function () { return resume('menu'); },
    watchGL: watchGL,
    info: function () { return { id: gameId, def: def, launch: launchInfo, paused: isPaused, playing: isPlaying, disposed: isDisposed }; },
    _log: log,
  };
  root.KoboGame = KoboGame;
  if (typeof module === 'object' && module && module.exports) module.exports = KoboGame;
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
