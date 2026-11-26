// ひまつぶし工房：勉強ガード KoboStudyGuard（オプトイン。初期値はオフ。platform.js が「オンのとき」だけ読み込む）
// ---------------------------------------------------------------------------------
// オンにすると、ゲームのページで遊んでいる時間（見えていて、操作があるときだけ）がたまり、N 分ごとに
// まなびの工房（manabi/engine.js の getQuiz）の問題が出る。まちがえると問題が増え、短い時間に何度もまちがえると、
// しばらくゲームが止まる（まなびの工房とホームは使える）。「テスト期間：◯月◯日まで」を決めると、その日のあとは自動でオフ。
// 自分採点の問題（記述・証明）は出さない。まなびの工房の進み具合（XP・連続日数・箱）は変えない。
// この端末の localStorage だけに保存する（同期しない）：
//   kobo.sg       設定 { v, on, ask, min, q, lv, sub, ex, thr, win, lock, until, pin, note }
//   kobo.sg.run   進み具合 { v, acc（たまった時間 ms）, last, lockUntil, misses[], retryAt }
//   kobo.sg.skew  （?debug のときだけ）テスト用の時計のずれ
// ほんとうのところ：サイトのデータを消せば、設定も止まっている時間も消える。PIN はこの端末の中の「うっかり防止」で、
// 改ざん防止ではない。
//
//   KoboStudyGuard.open()                設定の画面を開く（ui.js の設定から）
//   KoboStudyGuard.settings() / enabled() / refresh()
//   KoboStudyGuard.core                  （純粋な部分。node のテストが使う）normSettings, createEngine, createSession, hashPin, …
//   ?debug のとき window.__sg           advance(ms) / state() / peek() / showQuiz() など（テスト用）
(function (root) {
  'use strict';

  // ================================================================= 純粋な部分（node でも動く）
  var KEY = 'kobo.sg', RUN = 'kobo.sg.run', SKEW = 'kobo.sg.skew';
  var MIN_CHOICES = [3, 5, 10, 15, 30], EX_CHOICES = [1, 2, 3], THR_CHOICES = [0, 3, 5, 8, 10], WIN_CHOICES = [10, 30, 60], LOCK_CHOICES = [5, 15, 30, 60];
  var LEVELS = ['JH', 'HS'], SUBJECTS = ['english', 'math', 'japanese', 'science', 'social', 'information'];
  var EXTRA_CAP = 10;          // 増える問題の上限（まちがい × ex が増えても、必要な正解数は q + 10 まで）
  var HARD_MISS = 15;          // 1回のクイズでこれだけまちがえたら、そこで終わりにする（終わらないのを防ぐ）
  var MAXGAP = 10000;          // 前の記録から 10 秒より空いたら、その間は数えない（隠れていた・止まっていた）
  var IDLE_MS = 180000;        // 3 分、何も操作がなければ数えない
  var GRACE_MS = 90000;        // 遊んでいる途中なら、最大でこれだけ区切りを待つ
  var DAY = 86400000, JST = 9 * 3600000;

  var isObj = function (v) { return !!v && typeof v === 'object' && !Array.isArray(v); };
  var pick = function (v, list, d) { v = Number(v); return list.indexOf(v) >= 0 ? v : d; };
  function jstDateKey(ms) { var d = new Date(ms + JST); return d.getUTCFullYear() * 10000 + (d.getUTCMonth() + 1) * 100 + d.getUTCDate(); }
  function validDateKey(k) {
    k = Number(k); if (!isFinite(k) || k < 20200101 || k > 20991231 || k !== Math.floor(k)) return 0;
    var y = Math.floor(k / 10000), m = Math.floor(k / 100) % 100, d = k % 100, t = new Date(Date.UTC(y, m - 1, d));
    return t.getUTCFullYear() === y && t.getUTCMonth() === m - 1 && t.getUTCDate() === d ? k : 0;
  }

  function defaults() {
    return { v: 1, on: false, ask: { s: '', n: 0, t: 0 }, min: 5, q: 2, lv: LEVELS.slice(), sub: [], ex: 1, thr: 5, win: 30, lock: 15, until: 0, pin: null, note: '' };
  }
  // どんな入力（壊れた JSON・古い形・知らない値）でも、安全な設定にする。on は true と書いてあるときだけオン
  function normSettings(raw) {
    var d = defaults();
    if (!isObj(raw)) return d;
    var s = d;
    s.on = raw.on === true;
    if (isObj(raw.ask)) {
      s.ask.s = ['yes', 'no', 'later'].indexOf(raw.ask.s) >= 0 ? raw.ask.s : '';
      s.ask.n = Math.max(0, Math.min(9, Math.floor(Number(raw.ask.n) || 0)));
      s.ask.t = isFinite(Number(raw.ask.t)) ? Math.max(0, Number(raw.ask.t)) : 0;
    }
    s.min = pick(raw.min, MIN_CHOICES, 5);
    var q = Math.floor(Number(raw.q)); s.q = q >= 1 && q <= 5 ? q : 2;
    var lv = Array.isArray(raw.lv) ? LEVELS.filter(function (x) { return raw.lv.indexOf(x) >= 0; }) : [];
    s.lv = lv.length ? lv : LEVELS.slice();
    var sub = Array.isArray(raw.sub) ? SUBJECTS.filter(function (x) { return raw.sub.indexOf(x) >= 0; }) : [];
    s.sub = sub.length === SUBJECTS.length ? [] : sub; // [] = ぜんぶ
    s.ex = pick(raw.ex, EX_CHOICES, 1);
    s.thr = pick(raw.thr, THR_CHOICES, 5);
    s.win = pick(raw.win, WIN_CHOICES, 30);
    s.lock = pick(raw.lock, LOCK_CHOICES, 15);
    s.until = validDateKey(raw.until);
    s.pin = isObj(raw.pin) && /^[0-9a-f]{8,64}$/.test(String(raw.pin.s)) && /^[0-9a-f]{64}$/.test(String(raw.pin.h)) ? { s: String(raw.pin.s), h: String(raw.pin.h) } : null;
    s.note = raw.note === 'until' ? 'until' : '';
    return s;
  }
  function normRun(raw) {
    var r = { v: 1, acc: 0, last: 0, lockUntil: 0, misses: [], retryAt: 0 };
    if (!isObj(raw)) return r;
    var n = function (x) { x = Number(x); return isFinite(x) && x > 0 ? x : 0; };
    r.acc = Math.min(n(raw.acc), 7 * DAY); r.last = n(raw.last); r.lockUntil = n(raw.lockUntil); r.retryAt = n(raw.retryAt);
    r.misses = Array.isArray(raw.misses) ? raw.misses.map(Number).filter(function (x) { return isFinite(x) && x > 0; }).slice(-50) : [];
    return r;
  }
  function untilPassed(s, ms) { return !!(s.until && jstDateKey(ms) > s.until); }

  // ---- SHA-256（同期。PIN を平文で置かないためだけの小さな実装）
  var K256 = [0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5, 0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174, 0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da, 0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967, 0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85, 0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070, 0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3, 0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2];
  function sha256(str) {
    var b = [], i;
    var u = unescape(encodeURIComponent(String(str)));
    for (i = 0; i < u.length; i++) b.push(u.charCodeAt(i));
    var bl = b.length * 8; b.push(0x80);
    while (b.length % 64 !== 56) b.push(0);
    for (i = 7; i >= 0; i--) b.push(i > 3 ? 0 : (bl >>> (i * 8)) & 255);
    var H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19], w = new Array(64);
    var rr = function (x, n) { return (x >>> n) | (x << (32 - n)); };
    for (var o = 0; o < b.length; o += 64) {
      for (i = 0; i < 16; i++) w[i] = ((b[o + i * 4] << 24) | (b[o + i * 4 + 1] << 16) | (b[o + i * 4 + 2] << 8) | b[o + i * 4 + 3]) | 0;
      for (i = 16; i < 64; i++) {
        var s0 = rr(w[i - 15], 7) ^ rr(w[i - 15], 18) ^ (w[i - 15] >>> 3), s1 = rr(w[i - 2], 17) ^ rr(w[i - 2], 19) ^ (w[i - 2] >>> 10);
        w[i] = (w[i - 16] + s0 + w[i - 7] + s1) | 0;
      }
      var a = H[0], bb = H[1], c = H[2], d = H[3], e = H[4], f = H[5], g = H[6], h = H[7];
      for (i = 0; i < 64; i++) {
        var S1 = rr(e, 6) ^ rr(e, 11) ^ rr(e, 25), ch = (e & f) ^ (~e & g), t1 = (h + S1 + ch + K256[i] + w[i]) | 0;
        var S0 = rr(a, 2) ^ rr(a, 13) ^ rr(a, 22), mj = (a & bb) ^ (a & c) ^ (bb & c), t2 = (S0 + mj) | 0;
        h = g; g = f; f = e; e = (d + t1) | 0; d = c; c = bb; bb = a; a = (t1 + t2) | 0;
      }
      H[0] = (H[0] + a) | 0; H[1] = (H[1] + bb) | 0; H[2] = (H[2] + c) | 0; H[3] = (H[3] + d) | 0; H[4] = (H[4] + e) | 0; H[5] = (H[5] + f) | 0; H[6] = (H[6] + g) | 0; H[7] = (H[7] + h) | 0;
    }
    return H.map(function (x) { return ('00000000' + (x >>> 0).toString(16)).slice(-8); }).join('');
  }
  function hashPin(pin, salt) { var h = salt + ':' + pin; for (var i = 0; i < 1000; i++) h = sha256(h + salt); return h; }
  function makePin(pin, rnd) {
    var salt = ''; for (var i = 0; i < 4; i++) salt += ('00000000' + Math.floor((rnd ? rnd() : Math.random()) * 4294967296).toString(16)).slice(-8);
    return { s: salt, h: hashPin(String(pin), salt) };
  }
  var validPin = function (p) { return /^[0-9]{4}$/.test(String(p)); };
  function checkPin(s, pin) { return !!(s && s.pin) && validPin(pin) && hashPin(String(pin), s.pin.s) === s.pin.h; }

  // ---- クイズ1回ぶんの進み方。必要な正解数 = q + min(10, まちがい × ex)。まちがいが増えるたびに、答える問題が増える
  function createSession(o) {
    var q = o.q, ex = o.ex, st = { asked: 0, correct: 0, misses: 0 };
    var api = {
      st: st,
      required: function () { return q + Math.min(EXTRA_CAP, st.misses * ex); },
      extra: function () { return Math.min(EXTRA_CAP, st.misses * ex); },
      remaining: function () { return Math.max(0, api.required() - st.correct); },
      done: function () { return st.correct >= api.required() || st.misses >= HARD_MISS; },
      gaveUp: function () { return st.correct < api.required() && st.misses >= HARD_MISS; },
      // 1問ぶんの結果を入れる（ok=false ならまちがい）
      record: function (ok) { st.asked++; if (ok) st.correct++; else st.misses++; return api.done(); },
    };
    return api;
  }

  // ---- 時計・たまった時間・まちがいの数・お休み。保存先（store）と時計（now）を渡す（node のテストは偽物を渡す）
  function createEngine(env) {
    var store = env.store, now = env.now;
    var api = {
      settings: function () { return normSettings(store.get(KEY)); },
      saveSettings: function (s) { store.set(KEY, normSettings(s)); },
      patch: function (p) { var s = api.settings(); Object.keys(p).forEach(function (k) { s[k] = p[k]; }); api.saveSettings(s); return api.settings(); },
      run: function () { return normRun(store.get(RUN)); },
      saveRun: function (r) { store.set(RUN, r); },
      // 1秒ごとに呼ぶ。見えていて操作がある（env.active()）ときだけ、前の記録からの時間を足す
      tick: function () {
        var s = api.settings();
        if (!s.on) return { on: false };
        var t = now();
        if (untilPassed(s, t)) { s.on = false; s.note = 'until'; api.saveSettings(s); return { on: false, expired: true }; }
        var r = api.run(), d = t - r.last, credited = 0;
        r.last = t;
        if (r.lockUntil > t) { /* お休み中は数えない */ }
        else {
          var wasLocked = r.lockUntil > 0;
          if (wasLocked) { r.lockUntil = 0; r.misses = []; r.acc = 0; } // お休みが終わった：ここから数え直す（この1回は数えない）
          else if (d > 0 && d <= MAXGAP && (!env.active || env.active())) credited = d;
          r.acc += credited;
        }
        api.saveRun(r);
        var need = s.min * 60000;
        return { on: true, acc: r.acc, need: need, due: r.acc >= need && !(r.retryAt > t), locked: r.lockUntil > t, credited: credited };
      },
      // まちがいを1つ記録。しきい値に届いたらお休みにする
      recordMiss: function () {
        var s = api.settings(), r = api.run(), t = now(), locked = false;
        r.misses = r.misses.filter(function (x) { return t - x < s.win * 60000 && x <= t; }); r.misses.push(t);
        if (s.thr > 0 && r.misses.length >= s.thr) { r.lockUntil = t + s.lock * 60000; r.misses = []; r.acc = 0; locked = true; }
        api.saveRun(r);
        return { locked: locked, count: r.misses.length, lockUntil: r.lockUntil };
      },
      // クイズを終えた（やめた）：時間をゼロに戻す
      finishQuiz: function () { var r = api.run(); r.acc = 0; r.last = now(); r.retryAt = 0; api.saveRun(r); },
      // 問題が読めなかった：責めずに、少しあとにもう一度
      retryLater: function (ms) { var r = api.run(); r.retryAt = now() + (ms || 60000); api.saveRun(r); },
      lockLeft: function () { var s = api.settings(); if (!s.on) return 0; var r = api.run(); return Math.max(0, r.lockUntil - now()); },
    };
    return api;
  }

  // ---- 設定のまとまりの小さな部品（画面なし）
  function shouldAsk(s, ms) { // 「勉強ガードを使いますか？」を出してよいか（ハブだけで出す）
    if (s.on || s.ask.s === 'yes' || s.ask.s === 'no') return false;
    if (s.ask.s === 'later') return s.ask.n < 2 && ms - s.ask.t > 7 * DAY;
    return true;
  }
  function untilLabel(k) { k = validDateKey(k); return k ? { m: Math.floor(k / 100) % 100, d: k % 100 } : null; }

  var core = {
    KEY: KEY, RUN: RUN, MIN_CHOICES: MIN_CHOICES, EX_CHOICES: EX_CHOICES, THR_CHOICES: THR_CHOICES, WIN_CHOICES: WIN_CHOICES, LOCK_CHOICES: LOCK_CHOICES,
    LEVELS: LEVELS, SUBJECTS: SUBJECTS, EXTRA_CAP: EXTRA_CAP, HARD_MISS: HARD_MISS, MAXGAP: MAXGAP, IDLE_MS: IDLE_MS,
    defaults: defaults, normSettings: normSettings, normRun: normRun, jstDateKey: jstDateKey, validDateKey: validDateKey, untilPassed: untilPassed, untilLabel: untilLabel,
    sha256: sha256, hashPin: hashPin, makePin: makePin, checkPin: checkPin, validPin: validPin,
    createSession: createSession, createEngine: createEngine, shouldAsk: shouldAsk,
  };
  if (typeof module === 'object' && module && module.exports) module.exports = { core: core };
  if (typeof document === 'undefined' || !root.document || typeof root.document.createElement !== 'function') return; // node：純粋な部分だけ

  // ================================================================= ここから画面（ブラウザだけ）
  var doc = root.document;
  var cur = doc.currentScript, MYSRC = cur && cur.src ? cur.src : '';
  var DEBUG = /[?&]debug\b/.test(root.location && root.location.search || '');
  var I = root.KoboI18n;
  var EN = {
    '勉強ガード': 'Study guard', '勉強ガードを使いますか？': 'Use the study guard?',
    '遊んでいる間、ときどき中学・高校の問題が出ます。まちがえると問題が増え、何度もまちがえるとゲームが少しお休みになります。': 'While you play, a few junior-high and high-school questions pop up now and then. Miss one and more come; miss a lot and the games take a short rest.',
    'はい': 'Yes', 'あとで': 'Later', 'いいえ': 'No', 'とじる': 'Close', 'ホーム': 'Home',
    'オン': 'On', 'オフ': 'Off', 'なし': 'None', '設定': 'Settings', '設定を開く': 'Open settings',
    '遊んでいる間だけ数えます。この端末の中だけで動き、サイトのデータを消すと設定も消えます。': 'Only play time counts. It runs on this device only; clearing site data erases the settings.',
    '勉強ガードをつかう': 'Use the study guard', '問題を出す間かく': 'Time between quizzes', '{n}分': '{n} min', '{n}分ごとに、ゲームのページで遊んだ時間を数えます（ページを閉じていた時間や、ほかのタブを見ていた時間は数えません）。': 'Play time on game pages is counted (time with the tab hidden or no input for 3 minutes is not).',
    '1回の問題数': 'Questions each time', '{n}問': '{n}', '学校': 'School level', '中学': 'Junior high', '高校': 'High school', '教科': 'Subjects',
    '英語': 'English', '数学': 'Math', '国語': 'Japanese', '理科': 'Science', '社会': 'Social studies', '情報': 'Information',
    'すべての教科': 'All subjects', 'まちがえたときに増える問題': 'Extra questions per miss', '{n}問ずつ': '+{n} each', 'まちがえるたびに、正解しないといけない問題が増えます（いちばん多くて10問ぶん）。': 'Each miss adds to the number you must get right (at most 10 extra).',
    'お休みになる、まちがいの数': 'Misses that cause a rest', 'お休みなし': 'Never', '{n}回': '{n}', 'まちがいを数える時間': 'Window for counting misses', 'お休みの長さ': 'Length of the rest',
    'テスト期間（この日までオン）': 'Test period (on until this date)', 'テスト期間：{m}月{d}日まで': 'Test period: until {m}/{d}', '日づけをけす': 'Clear date', '決めた日の次の日に、自動でオフになります。': 'It turns itself off the day after this date.',
    'PIN（4けた）': 'PIN (4 digits)', 'PINを入れると、設定を変えられます': 'Enter the PIN to change settings', 'PINをひらく': 'Unlock with PIN', 'PINがちがいます': 'Wrong PIN', 'しばらくしてからもう一度': 'Please wait a bit and try again',
    '新しいPIN': 'New PIN', 'もう一度': 'Again', 'PINをきめる': 'Set PIN', 'PINをなくす': 'Remove PIN', 'PINをきめました': 'PIN set', 'PINをなくしました': 'PIN removed', '4けたの数字を2回入れてください': 'Enter the same 4 digits twice', 'PINがあります': 'A PIN is set', 'PINはありません': 'No PIN',
    'PINは「うっかり防止」です。データはこの端末の中にあるので、サイトのデータを消されたら止められません。': 'The PIN only prevents accidents. Data lives on this device, so clearing site data gets around it.',
    'ためしに問題を出す': 'Try a quiz now', '（ためしでは、まちがえてもお休みにはなりません）': '(a trial never causes a rest)',
    '勉強の時間です': 'Study time', '{n}問めを解こう': 'Question {n}', 'あと{n}問で終わり': '{n} to go', '+{n}問ふえた': '+{n} added',
    'こたえあわせ': 'Check', 'つぎへ': 'Next', 'ゲームにもどる': 'Back to the game', 'せいかい！': 'Correct!', 'ざんねん…': 'Not quite…', '正解': 'Answer', '解説': 'Explanation', 'あなたの答え': 'Your answer',
    '自分の答えは合っていた': 'My answer was right', '合っていたことにしました': 'Marked as correct', '答えを入力': 'Type your answer', '記号をえらぼう': 'Pick one', '当てはまるものをすべてえらぼう': 'Pick all that apply', 'タップして順番にならべよう': 'Tap in order', '1つもどす': 'Undo one', 'クリア': 'Clear',
    '問題を読み込み中…': 'Loading questions…', '問題を読み込めませんでした。あとでもう一度出します。': 'Could not load questions. Will try again soon.', 'つづけて問題': 'Next set',
    'クリア！おつかれさま': 'Done! Nice work.', 'まちがいが多かったので、ここで終わります。': 'Too many misses, so we stop here.',
    '勉強ガードをオフにしました': 'Study guard turned off', 'テスト期間が終わったので、勉強ガードをオフにしました。': 'The test period ended, so the study guard was turned off.',
    'いまはお休み中': 'Taking a break', 'あと {t}': '{t} left', 'まちがいが続いたので、ゲームを少しお休みします。': 'Lots of misses, so the games rest for a bit.', 'まなびの工房で勉強する': 'Study in Manabi workshop', 'ホームへ': 'Go home', 'かくしています': 'Hidden', 'スクショは完全には防げません': 'Screenshots cannot be fully blocked', 'スマホでは、問題の画面で文字のコピーをさせず、画面が隠れたときは黒く隠します。': 'On phones, copying text is switched off on the quiz screen and the screen is blacked out when hidden.', 'お休みが終わりました': 'Break is over',
    '放送文': 'Listening script', '音声はありません。放送文を読んで答えよう。': 'No audio. Read the script and answer.',
    '問題の文': 'Question text', '選択肢': 'Choices',
  };
  if (I && I.add) try { I.add({ en: EN }); } catch (e) {}
  var T = function (ja, v) { return I && I.t ? I.t(ja, v) : String(ja).replace(/\{(\w+)\}/g, function (m, k) { return v && k in v ? v[k] : m; }); };

  // ---- 保存（platform.js の store があればそれ。なければ localStorage）。壊れていても、ここでは落とさない
  var P = function () { return root.KoboPlatform || null; };
  var store = {
    get: function (k) { var p = P(); if (p && p.store) return p.store.get(k, null); try { var v = root.localStorage.getItem(k); return v == null ? null : JSON.parse(v); } catch (e) { return null; } },
    set: function (k, v) { var p = P(); if (p && p.store) return p.store.set(k, v); try { root.localStorage.setItem(k, JSON.stringify(v)); } catch (e) {} },
  };
  var skew = function () { if (!DEBUG) return 0; try { return Number(root.localStorage.getItem(SKEW)) || 0; } catch (e) { return 0; } };
  var clock = function () { return Date.now() + skew(); };

  // ---- どのページか。遊ぶページ（ゲーム）だけで数えて、止める。ハブ・まなび・about・profile・ranking は対象外
  var EXEMPT = ['manabi', 'about', 'profile', 'ranking', 'tools', 'docs'];
  function pageInfo() {
    var base = MYSRC ? new URL('../', MYSRC).pathname : '/';
    var path = (root.location.pathname || '/'); if (path.indexOf(base) === 0) path = path.slice(base.length); else path = path.replace(/^\/+/, '');
    var seg = path.split('/')[0] || '';
    var hub = !seg || /^index\.html?$/.test(seg);
    return { hub: hub, manabi: seg === 'manabi', game: !hub && EXEMPT.indexOf(seg) < 0 };
  }
  var PAGE = pageInfo();
  var siteUrl = function (p) { try { return new URL('../' + p, MYSRC || root.location.href).href; } catch (e) { return '../' + p; } };

  // ---- 操作があったか（遊んでいない画面を数えないため）
  var lastInput = Date.now();
  function touchInput() { lastInput = Date.now(); }
  ['pointerdown', 'keydown', 'touchstart', 'wheel', 'pointermove'].forEach(function (ev) { try { root.addEventListener(ev, touchInput, { passive: true, capture: true }); } catch (e) {} });
  var visible = function () { return doc.visibilityState !== 'hidden' && doc.hidden !== true; };
  var inputOk = function () { return Date.now() - lastInput < IDLE_MS; };

  var eng = createEngine({ store: store, now: clock, active: function () { return PAGE.game && visible() && inputOk() && !overlayOpen(); } });

  // ---- DOM の小さな部品
  function h(tag, attrs, kids) {
    var e = doc.createElement(tag), k;
    if (attrs) for (k in attrs) {
      var v = attrs[k]; if (v == null || v === false) continue;
      if (k === 'class') e.className = v; else if (k === 'text') e.textContent = v;
      else if (k.slice(0, 2) === 'on') e.addEventListener(k.slice(2), v); else e.setAttribute(k, v === true ? '' : v);
    }
    [].concat(kids == null ? [] : kids).forEach(function (c) { if (c != null && c !== false) e.append(c.nodeType ? c : doc.createTextNode(String(c))); });
    return e;
  }
  var CSS = [
    '.sg-ov{position:fixed;inset:0;z-index:2147483000;display:flex;align-items:center;justify-content:center;padding:max(10px,env(safe-area-inset-top)) max(10px,env(safe-area-inset-right)) max(10px,env(safe-area-inset-bottom)) max(10px,env(safe-area-inset-left));background:var(--kb-scrim,rgba(6,10,14,.72));font-family:var(--kb-font-body,system-ui,sans-serif);color:var(--kb-ink,#eef2f4);overscroll-behavior:contain}',
    '.sg-ov[hidden]{display:none}.sg-ov *,.sg-bn *{box-sizing:border-box}',
    '.sg-ov--sheet{align-items:flex-end;padding-bottom:0}',
    '.sg-panel{display:flex;flex-direction:column;width:100%;max-width:560px;max-height:100%;max-height:calc(var(--kb-vh,100vh) - 20px);background:var(--kb-surface,#263744);border:1px solid var(--kb-line,#3a4f5f);border-radius:16px;box-shadow:var(--kb-shadow,0 8px 24px rgba(0,0,0,.4));overflow:hidden}',
    '.sg-ov--sheet .sg-panel{border-radius:16px 16px 0 0;max-width:520px}',
    '.sg-panel--fix{height:640px;height:min(640px,calc(var(--kb-vh,100vh) - 20px))}', // 中身が変わっても、枠の大きさは変えない（ずれを出さない）
    '.sg-hd{flex:0 0 auto;display:flex;flex-wrap:wrap;align-items:center;gap:2px 8px;padding:12px 14px;border-bottom:1px solid var(--kb-line,#3a4f5f)}',
    '.sg-hd h2{margin:0;font-size:16px;line-height:1.3;flex:1 1 100%}.sg-hd .sg-st{flex:1 1 100%;min-height:2.7em}',
    '.sg-st{font-size:12.5px;color:var(--kb-dim,#9fb1bd);margin:0}',
    '.sg-bd{flex:1 1 auto;min-height:0;overflow-y:auto;overscroll-behavior:contain;padding:12px 14px;font-size:15px;line-height:1.55;-webkit-overflow-scrolling:touch}',
    '.sg-ft{flex:0 0 auto;min-height:calc(55px + max(10px,env(safe-area-inset-bottom)));display:flex;flex-direction:column;gap:8px;padding:10px 14px max(10px,env(safe-area-inset-bottom));border-top:1px solid var(--kb-line,#3a4f5f);background:var(--kb-surface,#263744)}',
    '.sg-btn{appearance:none;display:inline-flex;align-items:center;justify-content:center;gap:6px;min-height:44px;min-width:44px;padding:8px 16px;border-radius:12px;border:1px solid var(--kb-line,#3a4f5f);background:var(--kb-surface-2,#2f4352);color:var(--kb-ink,#eef2f4);font:inherit;font-weight:700;font-size:15px;line-height:1.2;cursor:pointer;text-decoration:none;text-align:center}',
    '.sg-btn:disabled{opacity:.5;cursor:default}.sg-btn--p{background:var(--kb-accent,#f2b33d);border-color:transparent;color:var(--kb-accent-ink,#2b1d05)}',
    '.sg-btn--ok{background:var(--kb-ok,#4cc38a);color:var(--kb-ok-ink,#04210f);border-color:transparent}.sg-btn--ng{background:var(--kb-danger,#ff6b6b);color:var(--kb-danger-ink,#2a0606);border-color:transparent}',
    '.sg-btn--g{background:transparent}',
    '.sg-ov :focus-visible,.sg-bn :focus-visible{outline:3px solid var(--kb-focus,#f2b33d);outline-offset:2px}',
    '.sg-tags{display:flex;flex-wrap:wrap;gap:6px;margin:0 0 8px}.sg-tag{font-size:12px;padding:2px 8px;border-radius:999px;background:var(--kb-surface-2,#2f4352);color:var(--kb-dim,#9fb1bd)}',
    '.sg-stim{margin:0 0 10px;padding:10px;border:1px solid var(--kb-line,#3a4f5f);border-radius:10px;background:var(--kb-sunken,#18232c);max-height:30vh;overflow:auto;font-size:14px}',
    '.sg-stem{font-size:16px;margin:0 0 10px;overflow-wrap:anywhere}',
    '.sg-ch{display:flex;align-items:center;gap:10px;width:100%;min-height:44px;margin:0 0 8px;padding:8px 12px;text-align:left;border-radius:12px;border:2px solid var(--kb-line,#3a4f5f);background:var(--kb-surface-2,#2f4352);color:var(--kb-ink,#eef2f4);font:inherit;cursor:pointer}',
    '.sg-ch .k{flex:0 0 auto;min-width:1.6em;height:1.6em;border-radius:50%;display:inline-flex;align-items:center;justify-content:center;background:var(--kb-surface,#263744);font-weight:800;font-size:13px}',
    '.sg-ch .x{flex:1 1 auto;min-width:0;overflow-wrap:anywhere}.sg-ch[aria-pressed="true"]{border-color:var(--kb-accent,#f2b33d);background:var(--kb-accent-soft,rgba(242,179,61,.16))}',
    '.sg-ch.good{border-color:var(--kb-ok,#4cc38a)}.sg-ch.bad{border-color:var(--kb-danger,#ff6b6b)}',
    '.sg-ord{display:flex;flex-wrap:wrap;gap:6px;min-height:44px;margin:0 0 8px;padding:6px;border:2px dashed var(--kb-line,#3a4f5f);border-radius:12px}.sg-ord .sg-ch{width:auto;margin:0}',
    '.sg-in{width:100%;min-height:44px;padding:8px 12px;border-radius:12px;border:2px solid var(--kb-line,#3a4f5f);background:var(--kb-sunken,#18232c);color:var(--kb-ink,#eef2f4);font:inherit;font-size:16px}',
    '.sg-fb{margin:10px 0 0;padding:10px 12px;border-radius:12px;border:2px solid var(--kb-line,#3a4f5f);font-size:14px}.sg-fb.ok{border-color:var(--kb-ok,#4cc38a)}.sg-fb.ng{border-color:var(--kb-danger,#ff6b6b)}',
    '.sg-fb b{display:block;font-size:16px;margin:0 0 4px}.sg-lab{color:var(--kb-dim,#9fb1bd);font-size:12px;margin-right:6px}.sg-fb .row{margin:4px 0}',
    '.sg-m.raw{font-family:ui-monospace,monospace;font-size:.95em}.sg-tbl{overflow-x:auto;margin:0 0 8px}.sg-tbl table{border-collapse:collapse;font-size:13px}.sg-tbl th,.sg-tbl td{border:1px solid var(--kb-line,#3a4f5f);padding:3px 6px}',
    '.sg-fig img{max-width:100%;height:auto;background:#fff;border-radius:8px}',
    '.sg-sec{margin:0 0 14px}.sg-sec>.sg-k{display:block;font-weight:800;font-size:14px;margin:0 0 6px}.sg-sec small,.sg-note{display:block;color:var(--kb-dim,#9fb1bd);font-size:12.5px;line-height:1.5;margin:4px 0 0}',
    '.sg-seg{display:flex;flex-wrap:wrap;gap:6px}.sg-seg button{flex:1 1 58px;padding:8px 6px;white-space:nowrap}.sg-seg button[aria-checked="true"]{background:var(--kb-accent,#f2b33d);color:var(--kb-accent-ink,#2b1d05);border-color:transparent}',
    '.sg-chk{display:flex;align-items:center;gap:10px;min-height:44px;padding:4px 8px;border-radius:10px;cursor:pointer}.sg-chk input{width:22px;height:22px;flex:0 0 auto;accent-color:var(--kb-accent,#f2b33d)}',
    '.sg-grid{display:grid;grid-template-columns:repeat(auto-fill,minmax(130px,1fr));gap:2px 8px}',
    '.sg-sw{display:flex;align-items:center;justify-content:space-between;gap:12px;width:100%;min-height:52px;padding:8px 14px;border-radius:14px;border:2px solid var(--kb-line,#3a4f5f);background:var(--kb-surface-2,#2f4352);color:var(--kb-ink,#eef2f4);font:inherit;font-weight:800;font-size:16px;cursor:pointer}.sg-sw[aria-checked="true"]{border-color:var(--kb-ok,#4cc38a)}',
    '.sg-sw .pill{min-width:56px;padding:4px 10px;border-radius:999px;text-align:center;background:var(--kb-surface,#263744);font-size:14px}.sg-sw[aria-checked="true"] .pill{background:var(--kb-ok,#4cc38a);color:var(--kb-ok-ink,#04210f)}',
    '.sg-row{display:flex;flex-wrap:wrap;gap:8px;align-items:center}.sg-row .sg-in{flex:1 1 120px;width:auto}.sg-msg{min-height:1.4em;font-size:13px;margin:4px 0 0}',
    '.sg-lock{text-align:center}.sg-big{font-size:clamp(34px,12vw,56px);font-weight:900;font-variant-numeric:tabular-nums;margin:6px 0}',
    '.sg-prot,.sg-prot *{-webkit-user-select:none;user-select:none;-webkit-touch-callout:none;-webkit-tap-highlight-color:transparent}.sg-prot input{-webkit-user-select:text;user-select:text}.sg-prot img{-webkit-user-drag:none}',
    '.sg-cover{display:none;position:absolute;inset:0;z-index:2;background:#000;color:#cfd8dc;align-items:center;justify-content:center;text-align:center;font-size:14px;white-space:pre-line;padding:20px}.sg-blank .sg-cover{display:flex}',
    '.sg-bn{position:fixed;left:max(10px,env(safe-area-inset-left));right:max(10px,env(safe-area-inset-right));bottom:max(10px,env(safe-area-inset-bottom));z-index:2147482000;max-width:520px;margin:0 auto;padding:12px 14px;border-radius:16px;background:var(--kb-surface,#263744);border:1px solid var(--kb-line,#3a4f5f);box-shadow:var(--kb-shadow,0 8px 24px rgba(0,0,0,.4));color:var(--kb-ink,#eef2f4);font-family:var(--kb-font-body,system-ui,sans-serif);font-size:14px;line-height:1.5}',
    '.sg-bn h2{margin:0 0 4px;font-size:16px}.sg-bn p{margin:0 0 10px}.sg-bn .btns{display:flex;flex-wrap:wrap;gap:8px}.sg-bn .btns .sg-btn{flex:1 1 80px}',
  ].join('\n');
  var cssDone = false;
  function ensureCss() {
    if (cssDone || !doc.head) return; cssDone = true;
    var st = doc.createElement('style'); st.setAttribute('data-sg', ''); st.textContent = CSS; doc.head.appendChild(st);
  }

  // ---- 重なり（おおい）の共通部分：背景を inert に、Tab を中に閉じこめ、キーをゲームに渡さない
  var overlays = [];
  function overlayOpen() { return overlays.length > 0; }
  // ---- 写し取りへの軽い対策（スマホ・タブレットだけ。クイズとお休みの画面が開いている間だけ。ベストエフォート）
  // ウェブページは、OS のスクリーンショットを止められない（できるのはネイティブアプリだけ）。ここでやるのは次の2つだけで、見た目・押す場所は変えない：
  //   (a) 文字の選択・コピー・切り取り・貼り付け・長押しメニュー・ドラッグをさせない
  //   (b) 画面が隠れた・別の画面に移った（visibilitychange hidden / pagehide / window の blur）ときは、すぐ黒いおおいで隠し、戻ったらすぐ外す
  function touchDevice() {
    try { if (root.matchMedia && root.matchMedia('(pointer: coarse)').matches) return true; } catch (e) {}
    return 'ontouchstart' in root || (root.navigator && root.navigator.maxTouchPoints > 0);
  }
  function protect(api) {
    var ov = api.ov, st = { blank: false, reason: '', n: 0 }, offs = [];
    var cover = h('div', { class: 'sg-cover', 'aria-hidden': 'true' }, h('p', { text: T('かくしています') + '\n' + T('スクショは完全には防げません') }));
    ov.append(cover); ov.classList.add('sg-prot');
    function set(on, why) { if (st.blank === on) return; st.blank = on; st.reason = on ? why : ''; if (on) st.n++; ov.classList.toggle('sg-blank', on); }
    function on(t, type, f, o) { t.addEventListener(type, f, o); offs.push(function () { t.removeEventListener(type, f, o); }); }
    var inField = function (el) { return !!(el && el.closest && el.closest('input,textarea')); };
    ['copy', 'cut', 'paste', 'contextmenu', 'dragstart', 'drop'].forEach(function (t) { on(ov, t, function (e) { e.preventDefault(); }, true); });
    on(ov, 'selectstart', function (e) { if (!inField(e.target)) e.preventDefault(); }, true);
    on(doc, 'visibilitychange', function () { if (doc.visibilityState === 'hidden' || doc.hidden === true) set(true, 'hidden'); else set(false); });
    on(root, 'pagehide', function () { set(true, 'pagehide'); });
    on(root, 'pageshow', function () { set(false); });
    on(root, 'blur', function (e) { if (e.target === root) set(true, 'blur'); }, true);
    on(root, 'focus', function (e) { if (e.target === root) set(false); }, true);
    // 動けなくならないように：画面をさわったら、必ず外す（見えている間は押せる）
    on(ov, 'pointerdown', function () { if (st.blank && doc.visibilityState !== 'hidden') set(false); }, true);
    api.prot = { state: function () { return { blank: st.blank, reason: st.reason, n: st.n }; }, off: function () { offs.forEach(function (f) { f(); }); offs = []; cover.remove(); ov.classList.remove('sg-prot', 'sg-blank'); }, simulate: function (on, why) { set(!!on, why || 'sim'); } };
  }
  function mountOverlay(o) { // { cls, label, build(panel, api) , dismiss } → api
    ensureCss();
    var ov = h('div', { class: 'sg-ov' + (o.sheet ? ' sg-ov--sheet' : ''), 'data-sg-layer': o.kind || '' });
    var panel = h('div', { class: 'sg-panel' + (o.fix ? ' sg-panel--fix' : ''), role: o.role || 'dialog', 'aria-modal': 'true', 'aria-label': o.label || null, 'aria-labelledby': o.labelledby || null, tabindex: '-1' });
    ov.append(panel);
    var api = { ov: ov, panel: panel, closed: false, returnTo: doc.activeElement, inert: [] };
    // いま画面にあるもの（下のおおいも）を inert にして、閉じるときに戻す
    Array.prototype.slice.call(doc.body.children).forEach(function (c) { if (c.hasAttribute('inert')) return; c.setAttribute('inert', ''); api.inert.push(c); });
    doc.body.appendChild(ov);
    function focusables() { return Array.prototype.slice.call(panel.querySelectorAll('button,[href],input,select,textarea,[tabindex]:not([tabindex="-1"])')).filter(function (e) { return !e.disabled && !e.hidden && e.getClientRects().length; }); }
    api.focusables = focusables;
    function onKey(e) {
      if (api.closed || overlays[overlays.length - 1] !== api) return;
      if (e.type === 'keydown' && e.key === 'Escape') { e.preventDefault(); e.stopPropagation(); if (o.dismiss) o.dismiss(api); return; }
      if (!ov.contains(e.target)) { e.stopPropagation(); if (e.type === 'keydown' && e.key !== 'Tab') e.preventDefault(); }
      if (e.type === 'keydown' && e.key === 'Tab') {
        var f = focusables(); if (!f.length) { e.preventDefault(); panel.focus(); return; }
        var first = f[0], last = f[f.length - 1];
        if (!panel.contains(doc.activeElement)) { e.preventDefault(); first.focus(); }
        else if (e.shiftKey && doc.activeElement === first) { e.preventDefault(); last.focus(); }
        else if (!e.shiftKey && doc.activeElement === last) { e.preventDefault(); first.focus(); }
      }
    }
    ov.addEventListener('keydown', function (e) { e.stopPropagation(); });
    ov.addEventListener('keyup', function (e) { e.stopPropagation(); });
    ov.addEventListener('keypress', function (e) { e.stopPropagation(); });
    ['keydown', 'keyup', 'keypress'].forEach(function (t) { root.addEventListener(t, onKey, true); });
    api.close = function () {
      if (api.closed) return; api.closed = true; if (api.prot) api.prot.off();
      ['keydown', 'keyup', 'keypress'].forEach(function (t) { root.removeEventListener(t, onKey, true); });
      var i = overlays.indexOf(api); if (i >= 0) overlays.splice(i, 1);
      ov.remove();
      api.inert.forEach(function (c) { c.removeAttribute('inert'); });
      if (api.returnTo && api.returnTo.focus && doc.contains(api.returnTo)) { try { api.returnTo.focus({ preventScroll: true }); } catch (e) {} }
      if (o.onClose) o.onClose();
    };
    overlays.push(api);
    if (o.protect && touchDevice()) protect(api);
    return api;
  }
  function focusIn(api, sel) {
    var t = (sel && api.panel.querySelector(sel)) || api.focusables()[0] || api.panel;
    try { t.focus({ preventScroll: true }); } catch (e) {}
  }

  // ---- ゲームを止める・戻す（KoboGame があれば）
  var held = 0;
  function pauseGame() { if (!held++) { var G = root.KoboGame; try { if (G && G.pause) G.pause('guard'); } catch (e) {} } }
  function resumeGame() { if (held > 0 && !--held) { var G = root.KoboGame; try { if (G && G.resume) G.resume('guard'); } catch (e) {} } }
  var versusActive = false;
  try { var PL = P(); if (PL && PL.on) { PL.on('play_start', function (p) { versusActive = !!p && p.mode === 'versus'; }); PL.on('play_end', function () { versusActive = false; }); } } catch (e) {}

  // ================================================================= 数式（KaTeX 0.16.9 を、数式が出たときだけ読む。読めなければ TeX のまま）
  function loadKatex() {
    if (root.katex || doc.querySelector('script[data-sg-katex]')) return;
    var l = doc.createElement('link'); l.rel = 'stylesheet'; l.href = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.css';
    l.integrity = 'sha512-fHwaWebuwA7NSF5Qg/af4UeDx9XqUpYpOGgubo3yWu+b2IQR4UeQwbb42Ti7gVAjNtVoI/I9TEoYeu9omwcC6g=='; l.crossOrigin = 'anonymous'; l.referrerPolicy = 'no-referrer';
    doc.head.appendChild(l);
    var s = doc.createElement('script'); s.setAttribute('data-sg-katex', ''); s.src = 'https://cdnjs.cloudflare.com/ajax/libs/KaTeX/0.16.9/katex.min.js';
    s.integrity = 'sha512-LQNxIMR5rXv7o+b1l8+N1EZMfhG7iFZ9HhnbJkTp4zjNr5Wvst75AqUeFDxeRUa7l5vEDyUiAip//r+EFLLCyA=='; s.crossOrigin = 'anonymous'; s.referrerPolicy = 'no-referrer'; s.async = true;
    s.onload = function () { doc.documentElement.setAttribute('data-sg-katex', root.katex ? 'ok' : 'failed'); doc.querySelectorAll('.sg-m:not(.done)').forEach(renderMath); };
    s.onerror = function () { doc.documentElement.setAttribute('data-sg-katex', 'failed'); };
    doc.head.appendChild(s);
  }
  function renderMath(span) {
    var tex = span.getAttribute('data-tex'), disp = span.classList.contains('md');
    if (root.katex) { try { root.katex.render(tex, span, { displayMode: disp, throwOnError: false, strict: 'ignore', trust: false, output: 'html' }); span.classList.remove('raw'); span.classList.add('done'); return; } catch (e) {} }
    span.textContent = disp ? '$$' + tex + '$$' : '$' + tex + '$'; span.classList.add('raw');
  }
  var ME = function () { return root.ManabiEngine || null; };
  function rich(src) {
    var box = h('span', { class: 'sg-rich' }), E = ME();
    var toks = E ? E.tokenize(src) : [{ k: 't', v: String(src) }];
    toks.forEach(function (t) {
      if (t.k === 't') box.append(t.v);
      else if (t.k === 'm') { loadKatex(); var s = h('span', { class: 'sg-m' + (t.d ? ' md' : ''), 'data-tex': t.v }); renderMath(s); box.append(s); }
      else if (t.k === 'u') box.append(h('u', { text: t.v }));
      else if (t.k === 'b') box.append(h('span', { class: 'sg-blank', style: 'display:inline-block;min-width:3em;border-bottom:2px solid currentColor;text-align:center' }, t.v && t.v.trim() ? t.v : '　'));
      else if (t.k === 'k') box.append(h('span', null, [h('u', { text: t.v }), h('sup', { text: t.m })]));
    });
    return box;
  }
  function figEl(f) { return h('figure', { class: 'sg-fig', style: 'margin:0 0 8px' }, [h('img', { src: 'data:image/svg+xml;charset=utf-8,' + encodeURIComponent(f.s), alt: f.a || '' }), f.c ? h('figcaption', null, rich(f.c)) : null]); }
  function tblEl(tb) {
    var t = h('table');
    if (tb.c) t.append(h('caption', null, rich(tb.c)));
    if (tb.h) t.append(h('thead', null, h('tr', null, tb.h.map(function (c) { return h('th', null, rich(c)); }))));
    t.append(h('tbody', null, tb.r.map(function (r) { return h('tr', null, r.map(function (c) { return h('td', null, rich(c)); })); })));
    return h('div', { class: 'sg-tbl' }, t);
  }
  function stimEl(st) {
    var b = h('div', { class: 'sg-stim', tabindex: '0', role: 'group', 'aria-label': T('問題の文') });
    if (st.ti) b.append(h('div', { style: 'font-weight:800;margin:0 0 4px' }, rich(st.ti)));
    if (st.t === 'ls') b.append(h('div', { class: 'sg-note', text: T('放送文') + '：' + T('音声はありません。放送文を読んで答えよう。') }));
    if (st.c) b.append(rich(st.c));
    if (st.f) b.append(figEl(st.f));
    if (st.tb) b.append(tblEl(st.tb));
    return b;
  }

  // ================================================================= 問題の読み込み
  var engineP = null;
  function loadEngine() {
    if (root.KoboManabi && root.KoboManabi.getQuiz && root.ManabiEngine) return Promise.resolve();
    if (engineP) return engineP;
    engineP = new Promise(function (res, rej) {
      var s = doc.createElement('script'); s.src = new URL('../manabi/engine.js', MYSRC || root.location.href).href; s.async = true;
      s.onload = function () { root.KoboManabi && root.ManabiEngine ? res() : rej(new Error('engine')); }; s.onerror = function () { engineP = null; rej(new Error('engine load')); };
      doc.head.appendChild(s);
    });
    return engineP;
  }
  function fetchQuestions(s, n) {
    return loadEngine().then(function () { return root.KoboManabi.getQuiz({ n: n, subjects: s.sub.length ? s.sub : null, levels: s.lv }); });
  }

  // ================================================================= クイズの画面
  var quiz = null; // 開いているクイズ
  function showQuiz(opt) {
    opt = opt || {};
    if (quiz) return quiz.promise;
    var s = eng.settings(), trial = !!opt.trial;
    var sess = createSession({ q: s.q, ex: s.ex });
    var pool = [], seen = {}, getter = null, ui = null, cur = null, lastTotal = 0, finished = false, outcome = '';
    var layer = mountOverlay({ kind: 'quiz', fix: true, protect: true, label: T('勉強ガード'), labelledby: 'sg-qt', dismiss: null, onClose: function () { quiz = null; resumeGame(); } });
    var self = { layer: layer, sess: sess, trial: trial };
    pauseGame();
    var head = h('div', { class: 'sg-hd' }, [h('h2', { id: 'sg-qt', text: T('勉強の時間です') }), h('p', { class: 'sg-st', id: 'sg-prog', 'aria-live': 'polite' })]);
    var body = h('div', { class: 'sg-bd', id: 'sg-body' });
    var foot = h('div', { class: 'sg-ft', id: 'sg-foot' });
    layer.panel.append(head, body, foot);
    quiz = self;
    self.promise = new Promise(function (resolve) { self.resolve = resolve; });
    function end(why) {
      if (finished) return; finished = true; outcome = why;
      layer.close();
      self.resolve({ outcome: why, asked: sess.st.asked, correct: sess.st.correct, misses: sess.st.misses });
    }
    function progress() {
      var p = doc.getElementById('sg-prog'); if (!p) return;
      var rem = sess.remaining(), ex = sess.extra();
      p.textContent = T('あと{n}問で終わり', { n: rem }) + (ex ? ' ・ ' + T('+{n}問ふえた', { n: ex }) : '');
    }
    function nextQuestion() {
      while (pool.length) { var q = pool.shift(); if (!seen[q.id]) { seen[q.id] = 1; return q; } }
      return null;
    }
    function more() {
      var need = Math.min(50, Math.max(sess.remaining() + 6, 8));
      return fetchQuestions(s, need).then(function (z) { getter = z; pool = pool.concat(z.questions.filter(function (q) { return !seen[q.id]; })); return z; });
    }
    function loading() { body.replaceChildren(h('p', { text: T('問題を読み込み中…'), role: 'status' })); foot.replaceChildren(); }
    function failed() {
      body.replaceChildren(h('p', { text: T('問題を読み込めませんでした。あとでもう一度出します。') }));
      foot.replaceChildren(h('button', { class: 'sg-btn sg-btn--p', type: 'button', id: 'sg-close', onclick: function () { if (!trial) eng.retryLater(60000); end('failed'); } }, T('ゲームにもどる')));
      focusIn(layer, '#sg-close');
    }
    function ask() {
      if (sess.done()) return finish();
      var q = nextQuestion();
      if (!q) { loading(); return more().then(function () { var q2 = nextQuestion(); if (!q2) { outcome = 'nomore'; return finish(); } renderQ(q2); }, failed); }
      renderQ(q);
    }
    function finish() {
      var gaveUp = sess.gaveUp() || outcome === 'nomore';
      if (!trial) {
        eng.finishQuiz();
      }
      var locked = self.lockedNow;
      body.replaceChildren(h('div', { class: 'sg-lock' }, [
                h('p', { style: 'font-weight:800', text: locked ? T('まちがいが続いたので、ゲームを少しお休みします。') : gaveUp ? T('まちがいが多かったので、ここで終わります。') : T('クリア！おつかれさま') }),
      ]));
      foot.replaceChildren(h('button', { class: 'sg-btn sg-btn--p', type: 'button', id: 'sg-done', onclick: function () { end(locked ? 'locked' : gaveUp ? 'gaveup' : 'clear'); if (locked) tickUi(); } }, locked ? T('とじる') : T('ゲームにもどる')));
      var pg = doc.getElementById('sg-prog'); if (pg) pg.textContent = '';
      focusIn(layer, '#sg-done');
    }
    function renderQ(q) {
      progress();
      cur = ui = { q: q, sel: null, multi: [], order: [], checked: false, ok: null, overridden: false, committed: false };
      var tags = h('div', { class: 'sg-tags' }, [h('span', { class: 'sg-tag', text: T('{n}問めを解こう', { n: sess.st.asked + 1 }) }), h('span', { class: 'sg-tag', text: q.unitText || '' })]);
      var els = [tags];
      if (q.stimulus) els.push(stimEl(q.stimulus));
      if (q.figure) els.push(figEl(q.figure));
      if (q.table) els.push(tblEl(q.table));
      els.push(h('div', { class: 'sg-stem', id: 'sg-stem' }, rich(q.stem)));
      var ans = h('div', { id: 'sg-ans' });
      ui.ans = ans;
      if (q.type === 'mc' || q.type === 'ms') {
        ans.append(h('p', { class: 'sg-st', text: q.type === 'mc' ? T('記号をえらぼう') : T('当てはまるものをすべてえらぼう') }));
        var grp = h('div', { role: q.type === 'mc' ? 'radiogroup' : 'group', 'aria-label': T('選択肢') });
        q.choices.forEach(function (c) { grp.append(h('button', { class: 'sg-ch', type: 'button', 'data-label': c[0], 'aria-pressed': 'false', onclick: function () { choose(c[0]); } }, [h('span', { class: 'k', text: c[0] }), h('span', { class: 'x' }, rich(c[1]))])); });
        ans.append(grp);
      } else if (q.type === 'or') {
        ans.append(h('p', { class: 'sg-st', text: T('タップして順番にならべよう') }));
        ui.rowEl = h('div', { class: 'sg-ord', id: 'sg-ordrow', 'aria-live': 'polite' }); ui.poolEl = h('div', { id: 'sg-ordpool' });
        ans.append(ui.rowEl, ui.poolEl, h('div', { class: 'sg-row' }, [h('button', { class: 'sg-btn sg-btn--g', type: 'button', id: 'sg-oundo', onclick: function () { if (!ui.checked) { ui.order.pop(); drawOrder(); drawDock(); } } }, T('1つもどす')), h('button', { class: 'sg-btn sg-btn--g', type: 'button', id: 'sg-oclear', onclick: function () { if (!ui.checked) { ui.order = []; drawOrder(); drawDock(); } } }, T('クリア'))]));
        drawOrder();
      } else {
        var inp = h('input', { class: 'sg-in', id: 'sg-input', type: 'text', autocomplete: 'off', autocapitalize: 'off', spellcheck: 'false', enterkeyhint: 'done', 'aria-label': T('答えを入力'), placeholder: T('答えを入力') + (q.unitSuffix && q.type === 'nu' ? '（' + q.unitSuffix + '）' : ''),
          oninput: function () { drawDock(); }, onkeydown: function (e) { if (e.key === 'Enter') { e.preventDefault(); check(); } } });
        ui.input = inp; ans.append(inp);
      }
      els.push(ans);
      var fb = h('div', { id: 'sg-fbwrap', 'aria-live': 'polite' }); ui.fb = fb; els.push(fb);
      body.replaceChildren.apply(body, els); body.scrollTop = 0;
      drawDock();
      focusIn(layer, ui.input ? '#sg-input' : '.sg-ch');
    }
    function drawOrder() {
      var q = ui.q; ui.rowEl.replaceChildren(); ui.poolEl.replaceChildren();
      ui.order.forEach(function (l, i) {
        var c = q.choices.filter(function (x) { return x[0] === l; })[0];
        ui.rowEl.append(h('button', { class: 'sg-ch', type: 'button', 'data-label': l, disabled: ui.checked ? true : null, onclick: function () { if (ui.checked) return; ui.order.splice(i, 1); drawOrder(); drawDock(); } }, [h('span', { class: 'k', text: String(i + 1) }), h('span', { class: 'x' }, rich(c[1]))]));
      });
      q.choices.forEach(function (c) {
        if (ui.order.indexOf(c[0]) >= 0) return;
        ui.poolEl.append(h('button', { class: 'sg-ch', type: 'button', 'data-label': c[0], disabled: ui.checked ? true : null, onclick: function () { if (ui.checked) return; ui.order.push(c[0]); drawOrder(); drawDock(); } }, [h('span', { class: 'k', text: c[0] }), h('span', { class: 'x' }, rich(c[1]))]));
      });
    }
    function choose(label) {
      if (ui.checked) return; var q = ui.q;
      if (q.type === 'mc') ui.sel = label; else { var i = ui.multi.indexOf(label); if (i >= 0) ui.multi.splice(i, 1); else ui.multi.push(label); }
      Array.prototype.forEach.call(ui.ans.querySelectorAll('.sg-ch'), function (b) { var on = q.type === 'mc' ? b.getAttribute('data-label') === ui.sel : ui.multi.indexOf(b.getAttribute('data-label')) >= 0; b.setAttribute('aria-pressed', String(on)); });
      drawDock();
    }
    function input() { var q = ui.q; return q.type === 'mc' ? ui.sel : q.type === 'ms' ? ui.multi.slice() : q.type === 'or' ? ui.order.slice() : ui.input ? ui.input.value : ''; }
    function hasInput() { var q = ui.q; if (q.type === 'mc') return !!ui.sel; if (q.type === 'ms') return ui.multi.length > 0; if (q.type === 'or') return ui.order.length === q.choices.length; return !!(ui.input && ui.input.value.trim()); }
    function drawDock() {
      foot.replaceChildren();
      if (!ui.checked) { foot.append(h('button', { class: 'sg-btn sg-btn--p', type: 'button', id: 'sg-check', disabled: hasInput() ? null : true, onclick: check }, T('こたえあわせ'))); return; }
      foot.append(h('button', { class: 'sg-btn ' + (ui.ok ? 'sg-btn--ok' : 'sg-btn--ng'), type: 'button', id: 'sg-next', onclick: next }, T('つぎへ')));
    }
    function check() {
      if (ui.checked || !hasInput()) return;
      var q = ui.q, mine = input(), r = getter.check(q.id, mine);
      ui.checked = true; ui.ok = !!r.ok; ui.res = r;
      if (ui.input) ui.input.disabled = true;
      if (q.type === 'or') drawOrder();
      Array.prototype.forEach.call(ui.ans.querySelectorAll('.sg-ch'), function (b) { b.disabled = true; });
      if (q.type === 'mc' || q.type === 'ms') {
        Array.prototype.forEach.call(ui.ans.querySelectorAll('.sg-ch'), function (b) {
          var l = b.getAttribute('data-label'), on = q.type === 'mc' ? ui.sel === l : ui.multi.indexOf(l) >= 0;
          if (q.type === 'mc' && getter.check(q.id, l).ok) b.classList.add('good'); else if (on && !ui.ok) b.classList.add('bad');
        });
      }
      drawFb(); drawDock(); focusIn(layer, '#sg-next');
      try { ui.fb.scrollIntoView({ block: 'nearest' }); } catch (e) {}
    }
    function drawFb() {
      var r = ui.res, q = ui.q;
      var box = h('div', { class: 'sg-fb ' + (ui.ok ? 'ok' : 'ng'), id: 'sg-fb' }, [h('b', { id: 'sg-fbt', text: ui.ok ? T('せいかい！') : T('ざんねん…') })]);
      if (!ui.ok && (q.type === 'nu' || q.type === 'sa') && ui.input) box.append(h('div', { class: 'row' }, [h('span', { class: 'sg-lab', text: T('あなたの答え') }), ui.input.value]));
      if (r.correctText && r.correctText.length) box.append(h('div', { class: 'row' }, [h('span', { class: 'sg-lab', text: T('正解') }), r.correctText.map(function (t) { return h('div', null, rich(t)); })]));
      if (r.explanation) box.append(h('div', { class: 'row' }, [h('span', { class: 'sg-lab', text: T('解説') }), rich(r.explanation)]));
      if (!ui.ok && (q.type === 'nu' || q.type === 'sa') && !ui.overridden) box.append(h('button', { class: 'sg-btn sg-btn--g', type: 'button', id: 'sg-mine', onclick: override }, T('自分の答えは合っていた')));
      ui.fb.replaceChildren(box);
    }
    function override() { // 短答・数値だけ。まだ確定していないので、結果を書き換えるだけ
      if (!ui.checked || ui.ok || ui.overridden || ui.committed) return;
      ui.overridden = true; ui.ok = true; drawFb(); drawDock(); focusIn(layer, '#sg-next');
    }
    function next() {
      if (!ui.checked || ui.committed) return; ui.committed = true;
      var ok = ui.ok; sess.record(ok);
      if (!ok && !trial) { var m = eng.recordMiss(); if (m.locked) { self.lockedNow = true; return finish(); } }
      ask();
    }
    // 開始：問題を読み込む
    loading();
    more().then(function () { ask(); }, failed);
    // テスト用：いまの問題の正しい入力とまちがった入力
    self.peek = function () { return ui && !ui.checked ? peekAnswer(ui.q, getter) : null; };
    self.state = function () { return { asked: sess.st.asked, correct: sess.st.correct, misses: sess.st.misses, required: sess.required(), extra: sess.extra(), checked: ui ? ui.checked : null, ok: ui ? ui.ok : null, type: ui && ui.q ? ui.q.type : null, finished: finished }; };
    self.end = end;
    return self.promise;
  }

  // テスト用：正しい入力を、答え合わせの関数だけを使って探す（総当たり。答えそのものは持たない）
  function peekAnswer(q, z) {
    var c = function (a) { return !!z.check(q.id, a).ok; };
    var labels = (q.choices || []).map(function (x) { return x[0]; });
    if (q.type === 'mc') { var r = labels.filter(function (l) { return c(l); })[0]; return { t: 'mc', right: r, wrong: labels.filter(function (l) { return l !== r; })[0] }; }
    if (q.type === 'ms') {
      var n = labels.length, rs = null; for (var m = 1; m < (1 << n) && !rs; m++) { var sub = labels.filter(function (l, i) { return m & (1 << i); }); if (c(sub)) rs = sub; }
      var other = labels.filter(function (l) { return !rs || rs.indexOf(l) < 0; })[0] || labels[0];
      return { t: 'ms', right: rs, wrong: [other] };
    }
    if (q.type === 'or') {
      var found = null; (function perm(a, rest) { if (found) return; if (!rest.length) { if (c(a)) found = a; return; } for (var i = 0; i < rest.length; i++) perm(a.concat(rest[i]), rest.slice(0, i).concat(rest.slice(i + 1))); })([], labels);
      var wrong = found ? found.slice().reverse() : labels; if (found && wrong.join() === found.join()) wrong = found.slice(1).concat(found[0]);
      return { t: 'or', right: found, wrong: wrong };
    }
    var ct = (z.check(q.id, '___never___').correctText || []).map(function (t) { return String(t).replace(/\[\[[a-z]+:(?:[^:\]]*:)?([^\]]*)\]\]/g, '$1'); });
    var good = ct.filter(function (t) { return c(t); })[0];
    return { t: q.type, right: good == null ? ct[0] : good, wrong: 'zzzz' };
  }

  // ================================================================= お休みの画面
  var lockUi = null;
  function fmt(ms) { var s = Math.max(0, Math.ceil(ms / 1000)), m = Math.floor(s / 60); return m + ':' + ('0' + (s % 60)).slice(-2); }
  function showLock() {
    if (lockUi) return;
    var layer = mountOverlay({ kind: 'lock', protect: true, label: T('いまはお休み中'), labelledby: 'sg-lt', dismiss: null, onClose: function () { lockUi = null; resumeGame(); } });
    pauseGame();
    var t = h('p', { class: 'sg-big', id: 'sg-left', role: 'timer', 'aria-live': 'off' });
    var body = h('div', { class: 'sg-bd sg-lock' }, [h('p', { class: 'sg-st', style: 'font-size:14px', text: T('まちがいが続いたので、ゲームを少しお休みします。') }), t]);
    var foot = h('div', { class: 'sg-ft' }, [
      h('a', { class: 'sg-btn sg-btn--p', id: 'sg-tomanabi', href: siteUrl('manabi/') }, T('まなびの工房で勉強する')),
      h('a', { class: 'sg-btn', id: 'sg-tohome', href: siteUrl('') }, T('ホームへ')),
    ]);
    layer.panel.append(h('div', { class: 'sg-hd' }, h('h2', { id: 'sg-lt', text: T('いまはお休み中') })), body, foot);
    lockUi = { layer: layer, t: t };
    updateLock(); focusIn(layer, '#sg-tomanabi');
  }
  function updateLock() {
    if (!lockUi) return;
    var left = eng.lockLeft(); var el = lockUi.t;
    var txt = T('あと {t}', { t: fmt(left) }); if (el.textContent !== txt) el.textContent = txt;
    if (left <= 0) { lockUi.layer.close(); toastMsg(T('お休みが終わりました')); }
  }

  // ---- 小さなお知らせ（画面の下。レイアウトは動かさない）
  function toastMsg(msg) {
    ensureCss();
    var b = h('div', { class: 'sg-bn', role: 'status', style: 'text-align:center' }, msg); doc.body.appendChild(b);
    setTimeout(function () { b.remove(); }, 5000);
  }

  // ================================================================= 見張り（1秒ごと）
  var timer = null, dueSince = 0, started = false;
  function safeMoment() {
    if (versusActive) return false;
    var G = root.KoboGame; if (!G) return true;
    try {
      if (G.paused && G.paused()) return true;
      if (G.isIdle && G.isIdle()) return true;
    } catch (e) {}
    return clock() - dueSince > GRACE_MS;
  }
  function tickUi() {
    var s = eng.settings();
    if (!s.on) { stop(); return; }
    var r = eng.tick();
    if (!r.on) { stop(); if (r.expired) toastMsg(T('テスト期間が終わったので、勉強ガードをオフにしました。')); return; }
    if (!PAGE.game) return;
    if (r.locked) { dueSince = 0; if (quiz) return; /* クイズの終わりの画面を見てから */ if (!lockUi) showLock(); updateLock(); return; }
    if (lockUi) updateLock();
    if (!r.due || quiz || lockUi) { if (!r.due) dueSince = 0; return; }
    if (!visible()) return;
    if (!dueSince) dueSince = clock();
    if (!safeMoment()) return;
    dueSince = 0;
    showQuiz({});
  }
  function start() {
    if (started) return; started = true;
    ensureCss();
    var r = eng.run(); r.last = clock(); eng.saveRun(r); // 読み込み直しの間は数えない
    timer = setInterval(tickUi, 1000);
    doc.addEventListener('visibilitychange', onVis);
    root.addEventListener('storage', function (e) { if (e.key === KEY || e.key === RUN) tickUi(); });
    tickUi();
  }
  function onVis() { var r = eng.run(); r.last = clock(); eng.saveRun(r); tickUi(); }
  function stop() {
    if (!started) return; started = false;
    clearInterval(timer); timer = null; doc.removeEventListener('visibilitychange', onVis);
    if (lockUi) lockUi.layer.close();
    if (quiz) quiz.end('off');
  }
  function refresh() { if (eng.settings().on) start(); else stop(); }

  // ================================================================= 設定の画面
  function seg(label, opts, value, onPick, id) {
    var g = h('div', { class: 'sg-seg', role: 'radiogroup', 'aria-label': label, id: id || null });
    opts.forEach(function (o) {
      g.append(h('button', { class: 'sg-btn', type: 'button', role: 'radio', 'aria-checked': String(o.v === value), 'data-v': String(o.v), onclick: function () {
        Array.prototype.forEach.call(g.children, function (b) { b.setAttribute('aria-checked', String(b === this)); }, this); onPick(o.v);
      } }, o.t));
    });
    // 矢印キーで動かす（ラジオグループの約束）
    g.addEventListener('keydown', function (e) {
      var k = e.key; if (k !== 'ArrowRight' && k !== 'ArrowLeft' && k !== 'ArrowDown' && k !== 'ArrowUp') return;
      var bs = Array.prototype.slice.call(g.children).filter(function (b) { return !b.disabled; }), i = bs.indexOf(doc.activeElement); if (i < 0) return;
      e.preventDefault(); var n = bs[(i + (k === 'ArrowRight' || k === 'ArrowDown' ? 1 : bs.length - 1)) % bs.length]; n.focus(); n.click();
    });
    return g;
  }
  var settingsUi = null, pinTries = 0, pinBlockUntil = 0;
  function openSettings() {
    if (settingsUi) { focusIn(settingsUi.layer); return settingsUi; }
    ensureCss();
    var s = eng.settings(), unlocked = !s.pin;
    var layer = mountOverlay({ kind: 'settings', sheet: true, fix: true, label: T('勉強ガード'), labelledby: 'sg-sett', dismiss: function () { layer.close(); }, onClose: function () { settingsUi = null; } });
    var body = h('div', { class: 'sg-bd', id: 'sg-sbody' });
    var foot = h('div', { class: 'sg-ft' }, h('button', { class: 'sg-btn sg-btn--p', type: 'button', id: 'sg-sclose', onclick: function () { layer.close(); } }, T('とじる')));
    layer.panel.append(h('div', { class: 'sg-hd' }, h('h2', { id: 'sg-sett', text: T('勉強ガード') })), body, foot);
    settingsUi = { layer: layer };
    function save(p) { if (!unlocked && eng.settings().pin) return; var n = eng.patch(p); s = n; refresh(); return n; }
    function draw() {
      s = eng.settings(); var els = [];
      els.push(h('p', { class: 'sg-note', style: 'margin:0 0 12px', text: T('遊んでいる間だけ数えます。この端末の中だけで動き、サイトのデータを消すと設定も消えます。') + ' ' + T('スマホでは、問題の画面で文字のコピーをさせず、画面が隠れたときは黒く隠します。') + T('スクショは完全には防げません') + '。' }));
      if (s.pin && !unlocked) {
        var pin = h('input', { class: 'sg-in', id: 'sg-pinin', type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4', autocomplete: 'off', 'aria-label': T('PIN（4けた）') });
        var msg = h('p', { class: 'sg-msg', id: 'sg-pinmsg', role: 'status' });
        var go = function () {
          if (clock() < pinBlockUntil) { msg.textContent = T('しばらくしてからもう一度'); return; }
          if (checkPin(s, pin.value)) { unlocked = true; pinTries = 0; draw(); focusIn(layer, '#sg-on'); }
          else { pinTries++; msg.textContent = T('PINがちがいます'); pin.value = ''; if (pinTries >= 5) { pinBlockUntil = clock() + 30000; pinTries = 0; } }
        };
        pin.addEventListener('keydown', function (e) { if (e.key === 'Enter') { e.preventDefault(); go(); } });
        els.push(h('div', { class: 'sg-sec' }, [h('span', { class: 'sg-k', text: T('PINを入れると、設定を変えられます') }), h('div', { class: 'sg-row' }, [pin, h('button', { class: 'sg-btn sg-btn--p', type: 'button', id: 'sg-pinok', onclick: go }, T('PINをひらく'))]), msg]));
      }
      var dis = !unlocked;
      var on = h('button', { class: 'sg-sw', type: 'button', role: 'switch', id: 'sg-on', 'aria-checked': String(s.on), disabled: dis ? true : null, onclick: function () {
        var v = !(on.getAttribute('aria-checked') === 'true'); on.setAttribute('aria-checked', String(v)); on.querySelector('.pill').textContent = v ? T('オン') : T('オフ');
        save({ on: v, note: '', ask: { s: v ? 'yes' : s.ask.s || 'no', n: s.ask.n, t: clock() } });
      } }, [h('span', { text: T('勉強ガードをつかう') }), h('span', { class: 'pill', text: s.on ? T('オン') : T('オフ') })]);
      els.push(h('div', { class: 'sg-sec' }, on));
      var secs = [];
      secs.push(sec(T('問題を出す間かく'), seg(T('問題を出す間かく'), MIN_CHOICES.map(function (n) { return { v: n, t: T('{n}分', { n: n }) }; }), s.min, function (v) { save({ min: v }); }, 'sg-min'), T('{n}分ごとに、ゲームのページで遊んだ時間を数えます（ページを閉じていた時間や、ほかのタブを見ていた時間は数えません）。', { n: s.min })));
      secs.push(sec(T('1回の問題数'), seg(T('1回の問題数'), [1, 2, 3, 4, 5].map(function (n) { return { v: n, t: T('{n}問', { n: n }) }; }), s.q, function (v) { save({ q: v }); }, 'sg-q')));
      var lvBox = h('div', { class: 'sg-grid' }, LEVELS.map(function (l) { return chk(T(l === 'JH' ? '中学' : '高校'), s.lv.indexOf(l) >= 0, 'sg-lv-' + l, function (c, cb) { var cur = eng.settings().lv.slice(); var n = c ? cur.concat(l) : cur.filter(function (x) { return x !== l; }); if (!n.length) { cb.checked = true; return; } save({ lv: n }); }); }));
      secs.push(sec(T('学校'), lvBox));
      var NAMES = { english: '英語', math: '数学', japanese: '国語', science: '理科', social: '社会', information: '情報' };
      var cur = s.sub.length ? s.sub : SUBJECTS.slice();
      var subBox = h('div', { class: 'sg-grid', role: 'group', 'aria-label': T('教科') }, SUBJECTS.map(function (k) { return chk(T(NAMES[k]), cur.indexOf(k) >= 0, 'sg-sub-' + k, function (c, cb) { var cs = eng.settings(); var now = (cs.sub.length ? cs.sub : SUBJECTS.slice()); var n = c ? now.concat(k) : now.filter(function (x) { return x !== k; }); if (!n.length) { cb.checked = true; return; } save({ sub: n }); }); }));
      secs.push(sec(T('教科'), subBox, T('すべての教科')));
      secs.push(sec(T('まちがえたときに増える問題'), seg(T('まちがえたときに増える問題'), EX_CHOICES.map(function (n) { return { v: n, t: T('{n}問ずつ', { n: n }) }; }), s.ex, function (v) { save({ ex: v }); }, 'sg-ex'), T('まちがえるたびに、正解しないといけない問題が増えます（いちばん多くて10問ぶん）。')));
      secs.push(sec(T('お休みになる、まちがいの数'), seg(T('お休みになる、まちがいの数'), THR_CHOICES.map(function (n) { return { v: n, t: n ? T('{n}回', { n: n }) : T('お休みなし') }; }), s.thr, function (v) { save({ thr: v }); }, 'sg-thr')));
      secs.push(sec(T('まちがいを数える時間'), seg(T('まちがいを数える時間'), WIN_CHOICES.map(function (n) { return { v: n, t: T('{n}分', { n: n }) }; }), s.win, function (v) { save({ win: v }); }, 'sg-win')));
      secs.push(sec(T('お休みの長さ'), seg(T('お休みの長さ'), LOCK_CHOICES.map(function (n) { return { v: n, t: T('{n}分', { n: n }) }; }), s.lock, function (v) { save({ lock: v }); }, 'sg-lock')));
      // テスト期間
      var du = h('input', { class: 'sg-in', id: 'sg-until', type: 'date', 'aria-label': T('テスト期間（この日までオン）'), value: s.until ? String(s.until).replace(/^(\d{4})(\d{2})(\d{2})$/, '$1-$2-$3') : '' });
      var ul = h('small', { id: 'sg-untillab', text: untilText(s.until) });
      du.addEventListener('change', function () { var k = validDateKey(du.value.replace(/-/g, '')); save({ until: k }); ul.textContent = untilText(k); });
      secs.push(sec(T('テスト期間（この日までオン）'), h('div', { class: 'sg-row' }, [du, h('button', { class: 'sg-btn sg-btn--g', type: 'button', id: 'sg-uclear', onclick: function () { du.value = ''; save({ until: 0 }); ul.textContent = untilText(0); } }, T('日づけをけす'))]), null, ul));
      // PIN
      var p1 = h('input', { class: 'sg-in', id: 'sg-pin1', type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4', autocomplete: 'new-password', 'aria-label': T('新しいPIN'), placeholder: T('新しいPIN') });
      var p2 = h('input', { class: 'sg-in', id: 'sg-pin2', type: 'password', inputmode: 'numeric', pattern: '[0-9]*', maxlength: '4', autocomplete: 'new-password', 'aria-label': T('もう一度'), placeholder: T('もう一度') });
      var pm = h('p', { class: 'sg-msg', id: 'sg-pinset-msg', role: 'status', text: s.pin ? T('PINがあります') : T('PINはありません') });
      var setBtn = h('button', { class: 'sg-btn sg-btn--p', type: 'button', id: 'sg-pinset', onclick: function () {
        if (!validPin(p1.value) || p1.value !== p2.value) { pm.textContent = T('4けたの数字を2回入れてください'); return; }
        save({ pin: makePin(p1.value) }); p1.value = p2.value = ''; pm.textContent = T('PINをきめました');
      } }, T('PINをきめる'));
      var rmBtn = s.pin ? h('button', { class: 'sg-btn sg-btn--g', type: 'button', id: 'sg-pinrm', onclick: function () { save({ pin: null }); pm.textContent = T('PINをなくしました'); rmBtn.hidden = true; } }, T('PINをなくす')) : null;
      secs.push(sec(T('PIN（4けた）'), h('div', null, [h('div', { class: 'sg-row' }, [p1, p2]), h('div', { class: 'sg-row', style: 'margin-top:8px' }, [setBtn, rmBtn]), pm]), T('PINは「うっかり防止」です。データはこの端末の中にあるので、サイトのデータを消されたら止められません。')));
      // ためす
      secs.push(h('div', { class: 'sg-sec' }, [h('button', { class: 'sg-btn', type: 'button', id: 'sg-try', onclick: function () { if (quiz) return; layer.close(); showQuiz({ trial: true }); } }, T('ためしに問題を出す')), h('small', { text: T('（ためしでは、まちがえてもお休みにはなりません）') })]));
      secs.forEach(function (x) { Array.prototype.forEach.call(x.querySelectorAll('button,input'), function (c) { if (dis) c.disabled = true; }); });
      els = els.concat(secs);
      body.replaceChildren.apply(body, els);
    }
    function sec(label, ctl, note, extra) { return h('div', { class: 'sg-sec' }, [h('span', { class: 'sg-k', text: label }), ctl, note ? h('small', { text: note }) : null, extra || null]); }
    function chk(label, checked, id, f) { var cb = h('input', { type: 'checkbox', id: id }); cb.checked = checked; cb.addEventListener('change', function () { f(cb.checked, cb); }); return h('label', { class: 'sg-chk' }, [cb, h('span', { text: label })]); }
    function untilText(k) { var u = untilLabel(k); return u ? T('テスト期間：{m}月{d}日まで', u) + '。' + T('決めた日の次の日に、自動でオフになります。') : T('決めた日の次の日に、自動でオフになります。'); }
    draw(); focusIn(layer, s.pin && !unlocked ? '#sg-pinin' : '#sg-on');
    return settingsUi;
  }

  // ================================================================= 「使いますか？」のお知らせ（ハブだけ。はじめの1回）
  function maybeAsk() {
    var s = eng.settings();
    if (!PAGE.hub || !shouldAsk(s, clock())) return;
    ensureCss();
    var done = false;
    var ans = function (v) { if (done) return; done = true; bn.remove(); var n = eng.settings(); n.ask = { s: v, n: (n.ask.n || 0) + (v === 'later' ? 1 : 0), t: clock() }; if (v === 'yes') n.on = true; eng.saveSettings(n); if (v === 'yes') { refresh(); openSettings(); } };
    var bn = h('div', { class: 'sg-bn', role: 'dialog', 'aria-labelledby': 'sg-asktitle', 'aria-describedby': 'sg-askp', id: 'sg-ask' }, [
      h('h2', { id: 'sg-asktitle', text: T('勉強ガードを使いますか？') }),
      h('p', { id: 'sg-askp', text: T('遊んでいる間、ときどき中学・高校の問題が出ます。まちがえると問題が増え、何度もまちがえるとゲームが少しお休みになります。') }),
      h('div', { class: 'btns' }, [
        h('button', { class: 'sg-btn sg-btn--p', type: 'button', id: 'sg-ask-yes', onclick: function () { ans('yes'); } }, T('はい')),
        h('button', { class: 'sg-btn', type: 'button', id: 'sg-ask-later', onclick: function () { ans('later'); } }, T('あとで')),
        h('button', { class: 'sg-btn sg-btn--g', type: 'button', id: 'sg-ask-no', onclick: function () { ans('no'); } }, T('いいえ')),
      ]),
    ]);
    bn.addEventListener('keydown', function (e) { if (e.key === 'Escape') ans('later'); });
    doc.body.appendChild(bn);
  }

  // ================================================================= 公開
  var KoboStudyGuard = {
    core: core, open: openSettings, settings: function () { return eng.settings(); }, enabled: function () { return eng.settings().on; },
    refresh: refresh, showQuiz: showQuiz,
  };
  root.KoboStudyGuard = KoboStudyGuard;
  if (root.__sgReady) { try { root.__sgReady(KoboStudyGuard); } catch (e) {} }

  if (DEBUG) {
    root.__sg = {
      core: core, engine: eng, clock: clock,
      // 時計を進める（その間も遊んでいたことにして、たまった時間を足す）。複数ページにまたがるので localStorage に置く
      advance: function (ms) {
        var s = eng.settings(); var r = eng.run(); var t0 = clock();
        try { root.localStorage.setItem(SKEW, String(skew() + ms)); } catch (e) {}
        if (s.on && !(r.lockUntil > t0) && PAGE.game && visible()) { r.acc += ms; }
        r.last = clock(); eng.saveRun(r); tickUi(); return eng.run();
      },
      tick: tickUi, run: function () { return eng.run(); }, settings: function () { return eng.settings(); },
      quiz: function () { return quiz ? quiz.state() : null; }, peek: function () { return quiz ? quiz.peek() : null; },
      locked: function () { return !!lockUi; }, lockLeft: function () { return eng.lockLeft(); },
      overlays: function () { return overlays.length; },
      prot: function () { var t = overlays[overlays.length - 1]; return t && t.prot ? t.prot.state() : null; }, touch: touchDevice,
      simulate: function (on, why) { var t = overlays[overlays.length - 1]; if (t && t.prot) t.prot.simulate(on, why); },
    };
  }

  // 起動：オンなら見張りを始める。ハブでは、まだ聞いていなければ聞く
  function boot() {
    var s = eng.settings();
    if (s.on) start();
    if (s.note === 'until') { toastMsg(T('テスト期間が終わったので、勉強ガードをオフにしました。')); eng.patch({ note: '' }); }
    maybeAsk();
  }
  if (doc.readyState === 'loading') doc.addEventListener('DOMContentLoaded', boot); else boot();
})(typeof globalThis !== 'undefined' ? globalThis : typeof self !== 'undefined' ? self : this);
